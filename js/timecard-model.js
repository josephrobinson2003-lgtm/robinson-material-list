/** One person's timecard. GPS suggestions stay provisional until that person confirms the day. */

import { createId, jobIdForLabel, normalizeJobLabel } from "./ids.js";
import { dutyDateOf, formatChicagoIso } from "./chicago-time.js";
import { assessGeofenceEvent } from "./geofence-policy.js";
import { enqueue } from "./sync-queue.js";

export function emptyState() {
  return {
    schema: "robinson-electrical.timecard.v1",
    employeeId: null,
    employeeName: "",
    privacyNoticeAcknowledged: false,
    locationOptIn: false,
    armed: null,
    entries: [],
    confirmations: [],
    audit: [],
    pins: [],
    queue: [],
    jobDraft: "",
    jobConfirmed: false
  };
}

function clone(state) {
  return structuredClone(state);
}

function prepare(state) {
  const next = clone(state);
  if (!next.employeeId) next.employeeId = createId("emp");
  return next;
}

function fail(state, reason) {
  return { ok: false, reason, state };
}

function ok(state, extra = {}) {
  return { ok: true, state, ...extra };
}

function iso(at) {
  const date = at instanceof Date ? at : new Date(at);
  return formatChicagoIso(date);
}

function latest(entry) {
  return entry.revisions[entry.revisions.length - 1];
}

function jobRef(label) {
  const jobLabel = normalizeJobLabel(label);
  const jobId = jobIdForLabel(jobLabel);
  if (!jobId) return null;
  return { jobId, jobLabel };
}

function addAudit(state, fields) {
  state.audit.push({
    auditId: createId("audit"),
    employeeId: state.employeeId,
    at: fields.at,
    action: fields.action,
    entryId: fields.entryId || null,
    revision: fields.revision ?? null,
    note: fields.note || ""
  });
}

function queueRevision(state, entry, revision, at) {
  enqueue(state, {
    opId: "op_" + entry.entryId + "_" + revision.revision,
    entryId: entry.entryId,
    revision: revision.revision,
    enqueuedAt: at,
    syncStatus: "saved-on-phone"
  });
}

function blankRevision(fields) {
  return {
    revision: 1,
    syncStatus: "saved-on-phone",
    workNote: "",
    missedStop: false,
    overlap: false,
    lowAccuracy: false,
    missedContext: null,
    voidReason: "",
    note: "",
    ...fields
  };
}

function addEntry(state, fields, at, action) {
  const entry = {
    entryId: createId("entry"),
    employeeId: state.employeeId,
    revisions: [blankRevision(fields)]
  };
  state.entries.push(entry);
  addAudit(state, { action, entryId: entry.entryId, revision: 1, at, note: fields.workNote || "" });
  queueRevision(state, entry, entry.revisions[0], at);
  return entry;
}

function bump(state, entry, patch, at, action) {
  const prev = latest(entry);
  const revision = { ...prev, ...patch, revision: prev.revision + 1, syncStatus: "saved-on-phone" };
  entry.revisions.push(revision);
  addAudit(state, { action, entryId: entry.entryId, revision: revision.revision, at, note: patch.workNote || "" });
  queueRevision(state, entry, revision, at);
  return revision;
}

function openRecorded(state) {
  return state.entries.find((entry) => {
    const row = latest(entry);
    return row.status === "recorded" && !row.end;
  }) || null;
}

export function setEmployeeName(state, name) {
  const next = prepare(state);
  next.employeeName = String(name || "").slice(0, 80);
  return ok(next);
}

export function acknowledgePrivacy(state) {
  const next = prepare(state);
  next.privacyNoticeAcknowledged = true;
  return ok(next);
}

export function setLocationOptIn(state, optedIn, at) {
  const next = prepare(state);
  next.locationOptIn = !!optedIn;
  if (!optedIn) next.armed = null;
  addAudit(next, { action: optedIn ? "opt-in" : "opt-out", at: iso(at || new Date()) });
  return ok(next);
}

