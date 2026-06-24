import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import assertPathAllowed from "../utils/pathSafety.js";
import { MEMORY_DIR } from "../constants.js";

export type MemoryType = "user" | "feedback" | "project" | "reference";

export interface MemoryFileInput {
  name: string;
  description: string;
  type: MemoryType;
  content: string;
}

const INDEX_PATH = join(MEMORY_DIR, "MEMORY.md");

function memoryFilePath(name: string): string {
  const path = join(MEMORY_DIR, `${name}.md`);
  assertPathAllowed(path);
  return path;
}

export function readMemoryIndex(): string {
  return existsSync(INDEX_PATH) ? readFileSync(INDEX_PATH, "utf-8") : "";
}

export function readMemoryFile(name: string): string | null {
  const path = memoryFilePath(name);
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

/** Slugs (without ".md") of every memory file, excluding the MEMORY.md index. */
export function listMemoryFiles(): string[] {
  if (!existsSync(MEMORY_DIR)) return [];
  return readdirSync(MEMORY_DIR)
    .filter((file) => file.endsWith(".md") && file !== "MEMORY.md")
    .map((file) => file.replace(/\.md$/, ""));
}

export function writeMemoryFile(input: MemoryFileInput): void {
  mkdirSync(MEMORY_DIR, { recursive: true });
  const frontmatter = [
    "---",
    `name: ${input.name}`,
    `description: ${input.description}`,
    "metadata:",
    `  type: ${input.type}`,
    "---",
    "",
    input.content.trim(),
    "",
  ].join("\n");
  writeFileSync(memoryFilePath(input.name), frontmatter, "utf-8");
}

/** Replaces the existing index line for `name` (matched by its "(name.md)" link), or appends it. */
export function upsertIndexLine(name: string, indexLine: string): void {
  assertPathAllowed(INDEX_PATH);
  mkdirSync(MEMORY_DIR, { recursive: true });
  const linkMarker = `(${name}.md)`;
  const lines = readMemoryIndex()
    .split("\n")
    .filter((line) => line.trim().length > 0 && !line.includes(linkMarker));
  lines.push(indexLine.trim());
  writeFileSync(INDEX_PATH, lines.join("\n") + "\n", "utf-8");
}
