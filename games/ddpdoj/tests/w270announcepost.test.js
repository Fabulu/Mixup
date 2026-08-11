// W270: the PRODUCER side of the announcement -- $260A20 and the four posters -- and
// that it agrees with the consumer W269 registered.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { deferReset } from '../src/background.js';
import {
  announceBox260A20, announcePost, announceChoose260ACA, announce260B30,
} from '../src/rank.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const BOX = [0x813162, 0x813166];
const CONFIG = 0x803808, CONFIG_B = 0x80380b;
const LOOP = 0x813098, STAGE = 0x813092;
const SLOT = 0x80e240;                     // ALLOC.table slot 0, as W243's test uses

const POSTERS = [
  [0x260a88, 0x00, false],
  [0x260a9a, 0x04, true],
  [0x260ab6, 0x08, false],
  [0x260af2, 0x0c, true],
];

test('W270 $260A20 picks the side mailbox the consumer reads', () => {
  assert.equal(announceBox260A20(0), BOX[0], '$260A20 lea $813162');
  assert.equal(announceBox260A20(1), BOX[1], '$260A2C lea $813166');
  // Any non-zero D0 is P2: the ROM does `tst.b d0 / beq`, not a compare with 1.
  assert.equal(announceBox260A20(2), BOX[1]);
  assert.equal(announceBox260A20(0xff), BOX[1]);
});

test('W270 each poster writes its own state, and both sides are independent', () => {
  for (const [site, state] of POSTERS) {
    for (const side of [0, 1]) {
      const ram = new Ram();
      assert.equal(announcePost(ram, site, side), true, `$${site.toString(16)} posted`);
      assert.equal(ram.u16(BOX[side]), 1, 'the flag');
      assert.equal(ram.u16(BOX[side] + 2), state, 'and the state');
      assert.equal(ram.u32(BOX[1 - side]), 0, 'the other side untouched');
    }
  }
});

test('W270 the two GUARDED posters refuse to re-post their own state', () => {
  // $260A9E / $260AF8 -- re-posting would restart the consumer's scroll from its first
  // cell, which is why those two compare before writing and the other two do not.
  for (const [site, state, guarded] of POSTERS) {
    const ram = new Ram();
    ram.setU16(BOX[0] + 2, state);
    ram.setU16(BOX[0], 0);                 // ...with the flag already consumed
    const again = announcePost(ram, site, 0);
    assert.equal(again, !guarded, `$${site.toString(16)} guarded=${guarded}`);
    assert.equal(ram.u16(BOX[0]), guarded ? 0 : 1,
      guarded ? 'the guard left the flag down' : 'the unguarded one raised it again');
  }
});

test('W270 a guarded poster still posts a DIFFERENT state', () => {
  const ram = new Ram();
  ram.setU16(BOX[0] + 2, 0x08);            // some other state is up
  assert.equal(announcePost(ram, 0x260a9a, 0), true);
  assert.equal(ram.u16(BOX[0] + 2), 0x04, 'the guard is on the state, not on the flag');
});

test('W270 $260ACA is the FIFTH loop-specific rule', () => {
  // Only loop 2 AND stage 4 together reach state $4; everything else falls to $C, and
  // the two config bytes short-circuit to state 0 before the loop is even read.
  const cases = [
    { cfg: 9, cfgB: 0, loop: 0, stage: 0, want: 0x00, why: '$803808 >= 9' },
    { cfg: 0x12, cfgB: 0, loop: 1, stage: 4, want: 0x00, why: '...and it beats the loop' },
    { cfg: 0, cfgB: 1, loop: 1, stage: 4, want: 0x00, why: '$80380B == 1 likewise' },
    { cfg: 0, cfgB: 0, loop: 1, stage: 4, want: 0x04, why: 'LOOP 2 and stage 4' },
    { cfg: 0, cfgB: 0, loop: 0, stage: 4, want: 0x0c, why: 'stage 4 in loop 1 does NOT' },
    { cfg: 0, cfgB: 0, loop: 1, stage: 3, want: 0x0c, why: 'loop 2 elsewhere does NOT' },
    { cfg: 0, cfgB: 0, loop: 0, stage: 0, want: 0x0c, why: 'the ordinary case' },
  ];
  for (const c of cases) {
    const ram = new Ram();
    ram.setU8(CONFIG, c.cfg);
    ram.setU8(CONFIG_B, c.cfgB);
    ram.setU16(LOOP, c.loop);
    ram.setU16(STAGE, c.stage);
    announceChoose260ACA(ram, 0);
    assert.equal(ram.u16(BOX[0] + 2), c.want, c.why);
    assert.equal(ram.u16(BOX[0]), 1, 'and the flag is up either way');
  }
});

test('W270 $803808 is compared SIGNED, so a high byte is not "past 9"', () => {
  // `cmpi.b #$9,D0 / bge` on a byte moved into D0 -- $80 and up are NEGATIVE, so they
  // fall through to the loop test rather than short-circuiting to state 0. An unsigned
  // reading would send every high config byte to state 0.
  const ram = new Ram();
  ram.setU8(CONFIG, 0xf0);
  ram.setU16(LOOP, 1);
  ram.setU16(STAGE, 4);
  announceChoose260ACA(ram, 0);
  assert.equal(ram.u16(BOX[0] + 2), 0x04, '$F0 is negative, so the loop rule still runs');
});

test('W270 an address that is not one of the four is a loud throw', () => {
  const ram = new Ram();
  assert.throws(() => announcePost(ram, 0x260a34, 0),
    (e) => e.name === 'Unreached' && e.romAddress === 0x260a34
      && /\$260B6A/.test(e.message));
});

test('W270 PRODUCER AND CONSUMER AGREE, which is the whole point',
  { skip: SKIP }, () => {
    // The four states the posters write must be exactly the four `$260B6A` covers.
    // `announce260B30` throws by address on a state past the table, so driving each
    // posted state through it proves the pairing rather than assuming it.
    for (const [site, state] of POSTERS) {
      const ram = new Ram();
      deferReset(ram);
      const log = new UnportedLog();
      const ctx = { ram, rom: ROM, unported: log, unportedLog: log };
      ram.setU8(SLOT + 0x07, 0);                 // side 0
      announce260B30(ram, SLOT, 0, ctx);         // the INIT frame clears the mailbox
      announcePost(ram, site, 0);
      assert.equal(ram.u16(BOX[0] + 2), state);
      assert.doesNotThrow(() => announce260B30(ram, SLOT, 0, ctx),
        `state $${state.toString(16)} from $${site.toString(16)} is one the consumer has`);
      assert.equal(ram.u16(BOX[0]), 0, '$260B44 consumed the flag');
      assert.equal(ram.u16(SLOT + 0x04), state, '$260B56 took the state');
    }
  });
