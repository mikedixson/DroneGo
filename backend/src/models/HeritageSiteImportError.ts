import { BaseModel, BaseModelAttributes } from './BaseModel.js';

/**
 * Heritage Site Import Error entity attributes
 * 
 * Quarantine table for geometries and records that fail validation during import.
 * Used for debugging, manual review, and import quality monitoring.
 */
export interface HeritageSiteImportErrorAttributes extends BaseModelAttributes {
  error_id: string;
  source_record_id: string; // OBJECTID or GlobalID from external API
  data_source_id: string; // UUID FK to data_sources
  error_type: 'topology_invalid' | 'bounds_invalid' | 'parse_failure' | 'api_error' | 'missing_required_field';
  raw_geometry_text: string | null; // GeoJSON or WKT for debugging
  raw_properties_json: any; // JSONB - full feature properties from API
  error_details: string; // Detailed error message (e.g., ST_IsValidReason output)
  quarantine_timestamp: Date;
  resolved: boolean;
  resolved_at: Date | null;
  resolution_notes: string | null;
}

/**
 * Heritage Site Import Error Model
 * 
 * Tracks validation failures during heritage site imports for:
 * - Invalid geometries (self-intersecting polygons, unclosed rings)
 * - Out-of-bounds coordinates (lat/lng outside valid ranges)
 * - API parsing failures
 * - Missing required fields
 * 
 * Per Constitution §I (Quality First):
 * - All import failures MUST be logged to structured logs
 * - Invalid geometries MUST be quarantined, not silently dropped
 * - Error types enable analytics on import quality trends
 * 
 * Data Model: specs/fix-heritage-site-imports/data-model.md Section 2
 */
export class HeritageSiteImportError extends BaseModel<HeritageSiteImportErrorAttributes> {
  protected tableName = 'heritage_sites_import_errors';
  protected primaryKey = 'error_id';

  /**
   * Quarantine a failed import record
   * 
   * @param data - Error details from import process
   * @returns Created error record
   */
  static async create(data: {
    source_record_id: string;
    data_source_id: string;
    error_type: HeritageSiteImportErrorAttributes['error_type'];
    raw_geometry_text?: string;
    raw_properties_json?: any;
    error_details: string;
  }): Promise<HeritageSiteImportErrorAttributes> {
    const pool = (await import('../lib/db.js')).getDbPool();

    // Validate required fields
    if (!data.source_record_id) {
      throw new Error('source_record_id is required');
    }
    if (!data.data_source_id) {
      throw new Error('data_source_id is required');
    }
    if (!data.error_type) {
      throw new Error('error_type is required');
    }
    if (!data.error_details) {
      throw new Error('error_details is required');
    }

    const query = `
      INSERT INTO heritage_sites_import_errors (
        source_record_id, data_source_id, error_type,
        raw_geometry_text, raw_properties_json, error_details
      ) VALUES (
        $1, $2, $3, $4, $5, $6
      )
      RETURNING 
        error_id,
        source_record_id,
        data_source_id,
        error_type,
        raw_geometry_text,
        raw_properties_json,
        error_details,
        quarantine_timestamp,
        resolved,
        resolved_at,
        resolution_notes
    `;

    const result = await pool.query(query, [
      data.source_record_id,
      data.data_source_id,
      data.error_type,
      data.raw_geometry_text || null,
      data.raw_properties_json ? JSON.stringify(data.raw_properties_json) : null,
      data.error_details,
    ]);

    return result.rows[0] as HeritageSiteImportErrorAttributes;
  }

  /**
   * Get all unresolved errors for a data source
   * 
   * @param dataSourceId - UUID of data source
   * @returns Array of unresolved errors
   */
  static async getUnresolvedBySource(
    dataSourceId: string
  ): Promise<HeritageSiteImportErrorAttributes[]> {
    const pool = (await import('../lib/db.js')).getDbPool();

    const query = `
      SELECT 
        error_id,
        source_record_id,
        data_source_id,
        error_type,
        raw_geometry_text,
        raw_properties_json,
        error_details,
        quarantine_timestamp,
        resolved,
        resolved_at,
        resolution_notes
      FROM heritage_sites_import_errors
      WHERE data_source_id = $1 AND resolved = false
      ORDER BY quarantine_timestamp DESC
    `;

    const result = await pool.query(query, [dataSourceId]);
    return result.rows as HeritageSiteImportErrorAttributes[];
  }

