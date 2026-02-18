import { getDbPool } from '../lib/db.js';
import type { Pool } from 'pg';

/**
 * Airspace Classification Service
 * 
 * Provides queries for ICAO airspace class boundaries (Class A-G) per FR-006.
 * Used to display airspace classifications on the map to inform pilots of
 * airspace type and associated UAS (drone) rules.
 * 
 * UK airspace classes relevant to drones:
 * - Class A: Controlled airspace, IFR only, generally above FL195 (19,500 ft)
 * - Class C: Controlled airspace, IFR/VFR, requires ATC clearance
 * - Class D: Controlled airspace, IFR/VFR, requires ATC contact
 * - Class E: Controlled airspace below certain altitudes
 * - Class G: Uncontrolled airspace (most UK airspace below 2,000 ft AGL)
 * 
 * All spatial queries use WGS84 (EPSG:4326) coordinate system.
 */

/**
 * Airspace classification result
 */
export interface AirspaceResult {
  airspace_id: string;
  class_designation: string; // 'A', 'B', 'C', 'D', 'E', 'F', 'G'
  airspace_name: string;
  geometry: any; // GeoJSON MultiPolygon
  altitude_floor: number; // Feet AMSL
  altitude_ceiling: number; // Feet AMSL
  controlling_authority: string;
  rules_description: string;
  uas_authorization_required: boolean;
  authorization_process: string | null;
  last_updated: Date;
}

export class AirspaceService {
  private pool: Pool;

  constructor() {
    this.pool = getDbPool();
  }

