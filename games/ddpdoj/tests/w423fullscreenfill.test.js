// ===============================================================================================
// W423 / W491 -- DOCKET D55. EVERY LAYOUT USES THE AVAILABLE SCREEN.
// ===============================================================================================
//
// THE OWNER: "We also definitely need a full screen mode in all configurations. Always preserve
// aspect ratio, but we need to use full possible screen of any device we're on."
//
// **THE BUTTON ALREADY EXISTED.** W268 (D10) shipped it. What it did not do was USE the screen:
// `pickScale` floors to a whole multiple, so everything between one multiple and the next stayed
// black bar. On a 2560x1440 display in tate the picture wants 6.4x and got 6x -- six percent of
// the width thrown away on one axis and, in the cases below, far more.
//
// **THE FLOOR IS NOT A MISTAKE AND IS NOT REMOVED.** It is there because of a defect reported from
// play: a fractional scale puts 1:1 pixels on non-integer device pixels, and the Batman port's
// dithered circle came out looking like tetris pieces. So:
//
//   * callers that omit `fill` are untouched, while the shipped page opts in for every layout;
//   * and `fill` STILL FLOORS BELOW 2x, because between 1x and 2x the uneven pixels differ by
//     100% (one device pixel against two), which is exactly the reported defect. Above 2x the
//     worst case is 3 against 4.
//
// SECTION 1  the windowed default is byte-identical to before
// SECTION 2  fill actually fills -- the constraining axis has NO bar left
// SECTION 3  the aspect ratio is preserved exactly, which the owner asked for FIRST
// SECTION 4  fill still floors below 2x, so the reported defect's range is unchanged
// SECTION 5  how much screen this actually recovers
// SECTION 6  the shipped page requests fill in every layout
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pickScale, PICTURES } from '../src/web/app.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = fs.readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
const MODULE = PAGE.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

// Real devices, so the numbers below mean something. w/h are CSS px, d is dpr.
const SCREENS = [
  { name: '1080p desktop', w: 1920, h: 1080, d: 1 },
  { name: '1440p desktop', w: 2560, h: 1440, d: 1 },
  { name: '4K desktop', w: 3840, h: 2160, d: 1 },
  { name: 'iPhone 14 Pro', w: 393, h: 852, d: 3 },
  { name: 'iPad Pro 11', w: 834, h: 1194, d: 2 },
  { name: 'Pixel 7', w: 412, h: 915, d: 2.625 },
];

test('SECTION 1: without fill NOTHING changes -- the whole-number scale still wins', () => {
  // This remains the non-fill API contract for callers that want integral scaling.
  for (const s of SCREENS) {
    for (const mode of ['tate', 'yoko']) {
      const pic = PICTURES[mode];
      const plain = pickScale(pic, s.w, s.h, s.d);
      assert.equal(plain.scale, Math.floor(plain.scale),
        `${s.name} ${mode}: the windowed scale is a whole number`);
      assert.equal(plain.integral, true);
      // and explicitly the OLD formula, so this cannot drift
      const old = Math.max(1, Math.floor(Math.min((s.w * s.d) / pic.w, (s.h * s.d) / pic.h)));
      assert.equal(plain.scale, old, `${s.name} ${mode}: identical to the pre-D55 arithmetic`);
    }
  }
});

test('SECTION 2: with fill the constraining axis has NO bar left', () => {
  // "use full possible screen" -- measured as: one axis is exactly the box, to
  // floating-point tolerance. Which axis is the constrained one, and it varies.
  for (const s of SCREENS) {
    for (const mode of ['tate', 'yoko']) {
      const f = pickScale(PICTURES[mode], s.w, s.h, s.d, { fill: true });
      const availW = s.w * s.d, availH = s.h * s.d;
      const tightW = Math.abs(f.deviceW - availW) < 1e-6;
      const tightH = Math.abs(f.deviceH - availH) < 1e-6;
      assert.ok(tightW || tightH,
        `${s.name} ${mode}: one axis must exactly meet the box, got `
        + `${f.deviceW}x${f.deviceH} in ${availW}x${availH}`);
      assert.ok(f.deviceW <= availW + 1e-6 && f.deviceH <= availH + 1e-6,
        `${s.name} ${mode}: and neither axis may overflow it`);
    }
  }
});

