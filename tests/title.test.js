// Title screen.  ROM: loc_00_02C4, cursor via sub_00_0FCC.
//
// Every constant asserted here was read back off the real cartridge under
// PyBoy (OAM + $C712 at the title loop), not just off the disassembly --
// see docs/03-VERIFICATION.md.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createState } from '../src/state.js';
import { makeTunables } from '../src/tunables.js';
import { showTitle, tickTitle, hideTitle } from '../src/title.js';

/** A stand-in for the ripped title capture; only the shape matters here. */
function fakeArt() {
  return {
    bgMap: new Uint8Array(1024),
    tiles: { bg: [], obj: [] },
    meta: { scx: 0, scy: 0, obp0: 0xE4, obp1: 0xC4 },
  };
}

/** The four cursor metasprites, as exported from 0:$3337. */
function fakeManifest() {
  const mk = (tile) => ({ sprites: [[0, -8, tile, 0x00], [0, 0, tile, 0x20]] });
  const table1 = [];
  table1[0x19] = mk(0xA4);
  table1[0xC9] = mk(0xA6);
  table1[0xCA] = mk(0xA8);
  table1[0xCB] = mk(0xAA);
  return { metasprites: { table1 } };
}

function makeTitle() {
  const state = createState(makeTunables());
  state.titleManifest = fakeManifest();
  showTitle(state, fakeArt());
  return state;
}

const UP = 0x40, DOWN = 0x80, START = 0x08;

// ---------------------------------------------------------------------------
// selection
// ---------------------------------------------------------------------------

test('the title starts on START', () => {
  // Oracle: $C712 reads 0 the moment loc_00_02C4 is first reached.
  assert.equal(makeTitle().title.cursor, 0);
});

test('UP and DOWN both flip the selection', () => {
  // $02DB tests bits 6 and 7 together and $02F9 does XOR $01 -- there is no
  // separate up/down handling, so DOWN-DOWN returns to START rather than
  // sticking at the bottom. Confirmed on hardware: DOWN -> $C712=1, UP -> 0.
  const s = makeTitle();
  for (const btn of [DOWN, UP, DOWN, DOWN]) {
    const before = s.title.cursor;
    s.input.pressed = btn;
    tickTitle(s);
    assert.equal(s.title.cursor, before ^ 1);
  }
});

test('START picks the highlighted entry', () => {
  const s = makeTitle();
  s.input.pressed = START;
  assert.equal(tickTitle(s), 'start');

  s.title.cursor = 1;
  s.input.pressed = START;
  assert.equal(tickTitle(s), 'options');   // $0312 -> loc_00_3893
});

test('no input keeps the title running', () => {
  const s = makeTitle();
  s.input.pressed = 0;
  assert.equal(tickTitle(s), 'title');
});

// ---------------------------------------------------------------------------
// cursor rendering
// ---------------------------------------------------------------------------

test('the cursor sits at the selected row', () => {
  // Oracle OAM: two 8x16 sprites at x $20/$28, y $64 (START) / $74 (OPTION).
  // Screen space subtracts the hardware's 8/16 px OBJ bias.
  const s = makeTitle();
  s.input.pressed = 0;
  tickTitle(s);
  assert.deepEqual(s.video.sprites.map((q) => [q.x, q.y]),
                   [[0x20 - 8, 0x64 - 16], [0x28 - 8, 0x64 - 16]]);

  s.input.pressed = DOWN;
  tickTitle(s);
  assert.deepEqual(s.video.sprites.map((q) => [q.x, q.y]),
                   [[0x20 - 8, 0x74 - 16], [0x28 - 8, 0x74 - 16]]);
});

test('the right half of the cursor is X-flipped', () => {
  const s = makeTitle();
  s.input.pressed = 0;
  tickTitle(s);
  assert.equal(s.video.sprites[0].attr & 0x20, 0x00);
  assert.equal(s.video.sprites[1].attr & 0x20, 0x20);
});

test('the cursor blinks on (frame & $18) >> 3', () => {
  // Oracle: tiles ran $A4 $A6 $A8 $AA in eight-frame bands as $FFB1 advanced.
  const s = makeTitle();
  const seen = new Map();
  for (let i = 0; i < 32; i++) {
    s.input.pressed = 0;
    tickTitle(s);
    seen.set((s.frame & 0x18) >> 3, s.video.sprites[0].tile);
  }
  assert.deepEqual([...seen.entries()].sort((a, b) => a[0] - b[0]),
                   [[0, 0xA4], [1, 0xA6], [2, 0xA8], [3, 0xAA]]);
});

test('the cursor does not pile up in shadow OAM', () => {
  // tick() owns the `sprites.length = 0` line and tick() does not run while
  // the title is up, so tickTitle has to clear it itself.
  const s = makeTitle();
  for (let i = 0; i < 50; i++) { s.input.pressed = 0; tickTitle(s); }
  assert.equal(s.video.sprites.length, 2);
});

test('a missing manifest does not crash the title', () => {
  const s = createState(makeTunables());
  showTitle(s, fakeArt());          // no titleManifest
  s.input.pressed = 0;
  assert.equal(tickTitle(s), 'title');
  assert.equal(s.video.sprites.length, 0);
});

// ---------------------------------------------------------------------------
// fade and cheat
// ---------------------------------------------------------------------------

test('the palette fades up to $E4', () => {
  // $02BF -> sub_00_0A7F. Frame one is still dark; it settles on the stock BGP.
  const s = makeTitle();
  s.input.pressed = 0;
  tickTitle(s);
  assert.notEqual(s.video.bgp, 0xE4);
  for (let i = 0; i < 64; i++) { s.input.pressed = 0; tickTitle(s); }
  assert.equal(s.video.bgp, 0xE4);
});

test('the rescue cheat needs the exact button set', () => {
  // $02C7 compares the whole newly-pressed byte against $26 (B+SELECT+LEFT),
  // so any extra button held defeats it.
  const s = makeTitle();
  s.input.pressed = 0x26 | 0x01;
  tickTitle(s);
  assert.equal(s.flow.rescueCheat, 0);

  s.input.pressed = 0x26;
  tickTitle(s);
  assert.equal(s.flow.rescueCheat, 1);
});

test('hideTitle hands the screen back to the level renderer', () => {
  const s = makeTitle();
  hideTitle(s);
  assert.equal(s.title, null);
  assert.equal(s.video.bgMap, null);
});

test('showTitle asks for the title theme, not the level it was booted with', () => {
  // $02A1: LD BC,$0003 -- song $00, mask $03 (play + stop-all).
  //
  // boot() calls initLevel() BEFORE showing the title, so the level's own
  // musicFresh is already queued by then ($02 for level 1). Without this
  // request the title plays the first level's theme and the two are literally
  // the same song.
  const s = createState(makeTunables());
  s.titleManifest = fakeManifest();
  s.sound = { queue: [{ id: 0x02, mask: 0x03 }] };   // what initLevel left
  showTitle(s, fakeArt());
  assert.deepEqual(s.sound.queue.at(-1), { id: 0x00, mask: 0x03 });
});
