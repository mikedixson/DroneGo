import { BaseModel, BaseModelAttributes } from './BaseModel.js';

/**
 * Restriction Zone geometry types (GeoJSON)
 */
export interface Geometry {
  type: 'Polygon' | 'MultiPolygon' | 'Point';
  coordinates: number[][][] | number[][][][];
}

/**
 * Restriction Zone entity attributes
 */
export interface RestrictionZoneAttributes extends BaseModelAttributes {
  zone_id: string;
  zone_type:
    | 'no-fly'
    | 'controlled-airspace'
    | 'military-zone'
    | 'temporary-restriction'
    | 'airport-frz'
    | 'danger-area';
  geometry: Geometry;
  authority_source: string;
  restriction_name: string;
  altitude_floor: number | null;
  altitude_ceiling: number | null;
  effective_start: Date | null;
  effective_end: Date | null;
  description: string | null;
  authorization_possible: boolean;
  authorization_contact: string | null;
  confidence_level: 'primary-authority' | 'secondary-source' | 'unverified';
  data_source_id: string | null;
  last_updated: Date;
  created_at: Date;
}

/**
 * Restriction Zone Model
 * 
 * Represents geographic areas with flying limitations or prohibitions.
 * Uses PostGIS for spatial queries and geometry validation.
 */
export class RestrictionZone extends BaseModel<RestrictionZoneAttributes> {
  protected tableName = 'restriction_zones';
  protected primaryKey = 'zone_id';

  /**
   * Find restriction zones by type
   */
  async findByType(
    zoneType: RestrictionZoneAttributes['zone_type']
  ): Promise<RestrictionZoneAttributes[]> {
    return this.findAll({ zone_type: zoneType });
  }

  /**
   * Find active restriction zones
   * Excludes expired temporary restrictions
   */
  async findActive(): Promise<RestrictionZoneAttributes[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE (effective_end IS NULL OR effective_end > NOW())
        AND (effective_start IS NULL OR effective_start <= NOW())
    `;
    const result = await this.query(query);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find restriction zones by authority source
   */
  async findByAuthority(authority: string): Promise<RestrictionZoneAttributes[]> {
    return this.findAll({ authority_source: authority });
  }

  /**
   * Find restriction zones by confidence level
   */
  async findByConfidenceLevel(
    level: RestrictionZoneAttributes['confidence_level']
  ): Promise<RestrictionZoneAttributes[]> {
    return this.findAll({ confidence_level: level });
  }

  /**
   * Find restriction zones containing a geographic point
   * Uses PostGIS ST_Contains for spatial query
   * 
   * @param longitude - Longitude in WGS84 decimal degrees
   * @param latitude - Latitude in WGS84 decimal degrees
   * @returns Array of zones containing the point
   */
  async findContainingPoint(
    longitude: number,
    latitude: number
  ): Promise<RestrictionZoneAttributes[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE ST_Contains(
        geometry,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)
      )
      AND (effective_end IS NULL OR effective_end > NOW())
      AND (effective_start IS NULL OR effective_start <= NOW())
    `;
    const result = await this.query(query, [longitude, latitude]);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find restriction zones within a bounding box
   * 
   * @param minLng - Minimum longitude (west)
   * @param minLat - Minimum latitude (south)
   * @param maxLng - Maximum longitude (east)
   * @param maxLat - Maximum latitude (north)
   * @returns Array of zones within or intersecting the bounds
   */
  async findWithinBounds(
    minLng: number,
    minLat: number,
    maxLng: number,
    maxLat: number
  ): Promise<RestrictionZoneAttributes[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE ST_Intersects(
        geometry,
        ST_MakeEnvelope($1, $2, $3, $4, 4326)
      )
      AND (effective_end IS NULL OR effective_end > NOW())
      AND (effective_start IS NULL OR effective_start <= NOW())
    `;
    const result = await this.query(query, [minLng, minLat, maxLng, maxLat]);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find restriction zones intersecting with a geometry
   * 
   * @param geometry - GeoJSON geometry object
   * @returns Array of zones intersecting the geometry
   */
  async findIntersecting(geometry: Geometry): Promise<RestrictionZoneAttributes[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE ST_Intersects(
        geometry,
        ST_GeomFromGeoJSON($1)
      )
      AND (effective_end IS NULL OR effective_end > NOW())
      AND (effective_start IS NULL OR effective_start <= NOW())
    `;
    const result = await this.query(query, [JSON.stringify(geometry)]);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Override create to handle geometry conversion
   */
  async create(data: Partial<RestrictionZoneAttributes>): Promise<RestrictionZoneAttributes> {
    // Convert GeoJSON geometry to PostGIS format if provided
    if (data.geometry) {
      const keys = Object.keys(data).filter((k) => k !== 'geometry');
      const values = keys.map((k) => (data as any)[k]);

      // Add geometry as GeoJSON conversion
      keys.push('geometry');
      values.push(data.geometry);

      const placeholders = keys.map((k, index) => {
        if (k === 'geometry') {
          return `ST_GeomFromGeoJSON($${index + 1})`;
        }
        return `$${index + 1}`;
      });

      const query = `
        INSERT INTO ${this.tableName} (${keys.join(', ')})
        VALUES (${placeholders.join(', ')})
        RETURNING *, ST_AsGeoJSON(geometry)::json as geometry
      `;

      const result = await this.pool.query(query, [
        ...values.slice(0, -1),
        JSON.stringify(values[values.length - 1]),
      ]);

      return this.mapRow(result.rows[0]);
    }

    return super.create(data);
  }

  /**
   * Override mapRow to transform database results
   * Converts geometry from PostGIS format to GeoJSON if needed
   */
  protected mapRow(row: any): RestrictionZoneAttributes {
    // Parse geometry if it's a string
    if (row.geometry && typeof row.geometry === 'string') {
      try {
        row.geometry = JSON.parse(row.geometry);
      } catch (e) {
        // Geometry might already be parsed or in different format
      }
    }

    // Convert date strings to Date objects
    if (row.created_at && typeof row.created_at === 'string') {
      row.created_at = new Date(row.created_at);
    }
    if (row.last_updated && typeof row.last_updated === 'string') {
      row.last_updated = new Date(row.last_updated);
    }
    if (row.effective_start && typeof row.effective_start === 'string') {
      row.effective_start = new Date(row.effective_start);
    }
    if (row.effective_end && typeof row.effective_end === 'string') {
      row.effective_end = new Date(row.effective_end);
    }

    return row as RestrictionZoneAttributes;
  }
}
