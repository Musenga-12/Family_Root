import { afterEach, describe, expect, it } from "vitest";
import {
  cx,
  emailOk,
  fmtDate,
  fmtDur,
  currentLang,
  setDateLang,
  monthName,
  dayName,
  dayShort,
  dateWord,
} from "../lib/format.js";

afterEach(() => {
  setDateLang("en");
});

describe("cx()", () => {
  it("joins class names with spaces", () => {
    expect(cx("btn", "primary", "large")).toBe("btn primary large");
  });

  it("ignores falsy values", () => {
    expect(cx("btn", false, null, undefined, "", "active")).toBe("btn active");
  });

  it("returns an empty string when no classes are supplied", () => {
    expect(cx()).toBe("");
  });
});

describe("emailOk()", () => {
  it.each([
    "user@example.com",
    "student.name@ur.ac.rw",
    "test123@mail.org",
  ])("accepts valid email: %s", (email) => {
    expect(emailOk(email)).toBe(true);
  });

  it.each([
    "",
    "plain-text",
    "user@",
    "@example.com",
    "user@example",
    "user name@example.com",
    "user@example .com",
  ])("rejects invalid email: %s", (email) => {
    expect(emailOk(email)).toBe(false);
  });
});

describe("fmtDur()", () => {
  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [59, "0:59"],
    [60, "1:00"],
    [125, "2:05"],
    [3600, "60:00"],
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(fmtDur(seconds)).toBe(expected);
  });
});

describe("fmtDate()", () => {
  it("formats a complete date", () => {
    expect(fmtDate("2025-10-14")).toBe("14 Oct 2025");
  });

  it("formats a month and year", () => {
    expect(fmtDate("1968-10")).toBe("Oct 1968");
  });

  it("formats a year without a month", () => {
    expect(fmtDate("1918")).toBe("1918");
  });

  it("formats approximate dates", () => {
    expect(fmtDate("1918-04-12", true)).toBe("c. 1918");
  });

  it("returns an empty string for an empty date", () => {
    expect(fmtDate("")).toBe("");
    expect(fmtDate(null)).toBe("");
  });
});

describe("date language settings", () => {
  it("uses English by default", () => {
    expect(currentLang()).toBe("en");
    expect(monthName(0)).toBe("Jan");
    expect(dayName(0)).toBe("Sunday");
    expect(dayShort(0)).toBe("Sun");
    expect(dateWord("today")).toBe("Today");
  });

  it("supports French", () => {
    setDateLang("fr");

    expect(currentLang()).toBe("fr");
    expect(monthName(0)).toBe("janv.");
    expect(dayName(1)).toBe("lundi");
    expect(dayShort(1)).toBe("lun.");
    expect(dateWord("today")).toBe("Aujourd'hui");
    expect(fmtDate("2025-10-14")).toBe("14 oct. 2025");
  });

  it("supports Kinyarwanda", () => {
    setDateLang("rw");

    expect(currentLang()).toBe("rw");
    expect(monthName(0)).toBe("Mut");
    expect(dayName(1)).toBe("Ku wa mbere");
    expect(dayShort(1)).toBe("Mbe");
    expect(dateWord("today")).toBe("Uyu munsi");
    expect(fmtDate("1918", true)).toBe("ahagana 1918");
  });

  it("supports Swahili", () => {
    setDateLang("sw");

    expect(currentLang()).toBe("sw");
    expect(monthName(2)).toBe("Mac");
    expect(dayName(1)).toBe("Jumatatu");
    expect(dayShort(1)).toBe("Jtt");
    expect(dateWord("yesterday")).toBe("Jana");
  });

  it("falls back to English for an unsupported language", () => {
    setDateLang("unknown");

    expect(currentLang()).toBe("en");
    expect(monthName(0)).toBe("Jan");
    expect(dateWord("today")).toBe("Today");
  });
});
