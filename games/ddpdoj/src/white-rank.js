// Embedded Version A rank frontend and Stage 1 player handoff.

import {
  scoreDrainInit287084, setPanelBody1528C4, slideArm287A5E, txPrint240DC2,
} from './hud.js';
import { clearRankRam2603DA } from './objslot12.js';
import { ALLOC, queueKill, stageCreate } from './objalloc.js';
import { install2414BE, install24150A } from './palette.js';
import { armRequest25FF38 } from './player.js';
import { resolveGameProfile, WHITE_LABEL_PROFILE } from './profiles.js';
import { requireRuntimeCapability, resolveGameRuntime } from './runtime-profile.js';
import { wipeStageBlock25FD24 } from './stageend.js';
import { liveSides25FD94 } from './tally.js';
import { u16 } from './ram.js';

const freezeRows = (rows) => Object.freeze(rows.map((row) => Object.freeze(row)));

export const WHITE_RANK = Object.freeze({
  handler: 0x15fae8,
  init: 0x15f922,
  stateAt: 0x02,
  stageAt: 0x04,
  dispatch: 0x141294,
  records: 0x8130fa,
  recordStride: 0x24,
  recordsTable: 0x15f190,
  recordsTableStride: 0x10,
  requestTable: 0x15f2c0,
  requestDispatcher: 0x15f2e8,
  request4: 0x15f562,
  request9: 0x15f70a,
  setItemTable: 0x152aee,
  livesTable: 0x15f43c,
  stagePair: 0x15f758,
  stageStart: 0x15f8da,
  stageInstall: 0x15f874,
  handoff: 0x15fa60,
  savedSelections: 0x15ccfe,
  selectionRecords: 0x15e7cc,
  gate: 0x813082,
  stage: 0x813092,
  stageX2: 0x813094,
  stageX4: 0x813096,
  loop: 0x813098,
  playerMode: 0x813099,
  shipP1: 0x813084,
  shipP2: 0x813086,
  styleP1: 0x813088,
  styleP2: 0x81308a,
  rankBase: 0x81315c,
  rankConfig: 0x813160,
  stageWordD7: 0x81307e,
  stageWordD6: 0x813080,
  idType1: 0x813144,
  idType5: 0x813148,
  idType0: 0x81314c,
  idType4P1: 0x813150,
  idType4P2: 0x813154,
  savedP1: 0x813008,
  savedP2: 0x813018,
  forcedMode: 0x803926,
  dipLives: 0x80380e,
  selectVisuals: 0x813028,
  selectVisualStride: 0x24,
  selectVisualTable: 0x15ebd6,
  selectVisualSeed: 0x15eb30,
  stagePaletteTable: 0x14194a,
  rankWordTable: 0x15fbea,
  rankPointerTable: 0x15fbda,
});

export const WHITE_RANK_INIT_TX = freezeRows([
  [0x15f930, 0, 0x122638], [0x15f93e, 1, 0x122658],
  [0x15f94c, 2, 0x122678], [0x15f95a, 3, 0x122698],
  [0x15f968, 4, 0x1226b8], [0x15f976, 5, 0x1226d8],
  [0x15f984, 6, 0x122778], [0x15f992, 7, 0x122798],
  [0x15f9a0, 8, 0x1227b8], [0x15f9ae, 0x0b, 0x1227d8],
]);

export const WHITE_PLAYER_PALETTES = Object.freeze([
  Object.freeze({ spr: freezeRows([[0, 0x122878], [2, 0x122978], [4, 0x1229f8]]),
    tx: Object.freeze([9, 0x1226f8]) }),
  Object.freeze({ spr: freezeRows([[0, 0x1228b8], [2, 0x1229b8], [4, 0x122a38]]),
    tx: Object.freeze([9, 0x122738]) }),
  Object.freeze({ spr: freezeRows([[1, 0x1228f8], [3, 0x122978], [4, 0x1229f8]]),
    tx: Object.freeze([0x0a, 0x122718]) }),
  Object.freeze({ spr: freezeRows([[1, 0x122938], [3, 0x1229b8], [4, 0x122a38]]),
    tx: Object.freeze([0x0a, 0x122758]) }),
]);

