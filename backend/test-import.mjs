import { PropertyRestriction } from './src/models/PropertyRestriction.js';
import { getDbPool } from './src/lib/db.js';

console.log('Testing database connection...');

async function test() {
  try {
    const pool = getDbPool();
    const result = await pool.query('SELECT COUNT(*) FROM property_restrictions');
    console.log('✅ Database connection successful');
    console.log(`Current property restrictions: ${result.rows[0].count}`);
    
    console.log('\nStarting National Trust import...');
    const { main: importNT } = await import('./src/scripts/import-national-trust.js');
    await importNT();
    
    console.log('\nAll done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

test();
