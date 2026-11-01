// ShortsFire collector (GitHub Actions; started every 30 min by cron-job.org via repository_dispatch).
// Worker parity for global data: InnerTube searches (no API key), RSS refresh of known channels,
// content filters, caps + prune, and storage in LayerBase libSQL (Hrana /v2/pipeline over HTTP).
// Output: data/feed.json (newest shorts for the static page). Per-user ranking runs in the browser (js/algo.js).
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as A from '../js/algo.js';

export const IT_SEARCH_URL = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false';
export const IT_CLIENT = { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'hi', gl: 'IN' };
export const IT_MAX_SHORT_SEC = 60;
export const CAPS = { videos: 100000, channels: 25000, exportLimit: 3000, searchesPerRun: 3, rssPerRun: 8, pruneBatch: 2000 };
const SHORT_HINT = /#shorts|shorts|\bshort\b/i;

// ───── pure helpers ─────
export function itTxt(t) {
  if (!t) return '';
  if (typeof t.simpleText === 'string') return t.simpleText;
  if (Array.isArray(t.runs)) return t.runs.map(r => r.text || '').join('');
  if (typeof t.content === 'string') return t.content;
  return '';
}
export function itIsId(s) { return typeof s === 'string' && /^[A-Za-z0-9_-]{11}$/.test(s); }
export function itParseSeconds(s) {
  if (!s) return null;
  const p = String(s).split(':').map(n => parseInt(n, 10));
  return p.some(isNaN) ? null : p.reduce((a, n) => a * 60 + n, 0);
}
export function itCollect(node, out = [], ctxTitle = null) {
  if (Array.isArray(node)) { for (const x of node) itCollect(x, out, ctxTitle); return out; }
  if (node && typeof node === 'object') {
    const title = node.title || node.headline;
    const t = title ? (typeof title === 'string' ? title : itTxt(title)) : ctxTitle;
    if (itIsId(node.videoId) && title) out.push({ node, id: node.videoId, title: t, short: false });
    const rv = node.reelWatchEndpoint && node.reelWatchEndpoint.videoId;
    if (itIsId(rv) && t) out.push({ node, id: rv, title: t, short: true });
    for (const k of Object.keys(node)) itCollect(node[k], out, t || ctxTitle);
  }
  return out;
}
// InnerTube search JSON -> Shorts only: [{id,title,channel_id,channel_name}]
export function parseSearch(data) {
  const seen = new Set(), out = [];
  for (const it of itCollect(data)) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    const node = it.node;
    const owner = (node.ownerText || node.shortBylineText || node.longBylineText || {});
    const ownerRun = Array.isArray(owner.runs) ? owner.runs[0] : null;
    const channelId = (ownerRun && ownerRun.navigationEndpoint && ownerRun.navigationEndpoint.browseEndpoint && ownerRun.navigationEndpoint.browseEndpoint.browseId) || '';
    const sec = itParseSeconds(itTxt(node.lengthText));
    const shortUrl = JSON.stringify(node).includes('/shorts/');
    if (!it.short && !shortUrl && (sec === null || sec > IT_MAX_SHORT_SEC)) continue;
    out.push({ id: it.id, title: it.title, channel_id: channelId, channel_name: itTxt(owner) });
  }
  return out;
}
// Query plan: rotates through every (category, variant) pair; each 30-min run takes the next `count`.
export function queryPairs() {
  const pairs = [];
  for (const cat of Object.keys(A.CATEGORIES)) {
    if (A.EXCLUDED_CATEGORIES.has(cat)) continue;
    const variants = A.QUERY_VARIANTS[cat] || [A.CATEGORIES[cat]];
    variants.forEach((_, i) => pairs.push({ cat, variant: i }));
  }
  return pairs;
}
export function pickQueries(nowMs, count = CAPS.searchesPerRun) {
  const pairs = queryPairs();
  const start = (Math.floor(nowMs / (30 * 60 * 1000)) * count) % pairs.length;
  const out = [];
  for (let i = 0; i < Math.min(count, pairs.length); i++) {
    const p = pairs[(start + i) % pairs.length];
    out.push({ cat: p.cat, query: A.categorySearchQuery(p.cat, p.variant) });
  }
  return out;
}
export function toVideoRows(found, cat, nowMs) {
  return found
    .map(f => ({ video_id: String(f.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20), title: f.title || '', channel_id: f.channel_id || '', channel_name: f.channel_name || '', thumb: `https://i.ytimg.com/vi/${f.id}/hqdefault.jpg`, source: 'innertube', category: cat, added_at: nowMs }))
    .filter(v => v.video_id.length === 11 && !A.isBlockedContent(v) && A.isLikelyHindiFocused(v));
}
export function parseRssVideos(xml, fallbackChannelId, fallbackChannelName) {
  const out = [];
  const m = (s, re) => { const x = s.match(re); return x ? x[1] : ''; };
  const dec = s => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  for (const raw of xml.split('<entry>').slice(1)) {
    const entry = raw.split('</entry>')[0] || raw;
    const videoId = m(entry, /<yt:videoId>([^<]+)<\/yt:videoId>/).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
    if (videoId.length !== 11) continue;
    const title = dec(m(entry, /<title>([\s\S]*?)<\/title>/));
    if (!SHORT_HINT.test(title)) continue;
    const published = Date.parse(m(entry, /<published>([^<]+)<\/published>/)) || Date.now();
    out.push({ video_id: videoId, title, channel_id: m(entry, /<yt:channelId>([^<]+)<\/yt:channelId>/) || fallbackChannelId, channel_name: dec(m(entry, /<author>[\s\S]*?<name>([\s\S]*?)<\/name>/) || fallbackChannelName || ''), thumb: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, source: 'rss', category: 'followed_channels', added_at: published });
  }
  return out;
}
export function buildExport(rows) {
  const items = rows.filter(r => !A.EXCLUDED_CATEGORIES.has(r.category)).map(r => ({
    id: r.video_id, title: r.title || '', chId: r.channel_id || '', channel: r.channel_name || '', cat: r.category || '', added_at: Number(r.added_at) || 0,
  }));
  return { count: items.length, items };
}

