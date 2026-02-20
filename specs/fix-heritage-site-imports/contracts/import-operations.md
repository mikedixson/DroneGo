# API Contract: Heritage Site Import Operations

**Feature**: fix-heritage-site-imports  
**Version**: 1.0.0  
**Date**: 2026-02-19

## Overview

This document defines internal API contracts for heritage site import operations. These are administrative operations typically triggered via cron jobs or manual scripts, not exposed via public API endpoints.

---

## Import Operation Interface

### Import National Trust Heritage Sites

**Operation**: `importNationalTrustSites()`  
**Trigger**: npm script `npm run import:national-trust` or scheduled task  
**Purpose**: Fetch all National Trust properties from ArcGIS FeatureServer and import into database

#### Input Parameters

None (reads from environment variables):
- `NATIONAL_TRUST_API_URL`: Base URL for ArcGIS FeatureServer
- ` LOG_LEVEL`: Winston log level (default: 'info')
- `SLACK_WEBHOOK_URL`: Optional alert destination

#### Process Flow

1. **Initialize** logging and database connection
2. **Fetch data source** record from database for "National Trust"
3. **Paginate through** ArcGIS FeatureServer (1000 records per batch)
4. **Validate each** geometry (ST_IsValid, bounds check, POLYGON→MULTIPOLYGON conversion)
5. **Detect duplicates** using spatial proximity + name similarity
6. **Generate simplified** geometries (low, medium detail)
7. **Insert validated** records into property_restrictions table
8. **Quarantine invalid** records into heritage_sites_import_errors table
9. **Update data source** health metrics (success_count, health_status)
10. **Log summary** and send alerts if failures occurred

#### Success Response

```typescript
interface ImportResult {
  success: true;
  data_source: string;  // "National Trust"
  records_processed: number;  // Total from API
  records_inserted: number;   // Successfully inserted
  records_updated: number;    // Existing records updated
  records_quarantined: number; // Validation failures
  duplicates_detected: number; // Near-duplicates merged
  duration_ms: number;
  summary: string;  // Human-readable summary
}
```

**Example**:
```json
{
  "success": true,
  "data_source": "National Trust",
  "records_processed": 1692,
  "records_inserted": 1650,
  "records_updated": 0,
  "records_quarantined": 42,
  "duplicates_detected": 8,
  "duration_ms": 185000,
  "summary": "Successfully imported 1650 National Trust heritage sites. 42 geometries quarantined (30 topology_invalid, 12 bounds_invalid). 8 duplicates merged with existing records."
}
```

#### Error Response

```typescript
interface ImportError {
  success: false;
  data_source: string;
  error_type: 'network_error' | 'api_error' | 'database_error' | 'validation_error';
  error_message: string;
  records_processed: number;  // Partial progress before failure
  records_inserted: number;   // Successfully committed before error
  duration_ms: number;
  stack_trace?: string;  // If available
}
```

**Example**:
```json
{
  "success": false,
  "data_source": "National Trust",
  "error_type": "network_error",
  "error_message": "Connection timeout after 30000ms connecting to ArcGIS FeatureServer",
  "records_processed": 3200,
  "records_inserted": 3200,
  "duration_ms": 95000,
  "stack_trace": "Error: ETIMEDOUT\n    at TCPConnectWrap.afterConnect..."
}
```

#### Side Effects

- Inserts/updates records in `property_restrictions` table
- Inserts error records in `heritage_sites_import_errors` table
- Updates `data_sources` table health fields
- Writes structured logs to `logs/import-combined.log` and `logs/import-error.log`
- Sends Slack alert if `SLACK_WEBHOOK_URL` configured and errors occurred

#### Error Handling

- **Network timeout**: Fail after 30s, log error, mark data source unhealthy, preserve partial progress
- **Rate limiting (429)**: Exponential backoff (60s → 120s → 240s), max 3 retries, then fail
- **Invalid geometry**: Quarantine individual record, continue processing remaining records
- **Database error**: Rollback transaction, log error, fail import, preserve existing data

---

### Import Historic England Heritage Sites

**Operation**: `importHistoricEnglandSites()`  
**Trigger**: npm script `npm run import:historic-england` or scheduled task  
**Purpose**: Fetch listed buildings with public access from Historic England ArcGIS FeatureServer

#### Input Parameters

None (reads from environment variables):
- `HISTORIC_ENGLAND_API_URL`: Base URL for ArcGIS FeatureServer
- `LOG_LEVEL`: Winston log level
- `SLACK_WEBHOOK_URL`: Optional alert destination

#### Process Flow

Same as National Trust import (1-10 above), with Historic England specific:
- Authority hierarchy: Historic England preferred over duplicates
- Larger dataset (~18,000 records) - expect longer duration
- Policy text mapped from `ListEntry.Description` or `AdditionalInformation` fields

#### Success/Error Response

