import { Router, Request, Response } from 'express';
import { AirspaceService } from '../services/airspace-service.js';
import { logger } from '../lib/logger.js';

/**
 * Airspace API Router
 * 
 * Provides HTTP endpoints for querying ICAO airspace classifications.
 * 
 * Endpoints:
 * - GET /airspace - Query airspace at point or within bounding box
 * - GET /airspace/:airspaceId - Get single airspace by ID
 * 
 * Responses follow GeoJSON format per FR-002.
 * Supports ICAO airspace classes A-G per FR-006.
 */

export const airspaceRouter = Router();
const airspaceService = new AirspaceService();

/**
 * GET /airspace
 * 
 * Query airspace classifications. Supports two modes:
 * 1. Point query: Find all airspace containing a coordinate
 * 2. Bounds query: Find all airspace intersecting a bounding box
 * 
 * Point Query Parameters:
 * - lng (required): Longitude (WGS84, -180 to 180)
 * - lat (required): Latitude (WGS84, -90 to 90)
 * - altitude (optional): Altitude in feet AMSL for 3D filtering
 * 
 * Bounds Query Parameters:
 * - minLng (required): Minimum longitude (WGS84, -180 to 180)
 * - minLat (required): Minimum latitude (WGS84, -90 to 90)
 * - maxLng (required): Maximum longitude (WGS84, -180 to 180)
 * - maxLat (required): Maximum latitude (WGS84, -90 to 90)
 * - altitudeFloor (optional): Minimum altitude in feet AMSL
 * - altitudeCeiling (optional): Maximum altitude in feet AMSL
 * 
 * Common Query Parameters:
 * - classes (optional): Comma-separated ICAO classes to filter (e.g., 'A,B,C')
 * 
 * Response:
 * - 200: GeoJSON FeatureCollection with airspace classifications
 * - 400: Invalid parameters
 * - 500: Server error
 * 
 * @example
 * GET /airspace?lng=-0.1656&lat=51.5074
 * GET /airspace?lng=-0.1656&lat=51.5074&altitude=1000
 * GET /airspace?minLng=-0.5&minLat=51.5&maxLng=-0.4&maxLat=51.6
 * GET /airspace?minLng=-0.5&minLat=51.5&maxLng=-0.4&maxLat=51.6&classes=C,D,E
 */
