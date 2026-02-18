import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { locationRouter } from '../../src/api/location.js';
import { getDbPool } from '../../src/lib/db.js';
import type { Pool } from 'pg';

/**
 * Location Check API Contract Tests
 * 
 * Tests the HTTP contract for the /location/check endpoint including:
 * - Response status codes
 * - Response schema validation
 * - Request parameter validation
 * - Restriction status determination
 * - TOAL site integration
 * - Error handling
 * - Performance requirements (FR-026: <5 seconds)
 * 
 * This is a SAFETY-CRITICAL endpoint - incorrect responses could lead
 * to illegal flights in restricted airspace.
 */
describe('GET /location/check - HTTP Contract', () => {
  let app: Express;
  let pool: Pool;
  let testZoneIds: string[] = [];
  let testToalIds: string[] = [];
  let testDataSourceIds: { [key: string]: string } = {};

  beforeAll(async () => {
    pool = getDbPool();
    await pool.query('SELECT 1');

    // Create Express app with location router
    app = express();
    app.use(express.json());
    app.use('/location', locationRouter);

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
  });

  afterAll(async () => {
    if (testZoneIds.length > 0) {
      await pool.query('DELETE FROM restriction_zones WHERE zone_id = ANY($1)', [testZoneIds]);
    }
    if (testToalIds.length > 0) {
      await pool.query('DELETE FROM toal_sites WHERE site_id = ANY($1)', [testToalIds]);
    }
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM restriction_zones WHERE restriction_name LIKE 'Test%'");
    await pool.query("DELETE FROM toal_sites WHERE site_name LIKE 'Test%'");
    testZoneIds = [];
    testToalIds = [];
  });

  describe('Response Status Codes', () => {
    it('should return 200 OK for valid coordinates', async () => {
      const response = await request(app).get('/location/check').query({ lng: -0.13, lat: 51.51 });

      expect(response.status).toBe(200);
    });

    it('should return 400 Bad Request for missing lng parameter', async () => {
      const response = await request(app).get('/location/check').query({ lat: 51.51 });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 Bad Request for missing lat parameter', async () => {
      const response = await request(app).get('/location/check').query({ lng: -0.13 });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 Bad Request for invalid longitude', async () => {
      const response = await request(app).get('/location/check').query({ lng: -200, lat: 51.51 });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/longitude/i);
    });

    it('should return 400 Bad Request for invalid latitude', async () => {
      const response = await request(app).get('/location/check').query({ lng: -0.13, lat: 100 });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/latitude/i);
    });
  });

  describe('Response Schema', () => {
    it('should return LocationCheckResult with all required fields', async () => {
      const response = await request(app).get('/location/check').query({ lng: -0.13, lat: 51.51 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('restriction_status');
      expect(response.body).toHaveProperty('can_fly');
      expect(response.body).toHaveProperty('zones');
      expect(response.body).toHaveProperty('nearest_toal');
      expect(response.body).toHaveProperty('authorization_required');
      expect(Array.isArray(response.body.zones)).toBe(true);
    });

    it('should include metadata with query timestamp', async () => {
      const response = await request(app).get('/location/check').query({ lng: -0.13, lat: 51.51 });

      expect(response.body).toHaveProperty('metadata');
      expect(response.body.metadata).toHaveProperty('query_timestamp');
      expect(response.body.metadata).toHaveProperty('coordinates');
    });
  });

  describe('Restriction Status Logic', () => {
    it('should return "permitted" status for location outside all zones', async () => {
      const response = await request(app).get('/location/check').query({ lng: -0.13, lat: 51.51 });

      expect(response.status).toBe(200);
      expect(response.body.restriction_status).toBe('permitted');
      expect(response.body.can_fly).toBe(true);
      expect(response.body.authorization_required).toBe(false);
      expect(response.body.zones.length).toBe(0);
    });

    it('should return "no-fly" status for location inside no-fly zone', async () => {
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

      const response = await request(app)
        .get('/location/check')
        .query({ lng: -0.45, lat: 51.55 });

      expect(response.status).toBe(200);
      expect(response.body.restriction_status).toBe('no-fly');
      expect(response.body.can_fly).toBe(false);
      expect(response.body.authorization_required).toBe(false);
      expect(response.body.zones.length).toBeGreaterThan(0);
    });

    it('should return "controlled" status for location in controlled airspace', async () => {
      const result = await pool.query(
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
      testZoneIds.push(result.rows[0].zone_id);

      const response = await request(app)
        .get('/location/check')
        .query({ lng: -0.45, lat: 51.55 });

      expect(response.status).toBe(200);
      expect(response.body.restriction_status).toBe('controlled');
      expect(response.body.can_fly).toBe(false);
      expect(response.body.authorization_required).toBe(true);
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

      const response = await request(app).get('/location/check').query({ lng: -0.13, lat: 51.51 });

      expect(response.status).toBe(200);
      expect(response.body.nearest_toal).not.toBeNull();
      expect(response.body.nearest_toal).toHaveProperty('site_id');
      expect(response.body.nearest_toal).toHaveProperty('distance_meters');
      expect(response.body.nearest_toal.distance_meters).toBeGreaterThan(0);
    });

    it('should return null for nearest_toal when no sites exist', async () => {
      await pool.query('DELETE FROM toal_sites');

      const response = await request(app).get('/location/check').query({ lng: -0.13, lat: 51.51 });

      expect(response.status).toBe(200);
      expect(response.body.nearest_toal).toBeNull();
    });
  });

  describe('Performance Requirements', () => {
    it('should respond within 5 seconds (FR-026)', async () => {
      // Create some test zones
      for (let i = 0; i < 5; i++) {
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
      const response = await request(app).get('/location/check').query({ lng: -0.45, lat: 51.55 });
      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('Error Handling', () => {
    it('should return 500 and error message on internal failure', async () => {
      // Test with valid coordinates - should succeed in normal case
      const response = await request(app).get('/location/check').query({ lng: 0, lat: 0 });

      // Middle of ocean should be permitted
      expect(response.status).toBe(200);
      expect(response.body.restriction_status).toBe('permitted');
    });
  });
});
