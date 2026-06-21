import path from "path";
import { FS_ALLOWED_PATHS } from "../constants.js";

// This function checks if a given path is allowed based on the FS_ALLOWED_PATHS constant.
// It resolves the input path and compares it against the allowed paths.
// Why? Because there are security concerns with allowing arbitrary file access
// using shortcuts like "..", ".", or symlinks. 
// If the resolved path starts with any of the allowed paths,
// it returns true; otherwise, false.
export default function assertPathAllowed(checkPath: string): void {
    // Resolving the input path to its absolute form to prevent directory traversal attacks.
    const resolvedPath = path.resolve(checkPath);

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