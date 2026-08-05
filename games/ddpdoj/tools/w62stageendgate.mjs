#!/usr/bin/env node
// W62 (S1) -- **THE SCENARIO IN WHICH STAGE 1 ENDS.**
//
//     node games/ddpdoj/tools/w62stageendgate.mjs [--assets DIR] [--break NAME]
//
// ============================================================================
// WHY THIS FILE EXISTS
// ============================================================================
// The owner's binding directive (`docs/worklog/ddpdoj/39`) is that stage 1 must
// be FEATURE COMPLETE and ORACLE-CLEAN, and **a stage that never finishes is
// not complete**.  Before this wave the port stopped dead at `UNPORTED $292902`
// on logic frame 7,870 (W57 8.3, reproduced on the deployed page), and every
// gate in the repo was green over a game that could not reach its own ending.
//
// This gate drives the SHIPPED BUNDLE from its own seed with fire held and
// asserts, as exact frames, that:
//
//   * the boss's 10,800-frame timeout (`$22(a5) = $2A30` from `$2927F6`) runs
//     down ONE PER LOGIC FRAME and expires,
//   * `$294DD4` arms A3 script 6 and the death animation reaches `$2595E8`,
//   * `$25962E` returns C=1 exactly once and `$242952` runs exactly once,
//   * the BACKGROUND OBJECT IS DESTROYED and a DIFFERENT one is built,
//   * `$813092`/`$813094`/`$813096` go 0/0/0 -> 1/2/4,
//   * and the distance clock `$8130CE` is back at ZERO.
//
// **IT IS PORT-VS-LISTING, NOT A BOARD COMPARISON.**  No MAME run in this repo
// has ever reached the stage-1 boss, let alone timed him out, and this file does
// not pretend otherwise.  What it does that nothing else does is walk the path.
//
// --break no-timeout  freezes `$22(a5)` at its loaded value each frame, so the
//   timeout can never expire.  Every assertion about the end must go RED --
//   that is the proof this gate measures the stage ending and not the clock.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/main.js';
import { loadBundle } from '../src/web/assets.js';
import { portWordFromBits } from '../src/input.js';
import { BIT } from '../src/machine.js';
import { ENEMY } from '../src/enemies.js';
import { OBJ } from '../src/objdriver.js';
import { BOSS } from '../src/boss.js';
import { SE } from '../src/stageend.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const ASSETS = path.resolve(arg('assets', path.join(HERE, '..', 'assets')));
const BREAKS = ['no-timeout'];
const brk = arg('break', null);
if (brk && !BREAKS.includes(brk)) {
  console.error(`unknown --break ${brk}; known: ${BREAKS.join(', ')}`);
  process.exit(2);
}
if (!fs.existsSync(path.join(ASSETS, 'manifest.json'))) {
  console.error(`${ASSETS}/manifest.json is missing -- run: `
    + 'node games/ddpdoj/tools/export-web.mjs');
  process.exit(2);
}

const A = {
  clock: 0x8130ce, suspend: 0x812e06, clearing: 0x812972, advance: 0x812970,
  flags8: 0x8130f8, flags9: 0x8130f9, intervene: 0x810424,
  a3slot0: 0x812a74,
  // the rank / score ledger, to I2's standard
  rank: 0x81309e, rankPower: 0x81b646, hyperP1: 0x81b65c, hyperP2: 0x81b65e,
  earn: 0x81b64a, chain: 0x81b5b6, rng: 0x803916,
};
const STEPS = 21000;

const bundle = await loadBundle(async (n) =>
  new Uint8Array(fs.readFileSync(path.join(ASSETS, n))));

function bossRecord(ram) {
  for (let i = 0; i < ENEMY.slots; i++) {
    const r = ENEMY.table + i * ENEMY.stride;
    if (ram.u16(r) !== 0
      && (ram.u32(r + ENEMY.handlerOff) & 0xffffff) === 0x292902) return r;
  }
  return null;
}
function bgObject(ram) {
  for (let i = 0; i < OBJ.slots; i++) {
    const s = OBJ.base + i * OBJ.stride;
    if ((ram.u16(s) & 0xff) === 1) return s;
  }
  return null;
}
function type6Object(ram) {
  for (let i = 0; i < OBJ.slots; i++) {
    const s = OBJ.base + i * OBJ.stride;
    if ((ram.u16(s) & 0xff) === 6) return s;
  }
  return null;
}

