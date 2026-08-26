// THE OPTION OBJECT -- `$24C096`, one of the 22 subsystem calls of object type 5
// that this port has counted and not run since wave 5.
//
// It is the single largest unlock in the combat recon's work list (§11 item 5)
// and it is three things at once:
//
//   1. THE TWO OPTION PODS -- their records, their motion, and their two
//      sprite records in bucket 15 plus two shadows in bucket 5.
//   2. THE SPEED RAMP the player feels when fire is held ($24C8BE down,
//      $24C8E4 up, both PC-relative from inside this routine, which is why
//      nothing in the port could ever reach them).
//   3. THE LASER.  `$24C164 btst #4,($40,A6)` is the laser gate and it is on the
//      RAW HELD input byte the player copies in at `$24C134` -- NOT on the edge
//      the shot cadence machine reads.  **WAVE 45 PORTED IT**: everything behind
//      that gate is `src/laser.js`, and the throw that used to carry `$24C180`
//      is gone.  Until then any press of fire took the page down.
//
// THE RECORD IS $64 BYTES, NOT $20 (machine.js `OPT`).  Pod 0 is the first $20,
// pod 1 the second, and the control block -- including the copied input bytes at
// +$40/+$41 -- starts at +$40.  Three waves of notes call `$8104AA` "the option
// record"; it is the option BLOCK, and `$8104CA` is inside it.
//
// THE OUTER LOOP IS A dbra OVER PLAYERS, and its shape is worth reading twice:
//
//   24c096: lea $8104AA,A6 / lea $8103E6,A4 / lea $811F32,A2 / moveq #1,D7
//   24c0a8: tst.w (A6) / bmi $24C0C8        P1 exists -> run it
//   24c0ae: moveq #0,D7
//   24c0b0: lea $81050E,A6 / lea $810448,A4 / lea $811F52,A2
//   24c0c2: tst.w (A6) / bmi $24C0C8        P2 exists -> run it
//   24c0c6: rts
//   ...
//   24c37e: dbra D7,$24C0B0                 after P1, fall into P2's setup
//
// so D7 is the PLAYER INDEX inverted (1 = P1, 0 = P2), and the `dbra` after P1
// re-enters at the P2 setup rather than at the top.  A port that models this as
// "for each player" gets the same answer; a port that models it as "for D7 in
// 1..0" and forgets that P1's absence SKIPS STRAIGHT to P2 does not.
//
// MEASURED on `fly-around`, all 2,233 drawn frames: P1's block is live
// (`(A6)` = $8003 for pod 0) and P2's is all zeros, so the `dbra` runs the P2
// setup and the `tst.w (A6) / bmi` sends it straight to the `rts`.

import { P, RAM, ROM, OPT } from './machine.js';
import { i16, u16, asr } from './ram.js';
import { unreached } from './unported.js';
import {
  encodeRecordRequest, enqueueRequest, enqueueRegisters, encodeRegisterRequest,
  NAMED_BUCKETS,
} from './spritequeue.js';
import { groundPlane, SHIP_MUTATE } from './shipsprite.js';
import {
  BEAM, PRIVATE_BEAM_GEOMETRY, assertPrivateBeamCapabilities, runLaserGate,
  buildBeam, wipeSegmentPool, wipePrivateSegmentPool, rampDown,
} from './laser.js';

/** Explicit cartridge and pool capabilities for native pod-shot production. */
export const NATIVE_OPTION_SHOT_RESOURCES = Object.freeze([
  Object.freeze({
    ownerIndex: 0, pool: 0x810572, slots: 36, stride: 0x30,
    countPointer: 0x8127e8, gate308c: 0x81308c,
    formation2PrimaryTable: 0x24d2fc, formation2SecondaryTable: 0x24d35c,
    formation4Table: 0x24d3bc, formation6Table: 0x24d41c,
    hyperCounts: 0x24d47c, presentationSink: null,
  }),
  Object.freeze({
    ownerIndex: 1, pool: 0x810c32, slots: 36, stride: 0x30,
    countPointer: 0x8127f0, gate308c: 0x81308c,
    formation2PrimaryTable: 0x24d2fc, formation2SecondaryTable: 0x24d35c,
    formation4Table: 0x24d3bc, formation6Table: 0x24d41c,
    hyperCounts: 0x24d47c, presentationSink: null,
  }),
]);

/** The two players' blocks, in the ROM's own order: P1 first, P2 second. */
export const OPTION_BLOCKS = Object.freeze([
  Object.freeze({
    ownerIndex: 0, d7: 1, opt: RAM.p1Options, player: RAM.player1,
    laser: 0x811f32, beam: BEAM[0], rampGuard: 0x811f72,
    allowLaser: true, allowShots: true, virtualRequests: null,
    shotResources: NATIVE_OPTION_SHOT_RESOURCES[0],
  }),                                                        // $24C096
  Object.freeze({
    ownerIndex: 1, d7: 0, opt: RAM.p2Options, player: RAM.player2,
    laser: 0x811f52, beam: BEAM[1], rampGuard: 0x811f72,
    allowLaser: true, allowShots: true, virtualRequests: null,
    shotResources: NATIVE_OPTION_SHOT_RESOURCES[1],
  }),                                                        // $24C0B0
]);

/** `$24BBAA` -- the per-FORMATION template table, indexed `(($5a,A4)-2)*2` into
 *  LONGWORDS, so only EVEN formations land on an entry.  MEASURED entries:
 *  $24BF6E, $24BFC8, $24C022 (formations 2, 4, 6). */
export const OPT_TEMPLATES = 0x24bbaa;
/** `$24C384` -- the per-formation dispatch, `bra.w` at a 4-byte stride and the
 *  same `(($5a,A4)-2)*2` index.  Arms: $24C390, $24C4F8, $24C690.
 *  **W393 PORTED ALL THREE.**  The dispatch table is `bra.w`s, so an ODD
 *  formation would land on a displacement word and run garbage; `$24C34C` has no
 *  bound of its own, which is why `podsOnShip` still throws on anything but
 *  2/4/6. */
export const OPT_FORMATIONS = { 2: 0x24c390, 4: 0x24c4f8, 6: 0x24c690 };
/**
 * `$24D480` / `$24D5DA` / `$24D75C` -- THE THREE POD-SHOT SPAWNS, one per
 * formation, and the ONLY thing that distinguishes each formation's copy of the
 * fire handshake from the others.
 *
 * MEASURED with a byte compare over the whole $82 bytes of each tail:
 * `$24C476..$24C4F7` (formation 2), `$24C60E..$24C68F` (4) and
 * `$24C776..$24C7F7` (6) differ in **ONE BYTE**, the low half of the final
 * `bra.w`'s displacement -- `$24C4F5` = $8C, `$24C68D` = $4E, `$24C7F5` = $68.
 * Trap 19 exactly: twin routines that differ by one instruction's operand and
 * change which spawn a held fire button reaches.
 */
export const POD_SPAWNS = { 2: 0x24d480, 4: 0x24d5da, 6: 0x24d75c };
/**
 * `($15,A6)` -- FORMATION 4'S ROTATION ANGLE, and a field `machine.js OPT` has no
 * name for because nothing before W393 read it.  It is NOT `OPT.angle` ($1b):
 * `$24D136 and.b ($1b,A6),D1` is the pod's own facing, which formation 4's
 * rotating arm never touches.  Pod 1's copy is `($35,A6)` = `OPT.pod + $15`, and
 * `$24C5D4..$24C5DE` keeps it exactly $20 units -- half a turn -- from pod 0's.
 */
export const OPT_ROT_ANGLE = 0x15;
/**
 * `$24BEC6` -- THE ROTATION VECTOR TABLE, read by
 * `$24C82E lea ($24BEC6,PC),A3 / $24C832 movem.w (A3,D5.w),D0/D5`.
 *
 * TRAP 4: the `lea`'s target is the EXTENSION WORD's address plus the
 * displacement -- $24C830 + $F696 = $24C830 - $96A = $24BEC6, not $24C82E - $96A.
 *
 * WORD PAIRS at a FOUR-byte stride, `movem.w` so both halves SIGN-EXTEND.  Its
 * extent is stated by the fold above it and by nothing else: `$24C80C cmpi.b
 * #$20,D5 / $24C810 bls` sends every index over $20 through `neg.b`, so the
 * domain is 0..$20 inclusive -- $21 entries, $84 bytes, $24BEC6..$24BF49.  That
 * is a bound in the CODE (trap 8): no absence is being asserted.
 *
 * It needs no window of its own.  W12's `$24BBA0 + $4E0` already covers
 * $24BBA0..$24C080, and $24BF4A is $136 bytes inside it.
 */
export const OPT_ROTATE = 0x24bec6;
export const OPT_ROTATE_ENTRIES = 0x21;
/** `$24D3BC` / `$24D41C` -- the spawn pointer blocks formations 4 and 6 read,
 *  the third and fourth of a family of four at a $60 stride ($24D2FC, $24D35C,
 *  $24D3BC, $24D41C).  Each block is four longs -- ship selector 0/2 x
 *  normal/hyper -- then the four five-long per-power tables they point at. */
export const POD_SPAWN_PTRS = { 4: 0x24d3bc, 6: 0x24d41c };
/** `$24D47C` -- the hyper shot-count words, read `(A1,D5.w)` with D5 = the ship
 *  selector, by all three spawns ($24D4C8, $24D638, $24D7A0).  It is what pins
 *  the far end of `$24D41C`'s block: an instruction NAMES $24D47C as a different
 *  table's base, so $24D41C's cannot run past it. */
export const POD_HYPER_COUNTS = 0x24d47c;
/** `$24D77C`/`$24D786 move.w #$150,D0` -- formation 6's DEAD half-table offset.
 *  `$24D5FA`/`$24D604`'s `$450` is the live one. */
export const F6_DEAD_D0 = 0x150;
/** `$24C428`/`$24C460 move.w #$208,D3` -- the pod shadow's size word. */
export const POD_SHADOW_SIZE = 0x0208;
/** `$24C430`/`$24C468 move.b #$18,D4` -- a BYTE move over the word already in
 *  D4 from ($1c,A6)/($3c,A6), so the flip bits survive and only the colour is
 *  replaced.  MEASURED: pod 0 emits $0018, pod 1 $4018. */
export const POD_SHADOW_COLOUR = 0x18;

/**
 * `$24C096` -- the whole routine, as far as the laser gate.
 * @param ram
 * @param ctx  the Game context (`ctx.rom`, `ctx.prot`, `ctx.unportedLog`)
 */
export function runOptionObject(ram, ctx) {
  for (const b of OPTION_BLOCKS) {
    // $24C0AA / $24C0C2 `tst.w (A6) / bmi $24C0C8` -- bit 15 of the block's
    // first word.  Both players are tested with the SAME two instructions and
    // P1's failure falls straight into P2's setup.
    if ((ram.u16(b.opt + OPT.state) & 0x8000) === 0) continue;
    runOneBlock(ram, ctx, b);
  }
}

/** Refuse malformed private capabilities before option-side state can change. */
export function assertOptionOwnerInputAllowed(ram, b) {
  if (!Number.isSafeInteger(b?.ownerIndex) || !Number.isSafeInteger(b?.player)) {
    throw new TypeError('option owner must supply an exact logical owner and player record');
  }
  if (b.ownerIndex !== 0 && b.ownerIndex !== 1 && b.ownerIndex !== 2) {
    throw new RangeError(`unsupported logical option owner ${b.ownerIndex}`);
  }
  if (b.ownerIndex === 2) {
    if (b.player !== PRIVATE_BEAM_GEOMETRY.player
        || b.opt !== PRIVATE_BEAM_GEOMETRY.opt
        || b.rampGuard !== 0x10001600) {
      throw new RangeError('private option owner must supply exact player, option, and bomb guard');
    }
    const excludedInput = ram.u8(b.player + P.dirByte)
      | ram.u8(b.player + P.btnByte);
    if ((excludedInput & 0xa0) !== 0) {
      throw new RangeError('private option owner received excluded B2 or Start input');
    }
  }
}

