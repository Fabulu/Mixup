import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ALLOC } from '../src/objalloc.js';
import { BLACK_LABEL_PROFILE, WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { Ram } from '../src/ram.js';
import { FullRom } from '../src/rom.js';
import {
  WHITE_CHOOSER,
  WHITE_FRONTEND,
  WHITE_NVRAM,
  finishWhiteVersionChooser13C0E6,
  handoffWhiteSelector15A0BE,
  provisionWhiteCabinetNvram,
  setWhiteFrontendState159BB0,
  stageWhiteVersionChooser13C34C,
  whiteCoinCounts13CCC2,
  whiteCreditCounts13CC9E,
  whiteJoinPoll15A0D8,
  whiteNvramGate13C330,
  whiteTakeP1Credit13CCFA,
  whiteTakeP2Credit13CD5C,
} from '../src/white-frontend.js';

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
      if (address === WHITE_CHOOSER.dispatchTable + WHITE_FRONTEND.selectorType * 8 + 4) {
        return WHITE_FRONTEND.selectorPriority;
      }
      if (address === WHITE_CHOOSER.dispatchTable + WHITE_CHOOSER.screenType * 8 + 4) {
        return WHITE_FRONTEND.screenPriority;
      }
      throw new Error(`unexpected synthetic ROM read $${address.toString(16)}`);
    },
  };
}

test('White bootstrap capability rejects other editions before RAM or ROM access', () => {
  let reads = 0;
  const untouched = new Proxy({}, {
    get() {
      reads++;
      throw new Error('protected bootstrap input was touched');
    },
  });
  assert.throws(
    () => provisionWhiteCabinetNvram(untouched, untouched, BLACK_LABEL_PROFILE),
    /White Label cabinet NVRAM provisioning is unavailable/,
  );
  assert.equal(reads, 0);
});

test('zero RAM follows the exact Version A ROM ERROR branch', () => {
  const ram = new Ram();
  const gate = whiteNvramGate13C330(ram);
  assert.equal(gate.valid, false);
  assert.equal(gate.next, WHITE_NVRAM.errorSetup);
  assert.equal(gate.errorText, WHITE_NVRAM.errorText);
  assert.equal(gate.errorSpin, WHITE_NVRAM.errorSpin);

  const staged = stageWhiteVersionChooser13C34C(ram, syntheticRom());
  assert.equal(staged.gate.valid, false);
  assert.equal(staged.made, null);
  assert.equal(ram.u16(ALLOC.createSp), 0,
    'invalid NVRAM cannot allocate the native version chooser');
});

test('browser cabinet provisioning installs code-proved magic and cartridge settings', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  const result = provisionWhiteCabinetNvram(ram, rom, WHITE_LABEL_PROFILE.id);

  assert.equal(result.magic0, WHITE_NVRAM.magic0Value);
  assert.equal(result.magic1, WHITE_NVRAM.magic1Value);
  assert.equal(ram.u32(WHITE_NVRAM.magic0Address), WHITE_NVRAM.magic0Value);
  assert.equal(ram.u32(WHITE_NVRAM.magic1Address), WHITE_NVRAM.magic1Value);
  assert.deepEqual(rom.reads, Array.from({ length: WHITE_NVRAM.settingsBytes },
    (_, index) => ['u8', WHITE_NVRAM.factorySource + index]));
  for (let i = 0; i < WHITE_NVRAM.settingsBytes; i++) {
    assert.equal(ram.u8(WHITE_NVRAM.settingsTarget + i),
      (WHITE_NVRAM.factorySource + i) & 0xff);
  }
  assert.equal(ram.u8(WHITE_NVRAM.choiceAddress), 0,
    'a new cabinet keeps the native chooser default on Version A');
  assert.equal(whiteNvramGate13C330(ram).valid, true);
});

test('valid Version A NVRAM stages native dispatch type $14', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  provisionWhiteCabinetNvram(ram, rom);
  rom.reads.length = 0;

  const result = stageWhiteVersionChooser13C34C(ram, rom);
  assert.equal(result.gate.valid, true);
  assert.equal(result.gate.next, WHITE_CHOOSER.stageSite);
  assert.equal(result.made.ok, true);
  assert.equal(result.made.addr, ALLOC.createStage);
  assert.equal(ram.u16(result.made.addr), 0x8014);
  assert.equal(ram.u16(result.made.addr + ALLOC.priOff), WHITE_CHOOSER.priority);
  assert.deepEqual(rom.reads, [[
    'u16', WHITE_CHOOSER.dispatchTable + WHITE_CHOOSER.type * 8 + 4,
  ]]);
});

