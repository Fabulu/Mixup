// THE SIX ROUTINES BETWEEN SCROLL $0440 AND THE STAGE-1 BOSS.
//
// Entries 7 ($B6E1), 19 ($B747), 15 ($AF2E), 16 ($AF88), 9 ($B311) and 12
// ($B3CB), plus the two arms that had to come with them: $C05F (the ARMOURED
// damage accumulator, without which a hatch is invulnerable and crashes on the
// first shot) and $A19E (the missile crawl, tested in tests/weapons*.test.js
// beside the rest of the missile loop).
//
// WHY A DEDICATED FILE AND NOT JUST THE SCENARIO. `deep-powered` compares 3099
// frames and every one of these six runs inside it -- measured off the recorded
// artifact's own $030C-$0315, in docs/worklog/gradius/22-impl-six-routines.md.
// What it CANNOT do is attribute: a red frame says "slot 19 is wrong", not
// "$B65C's high clamp is $F8 instead of $F0". And there are constants no
// 3099-frame window drives across at all -- the $B690 free at x < 8, the phase-7
// exit at $046C == 7, the $AF98 spawn gate at x == $C8 exactly, the score-parity
// gate on the warp counter. Those are here.
//
// EVERY TEST IN THIS FILE HAS BEEN SEEN RED. The mutation is named in the
// comment above each one and the measured run is in the worklog.

import test from 'node:test';
import assert from 'node:assert';

import { createState, ENEMY_BASE } from '../src/state.js';
import { updateEnemies } from '../src/enemies.js';
import { shotSweep } from '../src/collision.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);

/** A running engine with one enemy in slot 21 (j = 9) and the ship at (px, py). */
function one(type, ex, ey, px = 0x50, py = 0x60) {
  const s = createState();
  s.substate = 0x80;                 // $1B, the play sub-state
  s.spawn.z60 = 2;
  s.obj.x[0] = px; s.obj.y[0] = py;
  s.obj.type[21] = type;
  s.obj.x[21] = ex; s.obj.y[21] = ey;
  return s;
}

/**
 * Put a solid cell under `probeCollision(state, x, y)`. The index arithmetic is
 * $C3D3's, copied here on purpose so a test does not depend on the routine it is
 * checking the CALLERS of: cam is 0 in these states, so the cell is
 * `((x + 8) & $F8) + (((y + $14) >> 3) >> 2)` and the 2-bit field is
 * `((y + $14) >> 3) & 3`.
 */
function solid(s, x, y) {
  const trow = ((y + 0x14) & 0xFF) >> 3;
  const idx = (((x + 8) & 0xFF) & 0xF8) + (trow >> 2);
  s.coll[idx & 0x1FF] |= 3 << ((trow & 3) * 2);
}

// ===========================================================================
// ENTRY 7 -- $B6E1, THE FLOOR WALKER. THE FIRST FAILURE IN THE GAME.
// ===========================================================================

test('$B6E1 init: $B65C picks the dock column and $B0B4 sets bit 7, nothing moves', () => {
  // `$B6E8 JSR $B65C / $B6EB JMP $B0B4` -- a JMP, so it does NOT run on into
  // $B6EE. A port that fell through would probe the terrain on the spawn frame.
  // RED WHEN: the init arm falls through to the probe (y then moves by 3 on the
  //           spawn frame), or $B0B4 is dropped (the enemy never initialises).
  const s = one(0x07, 0x80, 0xB0, 0x50, 0x60);
  updateEnemies(s, res);
  assert.strictEqual(s.obj.type[21], 0x87, '$B0B4: $80 + $07');
  assert.strictEqual(s.obj.s0480[21], 0x80, '$B65C: ($50 + $30) AND $F8');
  assert.strictEqual(s.obj.y[21], 0xB0, 'no terrain probe on the spawn frame');
  assert.strictEqual(s.obj.x[21], 0x80);
});

test('$B65C: player X + $30, snapped to 8, and the HIGH clamp reached two ways', () => {
  // Four rows, and the third is the one a 3099-frame window cannot produce: the
  // ADC CARRIES, `$B662 BCS $B66A` jumps straight to LDA #$F0 and the AND #$F8
  // is SKIPPED. The high clamp is reached by two different instructions.
  // RED WHEN: `AND #$F8` moves after the clamp; `CMP #$F0` becomes #$F8; or the
  //           BCS arm is written as a clamp of the MASKED value (row 3 then
  //           gives $F8, not $F0). All three seen red.
  for (const [px, want, why] of [
    [0x00, 0x30, '$00 + $30 = $30, inside both clamps'],
    [0x50, 0x80, '$50 + $30 = $80'],
    [0xF0, 0xF0, '$F0 + $30 = $120 -- the ADC CARRIES, $B662 BCS $B66A'],
    [0xC8, 0xF0, '$C8 + $30 = $F8, masked $F8, >= $F0 -> $B66A'],
  ]) {
    const s = one(0x07, 0x80, 0xB0, px, 0x60);
    updateEnemies(s, res);
    assert.strictEqual(s.obj.s0480[21], want, why);
  }
  // THE LOW CLAMP CANNOT BE PINNED AND THAT IS MEASURED, not assumed. `$B66C
  // CMP #$20 / BCS $B672` needs a masked sum below $20, i.e. a player X in
  // $D1..$EF -- but every one of those CARRIES ($D1 + $30 = $101) and the carry
  // arm has already forced $F0. The smallest value that reaches the CMP without
  // carrying is $00 + $30 = $30. So the branch is UNREACHABLE from any player X,
  // and mutating `#$20` to `#$18` was run through the break harness and came
  // back GREEN -- it is listed as a survivor in
  // docs/worklog/gradius/22-impl-six-routines.md rather than papered over with a
  // poked $0360 the player clamp ($A03A, [16, 240]) makes impossible anyway.
  // (docs/knowledge/09: measurement proves presence; only the listing proves
  // absence, and the listing is what says this branch exists.)
});

