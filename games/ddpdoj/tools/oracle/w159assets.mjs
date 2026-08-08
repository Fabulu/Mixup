#!/usr/bin/env node
// W159 executable audit for the owner-visible chain rectangle and missing bar.
// It reads the same-frame MAME observations from .scratch/w159-oracle and the
// currently published browser bundle. This is a defect fixture: it stays green
// only while the exact W159 omission is present, and must be replaced by a
// positive coverage gate when the implementation wave lands.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle } from '../../src/web/assets.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const assets = path.join(root, 'games/ddpdoj/assets');
const tsvPath = path.join(root, '.scratch/w159-oracle/w159-chain.tsv');
const breakAudit = process.argv.includes('--break-audit');

const bundle = await loadBundle(async (name) =>
  new Uint8Array(fs.readFileSync(path.join(assets, name))));
const lines = fs.readFileSync(tsvPath, 'utf8').trim().split(/\r?\n/);
const names = lines.shift().split('\t');
const rows = lines.map((line) => Object.fromEntries(
  line.split('\t').map((value, i) => [names[i], value])));
const byRom = new Map(bundle.manifest.spr.streams.map((x) => [x[0], x]));

const tx = new Set();
const b25 = new Set();
const bar = new Set();
for (const row of rows) {
  for (const name of ['tx435', 'tx436', 'tx437', 'tx499', 'tx500', 'tx501']) {
    const packed = Number.parseInt(row[name], 16) >>> 0;
    if (packed) tx.add(packed >>> 16);
  }
  const tiles = row.b25_tiles ? row.b25_tiles.split(',').map((x) =>
    Number.parseInt(x, 16) >>> 0) : [];
  for (const tile of tiles) b25.add(tile);
  if (Number.parseInt(row.meter, 16) > 0 && tiles.length) {
    bar.add(tiles.at(-1));
  }
}

const missingTx = [...tx].filter((tile) => bundle.sheets.tx.slot[tile] < 0);
const missingB25 = [...b25].filter((rom) => !byRom.has(rom));
const missingBar = [...bar].filter((rom) => !byRom.has(rom));
if (breakAudit) missingBar.pop(); // in-memory RED control only

const assetSource = fs.readFileSync(path.join(root,
  'games/ddpdoj/src/web/assets.js'), 'utf8');
if (!/const TX_TRANSPARENT_PEN = 0;/.test(assetSource)) {
  throw new Error('published missing-TX fallback is no longer pen 0');
}
if (tx.size !== 57 || missingTx.length !== 45) {
  throw new Error(`TX defect extent changed: observed=${tx.size}, missing=${missingTx.length}`);
}
if (b25.size !== 161 || missingB25.length !== 158) {
  throw new Error(`bucket-25 defect extent changed: observed=${b25.size}, missing=${missingB25.length}`);
}
if (bar.size !== 32 || missingBar.length !== 32) {
  throw new Error(`bar defect extent changed: observed=${bar.size}, missing=${missingBar.length}`);
}

const hexes = (xs) => xs.map((x) => `$${x.toString(16).toUpperCase()}`).join(' ');
console.log('PASS W159 published-asset defect fixture');
console.log(`  TX observed=${tx.size}, missing=${missingTx.length}: ${hexes(missingTx)}`);
console.log(`  bucket25 observed=${b25.size}, missing=${missingB25.length}`);
console.log(`  chain-bar observed=${bar.size}, missing=${missingBar.length}: ${hexes([...bar])}`);
console.log('  missing TX fallback is pen 0; board transparency is pen 15');
