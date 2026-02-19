# Feature Specification: Drone Flight Zone Map

**Feature Branch**: `001-flight-zone-map`  
**Created**: 2026-02-17  
**Status**: Draft  
**Input**: User description: "Build a map pwa app, similar to https://thedronemap.com/ and https://dronemap.uk/map with clear up to date information about all flying restrictions. The aim of this app is to make it more obviously where *is* suitable for flying and TOAL(Take Off and Landing) with a high confidence level in the information."

## Clarifications

### Session 2026-02-17

- Q: How should user location data be handled for security and privacy compliance? → A: Never store user location data - process ephemerally in session only
- Q: What units and reference datum should be used for altitude restrictions? → A: Feet above mean sea level (AMSL) - UK/ICAO aviation standard
- Q: What rate limiting strategy should be implemented for the API? → A: 100 requests per 15 minutes per IP address with 429 error response
- Q: How should offline cached data older than 48 hours be handled? → A: Display stale data with prominent warning banner and "Verify independently" disclaimer
- Q: What is the authoritative data source for TOAL sites? → A: Community-submitted sites with manual verification and confidence ratings

### Session 2026-02-18

- Q: What types of restrictions should the app display? → A: Both airspace AND land restrictions with clear visual distinction
- Q: How should heritage site drone policies be represented? → A: Advisory layer with site-specific policies shown on click
- Q: How often should heritage site data be refreshed? → A: Weekly updates
- Q: How should overlapping restrictions be visually prioritized? → A: Airspace legal restrictions always on top, property advisory beneath
- Q: How should the location check determine "flight_status" when airspace is clear but property has restrictions? → A: flight_status enum with tri-state (permitted/prohibited/check-property-restrictions)

### Session 2026-02-19

- Q: What drone classification system should be used for filtering restrictions by drone type? → A: CAA/EU drone class designation (C0, C1, C2, C3, Legacy) with weight auto-populated but user can override weight

- Q: Should drone settings filtering hide non-applicable restrictions or show all with highlighting? → A: Show all restrictions but visually highlight/emphasize those applicable to user's drone

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Check Current Location for Flight Suitability (Priority: P1)

As a drone pilot standing at a location, I want to immediately see if I can legally fly my drone here, so I can make quick, informed decisions about whether to proceed with my flight.

The pilot opens the app on their mobile device, and the map immediately shows their current GPS location with a clear visual indicator of whether the area is suitable for flying. Restricted zones, no-fly zones, and suitable flying areas are clearly distinguished with intuitive color coding and visual boundaries.

**Why this priority**: This is the core value proposition - enabling pilots to quickly answer "Can I fly here right now?" This delivers immediate safety and compliance value and forms the minimum viable product.

**Independent Test**: Can be fully tested by opening the app at any location with GPS enabled and immediately seeing whether the current area permits drone flight. Success means the user can make a go/no-go decision within 5 seconds.

**Acceptance Scenarios**:

1. **Given** a pilot is at a location with GPS enabled, **When** they open the app, **Then** the map displays their current position and clearly indicates whether the area is suitable for flying with both airspace and property status
2. **Given** the pilot is in a no-fly zone, **When** they view their location, **Then** the area is marked with a clear red indicator and "No Flight Permitted" designation
3. **Given** the pilot is in an unrestricted area with no property restrictions, **When** they view their location, **Then** the area is marked with a green indicator and "Flight Permitted" designation
4. **Given** the pilot is in controlled airspace, **When** they view their location, **Then** the area shows a yellow/amber indicator with "Authorization Required" designation
5. **Given** the pilot is in unrestricted airspace but on property with drone restrictions (e.g., National Trust site), **When** they view their location, **Then** the area shows green airspace status with amber property advisory overlay and "Check Property Policy" designation

---

### User Story 2 - Search and Plan Future Flight Locations (Priority: P2)

As a drone pilot planning a shoot or operation, I want to search for addresses or specific locations before I travel there, so I can identify suitable TOAL sites and ensure I don't waste time traveling to restricted areas.

The pilot can enter an address, postcode, or place name into a search field, and the map navigates to that location, showing all restriction zones and designated TOAL sites in the area. They can explore the surrounding area to find optimal launch locations.

**Why this priority**: Planning ahead prevents wasted travel time and enables pilots to identify official TOAL sites. This is the natural second step after "checking where I am now" and significantly improves operational efficiency.

