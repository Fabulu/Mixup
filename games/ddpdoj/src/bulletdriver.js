// `$281D9A` -- THE ENEMY-BULLET DRIVER, the per-frame caller of the mover, plus
// `$281CD6` (the screen clear) and `$25354C` (the timer that arms it).
// WAVE 29 (the INTEGRATION wave).
//
// W26 ported the MOVER `$281DDE` and W27 the 37 behaviour bodies it dispatches.
// Neither was ever called from anything that runs: W28 measured `runMover`'s
// only two callers in the whole repo as `tests/mover.test.js` and
// `tools/w26movergate.mjs`.  `$281D9A` is the board's own caller -- type-5 call
// #20, `$28B658 jsr $281D9A` -- and this file is its transcription.
//
// ================================ `$281D9A` =================================
//
//   281D9A: bsr.w  $281CD6            the SCREEN CLEAR (below)
//   281D9E: lea    $809C4C,A4         bucket 23's staging buffer
//   281DA4: move.l A4,-(A7)           ...saved, to difference at the end
//   281DA6: clr.w  $81B40C            the live-bullet counter, reset per frame
//   281DAC: lea    $809274,A0         bucket 22's staging buffer
//   281DB2: adda.w $80AFE0,A0         ...+ its CURRENT length: the driver APPENDS
//   281DB8: move.l A0,$81B41C         the secondary (trail) cursor
//   281DBE: bsr.b  $281DDE            THE MOVER
//   281DC0: move.l $81B41C,D0
//   281DC6: move.l #$809274,D1
//   281DCC: sub.l  D1,D0
//   281DCE: move.w D0,$80AFE0         bucket 22's counter = cursor - base
//   281DD4: suba.l (A7)+,A4
//   281DD6: move.w A4,$80AFE2         bucket 23's counter = records written
//   281DDC: rts
//
// **THE TWO COUNTERS ARE SET FROM A POINTER DIFFERENCE, NOT ADVANCED.**  That is
// the bulk-writer convention (`src/spritequeue.js` §3): a bulk writer OVERWRITES
// its bucket's counter, so it cannot share the bucket with a per-record stub.
// Bucket 22 is the exception that proves it -- `$281DB2` reads `$80AFE0` back
// and appends, so its length is preserved across the call.
//
// WHAT THIS PORT DOES NOT DO, said here rather than discovered: **it emits no
// sprites.**  `spriteEmit` in `src/mover.js` writes to a JS array sink and
// returns immediately when there is none (`if (!ctx.sprites) return;`), and this
// file passes none.  Buckets 22 and 23 therefore stay empty and the two counter
// writes above land on the values they already held.  That is FAITHFUL to a run
// in which nothing was emitted -- it is not a fabricated length -- but it is
// also not the board's behaviour, so it is COUNTED at `$281DCE` every frame.
// Wiring the sink is a separate wave and it must be, for a measured reason:
// `26-review.md` F1 and F2 are open defects IN the emit (`spriteEmit` swaps the
// renderOffs half-words relative to `$284286`; kind 19's continuation omits its
// renderOffs wrap), both latent only BECAUSE no sink exists.  Turning the sink
// on this wave would ship two known-wrong fields into the picture.
//
// ================================ `$281CD6` =================================
//
// The BOMB / SCREEN CLEAR.  Gated on `$81B410` (the timer `$25354C` counts down)
// and split by the SIGN of `$81B412`:
//
//   281CD6: tst.w $81B410 / beq $281D98      -- not armed: rts, and it is the
//                                               ordinary case every frame
//   281CE0: move.w $81B412,D0 / bmi $281D48  -- NEGATIVE -> the TRANSFORM arm
//
//   $281D22 (D0 >= 0), per live slot:   `tst.b (A6) / bpl skip`  (bit 15 of the
//       type word, read as bit 7 of its high BYTE), then D0 = $81B412,
//       `jsr $27F8F8` -- the impact/effect pool, UNPORTED -- then
//       `clr.w (A6)` + `move.w #$FFFF,$2(A6)`: the bullet becomes an effect.
//   $281D48 (D0 < 0), per live slot:    `or.b #$40,(A6)` -- bit 14 of the type
//       word, which is the mover's own TRANSFORM path `$281FA2` -- and
//       `move.w #$FFFF,$3C(A6)`.  No call, nothing freed.
//
// The two arms are the two halves of a bomb: one erases the bullets, the other
// turns them into the score items a bomb leaves behind.  Both walk the SAME
// slot-count cascade the mover walks (`moverIterCount`), which is why that
// function is exported rather than written twice.
//
// `$27F8F8` WAS A LOUD NAMED THROW AND WAVE 51 DOWNGRADED IT TO A COUNTED
// NOTE.  The sentence that stood here from W29 to W50 --
//
//     "It is reachable only when `$81B410` is non-zero, and nothing in the port
//      can make it non-zero: the only writer is the bomb (`$249814`)"
//
// -- **IS FALSE, and it was false before W51 too.**  `$243E7C move.w #$1,$81B410`
// is the SECOND writer; `src/midboss.js armScreenClear` has ported it since W31,
// reached from the midboss's death arms `$26B70C` and `$26B80C`.  What was
// missing was not the writer, it was the DEATH: nothing in this port could kill
// the midboss.  W51's beam can, and [M] it does, at step 1,773 of a run from the
// shipped seed with fire held -- the body and all eight arms, each with its own
// `$289004`/`$28C25A` death note -- and the very next frame the screen clear
// armed and the page died on this throw.  The owner would have hit it by
// holding the button for thirty seconds.
//
// **THE REASON IT IS A NOTE AND NOT A PORT** is the one W34 §1.6 gives for
// `$289004` and `50-recon-effects` restates as the POOL LEAK: `$27F8F8` is a
// SLOT ALLOCATOR over the impact pool `$8171BE` -- `moveq #$45,D7` = 70 slots of
// `$2C`, free test `tst.w (A0)`, `bra $280B3E` to fill and
// `$280B3E addq.w #1,$817F7E` to count -- and its only driver is `$27F95A`,
// **type-5 call #4, unported**.  Porting the allocator without the driver would
// consume all 70 slots and then fail silently forever, which is W33's defect
// rebuilt one level down.  So this wave allocates NOTHING.
//
// **AND THE NOTE INVENTS NOTHING**, which is the test `src/unported.js` sets for
// the difference.  Read the call site:
//
//   281d26  move.w D7,-(A7)
//   281d28  move.w $81B412,D0
//   281d2e  jsr $27F8F8            <- the effect.  Its RESULT is A0 and the
//   281d34  move.w (A7)+,D7           CARRY, and the caller uses NEITHER: there
//   281d36  clr.w (A6)                is no `bcc` after it and A0 is dead.
//   281d38  move.w #$FFFF,($2,A6)  <- the two writes that actually clear the
//   281d3e  lea ($40,A6),A6           bullet, and BOTH are ported below.
//
// So the bullets are cleared exactly as the board clears them and the effect is
// absent and named -- the same shape as every other member of this family
// already in the port (`$289004`, `$28C25A`, `$289F54`, `$27F8EE`, `$289F96`).
//
// ================================ `$25354C` =================================
//
// Type-5 call #21, and the whole routine is six instructions:
//
//   25354C: tst.w  $81B410 / beq $253562
//   253554: subq.w #$1,$81B410 / bne $253562
//   25355C: clr.w  $81B412
//   253562: rts
//
// Read PAST it: `$253564` begins a different routine (`cmpi.w #$14,$811F8C`) and
// NOTHING in `$25354C..$253562` branches to it -- the three conditional branches
// all target `$253562`, the rts.  So this is complete, not a prefix.

