# TaskScreen Implementation Plan

## Context
- **Frontend:** `src/dashboard/task/components/Task.tsx` + `task.css`
- **Backend:** `src/routes/tasks_screen.ts` → SQLite via `migrations/002_tasks.sql`
- **Build:** esbuild, same pattern as study/home dashboards
- **DB schema:** `tasks` table — no `is_big3`, `group`, `is_preset` columns yet

---

## Recommended Execution Order

1 → 2 → 3 → 4 → 5 → 6 → **verify all UI works** → 7 → 8 → **verify API+MCP** → DB migration 003 → 10 → DB migration 004 → 11 → 9

---

## Step 1 — Date Picker Dialog (TODO #1)

**What:** Replace the `type="text"` due date input with a real `<input type="date">` calendar picker.

**Changes — `Task.tsx` only:**
- Change the due date `<input>` in the add form: `type="text"` → `type="date"`
- Add `min={new Date().toISOString().split('T')[0]}` to prevent past dates
- Optionally: add a pencil icon next to due date on each card for inline editing

**Changes — `task.css`:**
- Style `::-webkit-calendar-picker-indicator` to match dark theme (invert + accent color)
- Style `input[type="date"]` same as `.task-input` but with calendar icon overrides

**Verify:** Add task → due date shows calendar picker → task saves with correct date → displayed on card.

---

## Step 2 — Style the Dropdown Dialog (TODO #2)

**What:** Replace native `<select>` with a custom styled dropdown component.

**New file:** `src/dashboard/task/components/Dropdown.tsx`

```ts
type DropdownProps = {
  options: { value: string; label: string; color?: string }[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
};
```

- Renders a styled button that opens an absolute-positioned list on click
- Close on click-outside via `useEffect` + `mousedown` listener

**Changes — `Task.tsx`:**
- Import `Dropdown`
- Replace all `<select className="task-select">` and `<select className="task-status-select">` with `<Dropdown>`

**Changes — `task.css`:**
- `.task-dropdown`, `.task-dropdown-menu`, `.task-dropdown-item` — position: absolute, backdrop-blur, border, color per option

**Verify:** Click status dropdown → styled menu appears → select option → menu closes → task updates → no layout shift.

---

## Step 3 — Custom Deletion Confirmation Popup (TODO #3)

**What:** Replace `window.confirm(...)` with a custom modal.

**New file:** `src/dashboard/task/components/ConfirmModal.tsx`

**Changes — `Task.tsx`:**
- Remove `window.confirm` call
- Add state: `const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)`
- Delete button sets `setPendingDeleteId(task.id)`
- Render `<ConfirmModal>` when `pendingDeleteId !== null`
- On confirm → `remove(pendingDeleteId)` → `setPendingDeleteId(null)`

**Changes — `task.css`:**
- `.confirm-overlay` — `position: fixed; inset: 0; backdrop-filter: blur(4px); z-index: 100`
- `.confirm-modal` — centered card, title + subtitle + two buttons (מחק / ביטול)

**Verify:** Click ✕ → modal appears with task name → "ביטול" closes, task stays → "מחק" deletes and closes.

---

## Step 4 — Preset Task Bank (TODO #4)

**What:** "⚡ מהיר" button opens a panel of pre-typed common tasks to add with one click.

**Approach:** Hardcoded `PRESET_TASKS` array in `Task.tsx` (no DB needed). Clicking a preset pre-fills the add form and opens it.

```ts
const PRESET_TASKS = [
  { title: 'חזרה על שיעור פסיכומטרי', area: 'לימודים', priority: 'High' },
  { title: 'תרגול שאלות כמותי', area: 'לימודים', priority: 'High' },
  // ... customize this list
];
```

**⚠️ Needs your input:** What specific tasks do you want in the bank?

**Changes — `Task.tsx`:** `showPresets` state, `PresetPanel` inline or separate component.

**Verify:** Click "⚡ מהיר" → panel opens → click preset → add form opens pre-filled → submit → task created correctly.

---

## Step 5 — Search Bar (TODO #5)

**What:** Filter tasks by title/description/area in real time (client-side only).

**Changes — `Task.tsx`:**
- Add state: `const [search, setSearch] = useState('')`
- Add `<input>` above task list with `placeholder="חיפוש..."`
- Filter: `const visible = tasks.filter(t => !search || [t.title, t.description, t.area].some(f => f?.toLowerCase().includes(search.toLowerCase())))`
- Render `visible` instead of `tasks`

**Changes — `task.css`:** `.task-search` — full-width input, search icon via `background-image`, same dark style as `.task-input`.

**Verify:** Type in search → only matching tasks show → clear → all return → empty state shows when no match.

---

## Step 6 — Filters & Groupings (TODO #6)

**What:** Filter by status/priority/area; group by area, status, or due date. All client-side.

**State to add in `Task.tsx`:**
```ts
const [filterStatus, setFilterStatus] = useState<Task['status'] | 'All'>('All');
const [filterPriority, setFilterPriority] = useState<Task['priority'] | 'All'>('All');
const [groupBy, setGroupBy] = useState<'none' | 'area' | 'status'>('none');
```

