import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { config, validateConfig } from './lib/config.js';
import { logger, httpLogger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './lib/errorHandler.js';
import { testDbConnection } from './lib/db.js';
import { getHealth, getReadiness, getLiveness } from './api/health.js';
import { zonesRouter } from './api/zones.js';
import { locationRouter } from './api/location.js';
import { airspaceRouter } from './api/airspace.js';

/**
 * Create and configure Express application
 */
export function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(helmet());

  // CORS configuration
  app.use(
    cors({
      origin: config.cors.origin,
      credentials: config.cors.credentials,
    })
  );

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // HTTP request logging
  app.use(httpLogger);

  // Health check routes (no /api prefix for load balancers)
  app.get('/health', getHealth);
  app.get('/health/ready', getReadiness);
  app.get('/health/live', getLiveness);

  // API routes
  app.use('/api/v1/zones', zonesRouter);
  app.use('/api/v1/location', locationRouter);
  app.use('/api/v1/airspace', airspaceRouter);

  // 404 handler (must be after all routes)
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}

/**
 * Start server
 */
export async function startServer(): Promise<void> {
  try {
    // Validate configuration
    validateConfig();
    logger.info('Configuration validated');

    // Test database connection
    logger.info('About to test database connection...');
    const dbConnected = await testDbConnection();
    logger.info(`Database connection test completed: ${dbConnected}`);
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }
    logger.info('Database connection successful');

    // Create Express app
    const app = createApp();

    // Start server
    app.listen(config.port, config.host, () => {
      logger.info(`Server started`, {
        environment: config.env,
        host: config.host,
        port: config.port,
        url: `http://${config.host}:${config.port}`,
      });

      logger.info('Available endpoints:', {
        health: '/health',
        readiness: '/health/ready',
        liveness: '/health/live',
        zones: '/api/v1/zones',
        zoneDetail: '/api/v1/zones/:zoneId',
        locationCheck: '/api/v1/location/check',
        airspace: '/api/v1/airspace',
        airspaceDetail: '/api/v1/airspace/:airspaceId',
      });
    });
  } catch (error) {
    logger.error('Server startup failed:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start server if this file is run directly
const currentFile = fileURLToPath(import.meta.url);
const mainFile = process.argv[1];

if (currentFile === mainFile) {
  startServer().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}
