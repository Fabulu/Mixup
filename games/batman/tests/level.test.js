// Level data.  ROM: sub_00_2889 (metatiles), level init $04BB, 1:$7CED
// (player start).  Master reference §6.2.

import test from 'node:test';
import assert from 'node:assert/strict';

import { metatileTile, resetPlayer, clearLevel } from '../src/level.js';
import { afterDeath } from '../src/main.js';
import { DEFAULT_TUNABLES } from '../src/tunables.js';
import { makeState, grid } from './helpers.js';

/** Two metatiles whose four ids are distinguishable at a glance. */
const METATILES = [
  [0xA0, 0xA1, 0xA2, 0xA3],   // TL, BL, TR, BR
  [0xB0, 0xB1, 0xB2, 0xB3],
];

const withMetatiles = () => makeState(grid(4), { metatiles: METATILES });

test('metatileTile is COLUMN-major: the stored order is TL, BL, TR, BR', () => {
  // ROM: 5:$4000 entries are 4 tile ids column-major (master reference §6.2).
  // Index = subCol * 2 + subRow, NOT subRow * 2 + subCol.
  const state = withMetatiles();
  assert.equal(metatileTile(state, 0, 0, 0), 0xA0, 'top-left');
  assert.equal(metatileTile(state, 0, 0, 1), 0xA1, 'bottom-left');
  assert.equal(metatileTile(state, 0, 1, 0), 0xA2, 'top-right');
  assert.equal(metatileTile(state, 0, 1, 1), 0xA3, 'bottom-right');
});

test('metatileTile row-major would give a different answer (the ordering matters)', () => {
  // Guard against a "fix" that swaps the two sub-indices.
  const state = withMetatiles();
  assert.notEqual(metatileTile(state, 0, 0, 1), metatileTile(state, 0, 1, 0));
});

test('metatileTile indexes the metatile table by id', () => {
  const state = withMetatiles();
  assert.equal(metatileTile(state, 1, 0, 0), 0xB0);
  assert.equal(metatileTile(state, 1, 1, 1), 0xB3);
});

test('metatileTile falls back to the blank fill tile $2F for a missing metatile', () => {
  // Master reference §6.2: L9-14 reference id len/4, one past the end.
  const state = withMetatiles();
  assert.equal(metatileTile(state, 99, 0, 0), 0x2F);
  assert.equal(metatileTile(state, 2, 1, 1), 0x2F);
});

test('every sub-cell of every metatile is reachable exactly once', () => {
  // Sanity: the four (subCol, subRow) pairs map onto the four stored ids.
  const state = withMetatiles();
  const got = [];
  for (let subCol = 0; subCol < 2; subCol++) {
    for (let subRow = 0; subRow < 2; subRow++) got.push(metatileTile(state, 0, subCol, subRow));
  }
  assert.deepEqual(got.slice().sort(), [...METATILES[0]].sort());
});

// ---------------------------------------------------------------------------
// resetPlayer.  ROM: level init at $04BB, start position from 1:$7CED.
// ---------------------------------------------------------------------------

test('resetPlayer forces the X low byte to $80 and spawns GROUNDED', () => {
  // ROM: $04BB -- 1:$7CED stores {Xhi, Yhi} only; $FF82 is written with $80.
  //
  // $04F3 writes $FF80 = 0, in the same XOR A run that clears $FFC3/4/5. This
  // used to assert 2, matching a "spawn falling" shortcut the port carried;
  // the cartridge does not do that, and $1B34 stamps a 16-frame landing squat
  // only when $FF80 was 2 on arrival, so the shortcut played a squat on frame
  // 1 that the cartridge never plays. Invisible until `anim` joined the
  // compared set, then responsible for 8 of 47 scenarios failing.
  const state = makeState(grid(8));
  resetPlayer(state, { startX: 7, startY: 0x12 });
  const p = state.player;
  assert.equal(p.x, (7 << 8) | 0x80);
  assert.equal(p.y, 0x12 << 8);
  assert.equal(p.air, 0, '$04F3: grounded, not falling');
  assert.equal(p.facing, 0);
  assert.equal(p.vx, 0);
  assert.equal(p.vy, 0);
});

