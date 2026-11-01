// Shorts collector (GitHub Actions). Calls YouTube InnerTube search server-side
// (browsers can't call it: CORS) and merges results into data/shorts.json.
// Mirrors the worker's collect(): same categories + query variants, rotating per run,
// blocked-term and excluded-category filters, Shorts-only filter, and store caps/retention.
// Node 18+, no dependencies.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = ROOT + 'data/shorts.json';

// ---- from worker.js ----
const CATEGORIES = {
  trending: 'trending viral #Shorts Hindi', comedy: 'funny comedy #Shorts Hindi',
  hindi_film_comedy: 'Hindi film comedy scenes #Shorts Bollywood comedy', comedy_quotes: 'comedy quotes #Shorts Hindi funny status',
  public_comedy: 'public comedy clean #Shorts Hindi funny', peaceful_piano: 'peaceful piano music #Shorts relaxing calm',
  aura_music: 'aura relaxing music #Shorts peaceful meditation', old_songs: 'old Hindi songs #Shorts evergreen Bollywood',
  music: 'Hindi songs #Shorts music status', tech: 'tech facts gadgets #Shorts Hindi', travel: 'travel places #Shorts Hindi India',
  facts: 'amazing facts #Shorts Hindi mindblowing', science: 'science facts #Shorts Hindi', sports: 'sports motivation #Shorts Hindi',
  motivation: 'Hindi motivation #Shorts success life motivational speech', psychology: 'human psychology facts #Shorts Hindi mind tricks',
  psychology_tricks: 'psychology tricks facts #Shorts Hindi human behavior', dark_psychology: 'dark psychology awareness #Shorts Hindi human behavior',
  manipulation_awareness: 'manipulation psychology awareness #Shorts Hindi toxic people', dark_life_truths: 'dark life truths #Shorts Hindi reality psychology',
  bhakti: 'bhakti devotional #Shorts Hindi spiritual', geeta: 'Bhagavad Gita gyan #Shorts Krishna Hindi', bhajans: 'bhajan kirtan devotional #Shorts Hindi',
  pravachan: 'pravachan spiritual gyan #Shorts Hindi satsang', katha: 'katha pravachan #Shorts Hindi bhagwat ram katha',
  ramayan: 'Ramayan katha #Shorts Hindi shri ram gyan', mahabharat: 'Mahabharat gyan #Shorts Hindi Krishna Arjun',
  krishna: 'Shri Krishna gyan #Shorts Hindi bhakti', radhakrishna_serial: 'RadhaKrishna TV serial all episodes #Shorts Hindi Star Bharat Radha Krishna',
  hanuman: 'Hanuman ji bhakti #Shorts Hindi spiritual', life_lessons: 'life lessons Hindi #Shorts wisdom success',
  sad_songs: 'sad songs emotional #Shorts Hindi', heartbreak: 'heartbreak sad status #Shorts Hindi emotional', shayari: 'shayari #Shorts Hindi emotional attitude',
  attitude: 'attitude status #Shorts Hindi swag', attitude_songs: 'attitude songs #Shorts Hindi status swag', dialogue_status: 'dialogue status #Shorts Hindi attitude',
  devotion: 'devotion devotional status #Shorts Hindi bhakti', spiritual_quotes: 'spiritual quotes #Shorts Hindi gyan'
};
const QUERY_VARIANTS = {
  comedy: ['funny comedy #Shorts Hindi', 'Hindi comedy shorts funny clean', 'desi comedy #Shorts Hindi'],
  hindi_film_comedy: ['Hindi film comedy scenes #Shorts Bollywood comedy', 'Bollywood comedy scene #Shorts Hindi', 'old Hindi movie comedy #Shorts'],
  public_comedy: ['public comedy clean #Shorts Hindi funny', 'clean public reaction comedy #Shorts Hindi'],
  motivation: ['Hindi motivation #Shorts success life motivational speech', 'motivational speech Hindi #Shorts', 'success mindset #Shorts Hindi'],
  psychology: ['human psychology facts #Shorts Hindi mind tricks', 'human behaviour psychology #Shorts Hindi', 'psychology facts Hindi Shorts'],
  dark_psychology: ['dark psychology awareness #Shorts Hindi human behavior', 'dark psychology facts Hindi Shorts awareness'],
  dark_life_truths: ['dark life truths #Shorts Hindi reality psychology', 'life reality truth Hindi #Shorts', 'hard life truth #Shorts Hindi'],
  bhakti: ['bhakti devotional #Shorts Hindi spiritual', 'Hindi bhakti shorts devotional', 'sanatan bhakti #Shorts Hindi'],
  geeta: ['Bhagavad Gita gyan #Shorts Krishna Hindi', 'Geeta life lessons #Shorts Hindi', 'Krishna Arjun Geeta updesh #Shorts Hindi'],
  katha: ['katha pravachan #Shorts Hindi bhagwat ram katha', 'bhagwat katha #Shorts Hindi', 'ram katha #Shorts Hindi'],
  radhakrishna_serial: ['RadhaKrishna TV serial all episodes #Shorts Hindi Star Bharat Radha Krishna', 'Radha Krishna serial #Shorts Hindi', 'RadhaKrishna episode shorts Hindi'],
  sad_songs: ['sad songs emotional #Shorts Hindi', 'sad status Hindi #Shorts emotional', 'heart touching sad song #Shorts Hindi'],
  shayari: ['shayari #Shorts Hindi emotional attitude', 'Hindi shayari shorts emotional', 'deep shayari #Shorts Hindi'],
  attitude: ['attitude status #Shorts Hindi swag', 'attitude dialogue #Shorts Hindi', 'swag attitude status Hindi Shorts'],
  peaceful_piano: ['peaceful piano music #Shorts relaxing calm', 'relaxing piano shorts peaceful', 'calm piano music #Shorts'],
  old_songs: ['old Hindi songs #Shorts evergreen Bollywood', 'evergreen Hindi songs #Shorts', 'old Bollywood songs shorts']
};
const EXCLUDED_CATEGORIES = new Set(['gaming','fitness','diy','art','dance','sufi','cooking','fashion','romantic','love_songs','chanakya','news','animals']);
const BLOCKED_TEXT_TERMS = [
  'sex','sexy','hot girl','hot girls','bikini','bold','18+','kiss','gf','bf','girlfriend','boyfriend','crush','adult',
  'muslim','islam','islamic','allah','quran',"qur'an",'hadith','namaz','roza','ramzan','ramadan','eid','muhammad','mohammad','madina','mecca','makkah','masjid','dargah','hijab','naat','sufi','qawwali','kawwali','kabbali','qabbali',
  'urdu','pakistan status','pakistani status','indonesia','indonesian','bahasa','bahasa indonesia','viral indo','status indo','malaysia','malayalam','tamil','telugu','kannada','bengali','bangla','filipino','tagalog','thai','korean','japanese','russian','spanish','portuguese','turkish','arabic'
];
// store caps + retention (worker: MAX_VIDEOS_IN_DB, pruneDb)
const MAX_VIDEOS = 20000;
const RETENTION_DAYS = 120;
const PER_SEARCH = 40;
const MAX_SHORT_SEC = 60;

