// THE BEAM -- the weapon a player gets by HOLDING Button 1.
//
// `37-recon-laser.md` §0 established that "the laser" is TWO weapons and this
// file is the SECOND of them:
//
//   (A) the BOMB-LASER, selected by bit 0 of the player's ($1,A6), written only
//       by `$24989E` inside the bomb, recorded in the 36-slot shot table
//       `$810572` and handled by `$254078`.  NOT THIS FILE.  `src/shots.js`
//       still throws on `$254078` and must keep doing so.
//   (B) THE BEAM, gated by `$24C164 btst #4,($40,A6)` -- the RAW held bit the
//       player copies into the option block at `$24C134` -- built inside the
//       OPTION OBJECT `$24C096`, recorded in a 32-slot x $30 segment pool per
//       player and driven by TWO MORE type-5 calls.  THIS FILE.
//
// Until this wave `$24C180` threw on the FIRST HELD FRAME, so the game could
// not be shot at all (`39-OWNER-visible-play-before-sound.md`).
//
// ---------------------------------------------------------------- THE SHAPE
//
// The beam is not one routine.  It is three type-5 calls that hand work to each
// other across FRAME BOUNDARIES, and the order is what makes the arm-up take
// the number of frames it takes:
//
//   #9  $24C096  the option object -- the gate, the 17-frame arm-up, the latch,
//                the seed, and the builder $24CB3A
//   #10 $254680  THE SEGMENT DRIVER -- 32 pool slots per player, `type & $1F`
//                into a 20-entry dispatch ($254712 P1 / $254762 P2)
//   #11 $255042  THE BEAM DRAW -- $811F32/$811F52 into the sprite queue
//
// and they run in that order inside `$28B5E0`, three calls apart.
//
// -------------------------------------------------- THE TWO-STAGE BOOTSTRAP
//
// **BOTH BUILDERS OPEN `btst #5,(A6) / beq <the pod tail>`** -- bit 5 of the
// HIGH byte of the option block's state word `$8104AA`, MEASURED $80 (clear) on
// every frame of every scenario in this corpus.  The only writer in build B is
// `$254C1E bset #5,(A4)` (and its twin `$254D06`), which is reached from a
// SEGMENT HANDLER.  So the beam cannot start itself; it is started by the
// driver, one frame after the option object seeds a segment for it:
//
//   +0..+8    9 frames   ($3f,A6) counts $0A -> 0   [$24C174]
//   +9..+16   8 frames   ($3b,A6) $30 -> $40 by ($3e,A6)=2, ($1b,A6) $10 -> 0
//   +16       the arm completes ($24C250 bset #4,(A6) ...)
//   +17       $24C1A8 LATCHES and $24C1C2 seeds POOL SLOT 28 ($811832)
//   +18       #10 dispatches slot 28's type $8002 -> $2548C4 -> $254C1E:
//             bit 5 goes up and $811EF2 becomes $8200
//   +19       #9's $24C368 -> $24CB3A takes its bit-5 arm and lays segments
//
// `10-recon-combat §2` measured on the BOARD, 600 held frames: "$8104AB bit 2
// latches at +17, the laser record $811EF2 goes live at +20".  The +17 is
// `$24C1A8` and the two frames after it are the trip through #10 and back.
//
// **THE +17 IS NOT "9 + 8 = 17" ALONE.**  `37-recon-laser.md` §3.3 derives it
// that way and skips an instruction: `$24C1A4 bcc $24C33A` sits between the
// `($1b,A6)==0` test and the latch, so the latch ALSO needs `$24C906` to return
// CARRY SET.  It does, on its very first call, because formation 2's
// `($30,A6)` list is
//
//   $24BF4A: anim $00065354  shadow $00065388  ($1e)=$0000  ($12)=$FFFF
//
// and `$FFFF` is negative (`$24C916 move.w (A0)+,($12,A6) / bmi $24C922`).  So
// `($16,A6)` never advances, the pod's sprite is re-forced to the muzzle image
// `$00065354` on every lasering frame, and `($1e,A6)` is 0 -- which is why
// `$24C36C add.w ($1e,A6),($2,A6)` moves nothing for formation 2.  The number
// is W37's; the mechanism is not, and a port built on W37's would have latched
// whenever `($1b,A6)` hit 0 regardless of the template.
//
// ------------------------------------- THE DISPATCH IS 20 ENTRIES, NOT 32
//
// `37-recon-laser.md` §3.2/§6 gives "`$254712` … a 32-entry dispatch" resolving
// to "17 distinct handlers", and prices L2 on that.  Read out of `$254680`:
// P1's loop uses `$254712` and P2's uses `$254762`, and `$254762 - $254712` is
// `$50` = TWENTY longwords.  `$2547B2`, which W37 calls the first handler, is
// `$254762 + 20*4` -- the byte after P2's table.  So it is TWO 20-entry tables,
// 40 entries over 20 distinct bodies (ten P1 + ten P2 mirrors), and W37's 17 is
// the union of P1's ten with the seven of P2's it happened to read.
//
// **AND THE INDEX IS `type & $1F`, WHICH RUNS TO 31.**  A P1 segment with low
// bits 20..31 reads P2's table; a P2 segment with the same reads PAST it, into
// `$2547B2`'s code.  That is a property of the listing and it is transcribed as
// written -- `$254712 + 4*(type&31)` and `$254762 + 4*(type&31)` -- rather than
// clamped to 20, because a clamp is a term the ROM has not got.  Every type
// word in all 65 templates was read and every one lands inside its own table.
//
// ------------------------------------------------------------- WHAT IS NOT HERE
//
// Loud named throws, at their own addresses:
//   $24CDC0  the SECOND builder.  Its only `bsr` is `$24C37A`, and W37 §7.3
//            could find NO inbound reference to `$24C37A` by three independent
//            searches; `$24C368`'s arm ends `bra $24C37E`, which jumps it.  It
//            is NOT called "dead code" here -- twice on this project a comment
//            said that and was an artifact of something else being unported.
//   $245314 / $24536E / $2453AC   the beam's own damage pass.  `$254D06` calls
//            `$245314`; `$24CE46` calls `$24536E` from inside `$24CDC0`.  So
//            **the beam draws and does not melt anything yet**, which is W37's
//            L3 and is visibly wrong rather than quietly wrong.
//
// Counted notes (`unportedLog`), because they run on reachable frames and a
// throw there is a page that will not play:
//   $28C408 $28C422 $28C468 $28C482 $28C4C8 $28C4E2 $28C43C  -- SOUND requests
//            through `$28C074`/`$28C0E8` (D0/D1/D2 = id/pan/channel).  Sound is
//            item 6 of `39-OWNER-visible-play-before-sound.md`, i.e. last.
//   $289F96 $289FC0 $289FDA  -- the effect family, unported for W34 §1.6's
//            reason.
//
// A NOTE IS NOT A THROW AND THE DIFFERENCE IS DELIBERATE (`src/unported.js`):
// a throw is for a BRANCH whose absence invents every later value; a note is
// for a SUBSYSTEM held out of scope on purpose.  Sound writes nothing this port
// reads.

import { P, RAM, OPT } from './machine.js';
import { i16, u16 } from './ram.js';
import { unreached } from './unported.js';
import { enqueueThroughStub } from './spritequeue.js';

