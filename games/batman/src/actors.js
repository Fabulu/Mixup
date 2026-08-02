// Map objects -- the $C1E8 array.  ROM: driver sub_01_4230, dispatch 1:$427B.
//
// 8 slots x 16 bytes, preloaded whole at level init from a bank-5 blob that is
// a byte-identical image of the RAM records (no streaming spawner). These are
// the platforms, conveyors, doors, spike traps and bat-rope anchors.
//
// Record layout (master reference §5.1, refined against the handlers):
//   +0     type 1-11, bit 7 = currently on-screen
//   +1/+2  X world 12.4 (hi, lo)
//   +3/+4  Y world 12.4 (hi, lo)
//   +5     travel accumulator -- subpixel steps pile up here until they carry
//          a whole byte, which advances a movement script ($45D0)
//   +6     Y velocity for type 3; for type 8 the handler latches $FF here, and
//          bit 7 is what lets the object override a solid map cell in the
//          collision scan ($2525)
//   +7     collision half-WIDTH, in screen pixels  ($2465 -> $C75A)
//   +8     collision half-HEIGHT, in screen pixels ($2469 -> $C72E)
//   +9/+$0A  cached SCREEN x, y -- recomputed each update from the world
//          position and the camera (1:$4852), and the only coordinates the
//          overlap scan ever compares against
//   +$0B   state counter ($FE = retired, $FF = running)
//   +$0C   wait timer, and the movement-script cursor for type 8
//   +$0D   player-riding flag, set by the collision scan at $2534
//   +$0E   movement-script selector (type 8)
//   +$0F   travel limit -- script steps before the object retires

import { u8, i8, cellIndex } from './state.js';
import { drawMetasprite } from './render/metasprite.js';
import { actorTypeA } from './conveyor.js';
import { c740Idle } from './effects.js';

export const SLOTS = 8;
export const RECORD = 16;

/**
 * Activation half-width by type. ROM: table 1:$4BA5, indexed by the RAW type.
 * Types 9 and 10 use narrower windows ($08/$09); type 11 reads one byte past
 * the table's end -- $FA, the first opcode of sub_01_4BB0 -- so it is always
 * active.
 */
const ACTIVATION = [0, 0x0B, 0x0B, 0x0B, 0x0B, 0x0B, 0x0B, 0x0B, 0x0B, 0x08, 0x09, 0xFA];

/**
 * Types whose handler is not ported yet. Listing them explicitly (rather than
 * silently doing nothing) keeps the gap honest and greppable.
 *   1 $488D  2 $48E4*  3 $499B  4 $4940  5 $4291  6 $42E3
 *   7 $4447  8 $4525   9 $464F 10 $4765* 11 $483C      (* not in any blob)
 *
 * All eleven are ported. The asterisks mean "no level's spawn blob contains
 * one", which is NOT the same as "never happens": sub_01_4AA0 reverses an
 * oscillator by rewriting its own type byte (1<->2, 3<->4), and the level-7
 * and level-13 sub_00_2CBE branches stamp type $0A records into $C1E8 at
 * runtime. Both types occur; neither is ever loaded.
 */
export const UNIMPLEMENTED_TYPES = new Set([]);

export function createActors() {
  return Array.from({ length: SLOTS }, () => new Uint8Array(RECORD));
}

/** Load the level's object blob. ROM: sub_00_2889 block-copies it verbatim. */
export function loadActors(state, records, count) {
  for (let i = 0; i < SLOTS; i++) {
    state.actors[i].fill(0);
    if (i < count) state.actors[i].set(records.subarray(i * RECORD, (i + 1) * RECORD));
  }
}

/** ROM: sub_01_4230 */
export function updateActors(state, manifest) {
  for (let slot = 0; slot < SLOTS; slot++) {
    const r = state.actors[slot];
    if (r[0] === 0) continue;                       // $4240: empty -> $4A53

    state.currentActorSlot = slot;                  // $4234: $C75A
    // $424A / $4251: a paused or lag frame skips the UPDATE but still runs the
    // screen tail. The port used to `continue` here, which also skipped the
    // +9/+$0A cache and the draw -- not what the ROM does.
    if (state.flow.paused || state.lagFrame) {      // $4246 / $424D
      screenTail(state, r, manifest);               // $424A/$4251 -> loc_01_49F6
      continue;
    }

    // $4257: activation is a pure camera-distance test on the HIGH bytes.
    const type = r[0] & 0x7F;
    const width = ACTIVATION[type] ?? 0x0B;
    const camCol = u8((state.camera.x >> 8) + 5);   // $425D
    const dist = Math.abs(camCol - r[1]);           // $4261
    if (dist >= width) {                            // $4267 -> loc_01_4A51
      r[0] &= 0x7F;                                 // drifting out clears bit 7
      continue;
    }

    r[0] |= 0x80;                                   // $426B: SET 7
    // A handler returns true when it took one of the `JP loc_01_4A53` exits --
    // straight to the next slot, WITHOUT the screen tail. That is not a detail:
    // a type $06 that has just landed leaves +9/+$0A holding its last airborne
    // screen position for one frame, and a type $05 that has fallen out of the
    // world keeps its final cache forever. Both are measured on the cartridge.
    if (dispatch(state, r, type)) continue;
    screenTail(state, r, manifest);                 // loc_01_49F5 -> $49F6
  }
}

