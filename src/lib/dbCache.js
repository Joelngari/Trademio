import { adminDb } from './firebaseAdmin.js';

const cache = new Map();
const CACHE_TTL = 30 * 1000; // 30 seconds
const stats = {
  hits: 0,
  misses: 0,
  sets: 0,
  invalidations: 0
};

function getCacheKey(namespace, key) {
  return `${namespace}:${key}`;
}

export async function getCollection(name) {
  const now = Date.now();
  const cached = cache.get(name);

  if (cached && (now - cached.timestamp < CACHE_TTL)) {
    stats.hits += 1;
    return cached.data;
  }

  stats.misses += 1;

  const snapshot = await adminDb.collection(name).get();
  const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  cache.set(name, {
    timestamp: now,
    data: data
  });
  stats.sets += 1;

  return data;
}

export async function getCollections(...names) {
  return Promise.all(names.map(name => getCollection(name)));
}

export async function getCachedData(namespace, key, fetcher, ttl = CACHE_TTL) {
  const cacheKey = getCacheKey(namespace, key);
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached && (now - cached.timestamp < ttl)) {
    stats.hits += 1;
    return cached.data;
  }

  stats.misses += 1;
  const data = await fetcher();
  cache.set(cacheKey, { timestamp: now, data });
  stats.sets += 1;
  return data;
}

export function invalidateCache(...names) {
  stats.invalidations += 1;
  stats.invalidations += 1;
  if (names.length === 0) {
    cache.clear();
  } else {
    names.forEach((name) => {
      cache.delete(name);
      const namespacePrefix = `${name}:`;
      for (const cacheKey of cache.keys()) {
        if (cacheKey.startsWith(namespacePrefix)) {
          cache.delete(cacheKey);
        }
      }
    });
  }
}

export function getCacheStats() {
  return {
    entries: cache.size,
    ...stats
  };
}
