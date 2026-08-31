import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ALLOC, commitCreates } from '../src/objalloc.js';
import { BLACK_LABEL_PROFILE, WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { Ram } from '../src/ram.js';
import { FullRom } from '../src/rom.js';
import {
  WHITE_CHOOSER,
  WHITE_FRONTEND,
  WHITE_FRONTEND_ARM_TARGETS,
  WHITE_FRONTEND_CALLS,
  WHITE_NVRAM,
  WHITE_VERSION_CHOOSER,
  WHITE_VERSION_CHOOSER_CALLS,
  finishWhiteVersionChooser13C0E6,
  handoffWhiteSelector15A0BE,
  provisionWhiteCabinetNvram,
  setWhiteFrontendState159BB0,
  stageWhiteVersionChooser13C34C,
  whiteCoinCounts13CCC2,
  whiteCreditCounts13CC9E,
  whiteFrontendTick159BBC,
  whiteJoinPoll15A0D8,
  whiteNvramGate13C330,
  whiteTakeP1Credit13CCFA,
  whiteTakeP2Credit13CD5C,
  whiteVersionChooserTick13BEEA,
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
      if (address >= WHITE_VERSION_CHOOSER.countdownTable
          && address < WHITE_VERSION_CHOOSER.countdownTable + 40) {
        return address & 0xffff;
      }
      throw new Error(`unexpected synthetic ROM read $${address.toString(16)}`);
    },
  };
}

function primeFrontend(ram, state) {
  const a5 = ALLOC.table;
  ram.setU16(a5, 0x8008);
  ram.setU8(a5 + WHITE_FRONTEND.constructedField, 1);
  ram.setU16(WHITE_FRONTEND.stateAddress, state);
  return a5;
}

function frontendContext(overrides = {}) {
  const calls = [];
  const whiteFrontend = new Proxy(overrides, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => calls.push([key, ...args]);
    },
  });
  return {
    calls,
    ctx: {
      whiteFrontend,
      unported: { note: (...args) => calls.push(['note', ...args]) },
    },
  };
}

function chooserContext(overrides = {}) {
  const calls = [];
  const whiteChooser = new Proxy(overrides, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        calls.push([key, ...args]);
        return undefined;
      };
    },
  });
  return { calls, ctx: { whiteChooser } };
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

test('type $14 initialization falls through and preserves the exact 100-tick lockout', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  const a5 = ALLOC.table;
  const destroyed = [];
  const { ctx } = chooserContext({
    introCreate: () => 0x12345678,
    effectDestroy: (handle) => destroyed.push(handle),
  });
  ram.setU16(WHITE_NVRAM.choiceAddress, 1);

  let result = whiteVersionChooserTick13BEEA(ram, rom, a5, ctx);
  assert.equal(result.phase, 'lockout');
  assert.equal(ram.u16(a5 + WHITE_VERSION_CHOOSER.constructedField), 1);
  assert.equal(ram.u32(WHITE_VERSION_CHOOSER.introHandle), 0x12345678);
  assert.equal(ram.u16(WHITE_VERSION_CHOOSER.selection), 1);
  assert.equal(ram.u16(WHITE_VERSION_CHOOSER.lockout), 0x63);
  assert.equal(ram.u16(WHITE_VERSION_CHOOSER.introLifetime), 0x1d);
  assert.equal(ram.u16(WHITE_VERSION_CHOOSER.mainTimer), 0x04b0);

  for (let invocation = 2; invocation <= 30; invocation++) {
    result = whiteVersionChooserTick13BEEA(ram, rom, a5, ctx);
  }
  assert.equal(ram.u16(WHITE_VERSION_CHOOSER.introLifetime), 0);
  assert.deepEqual(destroyed, [0x12345678]);

  for (let invocation = 31; invocation <= 100; invocation++) {
    result = whiteVersionChooserTick13BEEA(ram, rom, a5, ctx);
  }
  assert.equal(result.phase, 'lockout');
  assert.equal(ram.u16(WHITE_VERSION_CHOOSER.lockout), 0);
  assert.equal(ram.u16(WHITE_VERSION_CHOOSER.mainTimer), 0x04b0,
    'invocation 100 returns after producing a zero lockout');

  result = whiteVersionChooserTick13BEEA(ram, rom, a5, ctx);
  assert.equal(result.phase, 'selection');
  assert.equal(ram.u16(WHITE_VERSION_CHOOSER.mainTimer), 0x04af);
});