/**
 * Cache the screen position AND draw the object.  ROM: loc_01_49F6-$4A4F.
 *
 * The port had no draw pass at all, which is why level 3's start platform was
 * invisible and Batman appeared to stand on air. MEASURED on the cartridge
 * (level 3, frame 60): shadow OAM slots 0-3 hold a 4-tile platform at y=$90,
 * x=$08/$10/$18/$20, directly under the player -- $C1E8 slot 0, the type-$08
 * whose COLLISION we had already ported.
 *
 * Three gates, in the ROM's order:
 *   $49F7  masked types $07/$09/$0B leave at once -- and note this is BEFORE
 *          the cache write at $4A05, so those three never get a screen cache
 *          from the tail at all. (MEASURED: level 5's three type-9 traps hold
 *          +9/+$0A = 0 for their whole run, spike stamping included. The scan
 *          skips masked 7 and 9 outright ($2454/$2459), and type $0B writes
 *          its own cache at 1:$4852, so nothing is lost -- but an earlier port
 *          cached here first and that is a state divergence, not a nicety.)
 *   $4A21  sub_00_11A7: |camX_hi + 5 - objX_hi| >= 9 is off-screen
 *   $4A29  an object above world row $11 does not draw
 */
function screenTail(state, r, manifest) {
  const type = r[0] & 0x7F;                       // $49F6: LD A,(HL) / AND $7F
  if (type === 0x07 || type === 0x09 || type === 0x0B) return;   // $49F9-$4A03

  cacheScreenPos(state, r);                       // $4A05-$4A19: +9/+$0A

  const camCol = u8((state.camera.x >> 8) + 5);   // $11A7
  if (Math.abs(camCol - r[1]) >= 9) return;       // $11B0: CP $09
  if (r[3] < 0x11) return;                        // $4A29: CP $11 / JR C

  // $4A37-$4A4A: a per-level, per-type table at 1:$4AB7, indexed
  // (level-1)*10 + (type-1). Both indices are 1-based in the ROM.
  const ids = state.tables?.objectMetasprites;
  if (!ids || !manifest?.metasprites) return;
  const id = ids[(state.level.number - 1) * 10 + (type - 1)];
  if (id === undefined) return;

  // r[9]/r[10] are OAM coordinates (+8/+16 from sub_00_1172); the sprite queue
  // is in screen space, so the hardware offsets come back off -- same as
  // drawEnemies does with r[7]/r[8].
  // VERIFIED against the cartridge's shadow OAM: level 3 slot 0 queues four
  // sprites, tiles $E8/$EA/$EC/$EE, at screen (0,128) (8,128) (16,128)
  // (24,128) -- exactly the OAM y=144, x=8/16/24/32 the ROM writes.
  drawMetasprite(state, manifest.metasprites.table1, id, r[9] - 8, r[10] - 16, 0);
}

/**
 * ROM: 1:$4849-$485D, and the same six instructions in every other handler.
 *
 * The shared tail converts the object's world position to screen pixels
 * through sub_00_1172 and parks the result at +9/+$0A. The collision scan at
 * loc_00_2426 compares ONLY against those cached bytes -- it never re-derives
 * them -- so an object that fails to write them is invisible to collision even
 * while it draws correctly.
 *
 * Type $0B is the one handler that does this itself (1:$4849-$485D, the six
 * instructions this mirrors), because the tail refuses to serve it.
 */
function cacheScreenPos(state, r) {
  const wx = (r[1] << 8) | r[2];
  const wy = (r[3] << 8) | r[4];
  r[9] = screenX(state, wx);
  r[10] = screenY(state, wy);
}

// sub_00_1172. The four SLA/RLA pairs are a 16-bit `<< 4` whose top nibble
// falls off the end, which is just `>> 4` of the difference; the $08/$10
// addends are the OAM origin offsets.
export const screenX = (state, worldX) =>
  u8((((worldX - state.camera.x) & 0xFFFF) >> 4) + 0x08);
export const screenY = (state, worldY) =>
  u8((((worldY - state.camera.y) & 0xFFFF) >> 4) + 0x10);

// NOTE: an earlier version ran a "$15BA contact" test here that removed the
// object and dealt 2 damage on overlap. That routine (loc_00_1444..$1626)
// walks the $C6CF PICKUP-DROP array, not $C1E8 -- the oracle caught it
// deleting the level-5 spike trap the moment the player walked under it. Map
// objects have no generic player contact; anything that hurts does so through
// its own handler or the cells it stamps. The $C6CF drops are not ported yet.

/** ROM: sub_00_0AE1 mailbox. */
function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) {
    state.sound.queue.push({ id, mask });
  }
}

