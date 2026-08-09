// STAGE-2 BOSS A1 ATTACK LEAVES E6..E11. W187.
//
// These six routines are the complete leaf set started by F3. They do not
// start other scheduler scripts or own art. Their visible output is entirely
// existing bullet generators, while A6+$9B/$BB also rotates the A2 turret art.

import { u16, i16 } from './ram.js';
import { registerScript } from './scheduler.js';
import { AimTables, aim64FromCaller, aim256AtTarget, slew64 } from './aim.js';
import {
  drawByte242B3C, drawByte242E24, drawSigned242FDE, drawWord24328E,
} from './rng.js';
import { fire as fireBullet, WriteLog } from './bullets.js';

const LOOP = 0x813098;
const FREEZE = 0x8130d4;
const u8 = (v) => v & 0xff;

const AIM_TABLES = new WeakMap();
function aimTables(rom) {
  let tables = AIM_TABLES.get(rom);
  if (!tables) { tables = new AimTables(rom); AIM_TABLES.set(rom, tables); }
  return tables;
}

/** `subq.b #1,<ea>` fires only on borrow from an old zero. */
function due8(ram, addr) {
  const old = ram.u8(addr);
  ram.setU8(addr, old - 1);
  return old === 0;
}

function aimIgnoringCarry(ram, rom, a5, y, x, add = 0) {
  const aimed = aim64FromCaller(aimTables(rom), ram, a5, y, x);
  return (u8((aimed.carry ? x : aimed.dir) + add)) & 0x3f;
}

function shoot(ram, rom, ctx, site, entry, regs) {
  const result = fireBullet({ ram, rom, log: new WriteLog(ram) }, entry, regs);
  ctx.bulletSpawn?.(site, result);
}

function signedStep(ram, addr) { return ram.i8(addr); }

function rotate(ram, a6, heading, step) {
  ram.setU8(a6 + heading, (ram.u8(a6 + heading) + signedStep(ram, step)) & 0x3f);
}

function localOffset(rom, heading) {
  return rom.u32(0x2999b0 + (((heading + 1) & 0x3e) << 1));
}

function speedFor64(d0, angle) {
  return (d0 + (angle < 0x10 || angle > 0x30 ? 0x00080000 : 0)) >>> 0;
}

function speedFor256(d0, angle) {
  return (d0 + (angle < 0x40 || angle > 0xc0 ? 0x00080000 : 0)) >>> 0;
}

function fireKind11Pair(ram, rom, ctx, a5, a6, d0, sites) {
  const hard = ram.u16(LOOP) !== 0;
  for (let gun = 0; gun < 2; gun++) {
    const h = ram.u8(a6 + (gun === 0 ? 0x9b : 0xbb));
    const base = (h + 0x20) & 0x3f;
    const d2 = ram.u32(a6 + (gun === 0 ? 0x82 : 0xa2));
    const regs = (d1) => ({ d0, d1: d1 & 0x3f, d2, d3: 0, d4: 0, d5: 0, a5 });
    if (hard) {
      shoot(ram, rom, ctx, sites[gun][0], 0x2813f0, regs(base));
      shoot(ram, rom, ctx, sites[gun][1], 0x2813f0, regs(base - 3));
      shoot(ram, rom, ctx, sites[gun][2], 0x2813f0, regs(base + 3));
    } else {
      shoot(ram, rom, ctx, sites[gun][2], 0x2813f0, regs(base));
    }
  }
}

function slewTwo(ram, a6, a4) {
  const left = slew64(ram.u8(a6 + 0x9b), ram.u8(a4 + 0x08));
  const right = slew64(ram.u8(a6 + 0xbb), ram.u8(a4 + 0x09));
  ram.setU8(a6 + 0x9b, left);
  ram.setU8(a6 + 0xbb, right);
  return left === ram.u8(a4 + 0x08) && right === ram.u8(a4 + 0x09);
}

// ---------------------------------------------------------------------- E6

const E6_SITES = [
  [0x299f9e, 0x299fc2, 0x299fe6, 0x29a014],
  [0x29a06e, 0x29a092, 0x29a0b6, 0x29a0e4],
];

