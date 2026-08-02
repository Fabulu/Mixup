#!/usr/bin/env node
// WAVE 21 -- THE PATTERN GATE.  Spawn for spawn, WRITE FOR WRITE.
//
// ============================ WHAT IT COMPARES, AND WHY =====================
//
// Not the finished record.  THE WRITES.  `tools/oracle/w21bullets.lua` captures
// every store into the bullet pool made by an instruction inside the two spawn
// cores' tails or the nine spawn-inits, as (PC, address, mask, data).  This gate
// replays each spawn's INPUT REGISTERS through `src/bullets.js` and compares the
// port's write log against the cartridge's, address by address, in order.
//
// That shape is deliberate.  A gate that seeds a record through `REC.attribute`
// and reads it back through `REC.attribute` agrees with itself whatever
// `REC.attribute` holds -- and two of the last three waves on this project
// shipped exactly that defect.  Here the board says "a word, value $001A, at
// $817F8C+$1C"; a port with the wrong constant writes a different ADDRESS and
// the diff names it.
//
// THE POOL SEARCH IS COMPARED TOO.  Each S row carries a 210-bit occupancy
// bitmap of the pool taken at the spawn, so the port runs its own free-slot
// search over the board's own pool state and must land on the board's own slot.
// That covers the unrolled five-at-a-time walk AND the $81B414 window ladder,
// neither of which is visible in the record's bytes.
//
// ============================ WHAT IT CANNOT COMPARE ========================
//
// At `$813098 == 0` every generator's rank-0 arm is a `beq`/`bra` INTO the core,
// not a `jsr`, so the core's stack carries the CALL SITE's return address and
// not the generator's.  The gate decodes the `jsr` at that return address out of
// the decrypted image when one is present, which recovers the entry point; with
// no image it reports the arm as unattributed rather than guessing.
//
//   node tools/w21patterngate.mjs
//   node tools/w21patterngate.mjs --corpus tools/oracle/out/w21-bullets-fanplay.tsv
//   node tools/w21patterngate.mjs --break all
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { BUL, REC, WriteLog, spawnCore, fire } from '../src/bullets.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const TABLES = path.join(ROOT, 'rip', 'port', 'player.tables.json');
const IMAGE = path.join(HERE, 'oracle', 'out', 'maincpu.bin');

const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const CORPUS = path.resolve(ROOT, arg('--corpus',
  path.join('tools', 'oracle', 'out', 'w21-bullets-play.tsv')));

const MUTATIONS = [
  'attribute-raw-displacement', 'init-raw-displacement', 'no-angle-scale',
  'scale-both-banks', 'no-bit9', 'no-global-bias', 'bias-from-low-word',
  'delta-axes-swapped', 'fan-always', 'fan-never',
];

/**
 * Mutations this gate is BLIND TO BY CONSTRUCTION, with the structural reason
 * and the check that does catch them.  They are NOT in `MUTATIONS`, because a
 * mutation that can never be red here would sit in the matrix forever as a
 * check that cannot fail -- the exact defect this wave was told to avoid.
 * Listing them here instead is the honest form: the gate says what it cannot
 * see, and names what does.
 */
const GATE_BLIND = new Map([
  ['window-constant',
    'the $81B414 ladder only changes an outcome when the lowest free slot is '
    + 'PAST the window -- and on that path $281536 does `ori #1,SR` and returns '
    + 'WITHOUT WRITING ANYTHING. A write tap cannot observe a shot that was '
    + 'DROPPED, so no corpus this probe can produce contains the row. Covered '
    + 'by tests/bullets.test.js "the active-window ladder is 70/110/160/190/210"'
    + ' and "a slot past the window is INVISIBLE", both seen RED.'],
]);

