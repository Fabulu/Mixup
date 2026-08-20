// Stage-3 type $12 carrier and its directly spawned children $13/$14 (W198).
// ROM closures: $26C266..$26D6EE and $265A54..$265BEC.

import { u16, i16 } from './ram.js';
import { freeEnemy } from './initbody.js';
import { applyVelocity, offScreen242684 } from './movement.js';
import { AimTables, aim64, aim64FromCaller, aim256AtTarget, slew64 } from './aim.js';
import { dist242494 } from './bossscripts.js';
import { enqueueDeferred, DEFQ_D1 } from './spawn.js';
import { enqueueRegistersThroughStub, enqueueThroughStub,
  enqueueZoomedThroughStub } from './spritequeue.js';
import { fire as fireBullet, WriteLog } from './bullets.js';
import { scoreHit, scoreKill } from './score.js';
import { spawnEffect, B, walkDeathSpawns270D92 } from './effects.js';
import { armScreenClear } from './midboss.js';
import { loadAnimObjects246410 } from './animobjects.js';
import { bigBurst28B4BE } from './boss.js';
import { drawByte242B3C } from './rng.js';

const u32 = (v) => (v >>> 0) % 0x100000000;
const G = {
  stage: 0x813092, rank98: 0x813098, rankBC: 0x8130bc,
  freeze: 0x8130d2, scroll: 0x813176, scroll172: 0x813172, clock: 0x8130ce,
  f4: 0x8130f4, e0: 0x8130e0,
};
const HISTORY = 0x81585c;
const aimCache = new WeakMap();
const aims = (rom) => {
  let t = aimCache.get(rom);
  if (!t) { t = new AimTables(rom); aimCache.set(rom, t); }
  return t;
};

function packedAdd(pos, delta) { return u32(pos + delta); }
function packedLowAdd(pos, delta) {
  return ((pos & 0xffff0000) | u16((pos & 0xffff) + delta)) >>> 0;
}
function packedHighAdd(pos, delta) {
  return ((u16((pos >>> 16) + delta) << 16) | (pos & 0xffff)) >>> 0;
}
function borrowByte(ram, at) {
  const old = ram.u8(at);
  ram.setU8(at, old - 1);
  return old === 0;
}

function unfreeze261142(ram) { ram.setU16(0x81317e, 2); }

// `$242684` -- W451 merged this file's copy into `movement.js offScreen242684`.
// It folded the two word adds `$242688 addi.w #$1C00` and `$24268C add.w
// $813172` into ONE `u16(...)`, which is the same value (u16 is associative
// over addition mod $10000) but hides that the ROM branches on neither of them.

function bullet(ram, rom, ctx, a5, site, entry, regs) {
  const out = fireBullet({ ram, rom, log: new WriteLog(ram) }, entry,
    { ...regs, a5 });
  ctx.bulletSpawn?.(site, out);
  return out;
}

// W402: `emitRows` WAS A THIRD, WRONG COPY OF `$26C74E`. Both of its call sites are that routine --
// $26C7A8 `61 a4` bsr.s and $26C838 `61 00 ff 14` bsr.w, both resolving to $26C74E -- and $26C74E
// writes `move.w #$10,($1E,A0)` at $26C772 and NOTHING to ($10,A0). This copy wrote the bucket from
// a caller argument ($0C at both sites) and invented `($10,A0) = 2`. `walkDeathSpawns270D92` is the
// same code with the ($1E,A0) literal as its `anim` parameter, which is what it was built for
// (effects.js: "$26C74E IS THIS ROUTINE'S TWIN AND IS SERVED BY THE SAME CODE"), so the duplicate
// is gone rather than repaired.
const C74E_ANIM = 0x10;                        // $26C772 move.w #$10,($1E,A0)

// `$26C8A8`'s single-row emit. THE SAME FIELD SET as $26C74E's loop body bar the last two: this one
// takes the speed and the heading from the RECORD ($1A,A6)/($1B,A6) instead of from the row, and the
// heading is doubled TWICE with byte adds. $270094 (type $4C) is the same block against ($8A,A6).
function emitOneRow(ram, rom, ctx, row, pos, speed, heading) {
  const e = spawnEffect(ram, ctx, rom.u16(row + 2), row);
  ram.setU8(e + B.f1c, rom.u16(row + 4));      // $26C8CE move.b D0,($1C,A0)
  ram.setU16(e + B.delay, rom.u16(row));       // $26C8D2 move.w D1,($18,A0)
  ram.setU32(e + B.nudge, rom.u32(row + 6));   // $26C8D6 move.l (A1)+,($26,A0)
  ram.setU32(e + B.pos, pos);                  // $26C8DA move.l ($2,A6),($2,A0)
  // W402: this was `bucket = $0C` plus a `($10,A0) = 2` that no instruction in the arm performs.
  // TRAP 1 -- `31 7c 00 10 00 1e` is the IMMEDIATE $10 and THEN the displacement $1E.
  ram.setU16(e + B.bucket, C74E_ANIM);         // $26C8E0 move.w #$10,($1E,A0)
  ram.setU16(e + B.sub12, 0);                  // $26C8E6
  ram.setU16(e + B.sub14, 0);                  // $26C8EC
  ram.setU8(e + B.speed, speed);               // $26C8F2 move.b ($1A,A6),($1A,A0)
  ram.setU8(e + B.angle, (heading * 4) & 0xff);   // $26C8F8 add.b D0,D0 TWICE
}

