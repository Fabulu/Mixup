// THE DAMAGE DELIVERY -- object type 5's tail `$28B670` and the shot half of
// the collision pass `$244D62`.  WAVE 34.
//
// This is the routine that makes an enemy's HP go down.  Until this wave the
// port could not reduce any enemy's HP at all: `$286096` was a counted note in
// every handler, so the HP word every handler tests with `tst.w ($18,A6)` never
// moved and NOTHING IN THE GAME HAD EVER DIED.  MEASURED over 12,000 frames
// with this file live and the fire button tapped every fourth frame: 2,064
// shot-vs-enemy overlaps and 343 kills, against 0 and 0 for the identical run
// with the button never pressed.
//
// W33 §3 predicted a second consequence -- "the distance clock stops at 239 and
// eight of the nineteen stage-1 handlers are unreachable until damage lands" --
// AND THAT PREDICTION IS FALSE, which W34 measured with the control above: the
// clock reaches 836 and all eight handlers execute WITHOUT a single hit.  239
// was the end of the `fly-around` window (2,200 frames from lf2000), and the
// clock passes it at lf4250.  `$26132C addq.w #1,$8130CE` is gated on the
// script FREEZE and never on the scroll SPEED (W19 §2.1), so a halted stage
// still advances its clock.
//
// ============================ WHAT THE ENUMERATION SAID ======================
//
// `tools/oracle/w34damage.py` scanned EVERY EVEN OFFSET of `$244D62..$245312`
// for `jsr`/`jmp`/`bsr` and found **exactly one external target in 1,456
// bytes**: `$2453AC`, the laser's own pass, reached by `$24530C bsr.w`.  The
// collision routine calls no allocator, no score routine and no effect
// spawner.  So porting damage DELIVERY drags in nothing -- which is why this
// file has two imports and neither is a subsystem.
//
// `$244D62` has FOUR absolute callers and all four are this tail:
// `$28B6B8`, `$28B6FE`, `$28B766`, `$28B79C`.  Nothing else in build B reaches
// it, so the tail and the pass are one machine and are ported together.
//
// ========================= THE POST-INCREMENT, WHICH IS THE WHOLE TRAP =======
//
// A5 and A6 are POST-INCREMENTED by the live tests (`move.w (A5)+,D0`), so
// inside the loop bodies the displacements are shifted:
//
//     A5 = enemy record + 2       ->  `$16(A5)` is record `+$18`  == THE HP
//                                     `-$2(A5)` is record `+$0`   == the type word
//                                     ` (A5)`   is record `+$2`   == X
//     A6 = shot record  + 4       ->  `$14(A6)` is record `+$18`  == the POWER
//                                     `-$3(A6)` is record `+$1`   == the hit byte
//
// Read `$16(A5)` as record `+$16` and the routine appears to damage a field no
// handler reads.  The A2 loop settles it from the other side: `$245248
// cmpi.w #$6F00,$2(A5)` with A5 UN-incremented is the identical test that
// `$245058 cmpi.w #$6F00,(A5)` writes against the incremented pointer --
// and `10-recon-combat.md` §4 read that one as "the target's TYPE WORD",
// which it is not.  It is X.
//
// ============================== WHAT IS PORTED ==============================
//
// `$244D62` is six blocks.  This file runs the three that are "a player shot"
// and COUNTS the rest, each under its own ROM address:
//
//   | # | span                | walks                        | ported |
//   |---|---------------------|------------------------------|--------|
//   | 1 | $244D62..$244D92    | $2459D0, the PLAYER's box    | NOTE (L16) |
//   | 2 | $244D94..$244DFE    | $816B7C x $8171BA            | NOTE   |
//   | 3 | $244DFE..$244E5C    | $8171BE x $817F7E            | NOTE   |
//   | 4 | $244E5C..$244EE0    | the enemy pool, RAM damage   | NOTE   |
//   | 5 | $244EE0..$244F66    | the 36 shots -> a bounding box | **YES** |
//   |6a | $244F68..$245076    | $81459C (100) x the 36 shots | **YES** |
//   |6b | $245078..$245188    | $81521C (50)  x the 36 shots | **YES** |
//   | 7 | $24518A..$24525C    | $811802 (the A2 weapon)      | NOTE (L13) |
//   | 8 | $24525C..$245310    | $811892 + bsr $2453AC laser  | NOTE (L13) |
//
// Blocks 2, 3 and 4 all consume the box that block 1's `$2459D0` computes, so
// they are noted as ONE deferral naming all four addresses: running them on an
// uncomputed box would be worse than not running them.  Block 4 is the only
// one of the four that damages an enemy (`$244ED2 subq.w #1,$16(A6)` -- ramming
// costs the enemy exactly 1 HP) and it is named separately inside that note so
// the gap is legible.
//
// NOTHING HERE IS SILENT.  Every deferral is an `UnportedLog` note filed under
// the ROM address of the instruction it replaces.

// ======================= WAVE 51: THE BEAM'S OWN DAMAGE ======================
//
// The owner, playing the live build after W45: "Laser no longer crashes the
// game, your little options come to front, but no laser graphics happen and
// **the enemies don't die**."  This wave is the second half of that sentence.
//
// W45 left `$2453AC` a loud named throw and said why (§10: "No damage.  The
// beam melts nothing").  What it did NOT say, because it did not need to, is
// that the beam's damage is not reached from `laser.js` at all -- it is reached
// from HERE.  `$245310` is `bra.w $24560A`, so `$244D62` does not end at
// `$245310`, and the three blocks after the shot loops are:
//
//   | 7 | $24518A..$24525A | A2 = $811802 (beam pool slot 27) vs 150 slots |
//   | 8 | $24525C..$24530A | A3 = $811892 (slot 30)           vs 150 slots |
//   |   | $24530C bsr $2453AC   THE BEAM'S OWN PASS, 100 + 50 slots        |
//   | 9 | $24560A..$2459CE | the BOMB-LASER's, behind `$811F72` negative   |
//
// **AND ALL FOUR ARE GATED ON THE LASER BYTE.**  `$24519A tst.b ($3f,A4) /
// $24519E beq.w $24560A` -- `($3f,A4)` is the byte `$24C282` sets on the frame
// the arm-up completes and `$24C2D6` clears on release (W45 §2 found it from
// the other end, in `$249B40`).  So blocks 7, 8 and `$2453AC` run if and ONLY
// if a beam is being fired, which is why W34 could note the whole tail away
// without losing a single hit: nothing in this port could hold fire.
//
// MEASURED, this wave, from the shipped bundle seed with fire held from the
// first step: `($3f,A4)` is 1 from +17 and the `$24518A` note fired 301 times
// in 601 steps -- every frame the `$80390C` alternation gives P1 the pass.
//
// -------------------------- THE BIT THAT ARMS THE PASS ----------------------
//
// `$2453BA bset #$1,(A1) / $2453BE beq.w $245608` is a BYTE operation on the
// beam record's high byte, i.e. bit 9 of the word `$811EF2`, i.e. **`$0200`**.
// `bset` sets Z from the bit's OLD value, so the pass arms itself on its first
// run and damages from its second run onward.
//
// **THAT RETIRES W45 §0.4's ONE UNEXPLAINED NUMBER.**  W45 measured the port's
// `$811EF2` as `$8000` where `10-recon-combat §2`'s board trace has `$8200`,
// and guessed `$0200` was "a per-power bit of the sub-template" it had not
// reproduced.  It is not: `$0200` is this instruction, and the board trace has
// it because the board's beam had run its damage pass.  The guess was testable
// and wrong; the port now reproduces `$8200` for the ROM's own reason.
//
// It also means `$245314` and `$24536E` -- the two entries W37 §4.1 calls "the
// beam's damage entries", whose only callers are `$254DA2` (inside `$254D06`)
// and `$24CE46` (inside `$24CDC0`) -- are NOT needed to arm it.  A build-B
// sweep this wave for every `bra/bsr/bcc/jsr/jmp` reaching `$254D06` returns
// **0 sites**, the same shape as W37 §7.3's result for `$24C37A`; both stay
// unported and neither is called dead code.
//
// ------------------------------ THE $400 BIT --------------------------------
//
// `$2454E0` and `$2455F2 ori.w #$400,D4 / or.w D4,(A5)` (and block 8's
// `$2452F2 ori.w #$4400,D4`) put bits into the ENEMY's type word that the
// handlers' `moveq #$5C,D1 / and.b (A6),D1` reads.  `$400` is D1 bit 2, and
// `$286096`'s `$2860EC btst #$2,D1` takes `bsr $286876` instead of the plain
// BCD add.  **So the score fork the beam makes live is `$286876`, not the
// `$811F72` forks** -- see `src/score.js`, which ports it this wave.
//
// ------------------------------ WHAT STILL DEFERS ---------------------------
//
// `$24560A` (block 9, the BOMB-LASER's 966 bytes) is transcribed only as far as
// its own two guards, both of which are FALSE on this tree, and throws by
// address beyond them.  `$2459D0` and blocks 2-4 are unchanged (L16).
//
// **W423: THE PARAGRAPH ABOVE IS THE STATE AS OF THE WAVE THAT WROTE IT AND IS
// NO LONGER TRUE.  IT IS KEPT BECAUSE IT IS THAT WAVE'S RECORD, NOT DELETED.**
// `$24560A` no longer throws past its guards: `bomb.js:1102 bombDamage24560A`
// runs the whole 150-slot walk, and `$245636 bne` routes the BOMB-LASER arm to
// `bomb.js:1258 bombDamageAlt2456A6`, which W65 ported in full.
//
// Said plainly, because a reader who trusts the paragraph above will look in the
// wrong file: **the bomb-laser's damage IS ported, and it lives in `bomb.js`.**
//
// WHAT REMAINS TRUE, and it is the part that matters for D56/D43: **both guards
// are still FALSE on every bench in this repo.**  `$245614 bpl` needs `$811F72`
// NEGATIVE and `$245618 btst #$6` needs bit 6 of `($1,A4)`.  So no test here has
// ever run a single line of it.  That is a statement about the BENCHES, not
// about the code -- exactly the distinction D60 turned on, where a routine
// declared "two gates away from reachable" was being executed by the owner.

// ================= WAVE 60 (I1): `$2459D0` AND BLOCKS 1, 2, 3, 4 =============
//
// Recon 59 §10 sized the item subsystem at three waves and said the FIRST one
// is not items: **`$2459D0` is the gate.**  `$244D62`'s block 2 is the item
// COLLECTION -- one `or.w $80FA72,(status)` -- and the note above deferred it
// with blocks 1, 3 and 4 because all three consume the box block 1 computes.
// This wave computes the box.  L16 is retired.
//
// ------------------- WHAT `$2459D0` ACTUALLY IS, and it is not "a box" -------
//
// It is **the player's box against the ENEMY BULLET POOL**, i.e. the routine
// that decides the player has been shot.  [M] `$2459EC lea $817F8E,A6` is
// `src/bullets.js`'s own `BUL.pool` ($817F8C) **plus 2**, and the four-rung
// ladder at `$2459F6`/`$245A02`/`$245A0E`/`$245A1A` is `BUL.window`
// ($81B414/$81B416/$81B418/$81B41A) instruction for instruction.  Its D6 values
// are `#$6 / #$A / #$F / #$12 / #$14` and **the body is TEN-WAY UNROLLED** --
// ten identical 52-byte copies, `$245A26`..`$245C2A`, with a single
// `$245C2E dbra D6,$245A26` at the bottom -- so the slot counts are
// `(D6+1)*10` = **70 / 110 / 160 / 190 / 210**, which reproduces
// `BUL.windowIters` (`$D/$15/$1F/$25/$29`, the non-unrolled `dbra` counts at
// `$281332`) EXACTLY, from a different instruction stream.  A reader who took
// `$2459D0` for a 52-byte routine would have walked ONE bullet.
//
// The ten copies are byte-identical except for their branch displacements; this
// port writes the loop once and says so here, which is the only place the
// unrolling is visible.
//
// ------------------------- WHAT IT WRITES, all four things ------------------
//
//   `$245A44 or.b #$10,(-$4,A6)`  the BULLET's type-word high byte, bit 4
//   `$245A48 or.b #$10,(A4)`      **the PLAYER's** state-word high byte, bit 4
//   `$245A4A move.w #$1,$80FA7E`  the "player was hit" flag block 1 tests
//   `$245A52 bra $245C32`         and it RETURNS -- at most ONE bullet a pass
//
// `$245A3A moveq #$51,D4 / and.b (-$4,A6),D4 / bne` is the reject: bits 0, 4
// and 6 of the bullet's high byte.  Bit 4 is the one this routine SETS, so a
// bullet that has already hit is skipped -- the mask is its own idempotence.
//
// ------- THE CONSEQUENCE, MEASURED, AND WHY IT DOES NOT STOP THE BUILD ------
//
// `$8103E6` bit 4 (byte op) is exactly the bit `src/player.js` tests at
// `$249542 bclr #$4,(A6) / bne $249F8A` -- the W164 PLAYER DEATH routine
// (`$24A00C..$24A018` loads, quarters and stores the rank power;
// `$24A10E jsr $27E812` is the player's own item drop).  So `$2459D0` is the
// instruction that makes player death reachable.
//
// [M] Older seeded gates did not reach it because the inherited player
// invulnerability byte was `$FF`, the hold value `$24952E` refuses to
// decrement. W164 validates the now-live port with a controlled board run:
// zero invulnerability plus this exact hit bit enters `$249F8A`, then reaches
// the final `$24A21A` deferred-kill handoff 70 logic frames later.
//
// ------------------------------- BLOCK 4 IS REAL ----------------------------
//
// Blocks 2 and 3 walk pools whose live counts (`$8171BA`, `$817F7E`) are 0 on
// this tree, so they are transcribed-and-unexercised.  **Block 4 is not**:
// `$815E9E` is 31 in the fly-around seed, so ramming now costs an enemy
// `$244ED2 subq.w #1,($16,A6)` -- one HP -- and can kill it.  Note it exits the
// whole pass on its first hit (`$244ED6 bra $244EE0`), takes at most ONE enemy
// per pass, and requires bit 0 of the enemy's type word (`$244EB0 andi.w #$1`)
// plus a Y that is not off the top (`$244EBE cmpi.w #-$800,D4 / bcc`).
//
// **THE ORDER, for `20-OWNER-scoring-must-be-exact`:** block 4 writes an HP
// word and the player's hit bit and NOTHING ELSE -- no `$286096`, no `$28615E`,
// no rank word.  A ram-kill's score is written later, by the ENEMY's own death
// arm, at the enemy driver's dispatch position -- which is W34 §5's argument
// unchanged, and no write this wave adds chose its own place in the frame.

