// Enemy array -- $C268.  ROM: driver sub_01_4E0C, dispatch 1:$50D3.
//
// 8 slots x 32 bytes, preloaded whole at level init from a bank-5 blob that is
// a byte-identical image of the RAM records. There is no streaming spawner and
// no pooling: the whole roster for a level exists from the moment it loads,
// dormant until the camera comes near. The entire game ships 26 non-boss
// enemies and 5 boss entities. The only runtime spawn is the projectile copy
// into slots 6/7 (sub_01_6BDC).
//
// Record layout (master reference §5.2, refined against the handlers):
//   +0        flags: b7 active, b6 permanently disabled, b5 idle (player far),
//             b4 ranged attack, b3 melee attack, b2 hit-flash/stun,
//             b1 falling, b0 rising
//   +1        sub-flags: b7 wall-jump latch, b6 turn animation, b5 landing
//             animation, b4 committed walk, b1 slow-fall (terminal -8)
//   +2        STATE = the enemy type, 1-13 -> dispatch 1:$50D3
//   +3        walk anim: period<<4 | subtimer (flyer reuses it as flap speed)
//   +4        walk anim: (frames-1)<<4 | frame
//   +5        facing (b0; also knockback direction)
//   +6        current metasprite id (projectiles: template variant 1-5)
//   +7/+8     screen X / Y, recomputed by loc_01_5CA8 each frame
//   +9        OAM attr ($80 = behind BG; water). Cleared by the driver.
//   +$0A-$0D  hitbox: halfW right / halfW left / halfH up / halfH down
//   +$0E/+$0F X world 12.4        +$10/+$11  Y world 12.4
//   +$12      X velocity (signed) +$13       Y velocity (positive = up)
//   +$14      attack timer        +$15       committed-walk timer
//   +$16      HP                  +$17       hit-flash / stun timer ($3C)
//   +$18/+$19 turn / landing animation timers
//   +$1A      ceiling-snap Y-lo   +$1B       conveyor-snap Y-lo
//   +$1C      jump velocity       +$1D       walk speed cap
//   +$1E/+$1F attack-probe offset X (facing-signed) / Y (signed), in px

import { u8, i8, u16, mapCollisionByIndex } from './state.js';
import { drawMetasprite } from './render/metasprite.js';
import { spawnDrop } from './drops.js';
import {
  effects, resetEffects, bossCountdownTick, victoryStep,
  COUNTDOWN_IDLE, COUNTDOWN_START,
} from './effects.js';

export const SLOTS = 8;
export const RECORD = 32;

const F_ACTIVE = 0x80, F_DISABLED = 0x40;

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

const hexBytes = (s) => Uint8Array.from(s.match(/.{2}/g), (b) => parseInt(b, 16));

/**
 * Player melee lands on an enemy.  ROM: loc_00_2643-$272B, the punch probe's
 * ($C72B = 5) enemy scan -- reached from sub_00_20BA only when the probe row
 * is above $20 and the map cell at the probe point is empty or water.
 *
 * The whole test is in SCREEN space, like the map-object scan next door: the
 * probe point goes through sub_00_1172 at $2430 and is compared against each
 * slot's CACHED screen bytes at +7/+8 -- which were written by loc_01_5CA8 at
 * the end of LAST frame's enemy driver, one frame stale by design. The box is
 * the ENEMY's, not the player's: half-width r[+$0B] MINUS ONE ($2685 DEC A,
 * strict <), half-height r[+$0C] (strict <). A failed X test retries once with
 * the probe pulled 8 px back toward the player ($269B/$26A0 -- facing right
 * SUBTRACTS, facing left ADDS), which widens the window on the NEAR side only.
 *
 * Work the geometry through, because the direction is easy to state backwards:
 * the fist is 14 px ahead of the player ($201F loads +$00E0), and the union of
 * the two tests covers probe-14 through probe+6. So facing right the window
 * runs from the player's OWN CENTRE to about 20 px ahead of him -- generous
 * behind the fist, and barely reaching past it.
 *
 * MEASURED on the cartridge (level 3, slot-3 walker, box bytes 7/15): probe
 * screen 102 vs enemy 100 hits; probe 102 vs enemy 86 misses on both the first
 * test and the retry at 94. With the player's centre at 88, that enemy was 2 px
 * behind HIM, not behind the fist. The short forward reach is why "level-3
 * enemies cannot be punched first" was reported: you have to let them come
 * most of the way in before the window covers them at all.
 *
 * Only the FIRST overlapping slot is hit -- $271F returns $FF immediately.
 * States 4/$0B/$0D are transparent to the fist ($2667-$2673). $C740 must be
 * $FF, which holds everywhere except level 14's boss mode ($0DE3 writes 1).
 *
 * Two outcomes. Normally 2 damage plus a $3C stun and the hit-flash bit. But
 * if `(rLY ^ $FFB1) < 8` it is a CRIT: sound $18 instead of $21 and the
 * enemy's ENTIRE remaining HP as damage. Non-boss levels only ($26D7).
 *
 * THE CRIT WINDOW CANNOT BE BIT-EXACT. $26D0 reads the live scanline counter
 * mid-frame: measured under PyBoy, the one connecting punch in the level-3
 * scenario read rLY = 44 -- not a VBlank value, but "how many scanlines this
 * frame's logic had consumed when the scan ran", i.e. instruction-level
 * timing, out of scope by definition (docs/03-VERIFICATION.md par.28). The
 * port keeps the feature with a modelled rLY; it is pseudo-random at the
 * cartridge's ~3% rate but will never agree with it punch for punch. If an
 * oracle scenario ever trips it, widen the scenario, don't chase the model.
 *
 * @param probeX/probeY  the punch probe point in world 12.4 ($FFB6-$FFB9)
 * @returns 0xFF on a hit (the probe's own return value), else 0
 */
export function meleeHitTest(state, probeX, probeY) {
  const p = state.player;
  const t = state.tunables;

  // $2430 / sub_00_1172: world -> screen, same formula as screenTail below.
  const probeSX = u8((u16(probeX - state.camera.x) >> 4) + 8);
  const probeSY = u8((u16((probeY & 0x0FFF) - state.camera.y) >> 4) + 0x10);

  for (let slot = 0; slot < SLOTS; slot++) {
    const r = state.enemies[slot];
    if ((r[0] & F_ACTIVE) === 0) continue;          // $2660
    const st = r[2];
    if (st === 0x0D || st === 0x0B || st === 0x04) continue;   // $2667-$2673

    const halfW = u8(r[0x0B] - 1);                  // $2685: DEC A
    const halfH = r[0x0C];

    // --- X ($268D): strict <, then one retry 8 px back toward the player.
    if (absDiff8(r[7], probeSX) >= halfW) {
      const back = u8(p.facing === 0 ? probeSX - 8 : probeSX + 8);  // $269B/$26A0
      if (absDiff8(r[7], back) >= halfW) continue;  // $26AA
    }
    // --- Y ($26AD): strict <, no retry.
    if (absDiff8(r[8], probeSY) >= halfH) continue; // $26B3

    // $26B7: $C750, not $C740. Identical today -- $0DC5/$0DCA set both per level and
    // $0DE0/$0DE3 override both on level $0E -- but they part after a boss
    // dies: 1:$4EF1 writes $C740 = $FE, which permanently disables ALL melee
    // and batarang damage while $C750 stays 0. Revisit when bosses land.
    if (state.flow.bossMode) continue;

    requestSound(state, 0x19);                      // $26BE
    r[0] |= 0x04;                                   // $26C4: hit-flash
    r[0x17] = t.enemyStunFrames;                    // $26CA: $3C

    // $26CD: the crit window -- rLY is MODELLED, see the header comment.
    const ly = (state.frame * 7) & 0x7F;
    const crit = ((ly ^ state.frame) & 0xFF) < t.critWindow
                 && state.level.bossId === 0;       // $26D7: $C73E == 0

    const dmg = crit ? r[0x16] : t.meleeDamage;     // $26E3 vs $26F0
    r[0x16] = Math.max(0, r[0x16] - dmg);           // $26F6: SUB, clamp 0
    requestSound(state, crit ? 0x18 : 0x21);
    // $2708-$271B: the hit-spark effect ($C744-$C747 + sub_00_0CC2) is not
    // modelled -- same stance as the $4E84 death explosion.
    return 0xFF;                                    // $271F: first hit only
  }
  return 0;                                         // $272A
}

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

    if ((r[0] & F_ACTIVE) === 0) { tryActivate(state, r); continue; }   // $4E27
    if (state.flow.paused || state.lagFrame) {      // $4E2C / $4E39
      screenTail(state, r);                         // -> loc_01_5CA8 directly
      continue;
    }

    if (shouldDespawn(state, r)) {                  // $4E4D -> sub_00_11A7
      r[0] &= ~F_ACTIVE;                            // $4E55: RES 7 only
      continue;
    }

    r[9] = 0;                                       // $4E60: attr rebuilt per frame
    if (r[0x10] >= DEATH_ROW) {                     // $4E69: fell out
      if (killTail(state, r) === 'stop') return;
      continue;
    }
    if (r[0x16] === 0) {                            // $4E75: HP gone
      // $4E7A: boss levels take the branch at $4E82 and spawn NOTHING. Only
      // an ordinary level drops anything, and only from HP reaching zero --
      // the fell-out-of-the-world arm above jumps straight past this.
      // MEASURED: levels 4, 8 and 11 leave the pool empty when their enemies
      // die; level 3 fills slot 0 the same frame.
      if (state.level.bossId === 0) {
        // $4E88: the drop copies the enemy's live position out of +$0E..+$11.
        // The explosion effect that $4EA9 spawns alongside it (pool $C693)
        // is still not modelled -- it is purely visual.
        spawnDrop(state, (r[0x0E] << 8) | r[0x0F], (r[0x10] << 8) | r[0x11],
                  0xFF, 0x00, 0x00);                // $4EAC/$4EB1: dir $FF, DE = 0
      }
      if (killTail(state, r) === 'stop') return;
      continue;
    }

    // loc_01_4F0E: hit-state prelude before the type dispatch.
    if (r[0] & F_DISABLED) {                                  // $4F11: BIT 6
      if (killTail(state, r) === 'stop') return;
      continue;
    }
    if (r[0] & 0x04) { stunnedTick(state, r); continue; }     // $4F15: BIT 2
    if (r[0] & 0x18) { hitDispatch(state, r); continue; }     // $4F19 -> $60DD
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
const INTRO_PATH = hexBytes('3f1828909008080808d018505008080808d01890905050183f');   // 1:$7A41
const INTRO_POSES = hexBytes('181d1e292a191b1a1c1f21292a1a1b191c1f21292a292a1d1e');  // 1:$7A5A