function run() {
  const game = new Game(bundle.seed, bundle.tables, {
    logicFrame: bundle.cap.frames[0].lf,
    videoFrame: bundle.cap.frames[0].vf,
    bgSeed: bundle.cap.part(0, 'bg'),
  });
  const word = portWordFromBits([BIT.b1]);
  const r = {
    throwMsg: null, lastLf: null, lastClk: null,
    bossFirstLf: null, timeoutStart: null, timeoutSteps: 0,
    bgHandleBefore: null, bgHandleAfter: null, handleChangedLf: null,
    bgGoneLf: null, bgLiveAtEnd: null,
    stageBefore: null, stageAfter: null, stageWrittenLf: null,
    clkAfter: null, d6States: [], type6States: [], type6Slot: null,
    ledgerAtBoss: null, ledgerAtEnd: null, notes: null,
  };
  let prevBg = null, prevT6 = null, prevD6 = null, prevTimeout = null;
  let prevStage = null, prevHandle = null;
  for (let i = 0; i < STEPS; i++) {
    const ram = game.ram;
    // ---- SAMPLED BEFORE THE STEP, so `game.logicFrame` is the frame whose
    // state this is.  Sampling after `step()` reads the NEXT frame's number and
    // reports every event one frame late; the first version of this file did.
    const lf = game.logicFrame;
    const boss = bossRecord(ram);
    if (boss !== null) {
      if (r.bossFirstLf === null) {
        r.bossFirstLf = lf;
        r.timeoutStart = ram.u16(boss + BOSS.timeout);
        r.stageBefore = ram.u16(SE.stage);
        r.bgHandleBefore = ram.u32(SE.bgHandle);
        r.ledgerAtBoss = ledger(ram);
      }
      const t = ram.u16(boss + BOSS.timeout);
      if (prevTimeout !== null && t === prevTimeout - 1) r.timeoutSteps++;
      prevTimeout = t;
      if (brk === 'no-timeout') ram.setU16(boss + BOSS.timeout, 0x2a30);
    }
    // D-script 6 lives in whichever A3 slot $259962 could claim.  $294DD4 starts
    // 4, then 5, then 6, and the search is first-empty-first, so it is slot 2 --
    // but the port FINDS it rather than assuming, because "slot 2" would be an
    // invented fact.
    const d6 = a3SlotFor(ram, 6);
    if (d6 !== null) {
      const st = ram.u8(d6 + 0x02);
      if (st !== prevD6) { r.d6States.push([st, lf]); prevD6 = st; }
    }
    const t6 = type6Object(ram);
    if (t6 !== null) {
      if (r.type6Slot === null) r.type6Slot = (t6 - OBJ.base) / OBJ.stride;
      const st = ram.u8(t6 + 0x06);
      if (st !== prevT6) { r.type6States.push([st, lf]); prevT6 = st; }
    }
    const bg = bgObject(ram);
    if (bg === null && prevBg !== null && r.bgGoneLf === null) r.bgGoneLf = lf;
    prevBg = bg;
    const h = ram.u32(SE.bgHandle);
    if (prevHandle !== null && h !== prevHandle && r.handleChangedLf === null) {
      r.handleChangedLf = lf; r.bgHandleAfter = h;
    }
    prevHandle = h;
    const stg = ram.u16(SE.stage);
    if (prevStage !== null && stg !== prevStage && r.stageWrittenLf === null) {
      r.stageWrittenLf = lf; r.stageAfter = stg; r.clkAfter = ram.u16(A.clock);
    }
    prevStage = stg;
    r.lastLf = lf; r.lastClk = ram.u16(A.clock);
    ram.setU8(A.intervene, 0xff);
    try {
      game.step(word);
    } catch (e) {
      r.throwMsg = String(e.message).split('\n')[0].slice(0, 96);
      break;
    }
  }
  // The state AFTER the last completed frame -- including the object table, so
  // the NEW background object can be counted even though the run stops on the
  // very frame it first asks for stage 2's map.
  const ram = game.ram;
  r.bgLiveAtEnd = bgObject(ram) !== null;
  r.clkFinal = ram.u16(A.clock);
  r.stageFinal = ram.u16(SE.stage);
  r.stageX4Final = ram.u16(0x813096);
  r.handleFinal = ram.u32(SE.bgHandle);
  r.events = game.stageEndEvents;
  r.ledgerAtEnd = ledger(ram);
  r.notes = game.unportedLog;
  r.protoTimeout = game.rom.u16(0x2927f6 + 12);   // the $2927F6 prototype
  return r;
}

