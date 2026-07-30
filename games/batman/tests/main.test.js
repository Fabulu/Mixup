// The main loop body, $0567-$0650.
//
// Four things live here that nothing else can see, because they are properties
// of the ORDER and the GATES of the frame rather than of any one subsystem:
//
//   $056E/$05E0   $FFA7 picks WHICH of two identical arms queues the HUD, so
//                 the energy bar alternates between OAM index 0 and last
//   $0567/$05D9   both arms open `LD A,[$C740] / CP $FF / JR NZ`
//   $057D-$05AD   the MOON, before the camera and OUTSIDE the pause branch
//   $05B0-$05B4   pause is a JUMP, not a return: a paused frame is rebuilt
//
// All four were measured on the cartridge with tools/oracle/oamorder.py and
// tools/oracle/pauseoam.py rather than read off the listing, and all four were
// invisible to every state comparison in the suite -- OAM ORDER is not a game
// state field, and no scenario had ever pressed START.
//
// Nothing here reads assets/: the metasprite table is synthetic and shaped so
// the OAM counts read like the cartridge's (the energy bar is five sprites,
// the moon two).

import test from 'node:test';
import assert from 'node:assert/strict';

import { tick, afterDeath } from '../src/main.js';
import { effects, COUNTDOWN_START } from '../src/effects.js';
import { makeState, corridor, placePlayer } from './helpers.js';

const START = 0x08;

/** $0F8D: the bar id for full HP (10) is $82 + ((10 - 1) >> 1) = $86. */
const HUD_ID = 0x86;
/** $05A9: LD E,$34 -- the moon. Two 8x16 sprites, tiles $E0/$E2, attr $10. */
const MOON_ID = 0x34;

function fakeManifest() {
  const table1 = [];
  for (let i = 0; i <= 0x100; i++) table1[i] = { sprites: [[0, 0, i & 0xFF, 0]] };
  // The energy bar really is five sprites; the count is what pauseoam.py
  // measured, so keeping it right makes "7 entries on a paused frame" mean
  // something.
  table1[HUD_ID] = { sprites: [0, 1, 2, 3, 4].map((i) => [0, i * 8, 0xB0 + i, 0]) };
  table1[MOON_ID] = { sprites: [[0, 0, 0xE0, 0x10], [0, 8, 0xE2, 0x10]] };
  return {
    metasprites: { table1, table2: table1 },
    player: { hitboxes: Array.from({ length: 0x20 }, () => [15, 15]), anims: [] },
  };
}

const MANIFEST = fakeManifest();

/**
 * The GAME OVER burst's three ROM tables (0:$2AD7, 0:$2ACF, 0:$2AFF). Shaped,
 * zero-valued -- effects.js refuses to guess a missing one, and tick() reaches
 * sub_00_29E7 on any frame the player is dead. What the SHIPPED bytes are is
 * settled by tools/oracle/gameoverdiff.mjs (13504/13504 shadow-OAM bytes).
 */
const BURST_TABLES = {
  deathBurstInit: new Array(8 * 5).fill(0),
  deathBurstSprites: new Array(8).fill(0),
  deathBurstPath: new Array(0x114).fill(0),
};

function level(n, opts = {}) {
  const s = makeState(corridor(32, 14), {
    level: n, ...opts, tables: { ...BURST_TABLES, ...(opts.tables || {}) },
  });
  placePlayer(s, 3, 13);
  s.camera.x = 0;
  s.camera.y = 0x1000;
  s.sound = { queue: [] };
  return s;
}

const run = (s, n = 1, pressed = 0) => {
  for (let i = 0; i < n; i++) {
    s.input.pressed = pressed;
    s.input.held = pressed;
    tick(s, MANIFEST, null);
  }
};

/** Which OAM slot each group of the frame's sprites starts at. */
const tiles = (s) => s.video.sprites.map((q) => q.tile);
const isHud = (t) => t >= 0xB0 && t <= 0xB4;
const isMoon = (t) => t === 0xE0 || t === 0xE2;

// ---------------------------------------------------------------------------
// $FFA7 -- the draw-order parity
// ---------------------------------------------------------------------------

