// W174: stage-2 type $90, exact init/handler/data/art closure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES, TYPE90_ART } from '../src/handlers.js';
import { BUCKETS } from '../src/spritequeue.js';
import { B } from '../src/effects.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const evidencePath = new URL('../tools/w174-stage2-type90-evidence.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const tablesJson = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(tablesJson.rom) : null;
const MT = HAVE ? new MoveTables(tablesJson, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = 0x81332c, A6 = 0x81459c;

function fixture() {
  const ram = new Ram();
  ram.setU16(A5, 0x8000);
  ram.setU16(A5 + 0x04, 0);
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, 0);
  ram.setU8(A5 + 0x0c, 0x90);
  ram.setU16(0x813092, 1);
  ram.setU16(0x813094, 2);
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x5000);
  ram.setU16(0x8103ea, 0x5000);
  runInitBodyAddr(0x27980a, ram, ROM, A5, new UnportedLog(), MT);
  ram.setU32(A6 + 0x02, 0x20004000);
  return ram;
}

function context(ram) {
  const sounds = [], kills = [];
  const unported = new UnportedLog();
  return { sounds, kills, unported, ctx: {
    ram, rom: ROM, tables: MT, unported,
    soundPost: (a) => sounds.push(a),
    killEvent: (score, hit) => kills.push([score, hit]),
  } };
}

function sprites(ram, bucket) {
  const b = BUCKETS[bucket], out = [];
  for (let off = 0; off < ram.u16(b.counter); off += 12)
    out.push(ram.u32(b.buffer + off + 4));
  return out;
}

test('W174/1 ROM pins the one occurrence, exact movement, closure, and type $96 frontier',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x27980a));
  assert.ok(HANDLER_ADDRESSES.includes(0x279898));
  assert.deepEqual(TYPE90_ART, { main: 0x2351ac });
  assert.equal(ROM.u32(0x279872), TYPE90_ART.main,
    'the one long-form prototype directly owns the one sprite stream');
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => [
    ROM.u8(0x279856 + i * 2), ROM.u8(0x279857 + i * 2),
  ]), [[0x10, 0x0f], [0x11, 0x0e], [0x10, 0x0f], [0x10, 0x0f], [0x10, 0x0f]]);
  assert.deepEqual(Array.from({ length: 4 }, (_, i) => ROM.u16(0x279a92 + i * 2)),
    [0x0480, 0x0600, 0x0740, 0x08c0]);
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => ROM.u8(0x233670 + i)),
    [0x7c, 0x00, 0x3d, 0x00, 0x40, 0x00],
    'idx $037 is not type $8F\'s unrelated $2340CC stream');
  const rows = [];
  for (let i = 0; i < 332; i++) {
    const rec = 0x2325d0 + i * 8;
    if (ROM.u8(rec + 4) === 0x90) rows.push([rec, ROM.u16(rec), ROM.u16(rec + 6) & 0xfff]);
  }
  assert.deepEqual(rows, [[0x2328d0, 0x0085, 0x037]]);
  assert.deepEqual([ROM.u16(0x2329c0), ROM.u8(0x2329c4), ROM.u16(0x2329c6) & 0xfff],
    [0x00b8, 0x96, 0x03c]);
});

test('W174/2 init copies exact prototypes and uses adjacent big-endian palette bytes',
  { skip: SKIP }, () => {
  const ram = fixture();
  assert.equal(ram.u16(A6), 0xa000);
  assert.equal(ram.u32(A6 + 0x0a), TYPE90_ART.main);
  assert.equal(ram.u16(A6 + 0x18), 0x7fff);
  assert.equal(ram.u8(A6 + 0x1d), 0x11);
  assert.equal(ram.u8(A5 + 0x1a), 0x11);
  assert.equal(ram.u8(A5 + 0x1b), 0x0e);
  assert.equal(ram.u16(A5 + 0x1c), 1);
  assert.equal(ram.u16(A5 + 0x1e), 1);

  const ranked = fixture();
  ranked.setU16(0x813098, 1);
  runInitBodyAddr(0x27980a, ranked, ROM, A5, new UnportedLog(), MT);
  assert.equal(ranked.u16(A5 + 0x1e), 0,
    '$27984E clears the whole particle-count word when rank is nonzero');
});

test('W174/3 direct draw is exactly one bucket-0 call and lifetime carry polarity is pinned',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  runHandler(0x279898, ram, ROM, A5, c.ctx);
  assert.deepEqual(sprites(ram, 0), [TYPE90_ART.main]);
  assert.deepEqual(sprites(ram, 7), []);
  assert.equal(ram.u8(A5 + 0x16), 1, 'no carry marks the enemy as entered');
  ram.setU32(A6 + 0x02, 0x90002000);
  runHandler(0x279898, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5), 0, 'later carry frees an already-entered enemy');
});

test('W174/4 HP gate revives above $3C00, then installs the second threshold below it',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU32(A6 + 0x02, 0x40003c00);
  ram.setU16(A6 + 0x18, 0x8001);
  runHandler(0x279898, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A6 + 0x18), 0x7fff);
  assert.equal(ram.u16(A5 + 0x18), 0x7eff);
  assert.equal(ram.u16(A5 + 0x1e), 2);
  assert.equal(ram.u16(A5 + 0x20), 1);
  ram.setU32(A6 + 0x02, 0x20004000);
  runHandler(0x279898, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5 + 0x1c), 0);
  assert.equal(ram.u16(A6 + 0x18), 0x0400);
  assert.equal(ram.u16(A5 + 0x18), 0x0300);
});


