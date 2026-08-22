// THE BOMB -- `$2498E2`, and the four machines behind it.
//
// WAVE 64 (B2).  `39-OWNER-visible-play-before-sound.md`'s test of done is
// "load the page, fly, shoot, laser, BOMB, and kill a visible enemy".  This
// file is the BOMB.
//
// ============================================================================
// 0. `$249814` IS ONE BUTTON WITH TWO WEAPONS ON IT, AND THIS FILE IS ONE ARM
// ============================================================================
//
// `38-recon-bomb-hyper.md` §0.2 is right and it bears restating in the file
// that acts on it: **`$249814` is not "the bomb"**.  It is Button 2 (mirror
// bit 5) with a two-way fork on the HYPER STOCK:
//
//   $249864 move.w (A1),D1        A1 = $81B65C (P1) / $81B65E (P2)
//   $249866 beq.b  $2498E2        ZERO  -> THE BOMB     <- THIS FILE
//           $249868..$2498DE      NON-0 -> THE HYPER    <- src/hyper.js
//
// `src/player.js` carried ONE name (`THE BOMB ($249814)`) for BOTH arms from
// wave 4 to wave 63, which is exactly how the next wave gets misled: a wave
// that "implements the bomb at $249814" implements the hyper by accident.  W64
// splits the name. W163 ports the hyper arm and keeps this file on the zero-
// stock bomb arm plus the bomb-during-hyper rank sink.
//
// ============================================================================
// 1. THE BOMB IS AN OBJECT IN THE `$811F72` TABLE, AND THAT IS THE WHOLE SHAPE
// ============================================================================
//
// The single fact that organises this file, and the one recon 38 did not
// state:  **`$249A4A move.w D2,(A1)` writes `$811F72`.**
//
//   $249902 lea $811F72,A1        loaded for the third REFUSAL ($249908 bmi)
//   ... $2875B4, $242AC6 x3, $2532EA, $260852 ...   <- A1 SURVIVES ALL OF THEM
//   $249A38 D2 = $8000 | (($7,A5)<<7) | ($58,A6)
//   $249A4A move.w D2,(A1)        <<< THE RECORD IS ALLOCATED, LIVE AND NEGATIVE
//   $249A50 move.l $2(A6),$2(A1)  <<< ...at the player's own position
//
// A1 is not clobbered on the way: `$2875B4`/`$287616` never touch A1,
// `$242AC6` never touches A1, `$2532EA` (`movem.l d0-d7/a6`) does not use it,
// and `$260852`'s `$24150A` SAVES it (`movem.l d0/a0-a1,-(A7)`).  Checked
// instruction by instruction because "an intervening `jsr` clobbers A1" would
// make every write below land somewhere else.
//
// `$811F72` is the 45 x `$30` table `src/damage.js` calls THE BOMB-LASER's
// record and `src/player.js`'s stage-clear wipes.  So pressing the bomb turns
// on, in ONE instruction, every gate in this port that reads it:
//
//   `src/damage.js`   $245614 bpl  -- **`$24560A`, THE BOMB'S DAMAGE**  (ported here)
//   `src/score.js`    $286884 bpl  -- `$286876`'s bomb chain machine   (W51)
//   `src/effects.js`  $288FBC      -- the explosion pool's interlock   (W54)
//   `src/bullets.js`  $28153C bpl  -- the mover's freeze arm           (W29)
//   `src/handlers.js` $273A14 / $276756                                 (W30/W36)
//   `src/hud.js`      $284A6C                                           (W63)
//   `src/options.js`  $24C8E4                                           (W12)
//
// and `$249A32 bset #$6,$1(A6)` turns on the SECOND of `$24560A`'s two guards
// in the same breath.  **There is no version of this wave that ports the
// trigger and defers `$24560A`**: both guards go true on the frame of the
// press, and `src/damage.js` would throw on the very next collision pass.
// That is why this file is 1,000 instructions and not 90.
//
// ============================================================================
// 2. THE FOUR MACHINES, AND WHERE EACH ONE RUNS
// ============================================================================
//
//   ARM      `$2498E2..$249B28`, inside the PLAYER object (types 2/3)
//   DRIVE    `$255DD8` -> `$255E3E`, **TYPE-5 CALL #7**, one frame at a time
//   DAMAGE   `$24560A`, the NINTH block of `$244D62`, inside type 5's TAIL
//   TEARDOWN `$2564F0`, reached from the driver's script terminator
//
// The order within a frame is the cartridge's and is not this file's choice:
// object type 5 (`$28B5E0`) walks its 23 calls -- #7 is the driver -- and THEN
// runs `$28B670`, the tail that reaches `$244D62` and so `$24560A`.  The
// player object is a different dispatch slot altogether.
//
// **THE TEARDOWN IS THE PART A PORT WOULD INVENT**, so it is transcribed in
// full and it is the reason nothing leaks:
//
//   $2564F0 tst.w $81B5AE / bne -> jsr $2877D0    <<< **P1's CHAIN, RESET**
//   $256500 tst.w $81B5B0 / bne -> jsr $2877FE    <<< P2's
//   $25650E move.l #0,$81294C                     both sound-queue words
//   $256516 bclr #$6,$8103E7                      <- $24560A's second guard
//   $25651E bclr #$6,$810449
//   $256526 moveq #$2C,D7 / clr 45 records of $30 <- the pool DRAINS HERE
//
// So the answer to "does the chain behave correctly on bomb kills" is not a
// guess: **a bomb fired while a chain is running ENDS THAT CHAIN**, not on the
// press but ~112 frames later when the bomb's script terminates, because
// `$2499D8 move.w #$1,(A3)` (A3 = `$81B5AE`) latches "there was a chain" and
// `$2564F0` cashes that latch in for `$2877D0`.  §6 measures it.
//
// ============================================================================
// 3. WHAT THIS FILE DOES **NOT** DO
// ============================================================================
//
//  * **IT DOES NOT DRAW THE BOMB.**  -- THIS WAS TRUE IN W64 AND HAS BEEN
//    FALSE SINCE W66, AND W90 IS WHAT NOTICED.  It used to read: "bucket 13 has
//    no harvested sprite shard, so `src/render/index.js` SKIPS every record
//    whose stream is not in the sheet. The records are there and countable; the
//    picture is not."  `tools/export-web.mjs` `BOMB_SHARD = 13` has harvested
//    218 streams since W66 and `[M]` W90 measured **0 of 3,368 bucket-13
//    records lacking art** on a laser bomb and 0 of 58 on an ordinary one.
//    **THE BOMB DRAWS.**  That is the ninth comment on this project to outlive
//    what it described (`docs/knowledge/02-traps.md`).
//
//  * **IT DOES NOT COLOUR THE BOMB, AND THAT IS THE OWNER'S "GREY".**  W90's
//    own finding, measured and NOT fixed:
//      - the bomb's records draw in **sprite palette bank 6** [M];
//      - `$249A62 jsr $260852` (ordinary) and `$249A80 jsr $26085C` (laser)
//        both fall into `$260862 move.w #$6,D0 / jmp $24150A`, which copies
//        **64 bytes = one 32-entry xRGB555 bank** into `$80E886 + 6*64` and
//        sets the dirty flag `$80FA66`.  `moveq #$6` IS the bank number;
//      - `[M]` the source blocks `$222A78` / `$222AB8` open `FFFF FFB6 FF91
//        FF6C FF48 FEE7 FE87 FE04` = white -> pale yellow -> gold -> ORANGE.
//        **That is the owner's "bright orange with yellowish highlights", read
//        straight out of the cartridge;**
//      - `$24150A` is a COUNTED NOTE in seven files and has never executed, so
//        bank 6 keeps whatever the capture froze -- `[M]` the seed's own
//        `$80E886 + 6*64` is `5EF3 5EF3 5EF3 5EEF ...`, a desaturated khaki
//        ramp, which is the STAGE-TITLE card's palette.
//    Fixing it is a subsystem, not a line: see `90-impl` §2.4.  Nothing here
//    hand-patches a palette, because a typed-in colour is a fabricated one.
//  * **THE HYPER.** W163 owns `$249868` and the shared end/debit dependency.
//  * **TYPE-B IS NOT A REMAINING EXCLUSION.**  W497 ports the selector-bit-1
//    ordinary scripts at `$25658A`, `$2565FE`, and `$25664E`, plus `$255FE2`'s
//    Type-B laser-bomb family at `$256986..$256CA9` and its `$28C542` cue.
//    Dispatch entries 0/2 run the ordinary bomb and entries 1/3 run the laser
//    bomb, with selector 0 choosing Type-A data and selector 2 choosing Type-B.

import { RAM, P } from './machine.js';
import { u16, i16 } from './ram.js';
import { unreached } from './unported.js';
import { bcd242AC6, beamReset25270C } from './items.js';
import { drawSigned242FDE } from './rng.js';
import { BEAM, wipeSegmentPool } from './laser.js';
import { spawnBeamBombSpark289FF4 } from './spark.js';
import { install24150A } from './palette.js';
import { bombEndHyper249970, flushPendingHyper2875B4 } from './hyper.js';

const note = (ctx, addr, what) => ctx.unportedLog.note(addr, what);

/**
 * WAVE 91 -- `$260862 move.w #$6,D0 / jmp $24150A`, the tail BOTH bomb heads
 * fall into.  This is the routine the owner's report is about: bank 6 is what
 * every bomb record draws through, and until this wave nothing in this port
 * wrote it, so it kept whatever `capture.bin` had frozen there -- [M] a
 * desaturated khaki ramp with R = G, which is the STAGE-TITLE card's palette.
 *
 * A caller without a `PaletteState` keeps the counted note it always had.  A
 * silent skip here would be indistinguishable from a bomb that is the right
 * colour, which is exactly the failure mode `src/unported.js` exists to stop.
 */
function installBombPalette(ctx, ram, src, why) {
  if (!ctx.palette) {
    note(ctx, 0x260862, `$260862 move.w #$6,D0 / jmp $24150A from ${why} -- no `
      + `PaletteState on this ctx, so bank 6 stays whatever it was`);
    return;
  }
  install24150A(ram, ctx.palette, 6, ctx.rom.bytes(src, 64), 0x260866, why);
}

/** ROM addresses this file cites in throws, notes and events. */
export const BOMB = {
  fork: 0x249864,          // move.w (A1),D1 -- the HYPER STOCK is the fork
  hyperArm: 0x249868,      // the NON-ZERO arm.  NOT the bomb.
  arm: 0x2498e2,           // tst.b ($24,A6) -- the bomb arm's first instruction
  consume: 0x249916,       // subq.b #$1,($24,A6)
  regrantP1: 0x2875b4,     // $249922 -- only when the stock reaches ZERO
  regrantP2: 0x287616,     // $24992A
  itemSpawner: 0x27e912,   // $2875FC jsr -- I2 refuses kind $C at the allocator
  hyperEnd: 0x285af2,      // $249970 -- only while $81B63E is non-zero
  rankDebit: 0x249976,     // subq.w #$3,$81B646 -- and it is at the CALL SITE
  bcd: 0x242ac6,           // the three $8128F4 conversions
  sound2532EA: 0x2532ea,   // $249A28
  install260852: 0x260852, // $249A62 -- $24150A resource install (data)
  install26085C: 0x26085c, // $249A80's
  deathArm: 0x249a80,      // ($3f,A6) non-zero -- the LASER/death bomb
  poolWipe: 0x252714,      // $249ABE / $249AD2
  cancel: 0x243da0,        // $249AEA -- ARM ONLY, $81B412 := $FFFF
  deadTable: 0x24a440,     // $249AF8 move.w (A0)+,D0 -- and D0 IS DEAD (§4)
  driver: 0x255dd8,        // TYPE-5 CALL #7
  driverAlt: 0x255fe2,     // its other dispatch entry
  script: 0x255e3e,        // the one this port takes
  scriptAltP1: 0x25658a,   // the ($1,A6) bit 1 installs
  scriptAlt2: 0x2565fe,
  scriptAlt3: 0x25664e,
  teardown: 0x2564f0,
  invulnClear: 0x2564ba,   // the $81296C expiry
  chainResetP1: 0x2877d0,
  chainResetP2: 0x2877fe,
  damage: 0x24560a,        // the NINTH block of $244D62
  damageAlt: 0x2456a6,     // its btst #$0,D5 arm -- W65, THE BEAM BOMB'S
  // ---- W65 (B3): the LASER BOMB's own addresses ----------------------------
  beamArm: 0x249a80,       // ($3f,A6) non-zero -- bomb WHILE HOLDING THE BEAM
  beamScript: 0x255fe2,    // $255E2E[1] and [3]
  beamSeg2561AA: 0x2561aa, // the 41 segment records, phase 1
  beamHead2562FC: 0x2562fc, // record 42's mover
  beamHead256348: 0x256348, // record 44's mover, and $256346 IS A BARE `rts`
  beamNop256346: 0x256346,
  beamSeg2563B6: 0x2563b6, // the 41 segment records, phase 2
  beamReset256468: 0x256468,
  beamSpark: 0x289ff4,     // $256162 jmp -- pool E, kind 0
  beamScriptAltP1: 0x256986, // the ($1,A6)-bit-1 twin's six script pointers
  beamCue28C528: 0x28c528, // $256078 lea / $2560BC jsr (A0) -- SOUND
  beamCue28C542: 0x28c542, // ...the bit-1 arm's
  draw23FF06: 0x23ff06,
  draw23FF42: 0x23ff42,
  draw23FFB4: 0x23ffb4,
  cue28C55C: 0x28c55c,     // $255E92 jsr (A0) -- the $28Cxxx sound family
  cue28C576: 0x28c576,
};

