# DroneGo Backend API

> Flight zone map backend service with PostgreSQL + PostGIS spatial queries

## Architecture Overview

**Tech Stack:**
- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: Express 4.18
- **Database**: PostgreSQL 15 + PostGIS 3.3
- **Testing**: Vitest (unit/integration), Supertest (contract tests)
- **Logging**: Winston structured logging

**Project Structure:**
```
src/
├── models/          # Database models (BaseModel, DataSource, RestrictionZone, PropertyRestriction)
├── services/        # Business logic (location-service, geospatial-service, property-service)
├── routes/          # Express route handlers (location, zones, property-restrictions)
├── lib/             # Infrastructure (db, logger, config, migrations)
├── scripts/         # Data import scripts (NATS, heritage sites)
└── server.ts        # Application entry point

tests/
├── unit/            # Unit tests for models and services
├── integration/     # Integration tests for end-to-end flows
└── contract/        # HTTP API contract tests

migrations/          # SQL schema migrations
seeds/               # Database seed data
```

## Development Setup

### Prerequisites
- Node.js 20.0+ and npm 10.0+
- Docker (for PostgreSQL + PostGIS container)
- Git

### Initial Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start PostgreSQL + PostGIS container:**
   ```bash
   docker-compose up -d postgres
   ```

   Verify container is running:
   ```bash
   docker ps --filter "name=dronego-postgres"
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials (default works with docker-compose)
   ```

4. **Run database migrations:**
   ```bash
   npm run migrate
   ```

5. **Start development server:**
   ```bash
   npm run dev
   ```

   API will be available at `http://localhost:3000`

6. **Verify health:**
   ```bash
   curl http://localhost:3000/health
   ```

## Running Tests

**All tests (watch mode):**
```bash
npm test
```

**All tests (single run):**
```bash
npm test -- --run
```

**Coverage report (requires ≥90% per Constitution §I):**
```bash
npm run test:coverage
```

**Specific test file:**
```bash
npm test -- tests/unit/services/location-service.test.ts
```

**Contract tests only:**
```bash
npm test -- tests/contract/
```

## API Endpoints Summary

### Core Endpoints

**Location Check** (tri-state flight permission)
```http
GET /api/v1/location/check?lat={latitude}&lng={longitude}
```
Returns: `flight_status` (permitted/prohibited/check-property-restrictions), zones, property restrictions

**Zones Query** (bounding box)
```http
GET /api/v1/zones?minLng={minLng}&minLat={minLat}&maxLng={maxLng}&maxLat={maxLat}
```
Returns: Restriction zones within bounding box

**Property Restrictions** (heritage sites)
```http
GET /api/v1/property-restrictions?minLng={minLng}&minLat={minLat}&maxLng={maxLng}&maxLat={maxLat}
```
Returns: Property-based restrictions (advisory, not legal)

**Health Check**
```http
GET /health
```

See `specs/001-flight-zone-map/contracts/` for full API specifications.

## PostGIS Spatial Query Patterns

### Point-in-Polygon (Location Check)
```sql
SELECT * FROM restriction_zones
WHERE ST_Intersects(
  geometry,
  ST_SetSRID(ST_MakePoint($1, $2), 4326)
);
```

### Bounding Box Query (Map Viewport)
```sql
SELECT * FROM restriction_zones
WHERE ST_Intersects(
  geometry,
  ST_MakeEnvelope($1, $2, $3, $4, 4326)
);
```

### Spatial Index Usage (GIST)
All geometry columns have GIST indexes with `fillfactor=90` for optimal spatial query performance.

## Database Migrations

**Run all pending migrations:**
```bash
npm run migrate
```

**Create new migration:**
```bash
# Create file: migrations/00X_description.sql
# Migration system auto-detects and runs in order
```

**Migration format:**
```sql
-- Migration: 00X_description.sql
-- Description: What this migration does
-- Date: YYYY-MM-DD

CREATE TABLE example (...);
CREATE INDEX idx_example ON example USING GIST (geometry);
```

## Data Import Scripts

**Import NATS airspace data:**
```bash
npx tsx src/scripts/import-nats-zones.ts
```

**Import heritage sites:**
```bash
npx tsx src/scripts/import-heritage-sites.ts
```

## Performance Considerations

- **Location check**: Must complete in <5 seconds (FR-026)
- **Zone queries**: GIST spatial indexes with fillfactor=90
- **Connection pooling**: Max 20 connections (configurable via `DB_POOL_MAX`)
- **Rate limiting**: 100 requests per 15-minute window per IP (NFR-009)

## Logging

Structured JSON logging via Winston:
```typescript
import { logger } from './lib/logger.js';

logger.info('Operation successful', { userId, operation });
logger.error('Operation failed', { error, context });
```

**Log Levels:**
- `error`: Application errors, exceptions
- `warn`: Recoverable issues, deprecations
- `info`: Request logs, business events (default)
- `debug`: Detailed debugging information

## Constitution Compliance

Per `specs/001-flight-zone-map/constitution.md`:

- **§I Safety-First**: 100% test coverage required for geospatial queries
- **§II Modular**: Clear separation between models, services, routes
- **§III TDD**: Write tests FIRST, verify FAIL, then implement
- **§IV Documentation**: Maintain README, inline docs, API contracts
- **§V Security**: Rate limiting, HTTPS-only (production), input validation

## Troubleshooting

**Database connection errors:**
```bash
# Check container is running
docker ps | grep dronego-postgres

# Check connection
docker exec dronego-postgres psql -U dronego -d dronego -c "SELECT NOW();"
```

**Test failures:**
```bash
# Clean test database
docker exec dronego-postgres psql -U dronego -d dronego -c "
  DELETE FROM restriction_zones WHERE restriction_name LIKE 'Test%';
  DELETE FROM toal_sites WHERE site_name LIKE 'Test%';
"
```

**Migration issues:**
```bash
# Check applied migrations
docker exec dronego-postgres psql -U dronego -d dronego -c "
  SELECT version, applied_at FROM schema_migrations ORDER BY version;
"
```

## Contributing

1. Create feature branch: `git checkout -b feature/your-feature`
2. Write tests FIRST (Constitution §III)
3. Implement feature
4. Verify coverage ≥90%: `npm run test:coverage`
5. Run linter: `npm run lint`
6. Commit and push
7. Create pull request

## License

MIT
