// Shared unit-test fixtures.
//
// These build a synthetic $D000 image from an ASCII map so the collision /
// player tests read like the level they describe.  Nothing here touches
// assets/ -- the whole suite runs without the ROM or the asset export.
//
// ROM: sub_00_0C34 writes 2 bytes per metatile into $D000 (raw id, then
// collisionLUT[id]), column-major, 16 rows per column (master reference §6.1).

import { createState } from '../src/state.js';
import { makeTunables } from '../src/tunables.js';
import { updatePlayer } from '../src/player.js';

/**
 * ASCII char -> collision byte (master reference §6.3).
 * The metatile GRAPHIC id stored alongside is the char code, so it is
 * deterministic and distinguishable per char without meaning anything.
 */
export const CHAR_COLL = {
  '.': 0x00,   // air
  '#': 0x01,   // solid
  '>': 0x02,   // conveyor right
  '<': 0x03,   // conveyor left
  'E': 0x04,   // level-exit trigger
  'T': 0x05,   // trigger (horiz probe), solid to floor
  'B': 0x06,   // breakable
  'S': 0x07,   // solid 2 / invisible wall
  '~': 0x08,   // water
  's': 0x09,   // step-solid
  'D': 0x1F,   // door / actor-owned destructible, slot bits 0
  'd': 0x3F,   // same, owned by $C1E8 slot 1 (bits 7-5 = 1)
  'e': 0x20,   // pickup: +6 HP
  'a': 0x21,   // pickup: +10 batarangs
  'm': 0x22,   // pickup: +2 max HP
  '^': 0xFD,   // spikes
  'X': 0xFF,   // solid, runtime-written
};

/** Y hi runs $10-$20 in play; map row = Y hi & $0F (master reference §4). */
export const Y_BIAS = 0x10;

/** A mutable 16-row char grid, `g[row][col]`. */
export function grid(width, fill = '.') {
  return Array.from({ length: 16 }, () => fill.repeat(width).split(''));
}

/** Fill one whole map row. */
export function fillRow(g, row, ch) {
  g[row].fill(ch);
  return g;
}

/** Fill map rows [from..15]. */
export function floorFrom(g, from, ch = '#') {
  for (let r = from; r < 16; r++) g[r].fill(ch);
  return g;
}

/** Fill one whole map column. */
export function fillCol(g, col, ch) {
  for (let r = 0; r < 16; r++) g[r][col] = ch;
  return g;
}

/** Set a single cell. */
export function put(g, col, row, ch) {
  g[row][col] = ch;
  return g;
}

/** ASCII grid -> {cells, width}: the $D000 image, 2 B/cell, column-major. */
export function buildCells(g) {
  if (g.length !== 16) throw new Error('a level is always 16 metatiles tall');
  const width = g[0].length;
  for (const row of g) {
    if (row.length !== width) throw new Error('ragged map rows');
  }
  const cells = new Uint8Array(width * 16 * 2);
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < width; col++) {
      const ch = g[row][col];
      const coll = CHAR_COLL[ch];
      if (coll === undefined) throw new Error(`unknown map char ${JSON.stringify(ch)}`);
      const i = (col * 16 + row) * 2;
      cells[i] = ch.charCodeAt(0) & 0xFF;   // metatile graphic id
      cells[i + 1] = coll;                  // collisionLUT[id]
    }
  }
  return { cells, width };
}

/** A state with a synthetic level loaded. `g` is a grid() (or array of strings). */
export function makeState(g, opts = {}) {
  const state = createState(makeTunables(opts.tunables || {}));
  const { cells, width } = buildCells(g);
  state.level.number = opts.level ?? 1;
  state.level.width = width;
  state.level.height = 16;
  state.level.cells = cells;
  state.level.metatiles = opts.metatiles ?? [];
  // $C73E: 0 outside boss/vehicle levels. createState() does not define this.
  state.level.bossId = opts.bossId ?? 0;
  state.camera.clampRight = opts.clampRight ?? (width - 1);   // $C732
  return state;
}

/** Open sky, width `w`, solid from map row `floorRow` down. */
export function corridor(w = 32, floorRow = 14) {
  return floorFrom(grid(w), floorRow);
}

/** Place the player at a metatile cell. `row` is a MAP row (0-15). */
export function placePlayer(state, col, row, xlo = 0x80, ylo = 0x00) {
  state.player.x = ((col & 0xFF) << 8) | (xlo & 0xFF);
  state.player.y = (((Y_BIAS + row) & 0xFF) << 8) | (ylo & 0xFF);
  return state.player;
}

/** $FFE1 held / $FFE2 newly-pressed. */
export function setInput(state, held = 0, pressed = 0) {
  state.input.held = held;
  state.input.pressed = pressed;
  state.input.prev = held;
}

/** Run n game frames of the player state machine, ticking $FFB1 as $0567 does. */
export function step(state, n = 1, before = null) {
  for (let i = 0; i < n; i++) {
    if (before) before(state, i);
    updatePlayer(state);
    state.frame = (state.frame + 1) & 0xFF;
  }
  return state.player;
}

/** Convenience: pixel/metatile views of a 12.4 value. */
export const hi = (v) => (v >> 8) & 0xFF;
export const lo = (v) => v & 0xFF;
