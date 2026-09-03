// Capability-gated Build A Button 2, pending hyper grants, and callback closure.

import { P, RAM } from './machine.js';
import { u16 } from './ram.js';
import {
  resolveGameProfile, WHITE_LABEL_PROFILE,
} from './profiles.js';
import {
  requireRuntimeCapability, resolveGameRuntime,
} from './runtime-profile.js';
import { bcd242AC6 } from './items.js';
import { endHyperWithResources } from './hyper.js';
import { install24150A } from './palette.js';
import { scoreByMask } from './score.js';
import { setPanelBody1528C4 } from './hud.js';
import {
  preflightWhiteOptionReset, resetWhiteOptionsForHyper,
  resetWhiteOptionsForLaserBomb,
} from './white-options.js';
import { WHITE_HYPER_RESOURCES } from './white-hyper-hud.js';
import { preflightWhiteBombCartridge } from './white-bomb.js';

const freezeSide = side => Object.freeze(side);

export const WHITE_BUTTON2_RESOURCES = Object.freeze({
  edition: 'white-label-a',
  entries: Object.freeze({
    body: 0x148ec8,
    hyperSound: 0x18b400,
    cancelP1: 0x144064,
    cancelP2: 0x1440aa,
    bombCancel: 0x1440f0,
    hyperRedrawP1: 0x185a14,
    hyperRedrawP2: 0x185a7c,
    bombRedraw: 0x1528f8,
    pendingP1: 0x1860f2,
    pendingP2: 0x186154,
    itemAlloc: 0x17d9c4,
    itemFill: 0x17e796,
  }),
  sides: Object.freeze([
    freezeSide({
      ownerIndex: 0,
      player: RAM.player1,
      otherPlayer: RAM.player2,
      stock: 0x81b65c,
      request: 0x81b658,
      power: 0x81b646,
      active: 0x81b63e,
      flash: 0x81b6fe,
      modeTable: 0x1548e2,
      display: 0x8128f4,
      used: 0x812944,
      count: 0x812940,
      meter: 0x81b5c0,
      chainLatch: 0x81b5ae,
      pending: 0x81b6e0,
      earn: 0x81b64a,
      set: 0x81040a,
      alive: 0x8130be,
      kind: 0x0c,
      option: RAM.p1Options,
      soundQueue: 0x81294c,
      cancelEvent: 0x8010,
    }),
    freezeSide({
      ownerIndex: 1,
      player: RAM.player2,
      otherPlayer: RAM.player1,
      stock: 0x81b65e,
      request: 0x81b65a,
      power: 0x81b648,
      active: 0x81b640,
      flash: 0x81b700,
      modeTable: 0x1548ec,
      display: 0x812902,
      used: 0x812946,
      count: 0x812942,
      meter: 0x81b5ea,
      chainLatch: 0x81b5b0,
      pending: 0x81b6e2,
      earn: 0x81b64c,
      set: 0x81046c,
      alive: 0x8130c0,
      kind: 0x14,
      option: RAM.p2Options,
      soundQueue: 0x81294e,
      cancelEvent: 0x8008,
    }),
  ]),
  ram: Object.freeze({
    arm: 0x81b410,
    mode: 0x81b412,
    queue: 0x803938,
    divCount: 0x80392e,
    pendingGate: 0x81b6e4,
    bombRecord: 0x811f72,
    bombStride: 0x30,
    bombSlots: 45,
    itemCount: 0x8171ba,
    itemVariant: 0x8171bc,
    hudItemPending: 0x81b5b4,
    hudItemCount: 0x81b610,
  }),
  hyperModes: Object.freeze([
    Object.freeze([0xffff, 0x20, 0x24, 0x28, 0x2c]),
    Object.freeze([0xffff, 0x30, 0x34, 0x38, 0x3c]),
  ]),
  item: Object.freeze({
    template: 0x17e866,
    templateLength: 0x1a,
    p1Pool: 0x816e7a,
    p2Pool: 0x816ffa,
    slots: 6,
    stride: 0x40,
  }),
  palette: Object.freeze({ ordinary: 0x122a78, laser: 0x122ab8, bank: 6 }),
  soundRequestMap: Object.freeze({
    0x18b400: 0x28c8da,
  }),
  cancel: Object.freeze({
    stageGate: 0x8130f8,
    bulletPool: 0x817f8c,
    bulletSlots: 210,
    bulletStride: 0x40,
    credit: 0x23,
  }),
});

