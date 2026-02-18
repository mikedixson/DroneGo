import type {
  RestrictionZoneCollection,
  TOALSiteCollection,
  LocationCheckResult,
  SearchResult,
  HealthResponse,
  BoundsCoordinates,
} from '../types/api.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * API Client for DroneGo backend
 */
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Generic fetch wrapper with error handling
   */
  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ApiError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          errorData
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      // Network error or other
      throw new ApiError(
        error instanceof Error ? error.message : 'Network request failed',
        0
      );
    }
  }

  /**
   * GET /zones - Query restriction zones by bounding box
   */
  async getZones(bounds: BoundsCoordinates, types?: string[]): Promise<RestrictionZoneCollection> {
    const params = new URLSearchParams({
      minLng: bounds.minLon.toString(),
      minLat: bounds.minLat.toString(),
      maxLng: bounds.maxLon.toString(),
      maxLat: bounds.maxLat.toString(),
    });

    if (types && types.length > 0) {
      params.append('zoneTypes', types.join(','));
    }

    return this.fetch<RestrictionZoneCollection>(`/zones?${params.toString()}`);
  }

  /**
   * GET /zones/:id - Get single zone details
   */
  async getZoneById(zoneId: string): Promise<any> {
    return this.fetch(`/zones/${zoneId}`);
  }

  /**
   * GET /airspace - Query airspace classifications by bounding box
   */
  async getAirspace(bounds: BoundsCoordinates, classes?: string[]): Promise<any> {
    const params = new URLSearchParams({
      minLng: bounds.minLon.toString(),
      minLat: bounds.minLat.toString(),
      maxLng: bounds.maxLon.toString(),
      maxLat: bounds.maxLat.toString(),
    });

    if (classes && classes.length > 0) {
      params.append('classes', classes.join(','));
    }

    return this.fetch(`/airspace?${params.toString()}`);
  }

  /**
   * GET /location/check - Check flight permission at coordinates
   */
  async checkLocation(latitude: number, longitude: number): Promise<LocationCheckResult> {
    const params = new URLSearchParams({
      lat: latitude.toString(),
      lng: longitude.toString(),
    });

    return this.fetch<LocationCheckResult>(`/location/check?${params.toString()}`);
  }

  /**
   * GET /location/search - Search for location by address/postcode
   */
  async searchLocation(query: string, limit: number = 5): Promise<SearchResult> {
    const params = new URLSearchParams({ 
      q: query,
      limit: limit.toString()
    });
    return this.fetch<SearchResult>(`/location/search?${params.toString()}`);
  }

  /**
   * GET /toal - Query TOAL sites by bounding box
   */
  async getTOALSites(
    bounds: BoundsCoordinates, 
    accessTypes?: string[],
    verified?: boolean
  ): Promise<TOALSiteCollection> {
    const params = new URLSearchParams({
      minLng: bounds.minLon.toString(),
      minLat: bounds.minLat.toString(),
      maxLng: bounds.maxLon.toString(),
      maxLat: bounds.maxLat.toString(),
    });

    if (accessTypes && accessTypes.length > 0) {
      params.append('accessTypes', accessTypes.join(','));
    }

    if (verified !== undefined) {
      params.append('verified', verified.toString());
    }

    return this.fetch<TOALSiteCollection>(`/toal?${params.toString()}`);
  }

  /**
   * GET /toal/nearest - Find nearest TOAL site to coordinates
   */
  async getNearestTOAL(
    latitude: number, 
    longitude: number, 
    limit: number = 1,
    accessTypes?: string[]
  ): Promise<any> {
    const params = new URLSearchParams({
      lat: latitude.toString(),
      lng: longitude.toString(),
      limit: limit.toString()
    });

    if (accessTypes && accessTypes.length > 0) {
      params.append('accessTypes', accessTypes.join(','));
    }

    return this.fetch(`/toal/nearest?${params.toString()}`);
  }

  /**
   * GET /health - Health check
   */
  async getHealth(): Promise<HealthResponse> {
    return fetch('/health').then((r) => r.json());
  }
}

export const apiClient = new ApiClient();
export { ApiClient, ApiError };
