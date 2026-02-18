# DroneGo Sample Data - Test Guide

## Data Summary

Successfully loaded comprehensive sample data for London area:
- **8 Restriction Zones** (no-fly, controlled, temporary)
- **4 Airspace Classifications** (Class D, E, G)
- **8 TOAL Sites** (public parks and permitted areas)
- **4 Data Sources** (CAA, NATS, DfT)

## Sample API Queries

### 1. Check if You Can Fly at Buckingham Palace
```bash
curl "http://localhost:3000/api/v1/location/check?lng=-0.1419&lat=51.5014"
```
**Result:** `restriction_status: "no-fly"`, `can_fly: false`  
Protected area - no drone flights permitted.

---

### 2. Check Olympic Park (Controlled Airspace)
```bash
curl "http://localhost:3000/api/v1/location/check?lng=-0.0157&lat=51.5434"
```
**Result:** `restriction_status: "controlled"`, `authorization_required: true`  
Nearest TOAL: Queen Elizabeth Olympic Park (permit required).

---

### 3. Check Wimbledon Common (Permitted Area)
```bash
curl "http://localhost:3000/api/v1/location/check?lng=-0.2399&lat=51.4314"
```
**Result:** `restriction_status: "permitted"`, `can_fly: true`  
Nearest TOAL: Wimbledon Common (public access).

---

### 4. Get All Restriction Zones in Central London
```bash
curl "http://localhost:3000/api/v1/zones?minLng=-0.3&minLat=51.4&maxLng=-0.0&maxLat=51.6"
```
**Returns 6 zones:**
- Buckingham Palace Protected Area (no-fly)
- Westminster Protected Area (no-fly)
- Tower of London Protected Area (no-fly)
- Olympic Park Controlled Zone (controlled-airspace)
- Heathrow Airport FRZ (airport-frz)
- Hyde Park Summer Concert TFR (temporary-restriction, expires July 2026)

---

### 5. Filter Only No-Fly Zones
```bash
curl "http://localhost:3000/api/v1/zones?minLng=-0.3&minLat=51.4&maxLng=-0.0&maxLat=51.6&zoneTypes=no-fly"
```
**Returns 3 zones:**
- Buckingham Palace
- Westminster
- Tower of London

---

### 6. Query Airspace at Heathrow
```bash
curl "http://localhost:3000/api/v1/airspace?lng=-0.4543&lat=51.4700"
```
**Returns 3 overlapping airspace classifications:**
- Heathrow Control Zone (Class D, 0-5500ft) - Authorization required
- London Class G Airspace (0-2000ft) - Uncontrolled
- London TMA Upper (Class E, 5500-19500ft) - High altitude

---

### 7. Get Airspace in Viewport with Class Filter
```bash
curl "http://localhost:3000/api/v1/airspace?minLng=-0.8&minLat=51.2&maxLng=0.5&maxLat=51.8&classes=D,E"
```
**Returns controlled airspace only:**
- Class D zones around airports
- Class E terminal control areas

---

## PowerShell Examples

```powershell
# Quick status check
Invoke-RestMethod "http://localhost:3000/api/v1/location/check?lng=-0.1419&lat=51.5014" | 
  Select-Object restriction_status, can_fly

# Get zone names
Invoke-RestMethod "http://localhost:3000/api/v1/zones?minLng=-0.3&minLat=51.4&maxLng=0.0&maxLat=51.6" |
  Select-Object -ExpandProperty features |
  Select-Object -ExpandProperty properties |
  Select-Object restriction_name, zone_type

# Check airspace classes at location
Invoke-RestMethod "http://localhost:3000/api/v1/airspace?lng=-0.4543&lat=51.4700" |
  Select-Object -ExpandProperty features |
  ForEach-Object { "$($_.properties.airspace_name) ($($_.properties.class_designation))" }
```

---

## Sample Data Details

### Restriction Zones

1. **Heathrow Airport FRZ**
   - Type: airport-frz  
   - Radius: ~2.5km  
   - Altitude: 0-2000ft  
   - Authorization: Not possible

