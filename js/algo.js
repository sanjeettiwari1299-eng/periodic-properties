// Shorts ranking engine — port of the worker's feed algorithm (getFeed / mixFeed / diversify /
// recordSignal / checkout effects). Pure functions + one state object kept in the browser.
// Times: added_at and nowSec are UNIX seconds.

export const EXCLUDED_CATEGORIES = new Set(['gaming','fitness','diy','art','dance','sufi','cooking','fashion','romantic','love_songs','chanakya','news','animals']);

export const BLOCKED_TEXT_TERMS = [
  'sex','sexy','hot girl','hot girls','bikini','bold','18+','kiss','gf','bf','girlfriend','boyfriend','crush','adult',
  'muslim','islam','islamic','allah','quran',"qur'an",'hadith','namaz','roza','ramzan','ramadan','eid','muhammad','mohammad','madina','mecca','makkah','masjid','dargah','hijab','naat','sufi','qawwali','kawwali','kabbali','qabbali',
  'urdu','pakistan status','pakistani status','indonesia','indonesian','bahasa','bahasa indonesia','viral indo','status indo','malaysia','malayalam','tamil','telugu','kannada','bengali','bangla','filipino','tagalog','thai','korean','japanese','russian','spanish','portuguese','turkish','arabic'
];

const MOOD_CATS = {
  happy: ['comedy','hindi_film_comedy','comedy_quotes','public_comedy','old_songs','attitude','music'],
  sad: ['sad_songs','shayari','heartbreak','peaceful_piano','aura_music','bhakti','life_lessons'],
  very_sad: ['bhakti','geeta','pravachan','katha','peaceful_piano','aura_music','spiritual_quotes','sad_songs'],
  focus: ['psychology','psychology_tricks','dark_psychology','dark_life_truths','motivation','facts','science','tech','life_lessons'],
  bhakti: ['bhakti','geeta','bhajans','pravachan','katha','ramayan','mahabharat','krishna','radhakrishna_serial','hanuman','devotion','spiritual_quotes']
};
const SAD_MOODS = ['sad','stressed','lonely','angry','anxious'];

const SF_PHRASES = ['psychology facts','bhagwat geeta','bhagvad gita','shri krishna','radha krishna','radhe krishna','hanuman chalisa','old song','sad song','love story','dark psychology','life lessons','hanuman ji','mahadev','comedy scene'];
const STOP = new Set(['shorts','short','viral','status','video','videos','hindi','हिंदी','हिन्दी','official','new','latest','trending','best','full','part','the','and','for','with','subscribe','reels','ytshorts','youtube','don','your','you','are','this','that','what','how','why','kya','hai','hain','ka','ki','ke','ko','se','me','mein','par','aur','ya','to','ho','है','का','की','के','में','से','और','को','पर']);

export function clamp(n, min, max) { return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min)); }

export function categoryGroup(cat) {
  cat = String(cat || '');
  if (['bhakti','geeta','bhajans','pravachan','katha','ramayan','mahabharat','krishna','radhakrishna_serial','hanuman','devotion','spiritual_quotes'].includes(cat)) return 'spiritual';
  if (['sad_songs','heartbreak','shayari'].includes(cat)) return 'emotion';
  if (['motivation','life_lessons','facts','psychology','psychology_tricks','dark_psychology','manipulation_awareness','dark_life_truths'].includes(cat)) return 'growth';
  if (['comedy','hindi_film_comedy','comedy_quotes','public_comedy','peaceful_piano','aura_music','old_songs','attitude','attitude_songs','dialogue_status','music'].includes(cat)) return 'entertainment';
  if (['science','tech'].includes(cat)) return 'knowledge';
  if (['travel','sports'].includes(cat)) return 'lifestyle';
  return 'general';
}

export function hasBlockedScript(raw) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF\u0E00-\u0E7F\u0400-\u04FF]/.test(String(raw || ''));
}
export function isBlockedContent(v) {
  const raw = `${v.title || ''} ${v.channel || ''} ${v.category || ''}`;
  const text = raw.toLowerCase();
  return hasBlockedScript(raw) || BLOCKED_TEXT_TERMS.some(t => text.includes(t));
}

export function moodCategoryBoost(cat, mood) {
  return (MOOD_CATS[mood] || []).includes(cat) ? 55 : 0;
}