function requireWhiteButton2(profileRequest, operation) {
  const profile = resolveGameProfile(profileRequest === undefined
    ? WHITE_LABEL_PROFILE
    : profileRequest);
  const runtime = resolveGameRuntime(profile);
  requireRuntimeCapability(runtime, 'stage1Players', operation);
  requireRuntimeCapability(runtime, 'stage1Options', operation);
  requireRuntimeCapability(runtime, 'stage1HyperHud', operation);
  return profile;
}

function assertRom(rom) {
  if (!rom || typeof rom.u8 !== 'function' || typeof rom.u16 !== 'function'
      || typeof rom.u32 !== 'function' || typeof rom.bytes !== 'function') {
    throw new TypeError('White Label Button 2 needs the embedded cartridge windows');
  }
}

function assertRam(ram) {
  if (!ram || typeof ram.u8 !== 'function' || typeof ram.u16 !== 'function'
      || typeof ram.u32 !== 'function' || typeof ram.setU8 !== 'function'
      || typeof ram.setU16 !== 'function' || typeof ram.setU32 !== 'function') {
    throw new TypeError('White Label Button 2 needs mutable board RAM');
  }
}

function validateResources() {
  const r = WHITE_BUTTON2_RESOURCES;
  if (!Object.isFrozen(r) || !Object.isFrozen(r.entries)
      || !Object.isFrozen(r.sides) || r.sides.length !== 2
      || r.sides.some((side, ownerIndex) => !Object.isFrozen(side)
        || side.ownerIndex !== ownerIndex)
      || !Object.isFrozen(r.ram) || !Object.isFrozen(r.item)
      || !Object.isFrozen(r.palette) || !Object.isFrozen(r.soundRequestMap)
      || !Object.isFrozen(r.cancel) || !Object.isFrozen(r.hyperModes)
      || r.soundRequestMap[r.entries.hyperSound] !== 0x28c8da
      || r.cancel.bulletSlots !== 210 || r.cancel.bulletStride !== 0x40
      || r.hyperModes.some(row => !Object.isFrozen(row) || row.length !== 5)) {
    throw new TypeError('White Label Button 2 resource graph is mixed or mutable');
  }
  return r;
}

function expectHyperModeIdentity(rom, resources) {
  for (let ownerIndex = 0; ownerIndex < 2; ownerIndex++) {
    const side = resources.sides[ownerIndex];
    for (let index = 0; index < resources.hyperModes[ownerIndex].length; index++) {
      const expected = resources.hyperModes[ownerIndex][index];
      if (rom.u16(side.modeTable + index * 2) !== expected) {
        throw new RangeError(`White hyper mode row changed at $${
          (side.modeTable + index * 2).toString(16)}`);
      }
    }
  }
}

function expectBombDataIdentity(rom, resources) {
  void rom.bytes(resources.item.template, resources.item.templateLength);
  void rom.bytes(resources.palette.ordinary, 0x40);
  void rom.bytes(resources.palette.laser, 0x40);
}

function callbackGraph(ctx) {
  const hyper = ctx?.whiteHyperHudCallbacks;
  const bomb = ctx?.whiteBombCallbacks;
  for (const key of ['conversion', 'endReset', 'pendingFlush', 'postHudTail', 'redrawStock']) {
    if (typeof hyper?.[key] !== 'function') {
      throw new TypeError(`White Label Button 2 ${key} callback must be a function`);
    }
  }
  for (const key of ['redrawStock', 'resetOptions']) {
    if (typeof bomb?.[key] !== 'function') {
      throw new TypeError(`White Label Button 2 ${key} callback must be a function`);
    }
  }
  if (ctx.soundPost !== undefined && typeof ctx.soundPost !== 'function') {
    throw new TypeError('White Label Button 2 sound callback must be a function');
  }
  return { hyper, bomb };
}

function assertPaletteState(palette) {
  if (!palette || !(palette.stageSourced?.spr instanceof Uint8Array)
      || palette.stageSourced.spr.length < 32 * 32
      || !(palette.installs instanceof Map)
      || !Number.isSafeInteger(palette.installCount)
      || palette.installCount < 0) {
    throw new TypeError('White Label bomb needs a complete palette state before RAM mutation');
  }
}

