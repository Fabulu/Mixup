#!/usr/bin/env node
// WAVE 12'S GATE -- the ship, its pods and their shadows, PRODUCED.
//
//   node tools/shipgate.mjs <pairs.bin> <trace.tsv> <seed.bin> [--seed-lf N]
//                           [--break NAME] [--report N]
//
// It joins the two instruments wave 11 and wave 4 left behind and asks one
// question of them:
//
//   pairs.bin   `tools/oracle/w11dl.lua` -- per logic frame, the board's THIRTY
//               staged bucket buffers as they stand at `$23D382` (inside call
//               #4, after every producer, before anything is dropped or
//               cleared) AND the hardware display list at the arm.
//   trace.tsv   `frame.lua` -- per logic frame, the hardware input word off
//               $C08000 (`portin`), which is the replay record.
//   seed.bin    the whole 128 KiB of main RAM at the seed frame.
//
// THE TWO HALVES OF THE CLAIM, and they are separate on purpose:
//
//   (A) STAGED BYTES.  Seed the port, feed it the board's input words, and after
//       every logic frame compare the port's OWN buckets 5, 15 and 19 -- byte
//       for byte, counter included -- against the board's dump of the same
//       instant.  This is the producers.
//   (B) EMITTED ENTRIES.  Take the board's staged bytes for the other twenty-
//       seven buckets, SUBSTITUTE the port's for 5, 15 and 19, run the port's
//       call #4, and compare all 2,560 bytes of $800000..$8009FF against the
//       board's real display list.  This is the producers AND their depth: a
//       record that is right but lands in the wrong entry fails here and passes
//       (A).
//
// (B) is not a second copy of `pgm.py dlgate`.  dlgate feeds call #4 the board's
// bytes for all thirty buckets and proves the TRANSFORM; this feeds it the
// PORT's bytes for three of them and proves the PRODUCERS reach the screen.
// Running both is what makes "0 divergent" mean something in each.
//
// BUCKET 14 IS NOT SUBSTITUTED.  The shots are wave 8's and `fly-around` presses
// no buttons, so the port's bucket 14 is empty on every frame -- and so is the
// board's.  Substituting it would add nothing and would silently couple this
// gate to wave 8's; `pgm.py shotgate` is where that lives.
//
// THE INTERVENTION IS ON EVERY NUMBER HERE.  `fly-around` pins the player's
// ($3e,A6) invulnerability timer at $FF from lf1990 on BOTH sides.  That is why
// the aura record ($24A532, the 5x40 colour-2 sprite) is drawn at all: without
// it the ship is not invulnerable for most of the window and bucket 19 carries
// one record on every frame instead of alternating one and three.  Every count
// below is "under the fly-around invulnerability poke".

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Game, PRODUCED_BUCKETS } from '../src/main.js';
import { buildDisplayList, DL } from '../src/displaylist.js';
import { BUCKETS, COUNTER_BASE, COUNTER_COUNT } from '../src/spritequeue.js';
import { SHIP_MUTATE } from '../src/shipsprite.js';
import { Ram } from '../src/ram.js';

/** The buckets this wave CLAIMS.  Bucket 14 is produced but not substituted --
 *  see the header. */
export const CLAIMED_BUCKETS = [5, 15, 19];

/** Mutations, each of which MUST go red.  A check nobody has seen fail is not a
 *  check (docs/knowledge/03), and wave 6 found two gates that could not fail. */
