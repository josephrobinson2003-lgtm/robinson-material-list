/** Private Google Sheet. Created in the company account. No wages and no GPS columns. */

function ensureSpreadsheet_() {
  var props = scriptProperties_();
  var id = props.getProperty("SPREADSHEET_ID");
  var book;
  if (id) book = SpreadsheetApp.openById(id);
  else {
    book = SpreadsheetApp.create("Robinson Electrical private records");
    props.setProperty("SPREADSHEET_ID", book.getId());
  }
  ensureTab_(book, "Timecards", TIMECARD_HEADERS);
  ensureTab_(book, "Materials", MATERIAL_HEADERS);
  return book.getId();
}

function ensureTab_(book, name, headers) {
  var sheet = book.getSheetByName(name) || book.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
}

function openTab_(name, headers) {
  var id = scriptProperties_().getProperty("SPREADSHEET_ID");
  if (!id) ensureSpreadsheet_();
  id = scriptProperties_().getProperty("SPREADSHEET_ID");
  var book = SpreadsheetApp.openById(id);
  ensureTab_(book, name, headers);
  return book.getSheetByName(name);
}

function readSheet_(name, headers) {
  var sheet = openTab_(name, headers);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var head = values[0];
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = {};
    var blank = true;
    for (var c = 0; c < head.length; c++) {
      row[head[c]] = values[r][c];
      if (values[r][c] !== "" && values[r][c] != null) blank = false;
    }
    if (!blank) rows.push(row);
  }
  return rows;
}

function appendRow_(name, headers, row) {
  var sheet = openTab_(name, headers);
  sheet.appendRow(headers.map(function (key) { return row[key] == null ? "" : row[key]; }));
}

function replaceDay_(employeeId, dutyDate, rows) {
  var existing = readSheet_("Timecards", TIMECARD_HEADERS).filter(function (row) {
    return !(row.employeeId === employeeId && String(row.dutyDate) === String(dutyDate));
  });
  var kept = cleanupProvisional(existing.concat(rows)).kept;
  var sheet = openTab_("Timecards", TIMECARD_HEADERS);
  sheet.clearContents();
  sheet.appendRow(TIMECARD_HEADERS);
  kept.forEach(function (row) { appendRow_("Timecards", TIMECARD_HEADERS, row); });
}

function cleanupSheetProvisional_() {
  var rows = readSheet_("Timecards", TIMECARD_HEADERS);
  var cleaned = cleanupProvisional(rows);
  if (!cleaned.removed) return 0;
  var sheet = openTab_("Timecards", TIMECARD_HEADERS);
  sheet.clearContents();
  sheet.appendRow(TIMECARD_HEADERS);
  cleaned.kept.forEach(function (row) { appendRow_("Timecards", TIMECARD_HEADERS, row); });
  return cleaned.removed;
}

function readEmployees_() {
  var raw = scriptProperties_().getProperty("EMPLOYEE_DIRECTORY") || "[]";
  try { return JSON.parse(raw); } catch (err) { return []; }
}

function writeEmployees_(directory) {
  var stored = (directory || []).map(function (row) {
    return { employeeId: row.employeeId, name: row.name, tokenHash: row.tokenHash, revoked: !!row.revoked };
  });
  scriptProperties_().setProperty("EMPLOYEE_DIRECTORY", JSON.stringify(stored));
}
