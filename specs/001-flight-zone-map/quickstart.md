# Quickstart Guide: Heritage Site Integration

**Date**: 2026-02-18  

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ with PostGIS 3+
- Docker & Docker Compose (for database)

## Setup Steps

### 1. Database Migration

```bash
cd backend
npm run migrate  # Runs 002_property_restrictions.sql
```

### 2. Import Heritage Data

```bash
# Historic England (Scheduled Monuments + Parks & Gardens)
npx tsx src/scripts/import-historic-england.ts

# National Trust (Always Open + Limited Access)
npx tsx src/scripts/import-national-trust.ts

# Expected: ~2,500 property restrictions imported
```

### 3. Start Services

```bash
# Backend API
cd backend
npm run dev  # Starts on port 3000

# Frontend PWA
cd frontend
npm run dev  # Starts on port 5173
```

### 4. Test Heritage Layers

1. Open http://localhost:5173
2. Toggle "Heritage Sites" layer in layer controls
3. Click location near Stonehenge (-1.8262, 51.1789)
4. Verify tri-state response: `flight_status: 'check-property-restrictions'`
5. Confirm property advisory shows "English Heritage Trust" policy

### 5. Verify API

```bash
curl "http://localhost:3000/api/v1/location/check?lat=51.1789&lng=-1.8262"

# Expected response:
# {
#   "flight_status": "check-property-restrictions",
#   "airspace_clear": true,
#   "property_advisory": true,
#   "property_restrictions": [{
#     "property_name": "Stonehenge",
#     "organization": "English Heritage Trust",
#     ...
#   }]
# }
```

## Development Workflow

- **Tests**: `npm run test` (backend + frontend)
- **Coverage**: `npm run test:coverage` (target: ≥90%)
- **Lint**: `npm run lint`
- **Weekly Sync**: `npx tsx src/scripts/sync-data.ts` (automated via node-schedule)

## Troubleshooting

- **No heritage sites visible**: Check data import logs for errors
- **Slow location checks**: Verify GIST indexes exist (`\di` in psql)
- **Wrong flight_status**: Check spatial query logic in location-service.ts
