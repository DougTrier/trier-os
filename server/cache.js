// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - LRU TTL-Based In-Memory Cache
 * ====================================================
 * Map-based cache with configurable TTL and maximum size limit.
 * When the cache exceeds maxSize, the least recently used (LRU)
 * entries are evicted first.
 *
 * Used by the global search engine (index.js) to cache search results
 * for 5 minutes, avoiding redundant cross-plant database queries.
 */
class Cache {
    constructor(ttlMinutes = 5, maxSize = 500) {
        this.cache = new Map();
        this.ttl = ttlMinutes * 60 * 1000;
        this.maxSize = maxSize;
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;

        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }

        // LRU: Move accessed entry to end of Map (most recently used)
        this.cache.delete(key);
        this.cache.set(key, item);

        return item.value;
    }

    set(key, value) {
        // If key already exists, delete it first so it moves to the end
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        // Evict expired and then oldest entries if at capacity
        if (this.cache.size >= this.maxSize) {
            this._evict();
        }

        this.cache.set(key, {
            value,
            expiry: Date.now() + this.ttl
        });
    }

    /**
     * Evict entries to make room:
     * 1. First pass: remove all expired entries
     * 2. If still at capacity, remove the oldest (first in Map iteration order)
     */
    _evict() {
        const now = Date.now();

        // Pass 1: Remove expired entries
        for (const [key, item] of this.cache) {
            if (now > item.expiry) {
                this.cache.delete(key);
            }
        }

        // Pass 2: If still at capacity, evict oldest (LRU = first entries in Map)
        while (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
    }

    clear() {
        this.cache.clear();
    }

    /** Return current cache size (useful for monitoring) */
    get size() {
        return this.cache.size;
    }
}

module.exports = Cache;
