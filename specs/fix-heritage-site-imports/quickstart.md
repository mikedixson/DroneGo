# Quickstart: Heritage Site Import and Display

**Feature**: fix-heritage-site-imports  
**Date**: 2026-02-19  
**Time to Complete**: 15-20 minutes

## Overview

This guide walks you through setting up, testing, and running the heritage site import system. By the end, you'll have:
- Database schema extended with simplified geometries and quarantine table
- Import scripts configured and tested
- Heritage sites displaying on the map with zoom-level-optimized boundaries

## Prerequisites

- Node.js 20+ and npm 10+ installed
- PostgreSQL 14+ with PostGIS 3+ extension
- Docker (for local database) OR remote PostgreSQL connection
- Git repository cloned locally

## Quick Start (30 seconds)

```bash
# From repository root
cd backend

# Run database migrations
npm run migrate

# Import National Trust heritage sites (takes ~3-5 minutes)
npm run import:national-trust

# Import Historic England sites (takes ~15-25 minutes)
npm run import:historic-england

# Verify imports succeeded
psql -h localhost -U dronego -d dronego -c "SELECT COUNT(*) FROM property_restrictions WHERE restriction_category = 'HERITAGE_SITE';"
```

**Expected Result**: Count should show ~1,650 National Trust + ~18,000 Historic England = ~19,650 total heritage sites.

---

## Step-by-Step Setup

### 1. Database Setup (5 minutes)

#### Option A: Docker (Recommended for Development)

```bash
# Start PostgreSQL with PostGIS
docker run -d \
  --name dronego-postgres \
  -e POSTGRES_USER=dronego \
  -e POSTGRES_PASSWORD=dronego_dev_password \
  -e POSTGRES_DB=dronego \
  -p 5432:5432 \
  postgis/postgis:14-3.3

# Enable PostGIS extension
docker exec -it dronego-postgres psql -U dronego -d dronego -c "CREATE EXTENSION IF NOT EXISTS postgis;"
docker exec -it dronego-postgres psql -U dronego -d dronego -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

# Verify PostGIS version
docker exec -it dronego-postgres psql -U dronego -d dronego -c "SELECT PostGIS_Version();"
```

#### Option B: Existing PostgreSQL Installation

```sql
-- As superuser
CREATE DATABASE dronego;
\c dronego
CREATE EXTENSION postgis;
CREATE EXTENSION pg_trgm;

-- Verify
SELECT PostGIS_Version();
SELECT extname FROM pg_extension WHERE extname IN ('postgis', 'pg_trgm');
```

### 2. Environment Configuration (2 minutes)

Create `.env` file in `backend/` directory:

```bash
# Database connection
DATABASE_URL=postgresql://dronego:dronego_dev_password@localhost:5432/dronego

# API endpoints (use public ArcGIS FeatureServers)
NATIONAL_TRUST_API_URL=https://services.arcgis.com/nGt4QxSblgDfeJn9/arcgis/rest/services/National_Trust_Always_Open/FeatureServer/0
HISTORIC_ENGLAND_API_URL=https://services1.arcgis.com/fvemHYAYBgeeJ8Hg/arcgis/rest/services/Listed_Buildings/FeatureServer/0

# Logging
LOG_LEVEL=info

# Optional: Slack alerts (leave empty for console-only)
SLACK_WEBHOOK_URL=

# Optional: Import batch size (default: 1000)
IMPORT_BATCH_SIZE=1000
```

### 3. Run Database Migrations (2 minutes)

```bash
cd backend

# Install dependencies if not already done
npm install

# Run migrations
npm run migrate

# Verify schema
psql $DATABASE_URL -c "\d property_restrictions"
psql $DATABASE_URL -c "\d heritage_sites_import_errors"
psql $DATABASE_URL -c "\d data_sources"
```

**Expected Output**: Tables should have columns matching data-model.md schema, including:
- `property_restrictions.geometry_simplified_low`
- `property_restrictions.geometry_simplified_medium`
- `property_restrictions.superseded_by`
- `heritage_sites_import_errors` table exists
- `data_sources.health_status` column exists

