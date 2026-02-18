import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import { getDbPool } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MigrationRunner {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(): Promise<void> {
    try {
      logger.info('Starting database migrations...');

      // Ensure migrations table exists
      await this.ensureMigrationsTable();

      // Get applied migrations
      const appliedMigrations = await this.getAppliedMigrations();
      logger.info(`Applied migrations: ${appliedMigrations.join(', ') || 'none'}`);

      // Get migration files
      const migrationsDir = path.join(__dirname, '../../migrations');
      const files = await fs.readdir(migrationsDir);
      const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();

      // Run pending migrations
      for (const file of sqlFiles) {
        const version = this.extractVersion(file);
        
        if (!appliedMigrations.includes(version)) {
          await this.runMigration(file, version, migrationsDir);
        } else {
          logger.info(`Migration ${file} already applied, skipping`);
        }
      }

      logger.info('All migrations completed successfully');
    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    }
  }

  /**
   * Run seed files
   */
  async runSeeds(): Promise<void> {
    try {
      logger.info('Starting database seeding...');

      const seedsDir = path.join(__dirname, '../../seeds');
      const files = await fs.readdir(seedsDir);
      const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();

      for (const file of sqlFiles) {
        logger.info(`Running seed: ${file}`);
        const filePath = path.join(seedsDir, file);
        const sql = await fs.readFile(filePath, 'utf-8');
        
        await this.pool.query(sql);
        logger.info(`Seed ${file} completed`);
      }

      logger.info('All seeds completed successfully');
    } catch (error) {
      logger.error('Seeding failed:', error);
      throw error;
    }
  }

  private async ensureMigrationsTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await this.pool.query(query);
  }

  private async getAppliedMigrations(): Promise<number[]> {
    const result = await this.pool.query(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    return result.rows.map((row) => row.version);
  }

  private extractVersion(filename: string): number {
    const match = filename.match(/^(\d+)_/);
    if (!match) {
      throw new Error(`Invalid migration filename: ${filename}`);
    }
    return parseInt(match[1], 10);
  }

  private async runMigration(
    file: string,
    version: number,
    migrationsDir: string
  ): Promise<void> {
    logger.info(`Running migration: ${file}`);
    
    const filePath = path.join(migrationsDir, file);
    const sql = await fs.readFile(filePath, 'utf-8');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      
      logger.info(`Migration ${file} completed successfully`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Migration ${file} failed:`, error);
      throw error;
    } finally {
      client.release();
    }
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = getDbPool();
  const runner = new MigrationRunner(pool);
  
  const command = process.argv[2];

  if (command === 'migrate') {
    runner
      .runMigrations()
      .then(() => {
        logger.info('Migration complete');
        process.exit(0);
      })
      .catch((error) => {
        logger.error('Migration failed:', error);
        process.exit(1);
      });
  } else if (command === 'seed') {
    runner
      .runSeeds()
      .then(() => {
        logger.info('Seeding complete');
        process.exit(0);
      })
      .catch((error) => {
        logger.error('Seeding failed:', error);
        process.exit(1);
      });
  } else {
    logger.error('Unknown command. Use: migrate or seed');
    process.exit(1);
  }
}
