import { Pool } from 'pg';

/**
 * Backfill geometry_simplified_low and geometry_simplified_medium for all property_restrictions
 * where these fields are NULL. Uses PostGIS ST_SimplifyPreserveTopology.
 */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://dronego:dronego@localhost:5432/dronego',
});

async function backfillSimplifiedGeometries() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT property_restriction_id FROM property_restrictions
       WHERE geometry_simplified_low IS NULL OR geometry_simplified_medium IS NULL`
    );
    if (res.rows.length === 0) {
      console.log('All records already have simplified geometries.');
      return;
    }
    console.log(`Backfilling ${res.rows.length} records...`);
    for (const row of res.rows) {
      const { property_restriction_id } = row;
      // Update with simplified geometries
      await client.query(
        `UPDATE property_restrictions
         SET geometry_simplified_low = ST_Multi(ST_SimplifyPreserveTopology(geometry, 0.0001)),
             geometry_simplified_medium = ST_Multi(ST_SimplifyPreserveTopology(geometry, 0.00005))
         WHERE property_restriction_id = $1`,
        [property_restriction_id]
      );
      console.log(`Updated: ${property_restriction_id}`);
    }
    console.log('Backfill complete.');
  } catch (err) {
    console.error('Error during backfill:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

backfillSimplifiedGeometries();