test('raw held direction has priority and confirms the changed edition in the same tick', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  const a5 = ALLOC.table;
  const { calls, ctx } = chooserContext();
  ram.setU16(a5 + WHITE_VERSION_CHOOSER.constructedField, 1);
  ram.setU16(WHITE_VERSION_CHOOSER.selection, 1);
  ram.setU16(WHITE_VERSION_CHOOSER.mainTimer, WHITE_VERSION_CHOOSER.mainTimerInitial);
  ram.setU16(WHITE_VERSION_CHOOSER.p1Input,
    WHITE_VERSION_CHOOSER.upBit | 0x0010);
  ram.setU16(WHITE_VERSION_CHOOSER.p2Input, WHITE_VERSION_CHOOSER.downBit);

  const result = whiteVersionChooserTick13BEEA(ram, rom, a5, ctx);
  assert.equal(result.phase, 'confirmation');
  assert.equal(result.selection, 0, 'Up wins over the simultaneously held Down bit');
  assert.equal(ram.u16(WHITE_VERSION_CHOOSER.combinedInput), 0x0013);
  assert.equal(ram.u16(WHITE_VERSION_CHOOSER.mainTimer), 0);
  assert.equal(ram.u16(WHITE_VERSION_CHOOSER.confirmation), 0x63,
    'confirmation initializes to $64 and decrements in the same invocation');
  assert.equal(calls.filter(([name]) => name === 'navigationSound').length, 1);
  assert.equal(calls.filter(([name]) => name === 'confirmationSound').length, 1);
});

test('type $14 no-input route exits to Version A on invocation 1399', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  const a5 = ALLOC.table;
  ram.setU16(WHITE_NVRAM.choiceAddress, 0);

  let result;
  for (let invocation = 1; invocation <= 1299; invocation++) {
    result = whiteVersionChooserTick13BEEA(ram, rom, a5);
  }
  assert.equal(result.phase, 'selection');
  assert.equal(ram.u16(WHITE_VERSION_CHOOSER.mainTimer), 1);

  result = whiteVersionChooserTick13BEEA(ram, rom, a5);
  assert.equal(result.phase, 'confirmation');
  assert.equal(ram.u16(WHITE_VERSION_CHOOSER.confirmation), 0x63);
  for (let invocation = 1301; invocation <= 1398; invocation++) {
    result = whiteVersionChooserTick13BEEA(ram, rom, a5);
  }
  assert.equal(result.phase, 'confirmation');
  assert.equal(ram.u16(WHITE_VERSION_CHOOSER.confirmation), 1);

  result = whiteVersionChooserTick13BEEA(ram, rom, a5);
  assert.equal(result.phase, 'exit');
  assert.equal(result.route, 'white');
  assert.equal(result.target, WHITE_CHOOSER.whiteExit);
  assert.equal(ram.u16(WHITE_NVRAM.choiceAddress), 0);
  assert.equal(ram.u16(result.made.addr), 0x8008);
  assert.equal(ram.u16(result.made.addr + WHITE_CHOOSER.stateField), 0x000d);
});

