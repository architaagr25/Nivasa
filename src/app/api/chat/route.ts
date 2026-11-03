import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  humanRequested,
  moveVisit,
  replyToBuyer,
  showSlots,
  tapToBook,
  tooManyMessages,
  type TurnContext,
} from "@/server/assistant/agent";
import {
  getConversation,
  history,
  leadForConversation,
  linkVerifiedBuyer,
  recentBuyerMessages,
  saveMessage,
  startConversation,
  toChatMessage,
} from "@/server/assistant/conversation";

const COOKIE = "nivasa_chat";

const body = z.object({
  locale: z.enum(["en", "hi", "gu"]),
  projectId: z.string().max(40).nullish(),
  message: z.string().trim().min(1).max(800).optional(),
  action: z
    .discriminatedUnion("type", [
      z.object({ type: z.literal("slots"), projectId: z.string().max(40) }),
      z.object({ type: z.literal("book"), slotId: z.uuid() }),
      z.object({ type: z.literal("human") }),
      z.object({ type: z.literal("reschedule"), slotId: z.uuid() }),
      z.object({
        type: z.literal("verified"),
        name: z.string().trim().min(2).max(80).optional(),
        consent: z.boolean(),
      }),
    ])
    .optional(),
});

export async function GET() {
  const conv = await getConversation((await cookies()).get(COOKIE)?.value);
  return NextResponse.json({
    messages: conv ? await history(conv.id) : [],
    language: conv?.language ?? null,
  });
}

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (!parsed.data.message && !parsed.data.action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { locale, projectId, message, action } = parsed.data;
  const jar = await cookies();

  let conv = await getConversation(jar.get(COOKIE)?.value);
  if (!conv) {
    conv = await startConversation({ language: locale, projectId: projectId ?? null });
    jar.set(COOKIE, conv.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const buyer = session?.user.role === "buyer" && session.user.phoneNumber ? session.user : null;

  if (action?.type === "verified") {
    if (!buyer) return NextResponse.json({ error: "Not verified" }, { status: 401 });
    await linkVerifiedBuyer({
      conversationId: conv.id,
      buyerUserId: buyer.id,
      phone: buyer.phoneNumber!,
      name: action.name ?? null,
      consent: action.consent,
    });
    return NextResponse.json({ messages: [] });
  }

  // Verified only if the signed-in buyer's number is the one on this conversation's lead.
  const lead = await leadForConversation(conv.id);
  const ctx: TurnContext = {
    conversationId: conv.id,
    language: conv.language,
    projectId: projectId ?? lead?.projectId ?? null,
    verifiedBuyer: Boolean(buyer && lead?.phone && lead.phone === buyer.phoneNumber),
  };
  if (!message) ctx.language = locale;

  if (message) {
    const [lastMinute, lastHour] = await Promise.all([
      recentBuyerMessages(conv.id, 1),
      recentBuyerMessages(conv.id, 60),
    ]);
    if (lastMinute >= 8 || lastHour >= 60) {
      const m = await saveMessage({
        conversationId: conv.id,
        role: "system",
        text: tooManyMessages(ctx.language),
      });
      return NextResponse.json({ messages: [toChatMessage(m)] }, { status: 429 });
    }
    return NextResponse.json(await replyToBuyer(ctx, message));
  }

  switch (action!.type) {
    case "slots":
      return NextResponse.json(await showSlots(ctx, action!.projectId));
    case "book":
      return NextResponse.json(await tapToBook(ctx, action!.slotId));
    case "reschedule":
      return NextResponse.json(await moveVisit(ctx, action!.slotId));
    case "human":
      return NextResponse.json(await humanRequested(ctx, "Buyer tapped 'Talk to a person'"));
  }
}
