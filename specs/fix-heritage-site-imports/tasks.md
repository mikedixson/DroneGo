---
description: "Task list for Heritage Site Import and Display implementation"
---

# Tasks: Heritage Site Import and Display

**Feature Branch**: `fix-heritage-site-imports`  
**Input**: Design documents from `/specs/fix-heritage-site-imports/`  
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/import-operations.md, research.md, quickstart.md

**Constitution Requirement**: Test-Driven Development (§III) is NON-NEGOTIABLE. All tests marked below MUST be written FIRST and FAIL before implementation.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `- [ ] [ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1, US2) - only for user story phases
- **File paths**: Backend paths relative to `backend/`, frontend to `frontend/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and configuration

- [X] T001 Verify Node.js 20+ and npm 10+ installed per plan.md Technical Context
- [X] T002 [P] Configure Winston structured logging in backend/src/lib/logger.ts with JSON format per research.md
- [X] T003 [P] Create .env.example file in backend/ with DATABASE_URL, API endpoints, LOG_LEVEL, SLACK_WEBHOOK_URL per quickstart.md
- [X] T004 [P] Install dependencies: pg_trgm extension setup script in backend/migrations/000_enable_extensions.sql

**Checkpoint**: Base configuration complete

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core database schema that MUST be complete before ANY user story implementation

**⚠️ CRITICAL**: No user story work can begin until all migrations are applied

- [x] T005 Create Migration 004 in backend/migrations/004_property_restrictions_extended.sql adding geometry_simplified_low, geometry_simplified_medium, superseded_by, is_primary, restriction_category columns per data-model.md
- [x] T006 Create Migration 005 in backend/migrations/005_heritage_sites_import_errors.sql with quarantine table schema per data-model.md
- [x] T007 Create Migration 006 in backend/migrations/006_data_sources_health_tracking.sql extending data_sources with health_status, consecutive_failure_count, success_rate_7day per data-model.md
- [x] T008 Run all migrations and verify schema with `npm run migrate` per quickstart.md step 3
- [x] T009 Create base repository interface in backend/src/repositories/base-repository.ts with connection pooling and transaction support

**✅ Checkpoint**: Database foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - View Heritage Site Boundaries on Map (Priority: P1) 🎯 MVP

**Goal**: Drone pilots can see heritage site boundaries displayed as amber polygons with zoom-level-optimized detail and click to view property information

**Independent Test**: Pan map to London, verify Tower of London/Greenwich Park render as polygons, click polygon to see detail panel with property name and policy

### Tests for User Story 1 (TDD Required - Write FIRST, Ensure FAIL)

- [X] T010 [P] [US1] Write unit test for geometry validator in backend/tests/unit/services/geometry-validator.test.ts covering ST_IsValid, bounds checking, POLYGON→MULTIPOLYGON conversion per FR-001 and FR-002
- [X] T011 [P] [US1] Write unit test for boundary simplifier in backend/tests/unit/services/boundary-simplifier.test.ts covering three-tier simplification (0.0001°, 0.00005°, original) per FR-007
- [X] T012 [P] [US1] Write unit test for property restrictions repository in backend/tests/unit/repositories/property-restrictions-repository.test.ts covering CRUD operations and zoom-level geometry selection per FR-008
- [X] T013 [P] [US1] Write integration test for basic import cycle in backend/tests/integration/heritage-import.integ.test.ts covering API fetch → validation → simplification → database insertion per process flow in contracts/import-operations.md
- [X] T014 [P] [US1] Write E2E test for heritage site display in frontend/tests/e2e/heritage-site-display.spec.ts covering map rendering, zoom detail switching, click interaction per User Story 1 acceptance scenarios

**Verify**: All tests above FAIL (red) before proceeding to implementation

### Implementation for User Story 1

**Models & Repositories**:

