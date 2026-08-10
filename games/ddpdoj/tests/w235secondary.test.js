// W235: the secondary explosion $289AF4 (docket D3).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { POOL_C, C, REMAP, spawnPoolC289AF4, runPoolCDriver } from '../src/effects.js';
import { BUCKETS } from '../src/spritequeue.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

function ctxOf(ram) {
  const log = new UnportedLog();
  const spawns = [];
  const drops = [];
  return { log, spawns, drops, ctx: { ram, rom: ROM, unported: log, unportedLog: log,
    poolCSpawn(...a) { spawns.push(a); }, poolCDrop(...a) { drops.push(a); } } };
}

test('W235 the sibling allocator DELEGATES rather than copying the fill',
  { skip: SKIP }, () => {
    // The claim worth protecting is structural. $289AF4, $289B22 and $289B50 open
    // with the same fourteen instructions on the same $81CDEE table and differ only
    // in which fill they branch to -- the listings are in worklog 235 -- so the port
    // must have ONE fill. A second copy would drift, and $289C3A/$289DC8 agreeing
    // today is exactly the kind of thing that stops being true quietly.
    const src = readFileSync(new URL('../src/effects.js', import.meta.url), 'utf8');
    const body = src.split('export function spawnPoolC289AF4(')[1].split('\n}\n')[0];
    assert.ok(/return spawnPoolC289B50\(/.test(body), 'it calls the ported fill');
    assert.ok(/0x289af4/.test(body), 'passing its OWN site address for the drop');
    assert.ok(!/templateTable/.test(body), 'and does not read the template itself');
    // ...and the caller-record position is the one thing it does differently.
    assert.ok(/caller \+ 0x02/.test(body), '$289C50 move.l $2(a6),$2(a0)');
  });

test('W235 the secondary takes its position from the caller and its bucket from the row',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const { log, spawns, ctx } = ctxOf(ram);
    const caller = 0x81459c;
    ram.setU32(caller + 0x02, 0x30001800);          // ($2,A6), the position
    ram.setU8(caller + 0x1f, 4);                    // ($1f,A6), the remap index

    const slot = spawnPoolC289AF4(ram, ROM, ctx, 0x04, caller, REMAP.secondary267FB8);

    assert.equal(slot, POOL_C.base, 'the first free slot');
    // $289C50 move.l $2(a6),$2(a0) -- the position is the CALLER's, and the
    // collision pass at $289C54 may nudge it, so compare the short axis only.
    assert.equal(ram.u16(slot + C.pos + 2), 0x1800);
    // $2688AC..$2688B6 -- D1 is the $267FB8 row read as a WORD at ($1f,A6)*2.
    assert.equal(ram.u8(slot + C.bucket),
      ROM.u16(REMAP.secondary267FB8 + 4 * 2) & 0xff);
    assert.equal(ram.u16(POOL_C.count), 1, 'and the census counts it');
    assert.deepEqual(spawns.length, 1);
    assert.deepEqual(log.report(), [], 'it reaches no unported path');
  });

test('W235 the secondary explosion actually draws', { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx } = ctxOf(ram);
  const caller = 0x81459c;
  ram.setU32(caller + 0x02, 0x30001800);
  ram.setU8(caller + 0x1f, 0);
  const slot = spawnPoolC289AF4(ram, ROM, ctx, 0x04, caller, REMAP.secondary267FB8);
  assert.ok(slot, 'spawned');
  const descriptor = ram.u32(slot + C.descriptor);
  assert.notEqual(descriptor, 0, 'the template gave it a picture');

  const bucket = BUCKETS[ram.u8(slot + C.bucket)];
  const before = ram.u16(bucket.counter);
  runPoolCDriver(ram, ROM, ctx);
  assert.ok(ram.u16(bucket.counter) > before,
    `the driver enqueued it into bucket ${bucket.i}`);
  assert.equal(ram.u32(bucket.buffer + before + 4), descriptor,
    'and it is the template list entry, not something invented');
});

test('W235 a full pool drops the spawn instead of inventing a slot', { skip: SKIP }, () => {
  const ram = new Ram();
  const { drops, ctx } = ctxOf(ram);
  // Every slot the narrow limit can see is taken. $813098 is 0 and $81308C is 0
  // here, so `narrow` is true and the limit is slotsNarrow.
  for (let n = 0; n < POOL_C.slots; n++) {
    ram.setU16(POOL_C.base + n * POOL_C.stride + C.status, 0x8004);
  }
  const caller = 0x81459c;
  ram.setU32(caller + 0x02, 0x30001800);
  assert.equal(spawnPoolC289AF4(ram, ROM, ctx, 0x04, caller, REMAP.secondary267FB8), 0);
  assert.equal(drops.length, 1, 'and the drop is COUNTED, not silent');
  assert.equal(drops[0][1], 0x289af4, 'by this allocator\'s own address');
});
