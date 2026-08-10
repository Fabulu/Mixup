// Stage-4 type $A3 and the two Pool-A impact kinds its death path owns.
//
// The two linked subrecords form one oscillating carrier. The linked record is
// the damage target while the root owns movement and the fixed hull. Death
// expands two boundaries through kind-$0C effects and, on loop 1, Pool-A kind
// 18 particles. The initial break creates Pool-A kind 19.

import { u16, i16 } from './ram.js';
import { freeEnemy } from './initbody.js';
import { stepMovement, scrollCompensate } from './movement.js';
import { AimTables, aim256 } from './aim.js';
import { fire as fireBullet, WriteLog } from './bullets.js';
import { enqueueThroughStub } from './spritequeue.js';
import { scoreHit, scoreKill } from './score.js';
import { spawnEffect, B } from './effects.js';
import { allocPoolA27F8F0 } from './bee.js';

const G = Object.freeze({
  freeze: 0x8130d2,
  lowFlashGate: 0x8130ca,
  loop: 0x813098,
  rankBA: 0x8130ba,
});
const R = Object.freeze({
  player: 0x03, sub: 0x06, onScreen: 0x16, state: 0x18,
  rootPal: 0x1a, rootXor: 0x1b, wait: 0x1c, waitReload: 0x1d,
  volleys: 0x1e, volleysReload: 0x1f, art: 0x20,
  artTimer: 0x22, artReload: 0x23, life: 0x24,
  linkedPal: 0x26, linkedXor: 0x27, aimed: 0x28,
  velocity: 0x2a, offset: 0x2c, deathTimer: 0x2e,
  deathReload: 0x2f, upper: 0x30, lower: 0x32,
  deltaTable: 0x34, outer: 0x38, outerReload: 0x39,
  nested: 0x3a, nestedReload: 0x3b,
});
const S = Object.freeze({
  flags: 0x00, posX: 0x02, posY: 0x04, sprite: 0x0a,
  hp: 0x18, palette: 0x1d,
});
const PLAYER = Object.freeze([0x8103e6, 0x810448]);
const AIM_TABLES = new WeakMap();

function aimTables(rom) {
  let t = AIM_TABLES.get(rom);
  if (!t) { t = new AimTables(rom); AIM_TABLES.set(rom, t); }
  return t;
}

function selectedPlayer(ram, a5) {
  let first = ram.u8(a5 + R.player) === 0 ? 0 : 1;
  const second = first ^ 1;
  if (i16(ram.u16(PLAYER[first])) >= 0) {
    if (i16(ram.u16(PLAYER[second])) >= 0) return 0;
    first = second;
  }
  return PLAYER[first];
}

function shoot(ram, rom, a5, ctx, site, entry, regs) {
  ctx.bulletSpawn?.(site, fireBullet({ ram, rom, log: new WriteLog(ram) },
    entry, { ...regs, a5 }));
}

function drawPair(ram, rom, root, offset) {
  enqueueThroughStub(ram, rom, 0x23d7da, root);
  ram.setU16(root + 0x24, ram.u16(root + 0x24) + offset);
  enqueueThroughStub(ram, rom, 0x23d7da, root + 0x20);
}

function spawnBoundaryEffect(ram, ctx, root, boundary, site) {
  const e = spawnEffect(ram, ctx, 0x0c, site);
  ram.setU32(e + B.pos, ram.u32(root + S.posX));
  ram.setU16(e + B.bucket, 8);
  ram.setU16(e + B.sub12, 0);
  ram.setU16(e + B.sub14, 0);
  ram.setU16(e + B.nudge, 0xfe00);
  ram.setU16(e + B.nudge + 2, boundary);
  ram.setU16(e + B.delay, 2);
}

