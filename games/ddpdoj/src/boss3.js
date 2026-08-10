// Stage-3 boss type $A0 entry, damage controller, and arrival bootstrap (W204).
// Physical family envelope: $29BBF4..$29EC7A. This delivery owns the exact
// entry/controller and the first live scheduler closure through MAIN0, D7 and
// A2 object 9. Later boss phases stay loud until their own translated slices.

import { u16, i32 } from './ram.js';
import { freeEnemy } from './initbody.js';
import { scoreHit } from './score.js';
import { livePlayers2428A6 } from './boss.js';
import { applyVelocity } from './movement.js';
import { AimTables, aim64, aim256FromCaller, slew64, targetSelect } from './aim.js';
import { drawByte242B3C } from './rng.js';
import { fire as fireBullet, WriteLog } from './bullets.js';
import { loadAnimObjects246410 } from './animobjects.js';
import { enqueueRegistersThroughStub } from './spritequeue.js';
import { runStageAdvance242952 } from './stageend.js';
import {
  runScheduler25962E, registerScript, seqStart2598D0, a3Start259962,
  a3Running2599B4, a3Stop2599EC, a4Start25980C, a4Clear2598A2,
  a4Stop259876, a1Clear259B34, a2Run2598E6, a2Stop25994A,
  a1Start259A18, a1Running259A4A, a1Stop259B08, spread2595F2,
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
  note(ctx, 0x253564, '$29CAAC stage-3 boss death clamp');
  note(ctx, 0x242922, '$29CAB2 stage-3 boss death intervention');
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
