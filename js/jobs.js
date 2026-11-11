/** Shared job names for materials, time, and photos on this phone.
 * The id is a hash of the address, so two phones that type the same address
 * get the same id. It is not a spreadsheet key and it has no price. */

import { jobIdForLabel, normalizeJobLabel } from "./ids.js";

export const JOBS_KEY = "re_shared_jobs_v1";

export function emptyJobBook() {
  return { jobs: [] };
}

export function rememberJob(book, label, at = new Date().toISOString()) {
  const jobLabel = normalizeJobLabel(label);
  const jobId = jobIdForLabel(jobLabel);
  if (!jobId) return { book: book || emptyJobBook(), job: null };
  const jobs = (book && book.jobs ? book.jobs : []).map(publicJob);
  const existing = jobs.find((job) => job.jobId === jobId);
  if (existing) return { book: { jobs }, job: existing };
  const job = { jobId, jobLabel, firstSeenAt: at };
  jobs.push(job);
  return { book: { jobs }, job };
}

export function publicJob(job) {
  return {
    jobId: job.jobId,
    jobLabel: job.jobLabel,
    firstSeenAt: job.firstSeenAt || ""
  };
}

export function loadJobBook(storage = globalThis.localStorage) {
  if (!storage) return emptyJobBook();
  try {
    const raw = storage.getItem(JOBS_KEY);
    if (!raw) return emptyJobBook();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.jobs)) return emptyJobBook();
    return { jobs: parsed.jobs.filter((job) => job && job.jobId && job.jobLabel).map(publicJob) };
  } catch {
    return emptyJobBook();
  }
}

export function saveJobBook(book, storage = globalThis.localStorage) {
  if (!storage) return false;
  storage.setItem(JOBS_KEY, JSON.stringify({ jobs: (book.jobs || []).map(publicJob) }));
  return true;
}