// --------------------------------------------------------------- ADDRESSES
export const LASER = {
  gate: 0x24c164,          // btst #4,($40,A6)
  ramp60: 0x2536fa,        // ($60,A4) += 4, capped at $80
  rampDown: 0x24c8be,      // the speed ramp DOWN
  stepTemplate: 0x24c906,  // the ($16,A6) stepper; returns CARRY
  posHistoryP1: 0x2536b6,  // 16 copies of the ship's position/anim
  posHistoryP2: 0x2536d0,
  seedFamily1: 0x24caae,   // the slot-28 seed via $24CFBA
  seedFamily2: 0x24cafc,   // ...via $24CFE2 / $24D00A
  builder1: 0x24cb3a,
  builder2: 0x24cdc0,      // UNPORTED -- $24C37A has no inbound reference
  beamPath: 0x24c368,      // $24D12E + $24CB3A -- NOT "the pods-stowed path"
  teardown: 0x24c2c4,
  poolWipeP1: 0x252714,
  poolWipeP2: 0x25275c,
  driver: 0x254680,        // type-5 call #10
  dispatchP1: 0x254712,
  dispatchP2: 0x254762,
  draw: 0x255042,          // type-5 call #11
  drawEnd: 0x255158,       // ...and W37 §7.4's open extent, closed
  damageStart: 0x24536e,   // the beam's start-of-beam damage entry (W37 L3)
  damagePass: 0x2453ac,    // the per-frame damage pass          (W37 L3)
  damageSeg: 0x245314,     // the segment handlers' damage entry (W37 L3)
  // The five pointer tables, $24CFBA..$24D12D, and the template families.
  ptrFamily1: 0x24cfba,    // 25 longs -> $24A932 + $26*n
  ptrFamily2a: 0x24cfe2,   // 10 longs -> $24AAAE + $26*n
  ptrFamily2b: 0x24d00a,   //  5 longs -> $24AC2A + $26*n
  ptrSeg: 0x24d01e,        //  2 longs -> $24D026 / $24D03A
  ptrHead: 0x24d076,       //  2 longs -> $24D07E / $24D092
  ptrHeadAlt: 0x24d0a6,    //  2 longs -> $24D0AE / $24D0C2
  ptrHeadBombLaser: 0x24d0d6,
  emitStub: 0x23f508,      // the segment/beam sprite stub (bucket resolved)
  fxLaserFire: 0x289f96,
  fxBeamP1: 0x289fc0,
  fxBeamP2: 0x289fda,
};

/** The segment POOL and the two control records, per player.
 *
 *  `$8112F2 + 32*$30 = $8118F2` and `$8118F2 + 32*$30 = $811EF2`, so the two
 *  pools are exactly 32 slots each and butt against the control records.  Slot
 *  27 is `$811802` -- what `src/damage.js` calls "the A2 weapon object"; it is
 *  the beam's HEAD (`$24CCD0 lea ($510,A1),A1`, `$510 = 27*$30`).  Slot 28
 *  `$811832` is the MUZZLE the latch seeds, and slot 30 `$811892` is the pair
 *  `$254C1E` writes. */
export const SEG = {
  stride: 0x30,
  slots: 32,
  headOffset: 0x510,        // $24CCD0 lea ($510,A1),A1 -- 27 slots
};

export const BEAM = [
  { d7: 1, pool: 0x8112f2, rec: 0x811ef2, blk: 0x811f32, pair: 0x811892,
    word: 0x812964, player: RAM.player1, opt: RAM.p1Options,
    dispatch: LASER.dispatchP1, sound2: 0x81294c, sound1: 0x81294e },
  { d7: 0, pool: 0x8118f2, rec: 0x811f12, blk: 0x811f52, pair: 0x811e92,
    word: 0x812966, player: RAM.player2, opt: RAM.p2Options,
    dispatch: LASER.dispatchP2, sound2: 0x81294e, sound1: 0x81294c },
];

/** One $30-byte segment record.  Every offset below is cited on its use. */
export const S = {
  type: 0x00,      // word; bit 15 = live, `type & $1F` = the dispatch index
  posY: 0x02, posX: 0x04,
  offLong: 0x06, offShort: 0x08,
  anim: 0x0a,      // long -> hardware words 2,3
  size: 0x0e,      // word -> hardware word 4
  w10: 0x10, w12: 0x12, w16: 0x16, w18: 0x18,
  player: 0x1a,    // word = D7 ($24CC50 move.w D7,(A1)+)
  flipColour: 0x1c,
  power: 0x1d,     // byte = ($56,A4)
  script: 0x1e,    // long -- the per-type script pointer the handlers walk
  w22: 0x22, w24: 0x24, w26: 0x26, w28: 0x28, w2a: 0x2a, w2c: 0x2c,
};

// =========================================================== $2536FA
/** `$2536FA` -- `($60,A4)` += 4, capped at $80.  Sixteen bytes, and its sibling
 *  `$25370A clr.w ($60,A4)` has been ported since wave 12. */
export function laserRamp60(ram, player) {
  if (ram.u16(player + 0x60) === 0x80) return;              // $2536FA cmpi.w
  ram.setU16(player + 0x60, u16(ram.u16(player + 0x60) + 4)); // $253704 addq.w
}

// =========================================================== $24C8BE
/** `$24C8BE` -- the speed ramp DOWN.  One index per `($4b,A6)` frames, toward
 *  the `($38,A4)` floor; the reload is `((($5a,A4)-2)>>1)+4`, i.e. 4 at the
 *  measured formation 2.  Wave 9's throw was built on this and got the
 *  threshold right and the GATE wrong. */
export function rampDown(ram, player, opt) {
  const d0 = ram.u8(player + P.speedIdx);                   // $24C8BE move.b
  if (d0 === ram.u8(player + P.laserFloor)) return;         // $24C8C2 cmp.b/beq
  const r = (ram.u8(opt + OPT.reloadCount) - 1) & 0xff;     // $24C8C8 subq.b
  ram.setU8(opt + OPT.reloadCount, r);
  if (r !== 0) return;                                      // $24C8CC bne
  ram.setU8(player + P.speedIdx, (d0 - 1) & 0xff);          // $24C8CE subq.b
  let v = u16(ram.u16(player + P.optFormation) - 2);        // $24C8D2/$24C8D6
  v = (v & 0xffff) >>> 1;                                   // $24C8DA lsr.w #1
  ram.setU8(opt + OPT.reloadCount, (v + 4) & 0xff);         // $24C8DC/$24C8DE
}

// =========================================================== $24C906
/**
 * `$24C906` -- the template stepper.  Reads twelve bytes through `($16,A6)`
 * into `($a,A6)`, `($5c,A6)`, `($1e,A6)` and `($12,A6)`; if the LAST word is
 * negative it returns with the CARRY SET and does NOT advance the pointer.
 *
 * @returns {boolean} true when the carry is SET, i.e. the list terminated.
 */
export function stepTemplate(ram, ctx, opt) {
  let a0 = ram.u32(opt + 0x16);                             // $24C906 movea.l
  ram.setU32(opt + OPT.anim, ctx.rom.u32(a0)); a0 += 4;     // $24C90A move.l
  ram.setU32(opt + OPT.shadow0, ctx.rom.u32(a0)); a0 += 4;  // $24C90E move.l
  ram.setU16(opt + 0x1e, ctx.rom.u16(a0)); a0 += 2;         // $24C912 move.w
  const w = ctx.rom.u16(a0); a0 += 2;                       // $24C916 move.w
  ram.setU16(opt + 0x12, w);
  if (w & 0x8000) return true;                              // $24C91A bmi -> C
  ram.setU32(opt + 0x16, a0);                               // $24C91C move.l A0
  return false;
}

// =========================================================== $2536B6/$2536D0
/** `$2536B6` (P1) / `$2536D0` (P2) -- SIXTEEN copies of the player's position
 *  long into `$8127F4`/`$812834` and of its anim long into
 *  `$812874`/`$8128B4`.  Both loops read the SAME source every iteration, so
 *  this initialises a position HISTORY to "the ship has been here all along".
 *  Called once, at `$24C298`, on the frame the arm completes. */
export function seedPositionHistory(ram, d7) {
  const a2 = d7 ? RAM.player1 : RAM.player2;                // $2536C6 / $2536E0
  let a0 = d7 ? 0x8127f4 : 0x812834;                        // $2536BA / $2536D4
  let a1 = d7 ? 0x812874 : 0x8128b4;                        // $2536C0 / $2536DA
  const pos = ram.u32(a2 + 0x02), anim = ram.u32(a2 + 0x0a);
  for (let k = 0; k <= 0xf; k++) {                          // $2536E6 moveq #$f
    ram.setU32(a0, pos); a0 += 4;                           // $2536E8 move.l
    ram.setU32(a1, anim); a1 += 4;                          // $2536EC move.l
  }
}

// =========================================================== $24CAAE/$24CAFC
/**
 * `$24CAAE` -- the LATCH's seed.  Writes POOL SLOT 28 from template family 1,
 * chosen by `(($58,A4) ? $14 : 0) + 2*($22,A4)` BYTES into the 25-longword
 * table `$24CFBA`.  The index is in bytes into a LONGWORD table, so only even
 * `($22,A4)` land on an entry -- the same quirk as `$24BBAA`, transcribed and
 * not smoothed.
 */
