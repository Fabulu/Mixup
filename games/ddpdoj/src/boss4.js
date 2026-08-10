// Stage-4 Type $40 boss entry and arrival bootstrap.
//
// This slice owns the spawn wrapper, the live no-hit/damage controller, F0,
// MAIN0, and the initially visible A2 object 10. The next normal-play frontier
// is A3/D9, reached later in the same scheduler walk as MAIN0's handoff.

import { asr, i16, i32, u16 } from './ram.js';
import { unreached } from './unported.js';
import { freeEnemy } from './initbody.js';
import { scoreHit } from './score.js';
import { livePlayers2428A6 } from './boss.js';
import { applyVelocity } from './movement.js';
import { install24150A } from './palette.js';
import { loadAnimObjects246410 } from './animobjects.js';
import { enqueueRegistersThroughStub } from './spritequeue.js';
import { runStageAdvance242952 } from './stageend.js';
import {
  runScheduler25962E, registerScript, seqStart2598D0, a2Run2598E6,
  a2Stop25994A, a4Start25980C, a4Clear2598A2, a1Clear259B34,
  a3Start259962,
} from './scheduler.js';

const due8 = (ram, addr) => {
  const old = ram.u8(addr);
  ram.setU8(addr, old - 1);
  return old === 0;
};

function phaseDeathNotYet() {
  unreached(0x29fe8a,
    'Stage-4 boss reached its death conductor beyond the W219 arrival slice');
}

function placeBoss4Parts29F50E(ram, ctx, slot) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  if (due8(ram, slot + 0x04)) {
    ram.setU8(slot + 0x04, ram.u8(slot + 0x05));
    const target = ram.u8(slot + 0x02);
    const speed = ram.u8(a6 + 0x1a);
    if (speed < target) ram.setU8(a6 + 0x1a, speed + 1);
    else if (speed > target) ram.setU8(a6 + 0x1a, speed - 1);
  }
  applyVelocity(ram, ctx.tables, a5);

  const pos = ram.u32(a6 + 0x02);
  ram.setU32(a6 + 0x22, pos);
  ram.setU16(a6 + 0x22, ram.u16(a6 + 0x22) + ram.u16(a6 + 0x194));
  ram.setU16(a6 + 0x24, ram.u16(a6 + 0x24) + ram.u16(a6 + 0x196));

  ram.setU32(a6 + 0x82, (pos + 0xf2bff500) >>> 0);
  ram.setU16(a6 + 0x82, ram.u16(a6 + 0x82) + ram.u16(a6 + 0x18c));
  ram.setU16(a6 + 0x84, ram.u16(a6 + 0x84) + ram.u16(a6 + 0x18e));
  ram.setU32(a6 + 0xa2, (pos + 0xf3000ac0) >>> 0);
  ram.setU16(a6 + 0xa2, ram.u16(a6 + 0xa2) + ram.u16(a6 + 0x190));
  ram.setU16(a6 + 0xa4, ram.u16(a6 + 0xa4) + ram.u16(a6 + 0x192));

  const linked = ram.u32(a6 + 0x22);
  ram.setU32(a6 + 0x42, linked);
  ram.setU16(a6 + 0x42, ram.u16(a6 + 0x42) - 0x2200);
  ram.setU32(a6 + 0x62, ram.u32(a6 + 0x42));
  ram.setU16(a6 + 0x62, ram.u16(a6 + 0x62) + 0x0a00);
  ram.setU32(a6 + 0xc2, ram.u32(a6 + 0x42));
  ram.setU16(a6 + 0xc2, ram.u16(a6 + 0xc2) + 0x0a40);
  ram.setU16(a6 + 0xc4, ram.u16(a6 + 0xc4) + 0xf5c0);
  ram.setU32(a6 + 0xe2, ram.u32(a6 + 0x42));
  ram.setU16(a6 + 0xe2, ram.u16(a6 + 0xe2) + 0x0a40);
  ram.setU16(a6 + 0xe4, ram.u16(a6 + 0xe4) + 0x0a40);
  ram.setU32(a6 + 0x102, ram.u32(a6 + 0x42));
  ram.setU16(a6 + 0x102, ram.u16(a6 + 0x102) + 0xfb40);
  ram.setU32(a6 + 0x122, (pos - 0x14000000) >>> 0);
}

function resetBoss4Palettes(ram, a6) {
  for (const [off, value] of [
    [0x146, 0x13], [0x147, 0x14], [0x148, 0x15],
    [0x149, 0x15], [0x14a, 0x15], [0x14b, 0x14],
  ]) ram.setU8(a6 + off, value);
}

