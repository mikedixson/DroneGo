import { getDbPool } from '../lib/db.js';
import type { Polygon, MultiPolygon } from 'geojson';

/**
 * Validation error details
 */
export interface ValidationError {
  type: 'bounds' | 'topology' | 'empty' | 'unclosed';
  message: string;
  coordinate?: [number, number]; // For bounds errors
  reason?: string; // ST_IsValidReason output for topology errors
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  geometry_type: 'Polygon' | 'MultiPolygon';
  converted_to_multipolygon: boolean;
  errors: ValidationError[];
}

/**
 * Geometry Validator Service
 * 
 * Validates geometries before database insertion using:
 * - Coordinate bounds checking (lat ∈ [-90, 90], lng ∈ [-180, 180])
 * - PostGIS ST_IsValid for topology validation
 * - Automatic Polygon → MultiPolygon conversion for schema consistency
 * 
 * Per Constitution §I (Safety First):
 * - All geometries MUST be validated before insertion (FR-001)
 * - Invalid geometries MUST be rejected with detailed error messages
 * - Topology errors MUST include ST_IsValidReason output
 * 
 * Per FR-002: All Polygons converted to MultiPolygons for consistency
 * 
 * Contracts: contracts/import-operations.md - Data Validation Interface
 */

/**
 * Validate geometry and convert Polygon to MultiPolygon
 * 
 * Validation steps:
 * 1. Check coordinate bounds: lat ∈ [-90, 90], lng ∈ [-180, 180]
 * 2. Check ring closure (first point = last point)
 * 3. Check minimum coordinates (≥3 for valid triangle)
 * 4. Use PostGIS ST_IsValid to check topology (no self-intersections)
 * 5. Convert Polygon to MultiPolygon if necessary
 * 
 * @param geometry - GeoJSON Polygon or MultiPolygon
 * @returns Validation result with errors if invalid
 */
export async function validateGeometry(
  geometry: Polygon | MultiPolygon
): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: true,
    geometry_type: geometry.type as 'Polygon' | 'MultiPolygon',
    converted_to_multipolygon: false,
    errors: [],
  };

  // Step 1: Validate coordinate bounds
  const coordinates = geometry.type === 'Polygon' 
    ? geometry.coordinates 
    : geometry.coordinates.flat();

  for (const ring of coordinates) {
    for (const [lng, lat] of ring) {
      if (lat < -90 || lat > 90) {
        result.valid = false;
        result.errors.push({
          type: 'bounds',
          message: `Latitude ${lat} out of bounds (must be -90 to 90)`,
          coordinate: [lng, lat],
        });
      }
      if (lng < -180 || lng > 180) {
        result.valid = false;
        result.errors.push({
          type: 'bounds',
          message: `Longitude ${lng} out of bounds (must be -180 to 180)`,
          coordinate: [lng, lat],
        });
      }
    }
  }

  // Stop here if bounds invalid (can't query DB with invalid coords)
  if (!result.valid) {
    return result;
  }

  // Step 2: Check ring closure and minimum coordinates
  for (const ring of coordinates) {
    if (ring.length < 4) {
      // Minimum 4 points: 3 vertices + closing point
      result.valid = false;
      result.errors.push({
        type: 'empty',
        message: `Ring has ${ring.length} coordinates, minimum 4 required (3 vertices + closing point)`,
      });
      continue;
    }

    // Check if ring is closed (first = last)
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      result.valid = false;
      result.errors.push({
        type: 'unclosed',
        message: 'Ring is not closed (first point must equal last point)',
      });
    }
  }

  // Stop here if basic geometry checks failed
  if (!result.valid) {
    return result;
  }

  // Step 3: Use PostGIS ST_IsValid to check topology
  try {
    const pool = getDbPool();
    const validationQuery = `
      SELECT 
        ST_IsValid(ST_GeomFromGeoJSON($1)) as is_valid,
        ST_IsValidReason(ST_GeomFromGeoJSON($1)) as reason
    `;

    const validationResult = await pool.query(validationQuery, [JSON.stringify(geometry)]);
    const { is_valid, reason } = validationResult.rows[0];

    if (!is_valid) {
      result.valid = false;
      result.errors.push({
        type: 'topology',
        message: `Topology validation failed: ${reason}`,
        reason,
      });
      return result;
    }
  } catch (error) {
    result.valid = false;
    result.errors.push({
      type: 'topology',
      message: `PostGIS validation error: ${error instanceof Error ? error.message : String(error)}`,
    });
    return result;
  }

  // Step 4: Convert Polygon to MultiPolygon if necessary (FR-002)
  if (geometry.type === 'Polygon') {
    result.converted_to_multipolygon = true;
    result.geometry_type = 'MultiPolygon';
  }

  return result;
}

/**
 * Check if a geometry is valid without detailed error messages
 * 
 * Faster alternative to validateGeometry when you only need a boolean result.
 * 
 * @param geometry - GeoJSON Polygon or MultiPolygon
 * @returns True if valid, false otherwise
 */
export async function isValidGeometry(geometry: Polygon | MultiPolygon): Promise<boolean> {
  const result = await validateGeometry(geometry);
  return result.valid;
}

/**
 * Convert Polygon to MultiPolygon
 * 
 * Per FR-002: All geometries stored as MultiPolygon for consistency.
 * 
 * @param geometry - GeoJSON Polygon or MultiPolygon
 * @returns MultiPolygon geometry
 */
export function toMultiPolygon(geometry: Polygon | MultiPolygon): MultiPolygon {
  if (geometry.type === 'MultiPolygon') {
    return geometry;
  }

  return {
    type: 'MultiPolygon',
    coordinates: [geometry.coordinates],
  };
}
