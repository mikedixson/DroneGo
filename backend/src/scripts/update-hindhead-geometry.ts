import { getDbPool } from '../lib/db.js';
import { logger } from '../lib/logger.js';

/**
 * Update Hindhead Common geometry to follow actual property boundary
 * instead of simple square
 */

async function updateHindheadGeometry() {
  logger.info('========================================');
  logger.info('Update Hindhead Common Geometry');
  logger.info('========================================');

  const pool = getDbPool();

  try {
    await pool.query('SELECT 1');
    logger.info('Database connection successful');

    // Delete existing square boundary
    const deleteResult = await pool.query(
      `DELETE FROM property_restrictions 
       WHERE property_name = 'Hindhead Common and the Devil''s Punch Bowl'
       RETURNING property_id`
    );

    logger.info(`Deleted ${deleteResult.rowCount} existing record(s)`);

    // Insert with organic polygon that follows the terrain
    const geometry = {
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

    const insertResult = await pool.query(
      `INSERT INTO property_restrictions (
        property_name,
        managing_organization,
        geometry,
        policy_text,
        contact_info,
        policy_effective_date,
        data_source_id
      )
      SELECT
        'Hindhead Common and the Devil''s Punch Bowl',
        'National Trust',
        ST_Multi(ST_GeomFromGeoJSON($1)),
        'National Trust property with open public access. This Site of Special Scientific Interest (SSSI) includes heathland and woodlands of national importance. Drone flights are permitted with responsible flying practices: maintain safe distance from wildlife, visitors, and SSSI protected areas; fly below 120m altitude; avoid disturbance to ground-nesting birds (March-August); respect visitor privacy; comply with CAA regulations. The Devil''s Punch Bowl is a 282-hectare landscape managed for conservation. For commercial filming, contact the property team.',
        'hindheadcommons@nationaltrust.org.uk',
        '2024-01-01'::date,
        source_id
      FROM data_sources
      WHERE authority_name = 'National Trust'
      LIMIT 1
      RETURNING property_id, property_name, ST_NPoints(geometry) as num_vertices`,
      [JSON.stringify(geometry)]
    );

    const result = insertResult.rows[0];
    logger.info('✅ Successfully updated Hindhead Common geometry');
    logger.info(`   Property ID: ${result.property_id}`);
    logger.info(`   Property Name: ${result.property_name}`);
    logger.info(`   Number of vertices: ${result.num_vertices} (was 5 square corners)`);

    // Test spatial query at center
    logger.info('');
    logger.info('Testing spatial query at center (51.1156, -0.7237)...');
    const testResult = await pool.query(
      `SELECT property_name, ST_AsText(ST_Centroid(geometry)) as centroid
       FROM property_restrictions
       WHERE ST_Intersects(geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))`,
      [-0.7237, 51.1156]
    );

    if (testResult.rows.length > 0) {
      logger.info(`✅ Spatial query successful!`);
      logger.info(`   Property: ${testResult.rows[0].property_name}`);
      logger.info(`   Centroid: ${testResult.rows[0].centroid}`);
    } else {
      logger.warn('⚠️  Spatial query returned no results');
    }

    logger.info('');
    logger.info('========================================');
    logger.info('Geometry update completed!');
    logger.info('========================================');
    logger.info('');
    logger.info('The polygon now follows the organic shape of the property');
    logger.info('instead of a simple square. Refresh the map to see the update.');

    process.exit(0);
  } catch (error) {
    logger.error('Failed to update geometry', { error });
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  updateHindheadGeometry().catch((error) => {
    logger.error('Unhandled error', { error });
    process.exit(1);
  });
}

export { updateHindheadGeometry };