**Independent Test**: Can be tested by searching for any UK address and viewing the flight restrictions for that area. Success means identifying whether a planned location is suitable before traveling there.

**Acceptance Scenarios**:

1. **Given** the pilot wants to check a future location, **When** they enter an address or postcode in the search field, **Then** the map navigates to that location and displays restriction zones
2. **Given** the pilot is viewing a search result, **When** they look at the map, **Then** official TOAL sites within the viewable area are clearly marked with distinctive icons
3. **Given** the pilot is planning a flight, **When** they zoom and pan around the searched location, **Then** the map maintains clear visibility of all restriction boundaries and suitable areas
4. **Given** the pilot searches for a location, **When** the map loads, **Then** distance from the searched point to nearest TOAL site is displayed

---

### User Story 3 - Understand Restriction Details and Rules (Priority: P3)

As a drone pilot viewing restricted airspace, I want to see detailed information about why the area is restricted and what specific rules apply, so I can understand my legal obligations and determine if I can apply for authorization.

When the pilot taps or clicks on a restricted zone, a detail panel appears showing the restriction type, governing authority, altitude limits, effective dates, and whether authorization can be requested.

**Why this priority**: Understanding restriction details enables informed decision-making and compliance. While less critical than knowing IF an area is restricted, knowing WHY and WHAT RULES apply enables pilots to determine if they can obtain authorization or plan alternative approaches.

**Independent Test**: Can be tested by selecting any restricted zone on the map and viewing its detailed information. Success means the pilot understands the specific restriction rules and authority source.

**Acceptance Scenarios**:

1. **Given** the pilot sees a restricted zone, **When** they tap or click on the zone boundary, **Then** a detail panel displays the restriction type, authority source, and applicable rules
2. **Given** the pilot views restriction details, **When** they read the information, **Then** the panel shows altitude restrictions, effective time periods, and whether the restriction is permanent or temporary
3. **Given** the pilot views a controlled airspace zone, **When** they view the details, **Then** the information indicates whether authorization can be requested and provides guidance on the authorization process
4. **Given** the pilot views restriction details, **When** they check data quality, **Then** the panel displays the data source authority and last update timestamp

---

### User Story 4 - Access Map Offline in Remote Locations (Priority: P4)

As a drone pilot working in remote areas with poor connectivity, I want the app to work offline using cached map data, so I can check restrictions even when I don't have internet access.

After the pilot has loaded the app and viewed map areas while online, those areas are cached locally. When the pilot later opens the app in an area without internet connectivity, they can still view previously cached restriction data.

**Why this priority**: Offline access is valuable for pilots working in remote locations but requires the core map functionality to be built first. It's an enhancement to reliability rather than core functionality, but important for safety in field conditions.

**Independent Test**: Can be tested by loading map data for a region while online, then disabling internet connectivity and verifying that the cached region remains viewable with restriction data. Success means basic restriction checking works without connectivity.

**Acceptance Scenarios**:

1. **Given** the pilot has previously viewed a map area while online, **When** they open the app offline, **Then** the cached map area displays with restriction data visible
2. **Given** the pilot is offline, **When** they try to access uncached areas, **Then** the app clearly indicates which areas have cached data available and which require internet
3. **Given** the pilot is offline, **When** they view cached restriction data, **Then** the app indicates the age of the cached data and warns if it may be outdated
4. **Given** the pilot regains connectivity, **When** the app comes online, **Then** cached data is automatically refreshed with the latest restriction information

---

### Edge Cases

- **What happens when GPS location is unavailable?** The app should default to a map center (e.g., UK center) and prompt the user to enable location services or search for a location manually. A clear indicator shows that current position is unavailable.

- **How does the system handle temporary flight restrictions (NOTAMs)?** Temporary restrictions are displayed with distinctive styling (e.g., diagonal stripes or pulsing borders) and clearly labeled with effective date/time ranges. The detail view indicates "TEMPORARY" and shows start/end dates.

- **How are overlapping restrictions displayed?** When multiple restrictions overlap, the map uses layering hierarchy: (1) Legal airspace restrictions render on top with solid styling (RED prohibited > AMBER authorization required > GREEN permitted); (2) Property advisory restrictions render beneath with semi-transparent styling or border patterns; (3) When both types overlap, airspace status determines primary color while property restrictions show as secondary indicators. The detail panel lists airspace restrictions first, then property restrictions, with clear section headers distinguishing legal vs. advisory status.

