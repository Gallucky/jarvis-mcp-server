# Expansion Plan

Here I will list a new section in the dashboard, a sub-dashboard related to Claude.

- It should list me every session from claude code and claude cowork, claude chat when possible as a history.

- It should check the amount of tokens used via each one if can not calculate aqurately, estimate and attach the `~` character next to the tokens amount which after the number should the word tokens be as a suffix. If the number is larger then  a thsouand then use a number with a `.` and a k suffix - e.g. `1.1k tokens`

- It should tell me my weekly limits and daily limits / 5-hour session limits as 2 progress bars containing colors with each of Claude Code, Claude Cowork, Claude Chat with hover popups explaninig that the color orange for example is claude code etc... One progressbar is for the weekly limits and another for the daily/5-hour session limits.

- Add suggestions and last brief on what i did before.

- Add a brief for today and other informations and statisics.

---

## 🔧 Improvements

### Data Source
- JSONL files live at `C:/Gal's Obsidian Vault/_AI-SPACE/claude-usage/YYYY-MM-DD_<slug>.jsonl`. The server already allowlists that vault path — read them via `fs.readdirSync` / `fs.readFileSync` in a new `/api/claude-usage` Express endpoint inside `src/routes/dashboard.ts`.
- Each line has: `ts`, `session_id`, `title`, `source` (`"cowork"` | `"claude-code"`), `est_user_tokens`, `est_output_tokens`, `est_output_cost_usd`, `msg_index`. Use these fields directly; no DB table needed.

### New API endpoint
`GET /api/claude-usage?days=7` — reads all JSONL files from the last N days, groups lines by `session_id` (latest `msg_index` per session = that session's totals), returns:
```json
{
  "sessions": [...],         // array, newest first
  "totals": { "cowork": {...}, "claude-code": {...}, "all": {...} },
  "dailyBreakdown": [...]    // last 7 days × source
}
```

### Color Scheme (define once, reuse everywhere)
| Source | Color | Label |
|---|---|---|
| `cowork` | `#4A90D9` Blue | Claude Cowork |
| `claude-code` | `#FF8C42` Orange | Claude Code |
| `chat` | `#9B59B6` Purple | Claude Chat |

### Progress Bar Improvements
- Color transitions: Green → Yellow (70 %) → Red (90 %) based on % used, independent of source color.
- Tooltip on hover: sessions count · total tokens · estimated cost · time to reset.
- Show reset countdown ("מתאפס בעוד 3 שעות") beneath each bar.
- Limits are **configurable** — store them in a `src/constants.ts` export so they're easy to update when Anthropic changes them.

### Session List Improvements
- Show `est_output_cost_usd` as `~$0.02` next to tokens.
- Clicking a row expands the per-message breakdown (all lines with that `session_id`, ordered by `msg_index`).
- Filter bar: date-range picker + source chips (All / Cowork / Code / Chat).
- Sort by: newest, most tokens, highest cost.
- Empty state: friendly Hebrew message when no sessions match the filter.

### Stats Panel (below progress bars)
- All-time: total tokens, total cost, session count.
- This week: same trio.
- Streak: consecutive days with ≥ 1 session (show 🔥 N days).
- Top 3 sessions this week by output tokens.

### Page wiring (follows `adding-features-quick.md`)
- New page bundle: `claude` → `src/dashboard/claude/index.tsx`
- Home block: move the Claude entry from `IDEA_BLOCKS` to a live `<HomeBlock>` with a usage-% ring (total tokens this week / weekly cap).
- Route: `GET /dashboard/claude` in `dashboard.ts`.