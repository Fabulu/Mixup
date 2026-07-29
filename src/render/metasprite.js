// Metasprite drawing and player tile streaming.
// ROM: sub_00_0BC6 (append to shadow OAM), loc_00_1D0C (player draw),
//      sub_00_32D2 (stream one 4-tile animation column per frame).

import { decodeTileBuf } from '../assets.js';
import { cameraPixels } from '../camera.js';

/**
 * ROM: sub_00_0BC6.  Appends a metasprite's records to the sprite queue.
 *
 * Records are {dy, dx, tile, attr} and the original adds them to $FF94/$FF93,
 * which hold the player's position in OAM coordinates (screen + 8, + 16).
 * Because our sprite queue is in screen coordinates, the two hardware offsets
 * cancel and we can add dy/dx to the plain screen position.
 */
export function drawMetasprite(state, table, index, screenX, screenY, attrMask,
                               scale = 1) {
  const entry = table[index];
  if (!entry) return;
  const q = state.video.sprites;
  for (const [dy, dx, tile, attr] of entry.sprites) {
    if (q.length >= 40) return;           // $0BE5: CP $A0 -- hard cap, silent drop
    q.push({
      // Offsets scale with the sprite so the metasprite grows about its own
      // origin instead of coming apart. Callers that must stay 1:1 (the HUD)
      // simply leave scale at 1.
      x: screenX + dx * scale,
      y: screenY + dy * scale,
      tile,
      attr: attr | attrMask,              // $0BF7: OR with $FF9E
      scale,
    });
  }
}

/**
 * ROM: loc_00_1D0C.  Draws Batman, honouring the invulnerability blink.
 */
/**
 * ROM: $1B58, the tail of sub_00_1B4A -- the player update stores its own
 * screen position into $FF93/$FF94 ONCE a frame, and everything downstream
 * reads those bytes rather than recomputing.
 *
 * That distinction is not cosmetic. Anything running BEFORE the player update
 * -- the $1444 ballistic pool is the one that matters -- reads last frame's
 * value, while the camera has already moved this frame ($05B7). Recomputing
 * from live state there mixes last frame's player with this frame's camera and
 * lands up to 2 px out, which is enough to miss a pickup whose box test
 * accepts equality at 12. Measured on the cartridge: the ROM sees screen X 86
 * against a heart at 74 and takes it; recomputing gives 88 and misses.
 *
 * Consumers running AFTER the player update (the enemy driver at $05CF) may
 * recompute safely, and enemies.js does.
 */
export function cachePlayerScreen(state) {
  const p = state.player;
  // sub_00_1172's own arithmetic, NOT drawPlayer's local screenX/screenY.
  // $FF93/$FF94 are OAM coordinates and carry the +8/+16 origin offsets;
  // drawPlayer subtracts them back out through the metasprite records. Caching
  // the un-offset pair here puts every consumer 8 px and 16 px out.
  state.video.playerScreenX = (((p.x - state.camera.x) & 0xFFFF) >> 4) + 8 & 0xFF;
  state.video.playerScreenY =
    ((((p.y & 0x0FFF) - state.camera.y) & 0xFFFF) >> 4) + 0x10 & 0xFF;
}

export function drawPlayer(state, manifest) {
  const p = state.player;

  // $1D13: while invulnerable, draw only when bit 3 of the timer is set.
  if (p.iframes !== 0 && (p.iframes & 0x08) === 0) return;

  const cam = cameraPixels(state);
  const screenX = (p.x >> 4) - cam.x;
  const screenY = ((p.y >> 4) - 0x100) - cam.y;   // remove the $10-row bias

  drawMetasprite(state, manifest.metasprites.table1, p.msIndex ?? 1,
                 screenX, screenY, p.attrMask, state.video.spriteScale || 1);
}

