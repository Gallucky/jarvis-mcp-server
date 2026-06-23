<div align="center">

<img src="https://mintlify.s3.us-west-1.amazonaws.com/mcp/logo/light.svg" alt="MCP Logo" width="700" />

# jarvis-mcp-server

**A personal MCP server for your Obsidian vault, SQLite database, and filesystem —
accessible from any Claude client, anywhere.**

[![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)](package.json)
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
> rejected before any I/O runs.

---

## Dashboard

A bundled React app, served as plain HTML/JS — no Claude or OAuth needed, just open it
in a browser:

| Page | Shows |
|---|---|
| `/dashboard` | Home hub — a grid of blocks linking to the pages below, plus placeholders for future tools |
| `/dashboard/study` | Psychometric homework progress: completion % by section/lesson/topic |
| `/dashboard/claude` | Claude usage: daily/weekly token progress bars, cost estimates, session history |

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
- `CLAUDE_USAGE_DIR` — where the dashboard's Claude-usage JSONL logs live (only needed if you use that page)
- `CLAUDE_LIMITS` — your daily/weekly token caps shown on that page

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

```bash
npm install -g pm2
pm2 start dist/index.js --name jarvis-mcp
pm2 save
```

[PM2](https://pm2.keymetrics.io/) is a process manager for Node.js. It keeps your server
running in the background without a terminal window open, automatically restarts it if it
crashes, and lets you check its status at any time with `pm2 status`.

> **Why not just `npm start`?**
> Running `npm start` directly ties the server to your terminal session — close the window
> and the server dies. PM2 runs it as a background daemon that survives terminal closures.

#### ⚙️ Optional: Auto-start on Windows boot

By default PM2 itself doesn't survive a reboot on Windows. To fix that, this repo includes
`pm2-start.bat` — a one-line script that tells PM2 to restore your saved process list:

```bat
pm2 resurrect
```

To make the server start automatically every time Windows boots:

1. Press `Win + R`, type `taskschd.msc`, press Enter
2. Click **Create Basic Task**
3. **Name:** `jarvis-mcp-server` (or anything you like)
4. **Trigger:** When the computer starts
5. **Action:** Start a program → browse to `pm2-start.bat` in this repo
6. Finish

Now the server comes back online automatically after every reboot — no manual intervention needed.

### 8. Connect Claude

Settings → Connectors → Add connector → enter your Tailscale URL + `/mcp`

Use `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET` from your `.env` when prompted.

> **Connector icon:** Claude uses Google's favicon service to display connector icons.
> Since this server runs on a Tailscale domain (`*.ts.net`) that Google can't reach,
> the connector will show a generic placeholder icon. This is cosmetic only — everything
> works normally. A custom icon would require pointing a public domain at your server.

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
| 1.2.0 | Claude usage dashboard (`/dashboard/claude`); futuristic glass restyle across all dashboard pages; fixed a topics-table bug that silently merged same-named topics across different sections; security hardening — pre-commit hook blocking secrets/data, git history audit, gitignore hardening, `data/real-backup/` snapshot + restore scripts, `seed:dev` for fake dev data, `docs/privacy.md` |
| 1.1.0 | Rebuilt the dashboard as a bundled React app with an OS-hub home page and a study-progress tracker |
| 1.0.0 | Initial release — Obsidian vault, SQLite, filesystem, OAuth 2.1 over Tailscale |

---

<div align="center">
Built for personal use with the <a href="https://modelcontextprotocol.io">Model Context Protocol</a>
</div>
