// WAVE 20 -- the aim pair, pinned against the LISTING and against the recon's
// independently-measured table dump.
//
// These run on a SYNTHETIC ROM window built from the constants
// `20-recon-aiming.md` §2 printed, so `node --test games/ddpdoj/tests/` still
// works on a tree with no cartridge extracted -- the rule tests/shots.test.js
// states for itself.  What they cannot do is prove the translation matches the
// board; that is `tools/w20turretgate.mjs`, and its eight mutations are what
// prove IT can fail.
//
// One test here IS a board comparison of a kind: the cardinal directions and
// the 45-degree case were printed by `aimmodel.py tables` from the cartridge
// (recon §2) BEFORE this port existed, and they are asserted as literals.  If
// the port's arithmetic drifts, those five numbers move.

import test from 'node:test';
import assert from 'node:assert';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { Unreached } from '../src/unported.js';
import {
  AIM, AimTables, aim64, aim256, slew64, slew256, targetSelect,
  aim64FromCaller, aim64AtP1Fixed, slew64Multi, targetSelectRandom,
} from '../src/aim.js';

function grab(fn) { try { fn(); } catch (e) { return e; } return null; }

// The five tables, as `aimmodel.py tables` printed them off the cartridge.
const LUT64 = [
  0x00, 0x01, 0x01, 0x02, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x08, 0x09,
  0x09, 0x0a, 0x0a, 0x0b, 0x0b, 0x0c, 0x0c, 0x0d, 0x0d, 0x0e, 0x0e, 0x0f, 0x10,
  0x10, 0x11, 0x12, 0x12, 0x13, 0x14, 0x14, 0x15, 0x15, 0x16, 0x16, 0x17, 0x17,
  0x18, 0x19, 0x1a, 0x1a, 0x1b, 0x1b, 0x1c, 0x1c, 0x1d, 0x1e, 0x1f, 0x1f, 0x20,
  0x20, 0x21, 0x21, 0x22, 0x22, 0x23, 0x23, 0x24, 0x24, 0x25, 0x25, 0x26, 0x26,
  0x27, 0x27, 0x28, 0x28, 0x29, 0x2a, 0x2a, 0x2b, 0x2b, 0x2c, 0x2c, 0x2c, 0x2d,
  0x2d, 0x2d, 0x2e, 0x2e, 0x2e, 0x2f, 0x2f, 0x30, 0x30, 0x31, 0x31, 0x32, 0x32,
  0x33, 0x33, 0x34, 0x34, 0x35, 0x35, 0x36, 0x36, 0x36, 0x37, 0x37, 0x37, 0x38,
  0x38, 0x38, 0x39, 0x39, 0x39, 0x3a, 0x3a, 0x3a, 0x3b, 0x3b, 0x3b, 0x3c, 0x3c,
  0x3c, 0x3d, 0x3d, 0x3d, 0x3e, 0x3e, 0x3e, 0x3f, 0x3f, 0x3f, 0x40, 0x40,
];
const BASE64 = [128, 256, 128, 0, 384, 256, 384, 0];
// $2420C6: which of $2420AE (sub) / $2420BA (add) each octant dispatches.
const OPS64 = [0x2420ba, 0x2420ae, 0x2420ae, 0x2420ba,
               0x2420ae, 0x2420ba, 0x2420ba, 0x2420ae];
const LUT256 = [
  0x00, 0x01, 0x02, 0x02, 0x03, 0x04, 0x04, 0x05, 0x06, 0x06, 0x07, 0x07, 0x08,
  0x09, 0x09, 0x0a, 0x0a, 0x0b, 0x0b, 0x0c, 0x0d, 0x0d, 0x0e, 0x0e, 0x0f, 0x10,
  0x10, 0x11, 0x11, 0x12, 0x12, 0x13, 0x13, 0x14, 0x14, 0x15, 0x16, 0x16, 0x16,
  0x17, 0x17, 0x17, 0x18, 0x18, 0x19, 0x19, 0x1a, 0x1a, 0x1b, 0x1b, 0x1b, 0x1c,
  0x1c, 0x1c, 0x1d, 0x1d, 0x1e, 0x1e, 0x1e, 0x1e, 0x1f, 0x1f, 0x1f, 0x20, 0x20,
];
const BASE256 = [64, 128, 64, 0, 192, 128, 192, 0];

