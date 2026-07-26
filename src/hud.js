// In-game HUD.  ROM: sub_00_0F7B.
//
// The HUD is drawn as metasprites, FIRST in the main loop, so it occupies the
// lowest shadow-OAM slots and therefore wins DMG sprite priority over
// everything else. It is an energy bar only -- lives are shown on menu and
// intro screens, never in play.

import { drawMetasprite } from './render/metasprite.js';

/** Metasprite ids for the primary bar: $81 = empty, $82-$86 = 1..10 HP. */
const BAR_EMPTY = 0x81;
const BAR_BASE = 0x82;

/** Screen position. ROM: BC = $1810 -- OAM (24, 16), i.e. screen (8, 8). */
const BAR1_X = 8, BAR1_Y = 8;
/** Second bar. ROM: BC = $1838 -- OAM (24, 56), i.e. screen (48, 8). */
const BAR2_X = 48, BAR2_Y = 8;

/** ROM: the $0FA9/$0FAE/$0FB3 base select, as offsets into tables.hudBar2. */
const BAR2_BASE = { 12: 0x100C, 14: 0x100E };
const BAR2_DEFAULT = 0x1011;
const BAR2_TABLE_ORIGIN = 0x100C;

export function drawHud(state, manifest) {
  const p = state.player;
  const table = manifest.metasprites.table1;

  // $0F7E: the primary bar shows at most 10 HP.
  let hp = p.hp;
  if (hp >= 0x0B) hp = 0x0A;                        // $0F84

  const id = hp === 0 ? BAR_EMPTY : BAR_BASE + ((hp - 1) >> 1);   // $0F8D
  drawMetasprite(state, table, id, BAR1_X, BAR1_Y, 0);            // $0F94

  // $0F9A: no second bar unless max HP was upgraded past 10.
  if (p.hpMax < 0x0B) return;

  const bar2 = state.tables && state.tables.hudBar2;
  if (!bar2) return;

  const base = (BAR2_BASE[p.hpMax] ?? BAR2_DEFAULT) - BAR2_TABLE_ORIGIN;

  // $0FB6: index by the HP above 10, halved.
  let over = p.hp - 0x0A;                           // $0FB8
  if (over < 0) over = 0;                           // $0FBA: JR C leaves C = 0
  const idx = (over + 1) >> 1;                      // $0FBE

  const id2 = bar2[base + idx];
  if (id2 !== undefined) {
    drawMetasprite(state, table, id2, BAR2_X, BAR2_Y, 0);         // $0FC8
  }
}
