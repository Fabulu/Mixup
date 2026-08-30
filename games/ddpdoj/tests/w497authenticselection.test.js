// W497: authentic Version-B selector parsing and live browser-seed derivation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RAM, P, OPT } from '../src/machine.js';
import {
  AUTHENTIC_SHIPS, AUTHENTIC_STYLES, DEFAULT_AUTHENTIC_SELECTION,
  authenticSelectionIndices, normalizeAuthenticSelection,
  authenticSelectionFromParams, authenticSelectionQuery, applyAuthenticSelection,
} from '../src/authentic.js';

const NON_DEFAULT = Object.freeze([
  Object.freeze({ ship: 0, style: 4 }),
  Object.freeze({ ship: 0, style: 6 }),
  Object.freeze({ ship: 2, style: 2 }),
  Object.freeze({ ship: 2, style: 4 }),
  Object.freeze({ ship: 2, style: 6 }),
]);

function tracingRom() {
  const calls = [];
  return {
    calls,
    u8(addr) {
      calls.push(['u8', addr]);
      return (addr ^ 0x5a) & 0xff;
    },
    u16(addr) {
      calls.push(['u16', addr]);
      return (0x4000 | (addr & 0x3fff)) & 0xffff;
    },
    u32(addr) {
      calls.push(['u32', addr]);
      return (0xa0000000 | (addr & 0x00ffffff)) >>> 0;
    },
  };
}

function parsed(query) {
  return authenticSelectionFromParams(new URLSearchParams(query));
}

test('W497 authentic domains are the cartridge selector sets, with the old pair default', () => {
  assert.deepEqual(AUTHENTIC_SHIPS, [0, 2]);
  assert.deepEqual(AUTHENTIC_STYLES, [2, 4, 6]);
  assert.deepEqual(DEFAULT_AUTHENTIC_SELECTION, { ship: 0, style: 2 });
});

test('W497 query parsing is strict and absent, empty, invalid, and default stay no-op', () => {
  for (const query of [
    '', 'ship=', 'style=', 'ship=&style=', 'ship=0&style=2',
    'ship=1&style=2', 'ship=2&style=3', 'ship=02&style=2',
    'ship=%202&style=2', 'ship=2&style=2%20', 'ship=Type-B&style=2',
  ]) {
    assert.equal(parsed(query), null, `${query || '(absent)'} must not patch the seed`);
  }
  assert.deepEqual(parsed('ship=2'), { ship: 2, style: 2 });
  assert.deepEqual(parsed('style=4'), { ship: 0, style: 4 });
  for (const pair of NON_DEFAULT) {
    assert.deepEqual(parsed(`ship=${pair.ship}&style=${pair.style}`), pair);
  }
  assert.equal(normalizeAuthenticSelection({ ship: '2', style: 2 }), null,
    'numeric strings do not silently become cartridge selectors');
  assert.equal(normalizeAuthenticSelection({ ship: 0, style: 2 }), null,
    'the explicit default has exactly the same no-patch meaning as an absent query');
});

test('W497 launch query preserves ./index.html exactly for default and names both selectors otherwise',
  () => {
    assert.equal(authenticSelectionQuery(null), '');
    assert.equal(authenticSelectionQuery({ ship: 0, style: 2 }), '');
    for (const pair of NON_DEFAULT) {
      assert.equal(authenticSelectionQuery(pair), `?ship=${pair.ship}&style=${pair.style}`);
    }
  });

test('W497 selectors use two body rows and six power, speed, and ramp rows', () => {
  const got = [];
  for (const style of AUTHENTIC_STYLES) {
    for (const ship of AUTHENTIC_SHIPS) {
      const row = authenticSelectionIndices(ship, style);
      got.push([ship, style, row.initial, row.powerOffset, row.speedIndex, row.rampIndex]);
    }
  }
  assert.deepEqual(got, [
    [0, 2, 0x2551ea, 0x00, 0x00, 0x00],
    [2, 2, 0x2551f2, 0x08, 0x02, 0x04],
    [0, 4, 0x2551ea, 0x10, 0x04, 0x08],
    [2, 4, 0x2551f2, 0x18, 0x06, 0x0c],
    [0, 6, 0x2551ea, 0x20, 0x08, 0x10],
    [2, 6, 0x2551f2, 0x28, 0x0a, 0x14],
  ]);
  assert.equal(new Set(got.map((row) => row[2])).size, 2,
    'fighter selection has two body and hitbox families, not six');
  assert.equal(new Set(got.map((row) => `${row[4]}:${row[5]}`)).size, 6,
    'each fighter/style pair retains its cartridge speed and ramp row');
  assert.equal(authenticSelectionIndices(4, 2), null);
  assert.equal(authenticSelectionIndices(0, 8), null);
});

