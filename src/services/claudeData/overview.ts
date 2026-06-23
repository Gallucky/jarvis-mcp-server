import { CLAUDE_LIMITS } from "../../constants.js";
import { getData } from "./cache.js";
import type { ParsedCoworkSession } from "./coworkSessions.js";
import { buildDailySeries, dateOf, hourOf, maxRollingSum, mergeModelAgg, type ModelUsageAgg } from "./helpers.js";

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

        for (const [model, agg] of s.modelUsage) mergeModelAgg(modelAgg, model, agg);

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

    // Excludes cache_read tokens on purpose — see newTokensOf() in helpers.ts.
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
