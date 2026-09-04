// THE STAGE ADVANCE -- `$242952`, OBJECT TYPE 6 (`$28D63C`) and the
// `$25FCFA`/`$25FD0C`/`$25FD24`/`$25FD38` teardown-and-rebuild.  W62 (S1).
//
// ============================================================================
// THE HEADLINE, AND IT IS NOT WHAT THE PORT HAS BEEN SAYING FOR FIFTEEN WAVES
// ============================================================================
// `src/background.js` has said since W19 that stage 1 ends at a FROZEN camera
// waiting to be released.  **Nothing ever releases it, because nothing ever
// freezes it in the sense the port meant.**  Recon 49 read the per-frame path
// instruction by instruction and measured the consequence, and this wave
// re-read the same instructions:
//
//   * the freeze word `($8,A5)` gates EXACTLY ONE instruction, `$26132C addq.w
//     #$1,$8130CE` -- the DISTANCE CLOCK.  The speed read `$2612FE`, the camera
//     accumulate `$261314` and the whole column writer sit ABOVE it and run
//     unconditionally.  A "frozen" background keeps scrolling at 4.000 px/f
//     forever while a 14-column band of map repeats.
//   * so there is no door to open.  **THE OWNER OBJECT IS DELETED.**
//     `$25FCFA` pauses the handler (`$8130D2 := 1`) and then queues `$813144`
//     -- the background object's ID -- for destruction through `$241238`, the
//     DEFERRED kill list.  `$25FD38` builds a NEW one with entry clock 0.
//
// **The correct verb is DESTROY AND REBUILD.**  Recon 49 7.9 asks that the
// word "unfreeze" appear nowhere in this port and it does not.
//
// ============================================================================
// `$242952` HAS FIVE CALLERS AND THEY ARE THE FIVE BOSSES
// ============================================================================
// `$292922` (stage 1), `$2973A8`, `$29BE36`, `$29EF14`, `$2A4614`.  So this
// file is not stage-1 code: it is the machine ALL FIVE stages advance through,
// and `$2429BE addq.w #$1,D7` is the only place a stage number is incremented.
//
// AND THERE IS A SECOND ENTRY, `$2429C4`, WHICH RECON 49 9 LEFT OPEN.  Read
// this wave: it is `jsr $242A40(pc)` (= `jmp $263584`) followed by a byte-for-
// byte copy of `$24295E..$2429B6` and then `bra` into the SAME tail at
// `$242A30` -- **without the `addq.w #$1,D7`**, and with D7 whatever its caller
// left.  Its one caller is `$259DDA`.  So it creates a type-6 object at the
// CURRENT stage number rather than the next one, which is a RESTART and not an
// advance.  It is transcribed as a named absence rather than ported: nothing in
// this port calls `$259DDA`, and `ADVANCE_ENTRIES` below records both so a
// later wave cannot read "five callers, five stages" as covering the surface.
//
// ============================================================================
// THE ONE DEVIATION IN THIS FILE, DECLARED
// ============================================================================
// Object type 6 has EIGHT states and three of their exits belong to the RESULT
// SCREEN -- `$28D9AA` (819 instructions), `$28E7F8` (299) and the HUD tally
// `$285400..$285568` -- which recon 49 8 prices as a SECOND WAVE and this
// wave's brief explicitly excludes.  Two of those three exits stand between the
// boss's death and `$25FD0C`, so without them stage 1 cannot finish.
//
// **RECON 49 5.3 PRICED THE DEVIATION AT ONE SHORT-CIRCUIT.  IT WAS TWO.  IT IS
// NOW ZERO** -- W124 closed DEV-1 and W435 closed DEV-2.  Both are kept below
// because the SHAPE of each is worth more than the fact that it is gone, and
// because DEV-2's stated cause was wrong for ten waves in a way that is easy to
// repeat:
//
//   DEV-1  `$28DE5C` -- state 1 -> $B.  The real producer of `$8130F9` bit 1 is
//          `$285496` and it is the ONLY one in build B (recon 49 3.1's census,
//          re-measured this wave: one `bset`, two `btst`).  `$28D9AA` is not
//          ported, so bit 1 is never produced; the port takes `$28DE5C`'s state
//          assignment directly.  **It also sets `$8130F9` bit 1 itself**, so
//          that a later wave which ports `$285496` for real makes the pinned
//          test `w62 DEV-1 is still the only producer of $8130F9 bit 1` go RED.
//   DEV-2  `$28D6FC` -- state $B -> 2.  **CLOSED BY W435.**  The gate is
//          `$24681A(($8,A5))`, and the port used to compute it and then throw
//          it away, advancing on state $B's first frame.  Every text that
//          explained why -- W124's, W125's, W389's -- said the per-frame DRAIN
//          was unported.  **It was not.**  `animobjects.js
//          runAnimObjects24683E` is main-loop call #3 and has drained these
//          nodes since W91.  It skipped `$24652A`'s because it refuses a node
//          whose executor pointer `($6)` is zero, and `chainLoaderBody` was
//          leaving that zero: the content block `$246582..$2465D9` was decoded
//          in W389 and left switched OFF.  Turning it on and honouring
//          `$28D702`'s `bne` gives the board's own 32-frame wait.
//
// AND ONE EXIT IS **NOT** FAKED, deliberately: state 4 waits on `$28E7E6`,
// i.e. on `$81DFF6` going back to zero, and the only routine that clears it is
// `$28EAD4`, inside `$28E7F8`.  So the type-6 object REACHES STATE 4 AND STAYS
// THERE, holding one of the twenty object slots.  That is the honest
// consequence of not porting the banner and it is measured and reported rather
// than papered over -- everything the stage end has to do (`$25FD0C`,
// `$25FD38`) has already happened in states 2 and 3.

import { u16 } from './ram.js';
import { RAM } from './machine.js';
import { stageCreate, queueKill, objTableInit24107C, ALLOC } from './objalloc.js';
import { clearItemPool, bcd242AC6 } from './items.js';
import { resetAndInstallStage26331E } from './spawn.js';
import { bcdAdd, scoreByMask, scorePending } from './score.js';
import { enqueueRegistersThroughStub, enqueueRegisters, enqueueRequest } from './spritequeue.js';
import { install24150A } from './palette.js';
import { clearEffectPool, clearSubEffectPool } from './effects.js';
// W381 -- the four resets `$25FD38` had been COUNTING since W62.  All four have
// had a port for at least a wave; see the block comment above `rebuildWorld25FD38`.
import { clearPoolC289AE0, clearCuePool28AC3A } from './poolclear.js';
import { clearPool as clearSparkPool289F3A } from './spark.js';
import { poolClear as clearBulletPool28131E, poolPark as parkBulletSlots281330 }
  from './bullets.js';
// W381 -- `$28EAB8`/`$28EACE`'s callee, ported since W163 and counted here since W125.
import { flushPendingHyper2875B4 } from './hyper.js';
import { emit23F82A } from './bossarrival.js';
// W389 -- `$24676A..$2467C3`, the per-node CONTENT seeding that lives INSIDE `$246710`'s
// allocation loop. `animobjects.js` imports nothing from here, so this is not a cycle.
import { buildChain246532, CHAIN_SPECS, loadAnimObjects24652A,
  // W449: `$246800` merged here; this file's `chainFree246800` is gone.
  freeAnimObjects246800 } from './animobjects.js';
// W445 -- `$2537D2 jsr $2878CC` / `$253820 jsr $28795C`, the loop extend's LIVES row.
// `hud.js` has PORTED that body since W116 and imports nothing from here, so this is
// not a cycle: `hud.js -> items.js -> hud.js` is the pre-existing one, and this file
// already sits above both.
import { livesRow2878CC, note28C6C6, setPanelBody2532B6 } from './hud.js';

export const SE = {
  stage: 0x813092, stageX2: 0x813094, stageX4: 0x813096,   // $25FD0C
  bgHandle: 0x813144,      // $25FD74 move.l D0 -- the background object's ID
  clockBase: 0x8130ce,     // $25FD24 lea -- 22 words wiped
  clockWords: 0x16,        // $25FD2A move.w #$15 / dbra
  pauseFlag: 0x8130d2,     // $25FD82 / $25FD8C
  bossFlags: 0x8130f8, bossFlags9: 0x8130f9,
  clearing: 0x812972,      // $242968 move.w #$1 / $28D682 clr.w
  p1: 0x8103e6, p2: 0x810448,
  advanceFlag: 0x812970,   // $28D5DC move.w #$1 / $28D6C2 clr.w
  df1e: 0x81df1e, df20: 0x81df20, df22: 0x81df22,
  dff6: 0x81dff6, dff8: 0x81dff8, dffa: 0x81dffa,
  hud: 0x81b414,           // $28D5AC..$28D5BE, four words
  banner: 0x81dfac, bannerWords: 0x28,        // $28E7A2
  result: 0x81debe, resultWords: 0x77,        // $28D552
  e024: 0x81e024, e026: 0x81e026, e028: 0x81e028, e02a: 0x81e02a, e02c: 0x81e02c,
  dispatch: 0x240f62,      // the object table; entry 6 is $28D63C, priority $A
  type6: 6, type7: 7, type13: 0x13,
  ending13: 0x81e02e,      // $28EE88 A6; 20 words through $81E055
};

/** Both entry points into the stage-advance tail, and what separates them. */
export const ADVANCE_ENTRIES = Object.freeze({
  0x242952: 'THE ADVANCE. `$2429BE addq.w #$1,D7` -- five callers, the five '
    + 'bosses ($292922 $2973A8 $29BE36 $29EF14 $2A4614). PORTED.',
  0x2429c4: 'THE RESTART. `jsr $242A40(pc)` then the same body WITHOUT the '
    + 'addq -- D7 is the caller\'s. One caller, $259DDA, which nothing in this '
    + 'port reaches. NOT ported; named so the enumeration is not read as closed.',
});

const note = (ctx, a, w) => ctx.unportedLog?.note(a, w);

// ------------------------------------------------------------ the $25FDxx family

/** `$25FD82` -- PAUSE the background handler.  `$2612A0 tst.w $8130D2 / bne`
 *  skips the whole per-frame body, so this is a bigger hammer than the freeze. */
export function bgPause25FD82(ram) { ram.setU16(SE.pauseFlag, 1); }
/** `$25FD8C` -- and its release, whose one caller is inside `$25FD94`. */
export function bgResume25FD8C(ram) { ram.setU16(SE.pauseFlag, 0); }

/**
 * `$25FCFA` -- **PAUSE AND DESTROY.**  `bsr $25FD82`, then `lea $813144,A0 /
 * jmp $241238` -- and `$241238` reads the LONGWORD AT (A0), so what is queued
 * is the background object's ID, not its address.
 *
 * IT IS A *DEFERRED* KILL.  The ID goes onto `$80DBFE` (cursor `$80E23E`) and
 * `$241262` drains it at the TOP of the next object-driver pass, before the
 * creates.  So the background runs ONE MORE FRAME after this call -- recon 49
 * 7.3's warning, and a port that killed it synchronously would be one frame
 * short of the board.
 */
export function bgDestroy25FCFA(ram) {
  bgPause25FD82(ram);                                  // $25FCFA bsr $25FD82
  return queueKill(ram, ram.u32(SE.bgHandle));         // $25FCFE/$25FD04
}

/** `$25FD0C` -- **THE STAGE COUNTER.**  Two callers: `$28D69C` (type 6) and
 *  `$2606CE` (the fresh-game / continue path).  `$813096` is the x4 index every
 *  per-stage table is read through. */
export function writeStage25FD0C(ram, d0) {
  ram.setU16(SE.stage, u16(d0));                       // $25FD0C
  ram.setU16(SE.stageX2, u16(d0 * 2));                 // $25FD14
  ram.setU16(SE.stageX4, u16(d0 * 4));                 // $25FD1C
}

/** `$25FD24` -- twenty-two words from `$8130CE`, i.e. `$8130CE..$8130F9`
 *  INCLUSIVE.  Transcribed as the loop rather than as a field list, because the
 *  span is what makes it lift `$8130D2`'s pause, zero the distance clock and
 *  wipe BOTH boss flag bytes in one instruction. */
export function wipeStageBlock25FD24(ram) {
  for (let i = 0; i < SE.clockWords; i++) ram.setU16(SE.clockBase + i * 2, 0);
}

/**
 * `$25FD38` -- **REBUILD THE WORLD.**  The wipe, eight subsystem resets, and a
 * NEW type-1 background object whose `($6,A0)` -- the entry clock -- is
 * explicitly ZERO on the cartridge (`$25FD7A`). The default port path remains
 * zero because the preceding wipe includes `$8130CE`. A selected stage-install
 * hook may fast-forward that clock after the wipe; its value must also seed the
 * new background or background init would undo the same acceleration.
 *
 * ==========================================================================
 * W381 -- THE FOUR COUNTED NOTES ARE GONE, AND THEY WERE A LIVE DEFECT
 * ==========================================================================
 * W62 wrote four of the eight resets as `note()` deferrals because their
 * subsystems had no port.  Three of the four acquired one WITHOUT THIS FILE
 * BEING TOUCHED -- the classic stale counted note:
 *
 *   $289AE0  poolclear.js clearPoolC289AE0      W380
 *   $28AC3A  poolclear.js clearCuePool28AC3A    W380
 *   $289F3A  spark.js     clearPool             W53
 *   $28131E  bullets.js   poolClear + poolPark  earlier still
 *
 * So from W53 to W380 a stage advance left the SHOT-SPARK pool and the BULLET
 * pool full of the previous stage's live records while `$25FD24` had already
 * zeroed the clock they were timed against.  That is not untidiness: `$28A098`
 * walks pool E off ONE count word for both halves, and `$281D9A` walks all 210
 * bullet slots, so both drivers ran stale records into stage N+1.
 *
 * The bytes, re-swept this wave, are the whole order:
 *
 *   25fd38: 61 ea               bsr.b   $25FD24
 *   25fd3a: 4eb9 0026331e       jsr     $26331E   enemy subsystem + INSTALL
 *   25fd40: 4eb9 00288e0c       jsr     $288E0C   pool B
 *   25fd46: 4eb9 00289084       jsr     $289084   pool D
 *   25fd4c: 4eb9 00289ae0       jsr     $289AE0   pool C
 *   25fd52: 4eb9 0028ac3a       jsr     $28AC3A   the CUE pool
 *   25fd58: 4eb9 00289f3a       jsr     $289F3A   pool E, the shot spark
 *   25fd5e: 4eb9 0027e98a       jsr     $27E98A   the ITEM pool
 *   25fd64: 4eb9 0028131e       jsr     $28131E   the BULLET pool + 210 parks
 *   25fd6a: 303c 0001           move.w  #$1,D0
 *   25fd6e: 4eb9 00241182       jsr     $241182
 *   25fd74: 23c0 00813144       move.l  D0,$813144
 *   25fd7a: 317c 0000 0006      move.w  #$0,($6,A0)
 *   25fd80: 4e75                rts
 *
 * **`$28131E` IS TWO LOOPS, NOT ONE**, and a port that ran only the clear would
 * leave all 210 slots' `($2,A0)` at 0 instead of $FFFF:
 *
 *   28131e: 41f9 00817f8c  lea $817F8C,A0 / 303c 1a49 move.w #$1A49,D0
 *   281328: 7200 moveq #0,D1 / 30c1 move.w D1,(A0)+ / 51c8 fffc dbra
 *   281330: 41f9 00817f8e  lea $817F8E,A0 / 303c 00d1 move.w #$D1,D0
 *   28133a: 30bc ffff move.w #$FFFF,(A0) / 41e8 0040 lea ($40,A0),A0 / dbra
 *   281346: 4e75
 *
 * `$1A49`+1 = `$1A4A` = 6,730 words and `$D1`+1 = 210 slots -- trap 2 in both
 * halves, and both are already right in `bullets.js`.
 *
 * **ORDER IS IRRELEVANT HERE**, and that is a measurement rather than a hope.
 * `$28B5A8` issues the SAME EIGHT in a different order ($27E98A $28131E
 * $288E0C $289084 $289AE0 $28AC3A $289F3A $26331E -- the install LAST rather
 * than FIRST).  The eight ranges are pairwise disjoint:
 *
 *   $26331E  $81332C..$816B79     $27E98A  $816B7A..$8171BD
 *   $28131E  $817F8C..$81B41F     $288E0C  $81B732..$81C8EB
 *   $289084  $81C8EC..$81CDED     $289AE0  $81CDEE..$81D393
 *   $289F3A  $81D394..$81DB8F     $28AC3A  $81DB90..$81DD0F
 *
 * and the only non-clearing side effect in the eight -- `$263386`'s install --
 * writes `$8132CC`, `$8132D0`, `$815EA8` and protection slot `$1F`.  `$815EA8`
 * lies inside `$26331E`'s OWN range and is written after that range is zeroed;
 * `$8132CC`/`$8132D0` lie BELOW every one of the eight bases.  So no reset can
 * undo another's work in either order, and `$28131E`'s park survives because
 * nothing else writes `$817F8C..$81B41F`.  The order is transcribed anyway,
 * because the ROM's order is the thing being ported.
 */
