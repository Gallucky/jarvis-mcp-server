# Adding Dashboard Features — Detailed Guide

This walks through the two ways you'll extend `/dashboard`: turning an
existing idea block into a real feature, and adding a brand new page from
scratch. For a condensed version, see
[adding-features-quick.md](adding-features-quick.md).

## How the dashboard is put together

```
src/dashboard/
  shared/
    RingChart.tsx      ← the progress-ring SVG, used by any page that needs one
    shared.css         ← fonts, CSS variables, reset, .dashboard/.header/.card/.back-link
  home/
    index.tsx          ← entry point, mounts <Home />
    home.css           ← @import '../shared/shared.css' + home-grid/home-block rules
    components/
      Home.tsx          ← the hub page: header + grid of <HomeBlock>
      HomeBlock.tsx      ← one tile (live link+ring, or unlinked "בקרוב" placeholder)
  study/
    index.tsx, study.css, types.ts
    components/
      Study.tsx, StatCard.tsx, ProgressBar.tsx, Card.tsx
```

Each page (`home`, `study`, and any new one you add) is its **own esbuild
entry point**, compiled to a separate `public/<name>.js` + `public/<name>.css`.
There's no client-side router — every dashboard "page" is a distinct HTML
document served by Express, e.g. `GET /dashboard/study` returns a small HTML
shell that loads `study.js` + `study.css`.

`src/routes/dashboard.ts` has a `htmlShell(title, bundle)` helper that builds
that shell — every route just calls it with the page's title and bundle name.

