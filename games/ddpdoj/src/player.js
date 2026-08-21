// THE PLAYER -- object dispatch types 2 ($2491C0, P1) and 3 ($249246, P2).
//
// The handler's entry does a one-time init (`bset #0,($3,A5)`) and then
// `bne $2494FA` every subsequent frame, so $2494FA IS the per-frame update and
// is what this file translates.  A6 = the player record: $8103E6 for P1,
// $810448 for P2 (stride $62).  A5 = the object slot; ($7,A5) = the player
// index.
//
// The ROM's own order, which a port MUST NOT rearrange:
//
//   1. read the input mirrors into ($18,A6) raw and ($19,A6) edge
//   2. CLEAR the velocity accumulators ($30/$32)
//   3. stick nibble -> angle byte through $2552DC
//   4. MOVE FIRST: $2417DE adds the vector straight into ($2,A6)/($4,A6)
//   5. re-read the moved position into D2/D3
//   6. CLAMP SECOND, per stick bit, and SUBTRACT THE OVERSHOOT FROM THE
//      ACCUMULATOR ($30/$32) so the recorded velocity is the applied one
//   7. store D2/D3 back
//   8. tail: the animation records, indexed by the tilt counter
//
// "Clamp then move" is the wrong port and it is only wrong AT THE WALL, which
// is why the fly-around scenario pins all four walls and why breaking this
// order is the wave's red validation.  The build-A memmap recon called out the
// same trap independently.

import { P, OPT, RAM, CLAMP, ROM } from './machine.js';
import { i16, u16 } from './ram.js';
import { unreached } from './unported.js';
import { spawnShot } from './shots.js';
import { drawShipShadow, SHIP_MUTATE } from './shipsprite.js';
import { fireBomb2498E2, BOMBRAM } from './bomb.js';
import {
  HYPER, endHyper285AF2, grantHyper287682, requestHyper249868,
  resetHyper25392E,
} from './hyper.js';
import { spawnItem, collectHyperStock, POWER } from './items.js';
import { BEAM, wipeSegmentPool } from './laser.js';
import { hyperStock286ED6, txPrint240DC2, txPrint240E1A } from './hud.js';
import { install2415A2 } from './palette.js';
import { ALLOC, queueKill } from './objalloc.js';

// Globals the player reads and the port does not write.  Seeded once and
// FROZEN for the run.  Listed by name so the runner can print them and a
// reviewer can see exactly which "constants" are really assumptions.
export const FROZEN_GLOBALS = [
  [0x812972, 'global freeze; non-zero jumps the whole update to $24A3A2'],
  [0x81296e, 'input mask; non-zero masks the stick to 4 bits at $249596'],
  [0x8130d2, 'movement disable; non-zero makes $2417FE return a zero vector'],
  [0x812954, 'the $2496CA -$48 nudge'],
  [0x81308c, 'gate on the post-store X adjust at $2496EE'],
  // W79 RENAMED THIS AND THE OLD NAME WAS WRONG FOR SEVENTY-FIVE WAVES.  It is
  // not "the bomb/hyper block": `$2497AA` is THE AUTO-SHOT, and `$80380F` is
  // the operator setting that enables it.  `$25707A cmpi.b #$2,$80380F / bge
  // $257090` is the settings VALIDATOR, and it rejects anything >= 2 -- so the
  // byte is a two-value on/off dip, sitting in the `$803808..$80380F` operator
  // block next to `$80380C` = rank.  It is READ-ONLY to this port and stays
  // frozen; what changed is the name, not the treatment.
  [0x80380f, 'operator setting: AUTO-SHOT on/off, gating the $2497AA block'],
  // WAVE 13 REMOVED TWO FROM THIS LIST, because the port now writes both:
  //   $813176 -- "the amount that post-store X adjust subtracts".  It is
  //     $26151E, inside the background object's cross-axis routine $26146C,
  //     ported this wave (src/background.js).
  //   $8130CE -- was listed here as "bomb stock compared against 4 at
  //     $2497FE".  IT IS NOT BOMB STOCK.  It is THE DISTANCE CLOCK, the scroll
  //     odometer $26132C bumps once per $200 of scroll
  //     (20-recon-scroll-engine §3; 20-plan §2 W14 names this exact
  //     correction).  $2497FE really does compare it against 4, so the gate
  //     the port has been applying is accidentally right and stays as written
  //     -- but the NAME was wrong for eight waves and the real bomb stock is
  //     still unlocated (W28).
];

// THE RED-VALIDATION SEAM, and it is deliberately in the shipped file.
//
// `docs/knowledge/03`: a check that has never been seen red is not a check, and
// the wave brief names this exact one -- "red-validate by breaking the clamp
// order".  The wrong port is not "clamp the position on entry": the position is
// already inside the box every frame, so that mutation is a no-op and it PASSED
// the whole 2,200-frame comparison when it was tried.  MEASURED, and it is the
// reason this seam exists: the mutation has to be the one a person would
// actually write -- clamp BEFORE $2417DE adds the vector, and then store
// without clamping -- which cannot be produced from outside this function.
//
// 'rom' is the ROM's order and the only value the port ever ships with.
export const CLAMP_ORDER = { value: 'rom' };

/** W164 mutation seam. `skip-rank-quarter` is the plausible broken port that
 * ends a hyper and clears stock but leaves its persistent rank power intact. */
export const DEATH_MUTATE = { value: null };

export const DEATH = Object.freeze({
  hit: 0x249f8a, state: 0x24a130, reset: 0x24a1ec,
  animList: 0x255b7c, formationCaps: 0x2551fa,
  commonMedal: 0x817f80,
  p1: Object.freeze({
    h: HYPER.p1, beam: BEAM[0], ready: 0x81292c, flag: 0x812930,
    noMiss: 0x81293c, medalA: 0x817f84, medalB: 0x817f86,
    activeSave: 0x812974, suffix: 0x812910,
    reloadA: 0x812914, reloadB: 0x812916,
    lives: 0x8130be, dropGate: 0x812934, dropCount: 0x812938,
    paletteTable: 0x25321e, paletteCall: 0x2531de, stateWord: 2,
  }),
  p2: Object.freeze({
    h: HYPER.p2, beam: BEAM[1], ready: 0x81292e, flag: 0x812932,
    noMiss: 0x81293e, medalA: 0x817f88, medalB: 0x817f8a,
    activeSave: 0x812976, suffix: 0x812912,
    reloadA: 0x812918, reloadB: 0x81291a,
    lives: 0x8130c0, dropGate: 0x812936, dropCount: 0x81293a,
    paletteTable: 0x25323e, paletteCall: 0x2531fe, stateWord: 3,
  }),
});

function deathSide(p2) { return p2 ? DEATH.p2 : DEATH.p1; }

/** $24A42A -- the tilt (bank) decay: ($4e,A6) moves 4 toward zero, or stays. */
function tiltDecay(ram, rec) {
  const t = i16(ram.u16(rec + P.tilt));       // $24A42E tst.w ($4e,A6)
  if (t === 0) return;                        // $24A432 beq
  const d = t < 0 ? 4 : -4;                   // $24A434 bmi -> +4 else -4
  ram.setU16(rec + P.tilt, u16(t + d));       // $24A43A add.w D0,($4e,A6)
}

/** $2495EE/$24962E -- one step of the bank ramp toward `limit` (-$20 or +$20).
 *  MEASURED shape: a 2-frame delay counter at ($4c,A6), step 4. */
function tiltRamp(ram, rec, limit, step) {
  if (i16(ram.u16(rec + P.tilt)) === limit) return;      // cmpi.w #limit,($4e,A6)/beq
  const d = i16(ram.u16(rec + P.tiltDelay)) - 1;         // subq.w #1,($4c,A6)
  ram.setU16(rec + P.tiltDelay, u16(d));
  // `bcc` after subq.w tests CARRY, i.e. borrow: it branches unless the
  // subtraction went below zero.  So the step happens on the frame the counter
  // wraps past 0, not the frame it reaches 0.
  if (d >= 0) return;
  ram.setU16(rec + P.tiltDelay, 2);                      // move.w #$2,($4c,A6)
  ram.setU16(rec + P.tilt, u16(i16(ram.u16(rec + P.tilt)) + step));
}

/** `$2531DE/$2531FE -> $2415A2`, the death-time partial sprite-palette
 * install. The table row supplies its source, bank and exact word count. */
function deathPalette2531DE(ram, rom, ctx, p2) {
  const d = deathSide(p2);
  const index = u16(ram.u16(d.suffix) * 2);             // $2531DE/$2531FE
  const row = d.paletteTable + index;
  const src = rom.u32(row);
  const bank = rom.u16(row + 4);
  const count = rom.u16(row + 6);
  if (!ctx.palette) {
    ctx.unportedLog?.note(d.paletteCall, `$${d.paletteCall.toString(16)
      .toUpperCase()} -> $2415A2 partial sprite-palette install skipped because `
      + 'this isolated caller supplied no PaletteState');
    return;
  }
  install2415A2(ram, ctx.palette, bank, count,
    rom.bytes(src, (count + 1) * 2), d.paletteCall,
    `death palette table $${d.paletteTable.toString(16).toUpperCase()}`);
}

