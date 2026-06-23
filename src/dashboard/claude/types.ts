export interface ModelBreakdownEntry {
  model: string;
  costUSD: number;
  tokens: number;
  pct: number;
}

export interface DailyUsageEntry {
  date: string;
  messages: number;
  sessions: number;
  toolCalls: number;
  tokens: number;
}

export interface ActivityGridEntry {
  date: string;
  count: number;
}

export interface LimitsInfo {
  codeDailyTokens: number;
  codeWeeklyTokens: number;
  codeDailyLimit: number;
  codeWeeklyLimit: number;
  coworkSessionTokens: number;
  coworkDailyTokens: number;
  coworkWeeklyTokens: number;
}

export interface OverviewResponse {
  totalSessions: number;
  totalMessages: number;
  totalTokens: number;
  estimatedCostUSD: number;
  cacheSavingsUSD: number;
  inputTokens: number;
  outputTokens: number;
  modelBreakdown: ModelBreakdownEntry[];
  dailyUsage: DailyUsageEntry[];
  peakHours: number[];
  activityGrid: ActivityGridEntry[];
  coworkSessions: number;
  coworkTokens: number;
  limits: LimitsInfo;
}

export interface ProjectSummary {
  id: string;
  name: string;
  path: string;
  sessions: number;
  totalTokens: number;
  totalMessages: number;
  estimatedCostUSD: number;
  lastActive: string | null;
  models: string[];
}

export type SessionSource = 'code' | 'cowork';

export interface SessionListItem {
  id: string;
  project: string;
  projectId: string | null;
  source: SessionSource;
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

export interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
  ts: string;
  tokens?: number;
  toolCalls?: string[];
}

export interface TokenBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ToolUsedEntry {
  name: string;
  count: number;
}

export interface CodeSessionDetail {
  session: SessionListItem;
  messages: ConversationMessage[];
  tokenBreakdown: TokenBreakdown;
  toolsUsed: ToolUsedEntry[];
}

export interface CoworkTokenTrajectoryPoint {
  msgIndex: number;
  ts: string;
  outputTokens: number;
  userTokens: number;
  cumTokens: number;
  cumCostUSD: number;
}

export interface CoworkSessionDetail {
  session: SessionListItem;
  tokenTrajectory: CoworkTokenTrajectoryPoint[];
}

export type SessionDetail = CodeSessionDetail | CoworkSessionDetail;

export function isCodeSessionDetail(d: SessionDetail): d is CodeSessionDetail {
  return (d as CodeSessionDetail).messages !== undefined;
}

export interface CostByProjectEntry {
  name: string;
  costUSD: number;
}

export interface CostByModelEntry {
  model: string;
  costUSD: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface CostOverTimeEntry {
  date: string;
  sonnet: number;
  opus: number;
  haiku: number;
}

export interface CostsResponse {
  totalCostUSD: number;
  cacheSavingsUSD: number;
  inputTokens: number;
  outputTokens: number;
  costByProject: CostByProjectEntry[];
  costByModel: CostByModelEntry[];
  costOverTime: CostOverTimeEntry[];
}
