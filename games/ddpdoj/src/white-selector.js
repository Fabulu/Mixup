// Embedded Version A native ship and style selector.
//
// Every code and ROM root below comes from the Version A program. Shared RAM
// addresses describe the cabinet object model, not a Build B code projection.

import { queueKill, stageCreate } from './objalloc.js';
import { resolveGameProfile, WHITE_LABEL_PROFILE } from './profiles.js';
import { requireRuntimeCapability, resolveGameRuntime } from './runtime-profile.js';
import { u16 } from './ram.js';
import {
  WHITE_CHOOSER, WHITE_FRONTEND, whiteTakeP1Credit13CCFA, whiteTakeP2Credit13CD5C,
} from './white-frontend.js';

const freezeRows = (rows) => Object.freeze(rows.map((row) => Object.freeze(row)));

export const WHITE_SELECTOR = Object.freeze({
  seed: 0x15bc16,
  handler: 0x15be3e,
  killJump: 0x1415cc,
  objectStateAt: 0x02,
  objectBusyAt: 0x03,
  objectMaskAt: 0x04,
  objectChoiceBytes: 6,
  objectExtraAt: 0x0a,
  objectIdAt: 0x4c,
  activeState: 0x01,
  killState: 0x02,
  retiredPhase: 0x08,
  records: 0x812ea0,
  recordStride: 0x70,
  recordCount: 2,
  recordWords: 0x70,
  liveAt: 0x00,
  phaseAt: 0x01,
  shipCursorAt: 0x02,
  styleCursorAt: 0x04,
  timeoutWordAt: 0x2e,
  autoConfirmAt: 0x30,
  timeoutTickAt: 0x31,
  childType: 0x0a,
  childArmAt: 0x04,
  clearSelectRecords: 0x15e7b8,
  selectRecords: 0x813028,
  selectRecordWords: 0x24,
  clearAux: 0x15ede6,
  aux: 0x813070,
  auxWords: 5,
  auxSeed: 0x003c,
  clearFrontend: 0x15b8f2,
  frontend: 0x812e82,
  frontendWords: 15,
  clearHardware: 0x13c814,
  hardwareWords: Object.freeze([0x80392e, 0x803932, 0x803934, 0x803936, 0x803938]),
  dualSoundGate: 0x803926,
  selectFlag: 0x812f82,
  pulseGate: 0x813005,
  recordTailFlag: 0x812f80,
  pulseWord: 0x813006,
  gate: 0x813098,
  clearText: 0x13c98e,
  soundStream: 0x18b65e,
  soundConfirm: 0x18b5ba,
  moveSound: 0x18b220,
  selectSound: 0x18b206,
  retirementSound: 0x18b6c2,
  stagePairSite: 0x15f758,
  phaseHandlers: Object.freeze([0x15c67a, 0x15c776, 0x15c710, 0x15c864,
    0x15c8d4, 0x15c384, 0x15c54e, 0x15c4d8]),
  phaseOrder: Object.freeze([3, 4, 5, 6, 7, 0, 1, 2]),
  shipTable: 0x15c2d4,
  shipChoices: 2,
  styleTable: 0x15c608,
  styleChoices: 3,
  styleOrderTables: Object.freeze([0x15c652, 0x15c658]),
  p1EdgeAddress: 0x803972,
  p2EdgeAddress: 0x803978,
  previousBit: 0x0004,
  nextBit: 0x0008,
  confirmMask: 0x0070,
  copySource: 0x123ff8,
  copyTarget: 0x812f84,
  copyLongs: 16,
  palettes: freezeRows([
    [0x122618, 0x00, 32], [0x122838, 0x02, 64], [0x123c38, 0x18, 64],
    [0x123c78, 0x19, 64], [0x123cb8, 0x1b, 64], [0x123d38, 0x1a, 64],
    [0x123d78, 0x1c, 64], [0x123ff8, 0x12, 64], [0x1240b8, 0x13, 64],
    [0x1241b8, 0x14, 64], [0x1240f8, 0x10, 64], [0x124038, 0x15, 64],
    [0x124178, 0x16, 64], [0x124138, 0x17, 64], [0x124078, 0x11, 64],
  ]),
  recordFields: freezeRows([
    [0x60, 0], [0x62, 0], [0x64, 1], [0x66, 0], [0x68, 0], [0x6a, 2], [0x6c, 0x0140],
  ]),
});

