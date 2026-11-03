"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const BLUE = "var(--chart-1)";
const OCHRE = "var(--chart-2)";
const GRID = "var(--chart-grid)";
const AXIS = "var(--chart-axis)";
const tick = { fill: AXIS, fontSize: 12 };

type Week = {
  week: string;
  label: string;
  within5MinPct: number;
  notReached48hPct: number | null;
  leads: number;
};

function WeekTooltip({ active, payload }: { active?: boolean; payload?: { payload: Week }[] }) {
  if (!active || !payload?.length) return null;
  const w = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-sm">
      <p className="font-medium">Week of {w.label}</p>
      <p className="text-muted-foreground">{w.leads.toLocaleString("en-IN")} leads</p>
      <p className="mt-1 flex items-center gap-1.5">
        <span className="size-2 rounded-full" style={{ background: BLUE }} aria-hidden />
        Answered within 5 min: <span className="tabular font-medium">{w.within5MinPct}%</span>
      </p>
      <p className="flex items-center gap-1.5">
        <span className="size-2 rounded-full" style={{ background: OCHRE }} aria-hidden />
        Not reached in 48 h:{" "}
        <span className="tabular font-medium">
          {w.notReached48hPct === null ? "too early to tell" : `${w.notReached48hPct}%`}
        </span>
      </p>
    </div>
  );
}

/** Two shares of the same leads, on one 0-100% axis: how fast each week's leads were answered. */
export function WeeklyResponseChart({ weeks }: { weeks: Week[] }) {
  const last = weeks.at(-1);
  return (
    <div>
      <ul
        className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"
        aria-label="Legend"
      >
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: BLUE }} aria-hidden /> Answered
          within 5 minutes
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: OCHRE }} aria-hidden /> Not
          reached in 48 hours
        </li>
      </ul>
      <div
        className="h-64"
        role="img"
        aria-label={`Weekly response. Latest week: ${last?.within5MinPct}% answered within 5 minutes.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={weeks} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="label"
              tick={tick}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={tick}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              content={<WeekTooltip />}
              cursor={{ stroke: AXIS, strokeWidth: 1, strokeDasharray: "3 3" }}
            />
            <Line
              type="monotone"
              dataKey="within5MinPct"
              name="Answered within 5 minutes"
              stroke={BLUE}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="notReached48hPct"
              name="Not reached in 48 hours"
              stroke={OCHRE}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type Cost = { label: string; costPerVisitInr: number | null; visited: number };

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** One measure across four sources: spend per completed site visit. */
export function CostPerVisitChart({ rows }: { rows: Cost[] }) {
  const data = rows.filter((r) => r.costPerVisitInr !== null);
  if (!data.length)
    return <p className="text-sm text-muted-foreground">No completed visits in this period yet.</p>;
  return (
    <div className="h-56" role="img" aria-label="Cost per completed visit by source">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 72, bottom: 0, left: 0 }}
          barCategoryGap={10}
        >
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            tick={tick}
            tickLine={false}
            axisLine={false}
            width={124}
          />
          <Tooltip
            cursor={{ fill: "var(--secondary)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-sm">
                  <p className="font-medium">{(payload[0].payload as Cost).label}</p>
                  <p>
                    {inr((payload[0].payload as Cost).costPerVisitInr!)} per completed visit ·{" "}
                    {(payload[0].payload as Cost).visited} visits
                  </p>
                </div>
              ) : null
            }
          />
          <Bar
            dataKey="costPerVisitInr"
            fill={BLUE}
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="costPerVisitInr"
              position="right"
              formatter={(v) => inr(Number(v))}
              style={{ fill: "var(--foreground)", fontSize: 12 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
