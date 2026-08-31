import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ALLOC } from '../src/objalloc.js';
import { BLACK_LABEL_PROFILE } from '../src/profiles.js';
import { Ram } from '../src/ram.js';
import { FullRom } from '../src/rom.js';
import { WHITE_CHOOSER, WHITE_NVRAM, provisionWhiteCabinetNvram } from '../src/white-frontend.js';
import {
  WHITE_HISCORE_DEFAULTS,
  WHITE_RESET,
  WHITE_RESET_PROLOGUE,
  bootWhiteCabinet13C24E,
  hiscoreDefaults186F5C,
  resetWhitePrologue13C24E,
} from '../src/white-reset.js';

const IMAGE = fileURLToPath(new URL('../rip/rosetta/img-ddpdojblk.bin', import.meta.url));
const rawTest = (name, fn) => test(name, { skip: !existsSync(IMAGE) }, fn);

function syntheticRom() {
  const reads = [];
  return {
    reads,
    u8(address) {
      reads.push(['u8', address]);
      return address & 0xff;
    },
    u16(address) {
      reads.push(['u16', address]);
      if (address === WHITE_CHOOSER.dispatchTable + WHITE_CHOOSER.type * 8 + 4) {
        return WHITE_CHOOSER.priority;
      }
      return address & 0xffff;
    },
    u32(address) {
      reads.push(['u32', address]);
      return (0xa0000000 | (address & 0x0fffffff)) >>> 0;
    },
    bytes(address, length) {
      reads.push(['bytes', address, length]);
      return new Uint8Array(length);
    },
  };
}

function noteContext() {
  const notes = [];
  return {
    notes,
    ctx: {
      unported: { note: (address, message) => notes.push([address, message]) },
    },
  };
}

test('White reset rejects other editions before mutable inputs are touched', () => {
  let reads = 0;
  const untouched = new Proxy({}, {
    get() {
      reads++;
      throw new Error('protected reset input was touched');
    },
  });
  assert.throws(
    () => resetWhitePrologue13C24E(untouched, untouched, untouched, untouched,
      BLACK_LABEL_PROFILE),
    /White Label reset prologue is unavailable/,
  );
  assert.equal(reads, 0);
});

test('Version A reset executes all 23 calls and preserves its narrower clear boundaries', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  const { ctx, notes } = noteContext();
  ram.setU8(0x803808, 3);
  ram.setU16(0x803930, 0x3030);
  ram.setU16(0x80b054, 0x5454);
  ram.setU16(0x80b056, 0x5656);
  ram.setU16(0x812e0a, 0x0a0a);
  ram.setU32(0x812e0c, 0x0c0c0c0c);
  ram.setU16(0x812e48, 0x4848);
  ram.setU16(0x812e4a, 0x4a4a);

  const result = resetWhitePrologue13C24E(ram, rom, null, ctx);
  assert.deepEqual(result.calls.map((call) => call.site), [...WHITE_RESET_PROLOGUE]);
  assert.equal(result.calls.length, 23);
  assert.equal(result.modeled, 16);
  assert.equal(result.unported, 7);
  assert.deepEqual(result.calls.filter((call) => !call.modeled).map((call) => call.site),
    [...WHITE_RESET.gaps]);
  assert.deepEqual(notes.filter(([address]) => WHITE_RESET.gaps.includes(address))
    .map(([address]) => address), [...WHITE_RESET.gaps]);
  assert.equal(ram.u8(0x803956), (WHITE_RESET.coinTable + 3) & 0xff);
  assert.equal(ram.u8(0x803957), (WHITE_RESET.creditTable + 3) & 0xff);

  assert.equal(ram.u16(0x803930), 0x3030, '$13C590 does not perform B IRQ clear six');
  assert.equal(ram.u16(0x80b054), 0x5454, '$140E5C leaves B shake X untouched');
  assert.equal(ram.u16(0x80b056), 0x5656, '$140E5C leaves B shake Y untouched');
  assert.equal(ram.u16(0x812e0a), 0x0a0a, '$1591E0 clears only the first word at $812E08');
  assert.equal(ram.u32(0x812e0c), 0x0c0c0c0c);
  assert.equal(ram.u16(0x812e48), 0x4848);
  assert.equal(ram.u16(0x812e4a), 0x4a4a);
  assert.equal(ram.u16(0x812e08), 0);
  assert.equal(ram.u16(0x812e28), 0);
});

