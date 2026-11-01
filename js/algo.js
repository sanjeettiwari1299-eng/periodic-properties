// ShortsFire shared algorithm (ported from worker/worker.js). Pure functions, used by:
//  - scripts/collect.mjs (Node, GitHub Actions): content filters, categories, query plan
//  - index.html (browser): ranking + per-user signal updates (state kept in localStorage)
// Global parts of the worker that need every user's data (video_quality, mood_cat_effects, engagement/velocity from views) are not ported.

export const CATEGORIES = {
  trending: 'trending viral #Shorts Hindi', comedy: 'funny comedy #Shorts Hindi', hindi_film_comedy: 'Hindi film comedy scenes #Shorts Bollywood comedy',
  comedy_quotes: 'comedy quotes #Shorts Hindi funny status', public_comedy: 'public comedy clean #Shorts Hindi funny', peaceful_piano: 'peaceful piano music #Shorts relaxing calm',
  aura_music: 'aura relaxing music #Shorts peaceful meditation', old_songs: 'old Hindi songs #Shorts evergreen Bollywood', music: 'Hindi songs #Shorts music status',
  tech: 'tech facts gadgets #Shorts Hindi', travel: 'travel places #Shorts Hindi India', facts: 'amazing facts #Shorts Hindi mindblowing', science: 'science facts #Shorts Hindi',
  sports: 'sports motivation #Shorts Hindi', motivation: 'Hindi motivation #Shorts success life motivational speech', psychology: 'human psychology facts #Shorts Hindi mind tricks',
  psychology_tricks: 'psychology tricks facts #Shorts Hindi human behavior', dark_psychology: 'dark psychology awareness #Shorts Hindi human behavior',
  manipulation_awareness: 'manipulation psychology awareness #Shorts Hindi toxic people', dark_life_truths: 'dark life truths #Shorts Hindi reality psychology',
  bhakti: 'bhakti devotional #Shorts Hindi spiritual', geeta: 'Bhagavad Gita gyan #Shorts Krishna Hindi', bhajans: 'bhajan kirtan devotional #Shorts Hindi',
  pravachan: 'pravachan spiritual gyan #Shorts Hindi satsang', katha: 'katha pravachan #Shorts Hindi bhagwat ram katha', ramayan: 'Ramayan katha #Shorts Hindi shri ram gyan',
  mahabharat: 'Mahabharat gyan #Shorts Hindi Krishna Arjun', krishna: 'Shri Krishna gyan #Shorts Hindi bhakti',
  radhakrishna_serial: 'RadhaKrishna TV serial all episodes #Shorts Hindi Star Bharat Radha Krishna', hanuman: 'Hanuman ji bhakti #Shorts Hindi spiritual',
  life_lessons: 'life lessons Hindi #Shorts wisdom success', sad_songs: 'sad songs emotional #Shorts Hindi', heartbreak: 'heartbreak sad status #Shorts Hindi emotional',
  shayari: 'shayari #Shorts Hindi emotional attitude', attitude: 'attitude status #Shorts Hindi swag', attitude_songs: 'attitude songs #Shorts Hindi status swag',
  dialogue_status: 'dialogue status #Shorts Hindi attitude', devotion: 'devotion devotional status #Shorts Hindi bhakti', spiritual_quotes: 'spiritual quotes #Shorts Hindi gyan',
};
export const QUERY_VARIANTS = {
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
  old_songs: ['old Hindi songs #Shorts evergreen Bollywood', 'evergreen Hindi songs #Shorts', 'old Bollywood songs shorts'],
};
export const EXCLUDED_CATEGORIES = new Set(['gaming', 'fitness', 'diy', 'art', 'dance', 'sufi', 'cooking', 'fashion', 'romantic', 'love_songs', 'chanakya', 'news', 'animals']);
export const BLOCKED_TEXT_TERMS = [
  'sex', 'sexy', 'hot girl', 'hot girls', 'bikini', 'bold', '18+', 'kiss', 'gf', 'bf', 'girlfriend', 'boyfriend', 'crush', 'adult',
  'muslim', 'islam', 'islamic', 'allah', 'quran', "qur'an", 'hadith', 'namaz', 'roza', 'ramzan', 'ramadan', 'eid', 'muhammad', 'mohammad', 'madina', 'mecca', 'makkah', 'masjid', 'dargah', 'hijab', 'naat', 'sufi', 'qawwali', 'kawwali', 'kabbali', 'qabbali',
  'urdu', 'اردو', 'pakistan status', 'pakistani status', 'indonesia', 'indonesian', 'bahasa', 'bahasa indonesia', 'viral indo', 'status indo', 'malaysia', 'malayalam', 'tamil', 'telugu', 'kannada', 'bengali', 'bangla', 'filipino', 'tagalog', 'thai', 'korean', 'japanese', 'russian', 'spanish', 'portuguese', 'turkish', 'arabic',
];
const STOP = new Set(['shorts', 'short', 'viral', 'status', 'video', 'videos', 'hindi', 'हिंदी', 'हिन्दी', 'official', 'new', 'latest', 'trending', 'best', 'full', 'part', 'the', 'and', 'for', 'with', 'subscribe', 'reels', 'ytshorts', 'youtube', 'don', 'your', 'you', 'are', 'this', 'that', 'what', 'how', 'why', 'kya', 'hai', 'hain', 'ka', 'ki', 'ke', 'ko', 'se', 'me', 'mein', 'par', 'aur', 'ya', 'to', 'ho', 'है', 'का', 'की', 'के', 'में', 'से', 'और', 'को', 'पर']);
const SF_PHRASES = ['psychology facts', 'bhagwat geeta', 'bhagvad gita', 'shri krishna', 'radha krishna', 'radhe krishna', 'hanuman chalisa', 'old song', 'sad song', 'love story', 'dark psychology', 'life lessons', 'hanuman ji', 'mahadev', 'comedy scene'];
const GROUPS = {
  spiritual: ['bhakti', 'geeta', 'bhajans', 'pravachan', 'katha', 'ramayan', 'mahabharat', 'krishna', 'radhakrishna_serial', 'hanuman', 'devotion', 'spiritual_quotes'],
  emotion: ['sad_songs', 'heartbreak', 'shayari'],
  growth: ['motivation', 'life_lessons', 'facts', 'psychology', 'psychology_tricks', 'dark_psychology', 'manipulation_awareness', 'dark_life_truths'],
  entertainment: ['comedy', 'hindi_film_comedy', 'comedy_quotes', 'public_comedy', 'peaceful_piano', 'aura_music', 'old_songs', 'attitude', 'attitude_songs', 'dialogue_status', 'music'],
  knowledge: ['science', 'tech'], lifestyle: ['travel', 'sports'],
};
const MOOD_MAP = {
  happy: ['comedy', 'hindi_film_comedy', 'comedy_quotes', 'public_comedy', 'old_songs', 'attitude', 'music'],
  sad: ['sad_songs', 'shayari', 'heartbreak', 'peaceful_piano', 'aura_music', 'bhakti', 'life_lessons'],
  very_sad: ['bhakti', 'geeta', 'pravachan', 'katha', 'peaceful_piano', 'aura_music', 'spiritual_quotes', 'sad_songs'],
  focus: ['psychology', 'psychology_tricks', 'dark_psychology', 'dark_life_truths', 'motivation', 'facts', 'science', 'tech', 'life_lessons'],
  bhakti: GROUPS.spiritual,
};
export const MOODS = ['happy', 'sad', 'very_sad', 'focus', 'bhakti'];
export const FEED_DEFAULT_LIMIT = 30;

