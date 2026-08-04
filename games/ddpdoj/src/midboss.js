// THE STAGE-1 MIDBOSS -- type `$0D`, handler `$26B6FA`.                    W31
//
// The fourth and last of the `fly-around` gate blockers W29 uncovered and W30
// walked down (`$275914` -> `$2739C0` -> `$276702` -> **`$26B6FA`**).  It is
// the largest single body in stage 1, and it is NOT one body: it is four
// routines and five data tables, and reading only from the type table's address
// finds barely half of it.
//
// ============================ THE SPAN, DECIDED BY CONTROL FLOW =============
//
//   $26B184..$26B213   the DEATH-BURST spawner            bsr from $26B7F8
//   $26B214..$26B285   ...its 14-record list, $FFFF-terminated ($26B286 is code)
//   $26B286..$26B302   the 8-ARM INIT                     bsr from $26B4B0 (init)
//   $26B304..$26B47A   the 8-ARM KINEMATICS               bsr from $26B906
//   $26B47C            type $0D's init STUB (run-length $10)  <- a DIFFERENT type
//   $26B484..$26B4F8   the INIT BODY (W23 ports it)
//   $26B6FA..$26BE6E   THE HANDLER
//   $26BE70..$26BF0F   two sprite-pointer tables
//   $26BF10..$26BF41   the handler's TAIL  (`bra` from $26BE06)
//   $26BF42..$26BFC1   ...its table
//   $26BFC2..$26BFE7   the BODY sprite     (`bsr` from $26BDF8)
//   $26BFE8..$26BFFB   ...its table
//
// **READ PAST THE APPARENT END.**  The handler does not finish at an `rts`.
// `$26BDF8 bsr $26BFC2` and `$26BE06 bra $26BF10` both end in
// `jmp $23DF58` -- TAIL CALLS into the sprite queue.  A reader who stopped at
// the first `rts` (`$26BE0A`) would lose the body sprite and the shadow, and a
// linear sweep prints all four tables above as bogus `ori.b` instructions.
//
// ======================== THE OWNER'S CONSTRAINT, MECHANISED ================
//
// `20-OWNER-minibosses-stop-the-scroll.md`: "when there's stationary
// minibosses, the stages in DOJ stop scrolling until they're killed."  W19
// found the mechanism and corrected the guess: a VM FREEZE does NOT stop the
// scroll.  The stage stops ADVANCING because stage 1's script parks a paired
// op-`$04` with `loops = $FFFF`, repeating a column band forever, and
// **nothing inside the VM can end it**.
//
// What ends it is in THIS file: `$26B72C clr.w $8130D8` + `$26B73A jsr
// $261100` with D0 = D1 = `$0020`, on the single frame the death countdown
// `($17,A5)` passes `$30`.  `$261100` (`src/background.js pushExternalSpeed`)
// sets `$813180`, and `$2612AA` -- ported since W13 and until now unreachable
// because nothing in the port ever produced that word -- overwrites the parked
// object's speed with `$0020`.
//
// So the halt is the SCRIPT's and the release is the MIDBOSS's, and the port
// now has both halves.  A run in which the midboss is never killed must scroll
// up to the band and then stop dead; that is what `fly-around` (which never
// fires) exercises, and it is the direction the gate can check.
//
// ============================== WHAT NOTES =================================
//
// Eight subsystems, and every one of them is already a counted note in some
// other ported handler -- this body drags in NO new subsystem:
//   `$286096` DAMAGE, `$28615E` effect/score, `$289004` the sprite-EFFECT
//   allocator, `$28AC72` the sub-record spawn engine, `$28C25A`/`$28C310` the
//   death bursts, `$246410` the ANIMATION-OBJECT installer (its own pool at
//   `$810346`/`$80FA86`, argument list `$26C0FC`), and `$244074`, the score
//   half of `$243E7C`.
//
// ============================== WHAT IS NEW ================================
//
//   * `$261100` -- the scroll-speed push (above), in `src/background.js`.
//   * `$2431F4` and `$242FDE` -- two members of the `$803917` DRAW FAMILY, in
//     `src/rng.js`.  There are 32 in build B and `$2433AE` was the only one
//     ported; these two are the midboss's.
//   * `$23E056` -- a fourth sprite-emitter stub SHAPE (`src/spritequeue.js`).
//   * `$243E7C` -- the arming half of the bullet-cancel screen clear, below.
//   * speed level `$70` in the exported `$200920` set: an IN-CODE constant at
//     `$26B3B2`/`$26B3F8`, which the template walk cannot see.

import { unreached } from './unported.js';
import { u16, i16 } from './ram.js';
import { freeEnemy } from './initbody.js';
import { scrollCompensate } from './movement.js';
import { fire as fireBulletFan, WriteLog, BUL } from './bullets.js';
import { BULLET_DRIVER } from './bulletdriver.js';
import { AimTables, AIM, aim256 } from './aim.js';
import { enqueueRegistersThroughStub } from './spritequeue.js';
import { enqueueDeferred, DEFQ_D1 } from './spawn.js';
import { drawByte2431F4, drawSigned242FDE } from './rng.js';
import { scoreHit, scoreKill } from './score.js';
import { pushExternalSpeed } from './background.js';

/** `addi.l` -- a 32-bit add whose low half CARRIES into the high half. */
const u32 = (v) => (v >>> 0) % 0x100000000;
/** `asr.w #n` -- arithmetic, on the WORD. */
const asrw = (v, n) => (i16(v) >> n) & 0xffff;

/** The enemy record (A5).  Named per MEANING, not per handler -- `($17,A5)` is
 *  the midboss's DEATH COUNTDOWN and nothing else in this body. */
const R = {
  onScreen: 0x16,      // $26B8BE  a byte latch, set once the boss is on screen
  deathCtr: 0x17,      // $26B6FA  the death countdown; 0 = alive
  swingTgt: 0x18,      // $26B2FE  the arm-swing dwell
  swingNeg: 0x19,      // $26B2DA  0/1: negate the swing
  swingAmp: 0x1a,      // $26B2BA  the swing amplitude target
  swingCur: 0x1b,      // $26B2BE  ...its current value
  swingCad: 0x1c,      // $26B2C4  the per-step cadence
  swingRel: 0x1d,      // $26B2D6  ...its reload
  armsFired: 0x1e,     // $26B358  latched once the arms have gone to state 1
  phase: 0x20,         // $26BC58  a 0..7 rotor picking which arm may fire
  hitFlags: 0x21,      // $26B756  0 / $01 (clock $D8) / $FF (clock $F8)
  bodyCad: 0x22,       // $26B90A  the body-sprite frame cadence
  bodyRel: 0x23,       // $26B912  ...its reload
  bodyFrm: 0x24,       // $26B918  ...the frame, 0/4/8/$C/$10
  hpMirror: 0x26,      // $26B81C  ($18,A6) mirrored every frame
  fireD1: 0x28,        // $26B7E8  D1 at the moment of death -> $243E7C's flags
};
/** The sub-record (A6).  The eight ARMS live at ($20,A6) + n*$40. */
const S = {
  flags: 0x00, posX: 0x02, posY: 0x04,
  stateCad: 0x06, stateRel: 0x07,       // $26B93A  the state-0 dwell
  anim: 0x08,                           // $26B980  the $26BF42 frame, 0..$7C
  animCad: 0x0a, animRel: 0x0b,         // $26B972
  state: 0x0c,                          // $26B92A  0..3
  fanCtr: 0x0d,                         // $26B994  the fan's odd/even selector
  fanCad: 0x0e, fanRel: 0x0f,           // $26B9AA
  hp: 0x18, palette: 0x1d, f1c: 0x1c, f1e: 0x1e, f1f: 0x1f,
  arms: 0x20,
};
/** One ARM, at ($20,A6) + n*$40. */
const A = {
  flags: 0x00, posX: 0x02, posY: 0x04,
  fireCad: 0x06, fireRel: 0x07,         // $26BC80
  state: 0x08,                          // $26BCF2  0..3
  anim: 0x0a, animCad: 0x0c, animRel: 0x0d,  // $26BD12 / $26BD04
  dying: 0x09,                          // $26B1BE  set by the death burst
  facing: 0x1b,                         // $26B290  the arm's angle byte
  swing: 0x1a,                          // $26B456  the swing carried per arm
  f1c: 0x1c, f1d: 0x1d, f1e: 0x1e, f1f: 0x1f,
  hp: 0x18,
  salvo: 0x26, salvoRel: 0x27,          // $26BD3C
  burst: 0x28,                          // $26BD2C  the burst counter
  spread: 0x29,                         // $26B294 / $26BD7C
  gateA: 0x2a, gateARel: 0x2b,          // $26BC78
  gateB: 0x2c, gateBRel: 0x2d,          // $26BC94
  gfxCad: 0x2e, gfxRel: 0x2f,           // $26B45A
  gfx: 0x30,                            // $26B468  the $26BE90 index, & $7F
};
const G = {
  freeze: 0x8130d2,       // $26B8F6  the global pause
  clock: 0x8130ce,        // $26B74A  the scroll distance clock
  midbossD8: 0x8130d8,    // $26B72C  the stage-kill flag the regulars gate on
  midbossDA: 0x8130da,    // $26B7D8
  scroll: 0x813172,
};
/** `$26B214` -- the death burst's 14 spawn records, 8 bytes each,
 *  `$FFFF`-terminated.  Walked at `$26B1D8 move.w (A4)+,D1`. */
