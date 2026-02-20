# Data Model: Heritage Site Import and Display

**Feature**: fix-heritage-site-imports  
**Date**: 2026-02-19  
**Parent Feature**: [001-flight-zone-map](../001-flight-zone-map/data-model.md)

## Overview

This document defines the database schema extensions required for production-grade heritage site import processes. It builds upon the existing `property_restrictions` table (Migration 003) by adding simplified geometry columns, quarantine table for invalid data, and data source health tracking fields.

## Schema Changes

### 1. Extend `property_restrictions` Table

**Purpose**: Add multi-resolution geometries and deduplication tracking to existing heritage site storage.

```sql
-- Migration: 004_property_restrictions_extended.sql
-- Description: Add simplified geometries and deduplication fields
-- Date: 2026-02-19
-- Feature: fix-heritage-site-imports

-- Add simplified geometry columns for performance optimization
ALTER TABLE property_restrictions 
ADD COLUMN geometry_simplified_low GEOMETRY(MULTIPOLYGON, 4326),
ADD COLUMN geometry_simplified_medium GEOMETRY(MULTIPOLYGON, 4326),
ADD COLUMN superseded_by UUID REFERENCES property_restrictions(property_id) ON DELETE SET NULL,
ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN restriction_category VARCHAR(50) CHECK (restriction_category IN ('HERITAGE_SITE', 'SSSI'));

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
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_property_name_trgm 
  ON property_restrictions USING GIN (property_name gin_trgm_ops);

-- Update comments
COMMENT ON COLUMN property_restrictions.geometry_simplified_low IS 'Simplified boundary for zoom <13, ST_Simplify tolerance 0.0001°';
COMMENT ON COLUMN property_restrictions.geometry_simplified_medium IS 'Simplified boundary for zoom 13-15, ST_Simplify tolerance 0.00005°';
COMMENT ON COLUMN property_restrictions.superseded_by IS 'Foreign key to preferred record when duplicates detected';
COMMENT ON COLUMN property_restrictions.is_primary IS 'True for preferred record in duplicate set, false for superseded duplicates';
COMMENT ON COLUMN property_restrictions.restriction_category IS 'Type of restriction: HERITAGE_SITE or SSSI (Site of Special Scientific Interest)';
```

**Updated Schema**:
```sql
property_restrictions (
  property_restriction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_name VARCHAR(255) NOT NULL,
  managing_organization VARCHAR(100) NOT NULL,
  geometry GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,  -- Full precision original
  geometry_simplified_low GEOMETRY(MULTIPOLYGON, 4326),  -- For zoom <13
  geometry_simplified_medium GEOMETRY(MULTIPOLYGON, 4326),  -- For zoom 13-15
  policy_text TEXT CHECK (LENGTH(policy_text) <= 5000),
  contact_info VARCHAR(500),
  policy_effective_date DATE,
  restriction_category VARCHAR(50) CHECK (restriction_category IN ('HERITAGE_SITE', 'SSSI')),
  data_source_id UUID REFERENCES data_sources(source_id) ON DELETE SET NULL,
  superseded_by UUID REFERENCES property_restrictions(property_restriction_id) ON DELETE SET NULL,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT valid_property_geometry CHECK (ST_IsValid(geometry))
)
```

---

### 2. Create `heritage_sites_import_errors` Quarantine Table

**Purpose**: Store geometries and records that fail validation during import for manual review and debugging.

```sql
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
```

---

### 3. Extend `data_sources` Table for Health Tracking

**Purpose**: Add operational monitoring fields to track import success rates and failures.

```sql
-- Migration: 006_data_sources_health_tracking.sql
-- Description: Add health monitoring fields for data source reliability
-- Date: 2026-02-19
-- Feature: fix-heritage-site-imports

ALTER TABLE data_sources
ADD COLUMN health_status VARCHAR(20) CHECK (health_status IN ('healthy', 'unhealthy', 'unknown')) DEFAULT 'unknown',
ADD COLUMN last_import_attempt TIMESTAMP,
ADD COLUMN last_successful_import TIMESTAMP,
ADD COLUMN last_error_timestamp TIMESTAMP,
ADD COLUMN last_error_message TEXT,
ADD COLUMN consecutive_failure_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN success_count_7day INTEGER NOT NULL DEFAULT 0,
ADD COLUMN failure_count_7day INTEGER NOT NULL DEFAULT 0;

-- Computed column for success rate (updated via trigger or application logic)
ALTER TABLE data_sources
ADD COLUMN success_rate_7day DECIMAL(5,2) GENERATED ALWAYS AS (
  CASE 
    WHEN (success_count_7day + failure_count_7day) = 0 THEN NULL
    ELSE ROUND((success_count_7day::decimal / (success_count_7day + failure_count_7day)) * 100, 2)
  END
) STORED;

-- Index for health monitoring queries
CREATE INDEX idx_data_sources_health 
  ON data_sources(health_status) 
  WHERE health_status = 'unhealthy';

CREATE INDEX idx_data_sources_last_import 
  ON data_sources(last_import_attempt DESC);

COMMENT ON COLUMN data_sources.health_status IS 'Current health: healthy (recent success), unhealthy (recent failures), unknown (not yet attempted)';
COMMENT ON COLUMN data_sources.last_import_attempt IS 'Timestamp of most recent import attempt (success or failure)';
COMMENT ON COLUMN data_sources.last_successful_import IS 'Timestamp of most recent successful import';
COMMENT ON COLUMN data_sources.last_error_timestamp IS 'Timestamp of most recent import error';
COMMENT ON COLUMN data_sources.last_error_message IS 'Error message from most recent failure for operational debugging';
COMMENT ON COLUMN data_sources.consecutive_failure_count IS 'Number of consecutive failures, reset to 0 on success';
COMMENT ON COLUMN data_sources.success_count_7day IS 'Number of successful imports in last 7 days (rolling window)';
COMMENT ON COLUMN data_sources.failure_count_7day IS 'Number of failed imports in last 7 days (rolling window)';
COMMENT ON COLUMN data_sources.success_rate_7day IS 'Computed success percentage over last 7 days';
```

