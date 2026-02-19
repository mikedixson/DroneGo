# DroneGo Frontend

> Progressive Web App for drone flight zone mapping with heritage site advisory layers

## Component Structure

**Tech Stack:**
- **Build Tool**: Vite 5.0
- **Mapping**: Leaflet 1.9
- **Spatial Operations**: @turf/turf 6.5
- **Testing**: Vitest (unit), Playwright (e2e)
- **PWA**: Service Worker with offline support

**Project Structure:**
```
src/
├── components/      # React/UI components
│   ├── Map.tsx               # Main map with Leaflet + custom panes
│   ├── LayerControls.tsx    # Toggle airspace/property layers
│   ├── RestrictionStatusIndicator.tsx  # Tri-state flight status
│   ├── PropertyAdvisoryPopup.tsx       # Heritage site policy display
│   └── SearchLocation.tsx    # Location search interface
│
├── services/        # API clients and business logic
│   ├── api-client.ts         # Base HTTP client
│   ├── location-api.ts       # Location check endpoint
│   ├── zones-api.ts          # Zones query endpoint
│   └── property-api.ts       # Property restrictions endpoint
│
├── types/           # TypeScript interfaces
│   ├── location.ts           # LocationCheck tri-state types
│   ├── zones.ts              # RestrictionZone types
│   └── property.ts           # PropertyRestriction types
│
├── pages/           # Application pages/views
├── lib/             # Utility functions
└── main.tsx         # Application entry point

tests/
├── unit/            # Component and service unit tests
└── e2e/             # Playwright end-to-end tests

public/
├── sw.js            # Service Worker for offline caching
└── manifest.json    # PWA manifest
```

## Development Setup

### Prerequisites
- Node.js 20.0+ and npm 10.0+
- Backend API running on `localhost:3000`

### Initial Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

   App will be available at `http://localhost:5173`

3. **Build for production:**
   ```bash
   npm run build
   ```

   Output: `dist/` directory ready for deployment

4. **Preview production build:**
   ```bash
   npm run preview
   ```

## Testing Strategy

### Unit Tests (Vitest)

**Run all unit tests:**
```bash
npm run test
```

**Run with coverage:**
```bash
npm run test:coverage
```

**Watch mode:**
```bash
npm run test:watch
```

**Test patterns:**
- Component rendering and props
- Service API call mocking
- Utility function logic
- Type validation

**Example test file:**
```typescript
// tests/unit/components/Map.test.ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Map } from '../../../src/components/Map';

describe('Map Component', () => {
  it('should render map container', () => {
    render(<Map />);
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('should create custom panes with correct z-index', () => {
    const { container } = render(<Map />);
    const propertyPane = container.querySelector('.propertyRestrictionsPane');
    const airspacePpane = container.querySelector('.airspaceRestrictionsPane');
    
    expect(propertyPane).toHaveStyle({ zIndex: 410 });
    expect(airspacePane).toHaveStyle({ zIndex: 420 });
  });
});
```

### E2E Tests (Playwright)

**Run all e2e tests:**
```bash
npm run test:e2e
```

**Run in UI mode:**
```bash
npm run test:e2e:ui
```

**Test scenarios:**
- User story 1: Current location check (Stonehenge)
- User story 2: Search and TOAL sites (London Eye)
- User story 3: Restriction detail panels
- User story 4: Offline mode functionality

## Map Architecture

### Custom Leaflet Panes (Z-Index Layering)

Per research.md decision, airspace restrictions render above property restrictions:

```typescript
// Create custom panes for z-index control
const map = L.map('map');

map.createPane('propertyRestrictionsPane');
map.getPane('propertyRestrictionsPane').style.zIndex = 410;

map.createPane('airspaceRestrictionsPane');
map.getPane('airspaceRestrictionsPane').style.zIndex = 420;

// Assign layers to panes
const propertyLayer = L.geoJSON(propertyData, {
  pane: 'propertyRestrictionsPane',
  style: { color: '#FFA500', fillOpacity: 0.3 }
});

const airspaceLayer = L.geoJSON(airspaceData, {
  pane: 'airspaceRestrictionsPane',
  style: { color: '#FF0000', fillOpacity: 0.5 }
});
```

### Tri-State Flight Status Display

```typescript
interface LocationCheck {
  flight_status: 'permitted' | 'prohibited' | 'check-property-restrictions';
  airspace_clear: boolean;
  property_advisory: boolean;
  zones: RestrictionZone[];
  property_restrictions?: PropertyRestriction[];
  message: string;
}

// Component rendering
<RestrictionStatusIndicator status={locationCheck.flight_status} />

// CSS classes:
// .status-permitted → green
// .status-prohibited → red  
// .status-check-property → amber with "Check Property Policy" message
```

### Layer Toggle Controls

