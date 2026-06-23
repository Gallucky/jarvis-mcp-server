export type ClaudeSource = 'cowork' | 'claude-code' | 'chat';

export interface ClaudeUsageLine {
  ts: string;
  session_id: string;
  title: string;
  source: ClaudeSource;
  est_user_tokens: number;
  est_output_tokens: number;
  est_output_cost_usd: number;
  msg_index: number;
}

export interface ClaudeSession extends ClaudeUsageLine {
  messages: ClaudeUsageLine[];
}

export interface SourceTotals {
  sessions: number;
  tokens: number;
  cost_usd: number;
}

export interface ClaudeUsageResponse {
  sessions: ClaudeSession[];
  totals: Record<ClaudeSource | 'all', SourceTotals>;
  dailyBreakdown: Array<{ date: string } & Record<ClaudeSource, number>>;
}
