// Enemy array -- $C268.  ROM: driver sub_01_4E0C, dispatch 1:$50D3.
//
// 8 slots x 32 bytes, preloaded whole at level init from a bank-5 blob that is
// a byte-identical image of the RAM records. There is no streaming spawner and
// no pooling: the whole roster for a level exists from the moment it loads,
// dormant until the camera comes near. The entire game ships 26 non-boss
// enemies and 5 boss entities. The only runtime spawn is the projectile copy
// into slots 6/7 (sub_01_6BDC).
//
// The record layout table now lives in enemies/record.js, beside SLOTS,
// RECORD and the flag bits, so that leaf modules can read them without
// importing this file back.
//
// WHAT LIVES WHERE (all of it came out of this file, verbatim, in Phase 7):
//   enemies/record.js  the 8x32 record layout, SLOTS/RECORD, F_ACTIVE/F_DISABLED
//   enemies/util.js    sub_01_63AD adds, the negate/absdiff idioms, $FF93/$FF94,
//                      the sub_00_0AE1 sound mailbox
//   enemies/probe.js   sub_01_6666 and its five mode wrappers ($63B4/$6499/
//                      $64FA/$656A/$6616) -- and $FFBE, which stays on state
//   enemies/anim.js    $5DFF-$6063 the animation machine, loc_01_5FE6 the walk
//                      cycle, the draw queue and its flush (ORDER LIVES THERE)
//   enemies/tails.js   loc_01_5BB6 / loc_01_5C15 / loc_01_5CA8, the shared
//                      rise -> fall -> land -> screen/anim fall-through
//   enemies/melee.js   loc_00_2643-$272B, the player's punch scan
//
// AND, IN PHASE 9, one file per state and one per boss under enemies/states/
// and enemies/bosses/ -- each carrying its st* handler AND its attackTick*
// together, because several of those pairs FALL THROUGH into each other in
// the ROM. game.json's enemies[] entries name those files.
//   enemies/states/dormant.js   state 12: jt_01_5B95 + jt_01_637F
//   enemies/states/chaser14.js  state 4:  jt_01_7750 (its tick is the SHARED
//                               jt_01_6107, which stays with the dispatch)
//   enemies/states/vehicle6.js  state 5:  jt_01_575C + jt_01_6398
//   enemies/states/flyer.js     state 3:  jt_01_55AA + jt_01_6169
//   enemies/states/projectile.js state 11: jt_01_59E0 AND sub_01_6BDC,
//                               the spawner that builds a state-11 record
//   enemies/states/shooter12.js state 6:  jt_01_57D6 + jt_01_61B3
//   enemies/states/walkershared.js  the step, the two wall stops, the
//                               ledge scan and sub_01_7D09's pit leaps
//   enemies/states/walker.js    states 1 and 2: jt_01_50ED, jt_01_5399
//                               and jt_01_612E
//   enemies/bosses/boss1.js    state 10: jt_01_7591 + jt_01_634F, and
//                               sub_01_79DB, which bosses 2 and 4 borrow
// THIS file keeps the driver, the ten-arm hit ladder, the two dispatch tables
// and the remaining state and boss handlers -- i.e. everything that has an
// ORDER.

import { u8, i8, u16, mapCollisionByIndex } from './state.js';
import { spawnDrop } from './drops.js';
import {
  effects, resetEffects, bossCountdownTick, victoryStep,
  COUNTDOWN_IDLE, COUNTDOWN_START,
} from './effects.js';
import { spawnEffect } from './doors.js';
import {
  SLOTS, RECORD, F_ACTIVE, F_DISABLED,
  E_FLAGS, E_STATE, E_ANIM_TIMER, E_FACING, E_SCREEN_X, E_SCREEN_Y, E_ATTR,
  E_X_HI, E_X_LO, E_Y_HI, E_Y_LO, E_VX, E_HP, E_JUMP_VEL, E_SPEED_CAP,
  E_PROBE_DX, E_PROBE_DY,
} from './enemies/record.js';
import {
  addX, addY, neg16q, absDiff8, playerScreenX, playerScreenY, requestSound,
} from './enemies/util.js';
import {
  probeCore, probeRight, probeLeft, probeUp, probeDown, attackProbe, wallAhead,
} from './enemies/probe.js';
import { queueDraw } from './enemies/anim.js';
import { riseTail, fallTail, screenTail } from './enemies/tails.js';
import { stDormant, attackTickDormant } from './enemies/states/dormant.js';
import { stChaser } from './enemies/states/chaser14.js';
import { stL6Vehicle, attackTickL6 } from './enemies/states/vehicle6.js';
import { stFlyer, attackTickFlyer } from './enemies/states/flyer.js';
import { stProjectile, spawnProjectile } from './enemies/states/projectile.js';
import { stL12, attackTickL12 } from './enemies/states/shooter12.js';
import { gapLeap, ledgeCheck } from './enemies/states/walkershared.js';
import {
  stWalker, stWalkerJump, attackTickWalkerJump,
} from './enemies/states/walker.js';
import { stBoss1, boss1Aim, attackTickBoss1 } from './enemies/bosses/boss1.js';

// The barrel's export surface, unchanged from before the split.
export { SLOTS, RECORD };
export { meleeHitTest } from './enemies/melee.js';
export { drawEnemies } from './enemies/anim.js';

/** Camera-relative windows. ROM: $60A9 (activate), sub_00_11A7 (despawn). */
const ACTIVATE_RANGE = 7;
const DESPAWN_RANGE = 9;
const DEATH_ROW = 0x21;

/**
 * State handlers at 1:$50D3 not yet ported. 1-3 cover every non-boss enemy
 * outside the boss levels; 11/12 are the projectile and the dormant shell the
 * ported states spawn into / wake from.
 *
 * All 13 states are now ported. State 5 (the level-6 vehicle target) is a
 * TRANSCRIPTION ONLY -- see its header -- because its X rides $FFCA/$FFCB,
 * which only level 6's unported sub_00_2CBE branch scrolls. The set is kept
 * (empty) because unit tests import it.
 */
export const UNIMPLEMENTED_STATES = new Set([]);

export function createEnemies() {
  return Array.from({ length: SLOTS }, () => new Uint8Array(RECORD));
}

