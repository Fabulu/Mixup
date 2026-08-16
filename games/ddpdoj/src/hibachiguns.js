// HIBACHI'S A1 GUN TABLE `$2A72C8`, AND THE A4 SCRIPTS THAT DRIVE IT.  W404.
//
// ============================================================================
// THE TABLE HAS FOURTEEN ENTRIES, NOT FIFTEEN, AND THERE ARE TWO OF THEM
// ============================================================================
// W403's handoff said "the fifteen-entry A1 table at $2A72C8".  It is FOURTEEN
// `{init, step}` pairs, `$2A72C8..$2A7337`, and the count is bounded four ways,
// every one of them a positive witness:
//
//   1. `$2A7338`, where entry [14] would start, holds `4254 4E75` -- `clr.w
//      (A4) / rts`, two INSTRUCTIONS.  Read as a pointer that is `$42544E75`,
//      which is past the end of a 6 MB image.
//   2. `$2A4328 lea $2A92A8,A1` installs a SECOND gun table (see below) whose
//      entry [14] is `$20800202`, the head of a data blob -- the same shape
//      `$2A733C` has, four bytes further on.  Two independent copies, both
//      stopping after fourteen.
//   3. `4E75` sits immediately before all 28 step entries of both tables
//      (`table[id].step - 2`), and before neither candidate fifteenth.
//   4. Every `moveq #n,D0 / jsr $259A18` and `/ jsr $259B08` in
//      `$2A4000..$2AB000` loads n in 0..$D.  Fourteen ids, no id $E.
//
// **AND `$2A4306` IS NOT THE ONLY `lea`.**  `$2A431E tst.w $813098 / $2A4324
// bne.w $2A432E` SKIPS `$2A4328 lea $2A92A8,A1`, so the loop word being ZERO --
// the first credit -- installs `$2A92A8` and every later loop keeps `$2A72C8`.
// `src/initbody.js` has read that branch correctly since W369; what nobody had
// noticed is what the two tables SHARE:
//
//   ids 0..4   differ    $2A738A.. vs $2A9366..   two whole sets of five guns
//   ids 5..$D  IDENTICAL, pointer for pointer, all nine pairs
//
// So the two waits the ending chain stops on -- gun 5 for A4 $A, gun 9 for A4
// $F -- are the SAME CODE on both loops, and porting them is loop-independent.
// The nine shared pairs are asserted byte for byte by the test rather than
// argued here.
//
// ============================================================================
// THE A1 CONVENTION IS THE OPPOSITE OF THE A4 CONVENTION
// ============================================================================
// W403 established that NOT ONE of `$2A5886`'s twenty-one A4 pairs puts an
// `rts` between its init and its step, so `$2596FA jsr (A0)` runs both on the
// first frame and every A4 countdown starts a frame early.  **All fourteen A1
// pairs are the other way**: `4E75` stands at `step - 2` in 14 of 14 (28 of 28
// across both tables), so `$2597BE jsr (A0)` runs the init ALONE on the first
// frame and the gun's own counters start at their nominal value.  The
// convention is per table and neither one may be assumed from the other.
//
// ============================================================================
// THE STOP AT FRAME 321 AND WHAT IS BEHIND IT
// ============================================================================
// A4 $A `$2A689C` counts ONE frame, starts gun 5 and waits on it; when gun 5
// retires it starts A4 $B.  A4 $B waits on gun 6 and starts A4 $C; A4 $C waits
// on gun 7 and starts A4 $D; A4 $D waits on gun 8, pauses $40 frames and starts
// A4 $A again.  **{$A, $B, $C, $D} x {gun 5, 6, 7, 8} is a CLOSED LOOP** -- it
// is HIBACHI's phase-B attack cycle and nothing in it is an ending step.  This
// wave ports A4 $A/$B/$C and guns 5 and 6; gun 7 (`$2A8516`) is where the loop
// now stops, counted with its extent below.
//
// The parallel loop {6,7,8,9} x {gun 0,1,2,3} and the chain {$F,$10,$11,$12} x
// {gun 9,$A,$B,$C} have the same shape and are reached by other entries.
//
// ============================================================================
// WHAT EACH GUN'S SLOT HOLDS -- IT IS A COPIED TEMPLATE, NOT LOOSE FIELDS
// ============================================================================
// Every gun init is `lea (d16,PC),A0 / lea ($2,A4),A1 / moveq #n,D0 / move.w
// (A0)+,(A1)+ / dbra`, i.e. n+1 WORDS copied into `($2,A4)` upward, and then a
// few `add`s off `A6` that are the per-loop difficulty ramp.  The templates are
// ROM data and are read through windows, never written down here.
//
// The layout in the image is `[gun N code][gun N+1 template][8 longwords][gun
// N+1 code]`, so a gun's table-entry-to-table-entry extent INCLUDES the NEXT
// gun's data blob.  The eight longwords in each blob all hold that gun's own
// init address and nothing in the 6 MB image references any of them; they are
// counted as data, not read.
//
// ============================================================================
// TWO ROM DEFECTS TRANSCRIBED AS WRITTEN
// ============================================================================
// 1. **`$2A83F4 302C 0008` is `move.w ($8,A4),D0`, a DEAD STORE** (TRAP 22).
//    `($8,A4)` is gun 6's speed bias and every other gun in the family loads
//    its kind/bias pair with `move.l` (`$2A825E`, `$2A8586`, `$2A888C`); this
//    one uses `move.w`, and `$2A840E move.w ($A,A4),D0` overwrites the low word
//    eight instructions later without a `swap` in between.  `$2A8400` is a
//    `4E71 nop` where a `swap D0` would fit -- and the build-A twin at
//    `$1A6EB6` has the SAME `move.w` and the SAME `nop`, so it is the ROM and
//    not a patch.  The consequence is real and measurable: gun 6's bias comes
//    out of `$242E24`'s ZERO high word instead of `($8,A4)`, and the `add.w D0,
//    ($8,A4)` its own init performs is therefore unobservable.
// 2. **Gun 5 writes `($5,A4)` and never reads it.**  `$2A81F0 add.b D0,($5,A4)`
//    has no reader anywhere in `$2A81BC..$2A8340`; gun 6 and gun 7 both reload
//    `($4,A4)` from it (`$2A849C`, `$2A8642`) and gun 5 does not.
//
// ============================================================================
// WHAT IS SHARED WITH ALREADY-PORTED CODE, AND WHAT ONLY LOOKS SHARED
// ============================================================================
// `$2A8228..$2A8246` and `$2A83AE..$2A83D0` are `$24270A` INLINED -- `lea
// $8103E6,A0 / lea $810448,A1 / tst.b ($3,A5) / exg / tst.w (A0) / bmi / tst.w
// (A1) / bpl <skip> / exg`.  Instruction for instruction the same decision
// `src/aim.js`'s `targetSelect` makes, so it is called rather than rewritten;
// what differs is only WHERE the "both players dead" arm lands, and that is a
// branch in this file, not in the helper.
//
// The two `$2817C2` volley loops in gun 5 walk `$26BFFC`, the 64-longword
// vector table W31/W176 already windowed for type $8C.  No new window there.

