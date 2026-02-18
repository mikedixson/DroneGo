import { Request, Response } from 'express';
import { getDbPool } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { asyncHandler } from '../lib/errorHandler.js';

/**
 * GET /health
 * Health check endpoint for monitoring
 */
export const getHealth = asyncHandler(async (req: Request, res: Response) => {
  const healthcheck = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    database: 'unknown',
  };

  try {
    // Test database connection
    const pool = getDbPool();
    const result = await pool.query('SELECT NOW(), COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = \'public\'');
    
    healthcheck.database = 'connected';
    
    res.status(200).json({
      ...healthcheck,
      database: {
        status: 'connected',
        timestamp: result.rows[0].now,
        tables: parseInt(result.rows[0].table_count, 10),
      },
    });
  } catch (error) {
    logger.error('Health check database test failed:', error);
    
    healthcheck.database = 'error';
    healthcheck.status = 'degraded';
    
    res.status(503).json({
      ...healthcheck,
      database: {
        status: 'error',
        error: error instanceof Error ? error.message : 'Database connection failed',
      },
    });
  }
});

/**
 * GET /health/ready
 * Readiness probe for Kubernetes/orchestration
 */
export const getReadiness = asyncHandler(async (req: Request, res: Response) => {
  try {
    const pool = getDbPool();
    await pool.query('SELECT 1');
    
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    
    res.status(503).json({
      status: 'not ready',
      error: error instanceof Error ? error.message : 'Service not ready',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /health/live
 * Liveness probe for Kubernetes/orchestration
 */
export const getLiveness = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});
