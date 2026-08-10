// Stage-3 type $15 carrier and its spawned type $17/$18 children (W200).
// Exact contiguous ROM family: $265BEC..$266960.

import { u16, i16 } from './ram.js';
import { freeEnemy } from './initbody.js';
import { stepMovement, applyVelocity } from './movement.js';
import { AimTables, aim256FromCaller } from './aim.js';
import { enqueueRegistersThroughStub } from './spritequeue.js';
import { fire as fireBullet, WriteLog } from './bullets.js';
import { scoreHit, scoreKill } from './score.js';
import { spawnEffect, B } from './effects.js';
import { armScreenClear243E02 } from './midboss.js';

const u32 = (v) => (v >>> 0) % 0x100000000;
const G = { freeze: 0x8130d2 };
const aimsByRom = new WeakMap();
function aims(rom) {
  let t = aimsByRom.get(rom);
  if (!t) { t = new AimTables(rom); aimsByRom.set(rom, t); }
  return t;
}
function borrow8(ram, at) {
  const old = ram.u8(at); ram.setU8(at, old - 1); return old === 0;
}
function bullet(ram, rom, ctx, a5, site, entry, regs) {
  const out = fireBullet({ ram, rom, log: new WriteLog(ram) }, entry,
    { ...regs, a5 });
  ctx.bulletSpawn?.(site, out);
}
function slew256Value(current, target) {
  const delta = (target - current) & 0xff;
  if (delta === 0) return current & 0xff;
  return (current + (delta < 0x80 ? 1 : -1)) & 0xff;
}

// ---------------------------------------------------------------- type $15

function inside15(pos) {
  const y = i16(pos >>> 16), x = i16(pos & 0xffff);
  return x < 0x6000 && x > i16(0xd800) && y > i16(0xc400);
}
function visible15(pos, low, highLow, high, highHigh) {
  const y = i16(pos >>> 16), x = i16(pos & 0xffff);
  return x > i16(low) && x < highLow && y > i16(high) && y < highHigh;
}
function draw15Part(ram, rom, a6, art, delta, size, stub,
  low, highLow, high, highHigh) {
  const pos = u32(ram.u32(a6 + 2) + delta);
  if (!visible15(pos, low, highLow, high, highHigh)) return;
  enqueueRegistersThroughStub(ram, rom, stub, pos, art, size,
    ram.u8(a6 + 0x1d));
}
function draw15LowWordPart(ram, rom, a6, art, subtractX, size, stub,
  low, highLow, high, highHigh) {
  const root = ram.u32(a6 + 2);
  const pos = ((root & 0xffff0000) | u16(root - subtractX)) >>> 0;
  if (!visible15(pos, low, highLow, high, highHigh)) return;
  enqueueRegistersThroughStub(ram, rom, stub, pos, art, size,
    ram.u8(a6 + 0x1d));
}
export function handler15(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 6);
  if (inside15(ram.u32(a6 + 2))) ram.setU8(a5 + 0x16, 1);
  else if (ram.u8(a5 + 0x16) !== 0) { freeEnemy(ram, a5); return; }
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported)) return;
  draw15LowWordPart(ram, rom, a6, 0x28ea40, 0x2800, 0x1ea0, 0x23dfb4,
    0xd800, 0x3900, 0xc400, 0x7000);
  draw15Part(ram, rom, a6, 0x28f3a4, 0, 0x1ea0, 0x23dfb4,
    0xd800, 0x3900, 0xc400, 0x7000);
  draw15Part(ram, rom, a6, 0x28fd08, -0x2c002000, 0x2090, 0x23e020,
    0xdc00, 0x3900, 0xc000, 0x7000);
  draw15Part(ram, rom, a6, 0x29060c, -0x2bfffc00, 0x2090, 0x23e020,
    0xdc00, 0x3900, 0xc000, 0x7000);
}

// -------------------------------------------------------- shared $17 / $18