- [X] T015 [P] [US1] Extend PropertyRestriction model in backend/src/models/PropertyRestriction.ts adding geometry_simplified_low, geometry_simplified_medium, is_primary, restriction_category fields per Migration 004
- [X] T016 [P] [US1] Create HeritageSiteImportError model in backend/src/models/HeritageSiteImportError.ts with error_id, source_record_id, error_type, raw_geometry_text, error_details per Migration 005
- [X] T017 [P] [US1] Extend DataSource model in backend/src/models/DataSource.ts adding health_status, last_successful_import, consecutive_failure_count per Migration 006
- [X] T018 [US1] Implement property-restrictions-repository in backend/src/repositories/property-restrictions-repository.ts with insertBatch, getByZoomLevel, findDuplicates methods per data-model.md query patterns
- [X] T019 [P] [US1] Implement import-errors-repository in backend/src/repositories/import-errors-repository.ts with quarantine, getUnresolved methods per data-model.md
- [X] T020 [P] [US1] Implement data-sources-repository in backend/src/repositories/data-sources-repository.ts with updateHealth, recordImportAttempt methods per data-model.md

**Core Services**:

- [X] T021 [US1] Implement geometry-validator service in backend/src/services/geometry-validator.ts with validateGeometry function using ST_IsValid, bounds checking (-90≤lat≤90, -180≤lng≤180), ST_Multi wrapper per contracts/import-operations.md validation interface
- [X] T022 [US1] Implement boundary-simplifier service in backend/src/services/boundary-simplifier.ts with generateSimplifiedGeometries using ST_SimplifyPreserveTopology with tolerances 0.0001° and 0.00005° per research.md findings
- [ ] T023 [US1] Verify geometry-validator tests PASS (green) after service implementation
- [ ] T024 [US1] Verify boundary-simplifier tests PASS (green) after service implementation

**Import Scripts**:

- [ ] T025 [US1] Implement importNationalTrustSites function in backend/src/scripts/import-national-trust.ts with ArcGIS pagination (1000 records/batch), geometry validation, simplification generation, batch transactions per contracts/import-operations.md process flow
- [ ] T026 [US1] Implement importHistoricEnglandSites function in backend/src/scripts/import-historic-england.ts with same structure as National Trust import adapted for Historic England API endpoint per contracts/import-operations.md
- [ ] T027 [US1] Create test-import script in backend/src/scripts/test-import.ts limiting to 100 records for development testing per quickstart.md step 4
- [ ] T028 [US1] Verify integration test PASSES after import scripts implementation

**API Layer**:

- [ ] T029 [US1] Enhance property-service in backend/src/services/property-service.ts adding getByZoomLevel method that selects geometry_simplified_low (<13), geometry_simplified_medium (13-15), or geometry (>15) per FR-008
- [ ] T030 [US1] Enhance property-restrictions API route in backend/src/api/routes/property-restrictions.ts adding zoom query parameter and calling property-service.getByZoomLevel per plan.md project structure

**Frontend Integration**:

- [ ] T031 [P] [US1] Enhance PropertyRestrictions type in frontend/src/types/property-restrictions.ts adding zoom_level parameter for API requests per plan.md
- [ ] T032 [US1] Enhance api-client in frontend/src/services/api-client.ts adding zoom parameter to getPropertyRestrictions call using current map zoom level per plan.md
- [ ] T033 [US1] Enhance map component in frontend/src/components/map.ts to fetch zoom-appropriate geometries on zoom change, render heritage sites with amber styling, implement click handler for detail panel display with temporary z-index elevation per FR-014, FR-017, FR-018
- [ ] T033b [US1] Implement data staleness indicator in frontend/src/components/map.ts: query data_sources.last_successful_import via API, display warning banner "⚠️ Heritage site data is X days old" when >48 hours per FR-013 and constitution §I data freshness requirement, position above map, dismissible with localStorage preference
- [ ] T034 [US1] Verify E2E test PASSES after frontend implementation

**Manual Testing**:

- [ ] T035 [US1] Run test import per quickstart.md step 4 and verify 100 records inserted
- [ ] T036 [US1] Run full National Trust import per quickstart.md step 5 and verify ~1650 records inserted
- [ ] T037 [US1] Run full Historic England import per quickstart.md step 5 and verify ~18000 records inserted
- [ ] T038 [US1] Manual browser testing per quickstart.md step 7: navigate to London, verify 4 test sites render, test click interaction and zoom detail switching

**Checkpoint**: User Story 1 complete - heritage sites display on map with zoom-optimized boundaries and click interaction

---

## Phase 4: User Story 2 - Reliable Heritage Site Data Updates (Priority: P2)

**Goal**: System operators receive alerts when imports fail, data source health tracked, invalid geometries quarantined, existing data continues displaying during failures