// ------------------------------------------------------------------ the corpus
function readCorpus(file) {
  const spawns = new Map();   // seq -> {s, w:[], d1pre}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    const t = line.split('\t');
    if (t[0] === 'S') {
      const f = {};
      for (const kv of t.slice(1)) {
        const i = kv.indexOf('=');
        f[kv.slice(0, i)] = kv.slice(i + 1);
      }
      const seq = Number(f.seq);
      const e = spawns.get(seq) ?? { w: [] };
      e.s = f; spawns.set(seq, e);
    } else if (t[0] === 'E') {
      const seq = Number(t[1]);
      const e = spawns.get(seq) ?? { w: [] };
      e.d1pre = parseInt(t[2].slice(3), 16); spawns.set(seq, e);
    } else if (t[0] === 'W') {
      const seq = Number(t[1]);
      const e = spawns.get(seq) ?? { w: [] };
      e.w.push({
        pc: parseInt(t[3], 16), addr: parseInt(t[4], 16),
        mask: parseInt(t[5], 16), data: parseInt(t[6], 16),
      });
      spawns.set(seq, e);
    }
  }
  return spawns;
}

/**
 * The board's writes, canonicalised the way `WriteLog` records the port's:
 * a byte write is (addr, 1, v) at the byte the mask selects, and TWO word
 * writes from the SAME instruction at a and a+2 are one longword.
 *
 * The 68000 writes a longword HIGH word first for `(An)+`, which is what the
 * corpus shows; the merge does not assume it -- it takes the lower address as
 * the base and the word AT that address as the high half, which is the same
 * thing for either emission order.
 */
function canon(ws) {
  const out = [];
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (w.mask === 0xffff) {
      const n = ws[i + 1];
      if (n && n.pc === w.pc && Math.abs(n.addr - w.addr) === 2
          && n.mask === 0xffff) {
        const lo = Math.min(w.addr, n.addr);
        const hi = lo === w.addr ? w.data : n.data;
        const lw = lo === w.addr ? n.data : w.data;
        out.push([lo, 4, ((hi << 16) >>> 0) + lw]);
        i++;
      } else {
        out.push([w.addr, 2, w.data]);
      }
    } else if (w.mask === 0xff00) {
      out.push([w.addr, 1, (w.data >> 8) & 0xff]);
    } else if (w.mask === 0x00ff) {
      out.push([w.addr + 1, 1, w.data & 0xff]);
    } else {
      out.push([w.addr, 0, w.data]);      // an encoding this gate does not know
    }
  }
  return out;
}

// ------------------------------------------------- the entry-point attribution
const BODY_RETURNS = new Map([
  [0x281352, 0x28134e], [0x28135e, 0x28134e],
  [0x28136a, 0x281366], [0x281376, 0x281366], [0x281382, 0x281366],
  [0x2813b4, 0x2813a6], [0x2813c2, 0x2813a6], [0x2813cc, 0x2813a6],
  [0x2813de, 0x2813d4], [0x2813e8, 0x2813d4],
  [0x281416, 0x281402],
  [0x28146c, 0x281450], [0x281476, 0x281450],
  [0x281498, 0x281494], [0x2814a4, 0x281494],
  [0x28166c, 0x281668], [0x281678, 0x281668],
  [0x281684, 0x281680], [0x281690, 0x281680], [0x28169c, 0x281680],
  [0x2816c4, 0x2816c0], [0x2816cc, 0x2816c0], [0x2816d6, 0x2816c0],
  [0x2816e4, 0x2816de], [0x2816ee, 0x2816de],
  [0x28171c, 0x281708], [0x28173a, 0x281726],
  [0x281790, 0x281776], [0x28179a, 0x281776],
]);
/**
 * THE FAN SHAPES, from the listing -- one row per generator BODY.
 *
 * `rets` is the ordered list of return addresses the body's core calls leave on
 * the stack, so a group of consecutive spawns IS one `jsr <entry>` and the gate
 * never has to guess where a fan starts.  `deltas` is (angle offset in 1/256
 * turn, speed offset) per bullet, relative to the entry's own arguments -- read
 * straight off the `subq.b #8,D1` / `addi.l #$60000,D0` immediates.
 *
 * `selfScale` marks the three bank-A bodies that do `add.b D1,D1` TWICE
 * themselves and then call the BANK B core, so the angle captured at their
 * first bullet is four times the entry's.
 */
