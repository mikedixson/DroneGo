-- Migration: 001_initial_schema.sql
-- Description: Create initial database schema for DroneGo Flight Zone Map
-- Date: 2026-02-17
-- Database: PostgreSQL 15 + PostGIS 3.x

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- ENUMS (T012)
-- ============================================================================

-- Zone type classification
CREATE TYPE zone_type_enum AS ENUM (
  'no-fly',
  'controlled-airspace',
  'military-zone',
  'temporary-restriction',
  'airport-frz',
  'danger-area'
);

-- Data confidence level
CREATE TYPE confidence_level_enum AS ENUM (
  'primary-authority',
  'secondary-source',
  'unverified'
);

-- TOAL site access type
CREATE TYPE access_type_enum AS ENUM (
  'public',
  'private',
  'permit-required',
  'club-only'
);

-- TOAL site surface type
CREATE TYPE surface_type_enum AS ENUM (
  'grass',
  'concrete',
  'asphalt',
  'gravel',
  'mixed',
  'unknown'
);

-- Airspace class designation (ICAO)
CREATE TYPE airspace_class_enum AS ENUM (
  'A', 'B', 'C', 'D', 'E', 'F', 'G'
);

-- ============================================================================
-- TABLE: data_sources (T013)
-- ============================================================================

CREATE TABLE data_sources (
  source_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_name VARCHAR(255) NOT NULL,
  data_type VARCHAR(100) NOT NULL,
  last_update TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_frequency VARCHAR(50),
  confidence_level confidence_level_enum NOT NULL DEFAULT 'secondary-source',
  api_endpoint TEXT,
  license_info TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT unique_authority_type UNIQUE(authority_name, data_type)
);

CREATE INDEX idx_data_sources_authority ON data_sources(authority_name);
CREATE INDEX idx_data_sources_confidence ON data_sources(confidence_level);

COMMENT ON TABLE data_sources IS 'Authoritative sources for restriction and airspace data';

-- ============================================================================
-- TABLE: restriction_zones (T014)
-- ============================================================================

CREATE TABLE restriction_zones (
  zone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_type zone_type_enum NOT NULL,
  geometry GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,
  restriction_name VARCHAR(255) NOT NULL,
  authority_source VARCHAR(255) NOT NULL,
  altitude_floor INTEGER,
  altitude_ceiling INTEGER,
  effective_start TIMESTAMP,
  effective_end TIMESTAMP,
  description TEXT,
  authorization_possible BOOLEAN DEFAULT false,
  authorization_contact VARCHAR(255),
  confidence_level confidence_level_enum NOT NULL DEFAULT 'secondary-source',
  data_source_id UUID NOT NULL REFERENCES data_sources(source_id) ON DELETE CASCADE,
  last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT valid_altitude_range CHECK (
    altitude_ceiling IS NULL OR altitude_floor IS NULL OR altitude_ceiling >= altitude_floor
  ),
  CONSTRAINT valid_effective_dates CHECK (
    effective_end IS NULL OR effective_start IS NULL OR effective_end >= effective_start
  ),
  CONSTRAINT valid_geometry CHECK (ST_IsValid(geometry))
);

CREATE INDEX idx_restriction_zones_type ON restriction_zones(zone_type);
CREATE INDEX idx_restriction_zones_effective ON restriction_zones(effective_start, effective_end);
CREATE INDEX idx_restriction_zones_confidence ON restriction_zones(confidence_level, authority_source);

COMMENT ON TABLE restriction_zones IS 'Geographic areas with drone flying restrictions';
COMMENT ON COLUMN restriction_zones.altitude_floor IS 'Minimum altitude in feet AGL, NULL = ground level';
COMMENT ON COLUMN restriction_zones.altitude_ceiling IS 'Maximum altitude in feet AGL, NULL = unlimited';

-- ============================================================================
-- TABLE: toal_sites (T015)
-- ============================================================================

CREATE TABLE toal_sites (
  site_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_name VARCHAR(255) NOT NULL,
  geometry GEOMETRY(POINT, 4326) NOT NULL,
  access_type access_type_enum NOT NULL DEFAULT 'public',
  surface_type surface_type_enum,
  facilities JSONB DEFAULT '{}'::jsonb,
  operating_hours VARCHAR(100),
  restrictions TEXT,
  contact_info VARCHAR(255),
  verified BOOLEAN DEFAULT false,
  data_source VARCHAR(255) NOT NULL,
  last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT valid_point_geometry CHECK (ST_GeometryType(geometry) = 'ST_Point')
);

CREATE INDEX idx_toal_sites_access ON toal_sites(access_type);
CREATE INDEX idx_toal_sites_verified ON toal_sites(verified);

COMMENT ON TABLE toal_sites IS 'Official and suitable Take Off and Landing locations';

-- ============================================================================
-- TABLE: airspace_classifications (T016)
-- ============================================================================