/** The A3 slot carrying script `id`, or null. */
function a3SlotFor(ram, id) {
  for (let i = 0; i < 10; i++) {
    const a = A.a3slot0 + i * 0x20;
    const s = ram.u16(a);
    if (s !== 0 && (s & 0xff) === id) return a;
  }
  return null;
}

function ledger(ram) {
  return {
    rank: ram.u16(A.rank), rankPower: ram.u16(A.rankPower),
    hyperP1: ram.u16(A.hyperP1), hyperP2: ram.u16(A.hyperP2),
    earn: ram.u16(A.earn), rng: ram.u16(A.rng),
  };
}

// ============================================================ THE MEASUREMENTS
// [M] on the final W62 tree, from the shipped bundle's own seed (boot lf2001),
// fire HELD.  Exact frames, never ranges: a drift of one frame is RED.
const EXP = {
  // [M] on the final W62 tree.  `bossFirstLf`/`timeoutStart` are what the
  // PRE-STEP scan sees: the boss's handler first runs on lf7870 -- W57's own
  // frontier, the frame the port used to stop on -- and by the time the scan
  // looks, `$294F3C` has spent one.  $2A30 itself is asserted from the
  // cartridge, below, so the -1 cannot hide a wrong prototype.
  bossFirstLf: 7871, timeoutStart: 0x2a2f, timeoutSteps: 10799,
  timeoutLf: 18669, animFrames: 474, suspendLf: 19143, advanceLf: 19144,
  bgGoneLf: 19147, stageWrittenLf: 19216, rebuiltLf: 19217,
  d6States: 7, type6States: 7,
};

const r = run();
let bad = 0;
const say = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const ev = (k) => r.events.filter(([x]) => x === k).map(([, f]) => f);

console.log(`W62 STAGE-END SCENARIO -- ${STEPS} steps from the shipped bundle's `
  + `own seed, fire HELD${brk ? `   [BREAK ${brk}]` : ''}`);
console.log(`  boss live from lf${r.bossFirstLf}, $22(a5) = $${(r.timeoutStart ?? 0).toString(16)}`
  + `, ${r.timeoutSteps} decrements`);
console.log(`  events: ${r.events.map(([k, f, v]) => `${k}@${f}${v === undefined || v === null ? '' : `=${v}`}`).join('  ')}`);
console.log(`  D-script 6 states: ${r.d6States.map(([s2, f]) => `${s2}@${f}`).join(' ')}`);
console.log(`  type 6 (slot ${r.type6Slot}) states: ${r.type6States.map(([s2, f]) => `$${s2.toString(16)}@${f}`).join(' ')}`);
console.log(`  $813144: $${(r.bgHandleBefore ?? 0).toString(16)} -> $${(r.bgHandleAfter ?? 0).toString(16)}`
  + ` at lf${r.handleChangedLf};  bg object absent from lf${r.bgGoneLf}, live at end: ${r.bgLiveAtEnd}`);
console.log(`  $813092 ${r.stageBefore} -> ${r.stageAfter} at lf${r.stageWrittenLf}; `
  + `final $813092=${r.stageFinal} $813096=${r.stageX4Final} clock=${r.clkFinal}`);
console.log(`  RANK at the boss : ${JSON.stringify(r.ledgerAtBoss)}`);
console.log(`  RANK at the end  : ${JSON.stringify(r.ledgerAtEnd)}`);
console.log(`  stopped: ${r.throwMsg ?? '(ran out of steps)'}`);
console.log('');

say(r.bossFirstLf === EXP.bossFirstLf,
  `the boss record is live at lf${EXP.bossFirstLf}, W57's own frontier (got ${r.bossFirstLf})`);
say(bundle.tables && r.protoTimeout === 0x2a30,
  `THE CARTRIDGE's own word: $2927F6 + 12 = $2A30 = 10,800 `
  + `(got $${(r.protoTimeout ?? 0).toString(16)})`);
say(r.timeoutStart === EXP.timeoutStart,
  `$22(a5) reads $2A2F on lf7871 -- $2A30 loaded by $26377A, one $294F3C spent `
  + `(got $${(r.timeoutStart ?? 0).toString(16)})`);
