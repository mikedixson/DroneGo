import { BaseModel, BaseModelAttributes } from './BaseModel.js';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';

/**
 * Property Restriction entity attributes
 */
export interface PropertyRestrictionAttributes extends BaseModelAttributes {
  property_id: string;
  property_name: string;
  managing_organization: string;
  restriction_category: string;
  geometry: MultiPolygon | Polygon; // GeoJSON geometry
  policy_text: string | null;
  contact_info: string | null;
  policy_effective_date: Date | null;
  data_source_id: string | null;
  created_at: Date;
  last_updated: Date;
}

/**
 * Bounding box for spatial queries
 */
export interface BoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Property Restriction Model (User Story 1)
 * 
 * Represents heritage sites and other properties with specific drone flight policies.
 * Uses PostGIS spatial queries for point-in-polygon detection.
 * 
 * SAFETY-CRITICAL: Property restrictions must be accurately detected to prevent
 * unauthorized flights over heritage sites.
 * 
 * Per Constitution §I:
 * - All spatial queries must use GIST indexes
 * - Geometry must be in EPSG:4326 (WGS84)
 * - Policy text limited to 5000 chars for performance
 */
export class PropertyRestriction extends BaseModel<PropertyRestrictionAttributes> {
  protected tableName = 'property_restrictions';
  protected primaryKey = 'property_id';

  /**
   * Create a new property restriction
   * 
   * @param data - Property restriction data
   * @returns Created property restriction
   */
  static async create(data: {
    property_name: string;
    managing_organization: string;
    geometry: MultiPolygon | Polygon | any;
    policy_text?: string;
    contact_info?: string;
    policy_effective_date?: Date;
    data_source_id?: string;
  }): Promise<PropertyRestrictionAttributes> {
    const pool = (await import('../lib/db.js')).getDbPool();

    // Validate required fields
    if (!data.property_name) {
      throw new Error('property_name is required');
    }
    if (!data.managing_organization) {
      throw new Error('managing_organization is required');
    }
    if (!data.geometry) {
      throw new Error('geometry is required');
    }

    // Validate policy_text length
    if (data.policy_text && data.policy_text.length > 5000) {
      throw new Error('policy_text must not exceed 5000 characters');
    }

    // Convert Polygon to MultiPolygon if necessary
    let geometryGeoJSON = data.geometry;
    if (data.geometry.type === 'Polygon') {
      geometryGeoJSON = {
        type: 'MultiPolygon',
        coordinates: [data.geometry.coordinates],
      };
    }

    const query = `
      INSERT INTO property_restrictions (
        property_name, managing_organization, geometry, policy_text,
        contact_info, policy_effective_date, data_source_id
      ) VALUES (
        $1, $2, ST_Multi(ST_GeomFromGeoJSON($3)), $4, $5, $6, $7
      )
      RETURNING 
        property_id,
        property_name,
        managing_organization,
        ST_AsGeoJSON(geometry)::json as geometry,
        policy_text,
        contact_info,
        policy_effective_date,
        data_source_id,
        created_at,
        last_updated
    `;

    const result = await pool.query(query, [
      data.property_name,
      data.managing_organization,
      JSON.stringify(geometryGeoJSON),
      data.policy_text || null,
      data.contact_info || null,
      data.policy_effective_date || null,
      data.data_source_id || null,
    ]);

    return result.rows[0] as PropertyRestrictionAttributes;
  }

  /**
   * Find property restrictions at specific coordinates
   * 
   * Uses PostGIS ST_Intersects for point-in-polygon detection.
   * GIST index on geometry column ensures fast queries.
   * 
   * @param lng - Longitude (WGS84)
   * @param lat - Latitude (WGS84)
   * @returns Array of property restrictions containing the point
   */
  static async findByCoordinates(
    lng: number,
    lat: number
  ): Promise<PropertyRestrictionAttributes[]> {
    const pool = (await import('../lib/db.js')).getDbPool();

    const query = `
      SELECT 
        property_id,
        property_name,
        managing_organization,
        ST_AsGeoJSON(geometry)::json as geometry,
        policy_text,
        contact_info,
        policy_effective_date,
        data_source_id,
        created_at,
        last_updated
      FROM property_restrictions
      WHERE ST_Intersects(geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))
      ORDER BY property_name
    `;

    const result = await pool.query(query, [lng, lat]);
    return result.rows as PropertyRestrictionAttributes[];
  }

  /**
   * Find property restrictions within bounding box
   * 
   * Used for map viewport queries to display all properties in view.
   * 
   * @param bbox - Bounding box (west, south, east, north)
   * @param category - Optional restriction category filter (HERITAGE_SITE, SSSI, etc.)
   * @returns Array of property restrictions intersecting bbox
   */
  static async findInBbox(bbox: BoundingBox, category?: string): Promise<PropertyRestrictionAttributes[]> {
    const pool = (await import('../lib/db.js')).getDbPool();

    const query = `
      SELECT 
        property_id,
        property_name,
        managing_organization,
        restriction_category,
        ST_AsGeoJSON(geometry)::json as geometry,
        policy_text,
        contact_info,
        policy_effective_date,
        data_source_id,
        created_at,
        last_updated
      FROM property_restrictions
      WHERE ST_Intersects(
        geometry,
        ST_MakeEnvelope($1, $2, $3, $4, 4326)
      )
      ${category ? 'AND restriction_category = $5' : ''}
      ORDER BY property_name
    `;

    const params = [bbox.west, bbox.south, bbox.east, bbox.north];
    if (category) {
      params.push(category);
    }

    const result = await pool.query(query, params);
    return result.rows as PropertyRestrictionAttributes[];
  }

