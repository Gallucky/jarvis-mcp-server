# jarvis-mcp-server

Personal MCP server running on a home mini PC, exposed via Tailscale. Built with TypeScript + Express + better-sqlite3.

## Stack
- `src/index.ts` — Express server, OAuth 2.1, MCP transport
- `src/tools/` — one file per domain: `vault.ts`, `sqlite.ts`, `filesystem.ts`, `jarvis.ts`, `study/psychometric.ts`
- `src/services/db.ts` — single better-sqlite3 connection to `data/jarvis.db`
- `src/services/obsidianClient.ts` — wraps Obsidian Local REST API
- `src/routes/dashboard.ts` — `/dashboard` (home hub HTML shell), `/dashboard/study` (study HTML shell) + `/api/stats` (JSON)
- `src/dashboard/` — React UI source: `home/` (OS hub), `study/` (study tracker), `shared/` (RingChart, shared.css) — two esbuild entry points bundled into `public/home.{js,css}` and `public/study.{js,css}`
- `src/scripts/syncCheckboxes.ts` — parses vault homework markdown → SQLite
- `src/scripts/migrate.ts` — applies SQL files from `migrations/`
- `migrations/` — numbered `.sql` files (currently: `001_exercise_completions.sql`)

## Key conventions
- New tool domain → new file in `src/tools/`, matching schema in `src/schemas/`, register in `buildServer()` in `index.ts`
- New DB table → new file in `migrations/`, run `npm run migrate`
- Path safety: all `fs_*` tools run through `src/utils/pathSafety.ts` (allowlist in `src/constants.ts`)
- Dashboard is two real React apps under `src/dashboard/{home,study}/`, sharing `src/dashboard/shared/` (RingChart component, shared.css with fonts/reset/card/ring rules via `@import`). Bundled locally with esbuild (two named entry points, `home=...` and `study=...`) — no CDN dependency, works with no outbound internet access. `src/routes/dashboard.ts` only serves HTML shells + JSON API; `src/dashboard/` is excluded from the main `tsc` build (`tsconfig.json` excludes it; that folder has its own `tsconfig.json` for editor JSX/DOM support)
- `/dashboard` is the OS-level hub: a grid of blocks (`home/components/HomeBlock.tsx`). Each block is either a live link (`href` set, e.g. the study tracker with its progress ring) or an unlinked "בקרוב" (coming soon) placeholder for future tools (`home/components/Home.tsx`'s `IDEA_BLOCKS` array) — turning a placeholder into a real feature is just adding `href`/`pct` to its entry
- Dashboard font is self-hosted Rubik (`public/fonts/Rubik-{hebrew,latin}.woff2`, committed to the repo — not a build artifact; only `home.{js,css}`/`study.{js,css}` are gitignored). `shared.css` holds the `@font-face` rules; esbuild's `--external:/fonts/*` keeps those `url()` paths root-relative instead of trying to resolve them on disk
- The study page's "לפי שיעור" lesson tiles link to `obsidian://open?vault=...&file=...` using the hardcoded `VAULT_NAME` in `study/components/Study.tsx` — update it if the vault is ever renamed

## Scripts
```
npm run dev             # tsx watch — auto-restarts server on save
npm run dev:dashboard   # esbuild --watch — rebuilds public/{home,study}.{js,css} on save (run alongside npm run dev)
npm run build           # tsc + dashboard bundles
npm run build:dashboard # esbuild bundles only (minified, no watch)
npm run migrate         # apply pending migrations
npm run sync:study      # parse vault homework files → exercise_completions table
```

## Current features
- Obsidian vault CRUD (read, write, append, list, search)
- Raw SQLite access (query, execute, list tables, describe)
- Filesystem ops (read, write, append, list, move, delete) — path-allowlisted
- `jarvis_create_distillation` — saves conversation distillations to vault
- `jarvis_sync_study_progress` — triggers syncCheckboxes script
- `/dashboard` — OS hub dashboard; `/dashboard/study` — study progress dashboard (React, dark theme, RTL Hebrew)

## DB schema (jarvis.db)
```sql
exercise_completions (
  id, note_path, lesson_number, area, section, zone,
  topic, exercise_set, completed, url, synced_at
)
```
Populated from: `C:/Gal's Obsidian Vault/01 Notes/Psychometric/Lessons/Homework/*.md`

`section` defaults to the note's frontmatter `section:` value but can be overridden
per checkbox-group by its heading text (any `#` depth — Lesson 15 uses `###` for
some zones, others use `##`). `syncCheckboxes.ts`'s `classifyHeader()` recognizes:
- `(פרק X)` or the section name appearing bare in the heading (e.g. `אנגלית`) →
  `section = X` for that chunk
- `(תחת X)` → `zone = X`, discarding the heading's own label (e.g. a "גרפים"
  heading marked `(תחת קושיות)` files those checkboxes under zone `קושיות`)
- Headings matching `STRUCTURAL_HEADER_MARKERS` (`שיעורי בית`, `הכנה לשיעור`,
  `אוצר מילים`, `חיזוק`) are assignment-category labels, not zones — skipped
  regardless of heading depth

`LESSON_FOLDERS` only scans `01 Notes/.../Homework/` — if a folder is ever removed
from that list (as `00 Inbox/_temp-backup/` was at some point), `deleteByPath` won't
clean up its rows since it only deletes paths it's about to re-insert. Check for
orphaned `note_path` prefixes after restructuring vault folders.

## Vault paths
- Homework files: `01 Notes/Psychometric/Lessons/Homework/`
- Distillations: `_AI-SPACE/Distillations/`
- Allowed FS paths: `C:/Gal's Obsidian Vault`, `C:/jarvis-mcp-server`
