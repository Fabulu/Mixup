// Round select / continue.  ROM: entry loc_00_035B, loop loc_00_03DC-$0479.
//
// State 5 in the flow map, and the screen START on the title is supposed to
// reach. Four routes across the top; the cursor may only land on ones that are
// not yet cleared, which is what makes levels 4, 8 and 11 reachable and what
// eventually sets every bit of $C753 and warps to level 12.
//
// Drawn on top of the finished title VRAM -- the cartridge never reclears the
// tile area between the two screens (src/vram.js buildRoundSelectVram).

import { buildTileCache } from './assets.js';
import { buildRoundSelectVram, requireScreenSpec } from './vram.js';
import { runVramScript } from './vramscript.js';
import { BTN } from './player.js';
import { GAMEPLAY_PALETTES } from './state.js';
import { drawMetasprite } from './render/metasprite.js';

/**
 * Cursor tile per route, table 0:$1008 -> $81 $82 $83 $84. Painted into the
 * BG map at $99CD, not drawn as a sprite.
 */
const ROUTE_TILE = [0x81, 0x82, 0x83, 0x84];
const CURSOR_CELL = 0x99CD;

/**
 * The CONTINUE line, drawn only when `$FFB5` is set.
 *
 * ROM: $03B8 runs the VRAM script at 0:$3328 and $03BE-$03C3 writes the life
 * count beside it. MEASURED rather than transcribed: the cartridge was taken
 * to round select twice -- once from the title, once by dying on level 3 --
 * and $8000-$9FFF dumped both times at $0472 (the menu loop's own VBlank
 * wait, NOT the $03CB entry, which is far too early: sub_00_0B15 only QUEUES
 * its resource loads and they drain over the following frames). Diffing the
 * two:
 *
 *   - the script's entire ON-SCREEN effect is eight tiles at $9A04,
 *     `8C 98 97 9D 92 97 9E 8E` = C O N T I N U E, and $80 + lives at $9A0E;
 *   - every other differing map cell is at row >= 18, i.e. off the 18-row
 *     screen -- level residue the column streamer left;
 *   - and, the part worth having measured: all 141 tiles the screen
 *     REFERENCES are byte-identical between the two paths (once read through
 *     LCDC $E7's SIGNED $8800 addressing -- comparing at $8000 says 116 of
 *     them differ and is simply the wrong window). That is what makes it
 *     legitimate to keep building this screen on the title's VRAM after a
 *     death: the resource loads cover everything the map points at.
 *
 * Hardcoded because assets/manifest.json's `roundSelect` spec carries only
 * 6:$7674. Exporting 0:$3328 alongside it (tools/export_assets.py) would
 * retire these constants.
 */
const LIVES_CELL = 0x9A0E;
const FONT_DIGIT_0 = 0x80;

/**
 * Which level each route starts at. ROM: loc_00_049D -- cursor 0/1/2 pick
 * levels $01/$05/$09, and anything else (only reachable once $C753 == $07)
 * picks $0C, the Joker warp.
 */
export const ROUTE_LEVEL = [1, 5, 9, 12];

/** The four levels that end a route, and so step back one on CONTINUE. */
const ROUTE_ENDS = [0x04, 0x08, 0x0B, 0x0E];

/** The blinking bat, same metasprite cycle the title uses (table 0:$3337). */
const CURSOR_IDS = [0x19, 0xC9, 0xCA, 0xCB];
const CURSOR_X = 0x18 - 8;                    // $046D: C = $18
const CURSOR_Y = [0x6C - 16, 0x8C - 16];      // $0467 START / $046B CONTINUE

/** Number of selectable routes. $0428: INC A / CP $03 wraps at 3. */
const ROUTES = 3;

/**
 * ROM: sub_00_0FE6. Is `route` still uncleared?
 *
 * $C753 bits 0/1/2 are routes 0/1/2 -- and anything above 1 tests bit 2, so
 * route 3 shares route 2's bit. Returns the route, or $FF when it is done.
 */