test('$B6E1 riding the ground: y+8 empty falls 3, y+5 solid climbs 3, else level', () => {
  // $B702/$B716 are two probes of the SAME $A4/$A5 pair, the second three DECs
  // below the first -- y+8 then y+5, not y+8 then y-3+8.
  // RED WHEN: `u8(py - 3)` becomes py + 3 / py - 8 / py (rows 2 and 3 swap or
  //           collapse), or the two arms' constants $03 / $FD are exchanged.
  //
  // Y0 IS $B4 AND THAT IS NOT ARBITRARY. The two probes are three pixels apart
  // and the map's resolution is eight, so at most Y they land in the SAME 2-bit
  // field and the rows below cannot be told apart at all. $B4 + $14 + 5 = $CD is
  // tile row 25 and $B4 + $14 + 8 = $D0 is row 26 -- adjacent fields of the same
  // byte $058E, which is the tightest the map can distinguish.
  const step = (put) => {
    const s = one(0x87, 0x80, 0xB4, 0x50, 0x60);
    s.obj.s0480[21] = 0x80;            // already docked, so $B676 does not move X
    put(s);
    updateEnemies(s, res);
    return s.obj.y[21] - 0xB4;
  };
  assert.strictEqual(step(() => {}), 3, 'nothing under it: $B707 LDA #$03');
  assert.strictEqual(step((s) => solid(s, 0x80, 0xBC)), 0,
    'ground at y+8 and none at y+5: level, no Y change at all');
  assert.strictEqual(step((s) => { solid(s, 0x80, 0xBC); solid(s, 0x80, 0xB9); }),
    -3, 'ground at y+5 too: $B71B LDA #$FD');
});

test('$B676: the walk is 2 px left / 1 px right, and status 3 / 4 says which', () => {
  // The asymmetry is the ROM's: `$B687 LDA #$FE` against `$B697 LDA #$01`, and
  // the status byte ($010C, the $ADC1 animation group) is 3 going left and 4
  // going right. Docked-and-equal is a third outcome entirely.
  // RED WHEN: either constant changes, the BCC arms are swapped, or the two
  //           status values are exchanged.
  const walk = (ex, col) => {
    const s = one(0x87, ex, 0xB0, 0x50, 0x60);
    s.obj.s0480[21] = col;
    s.obj.s0460[21] = 0;               // even phase -> the probe/dock path
    solid(s, ex, 0xB8);                // ground under it: no Y change
    updateEnemies(s, res);
    return [s.obj.x[21], s.obj.status[21]];
  };
  assert.deepStrictEqual(walk(0x90, 0x80), [0x8E, 3], 'right of the column: -2, status 3');
  assert.deepStrictEqual(walk(0x70, 0x80), [0x71, 4], 'left of the column: +1, status 4');
});

test('$B690: walking left past x = 8 FREES the slot', () => {
  // `$B68C CMP #$08 / BCS $B693` then `$B690 JMP $AEF8` -- the SHORT free, five
  // bytes, not $A527's twenty-three. Nothing in a 3099-frame window walks a
  // walker off the left edge; this is the boundary either side.
  // RED WHEN: `x < 0x08` becomes `<= 0x08` or `< 0x04` (the $B251 box's
  //           constant, which is a different number in a different routine).
  for (const [x0, freed] of [[0x0B, false], [0x0A, false], [0x09, true]]) {
    const s = one(0x87, x0, 0xB0, 0x50, 0x60);
    s.obj.s0480[21] = 0x00;            // column 0: always walk left
    solid(s, x0, 0xB8);
    updateEnemies(s, res);
    assert.strictEqual(s.obj.type[21] === 0, freed,
      `x0 = $${x0.toString(16)}: $B690 ${freed ? 'must' : 'must not'} free it`);
  }
});

test('$B6A2: docking arms the GUN from $B6D2[$17] and FALLS THROUGH into $B6B8', () => {
  // The fall-through is the trap: $B6B5 STA $04CC,X ends at $B6B7 and $B6B8 is
  // the next byte. A port that treats $B6B8 as a separate subroutine loses the
  // metasprite AND the muzzle index on every docking frame.
  // $B6D2 = 3C 37 32 2D 28 28 23 -- rank 0 is $3C.
  // RED WHEN: the `return walkerFrame(...)` at the end of the docked arm is
  //           deleted (anim and $0496 stay 0), or $04EC/$040C are not both
  //           written, or $B6D2 is indexed by anything but $17.
  const s = one(0x87, 0x80, 0xB0, 0x50, 0x60);
  s.obj.s0480[21] = 0x80;              // x AND $F8 == the column: DOCK
  s.obj.s0460[21] = 0;
  s.obj.status[21] = 3;                // a real $ADC1 group, and $B6B0 zeroes it
  solid(s, 0x80, 0xB8);
  updateEnemies(s, res);
  assert.strictEqual(s.obj.s04E0[21], 0x3C, '$B6A4 LDA $B6D2,Y with $17 = 0');
  assert.strictEqual(s.obj.style[21], 0x3C, '...and $040C too: reload AND countdown');
  assert.strictEqual(s.obj.s0460[21], 1, '$B6AD INC $046C,X -- phase 0 -> 1');
  assert.strictEqual(s.obj.status[21], 0, '$B6B0 STA $010C,X');
  assert.strictEqual(s.obj.anim[21], 0x1C, '$B6B8 ran: $B6D9[0]');
  assert.strictEqual(s.obj.s0480[22 + 9], 0x01, '...and $B6DD[0] -> $0496,X');

  // rank 6 is the last row of $B6D2 ($23), which no scenario reaches.
  const r = one(0x87, 0x80, 0xB0, 0x50, 0x60);
  r.zp17 = 6; r.obj.s0480[21] = 0x80; solid(r, 0x80, 0xB8);
  updateEnemies(r, res);
  assert.strictEqual(r.obj.s04E0[21], 0x23, '$B6D2[6]');
});

