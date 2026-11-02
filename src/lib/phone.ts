import { parsePhoneNumberFromString } from "libphonenumber-js";

/** Returns the number in E.164 form (+919876543210), or null if it is not a valid Indian mobile. */
export function normalisePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const parsed = parsePhoneNumberFromString(input.trim(), "IN");
  if (!parsed || !parsed.isValid()) return null;
  // Indian mobile numbers are 10 digits starting 6-9. Checking this directly avoids shipping
  // the full libphonenumber metadata (needed for getType) to buyers on slow connections.
  if (parsed.country !== "IN" || !/^[6-9]\d{9}$/.test(parsed.nationalNumber)) return null;
  return parsed.number;
}

/** "+919876543210" -> "+91 98765 •••10". Used wherever staff do not own the lead. */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/^\+91/, "");
  return `+91 ${digits.slice(0, 5)} •••${digits.slice(-2)}`;
}

/** "+919876543210" -> "+91 98765 43210" */
export function formatPhone(e164: string): string {
  const digits = e164.replace(/^\+91/, "");
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}
