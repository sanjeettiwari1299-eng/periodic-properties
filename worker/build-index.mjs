// Builds ../index.html from the EXACT worker player: calls worker.fetch(GET /) and takes the HTML it serves.
// Only addition: a small script before the page that lets the page call a remote worker (SF_API_BASE).
import worker from './worker.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const res = await worker.fetch(new Request('http://localhost/'), {}, { waitUntil() {} });
const html = await res.text();
if (res.status !== 200 || !html.includes('<html')) throw new Error('worker did not return the player page');

const inject = `<script>
/* SF_API_BASE: worker ka URL (jaise https://shortsfire.<you>.workers.dev). Khali = same origin (worker khud ye page serve kare). */
window.SF_API_BASE = '';
(function(){var f=window.fetch;window.fetch=function(i,o){if(typeof i==='string'&&i.charAt(0)==='/'&&window.SF_API_BASE)i=window.SF_API_BASE+i;return f.call(this,i,o);};})();
</script>`;
const out = html.replace('<head>', '<head>\n' + inject);
if (out === html) throw new Error('could not inject config (no <head>)');
writeFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), out);
console.log('index.html written, bytes:', out.length);
