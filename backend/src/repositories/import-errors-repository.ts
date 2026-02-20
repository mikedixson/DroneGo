import { Pool } from 'pg';
import { getDbPool } from '../lib/db.js';
import type { HeritageSiteImportErrorAttributes } from '../models/HeritageSiteImportError.js';

/**
 * Create error data for quarantine
 */
export interface QuarantineErrorData {
  source_record_id: string;
  data_source_id: string;
  error_type: 'topology_invalid' | 'bounds_invalid' | 'parse_failure' | 'api_error' | 'missing_required_field';
  raw_geometry_text?: string;
  raw_properties_json?: any;
  error_details: string;
}

/**
 * Import Errors Repository
 * 
 * Manages quarantined records that failed validation during heritage site imports.
 * 
 * Key Features:
 * - Quarantine invalid geometries with full diagnostic info
 * - Query unresolved errors for manual review
 * - Track error statistics by type
 * - Mark errors as resolved with notes
 * 
 * Per Constitution §I (Quality First):
 * - All import failures MUST be logged
 * - Invalid geometries MUST be quarantined, not silently dropped
 * - Error details MUST include ST_IsValidReason output for topology errors
 * 
 * Data Model: specs/fix-heritage-site-imports/data-model.md Section 2
 */
export class ImportErrorsRepository {
  private pool: Pool;

  constructor() {
    this.pool = getDbPool();
  }

  /**
   * Quarantine a failed import record
   * 
   * @param data - Error details from import process
   * @returns Created error record with auto-generated error_id
   */
  async quarantine(data: QuarantineErrorData): Promise<HeritageSiteImportErrorAttributes> {
    const query = `
      INSERT INTO heritage_sites_import_errors (
        source_record_id,
        data_source_id,
        error_type,
        raw_geometry_text,
        raw_properties_json,
        error_details
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

    const result = await this.pool.query(query, [
      data.source_record_id,
      data.data_source_id,
      data.error_type,
      data.raw_geometry_text || null,
      data.raw_properties_json ? JSON.stringify(data.raw_properties_json) : null,
      data.error_details,
    ]);

    return result.rows[0];
  }

  /**
   * Get all unresolved errors for a data source
   * 
   * Used for manual review and debugging import issues.
   * 
   * @param dataSourceId - UUID of data source
   * @returns Array of unresolved errors ordered by timestamp DESC
   */
  async getUnresolved(dataSourceId?: string): Promise<HeritageSiteImportErrorAttributes[]> {
    let query = `
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
      WHERE resolved = false
    `;

    const params: any[] = [];
    if (dataSourceId) {
      query += ' AND data_source_id = $1';
      params.push(dataSourceId);
    }

    query += ' ORDER BY quarantine_timestamp DESC';

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get error statistics by type
   * 
   * Used for import quality analytics and monitoring.
   * 
   * @param dataSourceId - Optional filter by data source
   * @param since - Optional date filter (only errors since this date)
   * @returns Error counts grouped by error_type
   */
  async getErrorStatsByType(
    dataSourceId?: string,
    since?: Date
  ): Promise<{ error_type: string; count: number }[]> {
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

    const result = await this.pool.query(query, params);
    return result.rows.map((row) => ({
      error_type: row.error_type,
      count: parseInt(row.count),
    }));
  }

  /**
   * Mark error as resolved
   * 
   * @param errorId - UUID of error record
   * @param resolutionNotes - Optional notes explaining how the error was resolved
   * @returns Updated error record
   */
  async markResolved(
    errorId: string,
    resolutionNotes?: string
  ): Promise<HeritageSiteImportErrorAttributes> {
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

    const result = await this.pool.query(query, [errorId, resolutionNotes || null]);

    if (result.rows.length === 0) {
      throw new Error(`Error record not found: ${errorId}`);
    }

    return result.rows[0];
  }

  /**
   * Get total count of unresolved errors by data source
   * 
   * Used for health monitoring and alert thresholds.
   * 
   * @returns Array of data source IDs with unresolved error counts
   */
  async getUnresolvedCountBySource(): Promise<{ data_source_id: string; count: number }[]> {
    const query = `
      SELECT 
        data_source_id,
        COUNT(*) as count
      FROM heritage_sites_import_errors
      WHERE resolved = false
      GROUP BY data_source_id
      ORDER BY count DESC
    `;

    const result = await this.pool.query(query);
    return result.rows.map((row) => ({
      data_source_id: row.data_source_id,
      count: parseInt(row.count),
    }));
  }

  /**
   * Delete resolved errors older than specified days
   * 
   * Used for periodic cleanup of old resolved errors.
   * Should be run via scheduled job (weekly/monthly).
   * 
   * @param daysOld - Delete errors resolved more than this many days ago
   * @returns Number of records deleted
   */
  async deleteOldResolved(daysOld: number = 90): Promise<number> {
    const query = `
      DELETE FROM heritage_sites_import_errors
      WHERE resolved = true
        AND resolved_at < NOW() - INTERVAL '${daysOld} days'
    `;

    const result = await this.pool.query(query);
    return result.rowCount || 0;
  }

  /**
   * Get recent errors (last 24 hours)
   * 
   * Used for immediate troubleshooting after import runs.
   * 
   * @param limit - Maximum number of records to return
   * @returns Array of recent errors
   */
  async getRecent(limit: number = 100): Promise<HeritageSiteImportErrorAttributes[]> {
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
      WHERE quarantine_timestamp >= NOW() - INTERVAL '24 hours'
      ORDER BY quarantine_timestamp DESC
      LIMIT $1
    `;

    const result = await this.pool.query(query, [limit]);
    return result.rows;
  }
}
