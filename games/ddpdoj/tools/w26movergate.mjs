#!/usr/bin/env node
// WAVE 26 -- THE BULLET MOVER GATE.  Per-frame, BEFORE-vs-AFTER the mover.
//
// ============================ WHAT IT COMPARES, AND WHY =====================
//
// `tools/oracle/w26mover.lua` captures the whole bullet pool twice a frame:
// immediately BEFORE the mover `$281DDE` runs (`B` rows) and immediately AFTER
// it returns (`A` rows).  The gate seeds the port's RAM from BEFORE, runs
// `runMover` ONCE, and compares the port's pool to AFTER.  Because the mover is
// the ONLY thing that runs between the two tap points, every divergence is the
// mover's -- the spawn side cannot leak in.
//
// The compared fields are the DONE-WHEN set: per slot, alive, kind (type&$3F),
// speed (+$1A), direction (+$1B), posA (+$2), posB (+$4).  Velocity (+$1E) and
// the sprite fields are not compared (they are mover-internal / rendering); a
// wrong velocity shows up as a wrong POSITION one frame later, which is the
// honest place to catch it.
//
//   node tools/w26movergate.mjs
//   node tools/w26movergate.mjs --corpus tools/oracle/out/w26-mover-stage1.tsv
//   node tools/w26movergate.mjs --break velocity-stored-not-recomputed
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { BUL, REC } from '../src/bullets.js';
import { runMover } from '../src/mover.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const TABLES = path.join(ROOT, 'rip', 'port', 'player.tables.json');
const CORPUS = path.resolve(ROOT, process.argv.includes('--corpus')
  ? process.argv[process.argv.indexOf('--corpus') + 1]
  : path.join('tools', 'oracle', 'out', 'w26-mover-stage1.tsv'));

const i16 = (v) => (v << 16) >> 16;

// --------------------------------------------------------------- the corpus
/** Group rows into frame pairs { lf, globals, before:Map(slot->hex), after:Map }. */
function readPairs(file) {
  const pairs = [];
  let cur = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    const t = line.split('\t');
    if (t[0] === 'B' || t[0] === 'A') {
      const lf = Number(t[1]);
      const g = {};
      for (const kv of t.slice(2)) {
        const i = kv.indexOf('=');
        g[kv.slice(0, i)] = parseInt(kv.slice(i + 1), 16);
      }
      cur = { lf, globals: g, before: new Map(), after: new Map() };
      pairs.push(cur);
      if (t[0] === 'A') {
        // an A row with no preceding B for the same lf is orphan; keep its lf
      }
    } else if (t[0] === 'P') {
      // P <slot> <128 hex>
      const slot = Number(t[1]);
      const hex = t[2];
      if (!cur) continue;
      // attach to before/after by which tag most recently opened cur
      if (cur.after.size === 0 && !cur._seenA) cur.before.set(slot, hex);
      else cur.after.set(slot, hex);
    }
  }
  // The file interleaves B..P.. A..P.. per frame. Re-parse robustly by walking
  // tags: a B opens before-collection; an A switches to after-collection.
  return readPairsStrict(file);
}

function readPairsStrict(file) {
  const out = [];
  let cur = null, phase = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    const t = line.split('\t');
    if (t[0] === 'B') {
      const lf = Number(t[1]);
      const g = {};
      for (const kv of t.slice(2)) {
        const i = kv.indexOf('='); g[kv.slice(0, i)] = parseInt(kv.slice(i + 1), 16);
      }
      cur = { lf, globals: g, before: new Map(), after: new Map() };
      out.push(cur); phase = 'B';
    } else if (t[0] === 'A') {
      if (!cur) continue;
      phase = 'A';
    } else if (t[0] === 'P') {
      if (!cur) continue;
      const slot = Number(t[1]);
      (phase === 'A' ? cur.after : cur.before).set(slot, t[2]);
    }
  }
  return out;
}

/** Write a 128-hex record into the port's Ram at POOL+slot*STRIDE. */
function seedRecord(ram, slot, hex) {
  const base = BUL.pool + slot * BUL.stride;
  for (let i = 0; i < BUL.stride; i++) {
    ram.setU8(base + i, parseInt(hex.substr(i * 2, 2), 16));
  }
}
const recField = (hex, off, n = 2) => parseInt(hex.substr(off * 2, n * 2), 16);

