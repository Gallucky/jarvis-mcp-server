import { GoogleGenAI } from "@google/genai";
import { buildFunctionDeclarations, executeTool } from "./geminiTools.js";

/**
 * Server-side counterpart to src/scripts/gemini/chat.ts, for the
 * /dashboard/gemini page -- lets you talk to your vault from Gemini on your
 * phone (over Tailscale) without needing Gemini Spark / a Pro-Ultra
 * subscription, since the actual Gemini API call happens here on the mini PC,
 * not in gemini.google.com's UI.
 *
 * previousInteractionId is kept per browser session (see the sessionId the
 * page generates) so "New chat" on the page actually starts a fresh
 * conversation instead of dragging in old context.
 */

// Text/agentic models worth switching between when one hits its quota --
// see the "Model" dropdown on /dashboard/gemini. Kept to a short curated
// list (not every model ai.google.dev lists) since only these make sense
// for a text+function-calling chat: https://ai.google.dev/gemini-api/docs/models
export const AVAILABLE_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
] as const;

const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
const sessions = new Map<string, string | undefined>();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set -- add it to .env (see .env.example).`);
  return value;
}

export function resetSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export async function sendMessage(sessionId: string, message: string, model = DEFAULT_MODEL): Promise<string> {
  const apiKey = requireEnv("GEMINI_API_KEY");
  const apiToken = requireEnv("JARVIS_GEMINI_API_TOKEN");
  const port = process.env.PORT ?? "3701";
  const apiBaseUrl = `http://127.0.0.1:${port}/api`;

  const client = new GoogleGenAI({ apiKey });
  const tools = buildFunctionDeclarations();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let interaction: any = await client.interactions.create({
    model,
    input: message,
    tools,
    previous_interaction_id: sessions.get(sessionId),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pendingCalls = interaction.steps.filter((s: any) => s.type === "function_call");
  while (pendingCalls.length > 0) {
    const results = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pendingCalls.map(async (call: any) => {
        const output = await executeTool(call.name, call.arguments ?? {}, apiBaseUrl, apiToken);
        return {
          type: "function_result",
          name: call.name,
          call_id: call.id,
          result: [{ type: "text", text: JSON.stringify(output) }],
        };
      })
    );

    interaction = await client.interactions.create({
      model,
      input: results,
      tools,
      previous_interaction_id: interaction.id,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pendingCalls = interaction.steps.filter((s: any) => s.type === "function_call");
  }

  sessions.set(sessionId, interaction.id);
  return interaction.output_text ?? "(no response)";
}
