// Stage-3 boss type $A0 entry, damage controller, and arrival bootstrap (W204).
// Physical family envelope: $29BBF4..$29EC7A. This delivery owns the exact
// entry/controller and the first live scheduler closure through MAIN0, D7 and
// A2 object 9. Later boss phases stay loud until their own translated slices.

import { u16, i16, i32 } from './ram.js';
import { freeEnemy } from './initbody.js';
import { scoreHit } from './score.js';
import {
  livePlayers2428A6, bigBurst28B34A, clamp253564, bossClear242922,
} from './boss.js';
import { finalBlast2440E0 } from './boss2.js';
import { applyVelocity } from './movement.js';
import {
  AimTables, aim64, aim256, aim256FromCaller, slew64, targetSelect,
} from './aim.js';
import {
  drawByte242B3C, drawByte242E24, drawNegative242EC2, drawSigned242FDE,
  drawWord242EC2, drawLong243A9C, drawWord24328E,
} from './rng.js';
import { fire as fireBullet, WriteLog } from './bullets.js';
import { spawnEffect } from './effects.js';
import { loadAnimObjects246410, loadAnimObjects246520 } from './animobjects.js';
import { enqueueDeferred, DEFQ_D1 } from './spawn.js';
import { enqueueRegistersThroughStub, enqueueThroughStub } from './spritequeue.js';
import { runStageAdvance242952 } from './stageend.js';
import {
  runScheduler25962E, registerScript, seqStart2598D0, a3Start259962,
  a3StartSlot259962,
  a3Running2599B4, a3Stop2599EC, a4Start25980C, a4Clear2598A2,
  a4Stop259876, a1Clear259B34, a2Run2598E6, a2Stop25994A,
  a1Start259A18, a1Running259A4A, a1Stop259B08, spread2595F2,
  a2StopAll259924, fadeArm259B7E, fadeDone259B9E, suspend2595E8,
} from './scheduler.js';

const note = (ctx, addr, what) => (ctx.unportedLog ?? ctx.unported)?.note(addr, what);
const due8 = (ram, addr) => {
  const old = ram.u8(addr);
  ram.setU8(addr, old - 1);
  return old === 0;
};

const AIM_TABLES = new WeakMap();
function aimTables(rom) {
  let tables = AIM_TABLES.get(rom);
  if (!tables) { tables = new AimTables(rom); AIM_TABLES.set(rom, tables); }
  return tables;
}

function shoot(ram, rom, ctx, site, entry, regs) {
  const result = fireBullet({ ram, rom, log: new WriteLog(ram) }, entry, regs);
  ctx.bulletSpawn?.(site, result);
}

function placeBoss3Parts29C300(ram, a6) {
  const y = ram.u16(a6 + 0x02), x = ram.u16(a6 + 0x04);
  ram.setU16(a6 + 0x22, u16(y + 0xf800 + ram.u16(a6 + 0x26)));
  ram.setU16(a6 + 0x24, u16(x + 0xf400 + ram.u16(a6 + 0x28)));
  ram.setU16(a6 + 0x42, u16(y + 0xf800 + ram.u16(a6 + 0x46)));
  ram.setU16(a6 + 0x44, u16(x + 0x0c00 + ram.u16(a6 + 0x48)));
  ram.setU32(a6 + 0xc2, ram.u32(a6 + 0x22));
  ram.setU32(a6 + 0xe2, ram.u32(a6 + 0x42));
}

function boss3Death29CA96(ram, a5, a6, ctx) {
  ram.setU8(0x8130f8, ram.u8(0x8130f8) | 0xc0);
  note(ctx, 0x23c4d0, '$29CAA6 stage-3 boss death pause/flag block');
  clamp253564(ram);                 // $29CAAC jsr $253564 (UNCONDITIONAL)
  bossClear242922(ram, ctx);        // $29CAB2 jsr $242922 (UNCONDITIONAL)
  ram.setU16(a6 + 0x86, 1);
  a1Clear259B34(ram);
  a4Clear2598A2(ram);
  a3Stop2599EC(ram, 2);
  a3Stop2599EC(ram, 3);
  ram.setU16(a6 + 0xb6, 1);
  ram.setU16(a6 + 0xb8, 1);
  ram.setU32(a5 + 0x16, 0xffffffff);
  ram.setU8(a6 + 0x1f, 1);
  for (const off of [0x00, 0x20, 0x40, 0xc0, 0xe0]) ram.setU16(a6 + off, 0x8000);
  ram.setU8(a6 + 0x66, 0x10);
  ram.setU8(a6 + 0x67, 0x11);
  ram.setU8(a6 + 0x68, 0x12);
  a4Start25980C(ram, 1);
  ctx.bossEvent?.('death', ram.u16(0x8130ce));
}

/** `$29C912`, the Stage-3 boss linked-hitbox controller and timeout. */
export function boss3Damage29C912(ram, rom, a5, a6, ctx) {
  if (ram.u16(a6 + 0x86) !== 0) return;
  const hit = [0x00, 0x20, 0x40, 0xc0, 0xe0]
    .reduce((v, off) => v | ram.u8(a6 + off), 0) & 0x5c;
  if (hit === 0) {
    ram.setU8(a6 + 0x66, 0x10);
    ram.setU8(a6 + 0x67, 0x11);
    ram.setU8(a6 + 0x68, 0x12);
    if (ram.u32(a5 + 0x16) < 0x8c00 && ram.u16(0x8130ca) === 0)
      for (const off of [0x66, 0x67, 0x68]) ram.setU8(a6 + off, 0x19);
  } else {
    for (const off of [0x00, 0x20, 0x40, 0xc0, 0xe0])
      ram.setU8(a6 + off, ram.u8(a6 + off) & 0xa3);
    ram.setU16(a6 + 0x8a, hit);
    scoreHit(ram, ctx, a6, hit);
    const bases = [[0x66, 0x10, 0x0f], [0x67, 0x11, 0x0e], [0x68, 0x12, 0x0d]];
    for (const [off, base, mask] of bases) {
      const current = ram.u8(a6 + off) === 0x19 ? base : ram.u8(a6 + off);
      ram.setU8(a6 + off, current ^ mask);
    }
    let minimum = ram.u16(a6 + 0x18);
    for (const off of [0x38, 0x58, 0xd8, 0xf8])
      if ((ram.u16(a6 + off) << 16 >> 16) < (minimum << 16 >> 16)) minimum = ram.u16(a6 + off);
    for (const off of [0x18, 0x38, 0x58, 0xd8, 0xf8]) ram.setU16(a6 + off, 0x7fff);
    const damage = u16(0x7fff - minimum);
    if (ram.u16(a6 + 0x88) === 0)
      ram.setU32(a5 + 0x16, (ram.u32(a5 + 0x16) - damage) >>> 0);
    if (i32(ram.u32(a5 + 0x16)) < 0) {
      if (livePlayers2428A6(ram) === 0) ram.setU32(a5 + 0x16, 0x200);
      else {
        ram.setU32(0x81b61a, 0x00050000);
        boss3Death29CA96(ram, a5, a6, ctx);
        return;
      }
    }
  }

  if (ram.u8(a6 + 0x8c) === 0
      && i32((ram.u32(a5 + 0x16) - 0x00011800) >>> 0) < 0) {
    a1Clear259B34(ram);
    a4Clear2598A2(ram);
    a4Start25980C(ram, 9);
    ram.setU16(a6 + 0x88, 1);
    ram.setU8(a6 + 0xae, 1);
    ram.setU8(a6 + 0x8c, 1);
    ram.setU16(0x81b414, 1);
    ram.setU16(0x81b416, 1);
    ram.setU16(0x81b418, 1);
    note(ctx, 0x243dd0, '$29CA88 stage-3 boss phase-transition palette hook');
  }

  if (ram.u16(0x8130d2) !== 0) return;
  const timeout = u16(ram.u16(a5 + 0x1a) - 1);
  ram.setU16(a5 + 0x1a, timeout);
  if (timeout !== 0) return;
  if (livePlayers2428A6(ram) === 0) ram.setU16(a5 + 0x1a, 0x78);
  else {
    ram.setU16(a6 + 0x8a, 0);
    boss3Death29CA96(ram, a5, a6, ctx);
  }
  void rom;
}

export function handlerBoss29BE28(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  ctx.bossSubRec = a6;
  ctx.bossRec = a5;
  boss3Damage29C912(ram, rom, a5, a6, ctx);
  if (!runScheduler25962E(ram, rom, ctx)) return;
  runStageAdvance242952(ram, rom, ctx);
  freeEnemy(ram, a5);
}

function f0Init29CC20(ram, _rom, _ctx, a4) {
  seqStart2598D0(ram, 0);
  a3Start259962(ram, 7);
  ram.setU16(a4, 0);                                  // fall-through $29CC30
}
function f0Step29CC30(ram, _rom, _ctx, a4) { ram.setU16(a4, 0); }

function main0Step29C366(ram, _rom, ctx, slot) {
  const a6 = ctx.bossSubRec;
  if (due8(ram, slot)) {
    ram.setU8(slot, ram.u8(slot + 1));
    if (ram.u8(a6 + 0x1a) !== 4) ram.setU8(a6 + 0x1a, ram.u8(a6 + 0x1a) - 1);
    else if (!a3Running2599B4(ram, 7)) {
      a4Stop259876(ram, 0);
      a4Start25980C(ram, 2);
      placeBoss3Parts29C300(ram, a6);
      return;
    }
  }
  applyVelocity(ram, ctx.tables, ctx.bossRec);
  placeBoss3Parts29C300(ram, a6);
}
function main0Init29C34A(ram, rom, ctx, slot) {
  const a6 = ctx.bossSubRec;
  ram.setU16(slot, 0x1818);
  ram.setU8(a6 + 0x1a, 0x0c);
  ram.setU8(a6 + 0x1b, 0x0e);
  ram.setU16(a6 + 0x02, 0x4400);
  ram.setU16(a6 + 0x04, 0xec00);
  main0Step29C366(ram, rom, ctx, slot);                // INIT falls through
}

