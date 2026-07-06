import path from "path";
import { FS_ALLOWED_PATHS } from "../constants.js";

// Segments that are never accessible via fs_* tools, even inside an otherwise-allowed
// directory. FS_ALLOWED_PATHS includes this project's own root (C:/jarvis-mcp-server),
// so without this denylist, fs_read_file could read .env directly -- OAUTH_CLIENT_SECRET,
// OBSIDIAN_API_KEY, and AUTH_APPROVAL_PASSWORD in one call -- or read raw .git internals.
// Exact-segment match only: this deliberately does NOT block ".env.example" (no secrets,
// meant to be read normally).
const DENIED_EXACT_SEGMENTS = new Set([".env", ".git"]);

function isDeniedPath(resolvedPath: string): boolean {
    return resolvedPath.split(path.sep).some((segment) => DENIED_EXACT_SEGMENTS.has(segment));
}

// This function checks if a given path is allowed based on the FS_ALLOWED_PATHS constant.
// It resolves the input path and compares it against the allowed paths.
// Why? Because there are security concerns with allowing arbitrary file access
// using shortcuts like "..", ".", or symlinks. 
// If the resolved path starts with any of the allowed paths,
// it returns true; otherwise, false.
export default function assertPathAllowed(checkPath: string): void {
    // Resolving the input path to its absolute form to prevent directory traversal attacks.
    const resolvedPath = path.resolve(checkPath);

    // Deny-list wins even inside an otherwise-allowed directory -- secrets and VCS
    // internals are never fair game for fs_* tools, regardless of FS_ALLOWED_PATHS.
    if (isDeniedPath(resolvedPath)) {
        throw new Error(`Access denied: '${checkPath}' matches a denied file/pattern (.env, .git).`);
    }

    // Iterating through the allowed paths and checking if the resolved path starts with any of them.
    for (const allowedPath of FS_ALLOWED_PATHS) {
        // Resolve the allowed path to its absolute form for accurate comparison.
        const resolvedAllowedPath = path.resolve(allowedPath);
        // If the resolved path starts with the resolved allowed path, it is considered safe and allowed.
        if (resolvedPath.startsWith(resolvedAllowedPath + path.sep) || resolvedPath === resolvedAllowedPath) {
            return;
        }
    }

    // If the resolved path does not start with any of the allowed paths, it is considered unsafe.
    throw new Error(`Access denied: '${checkPath}' is outside the allowed directories.`);
};
