/**
 * IndexedDB wrapper — replaces localStorage for novel data persistence.
 * Provides key-value storage with async API and 50MB+ capacity.
 */

const DB_NAME = "novel-writer-db";
const DB_VERSION = 1;
const STORE_NAME = "keyvalue";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function getItem(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function setItem(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function removeItem(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Migrate data from localStorage to IndexedDB (one-time migration).
 * Returns the migrated data or null if nothing to migrate.
 */
export async function migrateFromLocalStorage(storageKey) {
  try {
    const local = localStorage.getItem(storageKey);
    if (!local) return null;
    const parsed = JSON.parse(local);
    if (Array.isArray(parsed) && parsed.length > 0) {
      await setItem(storageKey, parsed);
      localStorage.removeItem(storageKey);
      return parsed;
    }
  } catch (e) {
    // silent fail
  }
  return null;
}
