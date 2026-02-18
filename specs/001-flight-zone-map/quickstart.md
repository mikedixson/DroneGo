# Quickstart Guide: Drone Flight Zone Map

**Feature**: 001-flight-zone-map  
**Last Updated**: 2026-02-17  
**Estimated Setup Time**: 30-45 minutes

---

## Overview

This guide will help you set up the DroneGo Flight Zone Map development environment and get the application running locally. The project consists of a **frontend PWA** (Progressive Web App) and a **backend REST API** with geospatial database.

**Tech Stack:**
- Frontend: TypeScript + Vite + Leaflet + Workbox
- Backend: Node.js 20 + Express + PostgreSQL 15 + PostGIS
- Testing: Vitest + Playwright

---

## Prerequisites

Install the following software before starting:

### Required
- **Node.js 20 LTS**: https://nodejs.org/ (includes npm)
- **Git**: https://git-scm.com/downloads
- **Docker & Docker Compose**: https://www.docker.com/get-started (recommended)
  - **OR** PostgreSQL 15+: https://www.postgresql.org/download/ (if not using Docker)

### Recommended
- **VS Code**: https://code.visualstudio.com/ with extensions:
  - ESLint
  - Prettier
  - REST Client (for API testing)
  - PostgreSQL (for database management)
  - Docker (if using Docker)

### Verification
```bash
node --version    # Should show v20.x.x
npm --version     # Should show 10.x.x
git --version     # Should show 2.x.x

# If using Docker
docker --version  # Should show Docker version 20.x or higher
docker-compose --version  # Should show docker-compose version 1.29 or higher

# If using local PostgreSQL
psql --version    # Should show 15.x or higher
```

---

## Quick Setup (5 Minutes)

### 1. Clone Repository
```bash
git clone <REPOSITORY_URL> dronego
cd dronego
git checkout 001-flight-zone-map
```

### 2. Install Dependencies
```bash
# Backend dependencies
cd backend
npm install

# Frontend dependencies
cd ../frontend
npm install
```

### 3. Database Setup

**Option A: Docker (Recommended - Fastest Setup)**
```bash
# From project root
docker-compose -f docker-compose.dev.yml up -d

# Wait for PostgreSQL to start (check logs)
docker-compose -f docker-compose.dev.yml logs -f postgres
# Press Ctrl+C when you see "database system is ready to accept connections"

# Run migrations (from backend directory)
cd backend
npm run db:migrate
npm run db:seed
```

**Option B: Local PostgreSQL**
```bash
# Create database (Windows PowerShell)
psql -U postgres -c "CREATE DATABASE dronego_dev;"
psql -U postgres -d dronego_dev -c "CREATE EXTENSION IF NOT EXISTS postgis;"
psql -U postgres -d dronego_dev -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"

# Run migrations (from backend directory)
cd backend
npm run db:migrate
npm run db:seed
```

### 4. Environment Configuration
```bash
# Backend environment (create backend/.env)
# Note: If using Docker, DB_HOST=localhost. If running backend in Docker, use DB_HOST=postgres
cat > backend/.env << EOF
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=dronego
DB_USER=dronego
DB_PASSWORD=dronego_dev_password
JWT_SECRET=dev-secret-change-in-production
JWT_EXPIRATION=24h
NATS_DATA_URL=https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/digital-datasets/
NOTAM_DATA_URL=https://www.notams.faa.gov/api
DATA_SYNC_INTERVAL_HOURS=24
LOG_LEVEL=debug
CORS_ORIGIN=http://localhost:5173
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF

# Frontend environment (create frontend/.env)
cat > frontend/.env << EOF
VITE_API_BASE_URL=http://localhost:3000/api/v1
VITE_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
EOF
```

### 5. Start Development Servers
```bash
# Terminal 1: Start backend (from backend/)
npm run dev

# Terminal 2: Start frontend (from frontend/)
npm run dev
```

### 6. Access Application
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000/api/v1
- **API Health**: http://localhost:3000/api/v1/health

