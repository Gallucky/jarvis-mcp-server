import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { run, errorText, tokenise } from "./obsidianShared.js";

// ─── schemas ────────────────────────────────────────────────────────────────

const DefuddleSchema = z.object({
  url: z.string().url().describe("Web page URL to extract content from (not .md files)"),
  property: z
    .enum(["title", "description", "domain", "author", "date"])
    .optional()
    .describe("If set, return only this metadata property instead of full content"),
}).strict();

const ObsidianCliSchema = z.object({
  command: z
    .string()
    .describe(
      'Full obsidian CLI command and arguments as a single string, e.g. "read file=\\"My Note\\"" or "search query=\\"test\\" limit=10"'
    ),
}).strict();

const MarkdownValidateSchema = z.object({
  content: z.string().describe("Obsidian-flavored Markdown content to validate"),
}).strict();

// ─── shared logic — called by both the MCP tools below and the REST facade ──

export async function extractWebPage(url: string, property?: string): Promise<string> {
  const args = ["parse", url, "--md"];
  if (property) args.push("-p", property);
  return run("defuddle", args);
}

export function validateMarkdown(content: string): string[] {
  return validateObsidianMarkdown(content);
}

// ─── registration ────────────────────────────────────────────────────────────

export function registerObsidianSkillTools(server: McpServer): void {

  // 1. defuddle — web page → clean markdown
  server.registerTool(
    "obsidian_defuddle",
    {
      title: "Extract Web Page as Markdown",
      description: `Extracts clean Markdown from a web page using the Defuddle CLI.
Strips navigation, ads, and boilerplate, returning only the readable content.
Prefer over raw web-fetch for articles, documentation, and blog posts.
Do NOT use for URLs that already end in .md — read those directly.

Requires: npm install -g defuddle

Args:
  - url (string): Web page URL to extract
  - property (optional): Return only one metadata field — "title", "description",
    "domain", "author", or "date" — instead of the full markdown body

Returns:
  Clean Markdown content, or the requested metadata property value.

Examples:
  - Use when: user pastes a URL and wants to read or analyse an article
  - Use when: fetching online docs to summarise or quote from
  - Don't use when: the URL ends in .md (fetch it directly instead)`,
      inputSchema: DefuddleSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const output = await extractWebPage(params.url, params.property);
        return { content: [{ type: "text", text: output }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: errorText(error) }] };
      }
    }
  );

  // 2. obsidian-cli — interact with running Obsidian instance
  server.registerTool(
    "obsidian_cli",
    {
      title: "Obsidian CLI",
      description: `Runs an obsidian CLI command against the local running Obsidian instance.
Requires Obsidian to be open. Targets the most-recently-focused vault by default;
prefix with vault="Name" to target a specific one.

Requires: obsidian CLI installed and Obsidian open.

Args:
  - command (string): Full CLI sub-command and parameters as a single string.
    Parameters use key=value syntax; quote values with spaces.
    Flags are bare keywords (e.g. "silent", "overwrite").

Common commands:
  read file="Note Name"
  create name="New Note" content="# Hello" silent
  append file="Note Name" content="New line"
  search query="term" limit=10
  daily:read
  daily:append content="- [ ] Task"
  property:set name="status" value="done" file="Note Name"
  tasks daily todo
  tags sort=count counts
  backlinks file="Note Name"
  plugin:reload id=my-plugin
  dev:errors
  dev:screenshot path=screenshot.png
  eval code="app.vault.getFiles().length"

Returns:
  The CLI's stdout output.

Examples:
  - Use when: "Read my Daily Note" -> command="daily:read"
  - Use when: "Reload my plugin after code change" -> command="plugin:reload id=my-plugin"
  - Don't use when: simple vault CRUD — prefer the jarvis_* vault tools for those`,
      inputSchema: ObsidianCliSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        // Split the command string into argv while respecting quoted strings
        const argv = tokenise(params.command);
        const output = await run("obsidian", argv);
        return { content: [{ type: "text", text: output || "(no output)" }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: errorText(error) }] };
      }
    }
  );

  // 3. obsidian-markdown — validate Obsidian-flavored Markdown
  server.registerTool(
    "obsidian_validate_markdown",
    {
      title: "Validate Obsidian Markdown",
      description: `Validates Obsidian-flavored Markdown content for common authoring mistakes.

Checks for:
  - Unclosed or malformed wikilinks ([[...]])
  - Unclosed Obsidian comments (%%...%%)
  - Malformed callout syntax (> [!type])
  - Invalid frontmatter YAML (must be the very first block, fenced by ---)
  - Unclosed code fences (\`\`\`)

Args:
  - content (string): Full Markdown text to validate

Returns:
  "Valid Obsidian Markdown." when no issues are found, or a list of detected
  problems with line references.

Examples:
  - Use when: you've just generated or edited a .md file and want to verify it
    before writing it to the vault
  - Don't use when: the content is a .canvas or .base file (use the dedicated tools)`,
      inputSchema: MarkdownValidateSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const issues = validateMarkdown(params.content);
      const text =
        issues.length === 0
          ? "Valid Obsidian Markdown."
          : `Found ${issues.length} issue(s):\n` + issues.map((i) => `- ${i}`).join("\n");
      return { content: [{ type: "text", text }] };
    }
  );
}

// ─── validation helpers ──────────────────────────────────────────────────────

function validateObsidianMarkdown(content: string): string[] {
  const issues: string[] = [];
  const lines = content.split("\n");

  // Check frontmatter: must start at line 1 and be closed
  if (content.startsWith("---")) {
    const closeIdx = content.indexOf("---", 3);
    if (closeIdx === -1) issues.push("Frontmatter opened with --- but never closed");
  }

  // Check code fences
  let fenceOpen = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.startsWith("```")) fenceOpen = !fenceOpen;
  }
  if (fenceOpen) issues.push("Unclosed code fence (```)");

  // Check wikilinks — each [[ must have a matching ]]
  const wikiMatches = content.match(/\[\[/g)?.length ?? 0;
  const wikiClose = content.match(/\]\]/g)?.length ?? 0;
  if (wikiMatches !== wikiClose) {
    issues.push(`Mismatched wikilinks: ${wikiMatches} opening [[ vs ${wikiClose} closing ]]`);
  }

  // Check Obsidian comments %% ... %%
  const commentMarkers = content.match(/%%/g)?.length ?? 0;
  if (commentMarkers % 2 !== 0) {
    issues.push("Odd number of %% markers — a comment block may be unclosed");
  }

  // Check callout syntax — must be > [!type]
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^>\s*\[!/.test(line) && !/^>\s*\[![a-zA-Z-]+\]/.test(line)) {
      issues.push(`Line ${i + 1}: Malformed callout — use > [!type] (e.g. > [!note])`);
    }
  }

  return issues;
}
