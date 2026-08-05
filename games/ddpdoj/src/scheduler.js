// THE BOSS SCRIPT SCHEDULER -- `$259554`, `$25962E`, `$2596C6` and the ten
// slot-table primitives around them.  W62 (S1).
//
// ============================================================================
// WHAT THIS IS
// ============================================================================
// Every boss in build B installs FIVE routine tables through `$259554` and then
// drives them from ONE call per frame -- `$25962E`, which its per-frame handler
// makes as its third instruction (`$292918` for the stage-1 boss).  The tables
// are the boss's brain; this file is the machine that turns their cranks.
//
// `$259554` (read out of the ROM this wave) takes the five bases in A0..A4 and
// stores each behind a POINTER WORD, leaving the pointer at ZERO when the
// register is zero.  Every walk below is gated on `tst.l <pointer>`, so an
// UNINSTALLED table is not an error -- it is a walk that does nothing:
//
//   A0 -> $812984   the MAIN sequencer.  Single-threaded: one cursor word
//                   $81298A, one sub-cursor $812988, a 16-word parameter block
//                   copied from $8129AC to $81298C on each restart.
//   A1 -> $812BD4   ten slots at $812BD8, stride $20
//   A2 -> $8129CC   twenty slots at $8129D0, stride 8 -- and this one is
//                   PRE-FILLED: `$2595B8` copies longwords out of the table
//                   itself until it meets `$FFFFFFFF`, writing status $8000 and
//                   the routine pointer into each slot.  The stage-1 boss's
//                   list ($292932) has SEVEN entries.
//   A3 -> $812A70   ten slots at $812A74, stride $20   <- **D-SCRIPT 6 LIVES HERE**
//   A4 -> $812D38   five slots at $812D3C, stride $20
//
// ============================================================================
// THE FALL-THROUGH, AND IT IS THE BIGGEST TRAP IN THIS FILE
// ============================================================================
// `docs/knowledge/02`, seventeen incidents.  **`$2596C6` IS NOT "THE A4 WALK".**
// Its `dbra` at `$259702` runs off the end into `$259706`, which is the A0
// walk, which runs into `$259782` (A1) and `$2597CA` (A3), and the `rts` that
// ends the whole thing is at `$25980A`.  So ONE `bsr $2596C6` steps FOUR of the
// five tables.  A reader who took the label for the routine would find the
// D-scripts never advancing and no instruction to blame.
//
// The FIFTH (A2, at `$8129D0`) is walked by `$25962E` itself, at `$259682`.
//
// AND `$25962E` CALLS `$2596C6` TWICE.  `$259648` always; `$25967E` again when
// five gates all pass (`$8130F8` bit 6 clear, bit 4 SET, `$81B63E|$81B640`
// non-zero, `$81309C` non-negative, `$80390C` non-zero).  That is the boss's
// DOUBLE-PASS, and `$242960 bclr #4,$8130F8` -- the second instruction of the
// stage advance -- is what disarms it.  Transcribed as two calls, because on
// the frames the gates pass the board really does step every script twice.
//
// ============================================================================
// THE CARRY IS THE WHOLE POINT
// ============================================================================
// `$25962E` returns the 68000 C flag and its caller branches on it:
//
//   25962E: tst.w $812E06 / beq $25963E
//   259638: ori.w #$1,sr / rts          <- C = 1, and NOTHING ELSE RUNS
//   ...
//   2596C0: andi.w #$FFFE,sr / rts      <- C = 0, the normal exit
//
// `$812E06` has exactly one writer in build B, `$2595E8 move.w #$1,$812E06`,
// and six callers -- one per boss, each inside that boss's death script.  So
// C=1 means "the boss's death animation has finished" and it is the signal the
// stage advance rides on (`$29291E bcc` NOT taken -> `$292922 jsr $242952`).
//
// ============================================================================
// UNPORTED SCRIPTS ARE LOUD NAMED THROWS
// ============================================================================
// Every walk here dispatches through a register (`jsr (a3)` / `jsr (a0)`), so
// the port cannot know statically what it will be asked to run.  `SCRIPTS` is
// an explicit registry; anything not in it reaches `unreached()` carrying the
// ROM address the register held.  A quiet return here would be a boss that
// silently does nothing, which is exactly the class of defect
// `docs/knowledge/02` says has shipped twice.

