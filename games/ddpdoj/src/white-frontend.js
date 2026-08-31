// Embedded Version A cabinet bootstrap and native chooser boundaries.
//
// Build A is selected from the same decrypted 6 MiB cartridge image as Black
// Label. Its code roots below were independently disassembled. No address is a
// constant-offset projection from Build B.

import { objTableInit1413B6, stageCreate } from './objalloc.js';
import { resolveGameProfile, WHITE_LABEL_PROFILE } from './profiles.js';
import {
  requireRuntimeCapability, resolveGameRuntime,
} from './runtime-profile.js';
import { clear1459FA } from './stageend.js';

export const WHITE_NVRAM = Object.freeze({
  coldEntry: 0x13b7b8,
  resetEntry: 0x13c24e,
  factoryWrapper: 0x1563be,
  validator: 0x15658e,
  factory: 0x15653c,
  factorySource: 0x158aa8,
  settingsTarget: 0x803808,
  settingsBytes: 8,
  magic0Address: 0x803800,
  magic0Value: 0x36982136,
  magic1Address: 0x803804,
  magic1Value: 0x76349621,
  choiceAddress: 0x803810,
  gate0: 0x13c330,
  gate1: 0x13c33e,
  errorSetup: 0x13c382,
  errorText: 0x13c39c,
  errorSpin: 0x13c398,
});

export const WHITE_CHOOSER = Object.freeze({
  stageSite: 0x13c34c,
  allocatorSite: 0x13c350,
  type: 0x14,
  handler: 0x13beea,
  dispatchTable: 0x141294,
  priority: 0x001e,
  choiceStore: 0x13c0cc,
  whiteExit: 0x13c0e6,
  blackExit: 0x13c0de,
  screenStageSite: 0x13c0f2,
  screenType: 0x08,
  screenState: 0x000d,
  stateField: 0x04,
});

export const WHITE_FRONTEND = Object.freeze({
  setState: 0x159bb0,
  screenHandler: 0x159bbc,
  screenPriority: 0x000a,
  coinCounters: 0x13ccc2,
  creditCounters: 0x13cc9e,
  joinPoll: 0x15a0d8,
  p1Input: 0x13d4d8,
  p2Input: 0x13d4ea,
  p1StartConsume: 0x13ccfa,
  p2StartConsume: 0x13cd5c,
  selectorStage: 0x15a0be,
  selectorType: 0x09,
  selectorHandler: 0x15be3e,
  selectorPriority: 0x000a,
  stateAddress: 0x812e56,
  blinkAddress: 0x812e58,
  joinMaskAddress: 0x812e5a,
  dipAddress: 0x803808,
  creditModeAddress: 0x80380b,
  coinAAddress: 0x803958,
  coinACostAddress: 0x803959,
  creditAAddress: 0x80395a,
  coinBAddress: 0x80395e,
  coinBCostAddress: 0x80395f,
  creditBAddress: 0x803960,
  p1RawAddress: 0x803970,
  p2RawAddress: 0x803976,
  freePlay: 0x12,
  coinMode: 0x11,
  separateCredits: 0x01,
  startBit: 0x8000,
  recordInitedField: 0x03,
  selectorMaskField: 0x04,
  selectorState: 0x000e,
});

function requireWhiteBootstrap(profileRequest, operation) {
  const profile = resolveGameProfile(profileRequest === undefined
    ? WHITE_LABEL_PROFILE
    : profileRequest);
  const runtime = resolveGameRuntime(profile);
  requireRuntimeCapability(runtime, 'frontendBootstrap', operation);
  return Object.freeze({ profile, runtime });
}

function assertRam(ram, operation) {
  if (!ram || typeof ram.u8 !== 'function' || typeof ram.u16 !== 'function'
      || typeof ram.u32 !== 'function' || typeof ram.setU8 !== 'function'
      || typeof ram.setU16 !== 'function' || typeof ram.setU32 !== 'function') {
    throw new TypeError(`${operation} needs the DaiOuJou RAM interface`);
  }
}

function assertRom(rom, operation) {
  if (!rom || typeof rom.u8 !== 'function' || typeof rom.u16 !== 'function') {
    throw new TypeError(`${operation} needs the DaiOuJou ROM interface`);
  }
}

/**
 * Provision the browser cabinet's empty NVRAM for Version A.
 *
 * The board's factory NVRAM image supplies the two identity longwords. No 68000
 * instruction writes them. The values are independently visible as the two
 * immediate comparisons at $13C330/$13C33E. The ordinary factory routine at
 * $15653C then copies eight operator bytes from the cartridge, so no settings
 * bytes are embedded in this source file.
 */
