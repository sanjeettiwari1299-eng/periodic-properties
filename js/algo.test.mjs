import assert from 'node:assert/strict';
import { buildFeed, recordSignal, recordCheckout, emptyState, mulberry32, trimState } from './algo.js';

const NOW = 1_800_000_000;
const DAY = 86400;
const mk = (id, cat, ch, ageDays, title = 'Funny Hindi clip') => ({ video_id: id, title, channel: ch, category: cat, duration_sec: 30, added_at: NOW - ageDays * DAY });

const cands = [];
const cats = ['comedy', 'motivation', 'bhakti', 'tech'];
let n = 0;
for (const c of cats) for (let i = 0; i < 12; i++) cands.push(mk('V' + String(n++).padStart(10, 'a'), c, c + '-ch' + (i % 4), i));
cands.push(mk('GAMINGxxxx', 'gaming', 'g', 1));           // excluded category
cands.push(mk('BLOCKEDxxxx', 'comedy', 'b', 1, 'urdu status'));  // blocked term
const rnd = () => 0.5;

// 1) filters
const st = emptyState();
const f1 = buildFeed(cands, st, { mood: 'happy', limit: 30, nowSec: NOW, rnd: mulberry32(1) });
assert.ok(f1.length <= 30 && f1.length > 0);
assert.equal(new Set(f1.map(v => v.video_id)).size, f1.length, 'no duplicates');
assert.ok(!f1.some(v => v.video_id === 'GAMINGxxxx'), 'excluded category removed');
assert.ok(!f1.some(v => v.video_id === 'BLOCKEDxxxx'), 'blocked content removed');

// 2) category balance: first 8 cover at least 3 categories
const head = f1.slice(0, 8).map(v => v.category);
assert.ok(new Set(head).size >= 3, 'balanced head: ' + head.join(','));

// 3) cats filter
const f2 = buildFeed(cands, st, { mood: 'focus', cats: ['tech'], limit: 10, nowSec: NOW, rnd: mulberry32(2) });
assert.ok(f2.every(v => v.category === 'tech'));

// 4) like raises category pref and remembers the video
const v0 = cands[0];
recordSignal(st, v0, 'like', 0, 'happy');
assert.ok(st.prefs.comedy > 0 && st.liked.includes(v0.video_id));

// 5) not interested removes it from future feeds and lowers the category
const victim = f1[0];
recordSignal(st, victim, 'not_interested', 0, 'happy');
const f3 = buildFeed(cands, st, { mood: 'happy', limit: 30, nowSec: NOW, rnd: mulberry32(1) });
assert.ok(!f3.some(v => v.video_id === victim.video_id), 'bad video removed');

// 6) watch completion: full watch is positive, skip is negative
const w = { ...cands[5] };
const before = st.prefs[w.category] || 0;
recordSignal(st, w, 'watch_ms', 29000, 'focus');
assert.ok((st.prefs[w.category] || 0) > before, 'full watch raises pref');
const s2 = emptyState();
recordSignal(s2, w, 'watch_ms', 800, 'focus');
assert.ok(s2.prefs[w.category] < 0, 'quick skip lowers pref');
assert.ok(s2.watched.length === 0, 'short view not counted as watched');

// 7) checkout effects need >=3 samples before they boost
const s3 = emptyState();
recordCheckout(s3, 'sad', 'better', ['bhakti']);
recordCheckout(s3, 'sad', 'better', ['bhakti']);
assert.equal(s3.fx.bhakti.n, 2);
recordCheckout(s3, 'sad', 'better', ['bhakti']);
assert.equal(s3.fx.bhakti.s, 3);

// 8) state trimming keeps maps bounded
const big = emptyState();
for (let i = 0; i < 400; i++) big.prefs['c' + i] = i;
trimState(big);
assert.ok(Object.keys(big.prefs).length <= 300);

console.log('algo tests passed');