export function seedSegmentFamily1(ram, ctx, b) {
  const { player, d7 } = b;
  const a1 = (d7 ? 0x811832 : 0x811e32);                    // $24CAAE / $24CAB8
  let d0 = ram.u16(player + P.shipSel) ? 0x14 : 0;          // $24CABE..$24CAC4
  d0 = u16(d0 + u16(ram.u16(player + 0x22) * 2));           // $24CAC6..$24CACC
  const a0 = ctx.rom.u32(LASER.ptrFamily1 + i16(d0));       // $24CAD4 movea.l
  copySeedRecord(ram, ctx, b, a1, a0);
}

/** `$24CAFC` -- the same copy with the table already chosen by the caller
 *  (`$24C1CA`/`$24C1D8` pick `$24CFE2`, `$24C1E8` picks `$24D00A`) and the
 *  index `2*($22,A4)` alone. */
export function seedSegmentFamily2(ram, ctx, b, table) {
  const { player, d7 } = b;
  const a1 = (d7 ? 0x811832 : 0x811e32);                    // $24CAFC / $24CB06
  const d0 = u16(ram.u16(player + 0x22) * 2);               // $24CB0C add.w
  const a0 = ctx.rom.u32(table + i16(d0));                  // $24CB12 movea.l
  copySeedRecord(ram, ctx, b, a1, a0);
}

/** The 38 ($26) source bytes both seeds share, `$24CAD8..$24CAF8` verbatim.
 *  The holes at +$02..+$05 and +$0A..+$0D are `addq.w #4,A1`, NOT writes. */
function copySeedRecord(ram, ctx, b, a1, src) {
  const { player, d7 } = b;
  let s = src, a = a1;
  ram.setU16(a, ctx.rom.u16(s)); s += 2; a += 2;            // $24CAD8 the TYPE
  a += 4;                                                   // $24CADA addq.w #4
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $24CADC
  a += 4;                                                   // $24CADE addq.w #4
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $24CAE0
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $24CAE2
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $24CAE4
  ram.setU16(a, d7); a += 2;                                // $24CAE6 move.w D7
  ram.setU16(a, ctx.rom.u16(s)); s += 2; a += 2;            // $24CAE8
  ram.setU8(a - 1, ram.u8(player + 0x56));                  // $24CAEA move.b
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $24CAF0
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $24CAF2
  ram.setU16(a, ctx.rom.u16(s)); s += 2; a += 2;            // $24CAF4
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $24CAF6
  ram.setU32(a, ctx.rom.u32(s));                            // $24CAF8
}

// =========================================================== $252714/$25275C
/**
 * `$252714` (P1) / `$25275C` (P2) -- THE POOL WIPE, called from the release
 * teardown `$24C2DE`/`$24C2E4` and from the BOMB.
 *
 * `$252738 jsr (A0)` is a SOUND: A0 comes from `$2527BE[$81043E]` (entries
 * `$28C43C`/`$28C49C`/`$28C452`/`$28C4B2`, all `movem.l / move.w #id,D0 / jsr
 * ($28C0E8,PC)`) or, while hypering, `$28C4FC`.  It is noted, not run.
 *
 * The ENTRY at `$25270C` -- which the bomb uses and this caller does not -- is
 * `andi.w #$DFFB,$8104AA` first, and that is why the teardown at `$24C2DE`
 * enters four bytes later.
 */
export function wipeSegmentPool(ram, ctx, b) {
  const { pool, rec, blk, opt, d7 } = b;
  ctx.unportedLog.note(d7 ? 0x252738 : 0x252780, `the pool wipe's `
    + `\`jsr (A0)\` -- a SOUND request through $2527BE[$81043E] ($28C43C / `
    + `$28C49C / $28C452 / $28C4B2, or $28C4FC while hypering). Sound is item 6 `
    + `of 39-OWNER-visible-play-before-sound.md and nothing in this port reads `
    + `what it writes`);
  ram.bclr8(opt + OPT.flags1, 7);                           // $25279A bclr #7
  ram.setU16(rec, 0);                                       // $2527A2 move.w
  ram.setU16(blk, 0);                                       // $2527A4 move.w
  ram.setU16(blk + 0x16, 0);                                // $2527A6 move.w
  for (let k = 0; k <= 0x1f; k++) {                         // $2527AA moveq #$1F
    ram.setU16(pool + k * SEG.stride, 0);                   // $2527AE / $2527B0
  }
}

// =========================================================== $24C164
/**
 * `$24C164..$24C29C` -- THE LASER GATE AND EVERYTHING BEHIND IT.
 *
 * The gate is on the RAW byte `($40,A6)`, has no speed-index term and fires on
 * the FIRST held frame.  Wave 9's guard added a `speedIdx !== laserFloor` term
 * the ROM has not got and a player already at the floor got silence; W37 §9.2
 * is explicit that no such term may come back.  The caller does the `btst`.
 *
 * @returns {'c310'|'c33a'} which of the two shared tails control falls into.
 */
export function runLaserGate(ram, ctx, b) {
  const { opt, player, d7 } = b;

  if (ram.u8(opt + 0x3f) !== 0) {                           // $24C16E tst.b
    const v = (ram.u8(opt + 0x3f) - 1) & 0xff;              // $24C174 subq.b
    ram.setU8(opt + 0x3f, v);
    if (v !== 0) return 'c310';                             // $24C178 bne
    ram.bset8(opt + OPT.state, 6);                          // $24C17C bset #6
  }
  laserRamp60(ram, player);                                 // $24C180 jsr

  if (ram.btst8(opt + OPT.flags1, 2)) {                     // $24C186 btst #2
    rampDown(ram, player, opt);                             // $24C18E bsr
    return 'c33a';                                          // $24C192 bra
  }
  if (ram.u8(opt + OPT.angle) === 0) {                      // $24C196 tst.b
    rampDown(ram, player, opt);                             // $24C19C bsr
    if (!stepTemplate(ram, ctx, opt)) return 'c33a';        // $24C1A0/$24C1A4
    // ---- THE LATCH, $24C1A8 ------------------------------------------------
    ram.bset8(opt + OPT.flags1, 2);                         // $24C1A8 bset #2
    ram.setU16(opt + 0x4e, 0);                              // $24C1AE clr.w
    if (ram.btst8(player + P.flags1, 0)) {                  // $24C1B2 btst #0
      // The (A) BOMB-LASER bit.  Its only writer in build B is $24989E, inside
      // the bomb, which src/player.js still throws on -- so this arm is
      // transcribed and unexercised, not dead.
      seedSegmentFamily2(ram, ctx, b, 0x24d00a);            // $24C1E8/$24C1EE
      return 'c33a';                                        // $24C1F2 bra
    }
    if (!ram.btst8(player + 0x5b, 2)) {                     // $24C1BA btst #2
      seedSegmentFamily1(ram, ctx, b);                      // $24C1C2 bsr
      return 'c33a';                                        // $24C1C6 bra
    }
    // $24C1CA/$24C1D8 both `lea ($24CFE2,PC),A0`; the first is dead in the
    // sense that $24C1D8 re-loads it, and the `adda.w D0,A0` between them is
    // the whole of the second lea's purpose.  Translated as written.
    const d0 = ram.u16(player + P.shipSel) ? 0x14 : 0;      // $24C1D0..$24C1D6
    seedSegmentFamily2(ram, ctx, b, 0x24cfe2 + d0);         // $24C1DE/$24C1E0
    return 'c33a';                                          // $24C1E4 bra
  }

  // ---- $24C1F6: the pods are still swung out -- SWING THEM IN ------------
  if (ram.u16(opt + 0x10) === 4) {                          // $24C1F6 cmpi.w
    if (!ram.btst8(opt + OPT.state, 2)) {                   // $24C1FE btst #2
      ram.bset8(opt + OPT.state, 3);                        // $24C204 bset #3
      if (ram.u8(opt + 0x15) !== 0x10) {                    // $24C208 cmpi.b
        if (ram.u8(opt + 0x15) !== 0x30) return 'c33a';     // $24C210/$24C216
        ram.bchg8(opt + OPT.flipColour, 6);                 // $24C21A bchg #6
        ram.bchg8(opt + OPT.pod + OPT.flipColour, 6);       // $24C220 bchg #6
        ram.setU8(opt + 0x15, 0x10);                        // $24C226 move.b
        ram.setU8(opt + 0x35, 0x30);                        // $24C22C move.b
      }
      ram.setU8(opt + OPT.state, ram.u8(opt + OPT.state) & 0xf7);  // $24C232
      ram.bset8(opt + OPT.state, 2);                        // $24C236 bset #2
    }
  }
  const step = ram.u8(opt + 0x3e);                          // $24C23A move.b
  ram.setU8(opt + OPT.angle, (ram.u8(opt + OPT.angle) - step) & 0xff);   // $24C23E
  ram.setU8(opt + 0x3b, (ram.u8(opt + 0x3b) + step) & 0xff);            // $24C242
  if (ram.u8(opt + 0x3b) < 0x40) return 'c33a';             // $24C246 cmpi.b/bcs

  // ---- $24C250: THE ARM COMPLETES.  This is frame +16. --------------------
  ram.bset8(opt + OPT.state, 4);                            // $24C250 bset #4
  ram.setU8(opt + OPT.angle, 0);                            // $24C256 move.b
  ram.setU8(opt + 0x3b, 0);                                 // $24C25A move.b
  ram.setU8(opt + 0x4a, 8);                                 // $24C25E move.b
  ram.setU8(opt + OPT.reloadCount, 4);                      // $24C264 move.b
  ram.setU32(opt + 0x16, ram.u32(opt + 0x30));              // $24C26A move.l
  stepTemplate(ram, ctx, opt);                              // $24C270 bsr
  ram.setU16(opt + OPT.size, 0x418);                        // $24C274 move.w
  ram.setU32(opt + OPT.offLong, 0xfc00fd00);                // $24C27A move.l
  ram.setU8(player + P.dead, 1);                            // $24C282 move.b #1
  seedPositionHistory(ram, d7);                             // $24C288..$24C298
  return 'c33a';                                            // $24C29A bra
}

