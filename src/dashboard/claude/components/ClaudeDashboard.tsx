import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CLAUDE_LIMITS } from '../../../constants';
import type { ClaudeSession, ClaudeSource, ClaudeUsageResponse, SourceTotals } from '../types';

const SOURCES: ClaudeSource[] = ['cowork', 'claude-code', 'chat'];

const SOURCE_COLORS: Record<ClaudeSource, string> = {
  cowork: '#4A90D9',
  'claude-code': '#FF8C42',
  chat: '#9B59B6',
};

const SOURCE_LABELS: Record<ClaudeSource, string> = {
  cowork: 'Claude Cowork',
  'claude-code': 'Claude Code',
  chat: 'Claude Chat',
};

const WARN_COLOR = '#F0A500';
const DANGER_COLOR = '#E53E3E';

type PresetRange = 7 | 14 | 30 | 'all';
type SourceFilter = 'all' | ClaudeSource;
type SortMode = 'newest' | 'tokens' | 'cost';
type TooltipState = { x: number; y: number; node: ReactNode } | null;

// Wrapped in dir="ltr" so the leading `~` doesn't get reordered by the
// Unicode bidi algorithm when this is embedded inside RTL (Hebrew) text.
function fmtTokens(n: number, estimated = false): ReactNode {
  const s = n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  return <span dir="ltr">{estimated ? `~${s}` : s}<sub className="token-unit">tokens</sub></span>;
}

function fmtCost(n: number): ReactNode {
  return <span dir="ltr">{`~$${n.toFixed(2)}`}</span>;
}

function barColor(source: ClaudeSource, pct: number): string {
  if (pct >= 90) return DANGER_COLOR;
  if (pct >= 70) return WARN_COLOR;
  return SOURCE_COLORS[source];
}

// Older log entries predate the `source` field — fall back gracefully
// instead of rendering an empty/uncoloured chip.
function sourceColor(source: string): string {
  return (SOURCE_COLORS as Record<string, string>)[source] ?? '#6b7280';
}
function sourceLabel(source: string): string {
  return (SOURCE_LABELS as Record<string, string>)[source] ?? 'ללא תיוג';
}

function hoursUntil(target: Date): number {
  return Math.max(0, Math.round((target.getTime() - Date.now()) / 3_600_000));
}

function resetCountdownText(target: Date): string {
  const totalHours = hoursUntil(target);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `${days} ימים ו-${hours} שעות` : `${hours} שעות`;
}

function nextMidnight(): Date {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d;
}

