import { describe, expect, it } from "vitest";
import { checkInWindow } from "@/server/staff/visits";

const visit = new Date("2026-11-14T05:30:00Z"); // Sat 14 Nov, 11:00 IST
const at = (iso: string) => new Date(iso);

describe("checkInWindow", () => {
  it("opens half an hour before the visit", () => {
    expect(checkInWindow(visit, at("2026-11-14T04:59:00Z"))).toBe("early"); // 10:29
    expect(checkInWindow(visit, at("2026-11-14T05:00:00Z"))).toBe("open"); // 10:30
  });

  it("stays open for a late arrival the same day", () => {
    expect(checkInWindow(visit, at("2026-11-14T12:00:00Z"))).toBe("open"); // 17:30
  });

  it("closes at midnight IST, not midnight UTC", () => {
    expect(checkInWindow(visit, at("2026-11-14T18:29:00Z"))).toBe("open"); // 23:59 IST
    expect(checkInWindow(visit, at("2026-11-14T18:31:00Z"))).toBe("past_day"); // 00:01 IST
  });

  it("is early for a visit on a later day", () => {
    expect(checkInWindow(visit, at("2026-11-13T06:00:00Z"))).toBe("early");
  });
});
