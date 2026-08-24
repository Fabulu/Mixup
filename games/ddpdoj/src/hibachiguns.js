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
// THE CLOSED ATTACK LOOP, AND HOW THE BOSS GETS OUT OF IT.  W405.
// ============================================================================
// A4 $A `$2A689C` counts ONE frame, starts gun 5 and waits on it; when gun 5
// retires it starts A4 $B.  A4 $B waits on gun 6 and starts A4 $C; A4 $C waits
// on gun 7 and starts A4 $D; A4 $D waits on gun 8, pauses $40 frames and starts
// A4 $A again.  **{$A, $B, $C, $D} x {gun 5, 6, 7, 8} is a CLOSED LOOP.**  W404
// ported $A/$B/$C and guns 5 and 6 and stopped at gun 7; W405 ports gun 7, gun 8
// and $D, and the loop now runs with no port stop anywhere inside it.
//
// **IT IS PHASE A'S ATTACK CYCLE, NOT PHASE B'S** (where W404's handoff said
// phase B).  `$2A5F80 moveq #$A,D0 / jsr $25980C` sits in A4 script 2's tail,
// and `$2A5F40` -- four instructions earlier in the same script -- is the write
// that puts `1` in `($10E,A6)`, which W403's table maps to `$2A6F1C`, PHASE A.
// Measured on the real path: `($10E,A6)` is 1 for every frame the loop runs and
// only becomes 2 at `$2A637A`, in A4 script 4, after phase A is already dead.
//
// **AND THE WAY OUT IS A4 $D's OWN `move.b #imm,($1A,A5)`.**  Nothing inside the
// loop counts loop iterations, so what ends it comes from outside: `($1A,A5)` is
// the WORD `$2A7088 subq.w #$1` walks down to reach `$2A7008`, phase A's death,
// and A4 $D writes its HIGH BYTE twice -- `$C` when the script starts and `$4`
// on the frame gun 8 does.  So each pass through $D re-arms phase A's timeout at
// `$04xx`, phase A dies about $400 frames into a gun-8 run, `$2A702C`/`$2A7032`
// wipe every A1 and A4 slot (which is what takes the loop apart), and the death
// tail hands to A4 3 -> A4 4 -> A4 $F.  Porting $D is therefore what lets the
// BOSS's phase A end at all, not merely what closes the cycle.
//
// ============================================================================
// PHASE B'S LOOP IS THREE LINKS, NOT FOUR, AND ITS ORDER IS NOT ID ORDER.  W406.
// ============================================================================
// W405's handoff called `{$F, $10, $11, $12} x {gun 9, $A, $B, $C}` a chain.  It
// is a CLOSED LOOP of THREE, and $12 is not in it.  Every `moveq #n / jsr
// $25980C` in `$2A4000..$2AB000` was enumerated to say so:
//
//   A4 $F  $2A6A30 -> gun 9  -> $2A6A5C moveq #$11 -> A4 $11
//   A4 $11 $2A6AB6 -> gun $B -> $2A6AE8 moveq #$10 -> A4 $10
//   A4 $10 $2A6A76 -> gun $A -> $2A6AA2 moveq #$F  -> A4 $F
//   A4 $12 $2A6AFC -> gun $C -> $2A6B34 moveq #$F  -> A4 $F, one way only
//
// and the enumeration finds **no `moveq #$12` at all**, so nothing in the boss
// ROM starts $12.  A4 script 4's `$2A640C moveq #$F` is the only door in.
//
// W406 ported the first link, `$F` + gun 9.  `($1A,A5)`, phase B's death timer,
// is re-armed by the loop exactly as phase A's was: `$2A6A6C move.b
// #$C,($1A,A5)` on $F's hand-over and `$2A6AD8 move.b #$4,($1A,A5)` on $11's, so
// the word `$2A7088` counts down inside the phase-B exit twin `$2A7294`.
//
// The parallel loop {6,7,8,9} x {gun 0,1,2,3} is reached by other entries.
//
// **W407: THE LOOP IS STILL NOT CLOSED, AND THE BRIEF SAID PORTING $B/$11/$10
// WOULD CLOSE IT.**  Three links need THREE guns, and this wave's unit contains
// only one of them.  With `$11`, `$10` and gun `$B` ported the path runs
// `$F -> gun 9 -> $11 -> gun $B -> $10 -> ???` and stops in front of **A1 gun
// `$A` `$2A8B7C`** ($11E table-entry to table-entry, of which $F4 is code),
// which is the last unported member of the cycle.  Nothing about the loop's
// SHAPE changed -- `$2A6AA2 moveq #$F` still hands back -- but "this closes the
// loop" is a claim only gun `$A` can make true.
//
// **W408: THE LOOP IS NOW CLOSED, AND WHAT THAT BUYS IS A TIMEOUT, NOT AN
// ENDING.**  Gun `$A` is ported, so every arrow in
// `$F -> gun 9 -> $11 -> gun $B -> $10 -> gun $A -> $F` runs.  The real path no
// longer stops on a missing script at all; it runs until **phase B's own death
// timer expires**, because the loop re-arms `($1A,A5)` to `$04xx` on each `$11`
// and a whole lap is longer than `$04xx` frames.  `$2A7088 subq.w #$1,($1A,A5)`
// reaches zero inside gun `$A`'s run, `$2A728A moveq #$5 / $2A728C jmp $25980C`
// (in phase B's death tail off `$2A722E`) hands to A4 script 5 `$2A6418`, and
// THAT is the next unported unit.  A closed loop is a loop:
// closing it did not move the ending one instruction nearer, because completing
// means `$2595E8` suspending the stage and only A4 `$14` reaches that.
//
// ============================================================================
// AN ORPHAN DATA BLOCK NOBODY OWNS: `$2A8B10..$2A8B4B`.  W408.
// ============================================================================
// The layout note below says `[gun N code][gun N+1 template][8 longwords][gun
// N+1 code]`.  Between gun 9 and gun `$A` there is a fourth thing.  Gun 9's
// `4E75` is AT `$2A8B0E`; gun `$A`'s template starts at `$2A8B4C` (its own
// `lea` says so) and its eight `$002A8B7C` self-pointers run `$2A8B5C..$2A8B7B`.
// That leaves `$2A8B10..$2A8B4B`, $3C bytes:
//
//   $2A8B10  nine {bias.w, kind.w} longwords -- $00230005 $00150003 $001C0004
//            $00230005 $002A0006 $00310007 $002A0006 $00230005 $001C0004
//   $2A8B34  six {dY.w, dX.w} muzzle longwords -- $0080F640 $FB40F640 $F640F640
//            $FF000940 $FA800940 $F5C00940
//
// exactly the two shapes gun 5's `($8,A4)` pairs and gun 6's `$2A84CC` muzzle
// table have.  **Neither gun 9 nor gun `$A` reads a byte of it**: gun 9's only
// `lea (d16,PC)` names `$2A898C` and gun `$A`'s names `$2A8B4C`, those are the
// only two in either routine, and a scan of every longword in the 6 MB image
// plus every `lea (d16,PC)` in `$2A4000..$2AB000` finds no value landing inside
// it.  It is left as counted data with no window, and the note is here so the
// next reader does not "discover" it as a missing window.
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
import { drawByte242B3C, drawWord242B90, drawByte242E24, drawByte2431F4,
  drawNegative242EC2, drawWord242EC2 } from './rng.js';
import { fire, WriteLog } from './bullets.js';
import { bossA5, bossA6 } from './boss.js';
// W408: `$24249A`, the octagonal distance body, already transcribed for the MAIN scripts.
// `$242486` -- which gun $A reaches through `$242438` -- ENTERS `$242494`, whose two `movem.w`s
// load exactly the four words `dist242494` takes, so this is the same routine and not a twin.
// `src/boss.js` imports `bossscripts.js` (line 1165) before it imports this file (line 1201),
// so the module is fully evaluated by the time anything here runs.
import { dist242494 } from './bossscripts.js';

const u8 = (v) => v & 0xff;
/** a byte read SIGNED -- `cmpi.b #$D0` and `asr.b` are both signed operations. */
const i8 = (v) => (((v & 0xff) ^ 0x80) - 0x80);
/** `asr.w #n` -- an ARITHMETIC shift, so it rounds toward minus infinity. */
const asrw = (v, n) => u16(i16(v) >> n);

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
  altGun0Template: 0x2a9318, altGun0Init: 0x2a9366, altGun0Step: 0x2a93dc,
  altGun0Muzzles: 0x2a934e, altGun0Burst: 0x2a967a,
  altGun0Vectors: 0x2a96b6, altGun0Spawn: 0x2817b8,
  altGun1Template: 0x2a97b6, altGun1Init: 0x2a97f4, altGun1Step: 0x2a9874,
  altGun2Template: 0x2a9a68, altGun2Init: 0x2a9aa0, altGun2Step: 0x2a9b0e,
  altGun3Template: 0x2a9e50, altGun3Init: 0x2a9e84, altGun3Step: 0x2a9eb6,
  altGun3Pattern: 0x2aa004, altGun3PatternRows: 5, altGun3PatternStride: 0x0c,
  altGun4Template: 0x2aa040, altGun4Init: 0x2aa072, altGun4Step: 0x2aa084,
  gun5Init: 0x2a81bc, gun5Step: 0x2a8206, gun5Template: 0x2a818c,
  gun6Init: 0x2a8370, gun6Step: 0x2a8396, gun6Template: 0x2a8342,
  gun6Muzzles: 0x2a84cc,           // $2A83FC lea (TRAP 4: $2A83FE + $CE)
  gun6MuzzleCount: 6,              // $2A8482 subq.w #$4 from $2A8488's #$14
  gun7Init: 0x2a8516, gun7Step: 0x2a8538, gun7Template: 0x2a84e4,
  gun7Blocks: 0x2a8680,            // $2A8590 lea (TRAP 4: $2A8592 + $EE)
  gun7BlockCount: 4,               // its own lowest pointer is $2A8680 + $10
  gun7BlockLen: 0x50,              // $2A8618 subi.w #$10 against $2A8620's #$40
  gun7RecordLen: 8,                // {delta.l, bias.w, angle.w}
  gun8Init: 0x2a8800, gun8Step: 0x2a883a, gun8Template: 0x2a87d0,
  gun9Init: 0x2a89ba, gun9Step: 0x2a89f4, gun9Template: 0x2a898c,
  gun9Code: 0x2a8b0e,              // W406: `4E75` AT that address, gun 9's last instruction
  gunAInit: 0x2a8b7c, gunAStep: 0x2a8bc0, gunATemplate: 0x2a8b4c,
  gunACode: 0x2a8c6e,              // W408: `4E75` AT that address, gun $A's last instruction
  /** W408: `$2A8B10..$2A8B4B`, $3C bytes that sit between gun 9's `4E75` and gun
   *  `$A`'s template and that NOTHING in the 6 MB image points at -- see the
   *  ORPHAN header below.  Named so a test can assert what stands there. */
  gunAOrphan: 0x2a8b10, gunAOrphanLen: 0x3c,
  gunBInit: 0x2a8c9a, gunBStep: 0x2a8cb2, gunBTemplate: 0x2a8c70,
  gunBCode: 0x2a8e92,              // W407: `4E75` AT that address, gun $B's last instruction
  gunBRetire: 0x2a8e84,            // W407: where gun $B's FREEZE arm branches -- see below
  vectors: 0x26bffc,               // $2A8274 / $2A82B6 / $2A88E2 / $2A8BEA lea $26BFFC,A1
  spawn: 0x2817c2,                 // bank B's core, called direct
  freeze: 0x8130d4,
  altCadenceRank: 0x8130bc,        // $2A9880; gun 1 reloads 7 - (word >> 2)
  /** W408: `$8130DC`, the word gun `$A` REWRITES EVERY FRAME -- `$2A8BC0 clr.w`
   *  and, when the nearer player is inside `$2000`, `$2A8BD4 move.w #$1`. */
  proximity: 0x8130dc,
  proximityRange: 0x2000,          // $2A8BCC cmpi.w #$2000,D0 / $2A8BD0 bcc.w
  distMinBoth: 0x242438,           // $2A8BC6 jsr -- the library's min-over-both
  distOnePlayer: 0x242486,         // its own `bsr.s`, twice
  selP1: 0x8103e6, selP2: 0x810448,
  /** A4 ids this file registers, and the gun each waits on. */
  a4Waits: Object.freeze({ 0x0a: 5, 0x0b: 6, 0x0c: 7, 0x0d: 8, 0x0f: 9,
    0x10: 0x0a, 0x11: 0x0b }),
  /** W406: the three guns whose STEP has no `tst.w $8130D4` anywhere in it.
   *  `4A79 008130D4` stands AT ten of the fourteen step entries; gun $C's is
   *  eight bytes in, at $2A8F24, behind a `moveq #$C / jsr $259B08`; and these
   *  three have none at all. */
  noFreezeSteps: Object.freeze([0x2a89f4, 0x2a8bc0, 0x2a90e0]),
  /** W407: the ONE gun whose freeze test does not branch to its own init.
   *  `$2A8CB8 6600 01CA` is a FORWARD `bne.w` to `$2A8E84`, gun `$B`'s own
   *  retire tail, so a frozen gun `$B` STOPS ITSELF instead of re-seeding.  Nine
   *  of the fourteen go backward to their init; this is the tenth `4A79`. */
  freezeToRetire: Object.freeze({ 0x0b: 0x2a8e84 }),
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
 * The head NINE of the fourteen gun STEPs share, `tst.w $8130D4 / bne.w <own
 * init> / subq.b #$1,($2,A4) / bcs.s <body> / rts`.
 *
 * **W406: IT IS NOT ALL FOURTEEN.**  `4A79 008130D4` stands at the step entries
 * of guns 0..8 and $B and at NEITHER `$2A89F4` (gun 9), `$2A8BC0` (gun $A, which
 * opens `4279 clr.w $8130DC` -- a DIFFERENT word) nor `$2A90E0` (gun $D).  Gun
 * $C's is eight bytes past its entry.  Gun 9 is written without this helper for
 * exactly that reason; see its own header.
 *
 * **W407: AND IT IS NOT EVEN THE TEN THAT HAVE THE TEST.**  W406's note said
 * "guns 0..8 and $B" share this head; the TEST yes, the ARM no.  Every one of
 * the fourteen `bne.w` displacements was decoded: guns 0..8 land exactly on
 * their own init, and **gun $B's `$2A8CB8 6600 01CA` lands FORWARD on `$2A8E84`,
 * its own retire tail** (`bchg #$0,($3,A5) / moveq #$B / jsr $259B08`).  So a
 * frozen gun `$B` does not re-seed and does not burn its magazine either -- it
 * clears its own A1 slot, and A4 `$11`'s `$259A4A` wait falls through on the
 * very next frame.  Gun `$B` therefore does NOT call this helper.
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
function shot(ram, rom, ctx, site, regs, entry = HIBACHI_A1.spawn) {
  const log = new WriteLog(ram);
  const res = fire({ ram, rom, log, mut: ctx.mut ?? null }, entry, regs);
  ctx.bulletSpawn?.(site, res);
  return res;
}

// ===========================================================================
// LOOP-ZERO GUN 0 -- $2A9366 / $2A93DC
// ===========================================================================

const ALT_GUN0_PARTS = Object.freeze([0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0]);
const ALT_GUN0_CALLS = Object.freeze([
  Object.freeze([0x2a943a, 0x2a9444, 0x2a944e]),
  Object.freeze([0x2a947c]),
  Object.freeze([0x2a94aa]),
  Object.freeze([0x2a94d8, 0x2a94e2, 0x2a94ec]),
  Object.freeze([0x2a951a]),
  Object.freeze([0x2a9548]),
]);

function altGun0Randomize(ram, rom, a4) {
  for (let i = 0; i < ALT_GUN0_PARTS.length; i++) {
    ram.setU8(a4 + 0x1a + i, drawByte242B3C(ram, rom));
  }
}

