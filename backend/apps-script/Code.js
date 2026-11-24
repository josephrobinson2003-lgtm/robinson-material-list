/** Apps Script entry points. Secrets stay in Script Properties, not in this file.
 *
 * ADMIN SETTINGS — edit the values below, then choose a function and press Run.
 * Open Executions, or View > Execution log, to read the result. A new token
 * is printed once. The script does not keep the token itself.
 *
 *   adminAddNewEmployee   uses NEW_EMPLOYEE_NAME and the three PTO values
 *   adminRevokeEmployee   uses EMPLOYEE_TO_REVOKE (name or employee id)
 *   adminListEmployees    no values needed
 *   addJarred             creates Jarred with his October 27, 2025 policy
 *   setJarredPtoPolicy    sets that policy on the Jarred who already exists
 *   showPtoPolicy         lists each person's PTO, no tokens
 */
var NEW_EMPLOYEE_NAME = "";
var NEW_EMPLOYEE_START_DATE = "";
var NEW_EMPLOYEE_VACATION_HOURS = "";
var NEW_EMPLOYEE_HOLIDAY_HOURS = "";
var EMPLOYEE_TO_REVOKE = "";

function logAdmin(lines) {
  (lines || []).forEach(function (line) {
    Logger.log(line);
    console.log(line);
  });
}

/** The address phones save. Run from the editor, getUrl() gives the /dev test
 * address, which only the script owner can open, so prefer the /exec one. */
function webAppUrl_() {
  var fixed = typeof PHONE_SERVER_URL === "string" ? PHONE_SERVER_URL : "";
  if (/\/exec$/.test(fixed)) return fixed;
  var saved = "";
  try { saved = scriptProperties_().getProperty("WEB_APP_URL") || ""; } catch (err) { saved = ""; }
  if (/\/exec$/.test(saved)) return saved;
  try {
    var service = ScriptApp.getService();
    if (service && service.getUrl) return service.getUrl() || "";
  } catch (err) { /* not deployed yet */ }
  return "";
}

function reportAdmin(kind, result) {
  logAdmin(adminResultLines(kind, result, webAppUrl_()));
  return result;
}

function adminAddNewEmployee() {
  var name = String(NEW_EMPLOYEE_NAME || "").trim();
  var start = String(NEW_EMPLOYEE_START_DATE || "").trim();
  if (!name) return reportAdmin("adminAddNewEmployee", { ok: false, reason: "fill in NEW_EMPLOYEE_NAME at the top of Code.js" });
  if (!start) return reportAdmin("adminAddNewEmployee", { ok: false, reason: "fill in NEW_EMPLOYEE_START_DATE as YYYY-MM-DD" });
  return addEmployee(name, {
    startDate: start,
    allowanceHours: NEW_EMPLOYEE_VACATION_HOURS,
    holidayHours: NEW_EMPLOYEE_HOLIDAY_HOURS
  });
}

function adminRevokeEmployee() {
  var who = String(EMPLOYEE_TO_REVOKE || "").trim();
  if (!who) return reportAdmin("adminRevokeEmployee", { ok: false, reason: "fill in EMPLOYEE_TO_REVOKE with a name or employee id" });
  return revokeEmployeeToken(who);
}

function adminListEmployees() {
  return listEmployees();
}

function scriptProperties_() {
  return PropertiesService.getScriptProperties();
}

function liveDeps() {
  return {
    employees: function () { return readEmployees_(); },
    listTimecards: function () { return readSheet_("Timecards", TIMECARD_HEADERS); },
    saveTimecards: function (employeeId, dutyDate, rows) { replaceDay_(employeeId, dutyDate, rows); },
    listMaterials: function () { return readSheet_("Materials", MATERIAL_HEADERS); },
    saveMaterial: function (row) { appendRow_("Materials", MATERIAL_HEADERS, row); },
    graphConfigured: function () { return microsoftConfigured_(); },
    graphList: function (path) { return graphChildren_(path); },
    graphGet: function (photoId, size) { return graphPhoto_(photoId, size); },
    graphUpload: function (path, contentBase64) { return graphPut_(path, contentBase64); },
    listScopes: function () { return readSheet_("Scopes", SCOPE_HEADERS); },
    saveScope: function (record) { saveScope_(record); },
    adminKeyOk: function (key) { return adminKeyOk_(key); },
    geocode: function (address) { return geocodeAddress_(address); },
    theme: function () { return themeOverride_(); },
    listPto: function () { return readPto_(); },
    savePto: function (rows) { savePto_(rows); },
    today: function () { return dutyDateInChicago(new Date()); },
    createPtoEvent: function (spec) { return createPtoEvent_(spec); },
    deletePtoEvent: function (eventId) { deletePtoEvent_(eventId); },
    notifyOwner: function (notice) { notifyPtoOwner_(notice); }
  };
}

