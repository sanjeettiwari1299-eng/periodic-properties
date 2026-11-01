import assert from 'node:assert/strict';
import { rankShorts } from './feed-rank.mjs';
const now = 1_000_000_000;
const day = 86400;
const shorts = [
  { video_id: 'a1', category: 'funny', duration_sec: 30, added_at: now },
  { video_id: 'a2', category: 'funny', duration_sec: 30, added_at: now - day },
  { video_id: 'a3', category: 'funny', duration_sec: 30, added_at: now - 2 * day },
  { video_id: 'b1', category: 'motivation', duration_sec: 45, added_at: now - 30 * day },
  { video_id: 'c1', category: 'bhajan', duration_sec: 50, added_at: now - 60 * day },
];
const out = rankShorts(shorts, now);
assert.equal(out.length, 5);
assert.deepEqual(out.map(o => o.rank), [1, 2, 3, 4, 5]);
// round-robin: first three should come from three different categories
assert.equal(new Set(out.slice(0, 3).map(o => shorts.find(s => s.video_id === o.video_id).category)).size, 3);
// freshest funny short ranks first
assert.equal(out[0].video_id, 'a1');
console.log('feed-rank tests passed');