const REQUEST9_SIDES = Object.freeze([
  Object.freeze({ player: 0x8103e6, hyperStock: 0x81b65c, bonus: 0x8128f4,
    target: 0x81040b, d1: 0x0100 }),
  Object.freeze({ player: 0x810448, hyperStock: 0x81b65e, bonus: 0x812902,
    target: 0x81046d, d1: 0x0f00 }),
]);

const note = (ctx, site, text) => (ctx?.unportedLog ?? ctx?.unported)?.note(site, text);
const hex = (value) => `$${value.toString(16).toUpperCase()}`;

function requireWhiteRank(profileRequest, operation) {
  const profile = resolveGameProfile(profileRequest === undefined
    ? WHITE_LABEL_PROFILE
    : profileRequest);
  const runtime = resolveGameRuntime(profile);
  requireRuntimeCapability(runtime, 'frontendBootstrap', operation);
  return profile;
}

function priority(rom, type) {
  return rom.u16(WHITE_RANK.dispatch + type * 8 + 4);
}

function createdId(ram, made, ctx, site, target) {
  if (made.ok) return ram.u32(made.addr + ALLOC.idOff);
  note(ctx, site, `${hex(site)} stores allocator D0 = 0 at ${hex(target)} after the `
    + 'Version A create queue filled');
  return 0;
}

function installTx(ram, rom, ctx, site, bank, source, why) {
  if (ctx?.palette) {
    install2414BE(ram, ctx.palette, bank, rom.bytes(source, 32), site, why);
  } else if (typeof ctx?.installPalette === 'function') {
    ctx.installPalette(bank, rom.bytes(source, 32), source, 32);
  } else {
    note(ctx, site, `${hex(site)} installs Version A text bank ${bank} from ${hex(source)} `
      + 'with no palette sink');
  }
}

function installSpr(ram, rom, ctx, site, bank, source, why) {
  if (ctx?.palette) {
    install24150A(ram, ctx.palette, bank, rom.bytes(source, 64), site, why);
  } else if (typeof ctx?.installPalette === 'function') {
    ctx.installPalette(bank, rom.bytes(source, 64), source, 64);
  } else {
    note(ctx, site, `${hex(site)} installs Version A sprite bank ${bank} from ${hex(source)} `
      + 'with no palette sink');
  }
}

/** `$15F734`: A's address for the shared 102-word rank clear. */
export function clearWhiteRank15F734(ram) {
  clearRankRam2603DA(ram);
}

/** `$15F07A`: write the native stage, stage-times-two, and stage-times-four words. */
export function writeWhiteStage15F07A(ram, stage) {
  ram.setU16(WHITE_RANK.stage, u16(stage));
  ram.setU16(WHITE_RANK.stageX2, u16(stage * 2));
  ram.setU16(WHITE_RANK.stageX4, u16(stage * 4));
}

/** `$15F1B0`: build both player request records and their three frontend children. */
export function playerRecords15F1B0(ram, rom, ctx) {
  const wordPairs = [[0x00, 0x0c], [0x02, 0x0e], [0x04, 0x10],
    [0x06, 0x12], [0x08, 0x14], [0x0a, 0x16]];
  for (let side = 0; side < 2; side++) {
    const src = WHITE_RANK.recordsTable + side * WHITE_RANK.recordsTableStride;
    const dst = WHITE_RANK.records + side * WHITE_RANK.recordStride;
    for (const [from, to] of wordPairs) ram.setU16(dst + to, rom.u16(src + from));
    ram.setU32(dst + 0x08, rom.u32(src + 0x0c));
    for (const offset of [0x18, 0x1c, 0x04, 0x20]) ram.setU32(dst + offset, 0);
  }

  const specs = [[0, WHITE_RANK.idType0, 0x15f21a],
    [4, WHITE_RANK.idType4P1, 0x15f22a],
    [4, WHITE_RANK.idType4P2, 0x15f240]];
  const made = [];
  for (const [type, target, site] of specs) {
    const record = stageCreate(ram, type, (t) => priority(rom, t));
    ram.setU32(target, createdId(ram, record, ctx, site, target));
    made.push(record);
  }
  ram.setU8(made[1].addr + 0x07, 0);
  ram.setU8(made[2].addr + 0x07, 1);
  return Object.freeze(made);
}