function ptoCalendar_() {
  return CalendarApp.getDefaultCalendar();
}

function createPtoEvent_(spec) {
  if (!spec || !spec.date || !spec.title) return "";
  var parts = String(spec.date).split("-");
  var day = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  var calendar = ptoCalendar_();
  var event;
  if (spec.allDay) event = calendar.createAllDayEvent(spec.title, day);
  else {
    var start = new Date(day.getTime());
    start.setHours(8, 0, 0, 0);
    var end = new Date(start.getTime() + Number(spec.hours || 8) * 3600000);
    event = calendar.createEvent(spec.title, start, end);
  }
  event.setDescription(spec.description || (spec.hours + " hours scheduled off."));
  try {
    event.addEmailReminder(14 * 24 * 60);
    event.addPopupReminder(14 * 24 * 60);
  } catch (err) { /* a reminder that cannot be set still leaves the event */ }
  return event.getId();
}

function deletePtoEvent_(eventId) {
  if (!eventId) return;
  var event = ptoCalendar_().getEventById(eventId);
  if (event) event.deleteEvent();
}

function notifyPtoOwner_(notice) {
  if (!notice || !notice.to) return;
  MailApp.sendEmail({ to: notice.to, subject: notice.subject, body: notice.body });
}

function themeOverride_() {
  var raw = "";
  try { raw = scriptProperties_().getProperty("THEME_OVERRIDE") || ""; }
  catch (err) { raw = ""; }
  return publicTheme(raw);
}

function geocodeAddress_(address) {
  if (!address) return { lat: "", lng: "" };
  var cache = null;
  var key = "geo:" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(address).toLowerCase()));
  try { cache = CacheService.getScriptCache(); } catch (err) { cache = null; }
  if (cache) {
    var hit = cache.get(key);
    if (hit) { try { return JSON.parse(hit); } catch (err) { /* refetch */ } }
  }
  try {
    /* Bias to the St. Louis area so "1509 Mautenne Dr" finds Ballwin, not another state. */
    var result = Maps.newGeocoder().setRegion("us").setBounds(38.2, -91.3, 39.2, -89.8).geocode(address);
    var loc = result && result.results && result.results[0] && result.results[0].geometry && result.results[0].geometry.location;
    var found = loc ? { lat: loc.lat, lng: loc.lng } : { lat: "", lng: "" };
    if (cache) cache.put(key, JSON.stringify(found), loc ? 21600 : 3600);
    return found;
  } catch (err) {
    return { lat: "", lng: "" };
  }
}

function parseRequest_(e, method) {
  var body = {};
  if (e && e.postData && e.postData.contents) {
    try { body = JSON.parse(e.postData.contents); }
    catch (err) { body = { invalidJson: true }; }
  }
  var path = "";
  if (e && e.pathInfo) path = "/" + String(e.pathInfo).replace(/^\/+/, "");
  else if (e && e.parameter && e.parameter.path) path = e.parameter.path;
  else if (body.path) path = body.path;
  else path = "/api/health";
  if (path.charAt(0) !== "/") path = "/" + path;
  var token = (body && body.token) || (e && e.parameter && e.parameter.token) || "";
  return { method: method, path: path, token: token, body: body, query: (e && e.parameter) || {} };
}

function jsonOut(result) {
  var status = result && result.status ? result.status : 200;
  var copy = {};
  Object.keys(result || {}).forEach(function (key) {
    if (key !== "status") copy[key] = result[key];
  });
  copy.status = status;
  return ContentService.createTextOutput(JSON.stringify(copy)).setMimeType(ContentService.MimeType.JSON);
}

function safeHandle_(e, method) {
  try { return handleRequest(parseRequest_(e, method), liveDeps()); }
  catch (err) {
    console.error("request failed: " + ((err && err.message) || err));
    return { status: 502, error: "server-error", detail: String((err && err.message) || err).slice(0, 80) };
  }
}

function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.adminKey && adminKeyOk_(params.adminKey)) return HtmlService.createHtmlOutput(adminPage_());
  return jsonOut(safeHandle_(e, "GET"));
}

function doPost(e) {
  return jsonOut(safeHandle_(e, "POST"));
}