function optionShotResources(b) {
  const resources = b?.shotResources;
  if (!resources || resources.ownerIndex !== b.ownerIndex
      || !Number.isSafeInteger(resources.pool)
      || !Number.isSafeInteger(resources.countPointer)
      || !Number.isSafeInteger(resources.gate308c)
      || !Number.isSafeInteger(resources.formation2PrimaryTable)
      || !Number.isSafeInteger(resources.formation2SecondaryTable)
      || !Number.isSafeInteger(resources.formation4Table)
      || !Number.isSafeInteger(resources.formation6Table)
      || !Number.isSafeInteger(resources.hyperCounts)) {
    throw new TypeError('pod-shot owner must supply exact pool, counters, pointers, and cartridge tables');
  }
  if (resources.slots !== 36 || resources.stride !== 0x30) {
    throw new RangeError('pod-shot pool must be 36 records of $30 bytes');
  }
  if (resources.presentationSink !== null
      && typeof resources.presentationSink !== 'function') {
    throw new TypeError('pod-shot presentation sink must be a function or null');
  }
  return resources;
}

/** Run one option block whose owner resources are supplied explicitly. */
function runOneBlock(ram, ctx, b) {
  const { opt, player } = b;
  assertOptionOwnerInputAllowed(ram, b);
  if (b.ownerIndex === 2) beamOf(b);

  // $24C0C8 bset #0,($1,A6) / bne $24C134 -- the ONE-TIME INIT.  MEASURED: the
  // bit is already set at every sample point of every scenario in the corpus
  // (pod 0's state word is $8003 from lf1968 on), so the template copy below
  // has never been exercised by a gated run.  It is translated anyway, and it
  // is translated AS WRITTEN including the four-byte hole.
  if (!ram.bset8(opt + OPT.flags1, 0)) {
    copyTemplate(ram, ctx, b);
  }

  // $24C134 / $24C13A -- THE TWO BYTES THE COMBAT RECON WENT LOOKING FOR.
  // The player's RAW HELD input byte and its EDGE byte, copied into the option
  // block.  ($40,A6) is what the laser gate tests, and a from-scratch byte scan
  // of $200000-$2A0000 finds ZERO `btst #4,($18,An)` in build B -- the raw held
  // fire bit reaches the game through THIS COPY and nowhere else.
  ram.setU8(opt + OPT.raw, ram.u8(player + P.dirByte));    // $24C134
  ram.setU8(opt + OPT.edge, ram.u8(player + P.btnByte));   // $24C13A

  const st = ram.u16(opt + OPT.state);                     // $24C140 move.w (A6),D0
  if (st & 0x0200) {                                       // $24C142 btst #9
    unreached(0x24caa4, `bit 9 of the option block's state word sends $24C146 to `
      + `$24CAA4. MEASURED 0 on every sampled frame of fly-around`);
  }
  // $24C14A btst #0,(A4) / bne $24CA60 -- THE PLAYER IS DYING.  W226's docket D9:
  // `playerHit249F8A` sets this bit and the very next option pass landed here, so
  // no death could survive a live option block.  The arm itself is five
  // instructions and holds nothing back:
  //
  //   24CA60: moveq #$31,d0 / moveq #$0,d1 / movea.l a6,a0
  //   24CA66: move.w d1,(a0)+ / dbra d0,$24CA66     FIFTY words from the block
  //   24CA6C: lea $20(a6),a6 / dbra d7,$24C0B0      ...and on to the next block
  //
  // Fifty words is $64, and `$81050E - $8104AA` is exactly $64, so the clear
  // covers this block and stops at the next player's -- the stride in the `lea`
  // is dead, because `$24C0B0` re-loads A6 with an absolute address anyway.
  if (ram.btst8(player + P.state, 0)) {
    for (let n = 0; n < 50; n++) ram.setU16(opt + n * 2, 0);
    return;
  }
  if ((st & 0x0002) === 0) {                                // $24C152 btst #1
    return podsDeploy24C934(ram, ctx, b);                   // $24C156
  }

  // $24C15A btst #5,(A4) / beq $24C164 ; $24C160 clr.w ($40,A6)
  // The one instruction that could stop the held bit reaching the gate -- and
  // PROBE_EXEC measured it 0 times over 600 held frames (10-recon-combat §2).
  if (ram.btst8(player + P.state, 5)) ram.setU16(opt + OPT.raw, 0);

  // $24C164 btst #4,($40,A6) / beq $24C29E -- THE LASER GATE.
  //
  // WAVE 45.  This was a loud named throw on `$24C180` from wave 12 until now,
  // and because the gate is the BOARD's -- the raw held bit, no speed term,
  // first held frame -- there was no input short enough to avoid it and the
  // game could not be shot at all (`39-OWNER-visible-play-before-sound.md`).
  // `src/laser.js` is the whole of what is behind it.
  if (b.allowLaser !== false && (ram.u8(opt + OPT.raw) & 0x10)) {
    const to = runLaserGate(ram, ctx, beamOf(b));           // $24C16E..$24C29C
    if (to === 'c310') return podsSwingBack(ram, ctx, b);   // $24C178 bne
    return podsOnShip(ram, ctx, b);                         // every other arm
  }
  return noLaser(ram, ctx, b);                              // $24C16A beq
}

export { runOneBlock as runOptionBlock };

/** Resolve the beam resource `$24C096` names for this exact owner. */
function beamOf(b) {
  if (!b.beam) throw new TypeError(`option owner ${b.ownerIndex} has no laser resource`);
  if (b.ownerIndex === 2) assertPrivateBeamCapabilities(b.beam);
  return b.beam;
}

function emitRegisters(ram, b, bucket, d1, d2, d3, d4) {
  if (b.virtualRequests == null) {
    return enqueueRegisters(ram, bucket, d1, d2, d3, d4);
  }
  if (!Array.isArray(b.virtualRequests)) {
    throw new TypeError('virtual option requests must be an array');
  }
  b.virtualRequests.push({ bucket, bytes: encodeRegisterRequest(d1, d2, d3, d4) });
  return b.virtualRequests.length - 1;
}

function emitRequest(ram, b, bucket, rec) {
  if (b.virtualRequests == null) return enqueueRequest(ram, bucket, rec);
  b.virtualRequests.push({ bucket, bytes: encodeRecordRequest(ram, rec) });
  return b.virtualRequests.length - 1;
}

function emitPodShotRequest(ram, b, rec) {
  const resources = optionShotResources(b);
  if (resources.presentationSink == null) return enqueueRequest(ram, 0, rec);
  return resources.presentationSink(ram, rec);
}

/** `$24C29E..$24C338` -- the ordinary pod path, and the RELEASE TEARDOWN. */
function noLaser(ram, ctx, b) {
  const { opt, player } = b;
  if (ram.i8(player + P.flags1) < 0) {                     // $24C29E tst.b ($1,A4)
    // $24C2A4 bsr $24C8BE / bra $24C33A -- the knockback state ramps the speed
    // DOWN without the laser gate.  This was a throw until W45 for want of
    // `$24C8BE`, which is now ported; `player.js` still throws on the same bit
    // at `$2496A2`, so the arm remains transcribed-and-unexercised.
    rampDown(ram, player, opt);                            // $24C2A4 bsr
    return podsOnShip(ram, ctx, b);                        // $24C2A8 bra
  }
  ram.setU16(player + 0x60, 0);                            // $24C2AC jsr $25370A
  rampUp(ram, b);                                          // $24C2B2 bsr $24C8E4
  ram.setU8(opt + 0x3f, 0x0a);                             // $24C2B6 move.b #$a
  if (!ram.btst8(opt + OPT.state, 6)) {                    // $24C2BC btst #6,(A6)
    return podsOnShip(ram, ctx, b);                        // $24C2C0 beq
  }

  // ---- $24C2C4: THE TEARDOWN.  Bit 6 is set by `$24C17C` on the frame the
  // laser's start delay expires, so this runs on the first frame after fire is
  // RELEASED and never otherwise.  It was a throw until W45 because nothing
  // could set the bit.
  for (const o of [0x2a, 0x2b, 0x34, 0x35, 0x3f]) {        // $24C2C4..$24C2D6
    ram.setU8(player + o, 0);
  }
  const beam = beamOf(b);
  if (b.ownerIndex === 2) wipePrivateSegmentPool(ram, beam);
  else wipeSegmentPool(ram, ctx, beam);                     // $24C2DE / $24C2E4
  ram.setU8(opt + 0x4a, 8);                                // $24C2E8 move.b #8
  ram.setU8(opt + OPT.reloadCount, 4);                     // $24C2EE move.b #4
  // `andi.w #$DFDB,(A6)` clears bit 5 of BOTH bytes and bit 2 of the low one:
  // the high byte's bit 5 is the BUILDERS' gate (`$24CB3A btst #5,(A6)`) and
  // the low byte's bit 2 is the LATCH (`$24C1A8`).  So a release un-arms the
  // beam and un-latches it in one instruction, and the next hold pays the full
  // seventeen frames again.
  ram.setU16(opt + OPT.state, ram.u16(opt + OPT.state) & 0xdfdb);  // $24C2F4
  if (!ram.bclr8(opt + OPT.state, 4)) {                    // $24C2F8 bclr #4
    return podsSwingBack(ram, ctx, b);                     // $24C2FC beq
  }
  ram.setU32(opt + OPT.anim, ram.u32(opt + 0x2a));         // $24C2FE move.l
  ram.setU16(opt + OPT.size, ram.u16(opt + 0x2e));         // $24C304 move.w
  ram.setU32(opt + OPT.offLong, ram.u32(opt + 0x26));      // $24C30A move.l
  return podsSwingBack(ram, ctx, b);                       // falls into $24C310
}

/** `$24C310..$24C338` -- the pods swing BACK out, two units per frame, until
 *  `($1b,A6)` reaches the template's rest angle `($36,A6)` = $10.  Reached from
 *  the teardown AND from every frame of the laser's nine-frame start delay. */
function podsSwingBack(ram, ctx, b) {
  const { opt } = b;
  const d0 = ram.u8(opt + 0x36);                           // $24C310 move.b
  if (d0 > ram.u8(opt + OPT.angle)) {                      // $24C314 cmp.b/bhi
    ram.setU8(opt + OPT.angle, (ram.u8(opt + OPT.angle) + 2) & 0xff);  // $24C32C
    ram.setU8(opt + 0x3b, (ram.u8(opt + 0x3b) - 2) & 0xff);            // $24C330
    ram.setU8(opt + 0x3b, ram.u8(opt + 0x3b) & 0x3f);                  // $24C334
    return podsOnShip(ram, ctx, b);                        // falls into $24C33A
  }
  ram.setU8(opt + OPT.angle, d0);                          // $24C31A move.b
  ram.setU8(opt + 0x3b, ram.u8(opt + 0x37));               // $24C31E move.b
  // $24C324 andi.b #$B3,(A6) -- clears bits 2, 3 and 6 of the state word's HIGH
  // byte, i.e. the "laser has started" bit `$24C17C` set.
  ram.setU8(opt + OPT.state, ram.u8(opt + OPT.state) & 0xb3);          // $24C324
  return podsOnShip(ram, ctx, b);                          // $24C328 bra
}

