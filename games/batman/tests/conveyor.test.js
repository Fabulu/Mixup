// The per-level subsystems of sub_00_2CBE -- src/conveyor.js.
// ROM: loc_00_2EF4 (6), loc_00_2F5F (7), loc_00_2CED (11), loc_00_2FB7 (12),
// loc_00_301E (13) and their shared fall-through loc_00_3050.
//
// Synthetic maps only. The frame-exact proof is the oracle corpus
// (tools/oracle/subsysdiff.mjs): l6-conveyor-track, l7-object-respawner,
// l11-entrance-freeze, l12-collapsing-floor, l13-oneshot-spawn and
// l4-boss-default-arm.
// Run: node --test tests/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { grid, makeState, placePlayer } from './helpers.js';
import { updateSubsystem, createSubsys, actorTypeA } from '../src/conveyor.js';
import { mapCollision, mapTile } from '../src/state.js';

/** A state on `level` with the subsystem block wired the way level.js must. */
function subState(level, opts = {}) {
  const state = makeState(grid(opts.width ?? 128), { level, ...opts });
  state.subsys = createSubsys();
  state.flow.parallaxTrack = level === 6 ? 0x0700 : 0x0000;   // $0F08, level 6 only
  state.flow.conveyorDir = 0;
  return state;
}

// ---------------------------------------------------------------------------
// Level 6 -- loc_00_2EF4, the conveyor track.
// ---------------------------------------------------------------------------

test('the level-6 track walks 8 subpixels a frame TOWARD the player column', () => {
  // ROM: $2F05-$2F35. MEASURED on the cartridge: $FFCA starts at $07, the
  // player idles at column $01, and the track counts $06F8, $06F0 ... down.
  const state = subState(6);
  placePlayer(state, 0x01, 6);
  updateSubsystem(state);
  assert.equal(state.flow.parallaxTrack, 0x06F8);
  assert.equal(state.flow.conveyorDir, 2);      // $2F28: toward lower columns
  updateSubsystem(state);
  assert.equal(state.flow.parallaxTrack, 0x06F0);
});

test('the track walks UP when the player is past it, and $FFC9 says so', () => {
  const state = subState(6);
  state.flow.parallaxTrack = 0x0300;
  placePlayer(state, 0x40, 6);
  updateSubsystem(state);
  assert.equal(state.flow.parallaxTrack, 0x0308);
  assert.equal(state.flow.conveyorDir, 1);      // $2F14
});

test('arriving at the player STOPS the track without clearing $FFC9', () => {
  // ROM: $2F0B -> loc_00_2F48. Only $FFC8 is written; the direction byte keeps
  // its last value, which is why a track at rest still reports direction 2.
  const state = subState(6);
  state.flow.parallaxTrack = 0x01F8;
  state.flow.conveyorDir = 2;
  placePlayer(state, 0x01, 6);
  updateSubsystem(state);
  assert.equal(state.flow.parallaxTrack, 0x01F8);
  assert.equal(state.flow.conveyorDir, 2);
  assert.equal(state.subsys.park, 0);
});

test('the far limit parks with $FFC8 = 2 and the near limit with 1', () => {
  // ROM: $2F1C / $2F30 -> loc_00_2F40. B is 2 on the way up and 1 on the way
  // down, so the parked value names the OPPOSITE direction to resume in.
  const up = subState(6);
  up.flow.parallaxTrack = 0x0700;
  placePlayer(up, 0x40, 6);
  updateSubsystem(up);
  assert.equal(up.subsys.park, 2);
  assert.equal(up.flow.conveyorDir, 0);         // $2F44
  assert.equal(up.flow.parallaxTrack, 0x0700);  // and it did not move

  const down = subState(6);
  down.flow.parallaxTrack = 0x0100;
  placePlayer(down, 0x00, 6);
  updateSubsystem(down);
  assert.equal(down.subsys.park, 1);
  assert.equal(down.flow.conveyorDir, 0);
});

test('a parked track ping-pongs and ignores the player entirely', () => {
  // ROM: $2EFD / $2F03 dispatch straight into the movement arms, so once
  // $FFC8 is non-zero the player column is never read again.
  const state = subState(6);
  state.subsys.park = 2;                        // parked high -> descend
  state.flow.parallaxTrack = 0x0700;
  placePlayer(state, 0x40, 6);                  // far to the right; irrelevant
  updateSubsystem(state);
  assert.equal(state.flow.parallaxTrack, 0x06F8);
  assert.equal(state.flow.conveyorDir, 2);
  assert.equal(state.subsys.park, 2);
});

