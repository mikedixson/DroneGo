import type { BoundsCoordinates, LatLng } from '../types/api.js';
import L from 'leaflet';

/**
 * Default UK map center (approximate center of UK)
 */
export const UK_CENTER: LatLng = {
  lat: 54.5,
  lng: -3.5,
};

/**
 * Default zoom level
 */
export const DEFAULT_ZOOM = 6;

/**
 * Maximum bounds for UK (to prevent excessive panning)
 */
export const UK_BOUNDS: L.LatLngBoundsExpression = [
  [49.5, -8.5], // Southwest
  [61.0, 2.0], // Northeast
];

/**
 * Convert Leaflet bounds to API bounds format
 */
export function leafletBoundsToApi(bounds: L.LatLngBounds): BoundsCoordinates {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  return {
    minLon: sw.lng,
    minLat: sw.lat,
    maxLon: ne.lng,
    maxLat: ne.lat,
  };
}

/**
 * Convert API LatLng to Leaflet LatLng
 */
export function apiLatLngToLeaflet(latLng: LatLng): L.LatLng {
  return L.latLng(latLng.lat, latLng.lng);
}

/**
 * Calculate distance between two points in meters
 */
export function calculateDistance(point1: LatLng, point2: LatLng): number {
  const lat1 = (point1.lat * Math.PI) / 180;
  const lat2 = (point2.lat * Math.PI) / 180;
  const deltaLat = ((point2.lat - point1.lat) * Math.PI) / 180;
  const deltaLng = ((point2.lng - point1.lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const R = 6371000; // Earth radius in meters
  return R * c;
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * Create custom map icons
 */
export function createIcon(
  iconUrl: string,
  iconSize: [number, number] = [32, 32],
  iconAnchor: [number, number] = [16, 32]
): L.Icon {
  return L.icon({
    iconUrl,
    iconSize,
    iconAnchor,
    popupAnchor: [0, -32],
  });
}

/**
 * Get color for restriction zone type
 */
export function getZoneColor(zoneType: string): string {
  const colors: Record<string, string> = {
    'no-fly': '#dc2626', // red-600
    'airport-frz': '#dc2626', // red-600
    'military-zone': '#dc2626', // red-600
    'danger-area': '#dc2626', // red-600
    'controlled-airspace': '#f59e0b', // amber-500
    'temporary-restriction': '#8b5cf6', // violet-500
  };

  return colors[zoneType] || '#6b7280'; // gray-500 default
}

/**
 * Get restriction status color
 */
export function getRestrictionStatusColor(status: string): string {
  const colors: Record<string, string> = {
    permitted: '#10b981', // green-500
    prohibited: '#dc2626', // red-600
    'authorization-required': '#f59e0b', // amber-500
    unknown: '#6b7280', // gray-500
  };

  return colors[status] || '#6b7280';
}

/**
 * Debounce function for map events
 */
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}
