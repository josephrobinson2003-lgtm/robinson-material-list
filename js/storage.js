/** Website storage is ordinary browser storage. Tokens are refused here. */

const DB = "re_timecard_v1";
const BOOK = "book";

export function createMemoryStore(initial) {
  let state = initial;
  return {
    kind: "memory",
    encryptionAtRest: false,
    async load() { return structuredClone(state); },
    async save(next) {
      state = structuredClone(next);
      return { ok: true, encryptionAtRest: false, kind: "memory" };
    }
  };
}

export function createMemoryBlobStore() {
  const map = new Map();
  return {
    async put(id, bytes) {
      map.set(id, new Uint8Array(bytes));
      return { ok: true };
    },
    async get(id) {
      const value = map.get(id);
      return value ? new Uint8Array(value) : null;
    },
    async delete(id) { map.delete(id); }
  };
}

export function createBrowserStore() {
  return {
    kind: "browser-storage",
    encryptionAtRest: false,
    async load() { return loadIdb(); },
    async save(state) { return saveIdb(state); }
  };
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("no-idb"));
      return;
    }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BOOK)) db.createObjectStore(BOOK);
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("idb"));
  });
}

async function loadIdb() {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(BOOK, "readonly");
      const request = tx.objectStore(BOOK).get("state");
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveIdb(state) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(BOOK, "readwrite");
    tx.objectStore(BOOK).put(state, "state");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("save"));
  });
  return { ok: true, encryptionAtRest: false, kind: "browser-storage" };
}

export function createBrowserBlobStore() {
  return {
    async put(id, bytes) {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction("photos", "readwrite");
        tx.objectStore("photos").put(bytes, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("blob"));
      });
      return { ok: true };
    },
    async get(id) {
      const db = await openDb();
      return new Promise((resolve) => {
        const tx = db.transaction("photos", "readonly");
        const request = tx.objectStore("photos").get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });
    },
    async delete(id) {
      const db = await openDb();
      await new Promise((resolve) => {
        const tx = db.transaction("photos", "readwrite");
        tx.objectStore("photos").delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
  };
}
