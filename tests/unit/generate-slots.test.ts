import { describe, expect, it } from "vitest";
import { generateSlots, type SlotTemplate } from "@/server/slots/generate";

const sunday11: SlotTemplate = {
  projectId: "project-1",
  weekday: 0,
  startTime: "11:00",
  durationMin: 60,
  capacity: 3,
  active: true,
};

describe("generateSlots", () => {
  it("creates one slot per matching weekday in IST", () => {
    const slots = generateSlots([sunday11], [], "2026-11-01", "2026-11-15");
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-11-01T05:30:00.000Z",
      "2026-11-08T05:30:00.000Z",
      "2026-11-15T05:30:00.000Z",
    ]);
    expect(slots[0].endsAt.toISOString()).toBe("2026-11-01T06:30:00.000Z");
    expect(slots[0].capacity).toBe(3);
  });

  it("skips project and company-wide blackout dates", () => {
    const slots = generateSlots(
      [sunday11],
      [
        { projectId: "project-1", date: "2026-11-08" },
        { projectId: null, date: "2026-11-15" },
        { projectId: "project-2", date: "2026-11-01" },
      ],
      "2026-11-01",
      "2026-11-15",
    );
    expect(slots).toHaveLength(1);
    expect(slots[0].startsAt.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("ignores inactive templates", () => {
    expect(generateSlots([{ ...sunday11, active: false }], [], "2026-11-01", "2026-11-01")).toEqual(
      [],
    );
  });
});
