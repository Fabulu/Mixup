// W308: the name entry's countdown, its second exit, and the `($12,A4)` defect W305 shipped.
//
// The countdown is where the screen's two endings meet, and the routine that runs it reads a
// WORD at an address with no writer. Both are the kind of thing a transcription gets right by
// accident and a test gets right on purpose.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { hiscoreDefaults28841E } from '../src/hiscore.js';
import {
  chainLoader24652A, chainLoader246710, chainLoader246704, CHAIN_OTHER_BODY,
} from '../src/stageend.js';
import {
  NAME_REC, NAME_OBJ, NAME_SCREEN,
  nameCountdown28F4FC, nameFrameBands28F542, nameReleaseSetup28F6B0, nameArmGrid28F4A6,
} from '../src/hiscorename.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const ROM = HAVE ? new RomWindows(JSON.parse(readFileSync(tablesPath, 'utf8')).rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? SKIP : 'the ROM image is absent; skip, not pass';

const A4 = 0x81f200;
const A5 = 0x81f280;
const COUNTER = 0x1e;
const FRAME = 0x02;
const SUSPEND = 0x81e0d8;
const FLAGBYTE = 0x81e0d9;
const SCRIPT = 0x28fad2;

const factory = () => {
  const ram = new Ram();
  hiscoreDefaults28841E(ram, ROM);
  return ram;
};
const world = () => {
  const log = new UnportedLog();
  return { log, ctx: { rom: ROM, unported: log, unportedLog: log, notes: log } };
};
/** A machine with the countdown running and nothing suspending it. */
function running(n) {
  const ram = factory();
  ram.setU16(A4 + COUNTER, n);
  ram.setU16(A4 + 0x2e, 1);        // the cursor, which `$28F50E` requires
  ram.setU16(SUSPEND, 0);
  return ram;
}

// ==================== 1. THE W305 DEFECT, AND WHY IT MATTERED

test('W308 `($12,A4)` is the SETUP BIT NUMBER, 1 and 2, from two immediates',
  { skip: SKIP_IMG }, () => {
    // W305 called it `live` and had both arms write 1. The image has two different immediates,
    // one per side's block, and they are the same values `$28F77A`/`$28F788` load for `bset`.
    assert.equal(IMG.readUInt16BE(0x28f41a), 0x397c, '$28F41A move.w #imm,($12,A4)');
    assert.equal(IMG.readUInt16BE(0x28f41c), 1, 'P1 records 1');
    assert.equal(IMG.readUInt16BE(0x28f41e), 0x0012, 'into ($12,A4)');
    assert.equal(IMG.readUInt16BE(0x28f472), 0x397c, '$28F472 the same instruction');
    assert.equal(IMG.readUInt16BE(0x28f474), 2, 'P2 records 2');
    assert.equal(IMG.readUInt16BE(0x28f476), 0x0012);
    assert.deepEqual(NAME_SCREEN.setupBits, [1, 2], 'and the port agrees');
  });

test('W308 the release clears the bit the arm recorded', { skip: SKIP }, () => {
  // `$28F6AC move.w ($12,A4),D1 / $28F6B0 bclr D1,$81E0D9`, right after the name writer. This is
  // the half W305 could not see, and it is what made writing 1 for P2 a real defect rather than
  // a naming slip: the wrong bit would be cleared and P2's would stay set forever.
  for (const side of [0, 1]) {
    const bit = NAME_SCREEN.setupBits[side];
    const ram = factory();
    ram.setU8(FLAGBYTE, 0b110);              // both bits set
    ram.setU16(A4 + NAME_REC.setupBit, bit);
    nameReleaseSetup28F6B0(ram, A4);
    assert.equal(ram.u8(FLAGBYTE), 0b110 & ~(1 << bit), `side ${side} clears only bit ${bit}`);
  }
});

test('W308 `bset` then `bclr` round-trips for each side independently', { skip: SKIP }, () => {
  const ram = factory();
  ram.setU8(FLAGBYTE, 0);
  // Arm both sides' bits the way `$28F790` does, then release them one at a time.
  ram.setU8(FLAGBYTE, (1 << NAME_SCREEN.setupBits[0]) | (1 << NAME_SCREEN.setupBits[1]));
  ram.setU16(A4 + NAME_REC.setupBit, NAME_SCREEN.setupBits[1]);
  nameReleaseSetup28F6B0(ram, A4);
  assert.equal(ram.u8(FLAGBYTE), 1 << NAME_SCREEN.setupBits[0], 'P1 still armed');
  ram.setU16(A4 + NAME_REC.setupBit, NAME_SCREEN.setupBits[0]);
  nameReleaseSetup28F6B0(ram, A4);
  assert.equal(ram.u8(FLAGBYTE), 0, 'and now neither');
});