const BURST_LIST = 0x26b214;
/** The four sprite tables.  See `tools/export-tables.py` for the extents and
 *  how each far end is pinned. */
const TAB = { arm: 0x26be90, armAnim: 0x26be70, tail: 0x26bf42, body: 0x26bfe8 };
/** `$26BA16 lea $2736FA,A0` -- type $80's NARROW fan table, reused verbatim by
 *  the midboss.  Already a declared window (W30's `$2735F0`). */
const FAN_TABLE = 0x2736fa;

const AIM_TABLES = new WeakMap();
function aimTables(rom) {
  let t = AIM_TABLES.get(rom);
  if (!t) { t = new AimTables(rom); AIM_TABLES.set(rom, t); }
  return t;
}

function note(ctx, addr, what) {
  ctx.unported?.note(addr, `$${addr.toString(16).toUpperCase()} ${what}`);
}

// ===========================================================================
// `$243E7C` -- ARM THE BULLET-CANCEL SCREEN CLEAR, then score what it cancels.
//
//   243e7c: tst.w $81B410 / beq $243E9A       not armed -> arm it
//   243e84: cmpi.w #$20,$81B412 / bcs $243E9A  armed but the counter is < $20
//   243e8e: cmpi.w #$3c,$81B412 / bhi $243E9A  ...or > $3C -> re-arm
//   243e98: rts                                inside [$20,$3C] -> do nothing
//   243e9a: move.w #$1,$81B410 / move.w #$0,$81B412
//   243eaa: btst #1,$8130F8 / bne $2440AE      -> a body whose loop is `bra`d
//                                                 OVER at $2440B2: a no-op
//   243eb6: movem.l D0-D7/A0-A6,-(A7) / ori.w #$8000,D1 / bra $244074
//   244074: lea $817F8C,A2 / move.w #$D1,D7    <- 210 slots, the BULLET POOL
//   244080:   move.w (A2),D0 / bpl skip        live = bit 15 set
//   244084:   btst #4,D1 -> moveq #$46,D0 / jsr $28614A    player 1 scores
//   244092:   btst #3,D1 -> moveq #$46,D0 / jsr $286154    player 2 scores
//
// **THE ARMING IS THE LOAD-BEARING HALF AND IT IS PORTED.**  `$81B410` is what
// `$281CD6` (the bullet subsystem's screen clear, ported in W29's
// `src/bulletdriver.js`) is gated on, and `$25354C` (type-5 call #21, also
// W29) is what counts `$81B412` back down.  Until this wave nothing in the
// port ever SET `$81B410`, so that whole path was live and unreachable -- the
// same shape as `$2612AA` and the speed push.
//
// The score walk is a note: `$28614A`/`$286154` are the `$286626` family that
// `$28615E` already stands in for.  It is counted WITH THE LIVE-BULLET COUNT
// so "the clear fired over an empty pool" and "the clear fired over 27
// bullets" are not the same line in the log.
export function armScreenClear(ram, ctx, d1, from) {
  const ARM = BULLET_DRIVER.armWord, MODE = BULLET_DRIVER.modeWord;
  if (ram.u16(ARM) !== 0                                // $243E7C tst.w $81B410
      && ram.u16(MODE) >= 0x20                          // $243E84 cmpi/bcs
      && ram.u16(MODE) <= 0x3c) {                       // $243E8E cmpi/bhi
    return false;                                       // $243E98 rts
  }
  ram.setU16(ARM, 1);                                   // $243E9A
  ram.setU16(MODE, 0);                                  // $243EA2
  if ((ram.u8(0x8130f8) & 0x02) !== 0) {                // $243EAA btst #1
    // $2440AE pushes the registers and immediately `bra.w $2440DA`s over its
    // own counting loop to the pop and the `rts`.  It really is a no-op, and
    // that is transcribed rather than smoothed into "the other arm".
    note(ctx, 0x2440ae, `the $8130F8-bit-1 arm of $243E7C (${from}) -- its `
      + `loop at $2440B6 is jumped over by $2440B2 bra.w $2440DA, so it does `
      + `nothing but save and restore registers`);
    return true;
  }
  const flags = u16(d1) | 0x8000;                       // $243EBA ori.w #$8000
  let live = 0;                                         // $244074..$2440A4
  for (let s = 0; s < BUL.slots; s++) {
    if ((ram.u16(BUL.pool + s * BUL.stride) & 0x8000) !== 0) live += 1;
  }
  note(ctx, 0x244074, `the bullet-cancel SCORE walk (${from}) -- ${live} of `
    + `${BUL.slots} pool slots live, D1 = $${flags.toString(16).toUpperCase()} `
    + `(bit 4 = P1 via $28614A, bit 3 = P2 via $286154, $46 each). The CANCEL `
    + `itself is $281CD6, gated on $81B410, which this call has just armed`);
  return true;
}

// ===========================================================================
// `$26B2AC` -- roll the arm-swing parameters.  FOUR draws off the shared
// `$803917` counter: three `$2431F4` and one `$242FDE`.  Called from the INIT
// (`$26B286` -> `$26B2A6`) and again from `$26B380` every time the swing
// finishes a full retraction.
export function rollSwing(ram, rom, a5) {
  let d0 = drawByte2431F4(ram, rom);                   // $26B2AC
  d0 = i16(u16(d0 & 0xff) | ((d0 & 0x80) ? 0xff00 : 0)); // $26B2B2 ext.w
  d0 = u16(((d0 & 0xff00) | ((d0 + d0) & 0xff)) + 0x14); // $26B2B4 add.b / $26B2B6 addi.w
  ram.setU8(a5 + R.swingAmp, d0 & 0xff);               // $26B2BA
  ram.setU8(a5 + R.swingCur, 0);                       // $26B2BE
  ram.setU8(a5 + R.swingCad, 0);                       // $26B2C4
  let d = drawByte2431F4(ram, rom);                    // $26B2CA
  d = ((d + d) & 0xff);                                // $26B2D0 add.b D0,D0
  ram.setU8(a5 + R.swingRel, (d + 0x10) & 0xff);       // $26B2D2 addi.b #$10
  ram.setU8(a5 + R.swingNeg, 0);                       // $26B2DA
  if (drawSigned242FDE(ram, rom) !== 0) {              // $26B2E0 / $26B2E6 beq
    ram.setU8(a5 + R.swingNeg, 1);                     // $26B2EA
  }
  let e = drawByte2431F4(ram, rom);                    // $26B2F0
  e = ((e + e) & 0xff); e = ((e + e) & 0xff);          // $26B2F6/$26B2F8
  ram.setU8(a5 + R.swingTgt, (e + 0x10) & 0xff);       // $26B2FA/$26B2FE
}