import { u16, i16 } from './ram.js';
import { registerScript, a4Start25980C, a1Start259A18, a1Running259A4A,
  a1Stop259B08, a2Stop25994A, a2Run2598E6, seqStart2598D0 } from './scheduler.js';
import { aim256, AimTables, targetSelect } from './aim.js';
import { drawByte242E24, drawWord242EC2 } from './rng.js';
import { fire, WriteLog } from './bullets.js';
import { bossA5, bossA6 } from './boss.js';

const u8 = (v) => v & 0xff;

/** Every ROM address this file names, so a test can assert the map against the
 *  image instead of against prose. */
export const HIBACHI_A1 = Object.freeze({
  main: 0x2a72c8,                  // $2A4306 lea $2A72C8,A1
  alt: 0x2a92a8,                   // $2A4328 lea $2A92A8,A1, the LOOP-ZERO table
  pairs: 14,
  loopWord: 0x813098,              // $2A431E tst.w
  /** ids 5..$D, the pairs the two tables hold in common. */
  sharedFrom: 5,
  /** `$2A7338`: `clr.w (A4) / rts`, where entry [14] would begin. */
  afterMain: 0x2a7338,
  /** `$2A9318`: the head of the alt table's data blob. */
  afterAlt: 0x2a9318,
  gun5Init: 0x2a81bc, gun5Step: 0x2a8206, gun5Template: 0x2a818c,
  gun6Init: 0x2a8370, gun6Step: 0x2a8396, gun6Template: 0x2a8342,
  gun6Muzzles: 0x2a84cc,           // $2A83FC lea (TRAP 4: $2A83FE + $CE)
  gun6MuzzleCount: 6,              // $2A8482 subq.w #$4 from $2A8488's #$14
  vectors: 0x26bffc,               // $2A8274 / $2A82B6 lea $26BFFC,A1
  spawn: 0x2817c2,                 // bank B's core, called direct
  freeze: 0x8130d4,
  selP1: 0x8103e6, selP2: 0x810448,
  /** A4 ids this file registers, and the gun each waits on. */
  a4Waits: Object.freeze({ 0x0a: 5, 0x0b: 6, 0x0c: 7 }),
});

const AIM_TABLES = new WeakMap();
function aimTables(rom) {
  let t = AIM_TABLES.get(rom);
  if (!t) { t = new AimTables(rom); AIM_TABLES.set(rom, t); }
  return t;
}

/** `portdiff.mjs` / `breakage.mjs` are the only writers; `null` ships. */
export const W404_MUTATE = { value: null };
const mut = (name) => W404_MUTATE.value === name;

// ===========================================================================
// the shared shapes
// ===========================================================================

/** Every gun init opens with the same four instructions: `lea (d16,PC),A0 /
 *  lea ($2,A4),A1 / moveq #count,D0 / move.w (A0)+,(A1)+ / dbra D0`.  TRAP:
 *  `dbra` runs count+1 times, so `moveq #$7` is EIGHT words. */
function copyTemplate(ram, rom, a4, tpl, words) {
  for (let i = 0; i < words; i++) ram.setU16(a4 + 0x02 + i * 2, rom.u16(tpl + i * 2));
}