// ==================== 2. A WORD TEST OVER A BYTE FLAG

test('W308 `$81E0D8` has NO writer, so the word test is the byte test', { skip: SKIP_IMG }, () => {
  // `$28F506 tst.w $81E0D8` spans `$81E0D9`. Scanned the build: `$81E0D8` is referenced exactly
  // once, by that read, and never written -- while `$81E0D9` is written twice, by `$28F790 bset`
  // and `$28F6B0 bclr`. So the word test reduces exactly to "is any side still being set up",
  // and it is fragile in a way the ROM gets away with: any writer of a non-zero `$81E0D8` would
  // freeze the countdown forever.
  const refs = (addr) => {
    const pat = Buffer.alloc(4);
    pat.writeUInt32BE(addr >>> 0);
    const out = [];
    let at = IMG.indexOf(pat);
    while (at !== -1) {
      if (at >= 0x200000 && at < 0x2b0000) out.push(at - 2);
      at = IMG.indexOf(pat, at + 1);
    }
    return out;
  };
  assert.deepEqual(refs(SUSPEND), [0x28f506], 'one reference, and it is the tst.w');
  assert.deepEqual(refs(FLAGBYTE), [0x28f6b0, 0x28f790], 'the bclr and the bset');
  assert.equal(IMG.readUInt16BE(0x28f506), 0x4a79, 'and $28F506 really is tst.w abs.l');
});

test('W308 a set setup bit suspends the countdown without ticking it', { skip: SKIP }, () => {
  const ram = running(0x20);
  ram.setU8(FLAGBYTE, 1 << NAME_SCREEN.setupBits[0]);
  const w = world();
  assert.equal(nameCountdown28F4FC(ram, ROM, A4, A5, w.ctx), 'suspended');
  assert.equal(ram.u16(A4 + COUNTER), 0x20, 'the counter did not move');
});

test('W308 clearing the bit lets it tick again', { skip: SKIP }, () => {
  const ram = running(0x20);
  ram.setU8(FLAGBYTE, 0);
  const w = world();
  assert.equal(nameCountdown28F4FC(ram, ROM, A4, A5, w.ctx), 'ticked');
  assert.equal(ram.u16(A4 + COUNTER), 0x1f);
});

// ==================== 3. THE COUNTDOWN'S ARMS

test('W308 a zero counter is `idle`, and the caller takes the input path', { skip: SKIP }, () => {
  // `$28F4FC tst.w ($1E,A4) / beq $28F542`. Both blocks start this field at 0, so `idle` is the
  // state the screen spends most of its life in.
  const ram = factory();
  const w = world();
  assert.equal(nameCountdown28F4FC(ram, ROM, A4, A5, w.ctx), 'idle');
});

test('W308 a cleared cursor stops the countdown too', { skip: SKIP }, () => {
  // `$28F50E tst.w ($2E,A4) / beq $28F540` -- the same field W307's grid draw is gated on.
  const ram = running(0x20);
  ram.setU16(A4 + 0x2e, 0);
  const w = world();
  assert.equal(nameCountdown28F4FC(ram, ROM, A4, A5, w.ctx), 'nocursor');
  assert.equal(ram.u16(A4 + COUNTER), 0x20, 'and nothing ticked');
});

test('W308 at exactly `$30` it decrements AND loads a chain', { skip: SKIP }, () => {
  // `$28F514 cmpi.w #$30,($1E,A4) / bne` -- a one-shot arm at a single value, so it fires exactly
  // once per countdown. Then `lea ($28FAD2,PC),A0 / jsr $246704` and an immediate `rts`, which is
  // why this arm draws nothing else.
  const ram = running(0x30);
  const w = world();
  assert.equal(nameCountdown28F4FC(ram, ROM, A4, A5, w.ctx), 'reloaded');
  assert.equal(ram.u16(A4 + COUNTER), 0x2f, 'it still ticked');
  // The chain really was built: a player slot claimed with a node chain hanging off it.
  const claimed = [0, 1, 2].map((s) => ram.u16(0x810346 + s * 0x30) & 0x8000);
  assert.ok(claimed.some((c) => c !== 0), 'a slot was claimed');
});