function nextWeekStart(): Date {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? 7 : 7 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function emptyTotals(): SourceTotals {
  return { sessions: 0, tokens: 0, cost_usd: 0 };
}

function aggregateBySource(sessions: ClaudeSession[]): Record<ClaudeSource, SourceTotals> {
  const result = {} as Record<ClaudeSource, SourceTotals>;
  for (const s of SOURCES) result[s] = emptyTotals();
  for (const session of sessions) {
    const bucket = result[session.source];
    if (!bucket) continue;
    bucket.sessions += 1;
    bucket.tokens += session.est_user_tokens + session.est_output_tokens;
    bucket.cost_usd += session.est_output_cost_usd;
  }
  return result;
}

export function ClaudeDashboard() {
  const [usage, setUsage] = useState<ClaudeUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [rangeFilter, setRangeFilter] = useState<PresetRange>(7);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  useEffect(() => {
    fetch('/api/claude-usage?days=all')
      .then(r => r.json())
      .then((data: ClaudeUsageResponse) => setUsage(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const showTooltip = (e: { clientX: number; clientY: number }, node: ReactNode) =>
    setTooltip({ x: e.clientX, y: e.clientY, node });
  const moveTooltip = (e: { clientX: number; clientY: number }) =>
    setTooltip(t => (t ? { ...t, x: e.clientX, y: e.clientY } : t));
  const hideTooltip = () => setTooltip(null);

  const todayStr = useMemo(() => dateStr(new Date()), []);
  const weekCutoffStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return dateStr(d);
  }, []);

  const dailyAgg = useMemo(
    () => aggregateBySource((usage?.sessions ?? []).filter(s => s.ts.slice(0, 10) === todayStr)),
    [usage, todayStr]
  );
  const weeklySessions = useMemo(
    () => (usage?.sessions ?? []).filter(s => s.ts.slice(0, 10) >= weekCutoffStr),
    [usage, weekCutoffStr]
  );
  const weeklyAgg = useMemo(() => aggregateBySource(weeklySessions), [weeklySessions]);

  const thisWeekStats = useMemo(
    () => SOURCES.reduce((acc, s) => {
      acc.sessions += weeklyAgg[s].sessions;
      acc.tokens += weeklyAgg[s].tokens;
      acc.cost_usd += weeklyAgg[s].cost_usd;
      return acc;
    }, emptyTotals()),
    [weeklyAgg]
  );

  const streak = useMemo(() => {
    if (!usage) return 0;
    const activeDates = new Set(usage.sessions.map(s => s.ts.slice(0, 10)));
    let count = 0;
    const cursor = new Date();
    while (activeDates.has(dateStr(cursor))) {
      count++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }, [usage]);

  const usingCustomRange = Boolean(customFrom || customTo);

  const selectPresetRange = (r: PresetRange) => {
    setRangeFilter(r);
    setCustomFrom('');
    setCustomTo('');
  };
  const clearCustomRange = () => {
    setCustomFrom('');
    setCustomTo('');
  };

  const filteredSessions = useMemo(() => {
    if (!usage) return [];
    let list = usage.sessions;

    if (usingCustomRange) {
      if (customFrom) list = list.filter(s => s.ts.slice(0, 10) >= customFrom);
      if (customTo) list = list.filter(s => s.ts.slice(0, 10) <= customTo);
    } else if (rangeFilter !== 'all') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - rangeFilter);
      const cutoffStr = dateStr(cutoff);
      list = list.filter(s => s.ts.slice(0, 10) >= cutoffStr);
    }

    if (sourceFilter !== 'all') {
      list = list.filter(s => s.source === sourceFilter);
    }

    const sorted = [...list];
    if (sortMode === 'tokens') {
      sorted.sort((a, b) => b.est_output_tokens - a.est_output_tokens);
    } else if (sortMode === 'cost') {
      sorted.sort((a, b) => b.est_output_cost_usd - a.est_output_cost_usd);
    } else {
      sorted.sort((a, b) => (a.ts < b.ts ? 1 : -1));
    }
    return sorted;
  }, [usage, rangeFilter, customFrom, customTo, usingCustomRange, sourceFilter, sortMode]);

  return (
    <div className="dashboard" dir="ltr">
      <div className="header">
        <div>
          <a className="back-link" dir="rtl" href="/dashboard">🏠 לוח בקרה</a>
          <div className="header-title">🤖 Claude Dashboard</div>
        </div>
      </div>

      {loading ? (
        <div dir="rtl" style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>טוען...</div>
      ) : (
        <>
          <div className="card progress-group">
            <div className="card-title" dir="rtl">{CLAUDE_LIMITS.daily.label}</div>
            {SOURCES.map(source => (
              <ProgressBar
                key={source}
                source={source}
                totals={dailyAgg[source]}
                limit={CLAUDE_LIMITS.daily.tokens}
                resetText={resetCountdownText(nextMidnight())}
                onShow={showTooltip}
                onMove={moveTooltip}
                onHide={hideTooltip}
              />
            ))}
            <div className="progress-group-reset" dir="rtl">מתאפס בעוד {resetCountdownText(nextMidnight())}</div>
          </div>

          <div className="card progress-group">
            <div className="card-title" dir="rtl">{CLAUDE_LIMITS.weekly.label}</div>
            {SOURCES.map(source => (
              <ProgressBar
                key={source}
                source={source}
                totals={weeklyAgg[source]}
                limit={CLAUDE_LIMITS.weekly.tokens}
                resetText={resetCountdownText(nextWeekStart())}
                onShow={showTooltip}
                onMove={moveTooltip}
                onHide={hideTooltip}
              />
            ))}
            <div className="progress-group-reset" dir="rtl">מתאפס בעוד {resetCountdownText(nextWeekStart())}</div>
          </div>

          <div className="stats-row">
            <StatCard
              label="סה״כ"
              value={fmtTokens(usage?.totals.all.tokens ?? 0, true)}
              sub={<span dir="rtl">{usage?.totals.all.sessions ?? 0} שיחות · {fmtCost(usage?.totals.all.cost_usd ?? 0)}</span>}
            />
            <StatCard
              label="השבוע"
              value={fmtTokens(thisWeekStats.tokens, true)}
              sub={<span dir="rtl">{thisWeekStats.sessions} שיחות · {fmtCost(thisWeekStats.cost_usd)}</span>}
            />
            <StatCard label="רצף" value={`🔥 ${streak} days`} />
          </div>

          <div className="card">
            <div className="card-title" dir="rtl">היסטוריית שיחות</div>

            <div className="session-filters">
              <div className="session-filters-row">
                {([7, 14, 30, 'all'] as PresetRange[]).map(r => (
                  <button
                    key={r}
                    dir="rtl"
                    className={`filter-chip${!usingCustomRange && rangeFilter === r ? ' active' : ''}`}
                    onClick={() => selectPresetRange(r)}
                  >
                    {r === 'all' ? 'הכל' : `${r} ימים`}
                  </button>
                ))}
              </div>

              <div className="session-filters-row daterange-row" dir="rtl">
                <span className="daterange-label">מ-</span>
                <input
                  type="date"
                  className="daterange-input"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                />
                <span className="daterange-label">עד</span>
                <input
                  type="date"
                  className="daterange-input"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                />
                {usingCustomRange && (
                  <button type="button" className="daterange-clear" onClick={clearCustomRange} title="נקה טווח מותאם">✕</button>
                )}
              </div>

              <div className="session-filters-row">
                <button
                  dir="rtl"
                  className={`filter-chip${sourceFilter === 'all' ? ' active' : ''}`}
                  onClick={() => setSourceFilter('all')}
                >
                  הכל
                </button>
                {SOURCES.map(s => (
                  <button
                    key={s}
                    className={`filter-chip${sourceFilter === s ? ' active' : ''}`}
                    onClick={() => setSourceFilter(s)}
                  >
                    {SOURCE_LABELS[s]}
                  </button>
                ))}
                <Dropdown
                  value={sortMode}
                  onChange={v => setSortMode(v)}
                  options={[
                    { value: 'newest', label: 'חדש ביותר' },
                    { value: 'tokens', label: 'הכי הרבה טוקנים' },
                    { value: 'cost', label: 'הכי יקר' },
                  ]}
                />
              </div>
            </div>

            {filteredSessions.length === 0 ? (
              <div className="session-empty" dir="rtl">לא נמצאו שיחות מתאימות לסינון</div>
            ) : (
              <div className="session-list">
                {filteredSessions.map(session => (
                  <SessionRow
                    key={session.session_id}
                    session={session}
                    expanded={expanded === session.session_id}
                    onToggle={() => setExpanded(expanded === session.session_id ? null : session.session_id)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {tooltip && createPortal(<CursorTooltip x={tooltip.x} y={tooltip.y} node={tooltip.node} />, document.body)}
    </div>
  );
}

function CursorTooltip({ x, y, node }: { x: number; y: number; node: ReactNode }) {
  const flipX = x > window.innerWidth * 0.7;
  const flipY = y > window.innerHeight * 0.75;
  const OFFSET = 16;
  const style: React.CSSProperties = {
    left: flipX ? undefined : x + OFFSET,
    right: flipX ? window.innerWidth - x + OFFSET : undefined,
    top: flipY ? undefined : y + OFFSET,
    bottom: flipY ? window.innerHeight - y + OFFSET : undefined,
  };
  return <div className="cursor-tooltip" dir="rtl" style={style}>{node}</div>;
}

function ProgressBar({ source, totals, limit, resetText, onShow, onMove, onHide }: {
  source: ClaudeSource;
  totals: SourceTotals;
  limit: number;
  resetText: string;
  onShow: (e: { clientX: number; clientY: number }, node: ReactNode) => void;
  onMove: (e: { clientX: number; clientY: number }) => void;
  onHide: () => void;
}) {
  const pct = limit ? Math.min(100, Math.round(totals.tokens / limit * 100)) : 0;
  const color = barColor(source, pct);
  const tooltipNode = (
    <>
      <div>{totals.sessions} שיחות</div>
      <div>{fmtTokens(totals.tokens, true)}</div>
      <div>{fmtCost(totals.cost_usd)}</div>
      <div>מתאפס בעוד {resetText}</div>
    </>
  );
  return (
    <div
      className="progress-bar-wrap"
      onMouseEnter={e => onShow(e, tooltipNode)}
      onMouseMove={onMove}
      onMouseLeave={onHide}
    >
      <div className="progress-bar-head">
        <span className="progress-bar-label" style={{ color: SOURCE_COLORS[source] }}>{SOURCE_LABELS[source]}</span>
        <span className="progress-bar-meta">{fmtTokens(totals.tokens, true)} / {fmtTokens(limit)}</span>
      </div>
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 10px -1px ${color}` }} />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat-card">
      <div className="stat-card-label" dir="rtl">{label}</div>
      <div className="stat-card-value">{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}

function SessionRow({ session, expanded, onToggle }: { session: ClaudeSession; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="session-row-wrap">
      <button className="session-row" onClick={onToggle}>
        <span className="session-date">{new Date(session.ts).toLocaleDateString('he-IL')}</span>
        <span className="session-title">{session.title || '—'}</span>
        <span className="session-chip" dir="auto" style={{ color: sourceColor(session.source) }}>
          {sourceLabel(session.source)}
        </span>
        <span className="session-tokens">{fmtTokens(session.est_output_tokens, true)}</span>
        <span className="session-cost">{fmtCost(session.est_output_cost_usd)}</span>
      </button>
      {expanded && (
        <div className="session-messages">
          {session.messages.map(m => (
            <div className="session-message-row" key={m.msg_index}>
              <span className="session-message-index">#{m.msg_index}</span>
              <span>{fmtTokens(m.est_output_tokens, true)}</span>
              <span>{fmtCost(m.est_output_cost_usd)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Dropdown<T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const current = options.find(o => o.value === value);

  return (
    <div className="dropdown" ref={ref}>
      <button type="button" className="dropdown-trigger" onClick={() => setOpen(o => !o)}>
        <span dir="rtl">{current?.label}</span>
        <span className="dropdown-arrow">▾</span>
      </button>
      {open && (
        <div className="dropdown-menu">
          {options.map(o => (
            <button
              type="button"
              key={o.value}
              dir="rtl"
              className={`dropdown-item${o.value === value ? ' active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