// --------------------------------------------------------------------- W205
// Normal arrival phase: F2 starts MAIN1 plus the paired E6/E7 attack leaves.

function main1Step29C3AC(ram, _rom, ctx, slot) {
  const a6 = ctx.bossSubRec;
  applyVelocity(ram, ctx.tables, ctx.bossRec);

  if (ram.u8(slot + 1) !== 0) {
    const facing = slew64(ram.u8(a6 + 0x1b), ram.u8(slot));
    ram.setU8(a6 + 0x1b, facing);
    if (facing === ram.u8(slot)) ram.setU8(slot + 1, 0);
  }

  let target = drawByte242B3C(ram, _rom);
  const x = u16(ram.u16(a6 + 0x04) + 0x2800);
  if (x < 0x3a00) target = (target + 0x10) & 0xff;
  else if (x >= 0x4e00) target = (target + 0x30) & 0xff;
  else {
    const y = ram.u16(a6 + 0x02);
    if (y >= 0x6400) target = (target + 0x20) & 0xff;
    else if (y >= 0x5c00) {
      placeBoss3Parts29C300(ram, a6);
      return;
    } // `$29C3F4`: below `$5C00`, keep the raw `$242B3C` direction.
  }
  ram.setU8(slot, target & 0x3f);
  ram.setU8(slot + 1, 1);
  placeBoss3Parts29C300(ram, a6);
}

function main1Init29C3A4(ram, rom, ctx, slot) {
  ram.setU16(slot, 0);
  main1Step29C3AC(ram, rom, ctx, slot);               // INIT falls through
}

function e6Step29DD3E(ram, rom, ctx, a4) {
  if (!due8(ram, a4 + 0x02)) return;
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x08));

  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  const aimed = aim256FromCaller(aimTables(rom), ram, a5,
    u16(ram.u16(a6 + 0x02) + 0xe200), ram.u16(a6 + 0x04));
  if (!aimed.carry) {
    const speed = u16((u16(ram.u16(a4 + 0x06) - ram.u16(a4 + 0x04)) << 1)
      + ram.u16(a4 + 0x0c));
    shoot(ram, rom, ctx, 0x29dda2, 0x2816f6, {
      d0: ((speed << 16) | 0x000b) >>> 0,
      d1: aimed.dir, d2: ram.u32(a6 + 0x02), d3: 0xe2000000,
      d4: a6, d5: 0, a5,
    });
  }

  const duration = u16(ram.u16(a4 + 0x04) - 1);
  ram.setU16(a4 + 0x04, duration);
  if (duration !== 0xffff) return;

  ram.setU8(a5 + 0x03, ram.u8(a5 + 0x03) ^ 1);
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x09));
  ram.setU16(a4 + 0x06, Math.min(0x000c,
    u16(ram.u16(a4 + 0x06) + ram.u16(a4 + 0x0e))));
  ram.setU16(a4 + 0x04, ram.u16(a4 + 0x06));
  if (!due8(ram, a4 + 0x0a)) return;

  if (ram.u16(a6 + 0x126) < 6) ram.setU16(a6 + 0x126, ram.u16(a6 + 0x126) + 3);
  if (ram.u8(a6 + 0x12b) < 0x20) ram.setU8(a6 + 0x12b, ram.u8(a6 + 0x12b) + 8);
  if (ram.u16(a6 + 0x10c) < 0x0f) ram.setU16(a6 + 0x10c, ram.u16(a6 + 0x10c) + 3);
  if (ram.u16(a6 + 0x10e) < 6) {
    ram.setU16(a6 + 0x10e, ram.u16(a6 + 0x10e) + 2);
    ram.setU16(a6 + 0x110, ram.u16(a6 + 0x110) + 4);
  }
  a1Stop259B08(ram, 6);
  a1Stop259B08(ram, 7);
}

function e6Init29DCEE(ram, rom, ctx, a4) {
  ram.setU16(a4 + 0x02, rom.u16(0x29dcec));
  const row = rom.u32(0x29dc6c + spread2595F2() * 4);
  for (let i = 0; i < 6; i++) ram.setU16(a4 + 0x04 + i * 2, rom.u16(row + i * 2));
  const bias = ram.u8(ctx.bossSubRec + 0x12a);
  ram.setU8(a4 + 0x0a, ram.u8(a4 + 0x0a) + bias);
  ram.setU8(a4 + 0x0b, ram.u8(a4 + 0x0b) + bias);
  ram.setU16(a4 + 0x0c, ram.u16(a4 + 0x0c) + ram.u16(ctx.bossSubRec + 0x126));
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x02) - ram.u8(ctx.bossSubRec + 0x12b));
  e6Step29DD3E(ram, rom, ctx, a4);                    // INIT falls through
}

function e7Volley(ram, rom, ctx, a4, right) {
  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  let d1 = ram.u16(a6 + (right ? 0xb2 : 0xb0));
  const offset = rom.u32(0x2731fa + ((d1 & 0x3e) << 1));
  const d2 = ram.u32(a6 + (right ? 0x42 : 0x22));
  const d3 = (offset + (right ? 0x1100ff80 : 0x11000080)) >>> 0;
  const d4 = a6 + (right ? 0x40 : 0x20);
  d1 = u16((d1 << 2) + (right ? ram.u16(a4 + 0x10) : -ram.u16(a4 + 0x10)));
  let count = ram.u16(a4 + 0x0e);
  do {
    if ((count & 1) === 0) {
      shoot(ram, rom, ctx, right ? 0x29dfe8 : 0x29df70, 0x2817b8,
        { d0: ram.u32(a4 + 0x06), d1, d2, d3, d4, d5: 0, a5 });
      shoot(ram, rom, ctx, right ? 0x29dff4 : 0x29df7c, 0x2817b8,
        { d0: (ram.u32(a4 + 0x06) + 0x00030000) >>> 0,
          d1, d2, d3, d4, d5: 0, a5 });
    } else {
      shoot(ram, rom, ctx, right ? 0x29e008 : 0x29df90, 0x2817b8,
        { d0: ram.u32(a4 + 0x0a), d1, d2, d3, d4, d5: 0, a5 });
    }
    d1 = u16(d1 + (right ? -4 : 4));
  } while (count-- !== 0);
}

function e7Step29DF26(ram, rom, ctx, a4) {
  if (due8(ram, a4 + 0x02)) {
    ram.setU8(a4 + 0x02, ram.u8(a4 + 0x05));
    e7Volley(ram, rom, ctx, a4, false);
  }
  if (!due8(ram, a4 + 0x04)) return;
  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));
  e7Volley(ram, rom, ctx, a4, true);
}

function e7Init29DECA(ram, rom, ctx, a4) {
  ram.setU16(a4 + 0x02, rom.u16(0x29dec8));
  const row = rom.u32(0x29de38 + spread2595F2() * 4);
  for (let i = 0; i < 7; i++) ram.setU16(a4 + 0x04 + i * 2, rom.u16(row + i * 2));
  const a6 = ctx.bossSubRec;
  const spread = ram.u16(a6 + 0x10c);
  ram.setU16(a4 + 0x06, ram.u16(a4 + 0x06) + spread);
  ram.setU16(a4 + 0x0a, ram.u16(a4 + 0x0a) + spread);
  ram.setU16(a4 + 0x0e, ram.u16(a4 + 0x0e) + ram.u16(a6 + 0x10e));
  ram.setU16(a4 + 0x10, ram.u16(a4 + 0x10) + ram.u16(a6 + 0x110));
  const bias = ram.u8(a6 + 0x12b);
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x02) - bias);
  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x04) - bias);
  e7Step29DF26(ram, rom, ctx, a4);                    // INIT falls through
}

function f2Step29D028(ram, _rom, _ctx, a4) {
  if (a1Running259A4A(ram, 6)) return;
  a4Start25980C(ram, 3);
  ram.setU16(a4, 0);
}

function f2Init29D010(ram, rom, ctx, a4) {
  seqStart2598D0(ram, 1);
  a1Start259A18(ram, 6);
  a1Start259A18(ram, 7);
  f2Step29D028(ram, rom, ctx, a4);                    // INIT falls through
}

// --------------------------------------------------------------------- W206
// F3 steers the boss through MAIN2 while D4 opens the centre assembly.  Its
// E5 leaf runs a six-muzzle volley cycle, D5 closes the assembly, and F6
// hands off to the still-loud F4 frontier.

function main2Step29C41A(ram, rom, ctx, slot) {
  const a6 = ctx.bossSubRec;
  applyVelocity(ram, ctx.tables, ctx.bossRec);

  if (ram.u8(slot + 1) !== 0) {
    const facing = slew64(ram.u8(a6 + 0x1b), ram.u8(slot));
    ram.setU8(a6 + 0x1b, facing);
    if (facing === ram.u8(slot)) ram.setU8(slot + 1, 0);
  }

  let target = drawByte242B3C(ram, rom);
  const x = u16(ram.u16(a6 + 0x04) + 0x2800);
  if (x < 0x3600) target = (target + 0x10) & 0xff;
  else if (x >= 0x5200) target = (target + 0x30) & 0xff;
  else {
    const y = ram.u16(a6 + 0x02);
    if (y >= 0x6a00) target = (target + 0x20) & 0xff;
    else if (y >= 0x6600) {
      placeBoss3Parts29C300(ram, a6);
      return;
    }
  }
  ram.setU8(slot, target & 0x3f);
  ram.setU8(slot + 1, 1);
  placeBoss3Parts29C300(ram, a6);
}

function main2Init29C412(ram, rom, ctx, slot) {
  ram.setU16(slot, 0);
  main2Step29C41A(ram, rom, ctx, slot);                // INIT falls through
}

