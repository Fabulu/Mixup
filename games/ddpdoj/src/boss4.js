// Stage-4 Type $40 boss entry and arrival bootstrap.
//
// This slice owns the spawn wrapper, the live no-hit/damage controller, F0,
// MAIN0/MAIN1, D9/D10, the first seven visible A2 objects, A4/F3, and its
// mirrored A1/E1 and E2 attack families, the F4/E3/E5 bridge which closes the
// normal first-phase loop, the damage-driven F1 destruction transition, and the
// second phase it hands to: MAIN4 and the seven-arm F5 conductor.
//
// F5's A3 descendants (3..8, one routine six times) came with it. The next live
// frontier is the rest of what F5 arms: A1 6/7/8/9/10 and MAIN7.

import { asr, i16, i32, u16 } from './ram.js';
import { unreached } from './unported.js';
import { freeEnemy } from './initbody.js';
import { scoreHit } from './score.js';
import { livePlayers2428A6, bigBurst28B4BE } from './boss.js';
import { spawnEffect, B } from './effects.js';
import { applyVelocity } from './movement.js';
import { install24150A } from './palette.js';
import { loadAnimObjects246410 } from './animobjects.js';
import { AimTables, aim64, aim64FromCaller, aim256FromCaller, slew64 } from './aim.js';
import { drawByte242B3C, drawWord242EC2, drawWord24328E } from './rng.js';
import { dist242494 } from './bossscripts.js';
import { fire as fireBullet, WriteLog } from './bullets.js';
import { enqueueRegistersThroughStub } from './spritequeue.js';
import { enqueueDeferred, DEFQ_D1 } from './spawn.js';
import { runStageAdvance242952 } from './stageend.js';
import {
  runScheduler25962E, registerScript, seqStart2598D0, a2Run2598E6,
  a2Stop25994A, a4Start25980C, a4Clear2598A2, a1Clear259B34,
  a3Start259962, a3Running2599B4, a3Stop2599EC, a1Start259A18, a1Running259A4A,
  a1Stop259B08, seqStop2598BE,
} from './scheduler.js';

const due8 = (ram, addr) => {
  const old = ram.u8(addr);
  ram.setU8(addr, old - 1);
  return old === 0;
};

const due16 = (ram, addr) => {
  const old = ram.u16(addr);
  ram.setU16(addr, old - 1);
  return old === 0;
};

const AIM_TABLES = new WeakMap();
function aimTables(rom) {
  let tables = AIM_TABLES.get(rom);
  if (!tables) { tables = new AimTables(rom); AIM_TABLES.set(rom, tables); }
  return tables;
}

function spriteAttr(ram, a6, attrOff, paletteOff) {
  return (ram.u16(a6 + attrOff) & 0xff00) | ram.u8(a6 + paletteOff);
}

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
      // D9 and D10 run later in this scheduler walk, before the A2 objects.
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

function object0_29EF88(ram, rom, ctx) {
  const a6 = ctx.bossSubRec;
  enqueueRegistersThroughStub(ram, rom, 0x23e056,
    (ram.u32(a6 + 0x22) + 0xee00ee00) >>> 0,
    rom.u32(0x29efb2 + ram.u16(a6 + 0x26)), 0x1290,
    spriteAttr(ram, a6, 0x3c, 0x146));
}

function object1_29F0D6(ram, rom, ctx) {
  const a6 = ctx.bossSubRec;
  enqueueRegistersThroughStub(ram, rom, 0x23e056,
    (ram.u32(a6 + 0x42) + 0xe800ec00) >>> 0,
    rom.u32(0x29f100 + ram.u16(a6 + 0x46)), 0x18a0,
    spriteAttr(ram, a6, 0x5c, 0x147));
}

function object2_29F120(ram, rom, ctx) {
  const a6 = ctx.bossSubRec;
  enqueueRegistersThroughStub(ram, rom, 0x23e056,
    (ram.u32(a6 + 0x62) + 0xf600fa00) >>> 0,
    rom.u32(0x29f14a + ram.u16(a6 + 0x66)), 0x0a30,
    spriteAttr(ram, a6, 0x7c, 0x148));
}

function object3_29F16A(ram, rom, ctx) {
  const a6 = ctx.bossSubRec;
  enqueueRegistersThroughStub(ram, rom, 0x23e056,
    (ram.u32(a6 + 0xc2) + 0xf800fa00) >>> 0,
    rom.u32(0x29f19a + ram.u16(a6 + 0xc6) * 4), 0x0830,
    spriteAttr(ram, a6, 0xdc, 0x149));
}

function object4_29F1FA(ram, rom, ctx) {
  const a6 = ctx.bossSubRec;
  enqueueRegistersThroughStub(ram, rom, 0x23e056,
    (ram.u32(a6 + 0xe2) + 0xf800fa00) >>> 0,
    rom.u32(0x29f19a + ram.u16(a6 + 0xe6) * 4), 0x0830,
    spriteAttr(ram, a6, 0xfc, 0x14a));
}

function object5_29F228(ram, rom, ctx) {
  const a6 = ctx.bossSubRec;
  const headingOff = ((ram.u8(a6 + 0x11b) + 1) & 0x3e) << 1;
  enqueueRegistersThroughStub(ram, rom, 0x23e056,
    (ram.u32(a6 + 0x102) + 0xfa00fb00) >>> 0,
    rom.u32(0x29f25e + headingOff), 0x0628,
    spriteAttr(ram, a6, 0x11c, 0x14b));
}

function object6_29EFD2(ram, rom, ctx) {
  const a6 = ctx.bossSubRec;
  enqueueRegistersThroughStub(ram, rom, 0x23e056,
    (ram.u32(a6 + 0x22) - 0x04000000 + 0xe600ea00) >>> 0,
    rom.u32(0x29f002 + ram.u16(a6 + 0x106)), 0x1ab0,
    spriteAttr(ram, a6, 0x3c, 0x146));
}

function object7_29F2DE(ram, rom, ctx) {
  const a6 = ctx.bossSubRec;
  const attr = spriteAttr(ram, a6, 0x9c, 0x14c);
  enqueueRegistersThroughStub(ram, rom, 0x23defc,
    (ram.u32(a6 + 0x82) + 0xf000f800) >>> 0,
    rom.u32(0x29f336 + ram.u16(a6 + 0x86)), 0x1040, attr);
  enqueueRegistersThroughStub(ram, rom, 0x23defc,
    (ram.u32(a6 + 0x82) + 0xfa00fc00 + 0xf9400200) >>> 0,
    rom.u32(0x29f356 + ram.u16(a6 + 0x88)), 0x0620, attr);
}

function object8_29F37A(ram, rom, ctx) {
  const a6 = ctx.bossSubRec;
  enqueueRegistersThroughStub(ram, rom, 0x23defc,
    (ram.u32(a6 + 0xa2) + 0xf000f800) >>> 0,
    rom.u32(0x29f3d0 + ram.u16(a6 + 0xa6)), 0x1040,
    spriteAttr(ram, a6, 0xbc, 0x14d));
  enqueueRegistersThroughStub(ram, rom, 0x23defc,
    (ram.u32(a6 + 0xa2) + 0xfa00fc00 + 0xf93ffe40) >>> 0,
    rom.u32(0x29f356 + ram.u16(a6 + 0xa8)), 0x0620,
    spriteAttr(ram, a6, 0xbc, 0x14c));
}

function object9_29F03E(ram, rom, ctx) {
  const a6 = ctx.bossSubRec;
  const attr = spriteAttr(ram, a6, 0x3c, 0x146);
  enqueueRegistersThroughStub(ram, rom, 0x23e056,
    (ram.u32(a6 + 0x22) - 0x02000000 + 0xec00e300) >>> 0,
    rom.u32(0x29f096 + ram.u16(a6 + 0x106)), 0x14e8, attr);
  enqueueRegistersThroughStub(ram, rom, 0x23e056,
    (ram.u32(a6 + 0x22) + 0x0d000000 + 0xf600f600) >>> 0,
    0x000dafc4, 0x0a50, attr);
}

function d9_2A15BE(ram, rom, ctx) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  const aimed = aim64FromCaller(aimTables(rom), ram, a5,
    ram.u16(a6 + 0x102), ram.u16(a6 + 0x104));
  if (!aimed.carry)
    ram.setU8(a6 + 0x11b, slew64(ram.u8(a6 + 0x11b), aimed.dir));
}

function d10_2A15DE(ram, _rom, ctx) {
  const a6 = ctx.bossSubRec;
  for (const off of [0x26, 0x46, 0x86, 0xa6])
    ram.setU16(a6 + off, (ram.u16(a6 + off) + 4) & 0x1f);
}

function incC6_2A1720(ram, a6) {
  const next = u16(ram.u16(a6 + 0xc6) + 1);
  ram.setU16(a6 + 0xc6, next === 0x18 ? 0 : next);
}

function decE6_2A174C(ram, a6) {
  const next = u16(ram.u16(a6 + 0xe6) - 1);
  ram.setU16(a6 + 0xe6, i16(next) < 0 ? 0x17 : next);
}

function decC6_2A1736(ram, a6) {
  const next = u16(ram.u16(a6 + 0xc6) - 1);
  ram.setU16(a6 + 0xc6, i16(next) < 0 ? 0x17 : next);
}

function incE6_2A1762(ram, a6) {
  const next = u16(ram.u16(a6 + 0xe6) + 1);
  ram.setU16(a6 + 0xe6, next === 0x18 ? 0 : next);
}

function boss4Point(rom, index) {
  let i = u16(index);
  if (i > 0x17) i = u16(i - 0x18);
  return { angle: rom.u8(0x2a1708 + i), vector: rom.u32(0x2a16a4 + i * 4) };
}

function shootBoss4(ram, rom, ctx, site, entry, regs) {
  const result = fireBullet({ ram, rom, log: new WriteLog(ram) }, entry, regs);
  ctx.bulletSpawn?.(site, result);
}

function regsBoss4(a5, d0, d1, d2, d3) {
  return { d0: d0 >>> 0, d1: d1 & 0xff, d2: d2 >>> 0, d3: d3 >>> 0,
    d4: 0, d5: 0, a5 };
}

function startF3Attack(ram, id, parameter) {
  const child = a1Start259A18(ram, id);
  ram.setU16(child + 0x02, parameter);
}

export function f3Step2A0984(ram, _rom, ctx, slot) {
  const a6 = ctx.bossSubRec;

  if (ram.u8(slot + 0x02) === 0) {
    let moving = false;
    if (ram.u16(a6 + 0xc6) !== ram.u16(slot + 0x08)) {
      incC6_2A1720(ram, a6);
      moving = true;
    }
    if (ram.u16(a6 + 0xe6) !== ram.u16(slot + 0x0a)) {
      decE6_2A174C(ram, a6);
      moving = true;
    }
    if (!moving) ram.setU8(slot + 0x02, 1);
  }

  if (ram.u8(slot + 0x02) === 1 && due8(ram, slot + 0x04)) {
    ram.setU8(slot + 0x04, ram.u8(slot + 0x05));
    const cadenceDue = due8(ram, slot + 0x0c);
    let holdDuration = false;
    if (cadenceDue) {
      ram.setU8(slot + 0x0c, ram.u8(slot + 0x0d));
      if (ram.u8(slot + 0x05) !== 6) {
        ram.setU8(slot + 0x05, ram.u8(slot + 0x05) - 1);
        holdDuration = true;
      }
    }
    if (!holdDuration) {
      const remaining = u16(ram.u16(slot + 0x0e) - 1);
      ram.setU16(slot + 0x0e, remaining);
      if (remaining === 0) {
        ram.setU8(slot + 0x02, 2);
        ram.setU8(slot + 0x15, 0x60);
      }
    }
    const ids = [1, 2];
    startF3Attack(ram, ids[ram.u16(slot + 0x06) >>> 1], 0);
    ram.setU16(slot + 0x06, (ram.u16(slot + 0x06) + 2) & 3);
  }

  if (ram.u8(slot + 0x02) === 2) {
    if (ram.u8(slot + 0x15) !== 0) {
      ram.setU8(slot + 0x15, ram.u8(slot + 0x15) - 1);
    } else if (!a1Running259A4A(ram, 1)) {
      if (due8(ram, slot + 0x04)) {
        ram.setU8(slot + 0x04, ram.u8(slot + 0x05));
        startF3Attack(ram, 1, 1);
      }
      if (!a1Running259A4A(ram, 2) && due8(ram, slot + 0x10)) {
        ram.setU8(slot + 0x10, ram.u8(slot + 0x11));
        const left = u16(ram.u8(slot + 0x12) - 1) & 0xff;
        ram.setU8(slot + 0x12, left);
        if (left === 0) {
          ram.setU8(slot + 0x12, 2);
          ram.setU8(slot + 0x02, 3);
          const cycles = u16(ram.u8(slot + 0x14) - 1) & 0xff;
          ram.setU8(slot + 0x14, cycles);
          if (cycles === 0) {
            ram.setU8(slot + 0x02, 4);
            ram.setU8(slot + 0x15, 0x10);
          }
        } else {
          startF3Attack(ram, 2, 2);
        }
      }
    }
  }

  if (ram.u8(slot + 0x02) === 3) {
    if (ram.u8(slot + 0x15) !== 0) {
      ram.setU8(slot + 0x15, ram.u8(slot + 0x15) - 1);
    } else {
      if (due8(ram, slot + 0x04)) {
        ram.setU8(slot + 0x04, ram.u8(slot + 0x05));
        startF3Attack(ram, 2, 1);
      }
      if (!a1Running259A4A(ram, 1) && due8(ram, slot + 0x10)) {
        ram.setU8(slot + 0x10, ram.u8(slot + 0x11));
        const left = u16(ram.u8(slot + 0x13) - 1) & 0xff;
        ram.setU8(slot + 0x13, left);
        if (left === 0) {
          ram.setU8(slot + 0x13, 2);
          ram.setU8(slot + 0x02, 2);
          const cycles = u16(ram.u8(slot + 0x14) - 1) & 0xff;
          ram.setU8(slot + 0x14, cycles);
          if (cycles === 0) {
            ram.setU8(slot + 0x02, 4);
            ram.setU8(slot + 0x15, 0x10);
          }
        } else {
          startF3Attack(ram, 1, 2);
        }
      }
    }
  }

  if (ram.u8(slot + 0x02) === 4) {
    const wait = u16(ram.u8(slot + 0x15) - 1) & 0xff;
    ram.setU8(slot + 0x15, wait);
    if (wait === 0) {
      ram.setU8(slot + 0x02, 5);
      startF3Attack(ram, 1, 3);
      startF3Attack(ram, 2, 3);
    }
  }

  if (ram.u8(slot + 0x02) === 5
      && !a1Running259A4A(ram, 1) && !a1Running259A4A(ram, 2)) {
    ram.setU16(slot, 0);
    a4Start25980C(ram, 4);
  }
}

