import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { CLAUDE_USAGE_DIR, CLAUDE_LIMITS } from "../constants.js";

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const COWORK_SESSIONS_DIR = path.join(CLAUDE_USAGE_DIR, "sessions");
const COWORK_DAILY_DIR = path.join(CLAUDE_USAGE_DIR, "daily");

// ---------------------------------------------------------------------------
// Pricing (USD per token, derived from $/MTok). Cache writes default to the
// 5-minute-TTL rate unless the line carries an explicit ephemeral_1h split.
// ---------------------------------------------------------------------------

interface Pricing {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite5m: number;
    cacheWrite1h: number;
}

const PER_MTOK = (input: number, output: number): Pricing => ({
    input: input / 1e6,
    output: output / 1e6,
    cacheRead: (input * 0.1) / 1e6,
    cacheWrite5m: (input * 1.25) / 1e6,
    cacheWrite1h: (input * 2) / 1e6,
});

const SONNET_PRICING = PER_MTOK(3, 15);
const OPUS_PRICING = PER_MTOK(5, 25);
const HAIKU_PRICING = PER_MTOK(1, 5);

function pricingForModel(model: string | undefined | null): Pricing {
    const m = (model ?? "").toLowerCase();
    if (m.includes("opus")) return OPUS_PRICING;
    if (m.includes("haiku")) return HAIKU_PRICING;
    return SONNET_PRICING;
}

interface AnthropicUsage {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
}

function costForUsage(model: string | undefined | null, usage: AnthropicUsage): number {
    const p = pricingForModel(model);
    const input = usage.input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const write5m = usage.cache_creation ? (usage.cache_creation.ephemeral_5m_input_tokens ?? 0) : (usage.cache_creation_input_tokens ?? 0);
    const write1h = usage.cache_creation ? (usage.cache_creation.ephemeral_1h_input_tokens ?? 0) : 0;
    return input * p.input + output * p.output + cacheRead * p.cacheRead + write5m * p.cacheWrite5m + write1h * p.cacheWrite1h;
}

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

