import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chicagoWallToUtc, dutyDateOf, chicagoOffsetMinutes, payWeekContaining, reportWeek } from "../js/chicago-time.js";
import { jobIdForLabel } from "../js/ids.js";
import { rememberJob, emptyJobBook, publicJob } from "../js/jobs.js";
import { readJpegCaptureTime, filenameDateFromCapture } from "../js/exif.js";
import {
  emptyState, manualStart, stopInterval, switchOrInsert, confirmDay, confirmDidNotWork,
  reviewDay, editEntry, applyGeofenceEvent, setLocationOptIn, markArmed, acceptSuggestion
} from "../js/timecard-model.js";
import { buildEmployeeExport, confirmedCurrentIntervals, confirmedPaidMinutes, findForbiddenKeys } from "../js/export-contract.js";
import { handleEmployeeRead, handleEmployeeWrite, handleOwnerExport } from "../js/employee-boundary.js";
import { flushQueue } from "../js/sync-queue.js";
import { unconfiguredBackend, createBackend } from "../js/backend.js";
import { postBackend, readDeviceConfig, saveDeviceConfig } from "../js/device-config.js";
import { privacyClosing, privacyNoticeSeen, markPrivacyNoticeRead, PRIVACY_NOTICE_VERSION } from "../js/privacy-notice.js";
import { planPhoto, uploadPhoto, photoManifest } from "../js/job-photos.js";
import { assertInsideJobPhotos, photoFileName } from "../js/photo-paths.js";
import { handlePhotoRequest, photoServiceStatus } from "../js/photo-backend.js";
import { createWebSecureStore } from "../js/secure-store.js";
import { geofenceCapabilities } from "../js/native-bridge.js";
import { webTrackingStatus } from "../js/tracking-status.js";
import { suggestPin, regionsForArm } from "../js/geofence-policy.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("Chicago daylight saving is not guessed", () => {
  assert.equal(dutyDateOf(new Date("2026-03-08T07:30:00Z")), "2026-03-08");
  assert.equal(chicagoOffsetMinutes(new Date("2026-03-08T07:30:00Z")), -360);
  assert.equal(chicagoOffsetMinutes(new Date("2026-03-08T08:30:00Z")), -300);
  assert.equal(chicagoWallToUtc("2026-03-08", "02:30").reason, "time-does-not-exist");
  assert.equal(chicagoWallToUtc("2026-11-01", "01:30").reason, "time-ambiguous");
  assert.equal(chicagoWallToUtc("2026-11-11", "07:15").ok, true);
  assert.equal(dutyDateOf(new Date("2026-11-12T05:30:00Z")), "2026-11-11");
});

test("one job id is shared by the same address", () => {
  const id = jobIdForLabel("123 Main St");
  assert.equal(jobIdForLabel("  123   main st "), id);
  assert.notEqual(jobIdForLabel("123 Main Street"), id);
  const first = rememberJob(emptyJobBook(), "123 Main St");
  const second = rememberJob(first.book, "123 Main St");
  assert.equal(second.book.jobs.length, 1);
  assert.equal(publicJob({ ...first.job, latitude: 1 }).latitude, undefined);
});

