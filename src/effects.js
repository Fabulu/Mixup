// The two death sequences: the boss's and Batman's.
//
// BOSS.  1:$4EB8 latches a dead boss and stamps $C740 = $FE (src/enemies.js
// kill()). Everything after that is here: 1:$78CC counts $C740 from $FE to
// $80 spawning a scripted explosion every eighth step, 1:$7936 counts $7F to 0
// walking a per-boss pose table, and loc_00_34D0 then runs a four-phase
// victory fanfare. Together that is ~632 frames between the last hit and the
// level actually ending; the port used to hand over on the frame the boss died.
//
// PLAYER.  $C1C0, 8 x 5 B {flags, counterLo, counterHi, screenX, screenY},
// seeded from 0:$2AD7 by sub_00_29E7 and driven by loc_00_2A0D. Eight sparks
// on one scripted path, armed one after another. This is why a death takes
// 452 frames and not the $78 that `deathSequenceFrames` alone gives.
//
// The $C693 effect pool the boss explosions spawn into is NOT here -- it is
// src/doors.js's, ported alongside the door sequencer that also feeds it.
// Importing it rather than keeping a second copy is the whole point: two pools
// would give two OAM orders and two answers to "is a slot free".
//
// MEASURED, not read off the listing (tools/oracle/deathscen.py):
//
//   level 4, boss HP zeroed at gameplay frame 40, ONE driver stall in the run
//     f85   $C740 = $FE            the countdown arms
//     f91   $C740 = $F8, $C713 = 1, $C693 slot 0 = {10 02 80 1E 80 01}
//     f340  $C740 = $00            254 counted steps + the 1 stalled frame
//     f341  $C712 = 1, $C70F = 1, $C74E:$C74F = $8800   the fanfare starts
//     f363  $C712 = 2             23 frames of phase 1
//     f365  $C712 = 3             loc_00_3566's own first wait was f364
//     f399  $FFAC = $8E           the window ramp begins
//     f445  $FFAC = $32           47 ramp frames, then 240 held
//     f719  $C753 = $01           633 frames from the arm, stall-corrected
//
//   level 3, $FF8A zeroed at gameplay frame 40
//     f41   $C712 = $78, $C1C0 seeded from 0:$2AD7, every slot still DORMANT
//     f42   slot 0 flags = $80    slot 0 arms on the first tick
//     f50   slot 1 flags = $80    ... and slot n on tick 1 + 8n thereafter
//     f317  slot 0 parks, counter frozen at $113; slot 7 parks at f373
//     f493  loc_00_2AAD -- 452 ticks of loc_00_2A0D, of which the last 120
//           are the only ones that touch $C712
//
// The $2AFF path table is its own proof: summing its signed nibbles over
// indices 1..$113 gives dx = -79, dy = +24, which takes slot 0 from ($88,$38)
// to ($39,$50) -- byte for byte the final state the cartridge lands in.

import { u8, u16 } from './state.js';
import { drawMetasprite } from './render/metasprite.js';
import { spawnEffect, clearEffects } from './doors.js';

export const BURST_SLOTS = 8, BURST_RECORD = 5;     // $C1C0

/** $C740's idle value. Anything else means a boss died and $4EB8 reroutes. */
export const COUNTDOWN_IDLE = 0xFF;

/** 1:$4EF1 -- the value a dead boss stamps into $C740. */
export const COUNTDOWN_START = 0xFE;

/** ROM: sub_00_29E7 $2A00 -- $C712's seed, and the tail of the death burst. */
const DEATH_TICKS = 0x78;

const PHASE1_STEPS = 0x17;          // $3558: CP $17 -- 23 one-frame steps
const FADE_FRAMES = 0x21;           // sub_00_0A7F: LD B,$21, one $0A4F each
const RAMP_FRAMES = 47;             // $35D0/$363D: $FFAC $8E..$32, step -2
const HOLD_FRAMES = 0xF0;           // $35D8: LD B,$F0

