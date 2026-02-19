# Implementation Plan: Flight Zone Map with Heritage Site Advisory Layers

**Branch**: `001-flight-zone-map` | **Date**: 2026-02-18 | **Spec**: [spec.md](./spec.md)

## Summary

**Primary Requirement**: Extend the flight zone map to distinguish between airspace restrictions (legal no-fly zones) and property-based restrictions (advisory heritage sites), implementing a tri-state flight permission system that clearly separates regulatory airspace constraints from land-based property policies.

**Technical Approach**: Add a new `property_restrictions` table for heritage site boundaries, integrate three heritage data sources (National Trust, English Heritage, Historic England), implement tri-state API response logic (`can_fly: 'true' | 'false' | 'check-property'`), create toggleable map layers with visual z-index priority (airspace on top), and establish weekly sync jobs separate from daily airspace updates.

**Current State**: System has 1,025 real NATs airspace zones imported, but heritage site integration is pending. Existing tests show 6 failures in location-service.test.ts that must be resolved before adding new features.

## Technical Context

**Language/Version**: TypeScript (Node.js 20.0+, NPM 10.0+)  
**Primary Dependencies**: Express 4.18, PostgreSQL 15 + PostGIS, Vite 5.0, Leaflet 1.9, @turf/turf 6.5  
**Storage**: PostgreSQL with PostGIS extensions (spatial queries), 1,033 zones currently loaded  
**Testing**: Vitest (unit/integration), Supertest (contract), Playwright (e2e), 10 test files existing  
**Target Platform**: Web (Desktop Chrome/Firefox/Safari, Mobile Web iOS/Android)  
**Project Type**: Web application (backend API + frontend PWA)  
**Performance Goals**: 
  - Map pan/zoom: ≥30fps, <100ms latency (FR-009)
  - Location check: <5 seconds on app open (FR-026)
  - Search results: <2 seconds (FR-027)
  - Initial load: <3 seconds on 4G (FR-025)

**Constraints**: 
  - Must maintain 100% test coverage for safety-critical geospatial queries (Constitution §I)
  - Rate limiting: 100 requests per 15-minute window per IP (per NFR-009)
  - CAA compliance required for airspace data freshness
  
**Scale/Scope**: 
  - 1,025 airspace zones (NATs data loaded)
  - Expected: 500-1,000 heritage sites per data source (~2,500 total)
  - Target: Thousands of daily users checking flight permissions
  - Geographic: UK coverage (49.4°N to 61°N, 13°W to 1.67°E)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Safety-First (§I - NON-NEGOTIABLE)**:
- ✅ **PASS**: Geospatial query tests exist (location-service.test.ts, geospatial-service.test.ts)
- ⚠️ **ACTION REQUIRED**: 6 failing tests in location-service.test.ts must be fixed before new features
- ⚠️ **ACTION REQUIRED**: Test coverage report incomplete - must verify 100% coverage for safety-critical paths
- ✅ **PASS**: Data staleness warnings implemented (FR-019 requirement in spec)
- ✅ **PASS**: Winston logging configured for error tracking

**Modular Architecture (§II)**:
- ✅ **PASS**: Backend structure: models/, services/, routes/, lib/, scripts/
- ✅ **PASS**: Frontend structure: components/, services/, pages/
- ✅ **PASS**: Clear separation of concerns (API layer, service layer, data layer)

**Test-Driven Development (§III - NON-NEGOTIABLE)**:
- ⚠️ **ACTION REQUIRED**: Existing features lack complete TDD (tests exist but 6 failing)
- ⚠️ **ACTION REQUIRED**: New heritage site features MUST follow TDD (write tests first)
- ✅ **PASS**: Test infrastructure complete (Vitest, Supertest, Playwright configured)

**Documentation & Observability (§IV)**:
- ❌ **VIOLATION**: No README.md in backend/frontend
- ❌ **VIOLATION**: API contract documentation missing (OpenAPI/Swagger spec needed)
- ✅ **PASS**: Winston structured logging configured
- ⚠️ **ACTION REQUIRED**: Heritage site integration requires documentation