export function rebuildWorld25FD38(ram, ctx) {
  wipeStageBlock25FD24(ram);                           // $25FD38 bsr $25FD24
  // $25FD3A -- the first reset is one dependency-closed operation: clear
  // `$81332C..$816B79`, then install the current stage through `$263386`.
  resetAndInstallStage26331E(ram, ctx.rom, ctx.unportedLog, ctx.prot,
    ctx.stageScriptInstallHook);
  const entryClock = ram.u16(SE.clockBase);
  ctx.stageEndEvent?.('spawn-install', ram.u32(0x8132cc));
  clearEffectPool(ram);                                 // $25FD40 jsr $288E0C
  clearSubEffectPool(ram);                              // $25FD46 jsr $289084
  clearPoolC289AE0(ram);                                // $25FD4C jsr $289AE0
  clearCuePool28AC3A(ram);                              // $25FD52 jsr $28AC3A
  clearSparkPool289F3A(ram);                            // $25FD58 jsr $289F3A
  clearItemPool(ram);                                   // $25FD5E jsr $27E98A
  clearBulletPool28131E(ram, ctx);                      // $25FD64 jsr $28131E ..
  parkBulletSlots281330(ram);                           //   ..and its second loop
  const r = stageCreate(ram, 1, (t) => ctx.rom.u16(SE.dispatch + t * 8 + 4));
  ram.setU32(SE.bgHandle, r.ok ? ram.u32(r.addr + ALLOC.idOff) : 0);   // $25FD74
  // $25FD7A writes zero. The hook-free path still does because $25FD24 cleared
  // this clock; Boss Rush instead seeds the matching accelerated entry point.
  ram.setU16(r.addr + 0x06, entryClock);
  return r;
}

// ------------------------------------------------------------------ $242952
/**
 * `$242952` -- THE STAGE ADVANCE.  Twenty-five instructions and the hinge of
 * the whole thing.
 *
 * `$242960 bclr #$4,$8130F8` is not cosmetic: bit 4 is one of the five gates on
 * `$25962E`'s DOUBLE PASS (`$259656 btst #$4`), so this instruction stops every
 * boss script being stepped twice a frame from here on.
 */
export function runStageAdvance242952(ram, rom, ctx) {
  // W152: `$28CB60 -> $28CB1A -> $28C146` is the real fixed-index streaming
  // leaf, now handled by the same production sound post API as normal wrappers.
  ctx.soundPost?.(0x28cb60);
  ram.setU8(SE.bossFlags, ram.u8(SE.bossFlags) | 0x08);    // $242958 bset #3
  ram.setU8(SE.bossFlags, ram.u8(SE.bossFlags) & ~0x10);   // $242960 bclr #4
  ram.setU16(SE.clearing, 1);                              // $242968
  playerBit5(ram, SE.p1);                                  // $242970..$242992
  playerBit5(ram, SE.p2);                                  // $242994..$2429B6
  const authenticNext = u16(ram.u16(SE.stage) + 1);             // $2429B8/$2429BE
  const d7 = ctx.stageAdvanceTransform
    ? u16(ctx.stageAdvanceTransform(authenticNext)) : authenticNext;
  // $242A30..$242A3E -- create OBJECT TYPE 6 and hand it the new stage number.
  const r = stageCreate(ram, SE.type6, (t) => rom.u16(SE.dispatch + t * 8 + 4));
  ram.setU16(r.addr + 0x04, d7);                           // $242A3A move.w D7,$4(A0)
  ctx.stageEndEvent?.('stage-advance', d7, r.result);
  return { d7, result: r.result };
}

/**
 * `$242970..$242992` and its P2 mirror `$242994..$2429B6`: `bset.b #$5` on the
 * player record's status word.  THREE tests, and the FIRST one's sense is the
 * trap:
 *
 *   242970: tst.w $8103E6
 *   242976: bmi.b  $24298C     <- NEGATIVE (bit 15 SET, i.e. the player is
 *                                 LIVE) jumps STRAIGHT TO THE BSET
 *   242978: btst.b #$0,$8103E6
 *   242980: beq.b  $242994     <- bit 0 CLEAR -> skip the bset entirely
 *   242982: btst.b #$7,$8103E7
 *   24298A: bne.b  $242994     <- bit 7 of the LOW byte SET -> skip
 *   24298C: bset.b #$5,$8103E6
 *
 * So a live player ALWAYS gets bit 5; the two `btst`s only decide what happens
 * to a record whose bit 15 is clear.  This was written the other way round
 * first -- `bmi` read as "branch if bit 15 is CLEAR" -- which sent every live
 * player down the btst chain and, in the shipped seed, skipped the bset on both.
 */
function playerBit5(ram, base) {
  const w = ram.u16(base);
  if ((w & 0x8000) !== 0) {                                // $242976 bmi
    ram.setU8(base, ram.u8(base) | 0x20);                  // $24298C bset #5
    return;
  }
  if ((ram.u8(base) & 0x01) === 0) return;                 // $242980 beq
  if ((ram.u8(base + 1) & 0x80) !== 0) return;             // $24298A bne
  ram.setU8(base, ram.u8(base) | 0x20);                    // $24298C bset #5
}

// ============================================================ OBJECT TYPE 6
//
// `$240F62[6] = $28D63C`, priority `$000A` (read out of the cartridge, and the
// port now reads the same word through `RomWindows` rather than carrying it as
// a literal).  `($2,A5)` is the PHASE byte, `($4,A5)` the stage number
// `$242952` handed it, `($6,A5)` the STATE and `($7,A5)` a frame counter.

/** `$28D566` -- type 6's INIT.  Eight clears and one destruction. */
function init28D566(ram, a5, ctx) {
  ram.setU8(a5 + 0x02, 1);                             // $28D566
  ram.setU8(a5 + 0x06, 0);                             // $28D56C -- state 0
  ram.setU8(a5 + 0x07, 4);                             // $28D572 -- four frames
  clear24631C(ram);                                    // $28D578
  clear28D552(ram);                                    // $28D57E bsr
  clear287DC8(ram);                                    // $28D580
  ram.setU8(SE.df1e, ram.u8(SE.df1e) | 0x01);          // $28D586 bset #0
  ram.setU8(SE.df1e, ram.u8(SE.df1e) | 0x08);          // $28D58E bset #3
  clear28E7A2(ram);                                    // $28D596
  ram.setU16(SE.df20, 1);                              // $28D59C
  ram.setU16(SE.df22, 1);                              // $28D5A4
  for (let i = 0; i < 4; i++) ram.setU16(SE.hud + i * 2, 0);   // $28D5AC..$28D5BE
  clear23C47A(ram);                                    // $28D5C4
  ram.setU16(0x813186, 0);                             // $28D5CA jsr $260EBE
  init28EC86(ram);                                     // $28D5D0
  bgDestroy25FCFA(ram);                                // $28D5D6 -- **THE KILL**
  ram.setU16(SE.advanceFlag, 1);                       // $28D5DC
  ctx.stageEndEvent?.('bg-destroyed', ram.u32(SE.bgHandle), null);
}

/** `$28D5E6` -- type 6 destroys itself: two clears and `jmp $241292`, which is
 *  `lea $4C(a5),A0 / bra $241238` -- the same deferred kill by ID. */
function destroy28D5E6(ram, a5) {
  ram.setU16(SE.df1e, 0);                              // $28D5E6
  ram.setU16(SE.df20, 0);                              // $28D5EC
  queueKill(ram, ram.u32(a5 + ALLOC.idOff));           // $28D5F2 jmp $241292
}

// --- the eight small clears, each read out of the ROM this wave

/** The complete `$24631C..$24636B` animation-object pool reset. W460. */
export const CLEAR24631C = Object.freeze({
  entry: 0x24631c, end: 0x24636c, bytes: 0x50,
  nodeBase: 0x80fa86, clearWords: 0x4b0,
  rootBase: 0x810346, rootCount: 3, rootStride: 0x30,
  nodeCount: 20, nodeStride: 0x70,
});

/**
 * `$24631C`, exactly `[$24631C,$24636C)`. The first DBRA clears `$4B0` contiguous
 * words at `$80FA86..$8103E5`. The following two DBRA loops deliberately rewrite
 * fields inside that already-cleared span: three root records clear `+0.W`,
 * `+4.W`, and `+$2C.L`; twenty node records clear `+0.W` and `+$2C.L`.
 *
 * The cartridge owns A0, D0, D7, and NZVC on return, with X preserved. No source
 * caller models or observes those register results; W460 pins every continuation.
 */
export function clear24631C(ram) {
  const C = CLEAR24631C;
  for (let i = 0; i < C.clearWords; i++) {             // $246322 #$4AF + DBRA = $4B0
    ram.setU16(C.nodeBase + i * 2, 0);                 // $246326 move.w #$0,(A0)+
  }
  for (let i = 0; i < C.rootCount; i++) {              // $24632E moveq #$2
    const a = C.rootBase + i * C.rootStride;            // $246346 lea ($30,A0),A0
    ram.setU16(a, 0);                                   // $246336 clr.w (A0)
    ram.setU16(a + 4, 0);                               // $246338 move.w #$0,($4,A0)
    ram.setU32(a + 0x2c, 0);                            // $24633E move.l #$0,($2C,A0)
  }
  for (let i = 0; i < C.nodeCount; i++) {              // $24634E move.w #$13,D7
    const a = C.nodeBase + i * C.nodeStride;            // $246362 lea ($70,A0),A0
    ram.setU16(a, 0);                                   // $246358 clr.w (A0)
    ram.setU32(a + 0x2c, 0);                            // $24635A move.l #$0,($2C,A0)
  }
}

// Build A $1459FA is the independently paired routine with the same RAM roots,
// loop bounds, and store widths. The alias records shared behavior, not code.
export const clear1459FA = clear24631C;
function clear28D552(ram) {
  for (let i = 0; i <= SE.resultWords; i++) ram.setU16(SE.result + i * 2, 0);
}
function clear287DC8(ram) {
  for (let a = 0x81b5b6; a !== 0x81b60c; a += 2) ram.setU16(a, 0);   // $287DD2 cmpa.l
}
function clear287DDC(ram) {
  for (let a = 0x81b60c; a !== 0x81b632; a += 2) ram.setU16(a, 0);   // $287DE6 cmpa.l
}
export function clear28E7A2(ram) {
  for (let i = 0; i <= 0x27; i++) ram.setU16(SE.banner + i * 2, 0);
}
/** `$23C47A` -- six `clr.w` over `$80392E..$803939`. Exported because slot [9]'s seeder
 *  `$25C8A2` calls it too (`$25C8C2 jsr $23C47A`); a second transcription in `objslot9.js`
 *  would be free to drift from this one. */
export function clear23C47A(ram) {
  for (let i = 0; i < 6; i++) ram.setU16(0x80392e + i * 2, 0);
}
function clear27F8C4(ram) {
  ram.setU16(0x817f80, 0);                             // $27F8C6
  for (const a of [0x817f84, 0x817f86, 0x817f88, 0x817f8a]) ram.setU16(a, 0);
}
/** `$28EC86` -- the stage-clear BANNER's counters.  Recon 49 9 could not say
 *  how many frames `$28ECCE`'s state 0 lasts; this routine is the answer's
 *  other half and it is called from `$28D566`, sixteen instructions earlier. */
function init28EC86(ram) {
  for (let i = 0; i < 5; i++) ram.setU16(SE.e024 + i * 2, 0);   // $28EC8C moveq #$4
  ram.setU16(SE.e026, 0x0707);                         // $28EC98
  ram.setU16(SE.e028, 0x0007);                         // $28ECA0
  ram.setU16(SE.e02a, 0x0004);                         // $28ECA8
}

/**
 * `$28ECCE` -- THE BANNER SEQUENCER, and the gate on state 0 -> state $A.
 * Returns the C flag: TRUE (C=1) means "not finished".
 *
 * Recon 49 9 lists this routine's exit condition as undetermined.  It is
 * determined here, from `$28EC86`'s seeds: state 1 spends `$81E02A` = 4 ticks
 * of `$81E026` = 8 frames each; state 2 spends a `$20`-byte countdown, i.e. 33
 * more; and the state-0 frame does its own work AND state 1's first tick,
 * because `$28ECFC` is a fall-through and not an `else`.
 */
export function bannerStep28ECCE(ram, ctx) {
  if (ram.u16(SE.e024) === 0) {                        // $28ECCE cmpi.w #$0
    ram.setU16(SE.e024, 1);                            // $28ECDA
    loadBannerArt(ram, ctx);                      // $28ECE2..$28ECF6
  }
  if (ram.u16(SE.e024) === 1) {                        // $28ECFC
    ram.setU16(SE.e028, u16(ram.u16(SE.e028) - 1));    // $28ED08 subq.w
    const b = ram.u8(SE.e026);                         // $28ED0E subq.b #$1
    ram.setU8(SE.e026, (b - 1) & 0xff);
    if (b === 0) {                                     // bcc -> $28ED64 while b != 0
      ram.setU8(SE.e026, ram.u8(SE.e026 + 1));         // $28ED18 -- from $81E027
      ram.setU16(SE.e028, 7);                          // $28ED22
      ram.setU16(SE.e02a, u16(ram.u16(SE.e02a) - 1));  // $28ED2A
      loadBannerArt(ram, ctx);                    // $28ED30..$28ED44
      if (ram.u16(SE.e02a) === 0) {                    // $28ED4A tst.w/bne
        ram.setU8(SE.e026, 0x20);                      // $28ED54
        ram.setU16(SE.e024, 2);                        // $28ED5C
      }
    }
  }
  if (ram.u16(SE.e024) === 2) {                        // $28ED64
    if (ram.u16(SE.e028) !== 0) {                      // $28ED70 tst.w/beq
      ram.setU16(SE.e028, u16(ram.u16(SE.e028) - 1));  // $28ED7A
    }
    const b = ram.u8(SE.e026);                         // $28ED80 subq.b #$1
    ram.setU8(SE.e026, (b - 1) & 0xff);
    if (b === 0) {                                     // bcc while b != 0
      ram.setU16(SE.e02c, 1);                          // $28ED8A
      return false;                                    // $28ED9C andi #$FFFE,sr
    }
  }
  return true;                                         // $28ED96 ori.w #$1,sr
}

/** `$28ECB2` + the `$24150A` that follows it, at both of `$28ECCE`'s call
 *  sites.  `$28ECB2` indexes `$28EDA2` by `$813096` (stage x4) to a per-stage
 *  RAM byte list, walks it BACKWARDS from `+7` by `$81E02A`, and the byte
 *  chooses one of five ART PAIRS at `$28EE1E`. */
function loadBannerArt(ram, ctx) {
  const listBase = 0x81dffc;                           // $28EDA2[0]
  const list = listBase + (ram.u16(SE.stageX4) >> 2) * 8;
  const d0 = ram.u8(list + 7 - ram.u16(SE.e02a));      // $28ECC2/$28ECC4/$28ECCA
  // $28ECE4..$28ECF6, and the same five instructions again at $28ED32..$28ED44:
  // `lsl.w #$3,D0` into $28EE1E, `movea.l $4(a0),a0` -- the pair's SECOND longword,
  // which is a 64-byte PALETTE -- and `move.w #$17,D0`, the bank.
  //
  // W236: $24150A is `install24150A`, which this port has had since W91. The note
  // that stood here called it "data" and counted it; it is a palette install and
  // the installer was already imported in this file, so the banner's colours land.
  // `ctx.rom`, not a `rom` parameter: `bannerStep28ECCE` is exported and its two
  // callers do not pass one.
  const src = ctx.rom.u32(0x28ee1e + (d0 << 3) + 4);   // $28ECEE movea.l $4(a0)
  if (ctx.palette) {
    install24150A(ram, ctx.palette, 0x17, ctx.rom.bytes(src, 64), 0x28ecf6,
      `the stage-clear banner's palette, entry [${d0}] of $28EE1E`);
  }
}

