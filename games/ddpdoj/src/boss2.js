// THE STAGE-2 BOSS ENTRY LAYER. W183.
//
// Type `$30` installs a new set of five `$259554` scheduler tables. This file
// owns the per-frame wrapper, complete damage controller, first A4 bootstrap,
// arrival MAIN 0, its initially armed A3 drivers, and all eleven A2 draw-only
// boss-part objects. Later phase scripts remain outside this module's closure.

import { freeEnemy } from './initbody.js';
import { runStageAdvance242952 } from './stageend.js';
import { u16, i16, i32 } from './ram.js';
import { scoreHit, scoreKill } from './score.js';
import { spawnEffect, B } from './effects.js';
import { drawByte242E24, drawSigned242FDE, drawWord242EC2 } from './rng.js';
import { aim64, slew64, AimTables } from './aim.js';
import { livePlayers2428A6, bigBurst28B4BE } from './boss.js';
import { applyVelocity, scrollCompensate } from './movement.js';
import { dist242494 } from './bossscripts.js';
import { install24150A } from './palette.js';
import { loadAnimObjects246410 } from './animobjects.js';
import { enqueueDeferred, DEFQ_D1 } from './spawn.js';
import { enqueueRegistersThroughStub } from './spritequeue.js';
import {
  runScheduler25962E, registerScript, seqStart2598D0, a3Start259962,
  a3Stop2599EC, a2Stop25994A, a1Clear259B34, a4Clear2598A2,
  a4Start25980C, seqStop2598BE, a1Start259A18, a1Running259A4A,
} from './scheduler.js';

const note = (ctx, addr, what) => (ctx.unportedLog ?? ctx.unported)?.note(addr, what);

const AIM_TABLES = new WeakMap();
function aimTables(rom) {
  let tables = AIM_TABLES.get(rom);
  if (!tables) { tables = new AimTables(rom); AIM_TABLES.set(rom, tables); }
  return tables;
}

const ANIM_A = [
  [0x127, 0x10, 0x0f], [0x126, 0x12, 0x0d], [0x128, 0x17, 0x08],
  [0x12f, 0x11, 0x0e], [0x130, 0x13, 0x0c], [0x12d, 0x13, 0x0c],
  [0x12e, 0x0d, 0x12],
];
const ANIM_PARTS = [
  [0x129, 0x11, 0x0e], [0x12a, 0x11, 0x0e],
  [0x12b, 0x12, 0x0d], [0x12c, 0x12, 0x0d],
];
const ANIM_ALL = [...ANIM_A, ...ANIM_PARTS];

function setAnimBase(ram, a6, fields) {
  for (const [off, base] of fields) ram.setU8(a6 + off, base);
}

function flashAnim(ram, a6, fields, sentinel) {
  if (ram.u8(a6 + sentinel) === 0x19) setAnimBase(ram, a6, fields);
  for (const [off, _base, mask] of fields)
    ram.setU8(a6 + off, ram.u8(a6 + off) ^ mask);
}

function linkedDamage(ram, a5, a6, snapshots) {
  let damage = 0;
  for (const off of snapshots) damage = Math.max(damage,
    u16(0x7fff - ram.u16(a6 + off)));
  if (ram.u16(a6 + 0x148) === 0)
    ram.setU32(a5 + 0x16, (ram.u32(a5 + 0x16) - damage) >>> 0);
  for (const off of snapshots) ram.setU16(a6 + off, 0x7fff);
}

function emitPartTable(ram, rom, ctx, a6, table, pos) {
  for (let p = table; rom.u16(p) !== 0xffff; p += 12) {
    const e = spawnEffect(ram, ctx, rom.u16(p + 2), 0x298b02);
    ram.setU8(e + B.f1c, rom.u16(p + 4) & 0xff);
    ram.setU16(e + B.delay, rom.u16(p));
    ram.setU32(e + B.nudge, rom.u32(p + 6));
    ram.setU32(e + B.pos, pos);
    ram.setU16(e + B.bucket, 8);
    ram.setU16(e + B.sub12, 0);
    ram.setU16(e + B.sub14, 0);
    ram.setU16(e + B.speed, rom.u16(p + 10));
  }
  void a6;
}

