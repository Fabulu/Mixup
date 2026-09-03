// Capability-gated Build A type-0 HUD and hyper frame.

import { i16, u16, u32 } from './ram.js';
import { P } from './machine.js';
import { queueKill } from './objalloc.js';
import { enqueueRegisters } from './spritequeue.js';
import {
  armHudSlideWithResources, makeHudObjectWithResources,
} from './hud.js';
import { stepHyperWithResources } from './hyper.js';
import { resolveGameProfile, WHITE_LABEL_PROFILE } from './profiles.js';
import { requireRuntimeCapability, resolveGameRuntime } from './runtime-profile.js';
import { unreached } from './unported.js';

const freezeSide = (side) => Object.freeze(side);

const WHITE_HYPER_RAM = Object.freeze({
  gate: 0x81b6e4,
  arm: 0x81b410,
  mode: 0x81b412,
  chainSeed: 0x81b5b2,
  pause: 0x80392c,
  flags: 0x8130f8,
  drawGate: 0x812970,
  p1: freezeSide({
    who: 1, kind: 0x0c, player: 0x8103e6, set: 0x81040a,
    active: 0x81b63e, gauge: 0x81b642, earn: 0x81b64a,
    power: 0x81b646, level: 0x81b654, req: 0x81b658,
    stock: 0x81b65c, pending: 0x81b6e0, subTick: 0x81b64e,
    trail: 0x81b660,
    flashSprite: 0x81b6f2, endFlash: 0x81b6fa,
    liveFlash: 0x81b6fe, flashTick: 0x81b702, pos: 0x8103e8,
    chain: 0x81b5da, chainMeter: 0x81b5c0,
    chainHold: 0x81b5c2, chainSaved: 0x81b5ca, chainPulse: 0x81b5c8,
  }),
  p2: freezeSide({
    who: 2, kind: 0x14, player: 0x810448, set: 0x81046c,
    active: 0x81b640, gauge: 0x81b644, earn: 0x81b64c,
    power: 0x81b648, level: 0x81b656, req: 0x81b65a,
    stock: 0x81b65e, pending: 0x81b6e2, subTick: 0x81b650,
    trail: 0x81b6a0,
    flashSprite: 0x81b6f6, endFlash: 0x81b6fc,
    liveFlash: 0x81b700, flashTick: 0x81b704, pos: 0x81044a,
    chain: 0x81b604, chainMeter: 0x81b5ea,
    chainHold: 0x81b5ec, chainSaved: 0x81b5f4, chainPulse: 0x81b5f2,
  }),
});

function callBoundary(ram, rom, ctx, kind, target, ownerIndex) {
  const callback = ctx?.whiteHyperHudCallbacks?.[kind];
  if (typeof callback !== 'function') {
    unreached(target, `the White Label ${kind} callback is outside the Stage 1 hyper HUD slice`);
  }
  return callback(ram, rom, ctx, ownerIndex, target);
}

function whiteHyperConversion(ram, rom, ctx, h, p2, resources) {
  const ownerIndex = p2 ? 1 : 0;
  callBoundary(ram, rom, ctx, 'conversion', resources.callbacks.conversion[ownerIndex], ownerIndex);
  ctx?.hyperEvent?.('activate', h.who, ram.u16(h.level));
}

function whiteHyperEndReset(ram, rom, ctx, _h, p2, resources) {
  const ownerIndex = p2 ? 1 : 0;
  return callBoundary(
    ram, rom, ctx, 'endReset', resources.callbacks.endReset[ownerIndex], ownerIndex,
  );
}

function whiteHyperPendingFlush(ram, rom, ctx, _h, p2, resources) {
  const ownerIndex = p2 ? 1 : 0;
  return callBoundary(
    ram, rom, ctx, 'pendingFlush', resources.callbacks.pendingFlush[ownerIndex], ownerIndex,
  );
}