function mappedChoice(value, values) {
  const index = values.indexOf(value & 0xffff);
  return index < 0 ? value & 0xff : index;
}

/** `$15CCFE`: persist joined ship and style values as native cursor indexes. */
export function savedSelections15CCFE(ram, d0, d1, d2, d3) {
  const values = [[d0, d2], [d1, d3]];
  const targets = [WHITE_RANK.savedP1, WHITE_RANK.savedP2];
  for (let side = 0; side < 2; side++) {
    const target = targets[side];
    ram.setU8(target, 0xff);
    ram.setU8(target + 1, 0xff);
    const [ship, style] = values[side];
    if ((ship & 0xffff) === 0x00ff) continue;
    ram.setU8(target, mappedChoice(ship, [0, 2]));
    ram.setU8(target + 1, mappedChoice(style, [2, 4, 6]));
  }
  return Object.freeze({
    p1: Object.freeze([ram.u8(WHITE_RANK.savedP1), ram.u8(WHITE_RANK.savedP1 + 1)]),
    p2: Object.freeze([ram.u8(WHITE_RANK.savedP2), ram.u8(WHITE_RANK.savedP2 + 1)]),
  });
}

/** `$15E7CC`: seed the two selector-presentation records from the chosen styles. */
export function selectionRecords15E7CC(ram, rom, a5) {
  const active = [];
  for (let side = 0; side < 2; side++) {
    const choice = ram.u8(a5 + 0x04 + side);
    if ((choice & 0x80) !== 0) continue;
    const record = WHITE_RANK.selectVisuals + side * WHITE_RANK.selectVisualStride;
    const row = WHITE_RANK.selectVisualTable + u16(choice - 2) * 4;
    ram.setU32(record + 0x18, rom.u32(row));
    ram.setU32(record + 0x0e, rom.u32(row + 4));
    ram.bset8(record, 0);
    ram.setU16(record + 0x12, 0x17 + side);
    ram.setU16(record + 0x04, side === 0 ? 0x5e00 : 0x1200);
    ram.setU16(record + 0x06, 0x1c00);
    ram.setU16(record + 0x02, rom.u16(WHITE_RANK.selectVisualSeed));
    ram.setU16(record + 0x14, rom.u16(WHITE_RANK.selectVisualSeed + 2));
    const repeated = rom.u16(WHITE_RANK.selectVisualSeed + 4);
    for (const offset of [0x1c, 0x1e, 0x20, 0x22]) ram.setU16(record + offset, repeated);
    active.push(side);
  }
  return Object.freeze(active);
}

/** `$15F2A6`: A's address for the shared two-record request arm. */
export function armWhiteRequest15F2A6(ram, side, request) {
  return armRequest25FF38(ram, side, request);
}

/** `$15F758`: arm request 4 for joined sides and absent-side markers for the rest. */
export function stagePair15F758(ram, rom, ctx, d0, d1) {
  const positions = [d0, d1];
  const gates = [WHITE_RANK.shipP1, WHITE_RANK.shipP2];
  const made = [];
  for (let side = 0; side < 2; side++) {
    const record = WHITE_RANK.records + side * WHITE_RANK.recordStride;
    if ((positions[side] | 0) >= 0) ram.setU32(record + 0x10, positions[side] >>> 0);
    if (ram.u16(gates[side]) !== 0x00ff) {
      armWhiteRequest15F2A6(ram, side, 4);
      if (ram.u16(WHITE_RANK.loop) === 0) scoreDrainInit287084(ram, side);
      continue;
    }
    const absent = stageCreate(ram, 0x0b, (type) => priority(rom, type));
    ram.setU32(record + 0x1c,
      createdId(ram, absent, ctx, side === 0 ? 0x15f7b0 : 0x15f7ee,
        record + 0x1c));
    ram.setU8(absent.addr + 0x07, side);
    made.push(absent);
  }
  slideArm287A5E(ram);
  return Object.freeze({ made: Object.freeze(made), requests: Object.freeze([
    ram.u16(WHITE_RANK.records),
    ram.u16(WHITE_RANK.records + WHITE_RANK.recordStride),
  ]) });
}

