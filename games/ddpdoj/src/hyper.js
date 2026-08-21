// Chain-earned hyper item, request, activation, duration, and pending grant.
// ROM: $249814/$285A12/$2875B4/$287682 and the P2 mirrors.

import { i16, u16 } from './ram.js';
import { RAM, P } from './machine.js';
import { spawnHyperItem } from './items.js';
import { beamReset25270C } from './items.js';
import { enqueueRegisters } from './spritequeue.js';

export const HYPER = Object.freeze({
  gate: 0x81b6e4, arm: 0x81b410, mode: 0x81b412,
  pause: 0x80392c, flags: 0x8130f8, drawGate: 0x812970,
  frame: 0x80390a, phase: 0x80390c, secondLoop: 0x813098,
  stage: 0x813092, bossPhase: 0x81309c, firstLoopBossGate: 0x80393a,
  bulletSpeedBias: 0x812950, stockDrawGateP1: 0x803910,
  p1: Object.freeze({
    who: 1, kind: 0x0c, player: RAM.player1, set: 0x81040a,
    active: 0x81b63e, gauge: 0x81b642, earn: 0x81b64a,
    power: 0x81b646, level: 0x81b654, req: 0x81b658,
    stock: 0x81b65c, pending: 0x81b6e0, subTick: 0x81b64e,
    trail: 0x81b660,
    flashSprite: 0x81b6f2, endFlash: 0x81b6fa,
    liveFlash: 0x81b6fe, flashTick: 0x81b702, pos: 0x8103e8,
    chain: 0x81b5da, chainMeter: 0x81b5c0,
    chainHold: 0x81b5c2, chainSaved: 0x81b5ca, chainPulse: 0x81b5c8,
    bonus: 0x8128f4, bonusPos: 0x810436, bonusFrame: 0x812910,
    bonusTick: 0x812914, bonusReload: 0x812916,
    stockAnimPos: 0x81291c, stockAnimTick: 0x812924, stockAnimReload: 0x812925,
  }),
  p2: Object.freeze({
    who: 2, kind: 0x14, player: RAM.player2, set: 0x81046c,
    active: 0x81b640, gauge: 0x81b644, earn: 0x81b64c,
    power: 0x81b648, level: 0x81b656, req: 0x81b65a,
    stock: 0x81b65e, pending: 0x81b6e2, subTick: 0x81b650,
    trail: 0x81b6a0,
    flashSprite: 0x81b6f6, endFlash: 0x81b6fc,
    liveFlash: 0x81b700, flashTick: 0x81b704, pos: 0x81044a,
    chain: 0x81b604, chainMeter: 0x81b5ea,
    chainHold: 0x81b5ec, chainSaved: 0x81b5f4, chainPulse: 0x81b5f2,
    bonus: 0x812902, bonusPos: 0x810498, bonusFrame: 0x812912,
    bonusTick: 0x812918, bonusReload: 0x81291a,
    stockAnimPos: 0x812920, stockAnimTick: 0x812926, stockAnimReload: 0x812927,
  }),
});

export const HYPER_MUTATE = { value: null };

function side(p2) { return p2 ? HYPER.p2 : HYPER.p1; }

function drawStockTrailSide(ram, h) {
  const stock = ram.u16(h.stock);
  if (i16(ram.u16(h.player)) >= 0 || stock === 0) return 0;       // $2527CE/$2527E6

  // `$252850..$2528F6` shifts fifteen saved positions. Entry zero is not part
  // of the history; the newest position is written at entry one.
  for (let n = 15; n >= 2; n--) {
    ram.setU32(h.trail + n * 4, ram.u32(h.trail + (n - 1) * 4));
  }
  const lead = ram.u16(h.player + 0x58) === 0 ? 0xf700 : 0xf800;
  ram.setU32(h.trail + 4,
    ((u16(ram.u16(h.player + 2) + lead) << 16) | ram.u16(h.player + 4)) >>> 0);

  if (stock > 5 || ram.u16(HYPER.drawGate) !== 0) return 0;
  if (ram.u16(HYPER.secondLoop) !== 0 && ram.u8(h.player + 0x3f) !== 0
      && ram.u16(HYPER.phase) !== 0) return 0;

  const saved = ram.u32(h.trail + stock * 12);
  const long = u16((saved >>> 16) + 0xf000 + (5 - stock) * 0x0300);
  if (i16(long) < -0x0500) return 0;                            // $25289E/$2528A2
  const short = u16(saved + 0xfcc0);
  const frame = ram.u16(HYPER.frame) & (stock === 5 ? 0x0f : 0x1e);
  const sprite = 0x001b8578 + frame * (stock === 5 ? 0x34 : 0x1a);
  enqueueRegisters(ram, 18, ((long << 16) | short) >>> 0, sprite, 0x0418, 5);
  return 1;
}

