import localforage from 'localforage';
import type { CachedData } from '../types/api.js';

// Configure localforage stores
const zonesCache = localforage.createInstance({
  name: 'dronego',
  storeName: 'restriction_zones',
  description: 'Cached restriction zone data',
});

const toalCache = localforage.createInstance({
  name: 'dronego',
  storeName: 'toal_sites',
  description: 'Cached TOAL site data',
});

const locationCache = localforage.createInstance({
  name: 'dronego',
  storeName: 'location_checks',
  description: 'Cached location check results',
});

/**
 * Cache manager for offline data storage
 */
export class CacheManager {
  /**
   * Store data in cache with expiration
   */
  async set<T>(
    store: LocalForage,
    key: string,
    data: T,
    ttlSeconds: number = 86400 // 24 hours default
  ): Promise<void> {
    const cached: CachedData<T> = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttlSeconds * 1000,
    };

    await store.setItem(key, cached);
  }

  /**
   * Get data from cache if not expired
   */
  async get<T>(store: LocalForage, key: string): Promise<T | null> {
    const cached = (await store.getItem(key)) as CachedData<T> | null;

    if (!cached) {
      return null;
    }

    // Check expiration
    if (Date.now() > cached.expiresAt) {
      await store.removeItem(key);
      return null;
    }

    return cached.data;
  }

  /**
   * Check if data exists and is not expired
   */
  async has(store: LocalForage, key: string): Promise<boolean> {
    const data = await this.get(store, key);
    return data !== null;
  }

  /**
   * Get data age in milliseconds
   */
  async getAge(store: LocalForage, key: string): Promise<number | null> {
    const cached = (await store.getItem(key)) as CachedData<any> | null;

    if (!cached) {
      return null;
    }

    return Date.now() - cached.timestamp;
  }

  /**
   * Check if data is stale (older than threshold)
   */
  async isStale(
    store: LocalForage,
    key: string,
    thresholdSeconds: number = 172800 // 48 hours default
  ): Promise<boolean> {
    const age = await this.getAge(store, key);

    if (age === null) {
      return true;
    }

    return age > thresholdSeconds * 1000;
  }

  /**
   * Remove expired entries from cache
   */
  async cleanup(store: LocalForage): Promise<number> {
    let removedCount = 0;

    await store.iterate((value: any, key: string) => {
      if (Date.now() > value.expiresAt) {
        store.removeItem(key);
        removedCount++;
      }
    });

    return removedCount;
  }

  /**
   * Clear all data from a cache store
   */
  async clear(store: LocalForage): Promise<void> {
    await store.clear();
  }

  /**
   * Get cache size (approximate)
   */
  async getSize(store: LocalForage): Promise<number> {
    const keys = await store.keys();
    return keys.length;
  }
}

export const cacheManager = new CacheManager();
export { zonesCache, toalCache, locationCache };