function e6Gun(ram, rom, ctx, a5, a6, gun) {
  const heading = ram.u8(a6 + (gun === 0 ? 0x9b : 0xbb));
  let angle = u8(heading + 1);
  if ((angle & 1) !== 0) return;
  angle &= 0x3e;
  const d2 = ram.u32(a6 + (gun === 0 ? 0x82 : 0xa2));
  const d3 = localOffset(rom, heading);
  const hard = ram.u16(LOOP) !== 0;
  const step = hard ? 1 : 2;
  const starts = [0xfffa0007, 0xfffb0007, 0xfffc0007, 0xfffd0007];
  angle = (angle - step) & 0x3f;
  const count = hard ? 4 : 3;
  for (let i = 0; i < count; i++) {
    shoot(ram, rom, ctx, E6_SITES[gun][i], 0x281402, {
      d0: speedFor64(starts[i], angle), d1: angle, d2, d3,
      d4: 0, d5: 0, a5,
    });
    angle = (angle + step) & 0x3f;
  }
}

function e6Step299EDA(ram, rom, ctx, a4) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  if (ram.u8(a4 + 0x02) === 0) {
    const facing = slew64(ram.u8(a6 + 0x9b), ram.u8(a4 + 0x08));
    ram.setU8(a6 + 0x9b, facing);
    ram.setU8(a6 + 0xbb, facing);
    if (facing === ram.u8(a4 + 0x08)) ram.setU8(a4 + 0x02, 1);
  }
  if (ram.u8(a4 + 0x02) !== 1 || !due8(ram, a4 + 0x06)) return;
  ram.setU8(a4 + 0x06, ram.u8(a4 + 0x07));
  if (ram.u16(FREEZE) === 0) {
    rotate(ram, a6, 0x9b, a4 + 0x0a);
    rotate(ram, a6, 0xbb, a4 + 0x0b);
    e6Gun(ram, rom, ctx, a5, a6, 0);
    e6Gun(ram, rom, ctx, a5, a6, 1);
  }
  const left = u16(ram.u16(a4 + 0x04) - 1);
  ram.setU16(a4 + 0x04, left);
  if (left === 0) ram.setU16(a4, 0);
}

function e6Init299E90(ram, rom, ctx, a4) {
  ram.setU8(a4 + 0x02, 0);
  ram.setU8(a4 + 0x0a, drawSigned242FDE(ram, rom) === 0 ? 0xff : 1);
  ram.setU8(a4 + 0x0b, drawSigned242FDE(ram, rom) === 0 ? 0xff : 1);
  ram.setU16(a4 + 0x06, 0x1000);
  let target;
  do target = drawByte242B3C(ram, rom); while (target === 0);
  ram.setU8(a4 + 0x08, u8(0x20 + target * 2));
  e6Step299EDA(ram, rom, ctx, a4);
}

// ---------------------------------------------------------------------- E7

const E7_KIND11_SITES = [
  [0x29a1da, 0x29a1e2, 0x29a1ea], [0x29a212, 0x29a21a, 0x29a222],
];
const E7_FAN_SITES = [
  [0x29a2b2, 0x29a2e6, 0x29a31a, 0x29a350, 0x29a384],
  [0x29a3e0, 0x29a414, 0x29a448, 0x29a47e, 0x29a4b2],
];

function e7Gun(ram, rom, ctx, a5, a6, gun) {
  const heading = ram.u8(a6 + (gun === 0 ? 0x9b : 0xbb));
  let base = u8(heading + 1);
  if ((base & 1) !== 0) return;
  base &= 0x3e;
  const local = localOffset(rom, heading);
  const d2 = ram.u32(a6 + (gun === 0 ? 0x82 : 0xa2));
  const angles = [base, base + 6, base + 12, base - 6, base - 12];
  for (let i = 0; i < angles.length; i++) {
    const angle = angles[i] & 0x3f;
    const d3 = (rom.u32(0x2735fa + angle * 4) + local) >>> 0;
    shoot(ram, rom, ctx, E7_FAN_SITES[gun][i], 0x281450, {
      d0: speedFor64(0xfff90007, angle), d1: angle, d2, d3,
      d4: 0, d5: 0, a5,
    });
  }
}

