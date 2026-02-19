import pg from 'pg';

const pool = new pg.Pool({
  host: 'localhost',
  port: 5432,
  database: 'dronego',
  user: 'dronego',
  password: 'dronego_dev_pass',
});

async function quickUpdate() {
  try {
    console.log('Deleting old geometry...');
    const deleteResult = await pool.query(
      "DELETE FROM property_restrictions WHERE property_name = 'Hindhead Common and the Devil''s Punch Bowl'"
    );
    console.log(`Deleted ${deleteResult.rowCount} record(s)`);

    console.log('Inserting new organic polygon...');
    const geometry = JSON.stringify({
      type: 'Polygon',
      coordinates: [[
        [-0.7320, 51.1220], [-0.7280, 51.1235], [-0.7240, 51.1240],
        [-0.7200, 51.1235], [-0.7165, 51.1220], [-0.7140, 51.1195],
        [-0.7130, 51.1170], [-0.7125, 51.1140], [-0.7130, 51.1110],
        [-0.7145, 51.1085], [-0.7170, 51.1070], [-0.7200, 51.1060],
        [-0.7235, 51.1055], [-0.7270, 51.1060], [-0.7300, 51.1070],
        [-0.7325, 51.1085], [-0.7340, 51.1105], [-0.7350, 51.1130],
        [-0.7345, 51.1155], [-0.7335, 51.1180], [-0.7320, 51.1200],
        [-0.7320, 51.1220]
      ]]
    });

    const insertResult = await pool.query(
      `INSERT INTO property_restrictions (
        property_name, managing_organization, geometry, policy_text,
        contact_info, policy_effective_date, data_source_id
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
      RETURNING property_id, ST_NPoints(geometry) as vertices`,
      [geometry]
    );

    console.log('✅ Success!');
    console.log(`Property ID: ${insertResult.rows[0].property_id}`);
    console.log(`Vertices: ${insertResult.rows[0].vertices} (was 5 for square)`);
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

quickUpdate();
