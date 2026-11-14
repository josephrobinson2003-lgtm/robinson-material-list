import { unconfiguredBackend } from "./backend.js";
import { materialPayload, postBackend, readDeviceConfig, saveDeviceConfig } from "./device-config.js";
import { readableLines, toCsv, buildEmployeeExport } from "./export-contract.js";
import { jobIdForLabel } from "./ids.js";
import { loadJobBook, rememberJob, saveJobBook } from "./jobs.js";
import { photoManifest, planPhoto, uploadPhoto, STAGES, KNOWN_CONTRACTORS } from "./job-photos.js";
import { photoServiceStatus } from "./photo-backend.js";
import { armTracking, geofenceCapabilities, getNativeGeofence, suggestJobFromFix } from "./native-bridge.js";
import { resolveTheme, themeBanner, themeDecor, themeGreeting, themeRing, THEME_IDS, THEME_LABELS } from "./holiday-theme.js";
import { markPrivacyNoticeRead, privacyNoticeSeen, privacyParagraphs } from "./privacy-notice.js";
import { createWebSecureStore } from "./secure-store.js";
import { createBrowserBlobStore, createBrowserStore } from "./storage.js";
import { flushQueue } from "./sync-queue.js";
import {
  acceptSuggestion, acknowledgePrivacy, applyGeofenceEvent, confirmDay, confirmDidNotWork,
  confirmJob, deletePin, editEntry, emptyState, manualStart, rejectSuggestion, reviewDay,
  savePin, setEmployeeName, setJobDraft, setLocationOptIn, stopInterval, switchOrInsert
} from "./timecard-model.js";
import { formatChicagoDay, formatChicagoLabel, dutyDateOf, reportWeek, chicagoParts, elapsedMinutes, chicagoWallToUtc } from "./chicago-time.js";
import { billableMinutes } from "./pay-rules.js";
import { trackingLabel } from "./tracking-status.js";

const secure = createWebSecureStore();
let state = emptyState();
let jobs = { jobs: [] };
let tracking = null;
let suggestion = null;
let photoMessage = "";
let timeMessage = "";
let scopeView = null;
let scopeMessage = "";
let privacyOpen = false;
let serverHealthy = false;
let serverOpen = false;
let themeOverride = "";
let logoTaps = 0;
let moreOpen = false;
let confirmOutOpen = false;
let jobPickerOpen = false;
let punchFlash = "";
let punchBusy = false;
let pickerNote = "Pick the job, then punch in.";
let blobStore = null;
let bookStore = null;

function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

function $(id) { return document.getElementById(id); }

export async function startCrewApp() {
  bookStore = createBrowserStore();
  blobStore = createBrowserBlobStore();
  const loaded = await bookStore.load();
  state = loaded || emptyState();
  state.photos = state.photos || [];
  if (!state.employeeId) state = setEmployeeName(state, "").state;
  if (!state.employeeName) {
    try {
      const prior = localStorage.getItem("re_employee_name") || "";
      if (prior) state = setEmployeeName(state, prior).state;
    } catch { /* keep blank */ }
  }
  jobs = loadJobBook();
  try { privacyOpen = !privacyNoticeSeen(localStorage); } catch { privacyOpen = true; }
  await refreshServerHealth();
  const flushed = await flushQueue(state, unconfiguredBackend());
  state = flushed.state;
  tracking = await geofenceCapabilities();
  await drainNativeEvents();
  draw();
  paintHoliday(themeOverride);
  setInterval(paintClock, 1000);
  const logo = document.getElementById("logo_wrap");
  if (logo) logo.addEventListener("click", () => {
    logoTaps += 1;
    if (logoTaps < 5) return;
    logoTaps = 0;
    openHolidayPreview();
  });
  wireMaterials();
  window.RobinsonBackend = {
    submitMaterial(list) {
      const config = readDeviceConfig(localStorage);
      if (!config.configured) return Promise.resolve({ ok: false, reason: "not-configured" });
      return postBackend(config, "/api/materials", materialPayload(list));
    }
  };
  window.RobinsonJobs = {
    idFor: jobIdForLabel,
    remember(label) {
      const result = rememberJob(jobs, label);
      jobs = result.book;
      saveJobBook(jobs);
      fillJobList();
      return result.job;
    }
  };
}

function fillJobList() {
  const list = $("shared_jobs");
  if (!list) return;
  list.innerHTML = jobs.jobs.map((job) => '<option value="' + esc(job.jobLabel) + '"></option>').join("");
}

function wireMaterials() {
  const address = $("h_address");
  if (!address) return;
  address.setAttribute("list", "shared_jobs");
  address.addEventListener("change", () => {
    if (!address.value.trim()) return;
    const result = rememberJob(jobs, address.value);
    jobs = result.book;
    saveJobBook(jobs);
    fillJobList();
  });
  fillJobList();
}

async function persist() {
  await bookStore.save(state);
}

function statusWord(status) {
  if (status === "uploaded") return "Uploaded";
  if (status === "pending-upload") return "Pending upload";
  if (status === "failed") return "Failed — still on this phone";
  return "Saved on this phone";
}

function openClockEntry() {
  const entry = (state.entries || []).find((item) => {
    const row = item.revisions[item.revisions.length - 1];
    return row.status === "recorded" && !row.end;
  });
  if (!entry) return null;
  return { entry, row: entry.revisions[entry.revisions.length - 1] };
}

function shortChicagoDay(dutyDate) {
  const parsed = chicagoWallToUtc(dutyDate, "12:00");
  if (!parsed.ok) return dutyDate;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(parsed.date);
}

function plainTime(iso) {
  if (!iso) return "—";
  const p = chicagoParts(iso);
  let hour = Number(p.hour);
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return hour + ":" + p.minute + " " + suffix;
}

function formatHours(mins) {
  const total = Math.max(0, Math.round(mins));
  return Math.floor(total / 60) + "h " + String(total % 60).padStart(2, "0") + "m";
}

function statusSentence(open) {
  if (!open) return "You're off the clock";
  const since = plainTime(open.row.start);
  if (open.row.kind === "break") return "You're on a paid break since " + since;
  return "You're clocked in at " + (open.row.jobLabel || "the job") + " since " + since;
}