function boundaryPair(ram, rom, a5, root, ctx, boundary, upper) {
  if (ram.u16(G.loop) !== 0) {
    const d3a = u16(boundary + 0x0200);
    const regs = { d0: 0xfff80013, d1: 0x80,
      d2: ram.u32(root + S.posX), d3: d3a, d4: 0 };
    shoot(ram, rom, a5, ctx, upper ? 0x27d51e : 0x27d5dc,
      0x2816f6, regs);
    shoot(ram, rom, a5, ctx, upper ? 0x27d52a : 0x27d5e8,
      0x2816f6, { ...regs, d3: u16(d3a - 0x0400) });
  }
  ctx.soundPost?.(0x28c274);
  spawnBoundaryEffect(ram, ctx, root, boundary,
    upper ? 0x27d53a : 0x27d5f8);
  if (ram.u16(G.loop) === 0) {
    allocPoolA27F8F0(ram, rom, ctx, 0x48, u16(boundary + 0x0200), 4, root);
    allocPoolA27F8F0(ram, rom, ctx, 0x48, u16(boundary - 0x0200), 4, root);
  }
}

function cleanupA3(ram, rom, a5, root, ctx) {
  scrollCompensate(ram, a5);
  ram.setU32(root + 0x22, ram.u32(root + S.posX));

  const old = ram.u8(a5 + R.deathTimer);
  ram.setU8(a5 + R.deathTimer, old - 1);
  if (old === 0) {
    ram.setU8(a5 + R.deathTimer, ram.u8(a5 + R.deathReload));
    let boundary = u16(ram.u16(root + S.posY) + ram.u16(a5 + R.upper));
    if (i16(boundary) >= i16(0xf800)) {
      boundaryPair(ram, rom, a5, root, ctx, ram.u16(a5 + R.upper), true);
      ram.setU16(a5 + R.upper, ram.u16(a5 + R.upper) - 0x0800);
    }
    boundary = u16(ram.u16(root + S.posY) + ram.u16(a5 + R.lower));
    if (boundary <= 0x4000) {
      boundaryPair(ram, rom, a5, root, ctx, ram.u16(a5 + R.lower), false);
      ram.setU16(a5 + R.lower, ram.u16(a5 + R.lower) + 0x0800);
    }
  }

  const life = u16(ram.u16(a5 + R.life) - 1);
  ram.setU16(a5 + R.life, life);
  if (life === 0) { freeEnemy(ram, a5); return; }
  drawPair(ram, rom, root, ram.u16(a5 + R.offset));
}

function openingVolley(ram, rom, a5, root, ctx) {
  const oldOuter = ram.u8(a5 + R.outer);
  ram.setU8(a5 + R.outer, oldOuter - 1);
  if (oldOuter !== 0) return;
  ram.setU8(a5 + R.outer, ram.u16(G.loop) === 0 ? 0x12 : 0x16);

  const player = selectedPlayer(ram, a5);
  if (player === 0) return;
  const offset = ram.u16(a5 + R.offset);
  aim256(aimTables(rom), ram.u16(root + S.posX),
    u16(ram.u16(root + S.posY) + 0xff00 + offset),
    ram.u16(player + 2), ram.u16(player + 4));

  let heading = ram.u16(G.loop) === 0 ? 0x75 : 0x70;
  const pos = ram.u32(root + S.posX);
  const d3 = u16(0xff00 + offset);
  for (let group = 0; group < 2; group++) {
    for (let i = 0; i < 4; i++, heading = u16(heading + 2)) {
      shoot(ram, rom, a5, ctx, 0x27da0a, 0x281764,
        { d0: 0xfffd0013, d1: heading, d2: pos, d3, d4: 0 });
    }
    heading = u16(heading + 0x0a + (ram.u16(G.loop) !== 0 ? 0x0a : 0));
  }

  const nested = ram.u8(a5 + R.nested);
  ram.setU8(a5 + R.nested, nested - 1);
  if (nested === 0) {
    ram.setU8(a5 + R.nested, ram.u8(a5 + R.nestedReload));
    ram.setU8(a5 + R.outer, ram.u8(a5 + R.outerReload));
  }
}