const BODIES = new Map([
  [0x28134e, { entry: 0x281420, rets: [0x281352, 0x28135e],
    deltas: [[0, 0], [0, 6]] }],
  [0x281366, { entry: 0x281432, rets: [0x28136a, 0x281376, 0x281382],
    deltas: [[0, 0], [0, 5], [0, 10]] }],
  [0x2813a6, { entry: 0x281484, rets: [0x2813b4, 0x2813c2, 0x2813cc],
    deltas: [[0, 2], [-8, 0], [8, 0]], selfScale: true }],
  [0x2813d4, { entry: 0x281442, rets: [0x2813de, 0x2813e8],
    deltas: [[-8, 0], [8, 0]], selfScale: true }],
  [0x281450, { entry: 0x281450, rets: [0x28146c, 0x281476],
    deltas: [[-8, 4], [8, 4]], selfScale: true }],
  [0x281402, { entry: 0x281402, rets: [0x281416], deltas: [[0, 4]] }],
  [0x281668, { entry: 0x281744, rets: [0x28166c, 0x281678],
    deltas: [[0, 0], [0, 6]] }],
  [0x281680, { entry: 0x281754, rets: [0x281684, 0x281690, 0x28169c],
    deltas: [[0, 0], [0, 5], [0, 10]] }],
  [0x2816c0, { entry: 0x2817a8, rets: [0x2816c4, 0x2816cc, 0x2816d6],
    deltas: [[0, 0], [-8, 0], [8, 0]] }],
  [0x2816de, { entry: 0x281764, rets: [0x2816e4, 0x2816ee],
    deltas: [[-8, 0], [8, 0]] }],
  [0x281708, { entry: 0x281708, rets: [0x28171c], deltas: [[0, 4]] }],
  [0x281726, { entry: 0x281726, rets: [0x28173a], deltas: [[0, 2]] }],
  [0x281776, { entry: 0x281776, rets: [0x281790, 0x28179a],
    deltas: [[-8, 6], [8, 6]] }],
]);
const FIRST_RET = new Map([...BODIES].map(([b, v]) => [v.rets[0], b]));

const ENTRY_LIST = [
  0x2813f0, 0x281402, 0x281420, 0x281432, 0x281442, 0x281450, 0x281484,
  0x2814ac, 0x2814b6, 0x2816f6, 0x281708, 0x281726, 0x281744, 0x281754,
  0x281764, 0x281776, 0x2817a8, 0x2817b8, 0x2817c2,
];

/** Decode the `jsr`/`jmp` that returns to `ret`, out of the decrypted image. */
function entryFromCallSite(img, ret) {
  if (!img) return null;
  const u16 = (a) => (img[a] << 8) | img[a + 1];
  const u32 = (a) => ((img[a] << 24) | (img[a + 1] << 16)
    | (img[a + 2] << 8) | img[a + 3]) >>> 0;
  const a6 = ret - 6, a4 = ret - 4;
  if (a6 > 0 && (u16(a6) === 0x4eb9 || u16(a6) === 0x4ef9)) {
    const t = u32(a6 + 2);
    if (ENTRY_LIST.includes(t)) return t;
  }
  if (a4 > 0 && (u16(a4) === 0x4eba || u16(a4) === 0x4efa)) {
    let d = u16(a4 + 2); if (d >= 0x8000) d -= 0x10000;
    const t = (a4 + 2 + d) & 0xffffff;
    if (ENTRY_LIST.includes(t)) return t;
  }
  return null;
}

