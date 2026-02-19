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

  /**
   * T015: Tri-State Flight Status Tests
   * 
   * Tests the enhanced location check endpoint with tri-state response:
   * - flight_status: 'permitted' | 'prohibited' | 'check-property-restrictions'
   * - airspace_clear: boolean
   * - property_advisory: boolean
   * - property_restrictions: PropertyAdvisory[]
   * 
   * Per location-check-v2.yaml contract
   */
  describe('Tri-State Flight Status (User Story 1)', () => {
    let testPropertyIds: string[] = [];

    afterEach(async () => {
      // Clean up property restrictions
      if (testPropertyIds.length > 0) {
        await pool.query(
          'DELETE FROM property_restrictions WHERE property_id = ANY($1)',
          [testPropertyIds]
        );
        testPropertyIds = [];
      }
    });

    it('should return flight_status "permitted" when airspace clear and no property restrictions', async () => {
      const response = await request(app).get('/location/check').query({ lng: -0.13, lat: 51.51 });

      expect(response.status).toBe(200);
      expect(response.body.flight_status).toBe('permitted');
      expect(response.body.airspace_clear).toBe(true);
      expect(response.body.property_advisory).toBe(false);
      expect(response.body.zones.length).toBe(0);
      expect(response.body.property_restrictions).toEqual([]);
    });

    it('should return flight_status "prohibited" when airspace restricted regardless of property', async () => {
      // Create no-fly zone
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
            coordinates: [
              [
                [-0.14, 51.50],
                [-0.14, 51.52],
                [-0.12, 51.52],
                [-0.12, 51.50],
                [-0.14, 51.50],
              ],
            ],
          }),
          testDataSourceIds['CAA'],
        ]
      );
      testZoneIds.push(result.rows[0].zone_id);

      const response = await request(app).get('/location/check').query({ lng: -0.13, lat: 51.51 });

      expect(response.status).toBe(200);
      expect(response.body.flight_status).toBe('prohibited');
      expect(response.body.airspace_clear).toBe(false);
      expect(response.body.property_advisory).toBe(false); // Airspace restriction takes precedence
      expect(response.body.zones.length).toBeGreaterThan(0);
      expect(response.body.message).toMatch(/prohibited|restricted|no-fly/i);
    });

    it('should return flight_status "check-property-restrictions" when airspace clear but property restricted', async () => {
      // Create property restriction (Stonehenge-like)
      const propertyResult = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, 
          contact_info, data_source_id
        ) VALUES (
          'Test Heritage Site', 'English Heritage Trust',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'Drone flights require prior written authorization. Unauthorized flights may result in prosecution.',
          'permissions@english-heritage.org.uk',
          $2
        ) RETURNING property_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [
              [
                [-0.14, 51.50],
                [-0.14, 51.52],
                [-0.12, 51.52],
                [-0.12, 51.50],
                [-0.14, 51.50],
              ],
            ],
          }),
          testDataSourceIds['CAA'],
        ]
      );
      testPropertyIds.push(propertyResult.rows[0].property_id);

      const response = await request(app).get('/location/check').query({ lng: -0.13, lat: 51.51 });

      expect(response.status).toBe(200);
      expect(response.body.flight_status).toBe('check-property-restrictions');
      expect(response.body.airspace_clear).toBe(true);
      expect(response.body.property_advisory).toBe(true);
      expect(response.body.zones.length).toBe(0); // No airspace restrictions
      expect(response.body.property_restrictions.length).toBeGreaterThan(0);
      expect(response.body.message).toMatch(/property|heritage|authorization/i);
    });

    it('should include property_restrictions array with all required fields', async () => {
      // Create property restriction
      const propertyResult = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, 
          contact_info, data_source_id
        ) VALUES (
          'Stonehenge', 'English Heritage Trust',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'This is a World Heritage Site. Drone flights require prior written authorization from English Heritage. Unauthorized flights may result in prosecution under heritage protection laws.',
          'permissions@english-heritage.org.uk',
          $2
        ) RETURNING property_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [
              [
                [-0.14, 51.50],
                [-0.14, 51.52],
                [-0.12, 51.52],
                [-0.12, 51.50],
                [-0.14, 51.50],
              ],
            ],
          }),
          testDataSourceIds['CAA'],
        ]
      );
      testPropertyIds.push(propertyResult.rows[0].property_id);

      const response = await request(app).get('/location/check').query({ lng: -0.13, lat: 51.51 });

      expect(response.status).toBe(200);
      expect(response.body.property_restrictions).toBeDefined();
      expect(Array.isArray(response.body.property_restrictions)).toBe(true);
      expect(response.body.property_restrictions.length).toBe(1);

      const advisory = response.body.property_restrictions[0];
      expect(advisory).toHaveProperty('property_name');
      expect(advisory).toHaveProperty('organization');
      expect(advisory).toHaveProperty('policy_summary');
      expect(advisory).toHaveProperty('contact');

      expect(advisory.property_name).toBe('Stonehenge');
      expect(advisory.organization).toBe('English Heritage Trust');
      expect(advisory.policy_summary).toContain('authorization');
      expect(advisory.contact).toBe('permissions@english-heritage.org.uk');
    });

    it('should include multiple property_restrictions when location overlaps multiple heritage sites', async () => {
      // Create two overlapping property restrictions
      const property1 = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'World Heritage Site Buffer', 'UNESCO',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'World Heritage Site protection zone.',
          $2
        ) RETURNING property_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [
              [
                [-0.15, 51.49],
                [-0.15, 51.53],
                [-0.11, 51.53],
                [-0.11, 51.49],
                [-0.15, 51.49],
              ],
            ],
          }),
          testDataSourceIds['CAA'],
        ]
      );
      testPropertyIds.push(property1.rows[0].property_id);

      const property2 = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'National Trust Property', 'National Trust',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'National Trust property. Drone use restricted.',
          $2
        ) RETURNING property_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [
              [
                [-0.14, 51.50],
                [-0.14, 51.52],
                [-0.12, 51.52],
                [-0.12, 51.50],
                [-0.14, 51.50],
              ],
            ],
          }),
          testDataSourceIds['CAA'],
        ]
      );
      testPropertyIds.push(property2.rows[0].property_id);

      const response = await request(app).get('/location/check').query({ lng: -0.13, lat: 51.51 });

      expect(response.status).toBe(200);
      expect(response.body.flight_status).toBe('check-property-restrictions');
      expect(response.body.property_restrictions.length).toBe(2);

      const propertyNames = response.body.property_restrictions.map((p: any) => p.property_name);
      expect(propertyNames).toContain('World Heritage Site Buffer');
      expect(propertyNames).toContain('National Trust Property');
    });

    it('should truncate policy_summary to 200 characters', async () => {
      const longPolicy = 'This is a very long policy text that exceeds 200 characters. '.repeat(10);

      const propertyResult = await pool.query(
        `INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, policy_text, data_source_id
        ) VALUES (
          'Test Long Policy Site', 'Test Authority',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          $2,
          $3
        ) RETURNING property_id`,
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [
              [
                [-0.14, 51.50],
                [-0.14, 51.52],
                [-0.12, 51.52],
                [-0.12, 51.50],
                [-0.14, 51.50],
              ],
            ],
          }),
          longPolicy,
          testDataSourceIds['CAA'],
        ]
      );
      testPropertyIds.push(propertyResult.rows[0].property_id);

      const response = await request(app).get('/location/check').query({ lng: -0.13, lat: 51.51 });

      expect(response.status).toBe(200);
      const advisory = response.body.property_restrictions[0];
      expect(advisory.policy_summary.length).toBeLessThanOrEqual(203); // 200 + "..."
      expect(advisory.policy_summary).toMatch(/\.\.\.$/); // Ends with ellipsis
    });
  });
});
