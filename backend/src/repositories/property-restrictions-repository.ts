import { Pool } from 'pg';
import { getDbPool } from '../lib/db.js';
import type { MultiPolygon } from 'geojson';

/**
 * Property Restriction attributes for repository operations
 */
export interface PropertyRestrictionData {
  property_restriction_id?: string;
  property_name: string;
  managing_organization: string;
  geometry: MultiPolygon;
  geometry_simplified_low: MultiPolygon;
  geometry_simplified_medium: MultiPolygon;
  restriction_category: string;
  policy_text?: string | null;
  contact_info?: string | null;
  policy_effective_date?: Date | null;
  data_source_id?: string | null;
  superseded_by?: string | null;
  is_primary?: boolean;
}

/**
 * Bounding box for spatial queries
 */
export interface BoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Duplicate candidate with distance and name similarity
 */
export interface DuplicateCandidate {
  property_restriction_id: string;
  property_name: string;
  distance_meters: number;
  name_similarity: number;
}

/**
 * Batch insert result
 */
export interface BatchInsertResult {
  inserted: number;
  failed: number;
  ids: string[];
  errors: { index: number; error: string }[];
}

/**
 * Property Restrictions Repository
 * 
 * Handles CRUD operations for heritage sites with zoom-level optimized geometry queries.
 * 
 * Key Features:
 * - Zoom-level geometry selection (FR-008): <13 low, 13-15 medium, >15 full
 * - Batch insert with transaction support
 * - Duplicate detection using spatial proximity + name similarity
 * - Bounding box filtering for map viewport queries
 * 
 * Per Constitution §I (Safety First):
 * - All spatial queries use GIST indexes
 * - Batch operations use transactions (rollback on error)
 * - Duplicate detection prevents data pollution
 * 
 * Data Model: specs/fix-heritage-site-imports/data-model.md - Query Patterns
 */
export class PropertyRestrictionsRepository {
  private pool: Pool;

  constructor() {
    this.pool = getDbPool();
  }