export const SHIP_MUTATIONS = {
  'no-aura': 'skip the $24A532 invulnerability-aura record entirely',
  'aura-phase-flat': 'do not step ($28,A6) -- the aura freezes on one frame',
  'no-glow': 'skip the $24A632 record (the protection-latch one)',
  'glow-without-prot': 'use posY directly instead of $246EA4\'s sum',
  'pods-rigid': 'put the pods at the ship instead of running $24D12E',
  'no-shadow': 'skip the ground-plane shadows (bucket 5) entirely',
  // MEASURED RED ON ONLY 10 OF 2,200 FRAMES, and that is the finding rather
  // than a weakness: the carry out of the low half is worth ONE unit of
  // 1/64 px on the long axis, and the enqueue's `asr.l #6` only sees it when
  // that unit crosses a 64-boundary.  A rare red is still red; a mutation whose
  // rarity is not written down is a mutation somebody will later delete.
  'shadow-no-borrow': 'do the $FE00FE00 bias as two 16-bit adds (RED on 10 of '
    + '2,200 frames -- the carry is sub-pixel except at a boundary)',
  // DECLARED EXPECTED-GREEN BEFORE THE FIRST RUN AND IT CAME BACK RED, which is
  // the right way round: the declaration was the guess and the gate was the
  // measurement.  The reasoning was "one unit of 1/64 px, thrown away by
  // `asr.l #6`, and it cannot accumulate because $24C33A resets both pods to
  // the ship every frame" -- all true, and it forgot that a unit still crosses
  // a 64-boundary sometimes.  MEASURED: 10 of 2,200 frames.
  'pod-asr-toward-zero': 'round the pods\' `asr.w #2` toward zero instead of '
    + 'toward -infinity (RED on 10 of 2,200 frames, same boundary argument; '
    + 'RED on every frame of pgm.py flyaround\'s `o1x` column)',
  'ship-order-swapped': 'enqueue the ship BEFORE the aura',
  'no-option-object': 'do not run $24C096 at all (wave 11\'s behaviour)',
};

/** ...and the one that must stay GREEN here, declared BEFORE the run.
 *  `hitx-frozen` freezes the ship's X half-extents and leaves its IMAGE alone,
 *  so it moves the four hitbox columns (`pgm.py flyaround` is red on it) and
 *  not one byte of bucket 19.  That separation is the whole reason the hitbox
 *  needed compared columns instead of being trusted to the picture, and running
 *  it here -- expecting green -- is what proves the separation is real. */
export const SHIP_EXPECTED_GREEN = {
  'hitx-frozen': 'the hitbox is not in any sprite record; it is read by '
    + '$2459D0, not drawn. It must be RED on pgm.py flyaround (columns '
    + 'animb0/animb1) and GREEN here.',
};

const argv = process.argv.slice(2);
const pos = argv.filter((a) => !a.startsWith('--'));
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
if (pos.length < 3) {
  console.error('usage: shipgate.mjs <pairs.bin> <trace.tsv> <seed.bin> '
    + '[--seed-lf N] [--break NAME]');
  console.error('mutations:');
  for (const [k, v] of Object.entries(SHIP_MUTATIONS)) {
    console.error(`  ${k.padEnd(22)} ${v}`);
  }
  process.exit(2);
}
const brk = opt('break', null);
if (brk && !SHIP_MUTATIONS[brk] && !SHIP_EXPECTED_GREEN[brk]) {
  console.error(`FAIL unknown mutation '${brk}'`);
  process.exit(2);
}
const maxReport = Number(opt('report', 6));
const tablesPath = opt('tables',
  fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url)));

// ------------------------------------------------------------------ inputs
function readPairs(path) {
  const buf = readFileSync(path);
  const out = new Map();
  let p = 0;
  while (p + 8 <= buf.length) {
    const lf = buf.readUInt32BE(p); p += 4;
    const sl = buf.readUInt32BE(p); p += 4;
    if (p + sl + 0xa00 + 4 > buf.length) break;
    const staged = buf.subarray(p, p + sl); p += sl;
    const list = buf.subarray(p, p + 0xa00); p += 0xa00;
    const pl = buf.readUInt32BE(p); p += 4;
    if (p + pl > buf.length) break;
    p += pl;
    // staged = u32 nbuckets | u32 0 | 60 B counters | u32 $80B054
    //          | nbuckets x (u32 addr | u32 len | len bytes)
    const nb = staged.readUInt32BE(0);
    let q = 8;
    const counters = staged.subarray(q, q + 60); q += 60;
    const b054 = staged.readUInt32BE(q); q += 4;
    const buckets = [];
    for (let i = 0; i < nb; i++) {
      const addr = staged.readUInt32BE(q); q += 4;
      const len = staged.readUInt32BE(q); q += 4;
      buckets.push({ addr, len, bytes: staged.subarray(q, q + len) });
      q += len;
    }
    out.set(lf, { counters, b054, buckets, list });
  }
  return out;
}

