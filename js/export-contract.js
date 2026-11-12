/** Employee-facing hours file. No wages, bids, margins, or raw GPS. */

import { elapsedMinutes, formatChicagoIso, isInPayWeek, reportWeek } from "./chicago-time.js";
import { stripCoordinates } from "./geofence-policy.js";
import { allocateTravel, billableMinutes } from "./pay-rules.js";

export const SCHEMA = "robinson-electrical.timecard.v1";

export const FORBIDDEN_KEYS = [
  "payRate", "wage", "wages", "loadedCost", "loadedLabor", "actualCost",
  "bidAmount", "bidPrice", "bid", "bids", "margin", "profit", "billingRate",
  "costRate", "hourlyCost", "markup", "labor100", "labor85", "syncToken",
  "accessToken", "refreshToken", "clientSecret", "password"
];

const FORBIDDEN = new Set(FORBIDDEN_KEYS);

export function findForbiddenKeys(value, path = "$", found = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, path + "[" + index + "]", found));
    return found;
  }
  if (!value || typeof value !== "object") return found;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN.has(key)) found.push(path + "." + key);
    else findForbiddenKeys(item, path + "." + key, found);
  }
  return found;
}

export function confirmationStateFor(entryId, revision, confirmations) {
  for (const confirmation of confirmations || []) {
    for (const ref of confirmation.entries || []) {
      if (ref.entryId === entryId && ref.revision === revision) return "confirmed";
    }
  }
  return "provisional";
}

function revisionRow(state, entry, revision, generatedAt) {
  const superseded = revision.revision !== entry.revisions[entry.revisions.length - 1].revision;
  return {
    entryId: entry.entryId,
    revision: revision.revision,
    superseded,
    employeeId: state.employeeId,
    employeeName: state.employeeName || "",
    jobId: revision.jobId,
    jobIdSource: "device-label-hash",
    jobLabel: revision.jobLabel,
    dutyDate: revision.dutyDate,
    kind: revision.kind,
    status: revision.status,
    confirmationState: revision.status === "void" || revision.status === "suggested"
      ? "provisional"
      : confirmationStateFor(entry.entryId, revision.revision, state.confirmations),
    start: revision.start,
    end: revision.end,
    elapsedMinutes: elapsedMinutes(revision.start, revision.end),
    origin: revision.origin,
    missedStop: !!revision.missedStop,
    overlap: !!revision.overlap,
    lowAccuracy: !!revision.lowAccuracy,
    missedContext: revision.missedContext || null,
    startSource: revision.startSource || null,
    endSource: revision.endSource || null,
    payTreatment: revision.kind === "break" ? "paid" : (revision.kind === "travel" ? "paid-to-next-job" : "paid"),
    workNote: revision.workNote || "",
    syncStatus: revision.syncStatus || "saved-on-phone",
    note: revision.note || "",
    voidReason: revision.voidReason || "",
    supersedesRevision: revision.revision > 1 ? revision.revision - 1 : null
  };
}

export function buildEmployeeExport(state, generatedAt = new Date()) {
  const when = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
  const entries = [];
  for (const entry of state.entries || []) {
    if (entry.employeeId && entry.employeeId !== state.employeeId) continue;
    for (const revision of entry.revisions || []) entries.push(revisionRow(state, entry, revision, when));
  }
  const confirmations = (state.confirmations || [])
    .filter((item) => !item.employeeId || item.employeeId === state.employeeId)
    .map((item) => ({
      confirmationId: item.confirmationId,
      employeeId: state.employeeId,
      dutyDate: item.dutyDate,
      confirmedAt: item.confirmedAt,
      worked: item.worked !== false,
      entries: item.entries || []
    }));
  const audit = (state.audit || [])
    .filter((item) => !item.employeeId || item.employeeId === state.employeeId)
    .map((item) => ({
      auditId: item.auditId,
      employeeId: state.employeeId,
      entryId: item.entryId || null,
      revision: item.revision ?? null,
      at: item.at,
      action: item.action,
      note: item.note || ""
    }));
  const week = reportWeek(when);
  const inWeek = [];
  const outsidePayWeek = [];
  for (const row of entries) {
    if (isInPayWeek(row.dutyDate, week)) inWeek.push(row);
    else outsidePayWeek.push(row);
  }
  applyTravel(inWeek);
  applyTravel(outsidePayWeek);
  const doc = {
    schema: SCHEMA,
    audience: "employee-self",
    exportId: "export_" + formatChicagoIso(when).replace(/[^\d]/g, "").slice(0, 14),
    generatedAt: formatChicagoIso(when),
    timezone: "America/Chicago",
    weekStartRule: "monday-saturday",
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    sendOn: week.sendOn,
    company: "Robinson Electrical LLC",
    payTreatment: { work: "paid", break: "paid", travel: "paid-to-next-job" },
    breaksIncludedInConfirmedHours: true,
    breaksSubtracted: false,
    emailDelivery: "not-enabled",
    rawCoordinatesIncluded: false,
    employeeId: state.employeeId,
    employeeName: state.employeeName || "",
    entries: inWeek,
    outsidePayWeek,
    confirmations: confirmations.filter((item) => isInPayWeek(item.dutyDate, week)),
    audit
  };
  return stripCoordinates(doc);
}

