import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import db from "../services/db.js";
import {
    DbQueryInputSchema,
    type DbQueryInput,
    DbExecuteInputSchema,
    type DbExecuteInput,
    DbDescribeTableInputSchema,
    type DbDescribeTableInput,
} from "../schemas/sqlite.js";

// ─── shared logic — called by both the MCP tools below and the REST facade ──
// (db_execute has no REST-facing counterpart, so it stays inline below —
// arbitrary writes from a web-facing token are out of scope by design.)

export function runQuery(sql: string, params: unknown[]): unknown[] {
    return db.prepare(sql).all(...params);
}

export function listTables(): string[] {
    const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as { name: string }[];
    return rows.map((r) => r.name);
}

export interface TableColumn { name: string; type: string; notnull: number; dflt_value: unknown; pk: number }

export function describeTable(table: string): TableColumn[] {
    return db.prepare(`PRAGMA table_info(?)`).all(table) as TableColumn[];
}

// The main and only function to register all of the SQLite tools with the MCP server.
export function registerSqliteTools(server: McpServer): void {

    server.registerTool(
        "db_query",
        {
            title: "Query Database",
            description: `Runs a SELECT query against the local SQLite database and returns the results.

Args:
  - sql (string): A valid SELECT statement
  - params (array): Values to inject into ? placeholders

Returns:
  JSON array of matching rows. Empty array if nothing matches.

Examples:
  - "Show all tasks" -> SELECT * FROM tasks
  - "Find done tasks" -> SELECT * FROM tasks WHERE done = 1`,
            inputSchema: DbQueryInputSchema,
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        async (params: DbQueryInput) => {
            try {
                const rows = runQuery(params.sql, params.params);
                return {
                    content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
                    structuredContent: { rows },
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
                };
            }
        }
    );

    server.registerTool(
        "db_execute",
        {
            title: "Execute Statement",
            description: `Runs an INSERT, UPDATE, or DELETE statement against the local SQLite database.

Args:
  - sql (string): A valid INSERT, UPDATE, or DELETE statement
  - params (array): Values to inject into ? placeholders

Returns:
  How many rows were affected and the last inserted row ID (if applicable).`,
            inputSchema: DbExecuteInputSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: false,
                openWorldHint: false,
            },
        },
        async (params: DbExecuteInput) => {
            try {
                const result = db.prepare(params.sql).run(...params.params);
                return {
                    content: [{ type: "text", text: `Done. Rows affected: ${result.changes}. Last ID: ${result.lastInsertRowid}.` }],
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
                };
            }
        }
    );

    server.registerTool(
        "db_list_tables",
        {
            title: "List Tables",
            description: `Returns all table names in the SQLite database.`,
            inputSchema: {},
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        async () => {
            try {
                const names = listTables();
                return {
                    content: [{ type: "text", text: names.length ? names.join("\n") : "No tables found." }],
                    structuredContent: { tables: names },
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
                };
            }
        }
    );

    server.registerTool(
        "db_describe_table",
        {
            title: "Describe Table",
            description: `Returns the column names and types for a given table.

Args:
  - table (string): The table name to inspect`,
            inputSchema: DbDescribeTableInputSchema,
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        async (params: DbDescribeTableInput) => {
            try {
                const rows = describeTable(params.table);
                if (rows.length === 0) {
                    return { content: [{ type: "text", text: `No table named '${params.table}' found.` }] };
                }
                const text = rows.map((c) => `${c.name} (${c.type})${c.pk ? " PRIMARY KEY" : ""}${c.notnull ? " NOT NULL" : ""}`).join("\n");
                return {
                    content: [{ type: "text", text }],
                    structuredContent: { table: params.table, columns: rows },
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
