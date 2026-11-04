import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = () => timestamp({ withTimezone: true });

// Human-readable codes ("LD-60001", "VS-30001") come from sequences so that two requests
// arriving at the same moment can never be handed the same code.
export const leadCodeSeq = pgSequence("lead_code_seq", { startWith: 60001 });
export const visitCodeSeq = pgSequence("visit_code_seq", { startWith: 30001 });
const createdAt = () => ts().notNull().defaultNow();

/* ------------------------------------------------------------------ */
/* Auth (shape required by Better Auth, plus phone number and role)   */
/* ------------------------------------------------------------------ */

export const roleEnum = pgEnum("role", ["buyer", "sales_exec", "sales_head"]);

export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  role: roleEnum().notNull().default("buyer"),
  phoneNumber: text().unique(),
  phoneNumberVerified: boolean(),
  createdAt: createdAt(),
  updatedAt: createdAt(),
});

export const session = pgTable("session", {
  id: text().primaryKey(),
  expiresAt: ts().notNull(),
  token: text().notNull().unique(),
  ipAddress: text(),
  userAgent: text(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: createdAt(),
});

export const account = pgTable("account", {
  id: text().primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: ts(),
  refreshTokenExpiresAt: ts(),
  scope: text(),
  password: text(),
  createdAt: createdAt(),
  updatedAt: createdAt(),
});

export const verification = pgTable("verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: ts().notNull(),
  createdAt: createdAt(),
  updatedAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Projects and the fact sheet the assistant is allowed to quote      */
/* ------------------------------------------------------------------ */

export const projects = pgTable("projects", {
  id: text().primaryKey(), // "project-1"
  name: text().notNull(), // "Project 1"
  reraNumber: text().notNull(),
  locality: text().notNull(),
  address: text().notNull(),
  latitude: text().notNull(),
  longitude: text().notNull(),
  heroImage: text().notNull(),
  // Lowest indicative price across the project. Shown as "from ₹…" and used for lead scoring;
  // edited together with the fact sheet.
  startingPriceInr: integer().notNull().default(0),
  createdAt: createdAt(),
});

export const factSheetStatusEnum = pgEnum("fact_sheet_status", ["draft", "published", "archived"]);

export const factSheetVersions = pgTable(
  "fact_sheet_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: text()
      .notNull()
      .references(() => projects.id),
    version: integer().notNull(),
    status: factSheetStatusEnum().notNull().default("draft"),
    changeNote: text(),
    createdBy: text().references(() => user.id),
    publishedBy: text().references(() => user.id),
    publishedAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("fact_sheet_versions_project_version").on(t.projectId, t.version),
    // Exactly one live version per project: the assistant always reads this one.
    uniqueIndex("fact_sheet_versions_one_published")
      .on(t.projectId)
      .where(sql`${t.status} = 'published'`),
    // And at most one draft, so two people editing can't end up with competing drafts.
    uniqueIndex("fact_sheet_versions_one_draft")
      .on(t.projectId)
      .where(sql`${t.status} = 'draft'`),
  ],
);

export const factCategoryEnum = pgEnum("fact_category", [
  "overview",
  "configuration",
  "pricing",
  "amenities",
  "location",
  "possession",
  "legal",
  "payment",
]);

export const facts = pgTable(
  "facts",
  {
    id: uuid().primaryKey().defaultRandom(),
    versionId: uuid()
      .notNull()
      .references(() => factSheetVersions.id, { onDelete: "cascade" }),
    // Stable citation code, e.g. "P1-CFG-3BHK". Kept across versions so citations stay meaningful.
    code: text().notNull(),
    category: factCategoryEnum().notNull(),
    label: text().notNull(),
    value: text().notNull(),
    sortOrder: smallint().notNull().default(0),
  },
  (t) => [uniqueIndex("facts_version_code").on(t.versionId, t.code)],
);

/* ------------------------------------------------------------------ */
/* Staff                                                              */
/* ------------------------------------------------------------------ */

export const staffProfiles = pgTable("staff_profiles", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  displayName: text().notNull(),
  phone: text().notNull(),
  projectIds: text()
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  active: boolean().notNull().default(true),
});

/* ------------------------------------------------------------------ */
/* Leads                                                              */
/* ------------------------------------------------------------------ */

export const leadSourceEnum = pgEnum("lead_source", [
  "property_portal",
  "social_ad",
  "website",
  "hoarding_call",
]);
export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "engaged",
  "visit_booked",
  "visited",
  "no_show",
  "handed_off",
  "closed_lost",
]);
export const leadScoreEnum = pgEnum("lead_score", ["hot", "warm", "cold"]);
export const languageEnum = pgEnum("language", ["en", "hi", "gu"]);
export const bhkEnum = pgEnum("bhk", ["2BHK", "3BHK"]);
export const timelineEnum = pgEnum("timeline", ["0-3m", "3-6m", "6-12m", "12m+"]);
export const purposeEnum = pgEnum("purpose", ["self_use", "investment"]);

