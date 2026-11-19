/** Pure rules for the company Apps Script. No sheet, mail, or Microsoft calls. */

var TIMECARD_HEADERS = [
  "employeeId", "employeeName", "dutyDate", "jobId", "jobLabel", "kind",
  "start", "end", "elapsedMinutes", "travelMinutes", "travelFromJobId",
  "billableMinutes", "confirmedAt", "entryId", "revision", "workNote"
];

var MATERIAL_HEADERS = [
  "listId", "employeeId", "employeeName", "date", "jobId", "address",
  "customer", "description", "notes", "itemsJson", "savedAt"
];

var SCOPE_HEADERS = ["jobId", "address", "lat", "lng", "contractor", "tasksJson", "updatedAt"];

var PTO_HEADERS = [
  "requestId", "employeeId", "employeeName", "date", "hours", "status",
  "calendarEventId", "createdAt", "cancelledAt", "notifiedAt"
];
var PTO_OWNER_EMAIL = "RobinsonElectricalLlc@gmail.com";
var PTO_DAY_HOURS = 8;
var PTO_DEFAULT_RENEWAL = "2025-10-27";

var FORBIDDEN_KEYS = {
  payRate: true, wage: true, wages: true, loadedCost: true, loadedLabor: true,
  actualCost: true, bidAmount: true, bidPrice: true, bid: true, bids: true,
  margin: true, profit: true, billingRate: true, costRate: true, hourlyCost: true,
  markup: true, latitude: true, longitude: true,
  lat: true, lon: true, lng: true, refreshToken: true, access_token: true,
  clientSecret: true, client_secret: true
};

var PHOTO_STAGES = { "rough-in": "Rough-In", "trim": "Trim", "finished": "Finished", "Rough-In": "Rough-In", "Trim": "Trim", "Finished": "Finished" };
var BLOCKED_SEGMENT = /^(accounting|payroll|financial|bids?|invoices?)$/i;

function hashToken(token) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token || ""), Utilities.Charset.UTF_8);
  var out = "";
  for (var i = 0; i < bytes.length; i++) {
    var value = bytes[i];
    if (value < 0) value += 256;
    var hex = value.toString(16);
    out += hex.length === 1 ? "0" + hex : hex;
  }
  return out;
}

function findEmployee(directory, token) {
  if (!token) return null;
  var hash = hashToken(token);
  var rows = directory || [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].tokenHash === hash && !rows[i].revoked) return rows[i];
  }
  return null;
}

function addEmployeeRecord(directory, name, token) {
  var clean = String(name || "").trim();
  if (!clean) return { ok: false, reason: "name-required" };
  if (!token || String(token).length < 16) return { ok: false, reason: "token-too-short" };
  var next = (directory || []).slice();
  var employeeId = "emp_" + hashToken(clean + "|" + token).slice(0, 12);
  next.push({ employeeId: employeeId, name: clean, tokenHash: hashToken(token), revoked: false });
  return { ok: true, directory: next, employee: { employeeId: employeeId, name: clean, revoked: false } };
}

function revokeEmployee(directory, employeeId) {
  var found = false;
  var next = (directory || []).map(function (row) {
    if (row && row.employeeId === employeeId) {
      found = true;
      return { employeeId: row.employeeId, name: row.name, tokenHash: row.tokenHash, revoked: true };
    }
    return row;
  });
  return found ? { ok: true, directory: next } : { ok: false, reason: "unknown-employee" };
}

function publicEmployees(directory) {
  return (directory || []).map(function (row) {
    return { employeeId: row.employeeId, name: row.name, revoked: !!row.revoked };
  });
}

function weekdayOfDutyDate(dutyDate) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dutyDate || "");
  if (!match) return "";
  var utcGuess = Date.UTC(+match[1], +match[2] - 1, +match[3], 12, 0, 0);
  var fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", hourCycle: "h23" });
  var bag = {};
  fmt.formatToParts(new Date(utcGuess)).forEach(function (part) { bag[part.type] = part.value; });
  return bag.weekday || "";
}

function addCalendarDays(dutyDate, days) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dutyDate || "");
  if (!match) return "";
  var dt = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3] + days));
  return dt.toISOString().slice(0, 10);
}

function payWeekContaining(dutyDate) {
  var order = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  var weekday = weekdayOfDutyDate(dutyDate);
  if (!weekday || weekday === "Sun") {
    return { inPayWeek: false, weekStart: null, weekEnd: null, sendOn: null, weekStartRule: "monday-saturday" };
  }
  var weekStart = addCalendarDays(dutyDate, -order[weekday]);
  return {
    inPayWeek: true,
    weekStart: weekStart,
    weekEnd: addCalendarDays(weekStart, 5),
    sendOn: addCalendarDays(weekStart, 6),
    weekStartRule: "monday-saturday"
  };
}

