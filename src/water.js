// The level-1/2 water-surface subsystem.  ROM: sub_00_2CBE -> loc_00_2D3D.
//
// sub_00_2CBE ($05C6, between the player update and the OBJ tile stream) is
// the per-level "special subsystem" dispatcher. Levels 1 and 2 share the water
// body: a 16-bit surface level in $C70A/$C70B that rises and falls between
// rows $16 and $1F, drawn by the WINDOW layer (whose Y it computes per frame
// into $C755/$FFAC). It is the only thing in the game that arms the player's
// water slow mode $FF95 -- touching a water CELL never does (collision.js).
//
// This is what the l1-water-spouts regression called "an enemy hit the port
// does not reproduce": at the frame the surface reaches the player's row while
// $C714 is zero, the player takes 1 damage and a $5A knockback stamp from
// $2E8D -- no enemy involved.
//
// Not modelled here, deliberately:
//  - the VRAM water-tile flip-book re-arm at $2D3D-$2D5C ($C328/$C348 scripts
//    consumed by the VBlank ISR) -- pure tile animation;
//  - the burst effect at the waterfall trigger ($2D82-$2D98, $C744 pool) --
//    the effect pool is not modelled (same stance as the enemy-death burst);
//  - the WINDOW layer itself. windowY is computed and stored faithfully so
//    the renderer can use it when the window lands.

import { u8, u16, setMapCell } from './state.js';

/**
 * $C70A-$C70D, $C713, $C755 and the $C6EF splash pool (4 x {timer, x}).
 * Everything level-init clears lives here; level.js resets it via
 * createWater() (ROM: $04FD/$0503 clear $C70D/$C713, $0534-$053F seed
 * $C70A=$1F, $C70B=$C70C=0).
 */
export function createWater() {
  return {
    level: 0x1F00,   // $C70A/$C70B  surface Y, 12.4-ish (hi = world row)
    packed: 0,       // $C70C  surface Y in 16-subpx units (enemy compare)
    phase: 0,        // $C70D  0 idle/stamping, 1 rising, 2 falling, $FF parked
    stampStep: 0,    // $C713  waterfall column stamp cursor (0 = untriggered)
    windowY: 0,      // $C755  window-line latch (boot RAM clear leaves it 0)
    splashes: Array.from({ length: 4 }, () => ({ timer: 0, x: 0 })),  // $C6EF
  };
}

/**
 * The waterfall column stamped into the map when the player first passes
 * column $36: {col, worldRow, graphic, collision}, one cell per (even) frame.
 * ROM: table 0:$2DDC. Row $19 col $38 and rows $1D/$1E are stamped SOLID;
 * only the middle of the column is water.
 */
const STAMPS = [
  [0x38, 0x19, 0x48, 0x01],
  [0x37, 0x19, 0x49, 0x08],
  [0x37, 0x1A, 0x47, 0x08],
  [0x37, 0x1B, 0x47, 0x08],
  [0x37, 0x1C, 0x47, 0x08],
  [0x37, 0x1D, 0x47, 0x01],
  [0x37, 0x1E, 0x47, 0x01],
];

/**
 * ROM: loc_00_2D3D (via sub_00_2CBE). Call order matters: after the player
 * update, before the batarangs and enemies, exactly the $05C6 slot.
 */
export function updateWater(state) {
  if (state.flow.paused) return;                    // $2CBE: $C716
  const lvl = state.level.number;
  if (lvl !== 1 && lvl !== 2) return;               // $2CC3-$2CE4: levels 6/7/
                                                    // $0B/$0C/$0D have their own
                                                    // subsystems, unported
  const w = state.water;

  // $2D5D: the logic runs on EVEN $FFB1 frames only; odd frames just park the
  // window register off-screen ($FFAC=$90, NOT the $C755 latch) -- the water
  // body is drawn at 30 Hz, which is its transparency dither. The port keeps
  // only the $C755 latch (windowY); the odd-frame $FFAC write becomes real
  // when the renderer grows a window layer. state.frame carries the $FFB1
  // boot phase (level.js seeds $6D), so the raw parity test is faithful.
  if ((state.frame & 1) !== 0) {                    // $2D63
    state.video.windowY = 0x90;                     // $2D65: window OFF
    return;
  }
  state.video.windowOn = true;

  if (w.phase === 0) {                              // $2D68
    if (w.stampStep === 0) {                        // $2D6F: $C713
      if ((state.player.x >> 8) < 0x36) return tail(state, w);   // $2D77
      requestSound(state, 0x17);                    // $2D7C
      // $2D82-$2D98: the $C744 burst effect at the waterfall base -- the
      // effect pool is not modelled.
      w.stampStep = 1;                              // $2D9B
      return stampTick(state, w);                   // falls into loc_00_2DA0
    }
    return stampTick(state, w);                     // $2DA0
  }
  if (w.phase === 1) {                              // $2DF8 != 2, != $FF
    w.level = u16(w.level - 8);                     // $2E00: BC = $FFF8
    if (w.level >> 8 < 0x16) w.phase = 2;           // $2E0C
    return tail(state, w);
  }
  if (w.phase === 2) {                              // $2E17
    w.level = u16(w.level + 8);
    if (w.level >> 8 >= 0x1F) {                     // $2E23
      // $2E27: whether the cycle repeats is decided at the BOTTOM of each
      // fall, from where the player is standing right then: past column $5A
      // the water parks at $1F00 forever.
      w.phase = (state.player.x >> 8) < 0x5A ? 1 : 0xFF;   // $2E31 / $2E2D
    }
    return tail(state, w);
  }
  return tail(state, w);                            // $2DFC: phase $FF
}

