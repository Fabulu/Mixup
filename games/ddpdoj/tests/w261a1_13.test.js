// W261: Stage-4 boss A1 13, the alternating spokes-and-gaps fan pair.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { REC } from '../src/bullets.js';
import { SCHED, scriptAddresses } from '../src/scheduler.js';
import { a1_13Init2A34CA, a1_13Step2A34EE } from '../src/boss4.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const A1_TABLE = 0x2a1608;
const A5 = 0x814000, A6 = 0x81b732;
const SLOT = SCHED.a1Base;
const DISPATCH = 0x2a3556;
const FAN_A = [0, 6, 12, 18, 24, 30, -6, -12, -18, -24, -30];
const FAN_B = [3, 9, 15, 21, 27, -3, -9, -15, -21, -27];
const SITES_A = [0x2a35c6, 0x2a35ce, 0x2a35d6, 0x2a35de, 0x2a35e6, 0x2a35ee,
  0x2a35fa, 0x2a3604, 0x2a360e, 0x2a3618, 0x2a3622];
const SITES_B = [0x2a368e, 0x2a3696, 0x2a369e, 0x2a36a6, 0x2a36ae,
  0x2a36ba, 0x2a36c4, 0x2a36ce, 0x2a36d8, 0x2a36e2];

function fixture(count = 4) {
  const ram = new Ram();
  const log = new UnportedLog();
  const bullets = [];
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A6 + 0x22, 0x2c001a00);
  ram.setU16(SLOT, 0x800d);
  ram.setU16(SLOT + 0x10, count);               // A4 id6's parameter, $2A1330
  const ctx = { ram, rom: ROM, tables: MT, bossRec: A5, bossSubRec: A6,
    unported: log, unportedLog: log,
    bulletSpawn(site, result) { bullets.push({ site, result }); } };
  return { ram, log, ctx, bullets };
}
const init = (f) => a1_13Init2A34CA(f.ram, ROM, f.ctx, SLOT);
const step = (f) => a1_13Step2A34EE(f.ram, ROM, f.ctx, SLOT);
const dirs = (f) => f.bullets
  .flatMap((b) => (Array.isArray(b.result) ? b.result : [b.result]))
  .filter((r) => r && r.addr !== null).map((r) => f.ram.u8(r.addr + REC.dir));

/** Drive to the next fan and return the shots it made. */
function nextFan(f) {
  const before = f.bullets.length;
  for (let n = 0; n < 80 && f.bullets.length === before; n++) {
    f.ram.setU8(SLOT + 0x04, 0);
    f.ram.setU8(SLOT + 0x06, 0);
    step(f);
  }
  return f.bullets.slice(before);
}

test('W261 A1 13 is registered and its dispatch is TWO entries',
  { skip: SKIP }, () => {
    for (const a of [0x2a34ca, 0x2a34ee])
      assert.ok(scriptAddresses().includes(a), `$${a.toString(16)} registered`);
    assert.deepEqual([ROM.u32(A1_TABLE + 13 * 8), ROM.u32(A1_TABLE + 13 * 8 + 4)],
      [0x2a34ca, 0x2a34ee]);
    // $2A3540 steps by 4 and $2A3544 masks with $7, so the cursor is 0 or 4 -- two
    // longwords -- and the first entry is $2A3556 + 8, so the table bounds itself.
    assert.deepEqual([ROM.u32(DISPATCH), ROM.u32(DISPATCH + 4)],
      [0x2a355e, 0x2a362a]);
    assert.equal(ROM.u32(DISPATCH), DISPATCH + 8);
    assert.throws(() => ROM.u32(DISPATCH + 8), (e) => e.name === 'Unreached',
      'and the window stops at the first fan code');
  });

test('W261 INIT falls through and the burst count comes from A4 id6',
  { skip: SKIP }, () => {
    const f = fixture(3);
    init(f);
    // $2A34DC writes the WORD $0001, whose low half lands on $9(a4), and $2A34E8 then
    // OVERWRITES that byte with $11(a4). Folding the two would fire exactly one fan.
    assert.equal(f.ram.u8(SLOT + 0x09), 3, '$2A34E8 -- A4 id6 parameter, not the 1');
    // $2A34D0 writes the WORD $0020, so the byte the cadence counts is $4(a4) = ZERO and
    // byte $5 is the $20 period. `bcc` borrows out of an old zero, so the arming frame
    // itself arms the run: $8(a4) takes $9(a4) and $4(a4) reloads to $20.
    assert.equal(f.ram.u8(SLOT + 0x08), 3, '$2A3504 armed it on the INIT frame');
    assert.equal(f.ram.u8(SLOT + 0x04), 0x20, '$2A34FE reloaded from $5(a4)');
    // ...but the INNER cadence arrives at 8, so no fan yet.
    assert.equal(f.ram.u8(SLOT + 0x06), 7, '$2A34D6 left 8, less its own tick');
    assert.deepEqual(f.bullets, [], 'nothing fired on the arming frame');
    assert.deepEqual(f.log.report(), []);
  });

