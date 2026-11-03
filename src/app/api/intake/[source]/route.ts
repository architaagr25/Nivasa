import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestLead } from "@/server/leads/ingest";

// Portals and ad platforms post new leads here, each with the shared intake key.
// Calls to the hoarding number are logged by staff in the app instead.
const SOURCES = {
  "property-portal": "property_portal",
  "social-ad": "social_ad",
  website: "website",
} as const;

const body = z.object({
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(20),
  email: z.email().max(120).optional(),
  project: z.enum(["project-1", "project-2"]).optional(),
  bhk: z.enum(["2BHK", "3BHK"]).optional(),
  budget_lakh: z.number().min(10).max(1000).optional(),
  language: z.enum(["en", "hi", "gu"]).optional(),
  message: z.string().max(500).optional(),
  campaign: z.string().max(80).optional(),
  external_ref: z.string().max(80).optional(),
  // Consent is required to be stated either way; we never assume it.
  consent: z.boolean(),
});

function authorised(header: string | null) {
  const secret = process.env.INTAKE_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request, ctx: RouteContext<"/api/intake/[source]">) {
  if (!authorised(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const { source } = await ctx.params;
  const mapped = SOURCES[source as keyof typeof SOURCES];
  if (!mapped) return NextResponse.json({ error: "Unknown source" }, { status: 404 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid lead", issues: parsed.error.issues.map((i) => i.path.join(".")) },
      { status: 422 },
    );
  }
  const d = parsed.data;
  const result = await ingestLead({
    source: mapped,
    name: d.name,
    phone: d.phone,
    email: d.email,
    projectId: d.project,
    wantsBhk: d.bhk,
    budgetMaxInr: d.budget_lakh ? Math.round(d.budget_lakh * 100_000) : null,
    language: d.language,
    message: d.message,
    campaign: d.campaign,
    externalRef: d.external_ref,
    consent: d.consent,
  });
  return NextResponse.json(
    {
      lead: result.code,
      outcome: result.outcome,
      first_reply: result.firstReply,
      possible_duplicates: result.possibleDuplicates,
    },
    { status: result.outcome === "created" ? 201 : 200 },
  );
}
