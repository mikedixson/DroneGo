-- Migration: 007_property_restrictions_extended.sql
-- Description: Add simplified geometries and deduplication fields
-- Date: 2026-02-19
-- Feature: fix-heritage-site-imports
-- NOTE: restriction_category already added in migration 004_add_restriction_category.sql

-- Add simplified geometry columns for performance optimization
ALTER TABLE property_restrictions 
ADD COLUMN geometry_simplified_low GEOMETRY(MULTIPOLYGON, 4326),
ADD COLUMN geometry_simplified_medium GEOMETRY(MULTIPOLYGON, 4326),
ADD COLUMN superseded_by UUID REFERENCES property_restrictions(property_id) ON DELETE SET NULL,
ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT true;

-- Rename primary key column for consistency
ALTER TABLE property_restrictions 
RENAME COLUMN property_id TO property_restriction_id;

-- Spatial indexes for simplified geometries
CREATE INDEX idx_property_restrictions_geom_low 
  ON property_restrictions USING GIST (geometry_simplified_low) 
  WITH (fillfactor=90)
  WHERE geometry_simplified_low IS NOT NULL;

CREATE INDEX idx_property_restrictions_geom_medium 
  ON property_restrictions USING GIST (geometry_simplified_medium) 
  WITH (fillfactor=90)
  WHERE geometry_simplified_medium IS NOT NULL;

-- Index for deduplication queries
CREATE INDEX idx_property_restrictions_superseded 
  ON property_restrictions(superseded_by) 
  WHERE superseded_by IS NOT NULL;

CREATE INDEX idx_property_restrictions_primary 
  ON property_restrictions(is_primary) 
  WHERE is_primary = true;

-- Fuzzy string matching index for duplicate detection (requires pg_trgm extension)
CREATE INDEX idx_property_name_trgm 
  ON property_restrictions USING GIN (property_name gin_trgm_ops);

-- Update comments
COMMENT ON COLUMN property_restrictions.geometry_simplified_low IS 'Simplified boundary for zoom <13, ST_Simplify tolerance 0.0001°';
COMMENT ON COLUMN property_restrictions.geometry_simplified_medium IS 'Simplified boundary for zoom 13-15, ST_Simplify tolerance 0.00005°';
COMMENT ON COLUMN property_restrictions.superseded_by IS 'Foreign key to preferred record when duplicates detected';
COMMENT ON COLUMN property_restrictions.is_primary IS 'True for preferred record in duplicate set, false for superseded duplicates';