// ------------------------------------------------------------- the deviation
/** **EMPTY.  BOTH INVENTED TRANSITIONS ARE GONE.**  Kept as an export so the
 *  tests that count it keep counting, and so the next reader can see that the
 *  number is zero rather than merely absent.
 *
 *  W124 CLEARED DEV-1 (`$28DE5C`): the result-screen phase machine `$28D9AA`
 *  and the HUD tally `$285400` are now ported (see `result28D9AA` and
 *  `tally2853D2`), so `$8130F9` bit 1 has its real sole producer `$285496` and
 *  F8 advances on it naturally. The manual `bset #1` stand-in is gone.
 *
 *  **W435 CLEARED DEV-2 (`$28D6FC`), AND W125'S DIAGNOSIS WAS RIGHT ABOUT THE
 *  MECHANISM AND WRONG ABOUT WHAT WAS MISSING.**  W125 wrote that "the
 *  animation-object EXECUTION engine ... is the TRUE remaining gap, and it is
 *  the deep presentation tier five waves have deferred".  That engine is
 *  `animobjects.js runAnimObjects24683E`, **main-loop call #3, ported since
 *  W91 and running every frame.**  What was actually missing was the input it
 *  needs: `chainLoaderBody` was seeding `$24652A`'s chains WITHOUT their
 *  per-node content, so `($6,node)` -- the executor pointer -- stayed zero and
 *  `runAnimObjects24683E` skipped every node it built.  The chain therefore
 *  never drained, and state $B was written to ignore `$28D702`'s `bne` and
 *  advance on its first frame.
 *
 *  Both halves are now in: `CHAIN_LOADERS[0].content` is `CHAIN_CONTENT_24652A`
 *  (`$246582..$2465D9`, decoded in W389 and unused until now) and state $B
 *  honours the `bne`.  [M] Neither half works alone -- seeding without the
 *  branch changes nothing, and the branch without the seeding hangs the stage
 *  end forever.  See W435's entry. */
export const PRESENTATION_DEVIATION = Object.freeze({});

// ============================================================================
// W124: THE RESULT SCREEN `$28D9AA`, THE ANIM CHAIN, THE BANNER `$28E7F8`
// ============================================================================
// A6 = `$81DEBE` = `SE.result` (reloaded by every caller).  `$2(a6)` = `$81DEC0`
// is the FOUR-bit phase byte (bit0 F0, bit1 F4, bit2 F1, bit3 F6).  The GLOBAL
// handshake lives in `$8130F9` (bit1 tally-done `$285496`, bit2 medal-walk-done
// `$28DE16`, bit3 slide-in-done `$28DB52`).  A5 is the type-6 object slot, read
// in the F8 advance tail.  See `123-recon-result-screen.md` for the phase map.

/** ROM data tables the phase machine and banner read (build B, file offset). */
const RESULT_ROM = {
  protoF2: 0x28e646,      // $28DA70 lea (PC) -- 18-byte position prototype
  slideTable: 0x28e698,   // $28DAD6 lea (PC) -- 39-word slide-in delta table
  slideEnd: 0x28e6e6,     // $28DB16 cmpa.l -- the table's end marker
  medalA: 0x28e6e8,       // $28DDC0 lea (PC) -- 23-word medal counter tables
  medalB: 0x28e718,       // $28DDD4 lea (PC)
  medalC: 0x28e748,       // $28DDE2/$28DDEE lea (PC)
  medalEnd: 0x28e716,     // $28DE00 cmpa.l -- medalA's end marker
  animScript: 0x28d862,   // $28DE5C lea (PC) -- the 8-node fly-away script
  bannerSlideOut: 0x28ea58, // $28EA0A lea (PC) -- 16-longword banner template
  bannerSlideIn: 0x28e86e,  // $28E820 lea (PC)
  bannerDfecOut: 0x28ea54,  // $28EA1A lea (PC) -- 2-word seed for $81DFEC
  bannerDfecIn: 0x28e868,   // $28E830 lea (PC)
};

/** The bonus-pool and tick fields inside the result buffer (offsets from A6). */
const RF = {
  phase: 0x02, f1cnt: 0x04, slide: 0x06,
  p1x: 0x08, p1y: 0x0a, p2x: 0x0c, p2y: 0x0e, clamp16: 0x16,
  p1beeBcd: 0x18, p1bee: 0x1a, p1itemBcd: 0x1c, p1item: 0x1e,
  p2beeBcd: 0x22, p2bee: 0x24, p2itemBcd: 0x26, p2item: 0x28,
  hold: 0x2c, medal: 0x3e,
  m0: 0x4c, m1: 0x4e, m2: 0x50, m3: 0x52,
};

/** `$81DF24` (P1) / `$81DF26` (P2) -- the three-step bonus-cue throttle. */
const CUE_TIMER = { p1: 0x81df24, p2: 0x81df26 };

/**
 * `$28D9AA` -- THE RESULT SCREEN, eight phases on `SE.result`.  One phase step
 *  per call (the ROM `rts`es out of whichever arm runs); type 6 calls this every
 *  frame from states $A / 1 / $B / $15.  The art/palette/draw calls are NOTES
 *  (R2b); the score arithmetic, the slide-in table walk, the bonus tick and the
 *  `$8130F9` handshake are REAL. */
export function result28D9AA(ram, rom, ctx, a5) {
  const a6 = SE.result;
  const ph = () => ram.u8(a6 + RF.phase);
  // ---- F0 ART INSTALL
  if ((ph() & 0x01) === 0) {                                // $28D9AA btst #0
    ram.setU8(a6 + RF.phase, ph() | 0x01);                  // $28D9B4 bset #0
    ram.setU8(SE.df1e, ram.u8(SE.df1e) | 0x02);             // $28D9BA bset #1
    ram.setU16(0x813172, 0);                                // $28D9C4 camera zero
    ram.setU16(0x813176, 0);                                // $28D9C9
    // $28D9C4..$28DA3A -- seven `$24150A` resource installs (sprite palette
    // banks $11/$12/$13/$14/$15/$16/$10, six ROM sources).  W125 promotes the
    // R2a note to the real `install24150A`; guarded on `ctx.palette` because a
    // bare-RAM test fixture has no palette state (background.js's own pattern).
    if (ctx.palette) {
      const art = (src, bank) => install24150A(ram, ctx.palette, bank,
        rom.bytes(src, 64), 0x28d9c4, `F0 result-screen art bank $${bank.toString(16)}`);
      art(0x2254b8, 0x11);                                   // $28D9D0/$28D9DA
      art(0x2255b8, 0x12);                                   // $28D9E0/$28D9EA
      art(0x2255f8, 0x13);                                   // $28D9F0/$28D9FA
      art(0x225638, 0x14);                                   // $28DA00/$28DA0A
      art(0x225678, 0x15);                                   // $28DA10/$28DA1A
      art(0x225878, 0x16);                                   // $28DA20/$28DA2A
      art(0x2255b8, 0x10);                                   // $28DA30/$28DA3A
    } else {
      note(ctx, 0x24150a, '$28D9C4..$28DA3A seven jsr $24150A -- result-screen art '
        + 'install (banks $11..$16,$10); skipped, no ctx.palette');
    }
    return;                                                 // $28DA40 rts
  }
  // ---- F1 PALETTE CUE
  if ((ph() & 0x04) === 0) {                                // $28DA42 btst #2
    ram.setU8(a6 + RF.phase, ph() | 0x04);                  // $28DA4C bset #2
    ram.setU16(a6 + RF.f1cnt, 1);                           // $28DA52 $4 := 1
    // W240: $23C638 is not a "palette cue" -- it is `lea $900000` and 4096 longword
    // clears, i.e. the BG TILEMAP RING, which this port models as a 64x16 window.
    // Clearing it is what takes the ground away on a stage clear.
    if (ctx.vram) ctx.vram.clear23C638();                     // $28DA58 jsr $23C638
    else note(ctx, 0x23c638, '$28DA58 jsr $23C638 -- the $900000 ring clear; no '
      + 'ctx.vram in this fixture, so counted');
    note(ctx, 0x23c63e, '$23C638 clears $4000 bytes of $900000 and this ring models '
      + 'the $1000-byte 64x16 window; the remainder is outside what the port reads');
    return;                                                 // $28DA5E rts
  }
  // ---- F2 SPRITE-INIT (one frame, when $4(a6) drains 1->0)
  if (ram.u16(a6 + RF.f1cnt) !== 0) {                       // $28DA60 tst/beq F3
    const n = u16(ram.u16(a6 + RF.f1cnt) - 1);              // $28DA68 subq
    ram.setU16(a6 + RF.f1cnt, n);
    if (n !== 0) return;                                    // $28DA6C bne rts
    f2SpriteInit28DA70(ram, rom);                           // $28DA70..$28DACC
    return;
  }
  // ---- F3 SLIDE-IN (walks the 39-word table, ends $28DB52 bset #3)
  if ((ram.u16(a6 + RF.slide) & 0x8000) === 0) {            // $28DACE tst/bmi F4
    f3SlideIn28DACE(ram, rom, ctx);
    return;                                                 // -> $28DED8 draw (noted)
  }
  // ---- F4 BONUS-POOL INIT (once, when bit1 of phase is clear)
  if ((ph() & 0x02) === 0) {                                // $28DB5E bset #1/bne F5
    f4BonusPool28DB5E(ram, rom, ctx);
    return;                                                 // $28DC16 rts
  }
  // ---- F5 HOLD + DRAW  (W125: the draws are REAL; the $2c countdown is real)
  draw1_28DED8(ram, rom);                                    // $28DC18 bsr $28DED8
  draw2_28E1AC(ram, rom);                                    // $28DC1C bsr $28E1AC
  if (ram.u16(a6 + RF.hold) !== 0) {                        // $28DC20 tst/beq F6
    ram.setU16(a6 + RF.hold, u16(ram.u16(a6 + RF.hold) - 1));  // $28DC26 subq
    return;                                                 // $28DC2A rts
  }
  // ---- F6 BEE/ITEM TICK ($2c == 0); credits $50 per drain step via $286128
  if ((ph() & 0x08) === 0) {                                // $28DC2C btst #3(local)
    f6BonusTick28DC2C(ram, ctx);
    return;                                                 // $28DDAE rts
  }
  // ---- F7 MEDAL WALK (three tables; ends $28DE16 bset #2) -- falls into F8
  if ((ram.u16(a6 + RF.medal) & 0x8000) === 0) {            // $28DDB0 tst/bmi F8
    f7MedalWalk28DDB0(ram, rom);                            // may set $8130F9 bit 2
  }
  // ---- F8 EXIT HANDSHAKE (waits for $8130F9 bit 1, then advances type 6)
  if ((ram.u8(SE.bossFlags9) & 0x02) === 0) return;         // $28DE1E btst #1/beq rts
  f8Exit28DE1E(ram, rom, ctx, a5);                          // $28DE2A..$28DE78
}

/** `$28DA70..$28DACC` -- F2 sprite-init: copy the 18-byte prototype and seed the
 *  six art pointer longwords at `$3A..$58(a6)`.  RAM-only; no notes. */
function f2SpriteInit28DA70(ram, rom) {
  const a6 = SE.result;
  for (let i = 0; i < 4; i++) {                             // $28DA7A move.l x4
    ram.setU32(a6 + 0x06 + i * 4, rom.u32(RESULT_ROM.protoF2 + i * 4));
  }
  ram.setU16(a6 + 0x16, rom.u16(RESULT_ROM.protoF2 + 16));  // $28DA82 move.w
  ram.setU32(a6 + 0x3a, 0x000a0000);                        // $28DA84
  ram.setU32(a6 + 0x40, 0x4d001c00);                        // $28DA8C
  ram.setU32(a6 + 0x44, 0x2d001c00);                        // $28DA94
  ram.setU32(a6 + 0x48, 0x0e001c00);                        // $28DA9C
  ram.setU16(a6 + 0x4c, 0); ram.setU16(a6 + 0x4e, 0);       // $28DAA4..$28DAB2
  ram.setU16(a6 + 0x50, 0); ram.setU16(a6 + 0x52, 0);
  ram.setU32(a6 + 0x54, 0x001bcd0c);                        // $28DABC
  ram.setU32(a6 + 0x58, 0x001be60c);                        // $28DAC4
}

/** `$28DACE..$28DB5A` -- F3 slide-in: walk the delta table, then the P1/P2
 *  live-player clamps, then `$28DB52 bset #3,$8130F9` when the table ends. */
function f3SlideIn28DACE(ram, rom, ctx) {
  const a6 = SE.result;
  const idx = ram.u16(a6 + RF.slide);                       // $28DADC move.w $6,d1
  const d0 = (idx < (RESULT_ROM.slideEnd - RESULT_ROM.slideTable))
    ? rom.u16(RESULT_ROM.slideTable + idx) : 0;             // $28DAE0 (a0,d1.w)
  ram.setU16(a6 + RF.p1x, u16(ram.u16(a6 + RF.p1x) - d0));  // $28DAE4 sub $8
  ram.setU16(a6 + RF.p2x, u16(ram.u16(a6 + RF.p2x) + d0));  // $28DAE8 add $c
  ram.setU16(a6 + RF.slide, u16(idx + 2));                  // $28DAEC addq #2
  // $28DAF2..$28DB12 -- the $16(a6) sub-pixel clamp, then the P2 mirror on $a/$e
  let d0b = d0;
  if (ram.u16(a6 + RF.clamp16) !== 0) {                     // $28DAF2 tst/beq
    const before = ram.u16(a6 + RF.clamp16);
    const after = u16(ram.u16(a6 + RF.clamp16) - d0);       // $28DAF8 sub
    ram.setU16(a6 + RF.clamp16, after);
    if (after === 0) {                                      // $28DAFC beq
      // fall through with d0 unchanged
    } else if ((before & 0x8000) === 0 && (after & 0x8000) !== 0) { // $28DAFE bcc
      // crossed through zero: clamp the remainder
      d0b = u16(-(before & 0xffff));                        // $28DB00 neg
      ram.setU16(a6 + RF.clamp16, 0);                       // $28DB06 clr
    } else {
      d0b = 0;                                              // $28DB0C bra (no mirror)
    }
  }
  if (d0b !== 0) {
    ram.setU16(a6 + RF.p1y, u16(ram.u16(a6 + RF.p1y) - d0b));  // $28DB0E sub $a
    ram.setU16(a6 + RF.p2y, u16(ram.u16(a6 + RF.p2y) + d0b));  // $28DB12 add $e
  }
  // $28DB16 cmpa.l #$28E6E6,a0 -- a0 is base+OLD-idx; the table ends at base+78.
  const tblBytes = RESULT_ROM.slideEnd - RESULT_ROM.slideTable;
  if (idx >= tblBytes) ram.setU16(a6 + RF.slide, 0xffff);   // $28DB1E
  // $28DB24..$28DB46 -- P1/P2 live clamps
  if ((ram.u16(SE.p1) & 0x8000) === 0) {                    // $28DB24 tst/bmi
    ram.setU16(a6 + RF.p1x, 0);                             // $28DB2C
    ram.setU16(a6 + RF.p1y, 0);                             // $28DB32
  }
  if ((ram.u16(SE.p2) & 0x8000) === 0) {                    // $28DB38 tst/bmi
    ram.setU16(a6 + RF.p2x, 0x40);                          // $28DB40
    ram.setU16(a6 + RF.p2y, 0x40);                          // $28DB46
  }
  if ((ram.u16(a6 + RF.slide) & 0x8000) !== 0) {            // $28DB4C tst/bpl
    ram.setU8(SE.bossFlags9, ram.u8(SE.bossFlags9) | 0x08); // $28DB52 bset #3
  }
  draw1_28DED8(ram, rom);                                    // $28DB5A bra $28DED8 (draw1 only)
}