/** `$2527CE`, the stock-dependent hyper follower for both players. */
export function drawHyperStockTrail2527CE(ram) {
  return drawStockTrailSide(ram, HYPER.p1) + drawStockTrailSide(ram, HYPER.p2);
}

/** `$252BD0`, the hyper-power and loop contribution to enemy-bullet speed. */
export function updateBulletSpeedBias252BD0(ram, rom) {
  let power = Math.max(ram.u16(HYPER.p1.power), ram.u16(HYPER.p2.power));
  if (power !== 0 && ram.u16(HYPER.p1.active) === 0
      && ram.u16(HYPER.p2.active) === 0) {
    power >>>= 2;
  }

  const secondLoop = ram.u16(HYPER.secondLoop) !== 0;
  let bias = power === 0 ? 0 : rom.u16(
    (secondLoop ? 0x252b8a : 0x252b44) + (power - 1) * 2);

  if ((ram.u8(HYPER.flags) & 0x04) !== 0) {
    bias++;
    if (ram.u16(HYPER.stage) > 1) bias++;
  }

  if (secondLoop) {
    bias++;
    if (ram.u16(HYPER.stage) === 4 && ram.u16(HYPER.bossPhase) !== 0) bias += 4;
  } else if (ram.u16(HYPER.firstLoopBossGate) !== 0
      && ram.u16(HYPER.bossPhase) !== 0 && ram.u16(HYPER.bossPhase) !== 1) {
    bias += 5;
  }

  bias = Math.min(bias, secondLoop ? 15 : 8);
  ram.setU16(HYPER.bulletSpeedBias, bias);
  return bias;
}

function drawBonusFollowerSide(ram, rom, h, p2) {
  const state = ram.u16(h.player);
  if (i16(state) >= 0 || (state & 0x4000) !== 0 || ram.u16(h.bonus) === 0) return 0;

  let frame = p2 ? 8 : 7;
  const tick = u16(ram.u16(h.bonusTick) - 1);
  ram.setU16(h.bonusTick, tick);
  if (tick === 0xffff) ram.setU16(h.bonusTick, ram.u16(h.bonusReload));
  if (ram.u16(HYPER.phase) !== 0) {
    frame = rom.u32(0x25291c + i16(ram.u16(h.bonusFrame)));
  }

  let pos = ram.u32(h.bonusPos);
  const holdAtStart = ram.u16(HYPER.bossPhase) !== 0
    || (ram.u8(HYPER.flags) & 0x01) !== 0;
  if (!holdAtStart || pos !== 0x001c4410) {
    pos = (pos + 0xc4) >>> 0;
    if (pos === 0x001c8d90) pos = 0x001c4410;
    ram.setU32(h.bonusPos, pos);
  }

  enqueueRegisters(ram, 28, p2 ? 0xff011e00 : 0xff010200, pos, 0x0460, frame);
  return 1;
}

/** `$25292A`, the mirrored player bonus followers in sprite bucket 28. */
export function drawBonusFollowers25292A(ram, rom) {
  if (ram.u16(HYPER.pause) !== 0) return 0;
  return drawBonusFollowerSide(ram, rom, HYPER.p1, false)
    + drawBonusFollowerSide(ram, rom, HYPER.p2, true);
}