/**
 * The head every gun STEP shares, `tst.w $8130D4 / bne.w <own init> / subq.b
 * #$1,($2,A4) / bcs.s <body> / rts`.
 *
 * **THE FREEZE ARM BRANCHES BACKWARD INTO THE INIT, NOT FORWARD TO THE RTS**,
 * which is the opposite of what every A4 script in `$2A67C2..$2A6B7A` does with
 * the same `tst.w $8130D4`.  A frozen gun re-seeds its whole slot from the
 * template every frame, so it restarts its pattern when the freeze lifts rather
 * than resuming it.  `$2A820C 6600 FFAE` from `$2A820E` is `-$52` = `$2A81BC`,
 * gun 5's own init, and `$2A806C`/`$2A839C`/`$2A853E`/`$2A8840` are the same
 * shape at four other guns.
 *
 * @returns {boolean} true when the body runs this frame.
 */
function gunTick(ram, a4, init) {
  if (ram.u16(HIBACHI_A1.freeze) !== 0) {              // $2A8206 tst.w $8130D4
    if (!mut('freeze-returns')) init();                // $2A820C bne.w <init>
    return false;
  }
  const t = ram.u8(a4 + 0x02);                         // $2A8210 subq.b #$1,($2,A4)
  ram.setU8(a4 + 0x02, u8(t - 1));
  return t === 0;                                      // $2A8214 bcs.s -- the BORROW
}

/**
 * `$2A8228..$2A8246` / `$2A83AE..$2A83D0` -- `$24270A` inlined.
 * @returns {number|null} the chosen player record, or null for "both dead".
 */
function pickTarget(ram, a5) {
  const sel = targetSelect(ram, a5);                   // $2A8234 tst.b ($3,A5) / exg
  return sel.carry ? null : sel.addr;                  // $2A8242 bpl.w -> skip
}

/** One `jsr $2817C2`.  D5 is NOT a parameter of the core; it reaches the
 *  spawn-init only for the five kinds whose init reads it, and neither gun in
 *  this file fires one of those, so it is passed as the register the ROM has
 *  in hand rather than being invented. */
function shot(ram, rom, ctx, site, regs) {
  const log = new WriteLog(ram);
  const res = fire({ ram, rom, log, mut: ctx.mut ?? null }, HIBACHI_A1.spawn, regs);
  ctx.bulletSpawn?.(site, res);
  return res;
}

// ===========================================================================
// GUN 5 -- $2A81BC / $2A8206.  The gun A4 $A waits on, and the frame-321 stop.
// ===========================================================================
/**
 * `$2A81BC` -- eight template words, then FOUR ramp adds off A6.
 *
 * The template is `2080 2727 0600 0000 000B 0004 0004 0006`, and reading it as
 * words rather than bytes is what makes `($8,A4)` and `($C,A4)` legible: they
 * are the two LONGWORDS `$0000000B` and `$00040004` that `$2A825E` and
 * `$2A82A0` hand to `$2817C2` as D0, i.e. `{speed bias, bullet kind}` pairs --
 * kind 11 for the aimed fan and kind 4 for the sweep.  `$2A81F8 add.w D0,
 * ($8,A4)` and `$2A8200 add.w D0,($C,A4)` therefore add the ramp to the BIAS
 * halves, not to the kinds.
 *
 * `$2A81DA jsr $242EC2 / $2A81E0 bpl.w` looks like a random INITIAL DIRECTION
 * for the sweep -- `$2A81E4 neg.b ($11,A4)` would start it running down instead
 * of up.  It is DEAD.  `$242EC2` ends `move.b (A0,D0.w),D0 / rts` with no
 * `ext.w` at all (`src/rng.js` states it, and `$28A260` is the other routine it
 * strands), so D0 is 0..255 with the byte in the low half and bit 15 is always
 * clear: `bpl` is always taken.  Transcribed with both arms rather than folded
 * away, because a build that put the `ext.w` back would make it live.
 */
export function gun5Init2A81BC(ram, rom, a4, a6) {
  copyTemplate(ram, rom, a4, HIBACHI_A1.gun5Template, 8);   // $2A81BC..$2A81CA
  // $2A81CC jsr $242E24 / addi.b #$60,D0 / move.b D0,($10,A4) -- the sweep's
  // random START, biased into $60..$15F truncated to a byte.
  ram.setU8(a4 + 0x10, u8(drawByte242E24(ram, rom) + 0x60));   // $2A81D2/$2A81D6
  if (i16(drawWord242EC2(ram, rom)) < 0) {             // $2A81DA jsr / $2A81E0 bpl.w
    ram.setU8(a4 + 0x11, u8(-ram.u8(a4 + 0x11)));      // $2A81E4 neg.b ($11,A4)
  }
  const d0b = ram.u8(a6 + 0x1da);                      // $2A81E8 move.b ($1DA,A6),D0
  ram.setU8(a4 + 0x04, u8(ram.u8(a4 + 0x04) + d0b));   // $2A81EC add.b D0,($4,A4)
  ram.setU8(a4 + 0x05, u8(ram.u8(a4 + 0x05) + d0b));   // $2A81F0 -- WRITE-ONLY, see header
  ram.setU16(a4 + 0x08, u16(ram.u16(a4 + 0x08)
    + ram.u16(a6 + 0x1dc)));                           // $2A81F4/$2A81F8 add.w D0,($8,A4)
  ram.setU16(a4 + 0x0c, u16(ram.u16(a4 + 0x0c)
    + ram.u16(a6 + 0x1de)));                           // $2A81FC/$2A8200 add.w D0,($C,A4)
}