test('$B6B8: Y is $04AC + 2 when the walker is LEFT of the ship, and the tables differ', () => {
  // $B6D9 = 1C 1C 1F 1F (metasprites), $B6DD = 01 03 02 04 (muzzle index). The
  // metasprite table repeats, so ONLY the muzzle column can tell index 0 from 1
  // and 2 from 3 -- which is why both are asserted on every row. W21's
  // tablecoverage.py is what settled which table is which.
  // RED WHEN: `$B6C1 BCS` is inverted (rows swap), the INY/INY becomes one INY,
  //           or $B6D9/$B6DD are read from each other's base.
  const at = (ex, base) => {
    const s = one(0x87, ex, 0xB0, 0x80, 0x60);   // ship at x = $80
    s.obj.s0480[21] = ex & 0xF8;       // docked, so $B6B8 runs
    s.obj.s04A0[21] = base;
    solid(s, ex, 0xB8);
    updateEnemies(s, res);
    return [s.obj.anim[21], s.obj.s0480[22 + 9]];
  };
  assert.deepStrictEqual(at(0x88, 0), [0x1C, 0x01], 'floor, right of the ship: Y = 0');
  assert.deepStrictEqual(at(0x78, 0), [0x1F, 0x02], 'floor, LEFT of the ship: Y = 2');
  assert.deepStrictEqual(at(0x88, 1), [0x1C, 0x03], 'ceiling, right: Y = 1');
  assert.deepStrictEqual(at(0x78, 1), [0x1F, 0x04], 'ceiling, LEFT: Y = 3');
});

test('$B723: the odd phase counts 60 frames, then re-docks -- and at phase 7 leaves', () => {
  // `$B72F CMP #$3C / BCS` and `$B73A CMP #$07 / BCS $B741`. Phase 7 writes
  // $048C = 0 instead of re-picking the column, which is how the walker leaves:
  // every later $B676 sees `col > 0` and walks left until $B690 frees it.
  // RED WHEN: #$3C becomes #$3B or #$3D; #$07 becomes #$06; or the phase-7 arm
  //           calls $B65C anyway.
  //
  // #$07 -> #$08 IS GREEN AND THAT IS A FACT ABOUT THE ROM, not a hole. $B723 is
  // reached only from `$B6F3 BNE` and `$B753 BNE` on `$046C AND #$01`, so the
  // phase is ODD every time it runs and the INC makes the compared value EVEN --
  // 2, 4, 6, 8. No odd value ever reaches the CMP, so #$07 and #$08 are the same
  // instruction. Measured with the break harness; listed as a survivor in the
  // worklog with this reason.
  const tick = (phase, c) => {
    const s = one(0x87, 0x80, 0xB0, 0x50, 0x60);
    s.obj.s0460[21] = phase;           // ODD -> $B723
    s.obj.s04C0[21] = c;
    s.obj.s0480[21] = 0x11;            // a value $B65C can never produce
    updateEnemies(s, res);
    return s;
  };
  assert.strictEqual(tick(1, 0x3A).obj.s0460[21], 1, '$3A -> $3B: still phase 1');
  const rolled = tick(1, 0x3B);
  assert.strictEqual(rolled.obj.s0460[21], 2, '$3B -> $3C: $B734 INC $046C,X');
  assert.strictEqual(rolled.obj.s0480[21], 0x80, '$B73E JMP $B65C re-docks');
  const gone = tick(5, 0x3B);          // phase 5 -> 6, still < 7
  assert.strictEqual(gone.obj.s0480[21], 0x80, 'phase 6 still re-docks');
  const last = tick(7, 0x3B);          // phase 7 -> 8, >= 7
  assert.strictEqual(last.obj.s0460[21], 8);
  assert.strictEqual(last.obj.s0480[21], 0, '$B741 LDA #$00 / STA $048C,X');
});

// ===========================================================================
// ENTRY 19 -- $B747, THE CEILING WALKER
// ===========================================================================

test('$B747 init: $04AC = 1 and $018C gets the vertical FLIP, then the same dock', () => {
  // The only three bytes that differ from entry 7's init, and $04AC = 1 is what
  // shifts $B6B8's whole lookup by one row.
  // RED WHEN: `o.s04A0[i] = 1` is dropped (the ceiling walker then draws the
  //           floor walker's metasprites), or the ORA #$80 becomes an assign.
  const s = one(0x13, 0x80, 0x20, 0x50, 0x60);
  s.obj.attrMask[21] = 0x01;           // must be OR'd, not overwritten
  updateEnemies(s, res);
  assert.strictEqual(s.obj.type[21], 0x93, '$B784 JMP $B0B4');
  assert.strictEqual(s.obj.s04A0[21], 1, '$B774 LDA #$01 / STA $04AC,X');
  assert.strictEqual(s.obj.attrMask[21], 0x81, '$B77C ORA #$80, keeping the 1');
  assert.strictEqual(s.obj.s0480[21], 0x80, '$B781 JSR $B65C -- the same column');
});