function rowPaidMinutes(item, now) {
  const row = item.row;
  if (row.status !== "recorded" || !row.start) return 0;
  const end = row.end || now.toISOString();
  const elapsed = elapsedMinutes(row.start, end);
  if (elapsed == null) return 0;
  const travel = row.kind === "work" && row.end && item.travel ? (item.travel.travelMinutes || 0) : 0;
  return billableMinutes({ kind: row.kind, elapsedMinutes: elapsed, travelMinutes: travel });
}

function punchRows(review, now) {
  const items = review.visits.concat(review.breaks).slice().sort((a, b) => new Date(a.row.start || 0) - new Date(b.row.start || 0));
  if (!items.length) return "<p>No punches yet today.</p>";
  return items.map((item, index) => {
    const row = item.row;
    const last = index === items.length - 1;
    const fresh = last && punchFlash ? " fresh" : "";
    const suggested = row.status === "suggested";
    const stamp = row.kind === "break" ? "BREAK" : (row.end ? "OUT" : "IN");
    const stampClass = row.end || row.kind === "break" ? "ink-stamp out" : "ink-stamp";
    const when = row.kind === "break"
      ? plainTime(row.start) + " to " + (row.end ? plainTime(row.end) : "now")
      : "IN " + plainTime(row.start) + " · OUT " + (row.end ? plainTime(row.end) : "—");
    const note = row.kind === "work" && !suggested
      ? '<label class="f">Work note, optional</label><input class="t" maxlength="200" data-note="' + esc(item.entry.entryId) + '" value="' + esc(row.workNote || "") + '">'
      : "";
    const choice = suggested
      ? '<div class="actions"><button type="button" class="btn secondary" data-accept="' + esc(item.entry.entryId) + '">Accept suggestion</button><input class="t" placeholder="Why remove it"><button type="button" class="btn secondary" data-reject="' + esc(item.entry.entryId) + '">Remove</button></div>'
      : "";
    const tag = suggested ? "Suggested — not hours yet" : (row.end ? "" : "Open");
    return `<div class="punch-row"><span><span class="${stampClass}${fresh}">${stamp}</span></span><span><b>${esc(row.jobLabel || "Job")}</b>${tag ? ' <span class="pill">' + esc(tag) + "</span>" : ""}<div class="when">${esc(when)}</div>${note}${choice}</span></div>`;
  }).join("");
}

function clockHousing() {
  const playing = punchFlash && motionOk() ? " punch-playing" : "";
  return `<section class="timeclock${playing}" aria-label="Time clock">
    <div class="clock-screws" aria-hidden="true"><span></span><span></span></div>
    <div class="clock-well">
      <div class="clock-face" id="punch_face" aria-hidden="true"><svg id="punch_svg" viewBox="0 0 200 200"></svg></div>
      <div class="date-window" id="punch_date"></div>
      <p class="clock-digits" id="punch_digits"></p>
    </div>
    <div class="clock-screws" aria-hidden="true"><span></span><i></i></div>
  </section>`;
}

function jobPickerHtml() {
  const buttons = (jobs.jobs || []).map((job) => '<button type="button" class="listpick" data-pick-job="' + esc(job.jobLabel) + '">' + esc(job.jobLabel) + "</button>").join("");
  return `<div class="job-picker" role="dialog" aria-labelledby="pick_title">
    <h2 id="pick_title">Which job?</h2>
    <p>${esc(pickerNote)}</p>
    ${buttons || "<p>No jobs saved on this phone yet. Type the address.</p>"}
    <label class="f" for="tc_pick_text">Job address</label>
    <input class="t" id="tc_pick_text" value="${esc(state.jobDraft || "")}" autocomplete="off">
    <button type="button" class="punch-lever in" id="tc_pick_go">CLOCK IN</button>
    <button type="button" class="btn secondary punch-side" id="tc_pick_cancel">Cancel</button>
  </div>`;
}

function confirmOutHtml(open) {
  return `<div class="punch-confirm" role="dialog" aria-labelledby="out_title">
    <h2 id="out_title">Clock out?</h2>
    <p>${esc(statusSentence(open))}</p>
    <button type="button" class="punch-lever out" id="tc_out_yes">CLOCK OUT</button>
    <button type="button" class="btn secondary punch-side" id="tc_out_no">Stay clocked in</button>
  </div>`;
}