export function setJobDraft(state, label) {
  const next = prepare(state);
  next.jobDraft = normalizeJobLabel(label);
  next.jobConfirmed = false;
  return ok(next);
}

export function confirmJob(state, label) {
  const next = prepare(state);
  const job = jobRef(label);
  if (!job) return fail(state, "job-required");
  next.jobDraft = job.jobLabel;
  next.jobConfirmed = true;
  return ok(next, { job });
}

export function manualStart(state, { jobLabel, kind = "work", at }) {
  const next = prepare(state);
  const job = jobRef(jobLabel);
  if (!job) return fail(state, "job-required");
  if (!["work", "break", "travel"].includes(kind)) return fail(state, "bad-kind");
  if (openRecorded(next)) return fail(state, "open-interval");
  const when = iso(at);
  addEntry(next, {
    jobId: job.jobId,
    jobLabel: job.jobLabel,
    kind,
    status: "recorded",
    origin: "employee",
    dutyDate: dutyDateOf(at),
    start: when,
    end: null,
    startSource: "employee-tap",
    endSource: null
  }, when, "create");
  next.jobDraft = job.jobLabel;
  next.jobConfirmed = true;
  return ok(next, { job });
}

export function stopInterval(state, at) {
  const next = prepare(state);
  const entry = openRecorded(next);
  if (!entry) return fail(state, "nothing-open");
  const when = iso(at);
  bump(next, entry, { end: when, endSource: "employee-tap", missedStop: false }, when, "edit");
  return ok(next);
}

export function switchOrInsert(state, { jobLabel, kind, at }) {
  const next = prepare(state);
  const job = jobRef(jobLabel);
  if (!job) return fail(state, "job-required");
  const when = iso(at);
  const open = openRecorded(next);
  if (open) bump(next, open, { end: when, endSource: "employee-tap" }, when, "edit");
  addEntry(next, {
    jobId: job.jobId,
    jobLabel: job.jobLabel,
    kind,
    status: "recorded",
    origin: "employee",
    dutyDate: dutyDateOf(at),
    start: when,
    end: null,
    startSource: "employee-tap",
    endSource: null
  }, when, "create");
  next.jobDraft = job.jobLabel;
  next.jobConfirmed = true;
  return ok(next, { job });
}

export function applyGeofenceEvent(state, event) {
  const dutyDate = dutyDateOf(event.occurredAt);
  const decision = assessGeofenceEvent({
    optIn: state.locationOptIn,
    armedDutyDate: state.armed && state.armed.dutyDate,
    eventDutyDate: dutyDate,
    accuracyMeters: event.accuracyMeters
  });
  if (decision.action === "ignore") return { ok: true, state, outcome: "ignored-off-duty" };
  const next = prepare(state);
  if (decision.action === "disarm") {
    next.armed = null;
    addAudit(next, { action: "disarm", at: iso(event.occurredAt), note: "Chicago day ended" });
    return { ok: true, state: next, outcome: "disarmed-off-duty" };
  }
  const pin = (next.pins || []).find((item) => item.jobId === event.jobId);
  const jobLabel = (pin && pin.jobLabel) || event.jobLabel;
  const job = jobRef(jobLabel);
  if (!job || job.jobId !== event.jobId) return { ok: true, state: next, outcome: "ignored-unknown-job" };
  const when = iso(event.occurredAt);
  if (event.transition === "enter") {
    const already = next.entries.some((entry) => {
      const row = latest(entry);
      return row.jobId === job.jobId && row.origin === "gps-suggestion" && row.status === "suggested" && !row.end;
    });
    if (already) return { ok: true, state: next, outcome: "duplicate-enter" };
    addEntry(next, {
      jobId: job.jobId,
      jobLabel: job.jobLabel,
      kind: "work",
      status: "suggested",
      origin: "gps-suggestion",
      dutyDate,
      start: when,
      end: null,
      startSource: "native-region-enter",
      endSource: null,
      lowAccuracy: decision.lowAccuracy
    }, when, "create");
    return { ok: true, state: next, outcome: "suggested" };
  }
  const open = next.entries.find((entry) => {
    const row = latest(entry);
    return row.jobId === job.jobId && row.origin === "gps-suggestion" && row.status === "suggested" && row.start && !row.end;
  });
  if (open) {
    bump(next, open, { end: when, endSource: "native-region-exit", lowAccuracy: latest(open).lowAccuracy || decision.lowAccuracy }, when, "edit");
    return { ok: true, state: next, outcome: "suggested-end" };
  }
  addEntry(next, {
    jobId: job.jobId,
    jobLabel: job.jobLabel,
    kind: "work",
    status: "suggested",
    origin: "gps-suggestion",
    dutyDate,
    start: null,
    end: when,
    startSource: null,
    endSource: "native-region-exit",
    missedContext: "exit-without-start",
    lowAccuracy: decision.lowAccuracy
  }, when, "create");
  return { ok: true, state: next, outcome: "exit-without-start" };
}