function bossIntroTick(state) {
  const f = state.flow;
  if (f.bossMode !== 2) {                           // $77BD: CP $02
    if (f.bossHop - 1 === 0) {                      // $77C4: DEC hits 1
      f.bossHop = 0x3F;                             // $77CB
      f.bossMode = 2;                               // $77D2
      // $77D5-$77DA: $FFAD = $E4, $FFAC = 0. $FFAD is rBGP's shadow, NOT an
      // object palette -- $0806-$0816 settles the mapping ($FFAB->rWX,
      // $FFAC->rWY, $FFAD->rBGP, $FFAE->rOBP0, $FFAF->rOBP1). Only the $FFAC
      // half is modelled. The consequence is visible: $0DFD sets BGP = $FF on
      // level-14 init, blacking the background out for the entrance, and this
      // is what restores $E4 when phase 2 starts. The port does neither, so
      // level 14's entrance renders on a normal background.
      state.video.windowY = 0;
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
  const op = INTRO_PATH[cur] & 0xC0;                // $781F
  if (op === 0xC0) return introRise(state);         // $782C (the else of $7828)
  if (op === 0x80) f.balloonX = u16(f.balloonX - 0x40);        // $785D
  else if (op === 0x40) f.balloonX = u16(f.balloonX + 0x40);   // $7858
  f.bossHop = (INTRO_PATH[cur] & 0x3F) + 4;         // $7871 (the moves fall in)
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
  state.enemyDraws.push({ id: INTRO_POSES[f.bossCrit], x: sx, y: sy,
                          attr: 0, alt: true });    // $7894-$78A0: 0BAF
  state.video.windowY = 0;                          // $78A4: $FFAC = 0
}

/** ROM: loc_01_77FF - the entrance (or its skip) hands control to gameplay. */
function bossIntroEnd(state) {
  const f = state.flow;
  state.video.windowY = 0x90;                       // $7810-$7812: window off
  f.bossHop = 0;                                    // $7802: $C741
  f.bossCrit = 0;                                   // $7805: $C73F
  f.bossMode = 0;                                   // $7808: $C750
  state.player.vy = 0;                              // $7800: $FF87
  // $780B: $C740 = $FF -- melee/batarang damage re-enabled. The port models
  // $C740's gate through flow.bossMode, which just went 0.
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
  const xhi = r[0x0E];
  if (xhi === 0) return;                            // $609B

  const camCol = u8((state.camera.x >> 8) + 5);     // $60A0
  if (absDiff8(camCol, xhi) >= ACTIVATE_RANGE) return;    // $60A9
  if (r[0] & F_DISABLED) return;                    // $60AF: BIT 6
  if (r[1] === 0x01) {                              // $60B5
    // $60BC: only when the enemy's column equals camera - 2, exactly.
    if (xhi !== u8((state.camera.x >> 8) - 2)) return;
  }
  r[0] |= F_ACTIVE;                                 // $60C5: SET 7
}

/**
 * ROM: sub_00_11A7 - the despawn window is wider than the activation one, and
 * tests ONLY the X distance; falling out of the world is the driver's separate
 * $4E69 check (which disables permanently, where this one merely deactivates).
 */
function shouldDespawn(state, r) {
  const camCol = u8((state.camera.x >> 8) + 5);
  return absDiff8(camCol, r[0x0E]) >= DESPAWN_RANGE;
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

  r[0] = (r[0] & 0x43) | F_DISABLED;                // $4EC0

  if (r[2] === 0x0B) return 'done';                 // $4EC8: projectiles
  if (state.level.bossId === 0) return 'done';      // $4ECE: $C73E

  if (r[0] & 0x03) {                                // $4ED5: still airborne
    r[0] |= 0x80;                                   // $4EDA: back to active
    return 'dispatch';                              // $4EDD: JP loc_01_50C3
  }

  // $4EE0 -- the boss is down.
  // $4EE6: BC = $0104, so sound id $01 with mask $04, the FADE-OUT mask. The
  // music does not stop, it fades. Level 6 is excluded ($4EE2: CP $06).
  if (state.level.number !== 0x06) requestSound(state, 0x01, 0x04);
  r[0] = 0x81;                                      // $4EEC
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
  switch (r[2]) {
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
    if (r[0] & 0x18) return hitDispatch(state, r);
    return primaryDispatch(state, r);
  }
  const st = r[2];                                  // $4F35
  if (st === 5) {                                   // $4F7C: vehicle target
    r[0] &= 0xC5;
    return primaryDispatch(state, r);
  }
  if (st === 7 || st === 9 || st === 0x0A) return bossKnockback(state, r); // $4F84
  if (st === 8) return boss3Knockback(state, r);    // $4FF5
  // $4F4B: walkers / flyers / projectiles bounce up and away from the player.
  r[0x13] = 0x18;
  r[0x12] = playerScreenX(state) >= r[7] ? 0xF0 : 0x10;   // $4F59
  r[0] = (r[0] & 0xC5) | 0x01;                      // $4F6A: rising
  r[1] &= 0x9F;                                     // $4F70
  // $4F76: $C73F (boss-3 helper flag) = 0 -- not modelled.
  return primaryDispatch(state, r);
}

/** ROM: loc_01_4F84 - bosses 2/4/L14-chaser knockback (+ hard-mode counter). */
function bossKnockback(state, r) {
  r[0x13] = 0x10;
  const xhi = r[0x0E];                              // $4F91: arena walls
  if (xhi === 0x0A) r[0x12] = 0xF0;
  else if (xhi === 0x01) r[0x12] = 0x10;
  else r[0x12] = playerScreenX(state) >= r[7] ? 0xF0 : 0x10;
  r[0] = (r[0] & 0xC5) | 0x01;
  r[1] &= 0x9F;
  // $4FCA: the knockback cancels the $C741 spin/patience counter. Verified
  // by l8-boss2-batarang-spin: a punch landing mid-spin zeroes it instantly
  // on the cartridge (f138), it does not run down.
  state.flow.bossHop = 0;
  if (state.flow.difficulty === 2) {                // $4FCD: retaliate on hard
    r[0] |= 0x08;
    r[5] = playerScreenX(state) < r[7] ? 1 : 0;     // $4FDE
    r[0x14] = 0x1F;                                 // $4FED
  }
  return primaryDispatch(state, r);
}

/** ROM: loc_01_4FF5 - boss 3 variant (X hi >= 9 counts as the right wall). */
function boss3Knockback(state, r) {
  r[0x13] = 0x10;
  const xhi = r[0x0E];
  if (xhi >= 0x09) r[0x12] = 0xF0;                  // $5003
  else if (xhi === 0x01) r[0x12] = 0x10;
  else r[0x12] = playerScreenX(state) >= r[7] ? 0xF0 : 0x10;
  r[0] = (r[0] & 0xC5) | 0x01;
  r[1] &= 0x9F;
  return primaryDispatch(state, r);
}

/** ROM: loc_01_5049 - the stun timer just expired. */
function stunExpired(state, r) {
  const bid = state.level.bossId;                   // $C73E
  if (bid === 2 || bid === 4) {                     // $505A
    r[5] = playerScreenX(state) < r[7] ? 1 : 0;
    r[0] = (r[0] & 0xC3) | 0x10;
    r[0x14] = 0x1F;
    return riseTail(state, r);
  }
  if (bid === 3) {                                  // $5080
    r[0x14] = 0x1F;
    r[5] = playerScreenX(state) < r[7] ? 1 : 0;     // $508E (SUB-based, same test)
    r[0x12] = (r[5] & 1) ? 0xCC : 0x34;             // $50A1
    r[0] = (r[0] & 0xC3) | 0x08;
    // $50B0: the retaliation IS the crit lunge -- attackTickBoss3 reads this
    // and runs the decaying-velocity dash. Verified by l11-boss3-punch: the
    // f188 divergence before this write was modelled was exactly bossCrit,
    // and the observed vx $CD is $CC plus one $6280 increment.
    state.flow.bossCrit = 1;
    requestSound(state, 0x2D);
    return primaryDispatch(state, r);               // $50BB
  }
  r[0] &= ~0x04;                                    // $50C1
  return primaryDispatch(state, r);
}

/** ROM: loc_01_60DD, table 1:$60EF -- runs while bits 3/4 (attack) are set. */
function hitDispatch(state, r) {
  switch (r[2]) {
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
  r[0] &= 0xC7;
  return riseTail(state, r);
}

/**
 * ROM: jt_01_634F - boss 1 holds the swing but only ARMS it late: the probe
 * runs on the last $0C frames of the $1F timer, and its reach depends on the
 * crit roll taken when the attack started ($C73F: offset $12 instead of $1A,
 * i.e. the crit punch lands CLOSER, not further). Unlike the basic tick this
 * one falls through into the full state handler ($637C -> jt_01_7591), so an
 * attacking boss still runs its distance logic every frame.
 */
function attackTickBoss1(state, r) {
  if (r[0x14] === 0) {                              // $6357 -> loc_01_6121
    state.flow.bossCrit = 0;
    r[0] &= 0xC7;
    return riseTail(state, r);
  }
  r[0x14]--;                                        // $635A
  if (r[0x14] < 0x0C) {                             // $635C: last 12 frames
    r[0x1E] = state.flow.bossCrit ? 0x12 : 0x1A;    // $636B / $636F
    attackProbe(state, r);                          // $6376
  }
  return stBoss1(state, r);                         // $637C
}

/** ROM: jt_01_612E - state 2 turns AWAY after the lunge and commits to it. */
function attackTickWalkerJump(state, r) {
  if (r[0x14] !== 0) {
    r[0x14]--;
    attackProbe(state, r);
    return riseTail(state, r);
  }
  r[0] &= 0xC7;                                     // $6148
  r[1] = (r[1] & 0xF3) | 0x10;                      // committed walk
  r[5] ^= 1;                                        // $615A
  r[0x15] = 0x18;                                   // $6161
  return riseTail(state, r);
}

/** ROM: jt_01_6169 - flyer dive/knockback: X speed decays 1/frame toward 0. */
function attackTickFlyer(state, r) {
  const v = u8((r[5] & 1) === 0 ? r[0x12] - 1 : r[0x12] + 1);   // $6177 / $618E
  if (v === 0) {                                    // $61A1: recovered
    r[0] &= 0xC7;
    r[3] = 0x50;
    return riseTail(state, r);
  }
  r[0x12] = v;
  return (v & 0x80) ? flyMoveLeft(state, r, v) : flyMoveRight(state, r, v);
}

/** ROM: jt_01_61B3 - state 6 pause after its attack. */
function attackTickL12(state, r) {
  if (r[0x14] !== 0) { r[0x14]--; return riseTail(state, r); }
  r[0] &= 0xC7;
  r[1] = (r[1] & 0xF3) | 0x10;
  r[0x15] = 0x28;                                   // $61D5
  return riseTail(state, r);
}

/** ROM: jt_01_637F - state 12 counts its timer down, then wakes. */
function attackTickDormant(state, r) {
  if (r[0x14] !== 0) { r[0x14]--; return screenTail(state, r); }
  r[0] &= 0xE7;                                     // $6392
  return stDormant(state, r);
}

// ---------------------------------------------------------------------------
// State 1 -- walker (levels 1-3).  ROM: jt_01_50ED.
// ---------------------------------------------------------------------------

function stWalker(state, r) {
  if (r[0] & 0x03) return walkerAirMove(state, r);  // $50EF: airborne
  const f1 = r[1];                                  // $5113
  if (f1 & 0x60) {                                  // $5114: turn/landing anim
    r[0] &= ~0x20;                                  // $51B4
    return walkerAirMove(state, r);                 // move at r[$12] regardless
  }
  if (f1 & 0x10) {                                  // $511E: committed walk
    if (r[0x15] === 0) { r[1] &= ~0x10; return riseTail(state, r); }  // $51D0
    r[0x15]--;                                      // $51C0
    return r[5] === 0 ? walkerWalkRight(state, r) : walkerWalkLeft(state, r);
  }

  const psx = playerScreenX(state);                 // $FF93
  const diff = u8(psx - r[7]);                      // $5128: vs the STORED screen X
  if (diff === 0) return walkerFacePause(state, r); // $512B
  const playerLeft = psx < r[7];
  const ad = playerLeft ? u8(-diff) : diff;

  if (ad < 0x14) {                                  // $5133
    if (ad < 8) return walkerFacePause(state, r);   // $516E: too close
    if (absDiff8(playerScreenY(state), r[8]) >= 0x18) {   // $5180
      return walkerWalkToward(state, r, playerLeft);
    }
    if (state.player.iframes !== 0) return walkerFacePause(state, r);  // $5184
    requestSound(state, 0x1A);                      // $518F: melee attack
    r[0] |= 0x08;                                   // $5195
    r[5] = playerLeft ? 1 : 0;                      // $519C
    r[0x14] = 0x13;                                 // $51A8
    r[0] &= ~0x20;
    return fallTail(state, r);
  }
  if (ad < 0x30) return walkerWalkToward(state, r, playerLeft);   // $5137
  if (absDiff8(playerScreenY(state), r[8]) < 0x30) {              // $5145
    return walkerWalkToward(state, r, playerLeft);
  }
  r[0] |= 0x20;                                     // $514E: idle, player far
  r[0x12] = 0;
  return fallTail(state, r);
}

/** ROM: loc_01_515D */
function walkerWalkToward(state, r, playerLeft) {
  r[0] &= ~0x20;
  return playerLeft ? walkerWalkLeft(state, r) : walkerWalkRight(state, r);
}

/**
 * ROM: loc_01_51DB. Directly under/over the player (or in the dead zone): stop
 * and commit for $20 frames. Quirk: the facing MIRRORS THE PLAYER'S ($FF88
 * XOR 1) rather than being computed from relative position.
 */
function walkerFacePause(state, r) {
  r[1] = (r[1] & 0xF3) | 0x10;
  r[5] = state.player.facing ^ 1;                   // $51E5
  r[0x15] = 0x20;
  return riseTail(state, r);
}

/** ROM: loc_01_51F6 - accelerate right by 1/frame toward the +$1D cap. */
function walkerWalkRight(state, r) {
  r[5] = 0;                                         // $51F9
  let v = r[0x12];
  if (v & 0x80) {                                   // $5200: still moving left
    v = u8(v + 2);                                  // $52F0: brake by 2
    r[0x12] = v;
    return (v & 0x80) ? walkerMoveLeft(state, r, v, wallStopWalker)
      : walkerMoveRight(state, r, v, wallStopWalker);
  }
  const max = r[0x1D];                              // $520B
  v = v + 1 < max ? v + 1 : max;
  r[0x12] = v;
  return walkerMoveRight(state, r, v, wallStopWalker);
}

/** ROM: loc_01_52FB - mirror. */
function walkerWalkLeft(state, r) {
  r[5] = 1;                                         // $52FE
  let v = r[0x12];
  if (v !== 0 && (v & 0x80) === 0) {                // $5306/$5309: moving right
    v = u8(v - 2);                                  // $538D
    r[0x12] = v;
    return (v & 0x80) ? walkerMoveLeft(state, r, v, wallStopWalker)
      : walkerMoveRight(state, r, v, wallStopWalker);
  }
  const min = u8(-r[0x1D]);                         // $5315
  v = u8(v - 1);
  if (v < min) v = min;                             // $531D: unsigned clamp
  r[0x12] = v;
  return walkerMoveLeft(state, r, v, wallStopWalker);
}

/** ROM: loc_01_50F7 - airborne (or mid-anim): move at r[$12], sign-split. */
function walkerAirMove(state, r) {
  const v = r[0x12];
  return (v & 0x80) ? walkerMoveLeft(state, r, v, wallStopWalker)
    : walkerMoveRight(state, r, v, wallStopWalker);
}

// ---------------------------------------------------------------------------
// State 2 -- walker+jump (levels 5, 7, 13).  ROM: jt_01_5399.
// ---------------------------------------------------------------------------

function stWalkerJump(state, r) {
  if (r[0] & 0x03) return wjAirMove(state, r);      // $539B
  const f1 = r[1];
  if (f1 & 0x60) {                                  // $53C0
    r[0] &= ~0x20;                                  // $5484
    return wjAirMove(state, r);
  }
  if (f1 & 0x10) {                                  // $53CA: committed walk
    if (r[0x15] === 0) { r[1] &= ~0x10; return riseTail(state, r); }  // $54A1
    r[0x15]--;
    return r[5] === 0 ? wjWalkRight(state, r) : wjWalkLeft(state, r);
  }

  const psx = playerScreenX(state);
  const diff = u8(psx - r[7]);                      // $53D4
  if (diff === 0) return wjPause(state, r);         // $53D7
  const playerLeft = psx < r[7];
  const ad = playerLeft ? u8(-diff) : diff;

  if (ad < 0x18) {                                  // $53DF
    if (ad < 8) return wjPause(state, r);           // $5448
    if (absDiff8(playerScreenY(state), r[8]) >= 0x20) {   // $545A
      return wjWalkToward(state, r, playerLeft);
    }
    requestSound(state, 0x1C);                      // $5460: melee lunge
    r[0] |= 0x08;                                   // $5466
    r[5] = playerLeft ? 1 : 0;                      // $546D
    r[0x14] = 0x1F;                                 // $5479
    r[0] &= ~0x20;
    return fallTail(state, r);
  }
  if (ad < 0x30) return wjWalkToward(state, r, playerLeft);   // $53E3
  // Far band:
  if (playerScreenY(state) === r[8]) {              // $53EC: EXACT row match
    r[5] = playerLeft ? 1 : 0;                      // $540F
    if (spawnProjectile(state, r, 1) === 0) {       // $541E: sub_01_6BDC mode 1
      r[0] = (r[0] & ~0x20) | 0x10;                 // $5427: ranged attack
      r[0x14] = 0x0F;                               // $542F
    }
    return fallTail(state, r);
  }
  r[5] = playerLeft ? 1 : 0;                        // $53F1: idle facing player
  r[0] |= 0x20;                                     // $53FE
  r[0x12] = 0;
  return fallTail(state, r);
}

/** ROM: loc_01_54AC - commit to the current facing for $28 frames (no turn). */
function wjPause(state, r) {
  r[1] = (r[1] & 0xF3) | 0x10;
  r[0x15] = 0x28;                                   // $54B8
  return riseTail(state, r);
}

/** ROM: loc_01_5437 */
function wjWalkToward(state, r, playerLeft) {
  r[0] &= ~0x20;
  return playerLeft ? wjWalkLeft(state, r) : wjWalkRight(state, r);
}

/** ROM: loc_01_54C0 - identical accel to state 1, different wall behaviour. */
function wjWalkRight(state, r) {
  r[5] = 0;
  let v = r[0x12];
  if (v & 0x80) {
    v = u8(v + 2);                                  // $5554
    r[0x12] = v;
    return (v & 0x80) ? walkerMoveLeft(state, r, v, wallStopWalkerJump)
      : walkerMoveRight(state, r, v, wallStopWalkerJump);
  }
  const max = r[0x1D];
  v = v + 1 < max ? v + 1 : max;
  r[0x12] = v;
  return walkerMoveRight(state, r, v, wallStopWalkerJump);
}

/** ROM: loc_01_555F */
function wjWalkLeft(state, r) {
  r[5] = 1;
  let v = r[0x12];
  if (v !== 0 && (v & 0x80) === 0) {
    v = u8(v - 2);                                  // $559E
    r[0x12] = v;
    return (v & 0x80) ? walkerMoveLeft(state, r, v, wallStopWalkerJump)
      : walkerMoveRight(state, r, v, wallStopWalkerJump);
  }
  const min = u8(-r[0x1D]);
  v = u8(v - 1);
  if (v < min) v = min;
  r[0x12] = v;
  return walkerMoveLeft(state, r, v, wallStopWalkerJump);
}

/** ROM: loc_01_53A3 */
function wjAirMove(state, r) {
  const v = r[0x12];
  return (v & 0x80) ? walkerMoveLeft(state, r, v, wallStopWalkerJump)
    : walkerMoveRight(state, r, v, wallStopWalkerJump);
}

// ---------------------------------------------------------------------------
// Shared walker movement: move + probe + ledge scan.
// ---------------------------------------------------------------------------

/** ROM: loc_01_521B (state 1) / loc_01_54E5 (state 2). */
function walkerMoveRight(state, r, v, wallStop) {
  addX(r, i8(v));                                   // sub_01_63AD
  if (probeRight(state, r) !== 0) {                 // sub_01_63B4
    r[0x0F] = 0x80;                                 // $5225: snap X-lo to centre
    return wallStop(state, r);
  }
  return ledgeCheck(state, r, +1);                  // loc_01_5288
}

/** ROM: loc_01_5329 / loc_01_558D. */
function walkerMoveLeft(state, r, v, wallStop) {
  addX(r, i8(v));
  if (probeLeft(state, r) !== 0) {                  // sub_01_6499
    r[0x0F] = 0x80;
    return wallStop(state, r);
  }
  return ledgeCheck(state, r, -1);                  // loc_01_5339
}

/**
 * ROM: loc_01_5228 (state 1). Just hit a wall: clear the walk commitments,
 * then -- if grounded and not mid-animation -- react. r[1] bit 7 latches so a
 * wall is reacted to once: first contact turns (or, via the wall-ahead assist
 * in the probe, jumps), the next merely stops.
 */
function wallStopWalker(state, r) {
  r[0x15] = 0;                                      // $522C
  r[1] &= ~0x10;                                    // $5232
  r[0] &= ~0x08;                                    // $5237
  if (r[0] & 0x01) return riseTail(state, r);       // $5239
  if (r[0] & 0x02) return fallTail(state, r);       // $523E
  const f1 = r[1];                                  // $5244
  if (f1 & 0x60) return riseTail(state, r);         // $5245 -> $552B
  if (f1 & 0x80) {                                  // $524F: latched -- stop
    r[1] = f1 & 0x7F;
    r[0x12] = 0;                                    // $525B
    return riseTail(state, r);
  }
  turnHard(state, r, f1);                           // $5262
  return riseTail(state, r);
}

/** ROM: loc_01_54F3 (state 2) - same, but the turn keeps its facing. */
function wallStopWalkerJump(state, r) {
  r[0x15] = 0;
  r[1] &= ~0x10;
  r[0] &= ~0x08;
  if (r[0] & 0x01) return riseTail(state, r);
  if (r[0] & 0x02) return fallTail(state, r);
  const f1 = r[1];
  if (f1 & 0x60) return riseTail(state, r);
  if (f1 & 0x80) {                                  // $551C
    r[1] = f1 & 0x7F;
    r[0x12] = 0;
    return riseTail(state, r);
  }
  // $5531: unlike state 1 this does NOT flip the facing -- it pushes on into
  // the wall at +-$12, relying on the wall-ahead jump assist to clear it.
  r[1] = f1 | 0xC0;
  r[0x12] = r[5] === 0 ? 0x12 : 0xEE;               // $5540 / $5544
  r[0x18] = 8;                                      // $554B
  return riseTail(state, r);
}

/** ROM: loc_01_5262 - flip facing, walk away at +-$10, start the turn anim. */
function turnHard(state, r, f1) {
  r[1] = f1 | 0xC0;                                 // $5262
  r[5] ^= 1;                                        // $526A
  r[0x12] = r[5] === 0 ? 0x10 : 0xF0;               // $5274 / $5278
  r[0x18] = 8;                                      // $527F
}

/**
 * ROM: loc_01_5288 (rightward) / loc_01_5339 (leftward).
 *
 * After an unobstructed step, scan the column half a metatile ahead (+$80
 * going right, -$90 going left) from one row below the feet down to the world
 * bottom. Any solid cell = ground is coming, keep walking (and re-assert the
 * facing). A completely empty column is a pit: consult the per-level leap
 * table (sub_01_7D09) and either jump it or turn around.
 *
 * Quirk kept: the scan row starts at (Yhi+1) & $0F but ITERATES $20-(Yhi+1)
 * times, so an enemy in the lower half of the map scans past its own column
 * bottom into the top rows of the NEXT column.
 */
function ledgeCheck(state, r, dir) {
  if (r[0] & 0x03) return riseTail(state, r);       // $528F: airborne -- skip
  const x = (r[0x0E] << 8) | r[0x0F];
  const col = u16(x + (dir > 0 ? 0x80 : -0x90)) >> 8;       // $529A / $534B
  const rowBelow = u16(((r[0x10] << 8) | r[0x11]) + 0x100) >> 8;   // $52A6
  let found = false;
  let idx = col * 16 + (rowBelow & 0x0F);           // sub_00_11B9
  for (let n = 0x20 - rowBelow; n > 0; n--, idx++) {
    if (mapCollisionByIndex(state, idx) !== 0) { found = true; break; }  // $52B6
  }
  if (!found) found = gapLeap(state, r);            // $52C5 -> sub_01_7D09
  if (found) {                                      // $52E1 / $537D
    r[5] = dir > 0 ? 0 : 1;
    return riseTail(state, r);
  }
  const f1 = r[1];                                  // $52D4
  if (f1 & 0x60) return riseTail(state, r);
  turnHard(state, r, f1);                           // $52DF -> $5262
  return riseTail(state, r);
}

/**
 * ROM: sub_01_7D09 + tables 1:$7E3F-$7F28.
 *
 * Scripted pit leaps: a per-level nibble table indexed by Xhi>>1 (even column
 * = high nibble) names one of 14 canned {Yvel, Xvel} pairs. Nonzero = launch
 * immediately (bit 0 set right here, unlike the wall jump which waits out the
 * turn animation).
 */
/**
 * Per-level base offsets into `gapTable`, plus the column guard each is paired
 * with. These are IMMEDIATES in the dispatch at $7D2E-$7D5F, not a pointer
 * table, so they belong next to the code rather than in the manifest.
 *
 * Levels 7 and 13 share $7EDC and the same $4C guard -- that is not a typo.
 * There is a sixth arm at $7D59 (guard $4E, table $7F02) that nothing jumps
 * to: the JR at $7D57 steps over it, and the disassembler finds no xref. It
 * is dead on the cartridge, so no level maps to it here either.
 */
const GAP_BASE = { 1: 0x00, 2: 0x40, 3: 0x50, 5: 0x78, 7: 0x9D, 0x0D: 0x9D };
/** Column past which each guarded level stops leaping. $7D39/$7D44/$7D4F. */
const GAP_GUARD = { 3: 0x43, 5: 0x4A, 7: 0x4C, 0x0D: 0x4C };

function gapLeap(state, r) {
  const lvl = state.level.number;
  const xhi = r[0x0E];
  if (xhi >= (GAP_GUARD[lvl] ?? 0x100)) return false;
  const base = GAP_BASE[lvl];
  if (base === undefined) return false;             // $7D2B
  const table = state.tables?.gapTable;
  const leaps = state.tables?.gapLeaps;
  // Levels 1, 2, 3, 5, 7 and 13 all reach this. A missing table would silently
  // turn every scripted leap into a turn-around, which looks like plausible
  // enemy behaviour -- so refuse to guess.
  if (!table || !leaps) {
    throw new Error('gapLeap: tables.gapTable/gapLeaps missing from the manifest');
  }
  const byte = table[base + (xhi >> 1)] ?? 0;
  const id = (xhi & 1) ? (byte & 0x0F) : (byte >> 4);   // $7D63
  if (id === 0 || id > 14) return false;            // $7D71 / $7DB9
  const [yv, xv] = leaps[id - 1];
  r[0x13] = yv;                                     // per-leap launch velocity
  r[0x12] = (r[5] & 1) ? u8(-xv) : xv;              // $7E26: signed by facing
  r[0] |= 0x01;                                     // $7E31: rising, NOW
  return true;
}

// ---------------------------------------------------------------------------
// State 3 -- flyer (levels 9, 10).  ROM: jt_01_55AA.
// ---------------------------------------------------------------------------

function stFlyer(state, r) {
  if (r[0] & 0x03) return flyAirMove(state, r);     // $55AC
  const f1 = r[1];
  if (f1 & 0x60) return flyAirMove(state, r);       // $55D1: keep momentum
  if (f1 & 0x10) {                                  // $55D9: committed flight
    if (r[0x15] === 0) { r[1] &= ~0x10; return riseTail(state, r); }  // $5648
    r[0x15]--;
    return r[5] === 0 ? flyAccelRight(state, r) : flyAccelLeft(state, r);
  }

  const psx = playerScreenX(state);
  const diff = u8(psx - r[7]);                      // $55E2
  if (diff === 0) {                                 // $55E5 -> $5653
    r[1] = (r[1] & 0xF3) | 0x10;
    r[0x15] = 0x10;
    return riseTail(state, r);
  }
  const playerLeft = psx < r[7];
  const ad = playerLeft ? u8(-diff) : diff;
  if (ad < 0x30 && absDiff8(playerScreenY(state), r[8]) < 0x20) {   // $5606
    // $560A: dive. The direction is the CURRENT facing, not the player side.
    r[0] |= 0x08;
    r[3] = 0x30;                                    // $5613: faster flapping
    r[0x12] = r[5] === 0 ? 0x30 : 0xD0;             // $561F / $5624
    return fallTail(state, r);
  }
  return playerLeft ? flyAccelLeft(state, r) : flyAccelRight(state, r);   // $55F1
}

/** ROM: loc_01_55B4 */
function flyAirMove(state, r) {
  const v = r[0x12];
  return (v & 0x80) ? flyMoveLeft(state, r, v) : flyMoveRight(state, r, v);
}

/** ROM: loc_01_5667 */
function flyAccelRight(state, r) {
  r[5] = 0;
  let v = r[0x12];
  if (v & 0x80) {
    v = u8(v + 2);                                  // $56DC
    r[0x12] = v;
    return (v & 0x80) ? flyMoveLeft(state, r, v) : flyMoveRight(state, r, v);
  }
  const max = r[0x1D];
  v = v + 1 < max ? v + 1 : max;
  r[0x12] = v;
  return flyMoveRight(state, r, v);
}

/** ROM: loc_01_5712 */
function flyAccelLeft(state, r) {
  r[5] = 1;
  let v = r[0x12];
  if (v !== 0 && (v & 0x80) === 0) {
    v = u8(v - 2);                                  // $5750
    r[0x12] = v;
    return (v & 0x80) ? flyMoveLeft(state, r, v) : flyMoveRight(state, r, v);
  }
  const min = u8(-r[0x1D]);
  v = u8(v - 1);
  if (v < min) v = min;
  r[0x12] = v;
  return flyMoveLeft(state, r, v);
}

/** ROM: loc_01_568C */
function flyMoveRight(state, r, v) {
  addX(r, i8(v));
  if (probeRight(state, r) !== 0) {
    r[0x0F] = 0x40;                                 // $5696: flyer snap point
    return flyWallHit(state, r);
  }
  return flyFree(state, r);
}

/** ROM: loc_01_5740 */
function flyMoveLeft(state, r, v) {
  addX(r, i8(v));
  if (probeLeft(state, r) !== 0) {
    r[0x0F] = 0xB0;                                 // $574A
    return flyWallHit(state, r);
  }
  return flyFree(state, r);
}

/**
 * ROM: loc_01_5699. Wall contact resets the flap speed and (if level) starts
 * the turn animation at the current facing -- whose expiry, like the walkers',
 * fires the +$1C jump. That upward hop is how flyers regain altitude.
 */
function flyWallHit(state, r) {
  r[3] = 0x50;                                      // $569D
  r[0] &= ~0x08;                                    // $56A6
  if (r[0] & 0x01) return riseTail(state, r);
  if (r[0] & 0x02) return fallTail(state, r);
  if ((r[1] & 0x60) === 0) {                        // $56B3
    r[1] |= 0x40;                                   // $56BB
    r[0x12] = r[5] === 0 ? 0x10 : 0xF0;             // $56C9 / $56CD
    r[0x18] = 0x0C;                                 // $56D4
  }
  return riseTail(state, r);
}

/** ROM: loc_01_56E7 - free flight; while diving, probe the player each frame. */
function flyFree(state, r) {
  if ((r[0] & 0x08) === 0) return riseTail(state, r);   // $56ED
  if ((state.frame & 0x07) === 0) requestSound(state, 0x1E);   // $56F2
  if (attackProbe(state, r) === 0xFF) return flyWallHit(state, r);   // $5703
  return riseTail(state, r);
}

// ---------------------------------------------------------------------------
// State 11 -- projectile (spawned by sub_01_6BDC).  ROM: jt_01_59E0.
// ---------------------------------------------------------------------------

function stProjectile(state, r) {
  const t = r[0x14];
  if (t === 0) return projHoming(state, r);         // $59E8
  if (t === 1) return projRehome(state, r);         // $59EB -> $5A1F
  return projDrop(state, r);                        // $59EF
}

/** ROM: $5A92 - sink at up to 8 subpx/frame while flying at the +$12 speed. */
function projHoming(state, r) {
  let v = r[0x13] + 1;
  if (v > 8) v = 8;                                 // $5A95
  r[0x13] = v;
  addY(r, v);
  const spd = r[0x12];
  addX(r, (r[5] & 1) ? -spd : spd);                 // $5AAD
  const res = attackProbe(state, r);                // $5AC2
  if (res === 0) return screenTail(state, r);
  if (res === 0xFF) return projHitPlayer(state, r); // $5AC9
  return projWallBounce(state, r);
}

/** ROM: loc_01_5AD1 - flip, slow to +-$20, switch to the falling drop. */
function projWallBounce(state, r) {
  r[5] ^= 1;
  r[0x12] = r[5] !== 0 ? 0xE0 : 0x20;               // $5AD7 / $5ADB
  r[0x14] = 2;                                      // $5AE3
  const variant = r[6];                             // $5AEA
  if (variant === 2) return projExplode(state, r);
  requestSound(state, variant === 4 || variant === 5 ? 0x19 : 0x1D);
  return screenTail(state, r);
}

/** ROM: loc_01_5B0D - remember the player-relative offset, then re-home. */
function projHitPlayer(state, r) {
  const variant = r[6];
  if (variant === 2) return projExplode(state, r);  // $5B12
  if (variant === 4 || variant === 5) return projWallBounce(state, r);  // $5B0A
  r[0x14] = 1;                                      // $5B22
  r[0x15] = 0x20;
  const delta = u16(state.player.y + neg16q((r[0x10] << 8) | r[0x11]));  // $5B2C
  r[0x17] = delta >> 8;                             // $5B4B
  r[0x18] = delta & 0xFF;
  r[0x19] = state.player.facing === r[5] ? 0 : 1;   // $5B58
  return screenTail(state, r);
}

/** ROM: loc_01_5A1F - a hit projectile snaps back beside the player. */
function projRehome(state, r) {
  r[0x15] = u8(r[0x15] - 1);                        // $5A20
  if (r[0x15] === 0) return projDisable(state, r);
  const pf = state.player.facing;
  const dx = ((pf ^ r[0x19]) & 1) ? 0x60 : -0x60;   // $5A3A-$5A4C
  const x = u16(state.player.x + dx);
  r[0x0E] = x >> 8; r[0x0F] = x & 0xFF;
  const y = u16(state.player.y + neg16q((r[0x17] << 8) | r[0x18]));   // $5A6F
  r[0x10] = y >> 8; r[0x11] = y & 0xFF;
  r[5] = u8(pf ^ r[0x19]);                          // $5A87
  return screenTail(state, r);
}

/** ROM: loc_01_59EF - accelerating fall, X bleeding toward 0; gone at 0. */
function projDrop(state, r) {
  r[0x13] = u8(r[0x13] + 1);                        // $59F0
  addY(r, r[0x13]);                                 // $59F6: UNSIGNED (B = 0)
  let v = r[0x12];
  if (v & 0x80) v = u8(v + 1); else v = u8(v - 1);  // $59FC-$5A09
  if (v === 0) return projDisable(state, r);        // $5A0C
  r[0x12] = v;
  addX(r, i8(v));                                   // $5A19
  return screenTail(state, r);
}

/** ROM: loc_01_5B89 - flags cleared to exactly $40, spawn column zeroed. */
function projDisable(state, r) {
  r[0] = 0x40;
  r[0x0E] = 0;
}

/** ROM: loc_01_5B68 - explosion effect ($C744 + sub_00_0CC2, not modelled). */
function projExplode(state, r) {
  return projDisable(state, r);
}

/**
 * ROM: sub_01_6BDC + templates 1:$6CEA (5 x 32 B).
 *
 * Copies a whole prefab record into slot 6 (or 7), then positions it relative
 * to the spawner by mode and stamps the spawner's facing. Returns 0 on success
 * like the original (callers test for zero).
 */
const PROJECTILE_TEMPLATES = [
  '80000b00000001000000040402020000000030000000ff000000000000000400',
  '80000b00000002000000040402020000000040000000ff000000000000000400',
  '80000b00000003000000070702020000000030000000ff000000000000000700',
  '80000b00000004000000040404040000000038000000ff000000000000000400',
  '80000b00000005000000080808080000000038000000ff000000000000000805',
].map(hexBytes);

function spawnProjectile(state, spawner, mode) {
  for (let slot = 6; slot < SLOTS; slot++) {        // $6BDC / $6CDF
    const t = state.enemies[slot];
    if (t[0] & F_ACTIVE) continue;
    t.set(PROJECTILE_TEMPLATES[(mode >= 1 && mode <= 5 ? mode : 5) - 1]);
    const facing = spawner[5];
    t[5] = facing;                                  // $6C2B
    let dxm = mode === 1 ? 0x100
      : (mode === 2 || mode === 3) ? 0x180
        : mode === 4 ? 0x100 : 0xC0;                // $6C3D-$6C5F
    if (facing !== 0) dxm = neg16q(dxm);            // $6C62
    const x = u16(((spawner[0x0E] << 8) | spawner[0x0F]) + dxm);
    t[0x0E] = x >> 8; t[0x0F] = x & 0xFF;
    const dym = mode === 1 ? 0x20
      : mode === 2 ? -0x60 : mode === 3 ? -0x40 : -0x80;   // $6C85-$6CA3
    const y = u16(((spawner[0x10] << 8) | spawner[0x11]) + dym);
    t[0x10] = y >> 8; t[0x11] = y & 0xFF;
    const lvl = state.level.number;                 // $6CAF
    const id = (lvl === 5 || lvl === 7 || lvl === 8 || lvl === 0x0D) ? 0x1B
      : lvl === 0x0B ? 0x2C : lvl === 0x0C ? 0x1F : 0x28;
    requestSound(state, id);
    return 0;
  }
  return 1;
}

// ---------------------------------------------------------------------------
// State 12 -- dormant shell.  ROM: jt_01_5B95.
// ---------------------------------------------------------------------------

function stDormant(state, r) {
  if (r[0] & 0x08) return screenTail(state, r);     // $5B97
  if (r[0] & 0x02) return fallTail(state, r);       // $5B9B
  if (r[1] & 0x20) return screenTail(state, r);     // $5BA0
  r[2] = 0x01;                                      // $5BA7: wake as a walker
  return screenTail(state, r);
}

// ---------------------------------------------------------------------------
// State 6 -- the level-12 pacing shooter.  ROM: jt_01_57D6.
//
// Distance bands like the walkers, but the signature move is the PACING mode:
// r[1] bits 2/3 latch a fixed walk direction, flipped on every wall contact
// ($596F / $59CC), and while pacing the enemy fires whenever its world COLUMN
// (X hi byte, not screen X) comes within 3 of the player's. The shot sets the
// MELEE bit ($5856 SET 3), which is why hitDispatch routes state 6 through
// jt_01_61B3 rather than the ranged tick.
// ---------------------------------------------------------------------------

function stL12(state, r) {
  if (r[0] & 0x04) return l12Drift(state, r);       // $57D8: stunned -- drift
  const f1 = r[1];                                  // $57F7
  if (f1 & 0x20) {                                  // $57F9: landing anim
    r[0] &= ~0x20;                                  // $5838
    return l12Drift(state, r);                      // $583A -> $57DC
  }
  if (f1 & 0x10) {                                  // $57FE: committed pause
    if (r[0x15] === 0) { r[1] &= ~0x10; return riseTail(state, r); }  // $58EF
    r[0x15]--;                                      // $58DF
    return r[5] === 0 ? l12WalkRight(state, r) : l12WalkLeft(state, r);
  }
  if (f1 & 0x04) {                                  // $5803: pacing right
    if (absDiff8(state.player.x >> 8, r[0x0E]) < 3) return l12Fire(state, r);
    return l12WalkRight(state, r);                  // $591C -> $5935
  }
  if (f1 & 0x08) {                                  // $5808: pacing left
    if (absDiff8(state.player.x >> 8, r[0x0E]) < 3) return l12Fire(state, r);
    return l12WalkLeft(state, r);                   // $592F -> $5989
  }

  const psx = playerScreenX(state);
  const diff = u8(psx - r[7]);                      // $5812
  const playerLeft = psx < r[7];
  const ad = playerLeft ? u8(-diff) : diff;
  if (ad >= 0x40) {                                 // $581A: far band
    if (absDiff8(playerScreenY(state), r[8]) < 0x20) {   // $5829
      return l12Fire(state, r);                     // $583D -> $583E
    }
    r[0] |= 0x20;                                   // $5832: idle
    return riseTail(state, r);
  }
  if (ad < 8) {                                     // $58B2: too close
    r[1] = (r[1] & 0xF3) | 0x10;                    // $58FA: commit the pause
    r[0x15] = 0x20;                                 // $5906
    return riseTail(state, r);
  }
  // $58BA: mid band. Walk toward the player -- or AWAY while r[1] bit 7 (the
  // wall-jump latch, reused here) is set ($58C1 inverts the choice).
  r[0] &= ~0x20;                                    // $58BE
  const goLeft = (r[1] & 0x80) ? !playerLeft : playerLeft;   // $58C7 / $58D0
  return goLeft ? l12WalkLeft(state, r) : l12WalkRight(state, r);
}

/**
 * ROM: loc_01_583E - fire: spawn the mode-2 projectile (result IGNORED,
 * unlike state 2's zero test) and hold the attack pose $0F frames with the
 * MELEE bit. The two muzzle-flash effects ($5860-$58AE, $C744-$C747 +
 * sub_00_0CC2 D=$D7) are not modelled -- same stance as $4E84.
 */
function l12Fire(state, r) {
  if (r[0] & 0x08) return riseTail(state, r);       // $583F: already firing
  spawnProjectile(state, r, 2);                     // $584B: $C72C = 2
  r[0] = (r[0] & ~0x20) | 0x08;                     // $5854 / $5856
  r[0x14] = 0x0F;                                   // $585C
  return riseTail(state, r);
}

/** ROM: loc_01_57DC - stunned / landing: keep moving at the +$12 velocity. */
function l12Drift(state, r) {
  const v = r[0x12];
  return (v & 0x80) ? l12MoveLeft(state, r, v) : l12MoveRight(state, r, v);
}

/** ROM: loc_01_5935 - accelerate right toward the +$1D cap (walker idiom). */
function l12WalkRight(state, r) {
  r[5] = 0;                                         // $5939
  let v = r[0x12];
  if (v & 0x80) {                                   // $593F: moving left still
    v = u8(v + 2);                                  // $5977: brake by 2
    r[0x12] = v;
    return (v & 0x80) ? l12MoveLeft(state, r, v) : l12MoveRight(state, r, v);
  }
  const max = r[0x1D];                              // $5944-$5951
  v = v + 1 < max ? v + 1 : max;
  r[0x12] = v;
  return l12MoveRight(state, r, v);
}

/** ROM: loc_01_5989 - mirror. */
function l12WalkLeft(state, r) {
  r[5] = 1;                                         // $598C
  let v = r[0x12];
  if (v !== 0 && (v & 0x80) === 0) {                // $5995 / $5997
    v = u8(v - 2);                                  // $59D4
    r[0x12] = v;
    return (v & 0x80) ? l12MoveLeft(state, r, v) : l12MoveRight(state, r, v);
  }
  const min = u8(-r[0x1D]);                         // $599C-$59AF
  v = u8(v - 1);
  if (v < min) v = min;                             // unsigned clamp
  r[0x12] = v;
  return l12MoveLeft(state, r, v);
}

/** ROM: loc_01_595A - a wall stops it dead (snap $40, the FLYER's point, not
 *  the walkers' $80) and flips the pacing mode to leftward. */
function l12MoveRight(state, r, v) {
  addX(r, i8(v));
  if (probeRight(state, r) !== 0) {                 // $595D
    r[0x0F] = 0x40;                                 // $5964
    r[0x12] = 0;                                    // $596A
    r[1] = (r[1] & ~0x04) | 0x08;                   // $596F / $5971
  }
  return riseTail(state, r);                        // $5974 / $5982
}

/** ROM: loc_01_59B7 - mirror: snap $B0, mode flips to rightward. */
function l12MoveLeft(state, r, v) {
  addX(r, i8(v));
  if (probeLeft(state, r) !== 0) {                  // $59BA
    r[0x0F] = 0xB0;                                 // $59C1
    r[0x12] = 0;
    r[1] = (r[1] & ~0x08) | 0x04;                   // $59CC / $59CE
  }
  return riseTail(state, r);
}

// ---------------------------------------------------------------------------
// State 5 -- the level-6 vehicle target.  ROM: jt_01_575C.
//
// TRANSCRIPTION ONLY, not oracle-verified: its X is slaved to $FFCA/$FFCB
// (flow.parallaxTrack), which on level 6 is scrolled by the level's own
// UNPORTED sub_00_2CBE branch (loc_00_2EF4) -- measured live on the
// cartridge counting $06F8 down to $01F8 -- so until that branch lands the
// port's record rides a frozen track. Every frame it re-faces the player by
// WORLD X hi (not screen X), re-pins its position, and re-arms the melee
// attack; the muzzle effects ($57B5-$57CE, $C749-$C74C + sub_00_0CF3
// $0100) and the $C74D facing mirror are effect-pool territory, not
// modelled. It DOES run screenTail every frame, so the hit scans see fresh
// +7/+8 bytes.
// ---------------------------------------------------------------------------

function stL6Vehicle(state, r) {
  r[0] |= 0x20;                                     // $575E: SET 5
  r[5] = (state.player.x >> 8) < r[0x0E] ? 1 : 0;   // $5764-$5774 ($FF81 vs +$0E)
  // $5775: $C74D = facing (effect pool) -- not modelled.
  const t = state.flow.parallaxTrack;               // $577A: $FFCA/$FFCB
  const x = u16(((u8((t >> 8) + 5) << 8) | (t & 0xFF)) + 0xC0);
  r[0x0E] = x >> 8;                                 // $578A-$578D
  r[0x0F] = x & 0xFF;
  if (r[0] & 0x08) return screenTail(state, r);     // $5794: mid-attack
  if (r[0] & 0x04) return screenTail(state, r);     // $579D: stunned
  requestSound(state, 0x22);                        // $57A6
  r[0] |= 0x08;                                     // $57AC
  r[0x14] = 0x1F;                                   // $57B2
  // $57B5-$57CE: r[0..3] -> $C749-$C74C + sub_00_0CF3($0100) -- the shot
  // effect, not modelled (same stance as $4E84).
  return screenTail(state, r);                      // $57D3
}

/** ROM: jt_01_6398 - the state-5 attack tick just counts and re-enters. */
function attackTickL6(state, r) {
  if (r[0x14] !== 0) r[0x14]--;                     // $63A0-$63A2
  else r[0] &= 0xC7;                                // $63A6-$63A9
  return stL6Vehicle(state, r);                     // $63A3 / $63AA
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
    if (r[0x16] < 0x0E && state.flow.difficulty !== 0) {   // $6D97-$6D9F
      state.flow.bossRage = 1;                      // $6DA3
      r[0x1C] = 0x38;                               // $6DAC: jump velocity
      r[0x1D] = 0x14;                               // $6DAF: walk cap
      state.enemies[1][0] = 0x80;                   // $6DB4
      state.enemies[2][0] = 0x81;                   // $6DB9
      state.enemies[1][2] = 0x0D;                   // $6DBE: state 13
      state.enemies[2][2] = 0x0D;
      state.enemies[1][0x16] = 0xFF;                // $6DC6
      state.enemies[2][0x16] = 0xFF;
    }
  } else if ((state.frame & 0x07) === 0) {          // $6DCC: afterimage chain
    const s1 = state.enemies[1], s2 = state.enemies[2];
    s2[6] = s1[6]; s2[7] = s1[7]; s2[8] = s1[8];    // $6DD2-$6DE1
    s1[6] = r[6]; s1[7] = r[7]; s1[8] = r[8];       // $6DE4-$6DF1
  }
  if (state.flow.bossHop !== 0) {                   // $6DF4: the spin-freeze
    state.flow.bossHop--;
    return fallTail(state, r);                      // $6E00
  }
  if (r[0] & 0x07) {                                // $6E05-$6E0F
    const v = r[0x12];
    return (v & 0x80) ? boss2MoveLeft(state, r, v) : boss2MoveRight(state, r, v);
  }
  if (r[0] & 0x18) return riseTail(state, r);       // $6E2D
  if (r[1] & 0x10) {                                // $6E34: committed walk
    if (r[0x15] === 0) { r[1] &= ~0x10; return riseTail(state, r); }  // $6F51
    r[0x15]--;                                      // $6F41
    return r[5] === 0 ? boss2WalkRight(state, r) : boss2WalkLeft(state, r);
  }
  if (r[1] & 0x60) {                                // $6E39/$6E3E: mid-anim
    r[0] &= ~0x20;                                  // $6F34
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
  const diff = u8(psx - r[7]);
  if (diff === 0) return boss2MirrorPause(state, r);   // $6E4B -> $6F5C
  const playerLeft = psx < r[7];
  const ad = playerLeft ? u8(-diff) : diff;

  if (ad >= 0x1F) {                                 // $6E53
    if (r[0] & 0x03) return riseTail(state, r);     // $6E5C-$6E63 -> $705D
    if (ad < 0x30) return boss2Walk(state, r, playerLeft);   // $6E6A
    if (ad >= 0x70 && !state.flow.bossRage) {       // $6E6E-$6E76: far idle
      r[5] = playerLeft ? 1 : 0;                    // $6E78-$6E82
      r[0] |= 0x20;                                 // $6E87
      return fallTail(state, r);                    // $6E89
    }
    if (ad < 0x50) {                                // $6E8C: [$30,$50)
      if (!state.flow.bossRage) return boss2Walk(state, r, playerLeft);  // $6E94
      return boss2Hop(state, r);                    // $6E97 -> $6FC4
    }
    // [$50,$70), or >= $70 enraged ($6E9F):
    if (!state.flow.bossRage) return boss2Walk(state, r, playerLeft);    // $6EA3
    r[5] = playerLeft ? 1 : 0;                      // $6EA5-$6EAF: the throw
    if ((r[0] & 0x10) === 0) {                      // $6EB1
      r[0] = (r[0] & ~0x20) | 0x10;                 // $6EB7/$6EB9
      r[0x14] = 0x1F;                               // $6EBE
    }
    return fallTail(state, r);                      // $6EC4
  }
  // Close band, ad < $1F:
  if (ad < 8) return boss2MirrorPause(state, r);    // $6ED8
  if (absDiff8(playerScreenY(state), r[8]) >= 0x20) {   // $6EE0-$6EEA
    if (r[0] & 0x03) return riseTail(state, r);     // $6EEE-$6EF5
    return boss2Walk(state, r, playerLeft);         // $6EF7 -> $6EC7
  }
  if (state.player.iframes !== 0) return boss2MirrorPause(state, r);   // $6EFF
  if (r[0] & 0x18) return riseTail(state, r);       // $6F09-$6F0C
  requestSound(state, 0x1C);                        // $6F10
  r[0] |= 0x08;                                     // $6F16
  r[5] = playerLeft ? 1 : 0;                        // $6F1C-$6F24
  r[0x14] = 0x1F;                                   // $6F29
  r[0] &= ~0x20;                                    // $6F2E
  return riseTail(state, r);                        // $6F30
}

/** ROM: loc_01_6EC7 - clear idle, walk toward the player. */
function boss2Walk(state, r, playerLeft) {
  r[0] &= ~0x20;                                    // $6ECB
  return playerLeft ? boss2WalkLeft(state, r) : boss2WalkRight(state, r);
}

/** ROM: loc_01_6F5C - dead zone: commit for $30 frames, facing the player's
 *  mirror ($FF88 XOR 1). Airborne it just runs the tails. */
function boss2MirrorPause(state, r) {
  if (r[0] & 0x03) return riseTail(state, r);       // $6F5D-$6F63
  r[1] = (r[1] & 0xF3) | 0x10;                      // $6F6E-$6F72
  r[5] = state.player.facing ^ 1;                   // $6F76
  r[0x15] = 0x30;                                   // $6F7F
  return riseTail(state, r);
}

/** ROM: loc_01_6F87/$6F8C - walker-idiom acceleration toward the +$1D cap. */
function boss2WalkRight(state, r) {
  r[5] = 0;                                         // $6F8A
  let v = r[0x12];
  if (v & 0x80) {                                   // $6F91 -> $6FEA
    v = u8(v + 2);
    r[0x12] = v;
    return (v & 0x80) ? boss2MoveLeft(state, r, v) : boss2MoveRight(state, r, v);
  }
  const max = r[0x1D];                              // $6F98-$6FA4
  v = v + 1 < max ? v + 1 : max;
  r[0x12] = v;
  return boss2MoveRight(state, r, v);
}

/** ROM: loc_01_6FF5/$6FFB - mirror. */
function boss2WalkLeft(state, r) {
  r[5] = 1;                                         // $6FF8
  let v = r[0x12];
  if (v !== 0 && (v & 0x80) === 0) {                // $7000-$7005
    v = u8(v - 2);                                  // $703D
    r[0x12] = v;
    return (v & 0x80) ? boss2MoveLeft(state, r, v) : boss2MoveRight(state, r, v);
  }
  const min = u8(-r[0x1D]);                         // $7008-$701B
  v = u8(v - 1);
  if (v < min) v = min;
  r[0x12] = v;
  return boss2MoveLeft(state, r, v);
}

/** ROM: loc_01_6FAC - a wall makes it JUMP (snap $80, vel 0, hop launcher);
 *  an open airborne step re-enters the band logic. */
function boss2MoveRight(state, r, v) {
  addX(r, i8(v));
  if (probeRight(state, r) !== 0) {                 // $6FAF
    r[0x0F] = 0x80;                                 // $6FB7
    r[0x12] = 0;                                    // $6FBF
    return boss2Hop(state, r);                      // falls into $6FC4
  }
  return boss2AirRecheck(state, r);                 // $7048
}

/** ROM: loc_01_7023 - mirror (same $80 snap). */
function boss2MoveLeft(state, r, v) {
  addX(r, i8(v));
  if (probeLeft(state, r) !== 0) {                  // $7026
    r[0x0F] = 0x80;                                 // $702E
    r[0x12] = 0;
    return boss2Hop(state, r);
  }
  return boss2AirRecheck(state, r);
}

/** ROM: loc_01_7048 - the airborne band re-entry. */
function boss2AirRecheck(state, r) {
  if (r[0] & 0x03) return boss2Bands(state, r);     // $704C-$7052 -> $6E43
  return riseTail(state, r);                        // $7054
}

/** ROM: loc_01_6FC4 - boss 1's hop launcher with an 8-frame wind-up. */
function boss2Hop(state, r) {
  r[0] &= ~0x18;                                    // $6FC6/$6FC8
  if (r[0] & 0x01) return riseTail(state, r);       // $6FCA
  if (r[0] & 0x02) return fallTail(state, r);       // $6FCF
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
    r[0] &= 0xC7;
    return riseTail(state, r);
  }
  r[0x14]--;                                        // $61E8
  if (r[0x14] === 7) {                              // $61EA
    if (r[0] & 0x10) spawnProjectile(state, r, 3);  // $620E-$6219
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
  if ((r[0] & 0x01) === 0 ? odd : !odd) return;     // $78A9-$78B8
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
    return boss4Throw(state, r, playerScreenX(state) < r[7]);   // $72D1
  }
  if (r[0x16] < 0x18 && f.bossRage === 0) {         // $7296-$729E: the stagger
    requestSound(state, 0x01, 0x04);                // $72A0: stop the music
    r[0] = (r[0] & 0xE3) | 0x20;                    // $72A9-$72AD
    r[0x14] = 0;                                    // $72B2
    // $72B6 stores $F0 and FALLS INTO $72BB, whose DEC runs the same frame.
    f.bossRage = 0xEF;
    return riseTail(state, r);
  }
  if (r[0] & 0x07) {                                // $72DF-$72E9
    // $72EB: phase 2, player airborne, own attack bits clear: throw NOW.
    if (f.bossRage === 1 && state.player.air !== 0 && (r[0] & 0x18) === 0) {
      return boss4Throw(state, r, playerScreenX(state) < r[7]);   // $72FC
    }
    const v = r[0x12];                              // $7308
    return (v & 0x80) ? boss4MoveLeft(state, r, v) : boss4MoveRight(state, r, v);
  }
  if (r[0] & 0x18) return riseTail(state, r);       // $7324
  if (r[1] & 0x10) {                                // $732B: committed walk
    if (r[0x15] === 0) { r[1] &= ~0x10; return riseTail(state, r); }  // $74A5
    r[0x15]--;                                      // $7495
    return r[5] === 0 ? boss4WalkRightAccel(state, r) : boss4WalkLeftAccel(state, r);
  }
  if (r[1] & 0x60) {                                // $7330/$7335: mid-anim
    r[0] &= ~0x20;                                  // $7488
    return riseTail(state, r);
  }

  const psx = playerScreenX(state);                 // $733E
  const diff = u8(psx - r[7]);
  if (diff === 0) return boss4MirrorPause(state, r);   // $7342 -> $74B0
  const playerLeft = psx < r[7];
  const ad = playerLeft ? u8(-diff) : diff;

  if (ad < 0x18) {                                  // $734A: close band
    if (ad < 8) return boss4MirrorPause(state, r);  // $7437-$743C
    if (absDiff8(playerScreenY(state), r[8]) >= 0x20) {   // $7442-$7449
      return riseTail(state, r);                    // $744D (no walk!)
    }
    if (state.player.iframes !== 0) return boss4MirrorPause(state, r);  // $7453
    if (r[0] & 0x18) return riseTail(state, r);     // $745F
    requestSound(state, 0x1C);                      // $7464
    r[0] |= 0x08;                                   // $746A
    r[5] = playerLeft ? 1 : 0;                      // $7470-$7478
    r[0x14] = 0x1F;                                 // $747D
    r[0] &= ~0x20;                                  // $7482
    return riseTail(state, r);
  }
  if (ad < 0x30) return boss4Walk(state, r, playerLeft, ad);   // $734F
  if (ad >= 0x60 && !f.bossRage) {                  // $7354-$735C: far idle
    r[5] = playerLeft ? 1 : 0;                      // $735E-$7368
    r[0] |= 0x20;                                   // $736D
    return fallTail(state, r);                      // $736F
  }
  if (ad < 0x40) {                                  // $7372: [$30,$40)
    if (!f.bossRage) return boss4Walk(state, r, playerLeft, ad);  // $7376
    return boss4Hop(state, r);                      // $737D -> $7506
  }
  if (ad < 0x50) {                                  // $7385: [$40,$50)
    if (f.bossRage) return boss4Throw(state, r, playerLeft);      // $73AB
    return boss4Walk(state, r, playerLeft, ad);
  }
  // [$50,$60), or >= $60 in phase 2 ($7389):
  if (f.bossRage) return boss4Throw(state, r, playerLeft);        // $738D
  f.bossHop = 1;                                    // $738F: $C741
  r[0] &= 0xDF;                                     // $7398-$739B
  if (playerLeft) {                                 // $739C: RETREAT at 6
    r[0x12] = 0x06;                                 // $739F
    return boss4MoveRight(state, r, 0x06);          // $73A2 -> $74E9
  }
  r[0x12] = 0xFA;                                   // $73A5
  return boss4MoveLeft(state, r, 0xFA);             // $73A8 -> $755E
}

/** ROM: loc_01_73B1 - the throw: face the player, roll the rLY crit exactly
 *  like boss 1's hop (measured reduction: crit <=> $FFB1 < $80), and hold
 *  the ranged pose $3F (crit, sound $29) or $1F frames. */
function boss4Throw(state, r, playerLeft) {
  r[5] = playerLeft ? 1 : 0;                        // $73B3-$73BB
  if (state.frame < 0x80) state.flow.bossCrit = 1;  // $73BC-$73C8: rLY roll
  r[0] = (r[0] & ~0x20) | 0x10;                     // $73CD/$73CF
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
  if (ad >= 0x30) { r[0x1D] = 0x06; state.flow.bossHop = 0; }  // $73F3-$73FF
  else { r[0x1D] = 0x14; state.flow.bossHop = 1; }             // $7401-$7408
  r[0] &= ~0x20;                                    // $7411
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
  r[5] = state.player.facing ^ 1;                   // $74BA
  r[0x15] = 0x30;                                   // $74C3
  return riseTail(state, r);
}

/** ROM: loc_01_74CB / loc_01_74D0 - walker-idiom acceleration. */
function boss4WalkRightStore(state, r) {
  r[5] = 0;                                         // $74CB-$74CF
  return boss4WalkRightAccel(state, r);
}

function boss4WalkRightAccel(state, r) {            // $74D0
  let v = r[0x12];
  if (v & 0x80) {                                   // $74D5 -> $752C
    v = u8(v + 2);
    r[0x12] = v;
    return (v & 0x80) ? boss4MoveLeft(state, r, v) : boss4MoveRight(state, r, v);
  }
  const max = r[0x1D];                              // $74DC-$74E8
  v = v + 1 < max ? v + 1 : max;
  r[0x12] = v;
  return boss4MoveRight(state, r, v);
}

/** ROM: loc_01_7537 / loc_01_753D - mirror. */
function boss4WalkLeftStore(state, r) {
  r[5] = 1;                                         // $7537-$753C
  return boss4WalkLeftAccel(state, r);
}

function boss4WalkLeftAccel(state, r) {             // $753D
  let v = r[0x12];
  if (v !== 0 && (v & 0x80) === 0) {                // $7541-$7547 -> $757E
    v = u8(v - 2);
    r[0x12] = v;
    return (v & 0x80) ? boss4MoveLeft(state, r, v) : boss4MoveRight(state, r, v);
  }
  const min = u8(-r[0x1D]);                         // $754A-$755D
  v = u8(v - 1);
  if (v < min) v = min;
  r[0x12] = v;
  return boss4MoveLeft(state, r, v);
}

/** ROM: loc_01_74F0 - a wall makes it jump (snap $80, hop launcher). */
function boss4MoveRight(state, r, v) {
  addX(r, i8(v));
  if (probeRight(state, r) !== 0) {                 // $74F3
    r[0x0F] = 0x80;                                 // $74FB
    r[0x12] = 0;                                    // $7500
    return boss4Hop(state, r);                      // falls into $7506
  }
  return riseTail(state, r);                        // $758A
}

/** ROM: loc_01_7565 - mirror. */
function boss4MoveLeft(state, r, v) {
  addX(r, i8(v));
  if (probeLeft(state, r) !== 0) {                  // $7568
    r[0x0F] = 0x80;                                 // $7570
    r[0x12] = 0;
    return boss4Hop(state, r);
  }
  return riseTail(state, r);
}

/** ROM: loc_01_7506 - boss 2's hop launcher shape, 8-frame wind-up. */
function boss4Hop(state, r) {
  r[0] &= ~0x18;                                    // $7508/$750A
  if (r[0] & 0x01) return riseTail(state, r);       // $750C
  if (r[0] & 0x02) return fallTail(state, r);       // $7511
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
    r[0] &= 0xC7;
    return riseTail(state, r);
  }
  r[0x14]--;                                        // $630B
  if (r[0x14] === 7) {                              // $630D
    if (!state.flow.bossCrit && (r[0] & 0x10)) {    // $6330-$633A
      spawnProjectile(state, r, 5);                 // $633E-$6343
    }
  } else if (attackProbe(state, r) !== 0xFF) {      // $6316-$631C
    r[1] |= 0x10;                                   // $6323
    r[0x15] = 0x28;                                 // $632A: +$15 -- HL sits
  }                                                 // at +1 before the +$14
  return stBoss4(state, r);                         // add, exactly like
}                                                   // boss 2's $6206

// ---------------------------------------------------------------------------
// State 4 -- the level-14 chaser.  ROM: jt_01_7750.
//
// The Joker's grab-balloon: no physics, no probes -- it just slides 4 units
// per frame toward the player's cached screen X. Within $10 px it latches
// slot 0's r[1] bit 7 (sending the Joker into his walk-away taunt) and takes
// the PLAYER over: slow mode on, and -- once he is low on the screen --
// $FF87 = 8 with the rising state, hoisting him upward. Outside the window
// it releases everything.
// ---------------------------------------------------------------------------

function stChaser(state, r) {
  const psx = playerScreenX(state);                 // $775B vs cached +7
  const diff = u8(psx - r[7]);
  const playerLeft = psx < r[7];
  const ad = playerLeft ? u8(-diff) : diff;
  if (ad >= 0x10) {                                 // $7764
    r[5] = playerLeft ? 1 : 0;                      // $776C-$7777
    addX(r, playerLeft ? -4 : 4);                   // $777C
    state.player.slowMode = 0;                      // $777F-$7780: $FF95
    state.enemies[0][1] &= 0x7F;                    // $7782-$7787: $C269
    return screenTail(state, r);                    // $778A
  }
  state.enemies[0][1] |= 0x80;                      // $778D-$7792
  state.player.slowMode = 1;                        // $779B / $77AA
  if (playerScreenY(state) < 0x60) {                // $7795: $FF94
    state.player.air = 2;                           // $779F-$77A1: $FF80
    return screenTail(state, r);                    // $77A7
  }
  state.player.vy = 8;                              // $77AE-$77B0: $FF87
  state.player.air = 1;                             // $77B2-$77B4: rising
  return screenTail(state, r);                      // $77BA
}

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
  if (r[0x16] < 0x0E && state.flow.difficulty !== 0) {
    state.flow.bossRage = 1;                        // $7068-$7074: $C73D
  }
  if (r[0] & 0x07) {                                // $7079-$7083
    const v = r[0x12];
    return (v & 0x80) ? boss3MoveLeft(state, r, v) : boss3MoveRight(state, r, v);
  }
  if (r[0] & 0x18) return riseTail(state, r);       // $70A1
  if (r[1] & 0x20) {                                // $70A8: landing anim
    r[0] &= ~0x20;                                  // $7186
    return riseTail(state, r);
  }

  const psx = playerScreenX(state);                 // $70B1 vs the cached +7
  const diff = u8(psx - r[7]);                      // (no dead-zone special
  const playerLeft = psx < r[7];                    //  case in this handler)
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
    r[5] = playerLeft ? 1 : 0;                      // $70FA-$7104
    if ((r[0] & 0x18) === 0) {                      // $7105 (always true here)
      r[0] = (r[0] & ~0x20) | 0x10;                 // $710C/$710E: ranged
      r[0x14] = 0x1F;                               // $7114
    }
    return riseTail(state, r);                      // $7119
  }
  // $70C2: far band -- idle, with the patience counter ticking at 30 Hz.
  r[5] = playerLeft ? 1 : 0;                        // $70C6-$70CD
  r[0] |= 0x20;                                     // $70D2
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
  if (r[0] & 0x18) return riseTail(state, r);       // $712C: already attacking
  r[0] |= 0x08;                                     // $7134
  r[5] = playerLeft ? 1 : 0;                        // $713A-$7142
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
  r[0] &= ~0x20;                                    // $7162: RES 5
  if (state.flow.bossCrit) {                        // $7164
    r[0x12] = (r[5] & 1) ? 0xD4 : 0x2C;             // $7171-$717F: +-$2C
  }
  return riseTail(state, r);                        // $7182
}