import { unreached } from './unported.js';
import { u16, i16 } from './ram.js';
import { BUL } from './bullets.js';
import { runMover, moverIterCount, MOVER } from './mover.js';

export const BULLET_DRIVER = {
  entry: 0x281d9a,          // type-5 call #20, `$28B658 jsr $281D9A`
  screenClear: 0x281cd6,    // `$281D9A bsr.w`
  clearEffect: 0x27f8f8,    // `$281D2E jsr` -- UNPORTED, throws
  timer: 0x25354c,          // type-5 call #21, `$28B65E jsr $25354C`
  armWord: 0x81b410,        // the gate both routines read
  modeWord: 0x81b412,       // its SIGN picks the clear arm; cleared on expiry
  liveCount: 0x81b40c,      // `$281DA6 clr.w`
  trailCursor: 0x81b41c,    // `$281DB8 move.l A0,`
  buf22: 0x809274,          // `$281DAC lea` -- bucket 22's staging buffer
  ctr22: 0x80afe0,          // `$281DB2` reads it and `$281DCE` writes it
  buf23: 0x809c4c,          // `$281D9E lea` -- bucket 23's, and the mover's A4
  ctr23: 0x80afe2,          // `$281DD6 move.w A4,`
  counterWrite: 0x281dce,   // where the missing sprite sink is counted
};

