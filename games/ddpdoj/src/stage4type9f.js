// Stage-4 type $9F and its live deferred fragment type $A4.
//
// `$27C81A` owns the final pre-boss structure: linked damage, threshold cues,
// opening animation, fragment shedding, and its explicit death palette/effect
// chains. `$27DB30` owns the fragments spawned every live state-2 pass.

import { asr, i16, u16 } from './ram.js';
import { freeEnemy } from './initbody.js';
import { stepMovement } from './movement.js';
import { scoreHit, scoreKill } from './score.js';
import { spawnCues28AC72 } from './cues.js';
import { armScreenClear243E02 } from './midboss.js';
import { spawnEffect, clearEffectPool, B } from './effects.js';
import { enqueueDeferred, DEFQ_D1 } from './spawn.js';
import { enqueueThroughStub, enqueueRegistersThroughStub } from './spritequeue.js';
import { drawByte2431F4, drawNegative242EC2, drawWord242EC2,
  drawWord24328E } from './rng.js';
import { install24150A } from './palette.js';
import { loadAnimObjects246410, loadAnimObjects24652A,
  freeAnimObjects246800 } from './animobjects.js';

const G = Object.freeze({ freeze: 0x8130d2, lowFlashGate: 0x8130ca });
const R = Object.freeze({
  sub: 0x06, onScreen: 0x16, state: 0x18, spread: 0x1e,
  artTimer: 0x22, artReload: 0x23, artCursor: 0x24, artEnd: 0x26,
  artStart: 0x28, growth: 0x2a, deathTimer: 0x2c,
  effectTimer: 0x2e, effectReload: 0x2f, cleanupTimer: 0x30,
  armorTimer: 0x32, animHandle: 0x34, phaseTimer: 0x38,
  hitMask: 0x3a, cue: 0x44,
});
const A4R = Object.freeze({
  terminalSprite: 0x16, animTimer: 0x1a, animReload: 0x1b,
  drawX: 0x1c, drawY: 0x1e, parentY: 0x20,
  parent: 0x24, parentX: 0x28,
});
const S = Object.freeze({
  flags: 0x00, posX: 0x02, posY: 0x04, offset: 0x06,
  sprite: 0x0a, size: 0x0e, hp: 0x18, speed: 0x1a,
  heading: 0x1b, attr: 0x1c, palette: 0x1d,
});

function drawRoot(ram, rom, root) {
  enqueueThroughStub(ram, rom, 0x23d762, root);
}

function installDeathPalette(ram, rom, ctx) {
  if (ctx.palette) {
    install24150A(ram, ctx.palette, 0x13, rom.bytes(0x224b78, 64), 0x27c6fa,
      'Stage-4 type $9F terminal root palette');
  } else {
    ctx.unported?.note(0x24150a,
      '$27C6FA type $9F terminal palette install has no PaletteState');
  }
}

const BLAST_ROWS = Object.freeze([
  [0x0d, 0x2800, 0x0000, null,   0x0400, 0x00, 0x27cbc0],
  [0x85, 0x2800, 0x0600, 0x0658, 0x0000, 0x02, 0x27cbe8],
  [0x0d, 0x2000, 0xfe00, 0x06a8, 0x0000, 0x02, 0x27cc22],
  [0x85, 0x1800, 0xfc00, 0x0a88, 0x0400, 0x06, 0x27cc5c],
  [0x0d, 0x1a00, 0x0400, 0x0a78, 0x0400, 0x04, 0x27cc96],
  [0x85, 0x0a00, 0x0a00, 0x0a70, 0x0400, 0x0a, 0x27ccd0],
  [0x0d, 0x0400, 0xfe00, 0x0588, 0x0400, 0x08, 0x27cd0a],
  [0x85, 0xf400, 0xfc00, 0x04a0, 0x0400, 0x08, 0x27cd44],
  [0x0d, 0xec00, 0x0400, 0x0460, 0x0400, 0x08, 0x27cd7e],
  [0x85, 0xdc00, 0xfc00, 0x04a0, 0x0400, 0x0a, 0x27cdb8],
  [0x0d, 0xd400, 0x0400, 0x0460, 0x0400, 0x0a, 0x27cdf2],
]);

