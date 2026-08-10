// W240: the result screen's $23C638 (the $900000 ring clear) and the two bomb-stock
// sites that were counted while both of their routines were already ported.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { BgVram } from '../src/background.js';
import { RomWindows } from '../src/rom.js';
import { Game } from '../src/main.js';
import { runStageAdvance242952 } from '../src/stageend.js';
import { portWordFromBits } from '../src/input.js';
import { BIT } from '../src/machine.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const seedPath = new URL('../rip/web/seed.bin', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';
const SKIP_SEED = HAVE && existsSync(seedPath)
  ? false : 'generated ROM tables/seed absent; skip, not pass';

test('W240 clear23C638 zeroes the whole modelled ring', () => {
  const v = new BgVram();
  v.setLong(3, 7, 0x12345678);
  v.setLong(0, 0, 0xffffffff);
  assert.notEqual(v.long(3, 7), 0);
  v.clear23C638();
  assert.equal(v.long(3, 7), 0);
  assert.equal(v.long(0, 0), 0);
  assert.equal(v.w.reduce((n, w) => n + w, 0), 0, 'every word');
  // $23C638 clears $4000 bytes; this ring is the $1000-byte 64x16 window, which is
  // the part anything in this port can read.
  assert.equal(v.w.length, 64 * 16 * 2);
});

test('W240 a real stage clear empties the ring and then rebuilds it',
  { skip: SKIP_SEED }, () => {
    const g = new Game(new Uint8Array(readFileSync(seedPath)), json,
      { palCatchUp: false });
    const shot = portWordFromBits([BIT.b1]);
    for (let i = 0; i < 60; i++) g.step(shot);
    const nz = () => g.vram.w.reduce((n, w) => n + (w ? 1 : 0), 0);
    assert.ok(nz() > 0, 'the ring has background in it to lose');

    const ctx = { ram: g.ram, rom: g.rom, tables: g.tables, palette: g.palette,
      prot: g.prot, vram: g.vram, unported: g.unportedLog,
      unportedLog: g.unportedLog, soundPost() {}, effectSpawn() {},
      bulletSpawn() {}, stageEndEvent() {} };
    runStageAdvance242952(g.ram, g.rom, ctx);

    let clearedAt = 0;
    for (let f = 1; f <= 400; f++) {
      g.step(shot);
      if (!clearedAt && nz() === 0) clearedAt = f;
    }
    // The ground goes, and then the next stage's install puts it back. Both halves
    // matter: a clear with no rebuild would be a permanently blank background.
    assert.equal(clearedAt, 67, 'the ring is emptied on the result screen frame');
    assert.ok(nz() > 100, `and rebuilt by frame 400 (${nz()} words)`);
    assert.ok(g.vram.columnsWritten > 0, 'by real column writes');
  });

test('W240 the banner end draws both bomb-stock rows and their text',
  { skip: SKIP }, () => {
    // The claim is about the shipped source: $287ABE/$287AF0 are `bombStock287ABE`
    // (W118) and $240DC2 is `txPrint240DC2` (W116), so neither belongs in a note.
    const src = readFileSync(new URL('../src/hud.js', import.meta.url), 'utf8');
    assert.ok(!/draw\(ctx, 0x287abe\)/.test(src), '$287ABE is no longer counted');
    assert.ok(!/draw\(ctx, 0x287af0\)/.test(src), 'nor $287AF0');
    assert.ok(/bombStock287ABE\(ram, rom, ctx, 0\);\s*\/\/ \$284CA0/.test(src));
    assert.ok(/bombStock287ABE\(ram, rom, ctx, 1\);\s*\/\/ \$284CCC/.test(src));
    // ...with the cartridge's own registers, differing only in the column.
    assert.ok(/txPrint240DC2\(ram, 0x00d4, 0x0200, 0x0002, 0x0005, 0x054f000a\)/.test(src));
    assert.ok(/txPrint240DC2\(ram, 0x00d4, 0x1400, 0x0002, 0x0005, 0x054f000a\)/.test(src));
  });