/** `$2A9366`. Copy eleven words, draw six headings, and apply the loop-zero ramps. */
export function altGun0Init2A9366(ram, rom, a4, a6) {
  copyTemplate(ram, rom, a4, HIBACHI_A1.altGun0Template, 11);
  altGun0Randomize(ram, rom, a4);
  const volleyRamp = ram.u8(a6 + 0x1c6);
  ram.setU8(a4 + 0x06, u8(ram.u8(a4 + 0x06) + volleyRamp));
  ram.setU8(a4 + 0x07, u8(ram.u8(a4 + 0x07) + volleyRamp));
  ram.setU8(a4 + 0x08, u8(ram.u8(a4 + 0x08) - ram.u8(a6 + 0x1c8)));
  ram.setU8(a4 + 0x09, u8(ram.u8(a4 + 0x09) - ram.u8(a6 + 0x1c9)));
  const biasRamp = ram.u16(a6 + 0x1ca);
  ram.setU16(a4 + 0x0a, u16(ram.u16(a4 + 0x0a) + biasRamp));
  ram.setU16(a4 + 0x0e, u16(ram.u16(a4 + 0x0e) + biasRamp));
}

function altGun0AttachedVolley(ram, rom, ctx, a4, a5, a6) {
  const d0 = ram.u32(a4 + 0x0a);
  const d2 = ram.u32(a6 + 0x02);
  for (const part of ALT_GUN0_PARTS) ram.setU8(a6 + part + 0x1e, 1);
  for (let i = 0; i < ALT_GUN0_PARTS.length; i++) {
    const part = ALT_GUN0_PARTS[i];
    const facing = ram.u16(a6 + part + 0x1a);
    const scaled = u16((facing & 0xff00) | u8((facing & 0xff) * 4));
    let d1 = u16((scaled & 0xff00) | u8(scaled + ram.u8(a4 + 0x1a + i)));
    const d3 = (rom.u32(HIBACHI_A1.altGun0Vectors + i16(scaled))
      + rom.u32(HIBACHI_A1.altGun0Muzzles + i * 4)) >>> 0;
    const sites = ALT_GUN0_CALLS[i];
    shot(ram, rom, ctx, sites[0],
      { d0, d1, d2, d3, d4: 0, d5: 0, a5 }, HIBACHI_A1.altGun0Spawn);
    if (sites.length === 3) {
      d1 = u16(d1 + 0x18);
      shot(ram, rom, ctx, sites[1],
        { d0, d1, d2, d3, d4: 0, d5: 0, a5 }, HIBACHI_A1.altGun0Spawn);
      d1 = u16(d1 - 0x30);
      shot(ram, rom, ctx, sites[2],
        { d0, d1, d2, d3, d4: 0, d5: 0, a5 }, HIBACHI_A1.altGun0Spawn);
    }
  }
}

function altGun0Burst(ram, rom, ctx, a5, a6) {
  const d2 = ram.u32(a6 + 0x02);
  for (let row = 0; row < 6; row++) {
    const at = HIBACHI_A1.altGun0Burst + row * 10;
    const bias = u16(ram.u16(a6 + 0x1d8) + rom.u16(at));
    const d0 = ((bias << 16) | rom.u16(at + 2)) >>> 0;
    let d1 = u16(rom.u16(at + 4) - 0x18);
    const d5 = rom.u32(at + 6);
    for (let k = 0; k < 7; k++) {
      shot(ram, rom, ctx, 0x2a958a,
        { d0, d1, d2, d3: vector(rom, d1, d5), d4: 0, d5, a5 },
        HIBACHI_A1.altGun0Spawn);
      d1 = u16(d1 + 8);
    }
  }
}

/** `$2A93DC`. Fire the six attachments, run the periodic burst, then advance the magazine. */
export function altGun0Step2A93DC(ram, rom, ctx, a4, a5, a6) {
  const timer = ram.u8(a4 + 0x02);
  ram.setU8(a4 + 0x02, u8(timer - 1));
  if (timer !== 0) return;

  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x08));
  altGun0AttachedVolley(ram, rom, ctx, a4, a5, a6);
  if (ram.u8(a4 + 0x04) === 0) altGun0Burst(ram, rom, ctx, a5, a6);

  const magazine = ram.u8(a4 + 0x04);
  ram.setU8(a4 + 0x04, u8(magazine - 1));
  if (magazine !== 0) return;

  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));
  altGun0Randomize(ram, rom, a4);
  if (i16(ram.u16(a4 + 0x0a)) < 0x10) {
    ram.setU16(a4 + 0x0a, u16(ram.u16(a4 + 0x0a) + 1));
  }
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x09));
  for (const part of ALT_GUN0_PARTS) ram.setU8(a6 + part + 0x1e, 0);
  ram.setU8(a5 + 0x03, ram.u8(a5 + 0x03) ^ 1);

  const groups = ram.u8(a4 + 0x06);
  ram.setU8(a4 + 0x06, u8(groups - 1));
  if (groups !== 0) return;

  ram.setU8(a4 + 0x06, ram.u8(a4 + 0x07));
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));
  if (ram.u8(a6 + 0x1c6) < 6) ram.setU8(a6 + 0x1c6, u8(ram.u8(a6 + 0x1c6) + 2));
  if (ram.u8(a6 + 0x1c8) < 2) ram.setU8(a6 + 0x1c8, u8(ram.u8(a6 + 0x1c8) + 1));
  if (ram.u8(a6 + 0x1c9) < 0x20) ram.setU8(a6 + 0x1c9, u8(ram.u8(a6 + 0x1c9) + 8));
  if (i16(ram.u16(a6 + 0x1ca)) < 0x10) {
    ram.setU16(a6 + 0x1ca, u16(ram.u16(a6 + 0x1ca) + 1));
  }
  if (i16(ram.u16(a6 + 0x1d8)) < 8) {
    ram.setU16(a6 + 0x1d8, u16(ram.u16(a6 + 0x1d8) + 2));
  }
  a1Stop259B08(ram, 0);
}

// ===========================================================================
// LOOP-ZERO GUN 1 -- $2A97F4 / $2A9874
// ===========================================================================

const ALT_GUN1_AIM_SITES = Object.freeze([
  0x2a98ee, 0x2a98f6, 0x2a9904, 0x2a990c, 0x2a9916, 0x2a9926, 0x2a992e,
]);
const ALT_GUN1_LEFT_SITES = Object.freeze([0x2a996c, 0x2a997a, 0x2a9988]);
const ALT_GUN1_RIGHT_SITES = Object.freeze([0x2a99b8, 0x2a99c6, 0x2a99d4]);

/** `$2A97F4`. Copy fifteen words, choose the mirrored drift, mark all six parts,
 *  and apply the three loop-zero difficulty ramps. */
export function altGun1Init2A97F4(ram, rom, a4, a6) {
  copyTemplate(ram, rom, a4, HIBACHI_A1.altGun1Template, 15);
  if (drawNegative242EC2(ram, rom)) {
    ram.setU8(a4 + 0x1e, u8(-ram.u8(a4 + 0x1e)));
    ram.setU8(a4 + 0x1f, u8(-ram.u8(a4 + 0x1f)));
    ram.setU8(a4 + 0x1e, u8(ram.u8(a4 + 0x1e) + drawByte2431F4(ram, rom)));
    ram.setU8(a4 + 0x1f, u8(ram.u8(a4 + 0x1f) + drawByte2431F4(ram, rom)));
  }
  for (const part of ALT_GUN0_PARTS) ram.setU8(a6 + part + 0x1e, 1);

  const volleyRamp = ram.u8(a6 + 0x1cc);
  ram.setU8(a4 + 0x04, u8(ram.u8(a4 + 0x04) + volleyRamp));
  ram.setU8(a4 + 0x05, u8(ram.u8(a4 + 0x05) + volleyRamp));
  ram.setU16(a4 + 0x0a, u16(ram.u16(a4 + 0x0a) + ram.u16(a6 + 0x1ce)));
  const mirrorRamp = ram.u16(a6 + 0x1d0);
  for (const off of [0x0e, 0x12, 0x16]) {
    ram.setU16(a4 + off, u16(ram.u16(a4 + off) + mirrorRamp));
  }
}

/** The seven-shot aimed accent at `$2A989A..$2A9938`.
 *  Returns D1 as the cartridge leaves it, or null when both players are dead. */
function altGun1AimFan(ram, rom, ctx, a4, a5, a6) {
  const tgt = pickTarget(ram, a5);
  if (tgt === null) return null;
  const aim = aim256(aimTables(rom),
    u16(ram.u16(a6 + 0x02) + 0xf0c0), ram.u16(a6 + 0x04),
    ram.u16(tgt + 0x02), ram.u16(tgt + 0x04));
  const center = u8(aim + (i8(drawByte242B3C(ram, rom)) >> 1));
  const base = ram.u32(a4 + 0x0a);
  const d2 = ram.u32(a6 + 0x02);
  const rows = [
    [-3, 0], [3, 0], [0, 2], [-6, 2], [6, 2], [-3, 4], [3, 4],
  ];
  for (let i = 0; i < rows.length; i++) {
    const [angle, bias] = rows[i];
    shot(ram, rom, ctx, ALT_GUN1_AIM_SITES[i], {
      d0: (base + bias * 0x10000) >>> 0,
      d1: u8(center + angle), d2, d3: 0xf0c00000, d4: 0, d5: 0, a5,
    }, HIBACHI_A1.altGun0Spawn);
  }
  ram.setU8(a5 + 0x03, ram.u8(a5 + 0x03) ^ 1);
  return u8(center + 3);
}

/** One three-shot half of the mirrored body. The two halves differ only in
 *  their horizontal D3 delta and call sites. */
function altGun1Triad(ram, rom, ctx, a4, a5, a6, start, d3, sites) {
  const d2 = ram.u32(a6 + 0x02);
  let d1 = start;
  shot(ram, rom, ctx, sites[0],
    { d0: ram.u32(a4 + 0x0e), d1, d2, d3, d4: 0, d5: 0, a5 },
    HIBACHI_A1.altGun0Spawn);
  d1 = u8(d1 + 0x20);
  shot(ram, rom, ctx, sites[1],
    { d0: ram.u32(a4 + 0x12), d1, d2, d3, d4: 0, d5: 0, a5 },
    HIBACHI_A1.altGun0Spawn);
  d1 = u8(d1 + 0x60);
  shot(ram, rom, ctx, sites[2],
    { d0: ram.u32(a4 + 0x16), d1, d2, d3, d4: 0, d5: 0, a5 },
    HIBACHI_A1.altGun0Spawn);
  return d1;
}

/** `$2A9874`. The byte cadence deliberately ignores the freeze word. Every
 *  sixteenth volley adds an aimed accent; the two locked headings drift apart. */
export function altGun1Step2A9874(ram, rom, ctx, a4, a5, a6) {
  const timer = ram.u8(a4 + 0x02);
  ram.setU8(a4 + 0x02, u8(timer - 1));
  if (timer !== 0) return;

  const q = ram.u16(HIBACHI_A1.altCadenceRank) >>> 2;
  ram.setU8(a4 + 0x02, u8(7 - q));
  let d1 = u8(q);
  const magazine = ram.u8(a4 + 0x04);
  let skipPattern = false;
  if ((magazine & 0x0f) === 0) {
    const aimedD1 = altGun1AimFan(ram, rom, ctx, a4, a5, a6);
    if (aimedD1 === null) skipPattern = true;
    else d1 = aimedD1;
  }

  if (!skipPattern) {
    if (magazine === ram.u8(a4 + 0x05)) {
      d1 = u8(d1 + 0x40);
      ram.setU8(a4 + 0x08, d1);
      d1 = u8(d1 + 0x80);
      ram.setU8(a4 + 0x09, u8(-d1));
    }

    d1 = altGun1Triad(ram, rom, ctx, a4, a5, a6,
      ram.u8(a4 + 0x08), 0xf2c0fc00, ALT_GUN1_LEFT_SITES);
    if ((magazine & 1) !== 0) {
      d1 = u8(d1 + 0x20);
      shot(ram, rom, ctx, 0x2a99a0,
        { d0: 0x00090003, d1, d2: ram.u32(a6 + 0x02), d3: 0xf2c0fc00,
          d4: 0, d5: 0, a5 }, HIBACHI_A1.altGun0Spawn);
    }

    d1 = altGun1Triad(ram, rom, ctx, a4, a5, a6,
      ram.u8(a4 + 0x09), 0xf2c00400, ALT_GUN1_RIGHT_SITES);
    if ((magazine & 1) !== 0) {
      shot(ram, rom, ctx, 0x2a99e8,
        { d0: 0x00090003, d1, d2: ram.u32(a6 + 0x02), d3: 0xf2c00400,
          d4: 0, d5: 0, a5 }, HIBACHI_A1.altGun0Spawn);
    }

    ram.setU8(a4 + 0x08, u8(ram.u8(a4 + 0x08) + ram.u8(a4 + 0x1e)));
    ram.setU8(a4 + 0x09, u8(ram.u8(a4 + 0x09) + ram.u8(a4 + 0x1f)));
  }

  ram.setU8(a4 + 0x04, u8(magazine - 1));
  if (magazine !== 0) return;

  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));
  ram.setU8(a4 + 0x1e, u8(-ram.u8(a4 + 0x1e)));
  ram.setU8(a4 + 0x1f, u8(-ram.u8(a4 + 0x1f)));
  if (ram.u8(a6 + 0x1cc) < 0x3c) {
    ram.setU8(a6 + 0x1cc, u8(ram.u8(a6 + 0x1cc) + 0x14));
  }
  if (i16(ram.u16(a6 + 0x1ce)) < 8) {
    ram.setU16(a6 + 0x1ce, u16(ram.u16(a6 + 0x1ce) + 1));
  }
  if (i16(ram.u16(a6 + 0x1d0)) < 0x1a) {
    ram.setU16(a6 + 0x1d0, u16(ram.u16(a6 + 0x1d0) + 1));
  }
  for (const part of ALT_GUN0_PARTS) ram.setU8(a6 + part + 0x1e, 0);
  a1Stop259B08(ram, 1);
}

// ===========================================================================
// LOOP-ZERO GUN 2 -- $2A9AA0 / $2A9B0E
// ===========================================================================

const ALT_GUN2_STANDARD = Object.freeze([
  Object.freeze([0x20, 0x70, 0xc0, 0x2a9c02, 0x2a9c16]),
  Object.freeze([0x40, 0x7c, 0xb8, 0x2a9c44, 0x2a9c58]),
  Object.freeze([0x60, 0x98, 0xb0, 0x2a9c86, 0x2a9c9a]),
  Object.freeze([0x80, 0x90, 0x40, 0x2a9cc8, 0x2a9cdc]),
  Object.freeze([0xa0, 0x84, 0x48, 0x2a9d0a, 0x2a9d1e]),
  Object.freeze([0xc0, 0x68, 0x50, 0x2a9d4c, 0x2a9d60]),
]);

function altGun2Randomize(ram, rom, a4) {
  for (let i = 0; i < ALT_GUN0_PARTS.length; i++) {
    ram.setU8(a4 + 0x14 + i, drawByte242B3C(ram, rom));
  }
}

/** `$2A9AA0`. Copy twelve words, seed six heading offsets, and apply both ramps. */
export function altGun2Init2A9AA0(ram, rom, a4, a6) {
  copyTemplate(ram, rom, a4, HIBACHI_A1.altGun2Template, 12);
  if (ram.u8(a6 + 0x13c) !== 0) {
    ram.setU8(a4 + 0x12, u8(-ram.u8(a4 + 0x12)));
  }
  const countRamp = ram.u8(a6 + 0x1d2);
  ram.setU8(a4 + 0x06, u8(ram.u8(a4 + 0x06) + countRamp));
  ram.setU8(a4 + 0x07, u8(ram.u8(a4 + 0x07) + countRamp));
  ram.setU16(a4 + 0x0e, u16(ram.u16(a4 + 0x0e) + ram.u16(a6 + 0x1d4)));
  altGun2Randomize(ram, rom, a4);
}

