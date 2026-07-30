// The SUNSOFT copyright screen -- flow state 1, the first thing on screen.
// ROM: built at $01FC-$023B, run at $0265-$027A.
//
// It had never been ported and was not on the "what is NOT ported" list
// either, which is the interesting part: nothing in the suite looked at flow
// state 1 at all. That is the same shape as the stage-intro card, and the
// lesson is the same one -- an absent feature nobody named is invisible to
// every check that compares two things which both exist.
//
// Everything here is synthetic. `fakeArt()` carries the cartridge's real fade
// ramps (0:$0B09 / 0:$0B11) and its real LCD immediates because the tests
// assert them; the tilemap and tile cache are stand-ins, since WHICH picture
// gets built is settled elsewhere -- tools/oracle/menuflow.mjs holds the
// port's 8192 VRAM bytes and its rendered 160x144 against the cartridge's own
// $026C iteration 100 (23040/23040 pixel-exact).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createState } from '../src/state.js';
import { makeTunables } from '../src/tunables.js';
import {
  showCopyright, hideCopyright, tickCopyright, HOLD_FRAMES,
} from '../src/copyright.js';
import { FADE_FRAMES } from '../src/title.js';
import { rasterBands } from '../src/render/renderer.js';

const START = 0x08;

function fakeArt() {
  return {
    bgMap: new Uint8Array(1024).fill(0x2F),
    tiles: { bg: [], obj: [] },
    // $0216-$0221 and $0261: rWX $07, rWY $90, rSCY 0, rLCDC $E7. rSCX is
    // never written on this path -- it is the 0 the $0160 HRAM clear left.
    lcd: { lcdc: 0xE7, scx: 0, scy: 0, wx: 0x07, wy: 0x90,
           bgp: 0xE4, obp0: 0xE4, obp1: 0xC4 },
    fadeBgp: [0xE4, 0x90, 0x40, 0x00, 0x1B, 0x06, 0x01, 0x00],
    fadeObp1: [0xC4, 0x80, 0x00, 0x00],
  };
}

function makeScreen() {
  const s = createState(makeTunables());
  showCopyright(s, fakeArt());
  return s;
}

/** Tick until `tickCopyright` says 'done'; returns the frame count. */
function runToDone(s, { startOn = -1, limit = 1000 } = {}) {
  for (let i = 1; i <= limit; i++) {
    s.input.pressed = (i === startOn) ? START : 0;
    if (tickCopyright(s) === 'done') return i;
  }
  throw new Error('the copyright screen never finished');
}

// ---------------------------------------------------------------------------
// the screen exists at all
// ---------------------------------------------------------------------------

test('showCopyright puts the machine into flow state 1', () => {
  // Before this landed there was no state.copyright anywhere in the port and
  // boot() went straight to showTitle -- five seconds of hardware-visible,
  // skippable content simply did not exist.
  const s = makeScreen();
  assert.ok(s.copyright, 'state.copyright is the screen');
  assert.equal(s.video.bgMap[0], 0x2F, 'the screen owns the BG tilemap');
});

test('the screen is assembled BLACK and $0265 fades it up to $E4/$E4/$C4', () => {
  // $0160's HRAM clear leaves all three palette shadows at zero and NOTHING
  // on this path writes them until sub_00_0A7F walks the ramp. MEASURED
  // (menushot.py, snap `copyright` at loop iteration 101): $E4/$E4/$C4.
  const s = makeScreen();
  assert.equal(s.video.bgp, 0x00);
  assert.equal(s.video.obp0, 0x00);
  assert.equal(s.video.obp1, 0x00);

  for (let i = 0; i < FADE_FRAMES; i++) { s.input.pressed = 0; tickCopyright(s); }
  assert.equal(s.video.bgp, 0xE4);
  assert.equal(s.video.obp0, 0xE4);
  assert.equal(s.video.obp1, 0xC4);
});

test('the window is PARKED and the LCD registers come from the manifest', () => {
  // $0217 rWX = $07, $021B rWY = $90, $021D rSCY = 0. windowLatchY is the
  // field drawWindow actually reads; writing only windowY leaves the shaft
  // mask parked wherever the last level left it.
  const s = makeScreen();
  assert.equal(s.video.windowX, 0x07);
  assert.equal(s.video.windowY, 0x90);
  assert.equal(s.video.windowLatchY, 0x90);
  assert.equal(s.video.windowMap, null);
  assert.equal(s.video.scx, 0);
  assert.equal(s.video.scy, 0);
});

// ---------------------------------------------------------------------------
// timing.  $0265 fade in (33), $026A-$0276 hold (240), $0278 fade out (33).
// ---------------------------------------------------------------------------