export const WHITE_SELECTOR_PHASE0 = Object.freeze({
  addr: 0x15c384,
  nextPhase: 1,
  coords: freezeRows([[0x1a00, 0xe600], [0x1e40, 0x5200]]),
  repeatedCoordAt: Object.freeze([0x14, 0x1a, 0x20, 0x26]),
  words: freezeRows([[0x0a, 0x0060], [0x0c, 0x0c00], [0x10, 0x0060], [0x12, 0x0c00],
    [0x2e, 0x0599], [0x40, 0x1ac0]]),
  clearBytes: Object.freeze([0x30, 0x34, 0x35]),
  clearWords: Object.freeze([0x36, 0x38, 0x3a, 0x3c, 0x3e, 0x42, 0x44, 0x46,
    0x48, 0x4a, 0x4c, 0x4e, 0x50, 0x52, 0x54]),
  palettes: freezeRows([
    [0x123fb8, 0x18], [0x123f78, 0x19], [0x123f38, 0x1b], [0x123d38, 0x1a],
    [0x123d78, 0x1c], [0x123db8, 0x1d], [0x123df8, 0x1e], [0x123e38, 0x0c],
    [0x123e78, 0x0d], [0x123eb8, 0x0e], [0x123ef8, 0x0f],
  ]),
});

function requireWhiteSelector(profileRequest, operation) {
  const profile = resolveGameProfile(profileRequest === undefined
    ? WHITE_LABEL_PROFILE
    : profileRequest);
  const runtime = resolveGameRuntime(profile);
  requireRuntimeCapability(runtime, 'frontendBootstrap', operation);
}

function assertRam(ram, operation) {
  if (!ram || typeof ram.u8 !== 'function' || typeof ram.u16 !== 'function'
      || typeof ram.u32 !== 'function' || typeof ram.setU8 !== 'function'
      || typeof ram.setU16 !== 'function' || typeof ram.setU32 !== 'function') {
    throw new TypeError(`${operation} needs the DaiOuJou RAM interface`);
  }
}

function assertRom(rom, operation) {
  if (!rom || typeof rom.u16 !== 'function' || typeof rom.u32 !== 'function') {
    throw new TypeError(`${operation} needs the DaiOuJou ROM interface`);
  }
}

function assertObjectAddress(a5, operation) {
  if (!Number.isSafeInteger(a5) || a5 < 0) {
    throw new TypeError(`${operation} needs an object-record address`);
  }
}

function clearWords(ram, base, words) {
  for (let i = 0; i < words; i++) ram.setU16(base + i * 2, 0);
}

function installPalettes(rom, ctx, rows, operation) {
  if (typeof ctx?.installPalette !== 'function') {
    ctx?.unported?.note(operation, 'White Label selector palette installation has no palette sink');
    return;
  }
  if (typeof rom.bytes !== 'function') {
    throw new TypeError('White Label selector palette installation needs ROM byte windows');
  }
  for (const [source, bank, bytes = 64] of rows) {
    ctx.installPalette(bank, rom.bytes(source, bytes), source, bytes);
  }
}