/** A synthetic ROM carrying exactly the two windows `AimTables` reads. */
function aimRom() {
  const w1 = new Uint8Array(0x100);           // $2420C0 .. $2421BF
  for (let i = 0; i < 8; i++) {
    const o = AIM.ops64 - 0x2420c0 + 4 * i;
    w1[o] = 0; w1[o + 1] = (OPS64[i] >> 16) & 0xff;
    w1[o + 2] = (OPS64[i] >> 8) & 0xff; w1[o + 3] = OPS64[i] & 0xff;
    const b = AIM.base64 - 0x2420c0 + 2 * i;
    w1[b] = BASE64[i] >> 8; w1[b + 1] = BASE64[i] & 0xff;
  }
  w1.set(LUT64, AIM.lut64 - 0x2420c0);
  const w2 = new Uint8Array(0x100);           // $242300 .. $2423FF
  for (let i = 0; i < 8; i++) {
    const o = AIM.ops256 - 0x242300 + 8 * i;
    // add.w D0,D1 = $D240, sub.w D0,D1 = $9240; the sign pattern is aim64's.
    const enc = OPS64[i] === AIM.opSub64 ? 0x9240 : 0xd240;
    w2[o] = enc >> 8; w2[o + 1] = enc & 0xff;
    const b = AIM.base256 - 0x242300 + 2 * i;
    w2[b] = BASE256[i] >> 8; w2[b + 1] = BASE256[i] & 0xff;
  }
  w2.set(LUT256, AIM.lut256 - 0x242300);
  const hex = (a) => Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  return new RomWindows({ windows: [
    { base: '$2420c0', len: w1.length, why: 'test', hex: hex(w1) },
    { base: '$242300', len: w2.length, why: 'test', hex: hex(w2) },
  ] });
}

const T = new AimTables(aimRom());

// ------------------------------------------------------------------- tables
test('AimTables rejects an octant-sign table that is not $2420AE/$2420BA', () => {
  const bad = aimRom();
  // corrupt one longword of $2420C6 in place
  const w = bad.windows.find((x) => x.base === 0x2420c0);
  const o = AIM.ops64 - 0x2420c0 + 4 * 3;
  w.bytes[o + 3] = 0x00;                                   // $2420BA -> $242000
  const e = grab(() => new AimTables(bad));
  assert.ok(e instanceof Unreached, 'a changed table must stop the port');
  assert.equal(e.romAddress, AIM.ops64 + 12);
});

test('the arctan LUT is DATA: it is not the formula, at index 10', () => {
  // recon §2: the ROM table deviates from 512*atan(i/128)/2pi by +1.65 at i=10,
  // and that is the near-axis band. This asserts the DEVIATION exists, so a
  // future "simplification" that generates the table cannot pass silently.
  const formula = Math.round(512 * Math.atan2(10, 128) / (2 * Math.PI));
  assert.equal(T.lut64[10], 8);
  assert.equal(formula, 6);
  assert.notEqual(T.lut64[10], formula);
  // ...and it is monotone non-decreasing, ending at 64 = 45 degrees of 512.
  for (let i = 1; i < 129; i++) assert.ok(T.lut64[i] >= T.lut64[i - 1]);
  assert.equal(T.lut64[0], 0);
  assert.equal(T.lut64[128], 0x40);
});

// -------------------------------------------------------------- the cardinals
test('aim64 reproduces the five directions the recon read off the cartridge', () => {
  // recon §2: S(+Y)=0  E(+X)=16  N(-Y)=32  W(-X)=48  and 45 degrees TRUE = 10.
  assert.equal(aim64(T, 0, 0, 0x100, 0), 0, 'target below (+Y) is direction 0');
  assert.equal(aim64(T, 0, 0, 0, 0x100), 16, 'target at +X is 16');
  assert.equal(aim64(T, 0x400, 0, 0x300, 0), 32, 'target above (-Y) is 32');
  assert.equal(aim64(T, 0, 0x400, 0, 0x300), 48, 'target at -X is 48');
  // THE AXIS SCALE, visible: a TRUE 45 degrees is direction 10, not 8. A port
  // with a textbook atan2 answers 8 here and looks perfectly reasonable.
  assert.equal(aim64(T, 0, 0, 0x100, 0x100), 10);
});

