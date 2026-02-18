import { TOALSite, type TOALSiteAttributes } from '../models/TOALSite.js';
import { getDbPool } from '../lib/db.js';
import type { Pool } from 'pg';

/**
 * TOAL Sites Query Service
 * 
 * Provides high-level query operations for Take Off and Landing sites
 * with filtering and distance calculations.
 * 
 * Used by GET /toal and GET /toal/nearest API endpoints (US2: FR-012, FR-013, FR-013A, FR-013B)
 */

export interface TOALQueryOptions {
  accessTypes?: string[]; // Filter by access_type enum values (public/private/permit-required/club-only)
  verified?: boolean; // Filter by verified status
  surfaceTypes?: string[]; // Filter by surface_type enum values
}

export interface TOALSiteWithDistance extends TOALSiteAttributes {
  distance_meters?: number;
  distance_km?: number;
}

export class TOALService {
  private toalSiteModel: TOALSite;
  private pool: Pool;

  constructor() {
    this.toalSiteModel = new TOALSite();
    this.pool = getDbPool();
  }

  /**
   * Query TOAL sites within bounding box with optional filters
   * 
   * @param minLng Minimum longitude
   * @param minLat Minimum latitude
   * @param maxLng Maximum longitude
   * @param maxLat Maximum latitude
   * @param options Query filtering options
   * @returns Array of TOAL sites
   */
  async findTOALInBounds(
    minLng: number,
    minLat: number,
    maxLng: number,
    maxLat: number,
    options: TOALQueryOptions = {}
  ): Promise<TOALSiteAttributes[]> {
    // Get all sites in bounds
    const sites = await this.toalSiteModel.findInBounds(minLat, minLng, maxLat, maxLng);

    // Apply filters
    let filteredSites = sites;

    if (options.accessTypes && options.accessTypes.length > 0) {
      filteredSites = filteredSites.filter((site) =>
        options.accessTypes!.includes(site.access_type)
      );
    }

    if (options.verified !== undefined) {
      filteredSites = filteredSites.filter((site) => site.verified === options.verified);
    }

    if (options.surfaceTypes && options.surfaceTypes.length > 0) {
      filteredSites = filteredSites.filter(
        (site) => site.surface_type && options.surfaceTypes!.includes(site.surface_type)
      );
    }

    return filteredSites;
  }

  /**
   * Find nearest TOAL site(s) to a given point
   * 
   * @param lat Latitude of the point
   * @param lng Longitude of the point
   * @param limit Maximum number of results (default: 1)
   * @param options Query filtering options
   * @returns Array of nearest TOAL sites with distances
   */
  async findNearestTOAL(
    lat: number,
    lng: number,
    limit: number = 1,
    options: TOALQueryOptions = {}
  ): Promise<TOALSiteWithDistance[]> {
    // Build query with filters
    const whereClauses: string[] = [];
    const params: any[] = [lng, lat];
    let paramIndex = 3;

    if (options.accessTypes && options.accessTypes.length > 0) {
      whereClauses.push(`access_type = ANY($${paramIndex}::text[])`);
      params.push(options.accessTypes);
      paramIndex++;
    }

    if (options.verified !== undefined) {
      whereClauses.push(`verified = $${paramIndex}`);
      params.push(options.verified);
      paramIndex++;
    }

    if (options.surfaceTypes && options.surfaceTypes.length > 0) {
      whereClauses.push(`surface_type = ANY($${paramIndex}::text[])`);
      params.push(options.surfaceTypes);
      paramIndex++;
    }

    params.push(limit);

    const whereClause =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

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
      FROM toal_sites
      ${whereClause}
      ORDER BY geometry <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
      LIMIT $${paramIndex};
    `;

    const result = await this.pool.query<TOALSiteWithDistance>(query, params);

    // Add distance_km for convenience
    return result.rows.map((site) => ({
      ...site,
      distance_km: site.distance_meters ? site.distance_meters / 1000 : undefined
    }));
  }

  /**
   * Get public TOAL sites only (accessible to all pilots)
   * 
   * @param minLng Minimum longitude
   * @param minLat Minimum latitude
   * @param maxLng Maximum longitude
   * @param maxLat Maximum latitude
   * @returns Array of public TOAL sites
   */
  async findPublicTOAL(
    minLng: number,
    minLat: number,
    maxLng: number,
    maxLat: number
  ): Promise<TOALSiteAttributes[]> {
    return this.findTOALInBounds(minLng, minLat, maxLng, maxLat, {
      accessTypes: ['public']
    });
  }

  /**
   * Get verified TOAL sites only (field-verified)
   * 
   * @param minLng Minimum longitude
   * @param minLat Minimum latitude
   * @param maxLng Maximum longitude
   * @param maxLat Maximum latitude
   * @returns Array of verified TOAL sites
   */
  async findVerifiedTOAL(
    minLng: number,
    minLat: number,
    maxLng: number,
    maxLat: number
  ): Promise<TOALSiteAttributes[]> {
    return this.findTOALInBounds(minLng, minLat, maxLng, maxLat, {
      verified: true
    });
  }

  /**
   * Get TOAL site by ID
   * 
   * @param siteId TOAL site ID
   * @returns TOAL site or null if not found
   */
  async getTOALById(siteId: string): Promise<TOALSiteAttributes | null> {
    const result = await this.toalSiteModel.findById(siteId);
    return result || null;
  }

  /**
   * Get confidence badge information for UI display (FR-013B)
   * 
   * @param site TOAL site attributes
   * @returns Confidence badge information
   */
  getConfidenceBadge(site: Pick<TOALSiteAttributes, 'verified' | 'data_source'>): {
    level: 'verified' | 'community-reported' | 'unverified';
    label: string;
    icon: string;
  } {
    return TOALSite.getConfidenceBadge(site);
  }
}
