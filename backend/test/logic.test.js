import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import { payWeekContaining, reportWeek } from "../../js/chicago-time.js";
import { jobIdForLabel } from "../../js/ids.js";

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

test("scope tasks lose prices and employees never receive coordinates", () => {
  const added = logic.addEmployeeRecord([], "Ada", "ada-token-12345678");
  const messy = [
    "Install receptacles in the kitchen",
    "Subtotal $1,250.00",
    "Wire the kitchen $45.00 each",
    "Total",
    "Markup 20%",
    "Tax",
    "Price: $10",
    "Labor rate $85/hr",
    "Labor hours 4",
    "Mount the panel"
  ];
  const tasks = logic.sanitizeScopeTasks(messy);
  assert.equal(JSON.stringify(tasks), JSON.stringify(["Install receptacles in the kitchen", "Wire the kitchen each", "Mount the panel"]));
  assert.equal(JSON.stringify(tasks).includes("$"), false);
  const built = logic.buildScopeRecord({ address: "123 Main St", contractor: "BluSky", tasks: messy }, { lat: 38.63, lng: -90.2 });
  assert.equal(built.record.jobId, jobIdForLabel("123 Main St"));
  assert.equal(built.publicView.lat, undefined);
  assert.equal(JSON.stringify(built.publicView).includes("$"), false);
  const deps = memoryDeps({ employees: added.directory });
  deps.adminKeyOk = (key) => key === "admin-secret";
  deps.geocode = () => ({ lat: 38.63, lng: -90.2 });
  deps.saveScope = (record) => { deps.data.scopes = [record]; };
  deps.listScopes = () => deps.data.scopes || [];
  const denied = logic.handleRequest({
    method: "POST", path: "/api/scope/upsert", token: "ada-token-12345678",
    body: { address: "123 Main St", tasks: messy }
  }, deps);
  assert.equal(denied.status, 403);
  const saved = logic.handleRequest({
    method: "POST", path: "/api/scope/upsert", token: "",
    body: { adminKey: "admin-secret", address: "123 Main St", contractor: "BluSky", tasks: messy.join("\n") }
  }, deps);
  assert.equal(saved.status, 200);
  assert.equal(saved.scope.tasks.length, 3);
  assert.equal(Object.keys(saved.scope).sort().join(","), "address,jobId,tasks");
  const lookup = logic.handleRequest({
    method: "POST", path: "/api/scope", token: "ada-token-12345678",
    body: { lat: 38.6302, lng: -90.2001, accuracyMeters: 20 }
  }, deps);
  assert.equal(lookup.scope.address, "123 Main St");
  assert.equal(lookup.scope.lat, undefined);
  assert.equal(JSON.stringify(lookup).includes("38.63"), false);
  const fuzzy = logic.handleRequest({
    method: "POST", path: "/api/scope", token: "ada-token-12345678",
    body: { lat: 38.63, lng: -90.2, accuracyMeters: 400 }
  }, deps);
  assert.equal(fuzzy.scope, null);
  assert.equal(fuzzy.reason, "low-accuracy");
  const byId = logic.handleRequest({
    method: "POST", path: "/api/scope", token: "ada-token-12345678",
    body: { jobId: built.record.jobId }
  }, deps);
  assert.equal(byId.scope.jobId, built.record.jobId);
});

test("theme override is a name, auto, or off and is public", () => {
  assert.equal(logic.publicTheme(""), "auto");
  assert.equal(logic.publicTheme("auto"), "auto");
  assert.equal(logic.publicTheme("off"), "off");
  assert.equal(logic.publicTheme("Thanksgiving"), "thanksgiving");
  assert.equal(logic.publicTheme("groundhog"), "groundhog");
  assert.equal(logic.publicTheme("mothers-day"), "mothers-day");
  assert.equal(logic.publicTheme("fathers-day"), "fathers-day");
  assert.equal(logic.publicTheme("arbor-day"), "arbor-day");
  assert.equal(logic.publicTheme("earth-day"), "earth-day");
  assert.equal(logic.publicTheme("payroll"), "auto");
  const deps = memoryDeps({ employees: [] });
  deps.theme = () => "thanksgiving";
  const health = logic.handleRequest({ method: "GET", path: "/api/health", body: {} }, deps);
  assert.equal(health.ok, true);
  assert.equal(health.theme, "thanksgiving");
  assert.equal(JSON.stringify(health).includes("payroll"), false);
  deps.theme = () => "wages";
  const theme = logic.handleRequest({ method: "GET", path: "/api/theme" }, deps);
  assert.equal(theme.status, 200);
  assert.equal(theme.theme, "auto");
  deps.theme = () => "off";
  assert.equal(logic.handleRequest({ method: "POST", path: "/api/health", body: {} }, deps).theme, "off");
  assert.equal(logic.publicTheme("fall"), "fall");
  assert.equal(logic.publicTheme("winter"), "winter");
  assert.equal(logic.publicTheme("happy-holidays"), "happy-holidays");
  assert.equal(logic.publicTheme("subtle-easter"), "subtle-easter");
});

