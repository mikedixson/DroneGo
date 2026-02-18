# Research: Drone Flight Zone Map Technical Decisions

**Feature**: 001-flight-zone-map  
**Date**: 2026-02-17  
**Status**: Complete  
**Purpose**: Resolve all NEEDS CLARIFICATION items from Technical Context

---

## Executive Summary

This research resolves technical unknowns for building a UK drone flight restriction map PWA. All decisions prioritize safety, offline-first functionality, and authoritative data sources as required by the constitution and feature specification.

**Key Technology Decisions:**
- **Map Library**: Leaflet 1.9.4 + Turf.js 6.5.0
- **Build Tool**: Vite 5.x + vite-plugin-pwa
- **Backend**: Node.js + Express + PostgreSQL 15 with PostGIS
- **Frontend Framework**: Vanilla TypeScript (no heavy framework overhead)
- **Testing**: Vitest (unit) + Playwright (E2E)
- **Data Sources**: UK CAA + NATS AIS + UK NOTAM Service

---

## 1. Map Library Selection

### Decision
**Leaflet 1.9.4 + Turf.js 6.5.0**

### Rationale

1. **Performance**: ~64KB gzipped total (Leaflet 39KB + Turf.js 25KB) enables <3s load on 4G (FR-025)
2. **Offline-First**: Excellent tile caching via `leaflet.offline` plugin with no licensing restrictions
3. **Geospatial**: Turf.js provides robust point-in-polygon for restriction zone queries
4. **Zero Cost**: BSD-2 license, no API costs, no vendor lock-in
5. **Mobile-Optimized**: Battle-tested touch gestures and mobile performance
6. **PWA-Compatible**: Seamless service worker integration for offline caching

### Alternatives Considered

**Mapbox GL JS**:
- ❌ **REJECTED**: Proprietary licensing prohibits offline tile caching without enterprise license
- Bundle size 270KB (4x larger than Leaflet)
- API costs beyond free tier (50k MAU limit)
- **Offline violation**: Cannot legally cache tiles per standard ToS

**OpenLayers**:
- ⚠️ **NOT CHOSEN**: Technically capable but 130KB bundle (2x Leaflet)
- Complex API, steeper learning curve
- Overkill for mobile-first PWA requirements
- Better suited for complex GIS applications

### Implementation Notes

```javascript
// Core dependencies
leaflet: ^1.9.4              // Core mapping (~39KB)
@turf/turf: ^6.5.0           // Geospatial ops (~25KB)
leaflet.offline: ^2.1.0      // Offline tile caching
localforage: ^1.10.0         // IndexedDB storage

// Tile sources (free options)
- OpenStreetMap (primary)
- Thunderforest (backup, requires API key)

// Point-in-polygon example
import * as turf from '@turf/turf';
const point = turf.point([lon, lat]);
const isRestricted = restrictionZones.some(zone => 
  turf.booleanPointInPolygon(point, zone.geometry)
);
```

---

## 2. UK Airspace Data Sources

### Decision

**Primary Authoritative Sources:**
1. **UK Civil Aviation Authority (CAA)** - Geographic Zones & Restrictions
2. **NATS AIS** - Airspace Structure & eAIP Data
3. **UK NOTAM Service** - Temporary Restrictions

**Supplementary Sources:**
4. **Ordnance Survey OpenData** - Context for TOAL sites

### Rationale

**Legal Authority & Compliance:**
- CAA is legally designated UK airspace authority under Air Navigation Order 2016
- NATS provides official UK AIP (Aeronautical Information Publication)
- Primary sources satisfy FR-014 (CAA integration) and FR-018 (confidence indicators)
- Compliance with UK Regulation (EU) 2019/947 for UAS operations

**Data Completeness:**
- **CAA**: Article 94A Geographic Zones, FRZs, drone-specific restrictions
- **NATS**: Class A-G airspace, ATZs, controlled zones, altitude limits
- **NOTAM**: Temporary flight restrictions, active danger areas, military exercises
- Combined: Complete UK coverage for all restriction types (FR-002 to FR-006)