// The two record offsets the clear writes.  `posA` is the `move.w #$FFFF,$2(A6)`
// that follows the `jsr $27F8F8` on the FREE arm -- kept because the ROM has it,
// unused in the port because the throw is in front of it.  If `$27F8F8` is ever
// ported, the free arm ends `freeSlotNoEffect`-style with these two writes.
const CLR = { posA: 0x02, transformFlag: 0x3c };

/**
 * `$281CD6` -- the screen clear.  Returns the number of slots it acted on, which
 * is 0 on every ordinary frame.
 */
export function runScreenClear(ctx) {
  const { ram } = ctx;
  if (ram.u16(BULLET_DRIVER.armWord) === 0) return 0;   // $281CD6 tst.w / beq $281D98
  const mode = ram.u16(BULLET_DRIVER.modeWord);         // $281CE0
  const slots = moverIterCount(ram);                    // $281CEE..$281D1E (== $281D50..$281D80)
  let hit = 0;
  if ((mode & 0x8000) !== 0) {                          // $281CE6 bmi $281D48
    for (let s = 0; s < slots; s++) {                   // $281D84 / $281D94 dbra
      const base = BUL.pool + s * BUL.stride;
      if ((ram.u8(base) & 0x80) === 0) continue;        // $281D84 tst.b (A6) / bpl
      ram.setU8(base, ram.u8(base) | 0x40);             // $281D88 or.b D2,(A6)  (D2=$40)
      ram.setU16(base + CLR.transformFlag, 0xffff);     // $281D8A move.w #$FFFF,$3C(A6)
      hit++;
    }
    return hit;
  }
  for (let s = 0; s < slots; s++) {                     // $281D22 / $281D42 dbra
    const base = BUL.pool + s * BUL.stride;
    if ((ram.u8(base) & 0x80) === 0) continue;          // $281D22 tst.b (A6) / bpl
    // $281D28 move.w $81B412,D0 ; $281D2E jsr $27F8F8 -- the impact/effect pool
    // ($8171BE, 70 slots of $2C, driven by type-5 call #4 $27F95A, unported).
    // COUNTED, never allocated -- see this file's header for both reasons.
    ctx.unportedLog?.note(BULLET_DRIVER.clearEffect,
      `$281D2E jsr $27F8F8 (D0=$${mode.toString(16).toUpperCase()}) -- the `
      + `screen clear's per-bullet effect. $27F8F8 is a slot ALLOCATOR over the `
      + `impact pool $8171BE (moveq #$45,D7 = 70 x $2C, free test tst.w (A0), `
      + `filled at $280B3E which also bumps the live count $817F7E), and its `
      + `only driver is $27F95A, type-5 call #4, UNPORTED. Allocating without a `
      + `driver is W33's leak one level down (50-recon-effects), so this port `
      + `allocates nothing. The caller reads neither A0 nor the carry, and the `
      + `two writes that clear the bullet ($281D36/$281D38) ARE ported, so the `
      + `only thing absent is the visual effect. Reached because W51's beam can `
      + `kill the midboss, whose death arms $81B410 through $243E7C`);
    ram.setU16(base, 0);                                // $281D36 clr.w (A6)
    ram.setU16(base + CLR.posA, 0xffff);                // $281D38 move.w #$FFFF
    hit++;
  }
  return hit;
}

