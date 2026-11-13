/** Device-only server address and employee token. Empty until someone types them. */

import { validateEndpoint } from "./backend.js";

const URL_KEY = "re_backend_url";
const TOKEN_KEY = "re_employee_token";

export function readDeviceConfig(storage) {
  if (!storage) return { configured: false, hasToken: false, url: "" };
  const url = storage.getItem(URL_KEY) || "";
  const token = storage.getItem(TOKEN_KEY) || "";
  const check = url ? validateEndpoint(url) : { ok: false };
  if (!check.ok || !token) return { configured: false, hasToken: !!token, url: "" };
  return { configured: true, hasToken: true, url: check.url, token };
}

export function saveDeviceConfig(storage, input) {
  const check = validateEndpoint((input && input.url) || "");
  if (!check.ok) return { ok: false, reason: check.reason };
  const token = (input && input.token) || storage.getItem(TOKEN_KEY) || "";
  if (!token) return { ok: false, reason: "token-required" };
  storage.setItem(URL_KEY, check.url);
  if (input && input.token) storage.setItem(TOKEN_KEY, input.token);
  return { ok: true, configured: true };
}

export function clearDeviceConfig(storage) {
  storage.removeItem(URL_KEY);
  storage.removeItem(TOKEN_KEY);
}

export async function postBackend(config, path, body, fetchImpl) {
  if (!config || !config.configured) return { ok: false, reason: "not-configured" };
  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== "function") return { ok: false, reason: "not-configured" };
  const response = await fetchFn(config.url + "?path=" + encodeURIComponent(path), {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify(Object.assign({ path, token: config.token }, body || {}))
  });
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  const acknowledged = !!(data && (data.acknowledged === true || data.ok === true));
  return { ok: response.ok && !data.error, acknowledged, status: data.status || response.status, data };
}

export function materialPayload(list) {
  const items = [];
  ((list && list.groups) || []).forEach((group) => {
    (group.items || []).forEach((item) => items.push({ name: item.name, qty: item.qty, unit: item.unit }));
  });
  (list && list.others || []).forEach((item) => items.push({ name: item.name, qty: item.qty, unit: "ea" }));
  return {
    listId: list.listId || list.id || "",
    date: list.date || "",
    jobId: list.jobId || "",
    address: list.address || "",
    customer: list.customer || "",
    description: list.description || "",
    notes: list.notes || "",
    items
  };
}