function d4_29C766(ram, _rom, ctx, a4) {
  if (!due8(ram, a4 + 0x02)) return;
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));
  const a6 = ctx.bossSubRec;
  ram.setU16(a6 + 0xa8, u16(ram.u16(a6 + 0xa8) + 4));
  if (ram.u16(a6 + 0xa8) === 0x18) ram.setU16(a4, 0);
}

function d5Step29C788(ram, _rom, ctx, a4) {
  if (!due8(ram, a4 + 0x02)) return;
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));
  const a6 = ctx.bossSubRec;
  ram.setU16(a6 + 0xa8, u16(ram.u16(a6 + 0xa8) - 4));
  if (ram.u16(a6 + 0xa8) === 0) ram.setU16(a4, 0);
}

function d5Init29C782(ram, rom, ctx, a4) {
  ram.setU16(a4 + 0x02, 1);
  d5Step29C788(ram, rom, ctx, a4);                    // INIT falls through
}

function e5Step29E14C(ram, rom, ctx, a4) {
  if (!due8(ram, a4 + 0x02)) return;
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x06));

  const first = (ram.u8(a4 + 0x1f) & 1) === 0;
  ram.setU8(a4 + 0x1f, ram.u8(a4 + 0x1f) | 1);
  if (first) {
    // $29E162 jsr $242EC2 / $29E168 `6B 02` bmi.s $29E16C / $29E16A `44 00` neg.b D0.
    // This site was ALREADY right: it reads bit 7, which is what N is (W416/D48).  It
    // needs the VALUE as well as the flag, so it keeps the word rather than using
    // `drawNegative242EC2`.  Note the branch is `bmi`, so the negate is on N CLEAR.
    let direction = drawWord242EC2(ram, rom) & 0xff;
    if ((direction & 0x80) === 0) direction = (-direction) & 0xff;
    ram.setU8(a4 + 0x1e, direction);
  }

  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  const d2 = ram.u32(a6 + 0x02), d4 = 0, d6 = ram.u8(a4 + 0x08);
  let d1 = ram.u8(a4 + 0x1e);
  const vectors = [0xfb40f780, 0xf540f640, 0xf100f9c0,
    0xfb400880, 0xf54009c0, 0xf1000640];
  d1 = (d1 + d6) & 0xff;
  shoot(ram, rom, ctx, 0x29e18a, 0x2816f6,
    { d0: ram.u32(a4 + 0x0e), d1, d2, d3: vectors[0], d4, d5: 0, a5 });
  d1 = (d1 - d6) & 0xff;
  shoot(ram, rom, ctx, 0x29e198, 0x2817a8,
    { d0: ram.u32(a4 + 0x12), d1, d2, d3: vectors[1], d4, d5: 0, a5 });
  d1 = (d1 - d6) & 0xff;
  shoot(ram, rom, ctx, 0x29e1a6, 0x281764,
    { d0: ram.u32(a4 + 0x0e), d1, d2, d3: vectors[2], d4, d5: 0, a5 });
  d1 = (d1 + 0x80) & 0xff;
  shoot(ram, rom, ctx, 0x29e1b2, 0x2816f6,
    { d0: ram.u32(a4 + 0x0e), d1, d2, d3: vectors[3], d4, d5: 0, a5 });
  d1 = (d1 + d6) & 0xff;
  shoot(ram, rom, ctx, 0x29e1c0, 0x2817a8,
    { d0: ram.u32(a4 + 0x12), d1, d2, d3: vectors[4], d4, d5: 0, a5 });
  d1 = (d1 + d6) & 0xff;
  shoot(ram, rom, ctx, 0x29e1ce, 0x281764,
    { d0: ram.u32(a4 + 0x0e), d1, d2, d3: vectors[5], d4, d5: 0, a5 });
  ram.setU8(a4 + 0x1e, ram.u8(a4 + 0x1e) + ram.u8(a4 + 0x09));

  if (!due8(ram, a4 + 0x04)) return;
  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));
  ram.setU8(a4 + 0x06, ram.u8(a4 + 0x07));
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x0c));
  ram.setU8(a4 + 0x09, -ram.u8(a4 + 0x09));
  ram.setU8(a4 + 0x1f, ram.u8(a4 + 0x1f) & 0xfe);
  const speedStep = ram.u16(a4 + 0x1a);
  ram.setU16(a4 + 0x0e, u16(ram.u16(a4 + 0x0e) + speedStep));
  ram.setU16(a4 + 0x12, u16(ram.u16(a4 + 0x12) + speedStep));

  if (!due8(ram, a4 + 0x0a)) return;
  ram.setU16(a6 + 0x112, Math.min(0x0c,
    u16(ram.u16(a6 + 0x112) + ram.u16(a4 + 0x1c))));
  a1Stop259B08(ram, 5);
  a3Start259962(ram, 5);
}

function e5Init29E100(ram, rom, ctx, a4) {
  ram.setU16(a4 + 0x02, rom.u16(0x29e0fc));
  const row = rom.u32(0x29e02c + spread2595F2() * 4);
  for (let i = 0; i < 11; i++)
    ram.setU16(a4 + 0x04 + i * 2, rom.u16(row + i * 2));
  ram.setU16(a4 + 0x1a, rom.u16(0x29e0fe));
  const bias = ram.u16(ctx.bossSubRec + 0x112);
  ram.setU16(a4 + 0x0e, u16(ram.u16(a4 + 0x0e) + bias));
  ram.setU16(a4 + 0x12, u16(ram.u16(a4 + 0x12) + bias));
  e5Step29E14C(ram, rom, ctx, a4);                    // INIT falls through
}

function f6_29D086(ram, _rom, _ctx, a4) {
  if (a1Running259A4A(ram, 5) || a3Running2599B4(ram, 5)) return;
  a4Start25980C(ram, 4);
  ram.setU16(a4, 0);
}

function f3Step29D068(ram, _rom, _ctx, a4) {
  if (a3Running2599B4(ram, 4)) return;
  a1Start259A18(ram, 5);
  a4Start25980C(ram, 6);
  ram.setU16(a4, 0);
}

function f3Init29D03E(ram, rom, ctx, a4) {
  const a6 = ctx.bossSubRec;
  seqStart2598D0(ram, 2);
  const d4 = a3StartSlot259962(ram, 4);
  ram.setU8(d4 + 0x02, ram.u8(a6 + 0x114));
  ram.setU8(d4 + 0x03, 1);
  if (ram.u8(a6 + 0x114) > 0x10)
    ram.setU8(a6 + 0x114, ram.u8(a6 + 0x114) - 0x30);
  f3Step29D068(ram, rom, ctx, a4);                    // INIT falls through
}

// --------------------------------------------------------------------- W207
// F4 runs MAIN3 and the paired E3/E4 leaves. E3's type-$9A requests are real,
// but that registry row's mandatory init body immediately frees each record.

function main3Step29C488(ram, rom, ctx, slot) {
  const a6 = ctx.bossSubRec;
  applyVelocity(ram, ctx.tables, ctx.bossRec);

  if (ram.u8(slot + 1) !== 0) {
    const facing = slew64(ram.u8(a6 + 0x1b), ram.u8(slot));
    ram.setU8(a6 + 0x1b, facing);
    if (facing === ram.u8(slot)) ram.setU8(slot + 1, 0);
  }

  let target = drawByte242B3C(ram, rom);
  const x = u16(ram.u16(a6 + 0x04) + 0x2800);
  if (x < 0x3c00) target = (target + 0x10) & 0xff;
  else if (x >= 0x4c00) target = (target + 0x30) & 0xff;
  else {
    const y = ram.u16(a6 + 0x02);
    if (y >= 0x6600) target = (target + 0x20) & 0xff;
    else if (y >= 0x5e00) {
      placeBoss3Parts29C300(ram, a6);
      return;
    }
  }
  ram.setU8(slot, target & 0x3f);
  ram.setU8(slot + 1, 1);
  placeBoss3Parts29C300(ram, a6);
}

function main3Init29C480(ram, rom, ctx, slot) {
  ram.setU16(slot, 0);
  main3Step29C488(ram, rom, ctx, slot);                // INIT falls through
}

function enqueueE3Dummy29D860(ram, ctx, a4, right) {
  const a6 = ctx.bossSubRec;
  const q = enqueueDeferred(ram, 0x9a, DEFQ_D1.FIXED00);
  const y = u16(ram.u16(a6 + 0x02) + 0xdc80);
  const x = u16(ram.u16(a6 + 0x04) + (right ? 0x0800 : 0xf800));
  ram.setU32(q.addr + 0x16, ((y << 16) | x) >>> 0);
  ram.setU8(q.addr + 0x1a, 0x0d + ram.u8(a6 + 0x10b));
  ram.setU8(q.addr + 0x1b, 0x80);
  ram.setU16(q.addr + 0x1c, ram.u16(a4 + 0x0c));
  const old = ram.u16(a4 + 0x0c);
  ram.setU16(a4 + 0x0c, u16(old - 4));
  if (old < 4) ram.setU16(a4 + 0x0c, 8);
}

function e3Step29D852(ram, _rom, ctx, a4) {
  if (due8(ram, a4 + 0x02)) {
    ram.setU8(a4 + 0x02, ram.u8(a4 + 0x0a));
    enqueueE3Dummy29D860(ram, ctx, a4, false);
    if (due8(ram, a4 + 0x04)) {
      ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));
      ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));
    }
  }
  if (!due8(ram, a4 + 0x06)) return;
  ram.setU8(a4 + 0x06, ram.u8(a4 + 0x0a));
  enqueueE3Dummy29D860(ram, ctx, a4, true);
  if (due8(ram, a4 + 0x08)) {
    ram.setU8(a4 + 0x08, ram.u8(a4 + 0x09));
    ram.setU8(a4 + 0x06, ram.u8(a4 + 0x07));
  }
}