test('resetPlayer takes the hitbox from the tunables and does NOT touch HP', () => {
  // ROM: $052D/$0531 are the hitbox writes inside level init.
  //
  // HP and MAX HP are not. This test used to assert that resetPlayer restored
  // both from `startingMaxHP` and cited "$00201" for it -- which is the BOOT
  // VECTOR's operand ($0200: LD A,$0A / $0202: LDH [$FF8E],A), not level init.
  // $04BB writes NEITHER $FF8A nor $FF8E, $FF8E has exactly two writers in the
  // whole cartridge ($0202 and 1:$4D70's +2 pickup), and the test was pinning
  // the bug: every screen handoff threw the upgrade away.
  //
  // MEASURED (tools/oracle/econmaxhp.py): $FF8E = $10 on level 3, die, and both
  // CONTINUE and "START a route instead" come back holding 16.
  const state = makeState(grid(8));
  state.player.hp = 3;
  state.player.hpMax = 16;
  resetPlayer(state, { startX: 1, startY: 0x10 });
  const p = state.player;
  assert.equal(p.hp, 3, '$04BB does not write $FF8A');
  assert.equal(p.hpMax, 16, '$04BB does not write $FF8E');
  assert.equal(p.halfW, DEFAULT_TUNABLES.hitboxHalfWidth);
  assert.equal(p.halfH, DEFAULT_TUNABLES.hitboxHalfHeight);
});

test('a fresh state seeds max HP and lives from the tunables ($0202/$0208)', () => {
  // docs/02-MOD-SYSTEM: mods override at load time and nothing may inline
  // these. The boot vector is the only initialiser of either byte, so this is
  // where the One Life mod has to bite -- it used to be handed five lives on
  // the first run because state.js hardcoded 5.
  const state = makeState(grid(8), { tunables: { startingMaxHP: 3, startingLives: 1 } });
  assert.equal(state.player.hpMax, 3);
  assert.equal(state.player.hp, 3);
  assert.equal(state.flow.lives, 1);
});

test('resetPlayer honours overridden hitbox tunables', () => {
  const state = makeState(grid(8), {
    tunables: { hitboxHalfWidth: 9, hitboxHalfHeight: 11 },
  });
  resetPlayer(state, { startX: 1, startY: 0x10 });
  assert.equal(state.player.halfW, 9);
  assert.equal(state.player.halfH, 11);
});

test('a walk-off transition re-inits almost nothing (loc_00_2820)', () => {
  // $2820 calls sub_00_2889 and sub_00_0D50 and never touches the $04BE-$053F
  // register block. MEASURED (tools/oracle/walkoff.py, level 1 -> 2): vx
  // continues $08, $09, $0A across the boundary and $C714 steps 53 -> 52.
  const state = makeState(grid(8));
  state.level.number = 2;
  state.level.subtype = 0x00;           // level 2's 0:$1015 byte: bit 7 CLEAR
  Object.assign(state.player, { vx: 8, vy: -3, air: 2, facing: 1, iframes: 53,
                                halfW: 4, halfH: 5 });
  state.flow.ammo = 7;
  resetPlayer(state, { startX: 1, startY: 0x19 }, { transition: true });
  const p = state.player;
  assert.equal(p.vx, 8, '$FF86 survives');
  assert.equal(p.vy, -3, '$FF87 survives');
  assert.equal(p.air, 2, '$FF80 survives');
  assert.equal(p.facing, 1, '$FF88 survives');
  assert.equal(p.iframes, 53, '$C714 survives');
  assert.equal(p.halfW, 4, '$FF8C survives');
  assert.equal(state.flow.ammo, 7, '$C759 survives');
  // sub_00_2889 still places the player and clears $FF95.
  assert.equal(p.x, (1 << 8) | 0x80);
  assert.equal(p.y, 0x19 << 8);
});

