import assert from 'node:assert/strict';
import { collect, parseSeconds, plan } from './fetch-shorts.mjs';

// shelf-style and videoRenderer-style results, same shapes InnerTube returns
const mock = { contents: [
  { videoRenderer: { videoId: 'abcdefghijk', title: { runs: [{ text: 'Funny Hindi' }] }, ownerText: { runs: [{ text: 'ChanA' }] }, lengthText: { simpleText: '0:45' } } },
  { reelShelf: { items: [{ shortsLockupViewModel: { title: { content: 'Motivation reel' }, onTap: { innertubeCommand: { reelWatchEndpoint: { videoId: 'ZYXWVUTSRQP' } } } } }] } },
  { videoRenderer: { videoId: 'LONGVIDEO11', title: { simpleText: 'Long' }, lengthText: { simpleText: '12:00' } } }
] };
const found = collect(mock).map(x => x.id);
assert.deepEqual(found, ['abcdefghijk', 'ZYXWVUTSRQP', 'LONGVIDEO11']);
assert.equal(parseSeconds('0:45'), 45);
assert.equal(parseSeconds('1:02:03'), 3723);
const p = plan();
assert.ok(p.length > 10 && p.every(([c, q]) => c && q.includes('#Shorts') || /Hindi|Hindi|shorts|songs|music/i.test(q)));
assert.ok(!p.some(([c]) => c === 'gaming'), 'excluded categories not planned');
console.log('fetch-shorts parser tests passed');
