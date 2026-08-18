// ===============================================================================================
// W423 -- DOCKET D58. THE `$28BBAC` TIER GETS ITS OWN POSTING PATH.
// ===============================================================================================
//
// THE OWNER'S REPORT: "boss explosion doesn't have a sound on level one. None of the other levels
// likely do either."
//
// **THE SECOND SENTENCE IS RIGHT, AND FOR A STRUCTURAL REASON.** These are not per-level cues.
// Five sites across five files -- the boss clear, the ending block, the game-over screen,
// hibachi2 and the scroll VM -- all reach `$28C170`, and `sound.js` had exactly one posting path,
// built for a DIFFERENT packer. So one gap silenced all of them at once.
//
// WHY IT WAS NOT SIMPLY A MISSING `WRAPPERS` ROW, which is the fix that looks obvious and is
// wrong. Every row in that table sets THREE immediates (id, pan, channel) and reaches `$28BB04`.
// `$28C170` sets TWO registers and reaches `$28BBAC`, which packs a longword with a ZERO low word:
// no id byte, no channel nibble, no gate and no pan tail. A row would have invented three fields
// the cartridge never loads. `postWrapper`'s `no wrapper at $28C170` throw was the honest state.
//
// SECTION 1  the packer, byte for byte out of the image
// SECTION 2  the longword $28C170 actually posts
// SECTION 3  $28C186 takes D1 from the CALLER
// SECTION 4  THERE IS NO GATE ON THIS PATH -- the trap
// SECTION 5  a full ring drops, and the counters see it
// SECTION 6  the path refuses anything that is not this tier
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { postBgmCommand, BGM_COMMANDS, enqueue } from '../src/sound.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const SKIP = existsSync(IMAGE) ? false
  : path.basename(IMAGE) + ' absent -- run tools/export-tables.py. THIS IS A SKIP, NOT A PASS.';
const IMG = SKIP ? null : readFileSync(IMAGE);

const bytesAt = (addr, n) => Array.from(IMG.subarray(addr, addr + n));
const newSound = () => ({ postCount: 0, framePosts: 0, dropCount: 0, frameDrops: 0 });

const RING = 0x81DD1E;

test('SECTION 1: $28BBAC is the packer this path implements, read from the image',
  { skip: SKIP }, () => {
    assert.deepEqual(bytesAt(0x28bbac, 2), [0xe1, 0x48], '$28BBAC lsl.w #8,D0');
    assert.deepEqual(bytesAt(0x28bbae, 2), [0x80, 0x41], '$28BBAE or.w D1,D0');
    assert.deepEqual(bytesAt(0x28bbb0, 2), [0x48, 0x40], '$28BBB0 swap D0');
    assert.deepEqual(bytesAt(0x28bbb2, 4), [0x30, 0x3c, 0x00, 0x00],
      '$28BBB2 move.w #$0,D0 -- the LOW word is zeroed, which is the whole shape');
    assert.deepEqual(bytesAt(0x28bbb6, 2), [0x60, 0x00], '$28BBB6 bra.w');
    // TRAP: the branch target is the EXTENSION WORD address plus the displacement.
    const disp = ((IMG[0x28bbb8] << 8) | IMG[0x28bbb9]) - 0x10000;
    assert.equal(0x28bbb8 + disp, 0x28baa0,
      'the target is $28BAA0, the ring enqueue -- NOT a gate routine');
  });

test('SECTION 1: $28C170 loads D0=$15 and D1=0, and calls that packer ABSOLUTE',
  { skip: SKIP }, () => {
    assert.deepEqual(bytesAt(0x28c174, 4), [0x30, 0x3c, 0x00, 0x15], '$28C174 move.w #$15,D0');
    assert.deepEqual(bytesAt(0x28c178, 2), [0x72, 0x00], '$28C178 moveq #0,D1');
    assert.deepEqual(bytesAt(0x28c17a, 6), [0x4e, 0xb9, 0x00, 0x28, 0xbb, 0xac],
      '$28C17A jsr $28BBAC -- absolute, not (d16,PC)');
    assert.equal(BGM_COMMANDS[0x28c170], 0x15, 'and the table agrees with the bytes');
  });