export function f3Init2A092C(ram, rom, ctx, slot) {
  ram.setU8(slot + 0x02, 0);
  ram.setU16(slot + 0x04, 0x200c);
  ram.setU16(slot + 0x06, 0);
  ram.setU16(slot + 0x08, drawWord242EC2(ram, rom) & 0x0f);
  ram.setU16(slot + 0x0a, drawWord242EC2(ram, rom) & 0x0f);
  ram.setU16(slot + 0x0c, 0x0101);
  ram.setU16(slot + 0x0e, 0x0020);
  ram.setU16(slot + 0x10, 0x0808);
  ram.setU8(slot + 0x12, 2);
  ram.setU8(slot + 0x13, 2);
  ram.setU8(slot + 0x14, 2);
  ram.setU8(slot + 0x15, 0x10);
  f3Step2A0984(ram, rom, ctx, slot);
}

function main1Step29F7A2(ram, rom, ctx, slot) {
  const a6 = ctx.bossSubRec;
  const waypoints = [[0x7800, 0x1c00], [0x7600, 0x1e00],
    [0x7400, 0x1600], [0x7200, 0x1800]];
  const target = waypoints[ram.u16(slot + 0x06) >>> 2];
  const wanted = aim64(aimTables(rom), ram.u16(a6 + 0x02), ram.u16(a6 + 0x04),
    target[0], target[1]);
  ram.setU8(a6 + 0x1b, slew64(ram.u8(a6 + 0x1b), wanted));
  const distance = dist242494(ram.u16(a6 + 0x02), ram.u16(a6 + 0x04),
    target[0], target[1]);
  if (i16(distance) <= 0x0200)
    ram.setU16(slot + 0x06, (ram.u16(slot + 0x06) + 4) & 0x0f);
  placeBoss4Parts29F50E(ram, ctx, slot);
}

function main1Init29F790(ram, rom, ctx, slot) {
  ram.setU8(slot + 0x02, 4);
  ram.setU16(slot + 0x04, 0);
  ram.setU16(slot + 0x06, 0);
  main1Step29F7A2(ram, rom, ctx, slot);
}

const E_SIDE = {
  1: { selector: 0xc6, pos: 0xc2, counter: 0x186,
    advance: incC6_2A1720, retreat: decC6_2A1736,
    fixedSites: [[0x2a1896, 0x2a18da], [0x2a1924, 0x2a1968],
      [0x2a19b4, 0x2a19f8]], wideSites: [0x2a1a8e, 0x2a1ad6, 0x2a1b20],
    closeSites: [[0x2a1ffa, 0x2a200e], [0x2a2034, 0x2a2048],
      [0x2a2070, 0x2a2084]] },
  2: { selector: 0xe6, pos: 0xe2, counter: 0x187,
    advance: decE6_2A174C, retreat: incE6_2A1762,
    fixedSites: [[0x2a2158, 0x2a219c], [0x2a21e6, 0x2a222a],
      [0x2a2276, 0x2a22ba]], wideSites: [0x2a2350, 0x2a2398, 0x2a23e2],
    closeSites: [[0x2a275e, 0x2a2772], [0x2a2798, 0x2a27ac],
      [0x2a27d4, 0x2a27e8]] },
};

function eInitShort(ram, ctx, slot, side) {
  const a6 = ctx.bossSubRec, cfg = E_SIDE[side];
  ram.setU16(slot + 0x04, 0);
  ram.setU16(slot + 0x06, 1);
  ram.setU16(slot + 0x08, 0);
  ram.setU16(slot + 0x0a, 0);
  ram.setU8(a6 + cfg.counter, ram.u8(a6 + cfg.counter) + 1);
}

function fireFive(ram, rom, ctx, site, a5, d0, base, d2, d3, wide,
  firstEntry, laterEntry) {
  const delta = wide ? 10 : 3;
  const angles = [base, base + delta, base + delta * 2, base - delta, base - delta * 2];
  for (let i = 0; i < angles.length; i++)
    shootBoss4(ram, rom, ctx, site + i * 0x0a, i === 0 ? firstEntry : laterEntry,
      regsBoss4(a5, d0, angles[i], d2, d3));
}

function eStepFixed(ram, rom, ctx, slot, side, mode) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec, cfg = E_SIDE[side];
  if (!due8(ram, slot + 0x04)) return;
  ram.setU8(slot + 0x04, ram.u8(slot + 0x05));
  cfg.advance(ram, a6);
  const baseSelector = ram.u16(a6 + cfg.selector);
  const d2 = ram.u32(a6 + cfg.pos);
  const speed = ((ram.u16(slot + 0x08) << 16) | 4) >>> 0;
  for (let group = 0; group < 3; group++) {
    const point = boss4Point(rom, baseSelector + group * 8);
    if (mode === 0) {
      fireFive(ram, rom, ctx, cfg.fixedSites[group][0],
        a5, speed, point.angle, d2, point.vector, false, 0x2817b8, 0x2817b8);
      fireFive(ram, rom, ctx, cfg.fixedSites[group][1],
        a5, (speed - 0x00010000) >>> 0, point.angle + 0x20,
        d2, point.vector, false, 0x2817b8, 0x2817b8);
    } else {
      fireFive(ram, rom, ctx, cfg.wideSites[group],
        a5, speed, point.angle, d2, point.vector, true,
        group === 2 ? 0x281708 : 0x2817b8, 0x281708);
    }
  }
  ram.setU16(slot + 0x0a, (ram.u16(slot + 0x0a) + 1) % 3);
  const remaining = u16(ram.u16(slot + 0x06) - 1);
  ram.setU16(slot + 0x06, remaining);
  if (remaining === 0) ram.setU16(slot, 0);
}

function eInitAimed(ram, slot) {
  ram.setU16(slot + 0x04, 0x2020);
  ram.setU16(slot + 0x06, 5);
  ram.setU16(slot + 0x08, 4);
  ram.setU8(slot + 0x0a, 0);
}

function fireDescending(ram, rom, ctx, site, entry, a5, d0, d1, d2, d3) {
  let speed = d0 >>> 0;
  for (let i = 0; i < 4; i++) {
    shootBoss4(ram, rom, ctx, site + i * 0x0c, entry,
      regsBoss4(a5, speed, d1, d2, d3));
    speed = (speed - 0x00020000) >>> 0;
  }
}

function fireRandomAimedPattern(ram, rom, ctx, slot, side, point) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec, cfg = E_SIDE[side];
  const py = ram.u16(a6 + cfg.pos), px = ram.u16(a6 + cfg.pos + 2);
  const vy = point.vector >>> 16, vx = point.vector & 0xffff;
  const sy = u16(py + vy), sx = u16(px + vx);
  const aimed = aim256FromCaller(aimTables(rom), ram, a5, sy, sx);
  const angle = ((aimed.carry ? sx : aimed.dir) + drawByte242B3C(ram, rom)) & 0xff;
  const pattern = drawWord242EC2(ram, rom) & 3;
  const d0 = ((ram.u16(slot + 0x08) << 16) | 0x000b) >>> 0;
  const d2 = ram.u32(a6 + cfg.pos);
  if (pattern === 0 || pattern === 3) {
    fireDescending(ram, rom, ctx, 0x2a1ce4, 0x281744,
      a5, d0, angle, d2, point.vector);
  } else if (pattern === 1) {
    const spread = (drawWord242EC2(ram, rom) & 7) + 3;
    fireDescending(ram, rom, ctx, 0x2a1d26, 0x281744,
      a5, d0, angle - spread, d2, point.vector);
    fireDescending(ram, rom, ctx, 0x2a1d56, 0x281744,
      a5, d0, angle + spread, d2, point.vector);
  } else {
    const spread = (drawWord242EC2(ram, rom) & 0x0f) + 6;
    fireDescending(ram, rom, ctx, 0x2a1d98, 0x281764,
      a5, d0, angle, d2, point.vector);
    fireDescending(ram, rom, ctx, 0x2a1dc6, 0x281764,
      a5, d0, angle - spread, d2, point.vector);
    fireDescending(ram, rom, ctx, 0x2a1df6, 0x281764,
      a5, d0, angle + spread, d2, point.vector);
  }
}

function eStepAimed(ram, rom, ctx, slot, side) {
  const a6 = ctx.bossSubRec, cfg = E_SIDE[side];
  cfg.advance(ram, a6);
  if (!due8(ram, slot + 0x04)) return;
  ram.setU8(slot + 0x04, ram.u8(slot + 0x05));
  const phase = ram.u8(slot + 0x0a);
  fireRandomAimedPattern(ram, rom, ctx, slot, side,
    boss4Point(rom, ram.u16(a6 + cfg.selector) + phase * 8));
  ram.setU8(slot + 0x0a, phase === 2 ? 0 : phase + 1);
  const remaining = u16(ram.u16(slot + 0x06) - 1);
  ram.setU16(slot + 0x06, remaining);
  if (remaining === 0) ram.setU16(slot, 0);
}

function eInitClosing(ram, rom, ctx, slot, side) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec, cfg = E_SIDE[side];
  ram.setU16(slot + 0x04, 0x4000);
  ram.setU16(slot + 0x06, 0x50);
  ram.setU16(slot + 0x08, 0xfffc);
  ram.setU16(slot + 0x0a, 0x40);
  ram.setU16(slot + 0x0c, 2);
  ram.setU16(slot + 0x10, 0);
  ram.setU16(slot + 0x12, 0x0c);
  ram.setU16(slot + 0x14, 5);
  ram.setU8(slot + 0x16, 0);
  ram.setU8(slot + 0x17, side === 1 ? 0xff : 1);
  ram.setU8(slot + 0x18, 1);
  ram.setU16(slot + 0x1a, 0x0808);
  const py = ram.u16(a6 + cfg.pos), px = ram.u16(a6 + cfg.pos + 2);
  const aimed = aim256FromCaller(aimTables(rom), ram, a5, py, px);
  const direction = aimed.carry ? px : aimed.dir;
  ram.setU8(slot + 0x0e,
    direction - ((ram.u8(slot + 0x17) << 4) & 0xff));
}

function eStepClosing(ram, rom, ctx, slot, side) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec, cfg = E_SIDE[side];
  if (ram.u8(slot + 0x16) === 0) {
    if (i16(ram.u16(slot + 0x0a)) > 0x10) cfg.retreat(ram, a6);
    const travel = u16(ram.u16(slot + 0x0a) - 1);
    ram.setU16(slot + 0x0a, travel);
    if (travel === 0) ram.setU8(slot + 0x16, 1);
  }
  if (ram.u8(slot + 0x16) !== 1) return;
  ram.setU8(slot + 0x18, ram.u8(slot + 0x18) + 1);
  if (!due8(ram, slot + 0x04)) return;
  ram.setU8(slot + 0x04, ram.u8(slot + 0x05));
  const spread = ram.u8(slot + 0x18);
  const d2 = ram.u32(a6 + cfg.pos);
  for (let group = 0; group < 3; group++) {
    const point = boss4Point(rom, ram.u16(a6 + cfg.selector) + group * 8);
    const speed = ram.u16(slot + 0x08);
    shootBoss4(ram, rom, ctx, cfg.closeSites[group][0], 0x2817b8,
      regsBoss4(a5, ((speed << 16) | 4) >>> 0,
        point.angle - spread, d2, point.vector));
    shootBoss4(ram, rom, ctx, cfg.closeSites[group][1], 0x2817b8,
      regsBoss4(a5, ((((speed - 4) & 0xffff) << 16) | 9) >>> 0,
        point.angle + spread, d2, point.vector));
  }
  if (due8(ram, slot + 0x1a)) {
    ram.setU8(slot + 0x1a, ram.u8(slot + 0x1b));
    ram.setU16(slot + 0x08, ram.u16(slot + 0x08) + 1);
  }
  const remaining = u16(ram.u16(slot + 0x06) - 1);
  ram.setU16(slot + 0x06, remaining);
  if (remaining === 0) ram.setU16(slot, 0);
}

function eAttackStep(ram, rom, ctx, slot, side) {
  switch (ram.u16(slot + 0x02)) {
    case 0: eStepFixed(ram, rom, ctx, slot, side, 0); break;
    case 1: eStepFixed(ram, rom, ctx, slot, side, 1); break;
    case 2: eStepAimed(ram, rom, ctx, slot, side); break;
    case 3: eStepClosing(ram, rom, ctx, slot, side); break;
    default: unreached(side === 1 ? 0x2a17f8 : 0x2a20ba,
      `Stage-4 boss E${side} parameter is outside 0..3`);
  }
}

function eAttackInit(ram, rom, ctx, slot, side) {
  switch (ram.u16(slot + 0x02)) {
    case 0: case 1: eInitShort(ram, ctx, slot, side); break;
    case 2: eInitAimed(ram, slot); break;
    case 3: eInitClosing(ram, rom, ctx, slot, side); break;
    default: unreached(side === 1 ? 0x2a17e6 : 0x2a20a8,
      `Stage-4 boss E${side} parameter is outside 0..3`);
  }
  eAttackStep(ram, rom, ctx, slot, side);
}

function e1Init2A17E6(ram, rom, ctx, slot) { eAttackInit(ram, rom, ctx, slot, 1); }
function e1Step2A17F8(ram, rom, ctx, slot) { eAttackStep(ram, rom, ctx, slot, 1); }
function e2Init2A20A8(ram, rom, ctx, slot) { eAttackInit(ram, rom, ctx, slot, 2); }
function e2Step2A20BA(ram, rom, ctx, slot) { eAttackStep(ram, rom, ctx, slot, 2); }

// ---------------------------------------------------------------------------
// `$2A0BCC`: F4, the bridge from the first mirrored attack cycle back to F3.

const F4_E5_ROWS = Object.freeze([
  [0x0100, 0x0004, 0x1002], [0x0200, 0x0008, 0x0c02],
  [0x0100, 0x000c, 0x0802], [0x0200, 0x0010, 0x0402],
  [0x0300, 0x0020, 0x4002],
]);

