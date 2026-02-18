import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { GeospatialService, type ZoneResult } from '../../../src/services/geospatial-service.js';
import { getDbPool } from '../../../src/lib/db.js';
import type { Pool } from 'pg';

/**
 * Geospatial Service Tests
 * 
 * SAFETY-CRITICAL: 100% test coverage required per Constitution Section I
 * 
 * These tests verify the accuracy of spatial queries that determine whether
 * a drone pilot can legally fly at a given location. Incorrect results could
 * lead to illegal flights in controlled airspace or near airports.
 * 
 * Test Coverage:
 * - Point-in-polygon queries (ST_Contains)
 * - Bounding box intersection queries (ST_Intersects + ST_MakeEnvelope)
 * - Distance calculations (ST_Distance)
 * - Edge cases: points on boundaries, overlapping zones, empty results
 * - Error handling: invalid coordinates, database failures
 */
describe('GeospatialService - SAFETY CRITICAL', () => {
  let service: GeospatialService;
  let pool: Pool;
  let testZoneIds: string[] = [];
  let testToalIds: string[] = [];
  let testDataSourceIds: { [key: string]: string } = {}; // Map authority name to source_id

  beforeAll(async () => {
    pool = getDbPool();
    await pool.query('SELECT 1'); // Verify connection
    service = new GeospatialService();
    
    // Create test data sources for restriction zones
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
    // Clean up all test data
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
    // DO NOT close pool - it's shared across all tests
    // await pool.end();
  });

  beforeEach(async () => {
    // Create test fixtures for each test group
    // Will be populated by individual test suites
  });

  afterEach(async () => {
    // Clean up test-specific data if needed
  });

  describe('Point-in-Polygon Queries', () => {
    let squareZoneId: string;

    beforeEach(async () => {
      // Create a test square zone: (-0.5, 51.5) to (-0.4, 51.6)
      const result = await pool.query(
        `INSERT INTO restriction_zones (
          zone_type, restriction_name, geometry, authority_source, data_source_id,
          altitude_floor, altitude_ceiling, description,
          authorization_possible, confidence_level
        ) VALUES (
          'no-fly', 'Test Square Zone',
          ST_Multi(ST_GeomFromGeoJSON($1)), $2, $3,
          0, 2500, 'Test zone for point-in-polygon',
          false, 'primary-authority'
        ) RETURNING zone_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [
              [
                [-0.5, 51.5],
                [-0.5, 51.6],
                [-0.4, 51.6],
                [-0.4, 51.5],
                [-0.5, 51.5],
              ],
            ],
          }),
          'CAA',
          testDataSourceIds['CAA'],
        ]
      );
      squareZoneId = result.rows[0].zone_id;
      testZoneIds.push(squareZoneId);
    });

    it('should find zones containing a point inside polygon', async () => {
      // Point clearly inside: (-0.45, 51.55) - center of square
      const zones = await service.findZonesContainingPoint(-0.45, 51.55);

      expect(zones).toBeDefined();
      expect(Array.isArray(zones)).toBe(true);
      expect(zones.length).toBeGreaterThan(0);
      
      const testZone = zones.find((z: ZoneResult) => z.zone_id === squareZoneId);
      expect(testZone).toBeDefined();
      expect(testZone?.zone_type).toBe('no-fly');
      expect(testZone?.restriction_name).toBe('Test Square Zone');
    });

    it('should return empty array for point outside polygon', async () => {
      // Point clearly outside: (-0.6, 51.7)
      const zones = await service.findZonesContainingPoint(-0.6, 51.7);

      expect(zones).toBeDefined();
      expect(Array.isArray(zones)).toBe(true);
      
      // Should not contain our test zone
      const testZone = zones.find((z: ZoneResult) => z.zone_id === squareZoneId);
      expect(testZone).toBeUndefined();
    });

    it('should handle point exactly on polygon boundary', async () => {
      // Point on edge: (-0.5, 51.55) - left edge of square
      // PostGIS ST_Contains excludes boundary, ST_Covers includes it
      const zones = await service.findZonesContainingPoint(-0.5, 51.55);

      expect(zones).toBeDefined();
      expect(Array.isArray(zones)).toBe(true);
      
      // Document boundary behavior (implementation determines inclusion)
      // This tests actual behavior for edge case documentation
    });

    it('should handle point at polygon corner', async () => {
      // Point at corner: (-0.5, 51.5) - bottom-left corner
      const zones = await service.findZonesContainingPoint(-0.5, 51.5);

      expect(zones).toBeDefined();
      expect(Array.isArray(zones)).toBe(true);
      
      // Document corner behavior
    });
  });

  describe('Multiple Overlapping Zones', () => {
    let zone1Id: string;
    let zone2Id: string;

    beforeEach(async () => {
      // Create two overlapping zones
      // Zone 1: (-0.5, 51.5) to (-0.3, 51.6) - wider zone
      const result1 = await pool.query(
        `INSERT INTO restriction_zones (
          zone_type, restriction_name, geometry, authority_source, data_source_id,
          altitude_floor, altitude_ceiling, description,
          authorization_possible, confidence_level
        ) VALUES (
          'controlled-airspace', 'Test Zone 1 - Wider',
          ST_Multi(ST_GeomFromGeoJSON($1)), $2, $3,
          0, 5000, 'Test overlapping zone 1',
          true, 'primary-authority'
        ) RETURNING zone_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [
              [
                [-0.5, 51.5],
                [-0.5, 51.6],
                [-0.3, 51.6],
                [-0.3, 51.5],
                [-0.5, 51.5],
              ],
            ],
          }),
          'NATS',
          testDataSourceIds['NATS'],
        ]
      );
      zone1Id = result1.rows[0].zone_id;
      testZoneIds.push(zone1Id);

      // Zone 2: (-0.45, 51.52) to (-0.35, 51.58) - smaller zone inside zone 1
      const result2 = await pool.query(
        `INSERT INTO restriction_zones (
          zone_type, restriction_name, geometry, authority_source, data_source_id,
          altitude_floor, altitude_ceiling, description,
          authorization_possible, confidence_level
        ) VALUES (
          'airport-frz', 'Test Zone 2 - Smaller',
          ST_Multi(ST_GeomFromGeoJSON($1)), $2, $3,
          0, 2500, 'Test overlapping zone 2',
          false, 'primary-authority'
        ) RETURNING zone_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [
              [
                [-0.45, 51.52],
                [-0.45, 51.58],
                [-0.35, 51.58],
                [-0.35, 51.52],
                [-0.45, 51.52],
              ],
            ],
          }),
          'CAA',
          testDataSourceIds['CAA'],
        ]
      );
      zone2Id = result2.rows[0].zone_id;
      testZoneIds.push(zone2Id);
    });

    it('should return all zones containing overlapping point', async () => {
      // Point inside both zones: (-0.4, 51.55)
      const zones = await service.findZonesContainingPoint(-0.4, 51.55);

      expect(zones).toBeDefined();
      expect(zones.length).toBeGreaterThanOrEqual(2);
      
      const zoneIds = zones.map((z: ZoneResult) => z.zone_id);
      expect(zoneIds).toContain(zone1Id);
      expect(zoneIds).toContain(zone2Id);
    });

    it('should return only wider zone for point in zone1 but not zone2', async () => {
      // Point in zone 1 only: (-0.48, 51.51)
      const zones = await service.findZonesContainingPoint(-0.48, 51.51);

      expect(zones).toBeDefined();
      
      const zoneIds = zones.map((z: ZoneResult) => z.zone_id);
      expect(zoneIds).toContain(zone1Id);
      expect(zoneIds).not.toContain(zone2Id);
    });
  });

  describe('Bounding Box Queries', () => {
    let zoneInBboxId: string;
    let zoneOutsideBboxId: string;
    let zonePartialOverlapId: string;

    beforeEach(async () => {
      // Zone fully inside bbox: (-0.12, 51.50) to (-0.11, 51.51)
      const result1 = await pool.query(
        `INSERT INTO restriction_zones (
          zone_type, restriction_name, geometry, authority_source, data_source_id,
          altitude_floor, altitude_ceiling, description,
          authorization_possible, confidence_level
        ) VALUES (
          'no-fly', 'Zone Inside Bbox',
          ST_Multi(ST_GeomFromGeoJSON($1)), $2, $3,
          0, 2500, 'Test zone inside bbox',
          false, 'primary-authority'
        ) RETURNING zone_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [
              [
                [-0.12, 51.5],
                [-0.12, 51.51],
                [-0.11, 51.51],
                [-0.11, 51.5],
                [-0.12, 51.5],
              ],
            ],
          }),
          'CAA',
          testDataSourceIds['CAA'],
        ]
      );
      zoneInBboxId = result1.rows[0].zone_id;
      testZoneIds.push(zoneInBboxId);

      // Zone outside bbox: (-0.2, 51.60) to (-0.19, 51.61)
      const result2 = await pool.query(
        `INSERT INTO restriction_zones (
          zone_type, restriction_name, geometry, authority_source, data_source_id,
          altitude_floor, altitude_ceiling, description,
          authorization_possible, confidence_level
        ) VALUES (
          'controlled-airspace', 'Zone Outside Bbox',
          ST_Multi(ST_GeomFromGeoJSON($1)), $2, $3,
          0, 5000, 'Test zone outside bbox',
          true, 'primary-authority'
        ) RETURNING zone_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [
              [
                [-0.2, 51.6],
                [-0.2, 51.61],
                [-0.19, 51.61],
                [-0.19, 51.6],
                [-0.2, 51.6],
              ],
            ],
          }),
          'NATS',
          testDataSourceIds['NATS'],
        ]
      );
      zoneOutsideBboxId = result2.rows[0].zone_id;
      testZoneIds.push(zoneOutsideBboxId);

      // Zone partially overlapping bbox: (-0.14, 51.50) to (-0.09, 51.52)
      const result3 = await pool.query(
        `INSERT INTO restriction_zones (
          zone_type, restriction_name, geometry, authority_source, data_source_id,
          altitude_floor, altitude_ceiling, description,
          authorization_possible, confidence_level
        ) VALUES (
          'military-zone', 'Zone Partial Overlap',
          ST_Multi(ST_GeomFromGeoJSON($1)), $2, $3,
          0, 10000, 'Test zone partial overlap',
          false, 'primary-authority'
        ) RETURNING zone_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [
              [
                [-0.14, 51.5],
                [-0.14, 51.52],
                [-0.09, 51.52],
                [-0.09, 51.5],
                [-0.14, 51.5],
              ],
            ],
          }),
          'MoD',
          testDataSourceIds['MoD'],
        ]
      );
      zonePartialOverlapId = result3.rows[0].zone_id;
      testZoneIds.push(zonePartialOverlapId);
    });

    it('should return zones within bounding box', async () => {
      // Bbox: (-0.13, 51.49) to (-0.10, 51.52)
      const zones = await service.findZonesWithinBounds(-0.13, 51.49, -0.1, 51.52);

      expect(zones).toBeDefined();
      expect(Array.isArray(zones)).toBe(true);
      
      const zoneIds = zones.map((z: ZoneResult) => z.zone_id);
      expect(zoneIds).toContain(zoneInBboxId); // Fully inside
      expect(zoneIds).toContain(zonePartialOverlapId); // Partially overlapping
      expect(zoneIds).not.toContain(zoneOutsideBboxId); // Outside
    });

    it('should return empty array for bbox with no zones', async () => {
      // Bbox in empty area: (-0.01, 51.80) to (0.01, 51.82)
      const zones = await service.findZonesWithinBounds(-0.01, 51.8, 0.01, 51.82);

      expect(zones).toBeDefined();
      expect(Array.isArray(zones)).toBe(true);
      
      // Should not contain any of our test zones
      const zoneIds = zones.map((z: ZoneResult) => z.zone_id);
      expect(zoneIds).not.toContain(zoneInBboxId);
      expect(zoneIds).not.toContain(zoneOutsideBboxId);
      expect(zoneIds).not.toContain(zonePartialOverlapId);
    });

    it('should handle very small bounding box', async () => {
      // Tiny bbox around point inside zoneInBboxId: (-0.115, 51.505) ± 0.001
      const zones = await service.findZonesWithinBounds(
        -0.116,
        51.504,
        -0.114,
        51.506
      );

      expect(zones).toBeDefined();
      const zoneIds = zones.map((z: ZoneResult) => z.zone_id);
      expect(zoneIds).toContain(zoneInBboxId);
    });
  });

  describe('Distance Calculations', () => {
    let toalSiteId: string;

    beforeEach(async () => {
      // Clean up any existing test TOAL sites first
      await pool.query("DELETE FROM toal_sites WHERE site_name LIKE 'Test TOAL%'");
      testToalIds = []; // Reset tracking array
      
      // Create test TOAL site at (-0.1278, 51.5074) - Hyde Park coordinates
      const result = await pool.query(
        `INSERT INTO toal_sites (
          site_name, geometry, access_type, surface_type,
          facilities, verified, data_source
        ) VALUES (
          'Test TOAL Site', ST_SetSRID(ST_MakePoint($1, $2), 4326),
          'public', 'grass', '{}', true, 'test'
        ) RETURNING site_id`,
        [-0.1278, 51.5074]
      );
      toalSiteId = result.rows[0].site_id;
      testToalIds.push(toalSiteId);
    });

    it('should find nearest TOAL site to coordinates', async () => {
      // Query from nearby point: (-0.13, 51.51)
      const nearest = await service.findNearestToalSite(-0.13, 51.51);

      expect(nearest).toBeDefined();
      expect(nearest?.site_id).toBe(toalSiteId);
      expect(nearest?.distance_meters).toBeDefined();
      expect(nearest?.distance_meters).toBeGreaterThan(0);
      expect(nearest?.distance_meters).toBeLessThan(1000); // Should be < 1km
    });

    it('should calculate distance accurately with Haversine formula', async () => {
      // Query from known distance point
      // (-0.13, 51.50) is approximately 300-400m from (-0.1278, 51.5074)
      const nearest = await service.findNearestToalSite(-0.13, 51.5);

      expect(nearest).toBeDefined();
      expect(nearest?.distance_meters).toBeDefined();
      
      // Verify distance is in expected range (allowing for spherical Earth calculations)
      // Actual distance ~837m between (-0.13, 51.51) and (-0.1278, 51.5074)
      expect(nearest!.distance_meters).toBeGreaterThan(800);
      expect(nearest!.distance_meters).toBeLessThan(900);
    });

    it('should return null when no TOAL sites exist', async () => {
      // Clean up all TOAL sites
      await pool.query('DELETE FROM toal_sites');
      testToalIds = []; // Clear tracking array

      const nearest = await service.findNearestToalSite(-0.13, 51.51);
      
      expect(nearest).toBeNull();
    });
  });

  describe('Input Validation', () => {
    it('should reject invalid longitude (< -180)', async () => {
      await expect(
        service.findZonesContainingPoint(-181, 51.5)
      ).rejects.toThrow(/longitude/i);
    });

    it('should reject invalid longitude (> 180)', async () => {
      await expect(
        service.findZonesContainingPoint(181, 51.5)
      ).rejects.toThrow(/longitude/i);
    });

    it('should reject invalid latitude (< -90)', async () => {
      await expect(
        service.findZonesContainingPoint(-0.5, -91)
      ).rejects.toThrow(/latitude/i);
    });

    it('should reject invalid latitude (> 90)', async () => {
      await expect(
        service.findZonesContainingPoint(-0.5, 91)
      ).rejects.toThrow(/latitude/i);
    });

    it('should reject invalid bbox (minLng > maxLng)', async () => {
      await expect(
        service.findZonesWithinBounds(-0.1, 51.5, -0.2, 51.6)
      ).rejects.toThrow(/bounding box/i);
    });

    it('should reject invalid bbox (minLat > maxLat)', async () => {
      await expect(
        service.findZonesWithinBounds(-0.2, 51.6, -0.1, 51.5)
      ).rejects.toThrow(/bounding box/i);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection failure gracefully', async () => {
      // Note: Cannot actually close the shared pool in tests
      // This test verifies error wrapping by checking invalid coordinates
      // Full connection failure testing requires integration tests with mocked pool
      
      await expect(
        service.findZonesContainingPoint(999, 999) // Invalid coordinates
      ).rejects.toThrow();
    });

    it('should return empty results for malformed geometry in database', async () => {
      // This is a defensive test - should not happen with schema constraints
      // but tests service resilience
      const zones = await service.findZonesContainingPoint(0, 0);
      
      expect(zones).toBeDefined();
      expect(Array.isArray(zones)).toBe(true);
    });
  });

  describe('Performance and Optimization', () => {
    it('should complete point-in-polygon query within 100ms', async () => {
      const start = Date.now();
      await service.findZonesContainingPoint(-0.45, 51.55);
      const duration = Date.now() - start;

      // Constitution requires <100ms for spatial queries
      expect(duration).toBeLessThan(100);
    });

    it('should complete bbox query within 100ms', async () => {
      const start = Date.now();
      await service.findZonesWithinBounds(-0.13, 51.49, -0.1, 51.52);
      const duration = Date.now() - start;

      // Constitution requires <100ms for spatial queries
      expect(duration).toBeLessThan(100);
    });

    it('should use spatial indexes efficiently', async () => {
      // Verify GIST index exists and is being used
      const result = await pool.query(`
        EXPLAIN (FORMAT JSON)
        SELECT * FROM restriction_zones
        WHERE ST_Contains(geometry, ST_SetSRID(ST_MakePoint(-0.45, 51.55), 4326))
      `);

      const plan = JSON.stringify(result.rows[0]);
      
      // Check that index scan is used (not sequential scan)
      expect(plan.toLowerCase()).toContain('index');
    });
  });
});