/**
 * `$2A8206` -- two volleys, a sweep that bounces between `$50` and `$B0`, and a
 * volley counter that retires the slot.
 *
 * **`$2A821E btst #$0,($4,A4)` runs the AIMED fan on every OTHER volley.**  It
 * is a bit test on the countdown itself, not a separate flag, so the seven-shot
 * aimed fan and the thirteen-shot sweep alternate as the counter walks down.
 *
 * **`$2A8242 bpl.w $2A8304` skips BOTH volleys AND the sweep step** when
 * neither player is alive -- it lands past the angle arithmetic, not just past
 * the shots, so a gun that fires at nobody does not advance its own pattern.
 *
 * **D1's high byte is inherited and is unobservable.**  `$2A829C move.b
 * ($10,A4),D1` rewrites only the low byte of a register the aimed fan left
 * behind, and `$2A82B2 subi.w #$3C,D1` is a WORD subtract -- but `$2817C2`
 * consumes D1 as `move.b D1,($B,A0)` twice and bank B does not scale it, so
 * only bits 0..7 ever leave the core, and a borrow out of the low byte cannot
 * change the low byte.  Labelled equivalence, not a simplification.
 */
export function gun5Step2A8206(ram, rom, ctx, a4, a5, a6) {
  if (!gunTick(ram, a4, () => gun5Init2A81BC(ram, rom, a4, a6))) return;

  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x06));             // $2A8218 move.b ($6,A4),($2,A4)
  let d1 = 0;
  let skip = false;

  if ((ram.u8(a4 + 0x04) & 1) !== 0) {                 // $2A821E btst #$0,($4,A4)
    const tgt = pickTarget(ram, a5);
    if (tgt === null) {
      skip = true;                                     // $2A8242 bpl.w $2A8304
    } else {
      // $2A8248 movem.w ($2,A0),D2-D3 / $2A824E movem.w ($2,A6),D0-D1 --
      // ($2,·) is the Y word and ($4,·) is the X word, in both records.
      const ty = ram.u16(tgt + 0x02), tx = ram.u16(tgt + 0x04);
      const sy = u16(ram.u16(a6 + 0x02) + 0xf0c0);     // $2A8254 addi.w #$F0C0,D0
      const sx = ram.u16(a6 + 0x04);
      d1 = aim256(aimTables(rom), sy, sx, ty, tx);     // $2A8258 jsr $2422A2
      // ---- THE AIMED FAN.  Seven shots ($2A826E moveq #$6 and a dbra), from
      // aim - $36, $12 apart, so the fan is symmetric about the aim.
      const d0 = ram.u32(a4 + 0x08);                   // $2A825E move.l ($8,A4),D0
      const d2 = ram.u32(a6 + 0x02);                   // $2A8262 move.l ($2,A6),D2
      d1 = u16(d1 - 0x36);                             // $2A8270 subi.w #$36,D1
      for (let k = 0; k < 7; k++) {                    // $2A8292 dbra D7 with #$6
        shot(ram, rom, ctx, 0x2a8288,
          { d0, d1, d2, d3: vector(rom, d1), d4: 0, d5: 0xf0c00000, a5 });
        d1 = u16(d1 + 0x12);                           // $2A828E addi.w #$12,D1
      }
      ram.setU8(a5 + 0x03, ram.u8(a5 + 0x03) ^ 1);     // $2A8296 bchg #$0,($3,A5)
    }
  }

  if (!skip) {
    // ---- THE SWEEP.  Thirteen shots ($2A82B0 moveq #$C), from ($10,A4) - $3C,
    // $A apart, and this one is NOT aimed: its centre is the swept angle.
    d1 = ram.u8(a4 + 0x10);                            // $2A829C move.b ($10,A4),D1
    const d0 = ram.u32(a4 + 0x0c);                     // $2A82A0 move.l ($C,A4),D0
    const d2 = ram.u32(a6 + 0x02);                     // $2A82A4 move.l ($2,A6),D2
    d1 = u16(d1 - 0x3c);                               // $2A82B2 subi.w #$3C,D1
    for (let k = 0; k < 13; k++) {                     // $2A82D4 dbra D7 with #$C
      shot(ram, rom, ctx, 0x2a82ca,
        { d0, d1, d2, d3: vector(rom, d1), d4: 0, d5: 0xf0c00000, a5 });
      d1 = u16(d1 + 0x0a);                             // $2A82D0 addi.w #$A,D1
    }

    // ---- THE BOUNCE.  `$2A82D8 move.b ($11,A4),D1 / bpl.w` picks the arm by
    // the STEP's sign and each arm tests the opposite end: the negative arm
    // reverses below $50 (`bcs`, UNSIGNED), the positive one above $B0 (`bls`).
    const step = ram.u8(a4 + 0x11);                    // $2A82D8
    const next = u8(ram.u8(a4 + 0x10) + step);         // $2A82E0 / $2A82F2 add.b
    ram.setU8(a4 + 0x10, next);
    const bounce = (step & 0x80) !== 0                 // $2A82DC bpl.w $2A82F2
      ? next < 0x50                                    // $2A82E4 cmpi.b #$50 / bcs.w
      : next > 0xb0;                                   // $2A82F6 cmpi.b #$B0 / bls.w
    if (bounce) ram.setU8(a4 + 0x11, u8(-step));       // $2A8300 neg.b ($11,A4)
  }

  // ---- $2A8304.  The volley counter, and the RAMP the gun leaves behind.
  const n = ram.u8(a4 + 0x04);                         // $2A8304 subq.b #$1,($4,A4)
  ram.setU8(a4 + 0x04, u8(n - 1));
  if (n !== 0) return;                                 // $2A8308 bcc.w $2A8340

  // $2A830C -- a dead store: $259B08 four instructions later clears the slot.
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));             // $2A830C move.b ($3,A4),($2,A4)
  // $2A8312..$2A8336 -- THREE saturating ramps on A6, the boss's own record of
  // how many times this gun has run.  The next init reads all three back.
  if (ram.u8(a6 + 0x1da) < 0x28) {                     // $2A8312 cmpi.b #$28 / bcc.s
    ram.setU8(a6 + 0x1da, u8(ram.u8(a6 + 0x1da) + 0x0a));      // $2A831A addi.b #$A
  }
  if (i16(ram.u16(a6 + 0x1dc)) < 4) {                  // $2A8320 cmpi.w #$4 / bge.s
    ram.setU16(a6 + 0x1dc, u16(ram.u16(a6 + 0x1dc) + 1));      // $2A8328 addq.w #$1
  }
  if (i16(ram.u16(a6 + 0x1de)) < 0x1a) {               // $2A832C cmpi.w #$1A / bge.s
    ram.setU16(a6 + 0x1de, u16(ram.u16(a6 + 0x1de) + 1));      // $2A8334 addq.w #$1
  }
  a1Stop259B08(ram, 5);                                // $2A8338 moveq #$5 / $2A833A jsr
}