function e7Step29A146(ram, rom, ctx, a4) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  if (ram.u8(a4 + 0x02) === 0 && slewTwo(ram, a6, a4)) ram.setU8(a4 + 0x02, 1);
  if (ram.u8(a4 + 0x02) !== 1) return;
  if (due8(ram, a4 + 0x0c)) {
    ram.setU8(a4 + 0x0c, ram.u8(a4 + 0x0d));
    if (ram.u16(FREEZE) === 0)
      fireKind11Pair(ram, rom, ctx, a5, a6, 0x0004000b, E7_KIND11_SITES);
  }
  if (!due8(ram, a4 + 0x06)) return;
  ram.setU8(a4 + 0x06, ram.u8(a4 + 0x07));
  if (ram.u16(FREEZE) === 0) {
    rotate(ram, a6, 0x9b, a4 + 0x0a);
    rotate(ram, a6, 0xbb, a4 + 0x0b);
    e7Gun(ram, rom, ctx, a5, a6, 0);
    e7Gun(ram, rom, ctx, a5, a6, 1);
  }
  const left = u16(ram.u16(a4 + 0x04) - 1);
  ram.setU16(a4 + 0x04, left);
  if (left === 0) ram.setU16(a4, 0);
}

function e7Init29A0F6(ram, rom, ctx, a4) {
  ram.setU8(a4 + 0x02, 0);
  ram.setU16(a4 + 0x06, 0x1002);
  ram.setU16(a4 + 0x0c, 0x2018);
  ram.setU8(a4 + 0x0a, drawSigned242FDE(ram, rom) === 0 ? 0xff : 1);
  ram.setU8(a4 + 0x0b, drawSigned242FDE(ram, rom) === 0 ? 0xff : 1);
  ram.setU8(a4 + 0x08, drawByte242E24(ram, rom));
  ram.setU8(a4 + 0x09, drawByte242E24(ram, rom));
  e7Step29A146(ram, rom, ctx, a4);
}

// ---------------------------------------------------------------------- E8

const E8_KIND11_SITES = [
  [0x29a5bc, 0x29a5c4, 0x29a5cc], [0x29a5f4, 0x29a5fc, 0x29a604],
];
const E8_FAN_SITES = [
  [0x29a694, 0x29a6c2, 0x29a6f0, 0x29a728, 0x29a756],
  [0x29a7b2, 0x29a7e0, 0x29a80e, 0x29a846, 0x29a874],
];

function e8Gun(ram, rom, ctx, a5, a6, gun) {
  const heading = ram.u8(a6 + (gun === 0 ? 0x9b : 0xbb));
  let base64 = u8(heading + 1);
  if ((base64 & 1) !== 0) return;
  base64 &= 0x3e;
  const base = (base64 * 4) & 0xff;
  const local = localOffset(rom, heading);
  const d2 = ram.u32(a6 + (gun === 0 ? 0x82 : 0xa2));
  const angles = [base - 2, base, base + 2, base + 3, base - 3];
  const count = ram.u16(LOOP) !== 0 ? 5 : 3;
  for (let i = 0; i < count; i++) {
    const angle = angles[i] & 0xff;
    const d3 = (rom.u32(0x2735fa + ((angle + 2) & 0xfc)) + local) >>> 0;
    shoot(ram, rom, ctx, E8_FAN_SITES[gun][i],
      i < 3 ? 0x281708 : 0x2816f6, {
        d0: speedFor256(0xfffe0007, angle), d1: angle, d2, d3,
        d4: 0, d5: 0, a5,
      });
  }
}

function e8Step29A528(ram, rom, ctx, a4) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  if (ram.u8(a4 + 0x02) === 0 && slewTwo(ram, a6, a4)) ram.setU8(a4 + 0x02, 1);
  if (ram.u8(a4 + 0x02) !== 1) return;
  if (due8(ram, a4 + 0x0c)) {
    ram.setU8(a4 + 0x0c, ram.u8(a4 + 0x0d));
    if (ram.u16(FREEZE) === 0)
      fireKind11Pair(ram, rom, ctx, a5, a6, 0x0004000b, E8_KIND11_SITES);
  }
  if (!due8(ram, a4 + 0x06)) return;
  ram.setU8(a4 + 0x06, ram.u8(a4 + 0x07));
  if (ram.u16(FREEZE) === 0) {
    rotate(ram, a6, 0x9b, a4 + 0x0a);
    rotate(ram, a6, 0xbb, a4 + 0x0b);
    e8Gun(ram, rom, ctx, a5, a6, 0);
    e8Gun(ram, rom, ctx, a5, a6, 1);
  }
  const left = u16(ram.u16(a4 + 0x04) - 1);
  ram.setU16(a4 + 0x04, left);
  if (left === 0) ram.setU16(a4, 0);
}

