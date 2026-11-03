import { createEvent } from "ics";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapsLink } from "@/lib/format";
import { getBuyerVisit } from "@/server/visits/queries";

/** The visit as a calendar file, so it lands in the buyer's phone calendar with the map link. */
export async function GET(_request: Request, ctx: RouteContext<"/api/visits/[code]/ics">) {
  const { code } = await ctx.params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new NextResponse(null, { status: 401 });

  const visit = await getBuyerVisit(session.user, code);
  if (!visit) return new NextResponse(null, { status: 404 });

  const { value, error } = createEvent({
    uid: `${visit.code}@nivasa`,
    title: `Site visit · ${visit.projectName}`,
    start: visit.startsAt.getTime(),
    startInputType: "utc",
    duration: { hours: 1 },
    location: visit.address,
    geo: { lat: Number(visit.latitude), lon: Number(visit.longitude) },
    url: mapsLink(visit.latitude, visit.longitude),
    description: `You'll meet ${visit.executiveName} at the site office. RERA ${visit.reraNumber}. Booking ${visit.code}.`,
    status: "CONFIRMED",
  });
  if (error || !value) return new NextResponse(null, { status: 500 });

  return new NextResponse(value, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${visit.code}.ics"`,
    },
  });
}