- Chain `.filter()` calls on the search-filtered tasks
- When `groupBy !== 'none'`, bucket tasks with a reduce, render each bucket under a group header

**Changes — `task.css`:** `.task-filter-bar`, `.task-group-header`, `.task-group-section`

**Verify:** Select "High" priority → only High tasks show → group by "area" → tasks bucketed under area labels → filter + group work together.

---

## Step 7 — Data Security + Fake Data Option (TODO #7)

**What:** Protect API endpoints; add a demo mode with fake data.

**Backend changes — `tasks_screen.ts`:**
- Add auth middleware: verify `Authorization: Bearer <token>` against `TASKS_API_TOKEN` env var. If missing/wrong → 401.
- Add demo mode: `if (req.query.demo === 'true') return res.json(FAKE_TASKS)`

**Frontend changes — `Task.tsx`:**
- "🔒 / 👁️ Demo" toggle in header → appends `?demo=true` to fetch URL

**⚠️ Needs your input:** Simple env-var token, or does existing OAuth in `oauthProvider.ts` already cover this? Check first.

**Verify:** No token → 401 → UI shows auth error. Demo mode on → fake tasks load → real data not exposed.

---

## Step 8 — Claude/Jarvis MCP Tools (TODO #8)

**What:** Let Claude create, query, modify, group, and filter tasks via MCP.

**New files:**
- `src/tools/tasks.ts` — tool handlers
- `src/schemas/tasks.ts` — zod/json schemas

**Register in `src/index.ts`** like other tools.

**Tools:**

| Tool | Args | What it does |
|---|---|---|
| `tasks_list` | `status?`, `priority?`, `area?`, `group_by?` | SELECT with optional WHERE + grouping |
| `tasks_create` | `title`, `priority?`, `area?`, `due_date?`, `description?` | INSERT |
| `tasks_patch` | `id`, `...fields` | UPDATE |
| `tasks_delete` | `id` | DELETE |
| `tasks_search` | `query` | LIKE search on title/desc/area |

**Verify:** From Claude MCP session → `tasks_create({title:"test"})` → appears in UI on refresh → `tasks_list({status:"WIP"})` returns correct subset.

---

## Step 9 — Daily Note Integration (TODO #9)

**What:** Each daily note pulls today's tasks from the tasks API.

**Backend change — `tasks_screen.ts`:**
- Add `?due_date=YYYY-MM-DD` query param filter to `GET /api/tasks`

**⚠️ Needs your decision:** Two options:
- **Option A (pull):** Daily note template calls `tasks_list({due_date: today})` via Jarvis MCP and inserts tasks as checkboxes on note creation.
- **Option B (push):** A script runs daily, queries tasks due today, appends them to the daily note.

Do you have a daily note template already?

**Verify:** Add task with today's due date → daily note shows it → complete in UI → re-run → reflects completion.

---

## Step 10 — Big 3 Tasks Styling (TODO #10)

**What:** Mark up to 3 tasks as "Big 3 of the day" with unique visual treatment.

**DB migration — `migrations/003_tasks_big3.sql`:**
```sql
ALTER TABLE tasks ADD COLUMN is_big3 INTEGER NOT NULL DEFAULT 0;
```

**Type update — `types.ts`:**
```ts
is_big3?: number; // 0 | 1
```

**Backend:** Add `is_big3` to allowed PATCH fields in `tasks_screen.ts`.

**Frontend changes — `Task.tsx`:**
- Add ⭐ toggle button on each card → `patch(id, { is_big3: task.is_big3 ? 0 : 1 })`
- Detect "Complete Big 3 Tasks" by exact title match → special class
- Limit: show warning if user tries to star a 4th task

**Changes — `task.css`:**
```css
.task-card-big3 { border-right: 3px solid #fbbf24; background: rgba(251,191,36,0.05); }
.task-card-complete-big3 { border: 2px solid #fbbf24; background: radial-gradient(...); }
```

**Verify:** Star a task → golden border appears → star 4th → warning shown → "Complete Big 3 Tasks" has distinct look → persists on reload.

---

## Step 11 (Bonus) — Task Groups (TODO #11)

**What:** Tasks can belong to named groups (projects/contexts) for deeper organization.

**DB migration — `migrations/004_tasks_group.sql`:**
```sql
ALTER TABLE tasks ADD COLUMN task_group TEXT;
```

**Type update — `types.ts`:**
```ts
task_group?: string;
```

**Frontend:** Group input in add form; reuses grouping logic from Step 6. Tasks without a group go under "ללא קבוצה".

**Verify:** Create tasks with groups → group by groups → correct buckets → ungrouped tasks in fallback bucket.

---

## Open Questions (Answer Before Starting)

1. **Step 4 — Presets:** What tasks do you want in the bank?
2. **Step 7 — Auth:** Simple env-var token or existing OAuth? Check `oauthProvider.ts` + `index.ts` first.
3. **Step 9 — Daily note:** Pull (template) or push (script)? Do you have an existing daily note template?