/** RAM the bomb owns or reads.  Every one cited on its use. */
export const BOMBRAM = {
  /** The 45 x $30 record table.  `$2564F0`'s `moveq #$2C,D7` is the 45. */
  rec: 0x811f72, stride: 0x30, slots: 45,
  /** ($24,A6) -- **THE BOMB STOCK**, a BYTE in the player's own record. */
  stockOffset: 0x24,
  hyperStockP1: 0x81b65c, hyperStockP2: 0x81b65e,
  hyperActiveP1: 0x81b63e, hyperActiveP2: 0x81b640,
  rankPowerP1: 0x81b646, rankPowerP2: 0x81b648,
  flashP1: 0x81b6fe, flashP2: 0x81b700,     // §5: the HYPER's, not the bomb's
  queue: 0x803938,                          // $24990E move.w #$1
  usedP1: 0x812944, usedP2: 0x812946,
  countP1: 0x812940, countP2: 0x812942,     // capped at $63 = 99
  meterP1: 0x81b5c0, meterP2: 0x81b5ea,
  chainLatchP1: 0x81b5ae, chainLatchP2: 0x81b5b0,
  pendP1: 0x8128f4, pendP2: 0x812902,
  armWord: 0x81b410, modeWord: 0x81b412,    // $243DA0's two writes
  cooldown: 0x81296c,                       // $255FD6 move.w #$28
  scrollX: 0x813176,                        // $255E3E's per-frame X drift
  phase: 0x80390c,                          // $255F1C -- the animation's gate
  soundQueue: 0x81294c,                     // $25650E clr.l -- BOTH words
  pending1: 0x81b6e0, pending2: 0x81b6e2, pendGate: 0x81b6e4,
  earnP1: 0x81b64a, earnP2: 0x81b64c,
  bucket13: 0x80a8dc, bucket13Counter: 0x80afec,
  poolA: 0x81459c, poolAStride: 0x20,       // $245638 lea / $24569C lea $20
  hitMask: 0x80fa72,                        // $24563E move.w $80FA72,D6
  box: 0x80fa74,                            // $2456AA -- the alt arm's box
  g12952: 0x812952, g12954: 0x812954,       // $245622 / $24562C
  // ---- W65 (B3) ------------------------------------------------------------
  poolB: 0x81521c, poolBStride: 0x20,       // $24571A lea / $245724 lea $20
  bulletPool: 0x817f8c,                     // $245902 lea $817F8E is this PLUS 2
  bulletStride: 0x40,                       // $2459C6 lea ($40,A5),A5
  bulletWindow: [0x81b414, 0x81b416, 0x81b418, 0x81b41a],   // $24590C..$245936
  g12968: 0x812968,                         // $256072 move.w D0
  g8127e2: 0x8127e2,                        // $249A9E clr.w
  soundQueueP2: 0x81294e,                   // $2564A4 clr.w -- $256468's P2 half
  optP1: 0x8104aa, optP2: 0x81050e,         // $249AB2 / $249AC6 lea -- A1
};

/** The FOUR records the LASER BOMB uses, as byte offsets from `$811F72`.
 *
 *  `[M]` and this is the fact that makes the whole weapon legible: the first
 *  block of `$255FE2`'s install ends with A1 at `+$30`, `$25600C lea ($7B0,A1)`
 *  puts the next at `+$7E0`, and the remaining two follow at `+$30` each.
 *  `$7E0 / $30 = 42`.  So the heads are records **0, 42, 43 and 44**, and
 *  `$2561AA`/`$2563B6`'s `lea $811FA2,A6` + `moveq #$28,D7` + `dbra` is records
 *  **1..41**.  **1 + 41 + 3 = 45** -- the whole table, which is why `$2564F0`
 *  wipes forty-five and not one. */
export const BEAM_REC = { head: 0x000, tail: 0x7e0, mid: 0x810, tip: 0x840,
  seg0: 0x030, segs: 41 };

/** `$255FE2`'s two ROM extents and the data block behind them.
 *
 *  `$256CAA` is counted from the copy SEQUENCE (`$255FEA lea` to `$256062`),
 *  not from a run: 158 bytes, ending exactly at `$256D48`, which is the
 *  18-byte segment template `$2561EE`/`$256282`/`$2563F0` all read.
 *
 *  `$256662..$256CA9` is the DATA the install's Type-A and Type-B script
 *  pointers name. Each ship has four 12-byte anim tables, one eight-pointer
 *  table and its eight 12-byte targets, one twelve-entry phase-2 list, and
 *  twelve eight-pointer tables. The Type-A half is `$256662..$256985`; the
 *  Type-B half is `$256986..$256CA9`, ending where the install begins. */
export const BEAM_TEMPLATES = {
  install: 0x256caa, installLen: 158,
  seg: 0x256d48, segLen: 18,
  data: 0x256662, dataLen: 0x648,
  animStride: 12, ptrEntries: 8, listStride: 20, listEntries: 12,
  listEnd: 0x256802,
};

/** The record's own fields.  A6 = `$811F72` throughout `$255E3E`. */
const B = {
  type: 0x00,       // word.  bit15 LIVE, bit8 the init latch, bit9 the blink
  low: 0x01,        // byte -- ($7,A5)<<7 | ($58,A6);  bit 7 = P2
  posY: 0x02, posX: 0x04,
  offLong: 0x06, offShort: 0x08,
  anim: 0x0a,       // long -> hardware words 2,3
  size: 0x0e,       // word -> hardware word 4
  flipColour: 0x1c, // word -> hardware word 5
  script: 0x1e,     // long
  tick: 0x22, reload: 0x23,   // bytes -- $255EBA subq.b / $255EC0 reload
  animIdx: 0x24,    // word -- $255F24, steps -4 from $1C
  phase: 0x28,      // word -- 0 = script, 1 = the fade, 2 = the blink
  loops: 0x2a,      // word -- $255F38 subq.w #$1
};

/** The three record templates the driver installs, and their extents.
 *
 *  Every length below is the number of bytes the INSTRUCTION SEQUENCE consumes,
 *  counted from the `lea` to the last `move`, never from a run:
 *
 *    $25653C  w, (skip $C), l, l, l, w, l, l, (skip 2), l, (skip 2), w  = 30 B
 *    $2565BC  l, (skip 4), w, l, l, l, w, l, l, l, w                    = 34 B
 *    $25661E  l, (skip 4), w, l, l, l, w, l, w, (skip 4), w             = 28 B
 *
 *  `tools/export-tables.py check_bomb_extents` asserts all three against the
 *  cartridge on every export, plus both script terminators. */
export const BOMB_TEMPLATES = {
  init: 0x25653c, initLen: 30,
  fade: 0x2565bc, fadeLen: 34,
  blink: 0x25661e, blinkLen: 28,
  /** The window that covers all six installs and all six scripts/lists. */
  window: 0x25653c, windowLen: 0x126,
};

// ===========================================================================
// `$243DA0` -- THE BOMB'S SCREEN-CLEAR ENTRY, and it is NOT the midboss's
// ===========================================================================
/**
 * One of the FOURTEEN near-identical entries at `$243CE0..$2440DE`, and recon
 * 38 §1.4 is right that the port already has a sibling: `src/midboss.js`
 * `armScreenClear` is `$243E7C`.  **They are not the same routine.**
 *
 *   $243E7C (the midboss's)  arms $81B412 := $0     and WALKS the 210 slots
 *   $243DA0 (the BOMB's)     arms $81B412 := $FFFF  and RETURNS -- 10 instrs
 *
 * The difference is the whole behaviour.  `src/bulletdriver.js` `$281CE0
 * move.w $81B412,D0 / bmi $281D48` forks on the SIGN, so:
 *
 *   $81B412 == 0      -> `$281D22`, the FREE arm, whose `jsr $27F8F8` is a
 *                        counted note (the impact pool is refused)
 *   $81B412 == $FFFF  -> `$281D48`, the TRANSFORM arm: `or.b #$40,(A6)` and
 *                        `move.w #$FFFF,($3c,A6)`, **NO call, fully ported
 *                        since W29**
 *
 * So the bomb's cancel is the arm this port can already run end to end, and it
 * is the first thing a player SEES: every live enemy bullet on screen takes
 * the mover's own transform path `$281FA2` on the next frame.
 *
 * @returns {boolean} false when a class $20..$3C cancel is already running.
 */
export function armBombCancel243DA0(ram) {
  if (ram.u16(BOMBRAM.armWord) !== 0                 // $243DA0 tst.w / beq
    && ram.u16(BOMBRAM.modeWord) >= 0x20             // $243DA8 cmpi / bcs
    && ram.u16(BOMBRAM.modeWord) <= 0x3c) {          // $243DB2 cmpi / bhi
    return false;                                    // $243DBC rts
  }
  ram.setU16(BOMBRAM.armWord, 1);                    // $243DBE move.w #$1
  ram.setU16(BOMBRAM.modeWord, 0xffff);              // $243DC6 move.w #$FFFF
  return true;                                       // $243DCE rts
}

// ===========================================================================
// `$2875B4` / `$287616` -- THE PENDING-GRANT FLUSH, on the LAST bomb only
// ===========================================================================
/**
 * `$24991A bne $249930` skips this unless `subq.b #1,($24,A6)` reached ZERO,
 * so it runs on the last bomb of a life and at the end of every hyper
 * (`$285B2A jmp`).
 *
 * W163 delegates both mirrors to the shared hyper implementation. A non-zero
 * pending count now spawns kind C/14 items at the ROM's stepped positions.
 */
export function flushPendingGrants2875B4(ram, ctx, p2) {
  return flushPendingHyper2875B4(ram, ctx.rom, ctx, p2);
}

// ===========================================================================
// `$2877D0` / `$2877FE` -- **THE CHAIN RESET**
// ===========================================================================
/** Nine instructions, `moveq #$0,D0` and seven stores.  Called ONLY from
 *  `$2564F0`, i.e. only when a bomb's script terminates with `$81B5AE` (or
 *  `$81B5B0`) latched non-zero by `$2499D8`.
 *
 *  The addresses are `src/score.js`'s own chain block: the two BCD score
 *  accumulators, the meter, the popup mirror, the two per-link adders and the
 *  chain COUNT.  A bomb thrown into a running chain does not shorten it -- it
 *  DELETES it, ~112 frames later. */
export function resetChain2877D0(ram, p2) {
  if (p2) {
    ram.setU32(0x81b5e2, 0); ram.setU32(0x81b5e6, 0);   // $287800 / $287806
    ram.setU16(0x81b5ea, 0); ram.setU16(0x81b5f4, 0);   // $28780C / $287812
    ram.setU32(0x81b5f8, 0); ram.setU32(0x81b5fc, 0);   // $287818 / $28781E
    ram.setU16(0x81b604, 0);                            // $287824
    return;
  }
  ram.setU32(0x81b5b8, 0); ram.setU32(0x81b5bc, 0);     // $2877D2 / $2877D8
  ram.setU16(0x81b5c0, 0); ram.setU16(0x81b5ca, 0);     // $2877DE / $2877E4
  ram.setU32(0x81b5ce, 0); ram.setU32(0x81b5d2, 0);     // $2877EA / $2877F0
  ram.setU16(0x81b5da, 0);                              // $2877F6
}

// ===========================================================================
// `$23FF06` / `$23FF42` / `$23FFB4` -- BUCKET 13, twelve bytes each
// ===========================================================================
/** The shared tail of all three: append one 12-byte record to bucket 13 and
 *  bump `$80AFEC` by `$C`.  `src/spritequeue.js` entry 13 is `$80A8DC` /
 *  `$80AFEC`, cap 1,080 bytes -- 90 records. */
function emitBucket13(ram, ctx, pos, animLong, w4, w5) {
  const a0 = BOMBRAM.bucket13 + ram.u16(BOMBRAM.bucket13Counter);  // $23FF0C adda.w
  ram.setU16(BOMBRAM.bucket13Counter,
    u16(ram.u16(BOMBRAM.bucket13Counter) + 0x0c));      // $23FF12 addi.w #$C
  ram.setU32(a0, pos >>> 0);                            // $23FF36 move.l D0,(A0)+
  ram.setU32(a0 + 4, animLong >>> 0);                   // $23FF38
  ram.setU16(a0 + 8, w4);                               // $23FF3A
  ram.setU16(a0 + 10, w5);                              // $23FF3C
  // The counter is REBUILT every frame by the display-list pass, so "read
  // $80AFEC after the step" measures nothing.  The event is how a gate can see
  // that the bomb drew at all -- and it carries the record's own hardware
  // words, so a wrong `asr.l #$6` is visible and not just a count.
  ctx.bombEvent?.('draw', `${pos.toString(16)}/${animLong.toString(16)}`);
}

/** Packs one bomb record position with its live offset and flag bits. */
function packBombRecordPosition(ram, a6) {
  // `$23FF06` and `$23FF42` share this arithmetic: the record's own position,
  // biased by ($6,A6)/($8,A6), `asr.l #$6`, masked and OR-ed with two live bits.
  // `$23FF42` differs ONLY in saving D0/A0-A1; the twenty instructions between
  // the two entries are otherwise identical, which is the kind of pair a port
  // can collapse wrongly.
  // $23FF1E move.l (A1)+,D0 with A1 = ($2,A6): D0 = posY<<16 | posX
  let hi = ram.u16(a6 + B.posY), lo = ram.u16(a6 + B.posX);
  // $23FF20 swap / $23FF22 add.w (A1)+,D0  -- the LOW half is now posY
  hi = u16(hi + ram.u16(a6 + B.offLong));               // $23FF22
  lo = u16(lo + ram.u16(a6 + B.offShort));              // $23FF26
  let d0 = (((hi << 16) >>> 0) + lo) >>> 0;
  d0 = (d0 >= 0x80000000 ? (d0 - 0x100000000) : d0) >> 6;   // $23FF28 asr.l #$6
  d0 = (d0 & 0x07ff03ff) >>> 0;                         // $23FF2A andi.l
  d0 = (d0 | 0x80008000) >>> 0;                         // $23FF30 ori.l
  return d0;
}

function draw23FF06(ram, ctx, a6) {
  emitBucket13(ram, ctx, packBombRecordPosition(ram, a6), ram.u32(a6 + B.anim),
    ram.u16(a6 + B.size), ram.u16(a6 + B.flipColour));
}

/** `$23FFB4` -- the same record shape but every field comes in a REGISTER
 *  (D1 packed position, D2 the anim long, D3/D4 the two words), which is why
 *  the script walk at `$255E9C` can draw a position the record does not hold. */