/** Coordinate-local body of `$27CBB6`. It emits only the eleven authentic
 * pool-B rows and their sound, so private callers do not need a native root. */
export function finalBurst27CBB6At(ram, ctx, y, x) {
  ctx.soundPost?.(0x28c2c2);
  const position = (((y & 0xffff) << 16) | (x & 0xffff)) >>> 0;
  for (const [kind, ny, nx, speed, sub14, delay, site] of BLAST_ROWS) {
    const e = spawnEffect(ram, ctx, kind, site);
    ram.setU32(e + B.pos, position);
    ram.setU16(e + B.bucket, 0x10);
    ram.setU16(e + B.nudge, ny);
    ram.setU16(e + B.nudge + 2, nx);
    if (speed !== null) ram.setU16(e + B.speed, speed);
    ram.setU16(e + B.sub12, 0);
    ram.setU16(e + B.sub14, sub14);
    ram.setU16(e + B.delay, delay);
  }
}

/** W399 exported it: HIBACHI's A4 script 1 calls the SAME `$27CBB6` twice, at $2A5C3E and
 *  $2A5C4A, and a second transcription of a twelve-row table is how two copies end up with
 *  each other's constants. The native wrapper keeps its root-record contract. */
export function finalBurst27CBB6(ram, ctx, root) {
  finalBurst27CBB6At(ram, ctx, ram.u16(root + S.posX), ram.u16(root + S.posY));
}

function randomDeathEffect(ram, rom, a5, root, ctx) {
  // $27C774 lea $28C274,A0 / $27C77A jsr $242EC2 / $27C780 6A06 bpl.s $27C788 /
  // $27C782 lea $28C28E,A0 / $27C788 jsr (A0).  W416/D48: the branch is on bit 7.
  ctx.soundPost?.(drawNegative242EC2(ram, rom) ? 0x28c28e : 0x28c274);
  const kind = rom.u16(0x27c808 + (drawWord242EC2(ram, rom) & 7) * 2);
  const e = spawnEffect(ram, ctx, kind, 0x27c7a0);
  ram.setU32(e + B.pos, ram.u32(root + S.posX));
  ram.setU16(e + B.bucket, 0x10);
  ram.setU16(e + B.sub12, 0);
  ram.setU16(e + B.sub14, 0x0800);
  ram.setU8(e + B.speed, drawByte2431F4(ram, rom) + 3);
  ram.setU8(e + B.angle, drawWord242EC2(ram, rom));

  const x = i16(drawWord24328E(ram, rom));
  const xHalf = asr(x, 1);
  ram.setU16(e + B.nudge, u16(x + xHalf + asr(xHalf, 1) + 0xf800));
  const y = asr(i16(drawWord24328E(ram, rom)), 1);
  ram.setU16(e + B.nudge + 2, u16(y + asr(y, 1)));
}

