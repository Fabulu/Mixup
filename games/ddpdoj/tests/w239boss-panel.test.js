// W239: the BOSS banner's panel $284FD2, and the high word W238 dropped.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { BUCKETS } from '../src/spritequeue.js';
import { deferReset } from '../src/background.js';
import { panel284FD2, panel2851D2, HUDRAM } from '../src/hud.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const icons = (ram) => ram.u16(BUCKETS[25].counter) / 12;
const rec = (ram, i) => ram.u32(BUCKETS[25].buffer + i * 12);

function fresh(lives, over = {}) {
  const ram = new Ram();
  deferReset(ram);
  ram.setU16(HUDRAM.aliveP1, lives);
  ram.setU16(HUDRAM.aliveP2, over.p2 ?? -1);
  ram.setU8(HUDRAM.bannerFlagsBoss, over.bossFlags ?? 0x10);
  ram.setU8(HUDRAM.bannerFlagsClear, over.clearFlags ?? 0x80);
  ram.setU16(HUDRAM.bannerSubA, over.subA ?? 0);
  ram.setU16(HUDRAM.bannerSubB, over.subB ?? 0);
  const log = new UnportedLog();
  return { ram, log, ctx: { ram, rom: ROM, unported: log, unportedLog: log } };
}

test('W239 the boss panel draws, and counts nothing', { skip: SKIP }, () => {
  const f = fresh(3);
  panel284FD2(f.ram, ROM, f.ctx);
  assert.equal(icons(f.ram), 4, 'three lives and the stock icon');
  assert.deepEqual(f.log.report(), [],
    'its three draws were $23FAC4, $240DC2 and $286ED6, all of which the port had');
});

test('W239 the panel prologue owns D1\'s HIGH word, and the two panels differ in it',
  { skip: SKIP }, () => {
    // This is the bug W238 shipped: the block built D1 as a WORD, so the panel had
    // no vertical position at all, and W238's test only compared low words.
    //
    // The prologue is $5DC0 PLUS ($81B622 << 6) on the stage-clear panel and $5F80
    // MINUS it on the boss panel, so a non-zero $81B622 must move the records --
    // and must move them in OPPOSITE directions.
    const at = (fn, subA) => {
      const f = fresh(1, { subA });
      fn(f.ram, ROM, f.ctx);
      return rec(f.ram, 0);
    };
    const clearAt0 = at(panel2851D2, 0);
    const clearAt4 = at(panel2851D2, 4);
    const bossAt0 = at(panel284FD2, 0);
    const bossAt4 = at(panel284FD2, 4);
    assert.notEqual(clearAt0, clearAt4, 'the stage-clear panel moved');
    assert.notEqual(bossAt0, bossAt4, 'and so did the boss panel');
    assert.notEqual(Math.sign(clearAt4 - clearAt0), Math.sign(bossAt4 - bossAt0),
      'one adds the slide and the other subtracts it');
    // ...and the high word is actually non-zero, which is the whole point.
    assert.notEqual(clearAt0 >>> 16, 0);
    assert.notEqual(bossAt0 >>> 16, 0);
  });

test('W239 D6 is shifted SEVEN on the boss panel and SIX on the other',
  { skip: SKIP }, () => {
    // $284FDC lsl.w #$7 against $28520C lsl.w #$6, and D6 lands in the icon column,
    // so one $81B624 step moves the boss panel twice as far.
    const at = (fn, subB) => {
      const f = fresh(1, { subB });
      fn(f.ram, ROM, f.ctx);
      return rec(f.ram, 0) & 0xffff;
    };
    const clearDelta = Math.abs(at(panel2851D2, 1) - at(panel2851D2, 0));
    const bossDelta = Math.abs(at(panel284FD2, 1) - at(panel284FD2, 0));
    assert.ok(clearDelta > 0 && bossDelta > 0, 'both moved');
    assert.equal(bossDelta, clearDelta * 2, 'seven against six');
  });

test('W239 the boss text gate is bit 4 of $81B61E, not bit 7 of $81B61F',
  { skip: SKIP }, () => {
    const cells = (over) => {
      const f = fresh(3, over);
      panel284FD2(f.ram, ROM, f.ctx);
      let n = 0;
      for (let a = 0x80b058; a < 0x80c8d8; a += 8) {
        if (f.ram.u32(a) === 0xffffffff) break;
        n++;
      }
      return n;
    };
    assert.ok(cells({ bossFlags: 0x10 }) > 0, 'bit 4 set prints');
    assert.equal(cells({ bossFlags: 0x00 }), 0, 'bit 4 clear does not');
    // ...and the OTHER panel's gate byte has no say here.
    assert.ok(cells({ bossFlags: 0x10, clearFlags: 0x00 }) > 0);
  });
