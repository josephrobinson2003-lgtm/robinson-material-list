/** Job photo queue. Bytes stay on the phone until a configured server acknowledges them. */

import { createId } from "./ids.js";
import { dutyDateOf } from "./chicago-time.js";
import { filenameDateFromCapture, readJpegCaptureTime } from "./exif.js";
import { graphUploadUrl, verifyJobFolder } from "./microsoft-auth.js";

export const STAGES = [
  { id: "rough-in", label: "Rough-In" },
  { id: "trim", label: "Trim" },
  { id: "finished", label: "Finished" }
];

export async function contentHash(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (globalThis.crypto && globalThis.crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return "fnv-" + data.length + "-" + data[0];
}

export function photoFileName({ jobLabel, stageLabel, dateStamp, uniqueId }) {
  const address = String(jobLabel || "Job").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const stage = stageLabel || "Stage";
  const date = dateStamp || "date-unknown";
  return address + " - " + stage + " - " + date + " - " + uniqueId + ".jpg";
}

export async function planPhoto({ employeeId, job, stageId, bytes, addedAt, photos }) {
  if (!job || !job.jobId || !job.confirmed) return { ok: false, reason: "job-not-confirmed" };
  const stage = STAGES.find((item) => item.id === stageId);
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
  const folderOk = verifyJobFolder(transport.folder);
  if (!folderOk.ok) {
    return { ok: false, photo: { ...photo, status: "saved-on-phone", lastError: folderOk.reason }, reason: folderOk.reason };
  }
  if (transport.folder.jobId !== photo.jobId || transport.folder.stage !== photo.stage) {
    return { ok: false, photo: { ...photo, status: "failed", lastError: "folder-job-mismatch", bytesKeptLocally: true }, reason: "folder-job-mismatch" };
  }
  const target = graphUploadUrl({ driveId: transport.folder.driveId, folderId: transport.folder.folderId, fileName: photo.fileName });
  if (!target.ok) {
    return { ok: false, photo: { ...photo, status: "failed", lastError: target.reason, bytesKeptLocally: true }, reason: target.reason };
  }
  const pending = { ...photo, status: "pending-upload", attempts: (photo.attempts || 0) + 1 };
  let ack;
  try {
    ack = await transport.send({ photo: pending, url: target.url, method: target.method });
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