/** W411: every live pool-A record, as {kind index, long axis, short axis}. */
function poolA(ram) {
  const out = [];
  for (let i = 0; i < 80; i++) {
    const a = 0x8171be + i * 0x2c;
    const st = ram.u16(a);
    if (st !== 0) out.push({ kind: (st & 0x7c) >> 2, y: ram.u16(a + 2), x: ram.u16(a + 4) });
  }
  return out;
}

test('W174/5 threshold particles consume ROM RNG indices and subtract threshold once',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU16(A5 + 0x18, 0x0600);
  ram.setU16(A5 + 0x1e, 1);                           // DBRA => two calls
  ram.setU16(A6 + 0x18, 0x0500);
  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(0x803916, 0);
  // W411: THE FIXTURE'S OWN X WAS OFF-SCREEN FOR THE DROP. `$280B68`'s abort is
  // `X + $E00 + $813172 + $AC00` carrying, and the fixture sits at X = $4000, so
  // every particle offset from $0600 up ($279A92 has three of the four) lands past
  // it and `$280B2A` undoes the allocation. The note-counting version of this test
  // could not see that, because a note is written before the fill runs. Move the
  // carrier on screen so the assertion is about the loop and not about the abort.
  ram.setU32(A6 + 0x02, 0x20002000);
  runHandler(0x279898, ram, ROM, A5, c.ctx);
  // W411 (docket D49): `$279990 jsr $27F8FA` was a counted note and is now a real
  // pool-A record at kind index FOUR ($27998E moveq #$10), the one site of the ten
  // whose D0 is not $8. `$280BCE[4]` ends `clr.b ($1,A0)`, which wipes the index out
  // of the status word, so the drop is identified by its POSITION and not its kind.
  const drops = poolA(ram);
  assert.equal(drops.length, 2, 'DBRA on 1 is two records');
  const base = ram.u32(A6 + 0x02);
  // ...and the RNG indices are 1 and SIX, not 1 and 2. `$803917` is one shared byte
  // counter for the whole machine, and the fill this loop now reaches draws FOUR more
  // times per record ($242EC2 the animation phase, $242B3C the speed, $242FDE the
  // angle spread, $2431F4 the angle). So each pass costs five draws, not one, and the
  // second particle reads $24324E[6]. The note-counting version of this test could not
  // see that either -- the note was written before the fill ran.
  const PER_PASS = 5;
  const expected = [1, 1 + PER_PASS].map((state) => {
    const index = ROM.u8(0x24324e + state);
    return ((base + ((0x08c00000 | ROM.u16(0x279a92 + index * 2)) >>> 0)) >>> 0);
  }).map((q) => `${(q >>> 16) & 0xffff},${q & 0xffff}`).sort();
  assert.deepEqual(drops.map((d) => `${d.y},${d.x}`).sort(), expected,
    'hardcoding one particle vector instead of indexing the ROM table makes this red');
  assert.ok(drops.every((d) => d.kind === 0),
    '$280D2A clr.b ($1,A0) -- hook 4 erases the index, and 0 and 4 share $27FA30');
  assert.equal(ram.u8(0x803917), 2 * PER_PASS,
    'two passes, each one particle draw plus the four the fill makes');
  assert.equal(ram.u16(A5 + 0x18), 0x0500, 'threshold subtract happens once after the loop');
});

test('W174/6 death scores $32, posts sound, emits 0D/0D/85, then lingers',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU16(A5 + 0x1c, 0);
  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(A6 + 0x18, 0x8001);
  runHandler(0x279898, ram, ROM, A5, c.ctx);
  assert.notEqual(ram.u16(A5), 0, 'death draws once and enters its countdown tail');
  assert.deepEqual(c.sounds, [0x28c2dc]);
  assert.deepEqual(c.kills, [[0x32, 0x10]]);
  assert.deepEqual(Array.from({ length: 3 }, (_, i) =>
    ram.u16(0x81b732 + i * 0x38) & 0xff), [0x0d, 0x0d, 0x85]);
  assert.equal(ram.u32(0x81b732 + B.nudge), 0xfa000600);
  assert.equal(ram.u16(0x81b732 + B.delay), 4);
  assert.equal(ram.u32(0x81b732 + 0x38 + B.nudge), 0xfa00fa00);
  assert.equal(ram.u16(0x81b732 + 0x38 + B.delay), 2);
  assert.equal(ram.u32(0x81b732 + 0x70 + B.nudge), 0xfe000000);
  assert.equal(ram.u16(A6), 0x8080);
  for (let n = 0; n < 5; n++) runHandler(0x279898, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5), 0, 'prototype linger byte 4 frees on the fifth tail pass');
});

test('W174/7 controlled evidence remains explicit about its bounded result',
  { skip: !existsSync(evidencePath) ? 'controlled MAME evidence pending' : false }, () => {
  const e = JSON.parse(readFileSync(evidencePath, 'utf8'));
  assert.equal(e.static_occurrence_count, 1);
  assert.deepEqual(e.static_occurrences,
    [{ record: 0x2328d0, trigger: 0x0085, type: 0x90 }]);
  assert.ok(['OBSERVED_STAGE2_TYPE90', 'NO_STAGE2_TYPE90'].includes(e.controlled_attempt.outcome));
  assert.equal(e.emitter.rom_call, 0x23d762);
  assert.equal(e.emitter.bucket, 0);
});