function e3Init29D80A(ram, rom, ctx, a4) {
  const row = rom.u32(0x29d7a4 + spread2595F2() * 4);
  for (let i = 0; i < 4; i++)
    ram.setU16(a4 + 0x02 + i * 2, rom.u16(row + i * 2));
  for (let i = 0; i < 3; i++)
    ram.setU16(a4 + 0x0a + i * 2, rom.u16(0x29d804 + i * 2));
  const a6 = ctx.bossSubRec;
  ram.setU8(a4 + 0x03, ram.u8(a4 + 0x03) - ram.u8(a6 + 0x10a));
  const bias = (ram.u8(a6 + 0x12b) << 1) & 0xff;
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x02) + bias);
  ram.setU8(a4 + 0x06, ram.u8(a4 + 0x06) + bias);
}

function e4Shoot(ram, rom, ctx, site, entry, d0, d1, d3) {
  shoot(ram, rom, ctx, site, entry, {
    d0: d0 >>> 0, d1: d1 & 0xff, d2: ram.u32(ctx.bossSubRec + 0x02),
    d3: d3 >>> 0, d4: 0, d5: 0, a5: ctx.bossRec,
  });
}

function e4Bounce(ram, valueAddr, deltaAddr) {
  let value = (ram.u8(valueAddr) - ram.u8(deltaAddr)) & 0xff;
  let reverse = false;
  if (value > 0xc0) { value = 0xc0; reverse = true; }
  else if (value < 0x40) { value = 0x40; reverse = true; }
  ram.setU8(valueAddr, value);
  if (reverse) ram.setU8(deltaAddr, -ram.u8(deltaAddr));
}

function e4Step29DA52(ram, rom, ctx, a4) {
  if (!due8(ram, a4 + 0x02)) return;
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x06));

  const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
  const target = targetSelect(ram, a5);
  if (!target.carry) {
    const ty = ram.u16(target.addr + 0x02), tx = ram.u16(target.addr + 0x04);
    let direction = aim256(aimTables(rom), u16(ram.u16(a6 + 0x02) + 0x0400),
      u16(ram.u16(a6 + 0x04) + 0xfd00), ty, tx);
    e4Shoot(ram, rom, ctx, 0x29daae, 0x281726,
      ram.u32(a4 + 0x08), direction, 0x0400fd00);
    direction = aim256(aimTables(rom), u16(ram.u16(a6 + 0x02) + 0x0400),
      u16(ram.u16(a6 + 0x04) + 0x0300), ty, tx);
    e4Shoot(ram, rom, ctx, 0x29dadc, 0x281726,
      ram.u32(a4 + 0x08), direction, 0x04000300);
    ram.setU8(a5 + 0x03, ram.u8(a5 + 0x03) ^ 1);     // $29DAE2

    const speedA = ram.u32(a4 + 0x0c), speedB = ram.u32(a4 + 0x10);
    let d1 = ram.u8(a4 + 0x18);
    const saved = d1;
    e4Shoot(ram, rom, ctx, 0x29dafe, 0x281764, speedA, d1, 0xfe00fd00);
    d1 = (d1 + 4) & 0xff;
    e4Shoot(ram, rom, ctx, 0x29db0a, 0x281764, speedB, d1, 0xfe00fd00);
    d1 = (d1 + 4) & 0xff;
    e4Shoot(ram, rom, ctx, 0x29db1c, 0x281764,
      (speedA - 0x00080000) >>> 0, d1, 0xfe00fd00);
    d1 = (d1 + 4) & 0xff;
    e4Shoot(ram, rom, ctx, 0x29db2e, 0x281764,
      (speedB - 0x00080000) >>> 0, d1, 0xfe00fd00);

    d1 = (-saved) & 0xff;
    e4Shoot(ram, rom, ctx, 0x29db40, 0x281764, speedA, d1, 0xfe000300);
    d1 = (d1 - 4) & 0xff;
    e4Shoot(ram, rom, ctx, 0x29db4c, 0x281764, speedB, d1, 0xfe000300);
    d1 = (d1 - 4) & 0xff;
    e4Shoot(ram, rom, ctx, 0x29db5e, 0x281764,
      (speedA - 0x00080000) >>> 0, d1, 0xfe000300);
    d1 = (d1 - 4) & 0xff;
    e4Shoot(ram, rom, ctx, 0x29db70, 0x281764,
      (speedB - 0x00080000) >>> 0, d1, 0xfe000300);

    const fanSpeed = ram.u32(a4 + 0x14);
    d1 = ram.u8(a4 + 0x19);
    e4Shoot(ram, rom, ctx, 0x29db88, 0x2817a8, fanSpeed, d1, 0xf800fd00);
    d1 = (d1 - 0x10) & 0xff;
    e4Shoot(ram, rom, ctx, 0x29db92, 0x2817a8, fanSpeed, d1, 0xf800fd00);
    d1 = (d1 - 0x10) & 0xff;
    e4Shoot(ram, rom, ctx, 0x29db9c, 0x2817a8, fanSpeed, d1, 0xf800fd00);
    d1 = (-d1) & 0xff;
    e4Shoot(ram, rom, ctx, 0x29dba8, 0x2817a8, fanSpeed, d1, 0xf8000300);
    d1 = (d1 - 0x10) & 0xff;
    e4Shoot(ram, rom, ctx, 0x29dbb2, 0x2817a8, fanSpeed, d1, 0xf8000300);
    d1 = (d1 - 0x10) & 0xff;
    e4Shoot(ram, rom, ctx, 0x29dbbc, 0x2817a8, fanSpeed, d1, 0xf8000300);

    e4Bounce(ram, a4 + 0x18, a4 + 0x1c);
    e4Bounce(ram, a4 + 0x19, a4 + 0x1d);
  }

  if (!due8(ram, a4 + 0x04)) return;
  if (ram.u8(a6 + 0x106) < 0x60)
    ram.setU8(a6 + 0x106, ram.u8(a6 + 0x106) + 0x10);
  if (ram.u8(a6 + 0x107) < 4)
    ram.setU8(a6 + 0x107, ram.u8(a6 + 0x107) - 2);
  if (ram.u16(a6 + 0x108) < 5)
    ram.setU16(a6 + 0x108, ram.u16(a6 + 0x108) + 1);
  if (ram.u8(a6 + 0x10a) < 0x0a)
    ram.setU8(a6 + 0x10a, ram.u8(a6 + 0x10a) + 2);
  a1Stop259B08(ram, 4);
  a1Stop259B08(ram, 3);
}

function e4Init29D9E4(ram, rom, ctx, a4) {
  for (let i = 0; i < 2; i++)
    ram.setU16(a4 + 0x02 + i * 2, rom.u16(0x29d9da + i * 2));
  const row = rom.u32(0x29d92a + spread2595F2() * 4);
  for (let i = 0; i < 9; i++)
    ram.setU16(a4 + 0x06 + i * 2, rom.u16(row + i * 2));
  for (let i = 0; i < 3; i++)
    ram.setU16(a4 + 0x18 + i * 2, rom.u16(0x29d9de + i * 2));

  const a6 = ctx.bossSubRec;
  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x04) + ram.u8(a6 + 0x106));
  ram.setU8(a4 + 0x06, ram.u8(a4 + 0x06) - ram.u8(a6 + 0x107));
  const speed = ram.u16(a6 + 0x108);
  for (const off of [0x08, 0x0c, 0x10, 0x14])
    ram.setU16(a4 + off, u16(ram.u16(a4 + off) + speed));
  ram.setU8(a4 + 0x02,
    ram.u8(a4 + 0x02) + ((ram.u8(a6 + 0x12b) << 3) & 0xff));
  e4Step29DA52(ram, rom, ctx, a4);                    // INIT falls through
}

function f4Step29D0BE(ram, _rom, _ctx, a4) {
  if (a1Running259A4A(ram, 4)) return;
  a4Start25980C(ram, 5);
  ram.setU16(a4, 0);
}

function f4Init29D0A6(ram, rom, ctx, a4) {
  seqStart2598D0(ram, 3);
  a1Start259A18(ram, 3);
  a1Start259A18(ram, 4);
  f4Step29D0BE(ram, rom, ctx, a4);                    // INIT falls through
}

// --------------------------------------------------------------------- W208
// F5 slowly opens the centre assembly through D4, runs E8's rotating attack,
// then lets D5 close it. F7 waits for both leaves and returns the conductor to
// the already-live F2 phase, closing the normal attack cycle.

