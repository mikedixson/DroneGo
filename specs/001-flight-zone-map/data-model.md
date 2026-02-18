# Data Model: Drone Flight Zone Map

**Feature**: 001-flight-zone-map  
**Date**: 2026-02-17  
**Version**: 1.0  
**Database**: PostgreSQL 15 + PostGIS 3.x

---

## Overview

This document defines the data entities, relationships, and storage schema for the UK Drone Flight Zone Map. All geospatial data uses **WGS84 (EPSG:4326)** coordinate system for consistency with web mapping standards and GeoJSON.

---

## Entity Definitions

### 1. Restriction Zone

**Purpose**: Represents a geographic area with flying limitations or prohibitions.

**Key Attributes:**
- `zone_id` (UUID, primary key): Unique identifier
- `zone_type` (enum): no-fly, controlled-airspace, military-zone, temporary-restriction, airport-frz, danger-area
- `geometry` (PostGIS POLYGON/MULTIPOLYGON): Boundary coordinates in WGS84
- `authority_source` (string): CAA, NATS, Local Authority
- `restriction_name` (string): Human-readable name (e.g., "Heathrow FRZ", "Danger Area D201")
- `altitude_floor` (integer, nullable): Minimum altitude in feet AMSL (Above Mean Sea Level), null = ground level
- `altitude_ceiling` (integer, nullable): Maximum altitude in feet AMSL, null = unlimited
- `effective_start` (timestamp, nullable): Start date/time for temporary restrictions, null = permanent
- `effective_end` (timestamp, nullable): End date/time for temporary restrictions, null = permanent
- `description` (text): Restriction details and rules
- `authorization_possible` (boolean): Whether authorization can be requested
- `authorization_contact` (string, nullable): Contact info for authorization requests
- `confidence_level` (enum): primary-authority, secondary-source, unverified
- `data_source_id` (UUID, foreign key): Reference to data source
- `last_updated` (timestamp): Last data update timestamp
- `created_at` (timestamp): Record creation timestamp

**Validation Rules:**
- `geometry` must be valid PostGIS polygon (ST_IsValid = true)
- `zone_type` must be one of defined enum values
- `altitude_ceiling` must be >= `altitude_floor` when both present
- `effective_end` must be >= `effective_start` for temporary restrictions
- `confidence_level = 'primary-authority'` required for safety-critical zones

**State Transitions:**
- Temporary restrictions: `pending` → `active` → `expired` (based on effective dates)
- Permanent restrictions: Always `active` unless archived

**Relationships:**
- Belongs to one `Data Source` (many-to-one)
- Can overlap with other restriction zones (spatial queries handle precedence)

**Indexes:**
- Primary key: `zone_id`
- Spatial index: GIST on `geometry` (for fast ST_Contains, ST_Intersects queries)
- Index on `zone_type` (for filtered queries)
- Index on `effective_start`, `effective_end` (for temporal filtering)
- Composite index on `authority_source`, `confidence_level` (for data quality queries)

**GeoJSON Example:**
```json
{
  "type": "Feature",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[
      [-0.4543, 51.4700],
      [-0.4543, 51.4850],
      [-0.4200, 51.4850],
      [-0.4200, 51.4700],
      [-0.4543, 51.4700]
    ]]]
  },
  "properties": {
    "zone_type": "airport-frz",
    "restriction_name": "Heathrow FRZ",
    "authority_source": "CAA",
    "altitude_floor": 0,
    "altitude_ceiling": 2500,
    "description": "Flight Restriction Zone around Heathrow Airport. No unauthorized UAS operations permitted within this zone.",
    "authorization_possible": false,
    "confidence_level": "primary-authority",
    "effective_start": null,
    "effective_end": null,
    "last_updated": "2026-02-15T10:30:00Z"
  }
}
```

---

### 2. TOAL Site

**Purpose**: Represents an officially designated or suitable Take Off and Landing location for drones.

**Key Attributes:**
- `site_id` (UUID, primary key): Unique identifier
- `site_name` (string): Descriptive name (e.g., "Richmond Park Open Field")
- `geometry` (PostGIS POINT): Location coordinates in WGS84
- `access_type` (enum): public, private, permit-required, club-only
- `surface_type` (enum, nullable): grass, concrete, asphalt, gravel, mixed, unknown
- `facilities` (JSONB): Available facilities (e.g., `{"parking": true, "shelter": false, "power": false}`)
- `operating_hours` (string, nullable): Hours if restricted (e.g., "08:00-20:00", "Dawn to dusk")
- `restrictions` (text, nullable): Special conditions or rules
- `contact_info` (string, nullable): Contact for private/permit sites
- `verified` (boolean): Whether site has been field-verified
- `data_source` (string): CAA, community-submitted, OS-derived, verified
- `last_updated` (timestamp): Last data update timestamp
- `created_at` (timestamp): Record creation timestamp