function deathRows(ram, rom, a5, a6, ctx) {
  let state = ram.u16(a5 + 0x2e);
  if (state === 0) return;
  if (state === 1) {
    ram.setU16(a5 + 0x2e, 2);
    ram.setU16(a5 + 0x30, 0);
    ram.setU16(a5 + 0x32, 3);
    ram.setU16(a5 + 0x34, 0);
    ctx.soundPost?.(0x28c2dc);
    state = 2;
  }
  ram.setU16(a6 + 2, u16(ram.u16(a6 + 2) - 0x26));
  if (state !== 2 || !borrow8(ram, a5 + 0x32)) return;
  ram.setU8(a5 + 0x32, ram.u8(a5 + 0x33));
  const row = 0x2666d6 + ram.u16(a5 + 0x30);
  const e = spawnEffect(ram, ctx, rom.u16(row + 2), 0x26664a);
  ram.setU8(e + B.f1c, rom.u16(row + 4));
  ram.setU16(e + B.delay, rom.u16(row));
  ram.setU32(e + B.nudge, rom.u32(row + 6));
  ram.setU32(e + B.pos, ram.u32(a6 + 2));
  ram.setU16(e + B.bucket, 0x0c);
  ram.setU16(e + B.sub12, 0);
  ram.setU16(e + B.sub14, 0);
  const cursor = ram.u16(a5 + 0x30) + 0x0c;
  ram.setU16(a5 + 0x30, cursor);
  if (cursor < 0x54) return;
  ram.setU16(a5 + 0x32, 0x0601);
  ram.setU16(a5 + 0x30, 0);
  ram.setU8(a6 + 0x1f, 1);
  ram.setU16(a5 + 0x34, ram.u16(a5 + 0x34) + 1);
  ram.setU16(a5 + 0x2e, 0);
}

function damageChild(ram, rom, a5, a6, ctx, score, linger, clearLatch) {
  const hit = ram.u8(a6) & 0x5c;
  if (hit === 0) {
    ram.setU8(a6 + 0x1d, ram.u8(a5 + 0x18));
    return;
  }
  ram.setU8(a6, ram.u8(a6) & 0xa3);
  scoreHit(ram, ctx, a6, hit);
  ram.setU8(a6 + 0x1d, ram.u8(a6 + 0x1d) ^ ram.u8(a5 + 0x19));
  if (ram.u8(a5 + 0x17) !== 2) ram.setU16(a6 + 0x18, 0x2400);
  if (i16(ram.u16(a6 + 0x18)) >= 0) return;
  ram.setU16(a5 + 0x36, linger);
  ram.setU16(a5 + 0x38, hit);
  scoreKill(ram, rom, ctx, score, hit);
  if (clearLatch) ram.setU16(0x803934, 0);
  ram.setU16(a6, 0x8000);
  ram.setU16(a5 + 0x2e, 1);
  ram.setU8(a6 + 0x1d, ram.u8(a5 + 0x18));
}

function accelerate(ram, a5, a6, threshold, clearLatch) {
  const y = i16(ram.u16(a6 + 2));
  if (y >= 0 && y <= threshold) ram.setU8(a5 + 0x22, 1);
  if (ram.u8(a5 + 0x22) === 0) return false;
  if (ram.u8(a5 + 0x23) !== 0) ram.setU8(a5 + 0x23, ram.u8(a5 + 0x23) - 1);
  if (borrow8(ram, a5 + 0x24)) {
    ram.setU8(a5 + 0x24, ram.u8(a5 + 0x25));
    if (ram.u16(a5 + 0x26) < 0x80)
      ram.setU16(a5 + 0x26, ram.u16(a5 + 0x26) + 1);
  }
  ram.setU16(a6 + 2, u16(ram.u16(a6 + 2) + ram.u16(a5 + 0x26)));
  if (ram.u16(a6 + 2) < 0x9800) return false;
  if (clearLatch) ram.setU16(0x803934, 0);
  freeEnemy(ram, a5);
  return true;
}

function advancePhase(ram, a5, a6) {
  if (ram.u8(a5 + 0x17) === 0) {
    const y = i16(ram.u16(a6 + 2));
    if (y >= 0 && y <= 0x6600) ram.setU8(a5 + 0x17, 1);
  }
  if (ram.u8(a5 + 0x17) === 1 && borrow8(ram, a5 + 0x20)) {
    ram.setU8(a5 + 0x20, ram.u8(a5 + 0x21));
    const art = ram.u16(a5 + 0x1e) + 4;
    ram.setU16(a5 + 0x1e, art);
    if (art >= 0x3c) ram.setU8(a5 + 0x17, 2);
  }
}

