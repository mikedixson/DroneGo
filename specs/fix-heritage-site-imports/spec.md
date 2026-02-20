# Feature Specification: Heritage Site Import and Display

**Feature Branch**: `fix-heritage-site-imports`  
**Created**: 2026-02-19  
**Status**: In Planning  
**Parent Feature**: [001-flight-zone-map](../001-flight-zone-map/spec.md)  
**Input**: "National heritage sites should import correctly and display correctly on their own layer following the boundaries of the property they impact."

## Overview

This feature implements robust import processes for heritage site data from multiple authoritative sources (National Trust, Historic England) and ensures accurate display of property-based drone restrictions as an advisory layer distinct from legal airspace restrictions. Royal Parks integration is planned for a future enhancement phase.

## Problem Statement

**Current State**: Heritage site import scripts exist but fail silently (no error logging, no alerts), resulting in empty property_restrictions table. When imports do run, there's no validation of geometry data quality, no handling of duplicates across sources, and no boundary optimization for rendering performance.

**Impact**: Drone pilots cannot see property-based restrictions at heritage sites, leading to potential trespass or policy violations even when airspace is legally clear.

**Goal**: Implement production-grade import pipeline with comprehensive error handling, data validation, deduplication, and performance optimization.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Heritage Site Boundaries on Map (Priority: P1)

As a drone pilot planning a flight, I want to see heritage site boundaries clearly displayed on the map with their exact property boundaries, so I can determine if my planned takeoff or flight path is within a property that has drone restrictions.

The pilot views the map and sees heritage sites (National Trust, Historic England properties) rendered as amber-colored polygons following the actual property boundaries. When they click a heritage site polygon, it highlights above all other layers and displays the site name, managing organization, and specific drone policy.

**Why this priority**: Property-based restrictions are advisory but important for compliance. Pilots need to see which specific properties have drone policies to avoid trespass and respect landowner wishes.

**Independent Test**: Pan map to known heritage sites (e.g., Tower of London, Greenwich Park). Verify polygons appear with correct boundaries matching official property limits. Click polygon and verify policy details display.

**Acceptance Scenarios**:

1. **Given** heritage site data has been successfully imported, **When** pilot zooms to London area, **Then** heritage sites render as amber polygons with transparency allowing underlying airspace visibility
2. **Given** pilot hovers over heritage site boundary, **When** they click the polygon, **Then** the clicked site temporarily elevates above all layers with visual highlight and displays detail panel
3. **Given** pilot views heritage site detail panel, **When** they read the information, **Then** panel shows property name, managing organization, drone policy text, and contact information for permission requests
4. **Given** pilot closes detail panel, **When** panel dismisses, **Then** heritage site returns to normal z-index priority (beneath airspace layers)
5. **Given** multiple heritage sites overlap (e.g., Historic England building within Royal Parks property), **When** pilot views the area, **Then** only the preferred authoritative record displays (no duplicate polygons)

### User Story 2 - Reliable Heritage Site Data Updates (Priority: P2)

As a system operator, I need import processes to handle failures gracefully and alert me when data sources are unavailable, so I can investigate issues and ensure pilots always see current heritage site information.

Import scripts run on schedule (weekly for heritage sites). When APIs fail or return invalid data, the system logs detailed errors, sends alerts, and continues operating with existing (stale) data rather than removing heritage sites or crashing.

**Why this priority**: Data source APIs (ArcGIS FeatureServers) experience downtime, rate limiting, or schema changes. Silent failures leave data stale without operator awareness.

**Independent Test**: Simulate API failure (disconnect network, corrupt API response). Verify import logs error, sends alert notification, marks data source as unhealthy, and existing heritage site data remains visible with staleness indicator.

**Acceptance Scenarios**:

