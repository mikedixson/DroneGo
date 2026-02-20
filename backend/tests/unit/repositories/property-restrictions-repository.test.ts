import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PropertyRestrictionsRepository } from '../../../src/repositories/property-restrictions-repository.js';
import { getDbPool } from '../../../src/lib/db.js';
import type { GeoJSON } from 'geojson';

/**
 * Unit tests for property restrictions repository
 * 
 * Covers:
 * - FR-008: Zoom-level geometry selection
 * - CRUD operations for heritage sites
 * - Duplicate detection queries
 * - Spatial queries with GIST indexes
 * 
 * Contract: data-model.md - Query Patterns
 */
describe('PropertyRestrictionsRepository', () => {
  let repository: PropertyRestrictionsRepository;
  const pool = getDbPool();

  beforeAll(async () => {
    repository = new PropertyRestrictionsRepository();
    
    // Clean up test data
    await pool.query(`
      DELETE FROM property_restrictions 
      WHERE property_name LIKE 'Test Site%'
    `);
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query(`
      DELETE FROM property_restrictions 
      WHERE property_name LIKE 'Test Site%'
    `);
  });

  describe('insertBatch', () => {
    it('should insert multiple heritage sites in a batch', async () => {
      const sites = [
        {
          property_name: 'Test Site 1',
          managing_organization: 'Test Organization',
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [-0.1234, 51.5000],
                  [-0.1234, 51.5010],
                  [-0.1200, 51.5010],
                  [-0.1200, 51.5000],
                  [-0.1234, 51.5000],
                ],
              ],
            ],
          } as GeoJSON.MultiPolygon,
          geometry_simplified_low: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [-0.1234, 51.5000],
                  [-0.1234, 51.5010],
                  [-0.1200, 51.5000],
                  [-0.1234, 51.5000],
                ],
              ],
            ],
          } as GeoJSON.MultiPolygon,
          geometry_simplified_medium: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [-0.1234, 51.5000],
                  [-0.1234, 51.5010],
                  [-0.1200, 51.5010],
                  [-0.1200, 51.5000],
                  [-0.1234, 51.5000],
                ],
              ],
            ],
          } as GeoJSON.MultiPolygon,
          restriction_category: 'HERITAGE_SITE',
          policy_text: 'Test policy',
          data_source_id: null,
        },
        {
          property_name: 'Test Site 2',
          managing_organization: 'Test Organization',
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [-0.1300, 51.5020],
                  [-0.1300, 51.5030],
                  [-0.1270, 51.5030],
                  [-0.1270, 51.5020],
                  [-0.1300, 51.5020],
                ],
              ],
            ],
          } as GeoJSON.MultiPolygon,
          geometry_simplified_low: null,
          geometry_simplified_medium: null,
          restriction_category: 'HERITAGE_SITE',
          policy_text: 'Test policy 2',
          data_source_id: null,
        },
      ];

      const result = await repository.insertBatch(sites);

      expect(result.inserted).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.ids).toHaveLength(2);
    });

    it('should handle batch insert errors gracefully', async () => {
      const sitesWithInvalid = [
        {
          property_name: 'Test Site Valid',
          managing_organization: 'Test Org',
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [-0.1400, 51.5040],
                  [-0.1400, 51.5050],
                  [-0.1370, 51.5050],
                  [-0.1370, 51.5040],
                  [-0.1400, 51.5040],
                ],
              ],
            ],
          } as GeoJSON.MultiPolygon,
          geometry_simplified_low: null,
          geometry_simplified_medium: null,
          restriction_category: 'HERITAGE_SITE',
          policy_text: 'Valid',
          data_source_id: null,
        },
        {
          property_name: null as any, // Invalid: required field
          managing_organization: 'Test Org',
          geometry: {} as any,
          geometry_simplified_low: null,
          geometry_simplified_medium: null,
          restriction_category: 'HERITAGE_SITE',
          policy_text: 'Invalid',
          data_source_id: null,
        },
      ];

      const result = await repository.insertBatch(sitesWithInvalid);

      expect(result.failed).toBeGreaterThan(0);
      expect(result.errors).toBeDefined();
    });
  });

  describe('getByZoomLevel', () => {
    beforeAll(async () => {
      // Insert test site with all geometry variants
      await pool.query(`
        INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, 
          geometry_simplified_low, geometry_simplified_medium,
          restriction_category
        ) VALUES (
          'Test Zoom Site',
          'Test Org',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          ST_Multi(ST_GeomFromGeoJSON($2)),
          ST_Multi(ST_GeomFromGeoJSON($3)),
          'HERITAGE_SITE'
        )
      `, [
        JSON.stringify({
          type: 'Polygon',
          coordinates: [
            [
              [-0.1500, 51.5100],
              [-0.1500, 51.5110],
              [-0.1470, 51.5110],
              [-0.1470, 51.5100],
              [-0.1500, 51.5100],
            ],
          ],
        }),
        JSON.stringify({
          type: 'Polygon',
          coordinates: [
            [
              [-0.1500, 51.5100],
              [-0.1470, 51.5110],
              [-0.1470, 51.5100],
              [-0.1500, 51.5100],
            ],
          ],
        }),
        JSON.stringify({
          type: 'Polygon',
          coordinates: [
            [
              [-0.1500, 51.5100],
              [-0.1500, 51.5110],
              [-0.1470, 51.5110],
              [-0.1470, 51.5100],
              [-0.1500, 51.5100],
            ],
          ],
        }),
      ]);
    });

    it('should return low detail geometry for zoom < 13', async () => {
      const bbox = {
        west: -0.16,
        south: 51.50,
        east: -0.14,
        north: 51.52,
      };

      const sites = await repository.getByZoomLevel(bbox, 10);

      const testSite = sites.find(s => s.property_name === 'Test Zoom Site');
      expect(testSite).toBeDefined();
      
      // Should use geometry_simplified_low
      const coords = testSite!.geometry.coordinates[0][0];
      expect(coords.length).toBeLessThanOrEqual(4); // Simplified has fewer points
    });

    it('should return medium detail geometry for zoom 13-15', async () => {
      const bbox = {
        west: -0.16,
        south: 51.50,
        east: -0.14,
        north: 51.52,
      };

      const sites = await repository.getByZoomLevel(bbox, 14);

      const testSite = sites.find(s => s.property_name === 'Test Zoom Site');
      expect(testSite).toBeDefined();
    });

    it('should return full detail geometry for zoom > 15', async () => {
      const bbox = {
        west: -0.16,
        south: 51.50,
        east: -0.14,
        north: 51.52,
      };

      const sites = await repository.getByZoomLevel(bbox, 16);

      const testSite = sites.find(s => s.property_name === 'Test Zoom Site');
      expect(testSite).toBeDefined();
      
      // Should use original geometry (most detailed)
      const coords = testSite!.geometry.coordinates[0][0];
      expect(coords.length).toBe(5); // Original has 5 points
    });

    it('should filter by bounding box', async () => {
      const smallBbox = {
        west: -0.2,
        south: 51.6,
        east: -0.19,
        north: 51.61,
      };

      const sites = await repository.getByZoomLevel(smallBbox, 14);

      // Should not include Test Zoom Site (outside bbox)
      const testSite = sites.find(s => s.property_name === 'Test Zoom Site');
      expect(testSite).toBeUndefined();
    });
  });

  describe('findDuplicates', () => {
    beforeAll(async () => {
      // Insert potential duplicate sites
      await pool.query(`
        INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, restriction_category
        ) VALUES 
        (
          'Stonehenge',
          'English Heritage',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'HERITAGE_SITE'
        ),
        (
          'Stonehenge Monument',
          'Historic England',
          ST_Multi(ST_GeomFromGeoJSON($2)),
          'HERITAGE_SITE'
        )
      `, [
        JSON.stringify({
          type: 'Polygon',
          coordinates: [
            [
              [-1.8263, 51.1789],
              [-1.8263, 51.1795],
              [-1.8250, 51.1795],
              [-1.8250, 51.1789],
              [-1.8263, 51.1789],
            ],
          ],
        }),
        JSON.stringify({
          type: 'Polygon',
          coordinates: [
            [
              [-1.8264, 51.1790], // Very close to first
              [-1.8264, 51.1796],
              [-1.8251, 51.1796],
              [-1.8251, 51.1790],
              [-1.8264, 51.1790],
            ],
          ],
        }),
      ]);
    });

    it('should find duplicates based on proximity and name similarity', async () => {
      const candidateGeometry = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-1.8262, 51.1788],
              [-1.8262, 51.1794],
              [-1.8249, 51.1794],
              [-1.8249, 51.1788],
              [-1.8262, 51.1788],
            ],
          ],
        ],
      } as GeoJSON.MultiPolygon;

      const duplicates = await repository.findDuplicates(
        'Stonehenge',
        candidateGeometry,
        250 // 250m proximity threshold
      );

      expect(duplicates.length).toBeGreaterThan(0);
      
      const foundStone = duplicates.find(d => 
        d.property_name.toLowerCase().includes('stonehenge')
      );
      expect(foundStone).toBeDefined();
      expect(foundStone!.distance_meters).toBeLessThan(250);
      expect(foundStone!.name_similarity).toBeGreaterThan(0.6);
    });

    it('should not find duplicates when distance exceeds threshold', async () => {
      const farAwayGeometry = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-1.0, 51.0], // Far from Stonehenge
              [-1.0, 51.01],
              [-0.99, 51.01],
              [-0.99, 51.0],
              [-1.0, 51.0],
            ],
          ],
        ],
      } as GeoJSON.MultiPolygon;

      const duplicates = await repository.findDuplicates(
        'Stonehenge',
        farAwayGeometry,
        250
      );

      // Should not find Stonehenge as duplicate (too far)
      const foundStone = duplicates.find(d =>
        d.property_name.toLowerCase().includes('stonehenge')
      );
      expect(foundStone).toBeUndefined();
    });
  });

  describe('getById', () => {
    it('should retrieve heritage site by ID', async () => {
      // Insert a test site
      const result = await pool.query(`
        INSERT INTO property_restrictions (
          property_name, managing_organization, geometry, restriction_category
        ) VALUES (
          'Test GetById Site',
          'Test Org',
          ST_Multi(ST_GeomFromGeoJSON($1)),
          'HERITAGE_SITE'
        )
        RETURNING property_restriction_id
      `, [
        JSON.stringify({
          type: 'Polygon',
          coordinates: [
            [
              [-0.1600, 51.5200],
              [-0.1600, 51.5210],
              [-0.1570, 51.5210],
              [-0.1570, 51.5200],
              [-0.1600, 51.5200],
            ],
          ],
        }),
      ]);

      const id = result.rows[0].property_restriction_id;
      const site = await repository.getById(id);

      expect(site).toBeDefined();
      expect(site!.property_name).toBe('Test GetById Site');
    });

    it('should return null for non-existent ID', async () => {
      const site = await repository.getById('00000000-0000-0000-0000-000000000000');
      expect(site).toBeNull();
    });
  });
});
