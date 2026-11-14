/** Private photo API. Joe's Microsoft token stays on the server.
 * The phone calls these routes with its own employee sign-in, never a Microsoft login.
 * Nothing here is live until the server is configured. */

import { assertInsideJobPhotos, jobPhotoPath, photoFileName, stageById, KNOWN_CONTRACTORS } from "./photo-paths.js";

export const PHOTO_ROUTES = [
  { method: "GET", path: "/api/job-photos/contractors", purpose: "List contractor folders inside Job Photos." },
  { method: "GET", path: "/api/job-photos/contractors/:contractor/jobs", purpose: "List job-address folders for one contractor." },
  { method: "GET", path: "/api/job-photos/contractors/:contractor/jobs/:job/stages/:stage/photos", purpose: "List photos for one stage, with thumbnail ids." },
  { method: "GET", path: "/api/job-photos/photos/:photoId?size=thumb|full", purpose: "Return one thumbnail or the full picture." },
  { method: "POST", path: "/api/job-photos/contractors/:contractor/jobs/:job/stages/:stage", purpose: "Upload one photo. The server chooses the file name." }
];

export function photoServiceStatus() {
  return {
    configured: false,
    connected: false,
    employeeMicrosoftSignIn: false,
    reason: "not-connected"
  };
}

function employee(token, directory) {
  if (!token || !directory || !directory[token]) return null;
  const record = directory[token];
  return typeof record === "string" ? { employeeId: record } : record;
}

function forbiddenToken(body) {
  return JSON.stringify(body || {}).match(/refreshToken|access_token|client_secret|clientSecret/i);
}

export function handlePhotoRequest({ method, path, token, tokenDirectory, graphConfigured, catalog, upload }) {
  const who = employee(token, tokenDirectory);
  if (!who) return { status: 401, error: "unauthenticated" };
  if (method === "DELETE" || method === "PATCH" || method === "PUT") {
    return { status: 403, error: "employees-cannot-change-photos" };
  }
  if (!graphConfigured) {
    return { status: 503, error: "not-connected", contractors: [], jobs: [], photos: [] };
  }
  if (method === "GET" && path) {
    const check = assertInsideJobPhotos(path);
    if (!check.ok) return { status: 403, error: check.reason };
    const photos = (catalog || []).filter((item) => item.path === check.path || item.folder === check.path);
    return { status: 200, path: check.path, photos, employeeMicrosoftSignIn: false };
  }
  if (method === "POST") {
    const stage = stageById(upload && upload.stageId);
    const fileName = photoFileName({
      jobLabel: upload && upload.jobAddress,
      stageLabel: stage && stage.label,
      dateStamp: upload && upload.dateStamp,
      uniqueId: upload && upload.uniqueId
    });
    const placed = jobPhotoPath({
      contractor: upload && upload.contractor,
      jobAddress: upload && upload.jobAddress,
      stageLabel: stage && stage.label,
      fileName
    });
    if (!placed.ok) return { status: 403, error: placed.reason };
    const response = {
      status: 202,
      acknowledged: true,
      path: placed.path,
      fileName,
      remoteItemId: "photo_" + (upload.uniqueId || "new"),
      employeeId: who.employeeId,
      employeeMicrosoftSignIn: false
    };
    if (forbiddenToken(response)) return { status: 500, error: "secret-in-response" };
    return response;
  }
  return { status: 405, error: "method-not-allowed" };
}

export function listKnownContractors() {
  return KNOWN_CONTRACTORS.slice();
}
