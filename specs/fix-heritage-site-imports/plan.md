# Implementation Plan: Heritage Site Import and Display

**Branch**: `fix-heritage-site-imports` | **Date**: 2026-02-19 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/fix-heritage-site-imports/spec.md`

## Summary

**Primary Requirement**: Implement production-grade heritage site import processes that fetch data from multiple authoritative sources (National Trust, Historic England), validate geometry data quality, detect and resolve duplicates, optimize boundary rendering performance with multi-resolution geometries, and provide comprehensive error handling with operational monitoring.

**Technical Approach**: 
- Extend existing PostgreSQL/PostGIS schema with simplified geometry columns (3 zoom-level-optimized versions using ST_Simplify)
- Create quarantine table for invalid geometries with detailed error tracking
- Add data source health monitoring fields (consecutive failures, success rates, last error messages)
- Implement ArcGIS REST API pagination with exponential backoff for rate limiting
- Use pg_trgm fuzzy string matching for duplicate detection (spatial proximity + name similarity ≥80%)
- Configure Winston structured logging (JSON format) with optional Slack alerting
- Generate simplified geometries during import using PostGIS ST_SimplifyPreserveTopology with topology preservation

## Technical Context

**Language/Version**: TypeScript with Node.js 20+  
**Primary Dependencies**: Express 4.x, PostgreSQL 14+ with PostGIS 3.x, pg 8.x driver, Winston 3.x logging, Axios 1.x HTTP client, node-schedule 2.x cron, pg_trgm extension, Vitest 1.x testing  
**Storage**: PostgreSQL 14+ with PostGIS 3.3+ spatial extension, pg_trgm extension for fuzzy string matching  
**Testing**: Vitest unit and integration tests, Playwright E2E, target 90% code coverage minimum, 100% for safety-critical geometry validation  
**Target Platform**: Linux server, Docker PostgreSQL container for development, cloud PostgreSQL for production  
**Project Type**: Web application with frontend and backend architecture  
**Performance Goals**: Import completion under 30 minutes per data source for 1692 National Trust plus 18000 Historic England records, geometry validation under 100ms per record, heritage site polygon rendering at 30fps minimum with 100 concurrent sites in viewport  
**Constraints**: Weekly update frequency for heritage sites, 100% quarantine rate for invalid geometries ensuring no corrupt data in production table, simplified boundaries must remain within 10m of original for zoom under 13 and within 5m for zoom 13 to 15, ST_Simplify must preserve topology with no self-intersections introduced  
**Scale/Scope**: Approximately 19650 total heritage sites including 1692 National Trust and 18000 Historic England, 3 geometry versions per site with original plus 2 simplified, batch-level database transactions processing 1000 records per batch, 7-day rolling health metrics

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Safety-First (Constitution §I) - NON-NEGOTIABLE ✅

**Initial Assessment (Pre-Phase 0)**: PASS
- Geometry validation (ST_IsValid, coordinate bounds) prevents corrupt spatial data reaching pilots
- Invalid geometries quarantined rather than displayed ensures map accuracy
- Heritage site boundaries show property extent accurately per authoritative sources

**Post-Phase 1 Re-Assessment**: PASS
- Geometry validation logic implemented with ST_IsValid() plus bounds checking plus POLYGON to MULTIPOLYGON conversion per FR-001 and FR-002
- Quarantine table design captures full error context for manual review per FR-003
- Three-tier boundary simplification preserves topology using ST_SimplifyPreserveTopology with accuracy constraints per NFR-005
- No changes introduce airspace restriction inaccuracy as heritage sites are advisory only
- Test coverage requirements mandate 100% for validation logic per Constitution Section III

**Conclusion**: No safety violations. Heritage site display is advisory not legal airspace but accuracy remains critical for pilot trust.

---

### Test-Driven Development (Constitution §III) - NON-NEGOTIABLE ✅

**Initial Assessment**: PASS aspirational
- Import validation logic MUST have tests written first including geometry validation, duplicate detection, boundary simplification
- Integration tests MUST cover full import cycle from API fetch through validation to deduplication to database insertion
- Contract tests MUST validate import operation interfaces including success and error responses and logging format

**Post-Phase 1 Re-Assessment**: PASS
- Test strategy defined in quickstart.md with unit tests for validation and deduplication, integration tests for full import cycle
- Target 90% code coverage minimum with 100% for safety-critical validation paths
- Contracts documented in contracts/import-operations.md for verification

**Conclusion**: TDD cycle must be followed during implementation. Tests written before import logic.

---

### Modular Architecture (Constitution §II) ✅

**Initial Assessment**: PASS
- Import scripts are standalone modules including import-national-trust.ts and import-historic-england.ts
- Validation logic extracted to reusable service including geometry-validator.ts and duplicate-detector.ts
- Database access through repository pattern including property-restrictions-repository.ts
- Clear module boundaries enable independent testing

**Post-Phase 1 Re-Assessment**: PASS
- Module structure defined in Project Structure section below
- Each import script is independently executable via npm run import:national-trust
- Validation services have defined interfaces in contracts/import-operations.md
- No coupling violations introduced

**Conclusion**: Architecture maintains modularity. No violations.

---

### Documentation & Observability (Constitution §IV) ✅

**Initial Assessment**: PASS
- Winston structured logging with JSON format including timestamp, data_source, operation_type, records_processed, records_failed, duration_ms, error_summary per NFR-002
- Slack alert integration for operational awareness per NFR-003
- Quarantine table provides debugging data for validation failures
- Data source health metrics provide operational visibility

**Post-Phase 1 Re-Assessment**: PASS
- Structured logging contract documented in contracts/import-operations.md
- Health tracking fields added to data_sources table including health_status, consecutive_failure_count, success_rate_7day
- Quickstart.md provides comprehensive developer onboarding
- Error quarantine design enables troubleshooting

**Conclusion**: Observability requirements met. No violations.

---

### Security & Compliance (Constitution §V) ✅

**Initial Assessment**: PASS not applicable for this feature
- Heritage site imports are administrative operations with no user-facing endpoints
- Data sources are public open data from National Trust and Historic England
- No user data collected or processed
- No aviation regulation impact as advisory property restrictions only

**Post-Phase 1 Re-Assessment**: PASS
- No authentication required for administrative scripts not public API
- No PII or sensitive user data involved
- Open data sources with proper attribution per data-model.md

**Conclusion**: No security or compliance concerns for this feature.

---

**OVERALL GATE STATUS**: ✅ **PASS - Proceed to Implementation**

No constitution violations identified. All non-negotiable requirements including Safety-First and TDD are addressed in design. Modular architecture, documentation, and observability requirements satisfied.

## Project Structure

### Documentation (this feature)

```text
specs/fix-heritage-site-imports/
├── plan.md                          # This file
├── spec.md                          # Feature specification clarified
├── research.md                      # Phase 0 research findings
├── data-model.md                    # Phase 1 database schema design
├── quickstart.md                    # Phase 1 developer onboarding guide
├── contracts/
│   └── import-operations.md         # Phase 1 API contracts
└── tasks.md                         # Phase 2 output NOT YET CREATED run speckit.tasks
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/
│   │   ├── PropertyRestriction.ts           # Extended with simplified geometry fields
│   │   ├── HeritageSiteImportError.ts       # NEW Quarantine table model
│   │   └── DataSource.ts                    # Extended with health tracking fields
│   ├── services/
│   │   ├── property-service.ts              # Existing service extended for zoom-level geometry selection
│   │   ├── geometry-validator.ts            # NEW ST_IsValid plus bounds checking plus POLYGON to MULTIPOLYGON conversion
│   │   ├── duplicate-detector.ts            # NEW Spatial proximity plus fuzzy name matching
│   │   └── boundary-simplifier.ts           # NEW Generate simplified geometries during import
│   ├── repositories/
│   │   ├── property-restrictions-repository.ts  # NEW Database access layer for property_restrictions
│   │   ├── import-errors-repository.ts          # NEW Quarantine table access
│   │   └── data-sources-repository.ts           # NEW Health tracking updates
│   ├── scripts/
│   │   ├── import-national-trust.ts          # ENHANCED Add validation, deduplication, error handling
│   │   ├── import-historic-england.ts        # ENHANCED Add validation, deduplication, error handling
│   │   └── test-import.ts                    # NEW Development testing script small dataset
│   ├── schedulers/
│   │   └── heritage-import-scheduler.ts      # NEW Weekly cron jobs for automated imports
│   ├── lib/
│   │   ├── logger.ts                         # ENHANCED Configure Winston JSON format
│   │   └── alerts.ts                         # NEW Slack webhook integration
│   └── api/
│       └── routes/
│           └── property-restrictions.ts      # ENHANCED Add zoom-level parameter for geometry selection
├── migrations/
│   ├── 004_property_restrictions_extended.sql   # NEW Add simplified geometries plus deduplication fields
│   ├── 005_heritage_sites_import_errors.sql     # NEW Create quarantine table
│   └── 006_data_sources_health_tracking.sql     # NEW Add health monitoring fields
├── tests/
│   ├── unit/
│   │   ├── services/
│   │   │   ├── geometry-validator.test.ts       # NEW Test validation logic ST_IsValid bounds conversion
│   │   │   ├── duplicate-detector.test.ts       # NEW Test spatial proximity plus name similarity
│   │   │   └── boundary-simplifier.test.ts      # NEW Test ST_Simplify correctness
│   │   └── repositories/
│   │       └── property-restrictions-repository.test.ts  # NEW Test database operations
│   ├── integration/
│   │   ├── heritage-import.integ.test.ts        # NEW Test full import cycle API to DB
│   │   ├── import-transaction.integ.test.ts     # NEW Test batch transactions plus rollback
│   │   └── duplicate-resolution.integ.test.ts   # NEW Test deduplication logic end-to-end
│   └── contract/
│       └── import-operations.contract.test.ts   # NEW Validate logging format success error responses
└── logs/                                         # NEW Winston log output directory
    ├── import-combined.log
    └── import-error.log

frontend/
├── src/
│   ├── components/
│   │   └── map.ts                                # ENHANCED Add zoom-level-aware geometry fetching
│   ├── services/
│   │   └── api-client.ts                         # ENHANCED Add zoom parameter to getPropertyRestrictions
│   └── types/
│       └── property-restrictions.ts              # ENHANCED Add zoom_level type for API requests
└── tests/
    └── e2e/
        └── heritage-site-display.spec.ts         # NEW Test heritage site rendering plus interaction
```

**Structure Decision**: Web application architecture selected. Existing backend and frontend directories structure is maintained. This feature adds new services for validation deduplication simplification, repositories for data access layer, and enhanced import scripts. Database migrations extend existing schema. Frontend changes are minimal adding zoom-level parameter to API calls. Testing structure follows existing conventions with unit integration contract and e2e directories.

## Complexity Tracking

> **No Constitution violations - this section intentionally left empty**

No additional complexity introduced that violates constitution principles. All design decisions align with existing architecture and constitution requirements.