**Independent Test**: Simulate API failure (disconnect network), verify import logs error to structured logs, sends Slack alert (or console warning), marks data source unhealthy, existing data remains visible

### Tests for User Story 2 (TDD Required - Write FIRST, Ensure FAIL)

- [ ] T039 [P] [US2] Write unit test for duplicate-detector in backend/tests/unit/services/duplicate-detector.test.ts covering spatial proximity (ST_DWithin 250m) and name similarity (pg_trgm ≥0.8) per FR-004
- [ ] T040 [P] [US2] Write unit test for alerts service in backend/tests/unit/lib/alerts.test.ts covering Slack webhook call with proper message format per contracts/import-operations.md alert contract
- [ ] T041 [P] [US2] Write integration test for import transaction rollback in backend/tests/integration/import-transaction.integ.test.ts covering batch-level transactions and partial progress preservation per contracts/import-operations.md transaction contract
- [ ] T042 [P] [US2] Write integration test for duplicate resolution in backend/tests/integration/duplicate-resolution.integ.test.ts covering authority hierarchy (Historic England > National Trust > Others) and superseded_by marking per FR-005 and FR-006
- [ ] T043 [P] [US2] Write contract test for import operations in backend/tests/contract/import-operations.contract.test.ts validating ImportResult and ImportError response structures plus structured log format per contracts/import-operations.md

**Verify**: All tests above FAIL (red) before proceeding to implementation

### Implementation for User Story 2

**Core Services**:

- [ ] T044 [US2] Implement duplicate-detector service in backend/src/services/duplicate-detector.ts with detectDuplicates function using ST_DWithin for spatial proximity and similarity() for name matching per contracts/import-operations.md duplicate detection interface
- [ ] T045 [US2] Implement alerts service in backend/src/lib/alerts.ts with sendAlert function supporting Slack webhook POST request with severity levels (warning, error, critical) per research.md alert findings
- [ ] T046 [US2] Verify duplicate-detector tests PASS (green) after service implementation
- [ ] T047 [US2] Verify alerts service tests PASS (green) after service implementation

**Enhanced Import Scripts**:

- [ ] T048 [US2] Enhance import-national-trust script in backend/src/scripts/import-national-trust.ts adding duplicate detection before insert, quarantine on validation failure, health tracking updates, structured logging per NFR-002, alert on failure per contracts/import-operations.md error handling
- [ ] T049 [US2] Enhance import-historic-england script in backend/src/scripts/import-historic-england.ts with same error handling enhancements as National Trust import
- [ ] T050 [US2] Verify integration tests PASS (transaction rollback, duplicate resolution) after enhanced import implementation
- [ ] T051 [US2] Verify contract test PASSES (import operation interfaces, logging format) after enhanced import implementation

**Scheduler for Weekly Imports**:

- [ ] T052 [US2] Implement heritage-import-scheduler in backend/src/schedulers/heritage-import-scheduler.ts with node-schedule cron jobs (Weekly Sunday 2-3 AM) calling importNationalTrustSites and importHistoricEnglandSites per quickstart.md development workflow

**Manual Testing**:

- [ ] T053 [US2] Simulate API failure (modify .env with invalid API endpoint) and verify error logging, console warning/Slack alert, health_status marked unhealthy per quickstart.md troubleshooting
- [ ] T054 [US2] Verify quarantine table contains records by querying heritage_sites_import_errors per quickstart.md step 6 verification queries
- [ ] T055 [US2] Verify data source health metrics by querying data_sources table for consecutive_failure_count and success_rate_7day per quickstart.md step 6

**Checkpoint**: User Story 2 complete - import failures handled gracefully with alerts, health tracking, and quarantine

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Improvements affecting multiple user stories and final validation

