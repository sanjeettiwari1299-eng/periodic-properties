# ShortsFire (static, GitHub-only)

- **Site**: `index.html` (GitHub Pages). Reads `data/shorts.json` and plays each short as a YouTube embed. No worker or API call.
- **Collector**: `scripts/collect.mjs` runs in GitHub Actions (`.github/workflows/collect.yml`). It searches YouTube via InnerTube (no API key), keeps Shorts, stores them in your LayerBase libSQL DB, and commits `data/shorts.json`.
- **Schedule**: cron-job.org calls the GitHub API every 30 minutes (below).

## One-time setup
1. **Repo secrets** (Settings → Secrets and variables → Actions):
   - `TURSO_DATABASE_URL`: your LayerBase libSQL URL (`https://...`)
   - `TURSO_AUTH_TOKEN`: the libSQL auth token
2. **GitHub token for cron-job.org**: create a fine-grained personal access token limited to this repo with **Actions: Read and write** and **Contents: Read and write**. Keep it only inside cron-job.org.
3. **cron-job.org job** (every 30 minutes):
   - URL: `https://api.github.com/repos/sanjeettiwari1299-eng/periodic-properties/dispatches`
   - Method: `POST`
   - Headers: `Accept: application/vnd.github+json`, `Authorization: Bearer <token>`, `X-GitHub-Api-Version: 2022-11-28`, `Content-Type: application/json`
   - Body: `{"event_type":"collect"}`
   - Success response is HTTP 204.
4. **Pages**: Settings → Pages → Source: GitHub Actions (the existing `static.yml` deploys the site).

## Run locally
```bash
node --test scripts/collect.test.mjs      # tests (no network)
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/collect.mjs
```

## Notes
- The collector only writes `data/shorts.json` when its content changes.
- The browser ranking is simpler than the worker's full algorithm: recency, category likes/skips (stored in localStorage), and no-repeat filtering.
- `worker/` is the older Cloudflare Worker version and is not used by this site.
