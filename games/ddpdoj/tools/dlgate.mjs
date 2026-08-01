// THE STAGED-BYTES REPLAY GATE (wave 11).
//
// Main-loop call #4 is a PURE TRANSFORM: thirty bucket counters plus their
// staging buffers in, the hardware display list at $800000..$8009FF out.  So it
// can be gated to the byte TODAY, with no gameplay simulation at all -- feed the
// port the BOARD's staged bytes and compare the BOARD's list against the port's.
// Any difference is the port's translation and nothing else's, which is exactly
// what makes this wave the keystone: after it, every producer is verified
// against its own bucket instead of against a moving whole-frame target.
//
//   node tools/dlgate.mjs <pairs.bin> [--break NAME] [--zoomram <64 hex chars x16>]
//
// The binary is written by `tools/oracle/w11dl.lua`; one record per logic frame:
//
//   u32 lf | u32 stagedLen | staged | 2560 bytes of $800000..$8009FF
//          | u32 postLen | post
//   staged = u32 nbuckets | u32 0 | 60 bytes of counters ($80AFC0..$80AFFB)
//          | u32 $80B054 | nbuckets x (u32 addr | u32 len | len bytes)
//   post   = 64 bytes @ $80AFC0 | 6 bytes @ $80B000 | 2 bytes @ $80393C
//            -- call #4's OTHER outputs, read at the same arm.  The list alone
//            cannot see a mutation that only moves the budget arithmetic or the
//            pre-emptive drop policy, and a gate that cannot see a mutation is
//            not a gate for it.
//
// THE LIST BUFFER IS CARRIED ACROSS FRAMES, AND THAT IS THE POINT, not a
// shortcut.  MEASURED, first run of this gate: the board's $800000..$8009FF is
// NEVER CLEARED.  Call #4 writes as many entries as it has records, plus the
// ten-byte terminator, and everything past that is RESIDUE from an earlier,
// longer frame -- invisible to the hardware, which stops parsing at the
// terminator, and 1,534 divergent frames to a gate that starts from zeroed RAM.
// So the port keeps ONE 128 KiB image for the whole run, seeded ONCE at the
// first compared frame from the board's own buffer (the residue's history
// predates the window), and every frame after that the residue is produced by
// the PORT's own previous emits.  The comparison is then the whole 2,560 bytes
// rather than a live prefix, which is strictly stronger -- and `livePrefix`
// below reports the hardware-visible half separately so the two can never be
// confused.
//
// Everything call #4 READS is overwritten from the dump every frame (the thirty
// counters, $80B054 and each bucket's staged prefix), so a pass cannot be
// inherited: only the OUTPUT buffer carries.

import { readFileSync } from 'node:fs';
import { Ram } from '../src/ram.js';
import { buildDisplayList, MUTATIONS, DL } from '../src/displaylist.js';
import { COUNTER_BASE, COUNTER_COUNT, BUCKETS } from '../src/spritequeue.js';
import { assertZoomTable, ZOOM_TABLE } from '../src/zoomtable.js';

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--'));
const opt = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : null;
};
const brk = opt('break');
const zoomram = opt('zoomram');
const maxReport = Number(opt('report') ?? 8);

if (!file) {
  console.error('usage: dlgate.mjs <pairs.bin> [--break NAME] [--zoomram HEX]');
  console.error('mutations:');
  for (const [k, v] of Object.entries(MUTATIONS)) console.error(`  ${k.padEnd(24)} ${v}`);
  process.exit(2);
}

