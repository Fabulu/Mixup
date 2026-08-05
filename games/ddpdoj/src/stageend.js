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
// **RECON 49 5.3 PRICED THE DEVIATION AT ONE SHORT-CIRCUIT.  IT IS TWO**, and
// this file makes both of them, in one place, each naming the instruction it
// stands in for and each counted in `unportedLog`:
//
//   DEV-1  `$28DE5C` -- state 1 -> $B.  The real producer of `$8130F9` bit 1 is
//          `$285496` and it is the ONLY one in build B (recon 49 3.1's census,
//          re-measured this wave: one `bset`, two `btst`).  `$28D9AA` is not
//          ported, so bit 1 is never produced; the port takes `$28DE5C`'s state
//          assignment directly.  **It also sets `$8130F9` bit 1 itself**, so
//          that a later wave which ports `$285496` for real makes the pinned
//          test `w62 DEV-1 is still the only producer of $8130F9 bit 1` go RED.
//   DEV-2  `$28D6FC` -- state $B -> 2.  The gate is `$24681A(($8,A5))` and
//          `($8,A5)` is written at `$28DE5C jsr $24652A`, inside the same
//          unported routine.  It is therefore 0, and `$24681A` would dereference
//          address $2C.  The port treats the (nonexistent) animation chain as
//          FINISHED and skips `$246800`, which has nothing to free.
//
// AND ONE EXIT IS **NOT** FAKED, deliberately: state 4 waits on `$28E7E6`,
// i.e. on `$81DFF6` going back to zero, and the only routine that clears it is
// `$28EAD4`, inside `$28E7F8`.  So the type-6 object REACHES STATE 4 AND STAYS
// THERE, holding one of the twenty object slots.  That is the honest
// consequence of not porting the banner and it is measured and reported rather
// than papered over -- everything the stage end has to do (`$25FD0C`,
// `$25FD38`) has already happened in states 2 and 3.

import { u16 } from './ram.js';
import { stageCreate, queueKill, ALLOC } from './objalloc.js';
import { clearItemPool } from './items.js';

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
  type6: 6,
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
 * explicitly ZERO (`$25FD7A`).  Stage 2 enters at clock 0, not at `$0038`.
 */
