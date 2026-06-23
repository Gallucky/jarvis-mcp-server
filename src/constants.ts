export const CHARACTER_LIMIT = 25000;
export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_SEARCH_LIMIT = 100;

// Folder convention used by your existing conversation-distiller skill.
// Change this if your vault uses a different path.
export const DISTILLATION_FOLDER = "_AI-SPACE/Distillations";

// CHANGE THESE to the directories you want Claude to have filesystem access to.
// All fs_* tool calls are blocked outside these paths.
export const FS_ALLOWED_PATHS = [
    "C:/Gal's Obsidian Vault",
    "C:/jarvis-mcp-server",
];

// Claude usage JSONL logs, read directly by the /api/claude-usage dashboard endpoint.
export const CLAUDE_USAGE_DIR = "C:/Gal's Obsidian Vault/_AI-SPACE/claude-usage";

// CHANGE THESE when Anthropic updates rate limits.
export const CLAUDE_LIMITS = {
    daily: { tokens: 1_000_000, label: "יומי" },
    weekly: { tokens: 5_000_000, label: "שבועי" },
};
