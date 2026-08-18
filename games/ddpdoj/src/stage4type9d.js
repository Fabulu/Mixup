// Stage-4 type $9D and its live deferred child $9E.
//
// `$27B78A` owns the three-part carrier, its two alternating attacks, death
// presentation, and the `$9E` launch at the midpoint of the closing animation.
// `$27C2FC` owns that child. Keeping the pair together makes the direct spawn
// dependency explicit without pulling the adjacent, unrelated type `$9F` in.

import { u16, i16 } from './ram.js';
import { freeEnemy } from './initbody.js';
import { stepMovement } from './movement.js';
import { AimTables, aim256 } from './aim.js';
import { fire as fireBullet, WriteLog } from './bullets.js';
import { enqueueDeferred, DEFQ_D1 } from './spawn.js';
import { enqueueThroughStub, enqueueRegistersThroughStub } from './spritequeue.js';
import { armScreenClear } from './midboss.js';
import { scoreHit, scoreKill } from './score.js';
import { spawnEffect, B } from './effects.js';
import { spawnItem } from './items.js';
import { drawByte2431F4, drawNegative242EC2, drawWord242EC2,
  drawWord24328E } from './rng.js';
import { spawnCues28AC72 } from './cues.js';
import { loadAnimObjects246410 } from './animobjects.js';

const G = {
  freeze: 0x8130d2, clock: 0x8130ce, lowFlashGate: 0x8130ca,
  rootGate: 0x8130d8, phaseGate: 0x8130dc, rankB2: 0x8130b2,
  loop: 0x811f72,
};
const R = {
  sub: 0x06, player: 0x03, onScreen: 0x16, state: 0x18,
  palette: 0x1a, xor: 0x1b, wait: 0x1c, waitReload: 0x1d,
  attackSel: 0x1e, attackReload: 0x1f, art: 0x20, overlay: 0x22,
  death: 0x24, deathFx: 0x26, deathFxReload: 0x27,
  cadence: 0x28, cadenceReload: 0x29, armor: 0x2a,
  aimCadence: 0x2c, aimReload: 0x2d, itemTimer: 0x2e,
  phaseTimer: 0x30, hitMask: 0x32, aimPick: 0x34, aimPickReload: 0x35,
};
const S = {
  flags: 0x00, posX: 0x02, posY: 0x04, sprite: 0x0a,
  hp: 0x18, speed: 0x1a, heading: 0x1b, attr: 0x1c,
  palette: 0x1d, timer: 0x1e,
};
const PLAYER = [0x8103e6, 0x810448];
const AIM_TABLES = new WeakMap();

function aimTables(rom) {
  let t = AIM_TABLES.get(rom);
  if (!t) { t = new AimTables(rom); AIM_TABLES.set(rom, t); }
  return t;
}

function shoot(ram, rom, a5, ctx, site, entry, regs) {
  ctx.bulletSpawn?.(site, fireBullet({ ram, rom, log: new WriteLog(ram) },
    entry, { ...regs, a5 }));
}

function selectedPlayer(ram, a5) {
  let first = ram.u8(a5 + R.player) === 0 ? 0 : 1;
  let second = first ^ 1;
  if (i16(ram.u16(PLAYER[first])) >= 0) {
    if (i16(ram.u16(PLAYER[second])) >= 0) return null;
    first = second;
  }
  return PLAYER[first];
}

function updateSideAim(ram, rom, a5, root, child, yBias) {
  let first = ram.u8(a5 + R.player) === 0 ? 0 : 1;
  let second = first ^ 1;
  if (i16(ram.u16(PLAYER[first])) >= 0) {
    if (i16(ram.u16(PLAYER[second])) >= 0) {
      ram.setU8(a5 + R.aimCadence, 4);                 // $27C170/$27C1BC
      return;
    }
    first = second;
  }
  ram.setU8(a5 + R.player, ram.u8(a5 + R.player) ^ 1);// $27C14A/$27C196
  const p = PLAYER[first];
  const dir = aim256(aimTables(rom),
    u16(ram.u16(root + S.posX) + 0xe100),
    u16(ram.u16(root + S.posY) + yBias),
    ram.u16(p + 0x02), ram.u16(p + 0x04));
  ram.setU8(child + S.heading, dir);
}

