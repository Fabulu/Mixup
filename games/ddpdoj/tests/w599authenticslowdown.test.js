// W599: make the browser spend real display time on every vblank the cartridge
// frame-sync governor arms. The simulation already models those vblanks; this
// wave connects that authentic logic/video split to presentation cadence.

import test from 'node:test';
import assert from 'node:assert/strict';

import { RAM } from '../src/machine.js';
import { Ram } from '../src/ram.js';
import { frameSync } from '../src/framesync.js';
import { Demo } from '../src/web/app.js';

const GOV = {
  t23C3EE: [20],
  t23C402: [20],
  t23C416: [4],
  t23C420: [4],
};

function loopStub(armedVblanks, afterStep = null, mods = null) {
  let calls = 0;
  return {
    running: true,
    last: 100,
    periodMs: 10,
    game: { armedVblanks },
    mods,
    acc: 0,
    playback: null,
    dirty: false,
    capFrame: null,
    stepsRun: 0,
    hudAt: 0,
    hudSteps: 0,
    soundController: null,
    step() {
      calls++;
      this.stepsRun++;
      afterStep?.(this, calls);
    },
    draw() { return calls; },
    get calls() { return calls; },
  };
}

test('W599 cartridge governor derives the slowdown arm from live projectile pools', () => {
  const ram = new Ram();
  ram.setU16(RAM.mod3Phase, 0);
  ram.setU16(0x81b40c, 12);
  ram.setU16(0x81295c, 3);
  ram.setU16(0x81295e, 2);

  assert.equal(frameSync(ram, GOV), 1, '12 + 3 + 2*2 stays below threshold 20');
  assert.equal(ram.u8(RAM.semaphore), 1);

  ram.setU16(0x81b40c, 13);
  assert.equal(frameSync(ram, GOV), 2, '13 + 3 + 2*2 reaches threshold 20');
  assert.equal(ram.u8(RAM.semaphore), 2);
  assert.equal(ram.u16(0x803932), 2, 'the cartridge hysteresis counter advances');
});

test('W599 browser waits one base period for every cartridge-armed vblank', () => {
  const demo = loopStub(2);

  Demo.prototype.loop.call(demo, 110);
  assert.equal(demo.calls, 0, 'one display period is only half of this logic interval');
  Demo.prototype.loop.call(demo, 120);
  assert.equal(demo.calls, 1);
  assert.equal(demo.acc, 0);
});

test('W599 browser honors every cartridge arm value and composes timing mods', () => {
  const longArm = loopStub(5);
  Demo.prototype.loop.call(longArm, 150);
  assert.equal(longArm.calls, 1, 'five base periods produce one complete logic frame');

  const turbo = { loadout: { timing: { scale: 0.5 } }, runtime: {} };
  const modded = loopStub(2, null, turbo);
  Demo.prototype.loop.call(modded, 110);
  assert.equal(modded.calls, 1, 'turbo halves the authentic two-vblank interval');
});

test('W599 catch-up recalculates slowdown after every complete logic iteration', () => {
  const demo = loopStub(1, (stub, call) => {
    if (call === 1) stub.game.armedVblanks = 2;
  });

  Demo.prototype.loop.call(demo, 150);
  assert.equal(demo.calls, 3, '10 ms + 20 ms + 20 ms consume the 50 ms interval');
  assert.equal(demo.acc, 0);
});