test('Version A high-score bootstrap uses all nine independent source blocks', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  hiscoreDefaults186F5C(ram, rom);

  const expectedReads = [];
  for (const block of WHITE_HISCORE_DEFAULTS.blocks) {
    for (let i = 0; i < WHITE_HISCORE_DEFAULTS.entries; i++) {
      for (let item = 0; item < block.longs; item++) {
        const offset = (i * block.longs + item) * block.size;
        expectedReads.push([block.size === 4 ? 'u32' : 'u16', block.src + offset]);
      }
    }
  }
  assert.deepEqual(rom.reads, expectedReads);
  assert.equal(ram.u32(WHITE_HISCORE_DEFAULTS.hiScore),
    ram.u32(WHITE_HISCORE_DEFAULTS.blocks[0].dst));
});

test('cold Version A bootstrap reaches type $14 without staging type 8 state $D', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  const { ctx, notes } = noteContext();
  provisionWhiteCabinetNvram(ram, rom);
  rom.reads.length = 0;

  const result = bootWhiteCabinet13C24E(ram, rom, null, ctx);
  assert.equal(result.reset.calls.length, 23);
  assert.equal(result.gate.valid, true);
  assert.equal(result.made.addr, ALLOC.createStage);
  assert.equal(ram.u16(result.made.addr), 0x8014);
  assert.equal(ram.u16(result.made.addr + ALLOC.priOff), WHITE_CHOOSER.priority);
  assert.equal(ram.u16(result.made.addr + WHITE_CHOOSER.stateField), 0,
    'Version A bootstrap does not apply Black type 8 initial state $D');
  assert.equal(result.banks, 0);
  assert.equal(result.skipped, 5);
  assert.equal(ram.u16(0x80393e), 0);
  assert.ok(notes.some(([address]) => address === WHITE_RESET.irqTail));
  assert.deepEqual(notes.filter(([address]) => WHITE_RESET.txInstall
    .some(([site]) => site === address)).map(([address]) => address),
  WHITE_RESET.txInstall.map(([site]) => site));
});

rawTest('embedded Version A image proves reset order and bootstrap continuation', () => {
  const image = new Uint8Array(readFileSync(IMAGE));
  const rom = new FullRom(image);
  const targets = [];
  for (let address = WHITE_RESET.entry; address < WHITE_RESET.afterCalls; address += 6) {
    assert.equal(rom.u16(address), 0x4eb9);
    targets.push(rom.u32(address + 2));
  }
  assert.deepEqual(targets, [...WHITE_RESET_PROLOGUE]);
  assert.equal(rom.u32(0x13c2da), WHITE_RESET.highScoreSite);
  assert.equal(rom.u32(0x13c2e0), WHITE_RESET.sectionSite);
  assert.equal(rom.u32(0x13c2e6), WHITE_RESET.interruptSite);

  const installs = [];
  for (let address = 0x13c2ea; address < 0x13c330; address += 14) {
    assert.equal(rom.u16(address), 0x41f9);
    const source = rom.u32(address + 2);
    const moveq = rom.u16(address + 6);
    assert.equal(moveq & 0xff00, 0x7000);
    assert.equal(rom.u16(address + 8), 0x4eb9);
    assert.equal(rom.u32(address + 10), 0x1417f8);
    installs.push([address + 8, moveq & 0xff, source]);
  }
  assert.deepEqual(installs, WHITE_RESET.txInstall.map((row) => [...row]));
  assert.equal(rom.u32(0x13c332), WHITE_NVRAM.magic0Value);
  assert.equal(rom.u32(0x13c336), WHITE_NVRAM.magic0Address);
  assert.equal(rom.u16(0x13c34c), 0x303c);
  assert.equal(rom.u16(0x13c34e), WHITE_CHOOSER.type);
  assert.equal(rom.u32(0x13c352), 0x1414bc);
});