function simplePartDeath(ram, a6, ctx, cfg) {
  if (ram.u8(a6 + cfg.dead) !== 0) return;
  ram.setU16(a6 + cfg.hp, 0xffff);
  ram.setU8(a6 + cfg.dead, 1);
  ram.setU16(a6 + cfg.status, 0x8000);
  ram.setU8(a6 + cfg.anim, cfg.base);
  a2Stop25994A(ram, cfg.object);
  const e = spawnEffect(ram, ctx, cfg.kind, cfg.site);
  ram.setU32(e + B.pos, ram.u32(a6 + cfg.pos));
  ram.setU16(e + B.bucket, 8);
  ram.setU16(e + B.sub12, 0);
  ram.setU16(e + B.sub14, 0x0800);
}

const PARTS = [
  { status: 0x40, hp: 0x58, dead: 0x5f, anim: 0x129, base: 0x11,
    xor: 0x0e, object: 6, pos: 0x42, kind: 0x87, site: 0x298a38 },
  { status: 0x60, hp: 0x78, dead: 0x7f, anim: 0x12a, base: 0x11,
    xor: 0x0e, object: 7, pos: 0x62, kind: 0x84, site: 0x298a84 },
  { status: 0x80, hp: 0x98, dead: 0x9f, anim: 0x12b, base: 0x12,
    xor: 0x0d, object: 8, pos: 0x82, table: 0x298b34, burstSite: 0x298aee },
  { status: 0xa0, hp: 0xb8, dead: 0xbf, anim: 0x12c, base: 0x12,
    xor: 0x0d, object: 9, pos: 0xa2, table: 0x298bac, burstSite: 0x298ba4 },
];

function partDeath(ram, rom, a6, ctx, part) {
  if (part.kind !== undefined) { simplePartDeath(ram, a6, ctx, part); return; }
  if (ram.u8(a6 + part.dead) !== 0) return;
  ram.setU16(a6 + part.hp, 0xffff);
  ram.setU8(a6 + part.dead, 1);
  ram.setU16(a6 + part.status, 0x8000);
  ram.setU8(a6 + part.anim, part.base);
  a2Stop25994A(ram, part.object);
  const pos = ram.u32(a6 + part.pos);
  emitPartTable(ram, rom, ctx, a6, part.table, pos);
  const angle = drawWord242EC2(ram, rom) & 0xff;
  bigBurst28B4BE(ram, rom, ctx, pos, angle, 0, 8, part.burstSite);
}

function boss2Death298962(ram, rom, a5, a6, ctx) {
  ram.setU8(0x8130f8, ram.u8(0x8130f8) | 0xc0);
  note(ctx, 0x23c4d0, '$298972 stage-2 boss death pause/flag block');
  note(ctx, 0x253564, '$298978 stage-2 boss death clamp');
  note(ctx, 0x242922, '$29897E stage-2 boss death intervention');
  ram.setU16(a6 + 0x146, 1);
  a1Clear259B34(ram);
  a4Clear2598A2(ram);
  ram.setU32(a5 + 0x16, 0xffffffff);
  ram.setU8(a6 + 0x1f, 1);
  for (const off of [0x00, 0x20, 0xc0, 0xe0]) ram.setU16(a6 + off, 0x8000);
  setAnimBase(ram, a6, ANIM_ALL);
  a3Stop2599EC(ram, 0x0d);
  a4Start25980C(ram, 2);
  ctx.bossEvent?.('death', ram.u16(0x8130ce));
  void rom;
}

function runPartDamage(ram, rom, a5, a6, ctx, part) {
  if (ram.u16(a6 + part.status) === 0x8000) return;
  const hit = ram.u8(a6 + part.status) & 0x5c;
  if (hit !== 0) {
    ram.setU8(a6 + part.status, ram.u8(a6 + part.status) & 0xa3);
    ram.setU16(a6 + 0x14a, hit);
    scoreHit(ram, ctx, a6, hit);
    if (ram.u8(a6 + part.anim) === 0x19) ram.setU8(a6 + part.anim, part.base);
    ram.setU8(a6 + part.anim, ram.u8(a6 + part.anim) ^ part.xor);
    if (ram.u16(a6 + 0x148) !== 0) ram.setU16(a6 + part.hp, 0x5000);
    if (i16(ram.u16(a6 + part.hp)) < 0) {
      scoreKill(ram, rom, ctx, 0x800, ram.u16(a6 + 0x14a));
      partDeath(ram, rom, a6, ctx, part);
    }
  } else {
    ram.setU8(a6 + part.anim, part.base);
    if (ram.u16(a6 + part.hp) <= 0x1800 && ram.u16(0x8130ca) === 0)
      ram.setU8(a6 + part.anim, 0x19);
  }
}

