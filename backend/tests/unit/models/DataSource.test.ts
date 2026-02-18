import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DataSource } from '../../../src/models/DataSource.js';
import { getDbPool } from '../../../src/lib/db.js';

describe('DataSource Model', () => {
  let dataSource: DataSource;
  let testSourceId: string;

  beforeAll(async () => {
    // Ensure database connection
    const pool = getDbPool();
    await pool.query('SELECT 1');
  });

  beforeEach(() => {
    dataSource = new DataSource();
  });

  afterAll(async () => {
    // Clean up test data
    if (testSourceId) {
      await dataSource.delete(testSourceId);
    }
    const pool = getDbPool();
    await pool.end();
  });

  describe('Model Configuration', () => {
    it('should have correct table name', () => {
      expect(dataSource['tableName']).toBe('data_sources');
    });

    it('should have correct primary key', () => {
      expect(dataSource['primaryKey']).toBe('source_id');
    });
  });

  describe('CRUD Operations', () => {
    it('should create a new data source', async () => {
      const sourceData = {
        authority_name: 'Test Aviation Authority',
        data_type_provided: ['geographic_zones', 'test_data'],
        sync_frequency: 'daily',
        reliability_level: 'primary-authority',
        data_url: 'https://example.com/test-data',
        license: 'Open Government License v3.0',
        attribution: 'Test attribution text',
        contact_email: 'test@example.com',
      };

      const created = await dataSource.create(sourceData);
      testSourceId = created.source_id;

      expect(created).toBeDefined();
      expect(created.source_id).toBeDefined();
      expect(created.authority_name).toBe('Test Aviation Authority');
      expect(created.data_type_provided).toEqual(['geographic_zones', 'test_data']);
      expect(created.sync_frequency).toBe('daily');
      expect(created.reliability_level).toBe('primary-authority');
      expect(created.created_at).toBeInstanceOf(Date);
    });

    it('should find data source by ID', async () => {
      const found = await dataSource.findById(testSourceId);

      expect(found).toBeDefined();
      expect(found?.source_id).toBe(testSourceId);
      expect(found?.authority_name).toBe('Test Aviation Authority');
      expect(found?.reliability_level).toBe('primary-authority');
    });

    it('should return null for non-existent ID', async () => {
      const found = await dataSource.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });

    it('should find all data sources', async () => {
      const sources = await dataSource.findAll();

      expect(Array.isArray(sources)).toBe(true);
      expect(sources.length).toBeGreaterThan(0);
    });

    it('should update a data source', async () => {
      const updated = await dataSource.update(testSourceId, {
        sync_frequency: 'weekly',
        contact_email: 'updated@example.com',
      });

      expect(updated).toBeDefined();
      expect(updated?.sync_frequency).toBe('weekly');
      expect(updated?.contact_email).toBe('updated@example.com');
      expect(updated?.last_updated).toBeDefined();
    });

    it('should count data sources', async () => {
      const count = await dataSource.count();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should delete a data source', async () => {
      const deleted = await dataSource.delete(testSourceId);
      expect(deleted).toBe(true);

      const found = await dataSource.findById(testSourceId);
      expect(found).toBeNull();

      testSourceId = ''; // Mark as deleted
    });
  });

  describe('Data Validation', () => {
    it('should enforce unique authority_name', async () => {
      const sourceData = {
        authority_name: 'UK Civil Aviation Authority', // Pre-seeded in database
        data_type_provided: ['test'],
        sync_frequency: 'daily',
        reliability_level: 'primary-authority',
        license: 'Test',
        attribution: 'Test',
      };

      await expect(dataSource.create(sourceData)).rejects.toThrow();
    });

    it('should validate reliability_level enum values', async () => {
      const invalidSource = {
        authority_name: 'Invalid Reliability Test',
        data_type_provided: ['test'],
        sync_frequency: 'daily',
        reliability_level: 'invalid-level',
        license: 'Test',
        attribution: 'Test',
      };

      await expect(dataSource.create(invalidSource)).rejects.toThrow();
    });

    it('should require primary fields', async () => {
      const incompleteSource = {
        authority_name: 'Incomplete Source',
        // Missing required fields
      };

      await expect(dataSource.create(incompleteSource)).rejects.toThrow();
    });
  });

  describe('Query Methods', () => {
    it('should find data source by authority name', async () => {
      const found = await dataSource.findByName('UK Civil Aviation Authority');

      expect(found).toBeDefined();
      expect(found?.authority_name).toBe('UK Civil Aviation Authority');
      expect(found?.reliability_level).toBe('primary-authority');
    });

    it('should return null for non-existent authority name', async () => {
      const found = await dataSource.findByName('Non-Existent Authority');
      expect(found).toBeNull();
    });

    it('should find data sources by reliability level', async () => {
      const primarySources = await dataSource.findByReliabilityLevel('primary-authority');

      expect(Array.isArray(primarySources)).toBe(true);
      expect(primarySources.length).toBeGreaterThan(0);
      primarySources.forEach((source) => {
        expect(source.reliability_level).toBe('primary-authority');
      });
    });

    it('should find stale data sources (not synced recently)', async () => {
      // Update last_sync_timestamp to old date
      await dataSource.query(
        `UPDATE data_sources SET last_sync_timestamp = NOW() - INTERVAL '3 days' WHERE source_id = $1`,
        [testSourceId]
      );

      const staleSources = await dataSource.findStale(48); // 48 hours

      expect(Array.isArray(staleSources)).toBe(true);
      const testSource = staleSources.find((s) => s.source_id === testSourceId);
      expect(testSource).toBeDefined();
    });

    it('should get all pre-seeded sources', async () => {
      const preSeeded = await dataSource.findAll();

      // Expect at least CAA, NATS, and NOTAM sources
      expect(preSeeded.length).toBeGreaterThanOrEqual(3);

      const sourceNames = preSeeded.map((s) => s.authority_name);
      expect(sourceNames).toContain('UK Civil Aviation Authority');
      expect(sourceNames).toContain('NATS AIS');
      expect(sourceNames).toContain('UK NOTAM Service');
    });
  });

  describe('Sync Timestamp Operations', () => {
    it('should update last_sync_timestamp', async () => {
      const beforeSync = new Date();

      await dataSource.updateSyncTimestamp(testSourceId);

      const updated = await dataSource.findById(testSourceId);
      expect(updated).toBeDefined();
      expect(updated?.last_sync_timestamp).toBeInstanceOf(Date);
      expect(updated!.last_sync_timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeSync.getTime()
      );
    });

    it('should get time since last sync', async () => {
      // Update to known old timestamp
      await dataSource.query(
        `UPDATE data_sources SET last_sync_timestamp = NOW() - INTERVAL '2 days' WHERE source_id = $1`,
        [testSourceId]
      );

      const hoursSinceSync = await dataSource.getHoursSinceLastSync(testSourceId);

      expect(typeof hoursSinceSync).toBe('number');
      expect(hoursSinceSync).toBeGreaterThan(48); // More than 2 days
    });
  });

  describe('mapRow method', () => {
    it('should transform database row with date parsing', () => {
      const dbRow = {
        source_id: '123e4567-e89b-12d3-a456-426614174000',
        authority_name: 'Test Authority',
        data_type_provided: ['zones', 'airspace'],
        last_sync_timestamp: new Date('2026-02-15T10:00:00Z'),
        sync_frequency: 'daily',
        reliability_level: 'primary-authority',
        data_url: 'https://example.com',
        license: 'OGL v3.0',
        attribution: 'Test attribution',
        contact_email: 'test@example.com',
        created_at: new Date(),
        last_updated: new Date(),
      };

      const mapped = dataSource['mapRow'](dbRow);

      expect(mapped.source_id).toBe(dbRow.source_id);
      expect(mapped.authority_name).toBe(dbRow.authority_name);
      expect(mapped.data_type_provided).toEqual(dbRow.data_type_provided);
      expect(mapped.last_sync_timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Business Logic', () => {
    it('should identify CAA as primary authority', async () => {
      const caa = await dataSource.findByName('UK Civil Aviation Authority');
      expect(caa?.reliability_level).toBe('primary-authority');
    });

    it('should identify NATS as primary authority', async () => {
      const nats = await dataSource.findByName('NATS AIS');
      expect(nats?.reliability_level).toBe('primary-authority');
    });

    it('should have correct data types for CAA', async () => {
      const caa = await dataSource.findByName('UK Civil Aviation Authority');
      expect(caa?.data_type_provided).toBeInstanceOf(Array);
      expect(caa?.data_type_provided).toContain('geographic_zones');
    });

    it('should have appropriate sync frequency', async () => {
      const sources = await dataSource.findAll();

      sources.forEach((source) => {
        expect(source.sync_frequency).toBeDefined();
        expect(typeof source.sync_frequency).toBe('string');
        expect(source.sync_frequency.length).toBeGreaterThan(0);
      });
    });
  });
});
