import { BaseModel, BaseModelAttributes } from './BaseModel.js';

/**
 * Geometry types (GeoJSON)
 */
export interface Geometry {
  type: 'Polygon' | 'MultiPolygon' | 'Point';
  coordinates: number[][][] | number[][][][];
}

/**
 * Temporary Restriction (NOTAM) entity attributes
 */
export interface TemporaryRestrictionAttributes extends BaseModelAttributes {
  notam_id: string;
  notam_number: string;
  issuing_authority: string;
  affected_area_geometry: Geometry | null;
  affected_area_center: { type: 'Point'; coordinates: [number, number] } | null;
  affected_area_radius: number | null;
  effective_start: Date;
  effective_end: Date;
  altitude_floor: number | null;
  altitude_ceiling: number | null;
  restriction_reason: string | null;
  notam_text_raw: string | null;
  uas_relevant: boolean;
  status: 'pending' | 'active' | 'expired' | 'cancelled';
  data_source_id: string | null;
  last_updated: Date;
  created_at: Date;
}

/**
 * Temporary Restriction (NOTAM) Model
 * 
 * Represents time-limited flight restrictions (Notice to Airmen) affecting UAS operations.
 * Includes automatic status transitions based on effective dates.
 */
export class TemporaryRestriction extends BaseModel<TemporaryRestrictionAttributes> {
  protected tableName = 'temporary_restrictions';
  protected primaryKey = 'notam_id';

