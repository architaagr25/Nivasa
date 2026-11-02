import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processDueReminders } from "@/server/bookings/service";

// Called every minute by the database scheduler (pg_cron + pg_net), and by the
// "run now" button in the demo console. Running it twice at once is harmless.
async function handle(request: Request) {
  if (!authorised(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const result = await processDueReminders();
  return NextResponse.json({ ok: true, ...result });
}

function authorised(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const GET = handle;
export const POST = handle;