function minPlayerAxisDistance(ram, root, yBias) {
  let best = 0x7fff;
  const y = u16(ram.u16(root + S.posY) + yBias);
  for (const p of PLAYER) {
    if (i16(ram.u16(p)) >= 0) continue;
    let d = i16(u16(y - ram.u16(p + 0x04)));
    if (d < 0) d = -d;
    if (d < best) best = d;
  }
  return best;
}

const DEATH_ROWS = Object.freeze([
  [0x0d, 0x1400, 0x0000, null,   0x0400, 0x00],
  [0x85, 0x1400, 0x0600, 0x0658, 0x0000, 0x02],
  [0x0d, 0x0c00, 0xfe00, 0x06a8, 0x0000, 0x02],
  [0x85, 0x0400, 0xfc00, 0x0a88, 0x0400, 0x06],
  [0x0d, 0x0600, 0x0400, 0x0a78, 0x0400, 0x04],
  [0x85, 0xf600, 0x0a00, 0x0a70, 0x0400, 0x0a],
  [0x0d, 0xf000, 0xfe00, 0x0588, 0x0400, 0x08],
  [0x85, 0xe000, 0xfc00, 0x04a0, 0x0400, 0x08],
  [0x0d, 0xd800, 0x0400, 0x0460, 0x0400, 0x08],
]);
const ROOT_DEATH_SITES = Object.freeze([
  0x27b4dc, 0x27b504, 0x27b53e, 0x27b578, 0x27b5b2,
  0x27b5ec, 0x27b626, 0x27b660, 0x27b69a,
]);
const LEFT_DEATH_SITES = Object.freeze([
  0x27bd06, 0x27bd2e, 0x27bd68, 0x27bda2, 0x27bddc,
  0x27be16, 0x27be50, 0x27be8a, 0x27bec4,
]);
const RIGHT_DEATH_SITES = Object.freeze([
  0x27bf2c, 0x27bf54, 0x27bf8e, 0x27bfc8, 0x27c002,
  0x27c03c, 0x27c076, 0x27c0b0, 0x27c0ea,
]);

function deathEffects(ram, ctx, part, sites) {
  for (let i = 0; i < DEATH_ROWS.length; i++) {
    const [kind, nx, ny, speed, sub14, delay] = DEATH_ROWS[i];
    const e = spawnEffect(ram, ctx, kind, sites[i]);
    ram.setU32(e + B.pos, ram.u32(part + S.posX));
    ram.setU16(e + B.bucket, 0x10);
    ram.setU16(e + B.nudge, nx);
    ram.setU16(e + B.nudge + 2, ny);
    if (speed !== null) ram.setU16(e + B.speed, speed);
    ram.setU16(e + B.sub12, 0);
    ram.setU16(e + B.sub14, sub14);
    ram.setU16(e + B.delay, delay);
  }
}

function updateDeadPartArt(ram, part, finalArt) {
  if ((ram.u8(part + 1) & 0x80) === 0) return;
  const timer = ram.u16(part + S.timer);
  if (timer === 0) return;
  const next = u16(timer - 1);
  ram.setU16(part + S.timer, next);
  if (next === 0) ram.setU32(part + S.sprite, finalArt);
}

function killSide(ram, rom, a5, root, child, right, ctx, mask, award) {
  if (award) {
    scoreKill(ram, rom, ctx, 0x0385, mask);
    ctx.soundPost?.(0x28c2dc);
  }
  ram.setU16(child + S.flags, 0x8080);
  ctx.soundPost?.(0x28c2c2);
  deathEffects(ram, ctx, child, right ? RIGHT_DEATH_SITES : LEFT_DEATH_SITES);
  ram.setU8(child + S.palette, ram.u8(a5 + R.palette));
  void root;
}