export function f4Step2A0BDE(ram, _rom, _ctx, slot) {
  let state = ram.u8(slot + 0x02);
  if (state === 0) {
    const wait = u16(ram.u16(slot + 0x04) - 1);
    ram.setU16(slot + 0x04, wait);
    if (wait === 0) {
      ram.setU8(slot + 0x02, 1);
      ram.setU16(slot + 0x04, 0x20);
      a1Start259A18(ram, 3);
      state = 1;
    }
  }
  if (state === 1) {
    const wait = u16(ram.u16(slot + 0x04) - 1);
    ram.setU16(slot + 0x04, wait);
    if (wait === 0) {
      a3Start259962(ram, 1);
      ram.setU8(slot + 0x02, 2);
      ram.setU16(slot + 0x04, 0x10);
      state = 2;
    }
  }
  if (state === 2) {
    let ready = ram.u16(slot + 0x04) === 0;
    if (!ready) {
      const wait = u16(ram.u16(slot + 0x04) - 1);
      ram.setU16(slot + 0x04, wait);
      ready = wait === 0;
    }
    if (ready && !a1Running259A4A(ram, 5)) {
      const child = a1Start259A18(ram, 5);
      const row = F4_E5_ROWS[ram.u16(slot + 0x06) / 6];
      ram.setU16(child + 0x02, row[0]);
      ram.setU16(child + 0x08, row[1]);
      ram.setU16(child + 0x04, row[2]);
      const cursor = u16(ram.u16(slot + 0x06) + 6);
      ram.setU16(slot + 0x06, cursor);
      if (cursor === 0x1e) {
        ram.setU8(slot + 0x02, 3);
        state = 3;
      }
    }
  }
  if (state === 3 && !a1Running259A4A(ram, 5)) {
    a1Stop259B08(ram, 3);
    ram.setU8(slot + 0x02, 4);
    ram.setU16(slot + 0x04, 0x80);
    a3Start259962(ram, 2);
    state = 4;
  }
  if (state === 4) {
    const wait = u16(ram.u16(slot + 0x04) - 1);
    ram.setU16(slot + 0x04, wait);
    if (wait === 0) {
      ram.setU16(slot, 0);
      a4Start25980C(ram, 3);
    }
  }
}

export function f4Init2A0BCC(ram, rom, ctx, slot) {
  ram.setU8(slot + 0x02, 0);
  ram.setU16(slot + 0x04, 0x20);
  ram.setU16(slot + 0x06, 0);
  f4Step2A0BDE(ram, rom, ctx, slot);
}

function d1Step2A1468(ram, _rom, ctx, slot) {
  if (!due8(ram, slot + 0x02)) return;
  ram.setU8(slot + 0x02, ram.u8(slot + 0x03));
  const next = u16(ram.u16(ctx.bossSubRec + 0x66) + 4);
  ram.setU16(ctx.bossSubRec + 0x66, next);
  if (next === 0x1c) ram.setU16(slot, 0);
}
function d1Init2A1462(ram, rom, ctx, slot) {
  ram.setU16(slot + 0x02, 0x0202);
  d1Step2A1468(ram, rom, ctx, slot);
}
function d2Step2A148C(ram, _rom, ctx, slot) {
  if (!due8(ram, slot + 0x02)) return;
  ram.setU8(slot + 0x02, ram.u8(slot + 0x03));
  const next = u16(ram.u16(ctx.bossSubRec + 0x66) - 4);
  ram.setU16(ctx.bossSubRec + 0x66, next);
  if (next === 0) ram.setU16(slot, 0);
}
function d2Init2A1486(ram, rom, ctx, slot) {
  ram.setU16(slot + 0x02, 0x0202);
  d2Step2A148C(ram, rom, ctx, slot);
}

/**
 * A3 3..8 -- SIX SCRIPTS, ONE ROUTINE, and the ROM says so out loud: their INIT
 * addresses are `$2A14AA`, `$2A14D8`, `$2A1506`, `$2A1534`, `$2A1562`, `$2A1590`, a
 * perfectly uniform `$2E` stride, and the bodies differ only in an offset, a sign and
 * a limit. D1 and D2 above are the same shape on a `$24` stride, which is why they were
 * already here: this family is those two with a third pair of parameters.
 *
 *     move.w #$1,$2(a4)              INIT, and it FALLS THROUGH
 *     subq.b #1,$2(a4) / bcc rts     the OLD-ZERO BORROW
 *     move.b $3(a4),$2(a4)           reload the period
 *     addq.w/subq.w #$4,OFF(a6)      the ramp
 *     cmpi.w #LIMIT,OFF(a6) / blt|bgt rts
 *     move.w #LIMIT,OFF(a6)
 *     bra $2A13C8                    `clr.w (a4) / rts` -- it RETIRES ITSELF
 *
 * `move.w #$1` makes the byte at `$2` zero and the byte at `$3` ONE, and those are two
 * different things. The zero means the borrow fires on the very first step, on the
 * arming frame. The one means the reload leaves 1 behind, which the next frame spends
 * getting to zero without firing, so every step after the first lands on every SECOND
 * frame. A ramp of n steps therefore takes 2n-1 frames, not n.
 *
 * The three offsets are ANIMATION CURSORS the port already draws, which is what makes
 * this family visible rather than bookkeeping:
 *
 *     $88(a6), $A8(a6)   -> `$29F356`, the two pods' frames, 0..$20   (objects 7 and 8)
 *     $106(a6)           -> `$29F002` and `$29F096`, 0..$3C           (objects 9 and 0)
 *
 * so 5 and 7 OPEN the pods, 6 and 8 close them, and 3 and 4 run the body's own cursor
 * the way D0 already does. Every descriptor at every step of all three ramps already
 * resolves; no window needed widening.
 */
const A3_RAMPS = {
  0x2a14aa: { off: 0x106, up: true, limit: 0x003c },     // A3 3, and D0's own cursor
  0x2a14d8: { off: 0x106, up: false, limit: 0x0000 },    // A3 4
  0x2a1506: { off: 0x088, up: true, limit: 0x0020 },     // A3 5, pod 1 opening
  0x2a1534: { off: 0x088, up: false, limit: 0x0000 },    // A3 6, pod 1 closing
  0x2a1562: { off: 0x0a8, up: true, limit: 0x0020 },     // A3 7, pod 2 opening
  0x2a1590: { off: 0x0a8, up: false, limit: 0x0000 },    // A3 8, pod 2 closing
};

function a3RampStep(ram, ctx, slot, p) {
  if (!due8(ram, slot + 0x02)) return;                   // $2A14B0 subq.b/bcc
  ram.setU8(slot + 0x02, ram.u8(slot + 0x03));           // $2A14B8 the reload
  const a = ctx.bossSubRec + p.off;
  const next = u16(ram.u16(a) + (p.up ? 4 : -4));         // $2A14BE addq.w / subq.w
  ram.setU16(a, next);
  // $2A14C2 cmpi.w / blt -- SIGNED, and the pin happens only on the far side of it.
  if (p.up ? i16(next) < p.limit : i16(next) > p.limit) return;
  ram.setU16(a, p.limit);                                // $2A14CC move.w #LIMIT
  ram.setU16(slot, 0);                                   // $2A13C8 clr.w (a4)
}

/** Exported for W247's test, which drives all six through their own parameters. */
export function a3Ramp(addr) {
  const p = A3_RAMPS[addr];
  const step = (ram, rom, ctx, slot) => a3RampStep(ram, ctx, slot, p);
  const init = (ram, rom, ctx, slot) => {
    ram.setU16(slot + 0x02, 0x0001);                     // $2A14AA move.w #$1,$2(a4)
    step(ram, rom, ctx, slot);                           // falls through
  };
  return { init, step };
}

function e3Step2A282E(ram, rom, ctx, slot) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  if (!due8(ram, slot + 0x04)) return;
  ram.setU8(slot + 0x04, ram.u8(slot + 0x05));
  if (ram.u16(0x8130d4) !== 0) return;
  const aimed = aim256FromCaller(aimTables(rom), ram, a5,
    ram.u16(a6 + 0x102), ram.u16(a6 + 0x104));
  const base = aimed.carry ? ram.u16(a6 + 0x104) & 0xff : aimed.dir;
  ram.setU8(slot + 0x07, base);
  const signedQuarter = asr((base << 24) >> 24, 2);
  const vector = rom.u32(0x27327a + (((signedQuarter + 1) & 0x3e) << 1));
  const d2 = ram.u32(a6 + 0x102);
  const fire = (site, d0, angle) => shootBoss4(ram, rom, ctx, site, 0x2817b8,
    regsBoss4(a5, d0, angle, d2, vector));
  let angle = base;
  fire(0x2a2882, 0xfffc000b, angle);
  for (let i = 0; i < 3; i++) { angle += ram.u8(slot + 0x06); fire(0x2a288e, 0xfffc000b, angle); }
  angle += ram.u8(slot + 0x06) * 3;
  for (let i = 0; i < 6; i++) { angle += ram.u8(slot + 0x08); fire(0x2a28b4, 0xfff8000b, angle); }
  angle = base;
  for (let i = 0; i < 3; i++) { angle -= ram.u8(slot + 0x06); fire(0x2a28ce, 0xfffc000b, angle); }
  angle -= ram.u8(slot + 0x06) * 3;
  for (let i = 0; i < 6; i++) { angle -= ram.u8(slot + 0x08); fire(0x2a28f4, 0xfff8000b, angle); }
}

function e3Init2A280C(ram, rom, ctx, slot) {
  ram.setU16(slot + 0x04, 0x0c20);
  ram.setU8(slot + 0x06, 3);
  ram.setU8(slot + 0x08, 8);
  const a6 = ctx.bossSubRec;
  const aimed = aim256FromCaller(aimTables(rom), ram, ctx.bossRec,
    ram.u16(a6 + 0x102), ram.u16(a6 + 0x104));
  ram.setU8(slot + 0x07, aimed.carry ? ram.u16(a6 + 0x104) : aimed.dir);
  e3Step2A282E(ram, rom, ctx, slot);
}

const E5_VECTORS = Object.freeze({
  1: [0x0780fe40, 0x0380fe40, 0xffc0fe40, 0xfbc0fe40],
  2: [0x078001c0, 0x038001c0, 0xffc001c0, 0xfbc001c0],
});

function spawnE5Type41(ram, rom, ctx, slot, bit, headingBase) {
  const q = enqueueDeferred(ram, 0x41, DEFQ_D1.FIXED00);
  const vector = E5_VECTORS[bit][ram.u16(slot + 0x06) >>> 2];
  ram.setU32(q.addr + 0x16, (ram.u32(ctx.bossSubRec + 0x62) + vector) >>> 0);
  ram.setU8(q.addr + 0x1a, drawByte242B3C(ram, rom) + 0x20);
  ram.setU8(q.addr + 0x1b, drawByte242B3C(ram, rom) + headingBase);
}

function e5Step2A2CC8(ram, rom, ctx, slot) {
  if (!due8(ram, slot + 0x04)) return;
  ram.setU8(slot + 0x04, ram.u8(slot + 0x05));
  const mode = ram.u8(slot + 0x02);
  if (mode & 1) spawnE5Type41(ram, rom, ctx, slot, 1, 0x30);
  if (mode & 2) spawnE5Type41(ram, rom, ctx, slot, 2, 0x10);
  ram.setU16(slot + 0x06, (ram.u16(slot + 0x06) + 4) & 0x0f);
  const remaining = u16(ram.u16(slot + 0x08) - 1);
  ram.setU16(slot + 0x08, remaining);
  if (remaining === 0) ram.setU16(slot, 0);
}

function e5Init2A2CC2(ram, rom, ctx, slot) {
  ram.setU16(slot + 0x06, 0);
  e5Step2A2CC8(ram, rom, ctx, slot);
}

function emitF1Rows2A00C0(ram, rom, ctx, table, pos) {
  const a6 = ctx.bossSubRec;
  for (let row = table; rom.u16(row) !== 0xffff; row += 12) {
    const e = spawnEffect(ram, ctx, rom.u16(row + 2), 0x2a00cc);
    ram.setU8(e + B.f1c, rom.u16(row + 4));
    ram.setU16(e + B.delay, rom.u16(row));
    ram.setU32(e + B.nudge, rom.u32(row + 6));
    ram.setU32(e + B.pos, pos);
    ram.setU16(e + B.bucket, 0x10);
    ram.setU16(e + B.sub12, 0);
    ram.setU16(e + B.sub14, 0);
    ram.setU8(e + B.speed, ram.u8(a6 + 0x1a));
    ram.setU8(e + B.angle, ram.u8(a6 + 0x1b) * 4);
  }
}

function spawnF1Particle(ram, rom, ctx, kind, pos, yBias, site) {
  const e = spawnEffect(ram, ctx, kind, site);
  ram.setU16(e + B.bucket, 0x0c);
  ram.setU8(e + B.speed, 0x10);
  ram.setU8(e + B.angle, drawByte242B3C(ram, rom) * 2);
  ram.setU32(e + B.pos, pos);
  ram.setU16(e + B.nudge, u16((i16(drawWord24328E(ram, rom)) >> 3) - yBias));
  ram.setU16(e + B.nudge + 2, u16(i16(drawWord24328E(ram, rom)) >> 3));
}

export function f1Step2A01D8(ram, rom, ctx, slot) {
  const a6 = ctx.bossSubRec;
  if (ram.u8(slot + 0x06) !== 0xff && due8(ram, slot + 0x06)) {
    ram.setU8(slot + 0x06, ram.u8(slot + 0x07));
    spawnF1Particle(ram, rom, ctx, 1, ram.u32(a6 + 0x102), 0x0200, 0x2a01f2);
  }
  if (ram.u8(slot + 0x08) !== 0xff && due8(ram, slot + 0x08)) {
    ram.setU8(slot + 0x08, ram.u8(slot + 0x09));
    spawnF1Particle(ram, rom, ctx, 0x10, ram.u32(a6 + 0xc2), 0x0400, 0x2a024e);
    spawnF1Particle(ram, rom, ctx, 0x10, ram.u32(a6 + 0xe2), 0x0400, 0x2a0292);
  }

  if (ram.u8(slot + 0x02) === 0 && due16(ram, slot + 0x04)) {
    ram.setU8(slot + 0x06, 0);
    emitF1Rows2A00C0(ram, rom, ctx, 0x2a046a, ram.u32(a6 + 0x102));
    a2Stop25994A(ram, 5);
    ctx.soundPost?.(0x28c2c2);
    ram.setU16(slot + 0x04, 8);
    ram.setU8(slot + 0x02, 1);
  }
  if (ram.u8(slot + 0x02) === 1 && due16(ram, slot + 0x04)) {
    ram.setU8(slot + 0x08, 0);
    bigBurst28B4BE(ram, rom, ctx, ram.u32(a6 + 0xc2),
      drawWord242EC2(ram, rom) & 0xff, 0, 0x10, 0x2a033c);
    emitF1Rows2A00C0(ram, rom, ctx, 0x2a0484, ram.u32(a6 + 0xc2));
    emitF1Rows2A00C0(ram, rom, ctx, 0x2a0484, ram.u32(a6 + 0xe2));
    a2Stop25994A(ram, 3); a2Stop25994A(ram, 4);
    ctx.soundPost?.(0x28c25a);
    ram.setU16(slot + 0x04, 8);
    ram.setU8(slot + 0x02, 2);
  }
  if (ram.u8(slot + 0x02) === 2 && due16(ram, slot + 0x04)) {
    ctx.soundPost?.(0x28c274);
    emitF1Rows2A00C0(ram, rom, ctx, 0x2a0492, ram.u32(a6 + 0x62));
    a2Stop25994A(ram, 2);
    ram.setU16(slot + 0x04, 0x60);
    ram.setU8(slot + 0x02, 3);
  }
  if (ram.u8(slot + 0x02) === 3 && due16(ram, slot + 0x04)) {
    ram.setU8(slot + 0x06, 0xff);
    ram.setU8(slot + 0x08, 0xff);
    bigBurst28B4BE(ram, rom, ctx,
      (ram.u32(a6 + 0x62) + 0xf0000400) >>> 0,
      drawByte242B3C(ram, rom) * 2 + 0x30, 0, 0x10, 0x2a03f8);
    bigBurst28B4BE(ram, rom, ctx,
      (ram.u32(a6 + 0x62) + 0xebfffc00) >>> 0,
      drawByte242B3C(ram, rom) + 0xd0, 0, 0x10, 0x2a041c);
    emitF1Rows2A00C0(ram, rom, ctx, 0x2a04d0, ram.u32(a6 + 0x42));
    a2Stop25994A(ram, 1);
    seqStart2598D0(ram, 3);
    ctx.soundPost?.(0x28c2dc);
    ram.setU16(slot, 0);
  }
}

