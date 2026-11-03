import { parsePriceInr } from "@/server/projects/present";

export type FactRef = { code: string; label: string; value: string };

/** Devanagari (०-९) and Gujarati (૦-૯) digits read as 0-9, so "₹૭૪ લાખ" can't slip past a check. */
export function asciiDigits(text: string) {
  return text.replace(/[०-९૦-૯]/g, (d) =>
    String(d.charCodeAt(0) - (d.charCodeAt(0) >= 0x0ae6 ? 0x0ae6 : 0x0966)),
  );
}

/** Pulls the [[P1-POS]] citation markers out of a reply. Unknown codes are dropped. */
export function extractCitations(text: string, facts: FactRef[]) {
  const known = new Map(facts.map((f) => [f.code, f]));
  const codes = [...text.matchAll(/\[\[([A-Z0-9-]+)\]\]/g)].map((m) => m[1]);
  const cited = [...new Set(codes)].filter((c) => known.has(c)).map((c) => known.get(c)!);
  const clean = text
    .replace(/\s*\[\[[A-Z0-9-]+\]\]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  return { text: clean, cited };
}

const AMOUNT =
  /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(lakh|lac|lakhs|crore|cr|लाख|करोड़|લાખ|કરોડ)?|([\d,]+(?:\.\d+)?)\s*(lakh|lac|lakhs|crore|cr|लाख|करोड़|લાખ|કરોડ)/gi;

/** Every money amount in a piece of text, in rupees. "₹78 lakh" -> 7800000. */
export function moneyAmounts(text: string): number[] {
  const out: number[] = [];
  for (const m of asciiDigits(text).matchAll(AMOUNT)) {
    const n = Number((m[1] ?? m[3]).replace(/,/g, ""));
    const unit = (m[2] ?? m[4] ?? "").toLowerCase();
    if (!Number.isFinite(n)) continue;
    if (/crore|cr|करोड़|કરોડ/.test(unit)) out.push(Math.round(n * 10_000_000));
    else if (/lakh|lac|लाख|લાખ/.test(unit)) out.push(Math.round(n * 100_000));
    else out.push(Math.round(n));
  }
  return out;
}

export type GuardResult =
  { ok: true } | { ok: false; reason: "unlisted_amount" | "percentage"; detail: string };

/**
 * The assistant may only repeat prices that are on the published fact sheet (the indicative
 * starting prices). Any other amount, or any percentage, means it is quoting or negotiating,
 * so the reply is withheld and a person takes over. The check is deliberately blunt: a false
 * alarm costs one handoff, a missed one could be a promise the client has to honour.
 */
export function checkReply(reply: string, facts: FactRef[]): GuardResult {
  const allowed = new Set(
    facts.flatMap((f) => [...moneyAmounts(f.value), parsePriceInr(f.value)]).filter(Boolean),
  );
  reply = asciiDigits(reply);
  for (const amount of moneyAmounts(reply)) {
    if (!allowed.has(amount)) {
      return {
        ok: false,
        reason: "unlisted_amount",
        detail: `Amount ₹${amount} is not on the fact sheet`,
      };
    }
  }
  if (/\d\s*%|\d\s*percent|प्रतिशत|ટકા/i.test(reply)) {
    return { ok: false, reason: "percentage", detail: "Reply mentions a percentage" };
  }
  return { ok: true };
}

// Month names as buyers and the model write them, mapped to 1-12.
const MONTHS: [RegExp, number][] = [
  [/\b(jan(uary)?)\b|जनवरी|જાન્યુઆરી/i, 1],
  [/\b(feb(ruary)?)\b|फ़रवरी|फरवरी|ફેબ્રુઆરી/i, 2],
  [/\b(mar(ch)?)\b|मार्च|માર્ચ/i, 3],
  [/\b(apr(il)?)\b|अप्रैल|એપ્રિલ/i, 4],
  [/\bmay\b(?=\s*\d{4})|मई|મે\s*\d{4}/i, 5],
  [/\b(jun(e)?)\b|जून|જૂન/i, 6],
  [/\b(jul(y)?)\b|जुलाई|જુલાઈ/i, 7],
  [/\b(aug(ust)?)\b|अगस्त|ઓગસ્ટ/i, 8],
  [/\b(sep(t(ember)?)?)\b|सितंबर|सितम्बर|સપ્ટેમ્બર/i, 9],
  [/\b(oct(ober)?)\b|अक्टूबर|ઓક્ટોબર/i, 10],
  [/\b(nov(ember)?)\b|नवंबर|नवम्बर|નવેમ્બર/i, 11],
  [/\b(dec(ember)?)\b|दिसंबर|दिसम्बर|ડિસેમ્બર/i, 12],
];

export function monthsIn(text: string) {
  return new Set(MONTHS.filter(([re]) => re.test(text)).map(([, m]) => m));
}

/**
 * Numbers that state a fact: areas, years, counts, decimals. Small numbers that name things
 * ("Project 2", "3 BHK", "1 of 3") are left out, as are digits inside fact codes.
 */
export function factNumbers(text: string) {
  const cleaned = asciiDigits(text)
    .replace(/\[\[[A-Z0-9-]+\]\]/g, "")
    .replace(/\b\d\s*BHK\b/gi, "")
    .replace(/(project|प्रोजेक्ट|પ્રોજેક્ટ)\s*\d+/gi, "");
  return [...cleaned.matchAll(/\d[\d,]*(?:\.\d+)?/g)]
    .map((m) => m[0].replace(/,/g, ""))
    .filter((n) => n.includes(".") || Number(n) >= 10);
}

/**
 * Catches a reply that cites a fact but gets it wrong, e.g. "possession December 2028"
 * for a project registered for June 2028. Every fact-like number must exist somewhere on the
 * fact sheet, and any month mentioned must be one the cited facts actually say.
 */
export function checkGrounding(
  reply: string,
  cited: FactRef[],
  all: FactRef[],
): GuardResult | { ok: false; reason: "ungrounded"; detail: string } {
  const sheetNumbers = new Set(all.flatMap((f) => factNumbers(`${f.label} ${f.value}`)));
  for (const n of factNumbers(reply)) {
    if (!sheetNumbers.has(n))
      return { ok: false, reason: "ungrounded", detail: `"${n}" is not on the fact sheet` };
  }
  // "Project 2 ... December 2028 [[P1-POS]]" cites a real fact about the wrong project.
  const named = new Set(
    [...reply.matchAll(/(?:project|प्रोजेक्ट|પ્રોજેક્ટ)\s*(\d+)/gi)].map((m) => m[1]),
  );
  const citedProjects = new Set(cited.map((f) => f.code.match(/^P(\d+)-/)?.[1]).filter(Boolean));
  if (cited.length) {
    for (const n of named) {
      if (!citedProjects.has(n)) {
        return {
          ok: false,
          reason: "ungrounded",
          detail: `Reply talks about Project ${n} but cites another project's facts`,
        };
      }
    }
  }
  const replyMonths = monthsIn(reply);
  if (replyMonths.size) {
    const source = cited.length ? cited : all;
    const allowed = new Set(source.flatMap((f) => [...monthsIn(f.value)]));
    for (const m of replyMonths) {
      if (!allowed.has(m))
        return {
          ok: false,
          reason: "ungrounded",
          detail: `Month ${m} does not match the cited facts`,
        };
    }
  }
  return { ok: true };
}

const INJECTION = [
  /ignore (all |any |your |the )?(previous|prior|above|earlier) (instructions|rules|prompts?)/i,
  /disregard (your|the|all) (rules|instructions)/i,
  /(you are|act as|pretend to be) (now )?(the |a )?(sales ?manager|developer|admin|system|owner)/i,
  /(reveal|show|print|repeat) (your|the) (system )?(prompt|instructions)/i,
  /system prompt/i,
  /jailbreak|developer mode|dan mode/i,
];

/** Attempts to talk the assistant out of its rules. They are answered politely and flagged. */
export function looksLikeInjection(text: string) {
  return INJECTION.some((re) => re.test(text));
}

const HUMAN = [
  /\b(talk|speak|chat) (to|with) (a |an |some)?(person|human|someone|agent|executive|sales)/i,
  /\b(call me|callback|call back|real person|human please|connect me)/i,
  /(किसी (व्यक्ति|इंसान)|इंसान से|व्यक्ति से|कॉल कर|फ़ोन कर|फोन कर)/,
  /(વ્યક્તિ સાથે|માણસ સાથે|ફોન કર|કોલ કર)/,
];

/** The buyer asked for a person. This never depends on the model noticing. */
export function wantsHuman(text: string) {
  return HUMAN.some((re) => re.test(text));
}

/** Which script the buyer is writing in, so the reply comes back in the same language. */
export function detectLanguage(text: string, fallback: "en" | "hi" | "gu"): "en" | "hi" | "gu" {
  if (/[઀-૿]/.test(text)) return "gu";
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  if (/[a-z]{3,}/i.test(text)) return fallback === "en" ? "en" : fallback;
  return fallback;
}