function effectivePendingCount(ram, side) {
  const count = ram.u16(side.pending);
  if (count === 0) return 0;
  const effective = count + (ram.u16(side.earn) === 0x095f ? 1 : 0);
  if (effective > WHITE_BUTTON2_RESOURCES.item.slots) {
    throw new RangeError(`White pending hyper count ${effective} exceeds its six-slot pool`);
  }
  return effective;
}

function armCancelState(ram) {
  const r = WHITE_BUTTON2_RESOURCES;
  if (ram.u16(r.ram.arm) !== 0 && ram.u16(r.ram.mode) >= 0x20
      && ram.u16(r.ram.mode) <= 0x3c) return false;
  ram.setU16(r.ram.arm, 1);
  ram.setU16(r.ram.mode, 0xffff);
  return true;
}

function armHyperCancel(ram, ctx, side, address) {
  const r = WHITE_BUTTON2_RESOURCES;
  if (!armCancelState(ram)) return false;
  if (!ram.btst8(r.cancel.stageGate, 1)) {
    for (let index = 0; index < r.cancel.bulletSlots; index++) {
      const bullet = r.cancel.bulletPool + index * r.cancel.bulletStride;
      if ((ram.u16(bullet) & 0x8000) === 0) continue;
      scoreByMask(ram, r.cancel.credit, side.cancelEvent);
    }
  }
  ctx?.hyperEvent?.('cancel', side.ownerIndex + 1, side.cancelEvent);
  ctx?.whiteButton2Event?.('cancel', address, side.ownerIndex);
  return true;
}

function armBombCancel(ram, ctx, side) {
  const r = WHITE_BUTTON2_RESOURCES;
  if (!armCancelState(ram)) return false;
  ctx?.whiteButton2Event?.('cancel', r.entries.bombCancel, side.ownerIndex);
  return true;
}

function spawnPendingItem(ram, rom, ctx, side, y, site) {
  const r = WHITE_BUTTON2_RESOURCES;
  const base = side.ownerIndex === 0 ? r.item.p1Pool : r.item.p2Pool;
  for (let index = 0; index < r.item.slots; index++) {
    const slot = base + index * r.item.stride;
    if (ram.u16(slot) !== 0) continue;
    const template = r.item.template;
    ram.setU16(slot, 0x8000 | side.kind);
    ram.setU16(slot + 0x02, y);
    ram.setU32(slot + 0x06, rom.u32(template));
    ram.setU32(slot + 0x0a, rom.u32(template + 4));
    ram.setU16(slot + 0x0e, 0xffff);
    ram.setU16(slot + 0x10, rom.u16(template + 10));
    ram.setU32(slot + 0x12, rom.u32(template + 12));
    ram.setU32(slot + 0x16, rom.u32(template + 16));
    ram.setU32(slot + 0x1a, rom.u32(template + 20));
    ram.setU16(slot + 0x1e, ram.u16(r.ram.itemVariant));
    ram.setU16(r.ram.itemCount, u16(ram.u16(r.ram.itemCount) + 1));
    let variant = u16(ram.u16(r.ram.itemVariant) + 0x0c);
    if (variant === 0x009c) variant = 0;
    else if (variant === 0x00a2) variant = 6;
    ram.setU16(r.ram.itemVariant, variant);
    ctx?.itemSpawn?.(side.kind, site, slot);
    return slot;
  }
  ctx?.whiteButton2Event?.('item-pool-full', site, side.ownerIndex);
  return null;
}

/** `$1860F2` / `$186154`: Build A pending hyper grant flush. */
export function flushWhitePendingHyper(ram, rom, ctx, ownerIndex, profileRequest) {
  requireWhiteButton2(profileRequest, 'White Label pending hyper grant');
  assertRam(ram);
  assertRom(rom);
  const r = validateResources();
  const side = r.sides[ownerIndex];
  if (!side) throw new RangeError(`White pending hyper owner ${ownerIndex} is outside {0, 1}`);
  void rom.bytes(r.item.template, r.item.templateLength);
  if (ram.u16(r.ram.pendingGate) !== 0) {
    if ((ram.u16(side.player) & 0x8000) !== 0) {
      if (ram.u8(side.set) !== 0) return 0;
    } else if ((ram.u16(side.alive) & 0x8000) === 0) {
      return 0;
    }
  }
  if (ram.u16(side.pending) === 0) return 0;
  const count = effectivePendingCount(ram, side);
  if (ram.u16(side.earn) === 0x095f) {
    ram.setU16(side.earn, 0);
  }
  let y = 0x7000;
  const site = ownerIndex === 0 ? r.entries.pendingP1 : r.entries.pendingP2;
  for (let index = 0; index < count; index++, y = u16(y + 0x0800)) {
    spawnPendingItem(ram, rom, ctx, side, y, site);
  }
  ram.setU16(side.pending, 0);
  return count;
}

