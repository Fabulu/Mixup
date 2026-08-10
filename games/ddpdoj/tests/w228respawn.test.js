// W228: the respawn $25FFA8, jump-table entry 1 of the $25FF7A dispatcher
// (docket D9, the link after W227).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { respawn25FFA8 } from '../src/player.js';
import { ALLOC } from '../src/objalloc.js';
import { Game } from '../src/main.js';
import { portWordFromBits } from '../src/input.js';
import { RAM, P, BIT } from '../src/machine.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const seedPath = new URL('../rip/web/seed.bin', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';
const SKIP_SEED = HAVE && existsSync(seedPath)
  ? false : 'generated ROM tables/seed absent; skip, not pass';

const ENTRY = 0x8130fa;          // P1's $25FF7A table entry, stride $24
const COUNT = 0x8130be;          // what the seed's $8(a6) points at

/** The entry as the seed carries it, with the count set by the caller. */
function entry(ram, count, { p2 = false, type = 2 } = {}) {
  ram.setU16(ENTRY, 1);                       // $24A210 armed it
  ram.setU16(ENTRY + 0x02, 0x1234);           // cleared unconditionally at $26004E
  ram.setU32(ENTRY + 0x08, COUNT);
  ram.setU16(ENTRY + 0x0c, 0x1000);
  ram.setU16(ENTRY + 0x0e, 0x0e00);
  ram.setU16(ENTRY + 0x14, type);
  ram.setU8(ENTRY + 0x17, p2 ? 1 : 0);
  ram.setU32(ENTRY + 0x18, 0xdeadbeef);
  ram.setU16(COUNT, count);
  return ENTRY;
}

function ctxOf(ram) {
  const log = new UnportedLog();
  const events = [];
  return { log, events, ctx: { ram, rom: ROM, unported: log, unportedLog: log,
    deathEvent(...a) { events.push(a); } } };
}

test('W228 a life in hand creates the player object and spends the count',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const { log, events, ctx } = ctxOf(ram);
    const a6 = entry(ram, 1);

    respawn25FFA8(ram, ctx, a6);

    assert.equal(ram.u16(COUNT), 0, '$25FFC8 subq.w #$1 on the pointed-at word');
    assert.equal(ram.u16(a6), 0, '$26004A: state 0, the dispatcher goes idle');
    assert.equal(ram.u16(a6 + 0x02), 0, '$26004E clears it unconditionally');
    assert.equal(ram.u16(0x8130d4), 0x78, '$25FFB6');
    assert.deepEqual([ram.u16(0x81316c), ram.u16(0x81316a)], [1, 0], '$261116');

    // $260028 staged a create of the entry's type, and $26002E kept its id
    const staged = ALLOC.createStage;
    assert.equal(ram.u16(staged) & 0xff, 2, 'object type 2, P1');
    assert.equal(ram.u16(staged) & 0x8000, 0x8000, 'and it is marked live');
    assert.equal(ram.u32(a6 + 0x18), ram.u32(staged + ALLOC.idOff));
    assert.notEqual(ram.u32(a6 + 0x18), 0xdeadbeef);
    assert.deepEqual([ram.u8(staged + 0x06), ram.u8(staged + 0x07),
      ram.u16(staged + 0x08), ram.u16(staged + 0x0a)], [0, 0, 0x1000, 0x0e00],
    '$260032..$260044 hand the new object its side and its position');

    assert.deepEqual(events, [['respawn', 1, 0, 'ok']]);
    // the only thing this arm defers is a VRAM clear and a HUD row
    assert.deepEqual(log.report().map((l) => l.trim().split(' ')[2]),
      ['$23C668', '$2878CC']);
  });

test('W228 the last life falls through to the game-over arm', { skip: SKIP }, () => {
    const ram = new Ram();
    const { events, ctx } = ctxOf(ram);
    const a6 = entry(ram, 0);

    respawn25FFA8(ram, ctx, a6);

    assert.equal(ram.u16(COUNT), 0xffff, 'the count goes NEGATIVE, which is the test');
    assert.equal(ram.u16(a6), 2,
      '$260004 arms request 2, and $25FF52[2] is $260056, the continue entry');
    assert.deepEqual([ram.u16(0x812930), ram.u16(0x812934), ram.u16(0x812938)],
      [0, 1, 0], '$25FFD8, P1 side');
    assert.equal(ram.u16(ALLOC.createStage), 0, 'and NO object was created');
    assert.deepEqual(events, [['game-over', 1, 0xffff]]);
  });

test('W228 the P2 arm writes the other three words', { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx } = ctxOf(ram);
  respawn25FFA8(ram, ctx, entry(ram, 0, { p2: true, type: 3 }));
  assert.deepEqual([ram.u16(0x812932), ram.u16(0x812936), ram.u16(0x81293a)],
    [0, 1, 0], '$25FFF0, P2 side');
  assert.deepEqual([ram.u16(0x812930), ram.u16(0x812934), ram.u16(0x812938)],
    [0, 0, 0], "and P1's are untouched");
});

test('W228 a real death respawns and keeps running',
  { skip: SKIP_SEED }, () => {
    const g = new Game(new Uint8Array(readFileSync(seedPath)), json,
      { palCatchUp: false });
    const shot = portWordFromBits([BIT.b1]);
    for (let n = 0; n < 90; n++) g.step(shot);
    g.ram.setU16(0x81b65c, 1);
    g.ram.setU16(0x81b642, 0x095f);
    g.step(portWordFromBits([BIT.b1, BIT.b2]));
    assert.equal(g.ram.u16(COUNT), 2, 'the seed carries two in reserve');

    let died = 0;
    // With W231's init and pod deploy in, this scenario now survives THREE deaths
    // and two full respawns: it dies at 426, 767 and 1207, spends the seed's two
    // lives at 497 and 838, and at 1278 the third death exhausts the count and arms
    // request 2 -- $260056, the credit/continue entry, which is the next frontier.
    // 700 is inside the first respawn's life, after its reset at 497 and before the
    // second death at 767, so the count below is exactly one and the player is alive.
    for (let f = 92; f <= 700; f++) {
      g.step(shot);                  // stopped at $24CA60, then $25FFA8, then $24C934
      if (!died && (g.ram.u8(RAM.player1) & 1) !== 0) died = f;
    }
    assert.equal(died, 426);
    assert.equal(g.ram.u16(COUNT), 1, 'one life spent');
    assert.equal(g.ram.u16(ENTRY), 0, 'and the dispatcher is idle again');
    assert.equal(g.ram.u8(RAM.player1) & 1, 0, 'the death bit is clear');

    // The respawned player answers the stick, and W231 gave it a long axis too:
    // $2491C0's init takes the position from the object record the respawn filled.
    // w231playerinit.test.js pins that exactly; here it is enough that it is set.
    const left = portWordFromBits([BIT.left]);
    for (let n = 0; n < 60; n++) g.step(left);    // ...and 760 < 767
    assert.equal(g.ram.u16(RAM.player1 + P.posX), 0x300);
    assert.notEqual(g.ram.u16(RAM.player1 + P.posY), 0);
  });
