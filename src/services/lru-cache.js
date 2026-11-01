/**
 * Memory-bounded Least-Recently-Used (LRU) cache with per-record TTL expiration.
 *
 * @template T
 * @typedef {{ get(key: string): T | undefined, set(key: string, value: T): void, readonly size: number }} Cache
 */

/**
 * Instantiates an in-memory LRU cache.
 *
 * @template T
 * @param {{ maxEntries?: number, ttlMs?: number, now?: () => number }} [options]
 * @returns {Cache<T>}
 */
export function createCache({ maxEntries = 100, ttlMs = 60 * 60_000, now = Date.now } = {}) {
  /** @type {Map<string, { value: T, expires: number }>} */
  const cacheStorage = new Map();

  return {
    /**
     * Retrieves an item from cache, freshening its position if valid.
     * @param {string} key
     * @returns {T | undefined}
     */
    get(key) {
      const record = cacheStorage.get(key);
      if (!record) return undefined;

      cacheStorage.delete(key);
      if (record.expires <= now()) return undefined;

      // Re-insert to mark as most recently accessed
      cacheStorage.set(key, record);
      return record.value;
    },

    /**
     * Stores an item, evicting the oldest entry when capacity is exceeded.
     * @param {string} key
     * @param {T} value
     */
    set(key, value) {
      cacheStorage.delete(key);
      cacheStorage.set(key, { value, expires: now() + ttlMs });

      if (cacheStorage.size > maxEntries) {
        const [oldestKey] = cacheStorage.keys();
        cacheStorage.delete(oldestKey);
      }
    },

    get size() {
      return cacheStorage.size;
    },
  };
}