- [ ] T056 [P] Add comprehensive JSDoc comments to all services in backend/src/services/ documenting parameters, return types, and usage examples
- [ ] T057 [P] Add comprehensive JSDoc comments to all repositories in backend/src/repositories/ documenting transaction handling and error cases
- [ ] T058 [P] Review all structured logs in import scripts ensuring required fields present (timestamp, data_source, operation_type, records_processed, records_failed, duration_ms, error_summary) per NFR-002
- [ ] T059 [P] Review spatial indexes on property_restrictions table (GIST indexes on geometry columns, GIN index on property_name) created by migrations per data-model.md performance considerations
- [ ] T060 [P] Add error handling for edge cases documented in spec.md: schema changes, 5000+ coordinate boundaries, overlapping authorities
- [ ] T061 Run complete quickstart.md validation end-to-end: fresh database → migrations → test import → production imports → browser verification
- [ ] T062 Update .github/agents/copilot-instructions.md if any technology decisions changed during implementation
- [ ] T063 Code review: verify all files follow TypeScript conventions, no any types, proper error handling
- [ ] T064 Performance test: verify heritage site rendering maintains ≥30fps with 100 sites visible per NFR-006 using browser DevTools Performance tab
- [ ] T065 Security review: verify no sensitive credentials in code, environment variables used correctly, proper SQL parameterization in repositories

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001-T004) completion - **BLOCKS all user stories**
- **User Story 1 (Phase 3)**: Depends on Foundational (T005-T009) completion
- **User Story 2 (Phase 4)**: Depends on User Story 1 completion (builds on import scripts T025-T026)
- **Polish (Phase 5)**: Depends on all user stories completion

### User Story Dependencies

- **User Story 1 (P1)**: Foundation only - no dependencies on other stories
- **User Story 2 (P2)**: Depends on User Story 1 import scripts (T025-T026) - enhances them with error handling

### Within User Story 1

**Stage 1 - Tests (write first)**:
- T010-T014 [P] - All tests can be written in parallel
- **GATE**: All tests MUST FAIL before proceeding

**Stage 2 - Models & Repositories**:
- T015-T017 [P] - Models can be implemented in parallel
- T018 - property-restrictions-repository (depends on T015 model)
- T019-T020 [P] - Other repositories in parallel (depend on T016-T017 models)

**Stage 3 - Core Services**:
- T021 - geometry-validator (depends on T018 repository)
- T022 - boundary-simplifier (depends on T018 repository)
- T023-T024 - Verify tests PASS

**Stage 4 - Import Scripts**:
- T025 - import-national-trust (depends on T021-T022 services)
- T026 - import-historic-england (depends on T021-T022 services)
- T027 - test-import (depends on T025)
- T028 - Verify integration test PASSES

**Stage 5 - API Layer**:
- T029 - property-service enhancement (depends on T018 repository)
- T030 - API route enhancement (depends on T029 service)

**Stage 6 - Frontend**:
- T031 [P] - types (no dependencies)
- T032 - api-client (depends on T030 API route)
- T033 - map component (depends on T032 api-client)
- T034 - Verify E2E test PASSES

**Stage 7 - Manual Testing**:
- T035-T038 - Sequential manual verification

### Within User Story 2

**Stage 1 - Tests (write first)**:
- T039-T043 [P] - All tests can be written in parallel
- **GATE**: All tests MUST FAIL before proceeding

**Stage 2 - Core Services**:
- T044 - duplicate-detector (depends on T018 repository from US1)
- T045 - alerts service (no dependencies)
- T046-T047 - Verify tests PASS

**Stage 3 - Enhanced Import Scripts**:
- T048 - enhance import-national-trust (depends on T044-T045, extends T025)
- T049 - enhance import-historic-england (depends on T044-T045, extends T026)
- T050-T051 - Verify integration and contract tests PASS

**Stage 4 - Scheduler**:
- T052 - heritage-import-scheduler (depends on T048-T049)

**Stage 5 - Manual Testing**:
- T053-T055 - Sequential manual verification

### Parallel Opportunities

**Setup Phase**:
- T002, T003, T004 can run simultaneously (different files)

**Foundational Phase**:
- T005, T006, T007 migrations can be written simultaneously
- T008 runs after T005-T007 complete
- T009 runs in parallel with T008 (different concern)