// ------------------------------------------------------------------- the run
function runOn(corpus, mut) {
  const spec = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const rom = new RomWindows(spec.rom);
  const img = fs.existsSync(IMAGE) ? fs.readFileSync(IMAGE) : null;
  const spawns = readCorpus(corpus);

  let n = 0, divergent = 0, slotDiv = 0, noE = 0;
  const kinds = new Set(), bodies = new Set(), entries = new Set();
  const banks = new Set(), inits = new Set(), rankVals = new Set();
  const branch = new Map();
  const mark = (k) => branch.set(k, (branch.get(k) ?? 0) + 1);
  const firstDiffs = [];

  for (const [seq, e] of [...spawns.entries()].sort((a, b) => a[0] - b[0])) {
    if (!e.s || e.d1pre === undefined) { noE++; continue; }
    const f = e.s;
    const H = (k) => parseInt(f[k], 16);

    // ---- the RAM the board had, seeded at LITERAL addresses.
    const ram = new Ram(null);
    const occ = f.occ;
    const base = H('a0') - 0x10;
    const slot = (base - BUL.pool) / BUL.stride;
    for (let s = 0; s < BUL.slots; s++) {
      const bit = (parseInt(occ.slice((s >> 3) * 2, (s >> 3) * 2 + 2), 16)
        >> (7 - (s & 7))) & 1;
      ram.setU16(BUL.pool + s * BUL.stride, bit ? 0x8000 : 0);
    }
    ram.setU16(base, 0);                       // the slot the search must find
    ram.setU16(0x813098, H('rank'));
    ram.setU16(0x813160, H('b1'));
    ram.setU16(0x812950, H('b2'));
    ram.setU16(0x81b414, H('w0')); ram.setU16(0x81b416, H('w1'));
    ram.setU16(0x81b418, H('w2')); ram.setU16(0x81b41a, H('w3'));
    ram.setU16(0x8130d4, H('f0')); ram.setU16(0x8130d2, H('f1'));
    ram.setU16(0x811f72, H('f2'));
    ram.setU16(0x8130d8, H('ix')); ram.setU16(0x8130da, H('iy'));
    const a5 = H('a5');
    if (a5 >= 0x800000 && a5 < 0x820000) {
      ram.setU8(a5 + 3, H('tgt'));
      ram.setU8(a5 + 0x0d, H('efl'));
      ram.setU32(a5 + 6, H('sub'));
      const sub = H('sub');
      if (sub >= 0x800000 && sub < 0x820000) ram.setU8(sub, H('sub0'));
    }

    const log = new WriteLog(ram);
    const ctx = { ram, rom, log, mut };
    const regs = {
      d0: H('d0') >>> 0, d1: e.d1pre >>> 0, d2: H('d2') >>> 0,
      d3: H('d3') | 0, d4: H('d4') >>> 0, d5: H('d5') >>> 0, a5,
    };
    const out = spawnCore(ctx, regs, f.core);

    // ---- coverage, from the row rather than from instrumenting the port.
    n++;
    kinds.add(H('d0') & 0x3f);
    banks.add(f.core);
    rankVals.add(f.rank);
    const ret = H('ret');
    const body = BODY_RETURNS.get(ret);
    if (body !== undefined) { bodies.add(body); mark(`body:${body.toString(16)}`); }
    const ent = body !== undefined ? null : entryFromCallSite(img, ret);
    if (ent !== null) { entries.add(ent); mark(`rank0-arm:${ent.toString(16)}`); }
    mark(`core:${f.core}`);
    mark(H('d3') !== '00000000' ? 'delta:applied' : 'delta:skipped');
    const ini = rom.u32(BUL.spawnInitPtrs + 4 * (H('d0') & 0x3f));
    inits.add(ini); mark(`init:${ini.toString(16)}`);
    const ladder = [H('w0'), H('w1'), H('w2'), H('w3')]
      .findIndex((v) => v === 0);
    mark(`window:${ladder < 0 ? 4 : ladder}`);
    mark(`freeze:${(H('f0') + H('f1') + H('f2')) & 0xffff ? 'gated' : 'open'}`);

    // ---- the verdict.
    if (out.slot !== slot) {
      slotDiv++;
      if (firstDiffs.length < 6) {
        firstDiffs.push(`seq ${seq} lf ${f.lf}: SLOT board=${slot} port=${out.slot}`
          + ` (window ${ladder < 0 ? 210 : [70, 110, 160, 190, 210][ladder]})`);
      }
      divergent++;
      continue;
    }
    const want = canon(e.w);
    const got = log.writes;
    const fmt = (w) => w.map(([a, s, v]) =>
      `${a.toString(16)}/${s}/${v.toString(16)}`).join(' ');
    if (fmt(want) !== fmt(got)) {
      divergent++;
      if (firstDiffs.length < 6) {
        let i = 0;
        while (i < want.length && i < got.length
               && fmt([want[i]]) === fmt([got[i]])) i++;
        firstDiffs.push(`seq ${seq} lf ${f.lf} core ${f.core} kind `
          + `${H('d0') & 0x3f} ret $${f.ret}: write ${i} of ${want.length} `
          + `board=${want[i] ? fmt([want[i]]) : '(end)'} `
          + `port=${got[i] ? fmt([got[i]]) : '(end)'}`);
      }
    }
  }
  // ==================== THE FAN CHECK, at the GENERATOR level ================
  //
  // Everything above compares ONE core call at a time, so it is structurally
  // blind to the fan gate: `$813098` decides how many times the core is called,
  // which is a decision above the core.  A gate that cannot see its own
  // subject's most important branch is the ninth defective check, so:
  //
  //   * groups the spawns back into `jsr <entry>` invocations using the ordered
  //     return addresses each generator BODY leaves on the stack;
  //   * checks the group's SHAPE against the listing -- board versus ROM, with
  //     no port involved: bullet i's stored (direction, speed) minus bullet 0's
  //     must equal the immediates in `BODIES`;
  //   * and replays the same entry through the PORT and requires the same
  //     bullet COUNT and the same relative offsets, which is what makes
  //     `fan-always` / `fan-never` visible at all.
  const rows = [...spawns.entries()].sort((a, b) => a[0] - b[0])
    .filter(([, e]) => e.s && e.d1pre !== undefined).map(([seq, e]) => {
      const H = (k) => parseInt(e.s[k], 16);
      const c = canon(e.w);
      const bse = H('a0') - 0x10;
      const byte = (off) => {
        const w = c.find((x) => x[0] === bse + off && x[1] === 1);
        return w ? w[2] : null;
      };
      return { seq, e, ret: H('ret'), lf: e.s.lf, dir: byte(REC.dir),
        spd: byte(REC.speed), d1pre: e.d1pre, H, base: bse };
    });
  let groups = 0, shapeDiv = 0, portShapeDiv = 0, ungrouped = 0;
  const shapes = new Set();
  for (let i = 0; i < rows.length; i++) {
    let body = FIRST_RET.get(rows[i].ret);
    // A spawn whose return address is a CALL SITE took a rank-0 arm, and every
    // rank-0 arm emits exactly ONE bullet.  When the entry is recoverable from
    // the image, that is a one-bullet group -- and it is the only thing in this
    // gate that can see `fan-always`, because at $813098 = 0 the difference
    // between "the gate is right" and "the gate ignores the fan gate" is
    // exactly the bullet COUNT.
    let ent0 = null;
    if (body === undefined) {
      ent0 = entryFromCallSite(img, rows[i].ret);
      if (ent0 === null) continue;
    }
    const B = body !== undefined ? BODIES.get(body)
      : { entry: ent0, rets: [rows[i].ret], deltas: [[0, 0]] };
    if (body === undefined) body = ent0;
    if (i + B.rets.length > rows.length) { ungrouped++; continue; }
    const g = rows.slice(i, i + B.rets.length);
    if (!g.every((r, k) => r.ret === B.rets[k] && r.lf === g[0].lf)
        || (ent0 !== null && rows[i].H('rank') !== 0)) {
      ungrouped++; continue;                     // a bullet was dropped, or a
      // second generator interleaved -- either way the group is not a fan.
    }
    groups++; shapes.add(body);
    mark(`${ent0 !== null ? 'rank0-fan' : 'fan-body'}:${body.toString(16)}`);
    i += B.rets.length - 1;
    // ---- the BOARD against the LISTING.
    const rel = B.deltas.map(([a, s]) =>
      [(a - B.deltas[0][0]) & 0xff, (s - B.deltas[0][1]) & 0xff]);
    const boardRel = g.map((r) => [(r.dir - g[0].dir) & 0xff,
      (r.spd - g[0].spd) & 0xff]);
    if (JSON.stringify(rel) !== JSON.stringify(boardRel)) {
      shapeDiv++;
      if (firstDiffs.length < 8) {
        firstDiffs.push(`SHAPE body $${body.toString(16).toUpperCase()} lf `
          + `${g[0].lf}: listing ${JSON.stringify(rel)} board `
          + `${JSON.stringify(boardRel)}`);
      }
    }
    // ---- the PORT, driven at the ENTRY.  The entry's own angle is the first
    // bullet's captured D1 minus the body's first offset, divided by four for
    // the three bodies that scale it themselves.
    let a = (g[0].d1pre - B.deltas[0][0]) & 0xff;
    if (B.selfScale) { if (a % 4) { ungrouped++; continue; } a >>= 2; }
    const ram = new Ram(null);
    ram.setU16(0x813098, g[0].H('rank'));
    ram.setU16(0x81b414, g[0].H('w0')); ram.setU16(0x81b416, g[0].H('w1'));
    ram.setU16(0x81b418, g[0].H('w2')); ram.setU16(0x81b41a, g[0].H('w3'));
    const a5 = g[0].H('a5');
    if (a5 >= 0x800000 && a5 < 0x820000) {
      ram.setU8(a5 + 0x0d, g[0].H('efl'));
      ram.setU32(a5 + 6, g[0].H('sub'));
      const sub = g[0].H('sub');
      if (sub >= 0x800000 && sub < 0x820000) ram.setU8(sub, g[0].H('sub0'));
    }
    const log = new WriteLog(ram);
    const regs = { d0: (g[0].H('d0') - (B.deltas[0][1] << 16)) >>> 0, d1: a,
      d2: 0, d3: 0, d4: 0, d5: 0, a5 };
    fire({ ram, rom, log, mut }, B.entry, regs);
    const got = [];
    for (const [ad, sz, v] of log.writes) {
      const off = (ad - BUL.pool) % BUL.stride;
      if (sz === 1 && off === REC.speed) got.push([0, v]);
      else if (sz === 1 && off === REC.dir) got[got.length - 1][0] = v;
    }
    const portRel = got.map((r) => [(r[0] - got[0][0]) & 0xff,
      (r[1] - got[0][1]) & 0xff]);
    if (JSON.stringify(portRel) !== JSON.stringify(boardRel)) {
      portShapeDiv++;
      if (firstDiffs.length < 8) {
        firstDiffs.push(`FAN body $${body.toString(16).toUpperCase()} entry `
          + `$${B.entry.toString(16).toUpperCase()} lf ${g[0].lf}: board `
          + `${JSON.stringify(boardRel)} port ${JSON.stringify(portRel)}`);
      }
    }
  }

  return { n, divergent, slotDiv, noE, kinds, bodies, entries, banks, inits,
    rankVals, branch, firstDiffs, groups, shapeDiv, portShapeDiv, ungrouped,
    shapes };
}