**Update Frequency:**
- CAA: 28-day AIRAC cycle (monthly)
- NATS: 28-day AIRAC + ad-hoc supplements
- NOTAM: Real-time updates
- **Strategy**: Daily automated checks satisfy FR-016 (daily updates)

**Cost & Licensing:**
- ✅ **Free**: All sources under Open Government License v3.0 or public access
- Attribution required: "Contains public sector information licensed under OGL v3.0"
- Commercial use permitted

### Alternatives Considered

**Altitude Angel Drone Airspace Map**:
- ⚠️ **NOT CHOSEN**: Third-party commercial aggregator (£££)
- Provides convenience but not primary authority source
- Would add cost without improving authority/confidence level
- Could consider for Phase 2 as supplementary context

**OpenSky Network (ADS-B)**:
- ❌ **REJECTED**: Real-time aircraft tracking, not airspace structure
- Not an official restriction source
- Doesn't satisfy FR-014 authority requirements

### Data Integration Approach

**Phase 1 (MVP - Week 1-3):**
```
1. CAA Geographic Zones
   - Download: https://airspace.caa.co.uk/ (GeoJSON)
   - Format: GeoJSON FeatureCollection
   - Storage: PostgreSQL + PostGIS
   - Update: Daily automated download (cron job)

2. NATS eAIP Data
   - Access: https://www.aurora.nats.co.uk/htmlAIP/
   - Method: Manual extraction → GeoJSON conversion (Phase 1)
   - Future: Discuss AIXM licensing with NATS for automated access
   - Storage: PostgreSQL + PostGIS

3. NOTAM Integration
   - Access: https://www.notaminfo.com/
   - Method: Daily manual review → database entry (MVP)
   - Parse: Filter UAS-relevant NOTAMs by keyword
   - Future: Automated parsing/API (requires NATS discussion)
```

**Phase 2 (Post-MVP - Week 4+):**
- NATS AIXM automated parsing (if licensing secured)
- NOTAM API integration (hourly updates)
- Local authority drone bylaws (manual research per council)

**Action Items (Pre-Implementation):**
1. ✅ Identify exact CAA GeoJSON download URLs
2. 📋 Contact NATS AIS (ais.nats@nats.co.uk) to discuss AIXM/NOTAM API licensing
3. 📋 Document OGL attribution requirements in quickstart.md
4. 📋 Design PostGIS schema for airspace polygons with altitude attributes

---

## 3. PWA Build Tools & Offline Architecture

### Decision

**Build Stack:**
- **Build Tool**: Vite 5.x + vite-plugin-pwa
- **Service Worker**: Workbox 7.x (generated by vite-plugin-pwa)
- **Offline Storage**: IndexedDB via localforage
- **Frontend**: Vanilla TypeScript (no React/Vue overhead for mobile performance)

**Caching Strategy (Hybrid Multi-Pattern):**
- **Cache-First**: Map tiles & app shell (30-90 day TTL)
- **Stale-While-Revalidate**: Restriction zone data (24hr TTL, background refresh)
- **Network-First**: NOTAM/temporary restrictions (1hr cache fallback only)

### Rationale

**Build Tool (Vite):**
1. Native TypeScript support, zero config
2. Lightning-fast HMR for development productivity
3. Optimized production builds (tree-shaking, code-splitting)
4. Excellent PWA plugin ecosystem

**Service Worker (Workbox via vite-plugin-pwa):**
1. Industry-standard service worker patterns
2. Automated generation with sensible defaults
3. Configurable caching strategies per route/asset type
4. Background sync API support (FR-024 auto-refresh)

**Caching Strategy Justification:**

| Pattern | Assets | TTL | Rationale |
|---------|--------|-----|-----------|
| **Cache-First** | Map tiles, app shell | 30-90 days | Tiles immutable (z/x/y addressed); instant offline load (FR-021) |
| **Stale-While-Revalidate** | Restriction zones | 24 hours | Balance responsiveness + freshness; auto-refresh (FR-024) |
| **Network-First** | NOTAMs | 1hr fallback | Safety-critical freshness; cache only for offline emergency |

