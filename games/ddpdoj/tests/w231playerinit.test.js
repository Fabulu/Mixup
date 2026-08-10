// W231: the player object's one-time INIT $2491C0 and the pods' deploy $24C934
// (docket D9's last link).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { PaletteState } from '../src/palette.js';
import { UnportedLog } from '../src/unported.js';
import { ProtLatch } from '../src/protsim.js';
import { playerObject2491C0 } from '../src/player.js';
import { runOptionObject, OPT_TEMPLATES } from '../src/options.js';
import { ALLOC } from '../src/objalloc.js';
import { Game } from '../src/main.js';
import { portWordFromBits } from '../src/input.js';
import { RAM, P, OPT, BIT } from '../src/machine.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const seedPath = new URL('../rip/web/seed.bin', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';
const SKIP_SEED = HAVE && existsSync(seedPath)
  ? false : 'generated ROM tables/seed absent; skip, not pass';

/** A staged-and-committed player object exactly as `$25FFA8` leaves one: type 2,
 *  its init latch CLEAR, `+6` zero, and the side and position its creator wrote. */
function playerSlot(ram, { p2 = false, y = 0x1000, x = 0x0e00, fresh = true } = {}) {
  const slot = ALLOC.table;
  ram.setU16(slot, 0x8000 | (p2 ? 3 : 2));
  ram.setU8(slot + 0x03, 0);           // $2491D4's one-time latch, not yet set
  ram.setU8(slot + 0x06, fresh ? 0 : 1);
  ram.setU8(slot + 0x07, p2 ? 1 : 0);
  ram.setU16(slot + 0x08, y);
  ram.setU16(slot + 0x0a, x);
  return slot;
}

function ctxOf(ram) {
  const log = new UnportedLog();
  const events = [];
  return { log, events, ctx: { ram, rom: ROM, tables: MT, palette: new PaletteState(),
    prot: new ProtLatch(), unported: log, unportedLog: log,
    deathEvent(...a) { events.push(a); },
    soundPost() {}, effectSpawn() {}, bulletSpawn() {}, wallHits: [] } };
}

test('W231 pins the INIT template and the deploy table by their code boundaries',
  { skip: SKIP }, () => {
    // Both tables end exactly where the code that reads them begins, so neither
    // extent is a guessed run length.
    assert.equal(ROM.u16(0x24915e + 0x60), ROM.u16(0x2491be),
      'the 49th template word is the last two bytes before $2491C0');
    assert.throws(() => ROM.u16(0x24915e - 2),
      (e) => e.name === 'Unreached', 'the window starts AT the template');
    for (let i = 0; i < 6; i++) {
      const v = ROM.u16(0x24c928 + i * 2);
      assert.ok(v >= 0xe0 && v <= 0xf8, `deploy target [${i}] = $${v.toString(16)}`);
    }
    assert.throws(() => ROM.u16(0x24c928 + 6 * 2), (e) => e.name === 'Unreached',
      'and the window STOPS at $24C934, the `addq.b #$8,$1a(a6)` that reads it, '
      + 'so the six-word extent is pinned by code and not by a run length');
    assert.equal(createHash('sha256')
      .update(Buffer.from(ROM.bytes(0x24915e, 0x62))).digest('hex'),
    'e2ecb5029b9ed0d69f66b5e9c37042d0f2928362053b457be48c3066e209defe');
  });

test('W231 a fresh player object takes its position from the object record',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const { log, events, ctx } = ctxOf(ram);
    const slot = playerSlot(ram);
    ram.setU16(RAM.player1 + 0x5a, 2);        // formation 2, as $813088 seeds it
    ram.setU16(0x813088, 2);

    playerObject2491C0(ram, slot, 0, ctx);

    assert.equal(ram.u8(slot + 0x03) & 1, 1, '$2491D4 latched the init');
    assert.equal(ram.u16(0x813090) & 1, 1, '$2491CC marked P1 live');
    // $249426/$24942C -- THE POSITION, and the whole point of the slice.
    assert.deepEqual([ram.u16(RAM.player1 + P.posY), ram.u16(RAM.player1 + P.posX)],
      [0x1000, 0x0e00]);
    assert.equal(ram.u8(RAM.player1 + P.invuln), 0xf0, '$2493F2 move.b #$F0');
    assert.equal(ram.u8(RAM.player1 + 0x57), 0, '$24930A the side byte');
    assert.equal(ram.u16(RAM.player1) & ROM_TEMPLATE_WORD(), ROM_TEMPLATE_WORD(),
      '$2492E4/$2492E8 OR the template word into the state word');
    // $2492FE copied the other 48 words; word 1 of the template is ($2,A6), which
    // $249426 then overwrote, so check an untouched one -- word 10, ($16,A6).
    assert.equal(ram.u16(RAM.player1 + 0x16), ROM.u16(0x249160 + 9 * 2));
    // $24938E armed dispatcher request 9 for this side
    assert.deepEqual([ram.u16(0x8130fa), ram.u16(0x8130fc)], [9, 0]);
    // $2494C0..$2494D8 -- the $500000 latch chose the speed pair
    assert.equal(ctx.prot.readSlot(4), 0);
    assert.equal(ram.u8(RAM.player1 + P.speedIdx),
      ram.u8(RAM.player1 + P.baseSpeed), 'the SAME byte reaches $1A and $39');
    assert.deepEqual(events.map((e) => e[0]), ['player-init']);
    // The only counted call the init makes is the player TAIL's own, which every
    // player frame makes: the init reaches no NEW gap.
    assert.deepEqual(log.report().map((l) => l.trim().split(' ')[2]), ['$249EE8']);
  });

