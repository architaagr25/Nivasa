import { describe, expect, it } from "vitest";
import { scoreLead, type ScoreInput } from "@/server/leads/score";

const base: ScoreInput = {
  budgetMaxInr: null,
  timeline: null,
  wantsBhk: null,
  hasPhone: true,
  hasUpcomingVisit: false,
  projectMinPriceInr: 6_500_000,
};

describe("scoreLead", () => {
  it("is hot when a visit is booked, whatever else is known", () => {
    expect(scoreLead({ ...base, hasUpcomingVisit: true }).score).toBe("hot");
  });

  it("is hot when the budget fits and the buyer is buying soon", () => {
    const r = scoreLead({ ...base, budgetMaxInr: 8_000_000, timeline: "0-3m" });
    expect(r.score).toBe("hot");
    expect(r.reasons).toContain("Budget fits the project");
  });

  it("needs a phone number to be hot, because a person has to be able to call", () => {
    expect(
      scoreLead({ ...base, budgetMaxInr: 8_000_000, timeline: "0-3m", hasPhone: false }).score,
    ).toBe("warm");
  });

  it("is cold when the budget is well below the starting price", () => {
    expect(scoreLead({ ...base, budgetMaxInr: 4_500_000, timeline: "0-3m" }).score).toBe("cold");
  });

  it("is cold when buying is more than a year away", () => {
    expect(scoreLead({ ...base, budgetMaxInr: 9_000_000, timeline: "12m+" }).score).toBe("cold");
  });

  it("is cold with nothing known, and says why", () => {
    expect(scoreLead(base)).toEqual({ score: "cold", reasons: ["Not enough information yet"] });
  });
});