/** `$26B286` -- the 8-arm INIT.  Reached ONLY from the init body's
 *  `$26B4B0 bsr`, which `src/initbody.js` still notes; exported so the note
 *  can become a call without re-deriving it. */
export function initArms(ram, rom, a5, a6) {
  let d6 = 0, d5 = 0;                                  // $26B286/$26B288
  for (let n = 0; n < 8; n++) {                        // $26B28E moveq #$7,D7
    const a4 = a6 + S.arms + n * 0x40;
    ram.setU8(a4 + A.facing, d6);                      // $26B290
    ram.setU8(a4 + A.spread, d5);                      // $26B294
    d6 = (d6 + 0x20) & 0xff;                           // $26B298 addi.b #$20
    d5 = (d5 + 8) & 0xff;                              // $26B29C addq.b #$8
  }
  rollSwing(ram, rom, a5);                             // $26B2A6 bsr $26B2AC
}

// ===========================================================================
// `$26B304` -- THE ARM KINEMATICS, run once per frame from `$26B906`.
//
// Two halves.  The first (`$26B304..$26B39A`) is a small state machine on
// `($1A..$1E,A5)` that grows the swing to its target, holds it, retracts it,
// and on the frame it reaches zero either re-rolls the parameters or -- if
// `($21,A5)` says the boss is in its aggressive phase -- puts EVERY arm into
// state 1 and latches `($1E,A5)`.
//
// The second (`$26B39C..$26B47A`) places all eight arms.  Each arm's position
// is the body's position plus a vector out of `$241D34` at speed level `$70`,
// scaled x3 on the long axis and x4 on the short one; then an INNER LOOP walks
// the arm towards the body in `$10`-unit steps of a signed residual carried in
// `($1A,A4)`, adding `D4` (+1 or -1) to the arm's angle byte at each step.
export function stepArms(ram, rom, a5, a6, tables) {
  if (ram.u8(a5 + R.armsFired) === 0) {                // $26B304 tst.b / bne
    const amp = ram.u8(a5 + R.swingAmp);               // $26B30C
    if (amp !== 0 && amp !== ram.u8(a5 + R.swingCur)) { // $26B310 beq / $26B314 cmp/beq
      // ---- GROW.  $26B31C subq.b #1,($1C,A5) / bge -- a SIGNED test, so the
      // step happens on the frame the byte goes past $00 into $FF.
      const c = (ram.u8(a5 + R.swingCad) - 1) & 0xff;
      ram.setU8(a5 + R.swingCad, c);
      if (i16(c | (c & 0x80 ? 0xff00 : 0)) >= 0) return placeArms(ram, rom, a5, a6, tables);
      ram.setU8(a5 + R.swingCad, ram.u8(a5 + R.swingRel));      // $26B324
      ram.setU8(a5 + R.swingCur, (ram.u8(a5 + R.swingCur) + 1) & 0xff); // $26B32A
      return placeArms(ram, rom, a5, a6, tables);               // $26B32E
    }
    if (ram.u8(a5 + R.swingTgt) !== 0) {               // $26B332 tst.b / bne $26B388
      // ---- HOLD.  $26B388 subq.b #1,($18,A5) / bne
      const h = (ram.u8(a5 + R.swingTgt) - 1) & 0xff;
      ram.setU8(a5 + R.swingTgt, h);
      if (h === 0) {                                   // $26B38C bne $26B39C
        ram.setU8(a5 + R.swingAmp, 0);                 // $26B390
        ram.setU16(a5 + R.swingCad, 0x0404);           // $26B396 move.w #$404,($1C,A5)
      }
      return placeArms(ram, rom, a5, a6, tables);
    }
    // ---- RETRACT.  $26B33A, the same signed cadence.
    const c = (ram.u8(a5 + R.swingCad) - 1) & 0xff;
    ram.setU8(a5 + R.swingCad, c);
    if (i16(c | (c & 0x80 ? 0xff00 : 0)) >= 0) return placeArms(ram, rom, a5, a6, tables);
    ram.setU8(a5 + R.swingCad, ram.u8(a5 + R.swingRel)); // $26B342
    const cur = (ram.u8(a5 + R.swingCur) - 1) & 0xff;   // $26B348 subq.b #1
    ram.setU8(a5 + R.swingCur, cur);
    if (i16(cur | (cur & 0x80 ? 0xff00 : 0)) > 0) {     // $26B34C bgt
      return placeArms(ram, rom, a5, a6, tables);
    }
    // $26B350 tst.b ($21,A5) / ble $26B380 -- SIGNED, so both 0 and $FF skip
    // the arm launch and go straight to the re-roll.
    if (i16(ram.u8(a5 + R.hitFlags) | (ram.u8(a5 + R.hitFlags) & 0x80 ? 0xff00 : 0)) > 0) {
      ram.setU8(a5 + R.armsFired, 1);                  // $26B358
      // $26B35E jsr $242FDE -- the ONLY draw the midboss makes on a live frame
      // once it is placed; every other one is behind the swing re-roll.
      const d6 = (drawSigned242FDE(ram, rom) + 1) & 0xff;  // $26B364 addq.b #1
      for (let n = 0; n < 8; n++) {                    // $26B36C moveq #$7,D7
        const a4 = a6 + S.arms + n * 0x40;
        ram.setU8(a4 + A.state, 1);                    // $26B36E
        ram.setU8(a4 + A.burst, d6);                   // $26B374
      }
    }
    rollSwing(ram, rom, a5);                           // $26B380 bsr $26B2AC
  }
  return placeArms(ram, rom, a5, a6, tables);          // $26B39C
}

