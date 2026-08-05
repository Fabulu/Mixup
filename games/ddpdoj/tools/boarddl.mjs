#!/usr/bin/env node
// WAVE 75 -- READ THE **BOARD'S OWN** DISPLAY LIST OUT OF A CHECKPOINT LADDER,
// AND ATTRIBUTE EVERY ENTRY TO THE OBJECT THAT PRODUCED IT.
//
//   node games/ddpdoj/tools/boarddl.mjs --manifest <dir>/manifest.json
//        [--from LF] [--to LF] [--type 82,05,07] [--json out.json]
//        [--records N]   how many sample records to print per type
//
// WHY THIS EXISTS.  Diagnostic 68 measured, on the PORT, five enemy types that
// are collidable and damageable and never emit a display-list record -- $82,
// $05, $07/$27, $10, $8B -- because their enqueue sites sit inside a fire/state
// tail the port replaces with a counted note (`src/handlers.js:1722` says so in
// its own words).  68 could say those objects are INVISIBLE IN THE PORT.  It
// could not say WHAT THEY ARE, because the port never draws them.
//
// **THE CARTRIDGE DRAWS THEM.**  So the answer is in the board's own display
// list at those frames, and W69's checkpoint ladder already contains it: a
// checkpoint is the whole 128 KiB of main RAM, and main RAM is where the
// display list ($800000..$8009FF), the object table ($80E240) and the sub-record
// pools ($81459C/$81521C) all live.  Nothing here launches an emulator.
//
// ===========================================================================
// HOW A SLOT IS TIED TO AN ENTRY -- the ROM's own arithmetic, not a heuristic
// ===========================================================================
// A collidable object is a $20-byte SUB-RECORD; the same $20 bytes are both the
// collision box and the sprite record (`src/spritequeue.js`, the seven-field
// object-record spec).  `enqueueRequest` ($23D762 and ~130 twins) turns it into
// a 12-byte request:
//
//   long  = i16(+$2) + i16(+$6)      short = i16(+$4) + i16(+$8)
//   d0    = ((((long<<16)|short) >> 6) & $07FF03FF) | $80008000
//   words = [d0>>16, d0&$ffff, u16(+$A), u16(+$C), u16(+$E)]   flip/col = u16(+$1C)
//
// and the emit ($23D624) writes exactly those five words, adds $80B054 to the
// two position fields as ONE 32-bit add, and OR-s the two bytes of the
// flip/colour word over word 2's high byte.  All of that is replicated below,
// so a slot predicts its ENTIRE five-word hardware entry and the match is an
// equality on 80 bits, not a descriptor lookalike.  68 §11.3 flagged the
// descriptor-only match as a floor rather than a measurement; this is the fix.
//
// BUCKET ATTRIBUTION IS RECONSTRUCTED, NOT READ.  The thirty counters at
// $80AFC0.. are cleared at $23D70C, so at the sample point they are all zero.
// The QUEUE ($80397C) and the 29 staging buffers are NOT cleared, and $80AFFC
// still holds the byte count of the queue that was emitted.  The drain
// concatenates the buckets in index order and the guarded copy is an identity
// map, so walking the queue forwards and matching each 12-byte record against
// the head of each staging buffer in turn recovers the boundaries exactly.
// Every entry this tool cannot place is COUNTED AND REPORTED as unplaced.
//
// LABEL.  A ladder is a scripted run.  The manifest's own `intervention` field
// is reprinted on every report, because docs/knowledge/09 is explicit that a
// poked run gives STATES, not a picture of the game.

import fs from 'node:fs';
import path from 'node:path';

