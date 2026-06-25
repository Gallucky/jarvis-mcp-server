import { execFile } from "child_process";
import { promisify } from "util";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const exec = promisify(execFile);

// Ensure Obsidian CLI is in PATH regardless of how the server is launched.
// The obsidian binary lives next to Obsidian.exe in Program Files.
const OBSIDIAN_BIN_DIR = "C:\\Program Files\\Obsidian";
const NPM_GLOBAL_DIR = "C:\\Users\\admin\\AppData\\Roaming\\npm";
for (const dir of [OBSIDIAN_BIN_DIR, NPM_GLOBAL_DIR]) {
  if (!process.env.PATH?.includes(dir)) {
    process.env.PATH = dir + ";" + (process.env.PATH ?? "");
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function run(bin: string, args: string[]): Promise<string> {
  // On Windows, execFile can't resolve .cmd/.ps1 wrappers directly.
  // Routing through cmd /c handles npm global installs (defuddle.cmd etc.)
  // and avoids ENOENT for scripts that aren't .exe.
  const isWindows = process.platform === "win32";
  const [spawnBin, spawnArgs] = isWindows
    ? ["cmd", ["/c", bin, ...args]]
    : [bin, args];
  const { stdout, stderr } = await exec(spawnBin, spawnArgs, { timeout: 30_000, windowsHide: true });
  return (stdout || stderr).trim();
}

function errorText(error: unknown): string {
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}

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

const CanvasSchema = z.object({
  path: z.string().describe('Vault-relative path for the canvas file, e.g. "Maps/Overview.canvas"'),
  json: z.string().describe("Full JSON Canvas spec 1.0 content as a string"),
}).strict();

const BasesSchema = z.object({
  path: z.string().describe('Vault-relative path for the base file, e.g. "Bases/Tasks.base"'),
  yaml: z.string().describe("Full Obsidian Bases YAML content as a string"),
}).strict();

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
        const args = ["parse", params.url, "--md"];
        if (params.property) args.push("-p", params.property);
        const output = await run("defuddle", args);
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
      const issues = validateObsidianMarkdown(params.content);
      const text =
        issues.length === 0
          ? "Valid Obsidian Markdown."
          : `Found ${issues.length} issue(s):\n` + issues.map((i) => `- ${i}`).join("\n");
      return { content: [{ type: "text", text }] };
    }
  );

  // 4. json-canvas — write a .canvas file
  server.registerTool(
    "obsidian_write_canvas",
    {
      title: "Write JSON Canvas File",
      description: `Validates and writes a JSON Canvas (.canvas) file to the vault.

The canvas must follow the JSON Canvas Spec 1.0:
  - Every node needs: id (16-char hex), type, x, y, width, height
  - Node types: "text" (requires text), "file" (requires file path),
    "link" (requires url), "group" (optional label)
  - Every edge needs: id, fromNode, toNode (must reference existing node IDs)
  - fromSide/toSide: "top" | "right" | "bottom" | "left"
  - fromEnd/toEnd: "none" | "arrow"
  - Colors: preset "1"–"6" or hex "#RRGGBB"

Args:
  - path (string): Vault-relative path, must end in .canvas
  - json (string): Full JSON Canvas content

Returns:
  Confirmation or a list of validation errors found before writing.

Examples:
  - Use when: "Create a mind map canvas for my project"
  - Use when: "Add a node to my existing canvas" (read it first, modify, then rewrite)`,
      inputSchema: CanvasSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      // Validate JSON
      let canvas: unknown;
      try {
        canvas = JSON.parse(params.json);
      } catch {
        return {
          isError: true,
          content: [{ type: "text", text: "Error: Canvas JSON is not valid JSON." }],
        };
      }

      const errors = validateCanvas(canvas);
      if (errors.length > 0) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Canvas validation failed:\n` + errors.map((e) => `- ${e}`).join("\n"),
            },
          ],
        };
      }

      try {
        const canvasPath = params.path.endsWith(".canvas") ? params.path : params.path + ".canvas";
        const argv = tokenise(`create name="${canvasPath}" content=${JSON.stringify(params.json)} silent overwrite`);
        await run("obsidian", argv);
        return {
          content: [{ type: "text", text: `Canvas written to '${canvasPath}'.` }],
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: errorText(error) }] };
      }
    }
  );

  // 5. obsidian-bases — write a .base file
  server.registerTool(
    "obsidian_write_base",
    {
      title: "Write Obsidian Bases File",
      description: `Validates and writes an Obsidian Bases (.base) file to the vault.

Bases files are YAML and support:
  - filters: narrow which notes appear (and/or/not, operators ==, !=, >, <, >=, <=)
  - formulas: computed properties (date math, if(), string functions, etc.)
  - properties: displayName overrides for columns
  - summaries: column aggregations (Sum, Average, Min, Max, Count, etc.)
  - views: one or more table/cards/list/map views with order, groupBy, limit

Key rules:
  - Wrap formula strings containing double-quotes in single quotes
  - Duration arithmetic: (date1 - date2).days — NOT raw duration division
  - Guard optional properties with if(): if(due, (date(due) - today()).days, "")
  - Every formula.X in order/properties must be defined in formulas

Args:
  - path (string): Vault-relative path, must end in .base
  - yaml (string): Full Obsidian Bases YAML content

Returns:
  Confirmation or YAML parse error details.

Examples:
  - Use when: "Create a task tracker base" or "Build a reading list database view"
  - Use when: adding filters/formulas to an existing .base file`,
      inputSchema: BasesSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const yamlError = validateBasesYaml(params.yaml);
      if (yamlError) {
        return {
          isError: true,
          content: [{ type: "text", text: `Bases YAML validation failed: ${yamlError}` }],
        };
      }

      try {
        const basePath = params.path.endsWith(".base") ? params.path : params.path + ".base";
        const argv = tokenise(`create name="${basePath}" content=${JSON.stringify(params.yaml)} silent overwrite`);
        await run("obsidian", argv);
        return {
          content: [{ type: "text", text: `Base file written to '${basePath}'.` }],
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: errorText(error) }] };
      }
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

interface CanvasNode { id: string; type: string; text?: string; file?: string; url?: string }
interface CanvasEdge { id: string; fromNode: string; toNode: string; fromSide?: string; toSide?: string; fromEnd?: string; toEnd?: string }
interface CanvasFile { nodes?: CanvasNode[]; edges?: CanvasEdge[] }

function validateCanvas(data: unknown): string[] {
  const errors: string[] = [];
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return ["Canvas must be a JSON object with 'nodes' and/or 'edges' arrays"];
  }

  const c = data as CanvasFile;
  const nodes = c.nodes ?? [];
  const edges = c.edges ?? [];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const allIds = new Set<string>();

  const SIDES = new Set(["top", "right", "bottom", "left"]);
  const ENDS = new Set(["none", "arrow"]);

  for (const node of nodes) {
    if (!node.id) { errors.push("A node is missing 'id'"); continue; }
    if (allIds.has(node.id)) errors.push(`Duplicate id: ${node.id}`);
    allIds.add(node.id);
    if (!node.type) errors.push(`Node ${node.id}: missing 'type'`);
    if (node.type === "text" && !node.text) errors.push(`Node ${node.id}: text node requires 'text'`);
    if (node.type === "file" && !node.file) errors.push(`Node ${node.id}: file node requires 'file'`);
    if (node.type === "link" && !node.url) errors.push(`Node ${node.id}: link node requires 'url'`);
  }

  for (const edge of edges) {
    if (!edge.id) { errors.push("An edge is missing 'id'"); continue; }
    if (allIds.has(edge.id)) errors.push(`Duplicate id: ${edge.id}`);
    allIds.add(edge.id);
    if (!nodeIds.has(edge.fromNode)) errors.push(`Edge ${edge.id}: fromNode '${edge.fromNode}' not found`);
    if (!nodeIds.has(edge.toNode)) errors.push(`Edge ${edge.id}: toNode '${edge.toNode}' not found`);
    if (edge.fromSide && !SIDES.has(edge.fromSide)) errors.push(`Edge ${edge.id}: invalid fromSide '${edge.fromSide}'`);
    if (edge.toSide && !SIDES.has(edge.toSide)) errors.push(`Edge ${edge.id}: invalid toSide '${edge.toSide}'`);
    if (edge.fromEnd && !ENDS.has(edge.fromEnd)) errors.push(`Edge ${edge.id}: invalid fromEnd '${edge.fromEnd}'`);
    if (edge.toEnd && !ENDS.has(edge.toEnd)) errors.push(`Edge ${edge.id}: invalid toEnd '${edge.toEnd}'`);
  }

  return errors;
}

function validateBasesYaml(yaml: string): string | null {
  // Lightweight structural check — just ensure it doesn't start with obvious JSON
  // and has no unbalanced quotes on key lines. Full parse happens in Obsidian.
  if (yaml.trim().startsWith("{") || yaml.trim().startsWith("[")) {
    return "Content looks like JSON, not YAML. Use YAML syntax for .base files.";
  }
  // Check for unclosed single-quoted formula strings (odd number of ' on formula lines)
  const lines = yaml.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s+\w+:\s+'/.test(line) && (line.match(/'/g)?.length ?? 0) % 2 !== 0) {
      return `Line ${i + 1}: unclosed single-quoted formula string`;
    }
  }
  return null;
}

// ─── shell tokeniser ─────────────────────────────────────────────────────────

/** Split a command string into argv, respecting double-quoted segments. */
function tokenise(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === " " && !inQuote) {
      if (current) { tokens.push(current); current = ""; }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}