/** `$26B39C..$26B47A` -- place all eight arms. */
function placeArms(ram, rom, a5, a6, tables) {
  let d5 = ram.u8(a5 + R.swingCur);                    // $26B39C/$26B39E moveq #0 / move.b
  if (ram.u8(a5 + R.swingNeg) !== 0) d5 = u16(-d5);    // $26B3A2 tst.b / $26B3AA neg.w
  for (let n = 0; n < 8; n++) {                        // $26B3B0 moveq #$7,D7
    const a4 = a6 + S.arms + n * 0x40;
    // $26B3B2 move.w #$70,D0 -- an IN-CODE speed level, not a template byte.
    let v = tables.shotVector(0x70, ram.u8(a4 + A.facing));  // $26B3BC jsr $241D34
    // $26B3C2 move.l ($2,A6),D6 / addi.l #$2000000 -- a LONG add: the carry out
    // of the short axis reaches the long one.
    const base = u32(ram.u32(a6 + S.posX) + 0x02000000);
    ram.setU32(a4 + A.posX, base);                     // $26B3CC
    // $26B3D0 move.w D2,D1 / asl.w #1,D2 / add.w D1,D2 -> D2 * 3
    let d2 = u16(u16(v.dy << 1) + v.dy);
    let d3 = u16(v.dx << 2);                           // $26B3D6 asl.w #2,D3
    ram.setU16(a4 + A.posX, u16(ram.u16(a4 + A.posX) + d2));  // $26B3D8
    ram.setU16(a4 + A.posY, u16(ram.u16(a4 + A.posY) + d3));  // $26B3DC
    // $26B3E0 moveq #0,D6 / move.b ($1A,A4),D6 / ext.w D6 / add.w D5,D6
    let d6 = i16(u16(ram.u8(a4 + A.swing) | (ram.u8(a4 + A.swing) & 0x80 ? 0xff00 : 0)));
    d6 = i16(u16(d6 + i16(d5)));
    let d4;
    if (d6 < 0) { d4 = 0xff; d6 = -d6; }               // $26B3F4 moveq #$FF / neg.w
    else d4 = 1;                                       // $26B3EE moveq #$1
    // ---- $26B3F8: the inner loop.  It runs until the residual D6 is below
    // $10, stepping the arm's angle byte by D4 each time round.
    for (;;) {
      const ang = (d4 + ram.u8(a4 + A.facing)) & 0xff; // $26B3FC/$26B3FE/$26B402
      v = tables.shotVector(0x70, ang);                // $26B406 jsr $241D34
      d2 = u16(u16(v.dy << 1) + v.dy);                 // $26B40C/$26B40E/$26B410
      d3 = u16(v.dx << 2);                             // $26B412
      d2 = u16(u16(d2 + ram.u16(a6 + S.posX)) + 0x200);  // $26B414/$26B418
      d3 = u16(d3 + ram.u16(a6 + S.posY));             // $26B41C
      d2 = u16(d2 - ram.u16(a4 + A.posX));             // $26B420
      d3 = u16(d3 - ram.u16(a4 + A.posY));             // $26B424
      d2 = asrw(d2, 4); d3 = asrw(d3, 4);              // $26B428/$26B42A
      // $26B42C ext.l / $26B430 muls.w D6,D2 -- signed 16x16; only the low word
      // reaches the record, because $26B434 is an `add.w`.
      const p2 = i16(d2) * d6, p3 = i16(d3) * d6;
      ram.setU16(a4 + A.posX, u16(ram.u16(a4 + A.posX) + p2));   // $26B434
      ram.setU16(a4 + A.posY, u16(ram.u16(a4 + A.posY) + p3));   // $26B438
      if (d6 < 0x10) break;                            // $26B43C cmpi.w #$10 / blt
      ram.setU8(a4 + A.facing, (ram.u8(a4 + A.facing) + d4) & 0xff); // $26B444 add.b
      d6 -= 0x10;                                      // $26B448 subi.w #$10
      if (d6 === 0) break;                             // $26B44C bne $26B3F8
    }
    if (d4 >= 0x80) d6 = -d6;                          // $26B44E tst.w D4 / bpl / neg.w
    ram.setU8(a4 + A.swing, d6 & 0xff);                // $26B456 move.b D6,($1A,A4)
    // $26B45A: the arm's own graphic cadence, an INDEX into $26BE90 masked $7F.
    const gc = ram.u8(a4 + A.gfxCad);                  // $26B45A subq.b #1 / bcc
    ram.setU8(a4 + A.gfxCad, (gc - 1) & 0xff);
    if (gc === 0) {
      ram.setU8(a4 + A.gfxCad, ram.u8(a4 + A.gfxRel)); // $26B462
      ram.setU16(a4 + A.gfx, u16(ram.u16(a4 + A.gfx) + 4) & 0x7f); // $26B468/$26B46C
    }
  }
  return undefined;
}

// ===========================================================================
// `$26B184` -- THE DEATH BURST.  Sets the death countdown to `$70`, marks every
// arm dying, and walks `$26B214` spawning 14 effect records.
function deathBurst(ram, rom, a5, a6, ctx) {
  ram.setU8(a5 + R.deathCtr, 0x70);                    // $26B184
  for (let n = 0; n < 8; n++) {                        // $26B18E moveq #$7,D7
    const a4 = a6 + S.arms + n * 0x40;
    if (ram.u16(a4 + A.flags) === 0x8000) {            // $26B190 cmpi.w #$8000 / bne
      // $26B19A jsr $289004 and five writes into the record it returns in A0.
      note(ctx, 0x289004, `the midboss death burst's per-arm effect (D0=$C, arm `
        + `${n}) -- the allocator and the five field writes at $26B1A0..$26B1B8 `
        + `are one gap, not six`);
    }
    ram.setU8(a4 + A.dying, 1);                        // $26B1BE (EVERY arm)
  }
  note(ctx, 0x28c310, 'the midboss death burst $28C310 (the $28C02A family, '
    + 'D0=7 / D1=$FF / D2=$1E)');                      // $26B1CC
  // $26B1D2 lea $26B214(pc),A4 -- 14 records of (word D1, word D0, long).
  for (let i = 0; ; i++) {
    const at = BURST_LIST + i * 8;
    const d1 = rom.u16(at);                            // $26B1D8 move.w (A4)+,D1
    if (d1 === 0xffff) break;                          // $26B1DA cmpi.w #$FFFF / beq
    if (i > 32) {
      unreached(BURST_LIST, `the midboss death-burst list at $26B214 ran past 32 `
        + `records without its $FFFF terminator. The ROM window or the stride `
        + `is wrong -- the list is 14 records of 8 bytes ending at $26B284`);
    }
    const d0 = rom.u16(at + 2);                        // $26B1E2 move.w (A4)+,D0
    note(ctx, 0x289004, `the midboss death burst's list entry ${i} `
      + `(D0=$${d0.toString(16).toUpperCase()}, +$18=$${d1.toString(16)
        .toUpperCase()}, +$26=$${rom.u32(at + 4).toString(16).toUpperCase()}) `
      + `-- $26B1E4, and the six writes after it are the same gap`);
  }
}

// ===========================================================================
// `$26BE0C` -- the eight ARM sprites, two requests each, both bucket 3 via the
// FOURTH stub shape `$23E056`.
function drawArms(ram, rom, a6) {
  for (let n = 0; n < 8; n++) {                        // $26BE10 moveq #$7,D7
    const a0 = a6 + S.arms + n * 0x40;
    if (ram.u16(a0 + A.flags) === 0x8000) continue;    // $26BE14 cmpi.w #$8000 / beq
    // $26BE1C lea $26BE90(pc),A1 / adda.w ($30,A0),A1 / move.l (A1),D2
    const d2a = rom.u32(TAB.arm + ram.u16(a0 + A.gfx));
    // $26BE28 move.l ($2,A0),D1 / addi.l #$FA00FC00 -- a LONG add.
    const d1a = u32(ram.u32(a0 + A.posX) + 0xfa00fc00);
    enqueueRegistersThroughStub(ram, rom, 0x23e056, d1a, d2a,
      0x620, ram.u16(a0 + A.f1c));                     // $26BE32/$26BE36/$26BE3A
    // $26BE40 lea $26BE70(pc),A1 / move.w ($A,A0),D2 / move.l (A1,D2.w),D2
    const d2b = rom.u32(TAB.armAnim + ram.u16(a0 + A.anim));
    const d1b = u32(ram.u32(a0 + A.posX) + 0xfc00fc00);  // $26BE52
    enqueueRegistersThroughStub(ram, rom, 0x23e056, d1b, d2b,
      0x420, ram.u16(a0 + A.f1c));                     // $26BE58/$26BE5C/$26BE60
  }
}

/** `$26BFC2` -- the BODY sprite, tail-calling `$23DF58` (bucket 3). */
function drawBody(ram, rom, a5, a6) {
  const d2 = rom.u32(TAB.body + ram.u16(a5 + R.bodyFrm));   // $26BFC8/$26BFCC
  const d1 = u32(ram.u32(a6 + S.posX) + 0xdc00e600);        // $26BFD2 addi.l -- LONG
  enqueueRegistersThroughStub(ram, rom, 0x23df58, d1, d2, 0x24d0, 0x11);
}

