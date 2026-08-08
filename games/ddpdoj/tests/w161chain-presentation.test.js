import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const file = (name) => fs.readFileSync(new URL(name, root));
const cpu = new Uint8Array(file('tools/oracle/out/maincpu.bin'));
const be16 = (at) => (cpu[at] << 8) | cpu[at + 1];
const be32 = (at) => ((be16(at) << 16) | be16(at + 2)) >>> 0;

test('W161 uses the authentic transparent TX pen', () => {
  const source = file('src/web/assets.js').toString('utf8');
  assert.match(source, /const TX_TRANSPARENT_PEN = 15;/);
  assert.doesNotMatch(source, /const TX_TRANSPARENT_PEN = 0;/);
});

test('W161 ROM presentation tables resolve their complete families', () => {
  const bars = new Set();
  for (let loop = 0; loop < 2; loop++) {
    const ptr = be32(0x28809e + loop * 4);
    const cap = be16(0x287df0 + loop * 2);
    for (let i = 0; i < cap; i++) bars.add(0x1cc4a0 + be16(ptr + i * 2));
  }
  assert.equal(bars.size, 32);

  const early = new Set();
  for (let zoom = 0; zoom < 4; zoom++) {
    const base = be32(0x2856d4 + zoom * 4);
    for (let digit = 0; digit < 10; digit++) early.add(be32(base + digit * 4));
  }
  assert.equal(early.size, 40);

  const late = new Set();
  for (const base of [0x1c9778, 0x1c9980]) {
    for (let digit = 0; digit < 10; digit++) {
      late.add(base + be16(0x28567c + digit * 2));
    }
  }
  assert.equal(late.size, 20);

  const suffix = new Set();
  for (let i = 0; i < 12; i++) suffix.add(be32(0x285784 + i * 4));
  assert.equal(suffix.size, 12);

  const exporter = file('tools/export-web.mjs').toString('utf8');
  assert.match(exporter, /const HUD_CHAIN_SHARD = 17/);
  assert.match(exporter, /0x287ffe, 40, 'chain high-water/);
  assert.match(exporter, /0xc030 \+ i/);
});
