# Crypto Dashboard — React + Vite + Cloudflare Pages Function

This dashboard shows Bitcoin and Ethereum market data. The browser calls a Cloudflare Pages Function at:

```text
/api/crypto
```

The old `/data` route is still kept as a backward-compatible alias.

## Why the original error happened

The browser was calling `/data` and then running `response.json()`. The response started with:

```text
<!doctype ...
```

That means the route returned HTML instead of JSON, usually because the Cloudflare Pages Function was not deployed or the app was being tested with plain `vite dev` / `vite preview`, which does not run Cloudflare Pages Functions.

## Correct Cloudflare Pages settings

In Cloudflare Pages connected to GitHub, use:

```text
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Root directory: /
```

After deployment, open this URL directly:

```text
https://YOUR-PROJECT.pages.dev/api/crypto
```

You should see JSON. If you see the React page, `<!doctype html>`, or a 404 HTML page, the Function is not deployed correctly.

## Local test with Cloudflare Pages Functions

Plain Vite does not run `/functions`. Use Wrangler Pages dev:

```bash
npm install
npm run pages:dev
```

Then test:

```bash
curl http://localhost:8788/api/crypto
```

## Normal frontend-only development

```bash
npm install
npm run dev
```

The UI will load, but the API route will not work unless you run it through Wrangler Pages dev.
