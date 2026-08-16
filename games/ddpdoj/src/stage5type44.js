// ===============================================================================================
// TYPE $44 (W400) -- STAGE 5'S THREE-PART SCROLL-RELEASING SET PIECE, AND THE REAL $26B73A TWIN.
// ===============================================================================================
//
// `$26DF40` init / `$26DF48` initBody / `$26E02A` handler, and the family runs to `$26EBE7`:
// **$BBE bytes**, bounded ABOVE by type `$53`'s init at `$26EBE8` (which `$267824 + $53*8` names)
// and BELOW by its own sub-record prototype, whose six 28-byte entries end at `$26E029` -- the byte
// before the handler.  Neither bound is an absence: the cartridge's own type table states one and
// `($4,A5) = 5` states the other.
//
// No stage script spawns it.  Type `$43` does, at its own ramp step `$3C` (`$26DEC4 moveq #$44,D0`,
// `handlers.js` T43.spawnType), and `$43` has exactly ONE stage-5 record -- `$237ED0`, trigger clock
// `$009E`.  So type $44 is a stage-5 object with no record of its own.
//
// **THE TWO `$0020` PUSHES, AND WHAT THEY ACTUALLY DO.**  `$26E04C` and `$26E152` were the last two
// unclaimed callers of `$261100` (W399 SECTION 2 named them).  Each is preceded by
// `move.w #$0,$8130DA`, and `$8130DA` is `background.js` BGRAM.elemGate -- the word `$2623C2` tests
// at the head of every background-element updater.  `$26DF6A`, in this type's own init body, is what
// SETS it.  So the pair does two things at once:
//
//   1. releases the background elements this object froze when it spawned, and
//   2. pushes `speedBg = speedTx = $0020` into `$813180`/`$813182`/`$813184`, which `$2612AA`
//      consumes on the next background frame.
//
// **WHICH KIND OF STOP: NEITHER.**  Stage 5's scroll script `$261DA8` (decoded record by record in
// `tests/w400type44.test.js` SECTION 3) has `t=$00B0 SPEED $0010` and `t=$00E0 SPEED $0020` around
// this object's whole life, and no `SPEED $0000` anywhere before `t=$0346`.  W398's park was a
// CARTRIDGE stop (the script's own `SPEED $0000`); W399's was a PORT stop (an unported second form).
// This one is a **SLOWDOWN THE PUSH CANCELS EARLY**: kill the object and the scroll returns to $0020
// on the death frame instead of at clock `$00E0`.  Let it live and the script's own `$00E0` record
// sets the same $0020 a moment later and the push is a NO-OP -- byte for byte the shape W17 measured
// for `$26B73A` in stage 1 ("it pushed the $0020 the script had already set").
//
// **THE TWO PUSHES ARE ONE DEATH, TWO FRAMES APART, and the bridge between them is `($BE,A6)`:**
//
//     $26E152   HP pool ($18,A5), a LONG, goes negative -> ($BF,A6) := 1, anim state 3, push #2
//     $26EA00   ($BF,A6) drives a three-phase death; phase 2 sets ($BE,A6) := 1
//     $26E04C   a later frame, the handler's SECOND test sees ($BE,A6), pushes again, and
//               `jmp $263762` frees the record
//
// and `($BE,A6)` has a SECOND writer: anim state 4 (`$26E7F6`/`$26E806`), the fly-away the clock
// trigger arms.  So push #1 answers two different exits and push #2 answers only the death.
//
// **THE CLOCK TRIGGER IS AN EQUALITY ON THE ODOMETER.**  `$26E06A cmpi.w #$E0,$8130CE` -- BGRAM.clock,
// the DISTANCE odometer, not a frame counter.  It also gates on `($17,A5) == 0`, and the same byte
// gates the damage arm at `$26E112`: once the clock trigger fires, THIS OBJECT CAN NO LONGER DIE.
// The two exits are exclusive by construction, not by luck.
//
// TRAPS THIS TYPE ACTUALLY CONTAINS, each with the instruction that proves it:
//
//   * TRAP 3, three times, and every one is load-bearing.  `$26E7CE move.w #$480,($1A,A6)` is speed
//     `$04` + heading `$80`; `$26E7E0 move.w #$C40` is speed `$0C` + heading `$40` (`$CC0` -> `$C0`).
//     `movement.js` SUB says +$1A is speed and +$1B is heading, so ONE word literal is the entire
//     death-drift vector.  `$26EB2E move.w #$1006,($A8,A6)` is cadence `$10` + reload `$06`, and
//     `$26EAB8` reloads +$A8 FROM +$A9.
//   * A `sub.w` INTO A LONG REGISTER.  `$26E0D4 move.l #$7FFF,D2 / $26E0DA sub.w ($18,A6),D2` leaves
//     D2's high word zero, and `$26E0E8 cmp.l D3,D2` then compares LONGS.
//   * IT IS A MAX, NOT A MIN.  `cmp.l D3,D2 / bge` SKIPS `move.l D3,D2`, so the survivor is the
//     LARGER of the three "damage taken" figures -- the most-damaged part sets the frame's bill.
//   * `add.w D1,($22,A6)` ON A LONG FIELD.  `$26E18E` and `$26E1A2` add the trail word to the word
//     at +$22/+$42, which is the HIGH half of the long `$26E17E`/`$26E192` just stored there.
//   * THE PALETTE FLASH IS A FALL-THROUGH.  `$26E164 moveq #$12` (restore) is reached by the no-hit
//     `beq` at `$26E094` AND by falling out of the death block -- but NOT from the hit-but-alive
//     path, which branches to `$26E172`.  That asymmetry IS the flash.
//   * `$26EB3A andi.w #$FFFE,SR` / `$26EB40 ori.w #$1,SR` -- the death sequence returns a CARRY and
//     its only caller (`$26E172 bsr.w`) never branches on it.  Returned anyway: trap 22 says dead
//     stores are transcribed, not tidied.
//   * THE TWIN IS A WHOLE MACHINE, NOT A PAIR.  Type `$4C`'s `$270014` burst pair is structurally
//     identical -- same `$40`/`$C0` quarter turns, same `$F8000800`/`$01FFF800` biases, same
//     D3 = `$C`, same D0 = 0 -- and W402 measured that the whole THREE-ARM machine matches, not
//     just the pair: `$270000`/`$270014`/`$270094` against `$26EA12`/`$26EA26`/`$26EAA6`, on
//     `($86,A6)` against `($A6,A6)`.  Its two lists, `$270134` and `$27017E`, are BYTE FOR BYTE
//     `$26EB46` and `$26EB90` over all `$94` bytes (`check_type4c_retire_windows` asserts it).
//     W402 CORRECTION: this line used to end "but draws from `$242EC2`".  It does not; both
//     routines draw from `$242B3C` at every one of their four sites.
//
// WHAT THIS FILE PORTS AND WHAT IT COUNTS -- byte extents measured, never estimated:
//
//   PORTED   $26E02A + $1BE   the handler spine, both pushes, the damage fold, the death arm
//            $26E1E8 + $8C    the three draws (part 0 draws TWICE, parts 1 and 2 once each)
//            $26E274 + $12    the anim-state setter
//            $26E286 + $1C    the anim dispatch, tail-jumping to $241E34
//            $26E2A2 + $14    its FIVE-entry table
//            $26E318 + $C2    anim state 0, the waypoint wander (the state the proto starts in)
//            $26E3DA + $24    its NINE waypoint pairs
//            $26E3FE + $62    its speed-by-distance threshold table
//            $26E7C4 + $12    anim state 3, the death drift
//            $26E7D6 + $42    anim state 4, the fly-away, and ($BE,A6)'s second writer
//            $26E818 + $C     disable fire      $26E824 + $A   set fire mode
//            $26EA00 + $146   the three-phase death sequence
//            $26EB46 + $4A    its six-entry explosion list      $26EB90 + $4A  the $26C74E list
//            $26EBDA + $E     the $246520 animation-object script push #2 hands to A0
//            -------- $626 of $BBE
//
//   COUNTED  $26E2B6 + $62    a threshold table with NO reader anywhere in the image (trap 20)
//            $26E460 + $C6    anim state 1, the approach      + $26E526 + $62  its table
//            $26E588 + $1DA   anim state 2, the attack        + $26E762 + $62  its table
//            $26E82E + $22    the fire dispatch               + $26E850 + $8   its two entries
//            $26E858 + $14E   fire mode 0, a 23-shot ring and a 5-shot fan
//            $26E9A6 + $5A    fire mode 1, which SPAWNS TYPE $53 ($26E9E2 moveq #$53,D0)
//            -------- $598 of $BBE     and $626 + $598 = $BBE exactly.
//
// The counted set is the FIRING half.  Nothing in it writes `($BE,A6)`, `($BF,A6)`, `($17,A5)`,
// `($18,A5)` or `$8130DA`, so neither push depends on a line of it; what it does own is
// `($66,A6) := 1` and `:= 2` (`$26E9A0`/`$26E9B2`), which is the ONLY way anim states 1 and 2 are
// ever entered -- so counting the driver and counting those two states is ONE decision, not three.

