import { unconfiguredBackend } from "./backend.js";
import { readableLines, toCsv, buildEmployeeExport } from "./export-contract.js";
import { jobIdForLabel } from "./ids.js";
import { loadJobBook, rememberJob, saveJobBook } from "./jobs.js";
import { photoManifest, planPhoto, uploadPhoto, STAGES } from "./job-photos.js";
import { microsoftAuthStatus } from "./microsoft-auth.js";
import { armTracking, geofenceCapabilities, getNativeGeofence, suggestJobFromFix } from "./native-bridge.js";
import { PRIVACY_PARAGRAPHS } from "./privacy-notice.js";
import { createWebSecureStore } from "./secure-store.js";
import { createBrowserBlobStore, createBrowserStore } from "./storage.js";
import { flushQueue } from "./sync-queue.js";
import {
  acceptSuggestion, acknowledgePrivacy, applyGeofenceEvent, confirmDay, confirmDidNotWork,
  confirmJob, deletePin, editEntry, emptyState, manualStart, rejectSuggestion, reviewDay,
  savePin, setEmployeeName, setJobDraft, setLocationOptIn, stopInterval, switchOrInsert
} from "./timecard-model.js";
import { formatChicagoDay, formatChicagoLabel, dutyDateOf } from "./chicago-time.js";
import { trackingLabel } from "./tracking-status.js";

const secure = createWebSecureStore();
let state = emptyState();
let jobs = { jobs: [] };
let tracking = null;
let suggestion = null;
let photoMessage = "";
let timeMessage = "";
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
  const flushed = await flushQueue(state, unconfiguredBackend());
  state = flushed.state;
  tracking = await geofenceCapabilities();
  await drainNativeEvents();
  draw();
  wireMaterials();
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

