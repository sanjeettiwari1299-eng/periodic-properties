# ShortsFire (static, GitHub-only)

- **Site**: `index.html` (GitHub Pages) + `js/algo.js`. Loads `data/feed.json`, ranks it in the browser, and plays each short as a YouTube embed. No worker or API call.
- **Collector**: `scripts/collect.mjs` runs in GitHub Actions (`.github/workflows/collect.yml`). Every run:
  1. InnerTube searches (3 per run, rotating through all categories and query variants). Shorts only, with the worker's content filters.
  2. RSS refresh of 8 known channels per run (least recently checked first).
  3. Stores everything in LayerBase libSQL (`videos`, `channels`), with caps: 100k videos, 25k channels. The oldest and excluded-category rows are pruned.
  4. Exports the newest 3000 shorts to `data/feed.json` (committed only when it changes).
- **Schedule**: cron-job.org calls the GitHub API every 30 minutes (below).
- **Per-user ranking**: the same algorithm as the worker (`js/algo.js`: category/keyword/channel/mood/slot prefs, title-quality penalty, mixFeed buckets, diversify). Each user's signals (watch time, like, skip, not interested, follow) are stored in the browser's localStorage, because a static page cannot write per-user rows to the DB.
- **Not ported** (need server-side or cross-user data): global `video_quality` learned from all users, mood-effect aggregates, view/like-based engagement boosts, and the server-side Telegram/yt-cookie paths. The per-user bandit is a mean-based approximation (no Thompson sampling).

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
node --test scripts/collect.test.mjs js/algo.test.mjs   # tests (no network)
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/collect.mjs
```

## Notes
- The collector only commits `data/feed.json` when its content changes.
- `worker/` is the older Cloudflare Worker version and is not used by this site.
