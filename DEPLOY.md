# Skill: Deploy a Vite + React + API project to Cloudflare from GitHub

A reusable playbook so the next deploy is boring. Read top to bottom the first time, then jump to the checklist for repeat use.

## Decision 0: Pick the product before writing any config

Cloudflare offers two ways to host a static site with a JSON API. Choose once, then commit. Mixing them wastes hours.

**Pages** — best for: standard "static site + a few API endpoints" projects with simple file-based routing. API endpoints live in `functions/api/*.js` as `export async function onRequestGet()`. Cloudflare auto-routes them. URL ends in `.pages.dev`.

**Worker with static assets** — best for: more control over routing, middleware, or if you want everything as one Worker. API endpoints live inside a single `worker.js` entry with explicit URL matching. URL ends in `.workers.dev`.

For most React dashboards: **pick Pages**. It's simpler. Only pick Worker if you have a specific reason.

When you create the project in Cloudflare, the dashboard flow has visual tabs — make sure you click the **Pages** tab, not Workers. If Cloudflare hides the Pages flow in your account view (some new accounts), create it via CLI instead:

```bash
npx wrangler pages project create my-dashboard --production-branch main
```

That guarantees a Pages project regardless of dashboard UI changes.

## Project structure (Pages version)

```
my-dashboard/
├── src/                      # React source
├── functions/
│   └── api/
│       └── crypto.js         # export async function onRequestGet() {...}
├── public/
├── dist/                     # gitignored — Vite build output
├── .wrangler/                # gitignored — local wrangler state
├── wrangler.jsonc            # the only Cloudflare config file
├── package.json
└── vite.config.js
```

## `wrangler.jsonc` (Pages, copy verbatim and edit two lines)

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "my-dashboard",
  "pages_build_output_dir": "./dist",
  "compatibility_date": "2025-10-01"
}
```

Two things to edit:

- `name` — must match the project name in Cloudflare dashboard exactly
- `compatibility_date` — pick a recent past date (not today, never the future)

That's it. Don't add fields you don't need. Never have both `wrangler.toml` and `wrangler.jsonc` at the same time.

## `.gitignore` essentials

```
node_modules
dist
.wrangler
*.local
```

## Local sanity check before pushing

The ritual that prevents 90% of failures:

```bash
# 1. Build cleanly
npm run build

# 2. Confirm wrangler accepts your config (this catches missing fields)
CLOUDFLARE_API_TOKEN=fake CLOUDFLARE_ACCOUNT_ID=fake \
  npx wrangler@latest pages deploy dist --project-name my-dashboard 2>&1 | head -20
```

If you see `Received a malformed response from the API ... Host not in allowlist`, **good** — config is valid, only auth failed (expected with a fake token).

If you see `Missing top-level field "name"` or any other config-related error, **stop**. Fix it locally before pushing. You will not magically have better luck on Cloudflare's CI.

## Connect to Cloudflare (Pages, dashboard flow)

1. Cloudflare dashboard → **Workers & Pages** → **Create**
2. Click the **Pages** tab (verify it says Pages, not Workers — check the URL hint: `*.pages.dev` should appear in the project name preview)
3. **Connect to Git** → authorize → select your GitHub repo
4. Settings:
   - Production branch: `main` (must match your repo's default)
   - Framework preset: `Vite` (or None — both work)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `/`
   - Leave deploy command **empty** — Cloudflare handles it
5. Save & Deploy

Don't manually set `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` env vars on the project. The Git integration handles auth itself. Manual tokens cause the misleading "Authentication error 10000".

## Verify each deploy with the 30-second smoke test

After every deploy, in order:

1. **Open the `.pages.dev` URL** — page renders, no console errors
2. **Hit the API directly in the browser:** `https://my-dashboard.pages.dev/api/crypto` — should return JSON, not HTML. If it returns HTML, the function isn't routing (it fell through to the SPA index)
3. **Click through the app's interactive flows** — confirm API calls succeed in the network tab

