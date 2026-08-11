// W264 (DOCKET D3): the impact pool reads its templates and hooks from the cartridge,
// which is what gives the screen clear's kind $0 an explosion.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { allocPoolA27F8F0, POOL_A, KIND } from '../src/bee.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const TPL_TABLE = 0x280e4a;
const HOOKS = { 0x00: 0x280c4e, 0x48: 0x280c2e, 0x4c: 0x280c3e };
const CARRIER = 0x814600;

/** The two sets W29..W263 carried as literals, kept here as the regression witness. */
const MEASURED = {
  0x48: { spriteOff: 0xfa00fc00, sprite: 0x001bd04c, size: 0x0620,
    hitA: 0x08000800, hitB: 0x06800680, animWord: 0x0101, tpl1C: 0x001c,
    hooks: [0x0000, 0x00c8, 0x0190, 0x0258, 0x0320, 0x03e8, 0x04b0, 0x0578] },
  0x4c: { spriteOff: 0xf800fa00, sprite: 0x001bd68c, size: 0x0830,
    hitA: 0x09800980, hitB: 0x07800780, animWord: 0x0101, tpl1C: 0x001c,
    hooks: [0x0000, 0x0188, 0x0310, 0x0498, 0x0620, 0x07a8, 0x0930, 0x0ab8] },
};

function world() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(CARRIER + 0x02, 0x30001c00);
  const ctx = { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
    notes: log };
  return { ram, log, ctx };
}

test('W264 the template table is TWENTY longwords, pinned by its own contents',
  { skip: SKIP }, () => {
    // $280BCE's parallel finish dispatch has twenty entries (D0 = 0, 4, ... $4C), and
    // $280E4A + $50 is $280E9A -- the FIRST TEMPLATE. So the table bounds itself.
    const ptrs = Array.from({ length: 20 }, (_, i) => ROM.u32(TPL_TABLE + i * 4));
    assert.equal(ptrs[0], TPL_TABLE + 0x50, 'the first entry is the table end');
    for (const p of ptrs) assert.ok(p >= 0x280e9a && p <= 0x280f1e, `$${p.toString(16)}`);
    // Twenty pointers, SEVEN distinct templates.
    assert.equal(new Set(ptrs).size, 7);
    assert.throws(() => ROM.u32(0x280f34), (e) => e.name === 'Unreached',
      'and the window stops after the last template');
  });

test('W264 the ROM read reproduces both hand-measured sets EXACTLY',
  { skip: SKIP }, () => {
    // This is what makes the refactor a refactor rather than a re-measurement: the two
    // literal sets W29..W263 carried are byte-for-byte templates 18 and 19.
    for (const [d0, want] of Object.entries(MEASURED)) {
      const t = ROM.u32(TPL_TABLE + Number(d0));
      assert.equal(ROM.u32(t), want.spriteOff, `D0 $${d0}: spriteOff`);
      assert.equal(ROM.u32(t + 4), want.sprite, `D0 $${d0}: sprite`);
      assert.equal(ROM.u16(t + 8), want.size, `D0 $${d0}: size`);
      assert.equal(ROM.u32(t + 10), want.hitA, `D0 $${d0}: hitA`);
      assert.equal(ROM.u32(t + 14), want.hitB, `D0 $${d0}: hitB`);
      assert.equal(ROM.u16(t + 18), want.animWord, `D0 $${d0}: animWord`);
      assert.equal(ROM.u16(t + 20), want.tpl1C, `D0 $${d0}: tpl1C`);
      assert.deepEqual(Array.from({ length: 8 },
        (_, i) => ROM.u16(HOOKS[Number(d0)] + i * 2)), want.hooks,
      `D0 $${d0}: the eight animation hooks`);
    }
  });

test('W264 the three hook tables are contiguous and end at the first finish routine',
  { skip: SKIP }, () => {
    assert.equal(0x280c2e + 0x10, 0x280c3e);
    assert.equal(0x280c3e + 0x10, 0x280c4e);
    assert.equal(0x280c4e + 0x10, 0x280c5e, '$280C5E is D0 = 0 own finish routine');
    assert.throws(() => ROM.u16(0x280c5e), (e) => e.name === 'Unreached',
      'so the window stops there rather than reading code');
  });

test('W264 KIND $0 -- THE SCREEN CLEAR -- now allocates', { skip: SKIP }, () => {
  // DOCKET D3. Before this wave kind $0 had no entry in the hand-transcribed map and
  // the allocator threw, so the screen clear cleared bullets and drew nothing.
  const f = world();
  const before = f.ram.u16(POOL_A.liveCount);
  const slot = allocPoolA27F8F0(f.ram, ROM, f.ctx, 0x00, 0, 0, CARRIER);
  assert.ok(slot !== null, 'a slot was claimed');
  assert.equal(f.ram.u16(POOL_A.liveCount), before + 1, '$280B3E addq.w #$1');
  // ...and it carries template 0's own fields, not one of the two old literals.
  const t = ROM.u32(TPL_TABLE);
  // The fill adds ONE of the eight hook offsets to the sprite (the phase is a draw), so
  // the assertion is that it is template 0's sprite plus one of template 0's OWN hooks.
  const hooks = Array.from({ length: 8 }, (_, i) => ROM.u16(HOOKS[0] + i * 2));
  const want = hooks.map((h) => (ROM.u32(t + 4) + h) >>> 0);
  assert.ok(want.includes(f.ram.u32(slot + 0x0a)),
    `sprite $${f.ram.u32(slot + 0x0a).toString(16)} is template 0 plus one of its hooks`);
  assert.equal(f.ram.u16(slot + 0x0e), ROM.u16(t + 8), 'and its size');
  assert.deepEqual(f.log.report(), [], 'with nothing counted');
});

test('W264 kind $0 does NOT normalise the status, and the other two do',
  { skip: SKIP }, () => {
    // $280C5E inlines the shared tail and has no `andi.w #$ff83 / ori.w`; $280DEA and
    // $280E1A both end with one. So a null status is the ROM, not a gap.
    const f = world();
    const zero = allocPoolA27F8F0(f.ram, ROM, f.ctx, 0x00, 0, 0, CARRIER);
    assert.equal(f.ram.u16(zero) & 0x7c, 0, 'kind $0 leaves those bits alone');

    for (const [d0, want] of [[KIND.stage4Impact18, 0x18],
      [KIND.stage4Impact19, 0x1c]]) {
      const g = world();
      const sl = allocPoolA27F8F0(g.ram, ROM, g.ctx, d0, 0, 0, CARRIER);
      assert.equal(g.ram.u16(sl) & 0x7c, want & 0x7c,
        `D0 $${d0.toString(16)} normalises to $${want.toString(16)}`);
    }
  });

test('W264 an unread D0 names the DISPATCH ENTRY, not a window', { skip: SKIP }, () => {
  const f = world();
  assert.throws(() => allocPoolA27F8F0(f.ram, ROM, f.ctx, 0x10, 0, 0, CARRIER),
    (e) => e.name === 'Unreached' && e.romAddress === 0x280bce
      && /\$280C5E/.test(e.message) && !/window/.test(e.message.slice(0, 80)));
});

test('W264 a D0 that is not a multiple of 4 is caught as an OFFSET error',
  { skip: SKIP }, () => {
    // $280B4A indexes with D0 as a byte offset, so a caller passing a kind NUMBER
    // rather than an offset is a distinct mistake and gets its own address.
    const f = world();
    assert.throws(() => allocPoolA27F8F0(f.ram, ROM, f.ctx, 0x4d, 0, 0, CARRIER),
      (e) => e.name === 'Unreached');
  });
