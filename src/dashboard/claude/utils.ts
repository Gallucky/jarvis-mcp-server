export function fmtTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

export function fmtCost(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

export function fmtRelTime(iso: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return '—';
  const h = diff / 3600000;
  if (h < 0) return 'just now';
  if (h < 1) return `${Math.max(0, Math.round(diff / 60000))}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Literal hex twins of the CSS custom properties in claude.css — Canvas2D
// fillStyle/addColorStop can't resolve var(...), so chart code needs the
// real values while DOM styling keeps using the CSS variables.
export const CLAUDE_HEX = {
  orange: '#f78166',
  blue: '#58a6ff',
  green: '#3fb950',
  sonnet: '#58a6ff',
  opus: '#bc8cff',
  haiku: '#3fb950',
  cowork: '#f0883e',
  muted: '#7d8590',
};

const MODEL_COLOR_KEYWORDS: [string, string][] = [
  ['opus', 'var(--claude-opus)'],
  ['haiku', 'var(--claude-haiku)'],
  ['sonnet', 'var(--claude-sonnet)'],
];

const MODEL_COLOR_HEX_KEYWORDS: [string, string][] = [
  ['opus', CLAUDE_HEX.opus],
  ['haiku', CLAUDE_HEX.haiku],
  ['sonnet', CLAUDE_HEX.sonnet],
];

export function modelColor(model: string | null | undefined): string {
  const m = (model ?? '').toLowerCase();
  for (const [needle, color] of MODEL_COLOR_KEYWORDS) {
    if (m.includes(needle)) return color;
  }
  return 'var(--claude-text-muted)';
}

export function modelColorHex(model: string | null | undefined): string {
  const m = (model ?? '').toLowerCase();
  for (const [needle, color] of MODEL_COLOR_HEX_KEYWORDS) {
    if (m.includes(needle)) return color;
  }
  return CLAUDE_HEX.muted;
}

export function modelShortName(model: string | null | undefined): string {
  if (!model) return 'unknown';
  return model.replace(/^claude-/, '');
}