function e8Step29E3BA(ram, rom, ctx, a4) {
  if (!due8(ram, a4 + 0x02)) return;
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x06));

  const firstAim = (ram.u8(a4 + 0x1a) & 1) === 0;
  ram.setU8(a4 + 0x1a, ram.u8(a4 + 0x1a) | 1);
  let canFire = true;
  if (firstAim) {
    const target = targetSelect(ram, ctx.bossRec);
    if (target.carry) canFire = false;
    else {
      const a6 = ctx.bossSubRec;
      ram.setU8(a4 + 0x1b, aim256(aimTables(rom),
        u16(ram.u16(a6 + 0x02) + 0xf540), ram.u16(a6 + 0x04),
        ram.u16(target.addr + 0x02), ram.u16(target.addr + 0x04)));
    }
  }

  if (canFire) {
    const a5 = ctx.bossRec, a6 = ctx.bossSubRec;
    const d2 = ram.u32(a6 + 0x02), d4 = 0;
    const secondLoop = ram.u16(0x813098) !== 0;
    const spread = secondLoop ? 0x0a : 0x08;
    const sideD0 = 0x00050000 | (secondLoop ? 1 : 2);
    const vectors = (ram.u8(a4 + 0x09) & 0x80) !== 0
      ? [0xfb40f780, 0xf540f640, 0xf100f9c0]
      : [0xf1000640, 0xf54009c0, 0xfb400880];
    let d1 = ram.u8(a4 + 0x1b);

    d1 = (d1 + 0x14) & 0xff;
    shoot(ram, rom, ctx, 0x29e446, 0x2816f6,
      { d0: ram.u32(a4 + 0x0e), d1, d2, d3: vectors[0], d4, d5: 0, a5 });
    if (secondLoop) {
      d1 = (d1 + spread) & 0xff;
      shoot(ram, rom, ctx, 0x29e462, 0x2816f6,
        { d0: sideD0, d1, d2, d3: vectors[0], d4, d5: 0, a5 });
      d1 = (d1 - spread) & 0xff;
    }
    d1 = (d1 - spread) & 0xff;
    shoot(ram, rom, ctx, 0x29e476, 0x2816f6,
      { d0: sideD0, d1, d2, d3: vectors[0], d4, d5: 0, a5 });
    d1 = (d1 + spread - 0x14) & 0xff;
    shoot(ram, rom, ctx, 0x29e488, 0x2817a8,
      { d0: ram.u32(a4 + 0x12), d1, d2, d3: vectors[1], d4, d5: 0, a5 });
    d1 = (d1 - 0x14) & 0xff;
    shoot(ram, rom, ctx, 0x29e498, 0x2816f6,
      { d0: ram.u32(a4 + 0x0e), d1, d2, d3: vectors[2], d4, d5: 0, a5 });
    d1 = (d1 + spread) & 0xff;
    shoot(ram, rom, ctx, 0x29e4aa, 0x2816f6,
      { d0: sideD0, d1, d2, d3: vectors[2], d4, d5: 0, a5 });
    d1 = (d1 - spread) & 0xff;
    if (secondLoop) {
      d1 = (d1 - spread) & 0xff;
      shoot(ram, rom, ctx, 0x29e4c8, 0x2816f6,
        { d0: sideD0, d1, d2, d3: vectors[2], d4, d5: 0, a5 });
    }
    ram.setU8(a4 + 0x1b, ram.u8(a4 + 0x1b) + ram.u8(a4 + 0x09));
  }

  if (!due8(ram, a4 + 0x04)) return;
  ram.setU8(a4 + 0x06, ram.u8(a4 + 0x07));
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x0c));
  ram.setU8(a4 + 0x09, -ram.u8(a4 + 0x09));
  ram.setU8(a4 + 0x1a, ram.u8(a4 + 0x1a) & 0xfe);
  ram.setU8(ctx.bossRec + 0x03, ram.u8(ctx.bossRec + 0x03) ^ 1);
  ram.setU8(a4 + 0x05,
    Math.min(0x0e, ram.u8(a4 + 0x05) + ram.u8(a4 + 0x08)));
  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));
  const speedStep = ram.u16(a4 + 0x16);
  ram.setU16(a4 + 0x0e, u16(ram.u16(a4 + 0x0e) + speedStep));
  ram.setU16(a4 + 0x12, u16(ram.u16(a4 + 0x12) + speedStep));

  if (!due8(ram, a4 + 0x0a)) return;
  const a6 = ctx.bossSubRec;
  ram.setU8(a6 + 0x116,
    Math.min(0x0e, ram.u8(a6 + 0x116) + ram.u8(a4 + 0x08)));
  ram.setU8(a6 + 0x117, Math.min(4, ram.u8(a6 + 0x117) + 1));
  ram.setU16(a6 + 0x118,
    Math.min(0x0c, u16(ram.u16(a6 + 0x118) + ram.u16(a4 + 0x18))));
  a1Stop259B08(ram, 8);
  a3Start259962(ram, 5);
}

function e8Init29E356(ram, rom, ctx, a4) {
  const row = rom.u32(0x29e274 + spread2595F2() * 4);
  for (let i = 0; i < 12; i++)
    ram.setU16(a4 + 0x02 + i * 2, rom.u16(row + i * 2));
  ram.setU16(a4 + 0x1a, rom.u16(0x29e354));
  const a6 = ctx.bossSubRec;
  const bias = ram.u16(a6 + 0x118);
  ram.setU16(a4 + 0x0e, u16(ram.u16(a4 + 0x0e) + bias));
  ram.setU16(a4 + 0x12, u16(ram.u16(a4 + 0x12) + bias));
  const cadence = ram.u8(a6 + 0x116);
  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x04) + cadence);
  ram.setU8(a4 + 0x05, ram.u8(a4 + 0x05) + cadence);
  ram.setU8(a4 + 0x0a, ram.u8(a4 + 0x0a) + ram.u8(a6 + 0x117));
  if (ram.u8(a4 + 0x04) > 0x0e) {
    ram.setU8(a4 + 0x04, 0x0e);
    ram.setU8(a4 + 0x05, 0x0e);
  }
  e8Step29E3BA(ram, rom, ctx, a4);                    // INIT falls through
}

function f7Step29D104(ram, _rom, _ctx, a4) {
  if (ram.u16(a4 + 0x02) !== 0) {
    const delay = u16(ram.u16(a4 + 0x02) - 1);
    ram.setU16(a4 + 0x02, delay);
    if (delay !== 0) return;
    a4Start25980C(ram, 2);
    ram.setU16(a4, 0);
    return;
  }
  if (a1Running259A4A(ram, 8) || a3Running2599B4(ram, 5)) return;
  ram.setU16(a4 + 0x02, 1);
}

function f7Init29D100(ram, rom, ctx, a4) {
  ram.setU16(a4 + 0x02, 0);
  f7Step29D104(ram, rom, ctx, a4);                    // INIT falls through
}

function f5Step29D0E2(ram, _rom, _ctx, a4) {
  if (a3Running2599B4(ram, 4)) return;
  a1Start259A18(ram, 8);
  a4Start25980C(ram, 7);
  ram.setU16(a4, 0);
}

function f5Init29D0D4(ram, rom, ctx, a4) {
  const d4 = a3StartSlot259962(ram, 4);
  ram.setU16(d4 + 0x02, 0x5001);
  f5Step29D0E2(ram, rom, ctx, a4);                    // INIT falls through
}

// --------------------------------------------------------------------- W209
// The low-HP F9 phase sheds 24 randomized debris records before handing to F8.
// F8 delays the destructive assembly transition and starts its leaves together.

function f9Step29D180(ram, rom, ctx, a4) {
  if (ram.u16(a4 + 0x02) !== 0) {
    const timer = u16(ram.u16(a4 + 0x02) - 1);
    ram.setU16(a4 + 0x02, timer);
    if (timer === 0) a2Stop25994A(ram, 8);
  }

  if (!due8(ram, a4 + 0x04)) return;
  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));
  // $29D1A2 lea $28C274,A0 / $29D1A8 jsr $242EC2 / $29D1AE 6A06 bpl.s $29D1B6 /
  // $29D1B0 lea $28C28E,A0 / $29D1B6 jsr (A0).  W416/D48: `bpl` reads N, and N is
  // bit 7 of the byte $242ED6 loaded -- the port tested bit 15, which is always 0.
  ctx.soundPost?.(drawNegative242EC2(ram, rom) ? 0x28c28e : 0x28c274);
  const kind = rom.u16(0x29d238 + (drawWord242EC2(ram, rom) & 7) * 2);
  const e = spawnEffect(ram, ctx, kind, 0x29d1c8);
  const a6 = ctx.bossSubRec;
  ram.setU32(e + 0x02, ram.u32(a6 + 0x02));
  ram.setU16(e + 0x1e, 0x10);
  ram.setU16(e + 0x12, 0);
  ram.setU16(e + 0x14, 0x0800);
  ram.setU8(e + 0x1a, 2);
  ram.setU8(e + 0x1b, drawByte242E24(ram, rom) + 0x60);
  ram.setU16(e + 0x20, 0);
  ram.setU16(e + 0x22, 0xfff9);
  const yDraw = i16(drawLong243A9C(ram, rom) & 0xffff);
  ram.setU16(e + 0x26, u16((yDraw >> 1) + 0xe640));
  const xDraw = i16(drawLong243A9C(ram, rom) & 0xffff);
  ram.setU16(e + 0x28, u16((xDraw >> 1) + xDraw));

  const old = ram.u16(a4 + 0x06);
  ram.setU16(a4 + 0x06, old - 1);
  if (old !== 0) return;
  a4Start25980C(ram, 8);
  ram.setU16(a4, 0);
}

function f9Init29D16E(ram, rom, ctx, a4) {
  ram.setU16(a4 + 0x02, 0x0040);
  ram.setU16(a4 + 0x04, 0x0404);
  ram.setU16(a4 + 0x06, 0x0017);
  f9Step29D180(ram, rom, ctx, a4);                    // INIT falls through
}

function f8Step29D146(ram, _rom, ctx, a4) {
  const old = ram.u16(a4 + 0x02);
  ram.setU16(a4 + 0x02, old - 1);
  if (old !== 0) return;
  a3Start259962(ram, 2);
  a1Start259A18(ram, 1);
  a1Start259A18(ram, 2);
  ram.setU16(ctx.bossSubRec + 0x88, 0);
  ram.setU16(a4, 0);
}

function f8Init29D138(ram, rom, ctx, a4) {
  ram.setU16(a4 + 0x02, 0x0080);
  seqStart2598D0(ram, 1);
  f8Step29D146(ram, rom, ctx, a4);                    // INIT falls through
}

function geometryPair29C6CE(ram, rom, a6, leftOff, rightOff) {
  const base = 0x29c6ce;
  ram.setU16(a6 + 0x26, rom.u16(base + leftOff));
  ram.setU16(a6 + 0x28, rom.u16(base + leftOff + 2));
  ram.setU16(a6 + 0x46, rom.u16(base + rightOff));
  ram.setU16(a6 + 0x48, -rom.u16(base + rightOff + 2));
}

