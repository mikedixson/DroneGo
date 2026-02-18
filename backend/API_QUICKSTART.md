# DroneGo Backend API - Quick Start Guide

## Prerequisites
✅ PostgreSQL database is running (dronego-postgres)
✅ Environment configured (.env file in project root)
✅ Dependencies installed

## Starting the Backend Server

```bash
cd backend
npm run dev
```

The server will start on **http://localhost:3000**

## Available API Endpoints

### Health Check
```bash
curl http://localhost:3000/health
```

### Get Restriction Zones (Bounding Box Query)

**Request:**
```bash
# Query zones around central London
curl "http://localhost:3000/api/v1/zones?minLng=-0.2&minLat=51.4&maxLng=-0.1&maxLat=51.6"
```

**Optional Query Parameters:**
- `zoneTypes` - Filter by type (e.g., `no-fly,controlled-airspace`)
- `includeExpired` - Include expired zones (`true` or `false`)
- `confidenceLevels` - Filter by confidence level
- `authoritySources` - Filter by authority (e.g., `CAA,NATS`)

**Example with Filters:**
```bash
curl "http://localhost:3000/api/v1/zones?minLng=-0.2&minLat=51.4&maxLng=-0.1&maxLat=51.6&zoneTypes=no-fly"
```

**Response:** GeoJSON FeatureCollection with restriction zones and data freshness metadata

---

### Get Single Zone Details

**Request:**
```bash
# Get detailed information about a specific zone by ID
curl "http://localhost:3000/api/v1/zones/6094d29f-291b-4e67-abf7-3a1693926e37"
```

**Response:** GeoJSON Feature with full zone properties and data source metadata

---

### Query Airspace Classifications

**Point Query:**
```bash
# Find all airspace containing a specific coordinate
curl "http://localhost:3000/api/v1/airspace?lng=-0.1656&lat=51.5074"

# Include altitude filtering for 3D queries
curl "http://localhost:3000/api/v1/airspace?lng=-0.1656&lat=51.5074&altitude=1000"
```

**Bounds Query:**
```bash
# Find all airspace intersecting a bounding box
curl "http://localhost:3000/api/v1/airspace?minLng=-0.5&minLat=51.5&maxLng=-0.4&maxLat=51.6"

# Filter by ICAO class and altitude range
curl "http://localhost:3000/api/v1/airspace?minLng=-0.5&minLat=51.5&maxLng=-0.4&maxLat=51.6&classes=C,D,E&altitudeFloor=0&altitudeCeiling=5000"
```

**Query Parameters:**
- Point mode: `lng`, `lat`, `altitude` (optional)
- Bounds mode: `minLng`, `minLat`, `maxLng`, `maxLat`, `altitudeFloor` (optional), `altitudeCeiling` (optional)
- Class filter (both modes): `classes` - Comma-separated ICAO classes (A, B, C, D, E, F, G)

**Response:** GeoJSON FeatureCollection with airspace classifications

---

### Get Single Airspace Details

**Request:**
```bash
# Get detailed information about a specific airspace by ID
curl "http://localhost:3000/api/v1/airspace/550e8400-e29b-41d4-a716-446655440000"
```

**Response:** GeoJSON Feature with airspace properties

---

### Check Location Restriction Status

**Request:**
```bash
# Check if you can fly at Hyde Park, London
curl "http://localhost:3000/api/v1/location/check?lng=-0.1656&lat=51.5074"
```

**Response Fields:**
- `restriction_status` - `"permitted"`, `"controlled"`, or `"no-fly"`
- `can_fly` - Boolean indicating if flight is allowed
- `authorization_required` - Boolean indicating if authorization is needed
- `zones` - Array of restriction zones containing this point
- `nearest_toal` - Nearest Take-Off And Landing site with distance
- `metadata` - Query timestamp and coordinates

**Example Response:**
```json
{
  "restriction_status": "permitted",
  "can_fly": true,
  "authorization_required": false,
  "zones": [],
  "nearest_toal": {
    "site_id": "...",
    "site_name": "Richmond Park TOAL",
    "distance_meters": 2340.5,
    "access_type": "public",
    "verified": true
  },
  "metadata": {
    "query_timestamp": "2026-02-18T14:30:00.000Z",
    "coordinates": { "lng": -0.1656, "lat": 51.5074 }
  }
}
```

---

## Testing with PowerShell

If you prefer PowerShell (Windows), use `Invoke-RestMethod`:

```powershell
# Health check
Invoke-RestMethod http://localhost:3000/health

# Get zones in bounding box
Invoke-RestMethod "http://localhost:3000/api/v1/zones?minLng=-0.2&minLat=51.4&maxLng=-0.1&maxLat=51.6"

# Get single zone details
Invoke-RestMethod "http://localhost:3000/api/v1/zones/6094d29f-291b-4e67-abf7-3a1693926e37"

# Check location
Invoke-RestMethod "http://localhost:3000/api/v1/location/check?lng=-0.1656&lat=51.5074"

# Query airspace at point
Invoke-RestMethod "http://localhost:3000/api/v1/airspace?lng=-0.1656&lat=51.5074"

# Query airspace in bounds with class filter
Invoke-RestMethod "http://localhost:3000/api/v1/airspace?minLng=-0.5&minLat=51.5&maxLng=-0.4&maxLat=51.6&classes=C,D,E"
```

---

## Current Database State

The database currently has test data from our test suites. To add production data:

1. **Check existing zones:**
```bash
docker exec dronego-postgres psql -U dronego -d dronego -c "SELECT zone_type, restriction_name, authority_source FROM restriction_zones LIMIT 5;"
```

2. **Add sample zones** (if needed):
```sql
-- Example: Add a no-fly zone around Heathrow
INSERT INTO restriction_zones (
  zone_type, restriction_name, geometry, authority_source, data_source_id,
  altitude_floor, altitude_ceiling, authorization_possible, confidence_level
) VALUES (
  'airport-frz', 'Heathrow Flight Restriction Zone',
  ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(-0.4543, 51.4700), 4326)::geography, 2500)::geometry),
  'CAA', (SELECT source_id FROM data_sources WHERE authority_name = 'CAA' LIMIT 1),
  0, 2000, false, 'primary-authority'
);
```

---

## Next Steps

1. **Start the backend:** `npm run dev` in the backend directory
2. **Test the health endpoint:** Open http://localhost:3000/health in your browser
3. **Query zones:** Use curl or PowerShell commands above
4. **Check location status:** Test flight permission at specific coordinates
5. **Frontend:** Start the frontend dev server to see the map UI

---

## Troubleshooting

**Connection refused:**
- Verify database is running: `docker ps`
- Check .env file has correct DB credentials

**No zones returned:**
- Database may be empty - run tests to populate test data:
  ```bash
  npm test tests/contract/zones.test.ts
  ```

**Port already in use:**
- Change PORT in .env file or stop other services on port 3000

---

## API Documentation Notes

- All coordinates use WGS84 (EPSG:4326) format: longitude, latitude
- Longitude range: -180 to 180
- Latitude range: -90 to 90
- All altitudes in feet AMSL (Above Mean Sea Level)
- Timestamps in ISO 8601 format (UTC)
- GeoJSON responses follow RFC 7946 specification
