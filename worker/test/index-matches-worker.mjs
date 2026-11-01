// index.html must be the worker's player byte-for-byte, except the SF_API_BASE injection.
import worker from '../worker.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const served = await (await worker.fetch(new Request('http://localhost/'), {}, { waitUntil() {} })).text();
const file = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const m = file.match(/^(<!DOCTYPE html><html><head>)\n<script>[\s\S]*?<\/script>(.*)$/s);
assert.ok(m, 'injection block found');
assert.equal(m[1] + m[2], served.replace('<head>', '<head>'), 'index.html == worker player');
console.log('index.html matches worker player');
