import type { ProjectFact } from "./queries";

export type HomeType = {
  bhk: "2BHK" | "3BHK";
  carpetSqFt: number | null;
  startingPriceInr: number | null;
};

/**
 * Turns the fact sheet's "configuration" and "pricing" facts into simple cards.
 * The numbers are read out of the published text, so the cards can never disagree with it;
 * if a number can't be read, the card shows the fact text instead of guessing.
 */
export function homeTypes(facts: ProjectFact[]): HomeType[] {
  return (["2BHK", "3BHK"] as const)
    .map((bhk) => {
      const cfg = facts.find((f) => f.category === "configuration" && f.code.endsWith(bhk));
      const price = facts.find((f) => f.category === "pricing" && f.code.endsWith(bhk));
      if (!cfg && !price) return null;
      return {
        bhk,
        carpetSqFt: cfg ? parseSqFt(cfg.value) : null,
        startingPriceInr: price ? parsePriceInr(price.value) : null,
      };
    })
    .filter((h): h is HomeType => h !== null);
}

export function parseSqFt(text: string): number | null {
  const m = text.match(/([\d,]+)\s*sq\s*ft/i);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

export function parsePriceInr(text: string): number | null {
  const m = text.match(/₹\s*([\d.]+)\s*(lakh|crore)/i);
  if (!m) return null;
  return Math.round(Number(m[1]) * (m[2].toLowerCase() === "crore" ? 10_000_000 : 100_000));
}

export type Amenity = { name: string; icon: AmenityIcon };
export type AmenityIcon =
  "pool" | "gym" | "clubhouse" | "kids" | "garden" | "track" | "hall" | "parking" | "other";

const ICONS: [RegExp, AmenityIcon][] = [
  [/pool/i, "pool"],
  [/gym/i, "gym"],
  [/club/i, "clubhouse"],
  [/child|kid|play/i, "kids"],
  [/garden|landscap/i, "garden"],
  [/jog|track|walk/i, "track"],
  [/hall/i, "hall"],
  [/parking/i, "parking"],
];

/** "Clubhouse, gym and a jogging track." -> [Clubhouse, Gym, Jogging track] with icons. */
export function amenities(facts: ProjectFact[]): Amenity[] {
  const list = facts.find((f) => f.category === "amenities" && !/park/i.test(f.label));
  if (!list) return [];
  return list.value
    .replace(/\.$/, "")
    .split(/,\s*|\s+and\s+/)
    .map((s) => s.replace(/^(a|an|the)\s+/i, "").trim())
    .filter(Boolean)
    .map((s) => ({
      name: s.charAt(0).toUpperCase() + s.slice(1),
      icon: ICONS.find(([re]) => re.test(s))?.[1] ?? "other",
    }));
}

/** "Two towers of 14 floors with 240 apartments…" -> 240 */
export function homeCount(facts: ProjectFact[]): number | null {
  const overview = facts.find((f) => f.category === "overview");
  const m = overview?.value.match(/(\d+)\s+apartments/i);
  return m ? Number(m[1]) : null;
}

/** "Possession date as registered with RERA: December 2028." -> "December 2028" */
export function possessionDate(facts: ProjectFact[]): string | null {
  const f = facts.find((x) => x.category === "possession");
  const m = f?.value.match(/([A-Z][a-z]+ \d{4})/);
  return m ? m[1] : null;
}