import { unreached } from './unported.js';
import { u16, i16 } from './ram.js';

/** The five pointer words and their slot tables, as `$259554` lays them out. */
export const SCHED = {
  // pointers ($259574/$25958C/$25959C/$2595AC/$2595DC)
  ptrA0: 0x812984, ptrA1: 0x812bd4, ptrA2: 0x8129cc, ptrA3: 0x812a70,
  ptrA4: 0x812d38,
  // A0, the main sequencer
  seqRestart: 0x812980,   // $2598D0 move.w #$1
  seqPending: 0x812982,   // $2598D0 move.w D0
  seqCursor: 0x81298a,    // $259722 -> from $812982; $FFFF = idle
  seqSub: 0x812988,       // $259760 add.w / $25977C addq.w #$4
  seqSrc: 0x8129ac,       // $259734 lea -- the 16-word parameter template
  seqDst: 0x81298c,       // $25973A lea -- A4 for the dispatched routine
  // the four slot tables
  a1Base: 0x812bd8, a1Slots: 10, a1Stride: 0x20,
  a2Base: 0x8129d0, a2Slots: 20, a2Stride: 0x08,
  a3Base: 0x812a74, a3Slots: 10, a3Stride: 0x20,
  a4Base: 0x812d3c, a4Slots: 5,  a4Stride: 0x20,
  // the wipe $259558 performs before installing: $812980 + $244 words
  wipeBase: 0x812980, wipeWords: 0x244,
  // the suspend
  suspend: 0x812e06,      // $2595E8 / $25962E
  deathPause: 0x8130d2,   // $25963E
  bossFlags: 0x8130f8,    // $25964C btst #6 / $259656 btst #4
  earnA: 0x81b63e, earnB: 0x81b640,
  playerState: 0x81309c,  // $25966E tst.w / bmi
  mirror2: 0x80390c,      // $259676 tst.w / beq
  // $259BB4, the fade
  fadeState: 0x812dfc, fadeLevel: 0x812e00, fadeStep: 0x812e02,
  fadeHold: 0x812e04, fadeParam: 0x812dfe,
};

/**
 * `$259554` -- install the five tables.  A zero register leaves its pointer
 * alone (and therefore at whatever the `$259558` wipe left, which is 0).
 * @param t {{a0?:number,a1?:number,a2?:number,a3?:number,a4?:number}}
 */
export function installScripts(ram, rom, t) {
  // $259558..$259566 -- `move.w #$243,D0 / move.w #$0,(A6)+ / dbra`, i.e.
  // $244 = 580 words from $812980, so $812980..$812E06 inclusive is ZEROED.
  // That is where every slot table, both cursors and the SUSPEND word live, so
  // installing a boss also clears the previous one's suspend.
  for (let i = 0; i <= SCHED.wipeWords; i++) ram.setU16(SCHED.wipeBase + i * 2, 0);
  if (t.a0) {                                          // $25956A cmpa.l #$0,A0
    ram.setU32(SCHED.ptrA0, t.a0);                     // $259574
    ram.setU16(SCHED.seqCursor, 0xffff);               // $25957A -- IDLE
  }
  if (t.a3) ram.setU32(SCHED.ptrA3, t.a3);             // $25958C
  if (t.a1) ram.setU32(SCHED.ptrA1, t.a1);             // $25959C
  if (t.a2) {                                          // $2595A2
    ram.setU32(SCHED.ptrA2, t.a2);                     // $2595AC
    // $2595B2..$2595D0 -- PRE-FILL.  Each longword of the table until $FFFFFFFF
    // becomes one slot: status $8000 (bit 15 = present) and the routine
    // pointer.  Bit 0 -- the RUN bit the walk tests -- stays CLEAR, so a
    // pre-filled slot is dormant until `$2598E6` ors it in.
    let src = t.a2, dst = SCHED.a2Base;
    for (;;) {
      const v = rom.u32(src); src += 4;
      if (v === 0xffffffff) break;                     // $2595BA cmpi.l
      ram.setU16(dst, 0x8000);                         // $2595C4
      ram.setU32(dst + 2, v);                          // $2595C8
      dst += SCHED.a2Stride;                           // $2595CC
    }
  }
  if (t.a4) ram.setU32(SCHED.ptrA4, t.a4);             // $2595DC
}