/**
 * ROM: loc_00_2DA0-$2DDB. One waterfall cell per even frame, graphic AND
 * collision, plus the VRAM queue (the port renderer reads the map directly).
 * Quirk kept: these frames RETURN without running the tail -- no window-Y
 * update, no player check, no enemy sweep -- so the surface state freezes for
 * the 14 frames the column takes to build.
 */
function stampTick(state, w) {
  const [col, row, graphic, coll] = STAMPS[w.stampStep - 1];
  setMapCell(state, col, row, graphic, coll);       // sub_00_11B9 + $11D9/$11F1
  if (w.stampStep + 1 >= 8) {                       // $2DC9-$2DCF
    // $2DD1: the LAST stamp frame flips to phase 1 -- $C713 keeps 7, is never
    // stored as 8 -- and falls into the tail, unlike frames 1-6 which RET at
    // $2DDB without window-Y, the player check or the enemy sweep.
    w.phase = 1;
    return tail(state, w);
  }
  w.stampStep++;                                    // $2DD8
  // $2DDB: RET -- deliberately NOT tail(state, w).
}

/** ROM: loc_00_2E36-$2EF3 -- window Y, the player check, the enemy sweep. */
function tail(state, w) {
  const p = state.player;

  // $2E36-$2E68: window Y = (surface - camY) px, clamped to the screen. The
  // overflow arm distinguishes "surface far below the view" ($90, window off)
  // from "camera fully below the surface" (0, window covers everything).
  const d = u16(w.level - state.camera.y);
  const a = (d << 4 >> 8) & 0xFF;                   // 4x SLA E / RLA
  if (a < 0x90) w.windowY = a;                      // $2E53
  else w.windowY = (state.camera.y >> 8) < (w.level >> 8) ? 0x90 : 0;  // $2E57
  // $2E65/$2E68 store to BOTH $C755 (the latch other code reads) and $FFAC
  // (the shadow the VBlank handler pushes to rWY at $080D). Only even frames
  // reach here, and odd frames park $FFAC at $90 -- so the water body is drawn
  // every OTHER frame. That 30 Hz strobe is not a bug: on a DMG's slow LCD it
  // reads as a translucent wash over the level behind it, and it is the only
  // transparency the hardware can do.
  state.video.windowY = w.windowY;                  // $2E68
  // The renderer draws from the LATCH, not the register, so the surface holds
  // its position through the odd frames when the register is parked at $90.
  state.video.windowLatchY = w.windowY;

  // $2E6A: player row vs surface row, HIGH BYTES only.
  const prow = p.y >> 8;
  const wrow = w.level >> 8;
  if (prow < wrow) {                                // $2E71: above -- dry
    p.slowMode = 0;                                 // $2E99
  } else {
    // $2E73: on the EXACT surface row, and only while airborne, the entry
    // splash. Deeper rows never splash -- and never stop being "in water".
    if (prow === wrow && p.air !== 0) playerSplash(state, w);   // $2E75-$2E7A
    p.slowMode = 0x80;                              // $2E7D: $FF95
    // $2E81: the water only HURTS on difficulty 1+, and only once the
    // previous hit's invulnerability has fully expired.
    if (state.flow.difficulty !== 0 && p.iframes === 0) {   // $2E85 / $2E8B
      p.hp = Math.max(0, p.hp - 1);                 // $2E8D: sub_00_2777, B=1
      requestSound(state, 0x12);                    // $277F: the hurt sound
      p.iframes = 0x5A;                             // $2E92: knockback RIGHT,
    }                                               // always -- no facing test
  }

  // $2E9C: surface Y packed into one byte of 16-subpx units. Bit 4 of the row
  // is dropped by the AND $0F, which is what folds world rows $10-$1F onto
  // 0-$FF -- the whole playfield is the low half of the row space.
  w.packed = ((w.level >> 8) & 0x0F) << 4 | ((w.level & 0xFF) >> 4);

  // $2EB0: all 8 enemy slots, ascending (this sweep does NOT parity-alternate
  // like the driver). Below the surface = slow-fall (r[1] bit 1, the $F8
  // terminal in fallTail); crossing into the top row of water while moving
  // vertically splashes ONCE -- the bit doubles as the edge detector.
  for (let slot = 0; slot < 8; slot++) {
    const r = state.enemies[slot];
    if ((r[0] & 0x80) === 0) continue;              // $2EBB
    const ep = (r[0x10] & 0x0F) << 4 | (r[0x11] >> 4);      // $2EC7-$2ED2
    const diff = u8(ep - w.packed);                 // $2ED3
    if (ep < w.packed) {                            // $2ED4: carry -- above
      r[1] &= ~0x02;                                // $2EDA: RES 1
      continue;
    }
    if (diff < 0x10) enemySplash(state, w, r);      // $2EDE-$2EE3
    r[1] |= 0x02;                                   // $2EEB: SET 1
  }
}