/** The one-or-three-shot aimed arm at `$2A9B4A..$2A9BD4`.
 *  Returns false only when both players are dead. */
function altGun2Aim(ram, rom, ctx, a4, a5, a6) {
  const tgt = pickTarget(ram, a5);
  if (tgt === null) return false;

  let d1 = aim256(aimTables(rom),
    u16(ram.u16(a6 + 0x02) + 0xf0c0), ram.u16(a6 + 0x04),
    ram.u16(tgt + 0x02), ram.u16(tgt + 0x04));
  let d0 = ram.u32(a4 + 0x0e);
  const d2 = ram.u32(a6 + 0x02);
  const d3 = 0xf0c00000;
  let d5 = u16(ram.u16(a6 + 0x02) + 0xf600);

  if (ram.u16(tgt + 0x02) >= d5) {
    d0 = (d0 + 0x00100000) >>> 0;
    d5 = drawWord242B90(ram, rom);
    d1 = u8(d1 + (i8(d5) >> 1));
    shot(ram, rom, ctx, 0x2a9bb2,
      { d0, d1, d2, d3, d4: 0, d5, a5 }, HIBACHI_A1.altGun0Spawn);
    d0 = (d0 + 0x00040000) >>> 0;
    shot(ram, rom, ctx, 0x2a9bbe,
      { d0, d1, d2, d3, d4: 0, d5, a5 }, HIBACHI_A1.altGun0Spawn);
    d0 = (d0 + 0x00040000) >>> 0;
  }
  shot(ram, rom, ctx, 0x2a9bca,
    { d0, d1, d2, d3, d4: 0, d5, a5 }, HIBACHI_A1.altGun0Spawn);
  ram.setU8(a5 + 0x03, ram.u8(a5 + 0x03) ^ 1);
  return true;
}

/** Twelve attached kind-$13 shots, two from each of the six rotating parts. */
function altGun2Standard(ram, rom, ctx, a4, a5, a6) {
  const d2 = ram.u32(a6 + 0x02);
  for (let i = 0; i < ALT_GUN2_STANDARD.length; i++) {
    const [part, angleA, angleB, siteA, siteB] = ALT_GUN2_STANDARD[i];
    const facing = ram.u16(a6 + part + 0x1a);
    const scaled = u16((facing & 0xff00) | u8((facing & 0xff) * 4));
    const d3 = (rom.u32(HIBACHI_A1.altGun0Vectors + i16(scaled))
      + rom.u32(HIBACHI_A1.altGun0Muzzles + i * 4)) >>> 0;
    let d0 = ram.u32(a4 + 0x0a);
    const random = ram.u8(a4 + 0x14 + i);
    shot(ram, rom, ctx, siteA,
      { d0, d1: u8(angleA + random), d2, d3, d4: 0, d5: 0, a5 },
      HIBACHI_A1.altGun0Spawn);
    d0 = (d0 + 0x000d0000) >>> 0;
    shot(ram, rom, ctx, siteB,
      { d0, d1: u8(angleB + random), d2, d3, d4: 0, d5: 0, a5 },
      HIBACHI_A1.altGun0Spawn);
  }
}

function altGun2RotateParts(ram, a4, a6) {
  const step = ram.u8(a4 + 0x12);
  for (let i = 0; i < ALT_GUN0_PARTS.length; i++) {
    const at = a6 + ALT_GUN0_PARTS[i] + 0x1b;
    const next = i % 2 === 0 ? ram.u8(at) + step : ram.u8(at) - step;
    ram.setU8(at, u8(next) & 0x3f);
  }
}

/** `$2A9B0E`. Run sixteen magazines, then advance the cartridge ramps and retire. */
export function altGun2Step2A9B0E(ram, rom, ctx, a4, a5, a6) {
  const timer = ram.u8(a4 + 0x02);
  ram.setU8(a4 + 0x02, u8(timer - 1));
  if (timer !== 0) return;

  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x08));
  for (const part of ALT_GUN0_PARTS) ram.setU8(a6 + part + 0x1e, 1);

  let skipStandard = false;
  if ((ram.u8(a4 + 0x04) & 2) !== 0) {
    skipStandard = !altGun2Aim(ram, rom, ctx, a4, a5, a6);
  }
  if (!skipStandard) altGun2Standard(ram, rom, ctx, a4, a5, a6);
  altGun2RotateParts(ram, a4, a6);

  const magazine = ram.u8(a4 + 0x04);
  ram.setU8(a4 + 0x04, u8(magazine - 1));
  if (magazine !== 0) return;

  ram.setU8(a4 + 0x04,
    u8(ram.u8(a4 + 0x05) + (i8(drawByte242B3C(ram, rom)) >> 1)));
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x09));
  altGun2Randomize(ram, rom, a4);

  const magazines = ram.u8(a4 + 0x06);
  ram.setU8(a4 + 0x06, u8(magazines - 1));
  if (magazines !== 0) return;

  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));
  ram.setU8(a6 + 0x13c, ram.u8(a6 + 0x13c) ^ 0xff);
  if (ram.u16(a6 + 0x1d2) < 4) {
    ram.setU16(a6 + 0x1d2, u16(ram.u16(a6 + 0x1d2) + 1));
  }
  if (ram.u16(a6 + 0x1d4) < 4) {
    ram.setU16(a6 + 0x1d4, u16(ram.u16(a6 + 0x1d4) + 1));
  }
  for (const part of ALT_GUN0_PARTS) ram.setU8(a6 + part + 0x1e, 0);
  a1Stop259B08(ram, 2);
}

// ===========================================================================
// LOOP-ZERO GUN 3 -- $2A9E84 / $2A9EB6
// ===========================================================================

/** `$2A9E84`. Copy ten words and apply the loop-zero count, speed, and cadence ramps. */
export function altGun3Init2A9E84(ram, rom, a4, a6) {
  copyTemplate(ram, rom, a4, HIBACHI_A1.altGun3Template, 10);
  const speedRamp = ram.u16(a6 + 0x13e);
  ram.setU16(a4 + 0x0a, u16(ram.u16(a4 + 0x0a) + speedRamp));
  ram.setU16(a4 + 0x12, u16(ram.u16(a4 + 0x12) + speedRamp));
  const groupRamp = ram.u8(a6 + 0x1d6);
  ram.setU8(a4 + 0x06, u8(ram.u8(a4 + 0x06) + groupRamp));
  ram.setU8(a4 + 0x07, u8(ram.u8(a4 + 0x07) + groupRamp));
  ram.setU8(a4 + 0x09, u8(ram.u8(a4 + 0x09) - ram.u8(a6 + 0x1d7)));
}

/** 68000 `asr.b D5,D4`: the count is modulo 64 and counts past bit 7 saturate. */
function altGun3ShiftBias(word, count) {
  const value = i8(word);
  const shift = count & 0x3f;
  if (shift === 0) return value;
  if (shift >= 8) return value < 0 ? -1 : 0;
  return value >> shift;
}

/** The paired live-target volley. The negative-X aim fires first, then the restored positive-X aim. */
function altGun3Volley(ram, rom, ctx, a4, a5, a6, target) {
  const sourceY = u16(ram.u16(a6 + 0x02) + 0x0940);
  const sourceX = ram.u16(a6 + 0x04);
  const targetY = ram.u16(target + 0x02);
  const targetX = ram.u16(target + 0x04);
  const positiveAim = aim256(aimTables(rom),
    sourceY, u16(sourceX + 0x0d00), targetY, targetX);
  const negativeAim = aim256(aimTables(rom),
    sourceY, u16(sourceX - 0x0d00), targetY, targetX);

  const row = HIBACHI_A1.altGun3Pattern + ram.u16(a4 + 0x0e);
  const d0 = ram.u32(a4 + 0x0a);
  const d2 = ram.u32(a6 + 0x02);
  const d5 = ram.u8(a4 + 0x14);
  const d6 = ram.u8(a4 + 0x06);
  shot(ram, rom, ctx, 0x2a9f5c, {
    d0, d1: u8(negativeAim + altGun3ShiftBias(rom.u16(row + 0x04), d5)),
    d2, d3: rom.u32(row), d4: 0, d5, d6, a5,
  }, HIBACHI_A1.altGun0Spawn);
  shot(ram, rom, ctx, 0x2a9f78, {
    d0, d1: u8(positiveAim + altGun3ShiftBias(rom.u16(row + 0x0a), d5)),
    d2, d3: rom.u32(row + 0x06), d4: 0, d5, d6: u8(~d6), a5,
  }, HIBACHI_A1.altGun0Spawn);

  const cursor = ram.u16(a4 + 0x0e);
  ram.setU16(a4 + 0x0e, cursor < HIBACHI_A1.altGun3PatternStride
    ? 0x0030 : u16(cursor - HIBACHI_A1.altGun3PatternStride));
}

/** `$2A9EB6`. Fire the five-row paired pattern without a gun-level freeze check. */
export function altGun3Step2A9EB6(ram, rom, ctx, a4, a5, a6) {
  const timer = ram.u8(a4 + 0x02);
  ram.setU8(a4 + 0x02, u8(timer - 1));
  if (timer !== 0) return;
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x08));

  if (ram.u8(a4 + 0x04) === ram.u8(a4 + 0x05)) {
    ram.setU8(a4 + 0x14, drawByte2431F4(ram, rom));
  }
  const target = pickTarget(ram, a5);
  if (target !== null) altGun3Volley(ram, rom, ctx, a4, a5, a6, target);

  ram.setU16(a4 + 0x0a, u16(ram.u16(a4 + 0x0a) + 1));
  const magazine = ram.u8(a4 + 0x04);
  ram.setU8(a4 + 0x04, u8(magazine - 1));
  if (magazine !== 0) return;

  ram.setU8(a5 + 0x03, ram.u8(a5 + 0x03) ^ 1);
  if (ram.u8(a4 + 0x05) < 0x1e) {
    ram.setU8(a4 + 0x05, u8(ram.u8(a4 + 0x05) + 0x0f));
  }
  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x09));
  ram.setU16(a4 + 0x12, u16(ram.u16(a4 + 0x12) + 1));
  ram.setU16(a4 + 0x0a, ram.u16(a4 + 0x12));

  const groups = ram.u8(a4 + 0x06);
  ram.setU8(a4 + 0x06, u8(groups - 1));
  if (groups !== 0) return;

  ram.setU8(a4 + 0x06, ram.u8(a4 + 0x07));
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));
  if (ram.u8(a6 + 0x1d6) < 2) {
    ram.setU8(a6 + 0x1d6, u8(ram.u8(a6 + 0x1d6) + 1));
  }
  if (ram.u16(a6 + 0x13e) < 6) {
    ram.setU16(a6 + 0x13e, u16(ram.u16(a6 + 0x13e) + 1));
  }
  if (ram.u8(a6 + 0x1d7) < 0x10) {
    ram.setU8(a6 + 0x1d7, u8(ram.u8(a6 + 0x1d7) + 4));
  }
  a1Stop259B08(ram, 3);
}

// ===========================================================================
// LOOP-ZERO GUN 4 -- $2AA072 / $2AA084
// ===========================================================================

const ALT_GUN4_SITES = Object.freeze([
  0x2aa0e4, 0x2aa0e4, 0x2aa12c, 0x2aa12c,
  0x2aa174, 0x2aa174, 0x2aa1bc, 0x2aa1bc,
]);
const ALT_GUN4_HEADINGS = Object.freeze([0x00, 0x10, 0x40, 0x50, 0x80, 0x90, 0xc0, 0xd0]);

/** `$23C4A0`: select shake mode 1 and clear the divide-gate cursor. */
function altGun4Shake23C4A0(ram) {
  ram.setU16(0x803934, 1);
  ram.setU16(0x803936, 0);
}

/** `$2AA072`. Copy the nine template words and return without any side effect. */
export function altGun4Init2AA072(ram, rom, a4) {
  copyTemplate(ram, rom, a4, HIBACHI_A1.altGun4Template, 9);
}

function altGun4Volley(ram, rom, ctx, a4, a5, a6) {
  const heading = ram.u8(a4 + 0x13);
  const d0 = ram.u32(a4 + 0x0a);
  const d2 = ram.u32(a6 + 0x02);
  for (let i = 0; i < ALT_GUN4_HEADINGS.length; i++) {
    const d1 = u8(heading + ALT_GUN4_HEADINGS[i]);
    shot(ram, rom, ctx, ALT_GUN4_SITES[i], {
      d0, d1, d2, d3: vector(rom, d1), d4: 0, d5: 0xf0c00000,
      d6: 0x10, d7: 1, a5,
    }, HIBACHI_A1.altGun0Spawn);
  }
}

/** `$2AA084`. Run the permanent eight-shot spiral without freeze, target, or retirement gates. */
export function altGun4Step2AA084(ram, rom, ctx, a4, a5, a6) {
  const timer = ram.u8(a4 + 0x02);
  ram.setU8(a4 + 0x02, u8(timer - 1));
  if (timer !== 0) return;

  const lowHp = ram.u32(a5 + 0x16) < 0x0000eb33;
  let cadence = ram.u8(a4 + 0x08);
  if (lowHp) {
    cadence = u8(cadence - 2);
    altGun4Shake23C4A0(ram);
  }
  ram.setU8(a4 + 0x02, cadence);

  altGun4Volley(ram, rom, ctx, a4, a5, a6);
  const headingStep = i8(ram.u8(a4 + 0x12));
  ram.setU8(a4 + 0x13,
    u8(ram.u8(a4 + 0x13) + (lowHp ? headingStep * 2 : headingStep)));

  const body = ram.u8(a4 + 0x04);
  ram.setU8(a4 + 0x04, u8(body - 1));
  if (body !== 0) return;

  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x09));
  ram.setU8(a4 + 0x12, u8(-ram.u8(a4 + 0x12)));
  if (i16(ram.u16(a4 + 0x0a)) < 6) {
    ram.setU16(a4 + 0x0a, u16(ram.u16(a4 + 0x0a) + 2));
  }

  const outer = ram.u8(a4 + 0x06);
  ram.setU8(a4 + 0x06, u8(outer - 1));
  if (outer !== 0) return;

  ram.setU8(a4 + 0x06, ram.u8(a4 + 0x07));
  if (ram.u8(a4 + 0x08) > 7) {
    const reduced = u8(ram.u8(a4 + 0x08) - 2);
    ram.setU8(a4 + 0x08, reduced);
    if (reduced <= 7) altGun4Shake23C4A0(ram);
  }
  if (ram.u8(a4 + 0x05) < 0xc7) {
    ram.setU8(a4 + 0x05, u8(ram.u8(a4 + 0x05) + 0x14));
  }
  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));
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
 * `$2A81DA jsr $242EC2 / $2A81E0 bpl.w` is a random INITIAL DIRECTION for the
 * sweep: `$2A81E4 neg.b ($11,A4)` starts it running down instead of up.
 *
 * **W416 -- THIS ARM IS NOT DEAD, AND THIS COMMENT USED TO SAY IT WAS.**  It
 * argued that `$242EC2` has no `ext.w`, so bit 15 of the returned word is
 * always clear and `bpl` is always taken.  Bit 15 is not what `bpl` reads.
 * `$242ED6 move.b (A0,D0.w),D0` is the last instruction in `$242EC2` to touch
 * the CCR (`$242EDA movea.l` and `$242EDC rts` touch none), so N is **bit 7 of
 * the table byte** and the negate runs on 128 of the 256 table entries.
 * Docket D48; `src/rng.js drawNegative242EC2` is the flag.
 */