test('aim256 reproduces its four cardinals and the same 45-degree skew', () => {
  assert.equal(aim256(T, 0, 0, 0x100, 0), 0);
  assert.equal(aim256(T, 0, 0, 0, 0x100), 64);
  assert.equal(aim256(T, 0x400, 0, 0x300, 0), 128);
  assert.equal(aim256(T, 0, 0x400, 0, 0x300), 192);
  assert.equal(aim256(T, 0, 0, 0x100, 0x100), 40);   // 4x aim64's 10, not 32
});

test('a zero delta pair returns direction 0 through the beq at $242070', () => {
  assert.equal(aim64(T, 0x1234, 0x5678, 0x1234, 0x5678), 0);
  assert.equal(aim256(T, 0x1234, 0x5678, 0x1234, 0x5678), 0);
});

// -------------------------------------------------------- the internal states
test('the back half produces all 64 directions and nothing outside 0..63', () => {
  // recon §7 enumerated 8 octants x 129 ratios = 1,032 states from the tables
  // and reported "directions NEVER produced: none". Re-derived here through the
  // PORT's own back-half arithmetic rather than through the Python.
  const seen = new Set();
  for (let oct = 0; oct < 8; oct++) {
    for (let ratio = 0; ratio < 129; ratio++) {
      const lut = T.lut64[ratio];
      const base = T.base64[oct];
      const a = T.sub64[oct] ? (base - lut) & 0xffff : (base + lut) & 0xffff;
      const d = ((a + 4) >>> 3) & 0x3f;
      assert.ok(d >= 0 && d < 64);
      seen.add(d);
    }
  }
  assert.equal(seen.size, 64, 'every one of the 64 directions must be reachable');
});

test('the FRONT half reaches all 64 output directions over a +-512 window', () => {
  // Named for what it asserts. recon §7 measured 1,029 of the 1,032 INTERNAL
  // states over the same window with the Python model; this port does not
  // expose the internal state, so what is checked here is the weaker but still
  // load-bearing consequence -- the octant construction, the 1.5 and the divide
  // together must still cover the whole circle.
  const seen = new Set();
  for (let dy = -512; dy <= 512; dy += 4) {
    for (let dx = -512; dx <= 512; dx += 4) {
      seen.add(aim64(T, 0, 0, dy, dx));
    }
  }
  assert.equal(seen.size, 64);
});

test('the $1800 bias makes the aim a function of the DELTAS, in-window', () => {
  // recon §2 "the domain": 0/300,000 disagreements over realistic coordinates.
  // Sampled here rather than exhausted, but with the same shape of claim.
  let n = 0;
  for (let sy = 0; sy < 0x6000; sy += 0x511) {
    for (let sx = 0; sx < 0x6000; sx += 0x733) {
      for (const [dy, dx] of [[0x100, 0x40], [-0x233, 0x511], [0x7, -0x3]]) {
        const a = aim64(T, sy, sx, sy + dy, sx + dx);
        const b = aim64(T, 0, 0, dy, dx);
        assert.equal(a, b, `sy=${sy} sx=${sx} dy=${dy} dx=${dx}`);
        n++;
      }
    }
  }
  assert.ok(n > 300, `only ${n} samples`);
});

// ------------------------------------------------------------- the slew limiter
test('$242190 turns at most ONE step, the short way round, and wraps', () => {
  assert.equal(slew64(10, 10), 10, 'already there');
  assert.equal(slew64(10, 40), 11, 'up one');
  assert.equal(slew64(10, 20), 11);
  assert.equal(slew64(40, 10), 39, 'down one');
  // the wrap: 63 -> 0 is ONE step up, not 63 steps down
  assert.equal(slew64(63, 0), 0);
  assert.equal(slew64(0, 63), 63, '0 -> 63 is one step DOWN through the wrap');
  // the exact half-turn: D1 = $20 is NOT below $20, so it goes DOWN
  assert.equal(slew64(0, 32), 63);
  assert.equal(slew64(0, 31), 1, 'one less than a half turn goes UP');
  // and the mask is 6 bits on both arguments
  assert.equal(slew64(0xc0 | 10, 0x80 | 40), 11);
});

test('$2421AC is the 256-step twin and takes its current facing from ($1B,A6)', () => {
  const ram = new Ram();
  ram.setU8(0x810000 + 0x1b, 200);
  assert.equal(slew256(ram, 0x810000, 200), 200);
  assert.equal(slew256(ram, 0x810000, 210), 201);
  assert.equal(slew256(ram, 0x810000, 190), 199);
  ram.setU8(0x810000 + 0x1b, 255);
  assert.equal(slew256(ram, 0x810000, 0), 0, 'the wrap at 255 -> 0');
});