/** `$249F8A..$24A12E`, the immediate player-hit/death initializer. */
export function playerHit249F8A(ram, slot, rec, ctx, p2 = false) {
  const d = deathSide(p2);
  const h = d.h;

  ram.setU16(0x81316c, 1);                              // $261116
  ram.setU16(0x81316a, 0);                              // $26111E
  if (!ram.btst8(rec, 6)) {                             // $249F90
    ctx.unportedLog?.note(0x2532ea, '$249F96 jsr $2532EA, the death-time HUD '
      + 'draw; its closure is presentation-only');
  }
  ctx.soundPost?.(0x28c3a0);                            // $249F9C
  ram.setU16(0x803938, 1);                              // $249FA2

  wipeSegmentPool(ram, ctx, d.beam);                    // $249FB2/$24A056
  ram.setU16(d.ready, 1);                               // $249FB8/$24A05C
  ram.setU16(d.flag, 1);                                // $249FC0/$24A064
  ram.setU16(d.noMiss, u16(ram.u16(d.noMiss) + 2));     // $249FC8/$24A06C
  ram.setU16(DEATH.commonMedal, 0);                     // $27F898/$27F8AE
  ram.setU16(d.medalA, 0);
  ram.setU16(d.medalB, 0);

  let earn = u16(ram.u16(h.earn) + 0x0258);             // $287B9A/$287BB6
  ram.setU16(h.earn, earn);
  if (earn >= 0x095f) ram.setU16(h.earn, 0x095e);
  grantHyper287682(ram, ctx.rom, ctx, p2);               // $249FDA/$24A07E

  ram.setU16(d.activeSave, ram.u16(h.active));           // $249FE0/$24A084
  ram.setU16(d.suffix, 0);                               // $249FEA/$24A08E
  ram.setU16(d.reloadA, 8);                              // $249FF0/$24A094
  ram.setU16(d.reloadB, 8);                              // $249FF8/$24A09C
  endHyper285AF2(ram, ctx.rom, ctx, p2);                 // $24A000/$24A0A4
  if (DEATH_MUTATE.value !== 'skip-rank-quarter') {
    ram.setU16(h.power, ram.u16(h.power) >>> 2);         // $24A00C/$24A0B0
  }
  if (ram.u16(h.stock) !== 0) {                          // $24A014/$24A0B8
    ram.setU16(h.stock, 0);                              // $24A01C/$24A0C0
    hyperStock286ED6(ram, ctx.rom, ctx, p2 ? 1 : 0);    // $24A022/$24A0C6
  }

  const lives = ram.u16(d.lives);                       // $24A028/$24A0CC
  if (lives === 0) resetHyper25392E(ram, p2);            // $24A030/$24A0D4
  ram.setU16(rec + P.auraPhase, d.stateWord);            // $24A036/$24A0DA
  deathPalette2531DE(ram, ctx.rom, ctx, p2);             // $24A03E/$24A0E2

  let drops = 1, kind = 4;                               // $24A0F6/$24A0F8
  if (lives !== 0) {
    drops = 3;
    kind = 0;
    if (ram.u16(d.dropGate) === 0) {                     // $24A102
      const before = ram.u16(d.dropCount);
      ram.setU16(d.dropCount, u16(before + 1));           // $24A108
      drops = before;                                    // D7=(A3); addq; subq
    }
  }
  for (let n = 0; n < drops; n++) {
    spawnItem(ram, ctx.rom, ctx, kind, rec, 0x24a10e);    // $24A10E/dbra
  }

  ram.setU16(rec, ram.u16(rec) & 0x2000);                // $24A118
  ram.bset8(rec, 0);                                     // $24A11C, state $0100
  ram.setU32(rec + P.hitXPlus, DEATH.animList);          // $24A120
  ram.setU16(rec + P.dirByte, 6);                        // $24A128
  ctx.deathEvent?.('hit', p2 ? 2 : 1, drops, kind);
}

/** `$24A130..$24A21A`, the complete death animation and player-record reset.
 * Its final jump queues the current object ID for deferred destruction. */
export function playerDead24A130(ram, slot, rec, ctx, p2 = false) {
  if (!ram.btst8(rec, 2)) {                              // $24A130
    const next = (ram.u32(rec + P.hitXPlus) + 4) >>> 0;  // $24A136/$24A13A
    if (ctx.rom.i16(next) >= 0) {                        // $24A13C
      ram.setU32(rec + P.hitXPlus, next);                // $24A140
      return 'animating';
    }
    ram.setU16(rec + 0x26, 0x20);                        // $24A146
    ram.bset8(rec, 2);                                   // $24A14C
  }
  const delay = u16(ram.u16(rec + 0x26) - 1);            // $24A150
  ram.setU16(rec + 0x26, delay);
  if (i16(delay) >= 0) return 'waiting';                 // $24A154

  const d = deathSide(p2);
  const keepState = ram.u16(rec) & 0x2000;               // $24A172/$24A174
  const formation = ram.u16(rec + P.optFormation);       // $24A17C
  let keep20 = 0, keep22 = 0;
  if (formation & 0x0002) {                              // $24A180
    if (formation === 6 || ram.u16(0x813098) !== 0) {
      keep22 = ram.u16(rec + 0x22);
      if (keep22 !== 0) keep22 = u16(keep22 - 2);
    }
    keep20 = ram.u16(rec + 0x20);
    if (keep20 !== 0) keep20 = u16(keep20 - 2);
  } else if (formation & 0x0004) {                       // $24A1AC
    if (ram.u16(0x813098) !== 0) {
      keep20 = ram.u16(rec + 0x20);
      if (keep20 !== 0) keep20 = u16(keep20 - 2);
    }
    keep22 = ram.u16(rec + 0x22);
    if (keep22 !== 0) keep22 = u16(keep22 - 2);
  }
  let keep25 = ram.u8(rec + 0x25);                       // $24A1CC
  if (ram.u16(d.activeSave) === 0) {                     // $24A1D0
    const cap = (ctx.rom.u8(DEATH.formationCaps
      + i16(u16(formation - 2))) * 2) & 0xff;             // $24A1D4..$24A1E4
    if (keep25 < cap) keep25 = (keep25 + 1) & 0xff;       // $24A1E6..$24A1EA
  }

  for (let n = 0; n <= 0x30; n++) {                      // $24A1EC..$24A1F4
    ram.setU16(rec + n * 2, 0);
  }
  ram.setU16(rec, keepState);                            // $24A1F8
  ram.setU16(rec + P.optFormation, formation);           // $24A1FA
  ram.setU16(rec + 0x20, keep20);                        // $24A1FE
  ram.setU16(rec + 0x22, keep22);                        // $24A202
  ram.setU8(rec + 0x25, keep25);                         // $24A206
  ram.setU16(rec, ram.u16(rec) & 0x7fff);                // $24A20A

  const idx = ram.u8(slot + 0x07);                       // $24A210
  armRequest25FF38(ram, idx, 1);                        // $24A214 -> $26080A -> $25FF38
  queueKill(ram, ram.u32(slot + ALLOC.idOff));           // $24A21A -> $241292
  ctx.deathEvent?.('reset', p2 ? 2 : 1, keep20, keep22, keep25);
  return 'reset';
}

/**
 * The two player OBJECTS, `$240F62[2]` = `$2491C0` and `[3]` = `$249246`. Two
 * routines, identical in shape, differing only in the constants below, which is
 * why they are a table here rather than two functions.
 */
const PLAYER_OBJECT = [
  { p2: false, rec: RAM.player1, opt: RAM.p1Options,
    liveBit: 1,                 // $2491CC ori.w #$1,$813090
    bonus: 0x8128f4,            // A3
    powerList: 0x8127e4,        // A4
    d4: 0x812930, d6: 0x81292c, // $2491F0 / $2491F6
    srcA: 0x813084, srcB: 0x813088,          // -> ($58,A6) / ($5a,A6)
    chainFrom: 0x81b5b8, chainTo: 0x81b5e0,  // $253A1E
    fresh: [[0x812910, 0], [0x812914, 2], [0x812916, 2]],
    freshLong: 0x81291c, freshWord: 0x812924 },
  { p2: true, rec: RAM.player2, opt: RAM.p2Options,
    liveBit: 2,                 // $249252 ori.w #$2
    bonus: 0x812902,
    powerList: 0x8127ec,
    d4: 0x812932, d6: 0x81292e,
    srcA: 0x813086, srcB: 0x81308a,
    chainFrom: 0x81b5e2, chainTo: 0x81b60a,  // $253A3A
    fresh: [[0x812912, 0], [0x812918, 2], [0x81291a, 2]],
    freshLong: 0x812920, freshWord: 0x812926 },
];

// ===========================================================================
// W297 -- `$2532B6`, THE SET/BONUS PANEL'S BODY: A FIVE-ROW BAR IN THREE SEGMENTS
// ===========================================================================
// `setPanel2603B0` below has counted this since the wave that wrote it, on the grounds
// that it is "a `$240E1A` plus four `$240DC2` calls, i.e. the DEFERRED text path". Both
// printers have been ported since W116, so the only thing actually missing was the
// arithmetic that decides HOW MANY of each row to draw. It is this:
//
//   2532b6  P1: D1 = $0000, D4 = $02D8000A, D7 = $0100, A6 = $8103E6
//   2532d0  P2: D1 = $1B00, D4 = $02D8008A, D7 = $FE00, A6 = $810448
//   253310  D0 = 8, D2 = 2, D3 = 0, D5 = 2 / jsr $240E1A      the header
//   253322  add.w D7,D1
//   253324  tst.w D7 / bmi / add.w D7,D7        <- **D7 DOUBLES IF NON-NEGATIVE**
//   25332a  D3 = 1 / D6 = 5
//   25332e  D5 = ($25,A6) / D6 -= D5           D6 = 5 - ($25,A6)
//   253336  swap D5 / D5.b = ($24,A6)          D5 = (($25,A6) << 16) | ($24,A6)
//   25333c  beq $253356
//     LOOP A  $02CC000A, and `subi.l #$10001,D5` decrements BOTH HALVES at once
//             while `tst.w D5` tests only the low one
//   253356  swap D5 / subq.w #1,D5 / bcs
//     LOOP B  $02C0000A, dbra
//   25336e  tst.b D6 / bmi
//     LOOP C  $02C6000A, dbra
//   253384  $02D2000A / jsr $240DC2            the closer
//
// **THE THREE RUNS ARE `($24,A6)`, `($25,A6) - ($24,A6)` AND `5 - ($25,A6)` + 1, WHICH SUM
// TO SIX** -- measured across five threshold pairs, and six every time. So this is ONE
// six-row bar cut into three coloured segments by two thresholds the player record carries,
// plus a closer: a progress indicator, not three independent lists. A port that read the
// loops as unrelated would draw a variable number of rows.
//
// The SIX is `moveq #$5,D6` with `dbra`, which runs the body six times -- **exactly the
// fact W276 recorded for `$2533F6`'s own `moveq #$5,D7`** ("moveq #$5,D7 with dbra is SIX
// passes"). The first draft of this comment said the runs sum to five; measuring them said
// six, and the reason was a trap this file's neighbour had already written down.
//
// The `subi.l #$10001,D5` is the trick that makes it work in one register: loop A counts
// the low half down to zero and takes the SAME amount off the high half, so loop B's
// length is already `($25,A6) - ($24,A6)` when it swaps back. Modelling the two halves
// separately is fine; modelling them as one long and forgetting the high half is not.
//
// AND `$2533F6`'s D7 REALLY WAS DEAD, WHILE THIS ONE IS NOT. W276 recorded that
// `move.w #$100,D7` before `$2533F6`'s `jsr $240E1A` is overwritten at `$240E44` and
// therefore dead. That is still true there. **Here the same constant is the ROW STEP**:
// `$253322 add.w D7,D1` uses it after the call, and `$253324`'s `bmi` doubles it only for
// P1 -- so P1 steps `+$200` and P2 `-$200`, matching the hardcoded steps in `$2533F6`/
// `$253448` but derived. Two routines, the same immediate, one dead and one load-bearing.
const PANEL_SIDES = Object.freeze([
  Object.freeze({ site: 0x2532b6, d1: 0x0000, top: 0x02d8000a, step: 0x0100 }),
  Object.freeze({ site: 0x2532d0, d1: 0x1b00, top: 0x02d8008a, step: 0xfe00 }),
]);
const PANEL_TILES = Object.freeze({
  runA: 0x02cc000a,      // $25333E
  runB: 0x02c0000a,      // $25335C
  runC: 0x02c6000a,      // $253372
  closer: 0x02d2000a,    // $253384
});
/** The two thresholds, on the PLAYER record. */
const PANEL_LO = 0x24;   // $253338 move.b ($24,A6),D5
const PANEL_HI = 0x25;   // $253330 move.b ($25,A6),D5
// $25332C moveq #$5,D6. FIVE as an immediate, SIX passes through `dbra` -- the two
// numbers are both correct and mean different things, so the constant keeps the
// ROM's value and the `<=` in loop C is where the extra pass comes from.
const PANEL_ROWS = 5;

