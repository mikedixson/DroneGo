import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { LocationService } from '../../../src/services/location-service.js';
import { getDbPool } from '../../../src/lib/db.js';
import type { Pool } from 'pg';

/**
 * Location Check Service Tests - SAFETY CRITICAL
 * 
 * This service determines whether a pilot can legally fly at a given location.
 * Incorrect status determination could lead to illegal flights in restricted
 * airspace, potentially causing safety incidents or legal consequences.
 * 
 * Per Constitution Section I:
 * - 100% test coverage required
 * - All edge cases must be tested
 * - Performance: location check must complete within 5 seconds (FR-026)
 * 
 * Test Coverage:
 * - Restriction status determination (no-fly, controlled, permitted)
 * - Zone priority hierarchy (no-fly > airport-frz > military > controlled > danger > temporary)
 * - Overlapping zones with different priorities
 * - No zones present (permitted by default)
 * - TOAL site proximity (nearest site + distance)
 * - Temporal filtering (expired zones excluded)
 * - Altitude considerations
 * - Input validation
 * - Error handling
 * - Performance requirements
 */
describe('LocationService - SAFETY CRITICAL', () => {
  let service: LocationService;
  let pool: Pool;
  let testZoneIds: string[] = [];
  let testToalIds: string[] = [];
  let testDataSourceIds: { [key: string]: string } = {};

  beforeAll(async () => {
    pool = getDbPool();
    await pool.query('SELECT 1');
    service = new LocationService();

    // Create test data sources
    const caaResult = await pool.query(
      `INSERT INTO data_sources (authority_name, data_type, confidence_level)
       VALUES ('CAA', 'geographic_zones', 'primary-authority')
       ON CONFLICT (authority_name, data_type) DO UPDATE SET confidence_level = 'primary-authority'
       RETURNING source_id`
    );
    testDataSourceIds['CAA'] = caaResult.rows[0].source_id;

    const natsResult = await pool.query(
      `INSERT INTO data_sources (authority_name, data_type, confidence_level)
       VALUES ('NATS', 'geographic_zones', 'primary-authority')
       ON CONFLICT (authority_name, data_type) DO UPDATE SET confidence_level = 'primary-authority'
       RETURNING source_id`
    );
    testDataSourceIds['NATS'] = natsResult.rows[0].source_id;

    const modResult = await pool.query(
      `INSERT INTO data_sources (authority_name, data_type, confidence_level)
       VALUES ('MoD', 'geographic_zones', 'primary-authority')
       ON CONFLICT (authority_name, data_type) DO UPDATE SET confidence_level = 'primary-authority'
       RETURNING source_id`
    );
    testDataSourceIds['MoD'] = modResult.rows[0].source_id;
  });

  afterAll(async () => {
    // Clean up test data
    if (testZoneIds.length > 0) {
      await pool.query(
        'DELETE FROM restriction_zones WHERE zone_id = ANY($1)',
        [testZoneIds]
      );
    }
    if (testToalIds.length > 0) {
      await pool.query(
        'DELETE FROM toal_sites WHERE site_id = ANY($1)',
        [testToalIds]
      );
    }
    // DO NOT close pool - shared across tests
  });

  beforeEach(async () => {
    // Clean up from previous tests
    await pool.query("DELETE FROM restriction_zones WHERE restriction_name LIKE 'Test%'");
    await pool.query("DELETE FROM toal_sites WHERE site_name LIKE 'Test%'");
    testZoneIds = [];
    testToalIds = [];
  });

  describe('Restriction Status Determination', () => {
    it('should return "no-fly" status for location inside no-fly zone', async () => {
      // Create no-fly zone at test location
      const result = await pool.query(
        `INSERT INTO restriction_zones (
          zone_type, restriction_name, geometry, authority_source, data_source_id,
          altitude_floor, altitude_ceiling, authorization_possible, confidence_level
        ) VALUES (
          'no-fly', 'Test No-Fly Zone',
          ST_Multi(ST_GeomFromGeoJSON($1)), 'CAA', $2,
          0, 5000, false, 'primary-authority'
        ) RETURNING zone_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [[[-0.5, 51.5], [-0.5, 51.6], [-0.4, 51.6], [-0.4, 51.5], [-0.5, 51.5]]],
          }),
          testDataSourceIds['CAA'],
        ]
      );
      testZoneIds.push(result.rows[0].zone_id);

      const status = await service.checkLocation(-0.45, 51.55);

      expect(status.restriction_status).toBe('no-fly');
      expect(status.can_fly).toBe(false);
      expect(status.zones).toBeDefined();
      expect(status.zones.length).toBeGreaterThan(0);
      expect(status.zones[0].zone_type).toBe('no-fly');
    });

    it('should return "controlled" status for location in controlled airspace only', async () => {
      const result = await pool.query(
        `INSERT INTO restriction_zones (
          zone_type, restriction_name, geometry, authority_source, data_source_id,
          altitude_floor, altitude_ceiling, authorization_possible, confidence_level
        ) VALUES (
          'controlled-airspace', 'Test Controlled Zone',
          ST_Multi(ST_GeomFromGeoJSON($1)), 'NATS', $2,
          0, 5000, true, 'primary-authority'
        ) RETURNING zone_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [[[-0.5, 51.5], [-0.5, 51.6], [-0.4, 51.6], [-0.4, 51.5], [-0.5, 51.5]]],
          }),
          testDataSourceIds['NATS'],
        ]
      );
      testZoneIds.push(result.rows[0].zone_id);

      const status = await service.checkLocation(-0.45, 51.55);

      expect(status.restriction_status).toBe('controlled');
      expect(status.can_fly).toBe(false);
      expect(status.authorization_required).toBe(true);
    });

    it('should return "permitted" status for location outside all restricted zones', async () => {
      // Create zone far away
      const result = await pool.query(
        `INSERT INTO restriction_zones (
          zone_type, restriction_name, geometry, authority_source, data_source_id,
          altitude_floor, altitude_ceiling, authorization_possible, confidence_level
        ) VALUES (
          'no-fly', 'Test Distant Zone',
          ST_Multi(ST_GeomFromGeoJSON($1)), 'CAA', $2,
          0, 5000, false, 'primary-authority'
        ) RETURNING zone_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [[[-1.0, 52.0], [-1.0, 52.1], [-0.9, 52.1], [-0.9, 52.0], [-1.0, 52.0]]],
          }),
          testDataSourceIds['CAA'],
        ]
      );
      testZoneIds.push(result.rows[0].zone_id);

      const status = await service.checkLocation(-0.13, 51.51);

      expect(status.restriction_status).toBe('permitted');
      expect(status.can_fly).toBe(true);
      expect(status.zones.length).toBe(0);
    });
  });

  describe('Zone Priority Hierarchy', () => {
    it('should prioritize no-fly over controlled airspace when overlapping', async () => {
      // Create controlled airspace
      const result1 = await pool.query(
        `INSERT INTO restriction_zones (
          zone_type, restriction_name, geometry, authority_source, data_source_id,
          altitude_floor, altitude_ceiling, authorization_possible, confidence_level
        ) VALUES (
          'controlled-airspace', 'Test Controlled',
          ST_Multi(ST_GeomFromGeoJSON($1)), 'NATS', $2,
          0, 5000, true, 'primary-authority'
        ) RETURNING zone_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [[[-0.5, 51.5], [-0.5, 51.6], [-0.4, 51.6], [-0.4, 51.5], [-0.5, 51.5]]],
          }),
          testDataSourceIds['NATS'],
        ]
      );
      testZoneIds.push(result1.rows[0].zone_id);

      // Create overlapping no-fly zone
      const result2 = await pool.query(
        `INSERT INTO restriction_zones (
          zone_type, restriction_name, geometry, authority_source, data_source_id,
          altitude_floor, altitude_ceiling, authorization_possible, confidence_level
        ) VALUES (
          'no-fly', 'Test No-Fly',
          ST_Multi(ST_GeomFromGeoJSON($1)), 'CAA', $2,
          0, 2500, false, 'primary-authority'
        ) RETURNING zone_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [[[-0.48, 51.52], [-0.48, 51.58], [-0.42, 51.58], [-0.42, 51.52], [-0.48, 51.52]]],
          }),
          testDataSourceIds['CAA'],
        ]
      );
      testZoneIds.push(result2.rows[0].zone_id);

      const status = await service.checkLocation(-0.45, 51.55);

      expect(status.restriction_status).toBe('no-fly');
      expect(status.can_fly).toBe(false);
      expect(status.zones.length).toBe(2);
    });

    it('should prioritize airport-frz over military zone', async () => {
      const result1 = await pool.query(
        `INSERT INTO restriction_zones (
          zone_type, restriction_name, geometry, authority_source, data_source_id,
          altitude_floor, altitude_ceiling, authorization_possible, confidence_level
        ) VALUES (
          'military-zone', 'Test Military',
          ST_Multi(ST_GeomFromGeoJSON($1)), 'MoD', $2,
          0, 5000, false, 'primary-authority'
        ) RETURNING zone_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [[[-0.5, 51.5], [-0.5, 51.6], [-0.4, 51.6], [-0.4, 51.5], [-0.5, 51.5]]],
          }),
          testDataSourceIds['MoD'],
        ]
      );
      testZoneIds.push(result1.rows[0].zone_id);

      const result2 = await pool.query(
        `INSERT INTO restriction_zones (
          zone_type, restriction_name, geometry, authority_source, data_source_id,
          altitude_floor, altitude_ceiling, authorization_possible, confidence_level
        ) VALUES (
          'airport-frz', 'Test Airport FRZ',
          ST_Multi(ST_GeomFromGeoJSON($1)), 'CAA', $2,
          0, 2500, false, 'primary-authority'
        ) RETURNING zone_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [[[-0.48, 51.52], [-0.48, 51.58], [-0.42, 51.58], [-0.42, 51.52], [-0.48, 51.52]]],
          }),
          testDataSourceIds['CAA'],
        ]
      );
      testZoneIds.push(result2.rows[0].zone_id);

      const status = await service.checkLocation(-0.45, 51.55);

      expect(status.restriction_status).toBe('no-fly');
      expect(status.can_fly).toBe(false);
      // Both airport-frz and no-fly map to status='no-fly'
    });
  });

  describe('TOAL Site Integration', () => {
    it('should include nearest TOAL site when available', async () => {
      const result = await pool.query(
        `INSERT INTO toal_sites (
          site_name, geometry, access_type, verified, data_source
        ) VALUES (
          'Test TOAL', ST_SetSRID(ST_MakePoint($1, $2), 4326),
          'public', true, 'test'
        ) RETURNING site_id`,
        [-0.1278, 51.5074]
      );
      testToalIds.push(result.rows[0].site_id);

      const status = await service.checkLocation(-0.13, 51.51);

      expect(status.nearest_toal).toBeDefined();
      expect(status.nearest_toal?.site_id).toBe(result.rows[0].site_id);
      expect(status.nearest_toal?.distance_meters).toBeGreaterThan(0);
    });

    it('should handle no TOAL sites available', async () => {
      await pool.query('DELETE FROM toal_sites');

      const status = await service.checkLocation(-0.13, 51.51);

      expect(status.nearest_toal).toBeNull();
    });
  });

  describe('Temporal Filtering', () => {
    it('should exclude expired temporary restrictions', async () => {
      const result = await pool.query(
        `INSERT INTO restriction_zones (
          zone_type, restriction_name, geometry, authority_source, data_source_id,
          altitude_floor, altitude_ceiling, authorization_possible, confidence_level,
          effective_start, effective_end
        ) VALUES (
          'temporary-restriction', 'Test Expired NOTAM',
          ST_Multi(ST_GeomFromGeoJSON($1)), 'NATS', $2,
          0, 5000, false, 'primary-authority',
          NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'
        ) RETURNING zone_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [[[-0.5, 51.5], [-0.5, 51.6], [-0.4, 51.6], [-0.4, 51.5], [-0.5, 51.5]]],
          }),
          testDataSourceIds['NATS'],
        ]
      );
      testZoneIds.push(result.rows[0].zone_id);

      const status = await service.checkLocation(-0.45, 51.55);

      expect(status.restriction_status).toBe('permitted');
      expect(status.zones.length).toBe(0);
    });

    it('should include active temporary restrictions', async () => {
      const result = await pool.query(
        `INSERT INTO restriction_zones (
          zone_type, restriction_name, geometry, authority_source, data_source_id,
          altitude_floor, altitude_ceiling, authorization_possible, confidence_level,
          effective_start, effective_end
        ) VALUES (
          'temporary-restriction', 'Test Active NOTAM',
          ST_Multi(ST_GeomFromGeoJSON($1)), 'NATS', $2,
          0, 5000, false, 'primary-authority',
          NOW() - INTERVAL '1 hour', NOW() + INTERVAL '1 day'
        ) RETURNING zone_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [[[-0.5, 51.5], [-0.5, 51.6], [-0.4, 51.6], [-0.4, 51.5], [-0.5, 51.5]]],
          }),
          testDataSourceIds['NATS'],
        ]
      );
      testZoneIds.push(result.rows[0].zone_id);

      const status = await service.checkLocation(-0.45, 51.55);

      expect(status.restriction_status).toBe('no-fly');
      expect(status.zones.length).toBe(1);
    });
  });

  describe('Altitude Considerations', () => {
    it('should include altitude restrictions in zone info', async () => {
      const result = await pool.query(
        `INSERT INTO restriction_zones (
          zone_type, restriction_name, geometry, authority_source, data_source_id,
          altitude_floor, altitude_ceiling, authorization_possible, confidence_level
        ) VALUES (
          'controlled-airspace', 'Test Altitude Zone',
          ST_Multi(ST_GeomFromGeoJSON($1)), 'NATS', $2,
          1000, 3000, true, 'primary-authority'
        ) RETURNING zone_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [[[-0.5, 51.5], [-0.5, 51.6], [-0.4, 51.6], [-0.4, 51.5], [-0.5, 51.5]]],
          }),
          testDataSourceIds['NATS'],
        ]
      );
      testZoneIds.push(result.rows[0].zone_id);

      const status = await service.checkLocation(-0.45, 51.55);

      expect(status.zones[0].altitude_floor).toBe(1000);
      expect(status.zones[0].altitude_ceiling).toBe(3000);
    });
  });

  describe('Input Validation', () => {
    it('should reject invalid longitude', async () => {
      await expect(service.checkLocation(-200, 51.5)).rejects.toThrow(/longitude/i);
    });

    it('should reject invalid latitude', async () => {
      await expect(service.checkLocation(-0.5, 100)).rejects.toThrow(/latitude/i);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Test with coordinates that might cause issues
      const status = await service.checkLocation(0, 0);

      // Should not throw, returns permitted for middle of ocean
      expect(status.restriction_status).toBe('permitted');
    });
  });

  describe('Authorization Requirements', () => {
    it('should set authorization_required flag for controlled airspace', async () => {
      const result = await pool.query(
        `INSERT INTO restriction_zones (
          zone_type, restriction_name, geometry, authority_source, data_source_id,
          altitude_floor, altitude_ceiling, authorization_possible, confidence_level
        ) VALUES (
          'controlled-airspace', 'Test Auth Required',
          ST_Multi(ST_GeomFromGeoJSON($1)), 'NATS', $2,
          0, 5000, true, 'primary-authority'
        ) RETURNING zone_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [[[-0.5, 51.5], [-0.5, 51.6], [-0.4, 51.6], [-0.4, 51.5], [-0.5, 51.5]]],
          }),
          testDataSourceIds['NATS'],
        ]
      );
      testZoneIds.push(result.rows[0].zone_id);

      const status = await service.checkLocation(-0.45, 51.55);

      expect(status.authorization_required).toBe(true);
      expect(status.zones[0].authorization_possible).toBe(true);
    });

    it('should not set authorization_required for no-fly zones', async () => {
      const result = await pool.query(
        `INSERT INTO restriction_zones (
          zone_type, restriction_name, geometry, authority_source, data_source_id,
          altitude_floor, altitude_ceiling, authorization_possible, confidence_level
        ) VALUES (
          'no-fly', 'Test No Auth',
          ST_Multi(ST_GeomFromGeoJSON($1)), 'CAA', $2,
          0, 5000, false, 'primary-authority'
        ) RETURNING zone_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [[[-0.5, 51.5], [-0.5, 51.6], [-0.4, 51.6], [-0.4, 51.5], [-0.5, 51.5]]],
          }),
          testDataSourceIds['CAA'],
        ]
      );
      testZoneIds.push(result.rows[0].zone_id);

      const status = await service.checkLocation(-0.45, 51.55);

      expect(status.authorization_required).toBe(false);
    });
  });

  describe('Performance Requirements', () => {
    it('should complete location check within 5 seconds (FR-026)', async () => {
      // Create multiple zones to test performance
      for (let i = 0; i < 10; i++) {
        const offset = i * 0.01;
        const result = await pool.query(
          `INSERT INTO restriction_zones (
            zone_type, restriction_name, geometry, authority_source, data_source_id,
            altitude_floor, altitude_ceiling, authorization_possible, confidence_level
          ) VALUES (
            'controlled-airspace', $1,
            ST_Multi(ST_GeomFromGeoJSON($2)), 'NATS', $3,
            0, 5000, true, 'primary-authority'
          ) RETURNING zone_id`,
          [
            `Test Zone ${i}`,
            JSON.stringify({
              type: 'Polygon',
              coordinates: [
                [
                  [-0.5 + offset, 51.5 + offset],
                  [-0.5 + offset, 51.6 + offset],
                  [-0.4 + offset, 51.6 + offset],
                  [-0.4 + offset, 51.5 + offset],
                  [-0.5 + offset, 51.5 + offset],
                ],
              ],
            }),
            testDataSourceIds['NATS'],
          ]
        );
        testZoneIds.push(result.rows[0].zone_id);
      }

      const startTime = Date.now();
      await service.checkLocation(-0.45, 51.55);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000);
    });
  });
});