// ───── libSQL (LayerBase) ─────
export function tursoEndpoint(url) {
  let u = String(url || '').trim();
  if (!u) throw new Error('TURSO_DATABASE_URL missing');
  if (u.startsWith('libsql://')) u = 'https://' + u.slice(9);
  u = u.replace(/\/+$/, '');
  return u.endsWith('/v2/pipeline') ? u : u + '/v2/pipeline';
}
function sqlArg(v) {
  if (v === null || v === undefined) return { type: 'null' };
  if (typeof v === 'number') return Number.isFinite(v) ? { type: 'integer', value: String(Math.trunc(v)) } : { type: 'null' };
  return { type: 'text', value: String(v) };
}
export async function dbExec(env, statements, fetchImpl = fetch) {
  if (!env.TURSO_AUTH_TOKEN) throw new Error('TURSO_AUTH_TOKEN missing');
  const requests = statements.map(st => ({ type: 'execute', stmt: { sql: st.sql, args: (st.args || []).map(sqlArg) } }));
  requests.push({ type: 'close' });
  const res = await fetchImpl(tursoEndpoint(env.TURSO_DATABASE_URL), {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.TURSO_AUTH_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`libSQL ${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  const bad = (data.results || []).find(r => r.type === 'error');
  if (bad) throw new Error(bad.error?.message || 'libSQL query error');
  return (data.results || []).map(r => r.response?.result || {});
}
export function rowsOf(result) {
  const cols = (result?.cols || []).map(c => c.name);
  const cell = c => (c == null ? null : (typeof c === 'object' ? ('value' in c ? c.value : null) : c));
  return (result?.rows || []).map(row => Object.fromEntries(row.map((c, i) => [cols[i] || String(i), cell(c)])));
}
export const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS videos(video_id TEXT PRIMARY KEY, title TEXT, channel_id TEXT, channel_name TEXT, thumb TEXT, source TEXT, category TEXT, added_at INTEGER)',
  'CREATE INDEX IF NOT EXISTS videos_added ON videos(added_at)',
  'CREATE TABLE IF NOT EXISTS channels(channel_id TEXT PRIMARY KEY, channel_name TEXT, added_at INTEGER, last_rss_at INTEGER DEFAULT 0)',
];
export function insertVideoStatements(rows) {
  return rows.map(v => ({ sql: 'INSERT OR IGNORE INTO videos(video_id,title,channel_id,channel_name,thumb,source,category,added_at) VALUES(?,?,?,?,?,?,?,?)', args: [v.video_id, v.title, v.channel_id, v.channel_name, v.thumb, v.source, v.category, v.added_at] }));
}
export function channelStatements(rows, nowMs) {
  const seen = new Set(), out = [];
  for (const v of rows) if (v.channel_id && !seen.has(v.channel_id)) { seen.add(v.channel_id); out.push({ sql: 'INSERT OR IGNORE INTO channels(channel_id,channel_name,added_at,last_rss_at) VALUES(?,?,?,0)', args: [v.channel_id, v.channel_name || '', nowMs] }); }
  return out;
}
// Caps + cleanup: excluded categories, oldest videos beyond cap, oldest-checked channels beyond cap.
export function pruneStatements() {
  const ex = [...A.EXCLUDED_CATEGORIES].map(c => `'${c}'`).join(',');
  return [
    { sql: `DELETE FROM videos WHERE video_id IN (SELECT video_id FROM videos WHERE category IN (${ex}) LIMIT ${CAPS.pruneBatch})` },
    { sql: `DELETE FROM videos WHERE video_id IN (SELECT video_id FROM videos ORDER BY added_at ASC LIMIT ${CAPS.pruneBatch} OFFSET 0) AND (SELECT COUNT(*) FROM videos) > ${CAPS.videos}` },
    { sql: `DELETE FROM channels WHERE channel_id IN (SELECT channel_id FROM channels ORDER BY last_rss_at DESC LIMIT ${CAPS.pruneBatch} OFFSET ${CAPS.channels}) ` },
  ];
}

// ───── RSS refresh (known channels, least recently checked first) ─────
async function rssRefresh(env, fetchImpl, nowMs, sleep) {
  const chRows = rowsOf((await dbExec(env, [{ sql: `SELECT channel_id, channel_name FROM channels ORDER BY last_rss_at ASC LIMIT ${CAPS.rssPerRun}` }], fetchImpl))[0]);
  const found = [], stamps = [];
  let checked = 0, failed = 0;
  for (const ch of chRows) {
    if (!ch.channel_id) continue;
    checked++;
    try {
      const res = await fetchImpl(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(ch.channel_id)}`, { headers: { 'User-Agent': 'ShortsFireCollector/1.0' } });
      if (res.ok) {
        const xml = await res.text();
        found.push(...parseRssVideos(xml, ch.channel_id, ch.channel_name || '').filter(v => !A.isBlockedContent(v) && A.isLikelyHindiFocused(v)).slice(0, 6));
      } else failed++;
    } catch (e) { failed++; }
    stamps.push({ sql: 'UPDATE channels SET last_rss_at=? WHERE channel_id=?', args: [nowMs, ch.channel_id] });
    await sleep(300);
  }
  if (stamps.length) await dbExec(env, stamps, fetchImpl);
  return { checked, failed, found };
}

