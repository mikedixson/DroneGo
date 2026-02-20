// Test database connection and check applied migrations
import { getDbPool } from './src/lib/db.js';

const pool = getDbPool();

async function checkMigrations() {
  try {
    console.log('Connecting to database...');
    
    // Test connection
    const result = await pool.query('SELECT NOW()');
    console.log('✓ Database connected:', result.rows[0].now);
    
    // Check if schema_migrations table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'schema_migrations'
      );
    `);
    
    if (tableCheck.rows[0].exists) {
      console.log('✓ schema_migrations table exists');
      
      // Get applied migrations
      const migrations = await pool.query(`
        SELECT version, applied_at 
        FROM schema_migrations 
        ORDER BY version
      `);
      
      console.log(`\n✓ Applied ${migrations.rows.length} migrations:`);
      migrations.rows.forEach(row => {
        console.log(`  - Migration ${row.version}: ${row.applied_at}`);
      });
    } else {
      console.log('✗ schema_migrations table does not exist');
    }
    
    await pool.end();
  } catch (error) {
    console.error('✗ Error:', error.message);
    if (error.code) {
      console.error('  Error code:', error.code);
    }
    process.exit(1);
  }
}

checkMigrations();