airspaceRouter.get('/', async (req: Request, res: Response) => {
  try {
    // Determine query mode based on parameters
    const hasPointParams = req.query.lng && req.query.lat;
    const hasBoundsParams = req.query.minLng && req.query.minLat && 
                            req.query.maxLng && req.query.maxLat;

    if (!hasPointParams && !hasBoundsParams) {
      res.status(400).json({
        error: 'Invalid query parameters',
        message: 'Either provide (lng, lat) for point query or (minLng, minLat, maxLng, maxLat) for bounds query',
      });
      return;
    }

    if (hasPointParams && hasBoundsParams) {
      res.status(400).json({
        error: 'Ambiguous query parameters',
        message: 'Provide either point parameters (lng, lat) OR bounds parameters, not both',
      });
      return;
    }

    let airspaces;
    let queryType: 'point' | 'bounds';
    let queryParams: any = {};

    if (hasPointParams) {
      // Point query mode
      const lng = parseFloat(req.query.lng as string);
      const lat = parseFloat(req.query.lat as string);
      const altitude = req.query.altitude ? parseFloat(req.query.altitude as string) : undefined;

      if (isNaN(lng) || isNaN(lat)) {
        res.status(400).json({
          error: 'Invalid coordinates',
          message: 'lng and lat must be valid numbers',
        });
        return;
      }

      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        res.status(400).json({
          error: 'Coordinates out of range',
          message: 'lng must be -180 to 180, lat must be -90 to 90',
        });
        return;
      }

      if (altitude !== undefined && isNaN(altitude)) {
        res.status(400).json({
          error: 'Invalid altitude',
          message: 'altitude must be a valid number',
        });
        return;
      }

      airspaces = await airspaceService.findAirspaceAtPoint(lng, lat, altitude);
      queryType = 'point';
      queryParams = { lng, lat, altitude };

    } else {
      // Bounds query mode
      const minLng = parseFloat(req.query.minLng as string);
      const minLat = parseFloat(req.query.minLat as string);
      const maxLng = parseFloat(req.query.maxLng as string);
      const maxLat = parseFloat(req.query.maxLat as string);
      const altitudeFloor = req.query.altitudeFloor ? parseFloat(req.query.altitudeFloor as string) : undefined;
      const altitudeCeiling = req.query.altitudeCeiling ? parseFloat(req.query.altitudeCeiling as string) : undefined;

      if (isNaN(minLng) || isNaN(minLat) || isNaN(maxLng) || isNaN(maxLat)) {
        res.status(400).json({
          error: 'Invalid bounds',
          message: 'minLng, minLat, maxLng, maxLat must be valid numbers',
        });
        return;
      }

      if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) {
        res.status(400).json({
          error: 'Bounds out of range',
          message: 'Longitude must be -180 to 180, latitude must be -90 to 90',
        });
        return;
      }

      if (minLng >= maxLng || minLat >= maxLat) {
        res.status(400).json({
          error: 'Invalid bounds',
          message: 'minLng must be less than maxLng, minLat must be less than maxLat',
        });
        return;
      }

      if ((altitudeFloor !== undefined && isNaN(altitudeFloor)) ||
          (altitudeCeiling !== undefined && isNaN(altitudeCeiling))) {
        res.status(400).json({
          error: 'Invalid altitude range',
          message: 'altitudeFloor and altitudeCeiling must be valid numbers',
        });
        return;
      }

      airspaces = await airspaceService.findAirspaceInBounds(
        minLng, minLat, maxLng, maxLat,
        altitudeFloor, altitudeCeiling
      );
      queryType = 'bounds';
      queryParams = { minLng, minLat, maxLng, maxLat, altitudeFloor, altitudeCeiling };
    }

    // Optional class filtering
    if (req.query.classes) {
      const requestedClasses = (req.query.classes as string).split(',').map(c => c.trim().toUpperCase());
      const validClasses = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
      const invalidClasses = requestedClasses.filter(c => !validClasses.includes(c));
      
      if (invalidClasses.length > 0) {
        res.status(400).json({
          error: 'Invalid airspace classes',
          message: `Invalid classes: ${invalidClasses.join(', ')}. Valid classes are: A-G`,
        });
        return;
      }

      airspaces = airspaces.filter(a => requestedClasses.includes(a.class_designation));
      queryParams.classes = requestedClasses;
    }

    // Convert to GeoJSON FeatureCollection
    const features = airspaces.map(airspace => ({
      type: 'Feature' as const,
      id: airspace.airspace_id,
      geometry: airspace.geometry,
      properties: {
        class_designation: airspace.class_designation,
        airspace_name: airspace.airspace_name,
        altitude_floor: airspace.altitude_floor,
        altitude_ceiling: airspace.altitude_ceiling,
        controlling_authority: airspace.controlling_authority,
        rules_description: airspace.rules_description,
        uas_authorization_required: airspace.uas_authorization_required,
        authorization_process: airspace.authorization_process,
        last_updated: airspace.last_updated,
      },
    }));

    res.json({
      type: 'FeatureCollection',
      features,
      metadata: {
        query_timestamp: new Date().toISOString(),
        query_type: queryType,
        query_params: queryParams,
        result_count: features.length,
      },
    });

    logger.info('Airspace query successful', {
      queryType,
      resultCount: features.length,
    });

  } catch (error) {
    logger.error('Airspace query failed', { error });
    res.status(500).json({
      error: 'Failed to query airspace classifications',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /airspace/:airspaceId
 * 
 * Get detailed information about a specific airspace classification by ID.
 * 
 * Path Parameters:
 * - airspaceId (required): UUID of the airspace classification
 * 
 * Response:
 * - 200: GeoJSON Feature with airspace details
 * - 404: Airspace not found
 * - 500: Server error
 * 
 * @example
 * GET /airspace/550e8400-e29b-41d4-a716-446655440000
 */
airspaceRouter.get('/:airspaceId', async (req: Request, res: Response) => {
  try {
    const { airspaceId } = req.params;

    // Basic UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(airspaceId)) {
      res.status(400).json({
        error: 'Invalid airspace ID format',
        message: 'Airspace ID must be a valid UUID',
      });
      return;
    }

    const airspace = await airspaceService.findAirspaceById(airspaceId);

    if (!airspace) {
      res.status(404).json({
        error: 'Airspace not found',
        message: `No airspace classification found with ID: ${airspaceId}`,
      });
      return;
    }

    // Convert to GeoJSON Feature
    const feature = {
      type: 'Feature' as const,
      id: airspace.airspace_id,
      geometry: airspace.geometry,
      properties: {
        class_designation: airspace.class_designation,
        airspace_name: airspace.airspace_name,
        altitude_floor: airspace.altitude_floor,
        altitude_ceiling: airspace.altitude_ceiling,
        controlling_authority: airspace.controlling_authority,
        rules_description: airspace.rules_description,
        uas_authorization_required: airspace.uas_authorization_required,
        authorization_process: airspace.authorization_process,
        last_updated: airspace.last_updated,
      },
    };

    res.json({
      ...feature,
      metadata: {
        query_timestamp: new Date().toISOString(),
      },
    });

    logger.info('Airspace detail query successful', {
      airspaceId,
      class: airspace.class_designation,
    });

  } catch (error) {
    logger.error('Airspace detail query failed', { error, airspaceId: req.params.airspaceId });
    res.status(500).json({
      error: 'Failed to retrieve airspace details',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
