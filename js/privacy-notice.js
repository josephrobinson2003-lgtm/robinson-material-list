/** Plain-language notice. This is not an App Store approval. */

export const PRIVACY_NOTICE_VERSION = 1;
const NOTICE_KEY = "re_privacy_notice_version";

export const PRIVACY_PARAGRAPHS = [
  "Robinson Electrical on this phone is a pilot for Joe and one employee. Each phone keeps that person's own time, material lists, and photos. You do not see the other person's hours.",
  "Apple has not reviewed or approved this app. Google has not either. Nothing here is an App Store listing.",
  "Job-site suggestions use location only after you agree, and only while you turn them on for today. The app is written to notice arrival and departure at saved jobs. It does not keep a driving route, and it does not watch you after you turn suggestions off.",
  "The pay week is Monday through Saturday. Sunday is the day the report is sent. A suggestion is not hours. You review visits, paid breaks, travel added to the next job, missing end times, and an optional work note, then you confirm your own day.",
  "This website cannot watch the job while the phone is locked. That needs the installed app, which is not published and has not been tested on a crew phone.",
  "Time entries on this website stay in this phone's browser storage. That is not the iPhone Keychain or Android keystore, and it is not advertised as encrypted. A sign-in token is not saved here.",
  "Breaks are paid time and are not taken out of the day. Travel from one job to the next is added to the next job. The drive to the first job and the drive home are not counted. Wages, bid prices, and profit are not in this app. The $100 and $85 boxes on a material list are the existing billing-hour fields, not your pay.",
  "Job photos live in a Job Photos folder, separate from Accounting. You do not sign in to Microsoft. Joe connects that folder once on the private server. Until then, photos you pick stay on this phone and are not uploaded. You cannot delete or rename them.",
  "The app does not read your contacts, and it has no ad tracker. Material-list pictures are only files you choose.",
  "Current location can suggest which job you are on. It does not show where an older gallery photo was taken.",
  "Joe has not set how long entries stay on the phone. The app does not delete them on a schedule. You can remove a job spot you saved."
];

export function privacyClosing(serverConfigured) {
  if (serverConfigured) {
    return "Confirmed hours go to Joe's private company sheet, and the Sunday email is sent from there.";
  }
  return "Sunday email and the company spreadsheet are not connected.";
}

export function privacyParagraphs(serverConfigured) {
  return PRIVACY_PARAGRAPHS.concat(privacyClosing(!!serverConfigured));
}

export function privacyNoticeSeen(storage, version = PRIVACY_NOTICE_VERSION) {
  if (!storage) return false;
  return storage.getItem(NOTICE_KEY) === String(version);
}

export function markPrivacyNoticeRead(storage, version = PRIVACY_NOTICE_VERSION) {
  if (!storage) return;
  storage.setItem(NOTICE_KEY, String(version));
}