import { u16, i16, u32 } from './ram.js';
import { unreached } from './unported.js';
import { freeEnemy } from './initbody.js';
import { pushExternalSpeed } from './background.js';
import { applyShotVelocity241E34 } from './movement.js';
import { enqueueRegistersThroughStub } from './spritequeue.js';
import { scoreHit } from './score.js';
import { AimTables, aim256 } from './aim.js';
import { dist242494 } from './bossscripts.js';
import { drawWord242EC2, drawByte242B3C } from './rng.js';
import { spawnEffect, walkDeathSpawns270D92 } from './effects.js';
import { bigBurst28B4BE } from './boss.js';
import { armScreenClear243E02 } from './midboss.js';
import { loadAnimObjects246520 } from './animobjects.js';

/** Every address and constant this file translates, so a reader can check any line. */
export const T44 = Object.freeze({
  init: 0x26df40, initBody: 0x26df48, handler: 0x26e02a,
  // $26DF60 moveq #$2,D0 -> D0+1 = THREE words at ($16,A5); $26DF40 move.w #$5,($4,A5) -> D7+1 = SIX
  // sub records.  The two prototypes are CONTIGUOUS: $26DF7C + 6 = $26DF82, and $26DF82 + 6*28 =
  // $26E02A, the handler.  ZERO overlap, which is what the depth rule predicts for six long-form
  // entries against a handler that starts exactly where they end.
  recordProto: 0x26df7c, recordWords: 3,
  subProto: 0x26df82, subRecords: 6, subProtoBytes: 0xa8,
  familyEnd: 0x26ebe8, familyBytes: 0xbbe,     // $26EBE8 is type $53's init, from $267824 + $53*8

  elemGate: 0x8130da,        // BGRAM.elemGate -- SET by $26DF6A, CLEARED by BOTH pushes
  budgetWord: 0x81b414,      // $26DF72 -- the same one-word budget arm $47 and $4C set
  clock: 0x8130ce,           // BGRAM.clock, the DISTANCE odometer
  freeze: 0x8130d2,          // BGRAM.bgFreeze
  scroll: 0x813172,          // BGRAM.scrollCur
  retireClock: 0x00e0,       // $26E06A cmpi.w #$E0,$8130CE -- an EQUALITY on the odometer
  scrollPush: 0x20,          // $26E044/$26E048 and $26E14A/$26E14E -- D0 = D1 = $0020

  retireFlag: 0xbe,          // ($BE,A6) "free me now"  -- written by $26EA1C and $26E800/$26E810
  deadFlag: 0xbf,            // ($BF,A6) "dying"        -- written by $26E13C
  parts: Object.freeze([0x00, 0x20, 0x40]),
  hpAt: 0x18, palAt: 0x1d,   // per part, so +$18/+$38/+$58 and +$1D/+$3D/+$5D
  damageMask: 0x5c, damageClear: 0xa3,
  palXor: 0x0d, palRestore: 0x12,
  hitMaskAt: 0xae,           // $26E098 move.w D1,($AE,A6) -- read ONLY by $26EA08
  sinkFull: 0x7fff, hpLong: 0x18,   // ($18,A5) is a LONG; the record proto seeds it $00015000
  deadPartWord: 0x8000,
  stateAt: 0x17,             // ($17,A5) -- 0 = killable, 1 = the clock trigger has fired

  animAt: 0x66, animSub: 0x68,      // ($66,A6) the state, ($68,A6) its inner phase
  animTable: 0x26e2a2, animStates: 5,
  animIdle: 0, animApproach: 1, animAttack: 2, animDeath: 3, animFly: 4,
  waypoints: 0x26e3da, waypointBytes: 0x24,   // $26E38A cmpi.w #$24,($6A,A6) IS the row count
  state0Thresh: 0x26e3fe,
  state0Cursor: 0x6a, state0Range: 0x80, state0Default: 5, state0SpeedAt: 0x72,
  unreadTable: 0x26e2b6, unreadTableBytes: 0x62,

  fireModeAt: 0x86, fireSubAt: 0x88, fireOff: 0xffff,
  fireDispatch: 0x26e82e,

  deathPhaseAt: 0xa6, deathTickAt: 0xa8, deathReloadAt: 0xa9,
  deathCursorAt: 0xaa, deathLoopAt: 0xac,
  deathListA: 0x26eb46, deathListAStride: 0x0c, deathListAEnd: 0x48,
  deathListB: 0x26eb90,
  deathAnim: 0x10,           // $26EAEC move.w #$10,($1E,A0), and $26C74E's own constant
  deathReload: 0x1006,       // $26EB2E -- ONE word covering ($A8) = $10 and ($A9) = $06
  deathPhase1Tick: 0x10,     // $26EA9A move.b #$10,($A8,A6) -- a GENUINE move.b
  burstTurns: Object.freeze([[0x40, 0xf8000800], [0xc0, 0x01fff800]]),
  burstBucket: 0x0c,
  deathCueA: 0x28c274, deathCueB: 0x28c310,
  animScript: 0x26ebda, animScriptBytes: 0x0e,   // the $246520 caller table push #2 hands to A0

  drawStub: 0x23df58,
  draw0a: Object.freeze({ d2: 0x13df28, subL: 0x0e000000, addL: 0xf000e600, d3: 0x10d0, pal: 0x1d }),
  draw0b: Object.freeze({ d2: 0x13d3ac, addL: 0xea00e600, d3: 0x16d0, pal: 0x1d }),
  draw1: Object.freeze({ d2: 0x13dca0, at: 0x22, addL: 0xf600f800, d3: 0x0a40, pal: 0x3d }),
  draw2: Object.freeze({ d2: 0x13dde4, at: 0x42, addL: 0xf600f800, d3: 0x0a40, pal: 0x5d }),
  // $26E17A..$26E1A5 -- the two SHADOW positions, each `move.l ($2,A6),D0`, ONE `addi.l`, and one
  // `add.w` of that shadow's own trail word INTO THE HIGH HALF.  The biases differ by $00010000.
  shadowA: Object.freeze({ at: 0x22, bias: 0xf6fff800, trail: 0x26 }),
  shadowB: Object.freeze({ at: 0x42, bias: 0xf7000800, trail: 0x46 }),
  trailStep: 0x40,
});