function d2Step29C606(ram, rom, _ctx, a4) {
  const a6 = _ctx.bossSubRec;
  if (!due8(ram, a4 + 0x02)) return;
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));
  geometryPair29C6CE(ram, rom, a6, ram.u16(a6 + 0x2a), ram.u16(a6 + 0x4a));
  const next = u16(ram.u16(a6 + 0x2a) + 4);
  ram.setU16(a6 + 0x2a, next);
  if (next === 0x94) {
    ram.setU16(a4, 0);
    a1Start259A18(ram, 0);
    a3Start259962(ram, 3);
  }
  ram.setU16(a6 + 0x4a, next);
}

function d2Init29C5F6(ram, rom, ctx, a4) {
  ram.setU16(a4 + 0x02, 0x8001);
  ram.setU16(ctx.bossSubRec + 0x2a, 4);
  ram.setU16(ctx.bossSubRec + 0x4a, 4);
  d2Step29C606(ram, rom, ctx, a4);                     // INIT falls through
}

function d3Step29C672(ram, rom, ctx, a4) {
  const a6 = ctx.bossSubRec;
  if (!due8(ram, a4 + 0x02)) return;
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));
  geometryPair29C6CE(ram, rom, a6, ram.u16(a6 + 0x2a), ram.u16(a6 + 0x4a));
  const old = ram.u16(a6 + 0x2a);
  const next = u16(old - 4);
  ram.setU16(a6 + 0x2a, next);
  if (old < 4) {
    ram.setU16(a4, 0);
    a3Start259962(ram, 2);
    a2Run2598E6(ram, 2);
    a2Run2598E6(ram, 3);
  }
  ram.setU16(a6 + 0x4a, next);
}

function d3Init29C660(ram, rom, ctx, a4) {
  ram.setU16(a4 + 0x02, 0x6001);
  ram.setU16(ctx.bossSubRec + 0x2a, 0x84);
  ram.setU16(ctx.bossSubRec + 0x4a, 0x84);
  d3Step29C672(ram, rom, ctx, a4);                     // INIT falls through
}

function e0Step29D29A(ram, _rom, ctx, a4) {
  if (ram.u16(a4 + 0x02) !== 0) {
    a2Stop25994A(ram, 2);
    a2Stop25994A(ram, 3);
    ram.setU16(a4, 0);
    return;
  }
  const a6 = ctx.bossSubRec;
  const pos = ram.u32(a6 + 0x02);
  const hi = pos >>> 16, lo = pos & 0xffff;
  const left = enqueueDeferred(ram, 0x99, DEFQ_D1.FIXED00);
  ram.setU32(left.addr + 0x16,
    ((u16(hi + 0x04c0) << 16) | u16(lo - 0x0a00)) >>> 0);
  ram.setU16(left.addr + 0x1a, ram.u8(a6 + 0x69));
  ram.setU16(left.addr + 0x34, 0x0184);
  const random = drawByte242B3C(ram, _rom);
  ram.setU8(left.addr + 0x36, random);

  const right = enqueueDeferred(ram, 0x99, DEFQ_D1.FIXED00);
  ram.setU32(right.addr + 0x16,
    ((u16(hi + 0x04c0) << 16) | u16(lo + 0x0a00)) >>> 0);
  ram.setU16(right.addr + 0x1a, 0x4000 | ram.u8(a6 + 0x69));
  ram.setU16(right.addr + 0x34, 0x017c);
  ram.setU8(right.addr + 0x36, random);
  ram.setU16(a4 + 0x02, 1);
}

function e0Init29D296(ram, rom, ctx, a4) {
  ram.setU16(a4 + 0x02, 0);
  e0Step29D29A(ram, rom, ctx, a4);                     // INIT falls through
}

function e1Step29D460(ram, rom, ctx, a4) {
  if (!due8(ram, a4 + 0x02)) return;
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x07));
  let angle = ram.u8(a4 + 0x16);
  for (let i = 0; i < 4; i++) {
    let d0 = ram.u32(a4 + 0x08);
    if (angle < 0x20 || angle > 0xe0) d0 = (d0 + 0x00080000) >>> 0;
    shoot(ram, rom, ctx, 0x29d496, 0x281708, {
      d0, d1: angle, d2: ram.u32(ctx.bossSubRec + 0x02),
      d3: 0xe2000000, d4: 0,
    });
    angle = (angle + 0x40) & 0xff;
  }
  ram.setU8(a4 + 0x16, ram.u8(a4 + 0x16) + ram.u8(a4 + 0x17));
  const phase = u16(ram.u8(a4 + 0x18) - 1) & 0xff;
  ram.setU8(a4 + 0x18, phase);
  if (phase === 0) {
    ram.setU8(a4 + 0x18, ram.u8(a4 + 0x19));
    ram.setU8(a4 + 0x02, 0x12);
  }
  const old = ram.u8(a4 + 0x04);
  ram.setU8(a4 + 0x04, old - 1);
  if (old !== 0) return;
  ram.setU8(a4 + 0x17, -ram.u8(a4 + 0x17));
  ram.setU8(ctx.bossRec + 0x03, ram.u8(ctx.bossRec + 0x03) ^ 1);
  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));
}

function e1Init29D400(ram, rom, ctx, a4) {
  const row = rom.u32(0x29d340 + spread2595F2() * 4);
  for (let i = 0; i < 10; i++) ram.setU16(a4 + 0x02 + i * 2, rom.u16(row + i * 2));
  ram.setU8(a4 + 0x07, ram.u16(0x813098) === 0 ? 8 : 4);
  ram.setU8(a4 + 0x16, drawWord242EC2(ram, rom));       // $29D43A/$29D440
  // $29D444 move.w #$3,D1 / $29D448 jsr $242EC2 / $29D44E 6A04 bpl.s $29D454 /
  // $29D450 move.w #-3,D1 / $29D454 move.b D1,($17,A4).  W416/D48: bit 7, so the
  // E1 fan's step is -3 on half the inits instead of +3 on all of them.
  ram.setU8(a4 + 0x17, drawNegative242EC2(ram, rom) ? -3 : 3);
  ram.setU16(a4 + 0x18, 0x0606);
}

function e2Fan29D60A(ram, rom, ctx, a4, right) {
  const a6 = ctx.bossSubRec;
  const loop = ram.u16(0x813098) !== 0;
  const lowHp = ram.u32(ctx.bossRec + 0x16) < 0x00008c00;
  const heading = ram.u16(a6 + (right ? 0xb2 : 0xb0));
  const vector = (rom.u32(0x2731fa + ((heading & 0x3e) << 1))
    + (right ? 0x1100ff80 : 0x11000080)) >>> 0;
  const pos = ram.u32(a6 + (right ? 0x42 : 0x22));
  const angleAt = right ? 0x18 : 0x16;
  const stepAt = right ? 0x19 : 0x17;
  ram.setU8(a4 + angleAt, ram.u8(a4 + angleAt) + ram.u8(a4 + stepAt));
  let angle = ram.u8(a4 + angleAt);
  let d0 = lowHp ? 0xfffb0005 : 0xfffe0004;
  let count = loop ? (lowHp ? 6 : 5) : (lowHp ? 4 : 3);
  const step = loop ? (lowHp ? 0x2a : 0x33) : (lowHp ? 0x40 : 0x55);
  const site = loop ? (right ? 0x29d788 : 0x29d6c6) : (right ? 0x29d73e : 0x29d67c);
  const entry = loop ? 0x281726 : 0x2816f6;
  for (let i = 0; i < count; i++) {
    let shotD0 = d0;
    if (angle < 0x40 || angle > 0xc0)
      shotD0 = (shotD0 + (loop ? 0x00100000 : 0x00080000)) >>> 0;
    shoot(ram, rom, ctx, site, entry,
      { d0: shotD0, d1: angle, d2: pos, d3: vector, d4: 0 });
    angle = (angle + step) & 0xff;
  }
}

function e2Step29D5C6(ram, rom, ctx, a4) {
  if (!due8(ram, a4 + 0x02)) return;
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));
  if (ram.u32(ctx.bossRec + 0x16) < 0x00008c00) {
    ram.setU8(a4 + 0x17, 5);
    ram.setU8(a4 + 0x19, -5);
    ram.setU8(a4 + 0x18, -ram.u8(a4 + 0x16));
    ram.setU8(a4 + 0x03, ram.u16(0x813098) === 0 ? 2 : 3);
  }
  e2Fan29D60A(ram, rom, ctx, a4, false);
  e2Fan29D60A(ram, rom, ctx, a4, true);
  ram.setU8(ctx.bossRec + 0x03, ram.u8(ctx.bossRec + 0x03) ^ 1);
}

function e2Init29D556(ram, rom, ctx, a4) {
  const row = rom.u32(0x29d4e6 + spread2595F2() * 4);
  for (let i = 0; i < 5; i++) ram.setU16(a4 + 0x02 + i * 2, rom.u16(row + i * 2));
  ram.setU8(a4 + 0x10, drawSigned242FDE(ram, rom));
  const first = drawWord242EC2(ram, rom);
  ram.setU8(a4 + 0x16, first);
  ram.setU8(a4 + 0x17, 5);
  ram.setU8(a4 + 0x18, -first + 6);
  ram.setU8(a4 + 0x19, -5);
  // $29D5A4 jsr $242EC2 / $29D5AA 6A00 0008 bpl.w $29D5B4 / $29D5AE `04 2C 00 0C
  // 00 18` subi.**b** #$C,($18,A4).  W416/D48: bit 7, not bit 15.
  if (drawNegative242EC2(ram, rom))
    ram.setU8(a4 + 0x18, ram.u8(a4 + 0x18) - 0x0c);
  if (ram.u16(0x813098) !== 0) ram.setU8(a4 + 0x03, 3);
  void ctx;
}