/** `$26BF10` -- the TAIL sprite.  Its two `addi.w`s straddle a `swap`, so
 *  NEITHER carries into the other half -- unlike `drawBody`'s `addi.l`. */
function drawTail(ram, rom, a6) {
  const d2 = rom.u32(TAB.tail + ram.u16(a6 + S.anim));      // $26BF16/$26BF1A
  const pos = ram.u32(a6 + S.posX);                         // $26BF1E
  const lo = u16((pos & 0xffff) + 0xf400);                  // $26BF22 addi.w #$F400
  // $26BF26 swap / $26BF28 addi.w #$1600 / $26BF2C addi.w #$E600 -- TWO adds on
  // the long axis, transcribed as two because that is what the listing does.
  let hi = u16((pos >>> 16) + 0x1600);
  hi = u16(hi + 0xe600);
  enqueueRegistersThroughStub(ram, rom, 0x23df58, ((hi << 16) | lo) >>> 0,
    d2, 0x1a60, ram.u16(a6 + S.f1c));                       // $26BF32/$26BF36/$26BF3A
}

// ===========================================================================
// `$26B9C2..$26BC14` -- THE BIG FAN.
//
// Eleven `dbra` blocks off ONE aim, alternating between `$2817B8` (kind 4) and
// `$281764` (kind 3) and selected by bit 0 of `($D,A6)`, which the state
// machine steps down from 2.  So the fan has an ODD frame and an EVEN frame and
// they fire DIFFERENT generators:
//
//   ($D,A6) EVEN -> six `$2817B8` blocks of 4 = 24 kind-4 bullets
//   ($D,A6) ODD  -> a 7-shot `$2817B8` pre-fan (D0 = $00030003, kind 3) plus
//                   five `$281764` blocks of 4 = 20 kind-3 bullets
//
// **THE PRE-FAN READS A0, AND A0 IS THE PLAYER RECORD.**  `$26B9F4 move.l
// (A0,D3.w),D3` runs before `$26BA16 lea $2736FA,A0`, so A0 is whatever
// `$24226E` left -- and `$2422A2` saves and restores A0 across its own table
// reads, so what it left is `$24270A`'s selection: `$8103E6` or `$810448`.
// That is a RAM read of the player-record region, not a ROM table, and it is
// transcribed as one.  A port that "fixed" it to `$2736FA` would be inventing
// a different bullet.
function bigFan(ram, rom, a5, a6, ctx) {
  // $26B9B8 cmpi.w #$1000,($2,A6) / bcs -- UNSIGNED, so a negative Y is "far".
  if (ram.u16(a6 + S.posX) < 0x1000) return;           // $26B9BE bcs $26BC16
  // $26B9C2 movem.w ($2,A6),D0-D1 / addi.w #$2700,D0 / jsr $24226E.
  // $24226E is `bsr $24270A` + `movem.w ($2,A0),D2-D3` + `bra $2422A2`; the
  // select is transcribed inline (as in aim85/fan80) because A0 is needed.
  let p0 = AIM.selP1, p1 = AIM.selP2;                  // $24270A
  if (ram.u8(a5 + 0x03) !== 0) { p0 = AIM.selP2; p1 = AIM.selP1; }
  if ((ram.u16(p0) & 0x8000) === 0) {
    if ((ram.u16(p1) & 0x8000) === 0) return;          // $242726 ori #1,SR -> bcs
    const t = p0; p0 = p1; p1 = t;
  }
  const selfY = u16(ram.u16(a6 + S.posX) + 0x2700);    // $26B9C8
  const selfX = ram.u16(a6 + S.posY);
  let d1 = aim256(aimTables(rom), selfY, selfX,
    ram.u16(p0 + 2), ram.u16(p0 + 4));                 // $2422A2
  const d2 = ram.u32(a6 + S.posX);                     // $26B9D6 move.l ($2,A6),D2
  const d4 = 0;                                        // $26B9DA moveq #$0,D4
  const d6 = u16(d1);                                  // $26B9DC move.w D1,D6
  const odd = (ram.u8(a6 + S.fanCtr) & 1) !== 0;       // $26B9DE btst #$0,($D,A6)
  const shoot = (entry, d0, d3, site) => {
    const res = fireBulletFan({ ram, rom, log: new WriteLog(ram) }, entry,
      { d0, d1, d2, d3, d4, d5: 0, a5 });
    ctx.bulletSpawn?.(site, res);
  };
  if (odd) {
    // ---- $26B9E6: the pre-fan.  D3 is computed ONCE, outside the loop.
    const idx = u16((d1 + 2) & 0xfc);                  // $26B9EC/$26B9EE/$26B9F0
    const d3 = u32(ram.u32(p0 + idx) + 0x27000000);    // $26B9F4 (A0 = the PLAYER) / $26B9F8
    d1 = u16(d1 - 0x0c);                               // $26B9FE subi.w #$C,D1
    for (let k = 0; k < 7; k++) {                      // $26BA02 moveq #$6,D7
      shoot(0x2817b8, 0x00030003, d3, 0x26ba04);       // $26BA04
      d1 = u16(d1 + 4);                                // $26BA0A addq.w #$4,D1
    }
  }
  d1 = u16(d6 - 0x56);                                 // $26BA10/$26BA12 subi.w #$56
  // The eleven blocks, in ROM order.  Each is four iterations stepping D1 by 4;
  // the pairs differ ONLY in D0, the D3 bias, the generator and the sense of
  // the `btst`.  The `jsr` addresses are the LOOP BODIES' sites, so
  // `Game.bulletSpawns` names the exact instruction that fired.
  const BLOCKS = [
    [0x2817b8, 0x00050003, 0x12000000, false, 0x26ba3e],  // $26BA1C
    [0x281764, 0x00050004, 0x27000000, true, 0x26ba6c],   // $26BA4A
    [0x2817b8, 0x00050003, 0x12000000, false, 0x26ba9a],  // $26BA78
    [0x281764, 0x00050004, 0x27000000, true, 0x26bac8],   // $26BAA6
    [0x2817b8, 0x00050003, 0x12000000, false, 0x26baf6],  // $26BAD4
    [0x281764, 0x00050004, 0x27000000, true, 0x26bb24],   // $26BB02
    [0x2817b8, 0x00050003, 0x12000000, false, 0x26bb52],  // $26BB30
    [0x281764, 0x00050004, 0x27000000, true, 0x26bb80],   // $26BB5E
    [0x2817b8, 0x00050003, 0x12000000, false, 0x26bbae],  // $26BB8C
    [0x281764, 0x00050004, 0x27000000, true, 0x26bbdc],   // $26BBBA
    [0x2817b8, 0x00050003, 0x12000000, false, 0x26bc0a],  // $26BBE8
  ];
  for (const [entry, d0, bias, wantOdd, site] of BLOCKS) {
    for (let k = 0; k < 4; k++) {                      // moveq #$3,D7 + dbra
      const idx = u16((d1 + 2) & 0xfc);
      const d3 = u32(rom.u32(FAN_TABLE + idx) + bias);
      if (odd === wantOdd) shoot(entry, d0, d3, site);
      d1 = u16(d1 + 4);
    }
  }
}

