// W257: type $42's $8130F4 == 2 half -- A4 id6's phase, both $6C(A6) sides.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { REC } from '../src/bullets.js';
import { runHandler } from '../src/handlers.js';
import { ENEMY } from '../src/enemies.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const A5 = 0x814000, A6PARENT = 0x81b732;
const REC0 = ENEMY.table, SUB0 = 0x81459c;
const F4 = 0x8130f4, F2 = 0x8130f2, AIM_A = 0x8130e4, AIM_B = 0x8130e5;
const HANDLER = 0x2a3af6;

/** A live type-$42 child with A4 id6's flag raised, built by hand so each field the
 *  half reads is visible in the test rather than buried in a spawn. */
function child(role, { negative = false } = {}) {
  const ram = new Ram();
  const log = new UnportedLog();
  const bullets = [];
  ram.setU32(A5 + 0x06, A6PARENT);
  ram.setU32(A6PARENT + 0x22, 0x2c001a00);
  ram.setU16(REC0, 0x8042);
  ram.setU8(REC0 + 0x0c, 0x42);
  ram.setU32(REC0 + 0x06, SUB0);
  ram.setU32(REC0 + 0x1c, A6PARENT);
  ram.setU16(SUB0 + 0x02, 0x2000);
  ram.setU16(SUB0 + 0x04, 0x1800);
  ram.setU16(SUB0 + 0x18, 0x7fff);
  ram.setU8(SUB0 + 0x1f, 1);                   // arrived, which most arms require
  ram.setU8(SUB0 + 0x3c, role);
  ram.setU16(SUB0 + 0x6c, negative ? 1 : 0);   // which half
  ram.setU16(F4, 2);                           // A4 id6 is running
  const ctx = { ram, rom: ROM, tables: MT, bossRec: A5, bossSubRec: A6PARENT,
    unported: log, unportedLog: log,
    bulletSpawn(site, result) { bullets.push({ site, result }); },
    soundPost() {} };
  return { ram, log, ctx, bullets };
}
const run = (f) => runHandler(HANDLER, f.ram, ROM, REC0, f.ctx);
const dirs = (f) => f.bullets
  .flatMap((b) => (Array.isArray(b.result) ? b.result : [b.result]))
  .filter((r) => r && r.addr !== null).map((r) => f.ram.u8(r.addr + REC.dir));

test('W257 $6C(A6) picks the half, and it comes from the direction SIGN',
  { skip: SKIP }, () => {
    // The negative half's only observable effect today is its two cadences, so drive
    // both and check each side touched its own counters and not the other's.
    const neg = child(0, { negative: true });
    neg.ram.setU8(SUB0 + 0x74, 5);
    neg.ram.setU8(SUB0 + 0x8a, 5);
    run(neg);
    assert.equal(neg.ram.u8(SUB0 + 0x74), 4, '$2A3E2A -- the negative half ran');
    assert.equal(neg.ram.u8(SUB0 + 0x8a), 5, 'and the positive half did NOT');

    const pos = child(0);
    pos.ram.setU8(SUB0 + 0x74, 5);
    pos.ram.setU8(SUB0 + 0x8a, 5);
    run(pos);
    assert.equal(pos.ram.u8(SUB0 + 0x74), 5, '$2A3E22 beq -- the other way round');
    assert.equal(pos.ram.u8(SUB0 + 0x8a), 4, '$2A3EB0 -- the positive half ran');
  });

test('W257 the negative half keeps time for two emitters that do not exist',
  { skip: SKIP }, () => {
    const f = child(0, { negative: true });
    f.ram.setU8(SUB0 + 0x74, 0);
    f.ram.setU8(SUB0 + 0x75, 6);
    f.ram.setU8(SUB0 + 0x5e, 0);
    f.ram.setU8(SUB0 + 0x5f, 9);
    run(f);
    assert.equal(f.ram.u8(SUB0 + 0x74), 6, '$2A3E32 reloaded from $75(a6)');
    assert.equal(f.ram.u8(SUB0 + 0x5e), 9, '$2A3E68 reloaded from $5F(a6)');
    // Both shots are COUNTED by address rather than silently absent.
    const report = f.log.report().join('\n');
    assert.match(report, /\$2A3E40/, 'the $74 cadence\'s missing shot is counted');
    assert.match(report, /\$2A3E76/, 'and the $5E cadence\'s');
    assert.deepEqual(f.bullets, [], 'and nothing was fired');
  });

