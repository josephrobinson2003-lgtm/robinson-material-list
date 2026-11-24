/** Joe's one-time Microsoft connection. The refresh token stays in Script Properties. */

function microsoftService_() {
  var props = scriptProperties_();
  return OAuth2.createService("microsoft-job-photos")
    .setAuthorizationBaseUrl("https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize")
    .setTokenUrl("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
    .setClientId(props.getProperty("MS_CLIENT_ID"))
    .setClientSecret(props.getProperty("MS_CLIENT_SECRET"))
    .setCallbackFunction("authCallback")
    .setPropertyStore(props)
    .setScope("Files.ReadWrite offline_access")
    .setParam("prompt", "consent");
}

function microsoftConfigured_() {
  var props = scriptProperties_();
  if (!props.getProperty("MS_CLIENT_ID") || !props.getProperty("MS_CLIENT_SECRET")) return false;
  return microsoftService_().hasAccess();
}

function graphFetch_(url, options) {
  var response = UrlFetchApp.fetch(url, options || {});
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error("graph-" + code);
  var text = response.getContentText() || "";
  if (!text) return {};
  return JSON.parse(text);
}

function graphChildren_(path) {
  var check = assertJobPhotosPrefix(path);
  if (!check.ok) throw new Error(check.reason);
  var encoded = check.path.split("/").map(encodeURIComponent).join("/");
  var response = UrlFetchApp.fetch("https://graph.microsoft.com/v1.0/me/drive/root:/" + encoded + ":/children", {
    headers: { Authorization: "Bearer " + microsoftService_().getAccessToken() },
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (code === 404) return []; /* folder not created yet: the first upload creates it */
  if (code < 200 || code >= 300) throw new Error("graph-" + code);
  return namesFromGraph_(JSON.parse(response.getContentText() || "{}"));
}

function namesFromGraph_(listed) {
  return ((listed && listed.value) || []).map(function (item) {
    return { id: item.id, name: item.name, folder: !!item.folder };
  });
}

function graphPhoto_(photoId, size) {
  if (!cleanSegment(photoId).ok) throw new Error("bad-path");
  var token = microsoftService_().getAccessToken();
  var meta = graphFetch_("https://graph.microsoft.com/v1.0/me/drive/items/" + encodeURIComponent(photoId), {
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true
  });
  var parent = (meta.parentReference && meta.parentReference.path) || "";
  if (parent.indexOf(":/Job Photos/") === -1 || /accounting|payroll|financial/i.test(parent)) throw new Error("outside-job-photos");
  if (size === "thumb") {
    return graphFetch_("https://graph.microsoft.com/v1.0/me/drive/items/" + encodeURIComponent(photoId) + "/thumbnails/0/medium", {
      headers: { Authorization: "Bearer " + token },
      muteHttpExceptions: true
    });
  }
  var response = UrlFetchApp.fetch("https://graph.microsoft.com/v1.0/me/drive/items/" + encodeURIComponent(photoId) + "/content", {
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true,
    followRedirects: true
  });
  return { contentBase64: Utilities.base64Encode(response.getContent()) };
}

function graphPut_(path, contentBase64) {
  var check = assertInsideJobPhotos(path);
  if (!check.ok) throw new Error(check.reason);
  var encoded = check.path.split("/").map(encodeURIComponent).join("/");
  var url = "https://graph.microsoft.com/v1.0/me/drive/root:/" + encoded + ":/content";
  if (!contentBase64) throw new Error("empty-file");
  var response = UrlFetchApp.fetch(url + "?@microsoft.graph.conflictBehavior=rename", {
    method: "put",
    contentType: "image/jpeg",
    payload: Utilities.base64Decode(contentBase64),
    headers: { Authorization: "Bearer " + microsoftService_().getAccessToken() },
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error("graph-" + code);
  var item = JSON.parse(response.getContentText() || "{}");
  return { ok: true, path: check.path, id: item.id || "", uploadedAt: item.createdDateTime || new Date().toISOString() };
}
