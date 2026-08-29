// WAVE 98 (H1) -- THE REPLAYED HUD COMES OFF.
//
//   the owner: "I am pretty sure the HUD from the upper left is a recording and
//   should go till we have the real one"
//
// They are right, and this repo already says so in two places: `src/hud.js` --
// *"the HUD's STATE is this port's and the HUD's PICTURE is not"* -- and
// `41-recon` §3.1, which lists the `tx` layer as *"the capture, whole -- HUD,
// score digits, all on-screen text"*.
//
// THE PRECEDENT IS W37 AND THE TERMS ARE W37's: the layer goes EMPTY, not
// wrong; nothing is substituted; the page keeps SAYING what it is.
//
// THREE THINGS THIS FILE HOLDS DOWN, and the third is the one that would be
// easy to break by accident:
//
//   1. the TX layer really is what the HUD is drawn in, and switching it off
//      really removes pixels (not a no-op on a synthetic state);
//   2. it comes off in the `port` source ONLY -- `capture` is deliberately the
//      recording, and it is the one correctness check this repo has that does
//      not need MAME;
//   3. **NOT ONE PALETTE WORD MOVES.**  W91-W93 moved 1,776 of 2,560 palette
//      words to the cartridge and 176 of the 240 TEXT words are among them.
//      The picture and the colours are two separate retirements and only the
//      picture is retired here.
//
// SEEN TO FAIL: `[M]` W98/H2 with `wantTx: false` passed unconditionally
// (i.e. in `capture` too), and W98/H1 with it not passed at all.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Renderer, FILL_PEN, SCREEN_W, SCREEN_H } from '../src/render/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = (n) => fs.readFileSync(path.join(HERE, '..', 'src', n), 'utf8');
const PAGE = () => fs.readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');

function fakeRoms() {
  return {
    igs023: new Uint8Array(0xa00000),
    sprcol: new Uint16Array(1024),
    sprmask: new Uint16Array(1024),
  };
}
function emptyState() {
  return {
    bg: new Uint16Array(64 * 16 * 2), tx: new Uint16Array(64 * 32),
    rowscroll: new Uint16Array(224), zoomram: new Uint16Array(0x100),
    spritebuffer: new Uint16Array(16), regs: {
      bg_xscroll: 0, bg_yscroll: 0, tx_xscroll: 0, tx_yscroll: 0,
      ctrl: 0, bg_scale: 0x210 },
  };
}

test('W98/H1 `wantTx: false` removes the TX layer, and it is the layer the HUD '
  + 'is in', () => {
  const roms = fakeRoms();
  roms.igs023[0] = 1;                  // TX tile 0's first nibble pair
  const r = new Renderer(roms);
  // BG off via ctrl bit 12, so the only thing that can paint is TX.
  const st = emptyState();
  st.regs.ctrl = 1 << 12;
  const withTx = r.renderIndexed(st)[0];
  assert.notEqual(withTx, FILL_PEN,
    'the TX layer paints pixel 0 -- if it did not, the check below is vacuous');
  const st2 = emptyState();
  st2.regs.ctrl = 1 << 12;             // BG off in BOTH, so only TX can differ
  const withoutTx = r.renderIndexed(st2, { wantTx: false })[0];
  assert.equal(withoutTx, FILL_PEN,
    'with wantTx false the TX layer paints nothing and the fill pen shows');
  // and it is a page-side switch, not an asset change: nothing in the bundle
  // moved, which is W37's rule and `41-recon` §5.3's reason (bundlegate demands
  // 100.0000 % pixel identity from the PUBLISHED bundle's own capture).
  assert.ok(!/wantTx/.test(fs.readFileSync(
    path.join(HERE, '..', 'tools', 'export-web.mjs'), 'utf8')),
  'the removal must NOT be in the exporter -- bundlegate renders the published '
    + 'bundle and requires pixel identity to MAME');
});

test('W98/H2 the HUD comes off in the `port` source and STAYS in `capture`', () => {
  const s = SRC('web/app.js');
  const m = s.match(/renderIndexed\(st,\s*\n?\s*usedPort \? \{([^}]*)\}[^;]*\);/);
  assert.ok(m, 'Demo.draw still renders through one renderIndexed call');
  // W115: the port source NO LONGER passes `wantTx: false`. The score digits
  // now render from the port's own `TxVram` (the ported `$185DC4` flush), so
  // `wantTx` is back to its default (true). The other HUD text is still blank
  // (Wave C'); only the score numbers are the port's.
  assert.ok(!/wantTx:\s*false/.test(m[1]),
    'the port source no longer suppresses TX (W115: score digits render)');
  assert.ok(/usedPort \?/.test(s.slice(m.index, m.index + 200)),
    'and it is CONDITIONAL on the port source -- `capture` is deliberately the '
    + 'recording and is the only correctness check here that does not need MAME');
  assert.ok(/undefined\);/.test(s.slice(m.index, m.index + 300)),
    'the capture source passes no options at all, exactly as before');
  // W115: the port source now overrides st.tx with the port's TxVram.
  assert.ok(/usedPort\) st\.tx = this\.game\.txvram\.w/.test(s),
    'the port source sources st.tx from the port\'s TxVram (W115)');
});

test('W98/H3 the page keeps SAYING what the HUD layer is', () => {
  assert.ok(/txDropped/.test(SRC('web/app.js')),
    'the stats object still publishes txDropped');
  assert.ok(/txPort/.test(SRC('web/app.js')),
    'and W115\'s txPort flag (score digits are the port\'s)');
  // W115: the status line now distinguishes `hud-score` (port: score digits
  // live, other text blank) from `hud-rec` (capture: whole layer recorded).
  assert.ok(/hud-score/.test(PAGE()),
    'the status line prints hud-score for the port source');
  assert.ok(/hud-rec/.test(PAGE()),
    'and still prints hud-rec for the capture source');
});

test('W98/H4 NOT ONE PALETTE WORD IS REMOVED, and the two paths are separate',
  () => {
    const s = SRC('web/app.js');
    // `mergePalette` reads the port's palette and the capture's; `st.tx` is
    // nowhere in it. If a later wave ever routes the palette through the TX
    // switch, this is what says so.
    const merge = s.match(/mergePalette\(([^)]*)\)/);
    assert.ok(merge, 'the palette merge still runs');
    assert.ok(!/tx/i.test(merge[1]),
      'the palette merge takes no TX input, so switching the TX LAYER off '
      + 'cannot remove a palette word');
    assert.ok(/paletteSourced = this\.palMerged\.fromCartridge/.test(s),
      'and the page still reports how many words are the cartridge\'s -- '
      + 'W91-W93 moved 1,776 of 2,560 and 176 of the 240 TEXT words are among '
      + 'them; the other 64 have no cartridge source yet and none is dropped');
    void { SCREEN_W, SCREEN_H };
  });