/** `$15BC16`: seed both native `$70` selector records from the type 8 join mask. */
export function seedWhiteSelector15BC16(ram, rom, a5, ctx, profileRequest) {
  requireWhiteSelector(profileRequest, 'White Label selector seed');
  assertRam(ram, 'White Label selector seed');
  assertRom(rom, 'White Label selector seed');
  assertObjectAddress(a5, 'White Label selector seed');
  if (typeof ctx?.installPalette === 'function' && typeof rom.bytes !== 'function') {
    throw new TypeError('White Label selector palette installation needs ROM byte windows');
  }
  const S = WHITE_SELECTOR;

  ram.setU8(a5 + S.objectStateAt, S.activeState);
  clearWords(ram, S.selectRecords, S.selectRecordWords);
  clearWords(ram, S.aux, S.auxWords);
  ram.setU16(S.aux, S.auxSeed);
  ram.setU16(S.aux + 2, 0);
  clearWords(ram, S.frontend, S.frontendWords);
  ram.setU16(S.dualSoundGate, 0);
  for (const address of S.hardwareWords) ram.setU16(address, 0);
  ram.setU16(S.selectFlag, 0);
  ram.setU8(S.pulseGate, 0);
  clearWords(ram, S.records, S.recordWords);

  for (let side = 0; side < S.recordCount; side++) {
    const record = S.records + side * S.recordStride;
    ram.setU8(record + S.liveAt, 0);
    ram.setU8(record + S.phaseAt, 0);
    ram.setU32(record + 0x56, 0xffffffff);
    for (const [offset, value] of S.recordFields) ram.setU16(record + offset, value);
  }
  ram.setU16(S.recordTailFlag, 0);

  const mask = ram.u8(a5 + S.objectMaskAt);
  if (mask === 3) {
    ram.setU8(S.records, 1);
    ram.setU8(S.records + S.recordStride, 1);
  }
  if (mask === 2) ram.setU8(S.records + S.recordStride, 1);
  if (mask === 1) ram.setU8(S.records, 1);

  ram.setU8(a5 + S.objectBusyAt, 0);
  for (let i = 0; i < S.objectChoiceBytes; i++) ram.setU8(a5 + S.objectMaskAt + i, 0xff);
  ram.setU16(a5 + S.objectExtraAt, 0);
  ram.setU16(S.pulseWord, 0);

  ctx?.clearText?.(S.clearText);
  installPalettes(rom, ctx, S.palettes, S.seed);
  const made = stageCreate(ram, S.childType,
    (type) => rom.u16(WHITE_CHOOSER.dispatchTable + type * 8 + 4));
  ram.setU16(made.addr + S.childArmAt, 0);
  ctx?.soundPost?.(S.soundStream);
  ctx?.soundPost?.(S.soundConfirm);
  for (let i = 0; i < S.copyLongs; i++) {
    ram.setU32(S.copyTarget + i * 4, rom.u32(S.copySource + i * 4));
  }

  return Object.freeze({
    mask,
    made,
    live: Object.freeze(Array.from({ length: S.recordCount },
      (_, side) => ram.u8(S.records + side * S.recordStride))),
  });
}

function sideFromIndex(index) {
  if (index !== 0 && index !== 1) throw new RangeError('White Label selector side must be 0 or 1');
  return index;
}

function recordAddress(index) {
  return WHITE_SELECTOR.records + sideFromIndex(index) * WHITE_SELECTOR.recordStride;
}

function edgeInput(ram, side) {
  return ram.u16(side === 0
    ? WHITE_SELECTOR.p1EdgeAddress
    : WHITE_SELECTOR.p2EdgeAddress);
}

function objectByte(a5, side, evenOffset) {
  return a5 + evenOffset + side;
}

function confirmed(ram, record, input) {
  return ram.u8(record + WHITE_SELECTOR.autoConfirmAt) !== 0
    || (input & WHITE_SELECTOR.confirmMask) !== 0;
}

function phase0(ram, rom, record, side, ctx) {
  const P = WHITE_SELECTOR_PHASE0;
  ram.setU16(record + WHITE_SELECTOR.shipCursorAt, 0);
  const [x, y] = P.coords[side];
  ram.setU16(record + 0x0e, x);
  for (const offset of P.repeatedCoordAt) ram.setU16(record + offset, y);
  for (const [offset, value] of P.words) ram.setU16(record + offset, value);
  ram.setU8(record + 0x31, 2);
  for (const offset of P.clearBytes) ram.setU8(record + offset, 0);
  for (const offset of P.clearWords) ram.setU16(record + offset, 0);
  installPalettes(rom, ctx, P.palettes, P.addr);
  ram.setU8(record + WHITE_SELECTOR.phaseAt, P.nextPhase);
}

function phase1(ram, a5, record, side, ctx) {
  const input = edgeInput(ram, side);
  if ((input & WHITE_SELECTOR.previousBit) !== 0) {
    const before = ram.u16(record + WHITE_SELECTOR.shipCursorAt);
    const after = Math.max(0, before - 1);
    ram.setU16(record + WHITE_SELECTOR.shipCursorAt, after);
    if (after !== before) ctx?.soundPost?.(WHITE_SELECTOR.moveSound);
  }
  if ((input & WHITE_SELECTOR.nextBit) !== 0) {
    const before = ram.u16(record + WHITE_SELECTOR.shipCursorAt);
    const after = Math.min(WHITE_SELECTOR.shipChoices - 1, before + 1);
    ram.setU16(record + WHITE_SELECTOR.shipCursorAt, after);
    if (after !== before) ctx?.soundPost?.(WHITE_SELECTOR.moveSound);
  }
  ram.bset8(a5 + WHITE_SELECTOR.objectBusyAt, 0);
  ram.bset8(a5 + WHITE_SELECTOR.objectBusyAt, 1);
  if (confirmed(ram, record, input)) {
    ctx?.soundPost?.(WHITE_SELECTOR.selectSound);
    ram.setU8(record + WHITE_SELECTOR.phaseAt, 2);
  }
}