/** `$2A827A..$2A8286` and `$2A82BC..$2A82C8`, the SAME five instructions twice:
 *  `move.w D1,D3 / addq.w #$2,D3 / andi.w #$FC,D3 / move.l ($0,A1,D3.w),D3 /
 *  add.l D5,D3`.  The `+2` before the mask is a ROUND-TO-NEAREST on a table of
 *  64 longwords indexed four bytes apart, not an off-by-one. */
function vector(rom, d1) {
  const d3 = u16(u16(d1 + 2) & 0x00fc);                // $2A827C addq / $2A827E andi
  return (rom.u32(HIBACHI_A1.vectors + d3) + 0xf0c00000) >>> 0;   // $2A8282/$2A8286
}

// ===========================================================================
// GUN 6 -- $2A8370 / $2A8396.  Ten shots a volley off a six-muzzle cycle.
// ===========================================================================
/** `$2A8370` -- SEVEN template words (`moveq #$6`), then two ramp adds.  The
 *  template's `$FFFC` is the speed bias the header shows is dead, and `$0014`
 *  is the muzzle cursor `($E,A4)` that `$2A8482 subq.w #$4` walks down. */
export function gun6Init2A8370(ram, rom, a4, a6) {
  copyTemplate(ram, rom, a4, HIBACHI_A1.gun6Template, 7);   // $2A8370..$2A837E
  ram.setU16(a4 + 0x08, u16(ram.u16(a4 + 0x08)
    + ram.u16(a6 + 0x1e8)));                           // $2A8380/$2A8384 -- DEAD, see header
  const d0 = ram.u8(a6 + 0x1e6);                       // $2A8388 move.b ($1E6,A6),D0
  ram.setU8(a4 + 0x04, u8(ram.u8(a4 + 0x04) + d0));    // $2A838C add.b D0,($4,A4)
  ram.setU8(a4 + 0x05, u8(ram.u8(a4 + 0x05) + d0));    // $2A8390 add.b D0,($5,A4)
}

/**
 * `$2A8396` -- ONE aim, jittered, then TEN shots in four groups.
 *
 * **THE SPEED BIAS ACCUMULATES THROUGH D0'S HIGH WORD.**  The four groups load
 * D0 with `move.w`, which touches the low word only, and then `addi.l
 * #$50000` / `#$50000` / `#$40000` add to the high word WITHOUT ever clearing
 * it, so the four groups fire at biases 0, 5, $A and $E off one register.  The
 * starting zero comes from `$242E24`, whose `moveq #$7F` leaves D0's upper
 * sixteen bits clear -- and that, not `($8,A4)`, is why the header calls
 * `$2A83F4` dead.
 *
 * **THE AIM IS JITTERED BY A SIGNED BYTE.**  `$2A83E8 jsr $242E24 / subi.b
 * #$20,D0 / add.b D0,D1` is `$242E24`'s 0..255 biased to -$20..$DF and added as
 * a BYTE, so the fan wanders around the player rather than tracking exactly.
 *
 * `$2A83D8 move.w D2,D6 / $2A83DA move.w D3,D7` copy the target coordinates
 * into two registers this routine then overwrites (`$2A840C move.w D1,D7`) and
 * never reads.  Two more dead stores, transcribed by omission with this note
 * because nothing observes a register.
 */