**Confidence Level Mapping (for FR-013B UI display):**
- `verified = true` → Display badge: "Verified" (green checkmark icon)
- `verified = false AND data_source LIKE '%community%'` → Display badge: "Community-reported" (orange info icon)
- `verified = false AND data_source NOT LIKE '%community%'` → Display badge: "Unverified" (gray question icon)

This mapping translates the database schema (`verified` boolean + `data_source` string) into the three-tier confidence system required by FR-013B user interface.

**Validation Rules:**
- `geometry` must be valid PostGIS point (ST_GeometryType = 'ST_Point')
- `access_type` must be one of defined enum values
- `verified = true` requires `data_source` to include verification method

**Relationships:**
- Independent entity (no direct foreign keys)
- Spatially related to restriction zones (must validate TOAL not in no-fly zone)

**Indexes:**
- Primary key: `site_id`
- Spatial index: GIST on `geometry` (for nearest-site queries with ST_Distance)
- Index on `access_type` (for filtering public sites)
- Index on `verified` (for quality filtering)

**GeoJSON Example:**
```json
{
  "type": "Feature",
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "geometry": {
    "type": "Point",
    "coordinates": [-0.1278, 51.5074]
  },
  "properties": {
    "site_name": "Hyde Park Open Space",
    "access_type": "public",
    "surface_type": "grass",
    "facilities": {
      "parking": true,
      "shelter": false,
      "power": false
    },
    "operating_hours": "Dawn to dusk",
    "restrictions": "Must maintain 50m from pedestrians. No operations during events.",
    "verified": true,
    "data_source": "community-submitted, verified 2026-01",
    "last_updated": "2026-01-20T14:00:00Z"
  }
}
```

---

### 3. Airspace Classification

**Purpose**: Represents controlled airspace types defined by aviation authorities (ICAO classification).

**Key Attributes:**
- `airspace_id` (UUID, primary key): Unique identifier
- `class_designation` (enum): A, B, C, D, E, F, G (ICAO airspace classes)
- `geometry` (PostGIS POLYGON/MULTIPOLYGON): Airspace boundary in WGS84
- `airspace_name` (string): Official name (e.g., "London TMA", "Scottish TMA")
- `altitude_floor` (integer): Lower limit in feet AMSL (Above Mean Sea Level)
- `altitude_ceiling` (integer): Upper limit in feet AMSL
- `controlling_authority` (string): ATC unit or authority (e.g., "London Control", "Scottish Control")
- `rules_description` (text): Applicable rules for UAS operations
- `uas_authorization_required` (boolean): Whether UAS operations require authorization
- `authorization_process` (text, nullable): How to request authorization
- `data_source_id` (UUID, foreign key): Reference to data source (typically NATS)
- `last_updated` (timestamp): Last data update timestamp
- `created_at` (timestamp): Record creation timestamp

**Validation Rules:**
- `altitude_ceiling` must be > `altitude_floor`
- `class_designation` must be valid ICAO class (A-G)
- `geometry` must be valid PostGIS polygon

**Relationships:**
- Belongs to one `Data Source` (many-to-one)
- Spatially related to restriction zones (airspace class can inform restriction type)

**Indexes:**
- Primary key: `airspace_id`
- Spatial index: GIST on `geometry`
- Index on `class_designation` (for filtering by airspace class)
- Composite index on `altitude_floor`, `altitude_ceiling` (for 3D spatial queries)

**Notes:**
- **Class A-E**: Controlled airspace, typically requires clearance
- **Class F**: Advisory airspace
- **Class G**: Uncontrolled airspace (default for UK, but other restrictions may apply)
- Most UK drone operations occur in Class G below 400ft, but controlled airspace can extend to ground level near airports

---

### 4. Location (Ephemeral - API Schema Only)

**Purpose**: Represents either user's current position or a searched location for flight suitability checks.

