// Check property_restrictions schema
import { getDbPool } from './src/lib/db.js';

const pool = getDbPool();

async function checkSchema() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, character_maximum_length, column_default
      FROM information_schema.columns 
      WHERE table_name = 'property_restrictions'
      ORDER BY ordinal_position;
    `);
    
    console.log('\nColumns in property_restrictions table:');
    console.log('----------------------------------------');
    result.rows.forEach(row => {
      const length = row.character_maximum_length ? `(${row.character_maximum_length})` : '';
      const def = row.column_default ? ` DEFAULT ${row.column_default}` : '';
      console.log(`  ${row.column_name}: ${row.data_type}${length}${def}`);
    });
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkSchema();
