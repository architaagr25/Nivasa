CREATE TYPE "public"."bhk" AS ENUM('2BHK', '3BHK');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('assistant', 'handed_off', 'closed');--> statement-breakpoint
CREATE TYPE "public"."duplicate_status" AS ENUM('open', 'merged', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."fact_category" AS ENUM('overview', 'configuration', 'pricing', 'amenities', 'location', 'possession', 'legal', 'payment');--> statement-breakpoint
CREATE TYPE "public"."fact_sheet_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."flag_reason" AS ENUM('missing_fact', 'price_or_discount', 'guardrail_blocked', 'human_requested', 'ai_unavailable', 'prompt_injection');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('en', 'hi', 'gu');--> statement-breakpoint
CREATE TYPE "public"."lead_score" AS ENUM('hot', 'warm', 'cold');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('property_portal', 'social_ad', 'website', 'hoarding_call');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'engaged', 'visit_booked', 'visited', 'no_show', 'handed_off', 'closed_lost');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('buyer', 'assistant', 'staff', 'system');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('sent', 'suppressed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."purpose" AS ENUM('self_use', 'investment');--> statement-breakpoint
CREATE TYPE "public"."reminder_kind" AS ENUM('day_before', 'two_hours_before');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('scheduled', 'sent', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('buyer', 'sales_exec', 'sales_head');--> statement-breakpoint
CREATE TYPE "public"."timeline" AS ENUM('0-3m', '3-6m', '6-12m', '12m+');--> statement-breakpoint
CREATE TYPE "public"."visit_status" AS ENUM('booked', 'visited', 'no_show', 'cancelled');--> statement-breakpoint
CREATE TABLE "access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blackout_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text,
	"date" date NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid,
	"reason" "flag_reason" NOT NULL,
	"detail" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"granted" boolean NOT NULL,
	"captured_via" text NOT NULL,
	"notice_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"channel" text DEFAULT 'web' NOT NULL,
	"language" "language" DEFAULT 'en' NOT NULL,
	"status" "conversation_status" DEFAULT 'assistant' NOT NULL,
	"handed_off_to" text,
	"handoff_reason" text,
	"handoff_summary" text,
	"handed_off_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "duplicate_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"candidate_lead_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"similarity" integer NOT NULL,
	"status" "duplicate_status" DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact_sheet_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" "fact_sheet_status" DEFAULT 'draft' NOT NULL,
	"change_note" text,
	"created_by" text,
	"published_by" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"code" text NOT NULL,
	"category" "fact_category" NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_touches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"source" "lead_source" NOT NULL,
	"campaign" text,
	"external_ref" text,
	"message" text,
	"payload" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text,
	"phone" text,
	"email" text,
	"language" "language" DEFAULT 'en' NOT NULL,
	"project_id" text,
	"wants_bhk" "bhk",
	"budget_min_inr" integer,
	"budget_max_inr" integer,
	"timeline" timeline,
	"purpose" "purpose",
	"loan_needed" boolean,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"score" "lead_score",
	"owner_id" text,
	"buyer_user_id" text,
	"first_source" "lead_source" NOT NULL,
	"first_response_at" timestamp with time zone,
	"opted_out_at" timestamp with time zone,
	"merged_into_id" uuid,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"author_id" text,
	"content" text NOT NULL,
	"parts" jsonb,
	"cited_facts" text[],
	"guardrail" text,
	"model" text,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"template" text NOT NULL,
	"to_phone" text,
	"to_user_id" text,
	"lead_id" uuid,
	"body" text NOT NULL,
	"status" "outbox_status" NOT NULL,
	"suppressed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"rera_number" text NOT NULL,
	"locality" text NOT NULL,
	"address" text NOT NULL,
	"latitude" text NOT NULL,
	"longitude" text NOT NULL,
	"hero_image" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"kind" "reminder_kind" NOT NULL,
	"send_at" timestamp with time zone NOT NULL,
	"status" "reminder_status" DEFAULT 'scheduled' NOT NULL,
	"sent_at" timestamp with time zone,
	"skip_reason" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "slot_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"duration_min" smallint DEFAULT 60 NOT NULL,
	"capacity" smallint NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" smallint NOT NULL,
	"booked" smallint DEFAULT 0 NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "slots_booked_within_capacity" CHECK ("slots"."booked" >= 0 and "slots"."booked" <= "slots"."capacity")
);
--> statement-breakpoint
CREATE TABLE "source_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "lead_source" NOT NULL,
	"month" date NOT NULL,
	"amount_inr" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"phone" text NOT NULL,
	"project_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "role" DEFAULT 'buyer' NOT NULL,
	"phone_number" text,
	"phone_number_verified" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_phoneNumber_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"lead_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"slot_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"executive_id" text NOT NULL,
	"status" "visit_status" DEFAULT 'booked' NOT NULL,
	"booked_via" text NOT NULL,
	"checkin_token" text NOT NULL,
	"checked_in_at" timestamp with time zone,
	"outcome_note" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"rescheduled_from_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visits_code_unique" UNIQUE("code"),
	CONSTRAINT "visits_checkinToken_unique" UNIQUE("checkin_token")
);
--> statement-breakpoint
ALTER TABLE "access_log" ADD CONSTRAINT "access_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackout_dates" ADD CONSTRAINT "blackout_dates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_flags" ADD CONSTRAINT "chat_flags_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_flags" ADD CONSTRAINT "chat_flags_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_flags" ADD CONSTRAINT "chat_flags_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_handed_off_to_user_id_fk" FOREIGN KEY ("handed_off_to") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_candidate_lead_id_leads_id_fk" FOREIGN KEY ("candidate_lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_sheet_versions" ADD CONSTRAINT "fact_sheet_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_sheet_versions" ADD CONSTRAINT "fact_sheet_versions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_sheet_versions" ADD CONSTRAINT "fact_sheet_versions_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_version_id_fact_sheet_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."fact_sheet_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_touches" ADD CONSTRAINT "lead_touches_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_buyer_user_id_user_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_templates" ADD CONSTRAINT "slot_templates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_slot_id_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_executive_id_user_id_fk" FOREIGN KEY ("executive_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_log_entity" ON "access_log" USING btree ("entity_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "blackout_project_date" ON "blackout_dates" USING btree ("project_id","date");--> statement-breakpoint
CREATE INDEX "chat_flags_open" ON "chat_flags" USING btree ("created_at") WHERE "chat_flags"."reviewed_at" is null;--> statement-breakpoint
CREATE INDEX "consents_lead" ON "consents" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "conversations_lead" ON "conversations" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "duplicate_pair" ON "duplicate_candidates" USING btree ("lead_id","candidate_lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fact_sheet_versions_project_version" ON "fact_sheet_versions" USING btree ("project_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "fact_sheet_versions_one_published" ON "fact_sheet_versions" USING btree ("project_id") WHERE "fact_sheet_versions"."status" = 'published';--> statement-breakpoint
CREATE UNIQUE INDEX "facts_version_code" ON "facts" USING btree ("version_id","code");--> statement-breakpoint
CREATE INDEX "lead_touches_lead" ON "lead_touches" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_phone_live" ON "leads" USING btree ("phone") WHERE "leads"."merged_into_id" is null and "leads"."phone" is not null;--> statement-breakpoint
CREATE INDEX "leads_owner" ON "leads" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "leads_created" ON "leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "leads_name_trgm" ON "leads" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "messages_conversation" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "outbox_created" ON "outbox" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "outbox_lead" ON "outbox" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_visit_kind" ON "reminders" USING btree ("visit_id","kind");--> statement-breakpoint
CREATE INDEX "reminders_due" ON "reminders" USING btree ("send_at") WHERE "reminders"."status" = 'scheduled';--> statement-breakpoint
CREATE UNIQUE INDEX "slots_project_start" ON "slots" USING btree ("project_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "source_spend_month" ON "source_spend" USING btree ("source","month");--> statement-breakpoint
CREATE UNIQUE INDEX "visits_one_active_per_lead_project" ON "visits" USING btree ("lead_id","project_id") WHERE "visits"."status" = 'booked';--> statement-breakpoint
CREATE UNIQUE INDEX "visits_exec_no_overlap" ON "visits" USING btree ("executive_id","starts_at") WHERE "visits"."status" = 'booked';--> statement-breakpoint
CREATE INDEX "visits_starts" ON "visits" USING btree ("starts_at");