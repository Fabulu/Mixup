// The Vic Viper, FREE-RUN against the cartridge.
//
// This is the strongest check in the suite and the reason for its shape: the
// port is seeded from the machine's RAM at ONE frame and then driven only by
// the button stream, with no further contact with the cartridge, and every
// field is compared every frame. Free-running is the point -- a sub-pixel
// accumulator's error only shows up by compounding, so a per-frame re-seed
// would hide exactly the bug this is looking for.
//
// The trace is `tools/oracle/out/playermodel.{json,ram}`, produced by the
// oracle: 560 game frames of the real ROM under Mesen, with 2,048 bytes of CPU
// RAM captured at the $80B5 sample point of every frame.
//
// Six negative controls follow, each a deliberate lie about one rule. They are
// the same six NOTES-player.md 11 used, and the test asserts each is seen red
// -- INCLUDING the two that are honestly VACUOUS at $40 = 0, which are asserted
// to be vacuous rather than quietly counted as passes.

import test from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { createState, RING_LEN } from '../src/state.js';
import { updatePlayer, speedStep } from '../src/player.js';
import { GAME, headlessResources } from './helpers.js';

// The weapon tables ($A0E0/$A1A4/$BFCE), because $A0CB's BMI falls out of the
// Option animation INTO the firing block: updatePlayer() is $9FFC, all of it,
// since wave 6. The free-run's button stream contains A presses, so the shots
// below are real -- they just do not appear in `snapshot`, which is the
// cartridge trace's own 15 fields.
const res = headlessResources(0);

const OUT = join(GAME, 'tools', 'oracle', 'out');
const SEED = 325, LAST = 559;

// TWO runs, and the second one exists ONLY because the first cannot fail two of
// the controls. Run A is natural speed ($40 = 0), where the step is exactly
// 1.00 px so the sub-pixel byte never moves and the ship never approaches the
// right wall. Run B forces $40 = 5 (3.5 px/frame) and drives into both walls.
const RUNS = [
  ['playermodel', 'run A -- natural speed, all 8 directions plus L+R and U+D'],
  ['playermodel_fast', 'run B -- $40 = 5, driven into both X walls'],
];

function loadTrace(base) {
  const t = join(OUT, `${base}.json`), r = join(OUT, `${base}.ram`);
  if (!existsSync(t) || !existsSync(r)) return null;
  const doc = JSON.parse(readFileSync(t, 'utf8'));
  const ram = new Uint8Array(readFileSync(r));
  if (ram.length !== doc.frames.length * 2048) return null;
  return { base, doc, ram, at: (f) => ram.subarray(f * 2048, (f + 1) * 2048) };
}

/** The 15 fields compared, exactly as they sit in the machine's RAM. */
function snapshot(r) {
  return {
    x: r[0x360], xf: r[0x380], y: r[0x320], yf: r[0x340],
    cursor: r[0x160], anim: r[0x120], timer: r[0x140],
    opt1x: r[0x361], opt1y: r[0x321], opt2x: r[0x362], opt2y: r[0x322],
    ringX: [...r.subarray(0x7A0, 0x7A0 + RING_LEN)],
    ringY: [...r.subarray(0x7C0, 0x7C0 + RING_LEN)],
  };
}

function snapshotOf(s) {
  return {
    x: s.obj.x[0], xf: s.obj.xf[0], y: s.obj.y[0], yf: s.obj.yf[0],
    cursor: s.ring.cursor, anim: s.obj.anim[0], timer: s.obj.timer[0],
    opt1x: s.obj.x[1], opt1y: s.obj.y[1], opt2x: s.obj.x[2], opt2y: s.obj.y[2],
    ringX: [...s.ring.x], ringY: [...s.ring.y],
  };
}

