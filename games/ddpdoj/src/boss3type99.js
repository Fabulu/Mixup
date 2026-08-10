// Stage-3 boss low-HP child type $99. Its init falls directly into the
// handler in the cartridge, so this module owns both entry points and lets the
// init-body dispatcher preserve that same-spawn movement/animation/draw call.

import { u16, i16 } from './ram.js';
import { loadRecordProto, loadSubProto } from './enemyproto.js';
import { AimTables, aim256FromCaller } from './aim.js';
import { fire as fireBullet, WriteLog } from './bullets.js';
import { spawnEffect } from './effects.js';
import { enqueueThroughStub } from './spritequeue.js';

const AIM_TABLES = new WeakMap();
function aims(rom) {
  let t = AIM_TABLES.get(rom);
  if (!t) { t = new AimTables(rom); AIM_TABLES.set(rom, t); }
  return t;
}

function free99(ram, a5) {
  const a6 = ram.u32(a5 + 0x06);
  for (let i = 0; i <= ram.u16(a5 + 0x04); i++) ram.setU8(a6 + i * 0x20, 1);
  ram.setU16(a5, 0);
}

function shoot99(ram, rom, ctx, site, regs) {
  const result = fireBullet({ ram, rom, log: new WriteLog(ram) }, 0x2816f6, regs);
  ctx.bulletSpawn?.(site, result);
}

function move99(ram, ctx, a6) {
  if (ram.u16(0x8130d2) !== 0) return;
  const v = ctx.tables.shotVector(ram.u8(a6 + 0x1a), ram.u8(a6 + 0x1b));
  ram.setU16(a6 + 0x02, ram.u16(a6 + 0x02) + v.dy);
  ram.setU16(a6 + 0x04, ram.u16(a6 + 0x04) + v.dx);
}

function death99(ram, ctx, a5, a6) {
  for (const [site, nudge, delay] of [
    [0x29e8be, 0x0600, 4], [0x29e8f8, 0x0000, 2], [0x29e932, 0xfa00, 0],
  ]) {
    const e = spawnEffect(ram, ctx, 0x0a, site);
    ram.setU32(e + 0x02, ram.u32(a6 + 0x02));
    ram.setU16(e + 0x1e, 0x0c);
    ram.setU16(e + 0x12, 0);
    ram.setU16(e + 0x14, 0x0400);
    ram.setU16(e + 0x1a, ram.u16(a6 + 0x1a));
    ram.setU16(e + 0x26, nudge);
    ram.setU16(e + 0x28, 0);
    ram.setU16(e + 0x18, delay);
  }
  ctx.soundPost?.(0x28c28e);
  free99(ram, a5);
}

function dueByte(ram, addr) {
  const old = ram.u8(addr);
  ram.setU8(addr, old - 1);
  return old === 0;
}