/** ROM: sub_00_2889 block-copies count x 32 B straight into $C268. */
export function loadEnemies(state, records, count) {
  for (let i = 0; i < SLOTS; i++) {
    state.enemies[i].fill(0);
    if (i < count) state.enemies[i].set(records.subarray(i * RECORD, (i + 1) * RECORD));
  }
  // $0DC8-$0DCA rearms $C740 = $FF beside $C73E, and sub_00_29A5 wipes $C693
  // and the rest of the effect RAM, at exactly this point in level init. The
  // port hangs it off the enemy load because that is the level-init hook this
  // file already owns; src/level.js needs no change for it (see REPORT).
  resetEffects(state);
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

/**
 * ROM: sub_01_4E0C.
 *
 * The loop direction alternates with frame parity ($FFA7): even frames walk
 * slots 0->7, odd frames 7->0. That is not cosmetic -- it decides which enemy
 * wins when two would act on the same thing in one frame, and whether a
 * projectile spawned into slot 6 acts on its spawn frame or the next.
 */
export function updateEnemies(state) {
  if (!state.enemyDraws) state.enemyDraws = [];
  state.enemyDraws.length = 0;

  if (state.flow.bossMode) return bossIntroTick(state);   // $4E0C -> 1:$77BD

  const descending = state.parity !== 0;            // $4E13
  for (let n = 0; n < SLOTS; n++) {
    const slot = descending ? SLOTS - 1 - n : n;
    state.enemyCursor = slot;                       // $FFB3
    const r = state.enemies[slot];

    if ((r[E_FLAGS] & F_ACTIVE) === 0) { tryActivate(state, r); continue; }   // $4E27
    if (state.flow.paused || state.lagFrame) {      // $4E2C / $4E39
      screenTail(state, r);                         // -> loc_01_5CA8 directly
      continue;
    }

    if (shouldDespawn(state, r)) {                  // $4E4D -> sub_00_11A7
      r[E_FLAGS] &= ~F_ACTIVE;                      // $4E55: RES 7 only
      continue;
    }

    r[E_ATTR] = 0;                                  // $4E60: attr rebuilt per frame
    if (r[E_Y_HI] >= DEATH_ROW) {                   // $4E69: fell out
      if (killTail(state, r) === 'stop') return;
      continue;
    }
    if (r[E_HP] === 0) {                            // $4E75: HP gone
      // $4E7A: boss levels take the branch at $4E82 and spawn NOTHING. Only
      // an ordinary level drops anything, and only from HP reaching zero --
      // the fell-out-of-the-world arm above jumps straight past this.
      // MEASURED: levels 4, 8 and 11 leave the pool empty when their enemies
      // die; level 3 fills slot 0 the same frame.
      if (state.level.bossId === 0) {
        // $4E88: both spawners read the enemy's live position out of
        // +$0E..+$11 -- the copy at $4E88 stages it in $C744-$C747 for the
        // effect pool AND $C749-$C74C for the ballistic pool, so they land on
        // the same point.
        const ex = (r[E_X_HI] << 8) | r[E_X_LO], ey = (r[E_Y_HI] << 8) | r[E_Y_LO];
        // $4EA5: D = $97, E = $03. The old comment here said "purely visual",
        // and that was measured WRONG: $97 has bit 7 set and counter $17, so
        // doors.js's tickEffect fires the $13E6 one-shot -- cue $17 -- on the
        // effect's first tick. MEASURED (cuediff l3-heart, l3-batarang-kill):
        // the cartridge asks for 11 cues per run and the port asked for 10,
        // and the missing one is the explosion every kill makes.
        spawnEffect(state, ex, ey, 0x97, 0x03);     // $4EA9
        spawnDrop(state, ex, ey, 0xFF, 0x00, 0x00); // $4EAC/$4EB1: dir $FF, DE = 0
      }
      if (killTail(state, r) === 'stop') return;
      continue;
    }

    // loc_01_4F0E: hit-state prelude before the type dispatch.
    if (r[E_FLAGS] & F_DISABLED) {                            // $4F11: BIT 6
      if (killTail(state, r) === 'stop') return;
      continue;
    }
    if (r[E_FLAGS] & 0x04) { stunnedTick(state, r); continue; }     // $4F15: BIT 2
    if (r[E_FLAGS] & 0x18) { hitDispatch(state, r); continue; }     // $4F19 -> $60DD
    primaryDispatch(state, r);                                // $4F1E -> $50C3
  }
}

/**
 * ROM: loc_01_77BD - the level-14 ENTRANCE. While $C750 is nonzero the whole
 * enemy driver reroutes here, so the Joker and the chaser stay parked (their
 * blob flags are 0; tryActivate never runs). Three stages, all MEASURED on
 * the cartridge over a 400-frame idle boot of level 14:
 *
 *  - $C750 == 1: count $C741 down from $78; at 1, re-arm it to $3F, set
 *    $C750 = 2, park the window ($FFAD = $E4, $FFAC = 0) and stamp the
 *    PLAYER'S vy register with $10 -- the balloon reuses $FF87 as its
 *    vertical step counter, which is why the trace shows vy jump to 16 at
 *    f120 with the player still grounded.
 *  - $C750 == 2: a small path interpreter. START ($FFE2 bit 3 -- the
 *    NEWLY-PRESSED byte, so it is a press, not a hold) skips it. While
 *    vy != $10 every frame runs the RISE arm: balloon Y -= vy, vy--, wait 1.
 *    Otherwise, when the $C741 wait expires, the cursor ($C73F, the same
 *    byte the fights use as the crit flag) steps through 1:$7A41: top bits
 *    00 = wait (low6+4 frames), $40 = X += $40, $80 = X -= $40, $C0 = enter
 *    the rise arm. Cursor $19 or the START press ends it: $C750/$C741/
 *    $C73F/vy = 0, $C740 = $FF (damage re-enabled), window off ($FFAC=$90).
 *  - Each non-skip frame draws the balloon: world -> screen via sub_00_1172,
 *    pose 1:$7A5A[cursor] through the ALT table (sub_00_0BAF, attr 0), and
 *    when its screen X passes $80 the rise ends (vy = $10, Y-lo = 0).
 */
// 1:$7A41 and 1:$7A5A, 25 bytes each and adjacent in the ROM. Both throw
// rather than default: an empty path would park the balloon at the origin and
// an empty pose list would draw metasprite 0, neither of which looks broken.
function introTable(state, name) {
  const t = state.tables?.[name];
  if (!t) throw new Error(`enemies: tables.${name} missing from the manifest`);
  return t;
}

function bossIntroTick(state) {
  const f = state.flow;
  if (f.bossMode !== 2) {                           // $77BD: CP $02
    if (f.bossHop - 1 === 0) {                      // $77C4: DEC hits 1
      f.bossHop = 0x3F;                             // $77CB
      f.bossMode = 2;                               // $77D2
      // $77D5-$77DA: $FFAD = $E4, $FFAC = 0. $FFAD is rBGP's shadow, NOT an
      // object palette -- $0806-$0816 settles the mapping ($FFAB->rWX,
      // $FFAC->rWY, $FFAD->rBGP, $FFAE->rOBP0, $FFAF->rOBP1). Both halves are
      // modelled now. $0DFD sets BGP = $FF on level-14 init, blacking the
      // background out for the entrance (level.js's half), and THIS is what
      // restores $E4 when phase 2 starts.
      state.video.bgp = 0xE4;                       // $77D5: $FFAD
      state.video.windowY = 0;                      // $77D8: $FFAC
      // ...and the latch with it. drawWindow reads windowLatchY, never
      // windowY, so writing only the register left the shaft mask parked at
      // $90 and the renderer bailed on every frame of the entrance.
      state.video.windowLatchY = 0;
      state.player.vy = 0x10;                       // $77DC: $FF87
    } else {
      f.bossHop--;                                  // $77C7
      return;
    }
  }
  // $77E0: phase 2.
  if (state.input.pressed & 0x08) return bossIntroEnd(state);   // START skips
  if ((state.player.vy & 0xFF) !== 0x10) return introRise(state);   // $77E8
  f.bossHop = u8(f.bossHop - 1);                    // $77ED
  if (f.bossHop !== 0) return introDraw(state);     // $77F4
  const cur = u8(f.bossCrit + 1);                   // $77F7: $C73F++
  if (cur >= 0x19) return bossIntroEnd(state);      // $77FB: path done
  f.bossCrit = cur;                                 // $7815
  const op = introTable(state, 'introPath')[cur] & 0xC0;                // $781F
  if (op === 0xC0) return introRise(state);         // $782C (the else of $7828)
  if (op === 0x80) f.balloonX = u16(f.balloonX - 0x40);        // $785D
  else if (op === 0x40) f.balloonX = u16(f.balloonX + 0x40);   // $7858
  f.bossHop = (introTable(state, 'introPath')[cur] & 0x3F) + 4;         // $7871 (the moves fall in)
  return introDraw(state);                          // $7879
}

/**
 * ROM: loc_01_782C - the ballistic arc: Y += -(vy), vy--, wait 1. The
 * negate is CPL/INC with the RESULT's bit 7 deciding the sign extension, so
 * vy counting down through 0 into $FF/$FE... turns the rise into an
 * accelerating descent by pure byte wraparound (and vy exactly $80 would
 * extend "negative": kept faithfully).
 */
function introRise(state) {
  const vy = state.player.vy & 0xFF;
  const n = u8(~vy + 1);                            // $782C-$782F
  const delta = (n & 0x80) ? (0xFF00 | n) : n;      // $7831-$7839
  state.flow.balloonY = u16(state.flow.balloonY + delta);   // $783D-$7848
  // The port keeps p.vy signed while $FF87 is a raw byte; store the signed
  // reading so the traces compare (the & 0xFF at every read restores it).
  state.player.vy = i8(u8(vy - 1));                 // $784C: $FF87--
  state.flow.bossHop = 1;                           // $7851
  return introDraw(state);
}

/** ROM: loc_01_7879 - convert, edge-test, draw through the alt table. */
function introDraw(state) {
  const f = state.flow;
  const sx = u8((u16(f.balloonX - state.camera.x) >> 4) + 8);       // $7885
  const sy = u8((u16((f.balloonY & 0x0FFF) - state.camera.y) >> 4) + 0x10);
  // $7888: LD A,B -- and sub_00_1172 returns B = screen Y (the same store
  // order screenTail uses at $5CB8). When the ballistic arc brings the
  // balloon down past screen Y $81, the bob restarts: vy back to $10, Y-lo
  // zeroed. Testing screen X here instead diverged the 900-frame run at
  // f375 on exactly vy.
  if (sy >= 0x81) {                                 // $7889
    state.player.vy = 0x10;                         // $788D
    f.balloonY = f.balloonY & 0xFF00;               // $7892: $FFBD = 0
  }
  state.enemyDraws.push({ id: introTable(state, 'introPoses')[f.bossCrit], x: sx, y: sy,
                          attr: 0, alt: true });    // $7894-$78A0: 0BAF
  state.video.windowY = 0;                          // $78A4: $FFAC = 0
  state.video.windowLatchY = 0;                     // the field drawWindow reads
}

/** ROM: loc_01_77FF - the entrance (or its skip) hands control to gameplay. */
function bossIntroEnd(state) {
  const f = state.flow;
  state.video.windowY = 0x90;                       // $7810-$7812: window off
  state.video.windowLatchY = 0x90;
  f.bossHop = 0;                                    // $7802: $C741
  f.bossCrit = 0;                                   // $7805: $C73F
  f.bossMode = 0;                                   // $7808: $C750
  state.player.vy = 0;                              // $7800: $FF87
  // $780B: $C740 = $FF. That re-enables melee and batarang damage AND brings
  // the HUD back -- both main-loop arms open with `CP $FF` ($0567/$05D9) --
  // so it has to clear the entrance latch itself rather than lean on $C750.
  effects(state).entranceHold = 0;                  // $780B
}

/**
 * ROM: loc_01_6094.
 *
 * Activation is a pure camera-distance test on the HIGH bytes, with two
 * gates: bit 6 marks an enemy permanently dead, and a subtype of 1 additionally
 * demands the camera land on an exact column, so those spawn on a precise
 * scroll position rather than anywhere in the window.
 */
function tryActivate(state, r) {
  const xhi = r[E_X_HI];
  if (xhi === 0) return;                            // $609B

  const camCol = u8((state.camera.x >> 8) + 5);     // $60A0
  if (absDiff8(camCol, xhi) >= ACTIVATE_RANGE) return;    // $60A9
  if (r[E_FLAGS] & F_DISABLED) return;              // $60AF: BIT 6
  if (r[1] === 0x01) {                              // $60B5
    // $60BC: only when the enemy's column equals camera - 2, exactly.
    if (xhi !== u8((state.camera.x >> 8) - 2)) return;
  }
  r[E_FLAGS] |= F_ACTIVE;                           // $60C5: SET 7
}

/**
 * ROM: sub_00_11A7 - the despawn window is wider than the activation one, and
 * tests ONLY the X distance; falling out of the world is the driver's separate
 * $4E69 check (which disables permanently, where this one merely deactivates).
 */
function shouldDespawn(state, r) {
  const camCol = u8((state.camera.x >> 8) + 5);
  return absDiff8(camCol, r[E_X_HI]) >= DESPAWN_RANGE;
}

/**
 * ROM: loc_01_4EB8 -- every death funnels through here, and it is NOT just a
 * flag write. The port treated it as one for a long time, which is why no
 * boss death ever raised a level clear.
 *
 * The arm, in the cartridge's order:
 *
 *   $4EB8  $C740 != $FF        -> JP $78CC, the post-death countdown
 *   $4EC0  flags = (f & $43) | $40
 *   $4EC8  state == $0B        -> done (a projectile just disappears)
 *   $4ECE  $C73E == 0          -> done (ordinary level: nothing more to do)
 *   $4ED5  flags & $03         -> re-ACTIVATE and keep dispatching
 *   $4EE0  otherwise: this was the boss, and the level is over
 *
 * The `flags & $03` arm is the subtle one and it is why the old level-clear
 * stopgap had to warn about it: a boss killed in mid-air still has its
 * rising/falling bit set, so the cartridge puts bit 7 back and runs the state
 * machine again -- the death does not "take" until it lands. Short-circuiting
 * there leaves a dead boss latched airborne and the clear never fires.
 *
 * @returns 'done' | 'dispatch' | 'countdown' -- what the caller should do next.
 */
function kill(state, r) {
  // $4EB8: `LD A,[$C740] / CP $FF / JP NZ, loc_01_78CC`. Once a boss has died
  // EVERY enemy that reaches the kill path reroutes into the countdown -- and
  // the countdown decrements $C740 once per enemy that gets there, which is
  // why the measured trace shows exactly one step per frame on the boss levels
  // (the boss is the only record that ever arrives).
  if (effects(state).countdown !== COUNTDOWN_IDLE) return 'countdown';

  r[E_FLAGS] = (r[E_FLAGS] & 0x43) | F_DISABLED;    // $4EC0

  if (r[E_STATE] === 0x0B) return 'done';           // $4EC8: projectiles
  if (state.level.bossId === 0) return 'done';      // $4ECE: $C73E

  if (r[E_FLAGS] & 0x03) {                          // $4ED5: still airborne
    r[E_FLAGS] |= 0x80;                             // $4EDA: back to active
    return 'dispatch';                              // $4EDD: JP loc_01_50C3
  }

  // $4EE0 -- the boss is down.
  // $4EE6: BC = $0104, so sound id $01 with mask $04, the FADE-OUT mask. The
  // music does not stop, it fades. Level 6 is excluded ($4EE2: CP $06).
  if (state.level.number !== 0x06) requestSound(state, 0x01, 0x04);
  r[E_FLAGS] = 0x81;                                // $4EEC
  // $4EF1: $C740 = $FE. NOT the level clear -- that is another ~630 frames
  // away, through 1:$78CC's 254-frame explosion burst and loc_00_34D0's
  // fanfare. flow.levelCleared is raised at the far end of both, in
  // effects.js's updateVictoryHold, which is the port's loc_00_35E8.
  effects(state).countdown = COUNTDOWN_START;
  effects(state).explosion = 0;                     // $4EF8: $C713 = 0
  state.player.iframes = 0;                         // $4EF5: $C714
  if (state.level.bossId === 0x02) {                // $4EFB: boss 2's two parts
    state.enemies[1][0] = 0x40;                     // $4F05: $C288
    state.enemies[2][0] = 0x40;                     // $4F08: $C2A8
  }
  return 'done';
}

/**
 * The three $4E69/$4E75/$4F11 arms all end in the same `JP loc_01_4EB8`, so
 * they share this tail.
 *
 * The countdown's two halves do NOT end the same way, and it matters:
 * 1:$78CC's first half falls out at `JP loc_01_5CA8` (the screen tail, so the
 * cached +7/+8 keep tracking), while 1:$7936's second half ends at
 * `JP loc_01_60C7` (the loop continuation) and leaves them stale. And when the
 * countdown hits zero it jumps into loc_00_34D0, whose `RET` unwinds past the
 * whole driver -- no further slot is walked that frame.
 *
 * @returns 'stop' when the enemy loop must end for this frame
 */
function killTail(state, r) {
  const what = kill(state, r);
  if (what === 'dispatch') { primaryDispatch(state, r); return 'next'; }
  if (what !== 'countdown') return 'next';
  const where = bossCountdownTick(state, r);
  if (where === 'victory') {
    victoryStep(state);                             // $793A / $7959
    return 'stop';                                  // loc_00_34D0 ends in RET
  }
  if (where === 'screen') screenTail(state, r);     // $78E0 / $7933
  return 'next';                                    // $7981/$799F/$79D8
}

/** ROM: loc_01_50C3, table 1:$50D3, indexed on state-1. */
function primaryDispatch(state, r) {
  switch (r[E_STATE]) {
    case 1: return stWalker(state, r);              // 1:$50ED
    case 2: return stWalkerJump(state, r);          // 1:$5399
    case 3: return stFlyer(state, r);               // 1:$55AA
    case 4: return stChaser(state, r);              // 1:$7750
    case 5: return stL6Vehicle(state, r);           // 1:$575C
    case 6: return stL12(state, r);                 // 1:$57D6
    case 7: return stBoss2(state, r);               // 1:$6D8A
    case 8: return stBoss3(state, r);               // 1:$7061
    case 9: return stBoss4(state, r);               // 1:$7288
    case 0x0A: return stBoss1(state, r);            // 1:$7591
    case 0x0B: return stProjectile(state, r);       // 1:$59E0
    case 0x0C: return stDormant(state, r);          // 1:$5B95
    case 0x0D: return stBoss2Part(state, r);        // 1:$78A7
    // NOTE: no screenTail here, so an enemy in one of the unported states
    // keeps STALE +7/+8 screen bytes indefinitely -- and both hit scans now
    // compare against exactly those. The old world-space tests were immune to
    // this. Latent (boss levels only) until states 4-9/13 land.
    default: return;                                // see UNIMPLEMENTED_STATES
  }
}

// ---------------------------------------------------------------------------
// Hit reaction: stun countdown and the secondary dispatch
// ---------------------------------------------------------------------------

/**
 * ROM: loc_01_4F21. Runs instead of the type dispatch while bit 2 (hit-flash)
 * is set. The stun timer starts at $3C; the two frames at $3B/$3A BOTH re-arm
 * the knockback (the CP $3A gate is >=, not ==), after which the enemy runs
 * its normal handler while blinking until the timer expires.
 */
function stunnedTick(state, r) {
  if (r[0x17] === 0) return stunExpired(state, r);  // $4F27
  const t = u8(r[0x17] - 1);
  r[0x17] = t;
  if (t < 0x3A) {                                   // $4F2E -> loc_01_503D
    if (r[E_FLAGS] & 0x18) return hitDispatch(state, r);
    return primaryDispatch(state, r);
  }
  const st = r[E_STATE];                            // $4F35
  if (st === 5) {                                   // $4F7C: vehicle target
    r[E_FLAGS] &= 0xC5;
    return primaryDispatch(state, r);
  }
  if (st === 7 || st === 9 || st === 0x0A) return bossKnockback(state, r); // $4F84
  if (st === 8) return boss3Knockback(state, r);    // $4FF5
  // $4F4B: walkers / flyers / projectiles bounce up and away from the player.
  r[0x13] = 0x18;
  r[E_VX] = playerScreenX(state) >= r[E_SCREEN_X] ? 0xF0 : 0x10;   // $4F59
  r[E_FLAGS] = (r[E_FLAGS] & 0xC5) | 0x01;          // $4F6A: rising
  r[1] &= 0x9F;                                     // $4F70
  // $4F76: $C73F (boss-3 helper flag) = 0 -- not modelled.
  return primaryDispatch(state, r);
}

/** ROM: loc_01_4F84 - bosses 2/4/L14-chaser knockback (+ hard-mode counter). */
function bossKnockback(state, r) {
  r[0x13] = 0x10;
  const xhi = r[E_X_HI];                            // $4F91: arena walls
  if (xhi === 0x0A) r[E_VX] = 0xF0;
  else if (xhi === 0x01) r[E_VX] = 0x10;
  else r[E_VX] = playerScreenX(state) >= r[E_SCREEN_X] ? 0xF0 : 0x10;
  r[E_FLAGS] = (r[E_FLAGS] & 0xC5) | 0x01;
  r[1] &= 0x9F;
  // $4FCA: the knockback cancels the $C741 spin/patience counter. Verified
  // by l8-boss2-batarang-spin: a punch landing mid-spin zeroes it instantly
  // on the cartridge (f138), it does not run down.
  state.flow.bossHop = 0;
  if (state.flow.difficulty === 2) {                // $4FCD: retaliate on hard
    r[E_FLAGS] |= 0x08;
    r[E_FACING] = playerScreenX(state) < r[E_SCREEN_X] ? 1 : 0;     // $4FDE
    r[0x14] = 0x1F;                                 // $4FED
  }
  return primaryDispatch(state, r);
}

/** ROM: loc_01_4FF5 - boss 3 variant (X hi >= 9 counts as the right wall). */
function boss3Knockback(state, r) {
  r[0x13] = 0x10;
  const xhi = r[E_X_HI];
  if (xhi >= 0x09) r[E_VX] = 0xF0;                  // $5003
  else if (xhi === 0x01) r[E_VX] = 0x10;
  else r[E_VX] = playerScreenX(state) >= r[E_SCREEN_X] ? 0xF0 : 0x10;
  r[E_FLAGS] = (r[E_FLAGS] & 0xC5) | 0x01;
  r[1] &= 0x9F;
  return primaryDispatch(state, r);
}

/** ROM: loc_01_5049 - the stun timer just expired. */
function stunExpired(state, r) {
  const bid = state.level.bossId;                   // $C73E
  if (bid === 2 || bid === 4) {                     // $505A
    r[E_FACING] = playerScreenX(state) < r[E_SCREEN_X] ? 1 : 0;
    r[E_FLAGS] = (r[E_FLAGS] & 0xC3) | 0x10;
    r[0x14] = 0x1F;
    return riseTail(state, r);
  }
  if (bid === 3) {                                  // $5080
    r[0x14] = 0x1F;
    r[E_FACING] = playerScreenX(state) < r[E_SCREEN_X] ? 1 : 0;     // $508E (SUB-based, same test)
    r[E_VX] = (r[E_FACING] & 1) ? 0xCC : 0x34;      // $50A1
    r[E_FLAGS] = (r[E_FLAGS] & 0xC3) | 0x08;
    // $50B0: the retaliation IS the crit lunge -- attackTickBoss3 reads this
    // and runs the decaying-velocity dash. Verified by l11-boss3-punch: the
    // f188 divergence before this write was modelled was exactly bossCrit,
    // and the observed vx $CD is $CC plus one $6280 increment.
    state.flow.bossCrit = 1;
    requestSound(state, 0x2D);
    return primaryDispatch(state, r);               // $50BB
  }
  r[E_FLAGS] &= ~0x04;                              // $50C1
  return primaryDispatch(state, r);
}

/** ROM: loc_01_60DD, table 1:$60EF -- runs while bits 3/4 (attack) are set. */
function hitDispatch(state, r) {
  switch (r[E_STATE]) {
    case 1: case 4: case 0x0B: return attackTickBasic(state, r);   // jt_01_6107
    case 2: return attackTickWalkerJump(state, r);                 // jt_01_612E
    case 3: return attackTickFlyer(state, r);                      // jt_01_6169
    case 5: return attackTickL6(state, r);                         // jt_01_6398
    case 6: return attackTickL12(state, r);                        // jt_01_61B3
    case 7: return attackTickBoss2(state, r);                      // jt_01_61DD
    case 8: return attackTickBoss3(state, r);                      // jt_01_621F
    case 9: return attackTickBoss4(state, r);                      // jt_01_6300
    case 0x0A: return attackTickBoss1(state, r);                   // jt_01_634F
    case 0x0C: return attackTickDormant(state, r);                 // jt_01_637F
    default: return;
  }
}

/** ROM: jt_01_6107 - hold the attack pose, probing the player every frame. */
function attackTickBasic(state, r) {
  if (r[0x14] !== 0) {
    r[0x14]--;
    attackProbe(state, r);                          // $6118 -> sub_01_6616
    return riseTail(state, r);
  }
  state.flow.bossCrit = 0;                          // $6121: $C73F = 0
  r[E_FLAGS] &= 0xC7;
  return riseTail(state, r);
}

// ---------------------------------------------------------------------------
// State 7 -- Boss 2 (level 8).  ROM: jt_01_6D8A.
//
// A walker-shaped boss with boss 1's hop launcher (shorter wind-up: 8 frames
// against $0F) and a sustained swing: the attack tick re-arms its own timer
// to $28 on every MISSED probe, so the attack holds until it connects. The
// enrage at HP < $0E is the show piece -- it boosts the jump velocity/walk
// cap to $38/$14 and turns slots 1/2 into state-13 AFTERIMAGES, fed a
// snapshot of the boss's +6/+7/+8 draw bytes every 8th frame through a
// two-stage history chain, drawn on alternating parity frames.
//
// A batarang on a GROUNDED boss 2 does no damage but starts the $C741 spin
// (batarang.js $3CA0); the handler head counts it down and the $5D20 special
// draw shows the spin pose. Airborne, the same batarang takes the ordinary
// 1-damage arm -- the armor only works with feet on the ground.
// ---------------------------------------------------------------------------

function stBoss2(state, r) {
  if (!state.flow.bossRage) {                       // $6D8C
    if (r[E_HP] < 0x0E && state.flow.difficulty !== 0) {   // $6D97-$6D9F
      state.flow.bossRage = 1;                      // $6DA3
      r[E_JUMP_VEL] = 0x38;                         // $6DAC: jump velocity
      r[E_SPEED_CAP] = 0x14;                        // $6DAF: walk cap
      state.enemies[1][0] = 0x80;                   // $6DB4
      state.enemies[2][0] = 0x81;                   // $6DB9
      state.enemies[1][2] = 0x0D;                   // $6DBE: state 13
      state.enemies[2][2] = 0x0D;
      state.enemies[1][0x16] = 0xFF;                // $6DC6
      state.enemies[2][0x16] = 0xFF;
    }
  } else if ((state.frame & 0x07) === 0) {          // $6DCC: afterimage chain
    const s1 = state.enemies[1], s2 = state.enemies[2];
    s2[6] = s1[6]; s2[E_SCREEN_X] = s1[E_SCREEN_X]; s2[E_SCREEN_Y] = s1[E_SCREEN_Y];    // $6DD2-$6DE1
    s1[6] = r[6]; s1[E_SCREEN_X] = r[E_SCREEN_X]; s1[E_SCREEN_Y] = r[E_SCREEN_Y];       // $6DE4-$6DF1
  }
  if (state.flow.bossHop !== 0) {                   // $6DF4: the spin-freeze
    state.flow.bossHop--;
    return fallTail(state, r);                      // $6E00
  }
  if (r[E_FLAGS] & 0x07) {                          // $6E05-$6E0F
    const v = r[E_VX];
    return (v & 0x80) ? boss2MoveLeft(state, r, v) : boss2MoveRight(state, r, v);
  }
  if (r[E_FLAGS] & 0x18) return riseTail(state, r);       // $6E2D
  if (r[1] & 0x10) {                                // $6E34: committed walk
    if (r[0x15] === 0) { r[1] &= ~0x10; return riseTail(state, r); }  // $6F51
    r[0x15]--;                                      // $6F41
    return r[E_FACING] === 0 ? boss2WalkRight(state, r) : boss2WalkLeft(state, r);
  }
  if (r[1] & 0x60) {                                // $6E39/$6E3E: mid-anim
    r[E_FLAGS] &= ~0x20;                            // $6F34
    return riseTail(state, r);
  }
  return boss2Bands(state, r);                      // $6E43
}

/**
 * ROM: loc_01_6E43. Also RE-ENTERED IN THE AIR: an unobstructed airborne
 * step comes back here ($7048 -> $7057), which is how the hop can turn into
 * the swing mid-flight; the ad >= $1F arm bails to the tails while airborne
 * ($6E5C -> $705D), so only the close band acts then.
 */
function boss2Bands(state, r) {
  const psx = playerScreenX(state);                 // $6E48
  const diff = u8(psx - r[E_SCREEN_X]);
  if (diff === 0) return boss2MirrorPause(state, r);   // $6E4B -> $6F5C
  const playerLeft = psx < r[E_SCREEN_X];
  const ad = playerLeft ? u8(-diff) : diff;

  if (ad >= 0x1F) {                                 // $6E53
    if (r[E_FLAGS] & 0x03) return riseTail(state, r);     // $6E5C-$6E63 -> $705D
    if (ad < 0x30) return boss2Walk(state, r, playerLeft);   // $6E6A
    // $6E6E-$6E76 is a REGISTER CLOBBER, reproduced rather than fixed. A is the
    // absolute distance every CP in this ladder reads, and $6E72 overwrites it
    // with the $C73D byte. When that byte is non-zero, $6E76's `JR NZ` re-enters
    // the ladder at $6E8C carrying a 1 -- so `CP $50` sets carry, $6E8E's
    // `JR NC` is never taken, and the enraged FAR band falls to the HOP. The
    // throw at $6E9F is reachable ONLY from ad in [$50,$70). MEASURED
    // (armhits.py, l8-boss2-engage @ $C756=2): $6E78 far-idle 0x, $6E97 hop-arm
    // fires, and every $6EA5 throw comes from the legitimate band.
    let band = ad;
    if (ad >= 0x70) {
      if (!state.flow.bossRage) {                   // $6E76: JR NZ not taken
        r[E_FACING] = playerLeft ? 1 : 0;           // $6E78-$6E82: far idle
        r[E_FLAGS] |= 0x20;                         // $6E87
        return fallTail(state, r);                  // $6E89
      }
      band = u8(state.flow.bossRage);               // $6E72: A := [$C73D]
    }
    if (band < 0x50) {                              // $6E8C: [$30,$50), or far
      if (!state.flow.bossRage) return boss2Walk(state, r, playerLeft);  // $6E94
      return boss2Hop(state, r);                    // $6E97 -> $6FC4
    }
    // $6E9F: [$50,$70) and nothing else.
    if (!state.flow.bossRage) return boss2Walk(state, r, playerLeft);    // $6EA3
    r[E_FACING] = playerLeft ? 1 : 0;               // $6EA5-$6EAF: the throw
    if ((r[E_FLAGS] & 0x10) === 0) {                // $6EB1
      r[E_FLAGS] = (r[E_FLAGS] & ~0x20) | 0x10;     // $6EB7/$6EB9
      r[0x14] = 0x1F;                               // $6EBE
    }
    return fallTail(state, r);                      // $6EC4
  }
  // Close band, ad < $1F:
  if (ad < 8) return boss2MirrorPause(state, r);    // $6ED8
  if (absDiff8(playerScreenY(state), r[E_SCREEN_Y]) >= 0x20) {   // $6EE0-$6EEA
    if (r[E_FLAGS] & 0x03) return riseTail(state, r);     // $6EEE-$6EF5
    return boss2Walk(state, r, playerLeft);         // $6EF7 -> $6EC7
  }
  if (state.player.iframes !== 0) return boss2MirrorPause(state, r);   // $6EFF
  if (r[E_FLAGS] & 0x18) return riseTail(state, r);       // $6F09-$6F0C
  requestSound(state, 0x1C);                        // $6F10
  r[E_FLAGS] |= 0x08;                               // $6F16
  r[E_FACING] = playerLeft ? 1 : 0;                 // $6F1C-$6F24
  r[0x14] = 0x1F;                                   // $6F29
  r[E_FLAGS] &= ~0x20;                              // $6F2E
  return riseTail(state, r);                        // $6F30
}

/** ROM: loc_01_6EC7 - clear idle, walk toward the player. */
function boss2Walk(state, r, playerLeft) {
  r[E_FLAGS] &= ~0x20;                              // $6ECB
  return playerLeft ? boss2WalkLeft(state, r) : boss2WalkRight(state, r);
}

/** ROM: loc_01_6F5C - dead zone: commit for $30 frames, facing the player's
 *  mirror ($FF88 XOR 1). Airborne it just runs the tails. */
function boss2MirrorPause(state, r) {
  if (r[E_FLAGS] & 0x03) return riseTail(state, r);       // $6F5D-$6F63
  r[1] = (r[1] & 0xF3) | 0x10;                      // $6F6E-$6F72
  r[E_FACING] = state.player.facing ^ 1;            // $6F76
  r[0x15] = 0x30;                                   // $6F7F
  return riseTail(state, r);
}

/** ROM: loc_01_6F87/$6F8C - walker-idiom acceleration toward the +$1D cap. */
function boss2WalkRight(state, r) {
  r[E_FACING] = 0;                                  // $6F8A
  let v = r[E_VX];
  if (v & 0x80) {                                   // $6F91 -> $6FEA
    v = u8(v + 2);
    r[E_VX] = v;
    return (v & 0x80) ? boss2MoveLeft(state, r, v) : boss2MoveRight(state, r, v);
  }
  const max = r[E_SPEED_CAP];                       // $6F98-$6FA4
  v = v + 1 < max ? v + 1 : max;
  r[E_VX] = v;
  return boss2MoveRight(state, r, v);
}

/** ROM: loc_01_6FF5/$6FFB - mirror. */
function boss2WalkLeft(state, r) {
  r[E_FACING] = 1;                                  // $6FF8
  let v = r[E_VX];
  if (v !== 0 && (v & 0x80) === 0) {                // $7000-$7005
    v = u8(v - 2);                                  // $703D
    r[E_VX] = v;
    return (v & 0x80) ? boss2MoveLeft(state, r, v) : boss2MoveRight(state, r, v);
  }
  const min = u8(-r[E_SPEED_CAP]);                  // $7008-$701B
  v = u8(v - 1);
  if (v < min) v = min;
  r[E_VX] = v;
  return boss2MoveLeft(state, r, v);
}

/** ROM: loc_01_6FAC - a wall makes it JUMP (snap $80, vel 0, hop launcher);
 *  an open airborne step re-enters the band logic. */
function boss2MoveRight(state, r, v) {
  addX(r, i8(v));
  if (probeRight(state, r) !== 0) {                 // $6FAF
    r[E_X_LO] = 0x80;                               // $6FB7
    r[E_VX] = 0;                                    // $6FBF
    return boss2Hop(state, r);                      // falls into $6FC4
  }
  return boss2AirRecheck(state, r);                 // $7048
}

/** ROM: loc_01_7023 - mirror (same $80 snap). */
function boss2MoveLeft(state, r, v) {
  addX(r, i8(v));
  if (probeLeft(state, r) !== 0) {                  // $7026
    r[E_X_LO] = 0x80;                               // $702E
    r[E_VX] = 0;
    return boss2Hop(state, r);
  }
  return boss2AirRecheck(state, r);
}

/** ROM: loc_01_7048 - the airborne band re-entry. */
function boss2AirRecheck(state, r) {
  if (r[E_FLAGS] & 0x03) return boss2Bands(state, r);     // $704C-$7052 -> $6E43
  return riseTail(state, r);                        // $7054
}

/** ROM: loc_01_6FC4 - boss 1's hop launcher with an 8-frame wind-up. */
function boss2Hop(state, r) {
  r[E_FLAGS] &= ~0x18;                              // $6FC6/$6FC8
  if (r[E_FLAGS] & 0x01) return riseTail(state, r);       // $6FCA
  if (r[E_FLAGS] & 0x02) return fallTail(state, r);       // $6FCF
  r[1] |= 0x40;                                     // $6FD5
  boss1Aim(state, r);                               // $6FDC -> sub_01_79DB
  r[0x18] = 0x08;                                   // $6FE3
  return riseTail(state, r);
}

/**
 * ROM: jt_01_61DD - boss 2's attack tick. Every tick whose timer is not 7
 * probes, and a MISS queues a $28-frame COMMITTED walk for afterwards --
 * r[1] bit 4 plus the +$15 timer ($61FB adds $14 to HL at +1, so the store
 * at $6206 lands on +$15, NOT the attack timer; MEASURED on the cartridge:
 * the re-arm hook fires every missed frame while +$14 keeps counting 30, 29,
 * 28...). Timer 7 fires the mode-3 projectile if the ranged bit is up.
 * Falls through to the full handler like the others.
 */
function attackTickBoss2(state, r) {
  if (r[0x14] === 0) {                              // $61E5 -> loc_01_6121
    state.flow.bossCrit = 0;
    r[E_FLAGS] &= 0xC7;
    return riseTail(state, r);
  }
  r[0x14]--;                                        // $61E8
  if (r[0x14] === 7) {                              // $61EA
    if (r[E_FLAGS] & 0x10) spawnProjectile(state, r, 3);  // $620E-$6219
  } else if (attackProbe(state, r) !== 0xFF) {      // $61F3-$61F9
    r[1] |= 0x10;                                   // $61FF
    r[0x15] = 0x28;                                 // $6206: +$15, see above
  }
  return stBoss2(state, r);                         // $6209 -> $6D8A
}

// ---------------------------------------------------------------------------
// State 13 -- boss 2's afterimages (slots 1/2).  ROM: jt_01_78A7.
//
// No physics at all: the record's +6/+7/+8 are written by stBoss2's history
// chain, and this handler only draws them -- slot flags bit 0 picks which
// PARITY of frames the image appears on, which is the flicker. Note the draw
// does NOT go through screenTail, so nothing here recomputes +7/+8.
// ---------------------------------------------------------------------------

function stBoss2Part(state, r) {
  const odd = state.parity !== 0;                   // $FFA7
  if ((r[E_FLAGS] & 0x01) === 0 ? odd : !odd) return;     // $78A9-$78B8
  queueDraw(state, r[6], r, 0, false);              // $78BB-$78C6: sub_00_0BC6
}

// ---------------------------------------------------------------------------
// State 9 -- Boss 4, the Joker (level 14).  ROM: jt_01_7288.
//
// Boss 2's walker skeleton with a two-PHASE fight driven by $C73D (the same
// byte the other bosses use as the enrage latch): phase 1 until HP < $18,
// then a one-shot stagger -- music stopped (sound 1 mask 4), pose forced
// idle, $C73D loaded as a ~$EF-frame countdown -- and at its end sound 6
// mask 3 (the phase-2 theme) with $C73D parked at 1 for the rest of the
// fight. Phase 2 throws (bit 4) from most bands and even mid-air whenever
// the PLAYER is airborne ($72EB reads $FF80). The walk rewrites its own
// speed cap by distance ($14 close, 6 far) and mirrors the L14 chaser
// through r[1] bit 7: latched, it walks AWAY, laughing every 16th frame
// (sound $2A). $C741 doubles as a per-band pose flag here (0/1), which is
// safe -- level 14 has no $C741 special draw.
// ---------------------------------------------------------------------------

function stBoss4(state, r) {
  const f = state.flow;
  if (f.bossRage >= 2) {                            // $728D: mid-stagger
    const a = u8(f.bossRage - 1);                   // $72BB
    if (a !== 1) { f.bossRage = a; return riseTail(state, r); }   // $72C0
    f.bossRage = 1;                                 // $72C8: phase 2 begins
    requestSound(state, 0x06, 0x03);                // $72CB
    return boss4Throw(state, r, playerScreenX(state) < r[E_SCREEN_X]);   // $72D1
  }
  if (r[E_HP] < 0x18 && f.bossRage === 0) {         // $7296-$729E: the stagger
    requestSound(state, 0x01, 0x04);                // $72A0: stop the music
    r[E_FLAGS] = (r[E_FLAGS] & 0xE3) | 0x20;        // $72A9-$72AD
    r[0x14] = 0;                                    // $72B2
    // $72B6 stores $F0 and FALLS INTO $72BB, whose DEC runs the same frame.
    f.bossRage = 0xEF;
    return riseTail(state, r);
  }
  if (r[E_FLAGS] & 0x07) {                          // $72DF-$72E9
    // $72EB: phase 2, player airborne, own attack bits clear: throw NOW.
    if (f.bossRage === 1 && state.player.air !== 0 && (r[E_FLAGS] & 0x18) === 0) {
      return boss4Throw(state, r, playerScreenX(state) < r[E_SCREEN_X]);   // $72FC
    }
    const v = r[E_VX];                              // $7308
    return (v & 0x80) ? boss4MoveLeft(state, r, v) : boss4MoveRight(state, r, v);
  }
  if (r[E_FLAGS] & 0x18) return riseTail(state, r);       // $7324
  if (r[1] & 0x10) {                                // $732B: committed walk
    if (r[0x15] === 0) { r[1] &= ~0x10; return riseTail(state, r); }  // $74A5
    r[0x15]--;                                      // $7495
    return r[E_FACING] === 0 ? boss4WalkRightAccel(state, r) : boss4WalkLeftAccel(state, r);
  }
  if (r[1] & 0x60) {                                // $7330/$7335: mid-anim
    r[E_FLAGS] &= ~0x20;                            // $7488
    return riseTail(state, r);
  }

  const psx = playerScreenX(state);                 // $733E
  const diff = u8(psx - r[E_SCREEN_X]);
  if (diff === 0) return boss4MirrorPause(state, r);   // $7342 -> $74B0
  const playerLeft = psx < r[E_SCREEN_X];
  const ad = playerLeft ? u8(-diff) : diff;

  if (ad < 0x18) {                                  // $734A: close band
    if (ad < 8) return boss4MirrorPause(state, r);  // $7437-$743C
    if (absDiff8(playerScreenY(state), r[E_SCREEN_Y]) >= 0x20) {   // $7442-$7449
      return riseTail(state, r);                    // $744D (no walk!)
    }
    if (state.player.iframes !== 0) return boss4MirrorPause(state, r);  // $7453
    if (r[E_FLAGS] & 0x18) return riseTail(state, r);     // $745F
    requestSound(state, 0x1C);                      // $7464
    r[E_FLAGS] |= 0x08;                             // $746A
    r[E_FACING] = playerLeft ? 1 : 0;               // $7470-$7478
    r[0x14] = 0x1F;                                 // $747D
    r[E_FLAGS] &= ~0x20;                            // $7482
    return riseTail(state, r);
  }
  if (ad < 0x30) return boss4Walk(state, r, playerLeft, ad);   // $734F
  // $7354-$735C is the SAME clobber as boss 2's $6E6E-$6E76, and phase 2 has no
  // difficulty gate ($7296), so this is ordinary endgame play rather than a
  // hard-mode corner. $7358 replaces the distance in A with the $C73D byte --
  // which $72C8 parks at exactly 1 for the whole of phase 2 -- and $735C's
  // `JR NZ` enters the ladder at $7372 with it. `CP $40` therefore carries,
  // $7374's `JR NC` is not taken, $7376's rage test passes, and the far band
  // HOPS. MEASURED (boss4phase2.py): $7354 -> $735C -> $7372 -> $737D -> $7506
  // at ad = $61, with every throw arm ($7385/$73AB/$738D) 0x from this entry.
  let band = ad;
  if (ad >= 0x60) {
    if (!f.bossRage) {                              // $735C: JR NZ not taken
      r[E_FACING] = playerLeft ? 1 : 0;             // $735E-$7368: far idle
      r[E_FLAGS] |= 0x20;                           // $736D
      return fallTail(state, r);                    // $736F
    }
    band = u8(f.bossRage);                          // $7358: A := [$C73D]
  }
  if (band < 0x40) {                                // $7372: [$30,$40), or far
    if (!f.bossRage) return boss4Walk(state, r, playerLeft, ad);  // $7376
    return boss4Hop(state, r);                      // $737D -> $7506
  }
  if (band < 0x50) {                                // $7385: [$40,$50)
    if (f.bossRage) return boss4Throw(state, r, playerLeft);      // $73AB
    return boss4Walk(state, r, playerLeft, ad);
  }
  // $7389: [$50,$60) and nothing else.
  if (f.bossRage) return boss4Throw(state, r, playerLeft);        // $738D
  f.bossHop = 1;                                    // $738F: $C741
  r[E_FLAGS] &= 0xDF;                               // $7398-$739B
  if (playerLeft) {                                 // $739C: RETREAT at 6
    r[E_VX] = 0x06;                                 // $739F
    return boss4MoveRight(state, r, 0x06);          // $73A2 -> $74E9
  }
  r[E_VX] = 0xFA;                                   // $73A5
  return boss4MoveLeft(state, r, 0xFA);             // $73A8 -> $755E
}

/** ROM: loc_01_73B1 - the throw: face the player, roll the rLY crit exactly
 *  like boss 1's hop (measured reduction: crit <=> $FFB1 < $80), and hold
 *  the ranged pose $3F (crit, sound $29) or $1F frames. */
function boss4Throw(state, r, playerLeft) {
  r[E_FACING] = playerLeft ? 1 : 0;                 // $73B3-$73BB
  if (state.frame < 0x80) state.flow.bossCrit = 1;  // $73BC-$73C8: rLY roll
  r[E_FLAGS] = (r[E_FLAGS] & ~0x20) | 0x10;         // $73CD/$73CF
  if (state.flow.bossCrit) {                        // $73D5
    requestSound(state, 0x29);                      // $73DB
    r[0x14] = 0x3F;                                 // $73E1
  } else {
    r[0x14] = 0x1F;                                 // $73E5
  }
  return riseTail(state, r);                        // $73EA
}

/** ROM: loc_01_73ED - walk toward (or away on the r[1] bit-7 latch), with
 *  the distance-dependent speed cap and the $C741 pose flag. */
function boss4Walk(state, r, playerLeft, ad) {
  if (ad >= 0x30) { r[E_SPEED_CAP] = 0x06; state.flow.bossHop = 0; }  // $73F3-$73FF
  else { r[E_SPEED_CAP] = 0x14; state.flow.bossHop = 1; }      // $7401-$7408
  r[E_FLAGS] &= ~0x20;                              // $7411
  if (r[1] & 0x80) {                                // $7413-$741B: walk AWAY
    if ((state.frame & 0x0F) === 0) requestSound(state, 0x2A); // $741D-$7426
    return playerLeft ? boss4WalkRightAccel(state, r)          // $7429-$742D
      : boss4WalkLeftAccel(state, r);               // (facing NOT stored)
  }
  return playerLeft ? boss4WalkLeftStore(state, r)  // $7430-$7434
    : boss4WalkRightStore(state, r);
}

/** ROM: loc_01_74B0 - dead zone: commit $30 frames at the player's mirror. */
function boss4MirrorPause(state, r) {
  r[1] = (r[1] & 0xF3) | 0x10;                      // $74B0-$74B6
  r[E_FACING] = state.player.facing ^ 1;            // $74BA
  r[0x15] = 0x30;                                   // $74C3
  return riseTail(state, r);
}

/** ROM: loc_01_74CB / loc_01_74D0 - walker-idiom acceleration. */
function boss4WalkRightStore(state, r) {
  r[E_FACING] = 0;                                  // $74CB-$74CF
  return boss4WalkRightAccel(state, r);
}

function boss4WalkRightAccel(state, r) {            // $74D0
  let v = r[E_VX];
  if (v & 0x80) {                                   // $74D5 -> $752C
    v = u8(v + 2);
    r[E_VX] = v;
    return (v & 0x80) ? boss4MoveLeft(state, r, v) : boss4MoveRight(state, r, v);
  }
  const max = r[E_SPEED_CAP];                       // $74DC-$74E8
  v = v + 1 < max ? v + 1 : max;
  r[E_VX] = v;
  return boss4MoveRight(state, r, v);
}

/** ROM: loc_01_7537 / loc_01_753D - mirror. */
function boss4WalkLeftStore(state, r) {
  r[E_FACING] = 1;                                  // $7537-$753C
  return boss4WalkLeftAccel(state, r);
}

function boss4WalkLeftAccel(state, r) {             // $753D
  let v = r[E_VX];
  if (v !== 0 && (v & 0x80) === 0) {                // $7541-$7547 -> $757E
    v = u8(v - 2);
    r[E_VX] = v;
    return (v & 0x80) ? boss4MoveLeft(state, r, v) : boss4MoveRight(state, r, v);
  }
  const min = u8(-r[E_SPEED_CAP]);                  // $754A-$755D
  v = u8(v - 1);
  if (v < min) v = min;
  r[E_VX] = v;
  return boss4MoveLeft(state, r, v);
}

/** ROM: loc_01_74F0 - a wall makes it jump (snap $80, hop launcher). */
function boss4MoveRight(state, r, v) {
  addX(r, i8(v));
  if (probeRight(state, r) !== 0) {                 // $74F3
    r[E_X_LO] = 0x80;                               // $74FB
    r[E_VX] = 0;                                    // $7500
    return boss4Hop(state, r);                      // falls into $7506
  }
  return riseTail(state, r);                        // $758A
}

/** ROM: loc_01_7565 - mirror. */
function boss4MoveLeft(state, r, v) {
  addX(r, i8(v));
  if (probeLeft(state, r) !== 0) {                  // $7568
    r[E_X_LO] = 0x80;                               // $7570
    r[E_VX] = 0;
    return boss4Hop(state, r);
  }
  return riseTail(state, r);
}

/** ROM: loc_01_7506 - boss 2's hop launcher shape, 8-frame wind-up. */
function boss4Hop(state, r) {
  r[E_FLAGS] &= ~0x18;                              // $7508/$750A
  if (r[E_FLAGS] & 0x01) return riseTail(state, r);       // $750C
  if (r[E_FLAGS] & 0x02) return fallTail(state, r);       // $7511
  r[1] |= 0x40;                                     // $7517
  boss1Aim(state, r);                               // $751E -> sub_01_79DB
  r[0x18] = 0x08;                                   // $7525
  return riseTail(state, r);
}

/**
 * ROM: jt_01_6300 - boss 4's attack tick: boss 2's shape, except the timer-7
 * projectile (the thrown mode-5 bomb) fires only on a NON-crit throw
 * ($6330 tests $C73F first), and the crit throw's damage comes from the
 * probes alone.
 */
function attackTickBoss4(state, r) {
  if (r[0x14] === 0) {                              // $6308 -> loc_01_6121
    state.flow.bossCrit = 0;
    r[E_FLAGS] &= 0xC7;
    return riseTail(state, r);
  }
  r[0x14]--;                                        // $630B
  if (r[0x14] === 7) {                              // $630D
    if (!state.flow.bossCrit && (r[E_FLAGS] & 0x10)) {    // $6330-$633A
      spawnProjectile(state, r, 5);                 // $633E-$6343
    }
  } else if (attackProbe(state, r) !== 0xFF) {      // $6316-$631C
    r[1] |= 0x10;                                   // $6323
    r[0x15] = 0x28;                                 // $632A: +$15 -- HL sits
  }                                                 // at +1 before the +$14
  return stBoss4(state, r);                         // add, exactly like
}                                                   // boss 2's $6206

// ---------------------------------------------------------------------------
// State 8 -- Boss 3 (level 11).  ROM: jt_01_7061.
//
// A dash fighter with two attacks off one melee bit. NORMAL ($C73F clear):
// an $0B-frame pose that probes (and, with bit 4, shoots) at timer 7 and
// CHAINS -- expiry re-launches a $30-speed dash while the player stays in the
// $0C-$60 band. CRIT ($C73F set): a $2C-speed lunge whose velocity decays 1
// per frame, ricocheting off the arena edges (X hi < 2 or >= $0A flips the
// facing and re-arms). The crit flag is raised point-blank (< $0C px), by the
// far-band patience counter ($C741 ticking on ODD $FFB1 frames to $B4), or by
// the ricochet itself. Enraged (HP < $0E, non-easy) the mid band swaps the
// chase for the ranged bit-4 attack.
// ---------------------------------------------------------------------------

function stBoss3(state, r) {
  if (r[E_HP] < 0x0E && state.flow.difficulty !== 0) {
    state.flow.bossRage = 1;                        // $7068-$7074: $C73D
  }
  if (r[E_FLAGS] & 0x07) {                          // $7079-$7083
    const v = r[E_VX];
    return (v & 0x80) ? boss3MoveLeft(state, r, v) : boss3MoveRight(state, r, v);
  }
  if (r[E_FLAGS] & 0x18) return riseTail(state, r);       // $70A1
  if (r[1] & 0x20) {                                // $70A8: landing anim
    r[E_FLAGS] &= ~0x20;                            // $7186
    return riseTail(state, r);
  }

  const psx = playerScreenX(state);                 // $70B1 vs the cached +7
  const diff = u8(psx - r[E_SCREEN_X]);             // (no dead-zone special
  const playerLeft = psx < r[E_SCREEN_X];           //  case in this handler)
  const ad = playerLeft ? u8(-diff) : diff;

  if (ad < 0x28) {                                  // $70BA: close band
    if (ad < 0x0C) state.flow.bossCrit = 1;         // $711C-$7122: point-blank
    return boss3Attack(state, r, playerLeft);       // $7125
  }
  if (ad < 0x60) {                                  // $70C0: mid band
    state.flow.bossHop = 0;                         // $70F0: patience reset
    if (!state.flow.bossRage) {                     // $70F4
      return boss3Attack(state, r, playerLeft);
    }
    r[E_FACING] = playerLeft ? 1 : 0;               // $70FA-$7104
    if ((r[E_FLAGS] & 0x18) === 0) {                // $7105 (always true here)
      r[E_FLAGS] = (r[E_FLAGS] & ~0x20) | 0x10;     // $710C/$710E: ranged
      r[0x14] = 0x1F;                               // $7114
    }
    return riseTail(state, r);                      // $7119
  }
  // $70C2: far band -- idle, with the patience counter ticking at 30 Hz.
  r[E_FACING] = playerLeft ? 1 : 0;                 // $70C6-$70CD
  r[E_FLAGS] |= 0x20;                               // $70D2
  if (state.frame & 0x01) {                         // $70D4: odd frames only
    const c = u8(state.flow.bossHop + 1);           // $70DA: $C741
    if (c >= 0xB4) {                                // $70DE: 180 ticks
      state.flow.bossCrit = 1;                      // $70E4
      return boss3Attack(state, r, playerLeft);     // $70E7 -> $7125
    }
    state.flow.bossHop = c;                         // $70E9
  }
  return fallTail(state, r);                        // $70ED
}

/** ROM: loc_01_7125 - launch an attack toward the player (both kinds). */
function boss3Attack(state, r, playerLeft) {
  state.flow.bossHop = 0;                           // $7125: $C741 = 0
  if (r[E_FLAGS] & 0x18) return riseTail(state, r);       // $712C: already attacking
  r[E_FLAGS] |= 0x08;                               // $7134
  r[E_FACING] = playerLeft ? 1 : 0;                 // $713A-$7142
  return boss3Arm(state, r);                        // falls into $7143
}

/** ROM: loc_01_7143 - arm the timer/sound, and the crit lunge's velocity.
 *  Entered separately by the ricochet ($725B). */
function boss3Arm(state, r) {
  if (state.flow.bossCrit) {                        // $7147
    requestSound(state, 0x2D);                      // $714D
    r[0x14] = 0x1F;                                 // $7153
  } else {
    requestSound(state, 0x27);                      // $7157
    r[0x14] = 0x0B;                                 // $715D
  }
  r[E_FLAGS] &= ~0x20;                              // $7162: RES 5
  if (state.flow.bossCrit) {                        // $7164
    r[E_VX] = (r[E_FACING] & 1) ? 0xD4 : 0x2C;      // $7171-$717F: +-$2C
  }
  return riseTail(state, r);                        // $7182
}

/** ROM: loc_01_71B0 - move right; a wall kills the whole attack ($C73F too). */
function boss3MoveRight(state, r, v) {
  addX(r, i8(v));
  if (probeRight(state, r) !== 0) {                 // $71B3
    r[E_X_LO] = 0x40;                               // $71BB
    r[E_VX] = 0;                                    // $71C1
    state.flow.bossCrit = 0;                        // $71C2
    r[E_FLAGS] &= 0xC7;                             // $71CA
    return riseTail(state, r);
  }
  return boss3EdgeCheck(state, r);                  // $7235
}

/** ROM: loc_01_7209 - mirror (snap $B0). */
function boss3MoveLeft(state, r, v) {
  addX(r, i8(v));
  if (probeLeft(state, r) !== 0) {                  // $720C
    r[E_X_LO] = 0xB0;
    r[E_VX] = 0;
    state.flow.bossCrit = 0;
    r[E_FLAGS] &= 0xC7;
    return riseTail(state, r);
  }
  return boss3EdgeCheck(state, r);
}

/**
 * ROM: loc_01_7235 - after an unobstructed step. At the arena edges (X hi
 * < 2 or >= $0A) an un-stunned boss RICOCHETS: turn, set $C73F, re-arm
 * ($725B -> $7143); a stunned one just stops. In the open, a crit lunge
 * probes at +$1F = 7 (downward) each frame and leaves $F6 behind in the
 * offset -- the value the ROM stores after the probe, kept faithfully.
 */
function boss3EdgeCheck(state, r) {
  const xhi = r[E_X_HI];
  if (xhi < 2 || xhi >= 0x0A) {                     // $7236 / $723A
    if ((r[E_FLAGS] & 0x04) === 0) {                // $7242
      r[E_FLAGS] = (r[E_FLAGS] & 0xC7) | 0x08;      // $7248-$724D
      r[E_FACING] ^= 1;                             // $7253
      state.flow.bossCrit = 1;                      // $7258
      return boss3Arm(state, r);                    // $725B
    }
    r[E_VX] = 0;                                    // $7263: stunned -- stop
  }
  if (state.flow.bossCrit) {                        // $7268
    r[E_PROBE_DY] = 0x07;                           // $7277
    attackProbe(state, r);                          // $727A
    r[E_PROBE_DY] = 0xF6;                           // $727E
  }
  return riseTail(state, r);                        // $7285
}

/**
 * ROM: jt_01_621F - boss 3's attack tick. The crit branch IS the lunge: the
 * velocity decays toward 0 by 1 each frame and the movement runs through the
 * $71B0/$7209 arms (edge ricochet included); reaching 0 ends it. The normal
 * branch holds the pose, probing -- and with bit 4, firing the mode-4
 * projectile -- exactly when the timer passes 7, then falls through to the
 * full state handler ($62FB -> $7061) like boss 1's tick does.
 */
function attackTickBoss3(state, r) {
  if (state.flow.bossCrit) {                        // $6221 -> $6253
    if (r[0x14] !== 0) r[0x14]--;                   // $6257-$625C
    let v;
    if ((r[E_FACING] & 0x01) === 0) v = u8(r[E_VX] - 1);   // $6261-$626A
    else v = u8(r[E_VX] + 1);                       // $627C-$6281
    if (v === 0) {                                  // $626B / $6282 -> $6293
      state.flow.bossCrit = 0;
      r[E_FLAGS] &= 0xC7;
      return riseTail(state, r);
    }
    r[E_VX] = v;
    return (v & 0x80) ? boss3MoveLeft(state, r, v) : boss3MoveRight(state, r, v);
  }
  if (r[0x14] === 0) return boss3AttackExpiry(state, r);   // $622D
  r[0x14]--;
  if (r[0x14] === 7) {                              // $6232
    attackProbe(state, r);                          // $623C
    if (r[E_FLAGS] & 0x10) spawnProjectile(state, r, 4);  // $6241-$624C
  }
  return stBoss3(state, r);                         // $62FB -> $7061
}

/** ROM: loc_01_62A0 - normal-attack expiry: chain a dash while the player
 *  stays in range, upgrade to the crit lunge point-blank. */
function boss3AttackExpiry(state, r) {
  const wasMelee = (r[E_FLAGS] & 0x08) !== 0;       // $62A1/$62A7
  r[E_FLAGS] &= 0xC7;                               // $62A2
  if (!wasMelee) return riseTail(state, r);         // $62A9: the ranged one
  const psx = playerScreenX(state);                 // $62B1
  const diff = u8(psx - r[E_SCREEN_X]);
  const playerLeft = psx < r[E_SCREEN_X];
  const ad = playerLeft ? u8(-diff) : diff;
  if (ad < 0x0C) {                                  // $62B9
    state.flow.bossCrit = 1;                        // $62BD
    return boss3Attack(state, r, playerLeft);       // $62C2 -> $7125
  }
  if (ad >= 0x60) return riseTail(state, r);        // $62C5
  requestSound(state, 0x27);                        // $62CF: chained dash
  r[E_FLAGS] |= 0x08;                               // $62D6
  r[0x14] = 0x0B;                                   // $62E0
  r[E_FACING] = playerLeft ? 1 : 0;                 // $62E6/$62EC
  const v = playerLeft ? 0xD0 : 0x30;               // $62E8/$62EF
  r[E_VX] = v;
  return (v & 0x80) ? boss3MoveLeft(state, r, v) : boss3MoveRight(state, r, v);
}

// Exposed for the unit tests only.
export const _internals = {
  probeCore, probeRight, probeLeft, probeUp, probeDown, attackProbe,
  wallAhead, gapLeap, ledgeCheck, spawnProjectile, riseTail, fallTail,
  screenTail, neg16q, absDiff8, stunnedTick, primaryDispatch,
};