export const WHITE_HYPER_RESOURCES = Object.freeze({
  edition: 'white-label-a',
  entries: Object.freeze({ stepP1: 0x18466c, stepP2: 0x184796,
    endP1: 0x18474c, endP2: 0x184876 }),
  ram: WHITE_HYPER_RAM,
  sides: Object.freeze([WHITE_HYPER_RAM.p1, WHITE_HYPER_RAM.p2]),
  powerCap: 0x0f,
  flash: Object.freeze({ frameTable: 0x18601e, emitter: 0x140da8,
    initialSprite: 0x000530fc, spriteStep: 0x0234, spriteEnd: 0x00056eac,
    init: Object.freeze([0x185e62, 0x185f40]),
    live: Object.freeze([0x185e7e, 0x185f5c]),
    end: Object.freeze([0x185eea, 0x185fc8]) }),
  endFlashActiveTest: Object.freeze([0x81b63e, 0x81b63e]),
  activationRedrawBeforeMutation: true,
  clearFlagsBeforeEndReset: true,
  callbacks: Object.freeze({
    conversion: Object.freeze([0x15286c, 0x152886]),
    endReset: Object.freeze([0x1528a8, 0x1528b6]),
    pendingFlush: Object.freeze([0x1860f2, 0x186154]),
  }),
  operations: Object.freeze({
    conversion: whiteHyperConversion,
    endReset: whiteHyperEndReset,
    pendingFlush: whiteHyperPendingFlush,
  }),
});

const WHITE_HUD_RAM = Object.freeze({
  slideFlag: 0x81b6ee,
  objFlag: 0x81b6f0,
  flags8: 0x8130f8,
  flags9: 0x8130f9,
  bannerTimer: 0x81b620,
  bannerSubA: 0x81b622,
  bannerSubB: 0x81b624,
  bannerFlagsBoss: 0x81b61e,
  bannerFlagsClear: 0x81b61f,
  frameCounter: 0x80390a,
  cursorTickB: 0x81b598,
  cursorReloadB: 0x81b599,
  cursorIdxB: 0x81b59a,
  cursorValB: 0x81b59c,
  cursorValA: 0x81b5a4,
  aliveP1: 0x8130be,
  aliveP2: 0x8130c0,
  shipP1: 0x813084,
  shipP2: 0x813086,
  slideShipP1: 0x81043e,
  slideShipP2: 0x8104a0,
  activeP1: 0x81b63e,
  activeP2: 0x81b640,
  gaugeP1: 0x81b642,
  gaugeP2: 0x81b644,
  rankAccumP1: 0x81b64a,
  rankAccumP2: 0x81b64c,
  stockP1: 0x81b65c,
  stockP2: 0x81b65e,
  pendingStockP1: 0x81b6e0,
  pendingStockP2: 0x81b6e2,
  pendingStockGate: 0x81b6e4,
  totalP1: 0x81b440,
  totalP2: 0x81b444,
  hiScore: 0x81b448,
  ovfP1: 0x81b44c,
  ovfP2: 0x81b44e,
  ovfHi: 0x81b450,
  pendingP1: 0x81b4c0,
  pendingP2: 0x81b4c4,
  extendNextP1: 0x81b4ac,
  extendNextP2: 0x81b4b0,
  extendIdxP1: 0x81b4b4,
  extendIdxP2: 0x81b4b6,
  savedTotal: 0x81b590,
  savedOvf: 0x81b594,
  digitsP1: 0x81b4c8,
  digitsP2: 0x81b522,
  digitStateP1: 0x81b49a,
  digitStateP2: 0x81b49e,
  digitStateHi: 0x81b49c,
});

const WHITE_HUD_TABLES = Object.freeze({
  cursorB: 0x1869cc,
  cursorBEntries: 15,
  cursorA: 0x186a08,
  cursorAEntries: 64,
  movingLivesP1: 0x186d10,
  movingLivesP2: 0x186d18,
  settledLivesP1: 0x186d20,
  settledLivesP2: 0x186d28,
  gauge: 0x186d30,
  rankP1: 0x186de4,
  rankP2: 0x186e64,
  movingStock: 0x186f0c,
  settledStock: 0x186f24,
  extend: 0x186f4c,
});

const WHITE_HUD_PRESENTATION = Object.freeze({
  spriteEmitter: 0x13fde4,
  preservingSpriteEmitter: 0x13fe12,
  textEmitter: 0x1410f4,
  blankEmitter: 0x1411ee,
  panelP1: 0x001cf060,
  panelP2: 0x001cee58,
  stockTrailP1: 0x001ca008,
  stockTrailP2: 0x001ce9b4,
  activeStock: 0x0414000a,
  bombP1: 0x0404000a,
  bombP2: 0x03ee000a,
  panelLabel: 0x054f000a,
});