function sideBroken(ram, a6, off) { return ram.u8(a6 + off + 0x0e) !== 0; }

function breakSide12(ram, rom, ctx, a6, off) {
  if (sideBroken(ram, a6, off)) return;
  ram.setU8(a6 + off + 0x0e, 1);
  ram.setU16(a6 + off, 0x8000);
  // $26C7A0 lea ($26C65A,PC),A1 / $26C7A4 move.l ($22,A6),D2 / $26C7A8 `61 a4` bsr.s $26C74E.
  walkDeathSpawns270D92(ram, rom, ctx, 0x26c65a,
    ram.u32(a6 + off + 2), 0x26c7a8, C74E_ANIM);
  ctx.soundPost?.(0x28c2dc);
}

function transition12(ram, a5, a6) {
  ram.setU8(a5 + 0x1a, 0);
  if (ram.u16(a5 + 0x2e) === 0) {
    ram.setU16(G.e0, 0);
    ram.setU16(a5 + 0x18, 6);
    return;
  }
  const both = sideBroken(ram, a6, 0x20) && sideBroken(ram, a6, 0x40);
  if (both) {
    ram.setU16(a5 + 0x18, ram.u16(a5 + 0x18) === 5 ? 2 : 5);
    return;
  }
  const cycle = (ram.u16(a5 + 0x1c) + 1) & 3;
  ram.setU16(a5 + 0x1c, cycle);
  ram.setU16(a5 + 0x18, cycle + 1);
}

function moveCarrier12(ram, rom, a5, a6, ctx) {
  if (ram.u8(a5 + 0x24) !== 0) {
    ram.setU16(a6 + 0x1a, 0x0420);
    applyVelocity(ram, ctx.tables, a5);
    return;
  }
  const p = 0x26cd4c + (ram.u16(a6 + 0x86) & 0x0f);
  const ty = rom.u16(p), tx = rom.u16(p + 2);
  const target = aim64(aims(rom), ram.u16(a6 + 2), ram.u16(a6 + 4), ty, tx);
  ram.setU8(a6 + 0x1b, slew64(ram.u8(a6 + 0x1b), target));
  applyVelocity(ram, ctx.tables, a5);
  if (dist242494(ram.u16(a6 + 2), ram.u16(a6 + 4), ty, tx) <= 0x100)
    ram.setU16(a6 + 0x86, (ram.u16(a6 + 0x86) + 4) & 0x0f);
}

function fireFan12(ram, rom, ctx, a5, a6, off, facing) {
  const pos = ram.u32(a6 + off + 2), muzzle = ram.u32(a6 + off + 6);
  let d1 = u16(facing - 0x0c);
  for (let n = 0; n < 7; n++, d1 = u16(d1 + 4)) {
    const d3 = u32(rom.u32(0x2735fa + ((d1 & 0x3f) << 2)) + muzzle);
    bullet(ram, rom, ctx, a5, 0x26cc80 + off + n, 0x2814ac,
      { d0: 0xfffc0004, d1, d2: pos, d3, d4: 0, d5: muzzle });
  }
}