export function gun6Step2A8396(ram, rom, ctx, a4, a5, a6) {
  if (!gunTick(ram, a4, () => gun6Init2A8370(ram, rom, a4, a6))) return;

  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x06));             // $2A83A8 move.b ($6,A4),($2,A4)
  const tgt = pickTarget(ram, a5);                     // $2A83AE..$2A83D0
  if (tgt !== null) {                                  // $2A83CC bpl.w $2A848E
    const ty = ram.u16(tgt + 0x02), tx = ram.u16(tgt + 0x04);   // $2A83D2 movem.w
    const aim = aim256(aimTables(rom),                 // $2A83E2 jsr $2422A2
      ram.u16(a6 + 0x02), ram.u16(a6 + 0x04), ty, tx); // $2A83DC movem.w ($2,A6)
    // $2A83E8/$2A83EE/$2A83F2 -- the byte jitter.  D1's high bits never leave
    // the core, so only the low byte is carried forward.
    const d7 = u8(aim + u8(drawByte242E24(ram, rom) - 0x20));
    // $2A83F4 move.w ($8,A4),D0 -- DEAD, and deliberately not modelled: see the
    // header.  `d0hi` starts at 0 because $242E24 cleared D0's high word.
    const d2 = ram.u32(a6 + 0x02);                     // $2A83F8 move.l ($2,A6),D2
    // $2A83FC lea $2A84CC,A3 / move.w ($E,A4),D4 / adda.w D4,A3 / move.l (A3),D3
    const d3 = rom.u32(HIBACHI_A1.gun6Muzzles + ram.u16(a4 + 0x0e));
    const kindA = ram.u16(a4 + 0x0a);                  // $2A840E / $2A8446 ($A,A4)
    const kindB = ram.u16(a4 + 0x0c);                  // $2A8424 / $2A8462 ($C,A4)
    let d0hi = 0;
    const group = (kind, add, offsets, site) => {
      d0hi = u16(d0hi + add);                          // addi.l #$n0000,D0
      const d0 = ((d0hi << 16) | kind) >>> 0;
      for (const off of offsets) {
        shot(ram, rom, ctx, site, { d0, d1: u8(d7 + off), d2, d3, d4: 0, d5: 0, a5 });
      }
    };
    group(kindA, 0, [-1, 1], 0x2a8414);                // $2A8412 subq.b #$1 / addq.b #$2
    group(kindB, 5, [0, -2, 2], 0x2a842e);             // $2A8434 subq.b #$2 / addq.b #$4
    group(kindA, 5, [-1, 1], 0x2a8452);
    group(kindB, 4, [0, -2, 2], 0x2a846c);
    // $2A8482 subq.w #$4,($E,A4) / bcc.s / move.w #$14,($E,A4) -- SIX muzzles,
    // walked DOWNWARD, wrapping through $14 when the subtract borrows.
    const cur = ram.u16(a4 + 0x0e);
    ram.setU16(a4 + 0x0e, u16(cur - 4));
    if (cur < 4) ram.setU16(a4 + 0x0e, 0x0014);        // $2A8488
  }
  ram.setU8(a5 + 0x03, ram.u8(a5 + 0x03) ^ 1);         // $2A848E bchg #$0,($3,A5)

  const n = ram.u8(a4 + 0x04);                         // $2A8494 subq.b #$1,($4,A4)
  ram.setU8(a4 + 0x04, u8(n - 1));
  if (n !== 0) return;                                 // $2A8498 bcc.w $2A84CA

  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));             // $2A849C -- ($5,A4) IS read here
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));             // $2A84A2
  if (ram.u8(a6 + 0x1e6) < 0x14) {                     // $2A84A8 cmpi.b #$14 / bcc.s
    ram.setU8(a6 + 0x1e6, u8(ram.u8(a6 + 0x1e6) + 0x0a));      // $2A84B0 addi.b #$A
  }
  if (ram.u16(a6 + 0x1e8) < 6) {                       // $2A84B6 cmpi.w #$6 / bcc.s -- UNSIGNED
    ram.setU16(a6 + 0x1e8, u16(ram.u16(a6 + 0x1e8) + 1));      // $2A84BE addq.w #$1
  }
  a1Stop259B08(ram, 6);                                // $2A84C2 moveq #$6 / $2A84C4 jsr
}

// ===========================================================================
// THE A4 DRIVERS -- $2A689C, $2A68D4, $2A6930
// ===========================================================================
//
// All three are the same six-part shape and only the constants move:
//
//   init      move.w #delay,($2,A4)   [+ a seqStart]
//   step      tst.w ($2,A4) / beq  -> the WAIT, so the delay is skipped once spent
//             tst.w $8130D4  / bne -> rts       the freeze, FORWARD here
//             subq.w #$1,($2,A4) / bne -> rts   count the delay down
//             moveq #gun,D0 / jsr $259A18       start the gun
//             moveq #gun,D0 / jsr $259A4A / bcs -> rts   and WAIT on it
//             moveq #next,D0 / jsr $25980C / clr.w (A4)  hand over and retire
//
// **THE INIT FALLS THROUGH INTO THE STEP** (W403's rule, and all three obey it:
// the word before each step is an operand), so the delay is one frame shorter
// than the immediate reads.  A4 $A's `#$1` therefore starts gun 5 on the very
// frame the script is dispatched.