test('SECTION 2: $28C170 posts exactly $15000000', () => {
  const ram = new Ram();
  const sound = newSound();
  assert.equal(postBgmCommand(ram, sound, 0x28c170), true, 'it posts');
  assert.equal(sound.postCount, 1);
  assert.equal(ram.u32(RING), 0x15000000 >>> 0,
    'slot 0 holds $15000000 -- packed word in the high half, low word ZERO');
});

test('SECTION 2: the low word is zero, which is what separates this from $28BB04', () => {
  const ram = new Ram();
  postBgmCommand(ram, newSound(), 0x28c170);
  assert.equal(ram.u32(RING) & 0xFFFF, 0,
    'no id byte, no channel nibble -- a WRAPPERS row would have put values here');
});

test('SECTION 3: $28C186 takes D1 from the CALLER, and D1 lands in the low byte', () => {
  // The sibling is the reason the signature has a d1 parameter at all. Hard-coding
  // 0 would silently post the wrong command for every caller that passes one.
  for (const d1 of [0x00, 0x01, 0x7f, 0x80, 0xff]) {
    const ram = new Ram();
    postBgmCommand(ram, newSound(), 0x28c186, d1);
    assert.equal(ram.u32(RING) >>> 0, (((0x1600 | d1) & 0xffff) << 16) >>> 0,
      'D1=' + d1 + ' packs into the low byte of the high word');
  }
});

test('SECTION 3: the pack is WORD-sized, so a wide D1 cannot leak into the command', () => {
  // lsl.w and or.w are both word operations. A longword shift would carry bits
  // the 68k discards, and the command byte is what would be corrupted.
  const ram = new Ram();
  postBgmCommand(ram, newSound(), 0x28c186, 0x1ff);
  assert.equal((ram.u32(RING) >>> 24) & 0xff, 0x16,
    'the command byte is still $16 -- the excess bits were masked, not carried');
});

test('SECTION 4: THERE IS NO GATE -- the cue posts with every gate word set', () => {
  // THE TRAP. $28BBAC branches straight to $28BAA0 and never reaches $28C02A or
  // $28C0AE, so it has no gate. Running these through the SFX or BGM gate would
  // silence a boss clear whenever the gate happened to be down -- which is the
  // very defect being fixed, reintroduced one layer lower.
  const ram = new Ram();
  for (const g of [0x81DEB4, 0x81DEB6, 0x81DEB8, 0x81DEBA, 0x81DEBC]) ram.setU16(g, 0xffff);
  const sound = newSound();
  assert.equal(postBgmCommand(ram, sound, 0x28c170), true,
    'it posted anyway -- no gate is consulted on this path');
  assert.equal(sound.dropCount, 0, 'and nothing was counted as a drop');
});

test('SECTION 5: a full ring DROPS, and the counters see it', () => {
  // A full ring is a real failure mode and must stay visible. Faking a post here
  // would make the gate blind to sustained over-posting.
  const ram = new Ram();
  const sound = newSound();
  let dropped = false;
  for (let i = 0; i < 400 && !dropped; i++) {
    if (postBgmCommand(ram, sound, 0x28c170) === false) dropped = true;
  }
  assert.equal(dropped, true, 'a full ring eventually refuses');
  assert.ok(sound.dropCount > 0, 'and the drop counter moved');
  assert.ok(sound.postCount > 0, 'after having posted the cues that fitted');
});

test('SECTION 6: the path REFUSES a wrapper that is not this tier', () => {
  // Loud, not silent. $28C25A is an ordinary WRAPPERS row and must never come
  // through here -- it has an id, a pan and a channel this packer cannot carry.
  const ram = new Ram();
  assert.throws(() => postBgmCommand(ram, newSound(), 0x28c25a),
    /no \$28BBAC-tier command/,
    'an ordinary wrapper is rejected rather than posted with invented fields');
});

test('SECTION 6: the tier has exactly the two members the ROM has', () => {
  assert.deepEqual(Object.keys(BGM_COMMANDS).map(Number).sort((a, b) => a - b),
    [0x28c170, 0x28c186],
    '$28C170 and its sibling $28C186 -- nothing else reaches $28BBAC by this shape');
});
