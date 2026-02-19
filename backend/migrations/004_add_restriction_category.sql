-- Migration: 004_add_restriction_category.sql
-- Description: Add category field to distinguish SSSI from general property restrictions
-- Date: 2026-02-19
-- Feature: User Story 1 - Separate SSSI and National Trust overlays

-- Add restriction_category column
ALTER TABLE property_restrictions 
ADD COLUMN restriction_category VARCHAR(50) DEFAULT 'HERITAGE_SITE';

-- Add constraint for valid categories
ALTER TABLE property_restrictions
ADD CONSTRAINT valid_restriction_category 
CHECK (restriction_category IN ('HERITAGE_SITE', 'SSSI', 'CONSERVATION_AREA', 'WILDLIFE_RESERVE'));

-- Create index for category filtering
CREATE INDEX idx_property_restrictions_category 
ON property_restrictions(restriction_category);

COMMENT ON COLUMN property_restrictions.restriction_category IS 'Type of restriction: HERITAGE_SITE (advisory), SSSI (legally protected), CONSERVATION_AREA, WILDLIFE_RESERVE';

-- Update existing records (all existing are heritage sites)
UPDATE property_restrictions 
SET restriction_category = 'HERITAGE_SITE' 
WHERE restriction_category IS NULL;