test('W257 the oscillator negates its step at BOTH ends of the $20..$60 band',
  { skip: SKIP }, () => {
    // Walking down: $8C is negative, and the flip happens once the speed is <= $20.
    const down = child(0);
    down.ram.setU16(SUB0 + 0x86, 1);
    down.ram.setU8(SUB0 + 0x88, 0);
    down.ram.setU8(SUB0 + 0x8c, 0xf0);         // -$10
    down.ram.setU8(REC0 + 0x1a, 0x30);         // one step from the floor
    run(down);
    assert.equal(down.ram.u8(REC0 + 0x1a), 0x20, '$2A3EE0 add.b -- $30 + -$10');
    assert.equal(down.ram.u8(SUB0 + 0x8c), 0x10, '$2A3EFA neg.b -- turned around');
    assert.equal(down.ram.u16(SUB0 + 0x86), 0, '$2A3EFE re-arms the delay');

    // ...and it does NOT flip while still above the floor.
    const mid = child(0);
    mid.ram.setU16(SUB0 + 0x86, 1);
    mid.ram.setU8(SUB0 + 0x88, 0);
    mid.ram.setU8(SUB0 + 0x8c, 0xf0);
    mid.ram.setU8(REC0 + 0x1a, 0x50);
    run(mid);
    assert.equal(mid.ram.u8(SUB0 + 0x8c), 0xf0, '$2A3EF6 bgt -- still descending');

    // Walking up: the other arm, and its threshold is $60 not $20.
    const up = child(0);
    up.ram.setU16(SUB0 + 0x86, 1);
    up.ram.setU8(SUB0 + 0x88, 0);
    up.ram.setU8(SUB0 + 0x8c, 0x10);
    up.ram.setU8(REC0 + 0x1a, 0x58);
    run(up);
    assert.equal(up.ram.u8(REC0 + 0x1a), 0x68);
    assert.equal(up.ram.u8(SUB0 + 0x8c), 0xf0, '$2A3F16 neg.b at the ceiling');
  });

test('W257 the sweep walks 0 -> 1 -> 2 -> 0 and widens by 2 each lap',
  { skip: SKIP }, () => {
    const f = child(0);
    f.ram.setU8(SUB0 + 0x8a, 0x7f);            // oscillator out of the way
    f.ram.setU16(SUB0 + 0x66, 0);
    f.ram.setU16(F2, 0);
    run(f);
    assert.equal(f.ram.u16(SUB0 + 0x66), 0, '$2A3F2A beq -- state 0 waits on $8130F2');
    f.ram.setU16(F2, 1);                       // which A4 id6 raises at $2A12B2
    f.ram.setU8(SUB0 + 0x6e, 0x7f);
    run(f);
    assert.equal(f.ram.u16(SUB0 + 0x66), 1, '$2A3F34 -- armed');
    assert.equal(f.ram.u16(SUB0 + 0x7c), 1, '$2A3F3A');

    // State 1 pulls $38 down by $6A until it is <= 4.
    f.ram.setU16(SUB0 + 0x38, 0x0010);
    f.ram.setU16(SUB0 + 0x6a, 0x0010);
    f.ram.setU8(SUB0 + 0x6e, 0);
    f.ram.setU8(SUB0 + 0x6f, 4);
    run(f);
    assert.equal(f.ram.u16(SUB0 + 0x38), 0, '$2A3F5C sub.w');
    assert.equal(f.ram.u16(SUB0 + 0x66), 2, '$2A3F6A -- and 0 is <= 4, so state 2');
    // $5F and not $60: `$2A3F76 cmpi.w #$2,$66(a6)` re-reads the state word state 1
    // just wrote, so state 2 runs on the SAME frame and spends its own tick. The same
    // sequential-state cascade F5's arms have.
    assert.equal(f.ram.u8(SUB0 + 0x6e), 0x5f, '$2A3F70, less state 2 own tick');

    // State 2 keeps pulling until |$38| reaches $78, then wraps to 0 and widens.
    f.ram.setU16(SUB0 + 0x78, 0x000c);
    f.ram.setU16(SUB0 + 0x38, 0xfffc);         // -4, one step from -$14
    f.ram.setU8(SUB0 + 0x6e, 0);
    run(f);
    assert.equal(f.ram.u16(SUB0 + 0x66), 0, '$2A3FAA -- back to state 0');
    assert.equal(f.ram.u16(SUB0 + 0x6a), 0xfff0, '$2A3FB0 neg.w -- the other way');
    assert.equal(f.ram.u16(SUB0 + 0x78), 0x000e, '$2A3FBE addq.w #$2 -- wider');
  });

test('W257 the amplitude is CAPPED at $10 rather than growing forever',
  { skip: SKIP }, () => {
    const f = child(0);
    f.ram.setU8(SUB0 + 0x8a, 0x7f);
    f.ram.setU16(SUB0 + 0x66, 2);
    f.ram.setU16(SUB0 + 0x78, 0x0010);         // already at the cap
    f.ram.setU16(SUB0 + 0x38, 0xffe0);
    f.ram.setU16(SUB0 + 0x6a, 0x0010);
    f.ram.setU8(SUB0 + 0x6e, 0);
    run(f);
    assert.equal(f.ram.u16(SUB0 + 0x66), 0);
    assert.equal(f.ram.u16(SUB0 + 0x78), 0x0010, '$2A3FBA beq -- capped');
  });

