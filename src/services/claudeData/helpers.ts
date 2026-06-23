// ---------------------------------------------------------------------------
// Shared helpers used across the overview/projects/sessions/costs views.
// ---------------------------------------------------------------------------

export interface ModelUsageAgg {
    tokens: number;
    costUSD: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
}

export function emptyModelAgg(): ModelUsageAgg {
    return { tokens: 0, costUSD: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
}

export function mergeModelAgg(into: Map<string, ModelUsageAgg>, model: string, agg: ModelUsageAgg): void {
    const acc = into.get(model) ?? emptyModelAgg();
    acc.tokens += agg.tokens;
    acc.costUSD += agg.costUSD;
    acc.inputTokens += agg.inputTokens;
    acc.outputTokens += agg.outputTokens;
    acc.cacheReadTokens += agg.cacheReadTokens;
    acc.cacheCreationTokens += agg.cacheCreationTokens;
    into.set(model, acc);
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
export function newTokensOf(s: { inputTokens: number; outputTokens: number; cacheCreationTokens: number }): number {
    return s.inputTokens + s.outputTokens + s.cacheCreationTokens;
}

export function dateOf(ts: string): string {
    return ts.slice(0, 10);
}

export function hourOf(ts: string): number {
    const d = new Date(ts);
    const h = d.getUTCHours();
    return Number.isNaN(h) ? 0 : h;
}

export function buildDailySeries(totals: Map<string, number>): { dates: string[]; values: number[] } {
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
export function maxRollingSum(series: { dates: string[]; values: number[] }, windowDays: number, excludeFromDate: string): number {
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

export function fmtDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) ms = 0;
    const totalSeconds = Math.round(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}