export function gun5Init2A81BC(ram, rom, a4, a6) {
  copyTemplate(ram, rom, a4, HIBACHI_A1.gun5Template, 8);   // $2A81BC..$2A81CA
  // $2A81CC jsr $242E24 / addi.b #$60,D0 / move.b D0,($10,A4) -- the sweep's
  // random START, biased into $60..$15F truncated to a byte.
  ram.setU8(a4 + 0x10, u8(drawByte242E24(ram, rom) + 0x60));   // $2A81D2/$2A81D6
  if (drawNegative242EC2(ram, rom)) {                  // $2A81DA jsr / $2A81E0 bpl.w
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

/** `$2A827A..$2A8286` and `$2A82BC..$2A82C8`, the SAME five instructions twice,
 *  and `$2A88E8..$2A88F4` a third time in gun 8:
 *  `move.w D1,D3 / addq.w #$2,D3 / andi.w #$FC,D3 / move.l ($0,A1,D3.w),D3 /
 *  add.l D5,D3`.  The `+2` before the mask is a ROUND-TO-NEAREST on a table of
 *  64 longwords indexed four bytes apart, not an off-by-one.
 *
 *  The added longword is the register the SITE holds, not a constant of the
 *  table: gun 5 carries `$F0C00000` in D5 and gun 8 carries `$D8000000` in D6,
 *  so it is a parameter here.  `andi.w #$FC` keeps bits 2..7 only, so only D1's
 *  low BYTE can reach the index however wide the caller's arithmetic was. */
function vector(rom, d1, add = 0xf0c00000) {
  const d3 = u16(u16(d1 + 2) & 0x00fc);                // $2A827C addq / $2A827E andi
  return (rom.u32(HIBACHI_A1.vectors + d3) + add) >>> 0;          // $2A8282/$2A8286
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
// GUN 7 -- $2A8516 / $2A8538.  W405.  A ROM-DRIVEN pattern, not an arithmetic
// one: four blocks of ten {delta, bias, angle} records, read two at a time.
// ===========================================================================
/**
 * `$2A8516` -- NINE template words (`moveq #$8`), then two ramp arithmetic ops
 * that pull in OPPOSITE directions.
 *
 * `$2A852A add.w D0,($A,A4)` raises the SPEED BIAS by `($1EC,A6)` and
 * `$2A8532 sub.b D0,($9,A4)` *lowers* the between-block pause by `($1E7,A6)` --
 * a `sub`, not an `add`, and the only subtracting ramp in the family.  Both A6
 * fields are the ones this gun's own retire path raises, so the gun gets faster
 * and harder every time HIBACHI runs it.
 *
 * The nine words are five packed BYTE PAIRS and four whole words (TRAP 3, one
 * word literal covering two byte fields):
 *
 *   ($2,A4)=$60 countdown   ($3,A4)=$80 unused reload   [$6080]
 *   ($4,A4)=$1D volleys     ($5,A4)=$1D volley reload   [$1D1D]
 *   ($6,A4)=$02 BLOCK index ($7,A4)=$02 unread          [$0202]
 *   ($8,A4)=$01 in-block gap ($9,A4)=$30 between-block  [$0130]
 *   ($A,A4)=$0005 bias  ($C,A4)=$0003 kind   -- the long `$2A8586` loads
 *   ($E,A4)=$0002 bias step  ($10,A4)=$0004 second kind
 *   ($12,A4)=$0040 the in-block cursor
 */
export function gun7Init2A8516(ram, rom, a4, a6) {
  copyTemplate(ram, rom, a4, HIBACHI_A1.gun7Template, 9);   // $2A8516..$2A8524
  ram.setU16(a4 + 0x0a, u16(ram.u16(a4 + 0x0a)
    + ram.u16(a6 + 0x1ec)));                           // $2A8526/$2A852A add.w D0,($A,A4)
  ram.setU8(a4 + 0x09, u8(ram.u8(a4 + 0x09)
    - ram.u8(a6 + 0x1e7)));                            // $2A852E/$2A8532 SUB.b, not add
}

/**
 * `$2A8538` -- FOUR shots a volley, off TWO eight-byte ROM records.
 *
 * `$2A8590 lea ($EE,PC),A3` reaches `$2A8680`, four longwords over four
 * contiguous 80-byte blocks.  `($6,A4)` picks the block (`move.b ($6,A4),D4 /
 * add.w D4,D4` TWICE, so the index is a byte scaled by four) and `($12,A4)`
 * walks inside it in `$10` strides, which is why each step consumes exactly two
 * records: `move.l (A3)+ / add.w (A3)+ / move.w (A3)+`, twice.
 *
 * **THE MIRROR SHOT IS AT MINUS FIVE EIGHTHS OF THE OFFSET, NOT AT MINUS ONE.**
 * `$2A85BE move.w D5,D4 / asr.w #$1,D4 / add.w D4,D5 / asr.w #$2,D4 / add.w
 * D4,D5` builds `1.625 * angle` and `$2A85C8 sub.w D5,D1` subtracts it from a
 * D1 that already had `+angle` added, so the pair straddles the aim at `+a` and
 * `-0.625a`.  The two `asr.w`s round toward minus infinity and the transcription
 * keeps that; a `/2` in JavaScript would round toward zero and split the pair
 * differently for every negative record, which is half of all forty.
 *
 * **THE SHIPPED TEMPLATE NEVER REACHES BLOCK 3.**  `($6,A4)` starts at 2 and
 * `$2A8656 subq.b #$1` walks it 2, 1, 0 and then borrows into the retire, so
 * `$2A8690` -- the +-10/+-5 block, the narrowest of the four -- is dead with
 * this template.  It is transcribed as data, not folded away: `($6,A4)` is a
 * copied byte and a different template would use it.
 *
 * **`$2A856E bpl.w $2A8626` skips the CURSOR STEP as well as the shots**, so a
 * gun firing at nobody does not advance its pattern -- the same shape gun 5 has
 * and the opposite of gun 6, whose "both dead" arm lands on the join.
 */
export function gun7Step2A8538(ram, rom, ctx, a4, a5, a6) {
  if (!gunTick(ram, a4, () => gun7Init2A8516(ram, rom, a4, a6))) return;

  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x08));             // $2A854A move.b ($8,A4),($2,A4)
  const tgt = pickTarget(ram, a5);                     // $2A8550..$2A8572
  if (tgt !== null) {                                  // $2A856E bpl.w $2A8626
    const ty = ram.u16(tgt + 0x02), tx = ram.u16(tgt + 0x04);   // $2A8574 movem.w
    // NO position bias here: gun 5 adds $F0C0 to its own Y before aiming and
    // gun 7 does not ($2A857A movem.w ($2,A6),D0-D1 straight into $2A8580).
    const aim = aim256(aimTables(rom),                 // $2A8580 jsr $2422A2
      ram.u16(a6 + 0x02), ram.u16(a6 + 0x04), ty, tx);
    const d2 = ram.u32(a6 + 0x02);                     // $2A858A move.l ($2,A6),D2
    // $2A8590 lea $2A8680,A3 / $2A8596..$2A85A2 movea.l (A3),A3 -- the block
    const block = rom.u32(HIBACHI_A1.gun7Blocks
      + u16(ram.u8(a4 + 0x06) * 4));                   // $2A8598/$2A859C/$2A859E
    let cur = block + ram.u16(a4 + 0x12);              // $2A85A4/$2A85A8 adda.w
    const base = ram.u32(a4 + 0x0a);                   // $2A8586/$2A85E0 move.l ($A,A4),D0
    const kind2 = ram.u16(a4 + 0x10);                  // $2A85D2/$2A860C move.w ($10,A4),D0
    for (const [siteA, siteB] of [[0x2a85b8, 0x2a85d8], [0x2a85f2, 0x2a8612]]) {
      const d3 = rom.u32(cur);                         // $2A85AA move.l (A3)+,D3
      const bias = u16((base >>> 16) + rom.u16(cur + 4));   // $2A85AC swap / add.w (A3)+
      const angle = rom.u16(cur + 6);                  // $2A85B2 move.w (A3)+,D5
      cur += HIBACHI_A1.gun7RecordLen;
      const d1 = u16(aim + angle);                     // $2A85B4 add.w D5,D1
      shot(ram, rom, ctx, siteA,
        { d0: ((bias << 16) | (base & 0xffff)) >>> 0, d1, d2, d3, d4: 0, d5: angle, a5 });
      // $2A85BE..$2A85C6 -- 1 + 1/2 + 1/8 of the offset, then subtracted.
      let d4 = asrw(angle, 1);                         // $2A85C0 asr.w #$1,D4
      let d5 = u16(angle + d4);                        // $2A85C2 add.w D4,D5
      d4 = asrw(d4, 2);                                // $2A85C4 asr.w #$2,D4
      d5 = u16(d5 + d4);                               // $2A85C6 add.w D4,D5
      const bias2 = u16(bias + ram.u16(a4 + 0x0e));    // $2A85CA swap / add.w ($E,A4)
      shot(ram, rom, ctx, siteB,
        { d0: ((bias2 << 16) | kind2) >>> 0, d1: u16(d1 - d5), d2, d3, d4: 0, d5, a5 });
    }
    // $2A8618 subi.w #$10,($12,A4) / bcc.s / move.w #$40,($12,A4) -- FIVE cursor
    // values, $40 down to 0, so the block the two records come from is $50 wide.
    const cursor = ram.u16(a4 + 0x12);
    ram.setU16(a4 + 0x12, u16(cursor - 0x10));
    if (cursor < 0x10) ram.setU16(a4 + 0x12, 0x0040);  // $2A8620, the BORROW arm
  }

  // ---- $2A8626.  The volley counter, and a re-arm that walks to the NEXT block.
  const n = ram.u8(a4 + 0x04);                         // $2A8626 subq.b #$1,($4,A4)
  ram.setU8(a4 + 0x04, u8(n - 1));
  if (n !== 0) return;                                 // $2A862A bcc.w $2A867E

  // TRAP: gun 7's `bchg ($3,A5)` is HERE, on the block boundary -- once per
  // block, not once per volley the way gun 6's is and not on the fan arm the
  // way gun 5's is.  The target alternates three times in a whole gun run.
  ram.setU8(a5 + 0x03, ram.u8(a5 + 0x03) ^ 1);         // $2A862E bchg #$0,($3,A5)
  if (ram.u8(a4 + 0x05) < 0x3b) {                      // $2A8634 cmpi.b #$3B / bcc.s
    ram.setU8(a4 + 0x05, u8(ram.u8(a4 + 0x05) + 0x0f));       // $2A863C addi.b #$F
  }
  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));             // $2A8642 -- ($5,A4) IS read
  ram.setU16(a4 + 0x0a, u16(ram.u16(a4 + 0x0a) + 2));  // $2A8648 addq.w #$2,($A,A4)
  ram.setU16(a4 + 0x0e, u16(ram.u16(a4 + 0x0e) + 1));  // $2A864C addq.w #$1,($E,A4)
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x09));             // $2A8650 the LONG pause
  const b = ram.u8(a4 + 0x06);                         // $2A8656 subq.b #$1,($6,A4)
  ram.setU8(a4 + 0x06, u8(b - 1));
  if (b !== 0) return;                                 // $2A865A bcc.w $2A867E

  // $2A865E..$2A8674 -- the two ramps this gun's own init reads back.
  if (ram.u8(a6 + 0x1e7) < 0x10) {                     // $2A865E cmpi.b #$10 / bcc.s
    ram.setU8(a6 + 0x1e7, u8(ram.u8(a6 + 0x1e7) + 8));        // $2A8666 addq.b #$8
  }
  if (ram.u16(a6 + 0x1ec) < 0x0b) {                    // $2A866A cmpi.w #$B / bcc.s
    ram.setU16(a6 + 0x1ec, u16(ram.u16(a6 + 0x1ec) + 2));     // $2A8672 addq.w #$2
  }
  a1Stop259B08(ram, 7);                                // $2A8676 moveq #$7 / $2A8678 jsr
}

// ===========================================================================
// GUN 8 -- $2A8800 / $2A883A.  W405.  A three-shot aimed burst that a RANGE
// TEST can decline, and a fourteen-shot converging ring that always fires.
// ===========================================================================
/** `$2A8800` -- EIGHT template words (`moveq #$7`), the sweep's random start
 *  and one ramp.  The `$242EC2` sign test is the same arm gun 5 has, and W416
 *  corrects what stood here: the branch reads **bit 7 of the drawn table byte**,
 *  not bit 15 of the returned word, so `$2A8828 neg.b ($11,A4)` runs on half
 *  the draws.  Docket D48.
 *
 *  Gun 5 biases its draw by `+$60` into $60..$15F; gun 8 biases it by `-$20`,
 *  so the sweep starts anywhere in -$20..$DF and the bounce band it lands in is
 *  a SIGNED one, $D0..$30. */
export function gun8Init2A8800(ram, rom, a4, a6) {
  copyTemplate(ram, rom, a4, HIBACHI_A1.gun8Template, 8);   // $2A8800..$2A880E
  ram.setU8(a4 + 0x10, u8(drawByte242E24(ram, rom) - 0x20));   // $2A8810/$2A8816/$2A881A
  if (drawNegative242EC2(ram, rom)) {                  // $2A881E jsr / $2A8824 bpl.w
    ram.setU8(a4 + 0x11, u8(-ram.u8(a4 + 0x11)));      // $2A8828 neg.b ($11,A4)
  }
  const d0 = ram.u8(a6 + 0x1ee);                       // $2A882C move.b ($1EE,A6),D0
  ram.setU8(a4 + 0x04, u8(ram.u8(a4 + 0x04) + d0));    // $2A8830 add.b D0,($4,A4)
  ram.setU8(a4 + 0x05, u8(ram.u8(a4 + 0x05) + d0));    // $2A8834 add.b D0,($5,A4)
}

/**
 * `$2A883A` -- seventeen shots a volley, and the first three are conditional.
 *
 * **`$2A8882 cmp.w D0,D2 / bcs.s` IS A RANGE TEST, AND IT IS UNSIGNED.**  D0 is
 * the boss's own Y plus `$D800` (`$2A887E addi.w #$D800,D0`) and D2 is the
 * chosen player's Y, so a player ABOVE `bossY - $2800` gets the three-shot
 * aimed burst and one below it does not.  The branch skips only the burst; the
 * fourteen-shot ring at `$2A88CA` is the join both arms reach, and `$2A886C
 * bpl.w $2A895C` -- the "both players dead" arm -- skips both and still lands
 * ON the `bchg`, the way gun 6 does and unlike guns 5 and 7.
 *
 * **THE RING IS FOURTEEN SHOTS AT SEVEN POSITIONS.**  Each `dbra` pass reads
 * ONE `$26BFFC` vector for the angle it holds and fires twice from it: once
 * outward at that angle, once at `angle + $80` -- the exact opposite heading --
 * from the SAME offset, because `$2A8914 addi.b #$80,D1` runs AFTER `$2A88F0`
 * has already indexed the table.  `$2A8922` adds `$80` back, so the pass-to-pass
 * step really is the `$F` at `$2A8928` and not `$8F`.
 *
 * **THE SPEED BIAS RAMPS DOWNWARD THROUGH THE PASSES AND THE KIND DOES NOT.**
 * `addq.w #$1,D0` / `swap / subq.w #$2,D0 / swap` / `subq.w #$1,D0` leaves the
 * kind where it started and the bias two lower every pass, so the fourteen come
 * out at biases $A, 8, 8, 6, 6, ... and the last pass is NEGATIVE ($FFFE).
 * Kinds 23 and 24 alternate, and both take `$2818F4`, the spawn-init that reads
 * D3, D4 AND D5 -- which is why the two `move.l #imm,D4` and `move.w #imm,D5`
 * constants below are transcribed and not dropped as scratch.
 */
