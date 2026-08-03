import { Router } from "express";

/**
 * OpenAPI 3.0 description of the /api/* REST facade, for Gemini/AI Studio
 * (or any other non-MCP caller) to import as a function-calling tool.
 * Kept hand-written and minimal -- just enough for each endpoint's
 * method/path/params to be discoverable, not a full spec-compliance exercise.
 */
export function buildOpenApiRouter(baseUrl: string): Router {
  const router = Router();

  router.get("/openapi.json", (_req, res) => {
    res.json({
      openapi: "3.0.3",
      info: { title: "jarvis-mcp-server REST API", version: "1.0.0" },
      servers: [{ url: `${baseUrl}/api` }],
      components: {
        securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
      },
      security: [{ bearerAuth: [] }],
      paths: {
        "/vault/note": {
          get: { summary: "Read a vault note", parameters: [q("path", true)], responses: ok() },
          post: { summary: "Create a vault note", requestBody: body(["path", "content"], { overwrite: "boolean" }), responses: ok() },
          patch: { summary: "Append to a vault note", requestBody: body(["path", "content"]), responses: ok() },
        },
        "/vault/notes": {
          get: { summary: "List a vault folder (non-recursive)", parameters: [q("folder", false)], responses: ok() },
        },
        "/vault/search": {
          get: { summary: "Full-text search the vault", parameters: [q("query", true), q("limit", false)], responses: ok() },
        },
        "/vault/distillation": {
          post: { summary: "Save a conversation distillation", requestBody: body(["title", "content"]), responses: ok() },
        },
        "/db/query": {
          post: { summary: "Run a SELECT-only SQL query", requestBody: body(["sql"], { params: "array" }), responses: ok() },
        },
        "/db/tables": {
          get: { summary: "List database tables", responses: ok() },
        },
        "/db/tables/{table}": {
          get: { summary: "Describe a table's columns", parameters: [{ name: "table", in: "path", required: true, schema: { type: "string" } }], responses: ok() },
        },
        "/study/sync": {
          post: { summary: "Sync psychometric homework checkboxes from the vault into SQLite", responses: ok() },
        },
        "/obsidian/defuddle": {
          get: { summary: "Extract clean Markdown from a web page", parameters: [q("url", true), q("property", false)], responses: ok() },
        },
        "/obsidian/validate-markdown": {
          post: { summary: "Validate Obsidian-flavored Markdown", requestBody: body(["content"]), responses: ok() },
        },
        "/obsidian/canvas": {
          post: { summary: "Write a JSON Canvas file", requestBody: body(["path", "json"]), responses: ok() },
        },
        "/obsidian/base": {
          post: { summary: "Write an Obsidian Bases file", requestBody: body(["path", "yaml"]), responses: ok() },
        },
      },
    });
  });

  return router;
}

function q(name: string, required: boolean) {
  return { name, in: "query", required, schema: { type: "string" } };
}

function body(required: string[], extra: Record<string, string> = {}) {
  const properties: Record<string, { type: string }> = {};
  for (const key of required) properties[key] = { type: "string" };
  for (const [key, type] of Object.entries(extra)) properties[key] = { type };
  return { required: true, content: { "application/json": { schema: { type: "object", required, properties } } } };
}

function ok() {
  return { "200": { description: "Success" } };
}
