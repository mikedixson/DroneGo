# Research: Heritage Site Import and Display

**Feature**: fix-heritage-site-imports  
**Date**: 2026-02-19  
**Researcher**: AI Planning Agent

## Overview

This document consolidates research findings for technical decisions required to implement production-grade heritage site import processes with data validation, deduplication, performance optimization, and operational monitoring.

## Research Tasks

### 1. PostGIS Geometry Simplification (ST_Simplify) - Optimal Tolerance Values

**Question**: What tolerance values for ST_Simplify provide acceptable visual quality while maximizing performance for UK heritage site boundaries at different zoom levels?

**Findings**:

**Context**: UK geographic coordinates in WGS84 (EPSG:4326) where 1° ≈ 111km at equator, varying by latitude. At UK latitude (~51°N), 1° longitude ≈ 69km, 1° latitude ≈ 111km.

**Tolerance Calculations**:
- `0.0001°` ≈ 11 meters latitude, 7 meters longitude (at 51°N)
- `0.00005°` ≈ 5.5 meters latitude, 3.5 meters longitude
- `0.00001°` ≈ 1.1 meters (negligible simplification)

**Zoom Level Mapping** (Leaflet standard):
- Zoom <13: City-scale view (1-10 km across), users see overview of multiple sites
- Zoom 13-15: Neighborhood-scale (100m-1km across), users planning specific locations
- Zoom >15: Street-scale (<100m across), users need precise boundaries

**Recommended Tolerances**:
- **Low detail (zoom <13)**: `0.0001°` (~10m accuracy) - Acceptable for overview, removes micro-detail
- **Medium detail (zoom 13-15)**: `0.00005°` (~5m accuracy) - Preserves site shape, light simplification
- **High detail (zoom >15)**: Original geometry (no simplification) - Full precision for planning

**Validation**: ST_Simplify with `preserve_topology=true` flag prevents self-intersections. Test with complex boundary (e.g., Greenwich Park ~1000 points) to verify visual acceptability.

**Decision**: Use three-tier simplification as specified in FR-007, FR-008.

---

### 2. PostgreSQL Fuzzy String Matching - Levenshtein Distance for Deduplication

**Question**: What PostgreSQL extension and functions enable fuzzy string matching for detecting duplicate heritage site names with 80% similarity threshold?

**Findings**:

**Extension Required**: `pg_trgm` (trigram matching)

**Installation**:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

**Functions Available**:
1. `similarity(text, text) → float4` - Returns similarity score 0-1 (1 = identical)
2. `word_similarity(text, text) → float4` - Word-level similarity
3. `levenshtein(text, text) → int` - Edit distance (requires `fuzzystrmatch` extension)

**For 80% Similarity Threshold**:
```sql
-- Option 1: pg_trgm similarity (recommended, faster)
SELECT property_name, managing_organization
FROM property_restrictions
WHERE similarity(property_name, 'Tower of London') > 0.8;

-- Option 2: Levenshtein distance (requires fuzzystrmatch)
SELECT property_name
FROM property_restrictions
WHERE levenshtein(lower(property_name), lower('Tower of London')) 
      <= (LENGTH('Tower of London') * 0.2);
```

**Performance**: pg_trgm with GIN index supports indexed similarity searches:
```sql
CREATE INDEX idx_property_name_trgm ON property_restrictions 
USING GIN (property_name gin_trgm_ops);
```

**Decision**: Use pg_trgm with `similarity()` function. 80% threshold = `similarity() > 0.8`. Create GIN index for performance (NFR-008).

---

### 3. Structured Logging with Winston - JSON Format for Operational Monitoring

**Question**: How should Winston be configured to produce structured JSON logs with required fields (timestamp, data_source, operation_type, records_processed, records_failed, duration_ms, error_summary)?

**Findings**:

**Winston JSON Format Configuration**:
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'heritage-site-import' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/import-error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/import-combined.log' 
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Usage for import operations
logger.info('Import operation started', {
  data_source: 'National Trust',
  operation_type: 'start',
  records_processed: 0,
  records_failed: 0,
  duration_ms: 0,
  error_summary: null
});

logger.info('Import operation completed', {
  data_source: 'National Trust',
  operation_type: 'success',
  records_processed: 1650,
  records_failed: 42,
  duration_ms: 125340,
  error_summary: '42 geometries quarantined: 30 topology_invalid, 12 bounds_invalid'
});

logger.error('Import operation failed', {
  data_source: 'Historic England',
  operation_type: 'failure',
  records_processed: 3200,
  records_failed: 0,
  duration_ms: 45000,
  error_summary: 'Network timeout connecting to ArcGIS FeatureServer',
  error_stack: err.stack
});
```

**Log Rotation**: Use `winston-daily-rotate-file` for production:
```typescript
import DailyRotateFile from 'winston-daily-rotate-file';

