import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PropertyService } from '../../../src/services/property-service.js';
import { getDbPool } from '../../../src/lib/db.js';
import type { Pool } from 'pg';
import * as turf from '@turf/turf';

/**
 * Property Service Tests (T018) - Spatial Queries
 * 
 * Tests spatial query functionality for property restrictions detection.
 * Uses @turf/turf fixtures for geometry creation and validation.
 * 
 * SAFETY-CRITICAL: Incorrect spatial queries could result in:
 * - False negatives: Missing property restrictions → unauthorized flights
 * - False positives: Blocking legitimate flights unnecessarily
 * 
 * Test Coverage:
 * - checkPropertyRestrictions(lat, lng) - Point-in-polygon detection
 * - getPropertyRestrictionsByBbox(bbox) - Viewport queries
 * - Multiple overlapping properties
 * - Edge cases (boundaries, holes, complex geometries)
 * - GIST index performance
 * - Query result formatting
 * 
 * Turf.js Test Fixtures:
 * - Circles: turf.circle() for heritage site buffers
 * - Donuts: Polygons with holes for exclusion zones
 * - Overlaps: Multiple intersecting polygons
 */
describe('PropertyService - Spatial Query Tests', () => {
  let service: PropertyService;
  let pool: Pool;
  let testDataSourceId: string;
  let testPropertyIds: string[] = [];

  beforeAll(async () => {
    pool = getDbPool();
    await pool.query('SELECT 1');
    service = new PropertyService();

    // Create test data source
    const result = await pool.query(
      `INSERT INTO data_sources (authority_name, data_type_provided, reliability_level)
       VALUES ('Test Heritage Authority', ARRAY['heritage-sites'], 'primary-authority')
       RETURNING source_id`
    );
    testDataSourceId = result.rows[0].source_id;
  });

  afterAll(async () => {
    // Clean up test data
    if (testPropertyIds.length > 0) {
      await pool.query(
        'DELETE FROM property_restrictions WHERE property_id = ANY($1)',
        [testPropertyIds]
      );
    }
    
    await pool.query(
      'DELETE FROM data_sources WHERE source_id = $1',
      [testDataSourceId]
    );
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM property_restrictions WHERE property_name LIKE 'Test%'");
    testPropertyIds = [];
  });

  describe('checkPropertyRestrictions - Point Detection', () => {
    it('should detect property restriction when point is inside circular buffer (turf.circle)', async () => {
      // Create circular heritage site using turf.js (500m radius)
      const center = turf.point([-1.8262, 51.1789]); // Stonehenge
      const radius = 0.5; // km
      const options = { steps: 32, units: 'kilometers' };
      const circle = turf.circle(center, radius, options as any);

      // Insert circular property
      const result = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'Test Circular Heritage Site', 'Historic England',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'Circular protection zone. Authorization required.',
          $2
        ) RETURNING property_id`,
        [JSON.stringify(circle.geometry), testDataSourceId]
      );
      testPropertyIds.push(result.rows[0].property_id);

      // Check point at center (should be inside)
      const restrictions = await service.checkPropertyRestrictions(-1.8262, 51.1789);

      expect(restrictions.length).toBe(1);
      expect(restrictions[0].property_name).toBe('Test Circular Heritage Site');
      expect(restrictions[0].managing_organization).toBe('Historic England');
      expect(restrictions[0].policy_text).toContain('Authorization required');
    });

    it('should NOT detect property restriction when point is outside circular buffer', async () => {
      // Create circular heritage site using turf.js (500m radius)
      const center = turf.point([-1.8262, 51.1789]);
      const radius = 0.5; // km
      const options = { steps: 32, units: 'kilometers' };
      const circle = turf.circle(center, radius, options as any);

      // Insert circular property
      const result = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'Test Outside Circle', 'Historic England',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'Protection zone.',
          $2
        ) RETURNING property_id`,
        [JSON.stringify(circle.geometry), testDataSourceId]
      );
      testPropertyIds.push(result.rows[0].property_id);

      // Check point 2km away (should be outside)
      const farPoint = turf.destination(center, 2, 0, { units: 'kilometers' });
      const restrictions = await service.checkPropertyRestrictions(
        farPoint.geometry.coordinates[0],
        farPoint.geometry.coordinates[1]
      );

      expect(restrictions.length).toBe(0);
    });

    it('should handle donut geometry (polygon with hole)', async () => {
      // Create donut: outer circle with inner exclusion hole
      const center = turf.point([-1.0, 51.0]);
      const outerCircle = turf.circle(center, 1, { steps: 32, units: 'kilometers' });
      const innerCircle = turf.circle(center, 0.3, { steps: 32, units: 'kilometers' });

      // Create donut geometry (outer ring - inner ring)
      const donutGeometry = {
        type: 'Polygon',
        coordinates: [
          outerCircle.geometry.coordinates[0], // Outer ring
          innerCircle.geometry.coordinates[0].reverse(), // Inner ring (hole) - must be reversed
        ],
      };

      const result = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'Test Donut Property', 'Test Org',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'Protection zone with exclusion area.',
          $2
        ) RETURNING property_id`,
        [JSON.stringify(donutGeometry), testDataSourceId]
      );
      testPropertyIds.push(result.rows[0].property_id);

      // Check point in outer ring but outside inner hole (should be detected)
      const outerPoint = turf.destination(center, 0.5, 45, { units: 'kilometers' });
      const outerRestrictions = await service.checkPropertyRestrictions(
        outerPoint.geometry.coordinates[0],
        outerPoint.geometry.coordinates[1]
      );
      expect(outerRestrictions.length).toBe(1);

      // Check point in inner hole (should NOT be detected)
      const innerPoint = turf.destination(center, 0.2, 90, { units: 'kilometers' });
      const innerRestrictions = await service.checkPropertyRestrictions(
        innerPoint.geometry.coordinates[0],
        innerPoint.geometry.coordinates[1]
      );
      expect(innerRestrictions.length).toBe(0);
    });

    it('should detect all overlapping properties at coordinates', async () => {
      // Create two overlapping circular sites
      const center1 = turf.point([-1.0, 51.0]);
      const center2 = turf.point([-0.99, 51.01]); // Slightly offset

      const circle1 = turf.circle(center1, 0.5, { steps: 16, units: 'kilometers' });
      const circle2 = turf.circle(center2, 0.5, { steps: 16, units: 'kilometers' });

      const result1 = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'Test Overlap Site 1', 'Organization A',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'Site 1 policy.',
          $2
        ) RETURNING property_id`,
        [JSON.stringify(circle1.geometry), testDataSourceId]
      );
      testPropertyIds.push(result1.rows[0].property_id);

      const result2 = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'Test Overlap Site 2', 'Organization B',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'Site 2 policy.',
          $2
        ) RETURNING property_id`,
        [JSON.stringify(circle2.geometry), testDataSourceId]
      );
      testPropertyIds.push(result2.rows[0].property_id);

      // Check point in overlap area
      const restrictions = await service.checkPropertyRestrictions(-0.995, 51.005);

      expect(restrictions.length).toBe(2);
      expect(restrictions.map(r => r.property_name)).toContain('Test Overlap Site 1');
      expect(restrictions.map(r => r.property_name)).toContain('Test Overlap Site 2');
    });

    it('should return empty array when no property restrictions at coordinates', async () => {
      const restrictions = await service.checkPropertyRestrictions(-5.0, 55.0);
      expect(restrictions).toEqual([]);
    });

    it('should handle boundary coordinates correctly', async () => {
      // Create simple square
      const square = turf.polygon([
        [
          [-1.0, 51.0],
          [-1.0, 51.1],
          [-0.9, 51.1],
          [-0.9, 51.0],
          [-1.0, 51.0],
        ],
      ]);

      const result = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'Test Boundary Property', 'Test Org',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'Boundary test.',
          $2
        ) RETURNING property_id`,
        [JSON.stringify(square.geometry), testDataSourceId]
      );
      testPropertyIds.push(result.rows[0].property_id);

      // Check point exactly on boundary (PostGIS ST_Intersects includes boundaries)
      const restrictions = await service.checkPropertyRestrictions(-1.0, 51.05);
      expect(restrictions.length).toBe(1);

      // Check point at corner
      const cornerRestrictions = await service.checkPropertyRestrictions(-1.0, 51.0);
      expect(cornerRestrictions.length).toBe(1);
    });
  });

  describe('getPropertyRestrictionsByBbox - Viewport Queries', () => {
    it('should return all properties intersecting bounding box', async () => {
      // Create property at known location
      const center = turf.point([-1.0, 51.0]);
      const circle = turf.circle(center, 0.5, { steps: 16, units: 'kilometers' });

      const result = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'Test Bbox Property', 'Test Org',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'Bbox test.',
          $2
        ) RETURNING property_id`,
        [JSON.stringify(circle.geometry), testDataSourceId]
      );
      testPropertyIds.push(result.rows[0].property_id);

      // Query bbox containing property
      const properties = await service.getPropertyRestrictionsByBbox({
        west: -1.1,
        south: 50.9,
        east: -0.9,
        north: 51.1,
      });

      expect(properties.length).toBeGreaterThanOrEqual(1);
      expect(properties.some(p => p.property_id === result.rows[0].property_id)).toBe(true);
    });

    it('should return GeoJSON FeatureCollection format', async () => {
      // Create test property
      const circle = turf.circle([-1.0, 51.0], 0.5, { steps: 16, units: 'kilometers' });

      const result = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'Test GeoJSON Property', 'Test Org',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'GeoJSON test.',
          $2
        ) RETURNING property_id`,
        [JSON.stringify(circle.geometry), testDataSourceId]
      );
      testPropertyIds.push(result.rows[0].property_id);

      // Query and check format
      const properties = await service.getPropertyRestrictionsByBbox({
        west: -1.1,
        south: 50.9,
        east: -0.9,
        north: 51.1,
      });

      expect(properties.length).toBeGreaterThanOrEqual(1);
      
      // Verify each property has geometry in GeoJSON format
      properties.forEach(property => {
        expect(property.geometry).toBeDefined();
        expect(property.geometry.type).toMatch(/MultiPolygon|Polygon/);
        expect(property.geometry.coordinates).toBeDefined();
        expect(Array.isArray(property.geometry.coordinates)).toBe(true);
      });
    });

    it('should return empty array for bbox without properties', async () => {
      const properties = await service.getPropertyRestrictionsByBbox({
        west: -10.0,
        south: 30.0,
        east: -9.0,
        north: 31.0,
      });

      expect(properties).toEqual([]);
    });

    it('should handle bbox partially overlapping property', async () => {
      // Create large property
      const largeSquare = turf.polygon([
        [
          [-1.0, 51.0],
          [-1.0, 51.2],
          [-0.8, 51.2],
          [-0.8, 51.0],
          [-1.0, 51.0],
        ],
      ]);

      const result = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'Test Partial Overlap', 'Test Org',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'Partial overlap test.',
          $2
        ) RETURNING property_id`,
        [JSON.stringify(largeSquare.geometry), testDataSourceId]
      );
      testPropertyIds.push(result.rows[0].property_id);

      // Query bbox that only partially overlaps (should still return property)
      const properties = await service.getPropertyRestrictionsByBbox({
        west: -0.95,
        south: 51.05,
        east: -0.75,
        north: 51.15,
      });

      expect(properties.length).toBeGreaterThanOrEqual(1);
      expect(properties.some(p => p.property_id === result.rows[0].property_id)).toBe(true);
    });
  });

  describe('Query Performance and Index Usage', () => {
    it('should use GIST spatial index for point queries', async () => {
      // Create test property
      const circle = turf.circle([-1.0, 51.0], 0.5, { steps: 16, units: 'kilometers' });

      const result = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'Test Index Property', 'Test Org',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'Index test.',
          $2
        ) RETURNING property_id`,
        [JSON.stringify(circle.geometry), testDataSourceId]
      );
      testPropertyIds.push(result.rows[0].property_id);

      // Explain query to verify GIST index usage
      const explainResult = await pool.query(
        `EXPLAIN (FORMAT JSON)
         SELECT property_name
         FROM property_restrictions
         WHERE ST_Intersects(geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))`,
        [-1.0, 51.0]
      );

      const plan = JSON.stringify(explainResult.rows[0]);
      expect(plan).toMatch(/idx_property_restrictions_geom|Index.*property_restrictions/i);
    });

    it('should complete point query in reasonable time (<100ms for single property)', async () => {
      // Create test property
      const circle = turf.circle([-1.0, 51.0], 0.5, { steps: 16, units: 'kilometers' });

      const result = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'Test Performance Property', 'Test Org',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'Performance test.',
          $2
        ) RETURNING property_id`,
        [JSON.stringify(circle.geometry), testDataSourceId]
      );
      testPropertyIds.push(result.rows[0].property_id);

      // Time the query
      const startTime = Date.now();
      await service.checkPropertyRestrictions(-1.0, 51.0);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100); // Should be very fast for single property
    });
  });

  describe('queryPropertyById - Single Property Retrieval', () => {
    it('should retrieve property restriction by ID', async () => {
      const circle = turf.circle([-1.0, 51.0], 0.5, { steps: 16, units: 'kilometers' });

      const result = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'Test ID Query Property', 'Test Org',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'ID query test.',
          $2
        ) RETURNING property_id`,
        [JSON.stringify(circle.geometry), testDataSourceId]
      );
      const propertyId = result.rows[0].property_id;
      testPropertyIds.push(propertyId);

      const property = await service.queryPropertyById(propertyId);

      expect(property).not.toBeNull();
      expect(property?.property_id).toBe(propertyId);
      expect(property?.property_name).toBe('Test ID Query Property');
      expect(property?.managing_organization).toBe('Test Org');
    });

    it('should return null for non-existent property ID', async () => {
      const property = await service.queryPropertyById('00000000-0000-0000-0000-000000000000');
      expect(property).toBeNull();
    });
  });
});