function drawHyperStockAnimationSide(ram, h, p2) {
  const state = ram.u16(h.player);
  if (i16(state) >= 0 || ram.u16(h.stock) === 0) return 0;
  if ((state & 0x4000) === 0 && ram.u16(h.bonus) !== 0) {
    const gate = p2 ? ram.u8(HYPER.frame + 1) & 0x02 : ram.u16(HYPER.stockDrawGateP1);
    if (gate === 0) return 0;
  }

  let tick = (ram.u8(h.stockAnimTick) - 1) & 0xff;
  ram.setU8(h.stockAnimTick, tick);
  let pos = ram.u32(h.stockAnimPos);
  let longPause = false;
  if (tick === 0xff) {
    tick = ram.u8(h.stockAnimReload);
    ram.setU8(h.stockAnimTick, tick);
    pos = (pos + 0x74) >>> 0;
    ram.setU32(h.stockAnimPos, pos);
    if (pos === 0x001c40e4) {
      ram.setU8(h.stockAnimTick, 0x10);
      longPause = true;
    }
  }
  if (!longPause && pos === 0x001c4410) {
    pos = 0x001c3f14;
    ram.setU32(h.stockAnimPos, pos);
  }

  enqueueRegisters(ram, 29, p2 ? 0x00811c00 : 0x00810000, pos, 0x0270, 9);
  return 1;
}

/** `$252A52`, the mirrored hyper-stock animation in sprite bucket 29. */
export function drawHyperStockAnimations252A52(ram) {
  if (ram.u16(HYPER.pause) !== 0) return 0;
  return drawHyperStockAnimationSide(ram, HYPER.p1, false)
    + drawHyperStockAnimationSide(ram, HYPER.p2, true);
}

/** `$287682/$287722`, threshold, refusal, immediate spawn, or pending bank. */
export function grantHyper287682(ram, rom, ctx, p2 = false) {
  const h = side(p2);
  if (ram.u16(h.earn) <= 0x095f) return 'below-threshold';
  if (ram.u16(h.stock) === 5 || ram.u16(h.pending) === 4) {
    ram.setU16(h.earn, 0x095f);
    return 'refused';
  }
  ram.setU16(h.earn, 0);
  let bank = false;
  if (ram.u16(HYPER.gate) !== 0) {
    bank = (ram.u16(h.player) & 0x8000) === 0 || ram.u8(h.set) !== 0;
  }
  if (ram.u16(h.active) !== 0) bank = true;
  if (!bank) {
    spawnHyperItem(ram, rom, ctx, h.kind, 0x7000, p2 ? 0x2877ac : 0x28770c);
    ctx?.hyperEvent?.('spawn', h.who, ram.u16(h.stock));
    return 'spawned';
  }
  ram.setU16(h.pending, u16(ram.u16(h.pending) + 1));
  if ((ram.u16(h.player) & 0x8000) !== 0) {
    const n = ram.u16(h.pending);
    ram.setU16(HYPER.arm, rom.u16(0x25531c + (n - 1) * 2));
    ram.setU16(HYPER.mode, n === 5 ? (p2 ? 0x3c : 0x2c) : (p2 ? 0x30 : 0x20));
  }
  ctx?.hyperEvent?.('pending', h.who, ram.u16(h.pending));
  return 'pending';
}

/** `$2875B4/$287616`, called on hyper end and on the last bomb. */
export function flushPendingHyper2875B4(ram, rom, ctx, p2 = false) {
  const h = side(p2);
  if (ram.u16(HYPER.gate) !== 0) {
    if ((ram.u16(h.player) & 0x8000) !== 0) {
      if (ram.u8(h.player + 0x24) !== 0) return 0;
    } else if ((ram.u16(p2 ? 0x8130c0 : 0x8130be) & 0x8000) === 0) {
      return 0;
    }
  }
  let count = ram.u16(h.pending);
  if (count === 0) return 0;
  if (ram.u16(h.earn) === 0x095f) {
    ram.setU16(h.earn, 0);
    count = u16(count + 1);
  }
  let d6 = 0x7000;
  for (let n = 0; n < count; n++, d6 = u16(d6 + 0x0800)) {
    spawnHyperItem(ram, rom, ctx, h.kind, d6, p2 ? 0x28765e : 0x2875fc);
  }
  ram.setU16(h.pending, 0);
  return count;
}

