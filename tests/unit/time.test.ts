import { describe, expect, it } from "vitest";
import { addDays, dateRange, istDate, istInstant, istTime, weekdayOf } from "@/lib/time";

describe("IST time helpers", () => {
  it("converts an IST wall-clock time to the right instant", () => {
    expect(istInstant("2026-11-01", "11:00").toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("reads the IST date of an instant that is still the previous day in UTC", () => {
    const earlyMorningIst = new Date("2026-10-31T20:00:00Z"); // 01:30 IST on 1 Nov
    expect(istDate(earlyMorningIst)).toBe("2026-11-01");
    expect(istTime(earlyMorningIst)).toBe("01:30");
  });

  it("gets weekdays and ranges right across month ends", () => {
    expect(weekdayOf("2026-11-01")).toBe(0); // Sunday
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(dateRange("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });
});