test("daily review blocks confirmation until the worker fixes the day", () => {
  const start = new Date("2026-11-11T14:00:00Z");
  const end = new Date("2026-11-11T17:00:00Z");
  let state = manualStart(emptyState(), { jobLabel: "123 Main St", kind: "work", at: start }).state;
  const duty = dutyDateOf(start);
  assert.equal(reviewDay(state, duty).canConfirm, false);
  assert.ok(reviewDay(state, duty).blockers.includes("missing-end"));
  state = stopInterval(state, end).state;
  assert.equal(reviewDay(state, duty).noBreaksRecorded, true);
  assert.equal(reviewDay(state, duty).canConfirm, true);
  state = switchOrInsert(state, { jobLabel: "123 Main St", kind: "break", at: end }).state;
  state = stopInterval(state, new Date("2026-11-11T17:30:00Z")).state;
  const note = editEntry(state, state.entries[0].entryId, { workNote: "Receptacles done" }, end);
  assert.equal(note.ok, true);
  state = note.state;
  assert.equal(editEntry(state, state.entries[0].entryId, { workNote: "x".repeat(201) }, end).reason, "note-too-long");
  state = confirmDay(state, duty, end).state;
  const doc = buildEmployeeExport(state, end);
  const current = confirmedCurrentIntervals(doc);
  assert.ok(current.some((row) => row.kind === "work" && row.workNote === "Receptacles done"));
  assert.ok(current.some((row) => row.kind === "break"));
  assert.equal(current.every((row) => row.kind !== "break" || row.payTreatment === "paid"), true);
  assert.equal(doc.breaksSubtracted, false);
  assert.equal(doc.weekStartRule, "monday-saturday");
  assert.equal(findForbiddenKeys(doc).length, 0);
  assert.equal(JSON.stringify(doc).includes("latitude"), false);
  const edited = editEntry(state, state.entries[0].entryId, { workNote: "Corrected" }, end);
  const after = buildEmployeeExport(edited.state, end);
  assert.equal(confirmedCurrentIntervals(after).some((row) => row.entryId === state.entries[0].entryId), false);
});

test("Monday through Saturday is the report week and Sunday is the send day", () => {
  const wednesday = payWeekContaining("2026-11-11");
  assert.equal(wednesday.weekStart, "2026-11-09");
  assert.equal(wednesday.weekEnd, "2026-11-14");
  assert.equal(wednesday.sendOn, "2026-11-15");
  assert.equal(payWeekContaining("2026-11-09").weekStart, "2026-11-09");
  assert.equal(payWeekContaining("2026-11-14").weekEnd, "2026-11-14");
  assert.equal(payWeekContaining("2026-11-15").inPayWeek, false);
  const sundayReport = reportWeek(new Date("2026-11-15T18:00:00Z"));
  assert.equal(sundayReport.weekStart, "2026-11-09");
  assert.equal(sundayReport.weekEnd, "2026-11-14");
  assert.equal(sundayReport.sendOn, "2026-11-15");
  const spring = payWeekContaining("2026-03-11");
  assert.equal(spring.weekStart, "2026-03-09");
  assert.equal(spring.weekEnd, "2026-03-14");
  assert.equal(spring.sendOn, "2026-03-15");
});

