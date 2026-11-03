import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations, leads, messages } from "@/db/schema";
import type { StaffViewer } from "@/lib/session";
import { asciiDigits } from "@/server/assistant/guardrail";
import { generate } from "@/server/assistant/models";
import { visibleTo } from "./leads";

export type TranslateLang = "en" | "hi" | "gu";

const NAME = { en: "English", hi: "Hindi (Devanagari script)", gu: "Gujarati (Gujarati script)" };
const SCRIPT = { hi: /[ऀ-ॿ]/, gu: /[઀-૿]/ };

/** True when the text is already in the target language, so there is nothing to translate. */
export function alreadyIn(text: string, lang: TranslateLang) {
  const hasHi = SCRIPT.hi.test(text);
  const hasGu = SCRIPT.gu.test(text);
  if (lang === "en") return !hasHi && !hasGu;
  return lang === "hi" ? hasHi && !hasGu : hasGu && !hasHi;
}

/** Numbers that must survive translation: areas, prices, dates, counts, codes. */
function keyNumbers(text: string) {
  return new Set(
    asciiDigits(text)
      .match(/\d[\d,.]*\d|\d{2,}/g)
      ?.map((n) => n.replace(/,/g, "")) ?? [],
  );
}

/** A translation is only kept if every number in the original is still there, unchanged. */
export function keepsNumbers(original: string, translated: string) {
  const out = keyNumbers(translated);
  return [...keyNumbers(original)].every((n) => out.has(n));
}

const BATCH = 25;

/**
 * Translates a lead's chat into one language for staff, once. Messages already in that language
 * are stored as they are; the rest go to the model in batches. Returns message id -> text for
 * everything now available, or null if the viewer may not see this lead.
 */
export async function translateLeadConversation(
  viewer: StaffViewer,
  leadCode: string,
  lang: TranslateLang,
) {
  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.code, leadCode), visibleTo(viewer)));
  if (!lead) return null;

  const convIds = (
    await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.leadId, lead.id))
  ).map((c) => c.id);
  if (!convIds.length) return { translations: {}, failed: 0 };

  const rows = await db
    .select({ id: messages.id, content: messages.content, translations: messages.translations })
    .from(messages)
    .where(
      and(
        inArray(messages.conversationId, convIds),
        inArray(messages.role, ["buyer", "assistant", "staff"]),
      ),
    )
    .orderBy(asc(messages.createdAt));

  const result: Record<string, string> = {};
  const save: { id: string; text: string }[] = [];
  const todo: { id: string; content: string }[] = [];
  for (const r of rows) {
    const cached = r.translations?.[lang];
    if (cached) result[r.id] = cached;
    else if (alreadyIn(r.content, lang)) save.push({ id: r.id, text: r.content });
    else todo.push({ id: r.id, content: r.content });
  }

  let failed = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const out = await generate({
      system: `You translate messages between a home buyer and a property assistant into ${NAME[lang]}, for the developer's sales staff. Keep project names, RERA numbers, codes like P1-POS, numbers, dates and ₹ amounts exactly as they are. Do not add, explain or summarise anything. Reply with only a JSON array of strings: one translation per input message, in the same order.`,
      prompt: JSON.stringify(batch.map((m) => m.content)),
      temperature: 0,
    });
    const parsed = parseArray(out?.result.text, batch.length);
    batch.forEach((m, j) => {
      const t = parsed?.[j];
      if (t && keepsNumbers(m.content, t)) save.push({ id: m.id, text: t });
      else failed++;
    });
  }

  for (const s of save) {
    await db
      .update(messages)
      .set({
        translations: sql`coalesce(${messages.translations}, '{}'::jsonb) || jsonb_build_object(${lang}::text, ${s.text}::text)`,
      })
      .where(eq(messages.id, s.id));
    result[s.id] = s.text;
  }
  return { translations: result, failed };
}

function parseArray(text: string | undefined, length: number): string[] | null {
  if (!text) return null;
  const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  try {
    const arr = JSON.parse(json) as unknown;
    return Array.isArray(arr) && arr.length === length && arr.every((x) => typeof x === "string")
      ? arr
      : null;
  } catch {
    return null;
  }
}
