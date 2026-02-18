// API Response Types

export interface DataFreshness {
  last_caa_sync?: string;
  last_nats_sync?: string;
  last_notam_sync?: string;
}

export interface ApiMetadata {
  query_time_ms: number;
  result_count: number;
  data_freshness?: DataFreshness;
}

// GeoJSON Types

export interface GeoJSONGeometry {
  type: 'Point' | 'Polygon' | 'MultiPolygon';
  coordinates: number[] | number[][] | number[][][];
}

export interface RestrictionZoneProperties {
  zone_type:
    | 'no-fly'
    | 'controlled-airspace'
    | 'military-zone'
    | 'temporary-restriction'
    | 'airport-frz'
    | 'danger-area';
  restriction_name: string;
  authority_source: string;
  altitude_floor: number | null;
  altitude_ceiling: number | null;
  effective_start: string | null;
  effective_end: string | null;
  description: string;
  authorization_possible: boolean;
  authorization_contact: string | null;
  confidence_level: 'primary-authority' | 'secondary-source' | 'unverified';
  last_updated: string;
  is_temporary?: boolean;
}

export interface RestrictionZoneFeature {
  type: 'Feature';
  id: string;
  geometry: GeoJSONGeometry;
  properties: RestrictionZoneProperties;
}

export interface RestrictionZoneCollection {
  type: 'FeatureCollection';
  metadata: ApiMetadata;
  features: RestrictionZoneFeature[];
}

export interface TOALSiteProperties {
  site_name: string;
  access_type: 'public' | 'private' | 'permit-required' | 'club-only';
  surface_type: 'grass' | 'concrete' | 'asphalt' | 'gravel' | 'mixed' | 'unknown' | null;
  facilities: Record<string, boolean>;
  operating_hours: string | null;
  restrictions: string | null;
  verified: boolean;
  data_source: string;
  last_updated: string;
}

export interface TOALSiteFeature {
  type: 'Feature';
  id: string;
  geometry: GeoJSONGeometry;
  properties: TOALSiteProperties;
}

export interface TOALSiteCollection {
  type: 'FeatureCollection';
  metadata: ApiMetadata;
  features: TOALSiteFeature[];
}

export interface LocationCheckResult {
  restriction_status: 'permitted' | 'controlled' | 'no-fly' | 'unknown';
  can_fly: boolean;
  authorization_required: boolean;
  zones: Array<{
    zone_id: string;
    zone_type: string;
    restriction_name: string;
    geometry: any;
    authority_source: string;
    altitude_floor: number;
    altitude_ceiling: number;
    effective_start: string;
    effective_end: string | null;
    description: string | null;
    authorization_possible: boolean;
    confidence_level: string;
    last_updated: string;
  }>;
  nearest_toal: {
    site_id: string;
    site_name: string;
    access_type: string;
    verified: boolean;
    data_source: string;
    distance_meters: number;
  } | null;
  metadata: {
    query_coordinates: {
      longitude: number;
      latitude: number;
    };
    timestamp: string;
  };
}

export interface SearchResult {
  location: {
    latitude: number;
    longitude: number;
  };
  address: string;
  restriction_status: string;
  nearest_toal_distance: number | null;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  environment: string;
  database: {
    status: string;
    timestamp?: string;
    tables?: number;
    error?: string;
  };
}

// Map Types

export interface BoundsCoordinates {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

// Cache Types

export interface CachedData<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export type CacheKey = string;
