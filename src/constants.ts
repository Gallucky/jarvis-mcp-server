export const CHARACTER_LIMIT = 25000;
export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_SEARCH_LIMIT = 100;

// Folder convention used by your existing conversation-distiller skill.
// Change this if your vault uses a different path.
export const DISTILLATION_FOLDER = "_AI-SPACE/Distillations";

// Claude Code's own memory folder for this project -- vault_memory_* tools
// read/write here to keep it in sync with the vault's "about me" notes.
export const MEMORY_DIR = "C:/Users/admin/.claude/projects/c--jarvis-mcp-server/memory";

// Vault notes treated as the source of truth for vault_memory_* tools.
export const VAULT_MEMORY_NOTE_PATHS = ["ME.md", "05 Meta/Claude.Reports.md"];

// CHANGE THESE to the directories you want Claude to have filesystem access to.
// All fs_* tool calls are blocked outside these paths.
export const FS_ALLOWED_PATHS = [
    "C:/Gal's Obsidian Vault",
    "C:/jarvis-mcp-server",
    MEMORY_DIR,
];

// Claude usage JSONL logs, read directly by the /api/claude-usage dashboard endpoint.
export const CLAUDE_USAGE_DIR = "C:/Gal's Obsidian Vault/_AI-SPACE/claude-usage";

// Anthropic does not publish exact Claude Code token quotas — the real
// limit is an opaque "active compute hours" budget (Pro = 1x baseline,
// Max 5x/20x) that varies by model and conversation complexity, not a
// fixed token count. These are only a *floor* for installs with little
// usage history; src/services/claudeData.ts raises the effective limit
// dynamically once there's enough history (1.25x the heaviest day/week
// actually seen), so the dashboard's rate-limit bars self-calibrate
// instead of relying solely on this guess. Bump these if real usage
// keeps reading near/over 100% on a Pro plan with no throttling.
export const CLAUDE_LIMITS = {
    daily: { tokens: 2_000_000, label: "יומי" },
    weekly: { tokens: 10_000_000, label: "שבועי" },
};

// Estimates — update to match your actual Cowork plan. The Claude Analytics
// dashboard's rate-limit bars compare a Cowork session's cum_tokens against these.
export const COWORK_LIMITS = {
    session5h: { tokens: 88_000, label: "5-hour session" },
    daily: { tokens: 200_000, label: "daily" },
    weekly: { tokens: 1_000_000, label: "weekly" },
};
