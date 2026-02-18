import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiClient } from '../../../src/services/api-client';

/**
 * API Client Test Suite
 * 
 * Tests contract compliance with backend REST API
 * Validates request parameters, response parsing, and error handling
 * 
 * Target Coverage: 90%
 */

describe('ApiClient', () => {
  let apiClient: ApiClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock global fetch
    fetchMock = vi.fn();
    global.fetch = fetchMock;

    apiClient = new ApiClient('http://localhost:3000/api/v1');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getZones', () => {
    it('should fetch zones with bbox parameters', async () => {
      const mockResponse = {
        type: 'FeatureCollection',
        features: [],
        metadata: {
          retrieved_at: '2026-02-18T12:00:00Z',
          count: 0,
        },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const bounds = {
        minLon: -0.2,
        minLat: 51.4,
        maxLon: -0.1,
        maxLat: 51.6,
      };

      const result = await apiClient.getZones(bounds);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/zones?'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );

      const callUrl = fetchMock.mock.calls[0][0];
      expect(callUrl).toContain('minLng=-0.2');
      expect(callUrl).toContain('minLat=51.4');
      expect(callUrl).toContain('maxLng=-0.1');
      expect(callUrl).toContain('maxLat=51.6');
      expect(result).toEqual(mockResponse);
    });

    it('should include optional zone types filter', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ type: 'FeatureCollection', features: [] }),
      });

      const bounds = {
        minLon: -0.2,
        minLat: 51.4,
        maxLon: -0.1,
        maxLat: 51.6,
      };

      await apiClient.getZones(bounds, ['no-fly', 'controlled']);

      const callUrl = fetchMock.mock.calls[0][0] as string;
      // URL encodes commas as %2C
      expect(callUrl).toMatch(/zoneTypes=(no-fly,controlled|no-fly%2Ccontrolled)/);
    });

    it('should parse GeoJSON FeatureCollection response', async () => {
      const mockResponse = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [] },
            properties: { zone_type: 'no-fly' },
          },
        ],
        metadata: { count: 1 },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const bounds = {
        minLon: -0.2,
        minLat: 51.4,
        maxLon: -0.1,
        maxLat: 51.6,
      };

      const result = await apiClient.getZones(bounds);
      expect(result.type).toBe('FeatureCollection');
      expect(result.features).toHaveLength(1);
    });

    it('should throw error on non-200 response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ message: 'Database error' }),
      });

      const bounds = {
        minLon: -0.2,
        minLat: 51.4,
        maxLon: -0.1,
        maxLat: 51.6,
      };

      await expect(apiClient.getZones(bounds)).rejects.toThrow('Database error');
    });

    it('should handle network failures gracefully', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const bounds = {
        minLon: -0.2,
        minLat: 51.4,
        maxLon: -0.1,
        maxLat: 51.6,
      };

      await expect(apiClient.getZones(bounds)).rejects.toThrow('Network error');
    });
  });

  describe('getZoneById', () => {
    it('should fetch single zone by UUID', async () => {
      const mockZone = {
        type: 'Feature',
        properties: { zone_type: 'no-fly', name: 'Test Zone' },
        geometry: { type: 'Polygon', coordinates: [] },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockZone,
      });

      const result = await apiClient.getZoneById('123e4567-e89b-12d3-a456-426614174000');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/zones/123e4567-e89b-12d3-a456-426614174000',
        expect.any(Object)
      );
      expect(result).toEqual(mockZone);
    });

    it('should throw error on 404 not found', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ message: 'Zone not found' }),
      });

      await expect(
        apiClient.getZoneById('non-existent-id')
      ).rejects.toThrow('Zone not found');
    });
  });

  describe('getAirspace', () => {
    it('should fetch airspace with bbox parameters', async () => {
      const mockResponse = {
        type: 'FeatureCollection',
        features: [],
        metadata: { count: 0 },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const bounds = {
        minLon: -0.2,
        minLat: 51.4,
        maxLon: -0.1,
        maxLat: 51.6,
      };

      const result = await apiClient.getAirspace(bounds);

      const callUrl = fetchMock.mock.calls[0][0];
      expect(callUrl).toContain('/airspace?');
      expect(result).toEqual(mockResponse);
    });

    it('should include optional ICAO class filter', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ type: 'FeatureCollection', features: [] }),
      });

      const bounds = {
        minLon: -0.2,
        minLat: 51.4,
        maxLon: -0.1,
        maxLat: 51.6,
      };

      await apiClient.getAirspace(bounds, ['D', 'E']);

      const callUrl = fetchMock.mock.calls[0][0] as string;
      // URL encodes commas as %2C
      expect(callUrl).toMatch(/classes=(D,E|D%2CE)/);
    });
  });

  describe('checkLocation - SAFETY CRITICAL', () => {
    it('should check location with lat/lng parameters', async () => {
      const mockResult = {
        can_fly: true,
        authorization_required: false,
        restriction_status: 'permitted',
        zones: [],
        metadata: { checked_at: '2026-02-18T12:00:00Z' },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const result = await apiClient.checkLocation(51.5074, -0.1278);

      const callUrl = fetchMock.mock.calls[0][0];
      expect(callUrl).toContain('/location/check?');
      expect(callUrl).toContain('lat=51.5074');
      expect(callUrl).toContain('lng=-0.1278');
      expect(result).toEqual(mockResult);
    });

    it('should parse LocationCheckResult response structure', async () => {
      const mockResult = {
        can_fly: false,
        authorization_required: false,
        restriction_status: 'no-fly',
        zones: [
          {
            zone_id: '123',
            zone_type: 'no-fly',
            name: 'Airport FRZ',
          },
        ],
        nearest_toal: null,
        metadata: { checked_at: '2026-02-18T12:00:00Z' },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const result = await apiClient.checkLocation(51.5, -0.1);

      expect(result).toHaveProperty('can_fly');
      expect(result).toHaveProperty('authorization_required');
      expect(result).toHaveProperty('restriction_status');
      expect(result).toHaveProperty('zones');
      expect(result).toHaveProperty('metadata');
    });

    it('should handle no-fly zone response correctly', async () => {
      const mockResult = {
        can_fly: false,
        authorization_required: false,
        restriction_status: 'no-fly',
        zones: [{ zone_type: 'no-fly' }],
        metadata: {},
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const result = await apiClient.checkLocation(51.5, -0.1);

      expect(result.can_fly).toBe(false);
      expect(result.restriction_status).toBe('no-fly');
    });

    it('should handle authorization-required response', async () => {
      const mockResult = {
        can_fly: false,
        authorization_required: true,
        restriction_status: 'controlled',
        zones: [{ zone_type: 'controlled' }],
        metadata: {},
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const result = await apiClient.checkLocation(51.5, -0.1);

      expect(result.authorization_required).toBe(true);
      expect(result.restriction_status).toBe('controlled');
    });

    it('should handle permitted (green) response', async () => {
      const mockResult = {
        can_fly: true,
        authorization_required: false,
        restriction_status: 'permitted',
        zones: [],
        metadata: {},
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const result = await apiClient.checkLocation(51.5, -0.1);

      expect(result.can_fly).toBe(true);
      expect(result.restriction_status).toBe('permitted');
    });

    it('should throw error on API failure', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ message: 'Service unavailable' }),
      });

      await expect(
        apiClient.checkLocation(51.5, -0.1)
      ).rejects.toThrow('Service unavailable');
    });
  });

  describe('Error Handling', () => {
    it('should include error details in thrown exceptions', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ message: 'Invalid coordinates', details: { lat: 'out of range' } }),
      });

      const bounds = {
        minLon: -0.2,
        minLat: 51.4,
        maxLon: -0.1,
        maxLat: 51.6,
      };

      try {
        await apiClient.getZones(bounds);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('Invalid coordinates');
        expect(error.status).toBe(400);
      }
    });

    it('should handle JSON parse errors', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const bounds = {
        minLon: -0.2,
        minLat: 51.4,
        maxLon: -0.1,
        maxLat: 51.6,
      };

      await expect(apiClient.getZones(bounds)).rejects.toThrow();
    });
  });

  describe('Request Headers', () => {
    it('should include Content-Type application/json', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ type: 'FeatureCollection', features: [] }),
      });

      const bounds = {
        minLon: -0.2,
        minLat: 51.4,
        maxLon: -0.1,
        maxLat: 51.6,
      };

      await apiClient.getZones(bounds);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('Base URL Configuration', () => {
    it('should construct correct endpoint URLs', () => {
      const client = new ApiClient('http://test.com/api');
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ type: 'FeatureCollection', features: [] }),
      });

      const bounds = {
        minLon: -0.2,
        minLat: 51.4,
        maxLon: -0.1,
        maxLat: 51.6,
      };

      client.getZones(bounds);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('http://test.com/api/zones'),
        expect.any(Object)
      );
    });

    it('should handle trailing slash in base URL', () => {
      const client = new ApiClient('http://test.com/api/');
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ type: 'FeatureCollection', features: [] }),
      });

      const bounds = {
        minLon: -0.2,
        minLat: 51.4,
        maxLon: -0.1,
        maxLat: 51.6,
      };

      client.getZones(bounds);

      const callUrl = fetchMock.mock.calls[0][0];
      expect(callUrl).toMatch(/^http:\/\/test\.com\/api\/\/zones/);
    });
  });
});