const INNERTUBE = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false';
const CLIENT = { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'hi', gl: 'IN' };

function hasBlockedScript(raw) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF\u0E00-\u0E7F\u0400-\u04FF]/.test(String(raw || ''));
}
function isBlocked(v) {
  const raw = `${v.title} ${v.channel} ${v.category}`;
  const t = raw.toLowerCase();
  return hasBlockedScript(raw) || BLOCKED_TEXT_TERMS.some(x => t.includes(x));
}

const txt = t => {
  if (!t) return '';
  if (typeof t.simpleText === 'string') return t.simpleText;
  if (Array.isArray(t.runs)) return t.runs.map(r => r.text || '').join('');
  if (typeof t.content === 'string') return t.content;
  return '';
};
const isId = s => typeof s === 'string' && /^[A-Za-z0-9_-]{11}$/.test(s);
function parseSeconds(s) {
  if (!s) return null;
  const p = String(s).split(':').map(n => parseInt(n, 10));
  return p.some(isNaN) ? null : p.reduce((a, n) => a * 60 + n, 0);
}

// walk the whole response: layouts change, so don't depend on one path
function collect(node, out = [], ctxTitle = null) {
  if (Array.isArray(node)) { for (const x of node) collect(x, out, ctxTitle); return out; }
  if (node && typeof node === 'object') {
    const title = node.title || node.headline;
    const t = title ? (typeof title === 'string' ? title : txt(title)) : ctxTitle;
    if (isId(node.videoId) && title) out.push({ node, id: node.videoId, title: t, short: false });
    const rv = node.reelWatchEndpoint && node.reelWatchEndpoint.videoId;
    if (isId(rv) && t) out.push({ node, id: rv, title: t, short: true });
    for (const k of Object.keys(node)) collect(node[k], out, t || ctxTitle);
  }
  return out;
}

