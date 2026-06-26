# 🗺️ Quest-Tasks Screen — Design & Implementation Plan

> **Goal:** Evolve the tasks screen from a flat to-do list into a quest-style system that mirrors
> how Gal already thinks about his projects in the vault — while staying grounded in the existing
> DB schema, API, and glassmorphism design system.

---

## 1. Where Things Stand

### 1a. Current Tasks Screen (dashboard)

| Layer | File | Status |
|-------|------|--------|
| DB migration | `migrations/002_tasks.sql` | ✅ Applied |
| API routes | `src/routes/tasks_screen.ts` | ✅ Tested (GET/POST/PATCH) |
| Types | `src/dashboard/task/types.ts` | ✅ Done |
| UI component | `src/dashboard/task/Task.tsx` | ⬜ Hello-world stub |
| Styles | `src/dashboard/task/task.css` | 🔵 Shell exists, mostly empty |
| Home block ring | `src/dashboard/home/Home.tsx` | ✅ Wired (`/api/tasks`) |

**Current DB schema (`tasks` table):**
```
id, title, description, status, priority, area, due_date, created_at, updated_at
```
Status values: `Not Started | WIP | Struggling | Near Complete | Completed | Archived`
Priority values: `Low | Medium | High`

### 1b. Vault Quest System (how Gal actually thinks)

Projects in `02 Projects/` follow this pattern:
- Each project note has a **goal** (outcome), **next actions** (open checkboxes), and a **backlog**
- Status is expressed as emoji badges: `🔴 P1 Critical`, `🟡 P2 Build Next`, `🟢 P3 Stretch`
- Items have a sense of **priority tiers** (P1/P2/P3), not just Low/Medium/High
- The JARVIS ROADMAP uses **quest-like framing**: missions, phases, critical path vs. stretch
- Tasks are grouped by **area/project**, not flat

**The insight:** The vault treats tasks as *quests with tiers and context*, the dashboard treats them as *flat rows with statuses*. The plan below meets them in the middle.

---

## 2. The Concept — "Quest Board"

Keep the existing schema (no migration needed for Phase 1). Map existing fields onto a quest metaphor:

| DB field | Quest meaning |
|----------|--------------|
| `priority: High` | 🔴 Critical quest |
| `priority: Medium` | 🟡 Active quest |
| `priority: Low` | 🟢 Side quest |
| `area` | Quest category / project group |
| `status` | Quest phase (see below) |
| `description` | Quest objective text |
| `due_date` | Deadline |

**Status → Quest phase mapping:**
```
Not Started    →  ⬜ Uncharted
WIP            →  🔵 In Progress
Struggling     →  🔴 Blocked
Near Complete  →  🟡 Almost There
Completed      →  ✅ Completed
Archived       →  🗄️ Archived
```

The UI shows the quest framing. The DB stores the original strings — no migration, no breaking change.

---

## 3. Screen Layout — Quest Board

```
┌─────────────────────────────────────────────────────────────────┐
│  ✅ משימות                              [+ קווסט חדש]  [↺]     │
│                                                                  │
│  ┌──────────┬──────────┬──────────┬──────────┐                  │
│  │  🔥 3    │  🔵 2    │  ✅ 8    │  🗄️ 1    │  ← stat cards   │
│  │ פעיל     │  בתהליך  │  הושלם   │ ארכיון   │                  │
│  └──────────┴──────────┴──────────┴──────────┘                  │
│                                                                  │
│  ── 🔴 קריטי ────────────────────────────────────────────────   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  🔴  פסיכומטרי — בגרות | ⬜ לא התחיל    [change▾] [✕]  │    │
│  │     Score 600+ by Sep 1. Weekly drill + analogies fix.  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ── 🟡 פעיל ─────────────────────────────────────────────────   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  🟡  רישיון נהיגה | 🔵 בתהליך          [change▾] [✕]  │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  🟡  Jarvis MCP | 🟡 כמעט שם           [change▾] [✕]  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ── 🟢 צד-קווסטים ────────────────────────────────────────────  │
│  ...                                                             │
└─────────────────────────────────────────────────────────────────┘
```

