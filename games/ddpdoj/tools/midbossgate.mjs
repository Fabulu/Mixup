#!/usr/bin/env node
// W57 (M1) -- **THE SCENARIO THAT KILLS THE MIDBOSS.**
//
//     node games/ddpdoj/tools/midbossgate.mjs [--assets DIR] [--break NAME]
//
// ============================================================================
// WHY THIS FILE EXISTS, and it is the load-bearing half of wave 57
// ============================================================================
// W31 ported the stage-1 midboss and wrote, plainly: "NO RUN IN THIS CORPUS
// KILLS THE MIDBOSS, so the release path has never been compared against the
// board." It shipped anyway. Twenty waves later W51 gave the beam the ability
// to kill, the owner held fire on the LIVE PAGE, and the port walked into
// `$26B7D8` for the first time and **stopped** -- `UNPORTED $26C1C4`, the init
// stub of the type the midboss's own death enqueues (W56, reproduced three
// times on `https://gbtman.pages.dev/games/ddpdoj/`).
//
// The window and the two routines W57 ported are twenty-eight instructions.
// **The reason the defect survived 25 waves behind a green gate is that no
// scenario killed him**, and a fix without one leaves the next regression
// equally invisible. So this is a gate stage, not a measurement in a worklog.
//
// ============================================================================
// WHAT IT IS, AND WHAT IT IS NOT
// ============================================================================
// It drives the SHIPPED BUNDLE -- the same `seed`, `tables` and capture frame
// the published page boots from -- with the fire button HELD, and asserts on
// what the ROM decides. It is **port-vs-listing**, like `webgate`'s W44 stage:
// no MAME run in this repo has ever killed the midboss either, so there is no
// board column to compare against and this file does not pretend there is.
// What it CAN do, and what nothing else in the gate does, is walk the path.
//
// TWO RUNS, and the CONTROL is not padding. Fire suppressed, the midboss lives
// and the crawl is the ROM's full 9 ticks x 64 frames; fire held, he dies and
// `$26B73A jsr $261100` quadruples the scroll speed mid-crawl. The gate asserts
// BOTH, so "the crawl is short" cannot pass by the crawl never happening.
//
// EVERY EXPECTED NUMBER BELOW IS [M] MEASURED ON THE FINAL W57 TREE and is
// written as an exact frame, never as a range, so a drift of one frame is red.
//
// --break no-kill  runs the HELD window with fire SUPPRESSED. Every assertion
//   about the death, the type-$1C object and the early release must go red --
//   that is the proof that this gate is measuring the kill and not the clock.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/main.js';
import { loadBundle } from '../src/web/assets.js';
import { portWordFromBits } from '../src/input.js';
import { BIT } from '../src/machine.js';
import { ENEMY } from '../src/enemies.js';
import { OBJ } from '../src/objdriver.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const ASSETS = path.resolve(arg('assets', path.join(HERE, '..', 'assets')));
const BREAKS = ['no-kill'];
const brk = arg('break', null);
if (brk && !BREAKS.includes(brk)) {
  console.error(`unknown --break ${brk}; known: ${BREAKS.join(', ')}`);
  process.exit(2);
}
if (!fs.existsSync(path.join(ASSETS, 'manifest.json'))) {
  // Not a skip. The bundle is what the page ships and its absence means the
  // tree is not built, not that this check passed.
  console.error(`${ASSETS}/manifest.json is missing -- run: `
    + 'node games/ddpdoj/tools/export-web.mjs');
  process.exit(2);
}

// ------------------------------------------------------------ the ROM's facts
const A = {
  clock: 0x8130ce,      // $26132C -- THE DISTANCE CLOCK
  midbossFlag: 0x8130d8, // set by the midboss's init ($26B484), CLEARED by its
                         //   death at $26B72C, one instruction before the push
  extArm: 0x813180,     // $261104 -- the external-speed handshake
  extBg: 0x813182,      // $26110A -- D0, consumed at $2612BE -> ($1C,A5)
  extTx: 0x813184,      // $261110 -- D1
  intervene: 0x810424,  // the page's own per-step intervention
};
const BGO_SPEED = 0x1c;             // ($1C,A5) on the background object
const TYPE_1C = 0x1c;
const FREE_CLOCK = 0x0105;          // $26C20C cmpi.w -- 261
const CRAWL_SPEED = 0x0008;         // $2616CA SPEED -- 0.125 px/f
const FAST_SPEED = 0x0020;          // $2616DE / $26B736 -- 0.500 px/f

