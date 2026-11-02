import { describe, expect, it } from "vitest";
import { formatPhone, maskPhone, normalisePhone } from "@/lib/phone";

describe("phone helpers", () => {
  it.each([
    ["98765 43210", "+919876543210"],
    ["+91-98765-43210", "+919876543210"],
    ["09876543210", "+919876543210"],
    ["919876543210", "+919876543210"],
  ])("normalises %s", (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  it.each(["", "12345", "+14155550123", "+91 12345 67890"])("rejects %s", (input) => {
    expect(normalisePhone(input)).toBeNull();
  });

  it("masks and formats", () => {
    expect(maskPhone("+919876543210")).toBe("+91 98765 •••10");
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
  });
});