function e8Init29A4C4(ram, rom, ctx, a4) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  ram.setU8(a4 + 0x02, 0);
  ram.setU16(a4 + 0x06, 0x1000);
  ram.setU16(a4 + 0x0c, 0x2010);
  ram.setU8(a4 + 0x08, aimIgnoringCarry(ram, rom, a5,
    ram.u16(a6 + 0x82), ram.u16(a6 + 0x84)));
  ram.setU8(a4 + 0x09, aimIgnoringCarry(ram, rom, a5,
    ram.u16(a6 + 0xa2), ram.u16(a6 + 0xa4)));
  ram.setU8(a4 + 0x0a, drawSigned242FDE(ram, rom) === 0 ? 0xff : 1);
  ram.setU8(a4 + 0x0b, drawSigned242FDE(ram, rom) === 0 ? 0xff : 1);
  e8Step29A528(ram, rom, ctx, a4);
}

// ---------------------------------------------------------------------- E9

const E9_SIMPLE_SITES = [0x29a97c, 0x29a99a];
const E9_FAN_SITES = [[0x29aa2e, 0x29aa7c], [0x29aae6, 0x29ab34]];

function e9SpeedFan(ram, rom, ctx, a5, a6, gun) {
  const heading = ram.u8(a6 + (gun === 0 ? 0x9b : 0xbb));
  let angle = u8(heading + 1);
  if ((angle & 1) !== 0) return;
  angle &= 0x3e;
  const local = localOffset(rom, heading);
  const d2 = ram.u32(a6 + (gun === 0 ? 0x82 : 0xa2));
  const volley = (d1, site) => {
    const inside = d1 >= 0x10 && d1 <= 0x30;
    let d0 = inside ? 0xfffc0007 : 0x00170007;
    const count = inside ? 4 : 2;
    const d3 = (rom.u32(0x2735fa + d1 * 4) + local) >>> 0;
    for (let i = 0; i < count; i++) {
      shoot(ram, rom, ctx, site, 0x281402,
        { d0, d1, d2, d3, d4: 0, d5: 0, a5 });
      d0 = (d0 + 0x00020000) >>> 0;
    }
  };
  volley(angle, E9_FAN_SITES[gun][0]);
  if (ram.u16(LOOP) !== 0) volley((angle + 0x0c) & 0x3f, E9_FAN_SITES[gun][1]);
}

function e9Step29A8F2(ram, rom, ctx, a4) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  if (ram.u8(a4 + 0x02) === 0 && slewTwo(ram, a6, a4)) ram.setU8(a4 + 0x02, 1);
  if (ram.u8(a4 + 0x02) !== 1) return;
  if (due8(ram, a4 + 0x0c)) {
    ram.setU8(a4 + 0x0c, ram.u8(a4 + 0x0d));
    if (ram.u16(FREEZE) === 0) {
      for (let gun = 0; gun < 2; gun++) {
        const d1 = (ram.u8(a6 + (gun === 0 ? 0x9b : 0xbb)) + 0x20) & 0x3f;
        const d2 = ram.u32(a6 + (gun === 0 ? 0x82 : 0xa2));
        shoot(ram, rom, ctx, E9_SIMPLE_SITES[gun], 0x2813f0,
          { d0: 0x0007000b, d1, d2, d3: 0, d4: 0, d5: 0, a5 });
      }
    }
  }
  if (!due8(ram, a4 + 0x06)) return;
  ram.setU8(a4 + 0x06, ram.u8(a4 + 0x07));
  rotate(ram, a6, 0x9b, a4 + 0x0a);
  rotate(ram, a6, 0xbb, a4 + 0x0b);
  if (ram.u16(FREEZE) === 0) {
    e9SpeedFan(ram, rom, ctx, a5, a6, 0);
    e9SpeedFan(ram, rom, ctx, a5, a6, 1);
  }
  const left = u16(ram.u16(a4 + 0x04) - 1);
  ram.setU16(a4 + 0x04, left);
  if (left === 0) ram.setU16(a4, 0);
}