**Why Vanilla TypeScript (No Framework):**
- Minimize bundle size for <3s load goal (FR-025)
- Leaflet provides DOM manipulation for map UI
- Simple form/search UI doesn't justify React/Vue overhead
- Easier to optimize for mobile performance

### Offline Storage Schema (IndexedDB)

```typescript
// Object Store: 'regions'
interface CachedRegion {
  id: string;                    // e.g., "uk-southeast"
  bounds: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  zones: GeoJSON.FeatureCollection;         // restriction polygons
  toalSites: GeoJSON.FeatureCollection;     // TOAL locations
  lastUpdated: number;           // timestamp for FR-019 staleness check
  dataVersion: string;           // AIRAC cycle ID for cache invalidation
}

// Object Store: 'tiles'
interface CachedTile {
  key: string;      // "z/x/y" tile coordinate
  blob: Blob;       // tile image data
  timestamp: number;
}
```

**Storage Limits:**
- Target: <100MB per region (per requirements)
- ~500 tiles @ 50-75KB each = ~37MB
- Restriction zones GeoJSON: ~5-10MB per region
- Total per region: ~50-85MB ✅ under limit

### Alternatives Considered

**Next.js / Create React App**:
- ❌ **REJECTED**: SSR overhead unnecessary for PWA
- Larger bundle sizes
- More complex PWA configuration
- Better for content-heavy web apps, not map PWAs

**Parcel**:
- ⚠️ **NOT CHOSEN**: Limited PWA plugin ecosystem
- Less control over service worker generation
- Vite has better TypeScript DX

**Cache API Only (no IndexedDB)**:
- ❌ **REJECTED**: Cannot efficiently query structured GeoJSON
- No indexing for spatial queries
- Poor for restriction zone lookup

### Implementation Configuration

**vite.config.ts:**
```typescript
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.+\.tile\.openstreetmap\.org\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
            },
          },
          {
            urlPattern: /\/api\/zones\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'restriction-zones',
              expiration: {
                maxAgeSeconds: 24 * 60 * 60, // 1 day
              },
            },
          },
        ],
      },
      manifest: {
        name: 'DroneGo Flight Zone Map',
        short_name: 'DroneGo',
        description: 'UK drone flight restriction map with offline support',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
});
```

---

## 4. Backend Technology Stack

### Decision

**Backend Stack:**
- **Runtime**: Node.js 20 LTS + Express 4.x
- **Database**: PostgreSQL 15 + PostGIS 3.x
- **API**: RESTful JSON API with OpenAPI 3.0 spec
- **Authentication**: JWT for admin endpoints only (data ingestion)

### Rationale

**Node.js + Express:**
- TypeScript shared between frontend and backend (code reuse)
- Mature ecosystem for API development
- Excellent geospatial library support (turf, geojson-validation)
- Fast JSON processing for GeoJSON responses

**PostgreSQL + PostGIS:**
- Industry-standard geospatial database
- Efficient spatial indexing (GIST indexes for polygons)
- Native GeoJSON support (`ST_AsGeoJSON()`)
- Complex spatial queries:
  ```sql
  SELECT * FROM restriction_zones 
  WHERE ST_Contains(geometry, ST_SetSRID(ST_MakePoint(-0.1275, 51.5074), 4326));
  ```
- Free and open-source

**RESTful API Design:**
```
GET  /api/zones?bounds=minLon,minLat,maxLon,maxLat    # Query zones by bbox
GET  /api/zones/:id                                    # Zone details
GET  /api/zones/check?lat=51.5074&lon=-0.1275         # Point check (P1)
GET  /api/toal?bounds=...                              # TOAL sites
GET  /api/health                                       # Service health
POST /api/admin/zones/refresh                          # Admin: trigger data sync
```

### Alternatives Considered

**Python + FastAPI + PostGIS**:
- ✅ Excellent geospatial libraries (shapely, geopandas)
- ⚠️ Different language from frontend (TypeScript)
- ⚠️ Async support good but Node.js equally capable
- **Decision**: Node.js chosen for language consistency

