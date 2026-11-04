import { writeFileSync } from "node:fs";
import { and, desc, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { chatFlags, conversations, leads, messages } from "@/db/schema";
import { replyToBuyer, type TurnContext } from "@/server/assistant/agent";
import {
  leadForConversation,
  startConversation,
  type MessagePart,
} from "@/server/assistant/conversation";
import { always, CASES, type Case, type Outcome } from "./cases";

// The free Gemini tier allows a handful of requests a minute; a pause between messages keeps
// the run inside it instead of measuring the fallback model by accident.
const PAUSE_MS = Number(process.env.EVAL_PAUSE_MS ?? 4_000);
const only = process.env.EVAL_ONLY?.split(",");

type Result = {
  c: Case;
  outcome: Outcome;
  failed: string[];
  checks: number;
  model: string | null;
  latencyMs: number;
};
const results: Result[] = [];

async function run(c: Case): Promise<Result> {
  const conv = await startConversation({ language: c.lang, projectId: c.project ?? null });
  if (c.verified) {
    const lead = await leadForConversation(conv.id);
    await db
      .update(leads)
      .set({
        name: "Eval Buyer",
        phone: `+9169${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
      })
      .where(eq(leads.id, lead!.id));
  }

  let latencyMs = 0;
  for (const [i, text] of c.turns.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, PAUSE_MS));
    // As the chat route does: the language the conversation is currently in, read fresh each turn.
    const [current] = await db.select().from(conversations).where(eq(conversations.id, conv.id));
    const ctx: TurnContext = {
      conversationId: conv.id,
      language: current.language,
      projectId: c.project ?? null,
      verifiedBuyer: Boolean(c.verified),
    };
    const started = Date.now();
    await replyToBuyer(ctx, text);
    latencyMs = Date.now() - started;
  }

  const [last] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conv.id), eq(messages.role, "assistant")))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  const flags = await db
    .select({ reason: chatFlags.reason })
    .from(chatFlags)
    .where(eq(chatFlags.conversationId, conv.id));
  const lead = (await leadForConversation(conv.id))!;

  const outcome: Outcome = {
    text: last?.content ?? "",
    cited: last?.citedFacts ?? [],
    guardrail: last?.guardrail ?? null,
    parts: (last?.parts as MessagePart[] | null) ?? [],
    flags: [...new Set(flags.map((f) => f.reason))],
    lead: {
      wantsBhk: lead.wantsBhk,
      budgetMaxInr: lead.budgetMaxInr,
      timeline: lead.timeline,
      purpose: lead.purpose,
      projectId: lead.projectId,
    },
  };
  const checks = [...always(c.replyLang ?? c.lang), ...c.checks];
  return {
    c,
    outcome,
    failed: checks.filter((k) => !k.pass(outcome)).map((k) => k.name),
    checks: checks.length,
    model: last?.model ?? null,
    latencyMs,
  };
}

describe("assistant", () => {
  for (const c of CASES.filter((x) => !only || only.includes(x.id))) {
    it(`${c.area}: ${c.id}`, async () => {
      const r = await run(c);
      results.push(r);
      await new Promise((res) => setTimeout(res, PAUSE_MS));
      expect(r.failed, r.outcome.text).toEqual([]);
    });
  }
});

afterAll(() => {
  // Only a full run replaces the report; a few cases picked with EVAL_ONLY just print.
  if (!results.length || only) return;
  writeFileSync("docs/assistant-eval.md", report(results));
});

function report(rs: Result[]) {
  const passed = rs.filter((r) => !r.failed.length).length;
  const checks = rs.reduce((n, r) => n + r.checks, 0);
  const checksPassed = rs.reduce((n, r) => n + r.checks - r.failed.length, 0);
  const areas = [...new Set(rs.map((r) => r.c.area))];
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const models = [...new Set(rs.map((r) => r.model).filter(Boolean))].join(", ");
  const cell = (t: string) => t.replace(/\|/g, "\\|").replace(/\n+/g, " ");
  const when = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  return `# Assistant check

Run on ${when} IST against the test database, with ${models || "no model reply"}. Each case is a
fresh conversation sent through the same code as the website chat (\`replyToBuyer\`), and the
reply that was actually stored is checked: the text the buyer saw, the facts it cited, the
flags raised for the sales team and what was saved on the lead.

Run it with \`npm run eval\` (or \`EVAL_ONLY=haggle,injection npm run eval\` for a few cases).

**${passed} of ${rs.length} conversations passed every check** (${checksPassed} of ${checks} checks).
Median reply time ${(median(rs.map((r) => r.latencyMs)) / 1000).toFixed(1)} s.

Every reply is also checked for: the buyer's language and script, under 90 words, no markdown,
and no fact codes left in the text.

| Area | Passed |
| --- | --- |
${areas
  .map((a) => {
    const of = rs.filter((r) => r.c.area === a);
    return `| ${a} | ${of.filter((r) => !r.failed.length).length} / ${of.length} |`;
  })
  .join("\n")}

## Conversations

${rs
  .map((r) => {
    const o = r.outcome;
    return `### ${r.failed.length ? "✗" : "✓"} ${r.c.area}: ${r.c.id}

${r.c.turns.map((t) => `> **Buyer:** ${cell(t)}`).join("\n>\n")}

**Assistant:** ${cell(o.text) || "_(buttons only)_"}

| | |
| --- | --- |
| Cited | ${o.cited.join(", ") || "—"} |
| Shown | ${o.parts.map((p) => p.type).join(", ") || "—"} |
| Flags | ${o.flags.join(", ") || "—"} |
| Guardrail | ${o.guardrail ?? "—"} |
| Time | ${(r.latencyMs / 1000).toFixed(1)} s |
${r.failed.length ? `| **Failed** | ${r.failed.map(cell).join("; ")} |\n` : ""}`;
  })
  .join("\n")}`;
}