export function provisionWhiteCabinetNvram(ram, rom, profileRequest) {
  requireWhiteBootstrap(profileRequest, 'White Label cabinet NVRAM provisioning');
  assertRam(ram, 'White Label cabinet NVRAM provisioning');
  assertRom(rom, 'White Label cabinet NVRAM provisioning');

  ram.setU32(WHITE_NVRAM.magic0Address, WHITE_NVRAM.magic0Value);
  ram.setU32(WHITE_NVRAM.magic1Address, WHITE_NVRAM.magic1Value);
  for (let i = 0; i < WHITE_NVRAM.settingsBytes; i++) {
    ram.setU8(WHITE_NVRAM.settingsTarget + i,
      rom.u8(WHITE_NVRAM.factorySource + i));
  }
  return Object.freeze({
    magic0: ram.u32(WHITE_NVRAM.magic0Address),
    magic1: ram.u32(WHITE_NVRAM.magic1Address),
    settingsBytes: WHITE_NVRAM.settingsBytes,
  });
}

function nvramGate(ram) {
  const magic0 = ram.u32(WHITE_NVRAM.magic0Address);
  const magic1 = ram.u32(WHITE_NVRAM.magic1Address);
  const valid = magic0 === WHITE_NVRAM.magic0Value
    && magic1 === WHITE_NVRAM.magic1Value;
  return Object.freeze({
    valid,
    magic0,
    magic1,
    next: valid ? WHITE_CHOOSER.stageSite : WHITE_NVRAM.errorSetup,
    errorText: valid ? null : WHITE_NVRAM.errorText,
    errorSpin: valid ? null : WHITE_NVRAM.errorSpin,
  });
}

/** Model the exact two-longword gate at $13C330..$13C34A. */
export function whiteNvramGate13C330(ram, profileRequest) {
  requireWhiteBootstrap(profileRequest, 'White Label NVRAM gate');
  assertRam(ram, 'White Label NVRAM gate');
  return nvramGate(ram);
}

function stageType(ram, rom, type) {
  return stageCreate(ram, type,
    (entry) => rom.u16(WHITE_CHOOSER.dispatchTable + entry * 8 + 4));
}

/** Stage native chooser type $14 after the valid-NVRAM branch at $13C34C. */
export function stageWhiteVersionChooser13C34C(ram, rom, profileRequest) {
  requireWhiteBootstrap(profileRequest, 'White Label version chooser staging');
  assertRam(ram, 'White Label version chooser staging');
  assertRom(rom, 'White Label version chooser staging');
  const gate = nvramGate(ram);
  if (!gate.valid) return Object.freeze({ gate, made: null });
  const made = stageType(ram, rom, WHITE_CHOOSER.type);
  return Object.freeze({ gate, made });
}

/**
 * Native chooser selection zero at $13C0E6.
 *
 * The route resets the shared object table, runs A's independently paired
 * $1459FA clear, then stages type 8 with initial state $D.
 */
export function finishWhiteVersionChooser13C0E6(ram, rom, profileRequest) {
  requireWhiteBootstrap(profileRequest, 'White Label version chooser exit');
  assertRam(ram, 'White Label version chooser exit');
  assertRom(rom, 'White Label version chooser exit');

  objTableInit1413B6(ram);
  clear1459FA(ram);
  const made = stageType(ram, rom, WHITE_CHOOSER.screenType);
  ram.setU16(made.addr + WHITE_CHOOSER.stateField, WHITE_CHOOSER.screenState);
  return Object.freeze({
    made,
    state: ram.u16(made.addr + WHITE_CHOOSER.stateField),
  });
}

function assertRecordAddress(a5, operation) {
  if (!Number.isSafeInteger(a5) || a5 < 0) {
    throw new TypeError(`${operation} needs an object-record address`);
  }
}

function creditCounts(ram) {
  if (ram.u8(WHITE_FRONTEND.dipAddress) === WHITE_FRONTEND.freePlay) return [0, 0];
  return [
    ram.u8(WHITE_FRONTEND.creditAAddress),
    ram.u8(WHITE_FRONTEND.creditBAddress),
  ];
}

function coinCounts(ram) {
  if (ram.u8(WHITE_FRONTEND.dipAddress) === WHITE_FRONTEND.freePlay) return [0, 0];
  return [ram.u8(WHITE_FRONTEND.coinAAddress), ram.u8(WHITE_FRONTEND.coinBAddress)];
}

/** Exact zero-extended Version A credit pair at $13CC9E. */
export function whiteCreditCounts13CC9E(ram, profileRequest) {
  requireWhiteBootstrap(profileRequest, 'White Label credit read');
  assertRam(ram, 'White Label credit read');
  return Object.freeze(creditCounts(ram));
}

/** Exact zero-extended Version A pending-coin pair at $13CCC2. */
export function whiteCoinCounts13CCC2(ram, profileRequest) {
  requireWhiteBootstrap(profileRequest, 'White Label coin read');
  assertRam(ram, 'White Label coin read');
  return Object.freeze(coinCounts(ram));
}

function spendByte(ram, address) {
  const value = ram.u8(address);
  if (value !== 0) ram.setU8(address, value - 1);
}

function spendCoins(ram, address, cost) {
  const remainder = ram.u8(address) - cost;
  ram.setU8(address, remainder < 0 ? 0 : remainder);
}