// ------------------------------------------------------------- the primitives
// Ten routines, all of them pure slot-table arithmetic, all read out of the ROM
// this wave.  They are grouped here rather than beside their callers because
// six different files' worth of boss code calls them and they share the tables.

/** `$2595E8` -- THE GLOBAL SUSPEND.  One instruction and it ends the stage. */
export function suspend2595E8(ram) { ram.setU16(SCHED.suspend, 1); }

/** `$2598D0` -- arm the MAIN sequencer to (re)start script D0 next frame. */
export function seqStart2598D0(ram, d0) {
  ram.setU16(SCHED.seqRestart, 1);                     // $2598D0
  ram.setU16(SCHED.seqPending, u16(d0));               // $2598D8
}

/** `$2598E6` -- set the RUN bit of A2 slot D0 (stride 8, `lsl.w #$3`). */
export function a2Run2598E6(ram, d0) {
  const a = SCHED.a2Base + (u16(d0) << 3);             // $2598F0/$2598F2
  ram.setU16(a, ram.u16(a) | 1);                       // $2598F4 ori.w #$1,(A0)
}

/** `$25994A` -- clear the RUN bit of A2 slot D0 (`andi.w #$FFFE`). */
export function a2Stop25994A(ram, d0) {
  const a = SCHED.a2Base + (u16(d0) << 3);             // $259954/$259956
  ram.setU16(a, ram.u16(a) & 0xfffe);                  // $259958
}

/** `$259962` -- START A3 SCRIPT D0.  If a slot already carries it, return the
 *  slot's parameter block ($812BB4, which the ROM hands back in A0 and the
 *  stage-1 boss's caller ignores); otherwise claim the first EMPTY slot and
 *  write `$8000 | D0`.  Ten slots; a full table is a SILENT DROP. */
export function a3Start259962(ram, d0) {
  for (let i = 0; i < SCHED.a3Slots; i++) {            // $25996C moveq #$9
    const a = SCHED.a3Base + i * SCHED.a3Stride;
    const s = ram.u16(a);                              // $25996E
    if (s !== 0 && (s & 0xff) === u16(d0)) return false; // $259978 cmp.w/beq
  }
  for (let i = 0; i < SCHED.a3Slots; i++) {            // $25998C moveq #$9
    const a = SCHED.a3Base + i * SCHED.a3Stride;
    if (ram.u16(a) !== 0) continue;                    // $25998E tst.w/bne
    ram.setU16(a, u16(d0 | 0x8000));                   // $259994/$259998
    return true;
  }
  return false;                                        // ten slots, all taken
}

/** `$2599EC` -- stop every A3 slot carrying script D0. */
export function a3Stop2599EC(ram, d0) {
  for (let i = 0; i < SCHED.a3Slots; i++) {
    const a = SCHED.a3Base + i * SCHED.a3Stride;
    const s = ram.u16(a);                              // $2599F8
    if (s !== 0 && (s & 0xff) === u16(d0)) ram.setU16(a, 0);  // $259A08 clr.w
  }
}

/** `$25980C` -- START A4 SCRIPT D0 in the first empty slot.  FIVE slots, and
 *  the full-table arm at `$259832` just loads A0 with `$812DDC` and returns --
 *  a silent drop, exactly like `$259962`'s. */
export function a4Start25980C(ram, d0) {
  for (let i = 0; i < SCHED.a4Slots; i++) {            // $259816 moveq #$4
    const a = SCHED.a4Base + i * SCHED.a4Stride;
    if (ram.u16(a) !== 0) continue;                    // $259818 tst.w/bne
    ram.setU16(a, u16(d0 | 0x8000));                   // $25981E/$259822
    return true;
  }
  return false;                                        // $259832
}

/** `$25983E` -- IS A4 SCRIPT D0 RUNNING?  Returns the C flag: true (C=1) when
 *  a slot carries it, false (C=0) when none does. */
export function a4Running25983E(ram, d0) {
  for (let i = 0; i < SCHED.a4Slots; i++) {
    const a = SCHED.a4Base + i * SCHED.a4Stride;
    const s = ram.u16(a);                              // $25984A
    if (s !== 0 && (s & 0xff) === u16(d0)) return true;  // $259854 cmp.w/beq
  }
  return false;                                        // $259870
}