import { u16, i16 } from './ram.js';
import { unreached } from './unported.js';
import { bombDamage24560A } from './bomb.js';

export const DMG = {
  tail: 0x28b670,            // object type 5's tail
  pass: 0x244d62,            // THE COLLISION/DAMAGE PASS
  passNoPlayer: 0x244d40,    // its player-box-only entry
  playerBox: 0x2459d0,       // $244D84 jsr $2459D0(pc)
  loopBullets1: 0x244db4,    // $816B7C, stride $3E
  loopBullets2: 0x244e12,    // $8171BE, stride $2A
  loopRam: 0x244e5c,         // the PLAYER's body vs the enemy pool: -1 HP
  weaponA2: 0x24518a,        // $811802 vs 150 enemy slots
  weaponA3: 0x24525c,        // $811892 vs 150 enemy slots
  laserPass: 0x2453ac,       // $24530C bsr.w
  bombLaserBlock: 0x24560a,  // $245310 bra.w -- $244D62's NINTH block
  bombLaserBody: 0x245622,   // ...past its two guards
  damageSeg: 0x245314,       // $254DA2 jsr -- inside the unreachable $254D06
  damageStart: 0x24536e,     // $24CE46 jsr -- inside the unreachable $24CDC0
  fa7c: 0x80fa7c,            // $2453AC clr.w -- 0 = the per-frame pass
  b410: 0x81b410,            // $2453F2 / $24550C / $245484 tst.w
  laserSlot27: 0x811802, laserSlot27P2: 0x811e02,
  laserSlot30: 0x811892, laserSlot30P2: 0x811e92,
  beamRecP1: 0x811ef2, beamRecP2: 0x811f12,
  laserRec: 0x811f72,        // $24560A lea $811F72,A6 -- the BOMB-LASER's record
  laserByte: 0x3f,           // $24519A tst.b ($3f,A4) -- $24C282 writes it
  // the two writes the pass makes that a gate can see
  shotHitBit: 0x245044,      // bset #$7,(-$3,A6)   -- state.js taps this
  // the globals
  fa72: 0x80fa72,            // $244D62 move.w D0,$80FA72   (the hit mask)
  // ---- WAVE 60 (I1).
  fa7e: 0x80fa7e,            // $244D7E clr / $245A4A move.w #$1 -- "player hit"
  bulletPool: 0x817f8c,      // $2459EC lea $817F8E,A6 is this PLUS 2
  bulletStride: 0x40,        // $245A56 lea ($3e,A6),A6 with A6 at base+2
  // $2459F6/$245A02/$245A0E/$245A1A -- the four rungs, and the five D6 values
  bulletWindow: [0x81b414, 0x81b416, 0x81b418, 0x81b41a],
  bulletD6: [0x06, 0x0a, 0x0f, 0x12, 0x14],
  bulletUnroll: 10,          // ten copies of the body per `dbra`
  itemPool: 0x816b7a,        // $244DA8 lea $816B7C,A6 is this PLUS 2
  itemCount: 0x8171ba,       // $244D9C move.w $8171BA,D6
  itemStride: 0x40,          // $244DF6 lea ($3e,A6),A6 with A6 at base+4
  impactPool: 0x8171be,      // $244E06 lea $8171BE,A6
  impactCount: 0x817f7e,     // $244DFE move.w $817F7E,D6
  impactStride: 0x2c,        // $244E54 lea ($28,A6),A6 with A6 at base+4
  b6e6: 0x81b6e6,            // $244D68 move.w D1,$81B6E6
  b6e8: 0x81b6e8,            // $244D6E move.w D2,$81B6E8
  box: 0x80fa74,             // the 36 shots' bounding box: maxY minY maxX minX
  gate308c: 0x81308c,        // $28B670 tst.w / $245036 tst.w
  mirror2: 0x80390c,         // $28B6B0 tst.w
  loop98: 0x813098,          // $28B706 tst.w
  g393a: 0x80393a,           // $28B710 tst.w
  g309c: 0x81309c,           // $28B71A cmpi.w #$1
  hyper1: 0x81b63e, hyper2: 0x81b640,
  hyperLvl1: 0x81b654, hyperLvl2: 0x81b656,
  p1rec: 0x8103e6, p2rec: 0x810448,
  p1shots: 0x810572, p2shots: 0x810c32,
  poolA: 0x81459c, poolACount: 0x815e9e,   // $244F68 / $244F6E
  poolB: 0x81521c, poolBCount: 0x815ea0,   // $24507A / $245080
  shotSlots: 36,             // $244EE2 moveq #$23,D6
  shotStride: 0x30,
  enemyStride: 0x20,
  /** `$28B6A0 move.w #$1000,D0` (P1) / `$28B6E6 move.w #$800,D0` (P2).  These
   *  are the bits the handlers' `moveq #$5C,D1 / and.b (A6),D1` tests: `$1000`
   *  is bit 4 of the HIGH byte and `$800` is bit 3, and `$286096` credits P1 on
   *  `btst #4,D1` and P2 on `btst #3,D1`.  So the mask is not decoration -- it
   *  is which player's score the hit lands in. */
  maskP1: 0x1000, maskP2: 0x0800,
};

/** Exact host-side geometry for the private logical owner. Native P1/P2 rows
 * remain the only cartridge owners; this geometry is accepted only by the
 * outgoing-only entry below. */
export const PRIVATE_DAMAGE_GEOMETRY = Object.freeze({
  ownerIndex: 2,
  player: 0x10000100,
  shots: 0x10000400,
  shotSlots: 36,
  shotStride: 0x30,
  beamControl: 0x10000b00,
  slot27: 0x10001110,
  slot30: 0x100011a0,
  scratch: 0x10001400,
  scratchLength: 0x0e,
  hyperShadows: 0x1000140e,
  hyperShadowLength: 0x04,
  receipts: 0x10001420,
  receiptCount: 150,
  enemyBase: 0x81459c,
  enemySlots: 150,
  enemyStride: 0x20,
  ordinaryMask: 0x4000,
  weaponMask: 0x4400,
  phaseAddress: 0x80390c,
});

/** The box, four RAM words at `$80FA74`, and THE FIRST PAIR IS Y.
 *
 * `$244F14 movem.w (A6),D0/D2` loads D0 from record `+$2` and D2 from `+$4`,
 * and the shot record's `+$2` is Y (`$253B9A add.w D0,($2,A6)` is the vertical
 * step).  So `$80FA74`/`$80FA76` bound Y and `$80FA78`/`$80FA7A` bound X.
 * Naming them the other way round costs nothing until somebody reads the file.
 *
 * THE TWO AXES ARE NOT COMPUTED SYMMETRICALLY, and it is in the listing:
 *   `$244F1E add.w (A1)+,D0 / $244F20 move.w D0,D1 / $244F22 sub.w (A1)+,D1`
 *      -- Y's minimum is derived from the ALREADY-BIASED maximum;
 *   `$244F18 move.w D2,D3` (BEFORE the add) `/ $244F24 / $244F26`
 *      -- X's minimum is derived from the RAW coordinate.
 * With equal half-extents the Y minimum is exactly Y and the X minimum is not.
 */
const BOX = { maxY: 0x80fa74, minY: 0x80fa76, maxX: 0x80fa78, minX: 0x80fa7a };

function note(ctx, addr, what) { ctx?.unportedLog?.note(addr, what); }

// ---------------------------------------------------------------------------
// `$2459D0` -- THE PLAYER'S OWN BOX, and the enemy-bullet pool it is tested
// against.  Ledger row L16, deferred since W34, and the gate recon 59 named for
// the whole item subsystem.
//
// NO ABSOLUTE CALLER EXISTS.  Both entries are PC-relative:
// `$244D84 jsr ($2459D0,PC)` (block 1) and `$244D5A jmp ($2459D0,PC)`
// (`$244D40`, the no-shot entry) -- which is why `xref.py callers 2459D0`
// returns nothing and why a census that stopped there would call it dead.
//
// Returns the box in D0..D3 AND the hit flag, because the caller needs both:
// `$244D8A tst.w $80FA7E / bne.w $244EE0` skips blocks 2-4 on a hit, and
// `$244D94..$244D9A add.w D7,D0/D1/D2/D3` then biases what is left.
// ---------------------------------------------------------------------------

/** `$2459F2..$245A24` -- the ACTIVE-WINDOW ladder, four rungs, five outcomes.
 *  Returns the number of pool slots `$2459D0` walks: `(D6+1) * 10`, because the
 *  body is ten-way unrolled.  This is `src/bullets.js`'s `windowIters` written
 *  as the other instruction stream; `tests/w60playerbox.test.js` asserts the
 *  two agree, which is the only check that can catch one of them drifting. */
export function bulletWindowSlots(ram) {
  let rung = 0;                                       // $2459F2 move.w #$6,D6
  for (const w of DMG.bulletWindow) {                 // $2459F6/$245A02/...
    if (ram.u16(w) === 0) break;                      // ...beq $245A26
    rung++;
  }
  return (DMG.bulletD6[rung] + 1) * DMG.bulletUnroll;
}

const GRAZE_MARGIN = 0x0300;
const BULLET_POOL_SLOTS = (DMG.bulletD6.at(-1) + 1) * DMG.bulletUnroll;

function scanPlayerGrazes(ram, player, box, slots, hook) {
  const live = [];
  const near = [];
  const margin2 = GRAZE_MARGIN * GRAZE_MARGIN;
  for (let s = 0; s < BULLET_POOL_SLOTS; s++) {
    const rec = DMG.bulletPool + s * DMG.bulletStride;
    if ((ram.u16(rec) & 0x8000) === 0) continue;
    live.push(rec);
    if (s >= slots || (ram.u8(rec) & 0x51) !== 0) continue;
    const y = ram.u16(rec + 0x02);
    const x = ram.u16(rec + 0x04);
    const dy = y < box.d1 ? box.d1 - y : y > box.d0 ? y - box.d0 : 0;
    const dx = x < box.d3 ? box.d3 - x : x > box.d2 ? x - box.d2 : 0;
    if ((dy !== 0 || dx !== 0) && dy * dy + dx * dx <= margin2) near.push(rec);
  }
  hook(ram, { player, live, near });
}