  /**
   * Find property restrictions by managing organization
   * 
   * @param organization - Organization name (e.g., "Historic England", "National Trust")
   * @returns Array of property restrictions managed by organization
   */
  static async findByOrganization(
    organization: string
  ): Promise<PropertyRestrictionAttributes[]> {
    const pool = (await import('../lib/db.js')).getDbPool();

    const query = `
      SELECT 
        property_id,
        property_name,
        managing_organization,
        ST_AsGeoJSON(geometry)::json as geometry,
        policy_text,
        contact_info,
        policy_effective_date,
        data_source_id,
        created_at,
        last_updated
      FROM property_restrictions
      WHERE managing_organization = $1
      ORDER BY property_name
    `;

    const result = await pool.query(query, [organization]);
    return result.rows as PropertyRestrictionAttributes[];
  }

  /**
   * Find property restriction by ID
   * 
   * @param propertyId - UUID of property restriction
   * @returns Property restriction or null if not found
   */
  static async findById(propertyId: string): Promise<PropertyRestrictionAttributes | null> {
    const pool = (await import('../lib/db.js')).getDbPool();

    const query = `
      SELECT 
        property_id,
        property_name,
        managing_organization,
        ST_AsGeoJSON(geometry)::json as geometry,
        policy_text,
        contact_info,
        policy_effective_date,
        data_source_id,
        created_at,
        last_updated
      FROM property_restrictions
      WHERE property_id = $1
    `;

    const result = await pool.query(query, [propertyId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as PropertyRestrictionAttributes;
  }

  /**
   * Update property restriction
   * 
   * @param propertyId - UUID of property restriction
   * @param updates - Fields to update
   * @returns Updated property restriction
   */
  static async update(
    propertyId: string,
    updates: Partial<{
      property_name: string;
      managing_organization: string;
      geometry: MultiPolygon | Polygon;
      policy_text: string;
      contact_info: string;
      policy_effective_date: Date;
    }>
  ): Promise<PropertyRestrictionAttributes> {
    const pool = (await import('../lib/db.js')).getDbPool();

    const setClauses: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    if (updates.property_name !== undefined) {
      setClauses.push(`property_name = $${valueIndex++}`);
      values.push(updates.property_name);
    }
    if (updates.managing_organization !== undefined) {
      setClauses.push(`managing_organization = $${valueIndex++}`);
      values.push(updates.managing_organization);
    }
    if (updates.geometry !== undefined) {
      let geometryGeoJSON = updates.geometry;
      if (updates.geometry.type === 'Polygon') {
        geometryGeoJSON = {
          type: 'MultiPolygon',
          coordinates: [updates.geometry.coordinates],
        } as MultiPolygon;
      }
      setClauses.push(`geometry = ST_Multi(ST_GeomFromGeoJSON($${valueIndex++}))`);
      values.push(JSON.stringify(geometryGeoJSON));
    }
    if (updates.policy_text !== undefined) {
      setClauses.push(`policy_text = $${valueIndex++}`);
      values.push(updates.policy_text);
    }
    if (updates.contact_info !== undefined) {
      setClauses.push(`contact_info = $${valueIndex++}`);
      values.push(updates.contact_info);
    }
    if (updates.policy_effective_date !== undefined) {
      setClauses.push(`policy_effective_date = $${valueIndex++}`);
      values.push(updates.policy_effective_date);
    }

    // Always update last_updated timestamp
    setClauses.push(`last_updated = NOW()`);

    // Add propertyId as final parameter
    values.push(propertyId);

    const query = `
      UPDATE property_restrictions
      SET ${setClauses.join(', ')}
      WHERE property_id = $${valueIndex}
      RETURNING 
        property_id,
        property_name,
        managing_organization,
        ST_AsGeoJSON(geometry)::json as geometry,
        policy_text,
        contact_info,
        policy_effective_date,
        data_source_id,
        created_at,
        last_updated
    `;

    const result = await pool.query(query, values);
    return result.rows[0] as PropertyRestrictionAttributes;
  }

  /**
   * Delete property restriction
   * 
   * @param propertyId - UUID of property restriction
   */
  static async delete(propertyId: string): Promise<void> {
    const pool = (await import('../lib/db.js')).getDbPool();

    const query = `DELETE FROM property_restrictions WHERE property_id = $1`;
    await pool.query(query, [propertyId]);
  }

  /**
   * Get property restrictions as GeoJSON FeatureCollection
   * 
   * @param bbox - Optional bounding box filter
   * @returns GeoJSON FeatureCollection
   */
  static async getGeoJSON(bbox?: BoundingBox): Promise<FeatureCollection> {
    const properties = bbox
      ? await PropertyRestriction.findInBbox(bbox)
      : await PropertyRestriction.findAll();

    const features = properties.map((prop) => ({
      type: 'Feature' as const,
      geometry: prop.geometry,
      properties: {
        property_id: prop.property_id,
        property_name: prop.property_name,
        managing_organization: prop.managing_organization,
        policy_text: prop.policy_text,
        contact_info: prop.contact_info,
        policy_effective_date: prop.policy_effective_date,
      },
    }));

    return {
      type: 'FeatureCollection',
      features,
    };
  }

  /**
   * Get all property restrictions
   * 
   * @returns Array of all property restrictions
   */
  static async findAll(): Promise<PropertyRestrictionAttributes[]> {
    const pool = (await import('../lib/db.js')).getDbPool();

    const query = `
      SELECT 
        property_id,
        property_name,
        managing_organization,
        ST_AsGeoJSON(geometry)::json as geometry,
        policy_text,
        contact_info,
        policy_effective_date,
        data_source_id,
        created_at,
        last_updated
      FROM property_restrictions
      ORDER BY property_name
    `;

    const result = await pool.query(query);
    return result.rows as PropertyRestrictionAttributes[];
  }
}
