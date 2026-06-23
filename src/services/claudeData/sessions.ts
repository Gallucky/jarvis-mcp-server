import { getData } from "./cache.js";
import { fmtDuration, newTokensOf } from "./helpers.js";

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