test("travel between jobs is added to the next job and breaks stay paid", () => {
  const day = "2026-11-11T";
  let state = manualStart(emptyState(), { jobLabel: "Job A", at: new Date(day + "14:00:00Z") }).state;
  state = stopInterval(state, new Date(day + "16:00:00Z")).state;
  state = manualStart(state, { jobLabel: "Job B", at: new Date(day + "16:30:00Z") }).state;
  state = stopInterval(state, new Date(day + "18:00:00Z")).state;
  state = manualStart(state, { jobLabel: "Job A", kind: "break", at: new Date(day + "18:00:00Z") }).state;
  state = stopInterval(state, new Date(day + "18:15:00Z")).state;
  state = confirmDay(state, "2026-11-11", new Date(day + "19:00:00Z")).state;
  const doc = buildEmployeeExport(state, new Date(day + "19:00:00Z"));
  const jobB = doc.entries.find((row) => row.jobLabel === "Job B" && !row.superseded);
  const jobA = doc.entries.find((row) => row.jobLabel === "Job A" && row.kind === "work" && !row.superseded);
  const pause = doc.entries.find((row) => row.kind === "break" && !row.superseded);
  assert.equal(jobA.travelMinutes, 0);
  assert.equal(jobB.travelMinutes, 30);
  assert.equal(jobB.travelFromJobLabel, "Job A");
  assert.equal(jobB.billableMinutes, jobB.elapsedMinutes + 30);
  assert.equal(pause.payTreatment, "paid");
  assert.equal(doc.breaksSubtracted, false);
  const withoutBreak = jobA.billableMinutes + jobB.billableMinutes;
  assert.equal(confirmedPaidMinutes(doc), withoutBreak + pause.billableMinutes);
  let nextDay = manualStart(emptyState(), { jobLabel: "Job C", at: new Date("2026-11-12T14:00:00Z") }).state;
  nextDay = stopInterval(nextDay, new Date("2026-11-12T15:00:00Z")).state;
  nextDay = confirmDay(nextDay, "2026-11-12", new Date("2026-11-12T16:00:00Z")).state;
  const thursday = buildEmployeeExport(nextDay, new Date("2026-11-12T16:00:00Z"));
  assert.equal(thursday.entries.find((row) => row.jobLabel === "Job C" && !row.superseded).travelMinutes, 0);
  let paused = manualStart(emptyState(), { jobLabel: "Job A", at: new Date(day + "14:00:00Z") }).state;
  paused = stopInterval(paused, new Date(day + "16:00:00Z")).state;
  paused = manualStart(paused, { jobLabel: "Job A", kind: "break", at: new Date(day + "16:00:00Z") }).state;
  paused = stopInterval(paused, new Date(day + "16:15:00Z")).state;
  paused = manualStart(paused, { jobLabel: "Job B", at: new Date(day + "16:45:00Z") }).state;
  paused = stopInterval(paused, new Date(day + "18:00:00Z")).state;
  paused = confirmDay(paused, "2026-11-11", new Date(day + "19:00:00Z")).state;
  const split = buildEmployeeExport(paused, new Date(day + "19:00:00Z"));
  const nextJob = split.entries.find((row) => row.jobLabel === "Job B" && !row.superseded);
  const paidBreak = split.entries.find((row) => row.kind === "break" && !row.superseded);
  assert.equal(nextJob.travelMinutes, 30);
  assert.equal(confirmedPaidMinutes(split), nextJob.billableMinutes + paidBreak.billableMinutes + split.entries.find((row) => row.jobLabel === "Job A" && row.kind === "work" && !row.superseded).billableMinutes);
  let sunday = manualStart(emptyState(), { jobLabel: "Sunday Job", at: new Date("2026-11-08T18:00:00Z") }).state;
  sunday = stopInterval(sunday, new Date("2026-11-08T19:00:00Z")).state;
  sunday = confirmDay(sunday, "2026-11-08", new Date("2026-11-08T20:00:00Z")).state;
  const report = buildEmployeeExport(sunday, new Date("2026-11-11T18:00:00Z"));
  assert.equal(report.entries.length, 0);
  assert.equal(report.outsidePayWeek.length > 0, true);
});

test("did not work adds no hours", () => {
  const at = new Date("2026-11-11T18:00:00Z");
  const duty = dutyDateOf(at);
  const state = confirmDidNotWork(emptyState(), duty, at).state;
  const doc = buildEmployeeExport(state, at);
  assert.equal(doc.confirmations[0].worked, false);
  assert.equal(doc.entries.length, 0);
});

