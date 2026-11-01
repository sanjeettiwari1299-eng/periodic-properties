// Feed ranking: category-balanced interleave + freshness + Short-length fit.
// Pure functions in `rankShorts` (testable), DB wiring at bottom.
// Env: LAYERBASE_URL, LAYERBASE_WRITE_TOKEN (same as ingest). Run after ingest.

const MAX_PER_CATEGORY_RUN = 1;   // round-robin: ek category ke baad doosri
const HALF_LIFE_DAYS = 14;        // purane shorts dheere neeche

// shorts: [{video_id, category, duration_sec, added_at(unix seconds)}]
export function scoreShort(s, nowSec) {
  const ageDays = Math.max(0, (nowSec - (s.added_at || nowSec)) / 86400);
  const fresh = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);          // 1 -> 0
  const d = s.duration_sec;
  const lengthFit = d == null ? 0.5 : (d >= 10 && d <= 60 ? 1 : d <= 60 ? 0.6 : 0.2);
  return 0.6 * fresh + 0.4 * lengthFit;
}

// Round-robin across categories so one category never floods the feed.
export function rankShorts(shorts, nowSec = Math.floor(Date.now() / 1000)) {
  const byCat = new Map();
  const sorted = [...shorts].sort((a, b) => scoreShort(b, nowSec) - scoreShort(a, nowSec));
  for (const s of sorted) {
    const c = s.category || 'misc';
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c).push(s);
  }
  // categories ordered by their best item's score
  const cats = [...byCat.keys()].sort((a, b) => scoreShort(byCat.get(b)[0], nowSec) - scoreShort(byCat.get(a)[0], nowSec));
  const out = [];
  while (out.length < sorted.length) {
    for (const c of cats) {
      const list = byCat.get(c);
      for (let i = 0; i < MAX_PER_CATEGORY_RUN && list.length; i++) out.push(list.shift());
    }
  }
  return out.map((s, i) => ({ video_id: s.video_id, rank: i + 1 }));
}

// ---------- DB wiring (only when run directly) ----------
const BASE_URL = (process.env.LAYERBASE_URL || '').replace(/\/+$/, '');
const WRITE_TOKEN = process.env.LAYERBASE_WRITE_TOKEN || '';

function sqlArg(v) {
  if (v === null || v === undefined) return { type: 'null' };
  if (typeof v === 'number') return Number.isFinite(v) ? { type: 'integer', value: String(Math.trunc(v)) } : { type: 'null' };
  return { type: 'text', value: String(v) };
}

export async function dbExec(sql, args = [], base = BASE_URL, token = WRITE_TOKEN) {
  const res = await fetch(base + '/v2/pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ requests: [{ type: 'execute', stmt: { sql, args: args.map(sqlArg) } }, { type: 'close' }] })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LayerBase ${res.status}: ${text.slice(0, 200)}`);
  const data = JSON.parse(text);
  const bad = (data.results || []).find(r => r.type === 'error');
  if (bad) throw new Error(bad.error?.message || 'query error');
  return data.results[0].response.result;
}

async function main() {
  if (!BASE_URL || !WRITE_TOKEN) { console.error('Set LAYERBASE_URL and LAYERBASE_WRITE_TOKEN'); process.exit(1); }
  try { await dbExec('ALTER TABLE shorts ADD COLUMN feed_rank INTEGER'); } catch (e) { /* column already exists */ }
  const res = await dbExec('SELECT video_id, category, duration_sec, added_at FROM shorts');
  const cols = res.cols.map(c => c.name);
  const shorts = (res.rows || []).map(r => {
    const o = {}; r.forEach((c, i) => { o[cols[i]] = c && typeof c === 'object' && 'value' in c ? c.value : c; });
    o.duration_sec = o.duration_sec == null ? null : Number(o.duration_sec);
    o.added_at = Number(o.added_at);
    return o;
  });
  const ranked = rankShorts(shorts);
  for (const r of ranked) {
    await dbExec('UPDATE shorts SET feed_rank = ? WHERE video_id = ?', [r.rank, r.video_id]);
  }
  console.log(`ranked ${ranked.length} shorts`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
