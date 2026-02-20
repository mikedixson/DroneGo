import { BaseModel, BaseModelAttributes } from './BaseModel.js';

/**
 * Data Source entity attributes
 */
export interface DataSourceAttributes extends BaseModelAttributes {
  source_id: string;
  authority_name: string;
  data_type_provided: string[];
  last_sync_timestamp: Date | null;
  sync_frequency: string;
  reliability_level: 'primary-authority' | 'official-secondary' | 'community' | 'unverified';
  data_url: string | null;
  license: string;
  attribution: string;
  contact_email: string | null;
  // Health tracking fields (Migration 006)
  health_status: 'healthy' | 'unhealthy' | 'unknown';
  last_import_attempt: Date | null;
  last_successful_import: Date | null;
  last_error_timestamp: Date | null;
  last_error_message: string | null;
  consecutive_failure_count: number;
  success_count_7day: number;
  failure_count_7day: number;
  success_rate_7day: number | null; // Computed: (success_count_7day / total) * 100
  created_at: Date;
}

/**
 * Data Source Model
 * 
 * Represents the authority or service providing restriction data.
 * Used for confidence indicators, audit trails, and data provenance tracking.
 */
export class DataSource extends BaseModel<DataSourceAttributes> {
  protected tableName = 'data_sources';
  protected primaryKey = 'source_id';
  protected timestampColumn = 'last_sync_timestamp'; // Override default 'last_updated'