function readTsv(path) {
  const lines = readFileSync(path, 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split('\t');
  return lines.slice(1).map((l) => {
    const f = l.split('\t');
    const o = {};
    head.forEach((h, i) => { o[h] = f[i]; });
    return o;
  });
}

const pairs = readPairs(pos[0]);
const rows = readTsv(pos[1]);
const byLf = new Map(rows.map((r) => [Number(r.lf), r]));
const seed = new Uint8Array(readFileSync(pos[2]));
const tables = JSON.parse(readFileSync(tablesPath, 'utf8'));
const seedLf = Number(opt('seed-lf', rows[0].lf));
const start = byLf.get(seedLf);
if (!start) throw new Error(`the trace has no logic frame ${seedLf}`);
if (start.portin === undefined) {
  throw new Error('the trace has no `portin` column -- re-run with PROBE_PORTIN=1');
}
if (!pairs.has(seedLf)) {
  throw new Error(`pairs.bin has no logic frame ${seedLf}; W11_FROM must be <= `
    + `the seed frame or the two instruments cover different windows`);
}

// The poke, applied on BOTH sides at the same point, exactly as portdiff does.
const pokes = (opt('poke', '') || '').split(',').filter(Boolean).map((kv) => {
  const [a, v] = kv.split('=');
  return [parseInt(a, 16), parseInt(v, 16)];
});

const game = new Game(seed, tables, {
  logicFrame: seedLf, videoFrame: Number(start.vf),
});
if (brk) installBreak(brk, game);

// ------------------------------------------------------------------ the run
const stagedBad = new Map();      // bucket -> first divergence
const listBad = [];
let frames = 0, stagedDivergent = 0, listDivergent = 0, thrown = 0;
const census = new Map(CLAIMED_BUCKETS.map((b) => [b, new Map()]));
const digest = createHash('sha256');
const listRam = new Ram(null);
let listSeeded = false;
let last = seedLf;

for (let lf = seedLf + 1; ; lf++) {
  const row = byLf.get(lf);
  const pair = pairs.get(lf);
  if (!row || !pair) break;
  for (const [a, v] of pokes) game.ram.setU8(a, v);
  try {
    game.step(Number(row.portin));
  } catch (e) {
    console.log(`lf${lf}: THE PORT THREW -- ${e.message}`);
    thrown++;
    break;
  }
  frames++; last = lf;

  // ---------------------------------------------------------------- (A)
  const portByBucket = new Map(game.staged.map((s) => [s.i, s]));
  for (const b of CLAIMED_BUCKETS) {
    const mine = portByBucket.get(b);
    const theirs = pair.buckets[b];
    const key = `${theirs.len}`;
    census.get(b).set(key, (census.get(b).get(key) ?? 0) + 1);
    digest.update(`${lf}:${b}:${Buffer.from(mine.bytes).toString('hex')}\n`);
    if (mine.count !== theirs.len) {
      stagedDivergent++;
      if (!stagedBad.has(b)) {
        stagedBad.set(b, `lf${lf}: bucket ${b} has ${mine.count / 12} record(s) `
          + `in the port and ${theirs.len / 12} on the board`);
      }
      continue;
    }
    let at = -1;
    for (let k = 0; k < theirs.len; k++) {
      if (mine.bytes[k] !== theirs.bytes[k]) { at = k; break; }
    }
    if (at >= 0) {
      stagedDivergent++;
      if (!stagedBad.has(b)) {
        const r = Math.floor(at / 12);
        const hex = (u8, o) => Array.from({ length: 12 }, (_, i) =>
          u8[o + i].toString(16).padStart(2, '0')).join('');
        stagedBad.set(b, `lf${lf}: bucket ${b} record ${r} byte ${at % 12}`
          + `\n      port  ${hex(mine.bytes, r * 12)}`
          + `\n      board ${hex(theirs.bytes, r * 12)}`);
      }
    }
  }

  // ---------------------------------------------------------------- (B)
  // The board's staged set with the port's three buckets substituted, then the
  // port's own call #4 over it.  The display-list buffer CARRIES across frames
  // -- the board never clears $800000..$8009FF and the residue is real state
  // (wave 11 §the gate) -- so it is seeded once and then produced by the port.
  if (!listSeeded) {
    for (let k = 0; k < 0xa00; k++) listRam.setU8(DL.list + k, pair.list[k]);
    listSeeded = true;
  }
  for (let i = 0; i < COUNTER_COUNT; i++) {
    listRam.setU16(COUNTER_BASE + i * 2, pair.counters.readUInt16BE(i * 2));
  }
  listRam.setU32(DL.globalOffset, pair.b054);
  for (let i = 0; i < pair.buckets.length; i++) {
    const src = pair.buckets[i];
    for (let k = 0; k < src.len; k++) listRam.setU8(src.addr + k, src.bytes[k]);
  }
  for (const b of CLAIMED_BUCKETS) {
    const mine = portByBucket.get(b);
    listRam.setU16(BUCKETS[b].counter, mine.count);
    for (let k = 0; k < mine.count; k++) {
      listRam.setU8(BUCKETS[b].buffer + k, mine.bytes[k]);
    }
  }
  buildDisplayList(listRam, {});
  let bad = -1;
  for (let k = 0; k < 0xa00; k++) {
    if (listRam.u8(DL.list + k) !== pair.list[k]) { bad = k; break; }
  }
  if (bad >= 0) {
    listDivergent++;
    if (listBad.length < maxReport) {
      const ent = Math.floor(bad / 10);
      const p5 = [], b5 = [];
      for (let w = 0; w < 5; w++) {
        p5.push(listRam.u16(DL.list + ent * 10 + w * 2).toString(16).padStart(4, '0'));
        b5.push((((pair.list[ent * 10 + w * 2] << 8)
          | pair.list[ent * 10 + w * 2 + 1])).toString(16).padStart(4, '0'));
      }
      listBad.push(`lf${lf}: entry ${ent} word ${Math.floor((bad % 10) / 2)}`
        + `\n      port  ${p5.join(' ')}\n      board ${b5.join(' ')}`);
    }
  }
}

// ------------------------------------------------------------------ report
console.log(`SEED   lf=${seedLf}   ${frames} logic frames compared `
  + `(lf ${seedLf + 1}..${last})`);
console.log(`BUCKETS claimed ${CLAIMED_BUCKETS.join(' ')} of the thirty; the `
  + `other ${30 - CLAIMED_BUCKETS.length} come from the BOARD's staged bytes, `
  + `so (B) tests this wave's producers and not the rest of the game`);
console.log(`PRODUCED by the port this run: ${PRODUCED_BUCKETS.join(' ')} `
  + `(14 is wave 8's and is empty in a button-free scenario)`);
for (const b of CLAIMED_BUCKETS) {
  const c = [...census.get(b)].sort((x, y) => Number(x[0]) - Number(y[0]));
  console.log(`  bucket ${String(b).padStart(2)}  board record-count histogram: `
    + c.map(([len, n]) => `${Number(len) / 12}rec:${n}f`).join(' '));
}
console.log(`STAGED BYTES  divergent bucket-frames: ${stagedDivergent}`);
for (const [, msg] of stagedBad) console.log('  ' + msg);
console.log(`EMITTED LIST  divergent frames: ${listDivergent}`);
for (const m of listBad) console.log('  ' + m);
console.log(`DIGEST ${digest.digest('hex').slice(0, 16)} (the port's own staged `
  + `bytes; same inputs must give the same digest -- NOTES-replay.md §2)`);
console.log(`UNPORTED calls (counted, never silent):`);
for (const l of game.unportedLog.report().slice(0, 12)) console.log('  ' + l);

const failed = thrown > 0 || stagedDivergent > 0 || listDivergent > 0
  || frames === 0;
console.log(failed
  ? `RESULT ${stagedDivergent} staged and ${listDivergent} list divergences over `
    + `${frames} frames${thrown ? ' (and the port THREW)' : ''}`
  : `RESULT 0 DIVERGENT FRAMES over ${frames} logic frames, staged AND emitted`);
process.exit(failed ? 1 : 0);

// ------------------------------------------------------------------ breaks
function installBreak(name, g) {
  // The same discipline `tools/breakage.mjs` uses for wave 4's `clamp-first`:
  // a NAMED SWITCH in the shipped file, flipped from outside, so the red run is
  // reproducible from the command line by anyone and there is no `if (TESTING)`
  // anywhere in src/.
  SHIP_MUTATE.value = name;
  void g;
}