**IMPORTANT - GDPR Compliance**: This entity is **NOT PERSISTED** to the database per NFR-001, NFR-002, NFR-003. User coordinates are processed in-memory only during API requests and immediately discarded. The attributes below describe the API request/response JSON schema, not database columns.

**Key Attributes (API Schema, Not Database Columns):**
- `location_id` (UUID, primary key): Unique identifier (session-based, ephemeral)
- `coordinates` (PostGIS POINT): Latitude/longitude in WGS84
- `location_type` (enum): current-position, search-result
- `restriction_status` (enum): permitted, prohibited, authorization-required, unknown
- `applicable_zones` (JSONB array): Array of zone_ids affecting this location
- `nearest_toal_site_id` (UUID, nullable): Reference to nearest TOAL site
- `nearest_toal_distance` (float, nullable): Distance in meters to nearest TOAL
- `query_timestamp` (timestamp): When location was queried
- `cache_key` (string, indexed): Hash of coordinates for caching (e.g., "51.5074_-0.1278")

**Validation Rules:**
- `coordinates` must be valid PostGIS point within UK bounds (approximately)
- `restriction_status` must be determinable from `applicable_zones`
- `nearest_toal_distance` must be >= 0 when present

**Relationships:**
- References multiple `Restriction Zone` entities (via `applicable_zones`)
- References one `TOAL Site` (via `nearest_toal_site_id`)

**Caching Strategy (In-Memory Only):**
- `cache_key`: Generated from rounded coordinates (4 decimals = ~11m precision)
- In-memory cache (Redis or Node.js Map): <5 minute TTL for repeated queries
- No persistent storage of user coordinates per GDPR requirements

**Business Logic:**
- `restriction_status` determination:
  - If any `zone_type = 'no-fly'` contains point → `prohibited`
  - Else if any `zone_type = 'controlled-airspace' | 'airport-frz'` contains point → `authorization-required`
  - Else → `permitted`
- Tie-breaking: Most restrictive status wins

**Implementation Note**: See `backend/src/models/Location.ts` - implemented as static-only class with no BaseModel extension, no database operations. Task T019-A (create locations table) was removed during consistency analysis (2026-02-17) to ensure GDPR compliance.

---

### 5. Data Source

**Purpose**: Represents the authority or service providing restriction data for confidence indicators and audit trails.

**Key Attributes:**
- `source_id` (UUID, primary key): Unique identifier
- `authority_name` (string): Official name (e.g., "UK Civil Aviation Authority", "NATS AIS")
- `data_type_provided` (array of strings): Types of data (e.g., `["geographic_zones", "airspace_structure"]`)
- `last_sync_timestamp` (timestamp): When data was last updated from this source
- `sync_frequency` (string): Expected update interval (e.g., "daily", "28-day AIRAC cycle")
- `reliability_level` (enum): primary-authority, official-secondary, community, unverified
- `data_url` (string, nullable): Source URL or API endpoint
- `license` (string): Usage license (e.g., "Open Government License v3.0")
- `attribution` (string): Required attribution text
- `contact_email` (string, nullable): Contact for data issues
- `created_at` (timestamp): Record creation timestamp

**Validation Rules:**
- `authority_name` must be unique
- `last_sync_timestamp` must be <= current time
- `reliability_level = 'primary-authority'` required for CAA and NATS

**Relationships:**
- Has many `Restriction Zone` entities (one-to-many)
- Has many `Airspace Classification` entities (one-to-many)

**Indexes:**
- Primary key: `source_id`
- Unique index on `authority_name`
- Index on `last_sync_timestamp` (for staleness monitoring)

**Pre-populated Records:**
```sql
INSERT INTO data_sources (source_id, authority_name, data_type_provided, sync_frequency, reliability_level, license, attribution) VALUES
('11111111-1111-1111-1111-111111111111', 'UK Civil Aviation Authority', ARRAY['geographic_zones', 'frz', 'drone_zones'], 'daily', 'primary-authority', 'OGL v3.0', 'Contains public sector information licensed under the Open Government Licence v3.0'),
('22222222-2222-2222-2222-222222222222', 'NATS AIS', ARRAY['airspace_structure', 'controlled_airspace'], '28-day AIRAC', 'primary-authority', 'Crown Copyright', 'NATS AIS data © Crown Copyright'),
('33333333-3333-3333-3333-333333333333', 'UK NOTAM Service', ARRAY['temporary_restrictions'], 'real-time', 'primary-authority', 'Public access', 'UK NOTAM data');
```

---