/**
 * ROM: the jump table at 1:$427B, indexed by (type - 1) * 2.
 * @returns true if the handler exited straight to loc_01_4A53, i.e. skipping
 *          the screen tail. Everything that ends at loc_01_49F5/$4443 is false.
 */
function dispatch(state, r, type) {
  switch (type) {
    case 1: actorTypeXOscillator(state, r, true); return false;   // $488D
    case 2: actorTypeXOscillator(state, r, false); return false;  // $48E4
    case 3: actorTypeYOscillator(state, r, false); return false;  // $499B
    case 4: actorTypeYOscillator(state, r, true); return false;   // $4940
    case 5: return actorType5(state, r);            // $4291
    case 6: return actorType6(state, r);            // $42E3
    case 7: actorType7(state, r); return false;     // $4447
    case 8: actorType8(state, r); return false;     // $4525
    case 9: actorType9(state, r); return false;     // $464F
    // $4765. Spawned only by the level-7 and level-13 sub_00_2CBE branches,
    // which is why it lives in src/conveyor.js next to the code that makes it.
    case 0x0A: return actorTypeA(state, r);         // $4765
    case 0x0B: actorTypeB(state, r); return true;   // $483C -- own cache, no tail
    default: return false;                          // nothing left unported
  }
}

// ---------------------------------------------------------------------------
// Types 1/2 (X) and 3/4 (Y) -- ONE oscillator, four entry points.
//
// This is the trap the listing sets. jt_01_488D, jt_01_48E4, jt_01_499B and
// jt_01_4940 look like four handlers; they are two, each with a positive and a
// negative entry that JUMP INTO EACH OTHER. Reading any one of them alone gets
// the arithmetic wrong.
//
//   1 ($4890) accelerate +X      2 ($48E7) accelerate -X    velocity at +5
//   4 ($4943) accelerate +Y      3 ($499E) accelerate -Y    velocity at +6
//
// The "accelerate" half is entered with the velocity already pointing its way:
// step it by 1 toward the cap ($10 / $F0) and move by the NEW value. The other
// half first brakes a velocity pointing the wrong way by 2 and then jumps to
// the accelerating half, which adds its 1 back -- so a reversal bleeds off at
// exactly 1 per frame and the step taken is v-1, not v-2. MEASURED on level 7
// (slot 1, type 4 -> 3 at f33): velocity $10 -> $0F with a $0F step, then
// $0E/$0D/... A port that stored v-2 and moved by v-2 is a frame ahead from
// the first reversal onward and never recovers.
//
// The reversal itself REWRITES THE TYPE BYTE (sub_01_4AA0): 1<->2, 3<->4. That
// is why no level's spawn blob contains a type 2 -- a type 2 is what a type 1
// becomes on its first bounce. Each direction owns its own limit test, and a
// routine that
// arrived through the other entry point skips it entirely ($48BF/$4919/$4972/
// $49CF all re-read the type byte first), so an object reverses on the frame
// AFTER the bounce rather than during it.
// ---------------------------------------------------------------------------

/** ROM: sub_01_4AA0 + the table at 1:$4AB3. Only types 1-4 are ever passed. */
const FLIP_TYPE = { 1: 2, 2: 1, 3: 4, 4: 3 };
function flipObjectType(r) {
  r[0] = (r[0] & 0x80) | FLIP_TYPE[r[0] & 0x7F];    // $4AA2-$4AB1
}

/** ROM: loc_01_4890 (positive) / loc_01_48E7 (negative), velocity at +5. */
function actorTypeXOscillator(state, r, positive) {
  const v = r[5];
  if (positive) {                                   // $4890
    if (v & 0x80) {                                 // $4895: pointing left
      const a = v + 2;                              // $4899
      if (a > 0xFF) { r[5] = 0; return; }           // $489D: crossed zero
      r[5] = a;
      return actorTypeXOscillator(state, r, false); // $48A7: JP loc_01_48E7
    }
    r[5] = Math.min(v + 1, 0x10);                   // $48AB-$48B2
    objectAddX(state, r, r[5]);                     // $48BB: sub_01_4A5C, B = 0
    // $48BF: only a type 1 owns this limit test.
    if ((r[0] & 0x7F) !== 0x01) return;
    const d = r[1] - r[0x0E];                       // $48D5: X hi - origin
    if (d < 0 || d < r[0x0B]) return;               // $48D7 / $48DB
    flipObjectType(r);                              // $48DE
    return;
  }
  // $48E7
  if (v !== 0 && (v & 0x80) === 0) {                // $48EC/$48EF: pointing right
    const a = v - 2;                                // $48F3
    if (a < 0) { r[5] = 0; return; }                // $48F7
    r[5] = a;
    return actorTypeXOscillator(state, r, true);    // $4901: JP loc_01_4890
  }
  r[5] = clampLow(v);                               // $4904-$490C
  objectAddX(state, r, 0xFF00 | r[5]);              // $4915: sub_01_4A5C, B = $FF
  if ((r[0] & 0x7F) !== 0x02) return;               // $4919
  const d = r[1] - r[0x0E];                         // $492F
  if (d >= 0) return;                               // $4931
  if (-d < r[0x0B]) return;                         // $4936
  flipObjectType(r);                                // $493A
}