function finishPattern(ram, a5, wrap) {
  ram.setU16(a5 + 0x2c, 0);
  const next = ram.u16(a5 + 0x2a) + 1;
  ram.setU16(a5 + 0x2a, next === wrap ? 0 : next);
}

function pattern17A(ram, rom, a5, a6, ctx, init) {
  if (init) {
    let r = aim256FromCaller(aims(rom), ram, a5,
      u16(ram.u16(a6 + 2) + 0xfd00), ram.u16(a6 + 4));
    if (r.carry) return;
    ram.setU8(a6 + 0x31, r.dir - 0x40);
    r = aim256FromCaller(aims(rom), ram, a5,
      u16(ram.u16(a6 + 2) + 0xf500), ram.u16(a6 + 4));
    ram.setU8(a6 + 0x30, r.dir + 0x38);
    ram.setU16(a6 + 0x28, 0x0004);
    ram.setU16(a6 + 0x2c, 8);
  }
  if (!borrow8(ram, a6 + 0x28)) return;
  ram.setU8(a6 + 0x28, ram.u8(a6 + 0x29));
  const regs = { d0: 0x00040007, d2: ram.u32(a6 + 2), d4: 0, d5: 0 };
  for (const [site, d3] of [[0x26616e, 0xfd000000],
    [0x26617a, 0xfcffff00], [0x266186, 0xfd000100]])
    bullet(ram, rom, ctx, a5, site, 0x2817b8,
      { ...regs, d1: ram.u8(a6 + 0x31), d3 });
  ram.setU8(a6 + 0x31, ram.u8(a6 + 0x31) + 0x14);
  for (const [site, d3] of [[0x26619c, 0xf5000000],
    [0x2661a8, 0xf4ffff00], [0x2661b4, 0xf5000100]])
    bullet(ram, rom, ctx, a5, site, 0x2817b8,
      { ...regs, d1: ram.u8(a6 + 0x30), d3 });
  ram.setU8(a6 + 0x30, ram.u8(a6 + 0x30) - 0x14);
  ram.setU16(a6 + 0x2c, ram.u16(a6 + 0x2c) - 1);
  if (ram.u16(a6 + 0x2c) === 0) finishPattern(ram, a5, 4);
}

function pattern17B(ram, rom, a5, a6, ctx, init) {
  if (init) {
    let r = aim256FromCaller(aims(rom), ram, a5, ram.u16(a6 + 2), ram.u16(a6 + 4));
    if (r.carry) return;
    ram.setU8(a6 + 0x2f, r.dir);
    ram.setU8(a6 + 0x31, r.dir - 0x30);
    r = aim256FromCaller(aims(rom), ram, a5, ram.u16(a6 + 2), ram.u16(a6 + 4));
    ram.setU8(a6 + 0x2e, r.dir);
    ram.setU8(a6 + 0x30, r.dir + 0x30);
    ram.setU16(a6 + 0x28, 0x0002);
    ram.setU16(a6 + 0x2c, 0x16);
  }
  if (!borrow8(ram, a6 + 0x28)) return;
  ram.setU8(a6 + 0x28, ram.u8(a6 + 0x29));
  for (let n = 0; n < 2; n++) {
    ram.setU8(a6 + 0x31, slew256Value(ram.u8(a6 + 0x31), ram.u8(a6 + 0x2f)));
    ram.setU8(a6 + 0x30, slew256Value(ram.u8(a6 + 0x30), ram.u8(a6 + 0x2e)));
  }
  const common = { d0: 0x00160007, d2: ram.u32(a6 + 2), d4: 0, d5: 0 };
  let d1 = ram.u8(a6 + 0x31);
  bullet(ram, rom, ctx, a5, 0x2662e8, 0x2816f6,
    { ...common, d1, d3: 0x078005c0 });
  bullet(ram, rom, ctx, a5, 0x2662f0, 0x281708,
    { ...common, d1: u16(d1 + 6), d3: 0x078005c0 });
  d1 = ram.u8(a6 + 0x30);
  bullet(ram, rom, ctx, a5, 0x266300, 0x2816f6,
    { ...common, d1, d3: 0x077ffa40 });
  bullet(ram, rom, ctx, a5, 0x266308, 0x281708,
    { ...common, d1: u16(d1 - 6), d3: 0x077ffa40 });
  ram.setU16(a6 + 0x2c, ram.u16(a6 + 0x2c) - 1);
  if (ram.u16(a6 + 0x2c) === 0) finishPattern(ram, a5, 4);
}