export function f1Init2A019E(ram, rom, ctx, slot) {
  const a6 = ctx.bossSubRec;
  ram.setU16(a6 + 0x168, 1);
  ram.setU16(a6 + 0x40, 0x8000);
  ram.setU16(a6 + 0x60, 0x8000);
  seqStart2598D0(ram, 2);
  ram.setU8(slot + 0x02, 0);
  ram.setU16(slot + 0x04, 1);
  ram.setU16(slot + 0x06, 0xff02);
  ram.setU16(slot + 0x08, 0xff04);
  f1Step2A01D8(ram, rom, ctx, slot);
}

function main2Step29F822(ram, _rom, ctx, slot) {
  placeBoss4Parts29F50E(ram, ctx, slot);
}

function main2Init29F80A(ram, rom, ctx, slot) {
  const a6 = ctx.bossSubRec;
  ram.setU8(a6 + 0x1a, 0);
  ram.setU8(a6 + 0x1b, 0x20);
  ram.setU8(slot + 0x02, 0x20);
  ram.setU16(slot + 0x04, 0x0303);
  main2Step29F822(ram, rom, ctx, slot);
}

function main3Step29F840(ram, rom, ctx, slot) {
  const a6 = ctx.bossSubRec;
  const targetY = 0x6000;
  const targetX = u16(0x1c00 - ram.u16(0x813172));
  ram.setU8(a6 + 0x1b, aim64(aimTables(rom),
    ram.u16(a6 + 0x02), ram.u16(a6 + 0x04), targetY, targetX));
  const distance = dist242494(ram.u16(a6 + 0x02), ram.u16(a6 + 0x04),
    targetY, targetX);
  if (i16(distance) <= 0x1400) {
    if (ram.u8(slot + 0x06) === 0) {
      ram.setU8(slot + 0x06, 1);
      ram.setU16(slot + 0x04, 0);
    }
    ram.setU8(slot + 0x02, 4);
    if (i16(distance) <= 0x0200) {
      ram.setU8(a6 + 0x1a, 0);
      a4Start25980C(ram, 5);
      seqStop2598BE(ram);
    }
  } else {
    ram.setU8(slot + 0x02, 0x20);
  }
  placeBoss4Parts29F50E(ram, ctx, slot);
}

function main3Init29F826(ram, rom, ctx, slot) {
  ram.setU8(slot + 0x02, 4);
  ram.setU16(slot + 0x04, 0x0202);
  ram.setU8(slot + 0x06, 0);
  a3Start259962(ram, 0);
  main3Step29F840(ram, rom, ctx, slot);
}

function d0Step2A13E8(ram, _rom, ctx, slot) {
  const a6 = ctx.bossSubRec;
  if (!due8(ram, slot + 0x02)) return;
  ram.setU8(slot + 0x02, ram.u8(slot + 0x03));
  const cursor = u16(ram.u16(a6 + 0x106) + 4);
  ram.setU16(a6 + 0x106, cursor);
  if (cursor !== 0x3c) return;
  ram.setU16(a6 + 0x106, 0);
  a2Stop25994A(ram, 6);
  a2Run2598E6(ram, 9); a2Run2598E6(ram, 7); a2Run2598E6(ram, 8);
  ram.setU16(a6 + 0x30, 0x0c00);
  ram.setU16(a6 + 0x32, 0x0d80);
  ram.setU16(a6 + 0x34, 0x0900);
  ram.setU16(a6 + 0x36, 0x0900);
  ram.setU16(a6 + 0x80, 0xa001);
  ram.setU16(a6 + 0xa0, 0xa001);
  ram.setU16(a6 + 0x168, 0);
  ram.setU16(slot, 0);
}

function d0Init2A13CC(ram, rom, ctx, slot) {
  const a6 = ctx.bossSubRec;
  ram.setU16(a6 + 0x106, 0);
  a2Stop25994A(ram, 0);
  a2Run2598E6(ram, 6);
  ram.setU16(slot + 0x02, 0x0202);
  d0Step2A13E8(ram, rom, ctx, slot);
}

/**
 * `$29F8CC` / `$29F8F0` -- MAIN4, which F5's INIT starts with `seqStart2598D0(4)`.
 * It walks the boss around FOUR waypoints, aiming and slewing at each, and hands the
 * result to the same `placeBoss4Parts29F50E` every other MAIN uses.
 *
 * Every helper it needs was already in the port, which is the whole reason this is
 * short:
 *
 *   $24203E  the aim64 CORE, self in D0/D1 and target in D2/D3   -> `aim64`
 *   $242190  the one-step slew                                    -> `slew64`
 *   $24249A  the distance body -- `$242494` loads D0/D1 from ($2,A6) and falls into
 *            it, and MAIN4 enters at $24249A precisely because it has already put
 *            its OWN values there                                 -> `dist242494`
 *   $241812  the ship's vector routine                            -> `tables.vector`
 *   $29F50E  the part placer                                      -> already here
 *
 * `$29F972` is FOUR waypoints of two words, which `andi.w #$F,$6(a4)` bounds, and
 * $29F972 + $10 is $29F982 -- MAIN5's own entry in the A0 table at $29F498. Pinned by
 * code, not by a run length.
 */
const MAIN4_WAYPOINTS = 0x29f972;
const MAIN7_WAYPOINTS = 0x29fa7a;

/**
 * The WAYPOINT WALKER, shared by MAIN4 (`$29F8F0`) and MAIN7 (`$29F9CC`). The two
 * bodies are the same instructions in the same order and differ in exactly two
 * operands: the waypoint base and the arrival threshold (`$400` against `$200`). MAIN7
 * adds a speed ramp ahead of it and nothing else.
 *
 * The cursor mask is `$F` in both, which is what bounds each table at four two-word
 * entries, and both tails put the vector into the PART offsets rather than the
 * position, so what walks is the opened pods.
 */
function bossWalk(ram, rom, ctx, slot, waypoints, threshold) {
  const a6 = ctx.bossSubRec;
  const cursor = ram.u16(slot + 0x06);                    // $29F8F6 adda.w $6(a4)
  const wp = waypoints + cursor;
  const d2 = rom.u16(wp), d3 = rom.u16(wp + 2);           // $29F8FA movem.w (a0)

  // $29F8FE..$29F908 -- the boss's own position plus the two part offsets F5 is
  // driving, which is what makes the walk track the opened pods.
  const selfY = u16(ram.u16(a6 + 0x02) + ram.u16(a6 + 0x194));
  const selfX = u16(ram.u16(a6 + 0x04) + ram.u16(a6 + 0x196));

  // $29F90C jsr $24203E -> the target heading, then $242190 slews ($3B,A6) towards it.
  const want = aim64(aimTables(rom), selfY, selfX, d2, d3);
  ram.setU8(a6 + 0x3b, slew64(ram.u8(a6 + 0x3b), want));  // $29F912..$29F91C

  // $29F920..$29F94E -- the SAME waypoint again, this time for the distance test.
  if (i16(dist242494(selfY, selfX, d2, d3)) <= threshold) {  // $29F942 cmpi.w/bgt
    ram.setU16(slot + 0x06, u16(cursor + 4) & 0x000f);    // $29F94A/$29F94E
  }

  // $29F954..$29F96E -- speed from ($3a,A6), heading from ($3b,A6).
  const v = ctx.tables.vector(ram.u8(a6 + 0x3a), ram.u8(a6 + 0x3b));
  ram.setU16(a6 + 0x194, u16(ram.u16(a6 + 0x194) + v.dy));  // $29F966
  ram.setU16(a6 + 0x196, u16(ram.u16(a6 + 0x196) + v.dx));  // $29F96A
  placeBoss4Parts29F50E(ram, ctx, slot);                  // $29F96E bra $29F50E
}

export function main4Step29F8F0(ram, rom, ctx, slot) {
  bossWalk(ram, rom, ctx, slot, MAIN4_WAYPOINTS, 0x400);
}

export function main4Init29F8CC(ram, rom, ctx, slot) {
  const a6 = ctx.bossSubRec;
  ram.setU8(a6 + 0x1a, 0);                                // $29F8CC
  ram.setU8(a6 + 0x1b, 0x20);                             // $29F8D2
  ram.setU8(slot + 0x02, 0);                              // $29F8D8
  ram.setU16(slot + 0x04, 0);                             // $29F8DE
  ram.setU16(slot + 0x06, 0);                             // $29F8E4
  ram.setU8(a6 + 0x3a, 6);                                // $29F8EA -- the SPEED
  main4Step29F8F0(ram, rom, ctx, slot);                   // falls through
}

/**
 * `$29F9B4` / `$29F9CC` -- MAIN7, which F5's arm 5 calls in, and it is MAIN4's twin: the
 * same waypoint walker with a tighter arrival threshold (`$200`) and its own four
 * waypoints, PLUS one thing MAIN4 does not have.
 *
 * THE SPEED RAMP. Every ninth frame (`$8(a4)` = 8 with a period of 8, old-zero borrow)
 * it takes one off `$3A(A6)`, the walk speed, and floors it at 2 -- checked twice, once
 * before the decrement so an already-floored speed costs nothing, and once after with
 * `bgt` so an overshoot is pinned rather than wrapped. So the boss's final phase closes
 * in slower and slower, and never stops.
 *
 * MAIN4 sets that speed to 6 in its own INIT, so a cycle that runs MAIN4 then MAIN7
 * (bit 5 restarts MAIN4, bit 3 calls MAIN7 back) resets the ramp every lap.
 */
export function main7Step29F9CC(ram, rom, ctx, slot) {
  const a6 = ctx.bossSubRec;
  if (due8(ram, slot + 0x08)) {                           // $29F9CC subq.b/bcc
    ram.setU8(slot + 0x08, ram.u8(slot + 0x09));          // $29F9D4 the reload
    if (ram.u8(a6 + 0x3a) !== 2) {                        // $29F9DA cmpi.b #$2/beq
      ram.setU8(a6 + 0x3a, ram.u8(a6 + 0x3a) - 1);        // $29F9E4 subq.b
      if (i16(ram.u8(a6 + 0x3a)) <= 2) {                  // $29F9E8 cmpi.b #$2/bgt
        ram.setU8(a6 + 0x3a, 2);                          // $29F9F2 -- the FLOOR
      }
    }
  }
  bossWalk(ram, rom, ctx, slot, MAIN7_WAYPOINTS, 0x200);  // $29F9F8..$29FA76
}

/** `$29F9B4` -- MAIN7's INIT, and it FALLS THROUGH (`$29F9C6` ends at `$29F9CC`). It
 *  does NOT touch `$3A(A6)`: the ramp starts from whatever speed the previous MAIN
 *  left, which is MAIN4's 6. */
export function main7Init29F9B4(ram, rom, ctx, slot) {
  ram.setU8(slot + 0x02, 0);                              // $29F9B4
  ram.setU16(slot + 0x04, 0);                             // $29F9BA
  ram.setU16(slot + 0x06, 0);                             // $29F9C0 -- the cursor
  ram.setU16(slot + 0x08, 0x0808);                        // $29F9C6 -- 8, period 8
  main7Step29F9CC(ram, rom, ctx, slot);                   // falls through
}

/**
 * `$2A0D76`, `$2A0DEE`, `$2A0F6E` and `$2A0FE6` -- THE POD AIM, the same seven
 * instructions FOUR times: once per pod inside arm 1's latch, and once per pod again
 * every frame of arm 3's patrol. Each copy is ONE AXIS wide, and it is the long axis
 * throughout:
 *
 *   velocity  `$198(a6)` / `$19A(a6)`
 *   offset    `$18C(a6)` / `$190(a6)`   which `placeBoss4Parts29F50E` ADDS into
 *   position  `$82(a6)`  / `$A2(a6)`    the placer's own output, which the gate reads
 *
 * so the loop closes through the placer and the pods patrol between `$5A00` and
 * `$6400`. Arm 1 drives `$18E`/`$192` instead, which the placer adds into `$84`/`$A4`
 * -- the SHORT axis. Four separate offset words, two axes, and mixing them up would
 * spread the pods along the direction they are supposed to patrol.
 *
 *   d0 = velocity   zero  -> draw a byte and let its SIGN pick the heading, then draw
 *                            AGAIN for the speed. TWO draws, not one.
 *                   minus -> re-aims only once pos <= $5A00, heading $00
 *                   plus  -> re-aims only once pos >= $6400, heading $80
 *   d0 = (draw >> 1) + 4  the SPEED index, and `asr.b`/`addi.b` keep it a BYTE
 *   $241D34(d0, d1)       and D2, the long-axis half, becomes the new velocity
 *
 * A pod already moving therefore holds its heading until it reaches its own side's
 * limit; only a stationary one picks a side at random. `$241D34` is
 * `MoveTables.shotVector` -- `vectors.js` names the address and spells out that it is
 * NOT `$241812`, which folds the angle differently.
 */