/** ROM: loc_01_4943 (positive) / loc_01_499E (negative), velocity at +6. */
function actorTypeYOscillator(state, r, positive) {
  const v = r[6];
  if (positive) {                                   // $4943
    if (v & 0x80) {                                 // $4948
      const a = v + 2;                              // $494C
      if (a > 0xFF) { r[6] = 0; return; }           // $4950
      r[6] = a;
      return actorTypeYOscillator(state, r, false); // $495A: JP loc_01_499E
    }
    r[6] = Math.min(v + 1, 0x10);                   // $495E-$4965
    objectAddY(state, r, r[6]);                     // $496E: sub_01_4A79, B = 0
    if ((r[0] & 0x7F) !== 0x04) return;             // $4972
    const d = r[3] - r[0x0F];                       // $4988: Y hi - origin
    if (d < 0 || d < r[0x0C]) return;               // $498A / $498E
    flipObjectType(r);                              // $4995
    return;
  }
  // $499E
  if (v !== 0 && (v & 0x80) === 0) {                // $49A3/$49A6
    const a = v - 2;                                // $49AA
    if (a < 0) { r[6] = 0; return; }                // $49AE
    r[6] = a;
    return actorTypeYOscillator(state, r, true);    // $49B7: JP loc_01_4943
  }
  r[6] = clampLow(v);                               // $49BB-$49C2
  objectAddY(state, r, 0xFF00 | r[6]);              // $49CB: sub_01_4A79, B = $FF
  if ((r[0] & 0x7F) !== 0x03) return;               // $49CF
  const d = r[3] - r[0x0F];                         // $49E6
  if (d >= 0) return;                               // $49E7
  if (-d < r[0x0C]) return;                         // $49EC
  flipObjectType(r);                                // $49F2
}

/**
 * DEC A then an UNSIGNED `CP $F0` floor. ROM: $4904-$490C / $49BB-$49C2.
 * v = 0 gives $FF (-1), and the compare is unsigned so anything below $F0
 * pins there -- which is also what stops the wrap at $EF from running away.
 */
const clampLow = (v) => (u8(v - 1) < 0xF0 ? 0xF0 : u8(v - 1));

/**
 * Type 7 -- a pulsing water spout.  ROM: jt_01_4447.
 *
 * Level 1's only object, four of them strung across the pit at columns 99-112.
 * Like the type-9 spike trap it is TERRAIN, not a sprite: it stamps graphic
 * $47 / collision $FD one cell at a time straight down its own column from row
 * $13, then erases the same column on the way back up, waits, and repeats. So
 * the falling water is drawn by the tilemap and hurts on contact like spikes.
 *
 * It stays dormant until the player is within 5 metatiles horizontally, and
 * both the step rate and the pause between pulses scale with difficulty -- on
 * hard the streams come roughly five times as often.
 *
 * Note the rope deliberately passes THROUGH $FD on level 1 ($3DF1): these
 * cells are exactly why that special case exists, so the grapple cannot catch
 * on a column of water.
 */
function actorType7(state, r) {
  const hard = state.flow.difficulty !== 0;

  if (r[0x0C] !== 0) {                              // $444E: pulse gate
    if (--r[0x0C] !== 0) return;                    // $4453
    // $4457: the pause between pulses ended -- announce the next one. Only
    // when idle; the timer also gates each row step mid-pulse.
    if (r[0x0B] === 0) requestSound(state, 0x20);   // $445D
    return;
  }

  let phase = r[0x0B];

  if (phase === 0) {                                // $4466: dormant
    // $4470: a plain distance test on the HIGH bytes, tighter than the
    // activation window the driver already applied.
    const dist = Math.abs((state.player.x >> 8) - r[1]);
    if (dist >= 5) return;                          // $4477
    r[0x0B] = 1;                                    // $4480
    return;
  }

  if (phase !== 0xFF && phase !== 0xFE) {           // $4486: arming, 1 -> 2 -> $FF
    const a = u8(phase + 1);
    if (a < 3) { r[0x0B] = a; return; }             // $448F
    phase = 0xFF;                                   // $4497
    r[0x0B] = 0xFF;
  }

  // $449A: one cell per step -- draw on the way down, erase on the way back.
  const col = r[1];
  const row = r[3];
  if (phase !== 0xFE) stamp(state, col, row, 0x47, 0xFD);   // $44B0
  else stamp(state, col, row, 0, 0);                        // $44B8

  r[0x0C] = hard ? 1 : 2;                           // $44D6: step rate

  const next = u8(row + 1);                         // $44E7
  if (next < 0x20) { r[3] = next; return; }         // $44E9

  // $44ED: the column reached the floor. Extending flips to erasing; erasing
  // goes fully idle and waits out the gap before the next pulse.
  if (phase !== 0xFE) {
    r[0x0B] = 0xFE;                                 // $44F8
  } else {
    r[0x0B] = 0;                                    // $44FE
    r[0x0C] = state.flow.difficulty === 0 ? 0x50    // $4511
      : state.flow.difficulty === 1 ? 0x28          // $450D
      : 0x10;                                       // $4509
  }
  r[3] = r[0x0F];                                   // $4518: back to the top
}

