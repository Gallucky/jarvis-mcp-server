import fs from "fs/promises";
import path from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assertPathAllowed from "../utils/pathSafety.js";
import { CHARACTER_LIMIT } from "../constants.js";
import {
    FSReadSchema, type FSReadInput,
    FSWriteSchema, type FSWriteInput,
    FSAppendSchema, type FSAppendInput,
    FSListDirSchema, type FSListDirInput,
    FSMoveSchema, type FSMoveInput,
    FSDeleteSchema, type FSDeleteInput,
} from "../schemas/filesystem.js";

export function registerFilesystemTools(server: McpServer): void {

    server.registerTool(
        "fs_read_file",
        {
            title: "Read File",
            description: `Reads the contents of a file from the allowed directories.

Args:
  - path (string): Absolute path to the file
  - max_lines (number): Maximum lines to read, -1 for all (default -1)

Returns:
  The file contents as text, truncated if over the character limit.`,
            inputSchema: FSReadSchema,
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        async (params: FSReadInput) => {
            try {
                assertPathAllowed(params.path);
                let text = await fs.readFile(params.path, "utf-8");
                if (params.max_lines !== -1) {
                    text = text.split("\n").slice(0, params.max_lines).join("\n");
                }
                if (text.length > CHARACTER_LIMIT) {
                    text = text.slice(0, CHARACTER_LIMIT) + "\n\n[Truncated — use max_lines to read in sections.]";
                }
                return { content: [{ type: "text", text }] };
            } catch (error) {
                return {
                    isError: true,
                    content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
                };
            }
        }
    );

    server.registerTool(
        "fs_append_file",
        {
            title: "Append File",
            description: `Appends content to a file in the allowed directories.

Args:
  - path (string): Absolute path to the file
  - contents (string): Content to append to the file

Returns:
  The number of bytes written to the file.`,
            inputSchema: FSAppendSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: false,
                openWorldHint: false,
            },
        },
        async (params: FSAppendInput) => {
            try {
                assertPathAllowed(params.path);
                await fs.appendFile(params.path, params.contents, "utf-8");
                return { content: [{ type: "text", text: `Appended ${params.contents.length} bytes to ${params.path}` }] };
            } catch (error) {
                return {
                    isError: true,
                    content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
                };
            }
        }
    );

    // Register the fs_write_file tool
    server.registerTool(
        "fs_write_file",
        {
            title: "Write File",
            description: `Writes content to a file in the allowed directories.

Args:
  - path (string): Absolute path to the file
  - contents (string): Content to write to the file

Returns:
  The number of bytes written to the file.`,
            inputSchema: FSWriteSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: false,
                openWorldHint: false,
            },
        },
        async (params: FSWriteInput) => {
            try {
                assertPathAllowed(params.path);
                await fs.writeFile(params.path, params.contents, "utf-8");
                return { content: [{ type: "text", text: `Wrote ${params.contents.length} bytes to ${params.path}` }] };
            } catch (error) {
                return {
                    isError: true,
                    content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
                };
            }
        }
    );

    // Register the fs_list_dir tool
    server.registerTool(
        "fs_list_dir",
        {
            title: "List Directory",
            description: `Lists the contents of a directory from the allowed directories.

Args:
  - path (string): Absolute path to the directory

Returns:
  A list of files and directories in the specified path.`,
            inputSchema: FSListDirSchema,
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        async (params: FSListDirInput) => {
            try {
                assertPathAllowed(params.path);
                const items = await fs.readdir(params.path, { recursive: params.recursive });
                return { content: [{ type: "text", text: items.join("\n") }] };
            } catch (error) {
                return {
                    isError: true,
                    content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
                };
            }
        }
    );

    // Register the fs_move_file tool
    server.registerTool(
        "fs_move_file",
        {
            title: "Move File",
            description: `Moves a file from one location to another within the allowed directories.

Args:
  - source (string): Absolute path to the source file
  - destination (string): Absolute path to the destination file

Returns:
  A success message or an error message.`,
            inputSchema: FSMoveSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: false,
                openWorldHint: false,
            },
        },
        async (params: FSMoveInput) => {
            try {
                assertPathAllowed(params.path_from);
                assertPathAllowed(params.path_to);
                await fs.rename(params.path_from, params.path_to);
                return { content: [{ type: "text", text: `Moved ${params.path_from} to ${params.path_to}` }] };
            } catch (error) {
                return {
                    isError: true,
                    content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
                };
            }
        }
    );

    // Register the fs_delete_file tool
    server.registerTool(
        "fs_delete_file",
        {
            title: "Delete File",
            description: `Deletes a file from the filesystem.

Args:
  - source (string): Absolute path to the source file

Returns:
  A success message or an error message.`,
            inputSchema: FSDeleteSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: false,
                openWorldHint: false,
            },
        },
        async (params: FSDeleteInput) => {
            try {
                assertPathAllowed(params.path);
                if (!params.confirm) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: "Deletion cancelled. Set confirm=true to delete." }],
                    };
                }
                await fs.rm(params.path, { recursive: true });
                return { content: [{ type: "text", text: `Deleted ${params.path}` }] };
            } catch (error) {
                return {
                    isError: true,
                    content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
                };
            }
        }
    );
}