test('native choice zero resets objects and stages type 8 at state $D', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  ram.setU16(ALLOC.table, 0x8009);
  ram.setU16(ALLOC.table + ALLOC.priOff, 0x000a);
  ram.setU32(ALLOC.table + ALLOC.idOff, 9);
  ram.setU16(ALLOC.createSp, 0x100);
  ram.setU16(0x80fa86, 0xffff);

  const result = finishWhiteVersionChooser13C0E6(ram, rom);
  assert.equal(ram.u16(ALLOC.table), 0,
    '$1413B6 clears the previous chooser object');
  assert.equal(ram.u16(0x80fa86), 0,
    '$1459FA runs before the type 8 allocation');
  assert.equal(result.made.addr, ALLOC.createStage);
  assert.equal(ram.u16(result.made.addr), 0x8008);
  assert.equal(ram.u16(result.made.addr + ALLOC.priOff), WHITE_FRONTEND.screenPriority);
  assert.equal(result.state, WHITE_CHOOSER.screenState);
  assert.equal(ram.u16(result.made.addr + WHITE_CHOOSER.stateField), 0x000d);
});

test('Version A credit and coin readers preserve free-play and zero-extension rules', () => {
  const ram = new Ram();
  ram.setU8(WHITE_FRONTEND.dipAddress, 0);
  ram.setU8(WHITE_FRONTEND.coinAAddress, 0x81);
  ram.setU8(WHITE_FRONTEND.coinBAddress, 0xfe);
  ram.setU8(WHITE_FRONTEND.creditAAddress, 0x80);
  ram.setU8(WHITE_FRONTEND.creditBAddress, 0xff);
  assert.deepEqual(whiteCoinCounts13CCC2(ram), [0x81, 0xfe]);
  assert.deepEqual(whiteCreditCounts13CC9E(ram), [0x80, 0xff]);

  ram.setU8(WHITE_FRONTEND.dipAddress, WHITE_FRONTEND.freePlay);
  assert.deepEqual(whiteCoinCounts13CCC2(ram), [0, 0]);
  assert.deepEqual(whiteCreditCounts13CC9E(ram), [0, 0]);
});

test('Version A committing entries consume direct and coin-mode credits exactly', () => {
  const ram = new Ram();
  ram.setU8(WHITE_FRONTEND.dipAddress, 0);
  ram.setU8(WHITE_FRONTEND.creditAAddress, 1);
  ram.setU8(WHITE_FRONTEND.creditBAddress, 2);
  assert.equal(whiteTakeP1Credit13CCFA(ram), false);
  assert.equal(ram.u8(WHITE_FRONTEND.creditAAddress), 0);
  assert.equal(whiteTakeP1Credit13CCFA(ram), true);

  ram.setU8(WHITE_FRONTEND.creditModeAddress, WHITE_FRONTEND.separateCredits);
  assert.equal(whiteTakeP2Credit13CD5C(ram), false);
  assert.equal(ram.u8(WHITE_FRONTEND.creditBAddress), 1);

  ram.setU8(WHITE_FRONTEND.dipAddress, WHITE_FRONTEND.coinMode);
  ram.setU8(WHITE_FRONTEND.coinAAddress, 3);
  ram.setU8(WHITE_FRONTEND.coinACostAddress, 2);
  assert.equal(whiteTakeP1Credit13CCFA(ram), false);
  assert.equal(ram.u8(WHITE_FRONTEND.coinAAddress), 1);
  assert.equal(ram.u8(WHITE_FRONTEND.coinACostAddress), 1,
    '$13CD2E resets the conversion threshold after accepting P1');

  ram.setU8(WHITE_FRONTEND.coinBAddress, 4);
  ram.setU8(WHITE_FRONTEND.coinBCostAddress, 3);
  assert.equal(whiteTakeP2Credit13CD5C(ram), false);
  assert.equal(ram.u8(WHITE_FRONTEND.coinBAddress), 1);
  assert.equal(ram.u8(WHITE_FRONTEND.coinBCostAddress), 1,
    '$13CDEA resets the conversion threshold after accepting separate P2');
});