export function rebuildWorld25FD38(ram, ctx) {
  wipeStageBlock25FD24(ram);                           // $25FD38 bsr $25FD24
  // $25FD3A..$25FD64 -- eight resets.  Six are in the $288xxx/$289xxx cluster
  // W36 defers whole; `$27E98A` IS ported (src/items.js clearItemPool) and is
  // called for real below; `$26331E` and `$28131E` are counted.
  for (const a of [0x26331e, 0x288e0c, 0x289084, 0x289ae0, 0x28ac3a, 0x289f3a,
    0x28131e]) {
    note(ctx, a, `$25FD38's subsystem reset $${a.toString(16).toUpperCase()} `
      + `-- counted, not run (W62 ports the stage machine, not the subsystems)`);
  }
  clearItemPool(ram);                                  // $25FD5E jsr $27E98A
  const r = stageCreate(ram, 1, (t) => ctx.rom.u16(SE.dispatch + t * 8 + 4));
  ram.setU32(SE.bgHandle, r.ok ? ram.u32(r.addr + ALLOC.idOff) : 0);   // $25FD74
  ram.setU16(r.addr + 0x06, 0);                        // $25FD7A -- ENTRY CLOCK 0
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
  note(ctx, 0x28cb60, '$242952 jsr $28CB60 -- the stage-clear SOUND cue');
  ram.setU8(SE.bossFlags, ram.u8(SE.bossFlags) | 0x08);    // $242958 bset #3
  ram.setU8(SE.bossFlags, ram.u8(SE.bossFlags) & ~0x10);   // $242960 bclr #4
  ram.setU16(SE.clearing, 1);                              // $242968
  playerBit5(ram, SE.p1);                                  // $242970..$242992
  playerBit5(ram, SE.p2);                                  // $242994..$2429B6
  const d7 = u16(ram.u16(SE.stage) + 1);                   // $2429B8/$2429BE
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
function clear24631C(ram) {
  for (let i = 0; i <= 0x4af; i++) ram.setU16(0x80fa86 + i * 2, 0);   // $246322
  for (let i = 0; i < 3; i++) {                        // $24632E moveq #$2
    const a = 0x810346 + i * 0x30;                     // $246346 lea ($30,A0)
    ram.setU16(a, 0); ram.setU16(a + 4, 0); ram.setU32(a + 0x2c, 0);
  }
  for (let i = 0; i < 20; i++) {                       // $24634E move.w #$13
    const a = 0x80fa86 + i * 0x70;                     // $246362 lea ($70,A0)
    ram.setU16(a, 0); ram.setU32(a + 0x2c, 0);
  }
}
function clear28D552(ram) {
  for (let i = 0; i <= SE.resultWords; i++) ram.setU16(SE.result + i * 2, 0);
}
function clear287DC8(ram) {
  for (let a = 0x81b5b6; a !== 0x81b60c; a += 2) ram.setU16(a, 0);   // $287DD2 cmpa.l
}
function clear287DDC(ram) {
  for (let a = 0x81b60c; a !== 0x81b632; a += 2) ram.setU16(a, 0);   // $287DE6 cmpa.l
}
function clear28E7A2(ram) {
  for (let i = 0; i <= 0x27; i++) ram.setU16(SE.banner + i * 2, 0);
}
function clear23C47A(ram) {
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
    loadBannerArt(ram, ctx);                           // $28ECE2..$28ECF6
  }
  if (ram.u16(SE.e024) === 1) {                        // $28ECFC
    ram.setU16(SE.e028, u16(ram.u16(SE.e028) - 1));    // $28ED08 subq.w
    const b = ram.u8(SE.e026);                         // $28ED0E subq.b #$1
    ram.setU8(SE.e026, (b - 1) & 0xff);
    if (b === 0) {                                     // bcc -> $28ED64 while b != 0
      ram.setU8(SE.e026, ram.u8(SE.e026 + 1));         // $28ED18 -- from $81E027
      ram.setU16(SE.e028, 7);                          // $28ED22
      ram.setU16(SE.e02a, u16(ram.u16(SE.e02a) - 1));  // $28ED2A
      loadBannerArt(ram, ctx);                         // $28ED30..$28ED44
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
  note(ctx, 0x24150a, `$28ECF6/$28ED44 jsr $24150A -- the stage-clear BANNER's `
    + `resource install, entry [${d0}] of $28EE1E (data; $24150A is counted `
    + `everywhere in this port)`);
}

// ------------------------------------------------------------- the deviation
/** The two invented transitions, in one place, so a reader counts them.  Each
 *  key is the ROM instruction the port stands in for. */
export const PRESENTATION_DEVIATION = Object.freeze({
  0x28de5c: 'DEV-1 -- $28DE5C. The result screen $28D9AA (819 instructions) is '
    + 'NOT PORTED, so $8130F9 bit 1 -- whose ONLY producer in build B is '
    + '$285496, inside the HUD tally $285400 -- is never set and object type 6 '
    + 'can never leave state 1. The port performs $28DE5C\'s own state '
    + 'assignment (($6,A5) := $B) and sets $8130F9 bit 1 itself. THE MOMENT A '
    + 'WAVE PORTS $285496 FOR REAL, tests/w62stageend.test.js goes RED.',
  0x28d6fc: 'DEV-2 -- $28D6FC. ($8,A5) is written by $28DE5C jsr $24652A, in '
    + 'the same unported routine, so it is 0 and $24681A would dereference '
    + 'address $2C. The port treats the animation chain as FINISHED and skips '
    + '$246800, which would have nothing to free.',
});

/**
 * `$28D63C` -- OBJECT TYPE 6.  The state tests run HIGH TO LOW in ONE pass
 * (4, 3, 2, $15, $B, 1, $A, 0) and they FALL THROUGH into each other, which is
 * exactly why the order matters: state 2 sets state 3 and the state-3 test is
 * ABOVE it, so the advance takes one frame per state and never two in one.
 */
export function makeStageClear(rom) {
  return function stageClear(ram, slot, index, ctx) {
    void index; void rom;
    const a5 = slot;
    if (ram.u8(a5 + 0x02) === 0) { init28D566(ram, a5, ctx); return; }   // $28D63C
    if (ram.u8(a5 + 0x02) === 2) { destroy28D5E6(ram, a5); return; }     // $28D644
    note(ctx, 0x28edc0, '$28D64C jsr $28EDC0 -- the banner DRAW (the $23F82A/'
      + '$23DECE sprite path), the presentation tier');
    const st = () => ram.u8(a5 + 0x06);
    // ---- state 4 ($28D652).  NOT SHORT-CIRCUITED: see the header.
    if (st() === 4) {
      if (ram.u16(SE.dff6) === 0) ram.setU8(a5 + 0x02, 2);   // $28D65C/$28D664
      else note(ctx, 0x28e7f8, '$28D7F6/$28D65C -- $81DFF6 is still 1 because '
        + '$28E7F8\'s banner ($28EAD4 clr.w $81DFF6) is NOT PORTED, so type 6 '
        + 'HOLDS IN STATE 4 and keeps one object slot. Declared, not faked: '
        + 'the stage has already advanced in states 2 and 3');
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
      note(ctx, 0x28d9aa, '$28D6DE bsr $28D9AA from the ENDING arm (state $15). '
        + 'Reachable only when ($4,A5) == 5; recon 49 8 puts it after stage 5 '
        + 'exists');
      return;                                          // $28D6E2 rts
    }
    // ---- state $B ($28D6E4) -- the tally, then the handover to state 2
    if (st() === 0x0b) {
      note(ctx, 0x28d9aa, '$28D6F4 bsr $28D9AA -- THE RESULT SCREEN (819 '
        + 'instructions) and, through it, the HUD tally $285400..$285568 that '
        + 'awards the stage-clear score. The presentation tier, recon 49 8 '
        + 'wave B');
      note(ctx, 0x28d6fc, PRESENTATION_DEVIATION[0x28d6fc]);      // DEV-2
      // $28D704/$28D708 jsr $246800 -- nothing to free, see DEV-2.
      resetPower25313E(ram, ctx, SE.p1, 0x25313e);     // $28D70E
      resetPower25313E(ram, ctx, SE.p2, 0x25318e);     // $28D714
      ram.setU8(SE.df1e, ram.u8(SE.df1e) & ~0x08);     // $28D71A bclr #3
      ram.setU16(SE.bossFlags, 0);                     // $28D722 clr.w $8130F8
      ram.setU16(0x81296e, 0);                         // $28D728
      ram.setU8(a5 + 0x06, 2);                         // $28D72E
      return;                                          // $28D734 rts
    }
    // ---- state 1 ($28D736) -- where the result screen would decide
    if (st() === 1) {
      note(ctx, 0x28d9aa, '$28D746 bsr $28D9AA -- THE RESULT SCREEN, state 1');
      note(ctx, 0x28de5c, PRESENTATION_DEVIATION[0x28de5c]);      // DEV-1
      ram.setU8(SE.bossFlags9, ram.u8(SE.bossFlags9) | 0x02);     // stands for $285496
      ram.setU8(a5 + 0x06, 0x0b);                                 // $28DE64
    }
    // ---- state $A ($28D74A) -- four frames, then the palette and the anim
    if (st() === 0x0a) {
      note(ctx, 0x28d9aa, '$28D75A bsr $28D9AA -- THE RESULT SCREEN, state $A');
      const n = (ram.u8(a5 + 0x07) - 1) & 0xff;        // $28D75E subq.b #$1
      ram.setU8(a5 + 0x07, n);
      if (n === 0) {
        ram.setU16(SE.dffa, 1);                        // $28D764 jsr $28E7C0
        note(ctx, 0x246410, '$28D770 jsr $246410 off the $28D7FE script -- the '
          + 'ANIMATION-OBJECT loader, the presentation tier');
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
    note(ctx, 0x28e7f8, '$28D7F6 jsr $28E7F8 -- the stage-clear BANNER (299 '
      + 'instructions), the presentation tier');                    // $28D7F6
  };
}

/** `$25313E` (P1) / `$25318E` (P2) -- the power/option reset a stage clear
 *  runs.  The top level is transcribed; its four sub-calls are counted. */
function resetPower25313E(ram, ctx, base, addr) {
  const p2 = addr === 0x25318e;
  if ((ram.u16(base) & 0x8000) === 0) return;          // $25313E tst.w/bpl
  note(ctx, p2 ? 0x2537e4 : 0x253794, `$${(p2 ? 0x253796 : 0x253146).toString(16)
    .toUpperCase()} bsr $${(p2 ? 0x2537e4 : 0x253794).toString(16).toUpperCase()
    } -- the option-pod teardown, counted`);
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