/**
 * loc_00_34D0 after phase 1, as the sequence of whole frames it actually
 * spends. Phase 1 is a per-frame state machine ($350F ends in RET, so the main
 * loop keeps running); everything below BLOCKS inside its own `CALL
 * sub_00_0A4F` loop, so the only faithful model is a frame count.
 *
 *   c712  n    ROM
 *    2     1   $3586, the lone sub_00_0A4F between $3566's two block copies
 *    3    33   $35A9 writes $C712 = 3, then $35CC's fade-IN (C = 2)
 *    3     1   $35CF RET -> the main loop's own $064A tail. loc_00_3566 is the
 *              only blocking half that RETURNS, which is why it costs a frame
 *              that phase 3 does not.
 *    3    47   loc_00_35D0/$363D, the window sliding up two lines a frame
 *    3   240   $35D8, the hold
 *    3    33   $35E5's fade-OUT (C = 1), and then $35E8 never comes back
 *
 * 355 frames plus the terminal one below. MEASURED on level 4: $C712 becomes 1
 * at f341, 2 at f363 and 3 at f365, $FFAC leaves $90 at f399 and parks at $32
 * on f445, and $C753 is written at f719 -- so phase 1 is f341..f363 (23) and
 * the block is f364..f719, with the ramp landing on f364 + 1 + 33 + 1 = f399
 * and ending 46 frames later, exactly.
 */
const FANFARE_STAGES = [
  { c712: 2, n: 1 },
  { c712: 3, n: FADE_FRAMES, fade: true },
  { c712: 3, n: 1 },
  { c712: 3, n: RAMP_FRAMES, ramp: true },
  { c712: 3, n: HOLD_FRAMES },
  { c712: 3, n: FADE_FRAMES, fade: true },
  // sub_00_0A7F's loop body is {maybe step the palette; CALL sub_00_0A4F}, so
  // the wait is the LAST thing each of its 33 frames does and $35E8 runs after
  // the 33rd wait -- one frame further on. MEASURED: the last fade tick is
  // f718 and $C753 is written with no $0A4F between, i.e. in f719.
  { c712: 3, n: 1, finish: true },
];

/**
 * loc_00_360F / $3616 / $3608 -- which $C753 bit each route's last level sets.
 * src/level.js's clearLevel carries the same map for the ROUTING; this copy
 * exists only for the $C740 branch at $3622 vs $362A (see updateVictoryHold).
 */
const ROUTE_BIT = { 4: 0x01, 8: 0x02, 0x0B: 0x04 };

/** loc_00_34E7: level 6 has no fanfare, just sub_00_0A7F(C = 0) and out. */
const FANFARE_STAGES_L6 = [{ c712: 0, n: FADE_FRAMES, fade: true },
                           { c712: 0, n: 1, finish: true }];

/** $34FC-$3507: the fanfare's VRAM cursor starts here and steps by $20. */
const VRAM_DEST_START = 0x87E0;

/** $2A35: the arm threshold, and $2A7F the stagger between slots. */
const ARM_COUNTER = 0x113;
const STAGGER = 0x08;

/** $2A68: `LD A,$10 / CALL sub_00_0BC6` -- the burst draws through OBP1. */
const BURST_ATTR = 0x10;

// ---------------------------------------------------------------------------

export function createEffects() {
  return {
    burst: Array.from({ length: BURST_SLOTS }, () => new Uint8Array(BURST_RECORD)),
    countdown: COUNTDOWN_IDLE,   // $C740
    explosion: 0,                // $C713, the 1:$7A73 cursor
    deathTicks: 0,               // $C712 while the burst runs
    // loc_00_34D0's own state. `phase` is $C712 on the boss side; the ROM
    // multiplexes the SAME byte for both sequences, but they can never run
    // together ($0567 gates the death tick on $C740 == $FF), so keeping them
    // apart here loses nothing and makes each one readable.
    phase: 0,                    // $C712: 0 idle, 1/2/3 as loc_00_34D0
    vramStep: 0,                 // $C70F
    vramDest: 0,                 // $C74E/$C74F
    // FANFARE_STAGES cursor: -1 = not in a blocking stage, else its index.
    stage: -1,
    stages: FANFARE_STAGES,
    hold: 0,                     // frames left in the current blocking stage
    fade: 0,                     // $C70E, so the fade is observable
    done: false,                 // the fanfare has already handed over
    windowRamp: 0x90,            // $FFAC during phase 3 -- see updateVictoryHold
  };
}