test('a cleared level freezes the walk but still emits the parallax band', () => {
  // ROM: $2EF9 -- `$C740 != $FF` jumps straight to loc_00_2F4B. The port
  // carries $C740 inverted as flow.levelCleared, so non-zero is the skip.
  const state = subState(6);
  placePlayer(state, 0x40, 6);
  state.flow.levelCleared = 1;
  updateSubsystem(state);
  assert.equal(state.flow.parallaxTrack, 0x0700);
  assert.equal(state.flow.parallaxScx, 0x90);   // still computed
});

test('$FFCC is the negated 4-bit-shifted track/camera delta', () => {
  // ROM: $2F4B sub_00_1172 then `SUB $08 / CPL / INC A`. MEASURED: track
  // $06F8 with the camera at $0100 gives $A1.
  const state = subState(6);
  placePlayer(state, 0x01, 6);
  state.camera.x = 0x0100;
  updateSubsystem(state);                       // track -> $06F8
  assert.equal(state.flow.parallaxScx, 0xA1);
});

// ---------------------------------------------------------------------------
// Level 7 -- loc_00_2F5F, the map-object respawner.
// ---------------------------------------------------------------------------

const L7_TEMPLATES = [
  [0x0A, 0x17, 0x80, 0x12, 0x80, 0, 0, 0x08, 0x09, 0, 0, 0, 0, 0, 0x16, 0x12],
  [0x0A, 0x1A, 0x80, 0x12, 0x80, 0, 0, 0x08, 0x09, 0, 0, 0, 0, 0, 0x19, 0x12],
  [0x0A, 0x1D, 0x80, 0x12, 0x80, 0, 0, 0x08, 0x09, 0, 0, 0, 0, 0, 0x1C, 0x12],
];

function l7State() {
  return subState(7, { tables: { subsysObjects: { level7: L7_TEMPLATES } } });
}

test('level 7 refills slots 4/5/6 the first frame they are all free', () => {
  const state = l7State();
  updateSubsystem(state);
  assert.equal(state.subsys.respawns, 1);
  assert.deepEqual([...state.actors[4]], L7_TEMPLATES[0]);
  assert.deepEqual([...state.actors[6]], L7_TEMPLATES[2]);
});

test('ONE occupied slot blocks the whole trio', () => {
  // ROM: $2F68/$2F6E/$2F74 each `RET NZ` -- the three refill as a set.
  const state = l7State();
  state.actors[5][0] = 0x83;
  updateSubsystem(state);
  assert.equal(state.subsys.respawns, 0);
  assert.equal(state.actors[4][0], 0);
});

test('level 7 stops refilling after ten', () => {
  const state = l7State();
  state.subsys.respawns = 0x0A;                 // $2F62: RET NC
  updateSubsystem(state);
  assert.equal(state.actors[4][0], 0);
});

test('a missing level-7 template THROWS rather than silently skipping', () => {
  const state = subState(7);
  assert.throws(() => updateSubsystem(state), /subsysObjects\.level7/);
});

// ---------------------------------------------------------------------------
// Level $0B -- loc_00_2CED, the entrance freeze.
// ---------------------------------------------------------------------------

test('standing on (column $0B, row $17) arms the 240-frame freeze', () => {
  // ROM: $2CFB-$2D22. The row test reads the HIGH byte only -- the cartridge
  // arms at Y $1741.
  const state = subState(0x0B);
  placePlayer(state, 0x0B, 0x07, 0x80, 0x41);   // map row 7 -> Y hi $17
  const p = state.player;
  p.air = 2; p.vy = 0xBE; p.vx = 5; p.facing = 0;
  p.clingLock = 3; p.attackTimer = 4; p.action = 1; p.squatTimer = 0x10;
  updateSubsystem(state);
  assert.equal(p.springArmed, 1);               // $2D0B
  assert.equal(p.facing, 1);                    // $2D0E -- the SAME A as above
  assert.deepEqual([p.air, p.vy, p.vx], [0, 0, 0]);
  assert.deepEqual([p.clingLock, p.attackTimer, p.action, p.squatTimer],
                   [0, 0, 0, 0]);
  assert.equal(state.subsys.seqTimer, 0xF0);    // $2D22
});