test('W261 fan A is ELEVEN shots centred on the base', { skip: SKIP }, () => {
  const f = fixture();
  init(f);
  const shots = nextFan(f);
  assert.equal(shots.length, 11, '$2A35C6 -- eleven');
  assert.deepEqual(shots.map((b) => b.site), SITES_A);
  assert.deepEqual(dirs(f), FAN_A.map((d) => (0x80 + d) & 0xff),
    'the base, then out to +$1E, then back through the base to -$1E');
  // `move.w d7,d1` at $2A35F4 is what makes the second half start from the BASE again
  // rather than from where the first half ended.
  assert.equal(dirs(f)[0], 0x80, 'shot 1 is the base itself');
  assert.equal(dirs(f)[6], (0x80 - 6) & 0xff, 'and shot 7 is the base minus 6');
});

test('W261 fan B is TEN shots STRADDLING the base, so the pair is spokes and gaps',
  { skip: SKIP }, () => {
    const f = fixture();
    init(f);
    nextFan(f);                                 // fan A
    assert.equal(f.ram.u16(SLOT + 0x0a), 4, '$2A3540 -- the cursor advanced');
    const before = f.bullets.length;
    const shots = nextFan(f);
    assert.equal(shots.length, 10, '$2A368C -- ten');
    assert.deepEqual(shots.map((b) => b.site), SITES_B);
    assert.deepEqual(dirs(f).slice(before), FAN_B.map((d) => (0x80 + d) & 0xff));
    // No shot in fan B lands on any angle fan A used, which is what "gaps" means.
    const a = new Set(FAN_A.map((d) => (0x80 + d) & 0xff));
    for (const d of FAN_B) assert.ok(!a.has((0x80 + d) & 0xff),
      `+${d} is not one of fan A angles`);
  });

test('W261 the cursor alternates 0 and 4 and never reaches a third entry',
  { skip: SKIP }, () => {
    const f = fixture(8);
    init(f);
    const seen = [];
    for (let n = 0; n < 6; n++) { nextFan(f); seen.push(f.ram.u16(SLOT + 0x0a)); }
    assert.deepEqual(seen, [4, 0, 4, 0, 4, 0],
      '$2A3544 andi.w #$7 -- two entries, forever');
  });

test('W261 it fires exactly its parameter many fans and then retires',
  { skip: SKIP }, () => {
    for (const count of [1, 3]) {
      const f = fixture(count);
      init(f);
      let fans = 0;
      for (let n = 0; n < 400 && f.ram.u16(SLOT) !== 0; n++) {
        const before = f.bullets.length;
        f.ram.setU8(SLOT + 0x04, 0);
        f.ram.setU8(SLOT + 0x06, 0);
        step(f);
        if (f.bullets.length > before) fans++;
      }
      assert.equal(f.ram.u16(SLOT), 0, `count ${count}: $2A3552 clr.w (a4)`);
      assert.equal(fans, count, `count ${count}: exactly that many fans`);
    }
  });

test('W261 BOTH $281744 fans are unreachable in this build', { skip: SKIP }, () => {
  // Each entry opens with a `bra` straight over an otherwise identical block that fires
  // through $281744, and nothing in the boss bank branches, jumps or calls into either
  // ($2A3562 and $2A362E, checked over every bra/bcc/jsr/jmp in $2A0000..$2A5000). That
  // is 21 call sites this build cannot reach. Those addresses are CODE and so are not in
  // any ROM window -- the port cannot read them and neither can this test, which is why
  // the assertion is on the OBSERVABLE consequence instead.
  const f = fixture();
  init(f);
  const a = nextFan(f);
  const b = nextFan(f);
  assert.equal(a.length + b.length, 21, 'eleven and ten, NOT forty-two');
  // ...and every one of them came from a $281708 site, never a $281744 one.
  const live = new Set([...SITES_A, ...SITES_B]);
  for (const shot of [...a, ...b]) {
    assert.ok(live.has(shot.site), `$${shot.site.toString(16)} is a $281708 site`);
  }
});
