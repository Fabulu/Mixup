// Embedded Version A cabinet bootstrap and native chooser boundaries.
//
// Build A is selected from the same decrypted 6 MiB cartridge image as Black
// Label. Its code roots below were independently disassembled. No address is a
// constant-offset projection from Build B.

import { clearSlotTable23C668, clearTx23C622 } from './background.js';
import { objTableInit1413B6, stageCreate } from './objalloc.js';
import { install2414BE, install24150A } from './palette.js';
import { resolveGameProfile, WHITE_LABEL_PROFILE } from './profiles.js';
import {
  requireRuntimeCapability, resolveGameRuntime,
} from './runtime-profile.js';
import { clear1459FA } from './stageend.js';
import {
  camReset140E5C, clearWhiteHardware13C814, clearWhiteSelectorFrontend15B8F2,
} from './white-hardware.js';

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

export const WHITE_VERSION_CHOOSER = Object.freeze({
  entry: 0x13beea,
  constructedField: 0x02,
  selection: 0x81585c,
  introHandle: 0x81585e,
  lockout: 0x815862,
  introLifetime: 0x815864,
  confirmation: 0x815866,
  mainTimer: 0x815868,
  combinedInput: 0x81586a,
  confirmationHandle: 0x81586c,
  lockoutInitial: 0x0064,
  introLifetimeInitial: 0x001e,
  confirmationInitial: 0x0064,
  mainTimerInitial: 0x04b0,
  p1Input: 0x803970,
  p2Input: 0x803976,
  upBit: 0x0001,
  downBit: 0x0002,
  confirmMask: 0x0070,
  introDescriptor: 0x15b35a,
  confirmationDescriptor: 0x13c204,
  spritePalette: 0x122838,
  spritePaletteBank: 3,
  countdownTable: 0x13c226,
  countdownDivisor: 0x0078,
  countdownPosition: 0x52011a00,
  countdownTile: 0x0210,
  countdownPalette: 3,
  blackReset: 0x23beea,
});

export const WHITE_VERSION_CHOOSER_CALLS = Object.freeze({
  introCreate: 0x15b21e,
  effectCreate: 0x145dee,
  effectDestroy: 0x145ede,
  fill: 0x15650e,
  text: 0x1564aa,
  introTick: 0x15b23a,
  navigationSound: 0x18b220,
  confirmationSound: 0x18b206,
  countdownDraw: 0x13e3da,
  clearGraphics: 0x13c974,
  clearSlots: 0x13c9a4,
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
  constructedField: 0x02,
  recordInitedField: 0x03,
  parameterField: 0x04,
  cursorField: 0x06,
  yField: 0x08,
  delayField: 0x0a,
  selectorMaskField: 0x04,
  selectorState: 0x000e,
  demoFlagAddress: 0x803926,
  txPaletteMain: 0x122638,
  txPaletteWarning: 0x122618,
  warningData: 0x159e82,
  warningEnd: 0x01a0,
  warningStep: 0x20,
  warningY: 0x00b8,
  warningYStep: 0x0c,
  warningDelay: 1,
  warningTimeout: 0x012c,
  blinkMask: 0x10,
});

export const WHITE_FRONTEND_ARM_TARGETS = Object.freeze([
  0x159cfa, 0x159d32, 0x159d5e, 0x159d96, 0x159dc0,
  0x159dc8, 0x159e2e, 0x159e30, 0x159e30, 0x159e32,
  0x159e58, 0x159e5a, 0x159e5c, 0x15a022, 0x15a0be,
]);

