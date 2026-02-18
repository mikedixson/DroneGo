import type { LatLng } from '../types/api.js';

export class GeolocationError extends Error {
  constructor(message: string, public code: number) {
    super(message);
    this.name = 'GeolocationError';
  }
}

/**
 * Geolocation service for GPS access
 */
export class GeolocationService {
  /**
   * Get current position
   */
  async getCurrentPosition(options?: PositionOptions): Promise<LatLng> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(
          new GeolocationError('Geolocation is not supported by this browser', 0)
        );
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          const messages: Record<number, string> = {
            1: 'Permission denied. Please enable location access.',
            2: 'Position unavailable. Check your device location services.',
            3: 'Request timeout. Please try again.',
          };

          reject(
            new GeolocationError(
              messages[error.code] || 'Unknown geolocation error',
              error.code
            )
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
          ...options,
        }
      );
    });
  }

  /**
   * Watch position with callback
   */
  watchPosition(
    onSuccess: (position: LatLng) => void,
    onError?: (error: GeolocationError) => void,
    options?: PositionOptions
  ): number {
    if (!navigator.geolocation) {
      if (onError) {
        onError(
          new GeolocationError('Geolocation is not supported by this browser', 0)
        );
      }
      return -1;
    }

    return navigator.geolocation.watchPosition(
      (position) => {
        onSuccess({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        if (onError) {
          onError(new GeolocationError(error.message, error.code));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
        ...options,
      }
    );
  }

  /**
   * Stop watching position
   */
  clearWatch(watchId: number): void {
    if (navigator.geolocation && watchId !== -1) {
      navigator.geolocation.clearWatch(watchId);
    }
  }

  /**
   * Check if geolocation is available
   */
  isSupported(): boolean {
    return 'geolocation' in navigator;
  }

  /**
   * Request permission (for browsers that support it)
   */
  async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) {
      return false;
    }

    try {
      // Try to get position to trigger permission prompt
      await this.getCurrentPosition({ timeout: 1000 });
      return true;
    } catch (error) {
      if (error instanceof GeolocationError && error.code === 1) {
        return false; // Permission denied
      }
      return true; // Other errors (like timeout) don't mean permission is denied
    }
  }
}

export const geolocationService = new GeolocationService();
