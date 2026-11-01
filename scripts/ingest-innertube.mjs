// InnerTube se Shorts fetch karke LayerBase libSQL me daalta hai.
// No YouTube Data API key needed. Node 18+ (global fetch), koi dependency nahi.
//
// Env:
//   LAYERBASE_URL                https URL of the LayerBase libSQL instance
//   LAYERBASE_WRITE_TOKEN        write-capable auth token
//   QUERIES                      optional, comma separated; default below
//   PER_QUERY                    optional, results per query (default 40)
//
// Run: node scripts/ingest-innertube.mjs

const BASE_URL = (process.env.LAYERBASE_URL || '').replace(/\/+$/, '');
const WRITE_TOKEN = process.env.LAYERBASE_WRITE_TOKEN || '';
const QUERIES = (process.env.QUERIES || 'funny hindi #shorts,motivation hindi #shorts,bollywood comedy #shorts,facts hindi #shorts,bhajan #shorts')
  .split(',').map(s => s.trim()).filter(Boolean);
const PER_QUERY = parseInt(process.env.PER_QUERY || '40', 10);
const MAX_SHORT_SEC = 60;

const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false';
const CLIENT = { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'hi', gl: 'IN' };

// Walk the whole response JSON and collect video renderers (layout keeps changing).
function collectVideos(node, out = [], ctxTitle = null) {
  if (Array.isArray(node)) { for (const x of node) collectVideos(x, out, ctxTitle); return out; }
  if (node && typeof node === 'object') {
    const title = node.title || node.headline;
    const t = title ? (typeof title === 'string' ? title : txt(title)) : ctxTitle;
    const vid = node.videoId;
    if (typeof vid === 'string' && /^[A-Za-z0-9_-]{11}$/.test(vid) && (node.title || node.headline)) {
      out.push(node);
    }
    // newer Shorts shelf layout: id only inside reelWatchEndpoint, title on an ancestor
    const rv = node.reelWatchEndpoint && node.reelWatchEndpoint.videoId;
    if (typeof rv === 'string' && /^[A-Za-z0-9_-]{11}$/.test(rv) && t) {
      out.push({ videoId: rv, title: t, isShort: true });
    }
    for (const k of Object.keys(node)) collectVideos(node[k], out, t || ctxTitle);
  }
  return out;
}

const txt = (t) => {
  if (!t) return '';
  if (typeof t.simpleText === 'string') return t.simpleText;
  if (Array.isArray(t.runs)) return t.runs.map(r => r.text || '').join('');
  if (typeof t.content === 'string') return t.content;
  return '';
};

function parseSeconds(s) {
  if (!s) return null;
  const parts = String(s).split(':').map(n => parseInt(n, 10));
  if (parts.some(isNaN)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

async function search(query) {
  const res = await fetch(INNERTUBE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      'Accept-Language': 'hi-IN,hi;q=0.9,en;q=0.8',
      'Origin': 'https://www.youtube.com'
    },
    body: JSON.stringify({ context: { client: CLIENT }, query })
  });
  if (!res.ok) throw new Error(`InnerTube ${res.status} for "${query}"`);
  const data = await res.json();
  const items = collectVideos(data);
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const id = it.videoId;
    if (seen.has(id)) continue;
    seen.add(id);
    const title = txt(it.title) || txt(it.headline);
    const channel = txt(it.ownerText) || txt(it.shortBylineText) || txt(it.longBylineText) || '';
    const sec = parseSeconds(txt(it.lengthText));
    const isShortUrl = it.isShort === true || JSON.stringify(it).includes('/shorts/');
    // Shorts filter: short URL ya <= 60s
    if (!isShortUrl && (sec === null || sec > MAX_SHORT_SEC)) continue;
    out.push({ video_id: id, title: title.slice(0, 300), channel: channel.slice(0, 120), category: query.split(' ')[0].toLowerCase(), duration_sec: sec });
    if (out.length >= PER_QUERY) break;
  }
  return out;
}

function sqlArg(v) {
  if (v === null || v === undefined) return { type: 'null' };
  if (typeof v === 'number') return Number.isFinite(v) ? { type: 'integer', value: String(Math.trunc(v)) } : { type: 'null' };
  return { type: 'text', value: String(v) };
}

// libSQL Hrana v2 pipeline (same protocol as @libsql/client over HTTP)
async function dbExec(sql, args = []) {
  if (!BASE_URL || !WRITE_TOKEN) throw new Error('LAYERBASE_URL / LAYERBASE_WRITE_TOKEN missing');
  const res = await fetch(BASE_URL + '/v2/pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + WRITE_TOKEN },
    body: JSON.stringify({ requests: [
      { type: 'execute', stmt: { sql, args: args.map(sqlArg) } },
      { type: 'close' }
    ] })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LayerBase ${res.status}: ${text.slice(0, 200)}`);
  const data = JSON.parse(text);
  const bad = (data.results || []).find(r => r.type === 'error');
  if (bad) throw new Error(bad.error?.message || 'query error');
  return data.results[0].response.result;
}

async function ensureSchema() {
  await dbExec(`
    CREATE TABLE IF NOT EXISTS shorts (
      video_id     TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      channel      TEXT,
      category     TEXT,
      duration_sec INTEGER,
      added_at     INTEGER NOT NULL DEFAULT (unixepoch())
    )`);
  await dbExec('CREATE INDEX IF NOT EXISTS idx_shorts_added ON shorts(added_at DESC)');
}

async function upsert(rows) {
  let n = 0;
  for (const r of rows) {
    await dbExec(
      'INSERT OR IGNORE INTO shorts (video_id, title, channel, category, duration_sec) VALUES (?,?,?,?,?)',
      [r.video_id, r.title, r.channel, r.category, r.duration_sec]
    );
    n++;
  }
  return n;
}

async function main() {
  if (!BASE_URL || !WRITE_TOKEN) { console.error('Set LAYERBASE_URL and LAYERBASE_WRITE_TOKEN'); process.exit(1); }
  await ensureSchema();
  let total = 0;
  for (const q of QUERIES) {
    try {
      const rows = await search(q);
      const n = await upsert(rows);
      total += n;
      console.log(`[ok] "${q}" -> ${rows.length} shorts`);
    } catch (e) {
      console.error(`[fail] "${q}": ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1500)); // polite delay
  }
  console.log(`done, upserted ~${total}`);
}

main().catch(e => { console.error(e); process.exit(1); });