// --------------------------------------------------------------- RAM geometry
const RAM_BASE = 0x800000;
const DL = { list: 0x800000, count: 256, stride: 5 };  // 5 u16 per entry
const QUEUE = 0x80397c;
const QUEUE_BYTES = 0x80affc;          // $23D62A, NOT cleared by $23D70C
const GLOBAL_OFFSET = 0x80b054;        // $23D6A6 add.l
const OBJ = { base: 0x80e240, slots: 20, stride: 0x50 };   // main-loop objects
// THE ENEMY TABLE is the one the five invisible types live in -- $263514 lea
// $81332C,A5 / #$39 slots / lea ($50,A5),A5 (src/enemies.js ENEMY).  The
// top-level $80E240 table is the main loop's own objects (player, background,
// spawner) and holds NONE of them; reading it instead is a silent zero, which
// is what this tool did on its first run.
const ENEMY = { table: 0x81332c, slots: 58, stride: 0x50 };
// +$0C is THE TYPE BYTE ($2635F8 move.b ($c,A5),D7 -- the byte the spawn
// dispatch indexes $267824/$27E412 with).  The WORD at +$0 is the liveness /
// band word `(caller's D3 + band index) | $8000`, which counts 0,1,2,... down
// the table and is NOT the type; reading it as one produces a tidy contiguous
// $00..$29 census that looks entirely plausible and is wrong.
const E = { runLen: 0x04, subRec: 0x06, type: 0x0c, classByte: 0x0d, handler: 0x4c };
const POOL_A = 0x81459c, POOL_A_N = 100, POOL_B = 0x81521c, POOL_B_N = 50;
const SUB_STRIDE = 0x20;
const RECORD_BYTES = 12;

// $23D3E0..$23D60E, from src/spritequeue.js BUCKETS -- (index, buffer, capBytes)
const BUCKETS = [
  [0, 0x80397c, 6024], [1, 0x805104, 3012], [2, 0x805cc8, 3012],
  [3, 0x80688c, 3012], [4, 0x8083d4, 300], [5, 0x80862c, 72],
  [6, 0x808674, 240], [7, 0x807450, 3012], [8, 0x808014, 960],
  [9, 0x808764, 240], [10, 0x80a864, 120], [11, 0x80ad8c, 120],
  [12, 0x80af24, 120], [13, 0x80a8dc, 1080], [14, 0x808854, 864],
  [15, 0x808eb4, 48], [16, 0x808bb4, 768], [17, 0x808500, 300],
  [18, 0x80aeac, 120], [19, 0x808ee4, 192], [20, 0x808fa4, 720],
  [21, 0x80a624, 192], [22, 0x809274, 2520], [23, 0x809c4c, 2520],
  [24, 0x80af9c, 36], [25, 0x80a6e4, 384], [26, 0x80ad14, 120],
  [27, 0x80ae04, 120], [28, 0x80ae7c, 24], [29, 0x80ae94, 24],
];

const FILLER = [0xfc00, 0x3800, 0x0000, 0x0000, 0x0201];

// -------------------------------------------------------------------- helpers
class Ram {
  constructor(buf) { this.b = buf; }
  u8(a) { return this.b[a - RAM_BASE]; }
  u16(a) { return (this.b[a - RAM_BASE] << 8) | this.b[a - RAM_BASE + 1]; }
  i16(a) { const v = this.u16(a); return v & 0x8000 ? v - 0x10000 : v; }
  u32(a) { return ((this.u16(a) * 0x10000) + this.u16(a + 2)) >>> 0; }
}
const hx = (v, n = 6) => '$' + (v >>> 0).toString(16).toUpperCase().padStart(n, '0');
const sext = (v, bits) => (v & (1 << (bits - 1))) ? v - (1 << bits) : v;

// ------------------------------------------------- the ROM's enqueue + emit
const ENQUEUE_MASK = 0x07ff03ff, NO_ZOOM_OR = 0x80008000;

/** The FIVE hardware words a sub-record predicts, plus the flip/colour patch.
 *  `$23D762` (enqueue) then `$23D624` (emit), instruction for instruction. */
