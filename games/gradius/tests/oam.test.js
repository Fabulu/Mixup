// The display list, against hardware OAM.
//
// The metasprite expander was written from `sub_8AAC`'s bytes, so the check has
// to come from somewhere else: hardware OAM as it stood on a captured frame,
// which is the emulator's copy of what the PPU was actually reading. If the
// record format, the base, the -15-slot walk or the ORA mask is wrong, the four
// bytes at the four slots do not line up.

import test from 'node:test';
import assert from 'node:assert';

import { drawMetasprite, nextSlot, buildDisplayList, rotateBase,
         SPRITE0 } from '../src/oam.js';
import { bootState } from '../src/main.js';
import { loadCapture, captureSkipMessage, headlessResources } from './helpers.js';

const res = headlessResources(0);

test('expanding metasprite $01 reproduces the cartridge OAM byte for byte', (t) => {
  const cap = loadCapture('f1200');
  if (!cap) return t.skip(captureSkipMessage('f1200'));

  const baseX = cap.ram[0x360], baseY = cap.ram[0x320];
  const mask = cap.ram[0x180];                       // $0180,X -- the ORA mask
  t.diagnostic(`$0360 = ${baseX}, $0320 = ${baseY}, $0180 = ${mask}`);

  const oam = new Uint8Array(256).fill(0xF4);
  // 188, because $2F reads 4 at this frame and 188 + $44 = 256 -> $8B3E's BNE
  // fails -> +4. The list in hardware OAM was built on the previous frame.
  const end = drawMetasprite(oam, res.metasprites, 1, baseX, baseY, mask, 188);

  let slot = 188;
  for (let i = 0; i < res.metasprites[1].length; i++) {
    const got = [...oam.subarray(slot, slot + 4)];
    const want = [...cap.oam.subarray(slot, slot + 4)];
    assert.deepStrictEqual(got, want, `slot ${slot / 4}: ${got} vs cartridge ${want}`);
    slot = nextSlot(slot);
  }
  assert.strictEqual(end, slot, 'the cursor did not end where the walk did');
  t.diagnostic(`4 records at slots 47, 32, 17, 2 -- all 16 bytes identical`);
});

test('a positive dX that carries is dropped; a negative one is not', () => {
  // $8AE9: BMI $8B03 skips the BCS, so the cull is asymmetric. A record at
  // dx = +8 on a ship at x = 250 vanishes; the same record at dx = -8 wraps
  // and is drawn. That asymmetry is in the ROM and it is not obviously
  // intentional -- it is transcribed, not tidied.
  const table = { 9: [[0, 0x11, 0, 0x08]], 10: [[0, 0x11, 0, 0xF8]] };
  const a = new Uint8Array(256).fill(0);
  const endA = drawMetasprite(a, table, 9, 250, 100, 0, 4);
  assert.strictEqual(endA, 4, 'the culled record advanced the cursor');
  assert.strictEqual(a[7], 0, 'the culled record wrote an X byte');

  const b = new Uint8Array(256).fill(0);
  const endB = drawMetasprite(b, table, 10, 4, 100, 0, 4);
  assert.strictEqual(endB, nextSlot(4), 'the negative record was culled');
  assert.strictEqual(b[7], 0xFC, 'the negative record did not wrap');
});

test('the ORA mask reaches the attribute byte', () => {
  const table = { 9: [[0, 0x11, 0x01, 0]] };
  const o = new Uint8Array(256);
  drawMetasprite(o, table, 9, 10, 20, 0x20, 0);
  assert.strictEqual(o[2], 0x21, '$8AE0 ORA $9E did not happen');
});

// ------------------------------------------- $8B67-$8B86, the shield's sprite

