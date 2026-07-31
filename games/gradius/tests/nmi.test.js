// The frame, and the four orderings a port gets wrong by default.
//
// Each of these is checked against the cartridge's own per-frame trace where
// one exists, and against the ROM's arithmetic where it does not. They are
// separated from the player and renderer tests on purpose: every one of them
// is a property of WHEN something runs, not of what it computes, and those are
// the bugs that survive a suite of correct-looking unit tests.

import test from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { createState } from '../src/state.js';
import { bootState } from '../src/main.js';
import { nmi } from '../src/nmi.js';
import { readJoypad } from '../src/input.js';
import { advanceCamera, latchScroll } from '../src/camera.js';
import { rotateBase, nextSlot } from '../src/oam.js';
import { GAME, headlessResources } from './helpers.js';

const res = headlessResources(0);
const TRACE = join(GAME, 'tools', 'oracle', 'out', 'playermodel.json');
const trace = existsSync(TRACE) ? JSON.parse(readFileSync(TRACE, 'utf8')) : null;

test('input lead is ZERO: a button pressed on frame N moves the ship on frame N', () => {
  // MEASURED twice on the cartridge, from two directions: START on game frame
  // 220 changes the mode on frame 220, and RIGHT held from frame 400 takes
  // $0360 from 80 to 81 on frame 400. The mechanism is the order -- $81BF at
  // $80A4, the state machine at $80AA, six instructions apart in one NMI.
  const s = bootState(res.manifest);
  const x0 = s.obj.x[0];
  nmi(s, 0x01, res);                      // RIGHT, first frame it is held
  assert.strictEqual(s.obj.x[0], x0 + 1, 'the ship did not move on the press frame');
});

test('$0005 is the EDGE and $0007 is HELD', () => {
  const s = createState();
  readJoypad(s, 0x11);
  assert.strictEqual(s.input.held, 0x11);
  assert.strictEqual(s.input.pressed, 0x11);
  readJoypad(s, 0x11);
  assert.strictEqual(s.input.held, 0x11);
  assert.strictEqual(s.input.pressed, 0x00, 'a held button produced a second edge');
  readJoypad(s, 0x13);
  assert.strictEqual(s.input.pressed, 0x02, 'only the newly-pressed bit should be set');
});

test('the camera advances exactly 1/2 pixel per frame', () => {
  // $98EE: LDA #$80 / ADC $3D -- MEASURED as exactly $80 on all 3,207 frames
  // it ran, and exactly 0 on the 789 it did not.
  const s = createState();
  for (let i = 0; i < 512; i++) advanceCamera(s);
  assert.strictEqual((s.cam.hi << 8) | s.cam.lo, 256, '512 frames should be 256 px');
  assert.strictEqual(s.cam.sub, 0);
});

test('the scroll SHADOW lags the camera by one frame and the LATCH by two', (t) => {
  // Two hops, and they are separate facts.
  //
  //   $9A79 latches $12 from $3E during frame N, BEFORE $9AA0 calls $98EE.
  //   So $12 at the end of frame N is $3E as it stood at the end of N-1.
  //   MEASURED: $12[N] == $3E[N-1] on 3206/3206 consecutive scrolling frames,
  //   and == $3E[N] on only 1603/3206 -- the halves where the 1/2-px fraction
  //   did not carry, which is exactly how a port with this wrong stays right
  //   half the time and looks fine.
  //
  //   $8281 then pushes $12 into $2005 at the TOP of frame N+1, and that write
  //   is what draws N+1's picture. So the picture is TWO camera frames behind.
  //   Cross-check on a captured frame: f1200 has $3E = 4, $12 = 4 and
  //   bandA_scrollX = 3.
  const s = bootState(res.manifest);
  const cam = [], shadow = [], latch = [];
  for (let f = 0; f < 300; f++) {
    nmi(s, 0, res);
    latch.push(s.bandA.scrollX);   // what $8281 wrote at the top of this frame
    cam.push(s.cam.lo);            // $3E at the end of it
    shadow.push(s.ppu.scrollX);    // $12 at the end of it
  }
  const matches = (arr, k) => {
    let n = 0;
    for (let f = 2; f < cam.length; f++) if (arr[f] === cam[f - k]) n++;
    return n;
  };
  const total = cam.length - 2;
  t.diagnostic(`$12  vs $3E[N-k]: k=0 ${matches(shadow, 0)}/${total} `
             + `k=1 ${matches(shadow, 1)}/${total}`);
  t.diagnostic(`band vs $3E[N-k]: k=1 ${matches(latch, 1)}/${total} `
             + `k=2 ${matches(latch, 2)}/${total}`);
  assert.strictEqual(matches(shadow, 1), total, '$12 does not lag $3E by one frame');
  assert.strictEqual(matches(latch, 2), total, 'the latched scroll does not lag by two');
  // And the wrong models must be distinguishable, or this proves nothing. The
  // camera only moves every OTHER frame at 1/2 px, so a k-off-by-one model is
  // right about half the time -- which is the whole trap.
  assert.ok(matches(shadow, 0) < total, 'k=0 and k=1 are indistinguishable here');
  assert.ok(matches(latch, 1) < total, 'k=1 and k=2 are indistinguishable here');
});

