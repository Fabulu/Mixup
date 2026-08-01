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
import {
  Capture, shadowProject, ATTACH_MIN_SCORE, ATTACH_MIN_FRAMES,
} from '../src/render/capture.js';
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
// Identified by COLOUR, never by list index -- the display list is rebuilt from
// scratch every frame and a slot is not an identity (00-recon-memmap.md). The
// fixture below reproduces that: a record that is not on screen is simply not
// in the list, so every index shifts.
const C = { SHIP: 0, POD: 0, EXHAUST: 2, SHADOW: 24, DECOY: 9, RARE: 11 };

/**
 * A synthetic capture with one of every failure mode the real one has:
 *
 *   SHIP     rigid, every frame
 *   POD      rigid, every frame, same colour as the ship but flipped
 *   EXHAUST  rigid, ODD frames only    -- the flicker the presence test missed
 *   SHADOW   GROUND plane, EVEN frames -- not at a constant offset AT ALL
 *   DECOY    its own path, every frame -- must never be accepted
 *   RARE     rigid and perfect, but present on 2 frames -- the minimum sample
 */
function syntheticCapture(n = 40) {
  const SLOTS = 8;                              // room for the list + terminator
  const frameBytes = SLOTS * STRIDE * 2;
  const bin = new Uint8Array(n * frameBytes);
  const frameList = [];
  for (let i = 0; i < n; i++) {
    // BOTH axes move, so `ground` and `rigid` are actually distinguishable --
    // in the real capture the ship's X never moved and they are not.
    const py = 64 * (40 + i * 3), px = 64 * (60 + (i % 7) * 5);
    const cy = py >> 6, cx = px >> 6;
    const g = shadowProject(py, px);
    const list = [
      [cy - 24, cx - 16, 3, 32, C.SHIP, 0],
      [cy - 16, cx + 24, 2, 16, C.POD, 2],
    ];
    // ABSENT means ABSENT: not in the list at all, so the slots behind it move.
    if (i % 2) list.push([cy - 52, cx - 20, 5, 40, C.EXHAUST, 0]);
    else list.push([g.x, g.y + 20, 1, 8, C.SHADOW, 0]);
    list.push([300 + i * 7, 150 + i, 4, 24, C.DECOY, 0]);
    if (i < 2) list.push([cy - 70, cx + 70, 2, 48, C.RARE, 0]);

    const base = i * frameBytes;
    list.forEach(([x, y, w, h, color, flip], r) => {
      const o = base + r * STRIDE * 2;
      const wr = (k, v) => { bin[o + k * 2] = (v >> 8) & 0xff; bin[o + k * 2 + 1] = v & 0xff; };
      wr(0, x & 0x07ff); wr(1, y & 0x03ff);
      wr(2, ((flip & 3) << 13) | ((color & 0x1f) << 8)); wr(3, 0);
      wr(4, ((w & 0x3f) << 9) | (h & 0x1ff));
    });                                          // the rest stays zero = the
                                                 // terminator (word4 & $7FFF)
    frameList.push({ lf: 2000 + i, vf: 2000 + i, py, px,
      refPy: py, refPx: px, refLf: 1999 + i, regs: {},
      player: [[0, -24, -16], [1, -16, 24]] });   // what the packer would accept
  }
  return new Capture({
    layout: [['spritebuffer', SLOTS * STRIDE * 2]], frameBytes, frameList,
    shipCorrelation: { lag: 1, conversion: 'shift',
      accepted: [{ off: '-24,-16', hits: n }, { off: '-16,24', hits: n }] },
  }, bin);
}

/** The parsed record of `colour` (and optionally flip) in one frame. */
const recOf = (cap, frame, color, flip = 0) =>
  parseSpriteList(cap.part(frame, 'spritebuffer'))
    .find((s) => s.color === color && s.flip === flip);