function reportWeekFromDutyDate(dutyDate) {
  var anchor = weekdayOfDutyDate(dutyDate) === "Sun" ? addCalendarDays(dutyDate, -1) : dutyDate;
  return payWeekContaining(anchor);
}

function dutyDateInChicago(date) {
  var fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  var bag = {};
  fmt.formatToParts(date).forEach(function (part) { bag[part.type] = part.value; });
  return bag.year + "-" + bag.month + "-" + bag.day;
}

function reportWeek(asOf) {
  return reportWeekFromDutyDate(dutyDateInChicago(asOf instanceof Date ? asOf : new Date(asOf)));
}

function inPayWeek(dutyDate, week) {
  return !!(dutyDate && week && week.weekStart && dutyDate >= week.weekStart && dutyDate <= week.weekEnd);
}

function containsForbidden(value, found) {
  found = found || [];
  if (!value || typeof value !== "object") return found;
  if (Object.prototype.toString.call(value) === "[object Array]") {
    value.forEach(function (item) { containsForbidden(item, found); });
    return found;
  }
  Object.keys(value).forEach(function (key) {
    if (FORBIDDEN_KEYS[key]) found.push(key);
    else containsForbidden(value[key], found);
  });
  return found;
}

function elapsedMinutes(start, end) {
  if (!start || !end) return 0;
  var ms = new Date(end).getTime() - new Date(start).getTime();
  if (!isFinite(ms) || ms < 0) return 0;
  return Math.round(ms / 60000);
}

function cleanupProvisional(rows) {
  var kept = [];
  var removed = 0;
  (rows || []).forEach(function (row) {
    if (row && row.confirmationState === "confirmed" && row.status !== "void" && row.status !== "suggested" && row.start && row.end) kept.push(row);
    else removed++;
  });
  return { kept: kept, removed: removed };
}

function rowsForEmployee(rows, employeeId) {
  return (rows || []).filter(function (row) { return row && row.employeeId === employeeId; });
}

function csvCell(value) {
  var text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}

function buildWeeklyCsv(rows) {
  var lines = [TIMECARD_HEADERS.join(",")];
  (rows || []).forEach(function (row) {
    lines.push(TIMECARD_HEADERS.map(function (key) { return csvCell(row[key]); }).join(","));
  });
  return lines.join("\n") + "\n";
}

function subjectForWeek(week) {
  return "Robinson Electrical Weekly Timecards " + week.weekStart + " to " + week.weekEnd;
}

function weeklyPackets(rows, week) {
  var mine = (rows || []).filter(function (row) { return inPayWeek(row.dutyDate, week); });
  var byPerson = {};
  mine.forEach(function (row) {
    if (!byPerson[row.employeeId]) byPerson[row.employeeId] = [];
    byPerson[row.employeeId].push(row);
  });
  var files = Object.keys(byPerson).sort().map(function (employeeId) {
    return {
      name: "timecard-" + employeeId + "-" + week.weekStart + ".csv",
      csv: buildWeeklyCsv(byPerson[employeeId])
    };
  });
  files.push({ name: "timecard-all-" + week.weekStart + "-to-" + week.weekEnd + ".csv", csv: buildWeeklyCsv(mine) });
  return { subject: subjectForWeek(week), files: files };
}

function cleanSegment(value) {
  var text = String(value || "").replace(/\\/g, "/").trim();
  if (!text || text === "." || text === ".." || text.indexOf("..") !== -1) return { ok: false, reason: "path-traversal" };
  if (text.indexOf("/") !== -1 || text.indexOf("\0") !== -1) return { ok: false, reason: "path-traversal" };
  if (BLOCKED_SEGMENT.test(text)) return { ok: false, reason: "accounting-blocked" };
  return { ok: true, value: text };
}

function photoStageLabel(stageId) {
  return PHOTO_STAGES[stageId] || "";
}