/** `$2A689C` / `$2A68A2` -- delay 1, gun 5, then A4 $B. */
export function a4A2A689C(ram, a4, init) {
  if (init) ram.setU16(a4 + 0x02, 0x0001);             // $2A689C move.w #$1,($2,A4)
  if (ram.u16(a4 + 0x02) !== 0) {                      // $2A68A2 tst.w / beq.s $2A68BE
    if (ram.u16(HIBACHI_A1.freeze) !== 0) return;      // $2A68A8 tst.w / bne.s $2A68D2
    ram.setU16(a4 + 0x02, u16(ram.u16(a4 + 0x02) - 1));       // $2A68B0 subq.w #$1
    if (ram.u16(a4 + 0x02) !== 0) return;              // $2A68B4 bne.s $2A68D2
    a1Start259A18(ram, 5);                             // $2A68B6/$2A68B8
  }
  if (a1Running259A4A(ram, 5)) return;                 // $2A68BE/$2A68C0/$2A68C6 bcs.s
  a4Start25980C(ram, 0x0b);                            // $2A68C8/$2A68CA
  ram.setU16(a4, 0);                                   // $2A68D0 clr.w (A4)
}

/**
 * `$2A68D4` / `$2A68DA` -- delay $40, gun 6, then A4 $C.
 *
 * This one also drives an A2 object and the main sequencer around the wait:
 * `$25994A` STOPS A2 object $E and zeroes `($172,A5)` when the gun starts, and
 * `$2598E6` runs it again with `($172,A5) = $1000` when the gun is done.  A2 $E
 * is therefore alive only while gun 6 is not firing.
 */
export function a4B2A68D4(ram, a4, a5, init) {
  if (init) ram.setU16(a4 + 0x02, 0x0040);             // $2A68D4 move.w #$40,($2,A4)
  if (ram.u16(a4 + 0x02) !== 0) {                      // $2A68DA tst.w / beq.s $2A690C
    if (ram.u16(HIBACHI_A1.freeze) !== 0) return;      // $2A68E0 / bne.s $2A692E
    ram.setU16(a4 + 0x02, u16(ram.u16(a4 + 0x02) - 1));       // $2A68E8 subq.w #$1
    if (ram.u16(a4 + 0x02) !== 0) return;              // $2A68EC bne.s $2A692E
    a1Start259A18(ram, 6);                             // $2A68EE/$2A68F0
    a2Stop25994A(ram, 0x0e);                           // $2A68F6/$2A68F8
    ram.setU16(a5 + 0x172, 0x0000);                    // $2A68FE move.w #$0,($172,A5)
    seqStart2598D0(ram, 5);                            // $2A6904/$2A6906
  }
  if (a1Running259A4A(ram, 6)) return;                 // $2A690C/$2A690E/$2A6914 bcs.s
  a2Run2598E6(ram, 0x0e);                              // $2A6916/$2A6918
  ram.setU16(a5 + 0x172, 0x1000);                      // $2A691E move.w #$1000,($172,A5)
  a4Start25980C(ram, 0x0c);                            // $2A6924/$2A6926
  ram.setU16(a4, 0);                                   // $2A692C clr.w (A4)
}

/** `$2A6930` / `$2A693E` -- delay $50, main sequencer 6 IN THE INIT, gun 7,
 *  then A4 $D.  The `jsr $2598D0` sits before the step entry, so it runs ONCE
 *  and not per frame -- the only one of the three whose init does more than the
 *  `move.w`. */
export function a4C2A6930(ram, a4, init) {
  if (init) {
    ram.setU16(a4 + 0x02, 0x0050);                     // $2A6930 move.w #$50,($2,A4)
    seqStart2598D0(ram, 6);                            // $2A6936/$2A6938
  }
  if (ram.u16(a4 + 0x02) !== 0) {                      // $2A693E tst.w / beq.s $2A695A
    if (ram.u16(HIBACHI_A1.freeze) !== 0) return;      // $2A6944 / bne.s $2A696E
    ram.setU16(a4 + 0x02, u16(ram.u16(a4 + 0x02) - 1));       // $2A694C subq.w #$1
    if (ram.u16(a4 + 0x02) !== 0) return;              // $2A6950 bne.s $2A696E
    a1Start259A18(ram, 7);                             // $2A6952/$2A6954
  }
  if (a1Running259A4A(ram, 7)) return;                 // $2A695A/$2A695C/$2A6962 bcs.s
  a4Start25980C(ram, 0x0d);                            // $2A6964/$2A6966
  ram.setU16(a4, 0);                                   // $2A696C clr.w (A4)
}

// ===========================================================================
// the registrations
// ===========================================================================
// The A1 pairs register SEPARATELY, because `4E75` at `step - 2` says the init
// does NOT fall through -- the opposite of `hibachiend.js`'s `initThenStep`.
registerScript(HIBACHI_A1.gun5Init, (ram, rom, ctx, a4) =>
  gun5Init2A81BC(ram, rom, a4, bossA6(ctx, HIBACHI_A1.gun5Init)));
registerScript(HIBACHI_A1.gun5Step, (ram, rom, ctx, a4) =>
  gun5Step2A8206(ram, rom, ctx, a4, bossA5(ctx, HIBACHI_A1.gun5Step),
    bossA6(ctx, HIBACHI_A1.gun5Step)));
registerScript(HIBACHI_A1.gun6Init, (ram, rom, ctx, a4) =>
  gun6Init2A8370(ram, rom, a4, bossA6(ctx, HIBACHI_A1.gun6Init)));
