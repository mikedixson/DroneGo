import { apiClient } from './api-client.js';
import type { PropertyRestrictionCollection, BoundsCoordinates } from '../types/api.js';

/**
 * Property Restrictions API Service
 * 
 * Domain-specific service for property restriction operations.
 * Provides a focused interface for property advisory features (User Story 1).
 */
export class PropertyApiService {
  /**
   * Fetch property restrictions (heritage sites, protected areas) within a bounding box
   * 
   * @param bbox - Geographic bounding box { minLon, minLat, maxLon, maxLat }
   * @param category - Optional filter by category (e.g., 'HERITAGE_SITE', 'SSSI_PROTECTED_AREAS')
   * @returns GeoJSON FeatureCollection with property restriction polygons
   * 
   * @example
   * const bbox = { minLon: -1.0, minLat: 51.0, maxLon: -0.5, maxLat: 51.5 };
   * const properties = await propertyApi.fetchPropertyRestrictionsByBbox(bbox);
   * 
   * properties.features.forEach(feature => {
   *   console.log(feature.properties.property_name); // "Stonehenge"
   *   console.log(feature.properties.organization); // "English Heritage Trust"
   * });
   */
  async fetchPropertyRestrictionsByBbox(
    bbox: BoundsCoordinates,
    category?: string,
    zoom?: number
  ): Promise<PropertyRestrictionCollection> {
    return apiClient.getPropertyRestrictions(bbox, category, zoom);
  }

  /**
   * Fetch property restrictions by viewport
   * Convenience method for map components
   * 
   * @param west - Western longitude boundary
   * @param south - Southern latitude boundary
   * @param east - Eastern longitude boundary
   * @param north - Northern latitude boundary
   * @param category - Optional category filter
   * @returns GeoJSON FeatureCollection
   */
  async fetchByViewport(
    west: number,
    south: number,
    east: number,
    north: number,
    category?: string
  ): Promise<PropertyRestrictionCollection> {
    const bbox: BoundsCoordinates = {
      minLon: west,
      minLat: south,
      maxLon: east,
      maxLat: north,
    };
    
    return this.fetchPropertyRestrictionsByBbox(bbox, category);
  }
}

// Export singleton instance for convenient usage
export const propertyApi = new PropertyApiService();