/** `$298310`, the complete stage-2 multi-part damage/death controller. */
export function boss2Damage298310(ram, rom, a5, a6, ctx) {
  if (ram.u16(a6 + 0x146) !== 0) return;

  if (ram.u8(a6 + 0x14c) !== 0) {
    const hit = [0x00, 0x20, 0xc0, 0xe0]
      .reduce((v, off) => v | ram.u8(a6 + off), 0) & 0x5c;
    if (hit !== 0) {
      for (const off of [0x00, 0x20, 0xc0, 0xe0])
        ram.setU8(a6 + off, ram.u8(a6 + off) & 0xa3);
      ram.setU16(a6 + 0x14a, hit);
      scoreHit(ram, ctx, a6, hit);
      flashAnim(ram, a6, ANIM_A, 0x127);
      linkedDamage(ram, a5, a6, [0x18, 0x38, 0xd8, 0xf8]);
    } else {
      setAnimBase(ram, a6, ANIM_A);
      if (ram.u32(a5 + 0x16) <= 0x6900 && ram.u16(0x8130ca) === 0)
        for (const [off] of ANIM_A) ram.setU8(a6 + off, 0x19);
    }
  }

  if (i32(ram.u32(a5 + 0x16)) < 0) {
    if (livePlayers2428A6(ram) === 0) ram.setU32(a5 + 0x16, 0x200);
    else {
      ram.setU32(0x81b61a, 0x00040000);
      boss2Death298962(ram, rom, a5, a6, ctx);
      return;
    }
  }

  for (const part of PARTS) runPartDamage(ram, rom, a5, a6, ctx, part);

  if (ram.u16(a6 + 0x100) !== 0x8000) {
    const hit = [0x100, 0xc0, 0xe0]
      .reduce((v, off) => v | ram.u8(a6 + off), 0) & 0x5c;
    if (hit !== 0) {
      for (const off of [0x100, 0xc0, 0xe0])
        ram.setU8(a6 + off, ram.u8(a6 + off) & 0xa3);
      ram.setU16(a6 + 0x14a, hit);
      scoreHit(ram, ctx, a6, hit);
      flashAnim(ram, a6, ANIM_ALL, 0x12f);
      linkedDamage(ram, a5, a6, [0x118, 0xd8, 0xf8]);
    } else {
      setAnimBase(ram, a6, ANIM_ALL);
    }
  }

  if (ram.u8(a6 + 0x14c) === 0) {
    const dead = [0x5f, 0x7f, 0x9f, 0xbf]
      .reduce((v, off) => v + ram.u8(a6 + off), 0) & 0xff;
    if (dead === 4 || i32((ram.u32(a5 + 0x16) - 0xefc0) >>> 0) < 0) {
      a1Clear259B34(ram);
      a4Clear2598A2(ram);
      a4Start25980C(ram, 1);
      for (const part of PARTS) partDeath(ram, rom, a6, ctx, part);
      ram.setU8(a6 + 0x12d, 0x13);
      ram.setU8(a6 + 0x12e, 0x0d);
      ram.setU8(a6 + 0x14c, 1);
      note(ctx, 0x243dd0, '$298926 stage-2 boss phase-transition palette hook');
    }
  }

  if (ram.u8(a6 + 0x14d) === 0 && i32(ram.u32(a5 + 0x16)) <= 0x6900) {
    ram.setU8(a6 + 0x14d, 1);
    a1Clear259B34(ram);
    a4Clear2598A2(ram);
    a4Start25980C(ram, 8);
  }

  if (ram.u16(0x8130d2) !== 0) return;
  const timeout = u16(ram.u16(a5 + 0x1a) - 1);
  ram.setU16(a5 + 0x1a, timeout);
  if (timeout !== 0) return;
  if (livePlayers2428A6(ram) === 0) ram.setU16(a5 + 0x1a, 0x78);
  else {
    ram.setU16(a6 + 0x14a, 0);
    boss2Death298962(ram, rom, a5, a6, ctx);
  }
}

/** `$297398`, the type-$30 per-frame wrapper. */
export function handlerBoss297398(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  ctx.bossSubRec = a6;
  ctx.bossRec = a5;
  boss2Damage298310(ram, rom, a5, a6, ctx);            // $297398
  const carry = runScheduler25962E(ram, rom, ctx);     // $29739E jsr $25962E
  if (!carry) return;                                 // $2973A4 bcc $2973B6
  runStageAdvance242952(ram, rom, ctx);                // $2973A8
  freeEnemy(ram, a5);                                 // $2973AE
}