function predictEntry(ram, slot, globalOffset) {
  const long = (ram.i16(slot + 0x02) + ram.i16(slot + 0x06)) & 0xffff;
  const short = (ram.i16(slot + 0x04) + ram.i16(slot + 0x08)) & 0xffff;
  const packed = (((long << 16) | short) | 0) >> 6;               // asr.l #6
  const d0 = ((packed & ENQUEUE_MASK) | NO_ZOOM_OR) >>> 0;
  const req = [
    (d0 >>> 16) & 0xffff, d0 & 0xffff,
    ram.u16(slot + 0x0a), ram.u16(slot + 0x0c), ram.u16(slot + 0x0e),
  ];
  const fc = ram.u16(slot + 0x1c);
  // $23D69A/$23D6A0/$23D6A6/$23D6AC/$23D6B2 -- grow+zoom kept, position
  // re-masked, ONE 32-bit add of $80B054, re-masked, OR-ed back together.
  const pos = ((req[0] << 16) | req[1]) >>> 0;
  const keep = (pos & 0xf800f800) >>> 0;
  let p = (pos & 0x07ff3fff) >>> 0;
  p = ((p + globalOffset) & 0x07ff3fff) >>> 0;
  const out0 = ((keep | p) >>> 0) >>> 16 & 0xffff;
  const out1 = ((keep | p) >>> 0) & 0xffff;
  // $23D6BA move.b (A1)+,D3 / or.b (A1)+,D3 / move.b D3,(-$6,A0)
  const patch = ((fc >> 8) & 0xff) | (fc & 0xff);
  const out2 = ((patch << 8) | (req[2] & 0xff)) & 0xffff;
  return { words: [out0, out1, out2, req[3], req[4]], req, fc };
}

/** src/render/spritelist.js, on a 5-word entry already read out of RAM. */
const WORD_MASK = [0xffff, 0xfbff, 0x7fff, 0xffff, 0xffff];
function decode(words) {
  const s = words.map((w, k) => w & WORD_MASK[k]);
  return {
    x: sext(s[0] & 0x07ff, 11), y: sext(s[1] & 0x03ff, 10),
    xzom: (s[0] & 0x7800) >> 11, yzom: (s[1] & 0x7800) >> 11,
    flip: (s[2] & 0x6000) >> 13, color: (s[2] & 0x1f00) >> 8,
    pri: (s[2] >> 7) & 1,
    offs: ((s[2] & 0x007f) << 16) | s[3],
    width: (s[4] & 0x7e00) >> 9, height: s[4] & 0x01ff,
  };
}

// ------------------------------------------------------------ one checkpoint
// ===========================================================================
// THE RED VALIDATION.  Every one of these THREE mutations is a defect this tool
// actually shipped and was caught doing, so `--break` is not a hypothetical:
// it re-runs the report with the mutation on and REQUIRES the answer to move.
// A tool nobody has seen give the wrong answer is not an instrument.
// ===========================================================================
export const MUTATIONS = {
  'type-from-word0': 'read the enemy type from the WORD at +$0 instead of the '
    + 'byte at +$C. That word is `(caller D3 + band index) | $8000`, so the '
    + 'census comes out as a tidy contiguous $00..$29 and looks entirely real.',
  'desc-only': "diagnostic 68's instrument: match a slot to an entry on "
    + '(descriptor, width, height) alone instead of on all five hardware words. '
    + 'It cannot tell two objects carrying the same sprite apart.',
  'bucket-no-head-search': "do not search for bucket 0's own length: start the "
    + 'in-order greedy at queue index 0, as this tool first did. Bucket 1 then '
    + "never matches, the leftover is assigned to bucket 0, and EVERY record on "
    + 'the screen is attributed to bucket 0 -- which is a plausible-looking '
    + 'answer, because bucket 0 really is the biggest bucket.',
};
let BREAK = null;