function seedFrom(r) {
  const s = createState();
  s.obj.x[0] = r[0x360]; s.obj.xf[0] = r[0x380];
  s.obj.y[0] = r[0x320]; s.obj.yf[0] = r[0x340];
  s.obj.x[1] = r[0x361]; s.obj.y[1] = r[0x321];
  s.obj.x[2] = r[0x362]; s.obj.y[2] = r[0x322];
  s.obj.anim[0] = r[0x120]; s.obj.timer[0] = r[0x140];
  s.obj.status[0] = r[0x100];
  s.ring.cursor = r[0x160];
  s.ring.x.set(r.subarray(0x7A0, 0x7A0 + RING_LEN));
  s.ring.y.set(r.subarray(0x7C0, 0x7C0 + RING_LEN));
  s.zp.speed = r[0x40]; s.zp.options = r[0x45];
  return s;
}

/** The variants. Each lies about exactly one rule, in the port's own code. */
const VARIANTS = {
  'no-subpixel': (s) => { s.obj.xf[0] = 0; s.obj.yf[0] = 0; },
  'x-max-220': (s) => { if (s.obj.x[0] > 220) s.obj.x[0] = 220; },
  'ring-always': (s, held) => {
    if (held & 0x0F) return;                    // the real rule already ran
    const c = (s.ring.cursor + 1) % RING_LEN;   // advance anyway
    s.ring.cursor = c; s.ring.x[c] = s.obj.x[0]; s.ring.y[c] = s.obj.y[0];
  },
  'opt-lag-12': (s) => {
    let i = s.ring.cursor;
    for (let slot = 1; slot <= 2; slot++) {
      i -= 12; if (i < 0) i += RING_LEN;
      s.obj.x[slot] = s.ring.x[i]; s.obj.y[slot] = s.ring.y[i];
    }
  },
  'tilt-every-frame': (s) => { s.obj.anim[0] = s.zp.tilt; s.obj.timer[0] = 0; },
  'speed-no-wrap': null,          // handled separately: it is in speedStep
};

function freeRun(tr, mutate) {
  const s = seedFrom(tr.at(SEED));
  const bad = [];
  for (let f = SEED + 1; f <= LAST; f++) {
    const held = tr.doc.frames[f].held;
    s.input.held = held;
    updatePlayer(s, res);
    if (mutate) mutate(s, held);
    const want = snapshot(tr.at(f)), got = snapshotOf(s);
    for (const k of Object.keys(want)) {
      if (JSON.stringify(want[k]) !== JSON.stringify(got[k])) {
        bad.push({ f, k, want: want[k], got: got[k] });
        break;
      }
    }
    if (bad.length) break;                       // first divergence is enough
  }
  return bad;
}

const TRACES = RUNS.map(([b, what]) => [loadTrace(b), what]).filter(([t]) => t);

for (const [tr, what] of TRACES) {
  test(`the player free-runs against the cartridge: ${what}`, (t) => {
    const bad = freeRun(tr, null);
    t.diagnostic(`${tr.base}: seeded at ${SEED}, free-ran to ${LAST}; `
      + `$40 = ${tr.at(SEED)[0x40]}, $45 = ${tr.at(SEED)[0x45]}`);
    assert.deepStrictEqual(bad, [],
      bad.length ? `first divergence: frame ${bad[0].f} field ${bad[0].k} `
        + `cartridge=${JSON.stringify(bad[0].want)} port=${JSON.stringify(bad[0].got)}` : '');
  });
}

