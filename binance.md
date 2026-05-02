# binance.md — Build & deploy a Binance-backed crypto dashboard on Cloudflare

A complete, copy-paste procedure for building a React dashboard that fetches live crypto prices from Binance via a Cloudflare Worker (or Pages Function), then deploys it from GitHub. Generalizes to any symbol set and any similar third-party JSON API.

The end result: a public URL like `https://my-dashboard.pages.dev` that shows real-time BTC and ETH prices, refreshed on demand.

---

## What this skill builds

```
┌────────────────────┐      ┌──────────────────────┐      ┌─────────────────┐
│  Browser (React)   │ ───→ │  Cloudflare Edge     │ ───→ │  Binance API    │
│  /                 │      │  /api/crypto handler │      │  /ticker/24hr   │
└────────────────────┘ ←─── └──────────────────────┘ ←─── └─────────────────┘
        JSON                    JSON               24hr ticker JSON
```

- **Frontend:** Vite + React, plain JS, no extra libs needed
- **Backend:** A single Cloudflare handler at `/api/crypto` that fetches Binance's 24hr ticker for the symbols you want and returns clean JSON
- **Deploy:** Auto-deploys on every `git push` to `main`

Two valid Cloudflare flavors covered:

- **Pages with Functions** (recommended for new projects — simpler routing)
- **Worker with static assets** (used by the original `my-dashboard` project)

Pick one, stay with it. Don't mix.

---

## Prerequisites

```bash
node --version    # v20.x or higher
npm --version
git --version
```

GitHub account, Cloudflare account, working code editor (Codespaces, VS Code, etc.).

**Region note:** Binance's public REST API is geo-blocked in some jurisdictions (notably US). When called from a Cloudflare Worker, requests originate from Cloudflare's edge — usually fine, but if you see 451 errors, switch to `api.binance.us` or another exchange (Coinbase, Bybit, OKX) using the same pattern.

---

## Step 1 — Create the project

```bash
npm create vite@latest crypto-dashboard -- --template react
cd crypto-dashboard
npm install
mkdir -p functions/api
```

---

## Step 2 — Write the Binance fetcher (Pages Function version)

Save as `functions/api/crypto.js`:

```bash
cat > functions/api/crypto.js <<'EOF'
const SYMBOLS = ["BTCUSDT", "ETHUSDT"];

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {})
    }
  });
}

async function fetchBinanceTicker(symbol) {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`;
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "crypto-dashboard-cloudflare/1.0"
    },
    cf: { cacheTtl: 10, cacheEverything: true }
  });

  const contentType = response.headers.get("content-type") || "";
  const bodyText = await response.text();

  if (!contentType.includes("application/json")) {
    throw new Error(
      `Binance returned ${response.status} ${response.statusText} with non-JSON for ${symbol}: ${bodyText.slice(0, 80)}`
    );
  }

  const body = JSON.parse(bodyText);
  if (!response.ok) {
    throw new Error(`Binance HTTP ${response.status} for ${symbol}: ${body?.msg || ""}`.trim());
  }
  return body;
}

function mapTicker(t) {
  return {
    symbol: t.symbol,
    priceUsd: Number(t.lastPrice),
    changePercent24h: Number(t.priceChangePercent),
    high24h: Number(t.highPrice),
    low24h: Number(t.lowPrice),
    volume: Number(t.volume),
    quoteVolume: Number(t.quoteVolume)
  };
}

