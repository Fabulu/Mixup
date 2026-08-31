// WAVE 9 -- the page's ARITHMETIC, its SPLICE and its CLAIMS.
//
// Everything here runs on SYNTHETIC data and on the repo's own source text, so
// `node --test games/ddpdoj/tests/` still works on a tree with no cartridge
// extracted -- the same rule tests/render.test.js and tests/shots.test.js state
// for themselves. What these CANNOT do is prove the page looks right in a
// browser.
//
// THE REASON THIS FILE USED TO GIVE FOR THAT WAS WRONG, AND W37 MEASURED IT:
// it said "there is no browser on this machine". There is -- Chrome and Edge
// are both installed and the Python `playwright` package is present, nothing
// downloaded -- and W37 drove this very page in it, flew the ship and read the
// status line back out of the DOM (42-impl-strip-capture-enemies.md §3). The
// real reason these tests stay synthetic is the one above: the SUITE must run
// without a cartridge. A browser-driven PLAYABILITY gate is a separate thing
// and is now known to be buildable.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  pickScale, PICTURES, MODES, DEFAULT_MODE, stripToAttached,
  portSpriteList, romToPackedMap, namedMisses, PORT_LIST_WORDS,
  PORT_LIST_MUTATIONS, SPRITE_SOURCES, DEFAULT_SPRITE_SOURCE,
} from '../src/web/app.js';
import { Ram } from '../src/ram.js';
import { RAM } from '../src/machine.js';
import { FILLER } from '../src/displaylist.js';
import { RAM_STRIDE } from '../src/render/spritelist.js';
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
function syntheticCapture(n = 40, { decoyFirst = false } = {}) {
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
    const list = [];
    // WAVE 37.  `decoyFirst` puts an UNATTACHED record in slot 0, which is what
    // the real capture looks like -- the ship is nowhere near the front of the
    // board's list -- and it is what makes the strip's ORDER testable.  Strip
    // before the splice with everything already at the front and the mutation
    // is invisible; strip before the splice here and the splice writes the
    // ship's position into the decoy's old slot.
    if (decoyFirst) list.push([300 + i * 7, 150 + i, 4, 24, C.DECOY, 0]);
    list.push([cy - 24, cx - 16, 3, 32, C.SHIP, 0]);
    list.push([cy - 16, cx + 24, 2, 16, C.POD, 2]);
    // ABSENT means ABSENT: not in the list at all, so the slots behind it move.
    if (i % 2) list.push([cy - 52, cx - 20, 5, 40, C.EXHAUST, 0]);
    else list.push([g.x, g.y + 20, 1, 8, C.SHADOW, 0]);
    if (!decoyFirst) list.push([300 + i * 7, 150 + i, 4, 24, C.DECOY, 0]);
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
    const s0 = decoyFirst ? 1 : 0;                // the ship's slot
    frameList.push({ lf: 2000 + i, vf: 2000 + i, py, px,
      refPy: py, refPx: px, refLf: 1999 + i, regs: {},
      player: [[s0, -24, -16], [s0 + 1, -16, 24]] });  // what the packer accepts
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

// ================================ 2b. WAVE 37 -- THE RECORDED ENEMIES COME OFF
//
// The OWNER's decision (39-OWNER-visible-play-before-sound.md): "we have to get
// rid of the recorded enemies, they look retarded", then "go removal first".
// `stripToAttached` keeps the eight player-attached records and throws the rest
// of the recording's display list away, in the PAGE and never in the exporter.
//
// WHAT THESE CAN AND CANNOT SAY.  They run on the synthetic capture above, so
// they prove the STRIP's behaviour -- what survives, in what order, where the
// list ends, and that it is ordered after the splice -- on a tree with no
// cartridge.  They CANNOT say the real bundle goes from 7,671 records to 886;
// that needs `games/ddpdoj/assets/`, which is gitignored, and it is asserted by
// `tools/webgate.mjs` instead, which hard-fails rather than skipping when the
// bundle is missing.

test('the strip keeps the ATTACHED records and nothing else', () => {
  const cap = syntheticCapture(40, { decoyFirst: true });
  for (const fi of [0, 1, 8, 9]) {
    const st = { spritebuffer: cap.part(fi, 'spritebuffer') };
    const before = parseSpriteList(st.spritebuffer);
    const att = cap.attached()[fi];
    const r = stripToAttached(st, att);
    const after = parseSpriteList(st.spritebuffer);

    assert.equal(r.kept, att.length, `frame ${fi}: kept != |attached|`);
    assert.equal(r.removed, before.length - att.length);
    assert.equal(after.length, att.length,
      `frame ${fi}: the list must END after the survivors, not run on into the `
      + 'recording -- the terminator is word4 & $7FFF == 0');
    // THE DECOY IS THE POINT.  It is present on every frame, on its own path,
    // and it is what "a recorded enemy" means in this fixture.
    assert.ok(!after.some((s) => s.color === C.DECOY),
      `frame ${fi}: a rejected record survived the strip`);
    // ...and the accepted ones did survive, BY CLASS and in ORDER. A higher
    // list index draws IN FRONT (spritelist.js), so a reorder here would put a
    // ground shadow on top of the ship.
    const cls = (s) => `${s.width}x${s.height} c${s.color} p${s.pri} f${s.flip}`;
    assert.deepEqual(after.map(cls),
      att.map(([i]) => cls(before.find((s) => s.i === i))),
      `frame ${fi}: the survivors changed order`);
    // The survivors' WORDS are the originals, byte for byte -- the strip moves
    // records, it never edits one.
    for (const [k, [idx]] of att.entries()) {
      assert.deepEqual(after[k].raw, before.find((s) => s.i === idx).raw);
    }
  }
});

test('the strip runs AFTER the splice, and BEFORE is the red mutation', () => {
  const cap = syntheticCapture(40, { decoyFirst: true });
  const fi = 8, py = 64 * 200, px = 64 * 90;
  const shipAt = (buf) => parseSpriteList(buf)
    .find((s) => s.width === 3 && s.height === 32);

  // THE ORDER THE PAGE USES: splice, then strip.
  const good = { spritebuffer: cap.part(fi, 'spritebuffer') };
  cap.splice(good, fi, py, px);
  stripToAttached(good, cap.attached()[fi]);
  const ok = shipAt(good.spritebuffer);
  assert.ok(ok, 'the ship must survive the strip');
  assert.equal(ok.x, (py >> 6) - 24, 'the ship must be where the PORT put it');
  assert.equal(ok.y, (px >> 6) - 16);

  // THE MUTATION: strip FIRST. `splice` addresses records by their index in the
  // ORIGINAL list, so after compaction those indices name different records --
  // the ship's position is written into whatever moved into its old slot, and
  // the ship itself is left wherever the recording had it. Seen to fail.
  const bad = { spritebuffer: cap.part(fi, 'spritebuffer') };
  stripToAttached(bad, cap.attached()[fi]);
  cap.splice(bad, fi, py, px);
  const wrong = shipAt(bad.spritebuffer);
  assert.ok(wrong, 'the fixture must still contain a ship record to compare');
  assert.notEqual(wrong.x, (py >> 6) - 24,
    'stripping BEFORE the splice must NOT produce a correctly placed ship, or '
    + 'this mutation cannot fail and the ordering constraint is untested');
});

test('Demo.draw() really calls them in that order', () => {
  // The test above proves the CONSTRAINT; this proves the PAGE obeys it, which
  // is a different statement and the one a reorder would break. A source check
  // is weak evidence in general and strong here: there is exactly one call site
  // of each and their order is the entire question.
  const src = read('src/web/app.js');
  const body = src.slice(src.indexOf('  draw(view) {'));
  const iSplice = body.indexOf('this.cap.splice(');
  const iStrip = body.indexOf('stripToAttached(');
  assert.ok(iSplice >= 0 && iStrip >= 0, 'draw() must call both');
  assert.ok(iSplice < iStrip,
    'draw() strips BEFORE it splices. splice addresses records by their index '
    + 'in the ORIGINAL list, so the ship would be left behind.');
});

test('an empty attached set empties the list rather than throwing', () => {
  // The honest degenerate case: a capture whose matcher accepted nothing must
  // draw NO sprites, not the recording's.
  const cap = syntheticCapture(40, { decoyFirst: true });
  const st = { spritebuffer: cap.part(3, 'spritebuffer') };
  assert.ok(parseSpriteList(st.spritebuffer).length > 0);
  const r = stripToAttached(st, []);
  assert.equal(r.kept, 0);
  assert.equal(parseSpriteList(st.spritebuffer).length, 0);
});

test('a broken attached set THROWS by name rather than losing the ship quietly',
  () => {
    // A `continue` here would turn a broken matcher into a ship that silently
    // stops being drawn, which is the failure shape this project keeps paying
    // for. Both impossible cases are named throws.
    const cap = syntheticCapture(40, { decoyFirst: true });
    const st = () => ({ spritebuffer: cap.part(2, 'spritebuffer') });
    assert.throws(() => stripToAttached(st(), [[3, 'rigid', 0, 0], [1, 'rigid', 0, 0]]),
      /must be strictly ascending/, 'descending indices must throw');
    assert.throws(() => stripToAttached(st(), [[2, 'rigid', 0, 0], [2, 'rigid', 0, 0]]),
      /must be strictly ascending/, 'a repeated index must throw');
    assert.throws(() => stripToAttached(st(), [[9999, 'rigid', 0, 0]]),
      /inside a \d+-word/, 'an out-of-range index must throw');
  });

// ============ 2c. WAVE 44 -- THE PORT'S OWN DISPLAY LIST, AND THE MISS GUARD
//
// SAME RULE AS ABOVE: synthetic RAM, so the suite runs on a tree with no
// cartridge. What these prove is the TRANSFORM -- what is remapped, what is
// skipped, how a skip is written, and that a skip cannot truncate the list.
// What they CANNOT prove is the measured numbers against the real 166-stream
// sheet (16,457 records over 300 steps, 0 missed, bucket 0 >= 14 on every
// frame, the first miss $233F34 at lf2315); those are in `tools/webgate.mjs`,
// which exits 2 rather than skipping when `assets/` is absent.

/** A `Ram` with a hand-written display list at $800000. Each entry is
 *  [x, y, colour, romOffs, wide, high]. */
function ramWithList(entries) {
  const ram = new Ram();
  entries.forEach(([x, y, color, offs, wide, high], r) => {
    const b = RAM.spriteList + r * RAM_STRIDE * 2;
    ram.setU16(b + 0, x & 0x07ff);
    ram.setU16(b + 2, y & 0x03ff);
    // word 2: flip/colour/pri in the high bits, offs bits 22..16 in bits 6..0.
    ram.setU16(b + 4, ((color & 0x1f) << 8) | ((offs >>> 16) & 0x7f));
    ram.setU16(b + 6, offs & 0xffff);
    ram.setU16(b + 8, ((wide & 0x3f) << 9) | (high & 0x1ff));
  });
  return ram;                       // the rest is zero = the terminator
}
const mapOf = (...rows) => new Map(rows.map(([rom, base, n]) => [rom, [base, n]]));

test('the remap rewrites ONLY the offs field, and by the map', () => {
  // $12D430 is the real shape of the problem: 23 bits of cartridge address that
  // must come out as a small packed base, with flip/colour/pri untouched.
  const ram = ramWithList([[100, 50, 17, 0x12d430, 3, 32]]);
  const r = portSpriteList(ram, mapOf([0x12d430, 4608, 98]));
  assert.equal(r.records, 1);
  assert.equal(r.drawn, 1);
  assert.equal(r.skipped, 0);
  const [s] = parseSpriteList(r.words, RAM_STRIDE);
  assert.equal(s.offs, 4608, 'the record must carry the PACKED base');
  assert.equal(s.color, 17, 'the colour bank was overwritten');
  assert.equal(s.width, 3);
  assert.equal(s.height, 32);
  assert.equal(s.x, 100);
  assert.equal(s.y, 50);
});

test('a record with NO ART is skipped by WIDTH and NAMED by its ROM address',
  () => {
    // The three cases side by side: one shipped, one absent, one shipped again.
    // The THIRD is the point -- a skip must not cost the records behind it.
    const ram = ramWithList([
      [10, 10, 0, 0x001520, 3, 32],
      [20, 20, 1, 0x233f34, 5, 80],     // [M] the real first miss
      [30, 30, 2, 0x001520, 3, 32],
    ]);
    const r = portSpriteList(ram, mapOf([0x001520, 4608, 98]));
    assert.equal(r.records, 3);
    assert.equal(r.drawn, 2);
    assert.equal(r.skipped, 1);
    assert.deepEqual([...r.missing], [[0x233f34, 1]],
      'the miss must be named by its CARTRIDGE address and counted');
    const out = parseSpriteList(r.words, RAM_STRIDE);
    assert.equal(out.length, 3,
      'a skip must NOT terminate the list -- everything behind it still draws');
    assert.equal(out[1].width, 0, 'the skip is a zero WIDTH');
    assert.equal(out[1].height, 80, '...and the height is untouched, or word 4 '
      + 'becomes the terminator');
    assert.equal(out[2].offs, 4608, 'the record BEHIND the gap must still be '
      + 'remapped and drawable');
  });

test('the SKIP-BY-WORD-4 mutation truncates the list -- the choice is real',
  () => {
    const ram = ramWithList([
      [10, 10, 0, 0x001520, 3, 32],
      [20, 20, 1, 0x233f34, 5, 80],
      [30, 30, 2, 0x001520, 3, 32],
    ]);
    const map = mapOf([0x001520, 4608, 98]);
    const good = parseSpriteList(portSpriteList(ram, map).words, RAM_STRIDE);
    const bad = parseSpriteList(portSpriteList(ram, map,
      { mutate: 'terminate-instead-of-zero-width' }).words, RAM_STRIDE);
    assert.equal(good.length, 3);
    assert.equal(bad.length, 1,
      'zeroing word 4 must LOSE the records behind the gap, or the reason the '
      + 'skip is written into the width field is untested');
  });

test('the cartridge section filler is blank rather than missing sprite art', () => {
  const ram = new Ram();
  FILLER.forEach((word, index) => ram.setU16(RAM.spriteList + index * 2, word));
  const r = portSpriteList(ram, new Map());
  assert.equal(r.records, 1);
  assert.equal(r.blank, 1, 'the exact $23D680 filler is an intentional offscreen record');
  assert.equal(r.drawn, 0);
  assert.equal(r.skipped, 0, 'filler offset zero is not an absent ROM stream');
  assert.deepEqual([...r.missing], []);
  assert.deepEqual(Array.from(r.words.slice(0, RAM_STRIDE)), FILLER,
    'blank classification leaves the hardware filler byte-exact');
});

test('a stream that is SHORT for the record is a miss, not an over-read', () => {
  // [M] `43-plan-enemy-layer.md` §1.4, reproduced this wave over 3,000 frames:
  // the port emits offs $000000 1,075 times, 1,065 of them at 1x1 and TEN AT
  // 3x40. The sheet holds TEN mask words for it. A map lookup alone succeeds --
  // its packed base really is 0 -- and the record reads 122 words out of a
  // 10-word stream, i.e. the next stream's data.
  const map = mapOf([0x000000, 0, 10]);
  const small = portSpriteList(ramWithList([[0, 0, 0, 0, 1, 1]]), map);
  assert.equal(small.drawn, 1, '1x1 needs 2 + 1 = 3 words and must DRAW');
  const big = portSpriteList(ramWithList([[0, 0, 0, 0, 3, 40]]), map);
  assert.equal(big.drawn, 0);
  assert.equal(big.skipped, 1, '3x40 needs 122 words and must be a MISS');
  assert.deepEqual([...big.missing], [[0, 1]]);
  // ...and without the rule it draws, which is the whole reason the rule exists.
  const unguarded = portSpriteList(ramWithList([[0, 0, 0, 0, 3, 40]]), map,
    { mutate: 'no-extent-check' });
  assert.equal(unguarded.drawn, 1);
  assert.equal(unguarded.skipped, 0);
});

test('a record the hardware draws nothing for needs NO ART and is left alone',
  () => {
    // `SpriteDrawer.draw` returns before touching a ROM word when either extent
    // is zero (sprites.js:139), so such a record cannot be a miss. AND ZEROING
    // ITS WIDTH WOULD BE A DISASTER: a record with width != 0 and height 0 has
    // `word4 & $7FFF != 0`, so the list runs on -- until the width is cleared
    // and word 4 becomes the terminator.
    const ram = ramWithList([
      [10, 10, 0, 0x999999, 4, 0],      // NOT in the map, and draws nothing
      [20, 20, 1, 0x001520, 3, 32],
    ]);
    const r = portSpriteList(ram, mapOf([0x001520, 4608, 98]));
    assert.equal(r.blank, 1);
    assert.equal(r.skipped, 0, 'a record that reads no ROM word is not a miss');
    assert.equal(r.drawn, 1);
    assert.equal(parseSpriteList(r.words, RAM_STRIDE).length, 2,
      'the zero-height record must not have become the terminator');
  });

test('the list stops where the hardware stops, and never reads past $8009FF',
  () => {
    assert.equal(PORT_LIST_WORDS, 256 * RAM_STRIDE);
    // 256 full entries and no terminator at all: the parser caps at 256 because
    // the hardware does, and this must not walk off the end of the copy.
    const ram = new Ram();
    for (let r = 0; r < 300; r++) {
      const b = RAM.spriteList + r * RAM_STRIDE * 2;
      if (b + 8 - RAM.spriteList >= 0x20000) break;
      ram.setU16(b + 4, 0); ram.setU16(b + 6, 0x1520);
      ram.setU16(b + 8, (3 << 9) | 32);
    }
    const r = portSpriteList(ram, mapOf([0x1520, 4608, 98]));
    assert.equal(r.records, 256);
    assert.equal(r.words.length, PORT_LIST_WORDS);
  });

test('a PRE-WAVE-44 manifest is refused by name, not read as a triple', () => {
  // The silent failure this replaces: a 2-field entry destructured as 3 gives
  // `words === undefined`, every extent check fails, and the screen is empty
  // with a perfectly plausible explanation on the status line.
  assert.throws(() => romToPackedMap({ spr: { streams: [[0, 10], [10, 98]] } }),
    /predates wave 44/);
  assert.throws(() => romToPackedMap({ spr: {} }), /missing or empty/);
  // WAVE 47 appended the SHARD, and it is DERIVED from the packed base rather
  // than shipped per stream. With no `shardOf` every stream reads as shard 0,
  // which is what a pre-W47 bundle is.
  const m = romToPackedMap({ spr: { streams: [[0x1520, 4608, 98]] } });
  assert.deepEqual(m.get(0x1520), [4608, 98, 0]);
  const s = romToPackedMap({ spr: { streams: [[0x1520, 4608, 98]] } },
    (b) => (b >= 4096 ? 3 : 0));
  assert.deepEqual(s.get(0x1520), [4608, 98, 3]);
});

test('THE EXPORTER KEEPS THE CARTRIDGE ADDRESS, and nothing else moved', () => {
  // The one-line half of this wave, and the only one the unit suite can see --
  // the bundle it produces is gitignored. If this reverts, the page cannot
  // translate the port's list at all: `romToPackedMap` throws by name at boot
  // (the test above) and `tools/webgate.mjs` goes red on the next export. This
  // is the cheap early warning, not the proof.
  const exporter = read('tools/export-web.mjs');
  assert.match(exporter, /\[offs, offsMap\.get\(offs\), w\.maskWords\]/,
    'export-web.mjs stopped emitting the ROM address it computes. It has '
    + 'always built `offsMap`; before wave 44 it threw the key away on this '
    + 'very line, and that is why 301 of the 302 streams the port emits would '
    + 'index the packed mask array at `offs & 16383` and draw garbage.');
  // ...and the manifest is the ONLY thing that may have changed. Measured this
  // wave by hashing all 21 files before and after: no .gz asset moves a byte,
  // which is why `bundlegate` must still be at 100.0000 %.
  assert.match(exporter, /NOT ONE \.gz asset moves a byte/,
    'the exporter must say what this change does NOT touch');
  assert.match(read('tools/bundlegate.mjs'), /exact === total/,
    'bundlegate stopped requiring every pixel. Nothing in wave 44 may loosen '
    + 'it -- the exporter change adds a KEY and re-bases nothing.');
});

test('the miss list is named by ADDRESS and ordered by COUNT', () => {
  assert.equal(namedMisses(new Map([[0x233f34, 3], [0x0650a8, 9]]), 2),
    '$0650A8x9 $233F34x3');
  assert.equal(namedMisses(new Map()), '');
});

test('the PORT is the default sprite source, and the mutations are declared',
  () => {
    assert.equal(DEFAULT_SPRITE_SOURCE, 'port');
    assert.deepEqual(SPRITE_SOURCES, ['port', 'capture']);
    // Declared in one place so `webgate --break` cannot invent one, the same
    // rule `displaylist.js MUTATIONS` states for itself.
    for (const n of ['no-remap', 'drop-one-stream',
      'terminate-instead-of-zero-width', 'no-extent-check']) {
      assert.ok(n in PORT_LIST_MUTATIONS, `${n} is not declared`);
    }
    assert.throws(() => portSpriteList(new Ram(), new Map(),
      { mutate: 'invented' }), /unknown port-list mutation/);
  });

test('Demo.draw() renders the HELD list, and step() takes it BEFORE the frame',
  () => {
    // The measured contract: `:igs023:spritebuffer` lags main RAM by one frame
    // (render/capture.js: lag 1 holds on 161/161 captured frames, lag 0 and lag
    // 2 on none). `webgate` proves the CONSEQUENCE against the real port -- the
    // ship sits at a constant offset from the PREVIOUS frame's $8103E8. This
    // proves the PAGE is built that way, which is the thing a reorder breaks:
    // there is exactly one snapshot and one `g.step()` and their order is the
    // entire question.
    const src = read('src/web/app.js');
    const body = src.slice(src.indexOf('  step({ project = true } = {}) {'));
    // The exact call sites, not a substring: the prose above them says "BEFORE
    // `g.step()`" and a looser search finds the COMMENT rather than the code.
    // WAVE 131: the argument is now `pw` (computed once from
    // `currentPortWord()` so the REC tee can capture the same word the
    // simulation sees); the ORDER this test pins is unchanged.
    const iSnap = body.indexOf('this.portList = portSpriteList(');
    const iStep = body.indexOf('g.step(pw)');
    assert.ok(iSnap >= 0 && iStep >= 0, 'step() must do both');
    assert.ok(iSnap < iStep,
      'step() builds the port list AFTER g.step(), so the page renders the '
      + 'list the CURRENT frame just built. That is one frame early and it '
      + 'looks ALMOST right.');
  });

test('THE STRIP IS IN THE PAGE AND NOT IN THE EXPORTER', () => {
  // 41-recon-sprite-art.md §5.3, and this is the whole reason wave 37 has a
  // brief. `tools/bundlegate.mjs` renders THE PUBLISHED BUNDLE'S OWN capture
  // and requires 100.0000 % pixel-identity to MAME. Strip in the DATA path and
  // that gate falls to roughly 91 % for entirely the right reason, and the
  // tempting repair is to weaken the strongest pixel gate this port owns.
  assert.match(read('src/web/app.js'), /stripToAttached/,
    'the strip must live in the page');
  const exporter = read('tools/export-web.mjs');
  assert.ok(!/stripToAttached|attached\(\)/.test(exporter),
    'the strip has moved into export-web.mjs. It must not: bundlegate.mjs '
    + 'demands 100.0000 % pixel-identity from the published bundle.');
  // ...and the gate that would catch it must still be demanding exactness.
  assert.match(read('tools/bundlegate.mjs'), /exact === total/,
    'bundlegate stopped requiring every pixel. Nothing in wave 37 may loosen '
    + 'it -- the strip is in the page precisely so it does not have to.');
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
  assert.match(html, /Both ships bank/i);
  assert.match(html, /17 rebased/i,
    'the page must say where the bank images come from, not just that they work');
});

test('the error box says NOT PORTED YET when the message names an address', () => {
  const html = read('index.html');
  assert.match(html, /NOT PORTED YET/,
    'a correct stop that does not say it is a correct stop reads as a crash');
  assert.match(html, /console\.error/, 'the console trace must be kept');
});

// WAVE 37 INVERTS THIS ONE, and the discipline does not invert. Until this
// wave the page said "the enemies are a recording and cannot be hit", which was
// true and was the right thing to say. The recorded enemies are now GONE, so
// that sentence would be a lie -- and an EMPTY sky with no explanation is the
// same defect class as a black screen with no explanation, which is what got
// wave 14 reported. So the page must now say the layer was emptied and why.
test('the page says the recorded enemies were REMOVED, and does not still '
  + 'claim they are on screen', () => {
  const html = read('index.html');
  assert.ok(!/cannot\s+see\s+you\s+and\s+cannot\s+be\s+shot/i.test(html),
    'the page still says the recorded enemies are flying around. They are not; '
    + 'Demo.draw strips them.');
  assert.match(html, /taken off the screen|recorded enemies have been/i,
    'the page must say the recorded enemies were removed');
  assert.match(html, /7,671[^]{0,80}886|886/,
    'say WHAT WAS MEASURED, not just that something was removed');
  assert.match(html, /161-frame|161\s+captured|161\s+frames/,
    'the page must still say WHY they were wrong: a 161-frame loop against a '
    + '7,317-frame computed stage');
});

// WAVE 44 -- the claims the port's own list makes, and the one the page must
// stop making. Same discipline as above: a claim on this page has to be one a
// check would catch being wrong.

test('the page says the ENEMIES ARE THE PORT\'S and no longer says the layer '
  + 'is empty', () => {
  const html = read('index.html');
  assert.ok(!/only four of the thirty sprite buckets/i.test(html),
    'the page still says four buckets have producers and the objects cannot '
    + 'draw themselves. They can: wave 44 renders the port\'s own $800000 list.');
  assert.ok(!/sky is empty on purpose/i.test(html),
    'the sky is not empty any more');
  assert.match(html, /\$800000/,
    'the page must name the list it is drawing');
  assert.match(html, /16,457|16457/,
    'say WHAT WAS MEASURED, not just that something now draws');
  // ...and the honest half: the coverage is a property of THIS seed, and the
  // page must not sell 5.32 s of free art as a general guarantee.
  assert.match(html, /5\.32/, 'the page must say how long the sheet lasts');
  assert.match(html, /this seed|THIS seed/,
    'the page must say the coverage window is a property of this seed');
  assert.match(html, /\$233F34/,
    'the first record with no art is a measured address and belongs on the page');
});

test('the loading line is CLOSED when boot returns, or the last shard sticks',
  () => {
    // REPORTED FROM PLAY: "the last loading gfx text just stays on screen even
    // when finished loading." It did. `boot()` starts the DEFERRED background
    // shards after `loadBundle` resolves, through the SAME onProgress the boot
    // set used, so `statusEl.textContent = ''` runs and is then overwritten by
    // shards 2..7 as they land -- and the last to arrive stays forever.
    //
    // A source check, and weak in general. It is strong here for the reason the
    // draw-order one is: there is exactly ONE onProgress handler and exactly one
    // place boot resolves, and the whole question is whether the first is fenced
    // by the second. The BEHAVIOUR was checked in a real browser this wave
    // (44-impl-E1-render.md) -- this is what keeps it from coming back.
    const html = read('index.html');
    const i = html.indexOf('onProgress:');
    assert.ok(i > 0, 'the page must still report loading progress');
    const handler = html.slice(i, html.indexOf('onError:', i));
    assert.match(handler, /if \(!booting\) return;/,
      'the loading line must stop accepting writes once boot has returned, or '
      + 'the deferred shards keep painting over it');
    const after = html.indexOf('booting = false;');
    assert.ok(after > i, 'nothing ever closes the loading channel');
    assert.ok(after < html.indexOf("statusEl.textContent = '';", after + 1) + 1,
      'the flag must be cleared before the element is');
  });

test('the page still says the HUD and the palette are the recording', () => {
  // Removal touched neither. `st.tx` is the text layer, not sprites: over all
  // 161 frames only 4 of 220 record classes are static and the only frequent
  // one is the null stream drawn off screen (41-recon-sprite-art.md §3.2).
  const html = read('index.html');
  assert.match(html, /HUD[^]{0,200}recording|recording[^]{0,200}HUD/i);
  assert.match(html, /palette[^]{0,200}recording/i);
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
