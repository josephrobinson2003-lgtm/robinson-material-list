/** Vacation PTO for one employee. Paid holidays are a separate hour total.
 * Allowance and the anniversary live on that employee's record. A missing
 * policy is not filled in from anyone else's dates. */

import { createId } from "./ids.js";

export const DAY_HOURS = 8;
export const DEFAULT_ALLOWANCE_HOURS = 120;
export const DEFAULT_HOLIDAY_HOURS = 56;
export const DEFAULT_RENEWAL_DATE = "2025-10-27";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatPtoDay(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!match) return "";
  return MONTHS[Number(match[2]) - 1] + " " + Number(match[3]) + ", " + match[1];
}

export function unsetPtoPolicy() {
  return {
    configured: false,
    allowanceHours: null,
    holidayHours: null,
    dayHours: DAY_HOURS,
    renewalDate: "",
    renewalDateSet: false,
    renewalPlaceholder: "PTO not set up yet, ask Joe"
  };
}

export function defaultPtoPolicy() {
  return unsetPtoPolicy();
}

export function normalizePolicy(raw) {
  if (!raw || raw.configured === false) return unsetPtoPolicy();
  const allowance = Number(raw.allowanceHours);
  const holidays = Number(raw.holidayHours);
  const renewal = String(raw.renewalDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(renewal) || !Number.isFinite(allowance) || allowance <= 0) return unsetPtoPolicy();
  return {
    configured: true,
    allowanceHours: allowance,
    holidayHours: Number.isFinite(holidays) && holidays >= 0 ? holidays : 0,
    dayHours: DAY_HOURS,
    renewalDate: renewal,
    renewalDateSet: true,
    renewalPlaceholder: ""
  };
}

export function forgetEmployeeSession(state) {
  const next = state ? Object.assign({}, state) : {};
  next.entries = [];
  next.confirmations = [];
  next.queue = [];
  next.audit = [];
  next.ptoRequests = [];
  next.ptoPolicy = unsetPtoPolicy();
  return next;
}

export function ptoYearWindow(renewalDate, asOf) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(renewalDate || "") || !/^\d{4}-\d{2}-\d{2}$/.test(asOf || "")) return null;
  if (asOf < renewalDate) return null;
  const monthDay = renewalDate.slice(5);
  let year = Number(asOf.slice(0, 4));
  let start = year + "-" + monthDay;
  if (start > asOf) start = (year - 1) + "-" + monthDay;
  if (start < renewalDate) start = renewalDate;
  return { start, end: addYear(start) };
}

function addYear(dutyDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dutyDate || "");
  if (!match) return "";
  const dt = new Date(Date.UTC(Number(match[1]) + 1, Number(match[2]) - 1, Number(match[3])));
  return dt.toISOString().slice(0, 10);
}

export function activeHours(requests, window) {
  return (requests || []).reduce((sum, row) => {
    if (!row || row.status === "cancelled") return sum;
    if (window && (row.date < window.start || row.date >= window.end)) return sum;
    const hours = Number(row.hours);
    return sum + (Number.isFinite(hours) ? hours : 0);
  }, 0);
}

export function summarizePto(requests, policy, asOf) {
  const rules = normalizePolicy(policy);
  const window = rules.configured ? ptoYearWindow(rules.renewalDate, asOf) : null;
  const used = window ? activeHours(requests, window) : null;
  const remaining = used == null ? null : Math.round((rules.allowanceHours - used) * 100) / 100;
  return {
    configured: rules.configured,
    allowanceHours: rules.allowanceHours,
    allowanceDays: rules.configured ? rules.allowanceHours / DAY_HOURS : null,
    holidayHours: rules.holidayHours,
    dayHours: DAY_HOURS,
    renewalDate: rules.renewalDate,
    renewalDateSet: rules.renewalDateSet,
    renewalPlaceholder: rules.renewalPlaceholder,
    yearStart: window ? window.start : "",
    yearEnd: window ? window.end : "",
    usedHours: used,
    remainingHours: remaining,
    remainingDays: remaining == null ? null : Math.round((remaining / DAY_HOURS) * 100) / 100
  };
}

export function validHours(hours) {
  const value = Number(hours);
  if (!Number.isFinite(value) || value < 0.5 || value > DAY_HOURS) return false;
  return Math.round(value * 2) === value * 2;
}

export function schedulePtoRequest(requests, input, today) {
  const date = String((input && input.date) || "");
  const hours = Number(input && input.hours);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, reason: "date-required", requests };
  if (date < today) return { ok: false, reason: "past-date", requests };
  if (!validHours(hours)) return { ok: false, reason: "hours", requests };
  const rows = (requests || []).slice();
  const clash = rows.some((row) => row && row.status !== "cancelled" && row.date === date);
  if (clash) return { ok: false, reason: "already-scheduled", requests: rows };
  const request = {
    requestId: (input && input.requestId) || createId("pto"),
    date,
    hours,
    status: "scheduled",
    syncStatus: "saved-on-phone",
    calendarEventId: "",
    createdAt: (input && input.createdAt) || new Date().toISOString(),
    cancelledAt: ""
  };
  rows.push(request);
  return { ok: true, requests: rows, request };
}

export function cancelPtoRequest(requests, requestId, today) {
  const rows = (requests || []).map((row) => Object.assign({}, row));
  const found = rows.find((row) => row.requestId === requestId);
  if (!found || found.status === "cancelled") return { ok: false, reason: "not-found", requests };
  if (found.date < today) return { ok: false, reason: "past-date", requests };
  found.status = "cancelled";
  found.cancelledAt = new Date().toISOString();
  found.syncStatus = "saved-on-phone";
  return { ok: true, requests: rows, request: found };
}

export function mergePtoRequests(local, remote) {
  const pending = (local || []).filter((row) => row && row.syncStatus !== "uploaded");
  const remoteIds = new Set((remote || []).map((row) => row.requestId));
  const kept = pending.filter((row) => !remoteIds.has(row.requestId));
  const synced = (remote || []).map((row) => Object.assign({}, row, { syncStatus: "uploaded" }));
  return synced.concat(kept);
}