function readCheckpoint(ram) {
  // ---- the emitted display list, exactly as the hardware reads it
  const entries = [];
  for (let i = 0; i < DL.count; i++) {
    const a = DL.list + i * DL.stride * 2;
    const w = [0, 1, 2, 3, 4].map((k) => ram.u16(a + k * 2));
    if ((w[4] & 0x7fff) === 0) break;                       // the terminator
    const isFiller = w.every((v, k) => v === FILLER[k]);
    entries.push({ i, w, filler: isFiller, d: decode(w) });
  }

  // ---- the ENEMY table and every sub-record slot it owns
  const objects = [];
  for (let i = 0; i < ENEMY.slots; i++) {
    const rec = ENEMY.table + i * ENEMY.stride;
    const tw = ram.u16(rec);
    if (tw === 0) continue;
    const type = BREAK === 'type-from-word0' ? (tw & 0xff) : ram.u8(rec + E.type);
    const runLen = ram.u16(rec + E.runLen);
    const sub = ram.u32(rec + E.subRec);
    const inA = sub >= POOL_A && sub < POOL_A + POOL_A_N * SUB_STRIDE;
    const inB = sub >= POOL_B && sub < POOL_B + POOL_B_N * SUB_STRIDE;
    const o = {
      slot: i, type, typeWord: tw, runLen, sub, pool: inA ? 'A' : inB ? 'B' : null,
      handler: ram.u32(rec + E.handler), slots: [],
    };
    if ((inA || inB) && runLen < 64) {
      for (let k = 0; k <= runLen; k++) {
        const s = sub + k * SUB_STRIDE;
        if (s + SUB_STRIDE > POOL_B + POOL_B_N * SUB_STRIDE) break;
        const w0 = ram.u16(s);
        const desc = ram.u32(s + 0x0a);
        const size = ram.u16(s + 0x0e);
        o.slots.push({
          k, addr: s, w0, live: !!(w0 & 0x8000), coll: !!(w0 & 0x2000),
          desc, size, hp: ram.i16(s + 0x18),
          // "carries a sprite" -- $23D78E move.w $E(A6) and SpriteDrawer.draw's
          // two early returns.  68 §2.1: without this filter the extra HITBOX
          // slots of a multi-slot object are counted as invisible sprites.
          art: desc !== 0 && ((size >> 9) & 0x3f) !== 0 && (size & 0x1ff) !== 0,
        });
      }
    }
    objects.push(o);
  }
  const mainObjects = [];
  for (let i = 0; i < OBJ.slots; i++) {
    const tw = ram.u16(OBJ.base + i * OBJ.stride);
    if (tw) mainObjects.push(tw & 0xff);
  }

  // ---- bucket boundaries, reconstructed from the queue + staging buffers
  const qBytes = ram.u16(QUEUE_BYTES);
  const nq = Math.min(Math.floor(qBytes / RECORD_BYTES), 251);
  const qrec = (j) => [0, 1, 2, 3, 4, 5].map((k) => ram.u16(QUEUE + j * RECORD_BYTES + k * 2));
  const eq = (a, b) => a.every((v, k) => v === b[k]);
  const bucketOf = new Array(nq).fill(-1);
  // BUCKET 0's OWN LENGTH IS NOT RECORDED ANYWHERE.  Its records are appended
  // straight into $80397C by their producers, so at the sample point the only
  // copy of them IS the queue; $80AFC0 has been cleared with the other 29.  So
  // the head length is SEARCHED, not read: for every candidate h at which some
  // staging buffer's first record appears in the queue (plus h = nq, "the whole
  // queue is bucket 0"), run the in-order greedy and keep the h that places the
  // most records.  Ties go to the smallest h.  Whatever is still unplaced is
  // reported as unplaced rather than being assigned to a bucket by default.
  const qcache = Array.from({ length: nq }, (_, j) => qrec(j));
  const scache = BUCKETS.slice(1).map(([bi, buf]) => [bi, (n) =>
    [0, 1, 2, 3, 4, 5].map((k) => ram.u16(buf + n * RECORD_BYTES + k * 2))]);
  const greedy = (head) => {
    let cursor = head; const marks = [];
    for (const [bi, get] of scache) {
      let n = 0;
      while (cursor + n < nq && eq(get(n), qcache[cursor + n])) n++;
      marks.push([bi, cursor, n]); cursor += n;
    }
    return { marks, placed: cursor - head, end: cursor };
  };
  let best = null;
  const cands = BREAK === 'bucket-no-head-search' ? new Set([0]) : new Set([nq]);
  if (BREAK !== 'bucket-no-head-search') {
    for (const [, get] of scache) {
      const first = get(0);
      for (let j = 0; j < nq; j++) if (eq(first, qcache[j])) cands.add(j);
    }
    cands.add(0);
  }
  for (const h of [...cands].sort((a, b) => a - b)) {
    const g = greedy(h);
    // score is what buckets 1..29 EXPLAIN.  Scoring `h + placed` instead makes
    // "the whole queue is bucket 0" a maximum and the reconstruction silently
    // returns b0 for everything -- which is exactly what it did first.
    const score = g.placed;
    if (!best || score > (best.score ?? -1)) best = { h, score, ...g };
  }
  const head = (best.placed || BREAK === 'bucket-no-head-search')
    ? best.h : nq;
  if (BREAK === 'bucket-no-head-search' && !best.placed) {
    for (let j = 0; j < nq; j++) bucketOf[j] = 0;
  }
  for (let j = 0; j < head; j++) bucketOf[j] = 0;
  if (best.placed) {
    for (const [bi, at, n] of best.marks) for (let j = 0; j < n; j++) bucketOf[at + j] = bi;
  }
  const cur = head;
  // map QUEUE index -> display-list index (the emit inserts fillers 51,50,50..)
  const dlOfQueue = [];
  {
    let q = 0;
    for (const e of entries) { if (e.filler) continue; dlOfQueue[q++] = e.i; }
  }
  entries.forEach((e) => { e.bucket = null; });
  {
    let q = 0;
    for (const e of entries) {
      if (e.filler) continue;
      e.bucket = q < bucketOf.length ? bucketOf[q] : null;
      q++;
    }
  }
  return { entries, objects, mainObjects, qBytes, nq, head: cur };
}