/**
 * `$2532B6` (P1) / `$2532D0` (P2) -- the SET/bonus panel's five-row bar.
 *
 * @param rec the PLAYER record, `$8103E6` or `$810448`
 * @returns {{runA:number,runB:number,runC:number}} the three segment lengths, for a test
 */
export function setPanelBody2532B6(ram, who, rec) {
  const s = PANEL_SIDES[who === 0 ? 0 : 1];
  let d1 = s.d1;
  // $25331C -- the header, through the STRIDE printer, with D5 = 2 and D3 = 0.
  txPrint240E1A(ram, 8, d1, 2, 0, s.top, 2);
  d1 = u16(d1 + s.step);                                  // $253322 add.w D7,D1
  // $253324 tst.w D7 / bmi / add.w D7,D7 -- doubled only when NON-NEGATIVE.
  const step = (s.step & 0x8000) !== 0 ? s.step : u16(s.step + s.step);

  const hi = ram.u8(rec + PANEL_HI);                      // $253330
  const lo = ram.u8(rec + PANEL_LO);                      // $253338
  // $253334 sub.b D5,D6 -- a BYTE subtract, so it wraps rather than going negative, and
  // $25336E's `tst.b D6 / bmi` is what catches an ($25,A6) above 5.
  const d6 = (PANEL_ROWS - hi) & 0xff;

  // LOOP A: ($24,A6) rows, and it takes the same amount off the high half.
  let runA = 0;
  for (let n = lo; n !== 0; n = (n - 1) & 0xffff) {        // $25333C beq / $253354 bne
    txPrint240DC2(ram, 8, d1, 2, 1, PANEL_TILES.runA);     // $253344
    d1 = u16(d1 + step);                                  // $25334A
    runA++;
  }
  // LOOP B: what is LEFT of ($25,A6) after loop A took its share.
  const left = u16(hi - runA);
  let runB = 0;
  if ((left & 0x8000) === 0 && left !== 0) {               // $253358 subq / bcs
    for (let n = 0; n < left; n++) {                       // dbra
      txPrint240DC2(ram, 8, d1, 2, 1, PANEL_TILES.runB);   // $253362
      d1 = u16(d1 + step);
      runB++;
    }
  }
  // LOOP C: 5 - ($25,A6), and `tst.b D6 / bmi` skips it when that wrapped negative.
  let runC = 0;
  if ((d6 & 0x80) === 0) {                                 // $25336E tst.b / bmi
    for (let n = 0; n <= d6; n++) {                        // dbra runs D6+1 times
      txPrint240DC2(ram, 8, d1, 2, 1, PANEL_TILES.runC);    // $253378
      d1 = u16(d1 + step);
      runC++;
    }
  }
  txPrint240DC2(ram, 8, d1, 2, 1, PANEL_TILES.closer);      // $25338A
  return { runA, runB, runC };
}

/** `$2603B0`, jump-table entry 9 of `$25FF7A`: the SET/bonus panel, which the
 *  player object's own INIT arms through `$260846`. `$2534F8`/`$253522` fork on
 *  the stock, the record's bit 6 and the bonus word, and BOTH arms reach
 *  `$2532B6` -- **which W297 ported**, so the panel now draws. */
export function setPanel2603B0(ram, ctx, a6) {
  const p2 = ram.u8(a6 + 0x17) !== 0;                 // $2603B0 tst.b ($17,A6)
  const c = PLAYER_OBJECT[p2 ? 1 : 0];
  const stock = p2 ? 0x81b65e : 0x81b65c;             // $2534F8 / $253522
  const both = ram.u16(stock) !== 0                   // $2534FE bne
    || (!ram.btst8(c.rec, 6) && ram.u16(c.bonus) !== 0);  // $253500 / $253508
  // W297: $2532B6 is no longer a note. Both arms of $2534F8/$253522 reach it, so it runs
  // either way; `both` only decides whether the SET-item HUD row goes with it.
  setPanelBody2532B6(ram, p2 ? 1 : 0, c.rec);         // $253516 bsr / $25351E bra
  if (both) {
    ctx?.unportedLog?.note(p2 ? 0x2534ac : 0x25349a, '$253516 also takes the '
      + 'SET-item HUD row, the same counted draw items.js defers');
  }
  ram.setU16(a6, 0);                                  // $2603C8
  ram.setU16(a6 + 0x02, 0);                           // $2603CC
}

/**
 * `$2491C0` / `$249246` -- ONE FRAME OF THE PLAYER OBJECT, including the
 * ONE-TIME INIT the port did not have until W231.
 *
 * `$2491D4 bset #0,$3(a5) / bne $2494FA` is the whole gate: a player object runs
 * this init on its FIRST frame and `updatePlayer` on every frame after. The
 * seeded corpus never needed it (the seed's own player object already has the bit
 * set and its record filled) but a NEWLY CREATED one does, and W228 made those
 * real: a respawn stages a fresh type-2 object whose record was left with no
 * position at all, `posY` 0, below its own `$800` clamp.
 *
 * The init ends `$2494DC bra $249E4E`, the TAIL and not the movement: on its
 * first frame a player object sets its record up and draws, and does not move.
 */