/** `$28DB5E..$28DC16` -- F4 bonus-pool init: read bee/item counts, BCD-convert,
 *  seed the four pools, set `$2c(a6)`. */
function f4BonusPool28DB5E(ram, rom, ctx) {
  const a6 = SE.result;
  ram.setU8(a6 + RF.phase, ram.u8(a6 + RF.phase) | 0x02);   // $28DB5E bset #1
  let anyLive = 0;                                          // $28DB6E moveq #0,d7
  if ((ram.u16(SE.p1) & 0x8000) !== 0) {                    // $28DB70 tst/bpl
    const bee = ram.u16(0x817f84), item = ram.u16(0x817f86); // $28DB78/$28DB7E
    if ((bee + item) !== 0) {                               // $28DB84 beq
      anyLive = 1;                                          // $28DB86 moveq #1
      ram.setU16(a6 + RF.p1beeBcd, bcd242AC6(item) & 0xffff); // $28DB88/$28DB96
      ram.setU16(a6 + RF.p1bee, u16(item * 10));            // $28DB9A mulu #$a
      ram.setU16(a6 + RF.p1itemBcd, bcd242AC6(bee) & 0xffff); // $28DBA2/$28DBB0
      ram.setU16(a6 + RF.p1item, u16(bee * 20));            // $28DBB4 mulu #$14
    }
  }
  if ((ram.u16(SE.p2) & 0x8000) !== 0) {                    // $28DBBC tst/bpl
    const bee = ram.u16(0x817f88), item = ram.u16(0x817f8a); // $28DBC4/$28DBCA
    if ((bee + item) !== 0) {                               // $28DBD0 beq
      // NOTE: $28DBD0 reads the LONGWORD $817F88 into D0 for the beq test, which
      // is bee|item as one 32-bit value -- equivalent to the sum test above.
      anyLive = 1;                                          // $28DBD8
      ram.setU16(a6 + RF.p2beeBcd, bcd242AC6(item) & 0xffff); // $28DBDA/$28DBE8
      ram.setU16(a6 + RF.p2bee, u16(item * 10));            // $28DBEC mulu #$a
      ram.setU16(a6 + RF.p2itemBcd, bcd242AC6(bee) & 0xffff); // $28DBF4/$28DC02
      ram.setU16(a6 + RF.p2item, u16(bee * 20));            // $28DC06 mulu #$14
    }
  }
  ram.setU16(a6 + RF.hold, anyLive !== 0 ? 0x18 : 0x04);    // $28DC0E/$28DC12
  draw1_28DED8(ram, rom);                                    // $28DC18 bsr $28DED8
  draw2_28E1AC(ram, rom);                                    // $28DC1C bsr $28E1AC
}

/** `$28DC2C..$28DDAE` -- F6 bee/item tick: drain the four pools by 5 each,
 *  credit `$50` per step via `$286128` (scoreByMask), throttle the bonus cue
 *  through `$81DF24`/`$81DF26`. A fresh P1/P2 action-button edge converts that
 *  side's remaining pools in one native packed-BCD award. When all four are
 *  empty, set the local F6 bit and reload `$2c(a6) := 8` (or 1 if
 *  `$81B610 == 0`). */
function f6BonusTick28DC2C(ram, ctx) {
  const a6 = SE.result;
  let credited = 0;                                         // $28DC36 moveq #0,d7
  // ---- P1
  let d6 = u16(ram.u16(a6 + RF.p1bee) + ram.u16(a6 + RF.p1item)); // $28DC38/$28DC3C
  if (d6 !== 0) {                                           // $28DC40 beq P2
    const input = ram.u16(RAM.p1edge);                      // $28DC44 jsr $23D186
    if ((input & 0x70) !== 0) {                             // $28DC4A/$28DC4E
      const bonus = (bcd242AC6(d6) << 4) >>> 0;             // $28DC50..$28DC5A
      ram.setU16(a6 + RF.p1bee, 0);                         // $28DC5C
      ram.setU16(a6 + RF.p1item, 0);                        // $28DC60
      scoreByMask(ram, bonus, 0x10);                        // $28DC64 -> $28DCB0/$28DCB6
      credited = 1;
    } else {
      let p1Credited = false;
      if (ram.u16(a6 + RF.p1bee) !== 0) {                   // $28DC68 tst/beq
        ram.setU16(a6 + RF.p1bee, u16(ram.u16(a6 + RF.p1bee) - 5)); // $28DC6E subq #5
        scoreByMask(ram, 0x50, 0x10);                       // $28DC74/$28DC7A jsr $286128
        p1Credited = true;
      }
      if (ram.u16(a6 + RF.p1item) !== 0) {                  // $28DCA4 tst/beq
        ram.setU16(a6 + RF.p1item, u16(ram.u16(a6 + RF.p1item) - 5)); // $28DCAA
        scoreByMask(ram, 0x50, 0x10);                       // $28DCB6 jsr $286128
        p1Credited = true;
      }
      if (p1Credited) {
        credited = 1;                                       // $28DC74/$28DCB0 moveq #1,d7
        throttledBonusCue(ram, ctx, CUE_TIMER.p1);           // $28DC80..$28DCDE
      }
    }
  }
  // ---- P2
  d6 = u16(ram.u16(a6 + RF.p2bee) + ram.u16(a6 + RF.p2item));
  if (d6 !== 0) {                                           // $28DCEC beq done
    const input = ram.u16(RAM.p2edge);                      // $28DCF0 jsr $23D18E
    if ((input & 0x70) !== 0) {                             // $28DCF6/$28DCFA
      const bonus = (bcd242AC6(d6) << 4) >>> 0;             // $28DCFC..$28DD06
      ram.setU16(a6 + RF.p2bee, 0);                         // $28DD08
      ram.setU16(a6 + RF.p2item, 0);                        // $28DD0C
      scoreByMask(ram, bonus, 0x08);                        // $28DD10 -> $28DD5C/$28DD62
      credited = 1;
    } else {
      let p2Credited = false;
      if (ram.u16(a6 + RF.p2bee) !== 0) {                   // $28DD14 tst/beq
        ram.setU16(a6 + RF.p2bee, u16(ram.u16(a6 + RF.p2bee) - 5)); // $28DD1A
        scoreByMask(ram, 0x50, 0x08);                       // $28DD26 jsr $286128
        p2Credited = true;
      }
      if (ram.u16(a6 + RF.p2item) !== 0) {                  // $28DD50 tst/beq
        ram.setU16(a6 + RF.p2item, u16(ram.u16(a6 + RF.p2item) - 5)); // $28DD56
        scoreByMask(ram, 0x50, 0x08);                       // $28DD62 jsr $286128
        p2Credited = true;
      }
      if (p2Credited) {
        credited = 1;
        throttledBonusCue(ram, ctx, CUE_TIMER.p2);           // $28DD2C..$28DD8A
      }
    }
  }
  if (credited !== 0) return;                               // $28DD90 tst/bne rts
  // All four pools empty: latch local F6 and reload the hold.
  ram.setU8(a6 + RF.phase, ram.u8(a6 + RF.phase) | 0x08);   // $28DD94 bset #3
  ram.setU16(a6 + RF.hold, ram.u16(0x81b610) !== 0 ? 0x08 : 0x01); // $28DD9A..$28DDAA
}

/** Result-screen bonus cue throttle, updated once per credited player and frame.
 *  The imported sound poster has no arithmetic; callers already credit their BCD values. */
function throttledBonusCue(ram, ctx, timerAddr) {
  if (ram.u16(timerAddr) !== 0) {                           // tst.w/beq
    ram.setU16(timerAddr, u16(ram.u16(timerAddr) - 1));     // subq.w #1
    return;
  }
  ram.setU16(timerAddr, 3);                                 // move.w #$3
  note28C6C6(ctx);
}

/** `$28DDB0..$28DE16` -- F7 medal walk: add the three per-index tables to the
 *  four medal counters; when the index ends, set `$8130F9` bit 2. */
function f7MedalWalk28DDB0(ram, rom) {
  const a6 = SE.result;
  const idx = ram.u16(a6 + RF.medal);                       // $28DDC8 move.w $3e
  const inRange = idx < (RESULT_ROM.medalEnd - RESULT_ROM.medalA);
  if (inRange) {
    ram.setU16(a6 + RF.m0, u16(ram.u16(a6 + RF.m0)
      + rom.u16(RESULT_ROM.medalA + idx)));                 // $28DDCC/$28DDD0
    ram.setU16(a6 + RF.m1, u16(ram.u16(a6 + RF.m1)
      + rom.u16(RESULT_ROM.medalB + idx)));                 // $28DDDA/$28DDDE
    const mc = rom.u16(RESULT_ROM.medalC + idx);
    ram.setU16(a6 + RF.m2, u16(ram.u16(a6 + RF.m2) + mc));  // $28DDE6/$28DDEA
    ram.setU16(a6 + RF.m3, u16(ram.u16(a6 + RF.m3) + mc));  // $28DDF2/$28DDF6
  }
  ram.setU16(a6 + RF.medal, u16(idx + 2));                  // $28DDFA addq #2
  if (idx >= (RESULT_ROM.medalEnd - RESULT_ROM.medalA)) {   // $28DE00 cmpa/bne
    ram.setU16(a6 + RF.medal, 0xffff);                      // $28DE08
  }
  if ((ram.u16(a6 + RF.medal) & 0x8000) !== 0) {            // $28DE0E tst/bpl
    ram.setU8(SE.bossFlags9, ram.u8(SE.bossFlags9) | 0x04); // $28DE16 bset #2
  }
}

/** `$28DE1E..$28DE78` -- F8 exit handshake. Once `$8130F9` bit 1 is set,
 *  ordinary stages load the fly-away chain and enter state `$B`. Stage 5 enters
 *  state `$15` and stages object type `$13`, whose handler owns the ending tally
 *  and handoff to object type 7. */
function f8Exit28DE1E(ram, rom, ctx, a5) {
  const st = ram.u8(a5 + 0x06);                             // $28DE2A cmpi.b #$b
  if (st === 0x0b || st === 0x15) return;                   // $28DE30/$28DE38 beq rts
  if (ram.u16(a5 + 0x04) === 5) {                           // $28DE3A cmpi.w #$5
    // $28DE44's `lea $28D8C4(PC),A0` is overwritten inside `$241182`; type $13
    // reads that script itself at $28EEC6. The live effects here are the state
    // store, type-$13 create, and the shared sound post at $28DE70.
    ram.setU8(a5 + 0x06, 0x15);                              // $28DE48
    const r = stageCreate(ram, SE.type13,
      (t) => rom.u16(SE.dispatch + t * 8 + 4));              // $28DE4E/$28DE52
    ctx.stageEndEvent?.('ending-created', r.addr, r.result);
    ctx.soundPostD1?.(0x28c186, 0);                          // $28DE58 bra / $28DE70/$28DE72
    return;
  }
  // $28DE5C lea $28D862(PC),A0; $28DE60 move.b #$B,$6(A5); $28DE66 jsr $24652A
  ram.setU8(a5 + 0x06, 0x0b);                               // $28DE60
  // W448: `chainLoader24652A` was this file's own transcription of `$246532`. The survivor
  // is `animobjects.js loadAnimObjects24652A`, and THE HANDLE IT RETURNS ON FAILURE IS NOW
  // `$FFFFFFFF` FROM BOTH ARMS -- which is what `$246608 moveq #-$1,D0` stores into `($8,A5)`.
  const handle = loadAnimObjects24652A(ram, rom, RESULT_ROM.animScript); // $28DE66
  ram.setU32(a5 + 0x08, handle >>> 0);                      // $28DE6C move.l D0,$8(A5)
  // W426 -- A REAL POST, NOT A COUNTED NOTE. `$28C186` is `$28C170`'s sibling in
  // the `$28BBAC` tier; W423 built that tier's packer and W425 wired `$28C170`
  // to it, but `$28C186` needed the caller's D1 and had nowhere to hand it in.
  // `ctx.soundPostD1` is that hand-in. D1 IS READ OFF THE IMAGE, not assumed:
  // `$28DE6C: 2B40 0008` / `$28DE70: 7200` (moveq #0,D1) / `$28DE72: 4EB9 0028
  // C186`. So the result screen's exit handshake posts $16000000.
  ctx.soundPostD1?.(0x28c186, 0);                           // $28DE70 moveq #0,D1 / $28DE72
}

// ============================================================================
// W125 (R2b): THE RESULT-SCREEN PRESENTATION DRAWS `$28DED8` / `$28E1AC`
// ============================================================================
// A6 = `SE.result`.  Each draw is a sequence of REGISTER-CONVENTION sprite
// enqueues -- `$23DECE` (the queue, bucket 0) and `$23DF2A` (bucket 2),
// resolved from the cartridge stub pointer by `enqueueRegistersThroughStub`.
// The stubs `move.l D1,D0 / asr.l #6` and never touch D1-D4 of the caller, so
// D1-D4 are PRESERVED across each `jsr` and the draws rely on that (several
// enqueues inherit the previous D4).  D1 is PACKED: hi word = long axis, lo
// word = short axis; `addi.w`/`add.w`/`sub.w` touch only the low word, `swap`
// exchanges the halves, `move.w -> Dn` leaves the high word UNCHANGED.  The
// two helpers below keep that arithmetic faithful.  See W123 Ã‚Â§6 (R2b) and the
// `123-recon` SS for the per-block sprite census.

/** Pack / mutate a 32-bit D1 the way the 68000 does: `add.w` and `addi.w`
 *  touch only the low word; `swap` exchanges the halves. */
const d1SetLo = (d, v) => ((d & 0xffff0000) | ((v & 0xffff))) >>> 0;
const d1AddLo = (d, v) => d1SetLo(d, (d & 0xffff) + v);
const d1Swap = (d) => (((d & 0xffff) << 16) | ((d >>> 16) & 0xffff)) >>> 0;

/** The two register-convention emit stubs the result screen uses, resolved
 *  from the cartridge.  `$23DECE` -> bucket 0 (the queue), `$23DF2A` -> 2. */
function resultSprite(ram, rom, stub, d1, d2, d3, d4) {
  enqueueRegistersThroughStub(ram, rom, stub, d1 >>> 0, d2 >>> 0, d3, d4);
}

/** `$28DED8` -- RESULT DRAW 1: the three base panels, the P1/P2 panel+label
 *  slides, the four medal counters, and (per live player) the ship icon plus
 *  two bee/item animation cells.  Advances the two animation-cell pointers at
 *  `$54/$58(a6)` on the way in.  F3/F4/F5 call this. */
