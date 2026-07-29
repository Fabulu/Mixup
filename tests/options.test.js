// The OPTIONS panel.  ROM: loc_00_3893 (entry), loc_00_38D5 (the loop),
// $3905-$3934 (EXIT).
//
// The one rule here that cost real pixels is which palette register $38A5
// writes, and it is the sort of mistake no state comparison can find: the
// screen was byte-exact and the cursor was simply the wrong colour.
//
// Nothing reads assets/. tools/oracle/menuscreen.mjs holds the rendered panel
// against the cartridge (23040/23040) and tools/oracle/menuflow.mjs holds the
// cue list for the whole title -> options -> title walk.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createState, GAMEPLAY_PALETTES } from '../src/state.js';
import { makeTunables } from '../src/tunables.js';
import {
  showOptions, hideOptions, tickOptions,
  ROW_DIFFICULTY, ROW_SOUND, ROW_EXIT, WY_PARKED, WY_OPEN,
} from '../src/options.js';
import { showTitle } from '../src/title.js';

const UP = 0x40, DOWN = 0x80, LEFT = 0x20, RIGHT = 0x10, START = 0x08, A = 0x01;

/** 0:$3A00-ish, one script per difficulty. Synthetic; only the shape matters. */
const OPTIONS_DIFFICULTY = [
  [0x00, 0x00, 0x01, 0xA0, 0x00],
  [0x00, 0x00, 0x01, 0xA1, 0x00],
  [0x00, 0x00, 0x01, 0xA2, 0x00],
];

function makePanel() {
  const s = createState(makeTunables());
  s.tables = { optionsDifficulty: OPTIONS_DIFFICULTY, optionsCursorY: [0x50, 0x60, 0x70] };
  s.sound = { queue: [] };
  s.titleManifest = null;
  showOptions(s, new Uint8Array(0x400));
  return s;
}

/** Run the window slide in so the loop body is reachable. */
function openPanel() {
  const s = makePanel();
  for (let i = 0; i < 0x100 && s.options.wy > WY_OPEN; i++) {
    s.input.pressed = 0;
    tickOptions(s);
  }
  assert.equal(s.options.wy, WY_OPEN);
  return s;
}

const press = (s, bits) => { s.input.pressed = bits; s.input.held = bits; };

// ---------------------------------------------------------------------------
// $38A5 -- the cursor palette
// ---------------------------------------------------------------------------

test('$38A5 writes OBP0, not OBP1: $FFAD/$FFAE/$FFAF is BGP/OBP0/OBP1', () => {
  // `LD A,$1B / LDH [$FFAE],A`. The shadow trio's ORDER is confirmed by
  // sub_00_0A7F writing them at $0AAE/$0AC3/$0ACA in exactly that sequence.
  //
  // MEASURED in the options loop (tools/oracle/menushot.py, snap `options`):
  // bgp/obp0/obp1 = $E4/$1B/$C4. Writing $1B to OBP1 instead left the bat
  // cursor drawn through the port's OBP0 = $E4 -- the NORMAL ramp, i.e. dark
  // -- where the cartridge draws it through $1B, the inverted one. 72 wrong
  // pixels on rows 83-91, which is the whole cursor, and nothing else in the
  // 23,040 moved.
  const s = makePanel();
  assert.equal(s.video.obp0, 0x1B, '$FFAE takes the inverted ramp');
  assert.equal(s.video.obp1, GAMEPLAY_PALETTES.obp1, '$FFAF is not written here');
  assert.equal(s.video.bgp, GAMEPLAY_PALETTES.bgp,
    'BGP is left alone -- $094F sets it per scanline once the squash starts');
});

test('EXIT puts OBP0 back to $E4 -- $390C, and again it is $FFAE', () => {
  const s = openPanel();
  s.options.cursor = ROW_EXIT;
  press(s, START);
  assert.equal(tickOptions(s), 'options');
  assert.equal(s.options.closing, true);
  assert.equal(s.video.obp0, GAMEPLAY_PALETTES.obp0);
  assert.equal(s.video.obp1, GAMEPLAY_PALETTES.obp1);
  assert.equal(s.raster.closing, 1, '$3910: $C766 = 1 ramps the squash back down');
});

test('hideOptions restores it too, for the path that never reaches $390C', () => {
  const s = makePanel();
  hideOptions(s);
  assert.equal(s.video.obp0, GAMEPLAY_PALETTES.obp0);
  assert.equal(s.video.windowMap, null);
  assert.equal(s.video.windowY, WY_PARKED);
  assert.equal(s.video.windowLatchY, WY_PARKED, 'drawWindow reads the LATCH');
});