export function routeIfOpen(mask, route) {
  const bit = route === 0 ? 0x01 : route === 1 ? 0x02 : 0x04;
  return (mask & bit) ? 0xFF : route;
}

/** ROM: $0399-$03A3. First route that is not cleared, scanning upward. */
function firstOpenRoute(mask) {
  for (let r = 0; r < 8; r++) {
    if (routeIfOpen(mask, r) !== 0xFF) return r;
  }
  return 0;
}

export async function loadRoundSelect(manifest, titleVram) {
  const spec = requireScreenSpec(manifest.roundSelect, 'roundSelect');
  const b64 = (s) => {
    const bin = typeof atob === 'function'
      ? atob(s) : Buffer.from(s, 'base64').toString('binary');
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  const vram = buildRoundSelectVram({
    fill: spec.fill,
    tiles: spec.tiles.map((t) => ({ dest: t.dest, bytes: b64(t.bytes) })),
    scripts: spec.scripts.map(b64),
  }, (v, s) => runVramScript(v, s), titleVram);

  return { vram, tiles: buildTileCache(vram), bgMap: vram.slice(0x1800, 0x1C00) };
}

/** ROM: loc_00_035B, the setup before the loop. */
export function showRoundSelect(state, art) {
  state.video.bgMap = art.bgMap;
  state.level.tiles = art.tiles;
  state.video.sprites.length = 0;
  state.video.scx = 0;
  state.video.scy = 0;
  state.video.bgp = 0xE4;
  // $0365 zeroes both OBJ palette shadows -- but they do NOT stay zero, and
  // reproducing the write literally is wrong. Measured on the cartridge while
  // the screen is up: rOBP0 = $E4, rOBP1 = $C4, shadows $E4. Something in the
  // resource loads restores them before anything is drawn.
  //
  // Getting this wrong hid the bat cursor, because a zeroed OBP maps every
  // shade to colour 0 -- the sprite is still in OAM and still drawn, just
  // invisible. The cartridge's OAM here is two 8x8 sprites, tile $AA at
  // x $10 and $18, the second X-flipped.
  state.video.obp0 = GAMEPLAY_PALETTES.obp0;
  state.video.obp1 = GAMEPLAY_PALETTES.obp1;
  state.camera.x = 0;
  state.camera.y = 0x1000;

  const mask = state.flow.routeMask & 0xFF;   // $C753
  // $038E: every route cleared pins the cursor at 3 rather than scanning.
  const cursor = mask === 0x07 ? 3 : firstOpenRoute(mask);

  // $03B3: CONTINUE only exists once $FFB5 is set, and when it does the
  // cursor STARTS on it ($03C6) rather than on START.
  const canContinue = !!state.flow.continueAvailable;

  state.roundSelect = { cursor, mode: canContinue ? 1 : 0, canContinue };
  paintRouteCursor(state, cursor);
  if (canContinue) paintContinue(state);        // $03B8-$03C3

  // Song $01 is the round-select theme, mask $03 = play + stop-all. Measured
  // by hooking sub_00_0AE1 across the transition: the cartridge asks for $0D
  // (the confirm blip, which title.js already sends) and then $01. Without
  // this the screen keeps playing whatever the title left running.
  requestSound(state, 0x01, 0x03);
}

/**
 * ROM: $044A-$0460. The cartridge does this by ASSEMBLING a one-record VRAM
 * script in WRAM at $C61B -- {$99, $CD, $01, tile, $00} -- and running it
 * through sub_00_0A0E. Same single byte either way; worth knowing because it
 * means the menus drive the script interpreter per frame, not just at boot.
 */
function paintRouteCursor(state, cursor) {
  const map = state.video.bgMap;
  if (map) map[CURSOR_CELL - 0x9800] = ROUTE_TILE[cursor & 0xFF] ?? ROUTE_TILE[0];
}

/** ROM: $03B8 (script 0:$3328) + $03BE-$03C3 (the life count). */
function paintContinue(state) {
  const map = state.video.bgMap;
  if (!map) return;
  // 0:$3328 is a sub_00_0A0E script, so RUN it rather than transcribing its
  // eight tiles -- that way the destination travels with the data and the
  // already-ported interpreter is what draws the line.
  const script = state.tables?.continueScript;
  if (!script) throw new Error('roundselect: tables.continueScript missing');
  runVramScript(map, Uint8Array.from(script), { base: 0x9800 });
  // $03C1: ADD A,$80 -- the font's digits start at $80, and the count is not
  // clamped, so a run with more than 9 lives draws a letter. Reproduced.
  map[LIVES_CELL - 0x9800] = (FONT_DIGIT_0 + state.flow.lives) & 0xFF;
}

/**
 * ROM: $047C-$049B. START pressed with CONTINUE selected ($C713 != 0).
 *
 * The route cursor is IGNORED on this arm -- $0480 jumps past loc_00_049D
 * entirely, so `$FFB0` keeps the level you died on. The one adjustment is
 * $0486-$0499: levels 4, 8, $0B and $0E each END something, so continuing on
 * one of them steps back to the level before it rather than dropping you
 * straight back into the boss.
 *
 * MEASURED: dying on level 3 and pressing START reaches loc_00_04BB with
 * $FFB0 = 3; dying on level 4 reaches it with $FFB0 = 3 as well.
 *
 * @returns the level to load.
 */
export function continueLevel(state) {
  const p = state.player;
  p.hp = p.hpMax;                       // $0482: $FF8A <- $FF8E
  const n = state.level.number;         // $FFB0 survived the death sequence
  return ROUTE_ENDS.includes(n) ? n - 1 : n;      // $0498: DEC A
}

function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) state.sound.queue.push({ id, mask });
}