1. **Given** National Trust API is unavailable, **When** scheduled import runs, **Then** system logs error with full context (data_source, error_type, timestamp) and sends alert to operations team
2. **Given** import fails, **When** system updates data source health status, **Then** data_sources table marks source as unhealthy with last_error_timestamp and error_message
3. **Given** API returns geometry with invalid coordinates (out of bounds), **When** import validation runs, **Then** invalid geometry is quarantined in heritage_sites_import_errors table with error details
4. **Given** import encounters self-intersecting polygon, **When** ST_IsValid check runs, **Then** geometry fails validation and is quarantined rather than inserted with corrupt data
5. **Given** import fails but existing data exists, **When** pilot views map, **Then** heritage sites from last successful import display with data age indicator if >48 hours stale

## Requirements *(mandatory)*

### Functional Requirements

**Heritage Site Import & Data Quality:**

- **FR-001**: System MUST validate all heritage site geometries during import using PostGIS ST_IsValid() for topology correctness and coordinate bounds validation (lat ∈ [-90, 90], lng ∈ [-180, 180])
- **FR-002**: System MUST automatically convert POLYGON geometries to MULTIPOLYGON using ST_Multi() wrapper to match database schema requirements during heritage site import
- **FR-003**: System MUST quarantine invalid geometries that fail validation into heritage_sites_import_errors table with error details (error_type, raw_geometry_text, error_details, quarantine_timestamp) for manual review
- **FR-004**: System MUST detect duplicate heritage sites across multiple data sources using spatial proximity (centroid distance ≤ 250m) AND name similarity (≥80% Levenshtein match) criteria
- **FR-005**: System MUST resolve duplicate heritage sites by preferring authority hierarchy (Historic England > National Trust > Royal Parks > Others) and merging policy text from all sources with attribution
- **FR-006**: System MUST mark superseded duplicate records with superseded_by foreign key reference rather than deleting to preserve audit trail
- **FR-007**: System MUST generate and store simplified boundary geometries for heritage sites at three precision levels: high (original, zoom >15), medium (ST_Simplify tolerance 0.00005°, zoom 13-15), low (ST_Simplify tolerance 0.0001°, zoom <13) to optimize rendering performance
- **FR-008**: System MUST serve appropriate simplified boundary geometry based on current map zoom level (<13: low detail, 13-15: medium detail, >15: high detail original)
- **FR-009**: Heritage site import processes MUST log failures (network errors, API errors, rate limiting, malformed data) to structured application logs with full error context (data_source, error_type, error_message, timestamp)
- **FR-010**: System MUST mark data sources as "unhealthy" in data_sources table when imports fail, recording last_error_timestamp and last_error_message for operational monitoring
- **FR-011**: System MUST send alert notifications (email, Slack, PagerDuty, or console warnings for MVP) to operations team when heritage site imports fail, enabling prompt investigation
- **FR-012**: System MUST continue operating with existing (stale) heritage site data when imports fail rather than removing heritage sites or blocking application functionality
- **FR-013**: System MUST display data age indicators for heritage sites when operating with stale data (>48 hours old) due to import failures

**Heritage Site Display & Interaction:**

- **FR-014**: System MUST display heritage sites (National Trust, Historic England) as a toggleable layer with site boundaries following exact property boundaries from authoritative sources (Royal Parks planned for future enhancement)
- **FR-015**: System MUST render heritage site polygons with visual styling distinct from legal airspace restrictions (amber color, semi-transparent fill, dashed or dotted border)
- **FR-016**: System MUST render airspace legal restrictions with higher visual z-index priority than heritage site advisory layers per FR-007B of parent spec
- **FR-017**: When user clicks/taps a heritage site polygon, system MUST temporarily elevate that specific polygon to highest z-index (above all airspace and other property layers) with visual highlight styling (increased opacity, border emphasis)
- **FR-018**: System MUST revert highlighted heritage site to normal z-index priority (beneath airspace layers) when detail panel is closed or different feature is selected
- **FR-019**: System MUST display detail panel for clicked heritage site showing: property_name, managing_organization, policy_text, contact_info, policy_effective_date, data_source authority
- **FR-020**: Heritage site layer toggle MUST allow users to show/hide all heritage sites independently from other map layers (airspace restrictions, TOAL sites)