Same structure as National Trust import, with `data_source: "Historic England"`

#### Performance Expectations

- **Target duration**: <30 minutes for ~18,000 records (NFR-001)
- **Batch size**: 1000 records per API request
- **Expected validation failures**: <5% based on historic data quality

---

## Data Validation Interface

### Geometry Validation

**Function**: `validateGeometry(geometry: GeoJSON.Geometry): ValidationResult`  
**Purpose**: Validate heritage site boundary geometry before insertion

#### Input

```typescript
interface GeoJSONGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}
```

#### Output

```typescript
interface ValidationResult {
  valid: boolean;
  geometry_type: 'Polygon' | 'MultiPolygon';
  converted_to_multipolygon: boolean;
  errors: ValidationError[];
}

interface ValidationError {
  error_type: 'topology_invalid' | 'bounds_invalid' | 'empty_geometry';
  error_message: string;
  st_isvalid_reason?: string;  // From PostGIS ST_IsValidReason()
}
```

#### Validation Rules

1. **Coordinate bounds**: `lat ∈ [-90, 90]`, `lng ∈ [-180, 180]`
2. **Topology**: `ST_IsValid(geometry) = true` (no self-intersections, valid rings)
3. **Type conversion**: Wrap POLYGON in ST_Multi() to create MULTIPOLYGON
4. **Non-empty**: Geometry must have at least 3 coordinates (valid triangle minimum)

#### Example Responses

**Valid geometry**:
```json
{
  "valid": true,
  "geometry_type": "Polygon",
  "converted_to_multipolygon": true,
  "errors": []
}
```

**Invalid geometry**:
```json
{
  "valid": false,
  "geometry_type": "Polygon",
  "converted_to_multipolygon": false,
  "errors": [
    {
      "error_type": "topology_invalid",
      "error_message": "Self-intersection detected in polygon ring",
      "st_isvalid_reason": "Ring Self-intersection[1.234 5.678]"
    }
  ]
}
```

---

### Duplicate Detection

**Function**: `detectDuplicates(candidateSite: HeritageSite): DuplicateCandidate[]`  
**Purpose**: Find existing heritage sites that may be duplicates based on proximity and name similarity

#### Input

```typescript
interface HeritageSite {
  property_name: string;
  managing_organization: string;
  geometry: GeoJSON.MultiPolygon;
}
```

#### Output

```typescript
interface DuplicateCandidate {
  property_restriction_id: string;
  property_name: string;
  managing_organization: string;
  distance_meters: number;  // Distance between centroids
  name_similarity: number;  // 0-1, pg_trgm similarity score
  is_likely_duplicate: boolean;  // true if distance ≤250m AND similarity ≥0.8
  authority_precedence: 'higher' | 'equal' | 'lower';  // Relative to candidate
}
```

#### Detection Logic

```sql
-- Spatial proximity: centroids within 250m (0.0025° at UK latitude)
ST_DWithin(ST_Centroid(existing.geometry), ST_Centroid(candidate.geometry), 0.0025)

-- Name similarity: 80% match threshold
similarity(existing.property_name, candidate.property_name) >= 0.8
```

**Authority Hierarchy** (for determining preferred record):
1. Historic England (statutory authority)
2. National Trust (major landowner)
3. Royal Parks
4. Other organizations

#### Example Response

```json
[
  {
    "property_restriction_id": "a1b2c3d4-...",
    "property_name": "Tower of London",
    "managing_organization": "Historic England",
    "distance_meters": 15.3,
    "name_similarity": 0.95,
    "is_likely_duplicate": true,
    "authority_precedence": "higher"
  },
  {
    "property_restriction_id": "e5f6g7h8-...",
    "property_name": "HM Tower of London",
    "managing_organization": "Royal Palaces",
    "distance_meters": 8.7,
    "name_similarity": 0.88,
    "is_likely_duplicate": true,
    "authority_precedence": "lower"
  }
]
```

#### Conflict Resolution

When `is_likely_duplicate = true`:
- If candidate has `authority_precedence = 'lower'`: Mark candidate as superseded, insert with `is_primary=false`, set `superseded_by` to existing record ID
- If candidate has `authority_precedence = 'higher'`: Mark existing record as superseded, update `superseded_by`, insert candidate as primary with `is_primary=true`
- If candidate has `authority_precedence = 'equal'`: Keep both as `is_primary=true`, log warning for manual review

---

## Logging Contract

### Structured Log Format

All import operations MUST log using this format (NFR-002):

```typescript
interface ImportLogEntry {
  timestamp: string;  // ISO 8601 format
  level: 'info' | 'warn' | 'error';
  message: string;
  data_source: string;
  operation_type: 'start' | 'progress' | 'success' | 'failure';
  records_processed: number;
  records_failed: number;
  duration_ms: number;
  error_summary?: string;
  error_stack?: string;  // Only for level='error'
}
```