test('$B747 riding the ceiling: the Y sign is flipped and the two arms are SWAPPED', () => {
  // `$B765 BEQ $B71B` -- EMPTY at y-8 climbs (-3), which is the opposite of
  // entry 7's empty-at-y+8 falling (+3). Both arms are entry 7's own two
  // constants, reached from entry 19's branches.
  // RED WHEN: the two arms are copied from entry 7 without swapping, or the
  //           second probe is at py - 3 instead of py + 3.
  // Y0 = $41 for the same reason $B4 was chosen above: $41 - 8 + $14 = $4D is
  // tile row 9 and $41 - 5 + $14 = $50 is row 10, so the two probes land in
  // different fields.
  const step = (put) => {
    const s = one(0x93, 0x80, 0x41, 0x50, 0x60);
    s.obj.s04A0[21] = 1;
    s.obj.s0480[21] = 0x80;            // docked
    put(s);
    updateEnemies(s, res);
    return s.obj.y[21] - 0x41;
  };
  assert.strictEqual(step(() => {}), -3, 'nothing at y-8: climb toward the roof');
  assert.strictEqual(step((s) => solid(s, 0x80, 0x39)), 0,
    'ceiling at y-8 and none at y-5: level');
  assert.strictEqual(step((s) => { solid(s, 0x80, 0x39); solid(s, 0x80, 0x3C); }),
    3, 'ceiling at y-5 too: back down');
});

// ===========================================================================
// ENTRIES 15 AND 16 -- $AF2E / $AF88, THE HATCHES
// ===========================================================================

test('$AF33: the hatch init is SHARED, and all four of its stores matter', () => {
  // $0460,X is the j-INDEXED array (the hitbox class $C020 reads), $048C is what
  // gates armour damage at $C070, $010C = $80 is what makes it armoured at all.
  // Entry 16 reaches this same block through `$AF8B BPL $AF33`.
  // RED WHEN: `o.s0460[j]` becomes `o.s0460[i]` -- the class then lands on the
  //           enemy's own damage counter and the hatch starts one hit down;
  //       OR: $048C or $010C is dropped (the hatch becomes invulnerable, and
  //           silently -- $C070's BEQ is not a throw).
  for (const type of [0x0F, 0x10]) {
    const s = one(type, 0xE0, 0xB0, 0x50, 0x60);
    updateEnemies(s, res);
    assert.strictEqual(s.obj.type[21], 0x80 + type, '$AF40 JMP $B0B4');
    assert.strictEqual(s.obj.s0460[9], 1, '$AF35 STA $0460,X -- j, not j + 12');
    assert.strictEqual(s.obj.s0460[21], 0, '...and NOT the damage counter');
    assert.strictEqual(s.obj.s0480[21], 1, '$AF38 STA $048C,X');
    assert.strictEqual(s.obj.status[21], 0x80, '$AF3B LDA #$80');
  }
});

test('$AF54: the metasprite, the palette at 3 hits and the destruction at 5', () => {
  // `CPY #$03 / BCC` and `CPY #$05 / BCC` -- both boundaries, both sides, plus
  // the two hatches' different metasprites and entry 15's stage-5 swap.
  // RED WHEN: either CPY constant moves; $78/$79 are exchanged; or the stage-5
  //           arm is applied to entry 16 (which branches PAST $AF4A).
  const hatch = (type, dmg, stage = 0) => {
    const s = one(0x80 + type, 0xE0, 0xB0, 0x50, 0x60);
    s.zp19 = stage;
    s.obj.status[21] = 0x80; s.obj.s0480[21] = 1; s.obj.s0460[9] = 1;
    s.obj.s0460[21] = dmg;
    s.obj.xvel[21] = 2;                // phase 2: $AFA8 RTS, no child this frame
    updateEnemies(s, res);
    return s;
  };
  assert.strictEqual(hatch(0x0F, 0).obj.anim[21], 0x78, '$AF4A LDA #$78');
  assert.strictEqual(hatch(0x10, 0).obj.anim[21], 0x79, '$AF94 LDA #$79');
  assert.strictEqual(hatch(0x0F, 0, 5).obj.anim[21], 0x63, '$AF52: stage 5 only');
  assert.strictEqual(hatch(0x10, 0, 5).obj.anim[21], 0x79, 'and NOT for entry 16');
  assert.strictEqual(hatch(0x0F, 2).obj.attrMask[21], 0, '2 hits: no palette');
  assert.strictEqual(hatch(0x0F, 3).obj.attrMask[21], 3, '3 hits: $AF5E LDA #$03');
  assert.strictEqual(hatch(0x0F, 4).obj.type[21], 0x8F, '4 hits: still alive');
  const dead = hatch(0x0F, 5);
  assert.strictEqual(dead.obj.type[21], 2, '5 hits: $CB47 STA $030C,X');
  assert.strictEqual(dead.obj.animFrame[21], 2, '$CB4A -- explosion script 2');
  assert.strictEqual(dead.obj.carrier[21], 0, '$CB3F: a hatch drops NO capsule');
  assert.strictEqual(dead.sfx.includes(0x0A), true, '$AF80 LDA #$0A / $CB28');
});

