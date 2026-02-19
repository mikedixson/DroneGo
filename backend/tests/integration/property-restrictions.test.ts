import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getDbPool } from '../../src/lib/db.js';
import type { Pool } from 'pg';

/**
 * Property Restrictions Integration Tests (T016)
 * 
 * Tests heritage site detection for User Story 1 tri-state flight status.
 * This validates the end-to-end property restriction detection including:
 * - Spatial queries (ST_Intersects)
 * - PropertyRestriction table operations
 * - Real-world coordinate scenarios
 * 
 * SAFETY-CRITICAL: Property advisories must be accurate to prevent
 * unauthorized flights over heritage sites with specific policies.
 * 
 * Test Locations:
 * - Stonehenge (51.1789, -1.8262) - English Heritage Trust
 * - Tower of London (51.5081, -0.0759) - Historic Royal Palaces
 * - Rural location - No property restrictions
 */
describe('Property Restrictions Integration Tests - Heritage Site Detection', () => {
  let pool: Pool;
  let testDataSourceIds: { [key: string]: string } = {};
  let testPropertyIds: string[] = [];

  beforeAll(async () => {
    pool = getDbPool();
    await pool.query('SELECT 1'); // Test connection

    // Create test data sources for heritage organizations
    const ehResult = await pool.query(
      `INSERT INTO data_sources (authority_name, data_type_provided, reliability_level)
       VALUES ('Historic England', ARRAY['heritage-sites'], 'primary-authority')
       RETURNING source_id`
    );
    testDataSourceIds['Historic England'] = ehResult.rows[0].source_id;

    const ntResult = await pool.query(
      `INSERT INTO data_sources (authority_name, data_type_provided, reliability_level)
       VALUES ('National Trust', ARRAY['heritage-sites'], 'official-secondary')
       RETURNING source_id`
    );
    testDataSourceIds['National Trust'] = ntResult.rows[0].source_id;
  });

  afterAll(async () => {
    // Clean up test properties
    if (testPropertyIds.length > 0) {
      await pool.query(
        'DELETE FROM property_restrictions WHERE property_id = ANY($1)',
        [testPropertyIds]
      );
    }
    
    // Clean up test data sources
    const sourceIds = Object.values(testDataSourceIds);
    if (sourceIds.length > 0) {
      await pool.query(
        'DELETE FROM data_sources WHERE source_id = ANY($1)',
        [sourceIds]
      );
    }
  });

  beforeEach(async () => {
    // Clean up between tests
    await pool.query("DELETE FROM property_restrictions WHERE property_name LIKE 'Test%'");
    testPropertyIds = [];
  });

  describe('Stonehenge Detection - English Heritage Trust', () => {
    it('should detect property restriction at Stonehenge coordinates (51.1789, -1.8262)', async () => {
      // Create test Stonehenge property (circle with 500m radius)
      const stonehengeGeometry = {
        type: 'Polygon',
        coordinates: [
          [
            [-1.8362, 51.1839], // NW
            [-1.8362, 51.1739], // SW
            [-1.8162, 51.1739], // SE
            [-1.8162, 51.1839], // NE
            [-1.8362, 51.1839], // Close polygon
          ],
        ],
      };

      const result = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, 
          contact_info, data_source_id
        ) VALUES (
          'Stonehenge', 'English Heritage Trust',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'Drone flights require prior written authorization. Unauthorized flights may result in prosecution.',
          'permissions@english-heritage.org.uk',
          $2
        ) RETURNING property_id`,
        [JSON.stringify(stonehengeGeometry), testDataSourceIds['Historic England']]
      );
      testPropertyIds.push(result.rows[0].property_id);

      // Query for property restriction at Stonehenge center
      const queryResult = await pool.query(
        `SELECT property_name, managing_organization, policy_text, contact_info
         FROM property_restrictions
         WHERE ST_Intersects(geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))`,
        [-1.8262, 51.1789]
      );

      expect(queryResult.rows.length).toBe(1);
      expect(queryResult.rows[0].property_name).toBe('Stonehenge');
      expect(queryResult.rows[0].managing_organization).toBe('English Heritage Trust');
      expect(queryResult.rows[0].policy_text).toContain('prior written authorization');
      expect(queryResult.rows[0].contact_info).toBe('permissions@english-heritage.org.uk');
    });

    it('should NOT detect property restriction outside Stonehenge boundary', async () => {
      // Create test Stonehenge property
      const stonehengeGeometry = {
        type: 'Polygon',
        coordinates: [
          [
            [-1.8362, 51.1839],
            [-1.8362, 51.1739],
            [-1.8162, 51.1739],
            [-1.8162, 51.1839],
            [-1.8362, 51.1839],
          ],
        ],
      };

      const result = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'Stonehenge', 'English Heritage Trust',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'Drone flights require prior written authorization.',
          $2
        ) RETURNING property_id`,
        [JSON.stringify(stonehengeGeometry), testDataSourceIds['Historic England']]
      );
      testPropertyIds.push(result.rows[0].property_id);

      // Query for property restriction 5km away
      const queryResult = await pool.query(
        `SELECT property_name
         FROM property_restrictions
         WHERE ST_Intersects(geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))`,
        [-1.9, 51.2] // Far outside boundary
      );

      expect(queryResult.rows.length).toBe(0);
    });
  });

  describe('Multiple Heritage Sites Detection', () => {
    it('should detect all overlapping property restrictions at coordinates', async () => {
      // Create two overlapping heritage sites (e.g., World Heritage Site + National Trust property)
      const geometry1 = {
        type: 'Polygon',
        coordinates: [
          [
            [-0.08, 51.50],
            [-0.08, 51.51],
            [-0.06, 51.51],
            [-0.06, 51.50],
            [-0.08, 51.50],
          ],
        ],
      };

      const geometry2 = {
        type: 'Polygon',
        coordinates: [
          [
            [-0.075, 51.502],
            [-0.075, 51.508],
            [-0.065, 51.508],
            [-0.065, 51.502],
            [-0.075, 51.502],
          ],
        ],
      };

      const result1 = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'Test World Heritage Site', 'UNESCO',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'World Heritage Site protection applies.',
          $2
        ) RETURNING property_id`,
        [JSON.stringify(geometry1), testDataSourceIds['Historic England']]
      );
      testPropertyIds.push(result1.rows[0].property_id);

      const result2 = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'Test National Trust Property', 'National Trust',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'National Trust property. Drone use restricted.',
          $2
        ) RETURNING property_id`,
        [JSON.stringify(geometry2), testDataSourceIds['National Trust']]
      );
      testPropertyIds.push(result2.rows[0].property_id);

      // Query at overlapping coordinates
      const queryResult = await pool.query(
        `SELECT property_name, managing_organization
         FROM property_restrictions
         WHERE ST_Intersects(geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))
         ORDER BY property_name`,
        [-0.07, 51.505]
      );

      expect(queryResult.rows.length).toBe(2);
      expect(queryResult.rows[0].property_name).toBe('Test National Trust Property');
      expect(queryResult.rows[1].property_name).toBe('Test World Heritage Site');
    });
  });

  describe('Hindhead Common and Devil\'s Punch Bowl - National Trust', () => {
    it('should detect property restriction at Hindhead Common (51.1156, -0.7237)', async () => {
      // Create test Hindhead Common property with organic polygon
      // This follows the approximate shape of the National Trust property
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

      const result = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, 
          contact_info, data_source_id
        ) VALUES (
          'Hindhead Common and the Devil''s Punch Bowl', 'National Trust',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'National Trust property with open public access. Site includes SSSI (Site of Special Scientific Interest) areas. Drone flights are permitted with responsible flying practices. Please maintain a safe distance from wildlife, visitors, and SSSI protected areas. Follow the National Trust Drone Policy: fly below 120m, avoid disturbance, respect privacy, and comply with CAA regulations.',
          'enquiries@nationaltrust.org.uk',
          $2
        ) RETURNING property_id`,
        [JSON.stringify(hindheadGeometry), testDataSourceIds['National Trust']]
      );
      testPropertyIds.push(result.rows[0].property_id);

      // Query for property restriction at Hindhead center
      const queryResult = await pool.query(
        `SELECT property_name, managing_organization, policy_text, contact_info
         FROM property_restrictions
         WHERE ST_Intersects(geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))`,
        [-0.7237, 51.1156]
      );

      expect(queryResult.rows.length).toBe(1);
      expect(queryResult.rows[0].property_name).toBe('Hindhead Common and the Devil\'s Punch Bowl');
      expect(queryResult.rows[0].managing_organization).toBe('National Trust');
      expect(queryResult.rows[0].policy_text).toContain('SSSI');
      expect(queryResult.rows[0].policy_text).toContain('National Trust Drone Policy');
      expect(queryResult.rows[0].contact_info).toBe('enquiries@nationaltrust.org.uk');
    });

    it('should NOT detect property restriction outside Hindhead boundary', async () => {
      // Create test Hindhead property with organic polygon
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

      const result = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'Hindhead Common and the Devil''s Punch Bowl', 'National Trust',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'National Trust property with SSSI areas.',
          $2
        ) RETURNING property_id`,
        [JSON.stringify(hindheadGeometry), testDataSourceIds['National Trust']]
      );
      testPropertyIds.push(result.rows[0].property_id);

      // Query for property restriction 5km away
      const queryResult = await pool.query(
        `SELECT property_name
         FROM property_restrictions
         WHERE ST_Intersects(geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))`,
        [-0.8, 51.2] // Far outside boundary
      );

      expect(queryResult.rows.length).toBe(0);
    });
  });

  describe('Rural Location - No Restrictions', () => {
    it('should return empty results for location without property restrictions', async () => {
      // Query rural location in Scotland (no heritage sites nearby)
      const queryResult = await pool.query(
        `SELECT property_name
         FROM property_restrictions
         WHERE ST_Intersects(geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))`,
        [-3.5, 57.2] // Rural Scotland
      );

      expect(queryResult.rows.length).toBe(0);
    });
  });

  describe('GIST Index Performance', () => {
    it('should use GIST spatial index for property queries', async () => {
      // Create test property
      const geometry = {
        type: 'Polygon',
        coordinates: [
          [
            [-0.1, 51.5],
            [-0.1, 51.6],
            [0.0, 51.6],
            [0.0, 51.5],
            [-0.1, 51.5],
          ],
        ],
      };

      const result = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'Test Index Property', 'Test Organization',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'Test policy',
          $2
        ) RETURNING property_id`,
        [JSON.stringify(geometry), testDataSourceIds['Historic England']]
      );
      testPropertyIds.push(result.rows[0].property_id);

      // Explain query to verify GIST index usage
      const explainResult = await pool.query(
        `EXPLAIN (FORMAT JSON)
         SELECT property_name
         FROM property_restrictions
         WHERE ST_Intersects(geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))`,
        [-0.05, 51.55]
      );

      const plan = JSON.stringify(explainResult.rows[0]);
      expect(plan).toMatch(/idx_property_restrictions_geom|Index.*property_restrictions/i);
    });
  });

  describe('Policy Text Validation', () => {
    it('should enforce policy_text length constraint (<=5000 chars)', async () => {
      const longPolicy = 'x'.repeat(5001);
      const geometry = {
        type: 'Polygon',
        coordinates: [
          [
            [-0.1, 51.5],
            [-0.1, 51.6],
            [0.0, 51.6],
            [0.0, 51.5],
            [-0.1, 51.5],
          ],
        ],
      };

      await expect(async () => {
        await pool.query(
          `INSERT INTO property_restrictions (
            property_name, managing_organization, geometry, policy_text, data_source_id
          ) VALUES (
            'Test Long Policy', 'Test Org',
            ST_Multi(ST_GeomFromGeoJSON($1)),
            $2,
            $3
          )`,
          [JSON.stringify(geometry), longPolicy, testDataSourceIds['Historic England']]
        );
      }).rejects.toThrow();
    });

    it('should accept policy_text at exactly 5000 chars', async () => {
      const maxPolicy = 'x'.repeat(5000);
      const geometry = {
        type: 'Polygon',
        coordinates: [
          [
            [-0.1, 51.5],
            [-0.1, 51.6],
            [0.0, 51.6],
            [0.0, 51.5],
            [-0.1, 51.5],
          ],
        ],
      };

      const result = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'Test Max Policy', 'Test Org',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          $2,
          $3
        ) RETURNING property_id`,
        [JSON.stringify(geometry), maxPolicy, testDataSourceIds['Historic England']]
      );

      testPropertyIds.push(result.rows[0].property_id);
      expect(result.rows[0].property_id).toBeDefined();
    });
  });
});