test('$FFA7 == 0 queues the HUD FIRST, at OAM index 0', () => {
  // $056E: `LDH A,[$FFA7] / AND A / JP NZ, loc_00_05D9`. Zero runs $0573 --
  // sub_00_0F7B before the camera, the player, the enemies and the doors.
  //
  // MEASURED (tools/oracle/oamorder.py vs oamport.mjs, levels 1 and 9, both
  // parities, slot for slot): L1 par0 is HUD 0-4 then player 5-10; L9 par0 is
  // HUD 0-4, moon 5-6, player 7-11.
  const s = level(3);
  s.parity = 0;
  run(s, 1);
  const t = tiles(s);
  assert.ok(isHud(t[0]), `HUD leads, got ${t}`);
  assert.equal(t.filter(isHud).length, 5);
  assert.equal(t.findIndex(isHud), 0);
  assert.ok(t.length > 5, 'and the player follows it');
});

test('$FFA7 == 1 queues the HUD LAST, after the player', () => {
  // $05E5, the other arm. OAM index IS DMG sprite priority and the ten-per-
  // line cut, so the alternation is visible wherever the bar crosses another
  // sprite -- which is exactly the GAME OVER lettering case SAVEPOINT's item 3
  // is about.
  const s = level(3);
  s.parity = 1;
  run(s, 1);
  const t = tiles(s);
  assert.ok(!isHud(t[0]), `the player leads, got ${t}`);
  assert.equal(t.filter(isHud).length, 5);
  assert.equal(t.findIndex(isHud) + 5, t.length, 'the HUD is the tail of the queue');
});

test('the arm alternates every frame, because tick() flips $FFA7', () => {
  const s = level(3);
  s.parity = 0;
  const first = [];
  for (let i = 0; i < 4; i++) { run(s, 1); first.push(isHud(tiles(s)[0])); }
  assert.deepEqual(first, [true, false, true, false]);
});

test('state.video.frameParity is an ALIAS of $FFA7, not a second copy', () => {
  // Two homes for one byte is exactly the failure mode this project keeps
  // hitting. doors.js's effect pool reads the DRAW-side name and the enemy
  // loop reads the other one; if they could drift, the pool would iterate the
  // wrong way on half the frames and only ever show it when the pool is full.
  const s = level(3);
  s.parity = 0;
  assert.equal(s.video.frameParity, 0);
  s.parity = 1;
  assert.equal(s.video.frameParity, 1, 'writing $FFA7 is visible on the alias');
  s.video.frameParity = 0;
  assert.equal(s.parity, 0, 'and the other way round');
  run(s, 1);
  assert.equal(s.video.frameParity, s.parity & 1, 'a tick cannot separate them');
});

// ---------------------------------------------------------------------------
// $C740 -- the HUD gate
// ---------------------------------------------------------------------------

test('the energy bar is drawn only while $C740 == $FF', () => {
  // Both arms open with the same three instructions. MEASURED on level 4
  // (tools/oracle/hudgateprobe.py): from the frame after the boss dies the
  // cartridge draws NO bar for the whole countdown and fanfare -- ~350 frames
  // of ordinary play -- and the port kept drawing it.
  for (const parity of [0, 1]) {
    const s = level(3);
    s.parity = parity;
    run(s, 1);
    assert.equal(tiles(s).filter(isHud).length, 5, `parity ${parity}: bar drawn`);

    effects(s).countdown = COUNTDOWN_START;      // 1:$4EF1 -- a boss just died
    run(s, 1);
    assert.equal(tiles(s).filter(isHud).length, 0, `parity ${parity}: bar hidden`);
  }
});

test('level 14 hides the bar through $C740 == 1, a DIFFERENT latch', () => {
  // $0DE3 writes $C740 = 1 at level-14 init and 1:$7810 puts it back to $FF at
  // the end of the entrance. The port's effects.countdown doubles as the death
  // latch, so level 14 needs its own condition rather than `countdown = 1` --
  // that is what effects.entranceHold is, and c740Idle() is the single reader.
  // MEASURED (hudgate.mjs): 0 HUD sprites until f730.
  const s = level(0x0E);
  effects(s).entranceHold = 1;
  run(s, 2);
  assert.equal(tiles(s).filter(isHud).length, 0);
  effects(s).entranceHold = 0;                   // 1:$780B
  run(s, 1);
  assert.equal(tiles(s).filter(isHud).length, 5);
});