- **What if restriction data is outdated or unavailable?** Each data source has a timestamp. If cached data is older than 48 hours, a prominent warning banner appears with "Data may be outdated. Verify independently before flight" messaging. Stale data remains visible to allow pilots in remote areas to make informed decisions. If no data is available for a region, the area is marked as "Unknown - Verify Independently" with guidance to check official sources.

- **How does the app handle international boundaries or coverage gaps?** The initial version focuses on UK coverage. Areas outside the coverage region are grayed out with "Data not available for this region" messaging. Future versions can expand coverage.

- **What happens when multiple TOAL sites exist in a small area?** Markers cluster when map zoom level < 12 (city-scale view) or when markers would render <50 pixels apart, showing a number badge indicating quantity. Zooming to level ≥13 reveals individual TOAL sites with distinct markers.

## Requirements *(mandatory)*

### Functional Requirements

**Display & Visualization:**

- **FR-001**: System MUST display an interactive map centered on the user's current GPS location when the app opens
- **FR-002**: System MUST display no-fly zones with clear red visual indicators and distinct boundary lines
- **FR-003**: System MUST display controlled airspace with amber/yellow indicators showing areas requiring authorization
- **FR-004**: System MUST display unrestricted areas suitable for flying with green visual indicators
- **FR-005**: System MUST display official TOAL (Take Off and Landing) sites with distinctive marker icons
- **FR-006**: System MUST show airspace classification boundaries (Class A-G airspace zones)
- **FR-007**: System MUST use intuitive color coding consistently throughout the map (red=prohibited, amber=authorization required, green=permitted)
- **FR-007A**: System MUST display property-based restrictions (heritage sites, National Trust, English Heritage) as advisory layers visually distinct from legal airspace restrictions
- **FR-007B**: System MUST render airspace legal restrictions with higher visual z-index priority than property advisory layers to ensure regulatory compliance information is always visible
- **FR-007C**: System MUST display heritage sites (National Trust, English Heritage, Historic England) as a toggleable layer with site boundaries and property-specific drone policies accessible via click/tap

**User Interaction:**

- **FR-008**: Users MUST be able to search for locations using address, postcode, place name, or coordinates
- **FR-009**: Users MUST be able to zoom in and out of the map with smooth performance (≥30fps interaction, <100ms latency)
- **FR-010**: Users MUST be able to pan the map in any direction
- **FR-011**: Users MUST be able to tap/click on restricted zones to view detailed information
- **FR-012**: System MUST display a detail panel showing restriction type, authority, rules, altitude limits, and effective dates when a zone is selected
- **FR-013**: System MUST show the distance from current location or search point to the nearest TOAL site
- **FR-013A**: Users MUST be able to filter TOAL sites by access_type (public, private, permit-required, club-only) on the map display
- **FR-013B**: System MUST display confidence indicators for TOAL sites showing verification status (verified, community-reported, unverified)
- **FR-028**: Users MUST be able to return to their current GPS location using a dedicated location button that re-centers the map and re-requests geolocation permissions if needed
- **FR-029**: Users MUST be able to independently toggle visibility of restriction zones and airspace classification layers to reduce visual clutter

**Drone Settings:**

- **FR-030**: Users MUST be able to access drone settings configuration from a dedicated settings menu or icon
- **FR-031**: Users MUST be able to select their drone class from CAA/EU options (C0, C1, C2, C3, Legacy) with class definitions and weight ranges displayed
- **FR-032**: System MUST auto-populate drone weight based on selected class (C0:<250g, C1:<900g, C2:<4kg, C3:<25kg) but allow manual override
- **FR-033**: Users MUST be able to set their maximum operational altitude in feet for their specific drone and authorization level
- **FR-034**: System MUST save drone profile settings to sessionStorage (persists during browser session, cleared on tab/window close)
- **FR-035**: System MUST display all restrictions on the map regardless of drone profile configuration to maintain full situational awareness
- **FR-036**: System MUST visually emphasize restrictions applicable to the user's configured drone (e.g., bold outline, badge indicator, or distinct highlight) while keeping non-applicable restrictions visible but de-emphasized