/**
 * Type 5 -- a platform that gives way under you.  ROM: jt_01_4291.
 *
 * Inert until the player stands on it (+$0D, written by the collision scan at
 * $2534), then a seven-frame arming count and it drops: +6 is a downward speed
 * that grows 1 per frame to a cap of $30, moving the object -- and, through
 * sub_01_4A79's carry tail, the rider with it. Once its Y high byte reaches
 * $21 it has left the world and the slot is ZEROED outright ($42DE), not
 * retired: the record is gone and the scan will never see it again.
 *
 * MEASURED (level 3 slot 5, warp 19,22): rider at f19, +$0B 1..7 across
 * f20-f26, $FF and the first 1-subpixel step at f27, speed pinned at $30 from
 * f74, slot cleared at f85 with its +9/+$0A frozen at f84's values -- the
 * clearing arm is a `JP loc_01_4A53`, so the screen tail never runs again.
 *
 * @returns true (skip the screen tail) only on the frame it clears the slot.
 */
function actorType5(state, r) {
  const st = r[0x0B];

  if (st === 0) {                                   // $4299
    if (r[0x0D] === 0) return false;                // $429E: wait for a rider
    r[0x0B] = 1;                                    // $42A4
    return false;
  }

  if (st !== 0xFF) {                                // $42AA
    const a = u8(st + 1);                           // $42AE
    if (a < 0x08) { r[0x0B] = a; return false; }    // $42AF
    r[0x0B] = 0xFF;                                 // $42B7, then falls into $42BA
  }

  // $42BA: accelerate downward, capped at $30.
  const v = Math.min(r[6] + 1, 0x30);               // $42BE-$42C4
  r[6] = v;
  objectAddY(state, r, v);                          // $42CF: sub_01_4A79, B = 0

  if (r[3] < 0x21) return false;                    // $42D8: still in the world
  r[0] = 0;                                         // $42DE: the slot is emptied
  return true;                                      // $42E0: JP loc_01_4A53
}

// ---------------------------------------------------------------------------
// Type 6 -- a falling block that BECOMES TERRAIN.  ROM: jt_01_42E3.
//
// Dormant until the player's X high byte is within 5 columns, then one arming
// frame and it falls: +6 grows by 3 per frame to a cap of $50. Below world row
// $11 it starts probing the two map cells directly under its 2x2 footprint
// (columns col-1 and col, row+1), and the first solid one lands it:
//
//   * the record parks (+4 = 0, +6 = 0, +$0B = $FE) and plays sound $21;
//   * a 2x2 block of MAP CELLS is stamped with graphics $3E $3F $40 $41 and,
//     in all four, collision `slot * 32 | $1F` -- the object's own slot index
//     encoded into the terrain. That is what makes level 13's destructible
//     cells "actor-owned": the door sequencer finds its object by the slot
//     number written in the collision byte.
//
// A landed block keeps probing. If whatever held it up disappears, it wipes
// its own four cells again and resumes falling ($4377). While landed it also
// pins +9/+$0A to $FF/$FF ($431B) so the overlap scan cannot find it -- it is
// terrain now, and being BOTH would make it solid twice.
//
// MEASURED (level 3 slots 1-4, warp 96,26): armed f2, falling f3, speed capped
// $50 by f29, slot 1 lands f60 at row $1D and stamps (97,28)=$3E/$3F,
// (98,28)=$3F/$3F, (97,29)=$40/$3F, (98,29)=$41/$3F -- collision $3F = slot
// 1 * 32 | $1F. Slots 2, 3 and 4 then STACK on top of it at f67/f70/f73,
// each landing one row higher because the block below it is now solid map.
// The +9/+$0A pin appears one frame after each landing (f61, f68, f71, f74),
// because the landing frame itself exits at $443B without the tail.
// ---------------------------------------------------------------------------

/** Graphic ids the landed block stamps, ROM order. $43D5/$43E4/$43EB/$43F0. */
const TYPE6_TILES = { br: 0x41, tr: 0x3F, tl: 0x3E, bl: 0x40 };

