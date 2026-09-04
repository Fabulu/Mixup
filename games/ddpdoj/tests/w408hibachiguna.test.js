// ===============================================================================================
// W408 -- A1 GUN `$A` `$2A8B7C`, THE THIRD MEMBER OF HIBACHI'S PHASE-B GUN LOOP.
// ===============================================================================================
//
// UNIT. The gun the frame-4016 PORT stop stood on, and the last unported member of
// `$F -> gun 9 -> $11 -> gun $B -> $10 -> gun $A -> $F`.
//
// **WHERE THE BRIEF IS WRONG, from the bytes rather than argued:**
//
//   1. "the remaining `$3C` is gun `$B`'s template and self-pointer blob." It is **`$2A`**.
//      `$11E - $F4 = $2A`, and $2A is exactly gun `$B`'s `$A` of template plus `$20` of
//      self-pointers. `$3C` is gun `$B`'s OWN trailing figure ($236 - $1FA), copied one gun
//      too far by W407's handoff and by `HIBACHI_A1_COUNTED`. SECTION 1.
//   2. "Porting it should close that loop." It closes the loop **in the ROM's arrows and never
//      in play.** The three arrows all run, but phase B's death timer is re-armed to `$04xx`
//      by A4 `$11` and a lap needs `$B0` frames more than `$04FF`, so `$2A7088` reaches zero
//      **inside gun `$A`'s run, every time**, and `$2A6AA2 moveq #$F` -- the arrow that shuts
//      the cycle -- is never executed. The real path stops at **A4 script 5 `$2A6418`**, one
//      link PAST the loop, not inside it. SECTION 2 and SECTION 3.
//   3. Not in the brief: gun `$A` **does not aim, does not select a player and does not toggle
//      `($3,A5)`**. It is the only gun of the seven this file runs that does none of the
//      three. What it does with the players is MEASURE them: `$2A8BC6 jsr $242438` and a
//      `$2000` compare drive the global `$8130DC`, on every frame and not only firing ones.
//      SECTION 5.
//   4. Not in the brief: the bullets are **kind 28**, the tracker -- and kind 28's mover
//      `$2832B0 tst.w $8130DC` reads the very global this gun writes. SECTION 4.
//   5. Not in the brief: `$2A8B10..$2A8B4B` is `$3C` bytes of data that **nothing in the 6 MB
//      image points at**, sitting between gun 9's `4E75` and gun `$A`'s template. SECTION 1.
//
// SECTION 1  the extent and the orphan block, each bounded three ways, no bound an absence
// SECTION 2  the loop's three arrows, and the frame budget that stops it closing in play
// SECTION 3  **THE DELIVERABLE**: how far the real path runs now, and which kind of stop
// SECTION 4  gun $A driven, with the bullet RECORDS read back
// SECTION 5  $8130DC, $242438 and $242486 -- the proximity global, driven both ways
// SECTION 6  the ablation section -- the inputs that separate constants that agree by default
// SECTION 7  the window set: 596, and the three bounds on the one new window
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { resetSpriteQueueCounters } from '../src/displaylist.js';
import { BGRAM, BgVram, backgroundFrame, backgroundInit } from '../src/background.js';
import { installScripts, SCHED, scriptAddresses } from '../src/scheduler.js';
import { handler2A4606 } from '../src/boss.js';
import { HIBACHI_A4, HIBACHI_END_COUNTED } from '../src/hibachiend.js';
import {
  HIBACHI_A1, HIBACHI_A1_SCRIPTS, HIBACHI_GUN_A4_SCRIPTS, HIBACHI_A1_COUNTED,
  gunAInit2A8B7C, gunAStep2A8BC0,
} from '../src/hibachiguns.js';
import { REC as BREC } from '../src/bullets.js';
import {
  ROM_WINDOW_COUNT,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');

const NEED = [IMAGE, TABLES];
const MISSING = NEED.filter((p) => !existsSync(p));
const SKIP = MISSING.length === 0 ? false
  : `${MISSING.map((p) => path.basename(p)).join(', ')} absent -- run `
    + 'tools/export-tables.py. THIS IS A SKIP, NOT A PASS.';

const IMG = MISSING.length === 0 ? readFileSync(IMAGE) : null;
const tables = MISSING.length === 0 ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;
const w = (a) => IMG.readUInt16BE(a);
const l = (a) => IMG.readUInt32BE(a);
const disp16 = (a) => (w(a) >= 0x8000 ? w(a) - 0x10000 : w(a));
const u8 = (v) => v & 0xff;

const GUNA_CODE_END = 0x2a8c6e;      // `4E75` AT that address
const GUNA_BLOB = 0x2a8b5c;          // the eight $002A8B7C self-pointers
const GUNA_SITE = 0x2a8c1a;          // its ONE `jsr $2817C2`
const A4_5_INIT = 0x2a6418;          // where the real path stops now

// ===============================================================================================
// SECTION 1 -- THE EXTENT, AND THE ORPHAN BLOCK IN FRONT OF IT.
// ===============================================================================================

test('W408 SECTION 1: gun $A is $11E bytes of which $F4 is CODE, bounded THREE ways -- and the '
  + 'remainder is $2A, not the $3C the handoff said', { skip: SKIP }, () => {
  assert.equal(l(HIBACHI_A1.main + 0x0a * 8), HIBACHI_A1.gunAInit, '$2A72C8[$A].init');
  assert.equal(l(HIBACHI_A1.main + 0x0a * 8 + 4), HIBACHI_A1.gunAStep, '  ...and .step');
  // ---- the INIT/STEP split, which the A1 convention pins: `4E75` AT step - 2.
  assert.equal(w(HIBACHI_A1.gunAStep - 2), 0x4e75,
    '$2A8BBE `4E75` -- gun $A\'s init does NOT fall through into its step');
  assert.equal(HIBACHI_A1.gunAStep - HIBACHI_A1.gunAInit, 0x44, '  ...so the init is $44 bytes');

  // (1) `4E75` sits AT $2A8C6E -- TRAP 5, the LAST address and not one past it -- and the
  //     retire path's own `bcc.w` lands exactly there.
  assert.equal(w(GUNA_CODE_END), 0x4e75, '(1) $2A8C6E `4E75`, gun $A\'s last instruction');
  assert.equal(w(0x2a8c32), 0x6400, '  ...$2A8C32 `6400` bcc.w');
  assert.equal(0x2a8c34 + disp16(0x2a8c34), GUNA_CODE_END, '  ...lands on that rts');
  assert.equal(w(0x2a8c66), 0x700a, '  ...and $2A8C66 `700A` moveq #$A stands before it');
  assert.equal(l(0x2a8c6a), 0x00259b08, '  ...with $2A8C68 jsr $259B08, the A1 STOP');

  // (2) what FOLLOWS the code is data a `lea` NAMES, one gun further on: gun $B's own init
  //     names $2A8C70, and the eight self-pointers behind it run up to gun $B's code.
  assert.equal(w(HIBACHI_A1.gunBInit), 0x41fa, '(2) $2A8C9A `41FA` lea -- GUN $B\'s init');
  assert.equal(0x2a8c9c + disp16(0x2a8c9c), HIBACHI_A1.gunBTemplate, '  ...and it names $2A8C70');
  assert.equal(w(0x2a8ca2), 0x7004, '  ...with `moveq #$4` -- FIVE words, $A bytes');
  for (let i = 0; i < 8; i++) {
    assert.equal(l(0x2a8c7a + i * 4), HIBACHI_A1.gunBInit,
      `  ...$${(0x2a8c7a + i * 4).toString(16).toUpperCase()} is $002A8C9A, gun $B's own`);
  }

  // (3) and the table's own next entry closes the extent.
  assert.equal(l(HIBACHI_A1.main + 0x0b * 8), HIBACHI_A1.gunBInit, '(3) $2A72C8[$B].init');
  assert.equal(HIBACHI_A1.gunBInit - HIBACHI_A1.gunAInit, 0x11e, '  ...so gun $A is $11E bytes');
  assert.equal(GUNA_CODE_END + 2 - HIBACHI_A1.gunAInit, 0xf4, '  ...of which $F4 is CODE');
  // **AND THE TWO NUMBERS DIFFER BY $2A, NOT BY $3C.**
  assert.equal(0x11e - 0xf4, 0x2a, 'the remainder is $2A');
  assert.equal(0x2a, 0x0a + 0x20, '  ...gun $B\'s $A of template plus $20 of self-pointers');
  assert.equal(0x236 - 0x1fa, 0x3c,
    '  ...and $3C is gun $B\'s OWN trailing figure, which is where W407\'s $3C came from');
  assert.notEqual(0x11e - 0xf4, 0x3c, '  ...so the handoff\'s $3C for gun $A is simply wrong');
});

test('W408 SECTION 1: $2A8B10..$2A8B4B is $3C bytes NOTHING in the image points at',
  { skip: SKIP }, () => {
    // The layout rule is `[gun N code][gun N+1 template][8 longwords][gun N+1 code]`. Between
    // gun 9 and gun $A there is a FOURTH thing, and it is named here so it is not rediscovered.
    assert.equal(w(HIBACHI_A1.gun9Code), 0x4e75, '$2A8B0E `4E75` -- gun 9\'s last instruction');
    assert.equal(HIBACHI_A1.gun9Code + 2, HIBACHI_A1.gunAOrphan, '  ...and the block starts next');
    assert.equal(HIBACHI_A1.gunAOrphan + HIBACHI_A1.gunAOrphanLen, HIBACHI_A1.gunATemplate,
      '  ...and ends exactly where gun $A\'s template begins');
    // ---- WHAT IS IN IT: nine {bias.w, kind.w} longwords and six {dY.w, dX.w} muzzle longwords,
    // the two shapes gun 5's ($8,A4) pairs and gun 6's $2A84CC table have.
    assert.deepEqual([...Array(9).keys()].map((i) => l(0x2a8b10 + i * 4)),
      [0x00230005, 0x00150003, 0x001c0004, 0x00230005, 0x002a0006, 0x00310007, 0x002a0006,
        0x00230005, 0x001c0004], 'nine {bias, kind} longwords');
    assert.deepEqual([...Array(6).keys()].map((i) => l(0x2a8b34 + i * 4)),
      [0x0080f640, 0xfb40f640, 0xf640f640, 0xff000940, 0xfa800940, 0xf5c00940],
      '  ...then six {dY, dX} muzzle longwords');
    assert.equal(9 * 4 + 6 * 4, HIBACHI_A1.gunAOrphanLen, '  ...and 15 longwords IS the $3C');
    // ---- AND WHO READS IT: nobody. Stated as the POSITIVE enumeration of every `lea (d16,PC)`
    // in gun 9 and gun $A and of every longword in the whole image, not as "we did not see one".
    for (const [from, to, names] of [[HIBACHI_A1.gun9Init, HIBACHI_A1.gun9Code + 2, 0x2a898c],
      [HIBACHI_A1.gunAInit, GUNA_CODE_END + 2, HIBACHI_A1.gunATemplate]]) {
      const leas = [];
      for (let a = from; a < to; a += 2) {
        if ((w(a) & 0xf1ff) === 0x41fa) leas.push(a + 2 + disp16(a + 2));
      }
      assert.deepEqual(leas, [names],
        `$${from.toString(16).toUpperCase()} has exactly ONE lea (d16,PC), naming `
        + `$${names.toString(16).toUpperCase()}`);
    }
    let inside = 0;
    for (let a = 0; a <= IMG.length - 4; a += 2) {
      const v = l(a);
      if (v >= HIBACHI_A1.gunAOrphan
        && v < HIBACHI_A1.gunAOrphan + HIBACHI_A1.gunAOrphanLen) inside += 1;
    }
    assert.equal(inside, 0,
      'and no longword anywhere in the 6 MB image holds an address inside the block');
  });

// ===============================================================================================
// SECTION 2 -- THE LOOP'S ARROWS, AND THE BUDGET THAT STOPS IT CLOSING IN PLAY.
// ===============================================================================================

/** Every `moveq #n,D0 / jsr <target>` in the boss ROM, as {address: n}. */
function callSites(target) {
  const out = new Map();
  for (let a = 0x2a4000; a < 0x2ab000; a += 2) {
    if ((w(a) & 0xff00) !== 0x7000) continue;
    if (w(a + 2) !== 0x4eb9 || l(a + 4) !== target) continue;
    out.set(a + 2, w(a) & 0xff);
  }
  return out;
}

test('W408 SECTION 2: all three links are ported and every arrow is registered code',
  { skip: SKIP }, () => {
    const a1 = callSites(0x00259a18);
    const wait = callSites(0x00259a4a);
    const a4 = callSites(0x0025980c);
    const reg = new Set(scriptAddresses());
    for (const [script, gun, next, startAt, waitAt, handAt] of [
      [0x0f, 0x09, 0x11, 0x2a6a4c, 0x2a6a54, 0x2a6a5e],
      [0x11, 0x0b, 0x10, 0x2a6ad2, 0x2a6ae0, 0x2a6aea],
      [0x10, 0x0a, 0x0f, 0x2a6a92, 0x2a6a9a, 0x2a6aa4],
    ]) {
      assert.equal(a1.get(startAt), gun,
        `A4 $${script.toString(16)} starts A1 gun $${gun.toString(16)}`);
      assert.equal(wait.get(waitAt), gun, '  ...and waits on the same id');
      assert.equal(a4.get(handAt), next, `  ...then hands to A4 $${next.toString(16)}`);
      assert.ok(reg.has(l(HIBACHI_A4.table + script * 8)), '  ...and the script is registered');
      assert.ok(reg.has(l(HIBACHI_A1.main + gun * 8)), '  ...and so is the gun\'s init');
      assert.ok(reg.has(l(HIBACHI_A1.main + gun * 8 + 4)), '  ...and its step');
    }
    // ---- gun $A specifically, which is what this wave adds.
    assert.ok(reg.has(HIBACHI_A1.gunAInit) && reg.has(HIBACHI_A1.gunAStep),
      '$2A8B7C and $2A8BC0 are BOTH registered now');
    assert.equal(HIBACHI_A1_COUNTED[0x0a], undefined, '  ...and A1 $A is no longer counted');
    assert.deepEqual([...HIBACHI_A1_SCRIPTS],
      [0, 1, 2, 3, 5, 6, 7, 8, 9, 0x0a, 0x0b, 0x0c, 0x0d],
      '  ...thirteen A1 ids are ported now');
    assert.equal(Object.keys(HIBACHI_A1_COUNTED).length + HIBACHI_A1_SCRIPTS.length,
      HIBACHI_A1.pairs, 'ported + counted = fourteen, the whole table');
  });

test('W408 SECTION 2: THE CLOSING ARROW CANNOT BE REACHED -- a lap costs $B0 frames more than '
  + 'the timer can ever hold', { skip: SKIP }, () => {
  // Phase B's death timer is the WORD ($1A,A5). Only two instructions in the boss ROM write its
  // high byte, and both are in this loop; `$2A7088 subq.w #$1` is the only thing that lowers it.
  const writes = [];
  for (let a = 0x2a6900; a < 0x2a6b00; a += 2) {
    if (w(a) === 0x1d7c && w(a + 4) === 0x001a) writes.push([a, w(a + 2)]);
  }
  assert.deepEqual(writes,
    [[0x2a6984, 0x0c], [0x2a69a6, 0x04], [0x2a6a6c, 0x0c], [0x2a6ad8, 0x04]],
    'exactly four `move.b #imm,($1A,A5)` stand in $2A6900..$2A6AFF, the gun-loop scripts: two '
    + 'of them A4 $D\'s and two of them phase B\'s');
  assert.equal(w(0x2a7088), 0x536d, '$2A7088 `536D` subq.w #$1,(d16,A5)');
  assert.equal(w(0x2a708a), 0x001a, '  ...($1A,A5)');

  // ---- THE ARITHMETIC. A4 $11 writes the HIGH byte $04, so from that frame the timer is at
  // most $04FF. What has to happen before A4 $10 can execute `$2A6AA2 moveq #$F`:
  const gunBFrames = 507;         // measured in W407 and re-measured in SECTION 3 below
  const preRoll = w(0x2a6a78);    // A4 $10's own `move.w #$60,($2,A4)`
  assert.equal(preRoll, 0x60, 'A4 $10 pre-rolls $60 frames');
  // gun $A's SHORTEST possible run: $77 + 1 volleys, the first $10 + 1 step frames in and the
  // rest ($6,A4) + 1 = 7 apart. ($4,A4) can only GROW -- $2A8C48 `addi.b #$A` is the one
  // instruction in the image that writes ($1F1,A6), and it only ever adds.
  assert.equal(IMG[HIBACHI_A1.gunATemplate + 2], 0x77, 'gun $A\'s template ($4,A4) is $77');
  assert.equal(IMG[HIBACHI_A1.gunATemplate + 4], 0x06, '  ...and ($6,A4) is $06');
  assert.equal(IMG[HIBACHI_A1.gunATemplate], 0x10, '  ...and ($2,A4) is $10');
  const gunAFrames = (0x10 + 1) + 0x77 * (0x06 + 1);
  assert.equal(gunAFrames, 0x352, 'so gun $A takes at least $352 = 850 frames');
  const lap = gunBFrames + 1 + preRoll + 1 + gunAFrames;
  assert.equal(lap, 1455, 'and the whole stretch from A4 $11\'s write to the arrow is 1,455');
  assert.ok(lap > 0x04ff, `  ...where $04FF = ${0x04ff} is the most the timer can hold`);
  assert.equal(lap - 0x04ff, 0xb0, '  ...a shortfall of $B0 = 176 frames');
  // ...and the arrow itself, which really is what would close the loop.
  assert.equal(w(0x2a6aa2), 0x700f, '$2A6AA2 `700F` moveq #$F -- the arrow that shuts the cycle');
  assert.equal(l(0x2a6aa6), 0x0025980c, '  ...$2A6AA4 jsr $25980C');
});

// ===============================================================================================
// SECTION 3 -- THE DELIVERABLE. How far the real path runs, and which kind of stop.
// ===============================================================================================

const REC = 0x810c00;
const SUB = 0x814800;
const A5BG = 0x80e240;

/** W404's bench, unchanged: the A4 table AND the A1 table, exactly as `$2A4306`/`$2A4318`
 *  install them. Without the A1 install `$812BD4` is zero and `$259782 tst.l / beq` skips the
 *  whole A1 walk, so every gun wait in the chain would hang for ever. */
function realPath() {
  const ROM = new RomWindows(tables.rom);
  const ram = new Ram();
  const vram = new BgVram();
  const log = new UnportedLog();
  const ctx = { unportedLog: log, unported: log, soundPost() {} };
  ram.setU16(BGRAM.stageX4, 16);
  ram.setU16(A5BG + 0x06, 0x0344);
  backgroundInit(ram, ROM, vram, ctx, A5BG);
  installScripts(ram, ROM, { a4: HIBACHI_A4.table, a1: HIBACHI_A1.main });
  ram.setU32(REC + 0x06, SUB);
  ram.setU32(REC + 0x16, 0x00000010);
  ram.setU32(SUB + 0x02, 0x38001c00);
  ram.setU8(SUB + 0x00, 0x44);
  ram.setU16(SUB + 0x18, 0x0000);
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(HIBACHI_A4.forkLoopWord, 1);
  ram.setU16(HIBACHI_A4.forkFlag, 0);
  return { ROM, ram, vram, ctx, log };
}

function runReal(b, frames) {
  const out = { stopped: null, suspend: null, shots: 0, bySite: new Map(),
    a1: [], a4: [], timer: [], prox: [] };
  b.ctx.bulletSpawn = (site) => {
    out.shots += 1;
    out.bySite.set(site, (out.bySite.get(site) ?? 0) + 1);
  };
  let prev = '';
  let prev4 = '';
  for (let f = 1; f <= frames; f++) {
    if (!out.stopped) {
      try { handler2A4606(b.ram, b.ROM, REC, b.ctx); } catch (e) {
        out.stopped = { frame: f, at: e.romAddress, name: e.name };
      }
    }
    const live = [...Array(SCHED.a1Slots).keys()]
      .map((i) => b.ram.u16(SCHED.a1Base + i * SCHED.a1Stride))
      .filter((v) => v !== 0).map((v) => (v & 0xff).toString(16)).join(',');
    if (live !== prev) { out.a1.push([f, live]); prev = live; }
    const live4 = [...Array(SCHED.a4Slots).keys()]
      .map((i) => b.ram.u16(SCHED.a4Base + i * SCHED.a4Stride))
      .filter((v) => v !== 0).map((v) => (v & 0xff).toString(16)).join(',');
    if (live4 !== prev4) { out.a4.push([f, live4]); prev4 = live4; }
    if (!out.stopped) {
      out.timer.push(b.ram.u16(REC + 0x1a));
      out.prox.push(b.ram.u16(HIBACHI_A1.proximity));
    }
    if (out.suspend === null && b.ram.u16(SCHED.suspend) !== 0) out.suspend = f;
    resetSpriteQueueCounters(b.ram);
    backgroundFrame(b.ram, b.ROM, b.vram, b.ctx, A5BG);
  }
  return out;
}

test('W408 SECTION 3: the real path reaches frame 4447 and stops at A4 SCRIPT 5, past the loop',
  { skip: SKIP }, () => {
    const r = runReal(realPath(), 9000);

    // ---- WHERE IT RAN. Gun $A starts on 4016 -- W407's stop -- and never finishes.
    assert.deepEqual(r.a1.slice(-4),
      [[3412, 'b'], [3919, ''], [4016, 'a'], [4447, '']],
      'gun $B 3412..3918, then gun $A 4016..4446, whose slot is CLEARED on 4447 by the '
      + 'phase-B wipe and not by its own $259B08');
    // W409 CORRECTION: one more entry -- A4 script 5 is ported and frees its own slot.
    assert.deepEqual(r.a4.slice(-5, -1).map(([, v]) => v), ['f', '11', '10', '5'],
      'and the A4 history ends $F -> $11 -> $10 -> **5**, not $F -> $11 -> $10 -> $F');

    // ---- **THE CLOSING ARROW NEVER RUNS.** A4 $10 keeps its slot until the wipe takes it.
    assert.equal(r.a4[r.a4.length - 3][0], 3920, 'A4 $10 is dispatched on 3920');
    assert.equal(4016 - 3920, 0x60, '  ...and asks for gun $A $60 frames later');
    assert.equal(r.a4[r.a4.length - 2][0], 4447,
      '  ...and the NEXT change to the A4 slots is the wipe, so $10 never handed to $F');

    // ---- WHY: phase B's timer, re-armed to $04xx on 3412, reaches zero on 4447.
    // W409: the run no longer stops on 4447, so `r.timer` keeps recording past phase B's
    // death and picks up the reloads that follow it. The window this claim is about is the
    // stretch BEFORE the death, so it is bounded explicitly rather than by where a throw
    // happened to end the sampling -- which is exactly the kind of number the briefs warn
    // about ("never trust a number produced by a run that ENDED at that point").
    const jumps = [];
    for (let i = 3000; i < 4447; i++) {
      if (r.timer[i] !== r.timer[i - 1] - 1) jumps.push([i + 1, r.timer[i - 1], r.timer[i]]);
    }
    assert.deepEqual(jumps, [[3317, 0x606b, 0x0c6a], [3412, 0x0c0c, 0x040b]],
      'the only two discontinuities are A4 $F\'s $C and A4 $11\'s $4 over the HIGH byte');
    assert.equal(3412 + 0x040b, 4447, '  ...and $040B frames after 3412 is exactly 4447');
    assert.equal(r.timer[4445], 1,
      '  ...and the last frame phase B counted it, the word was 1');
    assert.equal(r.timer[4446], 0, '  ...so on 4447 it reaches ZERO and the death fires');

    // ---- **WHICH KIND OF STOP.** A PORT stop, on an A4 script, and none of the three tests
    // is an absence.
    // W409 CORRECTION: A4 script 5 is ported, so 4447 is where it STARTS and not where the
    // run stops. Same three tests, applied to the hand-over instead of to a throw.
    assert.equal(r.stopped, null, 'nothing throws anywhere in 9,000 frames');
    assert.equal(r.suspend, 4889,
      '  ...the stage suspends on 4889, 442 frames after A4 script 5 took the slot on 4447');
    //   (a) a live table entry the cartridge dispatches through, with ordinary code at it;
    assert.equal(l(HIBACHI_A4.table + 5 * 8), A4_5_INIT, '(a) $2A5886[5].init IS $2A6418');
    assert.equal(w(A4_5_INIT), 0x303c, '  ...and `303C move.w #imm,D0` stands there, not an rts');
    assert.equal(w(A4_5_INIT + 2), 0x000e, '  ...#$E');
    assert.equal(w(A4_5_INIT + 4), 0x41f9, '  ...$2A641C `41F9` lea $246BF8,A0');
    //   (b) what routed us there is ported code -- phase B's own death tail;
    assert.equal(w(0x2a728a), 0x7005, '(b) $2A728A `7005` moveq #$5,D0');
    assert.equal(w(0x2a728c), 0x4ef9, '  ...$2A728C `4EF9` JMP, a tail call');
    assert.equal(l(0x2a728e), 0x0025980c, '  ...to $25980C');
    //   (c) and it is a whole unit further on, still counted at its measured extent.
    assert.equal(HIBACHI_END_COUNTED[0x05], undefined, '(c) A4 5 is no longer counted');
    assert.ok(new Set(scriptAddresses()).has(A4_5_INIT), '  ...W409 registers it');

    // ---- **WHAT "COMPLETING" WOULD MEAN, in the cartridge's own terms.** Closing the loop did
    // NOT move the ending nearer: the ending is over when `$2595E8` suspends the stage, only
    // A4 $14 reaches it, and only script 1's FIRST-LOOP arm starts A4 $14. This bench is the
    // other arm, so its route out is phase B's death into A4 5 -- which is exactly what
    // happened, 431 frames after gun $A began.
    assert.equal(w(0x2a5cb4), 0x7014, '$2A5CB4 moveq #$14 -- the only start of the suspend link');
    assert.equal(w(0x2a6b88), 0x4eb9, '$2A6B88 `4EB9` jsr');
    assert.equal(l(0x2a6b8a), 0x002595e8, '  ...$2595E8, the global SUSPEND, in A4 $14');
  });

test('W408 SECTION 3: 8,825 spawn calls, and gun $A\'s 720 are 60 volleys of TWELVE from ONE '
  + 'jsr site', { skip: SKIP }, () => {
  const r = runReal(realPath(), 9000);
  assert.equal(r.shots, 8825, 'the run fires 8,825 where W407\'s fired 8,105');
  assert.equal(8825 - 8105, 720, '  ...and the 720 this wave added are all gun $A\'s');
  assert.equal(r.bySite.get(GUNA_SITE), 720, '  ...all from $2A8C1A, its only spawn site');
  assert.equal(720 / 12, 60, '  ...60 volleys of twelve');
  // ...and 60 is a TRUNCATED run, not a finished one: gun $A wants $78 volleys and gets 60.
  assert.equal((0x77 + 1), 120, 'gun $A\'s template asks for 120 volleys');
  // the init runs ALONE on 4016 (the A1 convention), the first volley lands $10 + 1 step
  // frames later on 4033, and the rest are 7 apart up to 4446, the last frame the gun ran.
  assert.equal(Math.floor((4446 - (4016 + 0x11)) / (0x06 + 1)) + 1, 60,
    '  ...60 is what 4016..4446 holds at 7 frames a volley -- the wipe cut the run short');
  // ...and the site really is a `jsr $2817C2`, read out of the image.
  assert.equal(w(GUNA_SITE), 0x4eb9, '$2A8C1A `4EB9` jsr');
  assert.equal(l(GUNA_SITE + 2), HIBACHI_A1.spawn, '  ...$2817C2');
  const sites = [];
  for (let a = HIBACHI_A1.gunAInit; a < GUNA_CODE_END; a += 2) {
    if (w(a) === 0x4eb9 && l(a + 2) === HIBACHI_A1.spawn) sites.push(a);
  }
  assert.deepEqual(sites, [GUNA_SITE],
    'exactly ONE spawn site in gun $A\'s $F4 bytes, found by scanning the image');

  // ---- AND $8130DC IS ZERO ON EVERY FRAME OF THIS RUN, because the bench's P1 sits at the
  // origin, $3800 away from the boss. That is a MEASURED value, not an untouched one: gun $A
  // rewrites the word on all 431 of its frames. SECTION 5 drives the other arm.
  assert.deepEqual([...new Set(r.prox)], [0],
    '$8130DC is 0 for the whole run -- the nearer player is $3800 out, past the $2000 gate');
});

// ===============================================================================================
// SECTION 4 -- GUN $A DRIVEN, WITH THE RECORDS READ BACK.
// ===============================================================================================

const A4SLOT = SCHED.a1Base;

function gunBench({ p1 = 0x8000, p2 = 0x0000, py = 0x2000, px = 0x2400,
  p2y = 0x1000, p2x = 0x0800, sel = 0 } = {}) {
  const ROM = new RomWindows(tables.rom);
  const ram = new Ram();
  const shots = [];
  const ctx = { bulletSpawn: (site, res) => shots.push([site, res]) };
  ram.setU16(HIBACHI_A1.selP1, p1);
  ram.setU16(HIBACHI_A1.selP1 + 2, py);
  ram.setU16(HIBACHI_A1.selP1 + 4, px);
  ram.setU16(HIBACHI_A1.selP2, p2);
  ram.setU16(HIBACHI_A1.selP2 + 2, p2y);
  ram.setU16(HIBACHI_A1.selP2 + 4, p2x);
  ram.setU32(SUB + 0x02, 0x38001c00);
  ram.setU8(REC + 0x03, sel);
  ram.setU16(A4SLOT, 0x800a);
  return { ROM, ram, ctx, shots };
}

/** The bullet RECORD, not the call. */
const rec = (ram, entry) => {
  const a = entry[1][0].addr;
  return {
    site: entry[0],
    kind: ram.u16(a + BREC.typeWord) & 0x3f,
    dir: ram.u8(a + BREC.dir),
    speed: ram.u8(a + BREC.speed),
    posA: ram.u16(a + BREC.posA),
    posB: ram.u16(a + BREC.posB),
    p2a: ram.u8(a + BREC.param2a),      // $281930 move.b ($3,A5),($1A,A0)
    p2c: ram.u32(a + BREC.param2c),     //         move.l D4,($1C,A0)
  };
};
const baseSpeed = (kind) => w(l(0x281956 + 4 * kind) + 0x0e);
/** Run one whole volley: $10 + 1 step frames from a fresh init. */
const volley1 = (b) => {
  for (let i = 0; i < 0x11; i++) gunAStep2A8BC0(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
};

test('W408 SECTION 4: the init is EIGHT template words, three A6 ramps and a LIVE RNG draw',
  { skip: SKIP }, () => {
    const b = gunBench();
    gunAInit2A8B7C(b.ram, b.ROM, A4SLOT, SUB);
    // TRAP 3, twice: one word literal over two byte fields.
    assert.equal(b.ram.u16(A4SLOT + 0x02), 0x1080, '($2,A4)/($3,A4) are ONE word $1080');
    assert.equal(b.ram.u16(A4SLOT + 0x04), 0x7777, '($4,A4)/($5,A4) are ONE word $7777');
    assert.equal(b.ram.u16(A4SLOT + 0x06), 0x0600, '($6,A4)/($7,A4) are ONE word $0600');
    assert.equal(b.ram.u16(A4SLOT + 0x08), 0x0005, '($8,A4) is the speed bias $5');
    assert.equal(b.ram.u16(A4SLOT + 0x0a), 0x001c, '($A,A4) is the bullet KIND, $1C = 28');
    assert.equal(b.ram.u32(A4SLOT + 0x0c), 0x00030016, '($C,A4) is the D4 longword $00030016');
    // ...and the two bytes the init writes itself.
    assert.equal(b.ram.u8(A4SLOT + 0x11), 0x10,
      '($11,A4) is the $242EC2 draw, STORED -- guns 5, 8 and 9 only sign-test the same call');
    assert.equal(b.ram.u8(A4SLOT + 0x10), 0xfe,
      '  ...and ($10,A4) is the template\'s $02 NEGATED, because ($1F0,A6) was zero');
    // the draw really is the live one: change the RNG state and the heading moves with it.
    const c = gunBench();
    c.ram.setU16(0x803916, 0x0040);
    gunAInit2A8B7C(c.ram, c.ROM, A4SLOT, SUB);
    assert.notEqual(c.ram.u8(A4SLOT + 0x11), b.ram.u8(A4SLOT + 0x11),
      '  ...a different $803916 gives a different starting heading');
    assert.equal(w(0x2a8ba8), 0x4eb9, '$2A8BA8 `4EB9` jsr');
    assert.equal(l(0x2a8baa), 0x00242ec2, '  ...$242EC2');
    assert.equal(w(0x2a8bae), 0x1940, '$2A8BAE `1940` move.b D0,(d16,A4) -- a STORE');
    assert.equal(w(0x2a8bb0), 0x0011, '  ...($11,A4), where gun 9\'s $2A89D6 is a `bpl.w`');

    // ---- THE THREE A6 RAMPS, each proved by a value that only that offset can produce.
    const d = gunBench();
    d.ram.setU8(SUB + 0x1f1, 0x0a);
    d.ram.setU16(SUB + 0x1f2, 0x0003);
    d.ram.setU16(SUB + 0x1f4, 0x0005);
    gunAInit2A8B7C(d.ram, d.ROM, A4SLOT, SUB);
    assert.equal(d.ram.u8(A4SLOT + 0x04), 0x81, '($1F1,A6) is added to ($4,A4)...');
    assert.equal(d.ram.u8(A4SLOT + 0x05), 0x81, '  ...and to ($5,A4), the SAME byte');
    assert.equal(d.ram.u16(A4SLOT + 0x08), 0x0008, '($1F2,A6) is a WORD add on the bias');
    assert.equal(d.ram.u32(A4SLOT + 0x0c), 0x00080016,
      '  ...and ($1F4,A6) a WORD add on D4\'s HIGH half only');
  });

test('W408 SECTION 4: twelve shots a volley, $15 apart, kind 28, and the muzzle comes out of '
  + '$26BFFC', { skip: SKIP }, () => {
  const b = gunBench();
  gunAInit2A8B7C(b.ram, b.ROM, A4SLOT, SUB);
  const start = b.ram.u8(A4SLOT + 0x11);
  volley1(b);
  const all = b.shots.map((e) => rec(b.ram, e));
  assert.equal(all.length, 12, 'TWELVE spawn calls -- `moveq #$B` and a dbra (TRAP 2)');
  assert.ok(b.shots.every((e) => e[1].length === 1), '  ...kind 28 is a single-bullet kind');
  for (let k = 0; k < 12; k++) {
    assert.equal(all[k].site, GUNA_SITE, `shot ${k} comes from the one site`);
    assert.equal(all[k].kind, 28, `  ...shot ${k} is kind 28`);
    assert.equal(all[k].dir, u8(start + 0x15 * k), `  ...and its direction is start + $15 * ${k}`);
    assert.equal(all[k].speed, u8(baseSpeed(28) + 5), '  ...at kind 28\'s base speed plus $5');
    assert.equal(all[k].p2c, 0x00030016, '  ...with D4 in ($1C,A0), because $281930 stores it');
  }
  // ---- THE RING IS $FC WIDE, NOT $100: 12 x $15 leaves a four-unit SEAM.
  assert.equal(12 * 0x15, 0xfc, 'twelve steps of $15 is $FC');
  assert.equal(u8(all[11].dir + 0x15), u8(start + 0xfc), '  ...so the twelfth wraps four short');
  assert.notEqual(u8(all[11].dir + 0x15), start, '  ...the ring does NOT close on itself');

  // ---- THE MUZZLE IS PER-DIRECTION, out of the shared 64-longword vector table plus D5.
  // Recomputed from the image so the assertion is the ROM's own arithmetic, not the port's.
  for (let k = 0; k < 12; k++) {
    const d1 = u8(start + 0x15 * k);
    const d3 = (l(HIBACHI_A1.vectors + ((d1 + 2) & 0xfc)) + 0xfa000000) >>> 0;
    assert.equal(all[k].posA, (0x3800 + (d3 >>> 16)) & 0xffff, `shot ${k} Y = boss Y + D3 high`);
    assert.equal(all[k].posB, (0x1c00 + (d3 & 0xffff)) & 0xffff, `  ...and X = boss X + D3 low`);
  }
  assert.notEqual(all[0].posA, all[3].posA,
    '  ...and the twelve muzzles really differ, where gun 9\'s twelve are all the same literal');
  // the five instructions that do it, and the literal D5 they add.
  assert.equal(w(0x2a8c0c), 0x3601, '$2A8C0C `3601` move.w D1,D3');
  assert.equal(w(0x2a8c0e), 0x5443, '  ...$2A8C0E `5443` addq.w #$2,D3 -- ROUND, not off-by-one');
  assert.equal(w(0x2a8c10), 0x0243, '  ...$2A8C10 `0243` andi.w #imm,D3');
  assert.equal(w(0x2a8c12), 0x00fc, '  ...#$FC, so only D1\'s LOW byte can reach the index');
  assert.equal(w(0x2a8c14), 0x2631, '  ...$2A8C14 `2631` move.l ($0,A1,D3.w),D3');
  assert.equal(w(0x2a8c18), 0xd685, '  ...$2A8C18 `D685` add.l D5,D3');
  assert.equal(l(0x2a8c02), 0xfa000000, '  ...and $2A8C00 loaded D5 with $FA000000');
});

test('W408 SECTION 4: the heading CREEPS by ($10,A4) between volleys, and the gap is 7 frames',
  { skip: SKIP }, () => {
    const b = gunBench();
    gunAInit2A8B7C(b.ram, b.ROM, A4SLOT, SUB);
    const start = b.ram.u8(A4SLOT + 0x11);
    const firsts = [];
    const gaps = [];
    let since = 0;
    for (let f = 0; f < 0x11 + 4 * 7; f++) {
      const before = b.shots.length;
      gunAStep2A8BC0(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
      since += 1;
      if (b.shots.length !== before) {
        gaps.push(since); since = 0;
        firsts.push(rec(b.ram, b.shots[b.shots.length - 12]).dir);
      }
    }
    assert.deepEqual(gaps, [0x11, 7, 7, 7, 7],
      'the first volley is $10 + 1 step frames in, then ($6,A4) + 1 = 7 for ever');
    assert.deepEqual(firsts, [0, 1, 2, 3, 4].map((k) => u8(start - 2 * k)),
      '  ...and each volley opens 2 LOWER than the last, because ($10,A4) is $FE');
    assert.equal(w(0x2a8c26), 0x102c, '$2A8C26 `102C` move.b (d16,A4),D0');
    assert.equal(w(0x2a8c28), 0x0010, '  ...($10,A4)');
    assert.equal(w(0x2a8c2a), 0xd12c, '$2A8C2A `D12C` add.b D0,(d16,A4)');
    assert.equal(w(0x2a8c2c), 0x0011, '  ...($11,A4) -- a BYTE add, so it wraps through 0');
  });

test('W408 SECTION 4: a full run is 120 volleys and $352 frames, and the retire tail flips the '
  + 'spin and ramps THREE A6 fields', { skip: SKIP }, () => {
  const b = gunBench();
  gunAInit2A8B7C(b.ram, b.ROM, A4SLOT, SUB);
  let frames = 0;
  while (b.ram.u16(A4SLOT) !== 0 && frames < 4000) {
    gunAStep2A8BC0(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    frames += 1;
  }
  assert.equal(frames, 0x352, 'the run lasts $352 = 850 step frames');
  assert.equal(b.shots.length, 120 * 12, '  ...120 volleys of twelve');
  assert.equal(b.ram.u16(A4SLOT), 0, '  ...and $259B08 cleared the slot');
  // ---- THE FOUR A6 WRITES, and the alternator is NOT one of the three ramps.
  assert.equal(b.ram.u8(SUB + 0x1f0), 0xff, '`not.b ($1F0,A6)` turned $00 into $FF');
  assert.equal(b.ram.u8(SUB + 0x1f1), 0x0a, '  ...($1F1,A6) took one `addi.b #$A`');
  assert.equal(b.ram.u16(SUB + 0x1f2), 1, '  ...($1F2,A6) one `addq.w #$1`');
  assert.equal(b.ram.u16(SUB + 0x1f4), 1, '  ...and ($1F4,A6) one more');
  // ---- AND THE NEXT RUN IS DIFFERENT IN ALL FOUR PLACES.
  gunAInit2A8B7C(b.ram, b.ROM, A4SLOT, SUB);
  assert.equal(b.ram.u8(A4SLOT + 0x10), 0x02,
    'run 2 spins the OTHER WAY: ($1F0,A6) is no longer zero, so `neg.b` is skipped');
  assert.equal(b.ram.u8(A4SLOT + 0x04), 0x81, '  ...and it fires $A more volleys');
  assert.equal(b.ram.u16(A4SLOT + 0x08), 0x0006, '  ...one faster');
  assert.equal(b.ram.u32(A4SLOT + 0x0c), 0x00040016, '  ...with D4\'s high half one higher');
  // ---- THE CAPS, each read as its own `cmpi` and each an UNSIGNED `bcc.s`.
  for (const [site, opc, imm, off] of [[0x2a8c40, 0x0c2e, 0x0095, 0x01f1],
    [0x2a8c4e, 0x0c6e, 0x0002, 0x01f2], [0x2a8c5a, 0x0c6e, 0x0003, 0x01f4]]) {
    assert.equal(w(site), opc, `$${site.toString(16)} is a cmpi on (d16,A6)`);
    assert.equal(w(site + 2), imm, '  ...against its own immediate');
    assert.equal(w(site + 4), off, '  ...at its own offset');
  }
  assert.equal(w(0x2a8c46) & 0xff00, 0x6400, '$2A8C46 `64xx` BCC -- unsigned, not `6C` BGE');
  assert.equal(w(0x2a8c54) & 0xff00, 0x6400, '  ...and $2A8C54');
  assert.equal(w(0x2a8c60) & 0xff00, 0x6400, '  ...and $2A8C60');
});

test('W408 SECTION 4: gun $A NEITHER AIMS NOR SELECTS NOR TOGGLES -- both players dead fires '
  + 'the same twelve', { skip: SKIP }, () => {
  // Stated as the POSITIVE enumeration of what its $F4 bytes call, then driven.
  const calls = new Set();
  for (let a = HIBACHI_A1.gunAInit; a < GUNA_CODE_END; a += 2) {
    if (w(a) === 0x4eb9) calls.add(l(a + 2));
  }
  assert.deepEqual([...calls].sort((x, y) => x - y),
    [0x242438, 0x242ec2, 0x259b08, 0x2817c2],
    'gun $A calls exactly $242438, $242EC2, $259B08 and $2817C2 -- no $24270A, no $2422A2');
  assert.equal(w(0x2a8228), 0x41f9, '  ...where gun 5 INLINES $24270A: $2A8228 `41F9` lea');
  assert.equal(l(0x2a822a), HIBACHI_A1.selP1, '  ...$8103E6, the first of its two records');
  assert.equal(l(0x2a825a), 0x002422a2, '  ...and $2A8258 jsr $2422A2, the aim gun $A lacks');

  // ---- DRIVEN: a dead screen fires the same volley as a live one, byte for byte.
  const shotsFor = (opts) => {
    const b = gunBench(opts);
    gunAInit2A8B7C(b.ram, b.ROM, A4SLOT, SUB);
    volley1(b);
    return b.shots.map((e) => rec(b.ram, e)).map((s) => [s.dir, s.kind, s.speed, s.posA, s.posB]);
  };
  const alive = shotsFor({});
  assert.equal(alive.length, 12, 'a live screen fires twelve');
  assert.deepEqual(shotsFor({ p1: 0x0000, p2: 0x0000 }), alive,
    'and BOTH PLAYERS DEAD fires the same twelve -- there is no `bpl.w` skip arm at all');
  assert.deepEqual(shotsFor({ py: 0x6000, px: 0x0200 }), alive,
    '  ...and moving the player right across the screen changes nothing either');

  // ---- ($3,A5) IS READ ONCE, BY THE SPAWN CORE, AND NEVER TOGGLED.
  const b = gunBench({ sel: 1 });
  gunAInit2A8B7C(b.ram, b.ROM, A4SLOT, SUB);
  volley1(b);
  assert.equal(b.ram.u8(REC + 0x03), 1,
    '($3,A5) is UNCHANGED after a volley -- guns 5, 6, 8, 9 and $B all `bchg` it');
  assert.deepEqual(b.shots.map((e) => rec(b.ram, e).p2a), Array(12).fill(1),
    '  ...but it reaches every bullet, through $281930 move.b ($3,A5),($1A,A0)');
  assert.equal(l(0x2815c6 + 4 * 28), 0x00281930, '  ...$2815C6[28] IS $281930');
  // ...and the same run through the WHOLE magazine leaves it alone too.
  const c = gunBench({ sel: 1 });
  gunAInit2A8B7C(c.ram, c.ROM, A4SLOT, SUB);
  let n = 0;
  while (c.ram.u16(A4SLOT) !== 0 && n < 4000) {
    gunAStep2A8BC0(c.ram, c.ROM, c.ctx, A4SLOT, REC, SUB); n += 1;
  }
  assert.equal(c.ram.u8(REC + 0x03), 1, 'and unchanged across a whole 120-volley run');
});

test('W408 SECTION 4: kind 28 is the TRACKER, and its mover reads the global gun $A writes',
  { skip: SKIP }, () => {
    // This is the loop the header claims and it is entirely in the image.
    assert.equal(w(HIBACHI_A1.gunATemplate + 8), 0x001c, 'the template ($A,A4) is $001C = 28');
    assert.equal(l(0x2815c6 + 4 * 28), 0x00281930, '$2815C6[28] -> $281930, the tracker init');
    assert.equal(w(0x281930), 0x116d, '$281930 `116D` move.b (d16,A5),(d16,A0)');
    assert.equal(w(0x281932), 0x0003, '  ...from ($3,A5)');
    assert.equal(w(0x281934), 0x001a, '  ...to ($1A,A0), i.e. record base + $2A');
    assert.equal(w(0x281936), 0x2144, '  ...and $281936 `2144` move.l D4,($1C,A0)');
    assert.equal(l(0x282030 + 4 * 28), 0x00283260, '$282030[28] -> $283260, kind 28\'s behaviour');
    assert.equal(w(0x2832a0), 0x4eb9, '$2832A0 `4EB9` jsr');
    assert.equal(l(0x2832a2), 0x00242748, '  ...$242748 -- the re-aim keyed on ($2A,A6)');
    assert.equal(w(0x2832b0), 0x4a79, '$2832B0 `4A79` tst.w');
    assert.equal(l(0x2832b2), HIBACHI_A1.proximity,
      '  ...$8130DC -- the very word gun $A rewrites every frame');
    assert.equal(w(0x2832b6), 0x6600, '  ...and $2832B6 `6600` bne.w skips the +$B0 arm');
  });

// ===============================================================================================
// SECTION 5 -- $8130DC, $242438 AND $242486.
// ===============================================================================================

/** One step frame with the countdown left high, so only the proximity block runs. */
function proxOnly(opts) {
  const b = gunBench(opts);
  gunAInit2A8B7C(b.ram, b.ROM, A4SLOT, SUB);
  b.ram.setU16(HIBACHI_A1.proximity, 0x5555);          // a value neither arm can produce
  gunAStep2A8BC0(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
  return { flag: b.ram.u16(HIBACHI_A1.proximity), shots: b.shots.length };
}

test('W408 SECTION 5: $8130DC is REWRITTEN EVERY FRAME and it is a MIN over both players',
  { skip: SKIP }, () => {
    // The boss sits at ($3800,$1C00) on this bench, and $24249A is
    // `max(3/4|dY|, |dX|) + min/2` -- so a target on the boss's own square is distance 0.
    assert.equal(proxOnly({ py: 0x3800, px: 0x1c00 }).flag, 1, 'a player on top of the boss: 1');
    assert.equal(proxOnly({ py: 0x0000, px: 0x0000 }).flag, 0, '  ...and one at the origin: 0');
    // ...and the write happens on a frame that fires NOTHING, which is the point of it being
    // above the countdown.
    assert.equal(proxOnly({ py: 0x3800, px: 0x1c00 }).shots, 0,
      'and neither arm fired a shot: the block sits ABOVE $2A8BDC subq.b');
    // ---- THE MIN. P1 far, P2 near -- and the flag still sets, which only min-over-both does.
    assert.equal(proxOnly({ p2: 0x8000, py: 0x0000, px: 0x0000, p2y: 0x3800, p2x: 0x1c00 }).flag,
      1, 'P1 at the origin and P2 on the boss: the MIN is what decides');
    assert.equal(proxOnly({ p1: 0x0000, p2: 0x8000, p2y: 0x3800, p2x: 0x1c00 }).flag, 1,
      '  ...and a DEAD P1 does not veto a near P2');
    // ---- A DEAD RECORD MEASURES $7FFF, NOT ZERO. Both dead is the strongest statement of it:
    // if $242486 returned 0 for a dead player the flag would latch on for ever.
    assert.equal(proxOnly({ p1: 0x0000, p2: 0x0000 }).flag, 0,
      'both players dead: $7FFF twice, so the flag CLEARS');
    assert.equal(w(0x242486), 0x303c, '$242486 `303C` move.w #imm,D0');
    assert.equal(w(0x242488), 0x7fff, '  ...#$7FFF');
    assert.equal(w(0x24248a), 0x4a50, '  ...$24248A `4A50` tst.w (A0)');
    assert.equal(w(0x24248c), 0x6a28, '  ...$24248C `6A28` bpl.s, so ALIVE is bit 15 SET');
    assert.equal(0x24248e + 0x28, 0x2424b6, '  ...landing on $2424B6, the early rts');
    // ---- and $242438 itself, both `bsr.s`es decoded.
    assert.equal(l(0x24243a), HIBACHI_A1.selP1, '$242438 lea $8103E6,A0');
    assert.equal(l(0x242444), HIBACHI_A1.selP2, '  ...$242442 lea $810448,A0');
    for (const site of [0x24243e, 0x242448]) {
      assert.equal(IMG[site], 0x61, `$${site.toString(16)} \`61xx\` bsr.s`);
      assert.equal(site + 2 + IMG[site + 1], 0x242486, '  ...to $242486');
    }
    assert.equal(w(0x24244c), 0xb240, '$24244C `B240` cmp.w D0,D1');
    assert.equal(w(0x24244e), 0x6402, '  ...$24244E `6402` BCC -- UNSIGNED, not `6C` bge.s');
    assert.equal(w(0x242450), 0x3001, '  ...$242450 `3001` move.w D1,D0, taking P1 when nearer');
  });

test('W408 SECTION 5 (ablation): the gate is `bcc` and the boundary is AT $2000 exactly',
  { skip: SKIP }, () => {
    // FIRST PASS RESULT: `< $2000` -> `<= $2000` was invisible on every input above, because
    // no coordinate pair the other tests use lands ON the boundary. `bcc` skips the store when
    // the distance is >= $2000, so $2000 itself must give ZERO. Drive both sides of it: with
    // dY = 0 the distance IS |dX|, so the boundary is a single subtraction away.
    for (const [dx, flag, why] of [[0x1fff, 1, 'one inside'], [0x2000, 0, 'exactly AT'],
      [0x2001, 0, 'one outside']]) {
      assert.equal(proxOnly({ py: 0x3800, px: u16sub(0x1c00, dx) }).flag, flag,
        `distance $${dx.toString(16)} -- ${why} -- gives ${flag}`);
    }
    assert.equal(w(0x2a8bcc), 0x0c40, '$2A8BCC `0C40` cmpi.w #imm,D0');
    assert.equal(w(0x2a8bce), 0x2000, '  ...#$2000');
    assert.equal(w(0x2a8bd0), 0x6400, '  ...$2A8BD0 `6400` bcc.w, which SKIPS the store');
    assert.equal(0x2a8bd2 + disp16(0x2a8bd2), 0x2a8bdc, '  ...landing past it, on $2A8BDC');
  });

/** `u16(a - b)`, so a test can name a coordinate the boss is exactly `b` away from. */
function u16sub(a, b) { return (a - b) & 0xffff; }

// ===============================================================================================
// SECTION 6 -- THE ABLATION SECTION.
//
// Each of these exists because a mutation of the constant it names came back GREEN against the
// tests above: the shipped input made the right answer and the wrong answer agree. The fix is
// always a different INPUT, never a weaker assertion.
// ===============================================================================================

test('W408 SECTION 6 (ablation): D0 LOW word is the KIND and its HIGH word the SPEED BIAS',
  { skip: SKIP }, () => {
    // FIRST PASS RESULT: reading the kind from ($8,A4) and the bias from ($A,A4) came back
    // GREEN, because the shipped pair is {$0005, $001C} and 5 is also a valid kind. Drive a
    // slot whose halves are both small and DIFFERENT, and read both record fields.
    const b = gunBench();
    gunAInit2A8B7C(b.ram, b.ROM, A4SLOT, SUB);
    b.ram.setU16(A4SLOT + 0x08, 0x0007);        // the BIAS half
    b.ram.setU16(A4SLOT + 0x0a, 0x000b);        // the KIND half
    volley1(b);
    const first = rec(b.ram, b.shots[0]);
    assert.equal(first.kind, 0x0b, 'the kind comes out of ($A,A4), the LOW word of D0');
    assert.equal(first.speed, u8(baseSpeed(0x0b) + 0x07), '  ...and ($8,A4) is the bias');
    assert.notEqual(first.kind, 0x07, '  ...the two readings really differ on this input');
    assert.equal(w(0x2a8bf4), 0x202c, '$2A8BF4 `202C` move.l (d16,A4),D0 -- ONE load');
    assert.equal(w(0x2a8bf6), 0x0008, '  ...($8,A4), covering ($8,A4) AND ($A,A4)');
  });

test('W408 SECTION 6 (ablation): D4 comes from ($C,A4) and it is NOT the same longword as D0',
  { skip: SKIP }, () => {
    // FIRST PASS RESULT: passing `d4: 0` -- which is what every other gun in the file does --
    // came back GREEN against every test that read `dir`, `kind`, `speed` or position, because
    // D4 reaches only ($1C,A0). Read that field.
    const b = gunBench();
    gunAInit2A8B7C(b.ram, b.ROM, A4SLOT, SUB);
    b.ram.setU32(A4SLOT + 0x0c, 0xdead0001);
    volley1(b);
    assert.deepEqual([...new Set(b.shots.map((e) => rec(b.ram, e).p2c))], [0xdead0001],
      'all twelve carry ($C,A4) in ($1C,A0), and none carries zero');
    assert.notEqual(0xdead0001, b.ram.u32(A4SLOT + 0x08), '  ...and it is a DIFFERENT longword');
    assert.equal(w(0x2a8bfc), 0x282c, '$2A8BFC `282C` move.l (d16,A4),D4');
    assert.equal(w(0x2a8bfe), 0x000c, '  ...($C,A4), four bytes above D0\'s');
  });

test('W408 SECTION 6 (ablation): the ring step is $15 and the count is TWELVE, and only a full '
  + 'volley separates them from their neighbours', { skip: SKIP }, () => {
  // FIRST PASS RESULT: `moveq #$B` read as ELEVEN came back GREEN against a test that only
  // asserted `dir` for the shots it got, and `#$15` -> `#$16` was invisible on shot 0. Both
  // are pinned here by the whole volley at once.
  const b = gunBench();
  gunAInit2A8B7C(b.ram, b.ROM, A4SLOT, SUB);
  const start = b.ram.u8(A4SLOT + 0x11);
  volley1(b);
  assert.equal(b.shots.length, 12, 'TWELVE, because dbra runs N + 1 times');
  assert.deepEqual(b.shots.map((e) => rec(b.ram, e).dir),
    [...Array(12).keys()].map((k) => u8(start + 0x15 * k)),
    '  ...and every one of the twelve steps by exactly $15');
  assert.notEqual(u8(start + 0x15 * 11), u8(start + 0x16 * 11),
    '  ...which $16 would not reproduce at k = 11');
  assert.equal(w(0x2a8c0a), 0x7e0b, '$2A8C0A `7E0B` moveq #$B,D7');
  assert.equal(w(0x2a8c22), 0x51cf, '  ...$2A8C22 `51CF` dbra D7');
  assert.equal(0x2a8c24 + disp16(0x2a8c24), 0x2a8c0c, '  ...back to $2A8C0C, the loop head');
  assert.equal(w(0x2a8c06), 0x1c3c, '$2A8C06 `1C3C` move.b #imm,D6');
  assert.equal(w(0x2a8c08), 0x0015, '  ...#$15');
  assert.equal(w(0x2a8c20), 0xd206, '  ...$2A8C20 `D206` add.b D6,D1 -- a BYTE add');
});

test('W408 SECTION 6 (ablation): the SPIN alternator is ($1F0,A6) and it is `tst` in the init '
  + 'against `not` in the tail', { skip: SKIP }, () => {
  // FIRST PASS RESULT: dropping `$2A8BBA neg.b ($10,A4)` came back GREEN, because a test that
  // only reads the twelve DIRECTIONS of volley one never sees the creep, and a test that reads
  // the creep on the SHIPPED slot sees $FE either way only if it compares against itself.
  // Drive both states of ($1F0,A6) and read the second volley.
  for (const [flag, spin] of [[0x00, 0xfe], [0xff, 0x02], [0x01, 0x02]]) {
    const b = gunBench();
    b.ram.setU8(SUB + 0x1f0, flag);
    gunAInit2A8B7C(b.ram, b.ROM, A4SLOT, SUB);
    assert.equal(b.ram.u8(A4SLOT + 0x10), spin,
      `($1F0,A6) = $${flag.toString(16)} gives spin $${spin.toString(16)}`);
    const start = b.ram.u8(A4SLOT + 0x11);
    volley1(b);
    for (let i = 0; i < 7; i++) gunAStep2A8BC0(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    assert.equal(rec(b.ram, b.shots[12]).dir, u8(start + spin),
      '  ...and volley 2 opens exactly that far from volley 1');
  }
  assert.equal(w(0x2a8bb2), 0x4a2e, '$2A8BB2 `4A2E` tst.b (d16,A6)');
  assert.equal(w(0x2a8bb4), 0x01f0, '  ...($1F0,A6)');
  assert.equal(w(0x2a8bb6), 0x6600, '  ...$2A8BB6 `6600` bne.w, so ZERO is what runs the neg');
  assert.equal(0x2a8bb8 + disp16(0x2a8bb8), 0x2a8bbe, '  ...skipping to $2A8BBE, the rts');
  assert.equal(w(0x2a8c3c), 0x462e, '$2A8C3C `462E` not.b (d16,A6) -- NOT an `addi.b`');
  assert.equal(w(0x2a8c3e), 0x01f0, '  ...the same ($1F0,A6)');
});

test('W408 SECTION 6 (ablation): the countdown is the BORROW and it reloads from ($6,A4)',
  { skip: SKIP }, () => {
    // FIRST PASS RESULT: `if (t !== 0) return` -> `if (t > 1) return` was GREEN on the gap
    // pattern, because both fire on the same frames when the reload is 6. Set ($6,A4) to 0 --
    // the value an off-by-one reading turns into "every frame" instead of "every other one".
    const b = gunBench();
    gunAInit2A8B7C(b.ram, b.ROM, A4SLOT, SUB);
    b.ram.setU8(A4SLOT + 0x02, 0x00);
    b.ram.setU8(A4SLOT + 0x06, 0x00);
    const frames = [];
    for (let f = 0; f < 8; f++) {
      const before = b.shots.length;
      gunAStep2A8BC0(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
      frames.push(b.shots.length !== before ? 1 : 0);
    }
    assert.deepEqual(frames, [1, 1, 1, 1, 1, 1, 1, 1],
      'a reload of ZERO fires every frame: `subq.b` borrows from 0 to $FF and `bcs` takes it');
    assert.equal(w(0x2a8bdc), 0x532c, '$2A8BDC `532C` subq.b #$1,(d16,A4)');
    assert.equal(w(0x2a8bde), 0x0002, '  ...($2,A4)');
    assert.equal(w(0x2a8be0), 0x6502, '  ...$2A8BE0 `6502` BCS -- the borrow, over the rts');
    assert.equal(w(0x2a8be4), 0x196c, '$2A8BE4 `196C` move.b (d16,A4),(d16,A4)');
    assert.equal(w(0x2a8be6), 0x0006, '  ...from ($6,A4)');
    assert.equal(w(0x2a8be8), 0x0002, '  ...to ($2,A4)');
  });

test('W408 SECTION 6 (ablation): the volley counter reloads from ($5,A4) and the two only '
  + 'differ once you make them differ', { skip: SKIP }, () => {
  // FIRST PASS RESULT: reloading ($4,A4) from ($4,A4) came back GREEN, because the template's
  // $7777 puts the SAME byte in both and the init adds the SAME ramp to both. Drive a slot
  // where they differ -- and note the reload is visible only in the NEXT init's input, since
  // the retire follows it immediately.
  const b = gunBench();
  gunAInit2A8B7C(b.ram, b.ROM, A4SLOT, SUB);
  b.ram.setU8(A4SLOT + 0x04, 0x00);
  b.ram.setU8(A4SLOT + 0x05, 0x33);
  volley1(b);
  assert.equal(b.ram.u8(A4SLOT + 0x04), 0x33, 'the reload came from ($5,A4), not from ($4,A4)');
  assert.equal(b.ram.u16(A4SLOT), 0, '  ...on the same frame the slot was cleared');
  assert.equal(w(0x2a8c36), 0x196c, '$2A8C36 `196C` move.b (d16,A4),(d16,A4)');
  assert.equal(w(0x2a8c38), 0x0005, '  ...from ($5,A4)');
  assert.equal(w(0x2a8c3a), 0x0004, '  ...to ($4,A4)');
  assert.equal(w(0x2a8c2e), 0x532c, '  ...and $2A8C2E `532C` subq.b is what borrows into it');
  assert.equal(w(0x2a8c30), 0x0004, '  ...on ($4,A4)');
  // ...and the init writes BOTH bytes with the same ramp, which is why the shipped pair hides it.
  assert.equal(w(0x2a8b90), 0xd12c, '$2A8B90 `D12C` add.b D0,($4,A4)');
  assert.equal(w(0x2a8b94), 0xd12c, '  ...$2A8B94 the same instruction on ($5,A4)');
  assert.equal(w(0x2a8b96), 0x0005, '  ...($5,A4)');
});

test('W408 SECTION 6 (ablation): the three retire ramps SATURATE AT their own constants, and '
  + 'only a value ON the cap says which comparison it is', { skip: SKIP }, () => {
  // FIRST PASS RESULT: `$95` -> `$A5`, `< 2` -> `<= 2` and `< 3` -> `< 2` all came back GREEN,
  // because the only run the other tests drive starts every A6 field at ZERO and one `addi`
  // never reaches any of the three caps. Drive each field to cap - 1 and to the cap itself.
  const retire = (writes) => {
    const b = gunBench();
    gunAInit2A8B7C(b.ram, b.ROM, A4SLOT, SUB);
    for (const [off, v, wide] of writes) {
      if (wide) b.ram.setU16(SUB + off, v); else b.ram.setU8(SUB + off, v);
    }
    b.ram.setU8(A4SLOT + 0x04, 0);          // one volley, then the counter borrows
    let n = 0;
    while (b.ram.u16(A4SLOT) !== 0 && n < 200) {
      gunAStep2A8BC0(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB); n += 1;
    }
    assert.ok(b.ram.u16(A4SLOT) === 0, 'the slot really retired');
    return b.ram;
  };
  // ($1F1,A6): `cmpi.b #$95 / bcc.s` -- add $A below $95, nothing AT it.
  assert.equal(retire([[0x1f1, 0x94, false]]).u8(SUB + 0x1f1), 0x9e, '$94 takes the $A');
  assert.equal(retire([[0x1f1, 0x95, false]]).u8(SUB + 0x1f1), 0x95, '  ...and $95 does NOT');
  // ($1F2,A6): `cmpi.w #$2 / bcc.s` -- add 1 below 2, nothing AT 2.
  assert.equal(retire([[0x1f2, 1, true]]).u16(SUB + 0x1f2), 2, '1 takes the addq');
  assert.equal(retire([[0x1f2, 2, true]]).u16(SUB + 0x1f2), 2, '  ...and 2 does NOT');
  // ($1F4,A6): `cmpi.w #$3 / bcc.s` -- and it is THREE, not two.
  assert.equal(retire([[0x1f4, 2, true]]).u16(SUB + 0x1f4), 3, '2 takes the addq');
  assert.equal(retire([[0x1f4, 3, true]]).u16(SUB + 0x1f4), 3, '  ...and 3 does NOT');
  // ...and the three immediates, read as the cmpi operands themselves.
  assert.equal(w(0x2a8c42), 0x0095, '$2A8C40 cmpi.b #$95');
  assert.equal(w(0x2a8c50), 0x0002, '$2A8C4E cmpi.w #$2');
  assert.equal(w(0x2a8c5c), 0x0003, '$2A8C5A cmpi.w #$3');
});

test('W408 SECTION 6 (equivalence): D1\'s bits 8..15 reach nothing, and here is the proof',
  { skip: SKIP }, () => {
    // `$2A8BF0 move.b ($11,A4),D1` writes only the low byte of a register `$2A8BC6 jsr $242438`
    // has just left a DISTANCE in, so on the cartridge D1's high byte is the high byte of that
    // distance. It reaches nothing: `$2A8C10 andi.w #$FC,D3` masks it out of the vector index
    // and the spawn core takes D1 as a BYTE. Asserted against the two consumers, not argued.
    assert.equal(w(0x2a8c10), 0x0243, '$2A8C10 `0243` andi.w #imm,D3');
    assert.equal(w(0x2a8c12), 0x00fc, '  ...#$FC -- bits 8..15 cannot survive it');
    assert.equal(w(0x28158e), 0x1141, '$28158E `1141` move.b D1,(d16,A0) -- a BYTE store');
    assert.equal(w(0x281596), 0x1141, '  ...and $281596, the ($2B,A0) copy, the same');
    // ...and the port's own arithmetic is a byte add, matching `$2A8C20 add.b D6,D1`.
    assert.equal(w(0x2a8c20), 0xd206, '$2A8C20 `D206` add.b D6,D1');
    // FIRST PASS RESULT: `u8(d1 + $15)` -> `u16(d1 + $15)` came back GREEN, and it is an
    // **INVALID MUTATION**, not a hole -- the two are provably the same routine. `andi.w #$FC`
    // clears bit 8, so `((x & $FF) + 2) & $FC` and `(x + 2) & $FC` agree for every x; and the
    // core takes D1 as a byte. It was REPLACED by two mutations of the index itself -- dropping
    // the `addq.w #$2` round and masking `$FF` instead of `$FC` -- which this loop reddens.
    // The positions are read as well as the directions, and one start ($F0) is chosen so the
    // ring really does wrap past $FF inside the volley.
    const seen = new Set();
    for (const start of [0x00, 0x01, 0x7f, 0x80, 0xf0, 0xfe, 0xff]) {
      const b = gunBench();
      gunAInit2A8B7C(b.ram, b.ROM, A4SLOT, SUB);
      b.ram.setU8(A4SLOT + 0x11, start);
      volley1(b);
      const all = b.shots.map((e) => rec(b.ram, e));
      seen.add(all.map((s) => s.dir).join(','));
      for (let k = 0; k < 12; k++) {
        const d1 = u8(start + 0x15 * k);              // the BYTE the ROM's `add.b` leaves
        const d3 = (l(HIBACHI_A1.vectors + ((d1 + 2) & 0xfc)) + 0xfa000000) >>> 0;
        assert.equal(all[k].posA, (0x3800 + (d3 >>> 16)) & 0xffff,
          `start $${start.toString(16)} shot ${k}: the muzzle indexes the BYTE, not a word`);
        assert.equal(all[k].posB, (0x1c00 + (d3 & 0xffff)) & 0xffff, '  ...on both axes');
      }
    }
    assert.equal(seen.size, 7, 'seven distinct starting bytes give seven distinct rings');
  });

// ===============================================================================================
// SECTION 7 -- THE WINDOW.
// ===============================================================================================

test('W408 SECTION 7: ONE new window, bounded three ways and none of them an absence',
  { skip: SKIP }, () => {
    const set = new Map(tables.rom.windows.map(
      (x) => [parseInt(String(x.base).replace('$', ''), 16), x.len]));
    assert.equal(set.size, tables.rom.windows.length, 'no duplicate window bases');
    assert.equal(tables.rom.windows.length, ROM_WINDOW_COUNT,
      'W409 CORRECTION: 599 windows -- 595 + this wave\'s one + W409\'s three'
      + ' W411 declares $280F34, the collected-impact transform table, so 600. W418 declares the CONTINUE panel\'s two strings and three tables ($2886FC $28870C $28886A $2888B2 $2888DA), so 605. W419 declares $289EDA ($60), pool C\'s kind-8 and kind-$C descriptor lists -- the art half of opening $289B50\'s kind guard; W194\'s $289B50+$38A window is NOT widened, it abuts, and the overlap count is unchanged. So 606. W425 declares $294134 ($20), the timer-D SOUND dispatch table of D-script 6 -- the eight cue-wrapper addresses the boss DEATH ANIMATION walks with `movea.l (A0),A0 / jsr (A0)`, which is the explosion rattle DOCKET D58 was opened on. The $294154 window from W107 ABUTS it and is NOT widened: the two are read by different routines for different reasons, and the overlap count is unchanged. So 607. W428 declares the FOUR word-threshold cue scripts ($268E32 $273986 $2747A8 $275F04), so 611. Each of the four begins INSIDE its type\'s prototype window and runs on to the handler that follows it, because a cue record\'s longwords straddle that window\'s end and RomWindows.#at cannot stitch a read across a seam -- W428 declared an abutting window and MEASURED that $27399E threw anyway. So for the first time in twelve waves the overlap count moves too, 71 -> 75, four new pairs for four new windows. Both numbers now live in tests/romwindowset.js, which is where to change them and where to read why.');

    // (1) the `lea` NAMES the base. TRAP 4: extension-word address plus displacement.
    assert.equal(w(HIBACHI_A1.gunAInit), 0x41fa, '$2A8B7C `41FA` lea (d16,PC),A0');
    assert.equal(w(0x2a8b7e), 0xffce, '  ...with displacement $FFCE');
    assert.equal(0x2a8b7e + disp16(0x2a8b7e), HIBACHI_A1.gunATemplate,
      '  ...(1) $2A8B7E - $32 = $2A8B4C');
    // (2) the LENGTH is the `moveq` plus one -- TRAP 2, dbra runs N+1 times.
    assert.equal(w(0x2a8b84), 0x7007, '$2A8B84 `7007` moveq #$7,D0');
    assert.equal(w(0x2a8b86), 0x32d8, '  ...$2A8B86 `32D8` move.w (A0)+,(A1)+');
    assert.equal(w(0x2a8b88), 0x51c8, '  ...$2A8B88 `51C8` dbra');
    assert.equal(0x2a8b8a + disp16(0x2a8b8a), 0x2a8b86, '  ...back to the move');
    assert.equal(set.get(HIBACHI_A1.gunATemplate), 0x10, '  ...(2) so 8 words, $10 bytes');
    // (3) and $2A8B5C -- base + $10 -- is a POSITIVE witness: the eight self-pointers, whose
    //     eighth ends AT the code itself.
    assert.equal(HIBACHI_A1.gunATemplate + 0x10, GUNA_BLOB, '(3) base + $10 is $2A8B5C');
    for (let i = 0; i < 8; i++) {
      assert.equal(l(GUNA_BLOB + i * 4), HIBACHI_A1.gunAInit,
        `  ...$${(GUNA_BLOB + i * 4).toString(16).toUpperCase()} is $002A8B7C`);
    }
    assert.equal(GUNA_BLOB + 0x20, HIBACHI_A1.gunAInit, '  ...and the eighth ends AT the code');

    // ---- NO OTHER WINDOW, AND $26BFFC IS NOT WIDENED. Gun $A's muzzles come out of the
    // 64-longword vector table W31/W176 already covers inside $26BE70 + $28C.
    assert.equal(w(0x2a8bea), 0x43f9, '$2A8BEA `43F9` lea <abs.l>,A1');
    assert.equal(l(0x2a8bec), HIBACHI_A1.vectors, '  ...$26BFFC');
    const covering = [...set].filter(([base, len]) => base <= HIBACHI_A1.vectors
      && HIBACHI_A1.vectors + 0x100 <= base + len);
    assert.deepEqual(covering, [[0x26be70, 0x28c]],
      '  ...and $26BE70 + $28C already covers all 64 longwords, so nothing is widened');
    // ...and the template `lea` is the only one in the whole routine.
    assert.equal(
      [...Array((GUNA_CODE_END - HIBACHI_A1.gunAInit) / 2).keys()]
        .map((i) => w(HIBACHI_A1.gunAInit + i * 2))
        .filter((v) => (v & 0xf1ff) === 0x41fa).length, 1,
      'exactly ONE `lea (d16,PC),An` in gun $A\'s whole $F4 bytes');
  });

test('W408 SECTION 7: the ported and counted lists still add up to the whole table',
  { skip: SKIP }, () => {
    assert.deepEqual([...HIBACHI_A1_SCRIPTS],
      [0, 1, 2, 3, 5, 6, 7, 8, 9, 0x0a, 0x0b, 0x0c, 0x0d],
      'Playable catalogue correction: THIRTEEN A1 ids are ported now');
    assert.deepEqual([...HIBACHI_GUN_A4_SCRIPTS],
      [0x0a, 0x0b, 0x0c, 0x0d, 0x0f, 0x10, 0x11], '  ...and seven A4');
    assert.deepEqual(Object.keys(HIBACHI_A1_COUNTED).map(Number), [4],
      '  ...leaving one counted');
    // ...and every extent still in the counted list is MEASURED from the table, not typed.
    const above = [];
    for (let i = 0; i < HIBACHI_A1.pairs * 2; i++) above.push(l(HIBACHI_A1.main + i * 4));
    above.push(0x2a92a8);
    for (const id of Object.keys(HIBACHI_A1_COUNTED).map(Number)) {
      const c = HIBACHI_A1_COUNTED[id];
      assert.equal(l(HIBACHI_A1.main + id * 8), c.init, `A1 $${id.toString(16)}.init`);
      const end = Math.min(...above.filter((v) => v > c.step));
      assert.equal(end - c.init, c.bytes, `  ...and its $${c.bytes.toString(16)} bytes`);
    }
  });