/** `$24C33A..$24C382` -- the tail EVERY arm of `$24C096` converges on. */
function podsOnShip(ram, ctx, b) {
  const { opt, player } = b;
  // $24C33A move.l ($2,A4),D0 / move.l D0,($2,A6) / move.l D0,($22,A6)
  // ONE longword: both pods are put ON the ship every frame, and the formation
  // routine then moves each of them off it by exactly one frame of its own
  // velocity.  That is why the measured pod offset is constant while the pods
  // are not "attached" by any constant in the ROM.
  const pos = ram.u32(player + P.posY);
  ram.setU32(opt + OPT.posY, pos);
  ram.setU32(opt + OPT.posY2, pos);

  if (b.allowLaser !== false
      && ram.u8(opt + OPT.angle) === 0) {                   // $24C346 tst.b/beq
    // ---- $24C368: **THE BEAM**, not "the pods-stowed path". -----------------
    // `src/options.js` carried that name from wave 12 until W37 §3.3 retired
    // it: this is the second half of the laser and it was unreachable in every
    // corpus run for exactly the reason the laser was -- nobody held the button
    // for seventeen frames.
    movePod(ram, ctx, b, opt);                             // $24C368 bsr $24D12E
    ram.setU16(opt + OPT.posY,                             // $24C36C/$24C370
      u16(ram.u16(opt + OPT.posY) + ram.u16(opt + 0x1e)));
    buildBeam(ram, ctx, beamOf(b));                        // $24C374 bsr $24CB3A
    return beamPodTail(ram, ctx, b);                       // $24CC68..$24CCCC
    // $24C378 bra $24C37E -- and $24C37A bsr $24CDC0 is JUMPED. See
    // `laser.js builder2` for why that is a throw and not a deletion.
  }
  // $24C34C..$24C35E -- the formation dispatch, (($5a,A4)-2)*2 into `bra.w`s.
  //
  // W393 PORTS ALL THREE ARMS. The three demos the attract loop plays hand
  // `$26070C` ships 2, 4 and 6, so every one of them lands here, and until this
  // wave the second demo took the page down 31 frames in.
  const form = ram.u16(player + P.optFormation);
  switch (form) {                                          // $24C35E jsr (A0)
    case 2: formation2(ram, ctx, b); break;                // $24C384 bra.w $24C390
    case 4: formation4(ram, ctx, b); break;                // $24C388 bra.w $24C4F8
    case 6: formation6(ram, ctx, b); break;                // $24C38C bra.w $24C690
    default:
      // The table is THREE `bra.w`s and `$24C34C` bounds its index nowhere, so an
      // odd or out-of-range formation would execute a displacement word. Throwing
      // by address is the honest outcome; it is not a claim that no such value
      // exists.
      unreached(OPT_FORMATIONS[form] ?? 0x24c384, `option formation ${form}: `
        + `$24C356 indexes the $24C384 jump table with (($5a,A4)-2)*2 and each `
        + `entry is a 4-byte bra.w, so only EVEN formations land on one -- 2 -> `
        + `$24C390, 4 -> $24C4F8, 6 -> $24C690. W393 ported all three; ${form} `
        + `is not one of them, so this index walks off the end of the table`);
  }
  // $24C360 lea ($20,A6),A6 -- translated for the record: A6 is reloaded by the
  // dbra's target ($24C0B0) or discarded at the rts, so it is dead. Saying so
  // is cheaper than a later reader wondering whether the port dropped it.
  return undefined;
}

/**
 * `$24CC68..$24CCCC` -- the tail BOTH beam builders converge on, and the twin
 * of `$24D12E`'s own `$24D170..$24D17E`.
 *
 * So on a lasering frame pod 0 reaches bucket 15 TWICE: once from `$24D12E`
 * (`$24D17E jmp $23F2CA`) and once from here (`$24CCC6 jmp $23F2CA`).  That is
 * what the listing does and it is transcribed rather than deduplicated -- the
 * two records differ only in that this one is emitted after `$24C36C` has moved
 * `($2,A6)`, and a port that emitted one would be a record short in a bucket
 * whose depth a byte-for-byte gate can see.
 *
 * The shadow's size word is `$210` here against the ordinary pod shadow's
 * `$208` (`$24C428`), and its flip/colour word is a plain `$18` rather than the
 * pod's `($1c,A6)`-with-the-colour-replaced.
 */
function beamPodTail(ram, ctx, b) {
  const { opt, player } = b;
  if (ram.i8(player + P.flags1) < 0) return undefined;     // $24CC68 tst.b/bmi
  const gated = ram.u16(0x812970) !== 0                    // $24CC6E
    || ram.u16(0x813098) !== 0                             // $24CC78
    || ram.u16(0x80390c) !== 0                             // $24CC80
    || ram.u16(0x813092) === 2;                            // $24CC88
  if (!gated && SHIP_MUTATE.value !== 'no-shadow') {
    const d1 = groundPlane(ram.u16(opt + OPT.posY),        // $24CC92..$24CCAE
      ram.u16(opt + OPT.posX), 0xfe00fe00);
    emitRegisters(ram, b, NAMED_BUCKETS.shadows, d1,
      ram.u32(opt + OPT.shadow0), 0x210, 0x18);             // $24CCB4..$24CCC0
  }
  emitRequest(ram, b, NAMED_BUCKETS.options, opt);          // $24CCC6 jmp $23F2CA
  return undefined;
}

/** `$24C8E4` -- the speed ramp UP, one index per frame toward ($39,A4). */
function rampUp(ram, b) {
  const { player, rampGuard } = b;
  // $24C8E4 tst.w $811F72 / beq $24C8F6 ; $24C8EE btst #6,($1,A4) / bne -> rts
  if (ram.u16(rampGuard) !== 0 && ram.btst8(player + P.flags1, 6)) return;
  const idx = ram.u8(player + P.speedIdx);                 // $24C8F6
  if (idx === ram.u8(player + P.baseSpeed)) return;        // $24C8FA cmp.b ($39,A4)
  ram.setU8(player + P.speedIdx, (idx + 1) & 0xff);        // $24C900 addq.b #1
}

/**
 * `$24C390` -- FORMATION 2, the only one the corpus runs.  Advances the pods'
 * shared animation, moves each pod, and draws their two shadows.
 */
/**
 * `$24C934..$24CA5E` -- THE PODS DEPLOYING, the arm `$24C152 btst #1,(A6)` takes
 * when the option block's state word says they are not out yet.
 *
 * W231 makes this real. It was a throw for the right reason -- every sampled
 * frame of the corpus had the bit set, because the seed's pods are already out --
 * and it became reachable the moment a player object could be CREATED: `$2492C8
 * move.w #$8000,(a2)` resets the block, bit 1 included, so a respawn starts with
 * its pods stowed and has to deploy them.
 *
 *   24c934: addq.b #$8,$1a(a6)              the deploy speed, eight per frame
 *   24c938: move.w ($58,A4),D1 / beq / moveq #$6,D1
 *   24c940: move.w ($5a,A4),D0 / subi.w #$2 / add.w D1,D0
 *   24c94a: lea ($24C928,PC),A0 / move.w (A0,D0.w),D0
 *   24c952: cmp.b ($1a,A6),D0 / bne / move.b #$3,($1,A6)      ARRIVED
 *
 * `$24C928` is SIX words and its end is pinned by code: `$24C934` is the `addq.b`
 * above, so the table cannot be longer. Six is (formation 2/4/6) x (two ship
 * selects), which is the index `($5a,A4)-2 + (($58,A4) ? 6 : 0)` produces.
 */
function podsDeploy24C934(ram, ctx, b) {
  const { opt, player } = b;
  ram.setU8(opt + OPT.speedIdx, (ram.u8(opt + OPT.speedIdx) + 8) & 0xff);  // $24C934
  const sel = ram.u16(player + P.shipSel) !== 0 ? 6 : 0;   // $24C938/$24C93E
  const idx = u16(u16(ram.u16(player + P.optFormation) - 2) + sel);  // $24C940..
  const target = ctx.rom.u16(0x24c928 + i16(idx));         // $24C94E (A0,D0.w)
  if ((target & 0xff) === ram.u8(opt + OPT.speedIdx)) {     // $24C952 cmp.b
    ram.setU8(opt + OPT.flags1, 3);                        // $24C958 move.b #$3
  }
  ram.setU8(opt + 0x3a, ram.u8(opt + OPT.speedIdx));       // $24C95E

  // $24C964: formation 4 skips the animation entirely.
  if (ram.u16(player + P.optFormation) !== 4) {            // $24C964 cmpi.w #$4
    stepPodAnim(ram, ctx, opt);                            // $24C96C..$24C9A6
  }

  // $24C9A8 -- while they are deploying BOTH pods sit on the ship's own position.
  const pos = ram.u32(player + P.posY);                    // $24C9A8 move.l ($2,A4)
  ram.setU32(opt + OPT.posY, pos);                         // $24C9AC
  ram.setU32(opt + OPT.posY2, pos);                        // $24C9B0

  // $24C9B4..$24C9DA -- the same four gates, in the same order, as formation 2's
  // shadows, and they do not return: every one of them branches to $24CA4E, where
  // the two pod moves are.
  if (ram.u16(0x812970) === 0 && ram.u16(0x80390c) === 0    // $24C9B4/$24C9BE
      && ram.u16(0x813098) === 0 && ram.u16(0x813092) !== 2) {  // $24C9C8/$24C9D2
    if (SHIP_MUTATE.value !== 'no-shadow') {
      podShadow(ram, b, opt, OPT.posY, OPT.flipColour, OPT.shadow0);   // $24C9DE
      podShadow(ram, b, opt, OPT.posY2, OPT.pod + OPT.flipColour, OPT.shadow1);  // $24CA16
    }
  }
  movePod(ram, ctx, b, opt);                               // $24CA4E bsr $24D12E
  movePod(ram, ctx, b, opt + OPT.pod);                     // $24CA52/$24CA56
}

/**
 * `$24C390..$24C3CA` and `$24C96C..$24C9A6` -- THE SAME TEN INSTRUCTIONS, once in
 * formation 2's per-frame body and once in the deploy. One animation delay that
 * reloads on its BORROW, one sprite long into both pods, one shadow long into
 * both, and a `subq.w #4` cursor that reloads from `($4c,A6)` on ITS borrow.
 */
function stepPodAnim(ram, ctx, opt) {
  const d = (ram.u8(opt + OPT.animDelay) - 1) & 0xff;      // $24C390/$24C96C
  ram.setU8(opt + OPT.animDelay, d);
  if (d !== 0xff) return;                                  // the `bcc` = no borrow
  ram.setU8(opt + OPT.animDelay, ram.u8(opt + OPT.animReload));   // $24C396
  const idx = ram.u16(opt + OPT.animIdx);                  // $24C39C ($44,A6)
  const sprite = ctx.rom.u32(ram.u32(opt + OPT.animTable) + idx);  // $24C3A0/$24C3A4
  ram.setU32(opt + OPT.anim, sprite);                      // $24C3A8 ($a,A6)
  ram.setU32(opt + OPT.pod + OPT.anim, sprite);            // $24C3AC ($2a,A6)
  const shadow = ctx.rom.u32(ram.u32(opt + OPT.shadowTable) + idx);  // $24C3B0/$24C3B4
  ram.setU32(opt + OPT.shadow0, shadow);                   // $24C3B8 ($5c,A6)
  ram.setU32(opt + OPT.shadow1, shadow);                   // $24C3BC ($60,A6)
  ram.setU16(opt + OPT.animIdx,
    idx < 4 ? ram.u16(opt + OPT.animIdxReload) : u16(idx - 4));    // $24C3C0/$24C3C6
}

function formation2(ram, ctx, b) {
  const { opt, player } = b;
  // $24C390..$24C3CA -- the animation delay and the two sprite/shadow longs. W231
  // found the deploy at $24C96C running the SAME ten instructions, so they live in
  // `stepPodAnim` now and both sites cite both addresses.
  stepPodAnim(ram, ctx, opt);

  movePod(ram, ctx, b, opt);                               // $24C3CC bsr $24D12E
  movePod(ram, ctx, b, opt + OPT.pod);                     // $24C3D0/$24C3D4

  // $24C3DC..$24C402 -- the SAME four gates as the ship's shadow, in the same
  // order, and the $80390C one is the phase that makes the pods' shadows and
  // their sprites alternate exactly as the ship's do.
  //
  // THEY DO NOT RETURN.  Every one of them is `bne/beq $24C476`, not `bne` to
  // an `rts`, and the two shadow enqueues fall off the end of $24C474 into the
  // same place:
  //
  //   24c3e2: bne $24c476   24c3ec: bne $24c476   24c3f6: bne $24c476
  //   24c402: beq $24c476   24c470: jsr $23efee.l  <-- and $24c476 is next
  //
  // All FIVE exits of formation 2 converge on $24C476.  Wave 12 wrote `return`
  // on four of them and dropped the tail; 12-review F2 caught it and this is
  // the fix.  It is the ELEVENTH fall-through incident in this project, and it
  // has the same shape as the other ten: the routine looked finished.
  if (ram.u16(0x812970) !== 0) return fireHandshake(ram, ctx, b);   // $24C3DC
  if (ram.u16(0x80390c) !== 0) return fireHandshake(ram, ctx, b);   // $24C3E6
  if (ram.u16(0x813098) !== 0) return fireHandshake(ram, ctx, b);   // $24C3F0
  if (ram.u16(0x813092) === 2) return fireHandshake(ram, ctx, b);   // $24C3FA
  // The `no-shadow` MUTATION skips the two enqueues and NOTHING ELSE: it exists
  // to prove the shadow columns are compared, and if it also skipped the
  // handshake below it would light up two instruments for one cause.
  if (SHIP_MUTATE.value !== 'no-shadow') {
    podShadow(ram, b, opt, OPT.posY, OPT.flipColour, OPT.shadow0);        // $24C406
    podShadow(ram, b, opt, OPT.posY2, OPT.pod + OPT.flipColour, OPT.shadow1); // $24C43E
  }
  return fireHandshake(ram, ctx, b);                       // fall through $24C474
}