// ------------------------------------------------------------------ the sweep
function args(argv) {
  const a = { manifest: null, from: null, to: null, types: null, json: null,
    records: 6, break: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const v = () => argv[++i];
    switch (argv[i]) {
      case '--manifest': a.manifest = v(); break;
      case '--from': a.from = +v(); break;
      case '--to': a.to = +v(); break;
      case '--type': a.types = new Set(v().split(',').map((x) => parseInt(x, 16))); break;
      case '--json': a.json = v(); break;
      case '--records': a.records = +v(); break;
      case '--quiet': a.quiet = true; break;
      case '--break': a.break = v(); break;
      default: if (argv[i].startsWith('--')) throw new Error(`unknown flag ${argv[i]}`);
    }
  }
  if (!a.manifest) throw new Error('--manifest is required');
  return a;
}

let LAST = null;

/** THE DIFFERENTIAL RED CHECK.  Run the report unmutated, then mutated, and
 *  REQUIRE the mutation to move the answer.  Comparing against "all types
 *  drawn" instead of against the baseline is exactly the defect W69 §9 caught
 *  in its own red check, so this compares against the baseline. */
function breakCheck(argv, name) {
  if (!MUTATIONS[name]) {
    console.log(`unknown mutation '${name}'. have:`);
    for (const [k, v] of Object.entries(MUTATIONS)) console.log(`  ${k}
      ${v}`);
    return 1;
  }
  const rest = argv.filter((x, i) => x !== '--break' && argv[i - 1] !== '--break')
    .concat(['--quiet']);
  const silent = (fn) => { const o = console.log; console.log = () => {}; try { return fn(); } finally { console.log = o; } };
  BREAK = null; silent(() => main(rest)); const base = LAST;
  BREAK = name; silent(() => main(rest)); const mut = LAST;
  BREAK = null;
  console.log(`BREAK '${name}' -- ${MUTATIONS[name]}
`);
  const key = (r) => JSON.stringify(r.types.map((t) => [t.type, t.art, t.matched,
    t.descOnly, t.unmatched, t.buckets]));
  const moved = [];
  const bm = new Map(base.types.map((t) => [t.type, t]));
  for (const t of mut.types) {
    const b = bm.get(t.type);
    if (!b) { moved.push(`type $${t.type.toString(16)} EXISTS ONLY UNDER THE MUTATION`); continue; }
    if (b.art !== t.art || b.matched !== t.matched || b.descOnly !== t.descOnly
      || b.unmatched !== t.unmatched
      || JSON.stringify(b.buckets) !== JSON.stringify(t.buckets)) {
      moved.push(`type $${t.type.toString(16).toUpperCase().padStart(2, '0')}: `
        + `art ${b.art}->${t.art} exact ${b.matched}->${t.matched} `
        + `soft ${b.descOnly}->${t.descOnly} notdrawn ${b.unmatched}->${t.unmatched} `
        + `buckets ${JSON.stringify(b.buckets)}->${JSON.stringify(t.buckets)}`);
    }
  }
  for (const t of base.types) if (!mut.types.some((x) => x.type === t.type)) {
    moved.push(`type $${t.type.toString(16)} DISAPPEARS under the mutation`);
  }
  console.log(`  baseline types ${base.types.length}, mutated types ${mut.types.length}`);
  for (const l of moved.slice(0, 20)) console.log('  ' + l);
  if (moved.length > 20) console.log(`  ... and ${moved.length - 20} more`);
  if (key(base) === key(mut)) {
    console.log('FAIL: the mutation changed NOTHING. This check cannot fail, '
      + 'so it is not a check.');
    return 1;
  }
  console.log(`RED OK: the mutation moved ${moved.length} of `
    + `${base.types.length} types.`);
  return 0;
}