function stateFan12(ram, rom, ctx, a5, a6) {
  let phase = ram.u8(a5 + 0x1a);
  if (phase === 0) {
    ram.setU16(a6 + 0x88, 0x0404);
    ram.setU16(a6 + 0x8a, 0x1020);
    ram.setU16(a6 + 0x8c, 6);
    if (sideBroken(ram, a6, 0x20) || sideBroken(ram, a6, 0x40)) {
      ram.setU16(a6 + 0x8a, 0x1008);
      ram.setU16(a6 + 0x8c, 0x20);
    }
    ram.setU16(a6 + 0x8e, 0x80);
    ram.setU16(a6 + 0x2c, 0);
    ram.setU8(a5 + 0x1a, 1);
    phase = 1;
    if (sideBroken(ram, a6, 0x20) && sideBroken(ram, a6, 0x40)) {
      transition12(ram, a5, a6); return;
    }
  }
  moveCarrier12(ram, rom, a5, a6, ctx);
  if (phase === 1) {
    const wait = ram.u16(a6 + 0x8e);
    if (wait !== 0) { ram.setU16(a6 + 0x8e, wait - 1); return; }
    if (!borrowByte(ram, a6 + 0x2c)) return;
    ram.setU8(a6 + 0x2c, ram.u8(a6 + 0x2d));
    for (const off of [0x20, 0x40])
      ram.setU16(a6 + off + 0x0a, Math.min(0x1c, ram.u16(a6 + off + 0x0a) + 4));
    if (ram.u16(a6 + 0x2a) < 0x1c || ram.u16(a6 + 0x4a) < 0x1c) return;
    for (const off of [0x20, 0x40]) {
      const pos = ram.u32(a6 + off + 2), muzzle = ram.u32(a6 + off + 6);
      const ar = aim64FromCaller(aims(rom), ram, a5,
        u16((pos >>> 16) + (muzzle >>> 16)), u16(pos + muzzle));
      ram.setU8(a6 + (off === 0x20 ? 0x90 : 0x91), ar.carry ? 0x20 : ar.dir);
    }
    ram.setU8(a5 + 0x1a, 2);
  }
  if (ram.u8(a5 + 0x1a) === 2) {
    if (borrowByte(ram, a6 + 0x88)) {
      ram.setU8(a6 + 0x88, ram.u8(a6 + 0x89));
      if (ram.u8(a6 + 0x1a) !== 8) ram.setU8(a6 + 0x1a, ram.u8(a6 + 0x1a) + 1);
    }
    if (borrowByte(ram, a6 + 0x8a)) {
      ram.setU8(a6 + 0x8a, u16(0x30 - ram.u16(G.rankBC)));
      if (sideBroken(ram, a6, 0x20) || sideBroken(ram, a6, 0x40))
        ram.setU8(a6 + 0x8b, 8);
      if (!sideBroken(ram, a6, 0x20)) fireFan12(ram, rom, ctx, a5, a6, 0x20, ram.u8(a6 + 0x90));
      if (!sideBroken(ram, a6, 0x40)) fireFan12(ram, rom, ctx, a5, a6, 0x40, ram.u8(a6 + 0x91));
    }
    const duration = u16(ram.u16(a6 + 0x8c) - 1);
    ram.setU16(a6 + 0x8c, duration);
    if (duration !== 0) return;
    ram.setU8(a5 + 0x1a, 3);
    ram.setU16(a6 + 0x2c, 0x2000);
  }
  if (ram.u8(a5 + 0x1a) === 3 && borrowByte(ram, a6 + 0x2c)) {
    ram.setU8(a6 + 0x2c, ram.u8(a6 + 0x2d));
    for (const off of [0x20, 0x40])
      ram.setU16(a6 + off + 0x0a, Math.max(0, ram.u16(a6 + off + 0x0a) - 4));
    if (ram.u16(a6 + 0x2a) === 0 && ram.u16(a6 + 0x4a) === 0)
      transition12(ram, a5, a6);
  }
}

function fireTwin12(ram, rom, ctx, a5, a6, off) {
  const pos = ram.u32(a6 + off + 2), muzzle = ram.u32(a6 + off + 6);
  const ar = aim64FromCaller(aims(rom), ram, a5,
    u16((pos >>> 16) + (muzzle >>> 16)), u16(pos + muzzle));
  const aim = ar.carry ? 0x20 : ar.dir;
  const d1 = aim * 4, d2 = pos, d3 = muzzle;
  bullet(ram, rom, ctx, a5, 0x26cf70 + off, 0x281744,
    { d0: 0x00080003, d1: u16(d1 - 2), d2, d3, d4: 0, d5: 0 });
  bullet(ram, rom, ctx, a5, 0x26cf78 + off, 0x281744,
    { d0: 0x00080003, d1: u16(d1 + 2), d2, d3, d4: 0, d5: 0 });
}

function stateTwin12(ram, rom, ctx, a5, a6) {
  let phase = ram.u8(a5 + 0x1a);
  if (phase === 0) {
    ram.setU8(a6 + 0xaa, ram.u8(a6 + 0xb0));
    ram.setU8(a6 + 0xb1, Math.max(0x10, ram.u8(a6 + 0xb1) - 4));
    ram.setU16(a6 + 0xac, 8);
    if (sideBroken(ram, a6, 0x20) || sideBroken(ram, a6, 0x40)) {
      ram.setU16(a6 + 0x8a, 0x1008);
      ram.setU16(a6 + 0xac, 0x10);
      ram.setU8(a6 + 0xb1, 8);
      ram.setU8(a6 + 0xaa, ram.u8(a6 + 0xb0));
    }
    ram.setU16(a6 + 0xae, 0);
    ram.setU16(a6 + 0x2c, 0);
    ram.setU8(a5 + 0x1a, 1);
    phase = 1;
    if (sideBroken(ram, a6, 0x20) && sideBroken(ram, a6, 0x40)) {
      transition12(ram, a5, a6); return;
    }
  }
  moveCarrier12(ram, rom, a5, a6, ctx);
  if (phase === 1) {
    for (const off of [0x20, 0x40])
      ram.setU16(a6 + off + 0x0a, Math.min(0x1c, ram.u16(a6 + off + 0x0a) + 4));
    if (ram.u16(a6 + 0x2a) < 0x1c || ram.u16(a6 + 0x4a) < 0x1c) return;
    ram.setU8(a5 + 0x1a, 2);
  }
  if (ram.u8(a5 + 0x1a) === 2) {
    if (borrowByte(ram, a6 + 0xaa)) {
      ram.setU8(a6 + 0xaa, ram.u8(a6 + 0xab));
      ram.setU16(a6 + 0xae, (ram.u16(a6 + 0xae) + 4) & 0x1f);
      if (!sideBroken(ram, a6, 0x20)) fireTwin12(ram, rom, ctx, a5, a6, 0x20);
      if (!sideBroken(ram, a6, 0x40)) fireTwin12(ram, rom, ctx, a5, a6, 0x40);
    }
    const duration = u16(ram.u16(a6 + 0xac) - 1);
    ram.setU16(a6 + 0xac, duration);
    if (duration !== 0) return;
    ram.setU8(a5 + 0x1a, 3);
    ram.setU16(a6 + 0x2c, 0x2000);
  }
  if (ram.u8(a5 + 0x1a) === 3 && borrowByte(ram, a6 + 0x2c)) {
    ram.setU8(a6 + 0x2c, ram.u8(a6 + 0x2d));
    for (const off of [0x20, 0x40])
      ram.setU16(a6 + off + 0x0a, Math.max(0, ram.u16(a6 + off + 0x0a) - 4));
    if (ram.u16(a6 + 0x2a) === 0 && ram.u16(a6 + 0x4a) === 0)
      transition12(ram, a5, a6);
  }
}