function installWhitePlayerPalettes(ram, rom, ctx, side) {
  const ship = ram.u16(side === 0 ? WHITE_RANK.shipP1 : WHITE_RANK.shipP2);
  const arm = (side === 0 ? 0 : 2) + (ship === 0 ? 0 : 1);
  const spec = WHITE_PLAYER_PALETTES[arm];
  for (const [bank, source] of spec.spr) {
    installSpr(ram, rom, ctx, 0x1419c2, bank, source,
      `the Version A player palette arm ${arm}`);
  }
  installTx(ram, rom, ctx, 0x1419c2, spec.tx[0], spec.tx[1],
    `the Version A player palette arm ${arm}`);
  return arm;
}

function extendInit185AE4(ram, rom, side) {
  const offset = u16(ram.u8(0x80380d) * 4);
  ram.setU32(side === 0 ? 0x81b4ac : 0x81b4b0, rom.u32(0x186f3c + offset));
  ram.setU16(side === 0 ? 0x81b4b4 : 0x81b4b6, offset);
}

function announce15FE0A(ram, side) {
  const record = side === 0 ? 0x813162 : 0x813166;
  ram.setU16(record, 1);
  ram.setU16(record + 2, 8);
}

/** `$15F562`: consume request 4 and stage the selected Version A player. */
export function request4Player15F562(ram, rom, ctx, record) {
  const lives = ram.u32(record + 0x08);
  const dipOffset = u16(ram.u8(WHITE_RANK.dipLives) * 2);
  ram.setU16(lives, rom.u16(WHITE_RANK.livesTable + dipOffset));
  if (ram.u16(WHITE_RANK.loop) !== 0) ram.setU16(lives, 0);

  const type = ram.u16(record + 0x14);
  const made = stageCreate(ram, type, (t) => priority(rom, t));
  ram.setU32(record + 0x18,
    createdId(ram, made, ctx, 0x15f58e, record + 0x18));
  ram.setU8(made.addr + 0x06, ram.u8(WHITE_RANK.playerMode));
  const side = ram.u8(record + 0x17);
  ram.setU8(made.addr + 0x07, side);
  ram.setU16(made.addr + 0x08, ram.u16(record + 0x10));
  ram.setU16(made.addr + 0x0a, ram.u16(record + 0x12));
  const paletteArm = installWhitePlayerPalettes(ram, rom, ctx, side);
  if (ram.u16(WHITE_RANK.loop) === 0) extendInit185AE4(ram, rom, side);
  announce15FE0A(ram, side);
  ram.setU16(record, 0);
  ram.setU16(record + 2, 0);
  liveSides25FD94(ram);
  return Object.freeze({ made, side, type, paletteArm, lives: ram.u16(lives) });
}

/** `$15F70A`: consume request 9 and redraw one side's SET/bonus presentation. */
export function request9Panel15F70A(ram, rom, record) {
  const side = ram.u8(record + 0x17) === 0 ? 0 : 1;
  const spec = REQUEST9_SIDES[side];
  const drawSetItem = ram.u16(spec.hyperStock) !== 0
    || (ram.btst8(spec.player, 6) === 0 && ram.u16(spec.bonus) !== 0);
  const panel = setPanelBody1528C4(ram, side, spec.player);
  let item = null;
  if (drawSetItem) {
    const target = ram.u8(spec.target);
    const tile = rom.u32(WHITE_RANK.setItemTable + ((target - 1) << 2));
    txPrint240DC2(ram, 8, spec.d1, 2, 0x0b, tile);
    item = Object.freeze({ target, tile });
  }
  ram.setU16(record, 0);
  ram.setU16(record + 2, 0);
  return Object.freeze({ side, panel: Object.freeze(panel), item });
}