// ---------------------------------------------------------------- zoom table
// The port BAKES $23C588 as a constant.  A constant nobody checks is a constant
// that rots, so the probe reads `:igs023:zoomram` off the running machine and
// the gate asserts against it here -- and prints the popcount ramp and entry $F,
// because "the table matched" without saying WHICH table matched is not a check
// anyone can audit.
if (zoomram) {
  const words = zoomram.trim().split(/\s+/).join('');
  if (words.length !== 128) {
    console.error(`FAIL --zoomram is ${words.length} hex chars, expected 128`);
    process.exit(1);
  }
  const w = new Uint16Array(32);
  for (let i = 0; i < 32; i++) w[i] = parseInt(words.slice(i * 4, i * 4 + 4), 16);
  try {
    assertZoomTable(w, 'the running machine (:igs023:zoomram)');
    console.log(`ZOOM TABLE: the running machine matches the baked $23C588 blob `
      + `on all 16 entries; entry $F reads `
      + `${(ZOOM_TABLE[15] >>> 0).toString(16).padStart(8, '0')} and the port `
      + `substitutes 1 (the value the popcount ramp predicts).`);
  } catch (e) {
    console.error(`FAIL ${e.message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------- the replay
const buf = readFileSync(file);
let p = 0;
let frames = 0, divergent = 0;
const reports = [];
const agg = {
  maxRecords: 0, maxEntries: 0, maxFillers: 0, capFrames: 0,
  drop20Frames: 0, drop69Frames: 0, terminatedFrames: 0, b054: new Map(),
  bucketsSeen: new Set(), lfFirst: null, lfLast: null,
};
let thrown = 0;
let divergentLive = 0;
const ram = new Ram(null);
let seeded = false;

/** The bytes the HARDWARE reads: entries up to and including the terminator
 *  (`word4 & $7FFF == 0`), 256 entries max, exactly as igs023's sprite_dma
 *  parses them.  Everything past it is residue. */
function livePrefix(read) {
  for (let i = 0; i < 256; i++) {
    if ((read(i * 10 + 8) & 0x7fff) === 0) return (i + 1) * 10;
  }
  return 0xa00;
}

while (p + 8 <= buf.length) {
  const lf = buf.readUInt32BE(p); p += 4;
  const stagedLen = buf.readUInt32BE(p); p += 4;
  if (p + stagedLen + 0xa00 + 4 > buf.length) break;
  const staged = buf.subarray(p, p + stagedLen); p += stagedLen;
  const board = buf.subarray(p, p + 0xa00); p += 0xa00;
  const postLen = buf.readUInt32BE(p); p += 4;
  if (p + postLen > buf.length) break;
  const post = buf.subarray(p, p + postLen); p += postLen;

  if (!seeded) {
    // The residue predates the window: seed it from the board ONCE.
    for (let k = 0; k < 0xa00; k++) ram.setU8(DL.list + k, board[k]);
    seeded = true;
  }
  let q = 0;
  const nb = staged.readUInt32BE(q); q += 8;
  for (let i = 0; i < COUNTER_COUNT; i++) {
    ram.setU16(COUNTER_BASE + i * 2, staged.readUInt16BE(q + i * 2));
  }
  q += 60;
  ram.setU32(DL.globalOffset, staged.readUInt32BE(q)); q += 4;
  for (let i = 0; i < nb; i++) {
    const addr = staged.readUInt32BE(q); q += 4;
    const len = staged.readUInt32BE(q); q += 4;
    for (let k = 0; k < len; k++) ram.setU8(addr + k, staged[q + k]);
    q += len;
    if (len) agg.bucketsSeen.add(i);
  }

  let t = null;
  try {
    t = buildDisplayList(ram, { mutate: brk ?? undefined, warn: (m) => {
      if (thrown++ < 4) console.log(`  WATCH lf${lf}: ${m}`);
    } });
  } catch (e) {
    divergent++;
    if (reports.length < maxReport) reports.push(`lf${lf}: THREW ${e.message}`);
    continue;
  }

  agg.lfFirst ??= lf; agg.lfLast = lf;
  agg.maxRecords = Math.max(agg.maxRecords, t.records);
  agg.maxEntries = Math.max(agg.maxEntries, t.entries);
  agg.maxFillers = Math.max(agg.maxFillers, t.fillers);
  if (t.capFired) agg.capFrames++;
  if (t.droppedBucket20 || ram.u16(DL.dropped20Flag)) agg.drop20Frames++;
  if (ram.u16(DL.dropped69Flag)) agg.drop69Frames++;
  if (t.terminated) agg.terminatedFrames++;
  const key = t.b054.toString(16).padStart(8, '0');
  agg.b054.set(key, (agg.b054.get(key) ?? 0) + 1);

  let bad = -1;
  for (let k = 0; k < 0xa00; k++) {
    if (ram.u8(DL.list + k) !== board[k]) { bad = k; break; }
  }
  const live = Math.max(livePrefix((o) => (board[o] << 8) | board[o + 1]),
    livePrefix((o) => ram.u16(DL.list + o)));
  // call #4's other outputs: $80AFC0..$80AFFF, $80B000..$80B005, $80393C
  // $80393C is a SHARED BITFIELD.  Call #4 clears bit 0 at $23C1A2 and sets it
  // back at $23C194 and touches nothing else; the board's other bits ($1E of
  // them, measured on this run) belong to subsystems the port does not model,
  // so comparing the whole byte would be red for a reason that is not a defect.
  // Bit 0 IS compared, by mask, and the masking is written here rather than
  // hidden in a tolerance.
  const postRegions = [[0x80afc0, 64, 0xff], [0x80b000, 6, 0xff],
    [0x80393c, 2, 0x01]];
  let badPost = null;
  let pi = 0;
  for (const [addr, len, mask] of postRegions) {
    for (let k = 0; k < len && !badPost; k++) {
      if ((ram.u8(addr + k) & mask) !== (post[pi + k] & mask)) {
        badPost = `$${(addr + k).toString(16)}: port `
          + `${ram.u8(addr + k).toString(16).padStart(2, '0')} board `
          + `${post[pi + k].toString(16).padStart(2, '0')}`
          + (mask !== 0xff ? ` (mask $${mask.toString(16)})` : '');
      }
    }
    pi += len;
  }
  // THE BOARD'S OWN ANSWER to "how many records, how many fillers, was it
  // terminated", counted from three instructions that execute exactly once per
  // thing.  A byte comparison cannot see a missing terminator when the bytes it
  // would have written are already zero -- these can.
  if (post.length >= pi + 6) {
    const bRec = post.readUInt16BE(pi);
    const bFill = post.readUInt16BE(pi + 2);
    const bTerm = post.readUInt16BE(pi + 4);
    if (!badPost && (bRec !== t.records || bFill !== t.fillers
      || bTerm !== (t.terminated ? 1 : 0))) {
      badPost = `the emit's own counters: board records=${bRec} fillers=${bFill}`
        + ` terminators=${bTerm}, port records=${t.records} fillers=${t.fillers}`
        + ` terminators=${t.terminated ? 1 : 0}`;
    }
  }
  frames++;
  if (bad >= 0 && bad < live) divergentLive++;
  if (badPost && bad < 0) {
    divergent++;
    if (reports.length < maxReport) {
      reports.push(`lf${lf}: the display list agrees but call #4's OTHER `
        + `outputs do not -- ${badPost}`);
    }
    continue;
  }
  if (bad >= 0) {
    divergent++;
    if (reports.length < maxReport) {
      const ent = Math.floor(bad / 10), word = Math.floor((bad % 10) / 2);
      const ours = [], theirs = [];
      for (let w = 0; w < 5; w++) {
        ours.push(ram.u16(DL.list + ent * 10 + w * 2).toString(16).padStart(4, '0'));
        theirs.push(((board[ent * 10 + w * 2] << 8) | board[ent * 10 + w * 2 + 1])
          .toString(16).padStart(4, '0'));
      }
      reports.push(`lf${lf}: first differs at $${(DL.list + bad).toString(16)}`
        + ` = entry ${ent} word ${word}\n      port  ${ours.join(' ')}`
        + `\n      board ${theirs.join(' ')}`
        + `\n      (port emitted ${t.records} record(s), ${t.fillers} filler(s),`
        + ` ${t.entries} entries, terminated=${t.terminated},`
        + ` cap=${t.capFired ? `bucket ${t.capBucket}` : 'no'})`);
    }
  }
}