// `AimTables` reads five ROM tables and CHECKS two of them, so it must not be rebuilt per frame.
// Keyed on the ROM object, exactly as `handlers.js` does it.
const AIM_TABLES = new WeakMap();
function aimTables(rom) {
  let t = AIM_TABLES.get(rom);
  if (!t) { t = new AimTables(rom); AIM_TABLES.set(rom, t); }
  return t;
}

const sb = (v) => ((v & 0xff) << 24) >> 24;      // the signed byte a `cmp.b` compares

// ============================================================== THE DRAWS ($26E1E8..$26E273, $8C)
//
// Part 0 is drawn TWICE, from two sprite blocks with two different D3 extents, and the SECOND
// RE-READS `($2,A6)` rather than continuing from the first ($26E214 `move.l ($2,A6),D1`).  Part 0's
// first bias is TWO sequential long operations -- `subi.l #$0E000000` then `addi.l #$F000E600` --
// which DO combine exactly to `+$E200E600`; transcribed as two anyway, so the port matches the
// listing line for line.  D4 is the PALETTE byte in all four calls.

/** `$26E1E8..$26E22F` -- part 0, both of its sprite blocks. */
function draw44Part0(ram, rom, a6) {
  let d1 = u32(ram.u32(a6 + 0x02) - T44.draw0a.subL);       // $26E1F2 subi.l #$0E000000
  d1 = u32(d1 + T44.draw0a.addL);                           // $26E1F8 addi.l #$F000E600
  enqueueRegistersThroughStub(ram, rom, T44.drawStub, d1, T44.draw0a.d2, T44.draw0a.d3,
    ram.u8(a6 + T44.draw0a.pal));                           // $26E204/$26E208
  const d1b = u32(ram.u32(a6 + 0x02) + T44.draw0b.addL);    // $26E214/$26E218 -- RE-READ, not chained
  enqueueRegistersThroughStub(ram, rom, T44.drawStub, d1b, T44.draw0b.d2, T44.draw0b.d3,
    ram.u8(a6 + T44.draw0b.pal));                           // $26E224/$26E228
}

