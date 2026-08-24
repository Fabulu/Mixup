// W552: HIBACHI A4 SCRIPT 0, `$2A592E` init and `$2A597C` step.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { ANIM_OBJECT } from '../src/animobjects.js';
import { UnportedLog } from '../src/unported.js';
import {
  SCHED, installScripts, a4Start25980C, runScheduler25962E, scriptAddresses,
} from '../src/scheduler.js';
import {
  HIBACHI_A4, HIBACHI_END_COUNTED, HIBACHI_END_SCRIPTS,
  s0Init2A592E,
} from '../src/hibachiend.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');
const SKIP = existsSync(IMAGE) && existsSync(TABLES) ? false
  : 'decrypted image or generated tables absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));

const beU16 = (addr) => IMG.readUInt16BE(addr);
const beU32 = (addr) => IMG.readUInt32BE(addr);
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);

const REC = 0x810c00;
const SUB = 0x814800;
const PARTS = [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0x1a0];

function bench({ loopWord = 0, flag = 0 } = {}) {
  const ram = new Ram();
  const log = new UnportedLog();
  const ctx = { bossRec: REC, bossSubRec: SUB, unported: log, unportedLog: log };
  ram.setU16(HIBACHI_A4.forkLoopWord, loopWord);
  ram.setU16(HIBACHI_A4.forkFlag, flag);
  ram.setU32(REC + 0x16, 0x11223344);
  installScripts(ram, ROM, { a4: HIBACHI_A4.table });
  assert.equal(a4Start25980C(ram, 0), true);
  return { ram, log, ctx };
}

const frame = (b) => runScheduler25962E(b.ram, ROM, b.ctx);

const caught = (fn) => {
  try { fn(); return null; } catch (error) { return error; }
};

test('W552 the image maps A4 0 to the translated init and step', { skip: SKIP }, () => {
  assert.equal(beU32(HIBACHI_A4.table), HIBACHI_A4.s0Init);
  assert.equal(beU32(HIBACHI_A4.table + 4), HIBACHI_A4.s0Step);
  assert.equal(HIBACHI_A4.s0Init, 0x2a592e);
  assert.equal(HIBACHI_A4.s0Step, 0x2a597c);
  assert.equal(HIBACHI_A4.s1Init - HIBACHI_A4.s0Init, 0xee,
    'script 0 occupies exactly $EE bytes before script 1');
  assert.equal(beU16(0x2a594c), 0x397c, '$2A594C writes the $260 timer');
  assert.equal(beU16(0x2a597c), 0x4a6c, '$2A597C starts by testing the hold timer');
  assert.equal(beU16(HIBACHI_A4.s0Anim), HIBACHI_A4.s0AnimCount);
  assert.equal(HIBACHI_A4.s0Anim + 2 + HIBACHI_A4.s0AnimCount * HIBACHI_A4.animStride,
    beU32(HIBACHI_A4.table + HIBACHI_A4.s0Next * 8),
    'the four-record animation chain ends exactly at A4 script 6');
});

test('W552 both A4 0 entry points are registered and no longer counted', { skip: SKIP }, () => {
  const registered = new Set(scriptAddresses());
  assert.ok(registered.has(HIBACHI_A4.s0Init));
  assert.ok(registered.has(HIBACHI_A4.s0Step));
  assert.equal(HIBACHI_END_COUNTED[0], undefined);
  assert.ok(HIBACHI_END_SCRIPTS.includes(0));
});

test('W552 first dispatch runs init and the first step in one scheduler call', { skip: SKIP }, () => {
  const b = bench();
  assert.equal(frame(b), false);
  assert.equal(b.ram.u16(SCHED.a4Base), 0x8100, 'A4 slot 0 has its init bit set');
  assert.equal(b.ram.u16(SCHED.a4Base + 0x02), HIBACHI_A4.s0Frames - 1,
    'the $260 timer was decremented on the init frame');
  assert.equal(b.ram.u16(SCHED.a4Base + 0x04), HIBACHI_A4.s0Hold - 1,
    'the $160 hold was also decremented on the init frame');
  assert.deepEqual([
    b.ram.u16(SCHED.a3Base), b.ram.u16(SCHED.a3Base + SCHED.a3Stride),
  ], [0x8000, 0x8001], 'A3 scripts 0 and 1 were started in order');
  assert.equal(b.ram.u16(SCHED.seqRestart), 1);
  assert.equal(b.ram.u16(SCHED.seqPending), 0);
  assert.ok(b.log.report().some((line) => line.includes('$23C4D0')),
    'the existing pause block remains an explicit counted call');
});