**User Story 1 - Maximum Parallelization**:
```bash
# Stage 1: Write all tests in parallel (5 developers)
Developer 1: T010 (geometry-validator.test.ts)
Developer 2: T011 (boundary-simplifier.test.ts)
Developer 3: T012 (property-restrictions-repository.test.ts)
Developer 4: T013 (heritage-import.integ.test.ts)
Developer 5: T014 (heritage-site-display.spec.ts)

# Stage 2: Models & repositories in parallel (6 developers)
Developer 1: T015 (PropertyRestriction model)
Developer 2: T016 (HeritageSiteImportError model)
Developer 3: T017 (DataSource model)
# After models complete:
Developer 1: T018 (property-restrictions-repository)
Developer 2: T019 (import-errors-repository)
Developer 3: T020 (data-sources-repository)

# Stage 3: Services (2 developers, sequential gates)
Developer 1: T021 → T023 (geometry-validator + verify)
Developer 2: T022 → T024 (boundary-simplifier + verify)

# Stage 4: Import scripts (2 developers)
Developer 1: T025 (import-national-trust)
Developer 2: T026 (import-historic-england) in parallel if both developers familiar with structure
# OR sequential if learning from first implementation

# Stage 5: API (2 developers)
Developer 1: T029 (property-service)
Developer 2: T030 (route) after T029

# Stage 6: Frontend (2 developers)
Developer 1: T031 + T032 (types + api-client)
Developer 2: T033 (map component) after T032
```

**User Story 2 - Parallelization**:
```bash
# Stage 1: Tests in parallel (5 developers)
Developer 1: T039 (duplicate-detector.test.ts)
Developer 2: T040 (alerts.test.ts)
Developer 3: T041 (import-transaction.integ.test.ts)
Developer 4: T042 (duplicate-resolution.integ.test.ts)
Developer 5: T043 (import-operations.contract.test.ts)

# Stage 2: Services in parallel (2 developers)
Developer 1: T044 → T046 (duplicate-detector + verify)
Developer 2: T045 → T047 (alerts + verify)

# Stage 3: Enhanced imports (2 developers)
Developer 1: T048 → T050 (enhance national-trust + verify)
Developer 2: T049 → T051 (enhance historic-england + verify)
```

**Polish Phase**:
- T056, T057, T058, T059, T060, T062, T063 can all run in parallel (different files/concerns)
- T061, T064, T065 require all code complete (sequential)

---

## Implementation Strategy

### Recommended MVP Scope

**Minimum Viable Product (MVP)**: User Story 1 (Phase 1-3)
- **Duration**: 3-4 days (one developer) or 1-2 days (team of 3)
- **Deliverable**: Heritage sites display on map with zoom-optimized boundaries and click interaction
- **Value**: Drone pilots can see heritage site property boundaries
- **Low Risk**: Core functionality only, error handling deferred to US2

**MVP+ Scope**: User Story 1 + User Story 2 (Phase 1-4)
- **Duration**: 4-5 days (one developer) or 2-3 days (team of 3)
- **Deliverable**: MVP + production-grade error handling, alerts, health tracking
- **Value**: Operational reliability for production deployment
- **Production Ready**: Full error handling and monitoring

### Incremental Delivery Approach

**Week 1**: Foundation + User Story 1
- Day 1: Setup + Foundational (T001-T009)
- Day 2-3: US1 Tests + Models + Services (T010-T024)
- Day 4: US1 Import Scripts + API (T025-T030)
- Day 5: US1 Frontend + Manual Testing (T031-T038)
- **Demo**: Show map with heritage sites displaying

**Week 2**: User Story 2 + Polish
- Day 1: US2 Tests + Services (T039-T047)
- Day 2: US2 Enhanced Imports + Scheduler (T048-T052)
- Day 3: US2 Manual Testing (T053-T055)
- Day 4-5: Polish + Final Validation (T056-T065)
- **Demo**: Show error handling, alerts, health dashboard

### Test-Driven Development Workflow

**MANDATORY for ALL tasks marked with [US1] or [US2]**:

1. **RED**: Write test first, run `npx vitest run [test-file]`, verify it FAILS
2. **GREEN**: Implement minimum code to make test PASS
3. **REFACTOR**: Clean up implementation while keeping test green
4. **COMMIT**: Commit test + implementation together

**Example TDD cycle for T021 (geometry-validator)**:
```bash
# RED: Write failing test
npx vitest run tests/unit/services/geometry-validator.test.ts
# Expected: All tests FAIL (geometry-validator.ts doesn't exist yet)

# GREEN: Implement service
# Create backend/src/services/geometry-validator.ts
npx vitest run tests/unit/services/geometry-validator.test.ts
# Expected: All tests PASS

# REFACTOR: Improve code quality
# Run: npx eslint src/services/geometry-validator.ts --fix

# COMMIT: T021 - Implement geometry-validator service with ST_IsValid validation
```