// --census reprints the run as a PER-BUCKET table.  It is here rather than in a
// second tool because it reads the same dump the gate reads, and because the
// ablation's "bucket -> pixels" table is only interpretable next to "how many
// records did that bucket actually have at those frames".
if (argv.includes('--census')) {
  const at = (opt('at') ?? '').split(',').filter(Boolean).map(Number);
  let p2 = 0, n2 = 0;
  const max = new Array(30).fill(0), sum = new Array(30).fill(0);
  const nz = new Array(30).fill(0), atRows = new Map();
  while (p2 + 8 <= buf.length) {
    const lf = buf.readUInt32BE(p2); p2 += 4;
    const sl = buf.readUInt32BE(p2); p2 += 4;
    if (p2 + sl + 0xa00 + 4 > buf.length) break;
    const st = buf.subarray(p2, p2 + sl); p2 += sl;
    p2 += 0xa00;
    const pl = buf.readUInt32BE(p2); p2 += 4 + pl;
    const row = [];
    for (let i = 0; i < 30; i++) {
      const recs = st.readUInt16BE(8 + i * 2) / 12;
      // the counters are in $80AFC0.. order; map to DRAIN order for the table
      row.push(recs);
    }
    const byBucket = new Array(30).fill(0);
    for (let i = 0; i < 30; i++) {
      const ctr = 0x80afc0 + i * 2;
      const b = BUCKETS.findIndex((x) => x.counter === ctr);
      byBucket[b] = row[i];
    }
    for (let b = 0; b < 30; b++) {
      max[b] = Math.max(max[b], byBucket[b]);
      sum[b] += byBucket[b];
      if (byBucket[b]) nz[b]++;
    }
    if (at.includes(lf)) atRows.set(lf, byBucket);
    n2++;
  }
  console.log(`\nPER-BUCKET RECORD CENSUS over ${n2} frames of ${file}`);
  console.log(' bucket  counter   max   mean  frames!=0'
    + at.map((x) => `  lf${x}`).join(''));
  for (let b = 0; b < 30; b++) {
    console.log(`${b.toString().padStart(7)} $${BUCKETS[b].counter.toString(16)
      }  ${String(max[b]).padStart(4)} ${(sum[b] / n2).toFixed(2).padStart(6)} `
      + `${String(nz[b]).padStart(9)}`
      + at.map((x) => String(atRows.get(x)?.[b] ?? '-').padStart(8)).join(''));
  }
}

