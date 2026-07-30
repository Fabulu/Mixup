// Title screen.  ROM: loc_00_02C4, cursor via sub_00_0FCC, state 4 at
// loc_00_031B, fades through sub_00_0A7F.
//
// Every constant asserted here was read back off the real cartridge under
// PyBoy -- OAM and $C712 at the title loop, and for the fade and the flash
// tools/oracle/titleflash.py + titlestatediff.mjs, which check the eight LCD
// registers, the 33-frame palette ramp frame by frame and all 120 of the
// flash's staged scripts against the running ROM.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createState } from '../src/state.js';
import { makeTunables } from '../src/tunables.js';
import { showTitle, tickTitle, hideTitle, createFade, tickFade,
         FADE_FRAMES } from '../src/title.js';

/** loadTitle() hands showTitle decoded scripts, not base64. */
const bytes = (a) => Uint8Array.from(a);

/**
 * A stand-in for loadTitle()'s result. `lcd` and the two fade ramps are the
 * cartridge's real values -- 0:$0B09 and 0:$0B11, and the immediates at
 * $0216/$02A8/$02BC -- because the tests below assert them.
 */
function fakeArt() {
  return {
    bgMap: new Uint8Array(1024),
    tiles: { bg: [], obj: [] },
    lcd: { lcdc: 0xE7, scx: 0, scy: 0, wx: 0x07, wy: 0x90,
           bgp: 0xE4, obp0: 0xE4, obp1: 0xC4 },
    fadeBgp: [0xE4, 0x90, 0x40, 0x00, 0x1B, 0x06, 0x01, 0x00],
    fadeObp1: [0xC4, 0x80, 0x00, 0x00],
    // 1:$7C44's first record (START) and 1:$7C57 whole (the eraser).
    flashOn: bytes([0x99, 0x67, 0x05, 0x9C, 0x9D, 0x8A, 0x9B, 0x9D, 0x00]),
    flashOff: bytes([0x99, 0x67, 0x45, 0x2F, 0x00]),
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

/** The title with $02C1's fade already finished -- i.e. at loc_00_02C4. */
function makeTitle() {
  const state = createState(makeTunables());
  state.titleManifest = fakeManifest();
  showTitle(state, fakeArt(), false);
  return state;
}

const UP = 0x40, DOWN = 0x80, START = 0x08;

/** Run the whole of loc_00_031B + $0350 and return the frame it hands over. */
function runToStart(s) {
  for (let i = 0; i < 400; i++) {
    s.input.pressed = 0;
    if (tickTitle(s) === 'start') return i + 1;
  }
  throw new Error('never reached $035B');
}

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

test('START on OPTION leaves immediately; START on START does not', () => {
  // $0312 is a straight `JP NZ, loc_00_3893`, but the START arm falls THROUGH
  // $0315 into loc_00_031B -- 120 frames of blinking and then a 33-frame fade
  // before $035B is reached. Measured on the cartridge: 153 frames.
  const s = makeTitle();
  s.title.cursor = 1;
  s.input.pressed = START;
  assert.equal(tickTitle(s), 'options');

  const t = makeTitle();
  t.input.pressed = START;
  assert.equal(tickTitle(t), 'title', 'the press enters state 4, it does not '
    + 'hand over');
  assert.equal(runToStart(t), 0x78 + FADE_FRAMES);
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
  showTitle(s, fakeArt(), false);          // no titleManifest
  s.input.pressed = 0;
  assert.equal(tickTitle(s), 'title');
  assert.equal(s.video.sprites.length, 0);
});

// ---------------------------------------------------------------------------
// sub_00_0A7F -- the fade, and the LCD registers it settles on
// ---------------------------------------------------------------------------

test('a fade is 33 frames with four palette steps', () => {
  // B counts $21 down to $01 and a step only happens where `B & 7 == 0`:
  // $20, $18, $10, $08. MEASURED on the cartridge's fade OUT of the title --
  // the shadows change at offsets 10, 18 and 26, the step at iteration 2
  // writing the value already in place.
  const art = fakeArt();
  const video = {};
  const f = createFade(art, 0x00);           // fade OUT: $C70E counts up
  const steps = [];
  let n = 0;
  do {
    n++;
    const before = video.bgp;
    tickFade(f, video);
    if (video.bgp !== before) steps.push([n, video.bgp, video.obp1]);
  } while (f.b);
  assert.equal(n, FADE_FRAMES);
  assert.deepEqual(steps, [[2, 0xE4, 0xC4], [10, 0x90, 0x80],
                           [18, 0x40, 0x00], [26, 0x00, 0x00]]);
});

test('a fade IN counts the ramp DOWN and settles on $E4/$E4/$C4', () => {
  // $02C1 passes C = $80, so $0A86 seeds $C70E = 3 and $0AD6 decrements it --
  // which is why the title's palettes are entry 0 of the two ramps and why
  // OBP1 is $C4 rather than the $E4 that $34C6 writes as an immediate. That
  // was the whole reason assets/title.json existed.
  const art = fakeArt();
  const video = {};
  const f = createFade(art, 0x80);
  while (tickFade(f, video));
  assert.deepEqual([video.bgp, video.obp0, video.obp1], [0xE4, 0xE4, 0xC4]);
});

test('the low bits of C select which palettes move', () => {
  // $0A95's `CP 2` jumps INTO the middle of the routine and $0AB4's `CP 1`
  // jumps past its tail, so these are not a switch over four cases.
  const art = fakeArt();
  const bg = {};
  const f1 = createFade(art, 0x01);                  // mode 1: BG only
  while (tickFade(f1, bg));
  assert.equal(bg.bgp, 0x00);
  assert.equal(bg.obp0, undefined);

  const obj = {};
  const f2 = createFade(art, 0x02);                  // mode 2: OBJ only
  while (tickFade(f2, obj));
  assert.equal(obj.bgp, undefined);
  assert.equal(obj.obp1, 0x00);

  const alt = {};
  const f3 = createFade(art, 0x03);                  // mode 3: BGP reads +4
  tickFade(f3, alt); tickFade(f3, alt);
  assert.equal(alt.bgp, art.fadeBgp[4], 'the SECOND ramp');
  assert.equal(alt.obp0, art.fadeBgp[0], 'but OBP0 still reads the first');
});

test('showTitle plays the fade in, and the loop is deaf until it ends', () => {
  // loc_00_02C4 is not reached until $02C1's sub_00_0A7F returns, so a START
  // pressed during the fade does nothing at all.
  const s = createState(makeTunables());
  s.titleManifest = fakeManifest();
  showTitle(s, fakeArt());
  for (let i = 0; i < FADE_FRAMES; i++) {
    s.input.pressed = START;
    assert.equal(tickTitle(s), 'title');
    assert.equal(s.video.sprites.length, 0, 'no cursor during the fade');
  }
  assert.equal(s.video.bgp, 0xE4);
  assert.equal(s.title.fade, null);
});

test('the LCD registers come out of the manifest, not a capture', () => {
  const s = makeTitle();
  assert.equal(s.video.scx, 0x00);
  assert.equal(s.video.scy, 0x00);
  assert.equal(s.video.bgp, 0xE4);
  assert.equal(s.video.obp0, 0xE4);
  assert.equal(s.video.obp1, 0xC4);
});

// ---------------------------------------------------------------------------
// state 4 -- loc_00_031B
// ---------------------------------------------------------------------------

test('the flash blinks START on B & $08 and never touches OPTIONS', () => {
  // $0336: LD A,B / AND $08, over a B counting DOWN from $78. So the word is
  // on for ONE frame, off for eight, on for eight -- measured, and the "on"
  // script is 1:$7C44 whole, which repaints OPTIONS unchanged every time.
  const s = makeTitle();
  s.input.pressed = START;
  tickTitle(s);
  const seen = [];
  for (let i = 0; i < 26; i++) {
    s.input.pressed = 0;
    tickTitle(s);
    seen.push(s.video.bgMap[0x9967 - 0x9800]);
  }
  const runs = [];
  for (const v of seen) {
    if (runs.length && runs[runs.length - 1][0] === v) runs[runs.length - 1][1]++;
    else runs.push([v, 1]);
  }
  assert.deepEqual(runs.slice(0, 3), [[0x9C, 1], [0x2F, 8], [0x9C, 8]]);
});

test('the flash runs 120 frames and then fades for 33', () => {
  const s = makeTitle();
  s.input.pressed = START;
  tickTitle(s);
  for (let i = 1; i < 0x78; i++) {
    s.input.pressed = 0;
    assert.equal(tickTitle(s), 'title');
    assert.equal(s.title.flash.fade, null, `frame ${i} is still blinking`);
  }
  s.input.pressed = 0;
  tickTitle(s);
  assert.ok(s.title.flash.fade, '$0350 armed the fade out');
  assert.equal(s.video.bgp, 0xE4, 'and the ramp has not moved yet');
});

test('the cursor keeps blinking through the flash', () => {
  // $032C calls sub_00_0FCC every iteration, with the row picked from $C712
  // exactly as the title loop picks it.
  const s = makeTitle();
  s.input.pressed = DOWN;
  tickTitle(s);
  s.title.cursor = 0;                    // back to START so the press takes it
  s.input.pressed = START;
  tickTitle(s);
  for (let i = 0; i < 5; i++) { s.input.pressed = 0; tickTitle(s); }
  assert.equal(s.video.sprites.length, 2);
  assert.equal(s.video.sprites[0].y, 0x64 - 16);
});

test('the handover asks for sound $01 with mask $03', () => {
  // $0355: LD BC,$0103 -- id $01, mask $03. sub_00_0AE1 takes B as the id.
  const s = makeTitle();
  s.input.pressed = START;
  tickTitle(s);
  runToStart(s);
  assert.deepEqual(s.sound.queue.at(-1), { id: 0x01, mask: 0x03 });
});

test('the rescue cheat needs the exact button set -- and STARTS THE GAME', () => {
  // $02C7 compares the whole newly-pressed byte against $26 (B+SELECT+LEFT),
  // so any extra button held defeats it. And $02D8 is `JP loc_00_031B`: the
  // cheat is not a toggle you set and stay on the title with.
  const s = makeTitle();
  s.input.pressed = 0x26 | 0x01;
  assert.equal(tickTitle(s), 'title');
  assert.equal(s.flow.rescueCheat, 0);
  assert.equal(s.title.flash, null);

  s.input.pressed = 0x26;
  assert.equal(tickTitle(s), 'title');
  assert.equal(s.flow.rescueCheat, 1);
  assert.ok(s.title.flash, '$02D8 -> loc_00_031B');
  assert.equal(runToStart(s), 0x78 + FADE_FRAMES);
});

test('showTitle repaints START, which the flash leaves erased', () => {
  // The flash's last iteration is B = 1 and `1 & 8` is 0, so the eraser is the
  // last script it stages. The cartridge only ever comes back here through
  // $027D, which rebuilds the whole screen -- $02AB's script included.
  const s = makeTitle();
  s.input.pressed = START;
  tickTitle(s);
  runToStart(s);
  assert.equal(s.video.bgMap[0x9967 - 0x9800], 0x2F);
  showTitle(s, { ...fakeArt(), bgMap: s.video.bgMap }, false);
  assert.equal(s.video.bgMap[0x9967 - 0x9800], 0x9C);
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
