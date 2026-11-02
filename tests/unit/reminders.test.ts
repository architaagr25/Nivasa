import { describe, expect, it } from "vitest";
import { planReminders } from "@/server/bookings/reminders";

const visitAt = new Date("2026-11-14T05:30:00Z"); // Sat 14 Nov, 11:00 IST
const hoursBefore = (h: number) => new Date(visitAt.getTime() - h * 60 * 60 * 1000);

describe("planReminders", () => {
  it("schedules both reminders when booked days ahead", () => {
    expect(planReminders(visitAt, hoursBefore(72))).toEqual([
      { kind: "day_before", sendAt: hoursBefore(24), status: "scheduled", skipReason: null },
      { kind: "two_hours_before", sendAt: hoursBefore(2), status: "scheduled", skipReason: null },
    ]);
  });

  it("skips the day-before reminder when booked the same day", () => {
    expect(planReminders(visitAt, hoursBefore(5)).map((p) => p.status)).toEqual([
      "skipped",
      "scheduled",
    ]);
  });

  it("skips both when booked inside two hours", () => {
    expect(planReminders(visitAt, hoursBefore(1)).map((p) => p.status)).toEqual([
      "skipped",
      "skipped",
    ]);
  });
});