test('the wrong column or the wrong row does nothing at all', () => {
  for (const [col, row] of [[0x0A, 0x07], [0x0B, 0x08]]) {
    const state = subState(0x0B);
    placePlayer(state, col, row);
    updateSubsystem(state);
    assert.equal(state.player.springArmed, 0);
    assert.equal(state.subsys.seqTimer, 0);
  }
});

test('the freeze counts down and spends itself with $FF', () => {
  // ROM: loc_00_2D28. MEASURED: $F0 at f197 down to 1 at f436, $FF at f437.
  const state = subState(0x0B);
  const p = state.player;
  p.springArmed = 1;
  state.subsys.seqTimer = 0x02;
  updateSubsystem(state);
  assert.equal(state.subsys.seqTimer, 0x01);
  assert.equal(p.springArmed, 1);
  updateSubsystem(state);
  assert.equal(state.subsys.seqTimer, 0xFF);    // $2D37
  assert.equal(p.springArmed, 0);               // $2D32
});

test('$C717 = $FF is permanent -- the entrance never re-arms', () => {
  const state = subState(0x0B);
  state.subsys.seqTimer = 0xFF;
  placePlayer(state, 0x0B, 0x07);
  updateSubsystem(state);
  assert.equal(state.player.springArmed, 0);
});

// ---------------------------------------------------------------------------
// Level $0C -- loc_00_2FB7, the collapsing floor.
// ---------------------------------------------------------------------------

const L12_CELLS = [0x0B, 0x15, 0x04, 0x15, 0x09, 0x15];

function l12State() {
  const full = new Array(0x48 * 2).fill(0x10);
  for (let i = 0; i < L12_CELLS.length; i++) full[i] = L12_CELLS[i];
  return subState(0x0C, { tables: { collapseCells: full } });
}

test('the collapsing floor arms at column $06 and erases one cell a frame', () => {
  const state = l12State();
  placePlayer(state, 0x06, 0x05);
  state.camera.x = 0x0100;                      // centre $06 -- inside the gate
  updateSubsystem(state);
  assert.equal(state.subsys.cursor, 1);         // $2FD3: the arming frame
  assert.notEqual(mapTile(state, 0x0B, 0x15), 0x00);     // nothing erased yet

  updateSubsystem(state);
  assert.equal(state.subsys.cursor, 2);
  assert.equal(mapCollision(state, 0x0B, 0x15), 0x00);   // $3002: both bytes
  assert.equal(mapTile(state, 0x0B, 0x15), 0x00);
});

test('the floor pauses when the player leaves the screen centre', () => {
  // ROM: $2FB7-$2FC5 -- |camX_hi + 5 - playerCol| >= 6 returns before anything.
  const state = l12State();
  state.subsys.cursor = 1;
  placePlayer(state, 0x30, 0x05);
  state.camera.x = 0x0100;                      // centre $06, player $30
  updateSubsystem(state);
  assert.equal(state.subsys.cursor, 1);
});

test('reaching column $06 is required before the floor can arm', () => {
  const state = l12State();
  placePlayer(state, 0x03, 0x05);
  state.camera.x = 0x0000;                      // centre $05 -- gate open
  updateSubsystem(state);
  assert.equal(state.subsys.cursor, 0);         // $2FD0: RET C
});

test('the cursor latches $FF after the 72nd cell', () => {
  const state = l12State();
  state.subsys.cursor = 0x48;
  placePlayer(state, 0x06, 0x05);
  state.camera.x = 0x0100;
  updateSubsystem(state);
  assert.equal(state.subsys.cursor, 0xFF);      // $3018
  updateSubsystem(state);
  assert.equal(state.subsys.cursor, 0xFF);      // $2FD9: RET Z, spent
});

test('each collapsing cell spawns a $97/$00 puff BEFORE it is erased', () => {
  // $2FED-$2FFA stages $C744-$C747 from the cell's own col/row with BOTH low
  // bytes forced to $80 -- the middle of the cell that is about to vanish --
  // and $2FF5 is `LD D,$97 / LD E,$00 / CALL sub_00_0CC2`. The spawn happens
  // BEFORE $2FFF's erase, which is the ordering the addresses give.
  //
  // The pool is TEN slots and every spawner competes for them. That is not
  // cosmetic bookkeeping: with this and the level-12 shooter's muzzle pair
  // missing, the port had two spare slots and level 12's floor burst ran two
  // cells longer than the cartridge's. MEASURED (cuediff l12-shooter-fire):
  // 30 -> 28 -> exact as each landed.
  const state = l12State();
  state.subsys.cursor = 1;
  placePlayer(state, 0x06, 0x05);
  state.camera.x = 0x0100;
  updateSubsystem(state);

  const live = state.doors.effects.filter((r) => r[0] !== 0);
  assert.equal(live.length, 1);
  assert.equal(live[0][0], 0x97, 'D = $97');
  assert.equal(live[0][5], 0x00, 'E = $00');
  assert.equal(live[0][1], L12_CELLS[0], 'col from the table');
  assert.equal(live[0][2], 0x80, '$2FED');
  assert.equal(live[0][3], L12_CELLS[1], 'row from the table');
  assert.equal(live[0][4], 0x80, '$2FF2');
  assert.equal(mapCollision(state, L12_CELLS[0], L12_CELLS[1]), 0,
    'and the cell went afterwards');
});

