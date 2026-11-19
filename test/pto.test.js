import test from "node:test";
import assert from "node:assert/strict";
import { cancelPtoRequest, defaultPtoPolicy, schedulePtoRequest, summarizePto } from "../js/pto.js";

test("pto math uses the October 27 anniversary and rolls the year that day", () => {
  const open = summarizePto([], defaultPtoPolicy(), "2026-11-19");
  assert.equal(open.allowanceHours, 120);
  assert.equal(open.allowanceDays, 15);
  assert.equal(open.holidayHours, 56);
  assert.equal(open.renewalDate, "2025-10-27");
  assert.equal(open.yearStart, "2026-10-27");
  assert.equal(open.yearEnd, "2027-10-27");
  assert.equal(open.usedHours, 0);
  assert.equal(open.remainingHours, 120);
  assert.equal(open.remainingDays, 15);

  const before = summarizePto([
    { requestId: "edge", date: "2026-10-26", hours: 8, status: "scheduled" }
  ], {}, "2026-10-26");
  assert.equal(before.yearStart, "2025-10-27");
  assert.equal(before.yearEnd, "2026-10-27");
  assert.equal(before.usedHours, 8);
  assert.equal(before.remainingHours, 112);

  const rolled = summarizePto([
    { requestId: "edge", date: "2026-10-26", hours: 8, status: "scheduled" },
    { requestId: "next", date: "2026-10-27", hours: 4, status: "scheduled" }
  ], {}, "2026-10-27");
  assert.equal(rolled.yearStart, "2026-10-27");
  assert.equal(rolled.yearEnd, "2027-10-27");
  assert.equal(rolled.usedHours, 4);
  assert.equal(rolled.remainingHours, 116);

  const policy = { allowanceHours: 120, holidayHours: 56, renewalDate: "2026-01-15" };
  const requests = [
    { requestId: "a", date: "2026-04-02", hours: 8, status: "scheduled" },
    { requestId: "b", date: "2026-05-04", hours: 4, status: "scheduled" },
    { requestId: "c", date: "2026-06-01", hours: 8, status: "cancelled" }
  ];
  const summary = summarizePto(requests, policy, "2026-06-15");
  assert.equal(summary.usedHours, 12);
  assert.equal(summary.remainingHours, 108);
  assert.equal(summary.remainingDays, 13.5);
  assert.equal(summary.holidayHours, 56);
  assert.equal(summary.yearStart, "2026-01-15");
});

test("scheduling and cancelling stays on the phone until it syncs", () => {
  const created = schedulePtoRequest([], { date: "2026-04-02", hours: 8 }, "2026-03-10");
  assert.equal(created.ok, true);
  assert.equal(created.request.syncStatus, "saved-on-phone");
  assert.equal(created.request.status, "scheduled");
  const duplicate = schedulePtoRequest(created.requests, { date: "2026-04-02", hours: 4 }, "2026-03-10");
  assert.equal(duplicate.ok, false);
  const past = schedulePtoRequest(created.requests, { date: "2026-03-01", hours: 8 }, "2026-03-10");
  assert.equal(past.reason, "past-date");
  const partial = schedulePtoRequest(created.requests, { date: "2026-04-03", hours: 4 }, "2026-03-10");
  assert.equal(partial.ok, true);
  const cancelled = cancelPtoRequest(partial.requests, created.request.requestId, "2026-03-10");
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.request.status, "cancelled");
  assert.equal(cancelled.request.syncStatus, "saved-on-phone");
  const kept = summarizePto(cancelled.requests, { allowanceHours: 120, holidayHours: 56, renewalDate: "2026-01-15", renewalDateSet: true }, "2026-04-01");
  assert.equal(kept.usedHours, 4);
  const tooLate = cancelPtoRequest(partial.requests, partial.request.requestId, "2026-04-04");
  assert.equal(tooLate.reason, "past-date");
});