function stateFive12(ram, rom, ctx, a5, a6) {
  if (ram.u8(a5 + 0x1a) === 0) {
    ram.setU8(a5 + 0x1a, 1);
    ram.setU16(a6 + 0xce, 0x0810);
    ram.setU16(a6 + 0xd0, 0x0020);
    ram.setU8(a6 + 0xd6, 1);
    ram.setU16(a6 + 0xd8, 0);
    ram.setU16(a6 + 0xd4, 0);
    ram.setU16(a6 + 0x0c, 0x3001);
    ram.setU8(a6 + 0x68, 1);
  }
  moveCarrier12(ram, rom, a5, a6, ctx);
  if (ram.u8(a5 + 0x24) !== 0 || !borrowByte(ram, a6 + 0xce)) return;
  ram.setU8(a6 + 0xce, u16(0x12 - (ram.u16(G.rankBC) >>> 2)));
  const ar = aim256AtTarget(aims(rom), ram, a5, a6);
  if (ar.carry) return;
  const pos = ram.u32(a6 + 2), d5 = 0xf6000000;
  let d1 = u16(ar.dir - 0x30);
  for (let n = 0; n < 13; n++, d1 = u16(d1 + 8)) {
    const d3 = u32(rom.u32(0x2736fa + ((d1 + 2) & 0xfc)) + d5);
    bullet(ram, rom, ctx, a5, 0x26ce40 + n, 0x2817b8,
      { d0: 0x00040004, d1, d2: pos, d3, d4: 0, d5 });
  }
  let value = i16(ram.u16(a6 + 0xd8)) + ((ram.u8(a6 + 0xd6) << 24) >> 24);
  ram.setU16(a6 + 0xd8, value);
  if (value < -4 || value > 4) ram.setU8(a6 + 0xd6, -ram.u8(a6 + 0xd6));
}

function stateSix12(ram, a5, a6, ctx) {
  if (ram.u8(a5 + 0x1a) === 0) {
    ram.setU8(a6 + 0x68, 2);
    ram.setU16(a6 + 0x1a, 0x0600);
    ram.setU8(a5 + 0x1a, 1);
  }
  if (ram.u8(a5 + 0x1a) === 1 && borrowByte(ram, a6 + 0x2c)) {
    ram.setU8(a6 + 0x2c, ram.u8(a6 + 0x2d));
    for (const off of [0x20, 0x40])
      ram.setU16(a6 + off + 0x0a, Math.max(0, ram.u16(a6 + off + 0x0a) - 4));
    if (ram.u16(a6 + 0x2a) === 0 && ram.u16(a6 + 0x4a) === 0)
      ram.setU8(a5 + 0x1a, 2);
  }
  if (ram.u8(a5 + 0x1a) === 2 && i16(ram.u16(a6 + 2)) >= 0x6a00) {
    unfreeze261142(ram);
    ram.setU16(G.f4, 0);
    ram.setU8(a5 + 0x1a, 3);
  }
  if (ram.u8(a5 + 0x1a) === 3) {
    const y = i16(ram.u16(a6 + 2));
    if (y <= i16(0x9c00) && y > i16(0x9800)) ram.setU16(a5 + 0x30, 1);
  }
  applyVelocity(ram, ctx.tables, a5);
}

function runState12(ram, rom, ctx, a5, a6) {
  switch (ram.u16(a5 + 0x18)) {
    case 0: {
      const y = u16(ram.u16(a6 + 2) + i16(ram.u16(a6 + 0x66)));
      ram.setU16(a6 + 2, y);
      if (i16(y) > 0x3c00)
        ram.setU16(a6 + 0x66, u16(ram.u16(a6 + 0x66) - 9));
      if (i16(ram.u16(a6 + 0x66)) <= 0) {
        ram.setU8(a5 + 0x1a, 1);
        enqueueDeferred(ram, 0x14, DEFQ_D1.FIXED00);
        transition12(ram, a5, a6);
        ram.setU16(a6, 0xa001); ram.setU16(a6 + 0x20, 0xa001);
        ram.setU16(a6 + 0x40, 0xa001);
      }
      break;
    }
    case 1: case 3: stateFan12(ram, rom, ctx, a5, a6); break;
    case 2: case 4: stateTwin12(ram, rom, ctx, a5, a6); break;
    case 5: stateFive12(ram, rom, ctx, a5, a6); break;
    case 6: stateSix12(ram, a5, a6, ctx); break;
  }
}