console.log(`\nSTAGED-BYTES REPLAY GATE  ${file}`);
console.log(`  frames compared          ${frames}`
  + (agg.lfFirst === null ? '' : `  (lf${agg.lfFirst}..lf${agg.lfLast})`));
console.log(`  DIVERGENT FRAMES         ${divergent}`
  + `   (of which hardware-visible, i.e. at or before the terminator: `
  + `${divergentLive})`);
console.log(`  records max/frame        ${agg.maxRecords} of 251`);
console.log(`  entries max/frame        ${agg.maxEntries} of 256   fillers max ${agg.maxFillers}`);
console.log(`  frames the cap fired     ${agg.capFrames}`);
console.log(`  pre-emptive drop b20     ${agg.drop20Frames}   b6+b9 ${agg.drop69Frames}`);
console.log(`  frames terminated        ${agg.terminatedFrames} of ${frames}`);
console.log(`  buckets with any bytes   ${[...agg.bucketsSeen].sort((a, b) => a - b).join(' ')}`);
console.log(`  $80B054                  `
  + [...agg.b054].map(([k, n]) => `${k}:${n}`).join(' '));
for (const r of reports) console.log(`  ${r}`);
if (divergent > reports.length && reports.length === maxReport) {
  console.log(`  ... ${divergent - maxReport} more divergent frame(s)`);
}

if (frames === 0) {
  console.log('FAIL not one frame was compared -- the dump is empty or truncated');
  process.exit(1);
}
console.log(divergent === 0
  ? 'RESULT: 0 DIVERGENT FRAMES -- the port rebuilt the board\'s display list '
    + 'byte for byte from the board\'s staged bucket bytes'
  : `RESULT: ${divergent} DIVERGENT FRAME(S)`);
process.exit(divergent === 0 ? 0 : 1);
