import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getDbPool } from '../lib/db.js';
import { logger } from '../lib/logger.js';

/**
 * Base repository class providing common database operations
 * 
 * Features:
 * - Connection pooling via getDbPool()
 * - Transaction support (begin, commit, rollback)
 * - Standardized error handling
 * - Query logging for debugging
 * 
 * Usage:
 * ```typescript
 * class MyRepository extends BaseRepository {
 *   async findById(id: string): Promise<MyEntity | null> {
 *     const result = await this.query(
 *       'SELECT * FROM my_table WHERE id = $1',
 *       [id]
 *     );
 *     return result.rows[0] || null;
 *   }
 * }
 * ```
 */
export abstract class BaseRepository {
  protected pool: Pool;

  constructor() {
    this.pool = getDbPool();
  }

  /**
   * Execute a query using the connection pool
   * 
   * @param text SQL query text
   * @param params Query parameters
   * @returns Query result
   */
  protected async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      logger.debug('Executing query', { text, params });
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      logger.debug('Query completed', { duration, rowCount: result.rowCount });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Query failed', {
        text,
        params,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Execute multiple queries within a transaction
   * 
   * @param fn Transaction callback function
   * @returns Result from callback
   * 
   * @example
   * ```typescript
   * await this.transaction(async (client) => {
   *   await client.query('INSERT INTO table1 VALUES ($1)', [value1]);
   *   await client.query('INSERT INTO table2 VALUES ($1)', [value2]);
   *   return { success: true };
   * });
   * ```
   */
  protected async transaction<T>(
    fn: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      logger.debug('Transaction started');
      
      const result = await fn(client);
      
      await client.query('COMMIT');
      logger.debug('Transaction committed');
      
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.warn('Transaction rolled back', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Batch insert records within a transaction
   * 
   * @param tableName Target table name
   * @param columns Column names
   * @param records Array of records to insert
   * @param batchSize Number of records per batch (default: 1000)
   * @returns Total number of inserted rows
   * 
   * @example
   * ```typescript
   * await this.batchInsert(
   *   'property_restrictions',
   *   ['property_name', 'geometry', 'data_source_id'],
   *   sites.map(s => [s.name, s.geometry, s.sourceId]),
   *   1000
   * );
   * ```
   */
  protected async batchInsert(
    tableName: string,
    columns: string[],
    records: any[][],
    batchSize = 1000
  ): Promise<number> {
    let totalInserted = 0;

    // Process records in batches
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      await this.transaction(async (client) => {
        for (const record of batch) {
          // Build parameterized query
          const placeholders = record
            .map((_, idx) => `$${idx + 1}`)
            .join(', ');
          
          const query = `
            INSERT INTO ${tableName} (${columns.join(', ')})
            VALUES (${placeholders})
          `;
          
          await client.query(query, record);
          totalInserted++;
        }
      });

      logger.info(`Batch insert progress`, {
        table: tableName,
        inserted: totalInserted,
        total: records.length,
        progress: `${((totalInserted / records.length) * 100).toFixed(1)}%`,
      });
    }

    return totalInserted;
  }

  /**
   * Execute a query within a transaction context
   * 
   * @param client Transaction client
   * @param text SQL query text
   * @param params Query parameters
   * @returns Query result
   */
  protected async transactionQuery<T extends QueryResultRow = any>(
    client: PoolClient,
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      logger.debug('Executing transaction query', { text, params });
      const result = await client.query<T>(text, params);
      const duration = Date.now() - start;
      logger.debug('Transaction query completed', {
        duration,
        rowCount: result.rowCount,
      });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Transaction query failed', {
        text,
        params,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if a record exists by ID
   * 
   * @param tableName Table name
   * @param idColumn ID column name
   * @param id ID value
   * @returns True if record exists
   */
  protected async exists(
    tableName: string,
    idColumn: string,
    id: any
  ): Promise<boolean> {
    const result = await this.query(
      `SELECT EXISTS(SELECT 1 FROM ${tableName} WHERE ${idColumn} = $1)`,
      [id]
    );
    return result.rows[0].exists;
  }

  /**
   * Get count of records matching a condition
   * 
   * @param tableName Table name
   * @param whereClause WHERE clause (without WHERE keyword)
   * @param params Query parameters
   * @returns Record count
   */
  protected async count(
    tableName: string,
    whereClause?: string,
    params?: any[]
  ): Promise<number> {
    const where = whereClause ? `WHERE ${whereClause}` : '';
    const result = await this.query(
      `SELECT COUNT(*) FROM ${tableName} ${where}`,
      params
    );
    return parseInt(result.rows[0].count, 10);
  }
}