function phase2(ram, rom, a5, record, side, ctx) {
  const index = ram.u8(record + WHITE_SELECTOR.shipCursorAt + 1);
  const value = rom.u16(WHITE_SELECTOR.shipTable + index * 2);
  ram.setU8(objectByte(a5, side, 0x08), value & 0xff);
  ctx?.setPlayerPalette?.(side, ram.u16(record + WHITE_SELECTOR.shipCursorAt));
  ctx?.printShipChoice?.(side, value);
  ram.setU8(record + WHITE_SELECTOR.phaseAt, 3);
}

function pickFreeStyle(rom, side, other) {
  const table = WHITE_SELECTOR.styleOrderTables[side];
  for (let i = 0; i < WHITE_SELECTOR.styleChoices; i++) {
    const value = rom.u16(table + i * 2);
    if (value !== other) return value;
  }
  return rom.u16(table + WHITE_SELECTOR.styleChoices * 2);
}

function phase3(ram, rom, a5, record, side) {
  const other = ram.u8(objectByte(a5, 1 - side, 0x06));
  const initial = (other & 0x80) !== 0
    ? (side === 0 ? 0 : WHITE_SELECTOR.styleChoices - 1)
    : pickFreeStyle(rom, side, other);
  ram.setU16(record + WHITE_SELECTOR.styleCursorAt, initial);
  ram.setU8(objectByte(a5, side, 0x06), ram.u8(record + WHITE_SELECTOR.styleCursorAt + 1));
  for (const [offset, value] of [[0x16, 0x0060], [0x18, 0x0c00], [0x1c, 0x0060],
    [0x1e, 0x0c00], [0x22, 0x0060], [0x24, 0x0c00], [0x2a, 0x00b4], [0x2e, 0x0599]]) {
    ram.setU16(record + offset, value);
  }
  ram.setU8(record + 0x31, 2);
  ram.setU8(record + 0x30, 0);
  ram.setU8(record + WHITE_SELECTOR.phaseAt, 4);
}

function stepStyle(ram, a5, record, side, direction) {
  const other = ram.u8(objectByte(a5, 1 - side, 0x06));
  let value = ram.u16(record + WHITE_SELECTOR.styleCursorAt);
  do {
    value += direction;
    if (value < 0) value = WHITE_SELECTOR.styleChoices - 1;
    if (value >= WHITE_SELECTOR.styleChoices) value = 0;
  } while ((value & 0xff) === other);
  ram.setU16(record + WHITE_SELECTOR.styleCursorAt, value);
}

function phase4(ram, a5, record, side, ctx) {
  const input = edgeInput(ram, side);
  if ((input & WHITE_SELECTOR.previousBit) !== 0) {
    ctx?.soundPost?.(WHITE_SELECTOR.moveSound);
    ram.setU16(record + 0x28, 1);
    stepStyle(ram, a5, record, side, -1);
  }
  if ((input & WHITE_SELECTOR.nextBit) !== 0) {
    ctx?.soundPost?.(WHITE_SELECTOR.moveSound);
    ram.setU16(record + 0x28, 1);
    stepStyle(ram, a5, record, side, 1);
  }
  ram.setU8(objectByte(a5, side, 0x06), ram.u8(record + WHITE_SELECTOR.styleCursorAt + 1));
  ram.bset8(a5 + WHITE_SELECTOR.objectBusyAt, 0);
  ram.bset8(a5 + WHITE_SELECTOR.objectBusyAt, 1);
  if (confirmed(ram, record, input)) {
    ctx?.soundPost?.(WHITE_SELECTOR.selectSound);
    ram.setU8(record + WHITE_SELECTOR.phaseAt, 5);
    ram.setU16(record + WHITE_SELECTOR.timeoutWordAt, 0);
  }
}

function phase5(ram, rom, a5, record, side, ctx) {
  if (ram.u16(WHITE_SELECTOR.gate) === 0) {
    const index = ram.u8(record + WHITE_SELECTOR.styleCursorAt + 1);
    const value = rom.u16(WHITE_SELECTOR.styleTable + index * 2);
    ram.setU8(objectByte(a5, side, 0x04), value & 0xff);
  }
  ctx?.printStyleChoice?.(side, ram.u8(objectByte(a5, side, 0x04)));
  ram.setU8(record + WHITE_SELECTOR.phaseAt, 6);
}