function attack17(ram, rom, a5, a6, ctx) {
  let phase = ram.u16(a5 + 0x2c);
  const init = phase === 1;
  if (phase !== 2) ram.setU16(a5 + 0x2c, phase + 1);
  const pattern = ram.u16(a5 + 0x2a) & 1;
  if (pattern === 0) pattern17A(ram, rom, a5, a6, ctx, init);
  else pattern17B(ram, rom, a5, a6, ctx, init);
}

function drawChild(ram, rom, a5, a6, table, delta, size) {
  if (ram.u8(a6 + 0x1f) !== 0) return;
  enqueueRegistersThroughStub(ram, rom,
    ram.u8(a5 + 0x23) === 0 ? 0x23df58 : 0x23defc,
    u32(ram.u32(a6 + 2) + delta), rom.u32(table + ram.u16(a5 + 0x1e)),
    size, ram.u8(a6 + 0x1d));
}

export function handler17(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 6);
  applyVelocity(ram, ctx.tables, a5);
  damageChild(ram, rom, a5, a6, ctx, 0x234, 0x58, true);
  deathRows(ram, rom, a5, a6, ctx);
  if (ram.u16(a5 + 0x36) !== 0) {
    armScreenClear243E02(ram, ctx, ram.u16(a5 + 0x38), 'type $17 death $265F02');
    ram.setU16(a5 + 0x36, ram.u16(a5 + 0x36) - 1);
    if (ram.u16(a5 + 0x36) === 0) { freeEnemy(ram, a5); return; }
    if (ram.u16(a5 + 0x2e) === 0) return;
    drawChild(ram, rom, a5, a6, 0x26605a, 0xd800f200, 0x2870);
    return;
  }
  if (ram.u16(G.freeze) === 0 && ram.u16(a5 + 0x2e) === 0) {
    if (accelerate(ram, a5, a6, 0x6400, true)) return;
    advancePhase(ram, a5, a6);
    if (ram.u8(a5 + 0x17) === 2) {
      if (ram.u16(a5 + 0x2c) === 0 && borrow8(ram, a5 + 0x28)) {
        ram.setU8(a5 + 0x28, ram.u8(a5 + 0x29));
        ram.setU16(a5 + 0x2c, 1);
      }
      if (ram.u16(a5 + 0x2c) !== 0) attack17(ram, rom, a5, a6, ctx);
    }
  }
  drawChild(ram, rom, a5, a6, 0x26605a, 0xd800f200, 0x2870);
}

// ---------------------------------------------------------------- type $18

function aux18(ram, rom, a5, a6, ctx) {
  if (ram.u8(a6 + 0x46) === 0) {
    ram.setU8(a6 + 0x46, 1);
    for (let i = 0; i < 6; i++) ram.setU32(a6 + 0x66 + i * 4, 0x00000004);
    ram.setU16(a6 + 0x48, 8);
    ram.setU16(a6 + 0x4a, 0);
  }
  if (borrow8(ram, a6 + 0x48)) {
    ram.setU8(a6 + 0x48, ram.u8(a6 + 0x49));
    const slot = a6 + 0x66 + ram.u16(a6 + 0x4a);
    ram.setU8(slot, 4); ram.setU16(slot + 2, 4);
    ram.setU16(a6 + 0x4a, (ram.u16(a6 + 0x4a) + 4) % 0x18);
  }
  for (let i = 0; i < 6; i++) {
    const slot = a6 + 0x66 + i * 4;
    if (ram.u8(slot) === 0 || !borrow8(ram, slot + 2)) continue;
    ram.setU8(slot + 2, ram.u8(slot + 3));
    const idx = 5 - i;
    bullet(ram, rom, ctx, a5, 0x2667cc, 0x281764,
      { d0: 5, d1: rom.u8(0x2667f6 + idx), d2: ram.u32(a6 + 2),
        d3: rom.u32(0x2667de + idx * 4), d4: 0, d5: 0 });
    ram.setU8(slot, ram.u8(slot) - 1);
  }
}