// ===========================================================================
// `$26BC62..$26BDC4` -- THE PER-ARM FIRE, and the four-state machine each arm
// runs.  Only the arm whose loop counter matches `($20,A5) & 3` may fire on a
// given frame, so at most two of the eight arms fire per frame.
function armFire(ram, rom, a5, a6, ctx) {
  ram.setU8(a5 + R.phase, (ram.u8(a5 + R.phase) + 1) & 7);  // $26BC58/$26BC5C
  const phase = ram.u8(a5 + R.phase) & 3;              // $26BCA2/$26BCAC
  const shoot = (d0, d1, d2, d3, site) => {
    const res = fireBulletFan({ ram, rom, log: new WriteLog(ram) }, 0x2817a8,
      { d0, d1, d2, d3, d4: 0, d5: 0, a5 });
    ctx.bulletSpawn?.(site, res);
  };
  for (let n = 0; n < 8; n++) {                        // $26BC66 moveq #$7,D7
    const a4 = a6 + S.arms + n * 0x40;
    const d7 = 7 - n;                                  // the dbra counter, live in D7
    if (ram.u16(a4 + A.flags) === 0x8000) continue;    // $26BC68
    const st = ram.u8(a4 + A.state);
    if (st === 0) {                                    // $26BC70 tst.b ($8,A4) / bne
      // ---- state 0: the idle sweep, gated twice and then by the rotor.
      if (ram.u8(a4 + A.gateA) === 0) {                // $26BC78 tst.b / bne $26BC94
        const c = ram.u8(a4 + A.fireCad);              // $26BC80 subq.b #1 / bcc
        ram.setU8(a4 + A.fireCad, (c - 1) & 0xff);
        if (c !== 0) continue;
        ram.setU8(a4 + A.fireCad, ram.u8(a4 + A.fireRel));    // $26BC88
        ram.setU8(a4 + A.gateA, ram.u8(a4 + A.gateARel));     // $26BC8E
      }
      const g = ram.u8(a4 + A.gateB);                  // $26BC94 subq.b #1 / bcc
      ram.setU8(a4 + A.gateB, (g - 1) & 0xff);
      if (g !== 0) continue;
      ram.setU8(a4 + A.gateB, ram.u8(a4 + A.gateBRel)); // $26BC9C
      if ((d7 & 3) !== phase) continue;                // $26BCA6..$26BCB2 cmp.b/bne
      // $26BCB6 movem.w ($2,A4),D0-D1 then $26BCBC move.b ($1B,A4),D1 -- a BYTE
      // move, so D1's high byte is still the long axis.  Only the low byte is
      // read by the generator (`src/bullets.js` masks D1 to a byte everywhere),
      // which is why the stale high half is harmless and is recorded, not
      // tidied away.
      const facing = ram.u8(a4 + A.facing);
      const d1 = (ram.u16(a4 + A.posY) & 0xff00) | facing;
      if (facing >= 0xe0) continue;                    // $26BCC0 cmpi.b #$E0 / bcc
      if (facing <= 0x20) continue;                    // $26BCCA cmpi.b #$20 / bls
      shoot(0xfffe0007, d1, ram.u32(a4 + A.posX), 0x02000000, 0x26bce4);
      ram.setU8(a4 + A.gateA, (ram.u8(a4 + A.gateA) - 1) & 0xff);  // $26BCEA
      continue;                                        // $26BCEE bra $26BDC0
    }
    if (st === 1) {                                    // $26BCF2 cmpi.b #$1 / bne
      // ---- state 1: wind up, driven only while the body's own anim is 0.
      if (ram.u16(a6 + S.anim) !== 0) continue;        // $26BCFC tst.w ($8,A6) / bne
      const c = ram.u8(a4 + A.animCad);                // $26BD04 subq.b #1 / bcc
      ram.setU8(a4 + A.animCad, (c - 1) & 0xff);
      if (c !== 0) continue;
      ram.setU8(a4 + A.animCad, ram.u8(a4 + A.animRel));       // $26BD0C
      ram.setU16(a4 + A.anim, u16(ram.u16(a4 + A.anim) + 4));  // $26BD12
      if (ram.u16(a4 + A.anim) !== 0x1c) continue;     // $26BD16 cmpi.w #$1C / bne
      ram.setU8(a4 + A.state, 2);                      // $26BD20
      ram.setU16(a4 + A.salvo, 1);                     // $26BD26 move.w #$1,($26,A4)
      ram.setU8(a4 + A.burst, 8);                      // $26BD2C
      // FALLS THROUGH into the `cmpi.b #$2` test at $26BD32 on the SAME frame.
    }
    if (ram.u8(a4 + A.state) === 2) {                  // $26BD32
      const c = ram.u8(a4 + A.salvo);                  // $26BD3C subq.b #1 / bcc
      ram.setU8(a4 + A.salvo, (c - 1) & 0xff);
      if (c !== 0) continue;
      ram.setU8(a4 + A.salvo, ram.u8(a4 + A.salvoRel));  // $26BD44
      const facing = ram.u8(a4 + A.facing);
      if (facing < 0xe8 && facing > 0x18) {            // $26BD4A bcc / $26BD52 bls
        // $26BD5A move.b ($28,A4),D1 / add.b D1,D1 x2 / add.b ($1B,A4),D1 --
        // all BYTE ops; D1's high half is whatever the previous arm left, and
        // the generator reads only the low byte.
        const d1 = (((ram.u8(a4 + A.burst) * 4) + facing) & 0xff);
        shoot(0x00020007, d1, ram.u32(a4 + A.posX), 0x02000000, 0x26bd76);
        ram.setU8(a4 + A.spread, (ram.u8(a4 + A.spread) + 2) & 0xff);  // $26BD7C
      }
      const b = (ram.u8(a4 + A.burst) - 1) & 0xff;     // $26BD80 subq.b #1 / bne
      ram.setU8(a4 + A.burst, b);
      if (b !== 0) continue;
      ram.setU8(a4 + A.state, 3);                      // $26BD88
      ram.setU8(a4 + A.animCad, 0x20);                 // $26BD8E
      // ...and FALLS THROUGH into $26BD94 on the same frame.
    }
    if (ram.u8(a4 + A.state) === 3) {                  // $26BD94
      const c = ram.u8(a4 + A.animCad);                // $26BD9E subq.b #1 / bcc
      ram.setU8(a4 + A.animCad, (c - 1) & 0xff);
      if (c !== 0) continue;
      ram.setU8(a4 + A.animCad, ram.u8(a4 + A.animRel));       // $26BDA6
      ram.setU16(a4 + A.anim, u16(ram.u16(a4 + A.anim) - 4));  // $26BDAC
      if (ram.u16(a4 + A.anim) !== 0) continue;        // $26BDB0 bne
      ram.setU8(a4 + A.state, 0);                      // $26BDB4
      ram.setU8(a4 + A.animCad, 0x10);                 // $26BDBA
    }
  }
  // $26BDC8: if EVERY live arm is back in state 0, clear ($1E,A5) so the swing
  // machine may launch them again.
  let d6 = 0;
  for (let n = 0; n < 8; n++) {                        // $26BDCE moveq #$7,D7
    const a4 = a6 + S.arms + n * 0x40;
    if (ram.u16(a4 + A.flags) === 0x8000) continue;    // $26BDD0
    if (ram.u8(a4 + A.state) === 0) continue;          // $26BDD8
    d6 = 1;                                            // $26BDE2
  }
  if (d6 === 0) ram.setU8(a5 + R.armsFired, 0);        // $26BDEC tst.w / $26BDF2
}

