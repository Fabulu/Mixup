// WAVE 9 -- the page's ARITHMETIC, its SPLICE and its CLAIMS.
//
// Everything here runs on SYNTHETIC data and on the repo's own source text, so
// `node --test games/ddpdoj/tests/` still works on a tree with no cartridge
// extracted -- the same rule tests/render.test.js and tests/shots.test.js state
// for themselves. What these CANNOT do is prove the page looks right in a
// browser; there is no browser on this machine and that gap is written down in
// docs/worklog/ddpdoj/09-impl-tate-and-honest-page.md rather than papered over.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pickScale, PICTURES, MODES, DEFAULT_MODE } from '../src/web/app.js';
import { Capture, ATTACH_MIN_FRACTION } from '../src/render/capture.js';
import { parseSpriteList } from '../src/render/spritelist.js';
import { laserRampWouldMove, TYPE5 } from '../src/type5.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(HERE, '..', rel), 'utf8');

// ============================================================ 1. THE SCALING
//
// The one piece of the layout that is arithmetic and not CSS. A FRACTIONAL
// scale is the defect: it puts the canvas's 1:1 pixels on non-integer device
// pixels and the browser resamples them, which shipped on the Batman port as a
// dithered circle that looked like tetris pieces and was reported from play.
//
// The rotation must not reintroduce it. It cannot, because the rotation is done
// in the PIXEL BUFFER -- the canvas is 224x448 in tate and 448x224 in yoko and
// there is no CSS transform -- and this is the test that says so out loud.

const DPRS = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.625, 3, 3.5];
const VIEWPORTS = [                      // CSS px, w x h
  [320, 568], [360, 640], [375, 667], [390, 844], [412, 915], [428, 926],
  [768, 1024], [820, 1180], [1280, 720], [1440, 900], [1920, 1080],
  [844, 390], [926, 428], [667, 375],   // the same phones, landscape
];

test('the chosen scale is a WHOLE NUMBER of device pixels in BOTH orientations',
  () => {
    let checked = 0;
    for (const mode of MODES) {
      const pic = PICTURES[mode];
      for (const dpr of DPRS) {
        for (const [w, h] of VIEWPORTS) {
          const f = pickScale(pic, w, h, dpr);
          assert.ok(Number.isInteger(f.scale) && f.scale >= 1,
            `${mode} ${w}x${h}@${dpr}: scale ${f.scale} is not a whole number`);
          assert.equal(f.deviceW, pic.w * f.scale);
          assert.equal(f.deviceH, pic.h * f.scale);
          // THE ROUND TRIP: the CSS box, put back into device pixels, must land
          // exactly on the integer multiple. This is the property that fails
          // when somebody "fixes" the floor into a percentage.
          assert.equal(Math.round(f.cssW * dpr), f.deviceW,
            `${mode} ${w}x${h}@${dpr}: cssW ${f.cssW} * ${dpr} is not ${f.deviceW}`);
          assert.equal(Math.round(f.cssH * dpr), f.deviceH);
          checked++;
        }
      }
    }
    assert.ok(checked === MODES.length * DPRS.length * VIEWPORTS.length);
  });

test('the picture FITS the container whenever it can at 1:1', () => {
  for (const mode of MODES) {
    const pic = PICTURES[mode];
    for (const dpr of DPRS) {
      for (const [w, h] of VIEWPORTS) {
        const f = pickScale(pic, w, h, dpr);
        if (f.scale === 1 && (w * dpr < pic.w || h * dpr < pic.h)) continue;
        assert.ok(f.deviceW <= w * dpr + 1e-9,
          `${mode} ${w}x${h}@${dpr}: ${f.deviceW} device px wide > ${w * dpr}`);
        assert.ok(f.deviceH <= h * dpr + 1e-9,
          `${mode} ${w}x${h}@${dpr}: ${f.deviceH} device px tall > ${h * dpr}`);
      }
    }
  }
});

test('TATE is 224x448, WIDE is 448x224, and TATE is the default', () => {
  assert.deepEqual([PICTURES.tate.w, PICTURES.tate.h], [224, 448]);
  assert.deepEqual([PICTURES.yoko.w, PICTURES.yoko.h], [448, 224]);
  assert.equal(PICTURES.tate.rotate, true);
  assert.equal(PICTURES.yoko.rotate, false);
  assert.equal(DEFAULT_MODE, 'tate');
  // A phone in portrait must get a much bigger picture in TATE than in WIDE --
  // this is the whole point of the mode, expressed as a number.
  const t = pickScale(PICTURES.tate, 390, 844, 3);
  const y = pickScale(PICTURES.yoko, 390, 844, 3);
  assert.ok(t.deviceW * t.deviceH > 3 * y.deviceW * y.deviceH,
    `tate ${t.deviceW}x${t.deviceH} is not >3x the area of wide ${y.deviceW}x${y.deviceH}`);
});