function e9Init29A886(ram, rom, ctx, a4) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  ram.setU8(a4 + 0x02, 0);
  ram.setU16(a4 + 0x06, 0x6400);
  ram.setU16(a4 + 0x0c, 0x3802);
  ram.setU8(a4 + 0x08, aimIgnoringCarry(ram, rom, a5,
    ram.u16(a6 + 0x82), ram.u16(a6 + 0x84), 0x20));
  ram.setU8(a4 + 0x09, aimIgnoringCarry(ram, rom, a5,
    ram.u16(a6 + 0xa2), ram.u16(a6 + 0xa4), 0x20));
  ram.setU8(a4 + 0x0a, drawSigned242FDE(ram, rom) === 0 ? 0xff : 1);
  ram.setU8(a4 + 0x0b, drawSigned242FDE(ram, rom) === 0 ? 0xff : 1);
  e9Step29A8F2(ram, rom, ctx, a4);
}

// --------------------------------------------------------------------- E10

const E10_SITES = {
  left: {
    center: [0x29ac1e, 0x29ac40, 0x29ac56],
    positive: [0x29ac72, 0x29ac98], negative: [0x29acc2, 0x29ace8],
  },
  right: {
    center: [0x29ad42, 0x29ad64, 0x29ad7a],
    positive: [0x29ad96, 0x29adbc], negative: [0x29ade6, 0x29ae0c],
  },
};

function e10Shot(ram, rom, ctx, a5, d0, d1, d2, local, site) {
  const angle = d1 & 0xff;
  const d3 = (rom.u32(0x2734fa + ((angle + 2) & 0xfc)) + local) >>> 0;
  shoot(ram, rom, ctx, site, 0x2816f6,
    { d0: d0 >>> 0, d1: angle, d2, d3, d4: 0, d5: 0, a5 });
}

function e10Volley(ram, rom, ctx, a4, a5, a6, fireLeft) {
  const heading = ram.u8(a6 + (fireLeft ? 0x5b : 0x7b));
  const base = (heading * 4) & 0xff;
  const d2 = ram.u32(a6 + (fireLeft ? 0x42 : 0x62));
  const local = rom.u32(0x27327a + (((heading + 1) & 0x3e) << 1));
  const d0 = ((ram.u16(a4 + 0x0c) << 16) | 7) >>> 0;
  const sites = fireLeft ? E10_SITES.left : E10_SITES.right;
  const hard = ram.u16(LOOP) !== 0;
  e10Shot(ram, rom, ctx, a5, d0, base, d2, local, sites.center[0]);
  if (hard) {
    e10Shot(ram, rom, ctx, a5, d0, base - 2, d2, local, sites.center[1]);
    e10Shot(ram, rom, ctx, a5, d0, base + 2, d2, local, sites.center[2]);
  }
  const rays = ram.u16(a4 + 0x12) + 1;
  const spread = ram.u8(a4 + 0x14);
  for (let ray = 1; ray <= rays; ray++) {
    const angle = base + spread * ray;
    e10Shot(ram, rom, ctx, a5, d0, angle, d2, local, sites.positive[0]);
    if (hard) e10Shot(ram, rom, ctx, a5, d0 - 0x00040000,
      angle - 4, d2, local, sites.positive[1]);
  }
  for (let ray = 1; ray <= rays; ray++) {
    const angle = base - spread * ray;
    e10Shot(ram, rom, ctx, a5, d0, angle, d2, local, sites.negative[0]);
    if (hard) e10Shot(ram, rom, ctx, a5, d0 - 0x00040000,
      angle + 4, d2, local, sites.negative[1]);
  }
}