/** `$26E230..$26E251` -- part 1, off the SHADOW position `($22,A6)`. */
function draw44Part1(ram, rom, a6) {
  enqueueRegistersThroughStub(ram, rom, T44.drawStub,
    u32(ram.u32(a6 + T44.draw1.at) + T44.draw1.addL),       // $26E236/$26E23A
    T44.draw1.d2, T44.draw1.d3, ram.u8(a6 + T44.draw1.pal));
}

/** `$26E252..$26E273` -- part 2, off `($42,A6)`.  Same bias and extent as part 1, other block. */
function draw44Part2(ram, rom, a6) {
  enqueueRegistersThroughStub(ram, rom, T44.drawStub,
    u32(ram.u32(a6 + T44.draw2.at) + T44.draw2.addL),       // $26E258/$26E25C
    T44.draw2.d2, T44.draw2.d3, ram.u8(a6 + T44.draw2.pal));
}

/** `$26E1DA..$26E1E7` -- the three `bsr.w`s every path ends on, the frozen one included. */
function draw44(ram, rom, a6) {
  draw44Part0(ram, rom, a6);                                // $26E1DA
  draw44Part1(ram, rom, a6);                                // $26E1DE
  draw44Part2(ram, rom, a6);                                // $26E1E2
}

// ================================================== THE ANIM STATE MACHINE ($26E274.., $12 + $1C)

/** `$26E274` -- set the anim state and reset its inner phase, but ONLY on a change. */
export function setAnimState26E274(ram, a6, d0) {
  if (ram.u16(a6 + T44.animAt) === u16(d0)) return;         // $26E274 cmp.w ($66,A6),D0 / beq
  ram.setU16(a6 + T44.animAt, u16(d0));                     // $26E27C
  ram.setU16(a6 + T44.animSub, 0);                          // $26E280 clr.w ($68,A6)
}

/** `$26E7C4` -- state 3, THE DEATH DRIFT.  One word literal is the whole vector: `$0480` is speed
 *  `$04` at `($1A,A6)` and heading `$80` at `($1B,A6)`. */
function animState3_26E7C4(ram, a6) {
  if (ram.u16(a6 + T44.animSub) !== 0) return;              // $26E7C4 cmpi.w #$0,($68,A6) / bne
  ram.setU8(a6 + 0x1a, 0x04);                               // $26E7CE move.w #$480,($1A,A6)
  ram.setU8(a6 + 0x1b, 0x80);                               //   ...TWO byte fields, ONE literal
}

/** `$26E7D6` -- state 4, THE FLY-AWAY, and the SECOND writer of `($BE,A6)`.  `$0C40` and `$0CC0` are
 *  speed `$0C` with heading `$40` or `$C0`: the wreck leaves towards whichever side it is already on
 *  and retires when it passes either wall.  All three tests are SIGNED words. */
function animState4_26E7D6(ram, a6) {
  if (ram.u16(a6 + T44.animSub) === 0) {                    // $26E7D6 cmpi.w #$0,($68,A6) / bne
    ram.setU8(a6 + 0x1a, 0x0c);                             // $26E7E0 move.w #$C40,($1A,A6)
    ram.setU8(a6 + 0x1b, 0x40);
    if (i16(ram.u16(a6 + 0x04)) <= 0x1c00) {                // $26E7E6 cmpi.w #$1C00 / bgt
      ram.setU8(a6 + 0x1a, 0x0c);                           // $26E7F0 move.w #$CC0,($1A,A6)
      ram.setU8(a6 + 0x1b, 0xc0);
    }
  }
  if (i16(ram.u16(a6 + 0x04)) >= 0x5400) {                  // $26E7F6 cmpi.w #$5400 / blt
    ram.setU8(a6 + T44.retireFlag, 1);                      // $26E800
  }
  if (i16(ram.u16(a6 + 0x04)) <= i16(0xe400)) {             // $26E806 cmpi.w #$E400 / bgt -- SIGNED
    ram.setU8(a6 + T44.retireFlag, 1);                      // $26E810
  }
}

/** `$26E3A0..$26E3B8` (and the byte-identical walks at `$26E50A` and `$26E614`): a `$FFFF`-terminated
 *  table of (threshold, value) WORD PAIRS.  The loop's only exit besides the terminator is a SIGNED
 *  `bgt`, and the value is written on the first row the argument does not exceed. */
function thresholdWalk(rom, table, d0, store) {
  for (let at = table; ; at += 4) {
    const d1 = rom.u16(at);                                 // $26E3A6 move.w (A4)+,D1
    if (d1 === 0xffff) return;                              // $26E3A8 cmpi.w #-$1 / beq
    const d2 = rom.u16(at + 2);                             // $26E3B0 move.w (A4)+,D2
    if (i16(d0) <= i16(d1)) { store(d2 & 0xff); return; }   // $26E3B2 cmp.w D1,D0 / bgt
  }
}

/** `$26E3BA..$26E3D8` -- one step per frame towards a target, on a SIGNED BYTE compare. */
function rampByte(ram, at, target) {
  const d1 = sb(ram.u8(at));                                // $26E3BA move.b ($1A,A6),D1
  const d2 = sb(target);                                    // $26E3BE move.b ($72,A6),D2
  if (d2 === d1) return;                                    // $26E3C2 cmp.b D1,D2 / beq
  ram.setU8(at, (ram.u8(at) + (d2 > d1 ? 1 : -1)) & 0xff);  // $26E3D4 addq.b / $26E3CC subq.b
}

