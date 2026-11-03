const IST = "Asia/Kolkata";

/** 48 -> "48 s", 900 -> "15 min", 50400 -> "14 h", 200000 -> "2.3 days" */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "Not reached";
  if (seconds < 90) return `${seconds} s`;
  if (seconds < 90 * 60) return `${Math.round(seconds / 60)} min`;
  if (seconds < 48 * 3600) return `${Math.round(seconds / 3600)} h`;
  return `${(seconds / 86400).toFixed(1)} days`;
}

/** "3 min ago", "5 h ago", "2 Nov" */
export function ago(date: Date, now = new Date()): string {
  const s = Math.round((now.getTime() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)} d ago`;
  return new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "numeric", month: "short" }).format(
    date,
  );
}

/** "Sat 7 Nov, 11:00 am" */
export function dateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function lakh(inr: number | null): string {
  if (!inr) return "—";
  return inr >= 10_000_000
    ? `₹${+(inr / 10_000_000).toFixed(2)} Cr`
    : `₹${Math.round(inr / 100_000)} L`;
}