// --------------------------------------------------------------------- W210
// The final Stage-3 boss conductor is the cartridge's four-state death
// presentation. It drains the 16-row effect table, runs the accelerating
// debris phase, fades the boss parts, triggers the shared final blast, and
// finally suspends the scheduler so the wrapper advances into Stage 4.

function f1SpawnRow29CE86(ram, rom, ctx, a6, cursor, withSubs, site) {
  const row = 0x29ce86 + cursor;
  const e = spawnEffect(ram, ctx, rom.u16(row), site);
  ram.setU8(e + 0x1c, rom.u16(row + 2));
  ram.setU32(e + 0x26, rom.u32(row + 4));
  ram.setU32(e + 0x02, ram.u32(a6 + 0x02));
  ram.setU16(e + 0x1e, 8);
  if (withSubs) {
    ram.setU16(e + 0x12, 0);
    ram.setU16(e + 0x14, 0);
  }
  return e;
}

function f1RandomSound29CE10(ram, rom, ctx) {
  // $29CE10 lea $28C274,A0 / $29CE16 jsr $242EC2 / $29CE1C 6A06 bpl.s / $29CE1E lea
  // $28C28E,A0.  W416/D48: bit 7 of the drawn byte -- the second cue was never posted.
  ctx.soundPost?.(drawNegative242EC2(ram, rom) ? 0x28c28e : 0x28c274);
}

function f1Step29CC64(ram, rom, ctx, a4) {
  const a6 = ctx.bossSubRec;
  const state = ram.u16(a4 + 0x02);

  if (state === 4) {
    const timer = u16(ram.u16(a4 + 0x04) - 1);
    ram.setU16(a4 + 0x04, timer);
    if (timer === 0) {
      suspend2595E8(ram);
      ram.setU16(a4, 0);
    }
    return;
  }

  if (state === 3) {
    const timer = u16(ram.u16(a4 + 0x04) - 1);
    ram.setU16(a4 + 0x04, timer);
    if (timer === 0) {
      finalBlast2440E0(ram, rom, ctx, a6);
      ram.setU16(a4 + 0x04, 0x0080);
      ram.setU16(a4 + 0x02, 4);
      ctx.soundPost?.(0x28c392);
    }
    return;
  }

  if (state === 2) {
    if (fadeDone259B9E(ram)) return;
    loadAnimObjects246410(ram, rom, 0x29cf08);
    a2StopAll259924(ram);
    ram.setU16(a4 + 0x0a, 1);
    ram.setU16(a4 + 0x02, 3);
    ram.setU16(a4 + 0x04, 8);
    return;
  }

  if (state === 1) {
    if (due8(ram, a4 + 0x10)) {
      ram.setU8(a4 + 0x10, ram.u8(a4 + 0x11));
      const angle = drawWord242EC2(ram, rom) & 0xff;
      const dx = i16(drawWord24328E(ram, rom)) >> 2;
      const dy = (i16(drawWord24328E(ram, rom)) >> 1) - 0x1000;
      const root = ram.u32(a6 + 0x02);
      const pos = ((u16((root >>> 16) + dy) << 16)
        | u16((root & 0xffff) + dx)) >>> 0;
      bigBurst28B34A(ram, rom, ctx, pos, angle, 8, 0x29cd24);
      if (ram.u8(a4 + 0x07) !== 2) ctx.soundPost?.(0x28c2c2);
    }
    if (due8(ram, a4 + 0x0e)) {
      ram.setU8(a4 + 0x0e, ram.u8(a4 + 0x0f));
      if (ram.u8(a4 + 0x07) !== 2) {
        ram.setU8(a4 + 0x07, ram.u8(a4 + 0x07) - 1);
        ram.setU8(a4 + 0x0c, ram.u8(a4 + 0x0c) + 1);
      }
    }
    if (!due8(ram, a4 + 0x06)) return;
    ram.setU8(a4 + 0x06, ram.u8(a4 + 0x07));
    if (ram.u8(a4 + 0x07) !== 2 && due8(ram, a4 + 0x13)) {
      ram.setU8(a4 + 0x13, 4);
      ctx.soundPost?.(0x28c28e);
    }
    const cursor = ram.u16(a4 + 0x08);
    const e = f1SpawnRow29CE86(ram, rom, ctx, a6, cursor, false, 0x29cd88);
    const random = (drawByte242B3C(ram, rom) << 24) >> 24;
    ram.setU8(e + 0x1a, (random >> 2) + 2 + (ram.i8(a4 + 0x0c) >> 1));
    ram.setU8(e + 0x1b, drawWord242EC2(ram, rom));
    const next = cursor + 8;
    ram.setU16(a4 + 0x08, next < 0x80 ? next : 0);
    if (next >= 0x80 && ram.u8(a4 + 0x07) === 2) {
      fadeArm259B7E(ram, 0x0a);
      ram.setU16(a4 + 0x02, 2);
    }
    return;
  }

  if (state === 0) {
    if (!due8(ram, a4 + 0x06)) return;
    ram.setU8(a4 + 0x06, ram.u8(a4 + 0x07));
    const oldSoundToggle = ram.u8(a4 + 0x12);
    ram.setU8(a4 + 0x12, oldSoundToggle ^ 1);
    if ((oldSoundToggle & 1) === 0) f1RandomSound29CE10(ram, rom, ctx);
    const cursor = ram.u16(a4 + 0x08);
    f1SpawnRow29CE86(ram, rom, ctx, a6, cursor, true, 0x29ce32);
    const next = cursor + 8;
    if (next < 0x80) { ram.setU16(a4 + 0x08, next); return; }
    ram.setU16(a4 + 0x08, 0);
    const passes = u16(ram.u16(a4 + 0x0a) - 1);
    ram.setU16(a4 + 0x0a, passes);
    if (passes !== 0) return;
    ram.setU16(a4 + 0x06, 0x2010);
    ram.setU16(a4 + 0x0e, 0x1111);
    ram.setU16(a4 + 0x02, 1);
  }
}

function f1Init29CC34(ram, rom, ctx, a4) {
  loadAnimObjects246520(ram, rom, 0x29cfea);
  ram.setU16(a4 + 0x02, 0);
  ram.setU16(a4 + 0x06, 0x0101);
  ram.setU16(a4 + 0x08, 0);
  ram.setU16(a4 + 0x0a, 1);
  ram.setU8(a4 + 0x0c, 0);
  ram.setU16(a4 + 0x10, 0x2020);
  ram.setU16(a4 + 0x12, 0);
  f1Step29CC64(ram, rom, ctx, a4);                    // INIT falls through
}

function d0Step29C53E(ram, _rom, ctx, a4) {
  const a6 = ctx.bossSubRec;
  if (ram.u8(a6 + 0x8c) === 0) {
    if (!due8(ram, a4 + 0x02)) return;
    ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));
  }
  const selector = u16(ram.u16(a6 + 0xa6) + 4);
  ram.setU16(a6 + 0xa6, selector === 0x40 ? 0 : selector);
}

function d0Init29C532(ram, rom, ctx, a4) {
  ram.setU16(a4 + 0x02, 1);
  ram.setU16(ctx.bossSubRec + 0xa6, 0);
  d0Step29C53E(ram, rom, ctx, a4);                    // INIT falls through
}

function d1Step29C56A(ram, rom, ctx, a4) {
  if (!due8(ram, a4 + 0x02)) return;
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));
  const target = targetSelect(ram, ctx.bossRec);
  if (target.carry) return;
  const a6 = ctx.bossSubRec;
  const ty = ram.u16(target.addr + 0x02), tx = ram.u16(target.addr + 0x04);
  if (ram.u16(a6 + 0xb6) === 0) {
    const aimed = aim64(aimTables(rom), u16(ram.u16(a6 + 0x22) + 0x1100),
      u16(ram.u16(a6 + 0x24) + 0x0080), ty, tx);
    ram.setU16(a6 + 0xb0, slew64(ram.u16(a6 + 0xb0), aimed));
  }
  if (ram.u16(a6 + 0xb8) === 0) {
    const aimed = aim64(aimTables(rom), u16(ram.u16(a6 + 0x42) + 0x1100),
      u16(ram.u16(a6 + 0x44) - 0x0080), ty, tx);
    ram.setU16(a6 + 0xb2, slew64(ram.u16(a6 + 0xb2), aimed));
  }
}

function d1Init29C564(ram, rom, ctx, a4) {
  ram.setU16(a4 + 0x02, 1);
  d1Step29C56A(ram, rom, ctx, a4);                    // INIT falls through
}

function d6Step29C7AA(ram, _rom, ctx, a4) {
  const a6 = ctx.bossSubRec;
  if (ram.u8(a6 + 0x8c) === 0) {
    if (!due8(ram, a4 + 0x02)) return;
    ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));
  }
  const selector = u16(ram.u16(a6 + 0xbe) + 4);
  ram.setU16(a6 + 0xbe, selector === 0x20 ? 0 : selector);
}

function d6Init29C79E(ram, rom, ctx, a4) {
  ram.setU16(a4 + 0x02, 0);
  ram.setU16(ctx.bossSubRec + 0xbe, 0);
  d6Step29C7AA(ram, rom, ctx, a4);                    // INIT falls through
}

function boss3D4(ram, a6, palette) {
  return (ram.u16(a6 + 0x1c) & 0xff00) | ram.u8(a6 + palette);
}

function boss3Draw(ram, rom, ctx, d1, d2, d3, d4) {
  enqueueRegistersThroughStub(ram, rom, 0x23dfea, d1 >>> 0, d2, d3, d4);
}

function object0_29BE72(ram, rom, ctx) {
  const a6 = ctx.bossSubRec;
  const d2 = rom.u32(0x29bea0 + ram.u16(a6 + 0xa6));
  const d1 = (ram.u32(a6 + 0x02) + 0xe4400000 + 0xec00e800) >>> 0;
  boss3Draw(ram, rom, ctx, d1, d2, 0x14c0, boss3D4(ram, a6, 0x68));
}