function drawCarrier(ram, rom, a5, root) {
  enqueueThroughStub(ram, rom, 0x23d816, root + 0x20);
  enqueueThroughStub(ram, rom, 0x23d816, root + 0x40);
  enqueueThroughStub(ram, rom, 0x23d816, root);
  if ((ram.u8(root + 1) & 0x80) !== 0 || ram.u16(a5 + R.state) !== 2) return;
  const cursor = ram.u16(a5 + R.overlay);
  if (i16(cursor) < 0) return;
  const pos = ((u16(ram.u16(root + S.posX) + 0xb800) << 16)
    | u16(ram.u16(root + S.posY) + 0xf200)) >>> 0;
  enqueueRegistersThroughStub(ram, rom, 0x23df58, pos,
    rom.u32(0x27c204 + cursor), 0x2470, 0x0011);
}

function drawCarrierSides(ram, rom, root) {
  enqueueThroughStub(ram, rom, 0x23d816, root + 0x20);
  enqueueThroughStub(ram, rom, 0x23d816, root + 0x40);
}

function cleanup9D(ram, rom, a5, root, ctx) {
  updateDeadPartArt(ram, root + 0x20, 0x2c67e8);
  updateDeadPartArt(ram, root + 0x40, 0x2c7bf0);

  let death = ram.u16(a5 + R.death);
  if (death !== 0) {
    armScreenClear(ram, ctx, ram.u16(a5 + R.hitMask),
      'type $9D death countdown $27B4C0');
    death = u16(death - 1);
    ram.setU16(a5 + R.death, death);
    if (death === 0) {
      ctx.soundPost?.(0x28c2c2);
      deathEffects(ram, ctx, root, ROOT_DEATH_SITES);
      loadAnimObjects246410(ram, rom, 0x27c214);
      ctx.soundPost?.(0x28c310);
      drawCarrier(ram, rom, a5, root);
      return;
    }

    const old = ram.u8(a5 + R.deathFx);
    ram.setU8(a5 + R.deathFx, old - 1);
    if (old === 0) {
      ram.setU8(a5 + R.deathFx, ram.u8(a5 + R.deathFxReload));
      // $27B6F4 lea $28C274,A0 / $27B6FA jsr $242EC2 / $27B700 6A06 bpl.s $27B708 /
      // $27B702 lea $28C28E,A0 / $27B708 jsr (A0).  W416/D48: N is bit 7 of the table
      // byte, so the $28C28E arm runs on half the draws instead of never.
      ctx.soundPost?.(drawNegative242EC2(ram, rom) ? 0x28c28e : 0x28c274);
      const kind = rom.u16(0x27b778 + (drawWord242EC2(ram, rom) & 7) * 2);
      const e = spawnEffect(ram, ctx, kind, 0x27b720);
      ram.setU32(e + B.pos, ram.u32(root + S.posX));
      ram.setU16(e + B.bucket, 0x10);
      ram.setU16(e + B.sub12, 0);
      ram.setU16(e + B.sub14, 0x0800);
      ram.setU8(e + B.speed, drawByte2431F4(ram, rom) + 3);
      ram.setU8(e + B.angle, drawWord242EC2(ram, rom));
      let d0 = i16(drawWord24328E(ram, rom));
      ram.setU16(e + B.nudge, u16(d0 + (d0 >> 1) + 0xf800));
      d0 = i16(drawWord24328E(ram, rom));
      ram.setU16(e + B.nudge + 2, u16(d0 >> 1));
    }
    drawCarrier(ram, rom, a5, root);
    return;
  }

  const rootTimer = ram.u16(root + S.timer);
  if (rootTimer !== 0) {
    armScreenClear(ram, ctx, ram.u16(a5 + R.hitMask),
      'type $9D post-death tail $27B4AE');
    ram.setU16(root + S.timer, u16(rootTimer - 1));
    drawCarrier(ram, rom, a5, root);
    return;
  }

  const phase = ram.u16(a5 + R.phaseTimer);
  if (phase !== 0) {
    const next = u16(phase - 1);
    ram.setU16(a5 + R.phaseTimer, next);
    if (next === 0) ram.setU16(G.phaseGate, 0);
  }
  const item = ram.u16(a5 + R.itemTimer);
  if (item !== 0) {
    const next = u16(item - 1);
    ram.setU16(a5 + R.itemTimer, next);
    if (next === 0) {
      const x = ram.u16(root + S.posX);
      if (x < 0x1000) ram.setU16(root + S.posX, 0x1000);
      spawnItem(ram, rom, ctx, 0x10, root, 0x27b4a0);
      ram.setU16(root + S.posX, x);
    }
  }
  drawCarrierSides(ram, rom, root);
}

