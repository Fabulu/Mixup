// W372: DRIVE object-dispatch slot [14] -- the first front-end slot this port has written.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { VideoRegs, TxVram } from '../src/background.js';
import { objSlot14, SLOT14 } from '../src/objslot14.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tp = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tp);
const SKIP = HAVE ? false : 'generated ROM tables absent';
const ROM = HAVE ? new RomWindows(JSON.parse(readFileSync(tp, 'utf8')).rom) : null;
const A5 = 0x80e300;

function world() {
  const ram = new Ram();
  const log = new UnportedLog();
  const sprites = [];
  return {
    ram,
    sprites,
    ctx: {
      videoRegs: new VideoRegs(), tx: new TxVram(), rom: ROM,
      unported: log, unportedLog: log, notes: log,
      soundPost: (a) => sprites.push({ sound: a }),
      rankByte: () => 0x40,
    },
  };
}

test('W372 slot [14] state 0 resets the screen and arms every counter', { skip: SKIP }, () => {
  const f = world();
  f.ctx.videoRegs.tx_xscroll = 9; f.ctx.tx.setLong(0x904000, 0x1234);
  objSlot14(f.ram, ROM, A5, f.ctx);
  // The two routines W372 ported are called here, and the off-by-one survives.
  assert.equal(f.ctx.videoRegs.tx_xscroll, 1, 'tx_xscroll reset to ONE, not zero');
  assert.equal(f.ctx.tx.w[0], 0, 'and the TX map is cleared');
  assert.equal(f.ram.u8(A5 + SLOT14.stateAt), 1, 'the state advances to 1');
  assert.equal(f.ram.u16(A5 + 0x04), 0x012c, 'the life counter is 300 frames');
  assert.equal(f.ram.u8(A5 + 0x16), 1, 'the table selector starts at ONE, not zero');
  assert.equal(f.ram.u16(A5 + 0x1a), 0x20, 'and both short counters are $20');
  assert.equal(f.ram.u16(A5 + 0x1c), 0x20);
});

test('W372 state 1 fires its cue ONCE, on the frame the counter reaches zero', { skip: SKIP }, () => {
  // A port that tested `<= 0` instead of the ROM's `bne` would fire it every frame afterwards.
  const f = world();
  objSlot14(f.ram, ROM, A5, f.ctx);            // -> state 1
  let fires = 0;
  for (let i = 0; i < 60; i++) {
    const before = f.sprites.length;
    objSlot14(f.ram, ROM, A5, f.ctx);
    if (f.sprites.length > before) fires++;
  }
  assert.equal(fires, 1, 'exactly one cue over sixty frames');
  assert.equal(f.ram.u16(A5 + 0x1a), 0, 'and the counter rests at zero');
});

test('W372 the life counter must go NEGATIVE before state 2, not merely reach zero', { skip: SKIP }, () => {
  // $288C96 is `bpl`, so the store is skipped while the count is still zero or positive. Testing
  // `=== 0` would advance one frame early and `<= 0` would advance every frame after.
  const f = world();
  objSlot14(f.ram, ROM, A5, f.ctx);
  f.ram.setU16(A5 + 0x04, 1);                  // one frame left
  objSlot14(f.ram, ROM, A5, f.ctx);
  assert.equal(f.ram.u16(A5 + 0x04), 0, 'it reaches zero');
  assert.equal(f.ram.u8(A5 + SLOT14.stateAt), 1, '  ...and does NOT advance yet');
  objSlot14(f.ram, ROM, A5, f.ctx);
  assert.equal(f.ram.u16(A5 + 0x04), 0xffff, 'it goes negative');
  assert.equal(f.ram.u8(A5 + SLOT14.stateAt), 2, '  ...and THEN advances');
});

test('W372 the table selector only switches after THREE zero rank bytes', { skip: SKIP }, () => {
  // rankByte >> 3 goes to ($16,A5); a zero bumps ($17,A5) and, below 3, forces the selector back to
  // 1. So table B is reached only on the third consecutive zero, not the first.
  const f = world();
  f.ctx.rankByte = () => 0;                    // every rank byte reads zero
  objSlot14(f.ram, ROM, A5, f.ctx);
  for (let i = 0; i < 2; i++) objSlot14(f.ram, ROM, A5, f.ctx);
  assert.equal(f.ram.u8(A5 + 0x16), 1, 'still forced to 1 after two zeroes');
  objSlot14(f.ram, ROM, A5, f.ctx);
  assert.equal(f.ram.u8(A5 + 0x16), 0, '  ...and only the third lets it through');
});
