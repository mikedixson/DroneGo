-- Migration: 000_enable_extensions.sql
-- Description: Enable required PostgreSQL extensions for heritage site imports
-- Date: 2026-02-19
-- Feature: fix-heritage-site-imports

-- Enable PostGIS extension for spatial data types and functions
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enable pg_trgm extension for fuzzy string matching (duplicate detection)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Verify extensions are installed
COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';
COMMENT ON EXTENSION pg_trgm IS 'Trigram text similarity matching for duplicate detection';
