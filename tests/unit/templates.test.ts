import { describe, expect, it } from "vitest";
import { formatInr } from "@/lib/format";
import { visitConfirmation, visitReminder } from "@/server/messaging/templates";

const ctx = {
  projectName: "Project 1",
  reraNumber: "PR/GJ/AHMEDABAD/DEMO/P1-0001",
  startsAt: new Date("2026-11-14T05:30:00Z"),
  latitude: "23.0012",
  longitude: "72.4637",
  executiveName: "Rahul Mehta",
};

describe("buyer messages", () => {
  it.each(["en", "hi", "gu"] as const)(
    "carry the RERA number, a map pin and an opt-out in %s",
    (lang) => {
      for (const body of [
        visitConfirmation({ ...ctx, lang }),
        visitReminder({ ...ctx, lang }, "day_before"),
        visitReminder({ ...ctx, lang }, "two_hours_before"),
      ]) {
        expect(body).toContain("RERA PR/GJ/AHMEDABAD/DEMO/P1-0001");
        expect(body).toContain("https://maps.google.com/?q=23.0012,72.4637");
        expect(body).toContain("STOP");
      }
    },
  );

  it("shows the visit time in IST", () => {
    expect(visitConfirmation({ ...ctx, lang: "en" })).toMatch(/14 Nov.*11:00/);
  });
});

describe("formatInr", () => {
  it.each([
    [7_800_000, "₹78 lakh"],
    [6_550_000, "₹65.5 lakh"],
    [10_200_000, "₹1.02 crore"],
    [12_000_000, "₹1.2 crore"],
    [45_000, "₹45,000"],
  ])("%d -> %s", (n, s) => expect(formatInr(n)).toBe(s));
});
