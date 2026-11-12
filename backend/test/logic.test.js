import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import { payWeekContaining, reportWeek } from "../../js/chicago-time.js";

function loadLogic() {
  const code = readFileSync(new URL("../apps-script/Logic.js", import.meta.url), "utf8");
  const context = {
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
      computeDigest(_alg, text) {
        return Array.from(crypto.createHash("sha256").update(String(text), "utf8").digest()).map((byte) => (byte > 127 ? byte - 256 : byte));
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

const logic = loadLogic();

function memoryDeps(seed) {
  const data = {
    employees: seed.employees || [],
    timecards: seed.timecards || [],
    materials: seed.materials || [],
    graphCalls: []
  };
  return {
    data,
    employees() { return data.employees; },
    listTimecards() { return data.timecards; },
    saveTimecards(employeeId, dutyDate, rows) {
      data.timecards = data.timecards.filter((row) => !(row.employeeId === employeeId && row.dutyDate === dutyDate)).concat(rows);
    },
    listMaterials() { return data.materials; },
    saveMaterial(row) { data.materials.push(row); },
    graphConfigured() { return !!seed.graph; },
    graphList(path) { data.graphCalls.push(path); return [{ id: "1", name: "sample" }]; },
    graphGet(id, size) { data.graphCalls.push(id + ":" + size); return { id, size }; },
    graphUpload(path) { data.graphCalls.push(path); return { ok: true }; }
  };
}

test("token hashes do not keep the plaintext token", () => {
  const added = logic.addEmployeeRecord([], "Jarred", "jarred-token-123456");
  assert.equal(added.ok, true);
  assert.equal(JSON.stringify(added.directory).includes("jarred-token-123456"), false);
  assert.equal(added.directory[0].tokenHash, logic.hashToken("jarred-token-123456"));
  assert.equal(logic.findEmployee(added.directory, "jarred-token-123456").name, "Jarred");
  const revoked = logic.revokeEmployee(added.directory, added.employee.employeeId);
  assert.equal(logic.findEmployee(revoked.directory, "jarred-token-123456"), null);
  assert.equal(logic.publicEmployees(revoked.directory)[0].tokenHash, undefined);
});

test("backend week matches the phone Monday-Saturday week", () => {
  assert.deepEqual(
    { start: logic.payWeekContaining("2026-11-11").weekStart, end: logic.payWeekContaining("2026-11-11").weekEnd },
    { start: payWeekContaining("2026-11-11").weekStart, end: payWeekContaining("2026-11-11").weekEnd }
  );
  const sunday = logic.reportWeek(new Date("2026-11-15T18:00:00Z"));
  const phone = reportWeek(new Date("2026-11-15T18:00:00Z"));
  assert.equal(sunday.weekStart, phone.weekStart);
  assert.equal(sunday.weekEnd, "2026-11-14");
  assert.equal(logic.subjectForWeek(sunday), "Robinson Electrical Weekly Timecards 2026-11-09 to 2026-11-14");
  assert.equal(logic.payWeekContaining("2026-03-11").weekStart, "2026-03-09");
});

test("weekly csv has hours and travel and no wages or gps", () => {
  const week = logic.payWeekContaining("2026-11-11");
  const packets = logic.weeklyPackets([
    { employeeId: "emp_a", employeeName: "Ada", dutyDate: "2026-11-11", jobId: "job_1", jobLabel: "123 Main", kind: "work", start: "a", end: "b", elapsedMinutes: 60, travelMinutes: 15, travelFromJobId: "job_0", billableMinutes: 75, confirmedAt: "t", entryId: "e", revision: 1, workNote: "" },
    { employeeId: "emp_b", employeeName: "Bea", dutyDate: "2026-11-12", jobId: "job_2", jobLabel: "45 Oak", kind: "work", start: "a", end: "b", elapsedMinutes: 10, travelMinutes: 0, travelFromJobId: "", billableMinutes: 10, confirmedAt: "t", entryId: "s", revision: 1, workNote: "" },
    { employeeId: "emp_b", employeeName: "Bea", dutyDate: "2026-11-08", jobId: "job_9", jobLabel: "Sunday", kind: "work", start: "a", end: "b", elapsedMinutes: 10, travelMinutes: 0, travelFromJobId: "", billableMinutes: 10, confirmedAt: "t", entryId: "sun", revision: 1, workNote: "" }
  ], week);
  assert.equal(packets.files.length, 3);
  assert.match(packets.files[2].csv, /travelMinutes/);
  assert.match(packets.files[2].csv, /123 Main/);
  assert.equal(packets.files[2].csv.includes("Sunday"), false);
  assert.equal(packets.files[2].csv.includes("payRate"), false);
  assert.equal(packets.files[2].csv.includes("latitude"), false);
  assert.equal(logic.TIMECARD_HEADERS.includes("latitude"), false);
});

test("confirmed days are isolated and provisional rows are dropped", () => {
  const added = logic.addEmployeeRecord([], "Ada", "ada-token-12345678");
  const deps = memoryDeps({ employees: added.directory });
  const denied = logic.handleRequest({
    method: "POST",
    path: "/api/timecards/confirm",
    token: "ada-token-12345678",
    body: { employeeId: "someone-else", dutyDate: "2026-11-11", entries: [] }
  }, deps);
  assert.equal(denied.status, 403);
  const saved = logic.handleRequest({
    method: "POST",
    path: "/api/timecards/confirm",
    token: "ada-token-12345678",
    body: {
      dutyDate: "2026-11-11",
      confirmedAt: "2026-11-11T22:00:00Z",
      entries: [
        { confirmationState: "confirmed", status: "recorded", jobId: "job_1", jobLabel: "123 Main", kind: "work", start: "2026-11-11T14:00:00Z", end: "2026-11-11T16:00:00Z", travelMinutes: 0, entryId: "e1", revision: 1 },
        { confirmationState: "provisional", status: "suggested", jobId: "job_2", jobLabel: "Guess", kind: "work", start: "2026-11-11T16:00:00Z", end: "2026-11-11T17:00:00Z", entryId: "e2", revision: 1 }
      ]
    }
  }, deps);
  assert.equal(saved.saved, 1);
  assert.equal(deps.data.timecards[0].employeeId, added.employee.employeeId);
  const other = logic.addEmployeeRecord(added.directory, "Bea", "bea-token-12345678");
  deps.data.employees = other.directory;
  deps.data.timecards.push({ employeeId: other.employee.employeeId, dutyDate: "2026-11-11", confirmationState: "confirmed", start: "a", end: "b" });
  const list = logic.handleRequest({ method: "POST", path: "/api/timecards", token: "ada-token-12345678", body: {} }, deps);
  assert.equal(list.entries.length, 1);
  assert.equal(list.entries[0].employeeId, added.employee.employeeId);
  const cleaned = logic.cleanupProvisional(deps.data.timecards.concat([{ confirmationState: "provisional" }]));
  assert.equal(cleaned.removed >= 1, true);
  const money = logic.handleRequest({
    method: "POST",
    path: "/api/timecards/confirm",
    token: "ada-token-12345678",
    body: { dutyDate: "2026-11-12", entries: [], latitude: 1 }
  }, deps);
  assert.equal(money.status, 400);
});

test("material save drops billing rates and photo paths cannot leave Job Photos", () => {
  const added = logic.addEmployeeRecord([], "Ada", "ada-token-12345678");
  const deps = memoryDeps({ employees: added.directory, graph: true });
  const material = logic.handleRequest({
    method: "POST",
    path: "/api/materials",
    token: "ada-token-12345678",
    body: { listId: "L1", address: "123 Main", labor100: 2, items: [{ name: "Box", qty: 1, unit: "ea" }] }
  }, deps);
  assert.equal(material.status, 202);
  assert.equal(deps.data.materials[0].itemsJson.includes("labor100"), false);
  assert.equal(deps.data.materials[0].labor100, undefined);
  const blocked = logic.handleRequest({
    method: "POST",
    path: "/api/job-photos/contractors/..%2FAccounting/jobs/123/stages/rough-in",
    token: "ada-token-12345678",
    body: { dateStamp: "2026-11-11", uniqueId: "abc12345", fileName: "../../Accounting/secret.jpg" }
  }, deps);
  assert.equal(blocked.status, 403);
  assert.equal(deps.data.graphCalls.length, 0);
  const named = logic.handleRequest({
    method: "POST",
    path: "/api/job-photos/contractors/BluSky/jobs/123%20Main%20St/stages/rough-in",
    token: "ada-token-12345678",
    body: { dateStamp: "2026-11-01", uniqueId: "abc12345", fileName: "../../Accounting/secret.jpg" }
  }, deps);
  assert.equal(named.status, 202);
  assert.equal(named.fileName, "123 Main St - Rough-In - 2026-11-01 - abc12345.jpg");
  assert.equal(named.path.startsWith("Job Photos/BluSky/123 Main St/Rough-In/"), true);
  assert.equal(deps.data.graphCalls[0], named.path);
  const offline = logic.handleRequest({
    method: "POST",
    path: "/api/job-photos/contractors",
    token: "ada-token-12345678",
    body: {}
  }, memoryDeps({ employees: added.directory, graph: false }));
  assert.equal(offline.status, 503);
  assert.equal(logic.handleRequest({ method: "DELETE", path: "/api/job-photos/photos/1", token: "ada-token-12345678", body: {} }, deps).status, 403);
});
