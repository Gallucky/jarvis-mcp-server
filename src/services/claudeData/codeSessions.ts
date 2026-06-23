import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { costForUsage, pricingForModel, type AnthropicUsage } from "./pricing.js";
import { mergeModelAgg, type ModelUsageAgg } from "./helpers.js";

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

// ---------------------------------------------------------------------------
// Source A — Claude Code sessions: ~/.claude/projects/<encoded-path>/*.jsonl
// ---------------------------------------------------------------------------

export interface NormalizedMessage {
    role: "user" | "assistant";
    text: string;
    ts: string;
    tokens?: number;
    toolCalls?: string[];
}

export interface ParsedCodeSession {
    id: string;
    projectId: string;
    projectPath: string;
    projectName: string;
    title: string;
    gitBranch: string | null;
    models: string[];
    firstTs: string | null;
    lastTs: string | null;
    userMessageCount: number;
    assistantMessageCount: number;
    toolCallCount: number;
    toolCounts: Map<string, number>;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    costUSD: number;
    cacheSavingsUSD: number;
    compactions: number;
    modelUsage: Map<string, ModelUsageAgg>;
    messages: NormalizedMessage[];
}

function decodeProjectId(id: string): string {
    // Best-effort fallback — every line normally carries its own `cwd`, which
    // is preferred. Windows paths are encoded as `c--jarvis-mcp-server` (":"
    // and "\" both become "-"), which can't be losslessly reversed when the
    // real path also contains hyphens.
    const driveMatch = id.match(/^([a-zA-Z])--(.*)$/);
    if (driveMatch) return `${driveMatch[1]}:/${driveMatch[2].replace(/-/g, "/")}`;
    return id.replace(/-/g, "/");
}