function aimPod2A0D76(ram, rom, ctx, velOff, posOff) {
  const a6 = ctx.bossSubRec;
  const vel = ram.u16(a6 + velOff);                       // $2A0D76 move.w $198(a6),d0
  let d1;
  if (vel === 0) {                                        // $2A0D7A beq
    // $2A0DBE..$2A0DCC -- a draw spent purely on `tst.b`, then the real one below.
    d1 = (drawByte242B3C(ram, rom) & 0x80) !== 0 ? 0x80 : 0x00;
  } else if (i16(vel) < 0) {                              // $2A0D7E bpl
    if (i16(ram.u16(a6 + posOff)) > 0x5a00) return;       // $2A0D82 cmpi.w/bgt
    d1 = 0x00;                                            // $2A0D8C move.b #$0,d1
  } else {
    if (i16(ram.u16(a6 + posOff)) < 0x6400) return;       // $2A0DA0 cmpi.w/blt
    d1 = 0x80;                                            // $2A0DAA move.b #$80,d1
  }
  const drawn = (drawByte242B3C(ram, rom) << 24) >> 24;   // $2A0D90 jsr $242B3C
  const d0 = ((drawn >> 1) + 4) & 0xff;                   // $2A0D96 asr.b / $2A0D98 addi.b
  ram.setU16(a6 + velOff,                                 // $2A0DEA move.w d2,$198(a6)
    u16(ctx.tables.shotVector(d0, d1).dy));               // $2A0DE4 jsr $241D34
}

/**
 * `$2A0D16` arm 1, bit 0 of `$2(a4)` -- THE PODS OPEN, and the latch that ends it.
 *
 * `$6(a4)` grows by 4 a frame and is then applied, so the spread ACCELERATES rather
 * than moving at a constant rate. `$18E(a6)` goes down while `$192(a6)` goes up, which
 * is what drives the two pods apart through the placer.
 */
function f5OpenPods2A0D16(ram, rom, ctx, slot) {
  const a6 = ctx.bossSubRec;
  if (ram.u16(a6 + 0x18e) === 0xf000) return;             // $2A0D20 cmpi.w/beq
  ram.setU16(slot + 0x06, u16(ram.u16(slot + 0x06) + 4)); // $2A0D2A addi.w #$4
  const step = ram.u16(slot + 0x06);                      // $2A0D30 move.w $6(a4),d0
  ram.setU16(a6 + 0x18e, u16(ram.u16(a6 + 0x18e) - step));  // $2A0D34 sub.w
  ram.setU16(a6 + 0x192, u16(ram.u16(a6 + 0x192) + step));  // $2A0D38 add.w
  if (i16(ram.u16(a6 + 0x192)) < 0x0e00) return;          // $2A0D3C cmpi.w/blt

  // $2A0D46 -- THE LATCH: both offsets pinned, bit 0 traded for bits 1 AND 2, so the
  // patrol and the attack cycle both come alive on this one frame.
  ram.setU16(a6 + 0x192, 0x0e00);                         // $2A0D46
  ram.setU16(a6 + 0x18e, 0xf200);                         // $2A0D4C
  ram.setU8(slot + 0x02, (ram.u8(slot + 0x02) & ~0x01) | 0x06);  // $2A0D52..$2A0D5E
  ram.setU16(a6 + 0x198, 0);                              // $2A0D64
  ram.setU16(a6 + 0x19a, 0);                              // $2A0D6A
  ram.setU16(slot + 0x0a, 0);                             // $2A0D70
  aimPod2A0D76(ram, rom, ctx, 0x198, 0x82);               // $2A0D76
  aimPod2A0D76(ram, rom, ctx, 0x19a, 0xa2);               // $2A0DEE

  // $2A0E66 -- the tail, which BOTH aim blocks' position gates branch straight to, so
  // it runs whether or not either pod re-aimed. `$10` and `$14` are WORDS here and
  // BYTES in arms 5 and 6: `$10`/`$11` and `$14`/`$15` are a value and its period.
  ram.setU16(slot + 0x04, 0x0010);                        // $2A0E66
  ram.setU16(slot + 0x0c, 0x0010);                        // $2A0E6C
  ram.setU16(slot + 0x10, 0x0808);                        // $2A0E72
  ram.setU16(slot + 0x12, 0x0000);                        // $2A0E78
  ram.setU16(slot + 0x14, 0x0004);                        // $2A0E7E
}

/**
 * `$2A0E84` arm 2 -- THE DESCENDANTS, four gates on the bits of `$3(a4)`. Every one
 * refuses while the scripts it would replace are still running, which is what keeps
 * the limb scripts from being double-started, and hands its bit to the next gate so
 * the chain advances at most one step per call... except that each gate re-reads
 * `$3(a4)`, so bit 0 handing off to bit 1 lets bit 1 run on the SAME frame.
 *
 * Bits 0 and 2 are the same gate with a different successor: this is a ping-pong that
 * restarts A3 5 and A3 7 twice per attack cycle.
 */
function f5Descendants2A0E84(ram, slot) {
  const bit = (m) => (ram.u8(slot + 0x03) & m) !== 0;
  const swap = (clear, set) =>
    ram.setU8(slot + 0x03, (ram.u8(slot + 0x03) & ~clear) | set);

  if (bit(0x01)) {                                        // $2A0E84 btst #$0,$3(a4)
    if (!a3Running2599B4(ram, 6) && !a3Running2599B4(ram, 8)) {   // $2A0E8E/$2A0E9A
      a3Start259962(ram, 5);                              // $2A0EA6
      a3Start259962(ram, 7);                              // $2A0EAE
      swap(0x01, 0x02);                                   // $2A0EB6/$2A0EBC
    }
  }
  if (bit(0x02)) {                                        // $2A0EC2
    if (!a3Running2599B4(ram, 5) && !a3Running2599B4(ram, 7)) {   // $2A0ECC/$2A0ED8
      a1Start259A18(ram, 8);                              // $2A0EE4
      swap(0x02, 0x00);                                   // $2A0EEC bclr only
    }
  }
  if (bit(0x04)) {                                        // $2A0EF2
    if (!a3Running2599B4(ram, 6) && !a3Running2599B4(ram, 8)) {   // $2A0EFC/$2A0F08
      a3Start259962(ram, 5);                              // $2A0F14
      a3Start259962(ram, 7);                              // $2A0F1C
      swap(0x04, 0x08);                                   // $2A0F24/$2A0F2A
    }
  }
  if (bit(0x08)) {                                        // $2A0F30
    if (!a3Running2599B4(ram, 5) && !a3Running2599B4(ram, 7)) {   // $2A0F3A/$2A0F46
      swap(0x08, 0x00);                                   // $2A0F52
    }
  }
}

/**
 * `$2A0F58` arm 3, bit 1 of `$2(a4)` -- THE PATROL, and it never turns off: arm 1's
 * latch sets bit 1 and nothing in F5 clears it, so the pods keep sweeping the long
 * axis for the rest of the fight while the attack cycle runs beside them.
 *
 * `$4(a4)` counts down and floors at zero and NOTHING here gates on it -- both sides
 * of `tst.w/beq` reach the aim. Not a mistake to tidy up: the aim's own position gates
 * are what pace the re-aiming.
 */
function f5Patrol2A0F58(ram, rom, ctx, slot) {
  const a6 = ctx.bossSubRec;
  if (ram.u16(slot + 0x04) !== 0) {                       // $2A0F62 tst.w/beq
    ram.setU16(slot + 0x04, u16(ram.u16(slot + 0x04) - 1));  // $2A0F6A subq.w
  }
  aimPod2A0D76(ram, rom, ctx, 0x198, 0x82);               // $2A0F6E
  aimPod2A0D76(ram, rom, ctx, 0x19a, 0xa2);               // $2A0FE6
  // $2A105E -- the integration, and it is the LONG-axis offsets, not arm 1's.
  ram.setU16(a6 + 0x18c, u16(ram.u16(a6 + 0x18c) + ram.u16(a6 + 0x198)));  // $2A1062
  ram.setU16(a6 + 0x190, u16(ram.u16(a6 + 0x190) + ram.u16(a6 + 0x19a)));  // $2A106A
}

/**
 * `$2A106E` arm 4, bit 2 of `$2(a4)` -- the attack cycle's first beat. Two halves in
 * one arm: a one-shot on `$C(a4)` reaching zero that retires A1 8 and starts A1 6 and
 * A1 10, and then a rendezvous that waits for A1 10 to finish before handing over to
 * bit 3.
 *
 * The gate is `$2599B4` with D0 = 4, so it is A3 4 and NOT A1 4.
 */
function f5Salvo2A106E(ram, slot) {
  if (a3Running2599B4(ram, 4)) return;                    // $2A1078 jsr $2599B4/bcs
  if (ram.u16(slot + 0x0c) !== 0) {                       // $2A1084 tst.w/beq
    ram.setU16(slot + 0x0c, u16(ram.u16(slot + 0x0c) - 1));  // $2A108C subq.w
    if (ram.u16(slot + 0x0c) !== 0) return;               // $2A1090 bne -- fires once
    a1Stop259B08(ram, 8);                                 // $2A1094
    a1Start259A18(ram, 6);                                // $2A109C
    a1Start259A18(ram, 0x0a);                             // $2A10A4
    ram.setU8(slot + 0x03, ram.u8(slot + 0x03) | 0x04);   // $2A10AC bset #$2,$3(a4)
  }
  if (a1Running259A4A(ram, 0x0a)) return;                 // $2A10B2 jsr $259A4A/bcs
  a1Stop259B08(ram, 6);                                   // $2A10BE
  a1Stop259B08(ram, 7);                                   // $2A10C6
  a3Start259962(ram, 6);                                  // $2A10CE
  a3Start259962(ram, 8);                                  // $2A10D6
  ram.setU8(slot + 0x02, (ram.u8(slot + 0x02) & ~0x04) | 0x08);  // $2A10DE/$2A10E4
  ram.setU16(slot + 0x0c, 0x0040);                        // $2A10EA
}

/**
 * `$2A10F0` arm 5, bit 3 of `$2(a4)` -- the beat that calls MAIN7 in. `subq.w` with no
 * `tst.w` first, so a counter that is already zero WRAPS to `$FFFF` and the arm waits
 * another $FFFF frames; arm 4 always leaves `$40` behind, which is why that never
 * happens in practice.
 *
 * `$11(a4)` is a difficulty ramp that arm 1 already leaves saturated: the tail writes
 * `$10(a4) = $0808`, so the byte at `$11` is 8, `cmpi.b #$8` matches on the first pass
 * and the `addq.b` never runs. Transcribed as-is rather than "simplified" away -- a
 * later loop may well arrive with a smaller value.
 */
function f5Volley2A10F0(ram, slot) {
  ram.setU16(slot + 0x0c, u16(ram.u16(slot + 0x0c) - 1));  // $2A10FA subq.w
  if (ram.u16(slot + 0x0c) !== 0) return;                 // $2A10FE bne
  ram.setU8(slot + 0x03, ram.u8(slot + 0x03) | 0x01);     // $2A1102 bset #$0,$3(a4)
  a3Start259962(ram, 3);                                  // $2A1108
  seqStart2598D0(ram, 7);                                 // $2A1110 -- MAIN7
  ram.setU8(slot + 0x02, (ram.u8(slot + 0x02) & ~0x08) | 0x10);  // $2A1118/$2A111E
  ram.setU8(slot + 0x10, ram.u8(slot + 0x11));            // $2A1124
  if (ram.u8(slot + 0x11) !== 8) {                        // $2A112A cmpi.b #$8/beq
    ram.setU8(slot + 0x11, (ram.u8(slot + 0x11) + 1) & 0xff);  // $2A1134 addq.b
  }
}

/**
 * `$2A1138` arm 6, bit 4 of `$2(a4)` -- the repeating shot, and the one place in F5
 * that writes THROUGH the started slot: `$259A18` returns A0 and `$6(a0)` takes
 * `$12(a4)`, which toggles 0/1, so consecutive A1 9 starts alternate sides.
 *
 * `subq.b #1,$14(a4) / bcc` is the OLD-ZERO BORROW: it reloads on the frame the
 * counter was ALREADY zero, not the frame it reaches zero. Arm 1's tail wrote the WORD
 * `$14(a4) = $0004`, so the byte at `$14` starts at 0 and the byte at `$15` is 4 --
 * counter and period in one word, and the very first pass borrows.
 */
function f5Sweep2A1138(ram, slot) {
  if (a3Running2599B4(ram, 3)) return;                    // $2A1142
  if (a1Running259A4A(ram, 9)) return;                    // $2A114E
  if (!due8(ram, slot + 0x14)) return;                    // $2A115A subq.b/bcc
  ram.setU8(slot + 0x14, ram.u8(slot + 0x15));            // $2A1162 the RELOAD
  const a0 = a1Start259A18(ram, 9);                       // $2A1168
  ram.setU16(a0 + 0x06, ram.u16(slot + 0x12));            // $2A1170 move.w d0,$6(a0)
  ram.setU16(slot + 0x12, u16(ram.u16(slot + 0x12) + 1) & 1);  // $2A1176/$2A117A
  ram.setU8(slot + 0x02, (ram.u8(slot + 0x02) & ~0x10) | 0x20);  // $2A1180/$2A1186
  ram.setU16(slot + 0x0c, 0x00e0);                        // $2A118C
}

/**
 * `$2A1192` arm 7, bit 5 of `$2(a4)` -- THE CYCLE CLOSES. It restarts MAIN4 and A3 4
 * and hands the bit back to 2, so bits 2 -> 3 -> 4 -> 5 -> 2 is F5's attack loop and
 * the fight repeats until the boss dies.
 */
function f5Rearm2A1192(ram, slot) {
  if (a1Running259A4A(ram, 9)) return;                    // $2A119C
  ram.setU16(slot + 0x0c, u16(ram.u16(slot + 0x0c) - 1));  // $2A11A8 subq.w
  if (ram.u16(slot + 0x0c) !== 0) return;                 // $2A11AC bne
  seqStart2598D0(ram, 4);                                 // $2A11B0 -- MAIN4 again
  a3Start259962(ram, 4);                                  // $2A11B8
  ram.setU8(slot + 0x02, (ram.u8(slot + 0x02) & ~0x20) | 0x04);  // $2A11C0/$2A11C6
  ram.setU16(slot + 0x0c, 0x0040);                        // $2A11CC
}

/**
 * `$2A0D16` -- F5's STEP, the Stage-4 boss's second-phase conductor, and it is a BIT
 * machine rather than a state index: SEVEN arms, each gated on its own bit of
 * `$2(a4)`, all reached in one call and all re-reading the byte. An arm that hands its
 * bit to the next therefore lets that arm run on the SAME frame, and arms 1 and 3 are
 * both live at once for the whole fight.
 *
 * Nothing here needed a new helper. Every scheduler call it makes was already exported
 * -- `$2598D0`, `$2599B4`, `$259962`, `$259A18`, `$259A4A`, `$259B08` -- and both aim
 * blocks resolve to `MoveTables.shotVector`. What is still missing is only the SCRIPTS
 * it arms: A3 3/4/5/6/7/8, A1 6/7/8/9/10 and MAIN7. Those are unregistered, so the
 * next scheduler walk throws by address, which is the next wave's inventory.
 */