/** `$26E318..$26E3D9` -- state 0, THE WANDER.  Picks one of NINE waypoints at random, aims at it,
 *  advances the cursor once the distance closes inside `$80`, and ramps `($1A,A6)` one step a frame
 *  towards the speed the distance table selects.  `$26E38A cmpi.w #$24,($6A,A6)` is what bounds the
 *  table: nine 4-byte rows. */
function animState0_26E318(ram, rom, a6) {
  if (ram.u16(a6 + T44.animSub) === 0) {                    // $26E318
    const rnd = drawWord242EC2(ram, rom);                   // $26E322 jsr $242EC2
    ram.setU16(a6 + T44.state0Cursor, u16((rnd & 7) * 4));  // $26E328 andi.w #$7 / add / add
    ram.setU16(a6 + T44.animSub, 1);                        // $26E334
  }
  const cur = ram.u16(a6 + T44.state0Cursor);
  if (cur >= T44.waypointBytes) {
    unreached(0x26e340, `type $44's waypoint cursor ($6A,A6) is $${cur.toString(16)}, past the NINE `
      + 'rows at $26E3DA; $26E38A\'s cmpi.w #$24 is the only thing that bounds it');
  }
  const wp = T44.waypoints + cur;                           // $26E33A/$26E340 adda.w ($6A,A6),A0
  const tgtY = rom.u16(wp);                                 // $26E34A movem.w (A0),D2-D3
  const tgtX = u16(rom.u16(wp + 2) - ram.u16(T44.scroll));  // $26E34E sub.w $813172,D3
  ram.setU8(a6 + 0x1b,                                      // $26E35A move.b D1,($1B,A6)
    aim256(aimTables(rom), ram.u16(a6 + 0x02), ram.u16(a6 + 0x04), tgtY, tgtX) & 0xff);
  // $26E35E..$26E37C -- the SAME lea/adda/movem/sub a second time, for the DISTANCE.  Re-read rather
  // than reused, because the ROM re-reads and because $2422A2 is free to clobber D2/D3.
  const d0 = dist242494(ram.u16(a6 + 0x02), ram.u16(a6 + 0x04),
    rom.u16(wp), u16(rom.u16(wp + 2) - ram.u16(T44.scroll)));          // $26E378 jsr $24249A
  if (i16(d0) <= T44.state0Range) {                         // $26E37E cmpi.w #$80,D0 / bgt
    const next = u16(cur + 4);                              // $26E386 addq.w #$4,($6A,A6)
    ram.setU16(a6 + T44.state0Cursor, next);
    if (i16(next) >= T44.waypointBytes) ram.setU16(a6 + T44.state0Cursor, 0);  // $26E38A blt / clr
  }
  ram.setU8(a6 + T44.state0SpeedAt, T44.state0Default);     // $26E39A move.b #$5,($72,A6)
  thresholdWalk(rom, T44.state0Thresh, d0, (v) => ram.setU8(a6 + T44.state0SpeedAt, v));
  rampByte(ram, a6 + 0x1a, ram.u8(a6 + T44.state0SpeedAt)); // $26E3BA..$26E3D8
}

/** `$26E286` -- the anim dispatch.  Its tail is a `jmp $241E34`, not an `rts`: the object's motion is
 *  applied AFTER whichever state ran, on the same frame. */
function animDispatch26E286(ram, rom, a5, a6, ctx) {
  const state = ram.u16(a6 + T44.animAt);                   // $26E28C move.w ($66,A6),D0
  if (state >= T44.animStates) {
    unreached(0x26e296, `type $44's anim state ${state} indexes past the FIVE-entry table at `
      + '$26E2A2. $26E274 is the only writer of ($66,A6) and its five callers pass 0..4, so a '
      + 'sixth value cannot have come from the cartridge');
  }
  const entry = rom.u32(T44.animTable + u16(state * 4));    // $26E290..$26E296
  if (entry === 0x26e318) animState0_26E318(ram, rom, a6);
  else if (entry === 0x26e7c4) animState3_26E7C4(ram, a6);
  else if (entry === 0x26e7d6) animState4_26E7D6(ram, a6);
  else if (entry === 0x26e460 || entry === 0x26e588) {
    // COUNTED, not ported.  $26E460 + $C6 (the approach) and $26E588 + $1DA (the attack), plus their
    // two $62-byte threshold tables at $26E526 and $26E762.  Both are entered ONLY from the counted
    // fire driver ($26E9A0 moveq #$1 / $26E9B2 moveq #$2 -> $26E274), so a run that reaches this
    // line has already reached the fire-driver note.
    ctx.unported?.note(entry, `$${entry.toString(16).toUpperCase()} type $44 anim state ${state} -- `
      + `${entry === 0x26e460 ? 'the approach ($26E460 + $C6, table $26E526 + $62)'
        : 'the attack ($26E588 + $1DA, table $26E762 + $62)'} is READ but not transcribed. `
      + 'It is reachable only through the counted fire driver at $26E82E');
  } else {
    unreached(0x26e296, `type $44's anim table entry ${state} is $${entry.toString(16).toUpperCase()
    }, which is none of the five the cartridge holds ($26E318 $26E460 $26E588 $26E7C4 $26E7D6)`);
  }
  applyShotVelocity241E34(ram, ctx.tables, a6);             // $26E29A jmp $241E34
}

// ================================================================ THE FIRE DRIVER ($26E818/$26E824)