/** `$298CAE`, A4 script 0 INIT: start arrival MAIN 0 and five D scripts. */
function a4Init298CAE(ram) {
  seqStart2598D0(ram, 0);                             // $298CAE..$298CB4
  for (const id of [0, 2, 11, 12, 13]) a3Start259962(ram, id);
}

/** `$298CDE`, A4 script 0 STEP: retire its scheduler slot. */
function a4Step298CDE(ram, _rom, _ctx, a4) { ram.setU16(a4, 0); }

registerScript(0x298cae, a4Init298CAE);
registerScript(0x298cde, a4Step298CDE);

function placeBoss2Parts297990(ram, a6) {
  const root = ram.u32(a6 + 0x02);
  const parts = [
    [0x20, -0x1800, 0x0300], [0x40, -0x11c0, 0x06c0],
    [0x60, -0x11c0, -0x06c0], [0x80, -0x0040, 0x0cc0],
    [0xa0, -0x0040, -0x0cc0], [0xc0, 0x0540, 0x1480],
    [0xe0, 0x0540, -0x1480], [0x100, -0x0300, 0],
  ];
  for (const [off, dx, dy] of parts) {
    ram.setU32(a6 + off + 0x02, root);
    ram.setU16(a6 + off + 0x02, u16(ram.u16(a6 + off + 0x02) + dx));
    ram.setU16(a6 + off + 0x04, u16(ram.u16(a6 + off + 0x04) + dy));
  }
}

function main0Step297A28(ram, rom, ctx, a4) {
  const a5 = ctx.bossRec;
  const a6 = ctx.bossSubRec;
  scrollCompensate(ram, a5);                           // $297A28
  if (ram.u8(a4 + 0x02) === 0) {
    if (ram.u16(a4 + 0x04) === 0x0010) {
      install24150A(ram, ctx.palette, 0x0d, rom.bytes(0x222d78, 64),
        0x297a4c, 'the stage-2 boss arrival bank');
    }
    const countdown = u16(ram.u16(a4 + 0x04) - 1);
    ram.setU16(a4 + 0x04, countdown);
    if (countdown === 0) {
      ram.setU8(a4 + 0x02, 1);
      ram.setU8(0x8130f9, ram.u8(0x8130f9) | 0x01);
    }
    placeBoss2Parts297990(ram, a6);
    return;
  }

  if (ram.u16(a4 + 0x06) !== 0x0100) {
    const old = ram.u8(a4 + 0x08);
    ram.setU8(a4 + 0x08, old - 1);
    if (old === 0) {
      ram.setU8(a4 + 0x08, ram.u8(a4 + 0x09));
      ram.setU16(a4 + 0x06, Math.min(0x0100, ram.u16(a4 + 0x06) + 3));
    }
  }
  ram.setU16(a6 + 0x02, u16(ram.u16(a6 + 0x02) + ram.u16(a4 + 0x06)));
  if (i16(ram.u16(a6 + 0x02)) >= 0x6200) {
    ram.setU8(0x8130f8, ram.u8(0x8130f8) | 0x12);
    a4Start25980C(ram, 3);
    ram.setU16(a6 + 0x100, ram.u16(a6 + 0x100) | 0xa000);
    seqStop2598BE(ram);
    ram.setU16(0x81b6e4, 1);
    loadAnimObjects246410(ram, rom, 0x297e8a);
  }
  placeBoss2Parts297990(ram, a6);
}

/** `$297A10`, MAIN 0 INIT. The ROM falls straight into STEP on first dispatch. */
function main0Init297A10(ram, rom, ctx, a4) {
  ram.setU8(a4 + 0x02, 0);
  ram.setU16(a4 + 0x04, 0x01c0);
  ram.setU16(a4 + 0x06, 0);
  ram.setU16(a4 + 0x08, 0);
  main0Step297A28(ram, rom, ctx, a4);
}

registerScript(0x297a10, main0Init297A10);
registerScript(0x297a28, main0Step297A28);

function main2Waypoint(ram, rom, a4) {
  const at = 0x297ba8 + ram.u16(a4);
  return { y: rom.u16(at), x: rom.u16(at + 2) };
}