If step 2 fails on a Pages project, the most common causes: file is in `src/api/` instead of `functions/api/`, the function exports the wrong handler name (must be `onRequestGet`/`onRequestPost`/`onRequest`), or the `functions/` directory got accidentally `.gitignore`d.

## The Codespaces / Git discipline rule

This is the one thing that trips people up the most, so it gets its own section:

> **Editing files in a Codespace does not push them to GitHub. Cloudflare deploys from GitHub. If you didn't `git push`, Cloudflare did not see your change.**

After every edit:

```bash
git status        # confirm changes detected
git diff          # confirm the change is what you think it is
git add -A
git commit -m "describe the change"
git push          # the only line that affects Cloudflare
```

Then **open the file on github.com in a browser** and confirm the new content is visible. That single browser check saves hours when something goes silently wrong. Make it a habit.

## Repeat-deploy checklist (laminate this)

**Before pushing**, in order:

- [ ] One config file at root, named `wrangler.jsonc`, valid JSON, has `name` + `pages_build_output_dir` + `compatibility_date`
- [ ] No `wrangler.toml`, no `wrangler.json` — only `.jsonc`
- [ ] `npm run build` succeeds locally and produces `dist/`
- [ ] Local wrangler dry-run with fake token shows config is valid
- [ ] API functions are in `functions/api/`, export `onRequestGet` (or similar)
- [ ] `.gitignore` excludes `node_modules`, `dist`, `.wrangler`
- [ ] `git status` is clean → committed and pushed → confirmed visible on github.com

**After Cloudflare deploys:**

- [ ] Build log shows "Success" at every stage
- [ ] Site URL loads
- [ ] `/api/<endpoint>` returns JSON (not HTML)
- [ ] Production branch in Cloudflare dashboard matches the branch you push to

## When things go wrong: the diagnostic ladder

Don't guess. Climb in order — each step takes a minute and rules out a class of issues:

1. **Read the error literally.** "Missing top-level field X" means a config was found and parsed; field X is missing. "Authentication error 10000" with Pages usually means the project doesn't exist under that name (not a real auth issue).
2. **Verify GitHub.** Open the repo in browser, look at the actual file on the production branch. If it doesn't match your local copy, you forgot to push.
3. **Reproduce locally.** Run `npx wrangler@<same-version-as-CI> pages deploy dist --project-name <name>` with fake creds. Same error → config bug. Different error or success → CI environment issue.
4. **Check production branch setting.** Cloudflare dashboard → Settings → Builds & deployments → Branch control.
5. **Clear the build cache.** Cloudflare Pages caches aggressively across deploys. Settings → Build cache → Clear, then retry.
6. **Confirm project type.** URL ends in `.pages.dev` (Pages) vs `.workers.dev` (Worker). If you wrote a `wrangler pages deploy` command but landed in a Worker, that's the entire bug.

If you've climbed all six rungs and it's still broken, last resort: delete the project in Cloudflare dashboard and reconnect from scratch. The community has documented stuck-state bugs that only this fixes.

## Worker version (if you specifically need a Worker, not Pages)

Most projects should use Pages. If you have a reason to use a Worker with static assets instead:

**`wrangler.jsonc`:**

```jsonc
{
  "name": "my-dashboard",
  "compatibility_date": "2025-10-01",
  "main": "worker.js",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  }
}
```

**`worker.js` (handles routing — Workers do not auto-route `functions/`):**

```js
async function handleApi(request) {
  // your API logic here, returning a Response
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/crypto" && request.method === "GET") {
      return handleApi(request);
    }

    if (url.pathname.startsWith("/api/")) {
      return new Response(
        JSON.stringify({ error: "Not Found", path: url.pathname }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    return env.ASSETS.fetch(request);
  }
};
```

Pages Functions (`onRequestGet` exports in `functions/`) and Worker handlers (`export default { fetch }`) look similar but are not interchangeable. Don't mix them.

---

**One-line summary:** the Cloudflare error message and the actual root cause are often two different things. Always verify (a) what's on GitHub, (b) what product type the project actually is, and (c) whether you can reproduce locally — before trusting the error text.
