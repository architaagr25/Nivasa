export type ScoreInput = {
  budgetMaxInr: number | null;
  timeline: "0-3m" | "3-6m" | "6-12m" | "12m+" | null;
  wantsBhk: "2BHK" | "3BHK" | null;
  hasPhone: boolean;
  hasUpcomingVisit: boolean;
  /** Lowest price in the project the lead is interested in, from the fact sheet. */
  projectMinPriceInr: number | null;
};

export type Score = { score: "hot" | "warm" | "cold"; reasons: string[] };

/**
 * Rules, not AI: the score decides who gets a salesperson's time, so it must be explainable.
 * A "hot" lead is handed to a named executive automatically.
 */
export function scoreLead(input: ScoreInput): Score {
  const reasons: string[] = [];

  if (input.hasUpcomingVisit) {
    return { score: "hot", reasons: ["Site visit booked"] };
  }

  const budgetFits =
    input.budgetMaxInr !== null &&
    input.projectMinPriceInr !== null &&
    input.budgetMaxInr >= input.projectMinPriceInr;
  const budgetShort =
    input.budgetMaxInr !== null &&
    input.projectMinPriceInr !== null &&
    input.budgetMaxInr < input.projectMinPriceInr * 0.85;
  const soon = input.timeline === "0-3m" || input.timeline === "3-6m";

  if (budgetFits) reasons.push("Budget fits the project");
  if (budgetShort) reasons.push("Budget below the project's starting price");
  if (soon) reasons.push(`Buying in ${input.timeline === "0-3m" ? "0–3" : "3–6"} months`);
  if (input.timeline === "12m+") reasons.push("Buying in more than a year");

  if (budgetFits && soon && input.hasPhone) return { score: "hot", reasons };
  if (budgetShort || input.timeline === "12m+") return { score: "cold", reasons };

  const known = [input.budgetMaxInr, input.timeline, input.wantsBhk].filter((v) => v !== null);
  if (known.length >= 2 || budgetFits || soon) return { score: "warm", reasons };

  reasons.push("Not enough information yet");
  return { score: "cold", reasons };
}