export function playerObject2491C0(ram, slot, slotIndex, ctx) {
  const c = PLAYER_OBJECT[ram.u8(slot + 0x07) !== 0 ? 1 : 0];
  const rec = c.rec;
  ram.setU16(0x813090, ram.u16(0x813090) | c.liveBit);   // $2491CC ori.w
  if (ram.bset8(slot + 0x03, 0)) {                       // $2491D4 bset/bne
    return updatePlayer(ram, slot, slotIndex, ctx);      // $2494FA
  }
  const rom = ctx.rom;
  const fresh = ram.u8(slot + 0x06) === 0;               // $249212 tst.b ($6,A5)
  ram.setU16(rec + 0x58, ram.u16(c.srcA));               // $2491FC
  ram.setU16(rec + 0x5a, ram.u16(c.srcB));               // $249204
  for (let a = c.chainFrom; a < c.chainTo; a += 2) ram.setU16(a, 0);  // $253A1E

  if (fresh) {                                           // $249216 bne $2492C8
    for (const [at, v] of c.fresh) ram.setU16(at, v);    // $24921A..$249228
    ram.setU32(c.freshLong, 0x001c3c5c);                 // $249230
    ram.setU16(c.freshWord, 0x0101);                     // $24923A
  }

  // ---- $2492C8, and from here the two routines are the same instructions.
  ram.setU16(c.opt, 0x8000);                             // $2492C8 move.w #$8000
  for (const at of [0x812970, 0x81296e, 0x812972]) ram.setU16(at, 0);  // $2492CC..
  // $2492E0: the template's FIRST word is OR-ed into the state word; its other
  // forty-eight are copied only on a fresh object.
  ram.setU16(rec, ram.u16(rec) | rom.u16(0x24915e));     // $2492E4/$2492E8
  const keep58 = ram.u32(rec + 0x58);                    // $2492EA move.l
  const keep20 = ram.u32(rec + 0x20);                    // $2492EE
  const keep25 = ram.u8(rec + 0x25);                     // $2492F2
  if (fresh) {                                           // $2492F6 tst.b/bne
    for (let w = 0; w < 48; w++) {                       // $2492FE moveq #$2F
      ram.setU16(rec + 0x02 + w * 2, rom.u16(0x249160 + w * 2));
    }
  }
  ram.setU32(rec + 0x58, keep58);                        // $249306
  ram.setU8(rec + 0x57, ram.u8(slot + 0x07));            // $24930A

  let skipRest = !fresh;                                 // $249310 tst.b/bne
  if (fresh) {
    ram.setU16(c.bonus + 0x00, 0);                       // $24931A
    ram.setU32(c.bonus + 0x02, 0);                       // $24931E
    ram.setU32(c.bonus + 0x06, 0);                       // $249322
    ram.setU16(c.bonus + 0x0a, 0);                       // $249326
    ram.setU16(c.bonus + 0x0c, 0);                       // $24932A
    const pair = 0x2551fa + i16(u16(ram.u16(rec + 0x5a) - 2));  // $24932E..$249334
    const byte0 = rom.u8(pair);                          // $24933C move.b (a0)+,d0
    ram.setU8(rec + 0x24, byte0);                        // $24933E
    ram.setU8(rec + 0x25, rom.u8(pair + 1));             // $249342
    if (ram.u16(c.d6) !== 0) {                           // $249346 tst.w d6/beq
      ram.setU32(rec + 0x20, keep20);                    // $24934A
      ram.setU8(rec + 0x24, keep25);                     // $24934E
      ram.setU8(rec + 0x25, keep25);                     // $249352
      skipRest = ram.u16(c.d4) !== 0;                    // $249356 tst.w d4/bne
    }
    if (!skipRest) {
      ram.setU8(rec + 0x24, byte0);                      // $24935A
      ram.setU8(rec + 0x25, byte0);                      // $24935E
      ram.setU32(rec + 0x20, 0);                         // $249362/$249364
      const off = powerListOffset(ram, rec);             // $249368..$249376
      ram.setU32(c.powerList, rom.u32(POWER.lists + off));         // $24937E
      ram.setU32(c.powerList + 4, rom.u32(POWER.lists + off + 4)); // $249382
    }
  }

  // ---- $249388, common again: arm dispatcher request 9 for this side.
  armRequest25FF38(ram, ram.u8(slot + 0x07), 9);         // $24938E jsr $260846
  if (ram.u16(0x803926) !== 0) {                         // $249394 tst.w/beq
    // $24939E: the config arm. Untaken on the corpus ($803926 is 0) and
    // translated as written: the $812E8E word lands in BOTH power words and is
    // ADDED to the two list cursors, then five stock grants -- and all five go to
    // the P1 routine $2530BE even on P2, which is the cartridge's own asymmetry.
    const d1 = ram.u16(0x812e8e);                        // $2493A0
    ram.setU16(rec + 0x20, d1);                          // $2493A6
    ram.setU16(rec + 0x22, d1);                          // $2493AA
    const off = powerListOffset(ram, rec);               // $2493AE..$2493BC
    ram.setU32(c.powerList, (rom.u32(POWER.lists + off) + d1) >>> 0);
    ram.setU32(c.powerList + 4, (rom.u32(POWER.lists + off + 4) + d1) >>> 0);
    for (let n = 0; n < 5; n++) collectHyperStock(ram, ctx, false);  // $2493D4..
  }

  ram.setU8(rec + P.invuln, 0xf0);                       // $2493F2 move.b #$F0
  // $2493F8: the four-field opener, chosen by the OBJECT's own side byte.
  const open = ram.u8(slot + 0x07) === 0 ? 0x2551da : 0x2551e2;
  ram.setU32(rec + 0x02, rom.u32(open));                 // $24940A
  ram.setU16(rec + 0x1c, rom.u16(open + 4));             // $24940E
  ram.setU8(rec + 0x54, rom.u8(open + 6));               // $249412
  ram.setU8(rec + 0x55, rom.u8(open + 7));               // $249416
  ram.setU8(rec + 0x3b, ram.u8(rec + P.dirLatch));       // $24941A
  ram.setU8(rec + 0x56, ram.u8(rec + 0x54));             // $249420
  // $249426/$24942C -- THE POSITION, and the whole reason a respawned ship had
  // none: it comes from the OBJECT record its creator filled, not the template.
  ram.setU16(rec + P.posY, ram.u16(slot + 0x08));        // $249426
  ram.setU16(rec + P.posX, ram.u16(slot + 0x0a));        // $24942C
  const anim = 0x2551ea + u16(ram.u16(rec + 0x58) * 4);  // $249432..$249440
  ram.setU32(rec + P.animA, rom.u32(anim));              // $249442
  ram.setU32(rec + 0x10, rom.u32(anim + 4));             // $249446

  // ---- $24944A..$2494A6 -- THE $500000 LATCH, and it chooses the ship's SPEED.
  const d0 = u16(ram.u16(rec + 0x5a) - 2);               // $24944A/$24944E
  ctx.prot.setSlot(3, d0);                               // $249460 $246D04(3, d0)
  ctx.prot.setSlot(4, d0);                               // $249474 $246D04(4, d0)
  ctx.prot.sum(3, 4, 4);                                 // $249490 $246EA4(3,4,4)
  const got = ctx.prot.readSlot(4);                      // $2494A0 $246CAC(4)
  const short = ram.u16(rec + 0x58);                     // $2494AE move.w
  const iSpeed = u16(got + short);                       // $2494B2 add.w d2,d0
  const iRamp = u16(u16(got * 2) + u16(short * 2));      // $2494AC/$2494B4/$2494B6
  // $2494C0: the SAME byte reaches ($1a,A6) and ($39,A6) -- `move.b (a0),$1a`
  // does not advance the pointer and `move.b (a0)+,$39` does.
  ram.setU8(rec + P.speedIdx, rom.u8(0x255200 + iSpeed));       // $2494C0
  ram.setU8(rec + P.baseSpeed, rom.u8(0x255200 + iSpeed));      // $2494C4
  ram.setU8(rec + P.laserFloor, rom.u8(0x255200 + iSpeed + 1)); // $2494C8
  ram.setU16(rec + 0x2c, rom.u16(0x2552c4 + iRamp));     // $2494D4
  ram.setU16(rec + 0x36, rom.u16(0x2552c4 + iRamp + 2)); // $2494D8

  ctx.deathEvent?.('player-init', c.p2 ? 2 : 1,
    ram.u16(rec + P.posY), ram.u16(rec + P.posX));
  return tail249E4E(ram, rec, ctx);                      // $2494DC bra $249E4E
}

/** `$249368..$249376` and `$2493AE..$2493BC`, the same six instructions twice:
 *  `((($5a,A6) - 2) * 2 + ($58,A6))` and then times four -- a longword PAIR index
 *  into `$25520C`'s twelve entries. */
function powerListOffset(ram, rec) {
  let d0 = u16(u16(ram.u16(rec + 0x5a) - 2) * 2);
  d0 = u16(d0 + ram.u16(rec + 0x58));
  return u16(u16(d0 * 2) * 2);
}

/** `$25FF38` -- write D1.W into the record selected by D0.W and clear its
 *  `+2` state word. Any zero low word selects `$8130FA`; any nonzero low word
 *  selects `$81311E`. `$260846` is `move.w #$9,D1 / jmp $25FF38`. */
export function armRequest25FF38(ram, d0, d1) {
  const entry = (d0 & 0xffff) === 0 ? 0x8130fa : 0x81311e; // $25FF38..$25FF44
  ram.setU16(entry, u16(d1));                              // $25FF4A move.w D1,(A0)
  ram.setU16(entry + 0x02, 0);                             // $25FF4C clr.w ($2,A0)
  return entry;
}

// ---------------------------------------------------------------------------
// `$25FFA8` -- THE RESPAWN. **W446 MOVED IT, IT DID NOT DELETE IT.**
//
// W228 ported `$25FFA8..$260054` here as `respawn25FFA8` and W289 ported THE SAME
// FIFTY-EIGHT INSTRUCTIONS into `tally.js` as `bonusLine125FFA8`. Both readings of
// the routine are true -- `$25FF52[1]` is `$25FFA8`, and request 1 is posted both by
// `$24A210` on a death (a respawn) and by the tally's poster (bonus line 1) -- but
// the cartridge has ONE routine, and two transcriptions of one routine is a defect
// that drifts. It did: for 157 waves this copy had `$26002E move.l D0,($18,A6)` and
// the LIVE one, the one `tallyDriver25FF7A` case 1 actually runs, did not.
//
// **THE SURVIVOR IS `tally.js bonusLine125FFA8`**, because that is the file the live
// dispatcher lives in and this copy had no production caller at all. It carries this
// copy's `deathEvent` reporting and its `$26002E` store; `tests/w228respawn.test.js`
// is unchanged in what it asserts and now aims at the survivor.
//
// `armRequest25FF38` above is what puts a side ON that line, and it stays here.
// ---------------------------------------------------------------------------

/**
 * $2494FA -- one frame of the player.
 * @param ctx {{tables, unportedLog, wallHits}}
 */