export function acceptSuggestion(state, entryId, at) {
  const next = prepare(state);
  const entry = next.entries.find((item) => item.entryId === entryId);
  if (!entry) return fail(state, "missing-entry");
  const row = latest(entry);
  if (row.status !== "suggested") return fail(state, "not-a-suggestion");
  if (!row.start || !row.end) return fail(state, "incomplete-suggestion");
  const when = iso(at);
  bump(next, entry, { status: "recorded" }, when, "accept-suggestion");
  return ok(next);
}

export function rejectSuggestion(state, entryId, reason, at) {
  const next = prepare(state);
  const entry = next.entries.find((item) => item.entryId === entryId);
  if (!entry) return fail(state, "missing-entry");
  if (!String(reason || "").trim()) return fail(state, "reason-required");
  const when = iso(at);
  bump(next, entry, { status: "void", voidReason: String(reason).slice(0, 200) }, when, "reject-suggestion");
  return ok(next);
}

export function editEntry(state, entryId, patch, at) {
  const next = prepare(state);
  const entry = next.entries.find((item) => item.entryId === entryId);
  if (!entry) return fail(state, "missing-entry");
  const row = latest(entry);
  if (row.status === "void") return fail(state, "void");
  const nextPatch = {};
  if (patch.jobLabel != null) {
    const job = jobRef(patch.jobLabel);
    if (!job) return fail(state, "job-required");
    nextPatch.jobId = job.jobId;
    nextPatch.jobLabel = job.jobLabel;
  }
  if (patch.kind != null) {
    if (!["work", "break", "travel"].includes(patch.kind)) return fail(state, "bad-kind");
    nextPatch.kind = patch.kind;
  }
  if (patch.workNote != null) {
    if (String(patch.workNote).length > 200) return fail(state, "note-too-long");
    nextPatch.workNote = String(patch.workNote);
  }
  if (patch.start != null) nextPatch.start = patch.start;
  if (patch.end != null) nextPatch.end = patch.end;
  const start = nextPatch.start !== undefined ? nextPatch.start : row.start;
  const end = nextPatch.end !== undefined ? nextPatch.end : row.end;
  if (start && end && new Date(end) < new Date(start)) return fail(state, "end-before-start");
  if (patch.end) {
    nextPatch.endSource = "employee-edit";
    nextPatch.missedStop = false;
  }
  if (patch.start) nextPatch.startSource = "employee-edit";
  const when = iso(at);
  bump(next, entry, nextPatch, when, "edit");
  return ok(next);
}

function rowsForDay(state, dutyDate) {
  return state.entries.map((entry) => ({ entry, row: latest(entry) })).filter((item) => item.row.dutyDate === dutyDate);
}

function overlaps(a, b) {
  if (!a.start || !a.end || !b.start || !b.end) return false;
  return new Date(a.start) < new Date(b.end) && new Date(b.start) < new Date(a.end);
}

