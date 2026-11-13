/** Apps Script entry points. Secrets stay in Script Properties, not in this file. */

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
    theme: function () { return themeOverride_(); }
  };
}

function themeOverride_() {
  var raw = "";
  try { raw = scriptProperties_().getProperty("THEME_OVERRIDE") || ""; }
  catch (err) { raw = ""; }
  return publicTheme(raw);
}

function geocodeAddress_(address) {
  if (!address) return { lat: "", lng: "" };
  try {
    var result = Maps.newGeocoder().geocode(address);
    var loc = result && result.results && result.results[0] && result.results[0].geometry && result.results[0].geometry.location;
    if (!loc) return { lat: "", lng: "" };
    return { lat: loc.lat, lng: loc.lng };
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

function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.adminKey && adminKeyOk_(params.adminKey)) return HtmlService.createHtmlOutput(adminPage_());
  return jsonOut(handleRequest(parseRequest_(e, "GET"), liveDeps()));
}

function doPost(e) {
  return jsonOut(handleRequest(parseRequest_(e, "POST"), liveDeps()));
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
  return addEmployee("Jarred");
}

function addEmployee(name) {
  var token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  var directory = readEmployees_();
  var added = addEmployeeRecord(directory, name, token);
  if (!added.ok) return added;
  writeEmployees_(added.directory);
  return { employeeId: added.employee.employeeId, name: added.employee.name, token: token };
}

function revokeEmployeeToken(employeeId) {
  var updated = revokeEmployee(readEmployees_(), employeeId);
  if (!updated.ok) return updated;
  writeEmployees_(updated.directory);
  return { ok: true };
}

function listEmployees() {
  return publicEmployees(readEmployees_());
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
