// W317: stage-5 type $59, the cheapest of the fourteen -- and not an enemy.
//
// Sixty-four bytes, one script record, and what it does is enqueue type $3F on a cadence until the
// scroll clock passes $9C. Two things in it are worth a test rather than a comment: the word literal
// that is really two byte fields, and that `$263684` was already ported under another name.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { handlerMap, HANDLER_ADDRESSES } from '../src/handlers.js';
import { INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { SPAWN } from '../src/spawn.js';
import { enemyHandlerMap } from '../src/enemyframe.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? SKIP : 'the ROM image is absent; skip, not pass';

const HANDLER = 0x265a14;
const INITBODY = 0x2659e4;
const A5 = 0x8137c0;
const A6 = 0x8139c0;
const CLOCK = 0x8130ce;
const FREEZE = 0x8130d2;
const MIDBOSS = 0x8130d8;
const DEFQ_BASE = 0x815eaa;
const DEFQ_COUNT = 0x815ea8;

function world() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(A5 + 0x06, A6);
  ram.setU16(A5, 0x8059);
  ram.setU16(CLOCK, 0x0010);          // well under the $9C limit
  const spawns = [];
  return {
    ram, log, spawns,
    ctx: { rom: ROM, unported: log, unportedLog: log, notes: log,
      spawnEvent: (kind, type, r) => spawns.push({ kind, type, r }) },
  };
}
const run = (f) => handlerMap().get(HANDLER)(f.ram, ROM, A5, f.ctx);

// ==================== 1. REGISTERED, AND A LEAF

test('W317 both halves are registered and the type is a LEAF', { skip: SKIP }, () => {
  // It spawns type $3F, which W199 ported -- which is exactly why this was the cheap one. Four of
  // the remaining thirteen spawn an UNPORTED child; this one did not.
  assert.ok(HANDLER_ADDRESSES.includes(HANDLER));
  assert.ok(INIT_BODY_ADDRESSES.includes(INITBODY));
  const map = enemyHandlerMap(ROM);
  const t3f = IMG ? IMG.readUInt32BE(0x267824 + 0x3f * 8 + 4) : 0x265850;
  assert.ok(map.has(t3f), 'type $3F is ported, so nothing else was needed');
});

test('W317 the type table names these addresses', { skip: SKIP_IMG }, () => {
  const off = 0x59 * 8;
  assert.equal(IMG.readUInt32BE(0x267824 + off), 0x2659dc, 'the init stub');
  assert.equal(IMG.readUInt32BE(0x267824 + off + 4), HANDLER);
  assert.equal(0x2659dc + 8, INITBODY);
  assert.equal(IMG.readUInt16BE(0x2659dc + 2), 0, 'run length zero');
});

// ==================== 2. THE WORD LITERAL IS TWO BYTE FIELDS

test('W317 `move.w #$6,($18,A5)` sets the counter to ZERO and the reload to 6',
  { skip: SKIP_IMG }, () => {
    // The whole reason this type's cadence is not "six frames". `$2659F0` writes a WORD, so the
    // byte the handler decrements is the literal's HIGH half -- zero -- and the reload at $19 is
    // the low half. Reading it as one counter of 6 gets both the first spawn and the period wrong.
    assert.equal(IMG.readUInt16BE(0x2659f0), 0x3b7c, 'move.w #imm,(d16,A5)');
    assert.equal(IMG.readUInt16BE(0x2659f2), 6, 'the literal');
    assert.equal(IMG.readUInt16BE(0x2659f4), 0x0018, 'into ($18,A5)');
    assert.equal(IMG.readUInt16BE(0x265a3c), 0x532d, 'and the handler does subq.b #1');
    assert.equal(IMG.readUInt16BE(0x265a3e), 0x0018, 'on the byte at $18');
  });

test('W317 the first spawn is IMMEDIATE, then every seventh frame', { skip: SKIP }, () => {
  // `subq.b #1` on an already-zero byte borrows, so frame one spawns. Then the reload is 6 and the
  // borrow happens again six frames later -- a period of seven, not six.
  const f = world();
  f.ram.setU16(A5 + 0x18, 6);            // exactly what the init body writes
  const at = [];
  for (let i = 0; i < 16; i++) {
    const before = f.ram.u16(DEFQ_COUNT);
    run(f);
    if (f.ram.u16(DEFQ_COUNT) !== before) at.push(i);
  }
  assert.deepEqual(at, [0, 7, 14], 'frame 0, then every seven');
});

// ==================== 3. IT ENQUEUES TYPE $3F THROUGH THE PORTED QUEUE

