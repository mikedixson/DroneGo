import { Router, Request, Response } from 'express';
import { ZonesService } from '../services/zones-service.js';
import { logger } from '../lib/logger.js';

/**
 * Zones API Router
 * 
 * Provides HTTP endpoints for querying drone restriction zones.
 * 
 * Endpoints:
 * - GET /zones - Query zones within bounding box with filters
 * 
 * Responses follow GeoJSON FeatureCollection format per FR-002.
 * All responses include data freshness metadata per FR-008.
 */

export const zonesRouter = Router();
const zonesService = new ZonesService();

/**
 * GET /zones
 * 
 * Query restriction zones within a bounding box with optional filters.
 * 
 * Query Parameters:
 * - minLng (required): Minimum longitude (WGS84, -180 to 180)
 * - minLat (required): Minimum latitude (WGS84, -90 to 90)
 * - maxLng (required): Maximum longitude (WGS84, -180 to 180)
 * - maxLat (required): Maximum latitude (WGS84, -90 to 90)
 * - zoneTypes (optional): Comma-separated list of zone types to include
 * - includeExpired (optional): Include expired zones (default: false)
 * - confidenceLevels (optional): Comma-separated list of confidence levels
 * - authoritySources (optional): Comma-separated list of authority names
 * 
 * Response:
 * - 200: GeoJSON FeatureCollection with zones and metadata
 * - 400: Invalid parameters
 * - 500: Server error
 * 
 * @example
 * GET /zones?minLng=-0.5&minLat=51.5&maxLng=-0.4&maxLat=51.6
 * GET /zones?minLng=-0.5&minLat=51.5&maxLng=-0.4&maxLat=51.6&zoneTypes=no-fly,controlled-airspace
 */
zonesRouter.get('/', async (req: Request, res: Response) => {
  try {
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
      zoneTypes?: string[];
      includeExpired?: boolean;
      confidenceLevels?: string[];
      authoritySources?: string[];
    } = {};

    if (req.query.zoneTypes) {
      options.zoneTypes = (req.query.zoneTypes as string).split(',').map((t) => t.trim());
    }

    if (req.query.includeExpired === 'true') {
      options.includeExpired = true;
    }

    if (req.query.confidenceLevels) {
      options.confidenceLevels = (req.query.confidenceLevels as string)
        .split(',')
        .map((l) => l.trim());
    }

    if (req.query.authoritySources) {
      options.authoritySources = (req.query.authoritySources as string)
        .split(',')
        .map((a) => a.trim());
    }

    // Query zones service
    const zones = await zonesService.findZonesInBounds(minLng, minLat, maxLng, maxLat, options);

    // Convert to GeoJSON FeatureCollection format (FR-002)
    const features = zones.map((zone) => ({
      type: 'Feature',
      geometry: zone.geometry,
      properties: {
        zone_id: zone.zone_id,
        zone_type: zone.zone_type,
        restriction_name: zone.restriction_name,
        authority_source: zone.authority_source,
        altitude_floor: zone.altitude_floor,
        altitude_ceiling: zone.altitude_ceiling,
        effective_start: zone.effective_start,
        effective_end: zone.effective_end,
        description: zone.description,
        authorization_possible: zone.authorization_possible,
        confidence_level: zone.confidence_level,
        last_updated: zone.last_updated,
        // Include data source metadata if enriched
        ...(zone.data_source_info && {
          data_source: {
            authority_name: zone.data_source_info.authority_name,
            confidence_level: zone.data_source_info.confidence_level,
            last_update: zone.data_source_info.last_update,
          },
        }),
      },
    }));

    // Build data freshness metadata (FR-008)
    const uniqueAuthorities = new Set(zones.map((z) => z.authority_source));
    const dataSourcesMetadata = Array.from(uniqueAuthorities).map((authority) => {
      const zoneFromAuthority = zones.find((z) => z.authority_source === authority);
      return {
        authority_name: authority,
        last_update:
          zoneFromAuthority?.data_source_info?.last_update ||
          zoneFromAuthority?.last_updated,
        confidence_level: zoneFromAuthority?.confidence_level || 'unknown',
      };
    });

    // Return GeoJSON FeatureCollection with metadata
    res.json({
      type: 'FeatureCollection',
      features,
      metadata: {
        query_timestamp: new Date().toISOString(),
        bounds: { minLng, minLat, maxLng, maxLat },
        filters: options,
        result_count: features.length,
        data_sources: dataSourcesMetadata,
      },
    });

    logger.info('Zones query successful', {
      bounds: { minLng, minLat, maxLng, maxLat },
      filters: options,
      resultCount: features.length,
    });
    return;
  } catch (error) {
    logger.error('Zones query failed', { error });
    res.status(500).json({
      error: 'Failed to query restriction zones',
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }
});
/**
 * GET /zones/:zoneId
 * 
 * Get detailed information about a specific restriction zone by ID.
 * 
 * Path Parameters:
 * - zoneId (required): UUID of the zone
 * 
 * Response:
 * - 200: GeoJSON Feature with zone details and data source metadata
 * - 404: Zone not found
 * - 500: Server error
 * 
 * @example
 * GET /zones/550e8400-e29b-41d4-a716-446655440000
 */
zonesRouter.get('/:zoneId', async (req: Request, res: Response) => {
  try {
    const { zoneId } = req.params;

    // Basic UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(zoneId)) {
      res.status(400).json({
        error: 'Invalid zone ID format',
        message: 'Zone ID must be a valid UUID',
      });
      return;
    }

    const zone = await zonesService.findZoneById(zoneId);

    if (!zone) {
      res.status(404).json({
        error: 'Zone not found',
        message: `No zone found with ID: ${zoneId}`,
      });
      return;
    }

    // Convert to GeoJSON Feature format
    const feature = {
      type: 'Feature' as const,
      id: zone.zone_id,
      geometry: zone.geometry,
      properties: {
        zone_type: zone.zone_type,
        restriction_name: zone.restriction_name,
        authority_source: zone.authority_source,
        altitude_floor: zone.altitude_floor,
        altitude_ceiling: zone.altitude_ceiling,
        effective_start: zone.effective_start,
        effective_end: zone.effective_end,
        description: zone.description,
        authorization_possible: zone.authorization_possible,
        confidence_level: zone.confidence_level,
        last_updated: zone.last_updated,
        data_source_info: zone.data_source_info,
      },
    };

    res.json({
      ...feature,
      metadata: {
        query_timestamp: new Date().toISOString(),
      },
    });

    logger.info('Zone detail query successful', {
      zoneId,
      zoneType: zone.zone_type,
    });
  } catch (error) {
    logger.error('Zone detail query failed', { error, zoneId: req.params.zoneId });
    res.status(500).json({
      error: 'Failed to retrieve zone details',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});