test('$AF67: the WARP counter -- stage 0 only, score parity, and $5F >= 4 sets $39', () => {
  // Four gates on four instructions, and NOTHING in the corpus can reach any of
  // them: it needs a hatch killed, which needs $C05F, which needs a shot on an
  // armoured enemy. `$AF70 LDA $07E5,Y` with Y = $18 * 4 is the CURRENT player's
  // score middle byte -- the same 4-byte stride $8474 uses -- and `$AF73 LSR A /
  // BCS` reads its BIT 0. This is the only producer of $39 outside the boss.
  // RED WHEN: the `$19 == 0` gate is dropped (stage 2 hatches then count);
  //       OR the parity test is inverted (`(digit & 1) !== 0`);
  //       OR `>= 4` becomes `> 4` or `>= 3`;
  //       OR the score byte is read at score[4 + 4*p] / score[6 + 4*p].
  const kill = (mut) => {
    const s = one(0x8F, 0xE0, 0xB0, 0x50, 0x60);
    s.obj.status[21] = 0x80; s.obj.s0480[21] = 1; s.obj.s0460[21] = 5;
    s.obj.xvel[21] = 2;
    mut(s);
    updateEnemies(s, res);
    return s;
  };
  assert.strictEqual(kill(() => {}).zp5F, 1, 'score $00 is even: $AF76 INC $5F');
  assert.strictEqual(kill((s) => { s.score[5] = 0x11; }).zp5F, 0,
    '$AF73 LSR A / BCS $AF80 -- an ODD middle byte skips the counter');
  assert.strictEqual(kill((s) => { s.score[5] = 0x10; }).zp5F, 1, '...and $10 does not');
  assert.strictEqual(kill((s) => { s.zp19 = 1; }).zp5F, 0, '$AF69: stage 0 only');
  assert.strictEqual(kill(() => {}).zp39, 0, 'one kill is not four');
  assert.strictEqual(kill((s) => { s.zp5F = 2; }).zp39, 0, '$5F 2 -> 3: still not four');
  assert.strictEqual(kill((s) => { s.zp5F = 3; }).zp39, 1, '$5F 3 -> 4: $AF7E INC $39');
  assert.strictEqual(kill((s) => { s.zp5F = 9; }).zp39, 1, 'and it stays set above 4');
});

test('$AF98: the child spawn gate -- phase, X threshold, one frame in 16, five per phase', () => {
  // Four independent gates, none of which a scenario can isolate. The X
  // thresholds are the boundary values themselves ($C8 for phase 0, $A0 for
  // phase 1) because a comparison only sees whatever X the hatch happens to have.
  // RED WHEN: either CMP becomes off by one; `(state.frame & 0x0F) !== 0`
  //           becomes `& 0x07`; the phase-2 arm spawns instead of returning; or
  //           the fifth attempt spawns instead of rolling the phase.
  const attempt = (phase, x, frame) => {
    const s = one(0x8F, x, 0xB0, 0x50, 0x60);
    s.obj.status[21] = 0x80; s.obj.s0480[21] = 1;
    s.obj.xvel[21] = phase; s.frame = frame;
    updateEnemies(s, res);
    // slot 21 is the hatch; the child takes the highest FREE slot, which is 20 --
    // and $ADB7's loop descends, so slot 20 is updated LATER IN THE SAME FRAME
    // and the child's own init ($B31B JMP $B0B4) has already set bit 7 by the
    // time this reads it. That is the cartridge's order, not an artefact.
    return s.obj.type[20];
  };
  assert.strictEqual(attempt(0, 0xC8, 0), 0x89, 'phase 0 at exactly $C8 spawns');
  assert.strictEqual(attempt(0, 0xC7, 0), 0, '...and $C7 does not');
  assert.strictEqual(attempt(1, 0xA0, 0), 0x89, 'phase 1 at exactly $A0 spawns');
  assert.strictEqual(attempt(1, 0x9F, 0), 0, '...and $9F does not');
  assert.strictEqual(attempt(2, 0xF0, 0), 0, '$AFA8: phase 2 never spawns again');
  assert.strictEqual(attempt(0, 0xC8, 1), 0, '$AFB8: only when ($02 AND $0F) == 0');
  assert.strictEqual(attempt(0, 0xC8, 0x10), 0x89, '...and $10 is also a 0 nibble');
  assert.strictEqual(attempt(0, 0xC8, 8), 0, '...and $08 is NOT -- the mask is $0F, '
    + 'not $07, which is the only frame value that tells the two apart');

  // the fifth attempt of a phase rolls the phase instead of spawning
  const s = one(0x8F, 0xC8, 0xB0, 0x50, 0x60);
  s.obj.status[21] = 0x80; s.obj.s0480[21] = 1; s.obj.xvelf[21] = 4;
  updateEnemies(s, res);
  assert.strictEqual(s.obj.type[20], 0, '$AFC6 BCS $B014: the fifth does not spawn');
  assert.strictEqual(s.obj.xvelf[21], 0, '$B016 STA $044C,X');
  assert.strictEqual(s.obj.xvel[21], 1, '$B019 INC $042C,X');
});

test('$AFE0: the child\'s type, position and FIRE INTERVAL, both hatches', () => {
  // The two hatches differ in exactly three bytes and two of them are here: the
  // child's type ($09 vs $0C) and its Y offset ($08 vs $F6 = -10). The interval
  // comes from $B01D indexed by $17 + ($19 != 0) + ($1A != 0), which is the only
  // place in the port where the STAGE shifts a rank row.
  // RED WHEN: the Y offset is applied as a subtraction; $B01D is indexed by $17
  //           alone; or $04EC and $040C are not both written.
  const child = (type, mut = () => {}) => {
    const s = one(0x80 + type, 0xC8, 0x60, 0x50, 0x60);
    s.obj.status[21] = 0x80; s.obj.s0480[21] = 1;
    mut(s);
    updateEnemies(s, res);
    return s;
  };
  // (bit 7 is already on: slot 20 is updated later in the same $ADB7 pass)
  const floor = child(0x0F);
  assert.strictEqual(floor.obj.type[20], 0x89, '$AF45 LDA #$09');
  assert.strictEqual(floor.obj.x[20], 0xD0, '$AFEE ADC #$08 on the PARENT x');
  assert.strictEqual(floor.obj.y[20], 0x68, '$AFF7 ADC $AC with $AC = $08');
  assert.strictEqual(floor.obj.s04E0[20], 0x64, '$B01D[0] with $17 = $19 = $1A = 0');
  assert.strictEqual(floor.obj.style[20], 0x64, '...into $040C as well');
  assert.strictEqual(floor.obj.status[20], 0, '$AFE5 STA $010C,X');
  const ceil = child(0x10);
  assert.strictEqual(ceil.obj.type[20], 0x8C, '$AF8F LDA #$0C');
  assert.strictEqual(ceil.obj.y[20], 0x56, '$AC = $F6, i.e. 10 px UP');
  assert.strictEqual(child(0x0F, (s) => { s.zp17 = 2; }).obj.s04E0[20], 0x3C, '$B01D[2]');
  assert.strictEqual(child(0x0F, (s) => { s.zp19 = 3; }).obj.s04E0[20], 0x46,
    '$B002 INY: a non-zero STAGE shifts the row by one');
  assert.strictEqual(child(0x0F, (s) => { s.zp17 = 2; s.zp19 = 3; s.zp1A = 1; })
    .obj.s04E0[20], 0x32, '$B007 INY as well: $B01D[2 + 1 + 1]');
});

