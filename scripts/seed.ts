import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { sql as dsql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as s from "../src/db/schema";
import { scoreLead } from "../src/server/leads/score";
import { generateSlots } from "../src/server/slots/generate";
import { addDays, istDate, istInstant, istTime } from "../src/lib/time";
import * as cat from "./seed/catalog";
import { scripts, type Script } from "./seed/transcripts";

config({ path: ".env.local", quiet: true });

/* ---------- deterministic randomness, so every reseed gives the same data ---------- */
let state = 20261102;
const rand = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const weighted = <T extends string>(w: Record<T, number>): T => {
  const total = Object.values<number>(w).reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (const [k, v] of Object.entries<number>(w)) if ((r -= v) < 0) return k as T;
  return Object.keys(w)[0] as T;
};
const between = (a: number, b: number) => a + rand() * (b - a);
// Log-normal delay around a median, for realistic response times.
const lognormal = (median: number, spread: number) => {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return median * Math.exp(spread * z);
};
const MIN = 60_000;
const HOUR = 60 * MIN;

async function insertChunks<T>(
  db: ReturnType<typeof drizzle>,
  table: Parameters<ReturnType<typeof drizzle>["insert"]>[0],
  rows: T[],
) {
  for (let i = 0; i < rows.length; i += 500) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.insert(table).values(rows.slice(i, i + 500) as any);
  }
}

type LeadSource = "property_portal" | "social_ad" | "website" | "hoarding_call";
type Lang = "en" | "hi" | "gu";

