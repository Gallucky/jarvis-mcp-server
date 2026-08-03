// Function-calling declarations + HTTP executor for jarvis's REST facade
// (see src/routes/api/*). Shared by two Gemini clients:
//   - src/scripts/gemini/chat.ts (standalone terminal script)
//   - src/services/geminiChatService.ts (the phone-friendly /dashboard/gemini page)
// Kept as a hand-written mirror rather than a dynamic OpenAPI->Gemini
// converter -- 14 endpoints is small enough that hand-written is more
// reliable than a generic conversion layer.

type ParamLocation = "query" | "path" | "body";

interface ToolSpec {
  name: string;
  method: "GET" | "POST" | "PATCH";
  path: string; // may contain {param} path placeholders
  description: string;
  properties: Record<string, { type: string; description: string }>;
  required: string[];
  paramLocations: Record<string, ParamLocation>;
}

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "vault_read_note",
    method: "GET",
    path: "/vault/note",
    description: "Read the full content of a note from the Obsidian vault.",
    properties: { path: { type: "string", description: "Vault-relative path, e.g. 'Projects/Jarvis/spec.md'" } },
    required: ["path"],
    paramLocations: { path: "query" },
  },
  {
    name: "vault_create_note",
    method: "POST",
    path: "/vault/note",
    description: "Create a new note in the vault. Fails if it already exists unless overwrite is true.",
    properties: {
      path: { type: "string", description: "Vault-relative path for the new note" },
      content: { type: "string", description: "Full Markdown content" },
      overwrite: { type: "boolean", description: "Replace an existing note at this path (default false)" },
    },
    required: ["path", "content"],
    paramLocations: { path: "body", content: "body", overwrite: "body" },
  },
  {
    name: "vault_append_note",
    method: "PATCH",
    path: "/vault/note",
    description: "Append content to the end of an existing note (creates it if missing).",
    properties: {
      path: { type: "string", description: "Vault-relative path to the note" },
      content: { type: "string", description: "Content to append" },
    },
    required: ["path", "content"],
    paramLocations: { path: "body", content: "body" },
  },
  {
    name: "vault_list_notes",
    method: "GET",
    path: "/vault/notes",
    description: "List files and subfolders directly inside a vault folder (non-recursive).",
    properties: { folder: { type: "string", description: "Vault-relative folder path; empty = vault root" } },
    required: [],
    paramLocations: { folder: "query" },
  },
  {
    name: "vault_search",
    method: "GET",
    path: "/vault/search",
    description: "Full-text search across all notes in the vault.",
    properties: {
      query: { type: "string", description: "Search text" },
      limit: { type: "string", description: "Max results, 1-100 (default 20)" },
    },
    required: ["query"],
    paramLocations: { query: "query", limit: "query" },
  },
  {
    name: "vault_create_distillation",
    method: "POST",
    path: "/vault/distillation",
    description: "Save a conversation distillation to the vault's distillations folder.",
    properties: {
      title: { type: "string", description: "Short title for the distillation" },
      content: { type: "string", description: "The distilled Markdown content" },
    },
    required: ["title", "content"],
    paramLocations: { title: "body", content: "body" },
  },
  {
    name: "db_query",
    method: "POST",
    path: "/db/query",
    description: "Run a SELECT-only SQL query against the local SQLite database.",
    properties: {
      sql: { type: "string", description: "A SELECT statement" },
      params: { type: "string", description: "JSON array of values for ? placeholders, e.g. \"[1, \\\"done\\\"]\"" },
    },
    required: ["sql"],
    paramLocations: { sql: "body", params: "body" },
  },
  {
    name: "db_list_tables",
    method: "GET",
    path: "/db/tables",
    description: "List all table names in the database.",
    properties: {},
    required: [],
    paramLocations: {},
  },
  {
    name: "db_describe_table",
    method: "GET",
    path: "/db/tables/{table}",
    description: "Describe a table's columns and types.",
    properties: { table: { type: "string", description: "Table name to inspect" } },
    required: ["table"],
    paramLocations: { table: "path" },
  },
  {
    name: "study_sync",
    method: "POST",
    path: "/study/sync",
    description: "Sync psychometric homework checkbox completions from the vault into SQLite.",
    properties: {},
    required: [],
    paramLocations: {},
  },
  {
    name: "obsidian_defuddle",
    method: "GET",
    path: "/obsidian/defuddle",
    description: "Extract clean Markdown from a web page (strips nav/ads/boilerplate).",
    properties: {
      url: { type: "string", description: "Web page URL to extract" },
      property: { type: "string", description: "Optional: return only one metadata field (title, description, domain, author, date)" },
    },
    required: ["url"],
    paramLocations: { url: "query", property: "query" },
  },
  {
    name: "obsidian_validate_markdown",
    method: "POST",
    path: "/obsidian/validate-markdown",
    description: "Validate Obsidian-flavored Markdown for common authoring mistakes.",
    properties: { content: { type: "string", description: "Markdown content to validate" } },
    required: ["content"],
    paramLocations: { content: "body" },
  },
  {
    name: "obsidian_write_canvas",
    method: "POST",
    path: "/obsidian/canvas",
    description: "Validate and write a JSON Canvas (.canvas) file to the vault.",
    properties: {
      path: { type: "string", description: "Vault-relative path, must end in .canvas" },
      json: { type: "string", description: "Full JSON Canvas spec 1.0 content as a string" },
    },
    required: ["path", "json"],
    paramLocations: { path: "body", json: "body" },
  },
  {
    name: "obsidian_write_base",
    method: "POST",
    path: "/obsidian/base",
    description: "Validate and write an Obsidian Bases (.base) YAML file to the vault.",
    properties: {
      path: { type: "string", description: "Vault-relative path, must end in .base" },
      yaml: { type: "string", description: "Full Obsidian Bases YAML content" },
    },
    required: ["path", "yaml"],
    paramLocations: { path: "body", yaml: "body" },
  },
];

/** Gemini function-declaration format, one per TOOL_SPECS entry. */
export function buildFunctionDeclarations() {
  return TOOL_SPECS.map((spec) => ({
    type: "function" as const,
    name: spec.name,
    description: spec.description,
    parameters: {
      type: "object",
      properties: spec.properties,
      required: spec.required,
    },
  }));
}

/** Executes one tool call against the jarvis REST facade and returns the parsed JSON response. */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  baseUrl: string,
  token: string
): Promise<unknown> {
  const spec = TOOL_SPECS.find((s) => s.name === name);
  if (!spec) return { error: `Unknown tool: ${name}` };

  let path = spec.path;
  const query = new URLSearchParams();
  const body: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    const location = spec.paramLocations[key];
    if (location === "path") path = path.replace(`{${key}}`, encodeURIComponent(String(value)));
    else if (location === "query") query.set(key, String(value));
    else if (location === "body") body[key] = key === "params" && typeof value === "string" ? JSON.parse(value) : value;
  }

  const url = `${baseUrl}${path}${query.toString() ? `?${query.toString()}` : ""}`;
  const hasBody = spec.method !== "GET" && Object.keys(body).length > 0;

  const response = await fetch(url, {
    method: spec.method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { status: response.status, raw: text };
  }
}
