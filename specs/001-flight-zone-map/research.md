# Research Findings: Heritage Site Integration

**Date**: 2026-02-18 | **Feature**: Flight Zone Map Heritage Sites | **Phase**: 0  

---

## 1. Heritage Data Source Integration

**Decision**: Use Historic England + National Trust ArcGIS Feature Services with GeoJSON export

**Historic England (Primary)**:
- Endpoint: `https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/arcgis/rest/services/National_Heritage_List_for_England_NHLE_v02_VIEW/FeatureServer`
- Auth: Public (no API key)
- Format: GeoJSON via `f=geojson` parameter
- Rate Limit: 1,000 records/query (pagination required)
- License: OGL v3.0 (commercial use allowed)
- Update Frequency: Daily
- Datasets: 11 layers (Scheduled Monuments, Parks & Gardens, World Heritage Sites)
- Spatial Reference:EPSG:27700 (transform to EPSG:4326)

**National Trust (Supplementary)**:
- Endpoint: `https://services-eu1.arcgis.com/NPIbx47lsIiu2pqz/arcgis/rest/services/National_Trust_Open_Data_Land_Always_Open/FeatureServer/0`
- Auth: Public
- Format: GeoJSON
- License: CC BY 4.0
- Update Frequency: Low (last Nov 2024)
- Datasets: Always Open Land (1,173 records), Limited Access (519 records)

**Rationale**: Government-maintained authoritative data, daily updates, open licensing, REST API with pagination

**Alternatives Considered**:
- Direct Shapefile downloads → Rejected: No incremental updates, manual download overhead
- KML format → Rejected: Historic England flags "positional accuracy issue" (Jan 2026)

---

## 2. Leaflet Z-Index Layering

**Decision**: Custom Panes with explicit z-index

**Implementation**:
```typescript
this.map.createPane('propertyRestrictionsPane');
this.map.getPane('propertyRestrictionsPane')!.style.zIndex = '410';
this.map.createPane('airspaceRestrictionsPane');
this.map.getPane('airspaceRestrictionsPane')!.style.zIndex = '420';

L.geoJSON(propertyData, { pane: 'propertyRestrictionsPane' });
L.geoJSON(airspaceData, { pane: 'airspaceRestrictionsPane' });
```

**Rationale**: Container-level rendering, persistent through toggles, Leaflet's architectural design

**Alternatives Considered**:
- `.bringToFront()` → Rejected: Fragile, breaks on toggle, DOM manipulation overhead
- CSS z-index on SVG → Rejected: SVG doesn't respect CSS z-index (painter's algorithm)

---

## 3. Tri-State API Response

**Decision**: Status Enum with structured response

**API Contract**:
```typescript
interface LocationCheckResponse {
  flight_status: 'permitted' | 'prohibited' | 'check-property-restrictions';
  airspace_clear: boolean;
  property_advisory: boolean;
  zones: RestrictionZone[];
  property_restrictions?: PropertyRestrictionAdvisory[];
  message: string;
}
```

**Rationale**: Semantic clarity, extensible, FAA DroneZone precedent, single source of truth for UI

**Alternatives Considered**:
- String enum ('true'/'false'/'check') → Rejected: Non-semantic, confusing type mixing
- Boolean + flag → Rejected: Logical inconsistencies possible, client complexity

---

## 4. PostGIS Spatial Indexing

**Decision**: GIST index with fillfactor=90, ST_Intersects operator

**Implementation**:
```sql
CREATE INDEX idx_property_restrictions_geom 
  ON property_restrictions 
  USING GIST (geometry)
  WITH (fillfactor=90);

-- Optimized query
SELECT * FROM property_restrictions
WHERE geometry && ST_MakePoint($1, $2)::geography::geometry
  AND ST_Intersects(geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326));
```

**Configuration**: `work_mem=256MB`, `shared_buffers=2GB`, `random_page_cost=1.1` (SSD)

**Rationale**: O(log n) performance (5-50ms for 3,500 polygons), ST_Intersects 10-30% faster than ST_Contains

**Alternatives Considered**:
- BRIN index → Rejected: Poor for non-sorted spatial data, high false-positive rate

---

## 5. Job Scheduling Strategy

**Decision**: node-schedule with PostgreSQL state persistence

**Implementation**:
```typescript
import * as schedule from 'node-schedule';

schedule.scheduleJob('0 2 * * *', async () => {
  await runAirspaceSync();  // Daily 02:00 UTC
});

schedule.scheduleJob('0 3 * * 0', async () => {
  await runHeritageSync();  // Weekly Sunday 03:00 UTC
});
```

**State Persistence**:
```sql
CREATE TABLE job_state (
  job_name VARCHAR(100) PRIMARY KEY,
  last_run_at TIMESTAMP,
  last_run_status VARCHAR(20),
  error_count INTEGER
);
```

**Rationale**: Timezone support (UTC for aviation data), flexible cron, graceful cancellation, DST handling

**Alternatives Considered**:
- node-cron → Rejected: No timezone support
- BullMQ/Agenda → Rejected: Infrastructure overhead (Redis) for 2 jobs

---

## 6. Spatial Query Testing

**Decision**: Real PostGIS database with @turf/turf fixtures

**Implementation**:
```typescript
import * as turf from '@turf/turf';

beforeAll(async () => {
  const circularZone = turf.circle([-0.1278, 51.5074], 5, { units: 'kilometers' });
  await pool.query(`
    INSERT INTO property_restrictions (property_id, geometry)
    VALUES ($1, ST_Multi(ST_GeomFromGeoJSON($2)))
  `, ['test-zone', JSON.stringify(circularZone.geometry)]);
});

it('should detect point inside zone', async () => {
  const [lng, lat] = turf.destination([-0.1278, 51.5074], 2, 0, { units: 'km' }).geometry.coordinates;
  const result = await pool.query(`
    SELECT * FROM property_restrictions
    WHERE ST_Intersects(geometry, ST_MakePoint($1, $2)::geography::geometry)
  `, [lng, lat]);
  expect(result.rows).toHaveLength(1);
});
```

**Rationale**: PostGIS edge cases impossible to mock, GIST index verification requires real DB, Constitution requires 100% coverage

**Alternatives Considered**:
- Mocking PostGIS → Rejected: Cannot replicate ST_Intersects boundary semantics
- TestContainers → Rejected: 5-10s startup overhead per suite
- Manual GeoJSON → Partial use: Simple geometries only, Turf for complex cases

---

## Summary

| Question | Decision | Key Benefit |
|----------|----------|-------------|
| Heritage APIs | Historic England + National Trust Feature Services | Authoritative, daily updates, open license |
| Leaflet Layering | Custom panes (z-index 410/420) | Persistent, no toggle fragility |
| API Response | Status enum (`'permitted'`/`'prohibited'`/`'check-property'`) | Semantic, extensible, industry standard |
| PostGIS Index | GIST with fillfactor=90, ST_Intersects | 5-50ms queries, 10-30% faster |
| Job Scheduler | node-schedule + PostgreSQL state | Timezone support, flexible cron |
| Testing | Real PostGIS + @turf/turf | 100% coverage, edge case generation |

**Phase 0 Status**: ✅ COMPLETE  
**Next**: Phase 1 Design (data-model.md, contracts/, quickstart.md)