/**
 * `$24C4F8` -- FORMATION 4, and it is **TWO routines behind one `btst`**.
 *
 *     24c4f8: btst #$2,(A6)          <- a BYTE test: bit 10 of the state WORD
 *     24c4fc: beq.w $24C5AC          <- CLEAR -> the rotating arm
 *
 * ARM A ($24C500..$24C5A9, bit 2 SET) is formation 2's body from its first
 * `bsr $24D12E` on. MEASURED, not eyeballed: a byte compare of $24C3CC..$24C475
 * against $24C500..$24C5A9 -- $AA bytes -- differs in FOUR bytes, +$02/+$03 and
 * +$0A/+$0B, and all four are halves of the two `bsr` displacements, which
 * resolve to the same $24D12E from both origins. So arm A is formation 2 MINUS
 * the ten-instruction animation step at $24C390, and nothing else.
 *
 * ARM B ($24C5AC..$24C60C, bit 2 CLEAR) is a genuinely different pod motion: the
 * two pods ORBIT the ship, half a turn apart, through `$24C7F8` -- which does not
 * call `$24D12E` at all.
 *
 * Both arms converge on $24C60E, formation 4's own copy of the fire handshake.
 */
function formation4(ram, ctx, b) {
  const { opt } = b;
  if (!ram.btst8(opt + OPT.state, 2)) {                    // $24C4F8/$24C4FC beq.w
    return formation4Rotate(ram, ctx, b);                  // $24C5AC
  }
  movePod(ram, ctx, b, opt);                               // $24C500 bsr $24D12E
  movePod(ram, ctx, b, opt + OPT.pod);                     // $24C504/$24C508
  // The same four gates in the same order as formation 2's, and -- as there --
  // they DO NOT RETURN: every one is `bne/beq $24C5AA`, which is `bra $24C60E`.
  const tail = () => fireHandshake(ram, ctx, b, POD_SPAWNS[4]);   // $24C5AA bra
  if (ram.u16(0x812970) !== 0) return tail();              // $24C510/$24C516
  if (ram.u16(0x80390c) !== 0) return tail();              // $24C51A/$24C520
  if (ram.u16(0x813098) !== 0) return tail();              // $24C524/$24C52A
  if (ram.u16(0x813092) === 2) return tail();              // $24C52E/$24C536
  if (SHIP_MUTATE.value !== 'no-shadow') {
    podShadow(ram, b, opt, OPT.posY, OPT.flipColour, OPT.shadow0);            // $24C53A
    podShadow(ram, b, opt, OPT.posY2, OPT.pod + OPT.flipColour, OPT.shadow1); // $24C572
  }
  return tail();                                           // falls into $24C5AA
}

/**
 * `$24C5AC..$24C60C` -- FORMATION 4'S ROTATING ARM.
 *
 *     24c5ac: moveq #$0,D3 / btst #$3,(A6) / beq / moveq #$3,D3
 *     24c5b6: move.b ($15,A6),D0
 *     24c5ba: addq.b #1,D0 / andi.b #$3F,D0
 *     24c5c0: cmpi.b #$10,D0 / beq $24C5D0        <- a DETENT
 *     24c5c6: cmpi.b #$30,D0 / beq $24C5D0        <- ...and the opposite one
 *     24c5cc: dbra D3,$24C5BA
 *
 * The angle steps ONE unit a frame, or up to FOUR when bit 3 of the state word's
 * high byte is set -- and the two `cmpi.b`s stop the fast walk dead on $10 or
 * $30 rather than letting it overshoot. `$24C5B6` is OUTSIDE the loop (the `dbra`
 * targets $24C5BA), so the angle is loaded once and stepped in place.
 *
 * TRAP 2: `dbra` runs N+1 times. D3 = 0 is ONE step, D3 = 3 is FOUR.
 *
 * `$24C5E2 movea.l ($46,A6),A2` is loaded ONCE and **is not reloaded for pod 1**
 * -- `$24C5FA` reloads only A3 -- so both pods index pod 0's animation table.
 * `($58,A6)` IS reloaded, with the same value, and that is transcribed too.
 */
function formation4Rotate(ram, ctx, b) {
  const { opt } = b;
  let d3 = 0;                                              // $24C5AC moveq #$0,D3
  if (ram.btst8(opt + OPT.state, 3)) d3 = 3;               // $24C5AE/$24C5B2/$24C5B4
  let d0 = ram.u8(opt + OPT_ROT_ANGLE);                    // $24C5B6 move.b ($15,A6),D0
  for (;;) {
    d0 = (d0 + 1) & 0x3f;                                  // $24C5BA addq.b/$24C5BC andi.b
    if (d0 === 0x10 || d0 === 0x30) break;                 // $24C5C0/$24C5C6
    if (d3-- === 0) break;                                 // $24C5CC dbra -- N+1 (trap 2)
  }
  ram.setU8(opt + OPT_ROT_ANGLE, d0);                      // $24C5D0 move.b D0,($15,A6)
  // $24C5D4/$24C5D6/$24C5DA/$24C5DE -- pod 1 is exactly HALF A TURN behind.
  ram.setU8(opt + OPT.pod + OPT_ROT_ANGLE, (d0 + 0x20) & 0x3f);
  const a2 = ram.u32(opt + OPT.animTable);                 // $24C5E2 movea.l ($46,A6),A2
  ram.setU32(opt + OPT.shadow0,                            // $24C5F2 move.l D6,($5c,A6)
    rotatePod24C7F8(ram, ctx, b, opt, ram.u8(opt + OPT_ROT_ANGLE), a2,
      ram.u32(opt + OPT.shadowTable)));                    // $24C5E6/$24C5EA/$24C5EE
  ram.setU32(opt + OPT.shadow1,                            // $24C606/$24C60A ($60,A6)
    rotatePod24C7F8(ram, ctx, b, opt + OPT.pod,
      ram.u8(opt + OPT.pod + OPT_ROT_ANGLE), a2,
      ram.u32(opt + OPT.shadowTable)));                    // $24C5F6/$24C5FA/$24C5FE/$24C602
  return fireHandshake(ram, ctx, b, POD_SPAWNS[4]);        // falls into $24C60E
}

/**
 * `$24C7F8..$24C8BC` -- ONE ORBITING POD, and the reason formation 4 is not just
 * formation 2 with a different sprite.
 *
 * `$24D12E` moves a pod by INTEGRATING a velocity into its position. This does
 * not: `$24C7F8 move.l ($2,A4),($2,A6)` puts the pod ON THE SHIP every frame and
 * then adds ONE absolute offset read out of `$24BEC6` by the rotation angle. The
 * pod's place is a function of the angle alone, which is what makes the orbit
 * exact instead of drifting.
 *
 * THE FOLD, and it does three things with one compare (`$24C80C cmpi.b #$20,D5 /
 * bls`): angles past half a turn are mirrored back into 0..$20, the pod's X-flip
 * bit `($1c,A6).6` is SET rather than cleared, and D2 is raised so the X half of
 * the vector is negated at `$24C84A`. One table half serves the whole circle.
 *
 * `$24C82E lea ($24BEC6,PC),A3` CLOBBERS A3 -- after `$24C82A` has read the
 * shadow long through it and before `$24C832` reads the vector pair. Reading the
 * two in the other order would read the wrong table.
 *
 * @returns the shadow long in D6, which `$24C5F2`/`$24C60A` store.
 */
function rotatePod24C7F8(ram, ctx, b, pod, d1, a2, a3) {
  const { player } = b;
  ram.setU32(pod + OPT.posY, ram.u32(player + P.posY));    // $24C7F8 move.l ($2,A4),($2,A6)
  let d5 = d1 & 0x3f;                                      // $24C7FE andi.w #$3F,D1/$24C802
  let d2 = 0;                                              // $24C804 moveq #$0,D2
  ram.bclr8(pod + OPT.flipColour, 6);                      // $24C806 bclr #$6,($1c,A6)
  if (d5 > 0x20) {                                         // $24C80C cmpi.b/$24C810 bls
    ram.bset8(pod + OPT.flipColour, 6);                    // $24C812 bset #$6
    d5 = -d5 & 0xff & 0x3f;                                // $24C818 neg.b/$24C81A andi.w
    d2 = 1;                                                // $24C81E moveq #$1,D2
  }
  const idx = d5 * 4;                                      // $24C820/$24C822 add.w D5,D5 x2
  ram.setU32(pod + OPT.anim, ctx.rom.u32(a2 + idx));       // $24C824 (A2,D5.w) -> ($a,A6)
  const d6 = ctx.rom.u32(a3 + idx);                        // $24C82A move.l (A3,D5.w),D6
  // $24C832 movem.w (A3,D5.w),D0/D5 -- TWO words, register order D0 then D5, and
  // `movem.w` to registers SIGN-EXTENDS both.
  const d0 = ctx.rom.i16(OPT_ROTATE + idx);
  let d5v = ctx.rom.i16(OPT_ROTATE + idx + 2);
  if (ram.btst8(player + P.flags1, 0)) {                   // $24C838 btst #$0,($1,A4)
    // $24C840..$24C844 -- the SAME 5/4 stretch $24D152 applies, and the same
    // `asr.w` that rounds toward -infinity.
    d5v = i16(d5v + i16(asr(d5v, 2)));
  }
  if (d2 !== 0) d5v = i16(-d5v);                           // $24C846 tst.w D2/$24C84A neg.w
  ram.setU16(pod + OPT.posY,                               // $24C84C add.w D0,($2,A6)
    u16(i16(ram.u16(pod + OPT.posY)) + d0));
  ram.setU16(pod + OPT.posX,                               // $24C850 add.w D5,($4,A6)
    u16(i16(ram.u16(pod + OPT.posX)) + d5v));
  if (ram.u16(0x812970) !== 0) return d6;                  // $24C854/$24C85A -> $24C8BC rts
  // $24C85C tst.w $812970 A SECOND TIME. It is DEAD: $24C854 has already sent
  // every non-zero value to the `rts`, four instructions earlier, and this one
  // branches somewhere else entirely. Transcribed, not tidied (trap 22).
  if (ram.u16(0x812970) === 0 && ram.u16(0x80390c) === 0    // $24C85C/$24C864
    && ram.u16(0x813098) === 0 && ram.u16(0x813092) !== 2) { // $24C86C/$24C874
    if (SHIP_MUTATE.value !== 'no-shadow') {
      // $24C87E..$24C8B2 -- the ordinary pod shadow, except that D2 is the long
      // `$24C82A` just read out of the table and NOT `($5c,A6)`: on a rotating
      // frame the record's shadow field is written AFTER this returns.
      podShadowD2(ram, b, pod, OPT.posY, OPT.flipColour, d6);
    }
  }
  emitRequest(ram, b, NAMED_BUCKETS.options, pod);          // $24C8B4 jmp $23F2CA
  // $24C8BA nop -- the two bytes between the `jmp` and the `rts`.
  return d6;
}

/**
 * `$24C690` -- FORMATION 6, and it is formation 2 with ONE operand changed.
 *
 * MEASURED: `$24C390..$24C475` against `$24C690..$24C775` -- $E6 bytes -- differ
 * in TWO bytes, +$3E and +$46, both halves of `bsr` displacements that resolve to
 * the same `$24D12E`. And `$24C476..$24C4F7` against `$24C776..$24C7F7` -- $82
 * bytes -- differ in ONE, `$24C7F5` = $68 against `$24C4F5` = $8C, so
 * `$24C7F2 bra.w $24D75C` where formation 2 has `$24C4F2 bra.w $24D480`.
 *
 * The behaviour that IS different is inside `$24D12E`, which both call:
 * `$24D158 cmpi.w #$6,($5a,A4)` halves the X stretch instead of quartering it,
 * and `movePod` has carried that arm since wave 12 with nothing able to reach it.
 *
 * WRITTEN OUT rather than folded into `formation2`, for the same reason
 * `beamPodTail` is not folded into `$24D170`: the cartridge carries two copies,
 * and the addresses on each line are the point of the file. The two are held
 * together by a byte compare in `w393options.test.js`, which would fail the
 * moment either drifted -- which a shared helper could not do.
 */