export function gun8Step2A883A(ram, rom, ctx, a4, a5, a6) {
  if (!gunTick(ram, a4, () => gun8Init2A8800(ram, rom, a4, a6))) return;

  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x06));             // $2A884C move.b ($6,A4),($2,A4)
  const tgt = pickTarget(ram, a5);                     // $2A8852..$2A8870
  if (tgt !== null) {                                  // $2A886C bpl.w $2A895C
    const ty = ram.u16(tgt + 0x02), tx = ram.u16(tgt + 0x04);   // $2A8872 movem.w
    const sy = u16(ram.u16(a6 + 0x02) + 0xd800);       // $2A887E addi.w #$D800,D0
    const d2 = ram.u32(a6 + 0x02);                     // $2A8892 move.l ($2,A6),D2
    if (u16(ty) >= sy) {                               // $2A8882 cmp.w / $2A8884 bcs.s
      const aim = aim256(aimTables(rom), sy, ram.u16(a6 + 0x04), ty, tx);   // $2A8886
      // $2A889E jsr $242B90 -- `drawByte242B3C`'s D5-returning twin, the same
      // 256-byte table $242BAC with no mask and no `ext.w`.
      const d5 = u8(i8(drawByte242B3C(ram, rom)) >> 1);         // $2A88A4 asr.b #$1,D5
      let d1 = u8(aim + d5);                           // $2A88A6 add.b D5,D1 -- a BYTE add
      let d0 = 0x00080013;                             // $2A888C move.l #$80013,D0
      const d3 = 0xd8000000;                           // $2A8896 move.l #$D8000000,D3
      shot(ram, rom, ctx, 0x2a88a8, { d0, d1, d2, d3, d4: 0, d5, a5 });
      d1 = u8(d1 - 2);                                 // $2A88AE subq.b #$2,D1
      d0 = (d0 + 0x00040000) >>> 0;                    // $2A88B0 addi.l #$40000,D0
      shot(ram, rom, ctx, 0x2a88b6, { d0, d1, d2, d3, d4: 0, d5, a5 });
      d1 = u8(d1 + 4);                                 // $2A88BC addq.b #$4,D1
      d0 = (d0 + 0x00040000) >>> 0;                    // $2A88BE
      shot(ram, rom, ctx, 0x2a88c4, { d0, d1, d2, d3, d4: 0, d5, a5 });
    }

    // ---- $2A88CA.  The ring.  D1's HIGH BITS ARE INHERITED AND UNOBSERVABLE:
    // `move.b ($10,A4),D1` rewrites only the low byte of whatever the aim (or,
    // on the declined arm, `movem.w`'s sign-extended boss X) left behind, and
    // the two consumers are `move.b D1,($B,A0)` in the core and `andi.w #$FC`
    // here, which keeps bits 2..7. A labelled equivalence, not a simplification.
    let d1 = u8(ram.u8(a4 + 0x10) - 0x2d);             // $2A88CA / $2A88DE subi.w #$2D
    let d0 = ram.u32(a4 + 0x0c);                       // $2A88CE move.l ($C,A4),D0
    for (let k = 0; k < 7; k++) {                      // $2A88DC moveq #$6 / $2A892C dbra
      // $2A88D6 move.l #$D8000000,D6 -- the muzzle bias, added at $2A88F4.
      const d3 = vector(rom, d1, 0xd8000000);          // $2A88E8..$2A88F4
      shot(ram, rom, ctx, 0x2a8900,
        { d0, d1, d2, d3, d4: 0x02020020, d5: 0x0042, a5 });   // $2A88F6/$2A88FC
      const lo = u16(u16(d0) + 1);                     // $2A8906 addq.w #$1,D0
      const hi = u16((d0 >>> 16) - 2);                 // $2A8908 swap / subq.w #$2
      shot(ram, rom, ctx, 0x2a891c,
        { d0: ((hi << 16) | lo) >>> 0, d1: u8(d1 + 0x80), d2, d3,
          d4: 0x2c03ffe0, d5: 0x002e, a5 });           // $2A890E/$2A8914/$2A8918
      d0 = ((hi << 16) | u16(lo - 1)) >>> 0;           // $2A8922 addi.b / $2A8926 subq.w
      d1 = u8(d1 + 0x0f);                              // $2A8928 addi.w #$F,D1
    }

    // ---- $2A8930.  The bounce, and BOTH limits are SIGNED where gun 5's were
    // unsigned: `$2A8942 bgt.w` and `$2A8954 bge.w` against #$30 and #$D0.
    const step = ram.u8(a4 + 0x11);                    // $2A8930 move.b ($11,A4),D1
    const next = u8(ram.u8(a4 + 0x10) + step);         // $2A8938 / $2A894A add.b
    ram.setU8(a4 + 0x10, next);
    const bounce = (step & 0x80) !== 0                 // $2A8934 bmi.w $2A894A
      ? i8(next) < i8(0xd0)                            // $2A894E cmpi.b #$D0 / bge.w
      : i8(next) > 0x30;                               // $2A893C cmpi.b #$30 / bgt.w
    if (bounce) ram.setU8(a4 + 0x11, u8(-step));       // $2A8958 neg.b ($11,A4)
  }

  ram.setU8(a5 + 0x03, ram.u8(a5 + 0x03) ^ 1);         // $2A895C bchg #$0,($3,A5)
  const n = ram.u8(a4 + 0x04);                         // $2A8962 subq.b #$1,($4,A4)
  ram.setU8(a4 + 0x04, u8(n - 1));
  if (n !== 0) return;                                 // $2A8966 bcc.w $2A898A

  // **$2A896A 6100 FE94 IS A `bsr.w` BACK INTO THIS GUN'S OWN INIT** ($2A896C -
  // $16C = $2A8800), and it is on the RETIRE path.  Three instructions later
  // `$259B08` clears the slot, so every RAM field it rewrites is overwritten or
  // dead -- but the init makes TWO RNG draws ($242E24 and $242EC2), and those
  // bump the shared `$803917` counter every other subsystem reads.  That is the
  // observable half and it is why this call is transcribed rather than folded.
  gun8Init2A8800(ram, rom, a4, a6);                    // $2A896A bsr.w $2A8800
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));             // $2A896E -- dead, like $2A830C
  if (ram.u8(a6 + 0x1ee) < 0x28) {                     // $2A8974 cmpi.b #$28 / bcc.s
    ram.setU8(a6 + 0x1ee, u8(ram.u8(a6 + 0x1ee) + 0x14));     // $2A897C addi.b #$14
  }
  a1Stop259B08(ram, 8);                                // $2A8982 moveq #$8 / $2A8984 jsr
}

// ===========================================================================
// GUN 9 -- $2A89BA / $2A89F4.  W406.  HIBACHI's PHASE B gun, and the first one
// in the table whose step has NO FREEZE ARM.
// ===========================================================================
/**
 * `$2A89BA` -- SEVEN template words (`moveq #$6`), one hard-coded byte, ONE RNG
 * draw and two ramps.
 *
 * The template is `1080 4545 0300 0009 0007 0007 0001`, so `($8,A4)` is the
 * speed bias `$0009` and `($A,A4)` and `($C,A4)` are the two bullet KINDS, both
 * `$0007`.  `($E,A4)` is the word `$0001`, and **that one word covers two byte
 * fields** (TRAP 3): `$2A89CA move.b #$20,($E,A4)` overwrites the high half with
 * the sweep's starting offset `$20` and leaves `$01` in `($F,A4)` as its step.
 *
 * `$2A89D0 jsr $242EC2 / $2A89D6 bpl.w` is the SAME arm guns 5 and 8 have, and
 * W416 corrects what stood here: `bpl` reads N, and N is **bit 7 of the byte
 * `$242ED6 move.b` loaded**, so `$2A89DA neg.b ($F,A4)` runs on half the draws
 * and gun 9's sweep starts DOWN as often as it starts up.  Docket D48.
 *
 * **AND THERE IS NO `$242E24` DRAW.**  Gun 5 seeds `($10,A4)` from one and gun 8
 * seeds `($10,A4)` from one; gun 9's sweep start is the CONSTANT `$20`, so this
 * init makes exactly ONE draw where those two make two.  That difference is
 * observable in `$803917`, the shared draw counter.
 */
export function gun9Init2A89BA(ram, rom, a4, a6) {
  copyTemplate(ram, rom, a4, HIBACHI_A1.gun9Template, 7);   // $2A89BA..$2A89C8
  ram.setU8(a4 + 0x0e, 0x20);                          // $2A89CA move.b #$20,($E,A4)
  if (drawNegative242EC2(ram, rom)) {                  // $2A89D0 jsr / $2A89D6 bpl.w
    ram.setU8(a4 + 0x0f, u8(-ram.u8(a4 + 0x0f)));      // $2A89DA neg.b ($F,A4)
  }
  ram.setU16(a4 + 0x08, u16(ram.u16(a4 + 0x08)
    + ram.u16(a6 + 0x1f8)));                           // $2A89DE/$2A89E2 add.w D0,($8,A4)
  const d0b = ram.u8(a6 + 0x1f6);                      // $2A89E6 move.b ($1F6,A6),D0
  ram.setU8(a4 + 0x04, u8(ram.u8(a4 + 0x04) + d0b));   // $2A89EA add.b D0,($4,A4)
  ram.setU8(a4 + 0x05, u8(ram.u8(a4 + 0x05) + d0b));   // $2A89EE add.b D0,($5,A4)
}

/**
 * `$2A89F4` -- sixteen shots a volley, in one of TWO MIRRORED arms, off a sweep
 * that is an OFFSET FROM THE AIM rather than an absolute heading.
 *
 * **THE STEP HAS NO `tst.w $8130D4`.**  `$2A89F4` is `subq.b #$1,($2,A4) / bcs.s
 * / rts` and nothing else: where guns 5, 6, 7 and 8 open with the freeze test
 * that branches BACKWARD into their own init, this one has no freeze arm at all.
 * `4A79 008130D4` stands at TEN of the fourteen step entries in `$2A72C8` and
 * at neither `$2A89F4`, `$2A8BC0` nor `$2A90E0`.  The consequence is real: while
 * `$8130D4` is set gun 9 keeps counting volleys down and keeps stepping its
 * sweep, and it is the SPAWN CORE's own gate (`$2814BA` adds `$8130D4` in) that
 * throws the shots away.  A frozen gun 5 re-seeds and restarts; a frozen gun 9
 * burns its whole magazine and retires.
 *
 * **THE TWO ARMS ARE A MIRROR PAIR AND THEY USE DIFFERENT KIND FIELDS.**
 * `$2A8A3E btst #$0,($4,A4)` picks by the volley counter's low bit, exactly as
 * gun 5's does.  Odd volleys `add.b ($E,A4),D1` and take the kind from
 * `($C,A4)`; even volleys restore the untouched aim from D5, `sub.b ($E,A4),D1`
 * and take the kind from `($A,A4)`.  In the shipped template both kind words are
 * `$0007`, so the two arms are indistinguishable by kind on the cartridge -- a
 * LABELLED EQUIVALENCE, and the test asserts the ROM words rather than the port.
 *
 * **D3 IS A CONSTANT, NOT A `$26BFFC` LOOKUP.**  `$2A8A5E move.l #$FA000000,D3`
 * in both arms, so every one of gun 9's bullets is spawned `$0600` ABOVE the
 * boss's own Y (`$28159C tst.l D3 / add.w`, high word onto axis A) and at zero
 * horizontal offset.  Guns 5 and 8 index the 64-longword vector table for this;
 * gun 9 does not, and declares no window for one.
 *
 * **`$2A8A2C move.w D2,D6 / $2A8A2E move.w D3,D7` ARE DEAD STORES** (TRAP 22).
 * Both arms reload D6 with `#$5` and D7 with `#$F` before the volley loop and
 * nothing between reads either, so the target coordinates they save are never
 * used.  Gun 6 has the same pair at `$2A83D8`; transcribed by omission, with
 * this note, because nothing observes a register.
 */
export function gun9Step2A89F4(ram, rom, ctx, a4, a5, a6) {
  // $2A89F4 subq.b #$1,($2,A4) / $2A89F8 bcs.s $2A89FC / $2A89FA rts.  NO FREEZE
  // TEST -- see the header.  `gunTick` is deliberately NOT called here, and the
  // mutation below is "gun 9 has its siblings' freeze head after all".
  if (mut('gun9-freeze-arm') && ram.u16(HIBACHI_A1.freeze) !== 0) {
    gun9Init2A89BA(ram, rom, a4, a6);
    return;
  }
  const t = ram.u8(a4 + 0x02);
  ram.setU8(a4 + 0x02, u8(t - 1));
  if (t !== 0) return;                                 // the BORROW is the body

  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x06));             // $2A89FC move.b ($6,A4),($2,A4)
  const tgt = pickTarget(ram, a5);                     // $2A8A02..$2A8A24
  if (tgt !== null) {                                  // $2A8A20 bpl.w $2A8ADE
    // $2A8A26 movem.w ($2,A0),D2-D3 / $2A8A30 movem.w ($2,A6),D0-D1
    const ty = ram.u16(tgt + 0x02), tx = ram.u16(tgt + 0x04);
    const aim = aim256(aimTables(rom),                 // $2A8A36 jsr $2422A2
      ram.u16(a6 + 0x02), ram.u16(a6 + 0x04), ty, tx);
    const d5 = u16(aim);                               // $2A8A3C move.w D1,D5
    const odd = (ram.u8(a4 + 0x04) & 1) !== 0;         // $2A8A3E btst #$0,($4,A4)
    const sweep = ram.u8(a4 + 0x0e);
    // $2A8A48 add.b ($E,A4),D1  /  $2A8A7E move.w D5,D1 + $2A8A80 sub.b ($E,A4),D1.
    // BYTE arithmetic on a WORD register: no carry crosses into bits 8..15, and
    // `$2A8A4C subi.w #$23,D1` that follows is a WORD subtract on the result.
    // Only bits 0..7 ever leave, through the core's `move.b D1,($B,A0)`.
    let d1 = u16((d5 & 0xff00) | u8(odd ? d5 + sweep : d5 - sweep));
    d1 = u16(d1 - 0x23);                               // $2A8A4C / $2A8A84 subi.w #$23,D1
    // $2A8A50 move.w ($8,A4),D0 / swap D0 / move.w ($C,A4)|($A,A4),D0 -- the
    // {bias, kind} longword built by hand, where gun 5 loads it with one move.l.
    const kind = ram.u16(a4 + (odd ? 0x0c : 0x0a));    // $2A8A56 / $2A8A8E
    const d0 = (((ram.u16(a4 + 0x08) << 16) >>> 0) | kind) >>> 0;
    const d2 = ram.u32(a6 + 0x02);                     // $2A8A5A / $2A8A92 move.l ($2,A6),D2
    const d3 = 0xfa000000;                             // $2A8A5E / $2A8A96 move.l #$FA000000,D3
    const site = odd ? 0x2a8a6e : 0x2a8aa6;
    for (let k = 0; k < 16; k++) {                     // $2A8A6A moveq #$F + dbra: SIXTEEN
      shot(ram, rom, ctx, site, { d0, d1, d2, d3, d4: 0, d5, a5 });   // $2A8A64 moveq #$0,D4
      d1 = u16((d1 & 0xff00) | u8(d1 + 5));            // $2A8A74 add.b D6,D1 with D6 = #$5
    }

    // ---- $2A8AB2.  THE BOUNCE, and both limits are SIGNED and symmetric:
    // `$2A8ABE cmpi.b #$20 / bgt.w` reverses above +$20 and `$2A8AD0 cmpi.b #$E0
    // / bge.w` -- which SKIPS the negate -- reverses below -$20.  `$6C` is BGE,
    // not BCC: gun 5's band is unsigned and this one is not.
    const step = ram.u8(a4 + 0x0f);                    // $2A8AB2 move.b ($F,A4),D1
    const next = u8(sweep + step);                     // $2A8ABA / $2A8ACC add.b D1,($E,A4)
    ram.setU8(a4 + 0x0e, next);
    const bounce = (step & 0x80) !== 0                 // $2A8AB6 bmi.w $2A8ACC
      ? i8(next) < i8(0xe0)                            // $2A8AD0 cmpi.b #$E0 / bge.w skips
      : i8(next) > 0x20;                               // $2A8ABE cmpi.b #$20 / bgt.w negates
    if (bounce) ram.setU8(a4 + 0x0f, u8(-step));       // $2A8ADA neg.b ($F,A4)
  }

  ram.setU8(a5 + 0x03, ram.u8(a5 + 0x03) ^ 1);         // $2A8ADE bchg #$0,($3,A5)
  const n = ram.u8(a4 + 0x04);                         // $2A8AE4 subq.b #$1,($4,A4)
  ram.setU8(a4 + 0x04, u8(n - 1));
  if (n !== 0) return;                                 // $2A8AE8 bcc.w $2A8B0E

  // $2A8AEC.  TWO ramps and no dead store: gun 9 is the only one of the five
  // that does NOT reload ($2,A4) from ($3,A4) on the way out, and the only one
  // whose WORD ramp is tested UNSIGNED (`$2A8B00 64` bcc.s, where gun 5's
  // $2A832C is `6C` bge.s).
  if (ram.u8(a6 + 0x1f6) < 0x1e) {                     // $2A8AEC cmpi.b #$1E / bcc.s
    ram.setU8(a6 + 0x1f6, u8(ram.u8(a6 + 0x1f6) + 0x14));      // $2A8AF4 addi.b #$14
  }
  if (ram.u16(a6 + 0x1f8) < 2) {                       // $2A8AFA cmpi.w #$2 / bcc.s -- UNSIGNED
    ram.setU16(a6 + 0x1f8, u16(ram.u16(a6 + 0x1f8) + 1));      // $2A8B02 addq.w #$1
  }
  a1Stop259B08(ram, 9);                                // $2A8B06 moveq #$9 / $2A8B08 jsr
}