// ---------------------------------------------------------------------------
// $3934 -- the return to the title
// ---------------------------------------------------------------------------

test('the options exit does NOT restart the title theme', () => {
  // $3934 is a bare `JP loc_00_02C4`: PAST the build at $027D, past $02A1's
  // `LD BC,$0003` and past $02C1's fade. showTitle therefore has to take a
  // flag, because it serves both entries.
  //
  // MEASURED (menushot.py `songs`, every $0AE1 hit stamped with the loop
  // counters): the cartridge's complete list across the options walk is
  // ... $25/$03 at opt=131, then $0D/$01 at title=183 -- no $00/$03 anywhere
  // between. Sending it cut the $25 blip off mid-note and restarted the title
  // theme from the top every single time you left OPTIONS.
  const art = {
    bgMap: new Uint8Array(1024), tiles: { bg: [], obj: [] },
    lcd: { lcdc: 0xE7, scx: 0, scy: 0, wx: 0x07, wy: 0x90,
           bgp: 0xE4, obp0: 0xE4, obp1: 0xC4 },
    fadeBgp: [0xE4, 0x90, 0x40, 0x00, 0x1B, 0x06, 0x01, 0x00],
    fadeObp1: [0xC4, 0x80, 0x00, 0x00],
    flashOn: Uint8Array.from([0x00]), flashOff: Uint8Array.from([0x00]),
  };

  const back = createState(makeTunables());
  back.sound = { queue: [] };
  back.titleManifest = null;
  showTitle(back, art, false);                 // main.js:231's $3934 return
  assert.deepEqual(back.sound.queue, [], 'nothing at all on the options return');
  assert.equal(back.title.fade, null, 'and no fade either -- $02C1 is skipped');

  // The BOOT entry still asks, because $02A1 is on that path and initLevel has
  // already queued level 1's own musicFresh.
  const boot = createState(makeTunables());
  boot.sound = { queue: [] };
  boot.titleManifest = null;
  showTitle(boot, art, true);
  assert.deepEqual(boot.sound.queue, [{ id: 0x00, mask: 0x03 }]);
});

test('entering OPTIONS asks for $25/$03, and EXIT asks for it again', () => {
  // $3893's `LD BC,$2503` and $3915's. Both are on the cartridge's list.
  const s = makePanel();
  assert.deepEqual(s.sound.queue, [{ id: 0x25, mask: 0x03 }]);

  const open = openPanel();
  open.sound.queue.length = 0;
  open.options.cursor = ROW_EXIT;
  press(open, START);
  tickOptions(open);
  assert.deepEqual(open.sound.queue, [{ id: 0x25, mask: 0x03 }]);
});

// ---------------------------------------------------------------------------
// the loop, enough of it that the palette tests above sit on something real
// ---------------------------------------------------------------------------

test('nothing in the loop runs until the window has finished sliding', () => {
  // $38C9: the ROM spins on sub_00_0C1F / sub_00_0A4F while rWY walks from
  // $90 down to $45, and START during it must not be seen.
  const s = makePanel();
  assert.equal(s.options.wy, WY_PARKED);
  press(s, START);
  s.options.cursor = ROW_EXIT;
  tickOptions(s);
  assert.equal(s.options.closing, false, 'the START was not acted on');
  assert.equal(s.options.wy, WY_PARKED - 1, 'one slide step only');
});

test('LEFT/RIGHT on GAME LEVEL wrap the difficulty at 3', () => {
  const s = openPanel();
  s.flow.difficulty = 2;
  s.options.cursor = ROW_DIFFICULTY;
  press(s, RIGHT); tickOptions(s);
  assert.equal(s.flow.difficulty, 0);
  press(s, LEFT); tickOptions(s);
  assert.equal(s.flow.difficulty, 2);
});

test('A auditions a song only on SOUND TEST, with mask $03', () => {
  const s = openPanel();
  s.options.cursor = ROW_DIFFICULTY;
  s.sound.queue.length = 0;
  press(s, A); tickOptions(s);
  assert.deepEqual(s.sound.queue, [], 'A does nothing on GAME LEVEL');

  s.options.cursor = ROW_SOUND;
  s.options.soundIndex = 0x12;
  press(s, A); tickOptions(s);
  assert.deepEqual(s.sound.queue, [{ id: 0x12, mask: 0x03 }],
    '$393F: B = $FF80 (the raw index), C = $03');
});