### 6. Temporary Restriction (NOTAM)

**Purpose**: Represents time-limited flight restrictions (Notice to Airmen) that affect drone operations.

**Key Attributes:**
- `notam_id` (UUID, primary key): Unique identifier
- `notam_number` (string, unique): Official NOTAM identifier (e.g., "B0123/26")
- `issuing_authority` (string): Authority issuing NOTAM (typically NATS)
- `affected_area_geometry` (PostGIS POLYGON or POINT with radius): Affected geographic area
- `affected_area_center` (PostGIS POINT): Center point for radius-based NOTAMs
- `affected_area_radius` (float, nullable): Radius in nautical miles (convert to meters)
- `effective_start` (timestamp): Restriction start date/time
- `effective_end` (timestamp): Restriction expiration date/time
- `altitude_floor` (integer, nullable): Lower limit in feet AGL
- `altitude_ceiling` (integer, nullable): Upper limit in feet AGL
- `restriction_reason` (text): Reason for restriction (e.g., "Military exercise", "Airshow")
- `notam_text_raw` (text): Original NOTAM text for reference
- `uas_relevant` (boolean): Whether this NOTAM affects UAS operations
- `status` (enum): pending, active, expired, cancelled
- `data_source_id` (UUID, foreign key): Reference to NOTAM data source
- `last_updated` (timestamp): Last update timestamp
- `created_at` (timestamp): Record creation timestamp

**Validation Rules:**
- `notam_number` must match format (e.g., `[A-Z]\d{4}/\d{2}`)
- `effective_end` must be > `effective_start`
- At least one of `affected_area_geometry` or (`affected_area_center` + `affected_area_radius`) must be present
- `status` transitions: `pending` → `active` → `expired` (or `cancelled`)

**State Transitions:**
- `pending`: Current time < `effective_start`
- `active`: `effective_start` <= current time <= `effective_end`
- `expired`: Current time > `effective_end`
- `cancelled`: NOTAM cancelled before expiration (requires NOTAM update/cancellation message)

**Relationships:**
- Belongs to one `Data Source` (many-to-one, typically UK NOTAM Service)
- Spatially relates to restriction zones (NOTAM creates temporary restriction zone)

**Indexes:**
- Primary key: `notam_id`
- Unique index on `notam_number`
- Spatial index: GIST on `affected_area_geometry`
- Spatial index: GIST on `affected_area_center` (for radius queries)
- Composite index on `effective_start`, `effective_end`, `status` (for temporal queries)
- Index on `uas_relevant` (for filtering UAS-specific NOTAMs)

**Business Logic:**
- Automatic status updates via scheduled job:
  ```sql
  UPDATE temporary_restrictions SET status = 'active' 
  WHERE status = 'pending' AND effective_start <= NOW();
  
  UPDATE temporary_restrictions SET status = 'expired' 
  WHERE status = 'active' AND effective_end < NOW();
  ```
- Radius-based geometry generation:
  ```sql
  UPDATE temporary_restrictions 
  SET affected_area_geometry = ST_Buffer(affected_area_center::geography, affected_area_radius * 1852)::geometry
  WHERE affected_area_geometry IS NULL AND affected_area_center IS NOT NULL;
  ```
  *(Note: 1852 meters per nautical mile)*

---

## Entity Relationships Diagram

```
┌──────────────────┐
│  Data Source     │
│ ──────────────── │
│ source_id (PK)   │◄───────┐
│ authority_name   │        │
│ reliability_level│        │
└──────────────────┘        │
                            │ (many-to-one)
                            │
┌──────────────────────────┐│    ┌──────────────────────┐
│  Restriction Zone        ││    │ Airspace             │
│ ────────────────────────  │    │ Classification       │
│ zone_id (PK)             │├────┤────────────────────  │
│ zone_type                ││    │ airspace_id (PK)     │
│ geometry (POLYGON)       ││    │ class_designation    │
│ altitude_floor/ceiling   ││    │ geometry (POLYGON)   │
│ effective_start/end      ││    │ altitude_floor/ceil  │
│ confidence_level         ││    │ data_source_id (FK)  │
│ data_source_id (FK)      ││    └──────────────────────┘
└──────────────────────────┘│
        ▲                   │
        │                   │
        │ (spatial query)   │
        │                   │
┌──────────────────────────┐│    ┌──────────────────────┐
│  Location                ││    │ Temporary            │
│ ──────────────────────── ││    │ Restriction (NOTAM)  │
│ location_id (PK)         ││    │────────────────────  │
│ coordinates (POINT)      ││    │ notam_id (PK)        │
│ restriction_status       ││    │ notam_number         │
│ applicable_zones (JSON)  │├────┤ affected_area (POLY) │
│ nearest_toal_site_id(FK) ││    │ effective_start/end  │
└──────────────────────────┘│    │ status               │
        │                   │    │ data_source_id (FK)  │
        │                   └────┤──────────────────────┘
        │ (nearest site)         │
        ▼                        │
┌──────────────────────────┐    │
│  TOAL Site               │    │
│ ──────────────────────── │    │
│ site_id (PK)             │    │
│ geometry (POINT)         │    │
│ site_name                │    │
│ access_type              │    │
│ facilities (JSON)        │    │
└──────────────────────────┘    │
                                │
    (All entities relate spatially via PostGIS queries)
```