function e10Step29AB7E(ram, rom, ctx, a4) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  const negative = i16(ram.u16(a4 + 0x0e)) < 0;
  const aimPart = negative ? 0x42 : 0x62;
  const aimHeading = negative ? 0x5b : 0x7b;
  const wanted = aimIgnoringCarry(ram, rom, a5,
    ram.u16(a6 + aimPart), ram.u16(a6 + aimPart + 2));
  ram.setU8(a6 + aimHeading, slew64(ram.u8(a6 + aimHeading), wanted));
  if (!due8(ram, a4 + 0x06)) return;
  ram.setU8(a4 + 0x06, ram.u8(a4 + 0x07));
  ram.bchg8(a5 + 0x03, 0);
  e10Volley(ram, rom, ctx, a4, a5, a6, !negative);
  ram.setU8(a4 + 0x14, ram.u8(a4 + 0x14) + 0x0a);
  const oldVolleys = ram.u8(a4 + 0x10);
  ram.setU8(a4 + 0x10, oldVolleys - 1);
  if (oldVolleys !== 1) return;
  ram.setU8(a4 + 0x10, ram.u8(a4 + 0x11));
  ram.setU8(a4 + 0x14, ram.u8(a4 + 0x15));
  ram.setU16(a4 + 0x0e, u16(-i16(ram.u16(a4 + 0x0e))));
  const groups = u16(ram.u16(a4 + 0x04) - 1);
  ram.setU16(a4 + 0x04, groups);
  if (groups === 0) ram.setU16(a4, 0);
}

function e10Init29AB50(ram, rom, ctx, a4) {
  ram.setU8(a4 + 0x02, 0);
  ram.setU16(a4 + 0x06, 0x1004);
  ram.setU16(a4 + 0x0c, 0xfffe);
  ram.setU16(a4 + 0x0e, 1);
  ram.setU16(a4 + 0x10, 0x0606);
  ram.setU16(a4 + 0x12, 0);
  ram.setU16(a4 + 0x14, 0x0c0c);
  e10Step29AB7E(ram, rom, ctx, a4);
}

// --------------------------------------------------------------------- E11

const E11_SITES = [
  [0x29aec4, 0x29aecc, 0x29aed4], [0x29af00, 0x29af08, 0x29af10],
];

function e11Step29AE4C(ram, rom, ctx, a4) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  for (let gun = 0; gun < 2; gun++) {
    const part = gun === 0 ? 0x82 : 0xa2;
    const heading = gun === 0 ? 0x9b : 0xbb;
    const wanted = aimIgnoringCarry(ram, rom, a5,
      ram.u16(a6 + part), ram.u16(a6 + part + 2), 0x20);
    ram.setU8(a6 + heading, slew64(ram.u8(a6 + heading), wanted));
  }
  if (!due8(ram, a4 + 0x0c)) return;
  ram.setU8(a4 + 0x0c, ram.u8(a4 + 0x0d));
  fireKind11Pair(ram, rom, ctx, a5, a6, 0x0003000b, E11_SITES);
  ram.setU16(a4, 0);
}

function e11Init29AE48(ram, rom, ctx, a4) {
  ram.setU8(a4 + 0x02, 0);
  e11Step29AE4C(ram, rom, ctx, a4);
}

// ---------------------------------------------------------------------- E1

function e1Shot(ram, rom, ctx, a5, angle, d2, d5, site, entry) {
  const d1 = u8(angle);
  const d3 = (rom.u32(0x2734fa + ((d1 & 0x3f) << 2)) + d5) >>> 0;
  shoot(ram, rom, ctx, site, entry,
    { d0: 0x00050013, d1, d2, d3, d4: 0, d5, a5 });
}

function e1Step299B74(ram, rom, ctx, a4) {
  if (!due8(ram, a4 + 0x02)) return;
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));
  const direction = ram.i8(a4 + 0x08);
  const jitter = (ram.i8(a4 + 0x09) + direction) << 24 >> 24;
  ram.setU8(a4 + 0x09, jitter);
  if ((direction < 0 && jitter <= 0) || (direction >= 0 && jitter >= 0))
    ram.setU8(a4 + 0x08, -direction);

  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  const aimed = aim64FromCaller(aimTables(rom), ram, a5,
    u16(ram.u16(a6 + 0x02) + 0x0800), ram.u16(a6 + 0x04));
  if (!aimed.carry) {
    const base = u8(aimed.dir * 4 + ram.u8(a4 + 0x09)
      + drawByte242B3C(ram, rom));
    const d2 = ram.u32(a6 + 0x02);
    const d5 = ram.i8(a4 + 0x04) < 0 ? 0x07ffff00 : 0x08000100;
    e1Shot(ram, rom, ctx, a5, base, d2, d5, 0x299c0e, 0x2816f6);
    e1Shot(ram, rom, ctx, a5, base + 0x0c, d2, d5, 0x299c28, 0x2816f6);
    e1Shot(ram, rom, ctx, a5, base - 0x0c, d2, d5, 0x299c42, 0x2816f6);
    if (ram.u16(LOOP) !== 0) {
      e1Shot(ram, rom, ctx, a5, base - 0x14, d2, d5, 0x299c64, 0x281708);
      e1Shot(ram, rom, ctx, a5, base - 0x04, d2, d5, 0x299c7e, 0x281708);
    }
  }
  const left = u16(ram.u16(a4 + 0x06) - 1);
  ram.setU16(a4 + 0x06, left);
  if (left === 0) ram.setU16(a4, 0);
}