2. **London City Airport FRZ**
   - Type: airport-frz  
   - Radius: ~2km  
   - Altitude: 0-1500ft  
   - Authorization: Not possible

3. **Buckingham Palace**
   - Type: no-fly  
   - Radius: ~1km  
   - Protected royal residence

4. **Westminster (Houses of Parliament)**
   - Type: no-fly  
   - Radius: ~800m  
   - Government protected area

5. **Tower of London**
   - Type: no-fly  
   - Radius: ~600m  
   - Historic site protection

6. **Olympic Park**
   - Type: controlled-airspace  
   - Radius: ~1.5km  
   - Altitude: 0-1000ft  
   - Authorization: Possible from local authority

7. **Richmond Park**
   - Type: controlled-airspace  
   - Radius: ~2km  
   - Altitude: 0-800ft  
   - Authorization: Royal Parks permit required

8. **Hyde Park Summer Concert** (Temporary)
   - Type: temporary-restriction  
   - Effective: July 15, 2026 (14:00-23:59)
   - Event-based restriction

### TOAL Sites (Take-Off and Landing)

**Public Access (6 sites):**
- Hampstead Heath Recreation Ground
- Primrose Hill Summit
- Victoria Park East Meadow
- Burgess Park North Field
- Wimbledon Common
- Clapham Common Long Pond Area

**Permit Required (2 sites):**
- Queen Elizabeth Olympic Park (commercial ops)
- Richmond Park (Royal Parks permit)

### Airspace Classifications

1. **Heathrow Control Zone (Class D)**
   - Radius: ~15km
   - Altitude: 0-5500ft
   - UAS authorization required from NATS

2. **London City Airport CTR (Class D)**
   - Radius: ~8km
   - Altitude: 0-2500ft
   - ATC clearance required

3. **London Class G** (Uncontrolled)
   - Coverage: Greater London
   - Altitude: 0-2000ft
   - Follow CAA Drone Code

4. **London TMA Upper (Class E)**
   - Coverage: London terminal area
   - Altitude: 5500-19500ft
   - High-altitude operations only

---

## Testing Scenarios

### Scenario 1: Tourist in London
**Question:** "Can I fly my drone in Hyde Park?"  
**Query:** `?lng=-0.1656&lat=51.5074`  
**Result:** Currently permitted, but temporary restriction applies July 15, 2026 for concert event.

### Scenario 2: Commercial Operator
**Question:** "Where can I do commercial filming in East London?"  
**Query:** Check Olympic Park TOAL site with permit-required access type.  
**Result:** Commercial operations possible at Queen Elizabeth Olympic Park with advance booking.

### Scenario 3: Recreational Flyer
**Question:** "Find me a safe place to fly near central London"  
**Query:** Query TOAL sites with access_type=public  
**Result:** Multiple parks available - Primrose Hill, Victoria Park, etc.

### Scenario 4: Safety Check
**Question:** "I'm at the Tower of London, can I fly?"  
**Query:** `?lng=-0.0759&lat=51.5081`  
**Result:** NO - Protected historic site, no-fly zone active 0-2000ft.

---

## Data Freshness

All sample data includes:
- `last_updated` timestamps
- `confidence_level` (primary-authority for CAA/NATS)
- `data_source_info` with authority details
- Temporal filtering (expired zones excluded by default)

Use `includeExpired=true` parameter to see historical/future restrictions.

---

## Cleanup

To remove all sample data:
```sql
docker exec dronego-postgres psql -U dronego -d dronego -c "
  DELETE FROM restriction_zones;
  DELETE FROM airspace_classifications;
  DELETE FROM toal_sites;
  DELETE FROM data_sources WHERE authority_name IN ('CAA', 'NATS', 'DfT');
"
```

To reload sample data:
```bash
Get-Content backend\sample-data.sql | docker exec -i dronego-postgres psql -U dronego -d dronego
```
