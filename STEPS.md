# STEPS.md — Deploy a Vite + React + API project to Cloudflare from GitHub

A linear, copy-paste-friendly procedure. Follow top to bottom. Every step has a verification — don't skip them; they're cheaper than debugging the next step's failure.

---

## Prerequisites (one-time setup)

- Node.js 20+ and npm installed locally
- Git installed and configured (`git config --global user.name` and `user.email` set)
- A GitHub account
- A Cloudflare account (free tier is fine)
- A code editor (VS Code, Codespaces, or any equivalent)

Verify:

```bash
node --version    # should print v20.x or higher
npm --version
git --version
```

---

## Step 1 — Create the project locally

```bash
npm create vite@latest my-project -- --template react
cd my-project
npm install
```

Verify the dev server runs:

```bash
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). You should see the default Vite + React page. Stop the server with `Ctrl+C`.

---

## Step 2 — Set up the project structure

```bash
mkdir -p functions/api
```

Your tree should now look like this:

```
my-project/
├── src/                  # React source (already there from Vite)
├── functions/
│   └── api/              # Cloudflare Pages Functions go here
├── public/
├── package.json
├── vite.config.js
└── index.html
```

---

## Step 3 — Write your first API endpoint

Create `functions/api/hello.js`:

```bash
cat > functions/api/hello.js <<'EOF'
export async function onRequestGet({ request }) {
  return new Response(
    JSON.stringify({
      message: "Hello from Cloudflare Pages Function",
      timestamp: new Date().toISOString()
    }, null, 2),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    }
  );
}
EOF
```

Key rules for Pages Functions:

- File path becomes the URL: `functions/api/hello.js` → `/api/hello`
- Export named `onRequestGet`, `onRequestPost`, `onRequestPut`, `onRequestDelete`, or generic `onRequest`
- Handler receives a context object: `{ request, env, params, waitUntil, next, data }`
- Must return a `Response` object

---

## Step 4 — Wire the API into the React frontend

Replace `src/App.jsx` with something that calls the API. Example minimal version:

```bash
cat > src/App.jsx <<'EOF'
import { useState } from 'react';

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch('/api/hello');
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error(`API returned ${res.status} as ${ct}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>My Project</h1>
      <button onClick={load}>Call API</button>
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
    </div>
  );
}
EOF
```

---

## Step 5 — Create `wrangler.jsonc`

This is Cloudflare's project config. Create it at the repo root:

```bash
cat > wrangler.jsonc <<'EOF'
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "my-project",
  "pages_build_output_dir": "./dist",
  "compatibility_date": "2025-10-01"
}
EOF
```

Edit two values:

- `name` — must be unique within your Cloudflare account; this becomes the subdomain `<name>.pages.dev`
- `compatibility_date` — pick a recent past date. Never today, never the future.

**Critical rules:**
- Use `.jsonc` extension, not `.json` or `.toml`
- Only ONE wrangler config file at a time — never mix toml + jsonc
- The file must be at repo root, not inside `src/` or `functions/`

---

## Step 6 — Set up `.gitignore`

```bash
cat > .gitignore <<'EOF'
node_modules
dist
.wrangler
*.local
.DS_Store
.env
.env.local
EOF
```

---

## Step 7 — Verify locally before pushing

This three-step ritual catches 90% of deploy failures before they happen.

**(a) Build cleanly:**

```bash
npm run build
```

Should produce `dist/index.html`, `dist/assets/*.js`, `dist/assets/*.css`. If the build fails, fix it before continuing.

**(b) Validate the wrangler config:**

```bash
CLOUDFLARE_API_TOKEN=fake CLOUDFLARE_ACCOUNT_ID=fake \
  npx wrangler@latest pages deploy dist --project-name my-project 2>&1 | head -20
```

Two acceptable outcomes:

- `✘ [ERROR] Received a malformed response from the API ... Host not in allowlist` → **good**, config is valid; only auth failed (expected with fake token)
- `✘ [ERROR] Running configuration file validation for Pages: Missing top-level field "name"` → **bad**, fix your `wrangler.jsonc` before continuing

**(c) Test the function locally:**

```bash
npx wrangler pages dev dist
```

Open `http://localhost:8788/api/hello` in your browser. You should see the JSON response. Stop with `Ctrl+C`.

If all three steps pass, your project is deploy-ready.

---

## Step 8 — Push to GitHub

**(a) Initialize and commit:**

```bash
git init
git add -A
git commit -m "initial project"
```

**(b) Create the GitHub repo.** Either:

- On github.com, click **New repository**, name it `my-project`, leave it empty (no README/gitignore), copy the URL
- Or use the GitHub CLI: `gh repo create my-project --public --source=. --push`

**(c) Push (if you used the web UI):**

```bash
git branch -M main
git remote add origin https://github.com/<your-username>/my-project.git
git push -u origin main
```

**(d) Verify on github.com.** Open `https://github.com/<your-username>/my-project` in a browser. You must see:

- `wrangler.jsonc` at the root with the correct content
- `functions/api/hello.js` exists
- `dist/` is **not** in the repo (gitignored correctly)

This browser check is essential. If files aren't visible on GitHub, Cloudflare won't see them either.

---

## Step 9 — Connect to Cloudflare Pages

**(a) Open the dashboard:**
- Cloudflare dashboard → **Workers & Pages** → **Create**

**(b) Critical: pick the correct tab.**
- Click the **Pages** tab (NOT Workers)
- The product type is set in stone after creation; mixing them up means starting over

**(c) Connect to Git:**
- Click **Connect to Git**
- Authorize GitHub if prompted
- Select your `my-project` repo

**(d) Build settings:**

| Field | Value |
|---|---|
| Project name | `my-project` (must match `name` in `wrangler.jsonc`) |
| Production branch | `main` |
| Framework preset | `Vite` (or `None`) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |
| Deploy command | leave **empty** |
| Environment variables | leave **empty** |

**Important:** do NOT manually add `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID`. Git integration handles auth itself; manual tokens cause misleading "Authentication error 10000".

**(e) Save and Deploy.** First deploy takes 1–3 minutes.

**(f) Fallback if dashboard hides the Pages flow:**

```bash
npx wrangler pages project create my-project --production-branch main
```

Then connect the GitHub repo from the project's Settings.

---

## Step 10 — Verify the deploy (the 30-second smoke test)

Cloudflare gives you a URL like `https://my-project.pages.dev`. Run this checklist in order:

- [ ] **Build log shows Success.** Cloudflare dashboard → Deployments tab → click the latest deploy → all stages show green checkmarks
- [ ] **Frontend loads.** Open `https://my-project.pages.dev` — page renders, no console errors (open DevTools to check)
- [ ] **API returns JSON, not HTML.** Open `https://my-project.pages.dev/api/hello` directly in browser — you should see JSON, not the React app's HTML
- [ ] **Frontend successfully calls API.** Click the button on your page; the JSON should display

If any step fails, jump to the troubleshooting section below.

---

## Step 11 — Iterate

The development loop from here:

```bash
# Edit files locally
git add -A
git commit -m "describe what changed"
git push                          # this is the only line that affects Cloudflare
```

Cloudflare auto-deploys on every push to `main`. After each push:

- Watch the **Deployments** tab in the Cloudflare dashboard
- Run the 30-second smoke test from Step 10
- Verify the build log shows the commit hash matches your latest push

---

## Troubleshooting (the diagnostic ladder)

Climb in order — each step rules out a class of issues:

### 1. Read the error literally
- "Missing top-level field X" → config exists but field X is missing. Check `wrangler.jsonc` content
- "Authentication error 10000" → usually means project name doesn't exist (NOT actual auth). Check that the project name in your config matches what Cloudflare sees
- "Received a malformed response" → real auth or network issue

### 2. Verify GitHub state
- Open the repo on github.com in a browser
- Confirm the file you edited shows the expected content on the production branch
- 80% of "still failing" issues are unpushed local edits

### 3. Reproduce locally
```bash
CLOUDFLARE_API_TOKEN=fake CLOUDFLARE_ACCOUNT_ID=fake \
  npx wrangler@<same-version-as-CI> pages deploy dist --project-name <name>
```
- Same error locally → bug in your config
- Passes locally but fails in CI → CI environment issue (cache, branch, env vars)

### 4. Check production branch
- Cloudflare dashboard → Settings → Builds & deployments → Branch control
- Must match your repo's default branch (usually `main`)

### 5. Clear the build cache
- Cloudflare's Pages CI caches aggressively
- Settings → Build cache → Clear → retry latest deployment

### 6. Confirm project type
- URL ends in `.pages.dev` → Pages project (use `wrangler pages deploy`)
- URL ends in `.workers.dev` → Worker project (use `wrangler deploy`)
- If they don't match your deploy command, that's the bug

### 7. API endpoint returns HTML instead of JSON
This means routing failed and it fell through to the SPA index. Check:
- Is the file in `functions/api/`, not `src/api/` or `pages/api/`?
- Does it export `onRequestGet` (or appropriate method handler)?
- Was `functions/` accidentally `.gitignore`d?
- Visit github.com and confirm `functions/api/hello.js` is actually visible there

### 8. Last resort
Delete the Cloudflare Pages project and reconnect from scratch. Cloudflare has documented stuck-state bugs only fixable this way.

---

## Common pitfalls — quick reference

| Symptom | Cause | Fix |
|---|---|---|
| "Missing top-level field name" | Config has wrong filename or content | Use `.jsonc` extension; verify content has `"name"` field |
| "Authentication error 10000" | Project name mismatch, or manual token has wrong scope | Match project name; remove manual `CLOUDFLARE_API_TOKEN` |
| API returns HTML | Pages Function not deployed or wrong directory | Check `functions/api/` exists on github.com |
| Site at `.workers.dev` not `.pages.dev` | Created as Worker, not Pages | Delete project, recreate via Pages tab |
| "Build failed: command not found" | Wrong Node version | Set Node version in dashboard: Settings → Environment variables → `NODE_VERSION=20` |
| Deploy succeeds but old code shows | Browser cache | Hard refresh (`Ctrl+Shift+R`); also check the build hash in deploy log |
| Push doesn't trigger deploy | Pushed to wrong branch | Verify production branch matches what you push to |
| Codespace edits don't reach Cloudflare | Forgot to `git push` | `git status`; commit; push; verify on github.com |

---

## Project-specific extensions

When the basic flow works, common additions:

**Environment variables / secrets:**
- Cloudflare dashboard → Settings → Environment variables → Add for Production
- Read in functions: `env.MY_SECRET` (passed via context: `onRequestGet({ env })`)
- Don't put secrets in code or commit `.env` files

**Custom domain:**
- Settings → Custom domains → Set up a custom domain → Cloudflare auto-handles DNS if domain is on Cloudflare

**Multiple API endpoints:**
- One file per route under `functions/api/`
- `functions/api/users.js` → `/api/users`
- `functions/api/users/[id].js` → `/api/users/:id` (dynamic param)

**Database (D1):**
- Create D1 database: `npx wrangler d1 create my-db`
- Add binding to `wrangler.jsonc`:
  ```jsonc
  "d1_databases": [
    { "binding": "DB", "database_name": "my-db", "database_id": "..." }
  ]
  ```
- Use in function: `await env.DB.prepare("SELECT * FROM users").all()`

**KV storage:**
- `npx wrangler kv namespace create CACHE`
- Add binding similarly
- Use: `await env.CACHE.put(key, value)` and `await env.CACHE.get(key)`

---

## One-line summary to remember

**The Cloudflare error message and the actual root cause are often two different things.** Always verify (a) what's on GitHub, (b) what product type the project actually is, and (c) whether the issue reproduces locally — before trusting the error text.
