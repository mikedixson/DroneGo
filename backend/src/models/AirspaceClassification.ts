import { BaseModel, BaseModelAttributes } from './BaseModel.js';

/**
 * Geometry types (GeoJSON)
 */
export interface Geometry {
  type: 'Polygon' | 'MultiPolygon' | 'Point';
  coordinates: number[][][] | number[][][][];
}

/**
 * Airspace Classification entity attributes
 */
export interface AirspaceClassificationAttributes extends BaseModelAttributes {
  airspace_id: string;
  class_designation: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
  geometry: Geometry;
  airspace_name: string;
  altitude_floor: number;
  altitude_ceiling: number;
  controlling_authority: string;
  rules_description: string | null;
  uas_authorization_required: boolean;
  authorization_process: string | null;
  data_source_id: string | null;
  last_updated: Date;
  created_at: Date;
}

/**
 * Airspace Classification Model
 * 
 * Represents controlled airspace types defined by aviation authorities (ICAO classification).
 * Used to determine authorization requirements for UAS operations.
 */
export class AirspaceClassification extends BaseModel<AirspaceClassificationAttributes> {
  protected tableName = 'airspace_classifications';
  protected primaryKey = 'airspace_id';

  /**
   * Find airspace classifications by ICAO class
   */
  async findByClass(
    classDesignation: AirspaceClassificationAttributes['class_designation']
  ): Promise<AirspaceClassificationAttributes[]> {
    return this.findAll({ class_designation: classDesignation });
  }

  /**
   * Find controlled airspace (Classes A-E)
   */
  async findControlled(): Promise<AirspaceClassificationAttributes[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE class_designation IN ('A', 'B', 'C', 'D', 'E')
      ORDER BY class_designation
    `;
    const result = await this.query(query);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find airspace requiring UAS authorization
   */
  async findRequiringAuthorization(): Promise<AirspaceClassificationAttributes[]> {
    return this.findAll({ uas_authorization_required: true });
  }

  /**
   * Find airspace classifications containing a geographic point
   * 
   * @param longitude - Longitude in WGS84 decimal degrees
   * @param latitude - Latitude in WGS84 decimal degrees
   * @returns Array of airspace zones containing the point
   */
  async findContainingPoint(
    longitude: number,
    latitude: number
  ): Promise<AirspaceClassificationAttributes[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE ST_Contains(
        geometry,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)
      )
      ORDER BY altitude_floor ASC
    `;
    const result = await this.query(query, [longitude, latitude]);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find airspace classifications within a bounding box
   * 
   * @param minLng - Minimum longitude (west)
   * @param minLat - Minimum latitude (south)
   * @param maxLng - Maximum longitude (east)
   * @param maxLat - Maximum latitude (north)
   * @returns Array of airspace zones within or intersecting the bounds
   */
  async findWithinBounds(
    minLng: number,
    minLat: number,
    maxLng: number,
    maxLat: number
  ): Promise<AirspaceClassificationAttributes[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE ST_Intersects(
        geometry,
        ST_MakeEnvelope($1, $2, $3, $4, 4326)
      )
      ORDER BY class_designation
    `;
    const result = await this.query(query, [minLng, minLat, maxLng, maxLat]);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find airspace at a specific altitude
   * 
   * @param longitude - Longitude in WGS84 decimal degrees
   * @param latitude - Latitude in WGS84 decimal degrees
   * @param altitudeFeet - Altitude in feet AMSL
   * @returns Array of airspace zones containing the point at the given altitude
   */
  async findAt3DPoint(
    longitude: number,
    latitude: number,
    altitudeFeet: number
  ): Promise<AirspaceClassificationAttributes[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE ST_Contains(
        geometry,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)
      )
      AND altitude_floor <= $3
      AND altitude_ceiling >= $3
      ORDER BY altitude_floor ASC
    `;
    const result = await this.query(query, [longitude, latitude, altitudeFeet]);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Override create to handle geometry conversion
   */
  async create(
    data: Partial<AirspaceClassificationAttributes>
  ): Promise<AirspaceClassificationAttributes> {
    if (data.geometry) {
      const keys = Object.keys(data).filter((k) => k !== 'geometry');
      const values = keys.map((k) => (data as any)[k]);

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
   */
  protected mapRow(row: any): AirspaceClassificationAttributes {
    // Parse geometry if it's a string
    if (row.geometry && typeof row.geometry === 'string') {
      try {
        row.geometry = JSON.parse(row.geometry);
      } catch (e) {
        // Geometry might already be parsed
      }
    }

    // Convert date strings to Date objects
    if (row.created_at && typeof row.created_at === 'string') {
      row.created_at = new Date(row.created_at);
    }
    if (row.last_updated && typeof row.last_updated === 'string') {
      row.last_updated = new Date(row.last_updated);
    }

    return row as AirspaceClassificationAttributes;
  }
}
