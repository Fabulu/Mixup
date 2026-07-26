// Title screen.  ROM: built at $027D, looped at loc_00_02C4.
//
// The real thing clears the tilemap to $2F, runs two VRAM scripts through
// sub_00_0A0E (5:$5170 for the artwork, 1:$7C44 for the text), starts the
// title music, then fades in with sub_00_0A7F.
//
// PARTIAL, and worth being straight about: the script interpreter is NOT
// ported. assets/title.vram.bin is a CAPTURE of what the real game builds,
// taken by tools/rip_title.py, and we simply present it. What IS ported is the
// loop's behaviour -- the fade, the START handler, and the hidden cheat.
//
// When sub_00_0A0E lands, the capture can be replaced by running the two
// scripts for real and the tilemap will build itself.

import { buildTileCache } from './assets.js';
import { BTN } from './player.js';

const BASE = new URL('../assets/', import.meta.url).href;

/** Frames the fade takes. ROM: $02BF loads C = $80 into sub_00_0A7F. */
const FADE_FRAMES = 48;

export async function loadTitle() {
  const [vramBuf, meta] = await Promise.all([
    fetch(BASE + 'title.vram.bin').then((r) => r.arrayBuffer()),
    fetch(BASE + 'title.json').then((r) => r.json()),
  ]);
  const vram = new Uint8Array(vramBuf);
  return {
    vram,
    tiles: buildTileCache(vram),
    bgMap: vram.slice(0x1800, 0x1C00),   // $9800, 32x32
    meta,
  };
}

/** Point the renderer at the title instead of a level. */
export function showTitle(state, title) {
  state.video.bgMap = title.bgMap;
  state.video.scx = title.meta.scx;
  state.video.scy = title.meta.scy;
  state.video.obp0 = title.meta.obp0;
  state.video.obp1 = title.meta.obp1;
  state.level.tiles = title.tiles;
  state.video.sprites.length = 0;
  state.camera.x = 0;
  state.camera.y = 0x1000;             // cameraPixels subtracts the $10 bias
  state.title = { frame: 0, cheat: 0 };
}

export function hideTitle(state) {
  state.video.bgMap = null;
  state.title = null;
}

/**
 * One title frame.  ROM: loc_00_02C4.
 *
 * @returns 'title' while it should keep running, or 'start' once START is hit.
 */
export function tickTitle(state) {
  const t = state.title;
  t.frame++;

  // $02BF -> sub_00_0A7F: fade the palette up from black over the first frames.
  // BGP is $E4 once faded; before that the shades are pushed toward 0.
  const f = Math.min(FADE_FRAMES, t.frame);
  const k = f / FADE_FRAMES;
  state.video.bgp = fadeBgp(0xE4, k);

  // $02C7: the hidden cheat is an exact match on the newly-pressed byte --
  // B + SELECT + LEFT together and nothing else. Sets $C75C, which later
  // spawns the rescue helper during boss fights.
  if (state.input.pressed === 0x26) {
    t.cheat = 1;
    state.flow.rescueCheat = 1;
    requestSound(state, 0x13);
  }

  if (state.input.pressed & BTN.START) return 'start';
  return 'title';
}

/**
 * Blend a DMG palette register toward black. Each 2-bit field is a shade, and
 * fading means walking every field up toward 3 (darkest) as k goes to 0.
 */
function fadeBgp(reg, k) {
  let out = 0;
  for (let i = 0; i < 4; i++) {
    const shade = (reg >> (i * 2)) & 3;
    const faded = Math.round(shade + (3 - shade) * (1 - k));
    out |= (faded & 3) << (i * 2);
  }
  return out;
}

function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) {
    state.sound.queue.push({ id, mask });
  }
}