test('a missing collapse table THROWS', () => {
  const state = subState(0x0C);
  state.subsys.cursor = 1;
  placePlayer(state, 0x06, 0x05);
  state.camera.x = 0x0100;
  assert.throws(() => updateSubsystem(state), /collapseCells/);
});

// ---------------------------------------------------------------------------
// Level $0D -- loc_00_301E, the one-shot spawn.
// ---------------------------------------------------------------------------

const L13_TEMPLATE =
  [0x0A, 0x17, 0x80, 0x18, 0x80, 0, 0, 0x08, 0x0F, 0, 0, 0, 0, 0, 0x16, 0x18];

test('crossing column $50 stamps three type-$0A objects into slots 0/1/2', () => {
  const state = subState(0x0D,
    { tables: { subsysObjects: { level13: L13_TEMPLATE } } });
  state.actors[0][0] = 0x08;                    // the level's own type-8 platform
  placePlayer(state, 0x50, 0x08);
  updateSubsystem(state);
  assert.equal(state.subsys.cursor, 1);
  assert.equal(state.actors[0][0], 0x0A);       // overwritten, not merged
  assert.deepEqual([state.actors[0][1], state.actors[1][1], state.actors[2][1]],
                   [0x58, 0x5B, 0x5C]);         // $3042/$3047/$304C
  // $302D-$303E copies ONE template three times, so the +$0E origin byte is
  // the template's on all three even though the columns differ.
  assert.equal(state.actors[2][0x0E], 0x16);
});

test('below column $50 nothing spawns, and it only ever fires once', () => {
  const state = subState(0x0D,
    { tables: { subsysObjects: { level13: L13_TEMPLATE } } });
  placePlayer(state, 0x4F, 0x08);
  updateSubsystem(state);
  assert.equal(state.subsys.cursor, 0);
  assert.equal(state.actors[0][0], 0);

  placePlayer(state, 0x50, 0x08);
  updateSubsystem(state);
  state.actors[0][0] = 0;                       // pretend it died
  updateSubsystem(state);
  assert.equal(state.actors[0][0], 0);          // $3022: RET NZ, spent
});

// ---------------------------------------------------------------------------
// loc_00_3050 -- the rescue drop, and the fact that it is cheat-gated.
// ---------------------------------------------------------------------------

test('the rescue drop is inert without the title cheat', () => {
  // $C75C has exactly one writer in the ROM ($02CF, B+SELECT+LEFT on the
  // title). MEASURED 0 on every frame of every level traced for this port.
  const state = subState(4, { bossId: 1, tables: { rescueEntryY: [0x1E, 0x1E, 0x16, 0x1F] } });
  state.player.hp = 1;
  state.enemies[0][0x16] = 0x20;
  updateSubsystem(state);
  assert.equal(state.subsys.rescue.state, 0);
});

test('with the cheat set it arms only below 3 HP against a healthy boss', () => {
  const mk = (hp, bossHp) => {
    const state = subState(4,
      { bossId: 1, tables: { rescueEntryY: [0x1E, 0x1E, 0x16, 0x1F] } });
    state.flow.rescueCheat = 1;
    state.player.hp = hp;
    state.enemies[0][0x16] = bossHp;
    updateSubsystem(state);
    return state.subsys.rescue;
  };
  assert.equal(mk(3, 0x20).state, 0);           // $3061: RET NC
  assert.equal(mk(2, 0x0F).state, 0);           // $3067: RET C
  const armed = mk(2, 0x10);
  assert.equal(armed.state, 1);
  assert.equal(armed.x, 0x0B80);                // $306A / $307E
  assert.equal(armed.y, 0x1E80);                // $333B[0] / $3083
  assert.equal(armed.vy, 0x38);                 // $3086
});

