/** Stable ids. Job ids hash the label so the same address matches across edits.
 * They are not OneDrive or spreadsheet keys. */

export function createId(prefix) {
  const bytes = new Uint8Array(16);
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") cryptoObj.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return prefix + "_" + hex;
}

export function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function normalizeJobLabel(label) {
  return String(label || "").trim().replace(/\s+/g, " ");
}

export function jobIdForLabel(label) {
  const norm = normalizeJobLabel(label).toLowerCase();
  if (!norm) return null;
  return "job_" + fnv1a(norm);
}