export function hindiQuery(q) { q = String(q || ''); return /\bhindi\b|हिंदी|हिन्दी/i.test(q) ? q : `${q} Hindi`; }
export function categorySearchQuery(cat, slotIndex) {
  const arr = QUERY_VARIANTS[cat] || [CATEGORIES[cat] || CATEGORIES.trending];
  return hindiQuery(arr[slotIndex % arr.length]);
}
export function categoryGroup(cat) {
  cat = String(cat || '');
  for (const g of Object.keys(GROUPS)) if (GROUPS[g].includes(cat)) return g;
  return 'general';
}
export function hasBlockedScript(raw) { return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF\u0E00-\u0E7F\u0400-\u04FF]/.test(String(raw || '')); }
export function isBlockedContent(v) {
  const raw = `${v.title || ''} ${v.channel_name || v.channel || ''} ${v.category || ''}`, text = raw.toLowerCase();
  return hasBlockedScript(raw) || BLOCKED_TEXT_TERMS.some(t => text.includes(t));
}
export function isLikelyHindiFocused(v) {
  const raw = `${v.title || ''} ${v.channel_name || v.channel || ''} ${v.category || ''}`, text = raw.toLowerCase();
  return /[\u0900-\u097F]/.test(raw) || /hindi|bhakti|geeta|gita|krishna|radha|radhakrishna|hanuman|ramayan|mahabharat|pravachan|katha|bhajan|gyan|motivation|psychology|shayari|sad|attitude|status|facts|life|truth|serial|episode|episodes|bharat|desi|bollywood|comedy|funny|piano|aura|peaceful|relaxing|old song|old songs|evergreen/.test(text);
}

