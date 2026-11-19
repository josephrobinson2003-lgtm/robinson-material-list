/** Server-side isolation. The public page must not be treated as this server.
 * Calling these functions in Node tests does not mean a backend is deployed. */

import { FORBIDDEN_KEYS, buildEmployeeExport, confirmedCurrentIntervals } from "./export-contract.js";
import { stripCoordinates } from "./geofence-policy.js";

const FORBIDDEN = new Set(FORBIDDEN_KEYS);

function identityFor(token, directory) {
  if (!token || !directory) return null;
  const record = directory[token];
  if (!record) return null;
  if (typeof record === "string") return { employeeId: record, role: "employee" };
  return record;
}

export function handleEmployeeRead({ token, tokenDirectory, records, requestedEmployeeId, scope }) {
  const identity = identityFor(token, tokenDirectory);
  if (!identity || !identity.employeeId) return { status: 401, error: "unauthenticated" };
  if (identity.role === "owner" && scope !== "self") return { status: 403, error: "employee-isolation" };
  if (scope === "owner" || scope === "company" || scope === "all") return { status: 403, error: "employee-isolation" };
  if (requestedEmployeeId && requestedEmployeeId !== identity.employeeId) return { status: 403, error: "employee-isolation" };
  const mine = (records || []).filter((row) => row && row.employeeId === identity.employeeId);
  return { status: 200, body: { entries: mine.map((row) => stripRecord(row)) } };
}

export function handleEmployeeWrite({ token, tokenDirectory, body }) {
  const identity = identityFor(token, tokenDirectory);
  if (!identity || !identity.employeeId) return { status: 401, error: "unauthenticated" };
  if (!body || body.employeeId !== identity.employeeId) return { status: 403, error: "employee-isolation" };
  if (body.scope === "owner" || body.scope === "company" || body.scope === "all") {
    return { status: 403, error: "employee-isolation" };
  }
  const forbidden = findKeys(body);
  if (forbidden.length) return { status: 400, error: "financial-data-rejected", keys: forbidden };
  return { status: 202, record: stripRecord(body) };
}

/** Owner rollup for a future private server. Not callable from an employee token.
 * Still excludes wages, bids, and raw coordinates. Costing stays in OneDrive. */
export function handleOwnerExport({ token, tokenDirectory, records }) {
  const identity = identityFor(token, tokenDirectory);
  if (!identity) return { status: 401, error: "unauthenticated" };
  if (identity.role !== "owner") return { status: 403, error: "owner-only" };
  const people = new Map();
  for (const state of records || []) {
    if (!state || !state.employeeId) continue;
    const doc = buildEmployeeExport(state);
    const current = confirmedCurrentIntervals(doc);
    people.set(state.employeeId, {
      employeeId: state.employeeId,
      employeeName: state.employeeName || "",
      confirmedIntervals: current,
      provisionalCount: (doc.entries || []).filter((row) => !row.superseded && row.confirmationState === "provisional").length
    });
  }
  return {
    status: 200,
    body: stripRecord({
      schema: "robinson-electrical.owner-hours.v1",
      audience: "owner",
      emailDelivery: "not-enabled",
      rawCoordinatesIncluded: false,
      financialDataIncluded: false,
      people: Array.from(people.values())
    })
  };
}

function findKeys(value, found = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => findKeys(item, found));
    return found;
  }
  if (!value || typeof value !== "object") return found;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN.has(key)) found.push(key);
    else findKeys(item, found);
  }
  return found;
}

function stripRecord(value) {
  if (Array.isArray(value)) return value.map(stripRecord);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN.has(key)) continue;
    out[key] = stripRecord(item);
  }
  return stripCoordinates(out);
}