export function updatePlayer(ram, slot, slotIndex, ctx) {
  const idx = ram.u8(slot + 0x07);                   // ($7,A5)
  const rec = idx === 0 ? RAM.player1 : RAM.player2;
  const { tables, unportedLog } = ctx;

  ram.setU8(rec + P.playerIdx, idx);                 // $2494FA

  // $249500 btst #0,(A6) / bne $24A130 -- the death/respawn arm.  (A6) is a
  // BYTE test here (`btst #n,<mem>` is always byte-sized), so this is bit 0 of
  // $8103E6, the HIGH byte of the state word.
  if (ram.btst8(rec + P.state, 0)) {
    return playerDead24A130(ram, slot, rec, ctx, idx !== 0);
  }
  // $249508 tst.w $812972 / bne $24A3A2 -- **THE STAGE-CLEAR ARM.**
  // W62 (S1) makes this real.  `$812972` has exactly two writers in build B:
  // `$242968 move.w #$1,$812972` -- the stage advance's fourth instruction --
  // and `$28D682 clr.w $812972`, object type 6's state 3.  So this path is
  // ALIVE for exactly the window between `$242952` and the rebuild, and until
  // this wave nothing in the port could set the word: `FROZEN_GLOBALS` still
  // lists it as "seeded and frozen", which was true and is not any more.
  if (ram.u16(0x812972) !== 0) {
    return stageClearPlayer24A3A2(ram, rec, slot, ctx);
  }
  // $249512 bclr #5,(A6) -- again a BYTE op on $8103E6, and note that it is a
  // DIFFERENT BIT from the `ori.w #$20,(A6)` at $2495EA/$24962A, which sets bit
  // 5 of the WORD, i.e. bit 5 of $8103E7.  Ported as written rather than as
  // intended; the two are not the same bit and the port must not "fix" that.
  if (ram.bclr8(rec + P.state, 5)) {                 // $249516 beq
    ram.bclr8(rec + P.flags1, 2);                    // $249518
    ram.setU8(rec + P.speedIdx, ram.u8(rec + P.baseSpeed));  // $24951E
  }
  if (ram.u8(rec + P.invuln) !== 0) {                // $249524 tst.b ($3e,A6)
    ram.bclr8(rec + P.state, 4);                     // $24952A
    if (ram.u8(rec + P.invuln) !== 0xff) {           // $24952E cmpi.b #$ff
      ram.setU8(rec + P.invuln, ram.u8(rec + P.invuln) - 1);   // $249536
    }
  } else {
    ram.setU8(rec + P.dirLatch, ram.u8(rec + 0x3b)); // $24953C
    if (ram.bclr8(rec + P.state, 4)) {               // $249542 bclr #4,(A6)/bne
      // W64 made this reachable: `$2564BA` clears the bomb's invulnerability,
      // and the collision pass sets this bit. W164 follows the complete death
      // initializer and its later `$24A130..$24A21A` reset state. Returning at
      // `$24A12E` would strand the dead object instead of advancing its
      // animation and queuing the deferred kill.
      playerHit249F8A(ram, slot, rec, ctx, idx !== 0);
      return;
    }
  }
  // $24954A andi.w #$ffdf,(A6): clears bit 5 of the WORD (i.e. of $8103E7).
  ram.setU16(rec + P.state, ram.u16(rec + P.state) & 0xffdf);
  if (ram.u8(rec + P.hitTimer) !== 0) {              // $24954E
    ram.setU8(rec + P.hitTimer, ram.u8(rec + P.hitTimer) - 1);
  }

  // $249558..$249584 -- the input, through the accessors $23D16C/$23D186 (P1)
  // or $23D17E/$23D18E (P2).  RAW held into ($18,A6), EDGE into ($19,A6), both
  // truncated to a byte by the `move.b D0,...`.
  const raw = ram.u16(idx === 0 ? RAM.p1raw : RAM.p2raw);
  const edge = ram.u16(idx === 0 ? RAM.p1edge : RAM.p2edge);
  ram.setU8(rec + P.dirByte, raw & 0xff);
  ram.setU8(rec + P.btnByte, edge & 0xff);

  // $249588 moveq #0,D0 / move.l D0,($30,A6) -- ONE longword clears BOTH
  // accumulators.  This is why the clamps can subtract into them below and the
  // result is "the movement that actually happened this frame".
  ram.setU32(rec + P.velY, 0);

  if (ram.u16(0x81296e) !== 0) {                     // $24958E
    ram.setU8(rec + P.dirByte, ram.u8(rec + P.dirByte) & 0x0f);   // $249596
    ram.setU8(rec + P.btnByte, ram.u8(rec + P.btnByte) & 0x0f);   // $24959C
    ram.setU8(rec + P.invuln, 0xff);                              // $2495A2
  }

  // $2495A8 moveq #$f,D0 / and.b ($18,A6),D0 / lea $2552DC,A2
  const nibble = ram.u8(rec + P.dirByte) & 0x0f;
  const angle = tables.angleFor(nibble);
  ram.setU8(rec + P.angle, angle);                   // $2495B4

  let d2, d3;
  if (angle & 0x80) {
    // $2495BA bpl -> not taken: $FF, no direction held.
    tiltDecay(ram, rec);                             // $2495BC bsr $24A42A
    d2 = i16(ram.u16(rec + P.posY));                 // $2495C0 movem.w ($2,A6),D2-D3
    d3 = i16(ram.u16(rec + P.posX));
    // $2495C6 bra $24969C -- straight past the horizontal blocks AND the
    // vertical clamps.  That is not the same as "the clamps do nothing": the
    // stick nibble can be 3 (up+down) or 5..7, which the $2552DC table answers
    // with $FF while bit 0 or bit 1 of ($18,A6) is still SET.  A port that let
    // the vertical clamp run here would clamp on a frame the board does not.
    return finish(ram, rec, d2, d3, ctx, /* skipClamps */ true);
  }

  if (CLAMP_ORDER.value === 'clamp-first') {
    // THE WRONG PORT, on purpose.  Clamp, then move, then store unclamped.
    ram.setU16(rec + P.posY, u16(Math.min(Math.max(
      i16(ram.u16(rec + P.posY)), CLAMP.yMin), CLAMP.yMax)));
    ram.setU16(rec + P.posX, u16(Math.min(Math.max(
      i16(ram.u16(rec + P.posX)), CLAMP.xMin), CLAMP.xMax)));
    const w = tables.vector(ram.u8(rec + P.speedIdx), angle);
    ram.setU16(rec + P.posY, u16(i16(ram.u16(rec + P.posY)) + w.dy));
    ram.setU16(rec + P.posX, u16(i16(ram.u16(rec + P.posX)) + w.dx));
    ram.setU16(rec + P.velY, u16(w.dy));
    ram.setU16(rec + P.velX, u16(w.dx));
    ram.setU16(rec + P.lastVelX, u16(w.dx));
    return finish(ram, rec, i16(ram.u16(rec + P.posY)),
      i16(ram.u16(rec + P.posX)), ctx, true);
  }

  // $2495CA jsr $2417DE -- THE MOVE.  $2417EA tst.w $8130D2 / bne -> zero
  // vector; otherwise $2417F4/$2417F8 add straight into the record.
  let v;
  if (ram.u16(0x8130d2) !== 0) {
    v = { dy: 0, dx: 0 };                            // $2417FE moveq #0,D2/D3
  } else {
    v = tables.vector(ram.u8(rec + P.speedIdx), angle);
    ram.setU16(rec + P.posY, u16(i16(ram.u16(rec + P.posY)) + v.dy));  // $2417F4
    ram.setU16(rec + P.posX, u16(i16(ram.u16(rec + P.posX)) + v.dx));  // $2417F8
  }
  ram.setU16(rec + P.velY, u16(v.dy));               // $2495D0
  ram.setU16(rec + P.velX, u16(v.dx));               // $2495D4
  ram.setU16(rec + P.lastVelX, u16(v.dx));           // $2495D8
  d2 = i16(ram.u16(rec + P.posY));                   // $2495DC -- the MOVED position
  d3 = i16(ram.u16(rec + P.posX));
  return finish(ram, rec, d2, d3, ctx, false);
}

/**
 * `$24A3A2..$24A428` -- THE PLAYER WHILE THE STAGE IS CLEARING.
 *
 * `$24A3A2 bset.b #$2,$1(a6)` is both the action and the once-only latch: the
 * 45-slot wipe below it runs on the FIRST frame of the stage clear and never
 * again, because `bne $24A3D4` sees the bit it just set.
 *
 * **THE WIPE IS THE BEAM.**  `moveq #$2C,D7` + `lea $811F72,A0` + `lea $30(A0)`
 * is 45 records of `$30` bytes -- `src/laser.js`'s own segment table, the one
 * `37-recon-laser` named and W45 ported.  So clearing a stage destroys the beam
 * the player is firing, exactly as `$25270C` does when a power-up is collected
 * (W61 5, where it moved `$81B64A` by 24).
 *
 * `$24A3F0 moveq #$4,D0 / cmp.w $813092,D0 / bne $24A412` is a STAGE-5-ONLY arm
 * ($813092 == 4 is the fifth stage), so on stage 1 control always takes
 * `$24A412`: if `$812970` is set -- and `$28D5DC` sets it in type 6's init --
 * the ship is given the constant velocity pair (`$C00`, D7) and flies off.
 * D7 is `$E00` or `$2A00` depending on `($7,A5)`, i.e. on WHICH PLAYER.
 */
function stageClearPlayer24A3A2(ram, rec, slot, ctx) {
  if (!ram.bset8(rec + 0x01, 2)) {                   // $24A3A2 bset.b #$2,$1(A6)
    for (let i = 0; i <= 0x2c; i++) {                // $24A3AC moveq #$2C
      ram.setU16(0x811f72 + i * 0x30, 0);            // $24A3B6 / $24A3B8 lea $30
    }
    // The latch is the whole point of `bne $24A3D4`, so the ONCE is what a
    // gate has to be able to see.  Without this hook a mutation that drops the
    // `bset` wipes the beam every frame of the stage clear and nothing notices.
    ctx.stageEndEvent?.('player-beam-wipe', ram.u8(rec + P.playerIdx));
    ram.setU16(rec, ram.u16(rec) & 0xff3f);          // $24A3C0 andi.w #$FF3F
    ram.setU8(rec + P.invuln, 1);                    // $24A3C4 move.b #$1,$3E
    ram.setU16(rec + 0x2a, 0);                       // $24A3CC
    ram.setU16(rec + 0x34, 0);                       // $24A3D0
  }
  ram.bclr8(rec, 4);                                 // $24A3D4 bclr.b #$4,(A6)
  // $24A3D8/$24A3DC/$24A3E2 -- D7 is the ship's EXIT VELOCITY and it differs
  // per player: `tst.b $7(a5)` is the object record's player index.
  const d7 = ram.u8(slot + 0x07) === 0 ? 0x0e00 : 0x2a00;
  tiltDecay(ram, rec);                               // $24A3E6 bsr $24A42A
  ram.setU8(rec + 0x1a, 0x10);                       // $24A3EA move.b #$10,$1A
  if (ram.u16(0x813092) === 4) {                     // $24A3F0/$24A3F2 cmp.w
    if (u16(ram.u16(rec + P.posY)) < 0x8000) {       // $24A3FA cmpi.w #$8000/bcc
      ram.setU16(rec + 0x1a, 0x3000);                // $24A404 -- a WORD over the
      applyPlayerVector2417DE(ram, rec, ctx);        //   byte $24A3EA wrote
      return;                                        // $24A40A jmp $2417DE
    }
  } else if (ram.u16(0x812970) !== 0) {              // $24A412 tst.w $812970/beq
    // $24A420 `movem.w D2/D7,$2(A6)` -- D2 = $C00 into ($2,A6) and D7 into
    // ($4,A6).  A `movem.w` to memory, so the register ORDER is D2 then D7,
    // low-numbered first, and that is what puts $C00 on the Y word.
    ram.setU16(rec + P.posY, 0x0c00);                // $24A41C/$24A420
    ram.setU16(rec + P.posX, d7);
  }
  tail249E4E(ram, rec, ctx);                         // $24A426 bra $249E4E
}

/** `$2417DE` as the stage-clear arm reaches it: the same movement vector
 *  `updatePlayer` applies, including the `$8130D2` zero-vector gate. */
function applyPlayerVector2417DE(ram, rec, ctx) {
  if (ram.u16(0x8130d2) !== 0) return;               // $2417EA tst.w/bne
  const v = ctx.tables.vector(ram.u8(rec + P.speedIdx), ram.u8(rec + P.angle));
  ram.setU16(rec + P.posY, u16(i16(ram.u16(rec + P.posY)) + v.dy));   // $2417F4
  ram.setU16(rec + P.posX, u16(i16(ram.u16(rec + P.posX)) + v.dx));   // $2417F8
}

/** $2495E2 .. $249E7C: the clamps, the store and the animation tail.
 *  `skipClamps` is the `bra $24969C` from the no-direction path. */
