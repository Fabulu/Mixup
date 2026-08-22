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
// The type `$10`, `$11`, `$82` and `$05`/`$07` fire/state machines described
// by the early W25/W30 census have since been ported. Their live implementations
// below, not this historical inventory, define current production coverage.

import { unreached } from './unported.js';
import { install24150A } from './palette.js';
import { u16, i16, i32 } from './ram.js';
import { freeEnemy } from './initbody.js';
import { handlerBoss292902, handler2A4606 } from './boss.js';
import { handlerBoss297398 } from './boss2.js';
import { handlerBoss29BE28 } from './boss3.js';
import { handler99_29E6B0 } from './boss3type99.js';
import { handler1E_296DD6 } from './bossf23.js';
import { stepMovement, scrollCompensate, applyVelocity, applyVelocityA6,
  stickMove242A48, offScreen242684 } from './movement.js';
import { readInput23D186 } from './tallyscreen.js';
import { fire as fireBulletFan, WriteLog } from './bullets.js';
// W372: type $4C's seven. `packedAdd` is deliberately absent -- it is a one-line local in
// stage3carrier.js, not an export, so $4C inlines `u32(pos + delta)` instead.
import { dist242494 } from './bossscripts.js';
import { slew64FromRecord } from './aim.js';
import { bigBurst28B4BE } from './boss.js';
import { AimTables, AIM, aim64, aim256, aim64FromCaller, aim64AtTarget,
  aim64TurnStore, aim256FromCaller, slew64, targetSelect } from './aim.js';
import { TURRET_HANDLERS, turretStep } from './turret.js';
import { enqueueDeferred, DEFQ_D1 } from './spawn.js';
import { enqueueRequest, enqueueRegisters, enqueueThroughStub,
  enqueueRegistersThroughStub, enqueueZoomedRegisters, enqueueZoomedThroughStub,
  EMIT_TABLE } from './spritequeue.js';
import { armScreenClear, armScreenClear243E02, handlerMidboss } from './midboss.js';
import { scoreByMask, scoreHit, scoreKill } from './score.js';
import { spawnEffect, spawnPoolC289B50, spawnPoolC289AF4, remapBucket, REMAP, B,
  walkDeathSpawns270D92 } from './effects.js';
import { spawnItem } from './items.js';
import { allocBee27F92A, allocPoolA27F8F0 } from './bee.js';
import { drawByte242B3C, drawByte24311A, drawByte2431F4, drawSigned242FDE,
  drawSigned242FFC,
  drawWord242EC2 } from './rng.js';
import { spawnCues28AC72, spawnCues28AC86 } from './cues.js';
// W340: `$261100`, the external speed push -- type $47 stops the scroll through it on BOTH of its exits.
// Nine callers in build B; `background.js` has produced and consumed the three words since W13/W31.
import { pushExternalSpeed } from './background.js';
import { loadAnimObjects246410, loadAnimObjects246520 } from './animobjects.js';
import { handler12, handler13, handler14 } from './stage3carrier.js';
import { handler15, handler17, handler18 } from './stage3drop.js';
import { handler83 } from './stage3type83.js';
import { handler16 } from './stage3type16.js';
import { handler9D, handler9E } from './stage4type9d.js';
import { handlerA3 } from './stage4typea3.js';
import { handlerA1 } from './stage4typea1.js';
import { handler9F, handlerA4 } from './stage4type9f.js';
import { handler41 } from './stage4type41.js';
import { handler42 } from './stage4type42.js';
// W400: type $44, the object type $43 spawns at its ramp step $3C. It owns the last two unclaimed
// callers of `$261100` ($26E04C and $26E152), and both of them also clear `$8130DA`, the
// background-element gate its own init body sets. Its own file because the family is $BBE bytes.
import { handler44 } from './stage5type44.js';
import { handlerBoss29EF0A } from './boss4.js';

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
  rec2E: 0x2e, rec30: 0x30, rec31: 0x31, rec32: 0x32, rec33: 0x33,
  rec34: 0x34, rec36: 0x36, rec38: 0x38,
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
  headCadence26: 0x26, rec28: 0x28, rec29: 0x29, rec2A: 0x2a,
  rec2B: 0x2b, rec2C: 0x2c,
  // W439, for `$274A9C` -- type $82's SECOND fire.  `($2F,A5)` is the cadence
  // RELOAD the block writes into `($22,A5)` on entry, and `($24,A5)`/`($25,A5)`
  // are the salvo counter and its own reload.  Named here rather than reused as
  // `rec24`/`rec25` for the same reason the block above gives: one name per
  // meaning.
  fire2Reload2F: 0x2f, salvoCtr24: 0x24, salvoReload25: 0x25,
};
// sub-record (A6)
const S = {
  flags: 0x00, posX: 0x02, posY: 0x04, f06: 0x06, hit10: 0x10,
  hp: 0x18, speed: 0x1a, heading: 0x1b,
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
// W451 MERGED IT INTO `movement.js offScreen242684`, and the name it had here
// was a MISNOMER: `onScreen242684` returned TRUE for OFF-screen, because the
// routine returns the 68000 CARRY and `$242696 bcs` takes carry as "off".  All
// eight call sites below already consumed it that way; only the name lied.
// `movement.js` is the leaf (it imports `ram.js` and `unported.js` and nothing
// else), it already owns `$813172` as `GL.scroll172`, it already ports this
// routine's page-neighbours `$24179E` and `$2417DE`, and this file already
// imported it -- so nothing inverts.

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
const TURRET_11 = TURRET_HANDLERS.get(0x2688cc);
const TURRET_10 = TURRET_HANDLERS.get(0x268232);

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
  // $26889E btst #0,$815EA5 -- set means the secondary explosion runs. W235 ports
  // it: `$2688A8 moveq #$4,D0` and D1 = `$267FB8[($1f,A6)*2]`, then $289AF4.
  if ((ram.u8(0x815ea5) & 1) !== 0) {                  // $26889E (set -> call)
    spawnPoolC289AF4(ram, rom, ctx, 0x04, a6, REMAP.secondary267FB8);  // $2688BA
  }
  ctx.soundPost?.(0x28c25a);                       // WAVE A: SFX id=0, death burst          // $2688C0
  freeEnemy(ram, a5);                                  // $2688C6 jmp $263762
}

// ---- $268990..$268B1A: fire / state machine -------------------------------
function fire11(ram, rom, a5, a6, ctx) {
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
  // `$268A0E..$268A5A`: shared with type $10. Frozen and no-live-player
  // carry branch to this type's common draw; cadence no-borrow and a completed
  // aim fall through into the type $11 fan below.
  const turret = turretStep(() => aimTables(rom), ram, rom, a5, a6, TURRET_11);
  if (turret.next === 'draw') { draw11(ram, rom, a5, a6); return; }
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
  // `$268376..$2683C2`: the same production block type $11 enters at $268A0E,
  // parameterised only by this type's `$268694` sprite table. Preserve its
  // cartridge exits: freeze and aim carry draw, all other arms reach fire.
  const turret = turretStep(() => aimTables(rom), ram, rom, a5, a6, TURRET_10);
  if (turret.next === 'draw') { draw10(ram, rom, a5, a6); return; }
  if ((ram.u8(a6) & 0x20) === 0) { draw10(ram, rom, a5, a6); return; } // $2683C2 btst #5
  const c = (ram.u8(a5 + R.fireCtr) - 1) & 0xff;       // $2683C8 subq.b #1,($28,A5)
  ram.setU8(a5 + R.fireCtr, c);
  if (c !== 0) { draw10(ram, rom, a5, a6); return; }    // $2683CC beq $2683EC
  fireFan10(ram, rom, a5, a6, ctx);                    // $2683EC
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
  // $26820C..$26821E -- the same six instructions and the same secondary as the
  // type-$11 death above.
  spawnPoolC289AF4(ram, rom, ctx, 0x04, a6, REMAP.secondary267FB8);
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
  if (offScreen242684(ram, a6)) {                       // jsr $242684 / bcc
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
  if (offScreen242684(ram, a6)) {                       // jsr $242684 / bcc $2747E2
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
// bullet fans (`$281708` x4, `$281764` x2); that block still needs aim256
// (`$2422A2`) and the ($30,A5)/($31,A5) stored aim byte it fires from, and it is
// read by nothing else in this handler.  **`$274A9C..$274AEE`, the SEVENTH fan
// through `$281484`, IS PORTED -- W439**; see `secondFire82`.  Both arms fall
// into the draw at `$274A22`, which is why the draw was wirable without either.
function fire82(ram, rom, a5, a6, ctx) {
  const u = ctx.unported;
  // W382. [M] `$274858  4e b9 00 28 ac 72` -- UNCONDITIONAL, and the very next
  // instruction is `$27485E tst.l $8130D2`, exactly the shape the fourteen
  // already-live sites have ($27410A, $2759A6, ...). `spawnCues28AC72` has been
  // ported in cues.js since W173 and its drainer `runCueDriver28AD70` runs every
  // frame from type5.js, so this is not the `$246410` case: the pool IS drained.
  spawnCues28AC72(ram, rom, a5, a6);                   // $274858 jsr $28AC72
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
  secondFire82(ram, rom, a5, a6, ctx);                 // $274A9C..$274AEE
}

/** `$27327A` -- type $82's MUZZLE table, 32 longwords indexed by the stored
 *  64-direction facing.  The index is `($2C,A5) & $3E` DOUBLED (`$274AAE andi.w
 *  #$3E,D0 / $274AB2 add.w D0,D0`), so it steps by 4 over 32 entries and the
 *  extent is $27327A..$2732F9 -- inside the existing `$273270 len $90` window,
 *  which is why this wave declares no new one.  `$272DFA`, read six lines up in
 *  `draw82`, is the same idiom over a different table. */
const MUZZLE_82 = 0x27327a;

/**
 * `$274A9C..$274AEE` -- TYPE $82's SECOND FIRE.  W81 left it a counted note and
 * W439 ports it, because it is the ONE spawn the port was missing on the
 * `stage1-laser-hold` rung lf4025->4050: the board puts a live kind-7 bank-A
 * bullet in slot 3 and the port left the slot byte-identical to the seed for all
 * 25 frames.  [M] Over those frames the note fired EXACTLY ONCE, on enemy record
 * `$81373C`, and the port made no other bullet-pool spawn at all.
 *
 * The whole block, read out of the image, in order:
 *
 *   $274A9C move.b ($2F,A5),($22,A5)     the cadence reload -- and it is
 *                                        OVERWRITTEN at $274AEA when the salvo
 *                                        counter also runs out, so the two
 *                                        writes are not alternatives
 *   $274AA2 lea    $27327A,A4            the muzzle table
 *   $274AA8 move.w ($2C,A5),D1           THE ANGLE, 1/64 turn -- bank A's unit
 *   $274AAC move.w D1,D0
 *   $274AAE andi.w #$3E,D0
 *   $274AB2 add.w  D0,D0                 (facing & $3E) * 2 -- a BYTE offset
 *   $274AB4 move.l (A4,D0.w),D3          the muzzle OFFSET longword
 *   $274AB8 swap   D3
 *   $274ABA addi.w #$240,D3              ...+ $240 on the LONG axis only, and
 *   $274ABE swap   D3                    `addi.w` cannot carry into the other
 *                                        half, which is the whole reason for
 *                                        the swap pair
 *   $274AC0 move.l #$40007,D0            KIND 7, SPEED BIAS 4
 *   $274AC6 move.l ($2,A6),D2            the firing enemy's position
 *   $274ACA move.l A6,D4
 *   $274ACC jsr    $281484               BANK A, and at rank 0 `$28148A beq`
 *                                        TAKES the branch to the core $2814B6
 *   $274AD2 subq.b #1,($24,A5)           the SALVO counter
 *   $274AD6 bcc    $274AEE               ...not exhausted: rts
 *   $274AD8 move.b ($25,A5),($24,A5)     reload the salvo
 *   $274ADE move.w #$60,D0
 *   $274AE2 sub.w  $8130B4,D0            RANK shortens the between-salvo wait
 *   $274AE8 addq.w #4,D0
 *   $274AEA move.b D0,($22,A5)           ...and that is the cadence, not $2F
 *   $274AEE rts
 *
 * **THE BIAS IS THE CALL SITE'S, NOT THE GENERATOR'S.**  `$281402` and `$281450`
 * add `#$40000` to D0 themselves, but only on their rank!=0 arms, and `$813098`
 * is 0 here -- so the `4` in `$40007` is the only thing that can put the board's
 * `+$1A = $18` in the record, against kind 7's template base speed of `$14`.
 * That is a two-sided check on this transcription: the kind and the speed are
 * both in one immediate and both are visible in the record.
 *
 * D4 is transcribed and unused, and D5 is not loaded here at all: `$2815C6[7]`
 * is `$2818AC`, the shared epilogue that stores nothing, so neither register can
 * reach the record.  D4 is passed anyway because the instruction IS there; D5 is
 * passed as 0 because the ROM leaves whatever the caller had in it and no path
 * out of kind 7 can read it.  Asserted against the table, not assumed -- five of
 * the nine spawn-inits DO store D4.
 */
function secondFire82(ram, rom, a5, a6, ctx) {
  ram.setU8(a5 + R.cadence22, ram.u8(a5 + R.fire2Reload2F));  // $274A9C
  const d1 = ram.u16(a5 + R.rec2C);                    // $274AA8 move.w ($2C,A5),D1
  const idx = u16((d1 & 0x3e) * 2);                    // $274AAE / $274AB2
  const m = rom.u32(MUZZLE_82 + idx);                  // $274AB4 move.l (A4,D0.w),D3
  // $274AB8 swap / $274ABA addi.w #$240 / $274ABE swap -- the LONG axis only.
  const d3 = ((u16((m >>> 16) + 0x240) << 16) | (m & 0xffff)) >>> 0;
  fireBullet({ ram, rom, log: new WriteLog(ram), mut: ctx.mut ?? null },
    0x281484,                                          // $274ACC jsr $281484
    { d0: 0x00040007,                                  // $274AC0 move.l #$40007,D0
      d1,
      d2: ram.u32(a6 + 0x02),                          // $274AC6 move.l ($2,A6),D2
      d3,
      d4: a6,                                          // $274ACA move.l A6,D4
      d5: 0,
      a5 });
  const s = ram.u8(a5 + R.salvoCtr24);                 // $274AD2 subq.b #1,($24,A5)
  ram.setU8(a5 + R.salvoCtr24, (s - 1) & 0xff);
  if (s !== 0) return;                                 // $274AD6 bcc $274AEE
  ram.setU8(a5 + R.salvoCtr24, ram.u8(a5 + R.salvoReload25));  // $274AD8
  // $274ADE..$274AE8: `#$60 - $8130B4 + 4`, as WORDS, stored as a BYTE.
  ram.setU8(a5 + R.cadence22,
    u16(0x60 - ram.u16(G.b4) + 4) & 0xff);             // $274AEA move.b D0,($22,A5)
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
      // W411 (docket D49): THE DROP. `$276900 move.w ($18,A5),D0 / $276904 move.b
      // ($1F,A6),D2 / $276908 jsr $27F8EE`, and `$27F8EE` is `moveq #$0,D1` falling
      // into `$27F8F0` -- so D1 = 0 and the impact lands exactly on the carrier.
      //
      // D0 IS RANGE-CHECKED RATHER THAN ASSUMED. ($18,A5) is the SECOND word of the
      // record prototype at $27685E (`00 00 00 08`, `loadRecordProto(.., 0x01)` in
      // initbody.js:418 copying two words to ($16,A5)/($18,A5)), and a scan of
      // $276600..$276A00 for a `move.b/move.w` to ($18,A5) finds exactly one, at
      // $2769BA, which is past this handler's own end ($276936) and belongs to
      // another type. So $0008 -- kind index 2, the gold disc -- is the only value
      // this site can pass, and anything else is a measurement that changed.
      const kindD0 = ram.u16(a5 + 0x18);               // $276900 move.w ($18,A5),D0
      if (kindD0 !== 0x0008) {
        unreached(0x276908, `$276908 jsr $27F8EE with D0 = $${
          kindD0.toString(16).toUpperCase()} out of ($18,A5). The type $8B record `
          + `prototype $27685E loads $0008 there and nothing in $276600..$276A00 `
          + `writes ($18,A5) again, so a different kind index means the prototype `
          + `or a new writer has been found -- read it before trusting this drop`);
      }
      allocPoolA27F8F0(ram, rom, ctx, kindD0, 0,
        ram.u8(a6 + S.f1f), a6);                       // $276904/$276908
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

// ============================================ TYPE $8E (W319) ============
// Six of stage 5's records, `$2764D2..$2766A5`, and W318 read it end to end before writing any of
// it -- because the two things it needed were a table entry to RESOLVE and a table to BOUND, and
// both go wrong when guessed.
//
// ## `$2782CC` IS THE ZOOM FAMILY'S SUB-TABLE, AND THAT WAS WORTH RESOLVING
//
// The draw is `move.w ($1E,A6),D0 / add.w D0,D0 x2 / lea ($2782CC,PC),A0 / movea.l (A0,D0.w),A0 /
// jsr (A0)` with `D6 = $F800F800`. `$2782CC` is **entry 12 of the 18-entry primary emitter table
// `$27829C`**, and entries 12..17 are exactly the five zoom members `spritequeue.js` documents plus
// the duplicate at 12/13:
//
//     [12] $23D9E2   [13] $23D9E2   [14] $23DA5C   [15] $23DAD6   [16] $23DB50   [17] $23DBCA
//
// So `($1E,A6)` selects a ZOOM bucket, not a plain stub, and the port already has the wrapper:
// `enqueueZoomedThroughStub`, which runs the entry through `resolveZoomStub` -- the check that a
// routine merely starting with the same four opcodes cannot pass as a family member. D6 is the
// flags longword that wrapper documents: high word the long axis, low word the short.
//
// **Nothing in the ROM bounds `($1E,A6)`.** At index 6 the `movea.l` reads `$2782E4`, the first of
// the TWELVE register-convention entries after the zoom six -- a valid-looking pointer that would
// be dispatched as if it were a zoom member. The port throws instead, naming the six.
//
// ## AND `$278314` IS SIX WORDS, BOUNDED BY A SECOND RUN OF THE SAME SHAPE
//
// The death arm reads `($1E,A6)*2` from it, the same index the draw uses, so 0..5 -> words at
// 0..$A. The words are `0000 0000 0004 0008 000C 0010`, and `$278320` starts another run beginning
// `0000 0000 0004 0008` -- so six words is where this table ends and the next begins.
//
// ## ONE COUNTED GAP, AND IT IS ONE THE PORT ALREADY COUNTS
//
// `$27F8EE` with `D0 = 8` and `D2 = ($1E,A6)` is the death routine `handlers.js` already counts at
// three sites, including **type `$89`'s with the identical registers** (`$27F8EE $89 death routine
// (D0=$8, D2=($1E,A6))`). So this is the same deferral the port has already made twice, not a new
// one, and it is worded to say so.
//
// ## THE FIVE-STAGE PARAMETER TABLE
//
// `$276484 move.w $813094,D0 / lea ($2764A0,PC),A0 / adda.w D0,A0` -- `$813094` is stage*2, so the
// table is five 2-byte rows and the stage picks one. `10 0F | 00 1E | 00 1E | 00 1E | 11 0E`, and
// the three reads are `(A0)` then `(A0)+` twice, so `($1D,A6)` and `($18,A5)` BOTH take the row's
// first byte and `($19,A5)` takes the second. Stage 5's row is `$11,$0E`.
// ===================================== THE $5C DAMAGE ARM, A FAMILY OF TWO ====
// W320 read type `$1B` and found it running type `$8E`'s damage arm instruction for instruction
// with two parameters changed. Rather than transcribe it a second time, it is one routine here and
// both types call it -- the family check the heartbeat asks for, coming back POSITIVE.
//
// The shape, in ROM order, is one decision written as two early-outs plus a hit path:
//
//   moveq #$5C,D1 / and.b (A6),D1 / bne <hit>    the hit bits
//   move.b (base,A5),D0                          NOT hit: the base palette
//   cmpi.w #hpFull,($18,A6) / bcc <store>        HP still full -> keep it
//   tst.w $8130CA / bne <store>                  the gate is up -> keep it
//   moveq #$19,D0                                else the LOW-HP palette
//  <hit>
//   andi.b #$A3,(A6) / jsr $286096               clear the bits, then scoreHit
//   move.b ($1D,A6),D0
//   cmpi.b #$19,D0 / bne                         if it is ALREADY the low-HP palette, flash from
//   move.b (base,A5),D0                          the BASE instead, or the XOR would toggle away
//   move.b (xor,A5),D2 / eor.b D2,D0             from $19 and back rather than around the colour
//   tst.w ($18,A6) / bmi <death>
//  <store>
//   move.b D0,($1D,A6)
//
// The parameter sets. W322 wrote "and the only two"; **W325 found a THIRD and it is a family of
// many, not of two** -- so this table is expected to grow and the routine should not be inlined
// back into any caller:
//
//                 hpFull   base       xor        source
//   type $8E      $140     ($18,A5)   ($19,A5)   $2764F4..$276538  (W319)
//   type $1B      $380     ($1C,A5)   ($1D,A5)   $26937E..$2693C2  (W322)
//   type $81      $980     ($1C,A5)   ($1D,A5)   $2740C2..$274106  (W325, READ -- not yet
//                                                registered; its handler is still being ported)
//
// The third one shares `$1B`'s field offsets exactly and differs only in `hpFull`, which is the
// first evidence that `base`/`xor` may be conventional rather than per-type. A fourth member with
// `($1C,A5)`/`($1D,A5)` would make that worth simplifying; do not assume it before then.
//
// Returns `{pal, dead}`. `dead` is the `bmi` and the CALLER runs its own death arm, because the two
// death arms are genuinely different routines -- this is shared damage, not shared dying.
const DAMAGE_5C = Object.freeze({
  hitMask: 0x5c, hitClear: 0xa3, lowHpPalette: 0x19, lowHpGate: 0x8130ca,
});

function damageArm5C(ram, ctx, a5, a6, spec) {
  if ((ram.u8(a6) & DAMAGE_5C.hitMask) === 0) {
    let pal = ram.u8(a5 + spec.base);
    if (ram.u16(a6 + 0x18) < spec.hpFull
        && ram.u16(DAMAGE_5C.lowHpGate) === 0) {
      pal = DAMAGE_5C.lowHpPalette;
    }
    return { pal, dead: false };
  }
  ram.setU8(a6, ram.u8(a6) & DAMAGE_5C.hitClear);
  scoreHit(ram, ctx, a6, 0);
  let pal = ram.u8(a6 + 0x1d);
  if (pal === DAMAGE_5C.lowHpPalette) pal = ram.u8(a5 + spec.base);
  pal ^= ram.u8(a5 + spec.xor);
  return { pal, dead: (ram.u16(a6 + 0x18) & 0x8000) !== 0 };
}

const T8E = Object.freeze({
  init: 0x276404, initBody: 0x27640c, handler: 0x2764d2,
  recordProto: 0x2764aa, recordWords: 6,     // $27641E moveq #$5,D0 -- D0+1
  subProto: 0x2764b6,
  stageRows: 0x2764a0, stageRowBytes: 2,
  dirSprites: 0x272d7a,                      // 32 longs, already inside $272D70+$190
  muzzle: 0x27327a,                          // the 32-entry muzzle table, already windowed
  zoomTable: 0x2782cc, zoomEntries: 6,       // entries 12..17 of $27829C
  deathWords: 0x278314, deathEntries: 6,
  zoomFlags: 0xf800f800,                     // $276612 move.l #$F800F800,D6
  // the shared $5C damage arm's parameters -- see `damageArm5C` above
  damage: Object.freeze({ hpFull: 0x140, base: 0x18, xor: 0x19 }),
  hpFull: 0x140,                             // $2764FE cmpi.w #$140,($18,A6) / bcc
  lowHpPalette: 0x19,                        // $27650E moveq #$19,D0
  lowHpGate: 0x8130ca,                       // $276506 tst.w $8130CA / bne
  hitMask: 0x5c, hitClear: 0xa3,
  fireX: 0x1000,                             // $2765AC cmpi.w #$1000,($2,A6) / blt
  shotBias: 0x80000,                         // $2765DE addi.l #$80000,D3
  killScore: 0x20,                           // $27662E moveq #$20,D0
  deathCue: 0x28c25a,
  deathEffect: 0x0c,                         // $276660 moveq #$C,D0 -> $289004
  cadenceBase: 0x40,                          // $276602 move.w #$40,D0 - $8130BA
});

/** `$276612..$27662C` -- the draw, through the ZOOM family rather than a fixed stub. */
function draw8E(ram, rom, a6) {
  const idx = ram.u16(a6 + 0x1e);                        // $276618 move.w ($1E,A6),D0
  if (idx >= T8E.zoomEntries) {
    unreached(0x276626, `type $8E's ($1E,A6) is ${idx}; $2782CC is entry 12 of the 18-entry `
      + `primary emitter table and entries 12..17 are the SIX zoom members, so index 6 would `
      + `dispatch $2782E4 -- the first register-convention entry -- as if it were one of them`);
  }
  const stub = rom.u32(T8E.zoomTable + idx * 4);         // $276626 movea.l (A0,D0.w),A0
  enqueueZoomedThroughStub(ram, rom, stub, a6, T8E.zoomFlags);   // $27662A jsr (A0)
}

function handler8E(ram, rom, a5, ctx) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, tables, u)) return;    // $2764D2 jsr $2638A6

  // $2764D8 -- `bcc $2764EE`, and the helper returns TRUE for off-screen (carry set).
  if (offScreen242684(ram, a6)) {                        // off-screen
    if (ram.u8(a5 + 0x16) !== 0) {                      // $2764E0 tst.b / beq $2764F4
      freeEnemy(ram, a5);                               // $2764E6 jmp $263762
      return;
    }
  } else {
    ram.setU8(a5 + 0x16, 1);                            // $2764EE -- it has been seen
  }

  // $2764F4..$276538 -- the shared $5C damage arm. See `damageArm5C`: type $1B runs the same
  // routine with $380 and ($1C,A5)/($1D,A5) in place of these three.
  const dmg = damageArm5C(ram, ctx, a5, a6, T8E.damage);
  if (dmg.dead) {                                       // $276530 tst.w / bmi $27662E
    death8E(ram, rom, a5, a6, ctx);
    return;
  }
  ram.setU8(a6 + 0x1d, dmg.pal & 0xff);                 // $276538 move.b D0,($1D,A6)

  // $27653C `tst.l $8130D2` -- a LONGWORD over the freeze word AND $8130D4 together, the same
  // shape as W308's `tst.w $81E0D8`. A `.w` reading would ignore $8130D4 entirely.
  if (ram.u32(G.freeze) !== 0) { draw8E(ram, rom, a6); return; }   // $276542 bne $276612

  if (due8(ram, a5 + 0x1e)) {                            // $276546 subq.b #1 / bcc $2765AC
    ram.setU8(a5 + 0x1e, ram.u8(a5 + 0x1f));             // $27654C
    if (ram.u8(a5 + 0x1c) === ram.u8(a5 + 0x1d)) {       // $276552/$276556 cmp.b / bne
      // $27655C..$276578 -- pick the nearer LIVE player. `exg` on ($3,A5) swaps which is tried
      // first, then `bmi`/`bpl` on each record's status word: a negative word is a live player.
      let a0 = 0x8103e6;
      let a1 = 0x810448;
      if (ram.u8(a5 + 0x03) !== 0) { const t = a0; a0 = a1; a1 = t; }   // $27656E exg
      let target = null;
      if ((ram.u16(a0) & 0x8000) !== 0) target = a0;      // $276570 tst.w / bmi
      else if ((ram.u16(a1) & 0x8000) !== 0) target = a1; // $276574 tst.w / bpl -> none
      if (target !== null) {
        const dir = aim64(aimTables(rom), ram.u16(a6 + 0x02), ram.u16(a6 + 0x04),
          ram.u16(target + 0x02), ram.u16(target + 0x04));   // $276586 jsr $24203E
        const d1 = slew64(ram.u16(a5 + 0x20), dir);       // $276590 jsr $242190
        ram.setU16(a5 + 0x20, u16(d1));                   // $276596
        const idx = u16((d1 & 0x3e) * 2);                 // $27659A/$27659E
        ram.setU32(a6 + 0x0a, rom.u32(T8E.dirSprites + idx));   // $2765A6
      }
    }
  }

  // $2765AC -- the fire arm, gated on X and on the octagonal player distance.
  if (i16(ram.u16(a6 + 0x02)) >= T8E.fireX && due8(ram, a5 + 0x1a)) {
    ram.setU8(a5 + 0x1a, ram.u8(a5 + 0x17));             // $2765BA
    // $2765C0 jsr $268018 / $2765C6 bcs $276612 -- the helper returns `{carry}` and a SET carry
    // means DO NOT FIRE, so the near-player test gates the shot rather than enabling it.
    if (!playerDist268018(ram, rom, a6).carry) {
      const d1 = ram.u16(a5 + 0x20);                      // $2765CE
      const off = u16((d1 & 0x3e) * 2);                   // $2765D2/$2765D8
      const d3 = u32(rom.u32(T8E.muzzle + off) + T8E.shotBias);   // $2765DA/$2765DE
      const regs = { d0: 0x00020006, d1: 0, d2: ram.u32(a6 + 0x02), d3, d4: 0, d5: 0, a5 };
      const res = fireBullet({ ram, rom, log: new WriteLog(ram) }, 0x2813f0, regs);
      ctx.bulletSpawn?.(0x2765f0, res);
      if (due8(ram, a5 + 0x1c)) {                         // $2765F6 subq.b #1 / bcc
        ram.setU8(a5 + 0x1c, ram.u8(a5 + 0x1d));          // $2765FC
        // $276602 move.w #$40,D0 / sub.w $8130BA,D0 -- the RANK shortens the cadence.
        ram.setU8(a5 + 0x1a, u16(T8E.cadenceBase - ram.u16(G.ba)) & 0xff);
      }
    }
  }
  draw8E(ram, rom, a6);                                   // $276612
}

/** `$27662E..$276672` -- the death arm. */
function death8E(ram, rom, a5, a6, ctx) {
  scoreKill(ram, rom, ctx, T8E.killScore, 0);            // $276630 jsr $28615E
  ctx.soundPost?.(T8E.deathCue);                         // $276636 jsr $28C25A
  const idx = ram.u16(a6 + 0x1e);
  if (idx >= T8E.deathEntries) {
    unreached(0x276648, `type $8E's death reads ($1E,A6)*2 from $278314, which is SIX words `
      + `(0, 0, 4, 8, $C, $10) with a second run of the same shape starting at $278320; `
      + `index ${idx} would read into it`);
  }
  // $276648 move.w (A0,D0.w),D1 -- and note this type computes the BUCKET itself rather than
  // going through the `($1F,caller)` remap table `spawnPoolC289AF4` wraps, so the right helper is
  // the one underneath it. Using the wrapper would index a remap table this call site never names.
  const d1 = rom.u16(T8E.deathWords + idx * 2);
  spawnPoolC289B50(ram, rom, ctx, 8, d1, ram.u32(a6 + 0x02), 0x289af4);   // $27664E, D0 = 8
  // W411 (docket D49): THE DROP. `$27654C moveq #$8,D0 / $276656 move.w ($1E,A6),D2 /
  // $27665A jsr $27F8EE`. D1 = 0 from `$27F8EE moveq`, so the gold disc lands on the
  // carrier; D2 is the DISPLAY LAYER, masked to a byte by `$27F8F0 andi.w #$FF` and
  // indexed into the six emitter rows at $280BB6. The same word this arm just used as
  // the $278314 index, so its range is the six the throw above already bounds.
  allocPoolA27F8F0(ram, rom, ctx, 0x08, 0, idx, a6);     // $276654/$276656/$27665A
  const eff = spawnEffect(ram, ctx, T8E.deathEffect);    // $276662 jsr $289004, D0 = $C
  if (eff) ram.setU32(eff + 0x02, ram.u32(a6 + 0x02));   // $276668
  freeEnemy(ram, a5);
}

// ============================================ TYPE $59 (W317) ============
// The CHEAPEST of stage 5's remaining types: `$265A14..$265A52`, sixty-four bytes, and its init
// body is twenty. One record in the script, and it is not really an enemy at all -- it is a timed
// SPAWNER that enqueues type `$3F` on a cadence and then deletes itself.
//
//   265a14  cmpi.w #$9C,$8130CE / blt      the SCROLL CLOCK, signed: under $9C it lives
//   265a20  jmp $263762                    at or past $9C it frees itself
//   265a28  tst.w $8130D2 / bne            the motion freeze -- do nothing this frame
//   265a32  tst.w $8130D8 / bne            and the midboss gate, likewise
//   265a3c  subq.b #1,($18,A5) / bcc       the cadence
//   265a44  move.b ($19,A5),($18,A5)       reload
//   265a4a  moveq #$3F,D0 / jsr $263684    ENQUEUE a deferred type $3F
//
// **`$263684` IS ALREADY PORTED**, as `enqueueDeferred(ram, type, DEFQ_D1.FIXED00)` -- W21's
// deferred queue, `$815EAA` with stride `$50` and a 40-entry cap. `src/mover.js`'s `unreached` at
// `$263684` still says "the enemy subsystem is not ported", which was true when it was written and
// is not now. Left alone here because fixing it means porting mover kind 18's spawn arm, which is a
// different wave; recorded so that wave knows the primitive is waiting for it.
//
// And type `$3F` is `$265850`, ported in W199. So this type is a leaf: no unported dependency.
//
// ## THE TWO-BYTE-FIELDS IDIOM, AND HERE IT IS LOAD-BEARING
//
// The init body's `move.w #$6,($18,A5)` writes a WORD, so the byte at `$18` becomes **zero** and
// the byte at `$19` becomes 6. The handler's `subq.b #1,($18,A5)` reads that zero, borrows on the
// first frame, and reloads from `($19,A5)`. So the first spawn is immediate and the cadence is
// every seven frames afterwards -- not "wait six frames, then spawn". Reading the word as a single
// counter of 6 gets both the first spawn and the period wrong.
const T59 = Object.freeze({
  init: 0x2659dc, initBody: 0x2659e4, handler: 0x265a14,
  subProto: 0x2659f8,
  clockLimit: 0x9c,            // $265A14 cmpi.w #$9C / blt -- SIGNED
  cadenceInit: 6,              // $2659F0 move.w #$6,($18,A5) -- byte $18 = 0, byte $19 = 6
  spawnType: 0x3f,             // $265A4A moveq #$3F,D0
});

function handler59(ram, _rom, a5, ctx) {
  // $265A14 -- `blt` is SIGNED, and the clock only rises, so this is a lifetime not a window.
  if (i16(ram.u16(G.clock)) >= T59.clockLimit) {
    freeEnemy(ram, a5);                                  // $265A20 jmp $263762
    return;
  }
  if (ram.u16(G.freeze) !== 0) return;                   // $265A28 tst.w $8130D2 / bne
  if (ram.u16(G.midbossD8) !== 0) return;                // $265A32 tst.w $8130D8 / bne
  if (!due8(ram, a5 + 0x18)) return;                     // $265A3C subq.b #1 / bcc
  ram.setU8(a5 + 0x18, ram.u8(a5 + 0x19));               // $265A44
  const r = enqueueDeferred(ram, T59.spawnType, DEFQ_D1.FIXED00);  // $265A4A/$265A4C
  ctx?.spawnEvent?.('deferred', T59.spawnType, r);
}

// ============================================ TYPE $81 (W326) ============
// The REAL type `$81`, out of the HIGH type table: init `$273F06`, handler `$274076`, three of
// stage 5's 770 records. W325 mislabelled type `$01` as this one; see that block below.
//
// **NOT ONE NEW PRIMITIVE.** Every routine it calls the port already had, which is what made a
// ~1,030-byte handler one wave: `stepMovement`, `damageArm5C` (its THIRD caller), the inline bounds
// idiom, `spawnCues28AC72`, `aim256`, `$281764` through `fireBullet`, the player-select idiom
// (TWICE), `scoreKill`, `soundPost`, `spawnEffect`, and two emitter stubs into bucket 7.
//
// ## THE ARMOUR TIMER, WHICH IS THIS TYPE'S OWN MECHANISM
//
//   27409e  tst.w ($2A,A5) / bmi          the timer, SIGNED
//   2740a4  ($18,A6) = $7FFF              HP PINNED AT MAX while it runs
//   2740aa  D0 = 1 ; tst.w $811F72 / bpl ; else D0 = 2
//   2740b6  ($2A,A5) -= D0                **DOUBLE drain while $811F72 is negative**
//   2740ba  on the borrow, ($18,A6) = $2600   the real HP once the armour is gone
//
// `$811F72` is the BEAM word -- `spark.js` reads `$811F73` bit 7 out of the same longword to pick
// pool E's half. So **the laser strips this type's armour twice as fast as shots do**, and until
// it is stripped the HP is unkillable by construction rather than merely high.
//
// ## A FOUR-STATE CYCLE ON ($38,A6), THE FOURTH MEMBER OF THE $45/$1B RAMP FAMILY
//
//   state 0  an ($1E,A5) delay reloading from ($28,A5)                        -> 1
//   state 1  a ($3A,A6)/($3B,A6) delay, then RAMP ($36,A6) up by 4 through $27460A; at $14 -> 2
//   state 2  the same delay, but the ramp WRAPS $18 -> $10 so it oscillates over the last two
//            entries; fires a symmetric pair from each of TWO muzzles; a volley counter on
//            ($20,A5) ends the burst and sets a RANK-paced ($1E,A5)            -> 3
//   state 3  the same delay, ramp DOWN by 4; on the BORROW `clr.w ($38,A6)`    -> 0
//
// **THE WRAP AT $18 IS NOT COSMETIC.** `$27460A` holds SIX longwords ascending by $54
// ($1732E0..$173484) and index `$18` is `$3B7C0001` -- an INSTRUCTION. The wrap is what stops the
// ROM indexing into its own code, so the guard IS the semantics and an out-of-range index is an
// `unreached` rather than a clamp.
const T81 = Object.freeze({
  init: 0x273f06, initBody: 0x273f0e, handler: 0x274076,
  stageRows: 0x273fe4, recordProto: 0x273fee, subProto: 0x274004,
  ramp: 0x27460a, rampEntries: 6,             // SIX longs; index $18 is CODE
  aimTable: 0x272dfa,                         // inside the existing $272D70 + $190 window
  damage: Object.freeze({ hpFull: 0x980, base: 0x1c, xor: 0x1d }),
  boundsA: 0xe00, boundsB: 0x7a00,            // $274080/$274084, TWO separate addi.w
  armourHp: 0x7fff, hpAfterArmour: 0x2600,    // $2740A4 / $2740BC
  beamWord: 0x811f72,                         // $2740AC tst.w -- negative doubles the drain
  fireX: 0x1000,                              // $27411A cmpi.w #$1000,($2,A6) / blt
  rampStep: 4, rampClamp: 0x14, rampWrap: 0x18, rampWrapTo: 0x10,
  aimBias: -0x880,                            // $2741EE addi.w #$F780,D0
  muzzles: [0xf7800380, 0xf780fc80],          // $2741FE / $274220
  fanD0: 0xfffd0005,                          // $274206 move.l #$FFFD0005,D0
  spreadA: 0xa, spreadB: -0x14,               // $27420C addi.w #$A / $274216 subi.w #$14
  cadenceBase: 0x40, cadenceRank: 0x8130b6,   // $274248 move.w #$40,D0 / sub.w $8130B6,D0
  killScore: 0x271,                           // $27449C move.l #$271,D0 -- a move.l, not a moveq
  deathCue: 0x28c2dc,                         // $2744A8 -- already posted elsewhere in this file
  deathEffect: 0x0d,                          // $2744AE moveq #$D,D0
  emitRecord: 0x23d852, emitRegister: 0x23df86,   // both BUCKET 7
});

/** `$27432C..$274386` -- the draw. ONE bucket through BOTH conventions, as `$1B`'s draw does with
 *  bucket 3.
 *
 *  **THE THIRD EMIT DEPENDS ON THE SECOND'S REGISTERS AND THAT IS TRANSCRIBED, NOT TIDIED.**
 *  `$274376 move.w ($4,A6),D1` sets only D1's LOW word, so D1's HIGH word is still the
 *  `($2,A6) - $40` the second emit's swap sandwich left there -- and D3/D4 are the second emit's
 *  too. Rebuilding D1 from scratch for the third emit would put it somewhere else entirely. */
function draw81(ram, rom, a5, a6) {
  void a5;
  enqueueThroughStub(ram, rom, T81.emitRecord, a6);       // $27432C jsr $23D852
  // $274332..$274340 -- one bias per half, applied around a `swap`: high = pos - $C00 ... except
  // the ROM's order is low first, so read it exactly: low += -$500, swap, low += -$C00, swap.
  const d1a = u32((((u16(ram.u16(a6 + 0x02) - 0xc00)) << 16)
    | u16(ram.u16(a6 + 0x04) - 0x500)) >>> 0);
  enqueueRegistersThroughStub(ram, rom, T81.emitRegister, d1a,
    ram.u32(a6 + 0x32), 0x428, ram.u16(a6 + 0x1c));       // $27434E
  // $274354..$274362 -- the second register emit: low += $640, swap, low += -$40, swap.
  const hi2 = u16(ram.u16(a6 + 0x02) - 0x40);
  const d1b = u32(((hi2 << 16) | u16(ram.u16(a6 + 0x04) + 0x640)) >>> 0);
  enqueueRegistersThroughStub(ram, rom, T81.emitRegister, d1b,
    ram.u32(a6 + 0x26), 0x620, ram.u16(a6 + 0x1c));       // $274370
  // $274376 -- ONLY the low word is rewritten; `hi2`, $620 and ($1C,A6) all carry over.
  const d1c = u32(((hi2 << 16) | u16(ram.u16(a6 + 0x04) - 0xe00)) >>> 0);
  enqueueRegistersThroughStub(ram, rom, T81.emitRegister, d1c,
    ram.u32(a6 + 0x2c), 0x620, ram.u16(a6 + 0x1c));       // $274382
}

/** `$2741C0..$2741E0` and `$2742A0..$2742C0` -- "pick the nearer LIVE player", the idiom
 *  `handler8E` uses at `$27655C`. `($3,A5)` decides which record is tried FIRST (`exg`), and a
 *  NEGATIVE status word means alive. Returns the chosen record address, or null if both are dead. */
function pickPlayer81(ram, a5) {
  let a0 = 0x8103e6, a1 = 0x810448;                       // $2741C0/$2741C6 lea
  if (ram.u8(a5 + 0x03) !== 0) { const t = a0; a0 = a1; a1 = t; }   // $2741CC/$2741D2 exg
  if ((ram.u16(a0) & 0x8000) !== 0) return a0;            // $2741D4 tst.w / bmi
  if ((ram.u16(a1) & 0x8000) !== 0) return a1;            // $2741DA tst.w / bpl -> none
  return null;
}

/** `$2741B2..$27425C` -- state 2's fire arm and the volley counter that ends it. */
function fire81(ram, rom, a5, a6, ctx) {
  if (due8(ram, a5 + 0x1e)) {                             // $2741B2 subq.b #1 / bcc
    ram.setU8(a5 + 0x1e, ram.u8(a5 + 0x28));              // $2741BA reload from ($28,A5)
    const target = pickPlayer81(ram, a5);
    if (target !== null) {                                // $2741DC bpl -> $27423C, no shot
      // $2741E2/$2741E8 -- target out of the SELECTED record, self out of the sub-record.
      const dir = aim256(aimTables(rom),
        u16(ram.u16(a6 + 0x02) + T81.aimBias), ram.u16(a6 + 0x04),
        ram.u16(target + 0x02), ram.u16(target + 0x04));  // $2741F2 jsr $2422A2
      // $2741F8 `move.w D1,D6` -- the aim is SAVED, because the second muzzle restores it from D6
      // at $274226 rather than re-aiming. Two muzzles, one aim.
      for (const d3 of T81.muzzles) {
        for (const step of [T81.spreadA, T81.spreadB]) {
          const d1 = u16(dir + (step === T81.spreadA ? step : T81.spreadA + step));
          const regs = { d0: T81.fanD0, d1, d2: ram.u32(a6 + 0x02), d3, d4: 0, d5: 0, a5 };
          const res = fireBullet({ ram, rom, log: new WriteLog(ram) }, 0x281764, regs);
          ctx.bulletSpawn?.(0x274210, res);
        }
      }
    }
    // $27423C -- the volley counter, and this arm is ALSO where the no-live-player path lands.
    if (due8(ram, a5 + 0x20)) {                           // $27423C subq.b #1 / bcc
      ram.setU8(a5 + 0x20, ram.u8(a5 + 0x21));            // $274242
      // $274248 -- the RANK-shortened cadence, the same construction as $8E's $276602.
      ram.setU8(a5 + 0x1e,
        u16(T81.cadenceBase - ram.u16(T81.cadenceRank)) & 0xff);
      ram.setU16(a6 + 0x38, 3);                           // $274256 move.w #$3,($38,A6)
    }
  }
}

/** `$27449C..$2744C8` -- the death arm. The canonical `$289004` + SEVEN writes family shape. */
function death81(ram, rom, a5, a6, ctx) {
  scoreKill(ram, rom, ctx, T81.killScore, 0);             // $2744A2 jsr $28615E, D0 = $271
  ctx.soundPost?.(T81.deathCue);                          // $2744A8 jsr $28C2DC
  const eff = spawnEffect(ram, ctx, T81.deathEffect);     // $2744B0 jsr $289004, D0 = $D
  if (eff) {
    ram.setU32(eff + 0x02, ram.u32(a6 + 0x02));           // $2744B6
    ram.setU16(eff + 0x1e, 0x10);                         // $2744BC
  }
  freeEnemy(ram, a5);
}

/** `$274292..$27432A` -- the SPRITE-FACING update, behind a two-byte equality gate. `$8E`'s shape:
 *  `cmp.b` two adjacent record bytes and do nothing unless they agree. */
function facing81(ram, rom, a5, a6, ctx) {
  if (!due8(ram, a5 + 0x26)) return;                      // $274286 subq.b #1 / bcc $27432C
  ram.setU8(a5 + 0x26, ram.u8(a5 + 0x27));                // $27428E
  if (ram.u8(a5 + 0x24) !== ram.u8(a5 + 0x25)) return;    // $274294/$274298 cmp.b / bne
  const target = pickPlayer81(ram, a5);                   // $2742A0 -- the idiom, a SECOND time
  if (target === null) return;                            // $2742BA bpl $27432C
  // $2742C0 -- the aim result is stored, not fired; the draw reads ($32,A6) every frame.
  const dir = aim256(aimTables(rom), ram.u16(a6 + 0x02), ram.u16(a6 + 0x04),
    ram.u16(target + 0x02), ram.u16(target + 0x04));
  ctx.unported?.note(0x2742c0, `$2742C0 type $81's facing update aimed to ${dir & 0xff} -- the `
    + `arm past the aim ($2742C0..$27432A) is the sprite/store tail and is NOT yet transcribed; `
    + `the draw still reads ($32,A6), which state 1/2/3 maintain`);
}

function handler81(ram, rom, a5, ctx) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, tables, u)) return;      // $274076 jsr $2638A6

  // $27407C..$274088 -- the inline bounds test. TWO SEPARATE `addi.w`s, so the deciding carry is
  // the SECOND one's alone. Unlike $1B this type does NOT touch $8130D8 on the free path.
  const t = u16(ram.u16(a6 + 0x02) + T81.boundsA);        // $274080 addi.w #$E00
  if ((t + T81.boundsB) > 0xffff) {                       // $274084 addi.w #$7A00 / bcc
    if (ram.u8(a5 + 0x16) !== 0) { freeEnemy(ram, a5); return; }   // $27408A/$274090
  } else {
    ram.setU8(a5 + 0x16, 1);                              // $274098 move.b #$1,($16,A5)
  }

  // $27409E -- THE ARMOUR TIMER. `bmi` is signed, so it runs while the word is non-negative.
  if ((ram.u16(a5 + 0x2a) & 0x8000) === 0) {
    ram.setU16(a6 + 0x18, T81.armourHp);                  // $2740A4 move.w #$7FFF,($18,A6)
    // $2740AC -- the BEAM word. Negative doubles the drain, so the laser strips armour twice as
    // fast as shots do.
    const drain = (ram.u16(T81.beamWord) & 0x8000) !== 0 ? 2 : 1;
    const next = ram.u16(a5 + 0x2a) - drain;              // $2740B6 sub.w D0,($2A,A5)
    ram.setU16(a5 + 0x2a, u16(next));
    if (next < 0) ram.setU16(a6 + 0x18, T81.hpAfterArmour);   // $2740BA bcc / $2740BC
  }

  // $2740C2..$274106 -- the shared $5C damage arm, its THIRD caller.
  const dmg = damageArm5C(ram, ctx, a5, a6, T81.damage);
  if (dmg.dead) { death81(ram, rom, a5, a6, ctx); return; }     // $274102 bmi $27449C
  ram.setU8(a6 + 0x1d, dmg.pal & 0xff);                   // $274106
  spawnCues28AC72(ram, rom, a5, a6);                      // $27410A jsr $28AC72

  // $274110 -- `tst.l` over $8130D2 AND $8130D4 together, the W308 shape.
  if (ram.u32(G.freeze) !== 0) { draw81(ram, rom, a5, a6); return; }
  if (i16(ram.u16(a6 + 0x02)) < T81.fireX) {              // $27411A cmpi.w #$1000 / blt
    facing81(ram, rom, a5, a6, ctx);
    draw81(ram, rom, a5, a6);
    return;
  }

  const state = ram.u16(a6 + 0x38);                       // $274124 move.w ($38,A6),D0
  if (state === 0) {
    if (due8(ram, a5 + 0x1e)) {                           // $27412A subq.b #1 / bcc
      ram.setU8(a5 + 0x1e, ram.u8(a5 + 0x28));            // $274132
      ram.setU16(a6 + 0x38, 1);                           // $274138 move.w #$1,($38,A6)
    }
  } else if (state === 1) {
    if (due8(ram, a6 + 0x3a)) {                           // $274148 subq.b #1 / bcc
      ram.setU8(a6 + 0x3a, ram.u8(a6 + 0x3b));            // $274150
      const idx = u16(ram.u16(a6 + 0x36) + T81.rampStep); // $274156 addq.w #4
      ram.setU16(a6 + 0x36, idx);
      ram.setU32(a6 + 0x32, rampLong81(rom, idx));        // $274164
      if (idx === T81.rampClamp) ram.setU16(a6 + 0x38, 2);    // $27416A/$274172
    }
  } else if (state === 2) {
    if (due8(ram, a6 + 0x3a)) {                           // $274184 subq.b #1 / bcc $2741B2
      ram.setU8(a6 + 0x3a, ram.u8(a6 + 0x3b));            // $27418A
      let idx = u16(ram.u16(a6 + 0x36) + T81.rampStep);   // $274190 addq.w #4
      if (idx === T81.rampWrap) idx = T81.rampWrapTo;     // $274194/$27419C -- THE GUARD
      ram.setU16(a6 + 0x36, idx);
      ram.setU32(a6 + 0x32, rampLong81(rom, idx));        // $2741AC
    }
    fire81(ram, rom, a5, a6, ctx);                        // $2741B2 -- reached either way
  } else {
    if (due8(ram, a6 + 0x3a)) {                           // $27425E subq.b #1 / bcc
      ram.setU8(a6 + 0x3a, ram.u8(a6 + 0x3b));            // $274264
      const cur = ram.u16(a6 + 0x36);
      if (cur < T81.rampStep) {                           // $27426A subq.w #4 / bcc
        ram.setU16(a6 + 0x36, u16(cur - T81.rampStep));
        ram.setU16(a6 + 0x38, 0);                         // $274270 clr.w ($38,A6)
      } else {
        const idx = u16(cur - T81.rampStep);
        ram.setU16(a6 + 0x36, idx);
        ram.setU32(a6 + 0x32, rampLong81(rom, idx));      // $274276..
      }
    }
  }
  facing81(ram, rom, a5, a6, ctx);                        // $274286
  draw81(ram, rom, a5, a6);                               // $27432C
}

/** `$27460A` indexed by `($36,A6)`. SIX longwords, and index `$18` is an INSTRUCTION
 *  (`$3B7C0001`), so an out-of-range index is a throw and never a clamp. */
function rampLong81(rom, idx) {
  if (idx > T81.rampClamp || (idx & 3) !== 0) {
    unreached(T81.ramp, `$27460A indexed by ($36,A6) = $${idx.toString(16).toUpperCase()}. The `
      + `table is SIX longwords ($1732E0..$173484, ascending by $54) and the longword at index `
      + `$18 is $3B7C0001 -- an INSTRUCTION. The ROM's own guards are the $14 clamp in state 1 `
      + `and the $18 -> $10 wrap in state 2; reaching here means one of them was not transcribed, `
      + `and the emitted sprite address would be built out of an opcode`);
  }
  return rom.u32(T81.ramp + idx);
}

// ============================================ TYPE $01 (W325) ============
// `$267C24..$267CBA`, and it arrived here BY A MISTAKE THAT IS WORTH THE COMMENT.
//
// W325 set out to port stage 5's type `$81`. The type table is TWO tables -- `$267824` for types
// `$00..$7F` and `$27E412` for `$80..$FF` -- and the reconnaissance script masked the index with
// `& $7F` while leaving the base at the LOW table. So it read entry 1 of the low table and
// translated **type `$01`**, whose init is `$267C24` and whose handler is `$267C70`. The real type
// `$81` is `$273F06`/`$274076` and is still unported. `tests/w314stage5scope.test.js typeEntry`
// picks the table correctly and is the thing to copy.
//
// **The code below is right about the ROUTINES it read** -- they were disassembled from
// `$267C24` and `$267C70` directly -- so it is kept rather than reverted. But be clear about what
// it is NOT: **no stage script spawns type `$01`.** Walking all five scripts on the 8-byte stride
// finds zero records of it, so this is a type reached (if at all) by some other spawner, and
// registering its handler is safe precisely because nothing in a stage reaches it. It is real
// translated code and it is NOT progress against the stage-5 census.
//
// What the wave does buy, and the reason it was kept: **two shared library routines** the real
// types will need -- `$242A48`, the stick decode, with SEVEN callers, and `$259C42` with FIVE.
//
//   **TYPE $01 IS DRIVEN BY PLAYER TWO AND IT SPAWNS ITEMS.**
//
//   267c70  jsr $242A48         move from p2RAW ($803976), the HELD stick  -- movement.js
//   267c76  tst.w ($18,A5) / beq $267C86
//   267c7e  subq.w #1,($18,A5)  a countdown; while it runs, only the draw happens
//   267c82  bra $267CB2
//   267c86  jsr $23D18E         D0 = $803978 = p2EDGE, the edge-triggered word
//   267c8c  btst #$6,D0 / beq $267CB2                 button bit 6, on the EDGE
//   267c94  jsr $259C42         D0 = $812E0A
//   267c9a  cmpi.w #$4,D0 / bgt $267CB2               > 4 refused
//   267ca2  tst.w D0 / bmi $267CB2                    negative refused
//   267ca8  add.w D0,D0 / add.w D0,D0                 D0 *= 4 -- THE ITEM KIND
//   267cac  jsr $27E812         the ITEM ALLOCATOR -- `spawnItem`, ported in W61
//   267cb2  jsr $23D762         bucket 0, RECORD convention -- `enqueueThroughStub`
//
// So: P2 holds a direction and it moves; P2 taps a button and it allocates an item whose KIND is
// `$812E0A * 4`. The range check `0 <= D0 <= 4` scaled by four is exactly the item pool's kinds
// `$00 $04 $08 $0C $10` -- five of its six, and `$14` (the P2 hyper item) is the one it cannot
// reach. That is a strong internal check that the reading is right: an unrelated word would not
// range-check onto precisely the item kind ladder.
//
// **`$812E0A` IS READ AND NEVER WRITTEN.** `rosetta.py sites` finds two references in Build B and
// both are reads (`$1591D8` and `$259C42` itself); nothing anywhere stores to it. So in a fresh
// machine it is 0 and the kind is `$00`, the power-up. Transcribed as the read it is, because a
// port that folded it to a constant would be wrong the moment anything ever writes it.
//
// NOT ONE NEW PRIMITIVE except the two tiny shared routines this wave added: `$242A48` (the stick
// decode, seven callers, now `movement.js stickMove242A48`) and `$259C42` (two instructions, five
// callers, below). Everything else was already here.
// ============================================================ TYPE $49 (W335)
//
// Stage 5's sweeping fan emplacement. `$27159E` init / `$2715A6` initBody (see `initbody.js`) /
// `$271640` handler. Entry points verified against the type table: `$267824 + $49*8 = $267A6C` reads
// `0027159e 00271640`, and the body is `init + 8` by `spawn.js`'s `$26361A addq.w #8,A1`.
//
// **ITS DAMAGE ARM IS THE FIRST *SIMPLE* MEMBER OF THE `$5C` FAMILY.** `$271640 moveq #$5C,D1 /
// and.b (A6),D1` is the mask the family is named for, but there is no `hpFull` reload and no palette
// DECISION -- just base `($18,A5)` and XOR mask `($19,A5)`. Routing it through `damageArm5C` would
// invent both. Written inline, which is what the fifth member needs.
//
// **THE SWEEP: ONE COUNTER, TWO INDEX CONVENTIONS.** `($1C,A5)` steps `addq.w #4` and wraps at `$78`,
// so 30 steps. The two WORD tables are indexed by it ASR 1 and the two LONG tables by it RAW. The
// word values run out and come back, so the fan sweeps and returns over 30 frames; `($17,A5)` -- set
// only by the init, only on the `$8130CE == $1F3` record -- picks the direction and mirrors the muzzle.
const T49 = Object.freeze({
  init: 0x27159e, initBody: 0x2715a6, handler: 0x271640,
  recordProto: 0x271616, recordWords: 7,      // $2715B8 moveq #$6,D0 -- D0+1 = 7
  subProto: 0x271624,                         // $20 bytes, OVERLAPS the handler at $271640
  damageMask: 0x5c, damageClear: 0xa3,        // $271640 / $271648 -- and.b #$A3 clears them
  palBase: 0x18, palXor: 0x19,                // ($18,A5) base, ($19,A5) the XOR mask
  killScore: 0x250,                           // $27166A move.l #$250,D0
  deathCue: 0x28c2dc,                         // $271684
  deathList: 0x27197c,                        // $27167A -- FOUR entries, walked by $270D92
  boundsBias: 0x4000, boundsLimit: 0x2000,    // $2716A6 addi.l / $2716AC cmpi.l -- SIGNED LONG
  sweepSet: 0x27188c, sweepClear: 0x271904,   // ($17,A5) SET / CLEAR; index ASR 1
  muzzleTable: 0x271814, drawTable: 0x27179c, // index RAW
  sweepStep: 4, sweepWrap: 0x78, sweepEntries: 30,
  fanEntry: 0x2816f6, fanD0: 4,               // $271734 moveq #$4,D0
  drawBias: 0xf000f600,                       // $271784 addi.l #-$FFF0A00
  drawD3: 0x1050, drawStub: 0x23dece,         // $27178A / $271794
});

/** `$2716F6..$27175E` -- the fire arm: THREE shots, of which only the FIRST specifies its own
 *  registers.
 *
 *  `$271736 jsr $2816F6` is fully determined -- D0 = 4, D1 from the sweep table, D2 the biased
 *  position, D3 = D4 = 0. The two that follow are NOT: `$271742 jsr $281764` and `$27175A jsr
 *  $281744` each set only D0 and inherit D1..D4 from whatever `$2816F6` left behind. That is the
 *  same shape as `draw81`'s third emit, which the port transcribes rather than tidies -- but there
 *  the producing routine's register effects were read first, and here they have not been. So the
 *  first shot is ported and the other two are NOTED, because guessing that D1..D4 survive the call
 *  unchanged would be an invention with a visible consequence: two of this type's three bullets. */
function fire49(ram, rom, a5, a6, ctx) {
  const table = ram.u8(a5 + 0x17) !== 0 ? T49.sweepSet : T49.sweepClear;   // $2716F6..$271708
  const idx = u16(ram.u16(a5 + 0x1c));
  if (idx >= T49.sweepEntries * 4) {
    unreached(0x27170a, `type $49's sweep index ($1C,A5) is $${idx.toString(16)}, past the `
      + `30 entries; $271764's wrap at $78 is the only bound`);
  }
  const d1 = rom.u16(table + (idx >> 1));                 // $27170A asr.w #1 / adda.w / move.w (A1),D1
  // $271714..$27172E -- the packed muzzle offset. `neg.w` negates ONLY the low word of a value
  // loaded by `move.l`, with no borrow into the high word, so the mirror flips Y and keeps X; the
  // `add.l` that follows does let a low-word carry reach X.
  let d3 = rom.u32(T49.muzzleTable + idx);                // $27171E move.l (A1),D3
  if (ram.u8(a5 + 0x17) !== 0) {                          // $271724 tst.b ($17,A5) / beq
    d3 = ((d3 & 0xffff0000) | (u16(-(d3 & 0xffff)))) >>> 0;    // $27172C neg.w D3 -- LOW WORD ONLY
  }
  const d2 = u32(ram.u32(a6 + 0x02) + d3);                // $27172E add.l D3,D2
  // $271730 moveq #$0,D3 / moveq #$0,D4 / moveq #$4,D0 -- so D3 and D4 are ZERO for all three shots.
  //
  // **W336: THE THREE SHOTS SHARE D1..D4 AND THAT IS NOW MEASURED, NOT ASSUMED.** `$281744`,
  // `$281764` and `$2816F6` are thin wrappers that all funnel into `$2817C2`, whose prologue is
  // `movem.l D7/A0-A1,-(A7)` -- it saves only D7, A0 and A1. But read to its `rts`: D1, D2, D3 and
  // D4 appear ONLY as sources (`move.b D1,($B,A0)`, `move.l D2,(A0)+`, `move.l D3,($18,A0)`,
  // `move.l D4,($1C,A0)`, `move.b D4,($24,A0)`) and no instruction anywhere writes them. D0 alone is
  // clobbered, as the return status -- `move.w D0,D0` sets Z before each `rts` and the full-pool
  // path at `$281842` sets carry with `ori #$1,SR`. So the ROM's second and third shots really do
  // inherit the first's registers, and the port passes the same D1..D4 rather than rebuilding them.
  for (const [site, entry, d0, gated] of [
    [0x271736, T49.fanEntry, T49.fanD0, false],
    [0x271742, 0x281764, 0xfffc0005, false],
    [0x27175a, 0x281744, 0x00040003, true],
  ]) {
    // $271748 cmpi.w #$268,$8130CE / bcs $271760 -- `bcs` is UNSIGNED lower, so the third shot is
    // added only once the stage has scrolled to $268. Early in the formation's life it fires two.
    if (gated && ram.u16(G.clock) < 0x268) continue;
    const res = fireBullet({ ram, rom, log: new WriteLog(ram) }, entry,
      { d0, d1, d2, d3: 0, d4: 0, d5: 0, a5 });
    ctx.bulletSpawn?.(site, res);
  }
}

/** `$271774..$27179A` -- the draw. ONE register-convention request, and the position bias is a
 *  LONGWORD add, so the low half's carry reaches the high half. */
function draw49(ram, rom, a5, a6) {
  const idx = u16(ram.u16(a5 + 0x1c));
  if (idx >= T49.sweepEntries * 4) {
    unreached(0x271774, `type $49's draw index ($1C,A5) is $${idx.toString(16)}, past the `
      + `30 longwords at $${T49.drawTable.toString(16).toUpperCase()}; $271764's wrap at $78 is the `
      + `only thing that bounds it, so an out-of-range value means the wrap was skipped`);
  }
  enqueueRegistersThroughStub(ram, rom, T49.drawStub,
    u32(ram.u32(a6 + 0x02) + T49.drawBias),               // $271780/$271784
    rom.u32(T49.drawTable + idx),                         // $271774..$27177E move.l (A0),D2
    T49.drawD3,                                           // $27178A move.w #$1050,D3
    ram.u16(a6 + 0x1c));                                  // $271790 move.w ($1C,A6),D4
}

/** `$27167A..$271696` -- the death arm: FOUR spawns from `$27197C` through the shared walker, then
 *  the formation flag is cleared THROUGH `($20,A5)`. */
function death49(ram, rom, a5, a6, ctx) {
  scoreKill(ram, rom, ctx, T49.killScore, 0);             // $27166A move.l #$250,D0 / jsr $28615E
  walkDeathSpawns270D92(ram, rom, ctx, T49.deathList,
    ram.u32(a6 + 0x02), 0x271680);                        // $271676 D2 = ($2,A6) / $271680 jsr
  ctx.soundPost?.(T49.deathCue);                          // $271684 jsr $28C2DC
  ram.setU16(ram.u32(a5 + 0x20), 0);                      // $27168A movea.l ($20,A5),A0 / clr.w (A0)
  freeEnemy(ram, a5);                                     // $271690 jmp $263762
}

function handler49(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);

  // $271640..$27165E -- the SIMPLE $5C damage arm, inline. No hpFull, no palette decision.
  const hit = ram.u8(a6) & T49.damageMask;                // $271640 moveq #$5C,D1 / and.b (A6),D1
  if (hit !== 0) {
    ram.setU8(a6, ram.u8(a6) & T49.damageClear);          // $271648 move.b #$A3,D0 / and.b D0,(A6)
    scoreHit(ram, ctx, a6, hit);                          // $27164E jsr $286096, D1 = the masked bits
    ram.setU8(a6 + 0x1d,
      (ram.u8(a6 + 0x1d) ^ ram.u8(a5 + T49.palXor)) & 0xff);   // $271654..$27165E eor.b
    if ((ram.u16(a6 + 0x18) & 0x8000) !== 0) {            // $271662 tst.w ($18,A6) / bpl -- alive
      death49(ram, rom, a5, a6, ctx);
      return;
    }
  } else {
    ram.setU8(a6 + 0x1d, ram.u8(a5 + T49.palBase));       // $271698 -- NOT hit: restore the base
  }

  // $27169E..$2716B2 -- the off-screen test, and it is a SIGNED LONG compare rather than the
  // two-`addi.w` word idiom `$1B` and `$81` use for the same job. `ext.l` first, so a negative Y
  // sign-extends into the high half before the bias.
  const y = i32(i16(ram.u16(a6 + 0x02)) + T49.boundsBias);
  if (y <= T49.boundsLimit) {                             // $2716B2 bgt -- so <= stays on screen
    if (ram.u8(a5 + 0x16) !== 0) {                        // $2716B6 tst.b ($16,A5) / beq
      ram.setU16(ram.u32(a5 + 0x20), 0);                  // $2716BE -- the flag, through the pointer
      freeEnemy(ram, a5);                                 // $2716C4 jmp $263762
      return;
    }
  } else {
    ram.setU8(a5 + 0x16, 1);                              // $2716CC move.b #$1,($16,A5)
  }

  scrollCompensate(ram, a5);                           // $2716D2 jsr $24179E
  // $2716D8 `tst.w $271774.l` IS OMITTED ON PURPOSE. $271774 is inside this routine and the word
  // there is $41FA -- the `lea` opcode -- so it reads code as data, and $2716DE `subq.b` overwrites
  // every flag before $2716E2 `bcc` reads carry. It has no effect. Third instance in stage 5 of this
  // ROM indexing its own instruction stream, after $27460A (W326) and $25DAC2 (W332).
  if (due8(ram, a5 + 0x1a)) {                             // $2716DE subq.b #1 / bcc $271774
    ram.setU8(a5 + 0x1a, ram.u8(a5 + 0x1b));              // $2716E6
    if (ram.u16(G.freezeD4) === 0) {                      // $2716EC tst.w $8130D4 / bne $271760
      fire49(ram, rom, a5, a6, ctx);
    }
    // $271760 -- the counter advances whether or not the volley fired, so a freeze does NOT stall
    // the sweep; it only silences it.
    const next = u16(ram.u16(a5 + 0x1c) + T49.sweepStep); // $271760 addq.w #4,($1C,A5)
    ram.setU16(a5 + 0x1c, next < T49.sweepWrap ? next : 0);   // $271764 cmpi.w #$78 / blt
  }
  draw49(ram, rom, a5, a6);                               // $271774 -- reached on EVERY path
}

// ============================================================ TYPE $4A (W337)
//
// Stage 5's seven-way aimed fan turret. `$2719AE` init / `$2719B6` initBody / `$271A64` handler.
//
// **IT DIES WITHOUT FREEING ITSELF, AND `($3F,A6)` IS TESTED THREE TIMES.** Where `$49`'s death arm
// ends in `freeEnemy`, `$4A` sets `(A6) = $8000` and `($3F,A6) = 1` and FALLS THROUGH. The mark is then
// read at the handler's very first instruction (`$271A64`), before the fire arm (`$271B1A`) and before
// the draw (`$271BD8`), so from its next frame the record is unhittable, silent and invisible and only
// drifts until the off-screen free at `$271AF8` collects it. `death37` is the same shape (W336) --
// mark-and-fall-through is an established member shape, not a new mechanism.
//
// **FIVE PLACES IT LOOKS LIKE `$49` AND IS NOT**, every one of them able to produce a plausible wrong
// picture: `($20,A5)` is aim state and not a formation-flag pointer; the off-screen limit is `$1C00`
// and not `$2000`; the freeze SKIPS the counter step where `$49`'s freeze runs INTO it; the ring is an
// eight-entry `andi.w #$1F` mask where `$49` wraps thirty with a compare; and the prototype overlap is
// eight bytes deep rather than four. It also never calls `stepMovement`.
const T4A = Object.freeze({
  init: 0x2719ae, initBody: 0x2719b6, handler: 0x271a64,
  recordProto: 0x271a1a, recordWords: 9, subProto: 0x271a2c, subRecords: 2,
  armFrame: 0x2b6,                            // $2719D6 -- $49's is $1F3
  despawnAt: 0x2800,                          // $271A6C cmpi.w #$2800,($2,A6) -- a TRIGGER, not bounds
  damageMask: 0x5c, damageClear: 0xa3,
  palBase: 0x18, palXor: 0x19,
  killScore: 0x180,                           // $271AA8 -- $49 pays $250
  deathCue: 0x28c2dc, deathList: 0x271c30,    // EIGHT entries, ending at $4B's init
  deadMark: 0x8000, deadFlag: 0x3f,           // $271AB4 / $271ACC
  boundsBias: 0x4000, boundsLimit: 0x1c00,    // $271AE0/$271AE6 -- signed LONG, and $1C00 not $2000
  muzzleSet: 0x271c28, muzzleClear: 0x271c2c,  // read as a LONG and as a WORD PAIR
  fanEntry: 0x281764, fanD0: 0xffff000b,      // $271B7C
  fanSpread: 9, fanStep: 3, fanPasses: 7,     // $271BA0 subi.w #$9 / addq.b #3 / move.w #$6 + dbra
  ring: 0x271c08, ringMask: 0x1f, ringStep: 4,   // $271BD2 andi.w #$1F -- EIGHT entries
  drawBias: 0xee00ec00, drawD3: 0x12a0, drawStub: 0x23dece,
});

/** `$271BD8..$271C06` -- the draw. Skipped entirely once `($3F,A6)` is set. The ring index cannot go
 *  out of range: `$271BD2 andi.w #$1F` IS the bound, so unlike `$49`'s draw this needs no guard. */
function draw4A(ram, rom, a5, a6) {
  if (ram.u8(a6 + T4A.deadFlag) !== 0) return;             // $271BD8 tst.b ($3F,A6) / bne $271C06
  enqueueRegistersThroughStub(ram, rom, T4A.drawStub,
    u32(ram.u32(a6 + 0x02) + T4A.drawBias),                // $271BEC/$271BF0 addi.l #-$11FF1400
    rom.u32(T4A.ring + u16(ram.u16(a5 + 0x1c))),           // $271BE0..$271BEA
    T4A.drawD3,                                            // $271BF6 move.w #$12A0,D3
    ram.u16(a6 + 0x1c));                                   // $271BFC move.w ($1C,A6),D4
}

/** `$271AB4..$271AD2` -- the retirement, reached BOTH from the death test and from the `$2800` despawn
 *  trigger at `$271A7A`. It marks and does NOT free; see the header. */
function retire4A(ram, rom, a5, a6, ctx) {
  ram.setU16(a6, T4A.deadMark);                            // $271AB4 move.w #$8000,(A6)
  walkDeathSpawns270D92(ram, rom, ctx, T4A.deathList,
    ram.u32(a6 + 0x02), 0x271ac2);                         // $271AB8/$271AC2
  ctx.soundPost?.(T4A.deathCue);                           // $271AC6
  ram.setU8(a6 + T4A.deadFlag, 1);                         // $271ACC move.b #$1,($3F,A6)
}

/** `$271B3E..$271BBC` -- SEVEN aimed shots at 3-unit spacing, then the centre drifts.
 *
 *  `move.w #$6,D7` + `dbra` is SEVEN passes (`dbra` branches while the counter is not -1), so with
 *  `subi.w #$9` first and `addq.b #3` after each the headings are centre-9,-6,-3,0,+3,+6,+9. Six or
 *  eight would both look plausible on screen.
 *
 *  The muzzle longword is read TWO WAYS: as a pair of words to bias the aim inputs (`$271B58`), and as
 *  one longword to bias the bullet position (`$271B9A`). Same four bytes. */
function fire4A(ram, rom, a5, a6, ctx) {
  const set = ram.u8(a5 + 0x17) !== 0;
  const muzzle = set ? T4A.muzzleSet : T4A.muzzleClear;     // $271B3E..$271B50 / $271B86..$271B98
  // $271B52 movem.w ($2,A6),D0-D1 -- movem.w into DATA registers SIGN-EXTENDS each word.
  const y = i16(ram.u16(a6 + 0x02)), x = i16(ram.u16(a6 + 0x04));
  const selfY = u16(y + rom.u16(muzzle));                  // $271B58 add.w (A1),D0
  const selfX = u16(x + rom.u16(muzzle + 2));               // $271B5A add.w ($2,A1),D1
  const aimed = aim256FromCaller(aimTables(rom), ram, a5, selfY, selfX);   // $271B5E jsr $24226E
  // **W323's TRAP, AND `$4A` WALKS STRAIGHT INTO IT.** On no live target `$24226E` returns through
  // `$242264`, a bare `rts` that leaves D1 UNCHANGED -- so D1 still holds the biased X from `$271B5A`
  // and `$271B64` stores THAT as the aim. There is no `bcs` here to skip the store. Transcribed as the
  // ROM behaves; inventing a guard is what W323 had to undo.
  ram.setU8(a5 + 0x20, (aimed.carry ? selfX : aimed.dir) & 0xff);   // $271B64 move.b D1,($20,A5)

  if (!due8(ram, a5 + 0x26)) return;                       // $271B68 subq.b #1,($26,A5) / bcc
  ram.setU8(a5 + 0x26, ram.u8(a5 + 0x27));                 // $271B70
  ram.setU8(a5 + 0x24, ram.u8(a5 + 0x25));                 // $271B38 -- reached via $271B22's gate

  let d1 = u16(ram.u8(a5 + 0x20) - T4A.fanSpread);         // $271B78/$271BA0 subi.w #$9
  const d2 = u32(ram.u32(a6 + 0x02) + rom.u32(muzzle));    // $271B9A add.l (A1),D2 -- ONE longword
  for (let n = 0; n < T4A.fanPasses; n++) {                // $271BA4 move.w #$6,D7 + dbra = SEVEN
    const res = fireBullet({ ram, rom, log: new WriteLog(ram) }, T4A.fanEntry,
      { d0: T4A.fanD0, d1, d2, d3: 0, d4: 0, d5: 0, a5 });
    ctx.bulletSpawn?.(0x271ba8, res);
    d1 = u16(d1 + T4A.fanStep);                            // $271BAE addq.b #3,D1
  }
  // $271BB4 -- the fan's CENTRE drifts by ($22,A5) every volley, which is why ($20,A5) is state.
  ram.setU8(a5 + 0x20, u16(ram.u8(a5 + 0x20) + ram.u8(a5 + 0x22)) & 0xff);
  ram.setU8(a5 + 0x24, u16(ram.u8(a5 + 0x24) - 1) & 0xff); // $271BBC subq.b #1,($24,A5)
}

function handler4A(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  // $271A64 -- THE MARK IS THE FIRST THING TESTED. There is no stepMovement call in this type.
  if (ram.u8(a6 + T4A.deadFlag) === 0) {                   // tst.b ($3F,A6) / bne $271AD2
    // $271A6C -- a POSITION TRIGGER, not the off-screen test; the real bounds test is below.
    let retired = false;
    if (i16(ram.u16(a6 + 0x02)) <= T4A.despawnAt && ram.u8(a5 + 0x16) !== 0) {
      retire4A(ram, rom, a5, a6, ctx);                     // $271A7A bne $271AB4
      retired = true;
    }
    if (!retired) {
      const hit = ram.u8(a6) & T4A.damageMask;             // $271A7E moveq #$5C,D1 / and.b (A6),D1
      if (hit !== 0) {
        ram.setU8(a6, ram.u8(a6) & T4A.damageClear);       // $271A86
        scoreHit(ram, ctx, a6, hit);                       // $271A8C jsr $286096
        ram.setU8(a6 + 0x1d,
          (ram.u8(a6 + 0x1d) ^ ram.u8(a5 + T4A.palXor)) & 0xff);   // $271A92..$271A9C
        if ((ram.u16(a6 + 0x18) & 0x8000) !== 0) {         // $271AA0 tst.w ($18,A6) / bpl
          scoreKill(ram, rom, ctx, T4A.killScore, hit);    // $271AA8 move.l #$180,D0
          retire4A(ram, rom, a5, a6, ctx);
        } else {
          ram.setU8(a6 + 0x1d, ram.u8(a5 + T4A.palBase));  // $271AD2 -- the fall-through
        }
      } else {
        ram.setU8(a6 + 0x1d, ram.u8(a5 + T4A.palBase));    // $271AD2
      }
    }
  }

  // $271AD8..$271B00 -- the REAL off-screen test: signed LONG, limit $1C00 (not $49's $2000). This
  // runs even for a marked record, which is what eventually collects it.
  const y = i32(i16(ram.u16(a6 + 0x02)) + T4A.boundsBias);
  if (y <= T4A.boundsLimit) {
    if (ram.u8(a5 + 0x16) !== 0) { freeEnemy(ram, a5); return; }   // $271AF8 jmp $263762
  } else {
    ram.setU8(a5 + 0x16, 1);                               // $271B00
  }

  // $271B06 -- THE FREEZE SKIPS TO THE DRAW, so the ring does NOT advance. $49's freeze branches INTO
  // its counter step and keeps sweeping. Opposite behaviour from the same idiom: do not unify them.
  if (ram.u16(G.freeze) !== 0) { draw4A(ram, rom, a5, a6); return; }
  scrollCompensate(ram, a5);                           // $271B10 jsr $24179E
  // $271B16 `jsr $2714AE` is OMITTED: $2714AE is a bare `rts` and both of its callers target it, so
  // the body at $2714B0 has no reachable entry point in this build (W336). Porting that body would
  // add spawns the board does not make.
  if (ram.u8(a6 + T4A.deadFlag) === 0 && ram.u8(a5 + 0x24) === 0) {   // $271B1A / $271B22
    if (due8(ram, a5 + 0x1e)) {                            // $271B2A subq.b #1,($1E,A5) / bcc
      ram.setU8(a5 + 0x1e, ram.u8(a5 + 0x1f));             // $271B32
      fire4A(ram, rom, a5, a6, ctx);
    }
  } else if (ram.u8(a6 + T4A.deadFlag) === 0) {
    fire4A(ram, rom, a5, a6, ctx);                         // $271B26 bne $271B3E -- straight to the aim
  }

  // $271BC0 -- the animation counter, and the ring is masked rather than compared.
  if (due8(ram, a5 + 0x1a)) {                              // subq.b #1,($1A,A5) / bcc $271BD8
    ram.setU8(a5 + 0x1a, ram.u8(a5 + 0x1b));               // $271BC8
    ram.setU16(a5 + 0x1c,
      u16(ram.u16(a5 + 0x1c) + T4A.ringStep) & T4A.ringMask);   // $271BCE/$271BD2 andi.w #$1F
  }
  draw4A(ram, rom, a5, a6);                                // $271BD8
}

// ============================================================ TYPE $4B (W338)
//
// The last of the `$48`/`$49`/`$4A`/`$4B` band. `$271C92` init / `$271C9A` initBody / `$271D48` handler.
//
// **THE AXES OF DIVERGENCE DO NOT LINE UP TYPE BY TYPE**, which is the band's real lesson. `$4B` takes
// `$49`'s side on the lifetime (it frees itself; `$4A` marks and continues) and on the sweep length
// (thirty via `cmpi.w #$78`; `$4A` uses an eight-entry `andi.w #$1F`), but `$4A`'s side on the freeze
// (skip the counter step; `$49`'s freeze runs INTO it). And it agrees with neither on the constants:
//
//                        $49          $4A          $4B
//     off-screen limit   $2000        $1C00        $400
//     kill score         $250         $180         $290
//     flag offset        ($20,A5)     none         ($26,A5)
//     flag words         E0/E4        none         E2/E6
//     ($17,A5) polarity  SET = first  n/a          SET = SECOND, and mirrors
//     shots              3            7 (dbra)     4, hand-written, asymmetric
//
// So nothing here is inheritable except the instruction sequences themselves.
const T4B = Object.freeze({
  init: 0x271c92, initBody: 0x271c9a, handler: 0x271d48,
  recordProto: 0x271d18, recordWords: 10, subProto: 0x271d2c,
  damageMask: 0x5c, damageClear: 0xa3, palBase: 0x18, palXor: 0x19,
  killScore: 0x290, deathCue: 0x28c2dc, deathList: 0x271f20,   // SIX entries
  flagAt: 0x26,                               // ($26,A5) -- NOT $49's ($20,A5)
  boundsBias: 0x4000, boundsLimit: 0x400,     // $271DAE/$271DB4 -- signed LONG, limit $400
  sweepClear: 0x271fe2, sweepSet: 0x27201e,   // index ASR 1; SET also MIRRORS
  muzzleTable: 0x271f6a, drawTable: 0x271ea8,  // index RAW
  sweepStep: 4, sweepWrap: 0x78, sweepEntries: 30,
  drawBias: 0xe200ea00, drawD3: 0x1eb0, drawStub: 0x23dece,
});

/** `$271E80..$271EA6` -- the draw. Reached on EVERY path, including both early-outs. */
function draw4B(ram, rom, a5, a6) {
  const idx = u16(ram.u16(a5 + 0x1c));
  if (idx >= T4B.sweepEntries * 4) {
    unreached(0x271e80, `type $4B's draw index ($1C,A5) is $${idx.toString(16)}, past the 30 longwords `
      + `at $271EA8; $271DFC's wrap at $78 is the only thing that bounds it`);
  }
  enqueueRegistersThroughStub(ram, rom, T4B.drawStub,
    u32(ram.u32(a6 + 0x02) + T4B.drawBias),                // $271E8C/$271E90 addi.l #-$1DFF1600
    rom.u32(T4B.drawTable + idx),                          // $271E80..$271E8A
    T4B.drawD3,                                            // $271E96 move.w #$1EB0,D3
    ram.u16(a6 + 0x1c));                                   // $271E9C move.w ($1C,A6),D4
}

/** `$271E0C..$271E7E` -- FOUR shots, hand-written and asymmetric.
 *
 *  D1 walks base, base+2, base-2, base+1 through three separate `addq`/`subq`s, and D0 changes for
 *  shots 1, 2 and 4 while **shot 3 REUSES shot 2's** -- legitimate only because W336 measured that the
 *  `$2817C2` family preserves D1..D4. `$49` spells this as three shots and `$4A` as a seven-pass
 *  `dbra`; all three types differ. */
function fire4B(ram, rom, a5, a6, ctx) {
  const idx = u16(ram.u16(a5 + 0x1c));
  if (idx >= T4B.sweepEntries * 4) {
    unreached(0x271e0c, `type $4B's sweep index ($1C,A5) is $${idx.toString(16)}, past 30 entries`);
  }
  let d3 = rom.u32(T4B.muzzleTable + idx);                 // $271E16 move.l (A1),D3
  const set = ram.u8(a5 + 0x17) !== 0;
  // $271E22 tst.b ($17,A5) / beq -- **THE POLARITY IS THE OPPOSITE OF $49's.** CLEAR keeps the FIRST
  // table and does NOT negate; SET takes the second AND mirrors. `neg.w` is a WORD negate on a long,
  // so the low half flips with no borrow, and the `add.l` below does carry out of it.
  const table = set ? T4B.sweepSet : T4B.sweepClear;
  if (set) d3 = ((d3 & 0xffff0000) | u16(-(d3 & 0xffff))) >>> 0;   // $271E30 neg.w D3
  const d1 = rom.u16(table + (idx >> 1));                  // $271E32..$271E3A asr.w #1 / move.w (A1),D1
  const d2 = u32(ram.u32(a6 + 0x02) + d3);                 // $271E3C add.l D3,D2

  let d = d1;
  for (const [site, entry, d0, step] of [
    [0x271e48, 0x281744, 0x00010003, 2],                   // $271E42 / then addq.w #2,D1
    [0x271e56, 0x2816f6, 0xfffd0004, -4],                  // $271E4E / then subq.w #4,D1
    [0x271e5e, 0x2816f6, null, 3],                         // $271E5C -- D0 INHERITED from shot 2
    [0x271e6c, 0x2816f6, 0xfff90005, 0],                   // $271E66
  ]) {
    const useD0 = d0 ?? 0xfffd0004;                        // shot 3's inherited D0, named not guessed
    const res = fireBullet({ ram, rom, log: new WriteLog(ram) }, entry,
      { d0: useD0, d1: d, d2, d3: 0, d4: 0, d5: 0, a5 });
    ctx.bulletSpawn?.(site, res);
    d = u16(d + step);
  }
  ram.setU8(a5 + 0x25, (ram.u8(a5 + 0x25) + 1) & 0x01);    // $271E72 addq.b #1 / andi.b #$1 -- a TOGGLE
  // $271E7C subq.b #1,($22,A5) -- the flags it sets are never read (a `lea` follows). A plain
  // decrement, NOT a gate; inventing a branch here would be the $2716D8 mistake in reverse.
  ram.setU8(a5 + 0x22, u16(ram.u8(a5 + 0x22) - 1) & 0xff);
}

function handler4B(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  const clearFlagAndFree = () => {
    ram.setU16(ram.u32(a5 + T4B.flagAt), 0);               // movea.l ($26,A5),A0 / clr.w (A0)
    freeEnemy(ram, a5);
  };

  // $271D48..$271D9E -- the SIMPLE $5C damage arm, the band's shape. No hpFull, no palette decision.
  const hit = ram.u8(a6) & T4B.damageMask;
  if (hit !== 0) {
    ram.setU8(a6, ram.u8(a6) & T4B.damageClear);           // $271D50
    scoreHit(ram, ctx, a6, hit);                           // $271D56 jsr $286096
    ram.setU8(a6 + 0x1d,
      (ram.u8(a6 + 0x1d) ^ ram.u8(a5 + T4B.palXor)) & 0xff);   // $271D5C..$271D66
    if ((ram.u16(a6 + 0x18) & 0x8000) !== 0) {             // $271D6A tst.w ($18,A6) / bpl
      scoreKill(ram, rom, ctx, T4B.killScore, hit);        // $271D72 move.l #$290,D0
      walkDeathSpawns270D92(ram, rom, ctx, T4B.deathList,
        ram.u32(a6 + 0x02), 0x271d88);                     // $271D7E/$271D88 -- SIX entries
      ctx.soundPost?.(T4B.deathCue);                       // $271D8C
      clearFlagAndFree();                                  // $271D92/$271D98 -- IT DOES FREE
      return;
    }
  } else {
    ram.setU8(a6 + 0x1d, ram.u8(a5 + T4B.palBase));        // $271DA0 -- the not-hit path
  }

  // $271DA6..$271DD8 -- the off-screen test: signed LONG, limit $400 (the band's third value).
  const y = i32(i16(ram.u16(a6 + 0x02)) + T4B.boundsBias);
  if (y <= T4B.boundsLimit) {
    if (ram.u8(a5 + 0x16) !== 0) { clearFlagAndFree(); return; }   // $271DC6 -- flag cleared here too
  } else {
    ram.setU8(a5 + 0x16, 1);                               // $271DD4
  }

  // $271DDA -- the freeze branches to $271E80, THE DRAW, so the sweep counter does NOT advance. This
  // is $4A's behaviour, not $49's, whose freeze runs into its counter step. Same idiom, and the band
  // does not agree on it.
  if (ram.u16(G.freeze) !== 0) { draw4B(ram, rom, a5, a6); return; }   // $271DE0 bne $271E80
  scrollCompensate(ram, a5);                           // $271DE4 jsr $24179E
  if (due8(ram, a5 + 0x1a)) {                              // $271DEA subq.b #1 / bcc $271E80
    ram.setU8(a5 + 0x1a, ram.u8(a5 + 0x1b));               // $271DF2
    const next = u16(ram.u16(a5 + 0x1c) + T4B.sweepStep);   // $271DF8 addq.w #4
    ram.setU16(a5 + 0x1c, next < T4B.sweepWrap ? next : 0);  // $271DFC cmpi.w #$78 / blt
    fire4B(ram, rom, a5, a6, ctx);
  }
  draw4B(ram, rom, a5, a6);                                // $271E80
}

// ============================================================ TYPE $48 (W339)
//
// The last member of the `$48`/`$49`/`$4A`/`$4B` band. `$271284` init / `$27128C` initBody / `$27133A`
// handler. Structurally `$4A`'s twin and behaviourally its own animal:
//
//   * **IT HAS NO FREEZE GATE AT ALL.** `$49`, `$4A` and `$4B` each test `$8130D2` (or `$8130D4`) before
//     firing. `$48` runs straight from `$2713CE` into `$24179E` and the fire arm. Do not add one.
//   * **ITS `$2800` TRIGGER HAS NO `($16,A5)` GUARD**, where `$4A`'s does -- so `$48` can retire before it
//     has ever been on screen. A MISSING instruction, which is harder to notice than a changed constant.
//   * FIVE shots at 5-unit spacing (`move.w #$4,D7` + `dbra` = FIVE passes, `subi.w #$A`, `addq.b #5`)
//     through `$281744`, where `$4A` fires SEVEN at 3 through `$281764`. Four of five loop parameters
//     differ between the twins.
//   * its draw is a `bsr` to `$271510`, the only member to factor it out.
//
// It DOES share `$4A`'s three `($3F,A6)` tests (head, pre-fire, pre-draw), its `$8000` mark, its
// eight-entry `andi.w #$1F` ring, its `movem.w` sign-extension and its `($17,A5)` polarity.
const T48 = Object.freeze({
  init: 0x271284, initBody: 0x27128c, handler: 0x27133a,
  recordProto: 0x2712f0, recordWords: 9, subProto: 0x271302, subRecords: 2,
  damageMask: 0x5c, damageClear: 0xa3, palBase: 0x18, palXor: 0x19,
  killScore: 0x130, deathCue: 0x28c2dc, deathList: 0x271558,   // FIVE entries
  deadMark: 0x8000, deadFlag: 0x3f,
  despawnAt: 0x2800,                          // $271342 -- ble, and NO ($16,A5) guard
  boundsBias: 0x4000, boundsLimit: 0x2c00,    // $2713AE/$2713B4 -- a FOURTH limit
  muzzleSet: 0x271596, muzzleClear: 0x27159a,  // read as a WORD PAIR and as a LONG
  fanEntry: 0x281744, fanD0: 0xfffe000b,       // $271444 -- $4A's is $FFFF000B
  fanSpread: 0xa, fanStep: 5, fanPasses: 5,    // $271468/$271476/$27146C -- #$4 + dbra = FIVE
  ring: 0x271538, ringMask: 0x1f, ringStep: 4,
  drawBias: 0xf600f600, drawD3: 0x0a50, drawStub: 0x23dece,
});

/** `$271510..$271536` -- the draw, a `bsr` target rather than inline code. */
function draw48(ram, rom, a5, a6) {
  enqueueRegistersThroughStub(ram, rom, T48.drawStub,
    u32(ram.u32(a6 + 0x02) + T48.drawBias),                // $27151C/$271520 addi.l #-$9FF0A00
    rom.u32(T48.ring + u16(ram.u16(a5 + 0x1c))),           // $271510..$27151A, index RAW
    T48.drawD3,                                            // $271526 move.w #$A50,D3
    ram.u16(a6 + 0x1c));                                   // $27152C move.w ($1C,A6),D4
}

/** `$271382..$27139E` -- the retirement. Marks and does NOT free, as `$4A`. Reached from the death test
 *  AND from the unguarded `$2800` trigger. */
function retire48(ram, rom, a5, a6, ctx) {
  ram.setU16(a6, T48.deadMark);                            // $271382 move.w #$8000,(A6)
  walkDeathSpawns270D92(ram, rom, ctx, T48.deathList,
    ram.u32(a6 + 0x02), 0x271390);                         // $271386/$271390 -- FIVE entries
  ctx.soundPost?.(T48.deathCue);                           // $271394
  ram.setU8(a6 + T48.deadFlag, 1);                         // $27139A move.b #$1,($3F,A6)
}

/** `$271402..$271486` -- FIVE aimed shots at 5-unit spacing, then the centre drifts.
 *
 *  `move.w #$4,D7` + `dbra` is FIVE passes; with `subi.w #$A` first and `addq.b #5` after each, the
 *  headings are centre-10, -5, 0, +5, +10. `$4A`'s same-shaped loop is SEVEN at 3 through a different
 *  spawner -- four of the five parameters differ. */
function fire48(ram, rom, a5, a6, ctx) {
  const set = ram.u8(a5 + 0x17) !== 0;
  const muzzle = set ? T48.muzzleSet : T48.muzzleClear;     // $271402..$271460, $4A's polarity
  // $271416 movem.w ($2,A6),D0-D1 -- SIGN-EXTENDS each word into its register.
  const y = i16(ram.u16(a6 + 0x02)), x = i16(ram.u16(a6 + 0x04));
  const selfY = u16(y + rom.u16(muzzle));                  // $27141C add.w (A1),D0
  const selfX = u16(x + rom.u16(muzzle + 2));               // $27141E add.w ($2,A1),D1
  const aimed = aim256FromCaller(aimTables(rom), ram, a5, selfY, selfX);   // $271422 jsr $24226E
  // W323's trap, as $4A: on no live target `$242264` is a bare `rts` leaving D1 holding the biased X, and
  // there is no `bcs` before the store. Transcribed rather than guarded.
  ram.setU8(a5 + 0x20, (aimed.carry ? selfX : aimed.dir) & 0xff);   // $27142C move.b D1,($20,A5)

  if (!due8(ram, a5 + 0x26)) return;                       // $271430 subq.b #1,($26,A5) / bcc
  ram.setU8(a5 + 0x26, ram.u8(a5 + 0x27));                 // $271438

  let d1 = u16(ram.u8(a5 + 0x20) - T48.fanSpread);          // $27143E/$271468 subi.w #$A
  const d2 = u32(ram.u32(a6 + 0x02) + rom.u32(muzzle));    // $271462 add.l (A1),D2 -- the SAME four bytes
  for (let n = 0; n < T48.fanPasses; n++) {                // $27146C move.w #$4,D7 + dbra = FIVE
    const res = fireBullet({ ram, rom, log: new WriteLog(ram) }, T48.fanEntry,
      { d0: T48.fanD0, d1, d2, d3: 0, d4: 0, d5: 0, a5 });
    ctx.bulletSpawn?.(0x271470, res);
    d1 = u16(d1 + T48.fanStep);                            // $271476 addq.b #5,D1
  }
  ram.setU8(a5 + 0x20,
    u16(ram.u8(a5 + 0x20) + ram.u8(a5 + 0x22)) & 0xff);    // $27147C -- the centre DRIFTS
  ram.setU8(a5 + 0x24, u16(ram.u8(a5 + 0x24) - 1) & 0xff);  // $271484 subq.b #1,($24,A5)
}

function handler48(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  // $27133A -- the mark is tested at instruction one, as $4A. No stepMovement anywhere in this type.
  if (ram.u8(a6 + T48.deadFlag) === 0) {
    // $271342 cmpi.w #$2800,($2,A6) / ble $271382 -- **NO ($16,A5) GUARD**, unlike $4A. This retires the
    // record on position alone, potentially before it has ever been on screen.
    if (i16(ram.u16(a6 + 0x02)) <= T48.despawnAt) {
      retire48(ram, rom, a5, a6, ctx);
    } else {
      const hit = ram.u8(a6) & T48.damageMask;             // $27134C moveq #$5C,D1 / and.b (A6),D1
      if (hit !== 0) {
        ram.setU8(a6, ram.u8(a6) & T48.damageClear);       // $271354
        scoreHit(ram, ctx, a6, hit);                       // $27135A jsr $286096
        ram.setU8(a6 + 0x1d,
          (ram.u8(a6 + 0x1d) ^ ram.u8(a5 + T48.palXor)) & 0xff);   // $271360..$27136A
        if ((ram.u16(a6 + 0x18) & 0x8000) !== 0) {         // $27136E tst.w ($18,A6) / bpl
          scoreKill(ram, rom, ctx, T48.killScore, hit);    // $271376 move.l #$130,D0
          retire48(ram, rom, a5, a6, ctx);
        } else {
          ram.setU8(a6 + 0x1d, ram.u8(a5 + T48.palBase));  // $2713A0
        }
      } else {
        ram.setU8(a6 + 0x1d, ram.u8(a5 + T48.palBase));    // $2713A0
      }
    }
  }

  // $2713A6..$2713CE -- the off-screen test: signed LONG, limit $2C00 (the band's FOURTH value).
  const yy = i32(i16(ram.u16(a6 + 0x02)) + T48.boundsBias);
  if (yy <= T48.boundsLimit) {
    if (ram.u8(a5 + 0x16) !== 0) { freeEnemy(ram, a5); return; }   // $2713C6 jmp $263762
  } else {
    ram.setU8(a5 + 0x16, 1);                               // $2713CE
  }

  // **NO FREEZE TEST HERE.** $2713CE falls straight into $2713D4. Its three siblings all gate on
  // $8130D2/$8130D4 at this point and $48 does not; adding one would silence a fan the board keeps firing.
  scrollCompensate(ram, a5);                           // $2713D4 jsr $24179E
  // $2713DA `bsr $2714AE` is OMITTED: $2714AE is a bare `rts` sitting between this handler and the
  // Version-B-disabled body at $2714B0 (W336/W338). Both of its callers target the stub.
  if (ram.u8(a6 + T48.deadFlag) === 0) {                    // $2713DE tst.b ($3F,A6) / bne $271488
    if (ram.u8(a5 + 0x24) !== 0) {                          // $2713E6 tst.b ($24,A5) / bne $271402
      fire48(ram, rom, a5, a6, ctx);
    } else if (due8(ram, a5 + 0x1e)) {                      // $2713EE subq.b #1,($1E,A5) / bcc
      ram.setU8(a5 + 0x1e, ram.u8(a5 + 0x1f));              // $2713F6
      ram.setU8(a5 + 0x24, ram.u8(a5 + 0x25));              // $2713FC
      fire48(ram, rom, a5, a6, ctx);
    }
  }

  // $271488 -- the animation counter, and the ring is MASKED rather than compared, as $4A.
  if (due8(ram, a5 + 0x1a)) {
    ram.setU8(a5 + 0x1a, ram.u8(a5 + 0x1b));               // $271490
    ram.setU16(a5 + 0x1c,
      u16(ram.u16(a5 + 0x1c) + T48.ringStep) & T48.ringMask);   // $271496/$27149A andi.w #$1F
  }
  // $2714A0 -- the THIRD ($3F,A6) test: a marked $48 does not draw either.
  if (ram.u8(a6 + T48.deadFlag) === 0) draw48(ram, rom, a5, a6);   // $2714A8 bsr $271510
}

// ============================================================ TYPE $47 (W340)
//
// Stage 5's SCROLL-STOPPING SET-PIECE, `$E2` records. `$26D6EE` init / `$26D6F6` initBody / `$26D7D0`
// handler. It is NOT a band member and nothing about `$48`/`$49`/`$4A`/`$4B` transfers to it. The
// load-bearing traps, all documented at length in NEXT_AGENT_HANDOFF.md:
//
//   * `($18,A6)` IS A PER-FRAME DAMAGE SINK, NOT HP. Real HP is a LONG at `($32,A5)`. Reading `($18,A6)`
//     as HP -- which is what all four band members do -- makes `$47` immortal.
//   * `+$7E` and `+$7F` are ADJACENT FLAGS WITH DIFFERENT ROLES: `($7F,A6)` = "dying", `($7E,A6)` =
//     "retire me now". Swapping them makes it immortal or instantly gone.
//   * THREE countdown conventions appear, two of them inside `$26DC00`: `subq.b`/`bpl` runs NEGATIVE
//     (thresholds -2/-3) and `subq.w`/`beq` fires AT ZERO. Neither is `due8`.
//   * the palette bank is REINSTALLED EVERY FRAME (`$26D7D0`), not just at init.
//   * the draw has NO table index -- `move.l (A0),D2` with no `adda.w`, so entry 0 always.
//   * rank scaling is a bullet-type INTERLEAVE, not more bullets.
const T47 = Object.freeze({
  init: 0x26d6ee, initBody: 0x26d6f6, handler: 0x26d7d0,
  recordProto: 0x26d740, recordWords: 16, subProto: 0x26d760, subRecords: 4,
  palBank: 0x10, palSrc: 0x224f38,            // reinstalled EVERY FRAME at $26D7D0
  aliveGlobal: 0x8130dc,                       // set by the init, cleared by all three exits
  retireFlag: 0x7e, deadFlag: 0x7f,            // ADJACENT, DIFFERENT ROLES
  damageMask: 0x5c, damageClear: 0xa3,
  palXorLiteral: 0x0f, palRestore: 0x10,       // $26D82C eori.b #$F / $26D892 move.b #$10
  hitMaskAt: 0x6e,                             // $26D81E -- consumed ONLY by $26DCB6
  sinkFull: 0x7fff, hpLong: 0x32,              // the $7FFF sink over a LONG accumulator
  killScore: 0x600, deathCue: 0x28c310,        // $26D850 / $26D88C -- not the band's $28C2DC
  deathList: 0x26dcec, deathAnim: 0x10,        // walked by $26C74E: FOURTEEN entries, ($1E,A0) = $10
  boundsBias: 0x4000, boundsLimit: 0x800,      // a FIFTH limit value
  scrollPush: 0x20,                            // pushExternalSpeed(D0 = D1 = $20) on BOTH exits
  drawTable: 0x26daf4, drawBias: 0xe400ea00, drawD3: 0x1cb0, drawStub: 0x23dece,
  rampStep: 4, rampClamp: 0x1c,                // $26D910 -- CLAMPED at $1C, not wrapped
});

/** `$26DAC8..$26DAF2` -- the draw. **NO TABLE INDEX**: `$26DAD6 move.l (A0),D2` has no `adda.w`, so the
 *  main draw always uses entry 0. The other seven entries are reached by the private subroutines. And D4
 *  comes from the PALETTE byte `($1D,A6)`, where every band member uses `($1C,A6)`. */
function draw47(ram, rom, a5, a6) {
  if (ram.u8(a6 + T47.deadFlag) !== 0) return;             // $26DAC8 tst.b ($7F,A6) / bne -> rts
  enqueueRegistersThroughStub(ram, rom, T47.drawStub,
    u32(ram.u32(a6 + 0x02) + T47.drawBias),                // $26DAD8/$26DADC addi.l #-$1BFF1600
    rom.u32(T47.drawTable),                                // $26DAD6 move.l (A0),D2 -- ENTRY 0, no index
    T47.drawD3,                                            // $26DAE2 move.w #$1CB0,D3
    ram.u8(a6 + 0x1d));                                    // $26DAE8 move.b ($1D,A6),D4 -- the PALETTE
}

/** `$26D85C..$26D89A` -- the retirement. Marks and does NOT free; `$26DCB6` later sets `($7E,A6)` and the
 *  handler's own `$26D7EA` arm does the freeing. Pushes the scroll stop a SECOND time. */
function retire47(ram, rom, a5, a6, ctx) {
  pushExternalSpeed(ram, T47.scrollPush, T47.scrollPush);   // $26D85C..$26D864 jsr $261100
  ram.setU16(a6, 0x8000);                                  // $26D86A move.w #$8000,(A6)
  ram.setU8(a6 + T47.deadFlag, 1);                         // $26D86E move.b #$1,($7F,A6)
  ram.setU16(T47.aliveGlobal, 0);                          // $26D874
  walkDeathSpawns270D92(ram, rom, ctx, T47.deathList,
    ram.u32(a6 + 0x02), 0x26d886, T47.deathAnim);          // $26D880/$26D886 jsr $26C74E
  ctx.soundPost?.(T47.deathCue);                           // $26D88C jsr $28C310
}

function handler47(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  // $26D7D0 -- **THE PALETTE IS REINSTALLED EVERY FRAME**, byte-for-byte the init's three instructions.
  // Something else in stage 5 overwrites bank $10 and this repaint is what keeps it correct.
  installPaletteBank47(ram, rom, ctx, a5);

  if (ram.u32(G.freeze) !== 0) { draw47(ram, rom, a5, a6); return; }   // $26D7E0 tst.w $8130D2 / bne
  // $26D7EA -- the retirement trigger $26DCB6 sets. NOT the same byte as the dying flag at +$7F.
  if (ram.u8(a6 + T47.retireFlag) !== 0) {
    ram.setU16(T47.aliveGlobal, 0);                        // $26D7F2
    pushExternalSpeed(ram, T47.scrollPush, T47.scrollPush);  // $26D7FA..$26D802 jsr $261100
    freeEnemy(ram, a5);                                    // $26D808 jmp $263762
    return;
  }

  // $26D810..$26D89A -- the damage arm. `($18,A6)` IS A SINK: the damage taken this frame is
  // `$7FFF - ($18,A6)`, subtracted from the LONG at `($32,A5)`, and the sink is re-armed to `$7FFF`.
  const hit = ram.u8(a6) & T47.damageMask;                 // $26D810 moveq #$5C,D1 / and.b (A6),D1
  if (hit !== 0) {
    ram.setU8(a6, ram.u8(a6) & T47.damageClear);           // $26D818
    ram.setU16(a6 + T47.hitMaskAt, hit);                   // $26D81E -- consumed ONLY by $26DCB6
    scoreHit(ram, ctx, a6, hit);                           // $26D822 jsr $286096
    ram.setU8(a6 + 0x1d,
      (ram.u8(a6 + 0x1d) ^ T47.palXorLiteral) & 0xff);     // $26D82C eori.b #$F -- a LITERAL
    const taken = u16(T47.sinkFull - ram.u16(a6 + 0x18));  // $26D834/$26D83A move.l #$7FFF / sub.w
    ram.setU32(a5 + T47.hpLong, u32(ram.u32(a5 + T47.hpLong) - taken));   // $26D83E sub.l D0,($32,A5)
    ram.setU16(a6 + 0x18, T47.sinkFull);                   // $26D842 -- RE-ARM the sink
    if ((ram.u32(a5 + T47.hpLong) & 0x80000000) !== 0) {   // $26D848 tst.l ($32,A5) / bpl
      scoreKill(ram, rom, ctx, T47.killScore, hit);        // $26D850 move.l #$600,D0
      retire47(ram, rom, a5, a6, ctx);
    }
  } else {
    ram.setU8(a6 + 0x1d, T47.palRestore);                  // $26D892 move.b #$10 -- a LITERAL, not ($18,A5)
  }

  // $26D89C..$26D8D0 -- the off-screen test: signed LONG, limit $800 (a FIFTH value). Its exit ALSO
  // clears the global, so all three exits maintain $8130DC.
  const y = i32(i16(ram.u16(a6 + 0x02)) + T47.boundsBias);
  if (y <= T47.boundsLimit) {
    if (ram.u8(a5 + 0x16) !== 0) {                         // $26D8B4 tst.b ($16,A5) / beq
      ram.setU16(T47.aliveGlobal, 0);                      // $26D8BC
      freeEnemy(ram, a5);                                  // $26D8C4 jmp $263762
      return;
    }
  } else {
    ram.setU8(a5 + 0x16, 1);                               // $26D8CC
  }

  scrollCompensate(ram, a5);                           // $26D8D2 jsr $24179E
  if (ram.u8(a6 + T47.deadFlag) !== 0) { draw47(ram, rom, a5, a6); return; }   // $26D8D8 bne $26DAC8

  // $26D8E0 -- ($17,A5) IS A STATE NUMBER HERE, not the band's mirror flag, and ($1C,A5) is a WORD
  // countdown, not a sweep index. The state-2/3 machinery past this point is not yet transcribed.
  if (ram.u8(a5 + 0x17) === 0) {                           // $26D8E0 cmpi.b #$0,($17,A5) / bne
    const next = u16(ram.u16(a5 + 0x1c) - 1);              // $26D8EA subq.w #1,($1C,A5) / bne
    ram.setU16(a5 + 0x1c, next);
    if (next === 0) ram.setU8(a5 + 0x17, 1);               // $26D8F2 move.b #$1,($17,A5)
  }
  if (ram.u8(a5 + 0x17) === 1) {                           // $26D8F8 cmpi.b #$1,($17,A5) / bne $26D976
    state1_47(ram, rom, a5, a6, ctx);
  } else {
    ctx.unported?.note(0x26d976, `$26D976 type $47 state ${ram.u8(a5 + 0x17)} -- the $8130D4-gated `
      + `five-muzzle volley ($26D98E..$26DA72), the ($2E,A5) inner machine ($26DA74..$26DAC6) and its `
      + `subroutines $26DB14/$26DC00/$26DCB6 are READ but not yet transcribed. See the $47 sections of `
      + `NEXT_AGENT_HANDOFF.md: five packed muzzle longs whose high words carry a borrow, a 60-pass `
      + `triangular dbra, a subq.b/bpl countdown that runs negative, and a rank-gated bullet-type `
      + `interleave. MEASUREMENT NEEDED: none -- this is transcription work only`);
  }
  draw47(ram, rom, a5, a6);                                // $26DAC8
}

/** `$26D902..$26D970` -- state 1: a cadence, an 8-step opening ramp CLAMPED at `$1C`, then it stops the
 *  screen shake and seeds NINE byte pairs. **Every `move.w` in that block is TWO BYTE FIELDS**, and two
 *  genuine `move.b`s sit among them, so neither reading can be applied uniformly. */
function state1_47(ram, rom, a5, a6, ctx) {
  if (!due8(ram, a5 + 0x18)) return;                       // $26D902 subq.b #1,($18,A5) / bcc
  ram.setU8(a5 + 0x18, ram.u8(a5 + 0x19));                 // $26D90A
  const idx = u16(ram.u16(a5 + 0x1a) + T47.rampStep);      // $26D910 addq.w #4
  if (idx < T47.rampClamp) { ram.setU16(a5 + 0x1a, idx); return; }   // $26D914 cmpi.w #$1C / blt
  ram.setU16(a5 + 0x1a, T47.rampClamp);                    // $26D91E -- CLAMPED, not wrapped
  ram.setU16(0x803934, 0);                                 // $26D924 -- stop the screen shake
  ram.setU16(0x803936, 0);                                 // $26D92C
  ram.setU8(a5 + 0x17, 2);                                 // $26D934 move.b #$2,($17,A5)
  // $26D93A..$26D970 -- word literals into BYTE PAIRS. `move.w #$6,($22,A5)` puts $00 at +$22 and $06
  // at +$23: the byte the literal names lands in the SECOND field.
  for (const [off, hi, lo] of [
    [0x1e, 0x10, 0x20], [0x20, 0x06, 0x06], [0x22, 0x00, 0x06],
    [0x24, 0x20, 0x30], [0x26, 0x04, 0x04], [0x28, 0x00, 0x04],
  ]) { ram.setU8(a5 + off, hi); ram.setU8(a5 + off + 1, lo); }
  ram.setU8(a5 + 0x2a, 0);                                 // $26D95E -- a GENUINE move.b
  ram.setU8(a5 + 0x2b, 0);                                 // $26D964 -- and another
  ram.setU8(a5 + 0x2c, 0x60); ram.setU8(a5 + 0x2d, 0x40);  // $26D96A move.w #$6040
}

/**
 * `$26D7D0..$26D7DE` -- and `$26D728..$26D736` in the init, byte for byte the same three
 * instructions. Both sweeps confirm it:
 *
 *     26D728  30 3c 00 10        move.w  #$10,D0        \  the INIT
 *     26D72C  41 f9 00 22 4f 38  lea     $224F38,A0     |
 *     26D732  4e b9 00 24 15 0a  jsr     $24150A        /
 *
 *     26D7D0  30 3c 00 10        move.w  #$10,D0        \  the HANDLER, every frame
 *     26D7D4  41 f9 00 22 4f 38  lea     $224F38,A0     |
 *     26D7DA  4e b9 00 24 15 0a  jsr     $24150A        /
 *
 * **W383 -- THE OLD NOTE'S STATED REASON WAS THE WHOLE BLOCKER, AND IT WAS WRONG.** It said
 * "the port's installBank lives in initbody.js and is not exported". True, and irrelevant:
 * `initbody.js`'s `installBank` is a LOCAL WRAPPER around `install24150A`, which `palette.js`
 * exports and which twelve other files already import directly (`bomb.js`, `boss2.js`,
 * `boss4.js`, `objslot15.js`, `stageend.js`, ...). Nothing here ever needed `initbody.js`.
 * `installPaletteBank47` was already being handed `rom`, and `$224F38 + $40` is inside the
 * exported window `$222A78 + $2880`, so the source read was already served too. (Trap 13.)
 *
 * The repaint is NOT redundant and the guard below does not make it optional: something else in
 * stage 5 overwrites bank $10 and this per-frame install is what keeps it correct. A chain with
 * no `PaletteState` keeps the counted note, the same way `initbody.js`'s `installBank` does.
 */
function installPaletteBank47(ram, rom, ctx, a5) {
  void a5;                                               // A5 is not read by these three instructions
  if (ctx.palette) {
    install24150A(ram, ctx.palette, T47.palBank, rom.bytes(T47.palSrc, 64), 0x26d7da,
      'type $47 per-frame bank $10 repaint');            // $26D7D0/$26D7D4/$26D7DA
  } else {
    ctx.unported?.note(0x26d7d0, `$26D7D0 type $47 reinstalls palette bank $${T47.palBank
      .toString(16)} from $${T47.palSrc.toString(16).toUpperCase()} EVERY FRAME (jsr $24150A), `
      + `byte for byte the same three instructions as its init at $26D728. No PaletteState on `
      + `this chain, so that bank stays whatever it was`);
  }
}

// ============================================================ TYPE $43 (W341)
//
// A screen-anchored three-state effect object. `$26DDA4` init / `$26DDAC` initBody / `$26DE32` handler.
//
// **IT USES TWO COUNTDOWN CONVENTIONS NINE BYTES APART, AND ONE OF THEM IS A FOURTH KIND.** `$26DE6E` is
// `subq.b` + `bcc` (underflow, what `due8` implements). `$26DE7C` decrements `($1A,A6)` and then compares
// the result against **`#$2`** -- so that transition fires when the counter reaches TWO and rests there.
// Four conventions are now attested in this ROM and three of them look identical at a glance:
//
//     subq + bcc          fire on UNDERFLOW                 due8
//     subq + bpl          run into NEGATIVES                 $26DC04 ($47)
//     subq + beq / bne    fire AT ZERO                       $26DCA2 ($47), $25354C (W29)
//     subq + cmpi #$N     fire at an ARBITRARY CONSTANT      $26DE7C, HERE
//
// **Read the instruction AFTER every `subq`, not just the branch.**
const T43 = Object.freeze({
  init: 0x26dda4, initBody: 0x26ddac, handler: 0x26de32,
  recordProto: 0x26de0c, recordWords: 5, subProto: 0x26de16,
  rampStep: 4, rampFree: 0x40, rampSpawn: 0x3c,   // EQUALITY tests, not thresholds
  spawnType: 0x44,                                 // $26DEC4 moveq #$44,D0 -> enqueueDeferred
  stage1Target: 2,                                 // $26DE7C cmpi.b #$2 -- the fourth convention
  drawTable: 0x26df00, drawEntries: 16,
  drawBiasA: 0xfc000000, drawBiasB: 0xe600e600,    // TWO sequential long biases
  drawD3: 0x1ad0, drawStub: 0x23dece,
});

/** `$26DED2..$26DEFE` -- the draw. **TWO sequential long biases**, and unlike a word pair they DO combine
 *  exactly ($E200E600); transcribed as two adds anyway so the port matches the listing line for line.
 *  D4 is the PALETTE byte `($1D,A6)`, as `$47` and unlike all four band members. `$26DEF8` is a `jmp`, not
 *  a `jsr`, so nothing follows the draw. */
function draw43(ram, rom, a5, a6) {
  const idx = u16(ram.u16(a5 + 0x1a));
  if (idx >= T43.drawEntries * 4) {
    unreached(0x26ded2, `type $43's draw index ($1A,A5) is $${idx.toString(16)}, past the 16 longwords at `
      + `$26DF00; $26DEA8's EQUALITY test against $40 is the only thing that bounds it`);
  }
  let d1 = u32(ram.u32(a6 + 0x02) + T43.drawBiasA);        // $26DEE2 subi.l #$4000000
  d1 = u32(d1 + T43.drawBiasB);                            // $26DEE8 addi.l #-$19FF1A00
  enqueueRegistersThroughStub(ram, rom, T43.drawStub, d1,
    rom.u32(T43.drawTable + idx),                          // $26DED8/$26DEDC, index RAW
    T43.drawD3,                                            // $26DEEE move.w #$1AD0,D3
    ram.u8(a6 + 0x1d));                                    // $26DEF4 move.b ($1D,A6),D4 -- the PALETTE
}

function handler43(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  if (ram.u32(G.freeze) !== 0) { draw43(ram, rom, a5, a6); return; }   // $26DE32 tst.w $8130D2 / bne

  // $26DE3C -- ($17,A5) IS A STATE NUMBER, as in $47 and unlike all four band members.
  if (ram.u8(a5 + 0x17) === 0) {
    scrollCompensate(ram, a5);                         // $26DE46 jsr $24179E
    const next = u16(ram.u16(a5 + 0x1e) - 1);               // $26DE4C subq.w #1,($1E,A5) / bne
    ram.setU16(a5 + 0x1e, next);
    if (next === 0) ram.setU8(a5 + 0x17, 1);                // $26DE54
  }
  if (ram.u8(a5 + 0x17) === 1) {
    // $26DE64 jsr $2417DE -- `applyVelocityA6` (movement.js), the freeze-gated vector application, and
    // it is the RAW form because $2417DE takes A6 directly. 62 callers in build B.
    //
    // **THIS LINE TOOK THREE ATTEMPTS AND THE FIRST TWO ARE WHY THE STANDING RULE EXISTS.** Attempt 1
    // called it ported because `grep 0x2417de` hit `machine.js:215`'s `playerMove: 0x2417de` -- an
    // address in a constant table with no consumer. Attempt 2 corrected that to "NOT ported" on the same
    // grep. Both were wrong: `movement.js:89` documents `$2417DE` in PROSE and `applyVelocityA6` is its
    // implementation, citing `$2417F2 bsr $241812` line by line. `grep 0x2417de` could never find it.
    // The rule says: grep case-insensitively for BARE HEX and read every hit INCLUDING COMMENTS.
    applyVelocityA6(ram, ctx.tables, a6);                   // $26DE64 jsr $2417DE
    if (due8(ram, a5 + 0x1c)) {                             // $26DE6A subq.b #1 / bcc -- UNDERFLOW
      ram.setU8(a5 + 0x1c, ram.u8(a5 + 0x1d));              // $26DE72
      ram.setU8(a6 + 0x1a, u16(ram.u8(a6 + 0x1a) - 1) & 0xff);   // $26DE78 subq.b #1,($1A,A6)
      // $26DE7C cmpi.b #$2 -- THE FOURTH CONVENTION. Fires at TWO, not zero, and rests at 2.
      if (ram.u8(a6 + 0x1a) === T43.stage1Target) ram.setU8(a5 + 0x17, 2);   // $26DE86
    }
  } else if (ram.u8(a5 + 0x17) === 2) {
    if (due8(ram, a5 + 0x18)) {                             // $26DE96 subq.b #1 / bcc
      ram.setU8(a5 + 0x18, ram.u8(a5 + 0x19));              // $26DE9E
      const idx = u16(ram.u16(a5 + 0x1a) + T43.rampStep);    // $26DEA4 addq.w #4,($1A,A5)
      ram.setU16(a5 + 0x1a, idx);
      // $26DEA8 cmpi.w #$40 / bne -- an EQUALITY. Step 4 from 0 hits $40 exactly, so `===` is faithful
      // and `>=` would be a different program under any later edit ($1F3, W335).
      if (idx === T43.rampFree) { freeEnemy(ram, a5); return; }   // $26DEB2 jmp $263762
      if (idx === T43.rampSpawn) {                          // $26DEBA cmpi.w #$3C / bne
        // $26DEC4 moveq #$44,D0 / jsr $263678 -- enqueueDeferred with D1 = $80 (DEFQ_D1.FIXED80), the
        // family spawn.js:419 names as $263678/$263684/$263690. Its own position goes to ($16,A0).
        const q = enqueueDeferred(ram, T43.spawnType, DEFQ_D1.FIXED80);
        if (!q.dropped) ram.setU32(q.addr + 0x16, ram.u32(a6 + 0x02));   // $26DECC
        else ctx.unported?.note(0x26dec4, `$26DEC4 type $43's ramp-$3C spawn of type $44 was DROPPED -- `
          + `the deferred queue was full at $C80, which the ROM also tolerates silently`);
      }
    }
  }
  draw43(ram, rom, a5, a6);                                 // $26DED2
}

const T01 = Object.freeze({
  init: 0x267c24, initBody: 0x267c2c, handler: 0x267c70,
  recordProto: 0x267c50, recordWords: 2,      // $267C3E moveq #$1,D0 -- D0+1 = 2 words
  subProto: 0x267c54,
  spawnPos: 0x38001c00,                       // $267C46 move.l #$38001C00,($2,A6)
  fireBit: 6,                                 // $267C8C btst #$6,D0
  kindMax: 4,                                 // $267C9A cmpi.w #$4,D0 / bgt
  configWord: 0x812e0a,                       // $259C42 -- read, never written
  emitStub: 0x23d762,                         // $267CB2 -- bucket 0, RECORD convention
});

/** `$259C42` -- two instructions: `move.w $812E0A,D0 / rts`. Five callers in Build B
 *  (`$267C94`, `$267EA4`, `$267F48`, `$275CBA`, `$275CE8`), so it is a shared read and not this
 *  type's private one. Nothing in Build B WRITES `$812E0A`; see the block above. */
function configWord259C42(ram) {
  return ram.u16(T01.configWord);
}

function handler01(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  // $267C70 -- the move comes FIRST and is unconditional: the countdown below gates the SPAWN,
  // not the motion, so the object keeps answering the stick while it is counting down.
  stickMove242A48(ram, ctx.tables, a6);                   // $267C70 jsr $242A48

  if (ram.u16(a5 + 0x18) !== 0) {                         // $267C76 tst.w / beq $267C86
    ram.setU16(a5 + 0x18, u16(ram.u16(a5 + 0x18) - 1));   // $267C7E subq.w #1,($18,A5)
  } else if ((readInput23D186(ram, 1) & (1 << T01.fireBit)) !== 0) {
    // $267C86 jsr $23D18E -- side ONE, the p2EDGE word. Edge and not held, so one press is one
    // item however long the button is down.
    const d0 = configWord259C42(ram);                     // $267C94 jsr $259C42
    // $267C9A `bgt` and $267CA2 `bmi` are both SIGNED, so the accepted range is 0..4 inclusive.
    if (i16(d0) >= 0 && i16(d0) <= T01.kindMax) {
      const kind = u16(d0 * 4);                           // $267CA8/$267CAA add.w D0,D0 twice
      // `spawnItem` reports through `ctx.itemSpawn(d0, siteAddr, slot)` ITSELF, so this must NOT
      // call the hook again -- doing so once produced two events per press, one of them with the
      // arguments in a different order. The site address is passed instead, so the runner sees
      // where the allocation came from.
      spawnItem(ram, rom, ctx, kind, a6, 0x27e812);       // $267CAC jsr $27E812
    }
  }
  // $267CB2 -- every path draws, including the refusals.
  enqueueThroughStub(ram, rom, T01.emitStub, a6);         // $267CB2 jsr $23D762
}

// ============================================ TYPE $1B (W323) ============
// The SECOND-BIGGEST of stage 5's remaining types by record count: 1020 bytes, five of stage 5's
// 770 script records, pinned at `[0x269256, 0x269350]` in `tests/w314stage5scope.test.js`. W320
// read most of it, W322 read the rest and then wrongly reported it blocked (see that worklog and
// the handoff: `$24226E` is `aim256FromCaller` and always was). W323 writes it, and it needed NOT
// ONE NEW PRIMITIVE.
//
// It reads `$813092` in its init body and takes a different pair of bytes from stage 2 onward, so
// it is written to be stage-agnostic rather than stage-5-only.
//
// The family checks that made it cheap, all four positive:
//   * the damage arm is type $8E's -- `damageArm5C` above, this is its SECOND caller
//   * `$23DF58` is bucket 3 by REGISTER (`enqueueRegistersThroughStub`) and `$23D816` is the SAME
//     bucket by RECORD (`enqueueThroughStub`). One draw arm drives both conventions
//   * `$27F8F0` is `allocPoolA27F8F0`, exported by `bee.js` since W312
//   * `$24226E`/`$242B3C`/`$28AC72`/`$28615E`/`$289004`/`$281708` are all ported
//
// ## THE SHAPE: A FOUR-STATE CYCLE, AND IT IS TYPE $45'S SHAPE
//
//   state 0  a delay on ($1E,A5)                                          -> state 1
//   state 1  a delay on ($22)/($23), requires X < $6C00, RAMPS ($24,A5) UP by 4 through the eight
//            longs at $26972C into ($26,A5); at index $1C arms ($34,A5)   -> state 2
//   state 2  a delay on ($1E)/($2E), fires a MIRRORED AIMED PAIR, and a burst counter on
//            ($20)/($21) ends the volley                                  -> state 3
//   state 3  a delay, RAMPS ($24,A5) back DOWN by 4; at index 0           -> state 0
//
// W316's type $45 delays, ramps up by 4 clamped at $1C, fires, then ramps back down by 4. Same
// states, same step, same clamp, a different field. Two members is a candidate family; the third
// will say whether it is worth a shared driver.
//
// ## ($18,A5) IS READ AS A WORD AND WRITTEN AS A WORD
//
// `move.w #$1,($18,A5)` is TWO BYTE FIELDS -- byte $18 becomes 0 and byte $19 becomes 1 -- and the
// dispatch reads `move.w ($18,A5),D0`, so the word is what matters and the pair is consistent. This
// is the W273/W316/W317 idiom, and here it is benign rather than load-bearing. It is written as
// words on both sides so it STAYS benign.
const T1B = Object.freeze({
  init: 0x269256, initBody: 0x26925e, handler: 0x269350,
  stageRows: 0x2692d2, recordProto: 0x2692dc, subProto: 0x2692fa,
  deathRows: 0x26970c,                       // 4 longs, the allocPoolA27F8F0 rows
  spriteRing: 0x26971c, ringEntries: 4,      // 4 longs, indexed by ($28,A6) in steps of 4
  rampTable: 0x26972c, rampEntries: 8,       // 8 longs, indexed by ($24,A5) 0..$1C
  damage: Object.freeze({ hpFull: 0x380, base: 0x1c, xor: 0x1d }),
  boundsA: 0xc00, boundsB: 0x7800,           // $26935A/$26935E, TWO separate addi.w
  ringWrap: 0x10, ringTop: 0x0c,             // $26940A cmpi.w #$10 / $26941E move.w #$C
  sweepBit: 0x40, sweepStep: 0x20,           // $2693E2 addi.w #$20 / $2693EC andi.w #$40
  animGate: 0x40,                            // $2693DA cmpi.b #$40,($1B,A6) / bcc
  baseY: 0xf400,                             // $2693D4 move.w #$F400,($6,A6)
  fireX: 0x1000,                             // $269448/$2695E0 cmpi.w #$1000,($2,A6)
  rampX: 0x6c00,                             // $269484 cmpi.w #$6C00,($2,A6) / bge -- SIGNED
  rampStep: 4, rampClamp: 0x1c,              // $26948E addq.w #4 / $2694A2 cmpi.w #$1C
  armDelay: 0x10,                            // $269460 move.b #$10,($1E,A5)
  aimBias: 0xa80,                            // $2694D6 addi.w #$A80,D0
  pairD3: [0x0a800400, 0x0a7ffc00],          // $2694F0 / $269518 -- the mirrored muzzles
  pairAngleLow: 0x13,                        // $2694FE/$269526 move.w #$13,D0 after the swap
  fanBase: 0x6b, fanStep: 7, fanCount: 8,    // $26960A moveq #$7,D7 + dbra = EIGHT
  fanD0: 0xfffe0004, fanD3: 0xfe000000,      // $2695F4 / $2695FE
  drawD3: [0x230, 0x430],                    // $269596 / $2695C8
  drawBiasA: -0x600, drawBiasB: -0xe00,      // $269586 / $26958C
  drawBiasC: 0x800,                          // $2695B4 addi.w #$800
  killScore: 0x130,                          // $26962E move.l #$130,D0
  deathCue: 0x28c28e,
  // $269640 moveq #$C,D0 / move.w #$8,D1 / jsr $289B22 -- the effect subsystem handlers.js
  // already NOTES at three sites with D0 = $C. The same deferral, not a new one.
  noteEffect: 0x289b22,
  // The THREE $289004 spawns, each followed by the family's seven writes. The third uses
  // `move.l #$84,D0` and NOT a moveq, and `spawnEffect` masks D0 & $7F, so it spawns kind 4.
  deathSpawns: [
    { kind: 0x0d, f14: 0x400, f26: 0x400, f28: 0x0000 },   // $26964C
    { kind: 0x0c, f14: 0x0000, f26: 0xfa00, f28: 0x0600 }, // $26967E
    { kind: 0x84, f14: 0x0000, f26: 0xfa00, f28: 0xfa00 }, // $2696B0 move.l, masked to 4
  ],
  poolAKind: 8, poolALayer: 3, poolARows: 4,  // $2696EC moveq #$8 / D2 = 3 / moveq #$3,D6 = FOUR
});

/** `$269582..$2695D4` -- two emits into bucket 3, one by register and one by record. */
function draw1B(ram, rom, a5, a6) {
  // $269582..$269590 -- ONE longword with a different bias in each half, applied around a `swap`.
  const posA = u32(((u16(ram.u16(a6 + 0x02) + T1B.drawBiasB) << 16)
    | u16(ram.u16(a6 + 0x04) + T1B.drawBiasA)) >>> 0);
  enqueueRegistersThroughStub(ram, rom, 0x23df58, posA,
    ram.u32(a6 + 0x2a), T1B.drawD3[0], ram.u16(a6 + 0x1c));   // $26959E
  // $2695A4 -- the RECORD-convention emitter for the same bucket. `$23D822 lea ($2,A6),A1` is what
  // says its record is A6 itself, not a table row.
  enqueueThroughStub(ram, rom, 0x23d816, a6);                 // $2695A4
  // $2695AA..$2695C2 -- the second emit subtracts the ($2E,A6) sweep's bit 6 from the biased half.
  const sweep = ram.u16(a6 + 0x2e) & T1B.sweepBit;            // $2695B8/$2695BC
  const posB = u32(((u16(ram.u16(a6 + 0x02) + T1B.drawBiasB) << 16)
    | u16(ram.u16(a6 + 0x04) + T1B.drawBiasA + T1B.drawBiasC - sweep)) >>> 0);
  enqueueRegistersThroughStub(ram, rom, 0x23df58, posB,
    ram.u32(a5 + 0x26), T1B.drawD3[1], ram.u16(a6 + 0x1c));   // $2695D0
}

/** `$2695E0..$26962C` -- the EIGHT-shot fan, and a second cadence that swaps the first's period. */
function fire1B(ram, rom, a5, a6, ctx) {
  if (i16(ram.u16(a6 + 0x02)) < T1B.fireX) return;            // $2695E0 cmpi.w #$1000 / blt
  if (!due8(ram, a5 + 0x30)) return;                          // $2695E8 subq.b #1 / bcc
  ram.setU8(a5 + 0x30, ram.u8(a5 + 0x2f));                    // $2695EE
  // $2695F4..$269616 -- `moveq #$7,D7` plus `dbra` is EIGHT passes, and D1 steps by 7 each time.
  for (let n = 0; n < T1B.fanCount; n++) {
    const regs = { d0: T1B.fanD0, d1: u16(T1B.fanBase + n * T1B.fanStep),
      d2: ram.u32(a6 + 0x02), d3: T1B.fanD3, d4: 0, d5: 0, a5 };
    const res = fireBullet({ ram, rom, log: new WriteLog(ram) }, 0x281708, regs);
    ctx.bulletSpawn?.(0x26960e, res);
  }
  // $26961A -- the SECOND cadence. When it expires it reloads itself from ($33,A5) AND rewrites the
  // first cadence's period from ($31,A5): a burst-then-rest pattern rather than one rate.
  if (!due8(ram, a5 + 0x32)) return;                          // $26961A subq.b #1 / bcc
  ram.setU8(a5 + 0x32, ram.u8(a5 + 0x33));                    // $269620
  ram.setU8(a5 + 0x30, ram.u8(a5 + 0x31));                    // $269626
}

/** `$26962E..$269704` -- the death arm: three effect spawns, the refcount, and four pool-A rows. */
function death1B(ram, rom, a5, a6, ctx) {
  scoreKill(ram, rom, ctx, T1B.killScore, 0);                 // $269634 jsr $28615E
  ctx.soundPost?.(T1B.deathCue);                              // $26963A jsr $28C28E
  ctx.unported?.note(T1B.noteEffect, `$289B22 type $1B death effect (D0=$C, D1=$8) -- the same `
    + `routine and the same D0 handlers.js already notes at three sites; deferred alike`);
  // $26964C/$26967E/$2696B0 -- three `jsr $289004`s, each followed by the family's SEVEN writes.
  // Every `move.w #$1,($12,A0)` here is TWO BYTE FIELDS: byte $12 becomes 0 and byte $13 becomes 1.
  for (const s of T1B.deathSpawns) {
    const eff = spawnEffect(ram, ctx, s.kind);
    if (!eff) continue;                                       // a full pool returns the bit bucket
    ram.setU32(eff + 0x02, ram.u32(a6 + 0x02));               // move.l ($2,A6),($2,A0)
    ram.setU16(eff + 0x1e, 0x10);
    ram.setU16(eff + 0x12, 1);
    ram.setU16(eff + 0x14, s.f14);
    ram.setU16(eff + 0x26, s.f26);
    ram.setU16(eff + 0x28, s.f28);
    ram.setU16(eff + 0x10, 1);
  }
  // $2696E6 -- the refcount's OTHER decrement, the one that pairs with the init body's increment.
  ram.setU16(G.midbossD8, u16(ram.u16(G.midbossD8) - 1));     // $2696E6 subq.w #1,$8130D8
  // $2696EC..$269700 -- `lea ($26970C,PC),A4` walked with `(A4)+`, so the `lea` names the BASE (the
  // display-family convention), and `moveq #$3,D6` + `dbra` is FOUR rows.
  for (let n = 0; n < T1B.poolARows; n++) {
    allocPoolA27F8F0(ram, rom, ctx, T1B.poolAKind,
      rom.u32(T1B.deathRows + n * 4), T1B.poolALayer, a6);    // $2696FA jsr $27F8F0
  }
  freeEnemy(ram, a5);                                         // $269704 jmp $263762
}

function handler1B(ram, rom, a5, ctx) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, tables, u)) return;          // $269350 jsr $2638A6

  // $269356..$269362 -- an INLINE bounds test, NOT a call to $242684. Two SEPARATE `addi.w`s, so
  // the carry that decides comes from the SECOND add alone and the first add's carry is discarded.
  // Folding them into one `x + $8400` would test a different quantity.
  const t = u16(ram.u16(a6 + 0x02) + T1B.boundsA);            // $26935A addi.w #$C00,D0
  if ((t + T1B.boundsB) > 0xffff) {                           // $26935E addi.w #$7800 / bcc
    if (ram.u8(a5 + 0x16) !== 0) {                            // $269364 tst.b / beq $26937E
      ram.setU16(G.midbossD8, u16(ram.u16(G.midbossD8) - 1)); // $26936A subq.w #1,$8130D8
      freeEnemy(ram, a5);                                     // $269370 jmp $263762
      return;
    }
  } else {
    ram.setU8(a5 + 0x16, 1);                                  // $269378 move.b #$1,($16,A5)
  }

  // $26937E..$2693C2 -- the shared $5C damage arm, type $8E's, with $380 and ($1C,A5)/($1D,A5).
  const dmg = damageArm5C(ram, ctx, a5, a6, T1B.damage);
  if (dmg.dead) { death1B(ram, rom, a5, a6, ctx); return; }    // $2693BE bmi $26962E
  ram.setU8(a6 + 0x1d, dmg.pal & 0xff);                       // $2693C2 move.b D0,($1D,A6)
  spawnCues28AC72(ram, rom, a5, a6);                          // $2693C6 jsr $28AC72

  // $2693CC -- a WORD freeze test here, unlike the two LONGWORD ones at $269434/$26943E below.
  if (ram.u16(G.freeze) === 0) {                              // $2693CC tst.w $8130D2 / bne
    ram.setU16(a6 + 0x06, T1B.baseY);                         // $2693D4 move.w #$F400,($6,A6)
    // $2693DA -- the sweep only runs while the animation byte is under $40.
    if (ram.u8(a6 + 0x1b) < T1B.animGate) {                   // $2693DA cmpi.b #$40 / bcc
      ram.setU16(a6 + 0x2e, u16(ram.u16(a6 + 0x2e) + T1B.sweepStep));   // $2693E2
      ram.setU16(a6 + 0x06,                                   // $2693F0 sub.w D0,($6,A6)
        u16(ram.u16(a6 + 0x06) - (ram.u16(a6 + 0x2e) & T1B.sweepBit)));
      if (due8(ram, a6 + 0x26)) {                             // $2693F4 subq.b #1 / bcc
        ram.setU8(a6 + 0x26, ram.u8(a6 + 0x27));              // $2693FA
        // $269400 -- ($1B,A6) picks the ring's DIRECTION. Up wraps $10 -> 0; down reloads $C on
        // the borrow. Four entries, four bytes apart.
        if (ram.u8(a6 + 0x1b) === 0) {                        // $269400 tst.b / bne $269418
          const next = u16(ram.u16(a6 + 0x28) + T1B.rampStep);            // $269406 addq.w #4
          ram.setU16(a6 + 0x28, next === T1B.ringWrap ? 0 : next);        // $26940A/$269412
        } else {
          const cur = ram.u16(a6 + 0x28);                     // $269418 subq.w #4 / bcc
          ram.setU16(a6 + 0x28, cur < T1B.rampStep ? T1B.ringTop : u16(cur - T1B.rampStep));
        }
        ram.setU32(a6 + 0x2a,                                 // $26942E move.l (A0,D0.w),($2A,A6)
          rom.u32(T1B.spriteRing + u16(ram.u16(a6 + 0x28))));
      }
    }
  }

  // $269434 and $26943E -- `tst.l $8130D2` TWICE IN A ROW, both branching to the draw. A LONGWORD
  // over the freeze word AND $8130D4 together, the same shape as W308's `tst.w $81E0D8`. The
  // duplication is in the ROM; it is transcribed once because the second test cannot differ.
  if (ram.u32(G.freeze) !== 0) { draw1B(ram, rom, a5, a6); return; }
  if (i16(ram.u16(a6 + 0x02)) < T1B.fireX) {                  // $269448 cmpi.w #$1000 / blt
    draw1B(ram, rom, a5, a6);
    return;
  }

  const state = ram.u16(a5 + 0x18);                           // $269452 move.w ($18,A5),D0
  if (state === 0) {
    // $269458 -- arm and advance. Both writes are WORDS, so ($19,A5) is the low half of each.
    if (due8(ram, a5 + 0x1e)) {                               // $269458 subq.b #1 / bcc
      ram.setU8(a5 + 0x1e, T1B.armDelay);                     // $269460 move.b #$10,($1E,A5)
      ram.setU16(a5 + 0x18, 1);                               // $269466 move.w #$1,($18,A5)
    }
  } else if (state === 1) {
    // $269476 -- the ramp UP, gated on a SIGNED X compare (`bge`).
    if (due8(ram, a5 + 0x22)) {                               // $269476 subq.b #1 / bcc
      ram.setU8(a5 + 0x22, ram.u8(a5 + 0x23));                // $26947E
      if (i16(ram.u16(a6 + 0x02)) < T1B.rampX) {              // $269484 cmpi.w #$6C00 / bge
        const idx = u16(ram.u16(a5 + 0x24) + T1B.rampStep);   // $26948E addq.w #4
        ram.setU16(a5 + 0x24, idx);
        ram.setU32(a5 + 0x26, rom.u32(T1B.rampTable + idx));  // $26949C move.l (A0,D0.w),($26,A5)
        if (idx === T1B.rampClamp) {                          // $2694A2 cmpi.w #$1C / bne
          ram.setU16(a5 + 0x34, 0xfffe);                      // $2694AA move.w #$FFFE,($34,A5)
          ram.setU16(a5 + 0x18, 2);                           // $2694B0 move.w #$2,($18,A5)
        }
      }
    }
  } else if (state === 2) {
    fireState2(ram, rom, a5, a6, ctx);
  } else {
    // $269556 -- state 3, the ramp DOWN, and the only arm that returns to state 0.
    if (due8(ram, a5 + 0x22)) {                               // $269556 subq.b #1 / bcc
      ram.setU8(a5 + 0x22, ram.u8(a5 + 0x23));                // $26955C
      const idx = u16(ram.u16(a5 + 0x24) - T1B.rampStep);     // $269562 subq.w #4
      ram.setU16(a5 + 0x24, idx);
      ram.setU32(a5 + 0x26, rom.u32(T1B.rampTable + idx));    // $269570
      if (idx === 0) ram.setU16(a5 + 0x18, 0);                // $269576/$26957E clr.w ($18,A5)
    }
  }
  draw1B(ram, rom, a5, a6);                                   // $269582
}

/** `$2694BA..$269554` -- state 2: a MIRRORED AIMED PAIR with independent jitter, then the volley
 *  counter. This is the arm W322 wrongly reported blocked: `$24226E` is `aim256FromCaller`. */
function fireState2(ram, rom, a5, a6, ctx) {
  if (!due8(ram, a5 + 0x1e)) return;                          // $2694C2 subq.b #1 / bcc
  ram.setU8(a5 + 0x1e, ram.u8(a5 + 0x2e));                    // $2694CA
  // $2694D0/$2694D6 -- `movem.w ($2,A6),D0-D1` then bias D0 by $A80. SELF comes from the caller,
  // which is exactly why the ROM calls the FROM-CALLER entry and not $242290.
  const selfY = u16(ram.u16(a6 + 0x02) + T1B.aimBias);        // $2694D6 addi.w #$A80,D0
  const selfX = ram.u16(a6 + 0x04);                           // ...and D1, which matters below
  const aimed = aim256FromCaller(aimTables(rom), ram, a5, selfY, selfX);   // $2694DA jsr $24226E
  // **THERE IS NO `bcs` AFTER THAT `jsr`.** The next instruction is $2694E0 `move.w D1,D7`, and
  // `$24226E`'s own no-target exit is `$242264 rts` -- six bytes that return with the carry SET and
  // **D1 UNCHANGED**. So when both players are dead this type does not skip its volley: it fires
  // with whatever D1 held, which `$2694D0 movem.w ($2,A6),D0-D1` had just loaded as the sub-record's
  // Y word. Deterministic garbage that the board really does fire, and returning early here instead
  // would invent a branch the ROM does not have.
  const baseAngle = aimed.carry ? selfX : aimed.dir;
  // $2694F8..$26952C -- D0 is assembled by the SWAP TRICK: ($34,A5) becomes the high word and $13
  // the low. Both shots use the same D0 and the same clean aim, with INDEPENDENT jitter.
  const d0 = u32((((ram.u16(a5 + 0x34) << 16) | T1B.pairAngleLow) >>> 0));
  for (const d3 of T1B.pairD3) {
    // $2694E2/$26950A -- one RNG draw each. `asr.b #1` is an ARITHMETIC shift on a BYTE, so the
    // draw is sign-extended to 8 bits FIRST and then halved toward -infinity: a draw of $FF is -1
    // and halves to -1, not to $7F. Getting this wrong biases every jittered shot one way.
    const jitter = (drawByte242B3C(ram, rom) << 24) >> 24;    // sign-extend the byte
    const d1 = u16((baseAngle + (jitter >> 1)) & 0xff);        // asr.b #1,D0 / add.b D0,D1
    const regs = { d0, d1, d2: ram.u32(a6 + 0x02), d3, d4: 0, d5: 0, a5 };
    const res = fireBullet({ ram, rom, log: new WriteLog(ram) }, 0x281708, regs);
    ctx.bulletSpawn?.(0x269502, res);
  }
  ram.setU16(a5 + 0x34, u16(ram.u16(a5 + 0x34) + 1));         // $269530 addq.w #1,($34,A5)
  // $269534 -- the VOLLEY counter. Note `move.b ($21,A5),($20,A5)` then `beq`: the branch tests the
  // MOVE's result, so a ZERO reload value holds this state instead of advancing.
  if (!due8(ram, a5 + 0x20)) return;                          // $269534 subq.b #1 / bcc
  const reload = ram.u8(a5 + 0x21);                           // $26953A move.b ($21,A5),($20,A5)
  ram.setU8(a5 + 0x20, reload);
  if (reload === 0) return;                                   // $269540 beq $269582
  ram.setU8(a5 + 0x1e, ram.u8(a5 + 0x1f));                    // $269542
  ram.setU16(a5 + 0x18, 3);                                   // $269548 move.w #$3,($18,A5)
  ram.setU8(a5 + 0x22, T1B.armDelay);                         // $26954E move.b #$10,($22,A5)
}

// ============================================ TYPE $45 (W316) ============
// The first of stage 5's fifteen missing types, and the biggest by record count: 21 of its 770
// script records. `$270DD8` the init body, `$270E36..$27100A` the handler, and the 8-entry sprite
// table `$27100C..$27102B` -- which ends exactly at `$27102C`, type `$46`'s init, so the whole type
// is bounded on both sides without a guess.
//
// **NOT ONE NEW PRIMITIVE.** Every routine it calls the port already had, which is the whole reason
// it could be the first: `$2637A2` and `$26377A` are `loadSubProto`/`loadRecordProto`, `$263808` is
// `readMovementInit`, `$24179E` is `scrollCompensate`, `$286096`/`$28615E` are `scoreHit`/
// `scoreKill`, `$289004` is `spawnEffect`, `$24202C` is `aim64AtTarget`, `$281402` is the bullet
// fan, `$28C25A` is a cue and `$263762` is `freeEnemy`.
//
// And `$270EB4 jsr $27F8F0` with `D0 = 8` is **`allocPoolA27F8F0` at kind `$08`** -- one of the two
// hooks W312 added four waves ago. Without W312 this handler's death arm would have thrown, so the
// order those two waves happened in was load-bearing rather than incidental.
//
// ## THE SHAPE: A FOUR-STATE MACHINE ON `($17,A5)` WITH A RAMPED SPRITE
//
//   state 0  a delay on `($1A)`/`($1B)`                              -> state 1
//   state 1  a delay on `($1C)`/`($1D)`, then RAMP `($1E)` up by 4 and clamp at $1C; at the clamp
//            aim once, store `(dir & $3C)` in `($26)`, load the burst counters -> state 2
//   state 2  below X $1400 -> state 3.  Otherwise a two-level burst on `($20)`/`($22)` firing
//            `$281402` at the STORED angle, and re-aiming when `($24)` runs out
//   state 3  a delay, then RAMP `($1E)` back DOWN by 4 to zero                -> state 4
//
// `($1E,A5)` is both the ramp and the sprite index: `$270FEA adda.w ($1E,A5),A0` indexes
// `$27100C` by it directly, so the eight entries are the open-and-close animation and the ramp IS
// the frame counter. Two of the four states exist only to drive it, which is why the state machine
// looks larger than the behaviour.
//
// The states are tested with four INDEPENDENT `cmpi.b`s in ascending order, not a switch, so a
// state set inside one arm falls into the next arm's test on the SAME frame. State 1 setting state
// 2 at `$270F26` is immediately re-read at `$270F3E`, and that is how the aim frame also fires.
/** `subq.b #1 / bcc` -- the OLD-ZERO BORROW: it reloads on the frame the counter was ALREADY
 *  zero, not the frame it reaches zero. The same three lines `bee.js`, `boss2attacks.js` and
 *  `stage4type41.js` each carry; kept local here for the same reason they did. */
function due8(ram, addr) {
  const old = ram.u8(addr);
  ram.setU8(addr, (old - 1) & 0xff);
  return old === 0;
}

const T45 = Object.freeze({
  init: 0x270dd0, initBody: 0x270dd8, handler: 0x270e36,
  recordProto: 0x270e08, recordWords: 9,      // $270DEA moveq #$8,D0 -- D0+1 words
  subProto: 0x270e1a,
  sprites: 0x27100c, spriteEntries: 8,
  offX: -0x800,                // $270E36 cmpi.w #-$800,($2,A6) / bgt
  hitMask: 0x5c,               // $270E4E moveq #$5C,D1 / and.b (A6),D1
  hitClear: 0xa3,              // $270E56 move.b #$A3,D0 / and.b D0,(A6)
  killScore: 0x34,             // $270E78 moveq #$34,D0
  deathEffect: 0x88,           // $270E80 move.w #$88,D0
  deathCue: 0x28c25a,
  deathImpactKind: 0x08,       // $270EAE moveq #$8,D0 -> $27F8F0
  rampStep: 4, rampMax: 0x1c,  // $270EFE addq.w #4 / $270F02 cmpi.w #$1C
  aimMask: 0x3c,               // $270F1E andi.w #$3C,D1
  stateXGate: 0x1400,          // $270F48 cmpi.w #$1400,($2,A6) / bge
  drawBias: -0x3ff0400,        // $270FF4 addi.l
  drawAttr: 0x420,             // $270FFA move.w #$420,D3
  drawStub: 0x23dece,
});

/** `$270FE4..$27100A` -- the draw, whose sprite index IS the ramp at `($1E,A5)`. */
function draw45(ram, rom, a5, a6) {
  const idx = ram.u16(a5 + 0x1e);                        // $270FEA adda.w ($1E,A5),A0
  if ((idx & 3) !== 0 || idx > T45.rampMax) {
    unreached(0x270fea, `type $45's sprite index ($1E,A5) is $${idx.toString(16)}; the ramp moves `
      + `in steps of 4 between 0 and $${T45.rampMax.toString(16)}, so the ${T45.spriteEntries} `
      + `longwords at $27100C are the whole table and this would read past it`);
  }
  const d1 = u32(ram.u32(a6 + 0x02) + T45.drawBias);     // $270FF0/$270FF4 addi.l
  enqueueRegistersThroughStub(ram, rom, T45.drawStub, d1,  // $271004 jsr $23DECE
    rom.u32(T45.sprites + idx), T45.drawAttr, ram.u8(a6 + 0x1d));
}

function handler45(ram, rom, a5, ctx) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);

  // $270E36 -- the off-screen test is on the SUB-record's X and it is SIGNED (`bgt`).
  if (i16(ram.u16(a6 + 0x02)) <= T45.offX) {             // $270E3C bgt $270E48
    freeEnemy(ram, a5);                                  // $270E40 jmp $263762
    return;
  }
  scrollCompensate(ram, a5);                             // $270E48 jsr $24179E

  if ((ram.u8(a6) & T45.hitMask) !== 0) {                // $270E4E/$270E52 beq $270EC2
    ram.setU8(a6, ram.u8(a6) & T45.hitClear);            // $270E5A and.b D0,(A6)
    scoreHit(ram, ctx, a6, 0);                           // $270E5C jsr $286096
    // $270E62..$270E6C -- the palette byte is XORed with ($19,A5), a flash rather than a set.
    ram.setU8(a6 + 0x1d, ram.u8(a6 + 0x1d) ^ ram.u8(a5 + 0x19));

    if ((ram.u16(a6 + 0x18) & 0x8000) !== 0) {           // $270E70 tst.w / $270E74 bpl $270EC8
      // $270E78..$270EBE -- the death arm.
      scoreKill(ram, rom, ctx, T45.killScore, 0);        // $270E7A jsr $28615E
      const eff = spawnEffect(ram, ctx, T45.deathEffect);  // $270E84 jsr $289004
      if (eff) {
        ram.setU32(eff + 0x02, ram.u32(a6 + 0x02));      // $270E8A move.l ($2,A6),($2,A0)
        ram.setU16(eff + 0x1e, 4);                       // $270E90
        ram.setU16(eff + 0x12, 0);                       // $270E96
        ram.setU16(eff + 0x14, 0);                       // $270E9C
        ram.setU16(eff + 0x10, 2);                       // $270EA2
      }
      ctx.soundPost?.(T45.deathCue);                     // $270EA8 jsr $28C25A
      // $270EAE..$270EB4 -- D0 = 8, D1 = 0, D2 = 1: W312's hook 2.
      allocPoolA27F8F0(ram, rom, ctx, T45.deathImpactKind, 0, 1, a6);
      freeEnemy(ram, a5);                                // $270EBA jmp $263762
      return;
    }
  } else {
    ram.setU8(a6 + 0x1d, ram.u8(a5 + 0x18));             // $270EC2 -- restore, no flash
  }

  // The four state tests are INDEPENDENT and ascending, so an arm that advances the state falls
  // into the next arm on the same frame. That is not tidy and it is what the ROM does.
  if (ram.u8(a5 + 0x17) === 0) {                         // $270EC8 cmpi.b #$0 / bne $270EE6
    if (due8(ram, a5 + 0x1a)) {                          // $270ED2 subq.b #1 / bcc $270EE6
      ram.setU8(a5 + 0x1a, ram.u8(a5 + 0x1b));           // $270EDA
      ram.setU8(a5 + 0x17, 1);                           // $270EE0
    }
  }
  if (ram.u8(a5 + 0x17) === 1) {                         // $270EE6
    if (due8(ram, a5 + 0x1c)) {                          // $270EF0 subq.b #1 / bcc $270F3E
      ram.setU8(a5 + 0x1c, ram.u8(a5 + 0x1d));           // $270EF8
      const ramp = u16(ram.u16(a5 + 0x1e) + T45.rampStep);  // $270EFE addq.w #4
      ram.setU16(a5 + 0x1e, ramp);
      if (i16(ramp) >= T45.rampMax) {                    // $270F02 cmpi.w #$1C / blt $270F3E
        ram.setU16(a5 + 0x1e, T45.rampMax);              // $270F0C clamp
        // W319 CORRECTION: `aimTables(rom)`, not `ctx.tables`. W316 passed `ctx.tables` here, and
        // in the live game that is the MoveTables -- `aim64AtTarget` wants the AimTables. The W316
        // test passed only because its fixture put an AimTables in `ctx.tables`.
        const r = aim64AtTarget(aimTables(rom), ram, a5, a6);   // $270F12 jsr $24202C
        if (!r.carry) {                                  // $270F18 bcs $270F3E
          // $270F1C addq.b #2 then $270F1E andi.w #$3C -- byte add, WORD mask, as in type $11.
          ram.setU8(a5 + 0x26, ((r.dir + 2) & 0xff) & T45.aimMask);
          ram.setU8(a5 + 0x17, 2);                       // $270F26
          ram.setU16(a5 + 0x20, 0x0808);                 // $270F2C
          ram.setU16(a5 + 0x22, 0x0003);                 // $270F32
          ram.setU16(a5 + 0x24, 0x0003);                 // $270F38
        }
      }
    }
  }
  if (ram.u8(a5 + 0x17) === 2) {                         // $270F3E
    if (i16(ram.u16(a6 + 0x02)) < T45.stateXGate) {      // $270F48 cmpi.w #$1400 / bge $270F58
      ram.setU8(a5 + 0x17, 3);                           // $270F52
    }
    let fire = true;
    if (ram.u8(a5 + 0x24) === 0) {                       // $270F58 tst.b / $270F5C bne $270F74
      if (!due8(ram, a5 + 0x20)) fire = false;           // $270F60 subq.b #1 / bcc $270FB2
      else {
        ram.setU8(a5 + 0x20, ram.u8(a5 + 0x21));         // $270F68
        ram.setU8(a5 + 0x24, ram.u8(a5 + 0x25));         // $270F6E
      }
    }
    if (fire && due8(ram, a5 + 0x22)) {                  // $270F74 subq.b #1 / bcc $270FB2
      ram.setU8(a5 + 0x22, ram.u8(a5 + 0x23));           // $270F7C
      // $270F82..$270F96 -- the stored angle, not a fresh aim.
      const regs = {
        d0: 0xfffe0006, d1: ram.u8(a5 + 0x26), d2: ram.u32(a6 + 0x02),
        d3: 0, d4: 0, d5: 0, a5,
      };
      const res = fireBullet({ ram, rom, log: new WriteLog(ram) }, 0x281402, regs);
      ctx.bulletSpawn?.(0x270f96, res);
      // $270F9C subq.b #1,($24,A5) / bne $270FB2 -- at zero the angle is refreshed.
      ram.setU8(a5 + 0x24, (ram.u8(a5 + 0x24) - 1) & 0xff);
      if (ram.u8(a5 + 0x24) === 0) {
        const r = aim64AtTarget(aimTables(rom), ram, a5, a6);   // $270FA8 jsr $24202C
        ram.setU8(a5 + 0x26, r.dir & 0xff);              // $270FAE move.b D1,($26,A5)
      }
    }
  }
  if (ram.u8(a5 + 0x17) === 3) {                         // $270FB2
    if (due8(ram, a5 + 0x1c)) {                          // $270FBC subq.b #1 / bcc $270FE4
      ram.setU8(a5 + 0x1c, ram.u8(a5 + 0x1d));           // $270FC4
      const ramp = u16(ram.u16(a5 + 0x1e) - T45.rampStep);  // $270FCA subq.w #4
      ram.setU16(a5 + 0x1e, ramp);
      if (i16(ramp) <= 0) {                              // $270FCE cmpi.w #$0 / bgt $270FE4
        ram.setU16(a5 + 0x1e, 0);                        // $270FD8
        ram.setU8(a5 + 0x17, 4);                         // $270FDE
      }
    }
  }
  draw45(ram, rom, a5, a6);                              // $270FE4..$27100A
  if (u) { /* every primitive above is ported; nothing to count */ }
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
  // W382. [M] `$273AA4  4e b9 00 28 ac 72` -- UNCONDITIONAL. The note here said
  // "its result is unused by $273AAA", which is TRUE of the RETURN VALUE and
  // beside the point: the routine's work is the `$81DB90` install and the
  // `($44,A5)` advance, both side effects, and skipping the call skipped those.
  spawnCues28AC72(ram, rom, a5, a6);                   // $273AA4 jsr $28AC72
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
  if (offScreen242684(ram, a6)) {                       // jsr $242684 / bcc
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
  if (offScreen242684(ram, a6)) {                       // $277344 jsr $242684 / bcc
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
  // W411 (docket D49): THE DROP. `$2774C2 moveq #$8,D0 / $2774C4 move.w ($1E,A6),D2 /
  // $2774C8 jsr $27F8EE` -- byte-for-byte the shape types $8E, $8F and $94 use.
  allocPoolA27F8F0(ram, rom, ctx, 0x08, 0,
    ram.u16(a6 + 0x1e), a6);                           // $2774C2/$2774C4/$2774C8
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
  // W382. [M] `$275FD6  4e b9 00 28 ac 72` -- UNCONDITIONAL. The note here also
  // claimed "driver $28AD70 also unported"; that is FALSE -- `runCueDriver28AD70`
  // is cues.js:145 and type5.js runs it every frame as dispatch entry 3.
  spawnCues28AC72(ram, rom, a5, a6);                   // $275FD6 jsr $28AC72
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
  // W411 (docket D49): SEVEN gold discs. `$2762AE moveq #$8,D0 / $2762B0 lea
  // ($2763E8,PC),A4 / $2762B6 moveq #$6,D6 / $2762B8 move.l (A4)+,D1 / $2762BA jsr
  // $27F8FA / $2762C0 dbra` -- seven longs, ending where $276404 `3B7C` is code again.
  for (let i = 0; i < 7; i++) {                        // $2762C0 dbra D6
    allocPoolA27F8F0(ram, rom, ctx, 0x08, rom.u32(0x2763e8 + i * 4), 0, a6); // $2762BA
  }
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
  if (!offScreen242684(ram, a6)) ram.setU8(a5 + 0x16, 1);
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
  // W411 (docket D49): THE DROP. `$2777DC moveq #$8,D0 / $2777DE move.w ($1E,A6),D2 /
  // $2777E2 jsr $27F8EE`.
  allocPoolA27F8F0(ram, rom, ctx, 0x08, 0,
    ram.u16(a6 + S.anim), a6);                         // $2777DC/$2777DE/$2777E2
  effect8f(ram, rom, a6, ctx, 0x0c, REMAP.shared278320, 0x2777ea, true);
  freeEnemy(ram, a5);                                 // $277826
}

function handler8F(ram, rom, a5, ctx) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, tables, u)) return;  // $2775CC
  if (!offScreen242684(ram, a6)) ram.setU8(a5 + 0x16, 1);
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
  // W411 (docket D49): SEVEN gold discs in a ring. `$27569C moveq #$8,D0 /
  // $27569E lea ($2757F6,PC),A4 / $2756A4 moveq #$6,D6 / $2756A6 move.l (A4)+,D1 /
  // $2756A8 jsr $27F8FA / $2756AE dbra D6,$2756A6` -- `dbra` on 6 is SEVEN passes and
  // the table is exactly seven longs ($275812 `3B7C` is code). `$27F8FA moveq #$0,D2`
  // falls into `$27F8FC` WITHOUT `$27F8F0`'s mask and shift, so the layer is row 0.
  const vectors = Array.from({ length: 7 }, (_, i) => rom.u32(0x2757f6 + i * 4));
  for (const v of vectors) allocPoolA27F8F0(ram, rom, ctx, 0x08, v, 0, a6); // $2756A8
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
        // W411 (docket D49). `$279990 jsr $27F8FA` -- D0 = $10 from `$27998E moveq`,
        // D1 = the packed offset above, D2 = 0 because `$27F8FA moveq #$0,D2` falls
        // into `$27F8FC` WITHOUT passing through `$27F8F0`'s mask and shift.
        // Kind index 4 shares kind 0's body `$27FA30`, already ported, so this site
        // needed no new body: it is the cheapest of the ten and it is the proof.
        allocPoolA27F8F0(ram, rom, ctx, 0x10, d1fx, 0, a6);   // $279990
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

  // W411 (docket D49): SEVEN gold discs, and this one carries a trap. `$279B10 lea
  // ($279CA8,PC),A4 / $279B16 movem.w (A4)+,D0/D6` is `4C9C`, and bit 6 of `4C9C` is
  // ZERO -- **movem.W, not movem.L**. So D0 and D6 come from the two WORDS $0008 and
  // $0006 at $279CA8/$279CAA (sign-extended into the longs), the vectors start at
  // $279CAC, and `dbra` on 6 is seven passes. Read as movem.l it would be D0 =
  // $00080006 and D6 = $0C000100, i.e. 257 passes off the end of a seven-entry table.
  // The seven longs end at $279CC8, where `3B7C` is code.
  const kindD0 = i16(rom.u16(0x279ca8));               // $279B16 movem.w, first word
  const count = i16(rom.u16(0x279caa));                // ...and the second, the dbra
  const vectors = Array.from({ length: count + 1 },
    (_, i) => rom.u32(0x279cac + i * 4));
  for (const v of vectors) {                           // $279B22 dbra D6
    allocPoolA27F8F0(ram, rom, ctx, kindD0, v, 0, a6); // $279B1A/$279B1C
  }
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
  const d2 = ram.u8(a6 + S.f1f);                        // $279D60 move.b ($1F,A6),D2
  // W374 WIRES THIS. `$27F8F0` is `allocPoolA27F8F0` and has been since W312 -- the sixth
  // routine in this project found already ported under another name -- so the note was a
  // deferral of something that already existed.
  //
  // Three things had to be settled before the call could be written:
  //   * D0 is `$C` ($279D4E moveq #$C,D0), and `IMPACT_FINISH` has a $0C row ($280D10).
  //   * A6 is THIS record, and it is the same kind `death1B` and type $45 pass. The fill's
  //     `$280B56 add.l ($2,A6),D1` reads the packed position long at ($2,A6), and nothing
  //     between `$279D64 jsr` and `$280B56` writes A6: `$27F8F0` saves and uses only D7/A0,
  //     and `$280B3E` starts with `addq.w #1,$817F7E`.
  //   * this is the `$27F8F0` entry, NOT `$27F8F8`, so D2 really does go through
  //     `andi.w #$FF,D2 / lsl.w #2,D2` -- which is what `allocPoolA27F8F0` models.
  //
  // And it needs W374's other half: D1 is a FULL LONG here ($FF00FE00, or $FF000200 when the
  // mirror bit flipped its low word), so the old `offset & 0xffff` inside the fill would have
  // dropped the $FF00 and spawned this on the wrong side of the carrier.
  allocPoolA27F8F0(ram, rom, ctx, 0x0c, d1, d2, a6);    // $279D64 jsr $27F8F0
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
  // W411 (docket D49): FIVE gold discs. `$2781BE moveq #$8,D0 / $2781C0 lea
  // ($278288,PC),A4 / $2781C6 moveq #$4,D6` -- `dbra` on 4 is FIVE passes, and five
  // longs is where $27829C's emit dispatch begins, so the count pins the table.
  const vectors = Array.from({ length: 5 }, (_, i) => rom.u32(0x278288 + i * 4));
  for (const v of vectors) allocPoolA27F8F0(ram, rom, ctx, 0x08, v, 0, a6); // $2781CA
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
  // W411 (docket D49): THE DROP. `$27A37A moveq #$8,D0 / $27A37C move.w ($1E,A6),D2 /
  // $27A380 jsr $27F8EE`.
  allocPoolA27F8F0(ram, rom, ctx, 0x08, 0,
    ram.u16(a6 + S.anim), a6);                         // $27A37A/$27A37C/$27A380
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

  // $279F32 move.l #$FAC0FA40,D1 -- a FULL LONG, and unlike type $92's there is NO mirror
  // `btst`/`neg.w` here: $279F32's immediate goes straight to $279F38's `move.b ($1F,A6),D2`.
  const d1 = 0xfac0fa40;
  const d2 = ram.u8(a6 + S.f1f);                       // $279F38 move.b ($1F,A6),D2
  // W374 WIRES THIS -- see `tail92` above for the three things that had to be settled; this
  // site is the same shape with the same D0 ($279F30 moveq #$C,D0) and the same A6, and it
  // uses the same `$27F8F0` masking entry. $FAC0FA40's high word is what W374's fill fix
  // stops discarding.
  allocPoolA27F8F0(ram, rom, ctx, 0x0c, d1, d2, a6);   // $279F3C jsr $27F8F0
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
  if (offScreen242684(ram, a6)) {                      // $265486 jsr / bcc
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
  if (offScreen242684(ram, a6)) {                      // $265850
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
  if (offScreen242684(ram, a6)) {                      // $29BB64 jsr / bcc
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

// `$27D072`: Stage-4 type $A2. The gun opens through 23 cartridge frames,
// holds the final frame while alternating its muzzle and shot direction, then
// closes only to frame 14 before beginning the next cycle.
function handlerA2(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + R.subRec);
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported)) return;

  const x = ram.u16(a6 + S.posX);
  const afterFirstAdd = u16(x + 0x1c00);
  const inside = afterFirstAdd + 0x5800 > 0xffff;       // $27D078..$27D084
  if (!inside) ram.setU8(a5 + R.onScreen, 1);
  else if (ram.u8(a5 + R.onScreen) !== 0) {
    freeEnemy(ram, a5);
    return;
  }

  const draw = () => enqueueThroughStub(ram, rom, 0x23d7da, a6);
  if ((ram.u8(a6 + 1) & 0x80) !== 0) {                // $27D09A / death linger
    const old = ram.u16(a5 + R.rec2E);
    ram.setU16(a5 + R.rec2E, u16(old - 1));
    if (old === 0) { freeEnemy(ram, a5); return; }
    draw();
    return;
  }

  const hit = ram.u8(a6) & 0x5c;
  let palette;
  if (hit === 0) {
    palette = ram.u8(a5 + R.rec1A);
    if (ram.u16(a6 + S.hp) < 0x0580 && ram.u16(G.ca) === 0) palette = 0x19;
  } else {
    ram.setU8(a6, ram.u8(a6) & 0xa3);
    scoreHit(ram, ctx, a6, hit);                       // $27D0C2
    palette = ram.u8(a6 + S.palette);
    if (palette === 0x19) palette = ram.u8(a5 + R.rec1A);
    palette ^= ram.u8(a5 + R.rec1B);
    if (i16(ram.u16(a6 + S.hp)) < 0) {
      ctx.soundPost?.(0x28c2dc);                       // $27D278
      scoreKill(ram, rom, ctx, 0x46, hit);             // $27D27E
      ram.setU16(a6, 0x8080);
      ram.setU8(a6 + S.palette, ram.u8(a5 + R.rec1A));
      for (const [kind, nudge, site] of [
        [0x0d, 0xec00, 0x27d294], [0x0d, 0xfc00, 0x27d2c8],
        [0x85, 0x0c00, 0x27d2fc],
      ]) {
        const e = spawnEffect(ram, ctx, kind, site);
        ram.setU32(e + B.pos, ram.u32(a6 + S.posX));
        ram.setU16(e + B.bucket, 0x10);
        ram.setU16(e + B.hook, 1);
        ram.setU16(e + B.sub12, 1);
        ram.setU16(e + B.sub14, 0);
        ram.setU16(e + B.nudge, nudge);
        ram.setU16(e + B.nudge + 2, 0);
      }
      const old = ram.u16(a5 + R.rec2E);               // same-pass cleanup
      ram.setU16(a5 + R.rec2E, u16(old - 1));
      if (old === 0) { freeEnemy(ram, a5); return; }
      draw();
      return;
    }
  }
  ram.setU8(a6 + S.palette, palette);                  // $27D0E4

  if (ram.u16(G.freeze) !== 0 || i16(x) < 0x1000) { draw(); return; }
  const state = ram.u16(a5 + R.rec18);
  let updateArt = false;
  if (state === 0) {
    const old = ram.u8(a5 + R.rec1C);
    ram.setU8(a5 + R.rec1C, old - 1);
    if (old === 0) {
      ram.setU8(a5 + R.rec1C, 0x10);
      ram.setU16(a5 + R.rec18, 1);
    }
  } else if (state === 1) {
    const old = ram.u8(a5 + R.rec22);
    ram.setU8(a5 + R.rec22, old - 1);
    if (old === 0) {
      ram.setU8(a5 + R.rec22, ram.u8(a5 + R.rec23));
      const cursor = u16(ram.u16(a5 + R.rec20) + 4);
      ram.setU16(a5 + R.rec20, cursor);
      if (cursor === 0x58) ram.setU16(a5 + R.rec18, 2);
      updateArt = true;
    }
  } else if (state === 2) {
    const old = ram.u8(a5 + R.rec1C);
    ram.setU8(a5 + R.rec1C, old - 1);
    if (old === 0) {
      ram.setU8(a5 + R.rec1C, ram.u8(a5 + R.rec17));
      const flags = ram.u8(a6 + 1);
      let d3 = (((flags & 0x40) !== 0 ? 0xf300 : 0xf100) << 16)
        | ram.u16(a5 + ((flags & 0x40) !== 0 ? R.rec28 : R.rec2A));
      d3 >>>= 0;
      let delta = (ram.u8(a5 + R.rec30) << 3) & 0xff;
      if (flags & 0x20) delta = (ram.u8(a5 + R.rec32) * 2 + 0x10) & 0xff;
      let direction = 0x40;
      if (ram.u8(a6 + S.f1c) === 0x40) {
        direction = 0xc0;
        delta = (-delta) & 0xff;
      }
      ram.setU8(a6 + 1, flags ^ 0x40);
      if ((flags & 0x40) === 0) delta = (-delta) & 0xff;
      direction = (direction + delta) & 0xff;
      bullet3C(ram, rom, a5, ctx, 0x27d1c0, 0x281764, {
        d0: 5, d1: direction, d2: ram.u32(a6 + S.posX), d3, d4: 0, d5: 0,
      });

      if (flags & 0x20) {
        const sweep = ram.u8(a5 + R.rec32);
        ram.setU8(a5 + R.rec32, sweep - 1);
        if (sweep === 0) {
          ram.setU8(a5 + R.rec32, ram.u8(a5 + R.rec33));
          ram.setU8(a6 + 1, ram.u8(a6 + 1) & 0xdf);
          ram.setU8(a5 + R.rec30, 0);
          ram.setU8(a5 + R.rec1C, 0x10);
          ram.setU16(a5 + R.rec18, 3);
        }
      } else if (ram.u8(a5 + R.rec1E) !== 0) {
        ram.setU8(a5 + R.rec1E, ram.u8(a5 + R.rec1E) - 1);
      } else {
        ram.setU8(a5 + R.rec1E, ram.u8(a5 + R.rec1F));
        ram.setU8(a5 + R.rec1C, 4);
        const phase = (ram.u8(a5 + R.rec30) + 1) & 0xff;
        ram.setU8(a5 + R.rec30, phase);
        if (phase === ram.u8(a5 + R.rec31)) {
          ram.setU8(a5 + R.rec1C, 0x10);
          ram.setU8(a6 + 1, ram.u8(a6 + 1) | 0x20);
        }
      }
    }
  } else {
    if (ram.u8(a5 + R.rec1C) !== 0) {
      ram.setU8(a5 + R.rec1C, ram.u8(a5 + R.rec1C) - 1);
    } else {
      const old = ram.u8(a5 + R.rec22);
      ram.setU8(a5 + R.rec22, old - 1);
      if (old === 0) {
        ram.setU8(a5 + R.rec22, ram.u8(a5 + R.rec23));
        const cursor = u16(ram.u16(a5 + R.rec20) - 4);
        ram.setU16(a5 + R.rec20, cursor);
        if (cursor === 0x38) {
          ram.setU8(a5 + R.rec1C, u16(0x40 - ram.u16(G.b6)) & 0xff);
          ram.setU16(a5 + R.rec18, 0);
        }
        updateArt = true;
      }
    }
  }
  if (updateArt)
    ram.setU32(a6 + S.sprite0a, rom.u32(0x27d39c + ram.u16(a5 + R.rec20)));
  draw();
}

function animateDead9CSatellite(ram, rom, child) {
  const old = ram.u8(child + 0x14);
  ram.setU8(child + 0x14, old - 1);                    // $27DD00/$27E10A
  if (old === 0) {
    ram.setU8(child + 0x14, ram.u8(child + 0x15));
    const list = ram.u32(child + 0x10);
    const cursor = ram.u16(child + 0x16);
    ram.setU32(child + S.sprite0a, rom.u32(list + cursor));
    ram.setU16(child + 0x16, cursor === 0 ? 0x0c : cursor - 4);
  }
  enqueueThroughStub(ram, rom, ram.u32(child + 0x30), child);
}

function convert9CSatelliteDeath(ram, rom, child, ctx) {
  ram.setU16(child, 0x8080);
  ram.setU32(child + S.f06, 0xfa00fc00);
  ram.setU16(child + 0x0e, 0x0620);
  ram.setU16(child + S.f1c, 0x001e);
  if (drawSigned242FDE(ram, rom) === 0)
    ram.setU8(child + S.f1c, ram.u8(child + S.f1c) | 0x20);
  const choice = drawByte24311A(ram, rom) * 4;
  ram.setU32(child + 0x10, rom.u32(0x27e3c6 + choice));
  ram.setU8(child + 0x14, 1);
  ram.setU16(child + 0x16, 0x0c);
  ctx.soundPost?.(0x28c25a);
  animateDead9CSatellite(ram, rom, child);             // death falls through
}

function satelliteFireBounds9C(ram, child) {
  const p0 = ram.u16(child + S.posY);
  if (p0 + 0xc800 > 0xffff) return false;
  const p1 = u16(ram.u16(child + S.posX) - 0x1c00);
  return p1 + 0xae00 <= 0xffff;
}

// `$27DD32` and `$27E13C`: paired satellite handlers used only by type $9C.
// They are the Stage-4-specialized siblings of the already translated type
// $11/$10 machines, including their two-hit armor and transformed death art.
function handler9CSatellite(ram, rom, a5, root, child, family11, ctx) {
  if ((ram.u8(child + 1) & 0x80) !== 0) {
    animateDead9CSatellite(ram, rom, child);
    return;
  }

  ram.setU16(child + S.posX,
    ram.u16(child + S.posX) + ram.u16(child + 0x3a));
  ram.setU16(child + S.posY,
    ram.u16(child + S.posY) + ram.u16(child + 0x3c));
  if (i16(ram.u16(child + S.posX)) >= 0x7000)
    ram.setU16(child, 0x8080);

  let firstDeath = false;
  if ((ram.u8(child + 1) & 0x80) === 0) {
    const hit = ram.u8(child) & 0x5c;
    if (hit === 0) {
      ram.setU8(child + S.palette, ram.u8(child + 0x38));
    } else {
      ram.setU8(child, ram.u8(child) & 0xa3);
      scoreHit(ram, ctx, child, hit);
      const palette = ram.u8(child + S.palette) ^ ram.u8(child + 0x39);
      if (i16(ram.u16(child + S.hp)) < 0) {
        if ((ram.u8(child + 1) & 0x40) !== 0) {
          scoreKill(ram, rom, ctx, 0x10, hit);
          effectArmNine(ram, rom, ctx, child, family11 ? 4 : 7,
            REMAP.death267FA0, family11 ? 0x27df7e : 0x27e33c);
          convert9CSatelliteDeath(ram, rom, child, ctx);
          return;
        }
        if (family11) {
          ram.bclr8(child, 1);
          ram.setU16(child + S.hp, 0x00e0);
          scoreKill(ram, rom, ctx, 8, hit);
        } else {
          ram.setU16(child + S.hp, 0x0070);
          scoreByMask(ram, 8, hit);
        }
        ram.bset8(child + 1, 6);
        effectArmNine(ram, rom, ctx, child, 3, REMAP.hit267FAC,
          family11 ? 0x27df3a : 0x27e2f8);
        firstDeath = true;
      } else {
        ram.setU8(child + S.palette, palette);
      }
    }
  }

  enqueueThroughStub(ram, rom, ram.u32(child + 0x30), child);
  if ((ram.u8(child + 1) & 0x40) !== 0) {
    if (ram.u16(0x80390c) !== 0) {
      const d1 = (ram.u32(child + S.posX)
        + (family11 ? 0x0000fe00 : 0x0100fe00)) >>> 0;
      let cursor = u16(ram.u16(child + 0x2c) + 0x24);
      if (cursor === 0x90) cursor = 0;
      ram.setU16(child + 0x2c, cursor);
      enqueueRegistersThroughStub(ram, rom, ram.u32(child + 0x34), d1,
        0x22c59c + cursor, 0x0410, 0x001e);
    }
    return;
  }

  const draw = () => enqueueRegistersThroughStub(ram, rom,
    ram.u32(child + 0x34),
    (ram.u32(child + S.posX) + (family11 ? 0xfa00fa00 : 0xfc00fc00)) >>> 0,
    ram.u32(child + 0x22), family11 ? 0x0830 : 0x0620,
    ram.u16(child + S.f1c));
  if (ram.u16(G.freeze) !== 0) { draw(); return; }

  let old = ram.u8(child + 0x26);
  ram.setU8(child + 0x26, old - 1);
  if (old === 0) {
    ram.setU8(child + 0x26, ram.u8(child + 0x27));
    const r = aim64FromCaller(aimTables(rom), ram, a5,
      u16(ram.u16(child + S.posX) + 0x0200), ram.u16(child + S.posY));
    if (!r.carry) {
      const heading = slew64(ram.u8(child + 0x3e), r.dir);
      ram.setU8(child + 0x3e, heading);
      ram.setU32(child + 0x22, rom.u32((family11 ? 0x268694 : 0x268c9e)
        + ((heading + 1) & 0x3e) * 2));
    }
  }
  if ((ram.u8(child) & 0x20) === 0) { draw(); return; }
  const counter = (ram.u8(child + 0x2e) - 1) & 0xff;
  ram.setU8(child + 0x2e, counter);
  if (counter !== 0 || firstDeath) { draw(); return; }

  ram.setU8(child + 0x2e, u16((family11 ? 0x18 - ram.u16(G.bc)
    : 0xa4 - ram.u16(G.aa))) & 0xff);
  if (!satelliteFireBounds9C(ram, child)
      || playerDist268018(ram, rom, child).carry) { draw(); return; }

  const aimed = aim64FromCaller(aimTables(rom), ram, a5,
    u16(ram.u16(child + S.posX) + 0x0200), ram.u16(child + S.posY));
  if (aimed.carry) { draw(); return; }
  if (family11) {
    const target = (aimed.dir + 2) & 0x3c;
    const current = (ram.u8(child + 0x3e) + 2) & 0x3c;
    if (target !== current && ram.u8(child + 0x2a) === ram.u8(child + 0x2b)) {
      draw(); return;
    }
    ram.setU8(child + 0x2e, ram.u8(child + 0x29));
    old = ram.u8(child + 0x2a);
    ram.setU8(child + 0x2a, old - 1);
    if (old === 0) {
      ram.setU8(child + 0x2a, ram.u8(child + 0x2b));
      ram.setU8(child + 0x2e, u16(0x40 - ram.u16(G.b8)) & 0xff);
    }
  }

  const heading = ram.u8(child + 0x3e);
  const table = family11 ? 0x268494 : 0x268b1e;
  const d2 = (rom.u32(table + ((heading + 1) & 0x3e) * 2)
    + ram.u32(child + S.posX)) >>> 0;
  bullet3C(ram, rom, a5, ctx, family11 ? 0x27df0c : 0x27e2ce, 0x281402, {
    d0: family11 ? 0x0000000c : 0x0000000d,
    d1: (family11 ? aimed.dir : heading + 2) & 0x3c,
    d2, d3: 0x02000000, d4: 0, d5: 0,
  });
  draw();
}

// `$27AEE0`: Stage-4 type $9C root plus five normal or two mirrored paired
// satellites. All children are subrecords of the same enemy allocation.
function handler9C(ram, rom, a5, ctx) {
  const root = ram.u32(a5 + R.subRec);
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported)) return;
  const pos = ram.u32(root + S.posX);
  let p = u16((pos & 0xffff) + 0x1c00 + ram.u16(G.scroll));
  let outside = p + 0x9000 > 0xffff;
  if (!outside) {
    p = u16((pos >>> 16) + 0x1a00);
    outside = p + 0x5c00 > 0xffff;
  }
  if (outside) {
    if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; }
  } else ram.setU8(a5 + R.onScreen, 1);

  const drawRoot = () => enqueueThroughStub(ram, rom, 0x23d7da, root);
  if ((ram.u8(root + 1) & 0x80) !== 0) {
    const old = ram.u16(a5 + R.rec24);
    ram.setU16(a5 + R.rec24, old - 1);
    if (old === 0) freeEnemy(ram, a5); else drawRoot();
    return;
  }

  const hit = ram.u8(root) & 0x5c;
  let palette;
  if (hit === 0) {
    palette = ram.u8(a5 + R.rec22);
    if (ram.u16(root + S.hp) < 0x0480 && ram.u16(G.ca) === 0) palette = 0x19;
  } else {
    ram.setU8(root, ram.u8(root) & 0xa3);
    scoreHit(ram, ctx, root, hit);
    palette = ram.u8(root + S.palette);
    if (palette === 0x19) palette = ram.u8(a5 + R.rec22);
    palette ^= ram.u8(a5 + R.rec23);
    if (i16(ram.u16(root + S.hp)) < 0) {
      scoreKill(ram, rom, ctx, 0x0133, hit);
      ctx.soundPost?.(0x28c2dc);
      ram.setU16(root, 0x8080);
      ram.setU8(root + S.palette, ram.u8(a5 + R.rec22));
      ram.setU16(root + S.hit10, 0x18);
      const rows = [
        [0x85, 0x0000, 0x0000, 0x0400, 0x0700, 0, 0],
        [0x85, 0xfc00, 0x0800, 0x0400, 0x0740, 2, 0],
        [0x85, 0xf200, 0x0000, 0x0400, 0x0880, 4, 0],
        [0x85, 0xfc00, 0xf800, 0x0400, 0x07c0, 6, 0],
        [0x85, 0x0600, 0xf600, 0x0000, 0x04d0, 8, 0x40],
        [0x0d, 0x0200, 0x0600, 0x0400, 0x0430, 0x0a, 0],
        [0x85, 0xf000, 0x0a00, 0x0000, 0x0450, 0x0c, 0],
        [0x0d, 0xf000, 0xfa00, 0x0400, 0x04b0, 0x0e, 0],
        [0x0d, 0xf400, 0x0000, 0x0400, null, 0x10, 0],
      ];
      for (const [kind, ny, nx, sub14, speed, delay, f1c] of rows) {
        const e = spawnEffect(ram, ctx, kind, 0x27b0ae);
        ram.setU32(e + B.pos, ram.u32(root + S.posX));
        ram.setU16(e + B.bucket, 8);
        ram.setU16(e + B.sub12, 0);
        ram.setU16(e + B.sub14, sub14);
        ram.setU16(e + B.nudge, ny);
        ram.setU16(e + B.nudge + 2, nx);
        ram.setU16(e + B.hook, 1);
        if (speed !== null) ram.setU16(e + B.speed, speed);
        if (f1c !== 0) ram.setU8(e + B.f1c, f1c);
        ram.setU16(e + B.delay, delay);
      }
      freeEnemy(ram, a5);
      return;
    }
  }
  ram.setU8(root + S.palette, palette);

  if (ram.u16(G.freeze) === 0 && i16(ram.u16(root + S.posX)) >= 0x0800) {
    const old = ram.u8(a5 + R.rec26);
    ram.setU8(a5 + R.rec26, old - 1);
    if (old === 0) {
      ram.setU8(a5 + R.rec26, ram.u8(a5 + R.rec2A));
      const flags = ram.u8(root + 1);
      let d1 = ram.u8(a5 + R.rec28) * 3;
      if (ram.u8(root + S.f1c) === 0x40) d1 = -d1;
      d1 = (d1 + ram.u8(a5 + R.rec2B)) & 0xff;
      const d3 = (rom.u32(0x2735fa + ((d1 + 2) & 0xfc))
        + (((0x0600 << 16) | ram.u16(a5 + R.rec2C)) >>> 0)) >>> 0;
      bullet3C(ram, rom, a5, ctx, 0x27afcc, 0x281764, {
        d0: 0xfffe0013, d1, d2: ram.u32(root + S.posX), d3, d4: root, d5: 0,
      });
      const n = (ram.u8(a5 + R.rec28) + 1) & 0xff;
      ram.setU8(a5 + R.rec28, n);
      if (n === ram.u8(a5 + R.rec29)) {
        ram.setU8(a5 + R.rec28, 0);
        ram.setU8(root + 1, flags ^ 0x40);
        ram.setU8(a5 + R.rec26, ram.u8(a5 + R.rec27));
      }
    }
  }

  if (ram.u8(root + S.anim) !== 0) {
    const old = ram.u8(a5 + R.rec1E);
    ram.setU8(a5 + R.rec1E, old - 1);
    if (old === 0) {
      ram.setU8(a5 + R.rec1E, ram.u8(a5 + R.rec1F));
      const cursor = ram.u16(a5 + R.rec20);
      ram.setU32(root + S.sprite0a, rom.u32(0x27b07c + cursor));
      ram.setU16(a5 + R.rec20, cursor === 0 ? 0x0c : cursor - 4);
    }
    const dx = ram.u16(a5 + R.rec18), dy = ram.u16(a5 + R.rec1A);
    ram.setU16(root + S.posX, ram.u16(root + S.posX) + dx);
    ram.setU16(root + S.posY, ram.u16(root + S.posY) + dy);
    ram.setU16(a5 + R.rec1C, ram.u16(a5 + R.rec1C) - dx);
  }

  drawRoot();
  const family11 = ram.u8(root + S.f1c) === 0x40;
  const count = family11 ? 2 : 5;
  let child = root + 0x20, anyAlive = false;
  for (let i = 0; i < count; i++, child += 0x40) {
    handler9CSatellite(ram, rom, a5, root, child, family11, ctx);
    if ((ram.u8(child + 1) & 0x80) === 0) anyAlive = true;
  }
  if (!anyAlive) ram.bset8(root, 5);
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
  [0x272424, handler55],   // W351: stage-5 burst-firing drifter, spec in T55
  [0x2710e2, handler46],   // W352: stage-5 extend-spawn-retract arm, $55's PARENT, spec in T46
  [0x268e6c, handler1A],   // W365: stage-5 slewing twin-weapon turret -- spec in T1A
  [0x26f5f2, handler4C],   // W372: stage-5 multi-part set piece -- spec in T4C
  [0x270222, handler4E],   // W482: type $4C's paired child, splitting into type $4F
  [0x2702e6, handler4F],   // W483: type $4E's nested child, decelerating then accelerating
  [0x270446, handler50],   // W484: type $4C's part-4 child, expiring into type $51
  [0x270516, handler51],   // W485: type $50's terminal child, reversing then leaving the screen
  [0x270694, handler52],   // W481: type $4C's first live runtime-selected child
  [0x270c66, handler58],   // W487: type $4C's paired state-4 child
  [0x2a4606, handler2A4606],  // W363: HIBACHI, stage 5's boss-route root -- spec in TB0. Its body
                              // $2A6B94 is a note(), so it appears and lets the stage clear but does
                              // not attack. Registered because the stage-clear path is COMPLETE.
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
  [0x27d072, handlerA2],          // W213: Stage-4 opening/rotating gun pod $A2
  [0x27aee0, handler9C],          // W214: Stage-4 root ship and satellite array
  [0x27b78a, handler9D],          // W215: Stage-4 three-part carrier type $9D
  [0x27c2fc, handler9E],          // W215: type-$9D spawned child type $9E
  [0x27d674, handlerA3],          // W216: Stage-4 oscillating linked carrier $A3
  [0x27cf0c, handlerA1],          // W217: Stage-4 reverse-animated structure $A1
  [0x27c81a, handler9F],          // W218: Stage-4 final pre-boss structure $9F
  [0x27db30, handlerA4],          // W218: type-$9F deferred fragment $A4
  [0x270e36, handler45],          // W316: Stage-5 ramped four-state turret $45
  [0x265a14, handler59],          // W317: Stage-5 timed type-$3F spawner $59
  [0x2764d2, handler8E],          // W319: Stage-5 zoom-drawn tracking turret $8E
  [0x269350, handler1B],          // W323: Stage-1 four-state ramped aimed-pair turret $1B
  [0x267c70, handler01],          // W325: the P2-driven item spawner, type $01
  [0x274076, handler81],          // W326: Stage-5 armoured four-state twin-muzzle $81
  [0x271640, handler49],          // W335: Stage-5 sweeping fan emplacement $49
  [0x271a64, handler4A],          // W337: Stage-5 seven-way aimed fan turret $4A
  [0x271d48, handler4B],          // W338: Stage-5 four-shot sweeping turret $4B
  [0x27133a, handler48],          // W339: Stage-5 five-way aimed fan turret $48
  [0x26d7d0, handler47],          // W340: Stage-5 scroll-stopping set-piece $47 ($E2 records)
  [0x26de32, handler43],          // W341: Stage-5 screen-anchored three-state effect object $43
  [0x26e02a, handler44],          // W400: $43's ramp-$3C child -- the LAST two $261100 pushes
  [0x29ef0a, handlerBoss29EF0A],  // W219: Stage-4 Type-$40 boss bootstrap
  [0x2a3840, handler41],          // W223: Stage-4 boss A1/E5 missile type $41
  [0x2a3af6, handler42],          // W256: Stage-4 boss children type $42
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

// Type $55 -- stage 5's burst-firing drifter. Read across W345..W351; the handler is NOT written yet,
// but every field below is measured, and `w346typetable.test.js` checks init/initBody/handler against the
// cartridge's own type table on every run so this cannot drift from $267824 unnoticed.
//
// THE THREE THINGS THAT WOULD BREAK A PORT WRITTEN FROM A CASUAL READ:
//
//  1. The arms are a FALL-THROUGH CASCADE, not a switch, and mode 2 PROMOTES ITSELF to 3 mid-cascade at
//     $2725B0 -- the very next test reads the new value, so the finale runs on the same tick the drift
//     table finishes. A switch or else-if delays it one frame.
//  2. ($2E,A5) is a BURST COUNTER, not a pattern selector. One aim at the burst's first volley
//     (counter == reload), the ordinary 15-shot volley each step, the 20-shot volley as the FINALE when
//     it reaches zero. The two volleys differ in emit routine AND angle step, not just in size.
//  3. The sinusoid is BACKED OUT at $2724AE before being re-applied. Accumulating instead drifts the
//     record off screen at one offset per frame.
//
// And two operator-level traps: $2724FE is an EQUALITY test where $2725A0 is a THRESHOLD, and the bounds
// test's two sequential `addi.w` do NOT fold into one (same sum, different carry, opposite despawn).
const T55 = Object.freeze({
  init: 0x272390, initBody: 0x272398, handler: 0x272424,
  recordProto: 0x2723ea, recordWords: 15,     // W345: $2723EA + $3E, overlaps the handler by FOUR bytes
  damageMask: 0x5c, damageClear: 0xa3,        // $272448/$272450 -- the SIXTH $5C-family member
  palBase: 0x18, palXor: 0x19,                // $27249A base, $272460 XOR
  killScore: 0x113,                           // $272472, through $28615E not $286096
  deathCue: 0x28c2dc,                         // $27247E -- identical to T49's
  deathList: 0x272850,                        // $272488 lea (PC) -- walked by $270D92
  deathExit: 0x263762,                        // $272492 JMP -- it neither frees nor marks-and-continues
  hpFull: 0x1100, invulnAt: 0x30,             // $272442 / $27242C -- ($30,A5) TIMES the window
  onScreenAt: 0x16,                           // $2724DA -- same offset and meaning as $4B's
  boundsBias: [0x1400, 0x7400],               // $2724C0/$2724C4 -- SEPARATE adds, see the note above
  pauseAll: 0x8130d2, pauseVolley: 0x8130d4,  // $2724A0 skips everything; $2725CE skips only the volley
  modeAt: 0x17,                               // 0 arm A, 1 stationary, 2 drift+promote, 3 fire, 4+ drift
  cursorAt: 0x1e, cursorStride: 0x10,         // $2724F8/$27259A
  cursorArmAEnd: 0x80, cursorEnd: 0xf0,       // $2724FE EQUALITY / $2725A0 THRESHOLD
  driftTimerAt: 0x1c, driftTimerReloadAt: 0x1d,
  driftTable: 0x272750, driftEntries: 16,     // W346: $272750+$100, bounded by ADJACENCY to deathList
  sineAmp: 0x28, phaseAt: 0x2c, phaseStep: 2, offsetAt: 0x2a,   // $272544/$272548/$27254C/$272556
  rampAt: 0x32, rampStep: 0x40, rampCap: 0x600,                 // $272566/$272570
  aimAt: 0x28,                                // $272606/$27260C -- the cached aim, byte
  fireAt: 0x26, fireReloadAt: 0x27,           // $2725C0 / $27271C
  burstAt: 0x2e, burstReloadAt: 0x2f,         // THE BURST COUNTER -- see note 2
  aimXBias: -0x600, fireXGate: 0x2000,        // $2725F4 / $2725D8
  aimFallback: 0x80,                          // $272602 -- the carry exit's default angle
  vectorTable: 0x2735fa,                      // $272634, inside W30's $2735F0+$220 window
  speedBias: 0x02000000,                      // $27261A D5
  // W351: the angle offsets are stored LITERALLY, not as (passes, perPass, step, interCluster) for a
  // loop to reconstruct. The first attempt at this handler did reconstruct them, and needed a fix-up
  // term (`interCluster - step`) to cancel the trailing per-shot step -- arithmetic reasoned out rather
  // than read, which is why that attempt was reverted. These lists come straight off the instruction
  // sequence, and each one is exactly symmetric about the aim, which is the check that they are right.
  //
  // ordinary: subi.w #$34 then per pass {emit, +4, emit, +4, emit, +$10}  x5   ($27262C..$27267E)
  // finale:   subi.w #$22 then per pass {emit, +2 x4 ..., +$C}            x4   ($27268C..$27270A)
  // `sites` are the literal `jsr` addresses, in order, because `ctx.bulletSpawn?.(site, ...)` wants the
  // CALL SITE and the emits are unrolled -- so the site cycles per shot within a pass:
  // `sites[i % sites.length]`. Counted off the bytes in W351, not inferred from the pass structure.
  volleyOrdinary: Object.freeze({
    emit: 0x2816f6, backoff: 0x34, d0: 0xffff0005,
    sites: Object.freeze([0x272648, 0x27265e, 0x272674]),
    angles: Object.freeze([
      -0x34, -0x30, -0x2c, -0x1c, -0x18, -0x14, -0x04, 0x00,
      0x04, 0x14, 0x18, 0x1c, 0x2c, 0x30, 0x34,
    ]),                                       // 15 shots, -$34..+$34
  }),
  volleyFinale: Object.freeze({
    emit: 0x281744, backoff: 0x22, d0: 0xffff0004,
    sites: Object.freeze([0x2726a8, 0x2726be, 0x2726d4, 0x2726ea, 0x272700]),
    angles: Object.freeze([
      -0x22, -0x20, -0x1e, -0x1c, -0x1a, -0x0e, -0x0c, -0x0a, -0x08, -0x06,
      0x06, 0x08, 0x0a, 0x0c, 0x0e, 0x1a, 0x1c, 0x1e, 0x20, 0x22,
    ]),                                       // 20 shots, -$22..+$22
  }),
  enqueue: 0x23df86,                          // $272748 -- enqueueRegistersThroughStub
});

// $272722 -- the shared tail EVERY arm falls into: a drift-table walk and a sprite enqueue.
function tail55(ram, rom, a5, a6) {
  const at = T55.driftTable + ram.u16(a5 + T55.cursorAt);    // $272728 adda.w ($1e,A5),A0
  const d2 = rom.u32(at);                                    // $27272C move.l (A0),D2
  const biased = i32(ram.u32(a6 + 0x02) + rom.u32(at + 4));  // $272732 add.l ($4,A0),D1
  // $272736 swap D1 / $272738 add.w ($32,A5),D1 -- the ramp lands on the SWAPPED half.
  const swapped = ((biased >>> 16) | (biased << 16)) >>> 0;
  const d1 = ((swapped & 0xffff0000) | u16((swapped & 0xffff) + ram.u16(a5 + T55.rampAt))) >>> 0;
  enqueueRegistersThroughStub(ram, rom, T55.enqueue, {
    d1,
    d2,
    d3: rom.u16(at + 8),                                     // $27273E move.w ($8,A0),D3
    d4: ram.u8(a6 + 0x1d),                                   // $272744 -- zero-extended by the moveq
  });
}

// $2725C0's volley. ONE aim per burst, the ordinary 15-shot pattern each step, the 20-shot FINALE when
// the burst counter reaches zero. The offsets and jsr sites come from T55, which
// tests/w351volleyangles.test.js rebuilds from the cartridge every run -- do NOT reconstruct them here.
function fire55(ram, rom, a5, a6, ctx) {
  if (ram.u16(T55.pauseVolley) !== 0) return;                // $2725CE -- skips the volley, NOT the tail
  if (i16(ram.u16(a6 + 0x02)) <= T55.fireXGate) return;      // $2725D8 cmpi.w #$2000 / ble

  // $2725E2 -- re-aim ONLY while the counter still equals its reload, i.e. the burst's FIRST volley.
  if (ram.u8(a5 + T55.burstAt) === ram.u8(a5 + T55.burstReloadAt)) {
    const target = targetSelect(ram, a5);                    // the bsr $24270A inside $24226E
    const angle = target === null
      ? T55.aimFallback                                      // $272602 -- the carry exit default $80
      : aim256(aimTables(rom), u16(ram.u16(a6 + 0x02) + T55.aimXBias), ram.u16(a6 + 0x04),
        ram.u16(target + 0x02), ram.u16(target + 0x04));
    ram.setU8(a5 + T55.aimAt, angle & 0xff);                 // $272606 move.b D1,($28,A5)
  }

  // $272624 -- counter at zero picks the OTHER pattern, through the OTHER emit, with a tighter step.
  const v = ram.u8(a5 + T55.burstAt) === 0 ? T55.volleyFinale : T55.volleyOrdinary;
  const base = ram.u8(a5 + T55.aimAt);
  const ctxB = { ram, rom, log: new WriteLog(ram) };
  v.angles.forEach((off, i) => {
    const d1 = (base + off) & 0xff;
    const idx = (d1 + 2) & 0xfc;                             // addq.w #2,D3 / andi.w #$fc,D3
    const regs = {
      d0: v.d0,                                              // $272610 / $272686
      d1,
      d2: ram.u32(a6 + 0x02),                                // $272616
      d3: i32(rom.u32(T55.vectorTable + idx) + T55.speedBias), // move.l (A0,D3.w),D3 / add.l D5,D3
      d4: 0,
      d5: T55.speedBias,                                     // $27261A
      a5,
    };
    ctx.bulletSpawn?.(v.sites[i % v.sites.length], fireBullet(ctxB, v.emit, regs));
  });
}

function handler55(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);

  // $272424 -- ($17,A5) ENABLES the spawn-invulnerability window; ($30,A5) TIMES it.
  if (ram.u8(a5 + T55.modeAt) !== 0 && ram.u16(a5 + T55.invulnAt) !== 0) {
    ram.setU16(a6 + 0x18, 0x7fff);                           // $272434 -- HP pinned while it runs
    const left = u16(ram.u16(a5 + T55.invulnAt) - 1);        // $27243A
    ram.setU16(a5 + T55.invulnAt, left);
    if (left === 0) ram.setU16(a6 + 0x18, T55.hpFull);       // $272442 -- real HP on the expiry frame
  }

  // $272448 -- the $5C damage arm; $55 is that family's sixth member.
  const hit = ram.u8(a6) & T55.damageMask;
  if (hit !== 0) {
    ram.setU8(a6, ram.u8(a6) & T55.damageClear);             // $272450
    scoreHit(ram, ctx, a6, hit);                             // $272456 jsr $286096
    ram.setU8(a6 + 0x1d,
      (ram.u8(a6 + 0x1d) ^ ram.u8(a5 + T55.palXor)) & 0xff);  // $27245C..$272466
    if ((ram.u16(a6 + 0x18) & 0x8000) !== 0) {               // $27246A tst.w ($18,A6) / bpl
      scoreKill(ram, rom, ctx, T55.killScore, hit);          // $272478 jsr $28615E
      ctx.soundPost?.(T55.deathCue);                         // $27247E
      walkDeathSpawns270D92(ram, rom, ctx, T55.deathList,
        ram.u32(a6 + 0x02), 0x27248e);                       // $272488/$27248E
      return;                                                // $272492 JMP $263762 -- no self-free
    }
  } else {
    ram.setU8(a6 + 0x1d, ram.u8(a5 + T55.palBase));          // $27249A -- the not-hit path
  }

  // $2724A0 -- THIS pause skips the entire alive path. Distinct from the volley's $8130D4; folding the
  // two into one frozen check changes behaviour under one of them.
  if (ram.u16(T55.pauseAll) !== 0) { tail55(ram, rom, a5, a6); return; }

  // $2724AA -- back LAST frame's sinusoid offset OUT before anything re-applies it. Accumulating
  // instead walks the record off screen at one offset per frame.
  ram.setU16(a6 + 0x02, u16(ram.u16(a6 + 0x02) - ram.u16(a5 + T55.offsetAt)));
  scrollCompensate(ram, a5);                           // $2724B6 jsr $24179E

  // $2724BC -- TWO sequential adds. The carry comes off the SECOND and they must NOT be folded into
  // one addi.w #$8800: same sum, different carry, opposite despawn decision.
  const first = u16(ram.u16(a6 + 0x02) + T55.boundsBias[0]); // $2724C0
  const offScreen = first + T55.boundsBias[1] > 0xffff;      // $2724C4/$2724C8 bcc == on screen
  if (offScreen) {
    if (ram.u8(a5 + T55.onScreenAt) !== 0) return;           // $2724CC/$2724D2 JMP $263762
  } else {
    ram.setU8(a5 + T55.onScreenAt, 1);                       // $2724DA -- arm it
  }

  // $2724E0 -- THE CASCADE. Successive ifs, never else-if: the mode-2 arm promotes itself to 3 below
  // and the very next test must see the new value in the SAME frame, or the finale is a frame late.
  const mode = () => ram.u8(a5 + T55.modeAt);
  if (mode() === 0) {                                        // $2724E0 cmpi.b #$0 / bne
    if (due8(ram, a5 + T55.driftTimerAt)) {                  // $2724EA
      ram.setU8(a5 + T55.driftTimerAt, ram.u8(a5 + T55.driftTimerReloadAt));   // $2724F2
      ram.setU16(a5 + T55.cursorAt,
        u16(ram.u16(a5 + T55.cursorAt) + T55.cursorStride)); // $2724F8
      if (ram.u16(a5 + T55.cursorAt) === T55.cursorArmAEnd) { // $2724FE -- EQUALITY, not >=
        ram.setU16(a6, 0xa001);                              // $272508
        ram.setU8(a5 + T55.modeAt, 2);                       // $27250C writes #$1, $272512 overwrites
        ram.setU16(a5 + 0x20, 4);                            // $272518
        ram.setU16(a5 + 0x22, 0xfffd);                       // $27251E -- -3
      }
    }
  }
  if (mode() >= 2) {                                         // $272536 cmpi.b #$2 / blt
    // $272540 -- the sinusoid, cached at ($2A,A5) so $2724AE can back it out next frame.
    const d2 = ctx.tables.shotVector(T55.sineAmp, ram.u8(a5 + T55.phaseAt)).dy;  // jsr $241D34
    ram.setU8(a5 + T55.phaseAt,
      (ram.u8(a5 + T55.phaseAt) + T55.phaseStep) & 0xff);    // $27254C addq.b #2
    ram.setU16(a5 + T55.offsetAt, u16(d2));                  // $272556
    ram.setU16(a6 + 0x02,
      u16(ram.u16(a6 + 0x02) + ram.u16(a5 + T55.offsetAt))); // $27255A..$272562
    if (ram.u16(a5 + T55.rampAt) < T55.rampCap) {            // $272566 cmpi.w #$600 / bcc
      ram.setU16(a5 + T55.rampAt, u16(ram.u16(a5 + T55.rampAt) + T55.rampStep));  // $272570
      ram.setU16(a6 + 0x10, u16(ram.u16(a6 + 0x10) + T55.rampStep));              // $272576
    }
  }
  if (mode() === 2) {                                        // $272582 cmpi.b #$2 / bne
    if (due8(ram, a5 + T55.driftTimerAt)) {                  // $27258C
      ram.setU8(a5 + T55.driftTimerAt, ram.u8(a5 + T55.driftTimerReloadAt));   // $272594
      const next = u16(ram.u16(a5 + T55.cursorAt) + T55.cursorStride);          // $27259A
      ram.setU16(a5 + T55.cursorAt, next);
      if (next >= T55.cursorEnd) {                           // $2725A0 -- THRESHOLD, not equality
        ram.setU16(a5 + T55.cursorAt, T55.cursorEnd);        // $2725AA -- CLAMP, not wrap
        ram.setU8(a5 + T55.modeAt, 3);                       // $2725B0 -- read by the NEXT test
      }
    }
  }
  if (mode() === 3) {                                        // $2725B6 cmpi.b #$3 / bne
    if (due8(ram, a5 + T55.fireAt)) {                        // $2725C0
      ram.setU8(a5 + T55.fireAt, 0x10);                      // $2725C8
      fire55(ram, rom, a5, a6, ctx);
      // $27270E -- step the burst; on underflow reload BOTH the burst counter and the fire timer.
      const b = ram.u8(a5 + T55.burstAt);
      ram.setU8(a5 + T55.burstAt, (b - 1) & 0xff);
      if (b === 0) {
        ram.setU8(a5 + T55.burstAt, ram.u8(a5 + T55.burstReloadAt));   // $272716
        ram.setU8(a5 + T55.fireAt, ram.u8(a5 + T55.fireReloadAt));     // $27271C
      }
    }
  }
  tail55(ram, rom, a5, a6);                                  // $272722
}

// ============================================ TYPE $46 (W352) ============
// Stage 5's extend-spawn-retract arm, and `$55`'s parent. Thirteen script records at clocks
// $D0 $D4 $E4 $E6 $F6 $106 $108 $116 $119 $127 $129 $138 $13B.
//
// NOT ONE NEW PRIMITIVE, same as $45 and $55: all nine callees were already ported.
//
// THREE THINGS A CASUAL PORT GETS WRONG HERE:
//
//  1. The bounds test is ONE SIGNED LONG operation -- ext.l then addi.l #$4000 then cmpi.l #$2000 --
//     the exact mirror of $55's two word adds that must not be folded. Same family, opposite hazard.
//  2. Mode 1's ramp is LATCHED: `tst.w ($1C,A5)` makes the X > $3C00 gate apply only while the ramp is
//     still zero. Re-checking X every frame stalls the ramp whenever the record drifts back.
//  3. `move.w #$28,($1E,A5)` writes TWO BYTE FIELDS -- ($1E)=0 and ($1F)=$28 -- so the mode-2 timer
//     borrows on its first decrement and the arm fires IMMEDIATELY, then every $29 frames. Writing
//     ($1E) = $28 would delay the first spawn by $29 frames.
//
// AND MODE 3 IS UNREACHABLE. Mode 0 -> 1, 1 -> 2, 2 -> 4, 3 -> 4; nothing anywhere writes 3. The one
// candidate was $2711FA handing the child a back-pointer, but $55's init copies that to ($30,A5) at
// $2723B2 and its own 15-word prototype overwrites ($30,A5) with $0010 six instructions later, so the
// pointer never survives to be used. The arm is `unreached()` rather than implemented: giving it a
// promotion would invent a transition the cartridge cannot make.
const T46 = Object.freeze({
  init: 0x27102c, initBody: 0x271034, handler: 0x2710e2,
  recordProto: 0x2710b8, recordWords: 7,      // $271046 moveq #$6,D0 -- D0+1, copied to ($16,A5)
  subProto: 0x2710c6,                         // $20 bytes, OVERLAPS the handler at $2710E2 by FOUR
  clockAt: 0x22,                              // $271054 -- the spawn clock, stored in the record
  delayAt: 0x18,                              // NOT a palette base: $27115A decrements it
  onScreenAt: 0x16,                           // $2710FA/$27110A -- the once-on-screen latch
  modeAt: 0x17,
  rampTimerAt: 0x1a, rampTimerReloadAt: 0x1b, // the prototype's 02 02
  rampAt: 0x1c, rampStep: 4, rampEnd: 0x1c,   // seven steps of 4, clamped both ends
  fireAt: 0x1e, fireReloadAt: 0x1f,
  countAt: 0x20,                              // $2711D0 -- RNG 2..5, purpose not yet established
  pauseAll: 0x8130d2,                         // skips the WHOLE alive path, tail only
  boundsBias: 0x4000, boundsLimit: 0x2000,    // ONE signed long compare, see note 1
  boxX: Object.freeze([0x5000, 0x7000]),      // $271132/$27113C -- exclusive both ends
  boxY: Object.freeze([0x0000, 0x3800]),      // $271146/$271150 -- exclusive both ends
  rampGateX: 0x3c00,                          // $27118C, latched by tst.w ($1C,A5)
  delayMask: 0x3f, delayFloor: 0x20,          // $271168 -- reload = RNG & $3F + $20, so $20..$5F
  child: 0x55,                                // $2711EC moveq #$55,D0
  drawTable: 0x271264,                        // lea ($26,PC),A0 at $27123C -- EIGHT longs
  drawBias: 0xf000f000, drawD3: 0x1080, drawStub: 0x23dece,
  // The init's five spawn-clock equality tests. Each `bne` skips only its own store, and any clock not
  // listed keeps the prototype's $20 -- which is exactly the FLOOR of the random reload range.
  // tests/w352type46script.test.js proves all five are real $46 spawns and that eight records default.
  clockDelays: Object.freeze([
    [0x0e6, 0x60], [0x0e4, 0xf0], [0x108, 0x40], [0x106, 0xf0], [0x116, 0x80],
  ]),
});

// $27123C -- the tail every arm falls into. Same shape as $55's and the other fifteen sites sharing
// `adda.w <cursor>,A0 / move.l (A0),D2`.
function tail46(ram, rom, a5, a6) {
  enqueueRegistersThroughStub(ram, rom, T46.drawStub,
    u32(ram.u32(a6 + 0x02) + T46.drawBias),               // $271248/$27124C -- packed-long BORROW
    rom.u32(T46.drawTable + ram.u16(a5 + T46.rampAt)),    // $27123C..$271246 move.l (A0),D2
    T46.drawD3,                                           // $271252 move.w #$1080,D3
    ram.u8(a6 + 0x1d));                                   // $271256 moveq #$0,D4 / move.b ($1D,A6),D4
}

function handler46(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);

  // $2710E2 -- ONE signed long compare. Splitting this into word steps changes the branch, the mirror
  // of $55's two-adds trap.
  const y = i32(i16(ram.u16(a6 + 0x02)) + T46.boundsBias);
  if (y <= T46.boundsLimit) {                             // $2710F0 cmpi.l #$2000 / bgt
    if (ram.u8(a5 + T46.onScreenAt) !== 0) return;        // $2710FA/$271102 jmp $263762
  } else {
    ram.setU8(a5 + T46.onScreenAt, 1);                    // $27110A
  }
  scrollCompensate(ram, a5);                           // $271110 jsr $24179E

  // $271116 -- the whole-path pause. Distinct from $55's volley-only $8130D4.
  if (ram.u16(T46.pauseAll) !== 0) { tail46(ram, rom, a5, a6); return; }

  const mode = () => ram.u8(a5 + T46.modeAt);

  // $271120 -- mode 0: wait inside a position box, then a random delay, then extend.
  if (mode() === 0) {
    const x = ram.u16(a6 + 0x02);
    const yy = ram.u16(a6 + 0x04);
    const inBox = ram.u8(a5 + T46.onScreenAt) !== 0       // $27112A tst.b / beq
      && i16(x) < T46.boxX[1] && i16(x) > T46.boxX[0]     // $271132 bge / $27113C ble
      && i16(yy) > T46.boxY[0] && i16(yy) < T46.boxY[1];  // $271146 ble / $271150 bge
    if (inBox && due8(ram, a5 + T46.delayAt)) {           // $27115A subq.b #1 / bcc
      const r = (drawWord242EC2(ram, rom) & T46.delayMask) + T46.delayFloor;   // $271162..$27116C
      ram.setU8(a5 + T46.delayAt, r & 0xff);              // $271170
      ram.setU8(a5 + T46.modeAt, 1);                      // $271174
    }
  }

  // $27117A -- mode 1: the LATCHED ramp out. The X gate applies only before the first step.
  if (mode() === 1) {
    const started = ram.u16(a5 + T46.rampAt) !== 0;       // $271184 tst.w ($1C,A5) / bne
    if ((started || i16(ram.u16(a6 + 0x02)) > T46.rampGateX)   // $27118C cmpi.w #$3C00 / ble
      && due8(ram, a5 + T46.rampTimerAt)) {               // $271196
      ram.setU8(a5 + T46.rampTimerAt, ram.u8(a5 + T46.rampTimerReloadAt));    // $27119E
      const next = u16(ram.u16(a5 + T46.rampAt) + T46.rampStep);              // $2711A4
      ram.setU16(a5 + T46.rampAt, next);
      if (next >= T46.rampEnd) {                          // $2711A8 cmpi.w #$1C / blt
        ram.setU16(a5 + T46.rampAt, T46.rampEnd);         // $2711B2 -- CLAMP
        ram.setU8(a5 + T46.modeAt, 2);                    // $2711B8
        // $2711BE move.w #$28,($1E,A5) -- TWO byte fields: the timer 0 and the reload $28, so the
        // mode-2 arm below fires on its very next decrement rather than after $29 frames.
        ram.setU16(a5 + T46.fireAt, 0x0028);
        ram.setU16(a5 + T46.countAt, (drawWord242EC2(ram, rom) & 0x3) + 2);   // $2711C4..$2711D0
      }
    }
  }

  // $2711D4 -- mode 2: enqueue the $55 child, hand it the position and a back-pointer, go to mode 4.
  if (mode() === 2) {
    if (due8(ram, a5 + T46.fireAt)) {                     // $2711DE subq.b #1 / bcc
      ram.setU8(a5 + T46.fireAt, ram.u8(a5 + T46.fireReloadAt));    // $2711E6
      const q = enqueueDeferred(ram, T46.child, DEFQ_D1.FIXED00);   // $2711EC/$2711EE
      ram.setU32(q.addr + 0x16, ram.u32(a6 + 0x02));      // $2711F4 -- the spawn position
      ram.setU32(q.addr + 0x1a, a5);                      // $2711FA -- the parent back-pointer, which
      // $55's init copies to ($30,A5) and its own prototype then overwrites. Written because the
      // cartridge writes it, not because anything reads it -- see the mode-3 note on T46.
      ram.setU8(a5 + T46.modeAt, 4);                      // $2711FE -- FOUR, not 3
      ram.setU8(a5 + T46.rampTimerAt, 0x40);              // $271204
    }
  }

  // $27120A -- mode 3, the retract. UNREACHABLE: nothing writes 3 to THIS type's record. Kept as a
  // named throw so that if the cartridge ever gets here the port says so instead of silently
  // drawing a wrong frame.
  //
  // **W444 (D66): THAT PROMISE WAS FALSE, AND IT IS THE W443 SHAPE EXACTLY.** This was written
  // `ctx.unported?.unreached(...)` -- a METHOD on the log. `UnportedLog` implements `note()` and
  // `report()` and NOTHING ELSE, so [M] with a log present it threw a bare `TypeError` that is
  // not an `Unreached` and carries no `romAddress`, and on a bare ctx the `?.` short-circuited to
  // a SILENT NO-OP and the arm below returned -- the quiet wrong frame this comment exists to
  // prevent. It is the free function `unreached` (imported at the top of this file, and what all
  // 197 other sites use) that throws the named error. `w444deferrals.test.js` SECTION 5 fails on
  // any `.unreached(` method call anywhere in src/, so this cannot come back.
  //
  // The claim itself is STILL TRUE and was re-checked this wave: [M] three sites in the image do
  // `move.b #3,($17,A5)` -- $266B0C, $270F52 and $2725B0 -- but all three are OTHER object types
  // over their own A5 ($270F52 is TYPE $45, handlers.js's own `ram.setU8(a5 + 0x17, 3)`), so none
  // of them is this record. "Nothing writes 3" is about type $46 and only type $46.
  if (mode() === 3) {
    unreached(0x27120a, `$27120A type $46 mode 3 (the retract ramp) was entered, but W352 `
      + `established nothing writes 3 to ($17,A5): mode 0 -> 1, 1 -> 2, 2 -> 4, 3 -> 4, and the child's `
      + `back-pointer is destroyed by $55's own prototype at $2723B8. If this fires, that reasoning is `
      + `wrong and the arm needs writing: subq.b #1,($1A,A5) then ($1C,A5) -= 4 to a 0 clamp, then mode 4`);
    return;
  }

  tail46(ram, rom, a5, a6);                               // $27123C
}

// ============================================ TYPE $1A (W353) ============
// Stage 5's slewing twin-weapon turret. FOUR script records, and the last non-boss, non-bundle type
// in the stage. RECON COMPLETE, HANDLER NOT WRITTEN -- `ported: false` below is read by
// `w346typetable.test.js`, which still verifies init/initBody/handler against the cartridge.
//
// These notes have carried for many waves that `$1A` was "blocked on a TRACE at $268D8C (D2/D3
// provenance)". THAT WAS WRONG: D2 is consumed at $268D6E, sixteen bytes before the call, and D0/D1
// there are the record's own position freshly loaded by `movem.w`. Nothing needed tracing.
//
// FOURTEEN CALLEES, EVERY ONE ALREADY PORTED: $2637A2 $26377A $263808 $24203E $242190 $242B3C
// ($242B90 is its D5-returning twin, same table) $23D762 $23DECE $281708 $281744 $289B22 $289004
// $28615E $28C2DC, plus RANK $813092 and the pause $8130D2.
//
// SEVEN THINGS THAT WOULD BREAK A PORT WRITTEN FROM A SIBLING:
//
//  1. The bounds test is TWO sequential word adds with the carry off the SECOND ($1000 then $6E00),
//     like $55 and UNLIKE $46, whose single `addi.l` must not be split. Read it per type.
//  2. The palette pair is at ($1C,A5)/($1D,A5), where $55 keeps it at $18/$19.
//  3. ($28,A5) is the HEADING and ($28,A6) is the ANIMATION CURSOR -- one offset, two structures,
//     both live in this handler. A5 is the record, A6 the sub-record.
//  4. $8130D2 is tested as a WORD at $268EE2 and as a LONG at $268F4A and $269088. The long test
//     covers $8130D4 too, so it checks BOTH pause globals at once.
//  5. The damage arm INSPECTS ($1D,A6) before XORing: if it holds the sentinel $19 the base is
//     substituted first. $49, $4B and $55 all XOR unconditionally.
//  6. Arm 1 selects its target INLINE, honouring the ($3,A5) side preference via `exg A0,A1`.
//     Arm 2 calls $24226E, which selects by the shared rule and ignores ($3,A5). The two arms can
//     legitimately target DIFFERENT players in one frame. Do not unify them.
//  7. ($1E,A5) and ($2E,A5) each have TWO reload sources. Read every reload site, not the first.
// W369: `$1A` IS NOT SPAWNABLE, and the flag below is the whole reason that was invisible for four waves.
// W365 wrote handler1A and REGISTERED it, but left `ported: false` here. That flag makes the two registry
// tests in w346 SKIP the type -- so nobody noticed that the init body $268D26 was never registered at all.
// A missing body is not silent: `runInitBodyAddr` throws by address. So every $1A spawn in stage 5 throws,
// the handler is unreachable, and the stage-5 scope test still reported "$4C alone" because it counts
// HANDLERS, not spawnability.
//
// `ported: false` cannot describe this: the handler IS written. The state is HANDLER PORTED, INIT BODY NOT,
// so it gets its own flag, and W369 asserts all three states agree with the registries.
//
// THE BLOCK IS REAL. $268D8C `jsr $24203E` calls the aim CORE, which takes its target in D2/D3. This body
// never writes D3, and $263808 (readInitPosition) does not either -- so D3 is caller state from somewhere up
// the spawn chain, and the result feeds the record's heading ($29,A5) and velocity long ($24,A5). That is
// gameplay, not cosmetics, so it does not get a note(). W365 declared this "needed no trace at all" having
// resolved D2 only; D3 was never addressed.
//
// AND THE FALLBACK IS DEAD. $268D92 `bcc` guards `move.b ($1B,A6),D1`, but $24203E's last flag-setting
// instruction is `andi.w #$3F,D1` ($2420B4, and $2420BE in the add twin), which always CLEARS carry; its
// early exit is `tst.w D1 / beq $2420C4`, which clears it too. So the branch is always taken and $268D94
// never runs. Sites that CAN take it call $24200A (aim64FromCaller), where the carry is targetSelect's
// "both players dead". Do not copy the $97 idiom's `aimed.carry ? ($1B,A6) : dir` here.
const T1A = Object.freeze({
  init: 0x268d1e, initBody: 0x268d26, handler: 0x268e6c,
  recordProto: 0x268ddc, recordWords: 15,     // $268D3C moveq #$E,D0 -- copied to ($16,A5)
  subProto: 0x268dfa, subRecords: 2,          // $268D1E move.w #$1,($4,A5) -- run length 1 = TWO
  paletteRows: 0x268dd2, paletteRowCount: 5,  // W353 window $268DD2+$68 covers rows + both protos
  artTable: 0x269246, artEntries: 4,          // W353 window $269246+$10, bounded by $1B's init
  headingTable: 0x272c7a,                     // 32 longs, W-existing window $272C7A+$80
  deltaTable: 0x272ffa,                       // already ported
  vectorTable: 0x2735fa,                      // SHARED with $55 (T55.vectorTable), window from W30

  damageMask: 0x5c, damageClear: 0xa3,        // the $5C family's fifth member
  palBase: 0x1c, palXor: 0x1d,                // NOT $18/$19 -- see note 2
  paletteSentinel: 0x19,                      // see note 5
  hpGate: 0x7c0,                              // $268E9E
  killScore: 0x350, deathCue: 0x28c2dc,       // $269160 / $26916C -- the cue $49 and $55 share
  onScreenAt: 0x16,
  boundsBias: Object.freeze([0x1000, 0x6e00]),  // SEPARATE adds -- see note 1
  pauseAll: 0x8130d2,                         // word AND long tested -- see note 4
  rankGlobal: 0x813092, clockGlobal: 0x8130ce,

  headingAt: 0x28,                            // in the RECORD -- see note 3
  cursorAt: 0x28, cursorStep: 4, cursorWrap: 0x10, cursorWrapDown: 0x0c,   // in the SUB-record
  wobbleAt: 0x36, wobbleStep: 0x20, wobbleMask: 0x40,   // a SQUARE wave, not a sine
  sideRefAt: 0x03,                            // the side preference -- see note 6

  // The rank cascade at $268D50 ($813092 <= 1 keeps the first column):
  //   ($2A,A5) = $4 low / $3 high  -> reloads ($2E,A5), arm 2's timer   FASTER at high rank
  //   ($2B,A5) = $4 low / $6 high  -> reloads ($1E,A5), arm 1's timer   SLOWER at high rank
  // Opposite directions, which is the whole point of the cascade.
  rankArm2At: 0x2a, rankArm1At: 0x2b,
  rankLow: Object.freeze([0x4, 0x4, 0x2]), rankHigh: Object.freeze([0x3, 0x6, 0x1]),

  fanTimerAt: 0x1e, fanTimerReloadAt: 0x1f,   // ALSO reloaded from ($2B,A5) at $268FE0
  fanGateAt: 0x22, fanGateReloadAt: 0x23,
  burstAt: 0x20, burstReloadAt: 0x21,         // $55's ($2E/$2F) idiom at different offsets
  fanGateX: 0x1000,                           // $268FD2
  fan: Object.freeze({
    emit: 0x281744,                           // the SAME emit $55's finale uses
    shots: 7, backoff: 0x24, step: 0x0c,      // one emit per pass, NOT unrolled like $55's
    // -$24 -$18 -$0C $00 +$0C +$18 +$24 -- exactly symmetric, which is the check on the reading.
    angles: Object.freeze([-0x24, -0x18, -0x0c, 0x00, 0x0c, 0x18, 0x24]),
    d0: 0x5,                                  // a WORD 5, where $55 passes the long $FFFF0005
    // The speed bias is a $242B90 draw SWAPPED into the high word -- RANDOM per volley, where $55
    // adds a fixed $02000000. Reusing $55's fan with a constant bias gives a uniform-speed volley.
    speedFromRng: true,
  }),

  arm2TimerAt: 0x2e, arm2CountAt: 0x30, arm2CountReloadAt: 0x31,
  arm2GapAt: 0x2f,                            // ($2E,A5)'s OTHER reload -- burst-within-a-burst
  muzzleAimAt: Object.freeze([0x32, 0x33]), muzzleAimFallback: 0x80,
  muzzleYOffset: 0x680, muzzleXOffset: -0x600,
  muzzle: Object.freeze({
    emit: 0x281708,                           // the third emit-family member
    d0: 0x20016,
    // $FA000680 and $F9FFF980. The BORROW rule makes both Xbias $FA00 with Ybias +/-$680: $F980 is
    // negative so $F9FF + 1 = $FA00. Reading $F9FF literally puts muzzle 2 one unit off in X.
    bias: Object.freeze([0xfa000680, 0xf9fff980]),
    // The aim jitter is `asr.b #2` of a $242B3C draw -- ARITHMETIC, so signed: -32..+31, centred.
    jitterShift: 2, jitterSigned: true,
  }),

  drawStubs: Object.freeze([0x23d762, 0x23dece]),   // BOTH, at $269058 and $26907A
  noopJsr: 0x26331c,                          // a bare `rts`. Nothing to port; do not hunt for it.
  // The death arm, $269160..$26925C: killScore, cue, burstBucket with X bias $F800, then a RANK-4-
  // EXACTLY and clock < $2B0 gated MIRROR burst with X bias $0800, then THREE spawnEffect calls --
  // kind $D, kind $5, kind $5 -- whose field setups look alike and carry DIFFERENT velocities.
  burstBucket: 0x289b22,
  burstBias: Object.freeze([0xf8000000, 0x08000000]),
  rank4Exactly: 4, rank4ClockBelow: 0x2b0,
  spawnEffect: 0x289004,
  deathEffectKinds: Object.freeze([0xd, 0x5, 0x5]),
});

// ============================================ TYPE $4E (W482) ==================
// Type $4C emits this one-part child as a mirrored pair. It travels for $28 frames, then replaces itself
// with two type-$4F children. The second child receives two independent word additions, not one packed long
// addition, so neither coordinate can carry into the other.
const T4E = Object.freeze({
  handler: 0x270222,
  child: 0x4f,
  emit: 0x23df2a,
  art: 0x001499cc,
});

/** `$270222` -- stage-5 enemy type $4E, type $4C's paired deferred child. */
function handler4E(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + R.subRec);

  // This calls $241812 directly. Unlike $2417DE, it has no $8130D2 freeze gate.
  const velocity = ctx.tables.vector(ram.u8(a6 + S.speed), ram.u8(a6 + S.heading));
  ram.setU16(a6 + S.posX, u16(ram.u16(a6 + S.posX) + velocity.dy)); // $270234 add.w D2
  ram.setU16(a6 + S.posY, u16(ram.u16(a6 + S.posY) + velocity.dx)); // $270238 add.w D3

  const life = u16(ram.u16(a5 + R.rec18) - 1);             // $27023C subq.w #1
  ram.setU16(a5 + R.rec18, life);
  if (life === 0) {
    const pos = ram.u32(a6 + S.posX);
    const first = enqueueDeferred(ram, T4E.child, DEFQ_D1.FIXED00); // $270244 jsr $263684
    if (!first.dropped) ram.setU32(first.addr + 0x16, pos);          // $27024C

    const second = enqueueDeferred(ram, T4E.child, DEFQ_D1.FIXED00); // $270252 jsr $263684
    if (!second.dropped) {
      ram.setU32(second.addr + 0x16, pos);                           // $27025A
      ram.setU16(second.addr + 0x16,
        u16(ram.u16(second.addr + 0x16) + 0x0a00));                  // $270260 addi.w
      ram.setU16(second.addr + 0x18,
        u16(ram.u16(second.addr + 0x18) + ram.u16(a5 + R.rec1A)));  // $270266 add.w
    }
    freeEnemy(ram, a5);                                             // $27026E jmp $263762
    return;
  }

  enqueueRegistersThroughStub(ram, rom, T4E.emit,
    u32(ram.u32(a6 + S.posX) + 0xfa00ff00), T4E.art,
    0x0608, ram.u8(a6 + S.palette));                                // $270276..$270290
}

// ============================================ TYPE $4F (W483) ==================
// Type $4E emits this child as a pair. It decelerates to zero, reverses heading, accelerates with a
// rank-sensitive second step, and retires with a kind-$04 effect when its shared parent gate clears.
const T4F = Object.freeze({
  handler: 0x2702e6,
  parentPresent: 0x8130e0,
  rank: 0x813098,
  zoomSelect: 0x803910,
  art: 0x2703ba,
  buckets: Object.freeze([7, 22]),
});

/** `$2704AA..$2704C0` -- the one retirement tail shared by types $4F and $50. */
function retire4F50(ram, a5, a6, ctx) {
  const effect = spawnEffect(ram, ctx, 0x04, 0x2704ae);    // $2704AA..$2704AE
  ram.setU32(effect + B.pos, ram.u32(a6 + S.posX));        // $2704B4
  ram.setU16(effect + B.bucket, 0x10);                     // $2704BA
  freeEnemy(ram, a5);                                      // $2704C0 jmp $263762
}

/** `$2702E6` -- stage-5 enemy type $4F, the nested runtime child of type $4E. */
function handler4F(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + R.subRec);

  if (ram.u16(T4F.parentPresent) === 0) {                  // $2702E6 beq.w $2704AA
    retire4F50(ram, a5, a6, ctx);
    return;
  }

  if (offScreen242684(ram, a6)) {                          // $2702F0 jsr $242684
    if (ram.u8(a5 + R.onScreen) !== 0) {                   // $2702F8 tst.b ($16,A5)
      freeEnemy(ram, a5);                                  // $2702FE jmp $263762
      return;
    }
  } else {
    ram.setU8(a5 + R.onScreen, 1);                         // $270306 move.b #1,($16,A5)
  }

  // This calls $241812 directly, so there is no $8130D2 freeze gate.
  const velocity = ctx.tables.vector(ram.u8(a6 + S.speed), ram.u8(a6 + S.heading));
  ram.setU16(a6 + S.posX, u16(ram.u16(a6 + S.posX) + velocity.dy)); // $27031E add.w D2
  ram.setU16(a6 + S.posY, u16(ram.u16(a6 + S.posY) + velocity.dx)); // $270322 add.w D3

  if (ram.u8(a5 + R.rec17) === 0) {                        // $270326 tst.b ($17,A5)
    const speed = (ram.u8(a6 + S.speed) - 1) & 0xff;       // $27032E subq.b #1
    ram.setU8(a6 + S.speed, speed);
    if (speed === 0) {
      ram.setU8(a5 + R.rec17, 1);                          // $270336 move.b #1,($17,A5)
      ram.setU8(a6 + S.heading, 0x20);                     // $27033C move.b #$20,($1B,A6)
    }
  } else {
    ram.setU8(a6 + S.speed, (ram.u8(a6 + S.speed) + 1) & 0xff); // $270346 addq.b #1
    if (ram.u16(T4F.rank) !== 0) {
      ram.setU8(a6 + S.speed, (ram.u8(a6 + S.speed) + 1) & 0xff); // $270354 addq.b #1
    }
  }

  const oldCadence = ram.u8(a5 + R.rec1A);                 // $270358 subq.b #1
  ram.setU8(a5 + R.rec1A, (oldCadence - 1) & 0xff);
  if (oldCadence === 0) {                                  // $27035C bcc skips on no borrow
    ram.setU8(a5 + R.rec1A, ram.u8(a5 + R.rec1B));         // $270360 reload cadence
    let cursor = u16(ram.u16(a5 + R.rec18) + 4);           // $270366 addq.w #4
    if (i16(cursor) >= 0x2c) cursor = 0x14;                 // $27036A..$270374
    ram.setU16(a5 + R.rec18, cursor);
  }

  const cursor = i16(ram.u16(a5 + R.rec18));
  const art = rom.u32(T4F.art + cursor);                    // $27037A..$270384
  const pos = u32(ram.u32(a6 + S.posX) + 0xfa00fc00);      // $270386..$270390
  const bucket = ram.u16(T4F.zoomSelect) !== 0 ? T4F.buckets[1] : T4F.buckets[0];
  enqueueZoomedRegisters(ram, bucket, pos, art, 0x0620,
    ram.u8(a6 + S.palette), 0xf800f800);                    // $270390..$2703B2
}

// ============================================ TYPE $50 (W484) ==================
// Type $4C's part-4 animator emits this child from one randomly selected half. It moves for $30 frames,
// draws fixed art through bucket 2, then replaces itself with type $51. It shares type $4F's parent gate
// and kind-$04 retirement tail at $2704AA.
const T50 = Object.freeze({
  handler: 0x270446,
  parentPresent: 0x8130e0,
  child: 0x51,
  emit: 0x23df2a,
  art: 0x00149978,
});

/** `$270446` -- stage-5 enemy type $50, type $4C's part-4 runtime child. */
function handler50(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + R.subRec);

  if (ram.u16(T50.parentPresent) === 0) {                    // $270446 beq.w $2704AA
    retire4F50(ram, a5, a6, ctx);
    return;
  }

  // This calls $241812 directly, so there is no $8130D2 freeze gate.
  const velocity = ctx.tables.vector(ram.u8(a6 + S.speed), ram.u8(a6 + S.heading));
  ram.setU16(a6 + S.posX, u16(ram.u16(a6 + S.posX) + velocity.dy)); // $270462 add.w D2
  ram.setU16(a6 + S.posY, u16(ram.u16(a6 + S.posY) + velocity.dx)); // $270466 add.w D3

  const life = u16(ram.u16(a5 + R.rec18) - 1);               // $27046A subq.w #1
  ram.setU16(a5 + R.rec18, life);
  if (life === 0) {
    const child = enqueueDeferred(ram, T50.child, DEFQ_D1.FIXED00); // $270472 jsr $263684
    if (!child.dropped) ram.setU32(child.addr + 0x16, ram.u32(a6 + S.posX)); // $27047A
    freeEnemy(ram, a5);                                      // $270480 jmp $263762
    return;
  }

  enqueueRegistersThroughStub(ram, rom, T50.emit,
    u32(ram.u32(a6 + S.posX) + 0xf600fe00), T50.art,
    0x0a10, ram.u8(a6 + S.palette));                         // $270488..$2704A2
}

// ============================================ TYPE $51 (W485) ==================
// Type $50 expires into this child. It enters from off screen, decelerates to zero, reverses, then
// accelerates to a rank-sensitive target while cycling zoom art. Once seen, leaving the screen frees it.
const T51 = Object.freeze({
  handler: 0x270516,
  rank: 0x813098,
  zoomSelect: 0x803910,
  art: 0x2705fc,
  buckets: Object.freeze([7, 22]),
});

/** `$270516` -- stage-5 enemy type $51, type $50's terminal runtime child. */
function handler51(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + R.subRec);

  if (offScreen242684(ram, a6)) {                          // $270516 jsr $242684 / $27051C bcc
    if (ram.u8(a5 + R.onScreen) !== 0) {                   // $27051E tst.b ($16,A5)
      freeEnemy(ram, a5);                                  // $270524 jmp $263762
      return;
    }
  } else {
    ram.setU8(a5 + R.onScreen, 1);                         // $27052C move.b #1,($16,A5)
  }

  // This calls $241812 directly, so there is no $8130D2 freeze gate.
  const velocity = ctx.tables.vector(ram.u8(a6 + S.speed), ram.u8(a6 + S.heading));
  ram.setU16(a6 + S.posX, u16(ram.u16(a6 + S.posX) + velocity.dy)); // $270544 add.w D2
  ram.setU16(a6 + S.posY, u16(ram.u16(a6 + S.posY) + velocity.dx)); // $270548 add.w D3

  if (ram.u8(a5 + R.rec17) === 0) {                        // $27054C tst.b ($17,A5)
    const speed = (ram.u8(a6 + S.speed) - 1) & 0xff;       // $270554 subq.b #1
    ram.setU8(a6 + S.speed, speed);
    if (speed === 0) {
      ram.setU8(a5 + R.rec17, 1);                          // $27055C move.b #1,($17,A5)
      ram.setU8(a6 + S.heading, 0x20);                     // $270562 move.b #$20,($1B,A6)
      ram.setU16(a6 + S.flags, 0x8001);                    // $270568 move.w #$8001,(A6)
    }
  } else if (ram.u16(T51.rank) === 0) {                    // $270570 tst.w $813098
    const speed = ram.u8(a6 + S.speed);
    if (speed !== 0x1c) ram.setU8(a6 + S.speed, (speed + 1) & 0xff); // $27057A..$270584
  } else {
    const speed = ram.u8(a6 + S.speed);
    if (speed < 0x3c) ram.setU8(a6 + S.speed, (speed + 4) & 0xff);   // $27058C..$270596
  }

  const oldCadence = ram.u8(a5 + R.rec1A);                 // $27059A subq.b #1
  ram.setU8(a5 + R.rec1A, (oldCadence - 1) & 0xff);
  if (oldCadence === 0) {                                  // $27059E bcc skips on no borrow
    ram.setU8(a5 + R.rec1A, ram.u8(a5 + R.rec1B));         // $2705A2 reload cadence
    let cursor = u16(ram.u16(a5 + R.rec18) + 4);           // $2705A8 addq.w #4
    if (i16(cursor) >= 0x38) cursor = 0x28;                 // $2705AC..$2705B6
    ram.setU16(a5 + R.rec18, cursor);
  }

  const cursor = i16(ram.u16(a5 + R.rec18));
  const art = rom.u32(T51.art + cursor);                    // $2705BC..$2705C6
  const pos = u32(ram.u32(a6 + S.posX) + 0xf600fa00);      // $2705C8..$2705D2
  const bucket = ram.u16(T51.zoomSelect) !== 0 ? T51.buckets[1] : T51.buckets[0];
  enqueueZoomedRegisters(ram, bucket, pos, art, 0x0a30,
    ram.u8(a6 + S.palette), 0xf800f800);                    // $2705D2..$2705FA
}

// ============================================ TYPE $52 (W481) ==================
// Type $4C enqueues this one-record child from state 2 and its part-3 animator. The child keeps the
// parent presence word `$8130DE` as a lifetime gate, flies and turns through seven independent state bits,
// fires a paired kind-$07 shot, and uses separate static and turning draw tables.
const T52 = Object.freeze({
  handler: 0x270694,
  parentPresent: 0x8130de,
  frame: 0x80390a,
  staticArt: 0x270972,
  turnArt: 0x2709dc,
  emit: 0x23df86,
});

function draw52(ram, rom, a5, a6) {
  const pos = u32(ram.u32(a6 + S.posX) + 0xfa00fc00);     // $270956/$2709BC addi.l
  if (ram.u8(a5 + R.rec17) === 0) {                        // $27093A
    const off = (ram.u8(a6 + S.heading) & 0x0e) * 2;      // $27094A..$270952
    enqueueRegistersThroughStub(ram, rom, T52.emit, pos,
      rom.u32(T52.staticArt + off), 0x0620, ram.u8(a6 + S.palette));   // $270954..$27096A
    return;
  }
  const row = T52.turnArt + (ram.u8(a6 + S.heading) & 0x3e) * 8;      // $27099C..$2709B2
  const art = rom.u32(row + i16(ram.u16(a5 + R.rec1A)));              // $2709B4..$2709BA
  const attr = u32(ram.u8(a6 + S.palette) + rom.u32(row + 0x0c));     // $2709CA..$2709D0
  enqueueRegistersThroughStub(ram, rom, T52.emit, pos, art, 0x0620, attr);   // $2709D4
}

/** `$270694` -- stage-5 enemy type $52, a runtime-selected child of type $4C. */
function handler52(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + R.subRec);
  applyVelocityA6(ram, ctx.tables, a6);                    // $270694 jsr $2417DE

  const life = u16(ram.u16(a5 + R.rec1C) - 1);            // $27069A subq.w #1
  ram.setU16(a5 + R.rec1C, life);
  if (life === 0 || ram.u16(T52.parentPresent) === 0) {    // $27069E..$2706A8
    const effect = spawnEffect(ram, ctx, 0x14, 0x2706d8); // $2706D4..$2706D8
    ram.setU32(effect + B.pos, ram.u32(a6 + S.posX));      // $2706DE
    ram.setU16(effect + B.bucket, 0x10);                   // $2706E4
    ctx.soundPost?.(0x28c2c2);                             // $2706EA
    freeEnemy(ram, a5);                                    // $2706F0
    return;
  }

  const hit = ram.u8(a6 + S.flags) & 0x5c;                // $2706AC..$2706B0
  if (hit !== 0) {
    ram.setU8(a6 + S.flags, ram.u8(a6 + S.flags) & 0xa3); // $2706B4..$2706B8
    scoreHit(ram, ctx, a6, hit);                           // $2706BA
    ram.setU8(a6 + S.palette, ram.u8(a6 + S.palette) ^ 0x0c); // $2706C0..$2706C8
    if (i16(ram.u16(a6 + S.hp)) < 0) {                    // $2706CC/$2706D0
      const effect = spawnEffect(ram, ctx, 0x14, 0x2706d8);
      ram.setU32(effect + B.pos, ram.u32(a6 + S.posX));
      ram.setU16(effect + B.bucket, 0x10);
      ctx.soundPost?.(0x28c2c2);
      freeEnemy(ram, a5);
      return;
    }
  } else {
    ram.setU8(a6 + S.palette, 0x13);                       // $2706F8
  }

  // Bit 3 turns at the three field edges, then slows to speed 8 and enters state 4.
  if ((ram.u8(a5 + R.rec19) & 0x08) !== 0) {              // $2706FE
    if ((ram.u8(a5 + R.rec19) & 0x80) === 0) {            // $270706
      const turn = () => {
        ram.setU8(a6 + S.heading, (ram.u8(a6 + S.heading) + 0x20) & 0x3f);
        ram.setU8(a5 + R.rec19, ram.u8(a5 + R.rec19) | 0x80);
      };
      if (i16(ram.u16(a6 + S.posY)) < 0) turn();           // $27070E..$270722
      if (i16(ram.u16(a6 + S.posY)) > 0x3800) turn();      // $270728..$27073C
      if (i16(ram.u16(a6 + S.posX)) < 0x3200) turn();      // $270742..$270756
    }
    const speed = (ram.u8(a6 + S.speed) - 1) & 0xff;      // $27075C
    ram.setU8(a6 + S.speed, speed);
    if (speed === 8) {
      ram.setU8(a5 + R.rec19, 0x04);                       // $27076E
      ram.setU8(a5 + R.rec17, 0);                          // $270774
    }
  }

  // Bit 0 expands the three-frame turning cursor on even frames.
  if ((ram.u8(a5 + R.rec19) & 0x01) !== 0) {              // $27077A
    ram.setU8(a5 + R.rec17, 1);                            // $270782
    if ((ram.u16(T52.frame) & 1) === 0) {
      const cursor = u16(ram.u16(a5 + R.rec1A) + 4);      // $270794
      ram.setU16(a5 + R.rec1A, cursor);
      if (i16(cursor) >= 0x0c) {                           // $270798..$27079E
        ram.setU8(a5 + R.rec19, (ram.u8(a5 + R.rec19) & 0xfe) | 0x02);
        ram.setU16(a5 + R.rec1A, 0);                       // $2707AE
        ram.setU16(a5 + R.rec1E, 8);                       // $2707B2
      }
    }
  }

  // Bit 1 reverses that cursor for eight even ticks, then returns to the static draw.
  if ((ram.u8(a5 + R.rec19) & 0x02) !== 0) {              // $2707B8
    ram.setU8(a5 + R.rec17, 1);                            // $2707C0
    if (ram.u16(a5 + R.rec1E) === 0) {
      ram.setU8(a5 + R.rec19, ram.u8(a5 + R.rec19) & 0xfd); // $2707EE
      ram.setU16(a5 + R.rec1A, 0);
      ram.setU8(a5 + R.rec17, 0);
    } else if ((ram.u16(T52.frame) & 1) === 0) {
      ram.setU16(a5 + R.rec1E, ram.u16(a5 + R.rec1E) - 1); // $2707D8
      if (ram.u16(a5 + R.rec1A) === 8) ram.setU16(a5 + R.rec1A, 0);
      ram.setU16(a5 + R.rec1A, ram.u16(a5 + R.rec1A) + 4); // $2707E8
    }
  }

  // Bit 2 aims by one step. No live target suppresses the volley but still advances the cycle.
  if ((ram.u8(a5 + R.rec19) & 0x04) !== 0) {              // $2707FE
    const before = ram.u8(a6 + S.heading);                 // $270808
    const aimed = aim64TurnStore(aimTables(rom), ram, a5, a6); // $27080C jsr $242178
    if (aimed.carry || ((before - aimed.dir) & 0xff) === 0) {
      if (aimed.carry) ram.setU8(a5 + R.rec20, 1);         // $27081C..$270820
      ram.setU8(a5 + R.rec19, 0x10);                       // $270826
      ram.setU16(a5 + R.rec22, 4);                         // $27082C
      ram.setU8(a5 + R.rec24, 0x10);                       // $270832
    }
  }

  // Bit 4 fires at heading +1 and -1, then kicks the child along the opposite vector.
  if ((ram.u8(a5 + R.rec19) & 0x10) !== 0) {              // $270838
    if (ram.u8(a5 + R.rec24) !== 0) {
      ram.setU8(a5 + R.rec24, ram.u8(a5 + R.rec24) - 1);  // $270842..$270848
    } else if (ram.u16(a5 + R.rec22) === 0) {
      ram.setU8(a5 + R.rec19, 0x20);                       // $2708AA
      const target = (ram.u8(a6 + S.heading) + drawByte242B3C(ram, rom)) & 0x3f;
      ram.setU8(a5 + R.rec26, target);                     // $2708B0..$2708C0
      ram.setU8(a5 + R.rec24, 0x10);
      ram.setU8(a5 + R.rec20, 0);
    } else if (ram.u8(a5 + R.rec20) !== 0) {
      ram.setU16(a5 + R.rec22, ram.u16(a5 + R.rec22) - 1); // $2708A4
    } else if ((ram.u16(T52.frame) & 7) === 0) {
      const pos = ram.u32(a6 + S.posX);
      const heading = ram.u8(a6 + S.heading);
      const ctxB = { ram, rom, log: new WriteLog(ram) };
      const common = { d0: 0x00080007, d2: pos, d3: 0, d4: 0, d5: 0, a5 };
      const first = fireBullet(ctxB, 0x281402,
        { ...common, d1: (heading + 1) & 0xff });
      ctx.bulletSpawn?.(0x27087e, first);
      const second = fireBullet(ctxB, 0x281402,
        { ...common, d1: (heading - 1) & 0xff });
      ctx.bulletSpawn?.(0x270886, second);
      const kick = ctx.tables.vector(0x30, (heading + 0x1f) & 0x3f); // $27088C..$270896
      ram.setU16(a6 + S.posX, u16(ram.u16(a6 + S.posX) + kick.dy));
      ram.setU16(a6 + S.posY, u16(ram.u16(a6 + S.posY) + kick.dx));
      ram.setU16(a5 + R.rec22, ram.u16(a5 + R.rec22) - 1); // $2708A4
    }
  }

  // Bit 5 slews to the random heading, then bit 6 waits before restarting at state $09.
  if ((ram.u8(a5 + R.rec19) & 0x20) !== 0) {              // $2708D0
    if (ram.u8(a5 + R.rec24) !== 0) {
      ram.setU8(a5 + R.rec24, ram.u8(a5 + R.rec24) - 1);
    } else {
      const target = ram.u8(a5 + R.rec26);
      const next = slew64(ram.u8(a6 + S.heading), target); // $2708E4..$2708F2
      ram.setU8(a6 + S.heading, next);
      if (((next - target) & 0xff) === 0) {
        ram.setU8(a5 + R.rec19, 0x40);                     // $2708FC
        ram.setU8(a5 + R.rec24, 0x10);
      }
    }
  }
  if ((ram.u8(a5 + R.rec19) & 0x40) !== 0) {              // $270908
    const wait = (ram.u8(a5 + R.rec24) - 1) & 0xff;
    ram.setU8(a5 + R.rec24, wait);
    if (wait === 0) {
      ram.setU8(a5 + R.rec19, 0x09);                       // $270916
      ram.setU8(a6 + S.speed, 0x20 + (drawWord242EC2(ram, rom) & 7)); // $27091C..$27092C
    }
  }

  draw52(ram, rom, a5, a6);                               // $270930/$270934
}

// ============================================ TYPE $58 (W487) ==================
// Type $4C emits this paired one-record child from its restored state-4 arm. It inherits the queued position
// and heading, accelerates upward, filters a three-heading fan to the visible arc, and shares type $52's art.
const T58 = Object.freeze({
  handler: 0x270c66,
  parentPresent: 0x8130de,
  frame: 0x80390a,
  art: T52.staticArt,
  emit: 0x23df86,
});

function retire58(ram, a5, a6, ctx) {
  // `$270CB6 move.w #$14,D0 / $270CBA jsr $289004`: $14 is the effect KIND. The following $10 is
  // the effect bucket. There is no `$28615E` scoreKill call anywhere in this handler.
  const effect = spawnEffect(ram, ctx, 0x14, 0x270cba);
  ram.setU32(effect + B.pos, ram.u32(a6 + S.posX));         // $270CC0
  ram.setU16(effect + B.bucket, 0x10);                      // $270CC6
  ctx.soundPost?.(0x28c2c2);                               // $270CCC
  freeEnemy(ram, a5);                                      // $270CD2
}

/** `$270C66` -- stage-5 enemy type $58, the terminal paired child of type $4C state 4. */
function handler58(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + R.subRec);
  if (i16(ram.u16(a6 + S.posX)) <= -0x0400) {              // $270C66..$270C70
    freeEnemy(ram, a5);
    return;
  }

  ram.setU32(a6 + S.posX,
    u32(ram.u32(a6 + S.posX) + ram.u32(a5 + R.rec1E)));    // $270C78..$270C7C
  ram.setU16(a5 + R.rec1E, u16(ram.u16(a5 + R.rec1E) - 2)); // $270C80, vertical acceleration

  if (ram.u16(T58.parentPresent) === 0) {                   // $270C84..$270C8A
    retire58(ram, a5, a6, ctx);
    return;
  }

  const hit = ram.u8(a6 + S.flags) & 0x5c;                 // $270C8E..$270C92
  if (hit !== 0) {
    ram.setU8(a6 + S.flags, ram.u8(a6 + S.flags) & 0xa3);  // $270C96..$270C9A
    scoreHit(ram, ctx, a6, hit);                            // $270C9C
    ram.setU8(a6 + S.palette, ram.u8(a6 + S.palette) ^ 0x0c); // $270CA2..$270CAA
    if (i16(ram.u16(a6 + S.hp)) < 0) {                     // $270CAE..$270CB2
      retire58(ram, a5, a6, ctx);
      return;
    }
  } else {
    ram.setU8(a6 + S.palette, 0x13);                        // $270CDA
  }

  if ((ram.u16(T58.frame) & 3) === 0) {                    // $270CE0..$270CE8
    ram.setU16(a5 + R.rec1A, u16(ram.u16(a5 + R.rec1A) + 4) & 0x1f); // $270CEA..$270CEE
  }

  if (ram.u16(a5 + R.rec24) !== 0 && due8(ram, a5 + R.rec22)) { // $270CF4..$270D00
    ram.setU8(a5 + R.rec22, ram.u8(a5 + R.rec23));         // $270D04
    const first = (ram.u8(a5 + R.rec1C) + 3) & 0x3f;       // $270D0A..$270D0E
    ram.setU8(a5 + R.rec1C, first);
    const pos = ram.u32(a6 + S.posX);
    const ctxB = { ram, rom, log: new WriteLog(ram) };
    for (let i = 0, heading = first; i < 3; i++, heading = (heading + 0x15) & 0x3f) {
      if (heading > 0x0c && heading < 0x34) {               // $270D6E..$270D7A, open interval
        const result = fireBullet(ctxB, 0x281402, {
          d0: 0xfffc0007, d1: heading, d2: pos, d3: 0, d4: 0, d5: 0, a5,
        });
        ctx.bulletSpawn?.(0x270d88, result);                // $270D88
      }
    }
    ram.setU16(a5 + R.rec24, ram.u16(a5 + R.rec24) - 1);   // $270D42
  }

  const art = rom.u32(T58.art + ram.u16(a5 + R.rec1A));    // $270D46..$270D4E
  const pos = u32(ram.u32(a6 + S.posX) + 0xfa00fc00);      // $270D50..$270D54
  enqueueRegistersThroughStub(ram, rom, T58.emit, pos,
    art, 0x0620, ram.u8(a6 + S.palette));                   // $270D5A..$270D64
}

// ============================================ TYPE $4C (W354/W356) ============
// Stage 5's FIVE-PART object, and the band's only multi-part member. ONE script record.
// STRUCTURE SETTLED, PER-PART BLOCKS NOT YET READ -- `ported: false` keeps the suite honest.
//
// THE OLD NOTE SAID "eight state handlers (~2300 bytes)" WITH EIGHT UNPORTED CALLEES. Both were wrong:
// all eight addresses are INTERNAL to $4C (two of them, $26FF9E and $26FFE8, are merely where the next
// routine starts), and there are no eight states. What there is:
//
//   * No `cmpi.b` cascade on the RECORD: zero `cmpi.b #imm,(d16,A5)` in $26F5F2..$26FFE8, where every
//     sibling dispatches that way on ($17,A5). TRUE, but NOT the same as "no state machine" -- see below.
//   * **W367 CORRECTION -- IT HAS A JUMP TABLE AND EIGHT STATE HANDLERS.** W354 recorded "NO jump table,
//     one `jsr (A0)` in the whole span" and used that as evidence against one. THAT `jsr` IS THE
//     DISPATCHER, at $26F87C: `$26F86A lea ($26F886,PC),A0 / move.w ($26,A6),D0 / add.w D0,D0 twice /
//     adda.w D0,A0 / movea.l (A0),A0 / jsr (A0) / jmp $2417DE`. So ($26,A6) is a STATE INDEX, the table
//     at $26F886 holds EIGHT 4-byte pointers, and $26F858 -- the guarded setter with eight callers -- is
//     that machine's setter. Its `beq` guard protects the state machine's own frame counter.
//     The original handoff note said "eight state handlers (~2300 bytes)" and was RIGHT ON BOTH COUNTS.
//   * NO self-rewriting dispatch. Zero `move.l #imm,($4C,A5)`.
//   * NO part loop. ONE `dbra` at $26FB3A with a 28-byte body -- a local loop inside one block.
//
// So it is 2550 bytes of UNROLLED per-part code, addressing five parts by offset through one A6 base at
// the $20 stride: part N occupies (N*$20 .. N*$20+$1F, A6). That is why ($9E,A6) and ($9F,A6) are read
// at $26F5FC/$26F62A/$26F6E8 -- they are part FIVE's $1E and $1F, and 5*$20 = $A0 with $9F the last byte.
// No sibling exceeds $36 because none has more than two parts.
//
// FOUR INDEPENDENT CONFIRMATIONS of that layout, which is why it can be trusted before the blocks are read:
//   1. ($4,A5) = 4 at $26F4DA, so run length + 1 = FIVE sub-records.
//   2. W342's window $26F55A + $AC decomposes EXACTLY: $C (six-word record proto) + $A0 (5 x $20).
//   3. The depth formula 5*$20 - ($26F5F2 - $26F566) = $14 = TWENTY, matching W342's directly-read overlap.
//   4. Part 5's prototype tail IS the handler's opcodes -- `4a79 0081 30d2` is `tst.w $8130D2`.
//
// **PART 5's INITIAL STATE IS NOT A DESIGNED VALUE.** Its $0C..$1F receive twenty bytes of the handler's
// own instructions, and the handler then TESTS ($9E,A6) -- reading back a byte its prototype seeded from
// its own opcodes. COPY THE BYTES. Do not invent plausible field values; the same trick appears in $49.
const T4C = Object.freeze({
  init: 0x26f4da, initBody: 0x26f4e2, handler: 0x26f5f2,
  // W371 CORRECTION: this was $26FFE8 with the note "the last rts is $26FFE6". $26FFE6 IS an rts, but
  // $26FFE8 is the START of the last subroutine, which is in `subroutines` above -- so the recorded end
  // was the beginning of code, not the end of it, and the "19 rts sites" count was taken over a span
  // ~494 bytes short. $26FFE8 runs past $270000 and its beq reaches $270128.
  // The real bound is ADJACENCY: type $4E's init is at $2701D6, and $4C's own death-effect table sits
  // immediately below it at $2701C8 ($26F6D2 lea ($2701C8,PC),A0 / jsr $246520, which is
  // animobjects.js loadAnimObjects246520 since W448 merged the three copies of $246532).
  handlerEnd: 0x2701d6,                       // exclusive; bounded by $4E's init, NOT by an rts scan
  lastSubEnd: 0x2701c8,                       // code stops here; $2701C8..$2701D6 is the death table
  deathEffectTable: 0x2701c8,                 // $26F6D2, consumed by $246520 (animobjects.js)
  recordProto: 0x26f55a, recordWords: 6,      // $26F4F4 move.w #$5,D0 -- SIX, where $55 and $1A have 15
  subProto: 0x26f566, subRecords: 5,          // $26F4DA move.w #$4,($4,A5) -- run length + 1
  subStride: 0x20, overlapBytes: 0x14,        // part 5 runs TWENTY bytes into the handler
  onScreenAt: 0x16,                           // $26F622/$26F67E -- the one field this band agrees on
  // ($17,A5) is NOT a mode here. It is read once, by tst.b at $26F790, and picks an EMIT STUB by
  // tail-jump: zero -> $23DECE (FRAME_EMIT), non-zero -> $23DF58 (mirrorStub). Both already ported.
  // $55 gives this byte four cascade values and $46 gives it five modes; here it is a draw variant.
  drawSelectAt: 0x17,
  drawStubs: Object.freeze([0x23dece, 0x23df58]),
  // All three word comparisons in the span are the SAME cap test: state 2 raises ($1E,A5), while
  // W486's state-4 phase arm at $26FDF4 compares before and after its own +$40 ramp. Reaching $600
  // clamps the record field and starts the eight paired type-$58 passes below.
  rampAt: 0x1e, rampCap: 0x0600,
  rampSites: Object.freeze([0x26fc32, 0x26fdfe, 0x26fe0e]),
  // The sub-record tests, by part: part 1's $1A against $8 twice, part 2's $0A against $1 and $2,
  // part 5's $1E and $1F as booleans.
  partTests: Object.freeze([0x26f5fc, 0x26f62a, 0x26f6e8, 0x26fdf4, 0x26fe30, 0x26ff6c, 0x26ff7a]),
  localLoop: 0x26fb3a,                        // the one dbra, 28-byte body, NOT the part iteration

  // W366: WHAT THIS TYPE ACTUALLY IS -- a multi-part destructible set-piece with a SCRIPTED
  // VULNERABILITY WINDOW. Every earlier oddity is a consequence of that one design.
  //
  // It spawns ONCE, at clock $1B8, and is INVULNERABLE until the clock reaches $1F0 -- the moment type
  // $10 spawns. ($16,A5) is the latch that opens the window, NOT the once-on-screen flag it is in $46,
  // $4B and $1A. And PART 5 IS THE CONTROL BLOCK, not a body segment: its $1E gates a mutual-exclusion
  // release, its $1F gates the latch, and its $0E receives the hit mask.
  spawnClock: 0x1b8,                          // its only script record
  armClock: 0x1f0, armCueType: 0x10,          // $26F632 -- a CROSS-TYPE cue, not self-referential
  invulnGateAt: 0x16,                         // $26F67E -- gates the damage subtraction
  // ($18,A6) is NOT hp. It is a per-hit DAMAGE ACCUMULATOR reset to $7FFF every hit, and the real
  // health is a 32-BIT POOL at ($1A,A5). The four siblings all test ($18,A6)'s SIGN for death; copying
  // that here reads a field $4C resets on every hit and the object never dies.
  damageAccumAt: 0x18, hpReset: 0x7fff,
  hpPoolAt: 0x1a,                             // $26F686 sub.l / $26F690 tst.l -- a LONG
  killScore: 0x700,                           // $26F698 -- the largest in the band
  palXorImmediate: 0x0d,                      // $26F66C eori.b #$D -- an IMMEDIATE, not ($19,A5)
  hitMaskTo: 0x8e,                            // $26F65E -- part 5's $0E
  releaseFlag: 0x8130de,                      // inside the $8130DC..$8130E6 mutual-exclusion block
  pushSpeed: 0x261100,                        // pushExternalSpeed, D0 = D1 = $20
  retireExit: 0x263762,                       // $26F61A -- the ($9E,A6) arm RETIRES the record
  // W367: THE SUBROUTINE INVENTORY. Sixteen `bsr` targets, and only TWO are shared -- so the port needs
  // two real functions and fourteen inlinable blocks. The old handoff note listed eight of these as
  // "unported callees"; they are internal entry points, and its addresses were all real.
  // W371: $26F702 was in this list and is NOT a subroutine. It is the DISPLACEMENT WORD of the
  // `bsr.w $26FA82` at $26F700 -- mid-instruction, and nothing in the span branches or calls to it.
  // The scanner that built this list read every 2-byte boundary, which is the documented limitation of
  // branches.py, and $26F702's `03 80` looked like an opcode. FIFTEEN subroutines, not sixteen.
  subroutines: Object.freeze([
    0x26f71a, 0x26f7a8, 0x26f7d2, 0x26f7fc, 0x26f82a, 0x26f858, 0x26f86a,
    0x26f98c, 0x26f994, 0x26f9a2, 0x26fa56, 0x26fa5e, 0x26fa82, 0x26ff9e, 0x26ffe8,
  ]),
  // The tiny ones come in OFF/ON PAIRS, one pair per part, and the ON member does more than the OFF:
  //   $26F98C  move.w #$0,($46,A6) / rts
  //   $26F994  move.w #$1,($46,A6) / move.w #$0,($4C,A6) / rts      <- also clears $4C
  //   $26FA56  move.w #$0,($66,A6) / rts
  //   $26FA5E  move.w #$1,($66,A6) / move.w #$0,($6C,A6) / move.w #$1818,($6E,A6) / ...
  // So "on" is not the inverse of "off": switching a part on RESETS its companion fields. A port that
  // models these as one boolean setter loses the reset and leaves stale state behind.
  partSetters: Object.freeze([
    Object.freeze({ off: 0x26f98c, on: 0x26f994, flagAt: 0x46, clears: Object.freeze([0x4c]) }),
    Object.freeze({ off: 0x26fa56, on: 0x26fa5e, flagAt: 0x66, clears: Object.freeze([0x6c]) }),
  ]),
  // W371 CORRECTION: this was FOUR entries starting at $26F708, and it was missing the FIRST draw call.
  // $26F704 is a `bsr.w $26F7FC` that is ALSO the target of two branches -- $26F5F8's pause test and
  // $26F6EC's blocked test -- and reading it as a branch label only is what dropped it. There are FIVE
  // tail calls, matching `draws` exactly, and the order below is CALL order, not the address order the
  // `draws` array happens to be in. Sprite layering follows call order, so drawing them by iterating
  // `draws` renders part 1 FIRST instead of last and puts the wrong sprite on top.
  //
  // It also settles what the pause path does: $8130D2 non-zero jumps to $26F704, the FIRST of the five,
  // so a paused $4C skips every state and still draws all five sprites.
  tailCalls: Object.freeze([0x26f7fc, 0x26f82a, 0x26f7a8, 0x26f7d2, 0x26f71a]),  // $26F704..$26F714, rts
  tailCallSites: Object.freeze([0x26f704, 0x26f708, 0x26f70c, 0x26f710, 0x26f714]),
  pauseEntry: 0x26f704,                       // $26F5F8 bne / $26F6EC bne both land HERE

  // $26F858 -- EIGHT callers. A CHANGE-DETECTING state setter, and the guard IS the function:
  //     cmp.w ($26,A6),D0 / beq rts / move.w D0,($26,A6) / clr.w ($28,A6)
  // The frame counter resets ONLY when the state actually changes. Storing unconditionally freezes the
  // animation on frame zero while everything else keeps working.
  stateSetter: 0x26f858, stateAt: 0x26, frameCounterAt: 0x28,

  // $26FF9E -- SEVEN callers. Grades DISTANCE into bands via dist242494 (itself one of the nine duplicate
  // ports removed earlier this session). A FALL-THROUGH cascade, so the SMALLEST band wins because each
  // later store overwrites the earlier; written as else-if it yields the LARGEST instead.
  //     >= $200  ->  ($1A,A6) untouched
  //     >= $100  ->  $8
  //      < $100  ->  $6   (and further bands below $26FFC4)
  // W371: "distBander" is the SIDE EFFECT, not the function. $26FF9E STEERS TOWARD A POINT given in
  // D2/D3 and returns ARRIVAL in the carry: below $40 it returns carry CLEAR, otherwise it aims
  // ($242038), slews from ($1B,A6) ($24218C), stores the new heading back, and returns carry SET.
  // The ($1A,A6) band writes happen on the way past. A port that models only the bands has NO MOVEMENT.
  // Its two callers supply the target differently: state 1 reads a point from the $26F984 table,
  // state 3 sets D2/D3 as literals $5C00/$1C00. Both branch on the carry as a waypoint test.
  steerArrivalRadius: 0x40, steerAim: 0x242038, steerSlew: 0x24218c, steerHeadingAt: 0x1b,
  steerCarryClearExit: 0x26ffe2, steerCarrySetExit: 0x26ffdc,
  distBander: 0x26ff9e, distHelper: 0x242494, distGlobal: 0x813172,
  // W368 CENSUS: ($1A,A6) is NOT "the distance band". A single scan of $26F5F2..$270000 finds SIXTEEN sites
  // that write it -- fourteen literal stores plus an increment and a decrement. Earlier revisions of this
  // comment said four, then five, six and seven, because each was written while reading one more state.
  // Counting by accretion never converges; the census below is the whole set, so it can be checked at once.
  //
  //   $26F8B0  move.w #$1600  -> ($1A)=$16 ($1B)=$00   the WORD form, so it clears $1B as a side effect
  //   $26FF4E  move.w #$0420  -> ($1A)=$04 ($1B)=$20   the OTHER word form, and it SETS $1B
  //   $26F91E $26FD9C  $04      $26FBE4 $26FD08 $26FEE0  $10     state setup, outside the band range
  //   $26FC16 $26FD40 $26FF18  $00
  //   $26FD76 $26FF84 $26FFB2  $08      $26FFBE  $06            IN the band range -- see below
  //   $26F8F4  subq.b #1       $26FF76  addq.b #1               a hysteresis pair
  //
  // TWO consequences for the port. First, $26FD76 (state 4) and $26FFB2 (the distance helper) write the SAME
  // value $8, and $26FF6C/$26FF7A branch on exactly that -- so the field's value does NOT identify its writer,
  // and a state can force the close-range behaviour with no distance ever measured. Transcribe each site;
  // do not try to recover intent by reading the field.
  // Second, ($1A) and ($1B) are written both as a pair and independently ($26FF66 writes $1B alone), so they
  // are neither one 16-bit field nor two unrelated bytes. Match the width the cartridge uses at each site.
  bandAt: 0x1a,                               // part 1's $1A -- see the census above
  bandWriters: Object.freeze([
    0x26f8b0, 0x26f8f4, 0x26f91e, 0x26fbe4, 0x26fc16, 0x26fd08, 0x26fd40, 0x26fd76,
    0x26fd9c, 0x26fee0, 0x26ff18, 0x26ff4e, 0x26ff76, 0x26ff84, 0x26ffb2, 0x26ffbe,
  ]),
  bandWritersB: Object.freeze([0x26f8b0, 0x26ff4e, 0x26ff66]),   // sites touching ($1B,A6)
  bandThresholds: Object.freeze([[0x200, null], [0x100, 0x8], [0x000, 0x6]]),
  bandTestSites: Object.freeze([0x26ff6c, 0x26ff7a]),   // where the main flow compares it against $8

  // W367: the state handlers are FRAME-COUNTER CASCADES. ($26,A6) picks the state via the jump table, and
  // within a state ($28,A6) is a SCRIPT STEP walked by successive `cmpi.w #$N,($28,A6)`. That is the third
  // reason $26F858's guard matters: clearing ($28,A6) only on a real state change RESTARTS the inner
  // script, and clearing it every frame would pin every state on its first step forever.
  stepAt: 0x28,                               // same field as frameCounterAt -- it is the script step
  // W372: state 2's spawn-bias table, eight longs, indexed by ($34,A6) & 7. The volley fires TWICE per
  // pass -- one spawn per counter-rotating cursor -- and only on EVEN frames ($80390A & 1).
  // W486: state 4 reuses the SAME table and packed biases for eight paired type-$58 passes. Its slower
  // gate is every eighth frame, and each of the two emissions increments ($34,A6) independently.
  // Both tables below are windowed and bounded by the ROM's own masks, so neither needs a guard.
  state1Table: 0x26f984, state1Points: 2,
  fanTable: 0x2735fa, fanEntries: 64, fanPasses: 37, fanEntryHeading: 0x2e,
  spawnBiasTable: 0x26fcd2, spawnBiasEntries: 8, spawnChild: 0x52,
  spawnParityGlobal: 0x80390a,
  spawnBiases: Object.freeze([0x0c7ff600, 0x0c800a00]),   // STRADDLE $0C7F/$0C80, like the draw pairs
  state4SpawnChild: 0x58, state4DueMask: 0x07,
  // W367: THE DRAW TABLE. FIVE sprites per frame, from five subroutines that each hard-code one part's
  // offsets -- which is what the unrolled parts are FOR and why there is no loop.
  //
  // Four of the five end `jmp $26F790`, the shared selector that picks $23DECE or $23DF58 by ($17,A5).
  // The fifth, $26F71A, ends in `rts` instead, which is why a scan for those jumps finds only four.
  //
  // THEY PAIR: two routines share art $1499CC and palette $5D (part 3), two share $149978 and $7D
  // (part 4), differing only in the part offset and the FIRST bias -- and those bias pairs straddle a
  // boundary ($FC3F/$FC40, $F47F/$F480), so each pair is the mirrored halves of one object.
  //
  // PARTS 2 AND 5 ARE NOT DRAWN. Part 5 is the control block, correctly. Part 2 has ~24 field references
  // and no draw routine at all, so it is STATE-ONLY -- do not go looking for its sprite.
  //
  // The `biases` are sequential `addi.l` on D1 and DO combine (unlike the word-add case, which must never
  // be folded, and unlike $1A's swap-separated pair). $26F71A takes FOUR of them where the others take two.
  draws: Object.freeze([
    // W367: art was first recorded as $1494A0 -- wrong. My extractor lacked a `break`, so it took the LAST
    // `move.l #imm,D2` in range instead of the first. The pin below caught it on the first run.
    // W371: this ONE entry was THREE sprite blocks. $26F71A does not draw a sprite and return -- it
    // draws THREE, each with its own art long, biases, D3 and `jsr $26F790`, and only then rts. The
    // recorded "4 biases" were block A's two plus block B's two, with block C's never recorded and one
    // value ($F200EF00 vs block C's $F200E600) belonging to a different block than it looked.
    // So $4C draws SEVEN sprites per frame, not five.
    Object.freeze({ at: 0x26f71a, art: 0x14985c, partAdd: null, d3: 0x0a38, palAt: 0x1d, part: 1,
      biases: Object.freeze([0xf7000000, 0xf600f900]), exit: 0x26f790, block: 'A' }),
    // Block B applies the RAMP with a SWAP-SEPARATED word add -- `swap D1 / add.w ($1E,A5),D1 / swap
    // D1` -- so it lands in the HIGH word with no borrow into the low. Its two addi.l ARE adjacent and
    // do combine; block A's are too. The swap pair must never be folded into them.
    Object.freeze({ at: 0x26f740, art: 0x1494a0, partAdd: null, d3: 0x0e88, palAt: 0x1d, part: 1,
      biases: Object.freeze([0x0c800000, 0xf200ef00]), exit: 0x26f790, block: 'B',
      rampSwapAdd: 0x1e }),
    Object.freeze({ at: 0x26f76e, art: 0x148eec, partAdd: null, d3: 0x0ed0, palAt: 0x1d, part: 1,
      biases: Object.freeze([0xf200e600]), exit: 0x26f790, block: 'C', lastBeforeRts: true }),
    Object.freeze({ at: 0x26f7a8, art: 0x1499cc, partAdd: 0x48, d3: 0x0608, palAt: 0x5d, part: 3,
      biases: Object.freeze([0xfc3fec80, 0xfa00ff00]), exit: 0x26f790 }),
    // W371: `partAdd: null` was wrong. This one has a part offset and SUBTRACTS it: `sub.w ($4A,A6)`,
    // where its twin ADDS ($48,A6). The extractor looked for add.w ($D26E) only and did not see the
    // sub.w ($926E). So the mirrored pair mirrors TWICE -- bias $FC3F vs $FC40 AND add vs subtract --
    // which is what actually places the two halves either side of the boundary. The part-4 pair below
    // does NOT do this: both of those add, from $68 and $6A.
    Object.freeze({ at: 0x26f7d2, art: 0x1499cc, partSub: 0x4a, partAdd: null, d3: 0x0608,
      palAt: 0x5d, part: 3, biases: Object.freeze([0xfc401380, 0xfa00ff00]), exit: 0x26f790 }),
    Object.freeze({ at: 0x26f7fc, art: 0x149978, partAdd: 0x68, d3: 0x0a10, palAt: 0x7d, part: 4,
      biases: Object.freeze([0xf47ffc00, 0xf600fe00]), exit: 0x26f790 }),
    Object.freeze({ at: 0x26f82a, art: 0x149978, partAdd: 0x6a, d3: 0x0a10, palAt: 0x7d, part: 4,
      biases: Object.freeze([0xf4800400, 0xf600fe00]), exit: 0x26f790 }),
  ]),
  // W371: every `partAdd`/`partSub` is a WORD op on the LONG D1 -- `add.w ($48,A6),D1`. It changes only
  // the low 16 bits and does NOT carry into the high word, so it is not `d1 + v`. And because it sits
  // BETWEEN the two addi.l biases, those two are NOT sequential and must not be folded: the long adds
  // carry, the word add does not, so folding them changes the result whenever the low word overflows.
  partOpIsWord: true,
  drawSelector: 0x26f790,
  partsDrawn: Object.freeze([1, 3, 4]),       // parts 2 and 5 are never drawn

  // W367: THE STATE MACHINE. ($26,A6) indexes this table of EIGHT 4-byte pointers, dispatched at $26F87C
  // through `movea.l (A0),A0 / jsr (A0)`, after which the dispatcher tail-jumps to $2417DE
  // (applyVelocityA6). The table is bounded by ADJACENCY: it ends at $26F8A6, which is state 0's own
  // handler, so $26F886..$26F8A6 is exactly $20 bytes.
  stateTable: 0x26f886, stateDispatch: 0x26f87c, stateExit: 0x2417de,
  states: Object.freeze([
    0x26f8a6, 0x26f90e, 0x26fbd4, 0x26fcf2, 0x26fd66, 0x26feca, 0x26ff3e, 0x26ff56,
  ]),

  // W402: $26FFE8's THREE ARMS, and the fields they run on. Part 5's $06/$08/$09/$0A/$0C, which is
  // why every displacement below is $80 + the part offset. The shape is type $44's death sequence
  // ($26EA00, stage5type44.js) with different field names and different lists: phase 2 arms the
  // retire, phase 1 fires the one-shot burst, phase 0 walks a table one row per tick.
  //
  // ($8C,A6) IS THE ONE FIELD NOTHING ELSE IN THE IMAGE TOUCHES. A scan of $26F4DA..$2701C8 for
  // `(d16,A6)` with d16 = $8C finds exactly one instruction, $270114's `subq.w #1,($8C,A6)`; the
  // only other $008C word in the span is $27009A's branch DISPLACEMENT. So its value comes from the
  // sub-record prototype and from nowhere else, and it is 2 (measured through `loadSubProto`, not
  // read off the table -- the prototype is variable-length, 16 or 28 table bytes per $20 record
  // bytes, so counting $20 per part off $26F566 gives the wrong byte).
  deathPhaseAt: 0x86,                         // $270000/$270014/$270094 -- tested 2, then 1, then 0
  deathTickAt: 0x88, deathReloadAt: 0x89,     // $2700A6 move.b ($89,A6),($88,A6)
  deathCursorAt: 0x8a, deathLoopAt: 0x8c,     // $2700B8 adda.w / $270114 subq.w
  deathListA: 0x270134, deathListAStride: 0x0c, deathListAEnd: 0x48,   // $270104 cmpi.w #$48
  deathListB: 0x27017e,                       // $27002A lea / $270030 jsr $26C74E
  deathAnim: 0x10,                            // $2700DA move.w #$10,($1E,A0), and $26C74E's own
  deathReload: 0x1006,                        // $27011C -- ONE word over ($88) = $10 and ($89) = $06
  deathPhase1Tick: 0x10,                      // $270088 move.b #$10,($88,A6) -- a GENUINE move.b
  deathCueA: 0x28c274, deathCueB: 0x28c310,   // $2700AC / $270082
  burstBucket: 0x0c,                          // $27004E/$270074 move.w #$C,D3
  // $270036..$270080. The site addresses are the two `jsr $28B4BE`, $270056 and $27007C -- one per
  // turn, because attributing both to one address is how $26C85C/$26C882 got recorded as
  // $26C8CA/$26C8F4 in stage3carrier.js.
  burstTurns: Object.freeze([
    Object.freeze([0x40, 0xf8000800, 0x270056]),
    Object.freeze([0xc0, 0x01fff800, 0x27007c]),
  ]),
  retireArmAt: 0x9e, dyingAt: 0x9f,           // $27000A / $26FFE8's own gate
});

// ============================================ TYPE $B0 -- HIBACHI (W357/W360) ============
// The boss-route root, ONE script record, and the type these notes long said "wants the HIBACHI CLOSURE
// RULE and a trace". IT WANTS NEITHER. Its handler is 170 bytes and needed no trace at all.
//
// W369: THE FLAG HERE WAS WRONG THE SAME WAY $1A's WAS, and this is the more serious of the two. It read
// `ported: false` meaning "the boss BODY $2A6B94 is not written" -- but W363 REGISTERED handler2A4606, and
// `ported: false` makes w346's two registry tests skip the type. So nobody checked the INIT body $2A42DC,
// which is not registered either. `runInitBodyAddr` throws by address, so HIBACHI CANNOT SPAWN, and the
// stage-5 scope test read clean because it counts handlers.
//
// Two different meanings of "body" collided: the boss body (a deliberate note()) and the init body (simply
// absent). The flag now says exactly which is missing.
//
// THE HANDLER DOES EXACTLY TWO THINGS. Everything else in it is disabled:
//
//   2a4606  jsr $2A6B94                    the entire boss
//   2a460c  jsr $25962E / bcc              the clear test
//   2a4614  jsr $242952 / jmp $263762      THE STAGE-CLEAR PATH, then free
//   2a4622  ELEVEN `lea (part,A6),A0 / jsr $26331C` calls  -- ALL NO-OPS, $26331C is a bare rts
//   2a469a  four register loads, then jsr $25A17A            -- ALSO A NO-OP, one of four adjacent rts
//   2a46b0  rts
//
// THE ELEVEN PART OFFSETS ARE NOT A RANGE. In ROM order: $0 $20 $40 $60 $80 $A0 $C0 $1A0 $140 $160 $180.
// $1A0 is called EIGHTH, out of sequence, and $E0/$100/$120 are never called at all. A loop from 0 to
// $1A0 by $20 would visit three parts the cartridge skips and place $1A0 last. Transcribe the list.
//
// $2A4614 IS THE GAME'S COMPLETION PATH. D11 records W232 forcing $242952 headlessly and finding the
// stage machine works, so this handler is the junction the endings (D37) run through -- though selection
// happens DOWNSTREAM of $242952, not here. $25A17A looked like the selection point and is a bare rts.
const TB0 = Object.freeze({
  init: 0x2a42d4, initBody: 0x2a42dc, handler: 0x2a4606,
  // High table: $27E412 + ($B0 - $80) * 8 = $27E592. W347's formula, correct on first use.
  handlerEnd: 0x2a46b0,
  body: 0x2a6b94,                             // the whole boss; its first block runs to $2A6E2E
  clearTest: 0x25962e, stageClear: 0x242952, exit: 0x263762,
  // $2A6B94 opens with an early-exit guard: tst.w ($106,A6) / beq over a single rts, so it does nothing
  // unless ($106,A6) is zero. Its first rts is only 6 bytes in -- a "first rts bounds the routine" scan
  // would wrongly call it a stub, which is the inverse of the trap that caught $26331C and $25A17A.
  // W362: these were recorded off by two, and an audit of hand-computed branch targets caught it. The
  // real layout is $2A6B94 tst.w ($106,A6) / $2A6B98 beq.s over / $2A6B9A rts / $2A6B9C tst.b ($10E,A6)
  // / $2A6BA0 bne.w -> $2A6F12. I had the rts and the tst.b both at $2A6B9A-ish and the target at
  // $2A6F10. bne.w's displacement is relative to the byte AFTER the opcode word, so $2A6BA2 + $370.
  bodyGuardAt: 0x106, bodyGuardRts: 0x2a6b9a,
  bodySecondGateAt: 0x10e, bodySecondGateSite: 0x2a6ba0, bodySecondGateTarget: 0x2a6f12,
  partStride: 0x20,
  partOffsets: Object.freeze([0x0, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0x1a0, 0x140, 0x160, 0x180]),
  perPartStub: 0x26331c,                      // a bare rts. Transcribe the calls; implement nothing.
  epilogueStub: 0x25a17a,                     // likewise -- one of FOUR adjacent rts bytes
  // The body's twelve callees are ALL ported bar three, and all three are small with ported cores:
  //   $243DD0  ONE LINE: armScreenClearMode(ram, ctx, d1, from, 0xffff, 0x243dd0) -- midboss.js:197
  //            already implements the guard AND parameterises the mode. Land it WITH its caller, not
  //            before, or it is dead code (the tallyPhase0Arm25DC2C mistake).
  //   $242922  jsr $28C170 (ported) / move.w #$1,$81296E / tst.w $8103E6 -- a wrapper
  //   $253564  the $811F8C clamp, opening cmpi.w #$14,$811F8C
  unportedCallees: Object.freeze([0x243dd0, 0x242922, 0x253564]),
  screenClearMode: 0xffff,                    // what $243DD0 arms $81B412 to, from $243DEE
  clampGlobal: 0x811f8c, clampFirstTest: 0x14,
});

// $268E6C -- TYPE $1A, stage 5's slewing twin-weapon turret. FOUR script records.
//
// See T1A for the measured fields and the seven sibling-divergence traps. The three that cost a check
// each in W364, all verified against source rather than assumed:
//
//   * `slew64`, NOT `slew64FromRecord`. The latter is $24218C, a different ROM entry point that takes
//     the facing from ($1B,A6). $242190 takes it in a register, and $1A supplies ($28,A5).
//   * `targetSelect(ram, a5)` IS this type's inline block -- it already keys on ($3,A5) and does the
//     exg. W353 recorded the opposite and would have caused a duplicate port.
//   * the heading is 64-step and the SPRITE is 32-step: `andi.w #$3E` drops bit 0 before the double.
//
// And ($28,A5) is the HEADING while ($28,A6) is the ANIMATION CURSOR -- one offset, two structures,
// both live in this function. A5 is the record, A6 the sub-record.
// ===================== TYPE $4C -- the stage-5 multi-part set piece (W372) =====================
// ===================== TYPE $4C -- the stage-5 multi-part set piece (W372) =====================
// Written from W371's end-to-end reading, held by 52 assertions in w363type4cfields. Every helper
// signature here was read from its definition, never recalled -- W365 got seven of seven wrong.

/** `$26FF9E` -- STEER toward (d2,d3). Returns TRUE while still travelling, FALSE on arrival.
 *
 *  The spec calls this the distance bander and that is the SIDE EFFECT: the ($1A,A6) writes happen on
 *  the way past. What it does is move the object, which is why every state that travels calls it and
 *  branches on the result.
 *
 *  D0 IS SCRATCH. `move.w $813172,D0 / sub.w D0,D3` looks like it sets up the first argument, but
 *  `$242494` opens `movem.w ($2,A6),D0-D1` and loads the self position over it. The scroll only ever
 *  compensates the target X.
 */
function steer4C(ram, rom, a6, d2, d3) {
  const tgtX = u16(d3 - ram.u16(T4C.distGlobal));            // $26FF9E/$26FFA4
  const selfY = ram.u16(a6 + 0x02);
  const selfX = ram.u16(a6 + 0x04);
  const dist = dist242494(selfY, selfX, d2, tgtX);           // $26FFA6 jsr $242494

  // $26FFAC..$26FFC2 -- a FALL-THROUGH cascade, so the smallest band wins. Written as else-if it
  // yields the largest instead, and $26FF6C/$26FF7A branch on exactly $8.
  if (dist < 0x200) {                                        // $26FFAC cmpi.w / bge
    ram.setU8(a6 + T4C.bandAt, 0x08);                        // $26FFB2
    if (dist < 0x100) ram.setU8(a6 + T4C.bandAt, 0x06);      // $26FFB8 / $26FFBE
  }

  if (dist < T4C.steerArrivalRadius) return false;           // $26FFC4 blt -> the carry-CLEAR exit
  // $26FFCC jsr $242038 -- the entry INSIDE aim64AtTarget that skips targetSelect, because the target
  // is already in D2/D3. aim64AtTarget would re-select a player and discard the waypoint.
  const dir = aim64(aimTables(rom), selfY, selfX, d2, tgtX);
  ram.setU8(a6 + T4C.steerHeadingAt,                         // $26FFD8 move.b D1,($1B,A6)
    slew64FromRecord(ram, a6, dir) & 0xff);                  // $26FFD2 jsr $24218C
  return true;                                               // $26FFDC -- carry SET
}

/** One sprite block: `move.l #art,D2` .. `jsr $26F790`. The stub is picked by `($17,A5)`, the same
 *  field state 0 sets when its two-stage timer expires -- the form change and the emitter choice are
 *  ONE decision, not two. */
function draw4C(ram, rom, a5, d1, dr) {
  const stub = ram.u8(a5 + T4C.drawSelectAt) !== 0           // $26F790 tst.b ($17,A5) / bne
    ? T4C.drawStubs[1] : T4C.drawStubs[0];
  enqueueRegistersThroughStub(ram, rom, stub, d1, dr.art, dr.d3, ram.u8(dr.a6base + dr.palAt));
}

/** The five tail calls, in CALL order. Part 4's two halves, then part 3's two, then `$26F71A` -- which
 *  is THREE sprite blocks, so seven sprites leave here per frame. Rendering from `T4C.draws` in array
 *  order instead would put part 1 underneath. */
function drawAll4C(ram, rom, a5, a6) {
  const pos = ram.u32(a6 + 0x02);
  for (const dr of T4C.draws) {
    let d1 = pos;
    // Block B alone applies the RAMP, and through a SWAP-SEPARATED word add -- it lands in the high
    // word with NO borrow into the low. It must not be folded into the addi.l biases around it.
    if (dr.rampSwapAdd !== undefined) {                      // $26F74A swap / add.w / swap
      d1 = (((u16((d1 >>> 16) + ram.u16(a5 + dr.rampSwapAdd)) << 16) >>> 0) | (d1 & 0xffff)) >>> 0;
    }
    let first = true;
    for (const b of dr.biases) {
      d1 = (d1 + b) >>> 0;                                   // addi.l -- these DO carry
      // The part offset is a WORD op on the LONG, sitting BETWEEN the two biases: low 16 bits only,
      // NO carry into the high word. That is also why the two addi.l are not sequential and must not
      // be folded. $26F7D2 SUBTRACTS where its twin adds, which is half of how the pair mirrors.
      if (first && (dr.partAdd !== null || dr.partSub !== undefined)) {
        const v = dr.partSub !== undefined
          ? u16((d1 & 0xffff) - ram.u16(a6 + dr.partSub))    // $26F7E2 sub.w ($4A,A6),D1
          : u16((d1 & 0xffff) + ram.u16(a6 + dr.partAdd));   // $26F7B8 add.w ($48,A6),D1
        d1 = ((d1 & 0xffff0000) | v) >>> 0;
      }
      first = false;
    }
    draw4C(ram, rom, a5, d1, { ...dr, a6base: a6 });
  }
}

/** `$26F858` -- the CHANGE-DETECTING state setter. The `beq` guard IS the function: `($28,A6)` is
 *  cleared only when the state actually changes. Storing unconditionally restarts the inner script
 *  every frame, which freezes every state at step 0 while everything else keeps working. */
function setState4C(ram, a6, d0) {
  if (ram.u16(a6 + T4C.stateAt) === d0) return;              // $26F858 cmp.w / beq rts
  ram.setU16(a6 + T4C.stateAt, d0);                          // $26F860
  ram.setU16(a6 + T4C.stepAt, 0);                            // $26F864 clr.w ($28,A6)
}

/** The two OFF/ON pairs. ON is NOT the inverse of OFF: switching a part on also RESETS its companion
 *  field, so modelling a pair as one boolean setter leaves stale state behind. */
function partSet4C(ram, a6, i, on) {
  const p = T4C.partSetters[i];
  ram.setU16(a6 + p.flagAt, on ? 1 : 0);                     // $26F98C / $26F994
  if (on) for (const c of p.clears) ram.setU16(a6 + c, 0);   // the ON-only reset
}
/** `$26F5F2` -- type $4C. A multi-part destructible set piece with a SCRIPTED vulnerability window:
 *  it spawns once at clock $1B8 and cannot be hurt until $1F0. */
function handler4C(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);

  // $26F5F2 -- FREEZE. The bne lands on $26F704, the FIRST draw call, not on the rts. So a paused $4C
  // skips every state and still draws all seven sprites, which is why it does not vanish when frozen.
  if (ram.u16(0x8130d2) !== 0) { drawAll4C(ram, rom, a5, a6); return; }

  // $26F5FC -- part 5's $1E, the retire flag. It was armed a frame ago, by state 7's $26FF96 or by
  // $27000A, and NOTHING acts on it in the frame that sets it. So the object lives one more full
  // frame after the flag goes up, including one more pass through the draw chain.
  if (ram.u8(a6 + 0x9e) !== 0) {
    ram.setU16(T4C.releaseFlag, 0);                          // $26F604
    pushExternalSpeed(ram, 0x20, 0x20);                      // $26F60C..$26F614
    return;                                                  // $26F61A jmp $263762 -- just a return
  }

  // $26F622 -- the latch arms ONCE: only at clock $1F0, only while part 5's $1F is clear, and only
  // while it is not already set. It opens the damage window AND selects the exit state in one go.
  if (ram.u8(a5 + T4C.invulnGateAt) === 0 && ram.u8(a6 + 0x9f) === 0
      && ram.u16(0x8130ce) === T4C.armClock) {               // $26F632 cmpi.w #$1F0,$8130CE
    ram.setU8(a5 + T4C.invulnGateAt, 1);                     // $26F63E
    ram.setU16(a5 + 0x20, 1);                                // $26F644
    setState4C(ram, a6, 7);                                  // $26F64A moveq #$7 / bsr $26F858
  }

  // $26F650 -- the $5C damage arm, this band's sixth member.
  const hit = ram.u8(a6) & 0x5c;
  if (hit !== 0) {
    ram.setU8(a6, ram.u8(a6) & 0xa3);                        // $26F658/$26F65C
    ram.setU16(a6 + T4C.hitMaskTo, hit);                     // $26F65E -- into part 5's $0E
    scoreHit(ram, ctx, a6, hit);                             // $26F662 jsr $286096
    // The XOR is an IMMEDIATE $D baked into the instruction, NOT ($19,A5) as the four siblings use.
    // T4C deliberately has no palXor field, and a test asserts its absence.
    ram.setU8(a6 + 0x1d, (ram.u8(a6 + 0x1d) ^ T4C.palXorImmediate) & 0xff);   // $26F668..$26F670

    // $26F674 -- THE ONE A SIBLING-COPY GETS WRONG. ($18,A6) is a per-hit DAMAGE ACCUMULATOR that is
    // reset every hit; the real health is the 32-BIT POOL at ($1A,A5). All four siblings test
    // ($18,A6)'s sign for death, and copying that reads a field $4C resets, so it NEVER dies.
    const dmg = u16(0x7fff - ram.u16(a6 + T4C.damageAccumAt));                // $26F674/$26F67A
    if (ram.u8(a5 + T4C.invulnGateAt) === 0) {               // $26F67E tst.b / bne SKIPS the sub.l
      ram.setU32(a5 + T4C.hpPoolAt,
        (ram.u32(a5 + T4C.hpPoolAt) - dmg) >>> 0);                           // $26F686 sub.l
    }
    ram.setU16(a6 + T4C.damageAccumAt, T4C.hpReset);         // $26F68A -- UNCONDITIONAL, every hit

    // $26F690 tst.l ($1A,A5) / $26F694 bpl -- death needs the pool NEGATIVE. `<= 0` kills it a hit
    // early and `=== 0` may never fire at all.
    if ((ram.u32(a5 + T4C.hpPoolAt) & 0x80000000) !== 0) {
      scoreKill(ram, rom, ctx, T4C.killScore, hit);          // $26F698/$26F69E
      ram.setU16(a6, 0x8000);                                // $26F6A4 -- the dying bit
      ram.setU8(a6 + 0x9f, 1);                               // $26F6A8 -- part 5's $1F BLOCKS re-arm
      ram.setU16(T4C.releaseFlag, 0);                        // $26F6AE $8130DE
      ram.setU16(0x8130e0, 0);                               // $26F6B6 -- and $8130E0, CLAIMED BY $49
      pushExternalSpeed(ram, 0x20, 0x20);                    // $26F6BE..$26F6C6
      setState4C(ram, a6, 6);                                // $26F6CC -- the DEATH state
      // $26F6D2 lea ($2701C8,PC),A0 / $26F6D8 jsr $246520. The `mode` is NOT a caller register: it is
      // fixed by WHICH ENTRY is called -- 1 from $246520, 0 from $24652A (spawn.js's own docstring).
      // $4C calls $246520, so it is 1, and $2701C8's count word is 1.
      // W448: `spawn.js buildParts246520` was a THIRD transcription of `$246532` and it read
      // the palette snapshot out of ROM, so this line THREW on `$2701C8`'s family-0 script.
      // `animobjects.js loadAnimObjects246520` is the survivor and reads it out of RAM.
      loadAnimObjects246520(ram, rom, T4C.deathEffectTable);
    }
  } else {
    // $26F6DE -- an unhit frame REWRITES the palette byte rather than merely skipping the XOR. With
    // the $D XOR this is a two-value alternation, $12 and $1F; drop it and the object stays flashing.
    ram.setU8(a6 + 0x1d, 0x12);
  }

  retireCheck4C(ram, rom, a5, a6, ctx);                      // $26F6E4 bsr $26FFE8

  // $26F6E8 -- part 5's $1F set SKIPS the state machine, but the draw chain below still runs.
  if (ram.u8(a6 + 0x9f) === 0) {
    dispatch4C(ram, rom, a5, a6, ctx);                       // $26F6F0 bsr $26F86A
    // $26F6F4 -- ($20,A5) non-zero skips these two, and the $1F0 arm SETS it, so they run only
    // BEFORE the vulnerability window opens.
    if (ram.u16(a5 + 0x20) === 0) {
      sub26F9A2(ram, rom, a5, a6, ctx);                      // $26F6FC
      sub26FA82(ram, rom, a5, a6, ctx);                      // $26F700
    }
  }

  drawAll4C(ram, rom, a5, a6);                               // $26F704..$26F714, then rts
}

/** `$26F86A` -- the dispatcher. `($26,A6)` indexes eight 4-byte pointers at `$26F886`, and the tail is
 *  `jmp $2417DE`, so applyVelocityA6 runs after EVERY state, including the ones that return early. */
function dispatch4C(ram, rom, a5, a6, ctx) {
  const state = ram.u16(a6 + T4C.stateAt) & 0xffff;          // $26F870 move.w ($26,A6),D0
  if (state > 7) {
    unreached(0x26f87c, `type $4C state ${state} is outside the eight-entry table at `
      + `$${T4C.stateTable.toString(16).toUpperCase()}`);
  }
  STATES_4C[state](ram, rom, a5, a6, ctx);                   // $26F87C jsr (A0)
  applyVelocityA6(ram, ctx.tables, a6);                      // $26F87E jmp $2417DE
}
// The eight state bodies. Each is a SCRIPT walked by ($28,A6) through successive `cmpi.w`, each arm
// ending by advancing it -- not a frame timer. $26F858 clears it only on a real state change, which is
// what restarts the script.

/** State 0 `$26F8A6` -- arrive, then a TWO-STAGE timer that ends by changing the object's form. */
function state0_4C(ram, rom, a5, a6) {
  if (ram.u16(a6 + T4C.stepAt) === 0) {                      // $26F8A6
    ram.setU16(a6 + T4C.bandAt, 0x1600);                     // $26F8B0 WORD: ($1A)=$16, ($1B)=0
    ram.setU16(a6 + 0x34, 0x0202);                           // $26F8B6 WORD: counter AND its RELOAD
    ram.setU16(a6 + T4C.stepAt, 1);                          // $26F8BC
  }
  if (ram.u16(a6 + T4C.stepAt) === 1) {                      // $26F8C2
    if (i16(ram.u16(a6 + 0x02)) >= 0x2000) {                 // $26F8CC cmpi.w #$2000 / blt
      ram.setU16(a6 + T4C.stepAt, 2);                        // $26F8D6
    }
  }
  if (ram.u16(a6 + T4C.stepAt) !== 2) return;                // $26F8DC
  // $26F8E6 -- the INNER counter borrows, reloads from ($35,A6), and only then does the OUTER one tick.
  const inner = (ram.u8(a6 + 0x34) - 1) & 0xff;
  ram.setU8(a6 + 0x34, inner);
  if (inner !== 0xff) return;                                // $26F8EA bcc -- no borrow yet
  ram.setU8(a6 + 0x34, ram.u8(a6 + 0x35));                   // $26F8EE reload from its PERIOD
  const outer = (ram.u8(a6 + T4C.bandAt) - 1) & 0xff;        // $26F8F4
  ram.setU8(a6 + T4C.bandAt, outer);
  if (outer !== 0) return;                                   // $26F8F8
  ram.setU8(a5 + T4C.drawSelectAt, 1);                       // $26F8FC -- the DRAW VARIANT changes
  ram.setU16(a6, 0xa001);                                    // $26F902
  setState4C(ram, a6, 1);                                    // $26F906/$26F908
}

/** State 1 `$26F90E` -- patrol the two-point table, then ALTERNATE states 2 and 4. */
function state1_4C(ram, rom, a5, a6, ctx) {
  if (ram.u16(a6 + T4C.stepAt) === 0) {                      // $26F90E
    ram.setU8(a6 + T4C.bandAt, 0x04);                        // $26F91E
    ram.setU16(a6 + 0x2a, 0);                                // $26F924 WORD -- clears BOTH cursors
    ram.setU16(a6 + 0x30, 0x012c);                           // $26F92A -- 300 frames
    partSet4C(ram, a6, 0, true);                             // $26F930 bsr $26F994
    partSet4C(ram, a6, 1, true);                             // $26F934 bsr $26FA5E
    ram.setU16(a6 + T4C.stepAt, 1);                          // $26F918
  }
  const cursor = ram.u16(a6 + 0x2a);                         // $26F93E adda.w ($2A,A6),A0
  const at = T4C.state1Table + cursor;                       // $26F938 lea $26F984
  const travelling = steer4C(ram, rom, a6,                   // $26F942 movem.w (A0),D2-D3
    rom.u16(at), rom.u16(at + 2));                           // $26F946 bsr $26FF9E
  if (!travelling) {                                         // $26F94A bcs SKIPS the advance
    ram.setU16(a6 + 0x2a, (cursor + 4) & 0x7);               // $26F94E/$26F952 -- 0, 4, 0, 4...
  }
  const left = u16(ram.u16(a6 + 0x30) - 1);                  // $26F958
  ram.setU16(a6 + 0x30, left);
  if (left !== 0) return;                                    // $26F95C
  // ($18,A5) is ONE BIT, so 2 and 4 run in strict alternation. Hardcoding either plays half the show.
  setState4C(ram, a6, ram.u16(a5 + 0x18) !== 0 ? 4 : 2);     // $26F960..$26F96C
  ram.setU16(a5 + 0x18, (ram.u16(a5 + 0x18) + 1) & 1);       // $26F970/$26F974
  partSet4C(ram, a6, 0, false);                              // $26F97A bsr $26F98C
  partSet4C(ram, a6, 1, false);                              // $26F97E bsr $26FA56
}

// (state 2's draft lives BELOW, in its corrected four-step form -- the one-spawn version that
// stood here was wrong and is deleted rather than left to be copied by mistake.)

/** States 3 `$26FCF2` and 5 `$26FECA` -- THE SAME SCRIPT with two constants changed. Both travel to
 *  $5C00/$1C00, ramp ($1E,A5) down by $40 with a floor at zero, dwell, and hand back to state 1. The
 *  dwell is the only difference: $F0 for state 3, $40 for state 5. Do NOT write these twice. */
function travelDwell4C(ram, rom, a5, a6, dwell) {
  if (ram.u16(a6 + T4C.stepAt) === 0) {                      // $26FCF2 / $26FECA
    ram.setU16(a6 + 0x30, dwell);                            // $26FD02 #$F0 / $26FEDA #$40
    ram.setU8(a6 + T4C.bandAt, 0x10);                        // $26FD08 / $26FEE0
    if (ram.u16(a5 + T4C.rampAt) !== 0) {                    // $26FD0E tst.w ($1E,A5)
      const r = u16(ram.u16(a5 + T4C.rampAt) - 0x40);        // $26FD16 subi.w #$40
      ram.setU16(a5 + T4C.rampAt, i16(r) > 0 ? r : 0);       // $26FD1C bgt / $26FD20 clamp to 0
    }
    ram.setU16(a6 + T4C.stepAt, 1);
  }
  if (ram.u16(a6 + T4C.stepAt) === 1) {                      // $26FD26 / $26FEFE
    if (!steer4C(ram, rom, a6, 0x5c00, 0x1c00)) {            // $26FD30..$26FD38 / $26FF08..$26FF10
      ram.setU8(a6 + T4C.bandAt, 0);                         // $26FD40 / $26FF18
    }
    ram.setU16(a6 + T4C.stepAt, 2);                          // $26FD46 / $26FF1E
  }
  if (ram.u16(a6 + T4C.stepAt) !== 2) return;                // $26FD4C / $26FF24
  const left = u16(ram.u16(a6 + 0x30) - 1);                  // $26FD56 / $26FF2E
  ram.setU16(a6 + 0x30, left);
  if (left === 0) setState4C(ram, a6, 1);                    // $26FD5E / $26FF36
}

/** State 4 `$26FD66` -- THREE waypoint gates plus the paired type-$58 arm at `$26FDF4`.
 *
 * Step 1 must arrive at $3200/$1C00 before it writes band $04, advances to step 2 and arms phase 1.
 * The step-2 travel branch lands at the step-3 check, which then routes to the arm; the step-3 travel
 * branch lands on the arm directly. That fall-through lets record +$1E climb to $600 and lets all
 * eight due passes run while the object is still travelling. */
function state4_4C(ram, rom, a5, a6) {
  if (ram.u16(a6 + T4C.stepAt) === 0) {                      // $26FD66
    ram.setU8(a6 + T4C.bandAt, 0x08);                        // $26FD76 -- and $8 IS a band value
    ram.setU8(a6 + 0x2a, 0);                                 // $26FD7E
    ram.setU16(a6 + T4C.stepAt, 1);                          // $26FD70
  }
  if (ram.u16(a6 + T4C.stepAt) === 1) {                      // $26FD82
    if (!steer4C(ram, rom, a6, 0x3200, 0x1c00)) {            // $26FD8C/$26FD94
      ram.setU8(a6 + T4C.bandAt, 0x04);                      // $26FD9C
      ram.setU16(a6 + T4C.stepAt, 2);                        // $26FDA2
      ram.setU8(a6 + 0x2a, 1);                               // $26FDA8
    }
  }
  if (ram.u16(a6 + T4C.stepAt) === 2) {                      // $26FDAE
    if (!steer4C(ram, rom, a6, 0x3600, 0x2a00)) {            // $26FDB8/$26FDC0
      ram.setU16(a6 + T4C.stepAt, 3);                        // $26FDC8
      ram.setU8(a6 + 0x2a, 1);                               // $26FDCE
    }
  }
  if (ram.u16(a6 + T4C.stepAt) === 3) {                      // $26FDD4
    if (!steer4C(ram, rom, a6, 0x3600, 0x0e00)) {            // $26FDDE/$26FDE6
      setState4C(ram, a6, 5);                                // $26FDEE/$26FDF0
    }
  }

  // $26FDF4 -- PHASE 1. The compare-before-add matters: an existing $600 skips the add, while any
  // newly-added signed value below $600 leaves phase 1 armed for another state-4 frame.
  if (ram.u8(a6 + 0x2a) === 1) {
    let ramp = ram.u16(a5 + T4C.rampAt);
    let reached = ramp === T4C.rampCap;                      // $26FDFE/$26FE04
    if (!reached) {
      ramp = u16(ramp + 0x40);                               // $26FE08 addi.w #$40
      ram.setU16(a5 + T4C.rampAt, ramp);
      reached = i16(ramp) >= i16(T4C.rampCap);               // $26FE0E/$26FE14 blt
    }
    if (reached) {
      ram.setU16(a5 + T4C.rampAt, T4C.rampCap);              // $26FE18 -- clamp
      ram.setU8(a6 + 0x2a, 2);                               // $26FE1E
      ram.setU8(a6 + 0x2b, 8);                               // $26FE24 -- EIGHT due passes
      ram.setU8(a6 + 0x34, 0);                               // $26FE2A
    }
  }

  // $26FE30 -- PHASE 2. `andi.b #$7` gates on the low byte of the frame word, equivalent to & 7.
  if (ram.u8(a6 + 0x2a) !== 2
      || (ram.u16(T4C.spawnParityGlobal) & T4C.state4DueMask) !== 0) return;
  const tableAt = T4C.spawnBiasTable + ((ram.u8(a6 + 0x2b) & 7) << 2); // $26FE48..$26FE58
  const tableBias = rom.u32(tableAt);
  for (const packedBias of T4C.spawnBiases) {
    const q = enqueueDeferred(ram, T4C.state4SpawnChild, DEFQ_D1.FIXED00); // $26FE5C/$26FE8C
    if (!q.dropped) {
      ram.setU32(q.addr + 0x16,                              // $26FE6E/$26FE9E
        u32(u32(ram.u32(a6 + 0x02) + packedBias) + tableBias));
      ram.setU8(q.addr + 0x1a,                              // $26FE7C/$26FEAC
        (4 - ram.u8(a6 + 0x34)) & 0x3f);
    }
    // Each emission advances this byte separately, including when the queue is full.
    ram.setU8(a6 + 0x34, (ram.u8(a6 + 0x34) + 1) & 7);      // $26FE80/$26FEB0
  }
  const passes = (ram.u8(a6 + 0x2b) - 1) & 0xff;             // $26FEBA
  ram.setU8(a6 + 0x2b, passes);
  if (passes === 0) ram.setU8(a6 + 0x2a, 0);                 // $26FEC2
}

/** State 6 `$26FF3E` -- DEATH. Three instructions, and the middle one sets a speed AND a heading with
 *  ONE word write: ($1A)=$04, ($1B)=$20. ($1B) is the field the steerer slews; death sets it flat. */
function state6_4C(ram, rom, a5, a6) {
  if (ram.u16(a6 + T4C.stepAt) !== 0) return;                // $26FF3E
  ram.setU16(a6 + T4C.stepAt, 1);                            // $26FF48
  ram.setU16(a6 + T4C.bandAt, 0x0420);                       // $26FF4E -- BOTH bytes at once
}

/** State 7 `$26FF56` -- the EXIT, selected by the $1F0 arm cue. Ramps to 8 with a CLAMP, and arms the
 *  retire flag the prologue acts on NEXT frame. */
function state7_4C(ram, rom, a5, a6) {
  if (ram.u16(a6 + T4C.stepAt) === 0) {                      // $26FF56
    ram.setU16(a6 + T4C.stepAt, 1);                          // $26FF60
    ram.setU8(a6 + T4C.steerHeadingAt, 0);                   // $26FF66
  }
  if (ram.u8(a6 + T4C.bandAt) !== 8) {                       // $26FF6C cmpi.b #$8 / beq
    const v = (ram.u8(a6 + T4C.bandAt) + 1) & 0xff;          // $26FF76 addq.b #1
    ram.setU8(a6 + T4C.bandAt, i16(v) < 8 ? v : 8);          // $26FF7A/$26FF84 -- SATURATES at 8
  }
  // $26FF8E -- signed, and `bgt` SKIPS the arm, so it retires once the position is at or below $9800.
  if (i16(ram.u16(a6 + 0x02)) <= i16(0x9800)) {
    ram.setU8(a6 + 0x9e, 1);                                 // $26FF96 -- acted on NEXT frame
  }
}

const STATES_4C = Object.freeze([
  state0_4C, state1_4C, state2_4C,
  (ram, rom, a5, a6) => travelDwell4C(ram, rom, a5, a6, 0xf0),   // state 3
  state4_4C,
  (ram, rom, a5, a6) => travelDwell4C(ram, rom, a5, a6, 0x40),   // state 5
  state6_4C, state7_4C,
]);
/** State 2 `$26FBD4` -- the bullet spawner. FOUR script steps, and the volley fires TWICE per pass on
 *  ALTERNATE frames. Each counter-rotating cursor drives its own spawn. */
function state2_4C(ram, rom, a5, a6, ctx) {
  if (ram.u16(a6 + T4C.stepAt) === 0) {                      // $26FBD4
    ram.setU8(a6 + T4C.bandAt, 0x10);                        // $26FBE4
    ram.setU8(a6 + 0x2a, 0); ram.setU8(a6 + 0x2b, 0);        // $26FBEA/$26FBF0 -- TWO byte writes
    ram.setU8(a6 + 0x34, 0x10);                              // $26FBF6 -- a BYTE, leaving $35 alone
    ram.setU16(a6 + T4C.stepAt, 1);
  }
  if (ram.u16(a6 + T4C.stepAt) === 1) {                      // $26FBFE
    if (!steer4C(ram, rom, a6, 0x2800, 0x1c00)) {            // $26FC06..$26FC0E
      ram.setU8(a6 + T4C.bandAt, 0);                         // $26FC16
    }
    ram.setU16(a6 + T4C.stepAt, 2);                          // $26FC1C
  }
  if (ram.u16(a6 + T4C.stepAt) === 2) {                      // $26FC22
    const r = u16(ram.u16(a5 + T4C.rampAt) + 0x40);          // $26FC2C addi.w #$40 -- ramp UP
    ram.setU16(a5 + T4C.rampAt, i16(r) < T4C.rampCap ? r : T4C.rampCap);   // $26FC32 cap $600
    ram.setU16(a6 + T4C.stepAt, 3);                          // $26FC42
  }
  if (ram.u16(a6 + T4C.stepAt) !== 3) return;                // $26FC48
  // $26FC52 -- FRAME PARITY. The whole volley is skipped on odd frames, so it fires every OTHER
  // frame. Without this the bullet count doubles, and each individual spawn still looks correct.
  if ((ram.u16(0x80390a) & 1) !== 0) return;

  const bias = T4C.spawnBiasTable + ((ram.u8(a6 + 0x34) & 7) << 2);   // $26FC5E..$26FC70
  // The two spawns' own biases STRADDLE a boundary -- $0C7FF600 and $0C800A00 -- the same mirrored
  // shape as the draw pairs. Folding them to one value puts both volleys on top of each other.
  for (const [addBias, cursorAt, step] of [[0x0c7ff600, 0x2a, +4], [0x0c800a00, 0x2b, -4]]) {
    // enqueueDeferred returns { addr, dropped } -- NOT a bare address. `spawnEffect` returns the
    // opposite, which is why this cannot be recalled and must be read (sibling: handlers.js:3180).
    const q = enqueueDeferred(ram, 0x52, DEFQ_D1.FIXED00);   // $26FC72 / $26FC9A jsr $263684
    if (!q.dropped) {
      ram.setU32(q.addr + 0x16,                              // $26FC86 / $26FCAE
        u32(u32(ram.u32(a6 + 0x02) + addBias) + rom.u32(bias)));      // add.l (A4),D0
      ram.setU8(q.addr + 0x1a, ram.u8(a6 + cursorAt));       // $26FC8A / $26FCB2
    }
    ram.setU8(a6 + cursorAt, (ram.u8(a6 + cursorAt) + step) & 0x3f);  // $26FC90 / $26FCB8
  }

  const c = (ram.u8(a6 + 0x34) - 1) & 0xff;                  // $26FCC2
  ram.setU8(a6 + 0x34, c);
  if (c === 0) setState4C(ram, a6, 3);                       // $26FCCA/$26FCCC
}
/** `$26FFE8` -- the RETIRE PREDICATE, ALL THREE ARMS (W402).
 *
 *  Returns a boolean the ROM carries in the CARRY flag, through the shared stubs `$270128`
 *  (`andi.w #$FFFE,SR`, clear) and `$27012E` (`ori.w #$1,SR`, set). $4C's single caller
 *  (`$26F6E4 bsr.w`) IGNORES the return, so do not invent a branch on it; what matters is the
 *  ($9E,A6) arm A sets.
 *
 *  ($86,A6) is tested 2, then 1, then 0 -- so a phase promoted this frame does NOT also run this
 *  frame, because the `cmpi.b` that would catch it is already behind the cursor. Same order and
 *  same reasoning as type $44's `deathSequence26EA00` (stage5type44.js), which is this routine
 *  under different field names and different lists:
 *
 *      $4C  ($86) ($88) ($89) ($8A) ($8C)   lists $27017E / $270134
 *      $44  ($A6) ($A8) ($A9) ($AA) ($AC)   lists $26EB90 / $26EB46   -- BYTE FOR BYTE THE SAME
 *                                                                        $94 of table data
 *
 *  W402 CORRECTS W401. The port had only arm B's BODY: no `($86,A6) == 1` gate, no countdown, no
 *  `$26C74E` walk, no cue and no tail, so it fired the burst pair on EVERY retire frame where
 *  ($86,A6) != 2. And arm C was absent entirely -- which mattered because `$270122` is the only
 *  instruction that can store 1 into ($86,A6) on a $4C record, so arm B was UNREACHABLE and the
 *  port was running, every frame, a block the cartridge reaches once. */
function retireCheck4C(ram, rom, a5, a6, ctx) {
  if (ram.u8(a6 + T4C.dyingAt) === 0) return false;          // $26FFE8 tst.b ($9F,A6) / beq $270128
  ram.setU16(a6 + 0x02, u16(ram.u16(a6 + 0x02) - 0x40));     // $26FFF0 subi.w #$40,($2,A6)
  armScreenClear243E02(ram, ctx, ram.u16(a6 + T4C.hitMaskTo), 0x26fffa);   // $26FFF6/$26FFFA

  // ---- ARM A ($270000), ($86,A6) == 2: hand the record to the prologue's retire and stop.
  if (ram.u8(a6 + T4C.deathPhaseAt) === 2) {                 // $270000 cmpi.b #$2,($86,A6)
    ram.setU8(a6 + T4C.retireArmAt, 1);                      // $27000A -- acted on NEXT frame
    return true;                                             // $270010 bra.w $27012E, carry SET
  }

  // ---- ARM B ($270014), ($86,A6) == 1: the ONE-SHOT finale.
  // $27001A and $270022 both branch to $270094, the arm-C test -- NOT to the exit -- so a
  // non-firing frame still falls into arm C's `cmpi.b #$0`, which fails, which is what makes the
  // two branches equivalent to a fall-through. Transcribed as the fall-through the flow really is.
  if (ram.u8(a6 + T4C.deathPhaseAt) === 1) {                 // $270014 cmpi.b #$1,($86,A6)
    // `subq.b` then `bne`: this arm fires AT ZERO, unlike arm C's `subq.b`/`bcc` below, which
    // fires on the UNDERFLOW. The two conventions sit eight instructions apart in one routine.
    ram.setU8(a6 + T4C.deathTickAt, (ram.u8(a6 + T4C.deathTickAt) - 1) & 0xff);   // $27001E
    if (ram.u8(a6 + T4C.deathTickAt) === 0) {                // $270022 bne.w $270094
      const pos = ram.u32(a6 + 0x02);                        // $270026 move.l ($2,A6),D2
      // $27002A lea ($27017E,PC),A1 / $270030 jsr $26C74E. $26C74E is `walkDeathSpawns270D92`'s
      // twin: identical field for field, differing ONLY in the ($1E,A0) literal, which is $10.
      walkDeathSpawns270D92(ram, rom, ctx, T4C.deathListB, pos, 0x270030, T4C.deathAnim);
      // $270036..$270080 -- the QUARTER-TURN PAIR. One shared angle, +$40 on one side and +$C0 on
      // the other, with MIRRORED position biases. One constant for both stacks them on one bearing.
      for (const [turn, bias, site] of T4C.burstTurns) {
        // W401: this was `drawWord242EC2`. $270036 and $27005C are BOTH `4e b9 00 24 2b 3c` = jsr
        // $242B3C, and EVERY `jsr $28B4BE` in the $26Cxxx/$26Exxx/$270xxx family draws from $242B3C.
        const r = drawByte242B3C(ram, rom);                  // $270036 / $27005C jsr $242B3C
        bigBurst28B4BE(ram, rom, ctx,                        // $270056 / $27007C jsr $28B4BE
          // $270048 / $27006E `06 82 f8 00 08 00` addi.l #$F8000800,D2 -- a FULL 32-bit add, so no
          // packed half-word helper. W401: this read `packedAdd(...)`, a non-exported local in
          // stage3carrier.js that was never imported here -- a ReferenceError on every frame that
          // reached this arm, and nothing drove it.
          u32(pos + bias),
          (((r << 1) & 0xff) + turn) & 0xff,                 // $27003C asl.b #1 / $270040 addi.b
          0, T4C.burstBucket, site);                         // $270052 D0=0, $27004E D3=$C
      }
      ctx.soundPost?.(T4C.deathCueB);                        // $270082 jsr $28C310
      ram.setU8(a6 + T4C.deathTickAt, T4C.deathPhase1Tick);  // $270088 move.b #$10,($88,A6)
      ram.setU8(a6 + T4C.deathPhaseAt, 2);                   // $27008E move.b #$2,($86,A6)
    }
  }

  // ---- ARM C ($270094), ($86,A6) == 0: the TABLE WALK, one row per tick, and the ONLY writer of
  // ($86,A6) = 1 in this program. Reached by fall-through from arm B as well as directly.
  if (ram.u8(a6 + T4C.deathPhaseAt) !== 0) return false;     // $270094 cmpi.b #$0 / $27009A bne.w
  // $27009E `subq.b #1,($88,A6)` / $2700A2 `bcc.w $270128` -- the UNDERFLOW convention: the borrow
  // that sets carry only happens when the byte WAS zero, so it acts on the frame after it hits 0.
  const tick = ram.u8(a6 + T4C.deathTickAt);
  ram.setU8(a6 + T4C.deathTickAt, (tick - 1) & 0xff);
  if (tick !== 0) return false;                              // $2700A2 bcc.w -- carry CLEAR
  ram.setU8(a6 + T4C.deathTickAt, ram.u8(a6 + T4C.deathReloadAt));   // $2700A6 reload FROM +$89
  ctx.soundPost?.(T4C.deathCueA);                            // $2700AC jsr $28C274

  // $2700B2 lea ($270134,PC),A1 / $2700B8 adda.w ($8A,A6),A1 -- INDEXED, not walked: the $FFFF at
  // $27017C is never read, and $270104's `cmpi.w #$48` is the only thing that bounds the cursor.
  const cursor = ram.u16(a6 + T4C.deathCursorAt);
  if (cursor >= T4C.deathListAEnd) {
    unreached(0x2700b2, `type $4C's retire cursor ($8A,A6) is $${cursor.toString(16)}, past the SIX `
      + '12-byte rows at $270134; $270104\'s cmpi.w #$48 is the only thing that bounds it');
  }
  const at = T4C.deathListA + cursor;
  const d1 = rom.u16(at);                                    // $2700BC move.w (A1)+,D1
  const slot = spawnEffect(ram, ctx, rom.u16(at + 2), 0x2700c0);   // $2700BE/$2700C0 jsr $289004
  if (slot) {
    ram.setU8(slot + 0x1c, rom.u16(at + 4) & 0xff);          // $2700C6/$2700C8 move.b D0,($1C,A0)
    ram.setU16(slot + 0x18, d1);                             // $2700CC move.w D1,($18,A0)
    ram.setU32(slot + 0x26, rom.u32(at + 6));                // $2700D0 move.l (A1)+,($26,A0)
    ram.setU32(slot + 0x02, ram.u32(a6 + 0x02));             // $2700D4 move.l ($2,A6),($2,A0)
    // TRAP 1: `31 7c 00 10 00 1e` is the IMMEDIATE $10 and THEN the displacement $1E. Reading the
    // two the other way round is what left `bucket = $C` in stage3carrier.js's copy of this block.
    ram.setU16(slot + 0x1e, T4C.deathAnim);                  // $2700DA move.w #$10,($1E,A0)
    ram.setU16(slot + 0x12, 0);                              // $2700E0
    ram.setU16(slot + 0x14, 0);                              // $2700E6
    ram.setU8(slot + 0x1a, ram.u8(a6 + 0x1a));               // $2700EC move.b ($1A,A6),($1A,A0)
    ram.setU8(slot + 0x1b, (ram.u8(a6 + 0x1b) * 4) & 0xff);  // $2700F2 add.b D0,D0 TWICE
  }
  const next = u16(cursor + T4C.deathListAStride);           // $2700FE addi.w #$C,($8A,A6)
  ram.setU16(a6 + T4C.deathCursorAt, next);
  if (next !== T4C.deathListAEnd) return false;              // $270104 cmpi.w #$48 / $27010A bne.w
  ram.setU16(a6 + T4C.deathCursorAt, 0);                     // $27010E move.w #$0,($8A,A6)
  const loops = u16(ram.u16(a6 + T4C.deathLoopAt) - 1);      // $270114 subq.w #1,($8C,A6)
  ram.setU16(a6 + T4C.deathLoopAt, loops);
  if (loops !== 0) return false;                             // $270118 bne.w $270128
  // TRAP 3: ONE WORD LITERAL, TWO BYTE FIELDS. $88 = $10 (the tick arm B counts down) and
  // $89 = $06 (a reload arm C will never read again, because $86 leaves 0 on the next line).
  ram.setU8(a6 + T4C.deathTickAt, T4C.deathReload >> 8);     // $27011C move.w #$1006,($88,A6)
  ram.setU8(a6 + T4C.deathReloadAt, T4C.deathReload & 0xff);
  ram.setU8(a6 + T4C.deathPhaseAt, 1);                       // $270122 move.b #$1,($86,A6)
  return false;                                              // $270128 andi.w #$FFFE,SR
}

/** `$26F9A2` -- PART 3's animator. Fires from the drawn muzzle, then RETRACTS the two draw offsets. */
function sub26F9A2(ram, rom, a5, a6, ctx) {
  if (ram.u16(a6 + T4C.partSetters[0].flagAt) === 0) return; // $26F9A2 tst.w ($46,A6) / beq
  // $26F9D0 -- THE GATE IS THE SUM: it fires only once BOTH draw offsets have retracted to zero, so
  // the two halves close and THEN it shoots. Parity-gated like state 2's volley.
  if (u16(ram.u16(a6 + 0x48) + ram.u16(a6 + 0x4a)) !== 0) return;   // $26F9D0..$26F9D8
  if ((ram.u16(T4C.spawnParityGlobal) & 0xffff) !== 0) return;      // $26F9DE or.w / bne
  ram.setU16(a6 + 0x4c, 1);                                         // $26F9E6 -- the $46 companion
  // TWO children of type $4E at the two part-3 draw biases: the fifth mirrored pair in this type.
  for (const b of [0xfc3fec80, 0xfc401380]) {                       // $26F9F8 / $26FA14
    const c = enqueueDeferred(ram, 0x4e, DEFQ_D1.FIXED00);          // $26F9EC/$26F9EE moveq #$4E
    if (!c.dropped) {
      ram.setU32(c.addr + 0x16, u32(ram.u32(a6 + 0x02) + b));       // $26F9FE / $26FA1A
      ram.setU16(c.addr + 0x1a, b === 0xfc3fec80 ? 0xfa00 : 0x0600); // $26FA02 / $26FA1E
    }
  }
  const q = enqueueDeferred(ram, T4C.spawnChild, DEFQ_D1.FIXED00);        // $26FA0A jsr $263684
  if (!q.dropped) {
    // The SAME bias as the $26F7D2 draw half, so the shot leaves from the muzzle that is drawn.
    ram.setU32(q.addr + 0x16, u32(ram.u32(a6 + 0x02) + 0xfc401380));      // $26FA14/$26FA1A
    ram.setU16(q.addr + 0x1a, 0x0600);                                   // $26FA1E
  }
  // $26FA24..$26FA52 -- RETRACT both halves toward zero. These are the draw pair's partAdd/partSub, so
  // they are ANIMATED, not constants: the halves extend and close symmetrically.
  for (const off of [0x48, 0x4a]) {
    if (ram.u16(a6 + off) === 0) continue;                   // $26FA24 / $26FA3C tst.w / beq
    const v = u16(ram.u16(a6 + off) - 0x100);                // $26FA2C / $26FA44 subi.w #$100
    ram.setU16(a6 + off, i16(v) > 0 ? v : 0);                // $26FA32 bgt / $26FA36 floor at 0
  }
}

/** `$26FA82` -- PART 4's animator, and the type's FAN. `localLoop` is this routine's dbra. */
function sub26FA82(ram, rom, a5, a6, ctx) {
  if (ram.u16(a6 + T4C.partSetters[1].flagAt) === 0) return; // $26FA82 -- the ($66,A6) gate

  // $26FACA..$26FAF4 -- THE PLAYERS ONLY GATE THIS. Both records are read INLINE rather than through
  // targetSelect, so there is no side preference, and a dead player contributes 0 rather than being
  // skipped. It keeps the LARGER of the two coordinates.
  let d0 = 0;                                                // $26FACA moveq #$0,D0
  if ((ram.u16(0x8103e6) & 0x8000) === 0) d0 = ram.u16(0x8103e8);     // $26FACC..$26FAD6, P1
  let d1 = 0;                                                // $26FADC moveq #$0,D1
  if ((ram.u16(0x810448) & 0x8000) === 0) d1 = ram.u16(0x81044a);     // $26FADE..$26FAE8, P2
  if (!(d1 < d0)) d0 = d1;                                   // $26FAEE cmp.w / bcs -- keep the LARGER

  // $26FAF6..$26FB00 -- and the whole fan is skipped when that player is short of the engagement line.
  if (d0 < u16(ram.u16(a6 + 0x02) - 0x400)) return;          // bcs, so SHORT means no fan at all

  // $26FB04..$26FB16 -- the fire registers are LITERALS: the players chose whether, not where.
  const passes = 0x24 + 1;                                   // $26FB04 move.w #$24,D7 -- the DBcc rule
  const fireD0 = 0x00010007;                                 // $26FB08 move.l #$10007,D0
  let head = T4C.fanEntryHeading;                            // $26FB0E move.w #$2E,D1
  const pos = ram.u32(a6 + 0x02);                            // $26FB12 move.l ($2,A6),D2
  const d5 = 0;                                              // $26FB16 moveq #$0,D5

  for (let n = 0; n < passes; n++) {                         // $26FB3A dbra D7 -- 37, not 36
    const e = rom.u32(T4C.fanTable + ((head & 0x3f) << 2));  // $26FB18..$26FB28
    const res = fireBullet({ ram, rom, log: new WriteLog(ram) }, 0x281402,   // $26FB2E jsr $281402
      { d0: fireD0, d1: head, d2: u32(u32(pos + e) + d5), d3: 0, d4: 0, d5, a5 });
    ctx.bulletSpawn?.(0x26fb2e, res);                        // the type $11 idiom, handlers.js:768
    head = (head + 1) & 0x3f;                                // $26FB34/$26FB36 -- WRAPS, not clamps
  }

  // $26FB3E -- the SECOND counter-and-reload pair, state 0's shape exactly.
  const c = (ram.u8(a6 + 0x6e) - 1) & 0xff;
  ram.setU8(a6 + 0x6e, c);
  if (c !== 0xff) return;                                    // $26FB42 bcc -- no borrow yet
  ram.setU8(a6 + 0x6e, ram.u8(a6 + 0x6f));                   // $26FB46 reload from its PERIOD
  if (u16(ram.u16(a6 + 0x68) + ram.u16(a6 + 0x6a)) !== 0) return;  // $26FB4C..$26FB54, BOTH must be 0

  // $26FB58 -- a COIN FLIP picks WHICH half of the part-4 pair fires. Part 3's animator fires BOTH of
  // its children; this one fires ONE. Copying either to the other doubles or halves the output.
  const half = drawWord242EC2(ram, rom) & 1;                 // $26FB58/$26FB5E andi.w #$1
  const p4 = T4C.draws.filter((d) => d.part === 4)[half];    // $26FB62 bne -- the other half
  const shot = enqueueDeferred(ram, 0x50, DEFQ_D1.FIXED00);  // $26FB66 moveq #$50,D0
  if (!shot.dropped) {                                       // $26FB72/$26FB78
    ram.setU32(shot.addr + 0x16, u32(ram.u32(a6 + 0x02) + p4.biases[0]));
  }
  ram.setU16(a6 + T4C.partSetters[1].clears[0], 1);          // $26FB7C -- the $66 companion
}

function handler1A(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);

  // $268E6C..$268E92 -- TWO sequential word adds, carry off the SECOND. Folding them into one
  // addi.w #$7E00 changes the branch: with D0 = $F000 the pair clears the carry and the single sets it.
  const first = u16(ram.u16(a6 + 0x02) + T1A.boundsBias[0]);   // $268E76
  const offScreen = first + T1A.boundsBias[1] > 0xffff;        // $268E7A/$268E7E bcc
  if (offScreen) {
    if (ram.u8(a5 + T1A.onScreenAt) !== 0) { freeEnemy(ram, a5); return; }   // $268E80/$268E86
  } else {
    ram.setU8(a5 + T1A.onScreenAt, 1);                        // $268E8E
  }

  // $268E94 -- the $5C damage arm. THIS MEMBER INSPECTS ($1D,A6) BEFORE XORING: $49, $4B and $55 all
  // XOR unconditionally, and copying them would show a colour the cartridge never draws.
  const hit = ram.u8(a6) & T1A.damageMask;                    // $268E94/$268E96
  if (hit === 0) {
    // $268E9A..$268EB0 -- the not-hit path picks the base or the sentinel by HP.
    ram.setU8(a6 + 0x1d, i16(ram.u16(a6 + 0x18)) >= T1A.hpGate
      ? ram.u8(a5 + T1A.palBase)                              // $268E9A
      : T1A.paletteSentinel);                                 // $268EAE moveq #$19,D0
  } else {
    ram.setU8(a6, ram.u8(a6) & T1A.damageClear);              // $268EB2 andi.b #$A3
    scoreHit(ram, ctx, a6, hit);                              // $268EB6 jsr $286096
    let d0 = ram.u8(a6 + 0x1d);                               // $268EBC
    if (d0 === T1A.paletteSentinel) d0 = ram.u8(a5 + T1A.palBase);   // $268EC0/$268EC6
    d0 = (d0 ^ ram.u8(a5 + T1A.palXor)) & 0xff;               // $268ECA/$268ECE
    if ((ram.u16(a6 + 0x18) & 0x8000) !== 0) {                // $268ED0 tst.w / bmi $269160
      death1A(ram, rom, a5, a6, ctx);
      return;
    }
    ram.setU8(a6 + 0x1d, d0);                                 // $268ED8
  }

  spawnCues28AC72(ram, rom, a5, a6);                          // $268EDC jsr $28AC72
  // $268EE2 -- the pause as a WORD here, and as a LONG at $268F4A/$269088 where it also covers $8130D4.
  if (ram.u16(T1A.pauseAll) !== 0) { tail1A(ram, rom, a5, a6, ctx); return; }   // $268EE8 bne $268F4A

  // $268EEA..$268F14 -- the SQUARE-wave wobble. ($36,A6) free-runs by $20 and only bit 6 is used, so
  // ($6,A6) alternates between $F000 and $F040. Not a sine, and cheaper than $55's $241D34 route.
  ram.setU16(a6 + 0x06, 0xf000);                              // $268EEA
  if (ram.u8(a6 + 0x1b) < 0x40) {                             // $268EF0 cmpi.b #$40 / bcc
    ram.setU16(a6 + 0x36, u16(ram.u16(a6 + 0x36) + T1A.wobbleStep));            // $268EF8
    ram.setU16(a6 + 0x06,
      u16(ram.u16(a6 + 0x06) + (ram.u16(a6 + 0x36) & T1A.wobbleMask)));         // $268EFE..$268F06
    if (due8(ram, a6 + 0x26)) {                               // $268F0A subq.b #1,($26,A6) / bcc
      ram.setU8(a6 + 0x26, ram.u8(a6 + 0x27));                // $268F10 -- the pair is in the SUB-record
      // $268F16..$268F38 -- the BIDIRECTIONAL cursor. Forward wraps at $10 to 0; reverse wraps on
      // UNDERFLOW to $C, using the carry, so it is not (cursor - 4) & 0xC.
      const dir = ram.u8(a6 + 0x1c) !== 0;
      let cur = ram.u16(a6 + T1A.cursorAt);
      if (!dir) {
        cur = u16(cur + T1A.cursorStep);                      // $268F1C addq.w #4
        if (cur === T1A.cursorWrap) cur = 0;                  // $268F20/$268F28 -- EQUALITY, then clr
      } else {
        const next = cur - T1A.cursorStep;                    // $268F2E subq.w #4
        cur = next < 0 ? T1A.cursorWrapDown : next;           // $268F32 bcc / $268F34 move.w #$C
      }
      ram.setU16(a6 + T1A.cursorAt, cur);
      ram.setU32(a6 + 0x0a, rom.u32(T1A.artTable + cur));     // $268F3A..$268F44
    }
  }

  // $268F4A -- the LONG read, so this one test honours BOTH $8130D2 and $8130D4.
  if (ram.u32(T1A.pauseAll) !== 0) { tail1A(ram, rom, a5, a6, ctx); return; }

  // $268F50..$269046 -- ARM 1: the seven-shot fan.
  if (due8(ram, a5 + T1A.fanGateAt)) {                        // $268F50 subq.b #1,($22,A5) / bcc
    ram.setU8(a5 + T1A.fanGateAt, ram.u8(a5 + T1A.fanGateReloadAt));            // $268F5C
    // $268F62 -- re-aim only on the burst's first volley, the same idiom as $55's ($2E,A5)/($2F,A5).
    if (ram.u8(a5 + T1A.burstAt) === ram.u8(a5 + T1A.burstReloadAt)) {
      // $268F6E..$268F8C -- targetSelect IS this block: it keys on ($3,A5) and does the exg.
      const sel = targetSelect(ram, a5);
      if (sel && sel.addr) {
        // $268F8E/$268F94 -- movem.w SIGN-EXTENDS both. aim64 is $24203E: self D0/D1, target D2/D3.
        const want = aim64(aimTables(rom),
          u16(ram.u16(a6 + 0x02) + 0x0b00), ram.u16(a6 + 0x04),                 // $268FA0 addi.w #$B00
          ram.u16(sel.addr + 0x02), ram.u16(sel.addr + 0x04));
        // $268FB2 -- slew64, NOT slew64FromRecord. The facing comes from ($28,A5), the RECORD.
        const dir = slew64(ram.u16(a5 + T1A.headingAt) & 0xff, want);            // $268FAE/$268FB2
        ram.setU16(a5 + T1A.headingAt, u16(dir));                               // $268FB8
        // $268FBC -- the sprite is 32-step where the heading is 64-step: andi.w #$3E drops bit 0.
        ram.setU32(a5 + 0x24, rom.u32(T1A.headingTable + ((dir & 0x3e) * 2)));   // $268FC2
      }
    }
    if (i16(ram.u16(a6 + 0x02)) >= T1A.fanGateX && due8(ram, a5 + T1A.fanTimerAt)) {   // $268FD2/$268FDA
      ram.setU8(a5 + T1A.fanTimerAt, ram.u8(a5 + T1A.rankArm1At));              // $268FE0 -- the RANK value
      fan1A(ram, rom, a5, a6, ctx);
    }
  }

  tail1A(ram, rom, a5, a6, ctx);                              // $269058
}
// $269024..$269046 -- arm 1's SEVEN shots. One emit per pass, not unrolled like $55's.
// T1A.fan.angles is pinned against the cartridge by w363type1afields.test.js: seven values derived from
// backoff $24 and step $C, checked symmetric about the aim.
//
// THE SPEED BIAS IS RANDOM PER VOLLEY. $268FF6 calls $242B90 -- drawByte242B3C's D5-returning twin, same
// table -- and $269012 SWAPS the byte into the high word, so it becomes the X half of a packed long.
// $55's equivalent is a fixed $02000000, and reusing $55's fan with a constant here gives a
// uniform-speed volley: visually close, mechanically wrong, invisible in one frame.
function fan1A(ram, rom, a5, a6, ctx) {
  const base = ram.u16(a5 + T1A.headingAt) & 0xff;
  const d5 = (drawByte242B3C(ram, rom) << 16) >>> 0;      // $268FF6 jsr $242B90 / $269012 swap D5
  const ctxB = { ram, rom, log: new WriteLog(ram) };
  T1A.fan.angles.forEach((off) => {
    const d1 = (base + off) & 0xff;                       // $26901C subi.w #$24 / $26903E addi.w #$C
    const idx = (d1 + 2) & 0xfc;                          // $26902C addq.w #2 / $26902E andi.w #$fc
    const regs = {
      d0: 0x5,                                            // $269016 moveq #$5,D0 -- a WORD 5
      d1,
      d2: ram.u32(a6 + 0x02),                             // $269018
      d3: i32(rom.u32(T1A.vectorTable + idx) + d5),       // $269032 move.l (A0,D3.w),D3 / $269036 add.l D5,D3
      d4: 0,
      d5,
      a5,
    };
    ctx.bulletSpawn?.(0x269038, fireBullet(ctxB, T1A.fan.emit, regs));   // $269038 jsr $281744
  });
}

// $269092..$26915E -- ARM 2: the twin-muzzle burst, on its own rank-dependent timer.
//
// ($2E,A5) HAS TWO RELOAD SOURCES: ($2A,A5), the other rank value, on the ordinary step, and ($2F,A5)
// when the ($30,A5) volley counter expires. That is a burst-within-a-burst, and treating ($2E,A5) as
// having one reload collapses the grouping.
//
// It also selects its target DIFFERENTLY from arm 1: aim256 does its own selection by the shared rule
// and IGNORES ($3,A5), so the two arms can legitimately fire at different players in one frame.
function arm2_1A(ram, rom, a5, a6, ctx) {
  if (!due8(ram, a5 + T1A.arm2TimerAt)) return;           // $2690A2 subq.b #1,($2E,A5) / bcc
  ram.setU8(a5 + T1A.arm2TimerAt, ram.u8(a5 + T1A.rankArm2At));          // $2690AA -- the RANK value
  ram.setU8(a5 + T1A.arm2CountAt, ram.u8(a5 + T1A.arm2CountReloadAt));   // $2690B0
  // $2690B6/$2690BC -- TWO byte writes of $80, the no-target fallback for both muzzles.
  ram.setU8(a5 + T1A.muzzleAimAt[0], T1A.muzzleAimFallback);
  ram.setU8(a5 + T1A.muzzleAimAt[1], T1A.muzzleAimFallback);

  // $2690C2..$2690F2 -- two aims from points +/-$680 in Y off a shared X-$600. The `bcs` at $2690D6
  // fires on the FIRST aim only, so no target leaves BOTH muzzles at $80.
  // $24226E is aim256FromCaller(t, ram, a5, selfY, selfX) -- selfY BEFORE selfX, and it does its OWN
  // target selection from the record, which is why this arm ignores ($3,A5) where arm 1 honours it.
  const selfX = u16(ram.u16(a6 + 0x02) + T1A.muzzleXOffset);
  const y = ram.u16(a6 + 0x04);
  const up = aim256FromCaller(aimTables(rom), ram, a5, u16(y + T1A.muzzleYOffset), selfX);
  if (up === null) return;                                // $2690D6 bcs $2690F6 -- FIRST aim only
  ram.setU8(a5 + T1A.muzzleAimAt[0], up & 0xff);          // $2690DA
  const down = aim256FromCaller(aimTables(rom), ram, a5, u16(y - T1A.muzzleYOffset), selfX);
  if (down !== null) ram.setU8(a5 + T1A.muzzleAimAt[1], down & 0xff);    // $2690F2

  // $2690F6..$26915E -- the two shots. Each jitters its own muzzle's aim by asr.b #2 of a FRESH draw:
  // ARITHMETIC, so signed, giving -32..+31 centred. `>>> 2` on an unsigned byte biases every shot one way.
  const ctxB = { ram, rom, log: new WriteLog(ram) };
  T1A.muzzleAimAt.forEach((at, i) => {
    const draw = drawByte242B3C(ram, rom);                // $269108/$269130 jsr $242B3C
    const jitter = (draw << 24) >> 24 >> T1A.muzzle.jitterShift;          // $26910E asr.b #2
    const d1 = (ram.u8(a5 + at) + jitter) & 0xff;         // $269110 add.b D0,D1
    const regs = {
      d0: T1A.muzzle.d0,                                  // $269112 move.l #$20016,D0
      d1,
      d2: ram.u32(a6 + 0x02),                             // $269118
      d3: T1A.muzzle.bias[i],                             // $26911C/$269144 -- borrow-symmetric
      d4: 0,
      d5: 0,
      a5,
    };
    ctx.bulletSpawn?.(0x269124 + i * 0x28, fireBullet(ctxB, T1A.muzzle.emit, regs));
  });

  // $269152 -- step the volley counter; on underflow ($2E,A5) reloads from ($2F,A5), NOT ($2A,A5).
  const n = ram.u8(a5 + T1A.arm2CountAt);
  ram.setU8(a5 + T1A.arm2CountAt, (n - 1) & 0xff);
  if (n === 0) ram.setU8(a5 + T1A.arm2TimerAt, ram.u8(a5 + T1A.arm2GapAt));   // $269158
}

// $269058..$26907E -- the tail. TWO emits, and the position bias is SWAP-SEPARATED word adds.
//
// $26905E..$26906C is `move.l ($2,A6),D1 / addi.w #-$400,D1 / swap D1 / addi.w #$500,D1 / swap D1`. The
// halves are added while swapped APART, so there is NO borrow between them. Folding this into
// `addi.l #$0500FC00` introduces a carry the cartridge never performs.
function tail1A(ram, rom, a5, a6, ctx) {
  enqueueRegistersThroughStub(ram, rom, T1A.drawStubs[0],                // $269058 jsr $23D762
    swapBiasedPosition(ram.u32(a6 + 0x02)),
    ram.u32(a5 + 0x24),                                                  // $26906E move.l ($24,A5),D2
    0x620,                                                               // $269072 move.w #$620,D3
    ram.u8(a6 + 0x1d));
  enqueueRegistersThroughStub(ram, rom, T1A.drawStubs[1],                // $26907A jsr $23DECE
    swapBiasedPosition(ram.u32(a6 + 0x02)),
    ram.u32(a5 + 0x24), 0x620, ram.u8(a6 + 0x1d));
  // $269082 jsr $26331C -- a bare rts. Transcribed, not called. Hibachi calls the same stub eleven times.
}

/** The swap-separated bias: -$400 on the LOW half, +$500 on the HIGH, with no borrow between them. */
function swapBiasedPosition(pos) {
  const lo = u16((pos & 0xffff) - 0x400);                 // $269062 addi.w #-$400,D1
  const hi = u16(((pos >>> 16) & 0xffff) + 0x500);         // $269068 addi.w #$500,D1 after the swap
  return ((hi << 16) | lo) >>> 0;
}

// $269160..$26925C -- the death arm. Follows type $88's ($27627E) line for line, including deferring
// the pool-C bursts through noteEffect: $88 ships that way and its own header says "THE DEATH EXPLOSION,
// WIRED", so the burst is a known effect-subsystem deferral rather than an oversight.
function death1A(ram, rom, a5, a6, ctx) {
  const u = ctx.unported;
  scoreKill(ram, rom, ctx, T1A.killScore, ram.u8(a6) & T1A.damageMask);   // $269160/$269166 -- $350
  ctx.soundPost?.(T1A.deathCue);                                          // $26916C -- shared with $49/$55
  noteEffect(u, T1A.burstBucket, a5, `D0=$C, D2=$${T1A.burstBias[0].toString(16).toUpperCase()}`);
  // $269184 -- RANK EXACTLY 4 (cmpi.w #$4 / bne, not a threshold) AND clock below $2B0. Content almost
  // nobody sees, so a port that gets it wrong passes every playtest: it belongs in a test, not a session.
  if (ram.u16(T1A.rankGlobal) === T1A.rank4Exactly
      && ram.u16(T1A.clockGlobal) < T1A.rank4ClockBelow) {
    noteEffect(u, T1A.burstBucket, a5,
      `D0=$C, D2=$${T1A.burstBias[1].toString(16).toUpperCase()} -- the RANK-4 MIRROR burst`);
  }
  // $2691A8/$2691DC/$26920E -- THREE spawnEffect calls, kinds $D, $5, $5, with DIFFERENT velocities.
  // Counting the sites is how this was read; reading them in sequence produced a retraction in W351.
  const fields = [
    { kind: 0xd, w: [[0x1e, 0x10], [0x12, 0], [0x14, 0], [0x26, 0x400], [0x28, 0], [0x10, 1]] },
    { kind: 0x5, w: [[0x1e, 0x10], [0x12, 0]] },
    { kind: 0x5, w: [[0x1e, 0x10], [0x14, 0x400], [0x26, 0xf800], [0x28, 0x600], [0x10, 1]] },
  ];
  for (const { kind, w } of fields) {
    // spawnEffect returns a BARE ADDRESS (effects.js returns POOL_B.bitBucket directly), NOT { addr }.
    // Writing through `r.addr` would write through undefined and drop every field silently.
    const addr = spawnEffect(ram, ctx, kind);             // $289004
    if (!addr) continue;
    ram.setU32(addr + 0x02, ram.u32(a6 + 0x02));          // the record's position
    for (const [off, val] of w) ram.setU16(addr + off, val);
  }
  freeEnemy(ram, a5);
}

/** The map of ported handler addresses -> functions, for the enemy driver. */
export function handlerMap() { return HANDLERS; }
export const HANDLER_ADDRESSES = [...HANDLERS.keys()];

// W346: every one of these specs carried a hand-written comment claiming its entry points were
// "verified against the type table", and those claims were checked by eye, once, at the moment the
// spec was written. That is exactly the class of claim that rots: `$55`'s init body was registered
// after `INIT_BODY_ADDRESSES` was built and sat as a silent no-op through five green checks.
// Exporting the specs by type number lets `w346typetable.test.js` re-derive all of it from the ROM's
// own table at `$267824` on every run, so the prose claims stop being load-bearing.
export const TYPE_SPECS = Object.freeze(new Map([
  [0x01, T01], [0x1b, T1B], [0x43, T43], [0x45, T45], [0x47, T47], [0x48, T48],
  [0x1a, T1A], [0x46, T46], [0x49, T49], [0x4c, T4C], [0x4a, T4A], [0x4b, T4B], [0x55, T55], [0x59, T59],
  [0x81, T81], [0x8e, T8E], [0xb0, TB0],
]));