test('$AFCA: a FULL pool drops the child and restores $A8 -- no retry, no queue', () => {
  // The allocation failure arm. `$AFD0 BPL $AFCA` leaves X = $FF and $AFD2
  // restores the parent's index; the $044C increment is NOT undone, so the hatch
  // burns one of its five attempts on a frame that spawned nothing.
  // RED WHEN: the $044C increment is moved after the allocation, or the failure
  //           arm allocates slot 0 anyway (`allocEnemySlot` returning 0 instead
  //           of -1 on a full pool).
  //
  // `$AFD2 LDX $AB / STX $A8` IS A NO-OP ON THIS PATH and deleting it is GREEN,
  // measured. $A8 is only written at $AFD7, which is past the failure branch, so
  // on the cartridge too the restore restores a value that never changed. It is
  // transcribed because it is the routine's single exit and the SUCCESS path
  // reaches it with $A8 genuinely clobbered; it is listed as a break-harness
  // survivor in the worklog so that nobody reads its presence as a covered fact.
  const s = one(0x8F, 0xC8, 0xB0, 0x50, 0x60);
  s.obj.status[21] = 0x80; s.obj.s0480[21] = 1;
  for (let j = 0; j < 10; j++) if (j !== 9) s.obj.type[j + ENEMY_BASE] = 0x85;
  updateEnemies(s, res);
  assert.strictEqual(s.obj.xvelf[21], 1, '$AFBE ran before the allocation failed');
  assert.strictEqual(s.spawn.zA8, 0xFF, '$ADBE: the loop finished normally');
  for (let j = 0; j < 9; j++) {
    assert.strictEqual(s.obj.type[j + ENEMY_BASE] & 0x7F, 0x05, 'nothing overwritten');
  }
});

// ===========================================================================
// ENTRIES 9 AND 12 -- $B311 / $B3CB, THE HATCH CHILDREN
// ===========================================================================

test('$B311 / $B3CB init: the delays differ AND only entry 12 clears $048C', () => {
  // $B316 LDA #$0A vs $B3D0 LDA #$14, and $B3D5 JMP $B3A2 -- two instructions
  // that FALL THROUGH into $B3A7 JMP $B0B4. Entry 9 has no $048C store at all.
  // RED WHEN: the two delays are exchanged; entry 9 gains the $048C = 0; or
  //           entry 12's $B3A2 arm is written as a JMP that skips $B0B4 (the
  //           child then never initialises and never moves).
  const nine = one(0x09, 0x80, 0xB0, 0x50, 0x60);
  nine.obj.s0480[21] = 0x77;
  updateEnemies(nine, res);
  assert.strictEqual(nine.obj.type[21], 0x89, '$B31B JMP $B0B4');
  assert.strictEqual(nine.obj.s04C0[21], 0x0A, '$B316 LDA #$0A');
  assert.strictEqual(nine.obj.s0480[21], 0x77, 'entry 9 does NOT clear $048C');
  const twelve = one(0x0C, 0x80, 0x40, 0x50, 0x60);
  twelve.obj.s0480[21] = 0x77;
  updateEnemies(twelve, res);
  assert.strictEqual(twelve.obj.type[21], 0x8C, 'the fall-through reaches $B0B4');
  assert.strictEqual(twelve.obj.s04C0[21], 0x14, '$B3D0 LDA #$14');
  assert.strictEqual(twelve.obj.s0480[21], 0, '$B3A2 LDA #$00 / STA $048C,X');
});

test('$B31E: the flip animation steps every 4 frames and flips the palette at 4', () => {
  // `INC $014C,X / LSR / LSR / AND #$07` on the TIMER, so the cycle is 32 frames
  // long, and `CPY #$04 / BCC` puts $80 in $018C for the second half.
  // $B33B = 5E 5F 60 61 62 61 60 5F -- the table repeats, so the metasprite
  // alone cannot tell frame 1 from frame 7; the palette byte can.
  // RED WHEN: one LSR is dropped (the cycle becomes 16 frames); `AND #$07`
  //           becomes `& 0x0F` (which reads past the table); or CPY #$04 moves.
  const s = one(0x89, 0x80, 0xB0, 0x50, 0x60);
  s.obj.s04A0[21] = 1;                 // delay already spent
  s.obj.s0480[21] = 1;                 // already ballistic: $B367, no Y motion
  const seen = [];
  for (let f = 0; f < 32; f++) { updateEnemies(s, res); seen.push([s.obj.anim[21], s.obj.attrMask[21]]); }
  assert.deepStrictEqual(seen[0], [0x5E, 0x00], 'timer 1 >> 2 = 0');
  assert.deepStrictEqual(seen[3], [0x5F, 0x00], 'timer 4 >> 2 = 1');
  assert.deepStrictEqual(seen[15], [0x62, 0x80], 'timer 16 >> 2 = 4: the flip');
  assert.deepStrictEqual(seen[31], [0x5E, 0x00], 'timer 32 >> 2 = 8 AND 7 = 0');
  const steps = seen.filter((v, k) => k > 0 && v[0] !== seen[k - 1][0]).length;
  assert.strictEqual(steps, 8, '32 frames covers timer 1..32, which crosses eight '
    + 'y boundaries (0->1 ... 6->7 and 7->0), and every one changes the frame');
});

