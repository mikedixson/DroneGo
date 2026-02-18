import { Pool, QueryResult } from 'pg';
import { getDbPool } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export interface BaseModelAttributes {
  created_at?: Date;
  last_updated?: Date;
}

/**
 * Base model class with common database operations
 */
export abstract class BaseModel<T extends BaseModelAttributes> {
  protected pool: Pool;
  protected abstract tableName: string;
  protected abstract primaryKey: string;

  constructor() {
    this.pool = getDbPool();
  }

  /**
   * Find record by primary key
   */
  async findById(id: string | number): Promise<T | null> {
    const query = `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = $1`;
    const result = await this.pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]);
  }

  /**
   * Find all records with optional conditions
   */
  async findAll(conditions?: Record<string, any>, limit?: number): Promise<T[]> {
    let query = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];

    if (conditions && Object.keys(conditions).length > 0) {
      const whereClauses = Object.keys(conditions).map((key, index) => {
        params.push(conditions[key]);
        return `${key} = $${index + 1}`;
      });
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    const result = await this.pool.query(query, params);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Count records with optional conditions
   */
  async count(conditions?: Record<string, any>): Promise<number> {
    let query = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const params: any[] = [];

    if (conditions && Object.keys(conditions).length > 0) {
      const whereClauses = Object.keys(conditions).map((key, index) => {
        params.push(conditions[key]);
        return `${key} = $${index + 1}`;
      });
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const result = await this.pool.query(query, params);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Execute raw query
   */
  async query(sql: string, params?: any[]): Promise<QueryResult> {
    logger.debug('Executing query:', { sql, params });
    return this.pool.query(sql, params);
  }

  /**
   * Create new record
   */
  async create(data: Partial<T>): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');

    const query = `
      INSERT INTO ${this.tableName} (${keys.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    logger.info(`Created ${this.tableName} record`, { id: result.rows[0][this.primaryKey] });
    
    return this.mapRow(result.rows[0]);
  }

  /**
   * Update record by primary key
   */
  async update(id: string | number, data: Partial<T>): Promise<T | null> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClauses = keys.map((key, index) => `${key} = $${index + 1}`).join(', ');

    const query = `
      UPDATE ${this.tableName}
      SET ${setClauses}, last_updated = CURRENT_TIMESTAMP
      WHERE ${this.primaryKey} = $${keys.length + 1}
      RETURNING *
    `;

    const result = await this.pool.query(query, [...values, id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    logger.info(`Updated ${this.tableName} record`, { id });
    return this.mapRow(result.rows[0]);
  }

  /**
   * Delete record by primary key
   */
  async delete(id: string | number): Promise<boolean> {
    const query = `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = $1`;
    const result = await this.pool.query(query, [id]);
    
    logger.info(`Deleted ${this.tableName} record`, { id, deleted: result.rowCount });
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Map database row to model instance
   * Override this method to transform snake_case to camelCase or add computed properties
   */
  protected mapRow(row: any): T {
    return row as T;
  }
}
