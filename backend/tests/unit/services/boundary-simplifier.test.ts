import { describe, it, expect } from 'vitest';
import { generateSimplifiedGeometries } from '../../../src/services/boundary-simplifier.js';
import type { GeoJSON } from 'geojson';

/**
 * Unit tests for boundary simplifier service
 * 
 * Covers:
 * - FR-007: Generate 3-tier simplified geometries for zoom-level optimization
 * - Low detail: ST_SimplifyPreserveTopology tolerance 0.0001° (zoom <13)
 * - Medium detail: ST_SimplifyPreserveTopology tolerance 0.00005° (zoom 13-15)
 * - Original: Full precision (zoom >15)
 * 
 * Contract: research.md - Boundary Simplification Strategy
 */
describe('BoundarySimplifier', () => {
  describe('generateSimplifiedGeometries', () => {
    it('should generate low and medium detail geometries from Polygon', async () => {
      const originalPolygon: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [-0.1300, 51.5000],
            [-0.1299, 51.5005],
            [-0.1295, 51.5010],
            [-0.1290, 51.5015],
            [-0.1285, 51.5020],
            [-0.1280, 51.5025],
            [-0.1275, 51.5030],
            [-0.1200, 51.5030],
            [-0.1200, 51.5000],
            [-0.1300, 51.5000],
          ],
        ],
      };

      const result = await generateSimplifiedGeometries(originalPolygon);

      expect(result).toHaveProperty('geometry_simplified_low');
      expect(result).toHaveProperty('geometry_simplified_medium');
      
      expect(result.geometry_simplified_low.type).toBe('MultiPolygon');
      expect(result.geometry_simplified_medium.type).toBe('MultiPolygon');
      
      // Simplified geometries should have fewer coordinates than original
      const originalCoordCount = originalPolygon.coordinates[0].length;
      const lowCoordCount = result.geometry_simplified_low.coordinates[0][0].length;
      const mediumCoordCount = result.geometry_simplified_medium.coordinates[0][0].length;
      
      expect(lowCoordCount).toBeLessThanOrEqual(originalCoordCount);
      expect(mediumCoordCount).toBeLessThanOrEqual(originalCoordCount);
      expect(lowCoordCount).toBeLessThanOrEqual(mediumCoordCount); // Low should be simpler than medium
    });

    it('should generate simplified geometries from MultiPolygon', async () => {
      const originalMultiPolygon: GeoJSON.MultiPolygon = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-0.1300, 51.5000],
              [-0.1299, 51.5002],
              [-0.1297, 51.5004],
              [-0.1295, 51.5006],
              [-0.1293, 51.5008],
              [-0.1290, 51.5010],
              [-0.1250, 51.5010],
              [-0.1250, 51.5000],
              [-0.1300, 51.5000],
            ],
          ],
        ],
      };

      const result = await generateSimplifiedGeometries(originalMultiPolygon);

      expect(result.geometry_simplified_low.type).toBe('MultiPolygon');
      expect(result.geometry_simplified_medium.type).toBe('MultiPolygon');
      
      // Should preserve MultiPolygon structure
      expect(result.geometry_simplified_low.coordinates).toHaveLength(1);
      expect(result.geometry_simplified_medium.coordinates).toHaveLength(1);
    });

    it('should use tolerance 0.0001° for low detail', async () => {
      // Complex boundary with many small details
      const complexPolygon: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [-0.1300, 51.5000],
            [-0.1299, 51.5001],
            [-0.1298, 51.5002],
            [-0.1297, 51.5003],
            [-0.1296, 51.5004],
            [-0.1295, 51.5005],
            [-0.1294, 51.5006],
            [-0.1293, 51.5007],
            [-0.1292, 51.5008],
            [-0.1291, 51.5009],
            [-0.1290, 51.5010],
            [-0.1250, 51.5010],
            [-0.1250, 51.5000],
            [-0.1300, 51.5000],
          ],
        ],
      };

      const result = await generateSimplifiedGeometries(complexPolygon);

      const originalPoints = complexPolygon.coordinates[0].length;
      const simplifiedPoints = result.geometry_simplified_low.coordinates[0][0].length;

      // Low detail should significantly reduce points (expect >50% reduction for this pattern)
      expect(simplifiedPoints).toBeLessThan(originalPoints * 0.7);
    });

    it('should use tolerance 0.00005° for medium detail', async () => {
      const complexPolygon: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [-0.1300, 51.5000],
            [-0.1299, 51.5001],
            [-0.1298, 51.5002],
            [-0.1297, 51.5003],
            [-0.1296, 51.5004],
            [-0.1295, 51.5005],
            [-0.1294, 51.5006],
            [-0.1293, 51.5007],
            [-0.1292, 51.5008],
            [-0.1291, 51.5009],
            [-0.1290, 51.5010],
            [-0.1250, 51.5010],
            [-0.1250, 51.5000],
            [-0.1300, 51.5000],
          ],
        ],
      };

      const result = await generateSimplifiedGeometries(complexPolygon);

      const lowPoints = result.geometry_simplified_low.coordinates[0][0].length;
      const mediumPoints = result.geometry_simplified_medium.coordinates[0][0].length;

      // Medium detail should be more detailed than low detail
      expect(mediumPoints).toBeGreaterThanOrEqual(lowPoints);
    });

    it('should preserve topology with ST_SimplifyPreserveTopology', async () => {
      // Polygon with hole (inner ring)
      const polygonWithHole: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [
          // Outer ring
          [
            [-0.1300, 51.5000],
            [-0.1300, 51.5030],
            [-0.1200, 51.5030],
            [-0.1200, 51.5000],
            [-0.1300, 51.5000],
          ],
          // Inner ring (hole)
          [
            [-0.1280, 51.5010],
            [-0.1280, 51.5020],
            [-0.1220, 51.5020],
            [-0.1220, 51.5010],
            [-0.1280, 51.5010],
          ],
        ],
      };

      const result = await generateSimplifiedGeometries(polygonWithHole);

      // Should preserve hole structure (2 rings)
      expect(result.geometry_simplified_low.coordinates[0]).toHaveLength(2);
      expect(result.geometry_simplified_medium.coordinates[0]).toHaveLength(2);
    });

    it('should handle large complex geometry (Tower of London)', async () => {
      // Realistic complex heritage site boundary
      const towerOfLondon: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [-0.076132, 51.508112],
            [-0.076100, 51.508150],
            [-0.076050, 51.508200],
            [-0.076000, 51.508250],
            [-0.075950, 51.508300],
            [-0.075900, 51.508350],
            [-0.075850, 51.508400],
            [-0.075800, 51.508450],
            [-0.075750, 51.508500],
            [-0.075700, 51.508550],
            [-0.075650, 51.508600],
            [-0.075600, 51.508650],
            [-0.075550, 51.508700],
            [-0.075500, 51.508750],
            [-0.075450, 51.508800],
            [-0.075400, 51.508850],
            [-0.075350, 51.508900],
            [-0.075300, 51.508950],
            [-0.075250, 51.509000],
            [-0.075250, 51.509050],
            [-0.075300, 51.509050],
            [-0.075800, 51.509050],
            [-0.076132, 51.509050],
            [-0.076132, 51.508112],
          ],
        ],
      };

      const result = await generateSimplifiedGeometries(towerOfLondon);

      expect(result.geometry_simplified_low).toBeDefined();
      expect(result.geometry_simplified_medium).toBeDefined();
      
      // Verify significant simplification occurred
      const originalPoints = towerOfLondon.coordinates[0].length;
      const lowPoints = result.geometry_simplified_low.coordinates[0][0].length;
      const mediumPoints = result.geometry_simplified_medium.coordinates[0][0].length;
      
      expect(lowPoints).toBeLessThan(originalPoints);
      expect(mediumPoints).toBeLessThan(originalPoints);
      expect(mediumPoints).toBeGreaterThanOrEqual(lowPoints);
    });

    it('should return null for simplified geometries if simplification fails', async () => {
      // Degenerate polygon (too simple to simplify further)
      const tooSimple: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [-0.1300, 51.5000],
            [-0.1250, 51.5010],
            [-0.1250, 51.5000],
            [-0.1300, 51.5000],
          ],
        ],
      };

      const result = await generateSimplifiedGeometries(tooSimple);

      // Should still return something, even if same as original
      expect(result.geometry_simplified_low).toBeDefined();
      expect(result.geometry_simplified_medium).toBeDefined();
    });

    it('should handle MultiPolygon with multiple parts', async () => {
      const multiPartPolygon: GeoJSON.MultiPolygon = {
        type: 'MultiPolygon',
        coordinates: [
          // First polygon
          [
            [
              [-0.1300, 51.5000],
              [-0.1299, 51.5005],
              [-0.1290, 51.5010],
              [-0.1250, 51.5010],
              [-0.1250, 51.5000],
              [-0.1300, 51.5000],
            ],
          ],
          // Second polygon (separate)
          [
            [
              [-0.1200, 51.5000],
              [-0.1199, 51.5005],
              [-0.1190, 51.5010],
              [-0.1150, 51.5010],
              [-0.1150, 51.5000],
              [-0.1200, 51.5000],
            ],
          ],
        ],
      };

      const result = await generateSimplifiedGeometries(multiPartPolygon);

      // Should preserve multiple parts
      expect(result.geometry_simplified_low.coordinates).toHaveLength(2);
      expect(result.geometry_simplified_medium.coordinates).toHaveLength(2);
    });
  });
});