### Non-Functional Requirements

**Import Performance & Reliability:**

- **NFR-001**: Heritage site import processes MUST complete within 30 minutes per data source (National Trust ~1,692 properties, Historic England ~18,000 listed buildings with public access) to enable weekly refresh schedules
- **NFR-002**: System MUST maintain structured logs (JSON format) for all data import operations with minimum fields: timestamp, data_source, operation_type (start/success/failure), records_processed, records_failed, duration_ms, error_summary
- **NFR-003**: Import failure alerts MUST be delivered within 5 minutes of failure detection to enable rapid operational response (for production; MVP may log to console)
- **NFR-004**: System MUST track data source health metrics: last_success_timestamp, last_failure_timestamp, consecutive_failure_count, success_rate_7day to enable proactive maintenance

**Data Quality & Rendering Performance:**

- **NFR-005**: Boundary simplification for heritage sites MUST preserve topology (no self-intersections introduced) and ensure simplified boundaries remain within 10 meters of original boundaries for zoom level <13, within 5 meters for zoom 13-15
- **NFR-006**: Heritage site polygon rendering performance MUST maintain ≥30fps when displaying up to 100 concurrent sites in viewport, using simplified geometries appropriate to zoom level
- **NFR-007**: Geometry validation MUST execute within 100ms per record during import to maintain acceptable import duration
- **NFR-008**: Duplicate detection queries MUST utilize spatial indexes (PostGIS GIST index on geometry, GIN index on property_name with pg_trgm for fuzzy matching) to maintain import performance

## Key Entities

**Property Restriction** (heritage sites):
- property_restriction_id (UUID, primary key)
- property_name (TEXT, indexed for search)
- managing_organization (TEXT, e.g., "National Trust", "Historic England")
- geometry (MULTIPOLYGON, SRID 4326, GIST spatial index)
- geometry_simplified_low (MULTIPOLYGON, SRID 4326, for zoom <13)
- geometry_simplified_medium (MULTIPOLYGON, SRID 4326, for zoom 13-15)
- policy_text (TEXT, drone policy description)
- contact_info (TEXT, email/phone for permission requests)
- restriction_category (ENUM: HERITAGE_SITE, SSSI)
- data_source_id (UUID, foreign key to data_sources)
- policy_effective_date (DATE)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
- superseded_by (UUID, nullable foreign key to property_restrictions for deduplication)
- is_primary (BOOLEAN, true for preferred record when duplicates exist)

**Heritage Sites Import Errors** (quarantine table):
- error_id (UUID, primary key)
- source_record_id (TEXT, identifier from external API)
- data_source_id (UUID, foreign key to data_sources)
- error_type (ENUM: topology_invalid, bounds_invalid, parse_failure, api_error)
- raw_geometry_text (TEXT, GeoJSON or WKT for debugging)
- error_details (TEXT, detailed error message)
- quarantine_timestamp (TIMESTAMP)
- resolved (BOOLEAN, default false)
- resolved_at (TIMESTAMP, nullable)
- resolution_notes (TEXT, nullable)

**Data Source** (extended for health tracking):
- source_id (UUID, primary key)
- authority_name (TEXT, e.g., "National Trust", "Historic England")
- source_type (TEXT[], e.g., {"property-restrictions", "heritage-site"})
- api_endpoint (TEXT, ArcGIS FeatureServer URL)
- last_update_timestamp (TIMESTAMP, last successful import)
- update_frequency (INTERVAL, e.g., '7 days')
- health_status (ENUM: healthy, unhealthy, unknown)
- last_error_timestamp (TIMESTAMP, nullable)
- last_error_message (TEXT, nullable)
- consecutive_failure_count (INTEGER, default 0)
- success_rate_7day (DECIMAL, calculated metric)