function spawnChildren13(ram, rom, a5, a6) {
  if (ram.u16(a5 + 0x2e) === 0) return;
  let state = ram.u8(a6 + 0xc6);
  if (state === 0) {
    ram.setU8(a6 + 0xc6, 1); ram.setU16(a6 + 0xca, 0x1010);
    ram.setU16(a6 + 0xcc, 0x0505); ram.setU16(a6 + 0xda, 0x0060);
    state = 1;
  }
  if (state === 1) {
    if (ram.u8(a6 + 0x68) !== 0) return;
    const n = u16(ram.u16(a6 + 0xda) - 1); ram.setU16(a6 + 0xda, n);
    if (n !== 0) return;
    ram.setU8(a6 + 0x68, 1); ram.setU8(a6 + 0xc6, 2); return;
  }
  if (state === 2) {
    if (ram.u8(a6 + 0x68) !== 0 || ram.u8(a5 + 0x24) !== 0) return;
    if (!borrowByte(ram, a6 + 0xca)) return;
    ram.setU8(a6 + 0xca, ram.u8(a6 + 0xcb));
    const ar = aim256AtTarget(aims(rom), ram, a5, a6);
    if (ar.carry) return;
    const q = enqueueDeferred(ram, 0x13, DEFQ_D1.FIXED00);
    ram.setU32(q.addr + 0x16, packedHighAdd(ram.u32(a6 + 2), -0x0800));
    ram.setU8(q.addr + 0x1a, 0);
    ram.setU8(q.addr + 0x1b, ar.dir + drawByte242B3C(ram, rom));
    const left = (ram.u8(a6 + 0xcc) - 1) & 0xff; ram.setU8(a6 + 0xcc, left);
    if (left === 0) { ram.setU8(a6 + 0xc6, 3); ram.setU16(a6 + 0xda, 0x40); }
    return;
  }
  const n = u16(ram.u16(a6 + 0xda) - 1); ram.setU16(a6 + 0xda, n);
  if (n !== 0) return;
  ram.setU8(a6 + 0x68, 2); ram.setU16(a6 + 0xda, 0x60);
  ram.setU8(a6 + 0xc6, 1);
  ram.setU8(a6 + 0xcc,
    sideBroken(ram, a6, 0x20) || sideBroken(ram, a6, 0x40) ? 0x0a : ram.u8(a6 + 0xcd));
}

function animateHatch12(ram, a6) {
  const mode = ram.u8(a6 + 0x68);
  if (mode === 0 || !borrowByte(ram, a6 + 0x6a)) return;
  ram.setU8(a6 + 0x6a, ram.u8(a6 + 0x6b));
  if (mode === 1) {
    const n = Math.min(0x1c, ram.u16(a6 + 0x0a) + 4); ram.setU16(a6 + 0x0a, n);
    if (n === 0x1c) ram.setU8(a6 + 0x68, 0);
  } else {
    if (sideBroken(ram, a6, 0x20) && sideBroken(ram, a6, 0x40)) return;
    const n = Math.max(0, ram.u16(a6 + 0x0a) - 4); ram.setU16(a6 + 0x0a, n);
    if (n === 0) ram.setU8(a6 + 0x68, 0);
  }
}