**Security & Compliance (§V)**:
- ✅ **PASS**: Helmet middleware configured
- ✅ **PASS**: Rate limiting implemented (300 req/min)
- ✅ **PASS**: CORS configured
- ⚠️ **DEFER**: Authentication not required for Phase 1 (public read-only access)
- ✅ **PASS**: CAA compliance addressed via NATs data source

**GATE STATUS**: ⚠️ **CONDITIONAL PASS** - May proceed to Phase 0 research, but must address:
1. Fix 6 failing location-service tests before implementing new features
2. Generate test coverage report confirming ≥90% coverage
3. Create README.md and API documentation
4. Commit to TDD for all heritage site features (tests first, user approval, then implementation)

## Project Structure

### Documentation (this feature)

```text
specs/001-flight-zone-map/
├── spec.md               # Feature specification (COMPLETE)
├── plan.md               # This file (IN PROGRESS)
├── research.md           # Phase 0 output (PENDING)
├── data-model.md         # Phase 1 output (PENDING)
├── quickstart.md         # Phase 1 output (PENDING)
├── contracts/            # Phase 1 output (PENDING)
│   ├── location-check-v2.yaml
│   └── property-restrictions.yaml
└── tasks.md              # Phase 2 output (/speckit.tasks - FUTURE)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/
│   │   ├── DataSource.ts          # Existing: data source metadata
│   │   ├── RestrictionZone.ts     # Existing: airspace zones
│   │   └── PropertyRestriction.ts # NEW: heritage site entities
│   ├── services/
│   │   ├── geospatial-service.ts  # Existing: PostGIS spatial queries
│   │   ├── location-service.ts    # MODIFY: tri-state logic + property checks
│   │   └── property-service.ts    # NEW: heritage site queries
│   ├── routes/
│   │   ├── location.ts            # MODIFY: tri-state can_fly response
│   │   └── property-restrictions.ts # NEW: heritage site API
│   ├── lib/
│   │   ├── database.ts            # Existing: PostgreSQL pool
│   │   ├── config.ts              # Existing: configuration
│   │   └── migrations.ts          # MODIFY: add property_restrictions migration
│   └── scripts/
│       ├── import-nats-data.ts    # Existing: NATs import (1,025 zones)
│       ├── import-national-trust.ts  # NEW: National Trust import
│       ├── import-english-heritage.ts # NEW: English Heritage import
│       ├── import-historic-england.ts # NEW: Historic England import
│       └── sync-data.ts           # MODIFY: add weekly heritage sync
└── tests/
    ├── contract/
    │   ├── location.test.ts       # MODIFY: tri-state contract tests
    │   └── property-restrictions.test.ts # NEW: heritage API contract
    ├── integration/
    │   └── property-restrictions.test.ts # NEW: end-to-end property flow
    └── unit/
        ├── services/
        │   ├── location-service.test.ts # FIX: 6 failing tests
        │   ├── geospatial-service.test.ts # Existing: passing
        │   └── property-service.test.ts # NEW: heritage query tests
        └── models/
            └── PropertyRestriction.test.ts # NEW: entity validation

frontend/
├── src/
│   ├── components/
│   │   ├── Map.ts                 # MODIFY: add heritage layers + z-index
│   │   ├── LayerControls.ts       # MODIFY: add heritage toggle
│   │   └── PropertyAdvisoryPopup.ts # NEW: heritage policy display
│   ├── services/
│   │   ├── api-client.ts          # MODIFY: tri-state response handling
│   │   └── property-api.ts        # NEW: heritage site API calls
│   └── types/
│       └── location.ts            # MODIFY: tri-state LocationCheck type
└── tests/
    ├── unit/
    │   ├── components/
    │   │   └── Map.test.ts        # MODIFY: heritage layer tests
    │   └── services/
    │       └── property-api.test.ts # NEW: heritage API client tests
    └── e2e/
        └── heritage-layers.spec.ts # NEW: Playwright heritage flow

database/
└── migrations/
    ├── 001_initial_schema.sql     # Existing: restriction_zones, data_sources
    └── 002_property_restrictions.sql # NEW: property_restrictions table
```