function assertInsideJobPhotos(path) {
  var text = String(path || "").trim();
  if (!text) return { ok: false, reason: "outside-job-photos" };
  try { text = decodeURIComponent(text); } catch (err) { return { ok: false, reason: "bad-path" }; }
  text = text.replace(/\\/g, "/");
  if (text.charAt(0) === "/" || /^[a-z]:/i.test(text) || text.indexOf("..") !== -1 || text.indexOf("//") !== -1) {
    return { ok: false, reason: "path-traversal" };
  }
  var parts = text.split("/");
  for (var i = 0; i < parts.length; i++) {
    if (BLOCKED_SEGMENT.test(parts[i])) return { ok: false, reason: "accounting-blocked" };
  }
  if (parts.length < 4 || parts.length > 5 || parts[0] !== "Job Photos") return { ok: false, reason: "outside-job-photos" };
  for (var j = 1; j < parts.length; j++) {
    var cleaned = cleanSegment(parts[j]);
    if (!cleaned.ok) return cleaned;
  }
  if (!photoStageLabel(parts[3])) return { ok: false, reason: "bad-stage" };
  return { ok: true, path: parts.join("/") };
}

function graphUrlForPath(path, suffix) {
  var check = assertInsideJobPhotos(path);
  if (!check.ok) return check;
  var encoded = check.path.split("/").map(encodeURIComponent).join("/");
  return { ok: true, url: "https://graph.microsoft.com/v1.0/me/drive/root:/" + encoded + (suffix || "") };
}

function sanitizeMaterial(body, employee) {
  var items = [];
  var source = (body && body.items) || (body && body.lines) || [];
  source.forEach(function (item) {
    if (!item) return;
    items.push({ name: String(item.name || "").slice(0, 120), qty: Number(item.qty) || 0, unit: String(item.unit || "ea").slice(0, 20) });
  });
  return {
    listId: String((body && body.listId) || "").slice(0, 80),
    employeeId: employee.employeeId,
    employeeName: employee.name,
    date: String((body && body.date) || "").slice(0, 10),
    jobId: String((body && body.jobId) || "").slice(0, 80),
    address: String((body && (body.address || body.jobLabel)) || "").slice(0, 160),
    customer: String((body && body.customer) || "").slice(0, 120),
    description: String((body && body.description) || "").slice(0, 500),
    notes: String((body && body.notes) || "").slice(0, 1000),
    itemsJson: JSON.stringify(items),
    savedAt: new Date().toISOString()
  };
}

function sanitizeConfirmedEntry(row, employee, confirmedAt) {
  if (!row || row.confirmationState !== "confirmed" || row.status === "void" || row.status === "suggested") return null;
  if (!row.start || !row.end || !row.jobId) return null;
  var onSite = elapsedMinutes(row.start, row.end);
  var travel = Number(row.travelMinutes) || 0;
  if (travel < 0) travel = 0;
  return {
    employeeId: employee.employeeId,
    employeeName: employee.name,
    dutyDate: String(row.dutyDate || "").slice(0, 10),
    jobId: String(row.jobId).slice(0, 80),
    jobLabel: String(row.jobLabel || "").slice(0, 160),
    kind: row.kind === "break" ? "break" : "work",
    start: row.start,
    end: row.end,
    elapsedMinutes: onSite,
    travelMinutes: row.kind === "break" ? 0 : travel,
    travelFromJobId: row.kind === "break" ? "" : String(row.travelFromJobId || ""),
    billableMinutes: row.kind === "break" ? onSite : onSite + travel,
    confirmedAt: confirmedAt,
    entryId: String(row.entryId || ""),
    revision: Number(row.revision) || 1,
    workNote: String(row.workNote || "").slice(0, 200),
    confirmationState: "confirmed"
  };
}