function phase6(ram, record, side, ctx) {
  ctx?.printSideLabels?.(0);
  ctx?.printSideLabels?.(1);
  if (ram.u16(WHITE_SELECTOR.gate) === 0) ctx?.soundPost?.(0x18b5d4);
  for (const offset of [0x32, 0x5a, 0x5e, 0x60]) ram.setU16(record + offset, 0);
  ram.setU8(record + WHITE_SELECTOR.phaseAt, 7);
  ctx?.announceSide?.(side);
  const other = recordAddress(1 - side);
  if (ram.u16(WHITE_SELECTOR.gate) !== 0 || ram.u8(other + WHITE_SELECTOR.liveAt) === 0) {
    ctx?.announceSide?.(1 - side);
  }
}

function phase7(ram, a5, record, side, ctx) {
  const S = WHITE_SELECTOR;
  const other = recordAddress(1 - side);
  ctx?.retirementPresentation?.(side, record, S.phaseHandlers[4]);

  const gate = ram.u16(S.gate);
  const otherLive = ram.u8(other + S.liveAt) !== 0;
  if (gate === 0 && otherLive && ram.u8(other + S.phaseAt) !== 7) {
    ram.bset8(a5 + S.objectBusyAt, 0);
    ram.bset8(a5 + S.objectBusyAt, 1);
    return;
  }
  if (gate === 0 && otherLive && ram.u16(record + 0x5e) === 0) {
    ram.setU16(record + 0x5e, 1);
    ctx?.announceSide?.(1 - side);
  }
  if (ram.u16(S.selectFlag) === 0) {
    ram.setU16(S.selectFlag, 1);
    ctx?.soundPost?.(S.retirementSound);
  }

  const frame = u16(ram.u16(record + 0x32) + 1);
  ram.setU16(record + 0x32, frame);
  if (frame >= 0x00f0) {
    ram.setU8(record + 0x35, 1);
    const travel = ram.u16(record + 0x4a);
    let speed = ram.u16(record + 0x4c);
    if (travel < 0x1800) {
      if (speed < 0x0080) {
        speed = u16(speed + 1);
        ram.setU16(record + 0x4c, speed);
      }
      ram.setU16(record + 0x4a, u16(travel + speed));
    } else if (ram.u16(record + 0x5a) !== 0) {
      ram.setU8(record + S.phaseAt, S.retiredPhase);
      ram.setU8(other + S.phaseAt, S.retiredPhase);
    } else {
      ram.setU16(record + 0x54, 1);
      if (speed !== 0) {
        ram.setU16(record + 0x4a, u16(travel + speed));
        const left = speed - 2;
        ram.setU16(record + 0x4c, u16(left));
        if (left <= 0) {
          ram.setU16(record + 0x4c, 0);
          ram.setU16(record + 0x5a, 1);
          if (ram.u16(S.recordTailFlag) === 0) {
            ram.setU16(S.recordTailFlag, 1);
            const first = side === 0 ? record : other;
            const second = side === 0 ? other : record;
            ctx?.stagePair15F758?.(
              ram.u32(first + 0x56), ram.u32(second + 0x56), S.stagePairSite,
            );
          }
        }
      }
    }
  }

  ram.bset8(a5 + S.objectBusyAt, 0);
  ram.bset8(a5 + S.objectBusyAt, 1);
}

function subtractPackedBcd(value) {
  let low = (value & 0x0f) - 1;
  let high = (value >>> 4) & 0x0f;
  let borrow = false;
  if (low < 0) {
    low += 10;
    high -= 1;
    if (high < 0) {
      high += 10;
      borrow = true;
    }
  }
  return { value: ((high & 0x0f) << 4) | low, borrow };
}

function tickTimeout(ram, record) {
  if (ram.u8(record + WHITE_SELECTOR.phaseAt) >= 7) return;
  const ticks = (ram.u8(record + WHITE_SELECTOR.timeoutTickAt) - 1) & 0xff;
  ram.setU8(record + WHITE_SELECTOR.timeoutTickAt, ticks);
  if (ticks !== 0) return;
  ram.setU8(record + WHITE_SELECTOR.timeoutTickAt, 2);
  if (ram.u16(record + WHITE_SELECTOR.timeoutWordAt) === 0) {
    ram.setU8(record + WHITE_SELECTOR.autoConfirmAt, 1);
    return;
  }
  const result = subtractPackedBcd(ram.u8(record + WHITE_SELECTOR.timeoutWordAt + 1));
  if (result.borrow) {
    ram.setU8(record + WHITE_SELECTOR.timeoutWordAt,
      (ram.u8(record + WHITE_SELECTOR.timeoutWordAt) - 1) & 0xff);
  }
  ram.setU8(record + WHITE_SELECTOR.timeoutWordAt + 1, result.value);
}