const WHITE_TEXT = Object.freeze({
  head: 0x80b058,
  cursor: 0x80c8d8,
  stride: 0x80d518,
  tag: 0x904000,
});

function trace(ctx, call, target) {
  ctx?.whiteHyperHudHook?.(Object.freeze({ call, target }), ctx);
}

function assertRam(ram) {
  if (!ram || typeof ram.u8 !== 'function' || typeof ram.u16 !== 'function'
      || typeof ram.u32 !== 'function' || typeof ram.setU8 !== 'function'
      || typeof ram.setU16 !== 'function' || typeof ram.setU32 !== 'function') {
    throw new TypeError('White Label hyper HUD needs main RAM');
  }
}

function assertRom(rom) {
  if (!rom || typeof rom.u8 !== 'function' || typeof rom.u16 !== 'function'
      || typeof rom.u32 !== 'function') {
    throw new TypeError('White Label hyper HUD needs the embedded cartridge image');
  }
}

function requireWhiteHyperHud(profileRequest, operation) {
  const profile = resolveGameProfile(profileRequest === undefined
    ? WHITE_LABEL_PROFILE
    : profileRequest);
  const runtime = resolveGameRuntime(profile);
  requireRuntimeCapability(runtime, 'stage1HyperHud', operation);
  return profile;
}

function addLow(value, delta) {
  return ((value & 0xffff0000) | u16((value & 0xffff) + delta)) >>> 0;
}

function swapWords(value) {
  return (((value & 0xffff) << 16) | (value >>> 16)) >>> 0;
}

function linearArt(rom, base, index) {
  const first = rom.u32(base);
  const step = (rom.u32(base + 4) - first) | 0;
  return u32(first + Math.imul(index, step));
}

function requireHudSource(value, label) {
  if (value > 0x095f) {
    throw new RangeError(`White Label ${label} exceeds the native $095F domain`);
  }
  return value;
}

function whiteTxGrid(ram, d0, d1, d2, d3, d4, blank = false) {
  let at = ram.u32(WHITE_TEXT.cursor);
  if (at < WHITE_TEXT.head || at >= WHITE_TEXT.cursor) return;
  let tile = blank ? 0xc0000000 : u32(d4 + 0xc0000000);
  let full = false;
  for (let outer = 0; outer <= (d2 & 0xffff); outer++) {
    let row = d1 & 0xffff;
    for (let inner = 0; inner <= (d3 & 0xffff); inner++) {
      if (at + 12 > WHITE_TEXT.cursor) { full = true; break; }
      ram.setU32(at, u32(WHITE_TEXT.tag + ((row + d0) & 0xffff)));
      ram.setU32(at + 4, tile);
      at += 8;
      if (!blank) tile = u32(tile + 0x10000);
      row = u16(row + 0x100);
    }
    if (full) break;
    d0 = u16(d0 - 4);
  }
  ram.setU32(at, 0xffffffff);
  ram.setU32(WHITE_TEXT.cursor, at);
}

function sprite(ram, d1, d2, d3, d4) {
  return enqueueRegisters(ram, 25, d1, d2, d3, d4);
}

function bcdAdd32(a, b) {
  let carry = 0;
  let out = 0;
  for (let byte = 0; byte < 4; byte++) {
    const shift = byte * 8;
    const da = (a >>> shift) & 0xff;
    const db = (b >>> shift) & 0xff;
    let low = (da & 0x0f) + (db & 0x0f) + carry;
    let high = (da >>> 4) + (db >>> 4);
    if (low > 9) { low -= 10; high++; }
    if (high > 9) { high -= 10; carry = 1; } else carry = 0;
    out = (out | (((high << 4) | low) << shift)) >>> 0;
  }
  return Object.freeze([out >>> 0, carry]);
}