function hyperConversion(ram, _rom, ctx, ownerIndex) {
  const flags = ram.u8(WHITE_HYPER_RESOURCES.ram.flags);
  const invuln = ownerIndex === 0 && (flags & 0x04) !== 0 ? 0x78 : 0x50;
  ram.setU8(WHITE_BUTTON2_RESOURCES.sides[ownerIndex].player + P.invuln, invuln);
  return invuln;
}

function hyperEndReset(ram, rom, ctx, ownerIndex, _target, profileRequest) {
  return resetWhiteOptionsForHyper(ownerIndex, ram, rom, ctx, profileRequest);
}

function hyperPendingFlush(ram, rom, ctx, ownerIndex, _target, profileRequest) {
  return flushWhitePendingHyper(ram, rom, ctx, ownerIndex, profileRequest);
}

function postHudTail(ram) {
  const { hudItemPending, hudItemCount } = WHITE_BUTTON2_RESOURCES.ram;
  if (ram.u16(hudItemPending) === 0) return 0;
  let moved = 0;
  for (let index = 0; index < 4; index++) {
    ram.setU16(hudItemCount, u16(ram.u16(hudItemCount) + 1));
    ram.setU16(hudItemPending, u16(ram.u16(hudItemPending) - 1));
    moved++;
    if (ram.u16(hudItemPending) === 0 && index < 3) break;
  }
  return moved;
}

/** Install the trusted private callback graph used by the composed White runtime. */
export function installWhiteButton2Callbacks(
  ctx, rom, profileRequest, redrawHyperStock,
) {
  const profile = requireWhiteButton2(profileRequest, 'White Label Button 2 callback graph');
  assertRom(rom);
  if (!ctx || typeof ctx !== 'object') {
    throw new TypeError('White Label Button 2 callback graph needs a mutable context');
  }
  if (typeof redrawHyperStock !== 'function') {
    throw new TypeError('White Label Button 2 hyper-stock redraw must be a function');
  }
  const hyperDefaults = {
    conversion: (ram, suppliedRom, suppliedCtx, ownerIndex) =>
      hyperConversion(ram, suppliedRom, suppliedCtx, ownerIndex),
    endReset: (ram, suppliedRom, suppliedCtx, ownerIndex, target) =>
      hyperEndReset(ram, suppliedRom, suppliedCtx, ownerIndex, target, profile),
    pendingFlush: (ram, suppliedRom, suppliedCtx, ownerIndex, target) =>
      hyperPendingFlush(ram, suppliedRom, suppliedCtx, ownerIndex, target, profile),
    postHudTail: ram => postHudTail(ram),
    redrawStock: (ram, suppliedRom, ownerIndex) =>
      redrawHyperStock(ram, suppliedRom, ownerIndex, profile),
  };
  const bombDefaults = {
    redrawStock: (ram, _suppliedRom, ownerIndex) =>
      setPanelBody1528C4(ram, ownerIndex, WHITE_BUTTON2_RESOURCES.sides[ownerIndex].player),
    resetOptions: (ownerIndex, ram, suppliedRom, suppliedCtx) =>
      resetWhiteOptionsForHyper(ownerIndex, ram, suppliedRom, suppliedCtx, profile),
  };
  const priorHyper = ctx.whiteHyperHudCallbacks ?? {};
  const priorBomb = ctx.whiteBombCallbacks ?? {};
  if (typeof priorHyper !== 'object' || typeof priorBomb !== 'object') {
    throw new TypeError('White Label private callback graphs must be objects');
  }
  for (const graph of [priorHyper, priorBomb]) {
    for (const [key, value] of Object.entries(graph)) {
      if (typeof value !== 'function') {
        throw new TypeError(`White Label private ${key} callback must be a function`);
      }
    }
  }
  const hyper = Object.freeze({ ...hyperDefaults, ...priorHyper });
  const bomb = Object.freeze({ ...bombDefaults, ...priorBomb });
  Object.assign(ctx, { whiteHyperHudCallbacks: hyper, whiteBombCallbacks: bomb });
  return ctx;
}