/** `$2598A2` -- clear all five A4 slots. */
export function a4Clear2598A2(ram) {
  for (let i = 0; i < SCHED.a4Slots; i++) ram.setU16(SCHED.a4Base + i * SCHED.a4Stride, 0);
}

/** `$259B34` -- clear all ten A1 slots. */
export function a1Clear259B34(ram) {
  for (let i = 0; i < SCHED.a1Slots; i++) ram.setU16(SCHED.a1Base + i * SCHED.a1Stride, 0);
}

/** `$259B7E` -- ARM THE FADE.  D0 is stashed at `$812DFE`; the level starts at
 *  `$1C00` and `$259BB4` walks it down. */
export function fadeArm259B7E(ram, d0) {
  ram.setU16(SCHED.fadeParam, u16(d0));                // $259B7E
  ram.setU16(SCHED.fadeState, 1);                      // $259B84
  ram.setU16(SCHED.fadeLevel, 0x1c00);                 // $259B8C
  ram.setU16(SCHED.fadeStep, 1);                       // $259B94
}

/** `$259B9E` -- IS THE FADE DONE?  Returns the C flag: false (C=0) when
 *  `$812DFC` is zero, i.e. finished. */
export function fadeDone259B9E(ram) { return ram.u16(SCHED.fadeState) !== 0; }

/**
 * `$259BB4` -- THE FADE, one step.  Called from `$2596C0`'s predecessor
 * `$2596BC bsr $259BB4`, i.e. once per `$25962E`, unconditionally.
 *
 * `$259BF0 subi.w #$400,$812E00 / bpl` is SIGNED: the level starts at `$1C00`
 * and takes SEVEN steps to go negative, at which point it is floored to 0, the
 * step is jammed to `$E0`, the state becomes 2 and the hold counter 1 -- so
 * state 2 lasts exactly ONE more frame.  EIGHT frames from `$259B7E` to
 * `$812DFC == 0`, which is what `$259B9E`'s caller is waiting for.
 */
export function fadeStep259BB4(ram, note) {
  if (ram.u16(SCHED.fadeState) === 0) return;          // $259BB4 tst.w/beq
  if (ram.u16(SCHED.fadeState) === 2) {                // $259BC0 cmpi.w #$2
    const n = u16(ram.u16(SCHED.fadeHold) - 1);        // $259BCC subq.w #$1
    ram.setU16(SCHED.fadeHold, n);
    if (n === 0) ram.setU16(SCHED.fadeState, 0);       // $259BD6 clr.w
  }
  if (ram.u16(SCHED.fadeState) === 1) {                // $259BDC cmpi.w #$1
    ram.setU16(SCHED.fadeStep, u16(ram.u16(SCHED.fadeStep) + 0x20));   // $259BE8
    const lv = u16(ram.u16(SCHED.fadeLevel) - 0x400);  // $259BF0 subi.w #$400
    ram.setU16(SCHED.fadeLevel, lv);
    if (i16(lv) < 0) {                                 // $259BF8 bpl
      ram.setU16(SCHED.fadeLevel, 0);                  // $259BFC
      ram.setU16(SCHED.fadeStep, 0xe0);                // $259C04
      ram.setU16(SCHED.fadeState, 2);                  // $259C0C
      ram.setU16(SCHED.fadeHold, 1);                   // $259C14
    }
  }
  // $259C1C onwards -- the PALETTE WRITE the fade drives ($812E00 -> D1,
  // `#$3800` -> D3 and the $3800-word palette block).  Counted, not run: it is
  // the same $23Fxxx/$24Cxxx palette subsystem the rest of this port defers,
  // and nothing in the stage-end chain reads back what it writes.
  note?.(0x259c1c, 'the fade\'s PALETTE WRITE $259C1C ($812E00 -> the $3800 block)');
}

// ============================================================== THE FIVE WALKS

/**
 * `$2596C6..$25980A` -- FOUR walks, one routine, because of the fall-through
 * documented in the header.  A4 first, then A0 (the main sequencer), then A1,
 * then A3.
 *
 * The slot protocol is identical in A4, A1 and A3 and it is worth stating once:
 *
 *   d0 = (a4).w & $FF          the SCRIPT ID
 *   d0 <<= 3                   8 bytes per table entry: {init, step}
 *   bset #0,(a4)               ...and if it was ALREADY set, d0 += 4
 *
 * so a slot runs its INIT on the first frame and its STEP on every frame after,
 * chosen by one bit of the slot's own status word.  A1 has one extra gate:
 * `$2597AA btst #$1,(a4) / bne` skips a slot whose bit 1 is set (`$259B50`
 * sets it), which A3 and A4 do not have.
 */