function handleSide(ram, rom, a5, root, child, right, ctx) {
  if ((ram.u8(child + 1) & 0x80) !== 0) {
    updateDeadPartArt(ram, child, right ? 0x2c7bf0 : 0x2c67e8);
    return;
  }

  if (ram.u8(a5 + R.aimCadence) === 0) {
    const near = minPlayerAxisDistance(ram, root,
      right ? 0x1780 : 0xe880) < 0x0c00;
    if (near) shoot(ram, rom, a5, ctx, right ? 0x27b96e : 0x27b8c0,
      0x2817a8, {
        d0: 0x0006000b, d1: ram.u8(child + S.heading),
        d2: ram.u32(root + S.posX),
        d3: right ? 0xe1001780 : 0xe100e880, d4: 0,
      });
  }

  const hit = ram.u8(child + S.flags) & 0x5c;
  let palette = ram.u8(a5 + R.palette);
  if (hit === 0) {
    if (ram.u16(child + S.hp) < 0x0880 && ram.u16(G.lowFlashGate) === 0)
      palette = 0x19;
  } else {
    ram.setU8(child + S.flags, ram.u8(child + S.flags) & 0xa3);
    scoreHit(ram, ctx, root, hit);
    palette = ram.u8(child + S.palette);
    if (palette === 0x19) palette = ram.u8(a5 + R.palette);
    palette ^= ram.u8(a5 + R.xor);
    if (i16(ram.u16(child + S.hp)) < 0) {
      killSide(ram, rom, a5, root, child, right, ctx, hit, true);
      return;
    }
  }
  ram.setU8(child + S.palette, palette);
}

