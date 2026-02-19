-- Migration: 001b_fix_data_sources_schema.sql
-- Description: Fix data_sources table schema to match DataSource model expectations
-- Date: 2026-02-18
-- Reason: Schema drift - model expects different column names than migration created

-- Rename columns to match model
ALTER TABLE data_sources 
  RENAME COLUMN data_type TO data_type_old;

ALTER TABLE data_sources 
  RENAME COLUMN last_update TO last_sync_timestamp;

ALTER TABLE data_sources 
  RENAME COLUMN update_frequency TO sync_frequency;

ALTER TABLE data_sources 
  RENAME COLUMN confidence_level TO reliability_level_old;

ALTER TABLE data_sources 
  RENAME COLUMN api_endpoint TO data_url;

ALTER TABLE data_sources 
  RENAME COLUMN license_info TO license;

-- Add new columns that model expects
ALTER TABLE data_sources
  ADD COLUMN data_type_provided TEXT[] DEFAULT '{}';

ALTER TABLE data_sources
  ADD COLUMN attribution TEXT DEFAULT '';

ALTER TABLE data_sources
  ADD COLUMN contact_email VARCHAR(255);

-- Create new reliability_level column with model's expected values
CREATE TYPE reliability_level_enum AS ENUM (
  'primary-authority',
  'official-secondary',
  'community',
  'unverified'
);

ALTER TABLE data_sources
  ADD COLUMN reliability_level reliability_level_enum DEFAULT 'unverified';

-- Migrate data from old reliability column to new one
UPDATE data_sources
SET reliability_level = CASE 
  WHEN reliability_level_old = 'primary-authority' THEN 'primary-authority'::reliability_level_enum
  WHEN reliability_level_old = 'secondary-source' THEN 'official-secondary'::reliability_level_enum
  WHEN reliability_level_old = 'unverified' THEN 'unverified'::reliability_level_enum
  ELSE 'unverified'::reliability_level_enum
END;

-- Migrate single data_type to array
UPDATE data_sources
SET data_type_provided = ARRAY[data_type_old]
WHERE data_type_old IS NOT NULL;

-- Drop old columns
ALTER TABLE data_sources 
  DROP COLUMN reliability_level_old;

ALTER TABLE data_sources 
  DROP COLUMN data_type_old;

-- Drop old enum type
DROP TYPE IF EXISTS confidence_level_enum;

-- Update indexes to match new column names
DROP INDEX IF EXISTS idx_data_sources_confidence;
CREATE INDEX idx_data_sources_reliability ON data_sources(reliability_level);

-- Add comment
COMMENT ON COLUMN data_sources.data_type_provided IS 'Array of data types this source provides (e.g., airspace, heritage-site, toal)';
COMMENT ON COLUMN data_sources.reliability_level IS 'Reliability classification of this data source';