function jobIdForLabel(label) {
  var norm = String(label || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!norm) return "";
  var h = 0x811c9dc5;
  for (var i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  var hex = (h >>> 0).toString(16);
  while (hex.length < 8) hex = "0" + hex;
  return "job_" + hex;
}

function sanitizeScopeTasks(input) {
  var lines = Object.prototype.toString.call(input) === "[object Array]" ? input : String(input || "").split(/\r?\n/);
  var tasks = [];
  for (var i = 0; i < lines.length; i++) {
    var text = String(lines[i] == null ? "" : lines[i]).replace(/[ \t]+/g, " ").trim();
    if (!text) continue;
    if (isFinancialLine(text)) continue;
    text = text.replace(/\$\s*\d[\d,]*(?:\.\d+)?/g, "");
    text = text.replace(/\s{2,}/g, " ").replace(/[\s,;:\-–—]+$/g, "").trim();
    if (!text || isFinancialLine(text)) continue;
    tasks.push(text.slice(0, 240));
  }
  return tasks;
}

function isFinancialLine(text) {
  return /^(sub\s*total|grand\s*total|total|markup|tax|price|unit\s*price|labor\s*rate|labour\s*rate|labor\s*hours|labour\s*hours|margin)\b/i.test(text);
}

function publicScope(row) {
  if (!row) return null;
  var tasks = [];
  try { tasks = JSON.parse(row.tasksJson || "[]"); } catch (err) { tasks = []; }
  return {
    jobId: String(row.jobId || ""),
    address: String(row.address || ""),
    tasks: sanitizeScopeTasks(tasks)
  };
}

function buildScopeRecord(input, geo) {
  var address = String((input && input.address) || "").trim().replace(/\s+/g, " ");
  if (!address) return { ok: false, reason: "address-required" };
  var tasks = sanitizeScopeTasks((input && (input.tasks || input.text)) || "");
  if (!tasks.length) return { ok: false, reason: "no-tasks" };
  var jobId = (input && input.jobId) || jobIdForLabel(address);
  var lat = geo && isFinite(Number(geo.lat)) ? Number(geo.lat) : "";
  var lng = geo && isFinite(Number(geo.lng)) ? Number(geo.lng) : "";
  return {
    ok: true,
    record: {
      jobId: jobId,
      address: address,
      lat: lat,
      lng: lng,
      contractor: String((input && input.contractor) || "").slice(0, 120),
      tasksJson: JSON.stringify(tasks),
      updatedAt: new Date().toISOString()
    },
    publicView: { jobId: jobId, address: address, tasks: tasks }
  };
}

function scopeDistance(aLat, aLng, bLat, bLng) {
  var toRad = function (deg) { return deg * Math.PI / 180; };
  var dLat = toRad(bLat - aLat);
  var dLng = toRad(bLng - aLng);
  var lat1 = toRad(aLat);
  var lat2 = toRad(bLat);
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function matchScope(rows, query) {
  query = query || {};
  if (query.jobId) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].jobId === query.jobId) return { row: rows[i], reason: "job-id" };
    }
    return { row: null, reason: "no-scope" };
  }
  var lat = Number(query.lat);
  var lng = Number(query.lng);
  var accuracy = Number(query.accuracyMeters);
  if (!isFinite(lat) || !isFinite(lng)) return { row: null, reason: "no-fix" };
  if (!isFinite(accuracy) || accuracy > 150) return { row: null, reason: "low-accuracy" };
  var hits = [];
  for (var j = 0; j < rows.length; j++) {
    var row = rows[j];
    if (!row || !isFinite(Number(row.lat)) || !isFinite(Number(row.lng))) continue;
    if (scopeDistance(lat, lng, Number(row.lat), Number(row.lng)) + accuracy <= 150) hits.push(row);
  }
  if (hits.length === 1) return { row: hits[0], reason: "one-saved-job" };
  if (hits.length > 1) return { row: null, reason: "ambiguous" };
  return { row: null, reason: "none-nearby" };
}

function scopeQuery(req) {
  var body = (req && req.body) || {};
  var query = (req && req.query) || {};
  return {
    jobId: body.jobId || query.jobId || "",
    lat: body.lat != null ? body.lat : query.lat,
    lng: body.lng != null ? body.lng : query.lng,
    accuracyMeters: body.accuracyMeters != null ? body.accuracyMeters : query.accuracyMeters
  };
}

function bodyWithoutMatchFix(body) {
  if (!body) return body;
  var copy = {};
  Object.keys(body).forEach(function (key) {
    if (key === "lat" || key === "lng" || key === "latitude" || key === "longitude" || key === "accuracyMeters") return;
    copy[key] = body[key];
  });
  return copy;
}

var THEME_IDS = [
  "new-year", "mlk", "groundhog", "valentines", "presidents", "st-patricks", "easter",
  "arbor-day", "earth-day", "mothers-day", "memorial-day", "fathers-day", "juneteenth",
  "july-4", "labor-day", "columbus", "halloween", "veterans", "thanksgiving", "christmas"
];

function publicTheme(value) {
  var raw = String(value == null ? "" : value).trim().toLowerCase();
  if (!raw || raw === "auto") return "auto";
  if (raw === "off") return "off";
  if (raw === "fall" || raw === "winter" || raw === "happy-holidays") return raw;
  if (raw.indexOf("subtle-") === 0 && THEME_IDS.indexOf(raw.slice(7)) !== -1) return raw;
  return THEME_IDS.indexOf(raw) === -1 ? "auto" : raw;
}

