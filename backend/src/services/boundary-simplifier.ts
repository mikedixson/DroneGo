import { getDbPool } from '../lib/db.js';
import type { Polygon, MultiPolygon } from 'geojson';

/**
 * Simplified geometries result
 */
export interface SimplifiedGeometries {
  geometry_simplified_low: MultiPolygon;
  geometry_simplified_medium: MultiPolygon;
}

/**
 * Boundary Simplifier Service
 * 
 * Generates multi-resolution geometries for zoom-level optimization.
 * 
 * Three-tier simplification strategy (FR-007):
 * - Low detail: ST_SimplifyPreserveTopology tolerance 0.0001° (zoom <13)
 * - Medium detail: ST_SimplifyPreserveTopology tolerance 0.00005° (zoom 13-15)
 * - Original: Full precision (zoom >15)
 * 
 * Per Constitution §I (Performance):
 * - Simplified geometries MUST use ST_SimplifyPreserveTopology (not ST_Simplify)
 * - Topology MUST be preserved (no self-intersections introduced)
 * - Holes and multi-part polygons MUST be preserved
 * 
 * Research Findings: research.md - Boundary Simplification Strategy
 */

/**
 * Generate simplified geometries for zoom-level optimization
 * 
 * Uses PostGIS ST_SimplifyPreserveTopology with two tolerance levels:
 * - Low detail: 0.0001° (~11 meters at equator) for zoom <13
 * - Medium detail: 0.00005° (~5.5 meters at equator) for zoom 13-15
 * 
 * ST_SimplifyPreserveTopology guarantees:
 * - No self-intersections introduced
 * - No topology changes (holes preserved)
 * - Coordinate reduction while maintaining shape
 * 
 * @param geometry - Original GeoJSON Polygon or MultiPolygon
 * @returns Simplified geometries for low and medium detail levels
 */
export async function generateSimplifiedGeometries(
  geometry: Polygon | MultiPolygon
): Promise<SimplifiedGeometries> {
  const pool = getDbPool();

  // Convert Polygon to MultiPolygon for consistency
  let geoJson = geometry;
  if (geometry.type === 'Polygon') {
    geoJson = {
      type: 'MultiPolygon',
      coordinates: [geometry.coordinates],
    } as MultiPolygon;
  }

  try {
    // Query PostGIS to generate both simplified versions
    const query = `
      SELECT 
        ST_AsGeoJSON(
          ST_Multi(
            ST_SimplifyPreserveTopology(ST_GeomFromGeoJSON($1), 0.0001)
          )
        )::json as geometry_simplified_low,
        ST_AsGeoJSON(
          ST_Multi(
            ST_SimplifyPreserveTopology(ST_GeomFromGeoJSON($1), 0.00005)
          )
        )::json as geometry_simplified_medium
    `;

    const result = await pool.query(query, [JSON.stringify(geoJson)]);
    const row = result.rows[0];

    return {
      geometry_simplified_low: row.geometry_simplified_low,
      geometry_simplified_medium: row.geometry_simplified_medium,
    };
  } catch (error) {
    throw new Error(
      `Failed to generate simplified geometries: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Generate single simplified geometry with custom tolerance
 * 
 * Used for custom simplification scenarios outside the standard 3-tier strategy.
 * 
 * @param geometry - Original GeoJSON Polygon or MultiPolygon
 * @param tolerance - Simplification tolerance in degrees
 * @returns Simplified MultiPolygon
 */
export async function simplifyGeometry(
  geometry: Polygon | MultiPolygon,
  tolerance: number
): Promise<MultiPolygon> {
  const pool = getDbPool();

  // Convert Polygon to MultiPolygon for consistency
  let geoJson = geometry;
  if (geometry.type === 'Polygon') {
    geoJson = {
      type: 'MultiPolygon',
      coordinates: [geometry.coordinates],
    } as MultiPolygon;
  }

  try {
    const query = `
      SELECT 
        ST_AsGeoJSON(
          ST_Multi(
            ST_SimplifyPreserveTopology(ST_GeomFromGeoJSON($1), $2)
          )
        )::json as simplified
    `;

    const result = await pool.query(query, [JSON.stringify(geoJson), tolerance]);
    return result.rows[0].simplified;
  } catch (error) {
    throw new Error(
      `Failed to simplify geometry: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get coordinate count for a geometry
 * 
 * Used for metrics and verification of simplification effectiveness.
 * 
 * @param geometry - GeoJSON Polygon or MultiPolygon
 * @returns Total number of coordinate points
 */
export function getCoordinateCount(geometry: Polygon | MultiPolygon): number {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.reduce((total, ring) => total + ring.length, 0);
  }

  // MultiPolygon
  return geometry.coordinates.reduce(
    (total, polygon) => 
      total + polygon.reduce((ringTotal, ring) => ringTotal + ring.length, 0),
    0
  );
}

/**
 * Calculate simplification ratio (percentage of coordinates reduced)
 * 
 * @param original - Original geometry
 * @param simplified - Simplified geometry
 * @returns Simplification ratio (0-1, where 0.5 = 50% reduction)
 */
export function getSimplificationRatio(
  original: Polygon | MultiPolygon,
  simplified: Polygon | MultiPolygon
): number {
  const originalCount = getCoordinateCount(original);
  const simplifiedCount = getCoordinateCount(simplified);

  if (originalCount === 0) {
    return 0;
  }

  return 1 - simplifiedCount / originalCount;
}