  /**
   * Find NOTAM by official number
   */
  async findByNotamNumber(notamNumber: string): Promise<TemporaryRestrictionAttributes | null> {
    const query = `SELECT * FROM ${this.tableName} WHERE notam_number = $1`;
    const result = await this.query(query, [notamNumber]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find active NOTAMs (currently in effect)
   */
  async findActive(): Promise<TemporaryRestrictionAttributes[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE status = 'active'
        AND effective_start <= NOW()
        AND effective_end > NOW()
        AND uas_relevant = true
      ORDER BY effective_start DESC
    `;
    const result = await this.query(query);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find pending NOTAMs (future restrictions)
   */
  async findPending(): Promise<TemporaryRestrictionAttributes[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE status = 'pending'
        AND effective_start > NOW()
        AND uas_relevant = true
      ORDER BY effective_start ASC
    `;
    const result = await this.query(query);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find NOTAMs by status
   */
  async findByStatus(
    status: TemporaryRestrictionAttributes['status']
  ): Promise<TemporaryRestrictionAttributes[]> {
    return this.findAll({ status, uas_relevant: true });
  }

  /**
   * Find NOTAMs containing a geographic point
   * 
   * @param longitude - Longitude in WGS84 decimal degrees
   * @param latitude - Latitude in WGS84 decimal degrees
   * @returns Array of active NOTAMs affecting the point
   */
  async findContainingPoint(
    longitude: number,
    latitude: number
  ): Promise<TemporaryRestrictionAttributes[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE status = 'active'
        AND uas_relevant = true
        AND (
          ST_Contains(
            affected_area_geometry,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)
          )
          OR (
            affected_area_center IS NOT NULL
            AND affected_area_radius IS NOT NULL
            AND ST_DWithin(
              affected_area_center::geography,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
              affected_area_radius * 1852
            )
          )
        )
        AND effective_start <= NOW()
        AND effective_end > NOW()
      ORDER BY effective_start DESC
    `;
    const result = await this.query(query, [longitude, latitude]);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find NOTAMs within a bounding box
   * 
   * @param minLng - Minimum longitude (west)
   * @param minLat - Minimum latitude (south)
   * @param maxLng - Maximum longitude (east)
   * @param maxLat - Maximum latitude (north)
   * @returns Array of NOTAMs within or intersecting the bounds
   */
  async findWithinBounds(
    minLng: number,
    minLat: number,
    maxLng: number,
    maxLat: number
  ): Promise<TemporaryRestrictionAttributes[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE uas_relevant = true
        AND status IN ('pending', 'active')
        AND (
          ST_Intersects(
            affected_area_geometry,
            ST_MakeEnvelope($1, $2, $3, $4, 4326)
          )
          OR (
            affected_area_center IS NOT NULL
            AND ST_Contains(
              ST_MakeEnvelope($1, $2, $3, $4, 4326),
              affected_area_center
            )
          )
        )
      ORDER BY effective_start DESC
    `;
    const result = await this.query(query, [minLng, minLat, maxLng, maxLat]);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Update NOTAM statuses based on current time
   * Should be called by scheduled job
   */
  async updateStatuses(): Promise<{ activated: number; expired: number }> {
    // Activate pending NOTAMs
    const activateQuery = `
      UPDATE ${this.tableName}
      SET status = 'active', last_updated = NOW()
      WHERE status = 'pending'
        AND effective_start <= NOW()
        AND effective_end > NOW()
    `;
    const activateResult = await this.query(activateQuery);

    // Expire active NOTAMs
    const expireQuery = `
      UPDATE ${this.tableName}
      SET status = 'expired', last_updated = NOW()
      WHERE status = 'active'
        AND effective_end <= NOW()
    `;
    const expireResult = await this.query(expireQuery);

    return {
      activated: activateResult.rowCount ?? 0,
      expired: expireResult.rowCount ?? 0,
    };
  }

  /**
   * Cancel a NOTAM (before expiration)
   */
  async cancel(notamId: string): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET status = 'cancelled', last_updated = NOW()
      WHERE ${this.primaryKey} = $1
        AND status IN ('pending', 'active')
    `;
    const result = await this.query(query, [notamId]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Override create to handle geometry conversion
   */
  async create(
    data: Partial<TemporaryRestrictionAttributes>
  ): Promise<TemporaryRestrictionAttributes> {
    if (data.affected_area_geometry || data.affected_area_center) {
      const keys = Object.keys(data).filter(
        (k) => k !== 'affected_area_geometry' && k !== 'affected_area_center'
      );
      const values = keys.map((k) => (data as any)[k]);

      const placeholders: string[] = [];
      let paramIndex = 1;

      keys.forEach(() => {
        placeholders.push(`$${paramIndex++}`);
      });

      if (data.affected_area_geometry) {
        keys.push('affected_area_geometry');
        placeholders.push(`ST_GeomFromGeoJSON($${paramIndex++})`);
        values.push(JSON.stringify(data.affected_area_geometry));
      }

      if (data.affected_area_center) {
        keys.push('affected_area_center');
        placeholders.push(`ST_GeomFromGeoJSON($${paramIndex++})`);
        values.push(JSON.stringify(data.affected_area_center));
      }

      const query = `
        INSERT INTO ${this.tableName} (${keys.join(', ')})
        VALUES (${placeholders.join(', ')})
        RETURNING *,
          ST_AsGeoJSON(affected_area_geometry)::json as affected_area_geometry,
          ST_AsGeoJSON(affected_area_center)::json as affected_area_center
      `;

      const result = await this.pool.query(query, values);
      return this.mapRow(result.rows[0]);
    }

    return super.create(data);
  }

  /**
   * Override mapRow to transform database results
   */
  protected mapRow(row: any): TemporaryRestrictionAttributes {
    // Parse geometries if they're strings
    if (row.affected_area_geometry && typeof row.affected_area_geometry === 'string') {
      try {
        row.affected_area_geometry = JSON.parse(row.affected_area_geometry);
      } catch (e) {
        // Geometry might already be parsed
      }
    }

    if (row.affected_area_center && typeof row.affected_area_center === 'string') {
      try {
        row.affected_area_center = JSON.parse(row.affected_area_center);
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
    if (row.effective_start && typeof row.effective_start === 'string') {
      row.effective_start = new Date(row.effective_start);
    }
    if (row.effective_end && typeof row.effective_end === 'string') {
      row.effective_end = new Date(row.effective_end);
    }

    return row as TemporaryRestrictionAttributes;
  }
}