function death12(ram, rom, ctx, a5, a6) {
  if (ram.u8(a5 + 0x24) === 0) return;
  const stage = ram.u8(a5 + 0x25);
  if (stage === 0) {
    if (!borrowByte(ram, a5 + 0x26)) return;
    ram.setU8(a5 + 0x26, ram.u8(a5 + 0x27));
    ctx.soundPost?.(0x28c274);
    emitOneRow(ram, rom, ctx, 0x26c93a + ram.u16(a5 + 0x2a),
      ram.u32(a6 + 2), ram.u8(a6 + 0x1a), ram.u8(a6 + 0x1b));
    let cursor = ram.u16(a5 + 0x2a) + 12;
    if (cursor >= 0x48) {
      cursor = 0;
      const cycles = u16(ram.u16(a5 + 0x28) - 1); ram.setU16(a5 + 0x28, cycles);
      if (cycles === 0) {
        ram.setU16(a5 + 0x26, 0x1006); ram.setU8(a5 + 0x25, 1);
      }
    }
    ram.setU16(a5 + 0x2a, cursor); return;
  }
  if (stage === 1) {
    const n = (ram.u8(a5 + 0x26) - 1) & 0xff; ram.setU8(a5 + 0x26, n);
    if (n !== 0) return;
    ram.setU16(a5 + 0x2c, 0);                                  // $26C81C
    loadAnimObjects246410(ram, rom, 0x26c9ce);                 // $26C822/$26C828 jsr $246410
    // $26C832 lea ($26C984,PC),A1 / $26C838 `61 00 ff 14` bsr.w $26C74E ($26C83A - $EC).
    walkDeathSpawns270D92(ram, rom, ctx, 0x26c984,
      ram.u32(a6 + 2), 0x26c838, C74E_ANIM);
    // W402: THREE corrections in four lines, all from the bytes.
    //   * $26C83C and $26C862 are both `4e b9 00 24 2b 3c` = jsr $242B3C. This read $242EC2.
    //   * the two `jsr $28B4BE` sites are $26C85C and $26C882. This cited $26C8CA and $26C8F4,
    //     which are inside the NEXT arm ($26C8A8's) and are not jsr instructions at all.
    //   * the angle is built with BYTE operations -- `e3 00` asl.b #1,D0 / `12 00` move.b D0,D1 /
    //     `06 01 00 40` addi.b #$40,D1 -- and was transcribed as `u16(r * 2 + 0x40)`. That one is
    //     NOT a live defect and is not counted as one: `setU8` masks, and `(r*2 + $40) & $FF`
    //     equals `((r*2 & $FF) + $40) & $FF` for every r. Corrected for the transcription only.
    for (const [turn, bias, site] of [[0x40, 0xf8000800, 0x26c85c], [0xc0, 0x01fff800, 0x26c882]]) {
      const r = drawByte242B3C(ram, rom);                      // $26C83C / $26C862 jsr $242B3C
      bigBurst28B4BE(ram, rom, ctx, packedAdd(ram.u32(a6 + 2), bias),   // $26C84E/$26C874 addi.l
        (((r << 1) & 0xff) + turn) & 0xff,
        0, 0x0c, site);                                        // $26C858 D0 = 0, $26C854 D3 = $C
    }
    ctx.soundPost?.(0x28c310);                                 // $26C888 jsr $28C310
    ram.setU8(a5 + 0x26, 0x10); ram.setU8(a5 + 0x25, 2); return;
  }
  const n = (ram.u8(a5 + 0x26) - 1) & 0xff; ram.setU8(a5 + 0x26, n);
  if (n === 0) {
    unfreeze261142(ram);
    ram.setU16(G.f4, 0); ram.setU16(a5 + 0x30, 1);
  }
}

function shiftHistory12(ram, a6) {
  for (let n = 9; n > 0; n--)
    ram.setU32(HISTORY + n * 4, packedLowAdd(ram.u32(HISTORY + (n - 1) * 4), -ram.u16(G.scroll)));
  ram.setU32(HISTORY, packedLowAdd(ram.u32(a6 + 2), -ram.u16(G.scroll)));
  const old = ram.u32(HISTORY + 9 * 4);
  ram.setU32(a6 + 0x22, packedLowAdd(old, -0x1000));
  ram.setU32(a6 + 0x42, packedLowAdd(old, 0x1000));
}

function damage12(ram, rom, ctx, a5, a6, skipRoot = false) {
  const hit = ram.u8(a6) & 0x5c;
  if (!skipRoot && hit) {
    ram.setU8(a6, ram.u8(a6) & 0xa3); scoreHit(ram, ctx, a6, hit);
    ram.setU8(a6 + 0x1d, ram.u8(a6 + 0x1d) ^ ram.u8(a6 + 0x1f));
    const delta = u16(0x7fff - ram.u16(a6 + 0x18));
    if (ram.u16(a5 + 0x2e) !== 0) ram.setU32(a5 + 0x20, u32(ram.u32(a5 + 0x20) - delta));
    ram.setU16(a6 + 0x18, 0x7fff);
    if (ram.u8(a5 + 0x1f) === 0 && ram.u32(a5 + 0x20) <= 0x2800) {
      breakSide12(ram, rom, ctx, a6, 0x20); breakSide12(ram, rom, ctx, a6, 0x40);
      ram.setU8(a5 + 0x1f, 1);
    } else if ((ram.u32(a5 + 0x20) & 0x80000000) !== 0) {
      scoreKill(ram, rom, ctx, 0x712, hit);
      armScreenClear(ram, ctx, hit, 'type $12 root death $26C5A8');
      ram.setU16(a6, 0x8000); ram.setU8(a5 + 0x24, 1); ram.setU16(G.e0, 0);
    }
  } else if (!skipRoot) ram.setU8(a6 + 0x1d, ram.u8(a6 + 0x1e));
  if (ram.u8(a5 + 0x1e) === 0 && ram.u32(a5 + 0x20) <= 0x1000)
    ram.setU8(a5 + 0x1e, 1);

  for (const off of [0x20, 0x40]) {
    if (sideBroken(ram, a6, off)) continue;
    const h = ram.u8(a6 + off) & 0x5c;
    if (h) {
      ram.setU8(a6 + off, ram.u8(a6 + off) & 0xa3); scoreHit(ram, ctx, a6 + off, h);
      ram.setU8(a6 + off + 0x1a, ram.u8(a6 + off + 0x1a) ^ ram.u8(a6 + off + 0x1d));
      ram.setU8(a6 + off + 0x1b, ram.u8(a6 + off + 0x1b) ^ ram.u8(a6 + off + 0x1f));
      if (ram.u16(a5 + 0x2e) === 0) ram.setU16(a6 + off + 0x18, 0x4000);
      if (i16(ram.u16(a6 + off + 0x18)) < 0) {
        scoreKill(ram, rom, ctx, 0x173, h); breakSide12(ram, rom, ctx, a6, off);
      }
    } else {
      ram.setU8(a6 + off + 0x1a, ram.u8(a6 + off + 0x1c));
      ram.setU8(a6 + off + 0x1b, ram.u8(a6 + off + 0x1e));
    }
  }
}