/**
 * ROM: sub_00_2C13, called from the main loop at $05C9 -- AFTER the player
 * update, which is the half of the loop that matters.
 *
 * The game streams ONE 4-tile column per frame into OBJ tiles $00-$0B, so a
 * changed animation takes 3 frames to fully repaint. The transient mixed-frame
 * look is part of how the original reads in motion.
 *
 * The subtlety, and it is the whole reason `animFrame` used to diverge in every
 * scenario of the corpus: **the cursor only advances on frames that actually
 * stream**. $2C13 streams when `$FFC4 != 0` (a repaint is mid-flight) OR when
 * `$FFC3 != $FFC5` (the pose just changed); otherwise it returns at $2C25 with
 * $FFC4 left at 0. So a settled animation parks the cursor on 0 indefinitely,
 * and a port that runs `(animFrame + 1) % 3` every frame is permanently out of
 * phase from the fourth frame of the level onward.
 *
 * That is not cosmetic. selectAnim READS $FFC4 as a "do not change pose while a
 * repaint is in flight" gate ($1C45, $1C53, $1CB5, $1CF8), so the streamer's
 * cursor decides when the rising/falling/idle/walk poses are allowed to move.
 * The two routines are one feedback loop.
 *
 * $FFC5 is written ONLY on the `$FFC4 == 0` path ($2C1D), so a pose that
 * changes mid-repaint is picked up when the cursor comes back around.
 */
export function streamPlayerTiles(state, manifest, playerTiles) {
  const p = state.player;

  if (p.animFrame === 0) {                // $2C13
    const prev = p.animPrev;              // $2C18
    p.animPrev = p.anim;                  // $2C1D
    if ((p.anim ^ prev) === 0) return;    // $2C1F: same pose, nothing to paint
  }

  // loc_00_2C28: four tile pointers out of 2:$4D8C + anim*24 + animFrame*8,
  // then the destination from 0:$32D2 -- $00/$40/$80, i.e. OBJ tiles 0-3, 4-7,
  // 8-11. The cursor advances even when the pointers are junk, so the wrap at
  // $2CB1 sits outside the guard.
  const anim = manifest.player.anims[p.anim];
  const col = p.animFrame;
  if (anim && anim[col]) {
    const objTiles = state.level.tiles.obj;
    const tiles = anim[col];
    for (let t = 0; t < 4; t++) {
      objTiles[col * 4 + t] = decodeTileBuf(playerTiles, tiles[t]);
    }
  }
  p.animFrame = p.animFrame + 1 < 3 ? p.animFrame + 1 : 0;   // $2CB1-$2CB9
}

/**
 * Hitbox for the current animation. ROM: table 0:$27A8, applied at $1D2C.
 *
 * NOTE this runs EVERY frame and overwrites whatever the hitbox was, which is
 * why setting hitboxHalfWidth/Height as a plain tunable has no lasting effect.
 * Mods scale the table value instead.
 *
 * $1D2C is the TAIL of loc_00_1D0C, so $1D1B's `RET Z` leaves before it: while
 * $C714 runs, the hitbox is reloaded on only 8 frames in 16 and holds the
 * previous pose's extents on the other 8. That is reproduced here now.
 *
 * It could not be until recently, and the reason is worth keeping. The gate
 * tests bit 3 of $C714, and the port used to decrement that byte at the END of
 * the tick while the ROM does it at the HEAD of the player update ($177C) --
 * so `p.iframes & 8` read one higher than the cartridge's at exactly this
 * point in the frame, and gating on it would have swapped an always-fresh
 * hitbox for one stale on the WRONG eight frames. The decrement moved to
 * knockback() where it belongs, which is what unblocked this.
 */
export function applyAnimHitbox(state, manifest) {
  const p = state.player;
  // $1D13-$1D1B, the same test drawPlayer makes: mid-blink, this whole tail
  // is skipped and the hitbox keeps the previous pose's extents.
  if (p.iframes !== 0 && (p.iframes & 0x08) === 0) return;
  const hb = manifest.player.hitboxes[p.anim];
  if (!hb) return;
  const s = state.hitboxScale || 1;
  p.halfW = Math.min(0x7F, Math.round(hb[0] * s));
  p.halfH = Math.min(0x7F, Math.round(hb[1] * s));
}
