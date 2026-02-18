import { Pool, PoolConfig } from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';

let pool: Pool | null = null;

/**
 * Get or create database connection pool
 */
export function getDbPool(): Pool {
  if (!pool) {
    const poolConfig: PoolConfig = {
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      max: config.db.poolMax,
      idleTimeoutMillis: config.db.idleTimeout,
      connectionTimeoutMillis: config.db.connectionTimeout,
    };

    pool = new Pool(poolConfig);

    pool.on('error', (err) => {
      logger.error('Unexpected database pool error:', err);
    });

    pool.on('connect', () => {
      logger.debug('New database connection established');
    });

    logger.info('Database connection pool initialized', {
      host: config.db.host,
      database: config.db.database,
      maxConnections: config.db.poolMax,
    });
  }

  return pool;
}

/**
 * Close database connection pool
 */
export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection pool closed');
  }
}

/**
 * Test database connection
 */
export async function testDbConnection(): Promise<boolean> {
  try {
    const testPool = getDbPool();
    const result = await testPool.query('SELECT NOW()');
    logger.info('Database connection test successful', {
      timestamp: result.rows[0].now,
    });
    return true;
  } catch (error) {
    logger.error('Database connection test failed:', error);
    return false;
  }
}