function motionOk() {
  return typeof matchMedia !== "function" || !matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function haptic() {
  if (!motionOk() || !navigator.vibrate) return;
  navigator.vibrate(35);
}

function paintClock() {
  const digits = $("punch_digits");
  if (!digits) return;
  const now = new Date();
  const parts = chicagoParts(now);
  let hour = Number(parts.hour);
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  digits.textContent = hour + ":" + parts.minute + ":" + parts.second + " " + suffix;
  const date = $("punch_date");
  if (date) date.textContent = formatChicagoDay(parts.dutyDate);
  const total = $("today_total");
  if (total) {
    const base = Number(total.getAttribute("data-base") || 0);
    const openStart = total.getAttribute("data-open");
    const extra = openStart ? (elapsedMinutes(openStart, now.toISOString()) || 0) : 0;
    total.textContent = "Total today " + formatHours(base + extra);
  }
  const svg = $("punch_svg");
  if (!svg) return;
  const h = Number(parts.hour) % 12;
  const m = Number(parts.minute);
  const s = Number(parts.second);
  const hourAngle = (h + m / 60) * 30;
  const minuteAngle = (m + s / 60) * 6;
  const secondAngle = s * 6;
  svg.innerHTML = clockSvg(hourAngle, minuteAngle, secondAngle);
}

function clockSvg(hourAngle, minuteAngle, secondAngle) {
  let ticks = "";
  for (let i = 0; i < 60; i += 1) {
    const major = i % 5 === 0;
    const rad = (i * 6 - 90) * Math.PI / 180;
    const inner = major ? 72 : 80;
    const outer = 90;
    ticks += '<line x1="' + (100 + Math.cos(rad) * inner).toFixed(1) + '" y1="' + (100 + Math.sin(rad) * inner).toFixed(1) + '" x2="' + (100 + Math.cos(rad) * outer).toFixed(1) + '" y2="' + (100 + Math.sin(rad) * outer).toFixed(1) + '" stroke="#111" stroke-width="' + (major ? 3 : 1) + '"/>';
  }
  const numerals = [[12, 100, 36], [3, 164, 106], [6, 100, 176], [9, 36, 106]].map(([n, x, y]) =>
    '<text x="' + x + '" y="' + y + '" text-anchor="middle" font-size="16" font-family="Georgia, serif" font-weight="700" fill="#111">' + n + "</text>"
  ).join("");
  const hand = (angle, length, width) => '<line x1="100" y1="100" x2="100" y2="' + (100 - length) + '" stroke="#111" stroke-width="' + width + '" stroke-linecap="round" transform="rotate(' + angle.toFixed(2) + ' 100 100)"/>';
  return '<circle cx="100" cy="100" r="96" fill="#f7f1e4" stroke="#111" stroke-width="4"/>' +
    ticks + numerals +
    hand(hourAngle, 46, 6) + hand(minuteAngle, 68, 4) +
    '<line x1="100" y1="100" x2="100" y2="38" stroke="#9d1c1c" stroke-width="2" stroke-linecap="round" transform="rotate(' + secondAngle.toFixed(2) + ' 100 100)"/>' +
    '<circle cx="100" cy="100" r="5" fill="#111"/>';
}

function clockScreen(review, week, syncLine) {
  const open = openClockEntry();
  const on = !!open;
  const now = new Date();
  let base = 0;
  let openStart = "";
  review.visits.concat(review.breaks).forEach((item) => {
    if (item.row.status !== "recorded" || !item.row.start) return;
    if (!item.row.end) {
      openStart = item.row.start;
      return;
    }
    base += rowPaidMinutes(item, now);
  });
  const blocks = review.blockers.map((item) => {
    if (item === "review-suggestions") return "Accept or remove each suggested visit before you confirm.";
    if (item === "missing-end") return "A visit is missing a start or end. Set it before you confirm. Nothing was guessed.";
    if (item === "overlap") return "Two intervals overlap. Change them before you confirm.";
    return item;
  });
  let action = '<button type="button" class="punch-lever ' + (on ? "out" : "in") + '" id="tc_punch">' + (on ? "CLOCK OUT" : "CLOCK IN") + "</button>";
  if (on && open.row.kind === "break") action += '<button type="button" class="btn secondary punch-side" id="tc_resume">Back to work</button>';
  else if (on) action += '<button type="button" class="btn secondary punch-side" id="tc_break">Paid break</button>';
  if (confirmOutOpen) action = confirmOutHtml(open);
  else if (jobPickerOpen) action = jobPickerHtml();
  return `<p class="punch-status" id="tc_status" role="status">${esc(statusSentence(open))}</p>
    ${action}
    ${clockHousing(open)}
    <p class="hint" id="tc_msg">${esc(timeMessage)}</p>
    <section class="paper-card" aria-label="Today's time card">
      <div class="card-head">
        <label class="card-name">Employee<input id="tc_name" value="${esc(state.employeeName)}" autocomplete="name"></label>
        <div class="card-week">Week ending<br>${esc(shortChicagoDay(week.weekEnd))}</div>
      </div>
      ${punchRows(review, now)}
      <p class="today-total" id="today_total" data-base="${base}" data-open="${esc(openStart)}">Total today ${esc(formatHours(base))}</p>
      <p class="hint">${esc(syncLine)}</p>
    </section>
    ${blocks.map((line) => '<p class="warn">' + esc(line) + "</p>").join("")}
    <button type="button" class="btn" id="tc_confirm" ${(review.canConfirm && !dayAlreadyConfirmed(review)) ? "" : "disabled"}>${dayAlreadyConfirmed(review) ? "Day confirmed" : "Confirm my day"}</button>`;
}

function draw() {
  const root = $("crew_panels");
  if (!root) return;
  const today = dutyDateOf(new Date());
  const week = reportWeek(new Date());
  const review = reviewDay(state, today);
  const track = trackingLabel(tracking);
  const auth = photoServiceStatus();
  const connected = readDeviceConfig(localStorage).configured && serverHealthy;
  const syncLine = connected
    ? "Confirmed hours go to Joe's private sheet. Sunday email is sent from there."
    : "Sunday email is not connected.";
  root.innerHTML = `
    <section id="timecards_panel" class="crew" hidden>
      ${privacyOpen ? `<section class="card" id="privacy_card"><h2>Privacy</h2><div class="fields"><div class="full noticebody">${privacyParagraphs(connected).map((p) => "<p>" + esc(p) + "</p>").join("")}
        <button type="button" class="btn secondary" id="privacy_ok">Notice read</button></div></div></section>` : ""}
      ${clockScreen(review, week, syncLine)}
      <details class="more" id="tc_more" ${moreOpen ? "open" : ""}>
        <summary>More</summary>
        <div class="more-body">
          <label class="f" for="tc_job">Job address</label>
          <input class="t" id="tc_job" list="shared_jobs" value="${esc(state.jobDraft)}">
          <p class="hint"><b>${esc(track.title)}</b> ${esc(track.detail)} Suggestions watch saved jobs only while you leave them on for today. That is not a driving route.</p>
          <label class="checkline"><input type="checkbox" id="tc_optin" ${state.locationOptIn ? "checked" : ""}> Allow a location suggestion when I tap the button</label>
          <div class="actions">
            <button type="button" class="btn secondary" id="tc_use">Use this job</button>
            <button type="button" class="btn secondary" id="tc_suggest">Suggest job from where I am</button>
            <button type="button" class="btn secondary" id="tc_arm">Arm job-site suggestions</button>
            <button type="button" class="btn secondary" id="tc_spot">Save this spot for matching</button>
          </div>
          <h3>Saved spots</h3>
          ${spotsHtml()}
          <div class="actions">
            <button type="button" class="btn secondary" id="tc_json">Download my hours (JSON)</button>
            <button type="button" class="btn secondary" id="tc_csv">Download my hours (CSV)</button>
            <button type="button" class="btn secondary" id="tc_pdf">Download my hours (PDF)</button>
          </div>
          <button type="button" class="btn secondary" id="tc_off">I didn't work this day</button>
          <p class="hint"><button type="button" class="textlink" id="holiday_previews">Holiday previews</button> · <button type="button" class="textlink privacy-reopen">Privacy notice</button></p>
        </div>
      </details>
      ${serverCard()}
    </section>
    <section id="photos_panel" class="crew" hidden>
      <p class="pilot">Job photos are not connected. Employees do not sign in to Microsoft.</p>
      <div class="statusline"><b>Not connected</b><span>Joe connects the private photo server once. Browsing and upload stay off until then. Pictures you pick stay on this phone.</span></div>
      <section class="card"><h2>Look up a past job</h2>
        <p class="hint">Contractor, then job address, then Rough-In, Trim, or Finished. No photos are loaded while the server is off. Nothing here can be deleted or renamed.</p>
        <p id="ph_browse">${esc(auth.reason === "not-connected" ? "Past photos are not loaded." : "")}</p>
      </section>
      <section class="card"><h2>Add photos</h2>
        <div class="fields">
          <div class="full"><label class="f" for="ph_contractor">Contractor</label><select class="t" id="ph_contractor">${KNOWN_CONTRACTORS.map((name) => '<option value="' + esc(name) + '">' + esc(name) + "</option>").join("")}</select></div>
          <div class="full"><label class="f" for="ph_job">Job address</label><input class="t" id="ph_job" list="shared_jobs" value="${esc(state.jobDraft)}"></div>
          <div class="full"><label class="f" for="ph_stage">Stage</label><select class="t" id="ph_stage">${STAGES.map((stage) => '<option value="' + stage.id + '">' + esc(stage.label) + "</option>").join("")}</select></div>
        </div>
        <div class="actions">
          <button type="button" class="btn secondary" id="ph_use">Use this job</button>
          <button type="button" class="btn secondary" id="ph_suggest">Suggest job from where I am</button>
          <label class="btn secondary attach" for="ph_files">Add photos</label>
          <input class="filepick" id="ph_files" type="file" accept="image/*" multiple>
          <button type="button" class="btn" id="ph_upload">Upload</button>
        </div>
        <p class="hint">Add photos uses the phone's picker for pictures you choose. It does not open the whole camera roll, and where you are now is not treated as the place an older photo was taken. The file name is chosen for you.</p>
        <p class="hint">${esc(photoMessage)}</p>
        <div id="ph_list">${photoHtml()}</div>
      </section>
    </section>
    <section id="scope_panel" class="crew" hidden>
      <p class="pilot">Bid tasks only. Prices are not shown.</p>
      <section class="card"><h2>Scope</h2>
        <p class="hint">${esc(scopeMessage || "Find the bid from where you are, or pick the job.")}</p>
        ${scopeHtml()}
        <div class="actions">
          <button type="button" class="btn secondary" id="scope_find">Find bid from where I am</button>
        </div>
        <h3>Or pick a job</h3>
        <div id="scope_jobs">${jobs.jobs.map((job) => '<button type="button" class="listpick" data-scope-job="' + esc(job.jobId) + '">' + esc(job.jobLabel) + "</button>").join("") || "<p>No jobs saved on this phone yet.</p>"}</div>
      </section>
    </section>`;
  $("tc_name").addEventListener("change", async () => {
    state = setEmployeeName(state, $("tc_name").value).state;
    await persist();
  });
  $("tc_job").addEventListener("input", () => { state = setJobDraft(state, $("tc_job").value).state; });
  if ($("privacy_ok")) $("privacy_ok").addEventListener("click", async () => {
    markPrivacyNoticeRead(localStorage);
    state = acknowledgePrivacy(state).state;
    privacyOpen = false;
    await persist();
    draw();
    restoreTab();
  });
  $("tc_optin").addEventListener("change", async () => {
    state = setLocationOptIn(state, $("tc_optin").checked, new Date()).state;
    await persist();
    timeMessage = state.locationOptIn ? "Location suggestions can run when you tap the button." : "Location suggestions are off.";
    draw(); restoreTab();
  });
  $("tc_use").addEventListener("click", () => useJob($("tc_job").value));
  $("ph_use").addEventListener("click", () => useJob($("ph_job").value));
  $("tc_suggest").addEventListener("click", () => suggestJob("timecards"));
  $("ph_suggest").addEventListener("click", () => suggestJob("photos"));
  if ($("tc_punch")) $("tc_punch").addEventListener("click", () => onPunch());
  if ($("tc_break")) $("tc_break").addEventListener("click", () => startKind("break"));
  if ($("tc_resume")) $("tc_resume").addEventListener("click", () => {
    const open = openClockEntry();
    startKind("work", open ? open.row.jobLabel : "");
  });
  if ($("tc_out_yes")) $("tc_out_yes").addEventListener("click", () => finishClockOut());
  if ($("tc_out_no")) $("tc_out_no").addEventListener("click", () => { confirmOutOpen = false; draw(); restoreTab(); });
  if ($("tc_pick_cancel")) $("tc_pick_cancel").addEventListener("click", () => { jobPickerOpen = false; draw(); restoreTab(); });
  if ($("tc_pick_go")) $("tc_pick_go").addEventListener("click", () => finishClockIn($("tc_pick_text").value));
  document.querySelectorAll("[data-pick-job]").forEach((button) => button.addEventListener("click", () => {
    const field = $("tc_pick_text");
    if (field) field.value = button.getAttribute("data-pick-job");
    finishClockIn(button.getAttribute("data-pick-job"));
  }));
  $("tc_spot").addEventListener("click", () => saveCurrentSpot());
  $("tc_arm").addEventListener("click", async () => {
    const result = await armTracking(state.pins || [], dutyDateOf(new Date()));
    timeMessage = result.ok ? "Armed." : "Job-site suggestions stay off in this browser. " + (result.reason || "");
    draw(); restoreTab();
  });
  $("tc_confirm").addEventListener("click", async () => {
    const result = confirmDay(state, today, new Date());
    timeMessage = result.ok ? "Your day is confirmed. It is still only saved on this phone." : "Review the list before confirming.";
    if (result.ok) {
      state = result.state;
      try {
        const remote = await postBackend(readDeviceConfig(localStorage), "/api/timecards/confirm", {
          dutyDate: today,
          confirmedAt: new Date().toISOString(),
          entries: buildEmployeeExport(state).entries.concat(buildEmployeeExport(state).outsidePayWeek || []).filter((row) => row.dutyDate === today && row.confirmationState === "confirmed" && !row.superseded)
        });
        timeMessage = remote.acknowledged
          ? "Your day is confirmed and the server accepted it. Sunday email is sent by the server, not this phone."
          : "Your day is confirmed on this phone. The server is not connected, so nothing was emailed.";
      } catch (err) {
        timeMessage = "Your day is confirmed on this phone. The server did not answer.";
      }
    }
    await persist(); draw(); restoreTab();
  });
  const previews = $("holiday_previews");
  if (previews) previews.addEventListener("click", () => openHolidayPreview());
  const more = $("tc_more");
  if (more) more.addEventListener("toggle", () => { moreOpen = more.open; });
  if ($("server_change")) $("server_change").addEventListener("click", () => {
    serverOpen = true;
    draw();
    restoreTab();
  });
  if ($("cfg_save")) $("cfg_save").addEventListener("click", async () => {
    const saved = saveDeviceConfig(localStorage, { url: $("cfg_url").value.trim(), token: $("cfg_token").value.trim() });
    timeMessage = saved.ok ? "Server setup saved on this phone." : "Enter the https web app address and the token from Joe.";
    if (saved.ok) {
      try {
        const health = await postBackend(readDeviceConfig(localStorage), "/api/health", {});
        serverHealthy = !!(health.ok && health.data && health.data.ok !== false);
        if (health.data && typeof health.data.theme === "string") themeOverride = health.data.theme;
        serverOpen = !serverHealthy;
        timeMessage = serverHealthy ? "Connected to Robinson Electrical." : "Saved on this phone. The server did not answer.";
        paintHoliday(themeOverride);
      } catch (err) {
        serverHealthy = false;
        serverOpen = true;
        timeMessage = "Saved on this phone. The server did not answer.";
      }
    }
    draw(); restoreTab();
  });
  $("tc_off").addEventListener("click", async () => {
    const result = confirmDidNotWork(state, today, new Date());
    timeMessage = result.ok ? "Recorded that you did not work. No hours were added." : "Resolve open items, or confirm the hours you entered.";
    if (result.ok) state = result.state;
    await persist(); draw(); restoreTab();
  });
  $("tc_json").addEventListener("click", () => download("timecard.json", JSON.stringify(buildEmployeeExport(state), null, 2), "application/json"));
  $("tc_csv").addEventListener("click", () => download("timecard.csv", toCsv(buildEmployeeExport(state)), "text/csv"));
  $("tc_pdf").addEventListener("click", () => downloadPdf());
  $("ph_files").addEventListener("change", (event) => addFiles(event.target.files));
  $("scope_find").addEventListener("click", () => findScopeFromHere());
  root.querySelectorAll("[data-scope-job]").forEach((button) => button.addEventListener("click", () => {
    findScopeByJob(button.getAttribute("data-scope-job"), button.textContent);
  }));
  $("ph_upload").addEventListener("click", async () => {
    photoMessage = "Not connected. Photos stay on this phone. Nothing was uploaded.";
    for (let i = 0; i < state.photos.length; i += 1) {
      const result = await uploadPhoto(state.photos[i], { configured: false });
      state.photos[i] = result.photo;
    }
    await persist(); draw(); show("photos");
  });
  root.querySelectorAll("[data-accept]").forEach((button) => button.addEventListener("click", async () => {
    const result = acceptSuggestion(state, button.getAttribute("data-accept"), new Date());
    if (result.ok) state = result.state;
    timeMessage = result.ok ? "Suggestion added to your day. Confirm the day when the review looks right." : "That suggestion needs a start and an end first.";
    await persist(); draw(); restoreTab();
  }));
  root.querySelectorAll("[data-reject]").forEach((button) => button.addEventListener("click", async () => {
    const reason = button.parentElement.querySelector("input").value;
    const result = rejectSuggestion(state, button.getAttribute("data-reject"), reason, new Date());
    timeMessage = result.ok ? "Suggestion removed from your hours." : "Say why you are removing it.";
    if (result.ok) state = result.state;
    await persist(); draw(); restoreTab();
  }));
  root.querySelectorAll("[data-note]").forEach((input) => input.addEventListener("change", async () => {
    const result = editEntry(state, input.getAttribute("data-note"), { workNote: input.value }, new Date());
    timeMessage = result.ok ? "Note saved on this phone." : "The note is limited to 200 characters.";
    if (result.ok) state = result.state;
    await persist();
  }));
  root.querySelectorAll("[data-drop-pin]").forEach((button) => button.addEventListener("click", async () => {
    state = deletePin(state, button.getAttribute("data-drop-pin"), new Date()).state;
    await persist(); draw(); restoreTab();
  }));
  fillJobList();
  paintClock();
  if (punchFlash) {
    const flash = punchFlash;
    setTimeout(() => { if (punchFlash === flash) punchFlash = ""; }, 900);
  }
  restoreTab();
}

function reviewHtml(review) {
  const blocks = review.blockers.map((item) => {
    if (item === "review-suggestions") return "Accept or remove each suggested visit before you confirm.";
    if (item === "missing-end") return "A visit is missing a start or end. Set it before you confirm. Nothing was guessed.";
    if (item === "overlap") return "Two intervals overlap. Change them before you confirm.";
    return item;
  });
  return `<section class="card"><h2>Review today before you confirm</h2><div class="fields"><div class="full">
    ${blocks.map((line) => '<p class="warn">' + esc(line) + "</p>").join("")}
    <h3>Job visits</h3>
    ${review.visits.length ? review.visits.map(rowHtml).join("") : "<p>No job visits yet.</p>"}
    <h3>Breaks</h3>
    <p class="hint">Paid. Not subtracted.</p>
    ${review.breaks.length ? review.breaks.map(rowHtml).join("") : "<p>No breaks recorded.</p>"}
    <h3>Travel</h3>
    <p class="hint">Travel between jobs is added to the next job.</p>
  </div></div></section>`;
}

function revisionConfirmed(entryId, revision) {
  return (state.confirmations || []).some((confirmation) =>
    (confirmation.entries || []).some((ref) => ref.entryId === entryId && ref.revision === revision)
  );
}

function dayAlreadyConfirmed(review) {
  const recorded = review.visits.concat(review.breaks, review.travel)
    .filter((item) => item.row.status === "recorded" && item.row.start && item.row.end);
  return recorded.length > 0 && recorded.every((item) => revisionConfirmed(item.entry.entryId, item.row.revision));
}

function rowHtml(item) {
  const row = item.travel ? { ...item.row, ...item.travel } : item.row;
  let label = "Provisional";
  if (row.status === "suggested") label = "Suggested — not hours yet";
  else if (!row.start || !row.end) label = "Open — end missing";
  else if (revisionConfirmed(item.entry.entryId, row.revision)) label = "Confirmed";
  const note = row.kind === "work" ? '<label class="f">Work note, optional</label><input class="t" maxlength="200" data-note="' + esc(item.entry.entryId) + '" value="' + esc(row.workNote || "") + '">' : "";
  const choice = row.status === "suggested" ? '<div class="actions"><button type="button" class="btn secondary" data-accept="' + esc(item.entry.entryId) + '">Accept suggestion</button><input class="t" placeholder="Why remove it"><button type="button" class="btn secondary" data-reject="' + esc(item.entry.entryId) + '">Remove</button></div>' : "";
  const travelLine = row.travelMinutes ? "<p>" + esc(row.travelMinutes) + " min travel from " + esc(row.travelFromJobLabel || "the previous job") + " is included on this job.</p>" : "";
  const when = row.intervalStart && row.intervalStart !== row.start
    ? esc(formatChicagoLabel(row.intervalStart)) + " to " + esc(row.end ? formatChicagoLabel(row.end) : "end not set") + " (on site " + esc(formatChicagoLabel(row.onSiteStart || row.start)) + ")"
    : esc(row.start ? formatChicagoLabel(row.start) : "start not set") + " to " + esc(row.end ? formatChicagoLabel(row.end) : "end not set");
  return `<article class="visit"><b>${esc(row.jobLabel)}</b> <span class="pill">${esc(label)}</span><p>${esc(row.kind)} · ${when}</p>${travelLine}${row.kind === "break" ? "<p>Paid break.</p>" : ""}${row.lowAccuracy ? "<p>Location was coarse or unavailable.</p>" : ""}${note}${choice}<p class="hint">${esc(statusWord(row.syncStatus))}</p></article>`;
}

function spotsHtml() {
  return (state.pins || []).map((pin) => '<p>' + esc(pin.jobLabel) + ' <button type="button" class="btn secondary" data-drop-pin="' + esc(pin.jobId) + '">Remove spot</button></p>').join("") || "<p>No saved spots.</p>";
}

function serverCard() {
  const config = readDeviceConfig(localStorage);
  if (config.configured && serverHealthy && !serverOpen) {
    return '<section class="card"><p class="connectedline">Connected to Robinson Electrical ✓ <button type="button" class="textlink" id="server_change">Change</button></p></section>';
  }
  const hint = config.configured
    ? "The address is saved on this phone. The token stays hidden."
    : "No server is configured. Time and photos stay on this phone.";
  const tokenHint = config.hasToken ? "Token saved. Paste a new one to replace it." : "Paste the token Joe gives you";
  return '<section class="card"><h2>Server</h2><p class="hint">' + esc(hint) + '</p><div class="fields"><div class="full"><label class="f" for="cfg_url">Backend web app URL</label><input class="t" id="cfg_url" value="' + esc(config.url) + '" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off"></div><div class="full"><label class="f" for="cfg_token">Employee token</label><input class="t" id="cfg_token" type="password" value="" placeholder="' + esc(tokenHint) + '" autocomplete="off"></div></div><button type="button" class="btn secondary" id="cfg_save">Save server setup</button></section>';
}

async function refreshServerHealth() {
  const config = readDeviceConfig(localStorage);
  if (!config.configured) {
    serverHealthy = false;
    return;
  }
  try {
    const health = await postBackend(config, "/api/health", {});
    serverHealthy = !!(health.ok && health.data && health.data.ok !== false);
    if (health.data && typeof health.data.theme === "string") themeOverride = health.data.theme;
  } catch {
    serverHealthy = false;
  }
}

function applyHoliday(root, theme) {
  if (!root) return;
  root.setAttribute("data-holiday", theme || "");
  const layer = root.querySelector(".logo-theme");
  const banner = root.querySelector(".holiday-banner");
  const greet = root.querySelector(".holiday-greet");
  const ring = root.querySelector(".light-ring");
  const tint = root.querySelector(".logo-tint");
  if (layer) {
    layer.innerHTML = theme ? themeDecor(theme) : "";
    layer.hidden = !theme || !themeDecor(theme);
  }
  if (banner) {
    banner.innerHTML = theme ? themeBanner(theme) : "";
    banner.hidden = !theme;
  }
  if (greet) {
    greet.textContent = theme ? themeGreeting(theme) : "";
    greet.hidden = !theme;
  }
  if (ring) {
    ring.innerHTML = theme ? themeRing(theme) : "";
    ring.hidden = !theme || !themeRing(theme);
  }
  if (tint) tint.hidden = theme !== "valentines";
  root.querySelectorAll(".santa-fly, .ghost").forEach((node) => {
    const extra = Math.random() * 8;
    const current = parseFloat(node.style.animationDelay) || 0;
    node.style.animationDelay = (current + extra).toFixed(2) + "s";
  });
}

function paintHoliday(override) {
  applyHoliday(document.getElementById("app_header"), resolveTheme(new Date(), override) || "");
}

function openHolidayPreview() {
  const panel = document.getElementById("holiday_preview");
  const list = document.getElementById("holiday_preview_list");
  const play = document.getElementById("holiday_preview_play");
  if (!panel || !list || !play) return;
  list.hidden = false;
  play.hidden = true;
  list.innerHTML = THEME_IDS.map((id) => '<button type="button" class="listpick" data-preview="' + id + '">' + (THEME_LABELS[id] || id) + "</button>").join("");
  list.querySelectorAll("[data-preview]").forEach((button) => {
    button.addEventListener("click", () => playHolidayPreview(button.getAttribute("data-preview")));
  });
  panel.hidden = false;
}

function playHolidayPreview(theme) {
  const list = document.getElementById("holiday_preview_list");
  const play = document.getElementById("holiday_preview_play");
  const stage = document.getElementById("holiday_preview_stage");
  if (list) list.hidden = true;
  if (play) play.hidden = false;
  applyHoliday(stage, theme);
}

function closeHolidayPreview() {
  const panel = document.getElementById("holiday_preview");
  if (panel) panel.hidden = true;
}

function scopeHtml() {
  if (!scopeView || !scopeView.tasks || !scopeView.tasks.length) {
    return "<p><b>No bid scope for this job</b></p>";
  }
  return "<p><b>" + esc(scopeView.address) + "</b></p><ol>" + scopeView.tasks.map((task) => {
    return '<li class="scope-task"><input type="checkbox" disabled aria-label="Task"><span>' + esc(task) + "</span></li>";
  }).join("") + "</ol>";
}

async function findScopeFromHere() {
  if (!state.locationOptIn) {
    scopeMessage = "Turn on location suggestions on Timecards, or pick the job below.";
    scopeView = null;
    draw(); show("scope");
    return;
  }
  if (!navigator.geolocation) {
    scopeMessage = "This phone did not provide location. Pick the job below.";
    scopeView = null;
    draw(); show("scope");
    return;
  }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    await loadScope({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyMeters: pos.coords.accuracy
    });
  }, () => {
    scopeMessage = "Location was denied. Pick the job below.";
    scopeView = null;
    draw(); show("scope");
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}

async function findScopeByJob(jobId) {
  await loadScope({ jobId: jobId });
}

async function loadScope(query) {
  const config = readDeviceConfig(localStorage);
  if (!config.configured) {
    scopeView = null;
    scopeMessage = "No bid scope for this job. The server is not connected.";
    draw(); show("scope");
    return;
  }
  try {
    const remote = await postBackend(config, "/api/scope", query);
    const scope = remote.data && remote.data.scope;
    if (scope && scope.tasks && scope.tasks.length) {
      scopeView = { jobId: scope.jobId, address: scope.address, tasks: scope.tasks };
      scopeMessage = "Matched " + scope.address + ".";
    } else {
      scopeView = null;
      scopeMessage = "No bid scope for this job.";
    }
  } catch (err) {
    scopeView = null;
    scopeMessage = "No bid scope for this job. The server did not answer.";
  }
  draw(); show("scope");
}

function photoHtml() {
  if (!state.photos.length) return "<p>No photos saved on this phone.</p>";
  return state.photos.map((photo) => `<article class="visit"><b>${esc(photo.fileName)}</b> <span class="pill">${esc(statusWord(photo.status))}</span>
    <p>${esc(photo.jobLabel)} · ${esc(photo.stageLabel)}</p>
    <p>${photo.captureTimeKnown ? "Camera clock: " + esc(photo.capturedAtRaw) + " (time zone unknown)" : "Camera time was not in the file. It was not guessed."}</p>
    <p>Added ${esc(formatChicagoLabel(photo.addedAt))}. Upload time: ${photo.uploadedAt ? esc(photo.uploadedAt) : "not uploaded"}.</p>
    <p>This photo's place was not taken from where the phone is now.</p></article>`).join("");
}

async function useJob(label) {
  const result = confirmJob(state, label);
  if (!result.ok) {
    timeMessage = "Type the job address first.";
    photoMessage = timeMessage;
  } else {
    state = result.state;
    const remembered = rememberJob(jobs, result.job.jobLabel);
    jobs = remembered.book;
    saveJobBook(jobs);
    timeMessage = "Using " + result.job.jobLabel + ".";
    photoMessage = "Job confirmed for photos: " + result.job.jobLabel + ".";
    await persist();
  }
  draw();
  restoreTab();
}

function onPunch() {
  if (punchBusy) return;
  if (openClockEntry()) {
    confirmOutOpen = true;
    jobPickerOpen = false;
    draw();
    restoreTab();
    return;
  }
  beginClockIn();
}

function beginClockIn() {
  confirmOutOpen = false;
  if (!(state.locationOptIn && navigator.geolocation)) {
    jobPickerOpen = true;
    pickerNote = "Pick the job, then punch in.";
    draw();
    restoreTab();
    return;
  }
  punchBusy = true;
  timeMessage = "Checking saved job spots…";
  draw();
  restoreTab();
  navigator.geolocation.getCurrentPosition((pos) => {
    punchBusy = false;
    const found = suggestJobFromFix(state.pins || [], {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracyMeters: pos.coords.accuracy
    });
    suggestion = found;
    if (found.match) finishClockIn(found.match.jobLabel);
    else {
      jobPickerOpen = true;
      pickerNote = "No saved spot matched. Pick the job, then punch in.";
      timeMessage = pickerNote;
      draw();
      restoreTab();
    }
  }, () => {
    punchBusy = false;
    jobPickerOpen = true;
    pickerNote = "Location was unavailable. Pick the job, then punch in.";
    timeMessage = pickerNote;
    draw();
    restoreTab();
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}

function finishClockIn(label) {
  punchBusy = false;
  jobPickerOpen = false;
  const field = $("tc_job");
  if (field && label) field.value = label;
  startKind("work", label);
}

async function finishClockOut() {
  confirmOutOpen = false;
  const result = stopInterval(state, new Date());
  timeMessage = result.ok ? "Clocked out. Review the card, then confirm the day. This is not payroll." : "Nothing is open to stop.";
  if (result.ok) {
    state = result.state;
    punchFlash = "OUT";
    haptic();
  }
  await persist();
  draw();
  restoreTab();
}

function startKind(kind, labelOverride) {
  let label = labelOverride != null ? String(labelOverride).trim() : (($("tc_job") && $("tc_job").value) || "").trim();
  const openEntry = state.entries.find((entry) => {
    const row = entry.revisions[entry.revisions.length - 1];
    return row.status === "recorded" && !row.end;
  });
  if (!label && openEntry) label = openEntry.revisions[openEntry.revisions.length - 1].jobLabel;
  const result = openEntry ? switchOrInsert(state, { jobLabel: label, kind, at: new Date() }) : manualStart(state, { jobLabel: label, kind, at: new Date() });
  if (result.ok) {
    state = result.state;
    const remembered = rememberJob(jobs, label);
    jobs = remembered.book;
    saveJobBook(jobs);
    if (kind === "work" && !openEntry) {
      punchFlash = "IN";
      haptic();
      timeMessage = "Clocked in. Review the card, then confirm the day. This is not payroll.";
    } else if (kind === "break") {
      timeMessage = "Paid break started. It stays in today's hours.";
    } else {
      timeMessage = "Back to work. Still provisional until you confirm the day.";
    }
  } else {
    timeMessage = "Enter the job first.";
    if (kind === "work" && !openEntry) jobPickerOpen = true;
  }
  persist().then(() => { draw(); restoreTab(); });
}

async function drainNativeEvents() {
  const native = getNativeGeofence();
  if (!native || typeof native.getPendingEvents !== "function") return;
  const pending = await native.getPendingEvents();
  const events = (pending && pending.events) || [];
  for (const event of events) {
    const result = applyGeofenceEvent(state, event);
    state = result.state;
  }
  if (events.length && typeof native.ackEvents === "function") {
    await native.ackEvents({ ids: events.map((event) => event.nativeEventId).filter(Boolean) });
    await persist();
  }
}

function saveCurrentSpot() {
  if (!state.locationOptIn) {
    timeMessage = "Turn on location suggestions first.";
    draw(); restoreTab(); return;
  }
  if (!state.jobConfirmed) {
    timeMessage = "Confirm the job, then save the spot while you are there.";
    draw(); restoreTab(); return;
  }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const result = savePin(state, {
      jobLabel: state.jobDraft,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracyMeters: pos.coords.accuracy,
      at: new Date()
    });
    timeMessage = result.ok ? "Saved this spot on this phone for later suggestions. The map point stays on this phone." : "That location was too coarse to save, or location was unavailable.";
    if (result.ok) state = result.state;
    await persist();
    draw(); restoreTab();
  }, () => {
    timeMessage = "Location was denied. The spot was not saved.";
    draw(); restoreTab();
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}

function suggestJob(tab) {
  if (!state.locationOptIn) {
    timeMessage = "Turn on location suggestions first. Nothing was read.";
    photoMessage = timeMessage;
    draw(); show(tab); return;
  }
  if (!navigator.geolocation) {
    timeMessage = "This phone did not provide location.";
    draw(); show(tab); return;
  }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const found = suggestJobFromFix(state.pins || [], {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracyMeters: pos.coords.accuracy
    });
    suggestion = found;
    const text = found.match
      ? "Suggested job: " + found.match.jobLabel + ". Tap Use this job. This does not clock you in, and it does not place an older photo."
      : "No saved job was a clear match (" + found.reason + "). Type the job yourself.";
    timeMessage = text;
    photoMessage = text;
    if (found.match) state = setJobDraft(state, found.match.jobLabel).state;
    draw(); show(tab);
  }, () => {
    timeMessage = "Location was denied or unavailable. Type the job yourself.";
    photoMessage = timeMessage;
    draw(); show(tab);
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}

async function addFiles(fileList) {
  const job = state.jobConfirmed ? { jobId: jobIdForLabel(state.jobDraft), jobLabel: state.jobDraft, confirmed: true } : null;
  const stage = $("ph_stage").value;
  if (!job) {
    photoMessage = "Confirm the job before adding photos.";
    draw(); show("photos"); return;
  }
  let added = 0;
  let duplicates = 0;
  for (const file of Array.from(fileList || [])) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const planned = await planPhoto({
    employeeId: state.employeeId,
    job,
    contractor: $("ph_contractor").value,
    stageId: stage,
    bytes,
    addedAt: new Date(),
    photos: state.photos
  });
    if (!planned.ok && planned.reason === "duplicate") { duplicates += 1; continue; }
    if (!planned.ok) { photoMessage = "Could not keep that photo (" + planned.reason + ")."; continue; }
    try {
      await blobStore.put(planned.photo.photoId, bytes);
    } catch {
      photoMessage = "Could not store the photo on this phone. It was not marked as saved.";
      continue;
    }
    state.photos.push(planned.photo);
    added += 1;
  }
  photoMessage = added + " photo" + (added === 1 ? "" : "s") + " saved on this phone." + (duplicates ? " " + duplicates + " duplicate skipped." : "") + " Not uploaded.";
  await persist();
  draw(); show("photos");
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadPdf() {
  const doc = buildEmployeeExport(state);
  if (!window.jspdf || !window.jspdf.jsPDF) {
    timeMessage = "PDF library did not load.";
    draw(); restoreTab(); return;
  }
  const pdf = new window.jspdf.jsPDF({ unit: "pt", format: "letter" });
  pdf.setFontSize(12);
  let y = 48;
  readableLines(doc).forEach((line) => {
    if (y > 740) { pdf.addPage(); y = 48; }
    pdf.text(String(line).slice(0, 90), 40, y);
    y += 16;
  });
  pdf.save("timecard.pdf");
}

function downloadUnused() { photoManifest(state.photos, state.employeeId); }

let currentTab = "materials";
function show(tab) {
  currentTab = tab;
  const materials = $("materials_panel");
  const bar = $("material_bar");
  const label = $("section_label");
  const time = $("timecards_panel");
  const photos = $("photos_panel");
  const scope = $("scope_panel");
  if (materials) materials.hidden = tab !== "materials";
  if (bar) bar.hidden = tab !== "materials";
  if (time) time.hidden = tab !== "timecards";
  if (photos) photos.hidden = tab !== "photos";
  if (scope) scope.hidden = tab !== "scope";
  if (label) {
    label.textContent = tab === "photos" ? "Job photos" : (tab === "timecards" ? "Time clock" : (tab === "scope" ? "Scope" : "Job Material List"));
  }
  document.querySelectorAll(".apptab").forEach((button) => {
    const on = button.getAttribute("data-tab") === tab;
    button.classList.toggle("on", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  });
}
function restoreTab() { show(currentTab); }

function bindTabs() {
  document.querySelectorAll(".apptab").forEach((button) => {
    button.addEventListener("click", () => show(button.getAttribute("data-tab")));
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    document.documentElement.classList.toggle("holiday-paused", document.visibilityState !== "visible");
  });
  document.addEventListener("click", (event) => {
    if (event.target && event.target.id === "holiday_preview_close") closeHolidayPreview();
    if (event.target && event.target.id === "holiday_preview_back") openHolidayPreview();
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest && event.target.closest(".privacy-reopen");
    if (!button) return;
    privacyOpen = true;
    draw();
    show("timecards");
  });
  window.addEventListener("DOMContentLoaded", () => {
    bindTabs();
    startCrewApp().catch(() => {
      const root = document.getElementById("crew_panels");
      if (root) root.textContent = "Timecards could not open on this phone.";
    });
  });
}

void secure;
void applyGeofenceEvent;
void downloadUnused;
void suggestion;