  /**
   * Find data source by authority name (unique)
   */
  async findByName(authorityName: string): Promise<DataSourceAttributes | null> {
    const query = `SELECT * FROM ${this.tableName} WHERE authority_name = $1`;
    const result = await this.query(query, [authorityName]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find data sources by reliability level
   */
  async findByReliabilityLevel(
    level: DataSourceAttributes['reliability_level']
  ): Promise<DataSourceAttributes[]> {
    return this.findAll({ reliability_level: level });
  }

  /**
   * Find data sources that haven't been synced recently
   * 
   * @param hoursThreshold - Number of hours since last sync to consider stale
   * @returns Array of stale data sources
   */
  async findStale(hoursThreshold: number = 48): Promise<DataSourceAttributes[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE last_sync_timestamp IS NULL
         OR last_sync_timestamp < NOW() - INTERVAL '${hoursThreshold} hours'
      ORDER BY last_sync_timestamp ASC NULLS FIRST
    `;
    const result = await this.query(query);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Update the last sync timestamp for a data source
   */
  async updateSyncTimestamp(sourceId: string): Promise<void> {
    const query = `
      UPDATE ${this.tableName}
      SET last_sync_timestamp = NOW()
      WHERE ${this.primaryKey} = $1
    `;
    await this.query(query, [sourceId]);
  }

  /**
   * Get hours since last sync for a data source
   * 
   * @param sourceId - ID of the data source
   * @returns Number of hours since last sync, or null if never synced
   */
  async getHoursSinceLastSync(sourceId: string): Promise<number | null> {
    const query = `
      SELECT EXTRACT(EPOCH FROM (NOW() - last_sync_timestamp)) / 3600 as hours
      FROM ${this.tableName}
      WHERE ${this.primaryKey} = $1
    `;
    const result = await this.query(query, [sourceId]);

    if (result.rows.length === 0 || result.rows[0].hours === null) {
      return null;
    }

    return parseFloat(result.rows[0].hours);
  }

  /**
   * Get all primary authority sources (CAA, NATS, etc.)
   */
  async getPrimaryAuthorities(): Promise<DataSourceAttributes[]> {
    return this.findByReliabilityLevel('primary-authority');
  }

  /**
   * Check if a source needs syncing based on its sync frequency
   * 
   * @param sourceId - ID of the data source
   * @returns True if source needs syncing
   */
  async needsSync(sourceId: string): Promise<boolean> {
    const source = await this.findById(sourceId);
    if (!source || !source.last_sync_timestamp) {
      return true;
    }

    const hoursSinceSync = await this.getHoursSinceLastSync(sourceId);
    if (hoursSinceSync === null) {
      return true;
    }

    // Parse sync frequency to determine threshold
    const frequency = source.sync_frequency.toLowerCase();
    let thresholdHours = 24; // Default to daily

    if (frequency.includes('real-time') || frequency.includes('hourly')) {
      thresholdHours = 1;
    } else if (frequency.includes('daily')) {
      thresholdHours = 24;
    } else if (frequency.includes('weekly') || frequency.includes('7')) {
      thresholdHours = 168; // 7 days
    } else if (frequency.includes('28-day') || frequency.includes('airac')) {
      thresholdHours = 672; // 28 days
    } else if (frequency.includes('monthly')) {
      thresholdHours = 720; // 30 days
    }

    return hoursSinceSync >= thresholdHours;
  }

  /**
   * Record successful import attempt
   * 
   * Updates health status to 'healthy', resets consecutive failures,
   * increments 7-day success count.
   * 
   * @param sourceId - ID of the data source
   */
  async recordSuccessfulImport(sourceId: string): Promise<void> {
    const query = `
      UPDATE ${this.tableName}
      SET 
        last_import_attempt = NOW(),
        last_successful_import = NOW(),
        health_status = 'healthy',
        consecutive_failure_count = 0,
        success_count_7day = success_count_7day + 1
      WHERE ${this.primaryKey} = $1
    `;
    await this.query(query, [sourceId]);
  }

  /**
   * Record failed import attempt
   * 
   * Updates health status to 'unhealthy' if consecutive failures ≥3,
   * increments consecutive failures and 7-day failure count.
   * 
   * @param sourceId - ID of the data source
   * @param errorMessage - Error message describing the failure
   */
  async recordFailedImport(sourceId: string, errorMessage: string): Promise<void> {
    const query = `
      UPDATE ${this.tableName}
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
      WHERE ${this.primaryKey} = $1
    `;
    await this.query(query, [sourceId, errorMessage]);
  }

  /**
   * Get unhealthy data sources
   * 
   * Returns sources with health_status = 'unhealthy'
   * 
   * @returns Array of unhealthy data sources
   */
  async getUnhealthySources(): Promise<DataSourceAttributes[]> {
    return this.findAll({ health_status: 'unhealthy' });
  }

  /**
   * Get data sources with stale data (>48 hours since last successful import)
   * 
   * @returns Array of data sources with stale data
   */
  async getStaleSources(hoursThreshold: number = 48): Promise<DataSourceAttributes[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE last_successful_import IS NULL
         OR last_successful_import < NOW() - INTERVAL '${hoursThreshold} hours'
      ORDER BY last_successful_import ASC NULLS FIRST
    `;
    const result = await this.query(query);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Reset 7-day counters (should be run daily via cron)
   * 
   * Resets success_count_7day and failure_count_7day for all sources
   * where the oldest recorded attempt is >7 days ago.
   */
  async reset7DayCounters(): Promise<void> {
    const query = `
      UPDATE ${this.tableName}
      SET 
        success_count_7day = 0,
        failure_count_7day = 0
      WHERE last_import_attempt < NOW() - INTERVAL '7 days'
    `;
    await this.query(query);
  }

  /**
   * Override mapRow to transform database results
   */
  protected mapRow(row: any): DataSourceAttributes {
    // Convert date strings to Date objects
    if (row.created_at && typeof row.created_at === 'string') {
      row.created_at = new Date(row.created_at);
    }
    if (row.last_updated && typeof row.last_updated === 'string') {
      row.last_updated = new Date(row.last_updated);
    }
    if (row.last_sync_timestamp && typeof row.last_sync_timestamp === 'string') {
      row.last_sync_timestamp = new Date(row.last_sync_timestamp);
    }
    // Health tracking date fields
    if (row.last_import_attempt && typeof row.last_import_attempt === 'string') {
      row.last_import_attempt = new Date(row.last_import_attempt);
    }
    if (row.last_successful_import && typeof row.last_successful_import === 'string') {
      row.last_successful_import = new Date(row.last_successful_import);
    }
    if (row.last_error_timestamp && typeof row.last_error_timestamp === 'string') {
      row.last_error_timestamp = new Date(row.last_error_timestamp);
    }

    // Ensure data_type_provided is an array
    if (typeof row.data_type_provided === 'string') {
      try {
        row.data_type_provided = JSON.parse(row.data_type_provided);
      } catch (e) {
        // If parsing fails, wrap in array
        row.data_type_provided = [row.data_type_provided];
      }
    }

    return row as DataSourceAttributes;
  }
}
