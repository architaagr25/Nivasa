import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export type SourceKey = "property_portal" | "social_ad" | "website" | "hoarding_call";

export type SourceRow = {
  source: SourceKey;
  leads: number;
  medianResponseSeconds: number | null; // null: more than half were never reached
  within5MinPct: number;
  notReached48hPct: number | null; // null: no leads old enough to judge yet
  visitsBooked: number;
  visited: number;
  noShow: number;
  showUpPct: number | null;
  leadToVisitPct: number;
  spendInr: number;
  costPerVisitInr: number | null;
};

export type Totals = Omit<SourceRow, "source">;

const NEVER = 1e9; // stands in for "never reached" so it sorts last in the median

/**
 * Every number on the dashboard, for leads that came in during [from, to). Definitions:
 * - first response: first message or call to the buyer; never reached counts as slowest
 * - not reached in 48 h: among leads at least 48 h old, no response or one later than 48 h
 * - visit booked: the lead has a visit that wasn't cancelled; lead-to-visit uses this
 * - show-up: visited / (visited + no-show), for visits whose outcome is known
 * - cost per visit: that source's spend for the period / completed visits
 * Spend is entered per month and spread evenly over the days of the period.
 */
export async function dashboard(fromDate: Date, toDate: Date, projectId: string | null) {
  const from = sql`${fromDate.toISOString()}::timestamptz`;
  const to = sql`${toDate.toISOString()}::timestamptz`;
  const project = projectId ? sql`and l.project_id = ${projectId}` : sql``;

  const rows = (await db.execute(sql`
    with cohort as (
      select l.id, l.first_source as source, l.created_at,
        case when l.first_response_at is null then ${NEVER}
             else extract(epoch from l.first_response_at - l.created_at) end as response_s,
        l.created_at < now() - interval '48 hours' as judged
      from leads l
      where l.merged_into_id is null and l.created_at >= ${from} and l.created_at < ${to} ${project}
    ),
    v as (
      select c.id, c.source,
        bool_or(vi.status <> 'cancelled') as booked,
        count(*) filter (where vi.status = 'visited') as visited,
        count(*) filter (where vi.status = 'no_show') as no_show
      from cohort c join visits vi on vi.lead_id = c.id
      group by c.id, c.source
    )
    select c.source,
      count(*)::int as leads,
      percentile_disc(0.5) within group (order by c.response_s) as median_s,
      round(100.0 * avg((c.response_s <= 300)::int), 1)::float as within_5,
      round(100.0 * avg(case when c.judged then (c.response_s > 172800)::int end), 1)::float as unreached,
      count(*) filter (where c.judged)::int as judged,
      coalesce(sum((v.booked)::int), 0)::int as booked,
      coalesce(sum(v.visited), 0)::int as visited,
      coalesce(sum(v.no_show), 0)::int as no_show
    from cohort c left join v on v.id = c.id
    group by c.source
  `)) as unknown as {
    source: SourceKey;
    leads: number;
    median_s: number;
    within_5: number;
    unreached: number | null;
    judged: number;
    booked: number;
    visited: number;
    no_show: number;
  }[];

  const spend = (await db.execute(sql`
    select s.source,
      sum(s.amount_inr * greatest(0,
        least((${to} at time zone 'Asia/Kolkata')::date, (s.month + interval '1 month')::date) - greatest((${from} at time zone 'Asia/Kolkata')::date, s.month)
      )::float / extract(day from (s.month + interval '1 month' - interval '1 day')))::float as spend
    from source_spend s
    where s.month < (${to} at time zone 'Asia/Kolkata')::date and s.month + interval '1 month' > (${from} at time zone 'Asia/Kolkata')::date
    group by s.source
  `)) as unknown as { source: SourceKey; spend: number }[];
  // Spend can't be split by project, so a project filter shows spend for both projects.
  const spendOf = new Map(spend.map((s) => [s.source, Math.round(s.spend)]));

  const sources: SourceKey[] = ["property_portal", "social_ad", "website", "hoarding_call"];
  const bySource: SourceRow[] = sources.map((source) => {
    const r = rows.find((x) => x.source === source);
    const spendInr = spendOf.get(source) ?? 0;
    return build(source, r ?? null, spendInr);
  });

  const all = rows.length
    ? (
        (await db.execute(sql`
          select percentile_disc(0.5) within group (order by case when l.first_response_at is null then ${NEVER}
            else extract(epoch from l.first_response_at - l.created_at) end) as median_s
          from leads l
          where l.merged_into_id is null and l.created_at >= ${from} and l.created_at < ${to} ${project}
        `)) as unknown as { median_s: number }[]
      )[0]
    : null;

  const sum = (k: "leads" | "visitsBooked" | "visited" | "noShow" | "spendInr") =>
    bySource.reduce((a, r) => a + r[k], 0);
  const leads = sum("leads");
  const judged = rows.reduce((a, r) => a + r.judged, 0);
  const unreachedCount = rows.reduce((a, r) => a + ((r.unreached ?? 0) / 100) * r.judged, 0);
  const within5Count = rows.reduce((a, r) => a + (r.within_5 / 100) * r.leads, 0);
  const totals: Totals = {
    leads,
    medianResponseSeconds: all && Number(all.median_s) < NEVER ? Number(all.median_s) : null,
    within5MinPct: leads ? round1((100 * within5Count) / leads) : 0,
    notReached48hPct: judged ? round1((100 * unreachedCount) / judged) : null,
    visitsBooked: sum("visitsBooked"),
    visited: sum("visited"),
    noShow: sum("noShow"),
    showUpPct:
      sum("visited") + sum("noShow")
        ? round1((100 * sum("visited")) / (sum("visited") + sum("noShow")))
        : null,
    leadToVisitPct: leads ? round1((100 * sum("visitsBooked")) / leads) : 0,
    spendInr: sum("spendInr"),
    costPerVisitInr: sum("visited") ? Math.round(sum("spendInr") / sum("visited")) : null,
  };
  return { bySource, totals };
}