export async function runCollect(env, { fetchImpl = fetch, nowMs = Date.now(), sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const plan = pickQueries(nowMs, CAPS.searchesPerRun);
  const rows = [], errors = [];
  let searchOk = 0;
  for (const { cat, query } of plan) {
    try {
      const found = await (async () => {
        const res = await fetchImpl(IT_SEARCH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', 'Accept-Language': 'hi-IN,hi;q=0.9,en;q=0.8', Origin: 'https://www.youtube.com' },
          body: JSON.stringify({ context: { client: IT_CLIENT }, query }),
        });
        if (!res.ok) throw new Error('InnerTube ' + res.status);
        return parseSearch(await res.json());
      })();
      searchOk++;
      rows.push(...toVideoRows(found, cat, nowMs));
    } catch (e) { errors.push(`${cat}: ${e.message || e}`); }
    await sleep(1500);
  }
  if (searchOk === 0) throw new Error('All InnerTube searches failed: ' + errors.join(' | '));
  const uniq = [...new Map(rows.map(r => [r.video_id, r])).values()];

  await dbExec(env, SCHEMA.map(sql => ({ sql })), fetchImpl);
  const rss = await rssRefresh(env, fetchImpl, nowMs, sleep).catch(e => ({ checked: 0, failed: 0, found: [], error: String(e.message || e) }));
  const allNew = [...uniq, ...rss.found];
  const dedup = [...new Map(allNew.map(r => [r.video_id, r])).values()];
  const batch = [...insertVideoStatements(dedup), ...channelStatements(dedup, nowMs)];
  for (let i = 0; i < batch.length; i += 50) await dbExec(env, batch.slice(i, i + 50), fetchImpl);
  await dbExec(env, pruneStatements(), fetchImpl);

  const [exportRes] = await dbExec(env, [{ sql: `SELECT video_id,title,channel_id,channel_name,category,added_at FROM videos ORDER BY added_at DESC LIMIT ${CAPS.exportLimit}` }], fetchImpl);
  const [countRes] = await dbExec(env, [{ sql: 'SELECT COUNT(*) AS n FROM videos' }], fetchImpl);
  const payload = buildExport(rowsOf(exportRes));
  return { plan: plan.map(p => p.cat), searchOk, found: dedup.length, rss: { checked: rss.checked, failed: rss.failed, found: rss.found.length, error: rss.error }, errors, stored: Number(rowsOf(countRes)[0]?.n || 0), payload };
}

function writeIfChanged(path, payload) {
  const next = JSON.stringify(payload) + '\n';
  const prev = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (prev === next) return false;
  writeFileSync(path, next);
  return true;
}

async function main() {
  const out = fileURLToPath(new URL('../data/feed.json', import.meta.url));
  const r = await runCollect(process.env);
  const changed = writeIfChanged(out, r.payload);
  console.log(JSON.stringify({ categories: r.plan, searchOk: r.searchOk, found: r.found, rss: r.rss, stored: r.stored, exported: r.payload.count, changed, errors: r.errors }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error('collect failed:', e.message || e); process.exit(1); });
}