/** `$297B48`, MAIN2 STEP: wander the boss through its sixteen waypoints. */
function main2Step297B48(ram, rom, ctx, a4) {
  const a5 = ctx.bossRec;
  const a6 = ctx.bossSubRec;
  let target = main2Waypoint(ram, rom, a4);
  const wanted = aim64(aimTables(rom), ram.u16(a6 + 0x02), ram.u16(a6 + 0x04),
    target.y, target.x);
  ram.setU8(a6 + 0x1b, slew64(ram.u8(a6 + 0x1b), wanted));
  applyVelocity(ram, ctx.tables, a5);
  target = main2Waypoint(ram, rom, a4);
  const distance = dist242494(ram.u16(a6 + 0x02), ram.u16(a6 + 0x04),
    target.y, target.x);
  if (i16(distance) <= 0x0100) {
    ram.setU16(a4, (ram.u16(a4) + 4) & 0x003f);
    ram.setU8(a6 + 0x1a, 4);
    ram.setU8(a6 + 0x1a, ram.u8(a6 + 0x1a) - drawSigned242FDE(ram, rom));
  }
  placeBoss2Parts297990(ram, a6);
}

/** `$297B22`, MAIN2 INIT. The ROM falls straight into STEP. */
function main2Init297B22(ram, rom, ctx, a4) {
  const a6 = ctx.bossSubRec;
  ram.setU16(a4, 0);
  ram.setU8(a6 + 0x1a, 4);
  const target = main2Waypoint(ram, rom, a4);
  ram.setU8(a6 + 0x1b,
    aim64(aimTables(rom), ram.u16(a6 + 0x02), ram.u16(a6 + 0x04),
      target.y, target.x));
  main2Step297B48(ram, rom, ctx, a4);
}

registerScript(0x297b22, main2Init297B22);
registerScript(0x297b48, main2Step297B48);

const F3_ATTACKS = [
  [6, 0x0040], [7, 0x00a0], [8, 0x0040], [9, 0x0030],
];

function f3AttacksRunning(ram) {
  return [6, 7, 8, 9].some((id) => a1Running259A4A(ram, id));
}

/** `$2991BC`, A4/F3 STEP: conduct the stage-2 boss's first attack cycle. */
function f3Step2991BC(ram, rom, ctx, a4) {
  const a6 = ctx.bossSubRec;

  if (ram.u8(a4 + 0x02) === 0) {
    const timer = ram.u16(a4 + 0x04);
    if (timer !== 0) {
      const next = u16(timer - 1);
      ram.setU16(a4 + 0x04, next);
      if (next === 0) {
        ram.setU16(a6 + 0x148, 0);                     // $298BDA
        if (ram.u16(0x813098) !== 0) a3Stop2599EC(ram, 13);
        const slot = a1Start259A18(ram, 6);
        ram.setU16(slot + 0x04, 0x00a0);
      }
    } else if (!a1Running259A4A(ram, 6)) {
      ram.setU8(a4 + 0x02, 2);
    }
  }

  if (ram.u8(a4 + 0x02) === 2 && !f3AttacksRunning(ram)) {
    let choice;
    do choice = drawByte242E24(ram, rom) & 3;
    while (choice === ram.u16(a4 + 0x06));
    ram.setU16(a4 + 0x06, choice);
    const [id, duration] = F3_ATTACKS[choice];
    const slot = a1Start259A18(ram, id);
    ram.setU16(slot + 0x04, duration);
    const count = u16(ram.u16(a4 + 0x08) + 1);
    ram.setU16(a4 + 0x08, count);
    if (count === 3) {
      ram.setU16(a4 + 0x08, 0);
      ram.setU8(a4 + 0x02, 3);
      ram.setU16(a4 + 0x04, 0x0040);
    }
  }

  if (ram.u8(a4 + 0x02) === 3 && !f3AttacksRunning(ram)) {
    const timer = ram.u16(a4 + 0x04);
    if (timer !== 0) {
      const next = u16(timer - 1);
      ram.setU16(a4 + 0x04, next);
      if (next === 0) {
        ram.setU16(a4 + 0x0c, 0x0020);
        ram.setU16(a4 + 0x0e, 0x4040);
        ram.setU16(a4 + 0x10, 4);
      }
    } else {
      if (!a1Running259A4A(ram, 11)) {
        const slot = a1Start259A18(ram, 11);
        ram.setU16(slot + 0x0c, ram.u16(a4 + 0x0e));
        const cadence = ram.u8(a4 + 0x0e);
        if (cadence !== 0x10) {
          const reduced = (cadence - 8) & 0xff;
          ram.setU8(a4 + 0x0e, ((reduced << 24) >> 24) > 0x10 ? reduced : 0x10);
        }
        const volleys = u16(ram.u16(a4 + 0x10) - 1);
        ram.setU16(a4 + 0x10, volleys);
        if (volleys === 0) ram.setU8(a4 + 0x02, 2);
      }
      if (ram.u8(a4 + 0x02) === 3 && !a1Running259A4A(ram, 10)) {
        const old = ram.u8(a4 + 0x0c);
        ram.setU8(a4 + 0x0c, old - 1);
        if (old === 0) {
          ram.setU8(a4 + 0x0c, ram.u8(a4 + 0x0d));
          const slot = a1Start259A18(ram, 10);
          ram.setU16(slot + 0x04,
            (drawByte242E24(ram, rom) & 3) + ram.u16(a4 + 0x0a));
        }
      }
    }
  }

  // State 4 has no producer in the cartridge, but this dormant tail is literal.
  if (ram.u8(a4 + 0x02) === 4
      && !a1Running259A4A(ram, 10) && !a1Running259A4A(ram, 11)) {
    ram.setU8(a4 + 0x02, 0);
    ram.setU16(a4 + 0x04, 0x0040);
  }
}