test("pto balance counts scheduled hours and keeps holiday hours separate", () => {
  const policy = logic.ptoPolicyFromProps({ allowanceHours: "120", holidayHours: "56", renewalDate: "2026-01-15" });
  const rows = [
    { employeeId: "emp_j", date: "2026-04-02", hours: 8, status: "scheduled" },
    { employeeId: "emp_j", date: "2026-05-04", hours: 4, status: "scheduled" },
    { employeeId: "emp_j", date: "2026-06-01", hours: 8, status: "cancelled" },
    { employeeId: "emp_j", date: "2025-12-01", hours: 8, status: "scheduled" },
    { employeeId: "emp_other", date: "2026-04-02", hours: 8, status: "scheduled" }
  ];
  const balance = logic.ptoBalance(rows, "emp_j", policy, "2026-06-15");
  assert.equal(balance.usedHours, 12);
  assert.equal(balance.remainingHours, 108);
  assert.equal(balance.remainingDays, 13.5);
  assert.equal(balance.holidayHours, 56);
  assert.equal(balance.allowanceHours, 120);
  assert.equal(balance.renewalDate, "2026-01-15");
  const blank = logic.ptoBalance([], "emp_j", logic.ptoPolicyFromProps({}), "2026-11-19");
  assert.equal(blank.renewalDate, "2025-10-27");
  assert.equal(blank.yearStart, "2026-10-27");
  assert.equal(blank.yearEnd, "2027-10-27");
  assert.equal(blank.usedHours, 0);
  assert.equal(blank.remainingHours, 120);
  const before = logic.ptoBalance([
    { employeeId: "emp_j", date: "2026-10-26", hours: 8, status: "scheduled" }
  ], "emp_j", logic.ptoPolicyFromProps({}), "2026-10-26");
  assert.equal(before.yearStart, "2025-10-27");
  assert.equal(before.usedHours, 8);
  const rolled = logic.ptoBalance([
    { employeeId: "emp_j", date: "2026-10-26", hours: 8, status: "scheduled" },
    { employeeId: "emp_j", date: "2026-10-27", hours: 4, status: "scheduled" }
  ], "emp_j", logic.ptoPolicyFromProps({}), "2026-10-27");
  assert.equal(rolled.yearStart, "2026-10-27");
  assert.equal(rolled.yearEnd, "2027-10-27");
  assert.equal(rolled.usedHours, 4);
  const override = logic.ptoPolicyFromProps({ renewalDate: "2024-03-01" });
  assert.equal(override.renewalDate, "2024-03-01");
});

test("scheduling and cancelling PTO stays on one employee and writes no wages", () => {
  const directory = logic.addEmployeeRecord([], "Jarred", "jarred-token-123456");
  const both = logic.addEmployeeRecord(directory.directory, "Joe", "joe-token-123456789");
  const data = { rows: [], events: [], deleted: [], mail: [] };
  const deps = {
    employees: () => both.directory,
    ptoPolicy: () => ({ allowanceHours: 120, holidayHours: 56, renewalDate: "2026-01-15" }),
    today: () => "2026-03-10",
    listPto: () => data.rows,
    savePto: (rows) => { data.rows = rows; },
    createPtoEvent: (spec) => { data.events.push(spec); return "evt-" + data.events.length; },
    deletePtoEvent: (id) => { data.deleted.push(id); },
    notifyOwner: (notice) => { data.mail.push(notice); }
  };
  const scheduled = logic.handleRequest({
    method: "POST", path: "/api/pto/schedule", token: "jarred-token-123456",
    body: { requestId: "pto_1", date: "2026-04-02", hours: 8 }
  }, deps);
  assert.equal(scheduled.acknowledged, true);
  assert.equal(data.events[0].title, "Jarred's time scheduled off");
  assert.equal(data.events[0].allDay, true);
  assert.equal(JSON.stringify(data.events[0]).includes("wage"), false);
  assert.equal(JSON.stringify(data.events[0]).includes("$"), false);
  assert.equal(data.mail.length, 0);
  const soon = logic.handleRequest({
    method: "POST", path: "/api/pto/schedule", token: "jarred-token-123456",
    body: { requestId: "pto_2", date: "2026-03-12", hours: 4 }
  }, deps);
  assert.equal(soon.acknowledged, true);
  assert.equal(data.events[1].allDay, false);
  assert.equal(data.mail.length, 1);
  assert.equal(data.mail[0].to, "RobinsonElectricalLlc@gmail.com");
  assert.equal(data.mail[0].subject, "Jarred's time scheduled off");
  assert.equal(JSON.stringify(data.mail[0]).includes("wage"), false);
  const listed = logic.handleRequest({ method: "POST", path: "/api/pto", token: "joe-token-123456789", body: {} }, deps);
  assert.equal(listed.requests.length, 0);
  const jarred = logic.handleRequest({ method: "POST", path: "/api/pto", token: "jarred-token-123456", body: {} }, deps);
  assert.equal(jarred.requests.length, 2);
  assert.equal(jarred.balance.usedHours, 12);
  const blocked = logic.handleRequest({
    method: "POST", path: "/api/pto/cancel", token: "joe-token-123456789", body: { requestId: "pto_1" }
  }, deps);
  assert.equal(blocked.status, 400);
  const cancelled = logic.handleRequest({
    method: "POST", path: "/api/pto/cancel", token: "jarred-token-123456", body: { requestId: "pto_1" }
  }, deps);
  assert.equal(cancelled.acknowledged, true);
  assert.deepEqual(data.deleted, ["evt-1"]);
  const past = logic.handleRequest({
    method: "POST", path: "/api/pto/schedule", token: "jarred-token-123456",
    body: { requestId: "pto_3", date: "2026-03-01", hours: 8 }
  }, deps);
  assert.equal(past.status, 400);
});
