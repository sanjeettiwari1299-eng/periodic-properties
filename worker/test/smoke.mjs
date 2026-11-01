// Runs the EXACT worker.js against a local libSQL (Hrana v2 pipeline) server.
// Same wire protocol as LayerBase libSQL / Turso, so this exercises the real code paths.
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import worker from '../worker.js';

const db = new DatabaseSync(':memory:');
const enc = v => v === null || v === undefined ? { type: 'null' } : typeof v === 'number' ? { type: 'integer', value: String(Math.trunc(v)) } : { type: 'text', value: String(v) };
const dec = a => a.type === 'null' ? null : a.type === 'integer' ? Number(a.value) : a.type === 'float' ? Number(a.value) : a.value;
const TOKEN = 'lb_test_token';
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    if (req.headers.authorization !== 'Bearer ' + TOKEN) { res.writeHead(401); return res.end('unauthorized'); }
    const { requests } = JSON.parse(body || '{}');
    const results = [];
    for (const r of requests) {
      if (r.type === 'close') { results.push({ type: 'ok', response: { type: 'close' } }); continue; }
      try {
        const st = db.prepare(r.stmt.sql);
        const args = (r.stmt.args || []).map(dec);
        if (/^\s*(select|with|pragma)/i.test(r.stmt.sql)) {
          const rows = st.all(...args);
          const cols = rows.length ? Object.keys(rows[0]).map(name => ({ name })) : [];
          results.push({ type: 'ok', response: { type: 'execute', result: { cols, rows: rows.map(o => Object.values(o).map(enc)), affected_row_count: 0 } } });
        } else {
          const info = st.run(...args);
          results.push({ type: 'ok', response: { type: 'execute', result: { cols: [], rows: [], affected_row_count: Number(info.changes), last_insert_rowid: String(info.lastInsertRowid) } } });
        }
      } catch (e) { results.push({ type: 'error', error: { message: String(e.message || e) } }); }
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ results }));
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const env = { TURSO_DATABASE_URL: `http://127.0.0.1:${port}`, TURSO_AUTH_TOKEN: TOKEN, CRON_SECRET: 'sekret' };
const ctx = { waitUntil: p => p && p.catch && p.catch(() => {}) };
const call = async (path, init) => {
  const res = await worker.fetch(new Request('http://localhost' + path, init), env, ctx);
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text };
};

// 1) health + page
const h = await call('/api/stats?userId=smoke');
console.log('stats ok:', h.status);
const page = await call('/');
assert.equal(page.status, 200);
assert.ok(page.text.includes('<html'), 'serves player page');

// 2) seed videos directly (what collect() would insert), then read the feed through the real code
const now = Math.floor(Date.now());
await call('/api/feed?userId=smoke&mood=focus&limit=5'); // triggers schema creation
const cats = ['comedy','motivation','bhakti','tech','psychology'];
for (let i = 0; i < 60; i++) {
  const c = cats[i % cats.length];
  db.prepare('INSERT OR IGNORE INTO videos(video_id,title,channel_id,channel_name,category,added_at,source,views,likes,duration) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run('VID' + String(i).padStart(8, '0'), 'Hindi ' + c + ' clip ' + i + ' #Shorts', 'UC' + (i % 6), 'chan' + (i % 6), c, now - i * 3600_000, 'smoke', 100 + i, 5, 45);
}
const feed = await call('/api/feed?userId=smoke&mood=focus&limit=20');
console.log('feed:', feed.status, feed.json && feed.json.ok, 'videos:', feed.json && feed.json.videos && feed.json.videos.length);
assert.equal(feed.status, 200);
assert.ok(feed.json.videos.length > 0 && feed.json.videos.length <= 20, 'feed returns videos');
const first = feed.json.videos[0].id;

// 3) signals update prefs (exact recordSignal path)
const sig = await call('/api/signal', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'smoke', videoId: first, event: 'like', mood: 'focus' }) });
console.log('signal like:', sig.status, sig.text.slice(0, 120));
const stats = await call('/api/stats?userId=smoke');
console.log('stats:', stats.status, stats.text.slice(0, 200));

// 3b) CORS: Pages-hosted index.html calls the worker cross-origin
const pre = await worker.fetch(new Request('http://localhost/api/signal', { method: 'OPTIONS', headers: { origin: 'https://sanjeettiwari1299-eng.github.io', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } }), env, ctx);
assert.equal(pre.status, 204);
assert.equal(pre.headers.get('access-control-allow-origin'), '*');
assert.match(pre.headers.get('access-control-allow-methods'), /POST/);
const cfeed = await worker.fetch(new Request('http://localhost/api/feed?userId=smoke&mood=focus&limit=5', { headers: { origin: 'https://sanjeettiwari1299-eng.github.io' } }), env, ctx);
assert.equal(cfeed.status, 200);
assert.equal(cfeed.headers.get('access-control-allow-origin'), '*');
assert.match(cfeed.headers.get('content-type'), /application\/json/);
const csig = await worker.fetch(new Request('http://localhost/api/signal', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://sanjeettiwari1299-eng.github.io' }, body: JSON.stringify({ userId: 'smoke', videoId: 'VID00000000', event: 'skip', mood: 'focus' }) }), env, ctx);
assert.equal(csig.headers.get('access-control-allow-origin'), '*');
console.log('CORS ok');

// 4) cron path: exact scheduled() handler (YouTube key absent => collect degrades, must not throw)
await worker.scheduled({ cron: '17 */6 * * *' }, env, ctx);
await new Promise(r => setTimeout(r, 300));
console.log('scheduled ran without throwing');

server.close();
console.log('SMOKE OK');