/** `$299194`, A4/F3 INIT. The ROM falls straight into STEP. */
function f3Init299194(ram, rom, ctx, a4) {
  ram.setU8(a4 + 0x02, 0);
  seqStart2598D0(ram, 2);
  a3Start259962(ram, 3);
  ram.setU16(a4 + 0x04, 0x0040);
  ram.setU16(a4 + 0x08, 0);
  ram.setU16(a4 + 0x06, 0);
  ram.setU16(a4 + 0x0a, 2);
  f3Step2991BC(ram, rom, ctx, a4);
}

/** `$298066`, D3 STEP: rotate the center heading modulo `$40`. */
function d3Step298066(ram, _rom, ctx, a4) {
  const a6 = ctx.bossSubRec;
  ram.setU8(a6 + 0x11b, (ram.u8(a6 + 0x11b) + ram.i8(a4 + 0x06)) & 0x3f);
}

/** `$29804C`, D3 INIT. The ROM falls straight into STEP. */
function d3Init29804C(ram, rom, ctx, a4) {
  ram.setU16(a4 + 0x04, 0);
  ram.setU8(a4 + 0x06, drawSigned242FDE(ram, rom) === 0 ? 0xff : 1);
  d3Step298066(ram, rom, ctx, a4);
}

registerScript(0x299194, f3Init299194);
registerScript(0x2991bc, f3Step2991BC);
registerScript(0x29804c, d3Init29804C);
registerScript(0x298066, d3Step298066);

/** `$297F60`, D0 STEP: advance the root animation selector every 3 calls. */
function d0Step297F60(ram, _rom, ctx, _a4) {
  const a6 = ctx.bossSubRec;
  const old = ram.u8(a6 + 0x26);
  ram.setU8(a6 + 0x26, old - 1);                       // $297F60 subq.b
  if (old !== 0) return;                               // $297F64 bcc
  ram.setU8(a6 + 0x26, ram.u8(a6 + 0x27));            // $297F68
  const selector = u16(ram.u16(a6 + 0x28) + 4);       // $297F6E
  ram.setU16(a6 + 0x28, selector === 0x20 ? 0 : selector);
}

/** `$297F54`, D0 INIT. The ROM falls straight into STEP on first dispatch. */
function d0Init297F54(ram, rom, ctx, a4) {
  const a6 = ctx.bossSubRec;
  ram.setU16(a6 + 0x26, 2);
  ram.setU16(a6 + 0x28, 0);
  d0Step297F60(ram, rom, ctx, a4);
}

registerScript(0x297f54, d0Init297F54);
registerScript(0x297f60, d0Step297F60);

const D2_SELECTORS = [0x0000, 0x0004, 0x0008, 0x000c, 0x0008, 0x0004];

/** `$29800E`, D2 STEP: cycle the first child through a six-frame selector. */
function d2Step29800E(ram, _rom, ctx, a4) {
  const old = ram.u8(a4 + 0x02);
  ram.setU8(a4 + 0x02, old - 1);
  if (old !== 0) return;
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));
  const cursor = ram.u16(a4 + 0x04);
  ram.setU16(ctx.bossSubRec + 0x06, D2_SELECTORS[cursor >>> 1]);
  ram.setU16(a4 + 0x04, cursor + 2 === 0x0c ? 0 : cursor + 2);
}

/** `$298002`, D2 INIT, falling straight into STEP. */
function d2Init298002(ram, rom, ctx, a4) {
  ram.setU16(a4 + 0x02, 3);
  ram.setU16(a4 + 0x04, 0);
  d2Step29800E(ram, rom, ctx, a4);
}