/**
 * ROM: sub_01_7A83 -- the player's entry splash. Slot 0 of the $C6EF pool is
 * the player's alone; a still-running splash suppresses the new one AND its
 * sound.
 */
function playerSplash(state, w) {
  const s = w.splashes[0];
  if (s.timer !== 0) return;                        // $7A86
  requestSound(state, 0x25);                        // $7A89
  s.timer = 0x17;                                   // $7A8F
  s.x = state.player.x;                             // $FF81/$FF82
}

/**
 * ROM: sub_01_7A99 -- an enemy breaking the surface. Only while rising or
 * falling ($7A9E), and only on the frame the slow-fall bit is still clear
 * ($7AA1) -- the SET 1 that follows in the sweep makes this a one-shot.
 * Slots 1-3 only; slot 0 is reserved for the player.
 */
function enemySplash(state, w, r) {
  if ((r[0] & 0x03) === 0) return;                  // $7A9E
  if (r[1] & 0x02) return;                          // $7AA1
  for (let i = 1; i < 4; i++) {                     // $7AAA-$7ACF
    const s = w.splashes[i];
    if (s.timer !== 0) continue;
    s.timer = 0x17;                                 // $7ABB
    s.x = (r[0x0E] << 8) | r[0x0F];                 // $7ABE: world X
    requestSound(state, 0x25);                      // $7AC4
    return;
  }
}

/**
 * ROM: sub_01_7AD3 ($05EF, after the enemy driver) -- tick and draw the
 * splash pool. Metasprite $65/$66/$67 on (timer & $18) >> 3 (table 1:$7B31),
 * drawn at the water line ($C755 + $0C) through sub_00_0BAF -- the ALTERNATE
 * metasprite table, even on level 1. Slot order alternates with $FFA7 parity
 * like the enemy driver, which decides OAM order between two live splashes.
 * Draws are queued onto the enemy queue so drawEnemies() flushes them in ROM
 * OAM order.
 */
export function updateSplashes(state) {
  const lvl = state.level.number;
  if (lvl !== 1 && lvl !== 2) return;               // $7AD3
  const w = state.water;
  const descending = state.parity !== 0;            // $7ADC
  for (let n = 0; n < 4; n++) {
    const slot = descending ? 3 - n : n;
    const s = w.splashes[slot];
    if (s.timer === 0) continue;                    // $7AEE
    const sx = u8((u16(s.x - state.camera.x) >> 4) + 8);    // sub_00_1172
    s.timer = u8(s.timer - 1);                      // $7B01
    const id = [0x65, 0x66, 0x67][(s.timer & 0x18) >> 3] ?? 0x65;  // $7B31
    state.enemyDraws.push({ id, x: sx, y: u8(w.windowY + 0x0C),   // $7B13
                            attr: 0, alt: true });  // sub_00_0BAF = table2
  }
}

/** ROM: sub_00_0AE1 mailbox (same shape as enemies.js). */
function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) {
    state.sound.queue.push({ id, mask });
  }
}
