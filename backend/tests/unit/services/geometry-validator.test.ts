import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validateGeometry } from '../../../src/services/geometry-validator.js';
import type { GeoJSON } from 'geojson';

/**
 * Unit tests for geometry validator service
 * 
 * Covers:
 * - FR-001: Validate geometries using ST_IsValid before insertion
 * - FR-002: Convert POLYGON to MULTIPOLYGON for consistency
 * - Bounds checking: lat ∈ [-90, 90], lng ∈ [-180, 180]
 * - Topology validation: no self-intersections, valid rings
 * 
 * Contract: contracts/import-operations.md - Data Validation Interface
 */
describe('GeometryValidator', () => {
  describe('validateGeometry', () => {
    it('should accept valid Polygon and convert to MultiPolygon', async () => {
      const polygon: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [-0.1234, 51.5000],  // Tower of London area
            [-0.1234, 51.5020],
            [-0.1200, 51.5020],
            [-0.1200, 51.5000],
            [-0.1234, 51.5000],  // Closed ring
          ],
        ],
      };

      const result = await validateGeometry(polygon);

      expect(result.valid).toBe(true);
      expect(result.geometry_type).toBe('Polygon');
      expect(result.converted_to_multipolygon).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept valid MultiPolygon without conversion', async () => {
      const multiPolygon: GeoJSON.MultiPolygon = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-0.1234, 51.5000],
              [-0.1234, 51.5020],
              [-0.1200, 51.5020],
              [-0.1200, 51.5000],
              [-0.1234, 51.5000],
            ],
          ],
        ],
      };

      const result = await validateGeometry(multiPolygon);

      expect(result.valid).toBe(true);
      expect(result.geometry_type).toBe('MultiPolygon');
      expect(result.converted_to_multipolygon).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject geometry with latitude out of bounds', async () => {
      const invalidPolygon: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [-0.1234, 91.0000],  // Latitude > 90°
            [-0.1234, 51.5020],
            [-0.1200, 51.5020],
            [-0.1200, 51.5000],
            [-0.1234, 91.0000],
          ],
        ],
      };

      const result = await validateGeometry(invalidPolygon);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error_type).toBe('bounds_invalid');
      expect(result.errors[0].error_message).toContain('latitude');
      expect(result.errors[0].error_message).toContain('90');
    });

    it('should reject geometry with longitude out of bounds', async () => {
      const invalidPolygon: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [-181.0000, 51.5000],  // Longitude < -180°
            [-0.1234, 51.5020],
            [-0.1200, 51.5020],
            [-0.1200, 51.5000],
            [-181.0000, 51.5000],
          ],
        ],
      };

      const result = await validateGeometry(invalidPolygon);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error_type).toBe('bounds_invalid');
      expect(result.errors[0].error_message).toContain('longitude');
      expect(result.errors[0].error_message).toContain('180');
    });

    it('should reject geometry with self-intersecting rings', async () => {
      const selfIntersectingPolygon: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [-0.1234, 51.5000],
            [-0.1200, 51.5020],
            [-0.1234, 51.5020],  // Crossed
            [-0.1200, 51.5000],  // Intersection creates bow-tie
            [-0.1234, 51.5000],
          ],
        ],
      };

      const result = await validateGeometry(selfIntersectingPolygon);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error_type).toBe('topology_invalid');
      expect(result.errors[0].error_message).toContain('self-intersection');
      expect(result.errors[0].st_isvalid_reason).toBeDefined();
    });

    it('should reject empty geometry', async () => {
      const emptyPolygon: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [[]],
      };

      const result = await validateGeometry(emptyPolygon);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error_type).toBe('empty_geometry');
      expect(result.errors[0].error_message).toContain('at least 3 coordinates');
    });

    it('should reject geometry with unclosed ring', async () => {
      const unclosedPolygon: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [-0.1234, 51.5000],
            [-0.1234, 51.5020],
            [-0.1200, 51.5020],
            [-0.1200, 51.5000],
            // Missing closing coordinate (should be [-0.1234, 51.5000])
          ],
        ],
      };

      const result = await validateGeometry(unclosedPolygon);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error_type).toBe('topology_invalid');
      expect(result.errors[0].error_message).toContain('closed');
    });

    it('should reject geometry with insufficient coordinates', async () => {
      const twoPointPolygon: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [-0.1234, 51.5000],
            [-0.1200, 51.5000],
            [-0.1234, 51.5000],  // Only 2 unique points (not a polygon)
          ],
        ],
      };

      const result = await validateGeometry(twoPointPolygon);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error_type).toBe('empty_geometry');
      expect(result.errors[0].error_message).toContain('at least 3');
    });

    it('should handle complex MultiPolygon with holes', async () => {
      const complexMultiPolygon: GeoJSON.MultiPolygon = {
        type: 'MultiPolygon',
        coordinates: [
          [
            // Outer ring
            [
              [-0.1300, 51.5000],
              [-0.1300, 51.5030],
              [-0.1150, 51.5030],
              [-0.1150, 51.5000],
              [-0.1300, 51.5000],
            ],
            // Hole (inner ring)
            [
              [-0.1250, 51.5010],
              [-0.1250, 51.5020],
              [-0.1200, 51.5020],
              [-0.1200, 51.5010],
              [-0.1250, 51.5010],
            ],
          ],
        ],
      };

      const result = await validateGeometry(complexMultiPolygon);

      expect(result.valid).toBe(true);
      expect(result.geometry_type).toBe('MultiPolygon');
      expect(result.converted_to_multipolygon).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate MultiPolygon with multiple parts', async () => {
      const multiPartPolygon: GeoJSON.MultiPolygon = {
        type: 'MultiPolygon',
        coordinates: [
          // First polygon
          [
            [
              [-0.1300, 51.5000],
              [-0.1300, 51.5010],
              [-0.1250, 51.5010],
              [-0.1250, 51.5000],
              [-0.1300, 51.5000],
            ],
          ],
          // Second polygon (separate)
          [
            [
              [-0.1200, 51.5000],
              [-0.1200, 51.5010],
              [-0.1150, 51.5010],
              [-0.1150, 51.5000],
              [-0.1200, 51.5000],
            ],
          ],
        ],
      };

      const result = await validateGeometry(multiPartPolygon);

      expect(result.valid).toBe(true);
      expect(result.geometry_type).toBe('MultiPolygon');
      expect(result.errors).toHaveLength(0);
    });
  });
});
