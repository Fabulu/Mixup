// Stage-4 Type $40 boss entry and arrival bootstrap.
//
// This slice owns the spawn wrapper, the live no-hit/damage controller, F0,
// MAIN0/MAIN1, D9/D10, the first seven visible A2 objects, A4/F3, and its
// mirrored A1/E1 and E2 attack families, the F4/E3/E5 bridge which closes the
// normal first-phase loop, and the damage-driven F1 destruction transition.
// The next live frontier is F5, which MAIN3 starts when that transition lands.

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
  a3Start259962, a1Start259A18, a1Running259A4A, a1Stop259B08,
  seqStop2598BE,
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

export function main4Step29F8F0(ram, rom, ctx, slot) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  const cursor = ram.u16(slot + 0x06);                    // $29F8F6 adda.w $6(a4)
  const wp = MAIN4_WAYPOINTS + cursor;
  const d2 = rom.u16(wp), d3 = rom.u16(wp + 2);           // $29F8FA movem.w (a0)

  // $29F8FE..$29F908 -- the boss's own position plus the two part offsets F5 is
  // driving, which is what makes the walk track the opened pods.
  const selfY = u16(ram.u16(a6 + 0x02) + ram.u16(a6 + 0x194));
  const selfX = u16(ram.u16(a6 + 0x04) + ram.u16(a6 + 0x196));

  aim64(aimTables(rom), selfY, selfX, d2, d3);            // $29F90C jsr $24203E
  ram.setU8(a6 + 0x3b, slew64(ram.u8(a6 + 0x3b),          // $29F912..$29F91C
    aim64(aimTables(rom), selfY, selfX, d2, d3)));

  // $29F920..$29F94E -- the SAME waypoint again, this time for the distance test:
  // within $400 and the cursor advances, masked to four entries.
  if (i16(dist242494(selfY, selfX, d2, d3)) <= 0x400) {   // $29F942 cmpi.w #$400/bgt
    ram.setU16(slot + 0x06, u16(cursor + 4) & 0x000f);    // $29F94A/$29F94E
  }

  // $29F954..$29F96E -- speed from ($3a,A6), heading from ($3b,A6), and the vector
  // goes into the part offsets rather than the position: F5 opened the pods and MAIN4
  // moves them.
  const v = ctx.tables.vector(ram.u8(a6 + 0x3a), ram.u8(a6 + 0x3b));
  ram.setU16(a6 + 0x194, u16(ram.u16(a6 + 0x194) + v.dy));  // $29F966
  ram.setU16(a6 + 0x196, u16(ram.u16(a6 + 0x196) + v.dx));  // $29F96A
  placeBoss4Parts29F50E(ram, ctx, slot);                  // $29F96E bra $29F50E
  void a5;
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
