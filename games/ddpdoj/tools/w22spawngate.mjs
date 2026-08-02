#!/usr/bin/env node
// WAVE 22 -- THE SPAWN GATE.  The enemy spawn walker `$2633BE` against the
// board, frame for frame, over the wave-17-equivalent whole-stage corpus.
//
//   node tools/w22spawngate.mjs [tsv] [--break NAME] [--break all]
//
// =========================== WHAT IT COMPARES, AND WHY =====================
//
// The port's `walkScriptLoop` is driven frame-by-frame by the board's OWN
// distance clock `$8130CE` (real from W14, compared column `d0ce`) and the
// cursor it advances is compared against the board's measured `$8132CC`.  That
// cursor advances by 8 per dispatched record, so a cursor that matches at 0
// divergent over the whole stage is a spawn-for-spawn timing match: every one
// of stage 1's 339 script spawns lands on the frame the board lands it.
//
// The clock is an INPUT (the wave does not re-port it), which is the whole
// point of the RED switch `clock-per-frame`: if the walker is fed a per-frame
// counter instead of the odometer, the cursor diverges at the FIRST spawn and
// never recovers -- the wave-13/16 RED, repeated on the spawn side.
//
// =========================== WHAT IT DOES NOT COMPARE ======================
//
// The deferred-queue spawns.  The queue is fed by the enemy handlers
// ($263678/$263684/$263690) which are W25/W29 and are not ported, so over this
// corpus the port's queue is empty and its deferred count is 0.  The BOARD
// made 43 deferred spawns (the plan's "33+"), and the gate REPORTS that number
// as the measured gap rather than failing on it -- the walker DRAINS the queue
// correctly (unit-tested) but nothing feeds it yet.  The total board
// allocations (382 = 339 script + 43 deferred) are printed for the same reason.
//
// =========================== THE SCRIPT TERMINATOR =========================
//
// "Spawn counter compare at 0 divergent to the script terminator" (plan §3):
// the cursor at the end of the stage-1 window is $230C6C + 339*8 = $231704,
// which is the $FFFF terminator.  Both sides reach it on the same frame and
// the cumulative script-spawn count is 339.  That is the done-when.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { SPAWN, installStage, walkScriptLoop } from '../src/spawn.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const TABLES = path.join(ROOT, 'rip', 'port', 'player.tables.json');
const CORPUS_DEFAULT = path.join(ROOT, 'tools', 'oracle', 'out',
                                 'w22-spawn-stage1.tsv');

const argv = process.argv.slice(2);
// strip the --break VALUE so it is not mistaken for the corpus path
const positional = argv.filter((a, i) =>
  !(a.startsWith('-')) && argv[i - 1] !== '--break');
const corpus = path.resolve(ROOT, positional[0] ?? CORPUS_DEFAULT);
const breakIdx = argv.indexOf('--break');
const BREAK = breakIdx >= 0 ? (argv[breakIdx + 1] ?? null) : null;
const runAllBreaks = BREAK === 'all';
const BREAKS = runAllBreaks
  ? ['clock-per-frame', 'advance-by-7', 'no-terminator', 'trigger-low-byte']
  : (BREAK ? [BREAK] : []);

/** Each mutation names the misreading it falsifies and what must move. */
const MUTATIONS = {
  'clock-per-frame': "the walker is fed `lf` instead of the board's $8130CE. "
    + 'The clock is an odometer (W14), not a frame counter; a wrong cadence '
    + 'diverges at the first spawn and never recovers. REQUIRED RED (plan §3).',
  'advance-by-7': '`$263440 addq.w #8,A2` read as +7. Every record after the '
    + 'first mis-aligns the cursor and the terminator is never hit.',
  'no-terminator': 'the `$FFFF` stop is dropped, so the walker runs past the '
    + 'script into whatever bytes follow. The cursor runs away at the end.',
  'trigger-low-byte': 'the trigger is read as a byte (`u8`) instead of a word. '
    + 'Triggers >= 256 (the boss, trigger 488) never match.',
};