function formation6(ram, ctx, b) {
  const { opt } = b;
  stepPodAnim(ram, ctx, opt);                              // $24C690..$24C6CA
  movePod(ram, ctx, b, opt);                               // $24C6CC bsr $24D12E
  movePod(ram, ctx, b, opt + OPT.pod);                     // $24C6D0/$24C6D4
  const tail = () => fireHandshake(ram, ctx, b, POD_SPAWNS[6]);   // falls into $24C776
  if (ram.u16(0x812970) !== 0) return tail();              // $24C6DC/$24C6E2
  if (ram.u16(0x80390c) !== 0) return tail();              // $24C6E6/$24C6EC
  if (ram.u16(0x813098) !== 0) return tail();              // $24C6F0/$24C6F6
  if (ram.u16(0x813092) === 2) return tail();              // $24C6FA/$24C702
  if (SHIP_MUTATE.value !== 'no-shadow') {
    podShadow(ram, b, opt, OPT.posY, OPT.flipColour, OPT.shadow0);            // $24C706
    podShadow(ram, b, opt, OPT.posY2, OPT.pod + OPT.flipColour, OPT.shadow1); // $24C73E
  }
  return tail();                                           // fall through $24C774
}

/**
 * `$24C476..$24C4F6` -- THE FIRE HANDSHAKE AND THE PODS' SHOT CADENCE, the ~30
 * instructions every exit of formation 2 falls into.
 *
 * It is the POD twin of the ship's own cadence machine at `$249B48`
 * (`player.js bombAndShotGuards`), instruction for instruction the same shape
 * and NOT the same code -- read the two side by side before "simplifying"
 * either:
 *
 *   |                    | ship $249B48        | pods $24C476        |
 *   | gate               | btst #4,($19,A6)    | btst #4,($41,A6)    |
 *   |                    |   the player's EDGE |   the OPTION block's|
 *   |                    |   byte              |   COPY of it ($24C13A)
 *   | burst counter      | ($2b,A6)            | ($35,A4)            |
 *   | delay counter      | ($2a,A6)            | ($34,A4)            |
 *   | handshake bits     | ($1,A6).3 + (A6).3  | ($1,A6).3 + ($1,A6).4
 *   |                    |   TWO records       |   ONE byte, the     |
 *   |                    |                     |   OPTION block's    |
 *   | reload arithmetic  | ((D0>>1)&6)+($2d,A6)| (D0>>1)+($37,A4)    |
 *   | delay reload guard | bit0 OR ($58,A6)==0 | bit0 OR ($20,A4)==8 |
 *   |                    |   AND ($20,A6)==8   |   -- NO ($58,A4) test
 *   | the spawn          | $249BFC (ported)    | $24D480 (NOT ported)|
 *
 * A6 IS THE OPTION BLOCK HERE AND A4 IS THE PLAYER -- the opposite of
 * `$249B48`, where A6 is the player.  So `($1,A6)` bits 3/4 are the OPTION
 * block's flags byte `$8104AB` (`machine.js OPT.flags1`) and `($34,A4)`/
 * `($35,A4)` are in the PLAYER record `$8103E6`.
 *
 * WHY IT MATTERS AND WHEN IT RUNS.  `$24C4BC bclr #4,($1,A6)` executes on
 * EVERY frame the fire edge is absent, which on `fly-around` is every frame of
 * the run -- 12-review measured the block inert there (`$8103E6+$35` = 0,
 * `$8104AB` = `$03`, edge byte 0), and that is exactly why the gate stayed
 * green over a routine that had been dropped.
 */
export function fireHandshake(ram, ctx, b, spawn = POD_SPAWNS[2]) {
  if (b.allowShots === false) return undefined;
  // THE WRONG PORT, and it is wave 12's own: do what `$24C390` did before this
  // wave and return.  It has to be reproducible from outside the source file
  // or "the gate would have caught it" is a claim about a tree nobody has.
  if (FIRE_MUTATE.value === 'handshake-dropped') return;
  const { opt, player } = b;
  // Count the ported write sites under the SAME names `state.js EXEC_SPEC`
  // gives the board's taps, so `pgm.py firegate` can compare arm-for-arm and
  // not only value-for-value.  P1 only: the taps are on P1's addresses.
  const arm = (k) => { if (opt === RAM.p1Options) FIRE_ARMS[k]++; };
  const gate = FIRE_MUTATE.value === 'edge-on-raw' ? OPT.raw : OPT.edge;
  if (ram.btst8(opt + gate, 4)) {                          // $24C476 btst #4
    // ---- THE EDGE ARM, $24C47E..$24C4BA ---------------------------------
    // $24C47E move.b ($21,A4),D0 -- the LOW BYTE of the same word $24C4E4
    // compares against 8 below; player.js reads the identical pair at
    // $249B5C/$249BD4 and uses raw offsets, so these do too.
    let d0 = ram.u8(player + 0x21);                        // $24C47E
    if (ram.btst8(player + P.flags1, 0)) d0 = 8;           // $24C482 / $24C48A
    // $24C48E lsr.b #1,D0 -- a BYTE shift with NO mask.  The ship's twin is
    // `lsr.w #1` followed by `andi.b #6`; this one keeps bit 0 of the shifted
    // value.  Translated as written, and the difference is the point.
    d0 = FIRE_MUTATE.value === 'burst-mask-6'
      ? (((d0 & 0xffff) >>> 1) & 6)                        // the SHIP's $249B66
      : (d0 & 0xff) >>> 1;                                 // $24C48E
    if (FIRE_MUTATE.value !== 'burst-no-bias') {
      d0 = (d0 + ram.u8(player + 0x37)) & 0xff;            // $24C490 add.b
    }
    ram.setU8(player + 0x35, d0); arm('fh35w');            // $24C494 move.b D0

    let b3 = ram.bclr8(opt + OPT.flags1, 3); arm('fhb3c');   // $24C498 bclr #3
    if (FIRE_MUTATE.value === 'bclr3-inverted') b3 = !b3;
    if (b3) {                                              // $24C49E beq $24C4AC
      ram.bset8(opt + OPT.flags1, 4); arm('fhb4s');        // $24C4A0 bset #4
      ram.setU8(player + 0x35, 0); arm('fh35z');           // $24C4A6 clr.b
      return fireSpawn(ram, ctx, b, spawn);                       // $24C4AA bra $24C4D8
    }
    let b4 = ram.bclr8(opt + OPT.flags1, 4); arm('fhb4c');   // $24C4AC bclr #4
    if (FIRE_MUTATE.value === 'bclr4-inverted') b4 = !b4;
    if (b4) {                                              // $24C4B2 beq $24C4D8
      ram.setU8(player + 0x34, 1); arm('fh34i');           // $24C4B4 move.b #1
      return;                                              // $24C4BA bra $24C4F6
    }
    return fireSpawn(ram, ctx, b, spawn);                         // $24C4B2 beq $24C4D8
  }
  // ---- THE NO-EDGE ARM, $24C4BC..$24C4D6 --------------------------------
  // `bclr` is a READ-MODIFY-WRITE: the byte is written back even when the bit
  // was already clear, which is why the board's `fhb4x` tap fires on frames
  // where nothing appears to change.
  if (FIRE_MUTATE.value === 'noedge-rts') return;
  ram.bclr8(opt + OPT.flags1, 4); arm('fhb4x');            // $24C4BC bclr #4
  if (ram.u8(player + 0x35) === 0) return;                 // $24C4C2 tst.b/beq
  const d = (ram.u8(player + 0x34) - 1) & 0xff;            // $24C4C8 subq.b #1
  ram.setU8(player + 0x34, d); arm('fh34d');
  if (d !== 0) return;                                     // $24C4CC bne $24C4F6
  ram.setU8(player + 0x35, (ram.u8(player + 0x35) - 1) & 0xff);   // $24C4CE
  arm('fh35d');
  ram.bset8(opt + OPT.flags1, 4); arm('fhb4y');            // $24C4D2 bset #4
  return fireSpawn(ram, ctx, b, spawn);                           // falls into $24C4D8
}

/**
 * THE MUTATION HOOK for `$24C476`, deliberately IN THE SHIPPED FILE, for the
 * reason `SHIP_MUTATE` is: a mutation that needs a source edit is a claim about
 * a tree nobody else can reproduce.  `null` is the ROM and the only value
 * shipped.  Every name here is exercised by `pgm.py firegate --break`.
 *
 *   handshake-dropped  formation 2 returns instead of falling into $24C476 --
 *                      THE WAVE-12 DEFECT ITSELF, reproducible from outside.
 *   edge-on-raw        $24C476 tests ($40,A6) instead of ($41,A6)
 *   bclr3-inverted     $24C49E's branch the other way
 *   bclr4-inverted     $24C4B2's branch the other way
 *   burst-mask-6       $24C48E gets the SHIP's `lsr.w #1 / andi.b #6`
 *   burst-no-bias      $24C490's `add.b ($37,A4),D0` dropped
 *   delay-no-two       $24C4DC/$24C4E4's arm dropped: always ($36,A4)
 *   noedge-rts         the no-edge arm returns at once (drops $24C4BC..$24C4D6)
 */
export const FIRE_MUTATE = { value: null };

/** The ported write sites of `$24C476`, counted under `EXEC_SPEC`'s names.
 *  `pgm.py firegate` zeroes it before each replayed frame. */
export const FIRE_ARMS = {
  fh35w: 0, fh35z: 0, fh35d: 0, fh34i: 0, fh34d: 0, fh34w: 0,
  fhb3c: 0, fhb4s: 0, fhb4c: 0, fhb4x: 0, fhb4y: 0,
};
export function resetFireArms() {
  for (const k of Object.keys(FIRE_ARMS)) FIRE_ARMS[k] = 0;
}

/**
 * `$24C4D8..$24C4F2` -- the delay reload and THE POD SPAWN.
 *
 * Reached from three of the four arms above; the fourth (`$24C4B4`) is the only
 * path out of `$24C476` that reaches the `rts` at `$24C4F6`.
 *
 * `spawn` is the ONE byte that separates the three copies of this routine
 * (`POD_SPAWNS`): `$24C4F2 bra.w $24D480`, `$24C68A bra.w $24D5DA`,
 * `$24C7F2 bra.w $24D75C`. It is an argument and not a lookup on `($5a,A4)`
 * because the cartridge does not look anything up here -- the formation dispatch
 * already chose which of the three copies is running.
 */
function fireSpawn(ram, ctx, b, spawn) {
  const { opt, player } = b;
  void ctx;
  const arm = (k) => { if (opt === RAM.p1Options) FIRE_ARMS[k]++; };
  let d0 = ram.u8(player + 0x36);                          // $24C4D8 move.b
  // $24C4DC btst #0,($1,A4) / bne -> 2, else $24C4E4 cmpi.w #$8,($20,A4).
  // The ship's twin ALSO requires `tst.w ($58,A6)` == 0 ($249BCE); this one
  // does not.  Do not "harmonise" them.
  if (FIRE_MUTATE.value !== 'delay-no-two'
    && (ram.btst8(player + P.flags1, 0)                    // $24C4DC
      || ram.u16(player + 0x20) === 8)) {                  // $24C4E4
    d0 = 2;                                                // $24C4EC moveq #$2
  }
  ram.setU8(player + 0x34, d0 & 0xff); arm('fh34w');       // $24C4EE move.b
  if (spawn === POD_SPAWNS[4]) return podShotSpawn24D5DA(ram, ctx, b);   // $24C68A
  if (spawn === POD_SPAWNS[6]) return podShotSpawn24D75C(ram, ctx, b);   // $24C7F2
  return podShotSpawn(ram, ctx, b);                        // $24C4F2 bra $24D480
}