function attack9D(ram, rom, a5, root, ctx) {
  const state = ram.u16(a5 + R.state);
  if (state === 0) {
    if (ram.u16(G.clock) >= 0x021c) return;
    const old = ram.u8(a5 + R.wait);
    ram.setU8(a5 + R.wait, old - 1);
    if (old === 0) ram.setU16(a5 + R.state, 1);
    return;
  }

  if (state === 1) {
    const old = ram.u8(a5 + R.cadence);
    ram.setU8(a5 + R.cadence, old - 1);
    if (old !== 0) return;
    ram.setU8(a5 + R.cadence, ram.u8(a5 + R.cadenceReload));
    const art = u16(ram.u16(a5 + R.art) + 4);
    ram.setU16(a5 + R.art, art);
    if (art !== 0x24) return;

    const p = selectedPlayer(ram, a5);
    if (p !== null) {
      const aimed = aim256(aimTables(rom),
        u16(ram.u16(root + S.posX) + 0xd600), ram.u16(root + S.posY),
        ram.u16(p + 0x02), ram.u16(p + 0x04));
      const pos = ram.u32(root + S.posX);
      if (ram.u8(a5 + R.attackSel) !== 0) {
        let base = u16(aimed - 0x0c);
        for (let group = 0; group < 7; group++, base = u16(base + 4)) {
          let d0 = 0xfff60005;
          const vector = (rom.u32(0x2736fa + (((base + 2) & 0xfc)))
            + 0xd6000000) >>> 0;
          shoot(ram, rom, a5, ctx, 0x27baa0, 0x281744,
            { d0, d1: base, d2: pos, d3: vector, d4: 0 });
          if (group < 6) {
            d0 = (d0 + 0x00040000) >>> 0;
            shoot(ram, rom, a5, ctx, 0x27bab4, 0x2816f6,
              { d0, d1: base + 2, d2: pos, d3: vector, d4: 0 });
            d0 = (d0 + 0x00040000) >>> 0;
            shoot(ram, rom, a5, ctx, 0x27bac2, 0x281744,
              { d0, d1: base, d2: pos, d3: vector, d4: 0 });
            d0 = (d0 + 0x00040000) >>> 0;
            shoot(ram, rom, a5, ctx, 0x27bad0, 0x2816f6,
              { d0, d1: base + 2, d2: pos, d3: vector, d4: 0 });
          } else {
            shoot(ram, rom, a5, ctx, 0x27bae0, 0x281744,
              { d0: (d0 + 0x00080000) >>> 0, d1: base,
                d2: pos, d3: vector, d4: 0 });
          }
        }
      } else {
        let heading = 0x48;
        if (i16(u16(ram.u16(root + S.posX) + 0xd600))
            < i16(ram.u16(p + 0x02))) heading = 0xffc8;
        for (let i = 0; i < 29; i++, heading = u16(heading + 4)) {
          const d0 = (i & 1) !== 0 ? 0xfffe0004 : 0xfffc0004;
          const vector = (rom.u32(0x2736fa + (((heading + 2) & 0xfc)))
            + 0xd6000000) >>> 0;
          shoot(ram, rom, a5, ctx, 0x27bb5a,
            (i & 1) !== 0 ? 0x2816f6 : 0x281744,
            { d0, d1: heading, d2: pos, d3: vector, d4: 0 });
        }
      }
    }
    ram.setU8(a5 + R.player, ram.u8(a5 + R.player) ^ 1);
    ram.setU16(a5 + R.state, 2);
    return;
  }

  if (state !== 2) return;
  const old = ram.u8(a5 + R.cadence);
  ram.setU8(a5 + R.cadence, old - 1);
  if (old !== 0) return;
  ram.setU8(a5 + R.cadence, ram.u8(a5 + R.cadenceReload));
  ram.setU16(a5 + R.overlay, u16(ram.u16(a5 + R.overlay) - 4));
  const art = u16(ram.u16(a5 + R.art) + 4);
  ram.setU16(a5 + R.art, art);
  if (art === 0x28) {
    const q = enqueueDeferred(ram, 0x9e, DEFQ_D1.FIXED00);
    const pos = ram.u32(root + S.posX);
    ram.setU32(q.addr + 0x16,
      ((u16((pos >>> 16) + 0x1e00) << 16) | (pos & 0xffff)) >>> 0);
  }
  if (art !== 0x40) return;
  ram.setU16(a5 + R.art, 0);
  ram.setU16(a5 + R.overlay, 0x000c);
  ram.setU16(a5 + R.state, 1);
  ram.setU16(a5 + R.cadence, 0);
  const select = ram.u8(a5 + R.attackSel);
  ram.setU8(a5 + R.attackSel, select - 1);
  if (select === 0) {
    ram.setU8(a5 + R.attackSel, ram.u8(a5 + R.attackReload));
    ram.setU8(a5 + R.wait, u16(0x00a0 - ram.u16(G.rankB2)) & 0xff);
    ram.setU8(a5 + R.cadence, 1);
    ram.setU8(a5 + R.cadenceReload, 1);
    ram.setU16(a5 + R.state, 0);
  }
}

