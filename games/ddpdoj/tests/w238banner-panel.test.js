// W238: the stage-clear banner's PANEL $2851D2 (docket D11).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { BUCKETS } from '../src/spritequeue.js';
import { deferReset } from '../src/background.js';
import { panel2851D2, HUDRAM } from '../src/hud.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const TX = { head: 0x80b058, cursor: 0x80c8d8 };
const icons = (ram) => ram.u16(BUCKETS[25].counter) / 12;
const textCells = (ram) => {
  let n = 0;
  for (let a = TX.head; a < TX.cursor; a += 8) {
    if (ram.u32(a) === 0xffffffff) break;
    n++;
  }
  return n;
};

function ctxOf(ram) {
  const log = new UnportedLog();
  return { log, ctx: { ram, rom: ROM, unported: log, unportedLog: log } };
}

/** A panel frame with P1 alive and `lives` in reserve, and the text arm armed. */
function panelRam(lives, { p2 = -1, text = true } = {}) {
  const ram = new Ram();
  deferReset(ram);
  ram.setU16(HUDRAM.aliveP1, lives);
  ram.setU16(HUDRAM.aliveP2, p2);
  ram.setU8(HUDRAM.bannerFlagsClear, text ? 0x80 : 0x00);
  return ram;
}

test('W238 both art tables end where windows this port already had begin',
  { skip: SKIP }, () => {
    // $2881D2 is four 8-byte tables read as longwords at a stride of TWO, so the
    // entries overlap on purpose. $2881D2 + $20 is $2881F2, W113's window.
    for (const at of [0x2881d2, 0x2881da, 0x2881e2, 0x2881ea]) {
      assert.notEqual(ROM.u32(at), 0, `$${at.toString(16)} entry 0`);
      assert.notEqual(ROM.u32(at + 2), 0, 'and its overlapping entry 1');
    }
    assert.equal(ROM.u32(0x2881f2), ROM.u32(0x2881d2 + 0x20),
      'the fourth table ends exactly at $2881F2');
    // $2883CE is six stock icons at stock*4, ending at $2883E6's window.
    for (let i = 0; i < 6; i++) assert.notEqual(ROM.u32(0x2883ce + i * 4), 0);
    assert.equal(ROM.u32(0x2883e6), ROM.u32(0x2883ce + 6 * 4));
  });

test('W238 the panel draws one lives icon per life, capped at six',
  { skip: SKIP }, () => {
    // $285218: `subq.w #1` then clamp, and the loop is a `dbra`, so N lives draw N
    // icons -- one for lives=1 -- and anything above six draws six.
    for (const [lives, want] of [[1, 1], [3, 3], [6, 6], [20, 6]]) {
      const ram = panelRam(lives);
      const { ctx } = ctxOf(ram);
      panel2851D2(ram, ROM, ctx);
      assert.equal(icons(ram), want + 1, `${lives} lives -> ${want} icons + the stock`);
    }
  });

test('W238 a zero or negative lives word draws no icons at all', { skip: SKIP }, () => {
  // $28521A `bcs` takes lives=0 straight past the loop with D0 = $FFFF, and
  // $285214 `bmi` skips the whole block on a negative word.
  const zero = panelRam(0);
  panel2851D2(zero, ROM, ctxOf(zero).ctx);
  assert.equal(icons(zero), 1, 'the stock icon only');
  const neg = panelRam(0xffff);
  panel2851D2(neg, ROM, ctxOf(neg).ctx);
  assert.equal(icons(neg), 0, 'and a negative word draws nothing');
});

test('W238 the bomb row prints, and bit 7 of the clear flags gates it',
  { skip: SKIP }, () => {
    const on = panelRam(3);
    panel2851D2(on, ROM, ctxOf(on).ctx);
    assert.ok(textCells(on) > 0, '$2852D4 printed the bomb row');
    const off = panelRam(3, { text: false });
    panel2851D2(off, ROM, ctxOf(off).ctx);
    assert.equal(textCells(off), 0, '$2852A4 tst.b/bpl skips it');
  });

test('W238 P2 draws its own icons and steps the column the other way',
  { skip: SKIP }, () => {
    const ram = panelRam(2, { p2: 2 });
    const { log, ctx } = ctxOf(ram);
    panel2851D2(ram, ROM, ctx);
    // two lives each, plus one stock icon each
    assert.equal(icons(ram), 6, 'both blocks drew');
    const b = BUCKETS[25].buffer;
    // $285262 adds $200 per icon on P1 and $28533A SUBTRACTS it on P2, and the
    // records are written in block order, so the two runs move opposite ways.
    const col = (i) => ram.u32(b + i * 12) & 0xffff;
    assert.notEqual(col(0), col(1), 'P1 stepped');
    assert.notEqual(col(3), col(4), 'P2 stepped');
    assert.notEqual(Math.sign(col(1) - col(0)), Math.sign(col(4) - col(3)));
    assert.deepEqual(log.report(), [], 'and the panel counts nothing now');
  });
