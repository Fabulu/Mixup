// W502: `$25E72E` per-record select-screen draw and its bounded `$25F1EC` helper.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { TxVram } from '../src/background.js';
import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { BUCKETS, ENQUEUE_MASK, NO_ZOOM_OR } from '../src/spritequeue.js';
import {
  DRAW_25E72E as D, announceState260A7C, draw25E72E, selectOffset25F1EC,
} from '../src/objslot9.js';

const TABLES = 'games/ddpdoj/rip/port/player.tables.json';
const SKIP = existsSync(TABLES) ? false : 'no exported tables';
const A6 = 0x812ea0;

function fixture() {
  const tables = JSON.parse(readFileSync(TABLES, 'utf8'));
  const ram = new Ram();
  const rom = new RomWindows(tables.rom);
  const tx = new TxVram();
  return { ram, rom, tx, ctx: { tx } };
}

const txWords = (tx) => tx.w.reduce((n, word) => n + (word !== 0 ? 1 : 0), 0);

function expectedPackedCoord(rom, rec) {
  const coord = rom.u32(rec);
  const hi = u16((coord >>> 16) + D.coordHighAdd);
  const lo = u16(coord + D.coordLowAdd);
  const shifted = (((hi << 16) | lo) | 0) >> 6;
  return ((shifted & ENQUEUE_MASK) | NO_ZOOM_OR) >>> 0;
}

test('W502 $25E72E selects sides, preserves carry, draws labels, and emits bucket 7 registers',
  { skip: SKIP }, () => {
    assert.deepEqual(D.records, [0x25e716, 0x25e722]);
    assert.deepEqual(D.message, [0x25f270, 0x25f290, 0x25f2b0]);

    const mailbox = fixture();
    mailbox.ram.setU16(0x813164, 4);                  // P1 mailbox $813162, state word +2
    mailbox.ram.setU16(0x813168, 3);                  // P2 mailbox $813166, state word +2
    assert.equal(announceState260A7C(mailbox.ram, 0), 4);
    assert.equal(announceState260A7C(mailbox.ram, 1), 3);

    // D7 nonzero chooses side 0 but record `$25E722`. The default zero config takes offset 0.
    const p1 = fixture();
    draw25E72E(p1.ram, p1.rom, p1.ctx, A6, 1);
    const bucket = BUCKETS[7];
    assert.equal(p1.ram.u16(bucket.counter), 12, '$23E08C emits one ordinary bucket-7 record');
    assert.equal(p1.ram.u32(bucket.buffer), expectedPackedCoord(p1.rom, D.records[1]));
    assert.equal(p1.ram.u32(bucket.buffer + 4), p1.rom.u32(D.records[1] + 4));
    assert.equal(p1.ram.u16(bucket.buffer + 8), D.d3);
    assert.equal(p1.ram.u16(bucket.buffer + 10), D.d4);
    assert.ok(txWords(p1.tx) > 0, 'the side-0 labels reached TX');

    // D7 zero chooses side 1 and record `$25E716`; free play returns the second art offset.
    const p2 = fixture();
    p2.ram.setU8(D.config, 0x12);
    draw25E72E(p2.ram, p2.rom, p2.ctx, A6, 0);
    assert.equal(p2.ram.u16(bucket.counter), 12);
    assert.equal(p2.ram.u32(bucket.buffer), expectedPackedCoord(p2.rom, D.records[0]));
    assert.equal(p2.ram.u32(bucket.buffer + 4), p2.rom.u32(D.records[0] + 8),
      'the returned D0=4 advances from the first to the second art long');
    assert.ok(txWords(p2.tx) > 0, 'the side-1 labels reached TX');

    // Gate, announcement state 4, and a live record all share the label-only return.
    for (const [name, arm] of [
      ['global gate', (f) => f.ram.setU8(D.gate, 1)],
      ['announcement', (f) => f.ram.setU16(0x813164, 4)],
      ['active record', (f) => f.ram.setU8(A6, 1)],
    ]) {
      const f = fixture();
      arm(f);
      draw25E72E(f.ram, f.rom, f.ctx, A6, 1);
      assert.equal(f.ram.u16(bucket.counter), 0, `${name} emitted a sprite`);
      assert.ok(txWords(f.tx) > 0, `${name} did not draw the shared side labels`);
    }

    const wordSide = fixture();
    wordSide.ram.setU16(0x813168, 4);
    draw25E72E(wordSide.ram, wordSide.rom, wordSide.ctx, A6, 2);
    assert.equal(wordSide.ram.u16(bucket.counter), 0,
      'side uses word `(D7+1)&1`: noncanonical D7=2 selects the P2 announcement mailbox');

    // Separate P2 pools must use `$80395E`, while P1 keeps `$803958`.
    const credit = fixture();
    credit.ram.setU8(D.config, 0x10);
    credit.ram.setU8(D.separate, 1);
    credit.ram.setU8(D.pair.commonRate, 2);
    credit.ram.setU8(D.pair.commonCoins, 2);
    credit.ram.setU8(D.pair.commonCoinsB, 0);
    assert.deepEqual(selectOffset25F1EC(credit.ram, credit.rom, credit.tx, 1),
      { d0: 4, carry: false }, 'P1 has enough shared-pool coins');
    const beforeMessage = txWords(credit.tx);
    const p2Credit = selectOffset25F1EC(credit.ram, credit.rom, credit.tx, 0);
    assert.equal(p2Credit.carry, true, 'P2 empty separate pool sets carry');
    assert.ok(txWords(credit.tx) > beforeMessage, 'the carry path emitted its two cartridge TX lines');

    const messageCases = [
      { rate: 2, coins: 0, digit: true, name: 'empty pool' },
      { rate: 3, coins: 1, digit: true, name: 'short by more than one' },
      { rate: 2, coins: 1, digit: false, name: 'short by one' },
    ];
    const messageMaps = [];
    for (const c of messageCases) {
      const f = fixture();
      f.ram.setU8(D.config, 0x10);
      f.ram.setU8(D.pair.commonRate, c.rate);
      f.ram.setU8(D.pair.commonCoins, c.coins);
      const result = selectOffset25F1EC(f.ram, f.rom, f.tx, 1);
      const descriptorX = f.rom.u16(0x25f43c);
      assert.deepEqual(result,
        { d0: u16(descriptorX + (c.digit ? 1 : 0)), carry: true }, `${c.name} message result`);
      assert.ok(txWords(f.tx) > 0, `${c.name} did not emit its cartridge TX pair`);
      messageMaps.push(Array.from(f.tx.w));
    }
    assert.notDeepEqual(messageMaps[0], messageMaps[1], 'the first and second message pairs differ');
    assert.notDeepEqual(messageMaps[1], messageMaps[2], 'the second and third message pairs differ');

    const suppressed = fixture();
    suppressed.ram.setU8(D.config, 0x10);
    suppressed.ram.setU8(D.pair.commonRate, 2);
    suppressed.ram.setU8(D.pair.commonCoins, 0);
    draw25E72E(suppressed.ram, suppressed.rom, suppressed.ctx, A6, 1);
    assert.equal(suppressed.ram.u16(bucket.counter), 0,
      'carry from `$25F1EC` suppresses the record sprite');
    assert.ok(txWords(suppressed.tx) > 0, 'the suppressing credit message still reaches TX');
  });
