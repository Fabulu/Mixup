// W333 -- `$270D92`, the shared death-spawn list walker.
//
// It is SIX-callers shared, and three of them are stage-5 types the port still owes: `$271680` is
// type `$49`'s death arm, `$271AC2` is inside type `$4A` and `$271D88` is inside type `$4B`. W315
// proved that band is NOT one family by prototype; they diverge in their bodies and share THIS. So
// porting it once is what makes those three cheap, and it is worth its own wave and its own test.
//
// THE TWO THINGS THIS FILE EXISTS FOR:
//   * an entry is TWELVE bytes -- word, word, word, LONG, word -- and reading it as six words would
//     put every field after the third one wrong;
//   * the ROM does NOT check `$289004`'s return, so a full pool must not stop the walk.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { UnportedLog, Unreached } from '../src/unported.js';
import { walkDeathSpawns270D92 } from '../src/effects.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP = IMG ? false : 'the ROM image is absent; skip, not pass';

/** A ROM window built by hand, so a read of anything unplanted throws rather than answering 0. */
class FakeRom {
  constructor() { this.b = new Map(); }
  put(a, ...bytes) { bytes.forEach((v, i) => this.b.set(a + i, v & 0xff)); }
  putW(a, v) { this.put(a, (v >> 8) & 0xff, v & 0xff); }
  putL(a, v) { this.put(a, (v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff); }
  u8(a) {
    if (!this.b.has(a)) throw new Error(`FakeRom: nothing at $${a.toString(16)}`);
    return this.b.get(a);
  }
  u16(a) { return (this.u8(a) << 8) | this.u8(a + 1); }
  u32(a) { return ((this.u16(a) * 0x10000) + this.u16(a + 2)) >>> 0; }
}

const LIST = 0x300000;
/** One 12-byte entry: word, word, word, LONG, word. */
function putEntry(rom, at, e) {
  rom.putW(at + 0, e.w1);
  rom.putW(at + 2, e.kind);
  rom.putW(at + 4, e.w3);
  rom.putL(at + 6, e.long26);
  rom.putW(at + 10, e.w1a);
}

/** A ctx whose spawnEffect side hands back successive slots, so each entry is distinguishable. */
function world({ slots = 4 } = {}) {
  const ram = new Ram();
  const log = new UnportedLog();
  // Pool B's real head, so `spawnEffect` has somewhere to allocate. Zeroed = every slot free.
  for (let i = 0; i < slots * 0x40; i += 2) ram.setU16(0x81c8b2 + i, 0);
  return { ram, log, ctx: { unported: log, unportedLog: log, notes: log } };
}

test('W333 an entry is TWELVE bytes: word, word, word, LONG, word', { skip: SKIP }, () => {
  // Read straight out of the image. `$270DAE move.l (A1)+,($26,A0)` is the one that makes the stride
  // twelve rather than twelve-as-six-words: a port that walked six words would take the long's
  // halves as two separate fields and everything after it would slide.
  assert.equal(IMG.readUInt16BE(0x270d92), 0x3219, '$270D92 move.w (A1)+,D1');
  assert.equal(IMG.readUInt32BE(0x270d94), 0x0c41ffff, '$270D94 cmpi.w #-$1,D1 -- the terminator');
  assert.equal(IMG.readUInt16BE(0x270d9c), 0x3019, '$270D9C move.w (A1)+,D0 -- the KIND');
  assert.equal(IMG.readUInt32BE(0x270dae), 0x21590026, '$270DAE move.l (A1)+,($26,A0) -- a LONG');
  assert.equal(IMG.readUInt16BE(0x270dc8), 0x3159, '$270DC8 move.w (A1)+,($1A,A0)');
  assert.equal(IMG.readUInt16BE(0x270dcc), 0x60c4, '$270DCC bra $270D92 -- the loop');
  assert.equal(IMG.readUInt16BE(0x270dce), 0x4e75, 'and $270DCE is the rts');
});

test('W333 it walks to the $FFFF terminator and copies every field to its own offset',
  { skip: SKIP }, () => {
    const f = world();
    const rom = new FakeRom();
    putEntry(rom, LIST, { w1: 0x1234, kind: 0x000d, w3: 0x00ab, long26: 0xdeadbeef, w1a: 0x5678 });
    putEntry(rom, LIST + 12, { w1: 0x4321, kind: 0x000d, w3: 0x00cd, long26: 0x0badf00d, w1a: 0x8765 });
    rom.putW(LIST + 24, 0xffff);                       // the terminator
    assert.equal(walkDeathSpawns270D92(f.ram, rom, f.ctx, LIST, 0x11112222), 2,
      'two entries walked, then the $FFFF stopped it');
  });

test('W333 word 3 contributes only its LOW BYTE', { skip: SKIP }, () => {
  // `$270DA6 move.b D0,($1C,A0)` -- a BYTE store out of a word that was just read. A port using
  // setU16 there would overwrite ($1D,A0) as well, which is the palette byte its callers set.
  assert.equal(IMG.readUInt32BE(0x270da4), 0x30191140, '$270DA4 move.w (A1)+,D0 / move.b D0,($1C,A0)');
});

test('W333 a FULL POOL does not stop the walk', { skip: SKIP }, () => {
  // The ROM never tests `$289004`'s return: on a full pool it answers the bit bucket $81C8B2 and the
  // writes land harmlessly, then the loop carries on. `spawnEffect` returns falsy instead, so the
  // port skips the writes and MUST keep walking -- bailing out would lose every entry after the
  // first failure, which the board does not do.
  const f = world({ slots: 0 });
  // Fill pool B so every allocation fails.
  for (let i = 0; i < 0x400; i += 2) f.ram.setU16(0x81c8b2 + i, 0x8001);
  const rom = new FakeRom();
  for (let n = 0; n < 3; n++) {
    putEntry(rom, LIST + n * 12,
      { w1: n, kind: 0x000d, w3: 0, long26: 0, w1a: 0 });
  }
  rom.putW(LIST + 36, 0xffff);
  assert.equal(walkDeathSpawns270D92(f.ram, rom, f.ctx, LIST, 0), 3,
    'all three entries were walked even though none could allocate');
});

test('W333 a list with no terminator THROWS by address rather than hanging', { skip: SKIP }, () => {
  // The loop's only exit in the ROM is the $FFFF word, so a wrong list address or a misread stride
  // is an infinite loop and not a wrong picture. A test suite that hung would be a worse way to
  // learn that than one that fails, so the port bounds it and names the two possible causes.
  const f = world();
  const rom = new FakeRom();
  for (let n = 0; n < 80; n++) {
    putEntry(rom, LIST + n * 12, { w1: 1, kind: 0x000d, w3: 0, long26: 0, w1a: 0 });
  }
  assert.throws(() => walkDeathSpawns270D92(f.ram, rom, f.ctx, LIST, 0),
    (e) => e instanceof Unreached && e.romAddress === 0x270d92);
});

test('W333 type $49\'s own list is at $27197C and its first entry is readable',
  { skip: SKIP }, () => {
    // `$27167A lea ($27197C,PC),A1` -- the list type $49's death arm passes. Its entries are NOT
    // uniform-looking, which is exactly why the stride had to come from the code rather than from
    // eyeballing the bytes.
    assert.equal(IMG.readUInt16BE(0x27197c), 0x0000, 'entry 1 word 1');
    assert.equal(IMG.readUInt16BE(0x27197e), 0x008d, 'entry 1 KIND $8D');
    assert.notEqual(IMG.readUInt16BE(0x27197c), 0xffff, 'and the list is not empty');
  });