const STEPS = 2400;

const bundle = await loadBundle(async (n) =>
  new Uint8Array(fs.readFileSync(path.join(ASSETS, n))));

/** The live background object's record (top-level object type 1). */
function bgObject(ram) {
  for (let i = 0; i < OBJ.slots; i++) {
    const s = OBJ.base + i * OBJ.stride;
    if ((ram.u16(s) & 0xff) === 1) return s;
  }
  return null;
}
/** True while any live enemy record carries type $1C. */
function type1cLive(ram) {
  for (let i = 0; i < ENEMY.slots; i++) {
    const r = ENEMY.table + i * ENEMY.stride;
    if (ram.u16(r) !== 0 && ram.u8(r + 0x0d - 1) === TYPE_1C) return true;
  }
  return false;
}

/** One window. `fire` decides whether the beam ever kills anything. */
function run(fire) {
  const game = new Game(bundle.seed, bundle.tables, {
    logicFrame: bundle.cap.frames[0].lf,
    videoFrame: bundle.cap.frames[0].vf,
    bgSeed: bundle.cap.part(0, 'bg'),
  });
  const word = portWordFromBits(fire ? [BIT.b1] : []);
  const r = {
    throwAt: null, throwMsg: null,
    crawlFrom: null, crawlTo: null,          // ($1C,A5) == $0008 window
    deathLf: null, pushLf: null, pushD0: null, pushD1: null,
    spawn1c: null, free1c: null,
    vramChanged: 0, vramCols: null,
    lastLf: null, lastClk: null,
  };
  let prevSpeed = null, prevFlag = null, live = false;
  // The map as it stood at the START of this step. The difference taken on the
  // ONE frame the type-$1C object first runs is the blit and nothing else: the
  // scroll's own column writer emits at most one column (9 longwords) per
  // frame and during the crawl it emits one per 256 frames.
  let vramBefore = new Uint16Array(game.vram.w.length);
  for (let i = 0; i < STEPS; i++) {
    vramBefore.set(game.vram.w);
    game.ram.setU8(A.intervene, 0xff);
    try {
      game.step(word);
    } catch (e) {
      r.throwAt = game.logicFrame;
      r.throwMsg = String(e.message).split('\n')[0].slice(0, 160);
      break;
    }
    const ram = game.ram, lf = game.logicFrame;
    r.lastLf = lf; r.lastClk = ram.u16(A.clock);

    // THE CRAWL, read off the background object's own speed word.
    const s = bgObject(ram);
    const speed = s === null ? null : ram.u16(s + BGO_SPEED);
    if (speed === CRAWL_SPEED && prevSpeed !== CRAWL_SPEED) r.crawlFrom = lf;
    if (prevSpeed === CRAWL_SPEED && speed !== CRAWL_SPEED) r.crawlTo = lf;
    prevSpeed = speed;

    // THE DEATH: `$26B72C clr.w $8130D8`, and the push one instruction later.
    const flag = ram.u16(A.midbossFlag);
    if (prevFlag === 1 && flag === 0) r.deathLf = lf;
    prevFlag = flag;
    if (ram.u16(A.extArm) !== 0 && r.pushLf === null) {
      r.pushLf = lf; r.pushD0 = ram.u16(A.extBg); r.pushD1 = ram.u16(A.extTx);
    }

    // THE OBJECT the death enqueues.
    const now = type1cLive(ram);
    if (now && !live) {
      r.spawn1c = lf;
      const cols = new Set();
      for (let k = 0; k < 1024; k++) {
        if (vramBefore[k * 2] !== game.vram.w[k * 2]
          || vramBefore[k * 2 + 1] !== game.vram.w[k * 2 + 1]) {
          r.vramChanged++; cols.add(k & 63);
        }
      }
      r.vramCols = [...cols].sort((a, b) => a - b);
    }
    if (!now && live) r.free1c = lf;
    live = now;
  }
  return r;
}