**Updated Schema**:
```sql
data_sources (
  source_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_name VARCHAR(100) NOT NULL,
  data_type_provided TEXT[] NOT NULL,
  reliability_level VARCHAR(50) NOT NULL,
  data_url TEXT,
  license VARCHAR(200),
  attribution TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Health tracking fields (new)
  health_status VARCHAR(20) CHECK (health_status IN ('healthy', 'unhealthy', 'unknown')) DEFAULT 'unknown',
  last_import_attempt TIMESTAMP,
  last_successful_import TIMESTAMP,
  last_error_timestamp TIMESTAMP,
  last_error_message TEXT,
  consecutive_failure_count INTEGER NOT NULL DEFAULT 0,
  success_count_7day INTEGER NOT NULL DEFAULT 0,
  failure_count_7day INTEGER NOT NULL DEFAULT 0,
  success_rate_7day DECIMAL(5,2) GENERATED ALWAYS AS (...) STORED
)
```

---

## Entity Relationships

```
┌─────────────────────────────────┐
│      data_sources               │
│─────────────────────────────────│
│ source_id (PK)                  │◄──┐
│ authority_name                  │   │
│ health_status                   │   │
│ last_successful_import          │   │
│ consecutive_failure_count       │   │
└─────────────────────────────────┘   │
                                      │ FK
                   ┌──────────────────┼────────────────────┐
                   │                  │                    │
       ┌───────────▼──────────────────▼──────────┐   ┌────▼─────────────────────────┐
       │   property_restrictions                 │   │  heritage_sites_import_errors│
       │─────────────────────────────────────────│   │──────────────────────────────│
       │ property_restriction_id (PK)            │   │ error_id (PK)                │
       │ property_name                           │   │ source_record_id             │
       │ managing_organization                   │   │ data_source_id (FK)          │
       │ geometry (high detail)                  │   │ error_type                   │
       │ geometry_simplified_low (zoom <13)      │   │ raw_geometry_text            │
       │ geometry_simplified_medium (zoom 13-15) │   │ raw_properties_json          │
       │ policy_text                             │   │ error_details                │
       │ restriction_category                    │   │ quarantine_timestamp         │
       │ data_source_id (FK)                     │   │ resolved                     │
       │ superseded_by (FK to self)   ─────┐     │   └──────────────────────────────┘
       │ is_primary                         │     │
       └────────────────────────────────────┘     │
                     ▲                            │
                     └────────────────────────────┘
                     (self-referencing FK for deduplication)
```

---

## Query Patterns

### Frontend: Fetch Heritage Sites for Current Zoom Level

```sql
-- Zoom < 13: Low detail
SELECT 
  property_restriction_id,
  property_name,
  managing_organization,
  ST_AsGeoJSON(geometry_simplified_low) as geometry,
  policy_text,
  contact_info
FROM property_restrictions
WHERE 
  is_primary = true
  AND restriction_category = 'HERITAGE_SITE'
  AND ST_Intersects(
    geometry_simplified_low,
    ST_MakeEnvelope($1, $2, $3, $4, 4326)  -- bbox from map bounds
  );

-- Zoom 13-15: Medium detail
SELECT 
  property_restriction_id,
  property_name,
  managing_organization,
  ST_AsGeoJSON(geometry_simplified_medium) as geometry,
  policy_text,
  contact_info
FROM property_restrictions
WHERE 
  is_primary = true
  AND restriction_category = 'HERITAGE_SITE'
  AND ST_Intersects(
    geometry_simplified_medium,
    ST_MakeEnvelope($1, $2, $3, $4, 4326)
  );

-- Zoom > 15: High detail (original)
SELECT 
  property_restriction_id,
  property_name,
  managing_organization,
  ST_AsGeoJSON(geometry) as geometry,
  policy_text,
  contact_info
FROM property_restrictions
WHERE 
  is_primary = true
  AND restriction_category = 'HERITAGE_SITE'
  AND ST_Intersects(
    geometry,
    ST_MakeEnvelope($1, $2, $3, $4, 4326)
  );
```

