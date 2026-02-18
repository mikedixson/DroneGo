import { Router, Request, Response } from 'express';
import { TOALService } from '../services/toal-service.js';
import { logger } from '../lib/logger.js';

/**
 * TOAL Sites API Router
 * 
 * Provides HTTP endpoints for querying Take Off and Landing sites.
 * 
 * Endpoints:
 * - GET /toal - Query TOAL sites within bounding box with filters
 * - GET /toal/nearest - Find nearest TOAL site(s) to coordinates
 * - GET /toal/:siteId - Get single TOAL site by ID
 * 
 * Responses follow GeoJSON FeatureCollection format per FR-012, FR-013.
 */

export const toalRouter = Router();
const toalService = new TOALService();

/**
 * GET /toal
 * 
 * Query TOAL sites within a bounding box with optional filters.
 * 
 * Query Parameters:
 * - minLng (required): Minimum longitude (WGS84, -180 to 180)
 * - minLat (required): Minimum latitude (WGS84, -90 to 90)
 * - maxLng (required): Maximum longitude (WGS84, -180 to 180)
 * - maxLat (required): Maximum latitude (WGS84, -90 to 90)
 * - accessTypes (optional): Comma-separated list of access types (public, private, permit-required, club-only)
 * - verified (optional): Filter by verified status (true/false)
 * - surfaceTypes (optional): Comma-separated list of surface types
 * 
 * Response:
 * - 200: GeoJSON FeatureCollection with TOAL sites
 * - 400: Invalid parameters
 * - 500: Server error
 * 
 * @example
 * GET /toal?minLng=-0.5&minLat=51.5&maxLng=-0.4&maxLat=51.6
 * GET /toal?minLng=-0.5&minLat=51.5&maxLng=-0.4&maxLat=51.6&accessTypes=public&verified=true
 */
toalRouter.get('/', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    // Parse and validate required bounds parameters
    const minLng = parseFloat(req.query.minLng as string);
    const minLat = parseFloat(req.query.minLat as string);
    const maxLng = parseFloat(req.query.maxLng as string);
    const maxLat = parseFloat(req.query.maxLat as string);

    // Validate all bounds parameters are provided
    if (isNaN(minLng) || isNaN(minLat) || isNaN(maxLng) || isNaN(maxLat)) {
      return res.status(400).json({
        error: 'Missing or invalid bounds parameters. Required: minLng, minLat, maxLng, maxLat',
      });
    }

    // Validate coordinate ranges
    if (minLng < -180 || minLng > 180 || maxLng < -180 || maxLng > 180) {
      return res.status(400).json({
        error: 'Invalid longitude. Must be between -180 and 180 degrees.',
      });
    }
    if (minLat < -90 || minLat > 90 || maxLat < -90 || maxLat > 90) {
      return res.status(400).json({
        error: 'Invalid latitude. Must be between -90 and 90 degrees.',
      });
    }

    // Validate bounds are not inverted
    if (minLng >= maxLng) {
      return res.status(400).json({
        error: 'Invalid bounding box: minLng must be less than maxLng',
      });
    }
    if (minLat >= maxLat) {
      return res.status(400).json({
        error: 'Invalid bounding box: minLat must be less than maxLat',
      });
    }

    // Parse optional filter parameters
    const options: {
      accessTypes?: string[];
      verified?: boolean;
      surfaceTypes?: string[];
    } = {};

    if (req.query.accessTypes) {
      options.accessTypes = (req.query.accessTypes as string)
        .split(',')
        .map((t) => t.trim());
    }

    if (req.query.verified !== undefined) {
      options.verified = req.query.verified === 'true';
    }

    if (req.query.surfaceTypes) {
      options.surfaceTypes = (req.query.surfaceTypes as string)
        .split(',')
        .map((t) => t.trim());
    }

    // Query TOAL sites
    const sites = await toalService.findTOALInBounds(
      minLng,
      minLat,
      maxLng,
      maxLat,
      options
    );

    // Format as GeoJSON FeatureCollection
    const geoJSON = {
      type: 'FeatureCollection',
      features: sites.map((site) => ({
        type: 'Feature',
        id: site.site_id,
        geometry: site.geometry,
        properties: {
          site_name: site.site_name,
          access_type: site.access_type,
          surface_type: site.surface_type,
          facilities: site.facilities,
          operating_hours: site.operating_hours,
          restrictions: site.restrictions,
          contact_info: site.contact_info,
          verified: site.verified,
          data_source: site.data_source,
          last_updated: site.last_updated,
          // Add confidence badge info (FR-013B)
          confidence_badge: toalService.getConfidenceBadge(site)
        }
      })),
      metadata: {
        result_count: sites.length,
        query_time_ms: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    };

    logger.info('TOAL sites query', {
      bounds: { minLng, minLat, maxLng, maxLat },
      filters: options,
      resultCount: sites.length
    });

    res.json(geoJSON);
  } catch (error) {
    logger.error('Error querying TOAL sites', { error });
    res.status(500).json({
      error: 'Internal server error while querying TOAL sites'
    });
  }
});