// =========================================================== $24CB3A
/**
 * `$24CB3A` -- BEAM BUILDER 1, called from `$24C368`.
 *
 * `src/options.js` has called `$24C368` "the pods-stowed path" since wave 12
 * and W37 §3.3 retired that name: it is the SECOND HALF OF THE LASER, and it
 * was unreachable in every corpus run for exactly the reason the laser was --
 * nobody held the button for seventeen frames.
 *
 * @returns {'tail'} the routine always converges on the pod tail `$24CC68`,
 *   which `src/options.js` owns (it is the same shadow + `jmp $23F2CA` pair
 *   `$24D12E` ends with).
 */
export function buildBeam(ram, ctx, b) {
  const { opt, player, d7, pool, rec, blk, word } = b;
  if (!ram.btst8(opt + OPT.state, 5)) return 'tail';        // $24CB3A btst #5

  let d4 = ram.u16(player + P.velY);                        // $24CB5A / $24CB7C
  d4 = u16(d4 + 0x300);                                     // $24CB82 addi.w
  const pos = (ram.u32(player + P.posY) + 0x8000000) >>> 0; // $24CB86/$24CB8A
  ram.setU32(rec + 0x02, pos);                              // $24CB90 move.l

  let toHead = false;
  if (ram.btst8(rec, 4)) {                                  // $24CB94 btst #4
    ram.setU16(opt + 0x4e, 0);                              // $24CBBE clr.w
    ram.setU16(rec + 0x0e, ram.u16(rec + 0x1c));            // $24CBC2 move.w
    ram.setU16(rec + 0x0c, 0);                              // $24CBC8 clr.w
    beamHeadWindow(ram, rec, word);                         // $24CBCC..$24CBE6
  } else if (ram.u16(rec + 0x0c) !== 0) {                   // $24CB9A tst.w
    beamHeadWindow(ram, rec, word);                         // $24CBCC..$24CBE6
  } else {
    let go = true;
    if (ram.u16(blk + 0x16) !== 0) {                        // $24CBA0 tst.w
      const v = u16(ram.u16(blk + 0x16) - 1);               // $24CBA6 subq.w
      ram.setU16(blk + 0x16, v);
      if (v !== 0) go = false;                              // $24CBAA bne
    }
    if (go) {
      ram.setU16(rec + 0x06, u16(ram.u16(rec + 0x06) + 0x800));  // $24CBAC
      // $24CBB2 bset #7,($1,A6) / beq $24CCD0 -- the head is laid ONCE, on the
      // frame the bit goes up.
      if (!ram.bset8(opt + OPT.flags1, 7)) toHead = true;   // $24CBB2/$24CBB8
    }
  }

  if (toHead && layBeamHead(ram, ctx, b)) return 'tail';    // $24CCD0..$24CD58

  // ---- $24CBEA: ONE segment per frame, into the first free slot ----------
  let a0 = ram.btst8(player + P.flags1, 0)                  // $24CBEC btst #0
    ? 0x24d062                                              // $24CBF4 lea
    : 0x24d04e;                                             // $24CBFC lea
  if (!ram.btst8(player + P.flags1, 0)
      && !ram.btst8(player + 0x5b, 2)) {                    // $24CC02 btst #2
    const d3 = u16(ram.u16(player + P.shipSel) * 2);        // $24CC0A/$24CC0E
    a0 = ctx.rom.u32(LASER.ptrSeg + i16(d3));               // $24CC16 movea.l
  }
  const d1i = u16(ram.u16(player + 0x22) * 2);              // $24CC1A/$24CC20
  a0 = ctx.rom.u32(a0 + i16(d1i));                          // $24CC22 movea.l

  let a1 = pool;
  for (let d0 = 0x1d; ; d0--) {                             // $24CBEA moveq #$1D
    if ((ram.u16(a1) & 0x8000) === 0) {                     // $24CC26 tst.w/bpl
      writeSegment(ram, ctx, b, a1, a0, d4);                // $24CC34..$24CC64
      return 'tail';
    }
    a1 += SEG.stride;                                       // $24CC2A lea
    if (d0 === 0) return 'tail';                            // $24CC2E dbra
  }
}

/** `$24CBCC..$24CBE6` -- the beam's visible WINDOW, recomputed whenever the
 *  head is complete (`($c,A3)`) or the record's bit 4 is up. */
function beamHeadWindow(ram, rec, word) {
  ram.bclr8(rec + 0x01, 7);                                 // $24CBCC bclr #7
  const d1 = ram.u16(rec + 0x10);                           // $24CBD2 move.w
  ram.setU16(word, d1);                                     // $24CBD8 move.w
  ram.setU16(rec + 0x12, d1);                               // $24CBDA move.w
  let d0 = d1 - ram.u16(rec + 0x02);                        // $24CBDE sub.w
  if (d0 < 0) d0 = 0;                                       // $24CBE2 bcc/moveq
  ram.setU16(rec + 0x06, u16(d0));                          // $24CBE6 move.w
}

/** `$24CC34..$24CC64` -- one segment written into a free pool slot. */
function writeSegment(ram, ctx, b, a1, src, d4) {
  const { opt, player, d7 } = b;
  let s = src, a = a1;
  ram.setU16(a, ctx.rom.u16(s)); s += 2; a += 2;            // $24CC34 the TYPE
  ram.setU32(a, ram.u32(opt + OPT.posY));                   // $24CC36 move.l
  ram.setU16(a, u16(ram.u16(a) - d4));                      // $24CC3A sub.w D4
  a += 4;
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $24CC3E ($6,$8)
  const a2 = ctx.rom.u32(s); s += 4;                        // $24CC40 movea.l
  const d1 = ram.u16(opt + 0x50);                           // $24CC42 move.w
  ram.setU32(a, ctx.rom.u32(a2 + i16(d1))); a += 4;         // $24CC46 move.l
  ram.setU16(a, ctx.rom.u16(s)); s += 2; a += 2;            // $24CC4A the SIZE
  a += 0x0a;                                                // $24CC4C lea
  ram.setU16(a, d7); a += 2;                                // $24CC50 move.w D7
  ram.setU8(a, 0); a += 1;                                  // $24CC52 clr.b
  ram.setU8(a, ram.u8(player + 0x56)); a += 1;              // $24CC54 move.b
  const lim = ctx.rom.u16(s);                               // $24CC58 move.w
  const n = u16(ram.u16(opt + 0x50) + 4);                   // $24CC5A addq.w
  ram.setU16(opt + 0x50, n);
  if (lim !== n) return;                                    // $24CC5E cmp.w/bne
  ram.setU16(opt + 0x50, 0);                                // $24CC64 clr.w
}

/**
 * `$24CCD0..$24CD56` -- THE BEAM'S HEAD, written 27 slots past the pool
 * cursor, i.e. `$811802` for P1.  `src/damage.js` calls that address "the A2
 * weapon object"; it is the muzzle record of this beam.
 *
 * @returns {boolean} true when control leaves through `$24CD58` (the shadow
 *   tail), false when it loops back to `$24CBEA`.
 */
