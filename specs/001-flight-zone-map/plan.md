# Implementation Plan: Drone Flight Zone Map

**Branch**: `001-flight-zone-map` | **Date**: 2026-02-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-flight-zone-map/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Build a Progressive Web App (PWA) for UK drone pilots to check flying restrictions and TOAL sites with real-time location checking, offline capability, and integration with official NATS airspace data. The MVP enables pilots to answer "Can I fly here?" within 5 seconds using interactive maps with PostGIS-powered geospatial queries.

## Technical Context

**Language/Version**: TypeScript 5.x (full-stack)  
**Primary Dependencies**:
- Backend: Node.js 20 LTS, Express 4.x, node-postgres (pg) 8.x, Winston 3.x, Helmet, express-rate-limit
- Frontend: Vite 5.x, Leaflet 1.9.4, Turf.js 6.5.0, Workbox 7.x (PWA), localforage (IndexedDB)

**Storage**: PostgreSQL 15 with PostGIS 3.3 extension (spatial database)  
**Testing**:
- Backend: Vitest 1.x (unit/integration), 90% minimum coverage, 100% for geospatial safety-critical
- Frontend: Vitest 1.x (unit), Playwright 1.x (E2E cross-browser)

**Target Platform**: Web application (mobile-first PWA + backend REST API), installable on iOS/Android/desktop browsers  
**Project Type**: Web application (frontend + backend)  
**Performance Goals**: 
- Map interactive in <3s on 4G
- Location status in <5s from app open
- Search results in <2s
- Map interaction ≥30fps, <100ms latency

**Constraints**:
- HTTPS-only for geolocation API access
- GDPR compliant (no location storage)
- UK aviation regulation compliance (CAA CAP722)
- Offline-capable with 48h cache staleness warnings
- Rate limiting: 100 requests/15min per IP

**Scale/Scope**:
- UK coverage (~244k km²)
- ~6 primary data tables with spatial indexes
- 4 user stories (P1-P4 priority)
- 30fps map rendering target
- Hundreds of restriction zones, dozens of TOAL sites per region

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Requirement | Status | Notes |
|-----------|-------------|--------|-------|
| **I. Safety-First** | 100% test coverage for geospatial/location services (safety-critical) | ✅ COMPLIANT | Geospatial queries determine flight legality - marked for 100% coverage (T039-TEST through T045-TEST) |
| **I. Safety-First** | Fail-safe for unavailable/stale data | ✅ COMPLIANT | Stale data >48h shows warnings with "Verify independently" disclaimer (FR-019, FR-019A) |
| **I. Safety-First** | No compromise on aviation regulations | ✅ COMPLIANT | NATS data integration specified, CAA CAP722 guidance provided, feet AMSL standard |
| **II. Modular Architecture** | Standalone modules with clear boundaries | ✅ COMPLIANT | Backend (models/services/api) and Frontend (components/services) independently testable |
| **II. Modular Architecture** | Well-defined interfaces/contracts | ✅ COMPLIANT | REST API contracts, TypeScript interfaces, database schema documented |
| **III. TDD** | Tests written before implementation | ✅ COMPLIANT | TDD workflow enforced via T###-TEST tasks before T### implementation tasks |
| **III. TDD** | User approval before implementation | ⚠️ PENDING | User approval checkpoint after Phase 2 (foundational) before Phase 3 (MVP implementation) |
| **III. TDD** | 90% minimum coverage, 100% safety-critical | ✅ COMPLIANT | Vitest configured with 90% target, 100% for geospatial/location paths |
| **IV. Documentation** | Comprehensive module documentation | ✅ COMPLIANT | README.md created, quickstart.md exists, JSDoc for public APIs planned |
| **IV. Documentation** | Structured logging | ✅ COMPLIANT | Winston logging with error/warn/info/http/debug levels, file transports configured |
| **IV. Documentation** | Actionable error messages | ✅ COMPLIANT | Custom error classes (ValidationError, NotFoundError, etc.) with context |
| **V. Security & Compliance** | Authentication for control interfaces | ⏸️ DEFERRED | No admin control interface in MVP; user-facing is read-only map |
| **V. Security & Compliance** | HTTPS/TLS encryption | ✅ COMPLIANT | Geolocation API requires HTTPS, NFR-004 mandates HTTPS for location checks |
| **V. Security & Compliance** | Privacy regulations (GDPR) | ✅ COMPLIANT | No location storage (NFR-001 through NFR-003), data minimization (NFR-005) |
| **V. Security & Compliance** | Aviation authority compliance | ✅ COMPLIANT | NATS data integration (official UK airspace source), CAA CAP722 authorization guidance, UK airspace focus |