test('native START polling commits P1 then genuine P2 from a shared credit pool', () => {
  const ram = new Ram();
  const a5 = ALLOC.table;
  ram.setU8(WHITE_FRONTEND.dipAddress, 0);
  ram.setU8(WHITE_FRONTEND.creditModeAddress, 0);
  ram.setU8(WHITE_FRONTEND.creditAAddress, 2);
  ram.setU16(WHITE_FRONTEND.p1RawAddress, WHITE_FRONTEND.startBit);
  ram.setU16(WHITE_FRONTEND.p2RawAddress, WHITE_FRONTEND.startBit);
  ram.setU8(a5 + WHITE_FRONTEND.recordInitedField, 1);
  ram.setU16(WHITE_FRONTEND.stateAddress, 3);

  const joined = whiteJoinPoll15A0D8(ram, a5);
  assert.deepEqual(joined, { mask: 3, state: WHITE_FRONTEND.selectorState });
  assert.equal(ram.u8(WHITE_FRONTEND.joinMaskAddress), 3);
  assert.equal(ram.u8(WHITE_FRONTEND.creditAAddress), 0,
    'shared P2 follows P1 through the same pool');
  assert.equal(ram.u8(a5 + WHITE_FRONTEND.recordInitedField), 0,
    '$159BB0 rearms the next state');
});

test('native P2 START consumes only the separately configured P2 pool', () => {
  const ram = new Ram();
  const a5 = ALLOC.table;
  ram.setU8(WHITE_FRONTEND.dipAddress, 0);
  ram.setU8(WHITE_FRONTEND.creditModeAddress, WHITE_FRONTEND.separateCredits);
  ram.setU8(WHITE_FRONTEND.creditAAddress, 3);
  ram.setU8(WHITE_FRONTEND.creditBAddress, 1);
  ram.setU16(WHITE_FRONTEND.p2RawAddress, WHITE_FRONTEND.startBit);

  setWhiteFrontendState159BB0(ram, a5, 3);
  const joined = whiteJoinPoll15A0D8(ram, a5);
  assert.equal(joined.mask, 2);
  assert.equal(ram.u8(WHITE_FRONTEND.creditAAddress), 3);
  assert.equal(ram.u8(WHITE_FRONTEND.creditBAddress), 0);
});

test('type 8 state $E replaces itself with type 9 and preserves both join bits', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  ram.setU16(ALLOC.table, 0x8008);
  ram.setU16(ALLOC.table + ALLOC.priOff, WHITE_FRONTEND.screenPriority);
  ram.setU32(ALLOC.table + ALLOC.idOff, 8);
  ram.setU8(WHITE_FRONTEND.joinMaskAddress, 3);

  const result = handoffWhiteSelector15A0BE(ram, rom);
  assert.equal(result.mask, 3);
  assert.equal(result.made.addr, ALLOC.createStage);
  assert.equal(ram.u16(result.made.addr), 0x8009);
  assert.equal(ram.u16(result.made.addr + ALLOC.priOff), WHITE_FRONTEND.selectorPriority);
  assert.equal(ram.u8(result.made.addr + WHITE_FRONTEND.selectorMaskField), 3);
});

rawTest('raw embedded image proves Version A entry, factory reads, and dispatch records', () => {
  const rom = new FullRom(new Uint8Array(readFileSync(IMAGE)));
  assert.equal(rom.u32(0x100004), WHITE_NVRAM.coldEntry);
  assert.equal(rom.u32(WHITE_CHOOSER.dispatchTable + WHITE_CHOOSER.type * 8),
    WHITE_CHOOSER.handler);
  assert.equal(rom.u16(WHITE_CHOOSER.dispatchTable + WHITE_CHOOSER.type * 8 + 4),
    WHITE_CHOOSER.priority);
  assert.equal(rom.u32(WHITE_CHOOSER.dispatchTable + WHITE_CHOOSER.screenType * 8),
    WHITE_FRONTEND.screenHandler);
  assert.equal(rom.u16(WHITE_CHOOSER.dispatchTable + WHITE_CHOOSER.screenType * 8 + 4),
    WHITE_FRONTEND.screenPriority);

  const ram = new Ram();
  provisionWhiteCabinetNvram(ram, rom);
  for (let i = 0; i < WHITE_NVRAM.settingsBytes; i++) {
    assert.equal(ram.u8(WHITE_NVRAM.settingsTarget + i),
      rom.u8(WHITE_NVRAM.factorySource + i));
  }
  assert.equal(whiteNvramGate13C330(ram).valid, true);
});