/**
 * `$24D480..$24D5D8` -- THE PODS' SHOT SPAWN.
 *
 * **THIS WAS NOT IN WAVE 45's BRIEF AND IT HAD TO BE, AND THAT IS A FINDING
 * ABOUT THE BRIEF.**  `37-recon-laser.md` prices the beam as L1+L2 "shipped
 * together" and says that unblocks the owner.  It does not: the laser gate
 * `$24C164` is checked BEFORE the formation dispatch, so once `$24C180` stops
 * throwing, the very next thing a held button reaches is `$24C476`'s edge arm
 * -- the pods' cadence machine -- which fires on the FIRST held frame and threw
 * here.  The beam does not take over until `($1b,A6)` reaches 0 at frame +16,
 * so sixteen of the seventeen arm-up frames run this routine.  Porting the beam
 * without it moves the crash from one address to another and the owner still
 * cannot shoot.
 *
 * Two near-identical halves, one per pod, into the SAME 36-slot shot table
 * `$810572` the ship's own spawn `$249BFC` writes -- pod 0 scanning from slot
 * 0 and pod 1 from slot 7 (`$24D4A0 move.w #$150,D0`, `$150 = 7 * $30`), which
 * is where `src/type5.js`'s "the option pods' shots go into slots 7..12" comes
 * from.  Both templates carry type word `$8002` = shot dispatch entry [2] =
 * `$253E34`, which `src/shots.js` has ported since wave 8, so the records this
 * writes are driven by code that already exists.
 *
 * `$24D4A4 tst.w ($58,A4) / beq $24D4AE / move.w #$150,D0` -- BOTH arms load
 * `$150`.  Translated as written, with the branch, because the fact that the
 * ship-select arm is a no-op is a property of the cartridge and not of the port.
 */
function podShotSpawn(ram, ctx, b) {
  const { opt, player } = b;
  const resources = optionShotResources(b);
  const table = resources.pool;                              // $24D484 / $24D494
  // $24D48A movea.l $8127E8,A1 / $24D4B2 move.w (A1),D4 -- a ROM pointer held
  // in RAM.  MEASURED $255278 in the shipped seed.
  const cursor = ram.u32(resources.countPointer);            // $24D48A / $24D49A
  const a3 = table + 0x150;                                // $24D4AE/$24D4B0
  let d4 = ctx.rom.u16(cursor);                            // $24D4B2 move.w
  const d5sel = ram.u16(player + P.shipSel);               // $24D4B4 move.w
  let d0 = u16(d5sel * 4);                                 // $24D4BA/$24D4BC
  if (ram.btst8(player + P.flags1, 0)) {                   // $24D4BE btst #0
    d0 = u16(d0 + 4);                                      // $24D4C6 addq.w #4
    d4 = ctx.rom.u16(resources.hyperCounts + i16(d5sel));      // $24D4C8/$24D4CC
  }
  // $24D4D0 tst.w $81308C / bne / cmpi.w #$4,D4 / bls / moveq #$4,D4
  if (ram.u16(resources.gate308c) === 0 && d4 > 4) d4 = 4;
  let d5 = d4;                                             // $24D4E0 move.w
  let a1 = ctx.rom.u32(ctx.rom.u32(resources.formation2PrimaryTable + i16(d0))
    + i16(u16(ram.u16(player + 0x20) * 2)));
  let a2 = ctx.rom.u32(ctx.rom.u32(resources.formation2SecondaryTable + i16(d0))
    + i16(u16(ram.u16(player + 0x20) * 2)));

  const phase = (off) => {                                 // $24D500 / $24D510
    const v = ram.u16(opt + off) - 4;                      // subq.w #4
    ram.setU16(opt + off, v < 0 ? 8 : u16(v));             // bcc / move.w #$8
    return ram.u16(opt + off);
  };
  const d6 = phase(0x52);                                  // $24D500..$24D50C
  const d7ph = phase(0x54);                                // $24D510..$24D51C

  writePodShot(ram, ctx, b, table, d4, a1, opt, d6, d7ph);    // $24D520..$24D574
  writePodShot(ram, ctx, b, a3, d5, a2, opt + OPT.pod, d6, d7ph);  // $24D576..
}

/**
 * `$24D520` / `$24D57C` / `$24D666` / `$24D674` / `$24D7EE` -- THE FREE-SLOT SCAN,
 * six sites across the three spawns and the same four instructions at every one.
 *
 *   tst.w (A0) / bpl <found> / lea ($30,A0),A0 / dbra Dn,<top>
 *
 * `bpl` means bit 15 CLEAR, i.e. the slot is free, so the loop walks OCCUPIED
 * slots. TRAP 2: the `dbra` runs N+1 times, so `count` = 0 examines ONE slot.
 *
 * @returns {{addr:number|null, left:number}} the slot, and the counter the ROM
 *   leaves in Dn -- `$24D800`'s second scan continues on the SAME register.
 */
function freeSlot24D520(ram, base, count) {
  let a0 = base;
  for (let n = count; ; n--) {
    if ((ram.u16(a0) & 0x8000) === 0) return { addr: a0, left: n };
    a0 += 0x30;
    if (n === 0) return { addr: null, left: -1 };
  }
}

/**
 * `$24D530..$24D572` -- 44 bytes into a shot slot and a bucket-0 enqueue.
 *
 * BYTE-IDENTICAL to `$24D812..$24D854`, formation 6's spawn: a compare over the
 * whole $42 bytes finds no difference at all. So `$24D75C` gets this function
 * too, and the two spawns differ only in how they FIND the slots and in whether
 * the template cursor rewinds between pods.
 *
 * @returns the advanced template cursor. `$24D480` throws it away (each pod has
 *   its own `a1`/`a2`); `$24D75C` needs it, because its A1 walks straight from
 *   pod 0's 38 template bytes into pod 1's.
 */
function writeShot24D530(ram, ctx, b, a0, src, pod, d6, d7ph) {
  const { player } = b;
  let s = src, a = a0;
  ram.setU16(a, ctx.rom.u16(s)); s += 2; a += 2;           // $24D530 the TYPE
  ram.setU16(a, u16(ram.u16(pod + OPT.posY)                // $24D532/$24D536
    + ctx.rom.u16(s))); s += 2; a += 2;
  ram.setU16(a, u16(ram.u16(pod + OPT.posX)                // $24D53A/$24D53E
    + ctx.rom.u16(s))); s += 2; a += 2;
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;           // $24D542
  const a5 = ctx.rom.u32(s); s += 4;                       // $24D544 movea.l
  ram.setU32(a, ctx.rom.u32(a5 + i16(d6))); a += 4;        // $24D548 the ANIM
  for (let k = 0; k < 4; k++) {                            // $24D54C..$24D552
    ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;
  }
  ram.setU8(a - 1, ram.u8(player + 0x56));                 // $24D554 move.b
  ram.setU32(a, ctx.rom.u32(s)); s += 4; a += 4;           // $24D55A
  ram.setU16(a, ctx.rom.u16(s)); s += 2; a += 2;           // $24D55C
  ram.setU16(a, d7ph); a += 2;                             // $24D55E move.w D7
  ram.setU16(a, ctx.rom.u16(s)); s += 2; a += 2;           // $24D560
  ram.setU16(a, ram.u16(player + P.optFormation)); a += 2; // $24D562 ($5a,A4)
  ram.setU16(a, ram.u16(player + 0x20)); a += 2;           // $24D566 ($20,A4)
  // $24D56A lea (-$2c,A0),A6 / $24D56E jsr $23D88E -- 44 bytes written, and
  // $23D88E is the QUEUE's own record enqueue (bucket 0, $80397C/$80AFC0), the
  // same fourteen instructions `enqueueRequest` already ports.
  emitPodShotRequest(ram, b, a0);                           // $24D56E jsr $23D88E
  return s;                                                // 38 template bytes read
}

/** One half of `$24D480`: scan for a free slot, then 44 bytes and a bucket-0
 *  enqueue.  `$24D578 lea ($20,A6),A6` is why the second half's A6 is pod 1. */
function writePodShot(ram, ctx, b, table, count, src, pod, d6, d7ph) {
  const { addr } = freeSlot24D520(ram, table, count);      // $24D520 / $24D57C
  if (addr === null) return;                               // the `dbra` ran out
  writeShot24D530(ram, ctx, b, addr, src, pod, d6, d7ph);
}

/**
 * `$24D5DA..$24D6D0` -- **FORMATION 4'S SHOT SPAWN**, reached only from
 * `$24C68A bra.w $24D5DA`.
 *
 * It is `$24D480`'s twin in outline and NOT in three details that matter:
 *
 *   1. THE HALVES CAN SWAP. `$24D60C..$24D61E` reads the rotation angle, adds
 *      $10, and `exg A0,A3` when the result is under $20 -- so whichever pod is
 *      currently on the +X side of the ship always writes into the same half of
 *      the shot table, however far round the orbit has gone.
 *   2. THE SPLIT IS AT SLOT 23, not 7. `$24D5FA move.w #$450,D0` and
 *      `$450 = $30 * 23`, against `$24D4A0`'s `$150` = `$30 * 7`. Neither is a
 *      round half of the 36-slot table; both are transcribed, not rationalised.
 *   3. `$24D622 addq.w #2,D4` and `$24D640` -- TWO extra slots of scan depth than
 *      the cursor word asks for, on both the ordinary and the hyper arm.
 *
 * AND BOTH SCANS ABORT THE WHOLE ROUTINE. `$24D672` and `$24D680` both
 * `bra $24D6CC`, the `movem.l (A7)+` -- so if pod 0 finds no slot, pod 1 does not
 * fire either. `$24D480` gives up one pod at a time. Do not harmonise them.
 *
 * `$24D5DA movem.l D6-D7/A3/A5-A6,-(A7)` ... `$24D6CC movem.l (A7)+` is a
 * push/pop pair (trap 9): register-transparent, returning nothing, which is why
 * `$24D6C6 lea ($20,A6),A6` is undone before the `rts`.
 */
function podShotSpawn24D5DA(ram, ctx, b) {
  const { opt, player } = b;
  const resources = optionShotResources(b);
  const table = resources.pool;                              // $24D5DE / $24D5EE
  const cursor = ram.u32(resources.countPointer);            // $24D5E4 / $24D5F4
  // $24D5FA move.w #$450,D0 / tst.w ($58,A4) / beq / move.w #$450,D0 -- BOTH arms
  // load $450 ($30 * 23), exactly as $24D4A4's two arms both load $150 ($30 * 7).
  // Transcribed WITH the branch: a ship-select arm that is a no-op is a property
  // of the cartridge and not of the port.
  let a0 = table, a3 = table + 0x450;                      // $24D608/$24D60A
  // $24D60C..$24D61C `cmpi.b #$20,D0 / bcc $24D620` -- carry SET means D0 < $20,
  // which falls through to the `exg` at $24D61E.
  if (((ram.u8(opt + OPT_ROT_ANGLE) + 0x10) & 0x3f) < 0x20) {
    const t = a0; a0 = a3; a3 = t;                         // $24D61E exg A0,A3
  }
  let d4 = u16(ctx.rom.u16(cursor) + 2);                   // $24D620/$24D622 addq.w #2
  const d5sel = ram.u16(player + P.shipSel);               // $24D624 move.w ($58,A4)
  let d0 = u16(d5sel * 4);                                 // $24D628..$24D62C
  if (ram.btst8(player + P.flags1, 0)) {                   // $24D62E btst #$0,($1,A4)
    d0 = u16(d0 + 4);                                      // $24D636 addq.w #4
    // $24D638 lea ($24D47C,PC),A1 / move.w (A1,D5.w),D4 -- indexed by the ship
    // SELECTOR itself, not by selector*4, which is why $24D47C is only four bytes
    // wide and why the selector must be EVEN (0 or 2).
    d4 = u16(ctx.rom.u16(resources.hyperCounts + i16(d5sel)) + 2);   // $24D63C/$24D640
  }
  if (ram.u16(resources.gate308c) === 0 && d4 > 4) d4 = 4;           // $24D642..$24D650
  const d5 = d4;                                           // $24D652 move.w D4,D5
  const a1 = ctx.rom.u32(ctx.rom.u32(resources.formation4Table + i16(d0))
    + i16(u16(ram.u16(player + 0x20) * 2)));               // $24D65C..$24D662
  const first = freeSlot24D520(ram, a0, d4);               // $24D666..$24D672
  if (first.addr === null) return;                         // $24D672 bra $24D6CC
  const second = freeSlot24D520(ram, a3, d5);              // $24D674..$24D680
  if (second.addr === null) return;                        // $24D680 bra $24D6CC
  // $24D682..$24D6A0 and $24D6A6..$24D6C4 -- the two phase counters are stepped
  // TWICE, once before each pod. $24D480 steps them ONCE and shares the pair.
  const phase = (off) => {
    const v = ram.u16(opt + off) - 4;                      // subq.w #4
    ram.setU16(opt + off, v < 0 ? 8 : u16(v));             // bcc / move.w #$8
    return ram.u16(opt + off);
  };
  const d6a = phase(0x52), d7a = phase(0x54);              // $24D682/$24D692
  writeRotShot24D6D2(ram, ctx, b, first.addr, a1, opt, d6a, d7a);   // $24D6A2 bsr
  const d6b = phase(0x52), d7b = phase(0x54);              // $24D6A6/$24D6B6
  // $24D6A4 movea.l A3,A0 / $24D6C6 lea ($20,A6),A6 -- pod 1, and the SAME
  // template: `$24D6D2 movem.l A1/A6,-(A7)` rewinds A1 for the second call.
  writeRotShot24D6D2(ram, ctx, b, second.addr, a1, opt + OPT.pod, d6b, d7b);
}