function adminKeyOk_(given) {
  var expected = scriptProperties_().getProperty("ADMIN_KEY") || "";
  if (!expected || !given || expected.length !== String(given).length) return false;
  var mismatch = 0;
  for (var i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ String(given).charCodeAt(i);
  return mismatch === 0;
}

function adminPage_() {
  var service = microsoftService_();
  var link = service.getAuthorizationUrl();
  return "<p>Robinson Electrical photo connection.</p><p><a href=\"" + link + "\">Authorize Microsoft once</a></p><p>Employees never open this page.</p>";
}

function authCallback(request) {
  var service = microsoftService_();
  var ok = service.handleCallback(request);
  return HtmlService.createHtmlOutput(ok ? "Microsoft connected for Job Photos." : "Microsoft authorization failed.");
}

function addJarred() {
  return reportAdmin("addJarred", createEmployee_("Jarred", { startDate: "2025-10-27", allowanceHours: 120, holidayHours: 56 }));
}

function addEmployee(name, policy) {
  return reportAdmin("addEmployee", createEmployee_(name, policy));
}

function createEmployee_(name, policy) {
  var token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  var directory = readEmployees_();
  var added = addEmployeeRecord(directory, name, token, policy);
  if (!added.ok) return added;
  writeEmployees_(added.directory);
  var result = { ok: true, employeeId: added.employee.employeeId, name: added.employee.name, token: token };
  if (policy && policy.startDate) {
    result.ptoStartDate = String(policy.startDate);
    result.allowanceHours = Number(policy.allowanceHours);
    result.holidayHours = Number(policy.holidayHours);
  }
  return result;
}

function setEmployeePtoPolicy(who, startDate, allowanceHours, holidayHours) {
  var updated = assignEmployeePtoPolicy(readEmployees_(), who, startDate, allowanceHours, holidayHours);
  if (!updated.ok) return reportAdmin("setEmployeePtoPolicy", updated);
  writeEmployees_(updated.directory);
  return reportAdmin("setEmployeePtoPolicy", {
    ok: true,
    employeeId: updated.employeeId,
    name: String(who || ""),
    ptoStartDate: String(startDate || ""),
    allowanceHours: Number(allowanceHours),
    holidayHours: Number(holidayHours)
  });
}

function setJarredPtoPolicy() {
  var updated = assignEmployeePtoPolicy(readEmployees_(), "Jarred", "2025-10-27", 120, 56);
  if (!updated.ok) return reportAdmin("setJarredPtoPolicy", updated);
  writeEmployees_(updated.directory);
  return reportAdmin("setJarredPtoPolicy", {
    ok: true,
    name: "Jarred",
    employeeId: updated.employeeId,
    ptoStartDate: "2025-10-27",
    allowanceHours: 120,
    holidayHours: 56
  });
}

function revokeEmployeeToken(who) {
  var updated = revokeEmployee(readEmployees_(), who);
  if (!updated.ok) return reportAdmin("revokeEmployeeToken", updated);
  writeEmployees_(updated.directory);
  return reportAdmin("revokeEmployeeToken", { ok: true, employeeId: updated.employeeId, name: updated.name });
}

function listEmployees() {
  return reportAdmin("listEmployees", ptoPolicyRows_());
}

function installSundayTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "sendWeeklyReports") ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger("sendWeeklyReports").timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(8).create();
  return sundayTriggerSpec();
}

function sundayTriggerSpec() {
  return { handler: "sendWeeklyReports", weekday: "SUNDAY", hour: 8, timezone: "America/Chicago" };
}

function ptoPolicyRows_() {
  return readEmployees_().map(function (row) {
    var policy = employeePtoPolicy(row);
    return {
      employeeId: row.employeeId,
      name: row.name,
      revoked: !!row.revoked,
      configured: policy.configured,
      ptoStartDate: policy.renewalDate || "",
      allowanceHours: policy.allowanceHours,
      holidayHours: policy.holidayHours
    };
  });
}

function showPtoPolicy() {
  return reportAdmin("showPtoPolicy", ptoPolicyRows_());
}

function installPtoReminderTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "remindUpcomingPto") ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger("remindUpcomingPto").timeBased().everyDays(1).atHour(7).create();
  return { handler: "remindUpcomingPto", everyDays: 1, hour: 7, timezone: "America/Chicago" };
}

function remindUpcomingPto() {
  var rows = readPto_();
  var today = dutyDateInChicago(new Date());
  var due = ptoRemindersDue(rows, today);
  due.forEach(function (item) {
    MailApp.sendEmail({ to: item.to, subject: item.subject, body: item.body });
  });
  if (due.length) savePto_(markPtoNotified(rows, due.map(function (item) { return item.requestId; }), new Date().toISOString()));
  return { sent: due.length };
}

function sendWeeklyReports() {
  var removed = cleanupSheetProvisional_();
  var week = reportWeek(new Date());
  var packets = weeklyPackets(readSheet_("Timecards", TIMECARD_HEADERS), week);
  var attachments = packets.files.map(function (file) {
    return Utilities.newBlob(file.csv, "text/csv", file.name);
  });
  MailApp.sendEmail({
    to: "RobinsonElectricalLlc@gmail.com",
    subject: packets.subject,
    body: "Monday through Saturday hours for " + week.weekStart + " to " + week.weekEnd + ". Breaks are included. Travel minutes are on the next job. No wages are in these files. Provisional rows removed: " + removed + ".",
    attachments: attachments
  });
  return { sent: true, subject: packets.subject, removed: removed };
}

function ensureCompanySheet() {
  return ensureSpreadsheet_();
}