// ===========================================================================
// `$26B6FA` -- THE HANDLER.
export function handlerMidboss(ram, rom, a5, ctx) {
  const { tables } = ctx;
  const a6 = ram.u32(a5 + 0x06);

  // ---------------------------------------------------- $26B6FA: THE DEATH ARM
  if (ram.u8(a5 + R.deathCtr) !== 0) {                 // $26B6FA tst.b / beq $26B74A
    scrollCompensate(ram, a5);                         // $26B702 jsr $24179E
    armScreenClear(ram, ctx, ram.u16(a5 + R.fireD1), 'the midboss death arm $26B70C');
    const c = (ram.u8(a5 + R.deathCtr) - 1) & 0xff;    // $26B712 subq.b #1
    ram.setU8(a5 + R.deathCtr, c);
    if (c === 0) { freeEnemy(ram, a5); return; }       // $26B716 beq / $26B742 jmp $263762
    if (c >= 0x48) {                                   // $26B718 cmpi.b #$48 / bcc
      // $26BDF8, the SAME entry the live path uses.  It is entered with
      // ($17,A5) non-zero ONLY from here, which is what makes $26BDFC's
      // `bne $26BE0A` a live branch rather than decoration -- so the death
      // sequence must reach it through `drawAll` and not by an inlined copy.
      drawAll(ram, rom, a5, a6);
      return;
    }
    if (c !== 0x30) return;                            // $26B722 cmpi.b #$30 / bne
    // ---- THE SCROLL RELEASE.  See this file's header and W19 §2.
    ram.setU16(G.midbossD8, 0);                        // $26B72C clr.w $8130D8
    pushExternalSpeed(ram, 0x20, 0x20);                // $26B732/$26B736/$26B73A
    return;                                            // $26B740 rts
  }

  // ---------------------------------------------------- $26B74A: THE LIVE ARM
  if (ram.u16(G.clock) === 0xd8) ram.setU8(a5 + R.hitFlags, 0x01);  // $26B74A/$26B756
  if (ram.u16(G.clock) === 0xf8) ram.setU8(a5 + R.hitFlags, 0xff);  // $26B75C/$26B768
  const dmg = ram.u8(a6) & 0x5c;                       // $26B76E moveq #$5C / and.b (A6)
  if (dmg !== 0) {
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // $26B776/$26B77A
    // $26B77C jsr $286096.  D1 (the hit mask) is READ by $286096's `btst`s and
    // is not written on any path this wave read -- which matters, because
    // $26B7E8 stores it two instructions later.  I could not read every branch
    // of the score family; see the worklog's "what I could not determine".
    // $26B77C jsr $286096 -- W34.  D1 is the hit mask $26B76E built and
    // $26B7E8 stores it two instructions after the death branch, so it must
    // survive the call: src/score.js takes it as an argument rather than
    // relying on a register convention nobody can check.
    scoreHit(ram, ctx, a6, dmg);
    ram.setU8(a6 + S.palette,                          // $26B782..$26B78C eor.b
      (ram.u8(a6 + S.palette) ^ ram.u8(a6 + S.f1f)) & 0xff);
    if (ram.u8(a5 + R.hitFlags) === 0) {               // $26B790 tst.b / bne
      ram.setU16(a6 + S.hp, 0x3500);                   // $26B798
    }
    if (ram.u16(a6 + S.anim) === 0) {                  // $26B79E tst.w ($8,A6) / bne
      ram.setU16(a6 + S.hp, ram.u16(a5 + R.hpMirror)); // $26B7A4
      // $26B7AA tst.b ($21,A5) / bpl -- SIGNED, so only $80..$FF takes the arm.
      if ((ram.u8(a5 + R.hitFlags) & 0x80) !== 0) {
        ram.setU16(a6 + S.hp, 0x7fff);                 // $26B7B0
      }
      ram.setU8(a6 + S.palette, ram.u8(a6 + S.f1e));   // $26B816
    } else if ((ram.u16(a6 + S.hp) & 0x8000) === 0) {  // $26B7BA tst.w / bpl $26B81C
      // -> $26B81C, SKIPPING the $26B816 palette write.  Three of the five
      // arms of this branch land on $26B816 and two on $26B81C; that
      // difference is the whole reason the two labels are separate.
    } else if (ram.u16(G.clock) < 0xe7) {              // $26B7C2 cmpi.w #$E7 / bcc
      ram.setU16(a6 + S.hp, 0x0200);                   // $26B7CE
      // $26B7D4 bra $26B81C -- also skipping $26B816.
    } else {
      // ---- $26B7D8: THE DEATH.  Everything the boss does when it dies.
      ram.setU16(G.midbossDA, 1);                      // $26B7D8
      const q = enqueueDeferred(ram, 0x1c, DEFQ_D1.FIXED00);  // $26B7E0/$26B7E2
      if (q.dropped) {
        note(ctx, 0x263684, `the midboss's death spawn (type $1C) was DROPPED `
          + `-- the deferred queue was full at $C80`);
      }
      // $26B7E8 move.w D1,($28,A5).  $263684 pops D0-D2, so D1 is still the hit
      // mask from $26B76E; it becomes $243E7C's player-select flags below.
      ram.setU16(a5 + R.fireD1, dmg);
      scoreKill(ram, rom, ctx, 0x353, dmg);          // $26B7EC/$26B7F2
      deathBurst(ram, rom, a5, a6, ctx);               // $26B7F8 bsr $26B184
      note(ctx, 0x246410, `the midboss's ANIMATION-OBJECT install from the `
        + `14-record list at $26C0FC ($26B7FC lea / $26B802 jsr) -- its own `
        + `pool at $810346 / $80FA86, unported and unreferenced elsewhere`);
      armScreenClear(ram, ctx, ram.u16(a5 + R.fireD1), 'the midboss death $26B80C');
      ram.setU16(a6 + S.flags, 0x8080);                // $26B812
      ram.setU8(a6 + S.palette, ram.u8(a6 + S.f1e));   // $26B816
    }
  } else {
    ram.setU8(a6 + S.palette, ram.u8(a6 + S.f1e));     // $26B816 (the beq path)
  }
  ram.setU16(a5 + R.hpMirror, ram.u16(a6 + S.hp));     // $26B81C

  // ---------------------------------------------------- $26B822: the ARM damage
  for (let n = 0; n < 8; n++) {                        // $26B826 moveq #$7,D7
    const a4 = a6 + S.arms + n * 0x40;
    if (ram.u16(a4 + A.flags) === 0x8000) continue;    // $26B82A cmpi.w #$8000 / beq
    let kill = ram.u8(a4 + A.dying) !== 0;             // $26B832 tst.b ($9,A4) / bne
    if (!kill) {
      const d = ram.u8(a4 + A.flags) & 0x5c;           // $26B83A moveq #$5C / and.b
      if (d === 0) {                                   // $26B83E beq $26B8B0
        ram.setU8(a4 + A.f1d, ram.u8(a4 + A.f1e));     // $26B8B0
        continue;
      }
      ram.setU8(a4 + A.flags, ram.u8(a4 + A.flags) & 0xa3);   // $26B842/$26B846
      scoreHit(ram, ctx, a4, d);                     // $26B848 jsr $286096
      ram.setU8(a4 + A.f1d,                            // $26B84E..$26B858 eor.b
        (ram.u8(a4 + A.f1d) ^ ram.u8(a4 + A.f1f)) & 0xff);
      if (ram.u8(a5 + R.hitFlags) === 0) {             // $26B85C tst.b / bne
        ram.setU16(a4 + A.hp, 0x0400);                 // $26B864
      }
      if ((ram.u16(a4 + A.hp) & 0x8000) === 0) continue;   // $26B86A tst.w / bpl
      scoreKill(ram, rom, ctx, 0x26, d);             // $26B872/$26B874
      kill = true;                                     // fall through to $26B87A
    }
    note(ctx, 0x28c25a, `midboss ARM ${n} death burst $28C25A`);   // $26B87A
    note(ctx, 0x289004, `midboss ARM ${n} death effect (D0=$85) -- $26B884, and `
      + `the five writes at $26B88A..$26B8A2 into the record it returns`);
    ram.setU16(a4 + A.flags, 0x8000);                  // $26B8A8 (PORTED: the kill)
  }

  // ---------------------------------------------------- $26B8BE: the exit test
  if (ram.u8(a5 + R.onScreen) === 0) {                 // $26B8BE tst.b / bne
    // $26B8C6 tst.w ($2,A6) / bmi $26B8F0 -- latch once the body is on screen.
    if ((ram.u16(a6 + S.posX) & 0x8000) === 0) ram.setU8(a5 + R.onScreen, 1); // $26B8CE
  } else if (i16(ram.u16(a6 + S.posX)) <= i16(0xdc00)) {  // $26B8D8 cmpi.w / bgt
    ram.setU16(G.midbossD8, 0);                        // $26B8E2 clr.w $8130D8
    freeEnemy(ram, a5);                                // $26B8E8 jmp $263762
    return;
  }
  note(ctx, 0x28ac72, `$28AC72 sub-record spawn engine in the MIDBOSS rec $${
    a5.toString(16)} -- the $81DB90 pool + the ($44,A5) advance are the gap; `
    + `its result is unused by $26B8F6`);              // $26B8F0

  // $26B8F6 tst.w $8130D2 / bne $26BDF8 -- a WORD test here (type $85 uses a
  // LONG at $2759AC).  A paused frame draws and does nothing else.
  if (ram.u16(G.freeze) !== 0) { drawAll(ram, rom, a5, a6); return; }

  scrollCompensate(ram, a5);                           // $26B900 jsr $24179E
  stepArms(ram, rom, a5, a6, tables);                  // $26B906 bsr $26B304

  // $26B90A: the BODY's own sprite frame, 0/4/8/$C/$10 into $26BFE8.
  const bc = ram.u8(a5 + R.bodyCad);                   // subq.b #1 / bcc
  ram.setU8(a5 + R.bodyCad, (bc - 1) & 0xff);
  if (bc === 0) {
    ram.setU8(a5 + R.bodyCad, ram.u8(a5 + R.bodyRel)); // $26B912
    ram.setU16(a5 + R.bodyFrm, u16(ram.u16(a5 + R.bodyFrm) + 4));  // $26B918
    if (i16(ram.u16(a5 + R.bodyFrm)) >= 0x14) {        // $26B91C cmpi.w #$14 / blt
      ram.setU16(a5 + R.bodyFrm, 0);                   // $26B926
    }
  }

  // ---------------------------------------------------- $26B92A: the BODY state
  bodyState(ram, rom, a5, a6, ctx);

  // $26BC50 tst.b ($21,A5) / ble $26BDF8 -- SIGNED: 0 and $80..$FF skip the
  // whole per-arm fire block, so the arms only shoot in the aggressive phase.
  const hf = ram.u8(a5 + R.hitFlags);
  if (i16(hf | (hf & 0x80 ? 0xff00 : 0)) > 0) {
    armFire(ram, rom, a5, a6, ctx);                    // $26BC58..$26BDF2
  }
  drawAll(ram, rom, a5, a6);                           // $26BDF8
}