registerScript(HIBACHI_A1.gun6Step, (ram, rom, ctx, a4) =>
  gun6Step2A8396(ram, rom, ctx, a4, bossA5(ctx, HIBACHI_A1.gun6Step),
    bossA6(ctx, HIBACHI_A1.gun6Step)));

// The A4 pairs are the other way round: the word before each step is an
// operand, so the init entry runs the init AND the step in one dispatch, which
// is what the `init` flag inside each of the three routines above expresses.
registerScript(0x2a689c, (ram, rom, ctx, a4) => a4A2A689C(ram, a4, true));
registerScript(0x2a68a2, (ram, rom, ctx, a4) => a4A2A689C(ram, a4, false));
registerScript(0x2a68d4, (ram, rom, ctx, a4) =>
  a4B2A68D4(ram, a4, bossA5(ctx, 0x2a68d4), true));
registerScript(0x2a68da, (ram, rom, ctx, a4) =>
  a4B2A68D4(ram, a4, bossA5(ctx, 0x2a68da), false));
registerScript(0x2a6930, (ram, rom, ctx, a4) => a4C2A6930(ram, a4, true));
registerScript(0x2a693e, (ram, rom, ctx, a4) => a4C2A6930(ram, a4, false));

/** The A1 ids whose init AND step this file registers. */
export const HIBACHI_A1_SCRIPTS = Object.freeze([5, 6]);
/** The A4 ids this file registers, on top of `hibachiend.js`'s 1..4. */
export const HIBACHI_GUN_A4_SCRIPTS = Object.freeze([0x0a, 0x0b, 0x0c]);

/**
 * Every A1 gun id the boss can start that this wave does NOT run, with the byte
 * extent each occupies between its own table entry and the next one above it.
 * The extents are MEASURED from the image by the test, not typed from a
 * listing, and each includes the following gun's template blob -- see the
 * header's layout note.  `alt` marks the five that exist only in `$2A92A8`.
 */
export const HIBACHI_A1_COUNTED = Object.freeze({
  0x00: { init: 0x2a738a, step: 0x2a7400, bytes: 0x04c6, why: 'A4 6 ($2A67CC)' },
  0x01: { init: 0x2a7850, step: 0x2a78d0, bytes: 0x0262, why: 'A4 7 ($2A6804)' },
  0x02: { init: 0x2a7ab2, step: 0x2a7b20, bytes: 0x03b2, why: 'A4 8 ($2A683C)' },
  0x03: { init: 0x2a7e64, step: 0x2a7e96, bytes: 0x01f6, why: 'A4 9 ($2A687A)' },
  0x04: { init: 0x2a805a, step: 0x2a806c, bytes: 0x0162, why: 'A4 $E ($2A6A16)' },
  0x07: { init: 0x2a8516, step: 0x2a8538, bytes: 0x02ea, why: 'A4 $C ($2A6954) -- THE REAL '
    + 'PATH STOPS HERE. It walks a FOUR-block pointer table $2A8680 (4 x 80 B of 8-byte '
    + '{delta, bias, angle} records) that no window covers yet' },
  0x08: { init: 0x2a8800, step: 0x2a883a, bytes: 0x01ba, why: 'A4 $D ($2A69A0); its step '
    + 're-arms itself with `$2A896A 6100 FE94`, a bsr.w back to its OWN init' },
  0x09: { init: 0x2a89ba, step: 0x2a89f4, bytes: 0x01c2, why: 'A4 $F ($2A6A4C) -- the OTHER '
    + 'wait W403 named, down the ending chain' },
  0x0a: { init: 0x2a8b7c, step: 0x2a8bc0, bytes: 0x011e, why: 'A4 $10 ($2A6A92)' },
  0x0b: { init: 0x2a8c9a, step: 0x2a8cb2, bytes: 0x0236, why: 'A4 $11 ($2A6AD2)' },
  0x0c: { init: 0x2a8ed0, step: 0x2a8f1c, bytes: 0x01d4, why: 'A4 $12 ($2A6B1E)' },
  0x0d: { init: 0x2a90a4, step: 0x2a90e0, bytes: 0x0204, why: 'A4 $13 ($2A6B6C); bounded '
    + 'ABOVE by the alt table $2A92A8 itself, a positive witness' },
});

/** The five ids that differ between the two tables: `$2A92A8`'s own 0..4, which
 *  only the FIRST loop ($813098 == 0) ever dispatches. */
export const HIBACHI_A1_ALT_COUNTED = Object.freeze({
  0x00: { init: 0x2a9366, step: 0x2a93dc, bytes: 0x048e },
  0x01: { init: 0x2a97f4, step: 0x2a9874, bytes: 0x02ac },
  0x02: { init: 0x2a9aa0, step: 0x2a9b0e, bytes: 0x03e4 },
  0x03: { init: 0x2a9e84, step: 0x2a9eb6, bytes: 0x01ee },
  0x04: { init: 0x2aa072, step: 0x2aa084, bytes: 0x01cc },
});
/** `$2AA23C 4E75` is the last instruction of alt gun 4 -- it sits AT that
 *  address, not one past it -- and `$2AA23E 2210` (`move.l (A0),D1`) opens the
 *  shared arithmetic helpers, which is what bounds the alt set from above. */
export const HIBACHI_A1_ALT_END = 0x2aa23e;