/** `$15F2E8`: walk both request records and dispatch the ported Stage 1 arms. */
export function dispatchRequests15F2E8(ram, rom, ctx) {
  const out = [];
  for (let side = 0; side < 2; side++) {
    const record = WHITE_RANK.records + side * WHITE_RANK.recordStride;
    const request = ram.u16(record);
    if (request === 0) continue;
    if (request === 4) {
      out.push(request4Player15F562(ram, rom, ctx, record));
      continue;
    }
    if (request === 9) {
      out.push(request9Panel15F70A(ram, rom, record));
      continue;
    }
    const target = rom.u32(WHITE_RANK.requestTable + request * 4);
    note(ctx, WHITE_RANK.requestDispatcher, `Version A request ${request} selects ${hex(target)} `
      + `from ${hex(WHITE_RANK.requestTable)}; only requests 4 and 9 are ported here`);
  }
  return Object.freeze(out);
}

function stageClear15F84E(ram) {
  queueKill(ram, ram.u32(WHITE_RANK.idType5));
  queueKill(ram, ram.u32(WHITE_RANK.idType1));
  if (ram.u16(WHITE_RANK.stageWordD6) === 0) return;
  for (const offset of [0x18, 0x1c, 0x20]) {
    queueKill(ram, ram.u32(WHITE_RANK.records + offset));
    queueKill(ram, ram.u32(WHITE_RANK.records + WHITE_RANK.recordStride + offset));
  }
}

function stagePaletteWalk14198E(ram, rom, ctx) {
  let lists = rom.u32(WHITE_RANK.stagePaletteTable + ram.u16(WHITE_RANK.stageX4));
  let installed = 0;
  for (;;) {
    const list = rom.u32(lists);
    lists += 4;
    if (list === 0xffffffff) break;
    for (let row = list; rom.u16(row) !== 0xffff; row += 8) {
      installSpr(ram, rom, ctx, 0x14198e, rom.u16(row), rom.u32(row + 4),
        'the Version A per-stage palette walk');
      installed++;
    }
  }
  return installed;
}

function installRankBase15FBF2(ram, rom) {
  let index = ram.u8(0x80380c);
  if (ram.u16(WHITE_RANK.forcedMode) !== 0) index = 1;
  const x2 = u16(index * 2);
  ram.setU16(WHITE_RANK.rankConfig, rom.u16(WHITE_RANK.rankWordTable + x2));
  ram.setU32(WHITE_RANK.rankBase, rom.u32(WHITE_RANK.rankPointerTable + u16(x2 * 2)));
}

function stageInstall15F874(ram, rom, ctx) {
  const five = stageCreate(ram, 5, (type) => priority(rom, type));
  ram.setU32(WHITE_RANK.idType5,
    createdId(ram, five, ctx, 0x15f87e, WHITE_RANK.idType5));
  const one = stageCreate(ram, 1, (type) => priority(rom, type));
  ram.setU32(WHITE_RANK.idType1,
    createdId(ram, one, ctx, 0x15f88e, WHITE_RANK.idType1));
  ram.setU16(one.addr + 0x06, ram.u16(WHITE_RANK.stageWordD7));
  if (ram.u16(WHITE_RANK.stageWordD6) !== 0) {
    stagePair15F758(ram, rom, ctx, 0x10000e00, 0x10002a00);
    ram.setU16(WHITE_RANK.stageWordD6, 0);
  }
  installTx(ram, rom, ctx, 0x15f8c6, 0, 0x122618, 'the Version A stage install');
  const palettes = stagePaletteWalk14198E(ram, rom, ctx);
  installRankBase15FBF2(ram, rom);
  return Object.freeze({ five, one, palettes });
}

/** `$15F8DA`: install Stage 1 state, children, palettes, and pending requests. */
export function stageStart15F8DA(ram, rom, ctx, d6, d7) {
  ram.setU16(0x81296e, 0);
  ram.setU16(WHITE_RANK.stageWordD7, u16(d7));
  ram.setU16(WHITE_RANK.stageWordD6, u16(d6));
  stageClear15F84E(ram);
  wipeStageBlock25FD24(ram);
  const installed = stageInstall15F874(ram, rom, ctx);
  const requests = dispatchRequests15F2E8(ram, rom, ctx);
  return Object.freeze({ installed, requests });
}

