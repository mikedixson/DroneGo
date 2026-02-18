import { GeospatialService, type ZoneResult, type ToalSiteResult } from './geospatial-service.js';
import { Location } from '../models/Location.js';

/**
 * Location Check Service
 * 
 * Determines whether a pilot can fly at a given location by checking
 * restriction zones, applying zone priority hierarchy, and providing
 * TOAL site proximity information.
 * 
 * SAFETY CRITICAL: This service determines flight legality. Incorrect
 * status determination could lead to illegal flights in restricted
 * airspace, potentially causing safety incidents or legal consequences.
 * 
 * Uses Location.determineStatus for zone priority hierarchy:
 * no-fly > airport-frz > military > controlled > danger > temporary
 * 
 * Per Constitution Section I:
 * - All spatial queries must complete within 5 seconds (FR-026)
 * - Must handle temporal filtering (expired zones excluded)
 * - Must validate input coordinates
 * 
 * @see Location.determineStatus for zone priority logic
 * @see GeospatialService for spatial queries
 */

/**
 * Result of a location check query
 */
export interface LocationCheckResult {
  /**
   * Overall restriction status at this location
   * - 'no-fly': Flight prohibited
   * - 'controlled': Flight requires authorization
   * - 'permitted': Flight allowed without special authorization
   */
  restriction_status: 'no-fly' | 'controlled' | 'permitted';

  /**
   * Simple boolean: can the pilot fly here?
   * - false for 'no-fly' and 'controlled'
   * - true for 'permitted'
   */
  can_fly: boolean;

  /**
   * All restriction zones containing this location
   * Ordered by priority (highest priority first)
   */
  zones: ZoneResult[];

  /**
   * Nearest TOAL (Take-Off And Landing) site
   * null if no TOAL sites in database
   */
  nearest_toal: ToalSiteResult | null;

  /**
   * Does this location require authorization?
   * true for 'controlled' status, false otherwise
   */
  authorization_required: boolean;
}

export class LocationService {
  private geospatialService: GeospatialService;

  constructor() {
    this.geospatialService = new GeospatialService();
  }

  /**
   * Check if a location is safe and legal for drone flight
   * 
   * @param lng Longitude in decimal degrees (WGS84, -180 to 180)
   * @param lat Latitude in decimal degrees (WGS84, -90 to 90)
   * @returns Location check result with restriction status and zones
   * 
   * @throws Error if coordinates are invalid
   * @throws Error if database query fails
   * 
   * @example
   * ```typescript
   * const service = new LocationService();
   * const result = await service.checkLocation(-0.1278, 51.5074);
   * 
   * if (result.can_fly) {
   *   console.log('Flight permitted at this location');
   * } else if (result.authorization_required) {
   *   console.log('Authorization required to fly here');
   * } else {
   *   console.log('No-fly zone - flight prohibited');
   * }
   * ```
   */
  async checkLocation(lng: number, lat: number): Promise<LocationCheckResult> {
    try {
      // Validate coordinates
      this.geospatialService.validateCoordinates(lng, lat);

      // Query zones containing this point (GeospatialService handles temporal filtering)
      const zones = await this.geospatialService.findZonesContainingPoint(lng, lat);

      // Query nearest TOAL site
      const nearestToal = await this.geospatialService.findNearestToalSite(lng, lat);

      // Determine restriction status using Location.determineStatus
      // This applies the zone priority hierarchy (no-fly > airport-frz > military > controlled > danger > temporary)
      let restrictionStatus: 'no-fly' | 'controlled' | 'permitted';
      let authorizationRequired = false;

      if (zones.length === 0) {
        // No zones = permitted
        restrictionStatus = 'permitted';
      } else {
        // Use Location.determineStatus to apply hierarchy
        // Note: Location.determineStatus expects coordinates and zones
        const status = Location.determineStatus(
          { lng, lat },
          zones.map((z) => ({ zone_type: z.zone_type }))
        );

        // Map Location model status to API status
        // Location returns: 'prohibited' | 'authorization-required' | 'permitted'
        // API expects: 'no-fly' | 'controlled' | 'permitted'
        if (status === 'prohibited') {
          restrictionStatus = 'no-fly';
        } else if (status === 'authorization-required') {
          restrictionStatus = 'controlled';
          authorizationRequired = true;
        } else {
          restrictionStatus = 'permitted';
        }
      }

      const canFly = restrictionStatus === 'permitted';

      return {
        restriction_status: restrictionStatus,
        can_fly: canFly,
        zones,
        nearest_toal: nearestToal,
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