function ptoPolicyFromProps(props) {
  props = props || {};
  var allowance = Number(props.allowanceHours);
  var holidays = Number(props.holidayHours);
  var renewal = String(props.renewalDate || "").trim();
  var override = /^\d{4}-\d{2}-\d{2}$/.test(renewal) ? renewal : PTO_DEFAULT_RENEWAL;
  return {
    allowanceHours: isFinite(allowance) && allowance > 0 ? allowance : 120,
    holidayHours: isFinite(holidays) && holidays >= 0 ? holidays : 56,
    dayHours: PTO_DAY_HOURS,
    renewalDate: override,
    renewalDateSet: true,
    renewalPlaceholder: ""
  };
}

function ptoAddDays(dutyDate, days) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dutyDate || "");
  if (!match) return "";
  var dt = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3] + days));
  return dt.toISOString().slice(0, 10);
}

function ptoAddYear(dutyDate) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dutyDate || "");
  if (!match) return "";
  var dt = new Date(Date.UTC(+match[1] + 1, +match[2] - 1, +match[3]));
  return dt.toISOString().slice(0, 10);
}

function ptoYearWindow(renewalDate, asOf) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(renewalDate || "") || !/^\d{4}-\d{2}-\d{2}$/.test(asOf || "")) return null;
  if (asOf < renewalDate) return null;
  var monthDay = renewalDate.slice(5);
  var year = +asOf.slice(0, 4);
  var start = year + "-" + monthDay;
  if (start > asOf) start = (year - 1) + "-" + monthDay;
  if (start < renewalDate) start = renewalDate;
  return { start: start, end: ptoAddYear(start) };
}

function ptoHoursOk(hours) {
  var value = Number(hours);
  if (!isFinite(value) || value < 0.5 || value > PTO_DAY_HOURS) return false;
  return Math.round(value * 2) === value * 2;
}

function ptoTitle(employeeName) {
  if (String(employeeName || "").trim().toLowerCase() === "jarred") return "Jarred's time scheduled off";
  var name = String(employeeName || "").trim() || "Employee";
  return name + "'s time scheduled off";
}

function ptoEventSpec(employee, date, hours) {
  var amount = Number(hours);
  return {
    title: ptoTitle(employee && employee.name),
    date: date,
    hours: amount,
    allDay: amount >= PTO_DAY_HOURS,
    description: amount + " hours scheduled off."
  };
}

function ptoNotice(employee, date, hours) {
  var name = (employee && employee.name) || "Employee";
  return {
    to: PTO_OWNER_EMAIL,
    subject: ptoTitle(name),
    body: name + " has time scheduled off on " + date + " (" + hours + " hours). This note stays with Robinson Electrical. Nothing is sent to a customer."
  };
}

function ptoBalance(rows, employeeId, policy, asOf) {
  var rules = ptoPolicyFromProps(policy);
  var window = ptoYearWindow(rules.renewalDate, asOf);
  var used = null;
  if (window) {
    used = 0;
    (rows || []).forEach(function (row) {
      if (!row || row.employeeId !== employeeId || row.status === "cancelled") return;
      if (row.date < window.start || row.date >= window.end) return;
      used += Number(row.hours) || 0;
    });
    used = Math.round(used * 100) / 100;
  }
  var remaining = used == null ? null : Math.round((rules.allowanceHours - used) * 100) / 100;
  return {
    allowanceHours: rules.allowanceHours,
    holidayHours: rules.holidayHours,
    dayHours: PTO_DAY_HOURS,
    renewalDate: rules.renewalDate,
    renewalDateSet: rules.renewalDateSet,
    renewalPlaceholder: rules.renewalPlaceholder,
    yearStart: window ? window.start : "",
    yearEnd: window ? window.end : "",
    usedHours: used,
    remainingHours: remaining,
    remainingDays: remaining == null ? null : Math.round((remaining / PTO_DAY_HOURS) * 100) / 100
  };
}

function publicPtoRow(row) {
  return {
    requestId: row.requestId,
    date: String(row.date || ""),
    hours: Number(row.hours) || 0,
    status: row.status === "cancelled" ? "cancelled" : "scheduled",
    calendarEventId: row.calendarEventId || "",
    createdAt: row.createdAt || "",
    cancelledAt: row.cancelledAt || ""
  };
}