/** `$15FA60`: one-shot selector handoff into the Version A Stage 1 start. */
export function handoff15FA60(ram, rom, ctx, d0, d1, d2, d3, d4) {
  if (ram.u16(WHITE_RANK.gate) === 0) return Object.freeze({ ran: false });
  ram.setU16(WHITE_RANK.gate, 0);
  ram.setU16(WHITE_RANK.shipP1, u16(d0));
  ram.setU16(WHITE_RANK.styleP1, u16(d1));
  ram.setU16(WHITE_RANK.shipP2, u16(d2));
  ram.setU16(WHITE_RANK.styleP2, u16(d3));
  ram.setU16(WHITE_RANK.stageWordD6, u16(d4));
  const saved = savedSelections15CCFE(ram,
    ram.u16(WHITE_RANK.shipP1), ram.u16(WHITE_RANK.shipP2),
    ram.u16(WHITE_RANK.styleP1), ram.u16(WHITE_RANK.styleP2));
  const d7 = ram.u16(WHITE_RANK.forcedMode) !== 0 && ram.u16(WHITE_RANK.stage) === 0
    ? 0x38 : 0;
  const started = stageStart15F8DA(ram, rom, ctx, ram.u16(WHITE_RANK.stageWordD6), d7);
  return Object.freeze({ ran: true, saved, d7, started });
}

function rankInit15F922(ram, rom, a5, ctx) {
  ram.setU8(a5 + WHITE_RANK.stateAt, 1);
  for (const [site, bank, source] of WHITE_RANK_INIT_TX) {
    installTx(ram, rom, ctx, site, bank, source, 'the Version A rank initialization');
  }
  ram.setU16(WHITE_RANK.stageWordD6, 0);
  ram.setU16(WHITE_RANK.gate, 1);
  if (ram.u16(WHITE_RANK.loop) === 0) {
    clearWhiteRank15F734(ram);
  } else {
    ram.setU16(0x8130be, 0xffff);
    ram.setU16(0x8130c0, 0xffff);
    ram.setU16(0x813142, 0);
    for (const address of [WHITE_RANK.idType1, WHITE_RANK.idType5, WHITE_RANK.idType0,
      WHITE_RANK.idType4P1, WHITE_RANK.idType4P2]) ram.setU32(address, 0);
  }
  writeWhiteStage15F07A(ram, ram.u16(a5 + WHITE_RANK.stageAt));
  for (const site of [0x18c078, 0x18d718]) {
    note(ctx, site, `${hex(site)} is an explicit Version A rank-init leaf outside the Stage 1 `
      + 'frontend handoff');
  }
  if (ram.u16(WHITE_RANK.loop) === 0) {
    for (const site of [0x17e92e, 0x187020, 0x185b62, 0x149ec4]) {
      note(ctx, site, `${hex(site)} is an explicit Version A loop-1 reset leaf outside the `
        + 'Stage 1 frontend handoff');
    }
  }
  const made = playerRecords15F1B0(ram, rom, ctx);
  note(ctx, 0x1870b2, '$1870B2 initializes Version A Continue presentation after the player records');
  return Object.freeze({ made });
}

/** `$15FAE8`: private Version A type-`$0A` handler through Stage 1 player creation. */
export function whiteRankTick15FAE8(ram, rom, a5, ctx, profileRequest) {
  requireWhiteRank(profileRequest, 'White Label rank frontend tick');
  const state = ram.u8(a5 + WHITE_RANK.stateAt);
  if (state === 0) return Object.freeze({ state, init: rankInit15F922(ram, rom, a5, ctx) });
  if (state === 2) {
    clearWhiteRank15F734(ram);
    queueKill(ram, ram.u32(a5 + ALLOC.idOff));
    return Object.freeze({ state, retired: true });
  }
  const requests = dispatchRequests15F2E8(ram, rom, ctx);
  if (ram.u16(WHITE_RANK.gate) !== 0) return Object.freeze({ state, requests, gated: true });
  return Object.freeze({ state, requests, gated: false });
}
