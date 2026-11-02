export const REMINDER_OFFSETS = {
  day_before: 24 * 60 * 60 * 1000,
  two_hours_before: 2 * 60 * 60 * 1000,
} as const;

export type ReminderKind = keyof typeof REMINDER_OFFSETS;

export type PlannedReminder = {
  kind: ReminderKind;
  sendAt: Date;
  status: "scheduled" | "skipped";
  skipReason: string | null;
};

/**
 * Reminders go out a day before and two hours before the visit. If the buyer books
 * closer than that, the reminder that is already overdue is recorded as skipped
 * rather than sent late (a "tomorrow" message an hour before the visit would be wrong).
 */
export function planReminders(startsAt: Date, bookedAt: Date): PlannedReminder[] {
  return (Object.keys(REMINDER_OFFSETS) as ReminderKind[]).map((kind) => {
    const sendAt = new Date(startsAt.getTime() - REMINDER_OFFSETS[kind]);
    const overdue = sendAt.getTime() <= bookedAt.getTime();
    return {
      kind,
      sendAt,
      status: overdue ? "skipped" : "scheduled",
      skipReason: overdue ? "Booked after this reminder was due" : null,
    };
  });
}