  /**
   * Get error statistics by type
   * 
   * @param dataSourceId - Optional filter by data source
   * @param since - Optional date filter (only errors since this date)
   * @returns Error counts by type
   */
  static async getErrorStatsByType(
    dataSourceId?: string,
    since?: Date
  ): Promise<{ error_type: string; count: number }[]> {
    const pool = (await import('../lib/db.js')).getDbPool();

    let query = `
      SELECT 
        error_type,
        COUNT(*) as count
      FROM heritage_sites_import_errors
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (dataSourceId) {
      query += ` AND data_source_id = $${paramIndex++}`;
      params.push(dataSourceId);
    }

    if (since) {
      query += ` AND quarantine_timestamp >= $${paramIndex++}`;
      params.push(since);
    }

    query += `
      GROUP BY error_type
      ORDER BY count DESC
    `;

    const result = await pool.query(query, params);
    return result.rows.map((row) => ({
      error_type: row.error_type,
      count: parseInt(row.count),
    }));
  }

  /**
   * Mark error as resolved
   * 
   * @param errorId - UUID of error record
   * @param resolutionNotes - Optional notes explaining resolution
   * @returns Updated error record
   */
  static async markResolved(
    errorId: string,
    resolutionNotes?: string
  ): Promise<HeritageSiteImportErrorAttributes> {
    const pool = (await import('../lib/db.js')).getDbPool();

    const query = `
      UPDATE heritage_sites_import_errors
      SET 
        resolved = true,
        resolved_at = NOW(),
        resolution_notes = $2
      WHERE error_id = $1
      RETURNING 
        error_id,
        source_record_id,
        data_source_id,
        error_type,
        raw_geometry_text,
        raw_properties_json,
        error_details,
        quarantine_timestamp,
        resolved,
        resolved_at,
        resolution_notes
    `;

    const result = await pool.query(query, [errorId, resolutionNotes || null]);
    
    if (result.rows.length === 0) {
      throw new Error(`Error record not found: ${errorId}`);
    }

    return result.rows[0] as HeritageSiteImportErrorAttributes;
  }

  /**
   * Get all errors (with pagination)
   * 
   * @param limit - Maximum number of records to return
   * @param offset - Number of records to skip
   * @param includeResolved - Whether to include resolved errors (default: false)
   * @returns Array of error records
   */
  static async getAll(
    limit: number = 100,
    offset: number = 0,
    includeResolved: boolean = false
  ): Promise<HeritageSiteImportErrorAttributes[]> {
    const pool = (await import('../lib/db.js')).getDbPool();

    const query = `
      SELECT 
        error_id,
        source_record_id,
        data_source_id,
        error_type,
        raw_geometry_text,
        raw_properties_json,
        error_details,
        quarantine_timestamp,
        resolved,
        resolved_at,
        resolution_notes
      FROM heritage_sites_import_errors
      ${!includeResolved ? 'WHERE resolved = false' : ''}
      ORDER BY quarantine_timestamp DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [limit, offset]);
    return result.rows as HeritageSiteImportErrorAttributes[];
  }

  /**
   * Delete resolved errors older than specified days
   * 
   * Used for periodic cleanup of old resolved errors.
   * 
   * @param daysOld - Delete errors resolved more than this many days ago
   * @returns Number of records deleted
   */
  static async deleteOldResolved(daysOld: number = 90): Promise<number> {
    const pool = (await import('../lib/db.js')).getDbPool();

    const query = `
      DELETE FROM heritage_sites_import_errors
      WHERE resolved = true
        AND resolved_at < NOW() - INTERVAL '${daysOld} days'
    `;

    const result = await pool.query(query);
    return result.rowCount || 0;
  }
}