---

## Database Schema (PostgreSQL + PostGIS DDL)

```sql
-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE zone_type_enum AS ENUM (
  'no-fly', 'controlled-airspace', 'military-zone', 
  'temporary-restriction', 'airport-frz', 'danger-area'
);

CREATE TYPE confidence_level_enum AS ENUM (
  'primary-authority', 'secondary-source', 'unverified'
);

CREATE TYPE airspace_class_enum AS ENUM ('A', 'B', 'C', 'D', 'E', 'F', 'G');

CREATE TYPE access_type_enum AS ENUM (
  'public', 'private', 'permit-required', 'club-only'
);

CREATE TYPE surface_type_enum AS ENUM (
  'grass', 'concrete', 'asphalt', 'gravel', 'mixed', 'unknown'
);

CREATE TYPE restriction_status_enum AS ENUM (
  'permitted', 'prohibited', 'authorization-required', 'unknown'
);

CREATE TYPE notam_status_enum AS ENUM (
  'pending', 'active', 'expired', 'cancelled'
);

CREATE TYPE reliability_level_enum AS ENUM (
  'primary-authority', 'official-secondary', 'community', 'unverified'
);

-- Table: data_sources
CREATE TABLE data_sources (
  source_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  authority_name VARCHAR(255) UNIQUE NOT NULL,
  data_type_provided TEXT[] NOT NULL,
  last_sync_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_frequency VARCHAR(100) NOT NULL,
  reliability_level reliability_level_enum NOT NULL,
  data_url TEXT,
  license VARCHAR(255) NOT NULL,
  attribution TEXT NOT NULL,
  contact_email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_data_sources_last_sync ON data_sources(last_sync_timestamp);

-- Table: restriction_zones
CREATE TABLE restriction_zones (
  zone_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_type zone_type_enum NOT NULL,
  geometry GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,
  authority_source VARCHAR(100) NOT NULL,
  restriction_name VARCHAR(255) NOT NULL,
  altitude_floor INTEGER,
  altitude_ceiling INTEGER,
  effective_start TIMESTAMPTZ,
  effective_end TIMESTAMPTZ,
  description TEXT NOT NULL,
  authorization_possible BOOLEAN NOT NULL DEFAULT FALSE,
  authorization_contact VARCHAR(255),
  confidence_level confidence_level_enum NOT NULL,
  data_source_id UUID NOT NULL REFERENCES data_sources(source_id),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_altitude_order CHECK (
    (altitude_ceiling IS NULL) OR 
    (altitude_floor IS NULL) OR 
    (altitude_ceiling >= altitude_floor)
  ),
  CONSTRAINT check_effective_dates CHECK (
    (effective_end IS NULL) OR 
    (effective_start IS NULL) OR 
    (effective_end >= effective_start)
  )
);

CREATE INDEX idx_restriction_zones_geometry ON restriction_zones USING GIST(geometry);
CREATE INDEX idx_restriction_zones_type ON restriction_zones(zone_type);
CREATE INDEX idx_restriction_zones_effective_dates ON restriction_zones(effective_start, effective_end);
CREATE INDEX idx_restriction_zones_confidence ON restriction_zones(authority_source, confidence_level);

-- Table: toal_sites
CREATE TABLE toal_sites (
  site_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_name VARCHAR(255) NOT NULL,
  geometry GEOMETRY(POINT, 4326) NOT NULL,
  access_type access_type_enum NOT NULL,
  surface_type surface_type_enum,
  facilities JSONB,
  operating_hours VARCHAR(100),
  restrictions TEXT,
  contact_info VARCHAR(255),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  data_source VARCHAR(100) NOT NULL,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_toal_sites_geometry ON toal_sites USING GIST(geometry);
CREATE INDEX idx_toal_sites_access_type ON toal_sites(access_type);
CREATE INDEX idx_toal_sites_verified ON toal_sites(verified);

-- Table: airspace_classifications
CREATE TABLE airspace_classifications (
  airspace_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_designation airspace_class_enum NOT NULL,
  geometry GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,
  airspace_name VARCHAR(255) NOT NULL,
  altitude_floor INTEGER NOT NULL,
  altitude_ceiling INTEGER NOT NULL,
  controlling_authority VARCHAR(255) NOT NULL,
  rules_description TEXT NOT NULL,
  uas_authorization_required BOOLEAN NOT NULL DEFAULT TRUE,
  authorization_process TEXT,
  data_source_id UUID NOT NULL REFERENCES data_sources(source_id),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_airspace_altitude CHECK (altitude_ceiling > altitude_floor)
);

CREATE INDEX idx_airspace_geometry ON airspace_classifications USING GIST(geometry);
CREATE INDEX idx_airspace_class ON airspace_classifications(class_designation);
CREATE INDEX idx_airspace_altitude ON airspace_classifications(altitude_floor, altitude_ceiling);

-- Table: temporary_restrictions (NOTAMs)
CREATE TABLE temporary_restrictions (
  notam_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notam_number VARCHAR(20) UNIQUE NOT NULL,
  issuing_authority VARCHAR(100) NOT NULL,
  affected_area_geometry GEOMETRY(POLYGON, 4326),
  affected_area_center GEOMETRY(POINT, 4326),
  affected_area_radius FLOAT,
  effective_start TIMESTAMPTZ NOT NULL,
  effective_end TIMESTAMPTZ NOT NULL,
  altitude_floor INTEGER,
  altitude_ceiling INTEGER,
  restriction_reason TEXT NOT NULL,
  notam_text_raw TEXT NOT NULL,
  uas_relevant BOOLEAN NOT NULL DEFAULT TRUE,
  status notam_status_enum NOT NULL DEFAULT 'pending',
  data_source_id UUID NOT NULL REFERENCES data_sources(source_id),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_notam_dates CHECK (effective_end > effective_start),
  CONSTRAINT check_notam_geometry CHECK (
    (affected_area_geometry IS NOT NULL) OR 
    (affected_area_center IS NOT NULL AND affected_area_radius IS NOT NULL)
  )
);

CREATE INDEX idx_notam_geometry ON temporary_restrictions USING GIST(affected_area_geometry);
CREATE INDEX idx_notam_center ON temporary_restrictions USING GIST(affected_area_center);
CREATE INDEX idx_notam_dates ON temporary_restrictions(effective_start, effective_end, status);
CREATE INDEX idx_notam_relevance ON temporary_restrictions(uas_relevant) WHERE uas_relevant = TRUE;

-- View: active_restrictions (combines permanent zones + active NOTAMs)
CREATE VIEW active_restrictions AS
SELECT 
  zone_id AS restriction_id,
  zone_type AS restriction_type,
  geometry,
  restriction_name AS name,
  altitude_floor,
  altitude_ceiling,
  description,
  'permanent' AS restriction_category,
  confidence_level,
  last_updated
FROM restriction_zones
WHERE (effective_start IS NULL OR effective_start <= NOW())
  AND (effective_end IS NULL OR effective_end > NOW())
UNION ALL
SELECT 
  notam_id AS restriction_id,
  'temporary-restriction'::zone_type_enum AS restriction_type,
  affected_area_geometry AS geometry,
  CONCAT('NOTAM ', notam_number) AS name,
  altitude_floor,
  altitude_ceiling,
  restriction_reason AS description,
  'temporary' AS restriction_category,
  'primary-authority'::confidence_level_enum AS confidence_level,
  last_updated
FROM temporary_restrictions
WHERE status = 'active' AND uas_relevant = TRUE;
```

