import { parseAllClaudeCodeSessions, type ParsedCodeSession } from "./codeSessions.js";
import { parseAllCoworkSessions, type ParsedCoworkSession } from "./coworkSessions.js";

// ---------------------------------------------------------------------------
// 60-second in-memory cache — session files don't change mid-second.
// ---------------------------------------------------------------------------

interface ParsedData {
    codeSessions: ParsedCodeSession[];
    coworkSessions: ParsedCoworkSession[];
}

let cache: ParsedData | null = null;
let cacheTs = 0;
const CACHE_TTL_MS = 60_000;

export function getData(): ParsedData {
    const now = Date.now();
    if (cache && now - cacheTs < CACHE_TTL_MS) return cache;
    cache = {
        codeSessions: parseAllClaudeCodeSessions(),
        coworkSessions: parseAllCoworkSessions(),
    };
    cacheTs = now;
    return cache;
}
