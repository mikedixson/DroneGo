// Fix migration 004 tracking issue
import { getDbPool } from './src/lib/db.js';

const pool = getDbPool();

async function fixMigration004() {
  try {
    console.log('Checking migration 004 status...');
    
    // Check if migration 004 is tracked
    const check = await pool.query(`
      SELECT version FROM schema_migrations WHERE version = 4
    `);
    
    if (check.rows.length > 0) {
      console.log('Migration 004 is already tracked');
    } else {
      console.log('Migration 004 not tracked, adding to schema_migrations...');
      
      await pool.query(`
        INSERT INTO schema_migrations (version, applied_at)
        VALUES (4, NOW())
      `);
      
      console.log('✓ Migration 004 marked as applied');
    }
    
    // Verify
    const result = await pool.query(`
      SELECT version, applied_at FROM schema_migrations ORDER BY version
    `);
    
    console.log('\nAll tracked migrations:');
    result.rows.forEach(row => {
      console.log(`  - Migration ${row.version}: ${row.applied_at}`);
    });
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

fixMigration004();
