import { GeospatialService, type ZoneResult, type ToalSiteResult } from './geospatial-service.js';
import { Location } from '../models/Location.js';
import { PropertyService } from './property-service.js';

/**
 * Location Check Service (User Story 1 - Tri-State Integration)
 * 
 * Determines whether a pilot can fly at a given location by checking:
 * 1. Airspace restrictions (restriction zones with priority hierarchy)
 * 2. Property restrictions (heritage sites, private properties)
 * 3. TOAL site proximity information
 * 
 * SAFETY CRITICAL: This service determines flight legality. Incorrect
 * status determination could lead to illegal flights in restricted
 * airspace or unauthorized flights over heritage sites, potentially
 * causing safety incidents, legal consequences, or property violations.
 * 
 * Tri-State Logic (User Story 1):
 * - State 1: Airspace restricted → 'prohibited' (property ignored)
 * - State 2: Airspace clear + property restricted → 'check-property-restrictions'
 * - State 3: Both clear → 'permitted'
 * 
 * Uses Location.determineStatus for zone priority hierarchy:
 * no-fly > airport-frz > military > controlled > danger > temporary
 * 
 * Per Constitution Section I:
 * - All spatial queries must complete within 5 seconds (FR-026)
 * - Must handle temporal filtering (expired zones excluded)
 * - Must validate input coordinates
 * - Property restrictions must be accurately detected (safety-critical)
 * 
 * @see Location.determineStatus for zone priority logic
 * @see GeospatialService for spatial queries
 * @see PropertyService for heritage site queries
 */

/**
 * Property advisory information (User Story 1)
 */
export interface PropertyAdvisory {
  property_name: string;
  organization: string;
  policy_summary: string; // Truncated to 200 chars
  contact: string;
}

/**
 * Result of a location check query (User Story 1 - Tri-State)
 */
export interface LocationCheckResult {
  /**
   * Tri-state flight status (User Story 1)
   * - 'prohibited': Airspace restricted, flight not allowed
   * - 'check-property-restrictions': Airspace clear but property restrictions apply
   * - 'permitted': Both airspace and property clear
   */
  flight_status: 'prohibited' | 'check-property-restrictions' | 'permitted';

  /**
   * Is airspace clear of restrictions?
   * true = no airspace zones, false = airspace restricted
   */
  airspace_clear: boolean;

  /**
   * Are there property restrictions at this location?
   * true = property restrictions exist, false = no property restrictions
   */
  property_advisory: boolean;

  /**
   * All restriction zones containing this location
   * Ordered by priority (highest priority first)
   */
  zones: ZoneResult[];

  /**
   * Property restrictions at this location (User Story 1)
   * Empty array if airspace restricted (State 1) or no properties (State 3)
   * Populated if State 2 (check-property-restrictions)
   */
  property_restrictions: PropertyAdvisory[];

  /**
   * Nearest TOAL (Take-Off And Landing) site
   * null if no TOAL sites in database
   */
  nearest_toal: ToalSiteResult | null;

  /**
   * Human-readable message describing flight status
   */
  message?: string;

  // DEPRECATED: Legacy fields for backward compatibility
  // These will be removed in future versions
  /**
   * @deprecated Use flight_status instead
   */
  restriction_status?: 'no-fly' | 'controlled' | 'permitted';

  /**
   * @deprecated Use flight_status === 'permitted' instead
   */
  can_fly?: boolean;

  /**
   * @deprecated Use property_restrictions.length > 0 instead
   */
  authorization_required?: boolean;
}

export class LocationService {
  private geospatialService: GeospatialService;
  private propertyService: PropertyService;

  constructor() {
    this.geospatialService = new GeospatialService();
    this.propertyService = new PropertyService();
  }

