import { describe, expect, it } from "vitest";
import {
  clockOffset,
  countdownParts,
  countdownWords,
  secondsUntil,
  serverTime,
} from "./shared-test-clock";

const SERVER_NOW = "2026-10-12T10:00:00.000Z";

describe("server clock offset", () => {
  it("measures how far the server is from the browser and applies it", () => {
    const browser = Date.parse("2026-10-12T09:58:00.000Z");
    const offset = clockOffset(SERVER_NOW, browser);
    expect(offset).toBe(120_000);
    expect(serverTime(offset, browser + 5_000)).toBe(Date.parse("2026-10-12T10:00:05.000Z"));
  });

  it("is zero for a browser that agrees with the server, and negative for one that runs ahead", () => {
    expect(clockOffset(SERVER_NOW, Date.parse(SERVER_NOW))).toBe(0);
    expect(clockOffset(SERVER_NOW, Date.parse(SERVER_NOW) + 3000)).toBe(-3000);
  });
});

describe("secondsUntil", () => {
  const now = Date.parse(SERVER_NOW);
  it("counts whole seconds to a moment on the server's clock, rounding up", () => {
    expect(secondsUntil("2026-10-12T10:01:00.000Z", 0, now)).toBe(60);
    expect(secondsUntil("2026-10-12T10:00:00.400Z", 0, now)).toBe(1);
  });

  it("is zero at the moment and after it, never negative", () => {
    expect(secondsUntil(SERVER_NOW, 0, now)).toBe(0);
    expect(secondsUntil("2026-10-12T09:00:00.000Z", 0, now)).toBe(0);
  });

  it("follows the server, not the browser: a wrong browser clock changes nothing", () => {
    const browser = now - 600_000;
    const offset = clockOffset(SERVER_NOW, browser);
    expect(secondsUntil("2026-10-12T10:00:30.000Z", offset, browser)).toBe(30);
  });
});

describe("countdownParts and countdownWords", () => {
  it("splits seconds into days, hours, minutes and seconds", () => {
    expect(countdownParts(90_061)).toEqual({ days: 1, hours: 1, minutes: 1, seconds: 1 });
    expect(countdownParts(-5)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it("says the two largest units that are not zero, with seconds only under an hour", () => {
    expect(countdownWords(2 * 86_400 + 3 * 3600 + 59)).toBe("2 days 3 hours");
    expect(countdownWords(3600 + 5 * 60 + 9)).toBe("1 hour 5 minutes");
    expect(countdownWords(4 * 60 + 10)).toBe("4 minutes 10 seconds");
    expect(countdownWords(1)).toBe("1 second");
    expect(countdownWords(0)).toBe("0 seconds");
  });
});
