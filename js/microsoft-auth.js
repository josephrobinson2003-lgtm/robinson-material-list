/** Microsoft sign-in seam. No client id, secret, or live login is included. */

export const PHOTO_SCOPES = ["Files.ReadWrite", "offline_access"];

export function microsoftAuthStatus() {
  return {
    configured: false,
    connected: false,
    reason: "microsoft-auth-not-configured",
    delegated: true,
    ownerCredentialsInApp: false,
    accountingAccess: false,
    scopes: PHOTO_SCOPES.slice()
  };
}

export function buildAuthorizeUrl({ clientId, redirectUri, challenge, state } = {}) {
  if (!clientId || !redirectUri || !challenge || !state) {
    return { ok: false, reason: "microsoft-auth-not-configured" };
  }
  const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", PHOTO_SCOPES.join(" "));
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return { ok: true, url: url.toString() };
}

export function verifyJobFolder(folder) {
  if (!folder || !folder.verified || !folder.driveId || !folder.folderId || !folder.jobId || !folder.stage) {
    return { ok: false, reason: "not-configured" };
  }
  const blob = [folder.driveId, folder.folderId, folder.path || "", folder.stage].join(" ");
  if (/accounting|payroll|financial|\bbids?\b|\binvoices?\b/i.test(blob)) {
    return { ok: false, reason: "accounting-blocked" };
  }
  if (folder.root === true || folder.shareWithAnyone === true) return { ok: false, reason: "broad-share-blocked" };
  return { ok: true };
}

export function graphUploadUrl({ driveId, folderId, fileName } = {}) {
  if (!driveId || !folderId || !fileName) return { ok: false, reason: "not-configured" };
  if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) {
    return { ok: false, reason: "bad-filename" };
  }
  if (/accounting|payroll|financial/i.test(driveId + " " + folderId + " " + fileName)) {
    return { ok: false, reason: "accounting-blocked" };
  }
  const url = "https://graph.microsoft.com/v1.0/drives/" + encodeURIComponent(driveId)
    + "/items/" + encodeURIComponent(folderId) + ":/" + encodeURIComponent(fileName) + ":/content";
  return { ok: true, method: "PUT", url };
}
