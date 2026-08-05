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
//           $249868..$2498DE      NON-0 -> THE HYPER    <- a named throw
//
// `src/player.js` carried ONE name (`THE BOMB ($249814)`) for BOTH arms from
// wave 4 to wave 63, which is exactly how the next wave gets misled: a wave
// that "implements the bomb at $249814" implements the hyper by accident.  W64
// splits the name.  The hyper arm now throws at `$249868` and says HYPER.
//
// `[M]` the shipped seed has `$81B65C = $81B65E = 0` and `src/items.js`
// REFUSES the two hyper-stock item kinds AT THE ALLOCATOR (I2's `THE
// REFUSAL`), so `$2530CA` -- the ONLY absolute writer of the stock -- is
// unreachable by construction.  **The bomb arm is the only arm this port can
// take**, which is why B2 comes before the hyper (see the worklog's §1).
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
//  * **IT DOES NOT DRAW THE BOMB.**  `$23FF06`, `$23FF42` and `$23FFB4` are
//    PORTED -- they are twelve bytes each into BUCKET 13 (`$80A8DC`, counter
//    `$80AFEC`) and the state is real -- but bucket 13 has no harvested sprite
//    shard, so `src/render/index.js` SKIPS every record whose stream is not in
//    the sheet.  The records are there and countable; the picture is not.  Same
//    shape as W63's HUD.
//  * **THE HYPER.**  Every arm of `$249868` throws by address.
//  * `$2456A6` -- `$24560A`'s OTHER arm, behind `btst #$0,D5` (bit 0 of the
//    record's own type word, i.e. bit 0 of `($58,A6)`).  `[M]` `($58,A6)` is 0
//    on every frame of every run in this corpus and the exporter exports
//    selector 0 only, exactly as `src/player.js`'s ship-2 shot throw says.  A
//    named throw, not a skip.
//  * `$255FE2` -- the OTHER dispatch entry of `$255DD8`'s four-entry table.
//    `[M]` the index is `(record & $7)`, the record's low bits are `($58,A6)`,
//    and entries 0 and 2 are both `$255E3E`.  Throws by address.
//  * The `($1,A6)`-bit-1 halves of the driver's three script installs
//    (`$25658A`, `$2565FE`, `$25664E`).  Bit 1 of `$811F73` is `($58,A6)`
//    bit 1 -- the same word -- so the same argument and the same throw.

import { RAM, P } from './machine.js';
import { u16, i16 } from './ram.js';
import { unreached } from './unported.js';
import { bcd242AC6 } from './items.js';
import { drawSigned242FDE } from './rng.js';

const note = (ctx, addr, what) => ctx.unportedLog.note(addr, what);

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
  damageAlt: 0x2456a6,     // its btst #$0,D5 arm
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
  /** The window that covers all six installs and both scripts. */
  window: 0x25653c, windowLen: 0x112,
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
 * **[M] IT IS A PROVEN NO-OP IN THIS PORT AND IT IS NOT STUBBED TO BE ONE.**
 * `$81B6E4` is 0 in the shipped seed, so `$2875BA beq` takes the `$2875D6`
 * arm; `$81B6E0` (the PENDING GRANT COUNT) is 0, so `$2875DC beq` returns.
 * The only way past is `$81B6E0 != 0`, whose only writer is `$2876C6` inside
 * `$287682` -- which `src/score.js` has NOTED for thirty waves.
 *
 * **AND IF IT EVER RUNS IT MAKES `$2530BE` REACHABLE**, which the brief asks
 * to hear about loudly: `$2875FC moveq #$C,D0 / jsr $27E912` spawns the
 * HYPER-STOCK item, `src/items.js` REFUSES kind `$C` at the allocator, and a
 * hyper item collected is +1 stock, which is +1 to `$81B646` at the next
 * super, which is +16 RANK, permanently.  So this throws by address rather
 * than spawning.
 */