## Success Criteria *(mandatory)*

- **SC-001**: Heritage site import from National Trust API successfully retrieves and validates ≥1,500 property records with <5% validation failures
- **SC-002**: Heritage site import from Historic England API successfully retrieves and validates ≥15,000 listed building records with public access
- **SC-003**: When import encounters API failure (simulated network outage), system logs structured error and sends alert within 5 minutes (or logs to console for MVP)
- **SC-004**: Duplicate heritage sites across multiple sources (e.g., properties listed by both National Trust and Historic England) are deduplicated with single polygon displayed
- **SC-005**: Heritage site polygons render smoothly at ≥30fps when 50+ sites are visible in viewport
- **SC-006**: User can click heritage site polygon and see detail panel display within 300ms with property name, managing organization, and drone policy
- **SC-007**: Invalid geometries (self-intersecting polygons, out-of-bounds coordinates) are quarantined rather than inserted, with 100% quarantine rate for known-invalid test data
- **SC-008**: Heritage site layer can be toggled on/off independently, with toggle state persisting during map pan/zoom operations

## Edge Cases

- **What happens when ArcGIS API changes response schema?** Import validation catches missing required fields (property_name, geometry) and quarantines records. Error logs include sample of problematic response for debugging. Alert sent to operations. Existing heritage site data continues displaying.

- **What happens when heritage site boundary has 5,000+ coordinate points?** ST_Simplify generates reduced-complexity geometries (low/medium detail versions). Original high-detail boundary stored but only served at zoom >15. Rendering uses appropriate simplified version based on current zoom level to maintain performance.

- **What happens when two authoritative sources list same property with different boundaries?** Deduplication process detects spatial proximity (centroids within 250m) + name similarity (≥80% match). Historic England preferred as statutory authority over National Trust. Both boundary geometries preserved in audit trail via superseded_by reference. Map displays preferred boundary only.

- **What happens when import starts succeeding after previous failures?** System updates data_sources table: health_status set to "healthy", consecutive_failure_count reset to 0, last_update_timestamp updated. Stale data warning removed from UI. Success recorded in structured logs.

- **What happens when user clicks heritage site polygon that overlaps restricted airspace?** Clicked heritage site temporarily elevates to highest z-index so user can clearly see it's selected. Detail panel shows heritage site information. User can dismiss panel, then click airspace restriction to view that information separately. Visual hierarchy maintains airspace as top layer when no user interaction active.

## Assumptions

- **Data Sources**: National Trust Open Data (https://open-data-national-trust.hub.arcgis.com/), Historic England (https://opendata-historicengland.hub.arcgis.com/). Royal Parks integration deferred to future enhancement (data source availability and schema to be confirmed). ArcGIS REST API provides GeoJSON/JSON responses with geometry in EPSG:4326 or transformable via outSR parameter.

- **Import Schedule**: Heritage site imports run weekly (policies change less frequently than airspace). Manual trigger available for immediate refresh when data source reports updates.

- **Alerting for MVP**: Console warnings acceptable for MVP. Production deployment should integrate with operational monitoring (email, Slack, PagerDuty).

- **Deduplication Authority Hierarchy**: Historic England (statutory authority for listed buildings) > National Trust (major landowner) > Other organizations (including Royal Parks when added). Hierarchy can be adjusted via configuration if needed.

- **Coordinate System**: All heritage site boundaries in WGS84 (EPSG:4326). UK data from ArcGIS may be in British National Grid (EPSG:27700); transformation handled via outSR parameter or PostGIS ST_Transform.

- **Boundary Simplification**: ST_Simplify with preserve_topology flag prevents invalid geometries. Tolerance tuned for UK context where 0.0001° ≈ 10 meters. Visual inspection confirms acceptable detail loss.