/**
 * Accessor. state.js builds the pools now (`effects: createEffects()`), so
 * this is a plain read -- kept because it is threaded through this file and
 * its harnesses, not because it still does anything.
 */
export function effects(state) {
  return state.effects;
}

/**
 * Level init. ROM: $0DC8-$0DCA writes $C740 = $FF beside $C73E, sub_00_29A5
 * clears $C693 ($3C bytes) and $29ED reseeds $C1C0 only when a death starts.
 */
export function resetEffects(state) {
  const e = effects(state);
  clearEffects(state);                              // $29A5: 60 B of $C693
  for (const r of e.burst) r.fill(0);
  e.countdown = COUNTDOWN_IDLE;
  e.explosion = 0;
  e.deathTicks = 0;
  e.phase = 0;
  e.vramStep = 0;
  e.vramDest = 0;
  e.hold = 0;
  e.stage = -1;
  e.stages = FANFARE_STAGES;
  e.fade = 0;
  e.windowRamp = 0x90;
  e.done = false;
}

/** ROM: sub_00_0AE1 -- B is the id, C the mask (docs/03-VERIFICATION.md 32). */
function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) state.sound.queue.push({ id, mask });
}

/** Refuse to guess. A silently absent table would degrade into "no effects". */
function need(state, name, length) {
  const t = state.tables && state.tables[name];
  if (!t || t.length < length) {
    throw new Error(`effects: tables.${name} missing from the manifest ` +
                    `(need ${length} bytes) -- run tools/export_assets.py`);
  }
  return t;
}

// ---------------------------------------------------------------------------
// The $C1C0 death burst
// ---------------------------------------------------------------------------

/**
 * ROM: sub_00_29E7 $29ED-$2A02. Copies 40 bytes of 0:$2AD7 over $C1C0 and
 * seeds $C712 with $78. Every slot starts with flags 0 and counter 0; the X
 * values are $88 $90 $98 $A0 $B0 $B8 $C0 $C8 and every Y is $38.
 *
 * Note what is NOT here: nothing arms a slot. That is the whole reason the
 * sequence is 452 frames and not 121 -- see deathBurstTick.
 */
export function startDeathBurst(state, ticks = DEATH_TICKS) {
  const e = effects(state);
  const init = need(state, 'deathBurstInit', BURST_SLOTS * BURST_RECORD);
  for (let i = 0; i < BURST_SLOTS; i++) {
    for (let b = 0; b < BURST_RECORD; b++) e.burst[i][b] = init[i * BURST_RECORD + b];
  }
  // $2A00: $C712 = $78. Taken as an argument so tunables.deathSequenceFrames
  // (a mod knob) still moves it, and defaulted so a caller need not know.
  e.deathTicks = ticks;
}

/**
 * ROM: loc_00_2A0D, reached from sub_00_29E7's `JR NZ` at $29EB whenever the
 * main loop calls it with $C715 already set ($057A on even frames, $05EC on
 * odd -- once per frame either way, and NOT gated on the pause).
 *
 * Eight slots, three states each:
 *
 *   flags == 0  ($2A75) DORMANT. Slot 0 arms on the first tick; slot n arms
 *               only once slot n-1's counter LOW BYTE has reached 8. That is
 *               the staggered warm-up: slot n arms on tick 1 + 8n, so slot 7
 *               does not start moving until tick 57.
 *   bit 0 clear ($2A25) MOVING. The 16-bit counter increments, then indexes
 *               0:$2AFF for a packed {dy:dx} pair of signed nibbles. Bit 0 is
 *               set once the counter reaches $113 -- hi nonzero AND lo >= $13,
 *               which the table's own length ($2AFF..$2C12 = 276 bytes) makes
 *               exactly its last entry.
 *   bit 0 set   ($2A89) PARKED. Draws in place, and for SLOT 7 ONLY decrements
 *               $C712. Slot 7 parks on tick 333, so the $78 count runs out on
 *               tick 452 -- which is the frame the cartridge reaches $2AAD.
 *
 * @returns true on the tick that reaches loc_00_2AAD
 */