// ------------------------------------------------------------------- report
if (!fs.existsSync(TABLES)) {
  console.log(`SKIP ${TABLES} absent -- run tools/export-tables.py`);
  process.exit(0);
}
if (!fs.existsSync(CORPUS)) {
  console.log(`SKIP ${CORPUS} absent -- run tools/oracle/w21run.py`);
  process.exit(0);
}

const run = (mut) => runOn(CORPUS, mut);
const base = run(null);
console.log(`CORPUS ${path.basename(CORPUS)}  spawns=${base.n}`
  + `  unpaired=${base.noE}`);
console.log(`RESULT divergent=${base.divergent} (slot ${base.slotDiv}, `
  + `writes ${base.divergent - base.slotDiv}) of ${base.n} spawns`
  + `  -> ${base.n ? (100 * (base.n - base.divergent) / base.n).toFixed(4) : 0} %`);
console.log(`RANK values in this corpus: ${[...base.rankVals].sort().join(' ')}`);
console.log(`COVERAGE kinds ${base.kinds.size}/39 -> `
  + `${[...base.kinds].sort((a, b) => a - b).join(',')}`);
console.log(`COVERAGE cores ${base.banks.size}/2   spawn-inits `
  + `${base.inits.size}/9 -> ${[...base.inits]
    .map((a) => `$${a.toString(16).toUpperCase()}`).sort().join(' ')}`);