test('the carrier flies left on a parabola: $C762 is a countdown, not a velocity', () => {
  // ROM: $30A4-$30B9. Subtract 1, NEGATE, sign-extend, add. So the first step
  // is -$37 (up) and the byte eventually wraps past zero into a descent.
  const state = subState(4,
    { bossId: 1, tables: { rescueEntryY: [0x1E, 0x1E, 0x16, 0x1F] } });
  state.flow.rescueCheat = 1;
  const r = state.subsys.rescue;
  r.state = 1; r.x = 0x0B80; r.y = 0x1E80; r.vy = 0x38;
  updateSubsystem(state);
  assert.equal(r.x, 0x0B68);                    // -$18
  assert.equal(r.vy, 0x37);
  assert.equal(r.y, 0x1E80 - 0x37);

  r.vy = 0x00;                                  // one past the top of the arc
  const y0 = r.y;
  updateSubsystem(state);
  assert.equal(r.vy, 0xFF);
  assert.equal(r.y, y0 + 1);                    // -(-1) = +1: falling now
});

test('the drop columns are EDGE-triggered against $C75D', () => {
  // ROM: $30C2 reads the previous column into B before overwriting it, so
  // $09/$07/$04/$02 each fire once however many frames are spent inside.
  const state = subState(4,
    { bossId: 1, tables: { rescueEntryY: [0x1E, 0x1E, 0x16, 0x1F] } });
  state.flow.rescueCheat = 1;
  const r = state.subsys.rescue;
  r.state = 1; r.x = 0x0A00; r.y = 0x1800; r.vy = 0x10; r.prevCol = 0x0A;
  updateSubsystem(state);                       // -> $09E8, column $09
  assert.equal(state.drops.filter((d) => d[0] !== 0).length, 1);
  updateSubsystem(state);                       // -> $09D0, still column $09
  assert.equal(state.drops.filter((d) => d[0] !== 0).length, 1);
});

test('reaching column 0 spends the carrier and skips the draw', () => {
  const state = subState(4,
    { bossId: 1, tables: { rescueEntryY: [0x1E, 0x1E, 0x16, 0x1F] } });
  state.flow.rescueCheat = 1;
  const r = state.subsys.rescue;
  r.state = 1; r.x = 0x0110; r.y = 0x1800; r.vy = 0x10; r.prevCol = 0x01;
  state.enemyDraws.length = 0;
  updateSubsystem(state);                       // $0110 - $18 -> $00F8
  assert.equal(r.state, 0xFF);                  // $30DE
  assert.equal(state.enemyDraws.length, 0);     // $30DC does NOT reach $3113
});

test('a level with no boss never reaches the rescue drop at all', () => {
  // ROM: $2CE5 -- the default arm is gated on $C73E, which is non-zero on
  // exactly the four boss levels.
  const state = subState(5, { bossId: 0 });
  state.flow.rescueCheat = 1;
  state.player.hp = 1;
  state.enemies[0][0x16] = 0x20;
  updateSubsystem(state);
  assert.equal(state.subsys.rescue.state, 0);
});

// ---------------------------------------------------------------------------
// Map-object type $0A -- jt_01_4765. Spawned only by the two branches above.
// ---------------------------------------------------------------------------

function typeAState(level) {
  const state = subState(level, { width: 128 });
  const r = state.actors[0];
  r.set([0x8A, 0x17, 0x80, 0x12, 0x80, 0, 0, 0x08, 0x09, 0, 0, 0, 0, 0, 0x16, 0x12]);
  return { state, r };
}

test('type $0A arms immediately off level $0D, and skips the screen tail on', () => {
  // ROM: $4791 arms and falls to loc_01_4443 (the tail); the level-$0D arm at
  // $4784 exits through loc_01_4521 -> $4A53, which does NOT run the tail.
  // That difference is the one thing the port cannot express while
  // src/actors.js routes type $0A to `default`.
  const a = typeAState(7);
  assert.equal(actorTypeA(a.state, a.r), false);    // tail runs
  assert.equal(a.r[0x0B], 1);

  const b = typeAState(0x0D);
  b.r[1] = 0x58;
  placePlayer(b.state, 0x50, 8);                    // 8 columns away
  assert.equal(actorTypeA(b.state, b.r), true);     // tail skipped
  assert.equal(b.r[0x0B], 0);
  placePlayer(b.state, 0x57, 8);                    // 1 column away
  assert.equal(actorTypeA(b.state, b.r), true);
  assert.equal(b.r[0x0B], 1);
});