  /**
   * Insert multiple property restrictions in a batch
   * 
   * Uses transaction to ensure atomicity - either all succeed or all fail.
   * 
   * @param sites - Array of property restrictions to insert
   * @returns Batch insert result with IDs and errors
   */
  async insertBatch(sites: PropertyRestrictionData[]): Promise<BatchInsertResult> {
    const client = await this.pool.connect();
    const result: BatchInsertResult = {
      inserted: 0,
      failed: 0,
      ids: [],
      errors: [],
    };

    try {
      await client.query('BEGIN');

      for (let i = 0; i < sites.length; i++) {
        const site = sites[i];

        try {
          // Validate required fields
          if (!site.property_name) {
            throw new Error('property_name is required');
          }

          const query = `
            INSERT INTO property_restrictions (
              property_name,
              managing_organization,
              geometry,
              geometry_simplified_low,
              geometry_simplified_medium,
              restriction_category,
              policy_text,
              contact_info,
              policy_effective_date,
              data_source_id,
              is_primary
            ) VALUES (
              $1, $2,
              ST_Multi(ST_GeomFromGeoJSON($3)),
              ST_Multi(ST_GeomFromGeoJSON($4)),
              ST_Multi(ST_GeomFromGeoJSON($5)),
              $6, $7, $8, $9, $10, $11
            )
            RETURNING property_restriction_id
          `;

          const insertResult = await client.query(query, [
            site.property_name,
            site.managing_organization,
            JSON.stringify(site.geometry),
            JSON.stringify(site.geometry_simplified_low),
            JSON.stringify(site.geometry_simplified_medium),
            site.restriction_category,
            site.policy_text || null,
            site.contact_info || null,
            site.policy_effective_date || null,
            site.data_source_id || null,
            site.is_primary !== undefined ? site.is_primary : true,
          ]);

          result.inserted++;
          result.ids.push(insertResult.rows[0].property_restriction_id);
        } catch (error) {
          result.failed++;
          result.errors.push({
            index: i,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return result;
  }

  /**
   * Get property restrictions by zoom level with bbox filtering
   * 
   * FR-008: Returns appropriate geometry resolution based on zoom:
   * - zoom <13: geometry_simplified_low (tolerance 0.0001°)
   * - zoom 13-15: geometry_simplified_medium (tolerance 0.00005°)
   * - zoom >15: geometry (full precision)
   * 
   * @param bbox - Bounding box for viewport filtering
   * @param zoom - Current map zoom level
   * @param category - Optional restriction category filter
   * @returns Array of property restrictions with zoom-appropriate geometry
   */
  async getByZoomLevel(
    bbox: BoundingBox,
    zoom: number,
    category?: string
  ): Promise<PropertyRestrictionData[]> {
    // Select geometry field based on zoom level
    let geometryField: string;
    if (zoom < 13) {
      geometryField = 'geometry_simplified_low';
    } else if (zoom >= 13 && zoom <= 15) {
      geometryField = 'geometry_simplified_medium';
    } else {
      geometryField = 'geometry';
    }

    const query = `
      SELECT 
        property_restriction_id,
        property_name,
        managing_organization,
        restriction_category,
        ST_AsGeoJSON(${geometryField})::json as geometry,
        policy_text,
        contact_info,
        policy_effective_date,
        data_source_id
      FROM property_restrictions
      WHERE 
        ST_Intersects(
          geometry,
          ST_MakeEnvelope($1, $2, $3, $4, 4326)
        )
        ${category ? 'AND restriction_category = $5' : ''}
        AND is_primary = true
      ORDER BY property_name
    `;

    const params: any[] = [bbox.west, bbox.south, bbox.east, bbox.north];
    if (category) {
      params.push(category);
    }

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Find duplicate property restrictions using spatial proximity and name similarity
   * 
   * FR-004: Duplicate detection strategy:
   * - Spatial: ST_DWithin 250 meters
   * - Text: pg_trgm similarity() ≥0.8
   * 
   * @param propertyName - Name of candidate property
   * @param geometry - Geometry of candidate property
   * @param thresholdMeters - Distance threshold in meters (default: 250)
   * @param similarityThreshold - Name similarity threshold 0-1 (default: 0.8)
   * @returns Array of potential duplicates with distance and similarity scores
   */
  async findDuplicates(
    propertyName: string,
    geometry: MultiPolygon,
    thresholdMeters: number = 250,
    similarityThreshold: number = 0.8
  ): Promise<DuplicateCandidate[]> {
    const query = `
      SELECT 
        property_restriction_id,
        property_name,
        ST_Distance(
          geometry::geography,
          ST_GeomFromGeoJSON($2)::geography
        ) as distance_meters,
        similarity(property_name, $1) as name_similarity
      FROM property_restrictions
      WHERE 
        ST_DWithin(
          geometry::geography,
          ST_GeomFromGeoJSON($2)::geography,
          $3
        )
        AND is_primary = true
      HAVING similarity(property_name, $1) >= $4
      ORDER BY distance_meters ASC, name_similarity DESC
    `;

    const result = await this.pool.query(query, [
      propertyName,
      JSON.stringify(geometry),
      thresholdMeters,
      similarityThreshold,
    ]);

    return result.rows.map((row) => ({
      property_restriction_id: row.property_restriction_id,
      property_name: row.property_name,
      distance_meters: parseFloat(row.distance_meters),
      name_similarity: parseFloat(row.name_similarity),
    }));
  }

  /**
   * Get property restriction by ID
   * 
   * @param id - UUID of property restriction
   * @returns Property restriction or null if not found
   */
  async getById(id: string): Promise<PropertyRestrictionData | null> {
    const query = `
      SELECT 
        property_restriction_id,
        property_name,
        managing_organization,
        restriction_category,
        ST_AsGeoJSON(geometry)::json as geometry,
        ST_AsGeoJSON(geometry_simplified_low)::json as geometry_simplified_low,
        ST_AsGeoJSON(geometry_simplified_medium)::json as geometry_simplified_medium,
        policy_text,
        contact_info,
        policy_effective_date,
        data_source_id,
        superseded_by,
        is_primary
      FROM property_restrictions
      WHERE property_restriction_id = $1
    `;

    const result = await this.pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Mark a property restriction as superseded by another
   * 
   * Used during deduplication to link duplicate records.
   * 
   * @param duplicateId - ID of the duplicate record
   * @param primaryId - ID of the primary/preferred record
   */
  async markAsSuperseded(duplicateId: string, primaryId: string): Promise<void> {
    const query = `
      UPDATE property_restrictions
      SET 
        superseded_by = $2,
        is_primary = false
      WHERE property_restriction_id = $1
    `;

    await this.pool.query(query, [duplicateId, primaryId]);
  }

  /**
   * Get count of property restrictions by category
   * 
   * @returns Record of category → count
   */
  async getCountByCategory(): Promise<Record<string, number>> {
    const query = `
      SELECT 
        restriction_category,
        COUNT(*) as count
      FROM property_restrictions
      WHERE is_primary = true
      GROUP BY restriction_category
    `;

    const result = await this.pool.query(query);
    
    const counts: Record<string, number> = {};
    for (const row of result.rows) {
      counts[row.restriction_category] = parseInt(row.count);
    }
    
    return counts;
  }
}
