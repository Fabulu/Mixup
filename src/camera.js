// Camera.  ROM: sub_00_121F (per-frame, called from the main loop at $05B7).
//
// NOTE: sub_00_104E looks almost identical and is easy to mistake for this
// one, but it only runs at level init and on transitions ($0557 / $2845). It
// differs in three ways that matter -- it masks the low byte with $F0, uses
// `SUB $15` for the Y follow, and tests $1D. Translating that one instead
// produces a camera that is subtly wrong the moment the player descends.

/** ROM: sub_00_121F */
export function updateCamera(state) {
  const p = state.player;
  const cam = state.camera;

  // --- X ($121F-$1249) ---
  const clampRight = (cam.clampRight - 5) & 0xFF;
  const px = p.x >> 8;
  const plo = p.x & 0xFF;

  if (px < 6) {                          // $122C
    cam.x = 1 << 8;
  } else if (px >= clampRight) {         // $1238: CP B / JR C
    cam.x = ((clampRight - 5) & 0xFF) << 8;
  } else {
    // $1244: low byte copied straight through -- NOT masked with $F0.
    cam.x = (((px - 5) & 0xFF) << 8) | plo;
  }

  // --- Y ($124A-$1286) ---
  const lvl = state.level.number;
  const py = p.y >> 8;
  const pylo = p.y & 0xFF;

  if (lvl === 0x06 || state.level.bossId !== 0) {
    cam.y = 0x17 << 8;                   // $1279: fixed low camera
  } else if (lvl === 0x09 || lvl === 0x0A || lvl === 0x0B) {
    cam.y = 0x10 << 8;                   // $126D: parallax levels pin the top
  } else if (py < 0x15) {                // $1269
    cam.y = 0x10 << 8;
  } else if (py < 0x1C) {                // $1275
    // $1281: SUB $05 (not $15), and the low byte is unmasked.
    cam.y = (((py - 5) & 0xFF) << 8) | pylo;
  } else {
    cam.y = 0x17 << 8;
  }
}

/**
 * Camera position in pixels.  Both axes carry the same $10-metatile-row bias
 * the player's Y does, so Y has 256 px subtracted just like the player.
 */
export function cameraPixels(state) {
  return {
    x: state.camera.x >> 4,
    y: (state.camera.y >> 4) - 0x100,
  };
}