**Structure Decision**: Web application (backend API + frontend PWA). Backend uses Express + PostgreSQL with modular services. Frontend uses Vite + Leaflet with component-based architecture. Tests follow contract/integration/unit hierarchy per Constitution §III.

## Complexity Tracking

> **No complexity violations.** All new components follow existing modular patterns. The addition of property_restrictions mirrors the existing restriction_zones structure.

---

## Phase 0: Research & Decision Making

**Status**: ✅ COMPLETE (2026-02-18) - See research.md for decisions

### Research Questions

**Research COMPLETED on 2026-02-18. Decisions documented in research.md:**

1. **Heritage Data Source APIs** (NEEDS CLARIFICATION)
   - **Question**: What are the exact API endpoints, authentication requirements, and data formats for National Trust, English Heritage, and Historic England?
   - **Why**: Import scripts require specific API integration patterns
   - **Task**: Research each heritage organization's public data API:
     * National Trust: https://open-data-national-trust.hub.arcgis.com/
     * English Heritage: https://historicengland.org.uk/listing/the-list/data-downloads
     * Historic England: https://opendata-historicengland.hub.arcgis.com/
   - **Deliverable**: Document API endpoints, rate limits, data schemas, authentication needs

2. **Leaflet Z-Index Best Practices** (NEEDS CLARIFICATION)
   - **Question**: What is the recommended Leaflet pattern for layering polygons with explicit z-index control?
   - **Why**: FR-007B requires airspace layers render on top of property layers
   - **Task**: Research Leaflet pane management vs. style-based z-index
   - **Deliverable**: Decision on layering strategy (panes vs. CSS z-index)

3. **Tri-State API Response Patterns** (NEEDS CLARIFICATION)
   - **Question**: What are standard REST API patterns for tri-state responses (true/false/ambiguous)?
   - **Why**: `can_fly: 'check-property'` is a new pattern - need industry best practices
   - **Task**: Research tri-state response patterns in aviation/GIS APIs
   - **Deliverable**: API contract design with clear semantics

4. **PostGIS Spatial Index Performance** (NEEDS CLARIFICATION)
   - **Question**: For 3,500+ combined polygons (1,025 airspace + 2,500 heritage), what index strategies optimize point-in-polygon queries?
   - **Why**: FR-026 requires <5 second location checks
   - **Task**: Research PostGIS GIST index configurations, BRIN indexes, query optimization
   - **Deliverable**: Index strategy for property_restrictions table

5. **Weekly vs. Daily Sync Job Patterns** (NEEDS CLARIFICATION)
   - **Question**: What Node.js scheduling patterns support separate daily (airspace) and weekly (heritage) sync jobs?
   - **Why**: FR-016 and FR-016A require different update frequencies
   - **Task**: Research node-schedule, node-cron, or custom scheduler patterns
   - **Deliverable**: Job scheduling architecture decision

6. **Testing Strategy for Spatial Queries** (NEEDS CLARIFICATION)
   - **Question**: How do we achieve 100% test coverage for PostGIS spatial operations (ST_Contains, ST_Intersects)?
   - **Why**: Constitution §I requires 100% coverage for safety-critical code
   - **Task**: Research spatial query mocking strategies, test fixture geometry creation
   - **Deliverable**: Testing approach for property_service spatial operations

### Research Output

**File**: `specs/001-flight-zone-map/research.md`

**Expected Sections**:
- Heritage Data Source Integration (answers Q1)
- Leaflet Layering Architecture (answers Q2)
- Tri-State API Design (answers Q3)
- Database Index Strategy (answers Q4)
- Sync Job Scheduling (answers Q5)
- Spatial Query Testing (answers Q6)

**Format** (per outline):
```markdown
## Decision: [what was chosen]
**Rationale**: [why chosen]  
**Alternatives considered**: [what else evaluated]
```

---

## Phase 1: Design & Contracts

**Status**: PENDING (blocked by Phase 0 research completion)

### Data Model

**File**: `specs/001-flight-zone-map/data-model.md`

**Entities to Design**:

