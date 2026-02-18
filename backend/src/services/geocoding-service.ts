import axios from 'axios';
import { logger } from '../lib/logger.js';

/**
 * Geocoding Service
 * 
 * Provides address/postcode to coordinates conversion using Nominatim (OpenStreetMap).
 * Used by GET /location/search API endpoint (US2: FR-011).
 * 
 * Provider: Nominatim (OpenStreetMap) - free, no API key required
 * Alternative: OS Places API for improved UK coverage (requires paid API key)
 */

export interface GeocodingResult {
  display_name: string; // Human-readable address
  lat: number; // Latitude
  lon: number; // Longitude
  type: string; // Place type (postcode, city, street, etc.)
  importance: number; // Result relevance score (0-1)
  boundingbox?: [string, string, string, string]; // [minlat, maxlat, minlon, maxlon]
}

export interface SearchOptions {
  countryCode?: string; // Restrict to country (default: 'gb' for UK)
  limit?: number; // Maximum results (default: 5)
  format?: 'json' | 'geojson'; // Response format (default: 'json')
}

export class GeocodingService {
  private baseUrl: string;
  private userAgent: string;

  constructor() {
    // Nominatim requires User-Agent header per usage policy
    this.baseUrl = 'https://nominatim.openstreetmap.org';
    this.userAgent = 'DroneGo/1.0 (UK Drone Flight Zone Map)';
  }

  /**
   * Search for a location by address or postcode
   * 
   * Examples:
   * - "SW1A 1AA" (postcode)
   * - "London"
   * - "Buckingham Palace, London"
   * - "Hyde Park"
   * 
   * @param query Search query (address or postcode)
   * @param options Search options
   * @returns Array of geocoding results
   */
  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<GeocodingResult[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const {
      countryCode = 'gb', // Default to UK
      limit = 5,
      format = 'json'
    } = options;

    try {
      const response = await axios.get(`${this.baseUrl}/search`, {
        params: {
          q: query.trim(),
          format,
          addressdetails: 1,
          countrycodes: countryCode,
          limit,
          'accept-language': 'en'
        },
        headers: {
          'User-Agent': this.userAgent
        },
        timeout: 5000 // 5 second timeout
      });

      const results: any[] = response.data;

      return results.map((result) => ({
        display_name: result.display_name,
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        type: result.type,
        importance: result.importance || 0,
        boundingbox: result.boundingbox
      }));
    } catch (error) {
      logger.error('Geocoding search error', {
        query,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Return empty array on error (graceful degradation)
      return [];
    }
  }

  /**
   * Reverse geocode: Convert coordinates to address
   * 
   * @param lat Latitude
   * @param lon Longitude
   * @returns Address string or null if not found
   */
  async reverse(lat: number, lon: number): Promise<string | null> {
    try {
      const response = await axios.get(`${this.baseUrl}/reverse`, {
        params: {
          lat,
          lon,
          format: 'json',
          addressdetails: 1
        },
        headers: {
          'User-Agent': this.userAgent
        },
        timeout: 5000
      });

      return response.data.display_name || null;
    } catch (error) {
      logger.error('Reverse geocoding error', {
        lat,
        lon,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return null;
    }
  }

  /**
   * Validate UK postcode format (basic validation)
   * 
   * UK postcodes follow patterns like:
   * - SW1A 1AA (London)
   * - M1 1AE (Manchester)
   * - B33 8TH (Birmingham)
   * 
   * @param postcode Postcode string
   * @returns true if format looks like a UK postcode
   */
  isUKPostcode(postcode: string): boolean {
    // Basic UK postcode regex (not exhaustive but covers most formats)
    const postcodeRegex =
      /^([A-Z]{1,2}\d{1,2}[A-Z]?)\s*(\d[A-Z]{2})$/i;
    return postcodeRegex.test(postcode.trim());
  }

  /**
   * Calculate distance between two coordinates (haversine formula)
   * 
   * @param lat1 First latitude
   * @param lon1 First longitude
   * @param lat2 Second latitude
   * @param lon2 Second longitude
   * @returns Distance in meters
   */
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  /**
   * Format distance for display
   * 
   * @param meters Distance in meters
   * @returns Formatted string (e.g., "1.5 km" or "250 m")
   */
  formatDistance(meters: number): string {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  }
}
