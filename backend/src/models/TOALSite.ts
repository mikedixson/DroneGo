import { BaseModel, BaseModelAttributes } from './BaseModel.js';

/**
 * TOAL Site geometry type (GeoJSON Point)
 */
export interface PointGeometry {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

/**
 * TOAL Site facilities (stored as JSONB)
 */
export interface TOALFacilities {
  parking?: boolean;
  shelter?: boolean;
  power?: boolean;
  toilets?: boolean;
  [key: string]: boolean | undefined;
}

/**
 * TOAL Site entity attributes
 */
export interface TOALSiteAttributes extends BaseModelAttributes {
  site_id: string;
  site_name: string;
  geometry: PointGeometry;
  access_type: 'public' | 'private' | 'permit-required' | 'club-only';
  surface_type: 'grass' | 'concrete' | 'asphalt' | 'gravel' | 'mixed' | 'unknown' | null;
  facilities: TOALFacilities;
  operating_hours: string | null;
  restrictions: string | null;
  contact_info: string | null;
  verified: boolean;
  data_source: string;
  last_updated: Date;
  created_at: Date;
}

/**
 * TOAL Site Model
 * 
 * Represents Take Off and Landing sites for drones.
 * Uses PostGIS for spatial queries and distance calculations.
 */
export class TOALSite extends BaseModel<TOALSiteAttributes> {
  protected tableName = 'toal_sites';
  protected primaryKey = 'site_id';

  /**
   * Find TOAL sites by access type
   */
  async findByAccessType(
    accessType: TOALSiteAttributes['access_type']
  ): Promise<TOALSiteAttributes[]> {
    return this.findAll({ access_type: accessType });
  }

  /**
   * Find verified TOAL sites only
   */
  async findVerified(): Promise<TOALSiteAttributes[]> {
    return this.findAll({ verified: true });
  }

  /**
   * Find public TOAL sites (accessible to all drone pilots)
   */
  async findPublicSites(): Promise<TOALSiteAttributes[]> {
    return this.findAll({ access_type: 'public' });
  }

  /**
   * Find TOAL sites within bounding box
   * 
   * @param minLat - Minimum latitude
   * @param minLon - Minimum longitude
   * @param maxLat - Maximum latitude
   * @param maxLon - Maximum longitude
   * @returns Array of TOAL sites within the bounds
   */
  async findInBounds(
    minLat: number,
    minLon: number,
    maxLat: number,
    maxLon: number
  ): Promise<TOALSiteAttributes[]> {
    const query = `
      SELECT 
        site_id,
        site_name,
        ST_AsGeoJSON(geometry)::json as geometry,
        access_type,
        surface_type,
        facilities,
        operating_hours,
        restrictions,
        contact_info,
        verified,
        data_source,
        last_updated,
        created_at
      FROM ${this.tableName}
      WHERE ST_Contains(
        ST_MakeEnvelope($1, $2, $3, $4, 4326),
        geometry
      )
      ORDER BY site_name ASC;
    `;

    const result = await this.pool.query(query, [
      minLon,
      minLat,
      maxLon,
      maxLat
    ]);

    return result.rows;
  }

  /**
   * Find nearest TOAL site to a given point
   * 
   * @param lat - Latitude of the point
   * @param lon - Longitude of the point
   * @param limit - Maximum number of results (default: 1)
   * @returns Array of nearest TOAL sites with distance in meters
   */
  async findNearest(
    lat: number,
    lon: number,
    limit: number = 1
  ): Promise<Array<TOALSiteAttributes & { distance_meters: number }>> {
    const query = `
      SELECT 
        site_id,
        site_name,
        ST_AsGeoJSON(geometry)::json as geometry,
        access_type,
        surface_type,
        facilities,
        operating_hours,
        restrictions,
        contact_info,
        verified,
        data_source,
        last_updated,
        created_at,
        ST_Distance(
          geometry::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) as distance_meters
      FROM ${this.tableName}
      ORDER BY geometry <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
      LIMIT $3;
    `;

    const result = await this.pool.query(
      query,
      [lon, lat, limit]
    );

    return result.rows;
  }

  /**
   * Get confidence badge information for UI display (FR-013B)
   * 
   * @param site - TOAL site attributes
   * @returns Confidence badge information
   */
  static getConfidenceBadge(site: Pick<TOALSiteAttributes, 'verified' | 'data_source'>): {
    level: 'verified' | 'community-reported' | 'unverified';
    label: string;
    icon: string;
  } {
    if (site.verified) {
      return {
        level: 'verified',
        label: 'Verified',
        icon: 'check-circle' // green checkmark
      };
    }

    if (site.data_source.toLowerCase().includes('community')) {
      return {
        level: 'community-reported',
        label: 'Community-reported',
        icon: 'info-circle' // orange info
      };
    }

    return {
      level: 'unverified',
      label: 'Unverified',
      icon: 'question-circle' // gray question
    };
  }
}