export const leads = pgTable(
  "leads",
  {
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull().unique(), // "LD-58210"
    name: text(),
    phone: text(),
    email: text(),
    language: languageEnum().notNull().default("en"),
    projectId: text().references(() => projects.id),
    wantsBhk: bhkEnum(),
    budgetMinInr: integer(),
    budgetMaxInr: integer(),
    timeline: timelineEnum(),
    purpose: purposeEnum(),
    loanNeeded: boolean(),
    status: leadStatusEnum().notNull().default("new"),
    score: leadScoreEnum(),
    ownerId: text().references(() => user.id),
    buyerUserId: text().references(() => user.id),
    firstSource: leadSourceEnum().notNull(),
    firstResponseAt: ts(),
    // Set when the buyer opts out; every outbound message checks this first.
    optedOutAt: ts(),
    mergedIntoId: uuid(),
    lastActivityAt: createdAt(),
    createdAt: createdAt(),
  },
  (t) => [
    // One live lead per phone number; merged duplicates keep their row for history.
    uniqueIndex("leads_phone_live")
      .on(t.phone)
      .where(sql`${t.mergedIntoId} is null and ${t.phone} is not null`),
    index("leads_owner").on(t.ownerId),
    index("leads_created").on(t.createdAt),
    index("leads_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`),
  ],
);

// Every time a lead reaches us, from any channel. A lead seen on two portals has two touches.
export const leadTouches = pgTable(
  "lead_touches",
  {
    id: uuid().primaryKey().defaultRandom(),
    leadId: uuid()
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    source: leadSourceEnum().notNull(),
    campaign: text(),
    externalRef: text(),
    message: text(),
    payload: jsonb(),
    receivedAt: createdAt(),
  },
  (t) => [index("lead_touches_lead").on(t.leadId)],
);

export const duplicateStatusEnum = pgEnum("duplicate_status", ["open", "merged", "dismissed"]);

export const duplicateCandidates = pgTable(
  "duplicate_candidates",
  {
    id: uuid().primaryKey().defaultRandom(),
    leadId: uuid()
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    candidateLeadId: uuid()
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    reason: text().notNull(), // "same email", "similar name, same project"
    similarity: integer().notNull(), // 0-100
    status: duplicateStatusEnum().notNull().default("open"),
    resolvedBy: text().references(() => user.id),
    resolvedAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("duplicate_pair").on(t.leadId, t.candidateLeadId)],
);

// Append-only consent log (DPDP). Current state is the latest row per lead and channel.
export const consents = pgTable(
  "consents",
  {
    id: uuid().primaryKey().defaultRandom(),
    leadId: uuid()
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    channel: text().notNull(), // "whatsapp" | "sms" | "call"
    granted: boolean().notNull(),
    capturedVia: text().notNull(), // "web_chat", "portal_form", "staff_call", "stop_keyword"
    noticeVersion: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("consents_lead").on(t.leadId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Conversations                                                      */
/* ------------------------------------------------------------------ */

export const conversationStatusEnum = pgEnum("conversation_status", [
  "assistant",
  "handed_off",
  "closed",
]);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid().primaryKey().defaultRandom(),
    leadId: uuid().references(() => leads.id, { onDelete: "cascade" }),
    channel: text().notNull().default("web"),
    language: languageEnum().notNull().default("en"),
    status: conversationStatusEnum().notNull().default("assistant"),
    handedOffTo: text().references(() => user.id),
    handoffReason: text(),
    handoffSummary: text(),
    handedOffAt: ts(),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [index("conversations_lead").on(t.leadId)],
);

export const messageRoleEnum = pgEnum("message_role", ["buyer", "assistant", "staff", "system"]);

export const messages = pgTable(
  "messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    conversationId: uuid()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRoleEnum().notNull(),
    authorId: text().references(() => user.id),
    content: text().notNull(),
    // Structured parts (slot cards, booking confirmations) rendered by the chat UI.
    parts: jsonb(),
    citedFacts: text().array(),
    // AI translations for staff who don't read the buyer's script, keyed by language. The
    // original content above is the record and is never changed.
    translations: jsonb().$type<Partial<Record<"en" | "hi" | "gu", string>>>(),
    // What the guardrail did to this reply, if anything: "price_blocked", "uncited_fact", ...
    guardrail: text(),
    model: text(),
    latencyMs: integer(),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation").on(t.conversationId, t.createdAt)],
);

export const flagReasonEnum = pgEnum("flag_reason", [
  "missing_fact",
  "price_or_discount",
  "guardrail_blocked",
  "human_requested",
  "ai_unavailable",
  "prompt_injection",
]);

export const chatFlags = pgTable(
  "chat_flags",
  {
    id: uuid().primaryKey().defaultRandom(),
    conversationId: uuid()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    messageId: uuid().references(() => messages.id, { onDelete: "set null" }),
    reason: flagReasonEnum().notNull(),
    detail: text(),
    reviewedBy: text().references(() => user.id),
    reviewedAt: ts(),
    reviewNote: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("chat_flags_open")
      .on(t.createdAt)
      .where(sql`${t.reviewedAt} is null`),
  ],
);

/* ------------------------------------------------------------------ */
/* Visit slots and bookings                                           */
/* ------------------------------------------------------------------ */

export const slotTemplates = pgTable("slot_templates", {
  id: uuid().primaryKey().defaultRandom(),
  projectId: text()
    .notNull()
    .references(() => projects.id),
  weekday: smallint().notNull(), // 0 = Sunday
  startTime: time().notNull(),
  durationMin: smallint().notNull().default(60),
  capacity: smallint().notNull(),
  active: boolean().notNull().default(true),
});

export const blackoutDates = pgTable(
  "blackout_dates",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: text().references(() => projects.id), // null = all projects
    date: date().notNull(),
    reason: text().notNull(),
  },
  (t) => [uniqueIndex("blackout_project_date").on(t.projectId, t.date)],
);

export const slots = pgTable(
  "slots",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: text()
      .notNull()
      .references(() => projects.id),
    startsAt: ts().notNull(),
    endsAt: ts().notNull(),
    capacity: smallint().notNull(),
    booked: smallint().notNull().default(0),
    blocked: boolean().notNull().default(false),
  },
  (t) => [
    uniqueIndex("slots_project_start").on(t.projectId, t.startsAt),
    // The database itself refuses an overbooked slot, whatever the application does.
    check("slots_booked_within_capacity", sql`${t.booked} >= 0 and ${t.booked} <= ${t.capacity}`),
  ],
);

export const visitStatusEnum = pgEnum("visit_status", [
  "booked",
  "visited",
  "no_show",
  "cancelled",
]);

export const visits = pgTable(
  "visits",
  {
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull().unique(), // "VS-20417"
    leadId: uuid()
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    projectId: text()
      .notNull()
      .references(() => projects.id),
    slotId: uuid()
      .notNull()
      .references(() => slots.id),
    startsAt: ts().notNull(),
    executiveId: text()
      .notNull()
      .references(() => user.id),
    status: visitStatusEnum().notNull().default("booked"),
    bookedVia: text().notNull(), // "assistant" | "staff" | "buyer_portal"
    checkinToken: text().notNull().unique(),
    checkedInAt: ts(),
    outcomeNote: text(),
    cancelledAt: ts(),
    cancelReason: text(),
    rescheduledFromId: uuid(),
    createdAt: createdAt(),
  },
  (t) => [
    // A buyer holds at most one upcoming visit per project.
    uniqueIndex("visits_one_active_per_lead_project")
      .on(t.leadId, t.projectId)
      .where(sql`${t.status} = 'booked'`),
    // An executive cannot be in two places at once.
    uniqueIndex("visits_exec_no_overlap")
      .on(t.executiveId, t.startsAt)
      .where(sql`${t.status} = 'booked'`),
    index("visits_starts").on(t.startsAt),
  ],
);

export const reminderKindEnum = pgEnum("reminder_kind", ["day_before", "two_hours_before"]);
export const reminderStatusEnum = pgEnum("reminder_status", [
  "scheduled",
  "sent",
  "skipped",
  "cancelled",
]);

export const reminders = pgTable(
  "reminders",
  {
    id: uuid().primaryKey().defaultRandom(),
    visitId: uuid()
      .notNull()
      .references(() => visits.id, { onDelete: "cascade" }),
    kind: reminderKindEnum().notNull(),
    sendAt: ts().notNull(),
    status: reminderStatusEnum().notNull().default("scheduled"),
    sentAt: ts(),
    skipReason: text(),
  },
  (t) => [
    uniqueIndex("reminders_visit_kind").on(t.visitId, t.kind),
    index("reminders_due")
      .on(t.sendAt)
      .where(sql`${t.status} = 'scheduled'`),
  ],
);

/* ------------------------------------------------------------------ */
/* Simulated outbound messages, spend, and the access log             */
/* ------------------------------------------------------------------ */

export const outboxStatusEnum = pgEnum("outbox_status", ["sent", "suppressed", "failed"]);

export const outbox = pgTable(
  "outbox",
  {
    id: uuid().primaryKey().defaultRandom(),
    channel: text().notNull(), // "whatsapp" | "sms" | "staff_alert"
    template: text().notNull(),
    toPhone: text(),
    toUserId: text().references(() => user.id),
    leadId: uuid().references(() => leads.id, { onDelete: "cascade" }),
    body: text().notNull(),
    status: outboxStatusEnum().notNull(),
    suppressedReason: text(),
    createdAt: createdAt(),
  },
  (t) => [index("outbox_created").on(t.createdAt), index("outbox_lead").on(t.leadId)],
);

export const sourceSpend = pgTable(
  "source_spend",
  {
    id: uuid().primaryKey().defaultRandom(),
    source: leadSourceEnum().notNull(),
    month: date().notNull(), // first day of the month
    amountInr: integer().notNull(),
  },
  (t) => [uniqueIndex("source_spend_month").on(t.source, t.month)],
);

export const accessLog = pgTable(
  "access_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    actorId: text().references(() => user.id),
    action: text().notNull(), // "lead.view", "lead.reveal_phone", "lead.export"
    entityId: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("access_log_entity").on(t.entityId, t.createdAt)],
);
