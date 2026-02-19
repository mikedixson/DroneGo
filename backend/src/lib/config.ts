import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

/**
 * Application configuration
 */
export const config = {
  // Environment
  env: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',

  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',

  // Database
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'dronego',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    poolMax: parseInt(process.env.DB_POOL_MAX || '20', 10),
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000', 10),
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: process.env.CORS_CREDENTIALS === 'true',
  },

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
    max: parseInt(process.env.RATE_LIMIT_MAX || '300', 10), // 300 requests per minute (5/sec sustained)
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  // Data sync
  dataSync: {
    caaEndpoint: process.env.CAA_DATA_ENDPOINT || '',
    natsEndpoint: process.env.NATS_DATA_ENDPOINT || '',
    notamEndpoint: process.env.NOTAM_DATA_ENDPOINT || '',
    syncInterval: parseInt(process.env.DATA_SYNC_INTERVAL || '86400000', 10), // 24 hours
  },
} as const;

/**
 * Validate required configuration
 */
export function validateConfig(): void {
  const required: Array<keyof typeof config.db> = ['host', 'database', 'user'];
  const missing: string[] = [];

  for (const key of required) {
    if (!config.db[key]) {
      missing.push(`DB_${key.toUpperCase()}`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Please copy .env.example to .env and configure your database settings.'
    );
  }

  if (config.isProduction && config.jwt.secret === 'your-secret-key-change-in-production') {
    throw new Error('JWT_SECRET must be set in production environment');
  }
}