// ---------------------------------------------------------------------------
// $057D-$05AD -- the MOON
// ---------------------------------------------------------------------------

test('levels 9, $0A and $0B draw metasprite $34 every frame, and no other level does', () => {
  // A permanently visible missing sprite on three levels, found only because
  // someone measured the OAM head rather than the game state. MEASURED
  // (oamorder.py --level 9): shadow OAM leads with y=16 x=120 tile=$E0
  // attr=$10 and y=16 x=128 tile=$E2 attr=$10.
  for (const n of [0x09, 0x0A, 0x0B]) {
    const s = level(n);
    run(s, 1);
    assert.equal(tiles(s).filter(isMoon).length, 2, `level ${n}`);
  }
  for (const n of [0x01, 0x08, 0x0C, 0x0E]) {
    const s = level(n);
    run(s, 1);
    assert.equal(tiles(s).filter(isMoon).length, 0, `level ${n} has no moon`);
  }
});

test('the moon is drawn BEFORE the camera, so parity decides where it lands', () => {
  // $057D sits between the two HUD arms and the $05B7 camera, so on an
  // $FFA7 == 1 frame it is at OAM index 0 and on an $FFA7 == 0 frame it is
  // immediately after the five bar sprites. MEASURED, L9: par1 moon 0-1 /
  // player 2-7 / HUD 8-11; par0 HUD 0-4 / moon 5-6 / player 7-11.
  const odd = level(9); odd.parity = 1; run(odd, 1);
  assert.equal(tiles(odd).findIndex(isMoon), 0);

  const even = level(9); even.parity = 0; run(even, 1);
  assert.equal(tiles(even).findIndex(isMoon), 5, 'straight after the bar');
});

test('the moon survives the $C740 gate -- it is not part of the HUD', () => {
  const s = level(9);
  effects(s).countdown = COUNTDOWN_START;
  run(s, 1);
  assert.equal(tiles(s).filter(isHud).length, 0);
  assert.equal(tiles(s).filter(isMoon).length, 2);
});

// ---------------------------------------------------------------------------
// $05F2-$0649 -- PAUSE
// ---------------------------------------------------------------------------

test('START newly-pressed toggles $C716, and HELD does not', () => {
  // $05FE reads $FFE2, the NEWLY-pressed byte. Nothing in the port wrote
  // $C716 at all before this -- twenty sites read it and zero set it -- so the
  // feature was simply absent.
  const s = level(3);
  run(s, 1, START);
  assert.equal(s.flow.paused, true);
  run(s, 3, 0);                                 // START still held, not pressed
  assert.equal(s.flow.paused, true);
  run(s, 1, START);
  assert.equal(s.flow.paused, false);
});

test('a paused frame FREEZES the player but still rebuilds the screen', () => {
  // $05B4 is a JUMP, not a return: it lands past the camera and the player but
  // in FRONT of the second HUD arm, the splash pass, the pause toggle and
  // $064A's shadow-OAM clear.
  //
  // MEASURED (tools/oracle/pauseoam.py): with RIGHT still held the cartridge
  // freezes X at 584 for 22 frames and each of those frames holds exactly
  // SEVEN shadow-OAM entries -- the five energy-bar sprites and the two-sprite
  // moon -- where the frame before held 22. A bare `return` here froze the
  // last frame instead, and would have blanked the screen outright once the
  // OAM clear moved to the head of the tick.
  const s = level(9);
  s.player.vx = 0x10;
  run(s, 1, START);
  const x = s.player.x;
  for (let i = 0; i < 22; i++) {
    run(s, 1, 0);
    assert.equal(s.player.x, x, `paused frame ${i}: X frozen`);
    assert.equal(s.video.sprites.length, 7, `paused frame ${i}: HUD + moon only`);
  }
  run(s, 1, START);
  run(s, 1, 0);
  assert.notEqual(s.player.x, x, 'and it moves again on the frame after');
});