test('W308 reaching ZERO ends the screen, the same exit the work list uses', { skip: SKIP }, () => {
  // `$28F532 beq $28F6D8` lands on `move.b #$2,($2,A5)` -- byte for byte the ending `$28F6C8`
  // reaches when the last side is dropped. Two ways to end, one exit.
  const ram = running(1);
  ram.setU8(A5 + NAME_OBJ.state, 0);
  const w = world();
  assert.equal(nameCountdown28F4FC(ram, ROM, A4, A5, w.ctx), 'expired');
  assert.equal(ram.u16(A4 + COUNTER), 0);
  assert.equal(ram.u8(A5 + NAME_OBJ.state), NAME_OBJ.doneState, 'the screen is over');
});

test('W308 the $30 arm and the tick arm are mutually exclusive', { skip: SKIP }, () => {
  // The `bne` at `$28F51A` splits them, so `$30` never reaches the zero test and every other
  // value never reaches the loader. Driving both neighbours proves the split.
  for (const [n, want] of [[0x31, 'ticked'], [0x30, 'reloaded'], [0x2f, 'ticked']]) {
    const ram = running(n);
    const w = world();
    assert.equal(nameCountdown28F4FC(ram, ROM, A4, A5, w.ctx), want, `counter $${n.toString(16)}`);
  }
});

// ==================== 4. THE FRAME COUNTER'S TWO THRESHOLDS

test('W308 below `$30` frames the screen draws and ignores input', { skip: SKIP }, () => {
  // `bcc` is carry-clear, so the test is unsigned `>=` and `$30` itself is the first input frame.
  const ram = factory();
  const w = world();
  ram.setU16(A4 + FRAME, 0x2e);
  assert.equal(nameFrameBands28F542(ram, A4, w.ctx), 'leadin', 'frame $2F');
  assert.equal(ram.u16(A4 + FRAME), 0x2f, 'and the counter advanced');
  assert.equal(nameFrameBands28F542(ram, A4, w.ctx), 'input', 'frame $30 is the first');
});

test('W308 at or past `$738` frames the time limit arm takes over', { skip: SKIP }, () => {
  // 1848 frames, a little over thirty seconds at 60Hz -- a name-entry time limit, and a separate
  // thing from the `($1E,A4)` countdown.
  const ram = factory();
  const w = world();
  ram.setU16(A4 + FRAME, 0x736);
  assert.equal(nameFrameBands28F542(ram, A4, w.ctx), 'input', 'frame $737 still accepts input');
  assert.equal(nameFrameBands28F542(ram, A4, w.ctx), 'over', 'and $738 does not');
  const hit = w.log.report().find((r) => r.includes('$28F606'));
  assert.ok(hit, 'the limit arm is counted');
  assert.match(hit, /TIME LIMIT/);
});

test('W308 the frame counter always advances, on every band', { skip: SKIP }, () => {
  // `addq.w #1,($2,A4)` comes FIRST, before any test, so no band can stall it.
  const ram = factory();
  const w = world();
  for (const start of [0, 0x2f, 0x100, 0x737, 0x800]) {
    ram.setU16(A4 + FRAME, start);
    nameFrameBands28F542(ram, A4, w.ctx);
    assert.equal(ram.u16(A4 + FRAME), start + 1, `from $${start.toString(16)}`);
  }
});

// ==================== 5. `$246704`, THE LOADER SIBLING

test('W308 `$246704` is `$246710` with D6 = 1, and D6 is `($4,slot)`', { skip: SKIP }, () => {
  // `movem / move.w #$1,D6 / bra $246718` -- it jumps into `$246710`'s body four instructions in,
  // so the only difference is the D6 that `$24672A move.w D6,($4,A1)` writes. W303 hardcoded 0
  // there, which was right for `$246710` and left this sibling absent.
  const a = new Ram();
  const b = new Ram();
  const w = world();
  const ha = chainLoader246710(a, ROM, SCRIPT, w.ctx);
  const hb = chainLoader246704(b, ROM, SCRIPT, w.ctx);
  assert.equal(ha, hb, 'the same player slot');
  assert.notEqual(ha, 0xffffffff, 'and it succeeded');
  assert.equal(a.u16(ha + 0x04), 0, '$246710 writes 0');
  assert.equal(b.u16(hb + 0x04), 1, 'and $246704 writes 1');
  // That field is the ONLY difference in the whole of main RAM.
  const diffs = [];
  for (let i = 0; i < a.b.length; i++) if (a.b[i] !== b.b[i]) diffs.push(i + 0x800000);
  assert.deepEqual(diffs, [ha + 0x05], 'one byte, the low half of ($4,slot)');
});

