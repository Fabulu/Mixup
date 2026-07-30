// The ENDING.  ROM: loc_00_3652, reached only from `$35F6: CP $0E / JR Z`.
//
// The PICTURE and the TIMING are both proved against the cartridge by
// tools/oracle/endingdiff.mjs -- 115712/115712 bytes across the six screens and
// all 65 frames of the 13-line crawl, 4137 frames to the START wait, every
// palette on every frame -- and the SCREEN by tools/oracle/endingshot.mjs,
// 483840 pixels over 21 rendered frames. What is pinned here is the SHAPE of
// the routine, so a refactor cannot quietly move a branch: the step program's
// order, the four picture builds and their two different fill tiles, the crawl
// loop's structure, the frames that draw the emblem and the frames that do not,
// the one place START is read, and the throws that stop a missing table from
// producing a plausible-looking blank ending.
//
// Nothing here reads assets/ -- the spec below is synthetic.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  requireEndingSpec, buildEndingVram, buildEndingPicture, endingProgram,
  endingLength, loadEnding, showEnding, tickEnding, hideEnding,
  ENDING_LEVEL, FADE_FRAMES,
} from '../src/ending.js';
import { createState } from '../src/state.js';
import { BTN } from '../src/player.js';

const b64 = (bytes) => Buffer.from(Uint8Array.from(bytes)).toString('base64');

// One RLE-horizontal record per script, each at its own cell, so a missing or
// misordered build shows up as a specific byte.
const PIC = (cell, v) => [0x98, cell, 0x41, v, 0x00];
const SPEC = {
  fill: 0x7E,
  fill4: 0x6E,
  lcdc: 0xE7,
  resources: [0x02, 0x1D, 0x21, 0x23],
  // Deliberately OVERLAPPING, like the real $1D/$23 pair: $23 lands at $8C70
  // and $1D at $8C80, and $23 is loaded last, so order is load-bearing.
  tiles: [{ dest: 0x8800, bytes: b64([1, 1, 1, 1]) },
          { dest: 0x8802, bytes: b64([2, 2]) }],
  pictures: [b64(PIC(0x00, 0xA1)), b64(PIC(0x01, 0xA2)),
             b64(PIC(0x02, 0xA3)), b64(PIC(0x03, 0xA4))],
  theEnd: b64(PIC(0x04, 0xA5)),
  boxOn: [b64(PIC(0x10, 0xB1)), b64(PIC(0x11, 0xB2))],
  boxOff: [b64(PIC(0x10, 0x6E)), b64(PIC(0x11, 0x6E))],
  credits: Array.from({ length: 3 }, (_, i) => b64(PIC(0x20 + i, 0xC0 + i))),
  blackBgp: 0xFF,
  ramp: [0xFF, 0xAB, 0x5B, 0x1B],
  rampFrames: 0x21,
  blankFrames: 10,
  holdFrames: 20,
  crawlFirstWait: 6,
  crawlWait: 4,
  textHold: 8,
  crawlCount: 3,
  tailFrames: 5,
  endFrames: 7,
  fades: [0x03, 0x83, 0x03, 0x83, 0x80, 0x00, 0x80],
  sprite: { id: 0xF2, x: 0x38, y: 0x38 },
  sound: { id: 0x0A, mask: 0x03 },
};

const MANIFEST = {
  ending: SPEC,
  title: { fadeBgp: [0xE4, 0x90, 0x40, 0x00, 0x1B, 0x06, 0x01, 0x00],
           fadeObp1: [0xC4, 0x80, 0x00, 0x00] },
  metasprites: { table1: { 0xF2: { sprites: [[-48, -40, 0xCE, 0x00]] } } },
};

/* ------------------------------------------------------------- the manifest */

test('requireEndingSpec names what is missing rather than defaulting', () => {
  assert.throws(() => requireEndingSpec(undefined), /has no "ending"/);
  const { textHold, ...rest } = SPEC;
  assert.throws(() => requireEndingSpec(rest), /textHold/);
});

test('$3840 counts to $0D, so 13 credit lines are required', () => {
  const short = { ...SPEC, credits: SPEC.credits.slice(0, 2) };
  assert.throws(() => requireEndingSpec(short), /counts to 3/);
});