/** `$29E6B0`, the complete linked child handler. */
export function handler99_29E6B0(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  if (ram.u8(a6 + 0x1e) !== 0) ram.setU8(a6 + 0x1e, ram.u8(a6 + 0x1e) - 1);
  if ((ram.u8(0x8130f8) & 0x40) !== 0) { death99(ram, ctx, a5, a6); return; }

  move99(ram, ctx, a6);
  const inRange = u16(ram.u16(a6 + 0x02) + 0x1000) + 0x7000 <= 0xffff;
  if (inRange) ram.setU8(a5 + 0x16, 1);
  else if (ram.u8(a5 + 0x16) !== 0) { free99(ram, a5); return; }
  ram.setU32(a6 + 0x22, ram.u32(a6 + 0x02));

  const hit = (ram.u8(a6) | ram.u8(a6 + 0x20)) & 0x5c;
  let palette;
  if (hit === 0) {
    palette = ram.u8(a5 + 0x1c);
    if (ram.u16(a6 + 0x18) < 0x0180 && ram.u16(0x8130ca) === 0) palette = 0x19;
  } else {
    ram.setU8(a6, ram.u8(a6) & 0xa3);
    ram.setU8(a6 + 0x20, ram.u8(a6 + 0x20) & 0xa3);
    ram.setU8(a6 + 0x1e, 2);
    const damage = (hit & 0x04) !== 0 ? 2 : 1;
    ram.setU8(a6 + 0x1a, ram.u8(a6 + 0x1a) - damage);
    if (((ram.u8(a6 + 0x1a) << 24) >> 24) < 3) ram.setU8(a6 + 0x1a, 3);
    palette = ram.u8(a6 + 0x1d) === 0x19
      ? ram.u8(a5 + 0x1c) : ram.u8(a6 + 0x1d);
    palette ^= ram.u8(a5 + 0x1d);
    const hp = i16(ram.u16(a6 + 0x18)) <= i16(ram.u16(a6 + 0x38))
      ? ram.u16(a6 + 0x18) : ram.u16(a6 + 0x38);
    ram.setU16(a6 + 0x18, hp);
    ram.setU16(a6 + 0x38, hp);
    if (i16(hp) < 0) { death99(ram, ctx, a5, a6); return; }
  }
  ram.setU8(a6 + 0x1d, palette);

  if (ram.u16(a5 + 0x18) !== 0) {
    if (dueByte(ram, a5 + 0x2c)) {
      ram.setU8(a5 + 0x2c, ram.u8(a5 + 0x2d));
      ram.setU32(a6 + 0x0a, rom.u32(0x29e976 + ram.u16(a5 + 0x2e)));
      const old = ram.u16(a5 + 0x2e);
      ram.setU16(a5 + 0x2e, old - 4);
      if (old < 4) ram.setU16(a5 + 0x2e, 0x1c);
    }
    if (dueByte(ram, a5 + 0x24)) {
      ram.setU8(a5 + 0x24, ram.u8(a5 + 0x25));
      if (ram.u8(a6 + 0x1a) < 0x12) ram.setU8(a6 + 0x1a, ram.u8(a6 + 0x1a) + 1);
    }
  } else if (dueByte(ram, a5 + 0x28)) {
    ram.setU8(a5 + 0x28, ram.u8(a5 + 0x29));
    ram.setU32(a6 + 0x0a, rom.u32(0x29bf6a + ram.u16(a5 + 0x2a)));
    const cursor = u16(ram.u16(a5 + 0x2a) + 4);
    ram.setU16(a5 + 0x2a, cursor);
    if (cursor === 0x20) {
      ram.setU32(a6 + 0x06, 0xee00fc00);
      ram.setU16(a6 + 0x0e, 0x1220);
      ram.setU16(a6 + 0x1a, ram.u16(a5 + 0x34));
      ram.setU16(a5 + 0x18, 1);
      if (dueByte(ram, a5 + 0x2c)) {
        ram.setU8(a5 + 0x2c, ram.u8(a5 + 0x2d));
        ram.setU32(a6 + 0x0a, rom.u32(0x29e976 + ram.u16(a5 + 0x2e)));
        const old = ram.u16(a5 + 0x2e);
        ram.setU16(a5 + 0x2e, old - 4);
        if (old < 4) ram.setU16(a5 + 0x2e, 0x1c);
      }
    }
  }

  enqueueThroughStub(ram, rom, 0x23d852, a6);
  if (ram.u16(a5 + 0x18) === 0 || ram.u32(0x8130d2) !== 0
      || i16(ram.u16(a6 + 0x02)) < 0x1200 || !dueByte(ram, a5 + 0x1e)) return;
  ram.setU8(a5 + 0x1e, ram.u8(a5 + 0x22));
  let row = 0x29e996 + ram.u16(a5 + 0x26);
  for (let n = 0; n < 2; n++, row += 6) {
    const selfX = u16(ram.u16(a6 + 0x04) + rom.u16(row + 4));
    const aimed = aim256FromCaller(aims(rom), ram, a5,
      u16(ram.u16(a6 + 0x02) + rom.u16(row + 2)),
      selfX);
    // Only the first `$24226E` has a carry exit. The second deliberately
    // falls through with D1 still holding the caller's self-X word.
    if (n === 0 && aimed.carry) break;
    shoot99(ram, rom, ctx, n === 0 ? 0x29e85c : 0x29e884, {
      d0: ram.u32(a5 + 0x30), d1: aimed.carry ? selfX : aimed.dir,
      d2: ram.u32(a6 + 0x02),
      d3: rom.u32(row + 2), d4: 0, d5: rom.u16(row),
    });
  }
  const oldCursor = ram.u16(a5 + 0x26);
  ram.setU16(a5 + 0x26, oldCursor - 0x0c);
  if (oldCursor < 0x0c) ram.setU16(a5 + 0x26, 0x60);
  if (dueByte(ram, a5 + 0x20)) {
    ram.setU8(a5 + 0x20, ram.u8(a5 + 0x21));
    ram.setU8(a5 + 0x1e, ram.u8(a5 + 0x1f));
    const old = ram.u8(a6 + 0x01);
    ram.setU8(a6 + 0x01, old ^ 0x40);
    if ((old & 0x40) !== 0) ram.setU8(a5 + 0x1e, ram.u8(a5 + 0x22));
  }
}

/** `$29E580`, including its literal fall-through into `$29E6B0`. */
export function initType99_29E580(ram, rom, a5, a6, ctx) {
  loadSubProto(ram, rom, a5, a6, 0x29e678);
  ram.setU32(a6 + 0x02, ram.u32(a5 + 0x16));
  ram.setU16(a6 + 0x1c, ram.u16(a5 + 0x1a));
  loadRecordProto(ram, rom, a5, 0x29e65a, 0x0e);
  ram.setU8(a5 + 0x1e, ram.u8(a5 + 0x1e) + ram.u8(a5 + 0x36));
  const row = 0x29e63a;
  ram.setU8(a5 + 0x1e, rom.u8(row));
  ram.setU8(a5 + 0x1f, rom.u8(row + 1));
  ram.setU8(a5 + 0x22, rom.u8(row + 2));
  ram.setU8(a5 + 0x25, rom.u8(row + 3));
  ram.setU16(a5 + 0x30, rom.u16(row + 4));
  ram.setU16(a6 + 0x18, rom.u16(row + 6));
  ram.setU16(a6 + 0x38, rom.u16(row + 6));
  if (ram.u16(0x813098) !== 0) {
    ram.setU8(a5 + 0x22, 0x0d);
    ram.setU16(a5 + 0x30, 1);
  }
  handler99_29E6B0(ram, rom, a5, ctx);
}