function whiteDigits(ram, ownerIndex) {
  const side = ownerIndex === 0
    ? { base: WHITE_HUD_RAM.digitsP1, total: WHITE_HUD_RAM.totalP1,
      state: WHITE_HUD_RAM.digitStateP1, ovf: WHITE_HUD_RAM.ovfP1 }
    : { base: WHITE_HUD_RAM.digitsP2, total: WHITE_HUD_RAM.totalP2,
      state: WHITE_HUD_RAM.digitStateP2, ovf: WHITE_HUD_RAM.ovfP2 };
  let record = side.base;
  let total = ram.u32(side.total);
  const finalTotal = total;
  const digitState = ram.u16(side.state);
  const oldTotal = ram.u32(WHITE_HUD_RAM.savedTotal);
  const overflow = ram.u16(side.ovf);
  let old = oldTotal;
  let visible = 0;
  if (overflow !== ram.u16(WHITE_HUD_RAM.savedOvf)) {
    visible = 1;
    ram.setU16(record, 1);
    ram.setU16(record + 6, u16(overflow + 0xc030));
  }
  if (overflow !== 0) visible = 1;
  record += 0x0a;
  for (let digit = 0; digit < 8; digit++, record += 0x0a) {
    total = ((total << 4) | (total >>> 28)) >>> 0;
    old = ((old << 4) | (old >>> 28)) >>> 0;
    const value = total & 0x0f;
    if (value === 0 && visible === 0) {
      if (ram.u16(record + 6) !== 0) {
        ram.setU16(record, 1);
        ram.setU16(record + 6, 0);
      }
      continue;
    }
    visible = 1;
    if (ram.u16(record + 6) === 0 || (old & 0x0f) !== value) {
      ram.setU16(record, 1);
      ram.setU16(record + 6, u16(value + 0xc030));
    }
  }
  return Object.freeze({ finalTotal, digitState });
}

function extendWhiteScore(ram, rom, side) {
  const offset = ram.u16(side.extendIndex);
  const delta = rom.u32(WHITE_HUD_TABLES.extend + offset);
  if (delta === 0xffffffff) {
    ram.setU32(side.extendNext, 0xffffffff);
    return;
  }
  if ((delta & 0x80000000) === 0) ram.setU16(side.extendIndex, 0x0c);
  ram.setU32(side.extendNext, bcdAdd32(ram.u32(side.extendNext), delta & 0x7fffffff)[0]);
}

const WHITE_SCORE_SIDES = Object.freeze([
  Object.freeze({ total: WHITE_HUD_RAM.totalP1, pending: WHITE_HUD_RAM.pendingP1,
    extendNext: WHITE_HUD_RAM.extendNextP1, alive: WHITE_HUD_RAM.aliveP1,
    extendIndex: WHITE_HUD_RAM.extendIdxP1, overflow: WHITE_HUD_RAM.ovfP1 }),
  Object.freeze({ total: WHITE_HUD_RAM.totalP2, pending: WHITE_HUD_RAM.pendingP2,
    extendNext: WHITE_HUD_RAM.extendNextP2, alive: WHITE_HUD_RAM.aliveP2,
    extendIndex: WHITE_HUD_RAM.extendIdxP2, overflow: WHITE_HUD_RAM.ovfP2 }),
]);

function drainWhiteScoreSide(ram, rom, ctx, ownerIndex) {
  const side = WHITE_SCORE_SIDES[ownerIndex];
  const pending = ram.u32(side.pending);
  if (pending === 0) return;
  if (i16(ram.u16(side.alive)) < 0) {
    ram.setU32(side.pending, 0);
    return;
  }
  ram.setU32(WHITE_HUD_RAM.savedTotal, ram.u32(side.total));
  ram.setU16(WHITE_HUD_RAM.savedOvf, ram.u16(side.overflow));
  const [sum, carry] = bcdAdd32(ram.u32(side.total), pending);
  ram.setU32(side.total, sum);
  if (carry) {
    const overflow = u16(ram.u16(side.overflow) + 1);
    ram.setU16(side.overflow, overflow);
    if (overflow === 0x0a) {
      ram.setU32(side.total, 0x99999999);
      ram.setU16(side.overflow, 9);
    }
  } else if (ram.u32(side.extendNext) !== 0xffffffff
      && ram.u32(side.extendNext) <= ram.u32(side.total)
      && ram.u16(side.alive) !== 0x14) {
    ram.setU16(side.alive, u16(ram.u16(side.alive) + 1));
    extendWhiteScore(ram, rom, side);
    ctx?.soundPost?.(0x18b19e);
    whiteLivesRow(ram, rom, ownerIndex);
    ctx?.hudEvent?.('extend', ownerIndex, ram.u16(side.alive));
  }
  ram.setU32(side.pending, 0);
  const { finalTotal, digitState } = whiteDigits(ram, ownerIndex);
  const highOverflow = ram.u16(WHITE_HUD_RAM.ovfHi);
  const myOverflow = ram.u16(side.overflow);
  if (highOverflow > myOverflow) return;
  if (highOverflow === myOverflow) {
    if (ram.u32(WHITE_HUD_RAM.hiScore) >= finalTotal) return;
  } else {
    ram.setU16(WHITE_HUD_RAM.ovfHi, myOverflow);
  }
  ram.setU32(WHITE_HUD_RAM.hiScore, finalTotal);
  ram.setU16(WHITE_HUD_RAM.digitStateHi, digitState);
}