/** `$29FB5C`, translated through the first live phase threshold. */
export function boss4Damage29FB5C(ram, _rom, a5, a6, ctx) {
  if (ram.u16(a6 + 0x166) !== 0) return;
  ram.setU16(0x8130e6, 0);

  let hit = 0;
  let carriedDamage = 0;
  const externalPending = ram.u16(0x8130e8) !== 0;
  if (externalPending) {
    hit = ram.u16(0x8130ea);
    ram.setU16(a6 + 0x16a, hit);
    carriedDamage = ram.u16(0x8130e8) >>> 1;
    ram.setU16(0x8130e8, 0);
    ram.setU16(0x8130e6, 1);
  } else {
    hit = (ram.u8(a6 + 0x20) | ram.u8(a6 + 0x40) | ram.u8(a6 + 0x60)) & 0x5c;
    if (hit !== 0) ram.setU16(a6 + 0x16a, hit);
  }

  if (externalPending || hit !== 0) {
    for (const off of [0x20, 0x40, 0x60]) ram.setU8(a6 + off, ram.u8(a6 + off) & 0xa3);
    scoreHit(ram, ctx, a6, hit);
    if (ram.u8(a6 + 0x146) === 0x19) resetBoss4Palettes(ram, a6);
    ram.setU8(a6 + 0x146, ram.u8(a6 + 0x146) ^ 0x0c);
    if (ram.u8(a6 + 0x5f) === 0) {
      for (const [off, mask] of [
        [0x147, 0x0b], [0x148, 0x0a], [0x149, 0x0a], [0x14a, 0x0a],
      ]) ram.setU8(a6 + off, ram.u8(a6 + off) ^ mask);
    }
    ram.setU8(a6 + 0x14b, ram.u8(a6 + 0x14b) ^ 0x0b);

    let damage = carriedDamage;
    if (!externalPending) {
      damage = Math.max(...[0x38, 0x58, 0x78]
        .map((off) => u16(0x7fff - ram.u16(a6 + off))));
    }
    if (ram.u16(a6 + 0x168) === 0)
      ram.setU32(a5 + 0x16, (ram.u32(a5 + 0x16) - damage) >>> 0);
    for (const off of [0x38, 0x58, 0x78]) ram.setU16(a6 + off, 0x7fff);
  } else {
    resetBoss4Palettes(ram, a6);
    if (ram.u32(a5 + 0x16) <= 0x0000c400 && ram.u16(0x8130ca) === 0)
      for (let off = 0x146; off <= 0x14b; off++) ram.setU8(a6 + off, 0x19);
  }

  for (const [part, hpOff, palOff] of [[0x80, 0x98, 0x14c], [0xa0, 0xb8, 0x14d]]) {
    const partHit = ram.u8(a6 + part) & 0x5c;
    if (partHit === 0) ram.setU8(a6 + palOff, 0x13);
    else {
      ram.setU8(a6 + part, ram.u8(a6 + part) & 0xa3);
      if (ram.u8(a6 + palOff) === 0x19) ram.setU8(a6 + palOff, 0x13);
      ram.setU8(a6 + palOff, ram.u8(a6 + palOff) ^ 0x0c);
      const damage = u16(0x7fff - ram.u16(a6 + hpOff));
      if (i16(damage) > i16(ram.u16(0x8130e8))) {
        ram.setU16(0x8130e8, damage);
        ram.setU16(0x8130ea, partHit);
      }
      ram.setU16(a6 + hpOff, 0x7fff);
    }
  }

  if (i32(ram.u32(a5 + 0x16)) < 0) {
    if (livePlayers2428A6(ram) === 0) ram.setU32(a5 + 0x16, 0x200);
    else phaseDeathNotYet();
  }

  if (ram.u8(a6 + 0x16c) === 0) {
    const timeout = u16(ram.u16(a5 + 0x1a) - 1);
    ram.setU16(a5 + 0x1a, timeout);
    if (timeout === 0 || i32((ram.u32(a5 + 0x16) - 0x00023000) >>> 0) < 0) {
      ram.setU8(a6 + 0x16c, 1);
      a1Clear259B34(ram); a4Clear2598A2(ram);
      ram.setU16(0x8130e2, 1);
      a4Start25980C(ram, 1);
      ram.setU8(a6 + 0x5f, 1);
      ctx.bossEvent?.('phase-1', ram.u16(0x8130ce));
    }
  }
  if (ram.u8(a6 + 0x16d) === 0 && ram.u32(a5 + 0x16) < 0x0000c400) {
    unreached(0x29fe52,
      'Stage-4 boss low-HP transition is beyond the W219 arrival slice');
  }

  if (ram.u16(0x8130d2) === 0 && ram.u8(a6 + 0x16c) !== 0) {
    const timeout = u16(ram.u16(a5 + 0x1c) - 1);
    ram.setU16(a5 + 0x1c, timeout);
    if (timeout === 0) {
      if (livePlayers2428A6(ram) === 0) ram.setU16(a5 + 0x1c, 0x78);
      else phaseDeathNotYet();
    }
  }
}