export function deathBurstTick(state, manifest) {
  const e = effects(state);
  const sprites = need(state, 'deathBurstSprites', BURST_SLOTS);
  const path = need(state, 'deathBurstPath', ARM_COUNTER + 1);

  for (let i = 0; i < BURST_SLOTS; i++) {
    const r = e.burst[i];

    if (r[0] === 0) {                               // $2A1D -> loc_00_2A75
      // $2A77: slot 0 has no predecessor and arms unconditionally. Every other
      // slot reads its PREDECESSOR's counter low byte ($2A7A: HL - 4).
      if (i === 0 || e.burst[i - 1][1] >= STAGGER) r[0] = 0x80;   // $2A84
      continue;                                     // $2A6D either way
    }

    if (r[0] & 0x01) {                              // $2A20 -> loc_00_2A89
      if (i === 7) {                                // $2A93: CP $07
        e.deathTicks = u8(e.deathTicks - 1);        // $2A9A
        if (e.deathTicks === 0) return true;        // $2A9E -> loc_00_2AAD
      }
      drawBurst(state, r, sprites[i], manifest);    // $2AA1-$2AA8
      continue;
    }

    // $2A25: the 16-bit counter, incremented BEFORE it is used as the index.
    let c = u16(((r[2] << 8) | r[1]) + 1);
    r[1] = c & 0xFF;
    r[2] = c >> 8;
    // $2A31-$2A39: hi nonzero AND lo >= $13. Only $113 satisfies both before
    // the flag stops the counter, so this fires exactly once, at the table end.
    if ((c >> 8) !== 0 && (c & 0xFF) >= 0x13) r[0] |= 0x01;

    const packed = path[c] ?? 0;                    // $2A3C: HL = $2AFF + BC
    r[3] = u8(r[3] + nib(packed & 0x0F));           // $2A42-$2A4E: low -> X
    r[4] = u8(r[4] + nib(packed >> 4));             // $2A50-$2A5E: high -> Y
    drawBurst(state, r, sprites[i], manifest);      // $2A63-$2A6A
  }
  return false;
}

/** $2A44 / $2A55: a 4-bit field sign-extended by its own bit 3. */
const nib = (v) => ((v & 0x0F) & 0x08 ? (v & 0x0F) - 16 : (v & 0x0F));

/**
 * $2A68: `LD A,$10 / CALL sub_00_0BC6`. The burst's X/Y are already OAM
 * coordinates -- they came out of 0:$2AD7 that way and were never converted --
 * so nothing goes through sub_00_1172 here.
 */
function drawBurst(state, r, id, manifest) {
  const table = manifest && manifest.metasprites && manifest.metasprites.table1;
  if (!table) return;
  drawMetasprite(state, table, id, r[3] - 8, r[4] - 16, BURST_ATTR);
}

// ---------------------------------------------------------------------------
// The boss side: 1:$78CC / 1:$7936
// ---------------------------------------------------------------------------

/**
 * ROM: loc_01_78CC, entered from $4EBD whenever $C740 has left $FF. HL is the
 * record of whichever enemy reached the kill path -- on every boss level that
 * is the boss itself, and MEASURED, $C740 falls by exactly 1 per frame, so no
 * second enemy ever reaches it.
 *
 * FIRST HALF ($C740 >= $80, i.e. $FE down to $80). Decrement, and on every
 * value whose low three bits are clear spawn one scripted explosion: the
 * offset byte is 1:$7A73[$C713], its HIGH nibble displaces X and its LOW
 * nibble Y, both signed, both in whole metatiles, and both added to the
 * enemy's own Xhi/Yhi with the low bytes forced to $80 (cell centre). Then
 * $C713++ and sound $17.
 *
 * SECOND HALF ($7F down to 0) is loc_01_7936: no more explosions, just a
 * per-boss pose walk driven by bits 4-6 of the countdown, and at zero the
 * whole thing jumps to loc_00_34D0.
 *
 * @returns 'screen' (first half -- run loc_01_5CA8), 'tail' (second half --
 *          $60C7, no screen tail) or 'victory' (loc_00_34D0 takes over)
 */
