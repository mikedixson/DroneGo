import {
  PropertyRestriction,
  type PropertyRestrictionAttributes,
  type BoundingBox,
} from '../models/PropertyRestriction.js';

/**
 * Property Service (User Story 1)
 * 
 * Service layer for property restriction queries.
 * Handles spatial queries for heritage sites and other properties with drone flight policies.
 * 
 * SAFETY-CRITICAL: Property restrictions must be accurately detected to:
 * - Prevent unauthorized flights over heritage sites
 * - Provide correct policy information to pilots
 * - Comply with property owner requirements
 * 
 * Per Constitution §I:
 * - All spatial queries use PostGIS ST_Intersects with GIST indexes
 * - Query performance <100ms for single property checks
 * - Multiple overlapping properties must all be returned
 */
export class PropertyService {
  /**
   * Check for property restrictions at specific coordinates
   * 
   * Uses PostGIS spatial query with GIST index for fast point-in-polygon detection.
   * Returns ALL overlapping properties (e.g., World Heritage Site + National Trust property).
   * 
   * @param lng - Longitude (WGS84)
   * @param lat - Latitude (WGS84)
   * @returns Array of property restrictions containing the point (empty if none)
   */
  async checkPropertyRestrictions(
    lng: number,
    lat: number
  ): Promise<PropertyRestrictionAttributes[]> {
    return await PropertyRestriction.findByCoordinates(lng, lat);
  }

  /**
   * Get property restrictions within bounding box
   * 
   * Used for map viewport queries to display all properties visible on screen.
   * Supports partial overlaps (property extends beyond bbox).
   * 
   * @param bbox - Bounding box { west, south, east, north } in WGS84
   * @param category - Optional filter by restriction category (HERITAGE_SITE, SSSI, etc.)
   * @returns Array of property restrictions intersecting bbox (GeoJSON geometry included)
   */
  async getPropertyRestrictionsByBbox(bbox: BoundingBox, category?: string): Promise<PropertyRestrictionAttributes[]> {
    return await PropertyRestriction.findInBbox(bbox, category);
  }

  /**
   * Get single property restriction by ID
   * 
   * @param propertyId - UUID of property restriction
   * @returns Property restriction or null if not found
   */
  async queryPropertyById(propertyId: string): Promise<PropertyRestrictionAttributes | null> {
    return await PropertyRestriction.findById(propertyId);
  }

  /**
   * Get property restrictions by managing organization
   * 
   * @param organization - Organization name (e.g., "Historic England", "National Trust")
   * @returns Array of properties managed by organization
   */
  async getPropertiesByOrganization(organization: string): Promise<PropertyRestrictionAttributes[]> {
    return await PropertyRestriction.findByOrganization(organization);
  }

  /**
   * Truncate policy text to specified length with ellipsis
   * 
   * Used for generating policy summaries in API responses.
   * Per User Story 1: policy_summary limited to 200 chars + "..."
   * 
   * @param text - Full policy text
   * @param maxLength - Maximum length (default 200)
   * @returns Truncated text with "..." if needed
   */
  truncatePolicyText(text: string | null, maxLength: number = 200): string {
    if (!text) {
      return '';
    }

    if (text.length <= maxLength) {
      return text;
    }

    return text.substring(0, maxLength) + '...';
  }

  /**
   * Format property restriction for API response (User Story 1 tri-state)
   * 
   * Converts PropertyRestrictionAttributes to PropertyAdvisory format:
   * - property_name: Full name
   * - organization: Managing organization
   * - policy_summary: Truncated to 200 chars
   * - contact: Contact info
   * 
   * @param property - Property restriction record
   * @returns Formatted property advisory object
   */
  formatPropertyAdvisory(property: PropertyRestrictionAttributes): {
    property_name: string;
    organization: string;
    policy_summary: string;
    contact: string;
  } {
    return {
      property_name: property.property_name,
      organization: property.managing_organization,
      policy_summary: this.truncatePolicyText(property.policy_text, 200),
      contact: property.contact_info || 'No contact information available',
    };
  }

  /**
   * Format multiple properties for API response
   * 
   * @param properties - Array of property restrictions
   * @returns Array of formatted property advisories
   */
  formatPropertyAdvisories(properties: PropertyRestrictionAttributes[]): Array<{
    property_name: string;
    organization: string;
    policy_summary: string;
    contact: string;
  }> {
    return properties.map((property) => this.formatPropertyAdvisory(property));
  }
}