test("gps suggestion is not confirmed time and drops coordinates", () => {
  const at = new Date("2026-11-11T15:00:00Z");
  const duty = dutyDateOf(at);
  let state = setLocationOptIn(emptyState(), true, at).state;
  state = markArmed(state, duty, at).state;
  const jobId = jobIdForLabel("123 Main St");
  state.pins.push({ jobId, jobLabel: "123 Main St", latitude: 38.6, longitude: -90.2 });
  const entered = applyGeofenceEvent(state, {
    jobId, jobLabel: "123 Main St", transition: "enter", occurredAt: at, accuracyMeters: 400, latitude: 1, longitude: 2
  });
  assert.equal(entered.outcome, "suggested");
  assert.equal(JSON.stringify(entered.state.entries).includes('"latitude"'), false);
  assert.equal(entered.state.entries[0].revisions[0].lowAccuracy, true);
  assert.equal(entered.state.entries[0].revisions[0].status, "suggested");
  const left = applyGeofenceEvent(entered.state, {
    jobId, jobLabel: "123 Main St", transition: "exit", occurredAt: new Date("2026-11-11T18:00:00Z"), accuracyMeters: 30
  });
  const accepted = acceptSuggestion(left.state, left.state.entries[0].entryId, at);
  assert.equal(reviewDay(accepted.state, duty).canConfirm, true);
  const off = applyGeofenceEvent(emptyState(), {
    jobId, jobLabel: "123 Main St", transition: "enter", occurredAt: at, latitude: 9, longitude: 9
  });
  assert.equal(off.outcome, "ignored-off-duty");
  assert.equal(off.state.entries.length, 0);
});

test("sync stays saved on the phone until a server acknowledges it", async () => {
  const at = new Date("2026-11-11T15:00:00Z");
  let state = manualStart(emptyState(), { jobLabel: "123 Main St", at }).state;
  state = stopInterval(state, new Date("2026-11-11T16:00:00Z")).state;
  const idle = await flushQueue(state, unconfiguredBackend());
  assert.equal(idle.result, "not-configured");
  assert.equal(idle.state.queue.every((item) => item.syncStatus === "saved-on-phone"), true);
  const acked = await flushQueue(state, {
    configured: true,
    async push() { return { acknowledged: true }; }
  });
  assert.equal(acked.state.queue.every((item) => item.syncStatus === "uploaded"), true);
  const denied = await createBackend({ endpoint: "https://example.github.io/hook", token: "secret" }).push({});
  assert.equal(denied.sent, false);
});

test("photos keep local bytes and do not claim an upload", async () => {
  const job = { jobId: jobIdForLabel("123 Main St"), jobLabel: "123 Main St", confirmed: true };
  const bytes = jpegWithDate("2026:11:01 14:05:09");
  assert.equal(filenameDateFromCapture(readJpegCaptureTime(bytes)), "2026-11-01");
  assert.equal(readJpegCaptureTime(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), null);
  const planned = await planPhoto({
    employeeId: "emp_1", job, contractor: "BluSky", stageId: "rough-in", bytes, addedAt: new Date("2026-11-11T15:00:00Z"), photos: []
  });
  assert.equal(planned.photo.status, "saved-on-phone");
  assert.equal(planned.photo.captureTimeKnown, true);
  assert.equal(planned.photo.captureTimeZone, "unknown");
  assert.equal(planned.photo.placeKnown, false);
  assert.match(planned.photo.fileName, /123 Main St - Rough-In - 2026-11-01 - /);
  const again = await planPhoto({
    employeeId: "emp_1", job, contractor: "BluSky", stageId: "rough-in", bytes, addedAt: new Date(), photos: [planned.photo]
  });
  assert.equal(again.reason, "duplicate");
  const missing = jpegWithDate(null);
  const unknown = await planPhoto({
    employeeId: "emp_1", job, contractor: "Other", stageId: "trim", bytes: missing, addedAt: new Date("2026-11-11T16:00:00Z"), photos: []
  });
  assert.equal(unknown.photo.captureTimeKnown, false);
  assert.equal(unknown.photo.filenameDateSource, "added-on-phone");
  const notSent = await uploadPhoto(planned.photo, { configured: false });
  assert.equal(notSent.photo.status, "saved-on-phone");
  assert.equal(notSent.photo.uploadedAt, null);
  const failed = await uploadPhoto(planned.photo, {
    configured: true,
    folder: { verified: true, driveId: "drive", folderId: "folder", jobId: job.jobId, stage: "rough-in" },
    async send() { return { acknowledged: false }; }
  });
  assert.equal(failed.photo.status, "failed");
  assert.equal(failed.photo.bytesKeptLocally, true);
  const sent = await uploadPhoto(planned.photo, {
    configured: true,
    folder: { verified: true, driveId: "drive", folderId: "folder", jobId: job.jobId, stage: "rough-in" },
    async send() { return { acknowledged: true, remoteItemId: "item", uploadedAt: "2026-11-11T18:00:00Z" }; }
  });
  assert.equal(sent.photo.status, "uploaded");
  assert.equal(sent.photo.bytesKeptLocally, true);
  let blockedSent = false;
  const blocked = await uploadPhoto(planned.photo, {
    configured: true,
    path: "Accounting/secret.jpg",
    async send() { blockedSent = true; return { acknowledged: true }; }
  });
  assert.equal(blockedSent, false);
  assert.equal(blocked.reason, "accounting-blocked");
  assert.equal(photoManifest([planned.photo], "emp_2").photos.length, 0);
  assert.equal(photoServiceStatus().employeeMicrosoftSignIn, false);
});

