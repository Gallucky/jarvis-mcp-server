import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { run, errorText, tokenise } from "./obsidianShared.js";

// ─── schemas ────────────────────────────────────────────────────────────────

const CanvasSchema = z.object({
  path: z.string().describe('Vault-relative path for the canvas file, e.g. "Maps/Overview.canvas"'),
  json: z.string().describe("Full JSON Canvas spec 1.0 content as a string"),
}).strict();

const BasesSchema = z.object({
  path: z.string().describe('Vault-relative path for the base file, e.g. "Bases/Tasks.base"'),
  yaml: z.string().describe("Full Obsidian Bases YAML content as a string"),
}).strict();

// ─── shared logic — called by both the MCP tools below and the REST facade ──

export async function writeCanvasFile(path: string, json: string): Promise<{ written: true; path: string } | { written: false; errors: string[] }> {
  let canvas: unknown;
  try {
    canvas = JSON.parse(json);
  } catch {
    return { written: false, errors: ["Canvas JSON is not valid JSON."] };
  }
  const errors = validateCanvas(canvas);
  if (errors.length > 0) return { written: false, errors };

  const canvasPath = path.endsWith(".canvas") ? path : path + ".canvas";
  const argv = tokenise(`create name="${canvasPath}" content=${JSON.stringify(json)} silent overwrite`);
  await run("obsidian", argv);
  return { written: true, path: canvasPath };
}

export async function writeBaseFile(path: string, yaml: string): Promise<{ written: true; path: string } | { written: false; error: string }> {
  const yamlError = validateBasesYaml(yaml);
  if (yamlError) return { written: false, error: yamlError };

  const basePath = path.endsWith(".base") ? path : path + ".base";
  const argv = tokenise(`create name="${basePath}" content=${JSON.stringify(yaml)} silent overwrite`);
  await run("obsidian", argv);
  return { written: true, path: basePath };
}

// ─── registration ────────────────────────────────────────────────────────────

export function registerObsidianStructuredTools(server: McpServer): void {
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
      try {
        const result = await writeCanvasFile(params.path, params.json);
        if (!result.written) {
          return {
            isError: true,
            content: [{ type: "text", text: `Canvas validation failed:\n` + result.errors.map((e) => `- ${e}`).join("\n") }],
          };
        }
        return { content: [{ type: "text", text: `Canvas written to '${result.path}'.` }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: errorText(error) }] };
      }
    }
  );

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
      try {
        const result = await writeBaseFile(params.path, params.yaml);
        if (!result.written) {
          return { isError: true, content: [{ type: "text", text: `Bases YAML validation failed: ${result.error}` }] };
        }
        return { content: [{ type: "text", text: `Base file written to '${result.path}'.` }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: errorText(error) }] };
      }
    }
  );
}

// ─── validation helpers ──────────────────────────────────────────────────────

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