function actorType6(state, r) {
  const st = r[0x0B];

  if (st === 0) {                                   // $42EA
    // $42F4: a plain distance test on the HIGH bytes, tighter than the
    // driver's own activation window.
    if (Math.abs((state.player.x >> 8) - r[1]) >= 5) return false;   // $42FB
    r[0x0B] = 1;                                    // $4304
    return false;
  }

  if (st === 0xFE) {                                // $430E
    // $431B: landed. Park the screen cache off-screen, then re-probe.
    r[0x0A] = 0xFF;
    r[9] = 0xFF;
  } else {
    if (st !== 0xFF) {                              // $430A
      const a = u8(st + 1);                         // $4312
      if (a < 0x02) { r[0x0B] = a; return false; }  // $4313
      r[0x0B] = 0xFF;                               // $4324, then falls into $4327
    }
    // $4327: accelerate downward, capped at $50.
    const v = Math.min(r[6] + 3, 0x50);             // $432B-$4332
    r[6] = v;
    objectAddY(state, r, v);                        // $433D: sub_01_4A79, B = 0
  }

  // $4341: the ground probe, shared by both arms.
  const col = r[1];
  const row = r[3];
  if (row < 0x11) return false;                     // $434A: too high to probe

  const supported = solidCell(state, col, row + 1)  // $4354
                 || solidCell(state, col - 1, row + 1);   // $435F

  if (!supported) {
    if (r[0x0B] !== 0xFE) return false;             // $436E: still falling
    // $4377: the ground went away -- wipe the four cells and fall again.
    stampBlock(state, col, row, 0, 0);
    r[0x0B] = 0xFF;                                 // $43BE
    return false;
  }

  if (r[0x0B] === 0xFE) return true;                // $43CF -> loc_01_443E

  // $43D1: land. The collision byte carries the owning slot in its top bits.
  stampBlock(state, col, row, null, u8((state.currentActorSlot << 5) | 0x1F));
  r[4] = 0;                                         // $4425: Y lo
  r[6] = 0;                                         // $442B: velocity
  r[0x0B] = 0xFE;                                   // $4431
  requestSound(state, 0x21);                        // $4438: BC = $2101
  return true;                                      // $443B: JP loc_01_4A53
}

/**
 * The 2x2 footprint, in the ROM's own write order ($437D-$438A / $43D5-$43F3):
 * (col,row) then (col,row-1) then (col-1,row-1) then (col-1,row).
 *
 * The port stamps map cells only. The ROM ALSO queues four sub_00_11F1
 * metatile writes into the $C130 VRAM queue, but our renderer derives the
 * background straight from level.cells through the metatile table, so the two
 * are the same picture -- exactly the stance type 9's spike stamp already
 * takes.
 *
 * @param graphic null = use the four landed tile ids; 0 = erase.
 */
function stampBlock(state, col, row, graphic, collision) {
  const g = graphic === null ? TYPE6_TILES : { br: 0, tr: 0, tl: 0, bl: 0 };
  stamp(state, col, row, g.br, collision);
  stamp(state, col, row - 1, g.tr, collision);
  stamp(state, col - 1, row - 1, g.tl, collision);
  stamp(state, col - 1, row, g.bl, collision);
}

/** ROM: sub_00_11B9 + `INC HL / BIT 0,(HL)` -- bit 0 of the collision byte. */
function solidCell(state, col, row) {
  const cells = state.level.cells;
  if (!cells || col < 0 || col >= state.level.width) return false;
  return (cells[cellIndex(col, row) * 2 + 1] & 1) !== 0;
}

/**
 * Type $0B -- the level-6 conveyor deck.  ROM: jt_01_483C.
 *
 * The one object with no position of its own: every frame it copies the
 * level-6 track ($FFCA/$FFCB, +5 on the high byte) into its own +1/+2, writes
 * its screen cache by hand (1:$4852 -- the tail at $49F6 refuses masked type
 * $0B, so nothing else would), and then, if the player is standing on it,
 * shoves him 8 subpixels a frame in the track's direction ($FFC9: 1 = right
 * $08, 2 = left $F8) through the ordinary platform-carry inbox $C72F.
 *
 * Its box is enormous -- +7 = $40, +8 = $11 from the level-6 spawn blob -- so
 * "standing on it" means standing anywhere on the deck.
 *
 * VERIFIABLE END-TO-END, and this note used to say the opposite. The missing
 * piece was loc_00_2EF4, the level-6 branch of sub_00_2CBE that writes the
 * track; src/conveyor.js's level6Track ports it, and the injection that
 * tools/oracle/objregress.mjs's l6-conveyor-deck once needed is gone. That
 * scenario now walks the player right for 400 frames and compares all 16 bytes
 * of the record against the cartridge with nothing seeded: bit-exact, through
 * the track's descent, the reversal at f69 and the park at $0500.
 */
function actorTypeB(state, r) {
  const track = state.flow.parallaxTrack;           // $483F: $FFCA/$FFCB
  r[1] = u8((track >> 8) + 5);                      // $4841
  r[2] = track & 0xFF;                              // $4844

  cacheScreenPos(state, r);                         // $4849-$485D

  if (r[0x0D] === 0) return;                        // $4862: nobody riding
  // $4867: $C740 must be $FF. Not $C750 -- the same correction the melee and
  // batarang gates needed. It is unobservable here (level 6 has no boss, so
  // $C740 never leaves $FF on the only level a type-$0B exists on) and is
  // transcribed anyway, because "unreachable today" is a property of the level
  // data, not of the routine.
  if (!c740Idle(state)) return;
  if (state.player.action === 2) return;            // $486F: $C71E, rope flight
  // $FFC9, written by loc_00_2EF4 -- src/conveyor.js's trackUp/trackDown. This
  // comment used to say the byte "reads undefined today and the deck never
  // carries"; that has been false since level6Track landed. MEASURED over 400
  // frames of level 6 with the player walking right: $FFC9 holds 2 while the
  // track descends, flips to 1 at f69 when it reverses, and the whole record is
  // bit-exact against the cartridge on every one of those frames
  // (tools/oracle/objregress.mjs, l6-conveyor-deck). The `?? 0` stays for the
  // synthetic states in tests/, which never run the subsystem.
  const dir = state.flow.conveyorDir ?? 0;          // $4877
  if (dir === 0) return;                            // $487A
  state.carry.x = i8(dir === 2 ? 0xF8 : 0x08);      // $4881/$4885 -> $C72F
}