### 4. Test Import (Development) (3 minutes)

Test with small dataset before full import:

```typescript
// backend/src/scripts/test-import.ts
import { importNationalTrustSites } from './import-national-trust';

async function testImport() {
  console.log('Testing import with limited records...');
  
  // Temporarily override batch size to import only 100 records
  process.env.IMPORT_BATCH_SIZE = '100';
  process.env.IMPORT_MAX_BATCHES = '1';  // Stop after 1 batch
  
  const result = await importNationalTrustSites();
  
  console.log('Test import result:', JSON.stringify(result, null, 2));
  
  if (result.success) {
    console.log('✅ Test import successful!');
    console.log(`   - Inserted: ${result.records_inserted}`);
    console.log(`   - Quarantined: ${result.records_quarantined}`);
  } else {
    console.error('❌ Test import failed:', result.error_message);
    process.exit(1);
  }
}

testImport();
```

```bash
# Run test import
npx tsx src/scripts/test-import.ts

# Verify test data
psql $DATABASE_URL -c "SELECT property_name, managing_organization FROM property_restrictions LIMIT 5;"
```

### 5. Production Import (20-30 minutes total)

#### Import National Trust Sites (~3-5 minutes)

```bash
npm run import:national-trust
```

**Watch Progress**:
```bash
# In separate terminal, tail logs
tail -f logs/import-combined.log | grep "National Trust"
```

**Expected Output**:
```json
{
  "timestamp": "2026-02-19T14:30:00.000Z",
  "level": "info",
  "message": "Heritage site import completed successfully",
  "data_source": "National Trust",
  "operation_type": "success",
  "records_processed": 1692,
  "records_failed": 42,
  "duration_ms": 185000,
  "error_summary": "42 geometries quarantined (see heritage_sites_import_errors table)"
}
```

#### Import Historic England Sites (~15-25 minutes)

```bash
npm run import:historic-england
```

**Expected Output**:
```json
{
  "timestamp": "2026-02-19T14:55:00.000Z",
  "level": "info", 
  "message": "Heritage site import completed successfully",
  "data_source": "Historic England",
  "operation_type": "success",
  "records_processed": 18247,
  "records_failed": 203,
  "duration_ms": 1340000
}
```

### 6. Verify Import Results (2 minutes)

```bash
# Total heritage sites imported
psql $DATABASE_URL -c "
  SELECT 
    COUNT(*) as total_sites,
    COUNT(*) FILTER (WHERE is_primary = true) as primary_records,
    COUNT(*) FILTER (WHERE superseded_by IS NOT NULL) as duplicates_merged
  FROM property_restrictions 
  WHERE restriction_category = 'HERITAGE_SITE';
"

# Sites by managing organization
psql $DATABASE_URL -c "
  SELECT 
    managing_organization,
    COUNT(*) as site_count
  FROM property_restrictions 
  WHERE restriction_category = 'HERITAGE_SITE' AND is_primary = true
  GROUP BY managing_organization
  ORDER BY site_count DESC;
"

# Quarantine summary
psql $DATABASE_URL -c "
  SELECT 
    error_type,
    COUNT(*) as error_count
  FROM heritage_sites_import_errors
  WHERE resolved = false
  GROUP BY error_type
  ORDER BY error_count DESC;
"

# Data source health
psql $DATABASE_URL -c "
  SELECT 
    authority_name,
    health_status,
    last_successful_import,
    consecutive_failure_count,
    success_rate_7day
  FROM data_sources
  WHERE 'heritage-site' = ANY(data_type_provided);
"
```

### 7. Test Frontend Display (3 minutes)

```bash
# Start backend API (if not already running)
cd backend
npm run dev  # Runs on http://localhost:3001

# In separate terminal, start frontend
cd ../frontend
npm run dev  # Runs on http://localhost:5174
```