function cleanup9F(ram, rom, a5, root, ctx) {
  if (ram.u16(a5 + R.deathTimer) === 0) {
    if (ram.u16(a5 + R.cleanupTimer) !== 0) {
      armScreenClear243E02(ram, ctx, ram.u16(a5 + R.hitMask),
        'type $9F cleanup $27C6DA');
      const next = u16(ram.u16(a5 + R.cleanupTimer) - 1);
      ram.setU16(a5 + R.cleanupTimer, next);
      if (next === 0) {
        ram.setU32(root + S.sprite, 0x002f12ac);
        installDeathPalette(ram, rom, ctx);
      }
    }
    drawRoot(ram, rom, root);
    return;
  }

  armScreenClear243E02(ram, ctx, ram.u16(a5 + R.hitMask),
    'type $9F death presentation $27C708');
  const left = u16(ram.u16(a5 + R.deathTimer) - 1);
  ram.setU16(a5 + R.deathTimer, left);
  if (left === 0) {
    clearEffectPool(ram);
    const savedY = ram.u16(root + S.posY);
    ram.setU16(root + S.posY, savedY + 0xf280);
    finalBurst27CBB6(ram, ctx, root);
    ram.setU16(root + S.posY, ram.u16(root + S.posY) + 0x1b00);
    finalBurst27CBB6(ram, ctx, root);
    ram.setU16(root + S.posY, savedY);
    ctx.soundPost?.(0x28c310);
  } else {
    if (left === 1) {
      freeAnimObjects246800(ram, ram.u32(a5 + R.animHandle));  // $27C724 jsr $246800
      loadAnimObjects246410(ram, rom, 0x27ce46);
    }
    const old = ram.u8(a5 + R.effectTimer);
    ram.setU8(a5 + R.effectTimer, old - 1);
    if (old === 0) {
      ram.setU8(a5 + R.effectTimer, ram.u8(a5 + R.effectReload));
      randomDeathEffect(ram, rom, a5, root, ctx);
    }
  }
  drawRoot(ram, rom, root);
}

function kill9F(ram, rom, a5, root, hit, ctx) {
  ram.setU16(a5 + R.hitMask, hit);
  scoreKill(ram, rom, ctx, 0x0788, hit);
  ctx.soundPost?.(0x28c846);
  ctx.soundPost?.(0x28c890);
  ctx.soundPost?.(0x28c310);
  ram.setU16(root, 0x8080);
  ram.setU16(root + 0x20, 0x8000);
  ram.setU16(root + 0x40, 0x8000);
  ram.setU8(root + S.palette, 0x13);
  armScreenClear243E02(ram, ctx, hit, 'type $9F fatal hit $27CB5C');
  ram.setU32(a5 + R.animHandle, loadAnimObjects24652A(ram, rom, 0x27ce38));
  drawRoot(ram, rom, root);
}

function liveState9F(ram, rom, a5, root, ctx) {
  const x = ram.u16(root + S.posX);
  const state = ram.u16(a5 + R.state);
  if (state === 0) {
    if (x <= 0x7000) {
      ram.setU16(a5 + R.spread, ram.u16(a5 + R.spread) - 0x40);
      ram.setU16(a5 + R.state, 1);
    }
    return;
  }

  if (i16(ram.u16(a5 + R.spread)) < 0x2400)
    ram.setU16(a5 + R.spread, ram.u16(a5 + R.spread) + 0x40);

  if (state === 1 && x <= 0x5000) {
    loadAnimObjects24652A(ram, rom, 0x27ce2a);
    ctx.soundPost?.(0x28c812);
    ram.setU16(a5 + R.phaseTimer, 0x20);
    ram.setU16(a5 + R.state, 2);
    return;                                             // $27C958 bra.w $27CA44
  }

  if ((ram.u8(root) & 0x20) === 0) {
    ram.setU16(root + S.posX, ram.u16(root + S.posX) + 0x40);
    const growth = u16(ram.u16(a5 + R.growth) + 0x40);
    ram.setU16(a5 + R.growth, growth);
    if (growth === 0x1040) {
      ram.setU16(root + S.posX, ram.u16(root + S.posX) - 0x40);
      ram.setU16(a5 + R.growth, growth - 0x40);
      ram.setU16(root, 0xa000);
      ram.setU16(root + 0x20, 0xa000);
    }
  }

  const now = ram.u16(a5 + R.state);
  if (now === 2) {
    if (ram.u16(a5 + R.phaseTimer) !== 0) {
      const timer = u16(ram.u16(a5 + R.phaseTimer) - 1);
      ram.setU16(a5 + R.phaseTimer, timer);
      if (timer === 0) ctx.soundPost?.(0x28c82c);
    }
    const q = enqueueDeferred(ram, 0xa4, DEFQ_D1.FIXED00);
    ram.setU32(q.addr + 0x24, root + 0x20);
    ram.setU16(q.addr + 0x28, 0x0800);
    if (ram.u16(root + S.posX) <= 0x4600) {
      ram.setU16(a5 + R.artEnd, 0x20);
      ram.setU16(a5 + R.artStart, 0x18);
      ram.setU16(a5 + R.state, 3);
    }
  } else if (now === 3 && ram.u16(root + S.posX) <= 0x4000) {
    ram.setU16(a5 + R.artEnd, 0x3c);
    ram.setU16(a5 + R.artStart, 0x34);
    loadAnimObjects246410(ram, rom, 0x27ce9c);
    ctx.soundPost?.(0x28c846);
    ram.setU16(a5 + R.state, 4);
  } else if (now === 4 && ram.u32(root + 0x2a) === 0x003031d8) {
    ram.setU16(root + 0x20, 0xa001);
    ctx.soundPost?.(0x28c85c);
    ram.setU16(a5 + R.phaseTimer, 0x40);
    ram.setU16(a5 + R.state, 5);
  }

  if (ram.u16(a5 + R.state) === 5 && ram.u16(a5 + R.phaseTimer) !== 0xffff) {
    const timer = u16(ram.u16(a5 + R.phaseTimer) - 1);
    ram.setU16(a5 + R.phaseTimer, timer);
    if (timer === 0xffff) ctx.soundPost?.(0x28c876);
  }
}