// ===========================================================================
// GUN $A -- $2A8B7C / $2A8BC0.  W408.  A TWELVE-SHOT RING that does not aim at
// all, fires TRACKING bullets, and writes the global those bullets read.
// ===========================================================================
//
// `$242486` and `$242438` -- the two library routines gun `$A` is the first
// ported caller of.  Both are read out of the image here rather than cited:
//
//   $242486  move.w #$7FFF,D0 / tst.w (A0) / bpl.s $2424B6   -- a DEAD player is
//            $7FFF, not zero, which is the whole reason $242438's `min` works
//            $24248E movem.w ($2,A0),D2-D3 / $242494 movem.w ($2,A6),D0-D1
//            and then FALLS INTO $24249A, `dist242494`'s own body
//   $242438  lea $8103E6,A0 / bsr.s $242486 / move.w D0,-(A7)
//            lea $810448,A0 / bsr.s $242486 / move.w (A7)+,D1
//            cmp.w D0,D1 / bcc.s / move.w D1,D0             -- D0 := the MIN
//
// The alive bit is the same one `$24270A` reads (`tst.w (A0)`, bit 15), so a
// bench that leaves both player words at `$0000` gets `$7FFF` twice and gun
// `$A` reports "far" -- which is a real state, not a bench artefact.

/** `$242486` -- the octagonal distance to ONE player record, or `$7FFF` when
 *  that record's alive bit is clear.  `bpl`, so "alive" is bit 15 SET. */
function distOnePlayer242486(ram, a6, rec) {
  if ((ram.u16(rec) & 0x8000) === 0) return 0x7fff;    // $24248A tst.w (A0) / $24248C bpl.s
  return dist242494(ram.u16(a6 + 0x02), ram.u16(a6 + 0x04),      // $242494 movem.w ($2,A6)
    ram.u16(rec + 0x02), ram.u16(rec + 0x04));                   // $24248E movem.w ($2,A0)
}

/** `$242438` -- the SMALLER of the two players' distances, compared UNSIGNED
 *  (`$24244E 6402` is `bcc.s`, not `bge.s`).  P1 is measured first and pushed;
 *  P2 replaces it only when P2 is strictly nearer. */
function distMinBoth242438(ram, a6) {
  const p1 = distOnePlayer242486(ram, a6, HIBACHI_A1.selP1);      // $242438 lea $8103E6 / bsr
  const p2 = distOnePlayer242486(ram, a6, HIBACHI_A1.selP2);      // $242442 lea $810448 / bsr
  return p1 < p2 ? p1 : p2;                            // $24244C cmp.w D0,D1 / bcc.s / move.w
}

/**
 * `$2A8B7C` -- EIGHT template words (`moveq #$7`), three A6 ramps, ONE RNG draw
 * that is LIVE, and a `neg.b` that alternates the ring's spin between runs.
 *
 * The template is `1080 7777 0600 0005 001C 0003 0016 0200`:
 *
 *   ($2,A4)=$10 countdown   ($3,A4)=$80 unread          [$1080]
 *   ($4,A4)=$77 volleys     ($5,A4)=$77 its reload      [$7777]
 *   ($6,A4)=$06 volley gap  ($7,A4)=$00 unread          [$0600]
 *   ($8,A4)=$0005 speed bias   ($A,A4)=$001C bullet KIND 28
 *   ($C,A4)=$0003 / ($E,A4)=$0016   the D4 longword $00030016
 *   ($10,A4)=$02 spin       ($11,A4)=$00 heading        [$0200]  -- TRAP 3
 *
 * **THE `$242EC2` DRAW IS STORED HERE AND TESTED IN GUNS 5, 8 AND 9.**  W416
 * corrects what stood here: it said the other three test "a sign bit the routine
 * can never set".  They test N after `$242ED6 move.b`, which is bit 7 of the table
 * byte and is set on half the draws; gun `$A` instead does `$2A8BA8 jsr $242EC2 /
 * $2A8BAE move.b D0,($11,A4)` and
 * STORES the byte.  So the ring's starting heading is a real random 0..255 and
 * every run of gun `$A` points somewhere else.
 *
 * **`$2A8BB2 tst.b ($1F0,A6) / $2A8BB6 bne.w $2A8BBE / $2A8BBA neg.b ($10,A4)`
 * IS AN ALTERNATOR, NOT A DIFFICULTY RAMP.**  `($1F0,A6)` is toggled by the
 * step's own `$2A8C3C not.b` on the way out, so it is `$00` on the first run,
 * `$FF` on the second and so on: the ring spins `-2` per volley on runs 1, 3,
 * 5..., and `+2` on runs 2, 4, 6...  It is the only A6 byte in this file that
 * is written with `not.b` rather than added to.
 *
 * The three genuine ramps are byte `($1F1,A6)` into BOTH `($4,A4)` and
 * `($5,A4)`, word `($1F2,A6)` into the speed bias and word `($1F4,A6)` into the
 * HIGH half of the D4 longword.  `($1F0,A6)` and `($1F1,A6)` are the two bytes
 * of ONE word (TRAP 3 again), and the step touches them with two different
 * instructions.
 */
export function gunAInit2A8B7C(ram, rom, a4, a6) {
  copyTemplate(ram, rom, a4, HIBACHI_A1.gunATemplate, 8);   // $2A8B7C..$2A8B8A
  const d0b = ram.u8(a6 + 0x1f1);                      // $2A8B8C move.b ($1F1,A6),D0
  ram.setU8(a4 + 0x04, u8(ram.u8(a4 + 0x04) + d0b));   // $2A8B90 add.b D0,($4,A4)
  ram.setU8(a4 + 0x05, u8(ram.u8(a4 + 0x05) + d0b));   // $2A8B94 add.b D0,($5,A4)
  ram.setU16(a4 + 0x08, u16(ram.u16(a4 + 0x08)
    + ram.u16(a6 + 0x1f2)));                           // $2A8B98/$2A8B9C add.w D0,($8,A4)
  ram.setU16(a4 + 0x0c, u16(ram.u16(a4 + 0x0c)
    + ram.u16(a6 + 0x1f4)));                           // $2A8BA0/$2A8BA4 add.w D0,($C,A4)
  // $2A8BA8 jsr $242EC2 / $2A8BAE move.b D0,($11,A4) -- STORED, not tested.
  ram.setU8(a4 + 0x11, u8(drawWord242EC2(ram, rom)));
  if (ram.u8(a6 + 0x1f0) === 0) {                      // $2A8BB2 tst.b / $2A8BB6 bne.w $2A8BBE
    ram.setU8(a4 + 0x10, u8(-ram.u8(a4 + 0x10)));      // $2A8BBA neg.b ($10,A4)
  }
}

/**
 * `$2A8BC0` -- twelve shots a volley round the whole circle, `$77` volleys, and
 * a heading that creeps `+-2` between them.
 *
 * **IT HAS NO FREEZE TEST AND NO TARGET SELECT AND NO AIM.**  `$2A8BC0` opens
 * `4279 008130DC`, `clr.w $8130DC` -- a DIFFERENT word from the freeze word
 * `$8130D4`, and W406 already read it that way.  Nothing in gun `$A`'s `$F4`
 * bytes calls `$24270A` or `$2422A2`, and nothing in them is a `bchg
 * #$0,($3,A5)`: it is the only gun of the seven this file runs that neither
 * chooses a player nor toggles the choice.  It fires the same ring whether both
 * players are alive or both are dead.
 *
 * **WHAT IT DOES WITH THE PLAYERS IS MEASURE THEM.**  `$2A8BC6 jsr $242438 /
 * cmpi.w #$2000,D0 / bcc.w` sets `$8130DC` to 1 when the nearer player is
 * inside `$2000` and to 0 otherwise, and both of those writes sit ABOVE the
 * countdown, so they happen on EVERY frame the gun exists and not only on the
 * frames it fires.
 *
 * **AND THAT GLOBAL IS READ BY GUN `$A`'S OWN BULLETS.**  `($A,A4)` is `$001C`,
 * kind 28 -- `$2815C6[28]` is `$281930`, the spawn-init that copies `($3,A5)`
 * into the bullet's `($1A,A0)` -- and kind 28's mover `$283290` counts `$14`
 * frames and then runs `$2832A0 jsr $242748` (re-aim on that copied index)
 * followed by `$2832B0 tst.w $8130DC / bne`, taking `dir + $B0` only when the
 * word is ZERO.  So the gun writes the flag its own bullets consult twenty
 * frames later.  `src/mover.js` throws by address at that split, because
 * `$242748`'s subsystem is unported; nothing in this file invents it.
 *
 * **THE RING IS TWELVE SHOTS `$15` APART, WHICH IS `$FC` -- NOT `$100`.**
 * `$2A8C0A moveq #$B` + `dbra` is TWELVE (TRAP 2) and `$2A8C06 move.b #$15,D6`
 * is the step, so the ring closes four units short of a full circle and leaves a
 * seam.  The seam is where the next volley's `+-2` creep puts it.
 *
 * **D4 IS A REAL PARAMETER HERE, WHERE EVERY OTHER GUN IN THIS FILE PASSES
 * ZERO.**  `$2A8BFC move.l ($C,A4),D4` is the longword `$00030016` (ramped in
 * the high half by `($1F4,A6)`), and `$281930` stores it at the bullet's
 * `($1C,A0)` -- which is the longword `$2832C2` loads as D0 when the bullet
 * splits.  Passing D4 as 0 here would be an invention, not a simplification.
 *
 * **D1's BITS 8..15 ARE INHERITED AND UNOBSERVABLE.**  `$2A8BF0 move.b
 * ($11,A4),D1` writes only the low byte of a register `$2A8BC6 jsr $242438` has
 * just left a distance in, and `$2A8C20 add.b D6,D1` keeps the arithmetic in the
 * byte.  Both consumers mask it away: `$2A8C10 andi.w #$FC,D3` keeps bits 2..7
 * for the vector index and `$28158E move.b D1,($B,A0)` keeps bits 0..7 for the
 * direction.  A labelled equivalence, the same one gun 9 carries -- and a strong
 * one: writing the byte add as a WORD add would be the same routine, since
 * `andi.w #$FC` clears bit 8 and `((x & $FF) + 2) & $FC` equals `(x + 2) & $FC`
 * for every x.  The port keeps the ROM's `add.b` anyway.
 */
export function gunAStep2A8BC0(ram, rom, ctx, a4, a5, a6) {
  // ---- $2A8BC0..$2A8BDA.  THE PROXIMITY GLOBAL, above the countdown.
  ram.setU16(HIBACHI_A1.proximity, 0);                 // $2A8BC0 clr.w $8130DC
  if (distMinBoth242438(ram, a6) < HIBACHI_A1.proximityRange) {   // $2A8BC6/$2A8BCC/$2A8BD0
    ram.setU16(HIBACHI_A1.proximity, 1);               // $2A8BD4 move.w #$1,$8130DC
  }
  const t = ram.u8(a4 + 0x02);                         // $2A8BDC subq.b #$1,($2,A4)
  ram.setU8(a4 + 0x02, u8(t - 1));
  if (t !== 0) return;                                 // $2A8BE0 bcs.s -- the BORROW

  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x06));             // $2A8BE4 move.b ($6,A4),($2,A4)
  // $2A8BEA lea $26BFFC,A1 -- the SAME 64-longword vector table guns 5 and 8 walk.
  let d1 = ram.u8(a4 + 0x11);                          // $2A8BF0 move.b ($11,A4),D1
  const d0 = ram.u32(a4 + 0x08);                       // $2A8BF4 move.l ($8,A4),D0
  const d2 = ram.u32(a6 + 0x02);                       // $2A8BF8 move.l ($2,A6),D2
  const d4 = ram.u32(a4 + 0x0c);                       // $2A8BFC move.l ($C,A4),D4
  const d5 = 0xfa000000;                               // $2A8C00 move.l #$FA000000,D5
  for (let k = 0; k < 12; k++) {                       // $2A8C0A moveq #$B + dbra: TWELVE
    // $2A8C0C..$2A8C18 -- the five-instruction vector lookup, D5 as the bias.
    shot(ram, rom, ctx, 0x2a8c1a,
      { d0, d1, d2, d3: vector(rom, d1, d5), d4, d5, a5 });
    d1 = u8(d1 + 0x15);                                // $2A8C20 add.b D6,D1 with D6 = #$15
  }

  // $2A8C26/$2A8C2A -- the ring CREEPS by ($10,A4), a BYTE add, so the heading
  // wraps through 0 and the seam walks round the circle.
  ram.setU8(a4 + 0x11, u8(ram.u8(a4 + 0x11) + ram.u8(a4 + 0x10)));
  const n = ram.u8(a4 + 0x04);                         // $2A8C2E subq.b #$1,($4,A4)
  ram.setU8(a4 + 0x04, u8(n - 1));
  if (n !== 0) return;                                 // $2A8C32 bcc.w $2A8C6E

  // ---- $2A8C36.  THE RETIRE TAIL.  It reloads ($4,A4) from ($5,A4) and then
  // retires anyway -- so the reload only matters to the NEXT run, which starts
  // by copying the template over it.  Gun 6's tail does the same thing.
  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));             // $2A8C36 move.b ($5,A4),($4,A4)
  ram.setU8(a6 + 0x1f0, u8(~ram.u8(a6 + 0x1f0)));      // $2A8C3C not.b ($1F0,A6) -- the SPIN
  if (ram.u8(a6 + 0x1f1) < 0x95) {                     // $2A8C40 cmpi.b #$95 / bcc.s -- UNSIGNED
    ram.setU8(a6 + 0x1f1, u8(ram.u8(a6 + 0x1f1) + 0x0a));      // $2A8C48 addi.b #$A
  }
  if (ram.u16(a6 + 0x1f2) < 2) {                       // $2A8C4E cmpi.w #$2 / bcc.s
    ram.setU16(a6 + 0x1f2, u16(ram.u16(a6 + 0x1f2) + 1));      // $2A8C56 addq.w #$1
  }
  if (ram.u16(a6 + 0x1f4) < 3) {                       // $2A8C5A cmpi.w #$3 / bcc.s
    ram.setU16(a6 + 0x1f4, u16(ram.u16(a6 + 0x1f4) + 1));      // $2A8C62 addq.w #$1
  }
  a1Stop259B08(ram, 0x0a);                             // $2A8C66 moveq #$A / $2A8C68 jsr
}

