// Verify all schema changes from migrations
import { getDbPool } from './src/lib/db.js';

const pool = getDbPool();

async function verifySchema() {
  try {
    console.log('='.repeat(60));
    console.log('SCHEMA VERIFICATION REPORT');
    console.log('='.repeat(60));
    
    // 1. Check extensions (Migration 000)
    console.log('\n1. PostgreSQL Extensions (Migration 000):');
    console.log('-'.repeat(60));
    const extensions = await pool.query(`
      SELECT extname, extversion 
      FROM pg_extension 
      WHERE extname IN ('postgis', 'pg_trgm')
      ORDER BY extname;
    `);
    
    extensions.rows.forEach(row => {
      console.log(`  ✓ ${row.extname} v${row.extversion}`);
    });
    
    if (extensions.rows.length < 2) {
      console.log('  ✗ Missing extensions!');
    }
    
    // 2. Check property_restrictions columns (Migration 007)
    console.log('\n2. property_restrictions Table (Migration 007):');
    console.log('-'.repeat(60));
    const prColumns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'property_restrictions'
      AND column_name IN (
        'property_restriction_id',
        'geometry_simplified_low',
        'geometry_simplified_medium',
        'superseded_by',
        'is_primary',
        'restriction_category'
      )
      ORDER BY column_name;
    `);
    
    const expectedColumns = [
      'property_restriction_id',
      'geometry_simplified_low', 
      'geometry_simplified_medium',
      'superseded_by',
      'is_primary',
      'restriction_category'
    ];
    
    const foundColumns = prColumns.rows.map(r => r.column_name);
    expectedColumns.forEach(col => {
      if (foundColumns.includes(col)) {
        console.log(`  ✓ ${col}`);
      } else {
        console.log(`  ✗ MISSING: ${col}`);
      }
    });
    
    // 3. Check heritage_sites_import_errors table (Migration 005)
    console.log('\n3. heritage_sites_import_errors Table (Migration 005):');
    console.log('-'.repeat(60));
    const errorTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'heritage_sites_import_errors'
      );
    `);
    
    if (errorTableCheck.rows[0].exists) {
      console.log('  ✓ Table exists');
      
      const errorColumns = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'heritage_sites_import_errors'
        ORDER BY ordinal_position;
      `);
      
      console.log(`  ✓ ${errorColumns.rows.length} columns defined`);
      errorColumns.rows.forEach(row => {
        console.log(`    - ${row.column_name}`);
      });
    } else {
      console.log('  ✗ Table does not exist');
    }
    
    // 4. Check data_sources health tracking columns (Migration 006)
    console.log('\n4. data_sources Health Tracking (Migration 006):');
    console.log('-'.repeat(60));
    const dsColumns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'data_sources'
      AND column_name IN (
        'health_status',
        'last_import_attempt',
        'last_successful_import',
        'last_error_timestamp',
        'last_error_message',
        'consecutive_failure_count',
        'success_count_7day',
        'failure_count_7day',
        'success_rate_7day'
      )
      ORDER BY column_name;
    `);
    
    const expectedDsColumns = [
      'health_status',
      'last_import_attempt',
      'last_successful_import',
      'last_error_timestamp',
      'last_error_message',
      'consecutive_failure_count',
      'success_count_7day',
      'failure_count_7day',
      'success_rate_7day'
    ];
    
    const foundDsColumns = dsColumns.rows.map(r => r.column_name);
    expectedDsColumns.forEach(col => {
      if (foundDsColumns.includes(col)) {
        console.log(`  ✓ ${col}`);
      } else {
        console.log(`  ✗ MISSING: ${col}`);
      }
    });
    
    // 5. Check indexes
    console.log('\n5. Indexes:');
    console.log('-'.repeat(60));
    const indexes = await pool.query(`
      SELECT 
        schemaname,
        tablename,
        indexname
      FROM pg_indexes
      WHERE tablename IN ('property_restrictions', 'heritage_sites_import_errors', 'data_sources')
      AND indexname LIKE 'idx_%'
      ORDER BY tablename, indexname;
    `);
    
    console.log(`  ✓ ${indexes.rows.length} custom indexes found:`);
    let currentTable = '';
    indexes.rows.forEach(row => {
      if (row.tablename !== currentTable) {
        console.log(`\n    ${row.tablename}:`);
        currentTable = row.tablename;
      }
      console.log(`      - ${row.indexname}`);
    });
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('VERIFICATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`✓ Extensions: ${extensions.rows.length}/2`);
    console.log(`✓ property_restrictions columns: ${foundColumns.length}/${expectedColumns.length}`);
    console.log(`✓ heritage_sites_import_errors: ${errorTableCheck.rows[0].exists ? 'EXISTS' : 'MISSING'}`);
    console.log(`✓ data_sources health columns: ${foundDsColumns.length}/${expectedDsColumns.length}`);
    console.log(`✓ Custom indexes: ${indexes.rows.length}`);
    
    await pool.end();
  } catch (error) {
    console.error('\n✗ Verification failed:', error.message);
    process.exit(1);
  }
}

verifySchema();