/** Its row in the matcher's report. */
const verdictOf = (cap, frame, color, flip = 0) => {
  const rec = recOf(cap, frame, color, flip);
  assert.ok(rec, `no colour-${color} flip-${flip} record in frame ${frame}`);
  return cap.attachmentReport()
    .find((r) => r.cls === `${rec.width}x${rec.height} c${rec.color} p${rec.pri} f${rec.flip}`);
};
/** Is the record of `colour` spliced in frame `i`? */
const splicedColor = (cap, i, color, flip = 0) => {
  const rec = recOf(cap, i, color, flip);
  return !!rec && cap.attached()[i].some(([r]) => r === rec.i);
};

// ---- the ground plane, against the listing --------------------------------

test('shadowProject is $249EA0..$249EBC, not a curve fit', () => {
  // Hand-worked from the listing, and cross-checked against the board's own
  // shadow record on 81 of 81 frames (worklog §"the shadows"):
  //   sx = ((px - $1C00) asr 1) + $1C00 ; sy = ((py - $1400) asr 1) + $1400
  //   then ONE addi.l #$FE00FE00, then asr.l #6.
  assert.deepEqual(shadowProject(0x1179, 0x14c0), { x: 66, y: 89 });
  assert.deepEqual(shadowProject(0x36f3, 0x14c0), { x: 141, y: 89 });
  assert.deepEqual(shadowProject(0x6500, 0x14c0), { x: 234, y: 89 });
  // ...and it HALVES the short axis too, which the capture could never show
  // because the recorded ship's X never moved. The listing is the only witness.
  assert.notEqual(shadowProject(0x6500, 0x300).y, shadowProject(0x6500, 0x3500).y);
  assert.deepEqual(shadowProject(0x800, 0x300), { x: 48, y: 54 });
  assert.deepEqual(shadowProject(0x6500, 0x3500), { x: 234, y: 154 });
});

// ---- the conditional test --------------------------------------------------

test('a record that FLICKERS is accepted: presence is not the question', () => {
  const cap = syntheticCapture(40);
  const v = verdictOf(cap, 1, C.EXHAUST);
  assert.equal(v.verdict, 'ACCEPT');
  assert.equal(v.present, 20, 'present on half the frames');
  assert.equal(v.score, 1, 'and at its offset on every one of them');
  assert.equal(v.phase, 'ODD');
  // The OLD question -- "present at a constant offset in >= 90% of frames" --
  // scores this 50%, which is how it was missed for two waves.
  assert.ok(v.present / cap.length < 0.9);
});

test('a GROUND-PLANE record is accepted, and never as `rigid`', () => {
  const cap = syntheticCapture(40);
  const v = verdictOf(cap, 0, C.SHADOW);
  assert.equal(v.verdict, 'ACCEPT');
  assert.equal(v.model, 'ground', 'a shadow is not at a constant offset');
  assert.deepEqual([v.dx, v.dy], [0, 20]);
  assert.equal(v.score, 1);
  assert.equal(v.phase, 'EVEN');
});

test('the exhaust and the shadow INTERLEAVE, and both are still accepted', () => {
  const cap = syntheticCapture(40);
  assert.ok(splicedColor(cap, 1, C.EXHAUST), 'odd frame: the exhaust is spliced');
  assert.ok(!recOf(cap, 1, C.SHADOW), 'odd frame: no shadow in the list at all');
  assert.ok(splicedColor(cap, 0, C.SHADOW), 'even frame: the shadow is spliced');
  assert.ok(!recOf(cap, 0, C.EXHAUST), 'even frame: no exhaust in the list at all');
});

test('a record on its OWN path is rejected however long it lasts', () => {
  const cap = syntheticCapture(40);
  const v = verdictOf(cap, 0, C.DECOY);
  assert.equal(v.verdict, 'reject');
  assert.equal(v.present, 40, 'present on EVERY frame and still rejected');
  assert.ok(v.score < ATTACH_MIN_SCORE);
  for (let i = 0; i < cap.length; i++) {
    assert.ok(!splicedColor(cap, i, C.DECOY), `frame ${i} spliced the decoy`);
  }
});