/** `$29824A`, D11 STEP: cycle the boss overlay selector `$00..$34`. */
function d11Step29824A(ram, _rom, ctx, a4) {
  const old = ram.u8(a4 + 0x02);
  ram.setU8(a4 + 0x02, old - 1);
  if (old !== 0) return;
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));
  const selector = u16(ram.u16(ctx.bossSubRec + 0x16a) + 4);
  ram.setU16(ctx.bossSubRec + 0x16a, selector < 0x38 ? selector : 0);
}

/** `$298244`, D11 INIT, falling straight into STEP. */
function d11Init298244(ram, rom, ctx, a4) {
  ram.setU16(a4 + 0x02, 0x0202);
  d11Step29824A(ram, rom, ctx, a4);
}

/** `$298298`, D12 STEP: advance the two side-part selectors modulo `$40`. */
function d12Step298298(ram, _rom, ctx, a4) {
  const old = ram.u8(a4 + 0x02);
  ram.setU8(a4 + 0x02, old - 1);
  if (old !== 0) return;
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));
  const a6 = ctx.bossSubRec;
  ram.setU16(a6 + 0xc6, u16(ram.u16(a6 + 0xc6) + 4) & 0x003f);
  ram.setU16(a6 + 0xe6, u16(ram.u16(a6 + 0xe6) + 4) & 0x003f);
}

/** `$29826E`, D12 INIT, including its two independent RNG seeds. */
function d12Init29826E(ram, rom, ctx, a4) {
  const a6 = ctx.bossSubRec;
  ram.setU16(a4 + 0x02, 0x0101);
  ram.setU16(a6 + 0xc6, (drawWord242EC2(ram, rom) & 0x0f) << 2);
  ram.setU16(a6 + 0xe6, (drawWord242EC2(ram, rom) & 0x0f) << 2);
  d12Step298298(ram, rom, ctx, a4);
}

const D13_OFFSETS = [0xf000f500, 0xf0000500, 0xf480f100, 0xf4800900];

/** `$2982C8`, D13 STEP: enqueue one type `$4D` satellite at a root offset. */
function d13Step2982C8(ram, _rom, ctx, a4) {
  const old = ram.u8(a4 + 0x02);
  ram.setU8(a4 + 0x02, old - 1);
  if (old !== 0) return;
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));
  const q = enqueueDeferred(ram, 0x4d, DEFQ_D1.FIXED00);
  const cursor = ram.u16(a4 + 0x04);
  ram.setU32(q.addr + 0x16,
    (ram.u32(ctx.bossSubRec + 0x22) + D13_OFFSETS[cursor >>> 2]) >>> 0);
  ram.setU16(a4 + 0x04, (cursor + 4) & 0x000f);
}

/** `$2982BC`, D13 INIT, falling straight into STEP. */
function d13Init2982BC(ram, rom, ctx, a4) {
  ram.setU16(a4 + 0x02, 0);
  ram.setU16(a4 + 0x04, 0);
  d13Step2982C8(ram, rom, ctx, a4);
}

registerScript(0x298002, d2Init298002);
registerScript(0x29800e, d2Step29800E);
registerScript(0x298244, d11Init298244);
registerScript(0x29824a, d11Step29824A);
registerScript(0x29826e, d12Init29826E);
registerScript(0x298298, d12Step298298);
registerScript(0x2982bc, d13Init2982BC);
registerScript(0x2982c8, d13Step2982C8);

function boss2D4(ram, a6, anim) {
  return (ram.u16(a6 + 0x1c) & 0xff00) | ram.u8(a6 + anim);
}

function boss2DrawA2(ram, rom, a6, table, cursor, d1, d3, anim) {
  enqueueRegistersThroughStub(ram, rom, 0x23dfea, d1 >>> 0,
    rom.u32(table + cursor), d3, boss2D4(ram, a6, anim));
}

function addWordLow(value, add) {
  return ((value & 0xffff0000) | u16((value & 0xffff) + add)) >>> 0;
}

/** `$297462`, A2 object 0, the root body's eight-frame draw. */
function boss2Object0(ram, rom, ctx) {
  const a6 = ctx.bossSubRec;
  const d1 = (addWordLow(ram.u32(a6 + 0x22), 0xfd00) + 0xec00f000) >>> 0;
  boss2DrawA2(ram, rom, a6, 0x297490, ram.u16(a6 + 0x28), d1,
    0x1480, 0x126);
}