export function handler9F(ram, rom, a5, ctx) {
  const root = ram.u32(a5 + R.sub);
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported)) return;

  const biased = u16(ram.u16(root + S.posX) + 0x3800);
  const outside = biased + 0x2000 > 0xffff;
  if (outside) {
    if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; }
  } else ram.setU8(a5 + R.onScreen, 1);

  if ((ram.u8(root + 1) & 0x80) !== 0) {
    cleanup9F(ram, rom, a5, root, ctx);
    return;
  }

  ram.setU32(root + 0x42, ram.u32(root + S.posX));
  ram.setU16(root + 0x22, ram.u16(root + S.posX) + 0xdc00);
  ram.setU16(root + 0x24, ram.u16(root + S.posY));
  ram.setU16(root + 0x38, 0x7fff);
  ram.setU8(root + 0x20, ram.u8(root + 0x20) & 0xa3);
  if (ram.u16(a5 + R.armorTimer) !== 0) {
    ram.setU16(a5 + R.armorTimer, ram.u16(a5 + R.armorTimer) - 1);
    ram.setU16(root + S.hp, 0x7800);
    ram.setU16(root + 0x58, 0x7800);
  }

  const hit = (ram.u8(root) | ram.u8(root + 0x40)) & 0x5c;
  let palette;
  if (hit === 0) {
    palette = 0x13;
    if (ram.u16(root + S.hp) < 0x1e00 && ram.u16(G.lowFlashGate) === 0)
      palette = 0x19;
  } else {
    ram.setU8(root, ram.u8(root) & 0xa3);
    ram.setU8(root + 0x40, ram.u8(root + 0x40) & 0xa3);
    scoreHit(ram, ctx, root, hit);
    palette = ram.u8(root + S.palette);
    if (palette === 0x19) palette = 0x13;
    palette ^= 0x0c;
    const hp = Math.min(i16(ram.u16(root + S.hp)), i16(ram.u16(root + 0x58)));
    ram.setU16(root + S.hp, hp);
    ram.setU16(root + 0x58, hp);
    if (hp < 0) { kill9F(ram, rom, a5, root, hit, ctx); return; }
  }
  ram.setU8(root + S.palette, palette);
  spawnCues28AC72(ram, rom, a5, root);

  if (ram.u16(G.freeze) === 0) liveState9F(ram, rom, a5, root, ctx);

  const old = ram.u8(a5 + R.artTimer);
  ram.setU8(a5 + R.artTimer, old - 1);
  if (old === 0) {
    ram.setU8(a5 + R.artTimer, ram.u8(a5 + R.artReload));
    const cursor = ram.u16(a5 + R.artCursor);
    ram.setU32(root + 0x2a, rom.u32(0x27cb7a + cursor));
    const next = u16(cursor + 4);
    ram.setU16(a5 + R.artCursor,
      next === ram.u16(a5 + R.artEnd) ? ram.u16(a5 + R.artStart) : next);
  }

  drawRoot(ram, rom, root);
  if (i16(ram.u16(root + 0x22)) > i16(0xf800)) {
    enqueueThroughStub(ram, rom, 0x23d762, root + 0x20);
  } else if (ram.u16(a5 + R.phaseTimer) === 0xffff) {
    ctx.soundPost?.(0x28c890);
    ram.setU16(a5 + R.phaseTimer, 0xfffe);
  }

  if (i16(ram.u16(a5 + R.spread)) < 0x2400) {
    const d1 = ((u16(ram.u16(root + S.posX) - ram.u16(a5 + R.spread) + 0xb800) << 16)
      | u16(ram.u16(root + S.posY) + 0xf400)) >>> 0;
    enqueueRegistersThroughStub(ram, rom, 0x23dece,
      d1, 0x002f3230, 0x1860, 0x0014);
  }
}