test("job photo paths stay inside Job Photos and names are automatic", () => {
  const named = photoFileName({ jobLabel: "123 Main St", stageLabel: "Rough-In", dateStamp: "2026-11-01", uniqueId: "abc12345" });
  assert.equal(named, "123 Main St - Rough-In - 2026-11-01 - abc12345.jpg");
  const directory = { a: { employeeId: "emp_a" } };
  const saved = handlePhotoRequest({
    method: "POST",
    token: "a",
    tokenDirectory: directory,
    graphConfigured: true,
    upload: {
      contractor: "Scout Roe Construction",
      jobAddress: "123 Main St",
      stageId: "rough-in",
      dateStamp: "2026-11-01",
      uniqueId: "abc12345",
      fileName: "../../Accounting/secret.jpg"
    }
  });
  assert.equal(saved.status, 202);
  assert.equal(saved.fileName, named);
  assert.equal(saved.path, "Job Photos/Scout Roe Construction/123 Main St/Rough-In/" + named);
  assert.equal(JSON.stringify(saved).includes("refreshToken"), false);
  assert.equal(handlePhotoRequest({
    method: "POST", token: "a", tokenDirectory: directory, graphConfigured: true,
    upload: { contractor: "../Accounting", jobAddress: "123 Main St", stageId: "trim", dateStamp: "2026-11-01", uniqueId: "abc12345" }
  }).status, 403);
  for (const path of ["Accounting/invoices.pdf", "Job Photos/../Accounting/secret.jpg", "/Job Photos/BluSky/1/Rough-In/a.jpg", "Job Photos/Horn Restoration/1/Payroll/a.jpg"]) {
    assert.equal(assertInsideJobPhotos(path).ok, false, path);
  }
  assert.equal(assertInsideJobPhotos("Job Photos/Other/99 Oak/Finished/99 Oak - Finished - 2026-11-01 - abc12345.jpg").ok, true);
  assert.equal(handlePhotoRequest({ method: "DELETE", token: "a", tokenDirectory: directory, graphConfigured: true, path: "Job Photos/BluSky/1/Rough-In" }).status, 403);
  const offline = handlePhotoRequest({ method: "GET", token: "a", tokenDirectory: directory, graphConfigured: false, path: "Job Photos/BluSky/1/Rough-In" });
  assert.equal(offline.status, 503);
  assert.equal(offline.photos.length, 0);
});

