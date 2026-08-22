// W501: `$25F530` record selection and `$25F592` cartridge animation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { PaletteState } from '../src/palette.js';
import { BUCKETS, ENQUEUE_MASK } from '../src/spritequeue.js';
import {
  PLAYERREC_25F456, STATE7_HEAD_25F530 as K, playerRecords25F456, state7Head25F530,
} from '../src/objslot17.js';

const TABLES = 'games/ddpdoj/rip/port/player.tables.json';
const SKIP = existsSync(TABLES) ? false : 'no exported tables';

function fixture() {
  const tables = JSON.parse(readFileSync(TABLES, 'utf8'));
  const rom = new RomWindows(tables.rom);
  const ram = new Ram();
  const palette = new PaletteState();
  const notes = [];
  const a5 = 0x812800;
  ram.setU8(a5 + PLAYERREC_25F456.sides[0].srcAt, 2);
  ram.setU8(a5 + PLAYERREC_25F456.sides[1].srcAt, 4);
  playerRecords25F456(ram, rom, a5);
  return { ram, rom, palette, notes,
    ctx: { palette, unported: { note: (addr, what) => notes.push({ addr, what }) } } };
}

test('W501 state-7 head selects, animates, draws, pauses, retires, and falls back by side',
  { skip: SKIP }, () => {
    const { ram, rom, palette, notes, ctx } = fixture();
    const p1 = K.records[0];
    const p2 = K.records[1];
    const bucket = BUCKETS[7];

    state7Head25F530(ram, rom, ctx, 1);
    assert.equal(ram.u8(p1) & 0x03, 0x03, 'D7 nonzero picks eligible P1 and sets bit 1');
    assert.equal(ram.u8(p2) & 0x02, 0, 'eligible P1 prevents the P2 fallback');
    assert.equal(palette.installCount, 2, 'the common and selected palettes install once');
    assert.equal(ram.u16(bucket.counter), 12, 'the first main frame reaches bucket 7');
    assert.equal(ram.u32(bucket.buffer + 4), rom.u32(K.frameTable),
      'the main art long comes from the sequence table');
    assert.equal(ram.u16(bucket.buffer + 8), 0x0ce0);
    assert.equal(ram.u16(bucket.buffer + 10), K.commonBank);
    assert.equal(ram.u16(p1 + K.sequenceAt), 4);

    ram.setU16(p1 + K.sequenceAt, 0x0058);
    ram.setU8(p1 + K.sequenceTickAt, 0);
    state7Head25F530(ram, rom, ctx, 1);
    assert.equal(ram.u16(p1 + K.sequenceAt), 0x005c);
    assert.equal(ram.u16(p1 + K.pauseAt), 0x0090, '$5C opens the cartridge pause');

    ram.setU16(K.detailDuplicateAt, 1);
    ram.setU16(K.satelliteGateAt, 1);
    ram.setU16(K.satelliteFlagsAt, 0x001c);
    ram.setU8(p1 + K.spriteTickAt, 0);
    const beforeDetail = ram.u16(bucket.counter);
    state7Head25F530(ram, rom, ctx, 1);
    assert.equal(ram.u16(p1 + K.pauseAt), 0x008f);
    assert.equal(ram.u16(p1 + K.satellites[0]), 0x0208,
      'the first unfinished satellite scale grows by eight');
    assert.equal(ram.u16(p1 + K.spriteAt), 8, 'the detail sprite cursor advances and wraps at $28');
    assert.equal(ram.u16(bucket.counter), beforeDetail + 4 * 12,
      'main, two zoomed details, and the first satellite each enqueue once');
    const flagMask = (~ENQUEUE_MASK) >>> 0;
    assert.equal((ram.u32(bucket.buffer + beforeDetail + 12) & flagMask) >>> 0, 0x80008000,
      'the first detail keeps the cartridge D6 flags');
    assert.equal((ram.u32(bucket.buffer + beforeDetail + 24) & flagMask) >>> 0, 0x80005000,
      'the duplicate detail uses its distinct replacement D6 flags');
    assert.equal((ram.u32(bucket.buffer + beforeDetail + 36) & flagMask) >>> 0,
      (rom.u32(K.satelliteFlagTable + 0x38) & flagMask) >>> 0,
      'the zoomed satellite masks the shared index/emitter word before reading D6');
    assert.doesNotThrow(() => rom.u32(K.satelliteFlagTable + K.satelliteFlagTableBytes - 4),
      'the ordinary-emitter index still requires the table far edge');
    assert.equal(palette.installCount, 2, 'record bit 1 blocks repeated palette installs');

    ram.setU16(p1 + K.pauseAt, 0);
    ram.setU16(p1 + K.sequenceAt, 0x0098);
    ram.setU8(p1 + K.sequenceTickAt, 0);
    state7Head25F530(ram, rom, ctx, 1);
    assert.equal(ram.u16(p1 + K.sequenceAt), 0x009c);
    assert.equal(ram.u8(p1) & 0x04, 0x04, '$9C retires P1 through bit 2');
    assert.equal(ram.u16(K.requestedAt), 1);

    state7Head25F530(ram, rom, ctx, 1);
    assert.equal(ram.u8(p2) & 0x02, 0x02, 'retired P1 makes D7 nonzero fall back to P2');
    assert.equal(palette.installCount, 4, 'P2 owns its separate once-only palette pair');
    const afterFallback = ram.u16(bucket.counter);
    state7Head25F530(ram, rom, ctx, 0);
    assert.equal(ram.u16(bucket.counter), afterFallback + 12, 'D7 zero addresses only P2');
    assert.deepEqual(notes.filter((n) => n.addr === K.addr || n.addr === K.inner), []);
  });