function finish(ram, rec, d2, d3, ctx, skipClamps) {
  const { unportedLog } = ctx;
  const dir = ram.u8(rec + P.dirByte);

  if (!skipClamps) {
    if (dir & (1 << 2)) {                            // $2495E2 btst #2 -- -X
      ram.setU16(rec + P.state, ram.u16(rec + P.state) | 0x20);   // $2495EA ori.w
      tiltRamp(ram, rec, -0x20, -4);                 // $2495EE..$249606
      if (d3 <= CLAMP.xMin) {                        // $249608 cmpi/bhi (unsigned)
        // MOVE PAST, THEN CLAMP, AND GIVE THE OVERSHOOT BACK TO THE ACCUMULATOR.
        d3 -= CLAMP.xMin;                            // $24960E
        ram.setU16(rec + P.velX, u16(i16(ram.u16(rec + P.velX)) - d3));  // $249612
        d3 = CLAMP.xMin;                             // $249616
        ctx.wallHit(ROM.wallHit, 'x min');           // $24961A jsr $261126
      }
    } else if (dir & (1 << 3)) {                     // $249622 btst #3 -- +X
      ram.setU16(rec + P.state, ram.u16(rec + P.state) | 0x20);   // $24962A
      tiltRamp(ram, rec, 0x20, 4);                   // $24962E..$249646
      if (d3 >= CLAMP.xMax) {                        // $249648 cmpi/bcs (unsigned)
        d3 -= CLAMP.xMax;                            // $24964E
        ram.setU16(rec + P.velX, u16(i16(ram.u16(rec + P.velX)) - d3));  // $249652
        d3 = CLAMP.xMax;                             // $249656
        ctx.wallHit(ROM.wallHit, 'x max');           // $24965A
      }
    } else {
      tiltDecay(ram, rec);                           // $249662 bsr $24A42A
    }
  }

  if (skipClamps) { /* $2495C6 bra $24969C */ }
  else if (dir & (1 << 0)) {                         // $249666 btst #0 -- +Y
    if (d2 > CLAMP.yMax) {                           // $24966E cmpi/bls
      d2 -= CLAMP.yMax;                              // $249674
      ram.setU16(rec + P.velY, u16(i16(ram.u16(rec + P.velY)) - d2));   // $249678
      d2 = CLAMP.yMax;                               // $24967C
    }
  } else if (dir & (1 << 1)) {                       // $249682 btst #1 -- -Y
    if (d2 < CLAMP.yMin) {                           // $24968A cmpi/bcc
      d2 -= CLAMP.yMin;                              // $249690
      ram.setU16(rec + P.velY, u16(i16(ram.u16(rec + P.velY)) - d2));   // $249694
      d2 = CLAMP.yMin;                               // $249698
    }
  }

  // ---- $24969C tst.b ($1,A6) / bpl $2496E8 -- **THE KNOCKBACK, AND W65 IS
  // WHAT MADE IT REACHABLE.**  Bit 7 of `$8103E7` measured 0 across the whole
  // corpus for sixty waves because nothing in the port set it; `$249A92 bset
  // #$7,($1,A6)` -- the LASER BOMB's arm -- is the first thing that ever has,
  // and `$2564AA bclr #$7,($1,A0)` (inside `$256468`) clears it at the end.
  //
  // It is TWO effects, and only the first is the ramp:
  //   $2496A2  ($46,A6) -- seeded `$2E` by `$249AA4` and stepped `subq.w #$2`
  //            -- indexes the 24-word ramp `$2552EC` and SUBTRACTS it from the
  //            knock field ($6,A6), which `$23F104` adds to the drawn position.
  //            So the ship is thrown backwards for 24 frames on a curve.
  //   $2496C2  **AND `$812954` COSTS SPEED.**  While the beam bomb is holding
  //            a pool-B target (`src/bomb.js` `$2457E2`), the ship loses `$48`
  //            of velocity AND `$48` of this frame's Y every frame -- so the
  //            ship is dragged while the beam is locked on.  That word is the
  //            LASER BOMB's own, which is why this arm could not fire before.
  if (ram.i8(rec + P.flags1) < 0) {
    if (ram.u16(rec + 0x46) !== 0) {                 // $2496A2 tst.w / beq
      const idx = ram.u16(rec + 0x46);               // $2496A8 move.w ($46,A6)
      const d0 = ctx.rom.u16(0x2552ec + i16(idx));   // $2496B2 (A0,D0.w)
      ram.setU16(rec + P.knock, u16(ram.u16(rec + P.knock) - d0));  // $2496B6
      ram.setU16(rec + 0x5e, d0);                    // $2496BA move.w D0
      ram.setU16(rec + 0x46, u16(idx - 2));          // $2496BE subq.w #$2
    }
    if (ram.u16(0x812954) !== 0) {                   // $2496C2 tst.w / beq
      ram.setU16(rec + P.velY,
        u16(ram.u16(rec + P.velY) - 0x48));          // $2496CA subi.w #$48
      d2 = u16(d2 - 0x48);                           // $2496D0 subi.w #$48,D2
    }
    if (d2 < 0x800) {                                // $2496D4 cmpi.w / bcc
      ram.setU16(rec + P.velY,
        u16(ram.u16(rec + P.velY) + u16(0x800 - d2)));  // $2496DA..$2496E0
      d2 = 0x800;                                    // $2496E4 move.w #$800
    }
  }

  ram.setU16(rec + P.posY, u16(d2));                 // $2496E8 movem.w D2-D3,($2,A6)
  ram.setU16(rec + P.posX, u16(d3));

  // $2496EE..$24970A -- a SECOND write to the X word, after the store.  Never
  // observed to fire (wave 2's write map has no $24970A writer over 2,600
  // frames), so one of the two guards always held; ported as written.
  if (ram.u16(0x81308c) === 0 && !ram.btst8(rec + P.flags1, 5)) {
    ram.setU16(rec + P.posX,
      u16(i16(ram.u16(rec + P.posX)) - i16(ram.u16(0x813176))));
  }

  // $2497AA .. $249E4C -- bomb, hyper, shot and laser.
  // Wave 4 stopped at the FIRST instruction of the shot branch; wave 5 carries
  // the shot CADENCE MACHINE ($249B2C..$249BE2) and stops at the spawn.
  // ($57,A6) is written by $2494FA from ($7,A5); re-read here because
  // `finish` is a separate function and the ROM's A5 is long gone.
  bombAndShotGuards(ram, rec, ctx, ram.u8(rec + P.playerIdx) & 1);

  // $249E4E -- the tail.  TWO tilt-indexed longs, and WAVE 4 NAMED BOTH OF THEM
  // WRONG.  Only the first is animation.
  //
  //   $249E62 move.l (A0,D0.w),($a,A6)   A0 = $25533A[shipType] = $255362
  //                                      -> hardware words 2 and 3: THE IMAGE.
  //                                      MEASURED $1200..$1840 in steps of $64.
  //   $249E78 move.l (A0,D0.w),($14,A6)  A0 = $2553CA[0] = $2553F2
  //                                      -> ($14,A6)/($16,A6), which $2459D0
  //                                      reads as the X HALF-EXTENTS OF THE
  //                                      SHIP'S HITBOX.  It is not an animation
  //                                      at all; it is the number the whole game
  //                                      is about, and the port has been writing
  //                                      it under an animation's name since
  //                                      wave 4 (10-recon-combat §3).
  //
  // MEASURED, $2553F2, all 17 entries (+X / -X): (0000,0080) at tilt -$20,
  // (0080,0080) at 0, (0080,0000) at +$20 -- so banking left narrows the box on
  // the right and vice versa.  Build A's twin table $1549AE holds $00C0 where
  // this holds $0080: Black Label's horizontal hitbox is exactly 2/3 of the
  // original's, 4 px against 6.
  tail249E4E(ram, rec, ctx);
}

/** `$249E4E..$249E7C` and the shadow -- THE PLAYER'S TAIL, and it is a real
 *  branch target and not just the end of `finish`: `$24A400 bcc $249E4E`,
 *  `$24A418 beq $249E4E` and `$24A426 bra $249E4E` all enter HERE, skipping
 *  every clamp above.  W62 lifted it out of `finish` unchanged so the
 *  stage-clear path can reach it without re-running the clamps. */
function tail249E4E(ram, rec, ctx) {
  const { unportedLog } = ctx;
  const t = ctx.tables.anim(ram.u16(rec + P.tilt));
  ram.setU16(rec + P.animA, t.a[0]);                 // $249E62
  ram.setU16(rec + P.animA + 2, t.a[1]);
  // THE WRONG PORT, and it is deliberately separable from the image above: a
  // port that banks the SPRITE and freezes the HITBOX looks completely right on
  // screen and is wrong about every collision.  `hitx-frozen` is red on the
  // hitbox columns and GREEN on bucket 19, which is exactly why the hitbox
  // needed columns of its own rather than being trusted to the picture.
  const h = SHIP_MUTATE.value === 'hitx-frozen' ? ctx.tables.anim(0) : t;
  ram.setU16(rec + P.hitXPlus, h.hitX[0]);           // $249E78, the LONG at +$14
  ram.setU16(rec + P.hitXMinus, h.hitX[1]);          // ...i.e. +$14 and +$16
  // $249E7E onward: the ground-plane shadow emit ($249EA0 -> $23EFC0, bucket 5)
  // and the score BCD block.  WAVE 12 ports the shadow; the rest is W17's and
  // is counted rather than silent.
  //
  // WAVE 12.5's AUDIT CORRECTED THIS NOTE'S ADDRESS.  `drawShipShadow` has FIVE
  // exits -- four gates that are `bne/beq $249EE8` and the fall-through past
  // `$249EE2 jsr $23EFC0` -- and all five land on `$249EE8`, not on `$249F16`.
  // `$249EE8..$249F14` is a chain of five more gates ($80392C, $8130F8 bit 0,
  // $81309C, (A6) bit 6, ($7,A5), $812914) that decide whether the BCD block
  // runs at all, and `$249F4C..$249F88` is P2's copy of it.  The note named
  // only the middle of the region.  Control DOES reach this line on every path
  // -- it was never a quiet return -- but an unported region whose census line
  // understates its own extent is how one becomes invisible.
  drawShipShadow(ram, rec, ctx);
  unportedLog.note(0x249ee8, 'player tail: the five gates $249EE8..$249F14 and '
    + 'the score BCD block behind them ($249F16..$249F88, P1 and P2)');
}