/** `$26E818` -- disable firing.  `$FFFF` is the value `$26E83C` tests to skip the whole dispatch. */
function disableFire26E818(ram, a6) {
  ram.setU16(a6 + T44.fireModeAt, T44.fireOff);             // $26E818 move.w #$FFFF,($86,A6)
  ram.setU16(a6 + T44.fireSubAt, 0);                        // $26E81E clr.w ($88,A6)
}

/** `$26E824` -- set a fire mode.  Called ONLY from the counted driver, at `$26E4D8` and `$26E730`. */
export function setFire26E824(ram, a6, d0) {
  ram.setU16(a6 + T44.fireModeAt, u16(d0));                 // $26E824
  ram.setU16(a6 + T44.fireSubAt, 0);                        // $26E828
}

/** `$26E82E` -- COUNTED.  A two-entry dispatch on `($86,A6)` off the table at `$26E850`, skipped
 *  entirely while that word is `$FFFF`.  Mode 0 (`$26E858 + $14E`) is a 23-iteration `dbra` ring
 *  through `$281764` off `$2736FA` plus five `$2817B8` shots off `$2735FA`; mode 1 (`$26E9A6 + $5A`)
 *  SPAWNS TYPE `$53` (`$26E9E2 moveq #$53,D0 / jsr $263684`) and hands it A6 as its parent.  Neither
 *  writes a byte either `$261100` push reads. */
function fireDriver26E82E(ram, a6, ctx) {
  const mode = ram.u16(a6 + T44.fireModeAt);                // $26E838 move.w ($86,A6),D0
  if (mode === T44.fireOff) return;                         // $26E83C cmpi.w #$FFFF / beq
  ctx.unported?.note(T44.fireDispatch, `$26E82E type $44's fire driver, mode ${mode} -- the dispatch `
    + '($26E82E + $22), its table ($26E850 + $8) and both modes ($26E858 + $14E, the 23-shot $281764 '
    + 'ring off $2736FA and the five $2817B8 shots off $2735FA; $26E9A6 + $5A, which spawns TYPE $53 '
    + 'through $263684) are READ but not transcribed. They set anim states 1 and 2; no byte either '
    + '$261100 push reads is theirs');
}

// ================================================ THE DEATH SEQUENCE ($26EA00..$26EB45, $146)
//
// Gated entirely on `($BF,A6)`, which `$26E13C` sets on the frame push #2 fires.  Three phases in
// `($A6,A6)`, tested 2, then 1, then 0 -- so a phase promoted this frame does NOT also run this
// frame: the `cmpi.b` that would catch it is already behind the cursor.
//
// It returns the 68000 CARRY (`$26EB3A andi.w #$FFFE,SR` clears it, `$26EB40 ori.w #$1,SR` sets it).
// Its ONLY caller is `$26E172 bsr.w $26EA00` and `$26E176` is another `bsr.w`, not a `Bcc`, so
// nothing in build B reads the flag.  Returned anyway.

