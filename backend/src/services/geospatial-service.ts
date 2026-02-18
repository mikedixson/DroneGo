import { getDbPool } from '../lib/db.js';
import type { Pool } from 'pg';

/**
 * Geospatial Service
 * 
 * SAFETY-CRITICAL: 100% test coverage required per Constitution Section I
 * 
 * Provides spatial query operations using PostGIS for drone flight restriction
 * checking. Incorrect spatial queries could lead to illegal flights in controlled
 * airspace or near airports, posing risks to people, property, and airspace.
 * 
 * All methods use WGS84 (EPSG:4326) coordinate system.
 * 
 * Performance requirement: <100ms per query per Constitution
 */

export interface ZoneResult {
  zone_id: string;
  zone_type: string;
  restriction_name: string;
  geometry: any; // GeoJSON
  authority_source: string;
  altitude_floor: number | null;
  altitude_ceiling: number | null;
  effective_start: Date | null;
  effective_end: Date | null;
  description: string;
  authorization_possible: boolean;
  confidence_level: string;
  last_updated: Date;
}

export interface ToalSiteResult {
  site_id: string;
  site_name: string;
  access_type: string;
  verified: boolean;
  data_source: string;
  distance_meters: number;
}

export class GeospatialService {
  private pool: Pool;

  constructor() {
    this.pool = getDbPool();
  }

  /**
   * Find all restriction zones containing a specific point
   * 
   * Uses PostGIS ST_Contains for point-in-polygon queries with spatial index (GIST).
   * 
   * @param lng Longitude (WGS84, -180 to 180)
   * @param lat Latitude (WGS84, -90 to 90)
   * @returns Array of restriction zones containing the point
   * @throws Error if coordinates are invalid
   */
  async findZonesContainingPoint(lng: number, lat: number): Promise<ZoneResult[]> {
    this.validateCoordinates(lng, lat);

    try {
      const result = await this.pool.query(
        `SELECT 
          zone_id,
          zone_type,
          restriction_name,
          ST_AsGeoJSON(geometry)::json as geometry,
          authority_source,
          altitude_floor,
          altitude_ceiling,
          effective_start,
          effective_end,
          description,
          authorization_possible,
          confidence_level,
          last_updated
        FROM restriction_zones
        WHERE ST_Contains(geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))
          AND (effective_end IS NULL OR effective_end > NOW())
          AND (effective_start IS NULL OR effective_start <= NOW())
        ORDER BY 
          CASE zone_type
            WHEN 'no-fly' THEN 1
            WHEN 'airport-frz' THEN 2
            WHEN 'military-zone' THEN 3
            WHEN 'controlled-airspace' THEN 4
            WHEN 'danger-area' THEN 5
            WHEN 'temporary-restriction' THEN 6
          END,
          altitude_floor ASC NULLS FIRST`,
        [lng, lat]
      );

      return result.rows.map(this.mapZoneRow);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to query zones containing point: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Find all restriction zones within a bounding box
   * 
   * Uses PostGIS ST_Intersects with ST_MakeEnvelope for efficient spatial queries.
   * Returns zones that intersect the bounding box (fully inside or partially overlapping).
   * 
   * @param minLng Minimum longitude (west)
   * @param minLat Minimum latitude (south)
   * @param maxLng Maximum longitude (east)
   * @param maxLat Maximum latitude (north)
   * @returns Array of restriction zones within bounds
   * @throws Error if bounds are invalid
   */
  async findZonesWithinBounds(
    minLng: number,
    minLat: number,
    maxLng: number,
    maxLat: number
  ): Promise<ZoneResult[]> {
    this.validateBounds(minLng, minLat, maxLng, maxLat);

    try {
      const result = await this.pool.query(
        `SELECT 
          zone_id,
          zone_type,
          restriction_name,
          ST_AsGeoJSON(geometry)::json as geometry,
          authority_source,
          altitude_floor,
          altitude_ceiling,
          effective_start,
          effective_end,
          description,
          authorization_possible,
          confidence_level,
          last_updated
        FROM restriction_zones
        WHERE ST_Intersects(
          geometry,
          ST_MakeEnvelope($1, $2, $3, $4, 4326)
        )
          AND (effective_end IS NULL OR effective_end > NOW())
          AND (effective_start IS NULL OR effective_start <= NOW())
        ORDER BY zone_type, restriction_name`,
        [minLng, minLat, maxLng, maxLat]
      );

      return result.rows.map(this.mapZoneRow);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to query zones within bounds: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Find nearest TOAL site to coordinates
   * 
   * Uses PostGIS ST_Distance for distance calculation on spherical Earth model.
   * Returns distance in meters.
   * 
   * @param lng Longitude (WGS84)
   * @param lat Latitude (WGS84)
   * @returns Nearest TOAL site with distance, or null if no sites exist
   * @throws Error if coordinates are invalid
   */
  async findNearestToalSite(
    lng: number,
    lat: number
  ): Promise<ToalSiteResult | null> {
    this.validateCoordinates(lng, lat);

    try {
      const result = await this.pool.query(
        `SELECT 
          site_id,
          site_name,
          access_type,
          verified,
          data_source,
          ST_Distance(
            geometry::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          ) as distance_meters
        FROM toal_sites
        ORDER BY geometry <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
        LIMIT 1`,
        [lng, lat]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return {
        site_id: result.rows[0].site_id,
        site_name: result.rows[0].site_name,
        access_type: result.rows[0].access_type,
        verified: result.rows[0].verified,
        data_source: result.rows[0].data_source,
        distance_meters: parseFloat(result.rows[0].distance_meters),
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to find nearest TOAL site: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Validate coordinates are within valid WGS84 ranges
   * 
   * @param lng Longitude (-180 to 180)
   * @param lat Latitude (-90 to 90)
   * @throws Error if coordinates are out of range
   */
  public validateCoordinates(lng: number, lat: number): void {
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

  /**
   * Map database row to ZoneResult
   * 
   * @param row Database row
   * @returns Mapped ZoneResult
   */
  private mapZoneRow(row: any): ZoneResult {
    return {
      zone_id: row.zone_id,
      zone_type: row.zone_type,
      restriction_name: row.restriction_name,
      geometry: row.geometry,
      authority_source: row.authority_source,
      altitude_floor: row.altitude_floor,
      altitude_ceiling: row.altitude_ceiling,
      effective_start: row.effective_start ? new Date(row.effective_start) : null,
      effective_end: row.effective_end ? new Date(row.effective_end) : null,
      description: row.description,
      authorization_possible: row.authorization_possible,
      confidence_level: row.confidence_level,
      last_updated: new Date(row.last_updated),
    };
  }
}