// ============================================================ THE MEASUREMENTS
// [M] on the final W57 tree, from the shipped bundle's own seed (boot lf2001).
//
// ============================ WAVE 90 RE-BASELINED THE `held` ROW, +8 FRAMES
//
// AND IT IS SAID HERE RATHER THAN QUIETLY EDITED, because "a number moved and
// I updated it" is the shape `86-impl` §0 blames for forty briefs going wrong.
//
// W90 ported `$289FC0`/`$289FDA`, the LASER's impact effect. This scenario
// HOLDS FIRE, so from W90 the effect spawns -- and its fill draws FOUR times
// from the shared `$803917` counter (`$242FFC`, `$242EC2`, `$28AB86`,
// `$242E24`). Every later draw therefore steps differently, the shots land
// differently, and the midboss dies EIGHT FRAMES LATER.
//
// **THE WHOLE CHAIN MOVED TOGETHER AND THAT IS WHY THIS IS A RE-BASELINE AND
// NOT A REGRESSION:** [M] death 3830 -> 3838, the scroll push 3830 -> 3838, the
// crawl 156 -> 164 frames, type $1C's spawn 3767 -> 3775 -- all +8 -- and its
// free 4271 -> 4277, which moves +6 because `$26C20C cmpi.w #$105,$8130CE`
// clocks it by DISTANCE and not by frames. A corrupted run does not move a
// causal chain coherently.
//
// **AND IT IS THE PORT MOVING TOWARD THE BOARD, NOT AWAY.** Those four
// `addq.b #1,$803917` sites execute on the cartridge every time the beam's
// impact effect spawns; until W90 the port skipped them. It is the same defect
// `src/spark.js`'s header records W53 fixing for `$289F54` ("every draw after a
// shot hit was one step out"), one producer further on.
//
// **WHAT THIS RE-BASELINE IS ALLOWED TO BE, and what it is not.** Lines 28-29
// of this file say it plainly: no MAME run in this repo has ever killed the
// midboss, so THERE IS NO BOARD COLUMN HERE and every number below is the
// PORT's own. Re-pinning a port-side regression baseline to the current tree is
// what it is for. It would NOT have been allowed if any of these were the
// board's, and none is.
const EXP = {
  control: {
    crawlFrom: 3675, crawlTo: 4251, crawlLen: 576,   // 9 ticks x 64 f, W56's
    deathLf: null, spawn1c: null,
  },
  held: {
    crawlFrom: 3675, crawlTo: 3839, crawlLen: 164,   // W90: 3831 / 156
    deathLf: 3838, pushLf: 3838, pushD0: FAST_SPEED, pushD1: FAST_SPEED,
    spawn1c: 3775, free1c: 4277, freeClk: FREE_CLOCK,  // W90: 3830/3767/4271
    vramChanged: 207, vramCols: [0, 1, 2, 3, 4, 5, 47, 48, 49, 50, 51, 52, 53,
      54, 55, 56, 57, 58, 59, 60, 61, 62, 63],
  },
};