console.log(`COVERAGE rank!=0 generator BODIES reached ${base.bodies.size}/8 -> `
  + `${[...base.bodies].map((a) => `$${a.toString(16).toUpperCase()}`).sort().join(' ')}`);
console.log(`COVERAGE rank-0 ENTRY arms attributed ${base.entries.size}/19 -> `
  + `${[...base.entries].map((a) => `$${a.toString(16).toUpperCase()}`).sort().join(' ')}`);
console.log(`FANS grouped ${base.groups} generator invocations over `
  + `${base.shapes.size} generator BODIES/rank-0 arms; shape-vs-LISTING divergent `
  + `${base.shapeDiv}; shape-vs-PORT divergent ${base.portShapeDiv}; `
  + `ungrouped ${base.ungrouped}`);
console.log(`BRANCHES executed ${base.branch.size}: ` + [...base.branch.entries()]
  .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}x${v}`).join(' '));
for (const d of base.firstDiffs) console.log('  DIFF ' + d);

// ------------------------------------------------------------- the matrix
// A mutation that is GREEN on one corpus is not automatically a defective
// check: `no-global-bias` is invisible on a run where both globals read 0, and
// `fan-never` is invisible on a run where $813098 read 0 -- because on those
// runs the mutated code and the ROM genuinely do the same thing.  What WOULD be
// a defective check is a mutation that is green EVERYWHERE.  So the matrix runs
// every mutation against every corpus and requires each one to be red somewhere,
// printing the whole grid so a reader can see which corpus caught what.
if (argv.includes('--matrix')) {
  const list = (arg('--matrix', '')).split(',').filter(Boolean);
  const results = new Map(MUTATIONS.map((m) => [m, []]));
  const names = [];
  for (const c of list) {
    if (!fs.existsSync(path.resolve(ROOT, c))) continue;
    names.push(path.basename(c, '.tsv'));
    for (const m of MUTATIONS) {
      const r = runOn(path.resolve(ROOT, c), m);
      results.get(m).push(r.divergent > 0 || r.portShapeDiv > 0);
    }
  }
  console.log('\nMUTATION MATRIX -- every mutation must be RED in at least '
    + 'one corpus');
  for (const [m, why] of GATE_BLIND) {
    console.log(`  NOT ATTEMPTED HERE: ${m} -- ${why}`);
  }
  console.log('  ' + ' '.repeat(30) + names.join('  '));
  let bad = 0;
  for (const [m, reds] of results) {
    const anyRed = reds.some(Boolean);
    if (!anyRed) bad++;
    const cells = reds.map((r, i) => (r ? 'RED' : 'green')
      .padEnd(names[i].length + 2));
    console.log(`  ${m.padEnd(30)}${cells.join('')}`
      + `${anyRed ? '' : '   <-- GREEN EVERYWHERE: A CHECK THAT CANNOT FAIL'}`);
  }
  process.exit(bad === 0 ? 0 : 1);
}

if (argv.includes('--break')) {
  const which = arg('--break', 'all');
  console.log('\nMUTATIONS -- every one must be RED');
  let allRed = true;
  for (const m of (which === 'all' ? MUTATIONS : [which])) {
    const r = run(m);
    const red = r.divergent > 0 || r.portShapeDiv > 0;
    if (!red) allRed = false;
    console.log(`  ${red ? 'RED  ' : 'GREEN'} ${m.padEnd(28)} `
      + `divergent=${r.divergent}/${r.n} fan-shape=${r.portShapeDiv}/${r.groups}`
      + (red ? '' : '   <-- THE CHECK CANNOT SEE THIS'));
  }
  if (!allRed) process.exit(1);
}
process.exit(base.divergent === 0 && base.shapeDiv === 0
  && base.portShapeDiv === 0 ? 0 : 1);
