/** Job photo queue. Bytes stay on the phone until a configured server acknowledges them. */

import { createId } from "./ids.js";
import { dutyDateOf } from "./chicago-time.js";
import { filenameDateFromCapture, readJpegCaptureTime } from "./exif.js";
import { assertInsideJobPhotos, jobPhotoPath, photoFileName as buildPhotoFileName, stageById } from "./photo-paths.js";

export { STAGES, KNOWN_CONTRACTORS } from "./photo-paths.js";

export async function contentHash(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (globalThis.crypto && globalThis.crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return "fnv-" + data.length + "-" + data[0];
}

export function photoFileName(input) {
  return buildPhotoFileName(input);
}

export async function planPhoto({ employeeId, job, contractor, stageId, bytes, addedAt, photos }) {
  if (!job || !job.jobId || !job.confirmed) return { ok: false, reason: "job-not-confirmed" };
  if (!contractor) return { ok: false, reason: "contractor-required" };
  const stage = stageById(stageId);
  if (!stage) return { ok: false, reason: "stage-required" };
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!data.length) return { ok: false, reason: "empty-file" };
  const hash = await contentHash(data);
  const existing = (photos || []).find((photo) => photo.contentHash === hash && photo.jobId === job.jobId && photo.stage === stage.id);
  if (existing) return { ok: false, reason: "duplicate", photo: existing };
  const capturedRaw = readJpegCaptureTime(data);
  const captureDate = filenameDateFromCapture(capturedRaw);
  const added = addedAt instanceof Date ? addedAt : new Date(addedAt || Date.now());
  const filenameDateSource = captureDate ? "camera-clock" : "added-on-phone";
  const dateStamp = captureDate || dutyDateOf(added);
  const photoId = createId("photo");
  const photo = {
    photoId,
    employeeId,
    contractor,
    jobId: job.jobId,
    jobLabel: job.jobLabel,
    stage: stage.id,
    stageLabel: stage.label,
    contentHash: hash,
    fileName: photoFileName({ jobLabel: job.jobLabel, stageLabel: stage.label, dateStamp, uniqueId: photoId.slice(-8) }),
    filenameDateSource,
    capturedAtRaw: capturedRaw,
    captureTimeKnown: !!captureDate,
    captureTimeZone: captureDate ? "unknown" : null,
    addedAt: added.toISOString(),
    uploadedAt: null,
    status: "saved-on-phone",
    attempts: 0,
    lastError: "",
    remoteItemId: null,
    placeKnown: false,
    bytesKeptLocally: true
  };
  return { ok: true, photo };
}

export async function uploadPhoto(photo, transport) {
  if (!photo) return { ok: false, reason: "missing-photo" };
  if (!transport || transport.configured !== true) {
    return { ok: false, photo: { ...photo, status: "saved-on-phone", uploadedAt: null }, reason: "not-connected" };
  }
  const placed = jobPhotoPath({
    contractor: photo.contractor,
    jobAddress: photo.jobLabel,
    stageLabel: photo.stageLabel,
    fileName: photo.fileName
  });
  if (!placed.ok) {
    return { ok: false, photo: { ...photo, status: "saved-on-phone", lastError: placed.reason, bytesKeptLocally: true }, reason: placed.reason };
  }
  if (transport.path) {
    const override = assertInsideJobPhotos(transport.path);
    if (!override.ok || override.path !== placed.path) {
      return { ok: false, photo: { ...photo, status: "saved-on-phone", lastError: override.reason || "outside-job-photos", bytesKeptLocally: true }, reason: override.reason || "outside-job-photos" };
    }
  }
  const pending = { ...photo, status: "pending-upload", path: placed.path, attempts: (photo.attempts || 0) + 1 };
  let ack;
  try {
    ack = await transport.send({ path: placed.path, fileName: photo.fileName, employeeId: photo.employeeId });
  } catch {
    return { ok: false, photo: { ...pending, status: "failed", lastError: "send-failed", bytesKeptLocally: true }, reason: "send-failed" };
  }
  if (ack && ack.acknowledged === true && ack.remoteItemId && ack.uploadedAt) {
    return {
      ok: true,
      photo: {
        ...pending,
        status: "uploaded",
        uploadedAt: ack.uploadedAt,
        remoteItemId: ack.remoteItemId,
        lastError: "",
        bytesKeptLocally: true
      }
    };
  }
  return {
    ok: false,
    photo: { ...pending, status: "failed", lastError: "not-acknowledged", uploadedAt: null, bytesKeptLocally: true },
    reason: "not-acknowledged"
  };
}

export function photoManifest(photos, employeeId) {
  return {
    schema: "robinson-electrical.job-photos.v1",
    audience: "employee-self",
    emailDelivery: "not-enabled",
    connected: false,
    employeeId,
    photos: (photos || []).filter((photo) => photo.employeeId === employeeId).map((photo) => ({
      photoId: photo.photoId,
      jobId: photo.jobId,
      jobLabel: photo.jobLabel,
      stage: photo.stage,
      fileName: photo.fileName,
      filenameDateSource: photo.filenameDateSource,
      captureTimeKnown: photo.captureTimeKnown,
      capturedAtRaw: photo.capturedAtRaw,
      addedAt: photo.addedAt,
      uploadedAt: photo.uploadedAt,
      status: photo.status,
      placeKnown: false,
      bytesKeptLocally: photo.bytesKeptLocally !== false
    }))
  };
}