/** `$26BDF8..$26BE06` -- the three draws, in ROM order.  The `($17,A5)` test
 *  between them is why the death sequence shows a body and no arms. */
function drawAll(ram, rom, a5, a6) {
  drawBody(ram, rom, a5, a6);                          // $26BDF8 bsr $26BFC2
  if (ram.u8(a5 + R.deathCtr) !== 0) return;           // $26BDFC tst.b / bne $26BE0A
  drawArms(ram, rom, a6);                              // $26BE02 bsr $26BE0C
  drawTail(ram, rom, a6);                              // $26BE06 bra $26BF10
}

/** `$26B92A..$26BC4E` -- the body's four-state machine.  States 0 and 1 wind
 *  the animation up; state 2 owns the fan; state 3 winds it back down. */
function bodyState(ram, rom, a5, a6, ctx) {
  const st = ram.u8(a6 + S.state);
  if (st === 0) {                                      // $26B92A tst.b / bne
    // $26B932 tst.b ($21,A5) / ble -- SIGNED again.
    const hf = ram.u8(a5 + R.hitFlags);
    if (i16(hf | (hf & 0x80 ? 0xff00 : 0)) <= 0) return;
    const c = ram.u8(a6 + S.stateCad);                 // $26B93A subq.b #1 / bcc
    ram.setU8(a6 + S.stateCad, (c - 1) & 0xff);
    if (c !== 0) return;
    ram.setU8(a6 + S.stateCad, ram.u8(a6 + S.stateRel));  // $26B942
    ram.setU8(a6 + S.state, 1);                        // $26B948
    ram.setU16(a6 + S.animCad, 0x0002);                // $26B94E move.w #$2,($A,A6)
    return;                                            // $26B954 bra $26BC50
  }
  if (st === 1) {                                      // $26B958 cmpi.b #$1 / bne
    // $26B962 tst.w ($8,A6) / bne $26B972 -- once the animation has started the
    // ($1E,A5) latch no longer holds it.
    if (ram.u16(a6 + S.anim) === 0 && ram.u8(a5 + R.armsFired) !== 0) return; // $26B96A
    const c = ram.u8(a6 + S.animCad);                  // $26B972 subq.b #1 / bcc
    ram.setU8(a6 + S.animCad, (c - 1) & 0xff);
    if (c !== 0) return;
    ram.setU8(a6 + S.animCad, ram.u8(a6 + S.animRel)); // $26B97A
    ram.setU16(a6 + S.anim, u16(ram.u16(a6 + S.anim) + 4));  // $26B980
    if (ram.u16(a6 + S.anim) !== 0x7c) return;         // $26B984 cmpi.w #$7C / bne
    ram.setU8(a6 + S.state, 2);                        // $26B98E
    ram.setU8(a6 + S.fanCtr, 2);                       // $26B994
    ram.setU16(a6 + S.fanCad, 0x0002);                 // $26B99A move.w #$2,($E,A6)
    // FALLS THROUGH into $26B9A0 on the same frame.
  }
  if (ram.u8(a6 + S.state) === 2) {                    // $26B9A0 cmpi.b #$2 / bne
    const c = ram.u8(a6 + S.fanCad);                   // $26B9AA subq.b #1 / bcc
    ram.setU8(a6 + S.fanCad, (c - 1) & 0xff);
    if (c !== 0) return;
    ram.setU8(a6 + S.fanCad, ram.u8(a6 + S.fanRel));   // $26B9B2
    bigFan(ram, rom, a5, a6, ctx);                     // $26B9B8..$26BC14
    // $26BC16 subq.b #1,($D,A6) / bne $26BC50 -- the fan's odd/even selector,
    // and the thing that ends state 2 when it reaches 0.
    const f = (ram.u8(a6 + S.fanCtr) - 1) & 0xff;
    ram.setU8(a6 + S.fanCtr, f);
    if (f !== 0) return;
    ram.setU8(a6 + S.state, 3);                        // $26BC1E
    ram.setU16(a6 + S.animCad, 0x1001);                // $26BC24 move.w #$1001,($A,A6)
    // ...and FALLS THROUGH into $26BC2A.
  }
  if (ram.u8(a6 + S.state) !== 3) return;              // $26BC2A cmpi.b #$3 / bne
  const c = ram.u8(a6 + S.animCad);                    // $26BC34 subq.b #1 / bcc
  ram.setU8(a6 + S.animCad, (c - 1) & 0xff);
  if (c !== 0) return;
  ram.setU8(a6 + S.animCad, ram.u8(a6 + S.animRel));   // $26BC3C
  ram.setU16(a6 + S.anim, u16(ram.u16(a6 + S.anim) - 4));  // $26BC42
  if (ram.u16(a6 + S.anim) !== 0) return;              // $26BC46 bne
  ram.setU8(a6 + S.state, 0);                          // $26BC4A
}

export const MIDBOSS = Object.freeze({
  handler: 0x26b6fa, init: 0x26b484, initBody: 0x26b48c, type: 0x0d,
  armCount: 8, armStride: 0x40, armBase: S.arms,
  burstList: BURST_LIST, tables: TAB, fanTable: FAN_TABLE,
  R, S, A,
});
