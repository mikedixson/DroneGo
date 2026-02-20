import { Router, Request, Response } from 'express';
import { LocationService } from '../services/location-service.js';
import { GeocodingService } from '../services/geocoding-service.js';
import { logger } from '../lib/logger.js';

/**
 * Location API Router (User Story 1 - Tri-State Integration)
 * 
 * Provides HTTP endpoints for checking flight restriction status at specific locations.
 * 
 * SAFETY-CRITICAL: This endpoint determines flight legality. Incorrect responses
 * could lead to illegal flights in restricted airspace or unauthorized flights
 * over heritage sites.
 * 
 * Tri-State Response (User Story 1):
 * - 'prohibited': Airspace restricted, flight not allowed
 * - 'check-property-restrictions': Airspace clear but property restrictions apply
 * - 'permitted': Both airspace and property clear
 * 
 * Endpoints:
 * - GET /location/check - Check restriction status at coordinates (tri-state)
 * 
 * Per FR-026: Location checks must complete within 5 seconds.
 */

export const locationRouter = Router();
const locationService = new LocationService();
const geocodingService = new GeocodingService();

/**
 * GET /location/check (User Story 1 - Tri-State)
 * 
 * Check restriction status at a specific coordinate.
 * Returns tri-state flight status:
 * - 'prohibited': Airspace restricted
 * - 'check-property-restrictions': Property restrictions apply
 * - 'permitted': Both clear
 * 
 * Query Parameters:
 * - lng (required): Longitude (WGS84, -180 to 180)
 * - lat (required): Latitude (WGS84, -90 to 90)
 * 
 * Response:
 * - 200: LocationCheckResult with tri-state status, zones, property restrictions, TOAL info
 * - 400: Invalid parameters
 * - 500: Server error
 * 
 * @example
 * GET /location/check?lng=-1.8262&lat=51.1789
 * Response:
 * {
 *   "flight_status": "check-property-restrictions",
 *   "airspace_clear": true,
 *   "property_advisory": true,
 *   "zones": [],
 *   "property_restrictions": [
 *     {
 *       "property_name": "Stonehenge",
 *       "organization": "English Heritage Trust",
 *       "policy_summary": "World Heritage Site. Drone flights require...",
 *       "contact": "permissions@english-heritage.org.uk"
 *     }
 *   ],
 *   "message": "Airspace clear, but property restrictions may apply.",
 *   "nearest_toal": null
 * }
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

    // Return tri-state result (User Story 1)
    res.json({
      // User Story 1 tri-state fields
      flight_status: result.flight_status,
      airspace_clear: result.airspace_clear,
      property_advisory: result.property_advisory,
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
      property_restrictions: result.property_restrictions,
      message: result.message,
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
      
      // Legacy fields for backward compatibility (deprecated)
      restriction_status: result.restriction_status,
      can_fly: result.can_fly,
      authorization_required: result.authorization_required,
      
      metadata: {
        query_timestamp: new Date().toISOString(),
        coordinates: { lng, lat },
      },
    });

    logger.info('Location check successful (tri-state)', {
      coordinates: { lng, lat },
      flightStatus: result.flight_status,
      airspaceClear: result.airspace_clear,
      propertyAdvisory: result.property_advisory,
      zonesCount: result.zones.length,
      propertyRestrictionsCount: result.property_restrictions.length,
      hasNearestToal: result.nearest_toal !== null,
    });
    return;
  } catch (error) {
    logger.error('Location check failed', { error });
    res.status(500).json({
      error: 'Failed to check location restriction status',
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }
});
/**
 * GET /location/search
 * 
 * Search for a location by address or postcode using geocoding.
 * Returns search results with coordinates that can be used to navigate the map.
 * 
 * Query Parameters:
 * - q (required): Search query (address, postcode, place name)
 * - limit (optional): Maximum number of results (default: 5, max: 10)
 * - countryCode (optional): Restrict to country code (default: 'gb' for UK)
 * 
 * Response:
 * - 200: Array of geocoding results with coordinates
 * - 400: Missing or invalid query
 * - 404: No results found
 * - 500: Server error
 * 
 * @example
 * GET /location/search?q=SW1A%201AA
 * GET /location/search?q=Hyde%20Park,%20London&limit=3
 */
locationRouter.get('/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Missing search query. Required: q parameter',
      });
    }

    // Parse optional parameters
    let limit = 5;
    if (req.query.limit) {
      limit = parseInt(req.query.limit as string, 10);
      if (isNaN(limit) || limit < 1 || limit > 10) {
        return res.status(400).json({
          error: 'Invalid limit. Must be between 1 and 10.',
        });
      }
    }

    const countryCode = (req.query.countryCode as string) || 'gb';

    // Perform geocoding search
    const results = await geocodingService.search(query, {
      limit,
      countryCode
    });

    if (results.length === 0) {
      return res.status(404).json({
        error: 'No locations found matching search query',
        query
      });
    }

    // Format response with distance calculation from query center if needed
    const response = {
      query,
      results: results.map((result) => ({
        display_name: result.display_name,
        lat: result.lat,
        lon: result.lon,
        type: result.type,
        importance: result.importance,
        boundingbox: result.boundingbox
      })),
      metadata: {
        count: results.length,
        timestamp: new Date().toISOString()
      }
    };

    logger.info('Location search successful', {
      query,
      resultCount: results.length
    });

    res.json(response);
    return;
  } catch (error) {
    logger.error('Location search failed', { error });
    res.status(500).json({
      error: 'Failed to search for location',
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }
});