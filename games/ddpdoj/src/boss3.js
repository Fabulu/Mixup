// Stage-3 boss type $A0 entry, damage controller, and arrival bootstrap (W204).
// Physical family envelope: $29BBF4..$29EC7A. This delivery owns the exact
// entry/controller and the first live scheduler closure through MAIN0, D7 and
// A2 object 9. Later boss phases stay loud until their own translated slices.

import { u16, i32 } from './ram.js';
import { freeEnemy } from './initbody.js';
import { scoreHit } from './score.js';
import { livePlayers2428A6 } from './boss.js';
import { applyVelocity } from './movement.js';
import { loadAnimObjects246410 } from './animobjects.js';
import { enqueueRegistersThroughStub } from './spritequeue.js';
import { runStageAdvance242952 } from './stageend.js';
import {
  runScheduler25962E, registerScript, seqStart2598D0, a3Start259962,
  a3Running2599B4, a3Stop2599EC, a4Start25980C, a4Clear2598A2,
  a4Stop259876, a1Clear259B34, a2Run2598E6, a2Stop25994A,
} from './scheduler.js';

const note = (ctx, addr, what) => (ctx.unportedLog ?? ctx.unported)?.note(addr, what);
const due8 = (ram, addr) => {
  const old = ram.u8(addr);
  ram.setU8(addr, old - 1);
  return old === 0;
};

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
