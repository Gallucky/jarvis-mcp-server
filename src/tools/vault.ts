import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ObsidianClient } from "../services/obsidianClient.js";
import { describeObsidianError } from "../services/obsidianClient.js";
import { CHARACTER_LIMIT } from "../constants.js";
import {
  ReadNoteInputSchema,
  type ReadNoteInput,
  CreateNoteInputSchema,
  type CreateNoteInput,
  AppendNoteInputSchema,
  type AppendNoteInput,
  ListNotesInputSchema,
  type ListNotesInput,
  SearchVaultInputSchema,
  type SearchVaultInput,
} from "../schemas/vault.js";

export function registerVaultTools(server: McpServer, obsidian: ObsidianClient): void {
  server.registerTool(
    "jarvis_read_note",
    {
      title: "Read Vault Note",
      description: `Reads the full content of a note from the Obsidian vault on the mini PC.

Args:
  - path (string): Vault-relative path, e.g. "Projects/Jarvis/spec.md"

Returns:
  The note's Markdown content as text. Returns a clear "not found" message
  if no file exists at that path.

Examples:
  - Use when: "What does my Jarvis spec say about Phase 3?" -> read the note, then answer from its content
  - Don't use when: you need to search across many notes (use jarvis_search_vault instead)`,
      inputSchema: ReadNoteInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params: ReadNoteInput) => {
      try {
        const note = await obsidian.readNote(params.path);
        if (!note) {
          return {
            content: [{ type: "text", text: `No note found at '${params.path}'.` }],
          };
        }
        let text = note.content;
        if (text.length > CHARACTER_LIMIT) {
          text =
            text.slice(0, CHARACTER_LIMIT) +
            `\n\n[Truncated: note is ${note.content.length} characters, showing first ${CHARACTER_LIMIT}.]`;
        }
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: describeObsidianError(error) }],
        };
      }
    }
  );

  server.registerTool(
    "jarvis_create_note",
    {
      title: "Create Vault Note",
      description: `Creates a new Markdown note in the Obsidian vault on the mini PC.

This writes through Obsidian's own API (not the raw filesystem), so LiveSync
registers and syncs the new file correctly to all your other devices.

Args:
  - path (string): Vault-relative path for the new note, e.g. "Inbox/Idea.md"
  - content (string): Full Markdown content for the note
  - overwrite (boolean): If false (default), fails when a note already exists
    at this path rather than silently replacing it

Returns:
  Confirmation message with the created path.

Error Handling:
  - Returns "Error: A note already exists..." if overwrite=false and the path is taken
  - Returns a connection error message if Obsidian isn't running on the mini PC

Examples:
  - Use when: "Create a note in my Inbox called 'Call mom'" -> path="Inbox/Call mom.md"
  - Don't use when: appending to an existing note (use jarvis_append_note instead)`,
      inputSchema: CreateNoteInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params: CreateNoteInput) => {
      try {
        if (!params.overwrite) {
          const exists = await obsidian.noteExists(params.path);
          if (exists) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Error: A note already exists at '${params.path}'. Pass overwrite=true to replace it, or use jarvis_append_note to add to it instead.`,
                },
              ],
            };
          }
        }
        await obsidian.writeNote(params.path, params.content);
        return {
          content: [{ type: "text", text: `Created note at '${params.path}'.` }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: describeObsidianError(error) }],
        };
      }
    }
  );

  server.registerTool(
    "jarvis_append_note",
    {
      title: "Append to Vault Note",
      description: `Appends content to the end of an existing note. Creates the note if it
doesn't already exist.

Args:
  - path (string): Vault-relative path to the note
  - content (string): Content to append

Returns:
  Confirmation message.

Examples:
  - Use when: "Add a line to my daily log" -> appends to the existing file
  - Don't use when: replacing a note's entire content (use jarvis_create_note with overwrite=true)`,
      inputSchema: AppendNoteInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params: AppendNoteInput) => {
      try {
        await obsidian.appendNote(params.path, `\n${params.content}`);
        return {
          content: [{ type: "text", text: `Appended to '${params.path}'.` }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: describeObsidianError(error) }],
        };
      }
    }
  );

  server.registerTool(
    "jarvis_list_notes",
    {
      title: "List Vault Folder",
      description: `Lists files and subfolders directly inside a vault folder (not recursive).

Args:
  - folder (string): Vault-relative folder path, e.g. "Projects/Jarvis".
    Empty string (default) lists the vault root.

Returns:
  A list of entries; folder entries end with "/".

Examples:
  - Use when: "What's in my Inbox folder?" -> folder="Inbox"
  - Don't use when: searching note contents (use jarvis_search_vault instead)`,
      inputSchema: ListNotesInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params: ListNotesInput) => {
      try {
        const files = await obsidian.listFolder(params.folder);
        if (files.length === 0) {
          return {
            content: [
              { type: "text", text: `'${params.folder || "/"}' is empty or doesn't exist.` },
            ],
          };
        }
        const output = { folder: params.folder || "/", count: files.length, entries: files };
        return {
          content: [
            {
              type: "text",
              text: `${output.folder} (${output.count} entries):\n` +
                files.map((f) => `- ${f}`).join("\n"),
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: describeObsidianError(error) }],
        };
      }
    }
  );

  server.registerTool(
    "jarvis_search_vault",
    {
      title: "Search Vault",
      description: `Full-text search across all notes in the vault using Obsidian's built-in search.

Args:
  - query (string): Search text
  - limit (number): Maximum results to return, 1-100 (default 20)

Returns:
  Matching filenames with relevance scores and short context snippets.

Examples:
  - Use when: "Find my notes about CouchDB" -> query="CouchDB"
  - Don't use when: you already know the exact path (use jarvis_read_note instead)`,
      inputSchema: SearchVaultInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params: SearchVaultInput) => {
      try {
        const results = await obsidian.searchSimple(params.query, params.limit);
        if (results.length === 0) {
          return {
            content: [{ type: "text", text: `No notes found matching '${params.query}'.` }],
          };
        }
        const lines = [`Found ${results.length} result(s) for '${params.query}':`, ""];
        for (const r of results) {
          lines.push(`## ${r.filename} (score: ${r.score.toFixed(2)})`);
          for (const m of r.matches ?? []) {
            lines.push(`  ...${m.context}...`);
          }
          lines.push("");
        }
        let text = lines.join("\n");
        if (text.length > CHARACTER_LIMIT) {
          text = text.slice(0, CHARACTER_LIMIT) + "\n\n[Truncated — narrow your query for full results.]";
        }
        return {
          content: [{ type: "text", text }],
          structuredContent: { query: params.query, count: results.length, results },
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
