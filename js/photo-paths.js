/** Job Photos folder rules. The phone and the backend both use this.
 * Employees never receive a Microsoft token. */

export const JOB_PHOTOS_ROOT = "Job Photos";

export const STAGES = [
  { id: "rough-in", label: "Rough-In" },
  { id: "trim", label: "Trim" },
  { id: "finished", label: "Finished" }
];

/** Names Joe already uses, plus Other. The server may list more. */
export const KNOWN_CONTRACTORS = [
  "BluSky",
  "Scout Roe Construction",
  "Horn Restoration",
  "Other"
];

const BLOCKED_SEGMENT = /^(accounting|payroll|financial|bids?|invoices?)$/i;

export function cleanSegment(value) {
  const text = String(value || "").replace(/\\/g, "/").trim();
  if (!text || text === "." || text === ".." || text.includes("..")) return { ok: false, reason: "path-traversal" };
  if (text.includes("/") || text.includes("\0")) return { ok: false, reason: "path-traversal" };
  if (BLOCKED_SEGMENT.test(text)) return { ok: false, reason: "accounting-blocked" };
  return { ok: true, value: text };
}

export function stageById(stageId) {
  return STAGES.find((stage) => stage.id === stageId || stage.label === stageId) || null;
}

export function photoFileName({ jobLabel, stageLabel, dateStamp, uniqueId }) {
  const address = String(jobLabel || "Job").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const stage = stageLabel || "Stage";
  const date = dateStamp || "date-unknown";
  const id = String(uniqueId || "").replace(/[^a-z0-9]/gi, "").slice(-8) || "photo";
  return address + " - " + stage + " - " + date + " - " + id + ".jpg";
}

export function jobPhotoPath({ contractor, jobAddress, stageLabel, fileName }) {
  const people = cleanSegment(contractor);
  if (!people.ok) return people;
  const place = cleanSegment(jobAddress);
  if (!place.ok) return place;
  const stage = stageById(stageLabel);
  if (!stage) return { ok: false, reason: "bad-stage" };
  const segments = [JOB_PHOTOS_ROOT, people.value, place.value, stage.label];
  if (fileName != null && fileName !== "") {
    const file = cleanSegment(fileName);
    if (!file.ok) return file;
    if (!file.value.toLowerCase().endsWith(".jpg")) return { ok: false, reason: "bad-filename" };
    segments.push(file.value);
  }
  return { ok: true, segments, path: segments.join("/") };
}

export function assertInsideJobPhotos(path) {
  let text = String(path || "").trim();
  if (!text) return { ok: false, reason: "outside-job-photos" };
  try { text = decodeURIComponent(text); }
  catch { return { ok: false, reason: "bad-path" }; }
  text = text.replace(/\\/g, "/");
  if (text.startsWith("/") || /^[a-z]:/i.test(text) || text.includes("..") || text.includes("//")) {
    return { ok: false, reason: "path-traversal" };
  }
  const parts = text.split("/");
  for (const part of parts) {
    if (BLOCKED_SEGMENT.test(part)) return { ok: false, reason: "accounting-blocked" };
  }
  if (parts.length < 4 || parts.length > 5 || parts[0] !== JOB_PHOTOS_ROOT) {
    return { ok: false, reason: "outside-job-photos" };
  }
  for (const part of parts.slice(1)) {
    const cleaned = cleanSegment(part);
    if (!cleaned.ok) return cleaned;
  }
  if (!stageById(parts[3])) return { ok: false, reason: "bad-stage" };
  return { ok: true, path: parts.join("/") };
}