**Overall Assessment**: ✅ **APPROVED** - All constitutional requirements met or appropriately deferred. One gate pending user approval (Section III TDD requirement).

## Project Structure

### Documentation (this feature)

```text
specs/001-flight-zone-map/
├── spec.md              # Feature specification (input)
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (technology decisions)
├── data-model.md        # Phase 1 output (entity schemas)
├── quickstart.md        # Phase 1 output (developer setup guide)
├── contracts/           # Phase 1 output (API contracts)
│   ├── openapi.yaml     # REST API specification
│   └── types.ts         # Shared TypeScript interfaces
├── checklists/
│   └── requirements.md  # Requirements validation checklist
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/          # Database models (BaseModel, RestrictionZone, etc.)
│   ├── services/        # Business logic (geospatial, zones, location, airspace)
│   ├── api/             # REST endpoints (health, zones, location, toal, airspace)
│   ├── lib/             # Infrastructure (db, logger, errorHandler, config, migrations)
│   └── server.ts        # Express app initialization
├── migrations/          # SQL schema migrations
├── seeds/               # Database seed data
├── tests/
│   ├── contract/        # API contract tests
│   ├── integration/     # Cross-module tests
│   └── unit/            # Isolated unit tests
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
└── Dockerfile

frontend/
├── src/
│   ├── components/      # UI components (Map, layers, markers, panels)
│   ├── services/        # API client, cache manager, geolocation
│   ├── lib/             # Utilities (map utils, formatters)
│   ├── types/           # TypeScript interfaces
│   ├── main.ts          # Entry point
│   └── style.css        # Global styles
├── tests/
│   ├── e2e/             # Playwright browser tests
│   └── unit/            # Component unit tests
├── public/              # Static assets (manifest, icons, etc.)
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts       # PWA + Workbox configuration
├── vitest.config.ts
└── playwright.config.ts

docker-compose.yml       # Full stack (postgres + backend)
docker-compose.dev.yml   # Dev-only postgres (recommended)
```

**Structure Decision**: Web application structure (Option 2) selected because the feature requires a PWA frontend with offline capabilities and a backend REST API for geospatial queries. Backend provides PostgreSQL/PostGIS-powered restriction checking; frontend provides interactive Leaflet map with service workers for offline access.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**No constitutional violations identified** - all requirements are met or appropriately deferred for MVP scope.

---

## Phase 0: Research & Technology Decisions

**Status**: ✅ Complete  
**Output**: [research.md](research.md)

### Summary

All technology choices resolved without ambiguity. No "NEEDS CLARIFICATION" items identified in Technical Context - all decisions align with safety-first principles and UK aviation standards.

### Key Research Findings

1. **Geospatial Database**: PostgreSQL 15 + PostGIS 3.3
   - Decision: Industry-standard spatial database with GIST indexes for efficient polygon queries
   - Rationale: Safety-critical operations require ACID compliance; PostGIS provides authoritative spatial operations

2. **Frontend Map Library**: Leaflet 1.9.4 + Turf.js 6.5.0
   - Decision: Lightweight mapping library (64KB combined) with offline caching support
   - Rationale: PWA-compatible, zero API costs, mobile-optimized, no vendor lock-in

3. **PWA Strategy**: Workbox 7.x with declarative caching
   - Decision: CacheFirst for tiles (30d), StaleWhileRevalidate for zones (24h), NetworkFirst for location (2h)
   - Rationale: Balances offline capability with data freshness requirements

4. **Data Sources**: CAA (authoritative) + NATS (operational) + Community TOAL
   - Decision: Primary authority sources for restrictions, community-curated TOAL sites with verification
   - Rationale: CAA is UK regulatory authority; no official TOAL registry exists

5. **Security & Privacy**: HTTPS-only, ephemeral location processing, rate limiting
   - Decision: No location storage, GDPR-compliant data minimization, 100 req/15min per IP
   - Rationale: Geolocation API requires secure context; privacy-first design minimizes compliance burden

**Full Documentation**: See [research.md](research.md) for detailed analysis of all 10 technology decisions with alternatives considered and best practices.

---

## Phase 1: Data Model & API Contracts

**Status**: ✅ Complete  
**Outputs**: 
- [data-model.md](data-model.md) - Entity schemas and relationships
- [contracts/api-spec.yaml](contracts/api-spec.yaml) - OpenAPI 3.0 specification
- [contracts/README.md](contracts/README.md) - Contract testing guide
- [quickstart.md](quickstart.md) - Developer setup instructions (updated with Docker)