  /**
   * Find airspace classifications containing a specific point
   * 
   * Used to determine what airspace class a coordinate falls within.
   * Multiple airspaces may overlap (e.g., Class G below Class C).
   * 
   * @param lng Longitude (WGS84, -180 to 180)
   * @param lat Latitude (WGS84, -90 to 90)
   * @param altitude Optional altitude in feet AMSL for 3D filtering
   * @returns Array of airspace classifications containing the point
   * 
   * @throws Error if coordinates are invalid
   * @throws Error if database query fails
   */
  async findAirspaceAtPoint(
    lng: number,
    lat: number,
    altitude?: number
  ): Promise<AirspaceResult[]> {
    this.validateCoordinates(lng, lat);

    try {
      let query = `
        SELECT 
          airspace_id,
          class_designation,
          airspace_name,
          ST_AsGeoJSON(geometry)::json as geometry,
          altitude_floor,
          altitude_ceiling,
          controlling_authority,
          rules_description,
          uas_authorization_required,
          authorization_process,
          last_updated
        FROM airspace_classifications
        WHERE ST_Contains(geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))
      `;

      const params: any[] = [lng, lat];

      // Optional altitude filtering for 3D queries
      if (altitude !== undefined) {
        query += ` AND altitude_floor <= $3 AND altitude_ceiling >= $3`;
        params.push(altitude);
      }

      // Order by altitude (lowest floor first) then by class restrictiveness
      query += `
        ORDER BY 
          altitude_floor ASC,
          CASE class_designation
            WHEN 'A' THEN 1
            WHEN 'B' THEN 2
            WHEN 'C' THEN 3
            WHEN 'D' THEN 4
            WHEN 'E' THEN 5
            WHEN 'F' THEN 6
            WHEN 'G' THEN 7
            ELSE 8
          END ASC
      `;

      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(
        `Failed to find airspace at point (${lng}, ${lat}): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Find airspace classifications within bounding box
   * 
   * Used to retrieve all airspace boundaries visible in the current map viewport.
   * Supports optional altitude filtering for 3D visualization.
   * 
   * @param minLng Minimum longitude (WGS84)
   * @param minLat Minimum latitude (WGS84)
   * @param maxLng Maximum longitude (WGS84)
   * @param maxLat Maximum latitude (WGS84)
   * @param altitudeFloor Optional minimum altitude filter in feet AMSL
   * @param altitudeCeiling Optional maximum altitude filter in feet AMSL
   * @returns Array of airspace classifications intersecting the bounding box
   * 
   * @throws Error if bounds are invalid
   * @throws Error if database query fails
   */
  async findAirspaceInBounds(
    minLng: number,
    minLat: number,
    maxLng: number,
    maxLat: number,
    altitudeFloor?: number,
    altitudeCeiling?: number
  ): Promise<AirspaceResult[]> {
    this.validateBounds(minLng, minLat, maxLng, maxLat);

    try {
      let query = `
        SELECT 
          airspace_id,
          class_designation,
          airspace_name,
          ST_AsGeoJSON(geometry)::json as geometry,
          altitude_floor,
          altitude_ceiling,
          controlling_authority,
          rules_description,
          uas_authorization_required,
          authorization_process,
          last_updated
        FROM airspace_classifications
        WHERE ST_Intersects(
          geometry,
          ST_MakeEnvelope($1, $2, $3, $4, 4326)
        )
      `;

      const params: any[] = [minLng, minLat, maxLng, maxLat];

      // Optional altitude range filtering
      if (altitudeFloor !== undefined) {
        query += ` AND altitude_ceiling >= $${params.length + 1}`;
        params.push(altitudeFloor);
      }
      if (altitudeCeiling !== undefined) {
        query += ` AND altitude_floor <= $${params.length + 1}`;
        params.push(altitudeCeiling);
      }

      // Order by altitude and class restrictiveness
      query += `
        ORDER BY 
          altitude_floor ASC,
          CASE class_designation
            WHEN 'A' THEN 1
            WHEN 'B' THEN 2
            WHEN 'C' THEN 3
            WHEN 'D' THEN 4
            WHEN 'E' THEN 5
            WHEN 'F' THEN 6
            WHEN 'G' THEN 7
            ELSE 8
          END ASC
      `;

      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(
        `Failed to find airspace in bounds: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Find airspace classification by ID
   * 
   * @param airspaceId UUID of the airspace classification
   * @returns Airspace classification or null if not found
   * 
   * @throws Error if database query fails
   */
  async findAirspaceById(airspaceId: string): Promise<AirspaceResult | null> {
    try {
      const result = await this.pool.query(
        `SELECT 
          airspace_id,
          class_designation,
          airspace_name,
          ST_AsGeoJSON(geometry)::json as geometry,
          altitude_floor,
          altitude_ceiling,
          controlling_authority,
          rules_description,
          uas_authorization_required,
          authorization_process,
          last_updated
        FROM airspace_classifications
        WHERE airspace_id = $1`,
        [airspaceId]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      throw new Error(
        `Failed to find airspace by ID ${airspaceId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get airspace classifications by class designation (A-G)
   * 
   * Useful for filtering map display to show only specific airspace classes.
   * 
   * @param classDesignations Array of class letters (e.g., ['C', 'D', 'G'])
   * @param bounds Optional bounding box to limit results
   * @returns Array of airspace classifications matching the class designations
   * 
   * @throws Error if database query fails
   */
  async findAirspaceByClass(
    classDesignations: string[],
    bounds?: { minLng: number; minLat: number; maxLng: number; maxLat: number }
  ): Promise<AirspaceResult[]> {
    try {
      let query = `
        SELECT 
          airspace_id,
          class_designation,
          airspace_name,
          ST_AsGeoJSON(geometry)::json as geometry,
          altitude_floor,
          altitude_ceiling,
          controlling_authority,
          rules_description,
          uas_authorization_required,
          authorization_process,
          last_updated
        FROM airspace_classifications
        WHERE class_designation = ANY($1)
      `;

      const params: any[] = [classDesignations];

      if (bounds) {
        this.validateBounds(bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat);
        query += ` AND ST_Intersects(geometry, ST_MakeEnvelope($2, $3, $4, $5, 4326))`;
        params.push(bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat);
      }

      query += `
        ORDER BY 
          altitude_floor ASC,
          CASE class_designation
            WHEN 'A' THEN 1
            WHEN 'B' THEN 2
            WHEN 'C' THEN 3
            WHEN 'D' THEN 4
            WHEN 'E' THEN 5
            WHEN 'F' THEN 6
            WHEN 'G' THEN 7
            ELSE 8
          END ASC
      `;

      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(
        `Failed to find airspace by class: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Validate WGS84 coordinates
   * 
   * @param lng Longitude (-180 to 180)
   * @param lat Latitude (-90 to 90)
   * @throws Error if coordinates are out of range
   */
  private validateCoordinates(lng: number, lat: number): void {
    if (lng < -180 || lng > 180) {
      throw new Error(
        `Invalid longitude: ${lng}. Must be between -180 and 180 degrees.`
      );
    }
    if (lat < -90 || lat > 90) {
      throw new Error(
        `Invalid latitude: ${lat}. Must be between -90 and 90 degrees.`
      );
    }
  }

  /**
   * Validate bounding box coordinates
   * 
   * @param minLng Minimum longitude
   * @param minLat Minimum latitude
   * @param maxLng Maximum longitude
   * @param maxLat Maximum latitude
   * @throws Error if bounds are invalid
   */
  private validateBounds(
    minLng: number,
    minLat: number,
    maxLng: number,
    maxLat: number
  ): void {
    this.validateCoordinates(minLng, minLat);
    this.validateCoordinates(maxLng, maxLat);

    if (minLng >= maxLng) {
      throw new Error(
        `Invalid bounding box: minLng (${minLng}) must be less than maxLng (${maxLng})`
      );
    }
    if (minLat >= maxLat) {
      throw new Error(
        `Invalid bounding box: minLat (${minLat}) must be less than maxLat (${maxLat})`
      );
    }
  }
}
