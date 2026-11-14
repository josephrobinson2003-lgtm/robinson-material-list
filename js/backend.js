/** Private sync seam. The website does not call a live server. */

export function unconfiguredBackend(reason = "not-configured") {
  return {
    configured: false,
    reason,
    label: "Private backend not configured. Sunday email is not enabled. Nothing has been sent.",
    async push() {
      return { sent: false, reason };
    }
  };
}

export function validateEndpoint(url) {
  let parsed;
  try { parsed = new URL(url); }
  catch { return { ok: false, reason: "invalid-url" }; }
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !local) return { ok: false, reason: "https-required" };
  if (/\.github\.io$/i.test(parsed.hostname)) return { ok: false, reason: "public-site-blocked" };
  if (parsed.username || parsed.password) return { ok: false, reason: "credentials-in-url" };
  if (/access_token|client_secret|refresh_token/i.test(parsed.search)) return { ok: false, reason: "secret-in-url" };
  return { ok: true, url: parsed.origin + parsed.pathname };
}

export function createBackend({ endpoint, token, fetchImpl } = {}) {
  if (!endpoint || !token) return unconfiguredBackend("not-configured");
  const check = validateEndpoint(endpoint);
  if (!check.ok) return unconfiguredBackend(check.reason);
  return {
    configured: true,
    reason: null,
    label: "Private backend address is set for a test seam. The phone app does not turn this on.",
    async push(payload) {
      const forbidden = payload && payload.rawCoordinatesIncluded === true;
      if (forbidden) return { sent: false, reason: "coordinates-blocked" };
      const response = await fetchImpl(check.url, {
        method: "POST",
        headers: {
          "content-type": "text/plain;charset=utf-8",
          authorization: "Bearer " + token
        },
        body: JSON.stringify(payload)
      });
      return { sent: response.ok === true, status: response.status };
    }
  };
}