### Data Model Summary

**6 Core Entities** defined with validation rules, state transitions, and spatial indexes:

1. **Restriction Zone** (MULTIPOLYGON)
   - Fields: zone_type, geometry, altitude_floor/ceiling, effective_start/end, authority_source, confidence_level
   - Indexes: GIST spatial index, temporal indexes, composite authority+confidence
   - Validation: ST_IsValid, altitude consistency, effective date ordering

2. **TOAL Site** (POINT)
   - Fields: site_name, coordinates, access_type, verification_status, facilities, confidence_rating
   - Indexes: GIST spatial index, verification_status index
   - Validation: Access type enum, coordinate bounds (UK only)

3. **Airspace Classification** (MULTIPOLYGON)
   - Fields: class_designation (A-G), geometry, altitude_floor/ceiling, rules, controlling_unit
   - Indexes: GIST spatial index, class_designation index
   - Validation: ICAO class codes, altitude consistency

4. **Temporary Restriction (NOTAM)** (MULTIPOLYGON)
   - Fields: notam_id, geometry, effective_start/end, reason, altitude_limits
   - Indexes: GIST spatial index, temporal indexes for active lookups
   - Validation: Time-bound restrictions, expiration logic

5. **Data Source**
   - Fields: authority_name, url, last_sync, update_frequency, reliability_level
   - Purpose: Track data provenance for confidence indicators

6. **Location** (ephemeral - not persisted per GDPR)
   - Used for API request/response only
   - Coordinates processed in-memory for restriction checks

### API Contracts Summary

**OpenAPI 3.0 Specification** with 12 endpoints across 4 resource categories:

**Zones Endpoints** (FR-002, FR-003, FR-004, FR-006):
- `GET /zones` - Query by bounding box with type filters
- `GET /zones/:id` - Get specific zone details
- `GET /zones/active` - Active restrictions only (excludes expired NOTAMs)

**Location Endpoints** (FR-001, FR-026):
- `POST /location/check` - Check if coordinates are flight-permitted
- `POST /location/batch` - Batch check multiple coordinates

**TOAL Endpoints** (FR-005, FR-013, FR-013A, FR-013B):
- `GET /toal` - Query TOAL sites by bounding box
- `GET /toal/nearest` - Find nearest TOAL site to coordinates
- `GET /toal/:id` - Get specific TOAL site details

**Airspace Endpoints** (FR-006):
- `GET /airspace/classifications` - Get airspace class boundaries

**Health/Admin** (observability):
- `GET /health` - Full health check with DB status
- `GET /health/ready` - Kubernetes readiness probe
- `GET /health/live` - Kubernetes liveness probe

**Contract Testing**: All endpoints validated with Vitest contract tests against OpenAPI schema. 100% coverage required before implementation.

### Post-Design Constitution Check

**Re-evaluation after Phase 1 design completion**:

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Safety-First** | ✅ MAINTAINED | Data model enforces altitude validation, temporal consistency, geometry validity at schema level |
| **II. Modular Architecture** | ✅ MAINTAINED | Clear separation: models (data), services (logic), api (interface), lib (infrastructure) |
| **III. TDD** | ✅ MAINTAINED | Contract tests specified before implementation; user approval checkpoint enforced |
| **IV. Documentation** | ✅ MAINTAINED | data-model.md provides complete entity documentation; quickstart.md updated with Docker setup |
| **V. Security & Compliance** | ✅ MAINTAINED | Location entity explicitly documented as ephemeral (not persisted); HTTPS enforced in contracts |

**Architecture Alignment**: Data model and API contracts support all 4 user stories (P1-P4) and satisfy all 27 functional requirements (FR-001 through FR-027) plus 12 non-functional requirements (NFR-001 through NFR-012).

---

## Next Steps

**Phase 2**: Generate implementation tasks via `/speckit.tasks` command  
**Phase 3**: Begin TDD implementation after user approval checkpoint (Constitution Section III requirement)

**Agent Context Update**: Run `.specify/scripts/powershell/update-agent-context.ps1 -AgentType copilot` to integrate technology decisions into agent memory for implementation phase.

---

**Planning Complete**: 2026-02-17  
**Artifacts Generated**: research.md, data-model.md, contracts/api-spec.yaml, quickstart.md (Docker updates)  
**Branch**: `001-flight-zone-map`  
**Ready for**: `/speckit.tasks` command to generate Phase 2 implementation task breakdown