function state2Volley(ram, rom, a5, root, ctx) {
  let table = ram.u32(a5 + R.deltaTable);
  if (ram.u8(a5 + R.volleys) === ram.u8(a5 + R.volleysReload)) {
    const player = selectedPlayer(ram, a5);
    if (player === 0) return false;
    const selfX = u16(ram.u16(root + S.posX) + 0x0800);
    table = ram.u16(player + 2) < selfX ? 0x27da60 : 0x27da68;
    ram.setU32(a5 + R.deltaTable, table);
    const dir = aim256(aimTables(rom), selfX,
      u16(ram.u16(root + S.posY) + 0xff00 + ram.u16(a5 + R.offset)),
      ram.u16(player + 2), ram.u16(player + 4));
    ram.setU8(a5 + R.aimed, dir);
  }

  let heading = ram.u8(a5 + R.aimed);
  const pos = ram.u32(root + S.posX);
  const low = ram.u16(a5 + R.offset);
  const vectors = [0x0800fb80, 0x08000280, 0x06000280, 0x0600fb80];
  for (let i = 0; i < 4; i++) {
    heading = u16(heading + i16(rom.u16(table + i * 2)));
    const d3 = ((vectors[i] & 0xffff0000) | u16(vectors[i] + low)) >>> 0;
    shoot(ram, rom, a5, ctx, 0x27d806 + i * 0x12, 0x281708,
      { d0: 0x00080016, d1: heading, d2: pos, d3, d4: 0 });
  }
  return true;
}

function liveState(ram, rom, a5, root, ctx) {
  const state = ram.u16(a5 + R.state);
  if (state === 0) {
    openingVolley(ram, rom, a5, root, ctx);
    const old = ram.u8(a5 + R.wait);
    ram.setU8(a5 + R.wait, old - 1);
    if (old === 0) {
      ram.setU8(a5 + R.wait, 0x10);
      ram.setU16(a5 + R.state, 1);
    }
    return;
  }
  if (state === 1) {
    const old = ram.u8(a5 + R.artTimer);
    ram.setU8(a5 + R.artTimer, old - 1);
    if (old === 0) {
      ram.setU8(a5 + R.artTimer, ram.u8(a5 + R.artReload));
      const art = u16(ram.u16(a5 + R.art) + 4);
      ram.setU16(a5 + R.art, art);
      if (art === 0x1c) ram.setU16(a5 + R.state, 2);
    }
    return;
  }
  if (state === 2) {
    const old = ram.u8(a5 + R.wait);
    ram.setU8(a5 + R.wait, old - 1);
    if (old !== 0) return;
    ram.setU8(a5 + R.wait, ram.u8(a5 + R.onScreen + 1)); // record +$17
    state2Volley(ram, rom, a5, root, ctx);
    const volleys = ram.u8(a5 + R.volleys);
    ram.setU8(a5 + R.volleys, volleys - 1);
    if (volleys === 0) {
      ram.setU8(a5 + R.volleys, ram.u8(a5 + R.volleysReload));
      ram.setU8(a5 + R.wait, 1);
      ram.setU16(a5 + R.state, 3);
    }
    return;
  }
  if (state !== 3) return;
  if (ram.u8(a5 + R.wait) !== 0) {
    ram.setU8(a5 + R.wait, ram.u8(a5 + R.wait) - 1);
    return;
  }
  const old = ram.u8(a5 + R.artTimer);
  ram.setU8(a5 + R.artTimer, old - 1);
  if (old !== 0) return;
  ram.setU8(a5 + R.artTimer, ram.u8(a5 + R.artReload));
  const art = u16(ram.u16(a5 + R.art) - 4);
  ram.setU16(a5 + R.art, art);
  if (art === 0) {
    ram.setU8(a5 + R.wait, u16(0x80 - ram.u16(G.rankBA)) & 0xff);
    ram.setU16(a5 + R.state, 0);
    ram.setU8(a5 + R.outer, 0x10);
    ram.setU8(a5 + R.nested, ram.u8(a5 + R.nestedReload));
  }
}