function draw23FFB4(ram, ctx, d1, d2, d3, d4) {
  let d0 = (d1 >= 0x80000000 ? (d1 - 0x100000000) : d1) >> 6;   // $23FFCE asr.l #$6
  d0 = ((d0 & 0x07ff03ff) | 0x80008000) >>> 0;          // $23FFD0 / $23FFD6
  emitBucket13(ram, ctx, d0, d2, d3, d4);
}

// ===========================================================================
// `$2564F0` -- THE TEARDOWN, and `$2564BA` -- the cooldown's expiry
// ===========================================================================
export function bombTeardown2564F0(ram, ctx) {
  let chainsReset = 0;
  if (ram.u16(BOMBRAM.chainLatchP1) !== 0) {           // $2564F2 tst.w / beq
    resetChain2877D0(ram, false); chainsReset |= 1;    // $2564FA jsr $2877D0
  }
  if (ram.u16(BOMBRAM.chainLatchP2) !== 0) {           // $256500 tst.w / beq
    resetChain2877D0(ram, true); chainsReset |= 2;     // $256508 jsr $2877FE
  }
  ram.setU32(BOMBRAM.soundQueue, 0);                   // $256510 move.l D0 -- BOTH
  ram.bclr8(RAM.player1 + 0x01, 6);                    // $256516 bclr #$6,$8103E7
  ram.bclr8(RAM.player2 + 0x01, 6);                    // $25651E bclr #$6,$810449
  for (let i = 0; i < BOMBRAM.slots; i++) {            // $256526 moveq #$2C,D7
    ram.setU16(BOMBRAM.rec + i * BOMBRAM.stride, 0);   // $256530 / $256532 lea $30
  }
  ctx.bombEvent?.('teardown', chainsReset);
  return chainsReset;
}

/** `$2564BA` -- reached from `$255DF0 beq.w` when `$81296C` counts to zero.
 *  A0/A1 are the two players, SWAPPED by `$2564C6 tst.b $811F73 / bpl`, so
 *  the `$FF` invulnerability is only cleared on the bomber if it is still
 *  `$FF`, while the OTHER player's is cleared unconditionally. */
export function bombCooldownExpiry2564BA(ram) {
  const p2 = (ram.u8(BOMBRAM.rec + B.low) & 0x80) !== 0;   // $2564C6 tst.b / bpl
  const a0 = p2 ? RAM.player2 : RAM.player1;               // $2564D0 / $2564BA
  const a1 = p2 ? RAM.player1 : RAM.player2;               // $2564D6 / $2564C0
  if (ram.u8(a0 + P.invuln) === 0xff) {                    // $2564DC cmpi.b #$FF
    ram.setU8(a0 + P.invuln, 0);                           // $2564E6 clr.b
  }
  ram.setU8(a1 + P.invuln, 0);                             // $2564EA clr.b
}

// ===========================================================================
// `$255DD8` -- TYPE-5 CALL #7, THE BOMB'S DRIVER
// ===========================================================================
/**
 * Thirty-six instructions and a four-entry jump table.  Read it in the order
 * the cartridge does, because the FIRST arm is the one that runs on every
 * frame of a game with no bomb in it:
 *
 *   $255DD8 lea $811F72,A6 / move.w (A6),D0 / bmi $255DF6    a bomb IS up
 *   $255DE2 tst.w $81296C / beq $255DF4 (rts)                no cooldown
 *   $255DEA subq.w #$1,$81296C / beq $2564BA                 the cooldown
 *
 * `$255DF6` onward picks the handler by `D0 & $7` out of the table at
 * `$255E2E` -- `[$255E3E, $255FE2, $255E3E, $255FE2]`.  D0 is the record's own
 * type word. Its low three bits combine the laser-bomb bit with the ship
 * selector, so entries 0/2 run `$255E3E` for Type-A/Type-B ordinary bombs and
 * entries 1/3 run `$255FE2` for Type-A/Type-B laser bombs.
 *
 * A4/A5 are set from `tst.b ($1,A6)` -- the P2 bit -- and are the ONLY reason
 * the driver reads the record's low byte at all.
 */
export function bombDriver255DD8(ram, rom, ctx) {
  const d0 = ram.u16(BOMBRAM.rec);                     // $255DDE move.w (A6),D0
  if ((d0 & 0x8000) === 0) {                           // $255DE0 bmi $255DF6
    if (ram.u16(BOMBRAM.cooldown) === 0) return false; // $255DE2 tst.w / beq
    const c = u16(ram.u16(BOMBRAM.cooldown) - 1);      // $255DEA subq.w #$1
    ram.setU16(BOMBRAM.cooldown, c);
    if (c === 0) {                                     // $255DF0 beq.w $2564BA
      bombCooldownExpiry2564BA(ram);
      ctx.bombEvent?.('cooldown-expired', 0);
    }
    return false;                                      // $255DF4 rts
  }
  const idx = d0 & 0x7;                                // $255E16 andi.w #$7,D0
  if (idx === 1 || idx === 3) {
    // `$255E2E[1]` and `[3]` are both `$255FE2` -- **THE LASER BOMB**, W65.
    // The index's bit 0 is `$249A98 bset #$0,($1,A1)`'s and bit 1 is the ship
    // selector's. Both entries call the same routine; its bit-1 forks choose
    // the Type-B script pointers and sound cue.
    bombScriptAlt255FE2(ram, rom, ctx, (d0 & 0x80) !== 0);
    return true;
  }
  if (idx >= 4) {
    unreached(BOMB.driver, `$255E16 andi.w #$7,D0 gave ${idx}, but the table `
      + `at $255E2E holds FOUR longwords and $255E3E is CODE immediately `
      + `after them -- index ${idx} reads an instruction as a pointer. The `
      + `record's type word is $${d0.toString(16).toUpperCase()}`);
  }
  bombScript255E3E(ram, rom, ctx);
  return true;
}

/** Copy `len` bytes of a template into a record, following the EXACT `lea` /
 *  `move` sequence rather than a memcpy: the sequences SKIP bytes ($C at
 *  `$255E5E`, 4 at `$2565C0`'s `addq.w`, 2 twice at `$255E6E`/`$255E72`), and
 *  a memcpy would write the holes.  `steps` is `[recordOffset, size]` pairs in
 *  instruction order. */
function installTemplate(ram, rom, src, steps) {
  let s = src;
  for (const [off, size] of steps) {
    if (size === 2) { ram.setU16(BOMBRAM.rec + off, rom.u16(s)); s += 2; }
    else { ram.setU32(BOMBRAM.rec + off, rom.u32(s)); s += 4; }
  }
  return s - src;
}

/** `$255E52..$255E74` -- the INIT install.  15 words, and the LONG at
 *  template offset `$10` lands on `($1E,A6)`, THE SCRIPT POINTER. */
const INIT_STEPS = [[0x02, 2], [0x10, 4], [0x14, 4], [0x18, 4], [0x1c, 2],
  [0x1e, 4], [0x22, 4], [0x28, 4], [0x2e, 2]];
/** `$2565BC`'s -- 17 words. */
const FADE_STEPS = [[0x06, 4], [0x0e, 2], [0x10, 4], [0x14, 4], [0x18, 4],
  [0x1c, 2], [0x1e, 4], [0x22, 4], [0x26, 4], [0x2a, 2]];
/** `$25661E`'s -- 14 words. */
const BLINK_STEPS = [[0x06, 4], [0x0e, 2], [0x10, 4], [0x14, 4], [0x18, 4],
  [0x1c, 2], [0x1e, 4], [0x22, 2], [0x28, 2]];

/**
 * `$255E3E..$255FE0` -- the bomb's three-phase script machine.
 *
 * PHASE 0 (`($28,A6) == 0`): walk 12-byte script entries -- two position
 *   offsets, an anim long and two hardware words -- one entry every time the
 *   `($22,A6)` tick borrows, drawing each through `$23FFB4`.  The seed's
 *   reload is 1, so it advances every OTHER frame and the four entries take
 *   eight frames.
 * PHASE 1 (`== 1`): the `$2565BC` install.  A `$242FDE`-signed `$40` jitter on
 *   X every frame, then -- only on the frames `$80390C` is zero -- one long
 *   out of the `$2565DE` table walked BACKWARD from `($24,A6) = $1C`, six
 *   times over (`($2a,A6) = 6`).
 * PHASE 2 (`== 2`): the `$25661E` install; `$255F7E bchg #$1,(A6)` makes it
 *   draw on alternate frames out of the `$25663A` long list until
 *   `$FFFFFFFF`, and then `$255FA2` tears the whole thing down.
 *
 * **THE TRAP.**  `$255F7E bchg` sets Z from the OLD bit, so the frame the bit
 * goes 0->1 does NOTHING and the frame it goes 1->0 draws.  A port that reads
 * the NEW bit draws on the wrong parity and finishes the bomb one frame early;
 * `tests/w64bomb.test.js` walks four frames and asserts both.
 */
export function bombScript255E3E(ram, rom, ctx) {
  const rec = BOMBRAM.rec;
  // $255E3E move.w $813176,D1 / $255E44 sub.w D1,$4(A6) -- the bomb drifts
  // with the background's cross-axis scroll and NOT with the player.
  ram.setU16(rec + B.posX,
    u16(ram.u16(rec + B.posX) - ram.u16(BOMBRAM.scrollX)));

  if (!ram.btst8(rec, 0)) {                            // $255E48 btst #$0,(A6)
    ram.bset8(rec, 0);                                 // $255E4E bset #$0,(A6)
    installTemplate(ram, rom, BOMB_TEMPLATES.init, INIT_STEPS);
    if (ram.btst8(rec + B.low, 1)) {                   // $255E7C btst #$1,$1(A6)
      ram.setU32(rec + B.script, BOMB.scriptAltP1);     // $255E84 move.l #$25658A
    }
    ctx.soundPost?.(0x28c55c);  // WAVE A: BGM id=$10, bomb's own cue ($255E92)
  }

  const phase = ram.u16(rec + B.phase);                // $255E94 tst.w $28(A6)
  if (phase === 0) {
    // ---- $255E9C: the 12-byte script walk.
    let a0 = ram.u32(rec + B.script);                  // $255E9C movea.l
    let d1hi = u16(ram.u16(rec + B.posY) + rom.u16(a0));       // $255EA0/$255EA4
    let d1lo = u16(ram.u16(rec + B.posX) + rom.u16(a0 + 2));   // $255EA8/$255EAC
    const d2 = rom.u32(a0 + 4);                        // $255EAE move.l (A0)+,D2
    const d3 = rom.u16(a0 + 8);                        // $255EB0 movem.w (A0)+
    const d4 = rom.u16(a0 + 10);
    a0 += 12;
    draw23FFB4(ram, ctx, (((d1hi << 16) >>> 0) + d1lo) >>> 0, d2, d3, d4);  // $255EB4
    // `bcc` after `subq.b` tests the BORROW, so the script advances on the
    // frame the tick wraps PAST zero and not on the frame it reaches it.  With
    // the seed's reload of 1 that is every other frame.
    const borrow = ram.u8(rec + B.tick) === 0;         // $255EBA subq.b #$1
    ram.setU8(rec + B.tick, (ram.u8(rec + B.tick) - 1) & 0xff);
    if (!borrow) return;                               // $255EBE bcc $255ED0
    ram.setU8(rec + B.tick, ram.u8(rec + B.reload));   // $255EC0 move.b $23,$22
    if (rom.u16(a0) !== 0xffff) {                      // $255EC6 cmpi.w #$FFFF
      ram.setU32(rec + B.script, a0);                  // $255ECC move.l A0,$1E
      return;                                          // $255ED0 rts
    }
    // ---- $255ED2: install the FADE and fall into the phase test.
    installTemplate(ram, rom, BOMB_TEMPLATES.fade, FADE_STEPS);
    if (ram.btst8(rec + B.low, 1)) {                   // $255EF2 btst #$1
      ram.setU32(rec + B.script, BOMB.scriptAlt2);     // $255EFA move.l #$2565FE
    }
    ctx.bombEvent?.('phase', 1);
    // $255EF8 beq $255F02 -- and $255F02 is the NEXT test, in the SAME frame.
  }

  if (ram.u16(rec + B.phase) === 1) {                  // $255F02 cmpi.w #$1
    let d1 = 0x40;                                     // $255F0C moveq #$40,D1
    if (drawSigned242FDE(ram, rom) === 0) d1 = u16(-d1);  // $255F0E / $255F16
    ram.setU16(rec + B.posX, u16(ram.u16(rec + B.posX) + d1)); // $255F18 add.w
    if (ram.u16(BOMBRAM.phase) !== 0) return;          // $255F1C tst.w / bne rts
    const idx = ram.u16(rec + B.animIdx);              // $255F24 move.w $24(A6)
    const a0 = ram.u32(rec + B.script);                // $255F28 movea.l $1E
    ram.setU32(rec + B.anim, rom.u32(a0 + i16(idx)));      // $255F2C move.l
    const n = u16(idx - 4);                            // $255F32 subq.w #$4
    ram.setU16(rec + B.animIdx, n);
    if (idx >= 4) { draw23FF06(ram, ctx, rec); return; }    // $255F36 bcc -> $255F44
    const loops = u16(ram.u16(rec + B.loops) - 1);     // $255F38 subq.w #$1
    ram.setU16(rec + B.loops, loops);
    if (loops !== 0) {                                 // $255F3C beq $255F4E
      ram.setU16(rec + B.animIdx, 0x1c);               // $255F3E move.w #$1C
      draw23FF06(ram, ctx, rec);                       // $255F44 jmp $23FF06
      return;
    }
    // ---- $255F4E: install the BLINK and fall into $255F7E.
    installTemplate(ram, rom, BOMB_TEMPLATES.blink, BLINK_STEPS);
    if (ram.btst8(rec + B.low, 1)) {                   // $255F6E btst #$1
      ram.setU32(rec + B.script, BOMB.scriptAlt3);     // $255F76 move.l #$25664E
    }
    ctx.bombEvent?.('phase', 2);
  }

  // ---- $255F7E: the BLINK, on alternate frames.  `bchg` sets Z from the OLD
  // bit, so the frame it SETS the bit returns and the frame it CLEARS it draws.
  const wasSet = ram.btst8(rec, 1);                    // $255F7E bchg #$1,(A6)
  if (wasSet) ram.bclr8(rec, 1); else ram.bset8(rec, 1);
  if (!wasSet) return;                                 // $255F82 bne / $255F84 rts
  let a0 = ram.u32(rec + B.script);                    // $255F86 movea.l $1E
  ram.setU32(rec + B.anim, rom.u32(a0));           // $255F8A move.l (A0)+
  a0 += 4;
  draw23FF06(ram, ctx, rec);                       // $255F8E jsr $23FF42
  if (rom.u32(a0) !== 0xffffffff) {                // $255F94 cmpi.l
    ram.setU32(rec + B.script, a0);                    // $255F9C move.l A0,$1E
    return;                                            // $255FA0 rts
  }
  // ---- $255FA2: THE END OF THE BOMB.
  const p2 = (ram.u8(BOMBRAM.rec + B.low) & 0x80) !== 0;   // $255FB0 tst.b / bpl
  const a = p2 ? RAM.player2 : RAM.player1;                // $255FB6 / $255FA2
  const d0 = ram.u8(a + P.baseSpeed);                      // $255FBE move.b $39
  if (d0 < ram.u8(a + P.speedIdx)) {                       // $255FC2 cmp.b / bcc
    ram.setU8(a + P.speedIdx, d0);                         // $255FCA move.b
  }
  // $255FCE tst.b ($3f,A0) / beq $255FD6, and $255FD4 IS A `nop`.  BOTH arms
  // reach $255FD6; transcribed because a reader who smooths the branch away
  // has silently decided the nop was something else.
  ram.setU16(BOMBRAM.cooldown, 0x28);                      // $255FD6 move.w #$28
  bombTeardown2564F0(ram, ctx);                            // $255FDE bra $2564F0
}