export function draw1_28DED8(ram, rom) {
  const a6 = SE.result;
  // ---- the two animation-cell advances ($10/$11 and $12/$13 counters)
  const c1 = (ram.u8(a6 + 0x10) - 1) & 0xff;                   // $28DED8 subq.b
  ram.setU8(a6 + 0x10, c1);
  if (c1 === 0xff) {                                           // $28DEDC bcc (C=1 -> reload)
    ram.setU8(a6 + 0x10, ram.u8(a6 + 0x11));                   // $28DEDE
    let p = (ram.u32(a6 + 0x54) + 0x34) >>> 0;                 // $28DEE8 addi.l #$34
    if (p === 0x1bd04c) p = 0x1bcd0c;                          // $28DEEE/$28DEF6 wrap
    ram.setU32(a6 + 0x54, p);
  }
  const c2 = (ram.u8(a6 + 0x12) - 1) & 0xff;                   // $28DEFC subq.b
  ram.setU8(a6 + 0x12, c2);
  if (c2 === 0xff) {                                           // $28DF00 bcc
    ram.setU8(a6 + 0x12, ram.u8(a6 + 0x13));                   // $28DF02
    let p = (ram.u32(a6 + 0x58) + 0x34) >>> 0;                 // $28DF0C
    if (p === 0x1be94c) p = 0x1be60c;                          // $28DF12/$28DF1A
    ram.setU32(a6 + 0x58, p);
  }
  // ---- the three base panels ($23DECE)
  let d1, d2, d3, d4;
  d1 = ram.u32(a6 + 0x40); d1 = (d1 + 0xf000e400) >>> 0;       // $28DF20/$28DF24
  resultSprite(ram, rom, 0x23dece, d1, 0x328aec, 0x10e0, 0x15);   // $28DF38
  d1 = ram.u32(a6 + 0x44); d1 = (d1 + 0xf000e400) >>> 0;       // $28DF3E/$28DF42
  resultSprite(ram, rom, 0x23dece, d1, 0x3291f0, 0x10e0, 0x15);   // $28DF56
  d1 = ram.u32(a6 + 0x48); d1 = (d1 + 0xf200e400) >>> 0;       // $28DF5C/$28DF60
  resultSprite(ram, rom, 0x23dece, d1, 0x327150, 0x0ee0, 0x15);   // $28DF74
  // ---- the P1/P2 panel slides + medal counters ($23DF2A)
  d1 = ram.u32(a6 + 0x40); d1 = d1AddLo(d1, ram.u16(a6 + 0x08));    // $28DF7A/$28DF7E
  d1 = (d1 + 0xf000e400) >>> 0;                                 // $28DF82
  resultSprite(ram, rom, 0x23df2a, d1, 0x3283e8, 0x10e0, 0x15);    // $28DF96
  // `move.w $42(A6),D1` loads the HI word of $40 into D1's LO word; D1's HI
  // word is UNCHANGED (the packed long-axis from the line above).  Then the
  // P1 y-slide $a and the #-$1c00 offset are added to the lo word.
  d1 = d1SetLo(d1, ram.u16(a6 + 0x42)); d1 = d1AddLo(d1, ram.u16(a6 + 0x0a));  // $28DF9C/$28DFA0
  d1 = d1AddLo(d1, 0xe400);                                     // $28DFA4 addi.w #-$1c00
  resultSprite(ram, rom, 0x23df2a, d1, 0x327ce4, 0x10e0, 0x15);    // $28DFB2 (D4 inherits $15)
  d1 = ram.u32(a6 + 0x44); d1 = d1AddLo(d1, ram.u16(a6 + 0x0c)); d1 = (d1 + 0xf000e400) >>> 0; // $28DFB8/BC/C0
  resultSprite(ram, rom, 0x23df2a, d1, 0x3283e8, 0x10e0, 0x6015);   // $28DFD4
  d1 = d1SetLo(d1, ram.u16(a6 + 0x46)); d1 = d1AddLo(d1, ram.u16(a6 + 0x0e));  // $28DFDA/$28DFDE
  d1 = d1AddLo(d1, 0xe400);                                     // $28DFE2
  resultSprite(ram, rom, 0x23df2a, d1, 0x327ce4, 0x10e0, 0x6015);   // $28DFF0 (D4 inherits $6015)
  // ---- the four medal counters m0/m1/m2/m3 off the $48 base
  d1 = ram.u32(a6 + 0x48); d1 = d1Swap(d1); d1 = d1AddLo(d1, 0x0440);  // $28DFF6/$28DFFA/$28DFFC
  d1 = d1AddLo(d1, ram.u16(a6 + 0x4c)); d1 = d1Swap(d1);          // $28E000/$28E004
  d1 = (d1 + 0xfa00ee00) >>> 0;                                  // $28E006
  resultSprite(ram, rom, 0x23df2a, d1, 0x3298f4, 0x0690, 0x15);     // $28E01A
  d1 = ram.u32(a6 + 0x48); d1 = d1Swap(d1); d1 = d1AddLo(d1, 0x0440);  // $28E020/$28E024/$28E026
  d1 = d1SetLo(d1, (d1 & 0xffff) - ram.u16(a6 + 0x4e)); d1 = d1Swap(d1);  // $28E02A sub.w $4e / $28E02E
  d1 = (d1 + 0xfa00ee00) >>> 0;                                  // $28E030
  resultSprite(ram, rom, 0x23df2a, d1, 0x329aa8, 0x0690, 0x15);     // $28E044
  d1 = ram.u32(a6 + 0x48); d1 = d1Swap(d1); d1 = d1AddLo(d1, 0x0400);  // $28E04A/$28E04E/$28E050
  d1 = d1AddLo(d1, ram.u16(a6 + 0x50)); d1 = d1Swap(d1);          // $28E054/$28E058
  d1 = (d1 + 0xf800ec00) >>> 0;                                  // $28E05A
  resultSprite(ram, rom, 0x23df2a, d1, 0x327774, 0x08a0, 0x14);     // $28E06E
  d1 = ram.u32(a6 + 0x48); d1 = d1Swap(d1); d1 = d1AddLo(d1, 0x0400);  // $28E074/$28E078/$28E07A
  d1 = d1SetLo(d1, (d1 & 0xffff) - ram.u16(a6 + 0x52)); d1 = d1Swap(d1);  // $28E07E sub.w $52 / $28E082
  d1 = (d1 + 0xf800ec00) >>> 0;                                  // $28E084
  resultSprite(ram, rom, 0x23df2a, d1, 0x3279f8, 0x08a0, 0x14);     // $28E098
  // ---- P1 LIVE arm: ship icon + two bee/item anim cells
  if ((ram.u16(SE.p1) & 0x8000) !== 0) {                        // $28E09E tst/bpl (bmi set -> live)
    d1 = ram.u32(a6 + 0x40); d1 = (d1 + 0xf400f200) >>> 0;       // $28E0A6/$28E0AA
    resultSprite(ram, rom, 0x23dece, d1, 0x326eac, 0x0c70, 0x13); // $28E0BE
    d1 = ram.u32(a6 + 0x40); d1 = (d1 + 0xf3bff940) >>> 0;       // $28E0C4/$28E0C8
    d1 = (d1 + 0xfe00fa00) >>> 0;                                // $28E0CE
    resultSprite(ram, rom, 0x23dece, d1, 0x327c7c, 0x0230, 0x12); // $28E0E2
    d1 = (0x53001300 - 0x3ff0300) >>> 0;                         // $28E0E8/$28E0EE
    resultSprite(ram, rom, 0x23dece, d1, ram.u32(a6 + 0x54), 0x0418, 0x1c);  // $28E0F4 D2=$54(a6)
    d1 = (0x47801300 - 0x3ff0300) >>> 0;                         // $28E106/$28E10C
    resultSprite(ram, rom, 0x23dece, d1, ram.u32(a6 + 0x58), 0x0418, 0x1c);  // $28E112 D2=$58(a6)
  }
  // ---- P2 LIVE arm
  if ((ram.u16(SE.p2) & 0x8000) !== 0) {                        // $28E124 tst/bpl
    d1 = ram.u32(a6 + 0x44); d1 = (d1 + 0xf400f200) >>> 0;       // $28E12C/$28E130
    resultSprite(ram, rom, 0x23dece, d1, 0x326eac, 0x0c70, 0x13); // $28E144
    d1 = ram.u32(a6 + 0x44); d1 = (d1 + 0x0cc00700) >>> 0;       // $28E14A/$28E14E
    d1 = (d1 + 0xfe00fa00) >>> 0;                                // $28E154
    resultSprite(ram, rom, 0x23dece, d1, 0x327cb0, 0x0230, 0x12); // $28E168
    d1 = (0x32c01300 - 0x3ff0300) >>> 0;                         // $28E16E/$28E174
    resultSprite(ram, rom, 0x23dece, d1, ram.u32(a6 + 0x54), 0x0418, 0x1c);  // $28E17A
    d1 = (0x27401300 - 0x3ff0300) >>> 0;                         // $28E18C/$28E192
    resultSprite(ram, rom, 0x23dece, d1, ram.u32(a6 + 0x58), 0x0418, 0x1c);  // $28E198
  }
}

/** The 16-entry digit-art table at `$28E658` (PC-relative from each caller),
 *  read by draw2's BCD-digit walks.  Already inside the W124 `$28E646` window.
 *  Each entry is a longword art pointer. */
const DIGIT_ART_28E658 = 0x28e658;
/** One BCD digit -> its art pointer: mask the low nibble, x4, read the table. */
function digitArt(rom, nibble) {
  const i = (nibble & 0xf) << 2;                                // $28E1BE..$28E1C8 (*2,*2)
  return rom.u32(DIGIT_ART_28E658 + i);                         // move.l (A1,D2.w),D2
}

/** `$28E1AC` -- RESULT DRAW 2: the P1 then P2 bee-bonus, item-bonus and
 *  medal-count NUMBER renders.  Each number is a BCD-digit walk: read the
 *  pool word, mask $F, x4, index `$28E658`, enqueue, `lsr #4`, repeat (up to
 *  4 digits, stopping on zero with a leading-blank suppression flag).  The
 *  item-bonus arm BCD-converts via `$242AC6` first.  Each digit's D1 steps
 *  `-$200` (one cell left).  Per live player only. */
export function draw2_28E1AC(ram, rom) {
  const a6 = SE.result;
  let d1, d2, d3, d4;
  // ---- P1 LIVE
  if ((ram.u16(SE.p1) & 0x8000) !== 0) {                        // $28E1AC tst/bpl
    // P1 bee bonus ($18(a6) BCD): up to 3 digits then the fixed label
    let d7 = ram.u16(a6 + 0x18);                                // $28E1B6 move.w $18
    d2 = digitArt(rom, d7);                                     // $28E1BA..$28E1C8
    d1 = ram.u32(a6 + 0x40); d1 = (d1 + 0x080001c0) >>> 0;      // $28E1CC/$28E1D0
    d1 = (d1 + 0xfe00ff00) >>> 0;                               // $28E1D6
    resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);     // $28E1E4
    d7 = (d7 >>> 4) & 0xffff;                                   // $28E1EA lsr.w #4
    if (d7 !== 0) {                                             // $28E1EC beq
      d2 = digitArt(rom, d7); d1 = d1AddLo(d1, -0x200);         // $28E1FA/$28E1F4 (subi -> addi -)
      resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);   // $28E1FE
      d7 = (d7 >>> 4) & 0xffff;                                 // $28E204
      if (d7 !== 0) {                                           // $28E206
        d2 = digitArt(rom, d7); d1 = d1AddLo(d1, -0x200);
        resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16); // $28E218
      }
    }
    // the "bee label" fixed sprite
    d1 = ram.u32(a6 + 0x40); d1 = (d1 + 0x030009c0) >>> 0;      // $28E21E/$28E222
    d1 = (d1 + 0xfe00ff00) >>> 0;                               // $28E228
    resultSprite(ram, rom, 0x23dece, d1, 0x33252c, 0x0208, 0x16);  // $28E23C
    // P1 item bonus ($1a(a6) binary -> BCD via $242AC6, then up to 5 digits)
    if (ram.u16(a6 + 0x1a) !== 0) {                             // $28E242 move.w $1a/beq
      d1 = d1AddLo(d1, -0x200);                                 // $28E24A
      resultSprite(ram, rom, 0x23dece, d1, 0x33252c, 0x0208, 0x16);  // $28E24E (the tens-cell)
      d7 = bcd242AC6(ram.u16(a6 + 0x1a)) >>> 0;                 // $28E254/$28E258 jsr $242AC6 -> D2 (long)
      // D7 holds the BCD longword; walk 4 nibbles (the ROM walks until zero)
      let nibs = d7 >>> 0;
      d2 = digitArt(rom, nibs & 0xf);                           // $28E260..$28E26E
      d1 = d1AddLo(d1, -0x200);                                 // $28E272
      resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);   // $28E276
      nibs = (nibs >>> 4) >>> 0;                                // $28E27C lsr.l #4
      if (nibs !== 0) {                                         // $28E27E
        d2 = digitArt(rom, nibs & 0xf); d1 = d1AddLo(d1, -0x200);
        resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16); // $28E290
        nibs = (nibs >>> 4) >>> 0;                              // $28E296
        if (nibs !== 0) {                                       // $28E298
          d2 = digitArt(rom, nibs & 0xf); d1 = d1AddLo(d1, -0x200);
          resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);  // $28E2AA
          nibs = (nibs >>> 4) >>> 0;                            // $28E2B0
          if (nibs !== 0) {                                     // $28E2B2
            d2 = digitArt(rom, nibs & 0xf); d1 = d1AddLo(d1, -0x200);
            resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);  // $28E2C4
          }
        }
      }
    }
    // P1 medal count ($1c(a6) BCD): up to 3 digits then the fixed label
    d7 = ram.u16(a6 + 0x1c);                                    // $28E2CA
    d2 = digitArt(rom, d7);                                     // $28E2CE..$28E2DC
    d1 = ram.u32(a6 + 0x40); d1 = (d1 + 0xfd4001c0) >>> 0;      // $28E2E0/$28E2E4 (addi -$2bffe40)
    d1 = (d1 + 0xfe00ff00) >>> 0;                               // $28E2EA
    resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);     // $28E2F8
    d7 = (d7 >>> 4) & 0xffff;                                   // $28E2FE
    if (d7 !== 0) {                                             // $28E300
      d2 = digitArt(rom, d7); d1 = d1AddLo(d1, -0x200);
      resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);   // $28E312
      d7 = (d7 >>> 4) & 0xffff;                                 // $28E318
      if (d7 !== 0) {                                           // $28E31A
        d2 = digitArt(rom, d7); d1 = d1AddLo(d1, -0x200);
        resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16); // $28E32C
      }
    }
    // the "medal label" fixed sprite
    d1 = ram.u32(a6 + 0x40); d1 = (d1 + 0xf84009c0) >>> 0;      // $28E332/$28E336 (addi -$7bff640)
    d1 = (d1 + 0xfe00ff00) >>> 0;                               // $28E33C
    resultSprite(ram, rom, 0x23dece, d1, 0x33252c, 0x0208, 0x16);  // $28E350
    // P1 medal-bonus ($1e(a6) binary -> BCD, up to 5 digits) -- same shape as item
    if (ram.u16(a6 + 0x1e) !== 0) {                             // $28E356
      d1 = d1AddLo(d1, -0x200);                                 // $28E35E
      resultSprite(ram, rom, 0x23dece, d1, 0x33252c, 0x0208, 0x16);  // $28E362
      let nibs = bcd242AC6(ram.u16(a6 + 0x1e)) >>> 0;           // $28E368/$28E36C
      d2 = digitArt(rom, nibs & 0xf); d1 = d1AddLo(d1, -0x200); // $28E374..$28E386
      resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);   // $28E38A
      nibs = (nibs >>> 4) >>> 0;                                // $28E390
      if (nibs !== 0) {                                         // $28E392
        d2 = digitArt(rom, nibs & 0xf); d1 = d1AddLo(d1, -0x200);
        resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16); // $28E3A4
        nibs = (nibs >>> 4) >>> 0;                              // $28E3AA
        if (nibs !== 0) {                                       // $28E3AC
          d2 = digitArt(rom, nibs & 0xf); d1 = d1AddLo(d1, -0x200);
          resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);  // $28E3BE
          nibs = (nibs >>> 4) >>> 0;                            // $28E3C4
          if (nibs !== 0) {                                     // $28E3C6
            d2 = digitArt(rom, nibs & 0xf); d1 = d1AddLo(d1, -0x200);
            resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);  // $28E3D8
            nibs = (nibs >>> 4) >>> 0;                          // $28E3DE
            if (nibs !== 0) {                                   // $28E3E0
              d2 = digitArt(rom, nibs & 0xf); d1 = d1AddLo(d1, -0x200);
              resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);  // $28E3F2
            }
          }
        }
      }
    }
  }
  // ---- P2 LIVE (the mirror of P1, off $44(a6) and the P2 pools $22/$24/$26/$28)
  if ((ram.u16(SE.p2) & 0x8000) !== 0) {                        // $28E3F8 tst/bpl
    p2NumberBlock(ram, rom, a6, 0x22, 0x24, 0x26, 0x28, 0x44);
  }
}

/** The P2 number block is the exact mirror of P1's, off `$44(a6)` and the P2
 *  pools.  Folded out (not looped) to stay byte-faithful to the ROM's
 *  `$28E402..$28E642` -- the ROM repeats the whole P1 shape verbatim. */
