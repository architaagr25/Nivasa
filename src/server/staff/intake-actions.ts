"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normalisePhone } from "@/lib/phone";
import { staffOrNull } from "@/lib/session";
import { processDueReminders } from "@/server/bookings/service";
import { ingestLead, type IngestResult } from "@/server/leads/ingest";
import { optOutByPhone, STOP_WORDS } from "@/server/leads/intake";

type Out<T> = ({ ok: true } & T) | { ok: false; error: string };

const callSchema = z.object({
  name: z.string().trim().min(2, "Enter the caller's name").max(80),
  phone: z
    .string()
    .trim()
    .refine((v) => normalisePhone(v) !== null, "Enter a 10-digit Indian mobile number"),
  projectId: z.enum(["project-1", "project-2"]).nullable(),
  wantsBhk: z.enum(["2BHK", "3BHK"]).nullable(),
  budgetLakh: z.number().min(10).max(1000).nullable(),
  language: z.enum(["en", "hi", "gu"]),
  note: z.string().trim().max(500).optional(),
  consent: z.boolean(),
});

/** A call to the hoarding number, logged by whoever picked it up. */
export async function logHoardingCall(
  input: z.input<typeof callSchema>,
): Promise<Out<{ result: IngestResult }>> {
  const me = await staffOrNull();
  if (!me) return { ok: false, error: "Please sign in again." };
  const parsed = callSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  const result = await ingestLead({
    source: "hoarding_call",
    name: d.name,
    phone: d.phone,
    projectId: d.projectId,
    wantsBhk: d.wantsBhk,
    budgetMaxInr: d.budgetLakh ? Math.round(d.budgetLakh * 100_000) : null,
    language: d.language,
    message: d.note ? `Call logged by ${me.name}: ${d.note}` : `Call logged by ${me.name}`,
    consent: d.consent,
  });
  revalidatePath("/staff/leads");
  return { ok: true, result };
}

const FIRST = [
  "Aarav",
  "Diya",
  "Kunal",
  "Meghna",
  "Parth",
  "Riddhi",
  "Tushar",
  "Krupa",
  "Nikhil",
  "Foram",
  "Harsh",
  "Jhanvi",
  "Imran",
  "Sana",
  "Ravi",
  "Neel",
];
const LAST = [
  "Patel",
  "Shah",
  "Desai",
  "Joshi",
  "Trivedi",
  "Bhatt",
  "Parikh",
  "Modi",
  "Vyas",
  "Pandya",
  "Amin",
  "Sheth",
  "Shaikh",
  "Mistry",
];
const CAMPAIGNS = {
  property_portal: ["Portal A", "Portal B", "Portal C"],
  social_ad: ["Diwali homes", "3 BHK Shela", "2 BHK Gota"],
  website: ["Enquiry form"],
} as const;
const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Demo console: a realistic lead as a portal or ad platform would send it. */
export async function simulateLead(
  source: "property_portal" | "social_ad" | "website",
  options: { consent: boolean; language: "en" | "hi" | "gu"; phone?: string },
): Promise<Out<{ result: IngestResult }>> {
  const me = await staffOrNull();
  if (!me) return { ok: false, error: "Please sign in again." };
  if (process.env.DEMO_MODE !== "true")
    return { ok: false, error: "Simulators are only available in demo mode." };
  const phone = options.phone
    ? normalisePhone(options.phone)
    : `+9167${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  if (!phone) return { ok: false, error: "Enter a 10-digit Indian mobile number" };
  const projectId = pick(["project-1", "project-2"] as const);
  const first = pick(FIRST);
  const result = await ingestLead({
    source,
    name: `${first} ${pick(LAST)}`,
    phone,
    email:
      Math.random() < 0.5
        ? `${first.toLowerCase()}${Math.floor(Math.random() * 900 + 100)}@example.com`
        : null,
    projectId,
    wantsBhk: pick(["2BHK", "3BHK"] as const),
    budgetMaxInr:
      Math.round((projectId === "project-1" ? 80 : 65) * (0.9 + Math.random() * 0.5)) * 100_000,
    language: options.language,
    campaign: pick(CAMPAIGNS[source]),
    message: "Simulated from the demo console",
    consent: options.consent,
  });
  revalidatePath("/staff");
  return { ok: true, result };
}

/** Demo console: what happens when a buyer replies to a WhatsApp message. */
export async function simulateReply(
  phoneInput: string,
  text: string,
): Promise<Out<{ optedOut: number }>> {
  const me = await staffOrNull();
  if (!me) return { ok: false, error: "Please sign in again." };
  if (process.env.DEMO_MODE !== "true") return { ok: false, error: "Simulators are switched off." };
  const phone = normalisePhone(phoneInput);
  if (!phone) return { ok: false, error: "Enter a 10-digit Indian mobile number" };
  if (!STOP_WORDS.test(text)) {
    return {
      ok: false,
      error: "Only STOP replies are handled here; other replies would go to the assistant.",
    };
  }
  const optedOut = await optOutByPhone(phone);
  if (!optedOut) return { ok: false, error: "No lead has that number." };
  revalidatePath("/staff");
  return { ok: true, optedOut };
}

/** Demo console: run the reminder job now instead of waiting for the scheduler. */
export async function runRemindersNow(): Promise<
  Out<{ sent: number; skipped: number; cancelled: number }>
> {
  const me = await staffOrNull();
  if (!me) return { ok: false, error: "Please sign in again." };
  const r = await processDueReminders();
  revalidatePath("/staff/demo");
  return { ok: true, ...r };
}