// ---------------------------------------------------------------------------
// Type 8 -- a rideable moving platform.  ROM: jt_01_4525.
//
// Inert until the player stands on it (+$0D, set by the collision scan at
// loc_00_2534). Four ticks later it latches +$0B = $FF and writes $FF into +6,
// whose bit 7 is what lets it hold the player up even over a solid map cell
// ($2525) -- the handler and the collision scan meet at exactly that byte.
//
// From then on it walks a per-object movement script: one byte per step,
// 0 = +X, 1 = -X, 2 = -Y, 3 = +Y, moving $10 subpixels a frame. +5 accumulates
// those until it carries a whole byte, which advances the script cursor (+$0C)
// and snaps the moved coordinate's low byte. Running the cursor past the travel
// limit at +$0F parks the object at +$0B = $FE, permanently done -- which is
// how level 3's slot 0 ships: $FE straight from the spawn blob, so it never
// moves at all and is simply a static ledge. That is why the level 2 -> 3
// arrival is already correct without this handler.
// ---------------------------------------------------------------------------

/**
 * Script entry offsets, rebased onto tables.objectScripts (index 0 = 1:$4B43).
 * These are immediates in the handler ($457E-$4597), not a ROM pointer table,
 * so they belong next to the code that selects them.
 */
const OBJ_SCRIPT = { 1: 0x00, 3: 0x32, 4: 0x37, 5: 0x3C, 6: 0x48, 7: 0x55 };
const OBJ_SCRIPT_DEFAULT = 0x5C;                    // $4579: $4B9F

function actorType8(state, r) {
  const st = r[0x0B];

  if (st === 0x00) {                                // $452E
    if (r[0x0D] === 0) return;                      // $4534: wait for a rider
    r[0x0B] = 0x01;                                 // $453A
    return;
  }
  if (st === 0xFE) return;                          // $4540: finished for good

  if (st !== 0xFF) {                                // $4545: still arming
    const a = u8(st + 1);
    if (a < 0x04) { r[0x0B] = a; return; }          // $454A
    r[0x0B] = 0xFF;                                 // $4550
    r[6] = 0xFF;                                    // $4559: +6, the override bit
  }

  const scripts = state.tables.objectScripts;
  if (!scripts) return;
  const base = OBJ_SCRIPT[r[0x0E]] ?? OBJ_SCRIPT_DEFAULT;   // $455C-$4597
  const op = scripts[base + r[0x0C]];               // $459A: cursor at +$0C
  if (op === undefined) return;

  // $459E: two X opcodes and two Y opcodes, $10 subpixels either way.
  const delta = (op === 1 || op === 2) ? 0xFFF0 : 0x0010;
  if (op >= 2) moveObjectY(state, r, delta);        // $45BC
  else moveObjectX(state, r, delta);                // $4606
}

/**
 * ROM: sub_01_4A5C -- X += BC, then hand the same displacement to the player
 * if they are riding. A rope flight ($C71E == 2) is never carried.
 */
function objectAddX(state, r, delta) {
  const x = (((r[1] << 8) | r[2]) + delta) & 0xFFFF;
  r[1] = x >> 8; r[2] = x & 0xFF;
  if (r[0x0D] === 0) return;                        // $4A6A
  if (state.player.action === 2) return;            // $4A70
  state.carry.x = i8(u8(state.carry.x + (delta & 0xFF)));   // $4A71: $C72F
}

/** ROM: sub_01_4A79 -- the Y twin, which also cancels a rope flight. */
function objectAddY(state, r, delta) {
  const y = (((r[3] << 8) | r[4]) + delta) & 0xFFFF;
  r[3] = y >> 8; r[4] = y & 0xFF;
  if (r[0x0D] === 0) return;                        // $4A89
  if (state.player.action === 2) {                  // $4A8F
    // $4A91: a platform moving DOWN under a swinging player is left alone; one
    // moving up cuts the rope first and then carries.
    if ((delta & 0x80) === 0) return;
    state.player.action = 0;                        // $4A95
  }
  state.carry.y = i8(u8(state.carry.y + (delta & 0xFF)));   // $4A98: $C730
}