export function reviewDay(state, dutyDate) {
  const items = rowsForDay(state, dutyDate);
  const active = items.filter((item) => item.row.status !== "void");
  const visits = active.filter((item) => item.row.kind === "work");
  const breaks = active.filter((item) => item.row.kind === "break");
  const travel = active.filter((item) => item.row.kind === "travel");
  const suggestions = active.filter((item) => item.row.status === "suggested");
  const missingEnd = active.filter((item) => item.row.status === "recorded" && (!item.row.start || !item.row.end));
  const recorded = active.filter((item) => item.row.status === "recorded" && item.row.start && item.row.end);
  const overlapPairs = [];
  for (let i = 0; i < recorded.length; i += 1) {
    for (let j = i + 1; j < recorded.length; j += 1) {
      if (overlaps(recorded[i].row, recorded[j].row)) overlapPairs.push([recorded[i], recorded[j]]);
    }
  }
  const blockers = [];
  if (suggestions.length) blockers.push("review-suggestions");
  if (missingEnd.length) blockers.push("missing-end");
  if (overlapPairs.length) blockers.push("overlap");
  return {
    dutyDate,
    visits,
    breaks,
    travel,
    suggestions,
    missingEnd,
    overlapPairs,
    noBreaksRecorded: breaks.length === 0,
    blockers,
    canConfirm: blockers.length === 0 && recorded.length > 0
  };
}

export function confirmDay(state, dutyDate, at) {
  const next = prepare(state);
  const review = reviewDay(next, dutyDate);
  if (!review.canConfirm) return fail(state, review.blockers[0] || "nothing-to-confirm");
  const when = iso(at);
  const entries = review.visits.concat(review.breaks, review.travel)
    .filter((item) => item.row.status === "recorded" && item.row.start && item.row.end)
    .map((item) => ({ entryId: item.entry.entryId, revision: item.row.revision }));
  next.confirmations.push({
    confirmationId: createId("confirm"),
    employeeId: next.employeeId,
    dutyDate,
    confirmedAt: when,
    worked: true,
    entries
  });
  addAudit(next, { action: "confirm-day", at: when, note: dutyDate });
  return ok(next);
}

export function confirmDidNotWork(state, dutyDate, at) {
  const next = prepare(state);
  const review = reviewDay(next, dutyDate);
  if (review.blockers.length) return fail(state, review.blockers[0]);
  const anyRecorded = review.visits.concat(review.breaks, review.travel).some((item) => item.row.status === "recorded");
  if (anyRecorded) return fail(state, "hours-exist");
  const when = iso(at);
  next.confirmations.push({
    confirmationId: createId("confirm"),
    employeeId: next.employeeId,
    dutyDate,
    confirmedAt: when,
    worked: false,
    entries: []
  });
  addAudit(next, { action: "confirm-no-work", at: when, note: dutyDate });
  return ok(next);
}

export function savePin(state, { jobLabel, latitude, longitude, accuracyMeters, at }) {
  const next = prepare(state);
  if (!next.locationOptIn) return fail(state, "opt-in-required");
  const job = jobRef(jobLabel);
  if (!job) return fail(state, "job-required");
  if (!(Number(accuracyMeters) <= 150)) return fail(state, "low-accuracy");
  next.pins = next.pins.filter((pin) => pin.jobId !== job.jobId);
  next.pins.push({
    pinId: createId("pin"),
    jobId: job.jobId,
    jobLabel: job.jobLabel,
    latitude: Number(latitude),
    longitude: Number(longitude),
    savedAt: iso(at || new Date())
  });
  addAudit(next, { action: "save-pin", at: iso(at || new Date()), note: job.jobLabel });
  return ok(next, { job });
}

export function deletePin(state, jobId, at) {
  const next = prepare(state);
  next.pins = next.pins.filter((pin) => pin.jobId !== jobId);
  addAudit(next, { action: "delete-pin", at: iso(at || new Date()), note: "removed a saved spot" });
  return ok(next);
}

export function markArmed(state, dutyDate, at) {
  const next = prepare(state);
  if (!next.locationOptIn) return fail(state, "opt-in-required");
  next.armed = { dutyDate, armedAt: iso(at) };
  return ok(next);
}

export function disarm(state, at, note = "turned off") {
  const next = prepare(state);
  next.armed = null;
  addAudit(next, { action: "disarm", at: iso(at || new Date()), note });
  return ok(next);
}
