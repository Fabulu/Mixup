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
  if (!ram || typeof ram.u16 !== 'function' || typeof ram.u32 !== 'function'
      || typeof ram.setU8 !== 'function' || typeof ram.setU16 !== 'function'
      || typeof ram.setU32 !== 'function') {
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
