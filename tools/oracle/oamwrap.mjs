// Shadow OAM's Y byte is EIGHT BITS. ROM: sub_00_0BC6, $0BE9-$0BEB.
//
//     0BE9: 2A   LD A, [HL+]      ; the record's dy
//     0BEA: 80   ADD A, B         ; B = the metasprite's OAM Y
//     0BEB: 12   LD [DE], A       ; straight into $C0xx
//
// An 8-bit add into an 8-bit store: a record that pushes Y off the TOP of the
// screen does not go negative, it WRAPS, and the sprite reappears at the
// bottom. src/render/metasprite.js kept a JavaScript number instead, so those
// sprites were simply dropped by the renderer's off-screen test.
//
// WHY THIS FILE EXISTS. The defect is worth exactly 15 pixels in the whole
// pixeldiff corpus (l12-walk f200, all of them on row 0), and pixeldiff
// compares against a RECORDED reference. Re-record the reference from a port
// that has lost the wrap and the 15 pixels go quiet -- the check would agree
// with whatever the port did. So this asserts the OUTPUT directly, against
// numbers written down here: the queue entries the shipped path produces, and
// then the pixels the renderer makes of them.
//
// Nothing is seeded. createState / initLevel(12) / tick, the same three calls
// main.js makes (docs/03 lesson 38 -- a harness may only set up state the
// application sets up on the path being tested).
//
//   node tools/oracle/oamwrap.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { imp, installFetchShim } from './_env.mjs';

installFetchShim();

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');
const R = await imp('src/render/renderer.js');

// pixeldiff.mjs's l12-walk, verbatim: level 12, "20:,180:R", read at f200.
// Level 12's ceiling banner is the one place in the corpus where a metasprite
// record carries the origin past 0 -- OAM Y 1, i.e. one row of each letter
// tile visible along the very top of the screen.
const LEVEL = 12, FRAMES = 200;

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
const state = createState(makeTunables());
await initLevel(state, LEVEL);

for (let f = 1; f <= FRAMES; f++) {
  const held = f > 20 ? 0x10 : 0;                 // "20:,180:R"
  state.input.pressed = held & ~state.input.prev;
  state.input.held = held;
  state.input.prev = held;
  tick(state, manifest, playerTiles);
}

let bad = 0;
const fail = (msg) => { bad++; console.log(`FAIL: ${msg}`); };

// --- 1. the QUEUE -----------------------------------------------------------
// y is the OAM byte minus 16, so OAM Y 1 is y = -15. Four tiles, measured on
// the cartridge at this exact frame (pixeldiff l12-walk f200, romOAM 21).
const WRAPPED = [
  { y: -15, x: 89,  tile: 0xA0 },
  { y: -15, x: 97,  tile: 0xA4 },
  { y: -15, x: 105, tile: 0xAA },
  { y: -15, x: 113, tile: 0xAE },
];
const got = state.video.sprites.filter((s) => s.y < 0);
console.log(`f${FRAMES}: ${state.video.sprites.length} queued sprites, `
  + `${got.length} above the top edge`);
for (const s of got) {
  console.log(`   y=${s.y} x=${s.x} tile=$${s.tile.toString(16).toUpperCase()}`);
}
if (got.length !== WRAPPED.length) {
  fail(`expected ${WRAPPED.length} sprites with y < 0, got ${got.length}`
    + ' -- without the $0BEA wrap they land at y = 241 (MEASURED by reverting'
    + ' the mask), which is below a 144-row screen, and the renderer drops'
    + ' them; that is the whole defect');
} else {
  for (const w of WRAPPED) {
    const hit = got.find((s) => s.x === w.x);
    if (!hit) fail(`no wrapped sprite at x=${w.x}`);
    else if (hit.y !== w.y) fail(`x=${w.x}: y ${hit.y}, expected ${w.y}`);
    else if (hit.tile !== w.tile) {
      fail(`x=${w.x}: tile $${hit.tile.toString(16).toUpperCase()}, `
        + `expected $${w.tile.toString(16).toUpperCase()}`);
    }
  }
}
// --- 1b. the RANGE, on BOTH axes -------------------------------------------
// sub_00_0BC6 stores X and Y with the same construct into the same 8-bit
// $C0xx byte -- $0BE9-$0BEB is `LD A,[HL+] / ADD A,B / LD [DE],A` for Y and
// $0BED-$0BEF is `LD A,[HL+] / ADD A,C / LD [DE],A` for X, with `LD D,$C0` at
// $0BE2 -- so neither coordinate can leave the range one byte can express.
// The X half of this went missing for a while: Y was wrapped and X was left as
// a JavaScript number, and the renderer's `sx >= SCREEN_W` test then dropped
// sprites the cartridge draws down the left edge (level 9 f127, tiles
// $BE/$C0/$C2 at OAM X 5). Level 12 alone never produces an out-of-range X, so
// this loop is checked across the levels that do.
const RANGE_LEVELS = [9, 10, 12];
for (const lvl of RANGE_LEVELS) {
  const st = createState(makeTunables());
  await initLevel(st, lvl);
  let out = 0;
  const first = [];
  for (let f = 1; f <= 400; f++) {
    const held = f > 20 ? 0x10 : 0;
    st.input.pressed = held & ~st.input.prev;
    st.input.held = held;
    st.input.prev = held;
    tick(st, manifest, playerTiles);
    for (const s of st.video.sprites) {
      if (s.x < -8 || s.x > 247 || s.y < -16 || s.y > 239) {
        out++;
        if (first.length < 3) first.push(`f${f} x=${s.x} y=${s.y}`);
      }
    }
  }
  console.log(`level ${lvl}, 400 frames: ${out} queue entries outside `
    + `x -8..247 / y -16..239`);
  if (out) {
    fail(`level ${lvl}: ${out} entries outside the range an OAM byte can `
      + `express (${first.join('; ')}) -- sub_00_0BC6 cannot produce those`);
  }
}

// --- 2. the PICTURE ---------------------------------------------------------
// "Renders without throwing" is not "renders a picture". These are the pixels
// on row 0 -- the only row those four sprites reach -- read out of the
// framebuffer and compared to what the cartridge displayed there.
const fb = R.createFramebuffer();
R.renderFrame(state, fb);
const INK = [[100, 104], [107, 116]];             // the letter columns
const PAPER = [[0, 99], [105, 106], [117, 119]];  // sky, and the gaps in them
const row = (x) => fb.shades[x];
let ink = 0, paper = 0;
for (const [a, b] of INK) {
  for (let x = a; x <= b; x++) { if (row(x) !== 0) ink++; else fail(`row 0 x=${x} is blank; the banner should be drawn there`); }
}
for (const [a, b] of PAPER) {
  for (let x = a; x <= b; x++) { if (row(x) === 0) paper++; else fail(`row 0 x=${x} is inked; nothing is drawn there on the cartridge`); }
}
console.log(`row 0: ${ink}/${INK.reduce((n, [a, b]) => n + b - a + 1, 0)} inked columns, `
  + `${paper}/${PAPER.reduce((n, [a, b]) => n + b - a + 1, 0)} blank columns`);

console.log(bad === 0
  ? 'PASS - the $0BEA 8-bit wrap survives into the queue AND onto the screen'
  : `FAIL - ${bad} assertion(s)`);
process.exit(bad === 0 ? 0 : 1);