`src/dashboard/` is intentionally **excluded from the main `tsc` build**
(see `tsconfig.json`'s `exclude`). It has its own `tsconfig.json` purely so
your editor understands JSX/DOM — but `npm run build`'s `tsc` step does not
type-check it, and esbuild (which actually bundles it) doesn't type-check
either. Type mistakes in dashboard code won't fail the build; rely on your
editor's red squiggles while you write it.

---

## Path A: Turn an idea block into a real feature

This is the cheap path — use it whenever the feature already has (or will
have) its own page, and you just need the hub tile to stop being a
placeholder.

1. Open [`src/dashboard/home/components/Home.tsx`](../src/dashboard/home/components/Home.tsx).
2. Find the entry in `IDEA_BLOCKS`, e.g.:
   ```tsx
   const IDEA_BLOCKS = [
     { icon: '✅', name: 'משימות' },
     ...
   ];
   ```
3. **If the feature has no live percentage to show** — just add `href`:
   ```tsx
   { icon: '✅', name: 'משימות', href: '/dashboard/tasks' },
   ```
   `HomeBlock` already handles this: any block with `href` renders as a
   clickable `<a>` instead of a dashed/dimmed placeholder, and `pct == null`
   still shows the "בקרוב" badge unless you also pass a `pct`. If you don't
   want any badge or ring for a plain link, that's a 1-line tweak to
   `HomeBlock.tsx`'s `pct != null ? <RingChart .../> : <badge>` ternary.
4. **If the feature has a live percentage** (like the study tile does),
   `IDEA_BLOCKS` isn't enough — percentages need to be fetched, and
   `IDEA_BLOCKS` is a static list rendered with `.map()`. Pull that block out
   into its own `<HomeBlock>` call with its own state, copying the pattern
   already used for "לימודים":
   ```tsx
   const [tasksPct, setTasksPct] = useState(0);

   useEffect(() => {
     fetch('/api/tasks')
       .then(r => r.json())
       .then(data => setTasksPct(data.pct))
       .catch(() => {});
   }, []);

   // in the JSX, alongside the existing <HomeBlock icon="📚" .../>:
   <HomeBlock icon="✅" name="משימות" href="/dashboard/tasks" pct={tasksPct} />
   ```
   Remove that block's entry from `IDEA_BLOCKS` so it isn't rendered twice.
5. Rebuild: `npm run build:dashboard` (or just leave `npm run dev:dashboard`
   running in watch mode while you edit — it rebuilds on save).
6. Reload `/dashboard`. The tile should now be solid (not dashed), clickable,
   and showing a ring if you wired one up.

---

## Path B: Add a whole new dashboard page

Use this when the feature needs more than a hub tile — its own screen with
real content. `src/dashboard/study/` is the reference implementation; the
steps below recreate that pattern for a new page. Replace `<name>` with a
lowercase route segment (e.g. `tasks`) and `<Name>` with a PascalCase
component name (e.g. `Tasks`).

### 1. Create the folder

```
mkdir src/dashboard/<name>
mkdir src/dashboard/<name>/components
```

### 2. Entry point — `src/dashboard/<name>/index.tsx`

```tsx
import { createRoot } from 'react-dom/client';
import './<name>.css';
import { <Name> } from './components/<Name>';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<<Name> />);
}
```

### 3. Page component — `src/dashboard/<name>/components/<Name>.tsx`

Start minimal — you get `.dashboard`, `.header`, `.header-title`,
`.back-link`, `.card`, `.card-title` for free from `shared.css`:

```tsx
export function <Name>() {
  return (
    <div className="dashboard">
      <div className="header">
        <div>
          <a className="back-link" href="/dashboard">🏠 לוח בקרה</a>
          <div className="header-title">🆕 <Name></div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">בקרוב</div>
        <p>תוכן יופיע כאן.</p>
      </div>
    </div>
  );
}
```

If the page needs its own data (like `study` needs `/api/stats`), fetch it
in a `useEffect` the same way `Study.tsx` and `Home.tsx` already do.

### 4. Stylesheet — `src/dashboard/<name>/<name>.css`

```css
@import '../shared/shared.css';

/* page-specific rules go here */
```

### 5. Express route — `src/routes/dashboard.ts`

Add a route using the existing `htmlShell` helper:

```ts
dashboardRouter.get("/dashboard/<name>", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(htmlShell("<Title>", "<name>"));
});
```

If the page needs its own JSON data, add an API route next to `/api/stats`
in the same file — query `db` (better-sqlite3) and `res.json(...)`.

### 6. New esbuild entry point — `package.json`

Add `<name>=src/dashboard/<name>/index.tsx` to the entry list in **both**
`dev:dashboard` and `build:dashboard`:

```json
"dev:dashboard": "esbuild home=src/dashboard/home/index.tsx study=src/dashboard/study/index.tsx <name>=src/dashboard/<name>/index.tsx --bundle --outdir=public --jsx=automatic --target=es2020 --charset=utf8 --external:/fonts/* --sourcemap --watch",
"build:dashboard": "esbuild home=src/dashboard/home/index.tsx study=src/dashboard/study/index.tsx <name>=src/dashboard/<name>/index.tsx --bundle --minify --outdir=public --jsx=automatic --target=es2020 --charset=utf8 --external:/fonts/*",
```

Forgetting this step is the most common mistake — without it, `/dashboard/<name>`
will load but its `<name>.js`/`<name>.css` will 404 (check the browser's
Network tab).

### 7. Ignore the new build artifacts — `.gitignore`

```
public/<name>.js
public/<name>.js.map
public/<name>.css
```

(`public/<name>.js`/`.css` are generated by `npm run build:dashboard`, not
hand-written — same treatment as `home.js`/`study.js`.)

### 8. Link it from the hub

In `Home.tsx`, either add `href: '/dashboard/<name>'` to an `IDEA_BLOCKS`
entry, or add a dedicated `<HomeBlock>` call if it needs a live `pct` (see
Path A, step 4).

### 9. Build and verify

```bash
npm run build
```

Then run the server however you normally do (PM2, or
`TRANSPORT=http node dist/index.js` for a quick local check) and visit
`/dashboard/<name>`.

---

## Reusable pieces (from `shared.css`)

| Class | What it gives you |
|---|---|
| `.dashboard` | Centered, max-width container — wrap every page's root `<div>` in this |
| `.header`, `.header-title`, `.header-sync` | The standard page header row |
| `.back-link` | The "🏠 לוח בקרה" link back to the hub |
| `.card`, `.card-title` | A bordered panel with hover effect and a small uppercase title |
| `.ring-chart`, `.ring-chart-progress` | Hover-scale + transition classes used by `RingChart.tsx` |

CSS variables you can reuse instead of hardcoding hex colors: `--bg`,
`--card-bg`, `--border`, `--border-hover`, `--text`, `--muted`, `--muted-2`,
`--accent`, `--green`, `--red`, `--radius`.

`RingChart` itself (`src/dashboard/shared/RingChart.tsx`) takes `pct` and an
optional `size` — import it from `../../shared/RingChart` from any page's
components folder.

## Common pitfalls

- **New page 404s on its `.js`/`.css`** — you forgot step 6 (the esbuild
  entry point in `package.json`). Check the browser Network tab.
- **No type errors during `npm run build`, but the page is broken** —
  `src/dashboard/` isn't type-checked by `tsc`. Watch your editor while you
  write dashboard code, since the build won't catch type mistakes for you.
- **A new local CSS `url()` (e.g. a new self-hosted asset) fails to build**
  — esbuild tries to resolve root-relative `url()` paths from disk by
  default. If you add a new absolute asset path beyond the existing
  `/fonts/*`, add a matching `--external:` pattern to both esbuild scripts
  in `package.json`.
- **Text looks wrong in RTL** — keep `dir="rtl"` (already set by
  `htmlShell()`), and prefer logical CSS properties (`padding-inline-start`
  instead of `padding-left`/`padding-right`) for anything where left/right
  actually matters, so it doesn't flip incorrectly.

## File checklist for a new page

- [ ] `src/dashboard/<name>/index.tsx`
- [ ] `src/dashboard/<name>/<name>.css`
- [ ] `src/dashboard/<name>/components/<Name>.tsx`
- [ ] `src/routes/dashboard.ts` — new route(s)
- [ ] `package.json` — new esbuild entry point (both `dev:dashboard` and `build:dashboard`)
- [ ] `.gitignore` — new build artifact patterns
- [ ] `src/dashboard/home/components/Home.tsx` — link from the hub