export function handler9D(ram, rom, a5, ctx) {
  const root = ram.u32(a5 + R.sub);
  stepMovement(ram, rom, a5, ctx.tables, ctx.unported);

  const first = u16(ram.u16(root + S.posX) + 0x3400);
  const outside = first + 0x2800 > 0xffff;
  if (outside) {
    if (ram.u8(a5 + R.onScreen) !== 0) {
      ram.setU16(G.rootGate, 0);
      freeEnemy(ram, a5);
      return;
    }
  } else {
    ram.setU8(a5 + R.onScreen, 1);
  }

  const x = ram.u16(root + S.posX), y = ram.u16(root + S.posY);
  ram.setU16(root + 0x22, u16(x + 0xec00));
  ram.setU16(root + 0x24, u16(y + 0xec00));
  ram.setU16(root + 0x42, u16(x + 0xec00));
  ram.setU16(root + 0x44, u16(y + 0x1400));

  if ((ram.u8(root + 1) & 0x80) !== 0) {
    cleanup9D(ram, rom, a5, root, ctx);
    return;
  }

  if (ram.u16(a5 + R.armor) !== 0) {
    ram.setU16(a5 + R.armor, u16(ram.u16(a5 + R.armor) - 1));
    ram.setU16(root + S.hp, 0x7000);
    ram.setU16(root + 0x38, 0x2200);
    ram.setU16(root + 0x58, 0x2200);
  }

  const hit = ram.u8(root + S.flags) & 0x5c;
  let palette = ram.u8(a5 + R.palette);
  if (hit === 0) {
    if (ram.u16(root + S.hp) < 0x1c00 && ram.u16(G.lowFlashGate) === 0)
      palette = 0x19;
  } else {
    ram.setU8(root + S.flags, ram.u8(root + S.flags) & 0xa3);
    scoreHit(ram, ctx, root, hit);
    palette = ram.u8(root + S.palette);
    if (palette === 0x19) palette = ram.u8(a5 + R.palette);
    palette ^= ram.u8(a5 + R.xor);
    if (i16(ram.u16(root + S.hp)) < 0) {
      ram.setU16(a5 + R.hitMask, hit);
      scoreKill(ram, rom, ctx, 0x0683, hit);
      ctx.soundPost?.(0x28c2dc);
      ram.setU16(G.rootGate, 0);
      ram.setU16(root + S.flags, 0x8080);
      ram.setU8(root + S.palette, ram.u8(a5 + R.palette));
      armScreenClear(ram, ctx, hit, 'type $9D root death $27BC84');
      if ((ram.u8(root + 0x21) & 0x80) === 0) {
        killSide(ram, rom, a5, root, root + 0x20, false, ctx, hit, false);
        ram.setU16(a5 + R.itemTimer, 0);
      }
      if ((ram.u8(root + 0x41) & 0x80) === 0) {
        killSide(ram, rom, a5, root, root + 0x40, true, ctx, hit, false);
        ram.setU16(a5 + R.itemTimer, 0);
      }
      if (ram.u16(G.loop) !== 0) ram.setU16(a5 + R.itemTimer, 0);
      drawCarrier(ram, rom, a5, root);
      return;
    }
  }
  ram.setU8(root + S.palette, palette);

  let old = ram.u8(a5 + R.aimCadence);
  ram.setU8(a5 + R.aimCadence, old - 1);
  if (old === 0) {
    ram.setU8(a5 + R.aimCadence, 4);
    old = ram.u8(a5 + R.aimPick);
    ram.setU8(a5 + R.aimPick, old - 1);
    if (old === 0) {
      ram.setU8(a5 + R.aimPick, ram.u8(a5 + R.aimPickReload));
      ram.setU8(a5 + R.aimCadence, ram.u8(a5 + R.aimReload));
      updateSideAim(ram, rom, a5, root, root + 0x20, 0xe880);
      updateSideAim(ram, rom, a5, root, root + 0x40, 0x1780);
    }
  }

  handleSide(ram, rom, a5, root, root + 0x20, false, ctx);
  handleSide(ram, rom, a5, root, root + 0x40, true, ctx);
  spawnCues28AC72(ram, rom, a5, root);
  if (ram.u16(G.freeze) === 0) {
    if (ram.u16(G.clock) >= 0x0228) ram.setU16(G.phaseGate, 0);
    attack9D(ram, rom, a5, root, ctx);
    ram.setU32(root + S.sprite, rom.u32(0x27c1c4 + ram.u16(a5 + R.art)));
  }
  drawCarrier(ram, rom, a5, root);
}

function bounds9E(ram, a5, sub) {
  let w = u16(ram.u16(sub + S.posY) + 0x0a00);
  const outY = w + 0xb400 > 0xffff;
  let outX = false;
  if (!outY) {
    w = u16(ram.u16(sub + S.posX) + 0x0e00);
    outX = w + 0x7400 > 0xffff;
  }
  if (outY || outX) {
    if (ram.u8(a5 + R.onScreen) !== 0) {
      freeEnemy(ram, a5);
      return true;
    }
  } else {
    ram.setU8(a5 + R.onScreen, 1);
  }
  return false;
}

