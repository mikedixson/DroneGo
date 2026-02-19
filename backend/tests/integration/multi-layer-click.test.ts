/**
 * Integration Test: Multi-Layer Click Behavior
 * 
 * Tests that when a location has multiple overlapping restrictions
 * (zones + property restrictions), all relevant information is returned
 * in the location check response.
 * 
 * User Story: clicking on Tower Bridge should show BOTH:
 * - Airspace restriction zone information
 * - Heritage site (Tower of London) property restriction
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDbPool } from '../../src/lib/db.js';
import { LocationService } from '../../src/services/location-service.js';
import type { Pool } from 'pg';

describe('Multi-Layer Click Integration', () => {
  let service: LocationService;
  let pool: Pool;
  let dataSourceIds: Record<string, string>;
  let zoneId: string;
  let propertyId: string;

  beforeEach(async () => {
    service = new LocationService();
    pool = getDbPool();

    // Create test data sources
    const caaResult = await pool.query(
      `INSERT INTO data_sources (authority_name, data_type_provided, reliability_level)
       VALUES ('Test CAA', ARRAY['geographic_zones'], 'primary-authority')
       RETURNING source_id`
    );
    const heResult = await pool.query(
      `INSERT INTO data_sources (authority_name, data_type_provided, reliability_level)
       VALUES ('Test Historic England', ARRAY['heritage-site'], 'primary-authority')
       RETURNING source_id`
    );

    dataSourceIds = {
      'Test CAA': caaResult.rows[0].source_id,
      'Test Historic England': heResult.rows[0].source_id,
    };
  });

  afterEach(async () => {
    // Cleanup test data
    await pool.query(`DELETE FROM restriction_zones WHERE zone_id = $1`, [zoneId]);
    await pool.query(`DELETE FROM property_restrictions WHERE property_id = $1`, [propertyId]);
    await pool.query(`DELETE FROM data_sources WHERE source_id = ANY($1)`, 
      [Object.values(dataSourceIds)]
    );
  });

  it('should return both zone and property restriction info when clicking on overlapping location', async () => {
    // Test coordinates: central location that we'll surround with both zone and property
    const testLat = 51.5081;
    const testLon = -0.0761;

    // 1. Create a restriction zone covering this area
    const zoneGeometry = {
      type: 'Polygon',
      coordinates: [
        [
          [-0.0861, 51.5031], // SW
          [-0.0861, 51.5131], // NW  
          [-0.0661, 51.5131], // NE
          [-0.0661, 51.5031], // SE
          [-0.0861, 51.5031], // Close
        ],
      ],
    };

    const zoneResult = await pool.query(
      `INSERT INTO restriction_zones (
        zone_type, restriction_name, geometry, authority_source, data_source_id,
        altitude_floor, altitude_ceiling, authorization_possible, confidence_level,
        description
      ) VALUES (
        'controlled-airspace',
        'Test London Control Zone',
        ST_Multi(ST_GeomFromGeoJSON($1)),
        'Test CAA',
        $2,
        0,
        2000,
        true,
        'primary-authority',
        'Controlled airspace around central London'
      ) RETURNING zone_id`,
      [JSON.stringify(zoneGeometry), dataSourceIds['Test CAA']]
    );
    zoneId = zoneResult.rows[0].zone_id;

    // 2. Create a property restriction at the same location
    const propertyGeometry = {
      type: 'Polygon',
      coordinates: [
        [
          [-0.0811, 51.5056], // SW
          [-0.0811, 51.5106], // NW
          [-0.0711, 51.5106], // NE
          [-0.0711, 51.5056], // SE
          [-0.0811, 51.5056], // Close
        ],
      ],
    };

    const propertyResult = await pool.query(
      `INSERT INTO property_restrictions (
        property_name, managing_organization, geometry, policy_text,
        restriction_category, data_source_id
      ) VALUES (
        'Test Tower of London',
        'Historic Royal Palaces',
        ST_Multi(ST_GeomFromGeoJSON($1)),
        'Historic UNESCO World Heritage Site. Drone operations are prohibited within 200 meters without written authorization from Historic Royal Palaces. Contact heritage@hrp.org.uk for permissions.',
        'HERITAGE_SITE',
        $2
      ) RETURNING property_id`,
      [JSON.stringify(propertyGeometry), dataSourceIds['Test Historic England']]
    );
    propertyId = propertyResult.rows[0].property_id;

    // 3. Check location - should return BOTH zone and property information
    const result = await service.checkLocation(testLat,testLon);

    // Assertions: verify all layer information is present
    expect(result).toBeDefined();

    // Should detect the airspace restriction
    expect(result.zones).toBeDefined();
    expect(result.zones.length).toBeGreaterThan(0);
    expect(result.zones[0].restriction_name).toBe('Test London Control Zone');
    expect(result.airspace_clear).toBe(false);

    // Should detect the property restriction
    expect(result.property_restrictions).toBeDefined();
    expect(result.property_restrictions.length).toBeGreaterThan(0);
    
    const propertyInfo = result.property_restrictions[0];
    expect(propertyInfo.property_name).toBe('Test Tower of London');
    expect(propertyInfo.organization).toBe('Historic Royal Palaces');
    expect(propertyInfo.policy_summary).toBeDefined();
    expect(propertyInfo.policy_summary.length).toBeGreaterThan(0);
    expect(propertyInfo.contact).toContain('heritage@hrp.org.uk');

    // Flight status should be 'prohibited' due to airspace (State 1 logic)
    expect(result.flight_status).toBe('prohibited');
    expect(result.property_advisory).toBe(true);

    console.log('✅ Multi-layer click test passed: Both zone and property info returned');
  });

  it('should show property restrictions when clicking heritage site in clear airspace', async () => {
    // Test coordinates: away from airspace restrictions but on a heritage site
    const testLat = 51.4769; // Greenwich Park
    const testLon = -0.0015;

    // Create ONLY a property restriction (no airspace zone)
    const propertyResult = await pool.query(
      `INSERT INTO property_restrictions (
        property_name, managing_organization, geometry, policy_text,
        restriction_category, data_source_id
      ) VALUES (
        'Test Greenwich Park Heritage Site',
        'Royal Parks',
        ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 300)::geometry),
        'Historic park. Please respect visitors and wildlife. Contact: parks@royal.gov.uk',
        'HERITAGE_SITE',
        $3
      ) RETURNING property_id`,
      [testLon, testLat, dataSourceIds['Test Historic England']]
    );
    propertyId = propertyResult.rows[0].property_id;

    // Check location
    const result = await service.checkLocation(testLat, testLon);

    // Should be no airspace restrictions
    expect(result.zones.length).toBe(0);
    expect(result.airspace_clear).toBe(true);

    // Should detect the property restriction
    expect(result.property_restrictions.length).toBeGreaterThan(0);
    expect(result.property_restrictions[0].property_name).toBe('Test Greenwich Park Heritage Site');

    // Flight status should be 'check-property-restrictions' (State 2)
    expect(result.flight_status).toBe('check-property-restrictions');
    expect(result.property_advisory).toBe(true);

    console.log('✅ Property-only click test passed: Heritage site info shown in clear airspace');
  });

  it('should return both zone info and property info even when flight is prohibited', async () => {
    // This tests that State 1 (prohibited) still includes property restrictions in the response
    // even though the property restrictions don't affect the flight decision
    const testLat = 51.5000;
    const testLon = -0.1200;

    // Create a no-fly zone
    const zoneResult = await pool.query(
      `INSERT INTO restriction_zones (
        zone_type, restriction_name, geometry, authority_source, data_source_id,
        altitude_floor, altitude_ceiling, authorization_possible, confidence_level
      ) VALUES (
        'no-fly',
        'Test No-Fly Zone',
        ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 400)::geometry),
        'Test CAA',
        $3,
        0,
        400,
        false,
        'primary-authority'
      ) RETURNING zone_id`,
      [testLon, testLat, dataSourceIds['Test CAA']]
    );
    zoneId = zoneResult.rows[0].zone_id;

    // Create a property restriction at the same location
    const propertyResult = await pool.query(
      `INSERT INTO property_restrictions (
        property_name, managing_organization, geometry, policy_text,
        restriction_category, data_source_id
      ) VALUES (
        'Test Historic Building',
        'Test Organization',
        ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 150)::geometry),
        'Protected building. No drone flights.',
        'HERITAGE_SITE',
        $3
      ) RETURNING property_id`,
      [testLon, testLat, dataSourceIds['Test Historic England']]
    );
    propertyId = propertyResult.rows[0].property_id;

    // Check location
    const result = await service.checkLocation(testLat, testLon);

    // Should have zone info
    expect(result.zones.length).toBeGreaterThan(0);
    expect(result.zones[0].zone_type).toBe('no-fly');

    // Should also have property info (even though flight is prohibited due to zone)
    expect(result.property_restrictions.length).toBeGreaterThan(0);
    expect(result.property_restrictions[0].property_name).toBe('Test Historic Building');

    // Flight status should be 'prohibited' (airspace takes precedence)
    expect(result.flight_status).toBe('prohibited');

    console.log('✅ Multi-layer with no-fly test passed: Both layers shown even when prohibited');
  });
});
