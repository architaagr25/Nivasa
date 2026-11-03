// Plain labels shared by staff pages and components (safe to import from the browser).

export const SOURCE_LABEL = {
  property_portal: "Property portal",
  social_ad: "Social media ad",
  website: "Website",
  hoarding_call: "Hoarding call",
} as const;

export const STATUS_LABEL = {
  new: "New",
  contacted: "Contacted",
  engaged: "In conversation",
  visit_booked: "Visit booked",
  visited: "Visited",
  no_show: "Missed visit",
  handed_off: "With a person",
  closed_lost: "Closed",
} as const;

export const FLAG_LABEL = {
  missing_fact: "fact not on the sheet",
  price_or_discount: "asked about price or discount",
  guardrail_blocked: "reply withheld by the checks",
  human_requested: "asked for a person",
  ai_unavailable: "assistant unavailable",
  prompt_injection: "tried to override the assistant",
} as const;
