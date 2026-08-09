import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { RNG } from '../src/rng.js';
import { BUCKETS } from '../src/spritequeue.js';
import {
  B, D, POOL_B, POOL_D, runSubEffectDriver, subSpawn288ED0,
} from '../src/effects.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tablesPath = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const tables = JSON.parse(fs.readFileSync(tablesPath, 'utf8'));
const rom = new RomWindows(tables.rom);
const moveTables = new MoveTables(tables, rom);

const context = () => ({ rom, tables: moveTables });

test('W191 pool-D debris allocates, emits real art, and drains', () => {
  const ram = new Ram();
  const ctx = context();
  const parent = POOL_B.base;
  ram.setU32(parent + B.pos, 0x20002000);
  ram.setU16(parent + B.bucket, 0);
  ram.setU16(parent + B.sub12, 0);
  ram.setU16(parent + B.sub14, 0);

  const beforeRng = ram.u8(RNG.counter);
  assert.equal(subSpawn288ED0(ram, ctx, parent), true);
  assert.equal(ram.u16(parent + B.sub12), 0xffff, 'the parent request is one-shot');
  assert.equal(ram.u16(POOL_D.count), 1);
  assert.equal((ram.u8(RNG.counter) - beforeRng) & 0xff, 6,
    'template 0 consumes the cartridge routine\'s six shared RNG draws');

  const debris = POOL_D.base;
  assert.equal(ram.u16(debris + D.status), 0x8000);
  assert.equal(ram.u16(debris + D.bucket), 0,
    '$2896AC..$2896B8 folds the current packed selector to bucket 0');
  const sprite = ram.u32(debris + D.descriptor);
  assert.ok(sprite >= 0x22a51c && sprite < 0x22b79c,
    `descriptor $${sprite.toString(16)} comes from the exported debris chain`);

  ram.setU16(0x803912, 1); // negative D6 high word skips the periodic cull
  ram.setU16(0x80390c, 1);
  const bucket0 = BUCKETS[0];
  const first = runSubEffectDriver(ram, rom, ctx);
  assert.equal(first.live, 1);
  assert.equal(first.emitted, 1);
  assert.equal(ram.u16(bucket0.counter), 12, 'one real bucket-0 display record');

  for (let n = 0; n < 500 && ram.u16(POOL_D.count) !== 0; n++) {
    runSubEffectDriver(ram, rom, ctx);
  }
  assert.equal(ram.u16(POOL_D.count), 0, 'hold and lifetime return the slot');
  assert.equal(ram.u16(debris + D.status), 0);

  const multi = new Ram();
  const parent2 = POOL_B.base;
  multi.setU32(parent2 + B.pos, 0x20002000);
  multi.setU16(parent2 + B.sub12, 1);
  multi.setU16(parent2 + B.sub14, 0x0400);
  const multiBefore = multi.u8(RNG.counter);
  subSpawn288ED0(multi, context(), parent2);
  assert.equal(multi.u16(POOL_D.count), 2);
  assert.equal((multi.u8(RNG.counter) - multiBefore) & 0xff, 12,
    'both records in a multi-request receive their own position-jitter draw');
});