function whiteScoreDrain(ram, rom, ctx) {
  trace(ctx, 'score-drain', 0x182f0e);
  drainWhiteScoreSide(ram, rom, ctx, 0);
  drainWhiteScoreSide(ram, rom, ctx, 1);
}

function whiteCursorA(ram, rom, ctx) {
  trace(ctx, 'cursor-a', 0x184be4);
  const index = (ram.u16(WHITE_HUD_RAM.frameCounter) & 0x3f) * 4;
  ram.setU32(WHITE_HUD_RAM.cursorValA, rom.u32(WHITE_HUD_TABLES.cursorA + index));
}

function whiteCursorB(ram, rom, ctx) {
  trace(ctx, 'cursor-b', 0x184bac);
  const tick = (ram.u8(WHITE_HUD_RAM.cursorTickB) - 1) & 0xff;
  ram.setU8(WHITE_HUD_RAM.cursorTickB, tick);
  if (tick !== 0xff) return;
  ram.setU8(WHITE_HUD_RAM.cursorTickB, ram.u8(WHITE_HUD_RAM.cursorReloadB));
  const index = ram.u16(WHITE_HUD_RAM.cursorIdxB);
  ram.setU32(WHITE_HUD_RAM.cursorValB, rom.u32(WHITE_HUD_TABLES.cursorB + index));
  ram.setU16(WHITE_HUD_RAM.cursorIdxB, index < 4 ? 0x38 : u16(index - 4));
}

function whiteHyperStock(ram, rom, ownerIndex) {
  const active = ownerIndex === 0 ? WHITE_HUD_RAM.activeP1 : WHITE_HUD_RAM.activeP2;
  const stock = ownerIndex === 0 ? WHITE_HUD_RAM.stockP1 : WHITE_HUD_RAM.stockP2;
  let d0 = 0xc8;
  let d1 = ownerIndex === 0 ? 0x0200 : 0x1400;
  if ((ram.u8(WHITE_HUD_RAM.flags9) & 1) !== 0
      && (ram.u8(WHITE_HUD_RAM.bannerFlagsClear) & 0x80) === 0) {
    if ((ram.u8(WHITE_HUD_RAM.bannerFlagsBoss) & 0x10) === 0) return;
    d0 = 0xcc;
    d1 = ownerIndex === 0 ? 0 : 0x1600;
  }
  const tile = ram.u16(active) !== 0
    ? WHITE_HUD_PRESENTATION.activeStock
    : rom.u32(WHITE_HUD_TABLES.settledStock + ram.u16(stock) * 4);
  whiteTxGrid(ram, d0, d1, 2, 5, tile);
}

function whiteLivesRow(ram, rom, ownerIndex) {
  const alive = ownerIndex === 0 ? WHITE_HUD_RAM.aliveP1 : WHITE_HUD_RAM.aliveP2;
  const ship = ownerIndex === 0 ? WHITE_HUD_RAM.shipP1 : WHITE_HUD_RAM.shipP2;
  const table = ownerIndex === 0
    ? WHITE_HUD_TABLES.settledLivesP1 : WHITE_HUD_TABLES.settledLivesP2;
  let d0 = 0xbc;
  let d1 = ownerIndex === 0 ? 0x0200 : 0x1900;
  const step = ownerIndex === 0 ? 0x0100 : -0x0100;
  if ((ram.u8(WHITE_HUD_RAM.flags9) & 1) !== 0
      && (ram.u8(WHITE_HUD_RAM.bannerFlagsClear) & 0x80) === 0
      && (ram.u8(WHITE_HUD_RAM.bannerFlagsBoss) & 0x10) !== 0) {
    d0 = 0xc0;
    d1 = ownerIndex === 0 ? 0 : 0x1b00;
  }
  let blanks = 5;
  const lives = ram.u16(alive);
  if (lives !== 0) {
    let count = u16(lives - 1);
    blanks--;
    if (count > 5) count = 5;
    blanks -= count;
    const tile = rom.u32(table + ram.u16(ship) * 2);
    for (let n = 0; n <= count; n++) {
      whiteTxGrid(ram, d0, d1, 1, 0, tile);
      d1 = u16(d1 + step);
    }
  }
  for (let n = 0; n <= blanks; n++) {
    if (blanks < 0) break;
    whiteTxGrid(ram, d0, d1, 1, 0, 0, true);
    d1 = u16(d1 + step);
  }
}