export function handlerA4(ram, rom, a5, ctx) {
  const sub = ram.u32(a5 + R.sub);
  if (ram.u16(G.freeze) === 0) {
    const parent = ram.u32(a5 + A4R.parent);
    ram.setU16(sub + S.posX,
      ram.u16(parent + S.posX) + ram.u16(a5 + A4R.parentX));
    ram.setU16(sub + S.posY,
      ram.u16(parent + S.posY) + ram.u16(a5 + A4R.parentY));

    const v1 = ctx.tables.shotVectorShift(ram.u8(sub + S.speed),
      ram.u8(sub + S.heading), 1);
    ram.setU16(sub + S.posX, ram.u16(sub + S.posX) + v1.dy + v1.dy);
    ram.setU16(sub + S.posY, ram.u16(sub + S.posY) + v1.dx);
    const v3 = ctx.tables.shotVectorShift(ram.u8(sub + S.speed),
      ram.u8(sub + S.heading), 3);
    let x = u16(ram.u16(parent + S.posX) + ram.u16(a5 + A4R.parentX));
    let y = u16(ram.u16(parent + S.posY) + ram.u16(a5 + A4R.parentY));
    x = u16(x + v3.dy); y = u16(y + v3.dx);
    ram.setU16(a5 + A4R.drawX, x);
    ram.setU16(a5 + A4R.drawY, y);

    const speed = ram.u8(sub + S.speed);
    ram.setU8(sub + S.speed, speed - 4);
    if (speed < 4) { freeEnemy(ram, a5); return; }
  }

  ram.setU8(sub + S.attr, ram.u8(sub + S.attr) ^ 0x60);
  const old = ram.u8(a5 + A4R.animTimer);
  ram.setU8(a5 + A4R.animTimer, old - 1);
  if (old !== 0) {
    enqueueThroughStub(ram, rom, 0x23d816, sub);
    return;
  }
  ram.setU8(a5 + A4R.animTimer, ram.u8(a5 + A4R.animReload));
  const sprite = (ram.u32(sub + S.sprite) + 0x34) >>> 0;
  ram.setU32(sub + S.sprite, sprite);
  if (sprite === ram.u32(a5 + A4R.terminalSprite)) { freeEnemy(ram, a5); return; }

  enqueueThroughStub(ram, rom, 0x23d816, sub);
  enqueueRegistersThroughStub(ram, rom, 0x23df58,
    (ram.u32(a5 + A4R.drawX) + ram.u32(sub + S.offset)) >>> 0,
    sprite, ram.u16(sub + S.size), ram.u16(sub + S.attr));
}