export function playerBox(ram, a4, ctx = null) {
  // $2459D0..$2459EA.  D0/D1 are the LONG axis (record +$02) and D2/D3 the
  // SHORT (+$04), and each pair uses its OWN two half-extents: +$10/+$12 for
  // the long, +$14/+$16 for the short.  `machine.js`'s P.hitYPlus..P.hitXMinus
  // name these four and `10-recon-combat` §3 corrected three waves of reading
  // them as animation.
  const d0 = u16(ram.u16(a4 + 0x02) + ram.u16(a4 + 0x10));   // $2459D0/$2459D6
  const d1 = u16(ram.u16(a4 + 0x02) - ram.u16(a4 + 0x12));   // $2459D4/$2459DA
  const d2 = u16(ram.u16(a4 + 0x04) + ram.u16(a4 + 0x14));   // $2459DE/$2459E4
  const d3 = u16(ram.u16(a4 + 0x04) - ram.u16(a4 + 0x16));   // $2459E2/$2459E8
  const slots = bulletWindowSlots(ram);
  if (ctx?.playerGrazeHook) {
    scanPlayerGrazes(ram, a4, { d0, d1, d2, d3 }, slots, ctx.playerGrazeHook);
  }
  for (let s = 0; s < slots; s++) {
    // A6 walks base+2, so `(A6)+` is record +$02, `(A6)` is +$04 and
    // `(-$4,A6)` -- after the one post-increment -- is +$00's HIGH BYTE.
    const rec = DMG.bulletPool + s * DMG.bulletStride;
    const y = ram.u16(rec + 0x02);                    // $245A26 move.w (A6)+,D4
    if (d0 < y) continue;                             // $245A28 cmp.w D4,D0/bcs
    if (y < d1) continue;                             // $245A2C cmp.w D1,D4/bcs
    const x = ram.u16(rec + 0x04);                    // $245A30 move.w (A6),D4
    if (x < d3) continue;                             // $245A32 cmp.w D3,D4/bcs
    if (d2 < x) continue;                             // $245A36 cmp.w D4,D2/bcs
    // $245A3A `moveq #$51,D4 / and.b (-$4,A6),D4 / bne` -- bits 0, 4 and 6 of
    // the bullet's high byte.  Bit 4 is the one the next instruction SETS, so
    // this mask is what stops one bullet hitting twice; it is NOT $50 and it is
    // NOT the bullet's live bit (that is bit 7, and it is NOT tested here --
    // a FREE slot whose stale position falls inside the box is a hit, which is
    // the board's behaviour and is why the pool's clear at $28131E matters).
    if ((ram.u8(rec) & 0x51) !== 0) continue;         // $245A3C/$245A40
    if (ctx?.enemyBulletCollisionFilter) {
      const bank = (ram.u16(rec) & 0x0200) !== 0 ? 'B' : 'A';
      if (!ctx.enemyBulletCollisionFilter(ram, { player: a4, bullet: rec, bank })) continue;
    }
    ram.setU8(rec, ram.u8(rec) | 0x10);               // $245A44 or.b D4,(-$4,A6)
    ram.setU8(a4, ram.u8(a4) | 0x10);                 // $245A48 or.b D4,(A4)
    ram.setU16(DMG.fa7e, 1);                          // $245A4A move.w #$1
    return { d0, d1, d2, d3, hit: true, slots };      // $245A52 bra $245C32 rts
  }
  return { d0, d1, d2, d3, hit: false, slots };       // $245C32 rts
}

// ---------------------------------------------------------------------------
// BLOCK 2 -- `$244D94..$244DFE`: **THE ITEM COLLECTION**, and the whole reason
// recon 59 scheduled this wave first.
//
// `$8171BA` is the item live count and `$816B7A` the six item pools walked as
// ONE 25-slot array of `$40` (recon 59 §1, six arithmetics that close exactly).
// The collision is one `or.w $80FA72,(status)` -- the caller's own player mask,
// which `$244D62` has been writing to `$80FA72` since W34.  So the port has had
// the mask for twenty-six waves and no pool to OR it into.
//
// **`$244DE6 andi.w #$C0,D4` IS TRANSCRIBED AS `$C0` AND MUST NOT BE TIDIED.**
// Recon 59 §4.2: `$27F54C` sets status bit 0 (collected normally) and `$27F582`
// bit 7 (collected at maximum), and this guard tests bits 6 AND 7 -- so it
// catches the at-max flag and NOT the normal one, and recon 59 could find no
// writer of bit 6 anywhere in `$27E812..$27F801` or here.  A port that
// "corrected" it to `$81` changes behaviour on the frame a normally-collected
// item is still inside the player's box.
//
// The free test is on **`+$02`**, not `+$00` -- `$244DB6 beq $244DB0` on the
// word `(A6)+` just read from base+2 -- while the driver `$27E99E` tests `+$00`
// and the FREE `$27F2F0` clears a LONGWORD so that both agree.  Two different
// emptiness tests on one record, and they are consistent only because of the
// longword clear.
// ---------------------------------------------------------------------------
function itemCollisionBlock(ram, box, d7) {
  let d6 = ram.u16(DMG.itemCount);                    // $244D9C move.w $8171BA
  if (d6 === 0) return 0;                             // $244DA2 beq $244DFE
  const { d0, d1, d2, d3 } = box;
  let flagged = 0;
  let idx = 0;
  for (let n = 0; n < d6; n++) {                      // $244DA6 subq.w #1 / dbra
    // `$244DB6 beq $244DB0` scans forward over EMPTY slots WITHOUT consuming
    // the `dbra`, exactly like blocks 6a/6b -- the counter is the live count.
    let rec = -1;
    for (; idx < 25; idx++) {
      const r = DMG.itemPool + idx * DMG.itemStride;
      if (ram.u16(r + 0x02) !== 0) { rec = r; break; }
    }
    if (rec < 0) break;   // the count over-reports; the board would run off
    idx++;
    let d4 = u16(ram.u16(rec + 0x02) + d7);           // $244DB8 add.w D7,D4
    let d5 = u16(d4 - ram.u16(rec + 0x10));           // $244DBC sub.w ($c,A6),D5
    if (d0 < d5) continue;                            // $244DC0 cmp.w D5,D0/bcs
    d4 = u16(d4 + ram.u16(rec + 0x10));               // $244DC4 add.w ($c,A6),D4
    if (d4 < d1) continue;                            // $244DC8 cmp.w D1,D4/bcs
    d4 = u16(ram.u16(rec + 0x04) + d7);               // $244DCC/$244DCE
    d5 = d4;                                          // $244DD0 move.w D4,D5
    d4 = u16(d4 + ram.u16(rec + 0x12));               // $244DD2 add.w ($e,A6),D4
    if (d4 < d3) continue;                            // $244DD6 cmp.w D3,D4/bcs
    d5 = u16(d5 - ram.u16(rec + 0x12));               // $244DDA sub.w ($e,A6),D5
    if (d2 < d5) continue;                            // $244DDE cmp.w D5,D2/bcs
    if ((ram.u16(rec) & 0x00c0) !== 0) continue;      // $244DE2/$244DE6 andi #$C0
    ram.setU16(rec, u16(ram.u16(rec) | ram.u16(DMG.fa72)));  // $244DEC/$244DF2
    flagged++;
    // NO `bra` out: `$244DF6 lea ($3e,A6),A6 / dbra` -- the walk CONTINUES, so
    // one pass can flag EVERY overlapping item.  Block 4 is the one that exits.
  }
  return flagged;
}

// ---------------------------------------------------------------------------
// BLOCK 3 -- `$244DFE..$244E5C`: the same shape against IMPACT POOL A,
// `$8171BE` x `$817F7E`, 70 slots of `$2C` (`50-recon-effects` §1.1, and
// `$27F8F8`'s `moveq #$45,D7` from the other side).
//
// Three differences from block 2, none of them cosmetic:
//   1. the live test is `$244E12 tst.w (A6)+ / bpl` -- bit 15 of `+$00` -- and
//      THEN `$244E16 move.w (A6)+,D4 / beq` on `+$02`.  Two tests, not one;
//   2. the half-extents are `+$10`/`+$12` for the LONG axis and `+$14`/`+$16`
//      for the SHORT, i.e. four distinct words where block 2 reuses two;
//   3. the guard is `$244E44 tst.b (-$3,A6) / bmi` -- bit 7 of `+$01` -- not
//      block 2's `andi.w #$C0` on `+$00`.
//
// `$817F7E` is 0 on this tree until W111 ported the bee allocator `$27F92A` and
// the driver `$27F95A` (type-5 call #4).  So this block is now exercised when a
// type-$8A carrier dies.  The walk covers ALL 80 slots (general 70 + reserved
// ten 10) because the ROM's `dbra D6` has no slot cap; the port's `idx < 80`
// matches the true pool extent.  (W110 sec 1.4 said "block 3 will flag bees with
// zero further port work" -- that was WRONG: the scan was capped at 70, one slot
// short of the reserved ten.  Corrected by W111.)
// ---------------------------------------------------------------------------
export function impactCollisionBlock(ram, box, d7) {
  const d6 = ram.u16(DMG.impactCount);                // $244DFE move.w $817F7E
  if (d6 === 0) return 0;                             // $244E04 beq $244E5C
  const { d0, d1, d2, d3 } = box;
  let flagged = 0;
  let idx = 0;
  for (let n = 0; n < d6; n++) {                      // $244E58 dbra
    let rec = -1;
    for (; idx < 80; idx++) {                         // $244E12 tst.w (A6)+/bpl (80 = general 70 + reserved ten 10)
      const r = DMG.impactPool + idx * DMG.impactStride;
      if ((ram.u16(r) & 0x8000) !== 0) { rec = r; break; }
    }
    if (rec < 0) break;
    idx++;
    let d4 = ram.u16(rec + 0x02);                     // $244E16 move.w (A6)+,D4
    if (d4 === 0) continue;                           // $244E18 beq $244E54
    d4 = u16(d4 + d7);                                // $244E1A add.w D7,D4
    let d5 = u16(d4 - ram.u16(rec + 0x12));           // $244E1E sub.w ($e,A6),D5
    if (d0 < d5) continue;                            // $244E22 cmp.w D5,D0/bcs
    d4 = u16(d4 + ram.u16(rec + 0x10));               // $244E26 add.w ($c,A6),D4
    if (d4 < d1) continue;                            // $244E2A cmp.w D1,D4/bcs
    d4 = u16(ram.u16(rec + 0x04) + d7);               // $244E2E/$244E30
    d5 = d4;                                          // $244E32 move.w D4,D5
    d4 = u16(d4 + ram.u16(rec + 0x14));               // $244E34 add.w ($10,A6)
    if (d4 < d3) continue;                            // $244E38 cmp.w D3,D4/bcs
    d5 = u16(d5 - ram.u16(rec + 0x16));               // $244E3C sub.w ($12,A6)
    if (d2 < d5) continue;                            // $244E40 cmp.w D5,D2/bcs
    if ((ram.u8(rec + 0x01) & 0x80) !== 0) continue;  // $244E44 tst.b (-$3,A6)
    ram.setU16(rec, u16(ram.u16(rec) | ram.u16(DMG.fa72)));  // $244E4A/$244E50
    flagged++;
  }
  return flagged;
}

