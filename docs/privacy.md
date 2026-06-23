# Privacy & Data Separation

## What git tracks
Only source code, migrations (schema only, no data), public assets, and config examples.

## What git never touches
| File/Pattern | Why excluded | Where it lives |
|---|---|---|
| `.env` | OAuth secrets, API keys, Tailscale config | Mini PC only |
| `data/*.db`, `data/*.db-shm`, `data/*.db-wal` | Personal psychometric exercise data | Mini PC only |
| `data/real-backup/` | Permanent snapshot of real data (see below) | Mini PC only |
| `data/.fuse_hidden*` | Linux VFS artifacts | Mini PC only |
| `*.log` / `logs/` | Runtime logs | Mini PC only |
| `node_modules/`, `dist/`, `public/*.js/css` | Build artifacts | Regenerated on build |

## What SyncThing/SyncTrayzor handles
Only the **Obsidian Vault** (`<Vault-Folder-Path>`) is synced via SyncThing across devices.
This includes Claude usage logs (`_AI-SPACE/claude-usage/`), distillations, and all notes.
The jarvis-mcp-server itself is NOT synced — it lives permanently on the mini PC and is accessed remotely via Tailscale.

## Fresh machine setup
1. `git clone https://github.com/Gallucky/jarvis-mcp-server.git`
2. `npm install`
3. Copy `.env.example` → `.env` and fill in real values
4. `npm run migrate` — creates DB schema (table is empty at this point)
5. Optionally load data into the empty table — pick one:
   - `npm run seed:dev` — fake data for development, no real data involved at all
   - `npm run db:restore-real` — your own real data, if you've copied a `data/real-backup/jarvis.db` snapshot onto this machine (e.g. via a USB drive, your own sync tool, etc. — it never travels through git)
6. `npm run dev` + `npm run dev:dashboard`

## Switching between real and fake data locally
Two scripts manage a permanent, gitignored snapshot of your real data at `data/real-backup/jarvis.db`,
separate from whatever is currently loaded into the live `data/jarvis.db`:

- `npm run db:backup-real` — snapshots the **active** database into `data/real-backup/jarvis.db`.
  Run this while your real data is loaded, to save it aside. Uses SQLite's own online-backup API
  (`db.backup()`), not a raw file copy, so it's safe to run even while the server is up.
- `npm run db:restore-real` — copies rows from `data/real-backup/jarvis.db` back into the active
  database via SQL (`DELETE` + `INSERT` through the existing connection), overwriting whatever is
  currently loaded (real or fake).
- `npm run seed:dev` — wipes the active database and loads fake data. Run `db:backup-real` first
  if you want your real data preserved before doing this.

**Do not restore by copying `.db`/`-wal`/`-shm` files directly while the server is running** — the
server holds those files open (especially `-shm`), and a partial file-level copy can leave the
three files mutually inconsistent and unreadable. The two scripts above go through SQLite properly
and avoid this; restart the server afterward so it picks up the change cleanly.
