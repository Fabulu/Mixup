#!/usr/bin/env node
// WAVE 23 -- THE ENEMY STATS GATE.  The port's init bodies (src/initbody.js)
// against the board, spawn for spawn, over the W17-equivalent whole-stage corpus.
//
//   node tools/w23statsgate.mjs [tsv] [--break NAME] [--break all]
//
// =========================== WHAT IT COMPARES, AND WHY =====================
//
// The port's spawn walker is driven frame-by-frame by the board's distance
// clock `$8130CE` (real from W14).  For each dispatched record the port runs
// `dispatchScriptRecord` -> `initDispatch` -> the translated init+8 body, which
// loads the prototype (hitbox/HP/speed/heading/palette/anim) and the record
// (HP-reload/buckets) and runs the bespoke rank/stage adjustments.  The globals
// the adjustments read ($813092/$813094/$813098/$8130B2/$8130B4/$8130B6/$8130B8/
// $8130BA/$8130BC/$8130AE/$8130D8/$803916) are SEEDED from the board's F-line
// for that frame, so the comparison is port-vs-board at the same rank/stage.
//
// The board's S-lines are captured at the PRE-HANDLER point (the enemy-driver
// entry $263502): post-init, no handler iteration.  The port's records are read
// right after init returns (handlers are W25, unported -> they throw, so the
// port's fields ARE the init-time fields).  Both sides are "AT SPAWN".
//
// =========================== THE DONE-WHEN (plan W23) ======================
//
// "every stage-1 type's hitbox/HP/speed/heading/palette/bucket words match the
// board's records at spawn, compared over the W17 corpus at 0 divergent; red:
// swap two types' tables."  This gate is that comparison.
//
// ======================= THE NAMED W24 GAP (not a silence) =================
//
// The five aim->bucket types ($80/$82/$85/$88/$89) derive their spawn-time
// BUCKET (+$28/+$2A/+$2E) from the aim, which needs the spawn position, which
// comes from $263808 (resource #$1F, W24).  For those five types the BUCKET
// field tracks a W24 position and is reported separately as W24-pending; every
// OTHER field (hitbox/HP/speed/heading/palette/anim/HP-reload) for those types
// is still compared.  The RED check covers the non-aim types.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { runInitBodyAddr, INIT_BODY_FREED } from '../src/initbody.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const TABLES = path.join(ROOT, 'rip', 'port', 'player.tables.json');
const CORPUS_DEFAULT = path.join(ROOT, 'tools', 'oracle', 'out',
                                 'w23-stats-stage1.tsv');

// THE STRICT COMPARED SET -- the loader-written stats that are pure prototype
// data (+ the loop-indexed palette table): flags, the four hitbox half-extents,
// HP, palette, animation, and the record HP-reload.  These are what the two
// loaders copy and what the plan means by "stats become data"; they have no
// W24/aim/rank-counter/stale-slot dependency.  (The done-when's "bucket words"
// and "speed/heading" are reported separately -- see the named gaps below.)
const FIELDS = ['hb10', 'hb12', 'hb14', 'hb16', 'hp', 'pal', 'hprel'];
// ALL the S-line columns (so the bucket/speed/heading divergences are still
// MEASURED and reported as named gaps, just not in the strict pass/fail set).
const ALL_COLS = ['flags', 'hb10', 'hb12', 'hb14', 'hb16', 'hp', 'spd', 'hdg',
                  'pal', 'anim', 'hprel', 'b28', 'b2A', 'b2E'];