test('a perfect match on too few frames is rejected on SAMPLE, not score', () => {
  const cap = syntheticCapture(40);
  const v = verdictOf(cap, 0, C.RARE);
  assert.equal(v.score, 1, 'it really is at a constant offset whenever present');
  assert.equal(v.present, 2);
  assert.equal(v.verdict, `sample<${ATTACH_MIN_FRAMES}`);
  assert.ok(!splicedColor(cap, 0, C.RARE));
});

test('the matcher REPORTS what it rejected, not only what it took', () => {
  const rep = syntheticCapture(40).attachmentReport();
  assert.ok(rep.length >= 6, 'every class must appear in the report');
  const rejected = rep.filter((r) => r.verdict !== 'ACCEPT');
  assert.ok(rejected.length >= 2, 'rejects must be reported, they are findings');
  for (const r of rep) {
    assert.equal(typeof r.score, 'number');
    assert.ok(r.phase, 'every row must carry its presence phase');
  }
});

test('the accepted set is a strict SUPERSET of the packer\'s', () => {
  const cap = syntheticCapture(40);
  const att = cap.attached();
  for (let i = 0; i < cap.length; i++) {
    const derived = new Set(att[i].map(([r]) => r));
    for (const [r] of cap.frames[i].player) {
      assert.ok(derived.has(r), `frame ${i}: record ${r} was accepted by the `
        + 'packer and dropped by the matcher');
    }
  }
});

// ---- what splice may and may not touch ------------------------------------

test('splice moves ONLY the position words, so the image and ORDER survive',
  () => {
    const cap = syntheticCapture(40);
    const st = { spritebuffer: cap.part(1, 'spritebuffer') };
    const before = Array.from(st.spritebuffer);
    const orderBefore = parseSpriteList(cap.part(1, 'spritebuffer'))
      .map((s) => [s.i, s.color, s.flip, s.pri]);
    const n = cap.splice(st, 1, 64 * 200, 64 * 90);
    assert.equal(n, 3, 'ship + pod + exhaust on an odd frame');
    for (let r = 0; r < 8; r++) {
      for (let k = 2; k < STRIDE; k++) {
        assert.equal(st.spritebuffer[r * STRIDE + k], before[r * STRIDE + k],
          `record ${r} word ${k} was rewritten; only words 0 and 1 may move`);
      }
    }
    // A HIGHER list index draws IN FRONT on this hardware, so a shadow that
    // changed places with the ship would be drawn over it. splice rewrites
    // records in place and appends nothing, so the order must be invariant.
    const after = parseSpriteList(st.spritebuffer)
      .map((s) => [s.i, s.color, s.flip, s.pri]);
    assert.deepEqual(after, orderBefore,
      'the display-list order or a pri bit moved; a shadow could now draw in front');
  });

test('a GROUND record is drawn BEHIND the ship before and after splicing', () => {
  const cap = syntheticCapture(40);
  const st = { spritebuffer: cap.part(0, 'spritebuffer') };
  const shadow = recOf(cap, 0, C.SHADOW), ship = recOf(cap, 0, C.SHIP, 0);
  // the fixture puts the shadow AFTER the ship, i.e. in front -- so this test
  // is really checking that splice does not CHANGE whatever the board chose.
  const relBefore = Math.sign(shadow.i - ship.i);
  cap.splice(st, 0, 64 * 200, 64 * 120);
  const list = parseSpriteList(st.spritebuffer);
  const s2 = list.find((s) => s.color === C.SHADOW);
  const p2 = list.find((s) => s.color === C.SHIP && s.flip === 0);
  assert.equal(Math.sign(s2.i - p2.i), relBefore,
    'splicing changed which of the shadow and the ship draws in front');
});