export function flushPendingGrants2875B4(ram, ctx, p2) {
  const gate = ram.u16(BOMBRAM.pendGate);            // $2875B4 tst.w $81B6E4
  if (gate !== 0) {
    // $2875BC tst.w $8103E6 / bpl $2875D6 is NOT what it looks like: `bmi`
    // takes the arm when the player record is LIVE, and only then does
    // $2875CE test the bomb stock.  Both sides are transcribed; neither is
    // reachable while $81B6E4 is 0.
    const rec = p2 ? RAM.player2 : RAM.player1;      // $2875BC / $28761E
    if ((ram.u16(rec) & 0x8000) !== 0) {             // bmi $2875CE
      if (ram.u8(rec + BOMBRAM.stockOffset) !== 0) return;   // $2875CE / $287630
    } else if ((ram.u16(p2 ? 0x8130c0 : 0x8130be) & 0x8000) === 0) {
      return;                                        // $2875CA bmi / $2875CC rts
    }
  }
  let d7 = ram.u16(p2 ? BOMBRAM.pending2 : BOMBRAM.pending1);   // $2875D6
  if (d7 === 0) return;                              // $2875DC beq
  const earn = p2 ? BOMBRAM.earnP2 : BOMBRAM.earnP1;
  if (ram.u16(earn) === 0x95f) {                     // $2875DE cmpi.w #$95F
    ram.setU16(earn, 0);                             // $2875E8 clr.w
    d7 = u16(d7 + 1);                                // $2875EE addq.w #$1
  }
  unreached(BOMB.itemSpawner, `$2875FC's grant loop -- ${d7} PENDING HYPER `
    + `ITEM(S) at $${(p2 ? BOMBRAM.pending2 : BOMBRAM.pending1).toString(16)
      .toUpperCase()}. Each iteration is `
    + `moveq #$C,D0 / jsr $27E912 with D6 stepping $800, i.e. it SPAWNS THE `
    + `HYPER-STOCK ITEM. src/items.js REFUSES kinds $C/$14 at the allocator `
    + `(I2's THE REFUSAL) precisely so that $2530BE/$2530E6 stay unreachable: `
    + `one collected hyper item is +1 $81B65C, which $285A62 turns into +1 `
    + `$81B646 at the NEXT super, which is +16 RANK, ACCUMULATING and paid `
    + `for ever. The only producer of $81B6E0 is $2876C6 inside $287682, `
    + `which src/score.js has noted since W34`);
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

/** `$23FF06`'s and `$23FF42`'s shared arithmetic: the record's own position,
 *  biased by ($6,A6)/($8,A6), `asr.l #$6`, masked and OR-ed with two live
 *  bits.  `$23FF42` differs from `$23FF06` ONLY in saving D0/A0-A1 -- the
 *  twenty instructions between the two entries are otherwise identical, which
 *  is worth stating because it is the kind of pair a port collapses wrongly. */
function packedPos23FF06(ram, a6) {
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
  emitBucket13(ram, ctx, packedPos23FF06(ram, a6), ram.u32(a6 + B.anim),
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
 * type word, whose low three bits are `($58,A6)` (the SHIP SELECTOR), so
 * `[M]` the index is 0 on every frame of every run in this corpus and entries
 * 1 and 3 throw by address.
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
    unreached(BOMB.driverAlt, `$255E2E[${idx}] = $255FE2, the OTHER bomb `
      + `handler (302 instructions, its own $256CAA/$256D.. installs and its `
      + `own $81296C reload at $25619A). The index is the record's type word `
      + `AND $7, whose low bits are ($58,A6) -- the ship selector -- and that `
      + `is 0 on every frame of every run in this corpus, exactly as `
      + `src/player.js's $249D2C shot throw says. Ports selector 0 only`);
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
      unreached(BOMB.scriptAltP1, `$255E84 move.l #$25658A,($1E,A6) -- the `
        + `SECOND init script, taken when bit 1 of $811F73 is set. That byte `
        + `is ($7,A5)<<7 | ($58,A6), so bit 1 is bit 1 of the SHIP SELECTOR, `
        + `which is 0 on every frame of every run in this corpus`);
    }
    note(ctx, BOMB.cue28C55C, `$255E92 jsr (A0) with A0 = $28C55C -- the `
      + `bomb's own sound cue. The $28Cxxx family is item 6 of `
      + `39-OWNER-visible-play-before-sound.md and is deferred whole (W53)`);
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
      unreached(BOMB.scriptAlt2, `$255EFA move.l #$2565FE,($1E,A6) -- the `
        + `bit-1 FADE table. Same word, same argument as $255E84's`);
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
      unreached(BOMB.scriptAlt3, `$255F76 move.l #$25664E,($1E,A6) -- the `
        + `bit-1 BLINK table. Same word, same argument as $255E84's`);
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
export function bombDamage24560A(ram, ctx, a4) {
  const d5rec = ram.u16(BOMBRAM.rec);                  // $245612 move.w (A6),D5
  if ((d5rec & 0x8000) === 0) return null;             // $245614 bpl.w $2459CE
  if (!ram.btst8(a4 + 0x01, 6)) return null;           // $245618 btst #$6 / beq

  ram.setU16(BOMBRAM.g12952, 0x7800);                  // $245622 move.w #$7800
  ram.setU32(BOMBRAM.g12954, 0);                       // $24562C move.l D0

  if ((d5rec & 0x1) !== 0) {                           // $245632 btst #$0,D5
    unreached(BOMB.damageAlt, `$2456A6 -- $24560A's OTHER arm. It builds a `
      + `bounding box at $80FA74 over all 45 records of $811F72 ($2456C0, `
      + `moveq #$2C) and then walks pool A and pool B against it ($245720, `
      + `moveq #$31). The fork is btst #$0,D5 on the RECORD's type word, `
      + `whose low bits are ($58,A6) -- 0 on every frame of every run in this `
      + `corpus. Record word $${d5rec.toString(16).toUpperCase()}`);
  }

  const d6 = ram.u16(BOMBRAM.hitMask);                 // $24563E move.w $80FA72
  // $245648 moveq #$50,D5 / $24564A tst.w ($1e,A6) / bne -> keep $50, else 1.
  // ($1e,A6) is the SCRIPT POINTER's HIGH word, so the damage is $50 for every
  // frame the driver has installed a script and **1** for the frames between
  // the record's allocation and the driver's first init.  One, not zero and
  // not $50 -- and it is a whole frame of the bomb's damage.
  const d5 = ram.u16(BOMBRAM.rec + B.script) !== 0 ? 0x50 : 1;

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
    unreached(BOMB.hyperEnd, `$249970 jsr $285AF2 and $249976 subq.w #$3,`
      + `$81B646 -- **BOMBING WHILE A HYPER IS UP**. $285AF2 is the hyper END `
      + `and W63 (B1) throws on both of its arms; the -3 is a PERMANENT debit `
      + `to the rank power word, floored at 0 by $24997E, and recon 38 3.4 is `
      + `explicit that $285AF2 itself never touches $81B646 -- the debit is `
      + `HERE, at the call site, so a bomb ends a hyper differently from the `
      + `gauge expiring. $81B63E is $${ram.u16(hyper).toString(16)
        .toUpperCase()}; the only way it can be non-zero is $285A30, behind `
      + `W63's throw, reached only from a hyper stock $2530CA can grant and `
      + `src/items.js refuses`);
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
    note(ctx, BOMB.install260852, `$249A62 jsr $260852 -- lea $222A78,A0 / `
      + `moveq #$6,D0 / jmp $24150A, i.e. a 64-byte RESOURCE INSTALL into `
      + `$80E886+$180 (data). $24150A is a counted note in six other files`);
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
    // different weapon with a different driver and a different damage pass,
    // and inventing either would be exactly the plausible wrong answer.
    unreached(BOMB.deathArm, `$249A80 -- **THE LASER BOMB**. ($3f,A6) is `
      + `$${ram.u8(rec + P.dead).toString(16).toUpperCase()}: src/laser.js `
      + `sets it at $24C282 when the beam's arm-up completes and clears it at `
      + `$24C2D6 on release, so this is "bomb WHILE HOLDING FIRE". The arm is `
      + `jsr $26085C, ($26,A6)=$101, ($28,A6)=$C, bset #$7,($1,A6), `
      + `**bset #$0,($1,A1) INTO THE BOMB RECORD**, clr.w $8127E2, `
      + `($46,A6)=$2E, then the pool wipe $252714 and the SCREEN CLEAR `
      + `$243DA0 -- thirteen instructions the ordinary arm jumps over at `
      + `$249A7E. That record bit routes the driver to $255FE2 and the damage `
      + `to $2456A6, ~630 instructions W64 does not port. TAP fire rather `
      + `than holding it and the bomb at $249A62 runs`);
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