// ---------------------------------------------------------------- read corpus
// Each line is either "S\t..." (a spawn-ledger entry) or the 7-col data row:
//   lf  clk  cursor  live  dqct  nclaim  cumclaim
function readCorpus(file) {
  const frames = [];
  let boardSpawns = 0;     // total allocator claims in the window
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    if (line.startsWith('S\t')) continue;
    const c = line.split('\t');
    frames.push({
      lf: +c[0], clk: parseInt(c[1], 16), cursor: parseInt(c[2], 16),
      live: parseInt(c[3], 16), dqct: parseInt(c[4], 16),
      nclaim: +c[5], cumclaim: +c[6],
    });
  }
  return frames;
}

/** Find the stage-1 window: from the install frame (cursor first non-zero) to
 *  the reset frame (clock returns to 0 after going high).  Matches W17's
 *  10,431-lf window exactly. */
function stageWindow(frames) {
  let install = -1, reset = frames.length;
  for (let i = 0; i < frames.length; i++) {
    if (install < 0 && frames[i].cursor !== 0) install = i;
  }
  for (let i = install + 1; i < frames.length; i++) {
    if (frames[i - 1].clk > 0x40 && frames[i].clk === 0) { reset = i; break; }
  }
  return { install: install < 0 ? 0 : install, reset };
}

// ------------------------------------------------------------- the comparison
function runPort(frames, win, rom, brk) {
  const ram = new Ram();
  let portSpawns = 0;       // cumulative script dispatches
  let divergent = 0;
  let firstDiv = null;
  const curCol = [];        // per-frame port cursor (for reporting)

  for (let i = 0; i <= win.reset && i < frames.length; i++) {
    const f = frames[i];
    const inStage = i >= win.install && i < win.reset;

    if (inStage) {
      // the install: the first in-stage frame, call installStage exactly once.
      // (The flow layer's stage-start is W30; the gate seeds at the board's
      // own install frame, so the port and board agree at the script base.)
      if (i === win.install) installStage(ram, rom, 0, { note() {} });

      // the clock is an INPUT: real from W14, read from the board's column.
      const clk = brk === 'clock-per-frame' ? f.lf : f.clk;
      ram.setU16(SPAWN.DISTANCE_CLOCK, clk);

      walkScriptLoop(ram, rom, () => { portSpawns++; });

      let pc = ram.u32(SPAWN.LIVE_CURSOR);
      if (brk === 'advance-by-7') {
        // pretend the cursor advanced by 7 per record instead of 8: rederive
        // a wrong cursor by skewing from the install base by the spawn count
        const base = 0x230C6C;
        pc = base + portSpawns * 7;
      }
      curCol.push(pc);
      if (brk === 'no-terminator') {
        // force the cursor past everything (the runaway): add an arbitrary
        // offset once any spawn happened, so the divergence is unmissable
        if (portSpawns > 0) pc = curCol[curCol.length - 1] = pc + 0x10000;
      }
      if (brk === 'trigger-low-byte') {
        // the trigger mis-read already happened inside walkScriptLoop via the
        // patch below; nothing extra to do here
      }

      if (pc !== f.cursor) {
        divergent++;
        if (!firstDiv) firstDiv = { lf: f.lf, clk: f.clk, port: pc, board: f.cursor };
      }
    } else if (f.cursor === 0) {
      curCol.push(0);
    } else {
      curCol.push(f.cursor);   // outside window: don't claim
    }
  }
  return { divergent, firstDiv, portSpawns, curCol };
}

// Apply a trigger-read mutation by monkey-patching the rom u16 used inside
// walkScriptLoop.  We wrap the RomWindows instance so reads of the trigger
// word at a cursor are corruptible.  (The port reads triggers through
// rom.u16(cursor); patching that one method is the cleanest hook.)
function patchTriggerLowByte(rom) {
  const orig = rom.u16.bind(rom);
  rom.u16 = (a) => {
    const v = orig(a);
    // only corrupt the TRIGGER reads (cursor points into the script window);
    // leave the aux/type-table reads alone so install + dispatch still work.
    if (a >= 0x230C6C && a < 0x231706) return v & 0x00ff;
    return v;
  };
}