test('$B34B: the child rises for its delay, then goes ballistic at the ship\'s Y', () => {
  // Entry 9's three-stage life. The comparison is `$B35A LDA $0320 / CMP $032C,X
  // / BCS $B367` -- the PLAYER's Y against the enemy's, which is the opposite
  // operand order from entry 12's `$B3EF LDA $032C,X / CMP $0320`. The two are
  // not the same test with the branch flipped and a port that writes them that
  // way is wrong on the equal case.
  // RED WHEN: the operands are swapped; $B34E's BNE is inverted; or $048C is not
  //           latched (the child then re-tests the player's Y forever).
  const child = (mut) => {
    const s = one(0x89, 0x80, 0xB0, 0x50, 0x60);
    mut(s);
    updateEnemies(s, res);
    return s;
  };
  const rising = child((s) => { s.obj.s04C0[21] = 5; });
  assert.strictEqual(rising.obj.y[21], 0xAE, 'delay unspent: $B362 LDA #$FE');
  assert.strictEqual(rising.obj.s04C0[21], 4, '$B34B DEC $04CC,X');
  assert.strictEqual(rising.obj.s04A0[21], 0, 'and $04AC is not latched yet');
  // The delay running out is NOT the same as going ballistic: $B34E's BNE falls
  // through into the Y test, so the frame the counter reaches 0 still rises if
  // the child has not caught the ship up.
  const spent = child((s) => { s.obj.s04C0[21] = 1; });
  assert.strictEqual(spent.obj.s04A0[21], 1, '$B352: the delay is spent');
  assert.strictEqual(spent.obj.y[21], 0xAE, 'the ship at $60 is still ABOVE $B0: rise');
  assert.strictEqual(spent.obj.s0480[21], 0, 'and $048C is not latched');
  assert.strictEqual(spent.obj.x[21], 0x7F, '$B3FC JMP $AEDD -- 0.5 px/frame drift, '
    + 'so the rising child moves 1 px left on its borrow frame, not 2');
  const caught = child((s) => { s.obj.s04A0[21] = 1; s.obj.y[0] = 0xF0; });
  assert.strictEqual(caught.obj.x[21], 0x7E, 'ship at or below the child: $B367, x -= 2');
  assert.strictEqual(caught.obj.s0480[21], 1, '$B369 latches it');
  const equal = child((s) => { s.obj.s04A0[21] = 1; s.obj.y[0] = 0xB0; });
  assert.strictEqual(equal.obj.s0480[21], 1, 'EQUAL is ballistic: BCS, not BEQ+BCS');
});

test('$B3E0: entry 12 is the mirror -- it DIVES, and its equal case is ballistic too', () => {
  // `$B3F7 LDA #$02` against entry 9's `$B362 LDA #$FE`, and `$B3EF LDA $032C,X /
  // CMP $0320 / BCS $B3FF` -- its own Y against the player's.
  // RED WHEN: the constant is copied from entry 9 unchanged, or the comparison
  //           is copied without swapping the operands (the equal case is then
  //           still ballistic but the two INEQUAL rows both flip).
  const child = (mut) => {
    const s = one(0x8C, 0x80, 0x40, 0x50, 0x60);
    mut(s);
    updateEnemies(s, res);
    return s;
  };
  const diving = child((s) => { s.obj.s04C0[21] = 5; });
  assert.strictEqual(diving.obj.y[21], 0x42, 'delay unspent: $B3F7 LDA #$02');
  const spent = child((s) => { s.obj.s04A0[21] = 1; });
  assert.strictEqual(spent.obj.y[21], 0x42, 'player BELOW at $60 > $40: keep diving');
  assert.strictEqual(spent.obj.s0480[21], 0, 'and do NOT latch');
  const past = child((s) => { s.obj.s04A0[21] = 1; s.obj.y[0] = 0x30; });
  assert.strictEqual(past.obj.x[21], 0x7E, 'player ABOVE: $B3FF -> $B367, x -= 2');
  assert.strictEqual(past.obj.s0480[21], 1);
  const equal = child((s) => { s.obj.s04A0[21] = 1; s.obj.y[0] = 0x40; });
  assert.strictEqual(equal.obj.s0480[21], 1, 'EQUAL is ballistic here too');
});

test('$B367: the ballistic child drifts LEFT 2 and is freed by $B251\'s box', () => {
  // `$B36C JMP $B2DB` -> `LDA #$FE / JMP $B103` -> $B164 then $B251. The box is
  // [$04, $F3] x [$08, $C3] and the child is the only thing in the corpus that
  // can hit its LEFT edge, so both sides of it are here.
  // RED WHEN: the offScreenCheck() call is dropped (the child wraps to $FE and
  //           reappears on the right), or $FE becomes $FF.
  const at = (x0) => {
    const s = one(0x89, x0, 0xB0, 0x50, 0x60);
    s.obj.s04A0[21] = 1; s.obj.s0480[21] = 1;
    updateEnemies(s, res);
    return s.obj.type[21] === 0 ? 'freed' : s.obj.x[21];
  };
  assert.strictEqual(at(0x08), 0x06, '$06 is inside the box');
  assert.strictEqual(at(0x06), 0x04, '$04 is the last value inside it');
  assert.strictEqual(at(0x05), 'freed', '$03 < $04: $B269 JMP $AEF8');
});

