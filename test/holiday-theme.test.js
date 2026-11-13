import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  THEME_IDS, holidayDate, monthWindows, themeForDutyDate, resolveTheme, themeDecor
} from "../js/holiday-theme.js";

const DATES = {
  2026: {
    "new-year": "2026-01-01",
    mlk: "2026-01-19",
    valentines: "2026-02-14",
    presidents: "2026-02-16",
    "st-patricks": "2026-03-17",
    easter: "2026-04-05",
    "memorial-day": "2026-05-25",
    juneteenth: "2026-06-19",
    "july-4": "2026-07-04",
    "labor-day": "2026-09-07",
    "peoples-day": "2026-10-12",
    halloween: "2026-10-31",
    veterans: "2026-11-11",
    thanksgiving: "2026-11-26",
    christmas: "2026-12-25"
  },
  2027: {
    "new-year": "2027-01-01",
    mlk: "2027-01-18",
    valentines: "2027-02-14",
    presidents: "2027-02-15",
    "st-patricks": "2027-03-17",
    easter: "2027-03-28",
    "memorial-day": "2027-05-31",
    juneteenth: "2027-06-19",
    "july-4": "2027-07-04",
    "labor-day": "2027-09-06",
    "peoples-day": "2027-10-11",
    halloween: "2027-10-31",
    veterans: "2027-11-11",
    thanksgiving: "2027-11-25",
    christmas: "2027-12-25"
  }
};

const WINDOWS = {
  2026: {
    1: [["new-year", 1, 9], ["mlk", 10, 31]],
    2: [["valentines", 1, 14], ["presidents", 15, 28]],
    3: [["st-patricks", 1, 31]],
    4: [["easter", 1, 30]],
    5: [["memorial-day", 1, 31]],
    6: [["juneteenth", 1, 30]],
    7: [["july-4", 1, 31]],
    8: [],
    9: [["labor-day", 1, 30]],
    10: [["peoples-day", 1, 21], ["halloween", 22, 31]],
    11: [["veterans", 1, 18], ["thanksgiving", 19, 30]],
    12: [["christmas", 1, 31]]
  },
  2027: {
    1: [["new-year", 1, 9], ["mlk", 10, 31]],
    2: [["valentines", 1, 14], ["presidents", 15, 28]],
    3: [["st-patricks", 1, 22], ["easter", 23, 31]],
    4: [],
    5: [["memorial-day", 1, 31]],
    6: [["juneteenth", 1, 30]],
    7: [["july-4", 1, 31]],
    8: [],
    9: [["labor-day", 1, 30]],
    10: [["peoples-day", 1, 20], ["halloween", 21, 31]],
    11: [["veterans", 1, 17], ["thanksgiving", 18, 30]],
    12: [["christmas", 1, 31]]
  }
};

test("every holiday date for 2026 and 2027", () => {
  for (const year of [2026, 2027]) {
    for (const id of THEME_IDS) {
      assert.equal(holidayDate(id, year), DATES[year][id], id + " " + year);
    }
  }
});

test("every month of 2026 and 2027 uses the midpoint window", () => {
  for (const year of [2026, 2027]) {
    for (let month = 1; month <= 12; month += 1) {
      const actual = monthWindows(year, month).map((window) => [window.theme, window.startDay, window.endDay]);
      assert.deepEqual(actual, WINDOWS[year][month], year + "-" + month);
    }
  }
  assert.equal(themeForDutyDate("2026-08-15"), null);
  assert.equal(themeForDutyDate("2026-11-13"), "veterans");
  assert.equal(themeForDutyDate("2026-11-18"), "veterans");
  assert.equal(themeForDutyDate("2026-11-19"), "thanksgiving");
  assert.equal(themeForDutyDate("2026-02-14"), "valentines");
  assert.equal(themeForDutyDate("2026-02-15"), "presidents");
  assert.equal(themeForDutyDate("2027-04-05"), null);
  assert.equal(themeForDutyDate("2027-03-28"), "easter");
  for (const year of [2026, 2027]) {
    for (const id of THEME_IDS) {
      assert.equal(themeForDutyDate(DATES[year][id]), id);
    }
  }
});

test("theme override accepts a name, auto, or off", () => {
  assert.equal(resolveTheme("2026-08-01", "auto"), null);
  assert.equal(resolveTheme("2026-08-01", "off"), null);
  assert.equal(resolveTheme("2026-08-01", "christmas"), "christmas");
  assert.equal(resolveTheme("2026-12-25", "not-a-theme"), "christmas");
  assert.equal(resolveTheme("2026-11-13", ""), "veterans");
  for (const id of THEME_IDS) {
    const markup = themeDecor(id);
    assert.equal(markup.includes("<svg"), true, id);
    assert.equal(markup.includes("http"), false, id);
    assert.equal(markup.includes("$"), false, id);
  }
  const css = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