```typescript
<LayerControls>
  <input type="checkbox" checked={showAirspace} onChange={toggleAirspace} />
  <label>Airspace Restrictions (Legal)</label>
  
  <input type="checkbox" checked={showProperty} onChange={toggleProperty} />
  <label>Property Restrictions (Advisory)</label>
</LayerControls>
```

## API Integration

### Location Check (Tri-State)

```typescript
import { locationApi } from './services/location-api';

const checkLocation = async (lat: number, lng: number) => {
  const result = await locationApi.checkLocation(lat, lng);
  
  switch (result.flight_status) {
    case 'permitted':
      // Green indicator - safe to fly
      break;
    case 'prohibited':
      // Red indicator - airspace restriction
      break;
    case 'check-property-restrictions':
      // Amber indicator - show property policies
      showPropertyAdvisoryPopup(result.property_restrictions);
      break;
  }
};
```

### Zones Query (Bounding Box)

```typescript
import { zonesApi } from './services/zones-api';

const loadZones = async (bounds: L.LatLngBounds) => {
  const zones = await zonesApi.getZones({
    minLng: bounds.getWest(),
    minLat: bounds.getSouth(),
    maxLng: bounds.getEast(),
    maxLat: bounds.getNorth()
  });
  
  renderZonesOnMap(zones);
};

// Trigger on map pan/zoom
map.on('moveend', () => {
  const bounds = map.getBounds();
  loadZones(bounds);
});
```

### Property Restrictions (Heritage Sites)

```typescript
import { propertyApi } from './services/property-api';

const loadPropertyRestrictions = async (bounds: L.LatLngBounds) => {
  const properties = await propertyApi.getRestrictions({
    minLng: bounds.getWest(),
    minLat: bounds.getSouth(),
    maxLng: bounds.getEast(),
    maxLat: bounds.getNorth()
  });
  
  renderPropertyLayersOnMap(properties);
};
```

## Offline Support (PWA)

### Service Worker Strategy

```javascript
// public/sw.js
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached response if available
      if (response) {
        return response;
      }
      
      // Fetch from network and cache
      return fetch(event.request).then((response) => {
        const cache = await caches.open('dronego-v1');
        cache.put(event.request, response.clone());
        return response;
      });
    })
  );
});
```

### Stale Data Warning

Display warning banner when cached data is >48 hours old (per FR-019):

```typescript
const lastSyncTime = await getLastSyncTime();
const hoursSinceSync = (Date.now() - lastSyncTime) / (1000 * 60 * 60);

if (hoursSinceSync > 48) {
  showStaleDataWarning({
    message: "Cached data is older than 48 hours. Verify independently before flight.",
    lastSync: lastSyncTime
  });
}
```

## Performance Optimization

- **Map pan/zoom**: Maintain ≥30fps, <100ms latency (FR-009)
- **Initial load**: Target <3 seconds on 4G (FR-025)
- **Search results**: Display within <2 seconds (FR-027)
- **Location check**: Complete within 5 seconds of app open (FR-026)

**Optimization techniques:**
- Debounce map move events (300ms)
- Virtual layer rendering (only visible features)
- Progressive zone loading (coarse → detailed)
- Service Worker caching for repeat visits

## Deployment

### Production Build

```bash
npm run build
```

Output in `dist/` includes:
- Minified JS/CSS bundles
- Service Worker (`sw.js`)
- PWA manifest (`manifest.json`)
- Cached assets for offline use

### Environment Variables

Create `.env.production`:
```bash
VITE_API_BASE_URL=https://api.dronego.com
VITE_MAP_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

### Deployment Targets

- **Static hosting**: Netlify, Vercel, GitHub Pages
- **CDN**: CloudFlare, AWS CloudFront
- **Container**: Docker with nginx serving `dist/`

## Constitution Compliance

Per `specs/001-flight-zone-map/constitution.md`:

- **§III TDD**: Write component tests FIRST → Test rendering/interaction → Implement
- **§IV Documentation**: Component props documented inline, README maintained
- **§V Security**: HTTPS-only enforced (NFR-004), input sanitization, CSP headers

## Troubleshooting

**Map not loading:**
```bash
# Check API backend is running
curl http://localhost:3000/health

# Check browser console for CORS errors
# Verify CORS_ORIGIN in backend/.env includes frontend origin
```

**Tests failing:**
```bash
# Clear Vite cache
rm -rf node_modules/.vite

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

**Service Worker not updating:**
```bash
# Clear browser cache
# In DevTools: Application → Service Workers → Unregister
# Hard reload: Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)
```

## Contributing

1. Create feature branch
2. Write unit tests for components/services (Constitution §III)
3. Implement feature
4. Run tests: `npm test`
5. Test e2e scenarios: `npm run test:e2e`
6. Build production: `npm run build`
7. Verify PWA functionality
8. Create pull request

## License

MIT
