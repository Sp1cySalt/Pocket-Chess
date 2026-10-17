// puzzle-cache.js
// Loads public/puzzles.json (built by `npm run build:puzzles`) and caches it
// in IndexedDB so repeat visits (and offline starts) are instant.
const DB_URL   = './puzzles.json';
const CACHE_KEY = 'puzzles-v1';

export async function loadPuzzles(onProgress = () => {}) {
  const cached = await getCached();
  if (cached && cached.length) return cached;

  onProgress({ phase: 'download' });
  const res = await fetch(DB_URL);
  if (!res.ok) throw new Error(`could not load puzzles.json (HTTP ${res.status})`);
  const puzzles = await res.json();

  onProgress({ phase: 'cache', count: puzzles.length });
  await setCached(puzzles);
  return puzzles;
}

// ---------------------------------------------------------------------------

let dbPromise = null;
function db() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('pocket-chess', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('puzzles')) {
        req.result.createObjectStore('puzzles');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return dbPromise;
}

async function getCached() {
  try {
    const d = await db();
    return await new Promise((resolve) => {
      const tx = d.transaction('puzzles', 'readonly');
      const r  = tx.objectStore('puzzles').get(CACHE_KEY);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror   = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setCached(puzzles) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('puzzles', 'readwrite');
    tx.objectStore('puzzles').put(puzzles, CACHE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}