function p2NumberBlock(ram, rom, a6, beeOff, beeBin, itemOff, itemBin, base) {
  let d1, d2, d7;
  // bee bonus
  d7 = ram.u16(a6 + beeOff);
  d2 = digitArt(rom, d7);
  d1 = ram.u32(a6 + base); d1 = (d1 + 0x080001c0) >>> 0; d1 = (d1 + 0xfe00ff00) >>> 0;
  resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);
  d7 = (d7 >>> 4) & 0xffff;
  if (d7 !== 0) {
    d2 = digitArt(rom, d7); d1 = d1AddLo(d1, -0x200);
    resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);
    d7 = (d7 >>> 4) & 0xffff;
    if (d7 !== 0) {
      d2 = digitArt(rom, d7); d1 = d1AddLo(d1, -0x200);
      resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);
    }
  }
  // bee label
  d1 = ram.u32(a6 + base); d1 = (d1 + 0x030009c0) >>> 0; d1 = (d1 + 0xfe00ff00) >>> 0;
  resultSprite(ram, rom, 0x23dece, d1, 0x33252c, 0x0208, 0x16);
  // item bonus
  if (ram.u16(a6 + beeBin) !== 0) {
    d1 = d1AddLo(d1, -0x200);
    resultSprite(ram, rom, 0x23dece, d1, 0x33252c, 0x0208, 0x16);
    let nibs = bcd242AC6(ram.u16(a6 + beeBin)) >>> 0;
    d2 = digitArt(rom, nibs & 0xf); d1 = d1AddLo(d1, -0x200);
    resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);
    nibs = (nibs >>> 4) >>> 0;
    if (nibs !== 0) {
      d2 = digitArt(rom, nibs & 0xf); d1 = d1AddLo(d1, -0x200);
      resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);
      nibs = (nibs >>> 4) >>> 0;
      if (nibs !== 0) {
        d2 = digitArt(rom, nibs & 0xf); d1 = d1AddLo(d1, -0x200);
        resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);
        nibs = (nibs >>> 4) >>> 0;
        if (nibs !== 0) {
          d2 = digitArt(rom, nibs & 0xf); d1 = d1AddLo(d1, -0x200);
          resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);
        }
      }
    }
  }
  // medal count
  d7 = ram.u16(a6 + itemOff);
  d2 = digitArt(rom, d7);
  d1 = ram.u32(a6 + base); d1 = (d1 + 0xfd4001c0) >>> 0; d1 = (d1 + 0xfe00ff00) >>> 0;
  resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);
  d7 = (d7 >>> 4) & 0xffff;
  if (d7 !== 0) {
    d2 = digitArt(rom, d7); d1 = d1AddLo(d1, -0x200);
    resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);
    d7 = (d7 >>> 4) & 0xffff;
    if (d7 !== 0) {
      d2 = digitArt(rom, d7); d1 = d1AddLo(d1, -0x200);
      resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);
    }
  }
  // medal label
  d1 = ram.u32(a6 + base); d1 = (d1 + 0xf84009c0) >>> 0; d1 = (d1 + 0xfe00ff00) >>> 0;
  resultSprite(ram, rom, 0x23dece, d1, 0x33252c, 0x0208, 0x16);
  // medal bonus
  if (ram.u16(a6 + itemBin) !== 0) {
    d1 = d1AddLo(d1, -0x200);
    resultSprite(ram, rom, 0x23dece, d1, 0x33252c, 0x0208, 0x16);
    let nibs = bcd242AC6(ram.u16(a6 + itemBin)) >>> 0;
    d2 = digitArt(rom, nibs & 0xf); d1 = d1AddLo(d1, -0x200);
    resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);
    nibs = (nibs >>> 4) >>> 0;
    if (nibs !== 0) {
      d2 = digitArt(rom, nibs & 0xf); d1 = d1AddLo(d1, -0x200);
      resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);
      nibs = (nibs >>> 4) >>> 0;
      if (nibs !== 0) {
        d2 = digitArt(rom, nibs & 0xf); d1 = d1AddLo(d1, -0x200);
        resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);
        nibs = (nibs >>> 4) >>> 0;
        if (nibs !== 0) {
          d2 = digitArt(rom, nibs & 0xf); d1 = d1AddLo(d1, -0x200);
          resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);
          nibs = (nibs >>> 4) >>> 0;
          if (nibs !== 0) {
            d2 = digitArt(rom, nibs & 0xf); d1 = d1AddLo(d1, -0x200);
            resultSprite(ram, rom, 0x23dece, d1, d2, 0x0208, 0x16);
          }
        }
      }
    }
  }
}

// ----------------------------------------------------- the animation chain
//
// `$24652A` (loader) / `$24681A` (checker) / `$246800` (free) -- the fly-away
// animation chain.  The loader walks the player-slot list `$810346` (stride
// `$30`, 3 slots) and, for the first free slot, allocates a chain of nodes from
// the object pool `$80FA86` (stride `$70`, 20 slots), linking them at
// `($2C,node)`.  Returns D0 = the player-slot handle (whose `($2C)` is the chain
// head).  The checker sums `$18(node)`; the free walks and clears.  All three
// are byte-for-byte from the ROM; they touch the SHARED `$80FA86` pool exactly
// as the cartridge does.  **W435: the faithful WAIT is no longer a declared gap.**
// The per-frame drain is `animobjects.js runAnimObjects24683E`, main-loop call
// #3, which has been running every frame since W91 -- it was skipping these
// nodes only because the loader left `($6,node)` at zero.  See
// `animobjects.js CHAIN_SPECS` and the state-$B arm.

// W448: the pool geometry USED to be repeated here as `playerList`/`pool` and in `spawn.js` as
// `PARTS`. It is `animobjects.js ANIM_OBJECT` and nowhere else now; what is left is the node
// field offsets `$24681A` and `$246800` read.
// W449: `idOff`/`subOff` went with `chainFree246800`; `$24681A` reads only these two.
const CHAIN = {
  linkOff: 0x2c, lifeOff: 0x18,
};

// `$24652A` -- **DELETED IN W448.** This file carried a second, independent transcription of
// `$246532`'s body (`chainLoaderBody`, below, also gone) with `chainLoader24652A` as its head.
// `animobjects.js loadAnimObjects24652A` is the survivor and `f8Exit28DE1E` calls it directly;
// `animobjects.js` is a leaf (it imports only `ram.js` and `unported.js`) and this file already
// depended on it, so the merge runs WITH the existing import edge rather than inverting it.
//
// What this copy had RIGHT and the other two did not: `$246608 moveq #-$1,D0`. It returned
// `$FFFFFFFF`; `animobjects.js` and `spawn.js` both returned 0. That is the axis W447 asked to
// settle from the image, and the image settles it -- **both failure arms of both entries are
// `$FFFFFFFF`** (`$2465E6` falls through `$2465EC tst.w D0 / $2465EE bpl` into `$2465F0 move.l
// A1,D0 / $2465F2 bsr $246800 / $2465F6 bra $246608`, and `$246608` is `moveq #-$1,D0`).
//
// What it had WRONG: the pool scan restarted at `$80FA86` for every node, where `$24654E move.w
// #$13,D6` + `$2465E2 dbra D6,$246558` is ONE forward pass of twenty visits for the whole chain;
// and `for (let n = 0; n < nodeCount; n++)` was an entry test the ROM does not have -- `$246558`
// is reached unconditionally, so the node loop is a DO-WHILE.

/**
 * `$246710` -- the SIBLING loader, and it is one constant away from `$24652A`.
 *
 * Same prologue to the byte (`movem.l D1-D7/A0-A4` / `move.w #$0,D6` /
 * `lea $810346,A1` / `moveq #$2,D7`), the same three-slot player scan at stride `$30`, the
 * same twenty-slot pool at `$80FA86` stride `$70`, the same `($2C)` link, the same
 * `$FFFF0000` lifetime, the same `$FFFFFFFF` on failure and the same free-and-bail through
 * `$246800`. **The whole difference in the pool lifecycle is `($1E,node)`: `$246762` writes
 * `#$1` where `$246576` writes `#$0`.** (The two also swap the order of the `($2,node)` and
 * `($1E,node)` stores, which changes nothing.)
 *
 * **W389: ITS PER-NODE CONTENT SEEDING IS NOW PORTED HERE, AND THE NOTE IS GONE.** `$24676A..
 * $2467C3` is `animobjects.js seedChainNode24676A`, called from `chainLoaderBody` inside the
 * allocation loop, which is where `$2467CE`'s `dbra` puts it. `ctx` is no longer read by this
 * function; it is kept in the signature because three call sites pass it and because
 * `chainLoader246704` below still has arms of its own that may want it.
 */
export function chainLoader246710(ram, rom, scriptAddr, ctx) {
  void ctx;
  return buildChain246532(ram, rom, scriptAddr, CHAIN_SPECS[0x246710]);
}

/**
 * `$246710` -- the D6 = 1 sibling of the above.  W308.
 *
 * `$246704 movem.l D1-D7/A0-A4,-(A7) / move.w #$1,D6 / bra $246718` -- it jumps straight into
 * `$246710`'s body four instructions in, so it is the same two-head-one-body shape yet again,
 * and **D6 is the value `$24672A move.w D6,($4,A1)` writes into the player slot.** So the axis
 * is `($4,slot)`, independent of `$246710`'s `($1E,node)`.
 *
 * W303 ported `$246710` and hardcoded 0 there because that is what `$246714` loads. That was
 * correct for `$246710` and left this sibling absent; `$28F526 jsr $246704` is what needs it.
 */
export function chainLoader246704(ram, rom, scriptAddr, ctx) {
  void ctx;
  return buildChain246532(ram, rom, scriptAddr, CHAIN_SPECS[0x246704]);
}

/**
 * The three ported entry points, on two independent axes: `field1e` is `($1E,node)` and
 * `field4` is `($4,slot)`, the latter being D6.
 *
 * There is a FOURTH pair in this family at `$246610` (D6 = 1) and `$24661A` (D6 = 0), but they
 * fall into a DIFFERENT body at `$246622`, so they are not variants of these and are not
 * assumed to be. Named here so the next reader does not have to find them again.
 *
 * **W389 ADDS A THIRD AXIS: `content`, the per-node CONTENT SEEDING, AND IT IS NOT SHARED.**
 * `$24652A` and `$246710` each have one and they are DIFFERENT SHAPES -- `$246598 move.l
 * (A0)+,($A,A2)` reads the target from the script in `$24652A`, while `$24677E move.l
 * #$246BB8,($A,A2)` hardcodes it in `$246710`, so `$24652A`'s script is SIX words per node and
 * `$246710`'s is FOUR. A single unconditional fold would have mis-parsed one of the two.
 *
 * **W435 TURNED `$24652A`'S CONTENT ON, AND THAT IS WHAT CLOSED DEV-2.** The hold above said
 * the one line "would give the result screen a real 16-frame-plus wait it has never had". It
 * does, and the wait is the board's: [M] the `$28D862` script is 8 nodes, every one of them
 * timing index 3, and `$246B38[3]` is reload 0 / step 1, so `stepNode`'s `($20,node)` walks
 * 1..$20 one per frame and `($18,node)` clears on the 32nd. `runAnimObjects24683E` sums those
 * to zero exactly 32 frames after the loader ran, which is what `chainCheck24681A` reports to
 * state $B. Seeding without honouring `$28D702`'s `bne` changes nothing, and honouring
 * `$28D702` without seeding STALLS FOREVER -- the two halves are one fix.
 */
// `CHAIN_LOADERS` and `chainLoaderBody`: **DELETED IN W448.** The three-entry table is
// `animobjects.js CHAIN_SPECS` (four entries -- it also carries `$246520`, which this file never
// had a head for) and the body is `animobjects.js buildChain246532`.
export const CHAIN_OTHER_BODY = Object.freeze([0x246610, 0x24661a, 0x246622]);

/** `$24681A` -- walk the chain from `handle`, summing `$18(node)` (word).
 *  Returns the sum; Z (zero) means the chain has finished. */
export function chainCheck24681A(ram, handle) {
  let sum = 0;                                              // $24681E moveq #0,d1
  let cur = ram.u32((handle >>> 0) + CHAIN.linkOff);        // $246822 $2c(handle)
  while (cur !== 0) {                                       // $246826 beq
    sum = u16(sum + ram.u16((cur >>> 0) + CHAIN.lifeOff));  // $24682A add $18
    cur = ram.u32((cur >>> 0) + CHAIN.linkOff);             // $24682E $2c(node)
  }
  return sum;                                               // $246834/$246836 tst.w
}

// `$246800` -- **DELETED IN W449.** `chainFree246800` was this file's transcription of the
// six-instruction chain free, and it was one of THREE (`spawn.js freeChain246800` and
// `animobjects.js`'s private `clearChain`, wrapped by `freeAnimObjects246800`, were the others).
// `animobjects.js freeAnimObjects246800` is the survivor and this file's ELEVEN call sites --
// ten importers plus `f8Exit28DE1E` below -- go to it. Same direction as W448: `animobjects.js`
// is a leaf and this file already imports it, so nothing inverts.
//
// What this copy had RIGHT: the DO-WHILE. `$246804` is the branch target of `$246812 66f0` and
// `$246806 clr.w (A0)` follows it immediately, so the head is released with no entry test --
// `animobjects.js` wrapped the walk in an INVENTED `if (root !== 0)`. What it had WRONG: no
// bound, so a corrupt `($2C)` cycle hung the suite instead of naming itself, and no refusal for
// the `$FFFFFFFF` a failed loader returns.

// --------------------------------------------------------- the banner $28E7F8
//
// A6 = `$81DFAC` (the banner buffer), A4 = `$81DFEC` (the slide-out counter).
// In R2a only the slide-OUT arm runs: `$81DFF8` (banner-active) is NEVER set
// because its setter `$28E7B6` has ZERO callers in the whole `$23xxxx..$2Axxxx`
// image (PC-relative scan this wave).  State 2 sets `$81DFF6` (`$28E7DC`), so
// `$28E7F8` inits the slide-out, drains `$81DFEC` via the milestone motion, and
// the teardown `$28EAD4 clr.w $81DFF6` fires -- freeing the stuck object slot.
// The paint calls (`$23F782`/`$23F7F4`/`$24150A`) are notes (R2b); the motion
// (`$241812`/`tables.vector`) and the teardown are real.

const BANNER = {
  buf: 0x81dfac, dfec: 0x81dfec, dff6: 0x81dff6, dff8: 0x81dff8,
  // banner sub-record offsets (two sprites: +0 and +$20)
  s2: 0x02, s4: 0x04, s8: 0x08, s10: 0x10, s12: 0x12, s14: 0x14, s1a: 0x1a,
};

/** `$28E7F8` -- the banner state machine, called every frame by type 6. */
export function banner28E7F8(ram, ctx, rom) {
  void rom;
  if (ram.u16(BANNER.dff8) !== 0) {                         // $28E804 tst/bne slide-in
    // slide-in arm: would run `$28E81A..$28E866` (init + art) then motion.  The
    // slide-in never starts ($28E7B6 has no caller), so this arm is dormant.
    note(ctx, 0x28e81a, '$28E81A banner slide-in arm -- dormant: $81DFF8 is never '
      + 'set ($28E7B6 has no caller in the image). R2b if a caller is found');
    return;
  }
  if (ram.u16(BANNER.dff6) === 0) return;                   // $28E80E tst/beq rts
  // ---- slide-out arm (`$28EA04..$28EA46`)
  bannerSlideOutStep(ram, ctx);
}

/** `$28EB28`/`$28EB5C` -- one banner sprite's two paint calls (both bucket 22):
 *  `$23F782` (RECORD convention) enqueues the frame record at `base` verbatim,
 *  then `$23F7F4` (REGISTER convention) draws the banner PICTURE (art $1F18E4)
 *  at a position derived from `base`.  The picture's D0 = ($3800 - $2(base))<<1
 *  and its packed D1 swaps twice, adding $8/$6(base) and D0. */
function bannerPaint(ram, base) {
  enqueueRequest(ram, 22, base);                               // $28EB28 jsr $23F782
  let d0 = (0x3800 - ram.u16(base + 0x02)) & 0xffff;          // $28EB2E/$28EB32
  d0 = (d0 + d0) & 0xffff;                                     // $28EB36 add.w D0,D0
  let d1 = ram.u32(base + 0x02);                              // $28EB38 move.l $2(base),D1
  d1 = d1AddLo(d1, ram.u16(base + 0x08));                     // $28EB3C add.w $8
  d1 = d1Swap(d1);                                             // $28EB40
  d1 = d1AddLo(d1, ram.u16(base + 0x06));                     // $28EB42 add.w $6
  d1 = d1AddLo(d1, d0);                                        // $28EB46 add.w D0
  d1 = d1Swap(d1);                                             // $28EB48
  const d3 = ram.u16(base + 0x0e);                            // $28EB4E move.w $e,D3
  const d4 = ram.u16(base + 0x1c);                            // $28EB52 move.w $1c,D4
  enqueueRegisters(ram, 22, d1, 0x1f18e4, d3, d4);            // $28EB56/$28EB5C (D2 overriden)
}