export function bossCountdownTick(state, r) {
  const e = effects(state);

  if (e.countdown >= 0x80) {                        // $78CF: CP $80 -- the test
    const v = u8(e.countdown - 1);                  // $78D3, decided BEFORE it
    e.countdown = v;
    if ((v & 0x07) !== 0) return 'screen';          // $78DA -> loc_01_5CA8
    spawnBossExplosion(state, r);
    return 'screen';                                // $7933 -> loc_01_5CA8
  }

  if (e.countdown === 0) return 'victory';          // $793A: JP loc_00_34D0
  const v = u8(e.countdown - 1);                    // $793D
  e.countdown = v;
  const step = (v & 0x70) >> 4;                     // $7941-$7945

  const st = r[2];                                  // $794A: the STATE byte
  if (st === 0x05) return 'victory';                // $7957: level 6 skips out

  if (st === 0x07 || st === 0x0A) {                 // $794F/$7953
    bossPoseArena(state, r, step);
  } else if (st === 0x09) {                         // $795E -> loc_01_7984
    bossPoseTable(state, r, 'bossDeathPoseB4', true);
  } else {                                          // $7960, the default arm
    // $7973: this arm and ONLY this arm blinks -- the pose is drawn on the
    // frames where $FFB1 bit 3 is set, so eight on, eight off.
    bossPoseTable(state, r, 'bossDeathPoseWalk', (state.frame & 0x08) !== 0);
  }
  // $797E / $799C / $79D5: $C712 is zeroed every frame of the second half,
  // which is what leaves loc_00_34D0's phase byte at 0 when it first runs.
  e.phase = 0;
  return 'tail';                                    // $7981 -> loc_01_60C7
}

/** ROM: $78E3-$7933. */
function spawnBossExplosion(state, r) {
  const e = effects(state);
  const offsets = need(state, 'bossExplosionOffsets', 16);
  const off = offsets[e.explosion] ?? 0;            // $78E5: indexed by $C713
  // $78F8-$7912: the two nibbles are sign-extended by their own bit 3 and
  // added to the enemy's METATILE coordinates; the sub-cell bytes are $80.
  const x = (u8(r[0x0E] + nib(off >> 4)) << 8) | 0x80;
  const y = (u8(r[0x10] + nib(off & 0x0F)) << 8) | 0x80;
  // src/doors.js owns $C693; its spawnEffect is sub_00_0CC2 verbatim.
  spawnEffect(state, x, y, 0x10, 0x01);             // $791E-$7922: D/E
  e.explosion = u8(e.explosion + 1);                // $7926-$792A
  requestSound(state, 0x17, 0x01);                  // $792D: BC = $1701
}

/**
 * ROM: loc_01_79A2 -- bosses 2 and 1 (states 7 and $0A). The pose index is
 * facing * 8 + the countdown step, and boss 2 alone uses a different table AND
 * the other metasprite table ($79C8: sub_00_0BC6 vs sub_00_0BAF).
 */
function bossPoseArena(state, r, step) {
  const boss2 = state.level.bossId === 0x02;        // $79AA / $79C3
  const table = need(state, boss2 ? 'bossDeathPose2' : 'bossDeathPose1', 16);
  r[6] = table[(r[5] & 1) * 8 + step] ?? r[6];      // $79BE: written back
  queue(state, r, !boss2, true);
}