test('the fade ramps are the title screen\'s, and their absence throws', () => {
  assert.throws(() => loadEnding({ ending: SPEC }, null), /fadeBgp\/fadeObp1/);
});

test('the ending belongs to level $0E and nothing else', () => {
  assert.equal(ENDING_LEVEL, 0x0E);
});

/* -------------------------------------------------------------- the picture */

test('$3652 fills $9800-$9A3E and stops one short of $9A3F', () => {
  // sub_00_34A4 PUSHes 287 words from $9A3F downward and stores $9800 by hand.
  const base = new Uint8Array(0x2000).fill(0x77);
  const v = buildEndingVram(SPEC, base);
  assert.equal(v[0x9800 - 0x8000], 0x7E);
  assert.equal(v[0x9A3E - 0x8000], 0x7E);
  assert.equal(v[0x9A3F - 0x8000], 0x77);
});

test('the four resources are applied IN ORDER, because they overlap', () => {
  const v = buildEndingVram(SPEC, null);
  // $8802/$8803 belong to both blobs; the later one wins, as $23 does over $1D.
  assert.deepEqual([...v.subarray(0x0800, 0x0804)], [1, 1, 2, 2]);
});

test('the base image is copied, never mutated', () => {
  const base = new Uint8Array(0x2000).fill(0x5A);
  buildEndingVram(SPEC, base);
  assert.ok(base.every((b) => b === 0x5A));
});

test('picture 4 fills with $6E and the other three with $7E', () => {
  // $374A is the one LD D that is not $7E, and it is what makes the credits
  // screen a different background from the three pictures.
  for (const n of [0, 1, 2, 3]) {
    const v = buildEndingPicture(SPEC, buildEndingVram(SPEC, null), n);
    assert.equal(v[0x9810 - 0x8000], n === 3 ? 0x6E : 0x7E);
  }
});

test('each picture erases the one before it', () => {
  const v = buildEndingVram(SPEC, null);
  buildEndingPicture(SPEC, v, 0);
  assert.equal(v[0x9800 - 0x8000], 0xA1);
  buildEndingPicture(SPEC, v, 1);
  assert.equal(v[0x9800 - 0x8000], 0x7E);          // the refill wiped it
  assert.equal(v[0x9801 - 0x8000], 0xA2);
});

/* -------------------------------------------------------- the step program */

test('the program is the ROM\'s straight line, in order', () => {
  const prog = endingProgram(SPEC);
  const p = prog.map((s) => s.k + (s.pic !== undefined ? `:${s.pic}` : ''));
  const head = p.slice(0, 14);
  assert.deepEqual(head, [
    'build:0', 'wait', 'ramp', 'wait', 'fade',        // $3652 .. $36C9
    'build:1', 'fade', 'wait', 'fade',                // $36CE .. $3709
    'build:2', 'fade', 'wait',                        // $370E .. $373E
    'build:3', 'fade',                                // $3749 .. $377A
  ]);
  assert.deepEqual(p.slice(-7),
    ['line', 'wait', 'fade', 'build:theEnd', 'wait', 'fade', 'quit']);
  assert.equal(prog[prog.length - 1].at, 0x3887);   // the one $FFE2 read
});

test('picture 3 has NO fade out -- the cut happens with the LCD off', () => {
  // $373E's hold is followed directly by $3749's fill. Every other picture is
  // followed by a sub_00_0A7F.
  const p = endingProgram(SPEC);
  const i = p.findIndex((s) => s.at === 0x3749);
  assert.equal(p[i - 1].k, 'wait');
  assert.equal(p[i - 1].at, 0x373E);
});

test('the crawl is 13 x [wait, box, box, credit, hold, box, box]', () => {
  const p = endingProgram(SPEC);
  const first = p.findIndex((s) => s.at === 0x3787);
  const shape = p.slice(first - 2, first + 6).map((s) => s.k);
  assert.deepEqual(shape,
    ['line', 'wait', 'script', 'script', 'script', 'wait', 'script', 'script']);
  assert.equal(p.filter((s) => s.at === 0x3787).length, SPEC.crawlCount);
  // $377F is $3C the first time round and $3844 is $20 every later time.
  const waits = p.filter((s) => s.at === 0x377F || s.at === 0x3844);
  assert.deepEqual(waits.map((s) => s.n), [6, 4, 4]);
});