**Manual Test in Browser**:
1. Open http://localhost:5174/
2. Navigate to London area (search "London" or zoom to coordinates: 51.5074, -0.1278)
3. Toggle "🏛️ Heritage Sites" layer checkbox
4. Verify amber polygons appear for known sites:
   - Tower of London (-0.076132, 51.508112)
   - Westminster Abbey (-0.1275, 51.4994)
   - Kew Gardens (-0.295 to -0.280, 51.475 to 51.485)
   - Greenwich Park (-0.001 to 0.005, 51.476 to 51.483)
5. Click a heritage site polygon → detail panel should display
6. Verify polygon temporarily elevates above other layers when clicked
7. Zoom in/out → verify boundary detail changes (simplified at lower zoom)

---

## Development Workflow

### Running Imports on Schedule (Production)

```typescript
// backend/src/schedulers/heritage-import-scheduler.ts
import schedule from 'node-schedule';
import { importNationalTrustSites } from '../scripts/import-national-trust';
import { importHistoricEnglandSites } from '../scripts/import-historic-england';
import logger from '../lib/logger';

// Run National Trust import every Sunday at 2 AM
schedule.scheduleJob('0 2 * * 0', async () => {
  logger.info('Scheduled National Trust import starting');
  try {
    await importNationalTrustSites();
  } catch (err) {
    logger.error('Scheduled import failed', { data_source: 'National Trust', error: err.message });
  }
});

// Run Historic England import every Sunday at 3 AM
schedule.scheduleJob('0 3 * * 0', async () => {
  logger.info('Scheduled Historic England import starting');
  try {
    await importHistoricEnglandSites();
  } catch (err) {
    logger.error('Scheduled import failed', { data_source: 'Historic England', error: err.message });
  }
});

logger.info('Heritage site import scheduler initialized (weekly Sunday 2-3 AM)');
```

### Debugging Import Failures

```bash
# Check recent error logs
cat logs/import-error.log | tail -n 50 | jq

# Review quarantined geometries
psql $DATABASE_URL -c "
  SELECT 
    error_id,
    source_record_id,
    error_type,
    error_details,
    LEFT(raw_geometry_text, 100) as geometry_preview
  FROM heritage_sites_import_errors
  WHERE resolved = false
  ORDER BY quarantine_timestamp DESC
  LIMIT 10;
"

# Test specific geometry repair
psql $DATABASE_URL -c "
  SELECT 
    ST_IsValid(ST_GeomFromGeoJSON(raw_geometry_text)),
    ST_IsValidReason(ST_GeomFromGeoJSON(raw_geometry_text))
  FROM heritage_sites_import_errors
  WHERE error_id = '<error_id_here>';
"
```

### Manual Duplicate Resolution

```sql
-- Find potential duplicates by distance and name similarity
WITH site AS (
  SELECT * FROM property_restrictions WHERE property_restriction_id = '<id>'
)
SELECT 
  pr.property_restriction_id,
  pr.property_name,
  pr.managing_organization,
  ST_Distance(ST_Centroid(pr.geometry), ST_Centroid(site.geometry)) * 111000 AS distance_meters,
  similarity(pr.property_name, site.property_name) AS name_similarity,
  pr.is_primary,
  pr.superseded_by
FROM property_restrictions pr, site
WHERE 
  pr.property_restriction_id != site.property_restriction_id
  AND ST_DWithin(ST_Centroid(pr.geometry), ST_Centroid(site.geometry), 0.0025)
ORDER BY distance_meters;

-- Mark duplicate as superseded (if confirmed manually)
UPDATE property_restrictions
SET 
  is_primary = false,
  superseded_by = '<preferred_record_id>'
WHERE property_restriction_id = '<duplicate_id>';
```

---

## Testing

### Unit Tests

```bash
# Run import validation tests
npm test -- tests/unit/services/heritage-import-validator.test.ts

# Run duplicate detection tests
npm test -- tests/unit/services/duplicate-detector.test.ts

# Coverage report
npm run test:coverage
```

### Integration Tests

```bash
# Test full import cycle with test data
npm test -- tests/integration/heritage-import.integ.test.ts

# Test database transactions and rollback
npm test -- tests/integration/import-transaction.integ.test.ts
```