// ===========================================================================
// W65 (B3) -- `$255FE2`, **THE LASER BOMB'S DRIVER**
// ===========================================================================
//
// `$255E2E[1]`.  A6 is `$811F72`, A5 is the PLAYER RECORD (`$8103E6`/`$810448`,
// `$255DFE`/`$255E10`) and A4 is the OPTION BLOCK -- and A4 is never read here.
//
// It runs for **132 logic frames** and the number is derived, not measured:
// `$256CAA`'s install puts `$0078` on `($1A,A6)` and `$256112 subq.w #$1` takes
// one per frame, so phase 1 is 120 frames; then `($28,A6)` walks `$256712`'s
// TWELVE five-longword entries at one per frame and hits `$FFFFFFFF`.
// 120 + 12 = 132, against the ordinary bomb's ~113.
//
// THE FOUR HEADS AND THE FORTY-ONE SEGMENTS (see `BEAM_REC`) are what the
// weapon is: records 42/43/44 are drawn sprites that march up the screen, and
// records 1..41 are the BEAM -- one new segment seeded per frame at the
// player's position `+$600` on the long axis (`$2561F4 addi.l #$6000000`), each
// existing one advanced `+$400` plus the player's own `($30,A5)` velocity and
// killed when it passes `$7800` or the nearest struck enemy `$812952`.

/** `$255FEA..$256062` -- the install.  The sequence is the ROM's, byte for
 *  byte, and the `addq.w #$4,A1` SKIPS are holes a memcpy would fill.
 *  `[M]` it consumes exactly 158 bytes and stops at `$256D48`. */
function installBeamTemplate(ram, rom) {
  const rec = BOMBRAM.rec;
  let s = BEAM_TEMPLATES.install, a1 = 0x06;           // $255FF0 lea $6(A6),A1
  const w = () => { ram.setU16(rec + a1, rom.u16(s)); s += 2; a1 += 2; };
  const l = () => { ram.setU32(rec + a1, rom.u32(s)); s += 4; a1 += 4; };
  const skip = (n) => { a1 += n; };
  l(); skip(4); w(); l(); l(); l(); w(); l(); l(); w(); l(); l();  // $255FF4..
  skip(0x7b0);                                         // $25600C lea ($7B0,A1)
  w(); skip(4); l(); skip(4); w(); l(); l(); l(); w(); l(); l(); l(); l(); w();
  w(); skip(4); l(); skip(4); w(); l(); l(); l(); w(); l(); l(); w(); l(); l();
  w(); skip(4); l(); skip(4); w(); l(); l(); l(); w(); l(); l(); l(); l(); w();
  return s - BEAM_TEMPLATES.install;                   // ...$256062
}

/** `$2561EE..$256208` / `$256282..$25629C` / `$2563F0..$256442` -- the ONE
 *  18-byte segment template, read three times with three different splices.
 *  `steps` is `[recordOffset, size|'skip']` in instruction order; `anim` is the
 *  long the ROM drops between them and `ptr` the long at `+$18` (which
 *  `$25629A`/`$256440` SKIP -- and skipping it is why a segment seeded in
 *  phase 2 keeps whatever pointer phase 1 left). */
function fillSegment(ram, rom, slot, pos, anim, ptr) {
  const t = BEAM_TEMPLATES.seg;
  ram.setU16(slot + 0x00, rom.u16(t));                 // $2561EE move.w (A2)+
  ram.setU32(slot + 0x02, pos >>> 0);                  // $2561FA move.l D0
  ram.setU32(slot + 0x06, rom.u32(t + 2));             // $2561FC move.l (A2)+
  ram.setU32(slot + 0x0a, anim >>> 0);                 // $2561FE move.l (A0)
  ram.setU16(slot + 0x0e, rom.u16(t + 6));             // $256200 move.w (A2)+
  ram.setU32(slot + 0x10, rom.u32(t + 8));             // $256202 move.l (A2)+
  ram.setU32(slot + 0x14, rom.u32(t + 12));            // $256204 move.l (A2)+
  if (ptr !== null) ram.setU32(slot + 0x18, ptr >>> 0); // $256206 move.l D5
  ram.setU16(slot + 0x1c, rom.u16(t + 16));            // $256208 move.w (A2)+
}

/**
 * `$2561AA` -- the 41 BEAM SEGMENTS.  Two arms, forked on `($18,A6)`, and they
 * are NOT the same loop with a flag:
 *
 *   `($18,A6) == 0` (phase 1)  `$2561C8 movea.l (A0,D0.w),A0` DEREFERENCES the
 *     pointer table, saves the pointer in D5, writes it to the segment's
 *     `+$18`, and a LIVE segment re-reads its anim through it every frame.
 *   `($18,A6) != 0` (phase 2)  `$256262 adda.w` does NOT dereference -- the
 *     POINTER ITSELF becomes the anim long -- `+$18` is skipped, and a live
 *     segment never re-reads.
 *
 * Transcribed as two loops for that reason.  `$2561B6 movea.l A6,A3` /
 * `$25625A movea.l A3,A6` is the ROM restoring the table base it walked off.
 */
function beamSegments2561AA(ram, rom, ctx, a5) {
  const rec = BOMBRAM.rec;
  // $2561AA subq.w #$4,($80A,A6) -- and ($80A,A6) is record 42's own +$2A.
  const t = u16(ram.u16(rec + 0x80a) - 4);             // $2561AA subq.w #$4
  ram.setU16(rec + 0x80a, (t & 0x8000) ? 0x1c : t);    // $2561AE bcc / $2561B0
  const cursor = ram.u16(rec + 0x80a);                 // $2561C0 / $256262
  const phase2 = ram.u16(rec + 0x18) !== 0;            // $2561B8 tst.w ($18,A6)
  const tbl = ram.u32(rec + 0x2c);                     // $2561C4 / $25625E
  const d4 = ram.u16(rec + 0x24);                      // $2561CE move.w ($24,A6)
  let ptr = 0, animSrc = 0;
  if (!phase2) {
    ptr = rom.u32(tbl + i16(cursor));                  // $2561C8 movea.l (A0,D0.w)
    animSrc = ptr + i16(d4);                           // $2561D2 adda.w D4,A0
  } else {
    animSrc = tbl + i16(cursor);                       // $256262 adda.w
  }
  let seeded = false, drawn = 0, killed = 0;           // $2561D6 moveq #$0,D6
  for (let n = 0; n < BEAM_REC.segs; n++) {            // $2561D4 moveq #$28,D7
    const a6 = rec + BEAM_REC.seg0 + n * BOMBRAM.stride;   // $2561D8 lea $811FA2
    if ((ram.u16(a6) & 0x8000) === 0) {                // $2561E4 tst.w / bmi
      if (seeded) continue;                            // $2561E8 tst.w D6 / bne
      const pos = (((u16(ram.u16(a5 + P.posY) + 0x600) << 16) >>> 0)
        + ram.u16(a5 + P.posX)) >>> 0;                 // $2561F0/$2561F4 addi.l
      fillSegment(ram, rom, a6, pos, rom.u32(animSrc),
        phase2 ? null : ptr);                          // $25629A skips +$18
      seeded = true;                                   // $25620A moveq #$1,D6
      // $25620C bra.b $25624C -- INTO the draw, not past it.  W66: W65 counted
      // this branch and never emitted the record; see the block comment below.
      draw23FF06(ram, ctx, a6);                        // $25624C jsr $23FF42
      drawn++; continue;
    }
    if (!phase2) {                                     // $25620E movea.l ($18,A6)
      ram.setU32(a6 + 0x0a, rom.u32(ram.u32(a6 + 0x18) + i16(d4)));  // $256212
    }
    let d0 = u16(u16(ram.u16(a6 + 0x02) + 0x200)       // $256218/$25621C
      + ram.u16(a5 + P.velY));                         // $256220 add.w ($30,A5)
    if (!beamSegmentAlive(ram, rec, d0, phase2)) {
      ram.setU16(a6, 0); killed++; continue;           // $25623A/$2562D8 clr.w
    }
    d0 = u16(d0 + 0x200);                              // $25623E addi.w #$200
    ram.setU32(a6 + 0x02, (((d0 << 16) >>> 0)
      + ram.u16(a5 + P.posX)) >>> 0);                  // $256244/$256248
    // ---------------------------------------------------------------- WAVE 66
    // **THE FORTY-ONE SEGMENTS NEVER EMITTED A RECORD.**  Both arms of this
    // loop end on a `jsr $23FF42` -- `$25624C` for the deref arm and `$2562EA`
    // for the no-deref one, with `$25620C bra.b $25624C` taking the freshly
    // seeded segment INTO the same call -- and W65 transcribed all three as a
    // bare `drawn++`.  The state was right (`[M]` W65 measured 31 of 45 records
    // live on the deployed page); there was simply no display-list record for
    // any segment, so the beam was four heads and nothing between them.
    //
    // NO GATE IN THIS REPO COULD HAVE SEEN IT BEFORE W66: bucket 13 had no
    // sprite shard, so every record it emitted was skipped anyway and a
    // MISSING record and a SKIPPED record look identical on the screen.  It
    // was found by opening the page with the art shipped -- `47-impl` §2.3 and
    // W58 §5.2 for the third and fourth time.
    draw23FF06(ram, ctx, a6);                          // $25624C jsr $23FF42
    drawn++;
  }
  ctx.bombEvent?.('beam-seg', `${drawn}/${killed}`);
  return { drawn, killed, seeded };
}

/** `$256224..$256238` (phase 1) and `$2562AE..$2562D6` (phase 2) -- the cull.
 *  **THE TWO ARE NOT THE SAME TEST** and merging them is the mistake this
 *  function exists to prevent: phase 2 adds a whole `$812954 == 0` branch that
 *  reads record 44's `($28)` and record 0's bit 6 and compares against record
 *  44's Y, and phase 1 goes straight to the `$7800` bound. */
function beamSegmentAlive(ram, rec, d0, phase2) {
  if (ram.u16(BOMBRAM.g12954) !== 0) {                 // $256224 / $2562AE tst.w
    if (d0 > ram.u16(BOMBRAM.g12952)) return false;    // $25622C / $2562CA bhi
    return d0 < 0x7800;                                // $256234 / $2562D2 bcs
  }
  if (!phase2) return d0 < 0x7800;                     // $256234 cmpi.w / bcs
  if (ram.u16(rec + BEAM_REC.tip + 0x28) !== 0        // $2562B6 tst.w ($868,A3)
    && !ram.btst8(rec, 6)) {                           // $2562BA btst #$6,(A3)
    if (d0 > ram.u16(rec + BEAM_REC.tip + 0x02)) return false;   // $2562C2 bhi
  }
  return d0 < 0x7800;                                  // $2562D2 cmpi.w / bcs
}

/** `$2562FC` -- record 42's mover.  Twenty-one instructions and every one of
 *  its three RAM writes is a bit or a word of that record. */
function beamHead2562FC(ram) {
  const rec = BOMBRAM.rec, a6 = rec + BEAM_REC.tail;
  if (ram.u16(a6 + 0x28) !== 0) return;                // $256302 tst.w / bne
  if (ram.u16(BOMBRAM.g12954) === 0) {                 // $256308 tst.w / bne
    // $256310 tst.w ($868,A0) / beq $25631C  -- record 44's ($28).
    // $256316 btst #$6,(A0) / beq $25633C    -- record 0's bit 6.
    // NOTE THE SENSE: a non-zero ($868,A0) does NOT skip; it goes on to test
    // the bit, and only a CLEAR bit stops the move.
    if (ram.u16(rec + BEAM_REC.tip + 0x28) !== 0 && !ram.btst8(rec, 6)) {
      ram.bset8(a6, 1); return;                        // $25633C bset #$1,(A6)
    }
  } else { ram.bset8(a6, 1); return; }                 // $25633C
  ram.bclr8(a6, 1);                                    // $25631C bclr #$1,(A6)
  const d0 = u16(u16(ram.u16(a6 + 0x02) + 0x400)       // $256320/$256324
    + ram.u16(RAM.player1 + P.velY));                  // $256328 add.w ($30,A5)
  ram.setU16(a6 + 0x02, d0);                           // $25632C move.w D0
  if (d0 >= 0x7e00) ram.setU16(a6 + 0x28, 1);          // $256330 cmpi / $256336
}

