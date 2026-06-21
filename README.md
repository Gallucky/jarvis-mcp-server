<div align="center">

<img src="https://mintlify.s3.us-west-1.amazonaws.com/mcp/logo/light.svg" alt="MCP Logo" width="700" />

# jarvis-mcp-server

**A personal MCP server for your Obsidian vault, SQLite database, and filesystem —
accessible from any Claude client, anywhere.**

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](package.json)
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

## Architecture

```
Claude (any device)
        │
        │  HTTPS + OAuth 2.1
        ▼
Tailscale Funnel  ──►  jarvis-mcp-server :3701
                              │
                 ┌────────────┼────────────┐
                 ▼            ▼            ▼
        Obsidian REST    SQLite DB    Filesystem
          :27123        data/jarvis   (allowlist)
```

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

## Requirements

- Node.js ≥ 18
- [Obsidian](https://obsidian.md) with the
  [Local REST API plugin](https://github.com/coddingtonbear/obsidian-local-rest-api) installed
- [Tailscale](https://tailscale.com) with Funnel enabled
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

### 2. Configure `.env`

| Variable | Where to get it |
|---|---|
| `OBSIDIAN_API_KEY` | Obsidian → Settings → Local REST API → copy key |
| `PUBLIC_BASE_URL` | Your Tailscale machine URL, no trailing slash |
| `OAUTH_CLIENT_ID` | Generate: `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"` |
| `OAUTH_CLIENT_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

### 3. Set allowed filesystem paths

Edit `src/constants.ts` and update `FS_ALLOWED_PATHS` to the directories
you want Claude to have access to.

### 4. Build

```bash
npm run build
```

### 5. Expose via Tailscale Funnel

```bash
tailscale funnel --bg 3701
```

### 6. Run (production)

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

### 7. Connect Claude

Settings → Connectors → Add connector → enter your Tailscale URL + `/mcp`

Use `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET` from your `.env` when prompted.

> **Connector icon:** Claude uses Google's favicon service to display connector icons.
> Since this server runs on a Tailscale domain (`*.ts.net`) that Google can't reach,
> the connector will show a generic placeholder icon. This is cosmetic only — everything
> works normally. A custom icon would require pointing a public domain at your server.

---

## Development

```bash
npm run dev      # watch mode — recompiles on save
npm run build    # production build
npm run clean    # remove dist/
```

### Adding tools

Each domain has its own file:

```
src/
├── schemas/      ← Zod input schemas (entrance guards)
├── services/     ← Workers (ObsidianClient, SQLite connection)
├── tools/        ← Tool registrations (vault, sqlite, filesystem, jarvis)
└── utils/        ← Shared helpers (path safety)
```

To add a new tool: define its schema in `schemas/`, implement it in `tools/`,
register it in `buildServer()` in `index.ts`.

---

## Version history

| Version | Notes |
|---|---|
| 1.0.0 | Initial release — Obsidian vault, SQLite, filesystem, OAuth 2.1 over Tailscale |

---

<div align="center">
Built for personal use with the <a href="https://modelcontextprotocol.io">Model Context Protocol</a>
</div>