function buildPtoSchedule(rows, employee, body, today) {
  body = body || {};
  var date = String(body.date || "");
  var hours = Number(body.hours);
  var requestId = String(body.requestId || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, reason: "date-required" };
  if (date < today) return { ok: false, reason: "past-date" };
  if (!ptoHoursOk(hours)) return { ok: false, reason: "hours" };
  if (!requestId) return { ok: false, reason: "request-required" };
  var mine = (rows || []).filter(function (row) { return row && row.employeeId === employee.employeeId; });
  for (var i = 0; i < mine.length; i++) {
    if (mine[i].status !== "cancelled" && String(mine[i].date) === date && mine[i].requestId !== requestId) {
      return { ok: false, reason: "already-scheduled" };
    }
  }
  var row = {
    requestId: requestId,
    employeeId: employee.employeeId,
    employeeName: employee.name,
    date: date,
    hours: hours,
    status: "scheduled",
    calendarEventId: "",
    createdAt: new Date().toISOString(),
    cancelledAt: "",
    notifiedAt: ""
  };
  var next = (rows || []).filter(function (item) { return !item || item.requestId !== requestId; }).concat([row]);
  var daysUntil = 0;
  var cursor = today;
  while (cursor < date) {
    daysUntil += 1;
    cursor = ptoAddDays(cursor, 1);
    if (daysUntil > 400) break;
  }
  return {
    ok: true,
    rows: next,
    row: row,
    event: ptoEventSpec(employee, date, hours),
    notifyNow: daysUntil < 14,
    notice: ptoNotice(employee, date, hours)
  };
}

function buildPtoCancel(rows, employee, requestId, today) {
  var found = null;
  var original = null;
  var next = (rows || []).map(function (row) {
    if (!row || row.requestId !== requestId) return row;
    original = row;
    found = {
      requestId: row.requestId,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      date: String(row.date || ""),
      hours: Number(row.hours) || 0,
      status: "cancelled",
      calendarEventId: row.calendarEventId || "",
      createdAt: row.createdAt || "",
      cancelledAt: new Date().toISOString(),
      notifiedAt: row.notifiedAt || ""
    };
    return found;
  });
  if (!found || found.employeeId !== employee.employeeId || original.status === "cancelled") return { ok: false, reason: "not-found" };
  if (found.date < today) return { ok: false, reason: "past-date" };
  return { ok: true, rows: next, row: found, deleteEventId: found.calendarEventId || "" };
}

function ptoRemindersDue(rows, today) {
  var target = ptoAddDays(today, 14);
  var due = [];
  (rows || []).forEach(function (row) {
    if (!row || row.status === "cancelled" || row.notifiedAt) return;
    var date = String(row.date || "");
    if (date < today) return;
    if (date === target || date < target) {
      due.push({
        requestId: row.requestId,
        to: PTO_OWNER_EMAIL,
        subject: ptoTitle(row.employeeName),
        body: (row.employeeName || "Employee") + " has time scheduled off on " + date + " (" + row.hours + " hours). This note stays with Robinson Electrical. Nothing is sent to a customer."
      });
    }
  });
  return due;
}

function markPtoNotified(rows, requestIds, at) {
  var wanted = {};
  (requestIds || []).forEach(function (id) { wanted[id] = true; });
  return (rows || []).map(function (row) {
    if (!row || !wanted[row.requestId]) return row;
    var copy = {};
    Object.keys(row).forEach(function (key) { copy[key] = row[key]; });
    copy.notifiedAt = at;
    return copy;
  });
}

function handleRequest(req, deps) {
  var path = (req && req.path) || "/api/health";
  if (path.charAt(0) !== "/") path = "/" + path;
  if (path === "/api/health" || path === "/health" || path === "/api/theme") {
    var theme = deps && typeof deps.theme === "function" ? publicTheme(deps.theme()) : "auto";
    if (path === "/api/theme") return { status: 200, theme: theme };
    return { status: 200, ok: true, photos: !!(deps && deps.graphConfigured && deps.graphConfigured()), email: "not-sent-by-health", timezone: "America/Chicago", theme: theme };
  }
  if (path === "/api/scope/upsert") return upsertScopeRequest(req, deps);
  var employee = findEmployee(deps.employees(), req.token);
  if (!employee) return { status: 401, error: "unauthenticated" };
  if (req.body && req.body.employeeId && req.body.employeeId !== employee.employeeId) return { status: 403, error: "employee-isolation" };
  var forbidden = containsForbidden(path === "/api/scope" ? bodyWithoutMatchFix(req.body) : req.body);
  if (forbidden.length) return { status: 400, error: "financial-or-location-rejected", keys: forbidden };
  if (req.method === "DELETE" || req.method === "PATCH" || req.method === "PUT") return { status: 403, error: "employees-cannot-change-photos" };

  if (req.method === "POST" && path === "/api/timecards/confirm") {
    var confirmedAt = (req.body && req.body.confirmedAt) || new Date().toISOString();
    var kept = [];
    ((req.body && req.body.entries) || []).forEach(function (row) {
      var clean = sanitizeConfirmedEntry(row, employee, confirmedAt);
      if (clean) kept.push(clean);
    });
    deps.saveTimecards(employee.employeeId, req.body.dutyDate, kept);
    return { status: 202, acknowledged: true, saved: kept.length };
  }

  if ((req.method === "GET" || req.method === "POST") && path === "/api/timecards") {
    return { status: 200, entries: rowsForEmployee(deps.listTimecards(), employee.employeeId) };
  }

  if (req.method === "POST" && path === "/api/materials") {
    if (!req.body || !req.body.address) return { status: 400, error: "address-required" };
    var material = sanitizeMaterial(req.body, employee);
    deps.saveMaterial(material);
    return { status: 202, acknowledged: true, listId: material.listId };
  }

  if ((req.method === "GET" || req.method === "POST") && path === "/api/materials") {
    return { status: 200, lists: rowsForEmployee(deps.listMaterials(), employee.employeeId) };
  }

  if ((req.method === "GET" || req.method === "POST") && path === "/api/scope") {
    var found = matchScope(deps.listScopes ? deps.listScopes() : [], scopeQuery(req));
    return { status: 200, scope: publicScope(found.row), reason: found.reason };
  }

  if (path.indexOf("/api/job-photos") === 0) return handlePhotoRoute(req, deps, employee, path);
  if (path.indexOf("/api/pto") === 0) return handlePtoRoute(req, deps, employee, path);
  return { status: 404, error: "not-found" };
}

