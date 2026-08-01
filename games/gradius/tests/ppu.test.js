// The renderer, against the cartridge itself.
//
// This is the only check in the suite that compares the port with the machine
// rather than with a rule somebody wrote down: it rebuilds captured frames from
// the measured PPU state and compares ALL 61,440 pixels against the framebuffer
// Mesen produced running the real ROM.
//
// The break switches are the other half. A renderer that has only ever been
// seen to agree proves nothing about which of its rules is doing the work --
// docs/knowledge/03. So each break lies about exactly one rule, and the test
// asserts that SOMETHING goes red: every break must be seen by at least one
// frame, and the test names the frames that are BLIND to it rather than
// averaging that away.

import test from 'node:test';
import assert from 'node:assert';

import { renderFrame, tileRow, tilePixel, BREAKS, W, H } from '../src/render/ppu.js';
import {
  loadTiles, loadCapture, frameFromCapture, diffAgainstFb, captureSkipMessage,
} from './helpers.js';

// NATURAL frames: the cartridge left to itself. These must be EXACT.
const NATURAL = [
  ['f400', 'stage 1 opening'],
  ['f1200', 'later, different scroll phase'],
  ['f1700', 'later still'],
  ['f2200', 'a frame with almost nothing in OAM'],
  ['f2400', 'menu'],
  ['f2600', 'TITLE screen -- full nametable, three bg palettes, NO split'],
  ['f3500', 'gameplay again'],
  ['inj', '20 injected sprites over natural background'],
  ['sb810', 'sprites straddling the band boundary, banks differ on those tiles'],
  ['sb812', 'the same, on a frame whose CNROM latch fell a scanline later'],
];

// SYNTHETIC frames: nametable rows 26-29 painted through the oracle so that
// something is actually drawn ON the boundary. Stage 1 draws nothing there, so
// without these the boundary rules cannot be tested at all -- and they are held
// to a STATED BOUND rather than to 0.
//
// WHY THERE IS A RESIDUAL AT ALL, and it is a DELIBERATE PORT DECISION. Two
// sub-scanline effects live on the boundary (NOTES-render.md 7): the split's
// first $2005 write also loads the PPU's 3-bit fine-X latch, which is not part
// of `v` and bites IMMEDIATELY, mid-scanline 211; and the first two background
// tiles of scanline 212 were prefetched with band A's CHR bank. The oracle
// models both behind `rendercheck.py --refine`; src/render/ppu.js does NOT.
//
// That is on purpose. The exact pixel at which each change bites depends on
// where in the scanline the CPU's writes land, and that jitters with the
// sprite-0 spin, so `--refine` still leaves an unresolved residual of its own.
// The plain two-band model is EXACT on all ten natural frames -- everything the
// game actually draws -- so the port keeps the simple rule and states the price
// instead of fitting a constant to jitter.
const SYNTHETIC = [
  ['inj2', 'painted boundary rows + injected sprites'],
  ['gx802', 'painted boundary rows, different split jitter'],
  ['gx800', 'painted boundary rows again'],
  ['fx801', 'fine-X sweep'], ['fx802', 'fine-X sweep'],
  ['fx803', 'fine-X sweep'], ['fx804', 'fine-X sweep'],
];
const RESIDUAL_MAX = 20;              // measured worst: 19 px, on fx801
const RESIDUAL_LINES = [211, 212];

const tiles = loadTiles();
const out = new Uint32Array(W * H);

// WAVE 14 -- THE COST FIX'S OWN GUARD.
//
// renderFrame()'s background loop used to call tileRow() once PER PIXEL, filling
// an 8-byte scratch to read one byte of it, 61,440 times a frame. That was 36%
// of the whole 16.639 ms frame budget (tools/framecost.mjs) -- more than nmi()
// and the synthesiser together -- and nothing in this repo had ever measured it.
// The fix reads the byte directly through tilePixel().
//
// The strongest check on that fix is the pixel comparison below: 61,440 px x
// seven captured frames, against the framebuffer Mesen produced. But it SKIPS
// when tools/oracle/out/video/ is absent, and a fix guarded only by a skippable
// test is not guarded (docs/knowledge/03, "a skip is not a pass"). So the two
// readings of the same index arithmetic are also held against each other
// directly, over the whole address space, with no capture required.
test('tilePixel and tileRow are the same arithmetic, over every tile', () => {
  const tiles = loadTiles();
  const scratch = new Uint8Array(8);
  let checked = 0, nonZero = 0;
  for (let bank = 0; bank < 4; bank++) {
    for (let half = 0; half < 2; half++) {
      for (let tile = 0; tile < 256; tile++) {
        for (let row = 0; row < 8; row++) {
          tileRow(tiles, bank, half, tile, row, scratch);
          for (let col = 0; col < 8; col++) {
            const a = scratch[col];
            const b = tilePixel(tiles, bank, half, tile, row, col);
            assert.strictEqual(b, a,
              `bank ${bank} half ${half} tile ${tile} row ${row} col ${col}: `
              + `tilePixel ${b} != tileRow ${a}`);
            checked++;
            if (a !== 0) nonZero++;
          }
        }
      }
    }
  }
  assert.equal(checked, 4 * 2 * 256 * 8 * 8, 'the whole 131,072-byte tile pool');
  // A sheet of zeroes would satisfy the comparison above and prove nothing --
  // the same "green on an empty asset" trap tests/helpers.js's header names.
  assert.ok(nonZero > checked / 10,
    `only ${nonZero} of ${checked} tile bytes are non-zero -- assets/chr/tiles.u8 `
    + 'looks empty, so this comparison is vacuous');
  // And the high 3 bits of the column index must be IGNORED, because
  // renderFrame passes the full 8-bit fine-x (`fxb`) and not `fxb & 7`.
  for (const col of [8, 9, 200, 255]) {
    assert.strictEqual(tilePixel(tiles, 0, 0, 1, 0, col),
                       tilePixel(tiles, 0, 0, 1, 0, col & 7),
      'tilePixel must mask the column: renderFrame hands it the full fine-x');
  }
});

