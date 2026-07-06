<div align="center">

<img src="https://mintlify.s3.us-west-1.amazonaws.com/mcp/logo/light.svg" alt="MCP Logo" width="700" />

# jarvis-mcp-server

**A personal MCP server for your Obsidian vault, SQLite database, and filesystem —
accessible from any Claude client, anywhere.**

[![Version](https://img.shields.io/badge/version-1.8.0-blue.svg)](package.json)
[![MCP](https://img.shields.io/badge/protocol-MCP-8A2BE2)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Node](https://img.shields.io/badge/Node.js-≥18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

</div>

---

## What it does

Runs on your home server and exposes a set of tools to Claude via the
[Model Context Protocol](https://modelcontextprotocol.io). Claude on any device —
mobile, web, desktop — can read and write your Obsidian vault, query a local
SQLite database, and manage files, all authenticated via OAuth 2.1 over Tailscale.

It also bundles a small **web dashboard** (a real React app, no build step needed
beyond `npm run build`) for glancing at your own data in a browser: a home hub, a
study-progress tracker, and a Claude usage tracker.

## Architecture

```
Claude (any device)                          Your browser
        │                                          │
        │  HTTPS + OAuth 2.1                       │  HTTPS, no auth
        ▼                                          ▼
Tailscale Funnel/Serve  ──►  jarvis-mcp-server :3701
                                    │
                       ┌────────────┼────────────┐
                       ▼            ▼            ▼
              Obsidian REST    SQLite DB    Filesystem
                :27123        data/jarvis   (allowlist)
```

> **Note:** the dashboard branch is unauthenticated by design (see
> [Dashboard](#dashboard) below) — what that means for exposure depends on
> whether you use Funnel or Serve. See [Tailscale setup](#tailscale-setup).

---

## Tools

### 📓 Obsidian Vault
| Tool | Description |
|---|---|
| `jarvis_read_note` | Read a note's full content |
| `jarvis_create_note` | Create or overwrite a note |
| `jarvis_append_note` | Append content to an existing note |
| `jarvis_list_notes` | List files in a vault folder |
| `jarvis_search_vault` | Full-text search across the vault |

### 🤖 Jarvis Workflows
| Tool | Description |
|---|---|
| `jarvis_create_distillation` | Save a conversation distillation to the vault |
| `sync_psychometric_study_progress` | Parse homework markdown checkboxes in the vault and sync completion data into SQLite |

### 🗄️ SQLite Database
| Tool | Description |
|---|---|
| `db_query` | Run a SELECT query |
| `db_execute` | Run INSERT / UPDATE / DELETE |
| `db_list_tables` | List all tables |
| `db_describe_table` | Show columns and types for a table |

### 📁 Filesystem
| Tool | Description |
|---|---|
| `fs_read_file` | Read a file (with optional line limit) |
| `fs_write_file` | Write / overwrite a file |
| `fs_append_file` | Append to a file |
| `fs_list_dir` | List directory contents (optionally recursive) |
| `fs_move_file` | Move or rename a file/folder |
| `fs_delete_file` | Delete a file or folder (requires `confirm: true`) |

> **Security:** All filesystem operations are restricted to directories listed in
> `FS_ALLOWED_PATHS` in `src/constants.ts`. Paths outside this allowlist are
> rejected before any I/O runs — and `.env`/`.git` are denied even inside an allowed
> directory (see `src/utils/pathSafety.ts`).

---

## Dashboard

A bundled React app, served as plain HTML/JS — no Claude or OAuth needed, just open it
in a browser:

| Page | Shows |
|---|---|
| `/dashboard` | Home hub — a grid of blocks linking to the pages below, plus placeholders for future tools |
| `/dashboard/study` | Psychometric homework progress: completion % by section/lesson/topic |
| `/dashboard/claude` | Claude Analytics — a multi-page app (Overview, Projects, Sessions, Costs) covering both Claude Code and Cowork usage: token/cost trends, model breakdown, activity heatmap, self-calibrating rate-limit bars, per-session conversation/token detail |

> ⚠️ **These routes are not behind the OAuth layer.** They're mounted before the
> auth middleware in `src/index.ts`, so anyone who can reach the server over the
> network can view them — no login required. That's fine on a private network or
> behind `tailscale serve` (tailnet-only). **If you expose the server via
> `tailscale funnel`, your dashboard — including real progress data and Claude
> session titles/costs — becomes viewable by anyone on the public internet who
> has the URL.** See [Tailscale setup](#tailscale-setup) for how to avoid that.

---

## Requirements

- Node.js ≥ 18
- [Obsidian](https://obsidian.md) with the
  [Local REST API plugin](https://github.com/coddingtonbear/obsidian-local-rest-api) installed
- [Tailscale](https://tailscale.com) — see [Tailscale setup](#tailscale-setup) for the
  Serve-vs-Funnel choice and how to avoid exposing personal data
- A machine that stays on (home server, mini PC, etc.)

---

## Setup

### 1. Install

```bash
git clone https://github.com/your-username/jarvis-mcp-server.git
cd jarvis-mcp-server
npm install
cp .env.example .env
```

`npm install` also wires up a pre-commit hook (via `core.hooksPath`) that blocks
accidentally committing `.env`, `*.db` files, or anything else that shouldn't leave
your machine — see [Privacy & data separation](#privacy--data-separation).

### 2. Configure `.env`

| Variable | Where to get it |
|---|---|
| `OBSIDIAN_API_KEY` | Obsidian → Settings → Local REST API → copy key |
| `PUBLIC_BASE_URL` | Your Tailscale machine URL — see [Tailscale setup](#tailscale-setup). Never commit this anywhere public. |
| `OAUTH_CLIENT_ID` | Generate: `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"` |
| `OAUTH_CLIENT_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

### 3. Configure constants

Edit `src/constants.ts`:
- `FS_ALLOWED_PATHS` — directories you want Claude's filesystem tools to access
- `CLAUDE_USAGE_DIR` — where the dashboard's Cowork usage JSONL logs live (Claude Code's own logs are read directly from `~/.claude/projects/`)
- `CLAUDE_LIMITS` / `COWORK_LIMITS` — floors for the dashboard's rate-limit bars. Anthropic doesn't publish exact Claude Code token quotas, so these are only a starting point — the dashboard raises the effective limit automatically once it has enough usage history (see `src/services/claudeData/overview.ts`)

### 4. Create the database

```bash
npm run migrate
```

Creates the SQLite schema with an empty table. To put something in it, either:
- `npm run seed:dev` — fake data, safe to run anytime, no real data involved
- `npm run db:restore-real` — your own real data, if you have a `data/real-backup/jarvis.db`
  snapshot from another machine (copied over by hand — it never goes through git)

### 5. Build

```bash
npm run build
```

### 6. Tailscale setup

This is the part that decides whether anything here is reachable from outside your own
network — read this before exposing anything.

**Install Tailscale** on the machine running this server and sign in
([tailscale.com/download](https://tailscale.com/download); free tier covers personal use).
Every device on your tailnet gets a private name like
`<machine-name>.<your-tailnet-name>.ts.net` and a stable private IP. None of this is public
by default.

**Then pick one:**

| | `tailscale serve` | `tailscale funnel` |
|---|---|---|
| Reachable from | Only devices already on **your** tailnet | Anyone on the public internet who has the URL |
| Use when | Every device you'll run Claude from (phone, laptop) can join your tailnet | You need access from a device that can't join your tailnet |
| Dashboard exposure | None — stays private | Public, since dashboard routes aren't authenticated (see [Dashboard](#dashboard)) |

If you can, prefer Serve — it keeps this server, including the dashboard, entirely off
the public internet:

```bash
tailscale serve --bg 3701
```

Otherwise, Funnel:

```bash
tailscale funnel --bg 3701
```

**Get your URL** with `tailscale status` or the
[admin console](https://login.tailscale.com/admin/machines) — it'll look like
`https://<your-machine-name>.<your-tailnet-name>.ts.net`. This is specific to your account.
**Don't paste it into a public README, issue, or commit** — it only belongs in your own
`.env` as `PUBLIC_BASE_URL` (already gitignored).

**Optional, recommended:** in the admin console → **Settings → Device management**, enable
**"Require approval for new devices"**, so nothing joins your tailnet without you explicitly
approving it.

### 7. Run (production)

This repo includes `pm2-start.bat` — a one-time setup script. Run it once, and again any
time you've reinstalled or uninstalled PM2:

```bat
:: installation run once / run after uninstalling.

npm install -g pm2
cd C:\jarvis-mcp-server
pm2 start dist/index.js --name jarvis-mcp
pm2 save
```

[PM2](https://pm2.keymetrics.io/) is a process manager for Node.js. It keeps your server
running in the background without a terminal window open, automatically restarts it if it
crashes, and lets you check its status at any time with `pm2 status`. The final `pm2 save`
step matters more than it looks — it's what lets `pm2 resurrect` (below) restore the process
after a reboot. Without it, resurrect has nothing to restore.

> **Why not just `npm start`?**
> Running `npm start` directly ties the server to your terminal session — close the window
> and the server dies. PM2 runs it as a background daemon that survives terminal closures.

#### ⚙️ Auto-start on Windows boot

By default PM2 itself doesn't survive a reboot on Windows. This repo includes a second,
separate one-line script for that — `pm2-resurrect.bat`:

```bat
pm2 resurrect
```

To make the server start automatically every time you log into Windows:

1. Press `Win + R`, type `shell:startup`, press Enter — this opens your Startup folder
2. Create a shortcut to `pm2-resurrect.bat` inside that folder (right-click the file →
   Create shortcut, then move the shortcut into the Startup folder)

Now the server comes back online automatically every time you log in — no manual
intervention needed, as long as the `pm2 save` from step 7 is up to date.

> **Why two separate scripts?** `pm2-start.bat` does a full `pm2 start` + `pm2 save` — you
> only run it once, or after PM2 itself has been reinstalled/removed. `pm2-resurrect.bat`
> just restores whatever was already saved — it's meant to run unattended, every boot, via
> the shortcut above.

> **Note:** `shell:startup` only fires on an interactive login, not on a fully unattended
> reboot (e.g. an overnight Windows Update restart where nobody logs in). A Windows-Service
> approach like [pm2-installer](https://github.com/jessety/pm2-installer) can cover that gap,
> but trades this simplicity for its own gotchas (service-account file permissions on this
> project's folders, a less reliable built-in auto-resurrect in practice, and npm global
> config that's easy to leave half-reverted if you ever switch back). For a machine you log
> into regularly, `shell:startup` + `pm2-resurrect.bat` is the simpler, more predictable
> choice.

### 8. Connect Claude

Settings → Connectors → Add connector → enter your Tailscale URL + `/mcp`

Use `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET` from your `.env` when prompted.

> **Connector icon:** Claude uses Google's favicon service to display connector icons.
> Since this server runs on a Tailscale domain (`*.ts.net`) that Google can't reach,
> the connector will show a generic placeholder icon. This is cosmetic only — everything
> works normally. A custom icon would require pointing a public domain at your server.

---

## Updating

This repo includes `restart-server.ps1` — a small PowerShell script that rebuilds and
restarts the server in one step:

```powershell
cd C:\jarvis-mcp-server
npm run build
pm2 restart jarvis-mcp
pm2 save
```

Full routine flow for deploying a code change:

```bash
cd C:\jarvis-mcp-server
git pull
npm install          # only strictly needed if package.json changed
.\restart-server.ps1  # build + restart + save, in one step
pm2 list              # confirm status: online, fresh uptime
```

> **PowerShell execution policy:** if double-clicking `restart-server.ps1` opens it in a
> text editor instead of running it, or you get a "running scripts is disabled" error,
> either right-click → **Run with PowerShell**, or set the policy once:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

Neither `pm2-start.bat` nor `pm2-resurrect.bat` need to change for a routine update — they
handle first-time install and boot-time resurrect respectively, not deploying new code.
`restart-server.ps1` deliberately doesn't do `git pull`/`npm install` — those are only
needed sometimes (pulling remote changes, or after adding a dependency) — run them first
when relevant, then let the script handle the build/restart/save every time.

**Always let `pm2 save` run after `pm2 restart`** (the script does this for you). PM2 does
not persist the running process list on its own — if the machine reboots after a restart
but before a save, `pm2 resurrect` restores the *last saved* version, which may not include
your update, or in the worst case nothing at all.

> ### ⚠️ Required last step: reconnect Claude
> OAuth clients and tokens in this server are held in memory by design (see the comment at
> the top of `src/services/oauthProvider.ts`), not persisted to disk — so **every** restart,
> including a routine update via `restart-server.ps1`, invalidates Claude's existing
> connection. After running the script (or any `pm2 restart`), always:
> 1. Confirm the server actually came back: `pm2 list` shows `jarvis-mcp` `online`.
> 2. In Claude → **Settings → Connectors**, reconnect this connector.
> 3. Verify with a quick tool call (e.g. `fs_list_dir` or `jarvis_search_vault`) before
>    considering the update done.
>
> Persisting the OAuth store to disk would remove this step entirely; as of this writing
> it hasn't been built yet — see [Development](#development) if you want to tackle it.

See [Run (production)](#7-run-production) above for the one-time install, and
[Auto-start on Windows boot](#️-auto-start-on-windows-boot) for what happens after a reboot.

---

## Privacy & data separation

Full details in [`docs/privacy.md`](docs/privacy.md). Summary:

- **Git never sees real data.** `.env`, `*.db`/`*.db-shm`/`*.db-wal`, and
  `data/real-backup/` are gitignored, confirmed clean across the entire git history
  (not just the working tree), and enforced going forward by a pre-commit hook that
  blocks staging them even with `git add -f`.
- **Fresh clones start empty or fake**, never with your data — `npm run migrate` creates
  an empty schema, `npm run seed:dev` optionally fills it with fake rows.
- **Your real data lives only on your machine**, snapshotted on demand with
  `npm run db:backup-real` / restored with `npm run db:restore-real`, both going through
  SQLite directly (not raw file copies, which can corrupt a database that's open elsewhere).
- **Only your Obsidian vault syncs across devices** (via SyncThing or similar) — this
  server and its database do not; they live permanently on whichever machine you deploy to.
- **Filesystem tools deny `.env`/`.git` explicitly** (`src/utils/pathSafety.ts`), even though
  the project root is itself in `FS_ALLOWED_PATHS` — without that, `fs_read_file` could read
  every secret in `.env` in one call.

---

## Development

```bash
npm run dev             # watch mode — recompiles the server on save
npm run dev:dashboard   # watch mode — rebuilds dashboard bundles on save (run alongside npm run dev)
npm run build           # production build (server + dashboard)
npm run clean           # remove dist/
```

### Adding tools

Each domain has its own file:

```
src/
├── schemas/      ← Zod input schemas (entrance guards)
├── services/     ← Workers (ObsidianClient, SQLite connection)
├── tools/        ← Tool registrations (vault, sqlite, filesystem, jarvis, study)
└── utils/        ← Shared helpers (path safety)
```

To add a new tool: define its schema in `schemas/`, implement it in `tools/`,
register it in `buildServer()` in `index.ts`.

### Adding dashboard pages

See [`docs/adding-features-quick.md`](docs/adding-features-quick.md) for the exact steps
(new page bundle, route, esbuild entry, `.gitignore` entry).

---

## Version history

| Version | Notes |
|---|---|
| 1.3.0 | Rebuilt `/dashboard/claude` as a full multi-page Claude Analytics app (Overview, Projects, Sessions, Costs) covering Claude Code + Cowork; new Cowork usage-log format (per-session + daily-index files, with a migration script) replacing the old per-date files; fixed the headline token count counting repeatedly-recounted `cache_read` tokens as new usage; rate-limit bars now self-calibrate from your own usage history instead of a fixed guess; responsive/overflow fixes so charts fit at 100% zoom on desktop through mobile |
| 1.2.0 | Claude usage dashboard (`/dashboard/claude`); futuristic glass restyle across all dashboard pages; fixed a topics-table bug that silently merged same-named topics across different sections; security hardening — pre-commit hook blocking secrets/data, git history audit, gitignore hardening, `data/real-backup/` snapshot + restore scripts, `seed:dev` for fake dev data, `docs/privacy.md` |
| 1.1.0 | Rebuilt the dashboard as a bundled React app with an OS-hub home page and a study-progress tracker |
| 1.0.0 | Initial release — Obsidian vault, SQLite, filesystem, OAuth 2.1 over Tailscale |

---

<div align="center">
Built for personal use with the <a href="https://modelcontextprotocol.io">Model Context Protocol</a>
</div>