// ===========================================================================
// GUN $B -- $2A8C9A / $2A8CB2.  W407.  EIGHTEEN shots a volley in two mirrored
// arms, off a base heading that is a CONSTANT and an aim that is thrown away.
// ===========================================================================
/**
 * `$2A8C9A` -- FIVE template words (`moveq #$4`) and ONE store.  **No A6 ramp at
 * all**, which makes it the only init of the six this file ports that never
 * touches the boss record: guns 5, 6, 7, 8 and 9 each read two or three
 * `($1DA,A6)`-family bytes and add them into their slot, and gun `$B` reads
 * none.  It therefore fires exactly the same pattern on every pass of phase B's
 * loop, where every phase-A gun gets harder each time it runs.
 *
 * The template is `1080 B3B3 0100 0013 0003`:
 *
 *   ($2,A4)=$10 countdown   ($3,A4)=$80 unread          [$1080]
 *   ($4,A4)=$B3 volleys     ($5,A4)=$B3 the SAME value  [$B3B3]  -- see the step
 *   ($6,A4)=$01 volley gap  ($7,A4)=$00 the heading     [$0100]
 *   ($8,A4)=$0013 speed bias   ($A,A4)=$0003 bullet kind
 *
 * and `$2A8CAA move.w #$404,($C,A4)` is TRAP 3 once more: ONE word literal over
 * TWO byte fields, `($C,A4)` = 4 the group counter and `($D,A4)` = 4 its reload.
 */
export function gunBInit2A8C9A(ram, rom, a4) {
  copyTemplate(ram, rom, a4, HIBACHI_A1.gunBTemplate, 5);   // $2A8C9A..$2A8CA8
  ram.setU16(a4 + 0x0c, 0x0404);                       // $2A8CAA move.w #$404,($C,A4)
}

/** `$2A8E84` -- gun `$B`'s retire tail, and the target of BOTH its `bcc.w`
 *  fall-through and its FREEZE arm.  Three instructions, in the ROM's order. */
function gunBRetire2A8E84(ram, a5) {
  ram.setU8(a5 + 0x03, ram.u8(a5 + 0x03) ^ 1);         // $2A8E84 bchg #$0,($3,A5)
  a1Stop259B08(ram, 0x0b);                             // $2A8E8A moveq #$B / $2A8E8C jsr
}

/**
 * `$2A8CB2` -- eighteen shots a volley, nine each side of a heading that never
 * moves, and $B4 volleys two frames apart.
 *
 * **THE FREEZE ARM RETIRES THE GUN.**  `$2A8CB2 tst.w $8130D4 / $2A8CB8 6600
 * 01CA` is `bne.w $2A8E84` -- FORWARD, on to the `bchg` + `moveq #$B / jsr
 * $259B08` that ends a normal run.  Guns 0..8 branch BACKWARD into their own
 * init and re-seed; guns 9, $A and $D have no test at all and keep firing into
 * the spawn core's own gate.  Gun `$B` does a third thing: it stops.  See
 * `gunTick`'s header, which W406 had grouping it with guns 0..8.
 *
 * **THE AIM IS COMPUTED AND THROWN AWAY, AND ONLY ON THE FIRST VOLLEY.**
 * `$2A8CCA move.b ($4,A4),D2 / cmp.b ($5,A4),D2 / $2A8CD2 bne.w $2A8D18` skips
 * the whole target-select-and-aim block whenever the volley counter has moved
 * off its reload -- and nothing in this gun ever writes `($5,A4)`, so the block
 * runs on volley ONE and never again.  Inside it, `$2A8D0A jsr $2422A2` aims at
 * the chosen player and `$2A8D10 323C 0080` is `move.w #$80,D1`, which
 * OVERWRITES the answer before `$2A8D14 move.b D1,($7,A4)` stores it.  So every
 * bullet gun `$B` ever fires is measured from the constant `$80`, the aim is a
 * dead computation (TRAP 22, transcribed as a call whose result is voided), and
 * the template's own `($7,A4)` = `$00` is never used either.
 *
 * What the block IS observable for is the "both players dead" arm: `$2A8CF6
 * 6A00 0174` is `bpl.w $2A8E6A`, which skips all eighteen shots.  On volley one
 * only -- from volley two on this gun fires at an empty screen.
 *
 * **THE TWO ARMS ARE A MIRROR PAIR AROUND `($7,A4)`, OPENING AS THE COUNTER
 * FALLS.**  `$2A8D1E move.b #$B7,D6 / sub.b ($4,A4),D6` makes `$B7 - n`, arm A
 * adds it and arm B `$2A8DCC neg.b D6` subtracts it, so the pair starts $4 apart
 * at n = $B3 and walks out to $B7 apart at n = 0.  Inside each arm nine shots
 * step by `-$16` (arm A) and by `-$FFEA` = `+$16` (arm B): `sub.b D6,D1` with
 * the ROM's own two constants, which is why both are written as a subtract.
 *
 * **THE KIND WALKS UP, DOWN AND UP AGAIN; THE BIAS ONLY UP.**  Between shots the
 * ROM runs `addq.w #$1,D0` three times, `subq.w #$1,D0` three times and
 * `addq.w #$1,D0` twice -- eight WORD steps on the kind -- while every one of
 * the eight is followed by `addi.l #$30000,D0`, a LONG add on the bias half.  So
 * the nine bullets of an arm come out at kinds 3,4,5,6,5,4,3,4,5 and at biases
 * $13,$16,$19,$1C,$1F,$22,$25,$28,$2B, and arm B reloads `($8,A4)` and repeats
 * the same nine.
 *
 * **D5 REACHES NOTHING.**  Gun `$B` never writes D5, and all four kinds it fires
 * (3..6) take `$2818B4`, the spawn-init that stores D3 and D4 and not D5.  It is
 * passed as zero and that is a labelled equivalence, not an invention.
 *
 * **AND NEITHER DOES THE CHOICE OF PLAYER.**  `$2A8CE2 tst.b ($3,A5)` really does
 * pick which record the `movem.w` reads, and those coordinates really do reach
 * `$2422A2` -- and `$2A8D10` throws the answer away, so the only thing the block
 * decides is the "both dead" branch, which `$24270A` reaches by testing BOTH
 * records whichever way round they are.  So `($3,A5)` is unobservable in gun
 * `$B` alone.  The port reads it because the cartridge does; the test proves the
 * equivalence rather than asserting a difference that does not exist.
 */
export function gunBStep2A8CB2(ram, rom, ctx, a4, a5, a6) {
  if (ram.u16(HIBACHI_A1.freeze) !== 0) {              // $2A8CB2 tst.w $8130D4
    if (!mut('gunb-freeze-reseeds')) {                 // $2A8CB8 bne.w $2A8E84
      gunBRetire2A8E84(ram, a5);
    } else {
      gunBInit2A8C9A(ram, rom, a4);
    }
    return;
  }
  const t = ram.u8(a4 + 0x02);                         // $2A8CBC subq.b #$1,($2,A4)
  ram.setU8(a4 + 0x02, u8(t - 1));
  if (t !== 0) return;                                 // $2A8CC0 bcs.s -- the BORROW

  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x06));             // $2A8CC4 move.b ($6,A4),($2,A4)
  let skip = false;
  // $2A8CCA/$2A8CCE/$2A8CD2 -- an EQUALITY test between two BYTE fields, not a
  // flag: the block below runs only while ($4,A4) still equals ($5,A4).
  if (ram.u8(a4 + 0x04) === ram.u8(a4 + 0x05)) {
    const tgt = pickTarget(ram, a5);                   // $2A8CD6..$2A8CF8
    if (tgt === null) {
      skip = true;                                     // $2A8CF6 bpl.w $2A8E6A
    } else {
      // $2A8CFA movem.w ($2,A0),D2-D3 / $2A8D00 movem.w ($2,A6),D0-D1 /
      // $2A8D06 addi.w #$FA00,D0 -- the muzzle is $600 ABOVE the boss's own Y,
      // the same offset `$2A8D34 move.l #$FA000000,D3` hands the spawn core.
      const dead = aim256(aimTables(rom),              // $2A8D0A jsr $2422A2
        u16(ram.u16(a6 + 0x02) + 0xfa00), ram.u16(a6 + 0x04),
        ram.u16(tgt + 0x02), ram.u16(tgt + 0x04));
      // $2A8D10 move.w #$80,D1 -- and THERE the aim goes. See the header. The
      // mutation is "the ROM meant to keep it", which is the reading a reader
      // who skipped that one word would have.
      ram.setU8(a4 + 0x07, mut('gunb-keeps-aim') ? u8(dead) : 0x80);   // $2A8D14
    }
  }

  if (!skip) {
    const d7 = ram.u8(a4 + 0x07);                      // $2A8D18 / $2A8D1C move.w D1,D7
    const spread = u8(0xb7 - ram.u8(a4 + 0x04));       // $2A8D1E/$2A8D22 move.b #$B7 / sub.b
    const d2 = ram.u32(a6 + 0x02);                     // $2A8D30 / $2A8DD8 move.l ($2,A6),D2
    const d3 = 0xfa000000;                             // $2A8D34 / $2A8DDC move.l #$FA000000,D3
    // ARM A: $B7 - n ADDED, and the nine shots step by -$16.
    arm(ram, rom, ctx, a4, a5, u8(d7 + spread), 0x0016, d2, d3, ARM_A_SITES);
    // ARM B: $2A8DC2 move.w D7,D1 restores the untouched heading, $2A8DCC
    // neg.b D6 flips the spread, and the step constant is $FFEA, not $16.
    arm(ram, rom, ctx, a4, a5, u8(d7 - spread), 0xffea, d2, d3, ARM_B_SITES);
  }

  // ---- $2A8E6A.  The GROUP counter: every fourth volley the gap is $4 frames
  // rather than the `($6,A4)` = 1 the body already wrote at $2A8CC4.
  const g = u8(ram.u8(a4 + 0x0c) - 1);                 // $2A8E6A subq.b #$1,($C,A4)
  ram.setU8(a4 + 0x0c, g);
  if (g === 0) {                                       // $2A8E6E bne.s $2A8E7C
    ram.setU8(a4 + 0x0c, ram.u8(a4 + 0x0d));           // $2A8E70 move.b ($D,A4),($C,A4)
    ram.setU8(a4 + 0x02, 0x04);                        // $2A8E76 move.b #$4,($2,A4)
  }
  const n = ram.u8(a4 + 0x04);                         // $2A8E7C subq.b #$1,($4,A4)
  ram.setU8(a4 + 0x04, u8(n - 1));
  if (n !== 0) return;                                 // $2A8E80 bcc.w $2A8E92
  gunBRetire2A8E84(ram, a5);                           // $2A8E84 -- and NO A6 ramp on the way out
}

/** The nine `jsr $2817C2` sites of each arm, read out of the image. */
const ARM_A_SITES = Object.freeze([0x2a8d3c, 0x2a8d4c, 0x2a8d5c, 0x2a8d6c, 0x2a8d7c,
  0x2a8d8c, 0x2a8d9c, 0x2a8dac, 0x2a8dbc]);
const ARM_B_SITES = Object.freeze([0x2a8de4, 0x2a8df4, 0x2a8e04, 0x2a8e14, 0x2a8e24,
  0x2a8e34, 0x2a8e44, 0x2a8e54, 0x2a8e64]);
/** `5240 5240 5240 5340 5340 5340 5240 5240` -- the eight `addq.w`/`subq.w` the
 *  ROM runs between the nine shots, on D0's LOW word, i.e. on the KIND. */
const GUNB_KIND_STEP = Object.freeze([1, 1, 1, -1, -1, -1, 1, 1]);

/** One of gun `$B`'s two nine-shot arms.  Both are written out instruction for
 *  instruction in the ROM (`$2A8D2C..$2A8DC0` and `$2A8DD4..$2A8E68`) and are
 *  the same five-instruction group nine times, so the port loops -- the two
 *  differ only in the heading they start from and the sign of their step, which
 *  are this function's two parameters. */
function arm(ram, rom, ctx, a4, a5, start, d6, d2, d3, sites) {
  let d1 = start;
  let d0 = ram.u32(a4 + 0x08);                         // $2A8D2C / $2A8DD4 move.l ($8,A4),D0
  for (let k = 0; k < 9; k++) {
    shot(ram, rom, ctx, sites[k], { d0, d1, d2, d3, d4: 0, d5: 0, a5 });   // $2A8D3A moveq #$0,D4
    if (k === 8) break;
    d0 = (((d0 & 0xffff0000) >>> 0) | u16(d0 + GUNB_KIND_STEP[k])) >>> 0;   // addq.w / subq.w
    d0 = (d0 + 0x00030000) >>> 0;                      // addi.l #$30000,D0 -- a LONG add, and
    //   provably the same as a word add on the high half: $30000 cannot touch the low word and
    //   a carry out of bit 31 is discarded either way. Labelled, not simplified.
    d1 = u8(d1 - d6);                                  // sub.b D6,D1
  }
}

// ===========================================================================
// THE A4 DRIVERS -- $2A689C, $2A68D4, $2A6930, $2A6970, $2A6A30, $2A6AB6,
// $2A6A76
// ===========================================================================
//
// All SEVEN are the same six-part shape and only the constants move:
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

/**
 * `$2A6970` / `$2A698A` -- delay $60, gun 8, then a SECOND $40-frame counter and
 * A4 $A again.  This is the link that closes the attack loop.
 *
 * It is the only one of the four with TWO counters.  `($2,A4)` is the ordinary
 * pre-roll and `($4,A4)` is spent AFTER the gun retires, at `$2A69B6 subq.w
 * #$1,($4,A4) / bne`, which sits BELOW the `bcs` that returns while the gun
 * still runs -- so the $40 is a cooldown between gun 8 finishing and the cycle
 * restarting, not part of the wait.
 *
 * It also drives HIBACHI's own animation byte `($1A,A5)` twice, `$C` when the
 * script starts and `$4` on the frame the gun does, and arms the main sequencer
 * on both ends: `#$7` in the init and `#$2` as it retires.
 */
export function a4D2A6970(ram, a4, a5, init) {
  if (init) {
    ram.setU16(a4 + 0x02, 0x0060);                     // $2A6970 move.w #$60,($2,A4)
    ram.setU16(a4 + 0x04, 0x0040);                     // $2A6976 move.w #$40,($4,A4)
    seqStart2598D0(ram, 7);                            // $2A697C/$2A697E
    ram.setU8(a5 + 0x1a, 0x0c);                        // $2A6984 move.b #$C,($1A,A5)
  }
  if (ram.u16(a4 + 0x02) !== 0) {                      // $2A698A tst.w / beq.s $2A69AC
    if (ram.u16(HIBACHI_A1.freeze) !== 0) return;      // $2A6990 / bne.s $2A69CE
    ram.setU16(a4 + 0x02, u16(ram.u16(a4 + 0x02) - 1));       // $2A6998 subq.w #$1
    if (ram.u16(a4 + 0x02) !== 0) return;              // $2A699C bne.s $2A69CE
    a1Start259A18(ram, 8);                             // $2A699E/$2A69A0
    ram.setU8(a5 + 0x1a, 0x04);                        // $2A69A6 move.b #$4,($1A,A5)
  }
  if (a1Running259A4A(ram, 8)) return;                 // $2A69AC/$2A69AE/$2A69B4 bcs.s
  ram.setU16(a4 + 0x04, u16(ram.u16(a4 + 0x04) - 1));  // $2A69B6 subq.w #$1,($4,A4)
  if (ram.u16(a4 + 0x04) !== 0) return;                // $2A69BA bne.s $2A69CE
  a4Start25980C(ram, 0x0a);                            // $2A69BC/$2A69BE -- BACK TO $A
  seqStart2598D0(ram, 2);                              // $2A69C4/$2A69C6
  ram.setU16(a4, 0);                                   // $2A69CC clr.w (A4)
}