function movingLives(ram, rom, ownerIndex, slideOffset, basePosition) {
  const alive = ram.u16(ownerIndex === 0 ? WHITE_HUD_RAM.aliveP1 : WHITE_HUD_RAM.aliveP2);
  let count = u16(alive - 1);
  if ((count & 0x8000) !== 0) return basePosition;
  if (count > 5) count = 5;
  let position = basePosition;
  position = addLow(position, -0x0100);
  position = swapWords(position);
  position = addLow(position, -0x0200);
  position = swapWords(position);
  const ship = ram.u16(ownerIndex === 0
    ? WHITE_HUD_RAM.slideShipP1 : WHITE_HUD_RAM.slideShipP2);
  const table = ownerIndex === 0
    ? WHITE_HUD_TABLES.movingLivesP1 : WHITE_HUD_TABLES.movingLivesP2;
  const tile = rom.u32(table + ship * 2);
  for (let n = 0; n <= count; n++) {
    sprite(ram, position, tile, 0x0208, ownerIndex);
    position = addLow(position, ownerIndex === 0 ? 0x0200 : -0x0200);
  }
  void slideOffset;
  return basePosition;
}

function movingStock(ram, rom, ownerIndex, basePosition) {
  const active = ownerIndex === 0 ? WHITE_HUD_RAM.activeP1 : WHITE_HUD_RAM.activeP2;
  if (ram.u16(active) !== 0) return;
  let position = addLow(basePosition, ownerIndex === 0 ? -0x0100 : -0x0b00);
  position = swapWords(position);
  position = addLow(position, 0x0100);
  position = swapWords(position);
  const stock = ram.u16(ownerIndex === 0 ? WHITE_HUD_RAM.stockP1 : WHITE_HUD_RAM.stockP2);
  const tile = rom.u32(WHITE_HUD_TABLES.movingStock + stock * 4);
  sprite(ram, position, tile, 0x0430, 9);
}

function movingPanel(ram, rom, ownerIndex, slideOffset) {
  const panelPosition = ownerIndex === 0
    ? addLow(0x5bc00000, slideOffset)
    : addLow(0x5bc02800, -slideOffset);
  sprite(ram, panelPosition, ownerIndex === 0
    ? WHITE_HUD_PRESENTATION.panelP1 : WHITE_HUD_PRESENTATION.panelP2, 0x0840, 9);

  const active = ownerIndex === 0 ? WHITE_HUD_RAM.activeP1 : WHITE_HUD_RAM.activeP2;
  const gauge = ownerIndex === 0 ? WHITE_HUD_RAM.gaugeP1 : WHITE_HUD_RAM.gaugeP2;
  const pendingStock = ownerIndex === 0
    ? WHITE_HUD_RAM.pendingStockP1 : WHITE_HUD_RAM.pendingStockP2;
  const rankAccumAddress = ownerIndex === 0
    ? WHITE_HUD_RAM.rankAccumP1 : WHITE_HUD_RAM.rankAccumP2;
  const rankTable = ownerIndex === 0 ? WHITE_HUD_TABLES.rankP1 : WHITE_HUD_TABLES.rankP2;
  let position = u32(((0x5fc0 << 16) | (ownerIndex === 0 ? 0x1000 : 0x2600)));
  position = addLow(position, ownerIndex === 0 ? slideOffset : -slideOffset);

  if (ram.u16(active) !== 0) {
    const gaugeValue = requireHudSource(ram.u16(gauge), 'hyper gauge');
    const gaugeIndex = Math.floor(u16(gaugeValue * 0x16) / 0x04b0);
    sprite(ram, ownerIndex === 0 ? 0x5ec00400 : 0x5ec02800,
      linearArt(rom, WHITE_HUD_TABLES.gauge, gaugeIndex), 0x0430, 9);
    const count = ram.u16(pendingStock);
    for (let n = 0; n < count; n++) {
      sprite(ram, position, ownerIndex === 0
        ? WHITE_HUD_PRESENTATION.stockTrailP1 : WHITE_HUD_PRESENTATION.stockTrailP2,
      0x0608, 9);
      position = addLow(position, ownerIndex === 0 ? 0x0200 : -0x0200);
    }
  } else if (ram.u16(WHITE_HUD_RAM.pendingStockGate) !== 0) {
    const count = ram.u16(pendingStock);
    for (let n = 0; n < count; n++) {
      sprite(ram, position, ownerIndex === 0
        ? WHITE_HUD_PRESENTATION.stockTrailP1 : WHITE_HUD_PRESENTATION.stockTrailP2,
      0x0608, 9);
      position = addLow(position, ownerIndex === 0 ? 0x0200 : -0x0200);
    }
  }

  const rankAccum = requireHudSource(ram.u16(rankAccumAddress), 'rank accumulator');
  if (rankAccum !== 0) {
    const rankIndex = Math.floor(u16(rankAccum << 4) / 0x04b0);
    sprite(ram, position, linearArt(rom, rankTable, rankIndex), 0x0608, 9);
  }
}

