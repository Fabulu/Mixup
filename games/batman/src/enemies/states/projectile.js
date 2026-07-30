// State 11 -- the projectile, and the spawner that makes one.
//
// ROM range: jt_01_59E0 with loc_01_59EF/$5A1F/$5A92/$5AD1/$5B0D/$5B68/$5B89,
// plus sub_01_6BDC and its five 32-byte templates at 1:$6CEA.
//
// State $0B has no attackTick of its own -- hitDispatch sends it to
// jt_01_6107, the BASIC tick it shares with states 1 and 4, which stays in
// the driver beside the dispatch table.
//
// sub_01_6BDC LIVES HERE, not in the driver, because what it does is build a
// state-$0B record: it is the projectile's constructor, and every caller
// (states 2 and 6, and bosses 2, 3 and 4) reaches it in one direction only.
// That keeps the dependency arrow pointing at this file and never back out.
//
// THE PER-STATE OFFSET ALIASES DEFERRED FROM PHASE 8 BELONG HERE, and this is
// the file they were deferred FOR: state $0B re-purposes six bytes that mean
// something else in every other state.
//   +$06  a TEMPLATE VARIANT (2 = explodes, 4/5 = bounce), not a metasprite id
//   +$13  a DOWNWARD sink rate; $59F6 adds it UNSIGNED, where every other
//         state's +$13 is an up-positive launch velocity
//   +$14  a PHASE SELECTOR (0 = homing, 1 = re-homing, 2 = dropping) read at
//         $59E8-$59EF, not the attack timer it is elsewhere
//   +$17/+$18  the player-relative Y delta hi/lo, stored at $5B4B and read
//         back at $5A6F -- NOT the stun and turn timers
//   +$19  a facing-XOR flag ($5B58), not the landing timer
// They are deliberately left as raw indices rather than aliased: naming
// +$17 `E_STUN` here and substituting it would produce code that reads as a
// LIE while behaving identically, which is worse than the raw byte because
// the next reader trusts the name. The offsets stay raw and the meanings
// stay written down, here, once.

import { u8, i8, u16 } from '../../state.js';
import { spawnEffect } from '../../doors.js';
import {
  SLOTS, F_ACTIVE,
  E_FLAGS, E_FACING, E_X_HI, E_X_LO, E_Y_HI, E_Y_LO, E_VX,
} from '../record.js';
import { addX, addY, neg16q, requestSound } from '../util.js';
import { attackProbe } from '../probe.js';
import { screenTail } from '../tails.js';

// ---------------------------------------------------------------------------
// State 11 -- projectile (spawned by sub_01_6BDC).  ROM: jt_01_59E0.
// ---------------------------------------------------------------------------

export function stProjectile(state, r) {
  const t = r[0x14];
  if (t === 0) return projHoming(state, r);         // $59E8
  if (t === 1) return projRehome(state, r);         // $59EB -> $5A1F
  return projDrop(state, r);                        // $59EF
}

/** ROM: $5A92 - sink at up to 8 subpx/frame while flying at the +$12 speed. */
export function projHoming(state, r) {
  let v = r[0x13] + 1;
  if (v > 8) v = 8;                                 // $5A95
  r[0x13] = v;
  addY(r, v);
  const spd = r[E_VX];
  addX(r, (r[E_FACING] & 1) ? -spd : spd);          // $5AAD
  const res = attackProbe(state, r);                // $5AC2
  if (res === 0) return screenTail(state, r);
  if (res === 0xFF) return projHitPlayer(state, r); // $5AC9
  return projWallBounce(state, r);
}

/** ROM: loc_01_5AD1 - flip, slow to +-$20, switch to the falling drop. */
export function projWallBounce(state, r) {
  r[E_FACING] ^= 1;
  r[E_VX] = r[E_FACING] !== 0 ? 0xE0 : 0x20;        // $5AD7 / $5ADB
  r[0x14] = 2;                                      // $5AE3
  const variant = r[6];                             // $5AEA
  if (variant === 2) return projExplode(state, r);
  requestSound(state, variant === 4 || variant === 5 ? 0x19 : 0x1D);
  return screenTail(state, r);
}

/** ROM: loc_01_5B0D - remember the player-relative offset, then re-home. */
export function projHitPlayer(state, r) {
  const variant = r[6];
  if (variant === 2) return projExplode(state, r);  // $5B12
  if (variant === 4 || variant === 5) return projWallBounce(state, r);  // $5B0A
  r[0x14] = 1;                                      // $5B22
  r[0x15] = 0x20;
  const delta = u16(state.player.y + neg16q((r[E_Y_HI] << 8) | r[E_Y_LO]));  // $5B2C
  r[0x17] = delta >> 8;                             // $5B4B
  r[0x18] = delta & 0xFF;
  r[0x19] = state.player.facing === r[E_FACING] ? 0 : 1;   // $5B58
  return screenTail(state, r);
}

