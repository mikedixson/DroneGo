import { GeospatialService, type ZoneResult } from './geospatial-service.js';
import { getDbPool } from '../lib/db.js';
import type { Pool } from 'pg';

/**
 * Zones Query Service
 * 
 * Provides high-level query operations for restriction zones with filtering
 * and data quality metadata. Builds on GeospatialService for spatial operations.
 * 
 * Used by GET /zones API endpoint (FR-002, FR-003, FR-004, FR-006)
 */

export interface ZoneQueryOptions {
  zoneTypes?: string[]; // Filter by zone_type enum values
  includeExpired?: boolean; // Include expired temporary restrictions
  confidenceLevels?: string[]; // Filter by confidence_level
  authoritySources?: string[]; // Filter by authority_source
}

export interface ZoneWithMetadata extends ZoneResult {
  data_source_info?: {
    authority_name: string;
    last_update: Date;
    confidence_level: string;
  };
}

export class ZonesService {
  private geospatialService: GeospatialService;
  private pool: Pool;

  constructor() {
    this.geospatialService = new GeospatialService();
    this.pool = getDbPool();
  }

  /**
   * Query zones within bounding box with optional filters
   * 
   * @param minLng Minimum longitude
   * @param minLat Minimum latitude
   * @param maxLng Maximum longitude
   * @param maxLat Maximum latitude
   * @param options Query filtering options
   * @returns Array of zones with data source metadata
   */
  async findZonesInBounds(
    minLng: number,
    minLat: number,
    maxLng: number,
    maxLat: number,
    options: ZoneQueryOptions = {}
  ): Promise<ZoneWithMetadata[]> {
    let zones: ZoneResult[];

    // If includeExpired=true, we need custom query since GeospatialService filters expired zones
    if (options.includeExpired) {
      zones = await this.findZonesIncludingExpired(minLng, minLat, maxLng, maxLat);
    } else {
      // Get active zones from geospatial service (filters out expired)
      zones = await this.geospatialService.findZonesWithinBounds(
        minLng,
        minLat,
        maxLng,
        maxLat
      );
    }

    // Apply filters
    let filteredZones = zones;

    if (options.zoneTypes && options.zoneTypes.length > 0) {
      filteredZones = filteredZones.filter((z) =>
        options.zoneTypes!.includes(z.zone_type)
      );
    }

    if (options.confidenceLevels && options.confidenceLevels.length > 0) {
      filteredZones = filteredZones.filter((z) =>
        options.confidenceLevels!.includes(z.confidence_level)
      );
    }

    if (options.authoritySources && options.authoritySources.length > 0) {
      filteredZones = filteredZones.filter((z) =>
        options.authoritySources!.includes(z.authority_source)
      );
    }

    // Enrich with data source metadata
    return await this.enrichWithDataSourceMetadata(filteredZones);
  }

  /**
   * Get active restriction zones (non-expired)
   * 
   * @param minLng Minimum longitude
   * @param minLat Minimum latitude
   * @param maxLng Maximum longitude
   * @param maxLat Maximum latitude
   * @returns Active zones only
   */
  async findActiveZonesInBounds(
    minLng: number,
    minLat: number,
    maxLng: number,
    maxLat: number
  ): Promise<ZoneWithMetadata[]> {
    const zones = await this.findZonesInBounds(minLng, minLat, maxLng, maxLat, {
      includeExpired: false,
    });

    // Filter out expired temporary restrictions
    return zones.filter(
      (z) =>
        z.effective_end === null || z.effective_end.getTime() > Date.now()
    );
  }

  /**
   * Query zones including expired ones (bypass temporal filtering)
   * 
   * @param minLng Minimum longitude
   * @param minLat Minimum latitude
   * @param maxLng Maximum longitude
   * @param maxLat Maximum latitude
   * @returns All zones including expired
   */
  private async findZonesIncludingExpired(
    minLng: number,
    minLat: number,
    maxLng: number,
    maxLat: number
  ): Promise<ZoneResult[]> {
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
        ORDER BY 
          CASE zone_type
            WHEN 'no-fly' THEN 1
            WHEN 'airport-frz' THEN 2
            WHEN 'military-zone' THEN 3
            WHEN 'controlled-airspace' THEN 4
            WHEN 'danger-area' THEN 5
            WHEN 'temporary-restriction' THEN 6
            ELSE 7
          END ASC`,
        [minLng, minLat, maxLng, maxLat]
      );

      return result.rows.map((row) => ({
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
      }));
    } catch (error) {
      throw new Error(
        `Failed to query zones including expired: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get zone by ID with metadata
   * 
   * @param zoneId Zone UUID
   * @returns Zone with metadata or null if not found
   */
  async findZoneById(zoneId: string): Promise<ZoneWithMetadata | null> {
    try {
      const result = await this.pool.query(
        `SELECT 
          rz.zone_id,
          rz.zone_type,
          rz.restriction_name,
          ST_AsGeoJSON(rz.geometry)::json as geometry,
          rz.authority_source,
          rz.altitude_floor,
          rz.altitude_ceiling,
          rz.effective_start,
          rz.effective_end,
          rz.description,
          rz.authorization_possible,
          rz.confidence_level,
          rz.last_updated,
          ds.authority_name,
          ds.confidence_level as ds_confidence_level,
          ds.last_update as ds_last_update
        FROM restriction_zones rz
        LEFT JOIN data_sources ds ON ds.authority_name = rz.authority_source AND ds.data_type = 'geographic_zones'
        WHERE rz.zone_id = $1`,
        [zoneId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapZoneWithMetadata(result.rows[0]);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to find zone by ID:${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Enrich zones with data source metadata
   * 
   * @param zones Zones to enrich
   * @returns Zones with data source info
   */
  private async enrichWithDataSourceMetadata(
    zones: ZoneResult[]
  ): Promise<ZoneWithMetadata[]> {
    if (zones.length === 0) {
      return [];
    }

    // Get unique authority sources
    const authoritySources = [...new Set(zones.map((z) => z.authority_source))];

    // Fetch data source info
    const result = await this.pool.query(
      `SELECT authority_name, confidence_level, last_update
       FROM data_sources
       WHERE authority_name = ANY($1) AND data_type = 'geographic_zones'`,
      [authoritySources]
    );

    // Create lookup map
    const dataSourceMap = new Map<string, any>();
    result.rows.forEach((row) => {
      dataSourceMap.set(row.authority_name, {
        authority_name: row.authority_name,
        confidence_level: row.confidence_level,
        last_update: new Date(row.last_update),
      });
    });

    // Enrich zones
    return zones.map((zone) => ({
      ...zone,
      data_source_info: dataSourceMap.get(zone.authority_source) || {
        authority_name: zone.authority_source,
        confidence_level: 'unverified',
        last_update: new Date(0),
      },
    }));
  }

  /**
   * Map database row to ZoneWithMetadata
   * 
   * @param row Database row
   * @returns Mapped zone with metadata
   */
  private mapZoneWithMetadata(row: any): ZoneWithMetadata {
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
      data_source_info: {
        authority_name: row.authority_name || row.authority_source,
        confidence_level: row.ds_confidence_level || row.confidence_level || 'unverified',
        last_update: row.ds_last_update
          ? new Date(row.ds_last_update)
          : new Date(0),
      },
    };
  }
}