function draw12(ram, rom, a5, a6) {
  const rootIndex = ram.u16(a6 + 0x0a) & 0x1c;
  ram.setU32(a6 + 0x14, rom.u32(0x26d2e6 + rootIndex));
  enqueueRegistersThroughStub(ram, rom, 0x23df58,
    packedAdd(ram.u32(a6 + 2), 0xf200f100), rom.u32(0x26d2c6 + rootIndex),
    0x0e78, ram.u16(a6 + 0x1c));
  const outer = ram.u16(a5 + 0x32) & 0x1c;
  if (!sideBroken(ram, a6, 0x20)) {
    enqueueRegistersThroughStub(ram, rom, 0x23df58,
      packedAdd(ram.u32(a6 + 0x22), 0xf000f900), rom.u32(0x26d362 + outer),
      0x1038, ram.u8(a6 + 0x3a));
    enqueueRegistersThroughStub(ram, rom, 0x23df58,
      packedAdd(ram.u32(a6 + 0x22), 0xde000b00), rom.u32(0x26d382 + (ram.u16(a6 + 0x2a) & 0x1c)),
      0x0e38, ram.u8(a6 + 0x3b));
  }
  if (!sideBroken(ram, a6, 0x40)) {
    enqueueRegistersThroughStub(ram, rom, 0x23df58,
      packedAdd(ram.u32(a6 + 0x42), 0xf000f900), rom.u32(0x26d3fe + outer),
      0x1038, ram.u8(a6 + 0x5a));
    enqueueRegistersThroughStub(ram, rom, 0x23df58,
      packedAdd(ram.u32(a6 + 0x42), 0xddfff700), rom.u32(0x26d41e + (ram.u16(a6 + 0x4a) & 0x1c)),
      0x0e38, ram.u8(a6 + 0x5b));
  }
}

export function handler12(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 6);
  if (ram.u16(G.freeze) === 0) {
    runState12(ram, rom, ctx, a5, a6);
    if (ram.u8(a5 + 0x24) === 0 && ram.u16(a5 + 0x2e) !== 0) {
      if (ram.u8(a5 + 0x1f) === 0 && ram.u16(a5 + 0x2e) <= 0x0258) {
        breakSide12(ram, rom, ctx, a6, 0x20); breakSide12(ram, rom, ctx, a6, 0x40);
        ram.setU8(a5 + 0x1f, 1);
        damage12(ram, rom, ctx, a5, a6, true);
        ram.setU16(a5 + 0x32, (ram.u16(a5 + 0x32) + 4) & 0x1f);
        if (ram.u16(a5 + 0x2c) !== 0) draw12(ram, rom, a5, a6);
        return;
      } else {
        ram.setU16(a5 + 0x2e, ram.u16(a5 + 0x2e) - 1);
        if (ram.u16(a5 + 0x2e) === 0) transition12(ram, a5, a6);
      }
    }
    spawnChildren13(ram, rom, a5, a6);
    animateHatch12(ram, a6);
    death12(ram, rom, ctx, a5, a6);
    if (ram.u16(a5 + 0x30) !== 0) { freeEnemy(ram, a5); return; }
  }
  shiftHistory12(ram, a6);
  damage12(ram, rom, ctx, a5, a6);
  ram.setU16(a5 + 0x32, (ram.u16(a5 + 0x32) + 4) & 0x1f);
  if (ram.u16(a5 + 0x2c) !== 0) draw12(ram, rom, a5, a6);
}

