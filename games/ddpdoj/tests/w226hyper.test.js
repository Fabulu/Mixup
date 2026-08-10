// W226: the hyper beam's missing strip window (docket D1) and the hyper item's
// motion, draw bias and animation order (docket D2).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { BUCKETS, enqueueRegistersThroughStub } from '../src/spritequeue.js';
import { ITEM, I, runItemDriver } from '../src/items.js';
import { Game } from '../src/main.js';
import { portWordFromBits } from '../src/input.js';
import { BIT } from '../src/machine.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const seedPath = new URL('../rip/web/seed.bin', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';
const SKIP_SEED = HAVE && existsSync(seedPath)
  ? false : 'generated ROM tables/seed absent; skip, not pass';

/** The four `$255000` arms and the five laser powers `$252C9C` allows. */
const ARMS = [[0x00, 'plain'], [0x28, 'ship'], [0x50, 'formation'], [0x78, 'hyper']];
const POWERS = [0, 2, 4, 6, 8];

test('W226 every $24BB0A strip is inside a window, for all four arms',
  { skip: SKIP }, () => {
    for (const [arm, name] of ARMS) {
      for (const power of POWERS) {
        const pair = 0x24bb0a + arm + power * 4;
        const off = ROM.u32(pair);
        const ptr = ROM.u32(pair + 4);
        assert.equal(off, 0x001e,
          `${name} power ${power}: $2550A8 reloads ($18,A6), so the pair's own `
          + 'word is the strip length the walk starts from');
        // $2550A0 subi.w #$A / $2550A6 bmi -> the walk visits every tenth byte
        // down to zero, and $25509A/$25509C/$25509E read ten bytes at each.
        for (let o = off; o >= 0; o -= 0x0a) {
          ROM.u32(ptr + o); ROM.u32(ptr + o + 4); ROM.u16(ptr + o + 8);
        }
      }
    }
    // the strip the hyper arm shares across all five powers, and the one that
    // was outside every window before this wave
    for (const power of POWERS)
      assert.equal(ROM.u32(0x24bb0a + 0x78 + power * 4 + 4), 0x24bae2);
    assert.equal(createHash('sha256')
      .update(Buffer.from(ROM.bytes(0x24b900, 0x2aa))).digest('hex'),
    '7774e9f92aae7fd15007793715c3f20ba1204f03487038a5b4210fb80f4647f0');
  });

test('W226 a live hyper beam walks its strip for 120 frames without a gap',
  { skip: SKIP_SEED }, () => {
    const g = new Game(new Uint8Array(readFileSync(seedPath)), json,
      { palCatchUp: false });
    const shot = portWordFromBits([BIT.b1]);
    for (let n = 0; n < 90; n++) g.step(shot);
    // exactly what collectHyperStock leaves: one in stock and the $095F duration
    g.ram.setU16(0x81b65c, 1);
    g.ram.setU16(0x81b642, 0x095f);
    g.step(portWordFromBits([BIT.b1, BIT.b2]));
    g.step(shot);
    assert.equal(g.ram.u16(0x81b63e), 1, 'the hyper is up');
    assert.equal(g.ram.u16(0x8103e6 + 0x22), 0, 'at laser power 0, the +$78 arm');

    const blk = 0x811f32;
    const strips = new Set();
    const offsets = new Set();
    for (let n = 0; n < 120; n++) {
      g.step(shot);                     // threw at $24BAF6 on the second frame
      if ((g.ram.u16(blk) & 0x8000) === 0) continue;
      strips.add(g.ram.u32(blk + 0x12));
      if (g.ram.u32(blk + 0x12) === 0x24bae2) offsets.add(g.ram.u16(blk + 0x10));
    }
    assert.ok(strips.has(0x24bae2),
      'the beam requested the hyper strip the +$78 arm points at');
    assert.deepEqual([...offsets].sort((a, b) => a - b), [0, 0x0a, 0x14, 0x1e],
      'and walked the whole strip, not just its first row');
    assert.equal(g.ram.u16(0x81b63e), 1, 'and the hyper is still up');
  });

/** One live kind-$0C record with its INIT arm still to run. */
function hyperItem(ram) {
  const r = 0x816b7a;
  ram.setU16(r + 0x00, 0x800c);        // live, kind $0C, bit 13 clear = un-init
  ram.setU16(r + I.pos, 0x2000);
  ram.setU16(r + I.posX, 0x1800);
  ram.setU16(ITEM.count, 1);
  return r;
}