function handlePtoRoute(req, deps, employee, path) {
  var today = deps.today ? deps.today() : dutyDateInChicago(new Date());
  var policy = ptoPolicyFromProps(deps.ptoPolicy ? deps.ptoPolicy() : {});
  var rows = deps.listPto ? deps.listPto() : [];
  if ((req.method === "GET" || req.method === "POST") && path === "/api/pto") {
    var mine = rowsForEmployee(rows, employee.employeeId).map(publicPtoRow);
    return { status: 200, ok: true, policy: policy, requests: mine, balance: ptoBalance(rows, employee.employeeId, policy, today) };
  }
  if (req.method === "POST" && path === "/api/pto/schedule") {
    var built = buildPtoSchedule(rows, employee, req.body, today);
    if (!built.ok) return { status: 400, error: built.reason };
    var eventId = "";
    if (deps.createPtoEvent) {
      try { eventId = deps.createPtoEvent(built.event) || ""; }
      catch (err) { eventId = ""; }
    }
    built.row.calendarEventId = eventId;
    if (built.notifyNow && deps.notifyOwner) {
      try {
        deps.notifyOwner(built.notice);
        built.row.notifiedAt = new Date().toISOString();
      } catch (err) { built.row.notifiedAt = ""; }
    }
    var saved = built.rows.map(function (row) { return row.requestId === built.row.requestId ? built.row : row; });
    deps.savePto(saved);
    return { status: 202, acknowledged: true, request: publicPtoRow(built.row), policy: policy, balance: ptoBalance(saved, employee.employeeId, policy, today), calendarSaved: !!eventId };
  }
  if (req.method === "POST" && path === "/api/pto/cancel") {
    var cancelled = buildPtoCancel(rows, employee, req.body && req.body.requestId, today);
    if (!cancelled.ok) return { status: 400, error: cancelled.reason };
    if (cancelled.deleteEventId && deps.deletePtoEvent) {
      try { deps.deletePtoEvent(cancelled.deleteEventId); }
      catch (err) { /* the row is still cancelled */ }
    }
    cancelled.row.calendarEventId = "";
    var after = cancelled.rows.map(function (row) { return row.requestId === cancelled.row.requestId ? cancelled.row : row; });
    deps.savePto(after);
    return { status: 202, acknowledged: true, request: publicPtoRow(cancelled.row), policy: policy, balance: ptoBalance(after, employee.employeeId, policy, today) };
  }
  return { status: 404, error: "not-found" };
}

function upsertScopeRequest(req, deps) {
  var key = req.body && req.body.adminKey;
  if (!deps.adminKeyOk || !deps.adminKeyOk(key)) return { status: 403, error: "admin-only" };
  var geo = { lat: req.body && req.body.lat, lng: req.body && req.body.lng };
  if ((!isFinite(Number(geo.lat)) || !isFinite(Number(geo.lng))) && deps.geocode) geo = deps.geocode(req.body && req.body.address) || {};
  var built = buildScopeRecord(req.body || {}, geo);
  if (!built.ok) return { status: 400, error: built.reason };
  deps.saveScope(built.record);
  return { status: 200, ok: true, scope: built.publicView };
}

