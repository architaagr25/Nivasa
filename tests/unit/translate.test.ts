import { describe, expect, it } from "vitest";
import { alreadyIn, keepsNumbers } from "@/server/staff/translate";

describe("staff transcript translation", () => {
  it("knows when a message is already in the target language", () => {
    expect(alreadyIn("When is possession?", "en")).toBe(true);
    expect(alreadyIn("પઝેશન ક્યારે મળશે?", "en")).toBe(false);
    expect(alreadyIn("पज़ेशन कब मिलेगा?", "hi")).toBe(true);
    expect(alreadyIn("પઝેશન ક્યારે મળશે?", "gu")).toBe(true);
    expect(alreadyIn("2 BHK size?", "gu")).toBe(false);
  });

  it("keeps a translation only if every number survived unchanged", () => {
    const original = "પ્રોજેક્ટ 2 માં 2 BHK ની કિંમત ₹65 લાખ છે, પઝેશન જૂન ૨૦૨૮.";
    expect(
      keepsNumbers(original, "In Project 2 a 2 BHK starts at ₹65 lakh, possession June 2028."),
    ).toBe(true);
    expect(
      keepsNumbers(original, "In Project 2 a 2 BHK starts at ₹56 lakh, possession June 2028."),
    ).toBe(false);
    expect(keepsNumbers(original, "In Project 2 a 2 BHK starts at ₹65 lakh.")).toBe(false);
  });
});