function deathSequence26EA00(ram, rom, a6, ctx) {
  if (ram.u8(a6 + T44.deadFlag) === 0) return false;        // $26EA00 tst.b ($BF,A6) / beq $26EB3A
  armScreenClear243E02(ram, ctx, ram.u16(a6 + T44.hitMaskAt), 0x26ea0c);   // $26EA08/$26EA0C

  if (ram.u8(a6 + T44.deathPhaseAt) === 2) {                // $26EA12 cmpi.b #$2,($A6,A6)
    ram.setU8(a6 + T44.retireFlag, 1);                      // $26EA1C -- THE BRIDGE TO PUSH #1
    return true;                                            // $26EA22 bra.w $26EB40 -- carry SET
  }
  if (ram.u8(a6 + T44.deathPhaseAt) === 1) {                // $26EA26 cmpi.b #$1,($A6,A6)
    ram.setU8(a6 + T44.deathTickAt, u16(ram.u8(a6 + T44.deathTickAt) - 1) & 0xff);  // $26EA30 subq.b
    if (ram.u8(a6 + T44.deathTickAt) === 0) {               // $26EA34 bne -- fires AT ZERO
      const pos = ram.u32(a6 + 0x02);                       // $26EA38 move.l ($2,A6),D2
      walkDeathSpawns270D92(ram, rom, ctx, T44.deathListB, pos, 0x26ea42, T44.deathAnim);
      // $26EA48..$26EA93 -- the QUARTER-TURN PAIR, structurally identical to type $4C's $270014.
      // W402 CORRECTION: this said the two draw from DIFFERENT generators, "$242B3C here, $242EC2
      // there". They do not. $270036 and $27005C are both `4e b9 00 24 2b 3c`, the same six bytes
      // as this routine's own $26EA48 and $26EA6E and as stage 3's $26C83C/$26C862 -- SIX sites,
      // one generator. W401 fixed the code in handlers.js and left this sentence standing, which
      // is trap 14 exactly: a stale note's TEXT can be wrong.
      for (const [turn, bias] of T44.burstTurns) {
        const r = drawByte242B3C(ram, rom);                 // $26EA4A / $26EA70 jsr $242B3C
        bigBurst28B4BE(ram, rom, ctx, u32(pos + bias),      // $26EA5A / $26EA80 addi.l
          (((r << 1) & 0xff) + turn) & 0xff,                // $26EA4E asl.b #1 / addi.b #$40 or #$C0
          0, T44.burstBucket, 0x26ea68);                    // $26EA64 D0 = 0, $26EA60 D3 = $C
      }
      ctx.soundPost?.(T44.deathCueB);                       // $26EA94 jsr $28C310
      ram.setU8(a6 + T44.deathTickAt, T44.deathPhase1Tick); // $26EA9A move.b #$10,($A8,A6)
      ram.setU8(a6 + T44.deathPhaseAt, 2);                  // $26EAA0 move.b #$2,($A6,A6)
    }
  }
  if (ram.u8(a6 + T44.deathPhaseAt) !== 0) return false;    // $26EAA6 cmpi.b #$0,($A6,A6) / bne
  // $26EAB0 -- phase 0.  `subq.b`/`bcc` is the UNDERFLOW convention: it acts when the byte WAS zero.
  const tick = ram.u8(a6 + T44.deathTickAt);
  ram.setU8(a6 + T44.deathTickAt, u16(tick - 1) & 0xff);
  if (tick !== 0) return false;                             // $26EAB4 bcc.w $26EB3A
  ram.setU8(a6 + T44.deathTickAt, ram.u8(a6 + T44.deathReloadAt));   // $26EAB8 -- reload FROM +$A9
  ctx.soundPost?.(T44.deathCueA);                           // $26EABE jsr $28C274

  const cursor = ram.u16(a6 + T44.deathCursorAt);           // $26EACA adda.w ($AA,A6),A1
  if (cursor >= T44.deathListAEnd) {
    unreached(0x26eaca, `type $44's death cursor ($AA,A6) is $${cursor.toString(16)}, past the SIX `
      + '12-byte rows at $26EB46; $26EB16\'s cmpi.w #$48 is the only thing that bounds it');
  }
  const at = T44.deathListA + cursor;
  const d1 = rom.u16(at);                                   // $26EACE move.w (A1)+,D1
  const slot = spawnEffect(ram, ctx, rom.u16(at + 2), 0x26ead2);   // $26EAD0/$26EAD2 jsr $289004
  if (slot) {
    ram.setU8(slot + 0x1c, rom.u16(at + 4) & 0xff);         // $26EAD8/$26EADA
    ram.setU16(slot + 0x18, d1);                            // $26EADE
    ram.setU32(slot + 0x26, rom.u32(at + 6));               // $26EAE2 move.l (A1)+,($26,A0)
    ram.setU32(slot + 0x02, ram.u32(a6 + 0x02));            // $26EAE6
    ram.setU16(slot + 0x1e, T44.deathAnim);                 // $26EAEC move.w #$10,($1E,A0)
    ram.setU16(slot + 0x12, 0);                             // $26EAF2
    ram.setU16(slot + 0x14, 0);                             // $26EAF8
    ram.setU8(slot + 0x1a, ram.u8(a6 + 0x1a));              // $26EAFE
    ram.setU8(slot + 0x1b, (ram.u8(a6 + 0x1b) * 4) & 0xff); // $26EB04 add.b D0,D0 TWICE
  }
  const next = u16(cursor + T44.deathListAStride);          // $26EB10 addi.w #$C,($AA,A6)
  ram.setU16(a6 + T44.deathCursorAt, next);
  if (next !== T44.deathListAEnd) return false;             // $26EB16 cmpi.w #$48 / bne
  ram.setU16(a6 + T44.deathCursorAt, 0);                    // $26EB20
  const loops = u16(ram.u16(a6 + T44.deathLoopAt) - 1);     // $26EB26 subq.w #1,($AC,A6)
  ram.setU16(a6 + T44.deathLoopAt, loops);
  if (loops !== 0) return false;                            // $26EB2A bne
  ram.setU8(a6 + T44.deathTickAt, T44.deathReload >> 8);    // $26EB2E move.w #$1006,($A8,A6)
  ram.setU8(a6 + T44.deathReloadAt, T44.deathReload & 0xff);   //  ...TWO byte fields, ONE literal
  ram.setU8(a6 + T44.deathPhaseAt, 1);                      // $26EB34
  return false;
}

// ======================================================================= THE HANDLER ($26E02A)

/**
 * `$26E02A` -- one frame of type $44.
 *
 * The order below is the listing's.  Three things a reader drops and all three are load-bearing:
 * the frozen path still DRAWS; the `($BE,A6)` retire is tested before anything else and is the only
 * path that frees the record; and the clock trigger writes `($17,A5)`, the same byte the damage arm
 * reads, so arming the fly-away makes this object immortal by construction.
 */
