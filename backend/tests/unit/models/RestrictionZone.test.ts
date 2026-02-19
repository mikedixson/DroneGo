import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { RestrictionZone } from '../../../src/models/RestrictionZone.js';
import { getDbPool } from '../../../src/lib/db.js';

describe('RestrictionZone Model', () => {
  let restrictionZone: RestrictionZone;
  let testZoneId: string;
  let testDataSourceId: string;

  beforeAll(async () => {
    // Ensure database connection
    const pool = getDbPool();
    await pool.query('SELECT 1');
    
    // Create a test data_source for use across tests
    const dataSourceResult = await pool.query(`
      INSERT INTO data_sources (authority_name, last_sync_timestamp)
      VALUES ('Test Authority', CURRENT_TIMESTAMP)
      RETURNING source_id
    `);
    testDataSourceId = dataSourceResult.rows[0].source_id;
  });

  beforeEach(() => {
    restrictionZone = new RestrictionZone();
  });

  afterAll(async () => {
    // Clean up test data
    const pool = getDbPool();
    if (testZoneId) {
      await restrictionZone.delete(testZoneId);
    }
    // Delete test data_source (CASCADE will delete any zones)
    if (testDataSourceId) {
      await pool.query('DELETE FROM data_sources WHERE source_id = $1', [testDataSourceId]);
    }
    await pool.end();
  });

  describe('Model Configuration', () => {
    it('should have correct table name', () => {
      expect(restrictionZone['tableName']).toBe('restriction_zones');
    });

    it('should have correct primary key', () => {
      expect(restrictionZone['primaryKey']).toBe('zone_id');
    });
  });

  describe('CRUD Operations', () => {
    it('should create a new restriction zone', async () => {
      const zoneData = {
        zone_type: 'no-fly',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-0.4543, 51.47],
              [-0.4543, 51.485],
              [-0.42, 51.485],
              [-0.42, 51.47],
              [-0.4543, 51.47],
            ],
          ],
        },
        authority_source: 'CAA',
        restriction_name: 'Test No-Fly Zone',
        altitude_floor: 0,
        altitude_ceiling: 2500,
        description: 'Test restriction zone for unit testing',
        authorization_possible: false,
        confidence_level: 'primary-authority',
        data_source_id: testDataSourceId,
      };

      const created = await restrictionZone.create(zoneData);
      testZoneId = created.zone_id;

      expect(created).toBeDefined();
      expect(created.zone_id).toBeDefined();
      expect(created.zone_type).toBe('no-fly');
      expect(created.restriction_name).toBe('Test No-Fly Zone');
      expect(created.altitude_floor).toBe(0);
      expect(created.altitude_ceiling).toBe(2500);
      expect(created.created_at).toBeInstanceOf(Date);
    });

    it('should find restriction zone by ID', async () => {
      const found = await restrictionZone.findById(testZoneId);

      expect(found).toBeDefined();
      expect(found?.zone_id).toBe(testZoneId);
      expect(found?.zone_type).toBe('no-fly');
      expect(found?.restriction_name).toBe('Test No-Fly Zone');
    });

    it('should return null for non-existent ID', async () => {
      const found = await restrictionZone.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });

    it('should find all restriction zones with conditions', async () => {
      const zones = await restrictionZone.findAll({ zone_type: 'no-fly' });

      expect(Array.isArray(zones)).toBe(true);
      expect(zones.length).toBeGreaterThan(0);
      expect(zones[0].zone_type).toBe('no-fly');
    });

    it('should update a restriction zone', async () => {
      const updated = await restrictionZone.update(testZoneId, {
        description: 'Updated test description',
        altitude_ceiling: 3000,
      });

      expect(updated).toBeDefined();
      expect(updated?.description).toBe('Updated test description');
      expect(updated?.altitude_ceiling).toBe(3000);
      expect(updated?.last_updated).toBeDefined();
    });

    it('should count restriction zones', async () => {
      const count = await restrictionZone.count({ zone_type: 'no-fly' });
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should delete a restriction zone', async () => {
      const deleted = await restrictionZone.delete(testZoneId);
      expect(deleted).toBe(true);

      const found = await restrictionZone.findById(testZoneId);
      expect(found).toBeNull();
      
      testZoneId = ''; // Mark as deleted
    });
  });

  describe('Data Validation', () => {
    it('should validate zone_type enum values', async () => {
      const invalidZone = {
        zone_type: 'invalid-type',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-0.1, 51.5],
              [-0.1, 51.51],
              [-0.09, 51.51],
              [-0.09, 51.5],
              [-0.1, 51.5],
            ],
          ],
        },
        authority_source: 'CAA',
        restriction_name: 'Invalid Type Test',
        confidence_level: 'primary-authority',
      };

      await expect(restrictionZone.create(invalidZone)).rejects.toThrow();
    });

    it('should validate altitude consistency (ceiling >= floor)', async () => {
      const invalidAltitude = {
        zone_type: 'controlled-airspace',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-0.1, 51.5],
              [-0.1, 51.51],
              [-0.09, 51.51],
              [-0.09, 51.5],
              [-0.1, 51.5],
            ],
          ],
        },
        authority_source: 'CAA',
        restriction_name: 'Invalid Altitude Test',
        altitude_floor: 3000,
        altitude_ceiling: 1000,
        confidence_level: 'primary-authority',
      };

      await expect(restrictionZone.create(invalidAltitude)).rejects.toThrow();
    });

    it('should validate effective date ordering for temporary restrictions', async () => {
      const invalidDates = {
        zone_type: 'temporary-restriction',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-0.1, 51.5],
              [-0.1, 51.51],
              [-0.09, 51.51],
              [-0.09, 51.5],
              [-0.1, 51.5],
            ],
          ],
        },
        authority_source: 'NOTAM',
        restriction_name: 'Invalid Dates Test',
        effective_start: new Date('2026-12-31'),
        effective_end: new Date('2026-01-01'),
        confidence_level: 'primary-authority',
      };

      await expect(restrictionZone.create(invalidDates)).rejects.toThrow();
    });

    it('should require valid geometry', async () => {
      const invalidGeometry = {
        zone_type: 'no-fly',
        geometry: null,
        authority_source: 'CAA',
        restriction_name: 'Invalid Geometry Test',
        confidence_level: 'primary-authority',
      };

      await expect(restrictionZone.create(invalidGeometry)).rejects.toThrow();
    });
  });

  describe('Query Methods', () => {
    it('should find zones by type', async () => {
      const zones = await restrictionZone.findByType('no-fly');
      
      expect(Array.isArray(zones)).toBe(true);
      zones.forEach((zone) => {
        expect(zone.zone_type).toBe('no-fly');
      });
    });

    it('should find active zones (no expired temporary restrictions)', async () => {
      const activeZones = await restrictionZone.findActive();
      
      expect(Array.isArray(activeZones)).toBe(true);
      activeZones.forEach((zone) => {
        if (zone.effective_end) {
          expect(zone.effective_end.getTime()).toBeGreaterThan(Date.now());
        }
      });
    });

    it('should find zones by authority source', async () => {
      const caaZones = await restrictionZone.findByAuthority('CAA');
      
      expect(Array.isArray(caaZones)).toBe(true);
      caaZones.forEach((zone) => {
        expect(zone.authority_source).toBe('CAA');
      });
    });

    it('should find zones by confidence level', async () => {
      const primaryZones = await restrictionZone.findByConfidenceLevel('primary-authority');
      
      expect(Array.isArray(primaryZones)).toBe(true);
      primaryZones.forEach((zone) => {
        expect(zone.confidence_level).toBe('primary-authority');
      });
    });
  });

  describe('Geospatial Query Placeholders', () => {
    it('should have method to find zones containing a point', async () => {
      expect(typeof restrictionZone.findContainingPoint).toBe('function');
    });

    it('should have method to find zones within bounding box', async () => {
      expect(typeof restrictionZone.findWithinBounds).toBe('function');
    });

    it('should have method to find zones intersecting with geometry', async () => {
      expect(typeof restrictionZone.findIntersecting).toBe('function');
    });
  });

  describe('mapRow method', () => {
    it('should transform database row to camelCase properties', () => {
      const dbRow = {
        zone_id: '123e4567-e89b-12d3-a456-426614174000',
        zone_type: 'no-fly',
        restriction_name: 'Test Zone',
        authority_source: 'CAA',
        altitude_floor: 0,
        altitude_ceiling: 2500,
        effective_start: null,
        effective_end: null,
        authorization_possible: false,
        confidence_level: 'primary-authority',
        created_at: new Date(),
        last_updated: new Date(),
      };

      const mapped = restrictionZone['mapRow'](dbRow);

      expect(mapped.zone_id).toBe(dbRow.zone_id);
      expect(mapped.zone_type).toBe(dbRow.zone_type);
      expect(mapped.restriction_name).toBe(dbRow.restriction_name);
    });
  });
});