function layBeamHead(ram, ctx, b) {
  const { opt, player, d7, pool, rec } = b;
  let a = pool + SEG.headOffset;                            // $24CCD2 lea ($510
  const d3 = u16(ram.u16(player + P.shipSel) * 2);          // $24CCD6/$24CCDA
  let a0 = ram.btst8(player + 0x5b, 2)                      // $24CCE2 btst #2
    ? LASER.ptrHeadAlt                                      // $24CCEA lea
    : LASER.ptrHead;                                        // $24CCDC lea
  a0 = ctx.rom.u32(a0 + i16(d3));                           // $24CCF0 movea.l
  const d1i = u16(ram.u16(player + 0x22) * 2);              // $24CCF4/$24CCFA
  if (ram.btst8(player + P.flags1, 0)) {                    // $24CCFC btst #0
    a0 = LASER.ptrHeadBombLaser;                            // $24CD04 lea
  }
  a0 = ctx.rom.u32(a0 + i16(d1i));                          // $24CD0A movea.l

  let s = a0;
  ram.setU16(a, ctx.rom.u16(s)); s += 2; a += 2;            // $24CD0E the TYPE
  ram.setU32(a, ram.u32(opt + OPT.posY));                   // $24CD10 move.l
  ram.setU16(a, u16(ram.u16(a) - 0x600));                   // $24CD14 subi.w
  a += 4;
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $24CD1A
  a += 4;                                                   // $24CD1C addq.w #4
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $24CD1E
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $24CD20
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $24CD22
  ram.setU16(a, d7); a += 2;                                // $24CD24 move.w D7
  ram.setU16(a, ctx.rom.u16(s)); s += 2; a += 2;            // $24CD26
  ram.setU8(a - 1, ram.u8(player + 0x56));                  // $24CD28 move.b
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $24CD2E
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $24CD30
  ram.setU16(a, ctx.rom.u16(s)); s += 2; a += 2;            // $24CD32
  const d1 = ctx.rom.u16(s);                                // $24CD34 move.w

  // $24CD36 bset #0,($1,A3) / beq $24CD58 -- the FIRST time through, the bit
  // was clear and control leaves by the shadow tail; every later time it takes
  // the short arm and goes back to $24CBEA.
  if (ram.bset8(rec + 0x01, 0)) {                           // $24CD36 bset #0
    ram.bset8(a - 0x27, 7);                                 // $24CD3E bset #7
    const d0 = u16(ram.u16(rec + 0x12) + d1 + 0x400);       // $24CD44..$24CD4A
    ram.setU16(a - 0x26, d0);                               // $24CD4E move.w
    return false;                                           // $24CD52/$24CD54
  }
  ram.setU16(opt + 0x4e, 2);                                // $24CD58 move.w #2
  return true;
}

// =========================================================== $254680
/**
 * `$254680` -- THE SEGMENT DRIVER, type-5 call #10.
 *
 * 32 pool slots per player, `type & $1F` into a TWENTY-entry dispatch.  The
 * `and.w` runs to 31 and the tables are 20 long; that overrun is the ROM's and
 * is left in place (see the header).
 */
export function runSegmentDriver(ram, ctx) {
  ram.setU16(0x81b6e6, 0);                                  // $254680 clr.w
  ram.setU16(0x81295e, 0);                                  // $254686 clr.w
  let ran = 0;
  for (const b of BEAM) {
    // $25468E tst.w $8103E6 / bpl -- the player must EXIST (bit 15).
    if ((ram.u16(b.player) & 0x8000) === 0) continue;       // $25468E / $2546CE
    ram.setU16(0x81b6e6, ram.u16(b.d7 ? 0x81b63e : 0x81b640));   // $25469E
    let a6 = b.pool;
    for (let d7 = 0x1f; ; d7--) {                           // $25469C moveq #$1F
      const d0 = ram.u16(a6);                               // $2546A8 move.w
      if (d0 !== 0) {                                       // $2546AA beq
        ram.setU16(0x81295e, u16(ram.u16(0x81295e) + 1));   // $2546AC addq.w
        const idx = d0 & 0x1f;                              // $2546B2 moveq/and
        const fn = ctx.rom.u32(b.dispatch + idx * 4);       // $2546C2 movea.l
        runSegmentHandler(ram, ctx, b, a6, fn);             // $2546C4 jsr (A0)
        ran++;
      }
      a6 += SEG.stride;                                     // $2546C6 lea
      if (d7 === 0) break;                                  // $2546CA dbra
    }
  }
  return ran;
}

/** The twenty distinct handler bodies, by their ROM address.  Ten are P1's and
 *  ten are P2's mirrors; the ONLY difference between a pair is which player's
 *  words it reads, so each pair shares one implementation and the `b` block
 *  carries the choice -- exactly as `OPTION_BLOCKS` does for `$24C096`. */
const SEGMENT_HANDLERS = new Map([
  [0x2547b2, hStep], [0x2547c0, hStep],                     // types 0, 5
  [0x2547e6, hBody], [0x254800, hBody],                     // types 1, 6, 11, 16
  [0x2548c4, hScript], [0x2548f0, hScript],                 // type 2
  [0x2548da, hScript], [0x254904, hScript],                 // type 7
  [0x254986, hScriptSel], [0x2549bc, hScriptSel],           // type 12
  [0x2549a8, hScript], [0x2549de, hScript],                 // type 17
  [0x254a60, hOnShip], [0x254a68, hOnShip],                 // types 3, 8, 13, 18
  [0x254abe, hOnPod], [0x254acc, hOnPod],                   // types 4, 9, 14, 19
  [0x254b68, hStep], [0x254b76, hStep],                     // type 10
  [0x254b9e, hStep], [0x254bac, hStep],                     // type 15
]);

/** The A3 sound entry each script handler jumps through, by handler address.
 *  All seven are `movem.l D0-D7/A0-A6,-(A7) / move.w #id,D0 / move.w #pan,D1 /
 *  move.w #chan,D2 / jsr ($28C074,PC)`. */
const SEGMENT_SOUND = new Map([
  [0x2548c4, 0x28c408], [0x2548f0, 0x28c422],
  [0x2548da, 0x28c468], [0x254904, 0x28c482],
  [0x2549a8, 0x28c4c8], [0x2549de, 0x28c4e2],
]);

function runSegmentHandler(ram, ctx, b, a6, fn) {
  const h = SEGMENT_HANDLERS.get(fn);
  if (!h) {
    unreached(fn, `segment handler $${fn.toString(16).toUpperCase()}, `
      + `dispatched from $254680 for the segment at $${a6.toString(16)
        .toUpperCase()} with type word $${ram.u16(a6).toString(16)
        .toUpperCase()}. The two 20-entry tables $254712 (P1) and $254762 (P2) `
      + `hold twenty distinct bodies and this port implements them all, so `
      + `reaching this means \`type & $1F\` indexed PAST a table -- which the `
      + `ROM's own \`moveq #$1F\` allows and no template in the five families `
      + `produces`);
  }
  h(ram, ctx, b, a6, fn);
}

// -------------------------------------------------- $2547B2 / $254B68 / $254B9E
/** Types 0, 5, 10 and 15 -- STEP UP THE SCREEN, die at the top.
 *  `$254B68` and `$254B9E` are the same arithmetic in a different instruction
 *  order (they re-read `($2,A6)` instead of keeping it in D0) and are byte-for
 *  -byte identical to each other. */
function hStep(ram, ctx, b, a6) {
  const d0 = u16(ram.u16(b.player + P.velY) + 0x800         // $2547CC addi.w
    + ram.u16(a6 + S.posY));                                // $2547D0 add.w
  if (d0 >= 0x7800) return hKill(ram, b, a6);               // $2547D4 cmpi/bcc
  ram.setU16(a6 + S.posY, d0);                              // $2547DC movem.w
  ram.setU16(a6 + S.posX, ram.u16(b.player + P.posX));
  return hBeamTail(ram, ctx, b, a6, d0);                    // $2547E2 bra $254F48
}

// -------------------------------------------------------------- $2547E6/$254800
/** Types 1, 6, 11 and 16 -- the beam's BODY.  It walks its own anim table
 *  through `($24,A6)`, arms `$289F96` on a `($26,A6)` divider while `$81308C`
 *  is non-zero, and hands over to `$254E04` at the top of the playfield. */