/**
 * `$281D9A` -- one frame of the enemy-bullet subsystem.
 * @returns {{cleared:number, live:number}}
 */
export function runBulletDriver(ctx) {
  const { ram } = ctx;
  const cleared = runScreenClear(ctx);                       // $281D9A bsr.w $281CD6
  const a4start = BULLET_DRIVER.buf23;                       // $281D9E / $281DA4
  ram.setU16(BULLET_DRIVER.liveCount, 0);                    // $281DA6 clr.w $81B40C
  // $281DB2 `adda.w $80AFE0,A0`.  ADDA.W SIGN-EXTENDS its source to 32 bits --
  // it is not an unsigned add.  A bucket-22 length is a byte count and has never
  // been measured at or above $8000, so the two readings agree today; the ROM
  // decides which one the port implements, not the range the data happens to
  // have taken.
  const a0 = i16(ram.u16(BULLET_DRIVER.ctr22));
  ram.setU32(BULLET_DRIVER.trailCursor, BULLET_DRIVER.buf22 + a0);  // $281DB8
  const before = ctx.sprites ? ctx.sprites.length : 0;

  runMover(ctx);                                             // $281DBE bsr.b $281DDE

  // $281DC0..$281DD6.  Both counters come from a POINTER DIFFERENCE.  A4 is the
  // mover's own emit cursor: `spriteEmit` pushes FOUR values per 12-byte record,
  // so the byte distance A4 travelled is (pushes/4)*12.  With no sink (the case
  // today, and stated in the header) that is 0 and both counters land on the
  // values they already held -- faithful to "nothing was emitted", not invented.
  const d0 = (ram.u32(BULLET_DRIVER.trailCursor) - BULLET_DRIVER.buf22) | 0;
  ram.setU16(BULLET_DRIVER.ctr22, u16(d0));                  // $281DCE
  const emitted = ctx.sprites ? (ctx.sprites.length - before) / 4 : 0;
  const a4 = a4start + emitted * 12;                         // $281DD4 suba.l (A7)+,A4
  ram.setU16(BULLET_DRIVER.ctr23, u16(a4 - a4start));        // $281DD6
  ctx.unportedLog?.note(BULLET_DRIVER.counterWrite,
    `the bullet driver's sprite EMISSION ($281DCE/$281DD6, buckets 22 and 23): `
    + `src/mover.js's spriteEmit writes to a JS sink and this driver passes `
    + `none, so both counters are set from unmoved cursors. The pixels are a `
    + `separate wave -- 26-review F1/F2 are open defects INSIDE the emit`);
  return { cleared, live: ram.u16(MOVER.liveCount) };
}

/**
 * `$25354C` -- type-5 call #21.  The clear's arming timer: count `$81B410` down
 * and, on the transition to zero, clear the mode word `$81B412`.
 * @returns {boolean} whether the timer expired THIS frame
 */
export function runClearTimer(ram) {
  if (ram.u16(BULLET_DRIVER.armWord) === 0) return false;    // $25354C tst.w / beq
  const n = u16(ram.u16(BULLET_DRIVER.armWord) - 1);         // $253554 subq.w #$1
  ram.setU16(BULLET_DRIVER.armWord, n);
  if (n !== 0) return false;                                 // $25355A bne $253562
  ram.setU16(BULLET_DRIVER.modeWord, 0);                     // $25355C clr.w $81B412
  return true;
}