/** ROM: loc_01_7960 (walker/boss-3 default) and loc_01_7984 (state 9). */
function bossPoseTable(state, r, name, visible) {
  const table = need(state, name, 2);
  r[6] = table[r[5] & 1] ?? r[6];                   // $796F / $7993
  queue(state, r, true, visible);                   // both use sub_00_0BAF
}

/**
 * The draw goes onto the enemy queue so it keeps loc_01_5CA8's OAM position;
 * `alt` picks 5:$736B (sub_00_0BAF) over 5:$5F5C (sub_00_0BC6). r[7]/r[8] are
 * deliberately whatever the first half last cached -- the second half never
 * calls the screen tail, and the corpse does not move.
 */
function queue(state, r, alt, visible) {
  if (!visible) return;
  if (!state.enemyDraws) state.enemyDraws = [];
  state.enemyDraws.push({ id: r[6], x: r[7], y: r[8], attr: 0, alt });
}

// ---------------------------------------------------------------------------
// loc_00_34D0 -- the victory fanfare
// ---------------------------------------------------------------------------

/**
 * ROM: loc_00_34D0, called from 1:$7936 once $C740 reaches 0.
 *
 * What the port reproduces is the STATE and the DURATION, not the picture:
 *   $34F6  sound $08 mask $03 (the fanfare replaces the level theme), $C70F 0,
 *          $C74E:$C74F = $87E0, $C712 = 1, then falls straight into phase 1 --
 *          the entry frame IS phase 1's first step.
 *   $350F  23 x { 32 B of 6:$611C[$C70F] into the VRAM queue; cursor += $20 }
 *   $3566  two block copies and a fade-in           -- FANFARE_STAGES
 *   $35D0  the window ramp, the hold and a fade-out -- FANFARE_STAGES
 *   $35E8  the level-clear dispatch, which src/level.js's clearLevel already
 *          owns, so all that happens here is raising flow.levelCleared.
 *
 * The bank-6 tile stream and the raster/LYC program are deliberately NOT
 * modelled: they are the fanfare's artwork, and the port has nothing to show.
 * What IS modelled is every byte the oracle can see move -- $C712, $C70F,
 * $C74E:$C74F, $C70E and $FFAC.
 */
export function victoryStep(state) {
  const e = effects(state);
  if (e.stage >= 0 || e.done) return false;         // updateVictoryHold owns it

  if (e.phase === 0) {                              // $34D0: CP 1/2/3 all fail
    if (state.level.number === 0x06) {              // $34E3: level 6 is special
      // $34E7-$34F3: no fanfare at all. $C70F and $C712 are zeroed, one
      // sub_00_0A7F(C = 0) runs and it jumps straight to $35E8.
      e.vramStep = 0;                               // $34E8
      e.phase = 0;                                  // $34EB
      e.stages = FANFARE_STAGES_L6;
      enterStage(e, 0);                             // $34F0: sub_00_0A7F, C = 0
      return false;
    }
    requestSound(state, 0x08, 0x03);                // $34F6: BC = $0803
    e.vramStep = 0;                                 // $34FC
    e.vramDest = VRAM_DEST_START;                   // $3500-$3507
    e.phase = 1;                                    // $350A -> falls into $350F
  }

  if (e.phase !== 1) return false;

  e.vramDest = u16(e.vramDest + 0x20);              // $3544-$3551
  const n = e.vramStep + 1;                         // $3554: INC A
  if (n < PHASE1_STEPS) {                           // $3558: CP $17 / JR C
    e.vramStep = n;
    return false;
  }
  e.vramStep = 0;                                   // $3561
  enterStage(e, 0);                                 // $355C: $C712 = 2, and go
  return false;
}

/** Arm FANFARE_STAGES[i] (or the level-6 list) and adopt its $C712 value. */
function enterStage(e, i) {
  const list = e.stages;
  e.stage = i;
  e.hold = list[i].n;
  e.phase = list[i].c712;
  if (list[i].fade) e.fade = 0;                     // $0A88: $C70E = 0 or 3
}

