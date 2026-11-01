# Shorts app: setup

Frontend: `index.html` (GitHub Pages par deploy hota hai, koi backend nahi).
Data: LayerBase **libSQL** (HTTP, `/v2/pipeline`, `@libsql/client` compatible).
Ingest: `scripts/ingest-innertube.mjs` (YouTube InnerTube, koi API key nahi).

## 1. LayerBase libSQL instance banao
Layerbase Cloud par libSQL instance banao, `https://<host>.cloud.layerbase.dev` URL aur auth token lo.
Local test: `lbase create libsql1 -e libsql --start` then `lbase url libsql1`.

## 2. Tokens
- **Write token** (ingest ke liye): sirf GitHub Secret / local env me. Kabhi commit mat karo.
- **Read-only token** (browser ke liye): index.html me jayega, public hoga. Read-only token banao (Layerbase me agar ho), warna ye token bhi write kar sakta hai.

## 3. Ingest chalao
```bash
LAYERBASE_URL="https://<host>.cloud.layerbase.dev" \
LAYERBASE_WRITE_TOKEN="..." \
node scripts/ingest-innertube.mjs
```
Custom queries: `QUERIES="bhajan #shorts,motivation hindi #shorts" node scripts/ingest-innertube.mjs`

Table `shorts` pehli run pe khud ban jaati hai. Duplicate video_id skip hota hai (`INSERT OR IGNORE`).

## 4. Frontend config
`index.html` me `CONFIG.LAYERBASE_URL` aur `CONFIG.LAYERBASE_TOKEN` bharo, phir commit + push.
GitHub Pages workflow (`.github/workflows/static.yml`) `index.html` ko serve karta hai.

## Notes / limits
- Browser se LayerBase call ke liye LayerBase ka CORS allow hona chahiye (apne instance ka origin allow karo). Agar CORS block ho to batana, ek chhota proxy add karna padega.
- InnerTube unofficial hai: YouTube layout badal sakta hai, aur bot-check/rate-limit aa sakta hai. Parser recursive hai taaki layout change me bhi chale.
- Shorts filter: URL me `/shorts/` ho ya length <= 60s.
- Embeds `youtube-nocookie.com` se chalte hain; kuch videos embed-disabled ho sakte hain (tab "YouTube pe kholo" button se khulega).
- Sandbox me youtube.com aur LayerBase reachable nahi hai, isliye live test nahi hua. Pehli run pe logs check karna.