function hBody(ram, ctx, b, a6) {
  const d1 = u16(ram.u16(b.player + P.velY) + 0x800);       // $2547E6/$254818
  ram.setU16(a6 + S.posY, u16(ram.u16(a6 + S.posY) + d1));  // $25481C add.w
  ram.setU16(a6 + S.posX, ram.u16(b.player + P.posX));      // $254820 move.w

  const d0 = ram.u16(a6 + S.w24);                           // $254824 move.w
  const a2 = ram.u32(a6 + S.script);                        // $254828 movea.l
  ram.setU32(a6 + S.anim, ctx.rom.u32(a2 + i16(d0)));       // $25482C move.l
  const nx = ram.u16(a6 + S.w24) - 4;                       // $254832 subq.w #4
  ram.setU16(a6 + S.w24, nx < 0 ? 4 : u16(nx));             // $254836/$254838

  let toSet = false;
  if (ram.btst8(a6 + S.type, 0)) {                          // $25483E btst #0
    toSet = true;                                           // -> $254872
  } else {
    if (ram.i8(a6 + 0x01) >= 0                              // $254844 tst.b/bmi
        && ram.u16(0x81308c) !== 0) {                       // $25484A tst.w/beq
      const c = (ram.u8(a6 + 0x26) - 1) & 0xff;             // $254852 subq.b
      ram.setU8(a6 + 0x26, c);
      if (c === 0xff) {                                     // $254856 bcc
        ram.setU8(a6 + 0x26, ram.u8(a6 + 0x27));            // $254858 move.b
        ctx.unportedLog.note(LASER.fxLaserFire, `$25485E jsr $289F96 -- the `
          + `beam-body effect. The $289xxx effect family is unported for W34 `
          + `§1.6's reason and is COUNTED here rather than thrown, because it `
          + `fires on a divider inside a reachable handler`);
      }
    }
    // $254864 cmpi.w #$7800,($2,A6) / bcc $254894 -> $254E04
    if (ram.u16(a6 + S.posY) >= 0x7800) return hKill(ram, b, a6);
    if (ram.btst8(b.rec, 4)) toSet = true;                  // $25486C btst #4
  }
  if (toSet) {                                              // $254872
    if (ram.u16(b.blk) & 0x8000) {                          // $254872 tst.w/bmi
      ram.setU16(a6 + S.type, 0);                           // $254890 clr.w
      return null;
    }
    ram.bset8(a6 + S.type, 0);                              // $254876 bset #0
  }
  // $25487A..$2548A0 -- the per-player sound-queue gate, then the $80390C phase
  if (ram.u16(a6 + S.player) !== 0) {                       // $254880 tst.w
    if (ram.u16(0x81294c) !== 0) return null;               // $254886 tst.w/beq
  } else if (ram.u16(0x81294e) !== 0) return null;          // $254898 tst.w/bne
  return hPhaseEmit(ram, ctx, a6);                          // $2548A0
}

// ------------------------ $2548C4 / $2548DA / $254986 / $2549A8 and P2's four
/**
 * The SCRIPT handlers -- types 2, 7, 12 and 17.  The MUZZLE is type 2: it is
 * what `$24CAAE` seeds into pool slot 28 at the latch, and its `bsr $254C1E`
 * is the ONE instruction in build B that sets `bit 5 of (A6)` and therefore
 * the only thing that can start either builder.
 */
function hScript(ram, ctx, b, a6, fn) {
  ram.setU32(a6 + S.posY, ram.u32(b.opt + OPT.posY));       // $2548C4/$254916
  return scriptBody(ram, ctx, b, a6, SEGMENT_SOUND.get(fn), fn);
}

/** Type 12 -- the same body with the sound chosen by `$81043E`/`$8104A0`. */
function hScriptSel(ram, ctx, b, a6, fn) {
  ram.setU32(a6 + S.posY, ram.u32(b.opt + OPT.posY));       // $254986/$2549F0
  const sel = ram.u16(b.d7 ? 0x81043e : 0x8104a0) !== 0;    // $254998/$2549CE
  const snd = fn === 0x254986
    ? (sel ? 0x28c468 : 0x28c408)                           // $2549A0 / $254992
    : (sel ? 0x28c482 : 0x28c422);                          // $2549D6 / $2549C8
  return scriptBody(ram, ctx, b, a6, snd, fn);
}

function scriptBody(ram, ctx, b, a6, snd, fn) {
  let a0 = ram.u32(a6 + S.script);                          // $25491A movea.l
  const w = ctx.rom.u16(a0); a0 += 2;                       // $25491E move.w
  ram.setU16(a6 + S.w22, w);
  if (w & 0x8000) {                                         // $254922 bpl
    ram.setU16(a6 + S.w22, u16(~w));                        // $254924 not.w
    if (ram.u16(a6 + S.w22) === 0x7f) {                     // $254928 cmpi.w
      ram.setU16(a6 + S.type, 0);                           // $254930 clr.w
      return null;                                          // $254932 rts
    }
    // $254934..$25494A -- the same two-word sound-queue gate as $25487A.
    let doSound;
    if (ram.u16(a6 + S.player) !== 0) doSound = ram.u16(0x81294c) === 0;
    else doSound = ram.u16(0x81294e) === 0;
    if (doSound) {
      ctx.unportedLog.note(snd, `$25494C jsr (A3) from segment handler `
        + `$${fn.toString(16).toUpperCase()} -- a SOUND request `
        + `(movem.l / move.w #id,D0 / move.w #pan,D1 / move.w #chan,D2 / jsr `
        + `($28C074,PC)). Sound is item 6 of `
        + `39-OWNER-visible-play-before-sound.md; nothing in this port reads `
        + `what it writes`);
    }
    startBeamRecords(ram, ctx, b, a6);                      // $25494E bsr $254C1E
  }
  ram.setU32(a6 + S.anim, ctx.rom.u32(a0)); a0 += 4;        // $254952 move.l
  ram.setU32(a6 + S.script, a0);                            // $254956 move.l A0
  ram.setU16(a6 + S.posY,
    u16(ram.u16(a6 + S.posY) + ram.u16(a6 + S.w26)));       // $25495A/$25495E
  return hPhaseEmit(ram, ctx, a6);                          // $254962
}

// -------------------------------------------------------------- $254A60/$254A68
/** Types 3, 8, 13, 18 -- pinned to the SHIP, animated only on this player's
 *  half of the `$80390C` alternation. */
function hOnShip(ram, ctx, b, a6) {
  ram.setU32(a6 + S.posY, ram.u32(b.player + P.posY));      // $254A60/$254A6E
  const d0 = ram.u16(a6 + S.player) !== 0 ? 1 : 0;          // $254A72..$254A7A
  if (d0 === ram.u16(0x80390c)) return null;                // $254A7C cmp.w/beq
  const idx = ram.u16(a6 + S.w24);                          // $254A84 move.w
  const a0 = ram.u32(a6 + S.script);                        // $254A88 movea.l
  ram.setU32(a6 + S.anim, ctx.rom.u32(a0 + i16(idx)));      // $254A8C move.l
  const nx = ram.u16(a6 + S.w24) - 4;                       // $254A92 subq.w #4
  ram.setU16(a6 + S.w24, nx < 0 ? ram.u16(a6 + S.w22) : u16(nx));  // $254A98
  if (ram.u16(a6 + S.player) !== 0) {                       // $254A9E tst.w
    if (ram.u16(0x81294c) !== 0) return null;               // $254AA4 tst.w/beq
  } else if (ram.u16(0x81294e) !== 0) return null;          // $254AAE tst.w/bne
  return emit(ram, ctx, a6);                                // $254AB6 jmp $23F508
}

// -------------------------------------------------------------- $254ABE/$254ACC
/** Types 4, 9, 14, 19 -- pinned to the POD, and it re-reads its animation set
 *  whenever the player's `($22,A4)` power word moves. */
