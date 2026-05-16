import { adminDb } from './firebaseAdmin.js';

const cache = new Map();
const CACHE_TTL = 30 * 1000; // 30 seconds

export async function getCollection(name) {
  const now = Date.now();
  const cached = cache.get(name);

  if (cached && (now - cached.timestamp < CACHE_TTL)) {
    return cached.data;
  }

  const snapshot = await adminDb.collection(name).get();
  const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  cache.set(name, {
    timestamp: now,
    data: data
  });

  return data;
}

export async function getCollections(...names) {
  return Promise.all(names.map(name => getCollection(name)));
}

export function invalidateCache(...names) {
  if (names.length === 0) {
    cache.clear();
  } else {
    names.forEach(name => cache.delete(name));
  }
}
