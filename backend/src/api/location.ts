import { Router, Request, Response } from 'express';
import { LocationService } from '../services/location-service.js';
import { logger } from '../lib/logger.js';

/**
 * Location API Router
 * 
 * Provides HTTP endpoints for checking flight restriction status at specific locations.
 * 
 * SAFETY-CRITICAL: This endpoint determines flight legality. Incorrect responses
 * could lead to illegal flights in restricted airspace.
 * 
 * Endpoints:
 * - GET /location/check - Check restriction status at coordinates
 * 
 * Per FR-026: Location checks must complete within 5 seconds.
 */

export const locationRouter = Router();
const locationService = new LocationService();

/**
 * GET /location/check
 * 
 * Check restriction status at a specific coordinate.
 * Determines if flight is permitted, prohibited, or requires authorization.
 * 
 * Query Parameters:
 * - lng (required): Longitude (WGS84, -180 to 180)
 * - lat (required): Latitude (WGS84, -90 to 90)
 * 
 * Response:
 * - 200: LocationCheckResult with status, zones, TOAL info
 * - 400: Invalid parameters
 * - 500: Server error
 * 
 * @example
 * GET /location/check?lng=-0.1278&lat=51.5074
 */
locationRouter.get('/check', async (req: Request, res: Response) => {
  try {
    // Parse and validate required coordinate parameters
    const lng = parseFloat(req.query.lng as string);
    const lat = parseFloat(req.query.lat as string);

    // Validate parameters are provided
    if (isNaN(lng) || isNaN(lat)) {
      return res.status(400).json({
        error: 'Missing or invalid coordinate parameters. Required: lng, lat',
      });
    }

    // Validate coordinate ranges (will also be validated by service)
    if (lng < -180 || lng > 180) {
      return res.status(400).json({
        error: 'Invalid longitude. Must be between -180 and 180 degrees.',
      });
    }
    if (lat < -90 || lat > 90) {
      return res.status(400).json({
        error: 'Invalid latitude. Must be between -90 and 90 degrees.',
      });
    }

    // Call location service to check restriction status
    const result = await locationService.checkLocation(lng, lat);

    // Return result with metadata
    res.json({
      restriction_status: result.restriction_status,
      can_fly: result.can_fly,
      authorization_required: result.authorization_required,
      zones: result.zones.map((zone) => ({
        zone_id: zone.zone_id,
        zone_type: zone.zone_type,
        restriction_name: zone.restriction_name,
        geometry: zone.geometry,
        authority_source: zone.authority_source,
        altitude_floor: zone.altitude_floor,
        altitude_ceiling: zone.altitude_ceiling,
        effective_start: zone.effective_start,
        effective_end: zone.effective_end,
        description: zone.description,
        authorization_possible: zone.authorization_possible,
        confidence_level: zone.confidence_level,
        last_updated: zone.last_updated,
      })),
      nearest_toal: result.nearest_toal
        ? {
            site_id: result.nearest_toal.site_id,
            site_name: result.nearest_toal.site_name,
            access_type: result.nearest_toal.access_type,
            verified: result.nearest_toal.verified,
            data_source: result.nearest_toal.data_source,
            distance_meters: result.nearest_toal.distance_meters,
          }
        : null,
      metadata: {
        query_timestamp: new Date().toISOString(),
        coordinates: { lng, lat },
      },
    });

    logger.info('Location check successful', {
      coordinates: { lng, lat },
      restrictionStatus: result.restriction_status,
      zonesCount: result.zones.length,
      hasNearestToal: result.nearest_toal !== null,
    });
  } catch (error) {
    logger.error('Location check failed', { error });
    res.status(500).json({
      error: 'Failed to check location restriction status',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