test('$8B6B: a shielded ship draws a SECOND metasprite, $5A + (($02 >> 2) & 3)', () => {
  // MEASURED on the cartridge (`capsule-shield`'s script with $46 poked to 5):
  // $8B86 ran on 247 frames, and the corpus catches its absence -- deleting the
  // arm is RED on msExpanded/spriteRecords/spritesStored from f622 of
  // `capsule-sweep` and f402 of `capsule-shield`. This test is the SECOND
  // witness, and it holds the two things the corpus cannot see: which id is
  // picked, and where it is drawn.
  //
  // RED WHEN: the id is not $5A-based, the ($02 >> 2) & 3 cycle is wrong (a
  // `>> 1` or an AND #$07 both change it), or the sprite is drawn at some
  // position other than slot 0's -- $99/$9A are still the player's, because
  // $8B57/$8B5C loaded them for the expansion that has already happened.
  const s = bootState(res.manifest);
  s.obj.anim[0] = 1;                                // slot 0 draws at all
  s.obj.x[0] = 100; s.obj.y[0] = 80;
  s.zp.shield = 5;
  for (const [frame, id] of [[0, 0x5A], [4, 0x5B], [8, 0x5C], [12, 0x5D],
                             [16, 0x5A], [3, 0x5A], [7, 0x5B]]) {
    const t = bootState(res.manifest);
    t.obj.anim[0] = 1; t.obj.x[0] = 100; t.obj.y[0] = 80;
    t.zp.shield = 5; t.frame = frame;
    buildDisplayList(t, res.metasprites);
    const withShield = t.work.msExpanded;

    const u = bootState(res.manifest);
    u.obj.anim[0] = 1; u.obj.x[0] = 100; u.obj.y[0] = 80;
    u.frame = frame;                                // $46 = 0
    buildDisplayList(u, res.metasprites);
    assert.strictEqual(withShield, u.work.msExpanded + 1,
      `$02 = ${frame}: exactly one extra $8AAC`);

    // ...and it is THAT id, expanded at the player's own position. Only slot 0
    // draws in this state, so the whole page is sprite 0 + the ship + the field.
    const base = rotateBase(bootState(res.manifest).oamBase);
    const expect = new Uint8Array(256).fill(0xF4);
    expect.set(SPRITE0, 0);                         // $8B2F, the live record
    const after = drawMetasprite(expect, res.metasprites, 1, 100, 80, 0,
                                 base, null);
    drawMetasprite(expect, res.metasprites, id, 100, 80, 0, after, null);
    assert.deepStrictEqual([...t.shadowOam], [...expect],
      `$02 = ${frame}: metasprite ${id.toString(16)} at the ship's own X/Y`);
  }
});

test('$8B79: the LAST hit flashes -- $9E = 3 only while $46 == 1', () => {
  // MEASURED: $8B79 ran on exactly the 105 frames the run spent at $46 == 1
  // (f542-f646 of `capsule-shield`), and 0 times with no shield.
  //
  // THIS IS A GREEN BREAK CLOSED BY A TEST, and it is worth saying why the
  // oracle cannot do it: the compared OAM fields are sprite 0's four bytes and
  // the four work counters, and the flash changes NEITHER -- it changes the
  // attribute byte of a sprite the comparison does not read. Making $9E = 3
  // unconditional was GREEN on all 8 scenarios of this wave's break run.
  // RED WHEN: the CPY #$01 is dropped, or inverted, or the constant is not 3.
  const build = (shield) => {
    const s = bootState(res.manifest);
    s.obj.anim[0] = 1; s.obj.x[0] = 100; s.obj.y[0] = 80;
    s.obj.attrMask[0] = 0;                          // $0180 -- 0 in every run
    s.zp.shield = shield; s.frame = 0;
    buildDisplayList(s, res.metasprites);
    // The force field is expanded straight after the ship, so its first record
    // sits at the cursor the ship's expansion ended on.
    const alone = new Uint8Array(256).fill(0xF4);
    const cur = drawMetasprite(alone, res.metasprites, 1, 100, 80, 0,
                               rotateBase(bootState(res.manifest).oamBase), null);
    return s.shadowOam[(cur + 2) & 0xFF];
  };
  // Metasprite $5A's own first record carries attr $21, and $8AE0 ORs $9E into
  // it -- so the flash is $21 | 3 = $23, not a replacement. A port that STORED
  // $9E instead of ORing it would give 3 here and pass a `& 3` assertion.
  assert.strictEqual(build(2), 0x21, '$46 = 2: the record\'s own attribute');
  assert.strictEqual(build(5), 0x21, '$46 = 5: same');
  assert.strictEqual(build(1), 0x23, '$46 = 1: $9E = 3 ORed in, the flash');
});

test('$8B6F: no force field while $1B has any of bits 4-6 -- the wreck is bare', () => {
  // `LDA $1B / AND #$70 / BNE $8B89`. The corpus cannot see this: the only
  // scenario with a shield reaches $1B = $A0 only AFTER $46 has already drained
  // to 0 (f647 vs f658 on `capsule-shield`), so both the gate and the $46 test
  // decline together and deleting the gate was GREEN on all 8 scenarios.
  // RED WHEN: the mask is dropped, or is #$80 (which would delete the force
  // field during ordinary play instead, since $1B is $80 then).
  const at = (substate) => {
    const s = bootState(res.manifest);
    s.obj.anim[0] = 1; s.obj.x[0] = 100; s.obj.y[0] = 80;
    s.zp.shield = 3; s.substate = substate;
    buildDisplayList(s, res.metasprites);
    return s.work.msExpanded;
  };
  assert.strictEqual(at(0x80), at(0xA0) + 1, '$A0 (dying) draws no force field');
  assert.strictEqual(at(0x80), at(0x90) + 1, 'bit 4 suppresses it too');
  assert.strictEqual(at(0x80), at(0xC0) + 1, 'and bit 6');
  assert.strictEqual(at(0x80), at(0x8F), 'the low nibble does NOT');
});