function preflightOwner(ram, rom, ctx, rec, ownerIndex, profile) {
  const r = validateResources();
  assertRam(ram);
  assertRom(rom);
  const side = r.sides[ownerIndex];
  if (!side || rec !== side.player) {
    throw new RangeError(`White Button 2 owner ${ownerIndex} does not own record $${
      rec.toString(16)}`);
  }
  const stock = ram.u16(side.stock);
  if (stock > r.hyperModes[ownerIndex].length) {
    throw new RangeError(`White hyper stock ${stock} exceeds its five-entry mode row`);
  }
  if (stock !== 0) {
    expectHyperModeIdentity(rom, r);
    const callbacks = callbackGraph(ctx);
    preflightWhiteOptionReset(ram, rom, ctx, ownerIndex, profile);
    return { r, side, callbacks };
  }

  const bombStock = ram.u8(rec + 0x24);
  const refused = bombStock === 0 || ram.u16(side.flash) !== 0
    || (ram.u16(r.ram.bombRecord) & 0x8000) !== 0;
  if (refused) return { r, side, callbacks: null };

  const selector = ram.u16(rec + P.shipSel);
  if (selector !== 0 && selector !== 2) {
    throw new RangeError(`White bomb selector ${selector} escapes dispatch {0, 1, 2, 3}`);
  }
  assertPaletteState(ctx?.palette);
  effectivePendingCount(ram, side);
  expectBombDataIdentity(rom, r);
  preflightWhiteBombCartridge(rom);
  preflightWhiteOptionReset(ram, rom, ctx, ownerIndex, profile);
  return { r, side, callbacks: callbackGraph(ctx) };
}

function requestHyper(ram, rom, ctx, rec, ownerIndex, profile, prepared) {
  const { r, side, callbacks } = prepared;
  const stock = ram.u16(side.stock);
  if (stock === 0) return false;
  ram.setU16(r.ram.arm, u16(ram.u16(r.ram.arm) + 8));
  ram.setU16(r.ram.mode, rom.u16(side.modeTable + (stock - 1) * 2));
  resetWhiteOptionsForHyper(ownerIndex, ram, rom, ctx, profile);
  ram.setU16(side.request, 1);
  ram.bset8(rec + P.flags1, 0);
  ctx?.soundPost?.(r.soundRequestMap[r.entries.hyperSound]);
  armHyperCancel(
    ram, ctx, side, ownerIndex === 0 ? r.entries.cancelP1 : r.entries.cancelP2,
  );
  ram.setU8(rec + P.invuln, 2);
  ram.setU16(r.ram.divCount, 0x14);
  if (ram.btst8(rec, 6) || ram.u16(side.display) === 0) {
    callbacks.bomb.redrawStock(ram, rom, ownerIndex);
  }
  ctx?.hyperEvent?.('request', ownerIndex + 1, stock);
  return true;
}

function debitPendingDisplay(ram, side) {
  if (ram.btst8(side.player, 6) || ram.u16(side.display) === 0) return;
  ram.setU16(side.display, u16(ram.u16(side.display) - 0x2c));
  const timerBefore = ram.u16(side.display + 0x0a);
  const timer = u16(timerBefore - 2);
  ram.setU16(side.display + 0x0a, timer);
  if (timerBefore < 2) {
    ram.setU16(side.display, 0);
    ram.setU16(side.display + 0x0a, 0);
  }
  const value = ram.u16(side.display);
  ram.setU32(side.display + 0x02, bcd242AC6(value));
  ram.setU32(side.display + 0x06, bcd242AC6(value >>> 1));
  ram.setU16(side.display + 0x0c,
    bcd242AC6(ram.u16(side.display + 0x0a)) & 0xffff);
}

function endHyperForBomb(ram, rom, ctx, ownerIndex, callbacks) {
  const side = WHITE_BUTTON2_RESOURCES.sides[ownerIndex];
  if (ram.u16(side.active) === 0) return false;
  endHyperWithResources(
    ram, rom, ctx, ownerIndex !== 0,
    who => callbacks.hyper.redrawStock(ram, rom, who), WHITE_HYPER_RESOURCES,
  );
  ram.setU16(side.power, Math.max(0, ram.u16(side.power) - 3));
  return true;
}

