// The stage-intro card.  ROM: sub_00_333F, master-ref §7.6 for the scripts.
//
// The PICTURE and the TIMING are both proved against the cartridge by
// tools/oracle/introdiff.mjs -- 8192/8192 bytes at each of the card's five
// recorded states on all eight levels that show it, and 276 frames split
// 60 / 1 / 1 / 1 / 180 / 33. What is pinned here is the shape of the routine
// itself, so that a refactor cannot quietly move a branch: the eight-level
// gate, the boss-only append, the three uncancellable paint frames, and the
// throws that stop a missing table from producing a plausible blank card.
//
// Nothing here reads assets/ -- the spec below is synthetic.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  showsStageIntro, stageIntroTextScript, buildStageIntroVram,
  requireStageIntroSpec, loadStageIntro, showStageIntro, tickStageIntro,
  hideStageIntro, INTRO_ROUTE_LEVELS, INTRO_BOSS_LEVELS,
} from '../src/stageintro.js';
import { runVramScript } from '../src/vramscript.js';
import { createState } from '../src/state.js';
import { BTN } from '../src/player.js';

const b64 = (bytes) => Buffer.from(Uint8Array.from(bytes)).toString('base64');

// One RLE-horizontal record per script, each at its own cell, so a missing or
// misordered stage shows up as a specific byte.
const SCRIPT_A = [0x98, 0x00, 0x41, 0xAA, 0x00];      // $9800 <- $AA
const SCRIPT_B = [0x98, 0x01, 0x41, 0xBB, 0x00];      // $9801 <- $BB
// A boss record with NO terminator -- which is exactly how 3:$7D21 and its
// three siblings ship, and the whole reason loc_00_343A can append over it.
const BOSS_OWN = [0x98, 0x02, 0x41, 0xCC];            // $9802 <- $CC
const ROUTE_OWN = [0x98, 0x02, 0x41, 0xDD, 0x00];     // $9802 <- $DD
const BOSS_APPEND = [0x98, 0x03, 0x41, 0xEE, 0x00];   // $9803 <- $EE

const SPEC = {
  fill: 0xDC,
  tiles: [{ dest: 0x8800, bytes: b64([1, 2, 3, 4]) }],
  scripts: [b64(SCRIPT_A), b64(SCRIPT_B)],
  levelScripts: Object.fromEntries(
    Array.from({ length: 14 }, (_, i) => [String(i + 1),
      b64(INTRO_BOSS_LEVELS.includes(i + 1) ? BOSS_OWN : ROUTE_OWN)])),
  bossScript: b64(BOSS_APPEND),
  blankFrames: 0x3C,
  holdFrames: 0xB4,
  lcdc: 0xE7,
  sprite: { id: 0xF2, x: 0x58, y: 0x58 },
  sound: { id: 0x01, mask: 0x04 },
};

const MANIFEST = {
  stageIntro: SPEC,
  title: { fadeBgp: [0xE4, 0x90, 0x40, 0x00, 0, 0, 0, 0],
           fadeObp1: [0xC4, 0x80, 0x00, 0x00] },
  metasprites: { table1: { 0xF2: { sprites: [[-48, -40, 0xCE, 0x00]] } } },
};

const run = (v, s) => runVramScript(v, s);

/* ---------------------------------------------------------------- the gate */

test('$3342-$3364 shows the card on exactly eight levels', () => {
  // Four route starts ($3346-$3352 -> loc_00_3365) and four bosses
  // ($3356-$3362 -> loc_00_3369). Everything else takes the RET at $3364.
  const shown = [];
  for (let l = 1; l <= 14; l++) if (showsStageIntro(l)) shown.push(l);
  assert.deepEqual(shown, [1, 4, 5, 8, 9, 11, 12, 14]);
});

test('the route starts and the bosses are different arms', () => {
  assert.deepEqual(INTRO_ROUTE_LEVELS, [1, 5, 9, 0x0C]);
  assert.deepEqual(INTRO_BOSS_LEVELS, [4, 8, 0x0B, 0x0E]);
  for (const l of INTRO_ROUTE_LEVELS) assert.ok(!INTRO_BOSS_LEVELS.includes(l));
});

/* ------------------------------------------------------- the $C61B buffer */

test('loc_00_343A appends 0:$3485 on a boss and nowhere else', () => {
  // $3428-$3438 tests $04/$08/$0B/$0E and JR NZ past the append for the rest.
  assert.deepEqual([...stageIntroTextScript(SPEC, 4)],
                   [...BOSS_OWN, ...BOSS_APPEND]);
  assert.deepEqual([...stageIntroTextScript(SPEC, 1)], ROUTE_OWN);
});