### Test Data

```sql
-- Insert test heritage site for development
INSERT INTO property_restrictions (
  property_name,
  managing_organization,
  geometry,
  geometry_simplified_low,
  geometry_simplified_medium,
  policy_text,
  contact_info,
  restriction_category,
  data_source_id,
  is_primary
)
SELECT
  'Test Heritage Site - Dev Only',
  'Test Organization',
  ST_Multi(ST_GeomFromText('POLYGON((-0.1 51.5, -0.1 51.51, -0.09 51.51, -0.09 51.5, -0.1 51.5))', 4326)),
  ST_Multi(ST_Simplify(ST_GeomFromText('POLYGON((-0.1 51.5, -0.1 51.51, -0.09 51.51, -0.09 51.5, -0.1 51.5))', 4326), 0.0001)),
  ST_Multi(ST_Simplify(ST_GeomFromText('POLYGON((-0.1 51.5, -0.1 51.51, -0.09 51.51, -0.09 51.5, -0.1 51.5))', 4326), 0.00005)),
  'Test site for development. Drone flights prohibited for testing purposes.',
  'test@example.com',
  'HERITAGE_SITE',
  (SELECT source_id FROM data_sources WHERE authority_name = 'National Trust' LIMIT 1),
  true;
```

---

## Troubleshooting

### Import Script Fails Silently

**Symptom**: `npm run import:national-trust` completes with no output.

**Solution**:
```bash
# Check if script is actually running
ps aux | grep tsx

# Run with explicit logging
LOG_LEVEL=debug npm run import:national-trust

# Check for environment variable issues
node -e "console.log(require('dotenv').config())"
```

### Geometry Validation Fails

**Symptom**: High quarantine rate (>10%) indicates data quality issues.

**Solution**:
```sql
-- Analyze quarantine errors
SELECT error_type, COUNT(*), 
       string_agg(DISTINCT SUBSTRING(error_details, 1, 50), '; ') as sample_errors
FROM heritage_sites_import_errors
WHERE resolved = false
GROUP BY error_type;

-- Test geometry repair for specific error
SELECT 
  ST_IsValid(ST_MakeValid(ST_GeomFromGeoJSON(raw_geometry_text))) as can_be_repaired,
  ST_AsText(ST_MakeValid(ST_GeomFromGeoJSON(raw_geometry_text))) as repaired_geom
FROM heritage_sites_import_errors
WHERE error_type = 'topology_invalid'
LIMIT 1;
```

### API Rate Limiting

**Symptom**: Import logs show "Rate limited, waiting 60s before retry" messages.

**Solution**:
```bash
# Reduce batch size to stay under rate limit
IMPORT_BATCH_SIZE=500 npm run import:national-trust

# Add delay between batches (edit import script)
# await sleep(2000); // 2 second delay between batches
```

### Database Connection Timeout

**Symptom**: "Connection terminated unexpectedly" or "ETIMEDOUT".

**Solution**:
```bash
# Increase connection timeout in .env
DATABASE_CONNECTION_TIMEOUT=60000

# Check PostgreSQL max_connections
psql $DATABASE_URL -c "SHOW max_connections;"

# Check current connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"
```

---

## Next Steps

- **Schedule Production Imports**: Add cron jobs or use scheduler (see Development Workflow above)
- **Configure Alerts**: Set `SLACK_WEBHOOK_URL` for operational notifications
- **Monitor Data Source Health**: Create dashboard using `data_sources` health metrics
- **Review Quarantine**: Periodically check `heritage_sites_import_errors` and resolve manually if needed
- **Optimize Performance**: Monitor import duration and adjust batch size if needed

## Resources

- **Data Model**: [data-model.md](./data-model.md) - Full database schema
- **API Contracts**: [contracts/import-operations.md](./contracts/import-operations.md) - Import operation specifications
- **Research**: [research.md](./research.md) - Technical decisions and rationale
- **Parent Feature Spec**: [001-flight-zone-map/spec.md](../001-flight-zone-map/spec.md) - Overall project requirements
