import { BaseModelAttributes } from './BaseModel.js';

/**
 * Location entity attributes
 * 
 * NOTE: Per GDPR requirements (NFR-001, NFR-002, NFR-003), Location entities are EPHEMERAL.
 * This model is used for in-memory operations and API request/response objects ONLY.
 * Location data MUST NOT be persisted to the database.
 */
export interface LocationAttributes extends BaseModelAttributes {
  location_id?: string;
  coordinates: { lng: number; lat: number };
  location_type: 'current-position' | 'search-result';
  restriction_status: 'permitted' | 'prohibited' | 'authorization-required' | 'unknown';
  applicable_zones?: string[]; // Array of zone_ids
  nearest_toal_site_id?: string | null;
  nearest_toal_distance?: number | null; // Distance in meters
  query_timestamp?: Date;
}

/**
 * Location Model (EPHEMERAL - GDPR Compliant)
 * 
 * Represents a user's current position or searched location for flight suitability checks.
 * 
 * **CRITICAL**: This model DOES NOT persist data to a database table.
 * All operations are in-memory only per GDPR data minimization (NFR-001/002/003/005).
 * 
 * Location data flows:
 * 1. Client sends coordinates → Backend processes → Returns restriction status
 * 2. Coordinates processed in-memory using geospatial queries
 * 3. Response sent to client (may be cached client-side with TTL)
 * 4. Server discards coordinates immediately after response
 */
export class Location {
  /**
   * Determine restriction status for coordinates
   * 
   * Business logic (from data-model.md and test requirements):
   * - If any zone_type = 'no-fly' | 'airport-frz' | 'temporary-restriction' contains point → 'prohibited'
   * - Else if any 'controlled-airspace' | 'military-zone' | 'danger-area' contains point → 'authorization-required'
   * - Else → 'permitted'
   * 
   * Zone priority hierarchy (most restrictive first):
   * no-fly > airport-frz > military > controlled > danger > temporary
   * 
   * @param coordinates - { lng, lat } in WGS84 decimal degrees
   * @param containingZones - Array of zone objects from geospatial query
   * @returns Restriction status
   */
  static determineStatus(
    _coordinates: { lng: number; lat: number },
    containingZones: Array<{ zone_type: string }>
  ): LocationAttributes['restriction_status'] {
    if (containingZones.length === 0) {
      return 'permitted';
    }

    // Check for prohibited zones (most restrictive)
    // These zone types do not allow flight at all
    const hasProhibited = containingZones.some(
      (zone) =>
        zone.zone_type === 'no-fly' ||
        zone.zone_type === 'airport-frz' ||
        zone.zone_type === 'temporary-restriction'
    );
    if (hasProhibited) {
      return 'prohibited';
    }

    // Check for controlled airspace, military zones, danger areas
    // These require authorization but may allow flight with permission
    const hasControlled = containingZones.some(
      (zone) =>
        zone.zone_type === 'controlled-airspace' ||
        zone.zone_type === 'military-zone' ||
        zone.zone_type === 'danger-area'
    );
    if (hasControlled) {
      return 'authorization-required';
    }

    // Default to permitted (no recognized restrictions)
    return 'permitted';
  }

  /**
   * Create an ephemeral Location object (not persisted)
   * 
   * @param data - Location attributes
   * @returns Location object for API response
   */
  static create(data: Partial<LocationAttributes>): LocationAttributes {
    return {
      location_id: data.location_id || `temp-${Date.now()}-${Math.random()}`,
      coordinates: data.coordinates!,
      location_type: data.location_type || 'current-position',
      restriction_status: data.restriction_status || 'unknown',
      applicable_zones: data.applicable_zones || [],
      nearest_toal_site_id: data.nearest_toal_site_id || null,
      nearest_toal_distance: data.nearest_toal_distance || null,
      query_timestamp: data.query_timestamp || new Date(),
    };
  }

  /**
   * Calculate distance between two points (Haversine formula)
   * 
   * @param coord1 - First coordinate { lng, lat }
   * @param coord2 - Second coordinate { lng, lat }
   * @returns Distance in meters
   */
  static calculateDistance(
    coord1: { lng: number; lat: number },
    coord2: { lng: number; lat: number }
  ): number {
    const R = 6371000; // Earth's radius in meters
    const φ1 = (coord1.lat * Math.PI) / 180;
    const φ2 = (coord2.lat * Math.PI) / 180;
    const Δφ = ((coord2.lat - coord1.lat) * Math.PI) / 180;
    const Δλ = ((coord2.lng - coord1.lng) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Validate UK coordinates (approximate bounds)
   * 
   * UK mainland rough bounds:
   * - Latitude: 49°N to 61°N
   * - Longitude: -8°W to 2°E
   * 
   * @param coordinates - { lng, lat } to validate
   * @returns True if coordinates are within UK bounds
   */
  static isWithinUKBounds(coordinates: { lng: number; lat: number }): boolean {
    return (
      coordinates.lat >= 49.0 &&
      coordinates.lat <= 61.0 &&
      coordinates.lng >= -8.0 &&
      coordinates.lng <= 2.0
    );
  }

  /**
   * Create cache key for coordinates (for in-memory caching only)
   * 
   * @param coordinates - { lng, lat }
   * @returns Cache key string (e.g., "51.5074_-0.1278")
   */
  static getCacheKey(coordinates: { lng: number; lat: number }): string {
    // Round to 4 decimal places (~11m precision)
    const lat = coordinates.lat.toFixed(4);
    const lng = coordinates.lng.toFixed(4);
    return `${lat}_${lng}`;
  }
}