test('a walk-off into a bit-7 level still runs sub_00_0D50 own motion clear', () => {
  // $0D5E: BIT 7 of 0:$1015[level-1]; $0D66-$0D6D zeroes $FF80/$FF86/$FF87
  // and $C714. Levels 1, 4, 5, 8, 9, 11, 12 and 14 carry the bit.
  const state = makeState(grid(8));
  state.level.number = 5;
  state.level.subtype = 0x80;
  Object.assign(state.player, { vx: 8, vy: -3, air: 2, facing: 1, iframes: 53 });
  resetPlayer(state, { startX: 1, startY: 0x13 }, { transition: true });
  const p = state.player;
  assert.equal(p.vx, 0);
  assert.equal(p.vy, 0);
  assert.equal(p.air, 0);
  assert.equal(p.iframes, 0);
  assert.equal(p.facing, 1, 'but $FF88 is still not in that clear');
});

test('resetPlayer clears every modal timer and flag', () => {
  // ROM: $04BB writes the whole $FF8F-$FFC2 block.
  const state = makeState(grid(8));
  Object.assign(state.player, {
    turnTimer: 5, squatTimer: 5, airThrottle: 3, jumpReleased: 1,
    clingLock: 0x5F, slowMode: 0x80, attrMask: 0x80, action: 2,
    springArmed: 1, iframes: 40,
  });
  resetPlayer(state, { startX: 1, startY: 0x10 });
  const p = state.player;
  for (const k of ['turnTimer', 'squatTimer', 'airThrottle', 'jumpReleased',
    'clingLock', 'slowMode', 'attrMask', 'action', 'springArmed', 'iframes']) {
    assert.equal(p[k], 0, `${k} not cleared`);
  }
  assert.equal(p.animPrev, 0xFF, 'forces a full repaint');
  assert.equal(p.msIndex, 1, 'facing XOR 1');
});

// ---------------------------------------------------------------------------
// clearLevel.  ROM: loc_00_35E8-$363A.
//
// All three route bits are MEASURED end to end on the cartridge, by zeroing
// the boss's own HP byte (record +$16) and letting the ROM run its own death
// and clear sequence: level 4 with $C753 = $00 -> $01 then loc_00_035B,
// level 8 with $00 -> $02, level 11 with $03 -> $07 then $FFB0 = $0C.
// tools/oracle/flowdiff.mjs is the standing regression.
// ---------------------------------------------------------------------------

function flowState(level, mask) {
  const s = makeState(grid(4));
  s.level.number = level;
  s.level.bossId = 1;
  s.flow.routeMask = mask;
  // 0:$286D's TOP column for this level. Only the $35FA arm reads it, and only
  // level 6 ever reaches that arm; the value stands in for the table here.
  s.level.exitTop = level === 6 ? 0x07 : 0xFE;
  return s;
}

test('clearing a route boss sets that route bit and returns to the menu', () => {
  for (const [level, bit] of [[0x04, 0x01], [0x08, 0x02], [0x0B, 0x04]]) {
    const s = flowState(level, 0);
    assert.deepEqual(clearLevel(s), { to: 'roundselect' }, `level ${level}`);
    assert.equal(s.flow.routeMask, bit, `level ${level}`);
    // $362C: $C73E goes back to 0 on the way out.
    assert.equal(s.level.bossId, 0);
  }
});

test('the bit is OR-ed, so clearing a route twice is a no-op', () => {
  const s = flowState(0x08, 0x03);
  clearLevel(s);
  assert.equal(s.flow.routeMask, 0x03);
});

test('the third route completing the mask warps to level $0C, no menu', () => {
  // $361E: CP $07 -> POP HL / $FFB0 = $0C / JP loc_00_04BB.
  const s = flowState(0x0B, 0x03);
  assert.deepEqual(clearLevel(s), { to: 'level', level: 0x0C });
  assert.equal(s.flow.routeMask, 0x07);
});

