// Check heritage site import status
import { getDbPool } from './src/lib/db.js';

const pool = getDbPool();

async function checkImportStatus() {
  try {
    // Count heritage sites by organization
    const heritageCount = await pool.query(`
      SELECT 
        managing_organization,
        COUNT(*) as count,
        COUNT(DISTINCT data_source_id) as source_count
      FROM property_restrictions 
      WHERE restriction_category = 'HERITAGE_SITE'
      GROUP BY managing_organization
      ORDER BY count DESC
    `);
    
    console.log('\n=== Heritage Site Import Status ===\n');
    console.log('Organization                | Count  | Sources');
    console.log('-------------------------------------------');
    
    let total = 0;
    heritageCount.rows.forEach(row => {
      console.log(`${row.managing_organization.padEnd(27)} | ${String(row.count).padStart(6)} | ${row.source_count}`);
      total += parseInt(row.count);
    });
    
    console.log('-------------------------------------------');
    console.log(`TOTAL                       | ${String(total).padStart(6)}`);
    
    // Check simplified geometries
    const simplifiedCheck = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(geometry_simplified_low) as has_low,
        COUNT(geometry_simplified_medium) as has_medium
      FROM property_restrictions 
      WHERE restriction_category = 'HERITAGE_SITE'
    `);
    
    console.log('\n=== Simplified Geometry Status ===\n');
    console.log(`Total records: ${simplifiedCheck.rows[0].total}`);
    console.log(`With low detail: ${simplifiedCheck.rows[0].has_low}`);
    console.log(`With medium detail: ${simplifiedCheck.rows[0].has_medium}`);
    
    // Check quarantined records
    const quarantineCheck = await pool.query(`
      SELECT 
        error_type,
        COUNT(*) as count
      FROM heritage_sites_import_errors
      GROUP BY error_type
      ORDER BY count DESC
    `);
    
    if (quarantineCheck.rows.length > 0) {
      console.log('\n=== Quarantined Records ===\n');
      console.log('Error Type          | Count');
      console.log('--------------------------------');
      quarantineCheck.rows.forEach(row => {
        console.log(`${row.error_type.padEnd(19)} | ${row.count}`);
      });
    }
    
    // Check data source health
    const healthCheck = await pool.query(`
      SELECT 
        authority_name,
        health_status,
        last_successful_import,
        consecutive_failure_count,
        success_count_7day,
        failure_count_7day
      FROM data_sources
      WHERE 'heritage-site' = ANY(data_type_provided)
      ORDER BY authority_name
    `);
    
    if (healthCheck.rows.length > 0) {
      console.log('\n=== Data Source Health ===\n');
      healthCheck.rows.forEach(row => {
        console.log(`Source: ${row.authority_name}`);
        console.log(`  Status: ${row.health_status || 'unknown'}`);
        console.log(`  Last Success: ${row.last_successful_import || 'never'}`);
        console.log(`  Failures: ${row.consecutive_failure_count || 0}`);
        console.log(`  7-day: ${row.success_count_7day || 0} success, ${row.failure_count_7day || 0} failures`);
        console.log('');
      });
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkImportStatus();
