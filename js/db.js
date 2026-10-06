// Thin promise wrapper around IndexedDB. Every piece of user data lives here;
// nothing is ever sent anywhere.

const DB_NAME = 'paris-expenses';
const DB_VERSION = 1;

// keyPath per store, plus secondary indexes.
export const STORES = {
  transactions: { keyPath: 'id', indexes: ['date', 'categoryId', 'fingerprint', 'importBatchId'] },
  categories:   { keyPath: 'id' },
  rules:        { keyPath: 'id' },
  people:       { keyPath: 'id' },
  settings:     { keyPath: 'key' },
  imports:      { keyPath: 'id' },
  meta:         { keyPath: 'key' },
};

let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, { keyPath, indexes = [] }] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath });
        for (const idx of indexes) store.createIndex(idx, idx);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database is open in another tab with an older version. Close it and reload.'));
  });
  return dbPromise;
}

const done = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const txDone = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
});

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export async function get(name, key) {
  return done((await store(name)).get(key));
}

export async function getAll(name) {
  return done((await store(name)).getAll());
}

export async function getAllByIndex(name, index, value) {
  return done((await store(name)).index(index).getAll(value));
}

export async function put(name, value) {
  const db = await open();
  const tx = db.transaction(name, 'readwrite');
  tx.objectStore(name).put(value);
  await txDone(tx);
  return value;
}

export async function del(name, key) {
  const db = await open();
  const tx = db.transaction(name, 'readwrite');
  tx.objectStore(name).delete(key);
  await txDone(tx);
}

/**
 * Atomic multi-store write: either every change lands or none does.
 * `changes` = { storeName: { put: [...values], del: [...keys], clear: bool } }
 */
export async function batch(changes) {
  const db = await open();
  const names = Object.keys(changes);
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) {
    const s = tx.objectStore(name);
    const { put: puts = [], del: dels = [], clear = false } = changes[name];
    if (clear) s.clear();
    for (const v of puts) s.put(v);
    for (const k of dels) s.delete(k);
  }
  await txDone(tx);
}

export const uid = () => crypto.randomUUID();

/** Tell open screens that stored data changed so they can redraw. */
export function emitDataChange() {
  globalThis.dispatchEvent?.(new Event('datachange'));
}