/**
 * `$2A6A30` / `$2A6A36` -- W406.  Delay `$60`, gun 9, then A4 **`$11`**.
 *
 * **IT HANDS TO `$11`, NOT TO `$10`, AND THAT MAKES THE ENDING CHAIN A LOOP.**
 * W405's handoff called `{$F, $10, $11, $12} x {gun 9, $A, $B, $C}` a chain in
 * id order.  Every arrow read out of the image says otherwise:
 *
 *   $2A6A5C moveq #$11 -> A4 $11  ($2A6AB6), which waits on gun $B
 *   $2A6AE8 moveq #$10 -> A4 $10  ($2A6A76), which waits on gun $A
 *   $2A6AA2 moveq #$F  -> A4 $F   -- back here
 *
 * so `$F -> $11 -> $10 -> $F` is a CLOSED THREE-LINK LOOP, phase B's answer to
 * phase A's four-link one, and `$12` is not in it: `$2A6B34 moveq #$F` only
 * feeds INTO `$F`, and no `moveq #$12 / jsr $25980C` exists anywhere in
 * `$2A4000..$2AB000`, so nothing in the boss ROM starts `$12` at all.
 *
 * **AND `$2A6A6C move.b #$C,($1A,A5)` IS PHASE B's DEATH TIMER**, the same trap
 * A4 $D springs on phase A: `($1A,A5)` is the WORD that `$2A7088 subq.w #$1`
 * walks down inside the exit twin `$2A7294`, and this writes its HIGH byte.
 * `$2A6AD8 move.b #$4,($1A,A5)` in A4 $11 rewrites it to `$04xx` one link later,
 * so phase B's timeout is re-armed by its own gun loop exactly as phase A's was.
 * Note the position: unlike A4 $D's, this write is on the HAND-OVER path, after
 * the gun has retired, not in the init.
 *
 * The freeze test at `$2A6A3C` branches FORWARD to the shared `rts` at
 * `$2A6A74`, which is the A4 convention and the opposite of gun 9's -- gun 9 has
 * no freeze test at all.  Neither may be assumed from the other.
 */
export function a4F2A6A30(ram, a4, a5, init) {
  if (init) ram.setU16(a4 + 0x02, 0x0060);             // $2A6A30 move.w #$60,($2,A4)
  if (ram.u16(a4 + 0x02) !== 0) {                      // $2A6A36 tst.w / $2A6A3A beq.s $2A6A52
    if (ram.u16(HIBACHI_A1.freeze) !== 0) return;      // $2A6A3C / $2A6A42 bne.s $2A6A74
    ram.setU16(a4 + 0x02, u16(ram.u16(a4 + 0x02) - 1));       // $2A6A44 subq.w #$1
    if (ram.u16(a4 + 0x02) !== 0) return;              // $2A6A48 bne.s $2A6A74
    a1Start259A18(ram, 9);                             // $2A6A4A/$2A6A4C
  }
  if (a1Running259A4A(ram, 9)) return;                 // $2A6A52/$2A6A54/$2A6A5A bcs.s
  a4Start25980C(ram, 0x11);                            // $2A6A5C/$2A6A5E -- $11, NOT $10
  seqStart2598D0(ram, 9);                              // $2A6A64/$2A6A66
  ram.setU8(a5 + 0x1a, 0x0c);                          // $2A6A6C move.b #$C,($1A,A5)
  ram.setU16(a4, 0);                                   // $2A6A72 clr.w (A4) -- 4254, the SLOT
}

/**
 * `$2A6AB6` / `$2A6ABC` -- W407.  Delay `$60`, gun `$B`, then A4 **`$10`**.
 *
 * The second link of phase B's loop, and the shape is A4 `$F`'s exactly, with
 * two differences that are both about WHERE a store sits rather than what it is:
 *
 *   - `$2A6AD8 move.b #$4,($1A,A5)` stands between `jsr $259A18` and the wait,
 *     i.e. on the frame the GUN STARTS, where A4 `$F`'s `#$C` write is on the
 *     hand-over after its gun has retired.  That is A4 `$D`'s arrangement, not
 *     A4 `$F`'s, and it means phase B's death timer is re-armed to `$04xx` the
 *     moment gun `$B` begins rather than when it ends.
 *   - the sequencer it starts on the way out is `#$8` (`$2A6AF0`), where `$F`
 *     starts `#$9` and `$10` starts `#$4`.
 */
export function a4Eleven2A6AB6(ram, a4, a5, init) {
  if (init) ram.setU16(a4 + 0x02, 0x0060);             // $2A6AB6 move.w #$60,($2,A4)
  if (ram.u16(a4 + 0x02) !== 0) {                      // $2A6ABC tst.w / $2A6AC0 beq.s $2A6ADE
    if (ram.u16(HIBACHI_A1.freeze) !== 0) return;      // $2A6AC2 / $2A6AC8 bne.s $2A6AFA
    ram.setU16(a4 + 0x02, u16(ram.u16(a4 + 0x02) - 1));       // $2A6ACA subq.w #$1
    if (ram.u16(a4 + 0x02) !== 0) return;              // $2A6ACE bne.s $2A6AFA
    a1Start259A18(ram, 0x0b);                          // $2A6AD0/$2A6AD2
    ram.setU8(a5 + 0x1a, 0x04);                        // $2A6AD8 move.b #$4,($1A,A5)
  }
  if (a1Running259A4A(ram, 0x0b)) return;              // $2A6ADE/$2A6AE0/$2A6AE6 bcs.s
  a4Start25980C(ram, 0x10);                            // $2A6AE8/$2A6AEA -- $10, the THIRD link
  seqStart2598D0(ram, 8);                              // $2A6AF0/$2A6AF2
  ram.setU16(a4, 0);                                   // $2A6AF8 clr.w (A4)
}

/**
 * `$2A6A76` / `$2A6A7C` -- W407.  Delay `$60`, gun `$A`, then A4 **`$F`**, which
 * is what makes `$F -> $11 -> $10 -> $F` a cycle rather than a chain.
 *
 * It is the ONLY one of the three that touches neither `($1A,A5)` nor anything
 * else on A5, so nothing here needs the boss record: phase B's death timer is
 * re-armed twice a lap (by `$F` and by `$11`) and not three times.
 */
export function a4Ten2A6A76(ram, a4, init) {
  if (init) ram.setU16(a4 + 0x02, 0x0060);             // $2A6A76 move.w #$60,($2,A4)
  if (ram.u16(a4 + 0x02) !== 0) {                      // $2A6A7C tst.w / $2A6A80 beq.s $2A6A98
    if (ram.u16(HIBACHI_A1.freeze) !== 0) return;      // $2A6A82 / $2A6A88 bne.s $2A6AB4
    ram.setU16(a4 + 0x02, u16(ram.u16(a4 + 0x02) - 1));       // $2A6A8A subq.w #$1
    if (ram.u16(a4 + 0x02) !== 0) return;              // $2A6A8E bne.s $2A6AB4
    a1Start259A18(ram, 0x0a);                          // $2A6A90/$2A6A92
  }
  if (a1Running259A4A(ram, 0x0a)) return;              // $2A6A98/$2A6A9A/$2A6AA0 bcs.s
  a4Start25980C(ram, 0x0f);                            // $2A6AA2/$2A6AA4 -- BACK TO $F
  seqStart2598D0(ram, 4);                              // $2A6AAA/$2A6AAC
  ram.setU16(a4, 0);                                   // $2A6AB2 clr.w (A4)
}

// ===========================================================================
// the registrations
// ===========================================================================
// The A1 pairs register SEPARATELY, because `4E75` at `step - 2` says the init
// does NOT fall through -- the opposite of `hibachiend.js`'s `initThenStep`.
registerScript(HIBACHI_A1.altGun0Init, (ram, rom, ctx, a4) =>
  altGun0Init2A9366(ram, rom, a4, bossA6(ctx, HIBACHI_A1.altGun0Init)));
registerScript(HIBACHI_A1.altGun0Step, (ram, rom, ctx, a4) =>
  altGun0Step2A93DC(ram, rom, ctx, a4, bossA5(ctx, HIBACHI_A1.altGun0Step),
    bossA6(ctx, HIBACHI_A1.altGun0Step)));
registerScript(HIBACHI_A1.altGun1Init, (ram, rom, ctx, a4) =>
  altGun1Init2A97F4(ram, rom, a4, bossA6(ctx, HIBACHI_A1.altGun1Init)));
registerScript(HIBACHI_A1.altGun1Step, (ram, rom, ctx, a4) =>
  altGun1Step2A9874(ram, rom, ctx, a4, bossA5(ctx, HIBACHI_A1.altGun1Step),
    bossA6(ctx, HIBACHI_A1.altGun1Step)));
registerScript(HIBACHI_A1.altGun2Init, (ram, rom, ctx, a4) =>
  altGun2Init2A9AA0(ram, rom, a4, bossA6(ctx, HIBACHI_A1.altGun2Init)));
registerScript(HIBACHI_A1.altGun2Step, (ram, rom, ctx, a4) =>
  altGun2Step2A9B0E(ram, rom, ctx, a4, bossA5(ctx, HIBACHI_A1.altGun2Step),
    bossA6(ctx, HIBACHI_A1.altGun2Step)));
registerScript(HIBACHI_A1.altGun3Init, (ram, rom, ctx, a4) =>
  altGun3Init2A9E84(ram, rom, a4, bossA6(ctx, HIBACHI_A1.altGun3Init)));
registerScript(HIBACHI_A1.altGun3Step, (ram, rom, ctx, a4) =>
  altGun3Step2A9EB6(ram, rom, ctx, a4, bossA5(ctx, HIBACHI_A1.altGun3Step),
    bossA6(ctx, HIBACHI_A1.altGun3Step)));
registerScript(HIBACHI_A1.altGun4Init, (ram, rom, ctx, a4) =>
  altGun4Init2AA072(ram, rom, a4));
registerScript(HIBACHI_A1.altGun4Step, (ram, rom, ctx, a4) =>
  altGun4Step2AA084(ram, rom, ctx, a4, bossA5(ctx, HIBACHI_A1.altGun4Step),
    bossA6(ctx, HIBACHI_A1.altGun4Step)));
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
registerScript(HIBACHI_A1.gun7Init, (ram, rom, ctx, a4) =>
  gun7Init2A8516(ram, rom, a4, bossA6(ctx, HIBACHI_A1.gun7Init)));
registerScript(HIBACHI_A1.gun7Step, (ram, rom, ctx, a4) =>
  gun7Step2A8538(ram, rom, ctx, a4, bossA5(ctx, HIBACHI_A1.gun7Step),
    bossA6(ctx, HIBACHI_A1.gun7Step)));
registerScript(HIBACHI_A1.gun8Init, (ram, rom, ctx, a4) =>
  gun8Init2A8800(ram, rom, a4, bossA6(ctx, HIBACHI_A1.gun8Init)));
registerScript(HIBACHI_A1.gun8Step, (ram, rom, ctx, a4) =>
  gun8Step2A883A(ram, rom, ctx, a4, bossA5(ctx, HIBACHI_A1.gun8Step),
    bossA6(ctx, HIBACHI_A1.gun8Step)));
registerScript(HIBACHI_A1.gun9Init, (ram, rom, ctx, a4) =>
  gun9Init2A89BA(ram, rom, a4, bossA6(ctx, HIBACHI_A1.gun9Init)));
registerScript(HIBACHI_A1.gun9Step, (ram, rom, ctx, a4) =>
  gun9Step2A89F4(ram, rom, ctx, a4, bossA5(ctx, HIBACHI_A1.gun9Step),
    bossA6(ctx, HIBACHI_A1.gun9Step)));
registerScript(HIBACHI_A1.gunAInit, (ram, rom, ctx, a4) =>
  gunAInit2A8B7C(ram, rom, a4, bossA6(ctx, HIBACHI_A1.gunAInit)));
registerScript(HIBACHI_A1.gunAStep, (ram, rom, ctx, a4) =>
  gunAStep2A8BC0(ram, rom, ctx, a4, bossA5(ctx, HIBACHI_A1.gunAStep),
    bossA6(ctx, HIBACHI_A1.gunAStep)));
registerScript(HIBACHI_A1.gunBInit, (ram, rom, ctx, a4) => gunBInit2A8C9A(ram, rom, a4));
registerScript(HIBACHI_A1.gunBStep, (ram, rom, ctx, a4) =>
  gunBStep2A8CB2(ram, rom, ctx, a4, bossA5(ctx, HIBACHI_A1.gunBStep),
    bossA6(ctx, HIBACHI_A1.gunBStep)));

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
registerScript(0x2a6970, (ram, rom, ctx, a4) =>
  a4D2A6970(ram, a4, bossA5(ctx, 0x2a6970), true));
registerScript(0x2a698a, (ram, rom, ctx, a4) =>
  a4D2A6970(ram, a4, bossA5(ctx, 0x2a698a), false));
registerScript(0x2a6a30, (ram, rom, ctx, a4) =>
  a4F2A6A30(ram, a4, bossA5(ctx, 0x2a6a30), true));
registerScript(0x2a6a36, (ram, rom, ctx, a4) =>
  a4F2A6A30(ram, a4, bossA5(ctx, 0x2a6a36), false));
registerScript(0x2a6ab6, (ram, rom, ctx, a4) =>
  a4Eleven2A6AB6(ram, a4, bossA5(ctx, 0x2a6ab6), true));
registerScript(0x2a6abc, (ram, rom, ctx, a4) =>
  a4Eleven2A6AB6(ram, a4, bossA5(ctx, 0x2a6abc), false));
registerScript(0x2a6a76, (ram, rom, ctx, a4) => a4Ten2A6A76(ram, a4, true));
registerScript(0x2a6a7c, (ram, rom, ctx, a4) => a4Ten2A6A76(ram, a4, false));

/** The shared/main-table A1 ids whose init AND step this file registers. */
export const HIBACHI_A1_SCRIPTS = Object.freeze([5, 6, 7, 8, 9, 0x0a, 0x0b]);
/** The loop-zero table's unique ids whose init AND step this file registers. */
export const HIBACHI_A1_ALT_SCRIPTS = Object.freeze([0, 1, 2, 3, 4]);
/** The A4 attack-loop ids this file registers alongside `hibachiend.js`. */
export const HIBACHI_GUN_A4_SCRIPTS = Object.freeze([0x0a, 0x0b, 0x0c, 0x0d, 0x0f, 0x10, 0x11]);

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
  // W408: $A is no longer here -- this file runs it, and phase B's loop
  // $F -> gun 9 -> $11 -> gun $B -> $10 -> gun $A -> $F is CLOSED. Measured at $11E
  // table-entry to table-entry, of which $F4 is code (`4E75` AT $2A8C6E) and the remaining
  // $2A -- not the $3C W407's note said, which was gun $B's own trailing figure copied one
  // line too far -- is gun $B's $A of template plus $20 of self-pointers.
  // W407: $B is no longer here -- this file runs it, with A4 $11 and A4 $10.
  0x0c: { init: 0x2a8ed0, step: 0x2a8f1c, bytes: 0x01d4, why: 'A4 $12 ($2A6B1E)' },
  0x0d: { init: 0x2a90a4, step: 0x2a90e0, bytes: 0x0204, why: 'A4 $13 ($2A6B6C); bounded '
    + 'ABOVE by the alt table $2A92A8 itself, a positive witness' },
});

/** All five ids unique to `$2A92A8`'s loop-zero table now run. W562-W566
 *  port ids 0 through 4; only the first loop can dispatch this alternate set. */
export const HIBACHI_A1_ALT_COUNTED = Object.freeze({});
/** `$2AA23C 4E75` is the last instruction of alt gun 4 -- it sits AT that
 *  address, not one past it -- and `$2AA23E 2210` (`move.l (A0),D1`) opens the
 *  shared arithmetic helpers, which is what bounds the alt set from above. */
export const HIBACHI_A1_ALT_END = 0x2aa23e;
