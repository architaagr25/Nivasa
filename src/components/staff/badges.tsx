import { Building2, Globe, Megaphone, PhoneCall, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SOURCE_LABEL, STATUS_LABEL } from "@/server/staff/labels";

const SOURCE_ICON: Record<keyof typeof SOURCE_LABEL, LucideIcon> = {
  property_portal: Building2,
  social_ad: Megaphone,
  website: Globe,
  hoarding_call: PhoneCall,
};

export function SourceBadge({
  source,
  compact,
}: {
  source: keyof typeof SOURCE_LABEL;
  compact?: boolean;
}) {
  const Icon = SOURCE_ICON[source];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
      title={SOURCE_LABEL[source]}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className={cn(compact && "sr-only")}>{SOURCE_LABEL[source]}</span>
    </span>
  );
}

const STATUS_TONE: Record<keyof typeof STATUS_LABEL, string> = {
  new: "bg-ochre-soft text-foreground",
  contacted: "bg-secondary text-foreground",
  engaged: "bg-secondary text-foreground",
  visit_booked: "bg-sage-soft text-accent-foreground",
  visited: "bg-sage text-white",
  no_show: "bg-clay-soft text-destructive",
  handed_off: "bg-primary text-primary-foreground",
  closed_lost: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: keyof typeof STATUS_LABEL }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs whitespace-nowrap",
        STATUS_TONE[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ScoreDot({ score }: { score: "hot" | "warm" | "cold" | null }) {
  if (!score) return <span className="text-xs text-muted-foreground">—</span>;
  const tone = { hot: "bg-clay", warm: "bg-ochre", cold: "bg-border" }[score];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs capitalize">
      <span className={cn("size-2 rounded-full", tone)} aria-hidden />
      {score}
    </span>
  );
}