test("employees cannot read each other or the owner rollup", () => {
  const directory = { a: { employeeId: "emp_a", role: "employee" }, owner: { employeeId: "owner", role: "owner" } };
  const records = [{ employeeId: "emp_a", employeeName: "A", entries: [], confirmations: [], audit: [] }, { employeeId: "emp_b", employeeName: "B", entries: [], confirmations: [], audit: [] }];
  assert.equal(handleEmployeeRead({ token: "a", tokenDirectory: directory, records, requestedEmployeeId: "emp_b" }).status, 403);
  assert.equal(handleEmployeeRead({ token: "a", tokenDirectory: directory, records }).body.entries.length, 1);
  assert.equal(handleEmployeeWrite({ token: "a", tokenDirectory: directory, body: { employeeId: "emp_b" } }).status, 403);
  assert.equal(handleEmployeeWrite({ token: "a", tokenDirectory: directory, body: { employeeId: "emp_a", payRate: 10 } }).status, 400);
  assert.equal(handleOwnerExport({ token: "a", tokenDirectory: directory, records }).status, 403);
  const owner = handleOwnerExport({ token: "owner", tokenDirectory: directory, records });
  assert.equal(owner.status, 200);
  assert.equal(owner.body.financialDataIncluded, false);
  assert.equal(JSON.stringify(owner.body).includes("payRate"), false);
});

