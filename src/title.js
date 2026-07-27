// Title screen.  ROM: built at $027D, looped at loc_00_02C4.
//
// The real thing clears the tilemap to $2F, runs two VRAM scripts through
// sub_00_0A0E (5:$5170 for the artwork, 1:$7C44 for the text), starts the
// title music, then fades in with sub_00_0A7F.
//
// The VRAM is now BUILT, not captured: two bank-6 tile blobs, the boot clear,
// and the three scripts, all out of the manifest. assets/title.vram.bin and
// tools/rip_title.py are gone. tools/oracle/titlediff.mjs is what earned that
// -- it holds the built image against the cartridge's own and all 8192 bytes
// agree.

import { buildTileCache, loadManifest } from './assets.js';
import { buildTitleVram } from './vram.js';
import { runVramScript } from './vramscript.js';
import { BTN } from './player.js';
import { drawMetasprite } from './render/metasprite.js';

const BASE = new URL('../assets/', import.meta.url).href;

/** Frames the fade takes. ROM: $02BF loads C = $80 into sub_00_0A7F. */
const FADE_FRAMES = 48;

/** Decode one base64 blob from the manifest. */
function b64(s) {
  const bin = typeof atob === 'function'
    ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function loadTitle() {
  const [manifest, meta] = await Promise.all([
    loadManifest(),
    fetch(BASE + 'title.json').then((r) => r.json()),
  ]);
  const spec = manifest.title;
  if (!spec) throw new Error('manifest has no title section - re-run export_assets.py');

  const vram = buildTitleVram({
    tiles: spec.tiles.map((t) => ({ dest: t.dest, bytes: b64(t.bytes) })),
    scripts: spec.scripts.map(b64),
    fill: spec.fill,
  }, (v, script) => runVramScript(v, script));
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
  state.title = { frame: 0, cheat: 0, cursor: 0 };   // $C712: 0 START, 1 OPTION

  // $02A1: LD BC,$0003 -> sub_00_0AE1. Song $00 is the title theme, and mask
  // $03 is play + stop-all, so it replaces whatever was running.
  //
  // This is not optional tidying: boot() runs initLevel() BEFORE the title is
  // shown, which has already queued the level's own musicFresh ($02 for level
  // 1). Without this the title screen plays the first level's theme, and the
  // two sound identical because they are.
  requestSound(state, 0x00, 0x03);
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

  // $FFB1 ticks in VBlank, so it advances on the title too -- the cursor blink
  // is derived from it. And nothing else clears shadow OAM here: tick() owns
  // that line, and tick() does not run while the title is up.
  state.frame = (state.frame + 1) & 0xFF;
  state.video.sprites.length = 0;

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

  // $02DB: UP or DOWN (either one) flips the selection and plays $0E.
  if (state.input.pressed & (BTN.UP | BTN.DOWN)) {
    t.cursor ^= 1;                              // $02F9: XOR $01 on $C712
    requestSound(state, 0x0E);
  }

  drawCursor(state, t);

  // $02E7 -> $030E: START acts on the selection.
  if (state.input.pressed & BTN.START) {
    requestSound(state, 0x0D);                  // $0315
    return t.cursor === 0 ? 'start' : 'options';   // $0312 -> loc_00_3893
  }
  return 'title';
}

/**
 * ROM: sub_00_0FCC, called from $0309 with the row picked at $02FE.
 *
 * A 4-frame blink cycling metasprites $19/$C9/$CA/$CB from the table at
 * 0:$3337, indexed by (frame & $18) >> 3. The two rows are OAM Y $64 and $74
 * at OAM X $28; the hardware's 8/16 px OAM offsets cancel against our
 * screen-space sprite queue, exactly as they do for the player.
 */
const CURSOR_IDS = [0x19, 0xC9, 0xCA, 0xCB];
const CURSOR_X = 0x28 - 8;
const CURSOR_Y = [0x64 - 16, 0x74 - 16];

function drawCursor(state, t) {
  const manifest = state.titleManifest;
  if (!manifest) return;
  const id = CURSOR_IDS[(state.frame & 0x18) >> 3];
  drawMetasprite(state, manifest.metasprites.table1, id,
                 CURSOR_X, CURSOR_Y[t.cursor], 0);
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