function draw() {
  const root = $("crew_panels");
  if (!root) return;
  const today = dutyDateOf(new Date());
  const review = reviewDay(state, today);
  const track = trackingLabel(tracking);
  const auth = microsoftAuthStatus();
  root.innerHTML = `
    <section id="timecards_panel" class="crew" hidden>
      <p class="pilot">Pilot on this phone. Do not use these hours for payroll or billing yet.</p>
      <div class="statusline"><b>${esc(track.title)}</b><span>${esc(track.detail)}</span></div>
      <section class="card"><h2>Privacy</h2><div class="fields"><div class="full noticebody">${PRIVACY_PARAGRAPHS.map((p) => "<p>" + esc(p) + "</p>").join("")}
        <button type="button" class="btn secondary" id="privacy_ok">${state.privacyNoticeAcknowledged ? "Notice read" : "I have read this"}</button></div></div></section>
      <section class="card"><h2>Your time</h2><div class="fields">
        <div class="full"><label class="f" for="tc_name">Your name</label><input class="t" id="tc_name" value="${esc(state.employeeName)}" autocomplete="name"></div>
        <div class="full hint">Today is ${esc(formatChicagoDay(today))}. This phone is one person. Joe and the employee each confirm only their own day.</div>
        <div class="full"><label class="f" for="tc_job">Job</label><input class="t" id="tc_job" list="shared_jobs" value="${esc(state.jobDraft)}"></div>
        <label class="checkline"><input type="checkbox" id="tc_optin" ${state.locationOptIn ? "checked" : ""}> Allow a location suggestion when I tap the button</label>
      </div>
      <div class="actions">
        <button type="button" class="btn secondary" id="tc_use">Use this job</button>
        <button type="button" class="btn secondary" id="tc_suggest">Suggest job from where I am</button>
        <button type="button" class="btn new" id="tc_start">Start work</button>
        <button type="button" class="btn secondary" id="tc_break">Break</button>
        <button type="button" class="btn secondary" id="tc_travel">Travel</button>
        <button type="button" class="btn secondary" id="tc_stop">Stop</button>
        <button type="button" class="btn secondary" id="tc_arm">Arm job-site suggestions</button>
        <button type="button" class="btn secondary" id="tc_spot">Save this spot for matching</button>
      </div>
      <p class="hint" id="tc_msg">${esc(timeMessage)}</p>
      ${reviewHtml(review)}
      <div class="actions">
        <button type="button" class="btn" id="tc_confirm" ${(review.canConfirm && !dayAlreadyConfirmed(review)) ? "" : "disabled"}>${dayAlreadyConfirmed(review) ? "Day confirmed" : "Confirm my day"}</button>
        <button type="button" class="btn secondary" id="tc_off">I didn't work this day</button>
      </div>
      <p class="hint">Saved on this phone. Not uploaded. Sunday email is not set up.</p>
      <div class="actions">
        <button type="button" class="btn secondary" id="tc_json">Download my hours (JSON)</button>
        <button type="button" class="btn secondary" id="tc_csv">Download my hours (CSV)</button>
        <button type="button" class="btn secondary" id="tc_pdf">Download my hours (PDF)</button>
      </div></section>
    </section>
    <section id="photos_panel" class="crew" hidden>
      <p class="pilot">Pilot. Job photos are not connected to OneDrive.</p>
      <div class="statusline"><b>Not connected</b><span>${esc(auth.reason === "microsoft-auth-not-configured" ? "Microsoft sign-in is not set up. Upload stays off. Photos you add stay on this phone." : auth.reason)}</span></div>
      <section class="card"><h2>Job photos</h2>
        <div class="fields">
          <div class="full"><label class="f" for="ph_job">Confirmed job</label><input class="t" id="ph_job" list="shared_jobs" value="${esc(state.jobDraft)}"></div>
          <div class="full"><label class="f" for="ph_stage">Stage</label><select class="t" id="ph_stage">${STAGES.map((stage) => '<option value="' + stage.id + '">' + esc(stage.label) + "</option>").join("")}</select></div>
        </div>
        <div class="actions">
          <button type="button" class="btn secondary" id="ph_use">Use this job</button>
          <button type="button" class="btn secondary" id="ph_suggest">Suggest job from where I am</button>
          <label class="btn secondary attach" for="ph_files">Add photos</label>
          <input class="filepick" id="ph_files" type="file" accept="image/*" multiple>
          <button type="button" class="btn" id="ph_upload">Upload</button>
        </div>
        <p class="hint">Add photos uses the phone's picker for pictures you choose. It does not open the whole camera roll, and where you are now is not treated as the place an older photo was taken.</p>
        <p class="hint">${esc(photoMessage)}</p>
        <div id="ph_list">${photoHtml()}</div>
      </section>
    </section>`;
  $("tc_name").addEventListener("change", async () => {
    state = setEmployeeName(state, $("tc_name").value).state;
    await persist();
  });
  $("tc_job").addEventListener("input", () => { state = setJobDraft(state, $("tc_job").value).state; });
  $("privacy_ok").addEventListener("click", async () => { state = acknowledgePrivacy(state).state; await persist(); draw(); restoreTab(); });
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
  $("tc_start").addEventListener("click", () => startKind("work"));
  $("tc_break").addEventListener("click", () => startKind("break"));
  $("tc_travel").addEventListener("click", () => startKind("travel"));
  $("tc_stop").addEventListener("click", async () => {
    const result = stopInterval(state, new Date());
    timeMessage = result.ok ? "Stopped. Still provisional until you confirm the day." : "Nothing is open to stop.";
    if (result.ok) state = result.state;
    await persist(); draw(); restoreTab();
  });
  $("tc_spot").addEventListener("click", () => saveCurrentSpot());
  $("tc_arm").addEventListener("click", async () => {
    const result = await armTracking(state.pins || []);
    timeMessage = result.ok ? "Armed." : "Job-site suggestions stay off in this browser. " + (result.reason || "");
    draw(); restoreTab();
  });
  $("tc_confirm").addEventListener("click", async () => {
    const result = confirmDay(state, today, new Date());
    timeMessage = result.ok ? "Your day is confirmed. It is still only saved on this phone." : "Review the list before confirming.";
    if (result.ok) state = result.state;
    await persist(); draw(); restoreTab();
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
    ${review.breaks.length ? review.breaks.map(rowHtml).join("") : "<p>No breaks recorded. Add one if you took a break.</p>"}
    <h3>Travel</h3>
    ${review.travel.length ? review.travel.map(rowHtml).join("") : "<p>No travel recorded.</p>"}
    <h3>Saved spots</h3>
    ${(state.pins || []).map((pin) => '<p>' + esc(pin.jobLabel) + ' <button type="button" class="btn secondary" data-drop-pin="' + esc(pin.jobId) + '">Remove spot</button></p>').join("") || "<p>No saved spots.</p>"}
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
  const row = item.row;
  let label = "Provisional";
  if (row.status === "suggested") label = "Suggested — not hours yet";
  else if (!row.start || !row.end) label = "Open — end missing";
  else if (revisionConfirmed(item.entry.entryId, row.revision)) label = "Confirmed";
  const note = row.kind === "work" ? '<label class="f">Work note, optional</label><input class="t" maxlength="200" data-note="' + esc(item.entry.entryId) + '" value="' + esc(row.workNote || "") + '">' : "";
  const choice = row.status === "suggested" ? '<div class="actions"><button type="button" class="btn secondary" data-accept="' + esc(item.entry.entryId) + '">Accept suggestion</button><input class="t" placeholder="Why remove it"><button type="button" class="btn secondary" data-reject="' + esc(item.entry.entryId) + '">Remove</button></div>' : "";
  return `<article class="visit"><b>${esc(row.jobLabel)}</b> <span class="pill">${esc(label)}</span><p>${esc(row.kind)} · ${esc(row.start ? formatChicagoLabel(row.start) : "start not set")} to ${esc(row.end ? formatChicagoLabel(row.end) : "end not set")}</p>${row.lowAccuracy ? "<p>Location was coarse or unavailable.</p>" : ""}${note}${choice}<p class="hint">${esc(statusWord(row.syncStatus))}</p></article>`;
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

function startKind(kind) {
  let label = $("tc_job").value.trim();
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
    timeMessage = "Saved on this phone. Review the day, then confirm. This is not payroll.";
  } else timeMessage = "Enter the job first.";
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
    const planned = await planPhoto({ employeeId: state.employeeId, job, stageId: stage, bytes, addedAt: new Date(), photos: state.photos });
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
  if (materials) materials.hidden = tab !== "materials";
  if (bar) bar.hidden = tab !== "materials";
  if (time) time.hidden = tab !== "timecards";
  if (photos) photos.hidden = tab !== "photos";
  if (label) label.textContent = tab === "photos" ? "Job photos" : (tab === "timecards" ? "Timecards" : "Job Material List");
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