/** `$256348` -- record 44's mover, **and `$256346` two bytes in front of it is
 *  a BARE `rts` that `$256128 bsr.w $256346` calls on purpose.**  READ PAST THE
 *  APPARENT END, in the other direction: a reader who starts at `$256348`
 *  never sees that the ROM has a call to a no-op immediately before it, and a
 *  reader who starts at `$256346` reads the `rts` as this routine's. */
function beamHead256348(ram, ctx) {
  const rec = BOMBRAM.rec, a6 = rec + BEAM_REC.tip;
  note(ctx, BOMB.beamNop256346, `$256128 bsr.w $256346, and $256346 is ONE `
    + `instruction -- a bare rts, two bytes in front of $256348, which the `
    + `very next instruction ($25612C) calls. Transcribed as the call it is`);
  let d1 = ram.u16(BOMBRAM.g12952);                    // $25634E move.w $812952
  if (ram.u16(BOMBRAM.g12954) === 0) {                 // $256354 tst.w / bne
    if (ram.u16(a6 + 0x28) === 0) return beamTip256386(ram);   // $25635C beq
    d1 = ram.u16(a6 + 0x02);                           // $256362 move.w ($2,A6)
    if (ram.bset8(rec, 5)) return beamTip256386(ram);  // $256366 bset #$5 / bne
  } else {
    ram.bclr8(rec, 5);                                 // $25636E bclr #$5,(A0)
  }
  ram.bclr8(rec, 6);                                   // $256372 bclr #$6,(A0)
  ram.bclr8(a6, 1);                                    // $256376 bclr #$1,(A6)
  ram.setU16(a6 + 0x02, d1);                           // $25637A move.w D1
  ram.setU16(a6 + 0x28, 1);                            // $25637E move.w #$1
  return undefined;                                    // $256384 bra $2563B0
}

/** `$256386` -- the other arm, and its `bset` reads the OLD bit exactly the way
 *  `$255F7E`'s `bchg` does (W64 2.1's fourth trap, same family). */
function beamTip256386(ram) {
  const rec = BOMBRAM.rec, a6 = rec + BEAM_REC.tip;
  if (ram.bset8(a6, 1)) return undefined;              // $256386 bset #$1 / bne
  ram.bclr8(rec + BEAM_REC.tail, 1);                   // $25638C bclr #$1,($7E0)
  let d0 = u16(ram.u16(a6 + 0x02) + 0x400);            // $256392/$256396
  if (ram.u16(rec + 0x18) !== 0) d0 = u16(d0 - 0x800); // $25639A tst / $2563A0
  ram.setU16(rec + BEAM_REC.tail + 0x02, d0);          // $2563A4 move.w
  ram.setU16(rec + BEAM_REC.tail + 0x28, 0);           // $2563A8 clr.w ($808,A0)
  ram.bset8(rec, 6);                                   // $2563AC bset #$6,(A0)
  return undefined;
}

/** `$2563B6` -- phase 2's segment builder.  It REBUILDS all 41 from the ship
 *  outward every frame, `+$400` apart, and the first one that fails the bound
 *  sets D5, after which the remaining segments are CLEARED rather than skipped
 *  -- so the beam has a hard end and nothing past it survives. */
function beamRebuild2563B6(ram, rom, a5) {
  const rec = BOMBRAM.rec;
  // $2563BE..$2563CC: D6 = (playerY + $600 - velY) : playerX, built by SWAPPING
  // twice around the two word ops.  The long axis is the HIGH word.
  let hi = u16(u16(ram.u16(a5 + P.posY) + 0x600) - ram.u16(a5 + P.velY));
  const lo = ram.u16(a5 + P.posX);
  let d5 = false, built = 0, cleared = 0;              // $2563CE moveq #$0,D5
  const tbl = ram.u32(rec + 0x2c);                     // $2563E2 movea.l ($2C,A6)
  for (let n = 0; n < BEAM_REC.segs; n++) {            // $2563B6 moveq #$28,D7
    const a1 = rec + BEAM_REC.seg0 + n * BOMBRAM.stride;
    if (d5) {                                          // $2563D0 tst.w D5 / beq
      ram.setU16(a1, 0); cleared++; continue;          // $2563D4 clr.w (A1)
    }
    const anim = rom.u32(tbl + i16(ram.u16(rec + 0x80a)));   // $2563E6/$256438
    const pos = (((hi << 16) >>> 0) + lo) >>> 0;
    // $2563F6 swap D6 / $2563F8 addi.w #$400,D6 -- the NEXT segment's Y, and
    // the bound below is tested against THAT and not against this segment's.
    hi = u16(hi + 0x400);
    if (ram.u16(BOMBRAM.g12954) !== 0) {               // $2563FC tst.w / bne
      if (hi >= 0x7800) d5 = true;                     // $25642E cmpi.w / bcs
    } else if (!ram.btst8(rec + BEAM_REC.tip, 1)) {    // $256404 btst #$1,($840)
      if (hi < ram.u16(rec + BEAM_REC.tip + 0x02)) {   // $25640A cmp.w / bcs
        // falls to $256436 with D5 still 0
      } else {
        ram.setU16(rec + BEAM_REC.tip + 0x02, hi);     // $256412 move.w D6
        d5 = true;                                     // $256416 bra $256434
      }
    } else if (ram.btst8(rec + BEAM_REC.tail, 1)) {    // $256418 btst #$1,($7E0)
      if (hi >= 0x7800) d5 = true;                     // $25642E
    } else {
      const bound = u16(ram.u16(rec + BEAM_REC.tail + 0x02) + 0x800);  // $25641E
      if (hi >= bound) d5 = true;                      // $256428 cmp.w / bcs
    }
    fillSegment(ram, rom, a1, pos, anim, null);        // $256440 SKIPS +$18
    built++;
    const c = u16(ram.u16(rec + 0x80a) + 4);           // $256448 addq.w #$4
    ram.setU16(rec + 0x80a, c === 0x20 ? 0 : c);       // $25644C cmpi / $256454
  }
  ram.setU16(rec + 0x80a, 0x1c);                       // $256460 move.w #$1C
  return { built, cleared };
}

/** `$256468` -- the LASER BOMB's own reset, one instruction before the shared
 *  teardown.  It is NOT `$2564F0`: it wipes the BEAM (through `$25270C`, the
 *  entry with the `andi.w #$DFFB` on it that `src/items.js` owns), clears the
 *  bomb bit 6 the damage pass reads, clears the sound queue word and clears
 *  `$812954` -- the "nearest enemy the beam struck" pointer `$2456A6` sets. */
function beamReset256468(ram, ctx) {
  const p2 = (ram.u8(BOMBRAM.rec + B.low) & 0x80) !== 0;   // $25646E tst.b / bmi
  beamReset25270C(ram, ctx, p2 ? 1 : 0);               // $25647A / $256496 jsr
  ram.bclr8((p2 ? RAM.player2 : RAM.player1) + 0x01, 6);  // $256480 / $25649C
  ram.setU16(p2 ? BOMBRAM.soundQueueP2 : BOMBRAM.soundQueue, 0);  // $256488/$2564A4
  ram.bclr8((p2 ? RAM.player2 : RAM.player1) + 0x01, 7);  // $2564AA bclr #$7
  ram.setU32(BOMBRAM.g12954, 0);                       // $2564B2 move.l D0
}

/**
 * `$255FE2` -- **THE LASER BOMB**, one frame.
 * @param p2 the record's own bit 7, which is the ONLY thing that says which
 *        player fired -- the driver's A4/A5 came from the same byte.
 */
export function bombScriptAlt255FE2(ram, rom, ctx, p2) {
  const rec = BOMBRAM.rec;
  const a5 = p2 ? RAM.player2 : RAM.player1;           // $255DFE / $255E10 lea
  if (!ram.bset8(rec, 0)) {                            // $255FE2 bset #$0 / bne
    installBeamTemplate(ram, rom);                     // $255FEA..$256062
    // $256064 move.w ($2,A5),D0 / addi.w #$FE00,D0 -- the PLAYER's long axis
    // minus $200, dropped on record 42's +$02.  `#$FE00` is $-200 as a word.
    ram.setU16(rec + BEAM_REC.tail + 0x02,
      u16(ram.u16(a5 + P.posY) + 0xfe00));             // $25606C move.w
    ram.setU16(BOMBRAM.g12968, 0);                     // $256072 move.w D0
    let cue = BOMB.beamCue28C528;
    if (ram.btst8(rec + B.low, 1)) {                   // $25607E btst #$1
      ram.setU32(rec + B.script, 0x256986);            // $256086
      ram.setU32(rec + 0x28, 0x256a36);                // $25608E
      ram.setU32(rec + 0x2c, 0x2569b6);                // $256096
      ram.setU32(rec + BEAM_REC.tail + B.script, 0x25699e); // $25609E
      ram.setU32(rec + BEAM_REC.mid + B.script, 0x256992);  // $2560A6
      ram.setU32(rec + BEAM_REC.tip + B.script, 0x2569aa);  // $2560AE
      cue = BOMB.beamCue28C542;                        // $2560B6 lea $28C542,A0
    }
    ctx.soundPost?.(cue);  // WAVE A: BGM id=$F, LASER BOMB cue ($2560BC)
    ctx.bombEvent?.('beam-init', 0);
  }
  // ---- $2560BE: the four heads follow the ship.  THREE of the four writes are
  // `move.w`, so records 42 and 44 get only the SHORT axis (D0's low word).
  const pos = ram.u32(a5 + P.posY);                    // $2560BE move.l ($2,A5)
  ram.setU32(rec + 0x02, pos);                         // $2560C2 move.l
  ram.setU16(rec + BEAM_REC.tail + 0x04, pos & 0xffff);   // $2560C6 move.w
  ram.setU32(rec + BEAM_REC.mid + 0x02, pos);          // $2560CA move.l
  ram.setU16(rec + BEAM_REC.tip + 0x04, pos & 0xffff); // $2560CE move.w
  const t = u16(ram.u16(rec + 0x24) - 4);              // $2560D2 subq.w #$4
  ram.setU16(rec + 0x24, (t & 0x8000) ? ram.u16(rec + 0x26) : t);  // $2560D8

  if (ram.u16(rec + 0x18) === 0) {                     // $2560DE tst.w / bne
    const d0 = ram.u16(rec + 0x24);                    // $2560E6 move.w ($24,A6)
    ram.setU32(rec + 0x0a, rom.u32(ram.u32(rec + 0x1e) + i16(d0)));      // $2560EA
    ram.setU32(rec + BEAM_REC.tail + 0x0a,
      rom.u32(ram.u32(rec + BEAM_REC.tail + 0x1e) + i16(d0)));           // $2560F4
    ram.setU32(rec + BEAM_REC.mid + 0x0a,
      rom.u32(ram.u32(rec + BEAM_REC.mid + 0x1e) + i16(d0)));            // $2560FE
    ram.setU32(rec + BEAM_REC.tip + 0x0a,
      rom.u32(ram.u32(rec + BEAM_REC.tip + 0x1e) + i16(d0)));            // $256108
    const life = u16(ram.u16(rec + 0x1a) - 1);         // $256112 subq.w #$1
    ram.setU16(rec + 0x1a, life);
    if (life === 0) {                                  // $256116 bne $256120
      ram.setU16(rec + 0x18, 1);                       // $256118 move.w #$1
      ctx.bombEvent?.('beam-phase', 2);
      return beamListStep25616C(ram, rom, ctx, a5);    // $25611E bra $25616C
    }
    return beamFrame256120(ram, rom, ctx, a5);         // $256120 bsr $2561AA
  }
  return beamListStep25616C(ram, rom, ctx, a5);        // $2560E2 bne.w $25616C
}

/** `$256120..$25616A` -- the shared per-frame tail: the segments, the two head
 *  movers, `$256346`'s bare `rts`, and FOUR conditional `$23FF06` draws.  The
 *  fourth is followed by `moveq #$2,D0 / jmp $289FF4` -- and D0 is DEAD, because
 *  `$289FF4`'s own `$28A012 moveq #$0,D0` overwrites it before the fill. */
function beamFrame256120(ram, rom, ctx, a5) {
  const rec = BOMBRAM.rec;
  beamSegments2561AA(ram, rom, ctx, a5);               // $256120 bsr $2561AA
  beamHead2562FC(ram);                                 // $256124 bsr $2562FC
  beamHead256348(ram, ctx);                            // $256128/$25612C bsr
  draw23FF06(ram, ctx, rec);                           // $256130 jsr $23FF06
  if (!ram.btst8(rec + BEAM_REC.tail, 1)) {            // $25613A btst #$1 / bne
    draw23FF06(ram, ctx, rec + BEAM_REC.tail);         // $256140 jsr
  }
  draw23FF06(ram, ctx, rec + BEAM_REC.mid);            // $25614A jsr
  if (ram.btst8(rec + BEAM_REC.tip, 1)) return;        // $256154 btst / $25616A
  draw23FF06(ram, ctx, rec + BEAM_REC.tip);            // $25615A jsr
  // $256160 moveq #$2,D0 -- DEAD.  $28A012 `moveq #$0,D0` is the kind $28A1DA
  // actually sees, which is why `fillSlot` gets 0 and not 2.
  spawnBeamBombSpark289FF4(ram, rom, ctx, rec + BEAM_REC.tip);   // $256162 jmp
}

/** `$25616C` -- phase 2.  Twelve five-longword entries at ONE PER FRAME, and
 *  the fifth long of each is a NEW eight-pointer table for `($2C,A6)`. */