test('type $14 nonzero choice returns the native masked Black reset route', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  const a5 = ALLOC.table;
  const resets = [];
  const { ctx } = chooserContext({
    blackReset: (...args) => resets.push(args),
  });
  ram.setU16(a5 + WHITE_VERSION_CHOOSER.constructedField, 1);
  ram.setU16(WHITE_VERSION_CHOOSER.selection, 9);
  ram.setU16(WHITE_VERSION_CHOOSER.mainTimer, 0);
  ram.setU16(WHITE_VERSION_CHOOSER.confirmation, 1);

  const result = whiteVersionChooserTick13BEEA(ram, rom, a5, ctx);
  assert.equal(result.route, 'black');
  assert.equal(result.target, WHITE_VERSION_CHOOSER.blackReset);
  assert.equal(result.interruptMask, 0x0700);
  assert.equal(ram.u16(WHITE_NVRAM.choiceAddress), 9,
    'native choice persistence treats every nonzero word as Build B');
  assert.equal(ram.u16(ALLOC.createSp), 0);
  assert.equal(resets.length, 1);
  assert.equal(resets[0][2], 0x0700);
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

  ram.setU8(WHITE_FRONTEND.coinAAddress, 0x81);
  ram.setU8(WHITE_FRONTEND.coinACostAddress, 1);
  assert.equal(whiteTakeP1Credit13CCFA(ram), false);
  assert.equal(ram.u8(WHITE_FRONTEND.coinAAddress), 0,
    'signed byte subtraction clamps $81 minus one after it becomes $80');

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

test('type 8 construction returns immediately after exact narrow hardware clears', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  const a5 = ALLOC.table;
  ram.setU16(a5 + WHITE_FRONTEND.parameterField, WHITE_CHOOSER.screenState);
  ram.setU16(0x803930, 0x3030);
  for (const address of [0x80392e, 0x803932, 0x803934, 0x803936, 0x803938]) {
    ram.setU16(address, 0xffff);
  }
  const { ctx, calls } = frontendContext();

  const result = whiteFrontendTick159BBC(ram, rom, a5, ctx);
  assert.equal(result.branch, 'construct');
  assert.equal(result.state, WHITE_CHOOSER.screenState);
  assert.equal(ram.u8(a5 + WHITE_FRONTEND.constructedField), 1);
  assert.equal(ram.u16(WHITE_FRONTEND.blinkAddress), 0);
  assert.equal(ram.u8(WHITE_FRONTEND.joinMaskAddress), 0);
  assert.equal(ram.u16(0x803930), 0x3030);
  for (const address of [0x80392e, 0x803932, 0x803934, 0x803936, 0x803938]) {
    assert.equal(ram.u16(address), 0);
  }
  assert.equal(calls.some(([name]) => name === 'blinkOn' || name === 'blinkOff'), false,
    'construction does not enter the common tail in the same frame');
});

test('type 8 dispatches every native state and preserves its bare-return arms', () => {
  const rom = syntheticRom();
  const specialized = new Map([
    [1, 'screen1Tick'], [2, 'highScoreTick'], [3, 'creditTick'], [5, 'screen5Tick'],
    [9, 'screen9Tick'], [12, 'screen12Tick'], [13, 'warningEmit'],
  ]);
  for (let state = 0; state < WHITE_FRONTEND_ARM_TARGETS.length; state++) {
    const ram = new Ram();
    const a5 = primeFrontend(ram, state);
    const { ctx, calls } = frontendContext();
    const result = whiteFrontendTick159BBC(ram, rom, a5, ctx);
    assert.equal(result.branch, 'tail');
    assert.equal(result.staleState, state);
    assert.equal(result.target, WHITE_FRONTEND_ARM_TARGETS[state]);
    if ([4, 6, 7, 8, 10, 11].includes(state)) {
      const bodyNames = new Set(specialized.values());
      assert.equal(calls.some(([name]) => bodyNames.has(name)), false,
        `state ${state} is a bare RTS after the common tail`);
    }
  }

  const ram = new Ram();
  const a5 = primeFrontend(ram, 15);
  const result = whiteFrontendTick159BBC(ram, rom, a5, frontendContext().ctx);
  assert.equal(result.target, WHITE_FRONTEND_ARM_TARGETS[0],
    'native state $F falls through to arm 0 without a range check');
});

test('states $E, 3, and $D bypass credit teardown while ordinary states do not', () => {
  const rom = syntheticRom();
  for (const state of [14, 3, 13]) {
    const ram = new Ram();
    const a5 = primeFrontend(ram, state);
    ram.setU8(WHITE_FRONTEND.creditAAddress, 1);
    const result = whiteFrontendTick159BBC(ram, rom, a5, frontendContext().ctx);
    assert.equal(result.branch, 'tail');
  }

  const ram = new Ram();
  const a5 = primeFrontend(ram, 2);
  ram.setU8(WHITE_FRONTEND.creditAAddress, 1);
  const result = whiteFrontendTick159BBC(ram, rom, a5, frontendContext().ctx);
  assert.equal(result.branch, 'credit');
  assert.equal(ram.u16(result.made.addr), 0x8008);
  assert.equal(ram.u16(result.made.addr + WHITE_FRONTEND.parameterField), 3);
});