export function f5Step2A0D16(ram, rom, ctx, slot) {
  const arm = (m) => (ram.u8(slot + 0x02) & m) !== 0;
  if (arm(0x01)) f5OpenPods2A0D16(ram, rom, ctx, slot);   // $2A0D16
  f5Descendants2A0E84(ram, slot);                         // $2A0E84 -- ungated
  if (arm(0x02)) f5Patrol2A0F58(ram, rom, ctx, slot);     // $2A0F58
  if (arm(0x04)) f5Salvo2A106E(ram, slot);                // $2A106E
  if (arm(0x08)) f5Volley2A10F0(ram, slot);               // $2A10F0
  if (arm(0x10)) f5Sweep2A1138(ram, slot);                // $2A1138
  if (arm(0x20)) f5Rearm2A1192(ram, slot);                // $2A1192
}

/** `$2A0CF6` -- F5's INIT, and it FALLS THROUGH: `$2A0D10`'s last word ends exactly at
 *  `$2A0D16` with no `rts` between them, so the arming frame also spends its first
 *  spread step. The same trap W224 documented for F1. */
export function f5Init2A0CF6(ram, rom, ctx, slot) {
  seqStart2598D0(ram, 4);                                 // $2A0CF8 -- MAIN4
  ram.setU8(slot + 0x02, 1);                              // $2A0CFE
  ram.setU8(slot + 0x03, 0);                              // $2A0D04
  ram.setU16(slot + 0x04, 0);                             // $2A0D0A
  ram.setU16(slot + 0x06, 0);                             // $2A0D10
  f5Step2A0D16(ram, rom, ctx, slot);                      // falls through
}

registerScript(0x2a017a, f0_2A017A);
registerScript(0x2a019a, f0Step2A019A);
registerScript(0x29f5bc, main0Init29F5BC);
registerScript(0x29f5fe, main0Step29F5FE);
registerScript(0x29f3f0, object10_29F3F0);
registerScript(0x29ef88, object0_29EF88);
registerScript(0x29f0d6, object1_29F0D6);
registerScript(0x29f120, object2_29F120);
registerScript(0x29f16a, object3_29F16A);
registerScript(0x29f1fa, object4_29F1FA);
registerScript(0x29f228, object5_29F228);
registerScript(0x29efd2, object6_29EFD2);
registerScript(0x29f2de, object7_29F2DE);
registerScript(0x29f37a, object8_29F37A);
registerScript(0x29f03e, object9_29F03E);
registerScript(0x2a15be, d9_2A15BE);
registerScript(0x2a15de, d10_2A15DE);
registerScript(0x2a092c, f3Init2A092C);
registerScript(0x2a0984, f3Step2A0984);
registerScript(0x29f790, main1Init29F790);
registerScript(0x29f7a2, main1Step29F7A2);
registerScript(0x2a17e6, e1Init2A17E6);
registerScript(0x2a17f8, e1Step2A17F8);
registerScript(0x2a20a8, e2Init2A20A8);
registerScript(0x2a20ba, e2Step2A20BA);
registerScript(0x2a0bcc, f4Init2A0BCC);
registerScript(0x2a0bde, f4Step2A0BDE);
registerScript(0x2a1462, d1Init2A1462);
registerScript(0x2a1468, d1Step2A1468);
registerScript(0x2a1486, d2Init2A1486);
registerScript(0x2a148c, d2Step2A148C);
registerScript(0x2a280c, e3Init2A280C);
registerScript(0x2a282e, e3Step2A282E);
registerScript(0x2a2cc2, e5Init2A2CC2);
registerScript(0x2a2cc8, e5Step2A2CC8);
registerScript(0x2a019e, f1Init2A019E);
registerScript(0x2a01d8, f1Step2A01D8);
registerScript(0x29f80a, main2Init29F80A);
registerScript(0x29f822, main2Step29F822);
registerScript(0x29f826, main3Init29F826);
registerScript(0x29f840, main3Step29F840);
registerScript(0x2a13cc, d0Init2A13CC);
registerScript(0x2a13e8, d0Step2A13E8);
registerScript(0x29f8cc, main4Init29F8CC);
registerScript(0x29f8f0, main4Step29F8F0);
/**
 * `$2A3048` -- A1 8's FAN, four shots off one base angle, and the ORDER is the slot
 * order, which is observable in draw order and in the bomb's cancel loop:
 *
 *     +$4, +$C, -$4, -$C        (`addi.b #4` then `#8`, restore, `subi.b #4` then `#8`)
 *
 * all byte-wide, so a base near the wrap folds rather than saturating. `$2817B8` is
 * already the port's fan generator and the four `jsr` sites are passed through as the
 * attribution addresses the way `fireFive` passes its own.
 */
const A1_8_FAN_SITES = [0x2a3050, 0x2a305a, 0x2a3066, 0x2a3070];

function a1_8Fan2A3048(ram, rom, ctx, a5, d0, base, d2, d3) {
  const angles = [base + 4, base + 0x0c, base - 4, base - 0x0c];
  for (let i = 0; i < 4; i++) {
    shootBoss4(ram, rom, ctx, A1_8_FAN_SITES[i], 0x2817b8,
      regsBoss4(a5, d0, angles[i] & 0xff, d2, d3));
  }
}

/**
 * `$2A2F1E` / `$2A2F72` -- A1 8, which F5's `$3(A4)` chain starts once the pod pair
 * retires. TWO BARRELS, one per pod, each a burst counter over a cadence counter:
 *
 *     barrel 1   $2(a4) outer / $4(a4) inner / $6(a4) burst   fires from `$82(a6)`
 *     barrel 2   $8(a4) outer / $A(a4) inner / $C(a4) burst   fires from `$A2(a6)`
 *
 * The outer counter is consulted ONLY while the burst counter is zero (`tst.b $6(a4)`
 * / `bne`), so a burst in progress bypasses it and empties at the inner cadence. Each
 * `subq.b`/`bcc` pair is the old-zero borrow, and every reload comes from the byte
 * immediately above its counter.
 *
 * THREE OF ITS REGISTER LOADS ARE DEAD, and reproducing that is the point. Both
 * barrels accumulate an angle -- `$12(a4) += $13(a4)` and `$14(a4) += $15(a4)` -- read
 * it into D1, and then immediately overwrite D1 with a CONSTANT (`$40` and `$C0`); and
 * both load `$16(a4)`/`$17(a4)` into D7, which `$281576` overwrites out of the shot
 * template. So the accumulators run and are stored (observable) while the angles they
 * feed are fixed (also observable), and a port that "tidied" either half would aim
 * this attack somewhere the board never aims it.
 *
 * Barrel 2 also calls `$24226E` -- `aim256FromCaller`, the nearer-player aim -- and
 * DISCARDS the result on the next instruction. Transcribed as a call rather than
 * dropped, because target selection is the one part of it that can fail.
 */
const A1_8_INIT_WORDS = [
  [0x02, 0x040d], [0x04, 0x0040], [0x06, 0x0001],        // $2A2F1E..$2A2F2A
  [0x08, 0x0410], [0x0a, 0x0010], [0x0c, 0x0001],        // $2A2F30..$2A2F3C
];
const A1_8_INIT_BYTES = [
  [0x10, 0x00], [0x11, 0x00], [0x12, 0x00], [0x13, 0x18],  // $2A2F42..$2A2F54
  [0x14, 0x00], [0x15, 0xec], [0x16, 0x00], [0x17, 0x00],  // $2A2F5A..$2A2F6C
];

/** `$2A2FBC` and `$2A3030` -- `ext.w` a byte into the HIGH word and 5 in the low one.
 *  The sign extension is what makes a byte of `$80` or more a NEGATIVE bias. */
const a1_8D0 = (ram, slot, off) =>
  ((((ram.u8(slot + off) << 24) >> 24) << 16) | 5) >>> 0;

export function a1_8Step2A2F72(ram, rom, ctx, slot) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;

  barrel1: {
    if (ram.u8(slot + 0x06) === 0) {                      // $2A2F72 tst.b/bne
      if (!due8(ram, slot + 0x02)) break barrel1;         // $2A2F7A subq.b/bcc
      ram.setU8(slot + 0x02, ram.u8(slot + 0x03));        // $2A2F82
      ram.setU8(slot + 0x06, ram.u8(slot + 0x07));        // $2A2F88 arm the burst
    }
    if (!due8(ram, slot + 0x04)) break barrel1;           // $2A2F8E subq.b/bcc
    ram.setU8(slot + 0x04, ram.u8(slot + 0x05));          // $2A2F96
    ram.setU8(slot + 0x12,                                // $2A2F9C/$2A2FA0 add.b
      (ram.u8(slot + 0x12) + ram.u8(slot + 0x13)) & 0xff);
    // $2A2FA4 reads $12(a4) into D1 and $2A2FA8 throws it away. See the header.
    a1_8Fan2A3048(ram, rom, ctx, a5, a1_8D0(ram, slot, 0x10), 0x40,
      ram.u32(a6 + 0x82), 0xf9400200);                    // $2A2FA8..$2A2FCA
    ram.setU8(slot + 0x06, ram.u8(slot + 0x06) - 1);      // $2A2FCE subq.b
  }

  if (ram.u8(slot + 0x0c) === 0) {                        // $2A2FD2 tst.b/bne
    if (!due8(ram, slot + 0x08)) return;                  // $2A2FDA subq.b/bcc
    ram.setU8(slot + 0x08, ram.u8(slot + 0x09));          // $2A2FE2
    ram.setU8(slot + 0x0c, ram.u8(slot + 0x0d));          // $2A2FE8
    ram.setU8(slot + 0x14,                                // $2A2FEE/$2A2FF2 add.b
      (ram.u8(slot + 0x14) + ram.u8(slot + 0x15)) & 0xff);
  }
  if (!due8(ram, slot + 0x0a)) return;                    // $2A2FF6 subq.b/bcc
  ram.setU8(slot + 0x0a, ram.u8(slot + 0x0b));            // $2A2FFE
  // $2A3004..$2A3012 -- aimed at the nearer player from pod 2's biased position, and
  // $2A3018/$2A301C discard the answer immediately.
  aim256FromCaller(aimTables(rom), ram, a5,
    u16(ram.u16(a6 + 0xa2) + 0xf940), u16(ram.u16(a6 + 0xa4) + 0xfe00));
  a1_8Fan2A3048(ram, rom, ctx, a5, a1_8D0(ram, slot, 0x11), 0xc0,
    ram.u32(a6 + 0xa2), 0xf93ffe00);                      // $2A301C..$2A303E
  ram.setU8(slot + 0x0c, ram.u8(slot + 0x0c) - 1);        // $2A3042 subq.b
}

/** `$2A2F1E` -- A1 8's INIT, fourteen literals and then it FALLS THROUGH: `$2A2F6C`
 *  ends exactly at `$2A2F72`. Every counter arrives at a value its own `subq.b` can
 *  borrow out of, and `$6(a4)`/`$C(a4)` arrive at ZERO so the first frame consults the
 *  outer cadence rather than a burst. */
export function a1_8Init2A2F1E(ram, rom, ctx, slot) {
  for (const [off, v] of A1_8_INIT_WORDS) ram.setU16(slot + off, v);
  for (const [off, v] of A1_8_INIT_BYTES) ram.setU8(slot + off, v);
  a1_8Step2A2F72(ram, rom, ctx, slot);                    // falls through
}

/**
 * `$2A307A` / `$2A30A8` -- A1 9, and it is a SPAWNER rather than an emitter: it waits
 * eight frames, draws one of four formations, and enqueues a ring of type `$42`
 * children through `$263684`. F5's arm 6 starts it once per attack cycle.
 *
 * `$2A3132` is EIGHT selector longwords resolving to FOUR lists, each appearing twice,
 * so `andi.w #$7` gives every formation a 2-in-8 chance. Each list is self-describing:
 *
 *     $2A3152   $0E   9 angles   $00 $F0 $E0  $55 $45 $35  $AB $9B $8B
 *     $2A315D   $F2   9 angles   $00 $10 $20  $55 $65 $75  $AB $BB $CB
 *     $2A3168   $0E   8 angles   $00 $20 $40 $60 $80 $A0 $C0 $E0
 *     $2A3172   $F2   8 angles   $00 $20 $40 $60 $80 $A0 $C0 $E0
 *
 * The first byte goes into every child's `$1A` and is SIGNED -- `$0E` and `$F2` are
 * +14 and -14 -- so two formations travel one way and two the other. The nines are
 * three clusters of three and the eights are an even ring.
 *
 * THE PARENT POINTER IS THE INTERESTING FIELD. `$2A30F4 move.l a6,$1c(a0)` hands each
 * child the boss's sub-record, and `$2A3D5A movea.l $1c(a5),a0 / addq.w #$1,$19e(a0)`
 * in type `$42`'s handler is how a dying child counts itself back. `$19E(a6)` has
 * exactly FOUR references in the whole 6 MB image -- this script's `clr.w` and read,
 * one piece of table data, and that one increment -- so the rendezvous at `$2A3108` is
 * a closed loop between this script and its own children and nothing else.
 *
 * Which means A1 9 CANNOT RETIRE until type `$42` is ported, and F5's arms 6 and 7
 * both wait on `a1Running(9)`. That is the honest shape of the frontier, not a defect
 * here: the script is right and its children do not exist yet.
 */
const A1_9_SELECTOR = 0x2a3132;
const BOSS_F4 = 0x8130f4;                                 // $2A3098 clr.w $8130F4
const BOSS_F0 = 0x8130f0;                                 // $2A11DC clr.w
const BOSS_F2 = 0x8130f2;                                 // $2A126C / $2A12B2