function e1Init299B54(ram, rom, ctx, a4) {
  ram.setU16(a4 + 0x02, 5);
  ram.setU8(a4 + 0x09, 0);
  ram.setU8(a4 + 0x08, drawSigned242FDE(ram, rom) === 0 ? 0xff : 1);
  e1Step299B74(ram, rom, ctx, a4);
}

// --------------------------------------------------------------------- E13

function e13Step29B024(ram, rom, ctx, a4) {
  if (!due8(ram, a4 + 0x04)) return;
  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  const speed = ram.u16(LOOP) === 0 ? 0xfffe : 0x000a;
  const offsets = [0xf9c0f080, 0xf9c0f400, 0xf9c00bc0, 0xf9c00f00];
  const sites = [0x29b052, 0x29b05e, 0x29b06a, 0x29b076];
  for (let i = 0; i < offsets.length; i++) {
    shoot(ram, rom, ctx, sites[i], 0x2813f0, {
      d0: ((speed << 16) | 7) >>> 0, d1: 0x20,
      d2: (ram.u32(a6 + 0x02) + offsets[i]) >>> 0,
      d3: 0, d4: 0, d5: 0, a5,
    });
  }
  const left = u16(ram.u16(a4 + 0x06) - 1);
  ram.setU16(a4 + 0x06, left);
  if (left === 0) ram.setU16(a4, 0);
}

function e13Init29B00A(ram, rom, ctx, a4) {
  ram.setU8(a4 + 0x02, 0);
  ram.setU16(a4 + 0x04, 4);
  e13Step29B024(ram, rom, ctx, a4);
}

// --------------------------------------------------------------------- E14

function e14Shot(ram, rom, ctx, a5, d0, angle, d2, site) {
  const d1 = u8(angle);
  const d3 = (rom.u32(0x2735fa + ((d1 + 2) & 0xfc)) + 0x08000000) >>> 0;
  shoot(ram, rom, ctx, site, 0x281708,
    { d0: d0 >>> 0, d1, d2, d3, d4: 0, d5: 0x08000000, a5 });
}

function e14Fan29B108(ram, rom, ctx, a4, a5, a6) {
  const d0 = ((ram.u16(a4 + 0x08) << 16) | ram.u16(a4 + 0x16)) >>> 0;
  const base = ram.u8(a4 + 0x12);
  const d2 = ram.u32(a6 + 0x02);
  e14Shot(ram, rom, ctx, a5, d0, base, d2, 0x29b132);
  const count = ram.u16(a4 + 0x16) === 4 ? 3 : 10;
  const spacing = ram.u8(a4 + 0x06);
  for (let i = 1; i <= count; i++) {
    const angle = u8(base + spacing * i);
    e14Shot(ram, rom, ctx, a5, d0, angle, d2, 0x29b160);
    if (ram.u16(LOOP) !== 0)
      e14Shot(ram, rom, ctx, a5, d0 - 0x00030000, angle - 2, d2, 0x29b178);
  }
  for (let i = 1; i <= count; i++) {
    const angle = u8(base - spacing * i);
    e14Shot(ram, rom, ctx, a5, d0, angle, d2, 0x29b1b2);
    if (ram.u16(LOOP) !== 0)
      e14Shot(ram, rom, ctx, a5, d0 - 0x00030000, angle + 2, d2, 0x29b1ca);
  }
}

function e14Step29B0D0(ram, rom, ctx, a4) {
  if (!due8(ram, a4 + 0x10)) return;
  ram.setU8(a4 + 0x10, ram.u8(a4 + 0x11));
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  e14Fan29B108(ram, rom, ctx, a4, a5, a6);
  ram.setU16(a4 + 0x08, u16(ram.u16(a4 + 0x08) + 0x0a));
  ram.setU8(a4 + 0x06, ram.u8(a4 + 0x06) + 2);
  ram.setU16(a4 + 0x16, ram.u16(a4 + 0x18));
  const left = u16(ram.u16(a4 + 0x14) - 1);
  ram.setU16(a4 + 0x14, left);
  if (left === 0) ram.setU16(a4, 0);
}