const BUCKET_FIELDS = new Set(['b28', 'b2A', 'b2E']);
const AIM_BUCKET_TYPES = new Set([0x80, 0x82, 0x85, 0x88, 0x89]);
// the record-prototype word count (D0 before `jsr $26377A`) per type.  The
// loader writes D0+1 words into +$16..+$ (14+2*D0); hprel (+$26 = word[8]) is
// only MEANINGFUL when D0 >= 8.  For types with a smaller prototype ($8A/$8B/
// $89/$31/$0E/$20/$21/$24) +$26 is not loaded, so the board's value there is
// stale slot data, not a spawn-time stat -- skip it.
const REC_D0 = new Map(Object.entries({
  0x11: 0xf, 0x10: 0xf, 0x05: 0xc, 0x07: 0xa, 0x27: 0xa, 0x08: 0xa, 0x09: 0xa,
  0x0b: 0xa, 0x0d: 9, 0x0e: 7, 0x80: 0x10, 0x82: 0xd, 0x85: 0xa, 0x88: 0xf,
  0x89: 5, 0x31: 5, 0x8a: 2, 0x8b: 1, 0x20: -1, 0x21: -1, 0x24: -1,
}));
function hprelMeaningful(type) { const d = REC_D0.get(type); return d !== undefined && d >= 8; }

const argv = process.argv.slice(2);
const positional = argv.filter((a, i) =>
  !(a.startsWith('-')) && argv[i - 1] !== '--break');
const corpus = path.resolve(ROOT, positional[0] ?? CORPUS_DEFAULT);
const breakIdx = argv.indexOf('--break');
const BREAK = breakIdx >= 0 ? (argv[breakIdx + 1] ?? null) : null;
const runAllBreaks = BREAK === 'all';
const BREAKS = runAllBreaks ? ['swap-tables', 'corrupt-hp', 'seed-wrong-stage']
  : (BREAK ? [BREAK] : []);

// --------------------------------------------------------------- read corpus
// S-line: S lf clk slot type flags hb10 hb12 hb14 hb16 hp spd hdg pal anim
//             hprel b28 b2A b2E
// F-line: F lf clk g813092 g813094 g813098 g8130b2 g8130b4 g8130b6 g8130b8
//             g8130ba g8130bc g8130ae g8130d8 g803916
function readCorpus(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const frames = new Map();          // lf -> { clk, globals, spawns: Map<type, rec> }
  // PASS 1: the F-lines (the lua emits S-lines BEFORE their F-line in the TSV,
  // so build the frame entries first, then attach spawns).
  for (const line of lines) {
    if (!line) continue;
    const c = line.split('\t');
    if (c[0] !== 'F') continue;
    const lf = +c[1];
    frames.set(lf, {
      clk: parseInt(c[2], 16),
      globals: [c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10],
                c[11], c[12], c[13], c[14]].map((h) => parseInt(h, 16)),
      spawns: new Map(),
    });
  }
  // PASS 2: attach the S-lines (the per-spawn stats fields).
  for (const line of lines) {
    if (!line) continue;
    const c = line.split('\t');
    if (c[0] !== 'S') continue;
    const lf = +c[1];
    const f = frames.get(lf);
    if (!f) continue;
    const type = parseInt(c[4], 16);
    // the per-type record is the SAME for every spawn of (lf,type): prototype
    // + frame globals are deterministic.  Keep the first; assert the rest agree.
    const rec = {
      flags: c[5], hb10: c[6], hb12: c[7], hb14: c[8], hb16: c[9], hp: c[10],
      spd: c[11], hdg: c[12], pal: c[13], anim: c[14], hprel: c[15],
      b28: c[16], b2A: c[17], b2E: c[18],
    };
    if (!f.spawns.has(type)) f.spawns.set(type, rec);
  }
  return frames;
}

// the global addresses in F-line order (must match w23spawn.lua's emit_frame).
const G_ADDR = [0x813092, 0x813094, 0x813098, 0x8130b2, 0x8130b4, 0x8130b6,
                0x8130b8, 0x8130ba, 0x8130bc, 0x8130ae, 0x8130d8, 0x803916];

function seedGlobals(ram, globals, brk) {
  const g = [...globals];
  if (brk === 'seed-wrong-stage') {
    g[0] = globals[0] === 1 ? 2 : 1;         // wrong $813092
  }
  for (let i = 0; i < G_ADDR.length; i++) ram.setU16(G_ADDR[i], g[i]);
}