/**
 * `$24D6D2..$24D75A` -- formation 4's shot WRITER, 34 template bytes into 44
 * record bytes, and the one place in the option subsystem where the record is
 * patched AFTER it has been queued.
 *
 * WHAT MAKES IT DIFFERENT FROM `$24D530`:
 *
 *   * the Y and X offsets are not in the template stream. `$24D6D8` takes a
 *     POINTER out of it and `$24D6FA movea.l (A2,D0.w),A2` indexes that by the
 *     folded rotation angle -- so the muzzle turns with the pods.
 *   * `$24D70E move.w ($4,A6),(A0)+` writes the pod's RAW X, and
 *     `$24D752 add.w D1,($4,A6)` adds the offset to the record's X field AFTER
 *     `$24D74C jsr $23D88E`. A6 is the record by then (`$24D748 lea (-$2c,A0)`),
 *     not the pod. A port that added it before the enqueue would put the same
 *     value in the same place; a port that read A6 as the POD would corrupt the
 *     option block.
 *   * `$24D73E neg.b (-$11,A0)` and `$24D742 ori.b #$40,(-$10,A0)` mirror the
 *     shot's own angle and flip byte when the fold fired. Those are record
 *     offsets +$1B and +$1C, reached from A0 AFTER the 44 bytes.
 *
 * THE FOLD IS ON `$3E`, NOT `$3F`. `$24D6E2 andi.w #$3E,D0` drops the low bit
 * before the compare, so the table `$24D6FA` indexes is HALF the resolution of
 * `$24BEC6`'s: 17 longs at a four-byte stride, from `(angle & $3E)` doubled.
 */
function writeRotShot24D6D2(ram, ctx, b, a0, tmpl, pod, d6, d7ph) {
  const { player } = b;
  const { rom } = ctx;
  let s = tmpl, a = a0;
  ram.setU16(a, rom.u16(s)); s += 2; a += 2;               // $24D6D6 the TYPE
  let a2 = rom.u32(s); s += 4;                             // $24D6D8 movea.l (A1)+,A2
  let d3 = 0;                                              // $24D6DA moveq #$0,D3
  let d0 = ram.u8(pod + OPT_ROT_ANGLE) & 0x3e;             // $24D6DC..$24D6E2
  if (d0 !== 0 && d0 > 0x20) {                             // $24D6E6 beq / $24D6EC bls
    d0 = -d0 & 0xff & 0x3e;                                // $24D6EE/$24D6F0
    d3 = -1;                                               // $24D6F4 move.w #$FFFF,D3
  }
  a2 = rom.u32(a2 + u16(d0 * 2));                          // $24D6F8/$24D6FA
  ram.setU16(a, u16(ram.u16(pod + OPT.posY) + rom.u16(a2)));   // $24D6FE..$24D704
  a2 += 2; a += 2;
  let d1 = rom.u16(a2); a2 += 2;                           // $24D706 move.w (A2)+,D1
  if (d3 < 0) d1 = u16(-d1);                               // $24D708/$24D70A/$24D70C
  ram.setU16(a, ram.u16(pod + OPT.posX)); a += 2;          // $24D70E ($4,A6) RAW
  ram.setU32(a, rom.u32(s)); s += 4; a += 4;               // $24D712
  const a5 = rom.u32(s); s += 4;                           // $24D714 movea.l (A1)+,A5
  ram.setU32(a, rom.u32(a5 + i16(d6))); a += 4;            // $24D718 the ANIM
  for (let k = 0; k < 4; k++) {                            // $24D71C..$24D722
    ram.setU32(a, rom.u32(s)); s += 4; a += 4;
  }
  ram.setU8(a - 1, ram.u8(player + 0x56));                 // $24D724 move.b ($56,A4)
  ram.setU32(a, rom.u32(a2)); a += 4;                      // $24D72A move.l (A2)+,(A0)+
  ram.setU16(a, rom.u16(s)); s += 2; a += 2;               // $24D72C
  ram.setU16(a, d7ph); a += 2;                             // $24D72E move.w D7,(A0)+
  ram.setU16(a, rom.u16(s)); s += 2; a += 2;               // $24D730
  ram.setU16(a, ram.u16(player + P.optFormation)); a += 2; // $24D732 ($5a,A4)
  ram.setU16(a, ram.u16(player + 0x20)); a += 2;           // $24D736 ($20,A4)
  if (d3 < 0) {                                            // $24D73A tst.b D3 / bpl
    ram.setU8(a0 + 0x1b, -ram.i8(a0 + 0x1b) & 0xff);       // $24D73E neg.b (-$11,A0)
    ram.setU8(a0 + 0x1c, ram.u8(a0 + 0x1c) | 0x40);        // $24D742 ori.b #$40,(-$10,A0)
  }
  emitPodShotRequest(ram, b, a0);                           // $24D748/$24D74C jsr $23D88E
  ram.setU16(a0 + 0x04, u16(ram.u16(a0 + 0x04) + d1));     // $24D752 add.w D1,($4,A6)
}

/**
 * `$24D75C..$24D8AA` -- **FORMATION 6'S SHOT SPAWN**, reached only from
 * `$24C7F2 bra.w $24D75C`.
 *
 * ONE SCAN, TWO SLOTS. `$24D7EE` finds the first free slot and keeps it in A3;
 * `$24D800` walks on from there -- on the SAME `dbra` counter, which is why
 * `$24D7B8 add.w D4,D4 / $24D7BA addq.w #1,D4` doubles it first. Then pod 0
 * writes into the SECOND slot found and pod 1 into the FIRST (`$24D85C movea.l
 * A3,A0`). Written that way round in the cartridge; transcribed that way here.
 *
 * ONE TEMPLATE STREAM. `$24D826`'s A1 is never rewound between the two writers,
 * so pod 1 reads the 38 bytes after pod 0's -- and that is why formation 6's
 * templates sit at a $4C stride ($24FB12, $24FB5E, ...) while formation 4's, read
 * through a rewinding A1, sit at $22.
 *
 * AND `$24D77C move.w #$150,D0` IS A DEAD STORE, on both arms of its own branch:
 * `$24D78C move.w ($58,A4),D0` overwrites D0 sixteen bytes later without D0 having
 * been read. `$24D5DA`'s `$450` is the same instruction doing real work. Trap 22 --
 * transcribed, not tidied.
 */
function podShotSpawn24D75C(ram, ctx, b) {
  const { opt, player } = b;
  const resources = optionShotResources(b);
  const table = resources.pool;                              // $24D760 / $24D770
  const cursor = ram.u32(resources.countPointer);            // $24D766 / $24D776
  // $24D77C move.w #$150,D0 / tst.w ($58,A4) / beq / move.w #$150,D0 -- both arms,
  // and D0 is DEAD in both: $24D78C overwrites it unread. Written out so a reader
  // can see the whole branch is here and was not dropped.
  void (ram.u16(player + P.shipSel) !== 0 ? F6_DEAD_D0 : F6_DEAD_D0);
  let d4 = ctx.rom.u16(cursor);                            // $24D78A move.w (A1),D4
  const d5sel = ram.u16(player + P.shipSel);               // $24D78C move.w ($58,A4)
  let d0 = u16(d5sel * 4);                                 // $24D790..$24D794
  if (ram.btst8(player + P.flags1, 0)) {                   // $24D796 btst #$0,($1,A4)
    d0 = u16(d0 + 4);                                      // $24D79E addq.w #4
    d4 = ctx.rom.u16(resources.hyperCounts + i16(d5sel));     // $24D7A0/$24D7A4
  }
  if (ram.u16(resources.gate308c) === 0 && d4 > 4) d4 = 4;  // $24D7A8..$24D7B6
  d4 = u16(u16(d4 * 2) + 1);                               // $24D7B8/$24D7BA
  let a1 = ctx.rom.u32(ctx.rom.u32(resources.formation6Table + i16(d0))
    + i16(u16(ram.u16(player + 0x20) * 2)));               // $24D7C4..$24D7CA
  // $24D7CE..$24D7EC -- the phases are stepped ONCE here and SHARED by both pods,
  // the way $24D480 does it and the way $24D5DA does NOT.
  const phase = (off) => {
    const v = ram.u16(opt + off) - 4;                      // subq.w #4
    ram.setU16(opt + off, v < 0 ? 8 : u16(v));             // bcc / move.w #$8
    return ram.u16(opt + off);
  };
  const d6 = phase(0x52), d7ph = phase(0x54);              // $24D7CE/$24D7DE
  const first = freeSlot24D520(ram, table, d4);            // $24D7EE..$24D7F6
  if (first.addr === null) return;                         // $24D7FA bra $24D8A6
  // $24D800..$24D808 -- ADVANCE THEN TEST, on the counter the first scan left.
  let a0 = first.addr, n = first.left;
  for (;;) {
    a0 += 0x30;                                            // $24D800 lea ($30,A0),A0
    if ((ram.u16(a0) & 0x8000) === 0) break;               // $24D804 tst.w/bpl
    if (n-- === 0) return;                                 // $24D808 dbra/$24D80C bra
  }
  // Pod 0 -> the SECOND slot, pod 1 -> the first, and A1 walks across both.
  a1 = writeShot24D530(ram, ctx, b, a0, a1, opt, d6, d7ph);         // $24D810..$24D854
  writeShot24D530(ram, ctx, b, first.addr, a1, opt + OPT.pod, d6, d7ph);  // $24D85E..
}

/** `$24C406..$24C43C` and its verbatim twin `$24C43E..$24C474`. */
function podShadow(ram, b, opt, posOff, flipOff, shadowOff) {
  return podShadowD2(ram, b, opt, posOff, flipOff, ram.u32(opt + shadowOff));  // $24C434
}

/** The same six instructions with D2 already in hand -- `$24C8AC move.l D6,D2`,
 *  the rotating pod's, where `$24C434` reads it back out of `($5c,A6)`. The two
 *  sites are `$24C406..$24C438` and `$24C87E..$24C8B2`; MEASURED byte-identical
 *  apart from that one load. */
function podShadowD2(ram, b, opt, posOff, flipOff, d2) {
  // $24C422 addi.l #$FE00FF00,D1 -- note the SECOND word differs from the
  // ship's $FE00FE00: the pods' shadows sit one pixel further along the short
  // axis. Translated as written.
  const d1 = groundPlane(ram.u16(opt + posOff), ram.u16(opt + posOff + 2),
    0xfe00ff00);
  const d3 = POD_SHADOW_SIZE;                              // $24C428 move.w #$208
  // $24C42C move.w ($1c,A6),D4 / $24C430 move.b #$18,D4 -- a WORD load then a
  // BYTE store into the same register, so D4 keeps the flip bits and takes the
  // shadow's colour. MEASURED $0018 and $4018.
  const d4 = (ram.u16(opt + flipOff) & 0xff00) | POD_SHADOW_COLOUR;
  emitRegisters(ram, b, NAMED_BUCKETS.shadows, d1, d2, d3, d4);  // jsr $23EFEE
}