test('natural frames rebuild pixel-for-pixel', (t) => {
  let ran = 0;
  for (const [name, what] of NATURAL) {
    const cap = loadCapture(name);
    if (!cap) { t.diagnostic(captureSkipMessage(name)); continue; }
    ran++;
    const { bad, lines } = diffAgainstFb(
      renderFrame(frameFromCapture(cap), tiles, out), cap.fb);
    t.diagnostic(`${name} (${what}): ${bad} of ${W * H} pixels differ`);
    assert.strictEqual(bad, 0, `${name}: ${bad} px differ, scanlines ${lines}`);
  }
  if (ran === 0) t.skip('no captures present');
});

test('synthetic boundary frames stay inside the stated residual bound', (t) => {
  let ran = 0;
  for (const [name, what] of SYNTHETIC) {
    const cap = loadCapture(name);
    if (!cap) { t.diagnostic(captureSkipMessage(name)); continue; }
    ran++;
    const { bad, lines } = diffAgainstFb(
      renderFrame(frameFromCapture(cap), tiles, out), cap.fb);
    t.diagnostic(`${name} (SYNTHETIC, ${what}): ${bad} px on scanlines [${lines}]`);
    assert.ok(bad <= RESIDUAL_MAX, `${name}: ${bad} px > bound ${RESIDUAL_MAX}`);
    for (const l of lines) {
      assert.ok(RESIDUAL_LINES.includes(l),
        `${name}: residual on scanline ${l}, outside ${RESIDUAL_LINES}`);
    }
  }
  if (ran === 0) t.skip('no captures present');
});

// Breaks that no frame in this corpus can see, each with the reason -- and the
// reason is CHECKED below, not asserted. A break nothing can see is not
// evidence; a break nothing can see FOR A MEASURED REASON is a documented hole.
const KNOWN_VACUOUS = {
  backdrop: 'every entry-0 palette slot reads $0F on every captured frame, so '
          + 'the universal backdrop and the per-palette colour 0 are the same '
          + 'colour and the rule cannot show',
};

test('every break switch is seen to fail by at least one frame', (t) => {
  const caps = [...NATURAL, ...SYNTHETIC].map(([n]) => loadCapture(n)).filter(Boolean);
  if (caps.length === 0) return t.skip('no captures present');

  const blind = [];
  for (const br of BREAKS) {
    const seenBy = [];
    for (const cap of caps) {
      const { bad, lines } = diffAgainstFb(
        renderFrame(frameFromCapture(cap), tiles, out, new Set([br])), cap.fb);
      const base = diffAgainstFb(renderFrame(frameFromCapture(cap), tiles, out), cap.fb).bad;
      if (bad > base) seenBy.push(`${cap.name}:${bad}px@${lines[0]}-${lines[lines.length - 1]}`);
    }
    t.diagnostic(`--break ${br.padEnd(11)} seen by ${seenBy.join(' ') || 'NOBODY'}`);
    if (seenBy.length === 0) blind.push(br);
  }
  assert.deepStrictEqual(blind, Object.keys(KNOWN_VACUOUS).filter((k) => blind.includes(k)),
    `unexplained blind breaks: ${blind.filter((b) => !(b in KNOWN_VACUOUS)).join(', ')}`);
  for (const b of blind) assert.ok(b in KNOWN_VACUOUS, `${b} is blind and undocumented`);
});

test('the reason --break backdrop is vacuous is itself measured', (t) => {
  const caps = [...NATURAL, ...SYNTHETIC].map(([n]) => loadCapture(n)).filter(Boolean);
  if (caps.length === 0) return t.skip('no captures present');
  for (const cap of caps) {
    const zeros = [0, 4, 8, 12, 16, 20, 24, 28].map((i) => cap.pal[i]);
    assert.ok(zeros.every((v) => (v & 0x3F) === (zeros[0] & 0x3F)),
      `${cap.name}: entry-0 slots are NOT all equal (${zeros.map((v) => v.toString(16))}) `
      + '-- --break backdrop should now be discriminating, remove it from KNOWN_VACUOUS');
  }
  t.diagnostic('all 8 entry-0 palette slots identical on every capture: '
             + 'the backdrop rule is real but invisible here (NOTES-render.md 5)');
});