**Data Quality & Updates:**

- **FR-014**: System MUST integrate with NATS (National Air Traffic Services) official airspace data from digital datasets (https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/digital-datasets/)
- **FR-015**: System MUST display the data source authority and last update timestamp for all restriction zones
- **FR-016**: System MUST update airspace restriction data (NATS, CAA) at least once daily to maintain accuracy
- **FR-016A**: System MUST update heritage site and property restriction data at least once weekly (policies change less frequently than airspace)
- **FR-017**: System MUST include temporary flight restrictions (NOTAMs) with effective date/time ranges **[DEFERRED TO PHASE 8 - NOT IN MVP SCOPE]**
- **FR-018**: System MUST display a confidence indicator showing whether data comes from primary authority sources
- **FR-019**: System MUST display a prominent warning banner when cached data is older than 48 hours with "Verify independently before flight" disclaimer
- **FR-019A**: Stale cached data (>48 hours old) MUST remain accessible to users with clear visual warning indicators

**PWA Capabilities:**

- **FR-020**: Application MUST function as an installable Progressive Web App
- **FR-021**: Application MUST cache viewed map regions and restriction data for offline access
- **FR-022**: Application MUST work on mobile devices with responsive design adapting to screen sizes
- **FR-023**: Application MUST indicate online/offline status clearly to the user
- **FR-024**: Application MUST automatically refresh cached data when connectivity is restored

**Performance:**

- **FR-025**: Map MUST load and become interactive within 3 seconds on 4G mobile connection
- **FR-026**: System MUST determine and display current location restriction status within 5 seconds of app opening
- **FR-027**: Search results MUST appear within 2 seconds of query submission

### Non-Functional Requirements

**Security & Privacy:**

- **NFR-001**: System MUST NOT store user location coordinates on the backend server
- **NFR-002**: System MUST NOT persist user location history in client-side storage (localStorage, IndexedDB)
- **NFR-003**: User location data MUST be processed in-memory only during active session and discarded when session ends
- **NFR-004**: Location coordinates sent to backend for restriction checks MUST be transmitted over HTTPS only
- **NFR-005**: System MUST comply with GDPR data minimization principles by collecting only coordinates necessary for restriction evaluation

**Altitude Standards:**

- **NFR-006**: All altitude restrictions MUST be displayed in feet above mean sea level (AMSL) following UK CAA and ICAO standards
- **NFR-007**: System MUST use AMSL as the reference datum for all airspace floor and ceiling definitions
- **NFR-008**: Altitude values MUST match the units used in official CAA and NATS data sources without conversion

**Reliability & Scalability:**

- **NFR-009**: API MUST enforce rate limiting of 300 requests per 15-minute window per IP address (20 requests/minute sustained)
- **NFR-010**: System MUST respond with HTTP 429 (Too Many Requests) when rate limit is exceeded
- **NFR-011**: Rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset) MUST be included in API responses
- **NFR-012**: System SHOULD target 99% uptime during normal operating conditions (monitoring and HA infrastructure deferred to production operations outside MVP scope)

### Key Entities

- **Restriction Zone**: Represents a geographic area with flying limitations based on aviation law. Includes zone type (no-fly, controlled airspace, military zone, temporary restriction), boundary coordinates (polygon), authority source, effective dates/times, altitude restrictions (floor and ceiling heights in feet AMSL), description of restrictions, and whether authorization can be requested. This entity covers legal airspace restrictions only.

- **Property Restriction**: Represents landowner/property-based restrictions separate from airspace law. Includes property name, managing organization (National Trust, English Heritage, Historic England, etc.), boundary coordinates (polygon), property-specific drone policy text, contact information for permission requests, and policy effective date. These are advisory restrictions indicating property owner policies rather than legal aviation restrictions.

- **TOAL Site**: Represents an officially designated or suitable Take Off and Landing location. Includes site name, coordinates (point), access rules (public/private/permit required), available facilities, surface type, operating hours if applicable, verification status (verified/community-reported/unverified), and confidence rating.

- **Airspace Classification**: Represents controlled airspace types defined by aviation authorities. Includes class designation (A, B, C, D, E, F, G), boundary coordinates, altitude ranges, applicable rules for each class, and controlling authority.