test('type $0A shakes for 15 frames, then falls to a $50 cap', () => {
  const { state, r } = typeAState(7);
  r[0x0B] = 0x0F;
  actorTypeA(state, r);
  assert.equal(r[0x0B], 0xFF);                      // $47C2
  assert.equal(r[2], 0x80);                         // $47C9: Xlo snapped
  assert.equal(r[6], 0x03);                         // $47DA: accel 3 off L13

  r[6] = 0x4F;
  actorTypeA(state, r);
  assert.equal(r[6], 0x50);                         // $47E4: clamped, not 52
});

test('type $0A lands on solid ground and turns the row above into terrain', () => {
  const { state, r } = typeAState(7);
  // A floor at map row 4 ($14) under column $17.
  state.level.cells[(0x17 * 16 + 4) * 2 + 1] = 0x01;
  r[0x0B] = 0xFF;
  r[3] = 0x13; r[4] = 0x90;                         // Y $1390 -> +$80 = $1410
  r[6] = 0x00;
  const done = actorTypeA(state, r);
  assert.equal(done, true);                         // $4839: no tail
  assert.equal(r[0], 0);                            // $4832: slot freed
  assert.equal(mapCollision(state, 0x17, 0x13), 0x01);
  assert.equal(mapTile(state, 0x17, 0x13), 0x50);   // $481B, $30 on level $0D
  assert.deepEqual(state.sound.queue.map((s) => s.id), [0x21]);
});

test('the carrier is actually DRAWN: $3113 reaches shadow OAM', () => {
  // ROM: $3113 is `sub_00_1172` then `sub_00_0BAF` with metasprite $68, attr 0
  // -- an IMMEDIATE append, at $05C6, ahead of the batarangs ($3D15) and the
  // enemy driver ($05CF).
  //
  // The port queues it onto state.enemyDraws like everything else, and
  // updateEnemies ($05CF) opens by clearing that queue -- so for as long as the
  // flush sat after the enemy driver, this entry was wiped one call later and
  // the carrier was never drawn at all. src/game/frame.js flushes immediately
  // after updateWater now, which is where $3113 actually emits.
  //
  // This test exists because NOTHING ELSE CAN SEE IT: the whole path is behind
  // the $C75C rescue cheat, which measures 0 on every frame of every recorded
  // scenario, so no oracle comparison reaches it in either direction. Remove
  // the flush in game/frame.js and this goes red; that is the only thing that
  // does. Phase 10 moved $0567-$0650 out of src/main.js; this path followed it.
  const state = subState(4,
    { bossId: 1, tables: { rescueEntryY: [0x1E, 0x1E, 0x16, 0x1F] } });
  state.flow.rescueCheat = 1;
  const r = state.subsys.rescue;
  r.state = 1; r.x = 0x0B80; r.y = 0x1E80; r.vy = 0x38;
  state.enemyDraws = [];

  updateSubsystem(state);

  // $3113 queues; the frame loop is what turns it into a sprite.
  assert.equal(state.enemyDraws.length, 1, 'the carrier queued a draw');
  const d = state.enemyDraws[0];
  assert.equal(d.id, 0x68, 'metasprite $68');
  assert.equal(d.attr, 0, '$3113 passes attr 0');
  assert.equal(d.alt, true, 'sub_00_0BAF = table2, not table1');

  // And the ORDER it has to keep. The queue is destructive and updateEnemies
  // clears it, so the flush must sit BETWEEN updateWater and updateEnemies --
  // not merely exist. Asserted against the frame loop's source, the same way
  // roundselect.test.js pins title.js's cue: a unit test cannot run tick()
  // without a manifest, but it can prove the call order that owns this queue.
  const main = readFileSync(new URL('../src/game/frame.js', import.meta.url), 'utf8');
  const water = main.indexOf('updateWater(state);');
  const flush = main.indexOf('drawEnemies(state, manifest);', water);
  const enemies = main.indexOf('updateEnemies(state);', water);
  assert.ok(water > 0 && flush > 0 && enemies > 0, 'all three calls present');
  assert.ok(flush < enemies,
    'src/game/frame.js must flush the enemy queue between updateWater ($05C6) and '
    + 'updateEnemies ($05CF), or the $3113 carrier is cleared before it draws');
});