say(r.timeoutSteps === EXP.timeoutSteps,
  `$294F3C spends it ONE PER LOGIC FRAME: ${EXP.timeoutSteps} decrements (got ${r.timeoutSteps})`);
say(ev('timeout').length === 1 && ev('timeout')[0] === EXP.timeoutLf,
  `THE TIMEOUT EXPIRES ONCE, at lf${EXP.timeoutLf} (got ${JSON.stringify(ev('timeout'))})`);
say(ev('hp0').length === 0,
  `...and the boss dies BY TIMEOUT, not by HP: $294BA4 never fires (${JSON.stringify(ev('hp0'))})`);
say(r.d6States.length === EXP.d6States,
  `D-script 6 walks ${EXP.d6States} states, 0 to 6 (got ${r.d6States.length})`);
say(ev('suspend').length === 1 && ev('suspend')[0] === EXP.suspendLf,
  `$293E16 jsr $2595E8 sets $812E06 ONCE, at lf${EXP.suspendLf} (got ${JSON.stringify(ev('suspend'))})`);
say(ev('suspend')[0] - ev('timeout')[0] === EXP.animFrames,
  `the death animation is ${EXP.animFrames} frames -- NOT the 32 recon 49 3.1 read `
  + `off $293DC6's init (got ${ev('suspend')[0] - ev('timeout')[0]})`);
say(ev('stage-advance').length === 1 && ev('stage-advance')[0] === EXP.advanceLf,
  `$25962E returns C=1 and $242952 runs EXACTLY ONCE, at lf${EXP.advanceLf} `
  + `(got ${JSON.stringify(ev('stage-advance'))})`);
say(ev('bg-destroyed').length === 1,
  `$25FCFA queues the background object for destruction ONCE `
  + `(lf${ev('bg-destroyed')[0]})`);
say(r.bgGoneLf === EXP.bgGoneLf,
  `THE BACKGROUND OBJECT LEAVES THE TABLE at lf${EXP.bgGoneLf}, one frame after `
  + `$25FCFA -- the DEFERRED kill, not a synchronous one (got ${r.bgGoneLf})`);
say(ev('stage-written').length === 1 && ev('stage-written')[0] === EXP.stageWrittenLf,
  `$25FD0C writes the stage counter ONCE, at lf${EXP.stageWrittenLf} `
  + `(got ${JSON.stringify(ev('stage-written'))})`);
say(r.stageBefore === 0 && r.stageAfter === 1,
  `$813092 goes 0 -> 1 (got ${r.stageBefore} -> ${r.stageAfter})`);
say(r.stageX4Final === 4,
  `$813096, the x4 index every per-stage table is read through, goes 0 -> 4 `
  + `(got ${r.stageX4Final})`);
say(ev('rebuilt').length === 1 && ev('rebuilt')[0] === EXP.rebuiltLf,
  `$25FD38 rebuilds ONCE, at lf${EXP.rebuiltLf} (got ${JSON.stringify(ev('rebuilt'))})`);
say(r.bgHandleAfter !== null && r.bgHandleAfter !== r.bgHandleBefore,
  `$813144 changes -- a DIFFERENT object, not the same one resumed `
  + `($${(r.bgHandleBefore ?? 0).toString(16)} -> $${(r.bgHandleAfter ?? 0).toString(16)})`);
say(r.bgLiveAtEnd === true,
  `a background object is LIVE again after the rebuild (got ${r.bgLiveAtEnd})`);
say(r.clkFinal === 0,
  `the distance clock $8130CE is back at ZERO -- $25FD24's 22-word wipe and `
  + `$25FD7A's entry clock (got ${r.clkFinal})`);
say(r.type6States.length === EXP.type6States,
  `object type 6 walks ${EXP.type6States} states (got `
  + `${r.type6States.map(([s2]) => `$${s2.toString(16)}`).join(',')})`);
// RANK, to I2's standard: four addresses, digit-identical across the stage end.
for (const k of ['rank', 'rankPower', 'hyperP1', 'hyperP2']) {
  say(r.ledgerAtBoss[k] === r.ledgerAtEnd[k],
    `RANK: ${k} is digit-identical across the stage end `
    + `(${r.ledgerAtBoss[k]} -> ${r.ledgerAtEnd[k]})`);
}

console.log('');
console.log(bad === 0 ? 'W62 STAGE END: ok' : `W62 STAGE END: ${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