function parseClaudeCodeSessionFile(filePath: string, sessionId: string, projectId: string): ParsedCodeSession | null {
    let content: string;
    try {
        content = fs.readFileSync(filePath, "utf-8");
    } catch {
        return null;
    }
    const lines = content.split("\n").filter((l) => l.trim());
    if (lines.length === 0) return null;

    let cwd: string | null = null;
    let gitBranch: string | null = null;
    let aiTitle: string | null = null;
    let firstTs: string | null = null;
    let lastTs: string | null = null;
    const modelSet = new Set<string>();
    const modelsSeen: string[] = [];
    let userMessageCount = 0;
    let assistantTurnCount = 0;
    let toolCallCount = 0;
    const toolCounts = new Map<string, number>();
    let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheCreationTokens = 0;
    let costUSD = 0, cacheSavingsUSD = 0;
    let compactions = 0;
    const modelUsage = new Map<string, ModelUsageAgg>();
    const messages: NormalizedMessage[] = [];
    const assistantIndex = new Map<string, number>();
    const seenUsageIds = new Set<string>();

    for (const line of lines) {
        let obj: any;
        try {
            obj = JSON.parse(line);
        } catch {
            continue;
        }

        const ts: string | undefined = obj.timestamp;
        if (ts) {
            if (!firstTs || ts < firstTs) firstTs = ts;
            if (!lastTs || ts > lastTs) lastTs = ts;
        }
        if (!cwd && typeof obj.cwd === "string") cwd = obj.cwd;
        if (!gitBranch && typeof obj.gitBranch === "string") gitBranch = obj.gitBranch;
        if (obj.type === "ai-title" && typeof obj.aiTitle === "string") aiTitle = obj.aiTitle;
        if (obj.isCompactSummary === true || obj.type === "summary") compactions++;

        if (obj.type === "user" && obj.message && Array.isArray(obj.message.content)) {
            const blocks = obj.message.content;
            const textItems = blocks.filter((c: any) => c.type === "text" && typeof c.text === "string");
            const allToolResult = blocks.length > 0 && blocks.every((c: any) => c.type === "tool_result");
            if (textItems.length > 0 && !allToolResult) {
                userMessageCount++;
                messages.push({ role: "user", text: textItems.map((c: any) => c.text).join("\n\n"), ts: ts ?? "" });
            }
            continue;
        }

        if (obj.type === "assistant" && obj.message) {
            const msg = obj.message;
            const model: string | undefined = typeof msg.model === "string" ? msg.model : undefined;
            if (model && !modelSet.has(model)) {
                modelSet.add(model);
                modelsSeen.push(model);
            }

            const msgId: string = msg.id ?? obj.requestId ?? obj.uuid ?? `${sessionId}:${messages.length}`;
            let idx = assistantIndex.get(msgId);
            if (idx === undefined) {
                assistantTurnCount++;
                idx = messages.length;
                messages.push({ role: "assistant", text: "", ts: ts ?? "", tokens: 0, toolCalls: [] });
                assistantIndex.set(msgId, idx);
            }
            const target = messages[idx];

            if (Array.isArray(msg.content)) {
                for (const block of msg.content) {
                    if (block.type === "text" && typeof block.text === "string") {
                        target.text += (target.text ? "\n\n" : "") + block.text;
                    } else if (block.type === "tool_use") {
                        toolCallCount++;
                        const name = typeof block.name === "string" ? block.name : "unknown";
                        toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
                        target.toolCalls!.push(name);
                    }
                }
            }

            // One API response is split across several JSONL lines (thinking,
            // tool_use, text) that all repeat the same `usage` object — count
            // it once per logical turn (keyed by message id) or costs/tokens
            // get multiplied by however many content blocks the turn had.
            if (msg.usage && !seenUsageIds.has(msgId)) {
                seenUsageIds.add(msgId);
                const u: AnthropicUsage = msg.usage;
                const inp = u.input_tokens ?? 0;
                const out = u.output_tokens ?? 0;
                const cRead = u.cache_read_input_tokens ?? 0;
                const cCreate = u.cache_creation_input_tokens ?? 0;
                inputTokens += inp;
                outputTokens += out;
                cacheReadTokens += cRead;
                cacheCreationTokens += cCreate;
                const turnCost = costForUsage(model, u);
                costUSD += turnCost;
                const p = pricingForModel(model);
                cacheSavingsUSD += cRead * (p.input - p.cacheRead);
                // Excludes cache_read on purpose — see newTokensOf() in helpers.ts.
                target.tokens = (target.tokens ?? 0) + inp + out + cCreate;

                const modelKey = model ?? "unknown";
                mergeModelAgg(modelUsage, modelKey, {
                    tokens: inp + out + cCreate,
                    costUSD: turnCost,
                    inputTokens: inp,
                    outputTokens: out,
                    cacheReadTokens: cRead,
                    cacheCreationTokens: cCreate,
                });
            }
        }
    }

    if (!firstTs && messages.length === 0) return null;

    const resolvedPath = cwd ?? decodeProjectId(projectId);
    const projectName = path.basename(resolvedPath.replace(/[\\/]+$/, "")) || resolvedPath;

    return {
        id: sessionId,
        projectId,
        projectPath: resolvedPath,
        projectName,
        title: aiTitle ?? gitBranch ?? "session",
        gitBranch,
        models: modelsSeen,
        firstTs,
        lastTs,
        userMessageCount,
        assistantMessageCount: assistantTurnCount,
        toolCallCount,
        toolCounts,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        costUSD,
        cacheSavingsUSD,
        compactions,
        modelUsage,
        messages,
    };
}

export function parseAllClaudeCodeSessions(): ParsedCodeSession[] {
    let entries: fs.Dirent[] = [];
    try {
        entries = fs.readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true });
    } catch {
        return [];
    }

    const sessions: ParsedCodeSession[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const projectId = entry.name;
        const projectDir = path.join(CLAUDE_PROJECTS_DIR, projectId);
        let files: string[] = [];
        try {
            files = fs.readdirSync(projectDir);
        } catch {
            continue;
        }
        for (const file of files) {
            if (!file.endsWith(".jsonl")) continue;
            const sessionId = file.slice(0, -".jsonl".length);
            const parsed = parseClaudeCodeSessionFile(path.join(projectDir, file), sessionId, projectId);
            if (parsed) sessions.push(parsed);
        }
    }
    return sessions;
}