/**
 * `$24D12E` -- one pod's move and its bucket-15 enqueue.
 *
 *   24d132: move.b ($1a,A6),D0 / and.b ($1b,A6),D1   speed, angle & $3F
 *   24d13a: jsr $241812                              THE SHIP'S OWN VECTOR ROUTINE
 *   24d140: move.w D2,D0 / asr.w #3,D0 / sub.w D0,D2     D2 = 7/8 dY
 *   24d146: add.w D2,($2,A6)
 *   24d14a: btst #0,($1,A4) / beq $24D158
 *   24d152:   move.w D3,D0 / asr.w #2,D0 / add.w D0,D3   D3 = 5/4 dX
 *   24d158: cmpi.w #$6,($5a,A4) / beq $24D166
 *   24d160:   move.w D3,D0 / asr.w #2,D0                 D0 = dX/4
 *   24d166:   move.w D3,D0 / asr.w #1,D0                 ...or dX/2 at formation 6
 *   24d16a: add.w D0,D3 / add.w D3,($4,A6)
 *   24d170: tst.w $812970 / bne -> rts
 *   24d178: tst.b ($1,A4) / bmi $24D188
 *   24d17e: jmp $23F2CA                              THE BUCKET-15 ENQUEUE
 *
 * ASR ON A NEGATIVE VALUE ROUNDS TOWARD -INFINITY and that is visible in the
 * measurement, not a theoretical worry: pod 0 (angle $10) lands at posX + $822
 * and pod 1 (angle $30) at posX - $823, one unit further out, because
 * `asr.w #2` of -1666 is -417 and of +1666 is +416.
 */
function movePod(ram, ctx, b, pod) {
  const { player } = b;
  const speed = ram.u8(pod + OPT.speedIdx);                // $24D132
  const angle = ram.u8(pod + OPT.angle) & 0x3f;            // $24D136 and.b $3F
  const v = ctx.tables.vector(speed, angle);               // $24D13A jsr $241812
  // THE WRONG PORT: `asr.w` rounds toward -infinity, and the difference is
  // exactly one unit on the pod that moves in -X.  MEASURED on the board: pod 0
  // sits at posX + $822 and pod 1 at posX - $823, and the asymmetry IS the
  // rounding.  A port that used `Math.trunc(dx/4)` gets pod 1 one unit wrong on
  // every frame of every run.
  const sh = (x, n) => (SHIP_MUTATE.value === 'pod-asr-toward-zero'
    ? Math.trunc(x / (1 << n)) : asr(x, n));

  let dy = i16(v.dy);
  dy = i16(dy - i16(sh(dy, 3)));                           // $24D142/$24D144
  let dx = i16(v.dx);
  if (ram.btst8(player + P.flags1, 0)) {                   // $24D14A btst #0,($1,A4)
    dx = i16(dx + i16(sh(dx, 2)));                         // $24D152..$24D156
  }
  // $24D158 cmpi.w #$6,($5a,A4): formation 6 halves instead of quartering.
  const extra = ram.u16(player + P.optFormation) === 6
    ? i16(sh(dx, 1)) : i16(sh(dx, 2));
  dx = i16(dx + extra);                                    // $24D16A add.w D0,D3
  if (SHIP_MUTATE.value !== 'pods-rigid') {
    // THE WRONG PORT: leave the pods where $24C33A put them -- ON the ship.
    // That is what the page's SPLICE did (a constant offset from the ship), so
    // this mutation is the old behaviour, and the gate has to be able to see it.
    ram.setU16(pod + OPT.posY, u16(i16(ram.u16(pod + OPT.posY)) + dy));  // $24D146
    ram.setU16(pod + OPT.posX, u16(i16(ram.u16(pod + OPT.posX)) + dx));  // $24D16C
  }

  if (ram.u16(0x812970) !== 0) return;                     // $24D170 -> rts
  if (ram.i8(player + P.flags1) < 0) {                     // $24D178 tst.b/bmi
    return podKnockback24D188(ram, ctx, b, pod);           // $24D17C bmi $24D188
  }
  emitRequest(ram, b, NAMED_BUCKETS.options, pod);          // $24D17E jmp $23F2CA
  return undefined;
}

/** `$24D28E` -- the knockback ramp, and `$24D282` -- the settle table, which
 *  ABUT it.  Index spaces are both derived from instructions: `($38,A6)` is
 *  seeded `$26` by `$249AD8` and stepped `subq.w #$2` at `$24D19C`, so 20
 *  words; `($56,A6)` is seeded `$8` by `$249ADE`/`$24D20A` and stepped
 *  `subq.w #$4`, so indices 8/4/0 and a `movem.w` of TWO words at each -- five
 *  words.  `$24D2BE` (`moveq #$0,D0`) is code and pins the far end. */
export const POD_KNOCK = { settle: 0x24d282, ramp: 0x24d28e, end: 0x24d2be };

/**
 * `$24D188` -- **THE POD KNOCKBACK, AND W65 IS WHAT MADE IT REACHABLE.**
 *
 * `$24D178 tst.b ($1,A4) / bmi $24D188` reads bit 7 of the PLAYER's flags byte,
 * and W12 measured it 0 on every sampled frame -- correctly, because until this
 * wave nothing in the port ever set it.  **`$249A92 bset #$7,($1,A6)` -- the
 * LASER BOMB's arm -- is the first instruction this port has ever run that
 * does**, and `$2564AA bclr #$7,($1,A0)` inside `$256468` is what clears it
 * again 132 frames later.  So the pods are thrown backwards for exactly the
 * length of the beam bomb, and `src/bomb.js`'s `$249AD8 move.w #$26,($38,A1)`
 * and `$249ADE move.w #$8,($56,A1)` are the two counters this reads: they are
 * writes into the OPTION record (`$8104AA`), not into the bomb record, which
 * is why A1 is reloaded at `$249AB2`.
 *
 * TWO ARMS, and `$24D200` is not a fall-through of `$24D188` -- `$24D18C beq`
 * jumps to it, so the RAMP runs while `($38,A6)` lasts and the SETTLE runs
 * afterwards, for ever, until the bomb clears bit 7.
 */
export function podKnockback24D188(ram, ctx, b, pod) {
  const { rom } = ctx;
  let d0 = ram.u16(pod + 0x38);                            // $24D188 move.w
  if (d0 !== 0) {
    // ---- $24D18E: THE RAMP.  20 words, walked from $26 DOWN by 2, so the
    // first frame's push is `$24D28E[19]` = 256 and the second is [18] = 512 --
    // it gets BIGGER before it tails off, which a reader who assumed a decay
    // would smooth away.
    const push = rom.u16(POD_KNOCK.ramp + i16(d0));        // $24D194 (A0,D0.w)
    ram.setU16(pod + OPT.posY, u16(ram.u16(pod + OPT.posY) - push));  // $24D198
    ram.setU16(pod + 0x38, u16(d0 - 2));                   // $24D19C subq.w #$2
  } else {
    // ---- $24D200: THE SETTLE.  `movem.w` reads TWO words -- D0 the speed and
    // D1 the angle -- and `$2417D4` adds that vector to the pod's position.
    d0 = ram.u16(pod + 0x56);                              // $24D200 move.w
    const n = u16(d0 - 4);                                 // $24D204 subq.w #$4
    ram.setU16(pod + 0x56, (n & 0x8000) ? 8 : n);          // $24D208 bpl/$24D20A
    const spd = rom.u16(POD_KNOCK.settle + i16(d0));       // $24D216 movem.w
    const ang = rom.u16(POD_KNOCK.settle + i16(d0) + 2);
    // $2417D4 tst.w $8130D2 / beq $2417F2 -- and its OTHER arm is
    // `moveq #$0,D2 / moveq #$0,D3 / rts`, i.e. NO MOVE AT ALL.  Transcribed
    // as the two arms it is; `$8130D2` is 0 on this tree.
    if (ram.u16(0x8130d2) === 0) {                         // $2417D4 tst.w/beq
      const v = ctx.tables.vector(spd, ang);               // $2417F2 bsr $241812
      ram.setU16(pod + OPT.posY,
        u16(i16(ram.u16(pod + OPT.posY)) + i16(v.dy)));    // $2417F4 add.w D2
      ram.setU16(pod + OPT.posX,
        u16(i16(ram.u16(pod + OPT.posX)) + i16(v.dx)));    // $2417F8 add.w D3
    }
  }
  // ---- The four gates and the SHADOW, identical at $24D1A0 and $24D222.
  if (ram.u16(0x812970) === 0 && ram.u16(0x813098) === 0    // $24D1A0/$24D1AA
    && ram.u16(0x80390c) === 0 && ram.u16(0x813092) !== 2) { // $24D1B2/$24D1BA
    // $24D1C4..$24D1E0.  Both halves are `(v - K) >> 1 + K` with K = $1C00 on
    // the SHORT axis and $1400 on the LONG one, and then ONE `addi.l
    // #$FE00FE00` -- a LONG add, so a borrow out of the short half carries into
    // the long one.  Two `subi.w #$200`s would not.
    const px = i16(ram.u16(pod + OPT.posX)), py = i16(ram.u16(pod + OPT.posY));
    const lo = u16(asr(u16(px - 0x1c00) << 16 >> 16, 1) + 0x1c00);
    const hi = u16(asr(u16(py - 0x1400) << 16 >> 16, 1) + 0x1400);
    const d1 = ((((hi << 16) >>> 0) + lo) + 0xfe00fe00) >>> 0;   // $24D1E0
    emitRegisters(ram, b, NAMED_BUCKETS.shadows, d1,       // $24D1F2 jsr $23EFEE
      ram.u32(pod + OPT.shadow0), 0x210, 0x18);            // $24D1E6/$24D1EA/$24D1EE
  }
  emitRequest(ram, b, NAMED_BUCKETS.options, pod);          // $24D1F8/$24D27A jmp
  return undefined;
}

/**
 * `$24C0D2..$24C116` -- the one-time template copy, AS WRITTEN.
 *
 *   24c0d2: lea ($24BBAA,PC),A0
 *   24c0d6: move.w ($5a,A4),D0 / subi.w #$2,D0 / add.w D0,D0
 *   24c0e0: movea.l (A0,D0.w),A0            <-- LONGWORDS at a *2 index
 *   24c0e4: lea ($6,A6),A1
 *   24c0e8: move.l (A0)+,(A1)+  x7          +$06..+$21
 *   24c0f6: addq.w #4,A1                    +$22..+$25 ARE NOT WRITTEN
 *   24c0f8: move.l (A0)+,(A1)+  x15         +$26..+$61
 *   24c116: move.w (A0)+,(A1)+              +$62..+$63
 *
 * 90 template bytes into 94 record bytes with a four-byte hole. Then five byte
 * copies out of the player and, for a laser-capable native owner, a clear on the
 * laser block.
 *
 * NEVER EXERCISED BY A GATED RUN: the init bit is already set at every sample
 * point in the corpus.  It is here so that a scenario which starts before the
 * pods deploy does not hit a hole, and it is labelled so nobody reads its
 * presence as coverage.
 */
function copyTemplate(ram, ctx, b) {
  const { opt, player, laser } = b;
  const form = ram.u16(player + P.optFormation);           // $24C0D6
  const tmpl = ctx.rom.u32(OPT_TEMPLATES + u16(form - 2) * 2);   // $24C0E0
  let src = tmpl, dst = opt + 0x06;                        // $24C0E4 lea ($6,A6)
  for (let k = 0; k < 7; k++) {                            // $24C0E8 x7
    ram.setU32(dst, ctx.rom.u32(src)); src += 4; dst += 4;
  }
  dst += 4;                                                // $24C0F6 addq.w #4,A1
  for (let k = 0; k < 15; k++) {                           // $24C0F8 x15
    ram.setU32(dst, ctx.rom.u32(src)); src += 4; dst += 4;
  }
  ram.setU16(dst, ctx.rom.u16(src));                       // $24C116 move.w

  const d0 = ram.u8(player + P.dirLatch);                  // $24C118 ($1d,A4)
  ram.setU8(opt + 0x1d, d0);                               // $24C11C
  ram.setU8(opt + 0x3d, d0);                               // $24C120
  if (b.allowLaser !== false && b.ownerIndex !== 2) {
    const pw = ram.u8(player + 0x56);                        // $24C124 ($56,A4)
    ram.setU8(laser + 0x1d, pw);                             // $24C128 ($1d,A2)
    ram.setU8(laser + 0x1e, pw);                             // $24C12C ($1e,A2)
    ram.setU16(laser + 0x16, 0);                             // $24C130 clr.w ($16,A2)
  }
}

export { OPT, ROM };
