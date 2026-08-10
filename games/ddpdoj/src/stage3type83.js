// Stage-3 type $83, the linked-hitbox aimed-ring enemy (W202).
// Exact local ROM closure: $274B6C..$27514C.

import { u16, i16 } from './ram.js';
import { freeEnemy } from './initbody.js';
import { stepMovement } from './movement.js';
import { AimTables, AIM, aim256, targetSelect } from './aim.js';
import { enqueueRegistersThroughStub, enqueueThroughStub } from './spritequeue.js';
import { fire as fireBullet, WriteLog } from './bullets.js';
import { scoreHit, scoreKill } from './score.js';
import { spawnEffect, B } from './effects.js';
import { spawnCues28AC72 } from './cues.js';
import { drawByte2431F4 } from './rng.js';

const G = {
  stage: 0x813092, rank98: 0x813098, freeze: 0x8130d2,
  scroll172: 0x813172, criticalGate: 0x8130ca,
};
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
function addPackedWords(pos, dy, dx) {
  return ((u16((pos >>> 16) + dy) << 16) | u16(pos + dx)) >>> 0;
}
function bullet(ram, rom, ctx, a5, site, entry, regs) {
  const out = fireBullet({ ram, rom, log: new WriteLog(ram) }, entry,
    { ...regs, a5 });
  ctx.bulletSpawn?.(site, out);
}

function outside83(ram, a6) {
  let low = u16(ram.u16(a6 + 4) + 0x1600);
  low = u16(low + ram.u16(G.scroll172));
  const lowSum = low + 0x9c00;
  if (lowSum > 0xffff) return true;
  const high = u16(ram.u16(a6 + 2) + 0x1200);
  return high + 0x7600 > 0xffff;
}

function minimumPlayerXDistance(ram, enemyX) {
  let best = 0xffff;
  for (const p of [AIM.selP1, AIM.selP2]) {
    if ((ram.u16(p) & 0x8000) === 0) continue;
    const delta = u16(enemyX - ram.u16(p + 4));
    const distance = delta & 0x8000 ? u16(-delta) : delta;
    if (distance < best) best = distance;
  }
  return best;
}

function fireAimedFive(ram, rom, a5, a6, ctx) {
  const selected = targetSelect(ram, a5);
  if (selected.carry) return;
  let d1 = u16(aim256(aims(rom),
    u16(ram.u16(a6 + 2) + 0xfe00), ram.u16(a6 + 4),
    ram.u16(selected.addr + 2), ram.u16(selected.addr + 4)) - 0x14);
  const d2 = ram.u32(a6 + 2);
  const d5 = 0xfe000000;
  for (let n = 0; n < 5; n++, d1 = u16(d1 + 0x0a)) {
    const d3 = u32(rom.u32(0x2735fa + ((d1 + 2) & 0xfc)) + d5);
    bullet(ram, rom, ctx, a5, 0x274e22, 0x2817b8,
      { d0: 0xfffd000b, d1, d2, d3, d4: 0, d5 });
  }
}

function ringShot(ram, rom, a5, ctx, site, entry,
  d0, d1, vectorAngle, d2, d6, table) {
  const d3 = u32(rom.u32(table + ((vectorAngle + 2) & 0xfc)) + d6);
  bullet(ram, rom, ctx, a5, site, entry, { d0, d1, d2, d3, d4: 0, d5: 0 });
}

function fireRings(ram, rom, a5, a6, ctx) {
  const d2 = ram.u32(a6 + 2);
  const run = (table, d6, sites, base, secondDelta, thirdDelta, tailDelta) => {
    let d0 = 0xfffa0004;
    for (let d7 = 5; d7 >= 0; d7--) {
      let d1 = (drawByte2431F4(ram, rom) + base) & 0xff;
      ringShot(ram, rom, a5, ctx, sites[0], 0x2816f6,
        d0, d1, d1, d2, d6, table);
      if (d7 <= 4) {
        const vectorAngle = d1;
        d1 = (d1 + secondDelta) & 0xff;
        ringShot(ram, rom, a5, ctx, sites[1], 0x281764,
          d0, d1, vectorAngle, d2, d6, table);
      }
      if (d7 <= 3) {
        const vectorAngle = d1;
        d1 = (d1 + thirdDelta) & 0xff;
        ringShot(ram, rom, a5, ctx, sites[2], 0x2816f6,
          d0, d1, vectorAngle, d2, d6, table);
        d1 = (d1 + tailDelta) & 0xff; // literal live register tail
      }
      d0 = u32(d0 + 0x00040000);
    }
  };
  run(0x2734fa, 0xffff0540, [0x274f76, 0x274f96, 0x274fb6],
    0x7e, 0xf0, 0xf0, 0x20);
  run(0x2734fa, 0xfffffac0, [0x274fea, 0x27500a, 0x27502a],
    0x7f, 0x10, 0x10, 0xe0);
}