test('free play START rereads state $E and stages type 9 in the same tick', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  const a5 = primeFrontend(ram, 2);
  ram.setU8(WHITE_FRONTEND.dipAddress, WHITE_FRONTEND.freePlay);
  ram.setU16(WHITE_FRONTEND.p1RawAddress, WHITE_FRONTEND.startBit);

  const result = whiteFrontendTick159BBC(ram, rom, a5, frontendContext().ctx);
  assert.equal(result.branch, 'tail');
  assert.equal(result.staleState, 2);
  assert.equal(result.state, WHITE_FRONTEND.selectorState);
  assert.equal(ram.u8(WHITE_FRONTEND.joinMaskAddress), 1);
  assert.equal(ram.u16(result.made.addr), 0x8009);
  assert.equal(ram.u8(result.made.addr + WHITE_FRONTEND.selectorMaskField), 1);
});

test('ordinary credit route preserves type 8 and type 9 scheduling latency', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  let a5 = primeFrontend(ram, 2);
  ram.setU8(WHITE_FRONTEND.creditAAddress, 1);
  ram.setU16(WHITE_FRONTEND.p1RawAddress, WHITE_FRONTEND.startBit);

  const credit = whiteFrontendTick159BBC(ram, rom, a5, frontendContext().ctx);
  assert.equal(credit.branch, 'credit');
  assert.equal(ram.u16(ALLOC.table), 0, 'teardown retires the old type 8 immediately');
  commitCreates(ram);
  a5 = ALLOC.table;
  assert.equal(ram.u16(a5), 0x8008);
  assert.equal(ram.u16(a5 + WHITE_FRONTEND.parameterField), 3);

  const constructed = whiteFrontendTick159BBC(ram, rom, a5, frontendContext().ctx);
  assert.equal(constructed.branch, 'construct');
  assert.equal(ram.u16(WHITE_FRONTEND.stateAddress), 3);
  const accepted = whiteFrontendTick159BBC(ram, rom, a5, frontendContext().ctx);
  assert.equal(accepted.branch, 'tail');
  assert.equal(accepted.state, 3);
  assert.equal(ram.u16(WHITE_FRONTEND.stateAddress), WHITE_FRONTEND.selectorState);
  assert.equal(ram.u16(ALLOC.createSp), 0, 'state 3 returns after accepting START');

  const handoff = whiteFrontendTick159BBC(ram, rom, a5, frontendContext().ctx);
  assert.equal(handoff.state, WHITE_FRONTEND.selectorState);
  assert.equal(ram.u16(handoff.made.addr), 0x8009);
});

test('warning initialization has one-frame latency and exact text and timeout steps', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  const a5 = primeFrontend(ram, WHITE_CHOOSER.screenState);
  const emitted = [];
  const { ctx } = frontendContext({
    warningEmit: (address, y) => emitted.push([address, y]),
  });

  const initialized = whiteFrontendTick159BBC(ram, rom, a5, ctx);
  assert.equal(initialized.state, WHITE_CHOOSER.screenState);
  assert.deepEqual(emitted, []);
  assert.equal(ram.u16(a5 + WHITE_FRONTEND.cursorField), 0);
  assert.equal(ram.u16(a5 + WHITE_FRONTEND.yField), WHITE_FRONTEND.warningY);
  assert.equal(ram.u16(a5 + WHITE_FRONTEND.parameterField), WHITE_FRONTEND.warningTimeout);

  whiteFrontendTick159BBC(ram, rom, a5, ctx);
  assert.deepEqual(emitted, [[WHITE_FRONTEND.warningData, WHITE_FRONTEND.warningY]]);
  assert.equal(ram.u16(a5 + WHITE_FRONTEND.cursorField), WHITE_FRONTEND.warningStep);
  assert.equal(ram.u16(a5 + WHITE_FRONTEND.yField),
    WHITE_FRONTEND.warningY - WHITE_FRONTEND.warningYStep);
  assert.equal(ram.u16(a5 + WHITE_FRONTEND.parameterField),
    WHITE_FRONTEND.warningTimeout - 1);

  ram.setU16(a5 + WHITE_FRONTEND.cursorField, WHITE_FRONTEND.warningEnd);
  ram.setU16(a5 + WHITE_FRONTEND.parameterField, 1);
  whiteFrontendTick159BBC(ram, rom, a5, ctx);
  assert.equal(ram.u16(WHITE_FRONTEND.stateAddress), 2);
  assert.equal(ram.u8(a5 + WHITE_FRONTEND.recordInitedField), 0);
  assert.equal(emitted.length, 1);
});