test('the appended script supplies the terminator the boss record lacks', () => {
  // A boss record read as a terminated script would run off its end into the
  // next record's data. The concatenation is what makes it well formed.
  const buf = stageIntroTextScript(SPEC, 8);
  assert.equal(buf[BOSS_OWN.length - 1], 0xCC);   // the record's last payload
  assert.equal(buf[buf.length - 1], 0x00);        // 0:$3485's own terminator
});

test('a level with no script throws rather than drawing a blank card', () => {
  const bad = { ...SPEC, levelScripts: { 1: SPEC.levelScripts['1'] } };
  assert.throws(() => stageIntroTextScript(bad, 5), /no level script/);
});

test('requireStageIntroSpec names what is missing', () => {
  assert.throws(() => requireStageIntroSpec(undefined), /has no "stageIntro"/);
  const { holdFrames, ...rest } = SPEC;
  assert.throws(() => requireStageIntroSpec(rest), /holdFrames/);
});

/* ------------------------------------------------------------- the picture */

test('the build is fill, then tiles, then one script per stage', () => {
  const base = new Uint8Array(0x2000).fill(0x77);
  const v0 = buildStageIntroVram(SPEC, 1, base, run, 0);
  // $3371's fill covers $9800-$9A3E and stops one short of $9A3F (sub_00_34A4
  // PUSHes 287 words from $9A3F downward and stores $9800 by hand).
  assert.equal(v0[0x9800 - 0x8000], 0xDC);
  assert.equal(v0[0x9A3E - 0x8000], 0xDC);
  assert.equal(v0[0x9A3F - 0x8000], 0x77);
  assert.deepEqual([...v0.subarray(0x0800, 0x0804)], [1, 2, 3, 4]);
  assert.equal(v0[0x9803 - 0x8000], 0xDC);            // nothing painted yet
});

test('each scripted frame is a state the card really shows', () => {
  const base = new Uint8Array(0x2000);
  const at = (s) => buildStageIntroVram(SPEC, 4, base, run, s);
  const cell = (v, a) => v[a - 0x8000];
  assert.deepEqual([1, 2, 3].map((s) => cell(at(s), 0x9800)), [0xAA, 0xAA, 0xAA]);
  assert.deepEqual([1, 2, 3].map((s) => cell(at(s), 0x9801)), [0xDC, 0xBB, 0xBB]);
  assert.deepEqual([1, 2, 3].map((s) => cell(at(s), 0x9802)), [0xDC, 0xDC, 0xCC]);
  assert.deepEqual([1, 2, 3].map((s) => cell(at(s), 0x9803)), [0xDC, 0xDC, 0xEE]);
});

test('the base image is copied, never mutated', () => {
  const base = new Uint8Array(0x2000).fill(0x5A);
  buildStageIntroVram(SPEC, 1, base, run, 3);
  assert.ok(base.every((b) => b === 0x5A));
});

/* -------------------------------------------------------------- the timing */

function harness(level, opts = {}) {
  const state = createState();
  state.titleManifest = MANIFEST;
  state.sound = { queue: [] };
  state.player.hp = 1;
  state.player.hpMax = 10;
  const art = loadStageIntro(MANIFEST, level, new Uint8Array(0x2000));
  showStageIntro(state, art);
  const press = opts.pressStartOn ?? null;
  const frames = [];
  let done = null;
  for (let f = 1; f <= (opts.max ?? 400); f++) {
    state.input.pressed = f === press ? BTN.START : 0;
    const r = tickStageIntro(state);
    frames.push({ f, stage: state.stageIntro.stage, fading: !!state.stageIntro.fade,
                  bgp: state.video.bgp, sprites: state.video.sprites.length });
    if (r === 'done') { done = f; break; }
  }
  return { state, art, frames, done };
}