function beamListStep25616C(ram, rom, ctx, a5) {
  const rec = BOMBRAM.rec;
  let a0 = ram.u32(rec + 0x28);                        // $25616C movea.l ($28,A6)
  if (rom.u32(a0) === 0xffffffff) {                    // $256170 cmpi.l / beq
    ram.setU16(BOMBRAM.cooldown, 0x28);                // $25619A move.w #$28
    beamReset256468(ram, ctx);                         // $2561A2 bsr $256468
    bombTeardown2564F0(ram, ctx);                      // $2561A6 bra $2564F0
    return;
  }
  ram.setU32(rec + 0x0a, rom.u32(a0));                 // $25617A move.l (A0)+
  ram.setU32(rec + BEAM_REC.tail + 0x0a, rom.u32(a0 + 4));    // $25617E
  ram.setU32(rec + BEAM_REC.mid + 0x0a, rom.u32(a0 + 8));     // $256182
  ram.setU32(rec + BEAM_REC.tip + 0x0a, rom.u32(a0 + 12));    // $256186
  ram.setU32(rec + 0x2c, rom.u32(a0 + 16));            // $25618A move.l (A0)+
  a0 += 20;
  ram.setU32(rec + 0x28, a0);                          // $25618E move.l A0
  beamRebuild2563B6(ram, rom, a5);                     // $256192 bsr $2563B6
  beamFrame256120(ram, rom, ctx, a5);                  // $256196 bra $256120
}

// ===========================================================================
// `$24560A` -- **THE NINTH BLOCK OF `$244D62`, THE BOMB'S DAMAGE**
// ===========================================================================
/**
 * 966 bytes / 468 instructions, and `src/damage.js` has carried its two guards
 * and a throw since W51.  Both guards are the bomb's own writes:
 *
 *   $245612 move.w (A6),D5 / $245614 bpl $2459CE   `$811F72` NEGATIVE
 *   $245618 btst #$6,$1(A4) / beq $2459CE          `$8103E7` bit 6
 *
 * The block then FORKS on `btst #$0,D5` -- bit 0 of the RECORD's type word,
 * which is bit 0 of `($58,A6)`:
 *
 *   clear -> `$245638`: **150 slots of `$20` from `$81459C`**, and every live
 *            one whose box is on screen loses `D5` HP and takes the frame's
 *            hit mask.  THE SCREEN-WIDE DAMAGE.  This is the arm this port
 *            takes and it is transcribed in full below.
 *   set   -> `$2456A6`: a bounding box built over all 45 records and then two
 *            pool walks.  Throws by address.
 *
 * **READ PAST THE APPARENT END, twice.**  `$2456A4` is an `rts` that ends the
 * first arm, and `$2459CE` -- the guards' target -- is an `rts` that ends the
 * SECOND, two bytes before `$2459D0`, which is `playerBox`.  Neither is the
 * end of a routine a reader would find by starting at `$24560A` and reading
 * forward.
 *
 * **THE 150 IS NOT POOL A'S 100.**  `$245644 moveq #$95,D7` is 149, so the
 * `dbra` runs 150 times over a `$20` stride, i.e. `$81459C..$81585B` -- which
 * runs off the end of pool A (100 slots, `$814D9B`), across the gap, and into
 * pool B (`$81521C`).  `src/damage.js`'s own passes use `$815E9E`/`$815EA0`
 * as counts; this one uses a CONSTANT and does not.  Transcribed as written;
 * a port that "fixed" it to `poolACount` would damage a different set of
 * enemies from the board.
 */
function transformedPlayerDamage(ctx, amount, source) {
  const transform = ctx?.playerDamageTransform;
  if (!transform) return amount;
  const result = transform(amount & 0xffff, source);
  if (!Number.isFinite(result)) return amount;
  return Math.max(0, Math.min(0xffff, Math.trunc(result)));
}

export function bombDamage24560A(ram, ctx, a4) {
  const d5rec = ram.u16(BOMBRAM.rec);                  // $245612 move.w (A6),D5
  if ((d5rec & 0x8000) === 0) return null;             // $245614 bpl.w $2459CE
  if (!ram.btst8(a4 + 0x01, 6)) return null;           // $245618 btst #$6 / beq

  ram.setU16(BOMBRAM.g12952, 0x7800);                  // $245622 move.w #$7800
  ram.setU32(BOMBRAM.g12954, 0);                       // $24562C move.l D0

  if ((d5rec & 0x1) !== 0) {                           // $245632 btst #$0,D5
    return bombDamageAlt2456A6(ram, ctx, a4);          // $245636 bne.b $2456A6
  }

  const d6 = ram.u16(BOMBRAM.hitMask);                 // $24563E move.w $80FA72
  // $245648 moveq #$50,D5 / $24564A tst.w ($1e,A6) / bne -> keep $50, else 1.
  // ($1e,A6) is the SCRIPT POINTER's HIGH word, so the damage is $50 for every
  // frame the driver has installed a script and **1** for the frames between
  // the record's allocation and the driver's first init.  One, not zero and
  // not $50 -- and it is a whole frame of the bomb's damage.
  let d5 = ram.u16(BOMBRAM.rec + B.script) !== 0 ? 0x50 : 1;
  d5 = transformedPlayerDamage(ctx, d5, 'bomb');

  let hits = 0;
  for (let n = 0; n < 150; n++) {                      // $245644 move.w #$95,D7
    const a5 = BOMBRAM.poolA + n * BOMBRAM.poolAStride;
    const d0w = ram.u16(a5);                           // $245652 move.w (A5),D0
    if ((d0w & 0x8000) === 0) continue;                // $245654 bpl $24569C
    if ((ram.u16(a5 + 0x18) & 0x8000) !== 0) continue; // $245656 tst.w / bmi
    if ((d0w & 0x2000) === 0) continue;                // $24565C btst #$D,D0
    // $245662 lea ($10,A5),A1 -- the enemy's four half-extents, in the order
    // +Y, -Y, +X, -X, read with FOUR post-increments off ONE pointer.
    const y = ram.u16(a5 + 0x02);                      // $245666 move.w $2(A5)
    const d0 = u16(y + ram.u16(a5 + 0x10));            // $24566C add.w (A1)+,D0
    // $24566E addi.w #$2800,D0 / $245672 bcs -- the CARRY out of a WORD add.
    if (d0 + 0x2800 > 0xffff) continue;
    const d1 = u16(u16(y - ram.u16(a5 + 0x12)) + 0x2800);  // $245674 / $245676
    if (d1 > 0x9800) continue;                         // $24567A cmpi / bhi
    const x = ram.u16(a5 + 0x04);                      // $245680 move.w $4(A5)
    const d2 = u16(x + ram.u16(a5 + 0x14));            // $245686 add.w (A1)+,D2
    if ((d2 & 0x8000) !== 0) continue;                 // $245688 bmi $24569C
    const d3 = u16(u16(x - ram.u16(a5 + 0x16)) + 0x2800);  // $24568A / $24568C
    if (d3 > 0x6000) continue;                         // $245690 cmpi / bhi
    ram.setU16(a5 + 0x18, u16(ram.u16(a5 + 0x18) - d5));   // $245696 sub.w D5
    ram.setU16(a5, u16(ram.u16(a5) | d6));                 // $24569A or.w D6,(A5)
    hits++;
  }
  ctx.bombEvent?.('damage', hits);
  return { hits, hp: d5 };
}

// ===========================================================================
// W65 (B3) -- `$2456A6`, **THE LASER BOMB'S DAMAGE**
// ===========================================================================
//
// 266 instructions, no calls, and it is a completely different weapon from
// `$245638`'s.  `$245638` walks 150 fixed slots and takes `$50` off anything
// whose own box is on screen.  `$2456A6` builds a BOUNDING BOX over the beam,
// then asks THREE pools whether they intersect it:
//
//   POOL B  `$81521C`, 50 slots -- finds the NEAREST intersecting one, records
//           it in `$812952`/`$812954`, and hits **exactly one** for `$208`.
//   POOL A  `$81459C`, 100 slots -- hits **every** intersecting one for `$1E0`.
//   BULLETS `$817F8C`, 70/110/160/190/210 slots -- **ERASES** every one inside.
//
// **AND IT IS THE THIRD AND FOURTH SETTER OF THE `$400` HIT BIT.**  W64 6.1
// says "the `$400` bit has exactly two setters and both are in the A2/A3 weapon
// loops (`$245242`, `$2452F2`)", quoting recon 38 1.5.  `[M]` a census of
// `ori.w #$400`/`#$4400` over `$230000..$2B0000` finds SIX in the damage
// family, and two of them are `$24580E` and `$2458E2` -- **here**.  So a LASER
// BOMB kill goes through `$286876`, `src/score.js`'s SECOND chain machine, and
// an ordinary bomb kill does not.  That is measured in the worklog's 6.
//
// D6 IS `$2800` AND IT IS THE CALLER'S.  `$24563E move.w $80FA72,D6` -- the
// hit mask -- is on the OTHER arm, past `$245636 bne`.  On every path into
// `$24560A` D6 was set by `$24518A move.w #$2800,D6`, so this arm's D6 is the
// COORDINATE BIAS and never the mask.  A port that hoisted the `move.w
// $80FA72,D6` above the fork would bias every box by the mask.

/** `$2456A6..$245708` -- the box, over all 45 records.  Note `$2456C6 tst.w
 *  (A6)+`: the pointer advances by 2 BEFORE the fields are read, which is why
 *  `$245704 lea ($2E,A6),A6` is $2E and not $30, and why `($E,A6)` is record
 *  offset `+$10`. */
function beamBox2456A6(ram) {
  const box = [0xf800, 0x4000, 0xf800, 0x7c00];        // $2456A6..$2456B8
  let live = 0;
  for (let n = 0; n < BOMBRAM.slots; n++) {            // $2456BC move.w #$2C,D5
    const a6 = BOMBRAM.rec + n * BOMBRAM.stride;
    if ((ram.u16(a6) & 0x8000) === 0) continue;        // $2456C6 tst.w (A6)+/bpl
    live++;
    const d0 = i16(u16(ram.u16(a6 + 0x02) + ram.u16(a6 + 0x10)));   // $2456D6
    const d1 = i16(u16(ram.u16(a6 + 0x02) - ram.u16(a6 + 0x12)));   // $2456D8
    const d2 = i16(u16(ram.u16(a6 + 0x04) + ram.u16(a6 + 0x14)));   // $2456DA
    const d3 = i16(u16(ram.u16(a6 + 0x04) - ram.u16(a6 + 0x16)));   // $2456DC
    // `ble`/`bge` are SIGNED, so this is a signed max/min and the seeds
    // ($F800 = -2,048 and $4000/$7C00) are signed too.  Transcribed as signed.
    if (d2 > i16(box[0])) box[0] = u16(d2);            // $2456E4 cmp/ble/move
    if (d3 < i16(box[1])) box[1] = u16(d3);            // $2456EC cmp/bge/move
    if (d0 > i16(box[2])) box[2] = u16(d0);            // $2456F4 cmp/ble/move
    if (d1 < i16(box[3])) box[3] = u16(d1);            // $2456FC cmp/bge/move
  }
  // **THE BOX IS RAM, NOT A REGISTER.**  `$2456AA lea $80FA74,A5` and the four
  // `move.w D?,(-$2,A5)` stores put it at `$80FA74`, which is the SAME four
  // words `src/damage.js` `BOX` uses for the player's own box and which
  // `$245760`/`$245866`/`$24595A` then re-read through A6.  The first draft
  // kept it in a JS array and left the RAM untouched -- correct arithmetic,
  // four missing stores, and invisible to every row that only counted hits.
  for (let i = 0; i < 4; i++) ram.setU16(BOMBRAM.box + i * 2, box[i]);
  return { box, live };
}

/** `$245788..$2457EC`, `$24589E..$2458F4` and `$245978..$2459C0` -- the SAME
 *  AABB against ONE bomb record, at three call sites with three different
 *  starting records and counts.  The bullets' site passes `d0 === d1` and
 *  `d2 === d3`, i.e. a POINT, and that is the only difference.
 *
 *  **ALL FOUR TESTS ARE UNSIGNED, AND W413 FIXED THEM.**  `$2457A0`, `$2457A8`,
 *  `$2457B8`, `$2457C0` are `65 xx` -- `bcs`, the CARRY, i.e. unsigned LOWER --
 *  and so are their twins at `$2458B6`/`$2458BE`/`$2458CE`/`$2458D6` and
 *  `$245990`/`$245998`/`$2459A8`/`$2459B0`.  The first draft wrote all twelve
 *  as `i16(...)` signed compares while quoting `bcs` in the comment beside
 *  them, which is the shape W411 warns about: a wrong reading with the right
 *  citation next to it.
 *
 *  **IT IS NOT A CORNER CASE, IT IS THE TOP OF THE SCREEN.**  Every coordinate
 *  here carries D6's `$2800` bias, so a raw Y of `$5800` and up biases to
 *  `$8000` and up and reads NEGATIVE as `i16`.  `[M]` the stage-1 boss's own
 *  sub-record, taken verbatim from the board's RAM at lf9,000
 *  (`$81523C`: Y `$697D`, half-extents `$0E00`/`$1780`/`$0800`/`$0800`), has a
 *  biased far edge of `$9F7D` on EVERY checkpoint of the fight, and the beam's
 *  own segments bias past `$8000` from segment 24 outward.  Signed, ten
 *  intersecting segments were rejected -- nine at test 1, one at test 2 -- and
 *  `$812954` stayed 0, so `$2457FA tst.w / beq` skipped the ONE pool-B hit and
 *  the boss took nothing for all 131 damage frames.  Unsigned, it takes it. */
function recordHitsBox(ram, a6, d6, d0, d1, d2, d3) {
  const d4y = u16(u16(ram.u16(a6 + 0x02) + d6) + ram.u16(a6 + 0x10));
  if (d4y < d1) return false;                          // $24579E cmp.w D1,D4/bcs
  const d5y = u16(u16(ram.u16(a6 + 0x02) + d6) - ram.u16(a6 + 0x12));
  if (d0 < d5y) return false;                          // $2457A6 cmp.w D5,D0/bcs
  const d4x = u16(u16(ram.u16(a6 + 0x04) + d6) + ram.u16(a6 + 0x14));
  if (d4x < d3) return false;                          // $2457B6 cmp.w D3,D4/bcs
  const d5x = u16(u16(ram.u16(a6 + 0x04) + d6) - ram.u16(a6 + 0x16));
  if (d2 < d5x) return false;                          // $2457BE cmp.w D5,D2/bcs
  return true;
}