function object1_29BEE0(ram, rom, ctx) {
  const a6 = ctx.bossSubRec;
  boss3Draw(ram, rom, ctx, (ram.u32(a6 + 0x02) + 0xde00ec00) >>> 0,
    0x000a3514, 0x22a0, boss3D4(ram, a6, 0x66));
}

function object23(ram, rom, ctx, right) {
  const a6 = ctx.bossSubRec;
  const d2 = rom.u32(0x29bf6a + ram.u16(a6 + (right ? 0xac : 0xaa)));
  const y = u16(ram.u16(a6 + 0x02) + 0x04c0);
  const x = u16(ram.u16(a6 + 0x04) + (right ? 0x0a00 : 0xf600));
  const d1 = ((((y << 16) | x) >>> 0) + 0xf000fc00) >>> 0;
  const d4 = (right ? 0x4000 : 0) | ram.u8(a6 + 0x69);
  boss3Draw(ram, rom, ctx, d1, d2, 0x1020, d4);
}

function object45(ram, rom, ctx, right) {
  const a6 = ctx.bossSubRec;
  const table = right ? 0x29c006 : 0x29bfb8;
  const d2 = rom.u32(table + ram.u16(a6 + 0xbe));
  const pos = ((ram.u16(a6 + (right ? 0x42 : 0x22)) << 16)
    | ram.u16(a6 + (right ? 0x44 : 0x24))) >>> 0;
  boss3Draw(ram, rom, ctx, (pos + 0xe400f700) >>> 0,
    d2, 0x1c48, ram.u8(a6 + 0x67));
}

function object67(ram, rom, ctx, right) {
  const a6 = ctx.bossSubRec;
  const heading = ram.u16(a6 + (right ? 0xb2 : 0xb0));
  const d2 = rom.u32(0x272d7a + ((heading & 0x3e) << 1));
  const y = u16(ram.u16(a6 + (right ? 0x42 : 0x22)) + 0x0d00);
  const x = u16(ram.u16(a6 + (right ? 0x44 : 0x24)) + (right ? 0xfc80 : 0xfd80));
  boss3Draw(ram, rom, ctx, ((y << 16) | x) >>> 0,
    d2, 0x0418, ram.u8(a6 + 0x67));
}

function object8_29C026(ram, rom, ctx) {
  const a6 = ctx.bossSubRec;
  const d2 = rom.u32(0x29c052 + ram.u16(a6 + 0xa8));
  const d1 = (ram.u32(a6 + 0x02) + 0xf6400000 + 0xf600f400) >>> 0;
  boss3Draw(ram, rom, ctx, d1, d2, 0x0a60, ram.u8(a6 + 0x67));
}

function finishD7Arrival(ram, rom, ctx, a4) {
  const a6 = ctx.bossSubRec;
  ram.setU16(a4, 0);
  ram.setU8(0x8130f8, ram.u8(0x8130f8) | 0x12);
  ram.setU16(0x81b6e4, 1);
  ram.setU16(a6 + 0x88, 0);
  for (const off of [0x00, 0x20, 0x40, 0xc0, 0xe0])
    ram.setU16(a6 + off, ram.u16(a6 + off) | 0xa001);
  a2Stop25994A(ram, 9);
  for (let id = 0; id <= 8; id++) a2Run2598E6(ram, id);
  for (const id of [0, 1, 6]) a3Start259962(ram, id);
  loadAnimObjects246410(ram, rom, 0x29c8e4);
}
function d7Step29C7E8(ram, rom, ctx, a4) {
  const a6 = ctx.bossSubRec;
  if (ram.u16(a4 + 6) !== 0) {
    ram.setU16(a4 + 6, u16(ram.u16(a4 + 6) - 1));
    if (ram.u16(a4 + 6) === 0) ram.setU16(a6 + 0xbc, 0x00c0);
    else {
      if (!due8(ram, a4 + 4)) return;
      ram.setU8(a4 + 4, ram.u8(a4 + 5));
      ram.setU16(a6 + 0xbc, u16(ram.u16(a6 + 0xbc) + 0x0c));
      if (ram.u16(a6 + 0xbc) !== 0x00c0) return;
      ram.setU16(a6 + 0xbc, 0);
      ram.setU16(a4 + 6, u16(ram.u16(a4 + 6) - 1));
      if (ram.u16(a4 + 6) !== 0) return;
      ram.setU16(a6 + 0xbc, 0x0060);
    }
  }
  if (!due8(ram, a4 + 2)) return;
  ram.setU8(a4 + 2, ram.u8(a4 + 3));
  ram.setU16(a6 + 0xbc, u16(ram.u16(a6 + 0xbc) + 0x0c));
  if (ram.u16(a6 + 0xbc) !== 0x01e0) return;
  finishD7Arrival(ram, rom, ctx, a4);
}
function d7Init29C7D0(ram, rom, ctx, a4) {
  const a6 = ctx.bossSubRec;
  ram.setU16(a4 + 2, 1);
  ram.setU16(a4 + 4, 0x0202);
  ram.setU16(a4 + 6, 0x00c0);
  ram.setU16(a6 + 0xbc, 0);
  d7Step29C7E8(ram, rom, ctx, a4);                    // INIT falls through
}

function object9_29C0DE(ram, rom, ctx) {
  const a6 = ctx.bossSubRec;
  let p = 0x29c100 + ram.u16(a6 + 0xbc);
  const d2 = rom.u32(p); p += 4;
  const d1 = (ram.u32(a6 + 2) + 0xf7000000 + rom.u32(p)) >>> 0; p += 4;
  const d3 = rom.u16(p); p += 2;
  const d4 = rom.u16(p);
  enqueueRegistersThroughStub(ram, rom, 0x23dfea, d1, d2, d3, d4);
}

registerScript(0x29cc20, f0Init29CC20);
registerScript(0x29cc30, f0Step29CC30);
registerScript(0x29c34a, main0Init29C34A);
registerScript(0x29c366, main0Step29C366);
registerScript(0x29c7d0, d7Init29C7D0);
registerScript(0x29c7e8, d7Step29C7E8);
registerScript(0x29c0de, object9_29C0DE);
registerScript(0x29d010, f2Init29D010);
registerScript(0x29d028, f2Step29D028);
registerScript(0x29c3a4, main1Init29C3A4);
registerScript(0x29c3ac, main1Step29C3AC);
registerScript(0x29dcee, e6Init29DCEE);
registerScript(0x29dd3e, e6Step29DD3E);
registerScript(0x29deca, e7Init29DECA);
registerScript(0x29df26, e7Step29DF26);
registerScript(0x29c532, d0Init29C532);
registerScript(0x29c53e, d0Step29C53E);
registerScript(0x29c564, d1Init29C564);
registerScript(0x29c56a, d1Step29C56A);
registerScript(0x29c79e, d6Init29C79E);
registerScript(0x29c7aa, d6Step29C7AA);
registerScript(0x29be72, object0_29BE72);
registerScript(0x29bee0, object1_29BEE0);
registerScript(0x29bf04, (ram, rom, ctx) => object23(ram, rom, ctx, false));
registerScript(0x29bf36, (ram, rom, ctx) => object23(ram, rom, ctx, true));
registerScript(0x29bf8a, (ram, rom, ctx) => object45(ram, rom, ctx, false));
registerScript(0x29bfd8, (ram, rom, ctx) => object45(ram, rom, ctx, true));
registerScript(0x29c06e, (ram, rom, ctx) => object67(ram, rom, ctx, false));
registerScript(0x29c0a6, (ram, rom, ctx) => object67(ram, rom, ctx, true));
registerScript(0x29c026, object8_29C026);
registerScript(0x29d03e, f3Init29D03E);
registerScript(0x29d068, f3Step29D068);
registerScript(0x29c412, main2Init29C412);
registerScript(0x29c41a, main2Step29C41A);
registerScript(0x29c766, d4_29C766);
registerScript(0x29e100, e5Init29E100);
registerScript(0x29e14c, e5Step29E14C);
registerScript(0x29c782, d5Init29C782);
registerScript(0x29c788, d5Step29C788);
registerScript(0x29d086, f6_29D086);
registerScript(0x29d0a6, f4Init29D0A6);
registerScript(0x29d0be, f4Step29D0BE);
registerScript(0x29c480, main3Init29C480);
registerScript(0x29c488, main3Step29C488);
registerScript(0x29d80a, e3Init29D80A);
registerScript(0x29d852, e3Step29D852);
registerScript(0x29d9e4, e4Init29D9E4);
registerScript(0x29da52, e4Step29DA52);
registerScript(0x29d0d4, f5Init29D0D4);
registerScript(0x29d0e2, f5Step29D0E2);
registerScript(0x29e356, e8Init29E356);
registerScript(0x29e3ba, e8Step29E3BA);
registerScript(0x29d100, f7Init29D100);
registerScript(0x29d104, f7Step29D104);
registerScript(0x29d16e, f9Init29D16E);
registerScript(0x29d180, f9Step29D180);
registerScript(0x29d138, f8Init29D138);
registerScript(0x29d146, f8Step29D146);
registerScript(0x29c5f6, d2Init29C5F6);
registerScript(0x29c606, d2Step29C606);
registerScript(0x29c660, d3Init29C660);
registerScript(0x29c672, d3Step29C672);
registerScript(0x29d296, e0Init29D296);
registerScript(0x29d29a, e0Step29D29A);
registerScript(0x29d400, e1Init29D400);
registerScript(0x29d460, e1Step29D460);
registerScript(0x29d556, e2Init29D556);
registerScript(0x29d5c6, e2Step29D5C6);
registerScript(0x29cc34, f1Init29CC34);
registerScript(0x29cc64, f1Step29CC64);
