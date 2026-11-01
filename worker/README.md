# ShortsFire worker (exact worker.js)

`worker.js` is a byte-for-byte copy of the uploaded file. No code was edited.
It runs on Cloudflare Workers and talks to the database over the libSQL HTTP pipeline (`/v2/pipeline`).
LayerBase libSQL speaks the same protocol, so only the URL and token change.

## Deploy
```bash
cd worker
npx wrangler secret put TURSO_AUTH_TOKEN      # LayerBase libSQL token
npx wrangler secret put CRON_SECRET           # long random string
npx wrangler secret put YOUTUBE_API_KEY       # optional (collect uses YouTube Data API)
# TURSO_DATABASE_URL is a plain var: set it in wrangler.toml or the dashboard
#   TURSO_DATABASE_URL = "https://<host>.cloud.layerbase.dev"
npx wrangler deploy
```
Cron triggers come from `wrangler.toml` (`17 */6 * * *` for collect, `* * * * *` for the TG tick).

## Not configured (by design)
- Telegram storage (`TG_BOT_TOKEN`, `TG_CHAT_ID`) and the YouTube grab/cookie routes are left unset.
  The worker already degrades without them (`tgEnabled` returns false), so the feed, algorithm, caps,
  prune and collect still run. Nothing in the worker downloads YouTube media unless those are configured.

## Local smoke test
```bash
node worker/test/smoke.mjs
```
Runs the real `worker.js` against a local libSQL pipeline server (node:sqlite): player page, feed, signals,
stats, and the scheduled() cron path.

## index.html (player)
`index.html` at repo root is the worker's own player (`APP_HTML`), generated from `worker.js` by
`node worker/build-index.mjs`. Test: `node worker/test/index-matches-worker.mjs` (must match the worker output).

- Served by the worker itself at `https://<worker>/` it works with no config (same origin).
- Hosted on GitHub Pages it needs `window.SF_API_BASE = 'https://<worker>.workers.dev'` (line at the top of index.html)
  and CORS on the worker. The worker currently sends no CORS headers, so cross-origin calls are blocked by the browser.
