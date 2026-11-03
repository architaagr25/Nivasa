import "server-only";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

function modelChain() {
  return [process.env.AI_MODEL!, process.env.AI_FALLBACK_MODEL!].filter(Boolean);
}

/**
 * Runs the primary model and falls back to the second one if it is rate-limited, down or slow.
 * Returns null when every model failed, so callers decide what the person sees instead.
 */
export async function generate(args: Omit<Parameters<typeof generateText>[0], "model">) {
  for (const id of modelChain()) {
    const started = Date.now();
    try {
      const result = await generateText({
        ...args,
        model: google(id),
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(25_000),
      } as Parameters<typeof generateText>[0]);
      return { result, model: id, latencyMs: Date.now() - started };
    } catch (err) {
      console.warn(`Model ${id} failed, trying the next one`, (err as Error).message);
    }
  }
  return null;
}
