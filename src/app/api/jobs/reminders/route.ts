import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processDueReminders } from "@/server/bookings/service";
import { pruneLimits } from "@/server/rate-limit";
import { extendSlotHorizon } from "@/server/slots/sync";

// Called every minute by the database scheduler (pg_cron + pg_net), and by the
// "run now" button in the demo console. Running it twice at once is harmless. It also keeps
// the booking window rolling, which only does work about once a day.
async function handle(request: Request) {
  if (!authorised(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const result = await processDueReminders();
  const slotsExtended = await extendSlotHorizon();
  await pruneLimits();
  return NextResponse.json({ ok: true, ...result, slotsExtended });
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