/** `$2974FE`, A2 object 1. */
function boss2Object1(ram, rom, ctx) {
  const a6 = ctx.bossSubRec;
  const pos = ((u16(ram.u16(a6 + 0x02) + ram.u16(a6 + 0x168)) << 16)
    | ram.u16(a6 + 0x04)) >>> 0;
  boss2DrawA2(ram, rom, a6, 0x297538, ram.u16(a6 + 0x166),
    (pos + 0x04000000 + 0xee00ed00) >>> 0, 0x1298, 0x128);
}

/** `$297578`, A2 object 2. */
function boss2Object2(ram, rom, ctx) {
  const a6 = ctx.bossSubRec;
  const pos = ((ram.u32(a6 + 0x02) - 0x0a000000) + 0xf400ed00) >>> 0;
  boss2DrawA2(ram, rom, a6, 0x2975a8, ram.u16(a6 + 0x16a),
    pos, 0x0c98, 0x130);
}

/** `$2974B0`, A2 object 3. */
function boss2Object3(ram, rom, ctx) {
  const a6 = ctx.bossSubRec;
  boss2DrawA2(ram, rom, a6, 0x2974da, ram.u16(a6 + 0x06),
    (ram.u32(a6 + 0x02) + 0xee00fa00) >>> 0, 0x1230, 0x127);
}

function boss2Object45(ram, rom, ctx, cfg) {
  const a6 = ctx.bossSubRec;
  const pos = ((u16(ram.u16(a6 + cfg.part + 0x02) + ram.u16(a6 + 0x168)) << 16)
    | ram.u16(a6 + cfg.part + 0x04)) >>> 0;
  boss2DrawA2(ram, rom, a6, cfg.table, ram.u16(a6 + cfg.cursor),
    (pos + 0xf600fc00) >>> 0, 0x0a20, cfg.anim);
}

function boss2HeadingObject(ram, rom, ctx, cfg) {
  const a6 = ctx.bossSubRec;
  const cursor = ((ram.u8(a6 + cfg.heading) + 1) & 0x3e) << 1;
  boss2DrawA2(ram, rom, a6, cfg.table, cursor,
    (ram.u32(a6 + cfg.part + 0x02) + cfg.bias) >>> 0,
    cfg.d3, cfg.anim);
}

/** `$29789A`, A2 object 10. */
function boss2Object10(ram, rom, ctx) {
  const a6 = ctx.bossSubRec;
  const cursor = ((ram.u8(a6 + 0x11b) + 1) & 0x3e) << 1;
  boss2DrawA2(ram, rom, a6, 0x2978d0, cursor,
    (ram.u32(a6 + 0x102) + 0xfc00fd00) >>> 0, 0x0418, 0x12f);
}

registerScript(0x297462, boss2Object0);
registerScript(0x2974fe, boss2Object1);
registerScript(0x297578, boss2Object2);
registerScript(0x2974b0, boss2Object3);
registerScript(0x2975e0, (ram, rom, ctx) => boss2Object45(ram, rom, ctx,
  { part: 0xc0, table: 0x297686, cursor: 0xc6, anim: 0x12d }));
registerScript(0x297654, (ram, rom, ctx) => boss2Object45(ram, rom, ctx,
  { part: 0xe0, table: 0x297614, cursor: 0xe6, anim: 0x12e }));
registerScript(0x2976c6, (ram, rom, ctx) => boss2HeadingObject(ram, rom, ctx,
  { part: 0x40, heading: 0x5b, table: 0x2976fc, bias: 0xfa00fc00,
    d3: 0x0620, anim: 0x129 }));
registerScript(0x29777c, (ram, rom, ctx) => boss2HeadingObject(ram, rom, ctx,
  { part: 0x60, heading: 0x7b, table: 0x2976fc, bias: 0xfa00fc00,
    d3: 0x0620, anim: 0x12a }));
registerScript(0x2977b0, (ram, rom, ctx) => boss2HeadingObject(ram, rom, ctx,
  { part: 0x80, heading: 0x9b, table: 0x2977e6, bias: 0xf600fa00,
    d3: 0x0a30, anim: 0x12b }));
registerScript(0x297866, (ram, rom, ctx) => boss2HeadingObject(ram, rom, ctx,
  { part: 0xa0, heading: 0xbb, table: 0x2977e6, bias: 0xf600fa00,
    d3: 0x0a30, anim: 0x12c }));
registerScript(0x29789a, boss2Object10);