---

## Detailed Setup

### Database Setup

#### Option A: Docker with PostGIS (Recommended)

**Benefits:**
- No manual PostgreSQL installation
- Automatic PostGIS extension setup
- Consistent environment across team
- Easy cleanup and reset

**Setup:**
```bash
# Start PostgreSQL with PostGIS
docker-compose -f docker-compose.dev.yml up -d

# Verify container is running
docker ps | grep dronego-postgres-dev

# View logs
docker-compose -f docker-compose.dev.yml logs -f postgres

# Run migrations
cd backend
npm run db:migrate

# Seed initial data
npm run db:seed
```

**Container Management:**
```bash
# Stop database
docker-compose -f docker-compose.dev.yml stop

# Start database (after stopping)
docker-compose -f docker-compose.dev.yml start

# Restart database
docker-compose -f docker-compose.dev.yml restart

# Stop and remove container (keeps data volume)
docker-compose -f docker-compose.dev.yml down

# Stop and remove container + data volume (complete reset)
docker-compose -f docker-compose.dev.yml down -v
```

**Database Access:**
```bash
# Connect via psql
docker exec -it dronego-postgres-dev psql -U dronego -d dronego

# Backup database
docker exec dronego-postgres-dev pg_dump -U dronego dronego > backup.sql

# Restore database
docker exec -i dronego-postgres-dev psql -U dronego dronego < backup.sql
```

#### Option B: Local PostgreSQL with PostGIS

**Windows (using psql via PowerShell)**
```powershell
# Start PostgreSQL service if not running
Start-Service postgresql-x64-15

# Connect to PostgreSQL
psql -U postgres

# In psql prompt:
CREATE DATABASE dronego_dev;
\c dronego_dev
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
\q

# Run database migrations
cd backend
npm run db:migrate

# Seed initial data (data sources)
npm run db:seed
```

**macOS (using Homebrew PostgreSQL)**
```bash
# Start PostgreSQL service
brew services start postgresql@15

# Create database
createdb dronego_dev

# Enable extensions
psql dronego_dev -c "CREATE EXTENSION IF NOT EXISTS postgis;"
psql dronego_dev -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"

# Run migrations
cd backend
npm run db:migrate
npm run db:seed
```

### Verify Database Setup
```sql
-- Connect to database
psql -U postgres -d dronego_dev

-- Check PostGIS version
SELECT PostGIS_Version();

-- List tables
\dt

-- Should see: data_sources, restriction_zones, toal_sites, 
--             airspace_classifications, temporary_restrictions
```

---

## Development Workflow

### Running Tests

#### Backend Tests
```bash
cd backend

# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration

# Run contract tests (API spec validation)
npm run test:contract

# Run tests with coverage
npm run test:coverage
```

#### Frontend Tests
```bash
cd frontend

# Run unit tests
npm run test

# Run E2E tests (requires backend running)
npm run test:e2e

# Run E2E tests in UI mode
npm run test:e2e:ui

# Run PWA-specific tests
npm run test:pwa
```

### Code Quality

#### Linting
```bash
# Backend
cd backend
npm run lint
npm run lint:fix

# Frontend
cd frontend
npm run lint
npm run lint:fix
```

#### Type Checking
```bash
# Backend
npm run typecheck

# Frontend
npm run typecheck
```

### Database Management

#### Migrations
```bash
cd backend

# Create new migration
npm run db:migrate:create -- add_new_field_to_zones

# Run pending migrations
npm run db:migrate

# Rollback last migration
npm run db:migrate:down

# Reset database (⚠️ destructive)
npm run db:reset
```

#### Seeding Development Data
```bash
# Seed initial data sources
npm run db:seed

# Load sample restriction zones (UK test data)
npm run db:seed:zones

# Load sample TOAL sites
npm run db:seed:toal
```

---

## Loading Initial Airspace Data

### Manual NATS Data Load (Development)