/**
 * The shared tail of both movement paths ($45C0 and $4611): accumulate this
 * step into +5 and, when it carries a whole byte, advance the script.
 *
 * @param loIndex  record byte holding the moved coordinate's low half
 * @param snapTo   what that byte is pinned to -- $80 for Y ($45FE), $00 for X
 *                 ($4647). The asymmetry is the original's.
 */
function advanceObjectScript(state, r, delta, loIndex, snapTo, axis) {
  const step = u8(delta & 0xFF);
  const mag = (step & 0x80) ? u8(-step) : step;     // $45C9 / $4613
  const acc = r[5] + mag;                           // $45D0 / $461A

  if (acc <= 0xFF) { r[5] = acc; return; }          // $4602 / $464B

  // $45D3 / $461D: a full byte of travel -- step the cursor, or retire.
  const next = u8(r[0x0C] + 1);
  if (next >= r[0x0F]) {                            // $45DF / $4629
    r[0x0B] = 0xFE;
    return;
  }
  r[0x0C] = next;

  // $45EF / $4639: the gap between here and the snap goes to the player as
  // carry, so riding stays seamless across a script step.
  const residual = u8(snapTo - r[loIndex]);
  if (r[0x0D] & 0x80) {                             // $45F3 / $463C: BIT 7
    if (axis === 'y') state.carry.y = i8(u8(state.carry.y + residual));
    else state.carry.x = i8(u8(state.carry.x + residual));
  }
  r[loIndex] = snapTo;
  r[5] = 0;
}

function moveObjectX(state, r, delta) {
  objectAddX(state, r, delta);                      // $460A
  advanceObjectScript(state, r, delta, 2, 0x00, 'x');
}

function moveObjectY(state, r, delta) {
  objectAddY(state, r, delta);                      // $45C0
  advanceObjectScript(state, r, delta, 4, 0x80, 'y');
}

/**
 * Type 9 -- a descending spike trap.  ROM: jt_01_464F.
 *
 * A wait timer at +$0C, then a counter at +$0B ticks up to $10 and latches at
 * $FF. From then on the trap is a two-column spike STAMPED INTO THE MAP, two
 * cells per step: +$0B holds the phase ($FF extending, $FE retracting) and +3
 * the current row. Extending writes shaft tiles $2D/$2E at the row and tip
 * tiles $2F/$30 one row below, every 2 frames, until the row reaches $1D --
 * then it waits $10 frames and retracts (clear the row, move the tips up)
 * every $0C frames back to row $17, waits ($20 frames, or 8 above difficulty
 * 0) and repeats. The trap is terrain, not a sprite -- which is why it is
 * invisible to a sprite-only model of the actor array, and why the player's
 * CEILING probe is what it fights (see probeCeiling's level-5 spike rule).
 */
function actorType9(state, r) {
  if (r[0x0C] !== 0) { r[0x0C]--; return; }         // $4656: wait
  let phase = r[0x0B];
  if (phase !== 0xFF && phase !== 0xFE) {           // $4660/$4664: arming
    const a = u8(phase + 1);                        // $4668
    if (a < 0x10) { r[0x0B] = a; return; }          // $4669
    phase = 0xFF;                                   // $4671
    r[0x0B] = 0xFF;
  }

  const col = r[1];                                 // $467B: X hi
  const row = r[3];                                 // $467E: current Y hi
  if (phase !== 0xFE) {                             // $468A: extend downward
    stamp(state, col, row, 0x2E, 0xFD);
    stamp(state, col - 1, row, 0x2D, 0xFD);
    stamp(state, col - 1, row + 1, 0x2F, 0xFD);     // $46A7: the tips
    stamp(state, col, row + 1, 0x30, 0xFD);
  } else {                                          // $469C: retract upward
    stamp(state, col, row, 0, 0);
    stamp(state, col - 1, row, 0, 0);
    stamp(state, col - 1, row - 1, 0x2F, 0xFD);
    stamp(state, col, row - 1, 0x30, 0xFD);
  }
  r[0x0C] = phase !== 0xFE ? 2 : 0x0C;              // $4711 / $4715

  if (phase !== 0xFE) {                             // $4723
    const next = u8(row + 1);
    if (next < 0x1D) { r[3] = next; return; }       // $4725
    r[0x0B] = 0xFE;                                 // $472D: full length
    r[0x0C] = 0x10;
    requestSound(state, 0x24);                      // $4733
    r[3] = 0x1D;                                    // $473D
    return;
  }
  const next = u8(row - 1);                         // $4743
  if (next >= 0x18) { r[3] = next; return; }        // $4745
  r[0x0B] = 0xFF;                                   // $474D: rearm
  r[0x0C] = state.flow.difficulty !== 0 ? 8 : 0x20; // $4750
  r[3] = 0x17;                                      // $4761
}

function stamp(state, col, row, graphic, collision) {
  const cells = state.level.cells;
  if (!cells || col < 0 || col >= state.level.width) return;
  const i = cellIndex(col, row) * 2;
  if (i + 1 >= cells.length) return;
  cells[i] = graphic;
  cells[i + 1] = collision;
}
