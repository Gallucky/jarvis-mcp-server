// Minimal terminal chat client that lets Gemini call jarvis's REST facade
// (src/routes/api/*) via function calling. This exists because gemini.google.com's
// native "Connected Apps" MCP support requires a Google AI Pro/Ultra
// subscription (Gemini Spark) -- this script uses the free Gemini API instead,
// holding the REST token in your own environment rather than in any Google UI.
//
// Setup:
//   1. Get a free API key: https://aistudio.google.com/apikey
//   2. npm run mint-token -- gemini never   (see src/scripts/mintApiToken.ts)
//   3. Add to .env: GEMINI_API_KEY=..., JARVIS_GEMINI_API_TOKEN=<the minted token>
//   4. npm run gemini-chat
//
// The GoogleGenAI SDK's Interactions API types aren't available while this
// file is authored (see the "Verify" step in project history), so several
// values below are intentionally typed loosely (`any`) rather than guessed --
// tighten these once `npm install` has actually pulled in @google/genai locally.
import "dotenv/config";
import { createInterface } from "readline/promises";
import { GoogleGenAI } from "@google/genai";
import { buildFunctionDeclarations, executeTool } from "../../services/geminiTools.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`ERROR: ${name} is required. See .env.example.`);
    process.exit(1);
  }
  return value;
}

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";

async function main(): Promise<void> {
  const apiKey = requireEnv("GEMINI_API_KEY");
  const apiToken = requireEnv("JARVIS_GEMINI_API_TOKEN");
  const publicBaseUrl = requireEnv("PUBLIC_BASE_URL").replace(/\/$/, "");
  const apiBaseUrl = `${publicBaseUrl}/api`;

  const client = new GoogleGenAI({ apiKey });
  const tools = buildFunctionDeclarations();

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`Connected to ${apiBaseUrl}. Type a message, or "exit" to quit.\n`);

  let previousInteractionId: string | undefined;

  while (true) {
    const line = await rl.question("> ");
    if (line.trim().toLowerCase() === "exit") break;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let interaction: any = await client.interactions.create({
      model: GEMINI_MODEL,
      input: line,
      tools,
      previous_interaction_id: previousInteractionId,
    });

    // A turn can involve several rounds of tool calls before the model
    // produces final text -- keep resolving function_call steps until none remain.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pendingCalls = interaction.steps.filter((s: any) => s.type === "function_call");
    while (pendingCalls.length > 0) {
      const results = await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pendingCalls.map(async (call: any) => {
          console.log(`  [calling ${call.name}(${JSON.stringify(call.arguments)})]`);
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
        model: GEMINI_MODEL,
        input: results,
        tools,
        previous_interaction_id: interaction.id,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pendingCalls = interaction.steps.filter((s: any) => s.type === "function_call");
    }

    console.log(`\n${interaction.output_text}\n`);
    previousInteractionId = interaction.id;
  }

  rl.close();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