export function a1_9Step2A30A8(ram, rom, ctx, slot) {
  const a6 = ctx.bossSubRec;
  if (ram.u8(slot + 0x02) !== 0) {                        // $2A30A8 tst.b/beq
    ram.setU8(slot + 0x02, ram.u8(slot + 0x02) - 1);      // $2A30B0 subq.b
    if (ram.u8(slot + 0x02) === 0) {                      // $2A30B4 bne -- ONE frame
      // $2A30BE `andi.w #$7` then two `add.w D0,D0`: a longword index into eight.
      let p = rom.u32(A1_9_SELECTOR + (drawWord242EC2(ram, rom) & 7) * 4);
      const speed = rom.u8(p++);                          // $2A30D0 move.b (a3)+,d6
      const count = rom.u8(p++);                          // $2A30D4 move.b (a3)+,d7
      ram.setU16(slot + 0x04, count);                     // $2A30D6 -- the rendezvous
      // $2A30DA `subq.w #$1,d7` then `dbra` at $2A3104, so exactly `count` passes.
      for (let i = 0; i < count; i++) {
        const q = enqueueDeferred(ram, 0x42, DEFQ_D1.FIXED00);   // $2A30DC/$2A30DE
        ram.setU32(q.addr + 0x16, ram.u32(a6 + 0x22));    // $2A30E4/$2A30E8
        ram.setU8(q.addr + 0x1a, speed);                  // $2A30EC -- shared, signed
        ram.setU8(q.addr + 0x1b, rom.u8(p++));            // $2A30F0 -- its own angle
        ram.setU32(q.addr + 0x1c, a6);                    // $2A30F4 -- the parent
        ram.setU8(q.addr + 0x20, ram.u8(slot + 0x09));    // $2A30F8
        ram.setU8(q.addr + 0x21, 0xff);                   // $2A30FE
      }
    }
  }

  // $2A3108 -- the rendezvous, and all three gates have to hold on the same frame.
  if (ram.u16(a6 + 0x19e) !== ram.u16(slot + 0x04)) return;  // $2A310C cmp.w/bne
  if (ram.u16(BOSS_F4) !== 0) return;                        // $2A3114 tst.w/bne
  ram.setU16(slot + 0x10, u16(ram.u16(slot + 0x10) - 1));    // $2A311E subq.w
  if (ram.u16(slot + 0x10) !== 0) return;                    // $2A3122 bne
  ram.setU16(BOSS_F4, 1);                                    // $2A3126
  ram.setU16(slot, 0);                                       // $2A312E clr.w (a4)
}

/**
 * `$2A307A` -- A1 9's INIT, and it FALLS THROUGH (`$2A30A4` ends at `$2A30A8`).
 *
 * `$6(a4)` is where F5's arm 6 puts its 0/1 side selector, and this line OVERWRITES it
 * with `$C` before anything reads it. `$8(a4)` = 3 is likewise never read. So F5's one
 * parameter to a child is dead, which is the fourth vestigial write this boss has
 * shown: A1 8 has three of its own. Transcribed rather than tidied, because the stored
 * bytes are observable even when the values they were meant to carry are not.
 */
export function a1_9Init2A307A(ram, rom, ctx, slot) {
  ram.setU16(slot + 0x02, 0x0820);                        // $2A307A -- 8, period $20
  ram.setU16(slot + 0x04, 0);                             // $2A3080
  ram.setU16(slot + 0x06, 0x000c);                        // $2A3086 -- clobbers F5's
  ram.setU8(slot + 0x08, 0x03);                           // $2A308C -- never read
  ram.setU8(slot + 0x09, 0x48);                           // $2A3092 -- into each child
  ram.setU16(BOSS_F4, 0);                                 // $2A3098
  ram.setU16(slot + 0x10, 0x0050);                        // $2A309E -- the retire hold
  ram.setU16(ctx.bossSubRec + 0x19e, 0);                  // $2A30A4
  a1_9Step2A30A8(ram, rom, ctx, slot);                    // falls through
}

registerScript(0x2a0cf6, f5Init2A0CF6);
registerScript(0x2a0d16, f5Step2A0D16);
registerScript(0x2a2f1e, a1_8Init2A2F1E);
registerScript(0x2a2f72, a1_8Step2A2F72);
/**
 * `$2A2D70` / `$2A2D8E` -- A1 6, and it is THE SECOND LOOP-SPECIFIC RULE this port has
 * translated (W241's zero-lives extend was the first). `$813098` is the loop word, and
 * it changes both the shot count and the GENERATOR:
 *
 *     loop 1   three shots through `$2817B8`, `$55` apart   (a wide three-way)
 *     loop 2   FOUR shots through `$281708`, `$40` apart    (a full ring)
 *
 * Both barrels do it, one per pod, and the two counter-rotate: `$10(a4)` loses 4 while
 * `$11(a4)` gains 4 after every volley, and then AGAIN on every seventh (`$6(a4)`
 * period 6 through the old-zero borrow). So the two rings drift apart at one rate and
 * jump at another, which is what stops the pattern from repeating.
 */
const A1_6_LOOP1 = [0x2a2dbe, 0x2a2dc8, 0x2a2dd2];
const A1_6_LOOP2 = [0x2a2ddc, 0x2a2de6, 0x2a2df0, 0x2a2dfa];
const A1_6_LOOP1_B = [0x2a2e22, 0x2a2e2c, 0x2a2e36];
const A1_6_LOOP2_B = [0x2a2e40, 0x2a2e4a, 0x2a2e54, 0x2a2e5e];
const LOOP_WORD = 0x813098;                               // $2A2DB4 tst.w $813098

function a1_6Barrel(ram, rom, ctx, a5, base, d2, d3, sites1, sites2) {
  const loop2 = ram.u16(LOOP_WORD) !== 0;                 // $2A2DB4/$2A2E18
  const sites = loop2 ? sites2 : sites1;
  const stride = loop2 ? 0x40 : 0x55;                     // $2A2DE2 vs $2A2DC4
  const entry = loop2 ? 0x281708 : 0x2817b8;
  for (let i = 0; i < sites.length; i++) {
    shootBoss4(ram, rom, ctx, sites[i], entry,
      regsBoss4(a5, 0xfffc0016, (base + i * stride) & 0xff, d2, d3));
  }
}

export function a1_6Step2A2D8E(ram, rom, ctx, slot) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  if (!due8(ram, slot + 0x04)) return;                    // $2A2D8E subq.b/bcc
  ram.setU8(slot + 0x04, ram.u8(slot + 0x05));            // $2A2D96
  a1_6Barrel(ram, rom, ctx, a5, ram.u8(slot + 0x10),      // $2A2D9C..$2A2DFA
    ram.u32(a6 + 0x82), 0xf94001c0, A1_6_LOOP1, A1_6_LOOP2);
  a1_6Barrel(ram, rom, ctx, a5, ram.u8(slot + 0x11),      // $2A2E00..$2A2E5E
    ram.u32(a6 + 0xa2), 0xf93ffe40, A1_6_LOOP1_B, A1_6_LOOP2_B);
  // $2A2E64 -- the counter-rotation, once per volley...
  ram.setU8(slot + 0x10, (ram.u8(slot + 0x10) - 4) & 0xff);
  ram.setU8(slot + 0x11, (ram.u8(slot + 0x11) + 4) & 0xff);
  if (!due8(ram, slot + 0x06)) return;                    // $2A2E70 subq.b/bcc
  ram.setU8(slot + 0x06, ram.u8(slot + 0x07));            // $2A2E78
  // ...and AGAIN on every seventh, which is a second rate rather than a bigger step.
  ram.setU8(slot + 0x10, (ram.u8(slot + 0x10) - 4) & 0xff);   // $2A2E7E
  ram.setU8(slot + 0x11, (ram.u8(slot + 0x11) + 4) & 0xff);   // $2A2E84
}

/** `$2A2D70` -- A1 6's INIT, and it FALLS THROUGH (`$2A2D88` ends at `$2A2D8E`), so the
 *  arming frame fires: `$4(a4)` arrives at 3 and `due8` borrows only out of zero, so
 *  actually it does NOT -- the first volley is three frames later. `$2(a4)` = 0 is
 *  written and never read, one more of this boss's vestigial stores. */
export function a1_6Init2A2D70(ram, rom, ctx, slot) {
  ram.setU8(slot + 0x02, 0);                              // $2A2D70 -- never read
  ram.setU16(slot + 0x04, 0x0303);                        // $2A2D76
  ram.setU16(slot + 0x06, 0x0606);                        // $2A2D7C
  ram.setU8(slot + 0x10, 0);                              // $2A2D82
  ram.setU8(slot + 0x11, 0);                              // $2A2D88
  a1_6Step2A2D8E(ram, rom, ctx, slot);                    // falls through
}

/**
 * `$2A2E8C` / `$2A2E9E` -- A1 7, the AIMED five-shot fan, and the one place in this
 * family where `$24226E`'s answer is actually USED: D1 comes back as the direction and
 * the fan is built on it. A1 8 makes the same call and throws it away.
 *
 * The fan is `base`, `+6`, `+$C`, `-6`, `-$C` -- exactly `fireFive`'s shape with a
 * delta of 6, reached by `+6 +6 -$12 -6` rather than by absolute offsets.
 *
 * `$9F(a6)` is its kill switch: any nonzero value and it retires itself before doing
 * anything else, which is how arm 4's `a1Stop` pair and the pod's own state can end it
 * mid-burst.
 */
const A1_7_SITES = [0x2a2eda, 0x2a2ee4, 0x2a2eee, 0x2a2ef8, 0x2a2f02];

export function a1_7Step2A2E9E(ram, rom, ctx, slot) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  if (ram.u8(a6 + 0x9f) !== 0) {                          // $2A2E9E tst.b/beq
    ram.setU16(slot, 0);                                  // $2A2EA6 clr.w (a4)
    return;
  }
  if (!due8(ram, slot + 0x04)) return;                    // $2A2EAA subq.b/bcc
  ram.setU8(slot + 0x04, ram.u8(slot + 0x05));            // $2A2EB2
  // $2A2EB8..$2A2EC6 -- self is pod 2's position biased into the muzzle, and on a
  // carry (no live target) the ROM leaves D1 holding that biased X, which is what
  // `aimed.carry` selects here. Same convention E3 already uses.
  const selfY = u16(ram.u16(a6 + 0xa2) + 0xf940);
  const selfX = u16(ram.u16(a6 + 0xa4) + 0xfe40);
  const aimed = aim256FromCaller(aimTables(rom), ram, a5, selfY, selfX);
  const base = aimed.carry ? selfX & 0xff : aimed.dir;
  const d2 = ram.u32(a6 + 0xa2), d3 = 0xf93ffe40;
  const angles = [base, base + 6, base + 0x0c, base - 6, base - 0x0c];
  for (let i = 0; i < 5; i++) {                           // $2A2EDA..$2A2F02
    shootBoss4(ram, rom, ctx, A1_7_SITES[i], 0x2817b8,
      regsBoss4(a5, 4, angles[i] & 0xff, d2, d3));
  }
  // $2A2F08 -- `subq.b` with `bne`, NOT `bcc`: this one fires on reaching zero, and
  // when it does it shortens the cadence from $20 to $40... which is LONGER. The
  // burst slows down as it goes.
  ram.setU8(slot + 0x06, ram.u8(slot + 0x06) - 1);
  if (ram.u8(slot + 0x06) !== 0) return;
  ram.setU8(slot + 0x06, ram.u8(slot + 0x07));            // $2A2F10
  ram.setU8(slot + 0x04, 0x40);                           // $2A2F16
}

/** `$2A2E8C` -- A1 7's INIT, and `$2A2E92` is the odd one: it writes `$1020` and then
 *  ADDS `$40` to the low byte, so `$4(a4)` starts at `$5020` rather than `$1020`. Two
 *  instructions where one would do, and a port that folded them would start the first
 *  volley $40 frames early. It FALLS THROUGH too (`$2A2E98` ends at `$2A2E9E`). */
export function a1_7Init2A2E8C(ram, rom, ctx, slot) {
  ram.setU16(slot + 0x04, 0x1020);                        // $2A2E8C
  ram.setU8(slot + 0x04, (ram.u8(slot + 0x04) + 0x40) & 0xff);  // $2A2E92 addi.b
  ram.setU16(slot + 0x06, 0x0202);                        // $2A2E98
  a1_7Step2A2E9E(ram, rom, ctx, slot);                    // falls through
}

registerScript(0x2a307a, a1_9Init2A307A);
registerScript(0x2a30a8, a1_9Step2A30A8);
registerScript(0x2a2d70, a1_6Init2A2D70);
registerScript(0x2a2d8e, a1_6Step2A2D8E);
registerScript(0x2a2e8c, a1_7Init2A2E8C);
registerScript(0x2a2e9e, a1_7Step2A2E9E);
/**
 * `$2A320E` / `$2A323E` -- A1 10, the pod barrage, and the one script in this boss with
 * an INDIRECT dispatch: `$2A32C6 lea $2A33C2 / adda.w $C(a4) / adda.w $19C(a6) /
 * movea.l (a0),a0 / jsr (a0)`. Two indices into eight longwords, and the four routines
 * they resolve to are fans of ONE, TWO, THREE and FOUR shots:
 *
 *     $2A33E2   d1                                one shot
 *     $2A33EA   d1-$A, d1+$A                      two
 *     $2A3400   d1, d1+$E, d1-$E                  three
 *     $2A341C   d1-9, d1-$1B, d1+9, d1+$1B        four
 *
 * every one of them through `$281708`, which the port already has. The angles are
 * reached by RELATIVE steps (`subi.b #$A` then `addi.b #$14`, and so on), all byte-wide,
 * so a base near the wrap folds.
 *
 * `$19C(a6)` IS A DIFFICULTY RATCHET. `$2A33AC addq.w #$8` bumps it once per run of the
 * script and `$2A33A2 cmpi.w #$10 / beq` stops it at `$10`, so it takes the values 0, 8,
 * `$10` and no others. Paired with `$C(a4)`'s four steps that walks the whole table:
 *
 *     $19C = 0     fans of 1, 1, 2, 2
 *     $19C = 8     fans of 2, 2, 3, 3
 *     $19C = $10   fans of 3, 3, 4, 4
 *
 * so the barrage thickens each time the boss reaches this attack, and the table's eight
 * entries are exactly the reachable index set: `$C + $10` is `$1C`, the last one.
 */
const A1_10_BIASES = 0x2a33b2;                            // four longwords
const A1_10_DISPATCH = 0x2a33c2;                          // eight longwords
const A1_10_FANS = {
  0x2a33e2: { offs: [0], sites: [0x2a33e2] },
  0x2a33ea: { offs: [-0x0a, 0x0a], sites: [0x2a33ee, 0x2a33f8] },
  0x2a3400: { offs: [0, 0x0e, -0x0e], sites: [0x2a3400, 0x2a340a, 0x2a3414] },
  0x2a341c: { offs: [-9, -0x1b, 9, 0x1b],
    sites: [0x2a3420, 0x2a342a, 0x2a3434, 0x2a343e] },
};

function a1_10Fan(ram, rom, ctx, a5, entry, d0, base, d2, d3) {
  const fan = A1_10_FANS[entry];
  if (!fan) {
    unreached(0x2a32d6, `$2A33C2's dispatch resolved to $${entry.toString(16)
      .toUpperCase()}, which is not one of the four fans at $2A33E2, $2A33EA, `
      + `$2A3400 and $2A341C. Either $19C(A6) left the 0/8/$10 set $2A33A2 bounds `
      + `it to, or $C(a4) escaped $2A32E4's andi.w #$F`);
  }
  for (let i = 0; i < fan.offs.length; i++) {
    shootBoss4(ram, rom, ctx, fan.sites[i], 0x281708,
      regsBoss4(a5, d0, (base + fan.offs[i]) & 0xff, d2, d3));
  }
}