export async function onRequestGet() {
  try {
    const tickers = await Promise.all(SYMBOLS.map(fetchBinanceTicker));
    const result = { updated: new Date().toISOString(), source: "Binance 24hr ticker" };
    SYMBOLS.forEach((sym, i) => { result[sym] = mapTicker(tickers[i]); });
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse(
      { error: "Failed to fetch Binance data", detail: error.message },
      { status: 502 }
    );
  }
}
EOF
```

**Key points:**

- `cf: { cacheTtl: 10, cacheEverything: true }` — caches the Binance response at Cloudflare's edge for 10 seconds. Reduces upstream calls and stays well within Binance's rate limits (1200 req/min/IP).
- The non-JSON content-type check guards against Binance returning HTML error pages (e.g., during 451 geo-blocks or 502 maintenance).
- `SYMBOLS` is the only line you change to track different pairs. Add `"SOLUSDT"`, `"BNBUSDT"`, etc.

---

## Step 3 — Frontend

Replace `src/App.jsx`:

```bash
cat > src/App.jsx <<'EOF'
import { useEffect, useState } from 'react';
import './App.css';

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/crypto');
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error(`API returned ${res.status} as ${ct}. The function may not be deployed.`);
      }
      const json = await res.json();
      if (json.error) throw new Error(`${json.error}: ${json.detail || ''}`);
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="app">
      <h1>Crypto Dashboard</h1>
      <p className="subtitle">Live prices from Binance via Cloudflare</p>
      <button onClick={load} disabled={loading}>
        {loading ? 'Loading…' : 'Refresh Data'}
      </button>
      {error && <p className="error">Error: {error}</p>}
      {data && (
        <div className="grid">
          {Object.entries(data)
            .filter(([k]) => k !== 'updated' && k !== 'source')
            .map(([sym, t]) => (
              <div key={sym} className="card">
                <h2>{sym}</h2>
                <p className="price">${t.priceUsd.toLocaleString()}</p>
                <p className={t.changePercent24h >= 0 ? 'pos' : 'neg'}>
                  {t.changePercent24h >= 0 ? '▲' : '▼'} {t.changePercent24h.toFixed(2)}% (24h)
                </p>
                <p className="meta">High: ${t.high24h.toLocaleString()}</p>
                <p className="meta">Low: ${t.low24h.toLocaleString()}</p>
                <p className="meta">Vol: {t.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
            ))}
          {data.updated && <p className="updated">Updated: {new Date(data.updated).toLocaleTimeString()}</p>}
        </div>
      )}
    </div>
  );
}
EOF
```

Minimal styling in `src/App.css`:

```bash
cat > src/App.css <<'EOF'
.app { max-width: 900px; margin: 0 auto; padding: 24px; font-family: system-ui, sans-serif; color: #e8e8ea; background: #0b0d12; min-height: 100vh; }
.subtitle { color: #8a8d96; margin-bottom: 16px; }
button { background: #2563eb; color: white; border: 0; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; }
button:disabled { opacity: 0.5; cursor: wait; }
.error { color: #ef4444; padding: 12px; background: #1f1216; border-radius: 6px; margin-top: 16px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-top: 24px; }
.card { background: #161922; border: 1px solid #232732; border-radius: 8px; padding: 16px; }
.card h2 { margin: 0 0 8px; font-size: 16px; color: #8a8d96; }
.price { font-size: 28px; font-weight: 600; margin: 4px 0; }
.pos { color: #10b981; }
.neg { color: #ef4444; }
.meta { color: #8a8d96; font-size: 13px; margin: 2px 0; }
.updated { grid-column: 1 / -1; text-align: right; color: #8a8d96; font-size: 12px; }
EOF
```

Body background fix in `src/index.css`:

```bash
cat > src/index.css <<'EOF'
* { box-sizing: border-box; }
html, body, #root { margin: 0; padding: 0; min-height: 100vh; }
body { background: #0b0d12; }
EOF
```

---

## Step 4 — Configure Cloudflare

```bash
cat > wrangler.jsonc <<'EOF'
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "crypto-dashboard",
  "pages_build_output_dir": "./dist",
  "compatibility_date": "2025-10-01"
}
EOF
```

Edit `name` to be unique within your Cloudflare account.

---

## Step 5 — `.gitignore`

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

## Step 6 — Local verification (the three-part ritual)

**(a) Build:**

```bash
npm run build
```

Should produce `dist/index.html` plus `dist/assets/`.

**(b) Validate the wrangler config:**

```bash
CLOUDFLARE_API_TOKEN=fake CLOUDFLARE_ACCOUNT_ID=fake \
  npx wrangler@latest pages deploy dist --project-name crypto-dashboard 2>&1 | head -20
```

Expect `Host not in allowlist` (good — config valid, only fake auth fails). Anything else means the config is broken; fix before continuing.

**(c) Run end-to-end locally:**

```bash
npx wrangler pages dev dist
```

Open `http://localhost:8788` — dashboard loads, prices display. Open `http://localhost:8788/api/crypto` directly — JSON returns. `Ctrl+C` to stop.

If the API call locally returns geo-blocked (451) errors, you can still proceed — Cloudflare's edge usually has different routing.

---

## Step 7 — Push to GitHub

```bash
git init
git add -A
git commit -m "initial crypto dashboard"
git branch -M main
gh repo create crypto-dashboard --public --source=. --push
```

(Or do it via the GitHub web UI: create empty repo, then `git remote add origin <url>` and `git push -u origin main`.)

**Verify on github.com:** open `https://github.com/<your-username>/crypto-dashboard` in a browser and confirm `wrangler.jsonc` and `functions/api/crypto.js` are visible. This visual check has saved hours of "why isn't my fix deploying" debugging.

---

## Step 8 — Connect to Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create**
2. Click the **Pages** tab — verify the URL preview shows `*.pages.dev` not `*.workers.dev`
3. **Connect to Git** → authorize → select `crypto-dashboard`
4. Settings:

   | Field | Value |
   |---|---|
   | Project name | `crypto-dashboard` |
   | Production branch | `main` |
   | Framework preset | `Vite` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | `/` |
   | Deploy command | leave empty |
   | Environment variables | leave empty |

5. **Save and Deploy**

If the Pages tab is hidden in your dashboard, fall back to CLI:

```bash
npx wrangler pages project create crypto-dashboard --production-branch main
```

Then connect GitHub from the project's Settings → Git integration.

**Don't** manually add `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` — Git integration handles auth. Manual tokens cause misleading "Authentication error 10000".

---

## Step 9 — Verify deploy (30-second smoke test)

After the build completes (1–3 min):

- [ ] Build log shows green "Success" at every stage
- [ ] `https://crypto-dashboard.pages.dev` loads — dashboard renders, no console errors
- [ ] `https://crypto-dashboard.pages.dev/api/crypto` returns JSON, **not HTML**
- [ ] Clicking "Refresh Data" updates prices, no errors

If `/api/crypto` returns HTML, the function isn't routing. See Troubleshooting.

---

## Step 10 — Iterate

```bash
# After any local edit:
git status
git add -A
git commit -m "describe what changed"
git push                  # the only line that triggers Cloudflare
```

Cloudflare auto-deploys every push to `main`. Run the smoke test after each one.

---

## Extending the dashboard

### Add more symbols

Edit just one line in `functions/api/crypto.js`:

```js
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];
```

The frontend auto-renders whatever symbols come back.

### Symbol from URL parameter

Let users pass `?symbol=BTCUSDT` to your API. Update `functions/api/crypto.js`:

```js
export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("symbol");
  const symbols = requested ? [requested.toUpperCase()] : SYMBOLS;
  // ... rest stays the same, just use `symbols` instead of `SYMBOLS`
}
```

### Add candlestick / kline data

```js
async function fetchKlines(symbol, interval = "1h", limit = 24) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const response = await fetch(url);
  const data = await response.json();
  return data.map(k => ({
    openTime: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5]
  }));
}
```

Wire to a new endpoint `functions/api/klines.js` with `?symbol=BTCUSDT&interval=1h`. Render in frontend with Chart.js, Recharts, or lightweight-charts.

### Persist historical snapshots with KV

```bash
npx wrangler kv namespace create PRICE_HISTORY
```

Add to `wrangler.jsonc`:

```jsonc
{
  "name": "crypto-dashboard",
  "pages_build_output_dir": "./dist",
  "compatibility_date": "2025-10-01",
  "kv_namespaces": [
    { "binding": "PRICE_HISTORY", "id": "<id-from-the-create-command>" }
  ]
}
```

In your function:

```js
export async function onRequestGet({ env }) {
  const data = await fetchAllTickers();
  await env.PRICE_HISTORY.put(`snapshot:${Date.now()}`, JSON.stringify(data), { expirationTtl: 86400 });
  return jsonResponse(data);
}
```

### Scheduled fetches (every minute)

Pages Functions don't support cron triggers directly — for that, use a separate Worker with a scheduled handler, or Cloudflare's Cron Triggers feature. Simplest pattern: a tiny companion Worker that pings `/api/crypto` every minute and stores the result.

---

## Troubleshooting (Binance-specific)

| Symptom | Likely cause | Fix |
|---|---|---|
| 451 Unavailable For Legal Reasons | Geo-blocked region | Switch to `api.binance.us`, or use Coinbase: `https://api.coinbase.com/v2/exchange-rates?currency=BTC` |
| 429 Too Many Requests | Rate limit hit | Increase `cf: { cacheTtl }` in fetch options; Binance allows 1200 weighted req/min |
| 418 I'm a teapot | Banned IP from spamming | Stop hammering, wait 2 minutes; cache more aggressively |
| `non-JSON for SYMBOL` error | HTML returned (CDN error page or maintenance) | Already caught in code — error message tells you the first 80 chars |
| `Invalid symbol` error | Symbol doesn't exist on Binance | Check symbol format: `BTCUSDT` not `BTC-USDT` or `BTC/USDT` |
| Prices all show as `NaN` | Field name changed in API response | Log the raw response, update `mapTicker` |
| API returns HTML instead of JSON in production | Function not deployed | Check `functions/api/crypto.js` exists on github.com; check it exports `onRequestGet` |
| Same prices for several seconds | Edge cache working as designed | Drop `cacheTtl` to 5 or 0 if you need real-time |

---

## Diagnostic ladder for deploy failures

Climb in order, each step ~1 minute:

1. **Read the error literally.** "Missing top-level field name" = config exists but lacks the field. "Authentication error 10000" = project name doesn't exist (NOT real auth).
2. **Verify GitHub.** Open repo on github.com — does the file you edited match what you expect? Unpushed Codespace edits = invisible to Cloudflare.
3. **Reproduce locally.** Run `npx wrangler pages deploy` with fake token. Same error → config bug. Different error → CI environment issue.
4. **Check production branch.** Settings → Builds & deployments → Branch control. Must match what you push to.
5. **Clear build cache.** Settings → Build cache → Clear. Then retry deployment.
6. **Confirm project type.** `.pages.dev` URL = Pages, `.workers.dev` = Worker. The deploy command must match.
7. **Last resort.** Delete project in Cloudflare dashboard, recreate from scratch. Stuck-state bugs are documented.

---

## Worker-only alternative (if you ended up with a Worker, not Pages)

If your project's URL is `<name>.workers.dev` (not `.pages.dev`), `functions/` is ignored. Use this Worker entry instead:

`worker.js` at repo root:

```js
// Copy fetchBinanceTicker, mapTicker, jsonResponse from functions/api/crypto.js above

const SYMBOLS = ["BTCUSDT", "ETHUSDT"];

async function handleCrypto() {
  // Same logic as the onRequestGet body above
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/crypto" && request.method === "GET") {
      return handleCrypto();
    }
    if (url.pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Not Found", path: url.pathname }, { status: 404 });
    }
    return env.ASSETS.fetch(request);
  }
};
```

`wrangler.jsonc` for Worker:

```jsonc
{
  "name": "crypto-dashboard",
  "compatibility_date": "2025-10-01",
  "main": "worker.js",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  }
}
```

Deploy command for Worker: `npx wrangler deploy` (not `wrangler pages deploy`).

---

## Generalizing this skill to other APIs

This skill is the same shape for any third-party JSON API. To repurpose for a different data source, change three things:

1. The fetch URL and any auth headers in the function
2. The `mapTicker`-style normalization to your API's field names
3. The frontend `Object.entries` rendering loop, if your data shape differs

The Cloudflare deploy mechanics are identical regardless of API. Examples this exact pattern works for:

- **Coinbase** — `https://api.coinbase.com/v2/prices/BTC-USD/spot`
- **Bybit** — `https://api.bybit.com/v5/market/tickers?category=spot`
- **OKX** — `https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT`
- **HKEX delayed quotes** — `https://www1.hkex.com.hk/hkexwidget/data/...`
- **Any public REST API returning JSON**

For authenticated APIs, store keys as Pages secrets via dashboard (Settings → Variables and Secrets → Add secret) and read in your function as `env.MY_API_KEY`. Never commit secrets.

---

## One-line summary

A Cloudflare Pages Function (`functions/api/<name>.js` exporting `onRequestGet`) plus a `wrangler.jsonc` with `name` and `pages_build_output_dir`, pushed to GitHub and connected via the Pages tab — gets you from zero to a live data-backed dashboard in under 15 minutes, every time.