test('the two erase frames draw no sprite; the three paint frames do', () => {
  // $3815 and $3827 call sub_00_0C1F only -- no sub_00_0BC6 at all.
  const p = endingProgram(SPEC);
  const on = p.filter((s) => s.at === 0x3787 || s.at === 0x37A2 || s.at === 0x37C7);
  const off = p.filter((s) => s.at === 0x3815 || s.at === 0x3827);
  assert.ok(on.every((s) => s.sprite === true));
  assert.ok(off.every((s) => !s.sprite));
});

test('endingLength is the sum of the frame-consuming steps', () => {
  // 10 blank + 33 ramp + 20 + 33 + 33 + 20 + 33 + 33 + 20 + 33
  //  + 3 x (wait + 3 + 8 + 2) + 5 + 33 + 7 + 33
  const crawl = (6 + 13) + 2 * (4 + 13);
  const want = 10 + 0x21 + 20 + 0x21 + 0x21 + 20 + 0x21 + 0x21 + 20 + 0x21
    + crawl + 5 + 0x21 + 7 + 0x21;
  assert.equal(endingLength(SPEC), want);
});

/* -------------------------------------------------------------- the timing */

function harness(opts = {}) {
  const state = createState();
  state.titleManifest = MANIFEST;
  state.sound = { queue: [] };
  const art = loadEnding(MANIFEST, opts.base ?? new Uint8Array(0x2000));
  showEnding(state, art);
  const press = opts.pressStartOn ?? null;
  const frames = [];
  let done = null;
  const max = opts.max ?? endingLength(SPEC) + 60;
  for (let f = 1; f <= max; f++) {
    state.input.pressed = f === press ? BTN.START : 0;
    const r = tickEnding(state);
    frames.push({ f, bgp: state.video.bgp, obp0: state.video.obp0,
                  obp1: state.video.obp1, sprites: state.video.sprites.length,
                  line: state.ending.line, c713: state.ending.c713,
                  // A COPY: the map is mutated in place, so a live view would
                  // report the last frame's picture for every frame.
                  map: Uint8Array.from(art.bgMap) });
    if (r === 'done') { done = f; break; }
  }
  return { state, art, frames, done };
}

test('nothing but $3887 reads START -- it is not skippable', () => {
  const n = endingLength(SPEC);
  for (const f of [1, 5, 12, 40, 80, 120, n - 10, n]) {
    assert.equal(harness({ pressStartOn: f }).done, null,
      `START on frame ${f} ended the ending`);
  }
});

test('START at the $3887 wait ends it, on that frame', () => {
  const n = endingLength(SPEC);
  assert.equal(harness({ pressStartOn: n + 1 }).done, n + 1);
  assert.equal(harness({ pressStartOn: n + 25 }).done, n + 25);
});

test('$3685 paints picture 1 black, and $36B0 ramps it up', () => {
  const h = harness();
  // The build is zero frames, so frame 1 is already showing $FF.
  assert.equal(h.frames[0].bgp, 0xFF);
  assert.ok(h.frames.slice(0, SPEC.blankFrames).every((x) => x.bgp === 0xFF));
  // $36A6's B counts $21 down and writes when B & 7 == 0 -- the 2nd, 10th,
  // 18th and 26th frames of the step, and nowhere else.
  const base = SPEC.blankFrames;
  const steps = [2, 10, 18, 26].map((k) => h.frames[base + k - 1].bgp);
  assert.deepEqual(steps, SPEC.ramp);
  assert.equal(h.frames[base + 33 - 1].bgp, 0x1B);
});

test('the ramp queues sub_00_0AE1 once, id $0A mask $03', () => {
  const h = harness();
  assert.deepEqual(h.state.sound.queue, [{ id: 0x0A, mask: 0x03 }]);
});

test('sub_00_34A4 writes BGP and OBP0 but never OBP1', () => {
  // $34C6-$34CA is `LD A,$E4 / LDH [$FFAD] / LDH [$FFAE]` and stops there, so
  // OBP1 survives every build and only sub_00_0A7F ever moves it.
  const state = createState();
  state.titleManifest = MANIFEST;
  state.sound = { queue: [] };
  state.video.obp1 = 0x5A;
  showEnding(state, loadEnding(MANIFEST, new Uint8Array(0x2000)));
  assert.equal(state.video.bgp, 0xE4);
  assert.equal(state.video.obp0, 0xE4);
  assert.equal(state.video.obp1, 0x5A);
});