test('W257 roles $70 and $71 PUBLISH the aim, into their own byte each',
  { skip: SKIP }, () => {
    for (const [role, where, other] of [[0x70, AIM_A, AIM_B], [0x71, AIM_B, AIM_A]]) {
      const f = child(role);
      f.ram.setU8(SUB0 + 0x8a, 0x7f);
      f.ram.setU16(SUB0 + 0x28, 0x0330);       // heading $33 after the asr
      f.ram.setU8(SUB0 + 0x5a, 5);             // ...plus its own bias
      f.ram.setU8(where, 0);
      f.ram.setU8(other, 0);
      run(f);
      assert.equal(f.ram.u8(where), 0x38, `role $${role.toString(16)}: $33 + 5`);
      assert.equal(f.ram.u8(other), 0, 'and it does not touch the other pod\'s');
      assert.deepEqual(f.bullets, [], '$2A400E -- an aimer never fires');
    }
  });

test('W257 the eight firing roles read the aimer their group belongs to',
  { skip: SKIP }, () => {
    // roles 0..3 take $8130E4 and 4..7 take $8130E5, then +$80, then their spread.
    const spread = { 0: -0x10, 1: -0x04, 2: +0x04, 3: +0x10,
      4: -0x10, 5: -0x04, 6: +0x04, 7: +0x10 };
    for (const role of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const f = child(role);
      f.ram.setU8(SUB0 + 0x8a, 0x7f);
      f.ram.setU8(AIM_A, 0x10);
      f.ram.setU8(AIM_B, 0x50);                // deliberately different
      f.ram.setU8(SUB0 + 0x8e, 0);
      f.ram.setU8(SUB0 + 0x8f, 8);
      run(f);
      const base = role <= 3 ? 0x10 : 0x50;
      assert.deepEqual(dirs(f), [(base + 0x80 + spread[role]) & 0xff],
        `role ${role} fired along ${role <= 3 ? '$8130E4' : '$8130E5'}`);
      assert.equal(f.ram.u8(SUB0 + 0x8e), 8, '$2A4008 reloaded the cadence');
    }
  });

test('W257 D6 picks the GENERATOR, so the outer pairs fire a different class',
  { skip: SKIP }, () => {
    // The four $10 roles set D6 and go through $281764; the four $4 roles do not and
    // go through $2816F6. Using one entry for both would change every outer bullet.
    for (const [role, site] of [[0, 0x2a40e2], [1, 0x2a40d8],
      [2, 0x2a40d8], [3, 0x2a40e2], [4, 0x2a40e2], [5, 0x2a40d8],
      [6, 0x2a40d8], [7, 0x2a40e2]]) {
      const f = child(role);
      f.ram.setU8(SUB0 + 0x8a, 0x7f);
      f.ram.setU8(SUB0 + 0x8e, 0);
      run(f);
      assert.equal(f.bullets.length, 1);
      assert.equal(f.bullets[0].site, site,
        `role ${role} -> ${site === 0x2a40e2 ? '$281764' : '$2816F6'}`);
    }
  });

test('W257 an unarrived child neither fires nor counts a missing shot',
  { skip: SKIP }, () => {
    const f = child(2);
    f.ram.setU8(SUB0 + 0x1f, 0);               // has NOT arrived
    // ...and it must not arrive DURING the frame: $2A3D2E latches on the heading's top
    // byte being at either extreme, and a zeroed $28(a6) reads as arrival.
    f.ram.setU16(SUB0 + 0x28, 0x0800);
    f.ram.setU8(SUB0 + 0x8a, 0x7f);
    f.ram.setU8(SUB0 + 0x8e, 0);
    f.ram.setU8(SUB0 + 0x58, 0);
    run(f);
    assert.deepEqual(f.bullets, [], '$2A4026 tst.b/beq');
    assert.ok(!f.log.report().join('\n').includes('$2A40FE'),
      '$2A40E8 beq -- the $58 cadence is not even reached');
  });

test('W257 an arrived child still counts the third absent emitter', { skip: SKIP }, () => {
  const f = child(2);
  f.ram.setU8(SUB0 + 0x8a, 0x7f);
  f.ram.setU8(SUB0 + 0x8e, 0x7f);              // the fan out of the way
  f.ram.setU8(SUB0 + 0x58, 0);
  f.ram.setU8(SUB0 + 0x59, 0x0c);
  run(f);
  assert.equal(f.ram.u8(SUB0 + 0x58), 0x0c, '$2A40F8 reloaded from $59(a6)');
  assert.match(f.log.report().join('\n'), /\$2A40FE/);
});

test('W257 role $FF meeting A4 id6 is still a loud throw', { skip: SKIP }, () => {
  const f = child(0xff);
  assert.throws(() => run(f), (e) => e.name === 'Unreached'
    && e.romAddress === 0x2a3afe && /A1 9 is the only spawner/.test(e.message));
});