/** `$2A32A0`/`$2A3374` -- `ext.w` a byte into the HIGH word with `$13` in the low one. */
const a1_10D0 = (ram, slot) =>
  ((((ram.u8(slot + 0x0a) << 24) >> 24) << 16) | 0x13) >>> 0;

/** `$2A326E` and `$2A3306`/`$2A3352` -- aim from the body position, optionally biased by
 *  one of the four muzzles, then jitter the answer with a `$242B3C` byte. */
function a1_10Aim(ram, rom, ctx, slot, bias) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  let selfY = ram.u16(a6 + 0x22), selfX = ram.u16(a6 + 0x24);
  if (bias !== null) {
    selfY = u16(selfY + rom.u16(bias));                   // $2A3274 add.w (a0)+,d0
    selfX = u16(selfX + rom.u16(bias + 2));               // $2A3276 add.w (a0),d1
  }
  const aimed = aim256FromCaller(aimTables(rom), ram, a5, selfY, selfX);
  ram.setU8(slot + 0x0b, aimed.carry ? selfX & 0xff : aimed.dir);   // $2A327E
  ram.setU8(slot + 0x0b,                                 // $2A3282/$2A3288 add.b
    (ram.u8(slot + 0x0b) + drawByte242B3C(ram, rom)) & 0xff);
}

export function a1_10Step2A323E(ram, rom, ctx, slot) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;

  state0: if (ram.u8(slot + 0x02) === 0) {                // $2A323E cmpi.b #$0/bne
    if (ram.u8(slot + 0x08) === 0) {                      // $2A3248 tst.b/bne
      if (!due8(ram, slot + 0x04)) break state0;          // $2A3250 subq.b/bcc
      ram.setU8(slot + 0x04, ram.u8(slot + 0x05));        // $2A3258
      ram.setU8(slot + 0x08, ram.u8(slot + 0x09));        // $2A325E arm the burst
      a1_10Aim(ram, rom, ctx, slot, A1_10_BIASES + ram.u16(slot + 0x0c));  // $2A3264
      ram.setU8(slot + 0x0a, 0);                          // $2A328C
    }
    if (!due8(ram, slot + 0x06)) break state0;            // $2A3292 subq.b/bcc
    ram.setU8(slot + 0x06, ram.u8(slot + 0x07));          // $2A329A
    const cursor = ram.u16(slot + 0x0c);
    a1_10Fan(ram, rom, ctx, a5,                           // $2A32C6..$2A32D6
      rom.u32(A1_10_DISPATCH + cursor + ram.u16(a6 + 0x19c)),
      a1_10D0(ram, slot), ram.u8(slot + 0x0b),
      ram.u32(a6 + 0x22), rom.u32(A1_10_BIASES + cursor));
    ram.setU8(slot + 0x08, ram.u8(slot + 0x08) - 1);      // $2A32D8 subq.b
    if (ram.u8(slot + 0x08) !== 0) break state0;          // $2A32DC bne
    ram.setU16(slot + 0x0c, u16(cursor + 4) & 0x000f);    // $2A32E0/$2A32E4
    if (ram.u16(slot + 0x0c) !== 0) break state0;         // $2A32EA bne

    // $2A32EE -- the cursor came round, so hand over to state 1. `$8(a4)` is a BYTE
    // counter above and a WORD one below, and this is where it changes hands.
    ram.setU16(slot + 0x04, 0x3002);                      // $2A32EE
    ram.setU16(slot + 0x08, 0x000a);                      // $2A32F4 -- ten volleys
    ram.setU8(slot + 0x0a, 8);                            // $2A32FA
    ram.setU8(slot + 0x02, 1);                            // $2A3300
    a1_10Aim(ram, rom, ctx, slot, null);                  // $2A3306..$2A331C
    ram.bchg8(a5 + 0x03, 0);                              // $2A3320 bchg #$0,$3(a5)
  }

  if (ram.u8(slot + 0x02) !== 1) return;                  // $2A3326 cmpi.b #$1/bne
  if (!due8(ram, slot + 0x04)) return;                    // $2A3330 subq.b/bcc
  ram.setU8(slot + 0x04, ram.u8(slot + 0x05));            // $2A3338
  if (ram.u16(slot + 0x0e) === 0) {                       // $2A333E tst.w/bne
    ram.bchg8(a5 + 0x03, 0);                              // $2A3346
    ram.setU16(slot + 0x0e, 1);                           // $2A334C -- once only
    // $2A3352 aims WITHOUT the jitter draw the other two sites make.
    const aimed = aim256FromCaller(aimTables(rom), ram, a5,
      ram.u16(a6 + 0x22), ram.u16(a6 + 0x24));
    ram.setU8(slot + 0x0b,
      aimed.carry ? ram.u16(a6 + 0x24) & 0xff : aimed.dir);   // $2A335E
  }
  // $2A3362..$2A3394 -- TWO fans, from muzzles 2 and 3 ($2A33BA) and dispatch entries
  // 8 and $C past the base, both shifted by the same `$19C(a6)` ratchet.
  for (let i = 0; i < 2; i++) {
    a1_10Fan(ram, rom, ctx, a5,
      rom.u32(A1_10_DISPATCH + 8 + i * 4 + ram.u16(a6 + 0x19c)),
      a1_10D0(ram, slot), ram.u8(slot + 0x0b),
      ram.u32(a6 + 0x22), rom.u32(A1_10_BIASES + 8 + i * 4));
  }
  ram.setU16(slot + 0x08, u16(ram.u16(slot + 0x08) - 1));  // $2A3398 subq.w
  if (ram.u16(slot + 0x08) !== 0) return;                  // $2A339C bne
  ram.setU16(slot, 0);                                     // $2A33A0 clr.w (a4)
  if (ram.u16(a6 + 0x19c) === 0x10) return;                // $2A33A2 cmpi.w/beq
  ram.setU16(a6 + 0x19c, u16(ram.u16(a6 + 0x19c) + 8));    // $2A33AC -- the RATCHET
}

/** `$2A320E` -- A1 10's INIT, eight literals and a FALL-THROUGH (`$2A3238` ends at
 *  `$2A323E`). `$8(a4)` arrives as the word `$000A`, whose low byte is the ZERO state 0
 *  tests and whose high byte is the `$A` it arms the burst from. */
export function a1_10Init2A320E(ram, rom, ctx, slot) {
  ram.setU8(slot + 0x02, 0);                              // $2A320E
  ram.setU16(slot + 0x04, 0x4008);                        // $2A3214 -- $40, period 8
  ram.setU16(slot + 0x06, 0x0004);                        // $2A321A -- 0, period 4
  ram.setU16(slot + 0x08, 0x000a);                        // $2A3220
  ram.setU8(slot + 0x0a, 8);                              // $2A3226
  ram.setU8(slot + 0x0b, 0);                              // $2A322C
  ram.setU16(slot + 0x0c, 0);                             // $2A3232 -- the cursor
  ram.setU16(slot + 0x0e, 0);                             // $2A3238
  a1_10Step2A323E(ram, rom, ctx, slot);                   // falls through
}

registerScript(0x29f9b4, main7Init29F9B4);
registerScript(0x29f9cc, main7Step29F9CC);
/**
 * `$2A11D4` / `$2A1274` -- A4 id6, THE THIRD PHASE, which F5's arm 5 hands to. Its INIT
 * is the phase change itself: it raises `$8130F4` to 2, which is the word type `$42`'s
 * handler branches on, so every child already in the air switches behaviour on the very
 * next frame (see `stage4type42.js`). It also retires the whole of F5's attack set --
 * A3 4 and A1 6, 7, 8, 9 and 10 -- and starts MAIN8, A3 3 and A1 11 in their place.
 *
 * The STEP is three independent arms and TWO of them alternate a pair of scripts:
 *
 *     $2A1274  bit-free state on `$2(a4)`: start A1 11 once A3 3 is idle, then latch
 *     $2A1298  the `$8130F2` PULSE -- raised for exactly one frame every `$4(a4)`
 *              frames, and the next interval is drawn ($1C0 + a 7-bit draw)
 *     $2A12CC  `$6(a4)` alternates A1 13 and A1 14, each waiting for the other to
 *              finish, and hands each one a parameter through the slot `$259A18` returns
 *
 * `$8130F2` is what type `$42`'s sweep (`$2A3F2A`) waits on, so this pulse is the signal
 * that makes every child in A4 id6's phase start its turn at the same instant.
 *
 * TWO MORE LOOP-2 RULES, the third and fourth this port has found. `$2A1250` starts
 * `$A(a4)` at 3 rather than 1 in loop 2, and `$2A1346` caps its growth at 5 rather
 * than 3 -- and `$A(a4)` is the parameter A1 13 receives, so the second loop's version
 * of this attack begins harder and ends harder.
 */
export function a4id6Step2A1274(ram, rom, ctx, slot) {
  if (ram.u8(slot + 0x02) === 0) {                        // $2A1274 cmpi.b #$0/bne
    if (!a3Running2599B4(ram, 3)) {                       // $2A127E/$2A1280 bcs
      a1Start259A18(ram, 11);                             // $2A128A/$2A128C
      ram.setU8(slot + 0x02, 1);                          // $2A1292
    }
  }
  if (ram.u8(slot + 0x02) === 1) {                        // $2A1298 cmpi.b #$1/bne
    ram.setU16(BOSS_F2, 0);                               // $2A12A2 -- down every frame
    ram.setU16(slot + 0x04, u16(ram.u16(slot + 0x04) - 1));  // $2A12AA subq.w
    if (ram.u16(slot + 0x04) === 0) {                     // $2A12AE bne
      ram.setU16(BOSS_F2, 1);                             // $2A12B2 -- UP for one frame
      // $2A12BA..$2A12C8 -- and the next interval is $1C0 plus a 7-bit draw.
      ram.setU16(slot + 0x04,
        u16((drawWord242EC2(ram, rom) & 0x7f) + 0x01c0));
    }
  }
  if (ram.u16(slot + 0x06) === 0) {                       // $2A12CC cmpi.w #$0/bne
    if (!a1Running259A4A(ram, 13)) {                      // $2A12D6/$2A12D8 bcs
      ram.setU16(slot + 0x08, u16(ram.u16(slot + 0x08) - 1));  // $2A12E2 subq.w
      if (ram.u16(slot + 0x08) === 0) {                   // $2A12E6 bne
        const a0 = a1Start259A18(ram, 14);                // $2A12EA/$2A12EC
        ram.setU16(a0 + 0x10, ram.u16(slot + 0x0c));      // $2A12F2 through A0
        ram.setU16(slot + 0x06, 1);                       // $2A12F8
        ram.setU16(slot + 0x08, 0x0030);                  // $2A12FE
      }
    }
  }
  if (ram.u16(slot + 0x06) !== 1) return;                 // $2A1304 cmpi.w #$1/bne
  if (a1Running259A4A(ram, 14)) return;                   // $2A130E/$2A1310 bcs
  ram.setU16(slot + 0x08, u16(ram.u16(slot + 0x08) - 1));  // $2A131A subq.w
  if (ram.u16(slot + 0x08) !== 0) return;                 // $2A131E bne
  ram.setU16(slot + 0x06, 0);                             // $2A1322 -- back to A1 13
  const a0 = a1Start259A18(ram, 13);                      // $2A1328/$2A132A
  ram.setU16(a0 + 0x10, ram.u16(slot + 0x0a));            // $2A1330 -- the loop-2 one
  ram.setU16(a0 + 0x12, ram.u16(slot + 0x0e));            // $2A1336
  ram.setU16(slot + 0x08, 0x0040);                        // $2A133C
  // $2A1342..$2A135C -- and BOTH parameters ratchet up, each with its own cap.
  const cap = ram.u16(LOOP_WORD) !== 0 ? 5 : 3;           // $2A1346 tst.w $813098
  if (ram.u16(slot + 0x0a) !== cap) {                     // $2A1354 cmp.w/beq
    ram.setU16(slot + 0x0a, u16(ram.u16(slot + 0x0a) + 1));  // $2A135C addq.w
  }
  if (ram.u16(slot + 0x0e) !== 0x10) {                    // $2A1360 cmpi.w #$10/beq
    ram.setU16(slot + 0x0e, u16(ram.u16(slot + 0x0e) + 1));  // $2A136A addq.w
  }
}

/** `$2A11D4` -- A4 id6's INIT, and it FALLS THROUGH (`$2A126C` ends at `$2A1274`). It is
 *  the phase CHANGE: `$8130F4 = 2` re-routes every type `$42` child already in the air,
 *  and the six stops retire F5's whole attack set. */
export function a4id6Init2A11D4(ram, rom, ctx, slot) {
  ram.setU16(BOSS_F4, 2);                                 // $2A11D4 -- THE PHASE
  ram.setU16(BOSS_F0, 0);                                 // $2A11DC
  ram.setU16(0x8130ec, 0xffff);                           // $2A11E2
  ram.setU16(0x8130ee, 0xffff);                           // $2A11EA
  seqStart2598D0(ram, 8);                                 // $2A11F2 -- MAIN8
  ram.setU8(slot + 0x02, 0);                              // $2A11FA
  a3Stop2599EC(ram, 4);                                   // $2A1200/$2A1202
  a3Start259962(ram, 3);                                  // $2A1208/$2A120A
  for (const id of [6, 7, 8, 9, 0x0a]) a1Stop259B08(ram, id);  // $2A1210..$2A1232
  ram.setU16(slot + 0x04, 0x0180);                        // $2A1238 -- the pulse timer
  ram.setU16(slot + 0x06, 0);                             // $2A123E
  ram.setU16(slot + 0x08, 0x0100);                        // $2A1244
  // $2A1250 -- the THIRD loop-2 rule: A1 13's first parameter starts higher in loop 2.
  ram.setU16(slot + 0x0a, ram.u16(LOOP_WORD) !== 0 ? 3 : 1);   // $2A124A/$2A125A
  ram.setU16(slot + 0x0c, 8);                             // $2A1260
  ram.setU16(slot + 0x0e, 8);                             // $2A1266
  ram.setU16(BOSS_F2, 0);                                 // $2A126C
  a4id6Step2A1274(ram, rom, ctx, slot);                   // falls through
}

registerScript(0x2a320e, a1_10Init2A320E);
registerScript(0x2a323e, a1_10Step2A323E);
registerScript(0x2a11d4, a4id6Init2A11D4);
registerScript(0x2a1274, a4id6Step2A1274);
// A3 3..8, the six-instance ramp family. The STEP sits `$6` past its INIT in every
// one of them, which is the same `$2E`-stride regularity the bodies have.
for (const a of [0x2a14aa, 0x2a14d8, 0x2a1506, 0x2a1534, 0x2a1562, 0x2a1590]) {
  const { init, step } = a3Ramp(a);
  registerScript(a, init);
  registerScript(a + 6, step);
}