interface ModelUsageAgg {
    tokens: number;
    costUSD: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
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

function emptyModelAgg(): ModelUsageAgg {
    return { tokens: 0, costUSD: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
}

// "Tokens used" headline figure — deliberately excludes cache_read.
// Every turn in a long-running session re-reads the entire accumulated
// context from the prompt cache, so cache_read_input_tokens grows with
// (turn count × context size) and can reach the tens of millions within a
// single multi-hour session — it's billed (at ~10% of input price) but it
// is *not* new content and isn't a meaningful "how much did I use" number.
// input + output + cache_creation is the genuinely-new-tokens count: it
// only grows when new content actually enters the context for the first
// time. Raw cache_read/cache_creation/input/output stay available
// separately wherever the UI shows a cost or token *breakdown*.
function newTokensOf(s: { inputTokens: number; outputTokens: number; cacheCreationTokens: number }): number {
    return s.inputTokens + s.outputTokens + s.cacheCreationTokens;
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
                // Excludes cache_read on purpose — see newTokensOf() above.
                target.tokens = (target.tokens ?? 0) + inp + out + cCreate;

                const modelKey = model ?? "unknown";
                const agg = modelUsage.get(modelKey) ?? emptyModelAgg();
                agg.tokens += inp + out + cCreate;
                agg.costUSD += turnCost;
                agg.inputTokens += inp;
                agg.outputTokens += out;
                agg.cacheReadTokens += cRead;
                agg.cacheCreationTokens += cCreate;
                modelUsage.set(modelKey, agg);
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

function parseAllClaudeCodeSessions(): ParsedCodeSession[] {
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

// ---------------------------------------------------------------------------
// Source B — Cowork sessions (new format): claude-usage/sessions/*.jsonl +
// claude-usage/daily/*.jsonl. See vault CLAUDE.md "Usage Tracking" section.
// ---------------------------------------------------------------------------

export interface CoworkMsgLine {
    ts: string;
    session_id: string;
    title: string;
    msg_index: number;
    est_output_tokens: number;
    est_output_cost_usd: number;
    cum_tokens: number;
    cum_cost_usd: number;
    est_user_tokens: number;
}

export interface ParsedCoworkSession {
    id: string;
    title: string;
    startTs: string;
    lastTs: string;
    msgCount: number;
    cumTokens: number;
    cumCostUSD: number;
    messages: CoworkMsgLine[];
}

function parseAllCoworkSessions(): ParsedCoworkSession[] {
    let files: string[] = [];
    try {
        files = fs.readdirSync(COWORK_SESSIONS_DIR);
    } catch {
        return [];
    }

    const sessions: ParsedCoworkSession[] = [];
    for (const file of files) {
        if (!file.endsWith(".jsonl")) continue;
        const sessionId = file.slice(0, -".jsonl".length);
        let content: string;
        try {
            content = fs.readFileSync(path.join(COWORK_SESSIONS_DIR, file), "utf-8");
        } catch {
            continue;
        }
        const lines = content.split("\n").filter((l) => l.trim());
        let startTs: string | null = null;
        let title = "session";
        const msgs: CoworkMsgLine[] = [];
        for (const line of lines) {
            let obj: any;
            try {
                obj = JSON.parse(line);
            } catch {
                continue;
            }
            if (obj.type === "session_start") {
                startTs = obj.ts ?? startTs;
                if (typeof obj.title === "string") title = obj.title;
            } else if (obj.type === "msg") {
                msgs.push(obj as CoworkMsgLine);
                if (typeof obj.title === "string") title = obj.title;
            }
        }
        if (msgs.length === 0) continue;
        msgs.sort((a, b) => a.msg_index - b.msg_index);
        const last = msgs[msgs.length - 1];
        sessions.push({
            id: sessionId,
            title,
            startTs: startTs ?? msgs[0].ts,
            lastTs: last.ts,
            msgCount: last.msg_index,
            cumTokens: last.cum_tokens ?? 0,
            cumCostUSD: last.cum_cost_usd ?? 0,
            messages: msgs,
        });
    }
    return sessions;
}

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

function getData(): ParsedData {
    const now = Date.now();
    if (cache && now - cacheTs < CACHE_TTL_MS) return cache;
    cache = {
        codeSessions: parseAllClaudeCodeSessions(),
        coworkSessions: parseAllCoworkSessions(),
    };
    cacheTs = now;
    return cache;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function dateOf(ts: string): string {
    return ts.slice(0, 10);
}

function hourOf(ts: string): number {
    const d = new Date(ts);
    const h = d.getUTCHours();
    return Number.isNaN(h) ? 0 : h;
}

function buildDailySeries(totals: Map<string, number>): { dates: string[]; values: number[] } {
    const keys = Array.from(totals.keys()).sort();
    if (keys.length === 0) return { dates: [], values: [] };
    const dates: string[] = [];
    const values: number[] = [];
    const cursor = new Date(keys[0]);
    const end = new Date(keys[keys.length - 1]);
    while (cursor <= end) {
        const key = cursor.toISOString().slice(0, 10);
        dates.push(key);
        values.push(totals.get(key) ?? 0);
        cursor.setDate(cursor.getDate() + 1);
    }
    return { dates, values };
}

// Largest tokens-per-`windowDays` total seen on record, excluding any window
// that overlaps `excludeFromDate` (today) — so a limit estimate calibrated
// from this can never be inflated by the very usage it's about to measure.
function maxRollingSum(series: { dates: string[]; values: number[] }, windowDays: number, excludeFromDate: string): number {
    const { dates, values } = series;
    let max = 0;
    let windowSum = 0;
    for (let i = 0; i < values.length; i++) {
        windowSum += values[i];
        if (i >= windowDays) windowSum -= values[i - windowDays];
        if (i >= windowDays - 1 && dates[i] < excludeFromDate) {
            max = Math.max(max, windowSum);
        }
    }
    return max;
}

function fmtDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) ms = 0;
    const totalSeconds = Math.round(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

// ---------------------------------------------------------------------------
// Public API — overview
// ---------------------------------------------------------------------------

export function getOverview() {
    const { codeSessions, coworkSessions } = getData();

    let totalMessages = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheCreationTokens = 0;
    let estimatedCostUSD = 0;
    let cacheSavingsUSD = 0;
    const modelAgg = new Map<string, ModelUsageAgg>();

    const dailyMap = new Map<string, { messages: number; sessions: Set<string>; toolCalls: number; tokens: number }>();
    const peakHours = new Array(24).fill(0);
    const activityMap = new Map<string, number>();

    const todayStr = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().slice(0, 10);
    let codeDailyTokens = 0;
    let codeWeeklyTokens = 0;
    let coworkDailyTokens = 0;
    let coworkWeeklyTokens = 0;
    const codeDailyTotals = new Map<string, number>();

    for (const s of codeSessions) {
        totalMessages += s.userMessageCount + s.assistantMessageCount;
        inputTokens += s.inputTokens;
        outputTokens += s.outputTokens;
        cacheCreationTokens += s.cacheCreationTokens;
        estimatedCostUSD += s.costUSD;
        cacheSavingsUSD += s.cacheSavingsUSD;

        for (const [model, agg] of s.modelUsage) {
            const acc = modelAgg.get(model) ?? emptyModelAgg();
            acc.tokens += agg.tokens;
            acc.costUSD += agg.costUSD;
            acc.inputTokens += agg.inputTokens;
            acc.outputTokens += agg.outputTokens;
            acc.cacheReadTokens += agg.cacheReadTokens;
            acc.cacheCreationTokens += agg.cacheCreationTokens;
            modelAgg.set(model, acc);
        }

        for (const m of s.messages) {
            if (!m.ts) continue;
            const date = dateOf(m.ts);
            const day = dailyMap.get(date) ?? { messages: 0, sessions: new Set<string>(), toolCalls: 0, tokens: 0 };
            day.messages++;
            day.sessions.add(s.id);
            day.toolCalls += m.toolCalls?.length ?? 0;
            day.tokens += m.tokens ?? 0;
            dailyMap.set(date, day);
            peakHours[hourOf(m.ts)]++;
            activityMap.set(date, (activityMap.get(date) ?? 0) + 1);
            if (date === todayStr) codeDailyTokens += m.tokens ?? 0;
            if (date >= weekAgoStr) codeWeeklyTokens += m.tokens ?? 0;
            codeDailyTotals.set(date, (codeDailyTotals.get(date) ?? 0) + (m.tokens ?? 0));
        }
    }

    // Anthropic doesn't publish exact Claude Code token quotas — the real
    // limit is an opaque "active compute hours" budget that varies by model
    // and conversation complexity, not a fixed token count. CLAUDE_LIMITS is
    // only a floor for installs with little history; once there's enough
    // data, the effective limit is calibrated against the heaviest day/week
    // actually seen so far (with 25% headroom), so the bar only reads over
    // 100% when today genuinely exceeds every prior day — not because the
    // floor guess was too conservative.
    const codeDailySeries = buildDailySeries(codeDailyTotals);
    const codeDailyHistMax = maxRollingSum(codeDailySeries, 1, todayStr);
    const codeWeeklyHistMax = maxRollingSum(codeDailySeries, 7, todayStr);
    const codeDailyLimit = Math.max(CLAUDE_LIMITS.daily.tokens, Math.round(codeDailyHistMax * 1.25));
    const codeWeeklyLimit = Math.max(CLAUDE_LIMITS.weekly.tokens, Math.round(codeWeeklyHistMax * 1.25));

    let coworkTokens = 0;
    let latestCoworkSession: ParsedCoworkSession | null = null;
    for (const s of coworkSessions) {
        coworkTokens += s.cumTokens;
        if (!latestCoworkSession || s.lastTs > latestCoworkSession.lastTs) latestCoworkSession = s;
        for (const m of s.messages) {
            const date = dateOf(m.ts);
            const day = dailyMap.get(date) ?? { messages: 0, sessions: new Set<string>(), toolCalls: 0, tokens: 0 };
            day.messages++;
            day.sessions.add(s.id);
            const msgTokens = m.est_output_tokens + m.est_user_tokens;
            day.tokens += msgTokens;
            dailyMap.set(date, day);
            peakHours[hourOf(m.ts)]++;
            activityMap.set(date, (activityMap.get(date) ?? 0) + 1);
            if (date === todayStr) coworkDailyTokens += msgTokens;
            if (date >= weekAgoStr) coworkWeeklyTokens += msgTokens;
        }
    }

    // Excludes cache_read tokens on purpose — see newTokensOf() above.
    const totalTokens = inputTokens + outputTokens + cacheCreationTokens + coworkTokens;

    const modelBreakdown = Array.from(modelAgg.entries())
        .map(([model, agg]) => ({ model, costUSD: agg.costUSD, tokens: agg.tokens }))
        .sort((a, b) => b.tokens - a.tokens);
    const breakdownTokenTotal = modelBreakdown.reduce((sum, m) => sum + m.tokens, 0);
    const modelBreakdownWithPct = modelBreakdown.map((m) => ({
        ...m,
        pct: breakdownTokenTotal ? Math.round((m.tokens / breakdownTokenTotal) * 100) : 0,
    }));

    const dailyUsage = Array.from(dailyMap.entries())
        .map(([date, d]) => ({ date, messages: d.messages, sessions: d.sessions.size, toolCalls: d.toolCalls, tokens: d.tokens }))
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .slice(-30);

    const today = new Date();
    const activityGrid: { date: string; count: number }[] = [];
    for (let i = 89; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const date = d.toISOString().slice(0, 10);
        activityGrid.push({ date, count: activityMap.get(date) ?? 0 });
    }

    return {
        totalSessions: codeSessions.length + coworkSessions.length,
        totalMessages,
        totalTokens,
        estimatedCostUSD,
        cacheSavingsUSD,
        inputTokens,
        outputTokens,
        modelBreakdown: modelBreakdownWithPct,
        dailyUsage,
        peakHours,
        activityGrid,
        coworkSessions: coworkSessions.length,
        coworkTokens,
        limits: {
            codeDailyTokens,
            codeWeeklyTokens,
            codeDailyLimit,
            codeWeeklyLimit,
            coworkSessionTokens: latestCoworkSession?.cumTokens ?? 0,
            coworkDailyTokens,
            coworkWeeklyTokens,
        },
    };
}

// ---------------------------------------------------------------------------
// Public API — projects
// ---------------------------------------------------------------------------

export function getProjects() {
    const { codeSessions } = getData();
    const byProject = new Map<string, ParsedCodeSession[]>();
    for (const s of codeSessions) {
        const arr = byProject.get(s.projectId) ?? [];
        arr.push(s);
        byProject.set(s.projectId, arr);
    }

    return Array.from(byProject.entries()).map(([id, sessions]) => {
        const totalTokens = sessions.reduce((sum, s) => sum + newTokensOf(s), 0);
        const totalMessages = sessions.reduce((sum, s) => sum + s.userMessageCount + s.assistantMessageCount, 0);
        const estimatedCostUSD = sessions.reduce((sum, s) => sum + s.costUSD, 0);
        const lastActive = sessions.reduce<string | null>((latest, s) => (!latest || (s.lastTs && s.lastTs > latest) ? s.lastTs : latest), null);
        const models = Array.from(new Set(sessions.flatMap((s) => s.models)));
        return {
            id,
            name: sessions[0].projectName,
            path: sessions[0].projectPath,
            sessions: sessions.length,
            totalTokens,
            totalMessages,
            estimatedCostUSD,
            lastActive,
            models,
        };
    }).sort((a, b) => ((a.lastActive ?? "") < (b.lastActive ?? "") ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Public API — sessions list
// ---------------------------------------------------------------------------

export interface SessionListItem {
    id: string;
    project: string;
    projectId: string | null;
    source: "code" | "cowork";
    model: string | null;
    branch: string | null;
    duration: string;
    messageCount: number;
    toolCallCount: number;
    tokens: number;
    estimatedCostUSD: number;
    compactions: number;
    timestamp: string;
    title: string;
}

export function getSessions(opts: { project?: string; search?: string; source?: "code" | "cowork" | "all"; limit?: number }): SessionListItem[] {
    const { codeSessions, coworkSessions } = getData();
    const source = opts.source ?? "all";
    const items: SessionListItem[] = [];

    if (source === "all" || source === "code") {
        for (const s of codeSessions) {
            if (opts.project && s.projectId !== opts.project) continue;
            const tokens = newTokensOf(s);
            const durationMs = s.firstTs && s.lastTs ? new Date(s.lastTs).getTime() - new Date(s.firstTs).getTime() : 0;
            items.push({
                id: s.id,
                project: s.projectName,
                projectId: s.projectId,
                source: "code",
                model: s.models[s.models.length - 1] ?? null,
                branch: s.gitBranch,
                duration: fmtDuration(durationMs),
                messageCount: s.userMessageCount + s.assistantMessageCount,
                toolCallCount: s.toolCallCount,
                tokens,
                estimatedCostUSD: s.costUSD,
                compactions: s.compactions,
                timestamp: s.lastTs ?? s.firstTs ?? "",
                title: s.title,
            });
        }
    }

    if (source === "all" || source === "cowork") {
        for (const s of coworkSessions) {
            if (opts.project) continue; // cowork sessions aren't grouped by project
            const durationMs = new Date(s.lastTs).getTime() - new Date(s.startTs).getTime();
            items.push({
                id: s.id,
                project: "Cowork",
                projectId: null,
                source: "cowork",
                model: null,
                branch: null,
                duration: fmtDuration(durationMs),
                messageCount: s.msgCount,
                toolCallCount: 0,
                tokens: s.cumTokens,
                estimatedCostUSD: s.cumCostUSD,
                compactions: 0,
                timestamp: s.lastTs,
                title: s.title,
            });
        }
    }

    let filtered = items;
    if (opts.search) {
        const q = opts.search.toLowerCase();
        filtered = filtered.filter((i) => i.title.toLowerCase().includes(q) || i.project.toLowerCase().includes(q));
    }

    filtered.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    return opts.limit ? filtered.slice(0, opts.limit) : filtered;
}

// ---------------------------------------------------------------------------
// Public API — session detail
// ---------------------------------------------------------------------------

export function getSessionDetail(id: string, source?: "code" | "cowork") {
    const { codeSessions, coworkSessions } = getData();

    if (source !== "cowork") {
        const s = codeSessions.find((c) => c.id === id);
        if (s) {
            const tokens = newTokensOf(s);
            const durationMs = s.firstTs && s.lastTs ? new Date(s.lastTs).getTime() - new Date(s.firstTs).getTime() : 0;
            const toolsUsed = Array.from(s.toolCounts.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);
            return {
                session: {
                    id: s.id,
                    project: s.projectName,
                    projectId: s.projectId,
                    source: "code" as const,
                    model: s.models[s.models.length - 1] ?? null,
                    branch: s.gitBranch,
                    duration: fmtDuration(durationMs),
                    messageCount: s.userMessageCount + s.assistantMessageCount,
                    toolCallCount: s.toolCallCount,
                    tokens,
                    estimatedCostUSD: s.costUSD,
                    compactions: s.compactions,
                    timestamp: s.lastTs ?? s.firstTs ?? "",
                    title: s.title,
                },
                messages: s.messages.map((m) => ({ role: m.role, text: m.text, ts: m.ts, tokens: m.tokens, toolCalls: m.toolCalls })),
                tokenBreakdown: {
                    input: s.inputTokens,
                    output: s.outputTokens,
                    cacheRead: s.cacheReadTokens,
                    cacheWrite: s.cacheCreationTokens,
                },
                toolsUsed,
            };
        }
    }

    const cs = coworkSessions.find((c) => c.id === id);
    if (cs) {
        const durationMs = new Date(cs.lastTs).getTime() - new Date(cs.startTs).getTime();
        return {
            session: {
                id: cs.id,
                project: "Cowork",
                projectId: null,
                source: "cowork" as const,
                model: null,
                branch: null,
                duration: fmtDuration(durationMs),
                messageCount: cs.msgCount,
                toolCallCount: 0,
                tokens: cs.cumTokens,
                estimatedCostUSD: cs.cumCostUSD,
                compactions: 0,
                timestamp: cs.lastTs,
                title: cs.title,
            },
            tokenTrajectory: cs.messages.map((m) => ({
                msgIndex: m.msg_index,
                ts: m.ts,
                outputTokens: m.est_output_tokens,
                userTokens: m.est_user_tokens,
                cumTokens: m.cum_tokens,
                cumCostUSD: m.cum_cost_usd,
            })),
        };
    }

    return null;
}

// ---------------------------------------------------------------------------
// Public API — costs
// ---------------------------------------------------------------------------

export function getCosts() {
    const { codeSessions } = getData();

    let totalCostUSD = 0;
    let cacheSavingsUSD = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    const costByProjectMap = new Map<string, number>();
    const modelAgg = new Map<string, ModelUsageAgg>();
    const costOverTimeMap = new Map<string, { sonnet: number; opus: number; haiku: number }>();

    for (const s of codeSessions) {
        totalCostUSD += s.costUSD;
        cacheSavingsUSD += s.cacheSavingsUSD;
        inputTokens += s.inputTokens;
        outputTokens += s.outputTokens;
        costByProjectMap.set(s.projectName, (costByProjectMap.get(s.projectName) ?? 0) + s.costUSD);

        for (const [model, agg] of s.modelUsage) {
            const acc = modelAgg.get(model) ?? emptyModelAgg();
            acc.tokens += agg.tokens;
            acc.costUSD += agg.costUSD;
            acc.inputTokens += agg.inputTokens;
            acc.outputTokens += agg.outputTokens;
            acc.cacheReadTokens += agg.cacheReadTokens;
            acc.cacheCreationTokens += agg.cacheCreationTokens;
            modelAgg.set(model, acc);
        }

    }

    // Cost-by-day-by-model: a session's usage is tracked per-turn but not
    // per-turn-per-day, so distribute each session's total cost across the
    // days it was active, weighted by assistant-turn count, and bucket by
    // the session's most-recently-used model.
    for (const s of codeSessions) {
        const turnsByDate = new Map<string, number>();
        for (const m of s.messages) {
            if (m.role !== "assistant" || !m.ts) continue;
            turnsByDate.set(dateOf(m.ts), (turnsByDate.get(dateOf(m.ts)) ?? 0) + 1);
        }
        const totalTurns = Array.from(turnsByDate.values()).reduce((a, b) => a + b, 0);
        if (totalTurns === 0) continue;
        const dominantModel = (s.models[s.models.length - 1] ?? "").toLowerCase();
        const bucket = dominantModel.includes("opus") ? "opus" : dominantModel.includes("haiku") ? "haiku" : "sonnet";
        for (const [date, count] of turnsByDate) {
            const day = costOverTimeMap.get(date) ?? { sonnet: 0, opus: 0, haiku: 0 };
            day[bucket] += s.costUSD * (count / totalTurns);
            costOverTimeMap.set(date, day);
        }
    }

    const costByProject = Array.from(costByProjectMap.entries())
        .map(([name, costUSD]) => ({ name, costUSD }))
        .sort((a, b) => b.costUSD - a.costUSD);

    const costByModel = Array.from(modelAgg.entries())
        .map(([model, agg]) => ({
            model,
            costUSD: agg.costUSD,
            inputTokens: agg.inputTokens,
            outputTokens: agg.outputTokens,
            cacheRead: agg.cacheReadTokens,
            cacheWrite: agg.cacheCreationTokens,
        }))
        .sort((a, b) => b.costUSD - a.costUSD);

    const costOverTime = Array.from(costOverTimeMap.entries())
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .slice(-30);

    return {
        totalCostUSD,
        cacheSavingsUSD,
        inputTokens,
        outputTokens,
        costByProject,
        costByModel,
        costOverTime,
    };
}