CREATE TABLE airspace_classifications (
  airspace_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_designation airspace_class_enum NOT NULL,
  geometry GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,
  airspace_name VARCHAR(255) NOT NULL,
  altitude_floor INTEGER NOT NULL,
  altitude_ceiling INTEGER NOT NULL,
  controlling_authority VARCHAR(255) NOT NULL,
  rules_description TEXT,
  uas_authorization_required BOOLEAN DEFAULT true,
  authorization_process TEXT,
  data_source_id UUID NOT NULL REFERENCES data_sources(source_id) ON DELETE CASCADE,
  last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT valid_altitude_range_airspace CHECK (altitude_ceiling > altitude_floor),
  CONSTRAINT valid_airspace_geometry CHECK (ST_IsValid(geometry))
);

CREATE INDEX idx_airspace_class ON airspace_classifications(class_designation);
CREATE INDEX idx_airspace_altitude ON airspace_classifications(altitude_floor, altitude_ceiling);

COMMENT ON TABLE airspace_classifications IS 'ICAO airspace classes A-G with UAS rules';
COMMENT ON COLUMN airspace_classifications.altitude_floor IS 'Lower limit in feet AMSL';
COMMENT ON COLUMN airspace_classifications.altitude_ceiling IS 'Upper limit in feet AMSL';

-- ============================================================================
-- TABLE: temporary_restrictions (T017)
-- ============================================================================

CREATE TABLE temporary_restrictions (
  notam_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notam_identifier VARCHAR(50) NOT NULL UNIQUE,
  issuing_authority VARCHAR(255) NOT NULL,
  geometry GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,
  effective_start TIMESTAMP NOT NULL,
  effective_end TIMESTAMP NOT NULL,
  restriction_reason TEXT NOT NULL,
  altitude_floor INTEGER,
  altitude_ceiling INTEGER,
  description TEXT,
  data_source_id UUID NOT NULL REFERENCES data_sources(source_id) ON DELETE CASCADE,
  last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT valid_notam_dates CHECK (effective_end > effective_start),
  CONSTRAINT valid_notam_altitude CHECK (
    altitude_ceiling IS NULL OR altitude_floor IS NULL OR altitude_ceiling >= altitude_floor
  ),
  CONSTRAINT valid_notam_geometry CHECK (ST_IsValid(geometry))
);

CREATE INDEX idx_temporary_restrictions_effective ON temporary_restrictions(effective_start, effective_end);
CREATE INDEX idx_temporary_restrictions_identifier ON temporary_restrictions(notam_identifier);

COMMENT ON TABLE temporary_restrictions IS 'Temporary flight restrictions (NOTAMs)';

-- ============================================================================
-- VIEW: active_restrictions (T018)
-- ============================================================================

CREATE VIEW active_restrictions AS
SELECT 
  zone_id AS restriction_id,
  zone_type AS restriction_type,
  geometry,
  restriction_name AS name,
  authority_source,
  altitude_floor,
  altitude_ceiling,
  effective_start,
  effective_end,
  description,
  authorization_possible,
  confidence_level,
  false AS is_temporary,
  data_source_id,
  last_updated
FROM restriction_zones
WHERE 
  (effective_start IS NULL OR effective_start <= CURRENT_TIMESTAMP)
  AND (effective_end IS NULL OR effective_end >= CURRENT_TIMESTAMP)

UNION ALL

SELECT 
  notam_id AS restriction_id,
  'temporary-restriction'::zone_type_enum AS restriction_type,
  geometry,
  notam_identifier AS name,
  issuing_authority AS authority_source,
  altitude_floor,
  altitude_ceiling,
  effective_start,
  effective_end,
  restriction_reason AS description,
  false AS authorization_possible,
  'primary-authority'::confidence_level_enum AS confidence_level,
  true AS is_temporary,
  data_source_id,
  last_updated
FROM temporary_restrictions
WHERE 
  effective_start <= CURRENT_TIMESTAMP
  AND effective_end >= CURRENT_TIMESTAMP;

COMMENT ON VIEW active_restrictions IS 'Combined view of active permanent and temporary restrictions';

-- ============================================================================
-- SPATIAL INDEXES (T019-B)
-- ============================================================================

CREATE INDEX idx_restriction_zones_geom ON restriction_zones USING GIST (geometry);
CREATE INDEX idx_toal_sites_geom ON toal_sites USING GIST (geometry);
CREATE INDEX idx_airspace_geom ON airspace_classifications USING GIST (geometry);
CREATE INDEX idx_temporary_restrictions_geom ON temporary_restrictions USING GIST (geometry);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Record migration version
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_migrations (version) VALUES (1);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Migration 001_initial_schema.sql completed successfully';
  RAISE NOTICE 'PostGIS extension: enabled';
  RAISE NOTICE 'Tables created: 5 (data_sources, restriction_zones, toal_sites, airspace_classifications, temporary_restrictions)';
  RAISE NOTICE 'Views created: 1 (active_restrictions)';
  RAISE NOTICE 'Spatial indexes: 4 (GIST on all geometry columns)';
END $$;