test('every other level takes the ordinary walk-off handoff', () => {
  // $35FA-$3605 falls through to JP loc_00_2820 -- $C753 is not touched at
  // all. It has exactly one writer in the cartridge ($361B).
  for (const level of [1, 2, 3, 5, 7, 9, 10, 0x0C, 0x0D]) {
    const s = flowState(level, 0x02);
    assert.deepEqual(clearLevel(s), { to: 'transition', exit: 0xFE }, `level ${level}`);
    assert.equal(s.flow.routeMask, 0x02, `level ${level}`);
  }
});

test('clearing level 6 hands over through the TOP exit, not the right one', () => {
  // $3603 is `LD C,$01` and C indexes the COLUMN of the 0:$286D pair, so the
  // clear arm takes the TOP exit. Level 6's row is right = $FF, top = $07 --
  // and level 6 is the only level that reaches this arm at all, because it
  // needs a non-zero $C73E and 4/8/$0B/$0E are dispatched above it.
  //
  // Reading the RIGHT column here finds $FF, which is not a level: the port
  // wrote no next level, the cleared vehicle stage kept running, and the game
  // could not be completed past level 6. MEASURED on the cartridge
  // (tools/oracle/l6clear.py): $FFB0 = 7 by frame 183.
  const s = flowState(6, 0x02);
  s.level.exitRight = 0xFF;
  assert.deepEqual(clearLevel(s), { to: 'transition', exit: 0x07 });
  assert.equal(s.level.bossId, 0, '$35FB: $C73E');
});

test('level $0E ends the game rather than touching the mask', () => {
  const s = flowState(0x0E, 0x07);
  assert.deepEqual(clearLevel(s), { to: 'ending' });
  assert.equal(s.flow.routeMask, 0x07);
});

// ---------------------------------------------------------------------------
// afterDeath.  ROM: loc_00_2AAD.
// ---------------------------------------------------------------------------

test('an ordinary death latches $FFB5 so CONTINUE exists', () => {
  // $2AAF, one instruction before the lives decrement. MEASURED: dying on
  // level 3 reaches $035B with $FFB5 = 1 and $C753 untouched.
  const s = flowState(3, 0x03);
  assert.equal(afterDeath(s, false), 'roundselect');
  assert.equal(s.flow.continueAvailable, 1);
  assert.equal(s.flow.routeMask, 0x03);
});

test('the last life wipes the run, cleared routes included', () => {
  // $2ABA is `JP Z, loc_00_0150` -- the BOOT VECTOR, which clears HRAM and
  // $C000-$DFFE. MEASURED (tools/oracle/econgameover.py) with $C753 = $05,
  // $C754 = $07, $C756 = $02, $FF8E = $10 and $C759 = $2A poked in and one
  // life left: the machine comes back 00 / 00 / 01 / $0A / 00, five lives.
  //
  // $C754 and $C756 used to survive here. That is not cosmetic: 1:$4DDA erases
  // a +2-max-HP pickup's map cell whenever its $C754 bit is set, so keeping
  // the latch made all three of them (levels 3, 5 and $0D) unobtainable for
  // every run after the first game over.
  const s = flowState(3, 0x03);
  s.flow.continueAvailable = 1;
  s.flow.maxHpTaken = 0x07;
  s.flow.difficulty = 2;
  s.flow.rescueCheat = 1;
  s.flow.ammo = 0x2A;
  s.player.hpMax = 16;
  assert.equal(afterDeath(s, true), 'gameover');
  assert.equal(s.flow.routeMask, 0);
  assert.equal(s.flow.continueAvailable, 0);
  assert.equal(s.flow.maxHpTaken, 0, '$C754 is inside the $C000-$DFFE wipe');
  assert.equal(s.flow.difficulty, 1, '$01D1 re-seeds it');
  assert.equal(s.flow.rescueCheat, 0, '$C75C is inside the wipe too');
  assert.equal(s.flow.ammo, 0);
  assert.equal(s.player.hpMax, DEFAULT_TUNABLES.startingMaxHP, '$0202');
  assert.equal(s.player.hp, DEFAULT_TUNABLES.startingMaxHP, '$0204');
  assert.equal(s.flow.lives, DEFAULT_TUNABLES.startingLives, '$0208');
});