1. **Download NATS Digital Datasets**:
   - Visit https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/digital-datasets/
   - Download latest UK UAS Geographic Zones (GeoJSON or KML format)
   - Save to `backend/data/nats-zones.geojson`

2. **Import into Database**:
   ```bash
   cd backend
   npm run data:import -- --source nats --file data/nats-zones.geojson
   ```

3. **Verify Import**:
   ```sql
   psql -U postgres -d dronego_dev -c "SELECT COUNT(*) FROM restriction_zones;"
   # Should show imported zone count
   ```

### Automated Data Sync (Production Approach)

```bash
# Configure NATS digital dataset download in backend/.env
NATS_DATA_URL=https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/digital-datasets/

# Run data sync
npm run data:sync -- --source nats

# Schedule daily sync (cron job or scheduled task)
# Add to crontab (Linux/Mac): 
# 0 8 * * * cd /path/to/backend && npm run data:sync -- --source all

# Or create Windows Scheduled Task to run daily at 8 AM
```

---

## API Usage Examples

### Check Flight Permission (P1 - Current Location)
```bash
# Using curl
curl http://localhost:3000/api/v1/location/check?lat=51.5074&lon=-0.1275

# Using REST Client in VS Code (create test.http file):
GET http://localhost:3000/api/v1/location/check?lat=51.5074&lon=-0.1275
```

**Example Response:**
```json
{
  "location": {
    "lat": 51.5074,
    "lon": -0.1275,
    "altitude_agl": 120
  },
  "restriction_status": "authorization-required",
  "recommendation": {
    "can_fly": false,
    "requires_authorization": true,
    "reason": "Location is within controlled airspace (London TMA)"
  },
  "applicable_zones": [...],
  "nearest_toal": {...}
}
```

### Query Restriction Zones
```bash
# Get zones in bounding box (London area)
curl "http://localhost:3000/api/v1/zones?bounds=-0.5,51.4,0.0,51.6"
```

### Search Location by Postcode
```bash
# Search for postcode
curl "http://localhost:3000/api/v1/location/search?q=SW1A+1AA"
```

### Health Check
```bash
curl http://localhost:3000/api/v1/health
```

---

## Project Structure

```
dronego/
├── backend/
│   ├── src/
│   │   ├── models/           # Database models (Restriction Zone, TOAL Site, etc.)
│   │   ├── services/         # Business logic (geospatial queries, data ingestion)
│   │   ├── api/              # Express routes and controllers
│   │   │   ├── zones.ts
│   │   │   ├── toal.ts
│   │   │   └── location.ts
│   │   ├── lib/              # Utilities (DB connection, logging, etc.)
│   │   └── server.ts         # Express app entry point
│   ├── tests/
│   │   ├── unit/             # Unit tests (services, utilities)
│   │   ├── integration/      # Integration tests (DB + services)
│   │   └── contract/         # API contract tests (OpenAPI validation)
│   ├── migrations/           # Database schema migrations
│   ├── seeds/                # Database seed data
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/       # UI components (Map, ZoneLayer, SearchBar, etc.)
│   │   ├── services/         # API client, cache manager, geolocation
│   │   ├── lib/              # Utilities (coordinate helpers, date formatting)
│   │   ├── pages/            # Main map page, zone detail views
│   │   └── main.ts           # App entry point
│   ├── public/               # Static assets (manifest.json, icons, service worker)
│   ├── tests/
│   │   ├── unit/             # Component and service unit tests
│   │   └── e2e/              # Playwright E2E tests
│   └── package.json
│
└── specs/
    └── 001-flight-zone-map/
        ├── spec.md           # Feature specification
        ├── plan.md           # Implementation plan (this artifact)
        ├── research.md       # Phase 0 research findings
        ├── data-model.md     # Phase 1 data entities
        ├── quickstart.md     # This file
        └── contracts/        # API OpenAPI spec
```

---

## Common Issues & Troubleshooting

### PostgreSQL Connection Failed
**Error**: `ECONNREFUSED` or `connection to server at "localhost" failed`