/**
 * The blocking half. On the cartridge nothing else runs while loc_00_3566 and
 * loc_00_35D0 execute -- both sit in their own `CALL sub_00_0A4F` loops -- so
 * the port has to consume whole frames without letting the rest of the tick
 * run. Call this at the TOP of the frame; a `true` return means the frame is
 * spent (see REPORT: this is the one main.js line the sequence needs).
 *
 * @returns true when the frame belongs to a blocking fanfare stage
 */
export function updateVictoryHold(state) {
  const e = effects(state);
  if (e.stage < 0) return false;

  // Stage transitions are WRITES between two `CALL sub_00_0A4F`s, so the new
  // $C712 is only observable from the NEXT frame -- which is why the step into
  // a stage happens at the top here and the FINISH happens at the bottom.
  // MEASURED: $C712 reads 2 at f363 and f364 and only becomes 3 at f365, while
  // $C753 is written on f718, the last frame of the fade rather than the one
  // after it. Advancing both ends the same way is wrong by one at one end or
  // the other, whichever way you pick.
  if (e.hold === 0) enterStage(e, e.stage + 1);
  const st = e.stages[e.stage];
  if (st.finish) {
    // $35E8. src/level.js's clearLevel owns the ROUTING; the one thing that
    // cannot be left to it is $C740, because the three arms disagree about it:
    //   $35FA  a non-route level     -> $C740 = $FF ($3600)
    //   $362A  a route bit was set   -> $C740 = $FF ($3631)
    //   $3622  that bit COMPLETED the set -> straight to loc_00_04BB with
    //          $C740 still 0, and level $0C's own init ($0DCA) rearms it
    //   $3652  level $0E, the ending -> never comes back at all
    // MEASURED on level 11 with $C753 already $03: the cartridge arrives at
    // level 12 with $C740 = 0, not $FF. Duplicating the branch here rather
    // than in clearLevel keeps each file owning its own bytes.
    const bit = ROUTE_BIT[state.level.number];
    const completes = bit !== undefined
      && ((state.flow.routeMask | bit) & 0xFF) === 0x07;
    if (!completes && state.level.number !== 0x0E) e.countdown = COUNTDOWN_IDLE;
    // $C713 is NOT cleared here -- nothing in loc_00_35E8 touches it, and
    // 1:$4EF8 already zeroes it at the START of the next boss death.
    e.stage = -1;
    e.phase = 0;
    e.windowRamp = 0x90;
    // On the cartridge $35E8 never comes back -- every arm leaves for
    // loc_00_04BB, loc_00_035B or loc_00_2820. main.js's step() does the same
    // thing asynchronously, but its Turbo Mode runs several ticks per rAF, so
    // the driver could reach 1:$4EB8 again before the latch is read. `done`
    // makes that a no-op rather than a second fanfare; resetEffects clears it.
    e.done = true;
    state.flow.levelCleared = 1;
    return true;
  }

  e.hold -= 1;
  const done = st.n - e.hold;                       // 1-based frame in the stage

  // $C70E, the fade cursor. sub_00_0A7F runs B = $21 down to 1 and steps the
  // cursor on the four iterations where B & 7 == 0 -- so it reads 0 on the
  // first frame, 1 on the second and +1 every eighth after that. Modelled
  // because it is the only handle anything has on the fade's real length.
  if (st.fade && done > 1) e.fade = Math.min(4, ((done - 2) >> 3) + 1);

  // $363D: the window slides up two scanlines a frame, $8E down to $32, and
  // then parks there for the hold. NOT written through to state.video.windowY:
  // the layer it reveals is built by loc_00_3566's bank-6 copies, which the
  // port does not model, so pulling the real window up would paint the level's
  // fill tile over the screen. Kept as memory the oracle can compare instead
  // of a picture that would be wrong.
  if (st.ramp) e.windowRamp = u8(0x90 - 2 * done);

  return true;
}

/** True while any part of the boss death sequence owns the frame. */
export function bossDeathActive(state) {
  const e = effects(state);
  return e.countdown !== COUNTDOWN_IDLE || e.phase !== 0 || e.stage >= 0;
}
