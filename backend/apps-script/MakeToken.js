/** One-off: replace Jarred's token and email it to the company inbox.
 * Set PHONE_SERVER_URL in the Apps Script copy to the /exec address from
 * Deploy > Manage deployments. It is left blank in git on purpose. */
var PHONE_SERVER_URL = "";

function makeJarredToken() {
  var url = webAppUrl_();
  if (!/\/exec$/.test(url)) {
    Logger.log("Stopped: no /exec address. Set PHONE_SERVER_URL in MakeToken.js first. Phones cannot use " + (url || "a blank address") + ".");
    return;
  }
  var dir = readEmployees_();
  var revoked = [];
  dir.slice().forEach(function (e) {
    if (e && String(e.name || "").trim().toLowerCase() === "jarred" && !e.revoked) {
      var u = revokeEmployee(dir, e.employeeId);
      if (u.ok) { dir = u.directory; revoked.push(e.employeeId); }
    }
  });
  writeEmployees_(dir);
  var r = addEmployee("Jarred");
  if (!r || !r.token) { Logger.log("addEmployee failed: " + JSON.stringify(r)); return; }
  MailApp.sendEmail("robinsonelectricalllc@gmail.com", "Jarred's Robinson Electrical app token",
    "Jarred's token for the Robinson Electrical app:\n\n" + r.token +
    "\n\nServer address:\n" + url +
    "\n\nOn his phone: Robinson Electrical > Timecards > Server. Paste the server address and the token, then tap Save." +
    "\n\nEmployee id: " + r.employeeId + "\nOld Jarred ids revoked: " + (revoked.join(", ") || "none"));
  Logger.log("Token emailed to company Gmail for " + r.employeeId + "; revoked: " + (revoked.join(", ") || "none"));
}

function setJarredPtoById() {
  var updated = assignEmployeePtoPolicy(readEmployees_(), "emp_735a55f014a4", "2025-10-27", 120, 56);
  if (!updated.ok) { Logger.log("setJarredPtoById failed: " + JSON.stringify(updated)); return; }
  writeEmployees_(updated.directory);
  Logger.log("Jarred PTO set for " + updated.employeeId + ": start 2025-10-27, 120 vacation hours, 56 holiday hours");
}
