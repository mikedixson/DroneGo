# DroneGo Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-17

## Active Technologies
- TypeScript 5.x (full-stack) (001-flight-zone-map)
- PostgreSQL 15 with PostGIS 3.3 extension (spatial database) (001-flight-zone-map)
- TypeScript (Node.js 20.0+, NPM 10.0+) + Express 4.18, PostgreSQL 15 + PostGIS, Vite 5.0, Leaflet 1.9, @turf/turf 6.5 (001-flight-zone-map)
- PostgreSQL with PostGIS extensions (spatial queries), 1,033 zones currently loaded (001-flight-zone-map)
- [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION] + [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION] (fix-heritage-site-imports)
- [if applicable, e.g., PostgreSQL, CoreData, files or N/A] (fix-heritage-site-imports)
- TypeScript with Node.js 20+ + Express 4.x, PostgreSQL 14+ with PostGIS 3.x, pg 8.x driver, Winston 3.x logging, Axios 1.x HTTP client, node-schedule 2.x cron, pg_trgm extension, Vitest 1.x testing (fix-heritage-site-imports)
- PostgreSQL 14+ with PostGIS 3.3+ spatial extension, pg_trgm extension for fuzzy string matching (fix-heritage-site-imports)

- TypeScript 5.x (for type safety and PWA compatibility) (001-flight-zone-map)

## Project Structure

```text
backend/
frontend/
tests/
```

## Commands

npm test; npm run lint

## Code Style

TypeScript 5.x (for type safety and PWA compatibility): Follow standard conventions

## Recent Changes
- fix-heritage-site-imports: Added TypeScript with Node.js 20+ + Express 4.x, PostgreSQL 14+ with PostGIS 3.x, pg 8.x driver, Winston 3.x logging, Axios 1.x HTTP client, node-schedule 2.x cron, pg_trgm extension, Vitest 1.x testing
- fix-heritage-site-imports: Added [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION] + [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]
- 001-flight-zone-map: Added TypeScript (Node.js 20.0+, NPM 10.0+) + Express 4.18, PostgreSQL 15 + PostGIS, Vite 5.0, Leaflet 1.9, @turf/turf 6.5


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