export function handlerBoss29EF0A(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  ctx.bossRec = a5;
  ctx.bossSubRec = a6;
  if (runScheduler25962E(ram, rom, ctx)) {
    runStageAdvance242952(ram, rom, ctx);
    freeEnemy(ram, a5);
    return;
  }
  boss4Damage29FB5C(ram, rom, a5, a6, ctx);
}

function f0_2A017A(ram, rom, ctx, a4) {
  if (ctx.palette) install24150A(ram, ctx.palette, 0x15,
    rom.bytes(0x222ff8, 64), 0x2a0184, 'Stage-4 boss arrival palette');
  seqStart2598D0(ram, 0);
  a2Run2598E6(ram, 10);
  ram.setU16(a4, 0);
}
function f0Step2A019A(ram, _rom, _ctx, a4) { ram.setU16(a4, 0); }

function main0Step29F5FE(ram, rom, ctx, slot) {
  const a6 = ctx.bossSubRec;
  if (ram.u8(slot + 0x06) === 0) {
    ram.setU8(slot + 0x0b, ram.u8(slot + 0x0b) + 2);
    const speed = ram.u16(slot + 0x08) >>> 2;
    const v = ctx.tables.shotVector(speed, ram.u8(slot + 0x0b));
    const dx8 = u16(v.dx << 3);
    let selector = asr(asr(-i16(dx8), 6), 4) + 7;
    selector = Math.max(0, Math.min(15, selector));
    ram.setU16(a6 + 0x126, selector * 4);
    ram.setU16(a6 + 0x04, u16(0x1c00 + dx8 - ram.u16(0x813172)));
    ram.setU16(a6 + 0x02, ram.u16(a6 + 0x02) + ram.u16(slot + 0x08));
    const descent = u16(ram.u16(slot + 0x08) - 5);
    ram.setU16(slot + 0x08, descent);
    if (i16(descent) <= 0) {
      ram.setU16(slot + 0x08, 0);
      ram.setU8(slot + 0x06, 1);
      a2Stop25994A(ram, 10);
      a2Run2598E6(ram, 11);
    }
  }

  if (ram.u8(slot + 0x06) === 1 && due8(ram, slot + 0x0c)) {
    ram.setU8(slot + 0x0c, ram.u8(slot + 0x0d));
    const cursor = u16(ram.u16(a6 + 0x128) + 4);
    ram.setU16(a6 + 0x128, cursor);
    if (cursor > 0x1c) {
      ram.setU16(a6 + 0x128, 0);
      a2Stop25994A(ram, 11);
      if (ctx.palette) install24150A(ram, ctx.palette, 0x15,
        rom.bytes(0x222fb8, 64), 0x29f6c6, 'Stage-4 boss active palette');
      ram.setU8(0x8130f8, ram.u8(0x8130f8) | 0x12);
      ram.setU16(0x81b6e4, 1);
      seqStart2598D0(ram, 1);
      a4Start25980C(ram, 3);
      a3Start259962(ram, 9);
      a3Start259962(ram, 10);
      // D9 is reached later in this scheduler walk and is the next frontier.
      for (let id = 0; id <= 5; id++) a2Run2598E6(ram, id);
      for (const off of [0x20, 0x40, 0x60]) ram.setU16(a6 + off, 0xa001);
      loadAnimObjects246410(ram, rom, 0x29f756);
    }
  }
  placeBoss4Parts29F50E(ram, ctx, slot);
}

function main0Init29F5BC(ram, rom, ctx, slot) {
  const a6 = ctx.bossSubRec;
  ram.setU8(slot + 0x02, 0);
  ram.setU16(slot + 0x04, 0);
  ram.setU16(a6 + 0x1a, 0x0020);
  ram.setU8(slot + 0x06, 0);
  ram.setU16(slot + 0x08, 0x0280);
  ram.setU8(slot + 0x0a, 1);
  ram.setU8(slot + 0x0b, 0);
  ram.setU16(slot + 0x0c, 0x0101);
  ram.setU16(a6 + 0x126, 0x001c);
  ram.setU16(a6 + 0x128, 0);
  ram.setU16(a6 + 0x168, 0);
  main0Step29F5FE(ram, rom, ctx, slot);
}

function object10_29F3F0(ram, rom, ctx) {
  const a6 = ctx.bossSubRec;
  const sprite = rom.u32(0x29f414 + ram.u16(a6 + 0x126));
  enqueueRegistersThroughStub(ram, rom, 0x23df86,
    (ram.u32(a6 + 0x122) + 0xd800e800) >>> 0,
    sprite, 0x28c0, 0x0015);
}

registerScript(0x2a017a, f0_2A017A);
registerScript(0x2a019a, f0Step2A019A);
registerScript(0x29f5bc, main0Init29F5BC);
registerScript(0x29f5fe, main0Step29F5FE);
registerScript(0x29f3f0, object10_29F3F0);