/** ROM: loc_01_71B0 - move right; a wall kills the whole attack ($C73F too). */
function boss3MoveRight(state, r, v) {
  addX(r, i8(v));
  if (probeRight(state, r) !== 0) {                 // $71B3
    r[0x0F] = 0x40;                                 // $71BB
    r[0x12] = 0;                                    // $71C1
    state.flow.bossCrit = 0;                        // $71C2
    r[0] &= 0xC7;                                   // $71CA
    return riseTail(state, r);
  }
  return boss3EdgeCheck(state, r);                  // $7235
}

/** ROM: loc_01_7209 - mirror (snap $B0). */
function boss3MoveLeft(state, r, v) {
  addX(r, i8(v));
  if (probeLeft(state, r) !== 0) {                  // $720C
    r[0x0F] = 0xB0;
    r[0x12] = 0;
    state.flow.bossCrit = 0;
    r[0] &= 0xC7;
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
  const xhi = r[0x0E];
  if (xhi < 2 || xhi >= 0x0A) {                     // $7236 / $723A
    if ((r[0] & 0x04) === 0) {                      // $7242
      r[0] = (r[0] & 0xC7) | 0x08;                  // $7248-$724D
      r[5] ^= 1;                                    // $7253
      state.flow.bossCrit = 1;                      // $7258
      return boss3Arm(state, r);                    // $725B
    }
    r[0x12] = 0;                                    // $7263: stunned -- stop
  }
  if (state.flow.bossCrit) {                        // $7268
    r[0x1F] = 0x07;                                 // $7277
    attackProbe(state, r);                          // $727A
    r[0x1F] = 0xF6;                                 // $727E
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
    if ((r[5] & 0x01) === 0) v = u8(r[0x12] - 1);   // $6261-$626A
    else v = u8(r[0x12] + 1);                       // $627C-$6281
    if (v === 0) {                                  // $626B / $6282 -> $6293
      state.flow.bossCrit = 0;
      r[0] &= 0xC7;
      return riseTail(state, r);
    }
    r[0x12] = v;
    return (v & 0x80) ? boss3MoveLeft(state, r, v) : boss3MoveRight(state, r, v);
  }
  if (r[0x14] === 0) return boss3AttackExpiry(state, r);   // $622D
  r[0x14]--;
  if (r[0x14] === 7) {                              // $6232
    attackProbe(state, r);                          // $623C
    if (r[0] & 0x10) spawnProjectile(state, r, 4);  // $6241-$624C
  }
  return stBoss3(state, r);                         // $62FB -> $7061
}

/** ROM: loc_01_62A0 - normal-attack expiry: chain a dash while the player
 *  stays in range, upgrade to the crit lunge point-blank. */
function boss3AttackExpiry(state, r) {
  const wasMelee = (r[0] & 0x08) !== 0;             // $62A1/$62A7
  r[0] &= 0xC7;                                     // $62A2
  if (!wasMelee) return riseTail(state, r);         // $62A9: the ranged one
  const psx = playerScreenX(state);                 // $62B1
  const diff = u8(psx - r[7]);
  const playerLeft = psx < r[7];
  const ad = playerLeft ? u8(-diff) : diff;
  if (ad < 0x0C) {                                  // $62B9
    state.flow.bossCrit = 1;                        // $62BD
    return boss3Attack(state, r, playerLeft);       // $62C2 -> $7125
  }
  if (ad >= 0x60) return riseTail(state, r);        // $62C5
  requestSound(state, 0x27);                        // $62CF: chained dash
  r[0] |= 0x08;                                     // $62D6
  r[0x14] = 0x0B;                                   // $62E0
  r[5] = playerLeft ? 1 : 0;                        // $62E6/$62EC
  const v = playerLeft ? 0xD0 : 0x30;               // $62E8/$62EF
  r[0x12] = v;
  return (v & 0x80) ? boss3MoveLeft(state, r, v) : boss3MoveRight(state, r, v);
}

// ---------------------------------------------------------------------------
// State 10 -- Boss 1 (level 4).  ROM: jt_01_7591.
//
// The whole fight is a hop-chase: on the ground the boss reads the player's
// cached screen X, picks a band, and either idles (far), hops toward the
// player (medium / dead-zone), or swings (8..$1B px). The hop is launched
// through the TURN-ANIMATION machinery -- loc_01_76C5 sets r[1] bit 6 with a
// $0F timer and animTick's expiry fires the actual jump -- which is why the
// grounded phase measures ~16 frames on the cartridge (flags $80 f0-f15,
// then $81 rising; hop launch f0/f96/f181/f277, rolls at f15/f111/f196/f292,
// all MEASURED on the 400-frame idle run).
// ---------------------------------------------------------------------------

function stBoss1(state, r) {
  // $7597: below $10 HP on any non-easy difficulty the boss enrages -- the
  // far band stops idling and chases ($75FB reads it back).
  if (r[0x16] < 0x10 && state.flow.difficulty !== 0) {
    state.flow.bossRage = 1;                        // $75A4: $C73D
  }
  if (r[0] & 0x07) {                                // $75A9-$75B3: stunned or
    const v = r[0x12];                              // airborne -- move at +$12
    return (v & 0x80) ? boss1MoveLeft(state, r, v) : boss1MoveRight(state, r, v);
  }
  if (r[0] & 0x18) return riseTail(state, r);       // $75D1: mid-attack
  if (r[1] & 0x60) {                                // $75D8/$75DD: mid-anim
    r[0] &= ~0x20;                                  // $7678: RES 5
    return riseTail(state, r);
  }

  const psx = playerScreenX(state);                 // $75E7 vs the cached +7
  const diff = u8(psx - r[7]);
  if (diff === 0) return boss1MirrorHop(state, r);  // $75EB -> $767D
  const playerLeft = psx < r[7];
  const ad = playerLeft ? u8(-diff) : diff;

  if (ad < 0x1C) {                                  // $75F2: close band
    if (ad < 8) return boss1MirrorHop(state, r);    // $7627: dead zone
    if (absDiff8(playerScreenY(state), r[8]) >= 0x20) {   // $7636
      return boss1MirrorHop(state, r);
    }
    if (state.player.iframes !== 0) return boss1MirrorHop(state, r);  // $763A
    requestSound(state, 0x2B);                      // $7645
    r[0] |= 0x08;                                   // $7648: melee attack
    r[5] = playerLeft ? 1 : 0;                      // $7656
    r[0x14] = 0x1F;                                 // $765D
    r[0] &= ~0x20;                                  // $7660: RES 5
    // $7662: the attack-crit roll, (rLY ^ $FFB1) < $70.
    //
    // APPROXIMATE, and do not let the constant fool you. rLY here is "how many
    // scanlines this frame's logic has burned" -- instruction-level timing, the
    // same thing that makes the $26D0 melee crit unmodellable (§28). An earlier
    // note claimed rLY read "EXACTLY 42 on both measured rolls" and treated it
    // as determinism; hooking 1:$7665 over 3000 frames of level 4 gives SEVEN
    // rolls at FOUR values -- 42, 42, 42, 53, 42, 39, 46.
    //
    // That matters more here than at $5ED8, because the compare is CP $70, not
    // CP $80: `< $70` means the high nibble of (rLY ^ $FFB1) must be <= 6, so
    // ALL FOUR high bits are load-bearing, not just bit 7. $2A is only right
    // while rLY lands in $20-$2F, and the $35 sample already left that band.
    //
    // The constant is kept because it reproduces all seven measured outcomes
    // and nothing better exists without a scanline counter -- but that is luck,
    // not correctness. If a scenario ever diverges HERE, this is why.
    state.flow.bossCrit = ((0x2A ^ state.frame) & 0xFF) < 0x70 ? 1 : 0;
    return riseTail(state, r);                      // $7674
  }
  if (ad < 0x60 || state.flow.bossRage) {           // $75F7 / $75FB: chase
    r[5] = playerLeft ? 1 : 0;                      // $7619-$761F
    return boss1Hop(state, r);                      // $7624 -> $76C5
  }
  r[5] = playerLeft ? 1 : 0;                        // $7604-$760B: far -- idle
  r[0] |= 0x20;                                     // $7610: SET 5
  return fallTail(state, r);                        // $7612 (vx NOT zeroed)
}

/** ROM: loc_01_767D - dead zone / same column: face the player's mirror
 *  (the walkerFacePause quirk again: $FF88 XOR 1, not relative position). */
function boss1MirrorHop(state, r) {
  r[5] = state.player.facing ^ 1;                   // $767F
  return boss1Hop(state, r);                        // $7687
}

/**
 * ROM: loc_01_76C5 - the hop launcher. Clears the attack bits; if already
 * airborne just runs the tails. Grounded it starts the turn animation as a
 * $0F-frame wind-up (animTick's expiry is what actually jumps, exactly like
 * the walkers' wall jump -- and on level 4 that expiry rolls the high-hop
 * crit, see animTick) and aims the horizontal velocity at the player.
 */
function boss1Hop(state, r) {
  r[0] &= ~0x18;                                    // $76C7/$76C9
  if (r[0] & 0x01) return riseTail(state, r);       // $76CB
  if (r[0] & 0x02) return fallTail(state, r);       // $76D0
  r[1] |= 0x40;                                     // $76D6: wind-up
  boss1Aim(state, r);                               // $76DD -> sub_01_79DB
  r[0x18] = 0x0F;                                   // $76E4: turn timer
  return riseTail(state, r);
}

/**
 * ROM: sub_01_79DB - hop aim: r[$12] = floor(|enemyX - playerX| / $4A),
 * negated when the player is left of (or exactly at) the enemy. The negate
 * here is the PROPER 16-bit one (ADD 1 with carry into the high byte), not
 * the neg16q idiom -- do not "fix" one to match the other.
 */
function boss1Aim(state, r) {
  const ex = (r[0x0E] << 8) | r[0x0F];
  const sum = ex + ((0x10000 - (state.player.x & 0xFFFF)) & 0xFFFF);
  const carry = sum > 0xFFFF;                       // $79EF: ADD HL,BC
  let d = sum & 0xFFFF;
  if (!carry) d = (0x10000 - d) & 0xFFFF;           // $79F2: negate, E = 0
  let n = 0;
  while (d >= 0x4A) { d -= 0x4A; n++; }             // $7A05: repeated -$4A
  r[0x12] = carry ? u8(-n) : u8(n);                 // $7A11-$7A17
}

/** ROM: loc_01_76AF - airborne rightward move. A wall snaps X-lo to centre
 *  and ZEROES the velocity (unlike the walkers), then re-enters the hop
 *  launcher -- which, still airborne, just routes to the tails. */
function boss1MoveRight(state, r, v) {
  addX(r, i8(v));                                   // $76AF
  if (probeRight(state, r) !== 0) {                 // $76B2
    r[0x0F] = 0x80;                                 // $76BA
    r[0x12] = 0;                                    // $76BF
    return boss1Hop(state, r);                      // falls into $76C5
  }
  return riseTail(state, r);                        // $7749
}

/** ROM: loc_01_7724 - mirror. */
function boss1MoveLeft(state, r, v) {
  addX(r, i8(v));
  if (probeLeft(state, r) !== 0) {                  // $7727
    r[0x0F] = 0x80;
    r[0x12] = 0;
    return boss1Hop(state, r);
  }
  return riseTail(state, r);
}

// ---------------------------------------------------------------------------
// Shared physics tails: rise -> fall -> land -> screen/anim.
// ---------------------------------------------------------------------------

/**
 * ROM: loc_01_5BB6. Rising phase: gravity 1/frame, apex flips to falling,
 * ceiling probe can snap the head back down. Suspended while the turn
 * animation runs (that is what delays a wall jump until the turn completes).
 */
function riseTail(state, r) {
  if ((r[0] & 0x01) && (r[1] & 0x40) === 0) {
    const v = u8(r[0x13] - 1);                      // $5BC8
    if (v === 0) r[0] = (r[0] & ~0x01) | 0x02;      // $5BCC: apex
    r[0x13] = v;
    addY(r, -i8(v));                                // $5BE3: Y -= vel
    const coll = probeUp(state, r);                 // sub_01_64FA
    if (coll !== 0) {
      if (coll !== 0xFF) {                          // $5BF0 (64FA never returns $FF)
        r[0x10] = u8(r[0x10] + 1);                  // $5C01: push down a row
        r[0x11] = r[0x1A];                          // snap to the blob's head line
      }
      r[0x13] = 0;                                  // $5C06
      r[0] = (r[0] & ~0x01) | 0x02;                 // $5C0B
    }
  }
  return fallTail(state, r);
}

/**
 * ROM: loc_01_5C15. Falling: gravity 3/frame toward terminal $BB (-69), or
 * $F8 (-8) for slow-fall records (r[1] bit 1). Grounded records skip gravity
 * but still probe the floor -- walking off a ledge starts the fall here.
 */
function fallTail(state, r) {
  if (r[0] & 0x02) {
    const term = (r[1] & 0x02) ? 0xF8 : 0xBB;       // $5C25 / $5C29
    let v = u8(r[0x13] - 3);
    if (v < term) v = term;                         // $5C32: unsigned clamp
    r[0x13] = v;
    addY(r, -i8(v));
  }
  const res = probeDown(state, r);                  // sub_01_656A
  if (res === 0) {
    if ((r[0] & 0x03) === 0) {                      // $5C57: ground vanished
      r[0] |= 0x02;
      r[1] &= ~0x60;                                // $5C62
    }
  } else {
    r[0x13] = 0;                                    // $5C6E
    if (r[0] & 0x02) {                              // $5C74: landed from a fall
      r[1] |= 0x20;                                 // landing animation
      r[0x19] = 0x0C;
    }
    r[0] &= ~0x03;                                  // $5C87
    // $5C8F: level 10's lower half is water -- draw behind the surface.
    if (state.level.number === 0x0A && r[0x10] >= 0x14) r[9] = 0x80;
  }
  return screenTail(state, r);
}

/**
 * ROM: loc_01_5CA8 plus the draw path ($5CD3-$6063).
 *
 * Every handler funnels through here. It recomputes the stored screen
 * coordinates (which next frame's distance checks read -- they are one frame
 * stale by design), then runs the ANIMATION state machine, which is not
 * cosmetic: the turn animation's expiry is what actually launches the wall
 * jump. The machine is skipped -- jumps delayed! -- whenever the enemy is
 * outside the 7-row vertical window, on the dark frames of the hit blink, or
 * while paused. The selected metasprite id lands in r[6] ($6063) and the draw
 * is queued for drawEnemies(), preserving the ROM's OAM push order.
 */
function screenTail(state, r) {
  const x = (r[0x0E] << 8) | r[0x0F];
  const y = (r[0x10] << 8) | r[0x11];
  r[7] = u8((u16(x - state.camera.x) >> 4) + 8);            // sub_00_1172
  r[8] = u8((u16((y & 0x0FFF) - state.camera.y) >> 4) + 0x10);

  if (absDiff8(u8((state.camera.y >> 8) + 4), r[0x10]) >= 7) return;   // $5CCA
  const lvl = state.level.number;
  if (r[2] === 0x0B) {                              // $5CD4: projectile draw
    const base = [0x6AF3, 0x6AF5, 0x6AF7, 0x6AF9][r[6] - 1] ?? 0x6AFB;  // $5CDD
    queueDraw(state, ar(base + r[5]), r, 0,         // $5D13 / $5D1A
              lvl === 0x0B || lvl === 0x0E);
    return;
  }
  // $5D20: boss 2's batarang-spin draw. While $C741 holds (the handler head
  // counts it down), the metasprite is $6BA3[facing] with attr 0 via the
  // table-1 path -- the animation machine and blink are skipped entirely.
  if (state.level.bossId === 2 && state.flow.bossHop) {
    queueDraw(state, ar(0x6BA3 + (r[5] & 1)), r, 0, false);   // $5D2D-$5D47
    return;
  }
  // $5D4A: boss 1's crit-hop draw. While $C741 holds, the metasprite comes
  // from a HEIGHT-indexed pose table -- $6BA5 rising, $6BB3 otherwise,
  // indexed |$18 - Yhi| -- instead of the animation machine, and r[6] is NOT
  // updated. On the falling half the spin also attacks BOTH sides: probe at
  // +$10 ahead, facing flipped +$10 behind, then offset 0 at its own centre,
  // facing restored ($5D8D-$5DC2). Landing anim or a stun clears the flag.
  if (state.level.bossId === 1 && state.flow.bossHop) {
    if ((r[1] & 0x20) || (r[0] & 0x04)) {           // $5D5B / $5D61
      state.flow.bossHop = 0;                       // $5DD7
    } else {
      const id = ar(((r[0] & 0x01) ? 0x6BA5 : 0x6BB3)      // $5D6B-$5D74
                    + absDiff8(0x18, r[0x10]));            // $5D77-$5D84
      if (r[0] & 0x02) {                            // $5D8D: falling
        r[0x1E] = 0x10;                             // $5D95
        attackProbe(state, r);                      // $5D9C
        r[5] ^= 1;                                  // $5DA6
        attackProbe(state, r);                      // $5DAB
        r[0x1E] = 0;                                // $5DB4
        attackProbe(state, r);                      // $5DB8
        r[5] ^= 1;                                  // $5DC0
      }
      queueDraw(state, id, r, r[9], true);          // $5DD1: sub_00_0BAF
      return;
    }
  }
  if ((r[0] & 0x04) && (state.frame & 0x08) === 0) return;   // $5DE1: blink
  const alt = lvl === 4 || lvl === 0x0B || lvl === 0x0E;     // $6078 -> 0BAF
  if (state.flow.paused) {                          // $5DF1: draw, no anim tick
    queueDraw(state, r[6], r, r[9], alt);
    return;
  }
  const id = animTick(state, r);
  r[6] = id;                                        // $6063
  // ($606D: sub_00_0F56 bobs the DRAWN Y of a grounded enemy by -2/-3 every
  //  8th frame on levels 6/9/10/11 -- draw-only, not modelled.)
  queueDraw(state, id, r, r[9], alt);
}

/**
 * ROM: $5DFF-$6063 - the animation state machine and metasprite selection.
 * The pose tables live in the ANIM_ROM blob (1:$6891-$6BC0); pointers are
 * per-state, indexed on state-1. Returns the metasprite id.
 */
function animTick(state, r) {
  const st = r[2];
  const facing = r[5];
  const f0 = r[0];
  if (f0 & 0x10) {                                  // $5F39: ranged-attack pose
    // $5F4F-$5F75: 2/7/8 have fixed tables; the DEFAULT arm (state 9) is the
    // one $C73F swaps to $6B7D -- not state 8, as an older comment claimed.
    const base = st === 2 ? 0x6AFD : st === 7 ? 0x6B1D : st === 8 ? 0x6B3D
      : (state.flow.bossCrit ? 0x6B7D : 0x6B5D);    // $5F5B
    return ar(base + ((r[0x14] & 0x3F) >> 2) + (facing << 4));
  }
  if (f0 & 0x08) {                                  // $5F85: melee pose
    let ptr = arw(0x691B + (st - 1) * 2);
    if ((ptr >> 8) !== 0xFF) {                      // $5F98
      // $5F9D-$5FC0: the boss arms shift the pose row by $10. Airborne
      // (bit 0 or 1) it is boss 2's spin; grounded it is the CRIT swing,
      // gated on $C73F and skipped on level 14 ($C73E == 4).
      if (f0 & 0x03) {
        if (state.level.bossId === 2) ptr += 0x10;  // $5FBE
      } else if (state.flow.bossCrit && state.level.bossId !== 4) {
        ptr += 0x10;                                // $5FB2
      }
      return ar(ptr + ((r[0x14] & 0x1F) >> 2) + (facing << 3));
    }
    return walkCycle(state, r, facing);             // $5FDB
  }
  if (f0 & 0x01) {                                  // $5F24: rising pose
    return ar(arw(0x68EF + (st - 1) * 2) + facing);
  }
  if (f0 & 0x02) {                                  // $5F0A: falling pose
    if (st === 7) return ar(0x6B9D + facing);
    if (st === 1) return ar(0x6B9F + facing);
    return ar(arw(0x68EF + (st - 1) * 2) + facing);
  }
  if (f0 & 0x20) {                                  // $5E2B: idle sway
    let ptr = arw(0x6A97 + (st - 1) * 2);
    // $5E3E-$5E4E: the STAGGERED Joker (bossId 4, $C73D still counting,
    // i.e. >= 2) sways from a row 8 further on -- the reeling poses.
    if (state.level.bossId === 4 && state.flow.bossRage >= 2) ptr += 8;
    return ar(ptr + ((state.frame & 0x18) >> 3) + facing * 4);
  }
  if (r[1] & 0x20) {                                // $5E61: landing animation
    if (r[0x19] === 0) { r[1] &= ~0x20; return r[6]; }     // $5E90
    r[0x19]--;
    return ar(arw(0x69F3 + (st - 1) * 2) + ((r[0x19] & 0x0C) >> 2) + facing * 4);
  }
  if (r[1] & 0x40) {                                // $5EA0: turn animation
    if (r[0x18] === 0) {
      r[1] &= ~0x40;                                // $5ECF
      r[0] |= 0x01;                                 // the jump launches NOW
      // $5ED8: on LEVEL 4 (the $FFB0 number, not $C73E) the expiry rolls a
      // crit: (rLY ^ $FFB1) < $80 sets $C741 and adds $10 to the launch
      // velocity -- boss 1's high spinning hop. rLY at this roll MEASURED
      // mid-frame every time (43/45/43/59 over four hops on the 400-frame
      // level-4 idle run), always < $80, so the XOR's high bit is $FFB1's
      // high bit and the roll reduces EXACTLY to `$FFB1 < $80`: a coin flip
      // that flips every 128 frames, deterministic given the frame counter.
      // All four measured outcomes agree (125/50 -> crit, 221/146 -> plain).
      if (state.level.number === 4 && state.frame < 0x80) {
        state.flow.bossHop = 1;                     // $5EEA: $C741
        r[0x13] = u8(r[0x1C] + 0x10);               // $5EF2
        return r[6];
      }
      r[0x13] = r[0x1C];                            // $5EF6: jump velocity
      return r[6];
    }
    r[0x18]--;
    return ar(arw(0x6A53 + (st - 1) * 2) + ((r[0x18] & 0x0C) >> 2) + facing * 4);
  }
  return walkCycle(state, r, facing);
}

/** ROM: loc_01_5FE6 - r[3] = period<<4|subtimer, r[4] = (frames-1)<<4|frame. */
function walkCycle(state, r, facing) {
  const period = r[3] >> 4;
  const sub = (r[3] & 0x0F) + 1;
  let frame;
  const hi = r[4] >> 4;
  if (sub < period) {                               // $5FF5 -> $601C
    r[3] = (period << 4) | sub;
    frame = r[4] & 0x0F;
  } else {
    r[3] = period << 4;                             // $5FF9
    frame = (r[4] & 0x0F) + 1;
    if (frame < hi + 1) r[4] = (hi << 4) | frame;   // $6013
    else { frame = 0; r[4] = hi << 4; }             // $6009
  }
  // $602A: offset = facing * frames + frame (the ADD loop), frames = hi+1.
  let idx = arw(0x6891 + (r[2] - 1) * 2) + facing * (hi + 1) + frame;
  // $6046-$605A: on level 14, a state-9 record with $C741 set reads its walk
  // poses 4 further on -- the Joker's cane-out row. $C741 here is the band
  // flag boss4Walk/the retreat maintain, not the boss-1/2 meaning.
  if (state.level.number === 0x0E && state.flow.bossHop !== 0 && r[2] === 9) {
    idx += 4;
  }
  return ar(idx);
}

function queueDraw(state, id, r, attr, alt) {
  if (!state.enemyDraws) state.enemyDraws = [];
  state.enemyDraws.push({ id, x: r[7], y: r[8], attr, alt });
}

/**
 * Flush the frame's queued enemy sprites. ROM: sub_00_0BC6 pushes during the
 * enemy driver itself; queueing keeps that OAM order (parity-alternating slot
 * order included) while letting main.js own the manifest. Levels $04/$0B/$0E
 * draw from the alternate table 5:$736B (sub_00_0BAF), the rest from 5:$5F5C.
 */
export function drawEnemies(state, manifest) {
  const q = state.enemyDraws;
  if (!q || !manifest.metasprites) return;
  for (const d of q) {
    const table = d.alt ? manifest.metasprites.table2 : manifest.metasprites.table1;
    // r[7]/r[8] are OAM coordinates (+8, +16); the sprite queue is in screen
    // coordinates, so the hardware offsets come back off here.
    drawMetasprite(state, table, d.id, d.x - 8, d.y - 16, d.attr);
  }
  q.length = 0;
}

/**
 * Metasprite-id tables, 1:$6891-$6BC0: per-state pointer rows (walk $6891,
 * rise/fall $68EF, melee $691B, landing $69F3, turn $6A53, idle $6A97,
 * projectile variants $6AF3, ranged poses $6AFD+). Byte-verified against the
 * ROM. `ar`/`arw` read a byte / little-endian pointer by ROM address.
 */
const ANIM_ROM = hexBytes(
  'a568ad68b568c168cd68d168d968dd68e168e9684f5051524b4c4d4e63646566' +
  '5f6061622223242526271c1d1e1f20213a393b393c393a393b393c39b3b3b3b3' +
  'bcbdbebfb8b9babbd1d3d0d201010000292a292a2c2e2b2d4042443f41430769' +
  '09690b6907690d690f69116913691569176907691969565464602829b3b3c5c2' +
  'e7e60d0c201f52515b5b33694369ffff33695369636973699369b369c369ffff' +
  'e3695a5a5a59595959595858585757575757787a7c7b7a797870737577767574' +
  '736db2b2b1b1b0b0afafaeaeadadacacababc3c3c4c4c4c4c3c3c0c0c1c1c1c1' +
  'c0c0d9d9d9d9d7d7d5d5d8d8d8d8d6d6d4d4ededebebe9e9e9e7ececeaeae8e8' +
  'e8e6151413131313131315141313131313131212121212121210111111111111' +
  '110f282828262624242427272725252323234a4a4a4848464640494949474745' +
  '453f5050504e4e4c4c404f4f4f4d4d4b4b3f9595959594949494959595959494' +
  '94940b6a136a1b6a0b6a0b6a236a2b6a336a3b6a436a0b6a4b6a555555555353' +
  '53536c6c706469696d60492749494a214a4ac5c5c5c5c2c2c2c2d1d1ededd0d0' +
  'ecec0d0d0d0d0c0c0c0c2222222221212121404444443f4343435c5c5c5c5c5c' +
  '5c5c0b6a676a6f6a0b6a0b6a776a7f6a0b6a876a8f6a70706c6c6d6d69692827' +
  '494929214a4ac5c5c5c5c2c2c2c2e7e7d1d1e6e6d0d022222222212121215244' +
  '44405143433fab6ab36affffab6abb6ac36acb6ad36adb6aeb6a5c5c5e5e5c5c' +
  '5e5e7e6a7e6a7d677d67b3b3b3b3b3b3b3b3c5c5c5c5c2c2c2c2cfcfcfcfcece' +
  'cece17171717161616162c2c2c2c2b2b2b2b3838383837373737444442404343' +
  '413f807fc7c6f1f00e0e3e3d7271707070707070ffffffffffffffff6f6e6d6d' +
  '6d6d6d6dffffffffffffffffdfdfdfdddddbdbdbffffffffffffffffdedededc' +
  'dcdadadaffffffffffffffff0b0b090705030101ffffffffffffffff0a0a0806' +
  '04020000ffffffffffffffff30303032321a1b19ffffffffffffffff2f2f2f31' +
  '311a1b19ffffffffffffffff363636363636363636343434341a1b1935353535' +
  '3535353535333333331a1b19edec5d5be1e0efee585656545454545755555353' +
  '53535a5a5c5e5e606259595b5d5d5f61');
const ANIM_BASE = 0x6891;
const ar = (addr) => ANIM_ROM[addr - ANIM_BASE] ?? 0;
const arw = (addr) => ar(addr) | (ar(addr + 1) << 8);

// ---------------------------------------------------------------------------
// The enemy's own collision probe.  ROM: sub_01_6666 and its mode wrappers.
// ---------------------------------------------------------------------------

const collIdx = mapCollisionByIndex;

/**
 * ROM: sub_01_6666. One cell sample at (position + offset), with per-mode
 * empty-cell fallbacks -- the enemy-side mirror of the player's sub_00_20BA.
 *
 * Mode 1/2 (horizontal): on an empty cell, remember the address one COLUMN
 * further in the travel direction in $FFBE (a true HRAM global -- see
 * wallResolve), then sweep the cells above/below within the hitbox. Quirk
 * kept: the sweep reads the RECORD's own Y-lo, not the probe point's.
 *
 * Mode 3/4 (vertical): sweep the cells west/east within the hitbox; mode 4
 * additionally tests the $C1E8 object array so enemies can stand on platforms.
 *
 * Mode 5 (attack): water reads as empty, and an empty cell becomes a
 * screen-space overlap test against the player that deals the 1:$6BC1 contact
 * damage. Returns $FF on a player hit.
 */
function probeCore(state, r, dx, dy, mode) {
  const px = u16(((r[0x0E] << 8) | r[0x0F]) + dx);  // $FFBA/$FFBB
  const py = u16(((r[0x10] << 8) | r[0x11]) + dy);  // $FFBC/$FFBD
  if (py >> 8 >= 0x20) return 0;                    // $6680: below the world
  const idx = (px >> 8) * 16 + ((py >> 8) & 0x0F);  // sub_00_11B9
  const coll = collIdx(state, idx);
  if (coll !== 0 && !(mode === 5 && coll === 0x08)) return coll;   // $6691-$66A0

  if (mode === 5) return attackEmpty(state, r, px, py);            // $6748

  if (mode <= 2) {                                  // $66EA: horizontal
    state.enemyBesideIdx = idx + (mode === 1 ? 16 : -16);          // $FFBE
    const subY = r[0x11] >> 4;                      // $671B: the RECORD's Y-lo
    if (subY < u8(r[0x0C] - 2)) {                   // $6716: pokes above
      const above = collIdx(state, idx - 1);
      if (above !== 0) return above;                // $6735
    }
    if (u8(subY + u8(r[0x0D] - 2)) >= 0x10) {       // $6723: pokes below
      const below = collIdx(state, idx + 1);
      if (below !== 0) return below;                // $673F
    }
    return 0;
  }

  const subX = r[0x0F] >> 4;                        // $66AF: vertical
  if (subX < u8(r[0x0B] - 2)) {                     // $66B4: past the left edge
    const west = collIdx(state, idx - 16);
    if (west !== 0) return west;                    // $66DC
  }
  if (u8(subX + u8(r[0x0A] - 2)) >= 0x10) {         // $66BF: right edge
    const east = collIdx(state, idx + 16);
    if (east !== 0) return east;                    // $66D1
  }
  if (mode === 4) return objectPlatform(state, r, px, py);   // $67C2
  return 0;
}

/**
 * ROM: loc_01_6748 - mode 5 hit the player?
 *
 * Quirks kept: the X window is a fixed 8 px, but the Y window is the player's
 * half-WIDTH ($FF8C), not height; and the invulnerability stamp direction
 * comes from the ENEMY's facing.
 */
function attackEmpty(state, r, px, py) {
  const p = state.player;
  if (p.dead) return 0;                             // $674B: $C715
  const sx = u8((u16(px - state.camera.x) >> 4) + 8);        // sub_00_1172
  const sy = u8((u16((py & 0x0FFF) - state.camera.y) >> 4) + 0x10);
  if (absDiff8(playerScreenX(state), sx) >= 8) return 0;     // $6770
  if (absDiff8(playerScreenY(state), sy) >= p.halfW) return 0;   // $6779
  if (p.iframes !== 0) return 0;                    // $677D

  const t = state.tables;                           // $6790: 1:$6BC1[state]
  let dmg = t.enemyContactDamage[r[2]] ?? 0;
  if (dmg & 0x80) {                                 // $6795: + 1:$6BCE[level-1]
    dmg = (dmg & 0x7F) + (t.levelDamageBonus[state.level.number - 1] ?? 0);
  }
  p.hp = Math.max(0, p.hp - dmg);                   // sub_00_2777
  requestSound(state, 0x12);
  p.iframes = (r[5] & 0x01) ? 0xDA : 0x5A;          // $67AD: by ENEMY facing
  return 0xFF;
}

/**
 * ROM: loc_01_67CC - mode 4's empty cell can still be an active $C1E8 object.
 * The overlap is tested in SCREEN space at three probe points (centre, -7 px,
 * +6 px) against the object's +7/+8 bytes as half-extents and its +9/+10 as
 * screen coordinates; a hit snaps the enemy on top and lands it ($FF).
 * (actors.js does not maintain +9/+10 yet -- blob values are used as-is.)
 */
function objectPlatform(state, r, px, py) {
  const sx = u8((u16(px - state.camera.x) >> 4) + 8);        // $67D6
  const sy = u8((u16((py & 0x0FFF) - state.camera.y) >> 4) + 0x10);
  for (let slot = 0; slot < 8; slot++) {            // $67E1
    const a = state.actors[slot];
    if ((a[0] & 0x80) === 0) continue;              // $67EB
    const halfW = a[7], halfH = a[8];               // $67F6: -> $C75A/$C72E
    if (a[3] < 0x10 || a[3] >= 0x20) continue;      // $6806
    const ox = a[9], oy = a[10];                    // $6813
    let hit = absDiff8(ox, sx) < halfW;             // $682A
    if (!hit) hit = absDiff8(ox, u8(sx + 0xF9)) < halfW;     // $6837: -7 px
    if (!hit) hit = absDiff8(ox, u8(sx + 0x06)) < halfW;     // $6844: +6 px
    if (!hit) continue;
    if (absDiff8(oy, sy) >= halfH) continue;        // $684E
    const c = u8(r[0x0D] + halfH - 1);              // $685C
    const ny = u16(((a[3] << 8) | a[4]) + neg16q((c << 4) & 0xFFFF));  // $6874
    r[0x10] = ny >> 8;                              // $6879
    r[0x11] = ny & 0xFF;
    return 0xFF;
  }
  return 0;
}

/**
 * ROM: sub_01_63B4 (rightward) / sub_01_6499 (leftward): probe at the hitbox
 * edge, resolve the collision class, and -- when the edge cell is empty but
 * the NEXT column over is not -- run the wall-ahead assist.
 */
function probeRight(state, r) {
  return wallResolve(state, r, probeCore(state, r, r[0x0A] << 4, 0, 1), 1);
}

function probeLeft(state, r) {
  return wallResolve(state, r, probeCore(state, r, -(r[0x0B] << 4), 0, 2), 2);
}

/** ROM: $63E8 / $64CF - shared tail of both horizontal probes. */
function wallResolve(state, r, coll, mode) {
  if (coll === 0x02 || coll === 0x03) return 1;     // conveyors are walls
  if (coll === 0x08) { r[9] = 0x80; return 0; }     // $648A: water
  if (coll === 0xFD) return 1;                      // spikes
  if ((coll & 0x1F) === 0x1F) return 1;             // doors (catches $FF too)
  if (coll >= 0x20) return 0;                       // pickups pass through
  if (coll !== 0) return coll;
  // $640C: the probed cell is empty -- read the beside-cell address the
  // EMPTY-CELL PATH stored in $FFBE. If the probe bailed before storing it
  // (off-world) this reads a STALE address from an earlier probe. Reproduced:
  // state.enemyBesideIdx persists across probes, slots and frames.
  if (collIdx(state, state.enemyBesideIdx) === 0) return 0;
  wallAhead(state, r, mode);                        // $6415
  return 0;
}

/**
 * ROM: loc_01_6415 - a wall is coming one column ahead. Point the record at
 * it and, on alternate encounters (r[1] bit 7 latch), JUMP: rising with the
 * +$1C velocity, at +-$0C horizontally. This is the state-2 "walker+jump"
 * signature move, but it applies to every non-boss state.
 */
function wallAhead(state, r, mode) {
  const st = r[2];
  if (st === 6 || st === 7 || st === 8) return;     // $641C
  if (r[1] & 0x60) return;                          // $6429: mid-animation
  if (r[0] & 0x03) return;                          // $6431: airborne
  const boss4 = state.level.bossId === 4;           // $643D: $C73E
  if (boss4 ? mode !== 2 : mode === 2) {            // $6444 / $644D
    r[5] = 1; r[0x12] = 0xF4;                       // $645A
  } else {
    r[5] = 0; r[0x12] = 0x0C;                       // $6454
  }
  if (r[1] & 0x80) { r[1] &= 0x7F; return; }        // $6468: latch alternates
  r[1] |= 0x80;                                     // $6470
  r[0] = (r[0] & 0xC7) | 0x01;                      // rising
  r[0x13] = r[0x1C];                                // $647D: jump velocity
}

/** ROM: sub_01_64FA - ceiling probe (mode 3), offset -halfH-up. */
function probeUp(state, r) {
  const coll = probeCore(state, r, 0, -(r[0x0C] << 4), 3);
  if (coll === 0x02 || coll === 0x03) return 1;
  if (coll === 0x08) { r[9] = 0x80; return 0; }
  if (coll === 0xFD) {                              // $6542 -> $6552: spikes
    if ((r[0] & 0x04) === 0) {
      r[0] |= 0x04;                                 // stun + blink
      r[0x17] = 0x3C;
      r[0x16] = u8(r[0x16] - 1);                    // $6565: spikes cost 1 HP
    }
    return 0;
  }
  if ((coll & 0x1F) === 0x1F) return 1;
  if (coll >= 0x20) return 0;
  return coll;
}

/**
 * ROM: sub_01_656A - floor probe (mode 4), offset +halfH-down. Nonzero means
 * "landed"; most solids snap Y so the feet sit exactly on the probed row
 * (spikes included -- enemies stand on spikes unharmed). $FF (runtime solid,
 * or the object-platform hit which snapped Y itself) lands WITHOUT the snap.
 */
function probeDown(state, r) {
  const dy = r[0x0D] << 4;
  const coll = probeCore(state, r, 0, dy, 4);
  if (coll === 0x02 || coll === 0x03) {             // $65EE / $6602: conveyor
    r[0x11] = r[0x1B];                              // snap to the blob's foot line
    addX(r, coll === 0x02 ? 4 : -4);
    return 1;
  }
  if (coll === 0x08) { r[9] = 0x80; return 0; }
  if (coll === 0xFD) return floorSnap(state, r, dy);   // $65AA -> $65C0
  if (coll === 0xFF) return 0xFF;                   // $65AE
  if ((coll & 0x1F) === 0x1F) return 1;
  if (coll >= 0x20) return 0;
  if (coll === 0) return 0;
  return floorSnap(state, r, dy);                   // $65BE falls into $65C0
}

/** ROM: loc_01_65C0 - Y = probedRow*256 - halfH-down*16. */
function floorSnap(state, r, dy) {
  const row = u16(((r[0x10] << 8) | r[0x11]) + dy) >> 8;   // $FFBC
  const ny = u16((row << 8) - dy);
  r[0x10] = ny >> 8;
  r[0x11] = ny & 0xFF;
  return 1;
}

/**
 * ROM: sub_01_6616 - the attack probe: mode 5 at the record's +$1E/+$1F
 * offsets (X negated when facing left, Y sign-extended), both in pixels.
 */
function attackProbe(state, r) {
  let dx = (r[0x1E] << 4) & 0xFFFF;
  if (r[5] & 0x01) dx = neg16q(dx);                 // $6639
  const dy = u16(i8(r[0x1F]) << 4);                 // $6648
  return probeCore(state, r, dx, dy, 5);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** ROM: sub_01_63AD - 16-bit big-endian add on the record. */
function addX(r, d) {
  const v = u16(((r[0x0E] << 8) | r[0x0F]) + d);
  r[0x0E] = v >> 8;
  r[0x0F] = v & 0xFF;
}

function addY(r, d) {
  const v = u16(((r[0x10] << 8) | r[0x11]) + d);
  r[0x10] = v >> 8;
  r[0x11] = v & 0xFF;
}

/**
 * The ROM's 16-bit negate idiom (CPL both bytes, +1 unless the complemented
 * low byte is already zero). For lo = $FF the +1 is skipped and the result is
 * short by $100 -- kept faithful; see $6639, $6C68, $5B30.
 */
function neg16q(v) {
  const lo = u8(~v), hi = u8(~(v >> 8));
  return lo === 0 ? hi << 8 : u16((hi << 8) + lo + 1);
}

/** 8-bit absolute difference, as the SUB / JR NC / CPL / INC idiom computes. */
function absDiff8(a, b) {
  return (a & 0xFF) >= (b & 0xFF) ? u8(a - b) : u8(b - a);
}

/** ROM: $1B4A -> sub_00_1172. $FF93/$FF94 recomputed from live state; the
 *  original stores them each frame before the enemy driver runs. */
function playerScreenX(state) {
  return u8((u16(state.player.x - state.camera.x) >> 4) + 8);
}

function playerScreenY(state) {
  return u8((u16((state.player.y & 0x0FFF) - state.camera.y) >> 4) + 0x10);
}

/** ROM: sub_00_0AE1 mailbox. */
function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) {
    state.sound.queue.push({ id, mask });
  }
}

// Exposed for the unit tests only.
export const _internals = {
  probeCore, probeRight, probeLeft, probeUp, probeDown, attackProbe,
  wallAhead, gapLeap, ledgeCheck, spawnProjectile, riseTail, fallTail,
  screenTail, neg16q, absDiff8, stunnedTick, primaryDispatch,
};
