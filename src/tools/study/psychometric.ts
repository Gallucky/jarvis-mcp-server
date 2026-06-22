// src/tools/study.ts
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function registerStudyTools(server: McpServer, db: Database): void {
    // jarvis_sync_study_progress goes here
    // future: jarvis_study_stats, jarvis_weak_spots, etc.

    server.registerTool(
        "sync_psychometric_study_progress",
        {
            title: "Sync Psychometric Study Progress",
            description: `Parses all homework markdown files in the vault and syncs checkbox
completion data into the SQLite database.

Run this after checking off exercises in Obsidian to update the stats.

Returns: how many exercise entries were synced.`,
            inputSchema: {},
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        async () => {
            try {
                const scriptPath = path.resolve(__dirname, "../scripts/syncCheckboxes.js");
                const output = execSync(`node "${scriptPath}"`, { encoding: "utf-8" });
                return { content: [{ type: "text", text: output }] };
            } catch (error) {
                return {
                    isError: true,
                    content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
                };
            }
        }
    );
}