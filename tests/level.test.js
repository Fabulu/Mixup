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

test('resetPlayer takes HP and the hitbox from the tunables', () => {
  // ROM: $00201 startingMaxHP, $0052D/$00531 hitbox.
  const state = makeState(grid(8));
  resetPlayer(state, { startX: 1, startY: 0x10 });
  const p = state.player;
  assert.equal(p.hp, DEFAULT_TUNABLES.startingMaxHP);
  assert.equal(p.hpMax, DEFAULT_TUNABLES.startingMaxHP);
  assert.equal(p.halfW, DEFAULT_TUNABLES.hitboxHalfWidth);
  assert.equal(p.halfH, DEFAULT_TUNABLES.hitboxHalfHeight);
});

test('resetPlayer honours overridden tunables', () => {
  // docs/02-MOD-SYSTEM: mods override at load time and nothing may inline these.
  const state = makeState(grid(8), {
    tunables: { startingMaxHP: 3, hitboxHalfWidth: 9, hitboxHalfHeight: 11 },
  });
  resetPlayer(state, { startX: 1, startY: 0x10 });
  assert.equal(state.player.hpMax, 3);
  assert.equal(state.player.halfW, 9);
  assert.equal(state.player.halfH, 11);
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
  for (const level of [1, 2, 3, 5, 6, 7, 9, 10, 0x0C, 0x0D]) {
    const s = flowState(level, 0x02);
    assert.deepEqual(clearLevel(s), { to: 'transition' }, `level ${level}`);
    assert.equal(s.flow.routeMask, 0x02, `level ${level}`);
  }
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
  // $C000-$DFFE. MEASURED with $C753 = $03 and one life: the machine comes
  // back with $C753 = 0, $FFB5 = 0, five lives, level 1.
  const s = flowState(3, 0x03);
  s.flow.continueAvailable = 1;
  assert.equal(afterDeath(s, true), 'gameover');
  assert.equal(s.flow.routeMask, 0);
  assert.equal(s.flow.continueAvailable, 0);
});