/** `$28EDC0` -- the banner PICTURE draw, called every frame at the top of type
 *  6.  When `$81E02C == $FFFF` it returns immediately; otherwise it reads the
 *  per-stage art byte (`$28ECB2`), indexes `$28EE1E[artbyte*8]` for the art
 *  pointer (D2), and -- when `$81E02C != 0` -- enqueues the picture via
 *  `$23DECE` (register, bucket 0) at the fixed banner position D1=$10000.  The
 *  ENTRY arm (`$81E02C == 0`, the `$23F82A` ZOOMING enqueue on the `$23E78C`
 *  scale table, bucket 22) is a different zooming routine than `$23D9E2`'s
 *  family and is NOT ported here -- noted by address. */
function bannerDraw28EDC0(ram, rom, ctx) {
  if (ram.u16(SE.e02c) === 0xffff) return;                    // $28EDC0 cmpi/beq rts
  const artByte = artByte28ECB2(ram);                         // $28EDCC bsr $28ECB2 -> D0
  const d2 = rom.u32(0x28ee1e + (artByte << 3));              // $28EDD0 lsl #3 / $28EDDA (A0)
  const d1 = 0x00010000;                                      // $28EDDC/$28EDE2 ($38001c00-$37ff1c00)
  const d3 = 0x38e0, d4 = 0x17;                               // $28EDE8/$28EDEC
  if (ram.u16(SE.e02c) !== 0) {                               // $28EDF0 tst/bne -> normal arm
    resultSprite(ram, rom, 0x23dece, d1, d2, d3, d4);         // $28EE16 jsr $23dece
    return;
  }
  // $28EDFA..$28EE14 -- the ENTRY banner: D6 = [$28EE46 + $81E028*4], jsr $23F82A
  // (a ZOOMING enqueue on the $23E78C scale table, bucket 22 -- NOT $23D9E2's
  // family, which `enqueueZoomedRequest` covers).  Its own scale dispatch is
  // presentation tier; noted rather than half-ported.
  // W232: $23F82A is the same emitter `emitScaled` already is, on bucket 22 --
  // see the EMITTER_BUCKET map in bossarrival.js. So the banner's entry picture
  // draws now instead of being counted.
  const d6 = rom.u32(0x28ee46 + u16(ram.u16(SE.e028) * 4));   // $28EDFA..$28EE0C
  emit23F82A(ram, rom, d1, d2, d3, d4, d6);                   // $28EE0E
}

/** `$28ECB2` -- the per-stage art byte.  `$28EDA2[stageX4]` is a longword RAM
 *  pointer (the table is `$81DFFC, $81E004, $81E00C, ...` = `$81DFFC + n*8`),
 *  so the ROM's pointer chase is equivalent to `0x81DFFC + (stageX4>>2)*8`; the
 *  byte read is at `list + 7 - $81E02A`.  Same computation `loadBannerArt` uses. */
function artByte28ECB2(ram) {
  const listBase = 0x81dffc;                                   // $28EDA2[0] (the pointer chase)
  const list = listBase + (ram.u16(SE.stageX4) >> 2) * 8;
  return ram.u8(list + 7 - ram.u16(SE.e02a));                 // $28ECC2/$28ECC4/$28ECCA
}

/** One frame of the slide-out: init from the template on the first frame, then
 *  run the two sprites' counter+motion, draining `$81DFEC`.  When it hits zero,
 *  fire the teardown `$28EAD4`. */
function bannerSlideOutStep(ram, ctx) {
  const a6 = BANNER.buf;
  if ((ram.u16(a6) & 0x8000) === 0) {                       // $28EA04 tst (a6)/bmi
    // first frame: copy the 16-longword template and the 2-word DFEC seed
    for (let i = 0; i < 16; i++) {                          // $28EA14 move.l x16
      ram.setU32(a6 + i * 4, ctx.rom.u32(RESULT_ROM.bannerSlideOut + i * 4));
    }
    ram.setU16(BANNER.dfec, ctx.rom.u16(RESULT_ROM.bannerDfecOut));      // $28EA22
    ram.setU16(BANNER.dfec + 2, ctx.rom.u16(RESULT_ROM.bannerDfecOut + 2));
    // $28EA28..$28EA40 -- the per-stage BANK, then the install. W236 runs it: the
    // bank is a word out of $28EA4A indexed by $813094 ([M] all five are $17, the
    // same bank the banner's own art uses), the SAME byte lands in both sprites'
    // attribute low bytes, and the source is the fixed 64 bytes at $246BF8.
    const bank = ctx.rom.u16(0x28ea4a + ram.u16(0x813094));   // $28EA28/$28EA2E
    ram.setU8(a6 + 0x1d, bank & 0xff);                        // $28EA32
    ram.setU8(a6 + 0x3d, bank & 0xff);                        // $28EA36
    if (ctx.palette) {
      install24150A(ram, ctx.palette, bank, ctx.rom.bytes(0x246bf8, 64),
        0x28ea40, 'the banner slide-out palette');            // $28EA3A/$28EA40
    }
  }
  // motion for both sprites (banner+0 and banner+$20), via `$28EB62 lea $20(a6)`
  for (let sub = 0; sub < 2; sub++) {
    const base = a6 + sub * 0x20;
    if (ram.u16(base + BANNER.s10) === 0) continue;         // $28EADE tst $10/beq next
    if (ram.u16(base + BANNER.s12) !== 0) {                 // $28EAE6 tst $12/beq adv
      ram.setU16(base + BANNER.s12, u16(ram.u16(base + BANNER.s12) - 1)); // $28EAEC
    } else {
      // $28EAF8..$28EB26 -- position advance via `$241812` + milestone check
      const heading = ram.u8(base + BANNER.s1a);            // $28EB00 move.b $1a
      const v = ctx.tables.vector(0x30, heading);           // $28EB04 jsr $241812
      ram.setU16(base + BANNER.s2, u16(ram.u16(base + BANNER.s2) + v.dy)); // $28EB0A $2 += d2
      let diff = ram.u16(base + BANNER.s2) - ram.u16(base + BANNER.s14);  // $28EB16
      diff = diff & 0xffff;
      const abs = (diff & 0x8000) ? u16(-diff) : diff;      // $28EB18 bpl/neg
      if (abs < 0x400) {                                    // $28EB1C cmpi/bcc
        ram.setU16(base + BANNER.s10, 0);                   // $28EB22 clr $10
        ram.setU16(BANNER.dfec, u16(ram.u16(BANNER.dfec) - 1)); // $28EB26 subq (a4)
      }
    }
    // W125: the banner paint -- `$23F782` (record convention, bucket 22) draws
    // the banner frame from the sub-record at `base`, then `$23F7F4` (register
    // convention, bucket 22) draws the banner PICTURE (art $1F18E4) at the
    // computed position.  Both feed bucket 22 ($809274/$80AFE0).
    bannerPaint(ram, base);
  }
  // ---- teardown `$28EA98`: when `$81DFEC` reaches zero, fire `$28EAD4`.
  if (ram.u16(BANNER.dfec) !== 0) return;                   // $28EA98 tst (a4)/bne
  ram.setU16(BANNER.dfec + 2, 1);                           // $28EA9C $2(a4) := 1
  ram.setU16(0x81b6e4, 0);                                  // $28EAA2 clr $81B6E4
  // W381 -- the SECOND stale counted note this file carried.  `$2875B4` and its
  // P2 mirror `$287616` are `hyper.js flushPendingHyper2875B4`, which has served
  // both since W163 (`bomb.js flushPendingGrants2875B4` is a delegate, not a
  // second port), so the note was deferring a call the tree could already make.
  //
  // AND THE NOTE HID THE FOUR GATES, which is brief trap 7 -- these sequential
  // `tst.w`s DO branch away, so they are a chain and not a ladder:
  //
  //   28eaa8: 4a79 008103e6   tst.w   $8103E6      P1's record
  //   28eaae: 6a 0e           bpl.b   $28EABE      NOT negative -> skip P1
  //   28eab0: 4a79 0081b63e   tst.w   $81B63E      P1's HYPER-ACTIVE word
  //   28eab6: 66 06           bne.b   $28EABE      hyper still up -> skip P1
  //   28eab8: 4eb9 002875b4   jsr     $2875B4
  //   28eabe: 4a79 00810448   tst.w   $810448      ...and the P2 mirror,
  //   28eac4: 6a 0e           bpl.b   $28EAD4      byte for byte
  //   28eac6: 4a79 0081b640   tst.w   $81B640
  //   28eacc: 66 06           bne.b   $28EAD4
  //   28eace: 4eb9 00287616   jsr     $287616
  //
  // The `bpl` displacements are measured from the FOLLOWING instruction
  // ($28EAB0 + $0E = $28EABE, $28EAC6 + $0E = $28EAD4), and both `bne`s land on
  // the same two targets.  A port that called the flush unconditionally would
  // hand items to a dead player, or to one whose hyper has not ended yet.
  for (const [rec, hyperWord, p2] of [[SE.p1, 0x81b63e, false],
    [SE.p2, 0x81b640, true]]) {
    if ((ram.u16(rec) & 0x8000) === 0) continue;            // $28EAAE/$28EAC4 bpl
    if (ram.u16(hyperWord) !== 0) continue;                 // $28EAB6/$28EACC bne
    flushPendingHyper2875B4(ram, ctx.rom, ctx, p2);         // $28EAB8/$28EACE
  }
  ram.setU16(BANNER.dff6, 0);                               // $28EAD4 clr $81DFF6 -- THE CLEARER
  ram.setU16(a6, 0);                                        // $28EADA clr (a6)
}

// ============================================================================
// W503: OBJECT TYPE $13, THE STAGE-5 ENDING TALLY AND TYPE-7 HANDOFF
// ============================================================================

export const ENDING13 = Object.freeze({
  base: SE.ending13, words: 0x14,
  flagsP1: 0x04, flagsP2: 0x05, stateP1: 0x06, stateP2: 0x08,
  timer: 0x0a, delay: 0x0c, active: 0x0e, cue: 0x10, handle: 0x12,
  animScript: 0x28d8c4,
});

const ENDING_SIDES = Object.freeze([
  Object.freeze({
    index: 0, who: 1, flags: ENDING13.flagsP1, state: ENDING13.stateP1,
    rec: SE.p1, lives: 0x8130be, savedLives: 0x8130c2,
    carry: 0x81e04e, aux: 0x81e052, marker: 0x81b4ac, gate: 0x81b49a,
    bonus: 0x8128f4, stockByte: 0x81040a,
  }),
  Object.freeze({
    index: 1, who: 2, flags: ENDING13.flagsP2, state: ENDING13.stateP2,
    rec: SE.p2, lives: 0x8130c0, savedLives: 0x8130c4,
    carry: 0x81e050, aux: 0x81e054, marker: 0x81b4b0, gate: 0x81b49e,
    bonus: 0x812902, stockByte: 0x81046c,
  }),
]);

/** `$28EE66..$28EE86`, reached when type `$13` has phase byte zero. */
function endingInit28EE66(ram, a5) {
  for (let i = 0; i < ENDING13.words; i++) {                 // $28EE68 move.w #$13 / dbra
    ram.setU16(ENDING13.base + i * 2, 0);                    // $28EE6C
  }
  ram.setU8(a5 + 0x02, 1);                                  // $28EE74
  ram.setU16(ENDING13.base + ENDING13.timer, 0x60);          // $28EE7A
  ram.setU16(ENDING13.base + ENDING13.delay, 0x10);          // $28EE80
}

function endingPostCues(ram, ctx, p2, timerBeforeFlag) {
  const base = ENDING13.base;
  const cue = base + ENDING13.cue;
  if (!p2) {
    ram.setU16(base + ENDING13.timer, 0x30);                 // $28EF9A/$28EFE6/$28F046/$28F090
    ram.setU8(cue, ram.u8(cue) | 0x01);                     // $28EFA0 and mirrors
  } else {
    if (timerBeforeFlag) ram.setU16(base + ENDING13.timer, 0x30); // $28F150
    const wasSet = (ram.u8(cue) & 0x01) !== 0;
    ram.setU8(cue, ram.u8(cue) & 0xfe);                     // $28F156 and mirrors
    if (wasSet) return;                                     // shared cue already posted by P1
    if (!timerBeforeFlag) ram.setU16(base + ENDING13.timer, 0x30);
  }
  ctx?.soundPost?.(0x28c678);
  ctx?.soundPost?.(0x28c65e);
  ctx?.soundPost?.(0x28c610);
}

function endingFinishSide(ram, side) {
  const base = ENDING13.base;
  ram.setU16(side.savedLives, ram.u16(side.carry));          // $28EF52/$28F108
  ram.setU16(base + ENDING13.active,
    u16(ram.u16(base + ENDING13.active) - 1));               // $28EF5C/$28F112
  const flags = base + side.flags;
  ram.setU8(flags, ram.u8(flags) | 0x80);                    // $28EF60/$28F116
}

/** `$28EEFA..$28F0AE` and mirrored `$28F0B0..$28F274`. */
function endingSide28EEFA(ram, rom, ctx, side) {
  const base = ENDING13.base;
  const flags = base + side.flags;
  const oldFlags = ram.u8(flags);
  ram.setU8(flags, oldFlags | 0x01);                         // $28EEFA/$28F0B0 bset #0

  if ((oldFlags & 0x01) === 0) {
    if ((ram.u16(side.rec) & 0x8000) === 0) {                // $28EF04/$28F0BA bpl
      ram.setU8(flags, ram.u8(flags) | 0x80);
      return;
    }
    ram.setU16(side.carry, 0);                               // $28EF0E/$28F0C4
    ram.setU16(side.aux, 0);                                 // $28EF14/$28F0CA
    ram.setU32(side.marker, 0xffffffff);                     // $28EF1A/$28F0D0
    if (ram.u16(side.gate) !== 0) {                          // $28EF24/$28F0DA
      ram.setU8(flags, ram.u8(flags) | 0x80);
      return;
    }
    if (ram.u16(0x813098) === 0) {                           // $28EF2E/$28F0E4
      ram.setU16(side.savedLives, ram.u16(side.lives));      // $28EF38/$28F0EE
      ram.setU8(flags, ram.u8(flags) | 0x80);
      return;
    }
    ram.setU16(base + ENDING13.active,
      u16(ram.u16(base + ENDING13.active) + 1));             // $28EF46/$28F0FC
    ram.setU16(base + side.state, 2);                        // $28EF4A/$28F100
    return;
  }

  if ((ram.u8(flags) & 0x80) !== 0) return;                  // $28EF68/$28F11E
  const stateAddr = base + side.state;
  const state = ram.u16(stateAddr);

  if (state === 1) {
    if (ram.u16(side.lives) === 0) { endingFinishSide(ram, side); return; }
    scorePending(ram, side.who, 0x03000000);                 // $28EF82/$28F138
    ram.setU16(side.lives, u16(ram.u16(side.lives) - 1));    // $28EF8E/$28F144
    livesRow2878CC(ram, rom, ctx, side.index);               // $28EF94/$28F14A
    endingPostCues(ram, ctx, side.index === 1, true);
    return;
  }

  if (state === 2) {
    if (ram.u16(side.lives) === 0) {                         // $28EFC4/$28F17E
      ram.setU16(stateAddr, 3);                              // $28F006/$28F1C4
      return;
    }
    scorePending(ram, side.who, 0x05000000);                 // $28EFCE/$28F188
    ram.setU16(side.lives, u16(ram.u16(side.lives) - 1));
    livesRow2878CC(ram, rom, ctx, side.index);
    endingPostCues(ram, ctx, side.index === 1, false);
    return;
  }

  if (state === 3) {
    if ((ram.u8(side.rec) & 0x40) !== 0 || ram.u16(side.bonus) === 0) {
      ram.setU16(stateAddr, 4);                              // $28F066/$28F228
      return;
    }
    scorePending(ram, side.who, 0x10000000);                 // $28F02E/$28F1EC
    ram.setU16(side.bonus, 0);
    setPanelBody2532B6(ram, side.index, side.rec);            // $28F040/$28F1FE
    endingPostCues(ram, ctx, side.index === 1, false);
    return;
  }

  if (ram.u8(side.stockByte) === 0) { endingFinishSide(ram, side); return; }
  scorePending(ram, side.who, 0x00500000);                   // $28F078/$28F23A
  ram.setU8(side.stockByte, (ram.u8(side.stockByte) - 1) & 0xff);
  setPanelBody2532B6(ram, side.index, side.rec);              // $28F08A/$28F24C
  endingPostCues(ram, ctx, side.index === 1, false);
}