function movingSlide(ram, rom, slideOffset) {
  if (i16(ram.u16(WHITE_HUD_RAM.aliveP1)) >= 0) {
    const base = addLow(0x5dc00500, slideOffset);
    movingLives(ram, rom, 0, slideOffset, base);
    movingStock(ram, rom, 0, base);
    movingPanel(ram, rom, 0, slideOffset);
  }
  if (i16(ram.u16(WHITE_HUD_RAM.aliveP2)) >= 0) {
    const base = addLow(0x5dc03300, -slideOffset);
    movingLives(ram, rom, 1, slideOffset, base);
    movingStock(ram, rom, 1, base);
    movingPanel(ram, rom, 1, slideOffset);
  }
}

function finalSlideLives(ram, rom, ownerIndex) {
  const alive = ram.u16(ownerIndex === 0 ? WHITE_HUD_RAM.aliveP1 : WHITE_HUD_RAM.aliveP2);
  let count = u16(alive - 1);
  if ((count & 0x8000) !== 0) return;
  if (count > 5) count = 5;
  const ship = ram.u16(ownerIndex === 0
    ? WHITE_HUD_RAM.slideShipP1 : WHITE_HUD_RAM.slideShipP2);
  const table = ownerIndex === 0
    ? WHITE_HUD_TABLES.settledLivesP1 : WHITE_HUD_TABLES.settledLivesP2;
  const tile = rom.u32(table + ship * 2);
  let d1 = ownerIndex === 0 ? 0x0200 : 0x1900;
  for (let n = 0; n <= count; n++) {
    whiteTxGrid(ram, 0xbc, d1, 1, 0, tile);
    d1 = u16(d1 + (ownerIndex === 0 ? 0x0100 : -0x0100));
  }
}

function finalSlideSide(ram, rom, ownerIndex) {
  finalSlideLives(ram, rom, ownerIndex);
  whiteHyperStock(ram, rom, ownerIndex);
  whiteTxGrid(ram, 0xd4, ownerIndex === 0 ? 0 : 0x1a00, 7, 1,
    ownerIndex === 0 ? WHITE_HUD_PRESENTATION.bombP1 : WHITE_HUD_PRESENTATION.bombP2);
  whiteTxGrid(ram, 0xd4, ownerIndex === 0 ? 0x0200 : 0x1400, 2, 5,
    WHITE_HUD_PRESENTATION.panelLabel);
}

function whiteSlide(ram, rom, ctx) {
  trace(ctx, 'slide', 0x183950);
  if ((ram.u8(WHITE_HUD_RAM.flags9) & 1) !== 0) {
    if (i16(ram.u16(WHITE_HUD_RAM.aliveP1)) >= 0) {
      whiteHyperStock(ram, rom, 0);
      whiteLivesRow(ram, rom, 0);
    }
    if (i16(ram.u16(WHITE_HUD_RAM.aliveP2)) >= 0) {
      whiteHyperStock(ram, rom, 1);
      whiteLivesRow(ram, rom, 1);
    }
    ram.setU16(WHITE_HUD_RAM.slideFlag, 0);
    return true;
  }
  if (ram.u16(WHITE_HUD_RAM.bannerTimer) !== 0) {
    const timer = u16(ram.u16(WHITE_HUD_RAM.bannerTimer) - 1);
    ram.setU16(WHITE_HUD_RAM.bannerTimer, timer);
    movingSlide(ram, rom, u16(-(timer << 6)));
    return false;
  }
  if (i16(ram.u16(WHITE_HUD_RAM.aliveP1)) >= 0) finalSlideSide(ram, rom, 0);
  if (i16(ram.u16(WHITE_HUD_RAM.aliveP2)) >= 0) finalSlideSide(ram, rom, 1);
  ram.setU16(WHITE_HUD_RAM.slideFlag, 0);
  return false;
}

