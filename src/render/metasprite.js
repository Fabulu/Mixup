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
export function drawMetasprite(state, table, index, screenX, screenY, attrMask) {
  const entry = table[index];
  if (!entry) return;
  const q = state.video.sprites;
  for (const [dy, dx, tile, attr] of entry.sprites) {
    if (q.length >= 40) return;           // $0BE5: CP $A0 -- hard cap, silent drop
    q.push({
      x: screenX + dx,
      y: screenY + dy,
      tile,
      attr: attr | attrMask,              // $0BF7: OR with $FF9E
    });
  }
}

/**
 * ROM: loc_00_1D0C.  Draws Batman, honouring the invulnerability blink.
 */
export function drawPlayer(state, manifest) {
  const p = state.player;

  // $1D13: while invulnerable, draw only when bit 3 of the timer is set.
  if (p.iframes !== 0 && (p.iframes & 0x08) === 0) return;

  const cam = cameraPixels(state);
  const screenX = (p.x >> 4) - cam.x;
  const screenY = ((p.y >> 4) - 0x100) - cam.y;   // remove the $10-row bias

  drawMetasprite(state, manifest.metasprites.table1, p.msIndex ?? 1,
                 screenX, screenY, p.attrMask);
}

/**
 * ROM: sub_00_32D2.  The game streams ONE 4-tile column per frame into OBJ
 * tiles $00-$0B, so a changed animation takes 3 frames to fully repaint.
 * Reproduced faithfully -- the transient mixed-frame look is part of how the
 * original reads in motion.
 */
export function streamPlayerTiles(state, manifest, playerTiles) {
  const p = state.player;
  const anim = manifest.player.anims[p.anim];
  if (!anim) return;

  const objTiles = state.level.tiles.obj;

  if (p.animPrev !== p.anim) {
    // A fresh animation: the original still streams one column per frame, so
    // only reset the cursor here.
    p.animPrev = p.anim;
    p.animFrame = 0;
  }

  const col = p.animFrame % 3;
  const tiles = anim[col];
  for (let t = 0; t < 4; t++) {
    objTiles[col * 4 + t] = decodeTileBuf(playerTiles, tiles[t]);
  }
  p.animFrame = (p.animFrame + 1) % 3;
}

/** Hitbox for the current animation. ROM: table 0:$27A8, applied at $1D2C. */
export function applyAnimHitbox(state, manifest) {
  const p = state.player;
  const hb = manifest.player.hitboxes[p.anim];
  if (hb) { p.halfW = hb[0]; p.halfH = hb[1]; }
}
