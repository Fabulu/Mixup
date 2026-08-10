// W236: the stage-clear banner's palettes (docket D11).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { PaletteState } from '../src/palette.js';
import { UnportedLog } from '../src/unported.js';
import { bannerStep28ECCE, SE } from '../src/stageend.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

function ctxOf(ram) {
  const log = new UnportedLog();
  const palette = new PaletteState();
  return { log, palette, ctx: { ram, rom: ROM, tables: MT, palette,
    unported: log, unportedLog: log, soundPost() {} } };
}

test('W236 $28EE1E is five (picture, palette) PAIRS, and both halves are live',
  { skip: SKIP }, () => {
    // W232 harvested the first longword of each pair as a sprite stream. This is
    // the other one, and until W236 it was counted as "data" and never installed.
    const pals = Array.from({ length: 5 }, (_, i) => ROM.u32(0x28ee1e + i * 8 + 4));
    assert.deepEqual(pals, [0x2256b8, 0x2256f8, 0x225738, 0x225778, 0x2257b8],
      'contiguous at stride $40 -- five banks of sixty-four bytes');
    for (const p of pals) assert.equal(ROM.bytes(p, 64).length, 64);
    // ...and the window stops after the fifth, so the extent is not a guess.
    assert.throws(() => ROM.bytes(0x2256b8 + 5 * 0x40, 64),
      (e) => e.name === 'Unreached');
  });

test('W236 the banner installs its palette into bank $17 on its first frame',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const { log, palette, ctx } = ctxOf(ram);
    // The per-stage art byte comes from $81DFFC + (stageX4/4)*8, read backwards
    // from +7 by $81E02A. Stage 0, $81E02A = 0 -> the byte at +7.
    ram.setU16(SE.stageX4, 0);
    ram.setU16(SE.e02a, 0);
    ram.setU8(0x81dffc + 7, 2);                  // pick entry 2 of $28EE1E
    ram.setU16(SE.e024, 0);                      // state 0: the install frame

    const before = palette.installCount;
    bannerStep28ECCE(ram, ctx);

    // TWO installs, not one, and that is the routine's own shape: `$28ECFC` is a
    // fall-through and not an `else`, so the state-0 frame does its own work AND
    // state 1's first tick -- which on a fresh Ram has $81E026 at zero, so its
    // `subq.b` borrows immediately and it loads the next art too.
    assert.equal(palette.installCount, before + 2,
      '$28ECF6 and then $28ED44, through the fall-through');
    assert.deepEqual(log.report(), [], 'and is no longer counted');
    assert.equal(ram.u16(SE.e024), 1, 'the state advanced');
  });

test('W236 the art byte chooses which of the five palettes lands', { skip: SKIP }, () => {
  // Two runs, two different art bytes, and the installed bytes must differ --
  // otherwise the entry index is being ignored, which a single install cannot show.
  const shot = (entry) => {
    const ram = new Ram();
    const { palette, ctx } = ctxOf(ram);
    ram.setU16(SE.stageX4, 0);
    ram.setU16(SE.e02a, 0);
    ram.setU8(0x81dffc + 7, entry);
    ram.setU16(SE.e024, 0);
    bannerStep28ECCE(ram, ctx);
    return Buffer.from(ROM.bytes(ROM.u32(0x28ee1e + entry * 8 + 4), 64)).toString('hex');
  };
  assert.notEqual(shot(0), shot(4), 'the five palettes are not all the same bytes');
});

test('W236 the slide-out bank table is five words, pinned by the DFEC seed',
  { skip: SKIP }, () => {
    // `$28EA2E move.w ($28EA4A,PC,D0.w),D0` with D0 = $813094, and $28EA54 is the
    // two-word $81DFEC seed the port already reads -- so the table is FIVE words
    // and its far end is data this file already depends on, not a run length.
    const banks = Array.from({ length: 5 }, (_, i) => ROM.u16(0x28ea4a + i * 2));
    assert.deepEqual(banks, [0x17, 0x17, 0x17, 0x17, 0x17],
      'all five stages install into the same bank the banner art uses');
    // $28EA54 is NOT out of bounds -- it is the DFEC seed, which this file already
    // reads through `RESULT_ROM.bannerDfecOut`. That is the pin: the table ends
    // where data the port already depends on begins.
    assert.equal(ROM.u16(0x28ea4a + 5 * 2), ROM.u16(0x28ea54));
    assert.equal(ROM.u32(0x28ea58) >>> 16, ROM.u16(0x28ea58),
      'and $28EA58 is the slide-out template the port copies sixteen longwords of');
  });