async function search(query, category) {
  const res = await fetch(INNERTUBE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      'Accept-Language': 'hi-IN,hi;q=0.9,en;q=0.8', Origin: 'https://www.youtube.com'
    },
    body: JSON.stringify({ context: { client: CLIENT }, query })
  });
  if (!res.ok) throw new Error(`InnerTube ${res.status} for "${query}"`);
  const data = await res.json();
  const now = Math.floor(Date.now() / 1000);
  const seen = new Set(), out = [];
  for (const it of collect(data)) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    const node = it.node;
    const channel = txt(node.ownerText) || txt(node.shortBylineText) || txt(node.longBylineText) || '';
    const sec = parseSeconds(txt(node.lengthText));
    const shortUrl = JSON.stringify(node).includes('/shorts/');
    if (!it.short && !shortUrl && (sec === null || sec > MAX_SHORT_SEC)) continue; // Shorts only
    const v = { video_id: it.id, title: it.title.slice(0, 300), channel: channel.slice(0, 120), category, duration_sec: sec, added_at: now };
    if (isBlocked(v)) continue;
    out.push(v);
    if (out.length >= PER_SEARCH) break;
  }
  return out;
}

// rotate: one search per category per run, query variant changes each hour (worker's categorySearchQuery)
function plan() {
  const hour = Math.floor(Date.now() / 3600000);
  return Object.keys(CATEGORIES).filter(c => !EXCLUDED_CATEGORIES.has(c)).map(c => {
    const list = QUERY_VARIANTS[c] || [CATEGORIES[c]];
    return [c, list[hour % list.length]];
  });
}

function load() {
  if (!existsSync(OUT)) return [];
  try { return JSON.parse(readFileSync(OUT, 'utf8')).videos || []; } catch (e) { return []; }
}

async function main() {
  const existing = load();
  const byId = new Map(existing.map(v => [v.video_id, v]));
  let added = 0, failed = 0;
  for (const [cat, q] of plan()) {
    try {
      const rows = await search(q, cat);
      for (const r of rows) if (!byId.has(r.video_id)) { byId.set(r.video_id, r); added++; }
      console.log(`[ok] ${cat} "${q}" -> ${rows.length}`);
    } catch (e) { failed++; console.error(`[fail] ${cat}: ${e.message}`); }
    await new Promise(r => setTimeout(r, 1200));
  }
  // nothing fetched at all (network/bot-check): keep the old file untouched, fail loudly
  if (!added && failed) { console.error('no new data; keeping existing data/shorts.json'); process.exit(existing.length ? 0 : 1); }
  // retention + cap (oldest out first)
  const cutoff = Math.floor(Date.now() / 1000) - RETENTION_DAYS * 86400;
  let videos = [...byId.values()].filter(v => (v.added_at || 0) >= cutoff);
  videos.sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
  videos = videos.slice(0, MAX_VIDEOS);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ updated_at: Math.floor(Date.now() / 1000), count: videos.length, videos }, null, 1) + '\n');
  console.log(`done: +${added} new, ${failed} failed searches, ${videos.length} stored`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
export { collect, parseSeconds, plan };
