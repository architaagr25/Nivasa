// Everything the business sees happens in India Standard Time (UTC+05:30, no daylight saving),
// so calendar maths is done on IST date strings and converted to instants only at the edges.

export const IST_OFFSET = "+05:30";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** "2026-11-01" + "11:00" -> the instant 2026-11-01T05:30:00Z */
export function istInstant(date: string, time: string): Date {
  return new Date(`${date}T${time.slice(0, 5)}:00${IST_OFFSET}`);
}

/** The IST calendar date (YYYY-MM-DD) of an instant. */
export function istDate(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The IST wall-clock time (HH:MM) of an instant. */
export function istTime(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(11, 16);
}

/** 0 = Sunday, for a YYYY-MM-DD calendar date. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Inclusive list of calendar dates. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