function ROM_TEMPLATE_WORD() { return ROM.u16(0x24915e); }

test('W231 the second frame takes the ordinary path, not the init', { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx } = ctxOf(ram);
  const slot = playerSlot(ram);
  ram.setU16(0x813088, 2);
  playerObject2491C0(ram, slot, 0, ctx);
  ram.setU16(RAM.player1 + P.posY, 0x2222);
  ram.setU8(RAM.player1 + P.invuln, 0xff);   // hold, so the frame is inert
  playerObject2491C0(ram, slot, 0, ctx);
  assert.equal(ram.u16(RAM.player1 + P.posY), 0x2222,
    'the init did not run again, so it did not re-place the ship');
});

test('W231 the pods deploy to the exact target $24C928 names', { skip: SKIP }, () => {
  const ram = new Ram();
  const { log, ctx } = ctxOf(ram);
  const opt = RAM.p1Options;
  // a live option block whose pods are NOT out: bit 1 of the state word clear
  ram.setU16(opt + OPT.state, 0x8001);
  ram.setU16(RAM.player1, 0x8000);
  ram.setU16(RAM.player1 + P.optFormation, 2);
  ram.setU16(RAM.player1 + P.shipSel, 0);
  ram.setU16(RAM.player1 + P.posY, 0x1000);
  ram.setU16(RAM.player1 + P.posX, 0x0e00);
  ram.setU16(0x812970, 1);                  // skip the shadow enqueues
  ram.setU32(opt + OPT.animTable, OPT_TEMPLATES);
  ram.setU32(opt + OPT.shadowTable, OPT_TEMPLATES);

  const target = ROM.u16(0x24c928);         // formation 2, ship select 0
  assert.equal(target, 0x00e0, 'the table entry this fixture must reach');
  let passes = 0;
  while ((ram.u16(opt + OPT.state) & 0x0002) === 0) {
    runOptionObject(ram, ctx);
    passes++;
    assert.ok(passes <= 40, 'the deploy converges instead of running on');
  }
  assert.equal(passes, target / 8, '$24C934 adds EIGHT per pass');
  assert.equal(ram.u8(opt + OPT.speedIdx), target & 0xff);
  assert.equal(ram.u8(opt + 0x3a), target & 0xff, '$24C95E mirrors it to $3A');
  // $24C9A8 re-bases BOTH pods on the ship EVERY pass and $24CA4E then moves them
  // one step, so the pod-to-ship gap is always exactly one step. Proved by
  // teleporting the ship mid-deploy: a pod that were merely integrating would keep
  // the old position and show the whole $2000, and a re-based one cannot.
  ram.setU16(opt + OPT.state, 0x8001);
  ram.setU8(opt + OPT.speedIdx, 0);
  for (let i = 0; i < 10; i++) runOptionObject(ram, ctx);
  const before = u16(ram.u16(opt + OPT.posY) - ram.u16(RAM.player1 + P.posY));
  ram.setU16(RAM.player1 + P.posY, u16(ram.u16(RAM.player1 + P.posY) + 0x2000));
  runOptionObject(ram, ctx);
  const after = u16(ram.u16(opt + OPT.posY) - ram.u16(RAM.player1 + P.posY));
  assert.ok(after < 0x1000, `the pods followed the teleport (gap $${after.toString(16)})`);
  assert.ok(before < 0x1000, `and were one step behind before it ($${before.toString(16)})`);

  assert.deepEqual(log.report(), [], 'and it reaches no unported path');
});

test('W231 a real respawn puts the ship back and deploys its pods',
  { skip: SKIP_SEED }, () => {
    const g = new Game(new Uint8Array(readFileSync(seedPath)), json,
      { palCatchUp: false });
    const shot = portWordFromBits([BIT.b1]);
    for (let n = 0; n < 90; n++) g.step(shot);
    g.ram.setU16(0x81b65c, 1);
    g.ram.setU16(0x81b642, 0x095f);
    g.step(portWordFromBits([BIT.b1, BIT.b2]));

    const opt = RAM.p1Options;
    for (let f = 92; f <= 495; f++) g.step(shot);
    // frame 494 is the reset: the record is cleared and the respawn is armed
    assert.deepEqual([g.ram.u16(RAM.player1 + P.posY),
      g.ram.u16(RAM.player1 + P.posX)], [0, 0]);

    g.step(shot);                            // 496: the new object runs its INIT
    assert.deepEqual([g.ram.u16(RAM.player1 + P.posY),
      g.ram.u16(RAM.player1 + P.posX)], [0x1000, 0x0e00],
    'the ship is back where the respawn entry said, not at zero');
    assert.equal(g.ram.u8(RAM.player1 + P.invuln), 0xf0);
    assert.equal(g.ram.u16(opt + OPT.state) & 0x8003, 0x8001,
      'the option block was reset by $2492C8, so its pods start stowed');
    assert.equal(g.ram.u8(opt + OPT.speedIdx), 8, 'and the deploy has begun');

    for (let f = 497; f <= 560; f++) g.step(shot);
    assert.equal(g.ram.u8(opt + OPT.speedIdx), 0xe0,
      '$24C928[0] is $E0 and the deploy stops exactly there');
    assert.equal(g.ram.u16(opt + OPT.state) & 0x0002, 0x0002, 'the pods are out');
    assert.ok(g.ram.u8(RAM.player1 + P.invuln) < 0xf0
      && g.ram.u8(RAM.player1 + P.invuln) > 0, 'and the invulnerability is running');
  });
