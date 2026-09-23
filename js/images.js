// Pitch overlay screenshots. The pictures themselves live in IndexedDB (localStorage is far
// too small for them); a lineup only stores their ids, so saving a lineup stays cheap.

const DB_NAME = 'lineupbuilder';
const STORE = 'images';
const MAX_EDGE = 1920;

const cache = new Map(); // id -> HTMLImageElement
const memory = new Map(); // id -> blob, when IndexedDB is unavailable (private windows)
let dbPromise = null;
let dbBroken = false;

function openDb() {
  if (dbBroken || !window.indexedDB) return Promise.reject(new Error('no indexeddb'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((e) => {
      dbBroken = true;
      throw e;
    });
  }
  return dbPromise;
}

function run(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req ? req.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

// Shrink to a sane size so a handful of screenshots don't eat hundreds of megabytes.
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.85));
  return { blob, w, h };
}

/** Store one uploaded file; returns the metadata a lineup keeps. */
export async function addImage(file) {
  const { blob, w, h } = await shrink(file);
  const id = `img${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const name = (file.name || 'Screenshot').replace(/\.[^.]+$/, '').slice(0, 40);
  const record = { id, name, blob, w, h, added: Date.now() };
  let kept = true;
  try {
    await run('readwrite', (s) => s.put(record));
  } catch {
    memory.set(id, blob);
    kept = false;
  }
  return { meta: { id, name, w, h }, kept };
}

/** The decoded image, or null when it is no longer stored. */
export async function getImage(id) {
  if (!id) return null;
  if (cache.has(id)) return cache.get(id);
  let blob = memory.get(id);
  if (!blob) {
    try {
      const record = await run('readonly', (s) => s.get(id));
      blob = record?.blob;
    } catch {
      blob = null;
    }
  }
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    cache.set(id, img);
    return img;
  } catch {
    return null;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}

export async function removeImage(id) {
  cache.delete(id);
  memory.delete(id);
  try {
    await run('readwrite', (s) => s.delete(id));
  } catch {
    /* nothing stored */
  }
}