function walk2596C6(ram, rom, ctx) {
  const call = (table, off, a4, d7) => runScript(ram, rom, ctx, rom.u32(table + off), a4, d7);
  // --- A4, five slots ($2596C6..$259702)
  if (ram.u32(SCHED.ptrA4) !== 0) {                    // $2596C6 tst.l/beq
    const tab = ram.u32(SCHED.ptrA4);
    for (let i = 0; i < SCHED.a4Slots; i++) {          // $2596D6 moveq #$4
      const a = SCHED.a4Base + i * SCHED.a4Stride;
      const s = ram.u16(a);
      if (s === 0) continue;                           // $2596DA beq
      let off = (s & 0xff) << 3;                       // $2596DE/$2596E2
      const was = (ram.u8(a) & 1) !== 0;               // $2596E4 bset.b #$0,(A4)
      ram.setU8(a, ram.u8(a) | 1);
      if (was) off += 4;                               // $2596EC addq.w #$4
      call(tab, off, a, 4 - i);                        // $2596FA jsr (A0)
    }
  }
  // --- A0, THE MAIN SEQUENCER ($259706..$259780)
  if (ram.u32(SCHED.ptrA0) !== 0) {                    // $259706 tst.l/beq
    if (ram.u16(SCHED.seqRestart) !== 0) {             // $259710 tst.w/beq
      ram.setU16(SCHED.seqRestart, 0);                 // $25971A
      ram.setU16(SCHED.seqCursor, ram.u16(SCHED.seqPending));   // $259722
      ram.setU16(SCHED.seqSub, 0);                     // $25972C
      // $259734..$259748 -- SIXTEEN words copied from $8129AC to $81298C.
      for (let w = 0; w < 16; w++) {
        ram.setU16(SCHED.seqDst + w * 2, ram.u16(SCHED.seqSrc + w * 2));
      }
    }
    const cur = ram.u16(SCHED.seqCursor);              // $259750
    if (cur !== 0xffff) {                              // $259756 cmpi.w #$FFFF
      const off = u16((cur << 3) + ram.u16(SCHED.seqSub));   // $25975E/$259760
      runScript(ram, rom, ctx, rom.u32(ram.u32(SCHED.ptrA0) + off),
        SCHED.seqDst, 0);                              // $259770 jsr (A0)
      // $259772 -- the routine may have moved the sub-cursor itself; only an
      // UNMOVED one is stepped.  That is how a sequencer entry says "stay".
      if (ram.u16(SCHED.seqSub) === 0) {
        ram.setU16(SCHED.seqSub, u16(ram.u16(SCHED.seqSub) + 4));   // $25977C
      }
    }
  }
  // --- A1, ten slots ($259782..$2597C8)
  if (ram.u32(SCHED.ptrA1) !== 0) {                    // $259782 tst.l/beq
    const tab = ram.u32(SCHED.ptrA1);
    for (let i = 0; i < SCHED.a1Slots; i++) {          // $259792 moveq #$9
      const a = SCHED.a1Base + i * SCHED.a1Stride;
      const s = ram.u16(a);
      if (s === 0) continue;                           // $259796 beq
      let off = (s & 0xff) << 3;                       // $25979A/$25979E
      const was = (ram.u8(a) & 1) !== 0;               // $2597A0 bset.b #$0,(A4)
      ram.setU8(a, ram.u8(a) | 1);
      if (was) off += 4;                               // $2597A8
      if ((ram.u8(a) & 2) !== 0) continue;             // $2597AA btst #$1/bne
      call(tab, off, a, 9 - i);                        // $2597BE jsr (A0)
    }
  }
  // --- A3, ten slots ($2597CA..$259808) -- **THE D-SCRIPTS**
  if (ram.u32(SCHED.ptrA3) !== 0) {                    // $2597CA tst.l/beq
    const tab = ram.u32(SCHED.ptrA3);
    for (let i = 0; i < SCHED.a3Slots; i++) {          // $2597DA moveq #$9
      const a = SCHED.a3Base + i * SCHED.a3Stride;
      const s = ram.u16(a);
      if (s === 0) continue;                           // $2597DE beq
      let off = (s & 0xff) << 3;                       // $2597E2/$2597E6
      const was = (ram.u8(a) & 1) !== 0;               // $2597E8 bset.b #$0,(A4)
      ram.setU8(a, ram.u8(a) | 1);
      if (was) off += 4;                               // $2597F0
      call(tab, off, a, 9 - i);                        // jsr (A0)
    }
  }
}