test('state 5 carry-clear path replaces itself at state 2', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  const a5 = primeFrontend(ram, 5);
  const { ctx } = frontendContext({ screen5Tick: () => false });

  const result = whiteFrontendTick159BBC(ram, rom, a5, ctx);
  assert.equal(result.state, 5);
  assert.equal(ram.u16(result.made.addr), 0x8008);
  assert.equal(ram.u16(result.made.addr + WHITE_FRONTEND.parameterField), 2);
});

rawTest('raw type $14 chooser proves call roots, both inputs, and countdown table', () => {
  const rom = new FullRom(new Uint8Array(readFileSync(IMAGE)));
  assert.equal(rom.u32(0x13befa), WHITE_VERSION_CHOOSER_CALLS.introCreate);
  assert.equal(rom.u32(0x13bf06), WHITE_VERSION_CHOOSER.spritePalette);
  assert.equal(rom.u32(0x13bf10), 0x141844);
  assert.equal(rom.u32(0x13bf6c), WHITE_VERSION_CHOOSER_CALLS.effectDestroy);
  assert.equal(rom.u32(0x13bfe2), WHITE_FRONTEND.p1Input);
  assert.equal(rom.u32(0x13bfea), WHITE_FRONTEND.p2Input);
  assert.equal(rom.u32(0x13c06c), WHITE_VERSION_CHOOSER_CALLS.effectCreate);
  assert.equal(rom.u32(0x13c09c), WHITE_VERSION_CHOOSER_CALLS.effectDestroy);
  assert.equal(rom.u32(0x13c0bc), WHITE_VERSION_CHOOSER_CALLS.clearGraphics);
  assert.equal(rom.u32(0x13c0c2), WHITE_VERSION_CHOOSER_CALLS.clearSlots);
  assert.equal(rom.u32(0x13c0c8), 0x140e5c);
  assert.equal(rom.u32(0x13c0e0), WHITE_VERSION_CHOOSER.blackReset);
  assert.deepEqual(Array.from({ length: 10 }, (_, i) =>
    rom.u32(WHITE_VERSION_CHOOSER.countdownTable + i * 4)), [
    0x00000bc0, 0x00000bd4, 0x00000be8, 0x00000bfc, 0x00000c10,
    0x00000c24, 0x00000c38, 0x00000c4c, 0x00000c60, 0x00000c74,
  ]);
});

rawTest('raw type 8 table proves all fifteen targets and independently rooted calls', () => {
  const rom = new FullRom(new Uint8Array(readFileSync(IMAGE)));
  const targets = [];
  for (let i = 0; i < WHITE_FRONTEND_ARM_TARGETS.length; i++) {
    const entry = 0x159cbe + i * 4;
    assert.equal(rom.u16(entry), 0x6000);
    const displacement = (rom.u16(entry + 2) << 16) >> 16;
    targets.push(entry + 2 + displacement);
  }
  assert.deepEqual(targets, [...WHITE_FRONTEND_ARM_TARGETS]);
  assert.equal(rom.u32(0x159c0e), 0x1413b6);
  assert.equal(rom.u32(0x159c14), 0x1459fa);
  assert.equal(rom.u32(0x159c1a), 0x15b8f2);
  assert.equal(rom.u32(0x159d40), WHITE_FRONTEND_CALLS.clearTx);
  assert.equal(rom.u32(0x159d46), WHITE_FRONTEND_CALLS.screen1Init);
  assert.equal(rom.u32(0x159d4c), WHITE_FRONTEND_CALLS.screen1Tick);
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