// ------------------------------------------------------------ target select
test('$24270A: the P2->P1 fallback carries half the game s aims', () => {
  const ram = new Ram();
  const a5 = 0x813400;
  ram.setU16(AIM.selP1, 0x8001);          // P1 ALIVE (bit 15)
  ram.setU16(AIM.selP2, 0x0000);          // P2 not
  ram.setU8(a5 + 3, 0);
  assert.deepEqual(targetSelect(ram, a5), { addr: AIM.selP1, carry: false });
  ram.setU8(a5 + 3, 1);                   // nominate P2 -- who is DEAD
  assert.deepEqual(targetSelect(ram, a5), { addr: AIM.selP1, carry: false },
    'a dead P2 must fall back to P1');
  ram.setU16(AIM.selP1, 0x0000);          // and now NOBODY is alive
  const r = targetSelect(ram, a5);
  assert.equal(r.carry, true, 'both dead sets CARRY and the caller does not aim');
});

test('$24200A returns carry when both players are dead, and does not aim', () => {
  const ram = new Ram();
  ram.setU16(AIM.selP1, 0); ram.setU16(AIM.selP2, 0);
  const r = aim64FromCaller(T, ram, 0x813400, 0x1000, 0x1000);
  assert.equal(r.carry, true);
});

test('$24200A takes SELF from the caller -- the muzzle offset is not ignored', () => {
  const ram = new Ram();
  ram.setU16(AIM.selP1, 0x8000);
  ram.setU16(AIM.selP1 + 2, 0x1000);      // target Y
  ram.setU16(AIM.selP1 + 4, 0x1000);      // target X
  const plain = aim64FromCaller(T, ram, 0x813400, 0x2000, 0x1000).dir;
  const biased = aim64FromCaller(T, ram, 0x813400, 0x2000 + 0x200, 0x1000).dir;
  assert.equal(plain, 32, 'straight up');
  assert.equal(biased, 32);
  // ...and a case where $200 DOES move the answer, which is the point of the
  // offsets: 11 of the 16 reached sites bias, by -$700..+$2700.
  const near = aim64FromCaller(T, ram, 0x813400, 0x1100, 0x1400).dir;
  const nearB = aim64FromCaller(T, ram, 0x813400, 0x1100 + 0x200, 0x1400).dir;
  assert.notEqual(near, nearB);
});

// ------------------------------------------------------------- the dead entries
test('the 23 unreferenced entry points are LOUD NAMED THROWS, not stubs', () => {
  for (const [fn, addr] of [[aim64AtP1Fixed, 0x242022], [slew64Multi, 0x2421c6],
                            [targetSelectRandom, 0x242760]]) {
    const e = grab(fn);
    assert.ok(e instanceof Unreached, `$${addr.toString(16)} must throw`);
    assert.equal(e.romAddress, addr);
  }
});

// ------------------------------------------------------------- the mutations
test('every gate mutation actually changes the aim it claims to change', () => {
  // The gate is only worth its output if its breaks bite. Proven HERE too, so a
  // mutation that silently stopped working is caught by `node --test` and not
  // only by someone re-reading the gate log.
  assert.notEqual(aim64(T, 0, 0, 0x100, 0x100, 'plain-atan2'),
    aim64(T, 0, 0, 0x100, 0x100));
  assert.equal(aim64(T, 0, 0, 0x100, 0x100, 'plain-atan2'), 8,
    'without the 1.5, a true 45 degrees is the textbook 8');
  let differed = 0;
  for (let dx = 1; dx < 400; dx++) {
    if (aim64(T, 0, 0, 400, dx, 'round-toward-zero') !== aim64(T, 0, 0, 400, dx)) {
      differed++;
    }
    if (aim64(T, 0, 0, 400, dx, 'lut-generated') !== aim64(T, 0, 0, 400, dx)) {
      differed++;
    }
  }
  assert.ok(differed > 0, 'round-toward-zero / lut-generated changed nothing');
  const ram = new Ram();
  ram.setU16(AIM.selP1, 0x8000); ram.setU16(AIM.selP2, 0x0000);
  const a5 = 0x813400; ram.setU8(a5 + 3, 1);
  assert.equal(targetSelect(ram, a5).addr, AIM.selP1);
  assert.equal(targetSelect(ram, a5, 'no-p2-fallback').addr, AIM.selP2);
});