test('the card is 60 blank + 3 painting + 180 held + 33 fading = 276', () => {
  const h = harness(1);
  assert.equal(h.done, 276);
  const painted = h.frames.filter((x, i) => i === 0
    ? x.stage !== 0 : x.stage !== h.frames[i - 1].stage).map((x) => x.f);
  assert.deepEqual(painted, [61, 62, 63]);        // $33A6 / $33D5 / $3404
  const fading = h.frames.filter((x) => x.fading).map((x) => x.f);
  assert.equal(fading[0], 243);                   // armed at the end of 243
  // The emblem is on screen for ALL 276 frames, the fade included.
  //
  // This used to assert 243 and stop at the fade, on the reasoning that
  // sub_00_0A7F contains no sub_00_0BC6 -- true, it does not REDRAW. But it
  // does not CLEAR shadow OAM either, and the hardware keeps displaying what
  // is in there. MEASURED on the cartridge: 40 live OAM entries on every
  // frame of the fade, while BGP and OBP0 step E4 -> 90 -> 40 -> 00 together.
  // Our shadow OAM is a queue rebuilt per tick, so not redrawing meant the
  // ring VANISHED the instant the fade began and left the card's hard BG edge
  // bare for 33 frames -- which is exactly what it looked like in the game.
  assert.equal(h.frames.filter((x) => x.sprites > 0).length, 276);
});

test('START leaves the blank hold, and the earliest exit is frame 1', () => {
  // $3394 reads $FFE2 AFTER sub_00_0A4F, so one frame is always shown.
  assert.equal(harness(1, { pressStartOn: 1 }).done, 1);
  assert.equal(harness(1, { pressStartOn: 40 }).done, 40);
});

test('START cannot skip the three painting frames', () => {
  // $33C8, $33F7 and $345A have no $FFE2 test after them at all.
  for (const f of [61, 62, 63]) {
    const h = harness(1, { pressStartOn: f });
    assert.equal(h.done, 276, `START on frame ${f} should not end the card`);
  }
});

test('START during the hold ends it, and the fade never runs', () => {
  const h = harness(1, { pressStartOn: 100 });
  assert.equal(h.done, 100);                       // $3475: RET NZ
  assert.ok(!h.frames.some((x) => x.fading));
  // ...so a cancelled card leaves the palettes exactly where it found them.
  assert.equal(h.state.video.bgp, createState().video.bgp);
});

test('START during the fade is ignored', () => {
  const h = harness(1, { pressStartOn: 250 });
  assert.equal(h.done, 276);
});

test('the fade is sub_00_0A7F with C = 0, all four steps', () => {
  const h = harness(1);
  const bgp = h.frames.filter((x) => x.fading).map((x) => [x.f, x.bgp]);
  // B counts $21 down and a step lands on B & 7 == 0 -- $20/$18/$10/$08, i.e.
  // eight frames apart, walking 0:$0B09 forward from entry 0.
  assert.deepEqual(bgp.filter(([, v], i) => i === 0 || v !== bgp[i - 1][1]),
                   [[243, 0xE4], [253, 0x90], [261, 0x40], [269, 0x00]]);
  assert.equal(h.state.video.bgp, 0x00);
});

test('loc_00_3365 refills HP on a route start only', () => {
  assert.equal(harness(1, { max: 1 }).state.player.hp, 10);
  assert.equal(harness(4, { max: 1 }).state.player.hp, 1);
});

test('$3369 asks for cue $01 with mask $04 -- B is the id, C the mask', () => {
  // §32: LD BC,$0104 is id $01 / mask $01... no: B = $01, C = $04. Mask $04 is
  // NOT the menus' stop-all $03, so whatever is playing keeps playing.
  const h = harness(1, { max: 1 });
  assert.deepEqual(h.state.sound.queue[0], { id: 0x01, mask: 0x04 });
});

test('hideStageIntro drops the card entirely', () => {
  const h = harness(1, { max: 1 });
  hideStageIntro(h.state);
  assert.equal(h.state.stageIntro, null);
  assert.equal(h.state.video.bgMap, null);
});

test('the BG map the renderer sees is a view of the card VRAM', () => {
  // The three scripts run per frame, after showStageIntro has handed the map
  // to the renderer -- a copy would freeze the card on its blank state.
  const h = harness(1, { max: 62 });
  assert.equal(h.state.video.bgMap[0], 0xAA);
  assert.equal(h.art.vram[0x9800 - 0x8000], 0xAA);
});

test('a null base builds the same card', () => {
  // MEASURED on all eight levels (introdiff.mjs): everything the hardware
  // reads is supplied by the card's own three resources, so a boss level --
  // entered from the previous LEVEL, whose VRAM the port does not keep -- can
  // be shown without one.
  const withBase = buildStageIntroVram(SPEC, 1, new Uint8Array(0x2000), run, 3);
  const without = buildStageIntroVram(SPEC, 1, null, run, 3);
  assert.deepEqual([...without], [...withBase]);
});