test('a container smaller than the picture still gets scale 1, never a fraction',
  () => {
    const f = pickScale(PICTURES.tate, 100, 100, 1);
    assert.equal(f.scale, 1);
    assert.equal(f.deviceW, 224);
    // ...and a nonsense dpr does not produce NaN or 0.
    assert.equal(pickScale(PICTURES.tate, 390, 844, 0).scale >= 1, true);
  });

// ======================================================== 2. THE SPLICE SET
//
// Wave 7 spliced the three records `pixpack.mjs --min-hit 0.9` accepted. The
// player's EXHAUST appears on alternate frames only, scores ~50 %, and was
// rejected -- so it stayed on the recorded ship's path and flew off across the
// screen. This builds a capture with exactly that shape and proves the
// re-derivation catches it while the packer's own list does not.

const STRIDE = 8;

/** A synthetic capture: N frames, a ship at a fixed offset every frame and an
 *  exhaust record at a fixed offset on ODD frames only, plus a decoy that
 *  moves independently. */
function syntheticCapture(n = 40) {
  const recs = 4;
  const frameWords = recs * STRIDE;
  const layout = [['spritebuffer', frameWords * 2]];
  const frameBytes = frameWords * 2;
  const bin = new Uint8Array(n * frameBytes);
  const frameList = [];
  const put = (fi, r, x, y, w, h) => {
    const o = fi * frameBytes + r * STRIDE * 2;
    const wr = (k, v) => { bin[o + k * 2] = (v >> 8) & 0xff; bin[o + k * 2 + 1] = v & 0xff; };
    wr(0, x & 0x07ff); wr(1, y & 0x03ff); wr(2, 0); wr(3, 0);
    wr(4, ((w & 0x3f) << 9) | (h & 0x1ff));
  };
  for (let i = 0; i < n; i++) {
    const py = 64 * (40 + i * 3), px = 64 * 90;      // the board's ship, moving
    const cy = py >> 6, cx = px >> 6;
    put(i, 0, cy - 24, cx - 16, 3, 32);              // SHIP,   every frame
    put(i, 1, cy - 16, cx + 24, 2, 16);              // POD,    every frame
    if (i % 2) put(i, 2, cy - 52, cx - 20, 5, 40);   // EXHAUST, odd frames
    else put(i, 2, 700 + i, 200, 5, 40);             // ...parked far away
    put(i, 3, 300 + i * 7, 150 + i, 2, 16);          // decoy: its own path
    frameList.push({ lf: 2000 + i, vf: 2000 + i, py, px,
      refPy: py, refPx: px, refLf: 2000 + i - 1,
      regs: {}, player: [[0, -24, -16], [1, -16, 24]] });
  }
  return new Capture({
    layout, frameBytes, frameList,
    shipCorrelation: { lag: 1, conversion: 'shift',
      accepted: [{ off: '-24,-16', hits: n }, { off: '-16,24', hits: n }] },
  }, bin);
}

test('the re-derived splice set is a strict SUPERSET of the packer\'s', () => {
  const cap = syntheticCapture(40);
  const att = cap.attached();
  for (let i = 0; i < cap.length; i++) {
    const packer = new Set(cap.frames[i].player.map(([r]) => r));
    const derived = new Set(att[i].map(([r]) => r));
    for (const r of packer) {
      assert.ok(derived.has(r), `frame ${i}: record ${r} was accepted by the `
        + 'packer and dropped by the re-derivation');
    }
  }
  // ...and on the ODD frames it has the exhaust the packer missed.
  assert.equal(att[0].length, 2, 'even frame: ship + pod');
  assert.equal(att[1].length, 3, 'odd frame: ship + pod + exhaust');
  assert.ok(att[1].some(([r, dx, dy]) => r === 2 && dx === -52 && dy === -20),
    'the alternate-frame exhaust record was not picked up');
});

test('a record on its OWN path is never spliced, however many frames it lasts',
  () => {
    const cap = syntheticCapture(40);
    for (const frame of cap.attached()) {
      assert.ok(!frame.some(([r]) => r === 3),
        'the decoy, which moves independently, was accepted as player-attached');
    }
  });

test('the acceptance threshold sits in the measured GAP, not on a cliff', () => {
  // The real capture: five real offsets at 161/161, 161/161, 161/161, 81/161
  // and 80/161, and the best impostor at 41/161. 0.45 of 161 = 72.45.
  assert.ok(ATTACH_MIN_FRACTION < 80 / 161,
    'the threshold would reject the 80/161 exhaust glow');
  assert.ok(ATTACH_MIN_FRACTION > 41 / 161,
    'the threshold would accept the 41/161 impostor');
});