export const WHITE_FRONTEND_CALLS = Object.freeze({
  teardown: 0x159c0c,
  tail: 0x159c78,
  init: 0x159cfa,
  screen1Init: 0x15af60,
  screen1Tick: 0x15b128,
  highScoreInit: 0x15a808,
  highScoreTick: 0x15a83e,
  creditTick: 0x15b18c,
  screen5Init: 0x15b906,
  screen5Tick: 0x15ba48,
  screen9Init: 0x15b75c,
  screen9Tick: 0x15b798,
  screen12Init: 0x15b622,
  screen12Tick: 0x15b65e,
  warningTick: 0x15a022,
  warningEmit: 0x159468,
  blinkOn: 0x15a12e,
  blinkOff: 0x15a404,
  creditLine: 0x13d34a,
  clearTx: 0x13c98e,
  clearSlotTable: 0x13c9d4,
  clearHardware: 0x13c814,
  soundStop: 0x18ac22,
  soundDrain: 0x18b0d6,
  creditSound: 0x18ac96,
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

function noteChooserCall(ctx, name, site) {
  ctx?.unported?.note(site,
    `$${site.toString(16).toUpperCase()} White Label version chooser ${name}`);
}

function callChooser(ctx, name, site, ...args) {
  const fn = ctx?.whiteChooser?.[name];
  if (typeof fn === 'function') return fn(...args, site);
  noteChooserCall(ctx, name, site);
  return undefined;
}

function chooserEffectCreate(ctx, name, site, descriptor, ram, rom) {
  const handle = callChooser(ctx, name, site, descriptor, ram, rom);
  return Number.isSafeInteger(handle) ? handle >>> 0 : 0;
}

function chooserFill(ctx, column, row, value, ram) {
  callChooser(ctx, 'fill', WHITE_VERSION_CHOOSER_CALLS.fill,
    column, row, value, ram);
}

function chooserText(ctx, mode, source, ram, rom) {
  callChooser(ctx, 'text', WHITE_VERSION_CHOOSER_CALLS.text,
    mode, source, ram, rom);
}

function drawWhiteChooserNames(ctx, ram, rom) {
  chooserText(ctx, 0, 0x13c1b0, ram, rom);
  chooserText(ctx, 0, 0x13c1c6, ram, rom);
}

function drawWhiteChooserHighlight(ctx, selection, ram, rom) {
  if (selection === 0) {
    chooserFill(ctx, 4, 0x20, 1, ram);
    chooserText(ctx, 2, 0x13c1b0, ram, rom);
  } else {
    chooserFill(ctx, 4, 0x1c, 1, ram);
    chooserText(ctx, 2, 0x13c1c6, ram, rom);
  }
}

function drawWhiteChooserCountdown(ram, rom, ctx) {
  const quotient = Math.trunc(ram.u16(WHITE_VERSION_CHOOSER.mainTimer)
    / WHITE_VERSION_CHOOSER.countdownDivisor);
  const source = WHITE_VERSION_CHOOSER.countdownTable + quotient * 4;
  const descriptor = ((rom.u16(source) << 16) | rom.u16(source + 2)) >>> 0;
  callChooser(ctx, 'countdownDraw', WHITE_VERSION_CHOOSER_CALLS.countdownDraw,
    descriptor, WHITE_VERSION_CHOOSER.countdownPosition,
    WHITE_VERSION_CHOOSER.countdownTile, WHITE_VERSION_CHOOSER.countdownPalette,
    ram, rom);
  return Object.freeze({ quotient, source, descriptor });
}

function drawWhiteChooserActive(ram, rom, ctx) {
  chooserFill(ctx, 4, 0x20, 0xffff, ram);
  chooserFill(ctx, 4, 0x1c, 0xffff, ram);
  chooserText(ctx, 0, 0x13c1dc, ram, rom);
  chooserText(ctx, 0, 0x13c1f3, ram, rom);
  callChooser(ctx, 'introTick', WHITE_VERSION_CHOOSER_CALLS.introTick, ram, rom);
}

function installWhiteChooserPalette(ram, rom, ctx) {
  if (!ctx?.palette) {
    noteChooserCall(ctx, 'sprite palette install', 0x141844);
    return false;
  }
  if (typeof rom.bytes !== 'function') {
    throw new TypeError('White Label version chooser palette installation needs ROM byte windows');
  }
  install24150A(ram, ctx.palette, WHITE_VERSION_CHOOSER.spritePaletteBank,
    rom.bytes(WHITE_VERSION_CHOOSER.spritePalette, 64), 0x141844,
    '$122838 Version A chooser sprite palette');
  return true;
}

function initializeWhiteVersionChooser(ram, rom, a5, ctx) {
  ram.setU16(a5 + WHITE_VERSION_CHOOSER.constructedField, 1);
  ram.setU32(WHITE_VERSION_CHOOSER.introHandle,
    chooserEffectCreate(ctx, 'introCreate', WHITE_VERSION_CHOOSER_CALLS.introCreate,
      WHITE_VERSION_CHOOSER.introDescriptor, ram, rom));
  installWhiteChooserPalette(ram, rom, ctx);
  ram.setU16(WHITE_VERSION_CHOOSER.selection, ram.u16(WHITE_NVRAM.choiceAddress));
  ram.setU16(WHITE_VERSION_CHOOSER.lockout, WHITE_VERSION_CHOOSER.lockoutInitial);
  ram.setU16(WHITE_VERSION_CHOOSER.introLifetime,
    WHITE_VERSION_CHOOSER.introLifetimeInitial);
  ram.setU16(WHITE_VERSION_CHOOSER.confirmation, 0);
  ram.setU16(WHITE_VERSION_CHOOSER.mainTimer, WHITE_VERSION_CHOOSER.mainTimerInitial);
  ram.setU16(WHITE_VERSION_CHOOSER.combinedInput, 0);
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

function tickWhiteChooserIntro(ram, ctx) {
  const lifetime = ram.u16(WHITE_VERSION_CHOOSER.introLifetime);
  if (lifetime === 0) return;
  const next = (lifetime - 1) & 0xffff;
  ram.setU16(WHITE_VERSION_CHOOSER.introLifetime, next);
  if (next === 0) {
    callChooser(ctx, 'effectDestroy', WHITE_VERSION_CHOOSER_CALLS.effectDestroy,
      ram.u32(WHITE_VERSION_CHOOSER.introHandle), ram);
  }
}

function tickWhiteChooserConfirmation(ram, rom, ctx, profileRequest) {
  if (ram.u16(WHITE_VERSION_CHOOSER.confirmation) === 0) {
    callChooser(ctx, 'confirmationSound', WHITE_VERSION_CHOOSER_CALLS.confirmationSound, ram);
    ram.setU32(WHITE_VERSION_CHOOSER.confirmationHandle,
      chooserEffectCreate(ctx, 'effectCreate', WHITE_VERSION_CHOOSER_CALLS.effectCreate,
        WHITE_VERSION_CHOOSER.confirmationDescriptor, ram, rom));
    ram.setU16(WHITE_VERSION_CHOOSER.confirmation,
      WHITE_VERSION_CHOOSER.confirmationInitial);
  }

  const confirmation = (ram.u16(WHITE_VERSION_CHOOSER.confirmation) - 1) & 0xffff;
  ram.setU16(WHITE_VERSION_CHOOSER.confirmation, confirmation);
  if (confirmation === 0) {
    callChooser(ctx, 'clearGraphics', WHITE_VERSION_CHOOSER_CALLS.clearGraphics, ram);
    callChooser(ctx, 'clearSlots', WHITE_VERSION_CHOOSER_CALLS.clearSlots, ram);
    camReset140E5C(ram);
    const selection = ram.u16(WHITE_VERSION_CHOOSER.selection);
    ram.setU16(WHITE_NVRAM.choiceAddress, selection);
    if (selection !== 0) {
      callChooser(ctx, 'blackReset', WHITE_VERSION_CHOOSER.blackReset,
        ram, rom, 0x0700);
      return Object.freeze({
        phase: 'exit', route: 'black', target: WHITE_VERSION_CHOOSER.blackReset,
        interruptMask: 0x0700, selection, made: null,
      });
    }
    const result = finishWhiteVersionChooser13C0E6(ram, rom, profileRequest);
    return Object.freeze({
      phase: 'exit', route: 'white', target: WHITE_CHOOSER.whiteExit,
      interruptMask: null, selection, made: result.made,
    });
  }

  if (confirmation === 1) {
    callChooser(ctx, 'effectDestroy', WHITE_VERSION_CHOOSER_CALLS.effectDestroy,
      ram.u32(WHITE_VERSION_CHOOSER.confirmationHandle), ram);
  }
  drawWhiteChooserNames(ctx, ram, rom);
  if ((confirmation & 0x02) === 0) {
    drawWhiteChooserHighlight(ctx, ram.u16(WHITE_VERSION_CHOOSER.selection), ram, rom);
  }
  drawWhiteChooserCountdown(ram, rom, ctx);
  return Object.freeze({
    phase: 'confirmation', route: null, target: WHITE_VERSION_CHOOSER.entry,
    interruptMask: null, selection: ram.u16(WHITE_VERSION_CHOOSER.selection), made: null,
  });
}

/** One exact control tick of Version A object type `$14` at `$13BEEA`. */
export function whiteVersionChooserTick13BEEA(ram, rom, a5, ctx, profileRequest) {
  requireWhiteBootstrap(profileRequest, 'White Label version chooser');
  assertRam(ram, 'White Label version chooser');
  assertRom(rom, 'White Label version chooser');
  assertRecordAddress(a5, 'White Label version chooser');

  if (ram.u16(a5 + WHITE_VERSION_CHOOSER.constructedField) === 0) {
    initializeWhiteVersionChooser(ram, rom, a5, ctx);
  }

  if (ram.u16(WHITE_VERSION_CHOOSER.mainTimer) !== 0) {
    tickWhiteChooserIntro(ram, ctx);
    drawWhiteChooserActive(ram, rom, ctx);

    const lockout = ram.u16(WHITE_VERSION_CHOOSER.lockout);
    if (lockout !== 0) {
      ram.setU16(WHITE_VERSION_CHOOSER.lockout, (lockout - 1) & 0xffff);
      return Object.freeze({
        phase: 'lockout', route: null, target: WHITE_VERSION_CHOOSER.entry,
        interruptMask: null, selection: ram.u16(WHITE_VERSION_CHOOSER.selection), made: null,
      });
    }

    const mainTimer = (ram.u16(WHITE_VERSION_CHOOSER.mainTimer) - 1) & 0xffff;
    ram.setU16(WHITE_VERSION_CHOOSER.mainTimer, mainTimer);
    if (mainTimer !== 0) {
      drawWhiteChooserCountdown(ram, rom, ctx);
      const input = ram.u16(WHITE_VERSION_CHOOSER.p1Input)
        | ram.u16(WHITE_VERSION_CHOOSER.p2Input);
      ram.setU16(WHITE_VERSION_CHOOSER.combinedInput, input);

      let selection = ram.u16(WHITE_VERSION_CHOOSER.selection);
      if ((input & WHITE_VERSION_CHOOSER.upBit) !== 0) {
        if (selection !== 0) {
          selection = 0;
          ram.setU16(WHITE_VERSION_CHOOSER.selection, selection);
          callChooser(ctx, 'navigationSound', WHITE_VERSION_CHOOSER_CALLS.navigationSound, ram);
        }
      } else if ((input & WHITE_VERSION_CHOOSER.downBit) !== 0 && selection === 0) {
        selection = 1;
        ram.setU16(WHITE_VERSION_CHOOSER.selection, selection);
        callChooser(ctx, 'navigationSound', WHITE_VERSION_CHOOSER_CALLS.navigationSound, ram);
      }
      drawWhiteChooserHighlight(ctx, selection, ram, rom);
      if ((input & WHITE_VERSION_CHOOSER.confirmMask) === 0) {
        return Object.freeze({
          phase: 'selection', route: null, target: WHITE_VERSION_CHOOSER.entry,
          interruptMask: null, selection, made: null,
        });
      }
      ram.setU16(WHITE_VERSION_CHOOSER.mainTimer, 0);
    }
  }

  return tickWhiteChooserConfirmation(ram, rom, ctx, profileRequest);
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
  const remainder = (ram.u8(address) - cost) & 0xff;
  ram.setU8(address, (remainder & 0x80) !== 0 ? 0 : remainder);
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

function noteFrontendCall(ctx, name, site) {
  ctx?.unported?.note(site, `$${site.toString(16).toUpperCase()} White Label ${name} presentation`);
}

function callFrontend(ctx, name, site, ...args) {
  const fn = ctx?.whiteFrontend?.[name];
  if (typeof fn === 'function') return fn(...args, site);
  noteFrontendCall(ctx, name, site);
  return undefined;
}

function tickFrontend(ctx, name, site, ...args) {
  const result = callFrontend(ctx, name, site, ...args);
  return result === undefined ? true : Boolean(result);
}

function clearWhiteTx(ctx) {
  const tx = ctx?.tx ?? ctx?.txvram;
  if (tx) clearTx23C622(tx);
  else noteFrontendCall(ctx, 'TX clear', WHITE_FRONTEND_CALLS.clearTx);
}

function clearWhiteSlotTable(ctx) {
  if (ctx?.slotTable) clearSlotTable23C668(ctx.slotTable);
  else noteFrontendCall(ctx, 'slot-table clear', WHITE_FRONTEND_CALLS.clearSlotTable);
}

function installWhiteTextPalette(ram, rom, ctx, source, site, label) {
  if (!ctx?.palette) {
    noteFrontendCall(ctx, `${label} palette install`, site);
    return false;
  }
  if (typeof rom.bytes !== 'function') {
    throw new TypeError(`${label} palette installation needs ROM byte windows`);
  }
  install2414BE(ram, ctx.palette, 0, rom.bytes(source, 32), site, label);
  return true;
}

function soundFrontend(ctx, site) {
  callFrontend(ctx, 'soundCall', site);
}

/** `$159CFA`: construct one Version A type-8 record and recover its staged state. */
export function whiteFrontendInit159CFA(ram, a5, ctx, profileRequest) {
  requireWhiteBootstrap(profileRequest, 'White Label frontend construction');
  assertRam(ram, 'White Label frontend construction');
  assertRecordAddress(a5, 'White Label frontend construction');

  ram.setU8(a5 + WHITE_FRONTEND.constructedField, 1);
  setWhiteFrontendState159BB0(
    ram, a5, ram.u16(a5 + WHITE_FRONTEND.parameterField), profileRequest,
  );
  ram.setU8(WHITE_FRONTEND.joinMaskAddress, 0);
  ram.setU16(WHITE_FRONTEND.blinkAddress, 0);
  clearWhiteSlotTable(ctx);
  clearWhiteHardware13C814(ram);
  return Object.freeze({ state: ram.u16(WHITE_FRONTEND.stateAddress) });
}

/** `$159C0C`: replace the current frontend object with the native credit screen. */
export function whiteCoinTeardown159C0C(ram, rom, ctx, profileRequest) {
  requireWhiteBootstrap(profileRequest, 'White Label credit teardown');
  assertRam(ram, 'White Label credit teardown');
  assertRom(rom, 'White Label credit teardown');

  objTableInit1413B6(ram);
  clear1459FA(ram);
  clearWhiteSelectorFrontend15B8F2(ram);
  if (ram.u16(WHITE_FRONTEND.demoFlagAddress) !== 0) {
    ram.setU16(WHITE_FRONTEND.demoFlagAddress, 0);
    soundFrontend(ctx, WHITE_FRONTEND_CALLS.soundStop);
    soundFrontend(ctx, WHITE_FRONTEND_CALLS.soundDrain);
  }
  if (ram.u16(WHITE_FRONTEND.stateAddress) === 0x0c) {
    soundFrontend(ctx, WHITE_FRONTEND_CALLS.soundStop);
    soundFrontend(ctx, WHITE_FRONTEND_CALLS.soundDrain);
  }
  installWhiteTextPalette(ram, rom, ctx, WHITE_FRONTEND.txPaletteMain,
    0x159c5a, 'White Label credit screen text');
  clearWhiteTx(ctx);
  const made = stageType(ram, rom, WHITE_CHOOSER.screenType);
  ram.setU16(made.addr + WHITE_FRONTEND.parameterField, 3);
  return Object.freeze({ made, state: 3 });
}

function teardownWhiteAttract159DFE(ram, rom, ctx) {
  objTableInit1413B6(ram);
  clear1459FA(ram);
  clearWhiteSelectorFrontend15B8F2(ram);
  clearWhiteTx(ctx);
  const made = stageType(ram, rom, WHITE_CHOOSER.screenType);
  ram.setU16(made.addr + WHITE_FRONTEND.parameterField, 2);
  soundFrontend(ctx, WHITE_FRONTEND_CALLS.soundStop);
  return made;
}

function transitionWhiteArm(ram, a5, state, profileRequest) {
  setWhiteFrontendState159BB0(ram, a5, state, profileRequest);
  return state;
}

function whiteArm1(ram, a5, ctx, profileRequest) {
  if (ram.u8(a5 + WHITE_FRONTEND.recordInitedField) === 0) {
    ram.setU8(a5 + WHITE_FRONTEND.recordInitedField, 1);
    clearWhiteTx(ctx);
    callFrontend(ctx, 'screen1Init', WHITE_FRONTEND_CALLS.screen1Init, ram);
  }
  if (!tickFrontend(ctx, 'screen1Tick', WHITE_FRONTEND_CALLS.screen1Tick, ram)) {
    transitionWhiteArm(ram, a5, 5, profileRequest);
  }
}

function whiteArm2(ram, rom, a5, ctx, profileRequest) {
  if (ram.u8(a5 + WHITE_FRONTEND.recordInitedField) === 0) {
    ram.setU8(a5 + WHITE_FRONTEND.recordInitedField, 1);
    clearWhiteTx(ctx);
    installWhiteTextPalette(ram, rom, ctx, WHITE_FRONTEND.txPaletteMain,
      0x159d78, 'White Label high-score text');
    callFrontend(ctx, 'highScoreInit', WHITE_FRONTEND_CALLS.highScoreInit, ram, rom);
  }
  if (!tickFrontend(ctx, 'highScoreTick', WHITE_FRONTEND_CALLS.highScoreTick, ram, rom)) {
    transitionWhiteArm(ram, a5, 0x0c, profileRequest);
  }
}

function whiteArm3(ram, rom, a5, ctx, profileRequest) {
  if (ram.u8(a5 + WHITE_FRONTEND.recordInitedField) === 0) {
    ram.setU8(a5 + WHITE_FRONTEND.recordInitedField, 1);
    clear1459FA(ram);
    callFrontend(ctx, 'screen1Init', WHITE_FRONTEND_CALLS.screen1Init, ram, rom);
    soundFrontend(ctx, WHITE_FRONTEND_CALLS.creditSound);
  }
  callFrontend(ctx, 'creditTick', WHITE_FRONTEND_CALLS.creditTick, ram, rom);
  whiteJoinPoll15A0D8(ram, a5, profileRequest);
}

function whiteArm5(ram, rom, a5, ctx) {
  if (ram.u8(a5 + WHITE_FRONTEND.recordInitedField) === 0) {
    ram.setU8(a5 + WHITE_FRONTEND.recordInitedField, 1);
    callFrontend(ctx, 'screen5Init', WHITE_FRONTEND_CALLS.screen5Init, ram, rom);
    clearWhiteTx(ctx);
    ram.setU16(a5 + WHITE_FRONTEND.parameterField, 0);
    installWhiteTextPalette(ram, rom, ctx, WHITE_FRONTEND.txPaletteWarning,
      0x159dee, 'White Label demo text');
  }
  if (!tickFrontend(ctx, 'screen5Tick', WHITE_FRONTEND_CALLS.screen5Tick, ram, rom)) {
    return teardownWhiteAttract159DFE(ram, rom, ctx);
  }
  return null;
}

function whiteArm9(ram, rom, a5, ctx, profileRequest) {
  if (ram.u8(a5 + WHITE_FRONTEND.recordInitedField) === 0) {
    ram.setU8(a5 + WHITE_FRONTEND.recordInitedField, 1);
    callFrontend(ctx, 'screen9Init', WHITE_FRONTEND_CALLS.screen9Init, ram, rom);
  }
  if (!tickFrontend(ctx, 'screen9Tick', WHITE_FRONTEND_CALLS.screen9Tick, ram, rom)) {
    transitionWhiteArm(ram, a5, 1, profileRequest);
  }
}

function whiteArm12(ram, rom, a5, ctx, profileRequest) {
  if (ram.u8(a5 + WHITE_FRONTEND.recordInitedField) === 0) {
    ram.setU8(a5 + WHITE_FRONTEND.recordInitedField, 1);
    callFrontend(ctx, 'screen12Init', WHITE_FRONTEND_CALLS.screen12Init, ram, rom);
  }
  if (!tickFrontend(ctx, 'screen12Tick', WHITE_FRONTEND_CALLS.screen12Tick, ram, rom)) {
    transitionWhiteArm(ram, a5, 9, profileRequest);
  }
}

/** `$15A022`: initialize and advance the exact Version A warning timer and text cursor. */
export function whiteWarningTick15A022(ram, rom, a5, ctx, profileRequest) {
  requireWhiteBootstrap(profileRequest, 'White Label warning screen');
  assertRam(ram, 'White Label warning screen');
  assertRom(rom, 'White Label warning screen');
  assertRecordAddress(a5, 'White Label warning screen');

  if (ram.u8(a5 + WHITE_FRONTEND.recordInitedField) === 0) {
    ram.setU8(a5 + WHITE_FRONTEND.recordInitedField, 1);
    clearWhiteTx(ctx);
    installWhiteTextPalette(ram, rom, ctx, WHITE_FRONTEND.txPaletteWarning,
      0x15a03c, 'White Label warning text');
    ram.setU16(a5 + WHITE_FRONTEND.cursorField, 0);
    ram.setU16(a5 + WHITE_FRONTEND.yField, WHITE_FRONTEND.warningY);
    ram.setU16(a5 + WHITE_FRONTEND.delayField, WHITE_FRONTEND.warningDelay);
    ram.setU16(a5 + WHITE_FRONTEND.parameterField, WHITE_FRONTEND.warningTimeout);
    camReset140E5C(ram);
    return Object.freeze({ initialized: true, transitioned: false });
  }

  const cursor = ram.u16(a5 + WHITE_FRONTEND.cursorField);
  if (cursor !== WHITE_FRONTEND.warningEnd) {
    const delay = ram.u16(a5 + WHITE_FRONTEND.delayField);
    if (delay === 0 || ((delay - 1) & 0xffff) === 0) {
      if (delay !== 0) ram.setU16(a5 + WHITE_FRONTEND.delayField, 0);
      callFrontend(ctx, 'warningEmit', WHITE_FRONTEND_CALLS.warningEmit,
        WHITE_FRONTEND.warningData + cursor,
        ram.u16(a5 + WHITE_FRONTEND.yField), 0, 0, ram, rom);
      ram.setU16(a5 + WHITE_FRONTEND.yField,
        (ram.u16(a5 + WHITE_FRONTEND.yField) - WHITE_FRONTEND.warningYStep) & 0xffff);
      ram.setU16(a5 + WHITE_FRONTEND.cursorField,
        (cursor + WHITE_FRONTEND.warningStep) & 0xffff);
    } else {
      ram.setU16(a5 + WHITE_FRONTEND.delayField, (delay - 1) & 0xffff);
    }
  }

  let transitioned = false;
  const timeout = ram.u16(a5 + WHITE_FRONTEND.parameterField);
  if (timeout !== 0) {
    const next = (timeout - 1) & 0xffff;
    ram.setU16(a5 + WHITE_FRONTEND.parameterField, next);
    if (next === 0) {
      transitionWhiteArm(ram, a5, 2, profileRequest);
      clearWhiteTx(ctx);
      transitioned = true;
    }
  }
  return Object.freeze({ initialized: false, transitioned });
}

function whiteFrontendTail(ram, rom, a5, ctx, profileRequest) {
  if (ram.u16(WHITE_FRONTEND.stateAddress) !== WHITE_CHOOSER.screenState) {
    ram.setU16(WHITE_FRONTEND.blinkAddress,
      (ram.u16(WHITE_FRONTEND.blinkAddress) + 1) & 0xffff);
    if ((ram.u16(WHITE_FRONTEND.blinkAddress) & WHITE_FRONTEND.blinkMask) !== 0) {
      callFrontend(ctx, 'blinkOn', WHITE_FRONTEND_CALLS.blinkOn, ram, rom);
    } else {
      callFrontend(ctx, 'blinkOff', WHITE_FRONTEND_CALLS.blinkOff, ram, rom);
    }
    callFrontend(ctx, 'creditLine', WHITE_FRONTEND_CALLS.creditLine, ram, rom);
  }

  const state = ram.u16(WHITE_FRONTEND.stateAddress);
  let made = null;
  switch (state) {
    case 0: whiteFrontendInit159CFA(ram, a5, ctx, profileRequest); break;
    case 1: whiteArm1(ram, a5, ctx, profileRequest); break;
    case 2: whiteArm2(ram, rom, a5, ctx, profileRequest); break;
    case 3: whiteArm3(ram, rom, a5, ctx, profileRequest); break;
    case 4: case 6: case 7: case 8: case 10: case 11: break;
    case 5: made = whiteArm5(ram, rom, a5, ctx); break;
    case 9: whiteArm9(ram, rom, a5, ctx, profileRequest); break;
    case 12: whiteArm12(ram, rom, a5, ctx, profileRequest); break;
    case 13: whiteWarningTick15A022(ram, rom, a5, ctx, profileRequest); break;
    case 14: made = handoffWhiteSelector15A0BE(ram, rom, profileRequest).made; break;
    case 15:
      whiteFrontendInit159CFA(ram, a5, ctx, profileRequest);
      break;
    default:
      ctx?.unported?.note(0x159cbe + state * 4,
        `Version A type 8 state $${state.toString(16).toUpperCase()} enters outside its jump table`);
      break;
  }
  const target = state === 15
    ? WHITE_FRONTEND_ARM_TARGETS[0]
    : WHITE_FRONTEND_ARM_TARGETS[state] ?? null;
  return Object.freeze({ state, target, made });
}

/** One exact control tick of Version A object dispatch type 8 at `$159BBC`. */
export function whiteFrontendTick159BBC(ram, rom, a5, ctx, profileRequest) {
  requireWhiteBootstrap(profileRequest, 'White Label type 8 frontend');
  assertRam(ram, 'White Label type 8 frontend');
  assertRom(rom, 'White Label type 8 frontend');
  assertRecordAddress(a5, 'White Label type 8 frontend');

  if (ram.u8(a5 + WHITE_FRONTEND.constructedField) === 0) {
    const initialized = whiteFrontendInit159CFA(ram, a5, ctx, profileRequest);
    return Object.freeze({ branch: 'construct', state: initialized.state, made: null });
  }

  const staleState = ram.u16(WHITE_FRONTEND.stateAddress);
  if (![14, 3, 13].includes(staleState)) {
    if (ram.u8(WHITE_FRONTEND.dipAddress) === WHITE_FRONTEND.freePlay) {
      whiteJoinPoll15A0D8(ram, a5, profileRequest);
    }
    const coins = whiteCoinCounts13CCC2(ram, profileRequest);
    if (coins[0] + coins[1] !== 0) {
      const teardown = whiteCoinTeardown159C0C(ram, rom, ctx, profileRequest);
      return Object.freeze({ branch: 'coin', staleState, made: teardown.made });
    }
    const credits = whiteCreditCounts13CC9E(ram, profileRequest);
    if (credits[0] + credits[1] !== 0) {
      const teardown = whiteCoinTeardown159C0C(ram, rom, ctx, profileRequest);
      return Object.freeze({ branch: 'credit', staleState, made: teardown.made });
    }
  }

  const tail = whiteFrontendTail(ram, rom, a5, ctx, profileRequest);
  return Object.freeze({ branch: 'tail', staleState, ...tail });
}