export function handler13(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 6);
  if (ram.u16(G.e0) === 0 || ram.u16(G.f4) === 0 || ram.u16(G.f4) === 2)
    ram.setU8(a6 + 1, ram.u8(a6 + 1) & 0xfe);
  const hit = ram.u8(a6) & 0x5c;
  if (hit) {
    ram.setU8(a6, ram.u8(a6) & 0xa3); scoreHit(ram, ctx, a6, hit);
    ram.setU8(a6 + 0x1d, ram.u8(a6 + 0x1d) ^ 0x15);
    if (i16(ram.u16(a6 + 0x18)) < 0) {
      scoreKill(ram, rom, ctx, 0, hit);
      const e = spawnEffect(ram, ctx, 2, 0x26d4fc);
      ram.setU32(e + B.pos, ram.u32(a6 + 2)); ram.setU16(e + B.speed, ram.u16(a6 + 0x1a));
      ram.setU16(e + B.delay, 0x10); ctx.soundPost?.(0x28c25a); freeEnemy(ram, a5); return;
    }
  } else ram.setU8(a6 + 0x1d, 0x0a);
  if (offScreen242684(ram, a6)) {
    if (ram.u8(a5 + 0x16)) { freeEnemy(ram, a5); return; }
  } else ram.setU8(a5 + 0x16, 1);
  if (ram.u16(G.freeze) === 0) {
    const v = ctx.tables.shotVector(ram.u8(a6 + 0x1a), ram.u8(a6 + 0x1b));
    ram.setU16(a6 + 2, ram.u16(a6 + 2) + v.dy); ram.setU16(a6 + 4, ram.u16(a6 + 4) + v.dx);
    if (borrowByte(ram, a5 + 0x1a)) ram.setU8(a5 + 0x1a, ram.u8(a5 + 0x1b));
    if (!(ram.u8(a5 + 0x26) && ram.u8(a6 + 0x1a) === 4)) ram.setU8(a6 + 0x1a, ram.u8(a6 + 0x1a) + 1);
    if (i16(ram.u16(a6 + 2)) <= 0x0600) ram.setU8(a5 + 0x26, ram.u8(a5 + 0x26) - 1);
    else if (ram.u8(a5 + 0x26) && ram.u8(a6 + 0x1a) >= 4 && borrowByte(ram, a5 + 0x18)) {
      ram.setU8(a5 + 0x18, ram.u8(a5 + 0x19));
      const ar = aim256AtTarget(aims(rom), ram, a5, a6);
      if (!ar.carry) {
        const jitter = ((drawByte242B3C(ram, rom) << 24) >> 24) >> 1;
        bullet(ram, rom, ctx, a5, 0x26d5ca, 0x2817b8,
          { d0: 0x16, d1: u16(ar.dir + jitter), d2: ram.u32(a6 + 2), d3: 0, d4: 0, d5: 0 });
      }
    }
    if (borrowByte(ram, a5 + 0x1e)) {
      ram.setU8(a5 + 0x1e, ram.u8(a5 + 0x1f));
      ram.setU32(a6 + 0x0a, rom.u32(0x26d64e + (ram.u16(a5 + 0x20) & 0x3c)));
      ram.setU16(a5 + 0x20, (ram.u16(a5 + 0x20) + 4) & 0x3f);
    }
    if (borrowByte(ram, a5 + 0x22) && ram.u16(a5 + 0x24) !== 0x5c) {
      ram.setU8(a5 + 0x22, ram.u8(a5 + 0x23)); ram.setU16(a5 + 0x24, ram.u16(a5 + 0x24) + 4);
      ram.setU16(a6 + 0x10, ram.u16(a6 + 0x10) + 0x40); ram.setU16(a6 + 0x12, ram.u16(a6 + 0x12) + 0x40);
      ram.setU16(a6 + 0x14, ram.u16(a6 + 0x14) + 0x20); ram.setU16(a6 + 0x16, ram.u16(a6 + 0x16) + 0x20);
    }
  }
  enqueueZoomedThroughStub(ram, rom, 0x23dbca, a6,
    rom.u32(0x26d68e + (ram.u16(a5 + 0x24) & 0x5c)));
}

export function handler14(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 6);
  if (ram.u16(G.clock) === 0x0118) { freeEnemy(ram, a5); return; }
  if (ram.u16(G.freeze) === 0) {
    if (ram.u16(a5 + 0x1e) <= 1 && borrowByte(ram, a5 + 0x20))
      ram.setU8(a5 + 0x20, ram.u8(a5 + 0x21));
    const v = ctx.tables.vector(ram.u8(a6 + 0x1a), ram.u8(a6 + 0x1b));
    ram.setU16(a6 + 2, ram.u16(a6 + 2) + v.dy);
    ram.setU16(a6 + 0x22, ram.u16(a6 + 0x22) + v.dy);
    ram.setU16(a6 + 0x24, ram.u16(a6 + 4));
    const acc = i16(ram.u16(a5 + 0x18)) + i16(v.dy); ram.setU16(a5 + 0x18, acc);
    if (acc <= -0x7000) {
      const residual = acc + 0x7000; ram.setU16(a5 + 0x18, residual);
      const off = ram.u16(a5 + 0x1a) & 0x20; ram.setU16(a5 + 0x1a, (off + 0x20) & 0x3f);
      const q = a6 + off; ram.setU8(q + 0x1f, 1); ram.setU16(q + 2, 0x7000 + residual);
      const cursor = ram.u16(a5 + 0x1c) & 0x0c; ram.setU32(q + 0x0a, rom.u32(0x265bdc + cursor));
      if (cursor === 0 && ram.u16(G.f4) === 0 && ram.u16(a5 + 0x1e) !== 0) {
        const n = u16(ram.u16(a5 + 0x1e) - 1); ram.setU16(a5 + 0x1e, n);
        if (n === 0) ram.setU16(a5 + 0x22, 1);
      }
      ram.setU16(a5 + 0x1c, (cursor + 4) & 0x0f);
      if (ram.u16(a5 + 0x22) !== 0) ram.setU8(q + 0x1f, 0);
    }
  }
  if (ram.u8(a6 + 0x1f)) enqueueThroughStub(ram, rom, 0x23d916, a6);
  if (ram.u8(a6 + 0x3f)) enqueueThroughStub(ram, rom, 0x23d916, a6 + 0x20);
}