function itemCtx(ram) {
  const log = new UnportedLog();
  return { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
    soundPost() {}, effectSpawn() {}, bulletSpawn() {} };
}

/** The bucket `ITEM.emitStub` grew, and the records it grew by. */
function grown(ram, before) {
  for (const b of BUCKETS) {
    const now = ram.u16(b.counter);
    if (now === before.get(b.counter)) continue;
    const at = before.get(b.counter);
    return { b, records: Array.from({ length: (now - at) / 12 },
      (_, i) => ({ pos: ram.u32(b.buffer + at + i * 12),
        descriptor: ram.u32(b.buffer + at + i * 12 + 4) })) };
  }
  return null;
}
const snapshot = (ram) => new Map(BUCKETS.map((b) => [b.counter, ram.u16(b.counter)]));

test('W226 the hyper item steps by the row pair at $1A and $1C, not a word at $1B',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const ctx = itemCtx(ram);
    const r = hyperItem(ram);

    runItemDriver(ram, ROM, ctx);
    // $27F076: the row at $27F0FA is (next cursor, tick reload) + (dY, dX), and
    // the motion in this same call has already spent one tick of the reload.
    assert.deepEqual([ram.u8(r + I.tick), ram.u8(r + I.tickReload)],
      [ROM.u8(0x27f0fa), ROM.u8(0x27f0fb) - 1], 'row 0 cursor, reload less a tick');
    assert.equal(ram.u32(r + 0x1a), ROM.u32(0x27f0fc), 'row 0 speed pair');
    assert.deepEqual([ram.u16(r + 0x1a), ram.u16(r + 0x1c)], [0xfff4, 0x001f]);
    assert.equal(ram.u8(r + 0x19), 1, 'the rising arm is armed');

    // $27F0A2 subi.w #$40 on the long axis, then $27F0EE/$27F0F2 add the pair
    const pos = ram.u16(r + I.pos);
    const posX = ram.u16(r + I.posX);
    runItemDriver(ram, ROM, ctx);
    assert.equal(ram.u16(r + I.pos), (pos - 0x40 + 0xfff4) & 0xffff);
    assert.equal(ram.u16(r + I.posX), (posX + 0x001f) & 0xffff,
      'a word read at $1B would have moved this by $F400 instead');
  });

test('W226 the hyper item draws at $FA00/$F900 and advances its cursor first',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const ctx = itemCtx(ram);
    const r = hyperItem(ram);
    runItemDriver(ram, ROM, ctx);           // INIT: frame $0202, anim 0
    assert.deepEqual([ram.u8(r + I.frame), ram.u16(r + I.anim)], [1, 0],
      'the INIT call spends one frame tick and does not advance the cursor');
    runItemDriver(ram, ROM, ctx);
    assert.deepEqual([ram.u8(r + I.frame), ram.u16(r + I.anim)], [0, 0]);

    // the third call borrows, so the cursor is at 4 BEFORE the draws
    const before = snapshot(ram);
    runItemDriver(ram, ROM, ctx);
    assert.deepEqual([ram.u8(r + I.frame), ram.u16(r + I.anim)], [2, 4],
      '$27EFF4 reloads on the borrow, i.e. from zero, not at zero');
    const g = grown(ram, before);
    assert.ok(g, 'the item drew');
    const pos = ram.u16(r + I.pos);
    const posX = ram.u16(r + I.posX);
    // The emitted record is the register set after `$23EB06`'s own packing, so
    // the bias is pinned by feeding the same emitter the expected D1 and
    // comparing the twelve bytes it produces.
    const want = new Ram();
    enqueueRegistersThroughStub(want, ROM, ITEM.emitStub,
      ((((pos - 0x0600) & 0xffff) << 16) | ((posX - 0x0700) & 0xffff)) >>> 0,
      0x001b8b28, 0x0638, 5);
    assert.equal(g.records[0].pos, want.u32(g.b.buffer),
      'D5 is $F900FA00 and its LOW word goes on the long axis');
    assert.equal(g.records[0].descriptor, want.u32(g.b.buffer + 4));
    assert.equal(g.records[0].descriptor, 0x001b8b28);
    assert.equal(g.records.at(-1).descriptor, ROM.u32(0x27ef10 + 4),
      'the last draw uses the cursor this call advanced, not the previous one');
  });