/** The record-walk guard all three sites share: `move.b (A6),D4 / bpl` (the
 *  record must be LIVE) and `btst #$1,D4 / bne` (**and its bit 1 must be
 *  CLEAR** -- the same bit `$2562FC`/`$256348` toggle, so a head that is
 *  "parked" does no damage). */
function beamRecordArmed(ram, a6) {
  const d4 = ram.u8(a6);                               // $245788 move.b (A6),D4
  return (d4 & 0x80) !== 0 && (d4 & 0x02) === 0;       // $24578A bpl / $24578C
}

/**
 * `$2456A6` -- the LASER BOMB's damage pass, one frame.
 * @param a4 the PLAYER record; `$2457CE move.w ($2,A4),D5` is the only read.
 */
export function bombDamageAlt2456A6(ram, ctx, a4) {
  const d6 = 0x2800;                                   // $24518A move.w #$2800
  const { box, live } = beamBox2456A6(ram);
  for (let i = 0; i < 4; i++) {                        // $24570C add.w D6,(A5)+
    box[i] = u16(box[i] + d6);
    ram.setU16(BOMBRAM.box + i * 2, box[i]);           // ...and it is IN PLACE
  }

  // ---- $24571A: POOL B, 50 slots.  It does NOT damage inside the loop; it
  // finds the NEAREST intersecting enemy and damages that one at $2457FA.
  for (let n = 0; n < 50; n++) {                       // $245720 moveq #$31,D7
    const a5 = BOMBRAM.poolB + n * BOMBRAM.poolBStride;
    const d0w = ram.u16(a5);                           // $245730 move.w (A5),D0
    if ((d0w & 0x8000) === 0) continue;                // $245732 bpl
    if ((ram.u16(a5 + 0x18) & 0x8000) !== 0) continue; // $245734 tst.w/bmi
    // $24573A btst #$D,D0 / bne $245746 -- bit 13 SET goes straight on; only a
    // CLEAR bit 13 needs bit 0, and a clear bit 0 rejects.
    if ((d0w & 0x2000) === 0 && (d0w & 0x1) === 0) continue;   // $245740 btst #$0
    const d0 = u16(u16(ram.u16(a5 + 0x02) + d6) + ram.u16(a5 + 0x10));  // $245758
    const d1 = u16(u16(ram.u16(a5 + 0x02) + d6) - ram.u16(a5 + 0x12));  // $24575A
    const d2 = u16(u16(ram.u16(a5 + 0x04) + d6) + ram.u16(a5 + 0x14));  // $24575C
    const d3 = u16(u16(ram.u16(a5 + 0x04) + d6) - ram.u16(a5 + 0x16));  // $24575E
    if (d3 > box[0]) continue;                         // $245766 cmp/bhi
    if (d2 < box[1]) continue;                         // $24576A cmp/bcs
    if (d1 > box[2]) continue;                         // $24576E cmp/bhi
    if (d0 < box[3]) continue;                         // $245772 cmp/bcs
    if (d1 >= 0x9800) continue;                        // $245776 cmpi/bcc
    for (let k = 1; k < 1 + BEAM_REC.segs; k++) {      // $245780 lea $30 / #$28
      const a6 = BOMBRAM.rec + k * BOMBRAM.stride;
      if (!beamRecordArmed(ram, a6)) continue;
      if (!recordHitsBox(ram, a6, d6, d0, d1, d2, d3)) continue;
      // $2457C2: D4 = D1 - D6, the enemy's own un-biased near edge, FLOORED at
      // the player's Y + $C00.  The floor is why the beam cannot report a
      // target behind the ship.
      let d4 = u16(d1 - d6);                           // $2457C2/$2457C4
      if (d4 >= ram.u16(BOMBRAM.g12952)) continue;     // $2457C6 cmp/bcc
      const d5 = u16(ram.u16(a4 + P.posY) + 0xc00);    // $2457CE/$2457D2
      if (d4 <= d5) d4 = d5;                           // $2457D6 bhi / $2457DA
      ram.setU16(BOMBRAM.g12952, d4);                  // $2457DC move.w
      ram.setU32(BOMBRAM.g12954, a5);                  // $2457E2 move.l A5
      break;                                           // ...$2457E8 continues,
    }                                                  // but a hit cannot beat
  }                                                    // itself, so this is it

  // ---- $2457FA: **ONE** pool-B enemy, and it is the one $812954 names.
  let hitsB = 0;
  if (ram.u16(BOMBRAM.g12954) !== 0) {                 // $2457FA tst.w / beq
    const a5 = ram.u32(BOMBRAM.g12954);                // $245802 movea.l
    const d4 = u16(ram.u16(BOMBRAM.hitMask) | 0x400);  // $245808/$24580E ori #$400
    ram.setU16(a5, u16(ram.u16(a5) | d4));             // $245812 or.w D4,(A5)
    ctx.bombEvent?.('beam-400', 'B');                  // recon 38 1.5 is stale
    const damage = transformedPlayerDamage(ctx, 0x208, 'laser-bomb');
    ram.setU16(a5 + 0x18, u16(ram.u16(a5 + 0x18) - damage));  // $245814 subi.w
    hitsB = 1;
  }

  // ---- $24581C: POOL A, 100 slots, and EVERY intersecting one is hit.
  let hitsA = 0;
  for (let n = 0; n < 100; n++) {                      // $245822 move.w #$63,D7
    const a5 = BOMBRAM.poolA + n * BOMBRAM.poolAStride;
    const d1w = ram.u16(a5);                           // $245834 move.w (A5),D1
    if ((d1w & 0x8000) === 0) continue;                // $245836 bpl
    // $245838: bit 13 SET -> also require ($18,A5) NON-negative; bit 13 clear
    // -> bit 0 must be SET and ($18,A5) is NOT tested.  The two arms are not
    // symmetric and `$245844 bra $245828` is the third.
    if ((d1w & 0x2000) !== 0) {
      if ((ram.u16(a5 + 0x18) & 0x8000) !== 0) continue;   // $245846 tst/bmi
    } else if ((d1w & 0x1) === 0) continue;            // $24583E btst #$0/$245844
    const d0 = u16(u16(ram.u16(a5 + 0x02) + d6) + ram.u16(a5 + 0x10));  // $24585E
    const d1 = u16(u16(ram.u16(a5 + 0x02) + d6) - ram.u16(a5 + 0x12));  // $245860
    const d2 = u16(u16(ram.u16(a5 + 0x04) + d6) + ram.u16(a5 + 0x14));  // $245862
    const d3 = u16(u16(ram.u16(a5 + 0x04) + d6) - ram.u16(a5 + 0x16));  // $245864
    if (d3 > box[0] || d2 < box[1] || d1 > box[2] || d0 < box[3]) continue;
    const d4 = ram.u16(a5 + 0x02);                     // $24587C move.w $2(A5)
    if (d4 >= 0x7000) continue;                        // $245880 cmpi/bcc
    // **AND THE POOL-B TARGET SHADOWS POOL A**: with $812954 set, a pool-A
    // enemy BEHIND the nearest pool-B one takes nothing.  The beam stops at
    // the first big thing it hits.
    if (ram.u16(BOMBRAM.g12954) !== 0                  // $245886 tst.w / beq
      && d4 >= ram.u16(BOMBRAM.g12952)) continue;      // $24588E cmp/bcc
    for (let k = 0; k < BOMBRAM.slots; k++) {          // $245898 / move.w #$2C
      const a6 = BOMBRAM.rec + k * BOMBRAM.stride;
      if (!beamRecordArmed(ram, a6)) continue;
      if (!recordHitsBox(ram, a6, d6, d0, d1, d2, d3)) continue;
      ram.bset8(a6, 4);                                // $2458D8 bset #$4,(A6)
      const m = u16(ram.u16(BOMBRAM.hitMask) | 0x400); // $2458DC/$2458E2
      ram.setU16(a5, u16(ram.u16(a5) | m));            // $2458E6 or.w D4,(A5)
      ctx.bombEvent?.('beam-400', 'A');                // recon 38 1.5 is stale
      const damage = transformedPlayerDamage(ctx, 0x1e0, 'laser-bomb');
      const hp = u16(ram.u16(a5 + 0x18) - damage);      // $2458E8 subi.w #$1E0
      ram.setU16(a5 + 0x18, hp);
      hitsA++;
      if ((hp & 0x8000) !== 0) break;                  // $2458EE bmi $2458F8
    }
  }

  // ---- $245902: THE BULLETS.  The count is the same four-rung ladder
  // `src/damage.js` `playerBox` and `src/bullets.js` already carry, and the
  // ONLY thing this pass does to a bullet is ERASE it.
  let d7 = 0x45;                                       // $245908 move.w #$45,D7
  for (const [i, lim] of [[0, 0x6d], [1, 0x9f], [2, 0xbd], [3, 0xd1]]) {
    if (ram.u16(BOMBRAM.bulletWindow[i]) === 0) break; // $24590C/$245918/...
    d7 = lim;                                          // $245914/$245920/...
  }
  let erased = 0;
  for (let n = 0; n <= d7; n++) {                      // $2459CA dbra D7
    const a5 = BOMBRAM.bulletPool + 2 + n * BOMBRAM.bulletStride;   // $245902 lea
    const raw = ram.u16(a5);                           // $24593C move.w (A5),D0
    if ((raw & 0x8000) !== 0) continue;                // $24593E bmi $2459C6
    if (ram.u16(BOMBRAM.g12954) !== 0                  // $245942 tst.w / beq
      && raw >= ram.u16(BOMBRAM.g12952)) continue;     // $24594A cmp/bcc
    const d0 = u16(raw + d6);                          // $245952 add.w D6,D0
    const d2 = u16(ram.u16(a5 + 0x02) + d6);           // $245954/$245958
    if (d2 > box[0] || d2 < box[1]) continue;          // $245960/$245964
    if (d0 > box[2] || d0 < box[3]) continue;          // $245968/$24596C
    for (let k = 0; k < BOMBRAM.slots; k++) {          // $245974 move.w #$2C,D7
      const a0 = BOMBRAM.rec + k * BOMBRAM.stride;
      if (!beamRecordArmed(ram, a0)) continue;         // $245978/$24597C
      if (!recordHitsBox(ram, a0, d6, d0, d0, d2, d2)) continue;   // a POINT
      ram.setU16(a5 - 2, 0);                           // $2459B2 clr.w (-$2,A5)
      ram.setU16(a5, 0xffff);                          // $2459B6 move.w #$FFFF
      erased++;
      break;                                           // $2459BA bra $2459C4
    }
  }
  ctx.bombEvent?.('beam-damage', `${hitsA}/${hitsB}/${erased}`);
  return { hits: hitsA + hitsB, hitsA, hitsB, erased, boxLive: live, hp: 0x1e0 };
}

// ===========================================================================
// `$2498E2..$249B28` -- **THE ARM**
// ===========================================================================
/**
 * The three refusals come BEFORE the stock is consumed and each one is a
 * different subsystem's veto:
 *
 *   $2498E2 tst.b ($24,A6)  / beq $249B2C   NO STOCK
 *   $2498FC tst.w $81B6FE   / bne $249B2C   -- and see §5
 *   $249908 tst.w $811F72   / bmi $249B2C   A BOMB IS ALREADY UP
 *
 * **RECON 38 §1.2 NAMES THE SECOND AND THIRD WRONG, AND IT MATTERS.**  It
 * calls `$81B6FE` "a bomb is ALREADY RUNNING" and `$811F72` "the LASER record
 * is NEGATIVE".  `[M]` `$81B6FE`'s only two absolute writers in
 * `$230000..$2B0000` are `$28732E move.w #$1` and `$2873A4 clr.w`, both inside
 * `$287324`/`$287340`, whose only callers are `$285A38` and `$285A96` -- **the
 * HYPER's flash record**.  And `$811F72` is the record THIS routine allocates
 * seventy instructions later.  So the second refusal is the HYPER's interlock
 * and the third is the BOMB'S OWN: you cannot bomb while a bomb is up.
 *
 * @returns {string} what happened, for the gate and the tests.
 */
