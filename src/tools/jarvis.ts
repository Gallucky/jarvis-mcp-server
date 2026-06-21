import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ObsidianClient } from "../services/obsidianClient.js";
import { describeObsidianError } from "../services/obsidianClient.js";
import { DISTILLATION_FOLDER } from "../constants.js";
import {
  CreateDistillationInputSchema,
  type CreateDistillationInput,
} from "../schemas/jarvis.js";

/**
 * Tools that encode YOUR specific Jarvis conventions, not just generic
 * Obsidian CRUD. Add more here as your workflow grows -- this file is the
 * place for anything that should behave differently than a plain note.
 */
export function registerJarvisTools(server: McpServer, obsidian: ObsidianClient): void {
  server.registerTool(
    "jarvis_create_distillation",
    {
      title: "Save Distillation",
      description: `Saves a conversation distillation to the vault, following the same
'${DISTILLATION_FOLDER}/' convention used by your conversation-distiller skill.
The filename is auto-generated from the current date/time and your title, so
this works from any device without needing to know the exact path.

Args:
  - title (string): Short title for the distillation
  - content (string): The distilled Markdown content

Returns:
  Confirmation message with the generated file path.

Examples:
  - Use when: wrapping up a chat from your phone and want it saved to the same
    place your desktop distillations go, without manually typing the folder path`,
      inputSchema: CreateDistillationInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params: CreateDistillationInput) => {
      try {
        const stamp = formatTimestamp(new Date());
        const safeTitle = sanitizeFilename(params.title);
        const path = `${DISTILLATION_FOLDER}/${stamp} - ${safeTitle}.md`;

        await obsidian.writeNote(path, params.content);
        return {
          content: [{ type: "text", text: `Saved distillation to '${path}'.` }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: describeObsidianError(error) }],
        };
      }
    }
  );
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}${pad(d.getMinutes())}`;
}

function sanitizeFilename(title: string): string {
  // Obsidian/Windows-unsafe characters for filenames.
  return title.replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 100);
}