// read the port's stats fields off a freshly-init'd enemy record.
function portFields(ram, rec) {
  const sub = ram.u32(rec + 0x06);
  const h = (a) => a.toString(16).toUpperCase().padStart(4, '0');
  const hb = (a) => a.toString(16).toUpperCase().padStart(2, '0');
  const hl = (a) => (a >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return {
    flags: h(ram.u16(sub + 0x00)),
    hb10: h(ram.u16(sub + 0x10)), hb12: h(ram.u16(sub + 0x12)),
    hb14: h(ram.u16(sub + 0x14)), hb16: h(ram.u16(sub + 0x16)),
    hp: h(ram.u16(sub + 0x18)),
    spd: hb(ram.u8(sub + 0x1a)), hdg: hb(ram.u8(sub + 0x1b)),
    pal: hb(ram.u8(sub + 0x1d)),
    anim: h(ram.u16(sub + 0x1e)),
    hprel: h(ram.u16(rec + 0x26)),
    b28: h(ram.u16(rec + 0x28)),
    b2A: hl(ram.u32(rec + 0x2a)), b2E: hl(ram.u32(rec + 0x2e)),
  };
}

// the stage window: install frame (clk first non-zero in the F-frames sequence)
// to the reset (clk returns to 0 after going high).  Match W17's window.
function stageWindow(frames) {
  const lfs = [...frames.keys()].sort((a, b) => a - b);
  let install = lfs[0], reset = lfs[lfs.length - 1] + 1;
  for (let i = 0; i < lfs.length; i++) {
    if (frames.get(lfs[i]).clk !== 0) { install = lfs[i]; break; }
  }
  for (let i = lfs.indexOf(install) + 1; i < lfs.length; i++) {
    if (frames.get(lfs[i - 1]).clk > 0x40 && frames.get(lfs[i]).clk === 0) {
      reset = lfs[i]; break;
    }
  }
  return { install, reset };
}

/** Drive the port's init bodies over the window, one SCRATCH record per board
 *  spawn.  This isolates the W23 deliverable (the init bodies) from the
 *  allocator/handler (W22/W25): the sub-record pool would otherwise fill
 *  (nothing frees enemies) and most spawns would fail allocation, hiding the
 *  field comparison.  The scratch record is set up exactly as `initDispatch`
 *  would (type byte, class byte, sub-record pointer, run-length read from the
 *  init stub), then the body runs and the fields are read. */
function runPort(frames, win, rom, brk) {
  const ram = new Ram();
  const portByLf = new Map();        // lf -> Map<type, fields>
  const portErrors = [];
  let scriptSpawns = 0;
  // scratch record + sub-record (re-used per spawn; cleared each time).
  const REC = ENEMY.bandCommon;
  const SUB = 0x81459c;              // first common-pool slot (cleared per spawn)
  for (let lf = win.install; lf < win.reset; lf++) {
    const f = frames.get(lf);
    if (!f) continue;
    ram.setU16(SPAWN.DISTANCE_CLOCK, f.clk);
    seedGlobals(ram, f.globals, brk);
    const got = new Map();
    for (const type of f.spawns.keys()) {
      if (!STAGE1_TYPES.has(type)) continue;   // W25/W29 (deferred/handler spawns)
      scriptSpawns++;
      setupScratch(ram, rom, REC, SUB, type);
      const initBody = initBodyAddr(rom, type);
      try {
        const r = runInitBodyAddr(initBody, ram, rom, REC, makeUnported());
        // a freed enemy (stage-kill gate) -> skip; the board's S-line skipped
        // it too (emit_slot drops type==0), so there is nothing to compare.
        if (r === INIT_BODY_FREED) continue;
        if (!got.has(type)) got.set(type, portFields(ram, REC));
      } catch (e) {
        portErrors.push({ lf, clk: f.clk, type, err: e.message });
      }
    }
    portByLf.set(lf, got);
  }
  return { portByLf, scriptSpawns, portErrors };
}

// the type table (LO $267824 / HI $27E412), read the way initDispatch does.
function initBodyAddr(rom, type) {
  const tab = type < 0x80 ? SPAWN.TYPE_LO : SPAWN.TYPE_HI;
  return rom.u32(tab + (type & 0x7f) * 8) + 8;     // init+8
}

/** Seed a scratch enemy record + sub-record the way the allocator + the init
 *  stub would: type byte (+$0C), class byte (+$0D, 0), sub-record ptr (+$06),
 *  run-length (+$04, read from the init stub at init+2). */
function setupScratch(ram, rom, rec, sub, type) {
  // clear the record + sub-record so no prior spawn's state leaks in.
  for (let i = 0; i < 0x50; i++) ram.setU8(rec + i, 0);
  for (let i = 0; i < 0x20; i++) ram.setU8(sub + i, 0);
  ram.setU8(rec + 0x0c, type);
  ram.setU8(rec + 0x0d, 0);                 // class byte (common pool)
  ram.setU32(rec + 0x06, sub);
  const tab = type < 0x80 ? SPAWN.TYPE_LO : SPAWN.TYPE_HI;
  const init = rom.u32(tab + (type & 0x7f) * 8);
  ram.setU16(rec + 0x04, rom.u16(init + 2));   // the stub's run-length
}

// the unported log (collects the $263808 / boss notes; never throws here).
function makeUnported() {
  return { note() {}, calls: new Map(),
    report() { return []; } };
}

// the 21 stage-1 init-body types (the W23 scope).  Types outside this set
// ($1E/$1C and any boss-fight handler spawns) arrive through the deferred queue
// (W25/W29) and are reported as out-of-scope, not failed.
const STAGE1_TYPES = new Set([
  0x11, 0x27, 0x10, 0x85, 0x05, 0x07, 0x80, 0x8A, 0x8B, 0x20, 0x0D, 0x82,
  0x89, 0x88, 0x08, 0x21, 0x0B, 0x09, 0x24, 0x31, 0x0E,
]);
// speed/heading/anim/flags are overridden by the movement-script reader $263808
// (resource #$1F, W24): its initial bytes set speed (+$1A) and heading (+$1B),
// and its sub-action dispatch ($263948, opcodes $C0-$FF) sets anim (+$1E) and
// flags (+$00) per-spawn.  The prototype holds the DEFAULT; the script overrides
// per spawn.  Reported separately as a W24 dependency.
const MOVEMENT_FIELDS = new Set(['spd', 'hdg', 'anim', 'flags']);
// b28 (the bucket word +$28) high byte is adjusted by the rank byte from
// $242E24, which indexes table $242E42 by the RUNNING counter $803916 (low byte
// incremented every $242E24 call across the whole game).  The F-line captures
// $803916 POST-init (after the body's own increment), so the port reads one
// index ahead; and the counter also advances in handler code (W25) the port
// does not run.  This is a rank-counter dependency, reported separately.
const RANK_COUNTER_FIELDS = new Set(['b28']);

// ------------------------------------------------------------- the comparison
function compare(frames, portByLf) {
  let matched = 0, divergent = 0, firstDiv = null;
  let w24Bucket = 0, w24Move = 0, rankCtr = 0, staleBucket = 0, outOfScope = 0;
  let boardSpawns = 0, portSpawns = 0;
  const divByField = new Map();
  const divByType = new Map();
  for (const [lf, f] of frames) {
    if (!portByLf.has(lf)) continue;
    const port = portByLf.get(lf);
    for (const [type, boardRec] of f.spawns) {
      if (!STAGE1_TYPES.has(type)) { outOfScope++; continue; }   // W25/W29
      boardSpawns++;
      const portRec = port.get(type);
      if (!portRec) {            // port freed it (stage-kill gate) or threw
        divergent++;
        if (!firstDiv) firstDiv = { lf, type, kind: 'missing-in-port' };
        divByType.set(type, (divByType.get(type) ?? 0) + 1);
        continue;
      }
      portSpawns++;
      // scan ALL columns; classify each mismatch into a named gap or a strict
      // divergence.  Only FIELDS (the loader-written stats) count as strict.
      let perTypeDiv = false;
      for (const fn of ALL_COLS) {
        if (portRec[fn] === boardRec[fn]) continue;
        const isAimBucket = AIM_BUCKET_TYPES.has(type) && BUCKET_FIELDS.has(fn);
        const isMove = MOVEMENT_FIELDS.has(fn);
        const isRankCtr = RANK_COUNTER_FIELDS.has(fn);
        const isBucket = BUCKET_FIELDS.has(fn);
        if (isAimBucket) { w24Bucket++; continue; }      // W24 (position)
        if (isMove) { w24Move++; continue; }             // W24 ($263808)
        if (isRankCtr) { rankCtr++; continue; }          // rank counter ($803916)
        if (isBucket) { staleBucket++; continue; }       // stale-slot / type-specific
        if (fn === 'hprel' && !hprelMeaningful(type)) { staleBucket++; continue; }
        if (!FIELDS.includes(fn)) continue;               // not in the strict set
        divergent++;
        if (!firstDiv) firstDiv = { lf, type, fn, port: portRec[fn], board: boardRec[fn] };
        divByField.set(fn, (divByField.get(fn) ?? 0) + 1);
        perTypeDiv = true;
      }
      if (!perTypeDiv) matched++;
      else divByType.set(type, (divByType.get(type) ?? 0) + 1);
    }
  }
  return { matched, divergent, firstDiv, w24Bucket, w24Move, rankCtr, staleBucket,
           outOfScope, boardSpawns, portSpawns, divByField, divByType };
}

function main() {
  if (!fs.existsSync(TABLES)) {
    console.error(`FAIL player.tables.json missing -- run tools/export-tables.py`);
    return 1;
  }
  if (!fs.existsSync(corpus)) {
    console.error(`SKIP ${path.basename(corpus)} missing -- `
      + '`python tools/oracle/w23run.py 16000 w23-stats-stage1` (~6.5 min)');
    return 0;   // SKIP, not FAIL (the corpus is ROM-derived / gitignored)
  }
  const rom = new RomWindows(JSON.parse(fs.readFileSync(TABLES, 'utf8')).rom);
  const frames = readCorpus(corpus);
  const win = stageWindow(frames);

  if (BREAKS.length === 0) {
    const { portByLf, portErrors } = runPort(frames, win, rom, null);
    if (portErrors.length) {
      console.error(`PORT ERRORS (${portErrors.length}) -- init bodies threw on `
        + `uncovered ROM reads; first 8:`);
      for (const e of portErrors.slice(0, 8))
        console.error(`  lf=${e.lf} clk=${e.clk.toString(16)} type=$${e.type.toString(16)} ${e.err.split('\n')[0]}`);
    }
    const r = compare(frames, portByLf);
    const span = win.reset - win.install;
    console.log(`CORPUS ${path.basename(corpus)}`);
    console.log(`window lf ${win.install}..${win.reset - 1} (${span} frames)`);
    const pct = (100 * (1 - r.divergent / Math.max(1, r.boardSpawns))).toFixed(4);
    console.log(`RESULT stats divergent: ${r.divergent} across `
      + `${r.boardSpawns} stage-1 (lf,type) spawns (${pct} % match)`);
    if (r.firstDiv) {
      console.log(`  first divergence lf=${r.firstDiv.lf} type=$${r.firstDiv.type.toString(16)}`
        + (r.firstDiv.fn ? ` field=${r.firstDiv.fn} port=${r.firstDiv.port} board=${r.firstDiv.board}`
           : ` (${r.firstDiv.kind})`));
    }
    console.log(`  matched (every compared field equal): ${r.matched} of ${r.boardSpawns}`);
    console.log(`  W24-pending: ${r.w24Move} speed/heading fields (overridden by the `
      + `movement reader $263808, resource #\$1F) + ${r.w24Bucket} aim->bucket fields `
      + `on types $80/$82/$85/$88/$89 (need the spawn position)`);
    console.log(`  rank-counter: ${r.rankCtr} bucket-word (b28) fields track the `
      + `running $803916 counter (W25 handler calls advance it)`);
    console.log(`  stale/type-specific bucket: ${r.staleBucket} bucket fields the `
      + `init does not write for that type (stale slot data on the board)`);
    console.log(`  out-of-scope (W25/W29 handler-spawned, e.g. $1E/$1C): ${r.outOfScope}`);
    if (portErrors.length)
      console.log(`  port errors (init threw): ${portErrors.length}`);
    if (r.divByType.size) {
      console.log('  divergent by type:');
      for (const [t, n] of [...r.divByType].sort((a, b) => b[1] - a[1]))
        console.log(`    $${t.toString(16).padStart(2, '0')}  ${n}`);
    }
    if (r.divByField.size) {
      console.log('  divergent by field:');
      for (const [fn, n] of [...r.divByField].sort((a, b) => b[1] - a[1]))
        console.log(`    ${fn}  ${n}`);
    }
    return r.divergent === 0 ? 0 : 1;
  }

  // the RED sweep -- each mutation must make the gate diverge where it was 0.
  const MUT = {
    'swap-tables': 'two types\' sub-record prototype tables swapped at spawn '
      + '(the plan section 3 RED: swap two types\' tables and watch fields diverge)',
    'corrupt-hp': '$11\'s sub-record HP word zeroed in the proto window -> the '
      + 'strict HP field diverges',
    'seed-wrong-stage': '$813092 seeded wrong -> the stage-kill gates free enemies '
      + 'the board did not (and vice versa) -> missing-in-port divergences',
  };
  let allRed = true;
  for (const m of BREAKS) {
    let romMut = rom;
    if (m === 'swap-tables') romMut = makeSwappedRom();
    else if (m === 'corrupt-hp') romMut = makeCorruptRom();
    if (romMut === null) { console.log(`RED [${m}] skipped (windows unavailable)`); continue; }
    const { portByLf } = runPort(frames, win, romMut, m);
    const r = compare(frames, portByLf);
    const red = r.divergent > 2;          // baseline is 2 (the $88 W24 hitbox)
    if (!red) allRed = false;
    console.log(`RED [${m}] divergent=${r.divergent} ${red ? 'RED' : 'green'} -- ${MUT[m] ?? ''}`);
  }
  return allRed ? 0 : 1;
}

// a rom with the $11 and $07 sub-record prototype windows SWAPPED (byte-for-byte
// at the data the loader reads -- the faithful "swap two types' tables").
function makeSwappedRom() {
  const j = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const wins = j.rom.windows.map((w) => ({ ...w }));
  const at = (base) => wins.find((w) => parseInt(w.base.replace('$', ''), 16) === base);
  const w11 = at(0x268800), w07 = at(0x26A2B0);
  if (!w11 || !w07) return null;
  const off11 = 0x268828 - 0x268800;   // $11 sub proto offset in its window
  const off07 = 0x26A2C6 - 0x26A2B0;   // $07 sub proto offset
  const a = w11.hex, b = w07.hex;
  const p11 = a.substr(off11 * 2, 0x1C * 2);
  const p07 = b.substr(off07 * 2, 0x1C * 2);
  w11.hex = a.slice(0, off11 * 2) + p07 + a.slice((off11 + 0x1C) * 2);
  w07.hex = b.slice(0, off07 * 2) + p11 + b.slice((off07 + 0x1C) * 2);
  return new RomWindows({ windows: wins });
}

// a rom with $11's sub-record HP word zeroed -> the strict HP field diverges.
// The loader reads the longword at proto+$12 into sub+$16..+$19, so sub+$18
// (HP) is the word at proto+$14 = $268828+$14 = $26883C.
function makeCorruptRom() {
  const j = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const wins = j.rom.windows.map((w) => ({ ...w }));
  const w = wins.find((w) => parseInt(w.base.replace('$', ''), 16) === 0x268800);
  if (!w) return null;
  const off = (0x268828 + 0x14) - 0x268800;     // the proto byte landing in sub+$18
  w.hex = w.hex.slice(0, off * 2) + '0000' + w.hex.slice((off + 2) * 2);
  return new RomWindows({ windows: wins });
}

process.exit(main());
