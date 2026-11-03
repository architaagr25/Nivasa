import { describe, expect, it } from "vitest";
import {
  amenities,
  homeCount,
  homeTypes,
  parsePriceInr,
  possessionDate,
} from "@/server/projects/present";
import type { ProjectFact } from "@/server/projects/queries";

const f = (code: string, category: ProjectFact["category"], value: string, label = code) => ({
  code,
  category,
  label,
  value,
});

const sheet: ProjectFact[] = [
  f(
    "P1-OVR",
    "overview",
    "Two towers of 14 floors with 240 apartments: 96 two-bedroom and 144 three-bedroom homes.",
  ),
  f("P1-CFG-2BHK", "configuration", "Carpet area 745 sq ft (69.2 sq m) as registered with RERA."),
  f(
    "P1-CFG-3BHK",
    "configuration",
    "Carpet area 1,080 sq ft (100.3 sq m) as registered with RERA.",
  ),
  f("P1-PRC-2BHK", "pricing", "Indicative starting price ₹78 lakh plus government charges."),
  f("P1-PRC-3BHK", "pricing", "Indicative starting price ₹1.02 crore plus government charges."),
  f(
    "P1-AMN",
    "amenities",
    "Clubhouse, swimming pool, gym, children's play area and a landscaped garden.",
    "Amenities",
  ),
  f("P1-PRK", "amenities", "Covered car parking.", "Parking"),
  f("P1-POS", "possession", "Possession date as registered with RERA: December 2028."),
];

describe("fact sheet presentation", () => {
  it("reads home types straight from the published facts", () => {
    expect(homeTypes(sheet)).toEqual([
      { bhk: "2BHK", carpetSqFt: 745, startingPriceInr: 7_800_000 },
      { bhk: "3BHK", carpetSqFt: 1080, startingPriceInr: 10_200_000 },
    ]);
  });

  it("leaves a number empty rather than guessing when the text has none", () => {
    expect(parsePriceInr("Price on request")).toBeNull();
    expect(homeTypes([f("P9-CFG-2BHK", "configuration", "Spacious homes")])).toEqual([
      { bhk: "2BHK", carpetSqFt: null, startingPriceInr: null },
    ]);
  });

  it("splits amenities into items with icons", () => {
    expect(amenities(sheet)).toEqual([
      { name: "Clubhouse", icon: "clubhouse" },
      { name: "Swimming pool", icon: "pool" },
      { name: "Gym", icon: "gym" },
      { name: "Children's play area", icon: "kids" },
      { name: "Landscaped garden", icon: "garden" },
    ]);
  });

  it("finds the home count and possession date", () => {
    expect(homeCount(sheet)).toBe(240);
    expect(possessionDate(sheet)).toBe("December 2028");
  });
});