**Key UX decisions:**
- Tasks grouped by priority tier (Critical / Active / Side Quest), not a flat list
- Each card shows: priority glyph, title, area badge, status pill — inline status change
- Completed/Archived collapsed into a toggleable section (not shown by default)
- "Add quest" form slides in from top — same pattern as existing design

---

## 4. Component Map — What Lives Where

```
src/dashboard/task/
├── Task.tsx              ← top-level: fetch, state, layout shell
├── task.css              ← all styles
├── types.ts              ← Task type (already done)
└── components/
    ├── QuestStats.tsx     ← the 4 stat cards row
    ├── QuestTier.tsx      ← one priority tier section (header + list)
    ├── QuestCard.tsx      ← individual task card
    └── AddQuestForm.tsx   ← slide-in add form
```

**Task.tsx responsibilities:**
- `fetch('/api/tasks')` on mount + refresh
- Group tasks by priority tier → pass to QuestTier
- Hold `showForm` state
- Render: header, stats, add form (conditional), tiers, archived toggle

**QuestTier.tsx responsibilities:**
- Receive `tier: 'High' | 'Medium' | 'Low'`, `tasks: Task[]`
- Render tier header with glyph + label
- Map tasks → QuestCard

**QuestCard.tsx responsibilities:**
- Display title, area badge, status pill (inline `<select>` that fires PATCH)
- Expand/collapse description on click
- Delete button (fires DELETE, with confirm)

**AddQuestForm.tsx responsibilities:**
- title (required), description, priority select, area input, due_date
- POST on submit, calls parent's `onAdded(task)` to prepend to list without full refetch

---

## 5. CSS Plan — Extending existing `task.css`

All existing CSS in `task.css` (buttons, form inputs, stat cards) is already written and good.
What's needed on top of it:

```css
/* Priority tier headers */
.quest-tier-header      /* label + glyph + thin rule */
.quest-tier-critical    /* --red glow accent */
.quest-tier-active      /* --accent glow */
.quest-tier-side        /* --muted, lower visual weight */

/* Quest card */
.quest-card             /* extends .task-card, adds left border color by priority */
.quest-card-critical    /* left border: var(--red) */
.quest-card-active      /* left border: var(--accent) */
.quest-card-side        /* left border: var(--muted-2) */

/* Status pill (replaces raw select) */
.quest-status-pill      /* small rounded pill, color-coded per status */
.quest-status--wip      /* --accent */
.quest-status--blocked  /* --red */
.quest-status--almost   /* orange/yellow */
.quest-status--done     /* --green */
.quest-status--unstarted /* --muted */

/* Archived section toggle */
.quest-archived-toggle  /* ghost button, shows "X ארכיון ▾" */
.quest-archived-list    /* hidden by default, animated expand */
```

No CSS variables need changing — uses existing design system.

---

## 6. DB & API — Do We Need Changes?

**Phase 1: No migration needed.**
The current schema covers everything the quest board needs. The quest framing is purely a UI
concern — the DB stores `priority: 'High'` and the UI shows `🔴 קריטי`.

**Phase 2 (optional, future):**
If you want to add vault-linked quests (an `obsidian_path` column to deep-link a task to its
project note), that's a `migrations/003_tasks_vault_link.sql`:
```sql
ALTER TABLE tasks ADD COLUMN obsidian_path TEXT;
```
Then a card with `obsidian_path` set gets an `obsidian://` deep-link button.
This is **not blocking** — skip it for the initial build.

---

## 7. Start Fresh vs. Build on Current?

**Recommendation: Build on current, don't rewrite.**

Reasons:
- The CSS skeleton (`task.css`) already has all buttons, inputs, select styles, and stat cards
- The API is done and tested
- `types.ts` is correct
- `Task.tsx` is a stub — it's essentially blank, so "starting fresh" and "building on it" are
  the same thing

The only thing that changes from the original plan is **layout**: instead of a flat list,
tasks are grouped into tiers. That's additive, not a rewrite.

