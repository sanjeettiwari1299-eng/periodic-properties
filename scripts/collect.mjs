// ShortsFire collector. Runs in GitHub Actions (triggered every 30 min by cron-job.org).
// 1) Searches YouTube via InnerTube (no API key), keeps Shorts only, applies the same content filters as the worker.
// 2) Stores them in LayerBase libSQL (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN, Hrana /v2/pipeline over HTTP).
// 3) Exports the newest shorts to data/shorts.json, which the static page reads.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const IT_SEARCH_URL = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false';
export const IT_CLIENT = { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'hi', gl: 'IN' };
export const IT_MAX_SHORT_SEC = 60;
export const EXPORT_LIMIT = 500;
export const DB_KEEP = 5000;

// Same category queries and content filters as worker/worker.js.
export const QUERIES = {
  comedy: ['funny comedy #Shorts Hindi', 'Hindi comedy shorts funny clean', 'desi comedy #Shorts Hindi'],
  hindi_film_comedy: ['Hindi film comedy scenes #Shorts Bollywood comedy', 'Bollywood comedy scene #Shorts Hindi', 'old Hindi movie comedy #Shorts'],
  motivation: ['Hindi motivation #Shorts success life motivational speech', 'motivational speech Hindi #Shorts', 'success mindset #Shorts Hindi'],
  psychology: ['human psychology facts #Shorts Hindi mind tricks', 'human behaviour psychology #Shorts Hindi', 'psychology facts Hindi Shorts'],
  dark_psychology: ['dark psychology awareness #Shorts Hindi human behavior', 'dark psychology facts Hindi Shorts awareness'],
  bhakti: ['bhakti devotional #Shorts Hindi spiritual', 'Hindi bhakti shorts devotional', 'sanatan bhakti #Shorts Hindi'],
  geeta: ['Bhagavad Gita gyan #Shorts Krishna Hindi', 'Geeta life lessons #Shorts Hindi', 'Krishna Arjun Geeta updesh #Shorts Hindi'],
  katha: ['katha pravachan #Shorts Hindi bhagwat ram katha', 'bhagwat katha #Shorts Hindi', 'ram katha #Shorts Hindi'],
  sad_songs: ['sad songs emotional #Shorts Hindi', 'sad status Hindi #Shorts emotional', 'heart touching sad song #Shorts Hindi'],
  shayari: ['shayari #Shorts Hindi emotional attitude', 'Hindi shayari shorts emotional', 'deep shayari #Shorts Hindi'],
  attitude: ['attitude status #Shorts Hindi swag', 'attitude dialogue #Shorts Hindi', 'swag attitude status Hindi Shorts'],
  peaceful_piano: ['peaceful piano music #Shorts relaxing calm', 'relaxing piano shorts peaceful', 'calm piano music #Shorts'],
  old_songs: ['old Hindi songs #Shorts evergreen Bollywood', 'evergreen Hindi songs #Shorts', 'old Bollywood songs shorts'],
  trending: ['trending viral #Shorts Hindi'],
  tech: ['tech facts gadgets #Shorts Hindi'],
  travel: ['travel places #Shorts Hindi India'],
  facts: ['amazing facts #Shorts Hindi mindblowing'],
  science: ['science facts #Shorts Hindi'],
  sports: ['sports motivation #Shorts Hindi'],
  life_lessons: ['life lessons Hindi #Shorts wisdom success'],
  heartbreak: ['heartbreak sad status #Shorts Hindi emotional'],
  dialogue_status: ['dialogue status #Shorts Hindi attitude'],
  spiritual_quotes: ['spiritual quotes #Shorts Hindi gyan'],
  hanuman: ['Hanuman ji bhakti #Shorts Hindi spiritual'],
  krishna: ['Shri Krishna gyan #Shorts Hindi bhakti'],
};
export const BLOCKED_TEXT_TERMS = [
  'sex', 'sexy', 'hot girl', 'hot girls', 'bikini', 'bold', '18+', 'kiss', 'gf', 'bf', 'girlfriend', 'boyfriend', 'crush', 'adult',
  'muslim', 'islam', 'islamic', 'allah', 'quran', "qur'an", 'hadith', 'namaz', 'roza', 'ramzan', 'ramadan', 'eid', 'muhammad', 'mohammad', 'madina', 'mecca', 'makkah', 'masjid', 'dargah', 'hijab', 'naat', 'sufi', 'qawwali', 'kawwali', 'kabbali', 'qabbali',
  'urdu', 'اردو', 'pakistan status', 'pakistani status', 'indonesia', 'indonesian', 'bahasa', 'bahasa indonesia', 'viral indo', 'status indo', 'malaysia', 'malayalam', 'tamil', 'telugu', 'kannada', 'bengali', 'bangla', 'filipino', 'tagalog', 'thai', 'korean', 'japanese', 'russian', 'spanish', 'portuguese', 'turkish', 'arabic',
];