// ------------------------------------------------------------------- the run
function runOn(corpus, mut) {
  const tablesJson = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const rom = new RomWindows(tablesJson.rom);
  // W437: the global-kill arm of `driveSlot` now really makes `$281E3A jsr
  // $27F8F8`, whose fill resolves a velocity out of the movement tables.
  const moveTables = new MoveTables(tablesJson, rom);
  let frames = 0, divergent = 0, slotCmp = 0;
  const byKind = new Map();
  const firstDiffs = [];
  const notes = new UnportedLog();
  const bump = (k) => byKind.set(k, (byKind.get(k) ?? 0) + 1);

  for (const p of corpus) {
    if (p.after.size === 0) continue;            // no AFTER captured (driver didn't run)
    frames++;
    // fresh RAM, seed EVERY before-live slot's full record + the globals.
    const ram = new Ram(null);
    for (const [slot, hex] of p.before) seedRecord(ram, slot, hex);
    ram.setU16(0x813176, p.globals.d6);
    ram.setU16(0x81b414, p.globals.w0); ram.setU16(0x81b416, p.globals.w1);
    ram.setU16(0x81b418, p.globals.w2); ram.setU16(0x81b41a, p.globals.w3);
    ram.setU16(0x811f72, p.globals.fc);
    ram.setU16(0x8130f8, p.globals.sk);
    ram.setU16(0x81b40e, p.globals.cad);
    ram.setU16(0x81b40c, p.globals.lc);
    ram.setU16(0x813098, p.globals.rank ?? 0);

    let threw = null;
    try {
      runMover({ ram, rom, tables: moveTables, notes, mut });
    } catch (e) { threw = e; }

    // compare every slot alive in BEFORE.
    for (const [slot, bhex] of p.before) {
      slotCmp++;
      const base = BUL.pool + slot * BUL.stride;
      const ptw = ram.u16(base + REC.typeWord);
      const pak = (ptw & 0x8000) !== 0;
      const kind = recField(bhex, REC.typeWord) & 0x3f;
      // the board's AFTER state for this slot (if still alive; absent => dead).
      const ahex = p.after.get(slot);
      const bak = recField(bhex, REC.typeWord) & 0x8000;
      const aak = ahex ? (recField(ahex, REC.typeWord) & 0x8000) : 0;
      let diff = null;
      if (threw) {
        diff = `THREW $${(threw.romAddress ?? 0).toString(16)}: ${threw.message.slice(0, 60)}`;
      } else if (pak && !aak) {
        diff = `alive-mismatch (port alive, board killed)`;
      } else if (!pak && aak) {
        diff = `alive-mismatch (port killed, board alive)`;
      } else if (pak && aak) {
        const f = (off) => [ram.u16(base + off), recField(ahex, off)];
        // position (the done-when column) + speed/dir + the STORED velocity, so
        // a recompute that stores the wrong vector is caught on its OWN frame
        // (a single-step before/after gate can't otherwise see a +$1E-only change).
        for (const [off, name] of
          [[REC.posA, 'posA'], [REC.posB, 'posB'], [REC.speed, 'spd'], [REC.dir, 'dir'],
           [REC.velA, 'velA'], [REC.velB, 'velB']]) {
          const [got, want] = f(off);
          if (got !== want) { diff = `${name} port=${got.toString(16)} board=${want.toString(16)}`; break; }
        }
        const ptwk = ptw & 0x3f, atwk = recField(ahex, REC.typeWord) & 0x3f;
        if (!diff && ptwk !== atwk) diff = `kind port=${ptwk} board=${atwk}`;
      }
      if (diff) {
        divergent++; bump(`kind${kind}`);
        if (firstDiffs.length < 8) {
          firstDiffs.push(`lf ${p.lf} slot ${slot} kind ${kind}: ${diff}`);
        }
      }
    }
  }
  return { frames, slotCmp, divergent, byKind, firstDiffs, notes };
}

// ------------------------------------------------------------------- report
if (!fs.existsSync(TABLES)) {
  console.log(`SKIP ${TABLES} absent -- run tools/export-tables.py`); process.exit(0);
}
if (!fs.existsSync(CORPUS)) {
  console.log(`SKIP ${CORPUS} absent -- run python tools/oracle/w26run.py 6000 w26-mover-stage1`);
  process.exit(0);
}

const corpus = readPairs(CORPUS);
const base = runOn(corpus, null);
console.log(`CORPUS ${path.basename(CORPUS)}  frames=${base.frames} slot-comparisons=${base.slotCmp}`);
console.log(`RESULT divergent=${base.divergent} of ${base.slotCmp} slot-steps  -> ${
  base.slotCmp ? (100 * (base.slotCmp - base.divergent) / base.slotCmp).toFixed(4) : 0} %`);
if (base.byKind.size) {
  console.log('DIVERGENT by kind: ' + [...base.byKind.entries()]
    .sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(' '));
}
for (const d of base.firstDiffs) console.log('  DIFF ' + d);

if (process.argv.includes('--break')) {
  const which = process.argv[process.argv.indexOf('--break') + 1] || 'all';
  // window-constant is a documented BLIND SPOT (like the W21 spawn gate): it only
  // changes an outcome when a live slot sits PAST the cap, and stage 1 never has
  // >70 live bullets, so it is green here by construction.
  const MUTS = ['velocity-stored-not-recomputed', 'no-plain-move', 'break-kill'];
  console.log('\nMUTATIONS -- every one must be RED (more divergent than baseline)');
  console.log('  (window-constant NOT ATTEMPTED: invisible while live count < 70 -- '
    + 'the W21 gate documents the same blind spot)');
  for (const m of (which === 'all' ? MUTS : [which])) {
    const r = runOn(corpus, m);
    const red = r.divergent > base.divergent;
    console.log(`  ${red ? 'RED  ' : 'green'} ${m.padEnd(34)} divergent=${r.divergent}/${r.slotCmp}`);
  }
}
process.exit(base.divergent === 0 ? 0 : 1);
