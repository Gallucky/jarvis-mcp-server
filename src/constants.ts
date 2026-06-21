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
