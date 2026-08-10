// THE PORTED ENEMY HANDLERS.  TEN addresses for ELEVEN of stage 1's types.
//
//   W25:  `$2688CC` ($11), `$26A2E2` ($07/$27), `$2747C6` ($82),
//         `$269CEA` ($05), `$27687E` ($8B), `$268232` ($10)
//   W30:  `$275914` ($85 AND $86 -- one handler, two types, exactly as $07 and
//         $27 share `$26A2E2`), `$2739C0` ($80), `$276702` ($8A)
//   W31:  `$26B6FA` ($0D, THE MIDBOSS) -- in src/midboss.js, not this file
//   W170: `$2779B6` ($95), the first stage-2-only handler
//   W171: `$276A02` ($8D), the next stage-2 handler
//   W172: `$2775CC` ($8F), the 32-heading aimed-firing stage-2 handler
//
// The enemy driver `$263502` (src/enemies.js) dispatches each live enemy's
// handler from the function pointer the init stored at record `+$4C`.
//
// **W30's THREE WERE GATE BLOCKERS, in that order.**  W29 wired the enemy
// subsystem into the frame loop and `fly-around` stopped after 345 frames with
// `Unreached $275914`; porting each one moved the block point to the next.  The
// The fourth was the MIDBOSS `$26B6FA`, and W31 ported it (src/midboss.js).
//
// COVERAGE, as table entries rather than frames, MEASURED this wave by walking
// the stage-1 script `$230C6C..$231703` (339 records of 8 bytes, the type at
// record +$4) and resolving each type through `$267824`/`$27E412`:
//   **9 of the 19 distinct handlers, owning 288 of the 339 spawn records.**
// The other 10 handlers own 51 records and every one of them throws by address.
// W25's headline was 6 handlers / 270 records; W30 adds 3 and 18.
//
// ======================= WHAT A HANDLER IS, IN THIS PORT =====================
//
// A handler runs ONCE PER FRAME per live enemy.  Its first instruction is
// `jsr $2638A6` (stepMovement, W24) -- the per-frame movement interpreter that
// advances position from the movement-script stream.  The rest is bespoke
// per-type logic: an on-screen bounds test (free on exit), a damage/hit branch
// (palette flash + `$286096` DAMAGE), a freeze gate (`$8130d2`), a heading->
// sprite table lookup, a fire-cooldown counter, the aim (`$2420xx`, W20) +
// slew (`$242190`, W20), and its DRAW: an INDIRECT `jsr (A0)`/`jmp (A0)` through
// a function pointer the init stored at record `+$2A`/`+$2E`, which is a SPRITE
// ENQUEUE STUB out of `$267F70` (src/spritequeue.js 1c) -- W30 corrected that;
// this comment used to call it a "$23Dxxx fire-action -> $281xxx bullet fan"
// and it is neither.  The FIRE is a direct `jsr $281xxx` in the handler body.
//
// ===================== WHAT IS FAITHFULLY PORTED (W25 + W30) =================
//
// The structure of all NINE handlers, each re-derived from maincpu.bin with
// capstone (NOT prior art -- the fall-through trap is live: two of W25's start
// BEFORE their table address via a shared death-sequence prologue, two share
// one prologue, and all three of W30's are followed within eight bytes by the
// NEXT type's init stub).  Cited by ROM address on every non-obvious line.
// Working parts:
//   * `jsr $2638A6` stepMovement (W24) -- position, the done-when column
//   * the on-screen bounds test + `jmp $263762` free (self-contained)
//   * the freeze gate `$8130d2` (self-contained)
//   * the heading->sprite table lookups (ROM reads)
//   * the fire-cooldown counters (self-contained state on the record)
//   * the onscreen tests `$242684` and `$2426A4` (ported, self-contained)
//   * the fire-gate `$267FC6` -- PORTED IN FULL BY W30.  It was a deferred
//     counted note from W25b (whose predecessor had invented a $804000 RNG
//     read) until this wave gave it a faithful consumer.
//   * the SPRITE ENQUEUES through `+$2A`/`+$2E` and through `$27829C`, resolved
//     to a bucket by reading the stub out of the cartridge (W30)
//   * the FIRES: `$2813F0` ($85), `$281402` ($11), `$2817A8`/`$2817B8`/`$281484`
//     ($80) -- all through W21's generators into W26's live pool
//
// ===================== WHAT NOTES (never a silent return) ===================
//
// These subsystems run every frame on every live enemy, so they NOTE (counted,
// never throw -- the unported.js convention) rather than halt the driver:
//   * `$286096` DAMAGE -- W28 (HP/hitbox; the hit-reaction displacement W24's
//     F6 isolated)
//   * `$28615E` (effect/score, 87 callers), `$289004` (sprite-EFFECT allocator,
//     294 callers), `$289AF4`, `$28C25A`/`$274`/`$2A8`/`$2DC` (death effects)
//   * `$28AC72` (types `$82`, `$85`, `$80`) -- W173's SUB-RECORD spawn engine,
//     a ten-slot pool at `$81DB90` whose driver is `$28AD70`
//   * `$27F8EE` (type `$8B`) and `$27F92A` (type `$8A`) -- **IMPACT POOL A's
//     RESERVED TEN**, not the item family.  [M] W60 re-read `$27F936 lea
//     $817DC6,A0 / move.w #$9,D7`: `$8171BE + 70*$2C == $817DC6`, so those
//     ten slots sit one past pool A's hundred (`50-recon-effects` §1.1).
//     Recon 59 §0 caught this file filing them under the ITEM pools twice;
//     both notes are corrected.
//   * `$27E812` (types `$85`/`$86` death) -- THE ITEM allocator, and the one
//     that really is the `$816B7A` family: six pools, 25 slots of `$40`,
//     driven by type-5 call #18 `$27E99E`.  Wave I2.
// The fire/state machines of `$10`, `$82` and `$05`/`$07` are still whole-block
// notes: W30 wired `$11`, `$85` and `$80` and did NOT touch those three.
// The fields those routines would have written (HP after a hit, spawned
// effect/bullet records) are EXCLUDED from the compared set BY NAME.  The
// position column (`$2/$4,A6`) is untouched by any of them -- it is the
// verified done-when column (W24 proved it for one mover; W25 generalised the
// proof to six types through the real per-frame dispatch, W30 to nine).

import { unreached } from './unported.js';
import { u16, i16 } from './ram.js';
import { freeEnemy } from './initbody.js';
import { handlerBoss292902 } from './boss.js';
import { handlerBoss297398 } from './boss2.js';
import { handlerBoss29BE28 } from './boss3.js';
import { handler99_29E6B0 } from './boss3type99.js';
import { handler1E_296DD6 } from './bossf23.js';
import { stepMovement, scrollCompensate, applyVelocity } from './movement.js';
import { fire as fireBulletFan, WriteLog } from './bullets.js';
import { AimTables, AIM, aim64, aim256, aim64FromCaller, aim64AtTarget,
  aim64TurnStore, slew64, targetSelect } from './aim.js';
import { enqueueDeferred, DEFQ_D1 } from './spawn.js';
import { enqueueRequest, enqueueRegisters, enqueueThroughStub,
  enqueueRegistersThroughStub, enqueueZoomedThroughStub,
  EMIT_TABLE } from './spritequeue.js';
import { armScreenClear, armScreenClear243E02, handlerMidboss } from './midboss.js';
import { scoreHit, scoreKill } from './score.js';
import { spawnEffect, spawnPoolC289B50, remapBucket, REMAP, B } from './effects.js';
import { spawnItem } from './items.js';
import { allocBee27F92A } from './bee.js';
import { drawByte242B3C, drawByte2431F4, drawSigned242FFC,
  drawWord242EC2 } from './rng.js';
import { spawnCues28AC72, spawnCues28AC86 } from './cues.js';
import { loadAnimObjects246410 } from './animobjects.js';
import { handler12, handler13, handler14 } from './stage3carrier.js';
import { handler15, handler17, handler18 } from './stage3drop.js';
import { handler83 } from './stage3type83.js';
import { handler16 } from './stage3type16.js';

/** `addi.l` -- a 32-bit add, where the low half's carry REACHES the high half.
 *  Named because the port also has `addi.w` pairs around a `swap`, which do
 *  not, and confusing the two is a one-character bug in a coordinate. */
const u32 = (v) => (v >>> 0) % 0x100000000;

// ----------------------------------------------------------- record offsets
// A5 = enemy record, A6 = sub-record (= +$6,A5).  Named once so each handler
// reads as the listing does.
const R = {
  onScreen: 0x16, cooldown: 0x18, cooldownReload: 0x19, deathFlag: 0x20,
  sprite22: 0x22, hpReload: 0x26, fireCtr: 0x28,
  facing: 0x33, pal34: 0x34, palCycle: 0x35,
  handler: 0x4c, runLen: 0x04, movement: 0x12, flags: 0x02, classByte: 0x0d,
  subRec: 0x06,
  // W30, for `$275914`.  The SAME BYTES the names above cover, named again for
  // the type that uses them differently -- `($20,A5)` is `deathFlag` in $10/$11
  // and a SALVO COUNTER in $85, `($22,A5)` is a sprite scratch in $82 and an
  // AIM CADENCE in $85.  One name per meaning, so a reader is never told a byte
  // is a death flag while it is being decremented as a counter.
  rec17: 0x17, rec18: 0x18, rec19: 0x19,
  rec1A: 0x1a, rec1B: 0x1b, rec1C: 0x1c, rec1D: 0x1d, rec1E: 0x1e,
  rec1F: 0x1f, rec20: 0x20, rec21: 0x21, rec22: 0x22, rec23: 0x23,
  rec24: 0x24, rec25: 0x25, rec26: 0x26, rec27: 0x27,
  rec30: 0x30, rec32: 0x32, rec34: 0x34, rec36: 0x36, rec38: 0x38,
  rec3A: 0x3a, rec3C: 0x3c, rec3E: 0x3e,
  salvo: 0x20, cadence22: 0x22,
  // W30: the SPRITE-EMITTER pair the init copies out of `$267F70` -- a RECORD-
  // convention stub and a REGISTER-convention one.  They were called
  // `fireAct2A`/`fireAct2E` and labelled as bullet fire-actions; every longword
  // in that table is a member of the `$23D762` enqueue family (see
  // src/spritequeue.js §1c).  Renamed so the mislabel cannot come back.
  emitRec2A: 0x2a, emitReg2E: 0x2e,
  // W33, for `$272AAC` (types $20/$21/$23).  The SAME bytes named again for
  // the type that uses them differently, per this block's own rule: ($16,A5)
  // is `onScreen` (a BYTE flag) for $10/$11 and here is a WORD holding the
  // TYPE THIS CARRIER SPAWNS; ($18,A5) is `cooldown` elsewhere and here is the
  // salvo COUNT; ($1A,A5)/($1B,A5) are the spawn cooldown and its reload.
  // All four are written by the init body out of the movement stream.
  carrySpawnType: 0x16, carrySalvo: 0x18, carrySalvoCtr: 0x19,
  carryCooldown: 0x1a, carryReload: 0x1b,
  // W36, for `$2697F6` (type $31).  Same bytes, third meaning, named again per
  // this block's own rule: ($16,A5) is `onScreen` for $10/$11 and the SPAWN
  // TYPE for the carrier; here it is the ANIMATION PHASE (0/1/2), tested as a
  // WORD.  ($1A,A5) is the carrier's spawn cooldown and here is the byte
  // CURSOR into the $26990E frame table, also a word.
  animPhase: 0x16, animCursor: 0x1a,
  // W81, for `$2747C6` (type $82).  Same bytes, another meaning, named again
  // per this block's own rule: ($26,A5) is `hpReload` in $10/$11 and here is
  // the HEADING CADENCE ($2749B4); ($28,A5) is `fireCtr` in $10/$11 and here
  // holds the SPRITE LONGWORD out of $272DFA ($274A1C); ($2C,A5) is the stored
  // 64-direction FACING, and it is a WORD -- `$274A02 move.w ($2C,A5),D0` and
  // `$274A0C move.w D1,($2C,A5)` -- where $10/$11 keep theirs in the byte
  // ($33,A5).  src/initbody.js has read `rec28` by that name since W36.
  headCadence26: 0x26, rec28: 0x28, rec2A: 0x2a, rec2C: 0x2c,
};
// sub-record (A6)
const S = {
  flags: 0x00, posX: 0x02, posY: 0x04, hp: 0x18, speed: 0x1a, heading: 0x1b,
  palette: 0x1d, anim: 0x1e, f1f: 0x1f, sprite0a: 0x0a, f10: 0x10, f14: 0x14, f1c: 0x1c,
  f38: 0x38,   // W30: $275984/$275996 -- the HP FLOOR $275914 clamps against
};
// the globals the handlers read
const G = {
  freeze: 0x8130d2, scroll: 0x813172, rank98: 0x813098, stage: 0x813092,
  clock: 0x8130ce, midbossD8: 0x8130d8, aa: 0x8130aa, ba: 0x8130ba,
  bulletBias: 0x812950, pulseDA: 0x8130da,
  rank9E: 0x81309e,
  stage96: 0x813096, scrollClockOdo: 0x8130d0,
  mirror: 0x80390b, mirror2: 0x80390c,
  ca: 0x8130ca,   // W30: $275954 -- the gate that picks $85's palette index
  // W36: three more RANK/progress words the seven new handlers read, all of
  // them as `sub.w <word>,D0` against a literal reload.
  b4: 0x8130b4,   // $26A742 / $26A906 / $27626E / $276272
  b6: 0x8130b6,   // $27747A -- type $89's salvo reload
  bc: 0x8130bc,   // $276254 -- type $88's, and the only one shifted (lsr.w #2)
  // WAVE 44 -- A DEFECT, NOT AN ADDITION.  `G.b8` was ALREADY CITED TWICE in
  // type $80 (below, at $273BDA and $273D9A) and was never in this table, so
  // both sites evaluated `a5 + undefined` = NaN.  `Ram.#off`'s old bounds test
  // was `o < 0 || o >= size`, and NaN fails BOTH comparisons, so the read went
  // through and `DataView.getUint16(NaN)` returned offset ZERO -- i.e.
  // `$800000`, the head of the display list.  Type $80's salvo reload and its
  // second turret cadence have therefore been computed from a SPRITE RECORD's
  // first word since W30, silently, on every frame the handler ran.
  //
  // Found because wave 44 tightened that bounds test to `!(o >= 0 && o < size)`
  // and the page then stopped, loudly, at logic frame 2753 -- which is how this
  // project is supposed to work and is exactly `docs/knowledge/03`'s point.
  //
  // The address is the LISTING's, not the comment's:
  //   $273BDE  sub.w $8130B8.l,D0      (after move.w #$50,D0)
  //   $273D9E  sub.w $8130B8.l,D0      (after move.w #$30,D0)
  // `xref.py abs 8130b8` finds 18 readers in the image, $273BE0 and $273DA0
  // among them.  `src/initbody.js`'s own table has always had it.
  b8: 0x8130b8,   // $273BDE (type $80 salvo reload) / $273D9E (turret 2 cadence)
  freezeD4: 0x8130d4,
};
/** `$27327A` -- type $85/$86's 32-entry longword MUZZLE-VECTOR table, read at
 *  `$275ABC move.l (A4,D0.w),D3`.  Its window is declared by
 *  `tools/export-tables.py`; the extent ($80 bytes) is pinned from the data,
 *  not from the index expression alone -- see the W30 worklog §1.1. */
const MUZZLE_85 = 0x27327a;
/** `$268B1E` -- type $11's muzzle table, read at `$268AF2` with the index
 *  `((($33,A5)+2) & $3C) * 2`, so the ENTRIES ARE 8 BYTES APART and only the
 *  first longword of each is read.  Already inside W20's $268B10 window. */
const MUZZLE_11 = 0x268b1e;
// 16-direction sprite-pointer tables, by handler (ROM addresses, build B)
const SPRITE_TAB = {
  h11_main: 0x268b9e,   // $2689B6 lea (heading -> sub +$0A sprite)
  h11_fire: 0x268c9e,   // $268A4E lea (facing -> record +$22 sprite, post-slew)
  // W81.  TYPE $10's PAIR, and it is the SAME SHAPE ONE $100 LOWER.  `$26831E
  // lea ($268594,PC),A0` indexed by `(($1A,A6) & $3E) * 4` (+4 on the mirror
  // bit) is $268B9E's index instruction for instruction, and `$2683B6 lea
  // ($268694,PC),A0` indexed by `((($33,A5)+1) & $3E) * 2` is $268C9E's.
  // `tools/export-web.mjs` used to call $268594 "96 entries ... for a handler
  // that does not exist"; it is 64 + 32, and this is the handler.
  h10_main: 0x268594,   // $26831E lea (heading -> sub +$0A sprite),   64 entries
  h10_fire: 0x268694,   // $2683B6 lea (facing -> record +$22 sprite), 32 entries
};
/** `$268494` -- type $10's muzzle table, `((($33,A5)+1) & $3E) * 2`, FOUR bytes
 *  an entry.  Type $11's `$268B1E` is eight, and reading one as the other puts
 *  every bullet at half the offset. */
const MUZZLE_10 = 0x268494;

// ---------------------------------------------------- the loud-counted notes
//
// W34 REPLACED `noteDamage` WITH THE ROUTINE ITSELF.  It used to read
//
//     u?.note(0x286096, `DAMAGE $286096 (W28) ... -- HP/sub-hitbox columns
//                        excluded`);
//
// and `27-review.md` F4 found the test that checked it was matching the note's
// PROSE rather than its address.  It is now `scoreHit` (src/score.js), called
// with the same D1 the handler built, and the hit mask is a real argument
// rather than a sentence.
/** `moveq #$5C,D1 / and.b (A6),D1` -- the mask every handler's damage branch
 *  builds and hands to `$286096`.  Bit 4 is "P1 hit this" and bit 3 is "P2",
 *  which is how a kill lands in the right player's score. */
function hitMask(ram, a6) { return ram.u8(a6) & 0x5c; }
function noteEffect(u, addr, a5, what) {
  u?.note(addr, `effect $${addr.toString(16).toUpperCase()} (${what}) (W26) rec $${a5.toString(16)}`);
}

// =========================================================== WAVE 54 (E5b) ==
// THE DEATH EXPLOSION, WIRED.  `50-recon-effects` §2.1: **there is no shared
// spawner.**  Every death arm inlines `moveq #kind,D0 / jsr $289004` and then
// writes six to nine fields into the record the allocator returned, and [M]
// there are 327 such sites in the image.  So each arm below is its own
// transcription, out of its own listing, and the two helpers here exist only
// because two GROUPS of them are literally the same instructions at several
// addresses -- the same reason `damageFirstHead` is written once.
//
// **A0 MAY BE THE BIT BUCKET.**  `$289004` returns `$81C8B2` on a full pool and
// on an out-of-range kind, its closing `movem.l` deliberately does not restore
// A0, and no caller tests anything.  So every field write below may land in a
// slot nothing drives -- faithfully.  `spawnEffect` COUNTS that event
// (`src/effects.js`), which is the whole difference between this port and the
// leak W33 §4 describes.

/** `$268958` (type $11 hit), `$2682C0` (type $10's first zero) and `$2681DC`
 *  (type $10's death) -- THE SAME NINE INSTRUCTIONS at three addresses, each
 *  with its own kind and its own remap ROW:
 *
 *    move.l ($2,A6),($2,A0)          the dying object's POSITION
 *    moveq #$0,D0 / move.b ($1e,A6),D0
 *    move.w (A1,D0.w),($1e,A0)       the enemy's bucket, REMAPPED
 *    move.w #$1,($10,A0)             arm the $24179E scroll hook
 *    move.w #$FE00,($26,A0)          a one-shot UPWARD nudge
 *    move.w #$0,($12,A0)             <- and THIS is what arms the pool-D
 *    move.w #$0,($14,A0)                sub-spawn (`src/effects.js` §THE REFUSAL)
 *
 *  `move.b ($1e,A6)` takes the HIGH byte of the sub-record's `anim` word and
 *  uses it as a RAW BYTE OFFSET, which `remapBucket` range-checks. */
function effectArmNine(ram, rom, ctx, a6, kind, row, site) {
  const a0 = spawnEffect(ram, ctx, kind, site);
  ram.setU32(a0 + B.pos, ram.u32(a6 + 0x02));
  const d0 = ram.u8(a6 + 0x1e);
  ram.setU16(a0 + B.bucket, remapBucket(rom, row, d0, site));
  ram.setU16(a0 + B.hook, 1);
  ram.setU16(a0 + B.nudge, 0xfe00);
  ram.setU16(a0 + B.sub12, 0);
  ram.setU16(a0 + B.sub14, 0);
  return a0;
}

/** `$276916`, `$2767F4`, `$2774D6`, `$2762CC`, `$27630A`, `$27634E`, `$276394`
 *  -- the OTHER shared prologue: position, then the bucket remapped through
 *  `$278320` with a WORD index DOUBLED (`move.w ($1e,A6),D0 / add.w D0,D0`),
 *  not the byte offset the `$267Fxx` arms use.  Callers add their own tail. */
function effectArmShared278320(ram, rom, ctx, a6, kind, site) {
  const a0 = spawnEffect(ram, ctx, kind, site);
  ram.setU32(a0 + B.pos, ram.u32(a6 + 0x02));
  const d0 = u16(ram.u16(a6 + 0x1e) * 2);
  ram.setU16(a0 + B.bucket, remapBucket(rom, REMAP.shared278320, d0, site));
  return a0;
}

/** `$269D1C`, `$26A616`, `$26A882`, `$26AD4A` -- the DAMAGE-FIRST FAMILY's arm.
 *  No remap table at all: the bucket is the literal `#$10` (bucket 7) and the
 *  effect inherits the enemy's SPEED + 8 and its HEADING x 4, which is what
 *  makes the burst fly on the enemy's own vector. `($12,A0)` is NOT written, so
 *  `$289004`'s `$FFFF` stands and these never sub-spawn. */
function effectArmFamily(ram, rom, ctx, a6, kind, site) {
  const a0 = spawnEffect(ram, ctx, kind, site);
  ram.setU32(a0 + B.pos, ram.u32(a6 + 0x02));           // $269D24
  ram.setU8(a0 + B.speed, (ram.u8(a6 + 0x1a) + 8) & 0xff);  // $269D2A/$269D2E
  ram.setU8(a0 + B.angle, (ram.u8(a6 + 0x1b) * 4) & 0xff);  // $269D34..$269D3A
  ram.setU16(a0 + B.bucket, 0x10);                      // $269D40 move.w #$10
  void rom;
  return a0;
}
// W30 REMOVED `noteFireAction` and `noteFan`.  The first named the RECORD- and
// REGISTER-convention SPRITE EMITTERS at ($2A,A5)/($2E,A5) "indirect
// fire-actions -> the $281xxx bullet fans", which is what they are not; the
// second stood in for a fan that is now called.  Both are wired -- see
// `enqueueThroughStub` (src/spritequeue.js §1c) and `fireFan11` below.

// ----------------------------------------------------------- the fire WIRING
//
// The bullet POOL and the 19 GENERATORS are ported (W21) and the MOVER that
// drives the pool is ported (W26, src/mover.js).  The missing connection is the
// call from a handler's fire point into `fire()`.  `fireBullet` IS that wire:
// it runs a generator with the handler's D0-D5 and spawns into the live pool the
// mover then drives.  It is exported so W27 (the fire-action bodies $23Dxxx) and
// W29 (the frame-loop integration that calls `runHandler` + `runMover` per frame)
// can close the loop without re-deriving the pool context.
//
// WHAT IS AND IS NOT WIRED THIS WAVE.  The six handlers' fire is reached two
// ways, and only ONE is wirable without W27:
//
//   * DIRECT generator calls (re-derived from maincpu.bin this wave):
//       $82 `$2747C6`:  jsr $281708 (x4), jsr $281764 (x2), jsr $281484
//       $05/$07 `$269B3E`: jsr $2814AC
//     These set D0-D5 IN-HANDLER and call the generator straight -- no indirect
//     fire-action.  But each sits inside a fire STATE MACHINE (the $82 machine
//     $2747FA..: HP gate, $8130CA gate, aim256 $2422A2 -> stores the aim byte at
//     +$30/+-$31, THEN the fan).  The fan reads D1 from that stored aim byte, so
//     wiring the fan alone (with a stale/unset aim) would fire every bullet the
//     WRONG WAY.  The aim+gate machine is the W27 FIRING wave, so the direct
//     fans are left as `noteFan` here and `fireBullet` is provided for W27.
//
//   * INDIRECT fire-action `jsr (A0)` through +$2A/+-$2E -> a $23Dxxx routine
//     that sets D0-D5 and calls the $281xxx fan.  The $23Dxxx BODIES are W27
//     (every one is a per-bucket fire-action, ~1.7 KB).  Noted via
//     a counted note; not wirable at that wave.
//
// So: the pool, the generators, the mover and the wire `fireBullet` are all in
// place; the per-handler fire BODIES (aim + gates + $23Dxxx) are the W27 firing
// wave, and the per-frame call of handler+mover together is W29.  Nothing here
// is silently faked: every fire site names its ROM address and its blocker.
/**
 * Wire a generator fire into the live bullet pool.  `regs` is the D0-D5/A5 the
 * handler's fire point set up; `ctx.ram`/`ctx.rom` carry the pool + cartridge.
 * @returns the array of per-core results (slot/declined/dropped), in spawn order.
 */
export function fireBullet(ctx, entry, regs) {
  return fireBulletFan(ctx, entry, regs);
}

// ------------------------------------------ $267FC6: THE FIRE GATE (W30)
// PORTED THIS WAVE, and the deferral it replaces is worth stating: W25b
// demoted this to a counted note after finding the previous body had FABRICATED
// an RNG read at `$804000` that appears nowhere in the routine, and W26/W27
// left it deferred because "a faithful translation would have no faithful
// consumer".  W30 wires handler $11's fan, so it now has one -- and a gate that
// always says "fire" would invent every bullet it lets through.
//
// The whole routine, `$267FC6..$2680A0`, in order:
//   1. `$267FC6 move.w $813096,D0` -- used DIRECTLY AS A BYTE OFFSET into four
//      longword tables, so it steps by 4 and each table is 5 entries
//      ($242562..$2425B1, pinned from both ends: $242560 is the previous
//      routine's `rts`, $2425B2 is `48E7 C080`, code).  Rank ($813098) picks
//      $242576/$24259E for D2 and $242562/$24258A for D3.
//   2. `$268004`: a position-box test on ($2,A6).  `sub.w D2,D1 / swap D2 /
//      add.w D2,D1 / bcs` on the SHORT axis, then `swap D1` and the same with
//      D3 on the LONG axis.  Only the ADD's carry is tested.
//   3. `$268018`: the OCTAGONAL player distance, computed per player and only
//      for a player whose record word has bit 15 set, `$7FFF` otherwise; the
//      minimum of the two is compared against `$2680A2[$813092]`.
//   4. `$26809E cmp.w D4,D0 / rts` -- CARRY SET (do not fire) iff the nearest
//      live player is CLOSER than the stage's threshold.
const FG = {
  stageWord: 0x813096, boxD2: 0x242576, boxD2rank: 0x24259e,
  boxD3: 0x242562, boxD3rank: 0x24258a, thresh: 0x2680a2,
};

/** `$268018..$26804C` -- |dy|*3/4 and |dx|, then max + min/2. */
function octDistance(ram, a6, player) {
  const ty = ram.u16(player), tx = ram.u16(player + 2);   // $268024 movem.w
  let d0 = u16(ram.u16(a6 + 0x02) - ty);                  // $268032 sub.w D2,D0
  if ((d0 & 0x8000) !== 0) d0 = u16(-d0);                 // $268034 bpl / neg.w
  d0 = u16(d0 - (d0 >>> 2));                              // $26803A lsr.w #2 / sub.w
  let d1 = u16(ram.u16(a6 + 0x04) - tx);                  // $26803E sub.w D3,D1
  if ((d1 & 0x8000) !== 0) d1 = u16(-d1);                 // $268040 bpl / neg.w
  if (d0 < d1) { const t = d0; d0 = d1; d1 = t; }         // $268044 cmp/bcc/exg
  return u16(d0 + (d1 >>> 1));                            // $26804A lsr.w #1 / add.w
}

/** @returns {{carry:boolean}} carry SET = DO NOT FIRE. */
function fireGate267FC6(u, ram, rom, a5, a6) {
  void u; void a5;
  const off = ram.u16(FG.stageWord);                      // $267FC6
  const rank = ram.u16(G.rank98) !== 0;                   // $267FD2 / $267FEC
  const d2 = rom.u32((rank ? FG.boxD2rank : FG.boxD2) + off);  // $267FE2
  const d3 = rom.u32((rank ? FG.boxD3rank : FG.boxD3) + off);  // $267FFC
  const pos = ram.u32(a6 + 0x02);                         // $268004 move.l (A0),D1
  // $268006/$26800A -- only the ADD's carry is tested (`sub.w` first, `bcs` last).
  if (u16((pos & 0xffff) - (d2 & 0xffff)) + ((d2 >>> 16) & 0xffff) > 0xffff) {
    return { carry: true };                               // $26800C bcs $267FC4
  }
  if (u16((pos >>> 16) - (d3 & 0xffff)) + ((d3 >>> 16) & 0xffff) > 0xffff) {
    return { carry: true };                               // $268016 bcs $267FC4
  }
  return playerDist268018(ram, rom, a6);                   // falls into $268018
}

/**
 * `$268018..$2680A0` -- THE PLAYER-DISTANCE GATE, and it is its own entry.
 *
 * W36: `$267FC6` FALLS INTO it (there is no `bsr`), but `$27733E` and W36's
 * other consumers `jsr $268018` DIRECTLY -- `$2773BE` and `$277434` in type
 * `$89`, both followed by `bcs`.  So the block below is not an internal half of
 * the fire gate; it is a routine with its own callers, and factoring it out is
 * the fall-through trap read in the useful direction.
 *
 * `$7FFF` stands in for "that player is not alive", which is why a one-player
 * game does not make every enemy fire at the origin.
 *
 * @returns {{carry:boolean}} carry SET = the nearest LIVE player is CLOSER than
 *   the stage's threshold `$2680A2[$813092]`, i.e. DO NOT FIRE.
 */
function playerDist268018(ram, rom, a6) {
  let d4 = 0x7fff;                                        // $268018 move.w #$7fff
  if ((ram.u16(AIM.selP1) & 0x8000) !== 0)                // $26801C tst.w / bpl
    d4 = octDistance(ram, a6, AIM.selP1 + 2);             // $268024 $8103E8
  let d0 = 0x7fff;                                        // $268050
  if ((ram.u16(AIM.selP2) & 0x8000) !== 0)                // $268054 tst.w / bpl
    d0 = octDistance(ram, a6, AIM.selP2 + 2);             // $26805C $81044A
  if (d4 < d0) d0 = d4;                                   // $268086 cmp/bcc/move
  const th = rom.u16(FG.thresh + u16(ram.u16(G.stage) * 2)); // $26808C/$26809C
  return { carry: d0 < th };                              // $26809E cmp.w D4,D0
}

/**
 * `$2425B2..$242608` -- THE RANK-SELECTED POSITION-BOX TEST.  13 instructions,
 * and the ONLY routine W36 had to port that was not already in the tree.  Five
 * of the seven handlers gate their fire on it.
 *
 *   $2425B6 move.w $813096,D0        the stage word, used as a BYTE offset
 *   $2425BC lea $242562,A0 ; $2425C0 tst.w $813098 / bne -> lea $24258A   RANK
 *   $2425CE move.l (A0,D0.w),D0
 *   $2425D2 move.w ($2,A6),D1 / sub.w D0,D1 / swap D0 / add.w D0,D1
 *   $2425DC bcs $242604              <-- out, carry SET
 *   $2425DE ...the same with $242576/$24259E against ($4,A6); THAT add's carry
 *           is the result, because $242604 is the `movem` + `rts`.
 *
 * It is `$267FC6`'s first half written in the other order and against the same
 * four tables (W30's `$242560+$54` window already holds all four), and, exactly
 * as there, ONLY THE ADD'S CARRY IS TESTED -- never the subtract's.
 *
 * @returns {{carry:boolean}} carry SET = outside the box; every caller `bcs`
 *   past its fire.
 */
function boxTest2425B2(ram, rom, a6) {
  const off = ram.u16(FG.stageWord);                      // $2425B6 / $2425DE
  const rank = ram.u16(G.rank98) !== 0;                   // $2425C0 / $2425E8
  const pos = ram.u32(a6 + 0x02);                         // $2425D2 / $2425FA
  // FIRST: ($2,A6) -- the LONG axis -- against $242562 / $24258A.
  const dA = rom.u32((rank ? FG.boxD3rank : FG.boxD3) + off);   // $2425BC/$2425CA
  if (u16((pos >>> 16) - (dA & 0xffff)) + ((dA >>> 16) & 0xffff) > 0xffff) {
    return { carry: true };                               // $2425DC bcs $242604
  }
  // SECOND: ($4,A6) -- the SHORT axis -- against $242576 / $24259E.
  const dB = rom.u32((rank ? FG.boxD2rank : FG.boxD2) + off);   // $2425E4/$2425F2
  return { carry: u16((pos & 0xffff) - (dB & 0xffff))
    + ((dB >>> 16) & 0xffff) > 0xffff };                  // $242602 add.w -> rts
}

// ----------------------------------------------- $242684: the onscreen test
// `move.l $2(A6),D0 / addi.w #$1c00 / add.w $813172 / addi.w #$9000 / bcs /
//  swap / addi.w #$800 / addi.w #$8000 / rts` -- carry SET = OFF-screen.
function onScreen242684(ram, a6) {
  const pos = ram.u32(a6 + 0x02);                      // $242684 move.l $2(A6)
  let y = u16((pos & 0xffff) + 0x1c00);                // $242688 addi.w #$1c00
  y = u16(y + ram.u16(G.scroll));                      // $24268C add.w $813172
  if (u16(y) + 0x9000 > 0xffff) return true;           // $242696 bcs (Y off)
  let x = u16((pos >>> 16) + 0x800);                   // swap; $24269A addi.w #$800
  return u16(x) + 0x8000 > 0xffff;                     // carry = X off
}

// ---------------------------------------- $2426A4: the OTHER onscreen test
// The same eight instructions as `$242684` on a WIDER short axis, and it is a
// separate routine, not a parameter: `$2426A4` adds `#$1000`/`#$7000` where
// `$242684` adds `#$800`/`#$8000`.  READ PAST THE APPARENT START: its
// early-out `$2426B6 bcs.b $2426A2` branches BACKWARDS to `$242684`'s shared
// `rts`, so the two routines are physically interleaved and a reader who starts
// at `$2426A4` sees a branch to an address inside the routine before it.
//
//   2426A4: move.l $2(A6),D0 / addi.w #$1c00 / add.w $813172 / addi.w #$9000
//   2426B6: bcs $2426A2                       carry -> OFF-screen, return
//   2426B8: swap D0 / addi.w #$1000 / addi.w #$7000 / rts
//
// Returns true if OFF-screen (the 68000 returns that as CARRY SET).
function offScreen2426A4(ram, a6) {
  const pos = ram.u32(a6 + 0x02);                      // $2426A4 move.l $2(A6)
  let y = u16((pos & 0xffff) + 0x1c00);                // $2426A8 addi.w #$1c00
  y = u16(y + ram.u16(G.scroll));                      // $2426AC add.w $813172
  if (u16(y) + 0x9000 > 0xffff) return true;           // $2426B2/$2426B6 bcs
  const x = u16((pos >>> 16) + 0x1000);                // $2426B8 swap / $2426BA
  return u16(x) + 0x7000 > 0xffff;                     // $2426BE addi.w #$7000
}

// ------------------------------------------------- the aim tables, per ROM
// `$275914` calls the aim CORE `$24203E` directly (its target-select is inlined,
// not a `bsr $24270A`), and the core reads five ROM tables.  `AimTables` checks
// two of them against the instruction encodings in its constructor, so building
// it is a real read of the cartridge and must not happen 41 times a frame.  The
// cache is keyed on the ROM OBJECT, so it is a pure derivation of immutable
// input -- NOT per-Game mutable state, which `NOTES-replay.md` §2 forbids.
const AIM_TABLES = new WeakMap();
function aimTables(rom) {
  let t = AIM_TABLES.get(rom);
  if (!t) { t = new AimTables(rom); AIM_TABLES.set(rom, t); }
  return t;
}

// helper: $11-style on-screen bounds test (Y first, then X; the inlined variant
// at $2688D2).  Returns true if OFF-screen.
function bounds11(ram, a6) {
  const pos = ram.u32(a6 + 0x02);                      // $2688D2 move.l $2(A6)
  let y = u16(u16((pos & 0xffff) + 0xe00) + ram.u16(G.scroll)); // +$e00 + scroll
  if (u16(y) + 0xac00 > 0xffff) return true;           // $2688E0 addi.w #$ac00
  const x = u16((pos >>> 16) + 0x600);                 // $2688E8 addi.w #$600
  return u16(x) + 0x8400 > 0xffff;                     // $2688EC addi.w #$8400
}

// ============================================================ TYPE $11 (104)
// `$2688CC`.  The commonest stage-1 enemy: a script-mover that aims, turns and
// fires a kind-$D fan.  Its death sequence is the SHARED PROLOGUE at `$268844`
// (reached via `bmi $268844` from `$26892A`).  flow.py TRUE span
// `$268844..$268B1E` (730 B, 177 insns) -- reading only from the table addr
// `$2688CC` misses the entire death path.
function handler11(ram, rom, a5, ctx) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, tables, u)) return;   // $2688CC jsr $2638A6 (freed)
  // $2688D2..$268900: bounds test.  off + has-been-on-screen -> free.
  if (bounds11(ram, a6)) {                             // $2688F0 bcc $268900
    if (ram.u16(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; } // $2688F8
  } else {
    ram.setU16(a5 + R.onScreen, 1);                    // $268900
  }
  // $268906: damage/hit branch.  sub flags byte & $5C.
  if ((ram.u8(a6) & 0x5c) !== 0) {                     // $268908
    const d1 = hitMask(ram, a6);                       // $268906/$268908
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // $26890E andi.b #$a3
    const pc = ram.u8(a5 + R.palCycle);                // $268912
    ram.setU8(a6 + S.palette, ram.u8(a6 + S.palette) ^ pc); // $268916 eor.b
    scoreHit(ram, ctx, a6, d1);                        // $26891A jsr $286096 (W34)
    if ((ram.u16(a6 + S.hp) & 0x8000) !== 0) {         // $268920 tst.w $18 / $268924 bpl
      // ================================================================
      // W34.  THE TWO-STAGE DEATH, WHICH THIS PORT DID NOT HAVE.
      //
      // Until this wave the line here was `deathSeq11(...); return;`, i.e. the
      // port jumped straight to `$268844` the first time HP went negative.
      // The ROM does not:
      //
      //   $268926 tst.b ($20,A5) / $26892A bmi.w $268844   <- ONLY if already marked
      //   $26892E move.w ($26,A5),($18,A6)                 <- RELOAD the HP
      //   $268934 moveq #$8,D0 / $268936 jsr $28615E       <- score 8
      //   $26893C bset #$7,($20,A5)                        <- MARK it
      //   $268942 tst.w $815EA2 / bne $268990              <- one effect per frame
      //   $268988 bra.b $268990                            <- and FALL INTO THE FIRE
      //
      // So type $11 takes TWO trips to zero to die, scores 8 on the first and
      // $10 on the second, and KEEPS FIRING on the first.  The old code lost
      // all four facts.  It was invisible because nothing could reduce HP:
      // `$286096` was a note and this branch had never executed anywhere.
      // ================================================================
      if ((ram.u8(a5 + R.deathFlag) & 0x80) !== 0) {   // $268926/$26892A bmi $268844
        deathSeq11(ram, rom, a5, a6, ctx, d1);
        return;
      }
      ram.setU16(a6 + S.hp, ram.u16(a5 + R.hpReload)); // $26892E move.w ($26,A5)
      scoreKill(ram, rom, ctx, 0x08, d1);              // $268934/$268936
      ram.bset8(a5 + R.deathFlag, 7);                  // $26893C bset #$7,($20,A5)
      if (ram.u16(0x815ea2) === 0) {                   // $268942 tst.w / bne $268990
        ram.setU16(0x815ea2, 1);                       // $26894A move.w #$1
        // W54: SPAWNED, not noted.  $268952 moveq #$3 / $268954 lea
        // ($267FAC,PC),A1 -- the HIT row -- / $268958 jsr $289004, then
        // $26895E..$268982's seven field writes.
        effectArmNine(ram, rom, ctx, a6, 0x03, REMAP.hit267FAC, 0x268958);
      }
      // $268988 bra.b $268990 -- and on into the fire machine.
    }
  } else {
    ram.setU8(a6 + S.palette, ram.u8(a5 + R.pal34));   // $26898A
  }
  fire11(ram, rom, a5, a6, ctx);                       // $268990 (fall-through)
}

// ---- $268844: SHARED DEATH SEQUENCE (the prologue) ------------------------
function deathSeq11(ram, rom, a5, a6, ctx, d1) {
  const u = ctx.unported;
  scoreKill(ram, rom, ctx, 0x10, d1);                  // $268844/$268846
  // W54: SPAWNED.  $26884C moveq #$7 / $26884E lea ($267FA0,PC),A1 -- the
  // DEATH row -- / $268852 jsr $289004, then $268858..$268880's seven writes.
  const eff = effectArmNine(ram, rom, ctx, a6, 0x07, REMAP.death267FA0, 0x268852);
  // $268882..$268898 -- THE ONE-PER-FRAME CAP, and it is what makes type $11's
  // death effect DISARM its own sub-spawn.  `50-recon` §4.2's "every death arm
  // writes ($12) = 0" is true of the instruction at $26887C and not of the
  // record: when $815EA2 is ALREADY set this puts $FFFF straight back.
  if (ram.u16(0x815ea2) !== 0) {                       // $268882 tst.w / beq
    ram.setU16(eff + B.sub12, 0xffff);                 // $26888A move.w #$FFFF
  }
  ram.setU16(0x815ea2, 1);                             // $268890 move.w #$1
  ram.setU16(0x815ea4, u16(ram.u16(0x815ea4) + 1));    // $268898 addq.w #1
  // $26889E btst #0,$815EA5 -> beq skips $289AF4 when bit 0 is CLEAR, so $289AF4
  // is called only when the cap bit is SET (W25b F6 -- the note was unconditional
  // before; the cap test + spawn are W26-owned, the gating is faithful now).
  if ((ram.u8(0x815ea5) & 1) !== 0)                    // $26889E btst #0,$815EA5 (set -> call)
    noteEffect(u, 0x289af4, a5, 'D0=$4 secondary');    // $2688BA (ea5 bit 0 SET)
  ctx.soundPost?.(0x28c25a);                       // WAVE A: SFX id=0, death burst          // $2688C0
  freeEnemy(ram, a5);                                  // $2688C6 jmp $263762
}

// ---- $268990..$268B1A: fire / state machine -------------------------------
function fire11(ram, rom, a5, a6, ctx) {
  const u = ctx.unported;
  if (ram.u16(G.freeze) === 0) {                       // $268990 tst.w $8130D2
    const d7 = ram.u16(a6 + S.speed);                  // $268998 move.w $1a(A6)
    let d1 = (d7 & 0x3e) << 2;                         // $26899C/A0/A2 (x4)
    if ((d7 & 0x40) === 0 && (ram.u8(G.mirror) & 0x04) !== 0) // $2689A4/$2689AA
      d1 = u16(d1 + 4);                                // $2689B4 (mirror)
    ram.setU32(a6 + S.sprite0a, rom.u32(SPRITE_TAB.h11_main + d1)); // $2689BC
  }
  // ------------------------------------------------------------- W30.
  // $2689C2 `movea.l ($2A,A5),A0 / jsr (A0)` -- THE RECORD-CONVENTION SPRITE
  // EMITTER, not a fire-action.  ($2A,A5) and ($2E,A5) are the pair the init
  // copied out of `$267F70` (src/initbody.js `$268796`), and every longword in
  // that table is a member of the `$23D762` enqueue family.  Calling them
  // "indirect fire-actions -> the $281xxx bullet fans" -- as this file did
  // until W30 -- counted the enemies' DRAW as their FIRE.
  enqueueThroughStub(ram, rom, ram.u32(a5 + R.emitRec2A), a6);   // $2689C6
  if ((ram.u8(a5 + R.deathFlag) & 0x80) !== 0) {       // $2689C8 tst.b $20 / bmi
    if (ram.u16(G.mirror2) === 0) return;              // $2689CE tst.w / beq $268A0C
    // $2689D6..$268A08: the DEATH-ANIMATION emitter.  D1 = the position plus a
    // LONG bias ($2689DA `addi.l #$100fe00,D1` -- one 32-bit add, so the low
    // half's carry reaches the high half), and D2 walks a frame counter kept in
    // ($1E,A5) that steps by $24 and WRAPS AT $90 -- a write the port did not
    // make before this wave.
    const d1 = u32(ram.u32(a6 + 0x02) + 0x0100fe00);   // $2689D6/$2689DA
    let d2 = ram.u16(a5 + R.rec1E);                    // $2689E2 move.w ($1E,A5),D2
    d2 = u16(d2 + 0x24);                               // $2689E6 addi.w #$24
    if (d2 === 0x90) d2 = 0;                           // $2689EA cmpi.w #$90 / bne
    ram.setU16(a5 + R.rec1E, d2);                      // $2689F2 move.w D2,($1E,A5)
    enqueueRegistersThroughStub(ram, rom, ram.u32(a5 + R.emitReg2E),
      d1, u32(d2 + 0x22c59c), 0x410, 0x1e);            // $2689F6/$2689FC/$268A00/$268A08
    return;                                            // $268A08 jmp (A0)
  }
  if (ram.u16(G.freeze) !== 0) { draw11(ram, rom, a5, a6); return; } // $268A0E
  // $268A16 `move.b ($33,A5),D1` -- loaded, then overwritten by the aim below
  // and never read on the no-aim path.  Transcribed as a comment, not as code.
  // $268A1A: the aim CADENCE.  `bcc` is "no borrow", so the aim runs only on
  // the frame the byte was already 0.
  const cad = ram.u8(a5 + R.cooldown);                 // $268A1A subq.b #1,($18,A5)
  ram.setU8(a5 + R.cooldown, (cad - 1) & 0xff);
  if (cad === 0) {                                     // $268A1E bcc $268A5A
    ram.setU8(a5 + R.cooldown, ram.u8(a5 + R.cooldownReload)); // $268A20 reload
    const selfY = ram.u16(a6 + 0x02), selfX = ram.u16(a6 + 0x04); // $268A26 movem.w
    // $268A2C addi.w #$200,D0 -- THE MUZZLE OFFSET, long axis only.
    const r = aim64FromCaller(aimTables(rom), ram, a5, u16(selfY + 0x200), selfX);
    if (r.carry) { draw11(ram, rom, a5, a6); return; } // $268A36 bcs $268A68
    const nf = slew64(ram.u8(a5 + R.facing), r.dir);   // $268A38/$268A3C jsr $242190
    ram.setU8(a5 + R.facing, nf);                      // $268A42 move.b D1,($33,A5)
    // $268A46 addq.b #1,D1 / andi.w #$3E,D1 / add.w D1,D1 -- 32 entries, stride 4.
    ram.setU32(a5 + R.sprite22,                        // $268A54 move.l (A0,D1.w)
      rom.u32(SPRITE_TAB.h11_fire + (((nf + 1) & 0x3e) * 2)));
  }
  // $268A5A: the FAN counter (+$28), behind the sub-record's bit-5 flag.
  if ((ram.u8(a6) & 0x20) === 0) { draw11(ram, rom, a5, a6); return; } // btst #5 / beq
  const c = (ram.u8(a5 + R.fireCtr) - 1) & 0xff;       // $268A62 subq.b #1,($28,A5)
  ram.setU8(a5 + R.fireCtr, c);
  if (c !== 0) { draw11(ram, rom, a5, a6); return; }    // $268A66 beq $268A86
  fireFan11(ram, rom, a5, a6, ctx);                    // $268A86
}

// $268A68: THE COMMON DRAW.  Every arm of $11's fire machine falls into it, and
// it is the REGISTER-convention emitter through ($2E,A5).  `addi.l #$fc00fc00`
// is ONE 32-bit add -- the two halves are not independent.
function draw11(ram, rom, a5, a6) {
  const d1 = u32(ram.u32(a6 + 0x02) + 0xfc00fc00);     // $268A68/$268A6C
  enqueueRegistersThroughStub(ram, rom, ram.u32(a5 + R.emitReg2E), d1,
    ram.u32(a5 + R.sprite22),                          // $268A72 move.l ($22,A5),D2
    0x620,                                             // $268A76 move.w #$620,D3
    ram.u16(a6 + S.f1c));                              // $268A7A move.w ($1C,A6),D4
}

// $268A86..$268B1A: THE KIND-$D FAN -- W30 WIRES IT.  This is the fire W29 §5.1
// specified and did not do, and it is the highest-volume one in the stage: type
// $11 is 104 of stage 1's 339 spawn records.
function fireFan11(ram, rom, a5, a6, ctx) {
  const u = ctx.unported;
  let d0 = u16(u16(0xa0 - ram.u16(G.aa)) + 4);         // $268A86/$268A8A/$268A90
  // $268A92/$268A9C/$268AA6 -- `bcs` on `cmpi.w #$159,$8130CE` is UNSIGNED.
  if (ram.u16(G.rank98) === 0 && ram.u16(G.stage) === 1
      && ram.u16(G.clock) >= 0x159) {
    d0 = u16(u16(0x30 - ram.u16(G.ba)) - 6);           // $268AB0/$268AB2/$268AB8
  }
  ram.setU8(a5 + R.fireCtr, d0 & 0xff);                // $268ABA move.b D0,($28,A5)
  if (fireGate267FC6(u, ram, rom, a5, a6).carry) {     // $268ABE jsr / $268AC2 bcs
    draw11(ram, rom, a5, a6); return;
  }
  if (ram.u16(G.stage) === 1 && ram.u16(G.midbossD8) !== 0) { // $268AC4/$268AD0/$268AD6
    draw11(ram, rom, a5, a6); return;
  }
  if ((ram.u8(a6) & 0x20) === 0) { draw11(ram, rom, a5, a6); return; } // $268AD8 btst #5
  // $268ADE..$268B14 -- the four registers, all computed here.
  // D1: `move.b ($33,A5),D1 / addq.b #$2,D1 / andi.w #$3C,D1`.  The `addq` is
  // BYTE-wide and the mask WORD-wide, so it is (facing + 2) & $FF & $3C.
  const d1 = ((ram.u8(a5 + R.facing) + 2) & 0xff) & 0x3c;   // $268ADE/$268AE2/$268AE4
  // D2: the $268B1E muzzle table.  `move.w D1,D2 / add.w D2,D2` is a *2 on an
  // index that is already a multiple of 4, so the ENTRIES ARE 8 BYTES APART and
  // only the first longword of each is read -- byte offsets 0,8,..,$78.
  const d2 = u32(rom.u32(MUZZLE_11 + u16(d1 * 2)) + ram.u32(a6 + 0x02)); // $268AF2/$268AF6
  // D0: kind $D.  `cmpi.w #$3,$813092 / bcs` is UNSIGNED, so stages 0..2 keep
  // the bare `moveq #$D` (speed bias 0) and 3+ take the $FFFC bias.
  const d0f = ram.u16(G.stage) < 3 ? 0x0000000d : 0xfffc000d;  // $268AFA/$268AFC/$268B08
  const regs = { d0: d0f, d1, d2, d3: 0x02000000, d4: 0, d5: 0, a5 }; // $268B0E
  const res = fireBullet({ ram, rom, log: new WriteLog(ram) }, 0x281402, regs); // $268B14
  ctx.bulletSpawn?.(0x268b14, res);
  draw11(ram, rom, a5, a6);                            // $268B1A bra $268A68
}

// ============================================================ TYPE $10 (16)
// `$268232`.  Same shape as $11 (script-mover + aim + fire) with a bespoke
// bounds test (a draw-flag gate on +$32 and a $7600 compare).  Its death
// sequence is the SHARED PROLOGUE at `$2681CE` (reached via `bmi $2681CE` from
// `$26829E`).  flow.py TRUE span `$2681CE..$268490` (710 B, 183 insns).
function handler10(ram, rom, a5, ctx) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, tables, u)) return;   // $268232 jsr $2638A6
  // $268238..$268276: bounds.  Y += $1200 + scroll + $a400; X (after swap) has
  // a +$32 draw-flag gate ($7600 compare) then += $a00 + $7c00.
  const pos = ram.u32(a6 + 0x02);                      // $268238 move.l $2(A6)
  let y = u16(u16((pos & 0xffff) + 0x1200) + ram.u16(G.scroll)); // $26823C/$268240
  let off = u16(y) + 0xa400 > 0xffff;                  // $268246 addi.w #$a400
  if (!off) {                                          // $26824A bcs $268268
    let x = u16((pos >>> 16));                         // $26824C swap
    if (ram.u8(a5 + 0x32) !== 0 && i16(x) < 0x7600) {  // $26824E/$268254
      ram.setU8(a5 + 0x32, 0);                         // $26825A clr.b $32(A5)
    }
    x = u16(x + 0xa00);                                // $26825E addi.w #$a00
    off = u16(x) + 0x7c00 > 0xffff;                    // $268262 addi.w #$7c00
  }
  if (off) {                                           // $268266 bcc $268276
    if (ram.u16(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; } // $26826E
  } else {
    ram.setU16(a5 + R.onScreen, 1);                    // $268276
  }
  // $26827C: damage/hit branch (same shape as $11).
  if ((ram.u8(a6) & 0x5c) !== 0) {                     // $26827E
    const d1 = hitMask(ram, a6);                       // $26827C moveq #$5C / and.b
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // $268282
    const pc = ram.u8(a5 + R.palCycle);                // $268286
    ram.setU8(a6 + S.palette, ram.u8(a6 + S.palette) ^ pc); // $26828A
    scoreHit(ram, ctx, a6, d1);                        // $26828E jsr $286096 (W34)
    if ((ram.u16(a6 + S.hp) & 0x8000) !== 0) {         // $268294 tst.w $18 / bpl
      if ((ram.u8(a5 + R.deathFlag) & 0x80) !== 0) { deathSeq10(ram, rom, a5, a6, ctx, d1); return; } // $26829E bmi $2681CE
      ram.bclr8(a6, 1);                                // $2682A2 bclr #1,(A6)
      ram.setU16(a6 + S.hp, ram.u16(a5 + R.hpReload)); // $2682A6 reload HP
      scoreKill(ram, rom, ctx, 0x08, d1);              // $2682AA/$2682AE
      ram.bset8(a5 + R.deathFlag, 7);                  // $2682B4 bset #7,$20
      // W54: SPAWNED.  $2682BA moveq #$3 / $2682BC lea ($267FAC,PC),A1 --
      // the HIT row, the same one $268954 uses -- / $2682C0 jsr $289004.
      effectArmNine(ram, rom, ctx, a6, 0x03, REMAP.hit267FAC, 0x2682c0);
      // $2682F0 `bra.b $2682F8` -- NOT a return.  Type $10's first trip to zero
      // reloads, scores 8, marks itself and then RUNS ITS FIRE MACHINE on the
      // same frame, exactly as type $11's does.  W34: the `return` that used to
      // be here suppressed the fire machine's counted note on every damage
      // frame, which no run could see because no run had a damage frame.
    }
  }
  fire10(ram, rom, a5, a6, ctx);                       // $2682F8
}

// ---- $2682F8..$268490: TYPE $10's fire/state machine.  WIRED BY W81. --------
//
// It was one counted note ("$10 fire/state machine $2682F8..$268490") from W26
// until this wave, and W68 §2.2 measured what that cost: 22 spawned objects and
// 6,679 collidable slot-frames with NO SPRITE POINTER EVER WRITTEN, because the
// two instructions that write it are inside the note.
//
// **IT IS TYPE $11's MACHINE.**  Read side by side out of `maincpu.bin`, this
// block and `$268990..$268B1A` are the same twelve arms in the same order, and
// every difference is a CONSTANT:
//
//   $2682F8 tst.w $8130D2         == $268990       the freeze gate
//   $26831E lea $268594           vs $2689B6 lea $268B9E     hull table
//   $26832A movea.l ($2A,A5)/jsr  == $2689C2       the RECORD-convention emit
//   $268330 tst.b ($20,A5) bpl    ~  $2689C8 bmi   the death-animation arm
//   $26833E addi.l #$0000FE00     vs $2689DA #$0100FE00      <- ONE constant
//   $268376 tst.w $8130D2 bne     == $268A0E      the second freeze gate
//   $268398 jsr $24200A           == $268A30      aim64, self from the caller
//   $2683A4 jsr $242190           == $268A3C      the one-step slew
//   $2683B6 lea $268694           vs $268A4E lea $268C9E     turret table
//   $2683CE addi.l #$FA00FA00     vs $268A68 #$FC00FC00, D3 $830 vs $620
//   $2683F8 jsr $267FC6           == $268ABE      THE FIRE GATE
//   $26848A jsr $281402           == $268B14      the kind-$D fan
//
// **AND `$267FC6` IS NOT AN UNPORTED ROUTINE.**  W80 §5 filed it as "a
// rank-selected position test that is NOT `$2425B2` and is NOT ported ... a
// second unported routine nobody has costed".  It has been `fireGate267FC6`
// since W30 (`src/handlers.js` §"$267FC6: THE FIRE GATE"), it is 43
// instructions plus `playerDist268018`, and its cost to this wave is ZERO
// LINES.  Nothing here fakes a rank input: `$813092` and `$813098` are read
// out of RAM exactly as `$268ABE`'s caller reads them.
function fire10(ram, rom, a5, a6, ctx) {
  const u = ctx.unported;
  if (ram.u16(G.freeze) === 0) {                       // $2682F8 tst.w $8130D2
    const d7 = ram.u16(a6 + S.speed);                  // $268300 move.w ($1A,A6),D7
    // $268304 moveq #$3E / and.w D7,D1 / add.w D1,D1 / add.w D1,D1 -- x4, so
    // the reach is $F8 and the table is SIXTY-FOUR entries, not 96.
    let d1 = (d7 & 0x3e) << 2;
    if ((d7 & 0x40) === 0 && (ram.u8(G.mirror) & 0x04) !== 0)  // $26830C/$268312
      d1 = u16(d1 + 4);                                // $26831C addq.w #$4,D1
    ram.setU32(a6 + S.sprite0a, rom.u32(SPRITE_TAB.h10_main + d1));  // $268324
  }
  enqueueThroughStub(ram, rom, ram.u32(a5 + R.emitRec2A), a6);   // $26832E jsr (A0)
  if ((ram.u8(a5 + R.deathFlag) & 0x80) !== 0) {       // $268330 tst.b / bpl
    // $268336..$268370: the DEATH ANIMATION, and it is $2689D6's arm with the
    // long-axis bias dropped -- `addi.l #$FE00` where $11 has `#$0100FE00`.
    if (ram.u16(G.mirror2) === 0) return;              // $268336 tst.w / beq $268374
    const d1 = u32(ram.u32(a6 + 0x02) + 0x0000fe00);   // $26833E/$268342
    let d2 = ram.u16(a5 + R.rec1E);                    // $26834A move.w ($1E,A5),D2
    d2 = u16(d2 + 0x24);                               // $26834E addi.w #$24
    if (d2 === 0x90) d2 = 0;                           // $268352 cmpi.w #$90 / bne
    ram.setU16(a5 + R.rec1E, d2);                      // $26835A move.w D2,($1E,A5)
    enqueueRegistersThroughStub(ram, rom, ram.u32(a5 + R.emitReg2E),
      d1, u32(d2 + 0x22c59c), 0x410, 0x1e);            // $26835E/$268364/$268368
    return;                                            // $268370 jmp (A0)
  }
  if (ram.u16(G.freeze) !== 0) { draw10(ram, rom, a5, a6); return; } // $268376
  // $26837E `move.b ($33,A5),D1` -- loaded and overwritten by the aim, exactly
  // as $268A16 is.  Transcribed as a comment, not as code.
  const cad = ram.u8(a5 + R.cooldown);                 // $268382 subq.b #1,($18,A5)
  ram.setU8(a5 + R.cooldown, (cad - 1) & 0xff);
  if (cad === 0) {                                     // $268386 bcc $2683C2
    ram.setU8(a5 + R.cooldown, ram.u8(a5 + R.cooldownReload));  // $268388
    const selfY = ram.u16(a6 + 0x02), selfX = ram.u16(a6 + 0x04);  // $26838E movem.w
    const r = aim64FromCaller(aimTables(rom), ram, a5,
      u16(selfY + 0x200), selfX);                      // $268394/$268398 jsr $24200A
    if (r.carry) { draw10(ram, rom, a5, a6); return; } // $26839E bcs $2683CE
    const nf = slew64(ram.u8(a5 + R.facing), r.dir);   // $2683A0/$2683A4 jsr $242190
    ram.setU8(a5 + R.facing, nf);                      // $2683AA move.b D1,($33,A5)
    ram.setU32(a5 + R.sprite22,                        // $2683BC move.l (A0,D1.w)
      rom.u32(SPRITE_TAB.h10_fire + (((nf + 1) & 0x3e) * 2)));
  }
  if ((ram.u8(a6) & 0x20) === 0) { draw10(ram, rom, a5, a6); return; } // $2683C2 btst #5
  const c = (ram.u8(a5 + R.fireCtr) - 1) & 0xff;       // $2683C8 subq.b #1,($28,A5)
  ram.setU8(a5 + R.fireCtr, c);
  if (c !== 0) { draw10(ram, rom, a5, a6); return; }    // $2683CC beq $2683EC
  fireFan10(ram, rom, a5, a6, ctx);                    // $2683EC
  void u;
}

/** $2683CE: TYPE $10's COMMON DRAW -- the register-convention emitter through
 *  ($2E,A5).  `addi.l #$FA00FA00` is ONE 32-bit add. */
function draw10(ram, rom, a5, a6) {
  const d1 = u32(ram.u32(a6 + 0x02) + 0xfa00fa00);     // $2683CE/$2683D2
  enqueueRegistersThroughStub(ram, rom, ram.u32(a5 + R.emitReg2E), d1,
    ram.u32(a5 + R.sprite22),                          // $2683D8 move.l ($22,A5),D2
    0x830,                                             // $2683DC move.w #$830,D3
    ram.u16(a6 + S.f1c));                              // $2683E0 move.w ($1C,A6),D4
}

/** $2683EC..$268490 -- type $10's kind-$C fan.  Note the KIND: `$268482 moveq
 *  #$C,D0`, where type $11's `$268AFA` is `#$D`. */
function fireFan10(ram, rom, a5, a6, ctx) {
  const u = ctx.unported;
  // $2683EC moveq #$18 / sub.w $8130BC,D0 / move.b D0,($28,A5)
  ram.setU8(a5 + R.fireCtr, u16(0x18 - ram.u16(G.bc)) & 0xff);
  if (fireGate267FC6(u, ram, rom, a5, a6).carry) {     // $2683F8 jsr / $2683FC bcs
    draw10(ram, rom, a5, a6); return;
  }
  if (ram.u16(G.stage) === 1 && ram.u16(G.midbossD8) !== 0) { // $2683FE/$26840A
    draw10(ram, rom, a5, a6); return;
  }
  const selfY = ram.u16(a6 + 0x02), selfX = ram.u16(a6 + 0x04); // $268412 movem.w
  const r = aim64FromCaller(aimTables(rom), ram, a5,
    u16(selfY + 0x200), selfX);                        // $268418/$26841C jsr $24200A
  if (r.carry) { draw10(ram, rom, a5, a6); return; }   // $268422 bcs $2683CE
  // $268424..$268440: FIRE ONLY WHEN THE TURRET IS POINTING WHERE IT AIMS.
  // Both the fresh aim and the stored facing are rounded to $3C -- 16 sectors
  // of the 64 -- and if they differ the shot is suppressed unless the two
  // salvo bytes ($1C,A5)/($1D,A5) are equal.
  const d2 = (u16(r.dir) + 2) & 0xff & 0x3c;           // $268428 addq.b #2 / and.w
  const d3 = (ram.u8(a5 + R.facing) + 2) & 0xff & 0x3c; // $26842C/$268430
  if (d2 !== d3 && ram.u8(a5 + R.rec1D) === ram.u8(a5 + R.rec1C)) {
    draw10(ram, rom, a5, a6); return;                  // $268440 beq $2683CE
  }
  ram.setU8(a5 + R.fireCtr, ram.u8(a5 + 0x1b));        // $268442 move.b ($1B,A5)
  // `subq.b #1,X / bcc` borrows only when X WAS ZERO, so the reload arm is
  // keyed on the value BEFORE the decrement -- the same shape as $268A1A's.
  const sc = ram.u8(a5 + R.rec1C);                     // $268448 subq.b #1,($1C,A5)
  ram.setU8(a5 + R.rec1C, (sc - 1) & 0xff);
  if (sc === 0) {                                      // $26844C bcc $268460
    ram.setU8(a5 + R.rec1C, ram.u8(a5 + R.rec1D));     // $26844E reload
    // $268454 moveq #$40 / sub.w $8130B8,D0 / move.b D0,($28,A5)
    ram.setU8(a5 + R.fireCtr, u16(0x40 - ram.u16(G.b8)) & 0xff);
  }
  const f = ram.u8(a5 + R.facing);                     // $268460 move.b ($33,A5),D1
  // $268464 move.w D1,D3 / addq.w #1,D3 / andi.w #$3E,D3 / add.w D3,D3 --
  // FOUR-byte entries here; type $11's $268B1E is eight.
  const d2b = u32(rom.u32(MUZZLE_10 + u16(((f + 1) & 0x3e) * 2))
    + ram.u32(a6 + 0x02));                             // $268474/$268478 add.l
  const d1b = (f + 2) & 0xff & 0x3c;                   // $26847C addq.b #2 / andi.w
  const regs = { d0: 0x0000000c, d1: d1b, d2: d2b,     // $268482 moveq #$C
    d3: 0x02000000, d4: 0, d5: 0, a5 };                // $268484 move.l #$2000000
  const res = fireBullet({ ram, rom, log: new WriteLog(ram) }, 0x281402, regs); // $26848A
  ctx.bulletSpawn?.(0x26848a, res);
  draw10(ram, rom, a5, a6);                            // $268490 bra $2683CE
}
// $2681CE: SHARED DEATH SEQUENCE for $10 (the prologue).  Effects noted, then free.
// Unlike $11's death seq, the $289AF4 here ($26821E) is UNCONDITIONAL in the ROM
// (no preceding btst in $2681CE..$26822A), so the note is not gated (W25b F6).
function deathSeq10(ram, rom, a5, a6, ctx, d1) {
  const u = ctx.unported;
  scoreKill(ram, rom, ctx, 0x10, d1);                  // $2681CE/$2681D0
  // W54: SPAWNED -- **AND THE KIND IS $4, NOT $7.**  [M] $2681D6 is
  // `moveq #$4,D0`, and the note this line replaced said $7 since W25b.
  // Kind $4 is not even in `50-recon` 2.4's measured eight; it reached
  // 137 x $7 because type $11's death arm IS $7 and type $10's is not.
  effectArmNine(ram, rom, ctx, a6, 0x04, REMAP.death267FA0, 0x2681dc);
  noteEffect(u, 0x289af4, a5, 'D0=$4 secondary');
  ctx.soundPost?.(0x28c25a);                       // WAVE A: SFX id=0, death burst
  freeEnemy(ram, a5);                                  // jmp $263762
}

// ================================================ TYPE $05 (28) + $07/$27 (64)
// The DAMAGE-FIRST FAMILY: `$269CEA` ($05) and `$26A2E2` ($07/$27, an alias
// pair).  flow.py TRUE spans SHARE a prologue at `$269B3E` (a fire block both
// branch into): `$269CEA` -> `$269B3E..$269E1C`, `$26A2E2` -> `$269B3E..$26A4B0`.
// These handlers drive position via `$2417DE` applyVelocity (CONSTANT init
// velocity -- they do NOT call `$2638A6` stepMovement), then run the onscreen
// test, the damage branch, and the fire machine.
//
// ===========================================================================
// WAVE 80 -- **THE SHARED PART IS `$269CEA..$269D6E` == `$26A2E2..$26A366`,
// AND IT ENDS THERE.**  Diagnostics 68 §2.3 and 75 §3.2 both say `$05`/`$07`/
// `$27` are one job -- *"the same two [enqueue sites]; its span
// `$269B3E..$26A4B0` contains them"* -- and W68 §10 costs the whole of it as
// "thirty instructions inside `$269D84..$269E1C`".  READ OUT OF THE ROM, THAT
// IS FALSE, and it is false in the way `docs/knowledge/02` keeps naming:
// CONTAINMENT IS NOT REACHABILITY.
//
//   $269D6E move.b #$1,($16,A5)          <- the last shared instruction
//   $269D74 tst.w $8130D2 / bne.w $269E16   -- $05 frozen -> **$269E16**
//   $269D7E jsr $2417DE / $269D84 ...       -- $05's OWN fire machine
//
//   $26A366 move.b #$1,($16,A5)          <- the last shared instruction
//   $26A36C move.b ($23,A5),D1
//   $26A370 tst.w $8130D2 / bne.w $269E20   -- $07 frozen -> **$269E20**
//   $26A37A jsr $2417DE / $26A380 ...       -- $07/$27's OWN fire machine
//
// `$26A2E2` NEVER EXECUTES ONE BYTE OF `$269D84..$269E1C`.  It has its own
// 51-instruction machine at `$26A380..$26A4B0`, which is `$26A5E4`'s (type
// `$08`, ported at W36) with two changes, and it ends in `$269E20` where
// `$05`'s ends in `$269E16` -- a DIFFERENT block, one that does not touch the
// sprite pointer at all.  So this is two ports, not one, and the frozen exits
// differ between them.  Wiring only `$269D84` would have left 47 of the 72
// objects invisible and every wave list would still have read "done".
// ===========================================================================
//
// `($16,A5)` IS A BYTE HERE, AND THE PORT HAD IT AS A WORD.  `$269D62` is
// `4A2D 0016` (`tst.b`) and `$269D6E` is `1B7C 0001 0016` (`move.b #$1`); the
// port wrote `setU16(...,1)`, i.e. `($16,A5)=0` and `($17,A5)=1`.  Self-
// consistent inside the port -- which is why no gate saw it -- and two wrong
// bytes against the board on every live record of the family.  Type `$11`'s
// `$2688F2`/`$268900` really ARE `tst.w`/`move.w`, so the two are not a
// copy-paste of each other and only this family moves.
function damageFirstHead269CEA(ram, rom, a5, a6, ctx) {
  const u = ctx.unported;
  // $269CEA/$26A2E2 entry: the damage/hit branch FIRST (before movement).
  if ((ram.u8(a6) & 0x5c) !== 0) {                     // $269CEA moveq #$5c / and.b
    const d1 = hitMask(ram, a6);
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // $269CF2/$269CF6
    scoreHit(ram, ctx, a6, d1);                        // $269CF8 jsr $286096 (W34)
    // palette flash from +$2A/+2B (the bucket emitter pair XOR).
    const d0 = ram.u8(a5 + 0x2a) ^ ram.u8(a5 + 0x2b);  // $269CFE..$269D06 eor.b
    ram.setU8(a6 + S.palette, d0);                      // $269D08 move.b D0,$1d(A6)
    if ((ram.u16(a6 + S.hp) & 0x8000) !== 0) {         // $269D0C tst.w $18 / bpl
      scoreKill(ram, rom, ctx, 0x08, d1);              // $269D14/$269D16 jsr $28615E
      // W54: SPAWNED.  $269D1C moveq #$2 / $269D1E jsr $289004, then
      // $269D24..$269D44's five writes -- no remap table, bucket 7 flat.
      effectArmFamily(ram, rom, ctx, a6, 0x02, 0x269d1e);
      ctx.soundPost?.(0x28c2a8);                       // WAVE A: SFX id=3, death burst      // jsr $28C2A8
      freeEnemy(ram, a5);                              // jmp $263762
      return null;
    }
  } else {
    ram.setU8(a6 + S.palette, ram.u8(a5 + 0x2a));      // $269D54/$26A34C
  }
  // $269D5A/$26A352: the onscreen test $242684 -> free if off-screen-after-on.
  if (onScreen242684(ram, a6)) {                       // jsr $242684 / bcc
    if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return null; } // tst.b/jmp
  } else {
    ram.setU8(a5 + R.onScreen, 1);                     // move.b #$1,$16(A5)
  }
  return 'ran';                                        // -> $269D74 / $26A36C
}
// applyVelocity is exported by movement.js; re-export through the body for the
// damage-first family (so the call site reads as the listing's `jsr $2417DE`).
function applyVelocityBody(ram, tables, a5) {
  applyVelocity(ram, tables, a5);
}

/**
 * TYPE `$05` -- `$269CEA`, tail `$269D74..$269E1C`.
 * The frozen exit is `$269E16`, NOT `$269E20`: a frozen `$05` enqueues and
 * draws with WHATEVER sprite pointer it already carries.  Follow the
 * fall-through, not the label -- `$269E1C bra.w $269B3E` is the last
 * instruction of the block and `$269E20` is the NEXT routine, reached only by
 * the other five members of the family.
 */
function handler05(ram, rom, a5, ctx) {
  const { tables } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (damageFirstHead269CEA(ram, rom, a5, a6, ctx) === null) return;
  if (ram.u16(G.freeze) !== 0) {                       // $269D74 tst.w / bne.w $269E16
    drawFamily269E16(ram, rom, a5, a6); return;
  }
  applyVelocityBody(ram, tables, a5);                  // $269D7E jsr $2417DE (W24)
  // $269D84: the SLEW clock.  ($28,A5) is a countdown of turns REMAINING and
  // ($1A,A5)/($1B,A5) the frames between them; when both fire, `$242178` aims,
  // slews one step, stores the new heading into ($1B,A6) and hands D1 back --
  // and D1 is what picks BOTH the body's sprite pointer and ARM B's descriptor
  // (W84).  That is the whole of why this type is invisible: `($A,A6)` is only
  // ever written here.
  if (ram.u16(a5 + 0x28) !== 0) {                      // $269D84 tst.w / beq.b $269DC2
    const c = ram.u8(a5 + 0x1a);                       // $269D8A subq.b #$1,($1A,A5)
    ram.setU8(a5 + 0x1a, (c - 1) & 0xff);
    if (c === 0) {                                     // $269D8E bcc.b $269DC2
      ram.setU8(a5 + 0x1a, ram.u8(a5 + 0x1b));         // $269D90
      ram.setU16(a5 + 0x28, u16(ram.u16(a5 + 0x28) - 1));  // $269D96 subq.w #$1
      const r = aim64TurnStore(aimTables(rom), ram, a5, a6); // $269D9A jsr $242178
      if (r.carry) { drawFamily269E16(ram, rom, a5, a6); return; } // $269DA0 bcs.w
      // $269DA4 lea $269E48 / andi.w #$3E,D1 / add.w D1,D1 -- the SAME two
      // tables `$269E20` reads, indexed by the SLEWED heading rather than by a
      // caller's D1.
      const idx = u16((r.dir & 0x3e) * 2);             // $269DAA/$269DAE
      ram.setU32(a6 + S.sprite0a, rom.u32(FAM.sprite + idx));  // $269DB0
      ram.setU32(a5 + 0x2c, rom.u32(FAM.armBArt + idx));      // $269DB6/$269DBC
    }
  }
  // $269DC2: the fire cooldown, then RANK's reload ($58 - $8130B4 + 2, low byte).
  const cd = ram.u8(a5 + R.cooldown);                  // $269DC2 subq.b #$1,($18,A5)
  ram.setU8(a5 + R.cooldown, (cd - 1) & 0xff);
  if (cd !== 0) { drawFamily269E16(ram, rom, a5, a6); return; }  // $269DC6 bcc.w
  ram.setU8(a5 + R.cooldown,
    u16(0x58 - ram.u16(G.b4) + 2) & 0xff);             // $269DCA/$269DCC/$269DD2/$269DD4
  if (boxTest2425B2(ram, rom, a6).carry) {             // $269DD8 jsr $2425B2 / bcs.w
    drawFamily269E16(ram, rom, a5, a6); return;
  }
  const r = aim64AtTarget(aimTables(rom), ram, a5, a6); // $269DE2 jsr $24202C
  if (r.carry) { drawFamily269E16(ram, rom, a5, a6); return; }   // $269DE8 bcs.w
  // $269DEC..$269E10.  The muzzle index is ($1B,A6) -- the heading `$242178`
  // just stored -- and NOT D1; D1 is $24202C's raw aim and is what the
  // generator reads.  The two are different numbers on any frame the slew has
  // not caught up, so the pair is passed separately.
  fireFamily2814AC(ram, rom, a5, a6, ctx,
    ram.u8(a6 + S.heading), r.dir, 0x0003000d, 0x269e10);
  drawFamily269E16(ram, rom, a5, a6);                  // $269E16 fall-through
}

/**
 * TYPES `$07`/`$27` -- `$26A2E2`, tail `$26A36C..$26A4B0`.
 * `$26A380..$26A4B0` is `$26A5E4`'s machine (type `$08`, ported at W36) with
 * exactly two differences, both transcribed below: `move.w #$3,($24,A5)` where
 * `$08` has `#$2`, and the extra `$26A3C2..$26A3D2` block that picks the sign
 * of the per-frame heading step.  `state26A40C` is not a lookalike -- both
 * types branch to the SAME address, so it is literally shared.
 */
function handler07(ram, rom, a5, ctx) {
  const { tables } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (damageFirstHead269CEA(ram, rom, a5, a6, ctx) === null) return;
  // $26A36C `move.b ($23,A5),D1` comes BEFORE the freeze test, so the frozen
  // exit draws with the facing byte -- and it goes to $269E20, which rewrites
  // the sprite pointer, where $05's frozen exit goes to $269E16, which does
  // not.  Two handlers, two frozen exits, and the family shares neither.
  if (ram.u16(G.freeze) !== 0) {                       // $26A370 tst.w / bne.w $269E20
    drawFamily269E20(ram, rom, a5, a6, ram.u8(a5 + R.rec23)); return;
  }
  applyVelocityBody(ram, tables, a5);                  // $26A37A jsr $2417DE
  if (ram.u16(a5 + 0x26) !== 0) {                      // $26A380 tst.w ($26,A5) / bne
    state26A40C(ram, rom, a5, a6);                     // $26A384 bne.w $26A40C
    return;
  }
  if (ram.u8(a6 + S.speed) !== 0) {                    // $26A388 tst.b ($1A,A6) / beq
    const c = ram.u8(a5 + 0x24);                       // $26A38E subq.b #$1,($24,A5)
    ram.setU8(a5 + 0x24, (c - 1) & 0xff);
    if (c === 0) {                                     // $26A392 bcc.b $26A3D8
      ram.setU8(a5 + 0x24, ram.u8(a5 + 0x25));         // $26A394
      const n = (ram.u8(a6 + S.speed) - 1) & 0xff;     // $26A39A subq.b #$1,($1A,A6)
      ram.setU8(a6 + S.speed, n);
      if (n === 0) {                                   // $26A39E bne.b $26A3D8
        ram.setU16(a5 + 0x24, 3);                      // $26A3A0 move.w #$3 (**$08 has #$2**)
        ram.setU8(a5 + R.cooldown, 0x10);              // $26A3A6 move.b #$10,($18,A5)
        // $26A3AC `move.w #$3000,D1` then $26A3B0 `move.b ($23,A5),D1`: the
        // BYTE move leaves D1's high byte $30, and nothing downstream reads
        // past D1's low byte, so the $3000 is vestigial and is not modelled.
        const d1 = ram.u8(a5 + R.rec23) & 0x3c;        // $26A3B0/$26A3B4 andi.b #$3C
        ram.setU8(a6 + S.heading, d1);                 // $26A3B8 move.b D1,($1B,A6)
        ram.setU8(a5 + 0x1a, 0x30);                    // $26A3BC move.b #$30,($1A,A5)
        // $26A3C2 `cmp.b ($22,A5),D1` -- UNSIGNED, and the two arms are the
        // two SIGNS of the same step: `bhi` -> +4, else -4 ($FC).  `$08` has
        // no such block; its ($1F,A5) is whatever the init body left.
        const tgt = ram.u8(a5 + 0x22);                 // $26A3C2
        if (d1 !== tgt) {                              // $26A3C6 beq.b $26A3D8
          ram.setU8(a5 + 0x1f, d1 > tgt ? 0x04 : 0xfc); // $26A3C8/$26A3CA/$26A3D2
        }
      }
    }
  }
  let d1 = ram.u8(a5 + R.rec23);                       // $26A3D8 move.b ($23,A5),D1
  if (ram.u16(0x803910) === 0) {                       // $26A3DC tst.w $803910 / bne.w
    // $26A3E6 `jsr $24202C` with NO `bcs` -- the same carry-blind call
    // `$26A6CE` makes: when both players are dead D1 survives and the slew is
    // `slew64(x, x)`.
    const r = aim64AtTarget(aimTables(rom), ram, a5, a6);  // $26A3E6
    const tgt = r.carry ? d1 : r.dir;
    d1 = slew64(ram.u8(a5 + R.rec23), tgt);            // $26A3EC/$26A3F0 jsr $242190
    ram.setU8(a5 + R.rec23, d1 & 0xff);                // $26A3F6 move.b D1,($23,A5)
  }
  if (ram.u8(a6 + S.speed) === 0) ram.setU16(a5 + 0x26, 1);  // $26A3FA/$26A402
  // $26A460..$26A4B0 -- byte for byte $26A738..$26A788, type $08's fire.
  const cd = ram.u8(a5 + R.cooldown);                  // $26A460 subq.b #$1,($18,A5)
  ram.setU8(a5 + R.cooldown, (cd - 1) & 0xff);
  if (cd !== 0) { drawFamily269E20(ram, rom, a5, a6, d1); return; }  // $26A464 bcc.w
  ram.setU8(a5 + R.cooldown,
    u16(0x58 - ram.u16(G.b4) + 2) & 0xff);             // $26A468/$26A46A/$26A470/$26A472
  if (boxTest2425B2(ram, rom, a6).carry) {             // $26A476 jsr $2425B2 / bcs.w
    drawFamily269E20(ram, rom, a5, a6, d1); return;
  }
  const r = aim64AtTarget(aimTables(rom), ram, a5, a6);   // $26A480 jsr $24202C
  if (r.carry) { drawFamily269E20(ram, rom, a5, a6, d1); return; }   // $26A486 bcs.w
  // $26A490 `move.b D1,D2` -- the MUZZLE index is $24202C's D1 here, unlike
  // $05's, which reads ($1B,A6).
  fireFamily2814AC(ram, rom, a5, a6, ctx, r.dir, r.dir, 0x0003000d, 0x26a4aa);
  drawFamily269E20(ram, rom, a5, a6, r.dir);           // $26A4B0 bra.w $269E20
}

// ---- $274AF0..$274B64: TYPE $82's DEATH ARM ------------------------------
//
// **THE OWNER'S "no splosions", FOR THE ONE TYPE IT WAS STILL TRUE OF.**
// W68 §9 signal 5 measured `$274AF0` as a counted note reached 213 times in
// 7,000 frames and wrote the consequence down: *"a $82 never dies, so it never
// explodes"*.  W81 gave the fighter its picture and left this untouched and
// said so (§9.2), so since W81 the owner has been able to SEE a 96x88 fighter,
// shoot it, watch its HP go negative and watch nothing happen.
//
// Read out of the cartridge (`tools/oracle/w27disasm.py 274AF0 274B70`), and it
// is twenty-two instructions with no branch in it:
//
//   $274AF0 moveq #$42,D0 / jsr $28615E    THE KILL SCORE.  D0 = $42, the
//           fighter's own packed-BCD value; D1 is still the hit mask
//           `$2747EE..$2747F4` built, and `$286096` at $27481C does not touch
//           D1 (it works in D2/A0), so it reaches here intact.  Same shape as
//           `deathSeq85`, which is why that function takes `d1` too.
//   $274AF8 jsr $28C274                    a SOUND cue -- `$28C274` is
//           `movem / move.w #1,D0 / #$9E,D1 / #$1E,D2 / jsr $28C0AE`, i.e. one
//           request into the sound driver, which `39-OWNER` puts LAST.  It
//           stays a counted note, exactly as `$275BA0` does in `deathSeq85`.
//   $274AFE moveq #$D,D0  / jsr $289004    effect kind $0D, then six fields
//   $274B2A move.w #$8,D0 / jsr $289004    effect kind $08, then eight
//   $274B64 jmp $263762                    free the record
//
// **BOTH KINDS ARE INSIDE POOL B's 34 SCRIPT ENTRIES** (`$289016 cmpi.w #$21`),
// so neither goes to the bit bucket for being out of range and `src/effects.js`
// drives both off the cartridge's own script table -- there is no per-kind code
// to write.  The ORDER differs from `deathSeq85`'s and is transcribed as it
// stands: `$28C274` fires BEFORE the two allocations here and AFTER all three
// there.  It matters if the pool is full, because the note is what records the
// bit bucket, and a reordering would move which spawn is credited.
function deathSeq82(ram, rom, a5, a6, ctx, d1) {
  const u = ctx.unported;
  scoreKill(ram, rom, ctx, 0x42, d1);                  // $274AF0/$274AF2
  ctx.soundPost?.(0x28c274);                       // WAVE A: SFX id=1, death burst          // $274AF8 jsr $28C274
  const e1 = spawnEffect(ram, ctx, 0x0d, 0x274b00);    // $274AFE/$274B00
  ram.setU32(e1 + B.pos, ram.u32(a6 + 0x02));          // $274B06
  ram.setU16(e1 + B.bucket, 0x0010);                   // $274B0C
  ram.setU16(e1 + B.nudge, 0xf600);                    // $274B12
  ram.setU16(e1 + B.nudge + 2, 0x0000);                // $274B18
  ram.setU16(e1 + B.sub12, 0x0001);                    // $274B1E
  ram.setU16(e1 + B.sub14, 0x0400);                    // $274B24
  const e2 = spawnEffect(ram, ctx, 0x08, 0x274b2e);    // $274B2A/$274B2E
  ram.setU32(e2 + B.pos, ram.u32(a6 + 0x02));          // $274B34
  ram.setU16(e2 + B.bucket, 0x0010);                   // $274B3A
  ram.setU16(e2 + B.nudge, 0xf600);                    // $274B40
  ram.setU16(e2 + B.nudge + 2, 0x0000);                // $274B46
  ram.setU16(e2 + B.speed, 0x0680);                    // $274B4C  ($1A,A0) is a
                                                       //   WORD here: speed $06
                                                       //   and angle $80, the
                                                       //   pair `$289004` cleared
  ram.setU16(e2 + B.sub12, 0x0001);                    // $274B52
  ram.setU16(e2 + B.sub14, 0x0400);                    // $274B58
  ram.setU8(e2 + B.f1c, 0x40);                         // $274B5E  a BYTE
  freeEnemy(ram, a5);                                  // $274B64 jmp $263762
}

// ============================================================ TYPE $82 (33)
// `$2747C6`.  A script-mover (stepMovement) that aims with aim256 (`$2422A2`)
// and fires multiple bullet fans (`$281708` x4, `$281764` x2, `$281484`).  flow.py
// TRUE span `$2747C6..$274B64` (932 B, 222 insns -- the largest after $07).
function handler82(ram, rom, a5, ctx) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, tables, u)) return;   // $2747C6 jsr $2638A6
  // $2747CC: onscreen test $242684 -> free if off-screen-after-on-screen.
  // W81 -- AND ($16,A5) IS A **BYTE** HERE.  `$2747D4` is `4A2D 0016`
  // (`tst.b`) and `$2747E2` is `1B7C 0001 0016` (`move.b #$1`).  This port had
  // `u16`/`setU16`, which writes ($16,A5)=0 and ($17,A5)=1 -- two bytes wrong
  // against the board on every live record, and invisible to every gate
  // because the port also READ the word.  W80 §1.2 found the identical defect
  // in $05/$07/$27, fixed it there and filed $82's "with its wave"; this is
  // that wave.  Type $10's `$268268`/`$268276` really ARE `tst.w`/`move.w`, so
  // this is not one shape being pasted onto the other.
  if (onScreen242684(ram, a6)) {                       // jsr $242684 / bcc $2747E2
    if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; } // jmp $263762
  } else {
    ram.setU8(a5 + R.onScreen, 1);                     // $2747E2 move.b #$1,$16(A5)
  }
  // $2747E8: copy position to the SUB-RECORD's +$22.
  // W30 FIX.  This line read `a5 + R.sprite22` while its own comment said
  // `$22(A6)`.  `$2747E8` is `2D6E 0002 0022`: bits 11..9 = `110` and the
  // destination mode is `101`, so BOTH operands are `(d16,A6)`.  The port was
  // writing the position into the wrong record and never into the right one.
  // Found by reading `$275936`, the identical instruction in `$275914` (W30).
  ram.setU32(a6 + R.sprite22, ram.u32(a6 + 0x02));     // move.l $2(A6),$22(A6)
  // $2747EE: the damage branch combines (A6) and $20(A6): `(flags | $20(A6)) & $5c`.
  let dmg = (ram.u8(a6) | ram.u8(a6 + 0x20)) & 0x5c;   // move.b (A6)/or.b $20/andi
  if (dmg !== 0) {                                     // $2747F8 bne $274812
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // $274816 and.b #$a3,(A6)
    ram.setU8(a6 + 0x20, ram.u8(a6 + 0x20) & 0xa3);    // $274818 and.b #$a3,$20(A6)
    scoreHit(ram, ctx, a6, dmg);                       // $27481C jsr $286096 (W34)
    // ================================================================
    // W34.  `$274822..$274850`, THE HP CLAMP, was a whole-block `note()` that
    // RETURNED.  It is eight instructions and it is the only place type $82's
    // HP is written back, so with the note in place a type $82 could never die
    // however hard it was shot.  Read out of the ROM:
    //
    //   $274822 move.b ($1D,A6),D0 / cmpi.b #$19,D0 / bne $274830
    //   $27482C move.b ($1C,A5),D0            <- only when the palette IS $19
    //   $274830 move.b ($1D,A5),D2 / eor.b D2,D0
    //   $274836 move.w ($18,A6),D4
    //   $27483A cmp.w ($38,A6),D4 / ble $274844
    //   $274840 move.w ($38,A6),D4            <- CLAMP DOWN to the floor
    //   $274844 move.w D4,($18,A6) / $274848 move.w D4,($38,A6)
    //   $27484C tst.w ($18,A6) / bmi $274AF0  <- THE DEATH ARM
    //   $274854 move.b D0,($1D,A6)            <- and on into the fire machine
    //
    // `($38,A6)` is the HP FLOOR the port already names (`S.f38`, W30 found it
    // in `$275914`).  The clamp is MONOTONIC: HP and the floor both become
    // min(HP, floor), so the floor can only ever fall.
    // ================================================================
    let d0 = ram.u8(a6 + S.palette);                   // $274822
    if (d0 === 0x19) d0 = ram.u8(a5 + R.rec1C);        // $274826/$27482C
    d0 = (d0 ^ ram.u8(a5 + R.rec1D)) & 0xff;           // $274830/$274834
    let d4 = ram.u16(a6 + S.hp);                       // $274836
    if (i16(d4) > i16(ram.u16(a6 + S.f38))) d4 = ram.u16(a6 + S.f38); // $27483A/$274840
    ram.setU16(a6 + S.hp, d4);                         // $274844
    ram.setU16(a6 + S.f38, d4);                        // $274848
    if ((d4 & 0x8000) !== 0) {                         // $27484C tst.w / bmi $274AF0
      deathSeq82(ram, rom, a5, a6, ctx, dmg);          // $274850 bmi.w $274AF0
      return;
    }
    ram.setU8(a6 + S.palette, d0);                     // $274854
  } else {
    // $2747FA..$274810 -- THE NO-DAMAGE ARM, four instructions, and it is the
    // OTHER writer of ($1D,A6).  Ported by W81 because `$274854` is where both
    // arms converge and the block below starts there.
    let d0 = ram.u8(a5 + R.rec1C);                     // $2747FA move.b ($1C,A5),D0
    if (i16(ram.u16(a6 + S.hp)) < 0x80 && ram.u16(G.ca) === 0) { // $2747FE/$274806
      d0 = 0x19;                                       // $27480E moveq #$19,D0
    }
    ram.setU8(a6 + S.palette, d0);                     // $274854 move.b D0,($1D,A6)
  }
  fire82(ram, rom, a5, a6, ctx);                       // $274858
}

// ---- $274858..$274AEE: TYPE $82's fire/state machine.  ITS DRAW IS WIRED
// ---- BY W81; the two BULLET arms stay counted notes and say why.
//
// W68 §2.2 measured type $82 as 21 spawned objects and 9,730 invisible
// collidable slot-frames -- the single largest invisible population in the
// stage -- and W75 §3.1 photographed it off the board: a 96x88 blue
// forward-swept-wing fighter, up to six on screen, arriving on the same 25-frame
// rung the midboss dies on.  Its three enqueue sites are `$274A28`, `$274A4A`
// and `$274A7E` and all three are inside what was one counted note.
//
// **THE THREE RECORDS ARE THREE DIFFERENT EMITTERS AND TWO DIFFERENT BUCKETS**,
// which is why "wire the enqueue" is not one line:
//
//   $274A28 jsr $23DBCA   ZOOMING, record convention, ($A,A6) = $1735FC,
//                         bucket 7 -- and $23DBCA is NOT $23D9E2; it is the
//                         member of that family $7A*3 further on (spritequeue
//                         `resolveZoomStub`).  It is also the FIRST producer
//                         this project has ever had for the zooming family,
//                         and it found a defect in it (see there).
//   $274A4A jsr $23DF86   register convention, bucket 7, D2 = ($28,A5) out of
//                         the 32-entry heading table $272DFA -- the $151E10
//                         family shard 11 has shipped since W58.
//   $274A7E jsr $23DF58   register convention, a DIFFERENT bucket, D2 = the
//                         immediate $173810 -- and it is gated on RANK
//                         (`tst.w $813098`) so a rank-0 run never asks for it.
//
// WHAT IS STILL A NOTE, AND WHY.  `$27487A..$2749B2` is the aim + the six
// bullet fans (`$281708` x4, `$281764` x2) and `$274A9C..$274AEE` is a seventh
// through `$281484`.  Those are W21/W26/W27's subject, not this wave's; every
// arm of them falls into the draw at `$274A22`, which is why the draw can be
// wired without them and why the fighter becomes visible without inventing a
// bullet.  The state they do not update is ($30,A5)/($31,A5), read by nothing
// else in this handler.
function fire82(ram, rom, a5, a6, ctx) {
  const u = ctx.unported;
  u?.note(0x28ac72, `$28AC72 sub-record spawn engine in $82 rec $${
    a5.toString(16)}`);                                // $274858 jsr $28AC72
  // $27485E tst.l $8130D2 -- a LONG test, unlike $10's and $11's word tests.
  let toHeading = false;
  if (ram.u32(G.freeze) === 0) {                       // $27485E / $274864 bne
    if (i16(ram.u16(a6 + 0x02)) >= 0x1000) {           // $274868 cmpi.w #$1000 / blt
      const cd = ram.u8(a5 + R.rec1E);                 // $274872 subq.b #1,($1E,A5)
      ram.setU8(a5 + R.rec1E, (cd - 1) & 0xff);
      if (cd === 0) {                                  // $274876 bcc $2749B4
        // $27487A..$2749B2 -- the aim and the six fans.
        u?.note(0x2747c6, `$82 aim/fan block $27487A..$2749B2 (aim256 $2422A2 `
          + `+ $281708 x4 / $281764 x2 -- W21/W26/W27) rec $${a5.toString(16)}`);
      }
    }
    toHeading = true;                                  // $2749B4 is reached
  }
  if (toHeading) {
    // $2749B4..$274A1C -- THE HEADING, and it is the block that picks ($28,A5).
    const cd = ram.u8(a5 + R.headCadence26);           // $2749B4 subq.b #1,($26,A5)
    ram.setU8(a5 + R.headCadence26, (cd - 1) & 0xff);
    if (cd === 0) {                                    // $2749B8 bcc $274A22
      // $2749CE..$2749EA is `$24270A` INLINED -- the same six instructions,
      // keyed on ($3,A5), with the "neither player alive" exit branching to
      // the DRAW instead of setting the carry.  IT IS CALLED SEPARATELY HERE,
      // in the ROM's own order, rather than through `aim64FromCaller`: the
      // cartridge does `bsr`-equivalent select, THEN `jsr $24203E`, and a port
      // that builds the aim tables before the select does work on a frame the
      // 68000 does not.
      const sel = targetSelect(ram, a5);               // $2749CE..$2749EA
      if (!sel.carry) {                                // $2749E8 bpl $274A22
        const dir = aim64(aimTables(rom),
          u16(ram.u16(a6 + 0x02) + 0x240),             // $2749F8 addi.w #$240,D0
          ram.u16(a6 + 0x04),                          // $2749F2 movem.w ($2,A6)
          ram.u16(sel.addr + 2), ram.u16(sel.addr + 4)); // $2749EC movem.w ($2,A0)
        const nf = slew64(ram.u16(a5 + R.rec2C) & 0xff, dir);  // $274A02/$274A06
        ram.setU16(a5 + R.rec2C, nf);                  // $274A0C move.w D1,($2C,A5)
        ram.setU32(a5 + R.rec28,                       // $274A1C move.l (A3,D1.w)
          rom.u32(0x272dfa + ((nf & 0x3e) * 2)));      // $274A10/$274A16 lea $272DFA
      }
    }
  }
  draw82(ram, rom, a5, a6);                            // $274A22
  // $274A84..$274A98: the SECOND cooldown, and its fire is a note.
  if (ram.u32(G.freeze) !== 0) return;                 // $274A84 tst.l / bne $274A9A
  if (i16(ram.u16(a6 + 0x02)) < 0x1000) return;        // $274A8C cmpi.w / blt
  const c2 = ram.u8(a5 + R.cadence22);                 // $274A94 subq.b #1,($22,A5)
  ram.setU8(a5 + R.cadence22, (c2 - 1) & 0xff);
  if (c2 !== 0) return;                                // $274A98 bcs $274A9C
  u?.note(0x274a9c, `$82 second fire $274A9C..$274AEE ($27327A muzzle table -> `
    + `$281484 -- W27) rec $${a5.toString(16)}`);
}

/** `$274A22..$274A82` -- TYPE $82's THREE RECORDS. */
function draw82(ram, rom, a5, a6) {
  // $274A22 move.l #$60005000,D6 / $274A28 jsr $23DBCA -- the ZOOMING enqueue,
  // bucket read out of the cartridge by `resolveZoomStub`.
  enqueueZoomedThroughStub(ram, rom, 0x23dbca, a6, 0x60005000);
  // $274A2E..$274A3C: TWO INDEPENDENT WORD ADDS around a `swap`, NOT an
  // `addi.l` -- the short axis's carry must not reach the long axis.
  const pos = ram.u32(a6 + 0x02);
  const d1 = (((u16((pos >>> 16) + 0xfc40) << 16) | u16((pos & 0xffff) + 0xfc00))
    >>> 0);                                            // $274A32/$274A38
  enqueueRegistersThroughStub(ram, rom, 0x23df86, d1,
    ram.u32(a5 + R.rec28),                             // $274A3E move.l ($28,A5),D2
    0x620,                                             // $274A42 move.w #$620,D3
    ram.u16(a6 + S.f1c));                              // $274A46 move.w ($1C,A6),D4
  // $274A50/$274A58: RANK and $80390C. A rank-0 single-player run never draws
  // the third record, which is exactly why its art cannot be harvested off a
  // run and is an immediate in `tools/export-web.mjs W81_IMMEDIATES`.
  if (ram.u16(G.rank98) !== 0) return;                 // $274A50 tst.w / bne $274A84
  if (ram.u16(G.mirror2) === 0) return;                // $274A58 tst.w / beq $274A84
  const d1b = (((u16((pos >>> 16) + 0xe200) << 16) | u16((pos & 0xffff) + 0x300))
    >>> 0);                                            // $274A64/$274A6A
  enqueueRegistersThroughStub(ram, rom, 0x23df58, d1b,
    0x173810,                                          // $274A70 move.l #$173810,D2
    0x628,                                             // $274A76 move.w #$628,D3
    0x18);                                             // $274A7A move.w #$18,D4
}

// ============================================================ TYPE $8B (25)
// `$27687E`.  A SCROLL-LOCKED GROUND GUN: it does NOT call stepMovement.  It
// calls `$24179E` scrollCompensate directly (position tracks the cross-axis
// scroll only), then a bounds test, a stage/clock gate, the damage branch, and
// on death spawns effects + `$27F8EE` (W29) + free.  flow.py TRUE span
// `$27687E..$276936` (190 B, 47 insns -- the smallest of the six).
function handler8B(ram, rom, a5, ctx) {
  const { unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  // $27687E: a stage-kill gate.  $8130F8 bit 7 set -> free immediately.
  if ((ram.u8(0x8130f8) & 0x80) !== 0) { freeEnemy(ram, a5); return; } // tst.b $8130F8 / bmi
  // $276886: scroll compensation (the position driver -- NOT stepMovement).
  scrollCompensate(ram, a5);                            // jsr $24179E (W24)
  // $27688C..$2768C2: bounds test.  X += $400 + $8c00; Y += $400 + (scroll-$f800)
  //  + $c000.  Off-screen-after-on-screen -> free.
  const pos = ram.u32(a6 + 0x02);
  let x = u16((pos >>> 16) + 0x400);                   // $27688C/$276890
  let off = u16(x) + 0x8c00 > 0xffff;                  // $276894 addi.w #$8c00
  if (!off) {                                          // $276898 bcs $2768B4
    let sc = u16(ram.u16(G.scroll) - 0xf800);          // $27689A/$2768A0 subi.w
    let y = u16(u16((pos & 0xffff) + 0x400) + sc);     // $2768A4/$2768A8/$2768AC
    off = u16(y) + 0xc000 > 0xffff;                    // $2768AE addi.w #$c000
  }
  if (off) {                                           // $2768B2 bcc $2768C2
    if (ram.u16(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; } // jmp $263762
  } else {
    ram.setU16(a5 + R.onScreen, 1);                    // move.b #$1,$16(A5)
  }
  // $2768C8: stage-1 && clock >= 4 -> set sub-flags bit 5 (a fire-enable).
  if (ram.u16(G.stage) === 1 && i16(ram.u16(G.clock)) >= 4) { // cmpi #$1,$813092
    ram.bset8(a6, 5);                                  // $2768DC bset #5,(A6)
  }
  // $2768E0: the damage/hit branch.  flags & $5c -> clear, HP check -> death.
  if ((ram.u8(a6) & 0x5c) !== 0) {                     // $2768E0 moveq #$5c / and.b
    const d1 = hitMask(ram, a6);
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // $2768E6 andi.b #$a3,(A6)
    // $8B is the ONE ported handler that never calls `$286096`: its damage
    // branch goes straight from the flag clear to `$2768EA tst.w ($18,A6)`.
    // So a hit that does not kill an $8B scores nothing at all.
    if ((ram.u16(a6 + S.hp) & 0x8000) !== 0) {         // $2768EA tst.w $18 / bmi
      scoreKill(ram, rom, ctx, 0x01, d1);              // $2768F2/$2768F4 jsr $28615E
      ctx.soundPost?.(0x28c25a);                       // WAVE A: SFX id=0, death burst      // jsr $28C25A
      u?.note(0x27f8ee, `$27F8EE $8B death routine (W29) rec $${a5.toString(16)}`);
      // W54: SPAWNED.  $27690E moveq #$1 / $276910 jsr $289004, then
      // $276916..$276932 -- the $278320 remap and the $24179E hook.
      {
        const e = effectArmShared278320(ram, rom, ctx, a6, 0x01, 0x276910);
        ram.setU16(e + B.hook, 1);                      // $27692E/$276932
      }
      freeEnemy(ram, a5);                              // jmp $263762
      return;
    }
    return;                                           // $2768F0 rts (alive after hit)
  }
  // (no damage: the handler rts -- $8B has no per-frame fire in THIS arm; its
  //  fire is gated by the stage/clock bit-5 set above and run elsewhere.)
}

// ================================================= TYPES $85 AND $86 (W30)
// `$275914`.  THE HANDLER THAT BLOCKED THE GATE: W29 wired the enemy subsystem
// into the frame loop and `fly-around` stopped at logic frame 2346 with
// `Unreached $275914`, which is why this wave exists.
//
// **TWO TYPES SHARE IT**, read out of the type table (`$27E412 + (t-$80)*8`):
// `$85` (init `$275812`, body `$27581A`, W23) and `$86` (init `$275BAE`, body
// `$275BB6`, NOT in W23's 21 because stage 1's script has no `$86` record).
// The handler branches on which at `$275AFC cmpi.b #$86,($C,A5)` in its death
// arm, so the distinction is transcribed rather than folded away.
//
// **THE SPAN IS `$275914..$275BAA` AND CONTROL FLOW DECIDES IT.**  `$275BA6 jmp
// $263762` ends the death arm, `$275BAC` is a `nop` pad, and `$275BAE` is type
// `$86`'s init stub falling through into its init body -- a different routine
// that a linear sweep prints as though it belonged to this one.
//
// WHAT MAKES THIS HANDLER DIFFERENT FROM THE OTHER SIX: it is the first ported
// handler that **emits sprites** (`$23D852`/`$23DF86` into bucket 7 and
// `$23DF58` into bucket 3, all three through W11's enqueue API) and the first
// that **fires a bullet in the live path** (`$275AD0 jsr $2813F0`), because all
// four of that generator's register arguments are computed inside the handler
// -- no `$23Dxxx` fire-action, no separate aim state machine.
function handler85(ram, rom, a5, ctx) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, tables, u)) return;   // $275914 jsr $2638A6
  // $27591A jsr $2426A4 / $275920 bcc $275930 -- carry SET is off-screen.
  if (offScreen2426A4(ram, a6)) {
    // $275922 tst.b ($16,A5) / beq $275936.  A BYTE test, unlike $11's word.
    if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; } // $275928 jmp $263762
  } else {
    ram.setU8(a5 + R.onScreen, 1);                     // $275930 move.b #$1,($16,A5)
  }
  // $275936 move.l ($2,A6),($22,A6) -- BOTH operands are A6 (see handler82's
  // fix above: this is the instruction that exposed it).
  ram.setU32(a6 + R.sprite22, ram.u32(a6 + 0x02));
  // $27593C: the damage test combines (A6) and ($20,A6), like type $82's.
  const dmg = (ram.u8(a6) | ram.u8(a6 + 0x20)) & 0x5c; // move.b (A6)/or.b $20/andi.w #$5c
  let d0;
  if (dmg === 0) {                                     // $275946 bne $275960
    d0 = ram.u8(a5 + R.rec1C);                         // $275948 move.b ($1C,A5),D0
    // $27594C cmpi.w #$1c0,($18,A6) / bcc $2759A2 -- an UNSIGNED HP compare, so
    // a "negative" (dead) HP is >= $1C0 and takes this arm too.
    if (ram.u16(a6 + S.hp) < 0x1c0                     // $275952 bcc
        && ram.u16(G.ca) === 0) {                      // $275954 tst.w $8130CA / bne
      d0 = 0x19;                                       // $27595C moveq #$19,D0
    }
  } else {
    // ---- $275960: the damage arm.
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // $275964 and.b D0,(A6)  (D0=$A3)
    ram.setU8(a6 + 0x20, ram.u8(a6 + 0x20) & 0xa3);    // $275966 and.b D0,($20,A6)
    scoreHit(ram, ctx, a6, dmg);                       // $27596A jsr $286096 (W34)
    d0 = ram.u8(a6 + S.palette);                       // $275970 move.b ($1D,A6),D0
    if (d0 === 0x19) d0 = ram.u8(a5 + R.rec1C);        // $275974 cmpi.b #$19 / $27597A
    d0 = (d0 ^ ram.u8(a5 + R.rec1D)) & 0xff;           // $27597E/$275982 eor.b D2,D0
    // $275984..$275996: D4 = min(($18,A6), ($38,A6)) SIGNED, written to both.
    let d4 = ram.u16(a6 + S.hp);                       // $275984 move.w ($18,A6),D4
    if (i16(d4) > i16(ram.u16(a6 + S.f38)))            // $275988 cmp.w ($38,A6),D4 / ble
      d4 = ram.u16(a6 + S.f38);                        // $27598E
    ram.setU16(a6 + S.hp, d4);                         // $275992
    ram.setU16(a6 + S.f38, d4);                        // $275996
    if ((ram.u16(a6 + S.hp) & 0x8000) !== 0) {         // $27599A tst.w / $27599E bmi
      deathSeq85(ram, rom, a5, a6, ctx, dmg);          // $275AF2
      return;
    }
  }
  // ---- $2759A2: the common tail.
  ram.setU8(a6 + S.palette, d0);                       // $2759A2 move.b D0,($1D,A6)
  // $2759A6 jsr $28AC72 -- the SUB-RECORD SPAWN ENGINE.  It walks a script
  // pointer at ($44,A5) and, each time HP ($18,A6) drops past the next
  // threshold word, allocates out of the ten-slot pool at $81DB90 (stride $26,
  // counted at $81DD0C) and installs a part. W173 also ports the pool driver.
  // Its return value is DEAD here -- the
  // next instruction is `tst.l $8130D2`, so its return value is dead. W182
  // closes the live spawn/advance side effects for both sharing types.
  spawnCues28AC72(ram, rom, a5, a6);
  // $2759AC tst.l $8130D2 -- a LONG test, so it covers $8130D2 AND $8130D4.
  if (ram.u32(G.freeze) === 0) {                       // $2759B2 bne $275A24
    // $2759B6 subq.b #1,($22,A5) / bcc $275A24 -- the aim CADENCE.  `bcc` is
    // "no borrow", so the aim runs only on the frame the byte was already 0.
    const cad = ram.u8(a5 + R.cadence22);
    ram.setU8(a5 + R.cadence22, (cad - 1) & 0xff);
    if (cad === 0) {                                   // $2759BA bcc $275A24
      ram.setU8(a5 + R.cadence22, ram.u8(a5 + R.rec23)); // $2759BE reload from +$23
      // $2759C4 move.b ($20,A5),D0 / cmp.b ($21,A5),D0 / bne $275A24
      if (ram.u8(a5 + R.salvo) === ram.u8(a5 + R.rec21)) {
        aim85(ram, rom, a5, a6);                       // $2759D0..$275A1E
      }
    }
  }
  // ---- $275A24: THE DRAW.  Three sprite requests, all through W11's API.
  // $275A24 jsr $23D852 -- the per-record stub on BUCKET 7 ($807450/$80AFC8),
  // reading the sub-record's own seven fields.
  enqueueRequest(ram, 7, a6);
  // $275A2A..$275A46: the second request, REGISTER convention, also bucket 7.
  // D1 = the position with a muzzle bias on each axis; the low word is the
  // SHORT axis and the high word the LONG one (src/spritequeue.js §the spec),
  // and the two `addi.w`s straddle a `swap`, so neither may carry into the
  // other half.
  const pos = ram.u32(a6 + 0x02);                      // $275A2A move.l ($2,A6),D1
  const d1a = ((u16((pos >>> 16) + 0xf300) << 16)      // $275A34 addi.w #$f300 (long)
    | u16((pos & 0xffff) + 0xfc00)) >>> 0;             // $275A2E addi.w #$fc00 (short)
  enqueueRegisters(ram, 7, d1a,
    ram.u32(a5 + R.rec24),                             // $275A3A move.l ($24,A5),D2
    0x620,                                             // $275A3E move.w #$620,D3
    ram.u16(a6 + S.f1c));                              // $275A42 move.w ($1C,A6),D4
  // $275A4C..$275A64: three gates before the THIRD request.  All three are
  // "skip it": rank non-zero, the $80390C alternation word zero, or stage 2.
  if (ram.u16(G.rank98) === 0                          // $275A4C tst.w $813098 / bne
      && ram.u16(G.mirror2) !== 0                      // $275A54 tst.w $80390C / beq
      && ram.u16(G.stage) !== 2) {                     // $275A5C cmpi.w #$2,$813092 / beq
    const d1b = ((u16((pos >>> 16) + 0xe400) << 16)    // $275A70 addi.w #$e400
      | u16((pos & 0xffff) + 0x400)) >>> 0;            // $275A6A addi.w #$400
    // $275A84 jsr $23DF58 -- BUCKET 3 ($80688C/$80AFC6).  D2 is the LITERAL
    // sprite-descriptor address $192A48 ($275A76 move.l #$192a48,D2), not a
    // table read, so nothing is fetched from a window here.
    enqueueRegisters(ram, 3, d1b, 0x192a48, 0x820, 0x18);
  }
  // ---- $275A8A: the FIRE cadence.
  if (ram.u32(G.freeze) !== 0) return;                 // $275A8A tst.l / $275A90 bne
  if (i16(ram.u16(a6 + 0x02)) < 0x1000) return;        // $275A92 cmpi.w #$1000 / blt
  const fc = ram.u8(a5 + R.rec1E);                     // $275A9A subq.b #1,($1E,A5)
  ram.setU8(a5 + R.rec1E, (fc - 1) & 0xff);
  if (fc !== 0) return;                                // $275A9E bcs $275AA2 (borrow only)
  fire85(ram, rom, a5, a6, ctx);                       // $275AA2
}

// ---- $2759D0..$275A1E: the INLINED target select + aim + slew ------------
// The ROM does NOT `bsr $24270A` here; it writes the two player-record
// addresses out longhand.  It is the same routine (`src/aim.js`
// `targetSelectBy`), and it is transcribed inline rather than delegated so that
// a reader checking `$2759D0` against this file sees the same four tests.
function aim85(ram, rom, a5, a6) {
  let p0 = AIM.selP1, p1 = AIM.selP2;                  // $2759D0 lea / $2759D6 lea
  if (ram.u8(a5 + 0x03) !== 0) { p0 = AIM.selP2; p1 = AIM.selP1; } // $2759DC/$2759E2 exg
  if ((ram.u16(p0) & 0x8000) === 0) {                  // $2759E4 tst.w (A0) / bmi
    if ((ram.u16(p1) & 0x8000) === 0) return;          // $2759E8 tst.w (A1) / bpl $275A24
    const t = p0; p0 = p1; p1 = t;                     // $2759EC exg A0,A1
  }
  const tgtY = ram.u16(p0 + 2);                        // $2759EE movem.w ($2,A0),D2-D3
  const tgtX = ram.u16(p0 + 4);
  const selfY = ram.u16(a6 + 0x02);                    // $2759F4 movem.w ($2,A6),D0-D1
  const selfX = ram.u16(a6 + 0x04);
  // $2759FA addi.w #$f900,D0 -- THE MUZZLE OFFSET, on the long axis only.
  const dir = aim64(aimTables(rom), u16(selfY + 0xf900), selfX, tgtY, tgtX); // $2759FE
  const nf = slew64(ram.u16(a5 + R.fireCtr), dir);     // $275A04/$275A08 jsr $242190
  ram.setU16(a5 + R.fireCtr, nf);                      // $275A0E move.w D1,($28,A5)
  // $275A12 andi.w #$3E,D1 / add.w D1,D1 -- 32 entries at a 4-byte stride.
  ram.setU32(a5 + R.rec24, rom.u32(0x272DFA + ((nf & 0x3e) * 2))); // $275A18/$275A1E
}

// ---- $275AA2..$275AF0: THE FIRE ------------------------------------------
// The first handler fire wired into the live path.  Every register the
// generator reads is computed here; there is no `$23Dxxx` fire-action and no
// stored aim byte, which is exactly why this one is wirable and $11's is a
// separate piece of work.
function fire85(ram, rom, a5, a6, ctx) {
  ram.setU8(a5 + R.rec1E, 6);                          // $275AA2 move.w #$6,D0 / $275AA6
  const facing = ram.u16(a5 + R.fireCtr);              // $275AB0 move.w ($28,A5),D1
  // $275AB4 move.w D1,D0 / andi.w #$3E,D0 / add.w D0,D0 -- 32 longwords.
  const idx = u16((facing & 0x3e) * 2);
  // $275ABC move.l (A4,D0.w),D3 / $275AC0 addi.l #$f9000000,D3.  The `addi.l`
  // is on the WHOLE longword, so the carry out of the low half reaches the
  // high half -- write it as a 32-bit add, not two 16-bit ones.
  const d3 = ((rom.u32(MUZZLE_85 + idx) + 0xf9000000) >>> 0);
  const regs = {
    d0: 0xffff000d,                                    // $275AC6 move.l #$ffff000d,D0
    d1: facing, d2: ram.u32(a6 + 0x02) >>> 0,          // $275ACC move.l ($2,A6),D2
    d3, d4: 0, d5: 0, a5,
  };
  // $275AD0 jsr $2813F0.  Kind $D; `$2815C6[13]` is `$2818AC` (the do-nothing
  // epilogue) and template `$281AF8`'s +$10 run-init word is $0000, so D4/D5
  // are never read and passing 0 is not a guess.
  const res = fireBullet({ ram, rom, log: new WriteLog(ram) }, 0x2813f0, regs);
  ctx.bulletSpawn?.(0x275ad0, res);
  // $275AD6 subq.b #1,($20,A5) / bcc $275AF0 -- the SALVO counter.  On the
  // frame it borrows, ($1E,A5) is reloaded with $50 - $8130BA instead of the
  // 6 written at $275AA6, i.e. a long gap between salvos and a short one
  // inside them.
  const salvo = ram.u8(a5 + R.salvo);                  // ($20,A5)
  ram.setU8(a5 + R.salvo, (salvo - 1) & 0xff);
  if (salvo !== 0) return;                             // $275ADA bcc $275AF0
  ram.setU8(a5 + R.salvo, ram.u8(a5 + R.rec21));       // $275ADC move.b ($21,A5),($20,A5)
  ram.setU8(a5 + R.rec1E, u16(0x50 - ram.u16(G.ba)) & 0xff); // $275AE2/$275AE6/$275AEC
}

// ---- $275AF2..$275BA6: the DEATH sequence --------------------------------
// **THE DROP THE OWNER WAS MISSING IS TWELVE INSTRUCTIONS ABOVE AN EXPLOSION
// W54 ALREADY PORTED**, and until W61 the port ran the explosion and skipped
// the drop in the same twelve.  `$275B06` and `$275B1A jsr $27E812` are the
// two handler85 sites in the routine's nine-site `$27E812` inventory. W164
// additionally makes the player's own `$24A10E` death-drop site live; the
// stage-1 boss sites and two bodies from recon 59 remain separate owners.
//
//   $275AF2  moveq #$25,D0 / jsr $28615E   THE KILL SCORE.        ported W34
//   $275AFA  moveq #$0,D0
//   $275AFC  cmpi.b #$86,($C,A5) / bne     ($C,A5) is THE TYPE BYTE
//   $275B04  moveq #$8,D0                  type $86 drops KIND $8
//   $275B06  jsr $27E812                   ** DROP #1 **          W61
//   $275B0C  tst.w $81308C / bne $275B20   the two-player gate
//   $275B14  cmpi.w #$8,D0 / beq $275B20
//   $275B1A  jsr $27E812                   ** DROP #2 **          W61
//   $275B20  moveq #$5,D0 / jsr $289004    the explosion.         ported W54
//
// **THE DROP IS GUARANTEED AND THERE IS NO RNG IN IT** -- [M] no `$242B3C`,
// `$242E24`, `$803916` or `$803917` appears anywhere in `$275AF2..$275B20`.
// The only conditions are the enemy's own type byte and `$81308C`, and
// `src/shots.js` has `$81308C` MEASURED at `$0001` on this tree, so **type `$85`
// drops ONE power-up here and would drop TWO in a two-player game.**  (The
// ITEM, once it exists, does draw from the RNG -- `src/items.js init27EACE`.)
function deathSeq85(ram, rom, a5, a6, ctx, d1) {
  const u = ctx.unported;
  scoreKill(ram, rom, ctx, 0x25, d1);                  // $275AF2/$275AF4
  // $275AFA moveq #$0,D0 / $275AFC cmpi.b #$86,($C,A5) / $275B04 moveq #$8,D0
  const d0 = ram.u8(a5 + 0x0c) === 0x86 ? 8 : 0;
  spawnItem(ram, rom, ctx, d0, a6, 0x275b06);          // $275B06 jsr $27E812
  // $275B0C tst.w $81308C / bne $275B20 ; $275B14 cmpi.w #$8,D0 / beq $275B20
  if (ram.u16(0x81308c) === 0 && d0 !== 8) {
    spawnItem(ram, rom, ctx, d0, a6, 0x275b1a);        // $275B1A jsr $27E812
  }
  // $275B20/$275B4C/$275B72: three effect allocations, each followed by field
  // writes into the record `$289004` would have returned in A0.  The writes are
  // part of the noted gap, not a separate one.
  // W54: SPAWNED, all three.  NO REMAP TABLE -- these hardcode bucket $10
  // (bucket 7).  [M] kind $5 is NOT in `50-recon` 2.4's measured eight;
  // it is enumerated from the listing, which is docs/knowledge/09's rule.
  {
    const e1 = spawnEffect(ram, ctx, 0x05, 0x275b22);   // $275B20/$275B22
    ram.setU32(e1 + B.pos, ram.u32(a6 + 0x02));         // $275B28
    ram.setU16(e1 + B.bucket, 0x10);                    // $275B2E
    ram.setU16(e1 + B.sub12, 0x0000);                   // $275B34
    ram.setU16(e1 + B.sub14, 0x0400);                   // $275B3A
    ram.setU16(e1 + B.nudge, 0x0200);                   // $275B40
    ram.setU16(e1 + B.nudge + 2, 0x0200);               // $275B46
    const e2 = spawnEffect(ram, ctx, 0x0c, 0x275b4e);   // $275B4C/$275B4E
    ram.setU32(e2 + B.pos, ram.u32(a6 + 0x02));         // $275B54
    ram.setU16(e2 + B.bucket, 0x10);                    // $275B5A
    ram.setU16(e2 + B.sub12, 0x0000);                   // $275B60
    ram.setU16(e2 + B.sub14, 0x0000);                   // $275B66
    ram.setU16(e2 + B.nudge, 0xf600);                   // $275B6C
    const e3 = spawnEffect(ram, ctx, 0x84, 0x275b76);   // $275B72/$275B76
    ram.setU32(e3 + B.pos, ram.u32(a6 + 0x02));         // $275B7C
    ram.setU16(e3 + B.bucket, 0x10);                    // $275B82
    ram.setU16(e3 + B.sub12, 0x0000);                   // $275B88
    ram.setU16(e3 + B.sub14, 0x0000);                   // $275B8E
    ram.setU16(e3 + B.nudge, 0xee00);                   // $275B94
    ram.setU16(e3 + B.nudge + 2, 0xfe00);               // $275B9A
  }
  ctx.soundPost?.(0x28c274);                       // WAVE A: SFX id=1, death burst          // $275BA0 jsr $28C274
  freeEnemy(ram, a5);                                  // $275BA6 jmp $263762
}

// ================================================= TYPE $80 (W30) =========
// `$2739C0`, span `$2739C0..$273F02` -- `$273EFE jmp $263762` ends the death
// arm, `$273F04` is a `nop` pad and `$273F06` is type $81's init stub.  310
// instructions, the second-largest stage-1 body after the midboss, and the
// second gate blocker: with `$275914` ported, `fly-around` stopped here at
// logic frame 2634.
//
// It is the type $85 skeleton with four things bolted on, and every one of them
// resolves to code this project already has:
//   * a SHIELD timer on `($36,A5)` that pins HP at `$7FFF` until it expires;
//   * a big aim256 fan -- `$2422A2` then EIGHT `$2817B8` spawns off `$2735FA`,
//     or SEVEN `$2817A8` off `$2736FA`, chosen by stage and `($20,A5)`;
//   * TWO independent turrets, alternated frame by frame by
//     `$273C3A bchg #$6,($1,A6)`, each with its own facing word
//     (`($2C,A5)` / `($32,A5)`) and its own sprite pointer;
//   * two more `$281484` fires off the 32-entry muzzle table `$27347A`.
// Four sprite requests, all through W11's enqueue API.
function handler80(ram, rom, a5, ctx) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, tables, u)) return;   // $2739C0 jsr $2638A6
  // $2739C6..$2739E4: bounds.  Y += $1800 + scroll + $9800; X += $1400 + $7400.
  const p0 = ram.u32(a6 + 0x02);
  let off = u16(u16((p0 & 0xffff) + 0x1800) + ram.u16(G.scroll)) + 0x9800 > 0xffff;
  if (!off) off = u16((p0 >>> 16) + 0x1400) + 0x7400 > 0xffff;   // $2739DC/$2739E0
  if (off) {                                           // $2739E4 bcc $2739F4
    if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; } // $2739EC
  } else {
    ram.setU8(a5 + R.onScreen, 1);                     // $2739F4
  }
  ram.setU32(a6 + R.sprite22, ram.u32(a6 + 0x02));     // $2739FA (BOTH A6)
  // $273A00: THE SHIELD.  While `($36,A5)` is non-negative the HP pair is held
  // at $7FFF -- invulnerable -- and the counter is decremented by 1, or by 2
  // while `$811F72` is set.  On the BORROW the HP pair drops to $1400 and the
  // enemy becomes killable.  `sub.w` then `bcc`, so the borrow is the event.
  if ((ram.u16(a5 + 0x36) & 0x8000) === 0) {           // $273A00 tst.w / bmi
    ram.setU16(a6 + S.hp, 0x7fff);                     // $273A08/$273A0C
    ram.setU16(a6 + S.f38, 0x7fff);                    // $273A10
    const step = ram.u16(0x811f72) !== 0 ? 2 : 1;      // $273A14/$273A18/$273A22
    const cur = ram.u16(a5 + 0x36);
    ram.setU16(a5 + 0x36, u16(cur - step));            // $273A26 sub.w D0,($36,A5)
    if (cur < step) {                                  // $273A2A bcc $273A3A
      ram.setU16(a6 + S.hp, 0x1400);                   // $273A2E/$273A32
      ram.setU16(a6 + S.f38, 0x1400);                  // $273A36
    }
  }
  // $273A3A: the damage branch -- $275914's, with $255 where $85 has $1C0.
  const dmg = (ram.u8(a6) | ram.u8(a6 + 0x20)) & 0x5c; // $273A3A/$273A3C/$273A40
  let d0;
  if (dmg === 0) {                                     // $273A44 bne $273A5E
    d0 = ram.u8(a5 + R.rec1C);                         // $273A46
    if (ram.u16(a6 + S.hp) < 0x255                     // $273A4A cmpi.w / bcc
        && ram.u16(G.ca) === 0) d0 = 0x19;             // $273A52 tst.w / $273A5A
  } else {
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // $273A62
    ram.setU8(a6 + 0x20, ram.u8(a6 + 0x20) & 0xa3);    // $273A64
    scoreHit(ram, ctx, a6, dmg);                       // $273A68 jsr $286096 (W34)
    d0 = ram.u8(a6 + S.palette);                       // $273A6E
    if (d0 === 0x19) d0 = ram.u8(a5 + R.rec1C);        // $273A72/$273A78
    d0 = (d0 ^ ram.u8(a5 + R.rec1D)) & 0xff;           // $273A7C/$273A80
    let d4 = ram.u16(a6 + S.hp);                       // $273A82
    if (i16(d4) > i16(ram.u16(a6 + S.f38))) d4 = ram.u16(a6 + S.f38); // $273A86/$273A8C
    ram.setU16(a6 + S.hp, d4);                         // $273A90
    ram.setU16(a6 + S.f38, d4);                        // $273A94
    if ((ram.u16(a6 + S.hp) & 0x8000) !== 0) {         // $273A98 tst.w / $273A9C bmi
      deathSeq80(ram, rom, a5, ctx, dmg); return;      // $273DAE
    }
  }
  ram.setU8(a6 + S.palette, d0);                       // $273AA0
  u?.note(0x28ac72, '$28AC72 sub-record spawn engine in $80 rec $'
    + a5.toString(16) + ' -- see the $85 note; its result is unused by $273AAA');
  // $273AAA tst.l $8130D2 / bne $273C94 -- a freeze skips the fire AND both
  // turret aims and goes straight to the draw.
  if (ram.u32(G.freeze) === 0) {
    // $273AB4/$273ABC/$273AC6: three gates in front of the big fan.  ($18,A5)
    // is a WORD here (it is a BYTE cadence in type $11) -- non-zero means the
    // salvo has already been fired and the LASER tail owns the record.
    if (ram.u16(a5 + 0x18) === 0                       // $273AB4 tst.w / bne
        && i16(ram.u16(a6 + 0x02)) >= 0x1000) {        // $273ABC cmpi.w / blt
      const c = ram.u8(a5 + R.rec1E);                  // $273AC6 subq.b #1,($1E,A5)
      ram.setU8(a5 + R.rec1E, (c - 1) & 0xff);
      if (c === 0) {                                   // $273ACA bcc $273BEE
        ram.setU8(a5 + R.rec1E, ram.u8(a5 + 0x34));    // $273ACE reload from +$34
        fan80(ram, rom, a5, a6, ctx);                  // $273AD4..$273BCA
        // $273BCE: the SALVO counter, reachable only after the fan block.
        const sal = ram.u8(a5 + R.salvo);              // $273BCE subq.b #1,($20,A5)
        ram.setU8(a5 + R.salvo, (sal - 1) & 0xff);
        if (sal === 0) {                               // $273BD2 bcc $273BEE
          ram.setU8(a5 + R.salvo, ram.u8(a5 + R.rec21)); // $273BD4
          ram.setU8(a5 + R.rec1E, u16(0x50 - ram.u16(G.b8)) & 0xff); // $273BDA/$273BE4
          ram.setU16(a5 + 0x18, 1);                    // $273BE8 move.w #$1,($18,A5)
        }
      }
    }
    // $273BEE: the TURRET cadence, on ($26,A5) with reload ($27,A5).
    const t = ram.u8(a5 + 0x26);                       // $273BEE subq.b #1
    ram.setU8(a5 + 0x26, (t - 1) & 0xff);
    if (t === 0) {                                     // $273BF2 bcc $273C94
      ram.setU8(a5 + 0x26, ram.u8(a5 + 0x27));         // $273BF6
      if (ram.u8(a5 + 0x24) === ram.u8(a5 + 0x25))     // $273BFC/$273C00 bne
        turrets80(ram, rom, a5, a6);                   // $273C08..$273C8E
    }
  }
  // $273C94: FOUR sprite requests.
  enqueueRequest(ram, 7, a6);                          // $273C94 jsr $23D852
  const pos = ram.u32(a6 + 0x02);                      // $273C9A move.l ($2,A6),D1
  // $273C9E addi.w #$0 (the short axis is unbiased) / swap / $273CA4 addi.w #$80.
  const longA = u16((pos >>> 16) + 0x80);
  enqueueRegisters(ram, 7, ((longA << 16) | (pos & 0xffff)) >>> 0,
    ram.u32(a5 + 0x28), 0x628, ram.u16(a6 + S.f1c));   // $273CAA/$273CAE/$273CB2/$273CB6
  // $273CBC `move.w ($4,A6),D1` REPLACES ONLY D1's LOW WORD -- the high word is
  // still the $80-biased long axis from the request above.  A port that rebuilt
  // D1 from the record here would drop that bias.
  enqueueRegisters(ram, 7, ((longA << 16) | u16((pos & 0xffff) + 0xf600)) >>> 0,
    ram.u32(a5 + 0x2e), 0x628, ram.u16(a6 + S.f1c));   // $273CC0/$273CC4/$273CC8
  if (ram.u16(G.rank98) === 0 && ram.u16(G.mirror2) !== 0) { // $273CCE/$273CD6
    enqueueRegisters(ram, 3,
      ((u16((pos >>> 16) + 0xd600) << 16) | (pos & 0xffff)) >>> 0, // $273CE2/$273CE8
      0x172d18, 0xa40, 0x18);                          // $273CEE/$273CF4/$273CF8/$273CFC
  }
  // $273D02: the LASER tail, armed by ($18,A5) and cadenced on ($22,A5).
  if (ram.u16(a5 + 0x18) === 0) return;                // $273D02 tst.w / beq $273D1E
  if (ram.u32(G.freeze) !== 0) return;                 // $273D08 tst.l / bne
  if (i16(ram.u16(a6 + 0x02)) < 0x1000) return;        // $273D10 cmpi.w / blt
  const lc = ram.u8(a5 + 0x22);                        // $273D18 subq.b #1,($22,A5)
  ram.setU8(a5 + 0x22, (lc - 1) & 0xff);
  if (lc !== 0) return;                                // $273D1C bcs $273D20 only
  laser80(ram, rom, a5, a6, ctx);                      // $273D20
}

// $273AD4..$273BCA -- the aim256 fan.  TWO shapes, and which one runs is decided
// by the stage and by ($20,A5); both are `dbra` loops that step D1 by a fixed
// amount and read a 64-entry longword table with `((D1+2) & $FC)`.
function fan80(ram, rom, a5, a6, ctx) {
  // $273AD4..$273AF2: the inlined target select (see aim85).
  let p0 = AIM.selP1, p1 = AIM.selP2;
  if (ram.u8(a5 + 0x03) !== 0) { p0 = AIM.selP2; p1 = AIM.selP1; } // $273AE0/$273AE6
  if ((ram.u16(p0) & 0x8000) === 0) {                  // $273AE8 tst.w / bmi
    if ((ram.u16(p1) & 0x8000) === 0) return;          // $273AEC / $273AEE bpl $273BCE
    const t = p0; p0 = p1; p1 = t;                     // $273AF2 exg
  }
  const tgtY = ram.u16(p0 + 2), tgtX = ram.u16(p0 + 4);   // $273AF4 movem.w
  const selfY = ram.u16(a6 + 0x02), selfX = ram.u16(a6 + 0x04); // $273AFA
  // $273B00 addi.w #$fe00,D0 / $273B04 addi.w #$0,D1 (the short axis is unbiased).
  let d1 = aim256(aimTables(rom), u16(selfY + 0xfe00), selfX, tgtY, tgtX); // $273B08
  const d2 = ram.u32(a6 + 0x02);                       // $273B0E move.l ($2,A6),D2
  const d5 = 0xfe000000;                               // $273B12 move.l #$fe000000,D5
  const stage4 = ram.u16(G.stage) === 4;               // $273B1A cmpi.w #$4
  const s20 = ram.u8(a5 + R.salvo);
  // $273B1A..$273B5C: which loop, and D0.  Written as the listing branches.
  let wide;                                            // true = the $2735FA loop
  let d0;
  if (stage4) {                                        // $273B22 bne $273B44
    if (s20 === 5) { d0 = 0x00000004; wide = true; }   // $273B26/$273B30 bra $273B62
    else if (s20 === 4) { d0 = 0xffff0004; wide = true; } // $273B36 beq $273B4E, $273B5C
    else { wide = false; d0 = 0xfffe0004; }            // $273B40 bra $273B8E, $273BA0
  } else if (s20 === 1) {                              // $273B44 cmpi.b #$1 / bne
    d0 = 0x00000004; wide = true;                      // $273B4E, stage != 4 -> $273B62
  } else { wide = false; d0 = 0xffff0005; }            // $273B8E
  const entry = wide ? 0x2817b8 : 0x2817a8;
  const table = wide ? 0x2735fa : 0x2736fa;
  const step = wide ? 8 : 0xc;                         // $273B66 / $273BAA moveq
  const iters = wide ? 8 : 7;                          // $273B68 moveq #$7 / #$6, dbra
  d1 = (d1 - (wide ? 0x1c : 0x24)) & 0xff;             // $273B62 / $273BA6 subi.b
  for (let n = 0; n < iters; n++) {                    // $273B86 / $273BCA dbra
    const idx = u16((d1 + 2) & 0xfc);                  // $273B70/$273B72/$273B74
    const d3 = u32(rom.u32(table + idx) + d5);         // $273B78 / $273B7C add.l D5,D3
    const res = fireBullet({ ram, rom, log: new WriteLog(ram) }, entry,
      { d0, d1, d2, d3, d4: 0, d5, a5 });              // $273B7E / $273BC2
    ctx.bulletSpawn?.(entry, res);
    d1 = u16(d1 + step);                               // $273B84 / $273BC8 add.w D6,D1
  }
}

// $273C08..$273C8E -- the TWO turrets.  `bchg #$6,($1,A6)` both TESTS the old
// bit and FLIPS it, so the two arms alternate on consecutive aims and each
// turret re-aims at half the cadence.
function turrets80(ram, rom, a5, a6) {
  let p0 = AIM.selP1, p1 = AIM.selP2;
  if (ram.u8(a5 + 0x03) !== 0) { p0 = AIM.selP2; p1 = AIM.selP1; } // $273C14/$273C1A
  if ((ram.u16(p0) & 0x8000) === 0) {                  // $273C1C tst.w / bmi
    if ((ram.u16(p1) & 0x8000) === 0) return;          // $273C20 / $273C22 bpl $273C94
    const t = p0; p0 = p1; p1 = t;                     // $273C26 exg
  }
  const tgtY = ram.u16(p0 + 2), tgtX = ram.u16(p0 + 4);   // $273C28 movem.w
  const selfY = ram.u16(a6 + 0x02), selfX = ram.u16(a6 + 0x04); // $273C2E
  const was = (ram.u8(a6 + 0x01) & 0x40) !== 0;        // $273C3A bchg #$6,($1,A6)
  ram.setU8(a6 + 0x01, ram.u8(a6 + 0x01) ^ 0x40);
  // The two arms differ ONLY in the short-axis muzzle bias and in which pair of
  // record fields they own.  facing: ($2C,A5) / ($32,A5); sprite: ($28,A5) /
  // ($2E,A5), both out of $272F7A.
  const shortBias = was ? 0xfb00 : 0x0500;             // $273C70 / $273C46
  const facingOff = was ? 0x32 : 0x2c;                 // $273C7A / $273C50
  const gfxOff = was ? 0x2e : 0x28;                    // $273C8E / $273C64
  const dir = aim64(aimTables(rom), u16(selfY + 0x680), u16(selfX + shortBias),
    tgtY, tgtX);                                       // $273C42/$273C4A (or $273C6C/$273C74)
  const nf = slew64(ram.u16(a5 + facingOff), dir);     // $273C54 / $273C7E
  ram.setU16(a5 + facingOff, nf);                      // $273C5A / $273C84
  ram.setU32(a5 + gfxOff, rom.u32(0x272f7a + ((nf & 0x3e) * 2))); // $273C64 / $273C8E
}

// $273D20..$273DAC -- the laser pair.  Both fires go through `$281484` with a
// muzzle vector out of `$27347A` biased per turret, and the SECOND salvo
// counter ($24,A5) disarms the tail by clearing ($18,A5).
function laser80(ram, rom, a5, a6, ctx) {
  ram.setU8(a5 + 0x22, ram.u8(a5 + 0x35));             // $273D20 reload from +$35
  const d0 = ram.u16(G.stage) === 4 ? 0x00070013 : 0x00020013; // $273D2C/$273D32/$273D3E
  const d2 = ram.u32(a6 + 0x02);                       // $273D62 move.l ($2,A6),D2
  for (const [facingOff, shortBias] of [[0x2c, 0x0500], [0x32, 0xfb00]]) {
    const d1 = ram.u16(a5 + facingOff);                // $273D44 / $273D6C
    const t = rom.u32(0x27347a + u16((d1 & 0x3e) * 2)); // $273D50 / $273D78
    // $273D54/$273D58/$273D5A -- addi.w around a `swap`, so the two halves do
    // NOT carry into each other (unlike $273B7C's `add.l`).
    const d3 = ((u16((t >>> 16) + 0x680) << 16) | u16((t & 0xffff) + shortBias)) >>> 0;
    const res = fireBullet({ ram, rom, log: new WriteLog(ram) }, 0x281484,
      { d0, d1, d2, d3, d4: 0, d5: 0, a5 });            // $273D66 / $273D88
    ctx.bulletSpawn?.(0x281484, res);
  }
  const c = ram.u8(a5 + 0x24);                         // $273D8E subq.b #1,($24,A5)
  ram.setU8(a5 + 0x24, (c - 1) & 0xff);
  if (c !== 0) return;                                 // $273D92 bcc $273DAC
  ram.setU8(a5 + 0x24, ram.u8(a5 + 0x25));             // $273D94
  ram.setU8(a5 + 0x22, u16(0x30 - ram.u16(G.b8)) & 0xff); // $273D9A/$273D9E/$273DA4
  ram.setU16(a5 + 0x18, 0);                            // $273DA8 clr.w ($18,A5)
}

// $273DAE..$273EFE -- the death arm.  SIX `$289004` allocations, each followed
// by field writes into the record it would have returned in A0; all six are part
// of the one noted gap, not six separate ones.
function deathSeq80(ram, rom, a5, ctx, d1) {
  const u = ctx.unported;
  scoreKill(ram, rom, ctx, 0x83, d1);                  // $273DAE/$273DB4
  ctx.soundPost?.(0x28c2dc);                       // WAVE A: BGM id=5, death burst          // $273DBA jsr $28C2DC
  // W54: SPAWNED, all six.  No remap table -- every one hardcodes bucket
  // $10 (bucket 7).  [M] ALL SIX WRITE `($12,A0) = 1`, i.e. each asks pool
  // D for TWO records: `50-recon` 4.2's "every death arm writes ($12) = 0"
  // is falsified by this one arm six times over.  All twelve are refused
  // and counted (`src/effects.js` THE REFUSAL).
  // Every `null` below is a field the ROM does NOT write at that site, and
  // it is not the same as writing 0: `$289004` zeroes a FRESH slot, but a
  // bit-bucket allocation lands in $81C8B2, which still holds the LAST
  // discarded record's bytes.
  //   kind  site      ($26,A0)  ($28,A0)  ($1a,A0)  ($14,A0)  ($18,A0) ($1c,A0)
  const a6b = ram.u32(a5 + 0x06);                       // the SUB-RECORD (A6)
  for (const [kind, site, nHi, nLo, spdAng, sub14, delay, f1c] of [
    [0x0d, 0x273dc2, 0xf800, null, null, 0x0400, null, null],  // $273DC8..$273DE0
    [0x84, 0x273dea, 0xf600, 0x0600, 0x0754, 0x0000, null, null], // $273DF0..$273E14
    [0x84, 0x273e1e, 0xf600, 0xfa00, 0x07ac, 0x0400, null, 0x40], // $273E24..$273E4E
    [0x0d, 0x273e56, 0xf200, 0xfe00, 0x0798, 0x0000, 0x0002, null], // $273E5C..$273E86
    [0x0d, 0x273e8e, 0xf200, 0x0100, 0x0768, 0x0000, 0x0004, null], // $273E94..$273EBE
    [0x85, 0x273ec8, 0xf600, 0x0000, 0x0c80, 0x0400, 0x0004, null], // $273ECE..$273EF8
  ]) {
    const e = spawnEffect(ram, ctx, kind, site);
    ram.setU32(e + B.pos, ram.u32(a6b + 0x02));
    ram.setU16(e + B.bucket, 0x10);
    if (nHi !== null) ram.setU16(e + B.nudge, nHi);
    if (nLo !== null) ram.setU16(e + B.nudge + 2, nLo);
    if (spdAng !== null) ram.setU16(e + B.speed, spdAng);
    ram.setU16(e + B.sub12, 0x0001);
    ram.setU16(e + B.sub14, sub14);
    if (delay !== null) ram.setU16(e + B.delay, delay);
    if (f1c !== null) ram.setU8(e + B.f1c, f1c);
  }
  freeEnemy(ram, a5);                                  // $273EFE jmp $263762
}

// ================================================= TYPE $8A (W30) =========
// `$276702`, span `$276702..$276818` -- `$276814 jmp $263762` ends the death
// arm, `$27681A` is a `nop` pad, and `$27681C` is type $8B's init stub (whose
// body at `$276824` W23 already ports).  75 instructions, and the THIRD gate
// blocker: with `$275914` and `$2739C0` ported, `fly-around` stopped here at
// logic frame 2713.
//
// A scroll-locked prop like type `$8B`: no `stepMovement`, just
// `$24179E scrollCompensate`.  What is new is the tail -- it reaches an enqueue
// through the 18-entry primary DISPATCH TABLE `$27829C`, indexed by the sub-record's
// `($1E,A6)` word, which is why `resolveEmitStub` exists (src/spritequeue.js
// 1c).  For this type the prototype leaves that word 0, i.e. `$23D762`, i.e.
// BUCKET 0 -- the bucket W28 measured at 87,545 sprite pixels (72.1 % of the
// whole picture) with NO PRODUCER.  This is its first one.
function handler8A(ram, rom, a5, ctx) {
  const { unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  // $276702 tst.b $8130F8 / bmi -- the same stage-kill gate type $8B has.
  if ((ram.u8(0x8130f8) & 0x80) !== 0) { freeEnemy(ram, a5); return; } // $276736
  scrollCompensate(ram, a5);                           // $27670A jsr $24179E
  // $276710..$27672E: bounds.  Y += $C00 + scroll + $B000; X += $400 + $8C00.
  const pos = ram.u32(a6 + 0x02);
  let off = u16(u16((pos & 0xffff) + 0xc00) + ram.u16(G.scroll)) + 0xb000 > 0xffff;
  if (!off) off = u16((pos >>> 16) + 0x400) + 0x8c00 > 0xffff;   // $276726/$27672A
  if (off) {                                           // $27672E bcc $27673E
    if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; } // $276736
  } else {
    ram.setU8(a5 + R.onScreen, 1);                     // $27673E
  }
  // $276744: the damage branch.  No `$286096` call at all in this one -- the
  // hit bits are cleared and only the HP SIGN is consulted.
  if ((ram.u8(a6) & 0x5c) !== 0) {                     // $276744 moveq #$5c / and.b
    const d1 = hitMask(ram, a6);
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // $27674A andi.b #$a3,(A6)
    if ((ram.u16(a6 + S.hp) & 0x8000) !== 0) {         // $27674E tst.w / $276752 bmi
      deathSeq8A(ram, rom, a5, ctx, d1); return;       // $2767D0
    }
  }
  // $276756 tst.w $811F72 / bne $2767A6 -- while the mover's freeze word is set
  // the PROXIMITY test is skipped and the counter runs down anyway.
  if (ram.u16(0x811f72) === 0) {
    const live = playersAlive242884(ram);              // $27675E jsr $242884
    if (live === 0) return;                            // $276764 tst.w / beq $2767CE
    // $276768..$27679E: is either LIVE player within $240 on the SHORT axis?
    // The two arms are not symmetric: P1's is `bcs -> reload` (near) and P2's is
    // `bcc -> rts` (far), because P1 falls THROUGH into P2's test when it is far
    // and bit 1 is set.
    let near = false;
    if ((live & 1) !== 0) {                            // $276768 btst #$0 / beq $27678A
      const d = u16(ram.u16(a6 + 0x04) - ram.u16(0x8103ea)); // $27676E/$276774/$276778
      const m = (d & 0x8000) !== 0 ? u16(-d) : d;      // $27677A bpl / neg.w
      if (m < 0x240) near = true;                      // $27677E cmpi.w / $276782 bcs
      else if ((live & 2) === 0) return;               // $276784 btst #$1 / beq $2767CE
    }
    if (!near) {                                       // reached $27678A
      const d = u16(ram.u16(a6 + 0x04) - ram.u16(0x81044c)); // $27678A/$276790/$276794
      const m = (d & 0x8000) !== 0 ? u16(-d) : d;      // $276796 bpl / neg.w
      if (m >= 0x240) return;                          // $27679A cmpi.w / $27679E bcc
    }
    ram.setU16(a5 + 0x18, 0x000f);                     // $2767A0 move.w #$f,($18,A5)
  }
  ram.setU16(a5 + 0x18, u16(ram.u16(a5 + 0x18) - 1));  // $2767A6 subq.w #$1,($18,A5)
  // $2767AA bchg #$6,($1,A6) / bne -- `bchg` TESTS the old bit and FLIPS it, so
  // the blink+emit below runs on every OTHER frame.
  const was = (ram.u8(a6 + 0x01) & 0x40) !== 0;
  ram.setU8(a6 + 0x01, ram.u8(a6 + 0x01) ^ 0x40);
  if (was) return;                                     // $2767B0 bne $2767CE
  // $2767B2 eori.l #$B4,($A,A6) -- the sprite pointer TOGGLES between two
  // frames $B4 apart.  A longword EOR, not an add.
  ram.setU32(a6 + S.sprite0a, (ram.u32(a6 + S.sprite0a) ^ 0xb4) >>> 0);
  // $2767BA..$2767CC: `move.w ($1E,A6),D0 / add.w D0,D0 / add.w D0,D0 /
  // lea $27829C(pc),A0 / movea.l (A0,D0.w),A0 / jsr (A0)`.
  const idx = u16(ram.u16(a6 + S.anim) * 4);           // $2767BA/$2767BE/$2767C0
  if (idx >= EMIT_TABLE.entries27829C * 4) {
    unreached(EMIT_TABLE.dispatch27829C + idx, `type $8A's emitter dispatch `
      + `$2767C8 indexed $27829C with ($1E,A6) = $${ram.u16(a6 + S.anim)
        .toString(16).toUpperCase()}, i.e. byte offset $${idx.toString(16)
        .toUpperCase()}. The table has ${EMIT_TABLE.entries27829C} longwords `
      + `($27829C..$2782E3); $2782E4 begins the separate register table`);
  }
  enqueueThroughStub(ram, rom, rom.u32(EMIT_TABLE.dispatch27829C + idx), a6);
  void u;
}

// `$242884` -- WHICH PLAYERS ARE ALIVE, as a two-bit mask.  Ten instructions,
// and the test is TWO conditions per player: the record's first BYTE must be
// negative (bit 15 of the alive word) AND its bit 0 must be CLEAR.
//   242884: moveq #$0,D0 / move.b $8103E6,D1 / bpl / btst D0,D1 / bne / moveq #$1,D0
//   242894: move.b $810448,D1 / bpl / btst #$0,D1 / bne / addq.w #$2,D0
// The first `btst` uses D0 as the bit number and D0 is 0 there, so both are
// bit 0 -- a detail that reads like a bug and is not one.
function playersAlive242884(ram) {
  let d0 = 0;                                          // $242884 moveq #$0,D0
  const p1 = ram.u8(AIM.selP1);                        // $242886 move.b $8103E6,D1
  if ((p1 & 0x80) !== 0 && (p1 & 1) === 0) d0 = 1;     // $24288C bpl / $24288E btst
  const p2 = ram.u8(AIM.selP2);                        // $242894 move.b $810448,D1
  if ((p2 & 0x80) !== 0 && (p2 & 1) === 0) d0 += 2;    // $24289A bpl / $24289C btst
  return d0;                                           // $2428A4 rts
}

// $2767D0..$276814 -- the death arm.  Two effect spawns and `$27F92A`, then the
// field writes into the record `$289004` would have returned; all noted.
function deathSeq8A(ram, rom, a5, ctx, d1) {
  const u = ctx.unported;
  const a6 = ram.u32(a5 + 0x06);                       // the SUB-RECORD (A6)
  scoreKill(ram, rom, ctx, 0x01, d1);                  // $2767D0/$2767D2
  ctx.soundPost?.(0x28c25a);                       // WAVE A: SFX id=0, death burst          // $2767D8
  // $2767DE move.w ($1A,A5),D0 -- the bee kind index ($0004 = kind 1).
  // $2767E2 move.b ($1F,A6),D2 -- the display LAYER byte.
  // $2767E6 jsr $27F92A -- allocate one bee from the reserved ten and fill it.
  // W111: the allocator + fill + driver are now ported (src/bee.js).
  {
    const kind = ram.u16(a5 + 0x1a);                   // $2767DE D0 = ($1A,A5)
    const layer = ram.u8(a6 + S.f1f);                  // $2767E2 D2 = ($1F,A6)
    allocBee27F92A(ram, rom, ctx, kind, layer, a6);    // $2767E6 jsr $27F92A
  }
  // W54: SPAWNED.  $2767EC moveq #$C / $2767EE jsr $289004, then
  // $2767F4..$276810 -- the $278320 remap and the $24179E hook.
  {
    const e = effectArmShared278320(ram, rom, ctx, a6, 0x0c, 0x2767ee);
    ram.setU16(e + B.hook, 1);                         // $27680C/$276810
  }
  // $2767FA..$276810: `move.w ($1E,A6),D0 / add.w D0,D0 / lea $278320(pc),A1 /
  // move.w (A1,D0.w),($1E,A0)` and `move.w #$1,($10,A0)` -- writes into the
  // record the allocation did not make, so they are inside the same gap.
  freeEnemy(ram, a5);                                  // $276814 jmp $263762
}

// ==================================================================== W33
// `$272AAC` -- TYPES `$20`, `$21` AND `$23`, THE SCRIPTED CARRIER.
//
// **IT FIRES NO BULLET.**  There is not one `jsr $281xxx` in it, nor in its
// call closure -- checked by the recursive closure scan in the W33 worklog §2
// (which follows `bsr`/`jsr`/`bra`/`bcc` and reports every generator entry
// reached).  What it does instead is SPAWN OTHER ENEMIES: once per cooldown it
// pushes one deferred record of the type its movement stream names.  For
// stage 1's six records those types are `$11` (five of them) and `$10` (one) --
// both already ported -- read out of the aux table `$23170C` and the movement
// resource `$231852` at data indices $041/$066/$067/$068/$071/$072.
//
// THE EXTENT.  `$272AAC..$272B46 rts`.  `$272B48` is the NEXT type's 8-byte
// init stub (`move.w #$0,($4,A5) / rts`) and `$272B50` its init+8 -- so a
// reader who kept going would port a different type's loader as this one's
// tail.  Read past the `rts` to see that, and stop there.
//
// THE ONE SURPRISE: `$272B44 beq $272AF6` jumps BACKWARD into the middle of the
// bounds block, to the `jmp $263762` free.  The salvo counter running out and
// the enemy leaving the screen are the same exit, and they are `$50` bytes
// apart in the listing.
function handler20(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  // $272AAC tst.w ($8,A6) / bne -- ($8,A6) is set to 1 by the INIT when the
  // stream's first param word is the escape `$0002` (see initbody.js), and it
  // means "do NOT scroll-compensate me".
  if (ram.u16(a6 + 0x08) === 0) scrollCompensate(ram, a5);   // $272AB4 jsr $24179E
  // $272ABA..$272AEA -- the bounds test.  The three `addi.w`/`add.w` are WORD
  // adds on D0's low half, so the high half (axis A) is untouched and the
  // `swap` below reads the ORIGINAL value.  Confusing that for `addi.l` is the
  // one-character bug the `u32` note at the top of this file exists for.
  const pos = ram.u32(a6 + S.posX);                    // $272ABA move.l ($2,A6),D0
  const lo = u16(u16(u16((pos & 0xffff) + 0x1c00)      // $272ABE addi.w #$1C00
    + ram.u16(G.scroll)));                             // $272AC2 add.w $813172
  let off = lo + 0x9000 > 0xffff;                      // $272AC8 addi.w / $272ACC bcs
  if (!off) {
    // $272ACE swap D0 / $272AD0 move.w D0,D1 / $272AD2 ext.l D1 -- SIGNED.
    const d1 = ((i16(pos >>> 16) + 0x4000) | 0);       // $272AD4 addi.l #$4000
    if (d1 <= 0x3800) off = true;                      // $272ADA cmpi.l / ble
    else if (d1 >= 0xb800) off = true;                 // $272AE4 cmpi.l / blt -> on
  }
  if (off) {
    if (ram.u16(a6 + 0x06) !== 0) { freeEnemy(ram, a5); return; }  // $272AEE/$272AF6
  } else {
    ram.setU16(a6 + 0x06, 1);                          // $272AFE move.w #$1,($6,A6)
  }
  if (ram.u16(G.freeze) !== 0) return;                 // $272B04 tst.w / bne $272B46
  // $272B0C subq.b #$1,($1A,A5) / bcc $272B46 -- an 8-bit BORROW, so the
  // counter fires on the frame it wraps below zero, not on the frame it is 0.
  const c = ram.u8(a5 + R.carryCooldown);
  ram.setU8(a5 + R.carryCooldown, (c - 1) & 0xff);
  if (c !== 0) return;                                 // bcc: no borrow
  ram.setU8(a5 + R.carryCooldown, ram.u8(a5 + R.carryReload));  // $272B12
  // $272B18..$272B22: enqueue one deferred spawn of ($16,A5) with D1 = the
  // CLASS BYTE ($D,A5), i.e. the `$263690` entry point (D1 = the caller's).
  const type = ram.u16(a5 + R.carrySpawnType);         // $272B18 move.w ($16,A5),D0
  const cls = ram.u8(a5 + R.classByte);                // $272B1E move.b ($D,A5),D1
  const q = enqueueDeferred(ram, type, DEFQ_D1.CALLER, cls);   // $272B22 jsr $263690
  // $272B28..$272B34.  THE ROM DOES THESE THREE WRITES UNCONDITIONALLY, and on
  // a full queue `$2636CA` hands back the DUMMY `$816B2A` -- so they land in
  // the bit bucket rather than being skipped.  Transcribed that way; a port
  // that guarded them would differ from the board the first time the queue
  // filled, and $816B2A exists precisely so it need not.
  ram.setU32(q.addr + 0x12, ram.u32(a5 + R.movement));  // $272B28
  ram.setU32(q.addr + 0x48, ram.u32(a6 + S.posX));      // $272B2E
  // `bset.b #$6,($2,A0)` -- a BYTE op on the HIGH byte of the queue's type
  // WORD, which the drain copies to the new enemy's ($2,A5) flags at $263472.
  ram.setU8(q.addr + 0x02, ram.u8(q.addr + 0x02) | 0x40);   // $272B34
  // $272B3A tst.w ($18,A5) / beq -- a zero SALVO WORD means "spawn forever".
  if (ram.u16(a5 + R.carrySalvo) === 0) return;        // $272B3E beq $272B46
  const n = ram.u8(a5 + R.carrySalvoCtr);              // $272B40 subq.b #$1,($19,A5)
  ram.setU8(a5 + R.carrySalvoCtr, (n - 1) & 0xff);
  if (((n - 1) & 0xff) === 0) freeEnemy(ram, a5);      // $272B44 beq $272AF6
  void rom; void ctx;
}

// ###########################################################################
// #  W36 -- THE SEVEN REMAINING NON-BOSS STAGE-1 HANDLERS                    #
// ###########################################################################
//
// The stage-1 script names 19 distinct handlers (`tools/oracle/w36handlers.py`,
// re-derived this wave: 339 records, 21 types, 19 handlers).  W33 left 11
// ported; the eight it did not are `$26A5E4` `$26AD28` `$27733E` `$26A860`
// `$275F30` `$29700C` `$2697F6` and **`$292902`, the STAGE-1 BOSS**.
//
// THE BOSS IS NOT ONE OF THESE SEVEN AND IT IS NOT A HANDLER-SHAPED JOB.
// `$292902` is ten instructions and every one is a dispatch: `jsr $294AD8` (the
// boss brain, whose installed script tables W33 §8 could not bound and W28 §6
// prices as two waves), then `$243DD0`, `$25962E`, `$242952`, then
// `jmp $263762`.  It is left as the loud named throw it already is.
//
// AND 19 IS NOT THE STAGE-1 HANDLER DENOMINATOR.  Two more types are reached
// because an ENEMY spawns them (every `jsr` to the three deferred enqueues
// `$263678`/`$263684`/`$263690`, D0 recovered by a back-walk):
//   * type `$1C` at `$26B7E2`, inside the PORTED midboss -- handler `$26C20C`.
//     src/midboss.js already executes that enqueue, so this port dispatches
//     `$26C20C` the moment the midboss dies.  It is 22 instructions and it is
//     NOT ported here for a reason that has nothing to do with handlers: it
//     writes 23 x 9 longwords to `$9000A4`/`$9000BC`, and the port models no
//     `$900000` region at all.
//   * type `$1E` at `$2963C2`/`$2963F4`/`$29642C`/`$29645E`, inside the boss --
//     handler `$296DD6`, unreachable while `$292902` is unported.
// So stage 1 has 21 handlers, this wave takes the port from 11 to 18, and the
// three that remain are the boss, the boss's spawn, and the midboss's whiteout.

// ------------------------------------------------------------------------
// $269B3E / $269E20 -- THE DAMAGE-FIRST FAMILY'S SHARED TAIL
// ------------------------------------------------------------------------
// Types `$05` `$07` `$27` `$08` `$09` `$0B` all end in these two blocks, and
// the CONTROL FLOW is the reason they read as one routine: `$269E20` falls into
// `$269B3E` by `$269E44 bra.w $269b3e`, and `$269CEA`'s own tail reaches
// `$269B3E` from `$269E1C`.  A linear sweep prints `$269B3E` FIRST, before
// every handler that jumps to it, which is exactly the fall-through trap seen
// from the far side.
//
// `$269B3E` is a DRAW, and which of its two arms runs is decided by `$80390C`,
// the per-frame alternation word (`src/shipsprite.js`) -- so each of these
// enemies emits ONE of two sprites per frame at 30 Hz, never both.
//
// W36 NOTED WHAT IT DID **NOT** TOUCH: `$269CEA`/`$26A2E2` (types `$05`/`$07`/
// `$27`, 92 of the 339 records) still `note()`d their fire machines and
// therefore never reached either block.  **WAVE 80 WIRED BOTH**, and found
// while doing it that they are TWO machines and not one -- `$26A2E2` never
// executes a byte of `$269D84..$269E1C`; see the header above `handler05`.  The
// hazard W36 named is real and was measured rather than argued: `$242178`
// stores a slewed heading into `($1B,A6)`, a column the `fly-around` gate
// compares, so W80's before/after on that gate is the evidence, not this note.
//
// AND THERE ARE THREE ENTRY POINTS INTO THIS TAIL, NOT TWO:
//   $269E16  enqueue + draw, sprite pointer UNTOUCHED   -- $05's every exit
//   $269E20  heading -> sprite pointer, then $269E16    -- everyone else's
//   $269B3E  the two draw arms alone
// `$269E16` is INSIDE `$269CEA`'s span, so a sweep that lists routines by their
// heads never names it; it is reached six times from `$269D84..$269E10` and
// once from the freeze gate, and every one of those is a `bcs.w`/`bcc.w` into
// the middle of a block.  Reading only the labels gives `$269E20` for all of
// them and silently rewrites the sprite pointer of a type that must not have
// it rewritten.

/** `$269E20..$269E46` -- heading -> the sub-record's sprite pointer and the
 *  record's ARM B descriptor (W84), then the per-record enqueue, then the draw.
 *  `d1` is the caller's D1: a BYTE moved into D1 in every caller, masked to
 *  `$3E` here, so only the low byte can matter. */
function drawFamily269E20(ram, rom, a5, a6, d1) {
  const idx = u16((d1 & 0x3e) * 2);                    // $269E26 andi.w / $269E2A add.w
  ram.setU32(a6 + S.sprite0a, rom.u32(FAM.sprite + idx));  // $269E2C move.l (A0,D1.w),($a,A6)
  // $269E38 move.l (A0,D1.w),($2c,A5)
  ram.setU32(a5 + 0x2c, rom.u32(FAM.armBArt + idx));
  drawFamily269E16(ram, rom, a5, a6);                  // $269E3E/$269E44 fall-through
}

/** `$269E16..$269E1C` -- the enqueue and the draw, with the sprite pointer left
 *  exactly as it was.  `$269E20` falls into this; type `$05` enters it directly
 *  from seven places. */
function drawFamily269E16(ram, rom, a5, a6) {
  enqueueThroughStub(ram, rom, 0x23d852, a6);          // $269E16/$269E3E jsr $23D852
  drawFamily269B3E(ram, rom, a5, a6);                  // $269E1C/$269E44 bra.w $269B3E
}

/** `$269B3E..$269BB4` -- the two draw arms. */
function drawFamily269B3E(ram, rom, a5, a6) {
  const pos = ram.u32(a6 + 0x02);
  if (ram.u16(G.mirror2) !== 0) {                      // $269B3E tst.w $80390C / beq
    // ARM A.  D1's halves are built around a `swap`, so neither `addi.w` may
    // carry into the other -- high = ($2,A6)+$F900, low = ($4,A6)+$FB00.
    const d1 = ((u16((pos >>> 16) + 0xf900) << 16)     // $269B46/$269B4A
      | u16((pos & 0xffff) + 0xfb00)) >>> 0;           // $269B50/$269B54
    const d2i = ram.u16(a5 + 0x20);                    // $269B60 move.w ($20,A5),D2
    // $269B64 `move.l ($269BB6,PC,D2.w),D2` -- FOUR longwords, and the index is
    // the cycling byte offset ($20,A5) below, so 0/4/8/$C only.
    enqueueRegistersThroughStub(ram, rom, 0x23df86, d1,
      rom.u32(FAM.anim4 + d2i),                        // $269B64
      0x828,                                           // $269B58 move.w #$828,D3
      ram.u16(a6 + S.f1c));                            // $269B5C move.w ($1C,A6),D4
    ram.setU16(a5 + 0x20, u16(ram.u16(a5 + 0x20) + 4) & 0x0f); // $269B6E/$269B72
    return;                                            // $269B78 rts
  }
  // ARM B, and it is gated twice before it draws anything.
  if (ram.u16(G.rank98) !== 0) return;                 // $269B7A tst.w $813098 / bne
  if (ram.u16(G.stage) === 2) return;                  // $269B82 cmpi.w #$2 / beq
  const d1 = ((u16((pos >>> 16) + 0xec00) << 16)       // $269B8C/$269B90
    | u16((pos & 0xffff) + 0x400)) >>> 0;              // $269B96/$269B9A
  // $269BA6 `move.w ($1C,A6),D4` and then $269BAA `move.b #$18,D4` -- the BYTE
  // move overwrites only D4's low byte, so D4 keeps ($1C,A6)'s HIGH byte.
  const d4 = ((ram.u16(a6 + S.f1c) & 0xff00) | 0x18);
  enqueueRegistersThroughStub(ram, rom, 0x23df58, d1,
    ram.u32(a5 + 0x2c),                                // $269B9E move.l ($2c,A5),D2
    0x410,                                             // $269BA2 move.w #$410,D3
    d4);                                               // $269BAE jmp $23DF58
}

/** The damage-first family's ROM tables.  Extents pinned in export-tables.py. */
const FAM = {
  sprite: 0x269e48,   // $269E20 lea -- 16-heading sprite pointers
  // W84: THIS IS ART, AND IT WAS CALLED A BUCKET TABLE FOR FIFTY WAVES.
  // `$269E32 lea` loads ($2C,A5) from it, and its only reader in this family's
  // code is `$269B9E move.l ($2C,A5),D2` in ARM B of the draw block, where D2
  // is the DESCRIPTOR `$23DF58` writes into hardware words 2 and 3 -- the same
  // slot arm A fills from `anim4`. [M] the board's own display list carries 54
  // of these addresses over the stage1-laser-hold ladder. The field is renamed
  // rather than re-commented because the old name is what kept 32 streams out
  // of the sprite sheet: `tools/export-web.mjs` cited it as the reason.
  armBArt: 0x269ec8,  // $269E32/$269DB6 lea -- ARM B's per-heading descriptor
  anim4: 0x269bb6,    // $269B64 -- FOUR longwords, ($20,A5) cycling 0/4/8/$C
  muzzle: 0x269f48,   // $269DEC/$26A762/$26A922/$26ADEC/$26AEB0 -- 32 longs
};

/**
 * `$26A5E4`/`$26A860`/`$26AD28`'s SHARED HEAD -- the damage branch, the
 * off-screen test and the freeze gate, byte for byte the same in all three
 * (`$26A5E4..$26A67C`, `$26A860..$26A8F8`, `$26AD28..$26ADC0`).  It is
 * transcribed once because the three are the same instructions at three
 * addresses, and every citation below names all three.
 *
 * @returns {null|'ran'} `null` when the record was freed (the caller returns).
 */
function damageFirstHead(ram, rom, a5, a6, ctx, score) {
  const { tables, unported: u } = ctx;
  if ((ram.u8(a6) & 0x5c) !== 0) {                     // $26A5E4/$26A860/$26AD28
    const d1 = hitMask(ram, a6);
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // $26A5EC/$26A868/$26AD30
    scoreHit(ram, ctx, a6, d1);                        // jsr $286096
    // the palette flash: ($2A,A5) EOR ($2B,A5) -- the emitter pair's two bytes.
    ram.setU8(a6 + S.palette,
      ram.u8(a5 + 0x2a) ^ ram.u8(a5 + 0x2b));          // $26A5F8..$26A602
    if ((ram.u16(a6 + S.hp) & 0x8000) !== 0) {         // tst.w ($18,A6) / bpl
      scoreKill(ram, rom, ctx, score, d1);             // moveq #$8,D0 / jsr $28615E
      // moveq #$2,D0 / jsr $289004, then EIGHT field writes into the record the
      // allocator would have returned in A0, then jsr $28C2A8.  All of it is
      // inside the ONE noted gap (`$289004` has no driver -- W34 §1.6), so the
      // writes are noted with it rather than aimed at an invented address.
      // W54: SPAWNED.  `$26A616`/`$26A882`/`$26AD4A moveq #$2,D0`, and the
      // five writes after each are $269D24's, instruction for instruction.
      effectArmFamily(ram, rom, ctx, a6, 0x02, 0x26a618);
      ctx.soundPost?.(0x28c2a8);                       // WAVE A: SFX id=3, death burst
      freeEnemy(ram, a5);                              // jmp $263762
      return null;
    }
  } else {
    ram.setU8(a6 + S.palette, ram.u8(a5 + 0x2a));      // $26A64E/$26A8CA/$26AD92
  }
  if (onScreen242684(ram, a6)) {                       // jsr $242684 / bcc
    if (ram.u8(a5 + R.onScreen) !== 0) {               // tst.b ($16,A5) / beq
      freeEnemy(ram, a5); return null;                 // jmp $263762
    }
  } else {
    ram.setU8(a5 + R.onScreen, 1);                     // move.b #$1,($16,A5)
  }
  // `move.b ($23,A5),D1` FIRST, so D1 is the facing byte on the frozen exit.
  if (ram.u16(G.freeze) !== 0) {                       // tst.w $8130D2 / bne $269E20
    drawFamily269E20(ram, rom, a5, a6, ram.u8(a5 + R.rec23));
    return null;
  }
  applyVelocity(ram, tables, a5);                      // jsr $2417DE
  return 'ran';
}

/**
 * `$26A5E4` -- TYPE `$08`, 12 records, first trigger clk 376.
 * Span `$26A5E4..$26A788` plus the shared tail; `$26A78C` is type `$09`'s init
 * stub, four bytes past the last `bra`.
 */
function handler08(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  if (damageFirstHead(ram, rom, a5, a6, ctx, 0x08) === null) return;
  if (ram.u16(a5 + 0x26) !== 0) {                      // $26A682 tst.w ($26,A5) / bne
    state26A40C(ram, rom, a5, a6);                     // $26A686 bne.w $26A40C
    return;
  }
  if (ram.u8(a6 + S.speed) !== 0) {                      // $26A68A tst.b ($1A,A6) / beq
    const c = ram.u8(a5 + 0x24);                       // $26A690 subq.b #$1,($24,A5)
    ram.setU8(a5 + 0x24, (c - 1) & 0xff);
    if (c === 0) {                                     // $26A694 bcc $26A6C0
      ram.setU8(a5 + 0x24, ram.u8(a5 + 0x25));         // $26A696
      const n = (ram.u8(a6 + S.speed) - 1) & 0xff;       // $26A69C subq.b #$1,($1A,A6)
      ram.setU8(a6 + S.speed, n);
      if (n === 0) {                                   // $26A6A0 bne $26A6C0
        ram.setU16(a5 + 0x24, 2);                      // $26A6A2 move.w #$2,($24,A5)
        ram.setU8(a5 + R.cooldown, 0x10);              // $26A6A8 move.b #$10,($18,A5)
        ram.setU8(a6 + S.heading,
          ram.u8(a5 + R.rec23) & 0x3c);                // $26A6AE/$26A6B2/$26A6B6
        ram.setU8(a5 + 0x1a, 0x30);                    // $26A6BA move.b #$30,($1A,A5)
      }
    }
  }
  let d1 = ram.u8(a5 + R.rec23);                       // $26A6C0 move.b ($23,A5),D1
  if (ram.u16(0x803910) === 0) {                       // $26A6C4 tst.w $803910 / bne
    // $26A6CE `jsr $24202C` WITHOUT a `bcs`.  When both players are dead the
    // routine `rts`es at `$242030` leaving D1 = the byte above, and the slew
    // that follows is then `slew64(x, x)` -- the value survives, masked to $3F.
    const r = aim64AtTarget(aimTables(rom), ram, a5, a6);   // $26A6CE
    const tgt = r.carry ? d1 : r.dir;
    d1 = slew64(ram.u8(a5 + R.rec23), tgt);            // $26A6D4/$26A6D8 jsr $242190
    ram.setU8(a5 + R.rec23, d1 & 0xff);                // $26A6DE move.b D1,($23,A5)
  }
  // $26A6E2 tst.b ($1A,A6) / bne $26A738 ; $26A6EA move.w #$1,($26,A5) / bra
  // $26A738.  BOTH arms step over `$26A6F4..$26A736`, and nothing else in the
  // image reaches it: a search of $269000..$26B000 for a branch to any word of
  // that block returns 0, and an absolute-longword scan of the whole of build B
  // for any address inside it returns 0.  It is a template vestige, and it is
  // transcribed HERE AS A COMMENT rather than as code, exactly as W34 §2.3 did
  // for `$2860CE`, because writing it would give the port a path the cartridge
  // has not got:
  //
  //   $26A6F4 cmpi.b #$20,($1A,A6) / beq $26A70C
  //   $26A6FC subq.b #$1,($24,A5) / bcc $26A70C
  //   $26A702 move.b ($25,A5),($24,A5) / addq.b #$2,($1A,A6)
  //   $26A70C tst.w ($1C,A5) / beq $26A730
  //   $26A714 subq.b #$1,($1A,A5) / bcc $26A730
  //   $26A71C move.b ($1B,A5),($1A,A5) / subq.w #$1,($28,A5)
  //   $26A726 jsr $242178 / bra $269E20
  //   $26A730 move.b ($1B,A6),D1 / bra $269E20
  //
  if (ram.u8(a6 + S.speed) === 0) ram.setU16(a5 + 0x26, 1);  // $26A6EA
  // $26A738: the fire cooldown.
  const cd = ram.u8(a5 + R.cooldown);                  // $26A738 subq.b #$1,($18,A5)
  ram.setU8(a5 + R.cooldown, (cd - 1) & 0xff);
  if (cd !== 0) { drawFamily269E20(ram, rom, a5, a6, d1); return; }  // $26A73C bcc
  // $26A740 moveq #$58,D0 / sub.w $8130B4,D0 / addq.w #$2,D0 -- RANK shortens
  // the reload, and only D0's low byte is stored.
  ram.setU8(a5 + R.cooldown,
    u16(0x58 - ram.u16(G.b4) + 2) & 0xff);             // $26A742/$26A748/$26A74A
  if (boxTest2425B2(ram, rom, a6).carry) {             // $26A74E jsr $2425B2 / bcs
    drawFamily269E20(ram, rom, a5, a6, d1); return;
  }
  const r = aim64AtTarget(aimTables(rom), ram, a5, a6);    // $26A758 jsr $24202C
  if (r.carry) { drawFamily269E20(ram, rom, a5, a6, d1); return; }   // $26A75E bcs
  fireFamily2814AC(ram, rom, a5, a6, ctx, r.dir, r.dir, 0x0003000d, 0x26a782);
  drawFamily269E20(ram, rom, a5, a6, r.dir);           // $26A788 bra.w $269E20
}

/**
 * `$26A40C..$26A45C` -- type `$08`'s SECOND state, entered once `($26,A5)` is
 * set.  It walks the heading toward `($22,A5)` and stops when it arrives.
 */
function state26A40C(ram, rom, a5, a6) {
  if (ram.u8(a6 + S.speed) !== 0x1c) {                   // $26A40C cmpi.b #$1C / beq
    const c = ram.u8(a5 + 0x24);                       // $26A414 subq.b #$1,($24,A5)
    ram.setU8(a5 + 0x24, (c - 1) & 0xff);
    if (c === 0) {                                     // $26A418 bcc $26A424
      ram.setU8(a5 + 0x24, ram.u8(a5 + 0x25));         // $26A41A
      ram.setU8(a6 + S.speed, (ram.u8(a6 + S.speed) + 1) & 0xff);  // $26A420 addq.b #$1
    }
  }
  if (ram.u16(a5 + 0x1c) === 0) {                      // $26A424 tst.w ($1C,A5) / bne
    const c = ram.u8(a5 + 0x1a);                       // $26A42C subq.b #$1,($1A,A5)
    ram.setU8(a5 + 0x1a, (c - 1) & 0xff);
    if (c === 0) {                                     // $26A430 bcc $26A458
      ram.setU8(a5 + 0x1a, ram.u8(a5 + 0x1b));         // $26A434
      // $26A43A move.b ($1B,A6),D1 / add.b ($1F,A5),D1 / andi.b #$3C,D1
      const d1 = (ram.u8(a6 + S.heading) + ram.u8(a5 + 0x1f)) & 0x3c;
      ram.setU8(a6 + S.heading, d1);                   // $26A446
      if (d1 !== ram.u8(a5 + 0x22)) {                  // $26A44A cmp.b / bne $269E20
        drawFamily269E20(ram, rom, a5, a6, d1); return;
      }
      ram.setU16(a5 + 0x1c, 1);                        // $26A452 move.w #$1,($1C,A5)
    }
  }
  drawFamily269E20(ram, rom, a5, a6, ram.u8(a6 + S.heading));  // $26A458/$26A45C
}

/** The family's one fire: `jsr $2814AC` with D2 = the muzzle vector + position.
 *  `dIdx` is the byte the ROM moves into D2 before the `addq.w #$1`, `dDir` the
 *  D1 the generator reads, and `d0` the packed speed/kind longword. */
function fireFamily2814AC(ram, rom, a5, a6, ctx, dIdx, dDir, d0, site) {
  // moveq #$0,D2 / move.b <src>,D2 / addq.w #$1,D2 / andi.w #$3E,D2 / add.w D2,D2
  const idx = u16((u16((dIdx & 0xff) + 1) & 0x3e) * 2);
  const d2 = u32(rom.u32(FAM.muzzle + idx) + ram.u32(a6 + 0x02));  // add.l ($2,A6),D2
  const res = fireBullet({ ram, rom, log: new WriteLog(ram) }, 0x2814ac,
    { d0, d1: dDir & 0xffff, d2, d3: 0, d4: 0, d5: 0, a5 });
  ctx.bulletSpawn?.(site, res);
}

/**
 * `$26A860` -- TYPE `$09`, 7 records, first trigger clk 420.
 * Span `$26A860..$26A9C4` plus the shared tail.
 */
function handler09(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  if (damageFirstHead(ram, rom, a5, a6, ctx, 0x08) === null) return;
  // $26A8FE: the FIRE first (this one has no `($26,A5)` fork before it).
  const cd = ram.u8(a5 + R.cooldown);                  // $26A8FE subq.b #$1,($18,A5)
  ram.setU8(a5 + R.cooldown, (cd - 1) & 0xff);
  if (((cd - 1) & 0xff) === 0) {                       // $26A902 bne $26A944
    ram.setU8(a5 + R.cooldown,
      u16(0x58 - ram.u16(G.b4) + 2) & 0xff);           // $26A904/$26A906/$26A90E
    if (!boxTest2425B2(ram, rom, a6).carry) {          // $26A912 jsr $2425B2 / bcs
      const r = aim64AtTarget(aimTables(rom), ram, a5, a6);  // $26A91A jsr $24202C
      if (!r.carry) {                                  // $26A920 bcs $26A944
        fireFamily2814AC(ram, rom, a5, a6, ctx, r.dir, r.dir, 0x0d, 0x26a93e);
      }
    }
  }
  // $26A944: the state machine.  ($26,A5) picks the arm.
  if (ram.u16(a5 + 0x26) === 0) {                      // $26A944 tst.w / bne $26A97E
    const c = ram.u8(a5 + 0x24);                       // $26A94C subq.b #$1,($24,A5)
    ram.setU8(a5 + 0x24, (c - 1) & 0xff);
    if (c === 0) {                                     // $26A950 bcc $26A9A2
      ram.setU8(a5 + 0x24, ram.u8(a5 + 0x25));         // $26A952
      const n = (ram.u8(a6 + S.speed) - 1) & 0xff;       // $26A958 subq.b #$1,($1A,A6)
      ram.setU8(a6 + S.speed, n);
      if (n === 0) {                                   // $26A95C bne $26A9A2
        ram.setU16(a5 + 0x26, 1);                      // $26A95E
        ram.setU16(a5 + 0x24, 2);                      // $26A964
        ram.setU16(a5 + R.cooldown, 0x3008);           // $26A96A move.w #$3008,($18,A5)
        ram.setU8(a6 + S.heading, ram.u8(a5 + 0x22));  // $26A970
        ram.setU8(a5 + 0x1a, 0x30);                    // $26A976
      }
    }
  } else if (ram.u8(a5 + 0x1a) !== 0) {                // $26A97E tst.b ($1A,A5) / beq
    ram.setU8(a5 + 0x1a, (ram.u8(a5 + 0x1a) - 1) & 0xff);   // $26A984 subq.b #$1
  } else if (ram.u8(a6 + S.speed) !== 0x20) {            // $26A98A cmpi.b #$20 / beq
    const c = ram.u8(a5 + 0x24);                       // $26A992 subq.b #$1,($24,A5)
    ram.setU8(a5 + 0x24, (c - 1) & 0xff);
    if (c === 0) {                                     // $26A996 bcc $26A9A2
      ram.setU8(a5 + 0x24, ram.u8(a5 + 0x25));         // $26A998
      ram.setU8(a6 + S.speed, (ram.u8(a6 + S.speed) + 2) & 0xff); // $26A99E addq.b #$2
    }
  }
  // $26A9A2: the per-frame slew, then the shared tail.
  let d1 = ram.u8(a5 + R.rec23);                       // $26A9A2 move.b ($23,A5),D1
  if (ram.u16(0x803910) === 0) {                       // $26A9A6 tst.w $803910 / bne
    const r = aim64AtTarget(aimTables(rom), ram, a5, a6);   // $26A9B0 jsr $24202C
    const tgt = r.carry ? d1 : r.dir;                  // (no `bcs` -- see $26A6CE)
    d1 = slew64(ram.u8(a5 + R.rec23), tgt);            // $26A9B6/$26A9BA jsr $242190
    ram.setU8(a5 + R.rec23, d1 & 0xff);                // $26A9C0
  }
  drawFamily269E20(ram, rom, a5, a6, d1);              // $26A9C4 bra.w $269E20
}

/**
 * `$26AD28` -- TYPE `$0B`, 12 records, first trigger clk 377.
 * Span `$26AD28..$26AF22` plus the shared tail.  It is type `$09`'s skeleton
 * with a SECOND fire (`$26AEA0..$26AECC`) on the far side of `($26,A5)`, and
 * its first fire takes the muzzle index from `($23,A5)` rather than from the
 * aim result -- one byte of difference that changes which way every bullet in
 * the salvo leaves.
 */
function handler0B(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  if (damageFirstHead(ram, rom, a5, a6, ctx, 0x08) === null) return;
  if (ram.u8(a5 + 0x26) !== 0) {                       // $26ADC6 tst.b ($26,A5) / bne
    state0B26AE86(ram, rom, a5, a6, ctx);
    return;
  }
  // $26ADCE: the fire cooldown on ($28,A5), reloaded from ($29,A5).
  const c = ram.u8(a5 + R.fireCtr);                    // $26ADCE subq.b #$1,($28,A5)
  ram.setU8(a5 + R.fireCtr, (c - 1) & 0xff);
  if (((c - 1) & 0xff) === 0) {                        // $26ADD2 bne $26AE10
    ram.setU8(a5 + R.fireCtr, ram.u8(a5 + 0x29));      // $26ADD6
    if (!boxTest2425B2(ram, rom, a6).carry) {          // $26ADDC jsr $2425B2 / bcs
      const r = aim64AtTarget(aimTables(rom), ram, a5, a6);  // $26ADE4 jsr $24202C
      if (!r.carry) {                                  // $26ADEA bcs $26AE10
        // $26ADF2 `move.b ($23,A5),D2` -- the RECORD's facing, NOT the aim.
        fireFamily2814AC(ram, rom, a5, a6, ctx,
          ram.u8(a5 + R.rec23), r.dir, 0x0d, 0x26ae0a);
      }
    }
  }
  // $26AE10: the phase counter on ($24,A5).
  const c2 = ram.u8(a5 + 0x24);                        // $26AE10 subq.b #$1,($24,A5)
  ram.setU8(a5 + 0x24, (c2 - 1) & 0xff);
  if (c2 === 0) {                                      // $26AE14 bcc $26AE5C
    ram.setU8(a5 + 0x24, ram.u8(a5 + 0x25));           // $26AE16
    const n = (ram.u8(a6 + S.speed) - 1) & 0xff;         // $26AE1C subq.b #$1,($1A,A6)
    ram.setU8(a6 + S.speed, n);
    if (n === 0) {                                     // $26AE20 bne $26AE5C
      ram.setU8(a5 + 0x26, 1);                         // $26AE22
      ram.setU16(a5 + 0x24, 2);                        // $26AE28
      ram.setU8(a5 + R.cooldown, 1);                   // $26AE2E
      const d1 = ram.u8(a5 + R.rec23) & 0x3c;          // $26AE34/$26AE38
      ram.setU8(a6 + S.heading, d1);                   // $26AE3C
      ram.setU8(a5 + 0x1a, 0x30);                      // $26AE40
      // $26AE46 cmp.b ($22,A5),D1 -- pick the SIGN of the per-step turn.
      const t = ram.u8(a5 + 0x22);
      if (d1 !== t) {                                  // $26AE4A beq $26AE5C
        ram.setU8(a5 + 0x1f, d1 > t ? 0x04 : 0xfc);    // $26AE4C bhi / $26AE4E / $26AE56
      }
    }
  }
  // $26AE5C: the per-frame slew, then the shared tail.
  let d1 = ram.u8(a5 + R.rec23);                       // $26AE5C move.b ($23,A5),D1
  if (ram.u16(0x803910) !== 0) {                       // $26AE60 tst.w $803910 / bne
    drawFamily269E20(ram, rom, a5, a6, d1); return;
  }
  const r = aim64AtTarget(aimTables(rom), ram, a5, a6);     // $26AE6A jsr $24202C
  if (r.carry) { drawFamily269E20(ram, rom, a5, a6, d1); return; }   // $26AE70 bcs
  d1 = slew64(ram.u8(a5 + R.rec23), r.dir);            // $26AE74/$26AE78 jsr $242190
  ram.setU8(a5 + R.rec23, d1 & 0xff);                  // $26AE7E
  drawFamily269E20(ram, rom, a5, a6, d1);              // $26AE82 bra.w $269E20
}

/** `$26AE86..$26AF22` -- type `$0B`'s SECOND phase: a timed salvo on `($27,A5)`
 *  and then a heading walk toward `($22,A5)`. */
function state0B26AE86(ram, rom, a5, a6, ctx) {
  if (ram.u8(a5 + 0x27) !== 0) {                       // $26AE86 tst.b ($27,A5) / beq
    const c = ram.u8(a5 + R.cooldown);                 // $26AE8E subq.b #$1,($18,A5)
    ram.setU8(a5 + R.cooldown, (c - 1) & 0xff);
    if (((c - 1) & 0xff) === 0) {                      // $26AE92 bne $26AF1E
      ram.setU8(a5 + R.cooldown, ram.u8(a5 + R.cooldownReload));  // $26AE96
      ram.setU8(a5 + 0x27, (ram.u8(a5 + 0x27) - 1) & 0xff);       // $26AE9C
      if (!boxTest2425B2(ram, rom, a6).carry) {        // $26AEA0 jsr $2425B2 / bcs
        // $26AEAA move.b ($23,A5),D2 / move.b D2,D1 -- BOTH the index and the
        // generator's D1 come from the record here; there is no aim at all.
        const f = ram.u8(a5 + R.rec23);
        fireFamily2814AC(ram, rom, a5, a6, ctx, f, f, 0x0d, 0x26aecc);
      }
    }
    drawFamily269E20(ram, rom, a5, a6, ram.u8(a6 + S.heading));   // $26AF1E/$26AF22
    return;
  }
  if (ram.u8(a6 + S.speed) !== 0x1c) {                   // $26AED6 cmpi.b #$1C / beq
    const c = ram.u8(a5 + 0x24);                       // $26AEDE subq.b #$1,($24,A5)
    ram.setU8(a5 + 0x24, (c - 1) & 0xff);
    if (c === 0) {                                     // $26AEE2 bcc $26AEEE
      ram.setU8(a5 + 0x24, ram.u8(a5 + 0x25));         // $26AEE4
      ram.setU8(a6 + S.speed, (ram.u8(a6 + S.speed) + 1) & 0xff);   // $26AEEA
    }
  }
  if (ram.u16(a5 + 0x1c) === 0) {                      // $26AEEE tst.w ($1C,A5) / bne
    const c = ram.u8(a5 + 0x1a);                       // $26AEF4 subq.b #$1,($1A,A5)
    ram.setU8(a5 + 0x1a, (c - 1) & 0xff);
    if (c === 0) {                                     // $26AEF8 bcc $26AF1E
      ram.setU8(a5 + 0x1a, ram.u8(a5 + 0x1b));         // $26AEFA
      const d1 = (ram.u8(a6 + S.heading) + ram.u8(a5 + 0x1f)) & 0x3c;  // $26AF00..
      ram.setU8(a6 + S.heading, d1);                   // $26AF0C
      if (d1 !== ram.u8(a5 + 0x22)) {                  // $26AF10 cmp.b / bne $269E20
        drawFamily269E20(ram, rom, a5, a6, d1); return;
      }
      ram.setU16(a5 + 0x1c, 1);                        // $26AF18
    }
  }
  drawFamily269E20(ram, rom, a5, a6, ram.u8(a6 + S.heading));     // $26AF1E/$26AF22
}

// ------------------------------------------------------------------------
// $27733E -- TYPE $89, 7 records, first trigger clk 283
// ------------------------------------------------------------------------
// Span `$27733E..$27750C`; `$277512` is a `nop` pad and `$277514` is the next
// type's init stub, so the `jmp $263762` at `$27750C` really is the end.
//
// It is the first W36 handler that reaches `$268018` DIRECTLY (twice), which is
// why that block is now its own function rather than the tail of `$267FC6`.
function handler89(ram, rom, a5, ctx) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, tables, u)) return;   // $27733E jsr $2638A6
  if (onScreen242684(ram, a6)) {                       // $277344 jsr $242684 / bcc
    if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; }  // $277352
  } else {
    ram.setU8(a5 + R.onScreen, 1);                     // $27735A
  }
  // $277360: the damage branch.  The NO-damage arm ($277366) also computes D0,
  // and both arms converge on `$2773A4 move.b D0,($1D,A6)` -- so the palette is
  // written on EVERY frame, not only on a hit.
  let d0;
  if ((ram.u8(a6) & 0x5c) === 0) {                     // $277360 moveq #$5C / beq
    d0 = ram.u8(a5 + R.cooldown);                      // $277366 move.b ($18,A5),D0
    if (ram.u16(a6 + S.hp) < 0x120                     // $27736A cmpi.w #$120 / bcc
        && ram.u16(G.ca) === 0) {                      // $277372 tst.w $8130CA / bne
      d0 = 0x19;                                       // $27737A moveq #$19,D0
    }
  } else {
    const d1 = hitMask(ram, a6);
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // $27737E andi.b #$A3,(A6)
    scoreHit(ram, ctx, a6, d1);                        // $277382 jsr $286096
    d0 = ram.u8(a6 + S.palette);                       // $277388 move.b ($1D,A6),D0
    if (d0 === 0x19) d0 = ram.u8(a5 + R.cooldown);     // $27738C/$277392
    d0 ^= ram.u8(a5 + R.cooldownReload);               // $277396/$27739A eor.b D2,D0
    if ((ram.u16(a6 + S.hp) & 0x8000) !== 0) {         // $27739C tst.w / bmi $27749C
      deathSeq89(ram, rom, a5, ctx, d1); return;
    }
  }
  ram.setU8(a6 + S.palette, d0 & 0xff);                // $2773A4 move.b D0,($1D,A6)
  // $2773A8 `tst.l $8130D2` -- a LONGWORD test, so the word past the freeze
  // ($8130D4) is part of it.  The other handlers here test the word.
  if (ram.u32(G.freeze) !== 0) { emit89(ram, rom, a6); return; }   // $2773AE bne
  // $2773B2: the AIM cadence on ($1E,A5), reloaded from ($1F,A5).
  const c = ram.u8(a5 + R.rec1E);                      // $2773B2 subq.b #$1,($1E,A5)
  ram.setU8(a5 + R.rec1E, (c - 1) & 0xff);
  if (c === 0) {                                       // $2773B6 bcc $277420
    ram.setU8(a5 + R.rec1E, ram.u8(a5 + 0x1f));        // $2773B8
    // $2773BE jsr $268018 / bcs $277420 -- the player-distance gate.
    if (!playerDist268018(ram, rom, a6).carry
        && ram.u8(a5 + R.rec1C) === ram.u8(a5 + R.rec1D)) {   // $2773C6/$2773CA bne
      // $2773D0..$2773EC: the target select, written out longhand exactly as
      // type $85's `$2759D0` is (the same four tests, no `bsr $24270A`).
      let p0 = AIM.selP1, p1 = AIM.selP2;              // $2773D0/$2773D6
      if (ram.u8(a5 + 0x03) !== 0) { p0 = AIM.selP2; p1 = AIM.selP1; }  // $2773E2 exg
      let ok = true;
      if ((ram.u16(p0) & 0x8000) === 0) {              // $2773E4 tst.w (A0) / bmi
        if ((ram.u16(p1) & 0x8000) === 0) ok = false;  // $2773E8 tst.w (A1) / bpl
        else { const t = p0; p0 = p1; p1 = t; }        // $2773EC exg A0,A1
      }
      if (ok) {
        const dir = aim64(aimTables(rom), ram.u16(a6 + 0x02), ram.u16(a6 + 0x04),
          ram.u16(p0 + 2), ram.u16(p0 + 4));           // $2773EE..$2773FA jsr $24203E
        const nf = slew64(ram.u16(a5 + 0x20), dir);    // $277400/$277404 jsr $242190
        ram.setU16(a5 + 0x20, nf);                     // $27740A move.w D1,($20,A5)
        // $27740E andi.w #$3E,D1 / add.w D1,D1 -- 32 longwords at $272E7A.
        ram.setU32(a6 + S.sprite0a, rom.u32(0x272e7a + u16((nf & 0x3e) * 2)));
      }
    }
  }
  // $277420: the FIRE, gated on the long axis and its own cooldown ($1A,A5).
  if (i16(ram.u16(a6 + 0x02)) >= 0x1000) {             // $277420 cmpi.w #$1000 / blt
    const f = ram.u8(a5 + 0x1a);                       // $277428 subq.b #$1,($1A,A5)
    ram.setU8(a5 + 0x1a, (f - 1) & 0xff);
    if (f === 0) {                                     // $27742C bcc $277486
      ram.setU8(a5 + 0x1a, ram.u8(a5 + 0x17));         // $27742E move.b ($17,A5)
      if (!playerDist268018(ram, rom, a6).carry) {     // $277434 jsr $268018 / bcs
        fire89(ram, rom, a5, a6, ctx);
        // $27746A: the SALVO counter on ($1C,A5); when it borrows, ($1A,A5) is
        // reloaded from `$40 - $8130B6 + 8` instead of from ($17,A5).
        const s = ram.u8(a5 + R.rec1C);                // $27746A subq.b #$1,($1C,A5)
        ram.setU8(a5 + R.rec1C, (s - 1) & 0xff);
        if (s === 0) {                                 // $27746E bcc $277486
          ram.setU8(a5 + R.rec1C, ram.u8(a5 + R.rec1D));   // $277470
          ram.setU8(a5 + 0x1a,
            u16(0x40 - ram.u16(G.b6) + 8) & 0xff);     // $277476/$27747A/$277480
        }
      }
    }
  }
  emit89(ram, rom, a6);                                // $277486
}

/** `$277486..$27749A` -- the draw: `($1E,A6)` picks one of `$27829C`'s stubs.
 *  `$277498 jsr (A0)` and then `$27749A rts`, so it is a call, not a tail jump. */
function emit89(ram, rom, a6) {
  const stub = rom.u32(EMIT_TABLE.dispatch27829C + u16(ram.u16(a6 + S.anim) * 4));
  enqueueThroughStub(ram, rom, stub, a6);              // $277498 jsr (A0)
}

/** `$27743C..$277468` -- two `$2813F0` bullets from ONE 32-heading table of
 *  PAIRS.  `$27744C`/`$27744E` double the masked heading TWICE, so the stride
 *  is 8 bytes and `(A4)+` reads the two longwords of that heading's entry. */
function fire89(ram, rom, a5, a6, ctx) {
  const d1 = ram.u16(a5 + 0x20);                       // $277442 move.w ($20,A5),D1
  const off = u16(u16((d1 & 0x3e) * 2) * 2);           // $277448/$27744C/$27744E
  const regs = { d0: 0x6, d1, d2: ram.u32(a6 + 0x02), // $277456 moveq #$6 / $277458
    d3: rom.u32(0x2732fa + off), d4: 0, d5: 0, a5 };   // $277452 move.l (A4)+,D3
  const ctxB = { ram, rom, log: new WriteLog(ram) };
  ctx.bulletSpawn?.(0x27745c, fireBullet(ctxB, 0x2813f0, regs));   // $27745C
  regs.d3 = rom.u32(0x2732fa + off + 4);               // $277462 move.l (A4)+,D3
  ctx.bulletSpawn?.(0x277464, fireBullet(ctxB, 0x2813f0, regs));   // $277464
}

/** `$27749C..$27750C` -- type `$89`'s death.  Score `$34`, then five unported
 *  subsystems and a free.  Every one of the five is behind `$289004`, whose
 *  only driver is type-5 call #5 `$288E4E` (W34 §1.6). */
function deathSeq89(ram, rom, a5, ctx, d1) {
  const u = ctx.unported;
  const a6 = ram.u32(a5 + 0x06);                       // the SUB-RECORD (A6)
  scoreKill(ram, rom, ctx, 0x34, d1);                  // $27749C/$27749E jsr $28615E
  ctx.soundPost?.(0x28c25a);                       // WAVE A: SFX id=0, death burst          // $2774A4
  noteEffect(u, 0x289af4, a5, 'D0=$8 secondary');      // $2774BC (D1 from $278314)
  u?.note(0x27f8ee, `$27F8EE $89 death routine (D0=$8, D2=($1E,A6)) rec $${
    a5.toString(16)}`);                                // $2774C8
  // W54: SPAWNED.  $2774CE moveq #$C / $2774D0 jsr $289004, then
  // $2774D6..$277506's eight writes -- and ($12,A0) = 1 here, i.e. this
  // arm asks pool D for TWO records (`src/effects.js` §THE REFUSAL).
  {
    const e = effectArmShared278320(ram, rom, ctx, a6, 0x0c, 0x2774d0);
    ram.setU16(e + B.sub12, 0x0001);                   // $2774EE
    ram.setU16(e + B.sub14, 0x0000);                   // $2774F4
    ram.setU16(e + B.nudge, 0xfe00);                   // $2774FA
    ram.setU16(e + B.nudge + 2, 0x0000);               // $277500
    ram.setU16(e + B.hook, 1);                         // $277506
  }
  freeEnemy(ram, a5);                                  // $27750C jmp $263762
}

// ------------------------------------------------------------------------
// $275F30 -- TYPE $88, 3 records, first trigger clk 322
// ------------------------------------------------------------------------
// 303 instructions, the largest body this wave ports and the third-largest in
// the stage after the midboss (576) and type `$80` (310).  Span
// `$275F30..$2763D0`; `$2763D6` is a `nop` and `$2763D8` is its own sprite
// table, which is why the `jmp $263762` at `$2763D0` is the end.
//
// It is a TWIN-TURRET gun platform: two independent aim states (`($28,A5)` and
// `($2E,A5)`), alternated by `$27608E bchg #$6,($1,A6)` so each updates on
// every other frame, four sprite emits, and six bullets per volley.
function handler88(ram, rom, a5, ctx) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  // The out-object is EMPTY on purpose: `$2638A6` zeroes D2/D3 itself on the
  // frozen entry ($2638A0) and on a stop heading ($263910), so pre-filling it
  // here would put the cartridge's own initialisation in two places and make
  // the one in src/movement.js unfalsifiable.
  const vec = {};
  if (stepMovement(ram, rom, a5, tables, u, vec)) return;    // $275F30 jsr $2638A6
  // $275F36..$275F58: the RECOIL/LEAN.  D3 is `$2638A6`'s own return (see
  // src/movement.js) -- the block is four instructions after the call and reads
  // it before anything else can touch it.
  if (ram.u16(a6 + 0x2e) !== 0 && (ram.u8(a6) & 0x20) !== 0) {  // $275F36/$275F3C
    let at = a6 + 0x16;                                // $275F42 lea ($16,A6),A0
    let d3 = vec.dx;                                   // D3
    if (ram.u16(a6 + 0x30) !== 0) {                    // $275F46 tst.w ($30,A6) / beq
      at = a6 + 0x14;                                  // $275F4C lea ($14,A6),A0
      d3 = -d3;                                        // $275F50 neg.w D3
    }
    if (i16(ram.u16(at)) < 0xc00) {                    // $275F52 cmpi.w #$C00 / bge
      ram.setU16(at, u16(ram.u16(at) + d3));           // $275F58 add.w D3,(A0)
    }
  }
  // $275F5A..$275F88: the bounds test.  Y += $1400 + scroll + $A000, then
  // X += $C00 + $7800; the SECOND `bcc` is the on-screen arm.
  const pos = ram.u32(a6 + 0x02);
  let off = u16(u16((pos & 0xffff) + 0x1400) + ram.u16(G.scroll)) + 0xa000 > 0xffff;
  if (!off) off = u16((pos >>> 16) + 0xc00) + 0x7800 > 0xffff;   // $275F70/$275F78 bcc
  if (off) {                                           // $275F7A
    if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; }  // $275F80
  } else {
    ram.setU8(a5 + R.onScreen, 1);                     // $275F88
  }
  // $275F8E: the damage branch -- the same two-armed shape as type $89's, with
  // the HP threshold `$4A0` instead of `$120` and the palette source ($1C,A5).
  let d0;
  if ((ram.u8(a6) & 0x5c) === 0) {                     // $275F8E moveq #$5C / beq
    d0 = ram.u8(a5 + R.rec1C);                         // $275F94 move.b ($1C,A5),D0
    if (ram.u16(a6 + S.hp) < 0x4a0 && ram.u16(G.ca) === 0) {   // $275F98/$275FA0
      d0 = 0x19;                                       // $275FA8 moveq #$19,D0
    }
  } else {
    const d1 = hitMask(ram, a6);
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // $275FAC andi.b #$A3,(A6)
    scoreHit(ram, ctx, a6, d1);                        // $275FB0 jsr $286096
    d0 = ram.u8(a6 + S.palette);                       // $275FB6
    if (d0 === 0x19) d0 = ram.u8(a5 + R.rec1C);        // $275FBA/$275FC0
    d0 ^= ram.u8(a5 + R.rec1D);                        // $275FC4/$275FC8
    if ((ram.u16(a6 + S.hp) & 0x8000) !== 0) {         // $275FCA tst.w / bmi $27627E
      deathSeq88(ram, rom, a5, ctx, d1); return;
    }
  }
  ram.setU8(a6 + S.palette, d0 & 0xff);                // $275FD2 move.b D0,($1D,A6)
  u?.note(0x28ac72, `$28AC72 sub-record spawn engine in $88 rec $${
    a5.toString(16)} -- the $81DB90 pool, driver $28AD70 also unported`);  // $275FD6
  // $275FDC: the MUZZLE ANIMATION, gated on the freeze and on the heading.
  if (ram.u16(G.freeze) === 0 && ram.u8(a6 + S.heading) < 0x40) {  // $275FDC/$275FEA
    ram.setU16(a6 + 0x06, 0xf400);                     // $275FE4 move.w #$F400,($6,A6)
    const c = ram.u8(a6 + 0x26);                       // $275FF2 subq.b #$1,($26,A6)
    ram.setU8(a6 + 0x26, (c - 1) & 0xff);
    if (c === 0) {                                     // $275FF6 bcc $27603A
      ram.setU8(a6 + 0x26, ram.u8(a6 + 0x27));         // $275FF8
      ram.setU16(a6 + 0x06, 0xf3c0);                   // $275FFE move.w #$F3C0,($6,A6)
      // $276004 cmpi.b #$10,($1B,A6): heading $10 counts UP and wraps at $10,
      // every other heading counts DOWN and wraps at $C.
      if (ram.u8(a6 + S.heading) === 0x10) {           // $276004 / $27600A bne
        ram.setU16(a6 + 0x28, u16(ram.u16(a6 + 0x28) + 4));    // $27600C addq.w #$4
        if (ram.u16(a6 + 0x28) === 0x10) ram.setU16(a6 + 0x28, 0);  // $276010/$276018
      } else {
        const n = u16(ram.u16(a6 + 0x28) - 4);         // $27601E subq.w #$4
        ram.setU16(a6 + 0x28, n);
        if (n > 0xfff0) ram.setU16(a6 + 0x28, 0x0c);   // $276022 bcc / $276024
      }
      ram.setU32(a6 + 0x2a,                            // $27602A/$276034 move.l (A0,D0.w)
        rom.u32(0x2763d8 + ram.u16(a6 + 0x28)));
    }
  }
  // $27603A `tst.l $8130D2` -- a LONGWORD test again ($8130D2/$8130D4 together).
  if (ram.u32(G.freeze) === 0) {                       // $27603A / $276040 bne $2760E8
    const c = ram.u8(a5 + 0x22);                       // $276044 subq.b #$1,($22,A5)
    ram.setU8(a5 + 0x22, (c - 1) & 0xff);
    // $276048 bcc $2760E8 -- the aim runs only on the BORROW frame.  The reload
    // at $27604C happens on that frame WHATEVER the ($20,A5)/($21,A5) test
    // says; only the aim itself is behind the `bne` at $27605A.
    if (c === 0) {
      ram.setU8(a5 + 0x22, ram.u8(a5 + 0x23));         // $27604C
      if (ram.u8(a5 + 0x20) === ram.u8(a5 + 0x21)) {   // $276052/$276056/$27605A
        aim88(ram, rom, a5, a6);                       // $27605E..$2760E6
      }
    }
  }
  emit88(ram, rom, a5, a6);                            // $2760E8..$27617A
  // $27617C: the FIRE gate -- freeze, long axis, and the ($1E,A5) cooldown.
  if (ram.u32(G.freeze) !== 0) return;                 // $27617C tst.l / bne $276192
  if (i16(ram.u16(a6 + 0x02)) < 0x1000) return;        // $276184 cmpi.w #$1000 / blt
  const f = ram.u8(a5 + R.rec1E);                      // $27618C subq.b #$1,($1E,A5)
  ram.setU8(a5 + R.rec1E, (f - 1) & 0xff);
  if (f !== 0) return;                                 // $276190 bcs $276194 (borrow only)
  ram.setU8(a5 + R.rec1E, ram.u8(a5 + 0x31));          // $276194 move.b ($31,A5)
  fire88(ram, rom, a5, a6, ctx);                       // $27619A..$27623E
  // $276244: the two salvo counters.  The SECOND overwrites ($1E,A5) again.
  const s = ram.u8(a5 + 0x20);                         // $276244 subq.b #$1,($20,A5)
  ram.setU8(a5 + 0x20, (s - 1) & 0xff);
  if (s !== 0) return;                                 // $276248 bcc $27627C
  ram.setU8(a5 + 0x20, ram.u8(a5 + 0x21));             // $27624A
  ram.setU8(a5 + R.rec1E,
    u16(0x0a - (ram.u16(G.bc) >>> 2)) & 0xff);         // $276250/$276254/$27625A/$27625E
  const s2 = ram.u8(a5 + 0x32);                        // $276262 subq.b #$1,($32,A5)
  ram.setU8(a5 + 0x32, (s2 - 1) & 0xff);
  if (s2 !== 0) return;                                // $276266 bcc $27627C
  ram.setU8(a5 + 0x32, ram.u8(a5 + 0x33));             // $276268
  ram.setU8(a5 + R.rec1E,
    u16(0x60 - ram.u16(G.b4)) & 0xff);                 // $27626E/$276272/$276278
}

/** `$27605E..$2760E6` -- type `$88`'s TWO aim states.  `$27608E bchg #$6,($1,A6)`
 *  TESTS the old bit and FLIPS it, so the two turrets update on alternate
 *  frames; the muzzle biases differ ($5C0 vs $F9C0 on the short axis) and so do
 *  the record fields they store into. */
function aim88(ram, rom, a5, a6) {
  let p0 = AIM.selP1, p1 = AIM.selP2;                  // $27605E/$276064
  if (ram.u8(a5 + 0x03) !== 0) { p0 = AIM.selP2; p1 = AIM.selP1; }  // $276070 exg
  if ((ram.u16(p0) & 0x8000) === 0) {                  // $276072 tst.w (A0) / bmi
    if ((ram.u16(p1) & 0x8000) === 0) return;          // $276076 tst.w (A1) / bpl
    const t = p0; p0 = p1; p1 = t;                     // $27607A exg A0,A1
  }
  const ty = ram.u16(p0 + 2), tx = ram.u16(p0 + 4);    // $27607C movem.w ($2,A0),D2-D3
  const sy = ram.u16(a6 + 0x02), sx = ram.u16(a6 + 0x04);  // $276082 movem.w ($2,A6)
  const was = (ram.u8(a6 + 0x01) & 0x40) !== 0;        // $27608E bchg #$6,($1,A6)
  ram.setU8(a6 + 0x01, ram.u8(a6 + 0x01) ^ 0x40);
  const t = aimTables(rom);
  if (!was) {                                          // $276094 bne $2760C0
    const dir = aim64(t, u16(sy + 0x300), u16(sx + 0x5c0), ty, tx);  // $276096/$27609A
    const nf = slew64(ram.u16(a5 + R.fireCtr), dir);   // $2760A4/$2760A8 jsr $242190
    ram.setU16(a5 + R.fireCtr, nf);                    // $2760AE move.w D1,($28,A5)
    ram.setU32(a5 + R.rec24, rom.u32(0x272d7a + u16((nf & 0x3e) * 2)));  // $2760B8
    return;                                            // $2760BE bra $2760E8
  }
  const dir = aim64(t, u16(sy + 0x300), u16(sx + 0xf9c0), ty, tx);   // $2760C0/$2760C4
  const nf = slew64(ram.u16(a5 + 0x2e), dir);          // $2760CE/$2760D2 jsr $242190
  ram.setU16(a5 + 0x2e, nf);                           // $2760D8 move.w D1,($2E,A5)
  ram.setU32(a5 + 0x2a, rom.u32(0x272d7a + u16((nf & 0x3e) * 2)));   // $2760E2
}

/**
 * `$2760E8..$27617A` -- FOUR sprite requests, and the last one is why the
 * registers have to be modelled rather than rebuilt per call.
 *
 * `$27615C` sets only `move.w ($4,A6),D1` -- a WORD -- so D1's HIGH half is
 * still the previous request's `($2,A6)+$FF00`; and it sets neither D3 nor D4,
 * so both carry over from the request before.  Rebuilding the registers for
 * each call would put a different sprite on the screen.
 */
function emit88(ram, rom, a5, a6) {
  const idx = u16(ram.u16(a6 + S.anim) * 4);
  // #1 -- the RECORD convention, through $27829C.
  enqueueThroughStub(ram, rom,
    rom.u32(EMIT_TABLE.dispatch27829C + idx), a6);     // $2760FA jsr (A0)
  const pos = ram.u32(a6 + 0x02);
  const stub2 = rom.u32(EMIT_TABLE.dispatch2782E4 + idx); // $276120 lea $2782E4
  // #2 -- $2760FC..$27612A.  Two `addi.w`s straddling a pair of swaps.
  let d1 = ((u16((pos >>> 16) + 0xf200) << 16)         // $276106 addi.w #$F200
    | u16((pos & 0xffff) + 0xf500)) >>> 0;             // $276100 addi.w #$F500
  let d3 = 0x458;                                      // $276110 move.w #$458,D3
  let d4 = ram.u16(a6 + S.f1c);                        // $276114 move.w ($1C,A6),D4
  enqueueRegistersThroughStub(ram, rom, stub2, d1,
    ram.u32(a6 + 0x2a), d3, d4);                       // $27610C move.l ($2A,A6),D2
  // #3 -- $27612C..$27615A.
  d1 = ((u16((pos >>> 16) + 0xff00) << 16)             // $276136 addi.w #$FF00
    | u16((pos & 0xffff) + 0x2c0)) >>> 0;              // $276130 addi.w #$2C0
  d3 = 0x418;                                          // $276140 move.w #$418,D3
  d4 = ram.u16(a6 + S.f1c);                            // $276144 move.w ($1C,A6),D4
  enqueueRegistersThroughStub(ram, rom, rom.u32(0x2782e4 + idx), d1,
    ram.u32(a5 + R.rec24), d3, d4);                    // $27613C move.l ($24,A5),D2
  // #4 -- $27615C..$27617A.  D1's high half, D3 and D4 are #3's leftovers.
  d1 = ((d1 & 0xffff0000)                              // (unchanged)
    | u16(ram.u16(a6 + 0x04) + 0xf6c0)) >>> 0;         // $27615C/$276160
  enqueueRegistersThroughStub(ram, rom, rom.u32(0x2782e4 + idx), d1,
    ram.u32(a5 + 0x2a), d3, d4);                       // $276164 move.l ($2A,A5),D2
}

/**
 * `$27619A..$27623E` -- SIX bullets, three per turret, from one 32-heading
 * longword table `$2731FA`.  The three per turret are `$281442`, `$2813F0`,
 * `$281442` with D1 stepped by 5 between them, and the STARTING step depends on
 * `($32,A5)`: 0 -> +3, 1 -> +5, anything else -> +0.  D2 is set ONCE at
 * `$2761BE` and both turrets use it.
 */
function fire88(ram, rom, a5, a6, ctx) {
  const ctxB = { ram, rom, log: new WriteLog(ram) };
  const d2 = ram.u32(a6 + 0x02);                       // $2761BE move.l ($2,A6),D2
  const s32 = ram.u8(a5 + 0x32);
  // ---- turret A, from ($28,A5), muzzle bias (+$300 long, +$5C0 short).
  let d1 = ram.u16(a5 + R.fireCtr);                    // $2761A0 move.w ($28,A5),D1
  let e = rom.u32(0x2731fa + u16((d1 & 0x3e) * 2));    // $2761A6/$2761AA/$2761AC
  let d3 = (((u16((e >>> 16) + 0x300) << 16)           // $2761B6 addi.w #$300
    | u16((e & 0xffff) + 0x5c0)) >>> 0);               // $2761B0 addi.w #$5C0
  let regs = { d0: 0x00030004, d1, d2, d3, d4: 0, d5: 0, a5 };  // $2761C2
  if (s32 === 0) regs.d1 = u16(d1 + 3);                // $2761C8 tst.b / $2761CE addq #3
  else if (s32 === 1) regs.d1 = u16(d1 + 5);           // $2761D4 cmpi.b #$1 / $2761DC
  ctx.bulletSpawn?.(0x2761de, fireBullet(ctxB, 0x281442, regs));   // $2761DE
  regs.d1 = u16(regs.d1 - 5);                          // $2761E4 subq.w #$5,D1
  ctx.bulletSpawn?.(0x2761e6, fireBullet(ctxB, 0x2813f0, regs));   // $2761E6
  regs.d1 = u16(regs.d1 - 5);                          // $2761EC subq.w #$5,D1
  ctx.bulletSpawn?.(0x2761ee, fireBullet(ctxB, 0x281442, regs));   // $2761EE
  // ---- turret B, from ($2E,A5), bias (+$300 long, +$F9C0 short), steps negated.
  d1 = ram.u16(a5 + 0x2e);                             // $2761F4 move.w ($2E,A5),D1
  e = rom.u32(0x2731fa + u16((d1 & 0x3e) * 2));        // $2761FA/$2761FE/$276200
  d3 = (((u16((e >>> 16) + 0x300) << 16)               // $27620A addi.w #$300
    | u16((e & 0xffff) + 0xf9c0)) >>> 0);              // $276204 addi.w #$F9C0
  regs = { d0: 0x00030004, d1, d2, d3, d4: 0, d5: 0, a5 };        // $276212
  if (s32 === 0) regs.d1 = u16(d1 - 3);                // $276218 / $27621E subq #3
  else if (s32 === 1) regs.d1 = u16(d1 - 5);           // $276224 / $27622C subq #5
  ctx.bulletSpawn?.(0x27622e, fireBullet(ctxB, 0x281442, regs));   // $27622E
  regs.d1 = u16(regs.d1 + 5);                          // $276234 addq.w #$5,D1
  ctx.bulletSpawn?.(0x276236, fireBullet(ctxB, 0x2813f0, regs));   // $276236
  regs.d1 = u16(regs.d1 + 5);                          // $27623C addq.w #$5,D1
  ctx.bulletSpawn?.(0x27623e, fireBullet(ctxB, 0x281442, regs));   // $27623E
}

/** `$27627E..$2763D0` -- type `$88`'s death.  Score `$115` (a LONGWORD `move.l
 *  #$115,D0`, not a `moveq`), then a seven-iteration `$27F8FA` loop over
 *  `$2763E8` and FOUR `$289004` allocations, each with eight to ten field
 *  writes into the record the allocator would have returned. */
function deathSeq88(ram, rom, a5, ctx, d1) {
  const u = ctx.unported;
  const a6 = ram.u32(a5 + 0x06);                       // the SUB-RECORD (A6)
  scoreKill(ram, rom, ctx, 0x115, d1);                 // $27627E/$276284 jsr $28615E
  ctx.soundPost?.(0x28c2dc);                       // WAVE A: BGM id=5, death burst          // $27628A
  noteEffect(u, 0x289b22, a5, 'D0=$C, D2=$FFFFFA00');  // $27629C
  noteEffect(u, 0x289b22, a5, 'D0=$C, D2=$00000600');  // $2762A8
  u?.note(0x27f8fa, `$27F8FA x7 (D0=$8, D1 from $2763E8) in $88's death rec $${
    a5.toString(16)}`);                                // $2762BA (dbra x7)
  // W54: SPAWNED, all four.  Same $278320 prologue, four different tails.
  // Each writes ($12,A0) = 1 -- TWO pool-D records apiece, all refused.
  for (const [kind, site, sub14, nudge, speedAngle] of [
    [0x0d, 0x2762c6, 0x0400, 0x02000000, null],        // $2762CC..$2762FC
    [0x0c, 0x276304, 0x0000, 0xfe00fa00, 0x05c0],      // $27630A..$276340
    [0x0c, 0x276348, 0x0400, 0xfc000200, 0x0440],      // $27634E..$276384
    [0x85, 0x27638e, 0x0000, 0xfe000000, 0x0380],      // $276394..$2763CA
  ]) {
    const e = effectArmShared278320(ram, rom, ctx, a6, kind, site);
    ram.setU16(e + B.sub12, 0x0001);
    ram.setU16(e + B.sub14, sub14);
    ram.setU32(e + B.nudge, nudge >>> 0);
    if (speedAngle !== null) ram.setU16(e + B.speed, speedAngle);
    ram.setU16(e + B.hook, 1);
  }
  freeEnemy(ram, a5);                                  // $2763D0 jmp $263762
}

// ------------------------------------------------------------------------
// $2697F6 -- TYPE $31, 1 record, first trigger clk 481
// ------------------------------------------------------------------------
// A pure ANIMATION object: no movement, no damage branch, no fire.  It walks an
// 8-byte-per-entry table at `$26990E` through three phases and frees itself.
//
// **THE TABLE'S EXTENT IS PINNED BY THE HANDLER'S OWN WRAP CONSTANT AND BY
// CODE.**  Phase 2 frees the record when the cursor reaches `$230`, and
// `$26990E + $230 == $269B3E` -- which is the damage-first family's shared draw
// block, i.e. instructions.  So the table is exactly `$26990E..$269B3D`, 70
// entries, and the two ends agree.
function handler31(ram, rom, a5, ctx) {
  const { unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (ram.u16(a5 + 0x20) !== 0) {                      // $2697F6 tst.w ($20,A5) / beq
    const c = ram.u8(a5 + R.rec1E);                    // $2697FE subq.b #$1,($1E,A5)
    ram.setU8(a5 + R.rec1E, (c - 1) & 0xff);
    if (c === 0) {                                     // $269802 bcc $269816
      ram.setU8(a5 + R.rec1E, ram.u8(a5 + 0x1f));      // $269806
      ctx.soundPost?.(0x28c692);                    // WAVE A: BGM id=$1C, the $31 emitter ($26980C)
      ram.setU16(a5 + 0x20, u16(ram.u16(a5 + 0x20) - 1));   // $269812 subq.w #$1
    }
  }
  ram.setU16(a6 + 0x04, 0x1c00);                       // $269816 move.w #$1C00,($4,A6)
  // $26981C subq.w #$1,($18,A5) / $269820 bcc $2698C4.  The WORD subtract
  // borrows only when the counter was already 0, so a new animation frame is
  // taken on exactly that tick and on no other.
  const was = ram.u16(a5 + R.cooldown);
  ram.setU16(a5 + R.cooldown, u16(was - 1));
  if (was !== 0) { emit31(ram, rom, a5, a6); return; }
  const phase = ram.u16(a5 + R.onScreen);              // $269824 cmpi.w #$0,($16,A5)
  if (phase === 0) {                                   // $26982A bne $269858
    animStep31(ram, rom, a5, a6);
    if (ram.u16(a5 + 0x1a) === 0xf0) {                 // $269844 cmpi.w #$F0 / bne
      ram.setU16(a5 + R.onScreen, 1);                  // $26984E move.w #$1,($16,A5)
    }
  } else if (phase === 1) {                            // $269858 cmpi.w #$1 / bne
    animStep31(ram, rom, a5, a6);
    if (ram.u16(a5 + 0x1a) === 0x128) {                // $269878 cmpi.w #$128 / bne
      ram.setU16(a5 + 0x1a, 0x100);                    // $269882 -- the LOOP BACK
      const n = u16(ram.u16(a5 + R.rec1C) - 1);        // $269888 subq.w #$1,($1C,A5)
      ram.setU16(a5 + R.rec1C, n);
      if (n === 0xffff) ram.setU16(a5 + R.onScreen, 2);     // $26988C bcc / $269890
    }
  } else {                                             // $26989A
    animStep31(ram, rom, a5, a6);
    if (ram.u16(a5 + 0x1a) === 0x230) { freeEnemy(ram, a5); return; }  // $2698B2/$2698BC
  }
  emit31(ram, rom, a5, a6);                            // $2698C4
}

/** `$26982C`/`$269860`/`$26989A` -- the identical four instructions in all three
 *  phases: read the 6-byte entry at `$26990E + ($1A,A5)` into the sprite pointer
 *  and the frame counter, then step the cursor by EIGHT. */
function animStep31(ram, rom, a5, a6) {
  const at = 0x26990e + ram.u16(a5 + 0x1a);            // lea $26990E(pc) / adda.w D0
  ram.setU32(a6 + S.sprite0a, rom.u32(at));            // move.l (A0)+,($A,A6)
  ram.setU16(a5 + R.cooldown, rom.u16(at + 4));        // move.w (A0)+,($18,A5)
  ram.setU16(a5 + 0x1a, u16(ram.u16(a5 + 0x1a) + 8));  // addq.w #$8,($1A,A5)
}

/** `$2698C4..$269904` -- ONE enqueue through `$23F896`, and a SECOND one when
 *  `$80390C` is non-zero.  Which side the second sits on is decided by BIT 1 OF
 *  `$80390B` -- the byte BELOW `$80390C`, not part of that word -- and the arm
 *  moves the long axis by -+$40 around the extra request and puts it back, so
 *  the record is unchanged on exit either way. */
function emit31(ram, rom, a5, a6) {
  void a5;
  enqueueThroughStub(ram, rom, 0x23f896, a6);          // $2698C4 jsr $23F896
  if (ram.u16(G.mirror2) === 0) return;                // $2698CA tst.w $80390C / beq
  const d = (ram.u8(G.mirror) & 0x02) !== 0 ? -0x40 : 0x40;  // $2698D2 btst #$1
  ram.setU16(a6 + 0x02, u16(ram.u16(a6 + 0x02) + d));  // $2698DC subi.w / $2698F0 addi.w
  enqueueThroughStub(ram, rom, 0x23f896, a6);          // $2698E2 / $2698F6
  ram.setU16(a6 + 0x02, u16(ram.u16(a6 + 0x02) - d));  // $2698E8 addi.w / $2698FC subi.w
}

// ------------------------------------------------------------------------
// $29700C -- TYPE $24, 1 record, first trigger clk 464
// ------------------------------------------------------------------------
// The only stage-1 handler whose body lives in `$29xxxx`, next door to the
// boss.  It is a two-part scroll-locked object that draws itself TWICE (a body
// and a tail `$FDC00080` away), through `$23DECE` -- a register-convention
// emitter on BUCKET 0, the bucket W28 measured at 72.1 % of the picture and no
// producer.  `$2970D4` is the last instruction; `$2970D8` is its own
// 16-longword sprite table and `$297118` is the next init stub, so both ends of
// that table are pinned by code.
function handler24(ram, rom, a5, ctx) {
  const { tables } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (ram.u16(G.freeze) !== 0) { emit24(ram, rom, a5, a6); return; }  // $29700C/$297012
  scrollCompensate(ram, a5);                           // $297016 jsr $24179E
  applyVelocity(ram, tables, a5);                      // $29701C jsr $2417DE
  if (ram.u16(a5 + R.rec1E) === 0) {                   // $297022 cmpi.w #$0,($1E,A5)
    const n = u16(ram.u16(a5 + R.rec1C) - 1);          // $29702C subq.w #$1,($1C,A5)
    ram.setU16(a5 + R.rec1C, n);
    if (n === 0) {                                     // $297030 bne $297046
      ram.setU16(a6 + S.speed, 0x537);                   // $297034 move.w #$537,($1A,A6)
      ram.setU16(a5 + R.rec1E, 1);                     // $29703A
      ram.setU16(a5 + R.rec1C, 0x808);                 // $297040
    }
  }
  if (ram.u16(a5 + R.rec1E) === 1) {                   // $297046 cmpi.w #$1 / bne
    const c = ram.u8(a5 + R.rec1C);                    // $297050 subq.b #$1,($1C,A5)
    ram.setU8(a5 + R.rec1C, (c - 1) & 0xff);
    if (c === 0) {                                     // $297054 bcc $297062
      ram.setU8(a5 + R.rec1C, ram.u8(a5 + R.rec1D));   // $297058
      ram.setU8(a6 + S.speed, (ram.u8(a6 + S.speed) + 1) & 0xff);  // $29705E addq.b #$1
    }
  }
  // $297062 cmpi.w #$DE00,($4,A6) / bgt $297074 -- a SIGNED test on the short
  // axis; anything at or below $DE00 walks off and is freed.
  if (i16(ram.u16(a6 + 0x04)) <= i16(0xde00)) { freeEnemy(ram, a5); return; }  // $29706C
  const c = ram.u8(a5 + 0x1a);                         // $297074 subq.b #$1,($1A,A5)
  ram.setU8(a5 + 0x1a, (c - 1) & 0xff);
  if (c === 0) {                                       // $297078 bcc $29709E
    ram.setU8(a5 + 0x1a, ram.u8(a5 + 0x1b));           // $29707C
    // $297082/$297090/$297094: the sprite cursor steps by 4, and by TWELVE once
    // the animation byte has reached $10 -- `blt $297098` skips the two extra
    // `addq`s, it does not skip the first.
    let cur = u16(ram.u16(a5 + R.cooldown) + 4);       // $297082 addq.w #$4,($18,A5)
    // $297086 cmpi.b #$10,($1A,A6) / $29708C blt $297098 -- a SIGNED BYTE
    // compare, so $80..$FF are NEGATIVE here and take the short step.
    const b = ram.u8(a6 + S.speed);
    if ((b >= 0x80 ? b - 0x100 : b) >= 0x10) {         // $297086 cmpi.b #$10 / blt
      cur = u16(cur + 8);                              // $297090/$297094 addq.w #$4 x2
    }
    ram.setU16(a5 + R.cooldown, cur & 0x3f);           // $297098 andi.w #$3F
  }
  emit24(ram, rom, a5, a6);                            // $29709E
}

/** `$29709E..$2970D4` -- TWO register-convention requests through `$23DECE`.
 *  The first takes its sprite from the LITERAL `$7E8AC`; the second reads
 *  `$2970D8 + ($18,A5)` and biases the position by `$FDC00080` as ONE longword
 *  add, so the low half's carry reaches the high half. */
function emit24(ram, rom, a5, a6) {
  const d1 = ram.u32(a6 + 0x02);                       // $2970A4 move.l ($2,A6),D1
  enqueueRegistersThroughStub(ram, rom, 0x23dece, d1,
    0x0007e8ac,                                        // $29709E move.l #$7E8AC,D2
    0x1488,                                            // $2970A8 move.w #$1488,D3
    0x13);                                             // $2970AC moveq #$13,D4
  enqueueRegistersThroughStub(ram, rom, 0x23dece,
    u32(d1 + 0xfdc00080),                              // $2970C4 addi.l #$FDC00080,D1
    rom.u32(0x2970d8 + ram.u16(a5 + R.cooldown)),      // $2970BA/$2970BE move.l (A0),D2
    0x1488, 0x13);                                     // $2970CA/$2970CE/$2970D0 jmp
}

// ############################################################################
// #  W57 (M1) -- TYPE $1C, THE OBJECT THE MIDBOSS'S DEATH SPAWNS             #
// ############################################################################
//
// **THIS IS A BACKGROUND BLIT, NOT A SPRITE.**  W56 §2.4 read `$26C220`'s
// `lea $9000BC,A0` as "a palette/gradient write into PGM register space
// `$9000xx` that the port does not model".  IT IS THE PORT'S OWN BG VIDEORAM.
// `$240D92 lea $900000,A0 / adda.w D0,A0 / move.l D4,(A0)` with
// `D0 = ((row << 6) + col) * 4` is `src/background.js writeMapLong`, ported
// since W13, and `BgVram.setLong` is its store.  $26C20C addresses the SAME
// array with the SAME arithmetic, spelled out of registers instead of out of
// two loop counters:
//
//     A2 = A0 + row * $100       $26C24C adda.w #$100,A2   -> the ROW stride
//     A0 = A0 + col * 4          $26C254 adda.w #$4,A0     -> the COLUMN stride
//     byte offset = row * $100 + col * 4  ==  ((row << 6) + col) * 4
//
// AND ITS SOURCE IS THE STAGE'S OWN COLUMN STREAM.  `$26C220 lea $227AF8,A1`
// is column **224** of the WAVE 13 window `$225B78` (248 columns x 36 B;
// $225B78 + 224*36 == $227AF8, exact), and the 23 x 9 longwords the two `dbra`s
// copy are 828 bytes == 23 columns x 36 B, exact.  So the routine paints 23
// map columns into the 64-column ring in ONE frame.  Stage 1's script ends at
// distance clock $0344 == 836, i.e. about 209 columns at four clocks each, so
// columns 224..246 are PAST the end of the scrolled map: they are a dedicated
// 23-column art block, and this is what puts it on the screen.
//
// The tile base is the LITERAL `$32A90000` ($26C244 addi.l), not one of the
// five per-stage bases at `$240D62` ($0AA90000 $12A90000 $1AA90000 $1EA90000
// $26A90000) -- so it is transcribed as the literal it is.  A port that
// "tidied" it into `writeMapLong` would look up the wrong bank.
//
// THE COLUMN MASK IS LOAD-BEARING.  `$26C258 move.l A0,D0 / $26C25A andi.w
// #$FF,D0 / $26C25E movea.l D0,A0` masks the LOW WORD only, so A0 walks
// $9000BC..$9000FC and then WRAPS to $900000..$900014 -- ring columns 47..63
// then 0..5.  Seventeen of the 23 columns are above the wrap and six are below
// it; dropping the mask writes six columns into row 1 instead of into the ring.
//
// AND IT LEAVES BY ONE ARM ONLY.  `$26C20C cmpi.w #$105,$8130CE / bne $26C220 /
// jmp $263762` -- the object frees itself when the distance clock is EXACTLY
// $0105 (261), which is 21 ticks after the crawl's release at $00F0.  Until
// then it re-paints all 207 longwords every frame.  Read past the apparent end:
// `$26C264 rts` is the real end, and `$26C266 move.w #$6,($4,A5) / rts` is type
// **$12**'s init stub ($267824 + 8*$12 == $2678B4 -> ($26C266, $26C3E2)), a
// different type -- so there is nothing to fall through into.
/** `$26C20C` -- type $1C's handler. `ctx.vram` is the `BgVram` this writes. */
function handler1C(ram, rom, a5, ctx) {
  if (ram.u16(G.clock) === 0x0105) {                   // $26C20C cmpi.w #$105,$8130CE
    freeEnemy(ram, a5);                                // $26C218 jmp $263762
    return;                                            // $26C214 bne is the OTHER arm
  }
  const vram = ctx?.vram;
  if (!vram) {
    unreached(0x26c226, `type $1C's handler reached $26C226 lea $9000BC,A0 `
      + `without a BgVram. Its 23x9 longwords ARE the background map -- the `
      + `same array $240D9A writes -- so the caller must pass \`vram\` in ctx `
      + `(src/main.js #ctx). Refusing to drop 207 map longwords silently`);
  }
  let a1 = 0x227af8;                                   // $26C220 lea $227AF8,A1
  // $26C22C tst.w $803926 / $26C232 beq $26C23C / $26C236 lea $9000A4,A0.
  // [M] $803926's five build-B writers are $23BE6E (:=0 at boot), $25A7DE
  // (clr), $25C598 (:=1), $25C7FE (:=0) and $25C8BC (:=0); it is 0 through
  // stage-1 play, so the $9000A4 arm is transcribed and unexercised.
  let a0 = ram.u16(0x803926) !== 0 ? 0x9000a4 : 0x9000bc;  // $26C226 / $26C236
  for (let d6 = 0x16; d6 >= 0; d6--) {                 // $26C23C moveq #$16,D6 / dbra
    // $26C23E movea.l A0,A2.  The column index is the low WORD of the address
    // over four, NOT the low BYTE: taking the byte here would apply $26C25A's
    // mask a second time and make dropping it unobservable, which is a check
    // that cannot fail (`docs/knowledge/03`, and W31's own M22).  `setLong`'s
    // `((row << 6) + col) & $3FF` is the address arithmetic, so an unmasked
    // $900100 lands where the 68000 would put it -- row+1, column 0.
    const col = (a0 & 0xffff) >>> 2;
    for (let row = 0; row <= 8; row++) {               // $26C240 moveq #$8,D7 / dbra
      const d4 = rom.u32(a1);                          // $26C242 move.l (A1)+,D4
      a1 += 4;
      vram.setLong(row, col, u32(d4 + 0x32a90000));    // $26C244 addi.l / $26C24A move.l D4,(A2)
    }                                                  // $26C24C adda.w #$100,A2
    a0 += 4;                                           // $26C254 adda.w #$4,A0
    a0 = (a0 & ~0xffff) | (a0 & 0xff);                 // $26C258/$26C25A/$26C25E
  }
}                                                      // $26C264 rts

// ############################################################################
// #  W170: TYPE $95, THE FIRST STAGE-2-ONLY ENEMY                         #
// ############################################################################
//
// `$2779B6..$277DB6` is one closed handler.  The four muzzle-offset words at
// `$277DB8` and the eight art pointers at `$277DC0` are data; `$277DE0` is the
// next type's init stub.  The animation cursor in record +$20 advances by raw
// byte offsets 0,4,...,$1C, so exactly all eight pointers are live.
export const TYPE95_ART = Object.freeze({
  main: 0x1744f8, table: 0x277dc0, frames: 8, fixed: 0x174e7c,
});

// `$276D50` has 32 heading pointers and `$276DD0` has six animation pointers.
// Together with the immediate death stream they name exactly 39 contiguous
// sprite streams from `$192ACC` through `$193DC8`.
export const TYPE8D_ART = Object.freeze({
  headingTable: 0x276d50, headings: 32, death: 0x193b4c,
  animationTable: 0x276dd0, animations: 6,
});

// `$272EFA` is a closed 32-long heading table. Every pointer advances by the
// exact sprite-stream stride `$A4`; the last heading ends at the immediate
// first-death stream `$155B90`, which in turn ends at `$155C34`.
export const TYPE8F_ART = Object.freeze({
  headingTable: 0x272efa, headings: 32, death: 0x155b90,
});

// Type $84's body stream, three fixed attachments and four-frame animation.
// Its inseparable cue pool adds three exact descriptor art tables (4 + 4 + 8).
export const TYPE84_ART = Object.freeze({
  body: 0x17d994, fixedA: 0x17db98, fixedB: 0x17ddcc, fixedC: 0x17de10,
  animationTable: 0x2757ca, animationFrames: 4,
  cue0Table: 0x28b032, cue0Frames: 4,
  cue4Table: 0x28b050, cue4Frames: 4,
  cue8Table: 0x28b06e, cue8Frames: 8,
});

// Type $90 has no pointer table: its one long-form prototype carries this
// immediate sprite-stream address and `$2799A6` always calls `$23D762`
// directly. `romExtent` in export-web proves the immediate is a stream start.
export const TYPE90_ART = Object.freeze({ main: 0x2351ac });

// Type $91 also carries its only body stream directly in the one long-form
// prototype. Its emitter is selected from `$27829C` by sub-record +$1E.
export const TYPE91_ART = Object.freeze({ main: 0x235470 });

// Type $92's one long-form prototype carries its only body stream directly.
export const TYPE92_ART = Object.freeze({ main: 0x23624c });

// Type $93 carries its only body stream directly in the sub-record prototype.
export const TYPE93_ART = Object.freeze({ main: 0x237470 });

// Type $97 animates four consecutive body streams through `$278278`.
export const TYPE97_ART = Object.freeze({
  animationTable: 0x278278, frames: 4,
  headingTable: 0x272c7a, headings: 32,
});

// Type $94's state cursor walks all sixteen eight-byte art/size entries.
export const TYPE94_ART = Object.freeze({ table: 0x27a3cc, frames: 16 });

// Type $96's record +$20 walks byte offsets 0..$78 in steps of eight. Each
// entry is one sprite pointer followed by the longword copied to sub +$14.
// The fixed death stream begins exactly one `$684` stride after frame 15.
export const TYPE96_ART = Object.freeze({
  animationTable: 0x27a9ec, frames: 16, death: 0x2799f4,
});

// Type $8C's eight-frame body ring and two attachment-vector tables. Palette
// animation tables are consumed by the shared `$246410/$24683E` subsystem.
export const TYPE8C_ART = Object.freeze({
  animationTable: 0x27959e, frames: 8,
  attachmentTable: 0x2795be, attachments: 24,
  poseTable: 0x27961e, poses: 24,
  spawnPalette: 0x278bb4, deathPalette: 0x27972e,
});

// Stage-3 type $3E uses every longword in this 64-entry heading/mirror table.
// Heading selects the even entry and `$80390B` alternates the adjacent frame.
export const TYPE3E_ART = Object.freeze({ table: 0x265698, frames: 64 });

// Stage-3 type $36: one fixed hull and two 32-heading attachment families.
export const TYPE36_ART = Object.freeze({
  body: 0x178c8c, upperTable: 0x272cfa, lowerTable: 0x272dfa, headings: 32,
});

// Stage-3 type $37 selects one of four animation phases for each of its 32
// even headings. The 128th pointer ends exactly where the packed muzzle-vector
// table begins.
export const TYPE37_ART = Object.freeze({
  body: 0x2a60f8, table: 0x264986, frames: 128,
});

export const TYPE38_FAMILY_ART = Object.freeze([
  0x2a63fc, 0x2a67c0, 0x2a6a94,
]);

export const TYPE3C_ART = Object.freeze({
  centre: 0x174040, left: 0x1741cc, right: 0x1742e8,
});

export const TYPE3B_ART = Object.freeze({
  hullTable: 0x2652d0, hullFrames: 16, satellite: 0x19271c,
});

function addPackedWords(pos, high, low) {
  return ((u16((pos >>> 16) + high) << 16) | u16((pos & 0xffff) + low)) >>> 0;
}

function fire95SideGuns(ram, rom, a5, a6, ctx) {
  const common = { d0: 0x00020007, d1: 0x20, d2: ram.u32(a6 + 0x02),
    d4: 0, d5: 0, a5 };
  const cb = { ram, rom, log: new WriteLog(ram) };
  const pair = (site, d3) => {
    const regs = { ...common, d3 };
    ctx.bulletSpawn?.(site, fireBullet(cb, 0x2813f0, regs));
  };
  if ((ram.u8(a6 + 0x01) & 0x40) === 0) {             // $277A8C btst #6
    pair(0x277aa0, 0xf200f940);                       // $277A94..$277AA0
    pair(0x277aac, 0xf2000700);                       // $277AA6..$277AAC
  } else {
    pair(0x277ac0, 0xf400fe00);                       // $277AB4..$277AC0
    pair(0x277acc, 0xf4000240);                       // $277AC6..$277ACC
  }
}

function fire95AimedPair(ram, rom, a5, a6, ctx) {
  const sel = targetSelect(ram, a5);                   // $277B7A..$277B98 inline
  if (sel.carry) return;                               // $277B94 bpl $277C34
  const barrel = ram.u8(a5 + 0x1e);
  const muzzle = rom.u16(0x277db8 + barrel * 2);       // $277BA8..$277BB4
  const selfY = u16(ram.u16(a6 + 0x02) + muzzle);
  const targetY = ram.u16(sel.addr + 0x02);
  const targetX = ram.u16(sel.addr + 0x04);
  const cb = { ram, rom, log: new WriteLog(ram) };
  for (const [firstSite, secondSite, shortOff] of [
    [0x277bde, 0x277bf2, 0x0700], [0x277c1a, 0x277c2e, 0xf900],
  ]) {
    const dir = aim256(aimTables(rom), selfY,
      u16(ram.u16(a6 + 0x04) + shortOff), targetY, targetX); // $2422A2
    const regs = { d0: 0x0002000b, d1: dir, d2: ram.u32(a6 + 0x02),
      d3: ((muzzle << 16) | shortOff) >>> 0, d4: 0, d5: 0, a5 };
    ctx.bulletSpawn?.(firstSite, fireBullet(cb, 0x2817b8, regs));
    // `$277BE4 swap/addq.w #3/swap` raises only D0's HIGH word.  The second
    // generator then biases the direction byte by barrel*2.
    regs.d0 = (regs.d0 + 0x00030000) >>> 0;
    regs.d1 = ((regs.d1 & ~0xff) | ((regs.d1 + ((barrel * 2) & 0xff)) & 0xff)) >>> 0;
    ctx.bulletSpawn?.(secondSite, fireBullet(cb, 0x281708, regs));
  }
}

function emit95(ram, rom, a5, a6) {
  enqueueThroughStub(ram, rom, 0x23d852, a6);           // $277CA6
  const pos = ram.u32(a6 + 0x02);
  enqueueRegistersThroughStub(ram, rom, 0x23df86,
    addPackedWords(pos, 0xfd00, 0xf700),               // $277CAC..$277CBA
    ram.u32(a5 + 0x24), 0x0648, ram.u16(a6 + 0x1c));  // $277CBC..$277CC8
  if (ram.u16(G.rank98) === 0 && ram.u16(G.mirror2) !== 0
      && !(ram.u16(G.stage) === 1 && ram.u16(G.clock) >= 0x16c)) {
    enqueueRegistersThroughStub(ram, rom, 0x23df58,
      addPackedWords(pos, 0xd800, 0x0200), TYPE95_ART.fixed, 0x0830, 0x18);
  }                                                    // $277CCE..$277D10
}

function death95(ram, rom, a5, a6, ctx, d1) {
  scoreKill(ram, rom, ctx, 0x55, d1);                  // $277D18/$277D1A
  ctx.soundPost?.(0x28c2dc);                           // $277D20
  const e0 = spawnEffect(ram, ctx, 0x0d, 0x277d28);   // $277D26/$277D28
  ram.setU32(e0 + B.pos, ram.u32(a6 + 0x02));
  ram.setU16(e0 + B.bucket, 0x10);
  ram.setU16(e0 + B.sub12, 1);
  ram.setU16(e0 + B.sub14, 0);
  ram.setU16(e0 + B.nudge, 0xf600);
  ram.setU16(e0 + B.nudge + 2, 0);
  if (!(ram.u16(G.stage) === 1 && ram.u16(G.clock) >= 0x150)) {
    let d0 = ram.u16(a6 + S.speed);
    d0 = (d0 & 0xff00) | (((d0 & 0xff) * 4) & 0xff);  // $277D66..$277D6E
    ram.setU16(e0 + B.speed, d0);
    const e1 = spawnEffect(ram, ctx, 0x84, 0x277d76); // $277D72/$277D76
    ram.setU32(e1 + B.pos, ram.u32(a6 + 0x02));
    ram.setU16(e1 + B.bucket, 0x10);
    ram.setU16(e1 + B.sub12, 1);
    ram.setU16(e1 + B.sub14, 0x0400);
    ram.setU16(e1 + B.nudge, 0x0400);
    ram.setU16(e1 + B.nudge + 2, 0);
    d0 = u16(ram.u16(a6 + S.speed) + 0x0800);
    d0 = (d0 & 0xff00) | (((d0 & 0xff) * 4) & 0xff);  // $277DA0..$277DAC
    ram.setU16(e1 + B.speed, d0);
  }
  freeEnemy(ram, a5);                                  // $277DB0
}

function handler95(ram, rom, a5, ctx) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, tables, u)) return;   // $2779B6

  // `$2779C0` and `$2779C4` are two WORD adds.  Only the second add's carry is
  // tested, after the first has already wrapped.
  const x = u16(ram.u16(a6 + 0x02) + 0x1000);
  if (x + 0x7000 <= 0xffff) ram.setU8(a5 + 0x16, 1); // $2779D8
  else if (ram.u8(a5 + 0x16) !== 0) { freeEnemy(ram, a5); return; }
  ram.setU32(a6 + 0x22, ram.u32(a6 + 0x02));           // $2779DE

  let d1 = (ram.u8(a6) | ram.u8(a6 + 0x20)) & 0x5c;
  let d0;
  if (d1 === 0) {
    d0 = ram.u8(a5 + 0x1a);                            // $2779F0
    if (ram.u16(a6 + S.hp) < 0x0240 && ram.u16(G.ca) === 0) d0 = 0x19;
  } else {
    ram.setU8(a6, ram.u8(a6) & 0xa3);                 // $277A08
    ram.setU8(a6 + 0x20, ram.u8(a6 + 0x20) & 0xa3);
    scoreHit(ram, ctx, a6, d1);                        // $277A12
    d0 = ram.u8(a6 + S.palette);
    if (d0 === 0x19) d0 = ram.u8(a5 + 0x1a);
    d0 ^= ram.u8(a5 + 0x1b);
    let hp = ram.u16(a6 + S.hp);
    if (i16(hp) > i16(ram.u16(a6 + S.f38))) hp = ram.u16(a6 + S.f38);
    ram.setU16(a6 + S.hp, hp);
    ram.setU16(a6 + S.f38, hp);
    if (i16(hp) < 0) { death95(ram, rom, a5, a6, ctx, d1); return; }
  }
  ram.setU8(a6 + S.palette, d0);                       // $277A4A

  if (ram.u32(G.freeze) === 0) {
    if ((ram.u16(G.rank98) !== 0 || ram.u16(G.stage) >= 3)
        && i16(ram.u16(a6 + 0x02)) >= 0x1000) {
      const c = ram.u8(a5 + 0x2a);
      ram.setU8(a5 + 0x2a, (c - 1) & 0xff);
      if (c === 0) {
        ram.setU8(a5 + 0x2a, ram.u8(a5 + 0x2e));
        fire95SideGuns(ram, rom, a5, a6, ctx);         // $277A7E..$277ACC
        const flip = ram.u8(a5 + 0x2c);
        ram.setU8(a5 + 0x2c, (flip - 1) & 0xff);
        if (flip === 0) {
          ram.setU8(a5 + 0x2c, ram.u8(a5 + 0x2d));
          ram.bchg8(a6 + 0x01, 6);
          const reload = u16(0x28 - ram.u16(G.ba)) & 0xff;
          ram.setU8(a5 + 0x2a, reload);
          ram.setU8(a5 + 0x2b, reload);
        }
      }
    }

    if (i16(ram.u16(a6 + 0x02)) >= 0x1000 && ram.u8(a5 + 0x16) !== 0) {
      const state = ram.u16(a5 + 0x18);
      if (state === 0) {
        const c = ram.u8(a5 + 0x1c);
        ram.setU8(a5 + 0x1c, (c - 1) & 0xff);
        if (c === 0) {
          ram.setU8(a5 + 0x1c, u16(0x10 - ram.u16(G.bc)) & 0xff);
          ram.setU16(a5 + 0x18, 1);
        }
      } else if (state === 1) {
        const c = ram.u8(a5 + 0x22);
        ram.setU8(a5 + 0x22, (c - 1) & 0xff);
        if (c === 0) {
          ram.setU8(a5 + 0x22, ram.u8(a5 + 0x23));
          const cur = u16(ram.u16(a5 + 0x20) + 4);
          ram.setU16(a5 + 0x20, cur);
          if (cur === 0x1c) ram.setU16(a5 + 0x18, 2);
          ram.setU32(a5 + 0x24, rom.u32(TYPE95_ART.table + cur));
        }
      } else if (state === 2) {
        const c = ram.u8(a5 + 0x1c);
        ram.setU8(a5 + 0x1c, (c - 1) & 0xff);
        if (c === 0) {
          ram.setU8(a5 + 0x1c, ram.u8(a5 + 0x2f));
          fire95AimedPair(ram, rom, a5, a6, ctx);
          const barrel = ram.u8(a5 + 0x1e);
          ram.setU8(a5 + 0x1e, (barrel - 1) & 0xff);
          if (barrel === 0) {
            ram.setU8(a5 + 0x1e, ram.u8(a5 + 0x1f));
            ram.setU8(a5 + 0x1c, u16(0x10 - ram.u16(G.bc)) & 0xff);
            ram.setU16(a5 + 0x18, 3);
          }
        }
      } else if (ram.u8(a5 + 0x1c) !== 0) {
        ram.setU8(a5 + 0x1c, (ram.u8(a5 + 0x1c) - 1) & 0xff);
      } else {
        const c = ram.u8(a5 + 0x22);
        ram.setU8(a5 + 0x22, (c - 1) & 0xff);
        if (c === 0) {
          ram.setU8(a5 + 0x22, ram.u8(a5 + 0x23));
          const cur = u16(ram.u16(a5 + 0x20) - 4);
          ram.setU16(a5 + 0x20, cur);
          if (cur === 0) {
            let reload = ram.u16(G.stage) === 4 ? 0x40 : 0x30;
            reload = u16(reload - ram.u16(G.b8));
            ram.setU8(a5 + 0x1c, reload & 0xff);
            ram.setU16(a5 + 0x18, 0);
          }
          ram.setU32(a5 + 0x24, rom.u32(TYPE95_ART.table + cur));
        }
      }
    }
  }
  emit95(ram, rom, a5, a6);                            // $277CA6..$277D16
}

// ############################################################################
// # W171: TYPE $8D, BOBBING AIMED-FIRING ENEMY                              #
// ############################################################################

function emit8d(ram, rom, a5, a6, special) {
  const idx = u16(ram.u16(a6 + S.anim) * 4);          // $276ABC/$276BC6
  const recordStub = rom.u32(EMIT_TABLE.dispatch27829C + idx);
  const registerStub = rom.u32(EMIT_TABLE.dispatch2782E4 + idx);
  enqueueThroughStub(ram, rom, recordStub, a6);        // $276ACE/$276BD8
  const pos = ram.u32(a6 + 0x02);
  const bob = ram.u16(a5 + 0x2c);
  enqueueRegistersThroughStub(ram, rom, registerStub,
    addPackedWords(pos, u16(0xfc00 + bob), 0xfb00),
    ram.u32(a5 + 0x20), 0x0428, 0x0d);                 // $276AD0..$276B02
  if (!special || ram.u16(G.mirror2) === 0) return;
  const artIndex = (ram.u16(0x80390a) & 6) << 1;
  enqueueRegistersThroughStub(ram, rom, registerStub,
    addPackedWords(pos, u16(0x0100 + bob), 0xfe00),
    rom.u32(0x278338 + artIndex), 0x0410, 0x1e);       // $276B04..$276B4E
}

function effect8d(ram, rom, a6, ctx, kind, site, second) {
  const e = spawnEffect(ram, ctx, kind, site);
  ram.setU32(e + B.pos, ram.u32(a6 + 0x02));
  ram.setU16(e + B.bucket,
    remapBucket(rom, REMAP.shared278320, u16(ram.u16(a6 + S.anim) * 2), site));
  ram.setU16(e + B.sub12, 1);
  ram.setU16(e + B.sub14, 0);
  ram.setU32(e + B.nudge, second ? 0xfc000000 : 0);
  ram.setU16(e + B.hook, second ? 1 : 2);
  return e;
}

function death8d(ram, rom, a5, a6, ctx, d1) {
  if (!ram.bset8(a6 + 0x01, 7)) {                     // $276C96 bset / bne
    scoreKill(ram, rom, ctx, 0x11, d1);               // $276C9E
    effect8d(ram, rom, a6, ctx, 0x0b, 0x276ca8, false);
    ram.bclr8(a6, 1);                                 // $276CE4
    ram.setU32(a6 + S.sprite0a, TYPE8D_ART.death);    // $276CE8
    ram.setU16(a6 + S.hp, 0x0140);                    // $276CF0
    emit8d(ram, rom, a5, a6, true);                   // $276CF6 -> $276ABC
    return;
  }
  ctx.soundPost?.(0x28c25a);                          // $276CFA
  scoreKill(ram, rom, ctx, 0x08, d1);                 // $276D00/$276D02
  effect8d(ram, rom, a6, ctx, 0x0c, 0x276d0c, true);
  freeEnemy(ram, a5);                                 // $276D48
}

function fire8d(ram, rom, a5, a6, ctx) {
  let reload = 8 - (ram.u16(G.bc) >>> 2);             // $276C26..$276C34
  ram.setU8(a5 + 0x1a, reload);
  if (playerDist268018(ram, rom, a6).carry) return;    // $276C38
  const heading = ram.u16(a5 + 0x24);
  const delta = rom.u32(0x276de8 + ((heading & 0x3e) << 1));
  const entry = ram.u8(a5 + 0x1c) === 2 ? 0x281420 : 0x2813f0;
  const site = entry === 0x281420 ? 0x276c68 : 0x276c72;
  const cb = { ram, rom, log: new WriteLog(ram) };
  const regs = { d0: 0x0c, d1: heading, d2: ram.u32(a6 + 0x02),
    d3: delta, d4: a6, d5: 0, a5 };
  ctx.bulletSpawn?.(site, fireBullet(cb, entry, regs));
  const salvo = ram.u8(a5 + 0x1c);
  ram.setU8(a5 + 0x1c, salvo - 1);                    // $276C78
  if (salvo !== 0) return;
  ram.setU8(a5 + 0x1c, ram.u8(a5 + 0x1d));
  reload = 0x50 - ram.u16(G.b4) + 4;
  ram.setU8(a5 + 0x1a, reload);                       // $276C7E..$276C90
}

function handler8D(ram, rom, a5, ctx) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, tables, u)) return;  // $276A02
  if (!onScreen242684(ram, a6)) ram.setU8(a5 + 0x16, 1);
  else if (ram.u8(a5 + 0x16) !== 0) { freeEnemy(ram, a5); return; }

  const d1 = ram.u8(a6) & 0x5c;
  let pal;
  if (d1 === 0) {
    pal = ram.u8(a5 + 0x18);
    if (ram.u16(a6 + S.hp) < 0x50 && ram.u16(G.ca) === 0) pal = 0x19;
  } else {
    ram.setU8(a6, ram.u8(a6) & 0xa3);                 // $276A42
    scoreHit(ram, ctx, a6, d1);                       // $276A46
    pal = ram.u8(a6 + S.palette);
    if (pal === 0x19) pal = ram.u8(a5 + 0x18);
    pal ^= ram.u8(a5 + 0x19);
    if (i16(ram.u16(a6 + S.hp)) < 0) { death8d(ram, rom, a5, a6, ctx, d1); return; }
  }
  ram.setU8(a6 + S.palette, pal);                      // $276A68

  const animTimer = ram.u8(a5 + 0x26);
  ram.setU8(a5 + 0x26, animTimer - 1);
  if (animTimer === 0) {
    ram.setU8(a5 + 0x26, ram.u8(a5 + 0x27));
    const cursor = ram.u16(a5 + 0x28);
    ram.setU32(a5 + 0x20, rom.u32(TYPE8D_ART.animationTable + cursor));
    ram.setU16(a5 + 0x28, cursor === 0 ? 0x14 : cursor - 4);
  }
  const phase = ram.u16(a5 + 0x2a);
  const bob = rom.u16(0x276e68 + u16(phase * 2));
  ram.setU16(a5 + 0x2c, bob);
  ram.setU16(a6 + 0x06, u16(bob + 0xf800));
  ram.setU8(a5 + 0x2b, ram.u8(a5 + 0x2b) + 3);        // $276A94..$276AB0

  if ((ram.u8(a6 + 0x01) & 0x80) !== 0) { emit8d(ram, rom, a5, a6, true); return; }
  if (ram.u32(G.freeze) === 0) {
    const aimTimer = ram.u8(a5 + 0x1e);
    ram.setU8(a5 + 0x1e, aimTimer - 1);
    if (aimTimer === 0) {
      ram.setU8(a5 + 0x1e, ram.u8(a5 + 0x1f));
      if (ram.u8(a5 + 0x1c) === ram.u8(a5 + 0x1d)) {
        const aimed = aim64AtTarget(aimTables(rom), ram, a5, a6);
        if (!aimed.carry) {
          const heading = slew64(ram.u16(a5 + 0x24), aimed.dir);
          ram.setU16(a5 + 0x24, heading);
          ram.setU32(a6 + S.sprite0a,
            rom.u32(TYPE8D_ART.headingTable + ((heading & 0x3e) << 1)));
        }
      }
    }
  }
  emit8d(ram, rom, a5, a6, false);                    // $276BC6..$276C0C
  if (ram.u32(G.freeze) !== 0 || i16(ram.u16(a6 + 0x02)) < 0x1000) return;
  const fireTimer = ram.u8(a5 + 0x1a);
  ram.setU8(a5 + 0x1a, fireTimer - 1);
  if (fireTimer === 0) fire8d(ram, rom, a5, a6, ctx); // $276C16..$276C94
}

// ############################################################################
// # W172: TYPE $8F, 32-HEADING AIMED-FIRING ENEMY                            #
// ############################################################################

/** Both live draw sites index the cartridge's record-convention table at
 * `$27829C` by the sub-record animation word. The prototype supplies index 0,
 * but resolving on every call preserves mutations and any future writer. */
function emit8f(ram, rom, a6) {
  const idx = u16(ram.u16(a6 + S.anim) * 4);           // $27763C/$2776B6
  const stub = rom.u32(EMIT_TABLE.dispatch27829C + idx);
  enqueueThroughStub(ram, rom, stub, a6);              // $27764E/$2776C8
}

function fire8f(ram, rom, a5, a6, ctx) {
  const heading = ram.u16(a5 + 0x20);                  // $27770A
  const delta = rom.u32(0x27327a + ((heading & 0x3e) << 1));
  const cb = { ram, rom, log: new WriteLog(ram) };
  const regs = {
    d0: 0xffff000d, d1: (heading + 2) & 0x3c,
    d2: ram.u32(a6 + 0x02), d3: delta, d4: a6, d5: 0, a5,
  };
  ctx.bulletSpawn?.(0x27772c, fireBullet(cb, 0x2813f0, regs));

  const salvo = ram.u8(a5 + R.rec1C);                  // $277732
  ram.setU8(a5 + R.rec1C, salvo - 1);
  if (salvo !== 0) return;
  ram.setU8(a5 + R.rec1C, ram.u8(a5 + R.rec1D));       // $277738
  ram.setU8(a5 + 0x1a, 0x40 - ram.u16(G.b6) + 4);     // $27773E..$27774A
}

function effect8f(ram, rom, a6, ctx, kind, row, site, second) {
  const e = spawnEffect(ram, ctx, kind, site);
  ram.setU32(e + B.pos, ram.u32(a6 + 0x02));
  const off = u16(ram.u16(a6 + S.anim) * 2);
  ram.setU16(e + B.bucket, remapBucket(rom, row, off, site));
  ram.setU16(e + B.sub12, 1);
  ram.setU16(e + B.sub14, 0);
  ram.setU16(e + B.nudge, second ? 0xfc00 : 0xfe00);
  ram.setU16(e + B.nudge + 2, 0xfe00);
  ram.setU16(e + B.hook, 1);
  return e;
}

function death8f(ram, rom, a5, a6, ctx, d1) {
  if (!ram.bset8(a6 + 0x01, 7)) {                     // $277750 bset / bne
    scoreKill(ram, rom, ctx, 0x08, d1);               // $277758/$27775A
    effect8f(ram, rom, a6, ctx, 0x84, 0x27832c, 0x277764, false);
    ram.bclr8(a6, 1);                                 // $2777A0
    ram.setU32(a6 + S.sprite0a, TYPE8F_ART.death);    // $2777A4
    ram.setU16(a6 + S.hp, 0x0300);                    // $2777AC
    emit8f(ram, rom, a6);                             // $2777B2 -> $2776B6
    return;
  }

  ctx.soundPost?.(0x28c25a);                          // $2777B6
  scoreKill(ram, rom, ctx, 0x08, d1);                 // $2777BC/$2777BE
  // These two allocators are distinct, still-unported shared subsystems. Keep
  // both calls loud and preserve their exact D-register inputs. `$27F8EE`
  // targets general pool-A kind 2, not the bee-only reserved-ten allocator.
  noteEffect(ctx.unported, 0x289af4, a5,
    `D0=$8 secondary, D1=$${rom.u16(0x278314 + ram.u16(a6 + S.anim) * 2).toString(16)}`);
  ctx.unported?.note(0x27f8ee, `$27F8EE type $8F second death `
    + `(D0=$8, D2=$${ram.u16(a6 + S.anim).toString(16)}) rec $${a5.toString(16)}`);
  effect8f(ram, rom, a6, ctx, 0x0c, REMAP.shared278320, 0x2777ea, true);
  freeEnemy(ram, a5);                                 // $277826
}

function handler8F(ram, rom, a5, ctx) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, tables, u)) return;  // $2775CC
  if (!onScreen242684(ram, a6)) ram.setU8(a5 + 0x16, 1);
  else if (ram.u8(a5 + 0x16) !== 0) { freeEnemy(ram, a5); return; }

  const d1 = ram.u8(a6) & 0x5c;
  let pal;
  if (d1 === 0) {
    pal = ram.u8(a5 + 0x18);
    if (ram.u16(a6 + S.hp) < 0x00c0 && ram.u16(G.ca) === 0) pal = 0x19;
  } else {
    ram.setU8(a6, ram.u8(a6) & 0xa3);                 // $27760C
    scoreHit(ram, ctx, a6, d1);                       // $277610
    pal = ram.u8(a6 + S.palette);
    if (pal === 0x19) pal = ram.u8(a5 + 0x18);
    pal ^= ram.u8(a5 + 0x19);
    if (i16(ram.u16(a6 + S.hp)) < 0) { death8f(ram, rom, a5, a6, ctx, d1); return; }
  }
  ram.setU8(a6 + S.palette, pal);                      // $277632

  if ((ram.u8(a6 + 0x01) & 0x80) !== 0) { emit8f(ram, rom, a6); return; }
  if (ram.u32(G.freeze) === 0) {
    const timer = ram.u8(a5 + R.rec1E);
    ram.setU8(a5 + R.rec1E, timer - 1);               // $27765A
    if (timer === 0) {
      ram.setU8(a5 + R.rec1E, ram.u8(a5 + 0x1f));
      const sel = targetSelect(ram, a5);               // $277666..$277684 inline
      if (!sel.carry) {
        const dir = aim64(aimTables(rom), ram.u16(a6 + 0x02), ram.u16(a6 + 0x04),
          ram.u16(sel.addr + 0x02), ram.u16(sel.addr + 0x04));
        const heading = slew64(ram.u16(a5 + 0x20), dir);
        ram.setU16(a5 + 0x20, heading);
        ram.setU32(a6 + S.sprite0a,
          rom.u32(TYPE8F_ART.headingTable + ((heading & 0x3e) << 1)));
      }
    }
  }

  emit8f(ram, rom, a6);                               // $2776B6
  if (ram.u32(G.freeze) !== 0 || i16(ram.u16(a6 + 0x02)) < 0x1000) return;
  const fireTimer = ram.u8(a5 + 0x1a);
  ram.setU8(a5 + 0x1a, fireTimer - 1);                // $2776DA
  if (fireTimer !== 0) return;
  ram.setU8(a5 + 0x1a, ram.u8(a5 + 0x17));            // $2776E2
  if (playerDist268018(ram, rom, a6).carry) return;
  if (ram.u16(G.stage) === 3 && ram.u16(G.clock) < 0x2e) return;
  fire8f(ram, rom, a5, a6, ctx);                      // $277704..$27774E
}

// ############################################################################
// # W173: TYPE $84, TWO-PART PHASED GUNSHIP                                  #
// ############################################################################

function emit84(ram, rom, a5, a6) {
  const pos = ram.u32(a6 + 0x02);
  enqueueRegistersThroughStub(ram, rom, 0x23dece,
    addPackedWords(pos, 0xee00, 0xf800), ram.u32(a6 + 0x2a),
    0x0440, ram.u16(a6 + 0x1c));
  enqueueThroughStub(ram, rom, 0x23d762, a6);
  enqueueRegistersThroughStub(ram, rom, 0x23dece,
    addPackedWords(pos, ram.u16(a6 + 0x2e), 0xf900), TYPE84_ART.fixedA,
    0x1438, ram.u16(a6 + 0x1c));
  enqueueRegistersThroughStub(ram, rom, 0x23dece,
    addPackedWords(pos, 0x0600, u16(ram.u16(a5 + 0x26) + ram.u16(a5 + 0x24))),
    TYPE84_ART.fixedC, 0x0810, ram.u16(a6 + 0x1c));
  enqueueRegistersThroughStub(ram, rom, 0x23dece,
    addPackedWords(pos, 0x0600, u16(ram.u16(a5 + 0x28) - ram.u16(a5 + 0x24))),
    TYPE84_ART.fixedB, 0x0810, ram.u16(a6 + 0x1c));
}

function fire84(ram, rom, a5, a6, ctx) {
  const sel = targetSelect(ram, a5);
  if (sel.carry) return;
  const upper = (ram.u8(a6 + 0x01) & 0x40) === 0;
  let d1 = aim256(aimTables(rom), u16(ram.u16(a6 + 0x02) + 0x0e00),
    u16(ram.u16(a6 + 0x04) + (upper ? 0x0400 : 0xfc00)),
    ram.u16(sel.addr + 0x02), ram.u16(sel.addr + 0x04));
  d1 = (d1 & 0xff00) | ((d1 + drawByte242B3C(ram, rom)) & 0xff);
  const muzzle = rom.u16(0x2757f0 + ram.u16(a5 + 0x2c));
  const regs = { d0: 0x00030013, d1, d2: ram.u32(a6 + 0x02),
    d3: ((muzzle << 16) | (upper ? 0x0400 : 0xfc00)) >>> 0,
    d4: 0, d5: 0, a5 };
  const cb = { ram, rom, log: new WriteLog(ram) };
  ctx.bulletSpawn?.(upper ? 0x2754c0 : 0x275512, fireBullet(cb, 0x281764, regs));
  regs.d1 = u16(regs.d1 - 0x10);
  if (drawSigned242FFC(ram, rom) !== 0) regs.d1 = u16(regs.d1 + 0x20);
  ctx.bulletSpawn?.(upper ? 0x2754d6 : 0x275528, fireBullet(cb, 0x2817b8, regs));
}

function death84(ram, rom, a5, a6, ctx, d1) {
  scoreKill(ram, rom, ctx, 0x162, d1);
  ctx.soundPost?.(0x28c2dc);
  noteEffect(ctx.unported, 0x289b22, a5, 'D0=$C, D2=$F8000000');
  noteEffect(ctx.unported, 0x289b22, a5, 'D0=$C, D2=$08000000');
  const vectors = Array.from({ length: 7 }, (_, i) => rom.u32(0x2757f6 + i * 4));
  ctx.unported?.note(0x27f8fa, `$27F8FA x7 type $84 death D0=$8, D1=[${vectors
    .map((x) => `$${x.toString(16).toUpperCase()}`).join(' ')}] rec $${a5.toString(16)}`);
  for (const [kind, site, sub14, nudge, speed] of [
    [0x85, 0x2756b6, 0x0400, 0x04000000, null],
    [0x0d, 0x2756e8, 0x0000, 0xfa00fe00, 0x03a0],
    [0x0d, 0x275720, 0x0400, 0xfa000200, 0x0360],
    [0x0c, 0x275758, 0x0000, 0xfa00fe00, null],
    [0x85, 0x27578c, 0x0400, 0xf6000000, 0x0780],
  ]) {
    const e = spawnEffect(ram, ctx, kind, site);
    ram.setU32(e + B.pos, ram.u32(a6 + 0x02));
    ram.setU16(e + B.bucket, 0x10);
    ram.setU16(e + B.sub12, 1);
    ram.setU16(e + B.sub14, sub14);
    ram.setU32(e + B.nudge, nudge >>> 0);
    if (speed !== null) ram.setU16(e + B.speed, speed);
    ram.setU16(e + B.hook, 1);
  }
  freeEnemy(ram, a5);
}

function handler84(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  const vec = { dy: 0, dx: 0 };
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported, vec)) return;
  if (ram.u16(a6 + 0x30) !== 0 && (ram.u8(a6) & 0x20) !== 0) {
    const secondary = ram.u16(a6 + 0x32) !== 0;
    const hit = a6 + (secondary ? 0x10 : 0x12);
    const delta = secondary ? -vec.dy : vec.dy;
    if (i16(ram.u16(hit)) < 0x1000) {
      const moved = u16(ram.u16(hit) + delta);
      ram.setU16(hit, moved);
      if (moved < 0x0800) ram.setU16(a6 + S.hp, 0x2d00);
    }
  }
  const x = u16(ram.u16(a6 + 0x02) + 0x1600);
  if (x + 0x7200 <= 0xffff) ram.setU8(a5 + 0x16, 1);
  else if (ram.u8(a5 + 0x16) !== 0) { freeEnemy(ram, a5); return; }

  const d1 = ram.u8(a6) & 0x5c;
  let pal;
  if (d1 === 0) {
    pal = ram.u8(a5 + 0x1c);
    if (ram.u16(a6 + S.hp) < 0x0b40 && ram.u16(G.ca) === 0) pal = 0x19;
  } else {
    ram.setU8(a6, ram.u8(a6) & 0xa3);
    scoreHit(ram, ctx, a6, d1);
    pal = ram.u8(a6 + S.palette);
    if (pal === 0x19) pal = ram.u8(a5 + 0x1c);
    pal ^= ram.u8(a5 + 0x1d);
    if (i16(ram.u16(a6 + S.hp)) < 0) { death84(ram, rom, a5, a6, ctx, d1); return; }
  }
  ram.setU8(a6 + S.palette, pal);
  spawnCues28AC72(ram, rom, a5, a6);

  if (ram.u32(G.freeze) === 0) {
    ram.setU16(a6 + 0x06, 0xf000);
    if (ram.u8(a6 + S.heading) < 0x40) {
      const timer = ram.u8(a6 + 0x26);
      ram.setU8(a6 + 0x26, timer - 1);
      if (timer === 0) {
        ram.setU8(a6 + 0x26, ram.u8(a6 + 0x27));
        ram.setU16(a6 + 0x06, 0xf040);
        let cursor = ram.u16(a6 + 0x28);
        if (ram.u8(a6 + S.heading) === 0) cursor = cursor < 4 ? 0x0c : cursor - 4;
        else cursor = cursor + 4 === 0x10 ? 0 : cursor + 4;
        ram.setU16(a6 + 0x28, cursor);
        ram.setU32(a6 + 0x2a, rom.u32(TYPE84_ART.animationTable + cursor));
      }
    }
  }
  if (ram.u32(G.freeze) === 0 && i16(ram.u16(a6 + 0x02)) >= 0x1000) {
    const state = ram.u16(a5 + 0x18);
    if (state === 0) {
      const c = ram.u8(a5 + 0x1e); ram.setU8(a5 + 0x1e, c - 1);
      if (c === 0) { ram.setU8(a5 + 0x1e, 8); ram.setU16(a5 + 0x18, 1); }
    } else if (state === 1) {
      const off = u16(ram.u16(a5 + 0x22) + 2); ram.setU16(a5 + 0x22, off);
      ram.setU16(a5 + 0x24, rom.u16(0x2757da + off));
      if (off === 0x14) { ram.setU16(a5 + 0x18, 2); ram.setU16(a5 + 0x22, 0x10); }
    } else if (state === 2) {
      ram.setU16(a5 + 0x26, 0x02c0); ram.setU16(a5 + 0x28, 0xf940);
      ram.setU16(a6 + 0x2e, 0xf000);
      const c = ram.u8(a5 + 0x1e); ram.setU8(a5 + 0x1e, c - 1);
      if (c === 0) {
        ram.setU8(a5 + 0x1e, u16(5 - (ram.u16(G.bc) >>> 3)));
        fire84(ram, rom, a5, a6, ctx);
        ram.setU16(a5 + 0x26, 0x0280); ram.setU16(a5 + 0x28, 0xf980);
        ram.setU16(a6 + 0x2e, 0xefc0);
        const muzzle = ram.u16(a5 + 0x2c);
        ram.setU16(a5 + 0x2c, muzzle < 2 ? 4 : muzzle - 2);
        const flip = ram.u8(a5 + 0x20); ram.setU8(a5 + 0x20, flip - 1);
        if (flip === 0) {
          ram.setU8(a5 + 0x20, ram.u8(a5 + 0x21));
          const old = ram.u8(a6 + 0x01) & 0x40;
          ram.bchg8(a6 + 0x01, 6);
          if (old !== 0) {
            ram.setU8(a5 + 0x1e, u16(0x40 - ram.u16(G.b6)));
            ram.setU16(a5 + 0x18, 3);
          }
        }
      }
    } else {
      const off = u16(ram.u16(a5 + 0x22) - 2); ram.setU16(a5 + 0x22, off);
      if (off === 0) ram.setU16(a5 + 0x18, 0);
      ram.setU16(a5 + 0x24, rom.u16(0x2757da + off));
    }
  }
  emit84(ram, rom, a5, a6);
}

// ############################################################################
// # W174: TYPE $90, ONE-PART DAMAGE-THRESHOLD ENEMY                          #
// ############################################################################

function emit90(ram, rom, a6) {
  enqueueThroughStub(ram, rom, 0x23d762, a6);          // $2799A6, bucket 0
}

function effect90(ram, rom, a6, ctx, kind, site, sub14, nudge, delay) {
  const e = spawnEffect(ram, ctx, kind, site);
  ram.setU32(e + B.pos, ram.u32(a6 + 0x02));
  const off = u16(ram.u16(a6 + S.anim) * 2);           // $2799D4/$279A18/$279A5E
  ram.setU16(e + B.bucket, remapBucket(rom, REMAP.shared278320, off, site));
  ram.setU16(e + B.sub12, 2);
  ram.setU16(e + B.sub14, sub14);
  ram.setU32(e + B.nudge, nudge >>> 0);
  ram.setU16(e + B.hook, 1);
  if (delay !== null) ram.setU16(e + B.delay, delay);
  return e;
}

function death90(ram, rom, a5, a6, ctx, d1) {
  ctx.soundPost?.(0x28c2dc);                           // $2799AE
  scoreKill(ram, rom, ctx, 0x32, d1);                 // $2799B4/$2799B6
  ram.setU16(a6, 0x8080);                             // $2799BC
  ram.setU8(a6 + S.palette, ram.u8(a5 + R.rec1A));    // $2799C0
  effect90(ram, rom, a6, ctx, 0x0d, 0x2799c8, 0x0000, 0xfa000600, 4);
  effect90(ram, rom, a6, ctx, 0x0d, 0x279a0c, 0x0400, 0xfa00fa00, 2);
  effect90(ram, rom, a6, ctx, 0x85, 0x279a52, 0x0000, 0xfe000000, null);
  emit90(ram, rom, a6);                               // $279A8E -> $2799A6
}

function handler90(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);

  // `$279898 tst.b ($1,A6) / bmi $279888`: after death, the handler enters a
  // byte countdown tail without stepping movement. `subq.b` draws while there
  // is no borrow and frees on the first borrow.
  if (i16((ram.u8(a6 + 0x01) << 8) & 0xffff) < 0) {
    const linger = ram.u8(a5 + 0x17);
    ram.setU8(a5 + 0x17, linger - 1);                  // $279888
    if (linger === 0) freeEnemy(ram, a5);             // $279890
    else emit90(ram, rom, a6);                        // $27988C -> $2799A6
    return;
  }
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported)) return; // $27989E

  const x = u16(ram.u16(a6 + 0x02) + 0x1000);         // two WORD adds
  if (x + 0x7000 <= 0xffff) ram.setU8(a5 + R.onScreen, 1); // $2798B0 bcc
  else if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; }

  // Record +$1C owns an HP transition gate. The position comparison and HP
  // clamp are unsigned except for the explicit `tst.w ... / bpl` death test.
  if (ram.u16(a5 + R.rec1C) !== 0) {
    if (ram.u16(a6 + 0x02) >= 0x3c00) {
      if (i16(ram.u16(a6 + S.hp)) < 0) {
        ram.setU16(a6 + S.hp, 0x7fff);
        ram.setU16(a5 + R.cooldown, 0x7eff);
        ram.setU16(a5 + R.rec1E, ram.u16(a5 + R.rec1E) + 1);
        ram.setU16(a5 + R.deathFlag, 1);
      }
    } else {
      ram.setU16(a5 + R.rec1C, 0);
      if (ram.u16(a5 + R.deathFlag) !== 0) {
        ram.setU16(a6 + S.hp, 0x0400);
        ram.setU16(a5 + R.cooldown, 0x0300);
      } else if (ram.u16(a6 + S.hp) >= 0x1000) {
        ram.setU16(a6 + S.hp, 0x1000);
        ram.setU16(a5 + R.cooldown, 0x0f00);
      }
    }
  }

  const d1 = ram.u8(a6) & 0x5c;
  let pal;
  if (d1 === 0) {
    pal = ram.u8(a5 + R.rec1A);
    if (ram.u16(a6 + S.hp) < 0x0400 && ram.u16(G.ca) === 0) pal = 0x19;
  } else {
    ram.setU8(a6, ram.u8(a6) & 0xa3);                 // $279944
    scoreHit(ram, ctx, a6, d1);                       // $279948
    pal = ram.u8(a6 + S.palette);
    if (pal === 0x19) pal = ram.u8(a5 + R.rec1A);
    pal ^= ram.u8(a5 + R.rec1B);
    const hp = ram.u16(a6 + S.hp);
    if (i16(hp) < 0) { death90(ram, rom, a5, a6, ctx, d1); return; }
    if (hp < ram.u16(a5 + R.cooldown)) {
      const count = ram.u16(a5 + R.rec1E);
      for (let n = 0; n <= count; n++) {               // $279996 dbra D6
        const index = drawByte2431F4(ram, rom);        // exact shared RNG side effect
        const d1fx = (0x08c00000 | rom.u16(0x279a92 + index * 2)) >>> 0;
        ctx.unported?.note(0x27f8fa, `$27F8FA type $90 damage particle `
          + `D0=$10, D1=$${d1fx.toString(16).toUpperCase()} rec $${a5.toString(16)}`);
      }
      ram.setU16(a5 + R.cooldown, ram.u16(a5 + R.cooldown) - 0x0100);
    }
  }
  ram.setU8(a6 + S.palette, pal);                      // $2799A2
  emit90(ram, rom, a6);
}

// ############################################################################
// # W175: TYPE $96, 16-FRAME OPENING FAN CARRIER                             #
// ############################################################################

function emit96(ram, rom, a6) {
  const idx = u16(ram.u16(a6 + S.anim) * 4);           // $27A532/$27A576
  const stub = rom.u32(EMIT_TABLE.dispatch27829C + idx);
  enqueueThroughStub(ram, rom, stub, a6);              // $27A544/$27A784
}

function fire96(ram, rom, a5, a6, ctx) {
  const sel = targetSelect(ram, a5);                    // $27A66A..$27A688 inline
  if (sel.carry) return;
  let d1 = aim256(aimTables(rom),
    u16(ram.u16(a6 + 0x02) + 0x0a00), ram.u16(a6 + 0x04),
    ram.u16(sel.addr + 0x02), ram.u16(sel.addr + 0x04)); // $27A68A..$27A69A
  const odd = (ram.u8(a5 + R.rec1E) & 1) !== 0;
  d1 = u16(d1 - (odd ? 0x32 : 0x3c));                  // $27A6BC/$27A6E0
  const count = odd ? 6 : 7;                           // DBRA #5/#6
  const d2 = ram.u32(a6 + 0x02);
  const d5 = 0x0a000000;
  const cb = { ram, rom, log: new WriteLog(ram) };
  for (let n = 0; n < count; n++) {
    const off = u16((d1 + 2) & 0xfc);
    const d3 = u32(rom.u32(0x2736fa + off) + d5);
    const site = odd ? 0x27a6d0 : 0x27a6f4;
    ctx.bulletSpawn?.(site, fireBullet(cb, 0x2817b8,
      { d0: 0x0b, d1, d2, d3, d4: 0, d5, a5 }));
    d1 = u16(d1 + 0x14);
  }
}

function effect96(ram, a6, ctx, spec) {
  const e = spawnEffect(ram, ctx, spec.kind, spec.site);
  ram.setU32(e + B.pos, ram.u32(a6 + 0x02));
  ram.setU16(e + B.bucket, 0x0c);
  ram.setU16(e + B.sub12, 0);
  ram.setU16(e + B.sub14, spec.sub14);
  ram.setU32(e + B.nudge, spec.nudge >>> 0);
  ram.setU16(e + B.hook, 1);
  if (spec.speed !== null) ram.setU16(e + B.speed, spec.speed);
  if (spec.f1c !== null) ram.setU8(e + B.f1c, spec.f1c);
  ram.setU16(e + B.delay, spec.delay);
}

function tail96(ram, rom, a5, a6, ctx) {
  if (ram.u16(a5 + R.rec28) !== 0) {                   // $27A4EE
    armScreenClear243E02(ram, ctx, ram.u16(a5 + R.rec2C),
      'type $96 death tail $27A4F8');
    ram.setU16(a5 + R.rec28, ram.u16(a5 + R.rec28) - 1);
  }
  if (ram.u16(a5 + R.rec2A) !== 0) {                   // $27A502
    const timer = u16(ram.u16(a5 + R.rec2A) - 1);
    ram.setU16(a5 + R.rec2A, timer);
    if (timer === 0) ram.setU32(a6 + S.sprite0a, TYPE96_ART.death);
  }
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported)) return;
  const x = u16(ram.u16(a6 + 0x02) + 0x1800);
  if (x + 0x6000 > 0xffff) { freeEnemy(ram, a5); return; } // $27A528 carry
  emit96(ram, rom, a6);
}

function death96(ram, rom, a5, a6, ctx, d1) {
  ram.setU16(a5 + R.rec2C, d1);                        // $27A788
  scoreKill(ram, rom, ctx, 0x256, d1);                // $27A78C/$27A792
  ctx.soundPost?.(0x28c2dc);                           // $27A798
  ram.setU16(a6, 0x8080);
  ram.setU8(a6 + S.palette, ram.u8(a5 + R.rec1A));
  for (const spec of [
    { kind: 0x85, site: 0x27a7ac, sub14: 0x0400, nudge: 0x00000000,
      speed: 0x0700, f1c: null, delay: 0x00 },
    { kind: 0x85, site: 0x27a7ec, sub14: 0x0400, nudge: 0xfc000800,
      speed: 0x0740, f1c: null, delay: 0x02 },
    { kind: 0x85, site: 0x27a82c, sub14: 0x0400, nudge: 0xf2000000,
      speed: 0x0880, f1c: null, delay: 0x04 },
    { kind: 0x85, site: 0x27a86c, sub14: 0x0400, nudge: 0xfc00f800,
      speed: 0x07c0, f1c: null, delay: 0x06 },
    { kind: 0x85, site: 0x27a8ac, sub14: 0x0000, nudge: 0x0600f600,
      speed: 0x04d0, f1c: 0x40, delay: 0x08 },
    { kind: 0x0d, site: 0x27a8f2, sub14: 0x0400, nudge: 0x02000600,
      speed: 0x0430, f1c: null, delay: 0x0a },
    { kind: 0x85, site: 0x27a932, sub14: 0x0000, nudge: 0xf0000a00,
      speed: 0x0450, f1c: null, delay: 0x0c },
    { kind: 0x0d, site: 0x27a972, sub14: 0x0400, nudge: 0xf000fa00,
      speed: 0x04b0, f1c: null, delay: 0x0e },
    { kind: 0x0d, site: 0x27a9b2, sub14: 0x0400, nudge: 0xf4000000,
      speed: null, f1c: null, delay: 0x10 },
  ]) effect96(ram, a6, ctx, spec);
  tail96(ram, rom, a5, a6, ctx);                       // $27A9E8 -> $27A4EE
}

function handler96(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  if ((ram.u8(a6 + 0x01) & 0x80) !== 0) { tail96(ram, rom, a5, a6, ctx); return; }
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported)) return;

  const x = u16(ram.u16(a6 + 0x02) + 0x1800);          // two WORD adds
  if (x + 0x6000 <= 0xffff) ram.setU8(a5 + R.onScreen, 1);
  else if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; }

  const gate = ram.u16(a5 + R.rec24);                  // $27A576
  if (i16(gate) >= 0) {
    ram.setU16(a6 + S.hp, 0x7fff);
    const dec = i16(ram.u16(0x811f72)) < 0 ? 2 : 1;
    ram.setU16(a5 + R.rec24, u16(gate - dec));
    if (gate < dec) ram.setU16(a6 + S.hp, 0x0600);
  }

  const d1 = ram.u8(a6) & 0x5c;
  let pal;
  if (d1 === 0) {
    pal = ram.u8(a5 + R.rec1A);
    if (ram.u16(a6 + S.hp) < 0x0180 && ram.u16(G.ca) === 0) pal = 0x19;
  } else {
    ram.setU8(a6, ram.u8(a6) & 0xa3);
    scoreHit(ram, ctx, a6, d1);
    pal = ram.u8(a6 + S.palette);
    if (pal === 0x19) pal = ram.u8(a5 + R.rec1A);
    pal ^= ram.u8(a5 + R.rec1B);
    if (i16(ram.u16(a6 + S.hp)) < 0) {
      death96(ram, rom, a5, a6, ctx, d1); return;
    }
  }
  ram.setU8(a6 + S.palette, pal);

  if (ram.u32(G.freeze) === 0) {
    const state = ram.u16(a5 + R.cooldown);
    if (state === 0) {
      if (i16(ram.u16(a6 + 0x02)) >= 0x1000) {
        const c = ram.u8(a5 + R.rec1C);
        ram.setU8(a5 + R.rec1C, c - 1);
        if (c === 0) {
          ram.setU8(a5 + R.rec1C, u16(0x18 - ram.u16(G.bc)) & 0xff);
          ram.setU16(a5 + R.cooldown, 1);
        }
      }
    } else if (state === 1) {
      const c = ram.u8(a5 + R.sprite22);
      ram.setU8(a5 + R.sprite22, c - 1);
      if (c === 0) {
        ram.setU8(a5 + R.sprite22, ram.u8(a5 + R.rec23));
        const frame = u16(ram.u16(a5 + R.deathFlag) + 8);
        ram.setU16(a5 + R.deathFlag, frame);
        if (frame === 0x78) ram.setU16(a5 + R.cooldown, 2);
        ram.setU32(a6 + S.sprite0a, rom.u32(TYPE96_ART.animationTable + frame));
        ram.setU32(a6 + S.f14, rom.u32(TYPE96_ART.animationTable + frame + 4));
      }
    } else if (state === 2) {
      const c = ram.u8(a5 + R.rec1C);
      ram.setU8(a5 + R.rec1C, c - 1);
      if (c === 0) {
        ram.setU8(a5 + R.rec1C, ram.u8(a5 + 0x17));
        if (i16(ram.u16(a6 + 0x02)) >= 0x1000) fire96(ram, rom, a5, a6, ctx);
        const salvo = ram.u8(a5 + R.rec1E);
        ram.setU8(a5 + R.rec1E, salvo - 1);
        if (salvo === 0) {
          ram.setU8(a5 + R.rec1E, ram.u8(a5 + 0x1f));
          ram.setU8(a5 + R.rec1C, u16(0x18 - ram.u16(G.bc)) & 0xff);
          ram.setU16(a5 + R.cooldown, 3);
        }
      }
    } else if (ram.u8(a5 + R.rec1C) !== 0) {
      ram.setU8(a5 + R.rec1C, ram.u8(a5 + R.rec1C) - 1);
    } else {
      const c = ram.u8(a5 + R.sprite22);
      ram.setU8(a5 + R.sprite22, c - 1);
      if (c === 0) {
        ram.setU8(a5 + R.sprite22, ram.u8(a5 + R.rec23));
        const frame = u16(ram.u16(a5 + R.deathFlag) - 8);
        ram.setU16(a5 + R.deathFlag, frame);
        if (frame !== 0) {
          ram.setU32(a6 + S.sprite0a, rom.u32(TYPE96_ART.animationTable + frame));
          ram.setU32(a6 + S.f14, rom.u32(TYPE96_ART.animationTable + frame + 4));
        } else {
          ram.bchg8(a5 + 0x03, 0);
          ram.setU8(a5 + R.rec1C, u16(0x20 - ram.u16(G.ba)) & 0xff);
          ram.setU16(a5 + R.cooldown, 0);
        }
      }
    }
  }
  emit96(ram, rom, a6);
}

// ############################################################################
// # W176: TYPE $8C, THREE-PART PALETTE-FADING CARRIER                       #
// ############################################################################

function merge8cFlags(ram, a6) {
  const merged = (ram.u16(a6) & 0xe7ff) | (ram.u16(a6 + 0x20) & 0xdffe);
  ram.setU16(a6 + 0x20, merged);                       // $278C1A..$278C2A
}

function turn256(current, target, steps) {
  current &= 0xff; target &= 0xff;
  for (let i = 0; i < steps && current !== target; i++) {
    const delta = (target - current) & 0xff;
    current = delta < 0x80 ? (current + 1) & 0xff : (current - 1) & 0xff;
  }
  return current;
}

function emit8c(ram, rom, a5, a6) {
  const late = ram.u16(G.clock) >= 0x011e;             // $278F80
  const recStub = late ? 0x23d852 : 0x23d762;
  const regStub = late ? 0x23df86 : 0x23dece;
  const mirrorStub = late ? 0x23df58 : 0x23dece;
  const pos = ram.u32(a6 + 0x02);
  enqueueThroughStub(ram, rom, recStub, a6);            // $278F9C
  enqueueRegistersThroughStub(ram, rom, regStub,
    addPackedWords(pos, 0xe400, 0xf200),
    rom.u32(TYPE8C_ART.attachmentTable + ram.u16(a6 + 0x2e)),
    0x1670, ram.u8(a6 + 0x47));                         // $278F9E..$278FC6
  enqueueRegistersThroughStub(ram, rom, regStub,
    addPackedWords(pos, 0x06c0, 0x0480), ram.u32(a5 + 0x28),
    0x0418, ram.u16(a6 + 0x1c));                       // $278FC8..$278FE4
  enqueueRegistersThroughStub(ram, rom, regStub,
    addPackedWords(pos, 0x06c0, 0xf580), ram.u32(a5 + 0x2e),
    0x0418, ram.u16(a6 + 0x1c));                       // $278FE6..$278FF2
  enqueueRegistersThroughStub(ram, rom, regStub,
    addPackedWords(pos, 0xf900, 0xee00), ram.u32(a6 + 0x2a),
    0x1290, ram.u8(a6 + 0x46));                        // $278FF4..$279012
  if (ram.u16(G.rank98) === 0 && ram.u16(G.mirror2) !== 0) {
    let attr = 0x18;
    if ((ram.u8(G.mirror) & 2) !== 0) attr |= 0x4000;
    enqueueRegistersThroughStub(ram, rom, mirrorStub,
      addPackedWords(pos, 0xd600, 0), 0x13770c, 0x0c48, attr); // $279014..$279050
  }
}

function fire8cOpening(ram, rom, a5, a6, ctx) {
  const sel = targetSelect(ram, a5);
  if (sel.carry) return;
  const baseAim = aim256(aimTables(rom), u16(ram.u16(a6 + 0x02) + 0xf800),
    ram.u16(a6 + 0x04), ram.u16(sel.addr + 0x02), ram.u16(sel.addr + 0x04));
  const d2 = ram.u32(a6 + 0x02);
  const cb = { ram, rom, log: new WriteLog(ram) };
  for (let d7 = 11, i = 0; d7 >= 0; d7--, i++) {
    // `$242B58` is the D1-returning twin of `$242B3C`: same shared counter,
    // same 256-byte table. `asl.b #3 / add.b D6,D1` keeps only the low byte.
    const d1 = (baseAim + ((drawByte242B3C(ram, rom) << 3) & 0xff)) & 0xff;
    const d5 = rom.u32(0x2796de + i * 4);
    const d3 = u32(rom.u32(0x26bffc + ((d1 + 2) & 0xfc)) + d5);
    const d0 = ((ram.u16(a5 + 0x3a) << 16) | 0x13) >>> 0;
    const entry = (d7 & 1) !== 0 ? 0x281764 : 0x2816f6;
    const site = (d7 & 1) !== 0 ? 0x278e60 : 0x278e6a;
    ctx.bulletSpawn?.(site, fireBullet(cb, entry,
      { d0, d1, d2, d3, d4: 0, d5, a5 }));
  }
}

function fire8cSidePair(ram, rom, a5, a6, ctx) {
  const cb = { ram, rom, log: new WriteLog(ram) };
  const pos = ram.u32(a6 + 0x02);
  const spread = u16(ram.u8(a5 + 0x24) * 2 + ram.u8(a5 + 0x3d));
  for (const [headingOff, shortOff, sign, site] of [
    [0x2c, 0x0780, -1, 0x2790ae], [0x32, 0xf880, 1, 0x2790e4],
  ]) {
    let d1 = ram.u16(a5 + headingOff);
    const idx = ((d1 + 4) & 0xf8) >>> 1;
    const d3 = addPackedWords(rom.u32(0x2731fa + idx), 0x0ac0, shortOff);
    const regs = { d0: 0x00180007, d1, d2: pos, d3, d4: a6, d5: 0, a5 };
    ctx.bulletSpawn?.(site, fireBullet(cb, 0x2817a8, regs));
    d1 = (d1 & 0xff00) | ((d1 + sign * spread) & 0xff);
    ctx.bulletSpawn?.(site + 0x12,
      fireBullet(cb, 0x281708, { ...regs, d1 }));
  }
}

function fire8cFan(ram, rom, a5, a6, ctx) {
  let d1;
  if ((ram.u8(a5 + 0x39) & 4) !== 0) d1 = drawWord242EC2(ram, rom);
  else {
    const sel = targetSelect(ram, a5);
    if (sel.carry) return;
    d1 = aim256(aimTables(rom), u16(ram.u16(a6 + 0x02) + 0xf940),
      ram.u16(a6 + 0x04), ram.u16(sel.addr + 0x02), ram.u16(sel.addr + 0x04));
  }
  const cursor = ram.u16(a5 + 0x38);
  const high = u16((ram.u16(a5 + 0x3e) - cursor) >>> 1);
  let d0 = ((high << 16) | 3) >>> 0;
  const d2 = ram.u32(a6 + 0x02);
  const d5 = rom.u32(0x27970e + cursor);
  const angleStep = rom.u16(0x27971e + cursor);
  const count = rom.u16(0x279720 + cursor);
  const cb = { ram, rom, log: new WriteLog(ram) };
  for (let d7 = count; d7 >= 0; d7--) {
    const d3 = u32(rom.u32(0x2736fa + ((d1 + 2) & 0xfc)) + d5);
    ctx.bulletSpawn?.(0x2791da, fireBullet(cb, 0x2817b8,
      { d0, d1, d2, d3, d4: 0, d5, a5 }));
    if ((d7 & 1) !== 0) {
      let alt = u32(d0 - 0x00060000);
      alt = ((alt & 0xffff0000) | u16(alt + 1)) >>> 0;
      ctx.bulletSpawn?.(0x2791f0, fireBullet(cb, 0x2816f6,
        { d0: alt, d1, d2, d3, d4: 0, d5, a5 }));
    }
    d1 = u16(d1 + angleStep);
  }
}

function update8cAttack(ram, rom, a5, a6, ctx) {
  if (ram.u32(G.freeze) !== 0 || i16(ram.u16(a6 + 0x02)) < 0x1000) return;
  const state = ram.u16(a5 + 0x18);
  if (state === 0) return;
  if (state === 1) {
    const timer = ram.u8(a5 + 0x22);
    ram.setU8(a5 + 0x22, timer - 1);
    if (timer !== 0) return;
    ram.setU8(a5 + 0x22, ram.u8(a5 + 0x35));
    fire8cSidePair(ram, rom, a5, a6, ctx);
    const salvo = ram.u8(a5 + 0x24);
    ram.setU8(a5 + 0x24, salvo - 1);
    if (salvo !== 0) return;
    ram.setU8(a5 + 0x25, ram.u8(a5 + 0x25) + 6);
    ram.setU8(a5 + 0x24, ram.u8(a5 + 0x25));
    ram.setU8(a5 + 0x22, ram.u8(a5 + 0x23));
    ram.bchg8(a5 + 0x03, 0);
    ram.setU16(a5 + 0x18, 2);
    ram.setU8(a5 + 0x3d, Math.max(5, ram.u8(a5 + 0x3d) - 2));
    return;
  }

  const timer = ram.u8(a5 + 0x36);
  ram.setU8(a5 + 0x36, timer - 1);
  if (timer !== 0) return;
  ram.setU8(a5 + 0x36, ram.u8(a5 + 0x3c));
  fire8cFan(ram, rom, a5, a6, ctx);
  const cursor = u16(ram.u16(a5 + 0x38) - 4);
  ram.setU16(a5 + 0x38, cursor);
  if ((cursor & 0x8000) === 0) return;
  ram.setU16(a5 + 0x3e, ram.u16(a5 + 0x3e) + 8);
  ram.setU16(a5 + 0x38, 0x0c);
  ram.setU8(a5 + 0x36, ram.u8(a5 + 0x37));
  ram.bchg8(a5 + 0x03, 0);
  ram.setU16(a5 + 0x18, 0);
}

function effect8c(ram, a6, ctx, spec) {
  const e = spawnEffect(ram, ctx, spec.kind, spec.site);
  ram.setU32(e + B.pos, ram.u32(a6 + 0x02));
  ram.setU16(e + B.bucket, 0x10);
  ram.setU16(e + B.sub12, 0);
  ram.setU16(e + B.sub14, spec.sub14);
  ram.setU32(e + B.nudge, spec.nudge >>> 0);
  if (spec.speed !== null) ram.setU16(e + B.speed, spec.speed);
  if (spec.f1c !== undefined) ram.setU8(e + B.f1c, spec.f1c);
  ram.setU16(e + B.delay, spec.delay);
}

function tail8c(ram, a5, a6, ctx) {
  if (ram.u16(a6 + 0x4c) === 0x30) ram.setU16(G.midbossD8, 0);
  armScreenClear(ram, ctx, ram.u16(a6 + 0x4e), 'type $8C death tail $278BF2');
  const left = u16(ram.u16(a6 + 0x4c) - 1);
  ram.setU16(a6 + 0x4c, left);
  if (left !== 0) return;
  ctx.soundPost?.(0x28c7c2);
  freeEnemy(ram, a5);
}

function death8c(ram, rom, a5, a6, ctx, d1) {
  ctx.soundPost?.(0x28c7c2);                           // stop looping engine
  ctx.soundPost?.(0x28c310);                           // death burst
  ram.setU16(a6 + 0x4e, d1);
  scoreKill(ram, rom, ctx, 0x457, d1);
  loadAnimObjects246410(ram, rom, TYPE8C_ART.deathPalette);
  ram.setU16(a6, 0x8080);
  ram.setU16(a6 + 0x20, 0x8080);
  for (const spec of [
    { kind: 0x0d, site: 0x27925a, nudge: 0x04000000, speed: null, sub14: 0x0400, delay: 0 },
    { kind: 0x84, site: 0x279282, nudge: 0x04000200, speed: 0x044c, sub14: 0x0000, delay: 1 },
    { kind: 0x84, site: 0x2792bc, nudge: 0x0400fe00, speed: 0x04b4, sub14: 0x0400, delay: 2, f1c: 0x40 },
    { kind: 0x0d, site: 0x2792fa, nudge: 0xfa00fe00, speed: 0x06a8, sub14: 0x0000, delay: 2 },
    { kind: 0x85, site: 0x279334, nudge: 0xfc000100, speed: 0x0858, sub14: 0x0000, delay: 4 },
    { kind: 0x85, site: 0x27936e, nudge: 0xf400fe00, speed: 0x0a88, sub14: 0x0400, delay: 6 },
    { kind: 0x0d, site: 0x2793a6, nudge: 0xf4000400, speed: 0x0a78, sub14: 0x0400, delay: 4 },
    { kind: 0x0d, site: 0x2793e0, nudge: 0x0000f200, speed: 0x04a0, sub14: 0x0400, delay: 8 },
    { kind: 0x0d, site: 0x27941a, nudge: 0x00000e00, speed: 0x0460, sub14: 0x0400, delay: 8 },
    { kind: 0x85, site: 0x279454, nudge: 0xea00f600, speed: 0x0a90, sub14: 0x0400, delay: 10 },
    { kind: 0x85, site: 0x27948e, nudge: 0xea000a00, speed: 0x0a70, sub14: 0x0400, delay: 10 },
    { kind: 0x85, site: 0x2794c8, nudge: 0xe4000200, speed: 0x0588, sub14: 0x0400, delay: 8 },
  ]) effect8c(ram, a6, ctx, spec);
  tail8c(ram, a5, a6, ctx);                            // $2794FE -> $278BE0
}

function handler8C(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  if ((ram.u8(a6 + 0x01) & 0x80) !== 0) { tail8c(ram, a5, a6, ctx); return; }
  const poseAtEntry = ram.u16(a6 + 0x2e);
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported)) return;
  const poseAfterMovement = ram.u16(a6 + 0x2e);
  if ((poseAfterMovement & 3) !== 0 || poseAfterMovement > 0x5c) {
    unreached(0x278c0e, `type $8C pose cursor left its 24-entry table before `
      + `handler logic: entry=$${poseAtEntry.toString(16).toUpperCase()} after `
      + `movement=$${poseAfterMovement.toString(16).toUpperCase()}`);
  }
  merge8cFlags(ram, a6);

  const pos = ram.u32(a6 + 0x02);
  const short = u16((pos & 0xffff) + 0x1a00 + ram.u16(G.scroll));
  let off = short + 0x9400 > 0xffff;
  if (!off) off = u16((pos >>> 16) + 0x0e00) + 0x7a00 > 0xffff;
  if (!off) ram.setU8(a5 + R.onScreen, 1);
  else if (ram.u8(a5 + R.onScreen) !== 0) {
    ram.setU16(G.midbossD8, 0); ctx.soundPost?.(0x28c7c2); freeEnemy(ram, a5); return;
  }

  if (ram.u8(a6 + S.anim) === 0) ram.setU32(a6 + 0x3c, 0x0000b000);
  ram.setU32(a6 + 0x22, pos);
  const d1 = (ram.u8(a6) | ram.u8(a6 + 0x20)) & 0x5c;
  let pal = ram.u8(a5 + 0x1c), pal2 = ram.u8(a6 + 0x48), pal3 = ram.u8(a6 + 0x4a);
  if (d1 === 0) {
    if (ram.u16(a6 + S.hp) < 0x2c00 && ram.u16(G.ca) === 0) pal = 0x19;
  } else {
    ram.setU8(a6, ram.u8(a6) & 0xa3);
    ram.setU8(a6 + 0x20, ram.u8(a6 + 0x20) & 0xa3);
    scoreHit(ram, ctx, a6, d1);
    pal = ram.u8(a6 + S.palette); pal2 = ram.u8(a6 + 0x46); pal3 = ram.u8(a6 + 0x47);
    if (pal === 0x19) { pal = ram.u8(a5 + 0x1c); pal2 = ram.u8(a6 + 0x48); pal3 = ram.u8(a6 + 0x4a); }
    pal ^= ram.u8(a5 + 0x1d); pal2 ^= ram.u8(a6 + 0x49); pal3 ^= ram.u8(a6 + 0x4b);
    const hp0 = ram.u16(a6 + S.hp), hp1 = ram.u16(a6 + 0x38);
    const lowest = i16(hp0) <= i16(hp1) ? hp0 : hp1;
    ram.setU16(a6 + S.hp, 0x7fff); ram.setU16(a6 + 0x38, 0x7fff);
    const damage = u16(0x7fff - lowest);
    const remaining = u32(ram.u32(a6 + 0x3c) - damage);
    ram.setU32(a6 + 0x3c, remaining);
    if ((remaining & 0x80000000) !== 0) { death8c(ram, rom, a5, a6, ctx, d1); return; }
  }
  ram.setU8(a6 + S.palette, pal); ram.setU8(a6 + 0x46, pal2); ram.setU8(a6 + 0x47, pal3);
  spawnCues28AC86(ram, rom, a5, ram.u32(a6 + 0x3c));

  const frameTimer = ram.u8(a6 + 0x26);
  ram.setU8(a6 + 0x26, frameTimer - 1);
  if (frameTimer === 0) {
    ram.setU8(a6 + 0x26, ram.u8(a6 + 0x27));
    let cursor = ram.u16(a6 + 0x28);
    ram.setU32(a6 + 0x2a, rom.u32(TYPE8C_ART.animationTable + cursor));
    cursor = u16(cursor - 4); if ((cursor & 0x8000) !== 0) cursor = 0x1c;
    ram.setU16(a6 + 0x28, cursor);
  }

  // `$278D66 tst.w ($18,A5) / bne $278EB8`: the pose transition machine is
  // dormant while the separate attack-state word is nonzero. The prototype
  // starts there, so omitting this gate underflowed pose cursor +$2E on the
  // spawn frame and indexed four bytes before the 24-pose table.
  if (ram.u32(G.freeze) === 0 && ram.u16(a5 + 0x18) === 0) {
    const state = ram.u16(a5 + 0x1a);
    if (state === 0) {
      // `$278D6E blt $278EB8` exits this state directly. It does not fall
      // through into state 3 merely because the carrier is still above Y=$1000.
      if (i16(ram.u16(a6 + 0x02)) >= 0x1000) {
        const c = ram.u8(a5 + 0x1e); ram.setU8(a5 + 0x1e, c - 1);
        if (c === 0) {
          ram.setU8(a5 + 0x1e, ram.u8(a5 + 0x34)); ram.setU16(a5 + 0x1a, 1);
        }
      }
    } else if (state === 1) {
      const c = ram.u8(a6 + 0x3a); ram.setU8(a6 + 0x3a, c - 1);
      if (c === 0) {
        ram.setU8(a6 + 0x3a, ram.u8(a6 + 0x3b));
        const cursor = u16(ram.u16(a6 + 0x2e) + 4); ram.setU16(a6 + 0x2e, cursor);
        if (cursor === 0x5c) ram.setU16(a5 + 0x1a, 2);
      }
    } else if (state === 2) {
      const c = ram.u8(a5 + 0x1e); ram.setU8(a5 + 0x1e, c - 1);
      if (c === 0) {
        ram.setU8(a5 + 0x1e, u16(0x10 - (ram.u16(G.bc) >>> 2)));
        fire8cOpening(ram, rom, a5, a6, ctx);
        ram.bchg8(a5 + 0x03, 0);
        const salvo = ram.u8(a5 + 0x20); ram.setU8(a5 + 0x20, salvo - 1);
        if (salvo === 0) {
          ram.setU8(a5 + 0x20, ram.u8(a5 + 0x21));
          ram.setU8(a5 + 0x1e, u16(0x50 - ram.u16(G.b4)));
          ram.setU16(a5 + 0x1a, 3);
        }
      }
    } else {
      const c = ram.u8(a6 + 0x3a); ram.setU8(a6 + 0x3a, c - 1);
      if (c === 0) {
        ram.setU8(a6 + 0x3a, ram.u8(a6 + 0x3b));
        const cursor = u16(ram.u16(a6 + 0x2e) - 4); ram.setU16(a6 + 0x2e, cursor);
        if (cursor === 0) { ram.setU16(a5 + 0x1a, 0); ram.setU16(a5 + 0x18, 1); }
      }
    }
  }

  const poseForDraw = ram.u16(a6 + 0x2e);
  if ((poseForDraw & 3) !== 0 || poseForDraw > 0x5c) {
    unreached(0x278eb8, `type $8C pose transition produced $$${poseForDraw
      .toString(16).toUpperCase()} from state $$${ram.u16(a5 + 0x1a)
      .toString(16).toUpperCase()} outer $$${ram.u16(a5 + 0x18)
      .toString(16).toUpperCase()}`);
  }

  const pose = TYPE8C_ART.poseTable + poseForDraw * 2;
  ram.setU32(a6 + 0x30, rom.u32(pose)); ram.setU32(a6 + 0x34, rom.u32(pose + 4));
  const sel = targetSelect(ram, a5);
  if (!sel.carry) {
    const steps = ram.u8(a5 + 0x24) === ram.u8(a5 + 0x25) ? 1 : 4;
    const upper = ram.bchg8(a6 + 0x01, 6) === 0;
    const dy = 0x0ac0, dx = upper ? 0x0780 : 0xf880;
    const aimed = aim256(aimTables(rom), u16(ram.u16(a6 + 0x02) + dy),
      u16(ram.u16(a6 + 0x04) + dx), ram.u16(sel.addr + 0x02), ram.u16(sel.addr + 0x04));
    const off = upper ? 0x2c : 0x32;
    const heading = turn256(ram.u16(a5 + off), aimed, steps); ram.setU16(a5 + off, heading);
    ram.setU32(a5 + (upper ? 0x28 : 0x2e),
      rom.u32(0x272d7a + (((heading + 4) & 0xf8) >>> 1)));
  }
  emit8c(ram, rom, a5, a6);
  update8cAttack(ram, rom, a5, a6, ctx);
}

// ############################################################################
// # W177: TYPE $91, COMPACT DAMAGE-THRESHOLD ENEMY                           #
// ############################################################################

function emit91(ram, rom, a6) {
  const idx = u16(ram.u16(a6 + S.anim) * 4);            // $279BA4..$279BAA
  const stub = rom.u32(EMIT_TABLE.dispatch27829C + idx);
  enqueueThroughStub(ram, rom, stub, a6);                // $279BB6 jsr (A0)
}

function effect91(ram, rom, a6, ctx, spec) {
  const e = effectArmShared278320(ram, rom, ctx, a6, 0x05, spec.site);
  ram.setU16(e + B.sub12, spec.sub12);
  ram.setU16(e + B.sub14, spec.sub14);
  ram.setU32(e + B.nudge, spec.nudge >>> 0);
  ram.setU16(e + B.hook, 1);
  if (spec.f1c !== undefined) ram.setU8(e + B.f1c, spec.f1c);
  ram.setU16(e + B.delay, spec.delay);
}

function tail91(ram, rom, a5, a6, ctx) {
  const linger = ram.u8(a5 + 0x17);
  ram.setU8(a5 + 0x17, linger - 1);                     // $279B08 subq.b #1
  if (linger !== 0) { emit91(ram, rom, a6); return; }   // $279B0C bcc $279BA4

  const vectors = Array.from({ length: 7 }, (_, i) => rom.u32(0x279cac + i * 4));
  ctx.unported?.note(0x27f8fa, `$27F8FA x7 type $91 death D0=$8, D1=[${vectors
    .map((x) => `$${x.toString(16).toUpperCase()}`).join(' ')}] rec $${a5.toString(16)}`);
  freeEnemy(ram, a5);                                   // $279B26 jmp $263762
}

function death91(ram, rom, a5, a6, ctx, d1) {
  ctx.soundPost?.(0x28c2dc);                            // $279BBA
  scoreKill(ram, rom, ctx, 0x13, d1);                  // $279BC0..$279BC2
  ram.setU16(a6, 0x8080);                              // $279BC8
  ram.setU8(a6 + S.palette, ram.u8(a5 + R.rec18));     // $279BCC
  for (const spec of [
    { site: 0x279bd2, sub12: 1, sub14: 0x0000, nudge: 0x0a000080, delay: 6 },
    { site: 0x279c16, sub12: 2, sub14: 0x0400, nudge: 0xfc00ff80, delay: 3, f1c: 0x40 },
    { site: 0x279c60, sub12: 1, sub14: 0x0000, nudge: 0xee000080, delay: 0 },
  ]) effect91(ram, rom, a6, ctx, spec);
  emit91(ram, rom, a6);                                 // $279CA4 -> $279BA4
}

function handler91(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported)) return; // $279B2E

  const x = u16(ram.u16(a6 + S.posX) + 0x1200);         // $279B34..$279B3C
  if (x + 0x6c00 <= 0xffff) ram.setU8(a5 + R.onScreen, 1);
  else if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; }

  if ((ram.u8(a6 + 0x01) & 0x80) !== 0) { tail91(ram, rom, a5, a6, ctx); return; }

  const d1 = ram.u8(a6) & 0x5c;
  let pal;
  if (d1 === 0) {
    pal = ram.u8(a5 + R.rec18);
    if (ram.u16(a6 + S.hp) < 0x0380 && ram.u16(G.ca) === 0) pal = 0x19;
  } else {
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // $279B7A
    scoreHit(ram, ctx, a6, d1);                        // $279B7E
    pal = ram.u8(a6 + S.palette);
    if (pal === 0x19) pal = ram.u8(a5 + R.rec18);
    pal ^= ram.u8(a5 + R.rec19);
    if (i16(ram.u16(a6 + S.hp)) < 0) { death91(ram, rom, a5, a6, ctx, d1); return; }
  }
  ram.setU8(a6 + S.palette, pal);                       // $279BA0
  emit91(ram, rom, a6);
}

// ############################################################################
// # W178: TYPE $92, MIRRORED DAMAGE-THRESHOLD ENEMY                          #
// ############################################################################

function emit92(ram, rom, a6) {
  const idx = u16(ram.u16(a6 + S.anim) * 4);            // $279DE8..$279DEE
  const stub = rom.u32(EMIT_TABLE.dispatch27829C + idx);
  enqueueThroughStub(ram, rom, stub, a6);                // $279DFA jsr (A0)
}

function effect92(ram, rom, a6, ctx, spec) {
  const e = effectArmShared278320(ram, rom, ctx, a6, spec.kind, spec.site);
  ram.setU16(e + B.sub12, 1);
  ram.setU16(e + B.sub14, spec.sub14);
  ram.setU32(e + B.nudge, spec.nudge >>> 0);
  ram.setU16(e + B.hook, 1);
  ram.setU16(e + B.delay, spec.delay);
}

function tail92(ram, rom, a5, a6, ctx) {
  const linger = ram.u8(a5 + 0x17);
  ram.setU8(a5 + 0x17, linger - 1);                     // $279D46 subq.b #1
  if (linger !== 0) { emit92(ram, rom, a6); return; }   // $279D4A bcc $279DE8

  let d1 = 0xff00fe00;
  if ((ram.u8(a6 + S.f1c) & 0x40) !== 0)
    d1 = ((d1 & 0xffff0000) | u16(-(d1 & 0xffff))) >>> 0; // $279D56..$279D5E
  const d2 = ram.u8(a6 + S.f1f);
  ctx.unported?.note(0x27f8f0, `$27F8F0 type $92 death D0=$C, D1=$${d1
    .toString(16).toUpperCase()}, D2=$${d2.toString(16).toUpperCase()} rec $${a5.toString(16)}`);
  freeEnemy(ram, a5);                                   // $279D6A jmp $263762
}

function death92(ram, rom, a5, a6, ctx, d1) {
  ctx.soundPost?.(0x28c2dc);                            // $279DFE
  scoreKill(ram, rom, ctx, 0x14, d1);                  // $279E04..$279E06
  ram.setU16(a6, 0x8080);                              // $279E0C
  ram.setU8(a6 + S.palette, ram.u8(a5 + R.rec18));     // $279E10
  for (const spec of [
    { kind: 0x0d, site: 0x279e16, sub14: 0x0400, nudge: 0x00000000, delay: 3 },
    { kind: 0x05, site: 0x279e5a, sub14: 0x0000, nudge: 0xf2000080, delay: 0 },
  ]) effect92(ram, rom, a6, ctx, spec);
  emit92(ram, rom, a6);                                 // $279E9E -> $279DE8
}

function handler92(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported)) return; // $279D72

  const x = u16(ram.u16(a6 + S.posX) + 0x1400);         // $279D78..$279D80
  if (x + 0x6800 <= 0xffff) ram.setU8(a5 + R.onScreen, 1);
  else if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; }

  if ((ram.u8(a6 + 0x01) & 0x80) !== 0) { tail92(ram, rom, a5, a6, ctx); return; }

  const d1 = ram.u8(a6) & 0x5c;
  let pal;
  if (d1 === 0) {
    pal = ram.u8(a5 + R.rec18);
    if (ram.u16(a6 + S.hp) < 0x0380 && ram.u16(G.ca) === 0) pal = 0x19;
  } else {
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // $279DBE
    scoreHit(ram, ctx, a6, d1);                        // $279DC2
    pal = ram.u8(a6 + S.palette);
    if (pal === 0x19) pal = ram.u8(a5 + R.rec18);
    pal ^= ram.u8(a5 + R.rec19);
    if (i16(ram.u16(a6 + S.hp)) < 0) { death92(ram, rom, a5, a6, ctx, d1); return; }
  }
  ram.setU8(a6 + S.palette, pal);                       // $279DE4
  emit92(ram, rom, a6);
}

// ############################################################################
// # W179: TYPE $97, ANIMATED AIMED-FIRING CARRIER                            #
// ############################################################################

function emit97(ram, rom, a5, a6) {
  const idx = u16(ram.u16(a6 + S.anim) * 4);           // $278094..$2780A6
  enqueueThroughStub(ram, rom,
    rom.u32(EMIT_TABLE.dispatch27829C + idx), a6);
  enqueueRegistersThroughStub(ram, rom,
    rom.u32(EMIT_TABLE.dispatch2782E4 + idx),
    addPackedWords(ram.u32(a6 + 0x02), 0xfe40,
      u16(ram.u16(a5 + 0x2e) + 0xfc00)),
    ram.u32(a5 + 0x24), 0x0620, ram.u8(a6 + S.palette));
}

function effect97(ram, rom, a6, ctx, kind, site, sub14, nudge) {
  const e = effectArmShared278320(ram, rom, ctx, a6, kind, site);
  if (ram.u16(G.stage) === 1) ram.setU16(e + B.bucket, 8);
  ram.setU16(e + B.sub12, 1);
  ram.setU16(e + B.sub14, sub14);
  ram.setU32(e + B.nudge, nudge >>> 0);
  ram.setU16(e + B.hook, 1);
}

function death97(ram, rom, a5, a6, ctx, d1) {
  ctx.soundPost?.(0x28c28e);                           // $27818E
  scoreKill(ram, rom, ctx, 0x88, d1);                 // $278194..$27819A
  const selector = ram.u16(a6 + S.anim);
  const burstBucket = rom.u16(0x278314 + selector * 2);
  noteEffect(ctx.unported, 0x289b22, a5,
    `D0=$C, D1=$${burstBucket.toString(16).toUpperCase()}, D2=$FE000000`);
  const vectors = Array.from({ length: 5 }, (_, i) => rom.u32(0x278288 + i * 4));
  ctx.unported?.note(0x27f8fa, `$27F8FA x5 type $97 death D0=$8, D1=[${vectors
    .map((v) => `$${v.toString(16).toUpperCase().padStart(8, '0')}`).join(',')}]
    rec $${a5.toString(16)}`);
  effect97(ram, rom, a6, ctx, 0x0d, 0x2781d6, 0x0400, 0xfc000000);
  effect97(ram, rom, a6, ctx, 0x08, 0x278224, 0x0000, 0xf6000000);
  freeEnemy(ram, a5);                                  // $278270
}

function fire97(ram, rom, a5, a6, ctx) {
  if (ram.u32(G.freeze) !== 0 || i16(ram.u16(a6 + S.posX)) < 0x1000) return;
  const cadence = ram.u8(a5 + 0x1e);
  ram.setU8(a5 + 0x1e, cadence - 1);                   // $2780EE
  if (cadence !== 0) return;
  ram.setU8(a5 + 0x1e, u16(3 - (ram.u16(G.bc) >>> 3)) & 0xff);

  const heading = ram.u16(a5 + 0x28);
  const delta = addPackedWords(
    rom.u32(0x272ffa + ((heading & 0x3e) << 1)),
    0x0440, ram.u16(a5 + 0x2e));
  const base = { d0: 0x0002000c, d2: ram.u32(a6 + 0x02), d3: delta,
    d4: a6, d5: 0, a5 };
  const cb = { ram, rom, log: new WriteLog(ram) };
  const fireAt = (site, d1) => ctx.bulletSpawn?.(site,
    fireBullet(cb, 0x281420, { ...base, d1: u16(d1) }));
  if ((ram.u8(a5 + 0x20) & 1) !== 0) {
    fireAt(0x278140, heading - 2);
    fireAt(0x278148, heading + 2);
  } else {
    fireAt(0x278150, heading);
  }

  const salvo = ram.u8(a5 + 0x20);
  ram.setU8(a5 + 0x20, salvo - 1);
  if (salvo === 0) {
    ram.setU8(a5 + 0x20, ram.u8(a5 + 0x21));
    ram.setU8(a5 + 0x1e, u16(0x12 - ram.u16(G.bc)) & 0xff);
    const volley = ram.u8(a5 + 0x2c);
    ram.setU8(a5 + 0x2c, volley - 1);
    if (volley === 0) {
      ram.setU8(a5 + 0x2c, ram.u8(a5 + 0x2d));
      ram.setU8(a5 + 0x1e, u16(0x70 - ram.u16(G.b6)) & 0xff);
    }
  }
}

function handler97(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  const vec = { dy: 0, dx: 0 };
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported, vec)) return;

  if (ram.u16(a5 + 0x30) !== 0 && (ram.u8(a6) & 0x20) !== 0) {
    const secondary = ram.u16(a5 + 0x32) !== 0;
    const off = secondary ? S.f14 : 0x16;
    const delta = secondary ? -vec.dx : vec.dx;
    if (i16(ram.u16(a6 + off)) < 0x0800)
      ram.setU16(a6 + off, u16(ram.u16(a6 + off) + delta));
  }

  const y = u16(ram.u16(a6 + S.posY) + 0x1000 + ram.u16(G.scroll));
  const x = u16(ram.u16(a6 + S.posX) + 0x0c00);
  const outside = y + 0xa800 > 0xffff || x + 0x7800 > 0xffff;
  if (!outside) ram.setU8(a5 + R.onScreen, 1);
  else if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; }

  const d1 = hitMask(ram, a6);
  let pal;
  if (d1 === 0) {
    pal = ram.u8(a5 + 0x1c);
    if (ram.u16(a6 + S.hp) < 0x02c0 && ram.u16(G.ca) === 0) pal = 0x19;
  } else {
    ram.setU8(a6, ram.u8(a6) & 0xa3);
    scoreHit(ram, ctx, a6, d1);                        // $277FA6
    pal = ram.u8(a6 + S.palette);
    if (pal === 0x19) pal = ram.u8(a5 + 0x1c);
    pal ^= ram.u8(a5 + 0x1d);
    if (i16(ram.u16(a6 + S.hp)) < 0) {
      death97(ram, rom, a5, a6, ctx, d1);
      return;
    }
  }
  ram.setU8(a6 + S.palette, pal);                      // $277FC8
  spawnCues28AC72(ram, rom, a5, a6);                  // $277FCC

  if (ram.u16(G.freeze) === 0) {                       // $277FD2 tst.w
    if (ram.u8(a6 + S.heading) < 0x40) {
      const tick = ram.u8(a5 + 0x34);
      ram.setU8(a5 + 0x34, tick - 1);
      if (tick === 0) {
        ram.setU8(a5 + 0x34, ram.u8(a6 + 0x35));
        let frame = ram.u16(a5 + 0x36);
        if (ram.u8(a6 + S.heading) === 0x10) {
          frame = u16(frame + 4);
          if (frame === 0x10) frame = 0;
        } else {
          frame = u16(frame - 4);
          if (frame > 0x000c) frame = 0x000c;
        }
        ram.setU16(a5 + 0x36, frame);
        ram.setU32(a6 + S.sprite0a, rom.u32(TYPE97_ART.animationTable + frame));
      }
    }

  }

  if (ram.u32(G.freeze) === 0) {                       // $278024 tst.l
    const aimTick = ram.u8(a5 + 0x22);
    ram.setU8(a5 + 0x22, aimTick - 1);
    if (aimTick === 0) {
      ram.setU8(a5 + 0x22, ram.u8(a5 + 0x23));
      const aimed = aim64FromCaller(aimTables(rom), ram, a5,
        u16(ram.u16(a6 + S.posX) + 0x0440),
        u16(ram.u16(a6 + S.posY) + ram.u16(a5 + 0x2e)));
      if (!aimed.carry) {
        const heading = slew64(ram.u16(a5 + 0x28), aimed.dir);
        ram.setU16(a5 + 0x28, heading);
        ram.setU32(a5 + 0x24,
          rom.u32(TYPE97_ART.headingTable + ((heading & 0x3e) << 1)));
      }
    }
  }

  emit97(ram, rom, a5, a6);
  fire97(ram, rom, a5, a6, ctx);
}

// ############################################################################
// # W180: TYPE $94, MIRRORED EXTENDING AIMED SHOOTER                         #
// ############################################################################

function update94(ram, rom, a5, a6) {
  const frame = ram.u16(a5 + 0x20);
  ram.setU32(a6 + S.sprite0a, rom.u32(TYPE94_ART.table + frame));
  ram.setU16(ram.u32(a5 + 0x24), rom.u16(TYPE94_ART.table + frame + 4));
}

function emit94(ram, rom, a6) {
  const idx = u16(ram.u16(a6 + S.anim) * 4);           // $27A356..$27A368
  enqueueThroughStub(ram, rom,
    rom.u32(EMIT_TABLE.dispatch27829C + idx), a6);
}

function death94(ram, rom, a5, a6, ctx, d1) {
  ctx.soundPost?.(0x28c2c2);                           // $27A36C
  scoreKill(ram, rom, ctx, 0x34, d1);                 // $27A372..$27A374
  ctx.unported?.note(0x27f8ee, `$27F8EE type $94 death D0=$8, D2=$${ram
    .u16(a6 + S.anim).toString(16).toUpperCase()} rec $${a5.toString(16)}`);
  const e = effectArmShared278320(ram, rom, ctx, a6, 0x0c, 0x27a388);
  ram.setU16(e + B.sub12, 1);
  ram.setU16(e + B.sub14, 0);
  ram.setU32(e + B.nudge, 0xfd000000);
  ram.setU16(e + B.hook, 1);
  freeEnemy(ram, a5);                                  // $27A3C4
}

function fire94(ram, rom, a5, a6, ctx) {
  if (playerDist268018(ram, rom, a6).carry) return false; // $27A298
  const sel = targetSelect(ram, a5);                   // $27A2A2..$27A2C0 inline
  if (sel.carry) return true;
  const dir = aim256(aimTables(rom),
    u16(ram.u16(a6 + S.posX) + 0x0300),
    u16(ram.u16(a6 + S.posY) + ram.u16(a5 + 0x28)),
    ram.u16(sel.addr + 0x02), ram.u16(sel.addr + 0x04));
  const regs = { d0: 0x0001000c, d1: dir, d2: ram.u32(a6 + 0x02),
    d3: ((0x0300 << 16) | ram.u16(a5 + 0x28)) >>> 0,
    d4: a6, d5: 0, a5 };
  const result = fireBullet({ ram, rom, log: new WriteLog(ram) }, 0x281764, regs);
  ctx.bulletSpawn?.(0x27a2ee, result);
  return true;
}

function handler94(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported)) return;

  const x = u16(ram.u16(a6 + S.posX) + 0x0a00);
  if (x + 0x7c00 <= 0xffff) ram.setU8(a5 + R.onScreen, 1);
  else if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; }

  const d1 = hitMask(ram, a6);
  let pal;
  if (d1 === 0) {
    pal = ram.u8(a5 + 0x1a);
    if (ram.u16(a6 + S.hp) < 0x0180 && ram.u16(G.ca) === 0) pal = 0x19;
  } else {
    ram.setU8(a6, ram.u8(a6) & 0xa3);
    scoreHit(ram, ctx, a6, d1);                        // $27A1FE
    pal = ram.u8(a6 + S.palette);
    if (pal === 0x19) pal = ram.u8(a5 + 0x1a);
    pal ^= ram.u8(a5 + 0x1b);
    if (i16(ram.u16(a6 + S.hp)) < 0) {
      death94(ram, rom, a5, a6, ctx, d1);
      return;
    }
  }
  ram.setU8(a6 + S.palette, pal);                      // $27A220

  if (ram.u32(G.freeze) === 0 && i16(ram.u16(a6 + S.posX)) >= 0x2c00) {
    const state = ram.u16(a5 + 0x18);
    if (state === 0) {
      const wait = ram.u8(a5 + 0x1c);
      ram.setU8(a5 + 0x1c, wait - 1);
      if (wait === 0) {
        ram.setU8(a5 + 0x1c, 0x10);
        ram.setU16(a5 + 0x18, 1);
      }
    } else if (state === 1) {
      const tick = ram.u8(a5 + 0x22);
      ram.setU8(a5 + 0x22, tick - 1);
      if (tick === 0) {
        ram.setU8(a5 + 0x22, ram.u8(a5 + 0x23));
        const frame = u16(ram.u16(a5 + 0x20) + 8);
        ram.setU16(a5 + 0x20, frame);
        if (frame === 0x78) ram.setU16(a5 + 0x18, 2);
        update94(ram, rom, a5, a6);
      }
    } else if (state === 2) {
      const fireTick = ram.u8(a5 + 0x1c);
      ram.setU8(a5 + 0x1c, fireTick - 1);
      if (fireTick === 0) {
        ram.setU8(a5 + 0x1c, ram.u8(a5 + 0x17));
        if (fire94(ram, rom, a5, a6, ctx)) {
          const salvo = ram.u8(a5 + 0x1e);
          ram.setU8(a5 + 0x1e, salvo - 1);
          if (salvo === 0) {
            ram.setU8(a5 + 0x1e, ram.u8(a5 + 0x1f));
            ram.setU8(a5 + 0x1c, 0x10);
            ram.setU16(a5 + 0x18, 3);
          }
        }
      }
    } else if (ram.u8(a5 + 0x1c) !== 0) {
      ram.setU8(a5 + 0x1c, ram.u8(a5 + 0x1c) - 1);
    } else {
      const tick = ram.u8(a5 + 0x22);
      ram.setU8(a5 + 0x22, tick - 1);
      if (tick === 0) {
        ram.setU8(a5 + 0x22, ram.u8(a5 + 0x23));
        const frame = u16(ram.u16(a5 + 0x20) - 8);
        ram.setU16(a5 + 0x20, frame);
        if (frame === 0) {
          ram.setU8(a5 + 0x1c, u16(0x40 - ram.u16(G.b6)) & 0xff);
          ram.setU16(a5 + 0x18, 0);
        }
        update94(ram, rom, a5, a6);
      }
    }
  }
  emit94(ram, rom, a6);
}

// ############################################################################
// # W181: TYPE $93, HEAVY DAMAGE-THRESHOLD ENEMY                            #
// ############################################################################

function emit93(ram, rom, a6) {
  const idx = u16(ram.u16(a6 + S.anim) * 4);           // $279FC0..$279FD2
  enqueueThroughStub(ram, rom,
    rom.u32(EMIT_TABLE.dispatch27829C + idx), a6);
}

function effect93(ram, rom, a6, ctx, spec) {
  const e = effectArmShared278320(ram, rom, ctx, a6, spec.kind, spec.site);
  ram.setU16(e + B.sub12, spec.sub12);
  ram.setU16(e + B.sub14, spec.sub14);
  ram.setU32(e + B.nudge, spec.nudge >>> 0);
  ram.setU16(e + B.hook, 1);
  if (spec.f1c !== undefined) ram.setU8(e + B.f1c, spec.f1c);
  ram.setU16(e + B.delay, spec.delay);
}

function tail93(ram, rom, a5, a6, ctx) {
  const linger = ram.u8(a5 + 0x17);
  ram.setU8(a5 + 0x17, linger - 1);                    // $279F28
  if (linger !== 0) { emit93(ram, rom, a6); return; } // $279F2C bcc $279FC0

  const d1 = 0xfac0fa40;
  const d2 = ram.u8(a6 + S.f1f);
  ctx.unported?.note(0x27f8f0, `$27F8F0 type $93 death D0=$C, D1=$${d1
    .toString(16).toUpperCase()}, D2=$${d2.toString(16).toUpperCase()} rec $${a5
    .toString(16)}`);
  freeEnemy(ram, a5);                                  // $279F42
}

function death93(ram, rom, a5, a6, ctx, d1) {
  ctx.soundPost?.(0x28c2dc);                           // $279FD6
  scoreKill(ram, rom, ctx, 0x15, d1);                 // $279FDC..$279FDE
  ram.setU16(a6, 0x8080);                             // $279FE4
  ram.setU8(a6 + S.palette, ram.u8(a5 + R.rec18));    // $279FE8
  for (const spec of [
    { kind: 0x85, site: 0x279ff2, sub12: 1, sub14: 0x0000,
      nudge: 0x0c00fe80, delay: 2, f1c: 0x40 },
    { kind: 0x0d, site: 0x27a03c, sub12: 2, sub14: 0x0400,
      nudge: 0xfa00ff00, delay: 1 },
    { kind: 0x85, site: 0x27a082, sub12: 1, sub14: 0x0000,
      nudge: 0xee000000, delay: 0 },
  ]) effect93(ram, rom, a6, ctx, spec);
  emit93(ram, rom, a6);                                // $27A0C4 -> $279FC0
}

function handler93(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported)) return; // $279F4A

  const x = u16(ram.u16(a6 + S.posX) + 0x1400);        // $279F50..$279F58
  if (x + 0x6800 <= 0xffff) ram.setU8(a5 + R.onScreen, 1);
  else if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; }

  if ((ram.u8(a6 + 0x01) & 0x80) !== 0) { tail93(ram, rom, a5, a6, ctx); return; }

  const d1 = hitMask(ram, a6);
  let pal;
  if (d1 === 0) {
    pal = ram.u8(a5 + R.rec18);
    if (ram.u16(a6 + S.hp) < 0x0380 && ram.u16(G.ca) === 0) pal = 0x19;
  } else {
    ram.setU8(a6, ram.u8(a6) & 0xa3);                 // $279F96
    scoreHit(ram, ctx, a6, d1);                       // $279F9A
    pal = ram.u8(a6 + S.palette);
    if (pal === 0x19) pal = ram.u8(a5 + R.rec18);
    pal ^= ram.u8(a5 + R.rec19);
    if (i16(ram.u16(a6 + S.hp)) < 0) {
      death93(ram, rom, a5, a6, ctx, d1);
      return;
    }
  }
  ram.setU8(a6 + S.palette, pal);                      // $279FBC
  emit93(ram, rom, a6);
}

// ############################################################################
// # W193: TYPE $36, STAGE-3 SEVEN-PART CARRIER                              #
// ############################################################################

function bullet36(ram, rom, a5, ctx, site, entry, regs) {
  ctx.bulletSpawn?.(site, fireBullet({ ram, rom, log: new WriteLog(ram) },
    entry, { d4: 0, d5: 0, a5, ...regs }));
}

function partEffect36(ram, ctx, a6, posOff, kind, sub14, site) {
  const e = spawnEffect(ram, ctx, kind, site);
  ram.setU32(e + B.pos, ram.u32(a6 + posOff));
  ram.setU16(e + B.sub12, 0);
  ram.setU16(e + B.sub14, sub14);
  ram.setU16(e + B.bucket, 0x10);
  ram.setU16(e + B.hook, 2);
  ram.setU8(e + B.speed, ram.u8(a6 + S.speed));
  ram.setU8(e + B.angle, ram.u8(a6 + S.heading) * 4);
}

function deathEffects36(ram, rom, a6, ctx) {
  for (let p = 0x263c32; ; p += 12) {
    const delay = rom.u16(p);
    if (delay === 0xffff) break;
    const e = spawnEffect(ram, ctx, rom.u16(p + 2), 0x263f1c);
    ram.setU8(e + B.f1c, rom.u16(p + 4));
    ram.setU16(e + B.delay, delay);
    ram.setU32(e + B.nudge, rom.u32(p + 6));
    ram.setU32(e + B.pos, ram.u32(a6 + S.posX));
    ram.setU16(e + B.bucket, 0x10);
    ram.setU16(e + B.sub12, 0);
    ram.setU16(e + B.sub14, 0);
    ram.setU8(e + B.speed, ram.u8(a6 + S.speed));
    ram.setU8(e + B.angle, ram.u8(a6 + S.heading) * 4);
  }
}

function fireSeven36(ram, rom, a5, a6, ctx, partOff, heading, sites) {
  const muzzle = rom.u32(0x27327a + ((((heading + 1) & 0x3e) * 2)));
  const random = drawByte242B3C(ram, rom);
  const d0 = ((((ram.u16(0x803916) & 0xff00) | random) << 16) | 5) >>> 0;
  const d2 = ram.u32(a6 + partOff);
  for (const [n, delta] of [[0, 0], [1, -4], [2, -8], [3, -12],
    [4, 4], [5, 8], [6, 12]]) {
    const d1 = (heading + delta) & 0xff;
    const d3 = u32(rom.u32(0x2735fa + ((d1 & 0x3f) * 4)) + muzzle);
    bullet36(ram, rom, a5, ctx, sites[n], 0x2814ac,
      { d0, d1, d2, d3 });
  }
}

function fireUpper36(ram, rom, a5, a6, ctx) {
  const heading = ram.u8(a6 + 0x9b);
  const d1a = (heading + 1) & 0x3e;
  const d2 = ram.u32(a6 + 0x82);
  const d3 = rom.u32(0x27307a + ((heading & 0x3e) * 4));
  for (const [site, d0, d1] of [
    [0x2642a2, 0x00060004, d1a], [0x2642ae, 0x00020004, d1a],
    [0x2642bc, 0x00060004, d1a + 2], [0x2642c8, 0x00020004, d1a + 2],
    [0x2642d6, 0x00060004, d1a - 2], [0x2642e2, 0x00020004, d1a - 2],
  ]) bullet36(ram, rom, a5, ctx, site, 0x281442,
    { d0, d1: d1 & 0xff, d2, d3 });
}

function fireLower36(ram, rom, a5, a6, ctx) {
  const heading = ram.u8(a6 + 0xbb);
  const off = (((heading + 1) & 0x3e) * 4);
  const common = { d0: 0x00010005, d1: (heading + 1) & 0x3e,
    d2: ram.u32(a6 + 0xa2) };
  bullet36(ram, rom, a5, ctx, 0x26438a, 0x281402,
    { ...common, d3: rom.u32(0x27307a + off) });
  bullet36(ram, rom, a5, ctx, 0x264394, 0x281402,
    { ...common, d3: rom.u32(0x27307a + off + 4) });
}

function fireCore36(ram, rom, a5, a6, ctx) {
  const base = ram.u8(a6 + 0xd6);
  const odd = (ram.u8(a6 + 0xd4) & 1) !== 0;
  const angles = odd ? [base + 2, base + 6, base - 2, base - 6]
    : [base, base + 4, base + 8, base - 4, base - 8];
  if (!odd) ram.setU8(a6 + 0xd8, 1);
  const d2 = ram.u32(a6 + S.posX);
  const sites = odd ? [0x2644dc, 0x2644f4, 0x26450e, 0x264526]
    : [0x26445e, 0x264476, 0x26448e, 0x2644a8, 0x2644c0];
  for (let n = 0; n < angles.length; n++) {
    const d1 = angles[n] & 0xff;
    const d3 = u32(rom.u32(0x2735fa + ((d1 & 0x3f) * 4)) + 0x04000000);
    bullet36(ram, rom, a5, ctx, sites[n], 0x2814ac,
      { d0: 0x00020004, d1, d2, d3 });
  }
  ram.setU8(a6 + 0xd4, ram.u8(a6 + 0xd4) - 1);
}

function deathFan36(ram, rom, a5, a6, ctx) {
  if (ram.u8(a6 + 0xd8) !== 0 || i16(ram.u16(a6 + S.posX)) <= 0x1000) return;
  const aim = aim64FromCaller(aimTables(rom), ram, a5,
    u16(ram.u16(a6 + S.posX) + 0x0400), ram.u16(a6 + S.posY));
  if (aim.carry) return;
  const d2 = ram.u32(a6 + S.posX);
  const angles = [aim.dir, aim.dir + 2, aim.dir + 4, aim.dir + 6,
    aim.dir - 2, aim.dir - 4, aim.dir - 6];
  const sites = [0x26469c, 0x2646b4, 0x2646cc, 0x2646e4,
    0x2646fe, 0x264716, 0x26472e];
  for (let n = 0; n < angles.length; n++) {
    const d1 = angles[n] & 0xff;
    const d3 = u32(rom.u32(0x2736fa + ((d1 & 0x3f) * 4)) + 0x04000000);
    bullet36(ram, rom, a5, ctx, sites[n], 0x281442,
      { d0: 0x00040004, d1, d2, d3 });
  }
}

function drawPart36(ram, rom, a6, posOff, deadOff, headingOff, paletteOff, table) {
  if (ram.u8(a6 + deadOff) !== 0) return;
  const h = (ram.u8(a6 + headingOff) + 1) & 0x3e;
  enqueueRegistersThroughStub(ram, rom, 0x23e056,
    u32(ram.u32(a6 + posOff) + 0xfa00fc00),
    rom.u32(table + h * 2), 0x0620, ram.u8(a6 + paletteOff));
}

function draw36(ram, rom, a6) {
  enqueueRegistersThroughStub(ram, rom, 0x23e056,
    u32(ram.u32(a6 + S.posX) + 0xdc00f600), TYPE36_ART.body,
    0x2450, ram.u8(a6 + S.palette));
  drawPart36(ram, rom, a6, 0x42, 0x5f, 0x5b, 0x5d, TYPE36_ART.lowerTable);
  drawPart36(ram, rom, a6, 0x62, 0x7f, 0x7b, 0x7d, TYPE36_ART.lowerTable);
  drawPart36(ram, rom, a6, 0xa2, 0xbf, 0xbb, 0xbd, TYPE36_ART.upperTable);
  drawPart36(ram, rom, a6, 0x82, 0x9f, 0x9b, 0x9d, TYPE36_ART.upperTable);
}

function handler36(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  if (i16(ram.u16(a6 + S.posX)) <= -0x2400) {
    if (ram.u8(a5 + R.onScreen) !== 0) {
      ram.setU16(0x8130f2, 0); freeEnemy(ram, a5); return;
    }
  } else ram.setU8(a5 + R.onScreen, 1);
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported)) return;
  if (ram.u16(G.clock) >= 0x7f) {
    ram.setU16(0x8130f2, 0); ram.setU16(0x8130f6, 0);
  }

  const pos = ram.u32(a6 + S.posX);
  ram.setU32(a6 + 0x22, pos);
  ram.setU32(a6 + 0x42, addPackedWords(pos, 0x0a00, 0xfa00));
  ram.setU32(a6 + 0x62, addPackedWords(pos, 0x0a00, 0x0600));
  ram.setU32(a6 + 0x82, addPackedWords(pos, 0xfd00, 0));
  ram.setU32(a6 + 0xa2, addPackedWords(pos, 0xf000, 0));

  const d1 = (ram.u8(a6) | ram.u8(a6 + 0x20)) & 0x5c;
  let resetPal = d1 === 0;
  if (d1 !== 0) {
    ram.setU8(a6, ram.u8(a6) & 0xa3);
    ram.setU8(a6 + 0x20, ram.u8(a6 + 0x20) & 0xa3);
    scoreHit(ram, ctx, a6, d1);
    ram.setU8(a6 + S.palette, ram.u8(a6 + S.palette) ^ ram.u8(a5 + R.rec19));
    for (const p of [0x5d, 0x7d, 0x9d, 0xbd])
      ram.setU8(a6 + p, ram.u8(a6 + p) ^ ram.u8(a6 + p + 1));
    const damage = u16(0x7fff - ram.u16(a6 + S.hp))
      + u16(0x7fff - ram.u16(a6 + 0x38));
    ram.setU32(a5 + R.rec1A, u32(ram.u32(a5 + R.rec1A) - damage));
    ram.setU16(a6 + S.hp, 0x7fff); ram.setU16(a6 + 0x38, 0x7fff);

    if (ram.u8(a6 + 0x5f) === 0 && (ram.u32(a5 + R.rec1A) | 0) <= 0x1000) {
      scoreKill(ram, rom, ctx, 0x13, d1); scoreKill(ram, rom, ctx, 0x13, d1);
      ctx.soundPost?.(0x28c25a);
      ram.setU8(a6 + 0x5f, 1); ram.setU8(a6 + 0x7f, 1);
      partEffect36(ram, ctx, a6, 0x42, 0x83, 0, 0x263dc4);
      partEffect36(ram, ctx, a6, 0x62, 0x83, 0, 0x263dfa);
    }
    if (ram.u8(a6 + 0xbf) === 0 && (ram.u32(a5 + R.rec1A) | 0) <= 0x2a00) {
      scoreKill(ram, rom, ctx, 0x11, d1); ram.setU8(a6 + 0xbf, 1);
      partEffect36(ram, ctx, a6, 0xa2, 0x84, 0x0800, 0x263e56);
      ctx.soundPost?.(0x28c25a);
    }
    if (ram.u8(a6 + 0x9f) === 0 && (ram.u32(a5 + R.rec1A) | 0) <= 0x2000) {
      scoreKill(ram, rom, ctx, 0x32, d1); ram.setU8(a6 + 0x9f, 1);
      partEffect36(ram, ctx, a6, 0x82, 0x84, 0x0800, 0x263eb8);
      ctx.soundPost?.(0x28c25a);
    }
    if ((ram.u32(a5 + R.rec1A) & 0x80000000) !== 0) {
      scoreKill(ram, rom, ctx, 0x174, d1);
      deathEffects36(ram, rom, a6, ctx); ctx.soundPost?.(0x28c2dc);
      deathFan36(ram, rom, a5, a6, ctx);
      if (ram.u8(a6 + 0xd9) !== 0) ram.setU16(0x8130f4, 0);
      ram.setU16(0x8130f6, 0); ram.setU16(0x8130f2, 0);
      ram.setU16(a6, 0x8000); ram.setU16(a6 + 0x20, 0x8000);
      ram.setU8(a6 + 0xda, 1);
      resetPal = true;
    }
  }

  if (resetPal) {
    ram.setU8(a6 + S.palette, ram.u8(a5 + R.rec18));
    for (const p of [0x5d, 0x7d, 0x9d, 0xbd])
      ram.setU8(a6 + p, ram.u8(a6 + p - 1));
  }
  if (ram.u8(a6 + 0xda) !== 0) {
    const left = (ram.u8(a6 + 0xdb) - 1) & 0xff;
    ram.setU8(a6 + 0xdb, left);
    if (left === 0) { freeEnemy(ram, a5); return; }
  }
  spawnCues28AC86(ram, rom, a5, ram.u32(a5 + R.rec1A));
  if (ram.u16(G.freeze) !== 0) { draw36(ram, rom, a6); return; }

  const aimA = aim64FromCaller(aimTables(rom), ram, a5,
    ram.u16(a6 + 0x42), ram.u16(a6 + 0x44));
  if (aimA.carry) { draw36(ram, rom, a6); return; }
  ram.setU8(a6 + 0x5b, slew64(ram.u8(a6 + 0x5b), aimA.dir));
  const aimB = aim64FromCaller(aimTables(rom), ram, a5,
    ram.u16(a6 + 0x62), ram.u16(a6 + 0x64));
  ram.setU8(a6 + 0x7b, slew64(ram.u8(a6 + 0x7b),
    aimB.carry ? ram.u16(a6 + 0x64) : aimB.dir));

  let old = ram.u8(a6 + 0xc6); ram.setU8(a6 + 0xc6, old - 1);
  if (old === 0) {
    ram.setU8(a6 + 0xc6, u16(0x20 - ram.u16(G.bc)));
    if (i16(ram.u16(a6 + 0x62)) > 0x1800) {
      if (ram.u8(a6 + 0x5f) === 0 && ram.u16(G.freezeD4) === 0)
        fireSeven36(ram, rom, a5, a6, ctx, 0x42, ram.u8(a6 + 0x5b),
          [0x264096, 0x2640ae, 0x2640c6, 0x2640de, 0x2640f8, 0x264110, 0x264128]);
      if (ram.u8(a6 + 0x7f) === 0 && ram.u16(G.freezeD4) === 0)
        fireSeven36(ram, rom, a5, a6, ctx, 0x62, ram.u8(a6 + 0x7b),
          [0x26418a, 0x2641a2, 0x2641ba, 0x2641d2, 0x2641ec, 0x264204, 0x26421c]);
    }
  }

  if (ram.u8(a6 + 0x9f) === 0) {
    const aim = aim64FromCaller(aimTables(rom), ram, a5,
      ram.u16(a6 + 0x82), ram.u16(a6 + 0x84));
    ram.setU8(a6 + 0x9b, slew64(ram.u8(a6 + 0x9b),
      aim.carry ? ram.u16(a6 + 0x84) : aim.dir));
    old = ram.u8(a6 + 0xc8); ram.setU8(a6 + 0xc8, old - 1);
    if (old === 0) {
      ram.setU8(a6 + 0xc8, u16(0x30 - ram.u16(G.ba)));
      if (i16(ram.u16(a6 + 0x82)) > 0x1800 && ram.u16(G.freezeD4) === 0)
        fireUpper36(ram, rom, a5, a6, ctx);
    }
  }

  if (ram.u8(a6 + 0xbf) === 0) {
    let lowerCadence = ram.u8(a6 + 0xce) !== 0;
    if (ram.u8(a6 + 0xce) === 0) {
      const aim = aim64FromCaller(aimTables(rom), ram, a5,
        ram.u16(a6 + 0xa2), ram.u16(a6 + 0xa4));
      ram.setU8(a6 + 0xbb, slew64(ram.u8(a6 + 0xbb),
        aim.carry ? ram.u16(a6 + 0xa4) : aim.dir));
      const ca = (ram.u8(a6 + 0xca) - 1) & 0xff; ram.setU8(a6 + 0xca, ca);
      if (ca === 0) {
        ram.setU8(a6 + 0xca, ram.u8(a6 + 0xcb));
        ram.setU8(a6 + 0xce, ram.u8(a6 + 0xcf));
        lowerCadence = true;
      }
    }
    if (lowerCadence) {
      old = ram.u8(a6 + 0xcc); ram.setU8(a6 + 0xcc, old - 1);
    }
    if (lowerCadence && old === 0) {
      ram.setU8(a6 + 0xcc, u16(8 - (ram.u16(G.bc) >>> 3)));
      if (i16(ram.u16(a6 + 0xa2)) > 0x1800 && ram.u16(G.freezeD4) === 0) {
        fireLower36(ram, rom, a5, a6, ctx); ram.setU8(a6 + 0xce, ram.u8(a6 + 0xce) - 1);
      }
    }
  }

  const dead = ram.u8(a6 + 0x5f) + ram.u8(a6 + 0x7f)
    + ram.u8(a6 + 0x9f) + ram.u8(a6 + 0xbf);
  if (dead === 4) {
    ram.setU8(a6 + 0xd7, 1);
    if (ram.u8(a6 + 0xd4) === 0) {
      old = ram.u8(a6 + 0xd0); ram.setU8(a6 + 0xd0, old - 1);
      if (old !== 0) { draw36(ram, rom, a6); return; }
      ram.setU8(a6 + 0xd0, ram.u8(a6 + 0xd1));
      ram.setU8(a6 + 0xd4, ram.u8(a6 + 0xd5));
      const aim = aim64FromCaller(aimTables(rom), ram, a5,
        u16(ram.u16(a6 + S.posX) + 0x0400), ram.u16(a6 + S.posY));
      if (!aim.carry) ram.setU8(a6 + 0xd6, aim.dir);
    }
    old = ram.u8(a6 + 0xd2); ram.setU8(a6 + 0xd2, old - 1);
    if (old === 0) {
      ram.setU8(a6 + 0xd2, u16(0x10 - (ram.u16(G.bc) >>> 2)));
      if (i16(ram.u16(a6 + S.posX)) > 0x1800 && ram.u16(G.freezeD4) === 0)
        fireCore36(ram, rom, a5, a6, ctx);
    }
  }
  draw36(ram, rom, a6);
}

// ############################################################################
// # W194: TYPE $37, STAGE-3 ROTATING THREE-SHOT FIGHTER                      #
// ############################################################################

function stageAxisGate24260A(ram, rom, a6) {
  const bounds = rom.u32(0x242562 + ram.u16(0x813096));
  const shifted = u16(ram.u16(a6 + S.posX) - (bounds & 0xffff));
  return shifted + (bounds >>> 16) > 0xffff;            // carry from $242624
}

function emitEffectRows263A0E(ram, rom, ctx, table, position, bucket) {
  for (let p = table; ; p += 12) {
    const delay = rom.u16(p);
    if (delay === 0xffff) return;
    const e = spawnEffect(ram, ctx, rom.u16(p + 2), 0x263a1a);
    ram.setU8(e + B.f1c, rom.u16(p + 4));
    ram.setU16(e + B.delay, delay);
    ram.setU32(e + B.nudge, rom.u32(p + 6));
    ram.setU32(e + B.pos, position);
    ram.setU16(e + B.bucket, bucket);
    ram.setU16(e + B.hook, 2);
    ram.setU16(e + B.sub12, 0);
    ram.setU16(e + B.sub14, 0);
    ram.setU16(e + B.speed, rom.u16(p + 10));
  }
}

function bullet37(ram, rom, a5, ctx, site, entry, d0, d1, d2, d3) {
  ctx.bulletSpawn?.(site, fireBullet({ ram, rom, log: new WriteLog(ram) },
    entry, { d0, d1, d2, d3, d4: 0, d5: 0, a5 }));
}

function death37(ram, rom, a5, a6, ctx, hit) {
  scoreKill(ram, rom, ctx, 0x47, hit);                 // $2647F4
  ram.setU16(a6, 0x8000);
  ram.setU8(a5 + R.rec1E, 1);
  const origin = u32(ram.u32(a6 + S.posX) + ram.u32(a6 + 0x06));
  emitEffectRows263A0E(ram, rom, ctx, 0x264c06, origin, 0x0c);
  spawnPoolC289B50(ram, rom, ctx, 4, 0x0c,
    u32(origin + 0xfc000000), 0x264830);
  ctx.soundPost?.(0x28c2c2);
  ram.setU8(a5 + R.rec1B, ram.u8(a5 + R.rec1C));       // $26483C fall-through
}

function draw37(ram, rom, a5, a6) {
  enqueueRegistersThroughStub(ram, rom, 0x23e020,
    u32(ram.u32(a6 + S.posX) + ram.u32(a5 + 0x2c)),
    ram.u32(a5 + 0x28), ram.u16(a5 + 0x26), 0x15);
  if (ram.u8(a5 + R.rec1E) !== 0) return;
  const anim = (ram.u16(a5 + 0x30) + 4) & 0x0f;
  ram.setU16(a5 + 0x30, anim);
  const heading = (ram.u8(a5 + R.rec1A) + 1) & 0x3e;
  enqueueRegistersThroughStub(ram, rom, 0x23e08c,
    u32(ram.u32(a6 + S.posX) + ram.u32(a6 + 0x06) + 0xf400f600),
    rom.u32(TYPE37_ART.table + heading * 8 + anim), 0x0c50,
    ram.u8(a5 + R.rec1B));
}

function handler37(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  if (i16(ram.u16(a6 + S.posX)) < -0x1800) {
    if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; }
  } else ram.setU8(a5 + R.onScreen, 1);
  scrollCompensate(ram, a5);                           // $2647C4

  const hit = ram.u8(a6) & 0x5c;
  if (hit !== 0) {
    ram.setU8(a6, ram.u8(a6) & 0xa3);
    scoreHit(ram, ctx, a6, hit);
    ram.setU8(a5 + R.rec1B,
      ram.u8(a5 + R.rec1B) ^ ram.u8(a5 + R.rec1D));
    if (i16(ram.u16(a6 + S.hp)) < 0) death37(ram, rom, a5, a6, ctx, hit);
  } else {
    ram.setU8(a5 + R.rec1B, ram.u8(a5 + R.rec1C));
  }

  if (ram.u8(a5 + R.rec1E) === 0) {
    const offset = ram.u32(a6 + 0x06);
    const aimed = aim64FromCaller(aimTables(rom), ram, a5,
      u16(ram.u16(a6 + S.posX) + (offset >>> 16)),
      u16(ram.u16(a6 + S.posY) + (offset & 0xffff)));
    if (!aimed.carry) {
      ram.setU8(a5 + R.rec1A, slew64(ram.u8(a5 + R.rec1A), aimed.dir));
      let runInner = ram.u8(a5 + R.rec24) !== 0;
      if (!runInner) {
        const old = ram.u8(a5 + R.rec20);
        ram.setU8(a5 + R.rec20, old - 1);
        if (old === 0) {
          ram.setU8(a5 + R.rec20, u16(0x18 - ram.u16(G.bc)));
          ram.setU8(a5 + R.rec24, u16(4 - (ram.u16(G.bc) >>> 3)));
          ram.setU8(a5 + 0x1f, ram.u8(a5 + R.rec1A));
          runInner = true;
        }
      }
      if (runInner) {
        const old = ram.u8(a5 + R.rec22);
        ram.setU8(a5 + R.rec22, old - 1);
        if (old === 0) {
          ram.setU8(a5 + R.rec22, ram.u8(a5 + R.rec23));
          if (!stageAxisGate24260A(ram, rom, a6)) {
            const face = ram.u8(a5 + R.rec1A);
            const rounded = (face + 1) & 0x3e;
            const d3 = u32(rom.u32(0x264b86 + rounded * 2) + offset);
            const d1 = rounded * 4;
            const d2 = ram.u32(a6 + S.posX);
            bullet37(ram, rom, a5, ctx, 0x2648f6, 0x2816f6,
              0x000a0016, d1, d2, d3);
            bullet37(ram, rom, a5, ctx, 0x2648fe, 0x281764,
              0x000a0016, d1 + 2, d2, d3);
            bullet37(ram, rom, a5, ctx, 0x264906, 0x281764,
              0x000a0016, d1 - 2, d2, d3);
            ram.setU8(a5 + R.rec24, ram.u8(a5 + R.rec24) - 1);
          }
        }
      }
    }
  }
  draw37(ram, rom, a5, a6);
}

// ############################################################################
// # W195: TYPE $3C, STAGE-3 OPENING/CLOSING SIX-MUZZLE FORMATION             #
// ############################################################################

function bullet3C(ram, rom, a5, ctx, site, entry, regs) {
  ctx.bulletSpawn?.(site, fireBullet({ ram, rom, log: new WriteLog(ram) },
    entry, { ...regs, a5 }));
}

function pattern266C36(ram, rom, a5, a6, ctx) {
  const pos = ram.u32(a6 + S.posX);
  for (let p = 0x2669ca, n = 0; n < 6; p += 4, n++) {
    const offset = rom.u32(p);
    const aimed = aim64FromCaller(aimTables(rom), ram, a5,
      u16((pos >>> 16) + (offset >>> 16)),
      u16((pos & 0xffff) + (offset & 0xffff)));
    if (aimed.carry) return;                           // $266C4E exits all six
    bullet3C(ram, rom, a5, ctx, 0x266c64, 0x281402, {
      d0: ((u16(ram.u16(a5 + R.rec22) + 4) << 16) | 5) >>> 0,
      d1: aimed.dir, d2: pos, d3: offset, d4: 0, d5: 0,
    });
  }
}

function pattern266C72(ram, rom, a5, a6, ctx) {
  const pos = ram.u32(a6 + S.posX);
  for (let p = 0x2669ca, h = 0x266cfc, n = 0; n < 6; p += 4, h++, n++) {
    const regs = {
      d0: 0x0006000b, d1: rom.u8(h), d2: pos, d3: rom.u32(p),
      d4: a6, d5: 0,
    };
    if (ram.u16(G.stage) !== 4) {
      bullet3C(ram, rom, a5, ctx, 0x266ca6, 0x281764, regs);
      continue;
    }
    const fan = [
      [0x266cba, 0x2816f6, 0xfffc000b],
      [0x266cc6, 0x281764, 0x0000000b],
      [0x266cd2, 0x2816f6, 0x0004000b],
      [0x266cde, 0x281764, 0x0008000b],
      [0x266cea, 0x2816f6, 0x000c000b],
    ];
    for (const [site, entry, d0] of fan)
      bullet3C(ram, rom, a5, ctx, site, entry, { ...regs, d0 });
  }
}

function draw3C(ram, rom, a5, a6) {
  const pos = ram.u32(a6 + S.posX);
  const palette = ram.u8(a6 + S.palette);
  enqueueRegistersThroughStub(ram, rom, 0x23e08c,
    u32(pos + 0xf200f900), TYPE3C_ART.centre, 0x0e38, palette);

  const scale = ram.u16(a5 + R.rec1A);
  let left = u32(pos + 0xfebffb40);
  left = ((u16((left >>> 16) - scale) << 16)
    | u16((left & 0xffff) - scale)) >>> 0;
  enqueueRegistersThroughStub(ram, rom, 0x23e08c,
    u32(left + 0xf200fb00), TYPE3C_ART.left, 0x0e28, palette);

  let right = u32(pos + 0xfec00480);
  right = ((u16((right >>> 16) - scale) << 16)
    | u16((right & 0xffff) + scale)) >>> 0;
  enqueueRegistersThroughStub(ram, rom, 0x23e08c,
    u32(right + 0xf200fb00), TYPE3C_ART.right, 0x0e28, palette);
}

function handler3C(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  if (i16(ram.u16(a6 + S.posX)) < -0x1000) {
    if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; }
  } else ram.setU8(a5 + R.onScreen, 1);
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported)) return; // $266A00

  const hit = ram.u8(a6) & 0x5c;
  if (hit !== 0) {
    ram.setU8(a6, ram.u8(a6) & 0xa3);
    scoreHit(ram, ctx, a6, hit);
    ram.setU8(a6 + S.palette,
      ram.u8(a6 + S.palette) ^ ram.u8(a5 + R.rec19));
    if (ram.u8(a5 + R.rec26) === 0) ram.setU16(a6 + S.hp, 0x0c00);
    if (i16(ram.u16(a6 + S.hp)) < 0) {
      scoreKill(ram, rom, ctx, 0x72, hit);
      ctx.soundPost?.(0x28c274);
      emitEffectRows263A0E(ram, rom, ctx, 0x266d08,
        ram.u32(a6 + S.posX), 0x10);
      freeEnemy(ram, a5);
      return;
    }
  } else {
    ram.setU8(a6 + S.palette, ram.u8(a5 + R.rec18));
  }

  if (ram.u16(G.freeze) === 0) {
    if (ram.u8(a5 + R.rec17) === 3) {
      const scale = u16(ram.u16(a5 + R.rec1A) - 0x40);
      ram.setU16(a5 + R.rec1A, scale);
      ram.setU16(a6 + S.f14, u16(ram.u16(a6 + S.f14) - 0x40));
      ram.setU16(a6 + 0x16, u16(ram.u16(a6 + 0x16) - 0x40));
      if (i16(scale) <= 0) {
        ram.setU16(a5 + R.rec1A, 0);
        ram.setU8(a5 + R.rec17, 0);
      }
    }

    if (ram.u8(a5 + R.rec17) === 2) {
      ram.setU8(a5 + R.rec26, 1);
      const old = ram.u8(a5 + R.rec1E);
      ram.setU8(a5 + R.rec1E, old - 1);
      if (old === 0) {
        ram.setU8(a5 + R.rec1E, ram.u8(a5 + R.rec1F));
        const late = ram.u16(G.clock) >= 0x0100;
        const cursor = ram.u16(a5 + R.rec24);
        const table = late ? 0x266c16 : 0x266c06;
        const pattern = rom.u32(table + cursor * 4);
        if (pattern === 0x266c36) pattern266C36(ram, rom, a5, a6, ctx);
        else if (pattern === 0x266c72) pattern266C72(ram, rom, a5, a6, ctx);
        else unreached(0x266ae8, `type $3C pattern pointer $${pattern.toString(16)} `
          + `is not $266C36 or $266C72`);
        ram.setU16(a5 + R.rec24, u16(cursor + 1));
        ram.setU16(a5 + R.rec22,
          u16(ram.u16(a5 + R.rec22) + (late ? 2 : 3)));
        if (ram.u16(a5 + R.rec24) === (late ? 8 : 4))
          ram.setU8(a5 + R.rec17, 3);
      }
    }

    if (ram.u8(a5 + R.rec17) === 1) {
      const scale = u16(ram.u16(a5 + R.rec1A) + 0x40);
      ram.setU16(a5 + R.rec1A, scale);
      ram.setU16(a6 + S.f14, u16(ram.u16(a6 + S.f14) + 0x40));
      ram.setU16(a6 + 0x16, u16(ram.u16(a6 + 0x16) + 0x40));
      if (i16(scale) >= 0x0380) {
        ram.setU16(a5 + R.rec1A, 0x0380);
        ram.setU8(a5 + R.rec20, ram.u8(a5 + R.rec21));
        ram.setU16(a5 + R.rec22, 1);
        ram.setU16(a5 + R.rec24, 0);
        ram.setU8(a5 + R.rec17, 2);
      }
    }

    if (ram.u8(a5 + R.rec17) === 0) {
      const old = ram.u8(a5 + R.rec1C);
      ram.setU8(a5 + R.rec1C, old - 1);
      if (old === 0) {
        ram.setU8(a5 + R.rec1C, ram.u8(a5 + R.rec1D));
        ram.setU8(a5 + R.rec17, 1);
      }
    }
  }
  draw3C(ram, rom, a5, a6);
}

// ############################################################################
// # W196: TYPE $3B, STAGE-3 FOUR-SATELLITE ORBIT FORMATION                  #
// ############################################################################

function clearClockLatch3B(ram, a5) {
  const clock = ram.u16(a5 + R.rec3A);
  if (clock === 0x0048) ram.setU16(0x8130d8, 0);
  else if (clock === 0x008d) ram.setU16(0x8130da, 0);
  else if (clock === 0x00ac) ram.setU16(0x8130dc, 0);
}

function orbit3B(ram, ctx, a5, angle, field) {
  const v = ctx.tables.shotVector(0x40, angle);
  ram.setU16(a5 + field, u16((v.dy << 2) + 0x0400));
  ram.setU16(a5 + field + 2, u16(v.dx << 2));
}

function fire3B(ram, rom, a5, a6, ctx) {
  let d1 = ram.u8(a5 + R.rec17);
  const d2 = ram.u32(a6 + S.posX);
  const step = (ram.u8(a5 + R.rec38) & 0x80) !== 0 ? -0x40 : 0x40;
  const rankBoost = ram.u16(G.rank98) !== 0 ? 0x00020000 : 0;
  const fields = [R.rec28, R.rec2C, R.rec30, R.rec34];
  const sites = [
    [0x265132, 0x265154], [0x26517c, 0x26519e],
    [0x2651c6, 0x2651e8], [0x265210, 0x265232],
  ];
  for (let n = 0; n < fields.length; n++) {
    const field = fields[n];
    const d3 = ram.u32(a5 + field);
    bullet3C(ram, rom, a5, ctx, sites[n][0], 0x2816f6, {
      d0: u32(0x00020004 + rankBoost), d1, d2, d3, d4: 0, d5: u16(step),
    });
    d1 = u16(d1 + step) & 0xff;
    bullet3C(ram, rom, a5, ctx, sites[n][1], 0x281764, {
      d0: u32(0x00000004 + rankBoost), d1, d2, d3, d4: 0, d5: u16(step),
    });
  }
}

function draw3B(ram, rom, a5, a6) {
  const pos = ram.u32(a6 + S.posX);
  const palette = ram.u8(a5 + R.rec1B);
  const cursor = (ram.u16(a5 + R.rec3C) + 4) & 0x3c;
  ram.setU16(a5 + R.rec3C, cursor);
  enqueueRegistersThroughStub(ram, rom, 0x23e020,
    u32(pos + 0xde00eb00), rom.u32(TYPE3B_ART.hullTable + cursor),
    0x22a8, palette);
  for (const field of [R.rec28, R.rec2C, R.rec30, R.rec34]) {
    enqueueRegistersThroughStub(ram, rom, 0x23e056,
      u32(pos + ram.u32(a5 + field) + 0xfc00fd00), TYPE3B_ART.satellite,
      0x0418, palette);
  }
}

function handler3B(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  if (i16(ram.u16(a6 + S.posX)) < -0x2200) {
    if (ram.u8(a5 + R.onScreen) !== 0) {
      clearClockLatch3B(ram, a5); freeEnemy(ram, a5); return;
    }
  } else ram.setU8(a5 + R.onScreen, 1);
  scrollCompensate(ram, a5);                          // $264EA2

  if (i16(ram.u16(a5 + R.rec3E)) >= 0) {
    ram.setU16(a6 + S.hp, 0x7fff);
    const amount = ram.u16(0x811f72) !== 0 ? 2 : 1;
    const old = ram.u16(a5 + R.rec3E);
    ram.setU16(a5 + R.rec3E, u16(old - amount));
    if (old < amount) ram.setU16(a6 + S.hp, 0x1c00);
  }

  const hit = ram.u8(a6) & 0x5c;
  if (hit !== 0) {
    ram.setU8(a6, ram.u8(a6) & 0xa3);
    scoreHit(ram, ctx, a6, hit);
    ram.setU8(a5 + R.rec1B,
      ram.u8(a5 + R.rec1B) ^ ram.u8(a5 + R.rec1D));
    if (i16(ram.u16(a6 + S.hp)) < 0) {
      scoreKill(ram, rom, ctx, 0x632, hit);
      clearClockLatch3B(ram, a5);
      emitEffectRows263A0E(ram, rom, ctx, 0x26539c,
        ram.u32(a6 + S.posX), 0x0c);
      ctx.soundPost?.(0x28c2dc);
      freeEnemy(ram, a5);
      return;
    }
  } else ram.setU8(a5 + R.rec1B, ram.u8(a5 + R.rec1C));

  const phase = (ram.u8(a5 + R.rec1A) + 1) & 0xff;
  ram.setU8(a5 + R.rec1A, phase);
  ram.setU8(a5 + R.rec17,
    ram.u8(a5 + R.rec17) + ram.u8(a5 + R.rec38));
  orbit3B(ram, ctx, a5, phase, R.rec28);
  orbit3B(ram, ctx, a5, phase + 0x40, R.rec2C);
  orbit3B(ram, ctx, a5, phase + 0x80, R.rec30);
  orbit3B(ram, ctx, a5, phase + 0xc0, R.rec34);

  let active = ram.u8(a5 + R.rec26) !== 0;
  if (!active) {
    const old = ram.u8(a5 + R.rec1E);
    ram.setU8(a5 + R.rec1E, old - 1);
    if (old === 0) {
      ram.setU8(a5 + R.rec1E, ram.u8(a5 + R.rec1F));
      ram.setU8(a5 + R.rec26, ram.u8(a5 + R.rec27));
      const rank = ram.u16(G.rank9E);
      ram.setU8(a5 + R.rec25, rank >= 0x00e0 ? 2 : rank >= 0x00c0 ? 3 : 4);
      active = true;
    }
  }
  if (active) {
    const old = ram.u8(a5 + R.rec24);
    ram.setU8(a5 + R.rec24, old - 1);
    if (old === 0) {
      ram.setU8(a5 + R.rec24, ram.u8(a5 + R.rec25));
      if (i16(ram.u16(a6 + S.posX)) > 0x1800) {
        fire3B(ram, rom, a5, a6, ctx);
        ram.setU8(a5 + R.rec26, ram.u8(a5 + R.rec26) - 1);
      }
    }
  }
  draw3B(ram, rom, a5, a6);
}

// ############################################################################
// # W192: TYPE $3E, STAGE-3 OPENING TWO-HITBOX FIGHTER                       #
// ############################################################################

function fire3E(ram, rom, a5, a6, ctx, angle) {
  const d2 = ram.u32(a6 + S.posX);
  const d3 = rom.u32(0x2736fa + ((angle + 2) & 0xfc));
  const cb = { ram, rom, log: new WriteLog(ram) };
  const shoot = (site, entry, d0, d1) => ctx.bulletSpawn?.(site,
    fireBullet(cb, entry, { d0, d1, d2, d3, d4: 0, d5: 0, a5 }));
  if (ram.u16(G.stage) !== 4) {
    shoot(0x2655f0, 0x2817a8, 0x0002000c, angle);
    shoot(0x2655f8, 0x2816f6, 0x0002000c, u16(angle + 8));
    shoot(0x265602, 0x2816f6, 0x0002000c, u16(angle - 8));
    return;
  }
  shoot(0x265614, 0x2817b8, 0x0006000c, angle);
  shoot(0x26561c, 0x2817b8, 0x0006000c, u16(angle + 8));
  shoot(0x265626, 0x2817b8, 0x0006000c, u16(angle - 8));
  shoot(0x265636, 0x2817b8, 0x0004000d, u16(angle + 4));
  shoot(0x265642, 0x2817b8, 0x0004000d, u16(angle - 4));
}

function death3E(ram, rom, a5, a6, ctx, d1) {
  scoreKill(ram, rom, ctx, 0x19, d1);                 // $26553A..$265540
  const e = spawnEffect(ram, ctx, 0x82, 0x265546);
  ram.setU32(e + B.pos, ram.u32(a6 + S.posX));
  ram.setU16(e + B.bucket, 0x10);
  ram.setU16(e + B.sub12, 0);
  ram.setU16(e + B.sub14, 0);
  ram.setU8(e + B.speed, ram.u8(a6 + S.speed));
  ram.setU8(e + B.angle, ram.u8(a6 + S.heading) * 4);
  ctx.soundPost?.(0x28c2a8);                          // $265576
  freeEnemy(ram, a5);                                 // $26557C
}

function handler3E(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  if (onScreen242684(ram, a6)) {                      // $265486 jsr / bcc
    if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; }
  } else {
    ram.setU8(a5 + R.onScreen, 1);                    // $26549E
  }

  applyVelocity(ram, ctx.tables, a5);                 // $2654A4 jsr $2417DE
  if (ram.u16(a5 + R.rec1C) !== 0 && ram.u16(G.freeze) === 0) {
    ram.setU16(a5 + R.rec1C, ram.u16(a5 + R.rec1C) - 1);
    const old = ram.u8(a5 + R.rec1A);
    ram.setU8(a5 + R.rec1A, old - 1);
    if (old === 0) {
      ram.setU8(a5 + R.rec1A, ram.u8(a5 + R.rec1B));
      aim64TurnStore(aimTables(rom), ram, a5, a6);    // $2654CE
    }
  }

  ram.setU32(a6 + 0x22, ram.u32(a6 + S.posX));       // second hitbox follows root
  const d1 = (ram.u8(a6) | ram.u8(a6 + 0x20)) & 0x5c;
  if (d1 !== 0) {
    ram.setU8(a6, ram.u8(a6) & 0xa3);
    ram.setU8(a6 + 0x20, ram.u8(a6 + 0x20) & 0xa3);
    scoreHit(ram, ctx, a6, d1);
    ram.setU8(a6 + S.palette,
      (ram.u8(a5 + R.rec18) ^ ram.u8(a5 + R.rec19)) & 0xff);
    const damage0 = u16(0x7fff - ram.u16(a6 + S.hp));
    const damage1 = u16(0x7fff - ram.u16(a6 + 0x38));
    const damage = Math.max(damage0, damage1);
    ram.setU32(a5 + R.rec24, u32(ram.u32(a5 + R.rec24) - damage));
    ram.setU16(a6 + S.hp, 0x7fff);
    ram.setU16(a6 + 0x38, 0x7fff);
    if ((ram.u32(a5 + R.rec24) & 0x80000000) !== 0) {
      death3E(ram, rom, a5, a6, ctx, d1);
      return;
    }
  } else {
    ram.setU8(a6 + S.palette, ram.u8(a5 + R.rec18));   // $265584
  }

  const cooldown = ram.u8(a5 + R.rec1E);
  ram.setU8(a5 + R.rec1E, cooldown - 1);               // $26558A
  if (cooldown === 0) {
    const reload = u16(0x30 - ram.u16(G.b8) + 0x0a);
    ram.setU8(a5 + R.rec1E, reload);
    ram.setU8(a5 + R.rec22, ram.u8(a5 + R.rec23));
    const heading = ram.u8(a6 + S.heading);
    ram.setU8(a5 + R.rec17, heading);
    if (i16(ram.u16(a6 + S.posX)) >= 0x2800) {
      ram.setU8(a5 + R.rec22, ram.u8(a5 + R.rec22) - 1);
      fire3E(ram, rom, a5, a6, ctx, (heading * 4) & 0xff);
    }
  }

  if (ram.u8(G.mirror) !== 0) {
    ram.setU16(a5 + R.rec28, (ram.u16(a5 + R.rec28) + 4) & 7);
  }
  const heading = (ram.u8(a6 + S.heading) + 1) & 0x3e;
  const artOff = heading * 4 + ram.u16(a5 + R.rec28);
  enqueueRegistersThroughStub(ram, rom, 0x23df86,
    u32(ram.u32(a6 + S.posX) + 0xfa00fb00),
    rom.u32(TYPE3E_ART.table + artOff), 0x0628,
    ram.u8(a6 + S.palette));                           // $265690
}

// ############################################################################
// # W199: TYPE $3F, DENSE STAGE-3 TWO-HITBOX WAVE                            #
// ############################################################################

function bullet3F(ram, rom, a5, ctx, site, entry, d0, d1) {
  const regs = { d0, d1, d2: ram.u32(ram.u32(a5 + 0x06) + S.posX),
    d3: 0, d4: 0, d5: 0, a5 };
  ctx.bulletSpawn?.(site,
    fireBullet({ ram, rom, log: new WriteLog(ram) }, entry, regs));
}

function death3F(ram, rom, a5, a6, ctx, d1) {
  scoreKill(ram, rom, ctx, 0x19, d1);                 // $265904
  const e = spawnEffect(ram, ctx, 0x82, 0x265910);
  ram.setU32(e + B.pos, ram.u32(a6 + S.posX));
  ram.setU16(e + B.bucket, 0x10);
  ram.setU16(e + B.sub12, 0);
  ram.setU16(e + B.sub14, 0);
  ram.setU8(e + B.speed, ram.u8(a6 + S.speed));
  ram.setU8(e + B.angle, ram.u8(a6 + S.heading) * 4);
  ctx.soundPost?.(0x28c2a8);                          // $265940
  if (ram.u16(a6 + S.posX) >= 0x3200) {               // $265946 unsigned
    const sel = targetSelect(ram, a5);
    if (!sel.carry) {
      const dir = aim256(aimTables(rom), ram.u16(a6 + S.posX),
        ram.u16(a6 + S.posY), ram.u16(sel.addr + 2), ram.u16(sel.addr + 4));
      bullet3F(ram, rom, a5, ctx, 0x265962, 0x2816f6, 0x0001000c, dir);
    }
  }
  freeEnemy(ram, a5);                                 // $265968
}

function draw3F(ram, rom, a5, a6) {
  if (ram.u8(G.mirror) !== 0)
    ram.setU16(a5 + R.rec28, (ram.u16(a5 + R.rec28) + 4) & 7);
  const heading = (ram.u8(a6 + S.heading) + 1) & 0x3e;
  const artOff = heading * 4 + ram.u16(a5 + R.rec28);
  enqueueRegistersThroughStub(ram, rom, 0x23df86,
    u32(ram.u32(a6 + S.posX) + 0xfa00fb00),
    rom.u32(TYPE3E_ART.table + artOff), 0x0628,
    ram.u8(a6 + S.palette));                           // $265648 shared tail
}

function handler3F(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  if (onScreen242684(ram, a6)) {                      // $265850
    if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; }
  } else {
    ram.setU8(a5 + R.onScreen, 1);                    // $265868
  }
  applyVelocity(ram, ctx.tables, a5);                 // $26586E
  if (ram.u16(a5 + R.rec1C) !== 0 && ram.u16(G.freeze) === 0) {
    ram.setU16(a5 + R.rec1C, ram.u16(a5 + R.rec1C) - 1);
    const old = ram.u8(a5 + R.rec1A);
    ram.setU8(a5 + R.rec1A, old - 1);
    if (old === 0) {
      ram.setU8(a5 + R.rec1A, ram.u8(a5 + R.rec1B));
      aim64TurnStore(aimTables(rom), ram, a5, a6);    // $265898
    }
  }

  ram.setU32(a6 + 0x22, ram.u32(a6 + S.posX));
  const d1 = (ram.u8(a6) | ram.u8(a6 + 0x20)) & 0x5c;
  if (d1 !== 0) {
    ram.setU8(a6, ram.u8(a6) & 0xa3);
    ram.setU8(a6 + 0x20, ram.u8(a6 + 0x20) & 0xa3);
    scoreHit(ram, ctx, a6, d1);
    ram.setU8(a6 + S.palette,
      ram.u8(a5 + R.rec18) ^ ram.u8(a5 + R.rec19));
    const damage = Math.max(
      u16(0x7fff - ram.u16(a6 + S.hp)),
      u16(0x7fff - ram.u16(a6 + 0x38)));
    ram.setU32(a5 + R.rec24, u32(ram.u32(a5 + R.rec24) - damage));
    ram.setU16(a6 + S.hp, 0x7fff);
    ram.setU16(a6 + 0x38, 0x7fff);
    if ((ram.u32(a5 + R.rec24) & 0x80000000) !== 0) {
      death3F(ram, rom, a5, a6, ctx, d1); return;
    }
  } else {
    ram.setU8(a6 + S.palette, ram.u8(a5 + R.rec18));  // $265970
  }

  const old = ram.u8(a5 + R.rec20);
  ram.setU8(a5 + R.rec20, old - 1);                   // $265976
  if (old === 0) {
    ram.setU8(a5 + R.rec20, ram.u8(a5 + R.rec21));
    if (!stageAxisGate24260A(ram, rom, a6)) {
      const heading = ram.u8(a6 + S.heading);
      if (ram.u16(G.stage) === 4) {
        bullet3F(ram, rom, a5, ctx, 0x2659c2, 0x281442,
          0xfffc000c, heading);
        bullet3F(ram, rom, a5, ctx, 0x2659ca, 0x281402,
          0xfffc000c, u16(heading + 2));
        bullet3F(ram, rom, a5, ctx, 0x2659d2, 0x281442,
          0xfffc000c, u16(heading - 2));
      } else {
        bullet3F(ram, rom, a5, ctx, 0x2659ac, 0x281484,
          0x0001000c, heading);
      }
    }
  }
  draw3F(ram, rom, a5, a6);                           // $2659D8 -> $265648
}

// ############################################################################
// # W185: TYPE $4D, STAGE-2 BOSS SATELLITE                                  #
// ############################################################################

function handler4D(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  if (onScreen242684(ram, a6)) {                      // $29BB64 jsr / bcc
    if (ram.u8(a5 + 0x16) !== 0) { freeEnemy(ram, a5); return; }
  } else {
    ram.setU8(a5 + 0x16, 1);                         // $29BB7A
  }

  applyVelocity(ram, ctx.tables, a5);                 // $29BB80 jsr $2417DE
  scrollCompensate(ram, a5);                          // $29BB86 jsr $24179E

  const old = ram.u8(a5 + 0x1e);
  ram.setU8(a5 + 0x1e, old - 1);                      // $29BB8C subq.b
  if (old === 0) {
    ram.setU8(a5 + 0x1e, ram.u8(a5 + 0x1f));          // $29BB94
    const cursor = u16(ram.u16(a5 + 0x20) + 4);
    ram.setU16(a5 + 0x20, cursor);
    if (cursor === 0x20) { freeEnemy(ram, a5); return; }
  }

  enqueueRegistersThroughStub(ram, rom, 0x23dece,
    (ram.u32(a6 + 0x02) + 0xfa00fc00) >>> 0,
    rom.u32(0x29bbd4 + ram.u16(a5 + 0x20)), 0x0620, 0x17);
}

// `$267226`: Stage-3 type $19's invisible global pulse controller. The two
// byte SUBQ/BCC timers produce three five-call gaps followed by one 17-call
// gap, while `$8130E8` is explicitly cleared on every non-pulse call.
function handler19(ram, _rom, a5) {
  ram.setU16(0x8130e8, 0);                             // $267226
  let old = ram.u8(a5 + 0x16);
  ram.setU8(a5 + 0x16, old - 1);                      // $26722E
  if (old !== 0) return;                               // $267232 bcc.w
  ram.setU8(a5 + 0x16, ram.u8(a5 + 0x17));            // $267236
  ram.setU16(0x8130e8, 1);                            // $26723C
  old = ram.u8(a5 + 0x18);
  ram.setU8(a5 + 0x18, old - 1);                      // $267244
  if (old !== 0) return;                               // $267248 bcc.w
  ram.setU8(a5 + 0x18, ram.u8(a5 + 0x19));            // $26724C
  ram.setU8(a5 + 0x16, 0x10);                         // $267252
}

// `$278994`: Stage-4 type $A6. This invisible controller pulses `$8130DA`
// on an old-zero word-timer borrow and alternates +1/-1 by toggling subrecord
// status bit 6. Pause preserves the previous pulse exactly; ordinary active
// frames explicitly clear it.
function handlerA6(ram, _rom, a5) {
  if (ram.u16(G.clock) >= 0x02e0) {                    // $278994..$2789A2
    freeEnemy(ram, a5);
    return;
  }
  if (ram.u16(G.freeze) !== 0) return;                 // $2789A6
  ram.setU16(G.pulseDA, 0);                            // $2789AE
  const a6 = ram.u32(a5 + R.subRec);
  const old = ram.u16(a6 + 0x06);
  ram.setU16(a6 + 0x06, old - 1);                      // $2789B6
  if (old !== 0) return;                               // $2789BA bcc
  const bias = ram.u16(G.bulletBias);
  ram.setU16(a6 + 0x06, bias === 0
    ? 7 : u16(6 - Math.floor(bias / 7)));              // $2789BE..$2789D2
  ram.setU16(G.pulseDA, 1);                            // $2789D6
  const flags = ram.u8(a6 + 1);
  ram.setU8(a6 + 1, flags ^ 0x40);                     // $2789DE bchg #6
  if (flags & 0x40) ram.setU16(G.pulseDA, 0xffff);     // $2789E2..$2789EA
}

// `$27ACE4`: Stage-4 type $9B. Two linked structure sprites share X and hit
// scoring, then spread vertically for a bounded lifetime once movement sets
// their animation byte. They are one enemy allocation, not child records.
function handler9B(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + R.subRec);
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported)) return;

  const x = ram.u16(a6 + S.posX);
  const afterFirstAdd = u16(x + 0x2000);
  const inside = afterFirstAdd + 0x5000 > 0xffff;       // $27ACF0..$27ACFA
  if (!inside) ram.setU8(a5 + R.onScreen, 1);
  else if (ram.u8(a5 + R.onScreen) !== 0) {
    freeEnemy(ram, a5);
    return;
  }

  ram.setU16(a6 + 0x22, x);                            // $27AD0C
  ram.setU16(a6 + 0x24, ram.u16(a6 + 0x24) - ram.u16(0x813176));

  const hit = (ram.u8(a6) | ram.u8(a6 + 0x20)) & 0x5c;
  if (hit !== 0) {
    ram.setU8(a6, ram.u8(a6) & 0xa3);
    ram.setU8(a6 + 0x20, ram.u8(a6 + 0x20) & 0xa3);
    scoreHit(ram, ctx, a6, hit);                       // $27AD32 jsr $286096
    ram.setU16(a6 + S.hp, 0x7fff);
    ram.setU16(a6 + 0x38, 0x7fff);
  }

  if (ram.u16(G.freeze) === 0 && ram.u8(a6 + S.anim) !== 0) {
    ram.setU16(a6 + S.posY, ram.u16(a6 + S.posY) + 0x40);
    ram.setU16(a6 + 0x24, ram.u16(a6 + 0x24) - 0x40);
    const spread = u16(ram.u16(a5 + R.rec18) + 0x40);
    ram.setU16(a5 + R.rec18, spread);
    if (spread >= 0x2a80) {
      freeEnemy(ram, a5);
      return;
    }
  }

  enqueueThroughStub(ram, rom, 0x23d79e, a6);          // $27AD76
  if (ram.u16(a5 + R.rec18) < 0x2680)
    enqueueThroughStub(ram, rom, 0x23d79e, a6 + 0x20); // $27AD8A
}

// ============================================================ THE DISPATCH
const HANDLERS = new Map([
  [0x272aac, handler20],   // W33: types $20, $21 AND $23 share this one
  [0x2688cc, handler11],
  [0x268232, handler10],
  [0x269cea, handler05],
  [0x26a2e2, handler07],
  [0x2747c6, handler82],
  [0x27687e, handler8B],
  [0x275914, handler85],   // W30: types $85 AND $86 share this one
  [0x2739c0, handler80],   // W30: type $80
  [0x276702, handler8A],   // W30: type $8A
  // W31: type $0D, THE MIDBOSS.  It lives in its own module because it is
  // four routines and five data tables (see src/midboss.js's header), and
  // it was the FOURTH and last of the gate blockers W29 uncovered.
  [0x26b6fa, handlerMidboss],
  // W36: the seven remaining NON-BOSS stage-1 handlers, 43 of the 44 records
  // the eleven above did not own.  The 44th is the stage-1 BOSS `$292902`,
  // which stays a loud named throw -- see the W36 block's header.
  [0x26a5e4, handler08],
  [0x26a860, handler09],
  [0x26ad28, handler0B],
  [0x27733e, handler89],
  [0x275f30, handler88],
  [0x2697f6, handler31],
  [0x29700c, handler24],
  // W57: type $1C, spawned ONLY by the midboss's death ($26B7E0/$26B7E2).
  // It is a BACKGROUND blit, not a sprite -- see the W57 block's header.
  [0x26c20c, handler1C],
  // W62 (S1): type $0E, THE STAGE-1 BOSS.  W36 left this a loud named throw on
  // purpose and W57 made it the port's frontier (lf7870 / clk 488).  It lives
  // in src/boss.js, which ports the FOUR routines the STAGE END rides on --
  // $294AD8, $294F32 (the 10,800-frame timeout), $294DD4 and D-script 6 -- and
  // NOT the boss.  Recon 48's 111 script entry points are still three waves.
  [0x292902, handlerBoss292902],
  [0x297398, handlerBoss297398], // W183: stage-2 boss type $30 entry layer
  // W103: type $1E, the boss's carrier enemy (spawned by E 8 at `$2963C2').
  // It drifts and explodes into a kind 3/4/5 fan on death.  See bossf23.js.
  [0x296dd6, handler1E_296DD6],
  [0x2779b6, handler95],       // W170: stage-2 type $95
  [0x276a02, handler8D],       // W171: stage-2 type $8D
  [0x2775cc, handler8F],       // W172: stage-2 type $8F
  [0x2752b0, handler84],       // W173: stage-2 type $84
  [0x279898, handler90],       // W174: stage-2 type $90
  [0x27a548, handler96],       // W175: stage-2 type $96
  [0x278c0e, handler8C],       // W176: stage-2 type $8C
  [0x279b2e, handler91],       // W177: stage-2 type $91
  [0x279d72, handler92],       // W178: stage-2 type $92
  [0x277f26, handler97],       // W179: stage-2 type $97
  [0x27a1b4, handler94],       // W180: stage-2 type $94
  [0x279f4a, handler93],       // W181: stage-2 type $93
  [0x265486, handler3E],       // W192: stage-3 opening type $3E
  [0x265850, handler3F],       // W199: dense stage-3 two-hitbox type $3F
  [0x263c7c, handler36],       // W193: stage-3 seven-part carrier type $36
  [0x2647a6, handler37],       // W194: stage-3 rotating three-shot type $37
  [0x2669e2, handler3C],       // W195: stage-3 six-muzzle formation type $3C
  [0x264e82, handler3B],       // W196: stage-3 four-satellite formation type $3B
  [0x26c3e2, handler12],       // W198: stage-3 seven-part carrier type $12
  [0x26d4b4, handler13],       // W198: hatch-spawned satellite type $13
  [0x265adc, handler14],       // W198: entrance curtain type $14
  [0x265ca0, handler15],       // W200: stage-3 carrier type $15
  [0x265e84, handler17],       // W200: type-$15 spawned two-sub child $17
  [0x2663e0, handler18],       // W200: clock-$0168 four-sub child $18
  [0x267226, handler19],       // W201: Stage-3 invisible pulse controller $19
  [0x274c90, handler83],       // W202: Stage-3 linked-hitbox aimed-ring type $83
  [0x266e34, handler16],       // W203: Stage-3 wobbling paired-shot type $16
  [0x29be28, handlerBoss29BE28], // W204: Stage-3 boss type $A0 entry/arrival
  [0x29e6b0, handler99_29E6B0],  // W209: Stage-3 boss low-HP child type $99
  [0x278994, handlerA6],          // W211: Stage-4 alternating pulse type $A6
  [0x27ace4, handler9B],          // W212: Stage-4 linked structure type $9B
  [0x29bb64, handler4D],       // W185: stage-2 boss satellite type $4D
]);

/** Run the handler at `addr` for the enemy record `a5`.  An unknown address is a
 *  LOUD NAMED THROW (never a silence).  `ctx = { tables, unported }`. */
export function runHandler(addr, ram, rom, a5, ctx) {
  const fn = HANDLERS.get(addr & 0xffffff);
  if (!fn) {
    unreached(addr, `enemy handler at $${(addr & 0xffffff).toString(16).toUpperCase()} `
      + `is not in the ported handler table {`
      + [...HANDLERS.keys()].map((a) => `$${a.toString(16).toUpperCase()}`).join(' ')
      + `}. Either an unported type was dispatched, or a handler was missed`);
  }
  fn(ram, rom, a5, ctx);
}

/** The map of ported handler addresses -> functions, for the enemy driver. */
export function handlerMap() { return HANDLERS; }
export const HANDLER_ADDRESSES = [...HANDLERS.keys()];
