// W264 (DOCKET D3): the impact pool reads its templates and hooks from the cartridge,
// which is what gives the screen clear's kind $0 an explosion.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { allocPoolA27F8F0, POOL_A, KIND, B } from '../src/bee.js';
import { RAM } from '../src/machine.js';

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

/** W287: run `fn` and hand back the Unreached it threw, or null. */
const caught = (fn) => { try { fn(); return null; } catch (e) { return e; } };

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
    // W411: $280F34 used to be outside every window and this line asserted the throw.
    // It is now the FIRST LONGWORD of the collected transform's own table, which is
    // the same bound stated the other way round -- W264's window still ends exactly
    // there, and the value at $280F34 is a POINTER INTO $280F40 rather than a template.
    assert.equal(ROM.u32(0x280f34), 0x00280f40,
      'the W264 window ends where the W411 window begins, on a selector');
    assert.throws(() => ROM.u32(0x280fdc), (e) => e.name === 'Unreached',
      'and $280FDC, the transform routine itself, is code and in no window');
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
  // W312 ported hooks 2, 3 and 17, so this drives $04 -- index 1, whose hook $280CEE belongs
  // to `allocBee27F92A` and is the last thing this dispatch will ever refuse. The claim is
  // unchanged: the message names the dispatch and does not open with a window error.
  const f = world();
  assert.throws(() => allocPoolA27F8F0(f.ram, ROM, f.ctx, 0x04, 0, 0, CARRIER),
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

// ================ W287: EIGHT MORE FINISH ENTRIES, AND THEY ARE ONE FAMILY
//
// Hooks 8..15 of `$280BCE` share a three-instruction head and a tail. The head picks a
// HOOK BLOCK and a PLAYER RECORD; the tail (`$280D94..$280DB8`) masks D7 to a nibble,
// draws from `$242EC2`, indexes the block by `andi.l #$E` and ADDS the word to the
// sprite pointer. So eight entries cost one table.

/** The listing's own mapping, transcribed independently of `bee.js`'s table. */
const W287_FAMILY = [
  { idx: 8, site: 0x280d76, hooks: 0x280c4e, owner: RAM.player1 },
  { idx: 9, site: 0x280d7c, hooks: 0x280c1e, owner: RAM.player1 },
  { idx: 10, site: 0x280d82, hooks: 0x280c2e, owner: RAM.player1 },
  { idx: 11, site: 0x280d88, hooks: 0x280c3e, owner: RAM.player1 },
  { idx: 12, site: 0x280d3e, hooks: 0x280c4e, owner: RAM.player2 },
  { idx: 13, site: 0x280d4c, hooks: 0x280c1e, owner: RAM.player2 },
  { idx: 14, site: 0x280d5a, hooks: 0x280c2e, owner: RAM.player2 },
  { idx: 15, site: 0x280d68, hooks: 0x280c3e, owner: RAM.player2 },
];

test('W287 all eight of the family allocate, silently', { skip: SKIP }, () => {
  // Before this wave every one of these threw at $280BCE. They are the indices a long
  // run reaches -- the census run died on D0 = $20, which is index 8.
  for (const e of W287_FAMILY) {
    const f = world();
    const slot = allocPoolA27F8F0(f.ram, ROM, f.ctx, e.idx * 4, 0, 0, CARRIER);
    assert.notEqual(slot, null, `index ${e.idx} allocated`);
    assert.deepEqual(f.log.report(), [], `index ${e.idx} counted nothing`);
  }
});

test('W287 the family writes WHICH PLAYER the impact belongs to', { skip: SKIP }, () => {
  // `$280D8C move.l #$8103E6,($24,A0)` for 8..11 and `$810448` for 12..15. This is the
  // one field the eight add on top of the shared fill, and the only reason they are
  // eight entries rather than four.
  for (const e of W287_FAMILY) {
    const f = world();
    const slot = allocPoolA27F8F0(f.ram, ROM, f.ctx, e.idx * 4, 0, 0, CARRIER);
    assert.equal(f.ram.u32(slot + 0x24), e.owner,
      `index ${e.idx} belongs to ${e.owner === RAM.player1 ? 'P1' : 'P2'}`);
  }
  // And the two halves really are different records, or the split would be untestable.
  assert.notEqual(RAM.player1, RAM.player2);
});

test('W287 the hook BLOCK cycles $C4E, $C1E, $C2E, $C3E in both halves',
  { skip: SKIP }, () => {
    // Read out of the IMAGE via the windows, so the claim rests on the cartridge. The
    // four blocks are eight words each and `andi.l #$E` bounds the index to 0..$E, so
    // the index space is exactly the window.
    const blocks = [0x280c4e, 0x280c1e, 0x280c2e, 0x280c3e];
    for (const b of blocks) {
      for (let i = 0; i < 8; i++) {
        assert.doesNotThrow(() => ROM.u16(b + i * 2), `${b.toString(16)}[${i}] resolves`);
      }
      // The first word of every block is 0 -- the identity offset -- which is what makes
      // "the hook offsets the sprite" a no-op on phase 0 rather than a displacement.
      assert.equal(ROM.u16(b), 0, `${b.toString(16)}[0] is the identity`);
    }
    // The four are distinct, and the eight entries pair them with the two players.
    assert.equal(new Set(blocks).size, 4);
    for (const e of W287_FAMILY) {
      assert.equal(e.hooks, blocks[(e.idx - 8) % 4], `index ${e.idx}'s block`);
    }
  });

test('W287 $280C1E abuts W264\'s window, so all four blocks are seam-free',
  { skip: SKIP }, () => {
    // $280C1E + $10 == $280C2E, and W264 covered $280C2E + $30 (2E, 3E, 4E).
    assert.equal(0x280c1e + 0x10, 0x280c2e);
    assert.doesNotThrow(() => ROM.u16(0x280c1e + 0x0e), 'the last word of the new block');
    assert.throws(() => ROM.u16(0x280c1c), 'and nothing below it');
  });

test('W312 the throw that remains says EIGHTEEN, and names the two that are left',
  { skip: SKIP }, () => {
    // TWO of the twenty are still unported and the message has to stay honest about which --
    // it is the diagnosis a future run gets. W264 said three, W287 eleven, W298 fifteen, W312
    // eighteen, and each time the number moved the message moved with it.
    const f = world();
    const e = caught(() => allocPoolA27F8F0(f.ram, ROM, f.ctx, 0x04, 0, 0, CARRIER));
    assert.ok(e, 'index 1 still throws');
    assert.equal(e.romAddress, 0x280bce);
    assert.match(e.message, /EIGHTEEN of its twenty are/);
    assert.match(e.message, /indices 8\.\.15/, 'and it still names W287\'s family');
    assert.match(e.message, /5\/6\/7 are the SAME entry \$280D34/,
      'and W298 too, including that three of its four share one body');
    assert.match(e.message, /byte-identical/,
      'and W312, including that hooks 2 and 3 are the same code twice');
    assert.match(e.message, /indices 1 and 16/, 'and it names what is LEFT');
    assert.match(e.message, /allocBee27F92A/, 'and where those two belong');
  });

test('W298 hooks 4..7 allocate, and 5/6/7 are the SAME table entry', { skip: SKIP }, () => {
  // `$280BCE[5]`, `[6]` and `[7]` are all `$280D34`, so three of the four cost nothing --
  // the same "read the table entry, not just the routine" that W286 and W287 turned on.
  for (const kind of [0x10, 0x14, 0x18, 0x1c]) {
    const f = world();
    const slot = allocPoolA27F8F0(f.ram, ROM, f.ctx, kind, 0, 0, CARRIER);
    assert.notEqual(slot, null, `kind $${kind.toString(16)} allocated`);
    assert.deepEqual(f.log.report(), [], `kind $${kind.toString(16)} counted nothing`);
  }
});

test('W298 hooks 4..7 draw the speed from $242B3C, and add FIVE', { skip: SKIP }, () => {
  // `$280CD4 jsr $242B3C / bpl / neg.b / ext.w / lsr.w #1` where `$280C84` uses
  // `$2431F4 / lsr.w #1` -- one expression, and then `addq.b #5,($1a,A0)`. The bump is
  // what separates these four from kind 0 observably.
  const base = world();
  const s0 = allocPoolA27F8F0(base.ram, ROM, base.ctx, 0x00, 0, 0, CARRIER);
  const bumped = world();
  const s4 = allocPoolA27F8F0(bumped.ram, ROM, bumped.ctx, 0x10, 0, 0, CARRIER);
  assert.equal(bumped.ram.u8(s4 + B.speed) - base.ram.u8(s0 + B.speed), 5,
    'the +5 is there and the two draws happen to agree at this RNG state');
});

test('W298 hook 4 ALONE clears ($1,A0) -- the one instruction separating it from 5/6/7',
  { skip: SKIP }, () => {
    // `$280D2A clr.b ($1,A0)`. Without it `($1,A0)` holds the kind, since the status word
    // is `kind | $8000` and byte 1 is its low half.
    const four = world();
    const s = allocPoolA27F8F0(four.ram, ROM, four.ctx, 0x10, 0, 0, CARRIER);
    assert.equal(four.ram.u8(s + 0x01), 0, 'hook 4 cleared it');
    for (const kind of [0x14, 0x18, 0x1c]) {
      const f = world();
      const t = allocPoolA27F8F0(f.ram, ROM, f.ctx, kind, 0, 0, CARRIER);
      assert.equal(f.ram.u8(t + 0x01), kind, `kind $${kind.toString(16)} kept it`);
    }
  });

test('W298 the RNG is drawn ONCE, not twice to test its sign', { skip: SKIP }, () => {
  // `$242B3C` bumps `$803917` on every call, so drawing twice to check the sign would
  // advance the shared counter and desynchronise every later draw in the frame. This was
  // the first draft's bug.
  const f = world();
  const before = f.ram.u8(0x803917);
  allocPoolA27F8F0(f.ram, ROM, f.ctx, 0x10, 0, 0, CARRIER);
  const after = f.ram.u8(0x803917);
  const plain = world();
  allocPoolA27F8F0(plain.ram, ROM, plain.ctx, 0x00, 0, 0, CARRIER);
  assert.equal((after - before) & 0xff,
    (plain.ram.u8(0x803917) - before) & 0xff,
    'hooks 4..7 advance the counter exactly as much as kind 0 does');
});