function fireBomb(ram, rom, ctx, rec, ownerIndex, profile, prepared) {
  const { r, side, callbacks } = prepared;
  const stock = ram.u8(rec + 0x24);
  if (stock === 0) return 'no-stock';
  if (ram.u16(side.flash) !== 0) return 'hyper-flash-up';
  if ((ram.u16(r.ram.bombRecord) & 0x8000) !== 0) return 'bomb-already-up';

  ram.setU16(r.ram.queue, 1);
  const left = (stock - 1) & 0xff;
  ram.setU8(rec + 0x24, left);
  if (left === 0) flushWhitePendingHyper(ram, rom, ctx, ownerIndex, profile);

  ram.setU16(side.used, 1);
  if (ram.u16(side.count) < 0x63) {
    ram.setU16(side.count, u16(ram.u16(side.count) + 1));
  }
  const meter = ram.u16(side.meter);
  endHyperForBomb(ram, rom, ctx, ownerIndex, callbacks);
  if (meter !== 0) ram.setU16(side.chainLatch, 1);
  debitPendingDisplay(ram, side);
  callbacks.bomb.redrawStock(ram, rom, ownerIndex);

  ram.bset8(rec, 6);
  ram.bset8(rec + P.flags1, 6);
  const selector = ram.u16(rec + P.shipSel);
  ram.setU16(r.ram.bombRecord,
    u16(0x8000 | (ownerIndex << 7) | (selector & 0xff)));
  ram.setU32(r.ram.bombRecord + 0x02, ram.u32(rec + P.posY));
  ram.setU8(rec + P.invuln, 0xff);

  const laser = ram.u8(rec + P.dead) !== 0;
  const paletteSource = laser ? r.palette.laser : r.palette.ordinary;
  install24150A(
    ram, ctx.palette, r.palette.bank, rom.bytes(paletteSource, 0x40),
    laser ? 0x15fbb0 : 0x15fba6,
    laser ? 'White Label laser bomb' : 'White Label ordinary bomb',
  );
  if (!laser) {
    ram.setU16(rec + 0x26, 0);
    ram.setU16(rec + 0x28, 0x3c);
    ram.setU8(rec + P.speedIdx, (ram.u8(rec + P.speedIdx) + 6) & 0xff);
  } else {
    ram.setU16(rec + 0x26, 0x0101);
    ram.setU16(rec + 0x28, 0x000c);
    ram.bset8(rec + P.flags1, 7);
    ram.bset8(r.ram.bombRecord + 1, 0);
    ram.setU16(0x8127e2, 0);
    ram.setU16(rec + 0x46, 0x2e);
    resetWhiteOptionsForLaserBomb(ownerIndex, ram, rom, ctx, profile);
    ram.setU16(side.option + 0x38, 0x26);
    ram.setU16(side.option + 0x56, 8);
    ram.setU16(side.soundQueue, 1);
    armBombCancel(ram, ctx, side);
  }

  if ((ram.u16(side.otherPlayer) & 0x8000) !== 0) {
    ram.setU8(side.otherPlayer + P.invuln, ram.u8(rec + P.invuln));
    ram.setU16(side.otherPlayer + 0x28, ram.u16(rec + 0x28));
    ram.setU16(side.otherPlayer + 0x26, ram.u16(rec + 0x26));
    return 'fired+partner';
  }
  return 'fired';
}

/** `$148EC8..$1491CF`: exact held Button 2 hyper-or-bomb fork. */
export function whiteButton2Held148EC8(
  ram, rom, rec, ctx, ownerIndex, profileRequest,
) {
  const profile = requireWhiteButton2(profileRequest, 'White Label held Button 2');
  const prepared = preflightOwner(ram, rom, ctx, rec, ownerIndex, profile);
  if (ram.u16(prepared.side.stock) !== 0) {
    requestHyper(ram, rom, ctx, rec, ownerIndex, profile, prepared);
    return Object.freeze({ phase: 'hyper-request', skipCadence: false });
  }
  const result = fireBomb(ram, rom, ctx, rec, ownerIndex, profile, prepared);
  return Object.freeze({ phase: result, skipCadence: result.startsWith('fired') });
}