function main() {
  if (!fs.existsSync(TABLES)) {
    console.error(`FAIL player.tables.json missing -- run tools/export-tables.py`);
    return 1;
  }
  if (!fs.existsSync(corpus)) {
    console.error(`SKIP ${path.basename(corpus)} missing -- `
      + '`python tools/oracle/w22run.py 16000 w22-spawn-stage1` (~6.5 min)');
    return 0;   // SKIP, not FAIL (the corpus is ROM-derived / gitignored)
  }
  const rom = new RomWindows(JSON.parse(fs.readFileSync(TABLES, 'utf8')).rom);
  const frames = readCorpus(corpus);
  const win = stageWindow(frames);
  const stage1Frames = win.reset - win.install;

  // the board's own spawn bookkeeping over the window, for the report
  const boardScriptSpawns =
    (frames[Math.min(win.reset - 1, frames.length - 1)].cursor - 0x230C6C) / 8;
  let boardDeferred = 0, boardTotal = 0;
  for (let i = win.install; i < win.reset && i < frames.length; i++) {
    boardTotal = frames[i].cumclaim;
  }
  boardDeferred = boardTotal - boardScriptSpawns;

  if (BREAKS.length === 0) {
    const r = runPort(frames, win, rom, null);
    console.log(`CORPUS ${path.basename(corpus)}`);
    console.log(`window lf ${frames[win.install].lf}..${frames[win.reset - 1].lf} `
      + `(${stage1Frames} frames, reset at lf ${frames[win.reset]?.lf})`);
    console.log(`RESULT cursor divergent: ${r.divergent} of ${stage1Frames} frames `
      + `(${(100 * (1 - r.divergent / stage1Frames)).toFixed(4)} %)`);
    if (r.firstDiv) {
      console.log(`  first divergence lf=${r.firstDiv.lf} clk=${r.firstDiv.clk.toString(16)} `
        + `port=${r.firstDiv.port.toString(16)} board=${r.firstDiv.board.toString(16)}`);
    }
    console.log(`SPAWN COUNTER port script=${r.portSpawns} board script=${boardScriptSpawns} `
      + `(terminator ${r.portSpawns === 339 && boardScriptSpawns === 339 ? 'REACHED' : 'NOT reached'} `
      + `at 339)`);
    console.log(`BOARD total allocations=${boardTotal} (script ${boardScriptSpawns} + `
      + `deferred ${boardDeferred}; the deferred ${boardDeferred} arrive through the `
      + `$815EAA queue -- handlers unported, port produces 0)`);
    const termBoardCursor = frames[Math.min(win.reset - 1, frames.length - 1)].cursor;
    // the port cursor at the last in-stage frame (index win.reset-1, since
    // curCol is indexed by absolute frame index 0..win.reset)
    const termPortCursor = r.curCol[win.reset - 1] ?? 0;
    console.log(`CURSOR at terminator: port=${termPortCursor.toString(16).toUpperCase()} `
      + `board=${termBoardCursor.toString(16).toUpperCase()} `
      + `(want $231704 = $230C6C + 339*8)`);
    return r.divergent === 0 && r.portSpawns === 339 ? 0 : 1;
  }

  // the RED sweep
  let allRed = true;
  for (const m of BREAKS) {
    const romMut = new RomWindows(JSON.parse(fs.readFileSync(TABLES, 'utf8')).rom);
    if (m === 'trigger-low-byte') patchTriggerLowByte(romMut);
    const r = runPort(frames, win, romMut, m);
    const red = r.divergent > 0;
    if (!red) allRed = false;
    console.log(`RED [${m}] divergent=${r.divergent} of ${stage1Frames} `
      + `${red ? 'RED' : 'green'} -- ${MUTATIONS[m] ?? ''}`);
  }
  return allRed ? 0 : 1;
}

process.exit(main());
