import { PropertyRestriction } from '../models/PropertyRestriction.js';
import { DataSource } from '../models/DataSource.js';
import { getDbPool } from '../lib/db.js';
import { logger } from '../lib/logger.js';

/**
 * Test Script: Insert Hindhead Common and Devil's Punch Bowl
 * 
 * This script manually inserts the Hindhead Common National Trust property
 * for testing purposes without requiring the full import.
 * 
 * Location: 51.1156° N, -0.7237° E (Surrey, England)
 */

async function main() {
  logger.info('========================================');
  logger.info('Hindhead Common Test Data Insert');
  logger.info('========================================');

  const pool = getDbPool();

  try {
    // Test database connection
    await pool.query('SELECT 1');
    logger.info('Database connection successful');

    // Instantiate DataSource model
    const dataSourceModel = new DataSource();

    // Find or create National Trust data source
    let dataSource = await dataSourceModel.findByName('National Trust');

    if (!dataSource) {
      logger.info('Creating National Trust data source...');
      dataSource = await dataSourceModel.create({
        authority_name: 'National Trust',
        data_type_provided: ['property-restrictions', 'heritage-site'],
        reliability_level: 'official-secondary',
        data_url: 'https://www.nationaltrust.org.uk/',
        sync_frequency: 'Weekly',
        attribution: 'Contains National Trust data © The National Trust',
        license: 'Open Government Licence v3.0',
      });
      logger.info(`Created data source: ${dataSource.source_id}`);
    } else {
      logger.info(`Using existing data source: ${dataSource.source_id}`);
    }

    // Check if Hindhead Common already exists
    const existingProperties = await pool.query(
      `SELECT property_id, property_name FROM property_restrictions 
       WHERE property_name ILIKE '%hindhead%'`
    );

    if (existingProperties.rows.length > 0) {
      logger.info('Hindhead Common already exists in database:');
      existingProperties.rows.forEach((row) => {
        logger.info(`  - ${row.property_name} (ID: ${row.property_id})`);
      });
      logger.info('Skipping insert. Delete existing records to re-insert.');
      process.exit(0);
    }

    // Create approximate boundary for Hindhead Common and Devil's Punch Bowl
    // This covers the main National Trust area including SSSI designation
    // Organic polygon that follows the terrain rather than a simple square
    const hindheadGeometry = {
      type: 'Polygon',
      coordinates: [[
        [-0.7320, 51.1220],
        [-0.7280, 51.1235],
        [-0.7240, 51.1240],
        [-0.7200, 51.1235],
        [-0.7165, 51.1220],
        [-0.7140, 51.1195],
        [-0.7130, 51.1170],
        [-0.7125, 51.1140],
        [-0.7130, 51.1110],
        [-0.7145, 51.1085],
        [-0.7170, 51.1070],
        [-0.7200, 51.1060],
        [-0.7235, 51.1055],
        [-0.7270, 51.1060],
        [-0.7300, 51.1070],
        [-0.7325, 51.1085],
        [-0.7340, 51.1105],
        [-0.7350, 51.1130],
        [-0.7345, 51.1155],
        [-0.7335, 51.1180],
        [-0.7320, 51.1200],
        [-0.7320, 51.1220]
      ]]
    };

    logger.info('Inserting Hindhead Common and the Devil\'s Punch Bowl...');

    const property = await PropertyRestriction.create({
      property_name: 'Hindhead Common and the Devil\'s Punch Bowl',
      managing_organization: 'National Trust',
      geometry: hindheadGeometry,
      policy_text:
        'National Trust property with open public access. This Site of Special Scientific Interest (SSSI) includes heathland and woodlands of national importance. Drone flights are permitted with responsible flying practices: maintain safe distance from wildlife, visitors, and SSSI protected areas; fly below 120m altitude; avoid disturbance to ground-nesting birds (March-August); respect visitor privacy; comply with CAA regulations. The Devil\'s Punch Bowl is a 282-hectare landscape managed for conservation. For commercial filming, contact the property team.',
      contact_info: 'hindheadcommons@nationaltrust.org.uk',
      policy_effective_date: new Date('2024-01-01'),
      data_source_id: dataSource.source_id,
    });

    logger.info('✅ Successfully inserted Hindhead Common');
    logger.info(`   Property ID: ${property.property_id}`);
    logger.info(`   Property Name: ${property.property_name}`);
    logger.info(`   Managing Organization: ${property.managing_organization}`);
    logger.info(`   Data Source: ${dataSource.authority_name}`);

    // Test spatial query at center coordinates
    logger.info('');
    logger.info('Testing spatial query at 51.1156, -0.7237 (center)...');
    const testResults = await PropertyRestriction.findByCoordinates(-0.7237, 51.1156);
    
    if (testResults.length > 0) {
      logger.info(`✅ Spatial query successful! Found ${testResults.length} property(ies):`);
      testResults.forEach((prop) => {
        logger.info(`   - ${prop.property_name} (${prop.managing_organization})`);
      });
    } else {
      logger.warn('⚠️  Spatial query returned no results - check geometry');
    }

    // Update data source sync timestamp
    await dataSourceModel.updateSyncTimestamp(dataSource.source_id);

    logger.info('');
    logger.info('========================================');
    logger.info('Test data insert completed successfully');
    logger.info('========================================');
    logger.info('');
    logger.info('Next steps:');
    logger.info('1. Open browser to http://localhost:5173');
    logger.info('2. Navigate to Hindhead Common (51.1156, -0.7237)');
    logger.info('3. Click "Check Flight Status" or click on the map');
    logger.info('4. Verify amber "CHECK PROPERTY POLICY" status appears');
    logger.info('5. Verify property restrictions layer shows amber polygon');

    process.exit(0);
  } catch (error) {
    logger.error('Failed to insert test data', { error });
    process.exit(1);
  }
}

// Run script if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Unhandled error in test script', { error });
    process.exit(1);
  });
}

export { main };