1. **PropertyRestriction** (NEW)
   - Fields: property_id, property_name, managing_organization, geometry (MultiPolygon), policy_text, contact_info, policy_effective_date, data_source_id, created_at, last_updated
   - Relationships: Many-to-one with DataSource
   - Validation: property_name required, geometry must be valid MultiPolygon, policy_text max 5000 chars
   - Spatial Index: GIST index on geometry for ST_Contains queries

2. **DataSource** (EXTEND)
   - Add new values to data_type enum: 'heritage-site', 'property-restriction'
   - New entries for National Trust, English Heritage, Historic England

3. **LocationCheck** (MODIFY)
   - Change: `can_fly: boolean` → `can_fly: 'true' | 'false' | 'check-property'`
   - Add: `property_restrictions: PropertyRestrictionAdvisory[]` array
   - State transitions:
     * No airspace restriction + no property → `'true'`
     * Airspace restriction → `'false'`
     * No airspace + property restriction → `'check-property'`

### API Contracts

**Directory**: `specs/001-flight-zone-map/contracts/`

**Files to Generate**:

1. **location-check-v2.yaml** (OpenAPI 3.0)
   - Endpoint: `GET /api/v1/location/check`
   - Modified Response:
     ```yaml
     can_fly: 
       type: string
       enum: ['true', 'false', 'check-property']
     property_restrictions:
       type: array
       items:
         type: object
         properties:
           property_name: string
           organization: string
           policy_summary: string
           contact: string
     ```

2. **property-restrictions.yaml** (OpenAPI 3.0)
   - Endpoint: `GET /api/v1/property-restrictions`
   - Query params: `bbox` (bounding box for map viewport)
   - Response: GeoJSON FeatureCollection with PropertyRestriction properties

### Quickstart Guide

**File**: `specs/001-flight-zone-map/quickstart.md`

**Sections**:
1. Prerequisites (Node 20+, PostgreSQL 15+, PostGIS 3+)
2. Database setup (run migration 002_property_restrictions.sql)
3. Import heritage data (run 3 import scripts)
4. Start backend (`npm run dev`)
5. Start frontend (`npm run dev`)
6. Test heritage layers (toggle "Heritage Sites" checkbox)
7. Verify tri-state logic (check location in heritage site)

### Agent Context Update

**Script**: `.specify/scripts/powershell/update-agent-context.ps1 -AgentType copilot`

**Updates Required**:
- Add "PropertyRestriction" to entity glossary
- Add "tri-state flight permission" to terminology
- Add heritage data sources to technology list
- Document z-index layering pattern
- Reference location-check-v2 API contract

---

## Phase 2: Task Breakdown

**THIS PHASE IS NOT EXECUTED BY `/speckit.plan`.**

**Command**: `/speckit.tasks` (separate command, run after plan approval)

**Expected Output**: `specs/001-flight-zone-map/tasks.md`

**High-Level Task Groups** (for future reference):
1. **FIX-EXISTING**: Resolve 6 failing location-service tests
2. **DATABASE**: Create property_restrictions table migration
3. **IMPORT**: Build 3 heritage data import scripts
4. **BACKEND-API**: Implement tri-state logic in location service
5. **FRONTEND-LAYERS**: Add heritage site layers with z-index
6. **TESTING**: Write TDD tests for all new features
7. **DOCS**: Generate README and API documentation
8. **SYNC**: Implement weekly heritage site sync job

---

## Stopping Point

**This plan generation ends here.** The `/speckit.plan` command does not execute Phase 2 (task breakdown).

**Next Steps**:
1. **Review this plan** with stakeholders
2. **Run Phase 0 research** to resolve NEEDS CLARIFICATION items
3. **Run Phase 1 design** to generate data-model.md, contracts/, quickstart.md
4. **Re-run Constitution Check** after design completion
5. **Run `/speckit.tasks`** to break down into executable tasks

**Plan Status**: ✅ COMPLETE (Phase 0 research questions identified, Phase 1 design outlined)

**Branch**: `001-flight-zone-map`  
**Implementation Plan Path**: `specs/001-flight-zone-map/plan.md`