**MongoDB + GeoJSON**:
- ❌ **REJECTED**: Less mature geospatial support vs PostGIS
- No native polygon-polygon operations (intersects, contains)
- PostGIS performance better for complex spatial queries

**Firebase/Supabase**:
- ⚠️ Could work but less control over geospatial optimization
- Vendor lock-in concerns
- Self-hosted PostgreSQL preferred for data sovereignty

---

## 5. Testing Frameworks

### Decision

**Unit Testing**: Vitest 1.x  
**E2E Testing**: Playwright 1.x  
**Coverage Target**: 90% overall, 100% for airspace calculation logic

### Rationale

**Vitest (Unit Tests):**
1. **Vite-native**: Shares config with build tool, consistent transforms
2. **Fast**: Near-instant test starts, HMR-like experience
3. **Jest-compatible**: Familiar API, easy migration if needed
4. **TypeScript**: Native support, no ts-jest configuration
5. **Coverage**: Built-in c8 coverage reporting

**Use Cases:**
- Service worker caching logic (mock Cache API)
- IndexedDB operations (using fake-indexeddb)
- Geospatial utilities (point-in-polygon, distance calculations)
- API response parsing and validation
- **Safety-critical**: 100% coverage on airspace restriction determination

**Playwright (E2E Tests):**
1. **Cross-browser**: Test Chrome, Firefox, Safari with single API
2. **PWA-specific**: Offline mode, service worker, manifest testing
3. **Network control**: Mock tile servers, simulate offline/online
4. **Reliable**: Auto-wait, web-first assertions reduce flakes
5. **Fast**: Parallel execution with browser contexts

**Use Cases:**
- User flow: open app → see current location → check restriction (P1)
- Search flow: enter postcode → view area → find TOAL site (P2)
- Offline mode: cache region → go offline → verify map loads (P4)
- Data staleness: mock old cache → verify warning shown (FR-019)

### Alternatives Considered

**Jest**:
- ⚠️ **NOT CHOSEN**: Requires babel/ts-jest for TypeScript
- Not Vite-native, separate transform pipeline
- Vitest is drop-in Jest replacement with better Vite integration

**Cypress**:
- ⚠️ **NOT CHOSEN**: Chromium-only (no Firefox/Safari)
- Flakier than Playwright in practice
- Playwright has better PWA testing support

### Test Structure

```
backend/tests/
├── contract/            # API contract tests (OpenAPI validation)
│   └── zones.contract.test.ts
├── integration/         # Database + service integration
│   └── zones.service.test.ts
└── unit/                # Pure functions, business logic
    └── geospatial.test.ts

frontend/tests/
├── e2e/                 # Playwright end-to-end scenarios
│   ├── p1-current-location.spec.ts
│   ├── p2-search-planning.spec.ts
│   └── p4-offline-mode.spec.ts
├── integration/         # Component + service integration
│   └── map.integration.test.ts
└── unit/                # Utilities, pure functions
    ├── cache-manager.test.ts
    └── geolocation.test.ts
```

---