function hOnPod(ram, ctx, b, a6) {
  ram.setU32(a6 + S.posY, ram.u32(b.opt + OPT.posY));       // $254ABE/$254AD8
  const d1 = ram.u16(b.player + 0x22);                      // $254AC4 / $254AD2
  if (d1 !== ram.u16(a6 + S.w28)) {                         // $254ADC cmp.w/beq
    ram.setU16(a6 + S.w28, d1);                             // $254AE2 move.w
    const a0 = ctx.rom.u32(ram.u32(a6 + S.script) + i16(u16(d1 * 2)));  // $254AEC
    ram.setU32(a6 + S.w2a, ctx.rom.u32(a0));                // $254AF0 move.l
    ram.setU32(a6 + S.offLong, ctx.rom.u32(a0 + 4));        // $254AF4 move.l
    ram.setU16(a6 + S.size, ctx.rom.u16(a0 + 8));           // $254AF8 move.w
    ram.setU8(a6 + S.w22, 0);                               // $254AFC clr.b
    ram.setU16(a6 + S.w24, ram.u16(a6 + S.w26));            // $254B00 move.w
  }
  const c = (ram.u8(a6 + S.w22) - 1) & 0xff;                // $254B06 subq.b
  ram.setU8(a6 + S.w22, c);
  if (c === 0xff) {                                         // $254B0A bcc
    ram.setU8(a6 + S.w22, ram.u8(a6 + 0x23));               // $254B0C move.b
    const idx = ram.u16(a6 + S.w24);                        // $254B12 move.w
    ram.setU32(a6 + S.anim,
      ctx.rom.u32(ram.u32(a6 + S.w2a) + i16(idx)));         // $254B1A move.l
    const nx = ram.u16(a6 + S.w24) - 4;                     // $254B20 subq.w #4
    ram.setU16(a6 + S.w24, nx < 0 ? ram.u16(a6 + S.w26) : u16(nx));  // $254B26
  }
  if (ram.u16(a6 + S.player) !== 0) {                       // $254B2C tst.w
    if (ram.u16(0x81294c) !== 0) return null;               // $254B32 tst.w/beq
  } else if (ram.u16(0x81294e) !== 0) return null;          // $254B3C tst.w/bne
  return hPhaseEmit(ram, ctx, a6);                          // $254B44
}

// =========================================================== the shared tails
/** `$2548A0` / `$254962` / `$254A3C` / `$254B44` -- the identical four-line
 *  phase gate every emitting handler ends with.  `$81308C` non-zero skips the
 *  gate entirely; otherwise the segment draws only on its own half of
 *  `$80390C`'s per-frame alternation. */
function hPhaseEmit(ram, ctx, a6) {
  if (ram.u16(0x81308c) === 0) {                            // $2548A0 tst.w/bne
    const d2 = ram.u16(a6 + S.player) !== 0 ? 1 : 0;        // $2548A8..$2548B0
    if (d2 === ram.u16(0x80390c)) return null;              // $2548B2 cmp.w/beq
  }
  return emit(ram, ctx, a6);                                // $2548BA jmp
}

function emit(ram, ctx, a6) {
  return enqueueThroughStub(ram, ctx.rom, LASER.emitStub, a6);
}

/** `$254E04` -- a segment reached the top of the playfield.  It sets the beam
 *  record's "complete" pair and kills itself. */
function hKill(ram, b, a6) {
  if (ram.u16(b.rec + 0x0c) === 0) {                        // $254E16 tst.w/bne
    ram.bset8(b.rec + 0x01, 0);                             // $254E1C bset #0
    ram.setU16(b.rec + 0x0c, 1);                            // $254E22 move.w
  }
  ram.setU16(a6 + S.type, 0);                               // $254E28 clr.w
  return null;
}

/**
 * `$254F48` -- the tail types 0, 5, 10 and 15 branch to, and the routine that
 * decides how far up the screen the drawn beam reaches.  `$254FE6` builds the
 * five-word request the DRAW `$255042` then walks.
 */
function hBeamTail(ram, ctx, b, a6, d0) {
  let d1 = ram.u16(b.word);                                 // $254F48 / $254F66
  const a0 = b.blk;
  if (ram.btst8(b.rec, 4)) {                                // $254F7E btst #4
    ram.setU16(a0 + 0x16, 9);                               // $254F84 move.w #9
  } else if (ram.u16(a0 + 0x16) === 0) {                    // $254FA2 tst.w/bne
    ram.setU16(a0, 0);                                      // $254FA8 clr.w
    return hDrawGate(ram, ctx, b, a6);                      // -> $254FAA
  }
  if (d0 >= d1) {                                           // $254F8A cmp.w/bcc
    ram.setU16(a6 + S.type, 0);                             // $254F9A clr.w (A6)
    if ((ram.u16(a0) & 0x8000) === 0) {                     // $254F9C tst.w/bpl
      beamRequest(ram, ctx, b, a6, d1);                     // $254F9E -> $254FE6
    }
    return null;                                            // $254FA0 rts
  }
  if (d0 < ram.u16(a0 + 0x02)) {                            // $254F8E cmp.w/bcs
    return hDrawGate(ram, ctx, b, a6);                      // $254F92 -> $254FAA
  }
  d1 = d0;                                                  // $254F94 move.w
  beamRequest(ram, ctx, b, a6, d1);                         // $254F96 bsr $254FE6
  return hDrawGate(ram, ctx, b, a6);                        // $254F98 bra
}

/** `$254FAA..$254FE4` -- the same sound-queue + phase gate, one more time. */
function hDrawGate(ram, ctx, b, a6) {
  if (ram.u16(a6 + S.player) !== 0) {                       // $254FAA tst.w
    if (ram.u16(0x81294c) !== 0) return null;               // $254FB0 tst.w/beq
  } else if (ram.u16(0x81294e) !== 0) return null;          // $254FBA tst.w/bne
  return hPhaseEmit(ram, ctx, a6);                          // $254FC2
}

/**
 * `$254FE6` -- write the five-word beam request into `$811F32`/`$811F52`,
 * including the `$24BB0A` (offset, pointer) pair the DRAW walks.
 *
 * `move.l (A1)+,D0 / move.w D0,(A0)+` takes only D0's LOW word, and D0 is
 * written a SECOND time at `($18,A0)` -- that second copy is the RELOAD
 * `$2550A8 move.w ($18,A6),($10,A6)` uses when the walk underflows.
 */
function beamRequest(ram, ctx, b, a6, d1) {
  const a0 = b.blk, a5 = b.player;
  ram.setU16(a0 + 0x00, 0x8000);                            // $254FE6 move.w
  ram.setU16(a0 + 0x02, u16(d1 + 0x200));                   // $254FEA/$254FEE
  ram.setU16(a0 + 0x04, ram.u16(a6 + S.posX));              // $254FF0 move.w
  let d3 = u16(ram.u16(a5 + 0x22) * 4);                     // $254FF8..$254FFC
  if (ram.btst8(a5 + P.flags1, 0)) {                        // $255000 btst #0
    d3 = u16(d3 + 0x78);                                    // $255008 addi.w
  } else if (ram.u16(a5 + P.optFormation) !== 2) {          // $25500E cmpi.w
    d3 = u16(d3 + 0x50);                                    // $255016 addi.w
  } else if (ram.u16(a5 + P.shipSel) !== 0) {               // $25501C tst.w
    d3 = u16(d3 + 0x28);                                    // $255022 addi.w
  }
  const a1 = 0x24bb0a + i16(d3);                            // $255026/$25502C
  const d0 = ctx.rom.u32(a1);                               // $25502E move.l
  ram.setU16(a0 + 0x10, d0 & 0xffff);                       // $255030 move.w
  ram.setU32(a0 + 0x12, ctx.rom.u32(a1 + 4));               // $255032 move.l
  ram.setU16(a0 + 0x18, d0 & 0xffff);                       // $255036 move.w
  ram.setU8(a0 + 0x1d, ram.u8(a6 + S.power));               // $255038 move.b
}

// =========================================================== $254C1E
/**
 * `$254C1E` -- **THE INSTRUCTION THAT STARTS THE BEAM.**
 *
 * `bset #5,(A4)` with A4 = the OPTION BLOCK is what both builders' opening
 * `btst #5,(A6)` waits for, and it is reached only from a segment handler.
 * The rest of the routine writes the BEAM RECORD `$811EF2` and the pool pair
 * at `$811892` from the segment's own `($2c,A6)` and `($28,A6)` sub-templates,
 * with the hitbox word coming out of `$24A824` indexed by the player's power,
 * formation and ship select.
 *
 * `$254D06` is its twin with `jsr $245314` -- the beam's DAMAGE entry -- in the
 * middle.  It is NOT ported: `$245314`/`$2453AC` are W37's L3.
 */