test('SECTION 3: the aspect ratio is preserved EXACTLY, in both paths', () => {
  // The owner put this first in their sentence, so it outranks filling the screen.
  // ONE scale for both axes is what guarantees it; two would stretch.
  for (const s of SCREENS) {
    for (const mode of ['tate', 'yoko']) {
      const pic = PICTURES[mode];
      for (const opts of [{}, { fill: true }]) {
        const f = pickScale(pic, s.w, s.h, s.d, opts);
        assert.ok(Math.abs((f.deviceW / f.deviceH) - (pic.w / pic.h)) < 1e-9,
          `${s.name} ${mode} fill=${!!opts.fill}: aspect held`);
        assert.ok(Math.abs(f.deviceW - pic.w * f.scale) < 1e-9, 'width is scale x pic.w');
        assert.ok(Math.abs(f.deviceH - pic.h * f.scale) < 1e-9, 'height is scale x pic.h');
      }
    }
  }
});

test('SECTION 4: fill still FLOORS below 2x -- the reported defect keeps its range', () => {
  // Between 1x and 2x a fractional scale makes some source pixels one device pixel
  // wide and others two. That 100% difference IS the tetris-pieces defect, and no
  // amount of screen is worth reintroducing it.
  const pic = PICTURES.tate;
  // a box that wants ~1.5x
  const w = Math.floor(pic.w * 1.5), h = Math.floor(pic.h * 1.9);
  const f = pickScale(pic, w, h, 1, { fill: true });
  assert.equal(f.scale, 1, 'a 1.5x box still gets 1x, exactly as before D55');
  assert.equal(f.integral, true);
  // and the boundary itself is inclusive: exactly 2x is allowed to fill
  const f2 = pickScale(pic, pic.w * 2, pic.h * 2, 1, { fill: true });
  assert.equal(f2.scale, 2, 'exactly 2x fills at 2x');
  // just under 2 floors to 1, just over 2 is fractional
  assert.equal(pickScale(pic, pic.w * 1.99, pic.h * 4, 1, { fill: true }).scale, 1);
  assert.ok(pickScale(pic, pic.w * 2.5, pic.h * 4, 1, { fill: true }).scale > 2);
});

test('SECTION 5: this recovers real screen, and the numbers are the reason D55 exists', () => {
  // Not an assertion of taste: the point of the item is that the old path wasted
  // area. At least one real screen must gain a lot, or the change is not worth
  // the fractional pixels it costs.
  let best = { name: null, gain: 0 };
  for (const s of SCREENS) {
    for (const mode of ['tate', 'yoko']) {
      const pic = PICTURES[mode];
      const a = pickScale(pic, s.w, s.h, s.d);
      const b = pickScale(pic, s.w, s.h, s.d, { fill: true });
      const gain = (b.deviceW * b.deviceH) / (a.deviceW * a.deviceH) - 1;
      assert.ok(gain >= -1e-9, `${s.name} ${mode}: fill is never SMALLER than the floor`);
      if (gain > best.gain) best = { name: `${s.name} ${mode}`, gain };
    }
  }
  assert.ok(best.gain > 0.20,
    `the best case must recover real area; best was ${best.name} at `
    + `${(best.gain * 100).toFixed(1)}%`);
});

test('SECTION 6: the shipped page asks for fill in every layout', () => {
  assert.match(MODULE, /fitCanvas\(canvas, stage, mode, \{ fill: true \}\)/,
    'the page always uses the aspect-preserving fill path');
  assert.doesNotMatch(MODULE, /fill:\s*isFull\(\)/,
    'viewport use no longer depends on fullscreen state');
});

test('SECTION 6: fullscreen transitions still refit', () => {
  // Escape and browser fullscreen controls still change the available stage box.
  assert.match(MODULE,
    /document\.addEventListener\(ev, \(\) => \{ paintFull\(\); fit\(\); applyLock\(\); \}\)/,
    'the fullscreenchange path still calls fit()');
});
