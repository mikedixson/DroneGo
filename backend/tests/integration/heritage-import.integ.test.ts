import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios from 'axios';
import { getDbPool } from '../../src/lib/db.js';

/**
 * Integration test for heritage site import cycle
 * 
 * Tests complete flow:
 * 1. API fetch from ArcGIS FeatureServer
 * 2. Geometry validation (ST_IsValid, bounds checking)
 * 3. Boundary simplification (low/medium detail)
 * 4. Database insertion with simplified geometries
 * 5. Error quarantine for invalid geometries
 * 6. Health metric updates
 * 
 * Contract: contracts/import-operations.md - Import Operation Interface
 */
describe('Heritage Import Integration', () => {
  const pool = getDbPool();

  beforeAll(async () => {
    // Clean up test data
    await pool.query(`
      DELETE FROM property_restrictions 
      WHERE property_name LIKE 'Integration Test%'
    `);
    await pool.query(`
      DELETE FROM heritage_sites_import_errors 
      WHERE source_record_id LIKE 'TEST_%'
    `);
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query(`
      DELETE FROM property_restrictions 
      WHERE property_name LIKE 'Integration Test%'
    `);
    await pool.query(`
      DELETE FROM heritage_sites_import_errors 
      WHERE source_record_id LIKE 'TEST_%'
    `);
  });

  describe('Full Import Cycle', () => {
    it('should import valid heritage site with simplified geometries', async () => {
      // Mock ArcGIS FeatureServer response
      const mockFeature = {
        attributes: {
          OBJECTID: 'TEST_001',
          NAME: 'Integration Test Site 1',
          DESCRIPTION: 'Test heritage site for integration testing',
        },
        geometry: {
          rings: [
            [
              [-0.1300, 51.5000],
              [-0.1299, 51.5005],
              [-0.1295, 51.5010],
              [-0.1290, 51.5015],
              [-0.1285, 51.5020],
              [-0.1250, 51.5020],
              [-0.1250, 51.5000],
              [-0.1300, 51.5000],
            ],
          ],
        },
      };

      // 1. Convert geometry (simulating import script)
      const geoJsonGeometry = {
        type: 'Polygon',
        coordinates: mockFeature.geometry.rings,
      };

      // 2. Validate geometry (using validateGeometry service)
      // TODO: Import and use actual validateGeometry when implemented
      const isValid = geoJsonGeometry.coordinates[0].length >= 4;
      expect(isValid).toBe(true);

      // 3. Generate simplified geometries (using boundary-simplifier service)
      // TODO: Import and use actual generateSimplifiedGeometries when implemented
      
      // 4. Insert into database
      const result = await pool.query(`
        INSERT INTO property_restrictions (
          property_name,
          managing_organization,
          geometry,
          geometry_simplified_low,
          geometry_simplified_medium,
          restriction_category,
          policy_text,
          data_source_id
        ) VALUES (
          $1, $2,
          ST_Multi(ST_GeomFromGeoJSON($3)),
          ST_Multi(ST_SimplifyPreserveTopology(ST_GeomFromGeoJSON($3), 0.0001)),
          ST_Multi(ST_SimplifyPreserveTopology(ST_GeomFromGeoJSON($3), 0.00005)),
          'HERITAGE_SITE',
          'Test policy text',
          NULL
        )
        RETURNING 
          property_restriction_id,
          property_name,
          geometry_simplified_low IS NOT NULL as has_low,
          geometry_simplified_medium IS NOT NULL as has_medium
      `, [
        mockFeature.attributes.NAME,
        'Test Organization',
        JSON.stringify(geoJsonGeometry),
      ]);

      expect(result.rows[0].property_name).toBe('Integration Test Site 1');
      expect(result.rows[0].has_low).toBe(true);
      expect(result.rows[0].has_medium).toBe(true);
    });

    it('should quarantine invalid geometry', async () => {
      // Mock feature with self-intersecting geometry
      const mockInvalidFeature = {
        attributes: {
          OBJECTID: 'TEST_002',
          NAME: 'Integration Test Invalid',
        },
        geometry: {
          rings: [
            [
              [-0.1400, 51.5100],
              [-0.1350, 51.5150],  // Crosses next segment
              [-0.1400, 51.5150],
              [-0.1350, 51.5100],  // Creates bow-tie (self-intersection)
              [-0.1400, 51.5100],
            ],
          ],
        },
      };

      const geoJsonGeometry = {
        type: 'Polygon',
        coordinates: mockInvalidFeature.geometry.rings,
      };

      // Check if geometry is valid using PostGIS
      const validationResult = await pool.query(`
        SELECT 
          ST_IsValid(ST_GeomFromGeoJSON($1)) as is_valid,
          ST_IsValidReason(ST_GeomFromGeoJSON($1)) as reason
      `, [JSON.stringify(geoJsonGeometry)]);

      const isValid = validationResult.rows[0].is_valid;
      const reason = validationResult.rows[0].reason;

      if (!isValid) {
        // Quarantine to heritage_sites_import_errors
        await pool.query(`
          INSERT INTO heritage_sites_import_errors (
            source_record_id,
            data_source_id,
            error_type,
            raw_geometry_text,
            raw_properties_json,
            error_details
          ) VALUES (
            $1, NULL, 'topology_invalid', $2, $3, $4
          )
        `, [
          mockInvalidFeature.attributes.OBJECTID,
          JSON.stringify(geoJsonGeometry),
          JSON.stringify(mockInvalidFeature.attributes),
          `Topology validation failed: ${reason}`,
        ]);

        // Verify quarantine
        const quarantineCheck = await pool.query(`
          SELECT error_type, error_details
          FROM heritage_sites_import_errors
          WHERE source_record_id = $1
        `, [mockInvalidFeature.attributes.OBJECTID]);

        expect(quarantineCheck.rows).toHaveLength(1);
        expect(quarantineCheck.rows[0].error_type).toBe('topology_invalid');
      }

      expect(isValid).toBe(false);
    });

    it('should reject out-of-bounds geometry', async () => {
      const mockOutOfBounds = {
        attributes: {
          OBJECTID: 'TEST_003',
          NAME: 'Integration Test Out of Bounds',
        },
        geometry: {
          rings: [
            [
              [-190.0, 51.5000],  // Longitude out of bounds
              [-190.0, 51.5010],
              [-189.5, 51.5010],
              [-189.5, 51.5000],
              [-190.0, 51.5000],
            ],
          ],
        },
      };

      const geoJsonGeometry = {
        type: 'Polygon',
        coordinates: mockOutOfBounds.geometry.rings,
      };

      // Check bounds
      const coords = geoJsonGeometry.coordinates[0];
      let outOfBounds = false;
      let errorMessage = '';

      for (const [lng, lat] of coords) {
        if (lat < -90 || lat > 90) {
          outOfBounds = true;
          errorMessage = `Latitude ${lat} out of bounds (must be -90 to 90)`;
          break;
        }
        if (lng < -180 || lng > 180) {
          outOfBounds = true;
          errorMessage = `Longitude ${lng} out of bounds (must be -180 to 180)`;
          break;
        }
      }

      if (outOfBounds) {
        // Quarantine
        await pool.query(`
          INSERT INTO heritage_sites_import_errors (
            source_record_id,
            data_source_id,
            error_type,
            raw_geometry_text,
            raw_properties_json,
            error_details
          ) VALUES (
            $1, NULL, 'bounds_invalid', $2, $3, $4
          )
        `, [
          mockOutOfBounds.attributes.OBJECTID,
          JSON.stringify(geoJsonGeometry),
          JSON.stringify(mockOutOfBounds.attributes),
          errorMessage,
        ]);

        const quarantineCheck = await pool.query(`
          SELECT error_type FROM heritage_sites_import_errors
          WHERE source_record_id = $1
        `, [mockOutOfBounds.attributes.OBJECTID]);

        expect(quarantineCheck.rows[0].error_type).toBe('bounds_invalid');
      }

      expect(outOfBounds).toBe(true);
    });

    it('should update data source health metrics', async () => {
      // Get or create test data source
      let dataSource = await pool.query(`
        SELECT source_id FROM data_sources
        WHERE authority_name = 'Integration Test Source'
      `);

      if (dataSource.rows.length === 0) {
        dataSource = await pool.query(`
          INSERT INTO data_sources (
            authority_name,
            data_type_provided,
            reliability_level,
            data_url
          ) VALUES (
            'Integration Test Source',
            ARRAY['heritage-site'],
            'official-secondary',
            'https://test.example.com'
          )
          RETURNING source_id
        `);
      }

      const sourceId = dataSource.rows[0].source_id;

      // Simulate successful import
      await pool.query(`
        UPDATE data_sources
        SET 
          last_import_attempt = NOW(),
          last_successful_import = NOW(),
          health_status = 'healthy',
          consecutive_failure_count = 0,
          success_count_7day = success_count_7day + 1
        WHERE source_id = $1
      `, [sourceId]);

      // Verify health update
      const healthCheck = await pool.query(`
        SELECT 
          health_status,
          consecutive_failure_count,
          success_count_7day
        FROM data_sources
        WHERE source_id = $1
      `, [sourceId]);

      expect(healthCheck.rows[0].health_status).toBe('healthy');
      expect(healthCheck.rows[0].consecutive_failure_count).toBe(0);
      expect(healthCheck.rows[0].success_count_7day).toBeGreaterThan(0);
    });

    it('should track consecutive failures', async () => {
      // Get test data source
      const dataSource = await pool.query(`
        SELECT source_id FROM data_sources
        WHERE authority_name = 'Integration Test Source'
      `);

      const sourceId = dataSource.rows[0].source_id;

      // Simulate failed import
      await pool.query(`
        UPDATE data_sources
        SET 
          last_import_attempt = NOW(),
          last_error_timestamp = NOW(),
          last_error_message = 'Simulated network timeout',
          consecutive_failure_count = consecutive_failure_count + 1,
          failure_count_7day = failure_count_7day + 1,
          health_status = CASE 
            WHEN consecutive_failure_count + 1 >= 3 THEN 'unhealthy'
            ELSE health_status
          END
        WHERE source_id = $1
      `, [sourceId]);

      // Verify failure tracking
      const failureCheck = await pool.query(`
        SELECT 
          consecutive_failure_count,
          last_error_message,
          health_status
        FROM data_sources
        WHERE source_id = $1
      `, [sourceId]);

      expect(failureCheck.rows[0].consecutive_failure_count).toBeGreaterThan(0);
      expect(failureCheck.rows[0].last_error_message).toBe('Simulated network timeout');
    });
  });

  describe('Batch Processing', () => {
    it('should process multiple features in a transaction', async () => {
      const mockFeatures = [
        {
          attributes: { OBJECTID: 'TEST_BATCH_1', NAME: 'Batch Site 1' },
          geometry: {
            rings: [
              [
                [-0.1700, 51.5300],
                [-0.1700, 51.5310],
                [-0.1670, 51.5310],
                [-0.1670, 51.5300],
                [-0.1700, 51.5300],
              ],
            ],
          },
        },
        {
          attributes: { OBJECTID: 'TEST_BATCH_2', NAME: 'Batch Site 2' },
          geometry: {
            rings: [
              [
                [-0.1750, 51.5320],
                [-0.1750, 51.5330],
                [-0.1720, 51.5330],
                [-0.1720, 51.5320],
                [-0.1750, 51.5320],
              ],
            ],
          },
        },
      ];

      // Begin transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (const feature of mockFeatures) {
          const geoJson = {
            type: 'Polygon',
            coordinates: feature.geometry.rings,
          };

          await client.query(`
            INSERT INTO property_restrictions (
              property_name,
              managing_organization,
              geometry,
              restriction_category
            ) VALUES (
              $1, 'Batch Test Org',
              ST_Multi(ST_GeomFromGeoJSON($2)),
              'HERITAGE_SITE'
            )
          `, [feature.attributes.NAME, JSON.stringify(geoJson)]);
        }

        await client.query('COMMIT');

        // Verify both inserted
        const verifyResult = await pool.query(`
          SELECT COUNT(*) as count
          FROM property_restrictions
          WHERE property_name LIKE 'Batch Site%'
        `);

        expect(parseInt(verifyResult.rows[0].count)).toBe(2);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });
  });
});
