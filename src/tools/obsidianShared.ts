import { execFile } from "child_process";
import { promisify } from "util";

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

/** Shared by obsidian.ts (CLI/defuddle) and obsidianStructured.ts (canvas/base). */
export async function run(bin: string, args: string[]): Promise<string> {
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

export function errorText(error: unknown): string {
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}

/** Split a command string into argv, respecting double-quoted segments. */
export function tokenise(command: string): string[] {
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