test("catalog keeps old ids and adds only the distinct write-ins", () => {
  const ids = [...html.matchAll(/(?:ea|item)\("([^"]+)", "([^"]+)"/g)].map((match) => match[1] + "|" + match[2]);
  const added = [
    "qty_stack_its_cable_stackers|Stack-Its (cable stackers)",
    "qty_5in_halo_cut_in_remodel_can|5in Halo Cut-In / Remodel Can",
    "qty_single_gang_cut_in_box|Single Gang Cut-In Box",
    "qty_two_gang_cut_in_box|Two Gang Cut-In Box",
    "qty_broan_50_cfm_bath_fan|Broan 50 CFM Bath Fan",
    "qty_single_gang_blank_cover|Single Gang Blank Cover",
    "qty_5_6in_halo_high_lumen_can_trim|5/6in Halo High-Lumen Can Trim",
    "qty_pull_chain_fixture|Pull-Chain Fixture",
    "qty_8_2_nmb_romex|8-2 NM-B Romex",
    "qty_6_3_nmb_romex|6-3 NM-B Romex",
    "qty_omni_wire|Omni-Wire",
    "qty_octagon_box|Octagon Box",
    "qty_4in_to_3in_adapter|4in-to-3in Adapter"
  ];
  for (const row of added) assert.equal(ids.filter((item) => item === row).length, 1, row);
  for (const kept of ["qty_5in_halo_can_light|5in Halo Can Light", "qty_5_6in_halo_can_trim|5/6in Halo Can Trim", "qty_4in_halo_can_trim|4in Halo Can Trim", "qty_18_3|18-3", "qty_1_2in_flexible_conduit_90_connector|1/2in Flexible Conduit 90 Connector", "qty_single_gang_bubble_cover|Single Gang Bubble Cover"]) {
    assert.equal(ids.filter((item) => item === kept).length, 1, kept);
  }
  assert.match(html, /it\.name \+ " \\u2014 " \+ fmtQty\(it\.qty\) \+ " " \+ it\.unit/);
  assert.match(html, /Labor hrs @ \$100\/hr/);
  assert.equal(html.includes("gtag"), false);
});

test("phone posts text/plain so Apps Script skips the CORS preflight", async () => {
  const storage = {
    items: new Map(),
    getItem(key) { return this.items.has(key) ? this.items.get(key) : null; },
    setItem(key, value) { this.items.set(key, String(value)); },
    removeItem(key) { this.items.delete(key); }
  };
  assert.equal(saveDeviceConfig(storage, { url: "https://example.com/macros/s/abc/exec", token: "tok" }).ok, true);
  let header = "";
  let sent = "";
  await postBackend(readDeviceConfig(storage), "/api/health", {}, async (_url, options) => {
    header = options.headers["content-type"];
    sent = options.body;
    return { ok: true, status: 200, json: async () => ({ ok: true, theme: "auto" }) };
  });
  assert.equal(header, "text/plain;charset=utf-8");
  assert.equal(JSON.parse(sent).path, "/api/health");
  let pushed = "";
  const backend = createBackend({
    endpoint: "https://example.com/exec",
    token: "tok",
    fetchImpl: async (_url, options) => {
      pushed = options.headers["content-type"];
      return { ok: true, status: 200 };
    }
  });
  await backend.push({ hello: true });
  assert.equal(pushed, "text/plain;charset=utf-8");
});

test("privacy notice stays dismissed until its text version changes", () => {
  const storage = {
    items: new Map(),
    getItem(key) { return this.items.has(key) ? this.items.get(key) : null; },
    setItem(key, value) { this.items.set(key, String(value)); },
    removeItem(key) { this.items.delete(key); }
  };
  assert.equal(privacyNoticeSeen(storage), false);
  markPrivacyNoticeRead(storage);
  assert.equal(privacyNoticeSeen(storage), true);
  assert.equal(privacyNoticeSeen(storage, PRIVACY_NOTICE_VERSION + 1), false);
  assert.match(privacyClosing(false), /not connected/);
  assert.match(privacyClosing(true), /private company sheet/);
  assert.equal(privacyClosing(true).includes("$"), false);
});

test("website tracking and token storage stay unavailable", async () => {
  assert.equal((await geofenceCapabilities()).backgroundGeofence, false);
  assert.equal(webTrackingStatus().backgroundGeofence, false);
  const token = await createWebSecureStore().saveToken("secret");
  assert.equal(token.ok, false);
  assert.equal(suggestPin([], { latitude: 1, longitude: 1, accuracyMeters: 20 }).reason, "none-nearby");
  assert.equal(regionsForArm(Array.from({ length: 21 }, (_, i) => ({ jobId: "j" + i, jobLabel: "J", latitude: 1, longitude: 1 })), "ios").ok, false);
  assert.match(readFileSync(new URL("../js/privacy-notice.js", import.meta.url), "utf8"), /Apple has not reviewed or approved this app/);
  const swift = readFileSync(new URL("../native/plugins/robinson-geofence/ios/Sources/RobinsonGeofencePlugin/RobinsonGeofencePlugin.swift", import.meta.url), "utf8");
  const kotlin = readFileSync(new URL("../native/plugins/robinson-geofence/android/src/main/kotlin/com/robinsonelectrical/geofence/RobinsonGeofencePlugin.kt", import.meta.url), "utf8");
  const manifest = readFileSync(new URL("../native/plugins/robinson-geofence/android/src/main/AndroidManifest.xml", import.meta.url), "utf8");
  assert.match(swift, /CLLocationManager/);
  assert.match(swift, /CLCircularRegion/);
  assert.equal(swift.includes("startUpdatingLocation"), false);
  assert.match(kotlin, /GeofencingRequest/);
  assert.match(kotlin, /background-location-not-granted/);
  assert.equal(manifest.includes("READ_CONTACTS"), false);
  assert.equal(manifest.includes("READ_MEDIA_IMAGES"), false);
});

function jpegWithDate(date) {
  if (!date) return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const text = new TextEncoder().encode(date + "\0");
  const tiff = new Uint8Array(44 + text.length);
  tiff.set([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00], 0);
  tiff.set([0x01, 0x00], 8);
  tiff.set([0x69, 0x87, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x1a, 0x00, 0x00, 0x00], 10);
  tiff.set([0x01, 0x00], 26);
  tiff.set([0x03, 0x90, 0x02, 0x00, 0x14, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00], 28);
  tiff.set(text, 44);
  const payload = new Uint8Array(6 + tiff.length);
  payload.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0);
  payload.set(tiff, 6);
  const size = payload.length + 2;
  const jpeg = new Uint8Array(6 + payload.length);
  jpeg.set([0xff, 0xd8, 0xff, 0xe1, (size >> 8) & 255, size & 255], 0);
  jpeg.set(payload, 6);
  return jpeg;
}