function takeP1Credit(ram) {
  const mode = ram.u8(WHITE_FRONTEND.dipAddress);
  if (mode === WHITE_FRONTEND.freePlay) return false;
  if (mode === WHITE_FRONTEND.coinMode) {
    const [coins] = coinCounts(ram);
    const cost = ram.u8(WHITE_FRONTEND.coinACostAddress);
    if (coins < cost) return true;
    ram.setU8(WHITE_FRONTEND.coinACostAddress, 1);
    spendCoins(ram, WHITE_FRONTEND.coinAAddress, cost);
    return false;
  }
  const [credits] = creditCounts(ram);
  if (credits === 0) return true;
  spendByte(ram, WHITE_FRONTEND.creditAAddress);
  return false;
}

function takeP2Credit(ram) {
  const mode = ram.u8(WHITE_FRONTEND.dipAddress);
  if (mode === WHITE_FRONTEND.freePlay) return false;
  const separate = ram.u8(WHITE_FRONTEND.creditModeAddress)
    === WHITE_FRONTEND.separateCredits;
  if (mode === WHITE_FRONTEND.coinMode) {
    const [coinA, coinB] = coinCounts(ram);
    const coins = separate ? coinB : coinA;
    const cost = ram.u8(WHITE_FRONTEND.coinBCostAddress);
    if (coins < cost) return true;
    ram.setU8(WHITE_FRONTEND.coinBCostAddress, 1);
    spendCoins(ram,
      separate ? WHITE_FRONTEND.coinBAddress : WHITE_FRONTEND.coinAAddress,
      cost);
    return false;
  }
  const [creditA, creditB] = creditCounts(ram);
  const credits = separate ? creditB : creditA;
  if (credits === 0) return true;
  spendByte(ram,
    separate ? WHITE_FRONTEND.creditBAddress : WHITE_FRONTEND.creditAAddress);
  return false;
}

/**
 * Version A's committing P1 credit entry at $13CCFA.
 *
 * The 68000 reports refusal through carry. This returns the same predicate:
 * true means refused and false means accepted.
 */
export function whiteTakeP1Credit13CCFA(ram, profileRequest) {
  requireWhiteBootstrap(profileRequest, 'White Label P1 credit consume');
  assertRam(ram, 'White Label P1 credit consume');
  return takeP1Credit(ram);
}

/** Version A's committing P2 credit entry at $13CD5C, including shared pools. */
export function whiteTakeP2Credit13CD5C(ram, profileRequest) {
  requireWhiteBootstrap(profileRequest, 'White Label P2 credit consume');
  assertRam(ram, 'White Label P2 credit consume');
  return takeP2Credit(ram);
}

/** `$159BB0`: clear the next arm's init byte and write the shared state word. */
export function setWhiteFrontendState159BB0(ram, a5, state, profileRequest) {
  requireWhiteBootstrap(profileRequest, 'White Label frontend state change');
  assertRam(ram, 'White Label frontend state change');
  assertRecordAddress(a5, 'White Label frontend state change');
  ram.setU8(a5 + WHITE_FRONTEND.recordInitedField, 0);
  ram.setU16(WHITE_FRONTEND.stateAddress, state);
}

/**
 * `$15A0D8..$15A12D`: poll both native START words and build the join mask.
 * P1 is committed first, exactly as on the board, then genuine P2 is evaluated.
 */
export function whiteJoinPoll15A0D8(ram, a5, profileRequest) {
  requireWhiteBootstrap(profileRequest, 'White Label START polling');
  assertRam(ram, 'White Label START polling');
  assertRecordAddress(a5, 'White Label START polling');

  let mask = 0;
  ram.setU8(WHITE_FRONTEND.joinMaskAddress, mask);
  if ((ram.u16(WHITE_FRONTEND.p1RawAddress) & WHITE_FRONTEND.startBit) !== 0
      && !takeP1Credit(ram)) {
    mask |= 0x01;
    ram.setU8(WHITE_FRONTEND.joinMaskAddress, mask);
  }
  if ((ram.u16(WHITE_FRONTEND.p2RawAddress) & WHITE_FRONTEND.startBit) !== 0
      && !takeP2Credit(ram)) {
    mask |= 0x02;
    ram.setU8(WHITE_FRONTEND.joinMaskAddress, mask);
  }
  if (mask !== 0) {
    ram.setU8(a5 + WHITE_FRONTEND.recordInitedField, 0);
    ram.setU16(WHITE_FRONTEND.stateAddress, WHITE_FRONTEND.selectorState);
  }
  return Object.freeze({
    mask,
    state: ram.u16(WHITE_FRONTEND.stateAddress),
  });
}

/** `$15A0BE`: replace type 8 with native selector type 9 and copy the join mask. */
export function handoffWhiteSelector15A0BE(ram, rom, profileRequest) {
  requireWhiteBootstrap(profileRequest, 'White Label selector handoff');
  assertRam(ram, 'White Label selector handoff');
  assertRom(rom, 'White Label selector handoff');

  const mask = ram.u8(WHITE_FRONTEND.joinMaskAddress);
  objTableInit1413B6(ram);
  const made = stageType(ram, rom, WHITE_FRONTEND.selectorType);
  ram.setU8(made.addr + WHITE_FRONTEND.selectorMaskField, mask);
  return Object.freeze({ made, mask });
}
