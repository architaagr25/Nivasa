// Checks on a fact sheet that run both in the editor, as you type, and on the server.
import { parsePriceInr } from "@/server/projects/present";

export type Category =
  | "overview"
  | "configuration"
  | "pricing"
  | "amenities"
  | "location"
  | "possession"
  | "legal"
  | "payment";

export const CATEGORIES: Category[] = [
  "overview",
  "configuration",
  "pricing",
  "amenities",
  "location",
  "possession",
  "legal",
  "payment",
];

export const CATEGORY_LABEL: Record<Category, string> = {
  overview: "Overview",
  configuration: "Homes",
  pricing: "Prices",
  amenities: "Amenities",
  location: "Location and visits",
  possession: "Possession",
  legal: "Legal",
  payment: "Payment",
};

export type Fact = { code: string; category: Category; label: string; value: string };

export type FactChange =
  | { kind: "added"; fact: Fact }
  | { kind: "removed"; fact: Fact }
  | { kind: "changed"; fact: Fact; before: Fact };

/** What publishing would change, fact by fact. */
export function diffFacts(live: Fact[], draft: Fact[]): FactChange[] {
  const before = new Map(live.map((f) => [f.code, f]));
  const after = new Map(draft.map((f) => [f.code, f]));
  const out: FactChange[] = [];
  for (const f of draft) {
    const old = before.get(f.code);
    if (!old) out.push({ kind: "added", fact: f });
    else if (old.label !== f.label || old.value !== f.value || old.category !== f.category)
      out.push({ kind: "changed", fact: f, before: old });
  }
  for (const f of live) if (!after.has(f.code)) out.push({ kind: "removed", fact: f });
  return out;
}

/**
 * Things worth a second look before publishing. The assistant only quotes amounts that appear
 * on the sheet, and the project page reads prices, areas and dates out of these facts.
 */
export function factSheetWarnings(list: { category: Category; label: string; value: string }[]) {
  const warnings: string[] = [];
  for (const f of list.filter((x) => x.category === "pricing")) {
    if (parsePriceInr(f.value) === null)
      warnings.push(
        `"${f.label}" has no price written like ₹78 lakh or ₹1.02 crore, so the project page can't show a "from" price for it.`,
      );
  }
  for (const [category, name] of [
    ["possession", "possession date"],
    ["legal", "RERA registration"],
  ] as const) {
    if (!list.some((f) => f.category === category))
      warnings.push(`There's no ${name} fact. Buyers ask for this often.`);
  }
  if (list.some((f) => /\d+\s*%|discount|offer/i.test(f.value)))
    warnings.push(
      "A fact mentions a percentage, discount or offer. The assistant never quotes these, so buyers will be handed to the team instead.",
    );
  return warnings;
}