export function extractTitleKeywords(text, max = 10) {
  const tokens = String(text || '').toLowerCase().match(/[a-zA-Z][a-zA-Z0-9_]{2,}|[\u0900-\u097F]{2,}/g) || [];
  const out = [], seen = new Set();
  for (const t of tokens) if (!STOP.has(t) && !seen.has(t)) { seen.add(t); out.push(t); if (out.length >= max) break; }
  return out;
}
export function extractTitleKeywordsV2(text, max = 10) {
  const base = extractTitleKeywords(text, max), low = String(text || '').toLowerCase();
  for (const p of SF_PHRASES) if (low.includes(p) && !base.includes(p)) base.push(p);
  return base;
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
export function scoreTitleKeywords(title, kwPrefs) {
  let s = 0;
  for (const k of extractTitleKeywordsV2(title, 12)) s += k.includes(' ') ? 10 : Math.min(30, kwPrefs.get(k) || 0);
  return Math.min(140, s);
}
// Slot from Asia/Kolkata hour (same buckets as worker).
export function currentTimeSlot(now = Date.now()) {
  const h = (new Date(now + 5.5 * 3600 * 1000).getUTCHours());
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'day';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}
export function moodCategoryBoost(cat, mood) { return (MOOD_MAP[mood] || []).includes(cat) ? 55 : 0; }
export function seededShuffle(arr, seedText) {
  const a = [...arr]; let seed = 2166136261;
  for (const ch of String(seedText)) { seed ^= ch.charCodeAt(0); seed = Math.imul(seed, 16777619); }
  const rnd = () => { seed += 0x6D2B79F5; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function dayKey(now = Date.now()) { return new Date(now + 5.5 * 3600 * 1000).toISOString().slice(0, 10); }

export function diversify(list, limit) {
  const pool = [...list], out = [], cats = [], groups = [], chs = [], catCnt = new Map(), grpCnt = new Map();
  const maxCat = Math.max(2, Math.ceil(limit * .16)), maxGrp = Math.max(4, Math.ceil(limit * .34));
  while (out.length < limit && pool.length) {
    let pick = -1;
    for (let i = 0; i < pool.length; i++) {
      const v = pool[i], g = v.group || categoryGroup(v.cat);
      if ((catCnt.get(v.cat) || 0) < maxCat && (grpCnt.get(g) || 0) < maxGrp && !cats.includes(v.cat) && !groups.includes(g) && !chs.includes(v.chId)) { pick = i; break; }
    }
    if (pick < 0) pick = 0;
    const [v] = pool.splice(pick, 1), g = v.group || categoryGroup(v.cat);
    out.push(v);
    catCnt.set(v.cat, (catCnt.get(v.cat) || 0) + 1); grpCnt.set(g, (grpCnt.get(g) || 0) + 1);
    cats.push(v.cat); if (cats.length > 4) cats.shift();
    groups.push(g); if (groups.length > 3) groups.shift();
    chs.push(v.chId); if (chs.length > 3) chs.shift();
  }
  return out;
}
export function inferTopGroups(list) {
  const m = new Map();
  for (const v of list) { const g = v.group || categoryGroup(v.cat); const val = Math.max(0, v.prefScore || 0) + Math.max(0, v.slotScore || 0) + Math.max(0, v.moodScore || 0) + Math.max(0, v.channelScore || 0); m.set(g, (m.get(g) || 0) + val); }
  return new Set([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]));
}
export function mixFeed(list, limit, fatigue = false) {
  const directMax = Math.max(1, Math.floor(limit * 0.40)), freshMax = limit - directMax, topGroups = inferTopGroups(list);
  const direct = [], fresh = [], seen = new Set();
  for (const v of list) { if (!v || seen.has(v.id)) continue; seen.add(v.id); (v.followed || v.liked ? direct : fresh).push(v); }
  const buckets = { taste: [], quality: [], related: [], explore: [], wild: [] };
  for (const v of fresh) {
    const score = (v.prefScore || 0) + (v.slotScore || 0) + (v.moodScore || 0) + (v.channelScore || 0) + (v.keywordScore || 0) + (v.moodBoost || 0) + (v.banditBoost || 0) + (v.afBoost || 0) + (v.semScore || 0) + (v.momBoost || 0) + (v.unexplored ? 12 : 0) - (v.titlePen || 0) - (v.agePen || 0) - (v.seqPen || 0);
    if (score >= 35) buckets.taste.push(v);
    else if ((v.qEff || 0) >= 20) buckets.quality.push(v);
    else if (topGroups.has(v.group)) buckets.related.push(v);
    else buckets.explore.push(v);
  }
  buckets.wild = seededShuffle([...buckets.explore].reverse(), 'wild').slice(0, Math.ceil(freshMax * .08) * 3);
  const directMixed = diversify(direct, directMax), freshMixed = [];
  const caps = fatigue
    ? { taste: Math.floor(freshMax * .25), quality: Math.floor(freshMax * .40), related: Math.floor(freshMax * .17), wild: 1 }
    : { taste: Math.floor(freshMax * .45), quality: Math.floor(freshMax * .18), related: Math.floor(freshMax * .17), wild: Math.max(1, Math.floor(freshMax * .08)) };
  caps.explore = Math.max(0, freshMax - caps.taste - caps.quality - caps.related - caps.wild);
  const idx = { taste: 0, quality: 0, related: 0, explore: 0, wild: 0 };
  if (buckets.explore.length) buckets.explore.sort((x, y) => (y.afBoost || 0) - (x.afBoost || 0));
  for (const k of Object.keys(caps)) buckets[k] = diversify(buckets[k], caps[k]);
  const pat = ['taste', 'explore', 'quality', 'taste', 'related', 'explore', 'wild'];
  while (freshMixed.length < freshMax) {
    let add = false;
    for (const b of pat) { if (freshMixed.length >= freshMax) break; if (idx[b] < buckets[b].length) { freshMixed.push(buckets[b][idx[b]++]); add = true; } }
    if (!add) break;
  }
  const usedFresh = new Set(freshMixed.map(v => v.id));
  for (const v of fresh) { if (freshMixed.length >= freshMax) break; if (!usedFresh.has(v.id)) freshMixed.push(v); }
  const out = []; let fi = 0, di = 0;
  while (out.length < limit && (fi < freshMixed.length || di < directMixed.length)) {
    for (let i = 0; i < 3 && out.length < limit && fi < freshMixed.length; i++) out.push(freshMixed[fi++]);
    for (let i = 0; i < 2 && out.length < limit && di < directMixed.length; i++) out.push(directMixed[di++]);
  }
  const used = new Set(out.map(v => v.id));
  for (const v of list) { if (out.length >= limit) break; if (!used.has(v.id)) { out.push(v); used.add(v.id); } }
  const dout = diversify(out, limit).slice(0, limit);
  for (let i = 2; i < dout.length; i++) {
    if (dout[i].cat === dout[i - 1].cat && dout[i].cat === dout[i - 2].cat) {
      for (let j = i + 1; j < dout.length; j++) if (dout[j].cat !== dout[i].cat) { const t = dout[i]; dout[i] = dout[j]; dout[j] = t; break; }
    }
  }
  return dout;
}

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function trigrams(s) { const t = new Set(), w = ' ' + String(s).toLowerCase() + ' '; for (let i = 0; i < w.length - 2; i++) t.add(w.slice(i, i + 3)); return t; }

// Per-user state (kept in localStorage by the page). Shape mirrors the worker's user_* tables.
export function emptyState() {
  return { prefs: {}, slot: {}, mood: {}, kw: {}, chPref: {}, watched: {}, bad: {}, likes: {}, follows: {}, bandit: {}, aff: {}, lastCats: [] };
}

// Same delta rules as worker recordSignal (watch_ms uses duration fraction when known).
export function applySignal(st, event, value, item, mood = 'focus', now = Date.now()) {
  let catDelta = 0, chDelta = 0, qDelta = 0, o = 0.5;
  const dur = Number(item.duration || 0), sec = Math.max(0, Number(value) || 0) / 1000;
  if (event === 'watch_ms') {
    if (dur > 0) {
      const comp = sec / dur;
      if (comp < 0.25) { catDelta = -5; chDelta = -8; qDelta = -7; } else if (comp < 0.6) { catDelta = 3; chDelta = 4; qDelta = 4; } else if (comp < 0.9) { catDelta = 6; chDelta = 8; qDelta = 8; } else { catDelta = 8; chDelta = 11; qDelta = 11; }
      o = 0.15 + 0.85 * Math.min(1, comp);
    } else {
      if (sec < 2.5) { catDelta = -5; chDelta = -8; } else if (sec < 7) { catDelta = 1; chDelta = 1; } else if (sec < 18) { catDelta = 4; chDelta = 5; } else { catDelta = 7; chDelta = 9; }
      o = 0.15 + 0.85 * Math.min(1, sec / 30);
    }
  } else if (event === 'like' || event === 'double_like') { catDelta = 12; chDelta = 18; qDelta = 18; o = 1; }
  else if (event === 'more_like_this') { catDelta = 28; chDelta = 32; qDelta = 35; o = 1; }
  else if (event === 'not_interested') { catDelta = -28; chDelta = -36; qDelta = -45; o = 0; }
  else if (event === 'unlike') { catDelta = -6; chDelta = -8; o = 0.1; }
  else if (event === 'share') { catDelta = 16; chDelta = 24; qDelta = 25; o = 1; }
  else if (event === 'skip') { catDelta = -7; chDelta = -11; qDelta = -8; o = 0.15; }
  else if (event === 'pause_resume') { catDelta = 7; chDelta = 9; }
  const cat = String(item.cat || item.category || 'trending'), ch = String(item.chId || item.channel_id || '');
  const m = mood, slot = currentTimeSlot(now);
  const decayAdd = (obj, key, delta, lo, hi, factor = 0.98) => { obj[key] = clamp(Math.trunc((obj[key] || 0) * factor) + delta, lo, hi); };
  if (catDelta) {
    decayAdd(st.prefs, cat, catDelta, -200, 800);
    decayAdd(st.slot, slot + '|' + cat, Math.round(catDelta * 1.2), -200, 800);
    decayAdd(st.mood, m + '|' + cat, Math.round(catDelta * 1.35), -200, 800);
    for (const k of extractTitleKeywords(item.title, 8)) decayAdd(st.kw, k, Math.round(catDelta * 0.8), -100, 500, 0.96);
  }
  if (ch && chDelta) decayAdd(st.chPref, ch, chDelta, -200, 800);
  if (event === 'like' || event === 'double_like' || event === 'more_like_this') st.likes[item.id] = now;
  if (event === 'unlike') delete st.likes[item.id];
  if (event === 'not_interested') st.bad[item.id] = now;
  if (event === 'watch_ms' && (dur > 0 ? sec / dur >= 0.6 : sec >= 18)) st.watched[item.id] = now;
  const bk = m + '|' + cat, b = st.bandit[bk] || { n: 0, w: 0 };
  st.bandit[bk] = { n: b.n + 1, w: b.w + Math.round(o * 100), t: now };
  if (event === 'watch_ms' && qDelta > 0) {
    for (const ax of (st.lastCats || []).slice(0, 3)) if (ax && ax !== cat) { const k = cat + '|' + ax; st.aff[k] = (st.aff[k] || 0) * 0.97 + 1; }
  }
  return st;
}
export function recordCategoryShown(st, cat) { st.lastCats = [cat, ...(st.lastCats || [])].slice(0, 3); return st; }

// Ranking: port of worker getFeed (ranking + mixFeed). items = rows from data/feed.json.
export function rankFeed(items, st, { mood = 'focus', limit = FEED_DEFAULT_LIMIT, now = Date.now(), rand = Math.random, fatigue = false, cats = null } = {}) {
  const slot = currentTimeSlot(now);
  const rankedLimit = Math.max(limit * 3, 160), perCatLimit = Math.max(4, Math.ceil(limit / 6));
  const kwPrefs = new Map(Object.entries(st.kw).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 50));
  const userTris = []; kwPrefs.forEach((sc, kw) => { if (sc > 0 && userTris.length < 30) userTris.push({ t: trigrams(kw), s: sc }); });
  const semScoreOf = title => {
    if (!userTris.length) return 0;
    let sum = 0;
    for (const kw of extractTitleKeywords(title, 6)) {
      const kt = trigrams(kw); let best = 0, bs = 0;
      for (const u of userTris) { let inter = 0; kt.forEach(g => { if (u.t.has(g)) inter++; }); const j = inter / (kt.size + u.t.size - inter); if (j > best) { best = j; bs = u.s; } }
      if (best >= 0.45) sum += Math.min(16, bs / 12 * Math.min(1, best));
    }
    return Math.min(50, sum);
  };
  const seqSet = new Set(st.lastCats || []);
  const afMap = new Map();
  for (const k of Object.keys(st.aff)) {
    const [aa, bb] = k.split('|'), w = st.aff[k];
    if (!w) continue;
    if (seqSet.has(aa)) afMap.set(bb, (afMap.get(bb) || 0) + w);
    if (seqSet.has(bb)) afMap.set(aa, (afMap.get(aa) || 0) + w);
  }
  const banditMap = new Map();
  for (const k of Object.keys(st.bandit)) {
    const [mm, cat] = k.split('|'); if (mm !== mood) continue;
    const r = st.bandit[k]; if (!r.n) continue;
    const ageD = Math.max(0, (now - (r.t || now)) / 86400000), dec = Math.pow(0.5, ageD / 30);
    const succ = Math.max(0.01, (r.w * dec) / 100), tot = Math.max(0.02, r.n * dec);
    banditMap.set(cat, clamp((succ / tot - 0.5) * 10, -14, 14));
  }
  const pool = [];
  for (const it of items) {
    if (!it || !it.id) continue;
    if (EXCLUDED_CATEGORIES.has(it.cat)) continue;
    if (cats && cats.length && !cats.includes(it.cat)) continue;
    if (st.watched[it.id] || st.bad[it.id]) continue;
    if (isBlockedContent({ title: it.title, channel_name: it.channel, category: it.cat })) continue;
    pool.push({ ...it, group: categoryGroup(it.cat), chId: it.chId || '', added_at: Number(it.added_at) || 0 });
  }
  // Recency window per category and per channel (ROW_NUMBER limits in worker SQL).
  pool.sort((a, b) => b.added_at - a.added_at);
  const catN = new Map(), chN = new Map(), window = [];
  for (const v of pool) {
    const c = (catN.get(v.cat) || 0) + 1, h = (chN.get(v.chId) || 0) + 1;
    if (c > perCatLimit || h > 3) continue;
    catN.set(v.cat, c); chN.set(v.chId, h); window.push(v);
  }
  const mapped = window.map(v => {
    const followed = !!st.follows[v.chId], liked = !!st.likes[v.id];
    const prefScore = st.prefs[v.cat] || 0, slotScore = st.slot[slot + '|' + v.cat] || 0, moodScore = st.mood[mood + '|' + v.cat] || 0, channelScore = st.chPref[v.chId] || 0;
    const rank = (followed ? 160 : 0) + clamp(channelScore, -50, 80) * 0.8 + clamp(prefScore, -40, 70) * 0.7 + clamp(slotScore, -40, 70) * 0.9 + clamp(moodScore, -50, 90) * 1.25 + (v.added_at > now - 3 * 86400000 ? 90 : 0) + Math.floor(rand() * 90);
    return { ...v, followed, liked, prefScore, slotScore, moodScore, channelScore, rank, keywordScore: scoreTitleKeywords(v.title, kwPrefs), semScore: semScoreOf(v.title),
      titlePen: titleQualityPenalty(v.title), agePen: Math.min(60, Math.floor(Math.max(0, now - v.added_at) / 86400000 * 3)),
      moodBoost: moodCategoryBoost(v.cat, mood), banditBoost: banditMap.get(v.cat) || 0, afBoost: Math.min(12, (afMap.get(v.cat) || 0) * 1.5),
      seqPen: seqSet.has(v.cat) ? 15 : 0, momBoost: 0, qEff: 0, unexplored: false, fxBoost: 0, engBoost: 0 };
  });
  mapped.sort((a, b) => b.rank - a.rank || b.added_at - a.added_at);
  const top = mapped.slice(0, rankedLimit);
  const tau = 26 + (fatigue ? 30 : 0) + 20;
  const gum = () => { let u = rand(); while (!u) u = rand(); return tau * (-Math.log(-Math.log(u))); };
  const scoreOf = v => (v.keywordScore || 0) + (v.moodScore || 0) * 0.35 + (v.prefScore || 0) * 0.2 + (v.moodBoost || 0) + (v.banditBoost || 0) + (v.afBoost || 0) + (v.semScore || 0) - (v.titlePen || 0) - (v.agePen || 0) - (v.seqPen || 0) + (v._g || 0);
  top.forEach(v => { v._g = gum(); });
  top.sort((a, b) => scoreOf(b) - scoreOf(a));
  return mixFeed(top, limit, fatigue);
}