function death9E(ram, rom, a5, sub, ctx, score, hit = 0) {
  if (score) scoreKill(ram, rom, ctx, 0, hit);
  const e = spawnEffect(ram, ctx, 0x85, 0x27c448);
  ram.setU32(e + B.pos, ram.u32(sub + S.posX));
  ram.setU16(e + B.bucket, 0x0c);
  ram.setU16(e + B.sub12, 0);
  ram.setU16(e + B.sub14, 0x0400);
  ram.setU32(e + B.nudge, 0);
  ctx.soundPost?.(0x28c274);
  freeEnemy(ram, a5);
}

export function handler9E(ram, rom, a5, ctx) {
  const sub = ram.u32(a5 + R.sub);
  if (ram.u16(G.rootGate) === 0) {
    death9E(ram, rom, a5, sub, ctx, false);
    return;
  }

  const hit = ram.u8(sub + S.flags) & 0x5c;
  let palette = ram.u8(a5 + R.state); // type $9E record +$18 is base palette byte
  if (hit === 0) {
    if (ram.u16(sub + S.hp) < 0x0100 && ram.u16(G.lowFlashGate) === 0)
      palette = 0x19;
  } else {
    ram.setU8(sub + S.flags, ram.u8(sub + S.flags) & 0xa3);
    scoreHit(ram, ctx, sub, hit);
    palette = ram.u8(sub + S.palette);
    if (palette === 0x19) palette = ram.u8(a5 + R.state);
    palette ^= ram.u8(a5 + R.state + 1);
    if (i16(ram.u16(sub + S.hp)) < 0) {
      death9E(ram, rom, a5, sub, ctx, true, hit);
      return;
    }
  }
  ram.setU8(sub + S.palette, palette);

  const oldStarted = (ram.u8(sub + 1) & 0x20) !== 0;
  ram.setU8(sub + 1, ram.u8(sub + 1) | 0x20);
  if (oldStarted) {
    const velocity = ram.u16(a5 + 0x1a);
    ram.setU16(sub + S.posX, ram.u16(sub + S.posX) + velocity);
    let phase = ram.u16(a5 + 0x24);
    if (phase === 0) {
      const travel = u16(ram.u16(a5 + 0x1e) + velocity);
      ram.setU16(a5 + 0x1e, travel);
      if (travel >= 0x1600) { phase = 1; ram.setU16(a5 + 0x24, phase); }
    }
    if (phase !== 0) {
      if (i16(velocity) > -0x0200)
        ram.setU16(a5 + 0x1a, u16(velocity - 0x0080));
      const cursor = ram.u16(a5 + 0x22);
      ram.setU32(sub + S.sprite, rom.u32(0x27c480 + cursor));
      ram.setU16(a5 + 0x22, cursor === 0 ? 0x007c : cursor - 4);
      if (phase === 1) {
        const travel = u16(ram.u16(a5 + 0x1e) + ram.u16(a5 + 0x1a));
        ram.setU16(a5 + 0x1e, travel);
        if (travel >= 0x3000) ram.setU16(a5 + 0x24, 2);
      }
      const old = ram.u8(a5 + 0x20);
      ram.setU8(a5 + 0x20, old - 1);
      if (old === 0) {
        ram.setU8(a5 + 0x20, ram.u8(a5 + 0x21));
        ram.setU16(sub + S.posY,
          ram.u16(sub + S.posY) - ram.u16(a5 + 0x1c));
      }
    }
    if (i16(ram.u16(a5 + 0x1a)) <= -0x0200 && bounds9E(ram, a5, sub)) return;
  }

  ram.setU8(sub + 1, ram.u8(sub + 1) | 1);
  if (i16(ram.u16(sub + S.posX)) < 0) {
    ram.setU8(sub + 1, ram.u8(sub + 1) & 0xfe);
    return;
  }
  enqueueThroughStub(ram, rom,
    i16(ram.u16(a5 + 0x1a)) >= 0 ? 0x23d7da : 0x23f746, sub);
}
