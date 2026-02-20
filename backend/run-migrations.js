// Direct migration runner
import { getDbPool } from './src/lib/db.js';
import { MigrationRunner } from './src/lib/migrations.js';

const pool = getDbPool();
const runner = new MigrationRunner(pool);

console.log('Starting migrations...');

runner
  .runMigrations()
  .then(() => {
    console.log('✓ Migrations complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  });