/** `$249868..$2498DE`, the non-zero-stock arm of Button 2. */
export function requestHyper249868(ram, rom, ctx, rec, p2 = false) {
  const h = side(p2);
  const stock = ram.u16(h.stock);
  if (stock === 0) return false;
  const rankPower = u16(ram.u16(h.power) - 1);
  const table = ram.u16(0x813098) === 0 ? 0x252b44 : 0x252b8a;
  const signedPower = rankPower & 0x8000 ? rankPower - 0x10000 : rankPower;
  void rom.u16(table + signedPower * 2);
  ram.setU16(HYPER.arm, u16(ram.u16(HYPER.arm) + 8));
  ram.setU16(HYPER.mode, rom.u16((p2 ? 0x255330 : 0x255326) + (stock - 1) * 2));
  beamReset25270C(ram, ctx, p2 ? 1 : 0);
  ram.setU16(h.req, 1);
  ram.bset8(rec + P.flags1, 0);
  ctx?.soundPost?.(0x28c8da);
  armHyperCancel(ram, ctx, p2);
  ram.setU8(rec + P.invuln, 2);
  ram.setU16(0x80392e, 0x14);
  ctx?.hyperEvent?.('request', h.who, stock);
  return true;
}

function armHyperCancel(ram, ctx, p2) {
  if (ram.u16(HYPER.arm) !== 0 && ram.u16(HYPER.mode) >= 0x20
      && ram.u16(HYPER.mode) <= 0x3c) return false;
  ram.setU16(HYPER.arm, 1);
  ram.setU16(HYPER.mode, 0xffff);
  ctx?.hyperEvent?.('cancel', p2 ? 2 : 1, p2 ? 0x8008 : 0x8010);
  return true;
}

function flashInit(ram, h) {
  ram.setU32(h.flashSprite, 0x000530fc);
  ram.setU16(h.liveFlash, 1);
  ram.setU16(h.flashTick, 1);
}

function liveFlash(ram, h) {
  if (ram.u16(h.liveFlash) === 0) return;
  if ((ram.u16(h.player) & 0x8000) !== 0 && ram.u16(HYPER.drawGate) === 0) {
    const pos = (ram.u32(h.pos) + 0xf200f600) >>> 0;
    enqueueRegisters(ram, 18, pos, ram.u32(h.flashSprite), 0x0e50, 4);
  }
  const tick = (ram.u8(h.flashTick) - 1) & 0xff;
  ram.setU8(h.flashTick, tick);
  if (tick === 0xff) {
    ram.setU8(h.flashTick, ram.u8(h.flashTick + 1));
    const sprite = (ram.u32(h.flashSprite) + 0x234) >>> 0;
    ram.setU32(h.flashSprite, sprite);
    if (sprite === 0x00056eac) ram.setU16(h.liveFlash, 0);
  }
}

function endFlash(ram, rom, h) {
  const timer = ram.u16(h.endFlash);
  if (timer === 0) return;
  ram.setU32(h.flashSprite, rom.u32(0x2874e0 + timer));
  if ((ram.u16(h.player) & 0x8000) !== 0 && ram.u16(HYPER.drawGate) === 0) {
    const pos = (ram.u32(h.pos) + 0xf200f600) >>> 0;
    enqueueRegisters(ram, 18, pos, ram.u32(h.flashSprite), 0x0e50, 4);
  }
  ram.setU16(h.endFlash, u16(timer - 4));
}

