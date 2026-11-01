import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from './collect.mjs';

const mockSearch = {
  contents: [
    { videoRenderer: { videoId: 'AAAAAAAAAAA', title: { runs: [{ text: 'Funny Hindi comedy scene' }] }, ownerText: { runs: [{ text: 'Chan One', navigationEndpoint: { browseEndpoint: { browseId: 'UCone' } } }] }, lengthText: { simpleText: '0:42' } } },
    { reelShelf: { items: [{ shortsLockupViewModel: { title: { content: 'Motivation Hindi reel' }, onTap: { innertubeCommand: { reelWatchEndpoint: { videoId: 'BBBBBBBBBBB' } } } } }] } },
    { videoRenderer: { videoId: 'CCCCCCCCCCC', title: { simpleText: 'Long Hindi video' }, lengthText: { simpleText: '14:00' } } },
    { videoRenderer: { videoId: 'DDDDDDDDDDD', title: { simpleText: 'Hindi funny sex joke' }, lengthText: { simpleText: '0:30' } } },
  ],
};

test('parseSearch keeps Shorts only, drops long videos', () => {
  const ids = C.parseSearch(mockSearch).map(x => x.id);
  assert.deepEqual(ids, ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'DDDDDDDDDDD']);
});

test('content filters remove blocked terms and non-Hindi', () => {
  const rows = C.toVideoRows(C.parseSearch(mockSearch), 'comedy', 1);
  assert.deepEqual(rows.map(r => r.video_id), ['AAAAAAAAAAA', 'BBBBBBBBBBB']);
});

test('pickQueries rotates across slots and uses Hindi queries', () => {
  const a = C.pickQueries(0, 4), b = C.pickQueries(30 * 60 * 1000, 4);
  assert.equal(a.length, 4);
  assert.notDeepEqual(a.map(x => x.query), b.map(x => x.query));
  for (const q of a) assert.match(q.query, /hindi/i);
});

test('buildExport is deterministic (no timestamp) and maps fields', () => {
  const p = C.buildExport([{ video_id: 'AAAAAAAAAAA', title: 't', channel_name: 'c', category: 'comedy', added_at: 5 }]);
  assert.deepEqual(p, { count: 1, items: [{ id: 'AAAAAAAAAAA', title: 't', channel: 'c', category: 'comedy', added_at: 5 }] });
});

test('runCollect: search -> upsert -> prune -> export end to end with fake fetch', async () => {
  const seen = [];
  const fakeFetch = async (url, init) => {
    if (String(url).includes('youtubei')) return new Response(JSON.stringify(mockSearch), { status: 200 });
    const body = JSON.parse(init.body);
    seen.push(...body.requests.filter(r => r.type === 'execute').map(r => r.stmt.sql));
    const results = body.requests.filter(r => r.type === 'execute').map(r => ({
      type: 'ok',
      response: { type: 'execute', result: r.stmt.sql.startsWith('SELECT') ? {
        cols: [{ name: 'video_id' }, { name: 'title' }, { name: 'channel_name' }, { name: 'category' }, { name: 'added_at' }],
        rows: [[{ type: 'text', value: 'AAAAAAAAAAA' }, { type: 'text', value: 'Funny' }, { type: 'text', value: 'Chan' }, { type: 'text', value: 'comedy' }, { type: 'integer', value: '1' }]],
      } : { cols: [], rows: [], affected_row_count: 1 } },
    }));
    return new Response(JSON.stringify({ results: [...results, { type: 'ok' }] }), { status: 200 });
  };
  const env = { TURSO_DATABASE_URL: 'libsql://db.example.dev', TURSO_AUTH_TOKEN: 't' };
  const r = await C.runCollect(env, { fetchImpl: fakeFetch, nowMs: 0, sleep: async () => {} });
  assert.equal(r.searchOk, 4);
  assert.ok(r.found >= 1);
  assert.ok(seen.some(s => s.startsWith('CREATE TABLE')));
  assert.ok(seen.some(s => s.includes('ON CONFLICT(video_id)')));
  assert.ok(seen.some(s => s.startsWith('DELETE FROM shorts')));
  assert.deepEqual(r.payload.items[0].id, 'AAAAAAAAAAA');
});

test('runCollect throws when every InnerTube search fails', async () => {
  const fakeFetch = async () => new Response('blocked', { status: 429 });
  await assert.rejects(C.runCollect({ TURSO_DATABASE_URL: 'https://x', TURSO_AUTH_TOKEN: 't' }, { fetchImpl: fakeFetch, nowMs: 0, sleep: async () => {} }), /All InnerTube searches failed/);
});