test('the nametable-select bit is bit 0 of the camera page', () => {
  // $9A7D: LDA $3F / LSR A ... ADC #$00 -> PPUCTRL bit 0, giving a 512-pixel
  // treadmill across the two nametables. NOTES-render.md 2 reports the bit as
  // "never observed set", which is true of ITS corpus -- a driven run that dies
  // and restarts inside page 0. The attract-demo run reached page $06 and
  // matched bit 0 of $3F[N-1] with 0 violations of 3,207, and the streamer's
  // own address math ($9DB2: LDA $55 / AND #$01, picking $2000 vs $2400) says
  // the same thing from the other side.
  const s = createState();
  s.cam.hi = 1;
  s.ppu.ctrl = 0xA8;
  latchScroll(s);
  assert.strictEqual(s.ppu.ctrl & 1, 1, 'page 1 must select nametable $2400');
  s.cam.hi = 2;
  latchScroll(s);
  assert.strictEqual(s.ppu.ctrl & 1, 0);
});

test('a lag frame skips EVERYTHING, including the OAM DMA', () => {
  // $8073: LDY $04 / BNE $80B7. The bail is before the DMA at $8087 and before
  // the PPU register writes, so on the NES a lag frame is VISIBLE -- unlike
  // the Game Boy case, where only internal updates dropped.
  const s = bootState(res.manifest);
  nmi(s, 0, res);
  const oam = [...s.hwOam], x = s.obj.x[0], scroll = s.bandA.scrollX;
  s.shadowOam[0] = 0x42;                      // something the DMA would carry
  assert.strictEqual(nmi(s, 0x01, res, true), false);
  assert.deepStrictEqual([...s.hwOam], oam, 'a lag frame ran the OAM DMA');
  assert.strictEqual(s.obj.x[0], x, 'a lag frame moved the player');
  assert.strictEqual(s.bandA.scrollX, scroll, 'a lag frame wrote the scroll');
  assert.strictEqual(s.lagFrames, 1);
});

test('the OAM write cursor steps -15 slots and never lands on slot 0', () => {
  // $8AF3: CLC / ADC #$C4 / BEQ $8AF3. Slot 0 is reserved for the sprite the
  // split spins on, so the back-branch is structural.
  assert.strictEqual(nextSlot(188), 128);      // 188 + 196 = 384 & 255 = 128
  assert.strictEqual(nextSlot(60), 196);       // 60 + 196 = 256 -> 0 -> step again
  let c = 4;
  for (let i = 0; i < 200; i++) { c = nextSlot(c); assert.notStrictEqual(c, 0); }
});

test('the display-list base rotates +17 slots a frame, matching the cartridge', (t) => {
  // $8B39: LDA $2F / ADC #$44 / BNE / ADC #$04 -- THE FLICKER. The PPU drops
  // the 9th and 10th sprite on a line outright; the game rotates everyone's
  // OAM index so a different eight survive each frame.
  assert.strictEqual(rotateBase(188), 4, '188 + $44 = 256 -> the BNE fails -> +4');
  assert.strictEqual(rotateBase(4), 72);

  if (!trace) return t.skip('no playermodel.json');
  // Against the machine: every consecutive pair of $2F values in the trace.
  let checked = 0;
  for (let f = 1; f < trace.frames.length; f++) {
    const a = trace.frames[f - 1].oamBase, b = trace.frames[f].oamBase;
    if (a === 0 && b === 0) continue;                 // before the list runs
    if (rotateBase(a) !== b) continue;                 // mode changes reseed it
    checked++;
  }
  t.diagnostic(`$2F stepped by rotateBase() on ${checked} of ${trace.frames.length} frames`);
  assert.ok(checked > 400, `only ${checked} frames matched the rotation rule`);
});

test('the picture is TWO frames behind the update', () => {
  // $8B10 builds the display list at $80A7, BEFORE the state machine at $80AA
  // moves anything, and $8087 DMAs it at the top of the frame after that. So
  // hardware OAM on frame N shows the positions the ship had at the end of
  // frame N-2. NOTES-render.md 10 states this as ONE frame, which is what you
  // get if the list is built after the update -- it is not.
  const s = bootState(res.manifest);
  nmi(s, 0x01, res);                     // frame 1: ship moves to x = 81
  const xAfter1 = s.obj.x[0];
  nmi(s, 0x01, res);                     // frame 2: list built with x = 81
  nmi(s, 0x01, res);                     // frame 3: DMA carries it
  // The player's body sprites are the ones whose tile is $09/$0B/$0D.
  let found = null;
  for (let i = 0; i < 64; i++) if (s.hwOam[i * 4 + 1] === 0x0B) found = s.hwOam[i * 4 + 3];
  assert.notStrictEqual(found, null, 'the ship is not in hardware OAM at all');
  assert.strictEqual(found, xAfter1,
    `hardware OAM shows x=${found}; end of frame 1 was ${xAfter1}, now ${s.obj.x[0]}`);
});

test('the sprite-0 record is what the cartridge holds', (t) => {
  if (!trace) return t.skip('no playermodel.json');
  const s = bootState(res.manifest);
  nmi(s, 0, res);                        // builds the list ...
  nmi(s, 0, res);                        // ... and only now does the DMA carry it
  const live = trace.frames.filter((f) => f.s0y !== 0);
  assert.ok(live.length > 100, 'the trace never shows a live sprite 0');
  const f = live[live.length - 1];
  t.diagnostic(`cartridge sprite 0: y=${f.s0y} tile=$${f.s0t.toString(16)} `
             + `attr=$${f.s0a.toString(16)} x=${f.s0x}`);
  assert.deepStrictEqual([...s.hwOam.slice(0, 4)], [f.s0y, f.s0t, f.s0a, f.s0x]);
});
