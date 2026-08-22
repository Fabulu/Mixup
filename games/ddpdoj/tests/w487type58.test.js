import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { ENEMY } from '../src/enemies.js';
import { B, POOL_B } from '../src/effects.js';
import { handlerMap, HANDLER_ADDRESSES } from '../src/handlers.js';
import { INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { DEFQ_D1, enqueueDeferred, processDeferred, SPAWN } from '../src/spawn.js';
import { BUCKETS } from '../src/spritequeue.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES_PATH = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(TABLES_PATH);
const TABLES_JSON = HAVE ? JSON.parse(readFileSync(TABLES_PATH, 'utf8')) : null;
const PROTO_WINDOW = Object.freeze({
  base: '$270C3A', len: 0x2c,
  why: 'W487 focused fixture for the newly declared type $58 prototype window',
  hex: '00000002000000000000000010030008a00110010000000000000000020002000200020002000c0000130000',
});
const ROM_SPEC = HAVE ? {
  ...TABLES_JSON.rom,
  windows: TABLES_JSON.rom.windows.some((w) =>
    parseInt(String(w.base).replace('$', ''), 16) === 0x270c3a)
    ? TABLES_JSON.rom.windows : [...TABLES_JSON.rom.windows, PROTO_WINDOW],
} : null;
const ROM = HAVE ? new RomWindows(ROM_SPEC) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const TYPE = 0x58;
const BODY = 0x270be4;
const HANDLER = 0x270c66;
const ART = 0x270972;

function spawn58(position, heading) {
  const ram = new Ram();
  const unported = new UnportedLog();
  const vectors = [];
  const tables = {
    vector: (speed, inherited) => {
      vectors.push([speed, inherited]);
      return { dy: 0x0100, dx: -0x0080 };
    },
  };
  const queued = enqueueDeferred(ram, TYPE, DEFQ_D1.FIXED00);
  ram.setU32(queued.addr + 0x16, position);
  ram.setU8(queued.addr + 0x1a, heading);
  assert.equal(processDeferred(ram, ROM, unported, tables), 1);
  return { ram, unported, tables, vectors, rec: ENEMY.bandCommon, sub: SPAWN.SUB_COMMON };
}

test('W487 type $58 initializes, accelerates, filters its fan, draws, dies and frees off screen',
  { skip: SKIP }, () => {
    assert.ok(INIT_BODY_ADDRESSES.includes(BODY));
    assert.ok(HANDLER_ADDRESSES.includes(HANDLER));
    assert.equal(ROM.u16(0x270c3a), 0x0000);
    assert.equal(ROM.u16(0x270c64), 0x0000, 'the $2C prototype window ends immediately before code');
    assert.throws(() => ROM.u16(HANDLER),
      (error) => error?.romAddress === HANDLER, 'the handler bytes are not exported as data');

    const f = spawn58(0x20002400, 0x06);
    const run = handlerMap().get(HANDLER);
    const draw = BUCKETS[7];
    const sounds = [], effects = [], bullets = [], kills = [];
    const ctx = {
      tables: f.tables,
      unported: f.unported,
      unportedLog: f.unported,
      soundPost: (site) => sounds.push(site),
      effectSpawn: (kind, site, slot) => effects.push([kind, site, slot]),
      bulletSpawn: (site, result) => bullets.push([site, result]),
      killEvent: (...args) => kills.push(args),
    };

    assert.equal(f.ram.u32(f.rec + 0x4c), HANDLER);
    assert.equal(f.ram.u32(f.sub + 0x02), 0x20002400);
    assert.deepEqual(f.vectors, [[0x0c, 0x06]], 'velocity lookup uses inherited heading');
    assert.equal(f.ram.u8(f.sub + 0x1b), 0x06);
    assert.equal(f.ram.u16(f.sub + 0x18), 0x0200);
    assert.equal(f.ram.u8(f.sub + 0x1d), 0x13);
    assert.equal(f.ram.u8(f.rec + 0x1c), 0x20, 'no live target retains the cartridge fallback fan heading');
    assert.equal(f.ram.u16(f.rec + 0x22), 0x1003);
    assert.equal(f.ram.u16(f.rec + 0x24), 8);

    f.ram.setU16(0x8130de, 1);
    f.ram.setU16(0x80390a, 1);
    run(f.ram, ROM, f.rec, ctx);
    assert.equal(f.ram.u32(f.sub + 0x02), 0x21012380);
    assert.equal(f.ram.u16(f.rec + 0x1e), 0x00fe, 'vertical velocity loses two after movement');
    assert.equal(bullets.length, 0, 'non-due cadence does not fire');
    assert.equal(f.ram.u16(draw.counter), 12);
    assert.equal(f.ram.u32(draw.buffer + 4), ROM.u32(ART));
    assert.equal(f.ram.u16(draw.buffer + 8), 0x0620);
    assert.equal(f.ram.u16(draw.buffer + 10), 0x0013);

    f.ram.setU16(draw.counter, 0);
    f.ram.setU8(f.rec + 0x22, 0);
    run(f.ram, ROM, f.rec, ctx);
    assert.equal(f.ram.u32(f.sub + 0x02), 0x22002300);
    assert.equal(f.ram.u8(f.rec + 0x22), 3);
    assert.equal(f.ram.u8(f.rec + 0x1c), 0x23);
    assert.equal(f.ram.u16(f.rec + 0x24), 7);
    assert.deepEqual(bullets.map(([site]) => site), [0x270d88, 0x270d88],
      'headings $23 and $0D fire while $38 is outside the open ($0C,$34) arc');
    assert.ok(bullets.every(([, result]) => result.length === 1));
    assert.equal(f.ram.u16(draw.counter), 12, 'the due frame still draws once');

    f.ram.setU16(f.sub + 0x18, 0xffff);
    f.ram.setU8(f.sub, f.ram.u8(f.sub) | 0x10);
    run(f.ram, ROM, f.rec, ctx);
    assert.equal(f.ram.u32(0x81b4c0), 1, '$286096 records the P1 hit before death');
    assert.deepEqual(effects, [[0x14, 0x270cba, POOL_B.base]]);
    assert.deepEqual(kills, [], 'the cartridge handler has no $28615E kill-score call');
    assert.deepEqual(sounds, [0x28c2c2]);
    assert.equal(f.ram.u16(POOL_B.base), 0x8014);
    assert.equal(f.ram.u32(POOL_B.base + B.pos), 0x22fd2280);
    assert.equal(f.ram.u16(POOL_B.base + B.bucket), 0x10);
    assert.equal(f.ram.u16(f.rec), 0);
    assert.equal(f.ram.u8(f.sub), 1);

    const off = spawn58(0xfc000000, 0x04);
    off.ram.setU16(0x8130de, 1);
    run(off.ram, ROM, off.rec, {
      tables: off.tables, unported: off.unported, unportedLog: off.unported,
    });
    assert.equal(off.ram.u16(off.rec), 0);
    assert.equal(off.ram.u32(off.sub + 0x02), 0xfc000000,
      'the signed -$400 boundary frees before movement');
    assert.equal(off.ram.u16(draw.counter), 0, 'off-screen free draws nothing');
  });