### Backend: Detect Duplicate Heritage Sites During Import

```sql
WITH new_site AS (
  SELECT 
    'Kew Gardens'::text AS name,
    'Royal Botanic Gardens'::text AS org,
    ST_GeomFromGeoJSON($1)::geometry(MULTIPOLYGON, 4326) AS geom
)
SELECT 
  pr.property_restriction_id,
  pr.property_name,
  pr.managing_organization,
  ST_Distance(ST_Centroid(pr.geometry), ST_Centroid(new_site.geom)) AS distance_degrees,
  similarity(pr.property_name, new_site.name) AS name_similarity
FROM property_restrictions pr, new_site
WHERE 
  pr.is_primary = true
  AND pr.restriction_category = 'HERITAGE_SITE'
  AND ST_DWithin(
    ST_Centroid(pr.geometry), 
    ST_Centroid(new_site.geom), 
    0.0025  -- ~250 meters at UK latitude
  )
  AND similarity(pr.property_name, new_site.name) > 0.8
ORDER BY name_similarity DESC
LIMIT 5;
```

### Operations: Monitor Data Source Health

```sql
-- Dashboard query for data source health
SELECT 
  authority_name,
  health_status,
  last_successful_import,
  consecutive_failure_count,
  success_rate_7day,
  CASE 
    WHEN last_successful_import IS NULL THEN 'Never imported'
    WHEN last_successful_import < NOW() - INTERVAL '7 days' THEN 'Stale (>7 days)'
    WHEN last_successful_import < NOW() - INTERVAL '48 hours' THEN 'Warning (>48 hours)'
    ELSE 'Current'
  END AS staleness
FROM data_sources
WHERE 'heritage-site' = ANY(data_type_provided)
ORDER BY 
  health_status DESC,  -- unhealthy first
  consecutive_failure_count DESC;
```

### Operations: Review Quarantined Import Errors

```sql
-- Summary of import errors by source and type
SELECT 
  ds.authority_name,
  ie.error_type,
  COUNT(*) as error_count,
  MIN(ie.quarantine_timestamp) as first_occurrence,
  MAX(ie.quarantine_timestamp) as last_occurrence
FROM heritage_sites_import_errors ie
JOIN data_sources ds ON ie.data_source_id = ds.source_id
WHERE ie.resolved = false
GROUP BY ds.authority_name, ie.error_type
ORDER BY error_count DESC;

-- Detailed view of specific error for manual correction
SELECT 
  error_id,
  source_record_id,
  error_type,
  error_details,
  raw_geometry_text,
  raw_properties_json,
  quarantine_timestamp
FROM heritage_sites_import_errors
WHERE error_id = $1;
```

---

## Performance Considerations

**Index Usage**:
- GIST spatial indexes on all geometry columns (original + simplified) enable efficient bounding box queries
- GIN trigram index on property_name enables fast fuzzy matching with `similarity()` operator
- Partial indexes on `is_primary = true` reduce index size and speed up primary record queries
- Composite index on `(health_status, consecutive_failure_count)` optimizes operations dashboard

**Query Optimization**:
- Frontend queries select appropriate geometry column based on zoom level (3 separate queries more efficient than CASE statement)
- Bounding box queries use ST_MakeEnvelope which is faster than ST_GeomFromText
- Duplicate detection uses ST_DWithin (distance check) before expensive similarity() calculation to prune candidates

**Write Performance**:
- Bulk INSERT for import operations with explicit transaction control
- Simplified geometries generated during import (not on-the-fly)
- FILLFACTOR=90 on GIST indexes leaves space for updates without page splits

---

## Migration Sequence

1. **Migration 004**: Extend property_restrictions with simplified geometries and deduplication fields
2. **Migration 005**: Create heritage_sites_import_errors quarantine table
3. **Migration 006**: Extend data_sources with health tracking fields
4. **Data Migration**: Populate simplified geometries for existing records:
   ```sql
   UPDATE property_restrictions
   SET 
     geometry_simplified_low = ST_Multi(ST_SimplifyPreserveTopology(geometry, 0.0001)),
     geometry_simplified_medium = ST_Multi(ST_SimplifyPreserveTopology(geometry, 0.00005))
   WHERE 
     restriction_category = 'HERITAGE_SITE'
     AND geometry_simplified_low IS NULL;
   ```

---

## Rollback Plan

If issues discovered after deployment:

1. **Remove health tracking**: `ALTER TABLE data_sources DROP COLUMN health_status, ...`
2. **Remove simplified geometries**: `ALTER TABLE property_restrictions DROP COLUMN geometry_simplified_low, ...`
3. **Drop quarantine table**: `DROP TABLE heritage_sites_import_errors CASCADE;`

Existing `property_restrictions.geometry` (original high-detail) remains intact, ensuring no data loss.