---

## Sample Queries

### Check if location permits flight (P1 - 5 second decision)
```sql
-- Point-in-polygon check for current location
SELECT 
  CASE 
    WHEN COUNT(*) FILTER (WHERE restriction_type IN ('no-fly', 'airport-frz')) > 0 THEN 'prohibited'
    WHEN COUNT(*) FILTER (WHERE restriction_type IN ('controlled-airspace', 'military-zone')) > 0 THEN 'authorization-required'
    ELSE 'permitted'
  END AS restriction_status,
  json_agg(json_build_object(
    'name', name,
    'type', restriction_type,
    'description', description
  )) AS applicable_zones
FROM active_restrictions
WHERE ST_Contains(geometry, ST_SetSRID(ST_MakePoint(-0.1275, 51.5074), 4326))
GROUP BY TRUE;
```

### Find nearest TOAL site (FR-013)
```sql
-- Find nearest public TOAL site to current location
SELECT 
  site_id,
  site_name,
  access_type,
  ST_Distance(
    geometry::geography, 
    ST_SetSRID(ST_MakePoint(-0.1275, 51.5074), 4326)::geography
  ) AS distance_meters
FROM toal_sites
WHERE access_type = 'public' AND verified = TRUE
ORDER BY geometry <-> ST_SetSRID(ST_MakePoint(-0.1275, 51.5074), 4326)
LIMIT 1;
```