new DailyRotateFile({
  filename: 'logs/import-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d'
});
```

**Decision**: Configure Winston with JSON format and required fields per NFR-002. File transport for persistence, console transport for development.

---

### 4. Alert Notifications for Import Failures - MVP vs Production

**Question**: What alerting mechanism should be implemented for MVP given 5-minute delivery SLA (NFR-003)?

**Findings**:

**MVP Options**:
1. **Console warnings with ERROR level**: Zero configuration, visible in logs
2. **Email (nodemailer)**: Simple SMTP integration, ~10 lines of code
3. **Slack webhook**: Single POST request, ~5 lines of code
4. **File-based alerts**: Write to `alerts/` directory, external monitoring reads

**Production Options**:
1. **PagerDuty**: Requires account, Events API v2
2. **Slack with on-call rotation**: Webhook + channel mentions
3. **Email with SMS gateway**: Multi-channel delivery
4. **CloudWatch Alarms** (if AWS deployment): Auto-scaling, metrics integration

**MVP Recommendation for 5-Minute SLA**:
```typescript
// Option: Enhanced console + Slack webhook (pragmatic MVP)
async function sendAlert(message: string, severity: 'warning' | 'error'| 'critical') {
  logger.error(message, { alert: true, severity });
  
  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      await axios.post(process.env.SLACK_WEBHOOK_URL, {
        text: `🚨 [${severity.toUpperCase()}] Heritage Site Import Alert`,
        blocks: [{
          type: 'section',
          text: { type: 'mrkdwn', text: message }
        }]
      });
    } catch (err) {
      logger.error('Failed to send Slack alert', { error: err.message });
    }
  }
}

// Usage
await sendAlert(
  `Heritage site import failed for National Trust after 3 retries. Error: ${err.message}`,
  'error'
);
```

**Decision**: MVP uses enhanced console logging (ERROR level) + optional Slack webhook (env var). Production should integrate PagerDuty or equivalent per NFR-003.

---

### 5. ArcGIS REST API - Pagination and Error Handling Best Practices

**Question**: What patterns should be used for paginating large result sets from ArcGIS FeatureServer and handling rate limiting/network errors?

**Findings**:

**ArcGIS FeatureServer Pagination**:
- Maximum records per request: 1,000 (default) to 2,000 (if server configured)
- Use `resultOffset` and `resultRecordCount` parameters for pagination
- Query parameters: `where=1=1` (all records), `outFields=*`, `outSR=4326` (WGS84), `f=json`

**Pagination Pattern**:
```typescript
const BATCH_SIZE = 1000;
let offset = 0;
let allFeatures: any[] = [];
let hasMore = true;

while (hasMore) {
  const url = `${BASE_URL}/query?` + new URLSearchParams({
    where: '1=1',
    outFields: '*',
    outSR: '4326',
    f: 'json',
    resultOffset: offset.toString(),
    resultRecordCount: BATCH_SIZE.toString()
  });
  
  try {
    const response = await axios.get(url, { timeout: 30000 });
    const { features, exceededTransferLimit } = response.data;
    
    if (!features || features.length === 0) {
      hasMore = false;
    } else {
      allFeatures.push(...features);
      offset += features.length;
      hasMore = exceededTransferLimit === true;
      
      logger.info(`Fetched batch: ${features.length} records (total: ${allFeatures.length})`);
    }
  } catch (err) {
    if (err.response?.status === 429) {
      // Rate limited, wait and retry
      logger.warn('Rate limited, waiting 60s before retry');
      await sleep(60000);
      continue;
    } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      // Network timeout
      logger.error('Network timeout, aborting import', { offset, error: err.message });
      throw err;
    } else {
      throw err;
    }
  }
}
```

**Error Handling Strategies**:
1. **429 Rate Limit**: Exponential backoff (60s → 120s → 240s), max 3 retries
2. **Network Timeout**: Fail after 30s, log error, mark data source unhealthy
3. **Invalid Response Schema**: Validate required fields, quarantine malformed records
4. **Partial Success**: Commit successful records, quarantine failures, continue importing

**Coordinate Transformation**:
- UK data often in EPSG:27700 (British National Grid)
- Request WGS84 via `outSR=4326` parameter (server-side transform)
- Fallback: PostGIS `ST_Transform(geometry, 4326)` if needed

**Decision**: Implement pagination with `resultOffset`, handle 429 rate limiting with exponential backoff, use 30s timeout, validate responses before processing per FR-009, NFR-001.

---

## Summary of Decisions

| Research Area | Decision | Rationale |
|---------------|----------|-----------|
| **Geometry Simplification** | Three-tier ST_Simplify with tolerances 0.0001° (low), 0.00005° (medium), original (high) | Balances visual quality with rendering performance across zoom levels |
| **Fuzzy String Matching** | pg_trgm extension with `similarity() > 0.8` threshold + GIN index | Fast indexed searches for duplicate detection, handles name variations |
| **Structured Logging** | Winston JSON format with required fields (timestamp, data_source, operation_type, etc.) | Enables operational monitoring, log aggregation, troubleshooting |
| **Alert Notifications (MVP)** | Enhanced console logging (ERROR level) + optional Slack webhook | Zero-config for development, Slack for operational awareness |
| **ArcGIS API Pagination** | `resultOffset` with 1000-record batches, exponential backoff for rate limits, 30s timeout | Handles large datasets reliably, graceful degradation on API issues |

## Next Steps

Proceed to Phase 1: Design artifacts
- Generate data-model.md with extended schema (simplified geometries, health tracking)
- Generate API contracts for import endpoints
- Generate quickstart.md for developer onboarding
- Update agent context (.github/copilot-instructions.md)
