import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GeolocationService, GeolocationError } from '../../../src/services/geolocation';

/**
 * Geolocation Service Test Suite
 * 
 * Tests GPS access and coordinate retrieval
 * Validates error handling for permission denials
 * 
 * Target Coverage: 90%
 */

describe('GeolocationService', () => {
  let geolocationService: GeolocationService;
  let mockGeolocation: {
    getCurrentPosition: ReturnType<typeof vi.fn>;
    watchPosition: ReturnType<typeof vi.fn>;
    clearWatch: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Mock navigator.geolocation
    mockGeolocation = {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    };

    // @ts-ignore - Mocking browser API
    global.navigator.geolocation = mockGeolocation;

    geolocationService = new GeolocationService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCurrentPosition', () => {
    it('should return user coordinates on success', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation(
        (successCallback: PositionCallback) => {
          successCallback({
            coords: {
              latitude: 51.5074,
              longitude: -0.1278,
              accuracy: 10,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          });
        }
      );

      const result = await geolocationService.getCurrentPosition();

      expect(result).toEqual({
        lat: 51.5074,
        lng: -0.1278,
      });
    });

    it('should request high accuracy positioning', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation(
        (successCallback: PositionCallback) => {
          successCallback({
            coords: {
              latitude: 51.5,
              longitude: -0.1,
              accuracy: 5,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          });
        }
      );

      await geolocationService.getCurrentPosition();

      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        expect.objectContaining({
          enableHighAccuracy: true,
        })
      );
    });

    it('should set reasonable timeout (10 seconds)', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation(
        (successCallback: PositionCallback) => {
          successCallback({
            coords: {
              latitude: 51.5,
              longitude: -0.1,
              accuracy: 10,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          });
        }
      );

      await geolocationService.getCurrentPosition();

      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        expect.objectContaining({
          timeout: 10000,
        })
      );
    });

    it('should throw error on permission denied', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation(
        (successCallback: PositionCallback, errorCallback: PositionErrorCallback) => {
          errorCallback({
            code: 1, // PERMISSION_DENIED
            message: 'User denied geolocation',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          });
        }
      );

      await expect(geolocationService.getCurrentPosition()).rejects.toThrow(
        GeolocationError
      );

      try {
        await geolocationService.getCurrentPosition();
      } catch (error) {
        expect(error).toBeInstanceOf(GeolocationError);
        expect((error as GeolocationError).code).toBe(1);
        expect((error as GeolocationError).message).toContain('Permission denied');
      }
    });

    it('should throw error on position unavailable', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation(
        (successCallback: PositionCallback, errorCallback: PositionErrorCallback) => {
          errorCallback({
            code: 2, // POSITION_UNAVAILABLE
            message: 'Position unavailable',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          });
        }
      );

      try {
        await geolocationService.getCurrentPosition();
      } catch (error) {
        expect(error).toBeInstanceOf(GeolocationError);
        expect((error as GeolocationError).code).toBe(2);
        expect((error as GeolocationError).message).toContain('Position unavailable');
      }
    });

    it('should throw error on timeout', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation(
        (successCallback: PositionCallback, errorCallback: PositionErrorCallback) => {
          errorCallback({
            code: 3, // TIMEOUT
            message: 'Timeout',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          });
        }
      );

      try {
        await geolocationService.getCurrentPosition();
      } catch (error) {
        expect(error).toBeInstanceOf(GeolocationError);
        expect((error as GeolocationError).code).toBe(3);
        expect((error as GeolocationError).message).toContain('timeout');
      }
    });

    it('should allow custom options', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation(
        (successCallback: PositionCallback) => {
          successCallback({
            coords: {
              latitude: 51.5,
              longitude: -0.1,
              accuracy: 10,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          });
        }
      );

      await geolocationService.getCurrentPosition({
        timeout: 5000,
        maximumAge: 60000,
      });

      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        expect.objectContaining({
          timeout: 5000,
          maximumAge: 60000,
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should provide user-friendly error messages', async () => {
      const testCases = [
        { code: 1, expectedText: 'Permission denied' },
        { code: 2, expectedText: 'Position unavailable' },
        { code: 3, expectedText: 'timeout' },
      ];

      for (const { code, expectedText } of testCases) {
        mockGeolocation.getCurrentPosition.mockImplementation(
          (successCallback: PositionCallback, errorCallback: PositionErrorCallback) => {
            errorCallback({
              code,
              message: 'Error',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            });
          }
        );

        try {
          await geolocationService.getCurrentPosition();
        } catch (error) {
          expect((error as GeolocationError).message.toLowerCase()).toContain(
            expectedText.toLowerCase()
          );
        }
      }
    });

    it('should handle geolocation not supported', async () => {
      // @ts-ignore - Testing undefined case
      global.navigator.geolocation = undefined;

      try {
        await geolocationService.getCurrentPosition();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(GeolocationError);
        expect((error as GeolocationError).message).toContain('not supported');
        expect((error as GeolocationError).code).toBe(0);
      }
    });
  });

  describe('watchPosition', () => {
    it('should call success callback with position updates', () => {
      const onSuccess = vi.fn();
      const watchId = 123;

      mockGeolocation.watchPosition.mockReturnValue(watchId);

      const result = geolocationService.watchPosition(onSuccess);

      expect(result).toBe(watchId);
      expect(mockGeolocation.watchPosition).toHaveBeenCalled();

      // Simulate position update
      const successCallback = mockGeolocation.watchPosition.mock.calls[0][0];
      successCallback({
        coords: {
          latitude: 51.5,
          longitude: -0.1,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      });

      expect(onSuccess).toHaveBeenCalledWith({
        lat: 51.5,
        lng: -0.1,
      });
    });

    it('should call error callback on failure', () => {
      const onSuccess = vi.fn();
      const onError = vi.fn();

      mockGeolocation.watchPosition.mockReturnValue(123);

      geolocationService.watchPosition(onSuccess, onError);

      // Simulate error
      const errorCallback = mockGeolocation.watchPosition.mock.calls[0][1];
      errorCallback({
        code: 1,
        message: 'Permission denied',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });

      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0]).toBeInstanceOf(GeolocationError);
    });

    it('should return -1 if geolocation not supported', () => {
      // @ts-ignore - Testing undefined case
      global.navigator.geolocation = undefined;

      const onSuccess = vi.fn();
      const onError = vi.fn();

      const result = geolocationService.watchPosition(onSuccess, onError);

      expect(result).toBe(-1);
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('Coordinate Validation', () => {
    it('should handle valid latitude bounds (-90 to 90)', async () => {
      const validLatitudes = [-90, -45, 0, 45, 90];

      for (const lat of validLatitudes) {
        mockGeolocation.getCurrentPosition.mockImplementation(
          (successCallback: PositionCallback) => {
            successCallback({
              coords: {
                latitude: lat,
                longitude: 0,
                accuracy: 10,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null,
              },
              timestamp: Date.now(),
            });
          }
        );

        const result = await geolocationService.getCurrentPosition();
        expect(result.lat).toBe(lat);
      }
    });

    it('should handle valid longitude bounds (-180 to 180)', async () => {
      const validLongitudes = [-180, -90, 0, 90, 180];

      for (const lng of validLongitudes) {
        mockGeolocation.getCurrentPosition.mockImplementation(
          (successCallback: PositionCallback) => {
            successCallback({
              coords: {
                latitude: 0,
                longitude: lng,
                accuracy: 10,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null,
              },
              timestamp: Date.now(),
            });
          }
        );

        const result = await geolocationService.getCurrentPosition();
        expect(result.lng).toBe(lng);
      }
    });
  });
});