export function titleQualityPenalty(title) {
  const t = String(title || '');
  if (!t) return 20;
  let pen = 0;
  const words = t.split(/\s+/);
  const alpha = words.filter(w => /[a-zA-Z\u0900-\u097F]/.test(w));
  const caps = alpha.filter(w => w.length > 2 && /[A-Z]/.test(w) && w === w.toUpperCase());
  if (alpha.length >= 4 && caps.length / alpha.length > 0.6) pen += 12;
  const tags = (t.match(/#\w+/g) || []).length;
  if (tags > 8) pen += 12; else if (tags > 5) pen += 7;
  const emo = (t.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;
  if (emo > 8) pen += 8;
  if (t.length < 15) pen += 6;
  if (/(free|giveaway|win |\u20b9\d|\$\d)/i.test(t)) pen += 6;
  return Math.min(40, pen);
}

export function extractTitleKeywords(text, max = 10) {
  const tokens = String(text || '').toLowerCase().match(/[a-zA-Z][a-zA-Z0-9_]{2,}|[\u0900-\u097F]{2,}/g) || [];
  const out = [], seen = new Set();
  for (const t of tokens) {
    if (!STOP.has(t) && !seen.has(t)) { seen.add(t); out.push(t); if (out.length >= max) break; }
  }
  return out;
}
export function extractTitleKeywordsV2(text, max = 10) {
  const base = extractTitleKeywords(text, max);
  const low = String(text || '').toLowerCase();
  for (const p of SF_PHRASES) if (low.includes(p) && !base.includes(p)) base.push(p);
  return base;
}

export function scoreTitleKeywords(title, kwPrefs) {
  let s = 0;
  for (const k of extractTitleKeywordsV2(title, 12)) s += k.includes(' ') ? 10 : Math.min(30, kwPrefs.get(k) || 0);
  return Math.min(140, s);
}

function tri(s) {
  const t = new Set();
  const w = ' ' + String(s).toLowerCase() + ' ';
  for (let i = 0; i < w.length - 2; i++) t.add(w.slice(i, i + 3));
  return t;
}
// fuzzy similarity to keywords the user liked before (trigram Jaccard)
export function semScore(title, kwPrefs) {
  const userTris = [];
  kwPrefs.forEach((sc, kw) => { if (sc > 0 && userTris.length < 30) userTris.push({ t: tri(kw), s: sc }); });
  if (!userTris.length) return 0;
  let sum = 0;
  for (const kw of extractTitleKeywords(title, 6)) {
    const kt = tri(kw);
    let best = 0, bs = 0;
    for (const u of userTris) {
      let inter = 0;
      kt.forEach(g => { if (u.t.has(g)) inter++; });
      const j = inter / (kt.size + u.t.size - inter);
      if (j > best) { best = j; bs = u.s; }
    }
    if (best >= 0.45) sum += Math.min(16, bs / 12 * Math.min(1, best));
  }
  return Math.min(50, sum);
}

// ---------- seeded random ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seededShuffle(arr, seedText, rnd) {
  const a = [...arr];
  let seed = 2166136261;
  for (const ch of String(seedText)) { seed ^= ch.charCodeAt(0); seed = Math.imul(seed, 16777619); }
  const r = rnd || mulberry32(seed >>> 0);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Gamma / Beta sampling for the per-category bandit (Thompson sampling)
function gaussian() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function gamma(k) {
  if (k < 1) return gamma(k + 1) * Math.pow(Math.random(), 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = gaussian(); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

// ---------- state (kept in the browser) ----------
export function emptyState() {
  return {
    prefs: {},      // category -> score (-200..800)
    slot: {},       // "slot|cat" -> score
    moodPref: {},   // "mood|cat" -> score
    kw: {},         // keyword -> score (-100..500)
    ch: {},         // channel -> score (-200..800)
    quality: {},    // video_id -> score (-1000..1000)
    bandit: {},     // "mood|cat" -> {n, w}
    aff: {},        // "catA|catB" -> w
    fx: {},         // cat -> {s, n}   (checkout mood effects)
    follows: [],    // channels
    liked: [],      // video ids
    bad: [],        // video ids marked "not interested"
    watched: [],    // video ids watched >= 3s
    events: 0
  };
}

const bump = (obj, key, delta, lo, hi, decay) => {
  const cur = Number(obj[key] || 0);
  obj[key] = clamp(Math.trunc(cur * decay) + delta, lo, hi);
};
const pushCap = (arr, v, max) => { if (!arr.includes(v)) arr.push(v); if (arr.length > max) arr.splice(0, arr.length - max); };

export function currentTimeSlot(date = new Date()) {
  // IST hours, same buckets as the worker
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).formatToParts(date).find(p => p.type === 'hour');
  const h = (Number(part && part.value) || 0) % 24;
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'day';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

// keeps every map bounded (drops the weakest entries first)
export function trimState(state) {
  const capNum = (obj, max) => {
    const keys = Object.keys(obj);
    if (keys.length <= max) return;
    keys.sort((a, b) => Math.abs(obj[a]) - Math.abs(obj[b]));
    for (const k of keys.slice(0, keys.length - max)) delete obj[k];
  };
  capNum(state.prefs, 300); capNum(state.slot, 1500); capNum(state.moodPref, 1500);
  capNum(state.kw, 3000); capNum(state.ch, 3000); capNum(state.quality, 5000); capNum(state.aff, 2000);
  const kb = Object.keys(state.bandit);
  if (kb.length > 1000) for (const k of kb.slice(0, kb.length - 1000)) delete state.bandit[k];
  return state;
}

// ---------- signals (port of recordSignal) ----------
// event: watch_ms | like | unlike | more_like_this | not_interested | share | skip
export function recordSignal(state, v, event, value = 0, mood = 'focus', lastCats = []) {
  const cat = String(v.category || 'trending');
  const ch = String(v.channel || '');
  const keys = extractTitleKeywords(v.title, 8);
  const dur = Number(v.duration_sec || 0);
  let catDelta = 0, chDelta = 0, finalQ = 0, o = 0.5;

  if (event === 'watch_ms') {
    const sec = Math.max(0, value) / 1000;
    if (dur > 0) {
      const comp = sec / dur;
      if (comp < 0.25) { catDelta = -5; chDelta = -8; finalQ = -7; }
      else if (comp < 0.6) { catDelta = 3; chDelta = 4; finalQ = 4; }
      else if (comp < 0.9) { catDelta = 6; chDelta = 8; finalQ = 8; }
      else { catDelta = 8; chDelta = 11; finalQ = 11; }
      o = 0.15 + 0.85 * Math.min(1, comp);
    } else {
      if (sec < 2.5) { catDelta = -5; chDelta = -8; } else if (sec < 7) { catDelta = 1; chDelta = 1; }
      else if (sec < 18) { catDelta = 4; chDelta = 5; } else { catDelta = 7; chDelta = 9; }
      finalQ = clamp(Math.round(sec / 2.5), -8, 12);
      o = 0.15 + 0.85 * Math.min(1, sec / 30);
    }
    if (value >= 3000) pushCap(state.watched, v.video_id, 5000);
  }
  else if (event === 'like') { catDelta = 12; chDelta = 18; finalQ = 18; o = 1; pushCap(state.liked, v.video_id, 2000); }
  else if (event === 'unlike') { catDelta = -6; chDelta = -8; o = 0.1; state.liked = state.liked.filter(x => x !== v.video_id); }
  else if (event === 'more_like_this') { catDelta = 28; chDelta = 32; finalQ = 35; o = 1; }
  else if (event === 'not_interested') { catDelta = -28; chDelta = -36; finalQ = -45; o = 0; pushCap(state.bad, v.video_id, 5000); }
  else if (event === 'share') { catDelta = 16; chDelta = 24; finalQ = 25; o = 1; }
  else if (event === 'skip') { catDelta = -7; chDelta = -11; finalQ = -8; o = 0.15; }
  else return state;

  const decay = 0.98;
  if (catDelta) {
    bump(state.prefs, cat, catDelta, -200, 800, decay);
    bump(state.slot, currentTimeSlot() + '|' + cat, Math.round(catDelta * 1.2), -200, 800, decay);
    bump(state.moodPref, mood + '|' + cat, Math.round(catDelta * 1.35), -200, 800, decay);
    for (const k of keys) bump(state.kw, k, Math.round(catDelta * 1.1), -100, 500, 0.96);
  }
  if (ch && chDelta) bump(state.ch, ch, chDelta, -200, 800, decay);
  if (finalQ) bump(state.quality, v.video_id, finalQ, -1000, 1000, 0.99);

  const bk = mood + '|' + cat;
  const b = state.bandit[bk] || { n: 0, w: 0 };
  state.bandit[bk] = { n: b.n + 1, w: b.w + Math.round(o * 100) };

  if (event === 'watch_ms' && finalQ > 0) {
    for (const ax of lastCats.slice(0, 3)) {
      if (ax && ax !== cat) { const k = cat + '|' + ax; state.aff[k] = (state.aff[k] || 0) + 1; }
    }
  }
  state.events++;
  return state;
}

// Checkout: did the mood get better after a mix of categories?
export function recordCheckout(state, startMood, endMood, cats) {
  const delta = endMood === 'better' ? 1 : endMood === 'worse' ? -1 : 0;
  for (const c of cats) {
    const f = state.fx[c] || { s: 0, n: 0 };
    state.fx[c] = { s: f.s + delta, n: f.n + 1 };
  }
  return state;
}

// ---------- ranking (port of getFeed + mixFeed + diversify) ----------
export function diversify(list, limit) {
  const pool = [...list], out = [], cats = [], groups = [], chs = [];
  const catCnt = new Map(), grpCnt = new Map();
  const maxCat = Math.max(2, Math.ceil(limit * 0.16));
  const maxGrp = Math.max(4, Math.ceil(limit * 0.34));
  while (out.length < limit && pool.length) {
    let pick = -1;
    for (let i = 0; i < pool.length; i++) {
      const v = pool[i], g = v.group || categoryGroup(v.category);
      if ((catCnt.get(v.category) || 0) < maxCat && (grpCnt.get(g) || 0) < maxGrp && !cats.includes(v.category) && !groups.includes(g) && !chs.includes(v.chId)) { pick = i; break; }
    }
    if (pick < 0) pick = 0;
    const [v] = pool.splice(pick, 1);
    const g = v.group || categoryGroup(v.category);
    out.push(v);
    catCnt.set(v.category, (catCnt.get(v.category) || 0) + 1);
    grpCnt.set(g, (grpCnt.get(g) || 0) + 1);
    cats.push(v.category); if (cats.length > 4) cats.shift();
    groups.push(g); if (groups.length > 3) groups.shift();
    chs.push(v.chId); if (chs.length > 3) chs.shift();
  }
  return out;
}

export function inferTopGroups(list) {
  const m = new Map();
  for (const v of list) {
    const g = v.group || categoryGroup(v.category);
    const val = Math.max(0, v.prefScore || 0) + Math.max(0, v.slotScore || 0) + Math.max(0, v.moodScore || 0) + Math.max(0, v.channelScore || 0);
    m.set(g, (m.get(g) || 0) + val);
  }
  return new Set([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]));
}

export function mixFeed(list, limit, fatigue, rnd) {
  const directMax = Math.max(1, Math.floor(limit * 0.40));
  const freshMax = limit - directMax;
  const topGroups = inferTopGroups(list);
  const direct = [], fresh = [];
  const seen = new Set();
  for (const v of list) {
    if (!v || seen.has(v.video_id)) continue;
    seen.add(v.video_id);
    (v.followed || v.liked ? direct : fresh).push(v);
  }
  const buckets = { taste: [], quality: [], related: [], explore: [], wild: [] };
  for (const v of fresh) {
    const score = (v.prefScore || 0) + (v.slotScore || 0) + (v.moodScore || 0) + (v.channelScore || 0) + (v.keywordScore || 0) + (v.moodBoost || 0) + (v.fxBoost || 0) + (v.banditBoost || 0) + (v.afBoost || 0) + (v.semScore || 0) + (v.momBoost || 0) + (v.unexplored ? 12 : 0) - (v.titlePen || 0) - (v.agePen || 0) - (v.seqPen || 0);
    if (score >= 35) buckets.taste.push(v);
    else if ((v.qEff || 0) >= 20) buckets.quality.push(v);
    else if (topGroups.has(v.group)) buckets.related.push(v);
    else buckets.explore.push(v);
  }
  buckets.wild = seededShuffle([...buckets.explore].reverse(), 'wild', rnd).slice(0, Math.ceil(freshMax * 0.08) * 3);

  const directMixed = diversify(direct, directMax);
  const caps = fatigue
    ? { taste: Math.floor(freshMax * 0.25), quality: Math.floor(freshMax * 0.40), related: Math.floor(freshMax * 0.17), wild: 1 }
    : { taste: Math.floor(freshMax * 0.45), quality: Math.floor(freshMax * 0.18), related: Math.floor(freshMax * 0.17), wild: Math.max(1, Math.floor(freshMax * 0.08)) };
  caps.explore = Math.max(0, freshMax - caps.taste - caps.quality - caps.related - caps.wild);
  const idx = { taste: 0, quality: 0, related: 0, explore: 0, wild: 0 };
  if (buckets.explore.length) buckets.explore.sort((x, y) => (y.afBoost || 0) - (x.afBoost || 0));
  for (const k of Object.keys(caps)) buckets[k] = diversify(buckets[k], caps[k]);

  const freshMixed = [];
  const taken = new Set();
  const pat = ['taste', 'explore', 'quality', 'taste', 'related', 'explore', 'wild'];
  while (freshMixed.length < freshMax) {
    let add = false;
    for (const b of pat) {
      if (freshMixed.length >= freshMax) break;
      while (idx[b] < buckets[b].length && taken.has(buckets[b][idx[b]].video_id)) idx[b]++; // wild overlaps explore
      if (idx[b] < buckets[b].length) { const v = buckets[b][idx[b]++]; taken.add(v.video_id); freshMixed.push(v); add = true; }
    }
    if (!add) break;
  }
  for (const v of fresh) { if (freshMixed.length >= freshMax) break; if (!taken.has(v.video_id)) { taken.add(v.video_id); freshMixed.push(v); } }

  const out = [];
  let fi = 0, di = 0;
  while (out.length < limit && (fi < freshMixed.length || di < directMixed.length)) {
    for (let i = 0; i < 3 && out.length < limit && fi < freshMixed.length; i++) out.push(freshMixed[fi++]);
    for (let i = 0; i < 2 && out.length < limit && di < directMixed.length; i++) out.push(directMixed[di++]);
  }
  const used = new Set(out.map(v => v.video_id));
  for (const v of list) { if (out.length >= limit) break; if (!used.has(v.video_id)) { out.push(v); used.add(v.video_id); } }

  const dout = diversify(out, limit).slice(0, limit);
  // never 3 of the same category in a row
  for (let i = 2; i < dout.length; i++) {
    if (dout[i].category === dout[i - 1].category && dout[i].category === dout[i - 2].category) {
      for (let j = i + 1; j < dout.length; j++) {
        if (dout[j].category !== dout[i].category) { [dout[i], dout[j]] = [dout[j], dout[i]]; break; }
      }
    }
  }
  return dout;
}

// candidates: [{video_id,title,channel,category,duration_sec,added_at}]
// opts: {mood, cats (array|null), limit, nowSec, sessionCats (Map cat->count), fatigue, rnd}
export function buildFeed(candidates, state, opts = {}) {
  const mood = opts.mood || 'focus';
  const limit = opts.limit || 40;
  const nowSec = opts.nowSec || Math.floor(Date.now() / 1000);
  const rnd = opts.rnd || Math.random;
  const cats = opts.cats && opts.cats.length ? new Set(opts.cats) : null;
  const sess = opts.sessionCats || new Map();
  const slot = currentTimeSlot(new Date(nowSec * 1000));
  const perCatLimit = Math.max(4, Math.ceil(limit / 6));

  const watched = new Set(state.watched), bad = new Set(state.bad);
  const follows = new Set(state.follows), liked = new Set(state.liked);
  const kwPrefs = new Map(Object.entries(state.kw).filter(([, s]) => s > 0));
  const fxMap = new Map();
  for (const [c, f] of Object.entries(state.fx)) if (f.n >= 3) fxMap.set(c, clamp(Math.round(f.s / f.n * 25), -35, 35));
  const fxW = SAD_MOODS.includes(mood) ? 1.6 : 1;
  const banditMap = new Map();
  for (const [k, b] of Object.entries(state.bandit)) {
    const [bm, bc] = k.split('|');
    if (bm !== mood || !b.n) continue;
    const n = Math.max(1, b.n);
    const succ = Math.max(0.01, b.w / 100), fail = Math.max(0.01, n - succ);
    let smp = 0.5;
    try { const x = gamma(succ), y = gamma(fail); smp = x / (x + y); } catch (e) {}
    if (!Number.isFinite(smp)) smp = 0.5;
    banditMap.set(bc, clamp((smp - 0.5) * 10, -14, 14));
  }
  const lastCats = [...sess.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
  const afMap = new Map();
  for (const [k, w] of Object.entries(state.aff)) {
    const [a, b] = k.split('|');
    if (lastCats.includes(a)) afMap.set(b, (afMap.get(b) || 0) + w);
    if (lastCats.includes(b)) afMap.set(a, (afMap.get(a) || 0) + w);
  }

  // 1) filter + per-category / per-channel balance
  const pool = candidates.filter(v =>
    /^[A-Za-z0-9_-]{11}$/.test(v.video_id) &&
    !EXCLUDED_CATEGORIES.has(v.category) && !isBlockedContent(v) &&
    (!cats || cats.has(v.category)) && !watched.has(v.video_id) && !bad.has(v.video_id)
  ).sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
  const catCount = new Map(), chCount = new Map(), recent = [];
  for (const v of pool) {
    const c = v.category || '', ch = v.channel || '';
    const cn = (catCount.get(c) || 0) + 1, hn = (chCount.get(ch) || 0) + 1;
    catCount.set(c, cn); chCount.set(ch, hn);
    if (cn <= perCatLimit && hn <= 3) recent.push(v);
  }

  // 2) coarse rank (SQL rank_score)
  const coarse = recent.map(v => {
    const pref = state.prefs[v.category] || 0;
    const slotS = state.slot[slot + '|' + v.category] || 0;
    const moodS = state.moodPref[mood + '|' + v.category] || 0;
    const chS = state.ch[v.channel || ''] || 0;
    const q = state.quality[v.video_id] || 0;
    const rs = (follows.has(v.channel) ? 160 : 0) + clamp(chS, -50, 80) * 0.8 + clamp(pref, -40, 70) * 0.7 +
      clamp(slotS, -50, 70) * 0.9 + clamp(moodS, -50, 90) * 1.25 + clamp(q, -200, 120) * 0.9 +
      ((v.added_at || 0) > nowSec - 3 * 86400 ? 90 : 0) + rnd() * 90;
    return { v, rs, pref, slotS, moodS, chS, q };
  }).sort((a, b) => b.rs - a.rs || (b.v.added_at || 0) - (a.v.added_at || 0)).slice(0, Math.max(limit * 3, 160));

  // 3) fine score
  const mapped = coarse.map(({ v, pref, slotS, moodS, chS, q }) => {
    const cat = v.category || '';
    const qEff = q * Math.abs(q) / (Math.abs(q) + 25);
    const ageDays = Math.max(0, nowSec - (v.added_at || nowSec)) / 86400;
    const seqK = sess.get(cat) || 0;
    const seqPen = sess.size ? (seqK >= 3 ? 0 : seqK === 2 ? 5 : seqK === 1 ? 12 : 0) : 0;
    const momBoost = sess.size ? (seqK >= 3 ? 7 : seqK === 2 ? 4 : 0) : 0;
    return {
      video_id: v.video_id, title: v.title || '', channel: v.channel || '', chId: v.channel || '',
      category: cat, group: categoryGroup(cat), duration_sec: v.duration_sec, added_at: v.added_at,
      followed: follows.has(v.channel), liked: liked.has(v.video_id),
      prefScore: pref, slotScore: slotS, moodScore: moodS, channelScore: chS, qEff,
      keywordScore: scoreTitleKeywords(v.title, kwPrefs),
      semScore: semScore(v.title, kwPrefs),
      moodBoost: moodCategoryBoost(cat, mood),
      fxBoost: fxMap.get(cat) || 0,
      banditBoost: banditMap.get(cat) || 0,
      afBoost: Math.min(12, (afMap.get(cat) || 0) * 1.5),
      momBoost, seqPen,
      titlePen: titleQualityPenalty(v.title),
      agePen: Math.min(60, Math.floor(ageDays * 3)),
      unexplored: q === 0 && !state.prefs[cat],
      _g: 0
    };
  });
  const kept = mapped.filter(m => m.followed || m.channelScore > -120);
  const tau = 26 + (opts.fatigue ? 30 : 0) + (state.events < 50 ? 20 : 0);
  for (const m of kept) { let u = rnd(); while (!u) u = rnd(); m._g = tau * (-Math.log(-Math.log(u))); }
  const fine = m => (m.keywordScore + m.moodScore * 0.35 + m.prefScore * 0.2 + m.moodBoost + m.fxBoost * fxW + m.banditBoost + m.afBoost + m.semScore + m.momBoost - m.titlePen - m.agePen - m.seqPen + m._g);
  if (!cats) kept.sort((a, b) => fine(b) - fine(a));

  // 4) mix into buckets + direct lane
  const list = mixFeed(kept, limit, !!opts.fatigue, rnd);
  return list.map(m => ({
    video_id: m.video_id, title: m.title, channel: m.channel, category: m.category,
    duration_sec: m.duration_sec, score: Math.round(fine(m))
  }));
}