function build(
  source: SourceKey,
  r: {
    leads: number;
    median_s: number;
    within_5: number;
    unreached: number | null;
    booked: number;
    visited: number;
    no_show: number;
  } | null,
  spendInr: number,
): SourceRow {
  if (!r) {
    return {
      source,
      leads: 0,
      medianResponseSeconds: null,
      within5MinPct: 0,
      notReached48hPct: null,
      visitsBooked: 0,
      visited: 0,
      noShow: 0,
      showUpPct: null,
      leadToVisitPct: 0,
      spendInr,
      costPerVisitInr: null,
    };
  }
  return {
    source,
    leads: r.leads,
    medianResponseSeconds: Number(r.median_s) < NEVER ? Math.round(Number(r.median_s)) : null,
    within5MinPct: r.within_5,
    notReached48hPct: r.unreached,
    visitsBooked: r.booked,
    visited: r.visited,
    noShow: r.no_show,
    showUpPct: r.visited + r.no_show ? round1((100 * r.visited) / (r.visited + r.no_show)) : null,
    leadToVisitPct: round1((100 * r.booked) / r.leads),
    spendInr,
    costPerVisitInr: r.visited ? Math.round(spendInr / r.visited) : null,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export type WeekPoint = {
  week: string;
  leads: number;
  within5MinPct: number;
  notReached48hPct: number | null;
};

/** Week by week (Monday start, IST) for the last `weeks` weeks: how fast leads were answered. */
export async function weeklyResponse(
  weeks: number,
  projectId: string | null,
): Promise<WeekPoint[]> {
  const project = projectId ? sql`and l.project_id = ${projectId}` : sql``;
  const rows = (await db.execute(sql`
    select to_char(date_trunc('week', l.created_at at time zone 'Asia/Kolkata'), 'YYYY-MM-DD') as week,
      count(*)::int as leads,
      round(100.0 * avg((l.first_response_at is not null and l.first_response_at - l.created_at <= interval '5 minutes')::int), 1)::float as within_5,
      round(100.0 * avg(case when l.created_at < now() - interval '48 hours'
        then (l.first_response_at is null or l.first_response_at - l.created_at > interval '48 hours')::int end), 1)::float as unreached
    from leads l
    where l.merged_into_id is null
      and l.created_at >= date_trunc('week', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' - make_interval(weeks => ${weeks - 1})
      ${project}
    group by 1 order by 1
  `)) as unknown as { week: string; leads: number; within_5: number; unreached: number | null }[];
  return rows.map((r) => ({
    week: r.week,
    leads: r.leads,
    within5MinPct: r.within_5,
    notReached48hPct: r.unreached,
  }));
}
