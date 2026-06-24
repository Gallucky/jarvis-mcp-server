import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ObsidianClient } from "../services/obsidianClient.js";
import { describeObsidianError } from "../services/obsidianClient.js";
import { VAULT_MEMORY_NOTE_PATHS } from "../constants.js";
import {
  readMemoryIndex,
  readMemoryFile,
  listMemoryFiles,
  writeMemoryFile,
  upsertIndexLine,
} from "../services/memoryStore.js";
import {
  VaultSnapshotInputSchema,
  type VaultSnapshotInput,
  MemoryDiffInputSchema,
  type MemoryDiffInput,
  MemorySyncInputSchema,
  type MemorySyncInput,
} from "../schemas/vaultMemorySync.js";

/**
 * These tools fetch and persist raw text only -- deciding what changed and
 * what's worth keeping is left to the calling model (you), not baked into
 * deterministic extraction logic here.
 */
export function registerVaultMemorySyncTools(server: McpServer, obsidian: ObsidianClient): void {
  server.registerTool(
    "vault_memory_get_snapshot",
    {
      title: "Get Vault Snapshot",
      description: `Reads your "about me" vault notes (ME.md and Claude.Reports.md by
default) and returns their raw content, so you can see what the vault currently
says about you.

Args:
  - notePaths (string[], optional): vault-relative paths to read instead of the defaults

Returns:
  The raw Markdown of each requested note, under its path as a heading.`,
      inputSchema: VaultSnapshotInputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: VaultSnapshotInput) => {
      try {
        const text = await readVaultNotes(obsidian, params.notePaths);
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: describeObsidianError(error) }] };
      }
    }
  );

  server.registerTool(
    "vault_memory_diff",
    {
      title: "Diff Vault vs Memory",
      description: `Fetches the vault "about me" notes and the current local memory
files side by side, raw, with no automated comparison logic -- you read both
and judge what's missing, stale, or contradictory.

Args:
  - vaultNotePaths (string[], optional): defaults to ME.md and Claude.Reports.md
  - memoryFileNames (string[], optional): memory slugs without ".md"; defaults to all

Returns:
  A "Vault" section, the MEMORY.md index, and a "Memory files" section.`,
      inputSchema: MemoryDiffInputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: MemoryDiffInput) => {
      try {
        const vaultText = await readVaultNotes(obsidian, params.vaultNotePaths);
        const memoryNames = params.memoryFileNames?.length ? params.memoryFileNames : listMemoryFiles();
        const memoryText = memoryNames
          .map((name) => `### ${name}.md\n\n${readMemoryFile(name) ?? "(not found)"}`)
          .join("\n\n");

        const text = [
          "## Vault",
          vaultText,
          "## Memory index (MEMORY.md)",
          readMemoryIndex() || "(empty)",
          "## Memory files",
          memoryText || "(none)",
        ].join("\n\n---\n\n");

        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: describeObsidianError(error) }] };
      }
    }
  );

  server.registerTool(
    "vault_memory_sync",
    {
      title: "Sync Fact Into Memory",
      description: `Writes (or overwrites) one memory file and updates its line in
MEMORY.md. This does NOT extract facts itself -- decide what changed by
comparing vault_memory_get_snapshot/vault_memory_diff output, then call this
once per memory file to create or update. No confirmation step.

Args:
  - name (string): kebab-case slug, becomes "<name>.md" in the memory folder
  - description (string): one-line summary for the file's frontmatter
  - type ("user"|"feedback"|"project"|"reference"): memory category
  - content (string): Markdown body for the memory file
  - indexLine (string): the line to add/replace in MEMORY.md, e.g.
    "- [Psychometric target](psychometric-target.md) — exam date and score goal"

Returns:
  Confirmation of the file written and the index line upserted.`,
      inputSchema: MemorySyncInputSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: MemorySyncInput) => {
      try {
        writeMemoryFile(params);
        upsertIndexLine(params.name, params.indexLine);
        return {
          content: [{ type: "text", text: `Synced memory file '${params.name}.md' and updated MEMORY.md.` }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

async function readVaultNotes(obsidian: ObsidianClient, notePaths?: string[]): Promise<string> {
  const paths = notePaths?.length ? notePaths : VAULT_MEMORY_NOTE_PATHS;
  const sections = await Promise.all(
    paths.map(async (path) => {
      const note = await obsidian.readNote(path);
      return `### ${path}\n\n${note?.content ?? "(not found)"}`;
    })
  );
  return sections.join("\n\n");
}
