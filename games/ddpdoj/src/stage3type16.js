// Stage-3 type $16, the wobbling paired-shot formation (W203).
// Exact local ROM closure: $266D2E..$2671E0.

import { u16, i16 } from './ram.js';
import { freeEnemy } from './initbody.js';
import { stepMovement, offScreen242684 } from './movement.js';
import { AimTables, aim64FromCaller, aim256FromCaller, slew64 } from './aim.js';
import { enqueueRegistersThroughStub } from './spritequeue.js';
import { fire as fireBullet, WriteLog } from './bullets.js';
import { scoreHit, scoreKill } from './score.js';
import { spawnEffect, B } from './effects.js';

const G = { stage: 0x813092, rankBC: 0x8130bc, scroll172: 0x813172 };
const u32 = (v) => (v >>> 0) % 0x100000000;
const aimCache = new WeakMap();
function aims(rom) {
  let t = aimCache.get(rom);
  if (!t) { t = new AimTables(rom); aimCache.set(rom, t); }
  return t;
}
function borrow8(ram, at) {
  const old = ram.u8(at);
  ram.setU8(at, old - 1);
  return old === 0;
}
// `$242684` at `$266E46` -- W451 merged this file's copy into `movement.js
// offScreen242684`.  It was the one copy that returned the NEGATION, and that
// was NOT a defect: the name said `onScreen`, the body returned on-screen, and
// the call site below inverted to match, so the arms landed where `$266E4A
// bcc.w $266E58` puts them.  It is the same routine written upside down, so it
// merges by flipping the call site back rather than by changing any arm.
function bullet(ram, rom, ctx, a5, site, entry, regs) {
  const out = fireBullet({ ram, rom, log: new WriteLog(ram) }, entry,
    { ...regs, a5 });
  ctx.bulletSpawn?.(site, out);
}

function death16(ram, rom, a5, a6, ctx, hit) {
  scoreKill(ram, rom, ctx, 0x31, hit);
  const e = spawnEffect(ram, ctx, 0x02, 0x266f5c);
  ram.setU32(e + B.nudge, ram.u32(a6 + 6));
  ram.setU32(e + B.pos, ram.u32(a6 + 2));
  ram.setU16(e + B.bucket, 0x0c);
  ram.setU16(e + B.sub12, 0);
  ram.setU16(e + B.sub14, 0);
  ram.setU16(e + B.hook, 2);
  ram.setU8(e + B.speed, ram.u8(a6 + 0x1a));
  ram.setU8(e + B.angle, (ram.u8(a6 + 0x1b) * 4) & 0xff);
  ctx.soundPost?.(0x28c2a8);
  freeEnemy(ram, a5);
}

function retarget64(ram, rom, a5, a6) {
  const r = aim64FromCaller(aims(rom), ram, a5,
    u16(ram.u16(a6 + 2) + 0x03c0), ram.u16(a6 + 4));
  if (r.carry) return false;
  ram.setU8(a5 + 0x22, slew64(ram.u8(a5 + 0x22), r.dir));
  return true;
}

function fireStage3(ram, rom, a5, a6, ctx) {
  if (!borrow8(ram, a5 + 0x24)) return;
  ram.setU8(a5 + 0x24, ram.u8(a5 + 0x25));
  const heading = ram.u8(a5 + 0x22);
  const d2 = ram.u32(a6 + 2);
  const d3 = rom.u32(0x266db4 + (((heading + 1) & 0x3e) << 1));
  bullet(ram, rom, ctx, a5, 0x26703c, 0x2813f0,
    { d0: 0x0002000c, d1: (heading + 2) & 0x3c, d2, d3, d4: 0, d5: 0 });
  bullet(ram, rom, ctx, a5, 0x26704a, 0x281442,
    { d0: 0xfffc000d, d1: (heading + 1) & 0x3e, d2, d3, d4: 0, d5: 0 });
  if (borrow8(ram, a5 + 0x26)) {
    ram.setU8(a5 + 0x26, ram.u8(a5 + 0x27));
    ram.setU8(a5 + 0x24, u16(0x10 - (ram.u16(G.rankBC) >>> 2)));
  }
}

