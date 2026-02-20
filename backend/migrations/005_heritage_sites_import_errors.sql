-- Migration: 005_heritage_sites_import_errors.sql
-- Description: Create quarantine table for invalid import data
-- Date: 2026-02-19
-- Feature: fix-heritage-site-imports

CREATE TABLE heritage_sites_import_errors (
  error_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_record_id TEXT NOT NULL,  -- Identifier from external API (e.g., OBJECTID)
  data_source_id UUID NOT NULL REFERENCES data_sources(source_id) ON DELETE CASCADE,
  error_type VARCHAR(50) NOT NULL CHECK (error_type IN (
    'topology_invalid',
    'bounds_invalid',
    'parse_failure',
    'api_error',
    'missing_required_field'
  )),
  raw_geometry_text TEXT,  -- GeoJSON or WKT for debugging
  raw_properties_json JSONB,  -- Full feature properties from API
  error_details TEXT NOT NULL,  -- Detailed error message
  quarantine_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMP,
  resolution_notes TEXT,
  
  CONSTRAINT valid_resolution_timestamp CHECK (
    (resolved = false AND resolved_at IS NULL) OR 
    (resolved = true AND resolved_at IS NOT NULL)
  )
);

-- Index for error analysis queries
CREATE INDEX idx_import_errors_source 
  ON heritage_sites_import_errors(data_source_id);

CREATE INDEX idx_import_errors_type 
  ON heritage_sites_import_errors(error_type);

CREATE INDEX idx_import_errors_unresolved 
  ON heritage_sites_import_errors(resolved) 
  WHERE resolved = false;

CREATE INDEX idx_import_errors_timestamp 
  ON heritage_sites_import_errors(quarantine_timestamp DESC);

COMMENT ON TABLE heritage_sites_import_errors IS 'Quarantine for geometries and records failing validation during heritage site imports';
COMMENT ON COLUMN heritage_sites_import_errors.source_record_id IS 'Original identifier from external API (e.g., OBJECTID, GlobalID)';
COMMENT ON COLUMN heritage_sites_import_errors.error_type IS 'Classification of validation failure for analytics';
COMMENT ON COLUMN heritage_sites_import_errors.raw_geometry_text IS 'Original geometry as GeoJSON or WKT for manual correction';
COMMENT ON COLUMN heritage_sites_import_errors.raw_properties_json IS 'Complete feature properties from API response for context';
COMMENT ON COLUMN heritage_sites_import_errors.error_details IS 'Full error message including ST_IsValidReason output if topology_invalid';