  /**
   * Check if a location is safe and legal for drone flight (User Story 1 - Tri-State)
   * 
   * Implements tri-state logic:
   * 1. Check airspace restrictions (zones)
   * 2. If airspace clear, check property restrictions (heritage sites)
   * 3. Return appropriate status and advisories
   * 
   * @param lng Longitude in decimal degrees (WGS84, -180 to 180)
   * @param lat Latitude in decimal degrees (WGS84, -90 to 90)
   * @returns Location check result with tri-state flight status
   * 
   * @throws Error if coordinates are invalid
   * @throws Error if database query fails
   * 
   * @example
   * ```typescript
   * const service = new LocationService();
   * const result = await service.checkLocation(-0.1278, 51.5074);
   * 
   * if (result.flight_status === 'permitted') {
   *   console.log('Flight permitted at this location');
   * } else if (result.flight_status === 'check-property-restrictions') {
   *   console.log('Check property policies:', result.property_restrictions);
   * } else {
   *   console.log('Airspace restricted - flight prohibited');
   * }
   * ```
   */
  async checkLocation(lng: number, lat: number): Promise<LocationCheckResult> {
    try {
      // Validate coordinates
      this.geospatialService.validateCoordinates(lng, lat);

      // Step 1: Query airspace zones (GeospatialService handles temporal filtering)
      const zones = await this.geospatialService.findZonesContainingPoint(lng, lat);

      // Step 2: Query nearest TOAL site
      const nearestToal = await this.geospatialService.findNearestToalSite(lng, lat);

      // Step 3: Check if airspace is restricted
      const airspaceRestricted = zones.length > 0;

      // Step 4: Query property restrictions (ALWAYS query for UI display)
      // Note: Flight decision ignores properties in State 1, but we still
      // return them so the UI can show ALL layers affecting the location
      const properties = await this.propertyService.checkPropertyRestrictions(lng, lat);

      const propertyRestricted = properties.length > 0;

      // Step 5: Tri-State Logic (User Story 1)
      let flight_status: 'prohibited' | 'check-property-restrictions' | 'permitted';
      let property_restrictions: PropertyAdvisory[] = [];
      let message: string;

      if (airspaceRestricted) {
        // State 1: Airspace Restricted → Prohibited
        flight_status = 'prohibited';
        message = 'Flight prohibited due to airspace restrictions.';
        // Still populate property_restrictions for UI display (even though flight decision ignores them)
        property_restrictions = this.propertyService.formatPropertyAdvisories(properties);
      } else if (propertyRestricted) {
        // State 2: Airspace Clear + Property Restricted → Check Property Restrictions
        flight_status = 'check-property-restrictions';
        message = 'Airspace clear, but property restrictions may apply. Check property policies below.';
        
        // Format property advisories (truncate policy to 200 chars)
        property_restrictions = this.propertyService.formatPropertyAdvisories(properties);
      } else {
        // State 3: Both Clear → Permitted
        flight_status = 'permitted';
        message = 'Flight permitted. No airspace or property restrictions detected.';
        property_restrictions = [];
      }

      // Step 6: Populate legacy fields for backward compatibility
      let restrictionStatus: 'no-fly' | 'controlled' | 'permitted';
      let authorizationRequired = false;

      if (airspaceRestricted && zones.length > 0) {
        // Use Location.determineStatus to apply zone priority hierarchy
        const status = Location.determineStatus(
          { lng, lat },
          zones.map((z) => ({ zone_type: z.zone_type }))
        );

        // Map Location model status to legacy API status
        if (status === 'prohibited') {
          restrictionStatus = 'no-fly';
        } else if (status === 'authorization-required') {
          restrictionStatus = 'controlled';
          authorizationRequired = true;
        } else {
          restrictionStatus = 'permitted';
        }
      } else {
        restrictionStatus = 'permitted';
      }

      const canFly = flight_status === 'permitted';

      return {
        // User Story 1 tri-state fields
        flight_status,
        airspace_clear: !airspaceRestricted,
        property_advisory: propertyRestricted,
        zones,
        property_restrictions,
        nearest_toal: nearestToal,
        message,

        // Legacy fields for backward compatibility
        restriction_status: restrictionStatus,
        can_fly: canFly,
        authorization_required: authorizationRequired,
      };
    } catch (error) {
      if (error instanceof Error && error.message.match(/longitude|latitude/i)) {
        // Re-throw validation errors
        throw error;
      }
      throw new Error(
        `Failed to check location (${lng}, ${lat}): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