test('the whole screen is 306 frames: 33 + 240 + 33', () => {
  // MEASURED: the $026C loop runs exactly 240 times on the cartridge
  // (menushot.py, `copyright_loop_total`), and sub_00_0A7F is 33 frames
  // ($0A7F: LD B,$21) at both ends.
  assert.equal(HOLD_FRAMES, 0xF0);
  assert.equal(FADE_FRAMES, 0x21);
  const s = makeScreen();
  assert.equal(runToDone(s), FADE_FRAMES + HOLD_FRAMES + FADE_FRAMES);
});

test('START skips the hold, and the fade OUT still runs in full', () => {
  // $026F tests $FFE2 bit 3 BEFORE the `DEC B`, so a press and the counter
  // expiring both arrive at $0278 the same way. Pressing on hold iteration 10
  // must therefore finish at 33 + 10 + 33 = 53.
  const s = makeScreen();
  assert.equal(runToDone(s, { startOn: FADE_FRAMES + 10 }), FADE_FRAMES + 10 + FADE_FRAMES);
});

test('START during the fade IN is ignored -- $026F is not reached yet', () => {
  // sub_00_0A7F BLOCKS: the hold loop head is not reached until it returns, so
  // a press held through the whole fade must not shorten anything.
  const s = makeScreen();
  for (let i = 0; i < FADE_FRAMES; i++) {
    s.input.pressed = START;
    assert.equal(tickCopyright(s), 'copyright', `fade frame ${i}`);
  }
  assert.equal(s.copyright.hold, HOLD_FRAMES, 'not one hold frame was consumed');
});

test('$FFB1 keeps ticking through both fades and the hold', () => {
  // sub_00_0A7F waits on sub_00_0A4F, which is where the VBlank ISR lands, so
  // the frame counter advances even though no game logic runs. A port that
  // only bumps it inside the game tick starts the title with a different
  // $FFB1 phase -- and $FFB1's phase is load-bearing (docs 03, lesson 27).
  const s = makeScreen();
  const before = s.frame;
  const total = runToDone(s);
  assert.equal(s.frame, (before + total) & 0xFF);
});

test('the screen queues no sprites of its own', () => {
  // MEASURED: OAM is empty on the cartridge for the whole screen.
  const s = makeScreen();
  s.video.sprites.push({ x: 1, y: 1, tile: 0, attr: 0 });
  s.input.pressed = 0;
  tickCopyright(s);
  assert.equal(s.video.sprites.length, 0);
});

test('hideCopyright hands the screen back', () => {
  const s = makeScreen();
  hideCopyright(s);
  assert.equal(s.video.bgMap, null);
  assert.equal(s.copyright, null);
});

// ---------------------------------------------------------------------------
// The raster arm.  See the WIRING note -- this one is RED on purpose.
// ---------------------------------------------------------------------------

test('WIRING GAP (renderer.js): the copyright screen must get the FLAT raster arm', () => {
  // rasterBands' screen guard lists title/options/roundSelect/stageIntro/
  // ending and does NOT list `state.copyright`, so the screen falls through to
  // `rasterModeForLevel(state.level.number)` -- and boot() runs initLevel(1)
  // first, so it inherits the LEVELS-1/2 WATER arm: a per-scanline SCX wobble
  // over a static menu screen. tools/oracle/menuflow.mjs measures 6 px of
  // sideways offset and forces level 0 to work around it.
  //
  // THE FIX (src/render/renderer.js, ~line 96) is one identifier:
  //     if (state.copyright || state.title || state.options || state.roundSelect
  //         || state.stageIntro || state.ending) {
  //
  // Every other screen in the flow map is already covered, which is why this
  // is an omission rather than a design: the guard is a list and the new
  // member was not added to it.
  const s = makeScreen();
  s.level.number = 1;                       // what boot() leaves behind
  s.level.width = 32;
  s.level.cells = new Uint8Array(32 * 16 * 2);
  s.camera.x = 0;
  s.camera.y = 0x1000;
  // The levels-1/2 arm is the one that THROWS without the sine table, so give
  // it one: the point to make is "the wrong arm ran", not "the fixture is
  // thin". With the guard in place the table is never consulted.
  s.tables = { sine: new Array(32).fill(0) };
  let bands;
  try {
    bands = rasterBands(s);
  } catch (e) {
    assert.fail('rasterBands THREW on the copyright screen: ' + e.message
      + ' -- i.e. it ran a LEVEL raster arm over a menu');
  }
  assert.equal(bands.length, 1,
    'a menu screen is one flat band; more than one means a level raster arm ran');
});

test('the other screens ARE covered, so the gap above is an omission not a design', () => {
  const each = ['title', 'options', 'roundSelect', 'stageIntro', 'ending'];
  for (const key of each) {
    const s = makeScreen();
    s.copyright = null;
    s[key] = {};
    s.level.number = 1;
    s.level.width = 32;
    s.level.cells = new Uint8Array(32 * 16 * 2);
    s.camera.x = 0;
    s.camera.y = 0x1000;
    assert.equal(rasterBands(s).length, 1, `state.${key} takes the flat arm`);
  }
});
