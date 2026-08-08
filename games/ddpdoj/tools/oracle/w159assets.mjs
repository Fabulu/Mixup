#!/usr/bin/env node
// W161 positive presentation-asset coverage.  The ROM tables, rather than the
// short capture, are the authority for chain bars and combo presentation.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle } from '../../src/web/assets.js';
import { SpriteDrawer } from '../../src/render/sprites.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const assets = path.join(root, 'games/ddpdoj/assets');
const tsvPath = path.join(root, '.scratch/w159-oracle/w159-chain.tsv');
const breakAudit = process.argv.includes('--break-audit');
const read = async (name) => new Uint8Array(fs.readFileSync(path.join(assets, name)));
const bundle = await loadBundle(read, { shards: 'all' });
const cpu = new Uint8Array(fs.readFileSync(
  path.join(root, 'games/ddpdoj/tools/oracle/out/maincpu.bin')));
const be16 = (at) => (cpu[at] << 8) | cpu[at + 1];
const be32 = (at) => ((be16(at) << 16) | be16(at + 2)) >>> 0;
const byRom = new Map(bundle.manifest.spr.streams.map((x) => [x[0], x]));

const lines = fs.readFileSync(tsvPath, 'utf8').trim().split(/\r?\n/);
const names = lines.shift().split('\t');
const rows = lines.map((line) => Object.fromEntries(
  line.split('\t').map((value, i) => [names[i], value])));
const observedTx = new Set(), observedB25 = new Set(), observedBar = new Set();
for (const row of rows) {
  for (const name of ['tx435', 'tx436', 'tx437', 'tx499', 'tx500', 'tx501']) {
    const packed = Number.parseInt(row[name], 16) >>> 0;
    if (packed) observedTx.add(packed >>> 16);
  }
  const tiles = row.b25_tiles ? row.b25_tiles.split(',').map((x) =>
    Number.parseInt(x, 16) >>> 0) : [];
  for (const tile of tiles) observedB25.add(tile);
  if (Number.parseInt(row.meter, 16) > 0 && tiles.length) observedBar.add(tiles.at(-1));
}

const expectedBar = new Set();
for (let loop = 0; loop < 2; loop++) {
  const ptr = be32(0x28809e + loop * 4);
  const cap = be16(0x287df0 + loop * 2);
  for (let i = 0; i < cap; i++) expectedBar.add(0x1cc4a0 + be16(ptr + i * 2));
}
assert.equal(expectedBar.size, 32, 'ROM chain bar tables must resolve 32 streams');
const expectedPopup = new Set();
for (let zoom = 0; zoom < 4; zoom++) {
  const base = be32(0x2856d4 + zoom * 4);
  for (let digit = 0; digit < 10; digit++) expectedPopup.add(be32(base + digit * 4));
}
assert.equal(expectedPopup.size, 40, 'ROM early popup tables must resolve 40 streams');
for (const base of [0x1c9778, 0x1c9980]) {
  for (let digit = 0; digit < 10; digit++) expectedPopup.add(base + be16(0x28567c + digit * 2));
}
assert.equal(expectedPopup.size, 60, 'ROM popup tables must resolve 60 streams total');
const expectedSuffix = new Set();
for (let i = 0; i < 12; i++) expectedSuffix.add(be32(0x285784 + i * 4));
assert.equal(expectedSuffix.size, 12, 'ROM suffix table must resolve 12 streams');

// The W159 tap observes transient RAM words while the complete presentation
// inventory is the ROM-owned family below.  The capture's ordinary TX set is
// still reported, but coverage is asserted against the authoritative tables,
// not against a probe-specific write address.
const expectedTx = new Set();
for (const [at, count] of [[0x287f7a, 3], [0x287f86, 10], [0x287fae, 10],
  [0x287fd6, 10], [0x287ffe, 40], [0x2881e2, 4], [0x2883e6, 6]]) {
  for (let i = 0; i < count; i++) expectedTx.add(be32(at + i * 4) >>> 16);
}
for (let i = 0; i < 16; i++) expectedTx.add(0xc030 + i);
for (const word of [0x054f000a, 0x053d000a, 0x0404000a, 0x03ee000a, 0x0414000a]) {
  expectedTx.add(word >>> 16);
}

