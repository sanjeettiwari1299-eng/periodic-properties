import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from './algo.js';

const now = Date.UTC(2026, 10, 1, 6, 0);
const mk = (id, cat, extra = {}) => ({ id, title: `Hindi ${cat} short ${id}`, chId: 'ch-' + id, channel: 'c', cat, added_at: now - 3600e3, ...extra });
const seq2 = seed => { let s = seed * 7919 + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const seq = () => { let s = 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

test('blocked and excluded categories never ranked', () => {
  const items = [mk('a1', 'comedy'), mk('a2', 'gaming'), { ...mk('a3', 'comedy'), title: 'Hindi sex joke' }];
  const r = A.rankFeed(items, A.emptyState(), { now, rand: seq() });
  assert.deepEqual(r.map(x => x.id), ['a1']);
});
test('watched and not_interested removed', () => {
  const st = A.emptyState();
  st.watched.a1 = now; st.bad.a2 = now;
  const r = A.rankFeed([mk('a1', 'comedy'), mk('a2', 'comedy'), mk('a3', 'comedy')], st, { now, rand: seq() });
  assert.deepEqual(r.map(x => x.id), ['a3']);
});
test('a liked category ranks ahead of neutral ones', () => {
  const st = A.emptyState();
  for (let i = 0; i < 4; i++) A.applySignal(st, 'like', 0, mk('L' + i, 'bhakti'), 'happy', now);
  const items = [mk('n1', 'facts'), mk('n2', 'facts'), mk('b1', 'bhakti'), mk('b2', 'bhakti')];
  // Gumbel exploration noise is part of the worker design, so check the frequency over many seeds.
  let first = 0;
  for (let s = 1; s <= 60; s++) { const r = A.rankFeed(items, st, { now, mood: 'happy', rand: seq2(s), limit: 4 }); if (r[0].cat === 'bhakti') first++; }
  assert.ok(first >= 36, 'bhakti first in ' + first + '/60');
});
test('watch_ms: short watch lowers category, full watch marks watched', () => {
  const st = A.emptyState();
  const item = { ...mk('w1', 'comedy'), duration: 30 };
  A.applySignal(st, 'watch_ms', 1000, item, 'happy', now);
  assert.ok(st.prefs.comedy < 0);
  A.applySignal(st, 'watch_ms', 28000, item, 'happy', now);
  assert.ok(st.watched.w1);
});
test('mixFeed respects limit and diversifies categories', () => {
  const items = []; for (let i = 0; i < 60; i++) items.push(mk('x' + i, ['comedy', 'facts', 'bhakti', 'tech', 'travel'][i % 5]));
  const r = A.rankFeed(items, A.emptyState(), { now, rand: seq(), limit: 20 });
  assert.equal(r.length, 20);
  assert.equal(new Set(r.map(x => x.id)).size, 20);
});
test('signal state round-trips through JSON (localStorage)', () => {
  const st = A.emptyState();
  A.applySignal(st, 'like', 0, mk('q', 'shayari'), 'sad', now);
  const back = JSON.parse(JSON.stringify(st));
  assert.equal(back.prefs.shayari, st.prefs.shayari);
});
test('currentTimeSlot uses IST hours', () => {
  assert.equal(A.currentTimeSlot(Date.UTC(2026, 10, 1, 1, 0)), 'morning');
  assert.equal(A.currentTimeSlot(Date.UTC(2026, 10, 1, 14, 0)), 'evening');
});