test('W317 the spawn is a DEFERRED type-$3F record, stride $50', { skip: SKIP }, () => {
  // `$263684` is `enqueueDeferred(ram, type, DEFQ_D1.FIXED00)` -- W21's queue at `$815EAA`. The
  // type goes at +$2 and the D1 flags word at +$4, and the count advances by $50.
  const f = world();
  f.ram.setU16(A5 + 0x18, 6);
  run(f);
  assert.equal(f.ram.u16(DEFQ_BASE + 0x02), 0x3f, 'the type');
  assert.equal(f.ram.u16(DEFQ_BASE + 0x04), 0x00, 'and D1 = 0, the $263684 entry');
  assert.equal(f.ram.u16(DEFQ_COUNT), 0x50, 'one entry of stride $50');
  assert.equal(SPAWN.DEFQ_COUNT, DEFQ_COUNT, 'and it is the queue the walker drains');
  assert.deepEqual(f.spawns.map((s) => [s.kind, s.type]), [['deferred', 0x3f]]);
});

test('W317 `$263684` really is the routine `enqueueDeferred` ports', { skip: SKIP_IMG }, () => {
  // The correction this wave carries: `src/mover.js` still throws at `$263684` saying "the enemy
  // subsystem is not ported". It IS -- W21 landed the deferred queue. Asserted from the ROM so the
  // claim is not a reading: the routine writes the type at +$2 of `$815EAA` and advances `$815EA8`
  // by $50, which is exactly what `enqueueDeferred` does.
  assert.equal(IMG.readUInt16BE(0x263694), 0x3439, 'move.w abs.l,D2');
  assert.equal(IMG.readUInt32BE(0x263696), DEFQ_COUNT, 'the queue count');
  assert.equal(IMG.readUInt16BE(0x26369a), 0x0c42, 'cmpi.w against the cap');
  assert.equal(IMG.readUInt16BE(0x26369c), 0x0c80, '$C80 = 40 entries of $50');
  assert.equal(IMG.readUInt32BE(0x2636a4), DEFQ_BASE, 'and the queue base');
  assert.equal(IMG.readUInt16BE(0x2636ba), 0x0642, 'addi.w');
  assert.equal(IMG.readUInt16BE(0x2636bc), 0x50, 'of $50');
});

// ==================== 4. THE THREE GATES

test('W317 at or past scroll clock $9C it frees itself', { skip: SKIP }, () => {
  // `cmpi.w #$9C,$8130CE / blt` -- SIGNED, and the clock only rises, so this is a lifetime rather
  // than a window. It is also why the type never appears later in the stage.
  for (const c of [0x9c, 0x9d, 0x200]) {
    const f = world();
    f.ram.setU16(CLOCK, c);
    run(f);
    assert.equal(f.ram.u16(A5), 0, `clock $${c.toString(16)} frees it`);
  }
  const alive = world();
  alive.ram.setU16(CLOCK, 0x9b);
  run(alive);
  assert.notEqual(alive.ram.u16(A5), 0, 'and $9B is still alive');
});

test('W317 the freeze and the midboss gate each stop the spawn without ticking', { skip: SKIP }, () => {
  // `tst.w $8130D2 / bne` then `tst.w $8130D8 / bne`, both BEFORE the cadence -- so a frozen frame
  // does not consume a tick. A port that decremented first would drift the cadence.
  for (const [addr, name] of [[FREEZE, '$8130D2'], [MIDBOSS, '$8130D8']]) {
    const f = world();
    f.ram.setU16(A5 + 0x18, 6);
    f.ram.setU16(addr, 1);
    run(f);
    assert.equal(f.ram.u16(DEFQ_COUNT), 0, `${name} blocks the spawn`);
    assert.equal(f.ram.u8(A5 + 0x18), 0, 'and the counter did NOT tick');
  }
});

test('W317 the free check comes BEFORE the freeze check', { skip: SKIP }, () => {
  // `$265A14` is the first instruction; a frozen frame past the clock limit still frees the record.
  const f = world();
  f.ram.setU16(CLOCK, 0x100);
  f.ram.setU16(FREEZE, 1);
  run(f);
  assert.equal(f.ram.u16(A5), 0, 'freed even while frozen');
});

// ==================== 5. THE WINDOW

test('W317 the one window ends exactly at the handler', { skip: SKIP_IMG }, () => {
  // `$2659F8 + $1C == $265A14`. The type draws nothing of its own, so its sub-record prototype is
  // the whole of its data and the handler bounds it.
  assert.equal(0x2659f8 + 0x1c, HANDLER);
  assert.equal(IMG.readUInt16BE(HANDLER), 0x0c79, 'the handler opens with cmpi.w abs.l');
  assert.equal(ROM.u16(0x2659f8), 0x8000, 'and the prototype is readable');
});