function startBeamRecords(ram, ctx, b, a6) {
  const { opt } = b;
  ram.bset8(opt + OPT.state, 5);                            // $254C1E bset #5
  // $254C22..$254C58: A2/A3/A4/A5 are chosen by ($1a,A6), the segment's own
  // player word -- NOT by the driver's loop variable.
  const p = ram.u16(a6 + S.player) !== 0 ? BEAM[0] : BEAM[1];
  const a2 = p.rec, a3 = p.pair, a5 = p.player;

  let a1 = ram.u32(a6 + S.w2c);                             // $254C58 movea.l
  ram.setU16(a2, ctx.rom.u16(a1)); a1 += 2;                 // $254C5C move.w
  const d1 = (ram.u32(a5 + P.posY) + ctx.rom.u32(a1)) >>> 0; // $254C5E/$254C62
  a1 += 4;
  ram.setU32(a2 + 0x02, d1);                                // $254C64 move.l
  ram.setU16(a2 + 0x06, ctx.rom.u16(a1)); a1 += 2;          // $254C68 move.w
  ram.setU32(a2 + 0x08, ctx.rom.u32(a1)); a1 += 4;          // $254C6C move.l
  ram.setU16(a2 + 0x0c, ctx.rom.u16(a1)); a1 += 2;          // $254C70 move.w

  // $254C74..$254CB0 -- the $24A824 hitbox/size word.
  let d0 = ram.u16(a5 + 0x22), d2, d3;                      // $254C7A move.w
  if (ram.btst8(a5 + P.flags1, 0)) {                        // $254C7E btst #0
    d0 = u16(d0 + 0x3c);                                    // $254C86 addi.w
    d2 = ram.u16(a5 + P.shipSel);                           // $254C8A move.w
    d3 = u16(ram.u16(a5 + P.optFormation) - 2);             // $254C8E/$254C92
  } else {
    d3 = u16(ram.u16(a5 + P.optFormation) - 2);             // $254C96/$254C9A
    d0 = u16(d0 + u16(d3 * 4 + d3));                        // $254C9C..$254CA4
    d2 = ram.u16(a5 + P.shipSel);                           // $254CA6 move.w
    if (d2 !== 0) d0 = u16(d0 + 0x1e);                      // $254CAA/$254CAC
  }
  const hw = ctx.rom.u16(0x24a824 + i16(d0));               // $254CB0 move.w
  ram.setU16(a2 + 0x0e, hw);                                // $254CB4 move.w
  ram.setU16(a2 + 0x18, d2);                                // $254CB8 move.w
  ram.setU16(a2 + 0x1a, d3);                                // $254CBC move.w
  ram.setU16(a2 + 0x1c, hw);                                // $254CC0 move.w

  // $254CC4..$254D02 -- TWO $30-byte pool records written back to back from
  // the ($28,A6) sub-template, the second starting $30 after the first.
  let s = ram.u32(a6 + S.w28), a = a3;                      // $254CC4 movea.l
  ram.setU16(a, ctx.rom.u16(s)); s += 2; a += 2;            // $254CC8 move.w
  a += 4;                                                   // $254CCA addq.w #4
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $254CCC move.l
  a += 4;                                                   // $254CCE addq.w #4
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $254CD0 move.l
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $254CD2 move.l
  ram.setU16(a, ctx.rom.u16(s)); s += 2; a += 2;            // $254CD4 move.w
  ram.setU16(a, hw); a += 2;                                // $254CD6 move.w D0
  ram.setU16(a, ram.u16(a6 + S.player)); a += 2;            // $254CD8 move.w
  ram.setU16(a, ctx.rom.u16(s)); s += 2; a += 2;            // $254CDC move.w
  ram.setU8(a - 1, ram.u8(a6 + S.power));                   // $254CDE move.b
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $254CE4 move.l
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $254CE6 move.l
  a += 0x0a;                                                // $254CE8 lea
  ram.setU16(a, ctx.rom.u16(s)); s += 2;                    // $254CEC move.w
  a += 0x1a;                                                // $254CEE lea
  ram.setU16(a, ram.u16(a6 + S.player)); a += 2;            // $254CF2 move.w
  ram.setU16(a, ctx.rom.u16(s)); s += 2; a += 2;            // $254CF6 move.w
  ram.setU8(a - 1, ram.u8(a6 + S.power));                   // $254CF8 move.b
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $254CFE move.l
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;            // $254D00 move.l
  ram.setU32(a, ctx.rom.u32(s));                            // $254D02 move.l
  void ctx;
}

// =========================================================== $255042
/**
 * `$255042` -- THE BEAM DRAW, type-5 call #11.  Both players, in ROM order.
 *
 * **W37 §7.4 leaves this routine's extent open** ("`$255042..~$2551FD`; I did
 * not find its `rts`").  It ends at `$255156`: P1 `$255042..$2550CA`, P2
 * `$2550CC..$255154`, two `rts`.  `$25515A` is a different routine that
 * borrows the second `rts` as its own and is reached from neither.
 */
export function runBeamDraw(ram, ctx) {
  let emitted = 0;
  for (const b of BEAM) {
    const a6 = b.blk;
    if ((ram.u16(a6) & 0x8000) === 0) continue;             // $255048 tst.w/bpl
    // $25504E..$255066 -- the effect, on the OTHER half of $80390C from the
    // draw and only while $81308C says the collision pass is live.
    const phase = ram.u16(0x80390c) !== 0;
    if ((b.d7 ? phase : !phase) && ram.u16(0x81308c) !== 0
        && ram.u16(b.sound2) === 0) {
      ctx.unportedLog.note(b.d7 ? LASER.fxBeamP1 : LASER.fxBeamP2,
        `$255066/$2550F0 jsr $289FC0/$289FDA -- the beam's own effect. The `
        + `$289xxx family is unported (W34 §1.6) and is COUNTED, not thrown: `
        + `it fires on the frames the beam is drawn`);
    }
    // $25506C..$255084 -- the top of the drawn beam, clamped to the pod.
    let d0 = u16(ram.u16(b.word) + (b.d7 ? 0x180 : 0));     // $255072 / $2550F6
    const d1 = u16(ram.u16(b.opt + OPT.posY) + 0x400);      // $25507C / $255102
    if (d0 < d1) d0 = d1;                                   // $255080 cmp.w/bcc

    // $255086..$25509E -- five words built at ($2,A6) from the $24BB0A pair.
    const src = ram.u32(a6 + 0x12) + i16(ram.u16(a6 + 0x10));  // $25508A/$25508E
    ram.setU16(a6 + 0x02, d0);                              // $255092 move.w
    ram.setU16(a6 + 0x04, ram.u16(b.player + P.posX));      // $255094 move.w
    ram.setU32(a6 + 0x06, ctx.rom.u32(src));                // $25509A move.l
    ram.setU32(a6 + 0x0a, ctx.rom.u32(src + 4));            // $25509C move.l
    ram.setU16(a6 + 0x0e, ctx.rom.u16(src + 8));            // $25509E move.w

    const nx = ram.u16(a6 + 0x10) - 0x0a;                   // $2550A0 subi.w
    ram.setU16(a6 + 0x10, nx < 0 ? ram.u16(a6 + 0x18) : u16(nx));  // $2550A6/$2550A8

    // $2550AE..$2550C6 -- the draw's own gate, and it is NOT the handlers'.
    if (ram.u16(b.sound2) !== 0) continue;                  // $2550AE tst.w/bne
    if (ram.u16(0x81308c) === 0 && ram.u16(0x80390c) !== 0) continue;  // $2550B6
    enqueueThroughStub(ram, ctx.rom, LASER.emitStub, a6);   // $2550C6 jsr
    emitted++;
  }
  return emitted;
}

// =========================================================== the L3 boundary
/** `$24CDC0` -- BEAM BUILDER 2.  Reached only by `$24C37A bsr`, and W37 §7.3
 *  found NO inbound reference to `$24C37A` by an operand sweep of build B, a
 *  whole-image longword search and the formation dispatch.  `$24C368`'s arm
 *  ends `bra $24C37E`, which jumps it.  This is a THROW, not a deletion, and it
 *  is NOT labelled dead code -- two comments on this project have claimed
 *  unreachability and been artifacts of something else being unported. */
export function builder2(ram) {
  void ram;
  unreached(LASER.builder2, `$24CDC0, the SECOND beam builder. Its only caller `
    + `is $24C37A bsr, which $24C368's \`bra $24C37E\` jumps and for which W37 `
    + `§7.3 could find no inbound reference by three independent searches. `
    + `Reaching it means one of those searches was wrong -- and it carries the `
    + `beam's start-of-beam damage entry $24CE46 jsr $24536E, which is W37's L3`);
}