/**
 * `$2497AA..$2497F8` -- **THE AUTO-SHOT**, and it is not the hyper.
 *
 * WAVE 79 PORTS IT AND CORRECTS ITS NAME.  From wave 4 to wave 78 this block
 * was a throw labelled "the $2497BA hyper/auto block", and the queue carried it
 * as "the hyper button".  The listing does not support that reading:
 *
 *   2497AA: tst.b   $80380F        the operator AUTO-SHOT setting (0 or 1;
 *   2497B0: beq.b   $2497FE        $25707A's validator rejects >= 2)
 *   2497B2: btst.b  #$6,$18(A6)    RAW mirror bit 6 = P1 Button 3, HELD
 *   2497B8: beq.b   $2497FE
 *   2497BA: tst.b   $3C(A6)        "the shot arm ran last frame" -- $249B50
 *   2497BE: bne.b   $2497FE        sets it, $249B96 clears it
 *   2497C0: lea     $8104AA,A0     P1's OPTION record...
 *   2497C6: tst.b   $7(A5)
 *   2497CA: beq.b   $2497D2
 *   2497CC: lea     $81050E,A0     ...or P2's
 *   2497D2: bclr.b  #$4,$19(A6)    drop any synthetic edge from last frame
 *   2497D8: bclr.b  #$3,$1(A6)     player flags1 bit 3 = "edge is synthetic"
 *   2497DE: bclr.b  #$3,$1(A0)     option flags1 bit 3 = the pods' copy
 *   2497E4: bchg.b  #$4,$1(A6)     THE DIVIDER
 *   2497EA: bne.b   $2497FE        old bit SET -> this is the off frame
 *   2497EC: bset.b  #$3,$1(A6)
 *   2497F2: bset.b  #$3,$1(A0)
 *   2497F8: bset.b  #$4,$19(A6)    SYNTHESISE THE BUTTON-1 EDGE
 *
 * The hyper is `$249868`, sixteen instructions further on, behind Button 2 and
 * a non-zero `$81B65C`; it is still a throw and this wave does not touch it.
 * Button 3 is not a third weapon and it is not "the super": it is Button 1,
 * emitted by the machine on alternate frames.
 *
 * **THE FALL-THROUGH, AND IT IS THE HALF THAT WAS NEVER READ.**  `$2497F8` does
 * not `bra` anywhere -- it falls into `$2497FE`, the bomb gate, which falls into
 * `$249B2C`, the ship's cadence machine.  So the synthetic edge this block sets
 * in `($19,A6)` is consumed EIGHT INSTRUCTIONS LATER, by `$249B48 btst #4,
 * ($19,A6)`, in the same frame; and bit 3 of `($1,A6)` is consumed by
 * `$249B74 bclr #3,($1,A6)`, whose arm clears the burst counter `($2b,A6)` and
 * spawns immediately instead of running the reload. The option-record copy at
 * `$8104AB` bit 3 is the pods' twin of that, read by `$24C498` in
 * `options.js fireHandshake`. Nothing here is self-contained: every one of the
 * four bits it writes is read by code the port already had.
 *
 * **WHY EVERY OTHER FRAME, exactly.** `bchg` sets Z from the OLD bit, so
 * `$2497EA bne` is taken when bit 4 of `($1,A6)` was ALREADY set. The bit is
 * not a free-running toggle either: `$249B9E bclr #4,($1,A6)` clears it on the
 * cadence machine's no-edge arm. Traced with Button 3 held and Button 1 idle:
 *
 *   frame N   `($3c,A6)`=0, bit4 0->1, edge synthesised, `$249B48` takes the
 *             shot arm, `$249B50` sets `($3c,A6)`=1, `$249B74` finds bit 3 set
 *             -> `($2b,A6)`=0 and a shot spawns
 *   frame N+1 `($3c,A6)`=1 so `$2497BE` skips this block entirely; the real
 *             edge is absent, so `$249B96` clears `($3c,A6)` and `$249B9E`
 *             clears bit 4 again
 *   frame N+2 = frame N
 *
 * -- a shot every two frames, which is what an auto-fire dip is for. The
 * two-frame period is a CONSEQUENCE of three separate instructions in two
 * routines, not a constant anyone can read off a line, which is why porting
 * this block without `$249B9E` already being right would have produced a
 * plausible wrong cadence.
 *
 * **THE DEAD BLOCK ABOVE IT, for whoever reads the listing next.**
 * `$249712..$2497A0` is a SECOND Button-3 path -- `btst #6,($19,A6)`, the EDGE
 * rather than the held bit, stepping `($20,A6)`/`($22,A6)` and the two pointers
 * at `$8127E4` through a four-entry `$2497A2(pc)` table. It is UNREACHABLE in
 * build B: `$24970E bra.w $2497AA` jumps over it unconditionally, and a scan of
 * `$240000..$2A0000` for every `Bcc.b`/`Bcc.w` landing on `$249712` finds none.
 * It is not part of this port and it must not be revived by a future reader who
 * finds it while looking for "the other button-3 handler".
 */
export function autoShot2497AA(ram, rec, dir, playerIdx) {
  // THE WAVE-78 PORT: a `return` where the throw used to be. Kept as a named
  // mutation because "handle it by doing nothing" is the shape of the fix
  // somebody reaches for when a throw is in the way of a demo, and it must have
  // a red half that is reproducible without editing this file.
  if (AUTOSHOT_MUTATE.value === 'autoshot-dropped') return;
  // $2497AA tst.b $80380F / $2497B0 beq $2497FE
  if (ram.u8(0x80380f) === 0) return;
  // WAVE 78's ACTUAL CODE, restored as a mutation: the throw that stopped the
  // owner playing and blocked 69 of `stage1-sweep`'s 71 rungs.  It is here so
  // `playgate.mjs --break autoshot-unported` has a red half -- a playability
  // gate that has never seen a throw is not a playability gate.
  if (AUTOSHOT_MUTATE.value === 'autoshot-unported'
    && (dir & (1 << 6)) && ram.u8(rec + 0x3c) === 0) {
    unreached(ROM.playerBomb, 'the $2497BA hyper/auto block (setting $80380F is '
      + 'on AND mirror bit 6 is held) -- WAVE 78, restored by --break');
  }
  // $2497B2 btst #6,($18,A6) / $2497B8 beq $2497FE -- the RAW held byte, not
  // the edge: auto-shot repeats for as long as the button is down.  Testing the
  // EDGE byte instead fires once per press, which is what a hand-written
  // "rapid fire" would do and is not what this is.
  const held = AUTOSHOT_MUTATE.value === 'autoshot-on-edge'
    ? ram.u8(rec + P.btnByte) : dir;
  if ((held & (1 << 6)) === 0) return;
  // $2497BA tst.b ($3c,A6) / $2497BE bne $2497FE.  ($3c,A6) is written by the
  // cadence machine below -- 1 on its shot arm ($249B50), 0 on its no-edge arm
  // ($249B96) -- so this reads LAST frame's value and is what makes a real
  // Button-1 press suppress the synthesiser rather than doubling with it.
  if (AUTOSHOT_MUTATE.value !== 'autoshot-no-3c-gate'
    && ram.u8(rec + 0x3c) !== 0) return;
  // $2497C0 lea $8104AA,A0 / $2497C6 tst.b ($7,A5) / $2497CC lea $81050E,A0
  const opt = playerIdx === 0 ? RAM.p1Options : RAM.p2Options;
  ram.bclr8(rec + P.btnByte, 4);                         // $2497D2 bclr #4,($19,A6)
  ram.bclr8(rec + P.flags1, 3);                          // $2497D8 bclr #3,($1,A6)
  if (AUTOSHOT_MUTATE.value !== 'autoshot-no-optbit') {
    ram.bclr8(opt + OPT.flags1, 3);                      // $2497DE bclr #3,($1,A0)
  }
  // $2497E4 bchg #4,($1,A6) / $2497EA bne $2497FE.  `bchg8` returns the OLD
  // bit, which is exactly what the 68000's Z is built from; a port that tested
  // the NEW bit would invert the cadence and still fire every other frame --
  // `autoshot-inverted` is that port, and it is red on the FIRST compared frame
  // rather than "half the time", which is the useful thing about pinning phase.
  const old = ram.bchg8(rec + P.flags1, 4);
  if (AUTOSHOT_MUTATE.value === 'autoshot-every-frame') {
    ram.bset8(rec + P.flags1, 4);                        // never let it divide
  } else if (AUTOSHOT_MUTATE.value === 'autoshot-inverted' ? old === 0 : old !== 0) {
    return;
  }
  ram.bset8(rec + P.flags1, 3);                          // $2497EC bset #3,($1,A6)
  if (AUTOSHOT_MUTATE.value !== 'autoshot-no-optbit') {
    ram.bset8(opt + OPT.flags1, 3);                      // $2497F2 bset #3,($1,A0)
  }
  ram.bset8(rec + P.btnByte, 4);                         // $2497F8 bset #4,($19,A6)
  // ...and FALLS THROUGH to $2497FE.  No return value: the whole effect of this
  // routine is the four bits above.
}

/**
 * THE MUTATION HOOK for `$2497AA`, in the shipped file for the reason
 * `CLAMP_ORDER`, `SHIP_MUTATE` and `FIRE_MUTATE` are: a mutation that needs a
 * source edit is a claim about a tree nobody else can reproduce, and
 * `docs/knowledge/03` says a check never seen red is not a check.  `null` is
 * the ROM and the only value shipped.  Drive them with
 * `seedcmp.mjs --break <name>` or `breakage.mjs`.
 *
 *   autoshot-unported     WAVE 78's OWN CODE: the named throw, restored
 *   autoshot-dropped      the block does nothing -- wave 78 minus the throw
 *   autoshot-edge-cached  **THE BUG THIS WAVE ACTUALLY HAD.**  `$249B48` reads
 *                         the copy of ($19,A6) taken BEFORE $2497AA ran, so the
 *                         synthesised edge is invisible to the cadence machine
 *   autoshot-every-frame  `$2497E4`'s divider dropped: fire on every held frame
 *   autoshot-inverted     `$2497EA` branches on the NEW bit, not the old
 *   autoshot-on-edge      `$2497B2` tests ($19,A6) instead of ($18,A6)
 *   autoshot-no-3c-gate   `$2497BA`'s ($3c,A6) suppression dropped
 *   autoshot-no-optbit    `$2497DE`/`$2497F2` dropped -- the OPTION record's
 *                         bit 3, the pods' half of the handshake ($24C498)
 */
export const AUTOSHOT_MUTATE = { value: null };

/**
 * $2497AA .. $249BE2 -- the weapon block, as far as wave 5 translates it.
 *
 * THE BUTTON MAP, measured in wave 4 and re-stated because wave 2 item 5 left
 * it open and it is the whole basis of "all the kinds of weapons":
 *   mirror bit 4 (P1 Button 1) = the SHOT/LASER edge, tested at $249B48
 *   mirror bit 5 (P1 Button 2) = the BOMB, tested at $24980A
 *   mirror bit 6 (P1 Button 3) = AUTO-SHOT: $2497B2 finds the operator byte
 *     $80380F set to $01 and SYNTHESISES a shot edge into ($19,A6) on alternate
 *     frames (`bchg #4,($1,A6)` then `bset #4,($19,A6)`).  So Button 3 is not a
 *     third weapon; it is Button 1 on a 2-frame cadence.
 */