export function handler44(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  if (ram.u16(T44.freeze) !== 0) { draw44(ram, rom, a6); return; }   // $26E02A tst.w $8130D2 / bne

  // ---- PUSH #1: the retire.  Reached from the death sequence's phase 2 AND from anim state 4.
  if (ram.u8(a6 + T44.retireFlag) !== 0) {                  // $26E034 tst.b ($BE,A6) / beq
    ram.setU16(T44.elemGate, 0);                            // $26E03C -- release the bg elements
    pushExternalSpeed(ram, T44.scrollPush, T44.scrollPush); // $26E044..$26E04C jsr $261100
    freeEnemy(ram, a5);                                     // $26E052 jmp $263762
    return;
  }

  // ---- $26E05A: the ODOMETER trigger.  Three tests, all `bne` to the SAME target, so they are an
  // AND.  `$E0` is the exact clock of stage 5's own `SPEED $0020` record at $261E14, which is why
  // the fly-away and the script agree without either knowing about the other.
  if (ram.u8(a5 + T44.stateAt) === 0 && ram.u8(a6 + T44.deadFlag) === 0
      && ram.u16(T44.clock) === T44.retireClock) {
    ram.setU8(a5 + T44.stateAt, 1);                         // $26E076 -- ALSO closes the damage arm
    disableFire26E818(ram, a6);                             // $26E07C bsr.w $26E818
    setAnimState26E274(ram, a6, T44.animFly);               // $26E080 moveq #$4 / bsr $26E274
  }

  // ---- $26E086: the damage fold, over three parts.
  const d1 = (ram.u8(a6 + T44.parts[0]) | ram.u8(a6 + T44.parts[1]) | ram.u8(a6 + T44.parts[2]))
    & T44.damageMask;                                       // $26E086..$26E090 andi.w #$5C,D1
  let restorePalette = false;
  if (d1 === 0) {
    restorePalette = true;                                  // $26E094 beq.w $26E164
  } else {
    ram.setU16(a6 + T44.hitMaskAt, d1);                     // $26E098 -- read ONLY by $26EA08
    for (const p of T44.parts) {
      ram.setU8(a6 + p, ram.u8(a6 + p) & T44.damageClear);  // $26E0A0/$26E0A2/$26E0A6 and.b #$A3
    }
    scoreHit(ram, ctx, a6, d1);                             // $26E0AA jsr $286096
    for (const p of T44.parts) {                            // $26E0B0..$26E0D3 -- THE FLASH
      ram.setU8(a6 + p + T44.palAt, ram.u8(a6 + p + T44.palAt) ^ T44.palXor);
    }
    // $26E0D4..$26E101 -- D2 = MAX over the three parts of ($7FFF - hp), each a `sub.w` into a LONG
    // register whose high word stays zero, then compared as LONGS.
    let d2 = u16(T44.sinkFull - ram.u16(a6 + T44.parts[0] + T44.hpAt));   // $26E0D4/$26E0DA
    for (const p of [T44.parts[1], T44.parts[2]]) {
      const d3 = u16(T44.sinkFull - ram.u16(a6 + p + T44.hpAt));
      if (d2 < d3) d2 = d3;                                 // $26E0E8 cmp.l / bge SKIPS the move
    }
    for (const p of T44.parts) {
      ram.setU16(a6 + p + T44.hpAt, T44.sinkFull);          // $26E102..$26E111 -- RE-ARM all three
    }
    if (ram.u8(a5 + T44.stateAt) === 0) {                   // $26E112 tst.b ($17,A5) / bne $26E172
      const pool = u32(ram.u32(a5 + T44.hpLong) - d2);      // $26E11A sub.l D2,($18,A5)
      ram.setU32(a5 + T44.hpLong, pool);
      if ((pool & 0x80000000) !== 0) {                      // $26E11E bpl.w $26E172
        // ---- PUSH #2: THE DEATH.
        for (const p of T44.parts) {
          ram.setU16(a6 + p, T44.deadPartWord);             // $26E122/$26E126/$26E12C move.w #$8000
        }
        disableFire26E818(ram, a6);                         // $26E132 bsr.w $26E818
        setAnimState26E274(ram, a6, T44.animDeath);         // $26E136 moveq #$3 / bsr $26E274
        ram.setU8(a6 + T44.deadFlag, 1);                    // $26E13C -- arms $26EA00
        ram.setU16(T44.elemGate, 0);                        // $26E142 -- release the bg elements
        pushExternalSpeed(ram, T44.scrollPush, T44.scrollPush);   // $26E14A..$26E152 jsr $261100
        // $26E158/$26E15E -- `lea ($26EBDA,PC),A0 / jsr $246520`.  The 14-byte script is a count
        // word (1) then ONE 12-byte node, and it is BYTE FOR BYTE type $4C's at $2701C8 (W341's
        // window): family $0000, offset $0480, target $00225238, $001F words, timing $0009.
        loadAnimObjects246520(ram, rom, T44.animScript);
        restorePalette = true;                              // ...and FALL THROUGH into $26E164
      }
    }
  }
  if (restorePalette) {
    for (const p of T44.parts) {
      ram.setU8(a6 + p + T44.palAt, T44.palRestore);        // $26E164 moveq #$12 -> +$1D/+$3D/+$5D
    }
  }

  // ---- $26E172 onward: every surviving path, in the listing's order.
  deathSequence26EA00(ram, rom, a6, ctx);                   // $26E172 bsr.w $26EA00 (carry unread)
  animDispatch26E286(ram, rom, a5, a6, ctx);                // $26E176 bsr.w $26E286

  // $26E17A..$26E1A5 -- the two SHADOW positions, recomputed from the live one every frame.  Each is
  // `move.l ($2,A6),D0` + ONE `addi.l` + `add.w <trail>,(+$22 or +$42)`, and that `add.w` lands on
  // the WORD at that offset, which is the HIGH half of the long just stored there.
  const pos = ram.u32(a6 + 0x02);                           // $26E17A
  for (const s of [T44.shadowA, T44.shadowB]) {
    const base = u32(pos + s.bias);                         // $26E182 / $26E196 addi.l
    const hi = u16(u16(base >>> 16) + ram.u16(a6 + s.trail));   // $26E18E / $26E1A2 add.w
    ram.setU32(a6 + s.at, u32((hi * 0x10000) + (base & 0xffff)));
  }
  fireDriver26E82E(ram, a6, ctx);                           // $26E1A6 bsr.w $26E82E
  // $26E1AA..$26E1D9 -- both trail words decay by $40 a frame and CLAMP at zero.  `subi.w` then
  // `bgt`, so a value that lands exactly on zero is clamped by the store, not by the branch.
  for (const s of [T44.shadowA, T44.shadowB]) {
    if (ram.u16(a6 + s.trail) === 0) continue;              // $26E1AA / $26E1C2 tst.w / beq
    const next = u16(ram.u16(a6 + s.trail) - T44.trailStep);
    ram.setU16(a6 + s.trail, next);                         // $26E1B2 / $26E1CA subi.w #$40
    if (i16(next) <= 0) ram.setU16(a6 + s.trail, 0);        // $26E1B8 / $26E1D0 bgt / move.w #$0
  }
  draw44(ram, rom, a6);                                     // $26E1DA
}
