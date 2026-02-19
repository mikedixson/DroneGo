/**
 * Privacy Compliance Integration Tests
 * 
 * Tests NFR-005: No Location Storage
 * "User coordinates submitted for location checks must NOT be stored in the database,
 * only restriction/zone data is stored"
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import express, { Express } from 'express';
import request from 'supertest';
import { getDbPool } from '../../src/lib/db.js';
import { locationRouter } from '../../src/api/location.js';

describe('NFR-005: No Location Storage Compliance', () => {
  let pool: Pool;
  let app: Express;
  const testDataSourceIds: { [key: string]: string } = {};
  const testZoneIds: string[] = [];

  beforeAll(async () => {
    pool = getDbPool();
    await pool.query('SELECT 1');

    // Create Express app with location router
    app = express();
    app.use(express.json());
    app.use('/location', locationRouter);

    // Create test data source
    const dataSourceResult = await pool.query(
      `INSERT INTO data_sources (authority_name, data_type_provided, reliability_level, attribution, license, sync_frequency)
       VALUES ('Privacy Test Authority', ARRAY['geographic_zones'], 'primary-authority', 'Test', 'Test', 'daily')
       RETURNING source_id`
    );
    testDataSourceIds['Privacy Test'] = dataSourceResult.rows[0].source_id;
  });

  afterAll(async () => {
    // Clean up test zones
    if (testZoneIds.length > 0) {
      await pool.query('DELETE FROM restriction_zones WHERE zone_id = ANY($1)', [testZoneIds]);
    }
    // Clean up test data sources
    await pool.query("DELETE FROM data_sources WHERE authority_name = 'Privacy Test Authority'");
  });

  beforeEach(async () => {
    // Clean up any test zones before each test
    await pool.query("DELETE FROM restriction_zones WHERE restriction_name LIKE 'Privacy Test%'");
    testZoneIds.length = 0;
  });

  describe('Location Query Privacy', () => {
    it('should NOT persist user coordinates to database', async () => {
      const testLat = 51.5074;
      const testLng = -0.1278;

      // Make a location check request
      const response = await request(app)
        .get('/location/check')
        .query({ lat: testLat, lng: testLng });

      expect(response.status).toBe(200);

      // Query database for any table that might store coordinates
      // Check restriction_zones table (should not have these exact coordinates)
      const zoneResult = await pool.query(
        `SELECT * FROM restriction_zones 
         WHERE ST_Intersects(geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))`,
        [testLng, testLat]
      );
      // This is OK - zones can contain the point, but shouldn't be created BY the query

      // Check if there's a location_history or user_queries table (should not exist)
      const tableCheckResult = await pool.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = 'public' 
         AND (table_name LIKE '%location_history%' OR table_name LIKE '%user_quer%' OR table_name LIKE '%coordinate%')`
      );
      expect(tableCheckResult.rows.length).toBe(0);

      // Verify no audit log of user coordinates
      const auditResult = await pool.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = 'public' 
         AND table_name LIKE '%audit%'`
      );
      // If audit table exists, verify it doesn't contain user coordinates
      if (auditResult.rows.length > 0) {
        for (const row of auditResult.rows) {
          const auditData = await pool.query(`SELECT * FROM ${row.table_name} LIMIT 10`);
          // Audit should not contain raw latitude/longitude values
          const hasCoordinates = auditData.rows.some((record: any) => 
            JSON.stringify(record).includes(testLat.toString()) || 
            JSON.stringify(record).includes(testLng.toString())
          );
          expect(hasCoordinates).toBe(false);
        }
      }
    });

    it('should NOT create location records for multiple queries to same coordinates', async () => {
      const testLat = 51.4545;
      const testLng = -0.9781;

      // Make 5 identical requests
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .get('/location/check')
          .query({ lat: testLat, lng: testLng });
        expect(response.status).toBe(200);
      }

      // Verify no location query log exists
      const logCheckResult = await pool.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = 'public' 
         AND (table_name LIKE '%query_log%' OR table_name LIKE '%request_log%')`
      );
      expect(logCheckResult.rows.length).toBe(0);
    });

    it('should NOT store coordinates in any VARCHAR/TEXT fields', async () => {
      const testLat = 52.2053;
      const testLng = 0.1218;

      // Make a location check request
      const response = await request(app)
        .get('/location/check')
        .query({ lat: testLat, lng: testLng });

      expect(response.status).toBe(200);

      // Query all VARCHAR/TEXT columns across all tables for these coordinates
      const allTablesResult = await pool.query(
        `SELECT table_name, column_name, data_type 
         FROM information_schema.columns 
         WHERE table_schema = 'public' 
         AND (data_type = 'character varying' OR data_type = 'text')`
      );

      for (const col of allTablesResult.rows) {
        const searchResult = await pool.query(
          `SELECT COUNT(*) as count FROM ${col.table_name} 
           WHERE ${col.column_name}::text LIKE '%${testLat}%' 
           OR ${col.column_name}::text LIKE '%${testLng}%'`
        );
        // Allow for coordinates in zone descriptions/names (those are restriction zones, not user queries)
        // But there should be no NEW records created
        const initialCount = parseInt(searchResult.rows[0].count);
        
        // Make another query
        await request(app).get('/location/check').query({ lat: testLat, lng: testLng });
        
        // Re-check count
        const afterResult = await pool.query(
          `SELECT COUNT(*) as count FROM ${col.table_name} 
           WHERE ${col.column_name}::text LIKE '%${testLat}%' 
           OR ${col.column_name}::text LIKE '%${testLng}%'`
        );
        const afterCount = parseInt(afterResult.rows[0].count);
        
        // Count should not increase
        expect(afterCount).toBe(initialCount);
      }
    });

    it('should only store restriction zone geometry, not query point geometry', async () => {
      const testLat = 51.5555;
      const testLng = -0.2222;

      // Make a location check request
      const response = await request(app)
        .get('/location/check')
        .query({ lat: testLat, lng: testLng });

      expect(response.status).toBe(200);

      // Check geometry columns - should not have a POINT geometry matching query
      const geometryCheckResult = await pool.query(
        `SELECT table_name, column_name 
         FROM information_schema.columns 
         WHERE table_schema = 'public' 
         AND udt_name = 'geometry'`
      );

      for (const col of geometryCheckResult.rows) {
        // Check if any POINT geometries exist with these exact coordinates
        const pointResult = await pool.query(
          `SELECT COUNT(*) as count FROM ${col.table_name} 
           WHERE ST_GeometryType(${col.column_name}) = 'ST_Point'
           AND ST_X(${col.column_name}) = $1 
           AND ST_Y(${col.column_name}) = $2`,
          [testLng, testLat]
        );
        // Should be 0 - we don't store user query points
        expect(parseInt(pointResult.rows[0].count)).toBe(0);
      }
    });
  });

  describe('Privacy Policy Compliance', () => {
    it('should not log IP addresses with coordinates', async () => {
      const testLat = 51.3781;
      const testLng = -1.2345;

      // Make a location check request
      const response = await request(app)
        .get('/location/check')
        .query({ lat: testLat, lng: testLng });

      expect(response.status).toBe(200);

      // Check for any log tables that might store IP + coordinates
      const logTablesResult = await pool.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = 'public' 
         AND table_name LIKE '%log%'`
      );

      // If log tables exist, verify they don't contain coordinate data
      for (const row of logTablesResult.rows) {
        const columns = await pool.query(
          `SELECT column_name FROM information_schema.columns 
           WHERE table_schema = 'public' 
           AND table_name = $1`,
          [row.table_name]
        );
        const columnNames = columns.rows.map((c: any) => c.column_name);
        
        // Log tables should not have latitude/longitude columns
        const hasCoordinateColumns = columnNames.some((name: string) => 
          name.includes('lat') || name.includes('lng') || name.includes('longitude') || name.includes('coordinate')
        );
        expect(hasCoordinateColumns).toBe(false);
      }
    });

    it('should not create analytics records with PII (coordinates)', async () => {
      const testLat = 50.8503;
      const testLng = -0.1345;

      const response = await request(app)
        .get('/location/check')
        .query({ lat: testLat, lng: testLng });

      expect(response.status).toBe(200);

      // Check for analytics/metrics tables
      const analyticsTablesResult = await pool.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = 'public' 
         AND (table_name LIKE '%analytics%' OR table_name LIKE '%metrics%' OR table_name LIKE '%stats%')`
      );

      expect(analyticsTablesResult.rows.length).toBe(0);
    });
  });
});