function main(argv) {
  const a = args(argv);
  if (a.break) return breakCheck(argv, a.break);
  const man = JSON.parse(fs.readFileSync(a.manifest, 'utf8'));
  const dir = path.join(path.dirname(a.manifest), man.dir || 'ckpt');
  const rungs = man.rungs.filter((r) => (a.from === null || r.lf >= a.from)
    && (a.to === null || r.lf <= a.to));

  console.log(`BOARD DISPLAY LIST from ${rungs.length} checkpoints of `
    + `'${man.scenario}'  lf${rungs[0]?.lf}..${rungs[rungs.length - 1]?.lf}`);
  console.log(`SCRIPT ${man.script.length > 200 ? man.script.slice(0, 200)
    + ` ... (${man.script.length} chars)` : man.script}`);
  if (man.intervention) console.log(`INTERVENTION ${man.intervention}`);
  console.log('LABEL scripted input, not a human playing (docs/knowledge/09).\n');

  /** per type: slot-frames, emitted, and the RECORDS the board actually drew */
  const T = new Map();
  const t = (ty) => {
    if (!T.has(ty)) {
      T.set(ty, {
        type: ty, objFrames: 0, objIds: new Set(), handlers: new Set(),
        slotFrames: 0, live: 0, coll: 0, art: 0, matched: 0, descOnly: 0,
        unmatched: 0, kinds: new Map(), buckets: new Map(),
        firstLf: null, lastLf: null, perLf: new Map(), samples: [],
      });
    }
    return T.get(ty);
  };
  const perLfTotals = [];

  for (const r of rungs) {
    const buf = fs.readFileSync(path.join(dir, r.ram));
    const ram = new Ram(buf);
    const globalOffset = ram.u32(GLOBAL_OFFSET);
    const cp = readCheckpoint(ram);
    // index the display list by its five words for an exact 80-bit match, and
    // by (offs,w,h) for the weaker descriptor match 68 was limited to
    const byWords = new Map(), byDesc = new Map();
    for (const e of cp.entries) {
      if (e.filler) continue;
      const kw = e.w.join(',');
      (byWords.get(kw) ?? byWords.set(kw, []).get(kw)).push(e);
      const kd = `${e.d.offs},${e.d.width},${e.d.height}`;
      (byDesc.get(kd) ?? byDesc.set(kd, []).get(kd)).push(e);
    }
    let liveTot = 0, collTot = 0, emitTot = 0;
    for (const o of cp.objects) {
      if (a.types && !a.types.has(o.type)) continue;
      const s = t(o.type);
      s.objFrames++; s.handlers.add(o.handler);
      for (const sl of o.slots) {
        if (!sl.live) continue;
        s.slotFrames++; s.live++; liveTot++;
        if (sl.coll) { s.coll++; collTot++; }
        if (!sl.art) continue;
        s.art++;
        const p = predictEntry(ram, sl.addr, globalOffset);
        const kw = p.words.join(',');
        const hit = byWords.get(kw);
        const kd = `${((p.words[2] & 0x7f) << 16) | p.words[3]},`
          + `${(p.words[4] & 0x7e00) >> 9},${p.words[4] & 0x1ff}`;
        const soft = byDesc.get(kd);
        const d = decode(p.words);
        const kind = `${hx(d.offs)}/${d.width}x${d.height}/pal${d.color}`;
        const kk = s.kinds.get(kind) ?? { n: 0, emitted: 0, soft: 0,
          buckets: new Map(), xs: [], ys: [], lfs: [] };
        kk.n++;
        if (!s.kinds.has(kind)) s.kinds.set(kind, kk);
        // THE BOARD'S OWN ENTRY, not my prediction of it.  An exact 80-bit hit
        // is the strong case; a descriptor+size hit still PROVES THE CARTRIDGE
        // DREW THIS SPRITE THIS FRAME, and its position and bucket are then
        // read off the board's entry rather than off the arithmetic that missed
        // -- five of the ~130 enqueue stubs take a different pair of position
        // fields ($23DBCA/$23DF86/$23DF58 are type $82's, per W68 §2.3), so a
        // soft hit is a shortfall of MY predictor, not of the cartridge.
        const strong = BREAK === 'desc-only' ? soft : hit;
        const board = (strong && strong.length) ? strong[0]
          : (soft && soft.length ? soft[0] : null);
        if (strong && strong.length) { s.matched++; emitTot++; }
        else if (soft && soft.length) { s.descOnly++; emitTot++; }
        else s.unmatched++;
        if (board) {
          kk.emitted++;
          if (!(strong && strong.length)) kk.soft++;
          kk.buckets.set(board.bucket, (kk.buckets.get(board.bucket) ?? 0) + 1);
          s.buckets.set(board.bucket, (s.buckets.get(board.bucket) ?? 0) + 1);
        }
        const shown = board ? board.d : d;
        if (kk.xs.length < 400) { kk.xs.push(shown.x); kk.ys.push(shown.y); kk.lfs.push(r.lf); }
        if (s.samples.length < a.records) {
          s.samples.push({ lf: r.lf, ...shown, emitted: !!board,
            exact: !!(strong && strong.length),
            bucket: board ? board.bucket : null, slot: hx(sl.addr),
            hp: sl.hp, coll: sl.coll });
        }
        s.firstLf = s.firstLf === null ? r.lf : Math.min(s.firstLf, r.lf);
        s.lastLf = s.lastLf === null ? r.lf : Math.max(s.lastLf, r.lf);
        s.perLf.set(r.lf, (s.perLf.get(r.lf) ?? 0) + 1);
      }
    }
    const bcount = new Map();
    for (const e of cp.entries) {
      if (e.filler) continue;
      bcount.set(e.bucket, (bcount.get(e.bucket) ?? 0) + 1);
    }
    perLfTotals.push({
      lf: r.lf, entries: cp.entries.length, records: cp.nq, live: liveTot,
      coll: collTot, emitted: emitTot,
      types: cp.objects.map((o) => o.type),
      buckets: [...bcount].sort((x, y) => x[0] - y[0]),
      unplaced: [...bcount].filter(([b]) => b === null || b < 0)
        .reduce((s2, [, n]) => s2 + n, 0),
    });
  }

  // ------------------------------------------------------------------ report
  const types = [...T.values()].sort((x, y) => y.art - x.art);
  console.log('TYPE   objF  liveSF  collSF   artSF  EXACT  desc-only  NOT-DRAWN'
    + '   first..last lf');
  for (const s of types) {
    console.log(`$${s.type.toString(16).toUpperCase().padStart(2, '0')}`
      + `${String(s.objFrames).padStart(8)}${String(s.live).padStart(8)}`
      + `${String(s.coll).padStart(8)}${String(s.art).padStart(8)}`
      + `${String(s.matched).padStart(7)}${String(s.descOnly).padStart(11)}`
      + `${String(s.unmatched).padStart(11)}   `
      + `${s.firstLf ?? '-'}..${s.lastLf ?? '-'}`);
  }

  console.log('\nWHAT THE BOARD DRAWS, PER TYPE  '
    + '(stream / 16px-cols x rows / palette, bucket -> n)');
  for (const s of types) {
    if (!s.kinds.size) continue;
    console.log(`\n  type $${s.type.toString(16).toUpperCase().padStart(2, '0')}`
      + `  handlers ${[...s.handlers].map((h) => hx(h)).join(' ')}`);
    const ks = [...s.kinds].sort((x, y) => y[1].n - x[1].n).slice(0, 14);
    for (const [kind, k] of ks) {
      const bs = [...k.buckets].sort((x, y) => y[1] - x[1])
        .map(([b, n]) => `b${b}:${n}`).join(' ');
      const xr = k.xs.length ? `x ${Math.min(...k.xs)}..${Math.max(...k.xs)}` : '';
      const yr = k.ys.length ? `y ${Math.min(...k.ys)}..${Math.max(...k.ys)}` : '';
      console.log(`    ${kind.padEnd(30)} n=${String(k.n).padStart(5)} `
        + `drawn=${String(k.emitted).padStart(5)}${k.soft ? `(soft ${k.soft})` : ''} `
        + ` ${bs.padEnd(18)} ${xr} ${yr}`
        + `  lf ${Math.min(...k.lfs)}..${Math.max(...k.lfs)}`);
    }
  }

  console.log('\nSAMPLE RECORDS (the board\'s own entry, one per type)');
  for (const s of types) {
    for (const q of s.samples.slice(0, a.records)) {
      console.log(`  $${s.type.toString(16).toUpperCase().padStart(2, '0')} `
        + `lf${String(q.lf).padStart(6)} slot ${q.slot} ${hx(q.offs)} `
        + `${q.width}x${q.height} pal${q.color} pri${q.pri} flip${q.flip} `
        + `x=${q.x} y=${q.y} hp=${q.hp} coll=${q.coll} emitted=${q.emitted} `
        + `bucket=${q.bucket}`);
    }
  }

  console.log('\nPER-CHECKPOINT (board): entries = DL entries incl. fillers');
  console.log('    lf  entries  records  liveSF  collSF  emitted  unplaced  types');
  for (const p of perLfTotals) {
    console.log(`${String(p.lf).padStart(6)}${String(p.entries).padStart(9)}`
      + `${String(p.records).padStart(9)}${String(p.live).padStart(8)}`
      + `${String(p.coll).padStart(8)}${String(p.emitted).padStart(9)}`
      + `${String(p.unplaced).padStart(10)}  `
      + p.types.map((x) => '$' + x.toString(16).toUpperCase().padStart(2, '0')).join(' '));
  }

  if (a.json) {
    fs.writeFileSync(a.json, JSON.stringify({
      manifest: a.manifest, scenario: man.scenario, intervention: man.intervention,
      types: types.map((s) => ({
        type: s.type, objFrames: s.objFrames, live: s.live, coll: s.coll,
        art: s.art, matched: s.matched, descOnly: s.descOnly,
        unmatched: s.unmatched, firstLf: s.firstLf, lastLf: s.lastLf,
        handlers: [...s.handlers], buckets: [...s.buckets],
        kinds: [...s.kinds].map(([k, v]) => ({
          kind: k, n: v.n, emitted: v.emitted, soft: v.soft, buckets: [...v.buckets],
          x: v.xs, y: v.ys, lf: v.lfs,
        })),
        samples: s.samples,
        perLf: [...s.perLf],
      })),
      perLf: perLfTotals,
    }, null, 1));
    console.log(`\njson -> ${a.json}`);
  }
  // the compact signature `--break` compares.  Per type: how many slot-frames
  // carried a sprite, how many the board drew on an exact 80-bit match, how
  // many only on the descriptor, how many it did not draw, and the buckets.
  LAST = {
    types: types.map((s2) => ({
      type: s2.type, art: s2.art, matched: s2.matched, descOnly: s2.descOnly,
      unmatched: s2.unmatched, buckets: [...s2.buckets],
    })),
    perLf: perLfTotals,
  };
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('boarddl.mjs')) {
  process.exit(main(process.argv.slice(2)));
}

// W80: the emission gate reads the PORT's RAM with the SAME instrument this
// tool reads the BOARD's with, so the two reports cannot drift apart.
export { readCheckpoint, predictEntry, decode, Ram, GLOBAL_OFFSET };