function e14Init29B0A6(ram, rom, ctx, a4) {
  ram.bchg8(ctx.bossRec + 0x03, 0);
  ram.setU8(a4 + 0x02, 0);
  ram.setU16(a4 + 0x10, 8);
  ram.setU16(a4 + 0x14, 2);
  ram.setU8(a4 + 0x12, 0x80);
  const aimed = aim256AtTarget(aimTables(rom), ram, ctx.bossRec, ctx.bossSubRec);
  if (!aimed.carry) ram.setU8(a4 + 0x12, aimed.dir);
  e14Step29B0D0(ram, rom, ctx, a4);
}

// --------------------------------------------------------------------- E15

function e15Step29B6F0(ram, rom, ctx, a4) {
  if (!due8(ram, a4 + 0x04)) return;
  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));

  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  const lowHp = ((ram.u32(a5 + 0x16) << 0) <= 0x00002a00);
  const boost = lowHp ? 3 : 0;
  const iterations = lowHp && ram.u16(0x80390c) === 0 ? 2 : 1;
  for (let i = 0; i < iterations; i++) {
    const aimed = aim256AtTarget(aimTables(rom), ram, a5, a6);
    if (aimed.carry) return;

    const jitterY = i16(drawWord24328E(ram, rom)) >> 3;
    const jitterX = i16(drawWord24328E(ram, rom)) >> 3;
    const d3 = ((u16(jitterY) << 16) | u16(jitterX)) >>> 0;
    const r0 = (drawByte242B3C(ram, rom) << 24) >> 24;
    const angle = u8(aimed.dir + 5 * r0);
    const r1 = (drawByte242B3C(ram, rom) << 24) >> 24;
    const magnitude = Math.abs(r0);
    const speed = (r1 >> 1) - 6 + (magnitude > 1 ? magnitude : 0) + boost;
    const d0 = ((u16(speed) << 16) | 0x0016) >>> 0;
    const entry = ram.bchg8(a4 + 0x06, 0) === 0 ? 0x281744 : 0x281776;
    shoot(ram, rom, ctx, entry === 0x281744 ? 0x29b78a : 0x29b794, entry, {
      d0, d1: angle, d2: (ram.u32(a6 + 0x02) + 0x06000000) >>> 0,
      d3, d4: 0, d5: magnitude, a5,
    });
  }
}

/** `$29B6D6`, E15 INIT. The ROM falls straight into STEP. */
function e15Init29B6D6(ram, rom, ctx, a4) {
  ram.bchg8(ctx.bossRec + 0x03, 0);
  ram.setU8(a4 + 0x02, 0);
  ram.setU16(a4 + 0x04, 0);
  ram.setU16(a4 + 0x06, 0);
  ram.setU16(0x803934, 1);
  ram.setU16(0x803936, 0);
  e15Step29B6F0(ram, rom, ctx, a4);
}

registerScript(0x299e90, e6Init299E90);
registerScript(0x299eda, e6Step299EDA);
registerScript(0x29a0f6, e7Init29A0F6);
registerScript(0x29a146, e7Step29A146);
registerScript(0x29a4c4, e8Init29A4C4);
registerScript(0x29a528, e8Step29A528);
registerScript(0x29a886, e9Init29A886);
registerScript(0x29a8f2, e9Step29A8F2);
registerScript(0x29ab50, e10Init29AB50);
registerScript(0x29ab7e, e10Step29AB7E);
registerScript(0x29ae48, e11Init29AE48);
registerScript(0x29ae4c, e11Step29AE4C);
registerScript(0x299b54, e1Init299B54);
registerScript(0x299b74, e1Step299B74);
registerScript(0x29b00a, e13Init29B00A);
registerScript(0x29b024, e13Step29B024);
registerScript(0x29b0a6, e14Init29B0A6);
registerScript(0x29b0d0, e14Step29B0D0);
registerScript(0x29b6d6, e15Init29B6D6);
registerScript(0x29b6f0, e15Step29B6F0);