function fireStage4(ram, rom, a5, a6, ctx) {
  if (!borrow8(ram, a5 + 0x24)) return;
  ram.setU8(a5 + 0x24, ram.u8(a5 + 0x25));
  const aimed = aim256FromCaller(aims(rom), ram, a5,
    u16(ram.u16(a6 + 2) + 0x03c0), ram.u16(a6 + 4));
  if (aimed.carry) return;
  const d1 = (aimed.dir + 4) & 0xf8;
  const d3 = rom.u32(0x266db4 + ((aimed.dir & 0xf8) >>> 1));
  bullet(ram, rom, ctx, a5, 0x2670a2, 0x281744,
    { d0: 0xfffc0007, d1, d2: ram.u32(a6 + 2), d3, d4: 0, d5: 0 });
  if (borrow8(ram, a5 + 0x26)) {
    ram.setU8(a5 + 0x26, ram.u8(a5 + 0x27));
    ram.setU8(a5 + 0x24, u16(0x0a - (ram.u16(G.rankBC) >>> 1)));
  }
}

function animateAndDraw(ram, rom, a5, a6) {
  if (borrow8(ram, a5 + 0x1c)) {
    ram.setU8(a5 + 0x1c, ram.u8(a5 + 0x1d));
    ram.setU16(a5 + 0x1a, (ram.u16(a5 + 0x1a) + 4) & 7);
  }
  const table = rom.u32(0x2670d8 + ram.u16(a5 + 0x1a));
  const heading = ram.u8(a5 + 0x22);
  const art = rom.u32(table + (((heading + 1) & 0x3e) << 1));
  enqueueRegistersThroughStub(ram, rom,
    ram.u16(G.stage) === 4 ? 0x23e056 : 0x23e08c,
    u32(ram.u32(a6 + 2) + 0xf600fa00), art, 0x0a30, ram.u8(a6 + 0x1d));
}

export function handler16(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 6);
  ram.setU16(a6 + 2, u16(ram.u16(a6 + 2) - ram.u16(a5 + 0x1e)));
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported)) return;
  // $266E46 jsr $242684 / $266E4A bcc.w $266E58 -- carry CLEAR (ON-screen) goes
  // to $266E58 `move.b #$1,($16,A5)`; carry SET falls into $266E4A+8 `tst.b
  // ($16,A5) / beq / jmp $263762`.  So the flag means HAS BEEN SEEN and the free
  // is off-screen-AFTER-on, never off-screen alone.
  if (offScreen242684(ram, a6)) {                     // $266E46 jsr / $266E4A bcc
    if (ram.u8(a5 + 0x16) !== 0) { freeEnemy(ram, a5); return; }  // $266E52 jmp $263762
  } else {
    ram.setU8(a5 + 0x16, 1);                          // $266E58 move.b #$1,($16,A5)
  }

  if (ram.u16(G.stage) !== 4) {
    const angle = ram.u8(a5 + 0x21);
    ram.setU8(a5 + 0x21, angle + 2);
    const sway = ctx.tables.shotVector(0x28, angle).dy;
    ram.setU16(a5 + 0x1e, sway);
    ram.setU16(a6 + 2, u16(ram.u16(a6 + 2) + sway));
  }

  const hit = ram.u8(a6) & 0x5c;
  if (hit === 0) ram.setU8(a6 + 0x1d, ram.u8(a5 + 0x18));
  else {
    ram.setU8(a6, ram.u8(a6) & 0xa3);
    scoreHit(ram, ctx, a6, hit);
    ram.setU8(a6 + 0x1d, ram.u8(a5 + 0x18) ^ ram.u8(a5 + 0x19));
    if (i16(ram.u16(a6 + 0x18)) < 0) {
      death16(ram, rom, a5, a6, ctx, hit);
      return;
    }
  }

  if (i16(ram.u16(a6 + 2)) > 0x1400) {
    let canFire = true;
    if (ram.u8(a5 + 0x26) === ram.u8(a5 + 0x27))
      canFire = retarget64(ram, rom, a5, a6);
    if (canFire) {
      if (ram.u16(G.stage) === 4) fireStage4(ram, rom, a5, a6, ctx);
      else fireStage3(ram, rom, a5, a6, ctx);
    }
  }
  animateAndDraw(ram, rom, a5, a6);
}
