// Player melee against the enemy array.
//
// ROM range: loc_00_2643-$272B -- the punch probe's ($C72B = 5) enemy scan,
// reached from sub_00_20BA only when the probe row is above $20 and the map
// cell at the probe point is empty or water.
//
// This is NOT part of the enemy driver: it runs from the PLAYER's update, one
// frame after the driver wrote the +7/+8 screen bytes it reads, and no driver
// ordering depends on it. Its only consumers are src/player.js (through the
// src/enemies.js barrel) and tools/oracle/punchreach.mjs.
//
// SLOTS and F_ACTIVE come from enemies/record.js, NOT from the barrel. Taking
// them from src/enemies.js would work -- ES modules tolerate it and the port
// already has a state.js <-> enemies.js cycle -- but it would put the punch
// scan back in the driver's dependency ring for two constants. record.js
// exists so it does not have to.

import { u8, u16 } from '../state.js';
import {
  SLOTS, F_ACTIVE,
  E_FLAGS, E_STATE, E_SCREEN_X, E_SCREEN_Y, E_BOX_L, E_BOX_U, E_HP,
} from './record.js';
import { absDiff8, requestSound } from './util.js';
import { c740Idle } from '../effects.js';
import { spawnEffect } from '../doors.js';

/** @typedef {import('../gametypes.js').GameState} GameState */

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
 * @param {GameState} state
 */
export function meleeHitTest(state, probeX, probeY) {
  const p = state.player;
  const t = state.tunables;

  // $2643, the scan's HEAD -- mode 5 enters here via $243E, so this guard runs
  // before a single slot is looked at. The Joker is immune while staggering:
  // stBoss4 runs $C73D down from $EF, so `>= 2` holds for roughly 238 frames
  // after each stagger. The batarang has the identical gate at $3C56.
  if (state.level.bossId === 4 && state.flow.bossRage >= 2) return 0;

  // $2430 / sub_00_1172: world -> screen, same formula as screenTail below.
  const probeSX = u8((u16(probeX - state.camera.x) >> 4) + 8);
  const probeSY = u8((u16((probeY & 0x0FFF) - state.camera.y) >> 4) + 0x10);

  for (let slot = 0; slot < SLOTS; slot++) {
    const r = state.enemies[slot];
    if ((r[E_FLAGS] & F_ACTIVE) === 0) continue;    // $2660
    const st = r[E_STATE];
    if (st === 0x0D || st === 0x0B || st === 0x04) continue;   // $2667-$2673

    const halfW = u8(r[E_BOX_L] - 1);               // $2685: DEC A
    const halfH = r[E_BOX_U];

    // --- X ($268D): strict <, then one retry 8 px back toward the player.
    if (absDiff8(r[E_SCREEN_X], probeSX) >= halfW) {
      const back = u8(p.facing === 0 ? probeSX - 8 : probeSX + 8);  // $269B/$26A0
      if (absDiff8(r[E_SCREEN_X], back) >= halfW) continue;  // $26AA
    }
    // --- Y ($26AD): strict <, no retry.
    if (absDiff8(r[E_SCREEN_Y], probeSY) >= halfH) continue; // $26B3

    // $26B7: `LD A,[$C740] / CP $FF / JR NZ` -- $C740, and it is NOT $C750.
    // This used to read flow.bossMode with a note saying "revisit when bosses
    // land". They have. The two bytes agree on level 14's entrance and nowhere
    // else: 1:$4EF1 stamps $C740 = $FE when a boss dies and 1:$78CC/$7936 walk
    // it down to 0, so for 255 fully-controllable frames after the kill the
    // cartridge's punch does NOTHING -- no $19, no hit-flash, no damage --
    // while $C750 sits at 0 and the port's punch still connected.
    if (!c740Idle(state)) continue;

    requestSound(state, 0x19);                      // $26BE
    r[E_FLAGS] |= 0x04;                             // $26C4: hit-flash
    r[0x17] = t.enemyStunFrames;                    // $26CA: $3C

    // $26CD: the crit window -- rLY is MODELLED, see the header comment.
    const ly = (state.frame * 7) & 0x7F;
    const crit = ((ly ^ state.frame) & 0xFF) < t.critWindow
                 && state.level.bossId === 0;       // $26D7: $C73E == 0

    const dmg = crit ? r[E_HP] : t.meleeDamage;     // $26E3 vs $26F0
    r[E_HP] = Math.max(0, r[E_HP] - dmg);           // $26F6: SUB, clamp 0
    requestSound(state, crit ? 0x18 : 0x21);

    // $26FC-$271B: the hit spark. The staging bytes take the PLAYER's position
    // ($FF81-$FF84), not the enemy's, nudged one unit along the facing:
    //
    //   26FC  LDH A,[$FF81] / LD B,A     ; x HIGH byte only
    //   26FF  LDH A,[$FF88] / AND A
    //   2702  JR NZ,$2707 -> DEC B       ; facing left
    //   2704  INC B                      ; facing right
    //   2708  $C744 = B, $C745 = $FF82, $C746 = $FF83, $C747 = $FF84
    //   271B  CALL sub_00_0CC2
    //
    // u8() on the HIGH byte alone: INC B / DEC B is an 8-bit op on B and the
    // low byte is copied untouched, so $FF wraps to $00 without borrowing.
    const sparkX = (u8((p.x >> 8) + (p.facing === 0 ? 1 : -1)) << 8) | (p.x & 0xFF);
    // $97 vs $10 is not just a different picture. Bit 7 of byte 0 selects the
    // ANIMATED arm at $13CC -- 22 drawn frames stepping $0F -> $CC -> $CD, and
    // the $17 sound cue at $13E6 -- while $10 takes the plain arm at $13B4: 16
    // frames, one sprite, silent. See the effect-pool header in src/doors.js.
    //
    // The normal arm is checked against the cartridge: doordiff.mjs's
    // l3-punch-enemy records slot 0 = 10 2F 67 18 00 01 at f60 and the 0F..01
    // countdown through f75. The CRIT arm is NOT, and cannot be: it hangs off
    // the crit window a few lines up, which rides the port's MODELLED rLY
    // (see the header of this file) -- so no scenario can be made to reach it
    // on both sides. It is transcribed from $26E4/$26E6 and left unverified,
    // and that is stated here rather than implied by its absence.
    spawnEffect(state, sparkX, p.y, crit ? 0x97 : 0x10, crit ? 0x04 : 0x01);
    return 0xFF;                                    // $271F: first hit only
  }
  return 0;                                         // $272A
}
