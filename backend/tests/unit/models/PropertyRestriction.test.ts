import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PropertyRestriction } from '../../../src/models/PropertyRestriction.js';
import { getDbPool } from '../../../src/lib/db.js';
import type { Pool } from 'pg';

/**
 * PropertyRestriction Model Tests (T017)
 * 
 * Tests CRUD operations and validation for the PropertyRestriction model.
 * This model represents heritage sites and other properties with specific
 * drone flight policies.
 * 
 * Test Coverage:
 * - Required field validation (property_name, managing_organization, geometry)
 * - Geometry validation (MultiPolygon, EPSG:4326)
 * - Policy text constraints (max 5000 chars)
 * - Timestamp auto-generation (created_at, last_updated)
 * - Foreign key constraints (data_source_id)
 * - CRUD operations (create, read, update, delete)
 * - Spatial queries (findByCoordinates, findInBbox)
 * - Organization filtering
 */
describe('PropertyRestriction Model - Heritage Sites', () => {
  let pool: Pool;
  let testDataSourceId: string;
  let testPropertyIds: string[] = [];

  beforeAll(async () => {
    pool = getDbPool();
    await pool.query('SELECT 1');

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

  describe('create - Property Creation', () => {
    it('should create property restriction with all required fields', async () => {
      const geometry = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-1.0, 51.0],
              [-1.0, 51.1],
              [-0.9, 51.1],
              [-0.9, 51.0],
              [-1.0, 51.0],
            ],
          ],
        ],
      };

      const property = await PropertyRestriction.create({
        property_name: 'Test Heritage Site',
        managing_organization: 'Test National Trust',
        geometry,
        policy_text: 'Drone flights require prior authorization.',
        contact_info: 'test@heritage.org',
        data_source_id: testDataSourceId,
      });

      testPropertyIds.push(property.property_id);

      expect(property.property_id).toBeDefined();
      expect(property.property_name).toBe('Test Heritage Site');
      expect(property.managing_organization).toBe('Test National Trust');
      expect(property.policy_text).toBe('Drone flights require prior authorization.');
      expect(property.contact_info).toBe('test@heritage.org');
      expect(property.created_at).toBeInstanceOf(Date);
      expect(property.last_updated).toBeInstanceOf(Date);
    });

    it('should fail when property_name is missing', async () => {
      const geometry = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-1.0, 51.0],
              [-1.0, 51.1],
              [-0.9, 51.1],
              [-0.9, 51.0],
              [-1.0, 51.0],
            ],
          ],
        ],
      };

      await expect(async () => {
        await PropertyRestriction.create({
          property_name: undefined as any, // Missing required field
          managing_organization: 'Test Org',
          geometry,
          data_source_id: testDataSourceId,
        });
      }).rejects.toThrow(/property_name|required|NOT NULL/i);
    });

    it('should fail when managing_organization is missing', async () => {
      const geometry = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-1.0, 51.0],
              [-1.0, 51.1],
              [-0.9, 51.1],
              [-0.9, 51.0],
              [-1.0, 51.0],
            ],
          ],
        ],
      };

      await expect(async () => {
        await PropertyRestriction.create({
          property_name: 'Test Property',
          managing_organization: undefined as any, // Missing required field
          geometry,
          data_source_id: testDataSourceId,
        });
      }).rejects.toThrow(/managing_organization|required|NOT NULL/i);
    });

    it('should fail when geometry is missing', async () => {
      await expect(async () => {
        await PropertyRestriction.create({
          property_name: 'Test Property',
          managing_organization: 'Test Org',
          geometry: undefined as any, // Missing required field
          data_source_id: testDataSourceId,
        });
      }).rejects.toThrow(/geometry|required|NOT NULL/i);
    });

    it('should accept geometry as Polygon (auto-converted to MultiPolygon)', async () => {
      const geometry = {
        type: 'Polygon', // Should be converted to MultiPolygon
        coordinates: [
          [
            [-1.0, 51.0],
            [-1.0, 51.1],
            [-0.9, 51.1],
            [-0.9, 51.0],
            [-1.0, 51.0],
          ],
        ],
      };

      const property = await PropertyRestriction.create({
        property_name: 'Test Polygon Property',
        managing_organization: 'Test Org',
        geometry,
        data_source_id: testDataSourceId,
      });

      testPropertyIds.push(property.property_id);
      expect(property.property_id).toBeDefined();
    });

    it('should enforce policy_text max length 5000 chars', async () => {
      const geometry = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-1.0, 51.0],
              [-1.0, 51.1],
              [-0.9, 51.1],
              [-0.9, 51.0],
              [-1.0, 51.0],
            ],
          ],
        ],
      };

      const longPolicy = 'x'.repeat(5001); // Exceeds 5000 char limit

      await expect(async () => {
        await PropertyRestriction.create({
          property_name: 'Test Long Policy',
          managing_organization: 'Test Org',
          geometry,
          policy_text: longPolicy,
          data_source_id: testDataSourceId,
        });
      }).rejects.toThrow(/policy_text|length|5000|constraint/i);
    });

    it('should accept policy_text at exactly 5000 chars', async () => {
      const geometry = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-1.0, 51.0],
              [-1.0, 51.1],
              [-0.9, 51.1],
              [-0.9, 51.0],
              [-1.0, 51.0],
            ],
          ],
        ],
      };

      const maxPolicy = 'x'.repeat(5000); // Exactly at limit

      const property = await PropertyRestriction.create({
        property_name: 'Test Max Policy',
        managing_organization: 'Test Org',
        geometry,
        policy_text: maxPolicy,
        data_source_id: testDataSourceId,
      });

      testPropertyIds.push(property.property_id);
      expect(property.property_text?.length).toBe(5000);
    });
  });

  describe('findByCoordinates - Spatial Query', () => {
    it('should find property restrictions at coordinates inside geometry', async () => {
      const geometry = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-1.0, 51.0],
              [-1.0, 51.1],
              [-0.9, 51.1],
              [-0.9, 51.0],
              [-1.0, 51.0],
            ],
          ],
        ],
      };

      const property = await PropertyRestriction.create({
        property_name: 'Test Findable Property',
        managing_organization: 'Test Org',
        geometry,
        data_source_id: testDataSourceId,
      });
      testPropertyIds.push(property.property_id);

      // Query coordinates inside geometry
      const found = await PropertyRestriction.findByCoordinates(-0.95, 51.05);

      expect(found.length).toBeGreaterThanOrEqual(1);
      expect(found.some(p => p.property_id === property.property_id)).toBe(true);
      expect(found[0].property_name).toBe('Test Findable Property');
    });

    it('should return empty array for coordinates outside all geometries', async () => {
      const geometry = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-1.0, 51.0],
              [-1.0, 51.1],
              [-0.9, 51.1],
              [-0.9, 51.0],
              [-1.0, 51.0],
            ],
          ],
        ],
      };

      const property = await PropertyRestriction.create({
        property_name: 'Test Outside Property',
        managing_organization: 'Test Org',
        geometry,
        data_source_id: testDataSourceId,
      });
      testPropertyIds.push(property.property_id);

      // Query coordinates far outside geometry
      const found = await PropertyRestriction.findByCoordinates(-5.0, 55.0);

      expect(found.length).toBe(0);
    });

    it('should return all overlapping properties at coordinates', async () => {
      // Create two overlapping properties
      const geometry1 = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-1.0, 51.0],
              [-1.0, 51.2],
              [-0.8, 51.2],
              [-0.8, 51.0],
              [-1.0, 51.0],
            ],
          ],
        ],
      };

      const geometry2 = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-0.95, 51.05],
              [-0.95, 51.15],
              [-0.85, 51.15],
              [-0.85, 51.05],
              [-0.95, 51.05],
            ],
          ],
        ],
      };

      const prop1 = await PropertyRestriction.create({
        property_name: 'Test Overlap 1',
        managing_organization: 'Org 1',
        geometry: geometry1,
        data_source_id: testDataSourceId,
      });
      testPropertyIds.push(prop1.property_id);

      const prop2 = await PropertyRestriction.create({
        property_name: 'Test Overlap 2',
        managing_organization: 'Org 2',
        geometry: geometry2,
        data_source_id: testDataSourceId,
      });
      testPropertyIds.push(prop2.property_id);

      // Query at overlapping coordinates
      const found = await PropertyRestriction.findByCoordinates(-0.9, 51.1);

      expect(found.length).toBe(2);
      expect(found.map(p => p.property_name)).toContain('Test Overlap 1');
      expect(found.map(p => p.property_name)).toContain('Test Overlap 2');
    });
  });

  describe('findInBbox - Bounding Box Query', () => {
    it('should find all properties within bounding box', async () => {
      const geometry = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-1.0, 51.0],
              [-1.0, 51.1],
              [-0.9, 51.1],
              [-0.9, 51.0],
              [-1.0, 51.0],
            ],
          ],
        ],
      };

      const property = await PropertyRestriction.create({
        property_name: 'Test Bbox Property',
        managing_organization: 'Test Org',
        geometry,
        data_source_id: testDataSourceId,
      });
      testPropertyIds.push(property.property_id);

      // Query bounding box containing property
      const found = await PropertyRestriction.findInBbox({
        west: -1.1,
        south: 50.9,
        east: -0.8,
        north: 51.2,
      });

      expect(found.length).toBeGreaterThanOrEqual(1);
      expect(found.some(p => p.property_id === property.property_id)).toBe(true);
    });

    it('should return empty array for bbox without properties', async () => {
      // Query empty bbox in ocean
      const found = await PropertyRestriction.findInBbox({
        west: -10.0,
        south: 30.0,
        east: -9.0,
        north: 31.0,
      });

      expect(found.length).toBe(0);
    });
  });

  describe('findByOrganization - Organization Filter', () => {
    it('should find all properties by managing organization', async () => {
      const geometry = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-1.0, 51.0],
              [-1.0, 51.1],
              [-0.9, 51.1],
              [-0.9, 51.0],
              [-1.0, 51.0],
            ],
          ],
        ],
      };

      const property = await PropertyRestriction.create({
        property_name: 'Test English Heritage Property',
        managing_organization: 'Historic England',
        geometry,
        data_source_id: testDataSourceId,
      });
      testPropertyIds.push(property.property_id);

      const found = await PropertyRestriction.findByOrganization('Historic England');

      expect(found.length).toBeGreaterThanOrEqual(1);
      expect(found.some(p => p.property_id === property.property_id)).toBe(true);
      expect(found.every(p => p.managing_organization === 'Historic England')).toBe(true);
    });
  });

  describe('update - Property Updates', () => {
    it('should update property policy_text and update last_updated timestamp', async () => {
      const geometry = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-1.0, 51.0],
              [-1.0, 51.1],
              [-0.9, 51.1],
              [-0.9, 51.0],
              [-1.0, 51.0],
            ],
          ],
        ],
      };

      const property = await PropertyRestriction.create({
        property_name: 'Test Update Property',
        managing_organization: 'Test Org',
        geometry,
        policy_text: 'Original policy',
        data_source_id: testDataSourceId,
      });
      testPropertyIds.push(property.property_id);

      const originalUpdatedAt = property.last_updated;

      // Wait 10ms to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await PropertyRestriction.update(property.property_id, {
        policy_text: 'Updated policy text with new requirements',
      });

      expect(updated.policy_text).toBe('Updated policy text with new requirements');
      expect(updated.last_updated.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
      expect(updated.property_name).toBe('Test Update Property'); // Unchanged
    });
  });

  describe('delete - Property Deletion', () => {
    it('should delete property restriction by ID', async () => {
      const geometry = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-1.0, 51.0],
              [-1.0, 51.1],
              [-0.9, 51.1],
              [-0.9, 51.0],
              [-1.0, 51.0],
            ],
          ],
        ],
      };

      const property = await PropertyRestriction.create({
        property_name: 'Test Delete Property',
        managing_organization: 'Test Org',
        geometry,
        data_source_id: testDataSourceId,
      });

      await PropertyRestriction.delete(property.property_id);

      // Verify deletion
      const found = await PropertyRestriction.findById(property.property_id);
      expect(found).toBeNull();
    });
  });
});