// ---------------------------------------------------------------------------
// BLOCK 4 -- `$244E5C..$244EE0`: RAMMING.  The player's body against the enemy
// pool, and `$244ED2 subq.w #1,($16,A6)` costs the enemy exactly ONE HP.
//
// The pool walk is `$81459C` with the count `$815E9E + $815EA0` -- pool A's
// live count PLUS pool B's, over ONE contiguous array, because
// `$81459C + 100*$20 = $81521C` is pool B's base.  Same trick blocks 7/8 use
// with their 150, but as a LIVE COUNT rather than as capacity.
//
// THREE GUARDS a "tidy" port drops, in ROM order:
//   `$244EB0 andi.w #$1,D4`  -- bit 0 of the enemy's TYPE WORD.  Without it
//        every enemy is rammable, including the ones that are scenery.
//   `$244EBE cmpi.w #-$800,D4 / bcc` -- recomputes `Y + D7 - ($10,A6)` and
//        rejects at or above `$F800` UNSIGNED, i.e. the wrap-around top.
//   `$244ED6 bra $244EE0` -- **it leaves the LOOP**, so at most one enemy is
//        rammed per pass.  `$244EE0` is block 5's first instruction, the same
//        one the `dbra` falls through to, so the shot loops still run.  The
//        natural misreading of a `bra` out of a `dbra` is "it leaves the
//        routine"; it does not, and that is worth one line here.
// ---------------------------------------------------------------------------
function ramCollisionBlock(ram, box, d7, a4, ctx = null) {
  let d6 = u16(ram.u16(DMG.poolACount) + ram.u16(DMG.poolBCount));  // $244E62/$244E68
  if (d6 === 0) return { rammed: false };             // $244E6E beq $244EE0
  const { d0, d1, d2, d3 } = box;
  let idx = 0;
  for (let n = 0; n < d6; n++) {                      // $244E72 subq.w #1 / dbra
    let rec = -1;
    for (; idx < 150; idx++) {                        // $244E7A move.w (A6)+/bpl
      const r = DMG.poolA + idx * DMG.enemyStride;
      if ((ram.u16(r) & 0x8000) !== 0) { rec = r; break; }
    }
    if (rec < 0) break;
    idx++;
    let d4 = u16(ram.u16(rec + 0x02) + d7);           // $244E7E/$244E80
    let d5 = u16(d4 - ram.u16(rec + 0x12));           // $244E84 sub.w ($10,A6)
    if (d0 < d5) continue;                            // $244E88 cmp.w D5,D0/bcs
    d4 = u16(d4 + ram.u16(rec + 0x10));               // $244E8C add.w ($e,A6),D4
    if (d4 < d1) continue;                            // $244E90 cmp.w D1,D4/bcs
    d4 = u16(ram.u16(rec + 0x04) + d7);               // $244E94/$244E98
    d5 = d4;                                          // $244E9A move.w D4,D5
    d4 = u16(d4 + ram.u16(rec + 0x14));               // $244E9C add.w ($12,A6)
    if (d4 < d3) continue;                            // $244EA0 cmp.w D3,D4/bcs
    d5 = u16(d5 - ram.u16(rec + 0x16));               // $244EA4 sub.w ($14,A6)
    if (d2 < d5) continue;                            // $244EA8 cmp.w D5,D2/bcs
    if ((ram.u16(rec) & 0x0001) === 0) continue;      // $244EAC/$244EB0 andi #$1
    const yTop = u16(u16(ram.u16(rec + 0x02) + d7) - ram.u16(rec + 0x12));
    if (yTop >= 0xf800) continue;                     // $244EBE cmpi.w #-$800/bcc
    // `$244EC4 bset #$4,(A4)` is on the PLAYER record, not the enemy -- the
    // SAME bit `$2459D0` sets and `$249542` throws on.  So ramming is a second,
    // independent producer of the player-hit flag, and it does NOT go through
    // `$80FA7E`: block 4 runs only when `$80FA7E` was ZERO.
    ram.bset8(a4, 4);                                 // $244EC4 bset #$4,(A4)
    // A6 is rec+2 here, so `(-$2,A6)` is +$00 and `($16,A6)` is +$18.
    ram.setU16(rec, u16(ram.u16(rec) | ram.u16(DMG.fa72)));  // $244EC8/$244ECE
    const hp0 = ram.u16(rec + 0x18);
    const damage = transformedPlayerDamage(ctx, 1, 'ramming');
    const hp1 = u16(hp0 - damage);
    ram.setU16(rec + 0x18, hp1);                        // $244ED2 subq.w #1
    return { rammed: true, rec, hp0, hp1 };             // $244ED6 bra $244EE0
  }
  void d6;
  return { rammed: false };
}

// ---------------------------------------------------------------------------
// BLOCK 5 -- `$244EE0..$244F66`: the 36 shot records' BOUNDING BOX.
//
// Returns false when NO shot record is live, which is `$244EF0 bra.w $24518A`
// -- both enemy pools are skipped entirely, and that is a real early-out the
// port must reproduce or it would walk 150 enemies against an empty box.
//
// The four seeds are `0 / $7000 / 0 / $3800` and the comparisons are SIGNED
// (`ble`/`bge`), while every comparison in blocks 6a/6b against the same four
// words is UNSIGNED (`bhi`/`bcs`).  That mixture is in the listing and is the
// kind of thing a "tidy" port silently makes consistent.
// ---------------------------------------------------------------------------
export function shotBoundingBox(ram, table, d7) {
  let any = false;
  for (let i = 0; i < DMG.shotSlots; i++) {           // $244EE2 moveq #$23,D6
    if ((ram.u16(table + i * DMG.shotStride) & 0x8000) !== 0) { any = true; break; }
  }
  if (!any) return false;                             // $244EF0 bra.w $24518A
  ram.setU16(BOX.maxY, 0);                            // $244EFE
  ram.setU16(BOX.minY, 0x7000);                       // $244F00
  ram.setU16(BOX.maxX, 0);                            // $244F04
  ram.setU16(BOX.minX, 0x3800);                       // $244F06
  for (let i = 0; i < DMG.shotSlots; i++) {           // $244F0A move.w #$23,D5
    const r = table + i * DMG.shotStride;
    if ((ram.u16(r) & 0x8000) === 0) continue;        // $244F10 tst.w (A6)+ / bpl
    // A6 is now r+2; `movem.w (A6),D0/D2` takes r+2 and r+4.
    let d0 = ram.u16(r + 0x02);                       // $244F14
    let d2 = ram.u16(r + 0x04);
    let d3 = d2;                                      // $244F18
    // $244F1A `lea $E(A6),A1` -- A6 is r+2, so A1 = r+$10.
    d0 = u16(d0 + ram.u16(r + 0x10));                 // $244F1E add.w (A1)+,D0
    let d1 = u16(d0 - ram.u16(r + 0x12));             // $244F20/$244F22
    d2 = u16(d2 + ram.u16(r + 0x14));                 // $244F24
    d3 = u16(d3 - ram.u16(r + 0x16));                 // $244F26
    // $244F2E..$244F4A: four SIGNED min/max updates through `(A1)+`.
    if (i16(d0) > i16(ram.u16(BOX.maxY))) ram.setU16(BOX.maxY, d0);  // $244F2E ble
    if (i16(d1) < i16(ram.u16(BOX.minY))) ram.setU16(BOX.minY, d1);  // $244F36 bge
    if (i16(d2) > i16(ram.u16(BOX.maxX))) ram.setU16(BOX.maxX, d2);  // $244F3E ble
    if (i16(d3) < i16(ram.u16(BOX.minX))) ram.setU16(BOX.minX, d3);  // $244F46 bge
  }
  // $244F56..$244F62: all four biased by D7 ($2800 at this point).
  for (const a of [BOX.maxY, BOX.minY, BOX.maxX, BOX.minX]) {
    ram.setU16(a, u16(ram.u16(a) + d7));
  }
  return true;
}

/**
 * BLOCKS 6a and 6b -- one enemy pool against the 36 shot records.
 *
 * `variant` is `'A'` for `$244F68` (`$81459C`, 100 slots, count `$815E9E`) and
 * `'B'` for `$24507A` (`$81521C`, 50, count `$815EA0`).  THE TWO ARE NOT THE
 * SAME LOOP and this port does not pretend they are.  Four differences, all
 * from the listing:
 *
 *   1. the off-screen constant: `$244FC4 cmpi.w #$9700,D1` vs
 *      `$2450EC cmpi.w #$8800,D1`;
 *   2. B tests the shot's own byte 0 first -- `$245138 moveq #$30,D4 /
 *      and.b -$4(A6),D4 / bne` -- and A has no such test;
 *   3. A applies the `$81308C` three-quarter reduction BEFORE the shot's power
 *      is debited (`$24503E`, then `$24504E`), B applies it AFTER
 *      (`$24515E`, then `$245162`);
 *   4. A has the `$245058 cmpi.w #$6F00,(A5)` X gate and the
 *      `$245022/$245052/$245054` HP save-and-restore around it; B has neither.
 *
 * Difference 4's save-and-restore is a NO-OP in effect -- D4's high half is
 * loaded with the HP at `$245026` and its low half is reloaded with the same HP
 * at `$24504A`, so the `swap` + `move.w D4,$16(A5)` writes the value back
 * unchanged.  It is transcribed because it is an instruction the board
 * executes, and because a reader who "optimised it away" would then have no
 * place to hang the `$6F00` gate that immediately follows it.
 *
 * The outer walk is NOT a plain `for`.  `$244F8E bpl $244F88` scans forward
 * over DEAD records WITHOUT consuming the `dbra` counter, and the counter is
 * the pool's LIVE COUNT, not its capacity -- so a pool with 100 slots and 7
 * live records runs the body 7 times.  A port that walked all 100 would be
 * right on every frame until the counters disagreed with the slots.
 */
function transformedPlayerDamage(ctx, amount, source) {
  const transform = ctx?.playerDamageTransform;
  if (!transform) return amount;
  const result = transform(amount & 0xffff, source);
  if (!Number.isFinite(result)) return amount;
  return Math.max(0, Math.min(0xffff, Math.trunc(result)));
}

function ordinaryShotDamagePower(power, gate308c) {
  const value = u16(power);
  return gate308c === 0 ? u16(value - (value >>> 2)) : value;
}

/** Shared owner mask, transform, and 16-bit HP receipt for player damage. */
export function applyPlayerDamageReceipt(
    ram, enemy, amount, mask, source, ctx = null) {
  ram.setU16(enemy, u16(ram.u16(enemy) | mask));
  const damage = transformedPlayerDamage(ctx, amount, source);
  const hp0 = ram.u16(enemy + 0x18);
  const hp1 = u16(hp0 - damage);
  ram.setU16(enemy + 0x18, hp1);
  return { hp0, hp1, damage };
}

/**
 * Apply the cartridge ordinary-shot strength rules to one enemy receipt.
 * External friendly projectiles use this entry so ownership, the frozen
 * three-quarter gate, mod damage transforms, and 16-bit HP subtraction cannot
 * drift from blocks 6a/6b below.
 */
export function applyOrdinaryShotDamageReceipt(
    ram, enemy, power, mask, gate308c, ctx = null) {
  return applyPlayerDamageReceipt(ram, enemy,
    ordinaryShotDamagePower(power, gate308c), mask, 'shot', ctx);
}

/** Exact block-6 enemy box and off-screen gates for a zero-extent shot. */
export function ordinaryShotPointOverlapsEnemy(ram, enemy, y, x, variant, d7 = 0x2800) {
  const offLimit = variant === 'A' ? 0x9700 : 0x8800;
  const enemyY = ram.u16(enemy + 0x02);
  const enemyX = ram.u16(enemy + 0x04);
  const maxY = u16(enemyY + ram.u16(enemy + 0x10));
  const minY = u16(enemyY - ram.u16(enemy + 0x12));
  const maxX = u16(enemyX + ram.u16(enemy + 0x14));
  const minX = u16(enemyX - ram.u16(enemy + 0x16));
  return y >= minY && y <= maxY && x >= minX && x <= maxX
    && u16(minY + d7) < offLimit;
}