function assertJobPhotosPrefix(path) {
  var text = String(path || "").trim().replace(/\\/g, "/");
  if (!text || text.indexOf("..") !== -1 || text.indexOf("//") !== -1) return { ok: false, reason: "path-traversal" };
  if (text !== "Job Photos" && text.indexOf("Job Photos/") !== 0) return { ok: false, reason: "outside-job-photos" };
  var parts = text.split("/");
  for (var i = 0; i < parts.length; i++) {
    if (BLOCKED_SEGMENT.test(parts[i])) return { ok: false, reason: "accounting-blocked" };
  }
  return { ok: true, path: text };
}

function graphListChecked(deps, path) {
  var check = assertJobPhotosPrefix(path);
  if (!check.ok) return check;
  return { ok: true, items: deps.graphList(check.path) };
}

function handlePhotoRoute(req, deps, employee, path) {
  if (!deps.graphConfigured || !deps.graphConfigured()) return { status: 503, error: "not-connected", contractors: [], jobs: [], photos: [] };
  if ((req.method === "GET" || req.method === "POST") && path === "/api/job-photos/contractors") {
    var contractors = graphListChecked(deps, "Job Photos");
    if (!contractors.ok) return { status: 403, error: contractors.reason };
    return { status: 200, contractors: contractors.items };
  }
  var jobs = path.match(/^\/api\/job-photos\/contractors\/([^/]+)\/jobs$/);
  if ((req.method === "GET" || req.method === "POST") && jobs) {
    var contractor = decodeURIComponent(jobs[1]);
    if (!cleanSegment(contractor).ok) return { status: 403, error: cleanSegment(contractor).reason };
    var jobFolders = graphListChecked(deps, "Job Photos/" + contractor);
    if (!jobFolders.ok) return { status: 403, error: jobFolders.reason };
    return { status: 200, jobs: jobFolders.items };
  }
  var photos = path.match(/^\/api\/job-photos\/contractors\/([^/]+)\/jobs\/([^/]+)\/stages\/([^/]+)\/photos$/);
  if ((req.method === "GET" || req.method === "POST") && photos) {
    var stage = photoStageLabel(decodeURIComponent(photos[3]));
    var photoFolder = ["Job Photos", decodeURIComponent(photos[1]), decodeURIComponent(photos[2]), stage].join("/");
    var folderCheck = assertInsideJobPhotos(photoFolder + "/placeholder.jpg");
    if (!folderCheck.ok) return { status: 403, error: folderCheck.reason };
    var listed = graphListChecked(deps, photoFolder);
    if (!listed.ok) return { status: 403, error: listed.reason };
    return { status: 200, photos: listed.items };
  }
  var one = path.match(/^\/api\/job-photos\/photos\/([^/]+)$/);
  if ((req.method === "GET" || req.method === "POST") && one) {
    var photoId = decodeURIComponent(one[1]);
    if (!cleanSegment(photoId).ok) return { status: 403, error: "bad-path" };
    var size = (req.query && req.query.size) || (req.body && req.body.size) || "thumb";
    if (size !== "thumb" && size !== "full") return { status: 400, error: "bad-size" };
    return { status: 200, photo: deps.graphGet(photoId, size) };
  }
  var upload = path.match(/^\/api\/job-photos\/contractors\/([^/]+)\/jobs\/([^/]+)\/stages\/([^/]+)$/);
  if (req.method === "POST" && upload) {
    var stageLabel = photoStageLabel(decodeURIComponent(upload[3]));
    var fileName = [
      String(decodeURIComponent(upload[2]) || "Job").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60),
      stageLabel,
      String((req.body && req.body.dateStamp) || "date-unknown"),
      String((req.body && req.body.uniqueId) || "photo").replace(/[^a-z0-9]/gi, "").slice(-8) || "photo"
    ].join(" - ") + ".jpg";
    var placed = ["Job Photos", decodeURIComponent(upload[1]), decodeURIComponent(upload[2]), stageLabel, fileName].join("/");
    var placedCheck = assertInsideJobPhotos(placed);
    if (!placedCheck.ok) return { status: 403, error: placedCheck.reason };
    if (req.body && req.body.fileName && req.body.fileName !== fileName) {
      /* The phone may send a name. The stored name is the one built here. */
    }
    deps.graphUpload(placedCheck.path, req.body && req.body.contentBase64);
    return { status: 202, acknowledged: true, path: placedCheck.path, fileName: fileName, employeeId: employee.employeeId, employeeMicrosoftSignIn: false };
  }
  return { status: 404, error: "not-found" };
}