function attack18(ram, rom, a5, a6, ctx) {
  const init = ram.u16(a5 + 0x2c) === 1;
  if (ram.u16(a5 + 0x2c) !== 2)
    ram.setU16(a5 + 0x2c, ram.u16(a5 + 0x2c) + 1);
  if (init) {
    ram.setU16(a6 + 0x26, 2);
    ram.setU16(a6 + 0x28, 0x0e);
    ram.setU16(a6 + 0x2c, 4);
    const r = aim256FromCaller(aims(rom), ram, a5,
      ram.u16(a6 + 2), ram.u16(a6 + 4));
    ram.setU8(a6 + 0x2e, r.carry ? ram.u8(a6 + 4) : r.dir);
  }
  if (!borrow8(ram, a6 + 0x26)) return;
  ram.setU8(a6 + 0x26, ram.u8(a6 + 0x27));
  const r = aim256FromCaller(aims(rom), ram, a5,
    ram.u16(a6 + 2), ram.u16(a6 + 4));
  const old = ram.u8(a6 + 0x2e);
  const target = r.carry ? ram.u8(a6 + 4) : r.dir;
  const dir = slew256Value(old, target);
  ram.setU8(a6 + 0x2e, dir);                           // $2421B0 returns D0 = D1
  let speed = ram.u16(a6 + 0x2c);
  const d0 = ((speed << 16) | 7) >>> 0;
  ram.setU16(a6 + 0x2c, speed + 4);
  for (const d3 of [0x133ffd00, 0x13400300, 0x13400640, 0x133ff9c0])
    bullet(ram, rom, ctx, a5, 0x2668c4, 0x281708,
      { d0, d1: dir, d2: ram.u32(a6 + 2), d3, d4: 0, d5: 0 });
  ram.setU16(a6 + 0x28, ram.u16(a6 + 0x28) - 1);
  if (ram.u16(a6 + 0x28) === 0) finishPattern(ram, a5, 2);
}

export function handler18(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 6);
  applyVelocity(ram, ctx.tables, a5);
  damageChild(ram, rom, a5, a6, ctx, 0x563, 0x60, false);
  deathRows(ram, rom, a5, a6, ctx);
  if (ram.u16(a5 + 0x36) !== 0) {
    armScreenClear243E02(ram, ctx, ram.u16(a5 + 0x38), 'type $18 death $266456');
    ram.setU16(a5 + 0x36, ram.u16(a5 + 0x36) - 1);
    if (ram.u16(a5 + 0x36) === 0) { freeEnemy(ram, a5); return; }
    if (ram.u16(a5 + 0x2e) === 0) return;
    drawChild(ram, rom, a5, a6, 0x2665aa, 0xd600f000, 0x2a80);
    return;
  }
  if (ram.u16(G.freeze) === 0 && ram.u16(a5 + 0x2e) === 0) {
    if (accelerate(ram, a5, a6, 0x5a00, false)) return;
    advancePhase(ram, a5, a6);
    if (ram.u8(a5 + 0x17) === 2) {
      aux18(ram, rom, a5, a6, ctx);
      if (ram.u16(a5 + 0x2c) === 0 && borrow8(ram, a5 + 0x28)) {
        ram.setU8(a5 + 0x28, ram.u8(a5 + 0x29));
        ram.setU16(a5 + 0x2c, 1);
      }
      if (ram.u16(a5 + 0x2c) !== 0) attack18(ram, rom, a5, a6, ctx);
    }
  }
  drawChild(ram, rom, a5, a6, 0x2665aa, 0xd600f000, 0x2a80);
}
