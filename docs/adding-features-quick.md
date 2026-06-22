# Adding Dashboard Features — Quick Reference

Full version with explanations: [adding-features.md](adding-features.md).

## Activate an idea block

1. `src/dashboard/home/components/Home.tsx` → add `href: '/dashboard/<name>'`
   to the block's entry in `IDEA_BLOCKS`.
2. Need a live `%` ring instead of the "בקרוב" badge? Pull that block out of
   `IDEA_BLOCKS` into its own `<HomeBlock icon=... name=... href=... pct={...}>`
   with `useState`/`useEffect` fetching the data — copy the "לימודים" block
   as a template.
3. `npm run build:dashboard` (or leave `npm run dev:dashboard` watching).

## Add a new page

1. `mkdir src/dashboard/<name>/components`
2. Copy the shape of `src/dashboard/study/`:
   - `index.tsx` — mounts your page component, imports `./<name>.css`
   - `<name>.css` — `@import '../shared/shared.css';` + page-specific rules
   - `components/<Name>.tsx` — use `.dashboard` `.header` `.header-title`
     `.back-link` `.card` `.card-title` from shared.css for free
3. `src/routes/dashboard.ts` →
   ```ts
   dashboardRouter.get("/dashboard/<name>", (_req, res) => {
       res.setHeader("Content-Type", "text/html; charset=utf-8");
       res.send(htmlShell("<Title>", "<name>"));
   });
   ```
4. `package.json` → add `<name>=src/dashboard/<name>/index.tsx` to **both**
   `dev:dashboard` and `build:dashboard` esbuild entry lists.
5. `.gitignore` → add `public/<name>.js`, `public/<name>.js.map`, `public/<name>.css`.
6. Link it from `Home.tsx` (`IDEA_BLOCKS` entry or a dedicated `<HomeBlock>`).
7. `npm run build`, then visit `/dashboard/<name>`.

## Gotchas

- **404 on `<name>.js`/`.css`** → missed step 4 (esbuild entry point).
- **No type-checking** → `src/dashboard/` is excluded from `tsc`; only your
  editor catches mistakes there, not `npm run build`.
- **New self-hosted asset `url()` fails to build** → add an `--external:`
  pattern to both esbuild scripts (see existing `--external:/fonts/*`).
- Keep `dir="rtl"` and use `padding-inline-start`/`-end` over `-left`/`-right`.