### Constitution Compliance Checkpoints

**Safety-First (§I)**: 
- T010 test covers ST_IsValid validation ✓
- T021 implementation prevents corrupt geometries ✓
- T019 quarantine repository isolates invalid data ✓

**Test-Driven Development (§III)**:
- All [US1] and [US2] tasks have corresponding test tasks written FIRST ✓
- Tests in T010-T014, T039-T043 MUST FAIL before implementation proceeds ✓
- Target 90% coverage minimum, 100% for validation (T010, T021) ✓

**Modular Architecture (§II)**:
- Services independent (T021-T022, T044-T045) ✓
- Repository pattern isolates database access (T018-T020) ✓
- Clear module boundaries enable parallel development ✓

**Documentation & Observability (§IV)**:
- T002 Winston structured logging ✓
- T058 log review ensures required fields ✓
- T053-T054 verify monitoring works ✓

**Security & Compliance (§V)**:
- T003 .env.example prevents credential exposure ✓
- T065 security review checks parameterization ✓
- Public data sources only (National Trust, Historic England) ✓

---

## Success Criteria Checklist

### User Story 1 Success Criteria (from spec.md SC-001 to SC-008)

- [ ] SC-001: National Trust import retrieves ≥1,500 records with <5% validation failures (verify via T036)
- [ ] SC-002: Historic England import retrieves ≥15,000 records (verify via T037)
- [ ] SC-003: Import failure logs structured error and sends alert within 5 min (verify via T053)
- [ ] SC-004: Duplicate heritage sites deduplicated with single polygon displayed (verify via T054)
- [ ] SC-005: Heritage site polygons render at ≥30fps with 50+ sites visible (verify via T064)
- [ ] SC-006: Click polygon displays detail panel within 300ms (verify via T038)
- [ ] SC-007: Invalid geometries quarantined with 100% rate (verify via T054)
- [ ] SC-008: Heritage site layer toggleable independently (verify via T038)

### Verification Commands

```bash
# SC-001, SC-002: Import record counts
psql $DATABASE_URL -c "
  SELECT managing_organization, COUNT(*) as records 
  FROM property_restrictions 
  WHERE restriction_category = 'HERITAGE_SITE' AND is_primary = true 
  GROUP BY managing_organization;"

# SC-003: Alert delivery (check logs)
grep "alert" backend/logs/import-error.log | jq '.timestamp, .data_source, .error_summary'

# SC-004: Duplicate resolution
psql $DATABASE_URL -c "
  SELECT COUNT(*) as total, 
         COUNT(*) FILTER (WHERE is_primary = true) as primary,
         COUNT(*) FILTER (WHERE superseded_by IS NOT NULL) as duplicates
  FROM property_restrictions 
  WHERE restriction_category = 'HERITAGE_SITE';"

# SC-005, SC-006: Performance (manual browser DevTools Performance tab)

# SC-007: Quarantine rate
psql $DATABASE_URL -c "
  SELECT error_type, COUNT(*) 
  FROM heritage_sites_import_errors 
  WHERE resolved = false 
  GROUP BY error_type;"

# SC-008: Layer toggle (manual browser test)
```

---

## Task Count Summary

- **Phase 1 (Setup)**: 4 tasks
- **Phase 2 (Foundational)**: 5 tasks
- **Phase 3 (User Story 1)**: 30 tasks
  - Tests: 5 tasks (T010-T014)
  - Implementation: 21 tasks (T015-T034)
  - Manual Testing: 4 tasks (T035-T038)
- **Phase 4 (User Story 2)**: 17 tasks
  - Tests: 5 tasks (T039-T043)
  - Implementation: 9 tasks (T044-T052)
  - Manual Testing: 3 tasks (T053-T055)
- **Phase 5 (Polish)**: 10 tasks

**TOTAL**: 66 tasks

**Estimated Duration**: 
- 1 developer: 30-40 hours (4-5 days)
- Team of 3: 16-20 hours (2-3 days with parallel execution)

**Parallel Opportunities**: 28 tasks marked [P] can run in parallel

**MVP Scope**: T001-T038 (39 tasks, ~24 hours)
**Production Scope**: T001-T065 (66 tasks, ~40 hours)