export function hindiQuery(q) { return /\bhindi\b|हिंदी|हिन्दी/i.test(q) ? q : `${q} Hindi`; }

// Rotate: each 30-min run uses a different query, so every category gets covered over time.
export function pickQueries(nowMs, count = 4) {
  const all = Object.entries(QUERIES).flatMap(([cat, arr]) => arr.map(q => ({ cat, q })));
  const slot = Math.floor(nowMs / (30 * 60 * 1000));
  const start = (slot * count) % all.length;
  const out = [];
  for (let i = 0; i < Math.min(count, all.length); i++) out.push(all[(start + i) % all.length]);
  return out.map(x => ({ cat: x.cat, query: hindiQuery(x.q) }));
}

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

// Pure: InnerTube search JSON -> [{id,title,channel_id,channel_name}] (Shorts only).
export function parseSearch(data) {
  const seen = new Set(), out = [];
  for (const it of itCollect(data)) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    const node = it.node;
    const owner = (node.ownerText || node.shortBylineText || node.longBylineText || {});
    const ownerRun = Array.isArray(owner.runs) ? owner.runs[0] : null;
    const channelId = (ownerRun && ownerRun.navigationEndpoint && ownerRun.navigationEndpoint.browseEndpoint && ownerRun.navigationEndpoint.browseEndpoint.browseId) || '';
    const channelName = itTxt(owner);
    const sec = itParseSeconds(itTxt(node.lengthText));
    const shortUrl = JSON.stringify(node).includes('/shorts/');
    if (!it.short && !shortUrl && (sec === null || sec > IT_MAX_SHORT_SEC)) continue;
    out.push({ id: it.id, title: it.title, channel_id: channelId, channel_name: channelName });
  }
  return out;
}

export function hasBlockedScript(raw) { return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF\u0E00-\u0E7F\u0400-\u04FF]/.test(String(raw || '')); }
export function isBlockedContent(v) {
  const raw = `${v.title || ''} ${v.channel_name || ''} ${v.category || ''}`, text = raw.toLowerCase();
  return hasBlockedScript(raw) || BLOCKED_TEXT_TERMS.some(t => text.includes(t));
}
export function isLikelyHindiFocused(v) {
  const raw = `${v.title || ''} ${v.channel_name || ''} ${v.category || ''}`, text = raw.toLowerCase();
  return /[\u0900-\u097F]/.test(raw) || /hindi|bhakti|geeta|gita|krishna|radha|radhakrishna|hanuman|ramayan|mahabharat|pravachan|katha|bhajan|gyan|motivation|psychology|shayari|sad|attitude|status|facts|life|truth|serial|episode|episodes|bharat|desi|bollywood|comedy|funny|piano|aura|peaceful|relaxing|old song|old songs|evergreen/.test(text);
}

export function toVideoRows(found, cat, nowMs) {
  return found
    .map(f => ({ video_id: String(f.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20), title: f.title || '', channel_id: f.channel_id || '', channel_name: f.channel_name || '', category: cat, added_at: nowMs }))
    .filter(v => v.video_id.length === 11 && !isBlockedContent(v) && isLikelyHindiFocused(v));
}

