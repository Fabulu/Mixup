// W164: authentic P1/P2 player death, hyper sinks, drops, and reset.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { RAM, P } from '../src/machine.js';
import { UnportedLog } from '../src/unported.js';
import { ITEM } from '../src/items.js';
import { HYPER } from '../src/hyper.js';
import { BEAM } from '../src/laser.js';
import { PaletteState, PALSTAGE } from '../src/palette.js';
import { ALLOC } from '../src/objalloc.js';
import {
  DEATH, DEATH_MUTATE, playerDead24A130, playerHit249F8A, updatePlayer,
} from '../src/player.js';

const TABLES = JSON.parse(fs.readFileSync(
  new URL('../rip/port/player.tables.json', import.meta.url), 'utf8'));
const ROM = new RomWindows(TABLES.rom);
DEATH_MUTATE.value = process.env.DDPDOJ_W164_MUTATION || null;

function fixture(p2 = false) {
  const ram = new Ram();
  const rec = p2 ? RAM.player2 : RAM.player1;
  const h = p2 ? HYPER.p2 : HYPER.p1;
  const d = p2 ? DEATH.p2 : DEATH.p1;
  const slot = 0x80e240;
  const sounds = [], deaths = [];
  ram.setU16(rec, 0x9000);                              // live plus hit bit 4
  ram.setU32(rec + P.posY, 0x30001800);
  ram.setU16(rec + P.optFormation, p2 ? 4 : 2);
  ram.setU8(slot + 0x07, p2 ? 1 : 0);
  ram.setU32(slot + ALLOC.idOff, p2 ? 0x2345 : 0x1234);
  const ctx = {
    rom: ROM,
    palette: new PaletteState(),
    unportedLog: new UnportedLog(),
    soundPost: (a) => sounds.push(a),
    deathEvent: (...v) => deaths.push(v),
    hyperEvent: () => {},
  };
  return { ram, rec, h, d, slot, ctx, sounds, deaths };
}

function liveKinds(ram) {
  const out = [];
  for (let n = 0; n < ITEM.slots; n++) {
    const status = ram.u16(ITEM.base + n * ITEM.stride);
    if (status !== 0) out.push(status & ITEM.kindMask);
  }
  return out;
}

test('P1 hit runs death gauge, hyper end, rank quarter, stock clear, and drops', () => {
  const f = fixture(false);
  const { ram, rec, h, d, slot, ctx, sounds } = f;
  ram.setU16(h.active, 1);
  ram.setU16(h.gauge, 0x400);
  ram.setU16(h.earn, 0x0800);
  ram.setU16(h.power, 20);
  ram.setU16(h.stock, 3);
  ram.setU16(d.lives, 2);
  ram.setU16(d.dropGate, 1);
  ram.setU16(d.noMiss, 7);
  ram.setU16(DEATH.commonMedal, 9);
  ram.setU16(d.medalA, 8);
  ram.setU16(d.medalB, 6);
  ram.setU16(BEAM[0].pool, 0x8001);

  updatePlayer(ram, slot, 0, ctx);

  assert.equal(ram.u16(h.active), 0, '$24A000 -> $285AF2 ends active hyper');
  assert.equal(ram.u16(h.power), 5, '$24A00C quarters persistent rank power');
  assert.equal(ram.u16(h.stock), 0, '$24A01C clears all held hyper stock');
  assert.equal(ram.u16(h.earn), 0x095e,
    '$287B9A fills to one unit below the grant threshold');
  assert.equal(ram.u16(d.activeSave), 1, '$249FE0 snapshots pre-end active state');
  assert.equal(ram.u16(d.noMiss), 9, '$249FC8 adds two to the death counter');
  assert.deepEqual([ram.u16(DEATH.commonMedal), ram.u16(d.medalA), ram.u16(d.medalB)],
    [0, 0, 0], '$27F898 clears the P1 death-side medal words');
  assert.equal(ram.u16(BEAM[0].pool), 0, '$252714 wipes the beam segment pool');
  assert.deepEqual(liveKinds(ram), [0, 0, 0], '$24A10E emits three kind-0 drops');
  assert.equal(ram.u16(ITEM.count), 3);
  assert.equal(ram.u16(rec), 0x0100, '$24A118/$24A11C enters death state');
  assert.equal(ram.u32(rec + P.hitXPlus), DEATH.animList);
  assert.equal(ram.u16(rec + P.dirByte), 6);
  assert.ok(sounds.includes(0x28c3a0), '$249F9C posts the death sound');
  assert.equal(ram.u16(PALSTAGE.spr.dirty), 1, '$2531DE -> $2415A2 dirties palette');
  for (let n = 0; n < 7; n++) {
    assert.equal(ram.u16(PALSTAGE.spr.stage + 7 * 64 + n * 2),
      ROM.u16(0x225138 + n * 2), `$2415A2 P1 word ${n}`);
  }
});