## 6. Integration Architecture Summary

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ DATA SOURCES                                                │
├─────────────────────────────────────────────────────────────┤
│ CAA API (GeoJSON) → Daily download (cron)                  │
│ NATS eAIP → Manual extraction → GeoJSON (Phase 1)          │
│ NOTAM Service → Daily scrape/manual (Phase 1)              │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ BACKEND (Node.js + Express)                                │
├─────────────────────────────────────────────────────────────┤
│ Data Ingestion Pipeline:                                    │
│  - Download CAA GeoJSON                                     │
│  - Validate with geojson-validation                         │
│  - Transform to database schema                             │
│  - Insert into PostgreSQL + PostGIS                         │
│                                                              │
│ REST API:                                                   │
│  - GET /api/zones?bounds=... (spatial query)               │
│  - GET /api/zones/check?lat=...&lon=... (point query)     │
│  - GET /api/toal?bounds=... (TOAL sites)                   │
│                                                              │
│ Database: PostgreSQL 15 + PostGIS 3.x                      │
│  - restriction_zones table (geometry, type, altitude, etc.) │
│  - toal_sites table (point geometry, facilities)           │
│  - GIST spatial indexes for fast queries                    │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼ (HTTPS/TLS 1.3)
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND PWA (Vite + TypeScript + Leaflet)                │
├─────────────────────────────────────────────────────────────┤
│ Service Worker (Workbox):                                   │
│  - Cache-first: Map tiles (OpenStreetMap)                  │
│  - Stale-while-revalidate: Restriction zones (24hr TTL)    │
│  - Network-first: NOTAMs (1hr fallback)                    │
│                                                              │
│ IndexedDB (localforage):                                    │
│  - Cached regions (GeoJSON polygons)                       │
│  - Tile cache (blob storage)                               │
│  - Timestamps for staleness detection (FR-019)             │
│                                                              │
│ Map UI (Leaflet + Turf.js):                                │
│  - Display geolocation (FR-001)                            │
│  - Render restriction zones with color coding (FR-002-004) │
│  - Point-in-polygon check (P1: 5-second decision)          │
│  - Search and detail panels (P2, P3)                       │
│                                                              │
│ Offline Detection:                                          │
│  - navigator.onLine events                                  │
│  - Show cached data indicator when offline (FR-023)        │
│  - Warn if cache >48hrs old (FR-019)                       │
└─────────────────────────────────────────────────────────────┘
```

### Performance Budget

| Metric | Target | Measurement Method |
|--------|--------|--------------------|
| **Initial Load (4G)** | <3s | Lighthouse Performance score |
| **Time to Interactive** | <4s | Lighthouse TTI |
| **Location Status** | <5s | Custom timing: app open → restriction displayed |
| **Search Results** | <2s | Custom timing: search submit → results rendered |
| **Tile Load** | <500ms | Network waterfall |
| **Point-in-Polygon Query** | <16ms | Performance.measure (must fit in 60fps frame) |
| **Bundle Size** | <150KB gzipped | Rollup analysis |
| **IndexedDB Write** | <100ms | Performance.measure |

---

## 7. Action Items Before Phase 1

### Immediate (Before Design Phase)
1. ✅ **COMPLETE**: Technology stack decisions documented
2. 📋 **TODO**: Contact NATS AIS for AIXM/NOTAM licensing discussion
3. 📋 **TODO**: Identify exact CAA GeoJSON download URLs
4. 📋 **TODO**: Set up development environment (Node 20, PostgreSQL 15, PostGIS 3.x)
5. 📋 **TODO**: Create GitHub repository with initial README

### Phase 1 Prerequisites
6. 📋 **TODO**: Install Vite + vite-plugin-pwa + dependencies
7. 📋 **TODO**: Configure PostgreSQL + PostGIS database
8. 📋 **TODO**: Design database schema (restriction_zones, toal_sites tables)
9. 📋 **TODO**: Set up Vitest + Playwright testing frameworks
10. 📋 **TODO**: Create OpenAPI 3.0 spec template for API contract design

---

## Conclusion

All NEEDS CLARIFICATION items from Technical Context are resolved:

| Item | Resolution |
|------|------------|
| **Primary Dependencies** | Leaflet 1.9.4, Turf.js 6.5.0, Vite 5.x, Express 4.x, PostgreSQL 15 + PostGIS 3.x |
| **Storage** | IndexedDB (frontend), PostgreSQL + PostGIS (backend) |
| **Testing** | Vitest (unit), Playwright (E2E) |
| **Data Sources** | UK CAA, NATS AIS, UK NOTAM Service |
| **PWA Framework** | Vite + vite-plugin-pwa + Workbox |

All decisions align with:
- ✅ Constitution (safety-first, modular, TDD, documentation, security)
- ✅ Functional Requirements (FR-001 to FR-027)
- ✅ Success Criteria (SC-001 to SC-010)
- ✅ Performance Goals (<3s load, <5s location determination, <2s search)

**Next Phase**: Phase 1 - Generate data-model.md, API contracts, and quickstart.md
