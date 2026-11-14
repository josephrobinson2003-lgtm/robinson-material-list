/** Local outbox. Waiting is not the same as sent. */

export function enqueue(state, item) {
  if (state.queue.some((queued) => queued.opId === item.opId)) return state;
  state.queue.push({
    opId: item.opId,
    employeeId: state.employeeId,
    entryId: item.entryId || null,
    revision: item.revision ?? null,
    enqueuedAt: item.enqueuedAt,
    syncStatus: item.syncStatus || "saved-on-phone",
    attempts: 0,
    lastError: ""
  });
  return state;
}

export async function flushQueue(state, backend) {
  const next = structuredClone(state);
  if (!backend || backend.configured !== true) {
    for (const item of next.queue || []) {
      if (item.syncStatus === "pending-upload") item.syncStatus = "saved-on-phone";
    }
    return { state: next, acknowledged: 0, result: "not-configured" };
  }
  let acknowledged = 0;
  for (const item of next.queue || []) {
    if (item.syncStatus === "uploaded") continue;
    item.syncStatus = "pending-upload";
    item.attempts += 1;
    let result;
    try {
      result = await backend.push({
        opId: item.opId,
        employeeId: item.employeeId,
        entryId: item.entryId,
        revision: item.revision
      });
    } catch {
      item.syncStatus = "failed";
      item.lastError = "send-failed";
      continue;
    }
    if (result && result.acknowledged === true) {
      item.syncStatus = "uploaded";
      item.lastError = "";
      acknowledged += 1;
    } else {
      item.syncStatus = "failed";
      item.lastError = (result && result.reason) || "not-acknowledged";
    }
  }
  return { state: next, acknowledged, result: acknowledged > 0 ? "acknowledged" : "not-acknowledged" };
}
