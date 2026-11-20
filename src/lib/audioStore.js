/* Recorded audio kept in IndexedDB (localStorage can't hold binary data), so recordings survive closing the tab. */
const DB = "familyroots-audio";
const STORE = "clips";

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Save one recording under the story id. Resolves false when storage is unavailable (e.g. private browsing). */
export async function saveAudio(id, blob) {
  try {
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch { return false; }
}

/** One saved recording, or null. */
export async function loadAudio(id) {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const req = d.transaction(STORE).objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}

/** Every saved recording as { [storyId]: Blob }. */
export async function loadAllAudio() {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const out = {};
      const req = d.transaction(STORE).objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) { resolve(out); return; }
        out[c.key] = c.value;
        c.continue();
      };
      req.onerror = () => reject(req.error);
    });
  } catch { return {}; }
}