**Solution**:
- Verify PostgreSQL is running: `pg_isready -U postgres`
- Check DATABASE_URL in `backend/.env` matches your PostgreSQL configuration
- Verify port (default 5432): `psql -U postgres -p 5432`

### PostGIS Extension Missing
**Error**: `ERROR: type "geometry" does not exist`

**Solution**:
```sql
-- Connect to your database
psql -U postgres -d dronego_dev

-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Verify installation
SELECT PostGIS_Version();
```

### Port Already in Use
**Error**: `EADDRINUSE: address already in use :::3000`

**Solution**:
```bash
# Find process using port 3000
lsof -i :3000  # Mac/Linux
netstat -ano | findstr :3000  # Windows

# Kill process or change port in backend/.env
PORT=3001
```

### Frontend Can't Connect to Backend
**Error**: Network errors in browser console

**Solution**:
- Verify backend is running: `curl http://localhost:3000/api/v1/health`
- Check `VITE_API_BASE_URL` in `frontend/.env` matches backend URL
- Check browser console for CORS errors (backend should allow localhost origins)

### Map Tiles Not Loading
**Error**: Blank map or tile loading errors

**Solution**:
- Check `VITE_MAP_TILE_URL` in `frontend/.env`
- Verify internet connection (OpenStreetMap tiles require network)
- Try alternative tile URL: `https://tile.thunderforest.com/...` (requires API key)

---

## Next Steps

1. ✅ **Complete Setup**: Verify all services running (frontend, backend, database)
2. 📖 **Read Documentation**: Review [spec.md](spec.md) for feature requirements
3. 🧪 **Run Tests**: Ensure all tests pass before development
4. 🗺️ **Load Data**: Import sample CAA restriction zones
5. 🔨 **Start Development**: Pick a task from [tasks.md](tasks.md) (after Phase 2)

---

## Development Commands Reference

### Backend
```bash
npm run dev              # Start dev server with hot reload
npm run build            # Build for production
npm start                # Run production build
npm test                 # Run all tests
npm run lint             # Check code quality
npm run db:migrate       # Run database migrations
npm run data:sync        # Sync CAA/NATS data
```

### Frontend
```bash
npm run dev              # Start Vite dev server (http://localhost:5173)
npm run build            # Build for production
npm run preview          # Preview production build
npm test                 # Run Vitest unit tests
npm run test:e2e         # Run Playwright E2E tests
npm run lint             # Check code quality
```

---

## Additional Resources

### Documentation
- [Feature Specification](spec.md)
- [Implementation Plan](plan.md)
- [Research Findings](research.md)
- [Data Model](data-model.md)
- [API Contract](contracts/api-spec.yaml)

### External Resources
- **NATS Digital Datasets**: https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/digital-datasets/ (Primary data source)
- **UK CAA Drone Zone Map**: https://airspace.caa.co.uk/ (Web reference/visualization tool)
- **NATS AIS**: https://www.aurora.nats.co.uk/htmlAIP/
- **Leaflet Docs**: https://leafletjs.com/reference.html
- **PostGIS Manual**: https://postgis.net/documentation/
- **Vite Guide**: https://vitejs.dev/guide/
- **Vitest Docs**: https://vitest.dev/
- **Playwright Docs**: https://playwright.dev/

### Data Sources & Licenses
- **NATS Digital Datasets**: Open Government License v3.0
  - Attribution: "Contains public sector information licensed under the OGL v3.0"
  - Source: https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/digital-datasets/
- **NATS AIS**: Crown Copyright (contact for commercial redistribution terms)
- **OpenStreetMap Tiles**: Open Database License (ODbL)

---

## Support

For issues or questions:
1. Check [Troubleshooting](#common-issues--troubleshooting) section above
2. Review project documentation in `specs/001-flight-zone-map/`
3. Check existing GitHub issues (if repository established)
4. Contact development team

---

**Last Updated**: 2026-02-17  
**Version**: 1.0