// ===========================================================================
// $C05F -- THE ARMOURED DAMAGE ACCUMULATOR
// ===========================================================================

/**
 * One shot and one ARMOURED enemy on the same pixel, the arrangement
 * tests/weapons.test.js's `shotOnEnemy` uses: co-located at (100, 100) so the
 * box arithmetic cannot be what decides the outcome. Enemy slot is
 * `ENEMY_BASE + 4` = 16, i.e. j = 4, and `cls` lands on the J-INDEXED $0460.
 */
const EJ = 4, EI = ENEMY_BASE + 4;
function shotOn(fields) {
  const s = createState();
  s.substate = 0x80;
  // The SHIP's own X must be non-zero: $C3AD `LDA $0360 / BNE $C3D3` falls
  // through into the shot probe when it is 0, which src/collision.js refuses.
  s.obj.x[0] = 100; s.obj.y[0] = 100;
  s.obj.anim[3] = 6; s.obj.animFrame[3] = 0;      // shot slot 0, subtype 0
  s.obj.x[3] = 100; s.obj.y[3] = 100;
  // The enemy sits 4 px ABOVE the weapon, not on it: `$C023 LDA $A1 / SBC` has
  // the carry CLEAR, so dy is one less than the difference and a co-located
  // enemy gives dy = $FF. A MISSILE's own $BFD6 row is 0 (a shot's is 8), so
  // "on the same pixel" is a hit for one weapon and a miss for the other.
  s.obj.type[EI] = 0x8F; s.obj.x[EI] = 100; s.obj.y[EI] = 96;
  s.obj.anim[EI] = 0x78;
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'cls') s.obj.s0460[EJ] = v; else s.obj[k][EI] = v;
  }
  return s;
}

test('$C070: $048C == 0 makes an armoured enemy INVULNERABLE, and the shot still dies', () => {
  // The gate the hatch opens with `$AF38 STA $048C,X`. It is not a no-op branch:
  // it is the difference between a damageable hatch and an indestructible one,
  // and it is silent either way on the cartridge.
  // RED WHEN: the `if (o.s0480[e] === 0)` guard is dropped (damage then lands on
  //           every armoured enemy), or it returns without freeing the shot.
  const s = shotOn({ status: 0x80, s0480: 0 });
  shotSweep(s, res);
  assert.strictEqual(s.obj.s0460[EI], 0, '$C070 BEQ $C0B7 -- no damage');
  assert.strictEqual(s.obj.anim[3], 0, '$C0BB still frees the shot');
});

test('$C075: a SHOT does 1 damage and a MISSILE does 2, and class 0 always does 1', () => {
  // `LDY $0460,X / BEQ $C086` then `LDY $A8 / CPY #$06 / BCC $C086 / LDA #$02`.
  // $A8 is the WEAPON slot: 0-5 are shots, 6-8 missiles. The class byte is the
  // hatch's own `$AF35 STA $0460,X`, so a class-0 armoured enemy takes 1 from a
  // missile as well -- an asymmetry nothing else in the tree would notice.
  // RED WHEN: the class test is dropped (class 0 then takes 2 from a missile);
  //           CPY #$06 becomes #$05 or #$07; or the damage is assigned rather
  //           than ADDED to $046C.
  const hit = (cls, weapon, start) => {
    const s = shotOn({ status: 0x80, s0480: 1, s0460: start, cls });
    if (weapon !== 0) {             // move the weapon into another slot
      s.obj.anim[3] = 0; s.obj.animFrame[3] = 0;
      // subtype 3 is the MISSILE's ($C3CE); a shot slot keeps subtype 0, and the
      // two rows of $BFCE/$BFD6 are different, which is why the Y offsets differ.
      s.obj.anim[3 + weapon] = weapon >= 6 ? 0x0A : 6;
      s.obj.animFrame[3 + weapon] = weapon >= 6 ? 3 : 0;
      s.obj.x[3 + weapon] = 100;
      s.obj.y[3 + weapon] = weapon >= 6 ? 100 : 100;
    }
    shotSweep(s, res);
    return s.obj.s0460[EI];
  };
  assert.strictEqual(hit(1, 0, 0), 1, 'class 1, shot: 1');
  assert.strictEqual(hit(1, 6, 0), 2, 'class 1, MISSILE: $C084 LDA #$02');
  assert.strictEqual(hit(0, 6, 0), 1, 'class 0, missile: still 1');
  assert.strictEqual(hit(1, 0, 3), 4, '$C086 ADDS to what is already there');
  // SLOT 5 IS THE BOUNDARY and it is the only value that tells `CPY #$06` from
  // `CPY #$05`: it is the LAST SHOT slot, so it must still do 1.
  assert.strictEqual(hit(1, 5, 0), 1, 'class 1, shot slot 5: $C080 BCC $C086');
});

test('$C05F: the armour "clink" is silent for metasprite 0 and for type $94', () => {
  // Two exemptions on two instructions, and the second one names a single type.
  // RED WHEN: either exemption is dropped, or the sound is moved below $C070
  //           (an INVULNERABLE armoured enemy still clinks on the cartridge).
  const sfx = (mut) => {
    const s = shotOn({ status: 0x80, s0480: 1, cls: 1 });
    mut(s);
    shotSweep(s, res);
    return s.sfx.includes(0x05);
  };
  assert.strictEqual(sfx(() => {}), true, '$C06B LDA #$05');
  assert.strictEqual(sfx((s) => { s.obj.anim[EI] = 0; }), false, '$C061 BEQ $C070');
  assert.strictEqual(sfx((s) => { s.obj.type[EI] = 0x94; }), false, '$C069 BEQ $C070');
  assert.strictEqual(sfx((s) => { s.obj.s0480[EI] = 0; }), true,
    'and it clinks even when $C070 then refuses the damage');
});