function applyTravel(rows) {
  const latest = rows.filter((row) => !row.superseded);
  const byDay = new Map();
  for (const row of latest) {
    if (!byDay.has(row.dutyDate)) byDay.set(row.dutyDate, []);
    byDay.get(row.dutyDate).push(row);
  }
  for (const dayRows of byDay.values()) {
    const allocation = allocateTravel(dayRows);
    for (const row of dayRows) {
      const travel = allocation.get(row.entryId) || {
        travelMinutes: 0,
        travelFromJobId: null,
        travelFromJobLabel: "",
        onSiteStart: row.start,
        intervalStart: row.start
      };
      row.travelMinutes = travel.travelMinutes;
      row.travelFromJobId = travel.travelFromJobId;
      row.travelFromJobLabel = travel.travelFromJobLabel;
      row.onSiteStart = travel.onSiteStart;
      row.intervalStart = travel.intervalStart;
      row.billableMinutes = billableMinutes(row);
    }
  }
}

export function confirmedCurrentIntervals(doc) {
  return (doc.entries || []).filter((row) => (
    row.confirmationState === "confirmed" &&
    row.superseded === false &&
    row.status === "recorded" &&
    row.start &&
    row.end
  ));
}

/** Paid breaks are added. They are not taken back out of the work time. */
export function confirmedPaidMinutes(doc) {
  return confirmedCurrentIntervals(doc).reduce((total, row) => total + (Number(row.billableMinutes) || 0), 0);
}

export function toCsv(doc) {
  const columns = [
    "entry_id", "revision", "superseded", "employee_id", "employee_name", "job_id",
    "job_id_source", "job_label", "duty_date", "kind", "status", "confirmation_state",
    "start", "end", "elapsed_minutes", "origin", "missed_stop", "overlap", "low_accuracy",
    "start_source", "end_source", "pay_treatment", "work_note", "sync_status",
    "travel_minutes", "travel_from_job_id", "on_site_start", "interval_start", "billable_minutes"
  ];
  const lines = [columns.join(",")];
  for (const row of doc.entries || []) {
    const values = [
      row.entryId, row.revision, row.superseded, row.employeeId, row.employeeName, row.jobId,
      row.jobIdSource, row.jobLabel, row.dutyDate, row.kind, row.status, row.confirmationState,
      row.start || "", row.end || "", row.elapsedMinutes ?? "", row.origin, row.missedStop,
      row.overlap, row.lowAccuracy, row.startSource || "", row.endSource || "", row.payTreatment,
      row.workNote || "", row.syncStatus || "saved-on-phone", row.travelMinutes ?? "",
      row.travelFromJobId || "", row.onSiteStart || "", row.intervalStart || "", row.billableMinutes ?? ""
    ];
    lines.push(values.map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}

export function readableLines(doc) {
  const lines = [
    "Robinson Electrical time record",
    "This file is one person's hours. It is not emailed automatically.",
    "Pay week: Monday through Saturday. This report is for " + (doc.weekStart || "") + " through " + (doc.weekEnd || "") + ".",
    "It is meant to be sent on Sunday " + (doc.sendOn || "") + ". Sunday email is not turned on.",
    "Breaks are paid and are included. They are not subtracted.",
    "Travel between jobs is included on the next job. The drive to the first job and the drive home are not included.",
    "Confirmed and provisional hours are marked. Provisional hours are not approved time.",
    "Times are America/Chicago.",
    ""
  ];
  if (!doc.entries.length) lines.push("No intervals on this phone.");
  for (const row of doc.entries) {
    if (row.superseded) continue;
    const stateLabel = row.confirmationState === "confirmed" ? "Confirmed" : "Provisional";
    lines.push(stateLabel + " — " + (row.jobLabel || "Job") + " — " + row.kind + " — " + row.dutyDate);
    lines.push("  " + (row.start || "start not set") + " to " + (row.end || "end not set"));
    if (row.status === "suggested") lines.push("  Suggested from a job-site alert. Not hours until you accept and confirm the day.");
    if (row.status === "void") lines.push("  Removed" + (row.voidReason ? ": " + row.voidReason : ""));
    if (row.lowAccuracy) lines.push("  Location was coarse or unavailable. The job still needs your review.");
    if (row.overlap) lines.push("  Overlaps another interval. Fix it before confirming.");
    if (row.missedStop) lines.push("  End time was missed. It is still open.");
    if (row.travelMinutes) lines.push("  Travel: " + row.travelMinutes + " min from " + (row.travelFromJobLabel || "the previous job") + ", added to this job.");
    if (row.kind === "break") lines.push("  Paid break. Included in the day's hours.");
    if (row.workNote) lines.push("  Work note: " + row.workNote);
    lines.push("  Copy: " + (row.syncStatus === "uploaded" ? "Uploaded" : "Saved on this phone, not uploaded"));
    lines.push("");
  }
  for (const confirmation of doc.confirmations || []) {
    if (confirmation.worked === false) lines.push("Confirmed no work on " + confirmation.dutyDate + ".");
  }
  return lines;
}