test('W552 first-loop hold enables the fight on frame $160 and hands to A4 6 on frame $260',
  { skip: SKIP }, () => {
    const b = bench();
    frame(b);
    for (let n = 2; n < HIBACHI_A4.s0Hold; n++) frame(b);

    assert.equal(b.ram.u16(SCHED.a4Base + 0x04), 1);
    assert.equal(b.ram.u8(0x8130f8), 0);
    assert.equal(b.ram.u32(REC + 0x16), 0x11223344);

    frame(b);
    assert.equal(b.ram.u16(SCHED.a4Base + 0x04), 0);
    assert.equal(b.ram.u8(0x8130f8), 0x05, 'bits 0 and 2 enable the first-loop fight');
    assert.equal(b.ram.u8(0x8130f9), 0x01);
    assert.equal(b.ram.u32(REC + 0x16), 0x00062000);
    assert.equal(b.ram.u32(0x81b626), 0x00000700);
    assert.equal(b.ram.u32(0x81b62a), REC + 0x16);
    assert.equal(b.ram.u16(SCHED.a4Base + 0x02), HIBACHI_A4.s0Frames - HIBACHI_A4.s0Hold);

    for (let n = HIBACHI_A4.s0Hold + 1; n < HIBACHI_A4.s0Frames; n++) frame(b);
    assert.equal(b.ram.u16(SCHED.a4Base + 0x02), 1);
    assert.equal(b.ram.u16(0x81b6e4), 0);

    const partSeeds = PARTS.map((off, i) => {
      const seed = 0x0402 | (i << 4);
      b.ram.setU16(SUB + off, seed);
      return seed;
    });
    const error = caught(() => frame(b));
    assert.equal(error, null,
      'W561 runs A4 script 6, which now waits on its newly started A1 gun 0');
    assert.equal(b.ram.u16(0x81b6e4), 1);
    assert.equal(b.ram.u8(0x8130f8), 0x17, 'the final frame also sets bits 1 and 4');
    PARTS.forEach((off, i) => {
      assert.equal(b.ram.u16(SUB + off), partSeeds[i] | 0xa001,
        `part $${off.toString(16)} preserves its old bits while gaining $A001`);
    });

    const nodes = [];
    let node = b.ram.u32(ANIM_OBJECT.roots + 0x2c);
    while (node !== 0) {
      nodes.push(node);
      node = b.ram.u32(node + 0x2c);
    }
    assert.deepEqual(nodes, [...Array(HIBACHI_A4.s0AnimCount).keys()]
      .map((i) => ANIM_OBJECT.nodes + i * ANIM_OBJECT.nodeStride),
    '$246410 linked exactly four consecutive animation nodes');
    assert.equal(b.ram.u16(ANIM_OBJECT.roots), 0x8000);
    assert.equal(b.ram.u16(ANIM_OBJECT.roots + 0x04), 1);
    nodes.forEach((at, i) => {
      const record = HIBACHI_A4.s0Anim + 2 + i * HIBACHI_A4.animStride;
      assert.equal(b.ram.u16(at), 0x8000);
      assert.equal(b.ram.u16(at + 0x12), beU16(record), `node ${i} carries its ROM fill word`);
      assert.equal(b.ram.u32(at + 0x0a), beU32(record + 6), `node ${i} carries its ROM target`);
    });
    assert.equal(b.ram.u16(SCHED.a4Base), 0, 'script 0 retired its own slot');
    assert.equal(b.ram.u16(SCHED.a4Base + SCHED.a4Stride), 0x8106,
      'A4 6 took the next slot and was dispatched in the same walk');
    assert.equal(b.ram.u16(SCHED.a1Base), 0x8000, 'A4 6 started A1 gun 0');
    assert.equal(b.ram.u16(SCHED.a3Base + 2 * SCHED.a3Stride), 0x8002,
      'A4 6 also started A3 script 2');
  });

test('W552 loop and flag branches skip the hold with the ROM-specific HP behavior',
  { skip: SKIP }, () => {
    const later = bench({ loopWord: 1 });
    s0Init2A592E(later.ram, later.ctx, SCHED.a4Base);
    assert.equal(later.ram.u16(SCHED.a4Base + 0x04), 0);
    assert.equal(later.ram.u32(REC + 0x16), 0x11223344,
      'a later loop leaves the existing HP pool untouched');

    const flagged = bench({ flag: 1 });
    s0Init2A592E(flagged.ram, flagged.ctx, SCHED.a4Base);
    assert.equal(flagged.ram.u16(SCHED.a4Base + 0x04), 0);
    assert.equal(flagged.ram.u32(REC + 0x16), 0x00062000,
      '$80393A alone seeds HP immediately');
  });
