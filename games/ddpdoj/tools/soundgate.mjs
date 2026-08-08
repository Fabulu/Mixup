#!/usr/bin/env node
// WAVE A (SOUND) -- the mailbox-digest gate runner.
//
// Companion to tests/sound.test.js. The unit test proves the post+tail+pack+
// enqueue+drain transform is byte-exact against every door in the de-duped
// mailbox oracle. This tool reports the oracle's own shape -- the (type,id)
// census, the total door count and the oracle digest -- and is the hook a
// future frame-level replay compares against once a stage1-deep seed + portin
// recording exists for the port (the measured deferral; see the worklog).
//
//   node tools/soundgate.mjs                 # oracle census + digest
//   node tools/soundgate.mjs --doors log.bin # compare a recorded door stream
//
// The de-dupe (collapsing consecutive identical OOOO=VVVV pairs) undoes the
// MAME tap artifact documented in 135-sound-architect-plan.md premise 2: every
// payload was emitted twice by one live writer ($18AD4C in the BIOS pump), so
// the oracle the port must reproduce is the de-duped stream, not the raw tap.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SoundState } from '../src/sound.js';

const ORACLE_PATH = fileURLToPath(
  new URL('../tests/fixtures/mailbox_dedup.tsv', import.meta.url));

function loadOracle() {
  const rows = [];
  const lines = readFileSync(ORACLE_PATH, 'utf-8').split('\n');
  for (const ln of lines.slice(1)) {
    if (!ln.trim()) continue;
    const [door, lf, t, p, i, ch] = ln.split('\t');
    const type = parseInt(t.slice(1), 16);
    const pan = parseInt(p.slice(1), 16);
    const id = parseInt(i.slice(1), 16);
    const chan = parseInt(ch.slice(1), 16);
    rows.push({ lf: Number(lf), type, pan, id, chan,
      word: ((type << 24) | (pan << 16) | (id << 8) | chan) >>> 0 });
  }
  return rows;
}

const rows = loadOracle();
let digest = 0;
const census = new Map();
const lfSpan = { min: Infinity, max: -Infinity };
for (const r of rows) {
  digest = SoundState.fold(digest, r.word);
  const k = `$${r.type.toString(16).padStart(2, '0')}/$${r.id.toString(16).padStart(2, '0')}`;
  census.set(k, (census.get(k) ?? 0) + 1);
  if (r.lf < lfSpan.min) lfSpan.min = r.lf;
  if (r.lf > lfSpan.max) lfSpan.max = r.lf;
}

console.log(`SOUND ORACLE: ${rows.length} de-duped cue doors (lf ${lfSpan.min}..${lfSpan.max})`);
console.log(`oracle digest: $${digest.toString(16).padStart(4, '0')}  (port must match byte-for-byte)`);
console.log(`distinct (type,id): ${census.size}`);
console.log(`census (type/id -> fires), top 12:`);
const top = [...census.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
for (const [k, n] of top) {
  console.log(`  ${k}  ${String(n).padStart(4)}x`);
}

// The frame-level comparison hook. Not callable today (no stage1-deep replay),
// but documented here so the contract is explicit: a future replay feeds the
// port's game.sound.doorLog and this gate joins it to the oracle by lf.
const doorFile = process.argv[2];
if (doorFile === '--doors') {
  console.log('\nNOTE: --doors needs a recorded door stream; the port has no stage1-deep');
  console.log('      seed/portin yet (the measured deferral). The unit test in');
  console.log('      tests/sound.test.js is the live proof in the meantime.');
}
