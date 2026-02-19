import { Router, Request, Response } from 'express';
import { PropertyService } from '../services/property-service.js';
import { logger } from '../lib/logger.js';

/**
 * Property Restrictions API Router (User Story 1)
 * 
 * Provides HTTP endpoints for querying heritage sites and property restrictions
 * for map display and pilot information.
 * 
 * SAFETY-CRITICAL: Property restriction data must be accurate to prevent
 * unauthorized flights over heritage sites and private properties.
 * 
 * Endpoints:
 * - GET /property-restrictions - Get properties in bounding box (GeoJSON)
 * 
 * Response Format:
 * - GeoJSON FeatureCollection per property-restrictions.yaml contract
 * - Each feature includes property_name, organization, policy_text
 */

export const propertyRestrictionsRouter = Router();
const propertyService = new PropertyService();

/**
 * GET /property-restrictions
 * 
 * Get property restrictions within a bounding box.
 * Returns GeoJSON FeatureCollection for map display.
 * 
 * Query Parameters:
 * - bbox (required): Bounding box as "west,south,east,north" (WGS84)
 * - category (optional): Filter by restriction category (HERITAGE_SITE, SSSI, etc.)
 * 
 * Response:
 * - 200: GeoJSON FeatureCollection with property features
 * - 400: Missing or invalid bbox parameter
 * - 500: Server error
 * 
 * @example
 * GET /property-restrictions?bbox=-1.0,51.0,-0.5,51.5
 * Response:
 * {
 *   "type": "FeatureCollection",
 *   "features": [
 *     {
 *       "type": "Feature",
 *       "geometry": {
 *         "type": "MultiPolygon",
 *         "coordinates": [[[[...]]]]
 *       },
 *       "properties": {
 *         "property_id": "uuid",
 *         "property_name": "Stonehenge",
 *         "organization": "English Heritage Trust",
 *         "policy_text": "World Heritage Site. Drone flights...",
 *         "contact_info": "permissions@english-heritage.org.uk"
 *       }
 *     }
 *   ]
 * }
 */
propertyRestrictionsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const bboxParam = req.query.bbox as string;

    // Validate bbox parameter
    if (!bboxParam || bboxParam.trim().length === 0) {
      return res.status(400).json({
        error: 'Missing bbox parameter. Required format: west,south,east,north',
      });
    }

    // Parse bbox string: "west,south,east,north"
    const bboxParts = bboxParam.split(',').map((part) => parseFloat(part.trim()));

    if (bboxParts.length !== 4 || bboxParts.some((val) => isNaN(val))) {
      return res.status(400).json({
        error: 'Invalid bbox format. Expected: west,south,east,north (comma-separated numbers)',
        example: '-1.0,51.0,-0.5,51.5',
      });
    }

    const [west, south, east, north] = bboxParts;

    // Validate coordinate ranges
    if (west < -180 || west > 180 || east < -180 || east > 180) {
      return res.status(400).json({
        error: 'Invalid longitude values. Must be between -180 and 180 degrees.',
      });
    }

    if (south < -90 || south > 90 || north < -90 || north > 90) {
      return res.status(400).json({
        error: 'Invalid latitude values. Must be between -90 and 90 degrees.',
      });
    }

    // Validate bbox orientation
    if (west >= east) {
      return res.status(400).json({
        error: 'Invalid bbox: west must be less than east.',
      });
    }

    if (south >= north) {
      return res.status(400).json({
        error: 'Invalid bbox: south must be less than north.',
      });
    }

    // Query property restrictions in bounding box
    const bbox = { west, south, east, north };
    const category = req.query.category as string | undefined;
    const properties = await propertyService.getPropertyRestrictionsByBbox(bbox, category);

    // Format as GeoJSON FeatureCollection (per property-restrictions.yaml)
    const featureCollection = {
      type: 'FeatureCollection' as const,
      features: properties.map((property) => ({
        type: 'Feature' as const,
        geometry: property.geometry, // Already in GeoJSON format from model
        properties: {
          property_id: property.property_id,
          property_name: property.property_name,
          organization: property.managing_organization,
          restriction_category: property.restriction_category,
          policy_text: property.policy_text,
          contact_info: property.contact_info,
          policy_effective_date: property.policy_effective_date,
        },
      })),
    };

    res.json(featureCollection);

    logger.info('Property restrictions query successful', {
      bbox,
      propertiesCount: properties.length,
    });
  } catch (error) {
    logger.error('Property restrictions query failed', { error });
    res.status(500).json({
      error: 'Failed to query property restrictions',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /property-restrictions/:id
 * 
 * Get single property restriction by ID.
 * 
 * Parameters:
 * - id (required): Property restriction UUID
 * 
 * Response:
 * - 200: GeoJSON Feature for single property
 * - 404: Property not found
 * - 500: Server error
 * 
 * @example
 * GET /property-restrictions/123e4567-e89b-12d3-a456-426614174000
 */
propertyRestrictionsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const propertyId = req.params.id;

    const property = await propertyService.queryPropertyById(propertyId);

    if (!property) {
      return res.status(404).json({
        error: 'Property restriction not found',
        property_id: propertyId,
      });
    }

    // Return as GeoJSON Feature
    const feature = {
      type: 'Feature' as const,
      geometry: property.geometry,
      properties: {
        property_id: property.property_id,
        property_name: property.property_name,
        organization: property.managing_organization,
        restriction_category: property.restriction_category,
        policy_text: property.policy_text,
        contact_info: property.contact_info,
        policy_effective_date: property.policy_effective_date,
      },
    };

    res.json(feature);

    logger.info('Property restriction retrieved', {
      property_id: propertyId,
      property_name: property.property_name,
    });
  } catch (error) {
    logger.error('Property restriction retrieval failed', { error });
    res.status(500).json({
      error: 'Failed to retrieve property restriction',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
