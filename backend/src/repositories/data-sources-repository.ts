import { Pool } from 'pg';
import { getDbPool } from '../lib/db.js';
import type { DataSourceAttributes } from '../models/DataSource.js';

/**
 * Data Sources Repository
 * 
 * Manages data source health tracking and import history.
 * 
 * Key Features:
 * - Track import success/failure rates
 * - Monitor consecutive failures for alerting
 * - Calculate 7-day success rate for reliability metrics
 * - Identify unhealthy and stale data sources
 * 
 * Per Constitution §I (Quality First):
 * - Health status MUST reflect actual import success rates
 * - Consecutive failures ≥3 triggers 'unhealthy' status
 * - Stale data (>48 hours) MUST be flagged
 * 
 * Data Model: specs/fix-heritage-site-imports/data-model.md Section 3
 */
export class DataSourcesRepository {
  private pool: Pool;

  constructor() {
    this.pool = getDbPool();
  }

  /**
   * Record successful import attempt
   * 
   * Updates:
   * - last_import_attempt = NOW()
   * - last_successful_import = NOW()
   * - health_status = 'healthy'
   * - consecutive_failure_count = 0
   * - success_count_7day++
   * 
   * @param sourceId - UUID of data source
   */
  async recordSuccess(sourceId: string): Promise<void> {
    const query = `
      UPDATE data_sources
      SET 
        last_import_attempt = NOW(),
        last_successful_import = NOW(),
        health_status = 'healthy',
        consecutive_failure_count = 0,
        success_count_7day = success_count_7day + 1
      WHERE source_id = $1
    `;

    await this.pool.query(query, [sourceId]);
  }

  /**
   * Record failed import attempt
   * 
   * Updates:
   * - last_import_attempt = NOW()
   * - last_error_timestamp = NOW()
   * - last_error_message = error message
   * - consecutive_failure_count++
   * - failure_count_7day++
   * - health_status = 'unhealthy' if consecutive ≥3
   * 
   * @param sourceId - UUID of data source
   * @param errorMessage - Error message describing the failure
   */
  async recordFailure(sourceId: string, errorMessage: string): Promise<void> {
    const query = `
      UPDATE data_sources
      SET 
        last_import_attempt = NOW(),
        last_error_timestamp = NOW(),
        last_error_message = $2,
        consecutive_failure_count = consecutive_failure_count + 1,
        failure_count_7day = failure_count_7day + 1,
        health_status = CASE 
          WHEN consecutive_failure_count + 1 >= 3 THEN 'unhealthy'
          ELSE health_status
        END
      WHERE source_id = $1
    `;

    await this.pool.query(query, [sourceId, errorMessage]);
  }

  /**
   * Get all unhealthy data sources
   * 
   * Returns sources with health_status = 'unhealthy'.
   * Used for alerting and monitoring dashboards.
   * 
   * @returns Array of unhealthy data sources
   */
  async getUnhealthy(): Promise<DataSourceAttributes[]> {
    const query = `
      SELECT * FROM data_sources
      WHERE health_status = 'unhealthy'
      ORDER BY consecutive_failure_count DESC, last_error_timestamp DESC
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Get data sources with stale data
   * 
   * Returns sources where last_successful_import > threshold hours ago.
   * Used for data freshness warnings (FR-013).
   * 
   * @param hoursThreshold - Hours since last successful import (default: 48)
   * @returns Array of data sources with stale data
   */
  async getStale(hoursThreshold: number = 48): Promise<DataSourceAttributes[]> {
    const query = `
      SELECT * FROM data_sources
      WHERE last_successful_import IS NULL
         OR last_successful_import < NOW() - INTERVAL '${hoursThreshold} hours'
      ORDER BY last_successful_import ASC NULLS FIRST
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Get data source by ID
   * 
   * @param sourceId - UUID of data source
   * @returns Data source or null if not found
   */
  async getById(sourceId: string): Promise<DataSourceAttributes | null> {
    const query = `SELECT * FROM data_sources WHERE source_id = $1`;
    const result = await this.pool.query(query, [sourceId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Get data source by authority name
   * 
   * @param authorityName - Name of the authority (e.g., "Historic England")
   * @returns Data source or null if not found
   */
  async getByName(authorityName: string): Promise<DataSourceAttributes | null> {
    const query = `SELECT * FROM data_sources WHERE authority_name = $1`;
    const result = await this.pool.query(query, [authorityName]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Get health summary for all data sources
   * 
   * Returns aggregated health statistics.
   * Used for monitoring dashboards.
   * 
   * @returns Health summary statistics
   */
  async getHealthSummary(): Promise<{
    total: number;
    healthy: number;
    unhealthy: number;
    unknown: number;
    stale: number; // >48 hours since last success
  }> {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE health_status = 'healthy') as healthy,
        COUNT(*) FILTER (WHERE health_status = 'unhealthy') as unhealthy,
        COUNT(*) FILTER (WHERE health_status = 'unknown') as unknown,
        COUNT(*) FILTER (WHERE 
          last_successful_import IS NULL 
          OR last_successful_import < NOW() - INTERVAL '48 hours'
        ) as stale
      FROM data_sources
    `;

    const result = await this.pool.query(query);
    const row = result.rows[0];

    return {
      total: parseInt(row.total),
      healthy: parseInt(row.healthy),
      unhealthy: parseInt(row.unhealthy),
      unknown: parseInt(row.unknown),
      stale: parseInt(row.stale),
    };
  }

  /**
   * Reset 7-day counters for sources with old attempts
   * 
   * Should be run daily via cron job.
   * Resets success_count_7day and failure_count_7day to 0
   * for sources where last_import_attempt > 7 days.
   */
  async reset7DayCounters(): Promise<void> {
    const query = `
      UPDATE data_sources
      SET 
        success_count_7day = 0,
        failure_count_7day = 0
      WHERE last_import_attempt < NOW() - INTERVAL '7 days'
    `;

    await this.pool.query(query);
  }

  /**
   * Get all data sources
   * 
   * @returns Array of all data sources
   */
  async getAll(): Promise<DataSourceAttributes[]> {
    const query = `SELECT * FROM data_sources ORDER BY authority_name`;
    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Update health status manually
   * 
   * Used for administrative overrides or system maintenance.
   * 
   * @param sourceId - UUID of data source
   * @param status - New health status
   */
  async updateHealthStatus(
    sourceId: string,
    status: 'healthy' | 'unhealthy' | 'unknown'
  ): Promise<void> {
    const query = `
      UPDATE data_sources
      SET health_status = $2
      WHERE source_id = $1
    `;

    await this.pool.query(query, [sourceId, status]);
  }
}