test('$FFB1 and $FFA7 keep ticking while paused', () => {
  // The VBlank ISR owns them and $C716 gates the MAIN LOOP, not VBlank. So any
  // odd-length pause in a port that freezes them permanently desyncs every
  // phase consumer after it: the water gravity gate ($FFB1 & 7), the hit
  // blink, the enemy loop direction ($FFA7). No scenario pauses, which is
  // exactly why this never bit.
  const s = level(3);
  run(s, 1, START);
  const f0 = s.frame, p0 = s.parity;
  run(s, 5, 0);
  assert.equal(s.frame, (f0 + 5) & 0xFF);
  assert.equal(s.parity, (p0 + 5) & 1);
});

test('pausing queues cue $0B/$01; UNpausing queues nothing', () => {
  // $062B: `LD BC,$0B01`. The $0633 unpause arm has no request at all -- it
  // only restores the music volume (7:$4083). MEASURED (pauseoam.py): the
  // $062E cue hook fires once, $061E duck once, $063D restore once.
  const s = level(3);
  run(s, 1, START);
  assert.deepEqual(s.sound.queue, [{ id: 0x0B, mask: 0x01 }]);
  s.sound.queue.length = 0;
  run(s, 1, START);
  assert.deepEqual(s.sound.queue, [], 'nothing on the way out');
});

test('$C750 refuses the pause outright (level 14 entrance)', () => {
  // $0604: `LD A,[$C750] / AND A / JR NZ`. The whole toggle is skipped, so a
  // START pressed during the entrance is eaten rather than deferred.
  const s = level(0x0E);
  s.flow.bossMode = 1;
  run(s, 1, START);
  assert.equal(s.flow.paused, false);
});

test('dying FORCES $C716 to 0 -- you cannot pause a death, or stay paused into one', () => {
  // $05F2-$05FC: `LD A,[$C715] / AND A / JR Z` -- non-zero writes 0 to $C716
  // and skips the rest, so it is a force rather than a refusal.
  const s = level(3);
  run(s, 1, START);
  assert.equal(s.flow.paused, true);
  s.player.dead = 1;
  run(s, 1, 0);
  assert.equal(s.flow.paused, false, 'the pause is cleared with no button at all');

  s.player.dead = 1;
  run(s, 1, START);
  assert.equal(s.flow.paused, false, 'and START cannot re-arm it');
});

// ---------------------------------------------------------------------------
// loc_00_0150 -- what a game over wipes.  (afterDeath's other arm is pinned in
// tests/level.test.js; this is the half that matters for the ECONOMY.)
// ---------------------------------------------------------------------------

test('a game over wipes $C754, so the +2 max-HP pickups come back', () => {
  // 1:$4DDA erases a +2-max-HP pickup's map cell on level re-entry whenever
  // its $C754 bit is set. Keeping the latch through a game over therefore made
  // all three of them (levels 3, 5 and $0D) unobtainable for every run after
  // the first -- permanently, and silently.
  //
  // MEASURED (tools/oracle/econgameover.py) with $C753 = $05, $C754 = $07,
  // $C756 = $02, $FF8E = $10 and $C759 = $2A poked in and one life left: the
  // machine comes back 00 / 00 / 01 / $0A / 00.
  const s = level(3);
  s.flow.maxHpTaken = 0x07;
  s.player.hpMax = 0x10;
  s.player.hp = 0x10;
  assert.equal(afterDeath(s, true), 'gameover');
  assert.equal(s.flow.maxHpTaken, 0);
  assert.equal(s.player.hpMax, s.tunables.startingMaxHP, '$0202');
});

test('an ORDINARY death keeps the max-HP upgrade', () => {
  // The other side of the same coin, and the reason resetPlayer must not touch
  // HP: $04BB writes neither $FF8A nor $FF8E, so the upgrade has to survive
  // every screen handoff structurally rather than by being hand-carried.
  const s = level(3);
  s.flow.maxHpTaken = 0x07;
  s.player.hpMax = 0x10;
  assert.equal(afterDeath(s, false), 'roundselect');
  assert.equal(s.player.hpMax, 0x10);
  assert.equal(s.flow.maxHpTaken, 0x07);
  assert.equal(s.flow.continueAvailable, 1, '$2AAF');
});