export function fireBomb2498E2(ram, ctx, rec, playerIdx) {
  const p2 = playerIdx !== 0;
  const stock = ram.u8(rec + BOMBRAM.stockOffset);
  if (stock === 0) return 'no-stock';                  // $2498E2 tst.b / beq
  const flash = ram.u16(p2 ? BOMBRAM.flashP2 : BOMBRAM.flashP1);
  if (flash !== 0) return 'hyper-flash-up';            // $2498FC tst.w / bne
  if ((ram.u16(BOMBRAM.rec) & 0x8000) !== 0) return 'bomb-already-up';  // $249908

  ram.setU16(BOMBRAM.queue, 1);                        // $24990E move.w #$1
  const left = (stock - 1) & 0xff;                     // $249916 subq.b #$1
  ram.setU8(rec + BOMBRAM.stockOffset, left);
  if (left === 0) {                                    // $24991A bne $249930
    flushPendingGrants2875B4(ram, ctx, p2);            // $249922 / $24992A
  }

  // ---- $249930: the per-player block.  A2 is THE OTHER PLAYER'S RECORD --
  // $249950 lea $810448,A2 on P1's arm and $2499A0 lea $8103E6,A2 on P2's --
  // and that is not a transcription slip: $249B10 reads it to hand the bomb's
  // invulnerability to the OTHER ship.
  const a2 = p2 ? RAM.player1 : RAM.player2;           // $249950 / $2499A0
  const a3 = p2 ? BOMBRAM.chainLatchP2 : BOMBRAM.chainLatchP1;   // $249956/$2499A6
  const a4 = p2 ? BOMBRAM.pendP2 : BOMBRAM.pendP1;     // $24995C / $2499AC
  ram.setU16(p2 ? BOMBRAM.usedP2 : BOMBRAM.usedP1, 1); // $249936 / $249986
  const cnt = p2 ? BOMBRAM.countP2 : BOMBRAM.countP1;
  if (ram.u16(cnt) < 0x63) {                           // $24993E cmpi.w #$63/bcc
    ram.setU16(cnt, u16(ram.u16(cnt) + 1));            // $24994A addq.w #$1
  }
  const d0 = ram.u16(p2 ? BOMBRAM.meterP2 : BOMBRAM.meterP1);   // $249962/$2499B2

  // ---- $249968: **THE RANK DEBIT, AND IT IS AT THE CALL SITE.**
  const hyper = p2 ? BOMBRAM.hyperActiveP2 : BOMBRAM.hyperActiveP1;
  if (ram.u16(hyper) !== 0) {                          // $249968 tst.w / beq
    bombEndHyper249970(ram, ctx.rom, ctx, p2);
  }

  if (d0 !== 0) ram.setU16(a3, 1);                     // $2499D4 tst.w/$2499D8

  // ---- $2499DC: the per-weapon pending counter and its three BCD displays.
  // `btst #$6,(A6)` is bit 6 of the state word's HIGH byte -- bit 14 -- which
  // `$249A2E bset #$6,(A6)` sets two instructions from here, so the SECOND
  // bomb of a life skips this block until an item clears the bit ($252EBC).
  if (!ram.btst8(rec, 6) && ram.u16(a4) !== 0) {       // $2499DC / $2499E2
    ram.setU16(a4, u16(ram.u16(a4) - 0x9a));           // $2499E8 subi.w #$9A
    const t = u16(ram.u16(a4 + 0x0a) - 2);             // $2499EE subq.w #$2
    ram.setU16(a4 + 0x0a, t);
    // `bcc` after `subq.w` tests the BORROW, and the clear takes BOTH words --
    // the $9A subtraction above has no guard of its own.
    if (t > 0xfffd || (ram.u16(a4 + 0x0a) & 0x8000) !== 0) {
      ram.setU16(a4, 0); ram.setU16(a4 + 0x0a, 0);     // $2499F4 / $2499F8
    }
    const v = ram.u16(a4);                             // $2499FC move.w (A4),D0
    ram.setU32(a4 + 0x02, bcd242AC6(v));               // $249A02 / $249A08
    ram.setU32(a4 + 0x06, bcd242AC6(v >>> 1));         // $249A0C lsr.w / $249A16
    ram.setU16(a4 + 0x0c, bcd242AC6(ram.u16(a4 + 0x0a)) & 0xffff);  // $249A1E/$249A24
  }
  note(ctx, BOMB.sound2532EA, `$249A28 jsr $2532EA -- the bomb's fire cue. `
    + `[M] its closure ($240DC2, $240E1A) writes NOTHING in $800000..$81FFFF`);

  ram.bset8(rec, 6);                                   // $249A2E bset #$6,(A6)
  ram.bset8(rec + 0x01, 6);                            // $249A32 bset #$6,$1(A6)

  // ---- $249A38: **THE RECORD**.  `moveq #$0,D2 / move.b ($7,A5),D2 /
  // lsl.w #$7,D2 / ori.w #$8000,D2 / move.w ($58,A6),D0 / or.b D0,D2` -- and
  // note the `or` is a BYTE while the `add.w D0,D0` two instructions later is
  // a WORD, so the record carries only the selector's low byte but D1 carries
  // the whole word doubled.
  const sel = ram.u16(rec + P.shipSel);                // $249A44 move.w $58(A6)
  const d2 = u16(0x8000 | ((p2 ? 1 : 0) << 7) | (sel & 0xff));  // $249A3E/$249A48
  const d1 = u16(sel + sel);                           // $249A4C / $249A4E
  ram.setU16(BOMBRAM.rec, d2);                         // $249A4A move.w D2,(A1)
  ram.setU32(BOMBRAM.rec + 0x02, ram.u32(rec + P.posY));  // $249A50 move.l
  ram.setU8(rec + P.invuln, 0xff);                     // $249A56 move.b #$FF

  // ---- $249A5C: **THE FORK RECON 38 §1.3 MISSES, AND IT IS THE BIG ONE.**
  //
  // The recon lists `$249ABE jsr $252714` (the pool wipe) and `$249AEA jsr
  // $243DA0` (the SCREEN CLEAR) as things "firing one DOES", in one flat table
  // of the whole block.  **They are not on the ordinary bomb's path at all.**
  //
  //   $249A5C tst.b ($3f,A6) / bne.b $249A80
  //   $249A62 ...the ORDINARY bomb...  $249A7E bra.b $249AF6   <<< JUMPS OVER
  //   $249A80 ...the LASER bomb...     $249AAA push A2
  //           $249ABE jsr $252714      the pool wipe
  //           $249AEA jsr $243DA0      THE SCREEN CLEAR
  //           $249AF0 lea / $249AF6
  //
  // `$249A7E 6076` is `bra.b $249A80 + $76` = `$249AF6`, byte for byte, so the
  // ordinary arm skips `$249A80..$249AF4` -- **thirteen instructions including
  // both calls**.  So a bomb pressed while the ship is NOT firing a beam does
  // NOT arm `$81B410` and does NOT cancel a single bullet.  Recon 38 §7.2
  // already falsified `src/bulletdriver.js`'s "the cancel is driven only from
  // a bomb"; this falsifies the recon's own replacement for it in the other
  // direction, and both readings would have shipped a bomb that erased the
  // screen when the board's does not.
  //
  // `($3f,A6)` is the byte `src/player.js` reads at `$249B40` and `$24C282`
  // sets when the beam's arm-up completes, so **holding fire and bombing is a
  // materially different bomb** and both arms are transcribed below.
  const laserArm = ram.u8(rec + P.dead) !== 0;         // $249A5C tst.b / bne
  if (!laserArm) {
    // WAVE 91 -- AND THIS IS THE OWNER'S BOMB.  `$249A62 jsr $260852` is
    // `lea $222A78,A0` falling through into `$260862 move.w #$6,D0 / jmp
    // $24150A`: a 64-byte RESOURCE INSTALL of the ORDINARY bomb's colour bank
    // into `$80E886+$180`.  It was a counted note until this wave.
    installBombPalette(ctx, ram, 0x222a78, '$249A62 -> $260852, the ORDINARY bomb');
    ram.setU16(rec + 0x26, 0);                         // $249A68 move.w #$0
    ram.setU16(rec + 0x28, 0x3c);                      // $249A6E move.w #$3C
    ram.setU8(rec + P.speedIdx, (ram.u8(rec + P.speedIdx) + 6) & 0xff);  // $249A74
  } else {
    // **THE ONE THING THIS WAVE LEAVES BROKEN RATHER THAN FAKED**, and the
    // throw is placed at the FIRST instruction of the arm so that no partial
    // state is written.  `$249A98 bset #$0,$1(A1)` sets bit 0 of the BOMB
    // RECORD's own type word, and that bit is read in two places:
    //
    //   $255E16 andi.w #$7,D0 -> table entry 1 = `$255FE2`, a FOUR-RECORD
    //     bomb (`$25600C lea ($7B0,A1),A1`, `$2560F4`/`$2560FE`/`$256108`
    //     three more script pointers at `($7FE,A6)`/`($82E,A6)`/`($85E,A6)`),
    //     302 instructions plus `$2561AA`, `$2562FC`, `$256346`, `$2563B6`,
    //     `$256468` and `$289FF4`;
    //   $245632 btst #$0,D5 -> `$2456A6`, the OTHER 809 bytes of `$24560A`.
    //
    // So this arm is not "the same bomb with one extra flag" -- it is a
    // different weapon with a different driver and a different damage pass.
    // **W65 (B3) PORTS ALL THREE.**  W64 left it throwing rather than guessing
    // and that was right; what follows is the cartridge's own seventeen
    // instructions, and the throw that used to be here is gone.
    // WAVE 91.  `$249A80 jsr $26085C` -- `lea $222AB8,A0` into the SAME shared
    // tail, so the LASER bomb installs bank 6 from its own block.  [M] the two
    // blocks are byte-identical for all 64 bytes, which is a fact about this
    // cartridge and not a reason to collapse them: `$260852` and `$26085C` are
    // two `lea`s and a future build could differ.
    installBombPalette(ctx, ram, 0x222ab8, '$249A80 -> $26085C, the LASER bomb');
    ram.setU16(rec + 0x26, 0x0101);                    // $249A86 move.w #$101
    ram.setU16(rec + 0x28, 0x000c);                    // $249A8C move.w #$C
    ram.bset8(rec + P.flags1, 7);                      // $249A92 bset #$7,($1,A6)
    // **THE ONE INSTRUCTION THAT MAKES IT A DIFFERENT WEAPON.**  A1 is still
    // `$811F72` here ($249902's `lea`, reloaded three instructions later at
    // $249AB2), so this sets bit 0 of the BOMB RECORD's low byte -- which is
    // the type word's bit 0, which is what `$255E16 andi.w #$7,D0` turns into
    // dispatch entry 1 ($255FE2) and what `$245632 btst #$0,D5` turns into
    // $2456A6.  One `bset`, two whole machines.
    ram.bset8(BOMBRAM.rec + B.low, 0);                 // $249A98 bset #$0,($1,A1)
    ram.setU16(BOMBRAM.g8127e2, 0);                    // $249A9E clr.w $8127E2
    ram.setU16(rec + 0x46, 0x2e);                      // $249AA4 move.w #$2E
    // $249AAA move.l A2,-(A7) ... $249AE8 movea.l (A7)+,A2.  A2 is PUSHED and
    // POPPED around the block, so `$249B10 tst.w (A2)` reads the same OTHER
    // PLAYER's record on both arms and `a2` above needs no special case.
    // $249AB2 lea $8104AA,A1 / $249AC6 lea $81050E,A1 -- **A1 IS RELOADED**,
    // and it is the OPTION BLOCK, not the bomb record.  A port that kept using
    // A1 for the record would write $811FAA and $811FC8.
    const opt = p2 ? BOMBRAM.optP2 : BOMBRAM.optP1;    // $249AB2 / $249AC6
    const q = p2 ? BOMBRAM.soundQueueP2 : BOMBRAM.soundQueue;  // $249AB8/$249ACC
    wipeSegmentPool(ram, ctx, BEAM[p2 ? 1 : 0]);         // $249ABE / $249AD2
    ram.setU16(opt + 0x38, 0x26);                      // $249AD8 move.w #$26
    ram.setU16(opt + 0x56, 0x08);                      // $249ADE move.w #$8
    ram.setU16(q, 1);                                  // $249AE4 move.w #$1,(A2)
    // **AND THE LASER BOMB DOES CANCEL BULLETS.**  W64 1.3 measured that the
    // ORDINARY bomb jumps over this `jsr` at `$249A7E bra.b $249AF6`; this arm
    // is where `$243DA0` is actually reached, so `src/bulletdriver.js`'s
    // thirty-wave-old "the cancel is driven only from a bomb" is true of THIS
    // bomb and of no other.
    //
    // **AND IT IS CALLED ON ITS OWN LINE ON PURPOSE.**  The first draft was
    // `ctx.bombEvent?.('beam-arm', armBombCancel243DA0(ram) ? ... )`, and
    // optional chaining does NOT evaluate the argument list when the callee is
    // undefined -- so on any context without an event sink (every unit test,
    // and any embedder that does not attach one) the SCREEN CLEAR silently did
    // not happen.  `tests/w64bomb.test.js` caught it; nothing in the gate could
    // have, because the gate always attaches a sink.
    const armed = armBombCancel243DA0(ram);            // $249AEA jsr $243DA0
    ctx.bombEvent?.('beam-arm', armed ? 'armed' : 'busy');
  }

  // ---- $249AF6: **A DEAD READ, AND RECON 38 §7.1 ITEM 5 IS NOW ANSWERED.**
  // The recon could not decide whether `lea $24A440(pc),A0 / adda.w D1,A0 /
  // move.w (A0)+,D0` was "a deliberate code-as-data read, a mis-trace of D1,
  // or a second lea I have not found".  It is the first, and it does not
  // matter: **D0 IS NEVER READ AGAIN.**  Both arms of `$249AFA beq` and both
  // of `$249B02 beq` converge on `$249B10`, the only instruction after which
  // is `tst.w (A2)`, and the routine's exit `$249E4E` opens with `move.w
  // ($58,A6),D0`.  So the read's ONLY effect is the `beq`, and both sides of
  // the `beq` reach the same place.  The port does the branch-free thing the
  // cartridge does -- nothing -- and counts the address rather than exporting
  // a ROM window for a value nobody uses.
  note(ctx, BOMB.deadTable, `$249AF8 move.w (A0)+,D0 reads $24A440 + `
    + `($58,A6)*2 = $${(0x24a440 + d1).toString(16).toUpperCase()} -- which is `
    + `the SHIP DRAW (src/shipsprite.js) read as a word table, recon 38 7.1 `
    + `item 5's unresolved anomaly. D0 IS DEAD: $249AFA/$249B02/$249B06's `
    + `three branches all reach $249B10, D0 is not read there, and $249E4E `
    + `overwrites it with ($58,A6). No ROM window is needed for a value the `
    + `cartridge never uses`);

  // ---- $249B10: the OTHER player.  A2 is the record `$249950` (P1's arm) or
  // `$2499A0` (P2's) loaded -- **THE OPPOSITE SHIP** -- and it was pushed at
  // `$249AAA` and popped at `$249AE8` on the arm this port does not take, so
  // it holds the same value on both.  A bomb hands its own `$FF`
  // invulnerability and its two timers to the other player.
  if ((ram.u16(a2) & 0x8000) !== 0) {                  // $249B10 tst.w / bpl
    ram.setU8(a2 + P.invuln, ram.u8(rec + P.invuln));  // $249B16 move.b $3E
    ram.setU16(a2 + 0x28, ram.u16(rec + 0x28));        // $249B1C move.w $28
    ram.setU16(a2 + 0x26, ram.u16(rec + 0x26));        // $249B22 move.w $26
    return 'fired+partner';
  }
  return 'fired';                                      // $249B28 bra $249E4E
}
