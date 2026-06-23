// ---------------------------------------------------------------------------
// Pricing (USD per token, derived from $/MTok). Cache writes default to the
// 5-minute-TTL rate unless the line carries an explicit ephemeral_1h split.
// ---------------------------------------------------------------------------

export interface Pricing {
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

export function pricingForModel(model: string | undefined | null): Pricing {
    const m = (model ?? "").toLowerCase();
    if (m.includes("opus")) return OPUS_PRICING;
    if (m.includes("haiku")) return HAIKU_PRICING;
    return SONNET_PRICING;
}

export interface AnthropicUsage {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
}

export function costForUsage(model: string | undefined | null, usage: AnthropicUsage): number {
    const p = pricingForModel(model);
    const input = usage.input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const write5m = usage.cache_creation ? (usage.cache_creation.ephemeral_5m_input_tokens ?? 0) : (usage.cache_creation_input_tokens ?? 0);
    const write1h = usage.cache_creation ? (usage.cache_creation.ephemeral_1h_input_tokens ?? 0) : 0;
    return input * p.input + output * p.output + cacheRead * p.cacheRead + write5m * p.cacheWrite5m + write1h * p.cacheWrite1h;
}