function death83(ram, rom, a5, a6, ctx, hit) {
  scoreKill(ram, rom, ctx, 0x0320, hit);
  ctx.soundPost?.(0x28c2dc);
  const make = (kind, site, nudge, speed, sub14 = 0) => {
    const e = spawnEffect(ram, ctx, kind, site);
    ram.setU32(e + B.pos, ram.u32(a6 + 2));
    ram.setU16(e + B.bucket, 0x10);
    ram.setU16(e + B.sub12, 0);
    ram.setU16(e + B.sub14, sub14);
    ram.setU32(e + B.nudge, nudge);
    if (speed !== null) ram.setU16(e + B.speed, speed);
    return e;
  };
  const first = make(0x05, 0x27506a, 0xf600fa00, 0x04a0);
  ram.setU8(first + B.f1c, 0x40);
  make(0x05, 0x2750a2, 0xf6000500, 0x0460);
  make(0x0d, 0x2750d6, 0xfa000000, null, 0x0400);
  freeEnemy(ram, a5);
}

function draw83(ram, rom, a5, a6) {
  enqueueThroughStub(ram, rom, 0x23d852, a6);
  const pos = addPackedWords(ram.u32(a6 + 2),
    u16(0xf200 + ram.u16(a5 + 0x2e)), 0xf400);
  enqueueRegistersThroughStub(ram, rom, 0x23df86,
    pos, ram.u32(a5 + 0x28), 0x0e60, ram.u16(a6 + 0x1c));
}

export function handler83(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 6);
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported)) return;
  if (outside83(ram, a6)) {
    if (ram.u8(a5 + 0x16) !== 0) { freeEnemy(ram, a5); return; }
  } else ram.setU8(a5 + 0x16, 1);
  ram.setU32(a6 + 0x22, ram.u32(a6 + 2));

  const hit = (ram.u8(a6) | ram.u8(a6 + 0x20)) & 0x5c;
  let palette;
  if (hit === 0) {
    palette = ram.u8(a5 + 0x1c);
    if (ram.u16(a6 + 0x18) < 0x05c0 && ram.u16(G.criticalGate) === 0)
      palette = 0x19;
  } else {
    ram.setU8(a6, ram.u8(a6) & 0xa3);
    ram.setU8(a6 + 0x20, ram.u8(a6 + 0x20) & 0xa3);
    scoreHit(ram, ctx, a6, hit);
    palette = ram.u8(a6 + 0x1d);
    if (palette === 0x19) palette = ram.u8(a5 + 0x1c);
    palette ^= ram.u8(a5 + 0x1d);
    const hp0 = ram.u16(a6 + 0x18), hp1 = ram.u16(a6 + 0x38);
    const hp = i16(hp0) <= i16(hp1) ? hp0 : hp1;
    ram.setU16(a6 + 0x18, hp);
    ram.setU16(a6 + 0x38, hp);
    if (i16(hp) < 0) { death83(ram, rom, a5, a6, ctx, hit); return; }
  }
  ram.setU8(a6 + 0x1d, palette);
  spawnCues28AC72(ram, rom, a5, a6);

  if (ram.u32(G.freeze) === 0 && i16(ram.u16(a6 + 2)) >= 0x1000) {
    ram.setU8(a5 + 0x17, 0);
    const stage4 = ram.u16(G.stage) === 4;
    const near = !stage4
      && minimumPlayerXDistance(ram, ram.u16(a6 + 4)) < 0x0c00;
    if (!near) {
      if (!stage4) ram.setU8(a5 + 0x17, 1);
      if (borrow8(ram, a5 + 0x1e)) {
        ram.setU8(a5 + 0x1e, ram.u8(a5 + 0x30));
        fireAimedFive(ram, rom, a5, a6, ctx);
      }
    }
  }

  draw83(ram, rom, a5, a6);

  if (ram.u32(G.freeze) !== 0 || i16(ram.u16(a6 + 2)) < 0x1000) return;
  if (ram.u16(a5 + 0x32) === 0) {
    if (ram.u8(a5 + 0x17) !== 0) {
      ram.setU8(a5 + 0x22, ram.u8(a5 + 0x23));
      return;
    }
    if (!borrow8(ram, a5 + 0x22)) return;
    ram.setU8(a5 + 0x22, ram.u8(a5 + 0x31));
    ram.setU16(a5 + 0x32, 1);
  }

  const cursor = ram.u16(a5 + 0x2c);
  const phase = rom.u16(0x275102 + cursor);
  if (phase !== 0xffff) {
    ram.setU16(a5 + 0x2e, phase);
    const next = u16(cursor - 2);
    ram.setU16(a5 + 0x2c, next);
    if (cursor === 0) {
      ram.setU16(a5 + 0x2c, 0x48);
      ram.setU8(a5 + 0x22, ram.u8(a5 + 0x23));
      ram.setU16(a5 + 0x32, 0);
    }
    return;
  }
  if (!borrow8(ram, a5 + 0x22)) return;
  ram.setU16(a5 + 0x2c, u16(cursor - 2));
  fireRings(ram, rom, a5, a6, ctx);
}