/**
 * `$25962E` -- ONE FRAME OF EVERY SCRIPT, and the carry that ends the stage.
 * @returns {boolean} the 68000 C flag.  TRUE means "suspended": the caller's
 *   `bcc` is not taken and the stage advance runs.
 */
export function runScheduler25962E(ram, rom, ctx) {
  if (ram.u16(SCHED.suspend) !== 0) return true;       // $25962E/$259638 ori #$1,sr
  if (ram.u16(SCHED.deathPause) === 0) {               // $25963E tst.w/bne
    walk2596C6(ram, rom, ctx);                         // $259648 bsr $2596C6
    // $25964C..$25967E -- THE DOUBLE PASS.  Five gates, and `$242960 bclr
    // #$4,$8130F8` (the stage advance's second instruction) is what disarms it.
    const f = ram.u8(SCHED.bossFlags);
    if ((f & 0x40) === 0 && (f & 0x10) !== 0           // $25964C / $259656
      && (ram.u16(SCHED.earnA) | ram.u16(SCHED.earnB)) !== 0   // $259660/$259666
      && i16(ram.u16(SCHED.playerState)) >= 0          // $25966E tst.w/bmi
      && ram.u16(SCHED.mirror2) !== 0) {               // $259676 tst.w/beq
      walk2596C6(ram, rom, ctx);                       // $25967E bsr $2596C6
    }
  }
  // --- A2, twenty slots, stride EIGHT ($259682..$2596BA).  This walk is not in
  // $2596C6 and its protocol is DIFFERENT: the routine pointer lives IN the
  // slot ($2(a4)) rather than in a table, and the gates are bit 15 of the
  // status word (present) plus bit 0 (running).
  if (ram.u32(SCHED.ptrA2) !== 0) {                    // $259682 tst.l/beq
    for (let i = 0; i < SCHED.a2Slots; i++) {          // $259692 move.w #$13
      const a = SCHED.a2Base + i * SCHED.a2Stride;
      if (i16(ram.u16(a)) >= 0) continue;              // $259696 tst.w/bpl
      if ((ram.u8(a + 1) & 1) === 0) continue;         // $25969C btst #$0,$1(A4)
      runScript(ram, rom, ctx, ram.u32(a + 2), a, 0x13 - i);   // $2596AE jsr (A3)
    }
  }
  fadeStep259BB4(ram, ctx.unportedLog
    ? (ad, w) => ctx.unportedLog.note(ad, w) : null);  // $2596BC bsr $259BB4
  return false;                                        // $2596C0 andi #$FFFE,sr
}

// =========================================================== THE SCRIPT BODIES
//
// The registry.  A `jsr (An)` is invisible to every static scanner this project
// owns (`xref.py`'s own header says so), so this map is the port's ONLY
// statement about what can be dispatched -- and anything outside it stops the
// run by address rather than doing nothing.

/** addr -> fn(ram, rom, ctx, a4, d7).  Filled by the modules that own the
 *  scripts (src/boss.js registers D-script 6). */
const SCRIPTS = new Map();

export function registerScript(addr, fn) { SCRIPTS.set(addr & 0xffffff, fn); }
export function scriptAddresses() { return [...SCRIPTS.keys()]; }

function runScript(ram, rom, ctx, addr, a4, d7) {
  const fn = SCRIPTS.get(addr & 0xffffff);
  if (!fn) {
    unreached(addr & 0xffffff, `boss SCRIPT at $${(addr & 0xffffff).toString(16)
      .toUpperCase()}, dispatched through a register by $25962E/$2596C6 for the `
      + `slot at $${a4.toString(16).toUpperCase()}. W62 registered only the `
      + `D-script the STAGE END rides on {`
      + [...SCRIPTS.keys()].map((x) => `$${x.toString(16).toUpperCase()}`).join(' ')
      + `}; the rest of the boss's five tables are recon 48's three waves`);
  }
  fn(ram, rom, ctx, a4, d7);
}