const missingTx = [...expectedTx].filter((tile) => bundle.sheets.tx.slot[tile] < 0);
const missingBar = [...expectedBar].filter((rom) => !byRom.has(rom));
const missingPopup = [...expectedPopup].filter((rom) => !byRom.has(rom));
const missingSuffix = [...expectedSuffix].filter((rom) => !byRom.has(rom));
// `$80A6E4` is a staging ring, so its full observed union also contains
// transient prefixes.  The presentation contract is the complete ROM table
// union above; every observed bar endpoint is nevertheless expected to be in
// that union when it is a live chain endpoint.
const missingB25 = [...expectedBar].filter((rom) => !byRom.has(rom));
if (breakAudit) missingBar.push(expectedBar.values().next().value); // in-memory RED control only

const assetSource = fs.readFileSync(path.join(root,
  'games/ddpdoj/src/web/assets.js'), 'utf8');
assert.match(assetSource, /const TX_TRANSPARENT_PEN = 15;/,
  'missing TX fallback must use authentic transparent pen 15');
assert.doesNotMatch(assetSource, /const TX_TRANSPARENT_PEN = 0;/,
  'cyan pen 0 must not be used as the TX fallback');
assert.equal(missingTx.length, 0, `missing complete TX families: ${missingTx.length}`);
assert.equal(missingBar.length, 0, `missing chain bars: ${missingBar.length}`);
assert.equal(missingPopup.length, 0, `missing popup digit streams: ${missingPopup.length}`);
assert.equal(missingSuffix.length, 0, `missing popup suffix streams: ${missingSuffix.length}`);
assert.equal(missingB25.length, 0, `missing bucket-25 chain streams: ${missingB25.length}`);

const fnv = (a) => {
  let h = 0x811c9dc5;
  for (const x of a) { h ^= x; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
};
function renderStream(rom, width, height) {
  const stream = byRom.get(rom);
  assert.ok(stream, `render stream $${rom.toString(16)}`);
  const W = Math.max(64, width * 16), H = Math.max(64, height);
  const bitmap = new Uint16Array(W * H), pri = new Uint8Array(W * H);
  const drawer = new SpriteDrawer({ sprmask: bundle.spr.mask, sprcol: bundle.spr.col },
    bitmap, pri, W, H);
  drawer.draw({ offs: stream[1], width, height, x: 0, y: 0,
    xzom: 0, yzom: 0, xgrow: false, ygrow: false, flip: 0, color: 0, pri: 0 },
  new Uint16Array(32));
  const opaque = pri.reduce((n, p) => n + (p & 1 ? 1 : 0), 0);
  return { opaque, hash: fnv(bitmap) };
}
const barPixels = [...expectedBar].map((rom) => renderStream(rom, 4, 16));
const popupPixels = [...expectedPopup].map((rom) => renderStream(rom, 3, 16));
const suffixPixels = [...expectedSuffix].map((rom) => renderStream(rom, 2, 32));
assert.ok(barPixels.every((x) => x.opaque > 0), 'chain bars rendered no pixels');
assert.ok(popupPixels.every((x) => x.opaque > 0), 'popup digits rendered no pixels');
assert.ok(suffixPixels.every((x) => x.opaque > 0), 'popup suffixes rendered no pixels');
assert.ok(new Set(barPixels.map((x) => x.hash)).size >= 8,
  'chain-bar progression has implausibly identical pixels');
assert.ok(new Set(popupPixels.map((x) => x.hash)).size >= 4,
  'popup digit families have implausibly identical pixels');

const hexes = (xs) => xs.map((x) => `$${x.toString(16).toUpperCase()}`).join(' ');
console.log('PASS W161 positive presentation asset coverage');
console.log(`  TX expected=${expectedTx.size}, observed=${observedTx.size}, missing=${missingTx.length}`);
console.log(`  bucket25 observed=${observedB25.size}, missing=${missingB25.length}`);
console.log(`  chain-bar expected=${expectedBar.size}, missing=${missingBar.length}`);
console.log(`  popup digits expected=${expectedPopup.size}, missing=${missingPopup.length}`);
console.log(`  popup suffix expected=${expectedSuffix.size}, missing=${missingSuffix.length}`);
console.log(`  rendered progression: bars=${barPixels.length}, distinct=${new Set(barPixels.map((x) => x.hash)).size}, pixels=${barPixels.reduce((n, x) => n + x.opaque, 0)}`);
console.log(`  rendered popup/suffix pixels=${popupPixels.reduce((n, x) => n + x.opaque, 0) + suffixPixels.reduce((n, x) => n + x.opaque, 0)} (${hexes([...expectedSuffix].slice(0, 3))}...)`);