/** `$28D5FA..$28D638`, the ending tally's transition into object type 7. */
function endingHandoff28D5FA(ram, rom, ctx) {
  clear24631C(ram);                                          // $28D5FA
  objTableInit24107C(ram);                                   // $28D600
  clear28D552(ram);                                          // $28D606
  clear27F8C4(ram);                                          // $28D60A
  clear287DDC(ram);                                          // $28D610
  ram.setU16(SE.bossFlags, 0);                               // $28D616
  resetPower25313E(ram, ctx, SE.p1, 0x25313e);               // $28D61C
  resetPower25313E(ram, ctx, SE.p2, 0x25318e);               // $28D622
  ram.setU16(0x81b6ee, 0);                                  // $28D628
  return stageCreate(ram, SE.type7,
    (t) => rom.u16(SE.dispatch + t * 8 + 4));                // $28D630/$28D634
}

/** `$28EE88`, object dispatch type `$13` (decimal 19, priority `$001E`). */
export function makeStage5Ending(rom) {
  return function stage5Ending(ram, slot, index, ctx) {
    void index;
    const base = ENDING13.base;
    // `$28F276` is a bare `rts` in Version B, so the entry's first bsr is inert.
    if (ram.u8(slot + 0x02) === 0) { endingInit28EE66(ram, slot); return; } // $28EE92/$28EE96
    if (ram.u16(base + ENDING13.timer) !== 0) {              // $28EE98
      ram.setU16(base + ENDING13.timer,
        u16(ram.u16(base + ENDING13.timer) - 1));             // $28EEA0
      return;
    }
    endingSide28EEFA(ram, rom, ctx, ENDING_SIDES[0]);        // $28EEA6
    endingSide28EEFA(ram, rom, ctx, ENDING_SIDES[1]);        // $28EEAA
    if (ram.u16(base + ENDING13.active) !== 0) return;       // $28EEAE

    if (ram.u16(base + ENDING13.delay) !== 0) {              // $28EEB6
      const n = u16(ram.u16(base + ENDING13.delay) - 1);
      ram.setU16(base + ENDING13.delay, n);                  // $28EEBE
      if (n !== 0) return;                                   // $28EEC2
      const handle = loadAnimObjects24652A(ram, rom, ENDING13.animScript); // $28EEC6/$28EECC
      ram.setU32(base + ENDING13.handle, handle >>> 0);      // $28EED2
      return;
    }

    const handle = ram.u32(base + ENDING13.handle) >>> 0;    // $28EED8
    const sum = (handle === 0 || handle === 0xffffffff)
      ? 0 : chainCheck24681A(ram, handle);                   // $28EEDC
    if (sum !== 0) return;                                   // $28EEE2
    if (handle !== 0 && handle !== 0xffffffff) {
      freeAnimObjects246800(ram, handle);                    // $28EEE6/$28EEEA
    }
    const r = endingHandoff28D5FA(ram, rom, ctx);            // $28EEF0
    ram.setU16(slot, 0);                                     // $28EEF6
    ctx?.stageEndEvent?.('ending-handoff', r.addr, r.result);
  };
}

/**
 * `$28D63C` -- OBJECT TYPE 6.  The state tests run HIGH TO LOW in ONE pass
 * (4, 3, 2, $15, $B, 1, $A, 0) and they FALL THROUGH into each other, which is
 * exactly why the order matters: state 2 sets state 3 and the state-3 test is
 * ABOVE it, so the advance takes one frame per state and never two in one.
 */
export function makeStageClear(rom) {
  return function stageClear(ram, slot, index, ctx) {
    void index;
    const a5 = slot;
    if (ram.u8(a5 + 0x02) === 0) { init28D566(ram, a5, ctx); return; }   // $28D63C
    if (ram.u8(a5 + 0x02) === 2) { destroy28D5E6(ram, a5); return; }     // $28D644
    bannerDraw28EDC0(ram, rom, ctx);                             // $28D64C jsr $28EDC0
    const st = () => ram.u8(a5 + 0x06);
    // ---- state 4 ($28D652).  `$81DFF6` is set in state 2 and cleared ONLY by
    // `$28EAD4` inside `banner28E7F8` (called at the foot of this handler).  So
    // type 6 holds in state 4 for the banner's slide-out duration, then the
    // clear trips the `bne`'s opposite and type 6 self-destroys via state 2.
    if (st() === 4) {
      if (ram.u16(SE.dff6) === 0) ram.setU8(a5 + 0x02, 2);   // $28D65C/$28D664
    }
    // ---- state 3 ($28D66A) -- **THE REBUILD**
    if (st() === 3) {
      rebuildWorld25FD38(ram, ctx);                    // $28D674
      ram.setU8(SE.df1e, ram.u8(SE.df1e) & 0xfc);      // $28D67A
      ram.setU16(SE.clearing, 0);                      // $28D682
      ram.setU8(a5 + 0x06, 4);                         // $28D688
      ctx.stageEndEvent?.('rebuilt', ram.u32(SE.bgHandle), null);
    }
    // ---- state 2 ($28D68E) -- **THE STAGE COUNTER**
    if (st() === 2) {
      writeStage25FD0C(ram, ram.u16(a5 + 0x04));       // $28D698/$28D69C
      clear27F8C4(ram);                                // $28D6A2
      ram.setU16(SE.df22, 0);                          // $28D6A8
      ram.setU16(SE.e02c, 0xffff);                     // $28D6B0 jsr $28EDB6
      ram.setU16(SE.dff6, 1);                          // $28D6B6 jsr $28E7DC
      clear287DDC(ram);                                // $28D6BC
      ram.setU16(SE.advanceFlag, 0);                   // $28D6C2
      ram.setU8(a5 + 0x06, 3);                         // $28D6C8
      ctx.stageEndEvent?.('stage-written', ram.u16(SE.stage), null);
    }
    // ---- state $15 ($28D6CE) -- THE ENDING ARM, stage 5 only.
    if (st() === 0x15) {
      result28D9AA(ram, rom, ctx, a5);                 // $28D6DE bsr $28D9AA
      return;                                          // $28D6E2 rts
    }
    // ---- state $B ($28D6E4) -- the result screen's F8 returns immediately here
    // (state is already $B); the real work is the anim-chain check + free, and
    // W435 made the check a real WAIT -- the chain drains under
    // `runAnimObjects24683E` in 32 frames, one per `($20,node)` step.
    if (st() === 0x0b) {
      result28D9AA(ram, rom, ctx, a5);                 // $28D6F4 bsr $28D9AA
      const handle = ram.u32(a5 + 0x08) >>> 0;         // $28D6F8 move.l $8(A5),D0
      const sum = (handle === 0 || handle === 0xffffffff)
        ? 0 : chainCheck24681A(ram, handle);           // $28D6FC jsr $24681A
      // W435 -- THE WAIT, WHICH DEV-2 USED TO SKIP. [M] `$28D702 66 32` is
      // `bne.s $28D736`, and `$28D736` is where `$28D6EA bne.w` sends every
      // state that is NOT $B -- so a live chain leaves the free, the two power
      // resets, `$8130F8` and the state store all UNRUN, and the ladder below
      // matches nothing while the state is still $B. Returning here is that
      // branch. The guard on $0/$FFFFFFFF stays: the ROM would dereference
      // address $2C, this refuses to.
      if (sum !== 0) return;                           // $28D702 bne.s $28D736
      if (handle !== 0 && handle !== 0xffffffff) {
        freeAnimObjects246800(ram, handle);            // $28D704/$28D708 jsr $246800
      }
      resetPower25313E(ram, ctx, SE.p1, 0x25313e);     // $28D70E
      resetPower25313E(ram, ctx, SE.p2, 0x25318e);     // $28D714
      ram.setU8(SE.df1e, ram.u8(SE.df1e) & ~0x08);     // $28D71A bclr #3
      ram.setU16(SE.bossFlags, 0);                     // $28D722 clr.w $8130F8
      ram.setU16(0x81296e, 0);                         // $28D728
      ram.setU8(a5 + 0x06, 2);                         // $28D72E
      return;                                          // $28D734 rts
    }
    // ---- state 1 ($28D736) -- the result screen runs until F8 sees $8130F9
    // bit 1 (produced by the HUD tally `$285496`).  No DEV-1 stand-in: F8 inside
    // `result28D9AA` performs the real `$28DE5C..$28DE78` advance to state $B.
    if (st() === 1) {
      result28D9AA(ram, rom, ctx, a5);                 // $28D746 bsr $28D9AA
    }
    // ---- state $A ($28D74A) -- four frames, then the palette and the anim
    if (st() === 0x0a) {
      result28D9AA(ram, rom, ctx, a5);                 // $28D75A bsr $28D9AA
      const n = (ram.u8(a5 + 0x07) - 1) & 0xff;        // $28D75E subq.b #$1
      ram.setU8(a5 + 0x07, n);
      if (n === 0) {
        ram.setU16(SE.dffa, 1);                        // $28D764 jsr $28E7C0
        // $28D770 jsr $246410 -- the ANIMATION-OBJECT LOADER (a SIBLING of
        // `$24652A`, NOT the per-frame drain: W125 disasm). It reads the
        // `$28D7FE` script, claims a player slot at `$810346`, and installs N
        // nodes from `$80FA86` with full content (code ptrs from `$24627A`,
        // anim data from `$246B38`, the `$30(node)` script copy, lifetime
        // `$18:=$FFFF0000`). W435 CORRECTS THE SECOND HALF OF THIS NOTE: the
        // execution engine is NOT unported -- it is `runAnimObjects24683E`,
        // main-loop call #3. What still blocks this site is only the `$28D7FE`
        // script window, so the note now says that and nothing more.
        note(ctx, 0x246410, '$28D770 jsr $246410 off the $28D7FE script -- the '
          + 'ANIMATION-OBJECT LOADER (sibling of $24652A; seeds $18, does not '
          + 'drain it). The drain is runAnimObjects24683E and IS ported (W435); '
          + 'the $28D7FE script is not yet windowed');
        ram.setU8(a5 + 0x06, 1);                       // $28D776
        note(ctx, 0x28d77c, '$28D77C..$28D7DA -- sixteen longwords out of '
          + '$A00000+$5C0 (PALETTE RAM, which this port does not model) through '
          + '$246292 x32 into $81DF6C, then $24150A. Counted');
      }
    }
    // ---- state 0 ($28D7DC)
    if (st() === 0) {
      if (!bannerStep28ECCE(ram, ctx)) ram.setU8(a5 + 0x06, 0x0a);   // $28D7E6/$28D7F0
    }
    banner28E7F8(ram, ctx, rom);                                     // $28D7F6 jsr $28E7F8
  };
}

/**
 * `$253794` (P1) / `$2537E4` (P2) -- and it is NOT the "option-pod teardown" the
 * note here called it. It is the LOOP's zero-lives EXTEND:
 *
 *   253798: tst.w $813098  / beq exit      <- only on the LOOP
 *   2537A2: tst.w $812934  / bne exit
 *   2537AC: tst.w $81293C  / bne exit
 *   2537B6: tst.w $8130BE  / bne exit      <- only at ZERO lives
 *   2537C0: cmpi.w #$14,$8130BE / beq exit
 *   2537CC: addq.w #$1,$8130BE             <- one free life
 *   2537D2: jsr $2878CC                    <- that side's LIVES row
 *   2537D8: jsr $28C678                    <- the extend jingle
 *
 * The `cmpi.w #$14` is DEAD as written: $8130BE has already been proved zero two
 * instructions earlier, so it can never equal $14. Transcribed anyway -- this port
 * does not tidy the cartridge's redundancies, it records them.
 */
function loopExtend253794(ram, ctx, p2) {
  const lives = p2 ? 0x8130c0 : 0x8130be;
  if (ram.u16(0x813098) === 0) return;                 // $253798 / $2537E8
  if (ram.u16(p2 ? 0x812936 : 0x812934) !== 0) return; // $2537A2 / $2537F2
  if (ram.u16(p2 ? 0x81293e : 0x81293c) !== 0) return; // $2537AC / $2537FC
  if (ram.u16(lives) !== 0) return;                    // $2537B6 / $253806
  if (ram.u16(lives) === 0x14) return;                 // $2537C0 / $25380E -- dead
  ram.setU16(lives, u16(ram.u16(lives) + 1));          // $2537CC / $25381A
  // $2537D2 jsr $2878CC / $2537D8 jsr $28795C -- REDRAW THAT SIDE'S LIVES ROW, and
  // W445 WIRES IT. The note that stood here said "the same counted zero-RAM-write
  // draw hud.js defers"; `hud.js` has EXPORTED `livesRow2878CC` since W116 and does
  // not defer it -- `items.js` ($25311E/$253126) and `tally.js` ($260014/$26001E,
  // $260190/$2601CA) had it wired at four sites already. This was the fifth and the
  // ONLY one on a live path, so a loop extend granted the free life and left the row
  // on screen showing ZERO. `ctx.rom` is the same handle `bannerStep28ECCE` uses ten
  // functions up; without one, `livesRow2878CC`'s own `if (!rom)` arm counts the miss,
  // which is the declared no-resource fallback and not this deferral.
  //
  // [M] AND THE NOTE'S P2 ADDRESS WAS WRONG TOO: it printed "$2537D8 jsr $28795C",
  // but $2537D8 is `4eb9 0028c678`, P1's OWN jingle. P2's row call is `$253820
  // 4eb9 0028795c` and its jingle is `$253826`. The pair below is now [M]-correct.
  livesRow2878CC(ram, ctx?.rom, ctx, p2 ? 1 : 0);      // $2537D2 / $253820
  ctx?.soundPost?.(0x28c678);                          // $2537D8 / $253826
  ctx?.stageEndEvent?.('loop-extend', p2 ? 2 : 1, ram.u16(lives));
}

/** `$25313E` (P1) / `$25318E` (P2) -- the power/option reset a stage clear
 *  runs.  The top level is transcribed; its four sub-calls are counted. */
/** Exported for `w241loop-extend.test.js`: its caller is one arm of the result
 *  screen's own state machine. */
export function resetPower25313E(ram, ctx, base, addr) {
  const p2 = addr === 0x25318e;
  if ((ram.u16(base) & 0x8000) === 0) return;          // $25313E tst.w/bpl
  loopExtend253794(ram, ctx, p2);                      // $253146 / $253796 bsr
  ram.setU16(p2 ? 0x81293e : 0x81293c, 0);             // $25314A / $25319A
  ram.setU16(p2 ? 0x812946 : 0x812944, 0);             // $253150 / $2531A0
  if ((ram.u8(base) & 0x40) !== 0) return;             // $253156 btst #6/bne
  if (ram.u32(p2 ? 0x812904 : 0x8128f6) === 0) return; // $253160 tst.l/beq
  const cnt = p2 ? 0x812912 : 0x812910;
  if (ram.u16(cnt) === 8) return;                      // $253168 cmpi.w #$8/beq
  ram.setU16(cnt, u16(ram.u16(cnt) + 4));              // $253172 addq.w #$4
  note(ctx, p2 ? 0x2531fe : 0x2531de, `$${(p2 ? 0x2531C8 : 0x253178).toString(16)
    .toUpperCase()} bsr -- the pod respawn off the $25321E table, counted`);
  const lo = p2 ? 0x81291a : 0x812916;
  ram.setU16(lo, u16(ram.u16(lo) - 1));                // $25317C / $2531CC
  ram.setU16(p2 ? 0x812918 : 0x812914, ram.u16(lo));   // $253182 / $2531D2
}