/** ROM: loc_01_5A1F - a hit projectile snaps back beside the player. */
export function projRehome(state, r) {
  r[0x15] = u8(r[0x15] - 1);                        // $5A20
  if (r[0x15] === 0) return projDisable(state, r);
  const pf = state.player.facing;
  const dx = ((pf ^ r[0x19]) & 1) ? 0x60 : -0x60;   // $5A3A-$5A4C
  const x = u16(state.player.x + dx);
  r[E_X_HI] = x >> 8; r[E_X_LO] = x & 0xFF;
  const y = u16(state.player.y + neg16q((r[0x17] << 8) | r[0x18]));   // $5A6F
  r[E_Y_HI] = y >> 8; r[E_Y_LO] = y & 0xFF;
  r[E_FACING] = u8(pf ^ r[0x19]);                   // $5A87
  return screenTail(state, r);
}

/** ROM: loc_01_59EF - accelerating fall, X bleeding toward 0; gone at 0. */
export function projDrop(state, r) {
  r[0x13] = u8(r[0x13] + 1);                        // $59F0
  addY(r, r[0x13]);                                 // $59F6: UNSIGNED (B = 0)
  let v = r[E_VX];
  if (v & 0x80) v = u8(v + 1); else v = u8(v - 1);  // $59FC-$5A09
  if (v === 0) return projDisable(state, r);        // $5A0C
  r[E_VX] = v;
  addX(r, i8(v));                                   // $5A19
  return screenTail(state, r);
}

/** ROM: loc_01_5B89 - flags cleared to exactly $40, spawn column zeroed. */
export function projDisable(state, r) {
  r[E_FLAGS] = 0x40;
  r[E_X_HI] = 0;
}

/**
 * ROM: loc_01_5B68 - the projectile's own burst, at its live +$0E..+$11
 * position ($5B6C-$5B79 stage all four bytes), and only THEN the disable.
 *
 * Audible: $97 has bit 6 clear, so the $13E6 one-shot fires. MEASURED
 * (cuediff l12-shooter-fire): the cartridge asks for cue $17 twice on f29 --
 * once for the collapsing floor and once for this -- and its own 4-deep
 * mailbox drops the second. The slot it takes is not dropped, which is why
 * the port's next floor burst ran one cell longer than the cartridge's.
 */
export function projExplode(state, r) {
  spawnEffect(state, (r[E_X_HI] << 8) | r[E_X_LO],
              (r[E_Y_HI] << 8) | r[E_Y_LO], 0x97, 0x01);   // $5B7C-$5B81
  return projDisable(state, r);
}

/**
 * ROM: sub_01_6BDC + templates 1:$6CEA (5 x 32 B).
 *
 * Copies a whole prefab record into slot 6 (or 7), then positions it relative
 * to the spawner by mode and stamps the spawner's facing. Returns 0 on success
 * like the original (callers test for zero).
 */

export function spawnProjectile(state, spawner, mode) {
  for (let slot = 6; slot < SLOTS; slot++) {        // $6BDC / $6CDF
    const t = state.enemies[slot];
    if (t[E_FLAGS] & F_ACTIVE) continue;
    // 1:$6CEA, 5 x 32 B. Throws rather than defaulting: an all-zero record
    // is an INACTIVE enemy, so a missing table would silently mean "the boss
    // fires nothing" instead of failing.
    const tpl = state.tables?.projectileTemplates;
    if (!tpl) throw new Error('enemies: tables.projectileTemplates missing');
    t.set(tpl[(mode >= 1 && mode <= 5 ? mode : 5) - 1]);
    const facing = spawner[E_FACING];
    t[E_FACING] = facing;                           // $6C2B
    let dxm = mode === 1 ? 0x100
      : (mode === 2 || mode === 3) ? 0x180
        : mode === 4 ? 0x100 : 0xC0;                // $6C3D-$6C5F
    if (facing !== 0) dxm = neg16q(dxm);            // $6C62
    const x = u16(((spawner[E_X_HI] << 8) | spawner[E_X_LO]) + dxm);
    t[E_X_HI] = x >> 8; t[E_X_LO] = x & 0xFF;
    const dym = mode === 1 ? 0x20
      : mode === 2 ? -0x60 : mode === 3 ? -0x40 : -0x80;   // $6C85-$6CA3
    const y = u16(((spawner[E_Y_HI] << 8) | spawner[E_Y_LO]) + dym);
    t[E_Y_HI] = y >> 8; t[E_Y_LO] = y & 0xFF;
    const lvl = state.level.number;                 // $6CAF
    const id = (lvl === 5 || lvl === 7 || lvl === 8 || lvl === 0x0D) ? 0x1B
      : lvl === 0x0B ? 0x2C : lvl === 0x0C ? 0x1F : 0x28;
    requestSound(state, id);
    return 0;
  }
  return 1;
}