/**
 * ROM: loc_00_03DC. One iteration of the loop.
 * @returns 'roundselect' to stay, or 'start' when START is pressed.
 */
export function tickRoundSelect(state) {
  const r = state.roundSelect;
  state.frame = (state.frame + 1) & 0xFF;      // $FFB1 still ticks in VBlank
  state.video.sprites.length = 0;

  const p = state.input.pressed;
  const mask = state.flow.routeMask & 0xFF;

  if (p & BTN.UP) {                            // $03DE -> $03F6
    r.mode = 0;
    requestSound(state, 0x0E);
  } else if (p & BTN.DOWN) {                   // $03E2 -> $03F9
    // DOWN is ignored outright when there is nothing to continue.
    if (r.canContinue) {
      r.mode = 1;
      requestSound(state, 0x0E);
    }
  } else if (p & (BTN.LEFT | BTN.RIGHT)) {     // $03E6 -> $040B
    // $040B: the route only moves while the selection is on START.
    if (r.mode === 0) {
      if (mask === 0x07) {                     // $0411: nothing left to pick
        r.cursor = 3;
        paintRouteCursor(state, r.cursor);
      } else {
        requestSound(state, 0x0E);
        let c = r.cursor;
        // $0428 / $0438: step and keep stepping while the route is cleared.
        // Bounded rather than while(true): a mask that somehow closed every
        // route would spin here forever on the cartridge.
        for (let guard = 0; guard < ROUTES; guard++) {
          if (p & BTN.LEFT) c = c === 0 ? 2 : c - 1;      // $0438: SUB 1, wrap to 2
          else c = c + 1 >= ROUTES ? 0 : c + 1;           // $0428: INC, wrap at 3
          if (routeIfOpen(mask, c) !== 0xFF) break;
        }
        r.cursor = c;
        paintRouteCursor(state, c);
      }
    }
  }

  drawCursor(state, r);

  if (p & BTN.START) return 'start';           // $0475: BIT 3
  return 'roundselect';
}

function drawCursor(state, r) {
  const manifest = state.titleManifest;
  if (!manifest) return;
  const id = CURSOR_IDS[(state.frame & 0x18) >> 3];
  drawMetasprite(state, manifest.metasprites.table1, id,
                 CURSOR_X, CURSOR_Y[r.mode], 0);
}

export function hideRoundSelect(state) {
  state.video.bgMap = null;
  state.roundSelect = null;
}