async function main() {
  const url = process.argv.includes("--test")
    ? process.env.TEST_DATABASE_URL
    : process.env.DIRECT_URL;
  if (!url) throw new Error("Database URL is not set");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { casing: "snake_case" });

  const now = new Date();
  const today = istDate(now);
  console.log(`Seeding for ${today} (IST)…`);

  /* ---------- wipe ---------- */
  await db.execute(dsql`
    truncate table access_log, source_spend, outbox, reminders, visits, slots, blackout_dates,
      slot_templates, chat_flags, messages, conversations, consents, duplicate_candidates,
      lead_touches, leads, staff_profiles, facts, fact_sheet_versions, projects,
      verification, account, session, "user" restart identity cascade`);

  /* ---------- staff ---------- */
  const passwordHash = await hashPassword(cat.DEMO_PASSWORD);
  const head = { id: randomUUID(), ...cat.salesHead };
  const execs = cat.executives.map((e) => ({ id: randomUUID(), ...e }));
  const staff = [
    { ...head, role: "sales_head" as const, projectIds: ["project-1", "project-2"] },
    ...execs.map((e) => ({ ...e, role: "sales_exec" as const, projectIds: [e.projectId] })),
  ];
  await db.insert(s.user).values(
    staff.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: true,
      role: u.role,
    })),
  );
  await db.insert(s.account).values(
    staff.map((u) => ({
      id: randomUUID(),
      accountId: u.id,
      providerId: "credential",
      userId: u.id,
      password: passwordHash,
    })),
  );
  await db.insert(s.staffProfiles).values(
    staff.map((u) => ({
      userId: u.id,
      displayName: u.name,
      phone: u.phone,
      projectIds: u.projectIds,
    })),
  );

  /* ---------- projects and fact sheets ---------- */
  await db.insert(s.projects).values(
    cat.projects.map((p) => ({
      id: p.id,
      name: p.name,
      reraNumber: p.reraNumber,
      locality: p.locality,
      address: p.address,
      latitude: p.latitude,
      longitude: p.longitude,
      heroImage: p.heroImage,
    })),
  );
  for (const p of cat.projects) {
    const versionId = randomUUID();
    await db.insert(s.factSheetVersions).values({
      id: versionId,
      projectId: p.id,
      version: 1,
      status: "published",
      changeNote: "Initial fact sheet",
      createdBy: head.id,
      publishedBy: head.id,
      publishedAt: new Date(`${addDays(cat.GO_LIVE, -3)}T10:00:00+05:30`),
    });
    await db
      .insert(s.facts)
      .values(cat.facts[p.id].map((f, i) => ({ ...f, versionId, sortOrder: i })));
  }

  /* ---------- slots ---------- */
  await db.insert(s.slotTemplates).values(cat.slotTemplates);
  await db.insert(s.blackoutDates).values(cat.blackouts);
  const firstDay = addDays(today, -59);
  const slotRows = generateSlots(
    cat.slotTemplates,
    cat.blackouts,
    addDays(firstDay, -1),
    addDays(today, 28),
  ).map((g) => ({ id: randomUUID(), ...g, booked: 0 }));
  const slotsByProject = new Map<string, typeof slotRows>();
  for (const sl of slotRows) {
    const list = slotsByProject.get(sl.projectId) ?? [];
    list.push(sl);
    slotsByProject.set(sl.projectId, list);
  }
  const execBusy = new Set<string>(); // `${execId}|${iso}`
  const execLoad = new Map<string, number>();

  function takeSlot(projectId: string, after: Date, before: Date, exact?: Date) {
    const candidates = (slotsByProject.get(projectId) ?? []).filter((sl) =>
      exact
        ? sl.startsAt.getTime() === exact.getTime()
        : sl.startsAt > after && sl.startsAt < before,
    );
    // Prefer a random free slot in the window, as a buyer would.
    for (let tries = 0; tries < 12 && candidates.length; tries++) {
      const sl = exact ? candidates[0] : pick(candidates);
      if (sl.booked >= sl.capacity) continue;
      const exec = execs
        .filter(
          (e) => e.projectId === projectId && !execBusy.has(`${e.id}|${sl.startsAt.toISOString()}`),
        )
        .sort((a, b) => (execLoad.get(a.id) ?? 0) - (execLoad.get(b.id) ?? 0))[0];
      if (!exec) continue;
      sl.booked += 1;
      execBusy.add(`${exec.id}|${sl.startsAt.toISOString()}`);
      execLoad.set(exec.id, (execLoad.get(exec.id) ?? 0) + 1);
      return { slot: sl, exec };
    }
    return null;
  }

  /* ---------- leads ---------- */
  type LeadRow = typeof s.leads.$inferInsert & { id: string; code: string; createdAt: Date };
  const leadRows: LeadRow[] = [];
  const touchRows: (typeof s.leadTouches.$inferInsert)[] = [];
  const consentRows: (typeof s.consents.$inferInsert)[] = [];
  const visitRows: (typeof s.visits.$inferInsert)[] = [];
  const reminderRows: (typeof s.reminders.$inferInsert)[] = [];
  const outboxRows: (typeof s.outbox.$inferInsert)[] = [];
  const convRows: (typeof s.conversations.$inferInsert)[] = [];
  const msgRows: (typeof s.messages.$inferInsert)[] = [];
  const flagRows: (typeof s.chatFlags.$inferInsert)[] = [];

  const sourceWeights: Record<LeadSource, number> = {
    property_portal: 40,
    social_ad: 37,
    website: 15,
    hoarding_call: 8,
  };
  const hourWeights = [0, 0, 0, 0, 0, 0, 1, 2, 4, 6, 7, 7, 7, 6, 6, 6, 6, 7, 8, 9, 9, 7, 4, 2];
  const randomTimeOn = (date: string) => {
    let r = rand() * hourWeights.reduce((a, b) => a + b, 0);
    let h = 0;
    while ((r -= hourWeights[h]) >= 0) h++;
    const m = Math.floor(rand() * 60);
    return istInstant(date, `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  };

  const drafts: { createdAt: Date; source: LeadSource }[] = [];
  for (let d = firstDay; d <= today; d = addDays(d, 1)) {
    const count = Math.round(between(85, 115));
    for (let i = 0; i < count; i++) {
      const createdAt = randomTimeOn(d);
      if (createdAt > now) continue;
      drafts.push({ createdAt, source: weighted(sourceWeights) });
    }
  }
  drafts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // Codes run up to LD-58400 so the three known sample leads (LD-58210, -58211, -58224) sit in the
  // last few days. Their codes are reserved here and filled with the exact sample rows below.
  const reserved = new Set([58210, 58211, 58224]);
  let codeNum = 58400 - drafts.length - reserved.size + 1;
  const nextCode = () => {
    while (reserved.has(codeNum)) codeNum++;
    return codeNum++;
  };
  const phoneFor = (n: number) => `+9170000${String(n).padStart(5, "0")}`; // fictional range, never a real subscriber

  const projectOf = (id: string) => cat.projects.find((p) => p.id === id)!;
  const pendingCutoff = new Date(now.getTime() - 20 * HOUR);

  function addVisit(
    lead: LeadRow,
    slot: { id: string; startsAt: Date },
    execId: string,
    forced?: "booked" | "visited",
  ) {
    const visitId = randomUUID();
    const past = slot.startsAt < now;
    let status: "booked" | "visited" | "no_show" = "booked";
    if (forced) status = forced;
    else if (past && slot.startsAt < pendingCutoff) status = rand() < 0.7 ? "visited" : "no_show";
    visitRows.push({
      id: visitId,
      code: `VS-${String(20000 + visitRows.length + 1)}`,
      leadId: lead.id,
      projectId: lead.projectId!,
      slotId: slot.id,
      startsAt: slot.startsAt,
      executiveId: execId,
      status,
      bookedVia:
        lead.createdAt >= new Date(`${cat.GO_LIVE}T00:00:00+05:30`) ? "assistant" : "staff",
      checkinToken: randomUUID().replace(/-/g, ""),
      checkedInAt:
        status === "visited" ? new Date(slot.startsAt.getTime() + between(-10, 25) * MIN) : null,
      createdAt: new Date(
        Math.min(lead.createdAt.getTime() + between(5, 90) * MIN, slot.startsAt.getTime() - HOUR),
      ),
    });
    for (const [kind, offset] of [
      ["day_before", 24 * HOUR],
      ["two_hours_before", 2 * HOUR],
    ] as const) {
      const sendAt = new Date(slot.startsAt.getTime() - offset);
      const bookedAt = visitRows.at(-1)!.createdAt as Date;
      const tooLate = sendAt <= bookedAt;
      reminderRows.push({
        visitId,
        kind,
        sendAt,
        status: tooLate ? "skipped" : sendAt < now ? "sent" : "scheduled",
        sentAt: !tooLate && sendAt < now ? sendAt : null,
        skipReason: tooLate ? "Visit booked after this reminder was due" : null,
      });
    }
    lead.status =
      status === "visited" ? "visited" : status === "no_show" ? "no_show" : "visit_booked";
    lead.ownerId = execId;
    return status;
  }

  // The sample visits have fixed times, so their slots are taken before any random booking.
  const hardikSlot = takeSlot("project-1", now, now, istInstant("2026-11-01", "11:00"));
  const kavitaSlot = takeSlot("project-2", now, now, istInstant("2026-11-01", "16:00"));
  if (!hardikSlot || !kavitaSlot)
    throw new Error("Sample visit slots on 2026-11-01 are not available");

  for (const draft of drafts) {
    const n = nextCode();
    const projectId = rand() < 0.55 ? "project-1" : "project-2";
    const project = projectOf(projectId);
    const language = weighted<Lang>({ en: 55, hi: 25, gu: 20 });
    const first = pick(cat.firstNames);
    const name = `${first} ${pick(cat.lastNames)}`;
    const wantsBhk =
      rand() < 0.15 ? null : rand() < (projectId === "project-1" ? 0.45 : 0.6) ? "2BHK" : "3BHK";
    const budgetKnown = rand() < 0.55;
    const budgetMaxInr = budgetKnown
      ? Math.round((project.minPriceInr * between(0.7, 1.5)) / 100_000) * 100_000
      : null;
    const timeline =
      rand() < 0.35 ? null : weighted({ "0-3m": 25, "3-6m": 30, "6-12m": 30, "12m+": 15 } as const);
    const live = draft.createdAt >= new Date(`${cat.GO_LIVE}T00:00:00+05:30`);

    const lead: LeadRow = {
      id: randomUUID(),
      code: `LD-${n}`,
      name: draft.source === "website" && rand() < 0.3 ? null : name,
      phone: phoneFor(n),
      email:
        draft.source !== "hoarding_call" && rand() < 0.5
          ? `${first.toLowerCase()}${n}@example.com`
          : null,
      language,
      projectId,
      wantsBhk,
      budgetMinInr: budgetMaxInr ? Math.round((budgetMaxInr * 0.85) / 100_000) * 100_000 : null,
      budgetMaxInr,
      timeline,
      status: "new",
      firstSource: draft.source,
      createdAt: draft.createdAt,
      lastActivityAt: draft.createdAt,
    };

    // Portal and ad forms carry a consent checkbox; website chat asks before collecting a number;
    // hoarding callers agree on the call.
    const consentVia: Record<LeadSource, string> = {
      property_portal: "portal_form",
      social_ad: "ad_form",
      website: "web_chat",
      hoarding_call: "staff_call",
    };
    consentRows.push({
      leadId: lead.id,
      channel: "whatsapp",
      granted: true,
      capturedVia: consentVia[draft.source],
      noticeVersion: "2026-10",
      createdAt: draft.createdAt,
    });

    touchRows.push({
      leadId: lead.id,
      source: draft.source,
      campaign:
        draft.source === "social_ad"
          ? pick(["Diwali homes", "3 BHK Shela", "2 BHK Gota", "Ready to book"])
          : draft.source === "property_portal"
            ? pick(["Portal A", "Portal B", "Portal C"])
            : null,
      receivedAt: draft.createdAt,
    });

    // Before go-live a telecaller called back the next day (or never); after it, the reply is automatic.
    let firstResponseAt: Date | null = null;
    if (draft.source === "hoarding_call") {
      firstResponseAt = draft.createdAt; // the call itself is answered
    } else if (live) {
      firstResponseAt = new Date(draft.createdAt.getTime() + between(15, 95) * 1000);
      outboxRows.push({
        channel: "whatsapp",
        template: "first_response",
        toPhone: lead.phone,
        leadId: lead.id,
        status: "sent",
        createdAt: firstResponseAt,
        body: `Hello${lead.name ? ` ${first}` : ""}, thank you for your interest in ${project.name} (RERA ${project.reraNumber}). Ask me anything about the homes or book a site visit here: nivasa.app/c/${n}. Reply STOP to opt out.`,
      });
    } else if (rand() < 0.72) {
      const delay = lognormal(15 * HOUR, 0.9);
      const at = new Date(draft.createdAt.getTime() + delay);
      if (at < now) firstResponseAt = at;
    }
    lead.firstResponseAt = firstResponseAt;
    if (firstResponseAt) {
      lead.status = "contacted";
      lead.lastActivityAt = firstResponseAt;
    }

    // About 1 in 100 opt out.
    if (firstResponseAt && rand() < 0.01) {
      const at = new Date(firstResponseAt.getTime() + between(1, 30) * MIN);
      lead.optedOutAt = at;
      consentRows.push({
        leadId: lead.id,
        channel: "whatsapp",
        granted: false,
        capturedVia: "stop_keyword",
        noticeVersion: "2026-10",
        createdAt: at,
      });
    }

    // Roughly 6% of leads end up visiting a site.
    if (firstResponseAt && !lead.optedOutAt && rand() < 0.075) {
      const window = takeSlot(
        projectId,
        new Date(draft.createdAt.getTime() + 3 * HOUR),
        new Date(draft.createdAt.getTime() + 9 * 24 * HOUR),
      );
      if (window) addVisit(lead, window.slot, window.exec.id);
    }

    // Older leads that went nowhere are closed.
    if (
      lead.status === "contacted" &&
      draft.createdAt < new Date(now.getTime() - 30 * 24 * HOUR) &&
      rand() < 0.4
    ) {
      lead.status = "closed_lost";
    }

    lead.score = scoreLead({
      budgetMaxInr: lead.budgetMaxInr ?? null,
      timeline: lead.timeline ?? null,
      wantsBhk: lead.wantsBhk ?? null,
      hasPhone: true,
      hasUpcomingVisit: lead.status === "visit_booked",
      projectMinPriceInr: project.minPriceInr,
    }).score;
    if (!lead.ownerId && lead.score === "hot" && firstResponseAt) {
      const exec = execs
        .filter((e) => e.projectId === projectId)
        .sort((a, b) => (execLoad.get(a.id) ?? 0) - (execLoad.get(b.id) ?? 0))[0];
      lead.ownerId = exec.id;
      execLoad.set(exec.id, (execLoad.get(exec.id) ?? 0) + 1);
    }
    leadRows.push(lead);
  }

  /* ---------- the three known sample leads ---------- */
  const sample = (
    code: number,
    name: string,
    source: LeadSource,
    projectId: string,
    wantsBhk: "2BHK" | "3BHK",
    createdAt: Date,
  ) => {
    const lead: LeadRow = {
      id: randomUUID(),
      code: `LD-${code}`,
      name,
      phone: phoneFor(code),
      email: null,
      language: "en",
      projectId,
      wantsBhk,
      status: "contacted",
      firstSource: source,
      createdAt,
      lastActivityAt: createdAt,
      firstResponseAt: new Date(createdAt.getTime() + (source === "hoarding_call" ? 0 : 41_000)),
    };
    leadRows.push(lead);
    touchRows.push({ leadId: lead.id, source, receivedAt: createdAt });
    consentRows.push({
      leadId: lead.id,
      channel: "whatsapp",
      granted: true,
      capturedVia:
        source === "hoarding_call"
          ? "staff_call"
          : source === "social_ad"
            ? "ad_form"
            : "portal_form",
      noticeVersion: "2026-10",
      createdAt,
    });
    return lead;
  };
  const hardik = sample(
    58210,
    "Hardik Patel",
    "property_portal",
    "project-1",
    "3BHK",
    new Date("2026-10-30T18:42:00+05:30"),
  );
  Object.assign(hardik, { budgetMinInr: 10_000_000, budgetMaxInr: 11_500_000, timeline: "0-3m" });
  addVisit(hardik, hardikSlot.slot, hardikSlot.exec.id, "booked"); // past, outcome not yet recorded

  const nidhi = sample(
    58211,
    "Nidhi Shah",
    "social_ad",
    "project-2",
    "2BHK",
    new Date("2026-10-30T21:05:00+05:30"),
  );
  Object.assign(nidhi, { language: "gu", timeline: "3-6m" });

  const kavita = sample(
    58224,
    "Kavita Joshi",
    "hoarding_call",
    "project-2",
    "2BHK",
    new Date("2026-10-31T10:20:00+05:30"),
  );
  Object.assign(kavita, {
    language: "hi",
    budgetMinInr: 6_500_000,
    budgetMaxInr: 7_200_000,
    timeline: "0-3m",
  });
  addVisit(kavita, kavitaSlot.slot, kavitaSlot.exec.id, "visited");
  for (const l of [hardik, nidhi, kavita]) {
    const p = projectOf(l.projectId!);
    l.score = scoreLead({
      budgetMaxInr: l.budgetMaxInr ?? null,
      timeline: l.timeline ?? null,
      wantsBhk: l.wantsBhk ?? null,
      hasPhone: true,
      hasUpcomingVisit: l.status === "visit_booked",
      projectMinPriceInr: p.minPriceInr,
    }).score;
  }
  nidhi.ownerId = execs.find((e) => e.projectId === "project-2")!.id;

  /* ---------- outbound messages for visits ---------- */
  const leadById = new Map(leadRows.map((l) => [l.id, l]));
  for (const v of visitRows) {
    const lead = leadById.get(v.leadId)!;
    const p = projectOf(v.projectId);
    const when = `${istDate(v.startsAt as Date)} at ${istTime(v.startsAt as Date)}`;
    outboxRows.push({
      channel: "whatsapp",
      template: "visit_confirmation",
      toPhone: lead.phone,
      leadId: lead.id,
      status: "sent",
      createdAt: v.createdAt as Date,
      body: `Your site visit to ${p.name} is booked for ${when}. Location: https://maps.google.com/?q=${p.latitude},${p.longitude}. RERA ${p.reraNumber}. Reply STOP to opt out.`,
    });
  }
  for (const r of reminderRows) {
    if (r.status !== "sent") continue;
    const v = visitRows.find((x) => x.id === r.visitId)!;
    const lead = leadById.get(v.leadId)!;
    const p = projectOf(v.projectId);
    outboxRows.push({
      channel: "whatsapp",
      template: r.kind === "day_before" ? "reminder_day_before" : "reminder_two_hours",
      toPhone: lead.phone,
      leadId: lead.id,
      status: lead.optedOutAt ? "suppressed" : "sent",
      suppressedReason: lead.optedOutAt ? "opted_out" : null,
      createdAt: r.sendAt,
      body: `Reminder: your visit to ${p.name} is ${r.kind === "day_before" ? "tomorrow" : "in two hours"} at ${istTime(v.startsAt as Date)}. Location: https://maps.google.com/?q=${p.latitude},${p.longitude}. RERA ${p.reraNumber}.`,
    });
  }

  /* ---------- duplicates ---------- */
  // ~3% come back through a second source with the same number: merged as an extra touch.
  const liveLeads = leadRows.filter((l) => l.createdAt > new Date(now.getTime() - 25 * 24 * HOUR));
  for (const l of liveLeads) {
    if (rand() < 0.03) {
      const source = weighted(sourceWeights);
      touchRows.push({
        leadId: l.id,
        source,
        receivedAt: new Date(l.createdAt.getTime() + between(2, 120) * HOUR),
        message: "Repeat enquiry, same mobile number – merged automatically",
      });
    }
  }
  // Likely duplicates with a different number: left open for a person to decide.
  const dupRows: (typeof s.duplicateCandidates.$inferInsert)[] = [];
  const named = liveLeads.filter((l) => l.name && l.email);
  for (let i = 0; i < 18 && named.length; i++) {
    const orig = pick(named);
    const n = nextCode();
    const twin: LeadRow = {
      ...orig,
      id: randomUUID(),
      code: `LD-${n}`,
      phone: phoneFor(n),
      // Same person typed slightly differently on another portal, or exactly the same name.
      name: i % 2 ? orig.name!.slice(0, -1) : orig.name,
      email: i % 3 === 0 ? orig.email : null,
      status: "new",
      ownerId: null,
      firstResponseAt: null,
      firstSource: weighted(sourceWeights),
      createdAt: new Date(
        Math.min(orig.createdAt.getTime() + between(1, 72) * HOUR, now.getTime() - MIN),
      ),
    };
    twin.lastActivityAt = twin.createdAt;
    leadRows.push(twin);
    touchRows.push({ leadId: twin.id, source: twin.firstSource, receivedAt: twin.createdAt });
    consentRows.push({
      leadId: twin.id,
      channel: "whatsapp",
      granted: true,
      capturedVia: "portal_form",
      noticeVersion: "2026-10",
      createdAt: twin.createdAt,
    });
    dupRows.push({
      leadId: twin.id,
      candidateLeadId: orig.id,
      reason: twin.email ? "Same email address" : "Similar name, same project",
      similarity: twin.email ? 95 : Math.round(between(78, 92)),
      createdAt: twin.createdAt,
    });
  }

  /* ---------- conversations ---------- */
  const fill = (text: string, lead: LeadRow, lang: Lang) => {
    const p = projectOf(lead.projectId!);
    const isP1 = p.id === "project-1";
    const first = lead.name?.split(" ")[0] ?? "";
    const possession = {
      en: isP1 ? "December 2028" : "June 2028",
      hi: isP1 ? "दिसंबर 2028" : "जून 2028",
      gu: isP1 ? "ડિસેમ્બર 2028" : "જૂન 2028",
    }[lang];
    const price2 = {
      en: isP1 ? "₹78 lakh" : "₹65 lakh",
      hi: isP1 ? "₹78 लाख" : "₹65 लाख",
      gu: isP1 ? "₹78 લાખ" : "₹65 લાખ",
    }[lang];
    const amenities = isP1
      ? "Yes. {project} has a clubhouse, swimming pool, gym, children's play area and a landscaped garden."
      : "A swimming pool is not listed for {project}. Its amenities are a clubhouse, gym, multipurpose hall, children's play area and a jogging track.";
    return text
      .replaceAll("{amenities}", amenities)
      .replaceAll("{area2}", isP1 ? "745 sq ft" : "690 sq ft")
      .replaceAll("{possession}", possession)
      .replaceAll("{price2}", price2)
      .replaceAll("{rera}", p.reraNumber)
      .replaceAll("{project}", p.name)
      .replaceAll("{name}", first)
      .replaceAll("{P}", isP1 ? "P1" : "P2");
  };

  function addConversation(lead: LeadRow, script: Script) {
    const convId = randomUUID();
    const start = new Date(
      (lead.firstResponseAt ?? lead.createdAt).getTime() + between(1, 40) * MIN,
    );
    let t = start.getTime();
    const ids: string[] = [];
    for (const m of script.messages) {
      t += (m.role === "buyer" ? between(20, 180) : between(2, 6)) * 1000;
      const id = randomUUID();
      ids.push(id);
      msgRows.push({
        id,
        conversationId: convId,
        role: m.role,
        content: fill(m.content, lead, script.language),
        citedFacts: m.citedFacts?.map((c) => fill(c, lead, script.language)) ?? null,
        guardrail: m.guardrail ?? null,
        model: m.role === "assistant" ? "gemini-3.5-flash-lite" : null,
        latencyMs: m.role === "assistant" ? Math.round(between(700, 2400)) : null,
        createdAt: new Date(t),
      });
    }
    const owner =
      lead.ownerId ??
      execs
        .filter((e) => e.projectId === lead.projectId)
        .sort((a, b) => (execLoad.get(a.id) ?? 0) - (execLoad.get(b.id) ?? 0))[0].id;
    convRows.push({
      id: convId,
      leadId: lead.id,
      language: script.language,
      status: script.handoff ? "handed_off" : "assistant",
      handedOffTo: script.handoff ? owner : null,
      handoffReason: script.handoff ?? null,
      handoffSummary: script.handoff
        ? `${lead.name ?? "Buyer"} is looking at ${lead.wantsBhk ?? "a home"} in ${projectOf(lead.projectId!).name}${lead.budgetMaxInr ? `, budget up to ₹${Math.round(lead.budgetMaxInr / 100_000)} lakh` : ""}${lead.timeline ? `, buying in ${lead.timeline}` : ""}. ${script.handoff}. Call back today.`
        : null,
      handedOffAt: script.handoff ? new Date(t) : null,
      createdAt: start,
      updatedAt: new Date(t),
    });
    if (script.handoff) {
      lead.ownerId = owner;
      if (lead.status === "contacted" || lead.status === "engaged") lead.status = "handed_off";
    } else if (lead.status === "contacted") lead.status = "engaged";
    if (script.flag) {
      const flagged = script.messages.findIndex((m) => m.guardrail || m.role === "system");
      flagRows.push({
        conversationId: convId,
        messageId: ids[Math.max(flagged, 0)],
        reason: script.flag,
        detail: script.flagDetail ?? null,
        createdAt: new Date(t),
        ...(rand() < 0.5 && lead.createdAt < new Date(now.getTime() - 3 * 24 * HOUR)
          ? {
              reviewedBy: head.id,
              reviewedAt: new Date(t + 18 * HOUR),
              reviewNote: "Checked. Executive called the buyer.",
            }
          : {}),
      });
    }
    if (script.profile.wantsBhk) lead.wantsBhk = script.profile.wantsBhk;
    if (script.profile.budgetMaxLakh) lead.budgetMaxInr = script.profile.budgetMaxLakh * 100_000;
    if (script.profile.timeline) lead.timeline = script.profile.timeline;
    lead.language = script.language;
    lead.lastActivityAt = new Date(t);
  }

  const goLive = new Date(`${cat.GO_LIVE}T00:00:00+05:30`);
  const chatCandidates = leadRows.filter(
    (l) =>
      l.createdAt >= goLive &&
      l.firstResponseAt &&
      !l.optedOutAt &&
      !reserved.has(Number(l.code.slice(3))),
  );
  for (const lead of chatCandidates) {
    if (rand() > 0.12) continue;
    const pool = scripts.filter(
      (sc) => sc.language === lead.language && (!sc.booksVisit || lead.status === "visit_booked"),
    );
    // Most chats are ordinary; flagged ones (discounts, missing facts, injection) are the exception.
    const weightedPool = pool.flatMap((sc) => (sc.flag ? [sc] : [sc, sc, sc, sc, sc]));
    if (weightedPool.length) addConversation(lead, pick(weightedPool));
  }
  addConversation(
    nidhi,
    scripts.find((sc) => sc.key === "gu-human")!,
  );
  addConversation(
    hardik,
    scripts.find((sc) => sc.key === "en-3bhk-booked")!,
  );

  // Conversations fill in budget and timeline, so scores are computed last.
  for (const l of leadRows) {
    l.score = scoreLead({
      budgetMaxInr: l.budgetMaxInr ?? null,
      timeline: l.timeline ?? null,
      wantsBhk: l.wantsBhk ?? null,
      hasPhone: Boolean(l.phone),
      hasUpcomingVisit: l.status === "visit_booked",
      projectMinPriceInr: projectOf(l.projectId!).minPriceInr,
    }).score;
  }

  /* ---------- spend ---------- */
  const months = [
    addDays(firstDay, 0).slice(0, 7),
    addDays(firstDay, 31).slice(0, 7),
    today.slice(0, 7),
  ];
  const spendRows = [...new Set(months)].flatMap((m) =>
    Object.entries(cat.monthlySpend).map(([source, amountInr]) => ({
      source: source as LeadSource,
      month: `${m}-01`,
      amountInr,
    })),
  );

  /* ---------- buyer demo account, linked to the sample lead LD-58210 ---------- */
  const buyerId = randomUUID();
  await db.insert(s.user).values({
    id: buyerId,
    name: "Hardik Patel",
    email: "917000058210@buyer.nivasa.invalid",
    emailVerified: false,
    role: "buyer",
    phoneNumber: hardik.phone,
    phoneNumberVerified: true,
  });
  hardik.buyerUserId = buyerId;

  /* ---------- write ---------- */
  await insertChunks(db, s.slots, slotRows);
  await insertChunks(db, s.leads, leadRows);
  await insertChunks(db, s.leadTouches, touchRows);
  await insertChunks(db, s.consents, consentRows);
  await insertChunks(db, s.duplicateCandidates, dupRows);
  await insertChunks(db, s.visits, visitRows);
  await insertChunks(db, s.reminders, reminderRows);
  await insertChunks(db, s.conversations, convRows);
  await insertChunks(db, s.messages, msgRows);
  await insertChunks(db, s.chatFlags, flagRows);
  await insertChunks(db, s.outbox, outboxRows);
  await insertChunks(db, s.sourceSpend, spendRows);

  console.log(
    [
      `staff ${staff.length}`,
      `leads ${leadRows.length}`,
      `touches ${touchRows.length}`,
      `slots ${slotRows.length}`,
      `visits ${visitRows.length}`,
      `reminders ${reminderRows.length}`,
      `conversations ${convRows.length}`,
      `messages ${msgRows.length}`,
      `flags ${flagRows.length}`,
      `duplicates ${dupRows.length}`,
      `outbox ${outboxRows.length}`,
    ].join(" · "),
  );
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