test('$C712 advances one per line and stops at crawlCount', () => {
  const h = harness();
  const seen = [...new Set(h.frames.map((x) => x.line))];
  assert.deepEqual(seen, [0, 1, 2, 3]);
  assert.equal(h.frames[h.frames.length - 1].line, SPEC.crawlCount);
});

test('$C713 counts $80 .. $01 and lands on 0 for the erase frames', () => {
  // $380C decrements AFTER the sub_00_0A4F it follows, so the value that stands
  // through hold frame n is textHold - (n - 1), and 0 first appears on the
  // frame that paints the first eraser.
  const h = harness();
  const run = h.frames.map((x) => x.c713);
  const start = run.indexOf(SPEC.textHold);
  assert.ok(start > 0);
  assert.deepEqual(run.slice(start, start + SPEC.textHold),
                   [8, 7, 6, 5, 4, 3, 2, 1]);
  assert.equal(run[start + SPEC.textHold], 0);
  assert.equal(run[start + SPEC.textHold + 1], 0);
});

test('the emblem is drawn on the paint and hold frames and no others', () => {
  const h = harness();
  const drawn = h.frames.filter((x) => x.sprites > 0).length;
  // 3 paint frames + textHold, per line.
  assert.equal(drawn, SPEC.crawlCount * (3 + SPEC.textHold));
  // ... and the gaps between lines draw nothing at all.
  assert.equal(h.frames[0].sprites, 0);
  assert.equal(h.frames[h.frames.length - 1].sprites, 0);
});

test('a line is painted over the $7E box and erased with $6E', () => {
  const h = harness();
  const at = (f, a) => h.frames[f - 1].map[a - 0x9800];
  const paint = h.frames.findIndex((x) => x.sprites > 0) + 1;
  assert.equal(at(paint, 0x9810), 0xB1);            // 1:$7B34
  assert.equal(at(paint + 1, 0x9811), 0xB2);        // 1:$7B49
  assert.equal(at(paint + 2, 0x9820), 0xC0);        // 7:$7BFC[0]
  const erase = paint + 3 + SPEC.textHold;   // 3 paint frames, then the hold
  assert.equal(at(erase, 0x9810), 0x6E);            // 1:$7B5E
  assert.equal(at(erase + 1, 0x9811), 0x6E);        // 1:$7B73
});

test('each of the 13 lines gets its OWN credit script', () => {
  const h = harness();
  for (let i = 0; i < SPEC.crawlCount; i++) {
    const f = h.frames.findIndex((x) => x.map[0x9820 - 0x9800 + i] === 0xC0 + i);
    assert.ok(f >= 0, `line ${i} was never painted`);
  }
});

test('the THE END build re-fills with $7E and zeroes all three palettes', () => {
  // $3856-$3860: LD D,$7E, then XOR A into $FFAD, $FFAE and $FFAF alike.
  const h = harness();
  const n = endingLength(SPEC);
  const first = n - SPEC.endFrames - FADE_FRAMES + 1;
  const f = h.frames[first - 1];
  assert.deepEqual([f.bgp, f.obp0, f.obp1], [0, 0, 0]);
  assert.equal(f.map[0x9804 - 0x9800], 0xA5);
  assert.equal(f.map[0x9800 - 0x9800], 0x7E);
});

test('the final fade is sub_00_0A7F C = $80, all four steps', () => {
  const h = harness();
  const n = endingLength(SPEC);
  const tail = h.frames.slice(n - FADE_FRAMES, n).map((x) => x.bgp);
  // C bit 7 set -> $C70E starts at 3 and counts down; C & $7F == 0 -> the
  // FIRST ramp. So BGP walks $0B09[3..0] on the 2nd/10th/18th/26th frames.
  assert.deepEqual([tail[1], tail[9], tail[17], tail[25]],
                   [0x00, 0x40, 0x90, 0xE4]);
  assert.equal(h.frames[n - 1].bgp, 0xE4);
});

test('hideEnding drops the tilemap the renderer reads', () => {
  const h = harness({ max: 5 });
  assert.ok(h.state.video.bgMap);
  hideEnding(h.state);
  assert.equal(h.state.video.bgMap, null);
  assert.equal(h.state.ending, null);
});