test('P1 death state reads the whole pointer list, waits, resets, and queues kill', () => {
  const f = fixture(false);
  const { ram, rec, h, d, slot, ctx, deaths } = f;
  ram.setU16(h.active, 1);
  ram.setU16(h.power, 12);
  ram.setU16(d.lives, 1);
  ram.setU16(d.dropGate, 1);
  ram.setU16(rec + 0x20, 10);
  ram.setU16(rec + 0x22, 8);
  ram.setU8(rec + 0x25, 1);
  playerHit249F8A(ram, slot, rec, ctx, false);

  let frames = 0, result = null;
  while (frames < 100 && result !== 'reset') {
    frames++;
    result = playerDead24A130(ram, slot, rec, ctx, false);
  }
  assert.equal(result, 'reset');
  assert.equal(frames, 70, '37 positive pointers, terminator frame, and 32 waits');
  assert.equal(ram.u16(rec), 0);
  assert.equal(ram.u16(rec + P.optFormation), 2);
  assert.equal(ram.u16(rec + 0x20), 8, '$24A1A6 subtracts two');
  assert.equal(ram.u16(rec + 0x22), 0, 'formation 2 loop-1 leaves D3 at zero');
  assert.equal(ram.u8(rec + 0x25), 1,
    'active-at-death snapshot suppresses $24A1EA growth');
  assert.equal(ram.u16(0x8130fa), 1, '$26080A arms P1 reset command 1');
  assert.equal(ram.u16(0x8130fc), 0);
  assert.equal(ram.u16(ALLOC.killSp), ALLOC.stride);
  assert.equal(ram.u32(ALLOC.killQueue), 0x1234, '$241292 queues the player ID');
  assert.deepEqual(deaths.at(-1), ['reset', 1, 8, 0, 1]);
});

test('P2 mirror clears no-lives hyper state, emits kind 4, and installs bank 8', () => {
  const f = fixture(true);
  const { ram, rec, h, d, slot, ctx } = f;
  ram.setU16(h.active, 0);
  ram.setU16(h.earn, 0x0100);
  ram.setU16(h.power, 7);
  ram.setU16(h.stock, 2);
  ram.setU16(h.pending, 0);
  ram.setU16(d.lives, 0);

  updatePlayer(ram, slot, 0, ctx);

  assert.equal(ram.u16(h.power), 1, '$24A0B0 quarters P2 independently');
  for (const addr of [h.active, h.earn, h.gauge, h.subTick, h.level, h.req,
    h.stock, h.pending, 0x81b6a0]) {
    assert.equal(ram.u16(addr), 0, `$253968 clears $${addr.toString(16)}`);
  }
  assert.deepEqual(liveKinds(ram), [4], 'zero lives selects one kind-4 drop');
  assert.equal(ram.u16(rec + P.auraPhase), 3, '$24A0DA uses P2 state word 3');
  for (let n = 0; n < 3; n++) {
    assert.equal(ram.u16(PALSTAGE.spr.stage + 8 * 64 + n * 2),
      ROM.u16(0x225138 + n * 2), `$2415A2 P2 word ${n}`);
  }
  assert.equal(ram.u16(HYPER.p1.power), 0, 'P1 rank power is isolated');
});

test('drop-count arm preserves the ROM zero-drop first death transition', () => {
  const f = fixture(false);
  const { ram, rec, d, slot, ctx } = f;
  ram.setU16(d.lives, 1);
  ram.setU16(d.dropGate, 0);
  ram.setU16(d.dropCount, 0);
  playerHit249F8A(ram, slot, rec, ctx, false);
  assert.equal(ram.u16(d.dropCount), 1, '$24A108 increments before the borrow exit');
  assert.equal(ram.u16(ITEM.count), 0, 'D7=0 then subq borrows and skips allocator');
});

test('P2 reset formation-4 branch restores both decremented words and cap growth', () => {
  const f = fixture(true);
  const { ram, rec, d, slot, ctx } = f;
  ram.setU16(rec, 0x2500);                              // keep $2000, state bits 0/2
  ram.setU16(rec + 0x26, 0);
  ram.setU16(rec + P.optFormation, 4);
  ram.setU16(rec + 0x20, 12);
  ram.setU16(rec + 0x22, 10);
  ram.setU8(rec + 0x25, 0);
  ram.setU16(0x813098, 1);
  ram.setU16(d.activeSave, 0);

  assert.equal(playerDead24A130(ram, slot, rec, ctx, true), 'reset');
  assert.equal(ram.u16(rec), 0x2000);
  assert.equal(ram.u16(rec + P.optFormation), 4);
  assert.equal(ram.u16(rec + 0x20), 10);
  assert.equal(ram.u16(rec + 0x22), 8);
  assert.equal(ram.u8(rec + 0x25), 1, '$2551FA[2]=2 gives cap 4 and permits +1');
  assert.equal(ram.u16(0x81311e), 1, '$26080A selects P2 reset block');
  assert.equal(ram.u32(ALLOC.killQueue), 0x2345);
});