export function poolDamage(ram, pool, count, table, d7, mask, gate308c, variant, ctx = null) {
  if (count === 0) return 0;                          // $244F74 / $245086 beq.w
  const offLimit = variant === 'A' ? 0x9700 : 0x8800; // $244FC4 / $2450EC
  let hits = 0;
  let idx = 0;                                        // the pool cursor, in slots
  const cap = variant === 'A' ? 100 : 50;
  for (let n = 0; n < count; n++) {                   // $244F78 subq.w #1,D6 / dbra
    // ---- $244F8C/$2450B4: scan forward to the next LIVE record.
    let rec = -1;
    for (; idx < cap; idx++) {
      if ((ram.u16(pool + idx * DMG.enemyStride) & 0x8000) !== 0) { rec = pool + idx * DMG.enemyStride; break; }
    }
    if (rec < 0) break;   // the counters over-report; the board would run off
    idx++;                // $24506E/$245180 `lea $1e(A5),A5` (A5 was already +2)
    const tw = ram.u16(rec);
    if ((tw & 0x2000) === 0) continue;                // $244F90/$2450B8 andi #$2000
    // ---- the box test.  A5 is rec+2 from here on.
    let d0 = u16(ram.u16(rec + 0x02) + d7);           // $244F96/$244F9A
    let d1 = d0;                                      // $244F9C
    // $244F9E `lea $E(A5),A1` -- A5 is rec+2, so A1 = rec+$10.
    d0 = u16(d0 + ram.u16(rec + 0x10));               // $244FA2 add.w (A1)+,D0
    d1 = u16(d1 - ram.u16(rec + 0x12));               // $244FA4 sub.w (A1)+,D1
    if (d1 > ram.u16(BOX.maxY)) continue;             // $244FAC cmp/bhi  UNSIGNED
    if (d0 < ram.u16(BOX.minY)) continue;             // $244FB0 cmp/bcs
    let d2 = u16(ram.u16(rec + 0x04) + d7);           // $244FB4
    let d3 = d2;                                      // $244FB6
    d2 = u16(d2 + ram.u16(rec + 0x14));               // $244FB8
    d3 = u16(d3 - ram.u16(rec + 0x16));               // $244FBA
    if (d3 > ram.u16(BOX.maxX)) continue;             // $244FBC bhi
    if (d2 < ram.u16(BOX.minX)) continue;             // $244FC0 bcs
    if (d1 >= offLimit) continue;                     // $244FC4/$2450EC bcc
    // ---- the inner walk over all 36 shot records.
    for (let s = 0; s < DMG.shotSlots; s++) {         // $244FCE move.w #$23,D6
      const sh = table + s * DMG.shotStride;
      if ((ram.u16(sh) & 0x8000) === 0) continue;     // $244FEC move.w (A6)+,D5 / bpl
      // A6 is sh+4 from here on.
      let d4 = u16(u16(ram.u16(sh + 0x02) + d7) + ram.u16(sh + 0x10)); // $244FF0..$244FF4
      if (d4 < d1) continue;                          // $244FF8 cmp.w D1,D4 / bcs
      d4 = u16(d4 - ram.u16(sh + 0x12));              // $244FFC sub.w $E(A6),D4
      if (d0 < d4) continue;                          // $245000 cmp.w D4,D0 / bcs
      d4 = u16(u16(ram.u16(sh + 0x04) + d7) + ram.u16(sh + 0x14)); // $245004..$245008
      if (d4 < d3) continue;                          // $24500C bcs
      d4 = u16(d4 - ram.u16(sh + 0x16));              // $245010
      d4 = u16(d4 - ram.u16(sh + 0x16));              // $245014 -- the SAME word, TWICE
      if (d2 < d4) continue;                          // $245018 bcs
      if (variant === 'B') {
        // $245138 `moveq #$30,D4 / and.b -$4(A6),D4 / bne` -- pool B ONLY.
        if ((ram.u8(sh) & 0x30) !== 0) continue;
      }
      if ((ram.u16(sh + 0x18) & 0x8000) !== 0) {      // $24501C/$245140 tst.w $14(A6)
        // bmi -> $245064/$245176: the shot has no power left.  Pool A jumps
        // PAST the damage and keeps walking; pool B does the same.
        continue;
      }
      // =================== THE DAMAGE ===================
      hits++;
      if (variant === 'A') {
        const hp0 = ram.u16(rec + 0x18);              // $245022 move.w $16(A5),D4
        ram.setU16(rec, u16(ram.u16(rec) | mask));    // $24502E or.w D4,-$2(A5)
        let d5 = ram.u16(sh + 0x18);                  // $245032 move.w $14(A6),D5
        d5 = ordinaryShotDamagePower(d5, gate308c);   // $245036..$245042
        ram.setU8(sh + 0x01, ram.u8(sh + 0x01) | 0x80);  // $245044 bset #$7,-$3(A6)
        const hp = ram.u16(rec + 0x18);               // $24504A move.w $16(A5),D4
        ram.setU16(sh + 0x18, u16(ram.u16(sh + 0x18) - hp));  // $24504E sub.w D4,$14(A6)
        // $245052 swap D4 / $245054 move.w D4,$16(A5).  D4's high half has held
        // the HP since $245026 and its low half was reloaded with the same HP
        // at $24504A, so this writes the HP back UNCHANGED.  Transcribed, not
        // elided -- see this function's header.
        ram.setU16(rec + 0x18, hp0);
        if (ram.u16(rec + 0x02) >= 0x6f00) continue;  // $245058 cmpi.w #$6F00,(A5)
        const nhp = applyPlayerDamageReceipt(
          ram, rec, d5, mask, 'shot', ctx).hp1;         // $24505E
        if ((nhp & 0x8000) !== 0) break;              // $245062 bmi $24506C
      } else {
        ram.setU16(rec, u16(ram.u16(rec) | mask));    // $24514C or.w D4,-$2(A5)
        ram.setU8(sh + 0x01, ram.u8(sh + 0x01) | 0x80);  // $245150 bset #$7,-$3(A6)
        let d5 = ram.u16(sh + 0x18);                  // $245156 move.w $14(A6),D5
        const hp = ram.u16(rec + 0x18);               // $24515A move.w $16(A5),D4
        ram.setU16(sh + 0x18, u16(ram.u16(sh + 0x18) - hp));  // $24515E sub.w D4,$14(A6)
        d5 = ordinaryShotDamagePower(d5, gate308c);   // $245162..$24516E
        const nhp = applyPlayerDamageReceipt(
          ram, rec, d5, mask, 'shot', ctx).hp1;         // $245170
        if ((nhp & 0x8000) !== 0) break;              // $245174 bmi $24517E
      }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// BLOCKS 7 and 8 -- `$24518A..$24530A`.  ONE $30-byte pool record against all
// 150 enemy slots, twice, with A2 = pool slot 27 and A3 = pool slot 30.
//
// **THE 150 IS NOT A THIRD POOL.**  `$81459C + 100*$20 = $81521C`, which is
// pool B's base, so `moveq #$95,D7` walks pool A's hundred slots and pool B's
// fifty CONTIGUOUSLY, as capacity and not as a live count -- the opposite of
// blocks 6a/6b, which walk the counters.  A port that "reused" `poolDamage`
// here would walk the wrong number of records with the wrong early-outs.
//
// The two blocks are NOT the same loop, and the differences are the listing's:
//
//   1. the live test: `$2451DC move.w (A5),D4 / bpl` vs `$245288 move.b (A5),D4
//      / bpl` -- the word's bit 15 and the high byte's bit 7, the same bit;
//   2. the off-screen constant: `#$9800` vs `#$9700`;
//   3. block 7 accepts a record whose byte 0 has bit 5 OR bit 0
//      (`$245218`/`$24521E`); block 8 requires bit 5 alone (`$2452C4`);
//   4. block 8 DOUBLES its damage while `$81B6E6` (the hyper flag the tail
//      copies from `$81B63E`) is non-zero and block 7 never does;
//   5. the hit bits: `ori.w #$400,D4` vs `ori.w #$4400,D4`.  Both land in the
//      handlers' `$5C` mask; `$4000` is bit 6, which `$286876` reads at
//      `$286966 btst #$6,D1` to add TWO to the chain instead of one.
//
// Both reduce by a HALF when `$81308C` is 0 (`lsr.w #1`), where blocks 6a/6b
// reduce by a QUARTER (`lsr.w #2`).  Four separate reductions in one routine,
// none of them the same; this is the kind of thing "tidying" destroys.
// ---------------------------------------------------------------------------
function weaponObjectPass(ram, a2, d6, opts, ctx = null) {
  if ((ram.u16(a2) & 0x8000) === 0) return 0;         // $2451A2/$24525C tst.w/bpl
  if (opts.block === 7) {
    ram.bclr8(a2, 4);                                 // $2451A8 bclr #$4,(A2)
    if (ram.u16(a2 + 0x02) >= 0x7000) return 0;       // $2451AC cmpi.w/bcc
  }
  // $2451B6/$245262 `lea ($10,A2),A0` -- the four half-extents, in place.
  const d0 = u16(u16(ram.u16(a2 + 0x02) + d6) + ram.u16(a2 + 0x10));  // $2451BA..
  const d1 = u16(u16(ram.u16(a2 + 0x02) + d6) - ram.u16(a2 + 0x12));  // $2451C4
  const d2 = u16(u16(ram.u16(a2 + 0x04) + d6) + ram.u16(a2 + 0x14));  // $2451C6..
  const d3 = u16(u16(ram.u16(a2 + 0x04) + d6) - ram.u16(a2 + 0x16));  // $2451D0
  const offLimit = opts.block === 7 ? 0x9800 : 0x9700;  // $2451F8 / $2452A6
  const hitBits = opts.block === 7 ? 0x400 : 0x4400;    // $245242 / $2452F2
  let hits = 0;
  for (let n = 0; n < 150; n++) {                     // $2451D8/$245284 moveq #$95
    const rec = DMG.poolA + n * DMG.enemyStride;
    if ((ram.u8(rec) & 0x80) === 0) continue;         // $2451DC / $245288 bpl
    // ---- the Y pair.  Block 7 adds first and subtracts second; block 8 does
    // the same two sums in the OPPOSITE ORDER ($245296 before $24529E), which
    // changes nothing arithmetically and is transcribed because it is the
    // instruction stream.
    const y = u16(ram.u16(rec + 0x02) + d6);
    const yPlus = u16(y + ram.u16(rec + 0x10));
    const yMinus = u16(y - ram.u16(rec + 0x12));
    if (yPlus < d1) continue;                         // $2451EC / $2452A2 bcs
    if (d0 < yMinus) continue;                        // $2451F4 / $24529A bcs
    if (yMinus >= offLimit) continue;                 // $2451F8 / $2452A6 bcc
    const x = u16(ram.u16(rec + 0x04) + d6);
    const xPlus = u16(x + ram.u16(rec + 0x14));
    const xMinus = u16(x - ram.u16(rec + 0x16));
    if (xPlus < d3) continue;                         // $24520A / $2452B8 bcs
    if (d2 < xMinus) continue;                        // $245212 / $2452C0 bcs
    const b0 = ram.u8(rec);
    if (opts.block === 7) {
      // $245218 `btst #$5,D4 / bne $245224` -- bit 5 ALONE is enough; only if
      // it is clear does `$24521E btst #$0,D4 / beq` demand bit 0.
      if ((b0 & 0x20) === 0 && (b0 & 0x01) === 0) continue;
    } else if ((b0 & 0x20) === 0) continue;           // $2452C4 btst #$5,(A5)/beq
    if ((ram.u16(rec + 0x18) & 0x8000) !== 0) continue;  // $245224/$2452CA bmi
    let d5 = ram.u16(a2 + 0x18);                      // $245228 / $2452D0
    if (opts.block === 8 && ram.u16(DMG.b6e6) !== 0) {
      d5 = u16(d5 + d5);                              // $2452DC add.w D5,D5
    }
    if (ram.u16(DMG.gate308c) === 0) {                // $24522E / $2452DE tst/bne
      d5 = u16(d5 - ((d5 & 0xffff) >>> 1));           // $245236/$245238/$24523A
    }
    d5 = transformedPlayerDamage(ctx, d5, 'weapon-object');
    ram.setU16(rec, u16(ram.u16(rec) | ram.u16(DMG.fa72) | hitBits));  // or.w D4
    if (ram.u16(rec + 0x02) >= 0x6f00) continue;      // $245248 / $2452F8 bcc
    ram.setU16(rec + 0x18, u16(ram.u16(rec + 0x18) - d5));  // $245250 / $245300
    hits++;
  }
  return hits;
}

// ---------------------------------------------------------------------------
// `$2453AC..$245608` -- THE BEAM'S OWN DAMAGE PASS.  606 bytes, `$24530C bsr`.
//
// A1 is the beam control record (`$811EF2` P1 / `$811F12` P2), the one
// `$254C1E` writes and `laser.js` calls `BEAM[].rec`.  D6 is `$24518A`'s
// `#$2800`, NOT the pass's D7 (which blocks 5/6b have already moved to $1800).
//
// THE FIVE THINGS THIS ROUTINE WRITES ON THE BEAM RECORD, because they are what
// the drawn column reads:
//   ($10,A1)  the beam's REACH.  Seeded `$7400 + D6`, pulled DOWN to the
//             topmost enemy hit, and un-biased by `$245604 sub.w D6,($10,A1)`
//             on the way out -- so an early exit leaves it BIASED, which is the
//             board's behaviour and not a bug to smooth.
//   ($c,A1)   cleared on any hit.
//   ($e,A1)   the per-hit damage; pool B's tail REWRITES it (see below).
//   (A1) bit 9 ($0200)  the arm, above.
//   (A1) bits 12+0 ($1001)  `$2454AC`/`$2455AE ori.w #$1001,(A1)` -- **the only
//             instructions in build B that set bit 4 of the record's high byte**
//             (W45 §4 proved it with a whole-image encoding scan), and
//             `$254F48`'s `btst #4,(A2)` is what lights the bright column.  So
//             W45's "a port that lit the column without the damage pass would be
//             inventing the hit" is exactly right, and this is the wave that
//             earns it.
//
// **THE POOL-B FALL-OFF, WHICH LOOKS LIKE A BUG AND IS THE LISTING.**
// `$2455CE move.w D5,D4 / bpl $2455D6` -> `lsr.w #3,D4 / neg.w D4 / move.w D4,
// ($e,A1)`: after the first pool-B hit the damage word is stored NEGATED and an
// eighth of its size, and the next pool-B hit re-negates it (`$2455D2 neg.w D5`)
// without rewriting it.  So a beam melting through pool B does 1/8 damage from
// the second target on -- and pool A, which reads `($e,A1)` with no `neg`, then
// SUBTRACTS A NEGATIVE, i.e. heals.  Nothing resets `($e,A1)` between frames
// except `$254C1E` (a new beam) or the hyper arm at `$24541C`/`$24553E`.  Four
// readings of the disassembly and it says the same thing each time; it is
// transcribed and NOT guarded, and it is called out here so the next person to
// see an enemy gain HP knows which instruction did it.
// ---------------------------------------------------------------------------
export function laserDamagePass(ram, a1, d6, ctx = null) {
  ram.setU16(DMG.fa7c, 0);                            // $2453AC clr.w $80FA7C
  const a2 = a1;                                      // $2453B2 movea.l A1,A2
  if ((ram.u16(a1) & 0x8000) === 0) return 0;         // $2453B4 tst.w/bpl
  if (ram.bset8(a1, 1) === 0) return 0;               // $2453BA bset #$1/beq
  return laserDamageBody(ram, a1, a2, d6, ctx);
}

/** `$2453C2..$245608` -- the body, and the ONLY thing `$245314`/`$24536E`
 *  would reach if either were reachable (`$245364 bsr $2453C2`).  Split out at
 *  the ROM's own entry point so the boundary is legible; both callers stay
 *  unported and are named on `DMG`. */
function laserDamageBody(ram, a1, a2, d6, ctx) {
  ram.bclr8(a1, 4);                                   // $2453C2 bclr #$4,(A1)
  ram.setU16(a1 + 0x10, u16(0x7400 + d6));            // $2453C6/$2453CC
  // $2453D0 `lea ($2,A1),A0` and five post-increment reads.
  let d0 = u16(ram.u16(a1 + 0x02) + d6);              // $2453D4/$2453D8
  const d1 = d0;                                      // $2453DA move.w D0,D1
  d0 = u16(u16(d0 + 0x400) + ram.u16(a1 + 0x06));     // $2453DC/$2453E0
  const d2 = u16(u16(ram.u16(a1 + 0x04) + d6) + ram.u16(a1 + 0x08));  // $2453E2/$2453E6
  const d3 = u16(u16(ram.u16(a1 + 0x04) + d6) - ram.u16(a1 + 0x0a));  // $2453E8
  // ---- $2453EA..$24541C: the HYPER recompute of the damage word.  Both gates
  // are 0 on this tree ($81B6E6 is the tail's copy of $81B63E), so the arm is
  // transcribed and unexercised.  `$245414 subq.w #1,D7 / dbra` runs $81B6E8
  //
  // W442 CORRECTION (2026-08-19): "unexercised" was true of every BENCH, not of
  // the code.  `$81B6E6` is non-zero for the whole of a live hyper -- the type-5
  // tail loads D1 from `$81B63E` and D2 from `$81B654` (the hyper LEVEL) and
  // `$244D68`/`$244D6E` publish them -- so this arm and the second one below run
  // on every frame of the owner's D56 scenario.  `tests/w442hyperbeamimpact.test.js`
  // is the first bench in this repo that enters it.  The sentence is kept as the
  // record of what was believed; the shape is W418's fifth lie (a true assertion
  // resting on a wrong explanation).  `$245414 subq.w #1,D7 / dbra` runs $81B6E8
  // times -- and 65,536 times when $81B6E8 is 0, which is the board's own
  // arithmetic and is not guarded here for the same reason `src/score.js`
  // does not guard `$28618A`'s.
  if (ram.u16(DMG.b6e6) !== 0 && ram.u16(DMG.b410) === 0) {  // $2453EA/$2453F2
    let d5 = ram.u16(a1 + 0x1c);                      // $2453FA move.w ($1c,A1)
    let d4 = (d5 & 0xffff) >>> 2;                     // $2453FE/$245400 lsr.w #2
    if ((ram.u16(DMG.g309c) & 0x8000) !== 0) {        // $245402 tst.w/bpl
      d4 = (d4 & 0xffff) >>> 1;                       // $24540C lsr.w #1
    }
    let d7 = u16(ram.u16(DMG.b6e8) - 1);              // $24540E/$245414
    for (;;) {                                        // $245416/$245418 dbra
      d5 = u16(d5 + d4);
      if (d7 === 0) break;
      d7 = u16(d7 - 1);
    }
    ram.setU16(a1 + 0x0e, d5);                        // $24541C move.w D5,($e,A1)
  }
  let hits = 0;
  // ======================= $245420: POOL A, 100 SLOTS ======================
  // **D0 IS CARRIED INTO POOL B.**  `$2454C2 move.w D4,D0` overwrites the box's
  // upper Y bound with the reach of the last enemy pool A hit, and nothing
  // between `$2454FA` and `$245580 cmp.w D4,D0` reloads it.  Returning the box
  // rather than a hit count is the only way a JS transcription keeps that.
  const a = laserPool(ram, a1, d6, DMG.poolA, 100, { d0, d1, d2, d3 }, 'A', ctx);
  hits += a.hits; d0 = a.d0;
  // ---- $2454FA `movea.l A2,A1` -- A1 was never moved, but the board restores
  // it here and the restore is what makes pool B read the same record.
  a1 = a2;
  // ---- $2454FC..$245540: the SECOND hyper recompute, with a DIFFERENT shift
  // ladder ($245528 lsr.w #1, then a conditional second lsr on $8130F8 bit 0)
  // and a `clr.w ($e,A1)` arm when `$81B410` is non-zero.
  if (ram.u16(DMG.b6e6) !== 0 && (ram.u16(DMG.g309c) & 0x8000) === 0) {  // $2454FC/$245504
    if (ram.u16(DMG.b410) !== 0) {                    // $24550C tst.w/beq
      ram.setU16(a1 + 0x0e, 0);                       // $245514 clr.w ($e,A1)
    } else {
      let d7 = u16(ram.u16(DMG.b6e8) - 1);            // $24551A/$245520
      let d5 = ram.u16(a1 + 0x1c);                    // $245522 move.w ($1c,A1)
      let d4 = (d5 & 0xffff) >>> 1;                   // $245526/$245528 lsr.w #1
      if ((ram.u8(SCORE_G30F8) & 0x01) === 0) {       // $25552A btst #$0,$8130F8
        d4 = (d4 & 0xffff) >>> 1;                     // $245536 lsr.w #1
      }
      for (;;) {                                      // $245538/$24553A dbra
        d5 = u16(d5 + d4);
        if (d7 === 0) break;
        d7 = u16(d7 - 1);
      }
      ram.setU16(a1 + 0x0e, d5);                      // $24553E move.w D5,($e,A1)
    }
  }
  // ======================== $245542: POOL B, 50 SLOTS ======================
  hits += laserPool(ram, a1, d6, DMG.poolB, 50, { d0, d1, d2, d3 }, 'B', ctx).hits;
  ram.setU16(a1 + 0x10, u16(ram.u16(a1 + 0x10) - d6));  // $245604 sub.w D6
  return hits;
}

/** `$245438..$2454F8` (pool A) and `$24555A..$245602` (pool B).  The two share
 *  their box test instruction for instruction and differ ONLY after the HP
 *  test, which is why one function takes a `which`. */
function laserPool(ram, a1, d6, pool, slots, box, which, ctx) {
  let { d0 } = box;
  const { d1, d2, d3 } = box;
  let hits = 0;
  for (let n = 0; n < slots; n++) {                   // $245426 #$63 / $245548 #$31
    const rec = pool + n * DMG.enemyStride;
    if ((ram.u8(rec) & 0x80) === 0) continue;         // $245438/$24555A move.b/bpl
    // ---- `move.l ($2,A5),D4` loads Y into D4's HIGH word and X into its LOW,
    // and the routine `swap`s between the two axes rather than reloading.  The
    // three `swap`s are why the X test comes FIRST here and second in block 7.
    let x = u16(ram.u16(rec + 0x04) + d6);            // $24543C/$245440
    const xPlus = u16(x + ram.u16(rec + 0x14));       // $245444 add.w ($14,A5)
    if (xPlus < d3) continue;                         // $245448 cmp.w D3,D4/bcs
    const xMinus = u16(x - ram.u16(rec + 0x16));      // $24544C sub.w ($16,A5)
    if (d2 < xMinus) continue;                        // $245450 cmp.w D5,D2/bcs
    const y = u16(ram.u16(rec + 0x02) + d6);          // $245454/$245456 swap/add
    const yMinus = u16(y - ram.u16(rec + 0x12));      // $24545A sub.w ($12,A5)
    if (d0 < yMinus) continue;                        // $24545E cmp.w D4,D0/bcs
    const yPlus = u16(y + ram.u16(rec + 0x10));       // $245462 add.w ($10,A5)
    if (yPlus < d1) continue;                         // $245466 cmp.w D1,D5/bcs
    if (yMinus >= 0x9800) continue;                   // $24546A cmpi.w/bcc
    if ((ram.u8(rec) & 0x20) === 0) continue;         // $245472 btst #$5,(A5)/beq
    if ((ram.u16(rec + 0x18) & 0x8000) !== 0) continue;  // $245478 tst.w/bmi
    let d5 = ram.u16(a1 + 0x0e);                      // $245480 move.w ($e,A1),D5
    let skipReach = false;
    if (which === 'A') {
      // ---- $245484..$2454A2: the HYPER double, and the ONLY path that skips
      // the reach update.  `$245494 tst.w ($1a,A1)` is the beam's formation
      // word and `$24549A btst #$1,(A5)` the enemy's own bit 1.
      const hyperArm = ram.u16(DMG.b6e6) !== 0 && ram.u16(DMG.b410) !== 0;
      if (!hyperArm && ram.u16(a1 + 0x1a) !== 0 && (ram.u8(rec) & 0x02) !== 0) {
        d5 = u16(d5 + d5);                            // $2454A0 add.w D5,D5
        skipReach = true;                             // $2454A2 bra $2454C4
      }
    }
    if (!skipReach) {
      // ---- $2454A4/$2455A6: the REACH test and the hit flags.
      if (yMinus >= ram.u16(a1 + 0x10)) continue;     // $2454A6/$2455A8 cmp/bcc
      ram.setU16(a1, u16(ram.u16(a1) | 0x1001));      // $2454AC/$2455AE ori.w
      ram.setU16(a1 + 0x0c, 0);                       // $2454B0/$2455B2 clr.w
      let reach = yMinus;                             // $2454B4/$2455B6 cmp.w D1,D4
      if (reach < d1) reach = u16(d1 + 0x400);        // $2454B8/$2455BA + $400
      ram.setU16(a1 + 0x10, reach);                   // $2454BE/$2455C0
      d0 = reach;                                     // $2454C2/$2455C4 move.w D4,D0
    }
    if (ram.u16(DMG.fa7c) !== 0) continue;            // $2454C4/$2455C6 tst.w/bne
    if (which === 'B') {
      // ---- $2455CE..$2455DC: the fall-off.  See this file's header.
      if ((d5 & 0x8000) !== 0) {                      // $2455D0 bpl $2455D6
        d5 = u16(-d5);                                // $2455D2 neg.w D5
      } else {
        ram.setU16(a1 + 0x0e, u16(-((d5 & 0xffff) >>> 3)));  // $2455D6/$2455D8/$2455DA
      }
    }
    if (ram.u16(DMG.gate308c) === 0) {                // $2454CC/$2455DE tst.w/bne
      d5 = u16(d5 - ((d5 & 0xffff) >>> 2));           // $2454D4/$2454D6/$2454D8
    }
    d5 = transformedPlayerDamage(ctx, d5, 'beam');
    ram.setU16(rec, u16(ram.u16(rec) | ram.u16(DMG.fa72) | 0x400));  // $2454DA..$2454E4
    if (which === 'A' && ram.u16(rec + 0x02) >= 0x6f00) continue;    // $2454E6 bcc
    ram.setU16(rec + 0x18, u16(ram.u16(rec + 0x18) - d5));  // $2454EE/$2455F8
    hits++;
  }
  return { hits, d0 };
}

/** `$8130F8`.  `btst #n,<ea>` on memory is a BYTE operation, so `$25552A
 *  btst #$0,$8130F8.l` tests bit 0 of the byte AT `$8130F8` -- the word's HIGH
 *  byte -- exactly as `src/score.js` reads `$28609E btst #$2` at the same
 *  address. */
const SCORE_G30F8 = 0x8130f8;

/**
 * `$24560A` -- **THE NINTH BLOCK OF `$244D62`**, 966 bytes, which W37 §4.2
 * found and no file under `src/` has ever named.  `$245310 bra.w $24560A`.
 *
 * Only its two guards are transcribed, because both are FALSE on this tree and
 * the block behind them is the BOMB-LASER's (weapon (A), W37 §0), not the
 * beam's.  If either ever goes true the port throws by address rather than
 * skipping 966 bytes of damage silently.
 */
function bombLaserBlock(ram, ctx, a4) {
  return bombDamage24560A(ram, ctx, a4);
}

function assertPrivateDamageResources(resources) {
  if (!resources || typeof resources !== 'object') {
    throw new TypeError('private damage resources are required');
  }
  for (const key of [
    'ownerIndex', 'shotSlots', 'shotStride', 'scratchLength', 'hyperShadowLength',
    'receiptCount', 'enemyBase', 'enemySlots', 'enemyStride', 'ordinaryMask',
    'weaponMask', 'phaseAddress',
  ]) {
    if (resources[key] !== PRIVATE_DAMAGE_GEOMETRY[key]) {
      throw new RangeError(`private damage ${key} does not match the exact owner-2 geometry`);
    }
  }
  const base = resources.player - 0x0100;
  const addresses = {
    player: 0x0100,
    shots: 0x0400,
    beamControl: 0x0b00,
    slot27: 0x1110,
    slot30: 0x11a0,
    scratch: 0x1400,
    hyperShadows: 0x140e,
    receipts: 0x1420,
  };
  if (!Number.isSafeInteger(base) || base < 0x1000000 || (base & 0xffff) !== 0) {
    throw new RangeError('private damage sidecar base must be aligned outside cartridge memory');
  }
  for (const [key, offset] of Object.entries(addresses)) {
    if (!Number.isSafeInteger(resources[key]) || resources[key] !== base + offset) {
      throw new RangeError(`private damage ${key} does not match its exact sidecar offset`);
    }
  }
  if (resources.incomingPolicy !== 'none'
      || resources.bombPolicy !== 'none'
      || resources.bulletErasePolicy !== 'none'
      || resources.itemPolicy !== 'none'
      || resources.hyperPolicy !== 'zero-shadow') {
    throw new TypeError('private damage requires outgoing-only collision policies');
  }
  return resources;
}

/**
 * Outgoing-only collision entry for logical owner 2.
 *
 * This intentionally reuses the cartridge helpers above. It does not enter
 * `collisionPass` or `weaponTail`, so player collision, ramming, items, bombs,
 * laser bombs, impacts, and bullet erasure are outside this boundary.
 */
export function privateOutgoingDamagePass(ram, ctx, suppliedResources) {
  const resources = assertPrivateDamageResources(suppliedResources);
  if (typeof ram?.assertPrivateDamageCapabilities !== 'function'
      || typeof ram?.beginPrivateDamageSource !== 'function'
      || typeof ram?.endPrivateDamageSource !== 'function') {
    throw new TypeError('private damage requires the strict composite memory adapter');
  }
  ram.assertPrivateDamageCapabilities(resources);

  const result = {
    ran: false, anyShot: false, hitsA: 0, hitsB: 0,
    weapon: null,
  };
  if (ram.u16(resources.phaseAddress) !== 0) return result;
  const playerWord = ram.u16(resources.player);
  if ((playerWord & 0x8000) === 0) return result;

  result.ran = true;
  ram.setU16(DMG.b6e6, 0);
  ram.setU16(DMG.b6e8, 0);
  ram.setU16(DMG.fa72, resources.ordinaryMask);
  let d7 = 0x2800;

  ram.beginPrivateDamageSource('ordinary', resources.ordinaryMask);
  try {
    result.anyShot = shotBoundingBox(ram, resources.shots, d7);
    if (result.anyShot) {
      const gate = ram.u16(DMG.gate308c);
      result.hitsA = poolDamage(ram, DMG.poolA, ram.u16(DMG.poolACount),
        resources.shots, d7, resources.ordinaryMask, gate, 'A', ctx);
      const countB = ram.u16(DMG.poolBCount);
      if (countB !== 0) {
        for (const address of [BOX.maxY, BOX.minY, BOX.maxX, BOX.minX]) {
          ram.setU16(address, u16(ram.u16(address) + 0xf000));
        }
        d7 = 0x1800;
        result.hitsB = poolDamage(ram, DMG.poolB, countB, resources.shots,
          d7, resources.ordinaryMask, gate, 'B', ctx);
      }
    }
  } finally {
    ram.endPrivateDamageSource();
  }

  // `$24518A` reloads $2800 independently of pool B's $1800 rebias.
  const d6 = 0x2800;
  if ((playerWord & 0x0080) === 0
      && ram.u8(resources.player + DMG.laserByte) !== 0) {
    const weapon = { hits27: 0, hits30: 0, beam: 0 };
    ram.beginPrivateDamageSource('slot-27', resources.weaponMask);
    try {
      weapon.hits27 = weaponObjectPass(ram, resources.slot27, d6,
        { block: 7 }, ctx);
    } finally {
      ram.endPrivateDamageSource();
    }
    ram.beginPrivateDamageSource('slot-30', resources.weaponMask);
    try {
      weapon.hits30 = weaponObjectPass(ram, resources.slot30, d6,
        { block: 8 }, ctx);
    } finally {
      ram.endPrivateDamageSource();
    }
    ram.beginPrivateDamageSource('beam', resources.weaponMask);
    try {
      weapon.beam = laserDamagePass(ram, resources.beamControl, d6, ctx);
    } finally {
      ram.endPrivateDamageSource();
    }
    result.weapon = weapon;
  }
  return result;
}

function nativeOutgoingShotPass(ram, ctx, ownerIndex) {
  const p1 = ownerIndex === 0;
  const table = p1 ? DMG.p1shots : DMG.p2shots;
  const mask = p1 ? DMG.maskP1 : DMG.maskP2;
  ram.setU16(DMG.fa72, mask);
  ram.setU16(DMG.b6e6, ram.u16(p1 ? DMG.hyper1 : DMG.hyper2));
  ram.setU16(DMG.b6e8, ram.u16(p1 ? DMG.hyperLvl1 : DMG.hyperLvl2));

  let d7 = 0x2800;
  const result = {
    ran: true, ownerIndex, mask, anyShot: shotBoundingBox(ram, table, d7),
    hitsA: 0, hitsB: 0,
  };
  if (!result.anyShot) return result;

  const gate = ram.u16(DMG.gate308c);
  result.hitsA = poolDamage(ram, DMG.poolA, ram.u16(DMG.poolACount),
    table, d7, mask, gate, 'A', ctx);
  const countB = ram.u16(DMG.poolBCount);
  if (countB !== 0) {
    for (const address of [BOX.maxY, BOX.minY, BOX.maxX, BOX.minX]) {
      ram.setU16(address, u16(ram.u16(address) + 0xf000));
    }
    d7 = 0x1800;
    result.hitsB = poolDamage(ram, DMG.poolB, countB, table, d7,
      mask, gate, 'B', ctx);
  }
  return result;
}

function nativeCollisionArgs(ram, ownerIndex) {
  const p1 = ownerIndex === 0;
  return {
    table: p1 ? DMG.p1shots : DMG.p2shots,
    mask: p1 ? DMG.maskP1 : DMG.maskP2,
    d1: ram.u16(p1 ? DMG.hyper1 : DMG.hyper2),
    d2: ram.u16(p1 ? DMG.hyperLvl1 : DMG.hyperLvl2),
    player: p1 ? DMG.p1rec : DMG.p2rec,
    a1: p1 ? DMG.beamRecP1 : DMG.beamRecP2,
    a2: p1 ? DMG.laserSlot27 : DMG.laserSlot27P2,
    a3: p1 ? DMG.laserSlot30 : DMG.laserSlot30P2,
  };
}

function selectedNativeOutgoingOwner(ram) {
  const gate = ram.u16(DMG.gate308c);
  const mirror = ram.u16(DMG.mirror2);
  if (gate !== 0) {
    if (ram.u16(DMG.p1rec) !== 0) return mirror === 0 ? 0 : null;
    if (ram.u16(DMG.p2rec) !== 0 && mirror !== 0) return 1;
    return null;
  }
  return mirror === 0 ? 0 : 1;
}

/** `$18A1AC`: native P1/P2 selection followed by outgoing shot damage only. */
export function runNativeOutgoingShotCollision(ram, ctx) {
  const ownerIndex = selectedNativeOutgoingOwner(ram);
  if (ownerIndex === null) {
    return { ran: false, ownerIndex: null, mask: 0, anyShot: false, hitsA: 0, hitsB: 0 };
  }
  return nativeOutgoingShotPass(ram, ctx, ownerIndex);
}

/**
 * Native outgoing shots, slot 27, slot 30, and ordinary beam damage through the
 * return immediately before the bomb-laser transfer. Player collision, items,
 * impacts, ramming, and bomb damage remain outside this composition seam.
 */
export function runNativeOutgoingCombatBeforeBombDamage(ram, ctx) {
  const ownerIndex = selectedNativeOutgoingOwner(ram);
  if (ownerIndex === null) {
    return {
      ran: false, ownerIndex: null, mask: 0, anyShot: false,
      hitsA: 0, hitsB: 0, weapon: null,
    };
  }
  const result = nativeOutgoingShotPass(ram, ctx, ownerIndex);
  const p1 = ownerIndex === 0;
  const player = p1 ? DMG.p1rec : DMG.p2rec;
  const playerWord = ram.u16(player);
  if ((playerWord & 0x8000) === 0 || (playerWord & 0x0080) !== 0
      || ram.u8(player + DMG.laserByte) === 0) {
    return { ...result, weapon: null };
  }
  const slot27 = p1 ? DMG.laserSlot27 : DMG.laserSlot27P2;
  const slot30 = p1 ? DMG.laserSlot30 : DMG.laserSlot30P2;
  const beam = p1 ? DMG.beamRecP1 : DMG.beamRecP2;
  const d6 = 0x2800;
  return {
    ...result,
    weapon: {
      hits27: weaponObjectPass(ram, slot27, d6, { block: 7 }, ctx),
      hits30: weaponObjectPass(ram, slot30, d6, { block: 8 }, ctx),
      beam: laserDamagePass(ram, beam, d6, ctx),
    },
  };
}

/**
 * `$244D62` -- the pass, entered with the tail's five registers.
 *
 * `table` is A0 (the player's 36-slot shot table), `mask` is D0, `d1`/`d2` are
 * the hyper words the tail loads.  D7 is `$2800` at entry (`$244D74`).
 */
function collisionPassCore(
    ram, ctx, { table, mask, d1, d2, player, a1, a2, a3 }, transferBombDamage) {
  ram.setU16(DMG.fa72, mask);                         // $244D62 move.w D0,$80FA72
  ram.setU16(DMG.b6e6, d1);                           // $244D68 move.w D1,$81B6E6
  ram.setU16(DMG.b6e8, d2);                           // $244D6E move.w D2,$81B6E8
  let d7 = 0x2800;                                    // $244D74 move.w #$2800,D7
  // $244D78 `tst.w (A4) / bpl.w $244EE0` -- A4 is the PLAYER record.  A live
  // player runs blocks 1..4 first; a dead one goes straight to the shot loops.
  const pbox = { boxRun: false, hitPlayer: false, items: 0, impacts: 0, rammed: false };
  if ((ram.u16(player) & 0x8000) !== 0) {
    ram.setU16(DMG.fa7e, 0);                          // $244D7E clr.w $80FA7E
    const box = playerBox(ram, player, ctx);                  // $244D84 jsr ($2459D0,PC)
    pbox.boxRun = true; pbox.hitPlayer = box.hit;
    // $244D8A `tst.w $80FA7E / bne.w $244EE0`.  NOTE it re-reads the WORD --
    // it does not use $2459D0's carry or a register -- so a routine that set
    // $80FA7E on an earlier frame and never cleared it would skip blocks 2-4
    // forever.  `$244D7E` is why that cannot happen HERE, and `$244D40` is why
    // it is worth saying: that entry has no `clr.w`.
    if (ram.u16(DMG.fa7e) === 0) {
      // $244D94..$244D9A: the box is biased by D7 ($2800) before blocks 2-4.
      const b = {
        d0: u16(box.d0 + d7), d1: u16(box.d1 + d7),
        d2: u16(box.d2 + d7), d3: u16(box.d3 + d7),
      };
      pbox.items = itemCollisionBlock(ram, b, d7);           // $244D9C block 2
      pbox.impacts = impactCollisionBlock(ram, b, d7);      // $244DFE block 3
      const r = ramCollisionBlock(ram, b, d7, player, ctx);  // $244E5C block 4
      pbox.rammed = r.rammed; pbox.ram = r.rammed ? r : null;
      // `$244ED6 bra $244EE0` from block 4's hit lands on the SAME instruction
      // its fall-through does, so a ram does not skip the shot loops.  (An
      // earlier reading of `bra $244EE0` as "leaves the pass" was wrong: the
      // pass CONTINUES at block 5.  Kept as a comment because the wrong reading
      // is the natural one for a `bra` out of a `dbra`.)
    }
  }
  // ---- $244EE0: the shot bounding box.
  if (!shotBoundingBox(ram, table, d7)) {             // $244EF0 bra.w $24518A
    const w = weaponTail(ram, ctx, player, a1, a2, a3, transferBombDamage);
    return { hitsA: 0, hitsB: 0, anyShot: false, player: pbox, ...w };
  }
  const gate = ram.u16(DMG.gate308c);
  // ---- $244F68: pool A, $81459C, 100 slots.
  const hitsA = poolDamage(ram, DMG.poolA, ram.u16(DMG.poolACount), table, d7,
    ram.u16(DMG.fa72), gate, 'A', ctx);
  // ---- $245078: pool B, $81521C, 50 slots.  $24508C rebiases the box by
  // $F000 (= -$1000) and D7 becomes $1800; $2800 + $F000 = $1800, so the box
  // and the coordinates stay in step.  The rebias happens ONLY when
  // `$815EA0` is non-zero -- `$245086 beq.w $245188` jumps past it.
  let hitsB = 0;
  const cntB = ram.u16(DMG.poolBCount);
  if (cntB !== 0) {
    for (const a of [BOX.maxY, BOX.minY, BOX.maxX, BOX.minX]) {
      ram.setU16(a, u16(ram.u16(a) + 0xf000));        // $245096 add.w D7,(A1)+ x4
    }
    d7 = 0x1800;                                      // $24509E move.w #$1800,D7
    hitsB = poolDamage(ram, DMG.poolB, cntB, table, d7, ram.u16(DMG.fa72),
      gate, 'B', ctx);
  }
  const w = weaponTail(ram, ctx, player, a1, a2, a3, transferBombDamage);
  return { hitsA, hitsB, anyShot: true, player: pbox, ...w };
}

export function collisionPass(ram, ctx, args) {
  const { reachedBombDamage: _reachedBombDamage, ...result } = collisionPassCore(
    ram, ctx, args, true,
  );
  return result;
}

/**
 * `$245188..$245310` -- the WEAPON TAIL, and its gate.
 *
 * Everything here is behind `$24519A tst.b ($3f,A4) / beq.w $24560A`, the byte
 * `$24C282` sets while a beam is arming and `$24C2D6` clears on release.  So
 * this whole tail is a no-op on every frame nobody is holding fire, which is
 * why W34 could defer it without losing a hit, and why porting it now cannot
 * change a single frame of the no-input gates.  MEASURED, this wave: the
 * `webgate` no-input run is digit-for-digit unchanged.
 *
 * ORDER, and how it was established: block 7 (`$2451A2`), block 8 (`$24525C`),
 * `$24530C bsr $2453AC`, `$245310 bra.w $24560A`.  That is the instruction
 * stream -- `$245258 dbra` falls into `$24525C`, `$245308 dbra` falls into
 * `$24530C`, and the `bsr` returns into the `bra`.  Not a measurement.
 */
function weaponTail(ram, ctx, player, a1, a2, a3, transferBombDamage) {
  const d6 = 0x2800;                                  // $24518A move.w #$2800,D6
  const d0 = ram.u16(player);                         // $24518E move.w (A4),D0
  if ((d0 & 0x8000) === 0) {                         // $245190 bpl.w $2459CE
    return { weapon: null, reachedBombDamage: false };
  }
  if ((d0 & 0x0080) !== 0) {                          // $245194 tst.b D0 / bmi
    if (transferBombDamage) bombLaserBlock(ram, ctx, player);
    return { weapon: null, reachedBombDamage: true };
  }
  if (ram.u8(player + DMG.laserByte) === 0) {         // $24519A tst.b ($3f,A4)
    if (transferBombDamage) bombLaserBlock(ram, ctx, player);  // $24519E beq.w $24560A
    return { weapon: null, reachedBombDamage: true };
  }
  if (a1 === undefined) {
    // The tail always supplies A1/A2/A3; a caller that does not is a defect in
    // this file, not a board state, so it says so rather than guessing.
    throw new Error('collisionPass: the $28B670 tail must pass A1/A2/A3');
  }
  const hits27 = weaponObjectPass(ram, a2, d6, { block: 7 }, ctx);   // $2451A2
  const hits30 = weaponObjectPass(ram, a3, d6, { block: 8 }, ctx);   // $24525C
  const beam = laserDamagePass(ram, a1, d6, ctx);                    // $24530C bsr
  if (transferBombDamage) bombLaserBlock(ram, ctx, player);     // $245310 bra.w
  return { weapon: { hits27, hits30, beam }, reachedBombDamage: true };
}

function playerBoxOnlyPass(ram, ctx, args, entry) {
  ram.setU16(DMG.fa72, args.mask);
  ram.setU16(DMG.b6e6, args.d1);
  ram.setU16(DMG.b6e8, args.d2);
  if ((ram.u16(args.player) & 0x8000) === 0) return null;
  const box = playerBox(ram, args.player, ctx);
  return { player: { boxRun: true, hitPlayer: box.hit, items: 0, impacts: 0,
    rammed: false, entry } };
}

function buildAFullCollision(ram, ctx, ownerIndex) {
  const args = nativeCollisionArgs(ram, ownerIndex);
  const { reachedBombDamage, ...collision } = collisionPassCore(
    ram, ctx, args, false,
  );
  return {
    path: 'full', entry: 0x144454, ownerIndex, playerRecord: args.player,
    reachedBombDamage, ...collision,
  };
}

function buildAPlayerBoxOnly(ram, ctx, ownerIndex) {
  const args = nativeCollisionArgs(ram, ownerIndex);
  const collision = playerBoxOnlyPass(ram, ctx, args, 0x144432);
  return {
    path: 'player-box-only', entry: 0x144432, ownerIndex,
    playerRecord: args.player, reachedBombDamage: false,
    ...(collision ?? {}),
  };
}

function buildARts(ownerIndex = null) {
  return {
    path: 'rts', entry: 0x18a254, ownerIndex,
    playerRecord: ownerIndex === null ? null : ownerIndex === 0 ? DMG.p1rec : DMG.p2rec,
    reachedBombDamage: false,
  };
}

/**
 * Build A `$18A1AC` selection through the instruction before `$144CE8`.
 *
 * Unlike Build B, the alternate arm tests only `$813098`: zero returns at
 * `$18A254`, while nonzero enters the player-box-only `$144432` path. The full
 * `$144454` path runs all player, item, impact, ramming, shot, and laser blocks
 * but reports the bomb continuation instead of executing Build B's damage body.
 */
export function runBuildAType5CollisionBeforeBombDamage18A1AC(ram, ctx) {
  const gate = ram.u16(DMG.gate308c);
  const mirror = ram.u16(DMG.mirror2);
  if (gate !== 0) {
    if (ram.u16(DMG.p1rec) !== 0) {
      if (mirror === 0) return buildAFullCollision(ram, ctx, 0);
      return ram.u16(DMG.loop98) !== 0
        ? buildAPlayerBoxOnly(ram, ctx, 0) : buildARts(0);
    }
    if (ram.u16(DMG.p2rec) === 0) return buildARts();
    if (mirror !== 0) return buildAFullCollision(ram, ctx, 1);
    return ram.u16(DMG.loop98) !== 0
      ? buildAPlayerBoxOnly(ram, ctx, 1) : buildARts(1);
  }
  return buildAFullCollision(ram, ctx, mirror === 0 ? 0 : 1);
}

/**
 * `$28B670` -- object type 5's TAIL, and the only thing in build B that reaches
 * `$244D62`.
 *
 * The four arms are transcribed whole because which one runs is the board's
 * state, not a choice: `$81308C` picks the pair, `$80390C` picks the player
 * inside each pair, and the `$28B706` arm ends at `$244D40`, which sets the
 * same three globals and then runs the PLAYER's box ONLY -- no shot loop at
 * all.  A port that assumed the P1 arm would silently damage nothing the day
 * `$80390C` went non-zero.
 */
export function runType5Tail(ram, ctx) {
  const g308c = ram.u16(DMG.gate308c);                // $28B670 tst.w $81308C
  const mirror = ram.u16(DMG.mirror2);
  // The registers `$244D40` inherits.  `null` means A4 IS STALE -- see
  // `tailNoPlayer`.  Nothing else in this function needs them, which is why
  // they were not carried before W60.
  let p1args = null, d40args = null;
  if (g308c !== 0) {
    const p1 = ram.u16(DMG.p1rec);                    // $28B67A move.w $8103E6,D4
    if (p1 !== 0) {                                   // $28B680 beq $28B6C0
      p1args = {
        table: DMG.p1shots, mask: DMG.maskP1,
        d1: ram.u16(DMG.hyper1), d2: ram.u16(DMG.hyperLvl1), player: DMG.p1rec,
        a1: DMG.beamRecP1, a2: DMG.laserSlot27, a3: DMG.laserSlot30 };
      if (mirror === 0) {                             // $28B6B0 tst.w / bne $28B706
        return collisionPass(ram, ctx, p1args);       // $28B6B8 jmp $244D62
      }
      d40args = p1args;
    } else {
      const p2 = ram.u16(DMG.p2rec);                  // $28B6C0 move.w $810448,D4
      // $28B6C6 `beq.b $28B728` -- and it jumps STRAIGHT to `$244D40` from
      // BEFORE the seven `lea`s, so A4/D0/D1/D2 are whatever the caller left.
      // That is the one arm the port cannot model, and it says so.
      if (p2 === 0) return tailNoPlayer(ram, ctx, null);
      // $28B6FC `beq.b $28B706` -- and the sense is the OPPOSITE of P1's
      // `$28B6B6 bne.b $28B706` twenty-six bytes earlier.  P1 runs the pass
      // when $80390C is ZERO; P2 runs it when $80390C is NON-zero.  Reading
      // the second as a copy of the first inverts which table gets damaged.
      const p2args = {
        table: DMG.p2shots, mask: DMG.maskP2,
        d1: ram.u16(DMG.hyper2), d2: ram.u16(DMG.hyperLvl2), player: DMG.p2rec,
        a1: DMG.beamRecP2, a2: DMG.laserSlot27P2, a3: DMG.laserSlot30P2 };
      if (mirror !== 0) {
        return collisionPass(ram, ctx, p2args);       // $28B6FE jmp $244D62
      }
      d40args = p2args;
    }
    // $28B706: the two-player interaction arm.
    if (ram.u16(DMG.loop98) !== 0) {                  // $28B706 tst.w $813098
      if (ram.u16(DMG.g393a) === 0) return null;      // $28B710 beq $28B726 rts
      if (ram.u16(DMG.g309c) === 1) return null;      // $28B71A cmpi.w #$1 / bne
    }
    return tailNoPlayer(ram, ctx, d40args);           // $28B728 jmp $244D40
  }
  // ---- $28B730: the `$81308C == 0` pair.  NO player-liveness test at all.
  if (mirror === 0) {                                 // $28B730 tst.w / bne $28B76E
    return collisionPass(ram, ctx, {                  // $28B766 jmp $244D62
      table: DMG.p1shots, mask: DMG.maskP1,
      d1: ram.u16(DMG.hyper1), d2: ram.u16(DMG.hyperLvl1), player: DMG.p1rec,
      a1: DMG.beamRecP1, a2: DMG.laserSlot27, a3: DMG.laserSlot30 });
  }
  return collisionPass(ram, ctx, {                    // $28B79C jmp $244D62
    table: DMG.p2shots, mask: DMG.maskP2,
    d1: ram.u16(DMG.hyper2), d2: ram.u16(DMG.hyperLvl2), player: DMG.p2rec,
    a1: DMG.beamRecP2, a2: DMG.laserSlot27P2, a3: DMG.laserSlot30P2 });
}

/**
 * `$244D40` -- the same three global writes, then `$244D5A jmp ($2459D0,PC)`
 * and nothing else: no `clr.w $80FA7E`, no blocks 2-4, no shot loop.
 *
 * **THIS IS WHY THE PLAYER IS CHECKED TWICE A FRAME.**  `$81308C` is 1 on this
 * tree, so the tail alternates on `$80390C`: the frames P1 does NOT get
 * `$244D62` it gets `$244D40` instead, and `$2459D0` runs on BOTH.  The
 * shot-vs-enemy check is a 30 Hz check (W34 §2.1); the player-vs-bullet check
 * is a 59 Hz one, and reading `$244D40` as "the pass, minus everything" hides
 * that.
 *
 * `args` is null only for `$28B6C6`, which jumps here from before the `lea`s
 * with **A4 stale**.  The port refuses to invent an A4 and counts that arm.
 */
function tailNoPlayer(ram, ctx, args) {
  if (!args) {
    note(ctx, DMG.passNoPlayer, `$28B6C6 beq $28B728 -- $244D40 entered with `
      + `BOTH player words zero, i.e. from before $28B6C8's seven lea's, so A4 `
      + `(and D0/D1/D2) still hold the caller's values. $244D56 tst.w (A4) `
      + `reads an address this port cannot name, so $2459D0 is not run`);
    return null;
  }
  return playerBoxOnlyPass(ram, ctx, args, DMG.passNoPlayer);
}
