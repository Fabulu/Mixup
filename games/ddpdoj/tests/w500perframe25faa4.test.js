// W500 -- `$25FAA4`, the ordinary-loop one/two-round cartridge selector called by state 7.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { TxVram } from '../src/background.js';
import { RomWindows } from '../src/rom.js';
import {
  HANDLER7, PERFRAME_25FAA4 as P, SCREEN17, perFrame25FAA4, phase7_25D560,
} from '../src/objslot17.js';
import { LEAVES9 } from '../src/objslot9.js';

const TABLES = 'games/ddpdoj/rip/port/player.tables.json';
const SKIP = existsSync(TABLES) ? false : 'no exported tables';

function txCell(tx, d0, d1) {
  return tx.long(0x904000 + ((((d0 & 0xffff) << 6) + (d1 & 0xffff)) & 0xffff) * 4);
}

function draws() {
  const out = {};
  for (const name of ['draw25E220', 'draw25E29E', 'draw25E4D0', 'draw25E6CE', 'draw25E824',
    'draw25EF30', 'draw25F074']) out[name] = () => {};
  return out;
}

test('W500 seeded input delay keeps the current loop choice visibly selected',
  { skip: SKIP }, () => {
    const tables = JSON.parse(readFileSync(TABLES, 'utf8'));
    const rom = new RomWindows(tables.rom);
    const ram = new Ram();
    const tx = new TxVram();
    const sounds = [];
    const ctx = { tx, soundPost: (addr) => sounds.push(addr) };

    ram.setU16(P.delayAt, LEAVES9.b.seed);
    ram.setU16(P.modeAt, 0);
    ram.setU16(P.selectors[0], 0);
    ram.setU16(P.selectors[1], 0x00ff);
    ram.setU16(P.rawInputs[0], 0x0001);

    perFrame25FAA4(ram, rom, ctx);
    assert.equal(ram.u16(P.delayAt), LEAVES9.b.seed - 1);
    assert.equal(ram.u16(P.modeAt), 0, 'direction remains locked during the seeded delay');
    assert.deepEqual(sounds, []);
    assert.equal(txCell(tx, P.cursor[0].d0, P.cursor[0].d1), 0xc0200002);
    assert.equal(txCell(tx, P.cursor[1].d0, P.cursor[1].d1), 0xc03e0002,
      'mode zero keeps its valid second cursor visibly highlighted');
    const stream = P.labels[1];
    const glyph = rom.u8(stream + 3);
    assert.equal(txCell(tx, rom.u8(stream), rom.u8(stream + 1)),
      ((((0xc000 | glyph) << 16) >>> 0) | 2) >>> 0,
      'the current label stays selected throughout the input lock');

    for (let i = 0; i < LEAVES9.b.seed - 1; i++) perFrame25FAA4(ram, rom, ctx);
    assert.equal(ram.u16(P.delayAt), 0);
    assert.equal(ram.u16(P.modeAt), 0);
    assert.deepEqual(sounds, []);
    assert.equal(txCell(tx, P.cursor[1].d0, P.cursor[1].d1), 0xc03e0002);

    perFrame25FAA4(ram, rom, ctx);
    assert.equal(ram.u16(P.modeAt), 1, 'direction takes effect after the input lock');
    assert.deepEqual(sounds, [P.moveSound]);
  });

test('W500 state 7 runs $25FAA4 cartridge mode selection, confirmation, blink, and retirement',
  { skip: SKIP }, () => {
    const tables = JSON.parse(readFileSync(TABLES, 'utf8'));
    const rom = new RomWindows(tables.rom);
    const ram = new Ram();
    const tx = new TxVram();
    const notes = [];
    const sounds = [];
    const ctx = { tx, selectDraws: draws(), soundPost: (addr) => sounds.push(addr),
      unported: { note: (addr, what) => notes.push({ addr, what }) } };

    // With both sides joined, direction comes from the LAST live reader even though $813072 receives
    // both words. P1 asks to move, P2 does not, so the aggregate is 1 but mode 0 stays selected.
    ram.setU16(P.selectors[0], 0);
    ram.setU16(P.selectors[1], 0);
    ram.setU16(P.rawInputs[0], 0x0001);
    ram.setU16(P.rawInputs[1], 0);
    perFrame25FAA4(ram, rom, ctx);
    assert.equal(ram.u16(P.inputAt), 1);
    assert.equal(ram.u16(P.modeAt), 0);

    // Remove P2 and run through the real state-7 call site. P1's bit 0 now moves mode 0 to mode 1.
    ram.setU16(P.selectors[1], 0x00ff);
    phase7_25D560(ram, rom, ctx, 0x812800, SCREEN17.recs, 1);

    assert.equal(ram.u16(P.modeAt), 1);
    assert.equal(ram.u16(P.inputAt), 1);
    assert.equal(notes.filter((n) => n.addr === P.addr).length, 0, '$25FAA4 is live, not noted');
    assert.equal(sounds[0], P.moveSound);
    assert.equal(txCell(tx, P.cursor[0].d0, P.cursor[0].d1), 0xc03e0002,
      'nonzero mode highlights the cartridge first cursor cell');
    assert.equal(txCell(tx, P.cursor[1].d0, P.cursor[1].d1), 0xc0200002,
      'the inactive cartridge second cursor cell is restored');
    const stream = P.labels[0];
    const glyph = rom.u8(stream + 3);
    assert.equal(txCell(tx, rom.u8(stream), rom.u8(stream + 1)),
      ((((0xc000 | glyph) << 16) >>> 0) | 2) >>> 0,
      'the selected label comes from the ROM stream with attribute 2');

    // Any of bits 4-6 from either joined side confirms. P1 supplies bit 4 while the last reader, P2,
    // supplies zero. The same frame copies the mode, posts the cue, loads 32, and ticks to 31;
    // later calls blink from the timer's low byte and retire exactly when it reaches zero.
    ram.setU16(P.selectors[1], 0);
    ram.setU16(P.rawInputs[0], 0x0010);
    ram.setU16(P.rawInputs[1], 0);
    perFrame25FAA4(ram, rom, ctx);
    assert.equal(ram.u16(P.inputAt), 0x0010);
    assert.equal(ram.u16(P.requestedAt), 1);
    assert.equal(ram.u16(P.modeOut), 1);
    assert.equal(ram.u16(P.confirmAt), P.confirmFrames - 1);
    assert.equal(sounds.filter((a) => a === P.confirmSound).length, 1);

    ram.setU16(P.rawInputs[0], 0);
    for (let i = 0; i < P.confirmFrames - 1; i++) perFrame25FAA4(ram, rom, ctx);
    assert.equal(ram.u16(P.confirmAt), 0);
    assert.equal(ram.u16(P.doneAt), 1);
    const soundCount = sounds.length;
    perFrame25FAA4(ram, rom, ctx);
    assert.equal(sounds.length, soundCount, 'the done gate makes later calls inert');
  });