export function bombAndShotGuards(ram, rec, ctx, playerIdx) {
  const { unportedLog } = ctx;
  const dir = ram.u8(rec + P.dirByte);
  // **($19,A6) IS NOT A CONSTANT ACROSS THIS FUNCTION AND CACHING IT WAS THE
  // WAVE-79 BUG.**  Waves 4-78 read the edge byte ONCE here into `btn`, which
  // was harmless only because `$2497AA` was a throw: the auto-shot block WRITES
  // ($19,A6) -- `$2497D2 bclr #4` and `$2497F8 bset #4` -- and the ROM re-reads
  // the byte from memory at `$24980A` and `$249B48`.  A cached copy makes the
  // synthesised edge invisible to the very cadence machine it exists to drive,
  // which reproduces EXACTLY as a port that fires the synthesiser every frame
  // and never spawns: `pf1` sticks at $08 where the board alternates $10/$00,
  // and `p3c` never leaves 0.  MEASURED as that, on stage1-sweep lf2001..2010,
  // before this comment existed.  Read it where the ROM reads it.
  const btnStale = ram.u8(rec + P.btnByte);              // ...the wave-4 read
  autoShot2497AA(ram, rec, dir, playerIdx);              // $2497AA..$2497F8
  /** `($19,A6)` as the ROM reads it -- FROM MEMORY, at the instruction that
   *  reads it. `autoshot-edge-cached` is the wave-4..78 shape. */
  const btn = () => (AUTOSHOT_MUTATE.value === 'autoshot-edge-cached'
    ? btnStale : ram.u8(rec + P.btnByte));
  // $2497FE cmpi.w #$4,$8130CE / bcs $249B2C ; $24980A btst #5,($19,A6)
  //
  // WAVE 13, AND THE NAME WAS WRONG SINCE WAVE 4.  $8130CE is not bomb stock:
  // it is THE DISTANCE CLOCK, the scroll odometer $26132C bumps once per $200
  // of scroll (20-recon-scroll-engine §3).  The instruction is exactly as
  // written and stays -- the board really does gate the bomb on the odometer
  // being >= 4, which is true four frames into any stage -- but until this
  // wave the port FROZE the word at its seeded value (`FROZEN_GLOBALS`), and it
  // now moves every frame because the background object is ported.  So this
  // branch is live for the first time.  The REAL bomb stock is still unlocated
  // (20-plan W28).
  // **WAVE 64 SPLITS ONE NAME INTO TWO WEAPONS.**  From wave 4 to wave 63 the
  // line below threw `THE BOMB ($249814)` for BOTH arms of `$249814`, and
  // `38-recon-bomb-hyper.md` §0.2 is right that a wave which "implements the
  // bomb at $249814" implements the hyper by accident.  `$249814` is Button 2
  // and the weapon is decided EIGHT INSTRUCTIONS LATER, by the hyper stock:
  //
  //   $249864 move.w (A1),D1   A1 = $81B65C (P1) / $81B65E (P2)
  //   $249866 beq.b $2498E2    ZERO  -> THE BOMB   (src/bomb.js, W64)
  //           $249868          NON-0 -> THE HYPER  (src/hyper.js)
  //
  // The `lea` block above the fork is transcribed because the fork READS from
  // it: the two arms load different stock words, different request words and
  // different `$255326`/`$255330` tables.
  if (ram.u16(0x8130ce) >= 4 && (btn() & (1 << 5))) {
    const stock = ram.u16(playerIdx === 0                 // $249820 / $249846
      ? BOMBRAM.hyperStockP1 : BOMBRAM.hyperStockP2);
    if (stock !== 0) {                                    // $249866 beq $2498E2
      requestHyper249868(ram, ctx.rom, ctx, rec, playerIdx !== 0);
    }
    if (stock === 0) {
      const what = fireBomb2498E2(ram, ctx, rec, playerIdx);   // $2498E2
      ctx.bombEvent?.('press', what);
    // **THE TWO EXITS ARE DIFFERENT AND A PORT MUST NOT MERGE THEM.**  A bomb
    // that FIRES ends at `$249B28 bra.w $249E4E`, the player's tail, so the
    // shot cadence machine does not run on that frame.  All THREE refusals
    // (`$2498E6`, `$2498FE`, `$24990A`) branch to `$249B2C`, which IS the
    // cadence machine -- so a press that is refused still shoots.
      if (what.startsWith('fired')) return;               // $249B28 bra $249E4E
    }
  }                                                       // ...else fall to $249B2C
  // $249B2C..$249B3C -- the "power" byte the tail draws from: ($54,A6), or
  // ($55,A6) when bit 0 of ($1,A6) is set, copied into ($56,A6).
  ram.setU8(rec + 0x56, ram.btst8(rec + P.flags1, 0)     // $249B30 btst #0
    ? ram.u8(rec + 0x55) : ram.u8(rec + 0x54));          // $249B38 / $249B2C
  // $249B40 tst.b ($3f,A6) / bne $249E4E
  //
  // **THIS WAS A THROW UNTIL WAVE 45 AND IT IS NOT AN UNPORTED PATH AT ALL.**
  // The instruction is `bne $249E4E` -- a branch to the player's own TAIL,
  // which is the very next thing this function's caller does -- so the arm has
  // always been "skip the shot cadence machine this frame", i.e. a `return`.
  // Calling `($3f,A6)` "the dead flag" and throwing on it was a guess, and the
  // thing that flushed it out is the LASER: `$24C282 move.b #$1,($3f,A4)` sets
  // this byte on the frame the beam's arm-up completes (+16) and
  // `$24C2D6 move.b D0,($3f,A4)` clears it on release, precisely so that the
  // ship stops spawning ordinary shots while it is firing a beam.
  //
  // That also completes `37-recon-laser.md` §3.4's correction. W37 is right
  // that `$81295C` falling to 0 is the shot table DRAINING and not a laser
  // write; what it does not say is WHY nothing refills the table after +16, and
  // this is why -- the cadence machine is switched off at its head, by the
  // laser, on purpose.  The six shots at lf2001..2007 are the pre-arm burst.
  if (ram.u8(rec + P.dead) !== 0) {
    unportedLog.note(0x249b40, 'shot: ($3f,A6) is set -- the cadence machine is '
      + 'skipped ($249B44 bne $249E4E). The LASER sets this byte at $24C282 '
      + 'when its arm-up completes and clears it at $24C2D6 on release');
    return;                                              // $249B44 bne $249E4E
  }

  // THE SHOT CADENCE MACHINE, $249B48..$249BE2.  Ported in wave 5.  This is the
  // part that runs EVERY frame the button is held or released and that decides,
  // per frame, whether a shot is emitted; the emission itself ($249BFC /
  // $249D2C) is not ported and throws below.
  // $249B48 btst #4,($19,A6) -- RE-READ, not the wave-4 cached copy: the
  // auto-shot block above may have just set this bit.
  if (btn() & (1 << 4)) {
    ram.setU8(rec + 0x3c, 1);                            // $249B50
    // $249B56..$249B70: the RELOAD value for the shot counter ($2b,A6).
    //   D0 = ($21,A6), or 8 if bit 0 of ($1,A6) is set;
    //   D0 = ((D0 >> 1) & 6) + ($2d,A6).
    // `lsr.w #1` then `andi.b #6` -- a WORD shift and a BYTE mask, in that
    // order, so bit 0 of the shifted value is discarded and only bits 1-2
    // survive.  Translated as written.
    let d0 = ram.btst8(rec + P.flags1, 0) ? 8 : ram.u8(rec + 0x21);
    d0 = ((u16(d0) >> 1) & 6) + ram.u8(rec + 0x2d);      // $249B66/$249B68/$249B6C
    ram.setU8(rec + 0x2b, d0 & 0xff);                    // $249B70
    if (ram.bclr8(rec + P.flags1, 3)) {                  // $249B74 bclr #3 / beq
      ram.bset8(rec + P.state, 3);                       // $249B7C
      ram.setU8(rec + 0x2b, 0);                          // $249B80 clr.b ($2b,A6)
      // falls through to $249BC2
    } else if (ram.bclr8(rec + P.state, 3)) {            // $249B86 bclr #3,(A6)/beq
      ram.setU8(rec + 0x2a, 1);                          // $249B8C
      unportedLog.note(0x249b8c, 'shot: the $249B92 bra to the tail');
      return;                                            // $249B92 bra $249E4E
    }
  } else {
    // $249B96 -- the no-shot path.
    ram.setU8(rec + 0x3c, 0);                            // $249B96
    ram.bclr8(rec + P.state, 3);                         // $249B9A
    ram.bclr8(rec + P.flags1, 4);                        // $249B9E
    if (ram.u8(rec + 0x2b) === 0) {                      // $249BA4 tst.b/beq
      unportedLog.note(0x249ba4, 'shot: idle, no cadence counter running');
      return;                                            // -> $249E4E
    }
    ram.setU8(rec + 0x2a, (ram.u8(rec + 0x2a) - 1) & 0xff);   // $249BAC subq.b
    if (ram.u8(rec + 0x2a) !== 0) return;                // $249BB0 bne $249E4E
    ram.setU8(rec + 0x2b, (ram.u8(rec + 0x2b) - 1) & 0xff);   // $249BB4
    ram.bset8(rec + P.state, 3);                         // $249BB8
    ram.bset8(rec + P.flags1, 4);                        // $249BBC
  }

  // $249BC2..$249BDE -- the DELAY reload for ($2a,A6).
  let d = ram.u8(rec + 0x2c);                            // $249BC2
  if (ram.btst8(rec + P.flags1, 0)                       // $249BC6 btst #0 / bne
    || (ram.u16(rec + P.shipSel) === 0                   // $249BCE tst.w ($58,A6)
      && ram.u16(rec + 0x20) === 8)) {                   // $249BD4 cmpi.w #$8
    d = 2;                                               // $249BDC moveq #$2,D0
  }
  ram.setU8(rec + 0x2a, d & 0xff);                       // $249BDE

  // $249BE2..$249BF8 -- a two-entry jump table on the SHIP TYPE ($58,A6):
  //   ship 0 -> $249BFC   ship 2 -> $249D2C
  // Both are THE SPAWN.  Wave 8 translates ship 0 (src/shots.js); ship 2 is a
  // named throw, because ($58,A6) was MEASURED 0 on every frame of every run
  // and the exporter only exports selector 0's tables.
  const ship = ram.u16(rec + P.shipSel);                 // $249BE2
  if (ship !== 0) {
    unreached(0x249d2c, `THE SHOT SPAWN for ship type ${ship} ($249BF8 bra `
      + `$249D2C, the second entry of the $249BF4 jump table). TYPE-B was `
      + `never exercised: ($58,A6) is 0 on every frame of every run in this `
      + `corpus, and tools/export-tables.py exports selector 0 only`);
  }
  spawnShot(ram, ctx.rom, rec, ctx, { player: playerIdx });
}
