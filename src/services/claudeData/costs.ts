import { getData } from "./cache.js";
import { dateOf, mergeModelAgg, type ModelUsageAgg } from "./helpers.js";

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

        for (const [model, agg] of s.modelUsage) mergeModelAgg(modelAgg, model, agg);
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