### Example Log Entries

**Import start**:
```json
{
  "timestamp": "2026-02-19T14:30:00.000Z",
  "level": "info",
  "message": "Heritage site import started",
  "data_source": "National Trust",
  "operation_type": "start",
  "records_processed": 0,
  "records_failed": 0,
  "duration_ms": 0
}
```

**Progress update** (every 1000 records):
```json
{
  "timestamp": "2026-02-19T14:32:15.340Z",
  "level": "info",
  "message": "Import progress checkpoint",
  "data_source": "National Trust",
  "operation_type": "progress",
  "records_processed": 3000,
  "records_failed": 15,
  "duration_ms": 135340
}
```

**Import success**:
```json
{
  "timestamp": "2026-02-19T14:35:20.500Z",
  "level": "info",
  "message": "Heritage site import completed successfully",
  "data_source": "National Trust",
  "operation_type": "success",
  "records_processed": 1692,
  "records_failed": 42,
  "duration_ms": 200500,
  "error_summary": "42 geometries quarantined: 30 topology_invalid, 12 bounds_invalid"
}
```

**Import failure**:
```json
{
  "timestamp": "2026-02-19T14:33:00.780Z",
  "level": "error",
  "message": "Heritage site import failed",
  "data_source": "Historic England",
  "operation_type": "failure",
  "records_processed": 5200,
  "records_failed": 0,
  "duration_ms": 180780,
  "error_summary": "Network timeout after 30000ms",
  "error_stack": "Error: ETIMEDOUT\n    at..."
}
```

---

## Database Transaction Contract

### Import Transaction Scope

**Isolation Level**: READ COMMITTED (PostgreSQL default)  
**Transaction Boundaries**: Per-batch (1000 records)

#### Rationale

Batch-level transactions (not entire import) ensure:
- Partial progress preserved if import fails midway
- Database locks held for shorter duration
- Memory footprint remains bounded
- Failed batches can be retried without re-importing successful batches

#### Pseudo-code

```typescript
for await (const batch of paginateAPI(dataSource, BATCH_SIZE)) {
  const transaction = await db.beginTransaction();
  
  try {
    for (const feature of batch) {
      const validationResult = await validateGeometry(feature.geometry);
      
      if (!validationResult.valid) {
        await quarantineError(transaction, feature, validationResult.errors);
        continue;
      }
      
      const duplicates = await detectDuplicates(transaction, feature);
      const shouldInsert = resolveDuplicates(transaction, feature, duplicates);
      
      if (shouldInsert) {
        await insertHeritageSite(transaction, feature);
      }
    }
    
    await transaction.commit();
    logger.info('Batch committed', { records_processed: batch.length });
    
  } catch (error) {
    await transaction.rollback();
    logger.error('Batch failed, rolled back', { error: error.message });
    throw error;  // Propagate to trigger failure handling
  }
}
```

---

## Alert Contract

### Alert Trigger Conditions

Send alert notification when:
1. Import fails with `success = false`
2. Consecutive failure count ≥ 3 for a data source
3. Quarantine rate > 10% (indicates data quality issue at source)
4. Import duration exceeds 45 minutes (150% of 30-minute target)

### Alert Message Format

```typescript
interface AlertMessage {
  severity: 'warning' | 'error' | 'critical';
  title: string;
  description: string;
  data_source: string;
  timestamp: string;
  context: {
    records_processed?: number;
    records_quarantined?: number;
    consecutive_failures?: number;
    error_message?: string;
  };
  action_required: string;
}
```

### Example Alert (Slack format)

```json
{
  "text": "🚨 [ERROR] Heritage Site Import Alert",
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "Heritage Site Import Failed: National Trust"
      }
    },
    {
      "type": "section",
      "fields": [
        { "type": "mrkdwn", "text": "*Severity:* Error" },
        { "type": "mrkdwn", "text": "*Timestamp:* 2026-02-19 14:35:00" },
        { "type": "mrkdwn", "text": "*Records Processed:* 3200" },
        { "type": "mrkdwn", "text": "*Consecutive Failures:* 2" }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Error:* Network timeout after 30000ms connecting to ArcGIS FeatureServer"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Action Required:* Check ArcGIS API status. Heritage site data is stale (last success: 2026-02-12). Review quarantine table for validation errors."
      }
    }
  ]
}
```

---

## Contract Versioning

**Current Version**: 1.0.0  
**Breaking Changes**: Require major version bump (2.0.0)  
**Compatible Changes**: Minor version bump (1.1.0)  
**Bug Fixes**: Patch version bump (1.0.1)

### Compatibility Promise

Import operations will maintain backward compatibility for:
- Database schema (migrations can add fields, not remove)
- Log format (can add fields, not remove required fields)
- Environment variables (can add new, not change existing names)

Breaking changes require migration guide and deprecation period (minimum 1 release cycle).