let bad = 0;
const say = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${line}`); };

console.log(`W57 MIDBOSS-DEATH SCENARIO -- ${STEPS} steps from the shipped `
  + `bundle seed${brk ? `  [--break ${brk}]` : ''}`);

// ---------------------------------------------------------------- THE CONTROL
console.log('\nCONTROL -- fire SUPPRESSED. The midboss must LIVE and the crawl '
  + 'must be the ROM\'s full 9 ticks.');
const c = run(false);
say(c.throwAt === null, `no throw in ${STEPS} steps `
  + `(got ${c.throwAt === null ? 'none' : `lf${c.throwAt}: ${c.throwMsg}`})`);
say(c.crawlFrom === EXP.control.crawlFrom && c.crawlTo === EXP.control.crawlTo,
  `($1C,A5) == $0008 from lf${c.crawlFrom} to lf${c.crawlTo} `
  + `(expect ${EXP.control.crawlFrom}..${EXP.control.crawlTo})`);
say(c.crawlTo - c.crawlFrom === EXP.control.crawlLen,
  `the crawl is ${c.crawlTo - c.crawlFrom} frames of 0.125 px/f `
  + `(expect ${EXP.control.crawlLen} == 9 ticks x 64 f, W56's ROM arithmetic `
  + `AND its live measurement)`);
say(c.deathLf === null, `$8130D8 is never cleared -- the midboss survives `
  + `(got ${c.deathLf === null ? 'never' : `lf${c.deathLf}`})`);
say(c.spawn1c === null, `type $1C never spawns `
  + `(got ${c.spawn1c === null ? 'never' : `lf${c.spawn1c}`})`);

// ------------------------------------------------------------------- THE KILL
console.log(`\nTHE KILL -- fire ${brk === 'no-kill' ? 'SUPPRESSED [BROKEN]' : 'HELD'}. `
  + 'He must DIE, the object must spawn and leave, and the scroll must be restored.');
const h = run(brk !== 'no-kill');
const E = EXP.held;
say(h.throwAt === null, `no throw in ${STEPS} steps -- THE DEFECT W57 FIXES `
  + `(got ${h.throwAt === null ? 'none' : `lf${h.throwAt}: ${h.throwMsg}`})`);
say(h.deathLf === E.deathLf, `$26B72C clr.w $8130D8 -- THE MIDBOSS DIES at `
  + `lf${h.deathLf} (expect ${E.deathLf})`);
say(h.pushLf === E.pushLf && h.pushD0 === E.pushD0 && h.pushD1 === E.pushD1,
  `$26B73A jsr $261100 at lf${h.pushLf} pushes D0=$${(h.pushD0 ?? 0).toString(16)} `
  + `D1=$${(h.pushD1 ?? 0).toString(16)} (expect lf${E.pushLf} $${E.pushD0.toString(16)} `
  + `$${E.pushD1.toString(16)}) -- THE SCROLL SPEED-RESTORE, UNREACHABLE BEFORE W57`);
say(h.crawlFrom === E.crawlFrom && h.crawlTo === E.crawlTo,
  `($1C,A5) $0008 -> $0020 at lf${h.crawlTo}: ${h.crawlTo - h.crawlFrom} frames `
  + `of crawl (expect ${E.crawlLen}), against the control's `
  + `${EXP.control.crawlLen} -- 0.125 px/f -> 0.500 px/f`);
say(h.spawn1c === E.spawn1c, `type $1C ($26C1C2/$26C1CA) is LIVE from lf${h.spawn1c} `
  + `(expect ${E.spawn1c} -- the frame the port used to throw on)`);
say(h.free1c === E.free1c, `and frees itself at lf${h.free1c} `
  + `(expect ${E.free1c}) -- $26C20C cmpi.w #$105,$8130CE`);
say(h.vramChanged === E.vramChanged,
  `$26C20C painted ${h.vramChanged} map longwords (expect ${E.vramChanged} == `
  + `23 columns x 9 rows == 23 x 36 B of $227AF8)`);
say(JSON.stringify(h.vramCols) === JSON.stringify(E.vramCols),
  `into ring columns [${(h.vramCols ?? []).join(',')}] -- the $26C25A `
  + `andi.w #$FF WRAP (expect 47..63 then 0..5)`);

console.log(`\n${bad ? 'FAIL' : 'PASS'}: W57 midboss-death scenario -- `
  + `${bad} failed assertion(s). Control ran to lf${c.lastLf}/clk${c.lastClk}, `
  + `the kill run to lf${h.lastLf}/clk${h.lastClk}.`);
process.exit(bad ? 1 : 0);