test('every negative control is seen to go red on at least one run', (t) => {
  if (TRACES.length === 0) return t.skip('no tools/oracle/out/playermodel*.{json,ram} '
    + '(ROM-derived; regenerate with tools/oracle/playermodel.py)');

  const everRed = new Set();
  for (const [tr] of TRACES) {
    // Which controls this run CAN see, worked out from the run itself rather
    // than assumed: at $40 = 0 the step is exactly 1.00 px so the sub-pixel
    // byte never moves, and if the ship never nears $F0 the wrong clamp never
    // bites. Reporting that is the point -- a control that stayed green
    // because there was nothing for it to break is not a passing control.
    let maxX = 0;
    for (let f = SEED; f <= LAST; f++) maxX = Math.max(maxX, tr.at(f)[0x360]);
    const speed = tr.at(SEED)[0x40];
    t.diagnostic(`${tr.base}: $40 = ${speed}, X reached ${maxX}`);
    for (const [name, fn] of Object.entries(VARIANTS)) {
      if (!fn) continue;
      const bad = freeRun(tr, fn);
      if (bad.length) { everRed.add(name); t.diagnostic(`  ${name.padEnd(17)} RED at frame ${bad[0].f} (${bad[0].k})`); }
      else t.diagnostic(`  ${name.padEnd(17)} green -- vacuous on this run`);
    }
  }
  const never = Object.entries(VARIANTS).filter(([n, f]) => f && !everRed.has(n)).map(([n]) => n);
  assert.deepStrictEqual(never, [],
    `never seen red on any run: ${never.join(', ')} -- the rules they guard are not doing work`);
});

test('speed is a 16-bit accumulator with 8-bit wrap, over all 17 measured levels', () => {
  // Table measured by forcing $40 and reading the 16-bit delta per frame
  // (NOTES-player.md 3). The last entry is the one that matters: `ADC #$02` at
  // $A009 is 8-bit, so $40 = 255 slips UNDER the ceiling and the ship moves at
  // HALF speed. A port that widens that add looks fine for 254 speed levels.
  const want = {
    0: 256, 1: 384, 2: 512, 3: 640, 4: 768, 5: 896, 6: 1024, 8: 1280,
    10: 1536, 12: 1792, 13: 1920, 14: 2048, 15: 2048, 16: 2048, 20: 2048,
    64: 2048, 255: 128,
  };
  for (const [lvl, step] of Object.entries(want)) {
    assert.strictEqual(speedStep(Number(lvl)), step, `$40 = ${lvl}`);
  }
});

test('the ring advances only while a direction is held', () => {
  const s = createState();
  s.obj.status[0] = 1; s.obj.x[0] = 100; s.obj.y[0] = 100;
  s.input.held = 0x80;                 // A button, no direction
  updatePlayer(s, res);
  assert.strictEqual(s.ring.cursor, 0, 'A alone advanced the ring');
  s.input.held = 0x01;                 // RIGHT
  updatePlayer(s, res);
  assert.strictEqual(s.ring.cursor, 1);
});

test('DOWN loses to UP at the floor, because of the pre-check', () => {
  // $A054's BCS falls through into the UP test, so at Y >= $C0 with both held
  // the ship goes UP. That is not the same as "DOWN has priority", and it is
  // the one place the two readings of the listing give different pictures.
  const s = createState();
  s.obj.status[0] = 1; s.obj.x[0] = 100; s.obj.y[0] = 0xC0;
  s.input.held = 0x04 | 0x08;          // DOWN + UP
  updatePlayer(s, res);
  assert.strictEqual(s.obj.y[0], 0xBF, 'UP was not honoured at the floor');
  assert.strictEqual(s.zp.tilt, 3, 'tilt should be nose-up');

  const s2 = createState();
  s2.obj.status[0] = 1; s2.obj.x[0] = 100; s2.obj.y[0] = 100;
  s2.input.held = 0x04 | 0x08;
  updatePlayer(s2, res);
  assert.strictEqual(s2.obj.y[0], 101, 'away from the floor DOWN must win');
});

test('a dead player still has its position frozen', () => {
  // $9FFC: LDA $0100 / CMP #$02 / BCC $A006 / JMP $A16F -- movement, ring, tilt
  // and firing are all jumped over. Proved by intervention on the cartridge:
  // forcing $0100 = 3 for 60 frames produced ZERO writes to $0360.
  const s = createState();
  s.obj.status[0] = 3; s.obj.x[0] = 100; s.obj.y[0] = 100;
  s.input.held = 0x01;
  assert.strictEqual(updatePlayer(s, res), false);
  assert.strictEqual(s.obj.x[0], 100);
  assert.strictEqual(s.ring.cursor, 0);
});