// Pure: rows -> SQL statements for LayerBase libSQL.
export function upsertStatements(rows) {
  return rows.map(v => ({
    sql: 'INSERT INTO shorts(video_id,title,channel_id,channel_name,category,added_at,last_seen_at) VALUES(?,?,?,?,?,?,?) ' +
         'ON CONFLICT(video_id) DO UPDATE SET last_seen_at=excluded.last_seen_at',
    args: [v.video_id, v.title, v.channel_id, v.channel_name, v.category, v.added_at, v.added_at],
  }));
}
export const SCHEMA_SQL = 'CREATE TABLE IF NOT EXISTS shorts(video_id TEXT PRIMARY KEY, title TEXT, channel_id TEXT, channel_name TEXT, category TEXT, added_at INTEGER, last_seen_at INTEGER)';
export const PRUNE_SQL = `DELETE FROM shorts WHERE video_id NOT IN (SELECT video_id FROM shorts ORDER BY last_seen_at DESC, added_at DESC LIMIT ${DB_KEEP})`;
export const EXPORT_SQL = `SELECT video_id,title,channel_name,category,added_at FROM shorts ORDER BY last_seen_at DESC, added_at DESC LIMIT ${EXPORT_LIMIT}`;

// Pure: DB rows -> data/shorts.json payload (no timestamp, so unchanged data produces an identical file).
export function buildExport(rows) {
  const items = rows.map(r => ({ id: r.video_id, title: r.title || '', channel: r.channel_name || '', category: r.category || '', added_at: Number(r.added_at) || 0 }));
  return { count: items.length, items };
}

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
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.TURSO_AUTH_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`libSQL ${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  const results = data.results || [];
  const bad = results.find(r => r.type === 'error');
  if (bad) throw new Error(bad.error?.message || 'libSQL query error');
  return results.map(r => r.response?.result || {});
}
export function rowsOf(result) {
  const cols = (result?.cols || []).map(c => c.name);
  const cell = c => (c == null ? null : (typeof c === 'object' ? ('value' in c ? c.value : null) : c));
  return (result?.rows || []).map(row => Object.fromEntries(row.map((c, i) => [cols[i] || String(i), cell(c)])));
}

export async function innertubeSearch(query, fetchImpl = fetch) {
  const res = await fetchImpl(IT_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      'Accept-Language': 'hi-IN,hi;q=0.9,en;q=0.8', Origin: 'https://www.youtube.com',
    },
    body: JSON.stringify({ context: { client: IT_CLIENT }, query }),
  });
  if (!res.ok) throw new Error('InnerTube ' + res.status);
  return parseSearch(await res.json());
}

export async function runCollect(env, { fetchImpl = fetch, nowMs = Date.now(), sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const plan = pickQueries(nowMs, 4);
  const rows = [];
  const errors = [];
  let ok = 0;
  for (const { cat, query } of plan) {
    try {
      const found = await innertubeSearch(query, fetchImpl);
      ok++;
      rows.push(...toVideoRows(found, cat, nowMs));
    } catch (e) { errors.push(`${cat}: ${e.message || e}`); }
    await sleep(1500);
  }
  if (ok === 0) throw new Error('All InnerTube searches failed: ' + errors.join(' | '));
  const uniq = [...new Map(rows.map(r => [r.video_id, r])).values()];
  await dbExec(env, [{ sql: SCHEMA_SQL }], fetchImpl);
  if (uniq.length) {
    const stmts = upsertStatements(uniq);
    for (let i = 0; i < stmts.length; i += 50) await dbExec(env, stmts.slice(i, i + 50), fetchImpl);
  }
  await dbExec(env, [{ sql: PRUNE_SQL }], fetchImpl);
  const [exportRes] = await dbExec(env, [{ sql: EXPORT_SQL }], fetchImpl);
  return { plan: plan.map(p => p.cat), searchOk: ok, found: uniq.length, errors, payload: buildExport(rowsOf(exportRes)) };
}

function writeIfChanged(path, payload) {
  const next = JSON.stringify(payload, null, 2) + '\n';
  const prev = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (prev === next) return false;
  writeFileSync(path, next);
  return true;
}

async function main() {
  const out = fileURLToPath(new URL('../data/shorts.json', import.meta.url));
  const result = await runCollect(process.env);
  const changed = writeIfChanged(out, result.payload);
  console.log(JSON.stringify({ categories: result.plan, searchOk: result.searchOk, found: result.found, exported: result.payload.count, changed, errors: result.errors }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error('collect failed:', e.message || e); process.exit(1); });
}