function whiteStepHyper(ram, rom, ctx, ownerIndex) {
  trace(ctx, ownerIndex === 0 ? 'hyper-p1' : 'hyper-p2',
    ownerIndex === 0 ? 0x18466c : 0x184796);
  stepHyperWithResources(
    ram, rom, ctx, ownerIndex !== 0,
    who => whiteHyperStock(ram, rom, who), WHITE_HYPER_RESOURCES,
  );
}

function whiteHudFrame(ram, rom, ctx) {
  whiteCursorA(ram, rom, ctx);
  whiteCursorB(ram, rom, ctx);
  if (ram.u16(WHITE_HUD_RAM.slideFlag) !== 0 && !whiteSlide(ram, rom, ctx)) return;
  whiteStepHyper(ram, rom, ctx, 0);
  whiteStepHyper(ram, rom, ctx, 1);
  trace(ctx, 'post-tail', 0x1830c6);
  callBoundary(ram, rom, ctx, 'postHudTail', 0x1830c6, null);
}

function whiteHudInit() {}

function whiteHudDestroy(ram, id) {
  queueKill(ram, id);
}

export const WHITE_HUD_RESOURCES = Object.freeze({
  edition: 'white-label-a',
  entries: Object.freeze({ object: 0x18c046, init: 0x18c028, destroy: 0x18c038,
    drain: 0x182f0e, frame: 0x1830ac, slide: 0x183950, slideArm: 0x18659c,
    postTail: 0x1830c6 }),
  object: Object.freeze({
    stateAt: 0x02, idAt: 0x4c, priority: 0x09,
    killTarget: 0x1415cc, aliveFlag: 0x81b6f0,
  }),
  ram: WHITE_HUD_RAM,
  tables: WHITE_HUD_TABLES,
  presentation: WHITE_HUD_PRESENTATION,
  text: WHITE_TEXT,
  callbacks: Object.freeze({ postHudTail: 0x1830c6 }),
  routines: Object.freeze({
    init: whiteHudInit,
    destroy: whiteHudDestroy,
    drain: whiteScoreDrain,
    frame: whiteHudFrame,
  }),
});

export const WHITE_HYPER_HUD_RESOURCES = Object.freeze({
  hud: WHITE_HUD_RESOURCES,
  hyper: WHITE_HYPER_RESOURCES,
});

/** `$18659C`, the Build A slide arm used by the Stage 1 rank handoff. */
export function whiteSlideArm18659C(ram, profileRequest) {
  requireWhiteHyperHud(profileRequest, 'White Label Stage 1 HUD slide arm');
  assertRam(ram);
  return armHudSlideWithResources(ram, WHITE_HUD_RESOURCES);
}

/** `$18C046`, the capability-gated Build A type-0 object. */
export function whiteHudTick18C046(ram, rom, slot, ctx, profileRequest) {
  requireWhiteHyperHud(profileRequest, 'White Label Stage 1 hyper HUD tick');
  assertRam(ram);
  assertRom(rom);
  if (ctx?.rom !== undefined && ctx.rom !== rom) {
    throw new TypeError('White Label hyper HUD context must use the supplied cartridge windows');
  }
  return makeHudObjectWithResources(rom, WHITE_HUD_RESOURCES)(ram, slot, 0, ctx);
}

/** Build the isolated Version A type-0 handler island. */
export function createWhiteStage1HyperHudHandlers(rom, profileRequest) {
  const profile = requireWhiteHyperHud(
    profileRequest, 'White Label Stage 1 hyper HUD handler map',
  );
  assertRom(rom);
  return new Map([[0x00, (ram, slot, _slotIndex, ctx) =>
    whiteHudTick18C046(ram, rom, slot, ctx, profile)]]);
}