function oscillate(ram, a5) {
  let velocity = i16(ram.u16(a5 + R.velocity));
  let offset = u16(ram.u16(a5 + R.offset) + velocity);
  ram.setU16(a5 + R.offset, offset);
  if (velocity < 0) {
    if (i16(offset) < i16(0xec00)) velocity = 0x0080;
  } else if (i16(offset) > 0x1400) velocity = -0x0080;
  ram.setU16(a5 + R.velocity, velocity);
}

function killA3(ram, rom, a5, root, ctx, hit) {
  ctx.soundPost?.(0x28c2dc);
  scoreKill(ram, rom, ctx, 0x88, hit);
  ram.setU16(root + S.flags, 0x8080);
  ram.setU16(root + 0x20, 0x8000);
  ram.setU8(root + S.palette, ram.u8(a5 + R.rootPal));
  ram.setU8(root + 0x3d, ram.u8(a5 + R.linkedPal));
  if (ram.u16(G.loop) === 0)
    allocPoolA27F8F0(ram, rom, ctx, 0x4c, ram.u16(a5 + R.offset), 4, root);

  const e = spawnEffect(ram, ctx, 0x0d, 0x27d93e);
  ram.setU32(e + B.pos, ram.u32(root + S.posX));
  ram.setU16(e + B.bucket, 0x0c);
  ram.setU16(e + B.sub12, 0);
  ram.setU16(e + B.sub14, 0x0400);
  ram.setU16(e + B.nudge, 0xfa00);
  ram.setU16(e + B.nudge + 2, ram.u16(a5 + R.offset));
  ram.setU16(e + B.delay, 2);
  ram.setU16(a5 + R.upper, ram.u16(a5 + R.offset) - 0x0800);
  ram.setU16(a5 + R.lower, ram.u16(a5 + R.offset) + 0x0800);
  cleanupA3(ram, rom, a5, root, ctx);
}

export function handlerA3(ram, rom, a5, ctx) {
  const root = ram.u32(a5 + R.sub);
  if ((ram.u8(root + 1) & 0x80) !== 0) {
    cleanupA3(ram, rom, a5, root, ctx);
    return;
  }
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported)) return;

  const x = u16(ram.u16(root + S.posX) + 0x0e00);
  const outside = x + 0x7400 > 0xffff;
  if (outside) {
    if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; }
  } else ram.setU8(a5 + R.onScreen, 1);
  ram.setU32(root + 0x22, ram.u32(root + S.posX));

  const hit = ram.u8(root + 0x20) & 0x5c;
  let rootPal = ram.u8(a5 + R.rootPal);
  let linkedPal = ram.u8(a5 + R.linkedPal);
  if (hit === 0) {
    if (ram.u16(root + 0x38) < 0x0780 && ram.u16(G.lowFlashGate) === 0)
      rootPal = linkedPal = 0x19;
  } else {
    ram.setU8(root + 0x20, ram.u8(root + 0x20) & 0xa3);
    scoreHit(ram, ctx, root, hit);
    rootPal = ram.u8(root + S.palette);
    linkedPal = ram.u8(root + 0x3d);
    if (rootPal === 0x19) {
      rootPal = ram.u8(a5 + R.rootPal);
      linkedPal = ram.u8(a5 + R.linkedPal);
    }
    rootPal ^= ram.u8(a5 + R.rootXor);
    linkedPal ^= ram.u8(a5 + R.linkedXor);
    if (i16(ram.u16(root + 0x38)) < 0) {
      killA3(ram, rom, a5, root, ctx, hit);
      return;
    }
  }
  ram.setU8(root + S.palette, rootPal);
  ram.setU8(root + 0x3d, linkedPal);

  if (ram.u16(G.freeze) === 0) {
    if (i16(ram.u16(root + S.posX)) >= 0x1000)
      liveState(ram, rom, a5, root, ctx);
    const art = ram.u16(a5 + R.art);
    if (art <= 0x1c) ram.setU32(root + 0x2a, rom.u32(0x27da40 + art));
    oscillate(ram, a5);
  }
  drawPair(ram, rom, root, ram.u16(a5 + R.offset));
}