test('splice moves ONLY the position words, so the drawn image is untouched',
  () => {
    const cap = syntheticCapture(8);
    const st = { spritebuffer: cap.part(1, 'spritebuffer') };
    const before = Array.from(st.spritebuffer);
    const n = cap.splice(st, 1, 64 * 200, 64 * 90);
    assert.equal(n, 3, 'ship + pod + exhaust');
    for (let r = 0; r < 4; r++) {
      for (let k = 2; k < STRIDE; k++) {
        assert.equal(st.spritebuffer[r * STRIDE + k], before[r * STRIDE + k],
          `record ${r} word ${k} was rewritten; only words 0 and 1 may move`);
      }
    }
    // the list still parses: nothing became a terminator
    assert.equal(parseSpriteList(st.spritebuffer).length, 4);
  });

test('records: "packer" reproduces wave 7 exactly', () => {
  const cap = syntheticCapture(8);
  const st = { spritebuffer: cap.part(1, 'spritebuffer') };
  assert.equal(cap.splice(st, 1, 64 * 200, 64 * 90, { records: 'packer' }), 2);
});

// ============================================== 3. THE PAGE'S OWN CLAIMS
//
// 07-review.md D1: the banner said the ship's "two option pods are computed
// live, by the port" and app.js listed "options" under SIMULATED. Neither was
// true -- the option object $24C096 is one of type5.js's 22 counted-not-run
// calls -- and it took a play session to notice. These are cheap string checks
// and they are here because THIS is the class of defect this page exists to
// avoid, and a comment asking the next author to be careful has not worked.

test('nothing claims the option pods are computed live', () => {
  for (const rel of ['index.html', 'src/web/app.js']) {
    const text = read(rel);
    assert.ok(!/option pods?[^.]{0,80}computed\s+live/i.test(text),
      `${rel} still claims the option pods are computed live`);
  }
});

test('app.js\'s SIMULATED list does not contain the options', () => {
  const text = read('src/web/app.js');
  const sim = text.slice(text.indexOf('SIMULATED, live'), text.indexOf('REPLAYED, from'));
  assert.ok(sim.length > 200, 'the SIMULATED block moved; fix this test with it');
  assert.ok(!/\boptions\b/.test(sim),
    'app.js lists "options" under SIMULATED and the option object is unported');
});

test('the error box says NOT PORTED YET when the message names an address', () => {
  const html = read('index.html');
  assert.match(html, /NOT PORTED YET/,
    'a correct stop that does not say it is a correct stop reads as a crash');
  assert.match(html, /console\.error/, 'the console trace must be kept');
});

test('the page says the enemies are a recording and cannot be hit', () => {
  const html = read('index.html');
  assert.match(html, /cannot\s+see\s+you\s+and\s+cannot\s+be\s+shot/i);
  assert.match(html, /161\s+captured\s+frames/);
});

// ==================================================== 4. THE LASER GUARD
//
// A play report: holding fire did nothing, threw nothing and froze nothing.
// The held bit arrives and the cadence machine correctly reads the EDGE; what
// the board ALSO does on a hold is the laser speed ramp at $24C8BE, inside the
// unported option object, and the port ran straight past it in silence.

test('the laser ramp guard trips on the FOURTH held frame, not the first', () => {
  assert.equal(TYPE5.laserRampFrames, 4);
  for (let held = 0; held < 4; held++) {
    assert.equal(laserRampWouldMove(held, 22, 12), false,
      `a ${held}-frame tap must not trip it: the board's ($4b,A6) counter `
      + 'reloads to 4 and a tap never moves ($1a,A4)');
  }
  assert.equal(laserRampWouldMove(4, 22, 12), true);
  assert.equal(laserRampWouldMove(40, 22, 12), true);
});

test('the guard does not trip when the ramp is already at its floor', () => {
  // $24C8C2 `cmp.b ($38,A4),D0 / beq` -- the DOWN ramp is a no-op there, so a
  // port sitting at the floor is not diverging by standing still.
  assert.equal(laserRampWouldMove(40, 12, 12), false);
});

test('the option object is the call the guard is attached to', () => {
  assert.equal(TYPE5.optionObject, 0x24c096);
  assert.ok(TYPE5.calls.includes(TYPE5.optionObject),
    '$24C096 must be one of object type 5\'s 23 jsr targets');
  assert.equal(TYPE5.laserRampDown, 0x24c8be);
});
