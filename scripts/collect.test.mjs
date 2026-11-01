import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from './collect.mjs';
import * as A from '../js/algo.js';

const mockSearch = {
  contents: [
    { videoRenderer: { videoId: 'AAAAAAAAAAA', title: { runs: [{ text: 'Funny Hindi comedy scene' }] }, ownerText: { runs: [{ text: 'Chan One', navigationEndpoint: { browseEndpoint: { browseId: 'UCone' } } }] }, lengthText: { simpleText: '0:42' } } },
    { reelShelf: { items: [{ shortsLockupViewModel: { title: { content: 'Motivation Hindi reel' }, onTap: { innertubeCommand: { reelWatchEndpoint: { videoId: 'BBBBBBBBBBB' } } } } }] } },
    { videoRenderer: { videoId: 'CCCCCCCCCCC', title: { simpleText: 'Long Hindi video' }, lengthText: { simpleText: '14:00' } } },
    { videoRenderer: { videoId: 'DDDDDDDDDDD', title: { simpleText: 'Hindi funny sex joke' }, lengthText: { simpleText: '0:30' } } },
  ],
};

test('parseSearch keeps Shorts only', () => {
  assert.deepEqual(C.parseSearch(mockSearch).map(x => x.id), ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'DDDDDDDDDDD']);
});
test('content filters drop blocked terms', () => {
  const rows = C.toVideoRows(C.parseSearch(mockSearch), 'comedy', 1);
  assert.deepEqual(rows.map(r => r.video_id), ['AAAAAAAAAAA', 'BBBBBBBBBBB']);
});
test('query plan rotates and is Hindi', () => {
  const a = C.pickQueries(0, 3), b = C.pickQueries(30 * 60 * 1000, 3);
  assert.equal(a.length, 3);
  assert.notDeepEqual(a.map(x => x.query), b.map(x => x.query));
  for (const q of a) assert.match(q.query, /hindi/i);
  for (const q of a) assert.ok(!A.EXCLUDED_CATEGORIES.has(q.cat));
});
test('RSS parse keeps Shorts-looking titles only', () => {
  const xml = '<feed><entry><yt:videoId>ZZZZZZZZZZZ</yt:videoId><yt:channelId>UCx</yt:channelId><title>Hindi shorts funny</title><author><name>Ch</name></author><published>2026-11-01T00:00:00+00:00</published></entry>' +
    '<entry><yt:videoId>YYYYYYYYYYY</yt:videoId><title>Long documentary</title></entry></feed>';
  const v = C.parseRssVideos(xml, 'UCfallback', 'fb');
  assert.deepEqual(v.map(x => x.video_id), ['ZZZZZZZZZZZ']);
  assert.equal(v[0].channel_id, 'UCx');
});
test('buildExport maps fields and skips excluded categories', () => {
  const p = C.buildExport([{ video_id: 'AAAAAAAAAAA', title: 't', channel_id: 'c', channel_name: 'n', category: 'comedy', added_at: 5 }, { video_id: 'BBBBBBBBBBB', title: 'x', category: 'gaming', added_at: 6 }]);
  assert.deepEqual(p, { count: 1, items: [{ id: 'AAAAAAAAAAA', title: 't', chId: 'c', channel: 'n', cat: 'comedy', added_at: 5 }] });
});
test('pruneStatements enforce caps and drop excluded categories', () => {
  const s = C.pruneStatements().map(x => x.sql).join('\n');
  assert.match(s, /category IN \('gaming'/);
  assert.match(s, /OFFSET 25000/);
  assert.match(s, new RegExp('> ' + C.CAPS.videos));
});
test('runCollect: search -> rss -> insert -> prune -> export with fake fetch', async () => {
  const sqls = [];
  const fakeFetch = async (url, init) => {
    if (String(url).includes('youtubei')) return new Response(JSON.stringify(mockSearch), { status: 200 });
    if (String(url).includes('feeds/videos.xml')) return new Response('<feed></feed>', { status: 200 });
    const body = JSON.parse(init.body);
    const ex = body.requests.filter(r => r.type === 'execute');
    sqls.push(...ex.map(r => r.stmt.sql));
    const results = ex.map(r => {
      if (r.stmt.sql.startsWith('SELECT video_id')) return { type: 'ok', response: { type: 'execute', result: { cols: [{ name: 'video_id' }, { name: 'title' }, { name: 'channel_id' }, { name: 'channel_name' }, { name: 'category' }, { name: 'added_at' }], rows: [[{ type: 'text', value: 'AAAAAAAAAAA' }, { type: 'text', value: 'Funny' }, { type: 'text', value: 'c' }, { type: 'text', value: 'Chan' }, { type: 'text', value: 'comedy' }, { type: 'integer', value: '1' }]] } } };
      if (r.stmt.sql.startsWith('SELECT COUNT')) return { type: 'ok', response: { type: 'execute', result: { cols: [{ name: 'n' }], rows: [[{ type: 'integer', value: '7' }]] } } };
      return { type: 'ok', response: { type: 'execute', result: { cols: [], rows: [], affected_row_count: 1 } } };
    });
    return new Response(JSON.stringify({ results: [...results, { type: 'ok' }] }), { status: 200 });
  };
  const env = { TURSO_DATABASE_URL: 'libsql://db.example.dev', TURSO_AUTH_TOKEN: 't' };
  const r = await C.runCollect(env, { fetchImpl: fakeFetch, nowMs: 0, sleep: async () => {} });
  assert.equal(r.searchOk, 3);
  assert.ok(r.found >= 1);
  assert.ok(sqls.some(s => s.startsWith('CREATE TABLE IF NOT EXISTS videos')));
  assert.ok(sqls.some(s => s.startsWith('INSERT OR IGNORE INTO videos')));
  assert.ok(sqls.some(s => s.startsWith('DELETE FROM videos')));
  assert.equal(r.stored, 7);
  assert.equal(r.payload.items[0].id, 'AAAAAAAAAAA');
});
test('runCollect throws when every InnerTube search fails', async () => {
  await assert.rejects(C.runCollect({ TURSO_DATABASE_URL: 'https://x', TURSO_AUTH_TOKEN: 't' }, { fetchImpl: async () => new Response('blocked', { status: 429 }), nowMs: 0, sleep: async () => {} }), /All InnerTube searches failed/);
});