- **Location**: Represents either the user's current position or a searched location. Includes coordinates (latitude/longitude), determined airspace restriction status using tri-state logic (flight_status: permitted = airspace clear, prohibited = airspace restricted, check-property-restrictions = airspace clear but property restrictions apply), property_restrictions array listing any property-based policies, nearest TOAL site reference with distance, and applicable airspace restrictions at that point.

- **Data Source**: Represents the authority providing restriction data. Includes authority name (e.g., NATS for airspace data, CAA for regulatory guidance), data type provided, last update timestamp, update frequency, and reliability/confidence level.

- **Drone Profile**: Represents user's drone configuration for filtering applicable restrictions. Includes drone_class (C0, C1, C2, C3, Legacy as per CAA/EU classification), weight_grams (auto-populated from class but user-overridable), max_altitude_feet (user's operational or authorization ceiling), and optional drone_name. Stored in client-side session storage only; cleared when browser session ends.

- **Temporary Restriction (NOTAM)**: Represents time-limited flying restrictions. Includes NOTAM identifier, issuing authority, affected area (polygon or radius), effective start date/time, expiration date/time, restriction reason, and altitude limits.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can determine if their current location is suitable for flying within 5 seconds of opening the app (from app launch to clear go/no-go indication)

- **SC-002**: Map displays restriction data from at least 2 authoritative sources (UK CAA and NATS as minimum)

- **SC-003**: Restriction data is updated at least once every 24 hours to ensure currency

- **SC-004**: 95% of users can successfully identify the nearest suitable TOAL site within 1 kilometer of any searched location

- **SC-005**: App functions offline after initial map data load, allowing users to view previously accessed restriction zones without internet connectivity

- **SC-006**: Users can view complete restriction details including authority source, effective dates, and altitude limits for any restricted zone in 2 taps/clicks

- **SC-007**: Map loads and becomes interactive within 3 seconds on mobile devices with 4G connection

- **SC-008**: App successfully installs as PWA on mobile devices and desktop browsers

- **SC-009**: Search functionality returns accurate results for 99% of valid UK postcodes and addresses

- **SC-010**: Color coding and visual indicators enable users to distinguish between permitted, prohibited, and authorization-required zones at a glance without reading text labels

## Assumptions

The following assumptions were made to create this specification with reasonable defaults:

- **Geographic Coverage**: Initial release focuses on United Kingdom airspace. Can be expanded to other countries in future iterations based on demand.

- **Data Sources**: Primary airspace data source is NATS (National Air Traffic Services) digital datasets (https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/digital-datasets/). CAA provides regulatory guidance (CAP722) but does not provide machine-readable airspace data. Property restriction data is sourced from National Trust Open Data (https://open-data-national-trust.hub.arcgis.com/), English Heritage / Historic England (https://historicengland.org.uk/listing/the-list/data-downloads, https://opendata-historicengland.hub.arcgis.com/), and other property owner organizations as available. Additional data sources can be integrated as needed.

- **TOAL Sites Data**: TOAL sites are sourced from community submissions with manual verification. Each site includes a confidence rating (verified, community-reported, unverified). No official UK TOAL registry currently exists; if official sources become available (e.g., CAA schemes, local authority registers), they will be integrated as authoritative sources.

- **Geocoding Provider**: UK address/postcode search will use Nominatim (OpenStreetMap) for zero-cost operation with fallback to manual coordinate entry. Alternative: OS Places API for improved UK coverage (requires API key).

- **Authorization Guidance Content**: Detail panel will display "Authorization may be requested from [Authority Name]. Contact: [phone/email from data source]. Refer to CAA CAP722 for UAS authorization procedures. Visit: https://www.caa.co.uk/drones" for controlled airspace zones where authorization_possible=true.

- **User Accounts**: No user account system is required for MVP. Users can access all map functions without registration. Account features (saving favorites, flight logs) can be added in future versions if needed.

- **Map Provider**: A standard map provider with good offline support will be selected during technical planning. The choice doesn't affect the user-facing requirements.

- **Authorization Process Integration**: The app will provide guidance on authorization requirements but will not initially integrate with authorization request workflows. Users will be directed to official channels for authorization requests.

- **Language**: Initial release supports English language only, suitable for UK market.

- **Commercial vs Recreational**: The app serves both commercial and recreational drone pilots with the same restriction information. Specific commercial operator requirements can be added later if needed.