---

## 8. Implementation TODO List

Work in this order. Each step is self-contained and testable.

### Step 1 — Scaffold component files
- [ ] Create `src/dashboard/task/components/QuestCard.tsx` (stub)
- [ ] Create `src/dashboard/task/components/QuestTier.tsx` (stub)
- [ ] Create `src/dashboard/task/components/QuestStats.tsx` (stub)
- [ ] Create `src/dashboard/task/components/AddQuestForm.tsx` (stub)
- [ ] Update `Task.tsx` to import and render them (with dummy data first)

### Step 2 — Implement QuestStats
- [ ] Count tasks by active/in-progress/completed/archived from props
- [ ] Render the 4 stat cards using existing `.task-stat-card` CSS

### Step 3 — Implement QuestCard
- [ ] Display: left-border color by priority, title, area badge, status pill
- [ ] Inline status PATCH on `<select>` change
- [ ] Click to expand description
- [ ] Delete button with `window.confirm`

### Step 4 — Implement QuestTier
- [ ] Receive `tier` + `tasks[]`
- [ ] Render tier header with glyph (`🔴/🟡/🟢`) and Hebrew label
- [ ] Map tasks to QuestCard
- [ ] Hide tier entirely if `tasks.length === 0`

### Step 5 — Wire Task.tsx
- [ ] `fetch('/api/tasks')` on mount
- [ ] Group tasks: `High → critical`, `Medium → active`, `Low → side`
- [ ] Separate out `Archived` tasks
- [ ] Render: header → stats → tiers (Critical, Active, Side) → archived toggle
- [ ] `showForm` state → AddQuestForm slide-in

### Step 6 — Implement AddQuestForm
- [ ] Fields: title*, priority (default Medium), area, description, due_date
- [ ] POST `/api/tasks` → call `onAdded(newTask)` → close form
- [ ] Error state if POST fails

### Step 7 — Add CSS
- [ ] Quest tier headers (`.quest-tier-*`)
- [ ] Quest card left border colors
- [ ] Status pill styles (`.quest-status-pill`, `.quest-status--*`)
- [ ] Archived section toggle animation

### Step 8 — Verify PATCH + DELETE (from distillation: not yet confirmed)
- [ ] curl test: `PATCH /api/tasks/:id` with `{ "status": "WIP" }`
- [ ] curl test: `DELETE /api/tasks/:id` → 204

### Step 9 — Wire home block ring (already wired in Home.tsx — just needs tasks in DB)
- [ ] Add 2–3 test tasks via POST to confirm ring updates
- [ ] Verify home block shows correct % on `/dashboard`

---

## 9. Open Questions (Decide Before Building)

1. **Hebrew or English labels in the UI?**
   Cards use Hebrew (`קריטי`, `בתהליך`), but status values in the DB are English.
   The mapping happens in the component — no DB change needed either way.

2. **Vault sync (Phase 2)?**
   Do you want tasks in the DB to optionally link to a vault project note (`obsidian://` deep link)?
   Easy to add as `migrations/003` later. Not blocking.

3. **Drag-to-reorder?**
   Not in scope for Phase 1 — status change via the inline select is enough.

4. **Due date urgency coloring?**
   A task with `due_date` within 3 days could get a red date badge. Optional visual touch.

---

## 10. File Reference

| File | Purpose |
|------|---------|
| `src/routes/tasks_screen.ts` | API: GET / POST / PATCH / DELETE |
| `src/dashboard/task/types.ts` | `Task` type definition |
| `src/dashboard/task/Task.tsx` | Root component (stub → build here) |
| `src/dashboard/task/task.css` | All task styles |
| `src/dashboard/shared/shared.css` | Design system (vars, card, header, etc.) |
| `migrations/002_tasks.sql` | DB schema |
| `src/dashboard/home/Home.tsx` | Home block ring (already wired to `/api/tasks`) |

Dashboard port: `3700` · MCP port: `3701`
Run: `npm run dev` + `npm run dev:dashboard` side by side.