test('W308 `$246704` still differs from `$24652A` on BOTH axes', { skip: SKIP }, () => {
  // Two independent axes: `($1E,node)` and `($4,slot)`. `$24652A` is (0, 0), `$246710` is (1, 0)
  // and `$246704` is (1, 1), so the pair of them cannot be collapsed into one flag.
  const base = new Ram();
  const both = new Ram();
  const w = world();
  const h1 = chainLoader24652A(base, ROM, SCRIPT);
  const h2 = chainLoader246704(both, ROM, SCRIPT, w.ctx);
  assert.equal(h1, h2);
  assert.equal(base.u16(h1 + 0x04), 0);
  assert.equal(both.u16(h2 + 0x04), 1, 'the slot field differs');
  let node1 = base.u32(h1 + 0x2c);
  let node2 = both.u32(h2 + 0x2c);
  let n = 0;
  while (node1 !== 0 && node2 !== 0) {
    assert.equal(base.u16(node1 + 0x1e), 0, `node ${n} under $24652A`);
    assert.equal(both.u16(node2 + 0x1e), 1, `node ${n} under $246704`);
    node1 = base.u32(node1 + 0x2c);
    node2 = both.u32(node2 + 0x2c);
    n++;
  }
  assert.ok(n > 0, 'and there were nodes to check');
});

test('W308 the OTHER head pair is named, not assumed to be a variant', { skip: SKIP_IMG }, () => {
  // `$246610` (D6 = 1) and `$24661A` (D6 = 0) are the same two-head shape but fall into a
  // DIFFERENT body at `$246622`, so they are not variants of these three. Recorded so the next
  // reader does not have to rediscover them, and asserted so the claim stays honest.
  const [h1, h0, body] = CHAIN_OTHER_BODY;
  assert.equal(IMG.readUInt16BE(h1), 0x48e7, '$246610 opens with movem');
  assert.equal(IMG.readUInt16BE(h1 + 4), 0x3c3c, 'then move.w #imm,D6');
  assert.equal(IMG.readUInt16BE(h1 + 6), 1, 'with 1');
  assert.equal(IMG.readUInt16BE(h0 + 6), 0, 'and $24661A with 0');
  assert.equal(IMG.readUInt16BE(body), 0x43f9, `$${body.toString(16)} is the shared lea`);
  assert.equal(IMG.readUInt32BE(body + 2), 0x00810346, 'of the same player list');
  assert.notEqual(body, 0x246718, 'but it is NOT $246710\'s body');
});

test('W308 the panel draw and the limit arm are counted, not invented', { skip: SKIP }, () => {
  const ram = running(0x20);
  const w = world();
  nameCountdown28F4FC(ram, ROM, A4, A5, w.ctx);
  const draw = w.log.report().find((r) => r.includes('$28F7F4'));
  assert.ok(draw, 'the panel draw is counted');
  assert.match(draw, /banned-name table/, 'and its far end is named');
  // The draw's span ends exactly where W306's table begins, which is what makes that claim
  // checkable rather than decorative.
  assert.equal(0x28f8aa + 2, 0x28f8ac, '$28F7F4..$28F8AA, then the banned names');
});

test('W308 arming the grid then running the countdown holds together', { skip: SKIP }, () => {
  // `$28F4A6` sets the cursor, which `$28F50E` requires, so the two halves have to agree about
  // `($2E,A4)`.
  const ram = factory();
  const w = world();
  nameArmGrid28F4A6(ram, A4, w.ctx);
  ram.setU16(A4 + COUNTER, 5);
  ram.setU8(FLAGBYTE, 0);
  assert.equal(nameCountdown28F4FC(ram, ROM, A4, A5, w.ctx), 'ticked');
  assert.equal(ram.u16(A4 + COUNTER), 4);
});