function midScreenJoin(ram, record, side, profileRequest) {
  const raw = ram.u16(side === 0 ? WHITE_FRONTEND.p1RawAddress : WHITE_FRONTEND.p2RawAddress);
  if ((raw & WHITE_FRONTEND.startBit) === 0) return false;
  const other = recordAddress(1 - side);
  if (ram.u8(other + WHITE_SELECTOR.liveAt) !== 0
      && ram.u8(other + WHITE_SELECTOR.phaseAt) >= 6) return false;
  const refused = side === 0
    ? whiteTakeP1Credit13CCFA(ram, profileRequest)
    : whiteTakeP2Credit13CD5C(ram, profileRequest);
  if (refused) return false;
  ram.setU8(record + WHITE_SELECTOR.liveAt, 1);
  return true;
}

function walkRecord(ram, rom, a5, record, side, ctx) {
  for (const phase of WHITE_SELECTOR.phaseOrder) {
    if (ram.u8(record + WHITE_SELECTOR.phaseAt) !== phase) continue;
    if (phase === 0) phase0(ram, rom, record, side, ctx);
    if (phase === 1) phase1(ram, a5, record, side, ctx);
    if (phase === 2) phase2(ram, rom, a5, record, side, ctx);
    if (phase === 3) phase3(ram, rom, a5, record, side);
    if (phase === 4) phase4(ram, a5, record, side, ctx);
    if (phase === 5) phase5(ram, rom, a5, record, side, ctx);
    if (phase === 6) phase6(ram, record, side, ctx);
    if (phase === 7) phase7(ram, a5, record, side, ctx);
  }
  tickTimeout(ram, record);
}

/** `$15BE3E`: run the native two-record selector control loop for one frame. */
export function whiteSelectorTick15BE3E(ram, rom, a5, ctx, profileRequest) {
  requireWhiteSelector(profileRequest, 'White Label selector tick');
  assertRam(ram, 'White Label selector tick');
  assertRom(rom, 'White Label selector tick');
  assertObjectAddress(a5, 'White Label selector tick');
  const S = WHITE_SELECTOR;

  const objectState = ram.u8(a5 + S.objectStateAt);
  if (objectState === 0) {
    const seeded = seedWhiteSelector15BC16(ram, rom, a5, ctx, profileRequest);
    return Object.freeze({ seeded, retired: false });
  }
  if (objectState === S.killState) {
    queueKill(ram, ram.u32(a5 + S.objectIdAt));
    return Object.freeze({ seeded: null, retired: true });
  }

  ram.setU8(a5 + S.objectBusyAt, 0);
  const joined = [];
  for (let side = 0; side < S.recordCount; side++) {
    const record = recordAddress(side);
    if (ram.u8(record + S.liveAt) === 0) {
      if (midScreenJoin(ram, record, side, profileRequest)) joined.push(side);
    } else {
      walkRecord(ram, rom, a5, record, side, ctx);
    }
    ctx?.drawRecord?.(side, record);
  }

  let done = 3;
  for (let side = 0; side < S.recordCount; side++) {
    const record = recordAddress(side);
    if (ram.u8(record + S.liveAt) === 0) continue;
    done &= ~(1 << side);
    if (ram.u8(record + S.phaseAt) === S.retiredPhase) done |= 1 << side;
  }
  if (done === 3) ram.setU8(a5 + S.objectStateAt, S.killState);
  ctx?.pulse?.();

  return Object.freeze({
    seeded: null,
    retired: false,
    joined: Object.freeze(joined),
    phases: Object.freeze(Array.from({ length: S.recordCount },
      (_, side) => ram.u8(recordAddress(side) + S.phaseAt))),
    choices: Object.freeze(Array.from({ length: S.recordCount }, (_, side) => Object.freeze({
      ship: ram.u8(objectByte(a5, side, 0x08)),
      style: ram.u8(objectByte(a5, side, 0x04)),
    }))),
  });
}