test('splice puts a GROUND record where shadowProject says, not at an offset',
  () => {
    const cap = syntheticCapture(40);
    const st = { spritebuffer: cap.part(0, 'spritebuffer') };
    const py = 64 * 200, px = 64 * 120;
    const idx = recOf(cap, 0, C.SHADOW).i;
    cap.splice(st, 0, py, px);
    const g = shadowProject(py, px);
    const rec = parseSpriteList(st.spritebuffer).find((s) => s.i === idx);
    assert.equal(rec.x, g.x);
    assert.equal(rec.y, g.y + 20);
    // ...and NOT where a rigid splice would have put it.
    assert.notEqual(rec.x, py >> 6);
    assert.ok(Math.abs(rec.x - (py >> 6)) > 50,
      'ground and rigid must be visibly different here, or the test proves nothing');
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

// WAVE 12 INVERTS BOTH OF THEM, because $24C096 is now run and the claim is
// true.  The DISCIPLINE does not invert: a claim on this page has to name the
// gate that would catch it being wrong.  So the tests below do not check that
// the page says the pods are computed -- they check that wherever it says so,
// it names `shipgate`, and that `type5.js` really calls the routine.  That is
// the check that would have caught 07-review.md D1 in the first place.

test('if the page claims the pods are computed, it names the gate', () => {
  for (const rel of ['index.html', 'src/web/app.js']) {
    const text = read(rel);
    if (/option (pods?|object)[^.]{0,120}(computed|PRODUCED|ported)/i.test(text)) {
      assert.match(text, /shipgate/,
        `${rel} claims the option pods are computed and does not name the gate `
        + 'that proves it. 07-review.md D1 was exactly this, the other way up.');
    }
  }
});

test('the claim is backed by code: type5.js really calls $24C096', () => {
  const text = read('src/type5.js');
  assert.match(text, /runOptionObject\(ram, ctx\)/,
    'object type 5 must actually run the option object, not count it');
  assert.match(text, /TYPE5_PORTED/,
    'the set of RUN calls must be named, so the count in the comment cannot rot');
});

test('nothing claims the ship cannot bank any more', () => {
  // `render/capture.js` predicted the fix ("a one-field change to the exporter
  // and a later wave's job"); wave 12 made it, so the prediction must not still
  // be sitting on the page as a limitation.
  const html = read('index.html');
  assert.ok(!/ship does NOT bank/i.test(html));
  assert.match(html, /The ship banks/i);
  assert.match(html, /17 rebased/i,
    'the page must say where the bank images come from, not just that they work');
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

// WAVE 12 MOVED THE HELD-FIRE TESTS TO `tests/ship.test.js`, where the option
// object now lives, and DELETED the two that asserted the wrong gate.  The
// deleted pair is quoted in `docs/worklog/ddpdoj/12-impl-ship-fully-real.md`
// because it is what a wrong check looks like while it passes:
//
//   'the laser ramp guard trips on the FOURTH held frame, not the first'
//   'the guard does not trip when the ramp is already at its floor'
//
// Both were true of the port and false of the board.  10-recon-combat §2
// measured the board's own gate -- `$24C164 btst #4,($40,A6)` on the RAW HELD
// byte `$24C134` copies in, entered on the FIRST held frame, with no
// speed-index condition anywhere -- and the second test was an assertion that
// the exact failure the throw existed to prevent WOULD happen.

test('the old wave-9 predicate is no longer a gate on anything', () => {
  // Kept and pinned rather than deleted: the ramp it describes is real
  // ($24C8BE down / $24C8E4 up, measured 22->12 one step per four frames), and
  // options.js ports the UP half.  What is gone is its use as the laser's
  // trigger -- so these two lines are a statement about the ramp, not about
  // when the laser starts.
  assert.equal(TYPE5.laserRampFrames, 4);
  assert.equal(laserRampWouldMove(3, 22, 12), false);
  assert.equal(laserRampWouldMove(4, 22, 12), true);
  assert.equal(laserRampWouldMove(40, 12, 12), false,
    'at the floor the DOWN ramp is a no-op ($24C8C2 cmp.b ($38,A4),D0 / beq)');
});

test('the option object is the call the guard is attached to', () => {
  assert.equal(TYPE5.optionObject, 0x24c096);
  assert.ok(TYPE5.calls.includes(TYPE5.optionObject),
    '$24C096 must be one of object type 5\'s 23 jsr targets');
  assert.equal(TYPE5.laserRampDown, 0x24c8be);
});