test('W497 explicit selections derive the translated launch fields from cartridge indexes', () => {
  for (const pair of NON_DEFAULT) {
    const ram = new Ram(null);
    const rom = tracingRom();
    const rec = RAM.player1;
    const opt = RAM.p1Options;
    const row = authenticSelectionIndices(pair.ship, pair.style);

    ram.setU8(opt - 1, 0x5a);
    for (let word = 0; word < 50; word++) ram.setU16(opt + word * 2, 0xffff);
    ram.setU8(opt + OPT.stride, 0xa5);

    assert.deepEqual(applyAuthenticSelection({ ram, rom }, pair), pair);
    assert.equal(ram.u16(0x813084), pair.ship);
    assert.equal(ram.u16(0x813088), pair.style);
    assert.equal(ram.u16(rec + P.shipSel), pair.ship);
    assert.equal(ram.u16(rec + P.optFormation), pair.style);

    assert.equal(ram.u32(rec + P.animA), rom.u32(row.initial));
    assert.equal(ram.u32(rec + P.hitYPlus), rom.u32(row.initial + 4));
    assert.equal(ram.u32(0x8127e4), rom.u32(0x25520c + row.powerOffset));
    assert.equal(ram.u32(0x8127e8), rom.u32(0x255210 + row.powerOffset));

    const speed = rom.u8(0x255200 + row.speedIndex);
    assert.equal(ram.u8(rec + P.speedIdx), speed);
    assert.equal(ram.u8(rec + P.baseSpeed), speed);
    assert.equal(ram.u8(rec + P.laserFloor), rom.u8(0x255201 + row.speedIndex));
    assert.equal(ram.u16(rec + 0x2c), rom.u16(0x2552c4 + row.rampIndex));
    assert.equal(ram.u16(rec + 0x36), rom.u16(0x2552c6 + row.rampIndex));

    assert.equal(ram.u16(opt + OPT.state), 0x8000,
      'the option object is live with its one-time template copy still armed');
    for (let word = 1; word < 50; word++) {
      assert.equal(ram.u16(opt + word * 2), 0, `option word ${word} was not cleared`);
    }
    assert.equal(ram.u8(opt - 1), 0x5a, 'the clear began before the P1 option block');
    assert.equal(ram.u8(opt + OPT.stride), 0xa5, 'the clear reached into the P2 block');
  }
});

test('W497 default apply is byte-preserving and performs no cartridge read', () => {
  const ram = new Ram(null);
  const rom = tracingRom();
  const sentinels = [
    [0x813084, 0x1357], [0x813088, 0x2468],
    [RAM.player1 + P.shipSel, 0xaaaa], [RAM.player1 + P.optFormation, 0xbbbb],
    [RAM.p1Options + OPT.state, 0xcccc],
  ];
  for (const [addr, value] of sentinels) ram.setU16(addr, value);
  assert.equal(applyAuthenticSelection({ ram, rom }, { ship: 0, style: 2 }), null);
  assert.deepEqual(sentinels.map(([addr]) => ram.u16(addr)), sentinels.map(([, value]) => value));
  assert.deepEqual(rom.calls, []);
});

test('W497 page wiring keeps authentic selection separate from mods, rungs, and replay seeds', () => {
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const start = readFileSync(new URL('../start.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/web/app.js', import.meta.url), 'utf8');

  assert.match(index, /\.\.\.\(modLoadout \? \{ mods: modLoadout \} : \{\}\)/);
  assert.match(index,
    /\.\.\.\(authenticSelection \? \{ authentic: authenticSelection \} : \{\}\)/);
  assert.match(start,
    /location\.href = `\.\/index\.html\$\{query\}\$\{hash \? `#\$\{hash\}` : ''\}`/,
    'the selector query and mod hash must coexist without one encoding the other');

  const ctor = app.slice(app.indexOf('  constructor(canvas, bundle'), app.indexOf('  step() {'));
  assert.match(ctor,
    /const ordinaryAuthentic = rung\s*\? null\s*:\s*normalizeAuthenticSelection/,
    'a labelled rung must retain its exact selector state outside formation mode');
  assert.match(ctor, /const authentic = formationAuthentic \?\? ordinaryAuthentic/,
    'formation may supply its pair without weakening the ordinary rung fallback');
  assert.match(ctor,
    /if \(authentic && !coldBoot\) applyAuthenticSelection\(this\.game, authentic\)/,
  'direct seeds apply the browser selector while cold-cabinet runs defer to fighter selection');

  const replay = app.slice(app.indexOf('  playFrom(obj) {'), app.indexOf('  endPlayback() {'));
  assert.ok(!replay.includes('applyAuthenticSelection'),
    'PLAY must construct the replay seed exactly, not apply a browser selector afterward');
});