/**
 * GET /toal/nearest
 * 
 * Find nearest TOAL site(s) to given coordinates.
 * 
 * Query Parameters:
 * - lat (required): Latitude (WGS84, -90 to 90)
 * - lng (required): Longitude (WGS84, -180 to 180)
 * - limit (optional): Maximum number of results (default: 1, max: 10)
 * - accessTypes (optional): Comma-separated list of access types
 * - verified (optional): Filter by verified status (true/false)
 * 
 * Response:
 * - 200: Array of TOAL sites with distances
 * - 400: Invalid parameters
 * - 404: No TOAL sites found
 * - 500: Server error
 * 
 * @example
 * GET /toal/nearest?lat=51.5074&lng=-0.1278
 * GET /toal/nearest?lat=51.5074&lng=-0.1278&limit=3&accessTypes=public
 */
toalRouter.get('/nearest', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    // Parse and validate required parameters
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({
        error: 'Missing or invalid coordinates. Required: lat, lng',
      });
    }

    // Validate coordinate ranges
    if (lat < -90 || lat > 90) {
      return res.status(400).json({
        error: 'Invalid latitude. Must be between -90 and 90 degrees.',
      });
    }
    if (lng < -180 || lng > 180) {
      return res.status(400).json({
        error: 'Invalid longitude. Must be between -180 and 180 degrees.',
      });
    }

    // Parse optional parameters
    let limit = 1;
    if (req.query.limit) {
      limit = parseInt(req.query.limit as string, 10);
      if (isNaN(limit) || limit < 1 || limit > 10) {
        return res.status(400).json({
          error: 'Invalid limit. Must be between 1 and 10.',
        });
      }
    }

    const options: {
      accessTypes?: string[];
      verified?: boolean;
    } = {};

    if (req.query.accessTypes) {
      options.accessTypes = (req.query.accessTypes as string)
        .split(',')
        .map((t) => t.trim());
    }

    if (req.query.verified !== undefined) {
      options.verified = req.query.verified === 'true';
    }

    // Find nearest TOAL sites
    const sites = await toalService.findNearestTOAL(lat, lng, limit, options);

    if (sites.length === 0) {
      return res.status(404).json({
        error: 'No TOAL sites found matching criteria'
      });
    }

    // Format response
    const response = {
      query: {
        lat,
        lng,
        limit
      },
      results: sites.map((site) => ({
        site_id: site.site_id,
        site_name: site.site_name,
        geometry: site.geometry,
        access_type: site.access_type,
        surface_type: site.surface_type,
        facilities: site.facilities,
        operating_hours: site.operating_hours,
        restrictions: site.restrictions,
        contact_info: site.contact_info,
        verified: site.verified,
        data_source: site.data_source,
        last_updated: site.last_updated,
        distance_meters: site.distance_meters,
        distance_km: site.distance_km,
        // Add confidence badge info (FR-013B)
        confidence_badge: toalService.getConfidenceBadge(site)
      })),
      metadata: {
        result_count: sites.length,
        query_time_ms: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    };

    logger.info('Nearest TOAL query', {
      lat,
      lng,
      limit,
      filters: options,
      resultCount: sites.length
    });

    res.json(response);
  } catch (error) {
    logger.error('Error finding nearest TOAL', { error });
    res.status(500).json({
      error: 'Internal server error while finding nearest TOAL'
    });
  }
});

/**
 * GET /toal/:siteId
 * 
 * Get single TOAL site by ID.
 * 
 * Response:
 * - 200: GeoJSON Feature with TOAL site data
 * - 404: TOAL site not found
 * - 500: Server error
 * 
 * @example
 * GET /toal/7c9e6679-7425-40de-944b-e07fc1f90ae7
 */
toalRouter.get('/:siteId', async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;

    const site = await toalService.getTOALById(siteId);

    if (!site) {
      return res.status(404).json({
        error: 'TOAL site not found'
      });
    }

    // Format as GeoJSON Feature
    const geoJSON = {
      type: 'Feature',
      id: site.site_id,
      geometry: site.geometry,
      properties: {
        site_name: site.site_name,
        access_type: site.access_type,
        surface_type: site.surface_type,
        facilities: site.facilities,
        operating_hours: site.operating_hours,
        restrictions: site.restrictions,
        contact_info: site.contact_info,
        verified: site.verified,
        data_source: site.data_source,
        last_updated: site.last_updated,
        created_at: site.created_at,
        // Add confidence badge info (FR-013B)
        confidence_badge: toalService.getConfidenceBadge(site)
      }
    };

    res.json(geoJSON);
  } catch (error) {
    logger.error('Error fetching TOAL site', { siteId: req.params.siteId, error });
    res.status(500).json({
      error: 'Internal server error while fetching TOAL site'
    });
  }
});