### Query zones by bounding box (for map viewport)
```sql
-- Get all active restrictions within map viewport
SELECT 
  restriction_id,
  restriction_type,
  name,
  ST_AsGeoJSON(geometry) AS geometry_geojson,
  altitude_floor,
  altitude_ceiling,
  description,
  confidence_level
FROM active_restrictions
WHERE ST_Intersects(
  geometry,
  ST_MakeEnvelope(-0.5, 51.4, 0.0, 51.6, 4326)
)
ORDER BY 
  CASE restriction_type
    WHEN 'no-fly' THEN 1
    WHEN 'airport-frz' THEN 2
    WHEN 'controlled-airspace' THEN 3
    ELSE 4
  END;
```

### Check data staleness (FR-019)
```sql
-- Identify zones with outdated data (>48 hours old)
SELECT 
  authority_name,
  data_type_provided,
  last_sync_timestamp,
  EXTRACT(EPOCH FROM (NOW() - last_sync_timestamp)) / 3600 AS hours_since_update
FROM data_sources
WHERE last_sync_timestamp < NOW() - INTERVAL '48 hours'
ORDER BY last_sync_timestamp ASC;
```

---

## Data Migration Strategy

### Initial Data Load
1. **Phase 1**: Load NATS Digital Datasets (GeoJSON/KML → PostGIS)
2. **Phase 2**: Load NATS eAIP airspace structure (manual extraction → conversion)
3. **Phase 3**: Populate data_sources table with NATS, NOTAM entries
4. **Phase 4**: Initial NOTAM load (manual review → database entry)

### Ongoing Updates
- **Daily**: Automated NATS digital dataset download and diff-based updates (from https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/digital-datasets/)
- **28-day AIRAC**: Manual NATS eAIP review and updates (until automated)
- **Daily**: NOTAM review and entry (manual until API secured)
- **Hourly**: Automated NOTAM status updates (pending → active → expired)

---

## Performance Considerations

### Spatial Index Optimization
- GIST indexes on all geometry columns enable O(log n) spatial queries
- Expected query time: <50ms for point-in-polygon checks
- Expected query time: <100ms for bounding box queries

### Caching Strategy (Backend)
- **Redis cache**: Recent location queries (<5 min TTL)
- **Cache key**: `location:${lat}_${lon}` → restriction_status + applicable_zones
- **Cache invalidation**: On data updates (daily NATS dataset sync, NOTAM status changes)

### Data Volume Estimates
- **Restriction zones**: ~1,000-2,000 permanent zones (UK coverage)
- **Airspace classifications**: ~200-300 airspace sectors
- **TOAL sites**: ~500-1,000 sites (growing over time)
- **Active NOTAMs**: ~50-200 at any given time
- **Total database size**: ~100-200 MB (without historical data)

---

## Validation & Constraints Summary

| Entity | Critical Constraints |
|--------|---------------------|
| **Restriction Zone** | Valid polygon, altitude ceiling >= floor, effective_end >= start |
| **TOAL Site** | Valid point, access_type enum, verified sites have data_source |
| **Airspace** | Valid polygon, altitude ceiling > floor, class A-G |
| **NOTAM** | Valid geometry or center+radius, effective_end > start, NOTAM format |
| **Data Source** | Unique authority_name, last_sync <= NOW(), reliability_level |

---

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-17 | Initial data model design |

