import { formatClock, formatVisitTime, mapsLink, type Lang } from "@/lib/format";

type VisitContext = {
  lang: Lang;
  projectName: string;
  reraNumber: string;
  startsAt: Date;
  latitude: string;
  longitude: string;
  executiveName: string;
};

// Every buyer-facing message about a project carries its RERA number, and none of them
// says anything about the project beyond what is registered.
const footer = (c: VisitContext) =>
  ({
    en: `RERA ${c.reraNumber}. Reply STOP to opt out.`,
    hi: `RERA ${c.reraNumber}. संदेश बंद करने के लिए STOP लिखें।`,
    gu: `RERA ${c.reraNumber}. સંદેશા બંધ કરવા STOP લખો.`,
  })[c.lang];

export function visitConfirmation(c: VisitContext): string {
  const when = formatVisitTime(c.startsAt, c.lang);
  const map = mapsLink(c.latitude, c.longitude);
  const body = {
    en: `Your site visit to ${c.projectName} is booked for ${when}. ${c.executiveName} will meet you at the site office. Location: ${map}`,
    hi: `${c.projectName} की आपकी साइट विज़िट ${when} के लिए बुक हो गई है। ${c.executiveName} साइट ऑफ़िस पर आपसे मिलेंगे। लोकेशन: ${map}`,
    gu: `${c.projectName} ની તમારી સાઇટ વિઝિટ ${when} માટે બુક થઈ ગઈ છે. ${c.executiveName} સાઇટ ઓફિસ પર તમને મળશે. લોકેશન: ${map}`,
  }[c.lang];
  return `${body} ${footer(c)}`;
}

export function visitReminder(c: VisitContext, kind: "day_before" | "two_hours_before"): string {
  const at = formatClock(c.startsAt, c.lang);
  const map = mapsLink(c.latitude, c.longitude);
  const body = {
    en:
      kind === "day_before"
        ? `Reminder: your visit to ${c.projectName} is tomorrow at ${at}. Location: ${map}`
        : `Reminder: your visit to ${c.projectName} is in two hours, at ${at}. Location: ${map}`,
    hi:
      kind === "day_before"
        ? `रिमाइंडर: ${c.projectName} की आपकी विज़िट कल ${at} बजे है। लोकेशन: ${map}`
        : `रिमाइंडर: ${c.projectName} की आपकी विज़िट दो घंटे बाद, ${at} बजे है। लोकेशन: ${map}`,
    gu:
      kind === "day_before"
        ? `રિમાઇન્ડર: ${c.projectName} ની તમારી વિઝિટ આવતીકાલે ${at} વાગ્યે છે. લોકેશન: ${map}`
        : `રિમાઇન્ડર: ${c.projectName} ની તમારી વિઝિટ બે કલાક પછી, ${at} વાગ્યે છે. લોકેશન: ${map}`,
  }[c.lang];
  return `${body} ${footer(c)}`;
}

export function visitCancelled(c: VisitContext): string {
  const when = formatVisitTime(c.startsAt, c.lang);
  const body = {
    en: `Your site visit to ${c.projectName} on ${when} has been cancelled. You can book another time whenever you like.`,
    hi: `${c.projectName} की ${when} की आपकी साइट विज़िट रद्द कर दी गई है। आप जब चाहें दूसरा समय बुक कर सकते हैं।`,
    gu: `${c.projectName} ની ${when} ની તમારી સાઇટ વિઝિટ રદ કરવામાં આવી છે. તમે ઇચ્છો ત્યારે બીજો સમય બુક કરી શકો છો.`,
  }[c.lang];
  return `${body} ${footer(c)}`;
}

export function executiveVisitAlert(c: VisitContext & { leadCode: string; buyerName: string }) {
  return `New site visit: ${c.buyerName} (${c.leadCode}) at ${c.projectName}, ${formatVisitTime(c.startsAt)}.`;
}

/**
 * The opt-in first reply sent the moment a lead arrives with consent. It names the project and its
 * RERA registration, offers the assistant and a site visit, and says how to stop messages.
 */
export function firstResponse(c: {
  lang: Lang;
  name: string | null;
  projectName: string | null;
  reraNumber: string | null;
  link: string;
}) {
  const project = c.projectName
    ? `${c.projectName}${c.reraNumber ? ` (RERA ${c.reraNumber})` : ""}`
    : null;
  return {
    en: `Hello${c.name ? ` ${c.name}` : ""}, thank you for your interest in ${project ?? "homes by Company A"}. Ask us anything at any hour, or book a site visit in a free slot: ${c.link}. Reply STOP to stop messages.`,
    hi: `नमस्ते${c.name ? ` ${c.name}` : ""}, ${project ?? "Company A के घरों"} में रुचि दिखाने के लिए धन्यवाद। किसी भी समय कुछ भी पूछें या खाली स्लॉट में साइट विज़िट बुक करें: ${c.link}. संदेश बंद करने के लिए STOP लिखें।`,
    gu: `નમસ્તે${c.name ? ` ${c.name}` : ""}, ${project ?? "Company A ના ઘરો"} માં રસ દાખવવા બદલ આભાર. ગમે ત્યારે કંઈ પણ પૂછો અથવા ખાલી સ્લોટમાં સાઇટ વિઝિટ બુક કરો: ${c.link}. સંદેશા બંધ કરવા STOP લખો.`,
  }[c.lang];
}