export function endHyper285AF2(ram, rom, ctx, p2 = false, redrawStock = null) {
  const h = side(p2);
  if (ram.u16(h.active) !== 0) ram.setU16(h.endFlash, 0x48);
  beamReset25270C(ram, ctx, p2 ? 1 : 0);
  ram.bclr8(h.player + P.flags1, 0);
  ram.setU16(h.active, 0);
  ram.setU16(h.gauge, 0);
  ram.setU16(h.level, 0);
  ram.setU16(h.req, 0);
  redrawStock?.(p2 ? 1 : 0);                         // $285B24/$285C4E
  flushPendingHyper2875B4(ram, rom, ctx, p2);
  ctx?.hyperEvent?.('end', h.who, ram.u16(h.power));
}

/** `$25392E/$253968` -- the no-lives death reset. Power is deliberately not
 * cleared: the death call site quarters `$81B646/$81B648` before this routine,
 * and these two reset bodies have no write to either power word. */
export function resetHyper25392E(ram, p2 = false) {
  const h = side(p2);
  ram.setU16(h.active, 0);                              // $253930/$25396A
  ram.setU16(h.earn, 0);                                // $253936/$253970
  ram.setU16(h.gauge, 0);                               // $25393C/$253976
  ram.setU16(h.subTick, 0);                             // $253942/$25397C
  ram.setU16(h.level, 0);                               // $253948/$253982
  ram.setU16(h.req, 0);                                 // $25394E/$253988
  ram.setU16(h.stock, 0);                               // $253954/$25398E
  ram.setU16(p2 ? 0x81b6a0 : 0x81b660, 0);             // $25395A/$253994
  ram.setU16(h.pending, 0);                             // $253960/$25399A
}

/** `$285A12/$285B3C`, in the type-0 object's authentic frame slot. */
export function stepHyper285A12(ram, rom, ctx, p2 = false, redrawStock = null) {
  const h = side(p2);
  if (ram.u16(h.active) === 0 && ram.u16(h.req) !== 0) {
    if ((ram.u8(h.player) & 0x11) !== 0) return;
    ram.setU16(h.active, 1);
    flashInit(ram, h);
    if (ram.u16(p2 ? 0x81b5ea : 0x81b5c0) !== 0) {
      ram.setU16(p2 ? 0x81b5ea : 0x81b5c0, ram.u16(0x81b5b2));
    }
    const stock = ram.u16(h.stock);
    ram.setU16(h.level, stock);
    ram.setU16(h.power, Math.min(0x23, u16(ram.u16(h.power) + stock)));
    ram.setU16(h.subTick, 0);
    ram.setU16(h.stock, 0);
    redrawStock?.(p2 ? 1 : 0);                       // $285A3E/$285B68
    const invuln = p2 ? 0x50 : ((ram.u8(HYPER.flags) & 0x04) ? 0x78 : 0x50);
    ram.setU8(h.player + 0x3e, invuln);
    ctx?.hyperEvent?.('activate', h.who, stock);
  }
  if (ram.u16(h.active) !== 0) {
    liveFlash(ram, h);
    if ((ram.u8(h.player) & 0x01) !== 0) {
      endHyper285AF2(ram, rom, ctx, p2, redrawStock);
      return;
    }
    if (ram.u16(h.chain) >= 0x10 && ram.u16(h.chainMeter) !== 0) {
      ram.setU16(h.chainPulse, 0x78);
      ram.setU16(h.chainSaved, ram.u16(h.chainMeter));
      ram.setU16(h.chainHold, 0x78);
    }
    if ((ram.u8(HYPER.flags) & 0x40) === 0 && ram.u16(HYPER.pause) === 0) {
      const before = ram.u16(h.gauge);
      ram.setU16(h.gauge, u16(before - 2));
      if (before < 2) {
        endHyper285AF2(ram, rom, ctx, p2, redrawStock);
        return;
      }
    }
  } else {
    endFlash(ram, rom, h);
  }
}

/** `$249970/$249976`, bombing during hyper ends it and permanently debits 3. */
export function bombEndHyper249970(ram, rom, ctx, p2 = false) {
  const h = side(p2);
  if (ram.u16(h.active) === 0) return false;
  endHyper285AF2(ram, rom, ctx, p2);
  ram.setU16(h.power, Math.max(0, ram.u16(h.power) - 3));
  return true;
}
