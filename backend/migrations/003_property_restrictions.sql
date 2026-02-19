-- Migration: 003_property_restrictions.sql
-- Description: Create property_restrictions table for heritage sites and landowner policies
-- Date: 2026-02-18
-- Feature: User Story 1 - Heritage Site Advisory Layers

-- ============================================================================
-- TABLE: property_restrictions (NEW)
-- ============================================================================

CREATE TABLE property_restrictions (
  property_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_name VARCHAR(255) NOT NULL,
  managing_organization VARCHAR(100) NOT NULL,
  geometry GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,
  policy_text TEXT CHECK (LENGTH(policy_text) <= 5000),
  contact_info VARCHAR(500),
  policy_effective_date DATE,
  data_source_id UUID REFERENCES data_sources(source_id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT valid_property_geometry CHECK (ST_IsValid(geometry))
);

-- Spatial index with optimized fillfactor for bulk inserts + queries
CREATE INDEX idx_property_restrictions_geom 
  ON property_restrictions USING GIST (geometry) WITH (fillfactor=90);

-- Index for organization lookups
CREATE INDEX idx_property_restrictions_org 
  ON property_restrictions(managing_organization);

-- Index for data source tracking
CREATE INDEX idx_property_restrictions_source 
  ON property_restrictions(data_source_id) 
  WHERE data_source_id IS NOT NULL;

COMMENT ON TABLE property_restrictions IS 'Heritage sites and property-based drone restrictions (advisory, not legal)';
COMMENT ON COLUMN property_restrictions.property_name IS 'Name of heritage site or property (e.g., "Stonehenge")';
COMMENT ON COLUMN property_restrictions.managing_organization IS 'Organization managing the property (e.g., "English Heritage Trust")';
COMMENT ON COLUMN property_restrictions.geometry IS 'Property boundary as MultiPolygon EPSG:4326';
COMMENT ON COLUMN property_restrictions.policy_text IS 'Full drone policy text, max 5000 characters';
COMMENT ON COLUMN property_restrictions.contact_info IS 'Contact details for permission requests';
COMMENT ON COLUMN property_restrictions.policy_effective_date IS 'Date the policy became effective';

-- ============================================================================
-- Extend data_sources for heritage site data types
-- ============================================================================

-- Insert data sources for heritage site import scripts
INSERT INTO data_sources (
  authority_name,
  data_type_provided,
  reliability_level,
  data_url,
  license,
  attribution
) VALUES
(
  'Historic England',
  ARRAY['heritage-site', 'property-restriction'],
  'primary-authority',
  'https://historicengland.org.uk/listing/the-list/',
  'Open Government Licence v3.0',
  'Contains Historic England data © Historic England'
),
(
  'National Trust',
  ARRAY['heritage-site', 'property-restriction'],
  'official-secondary',
  'https://www.nationaltrust.org.uk/',
  'Open Government Licence v3.0',
  'Contains National Trust data © The National Trust'
)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE property_restrictions IS 'Stores heritage site boundaries and drone policies from Historic England and National Trust. Used for tri-state location check: airspace clear + property restriction = check-property-restrictions status';
