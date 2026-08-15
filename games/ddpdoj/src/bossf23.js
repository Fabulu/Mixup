// THE STAGE-1 BOSS'S F 2 / F 3 WAVE -- the 44 live-unported entries W99 found.
// W103.
//
// ============================================================================
// WHAT THIS FILE IS
// ============================================================================
// Every one of the 44 was found by W99's static inventory to hang off F 2 or
// F 3 (or a script F 2/F 3 starts).  F 2 (`$2952D8`) and F 3 (`$29540C`) are
// the two conductors of the boss's SECOND ATTACK PHASE, the one after F 6's
// rendezvous-and-E-13 ladder finishes.  F 6 hands to F 2; F 2 hands to F 3;
// F 3 hands to F 6.  The three loop for the rest of the fight.
//
// The 44 in family order (W99 section 3):
//   MAIN 3/4/8 (6)   clones of MAIN 6/7 with new targets/handoffs
//   F 2/3     (4)    the conductors themselves
//   E 5/6/8/12/14 (10)  five guns F 2/F 3/D 14 start
//   D 8..19   (24)   twelve limb scripts the conductors walk
//
// Plus the two scheduler accessors (`$2599B4` D.running, `$259B08` E.stop) now
// in scheduler.js, and the type-`$1E` spawn closure reached through E 8 (the
// handler at `$296DD6`, its init body at `$296D8A`, and the bucket-22 emit
// `$23F7C6`).
//
// ============================================================================
// TWO DEADSCRIPT QUIERIES THIS FILE MUST NOT THROW ON
// ============================================================================
// E 2, E 7, E 9, E 10 are DEAD (W99 section 5): nothing starts them.  F 2 and
// F 3 still CALL `$259A4A` on them to wait for "not running".  An empty slot
// table returns false (not running) for free, and that is the correct behavior.
// `a1Running259A4A` already returns false for any id no slot carries; no
// special handling is needed.

import { u16, i16 } from './ram.js';
import { registerScript, seqStart2598D0, seqCurrent2598C8, spread2595F2,
  a3Start259962, a3Stop2599EC, a3Running2599B4,
  a4Start25980C, a1Start259A18, a1Running259A4A, a1Stop259B08,
} from './scheduler.js';
import { aim64, slew64, aim256FromCaller, AimTables } from './aim.js';
import { applyVelocity } from './movement.js';
import { drawSigned242FDE, drawWord242EC2 } from './rng.js';
import { drawByte242B3C } from './items.js';
import { fire as fireBulletFan, WriteLog } from './bullets.js';
import { enqueueRegisters } from './spritequeue.js';
import { enqueueDeferred, DEFQ_D1 } from './spawn.js';
import { freeEnemy } from './initbody.js';
import {
  BS, dist242494, bodyTail29314C, pickWaypoint2933DE, rampSpeed293400,
} from './bossscripts.js';
import { bossA5, bossA6 } from './boss.js';
import { spawnEffect, B } from './effects.js';

/** A byte, the way every `.b` operation in this file truncates. */
const u8 = (v) => v & 0xff;
/** A signed byte, which is what every `bgt`/`bmi`/`asr.b` here reads. */
const i8 = (v) => (v << 24) >> 24;

/** Every ROM address this file transcribes, so a reader can check any line. */
export const W103 = {
  main4Waypoints: 0x293558,   // $293506 lea $293558(pc),A0 -- 8 (Y,X) pairs
  e5CadTab: 0x29607a,          // $2960EA lea -- byte
  e8CountTab: 0x296352,        // $29636E lea -- word
  e8CadTab: 0x296342,          // $296378 lea -- word
  e12CountTab: 0x29668c,       // $2966A8 lea -- word
  e12MuzzleA: 0x29667c,        // $2966DE move.l (d16,PC),D3
  e12MuzzleB: 0x296680,        // $296714 move.l (d16,PC),D3
  d14CadTab: 0x294546,         // $295BA lea -- byte
  d14CountTab: 0x29454e,       // $295E8 lea -- byte
  d14FanTab: 0x294556,         // $294616 lea $294556(pc),A0 -- word (PC-relative)
  fanTableA: 0x2736fa,         // type-$1E handler death fan, bank A
  fanTableB: 0x2735fa,
  fanTableC: 0x2734fa,
  obj1ESprites: 0x296f68,      // $296F44 lea -- indexed by $20(a5)
  hpGate: 0x48cc,              // E 12's gate, same as E 0/E 11
  freeze: 0x8130d4,
  rank: 0x813098,
  bossFlags: 0x8130f8,
  deathPause: 0x8130d2,
};

const AIM_TABLES = new WeakMap();
function aimTables(rom) {
  let t = AIM_TABLES.get(rom);
  if (!t) { t = new AimTables(rom); AIM_TABLES.set(rom, t); }
  return t;
}

/** `subq.b #1,<ea>` + `bcc`: BCC taken while OLD value was non-zero.
 *  Returns TRUE for "bcc taken" == "not yet". */
function subqByteBcc(ram, a) {
  const v = ram.u8(a);
  ram.setU8(a, u8(v - 1));
  return v !== 0;
}

/** The "script done" landmark `$2937B2`: `clr.w (a4) / rts`. */
function retire(ram, a4) { ram.setU16(a4, 0); }

// ===========================================================================
// MAIN 3 -- $2934A2 / $2934AC.  MAIN 6 with target ($6A00,$1C00), hand to 4.
// ===========================================================================
export function main3Init2934A2(ram, a4, a6) {
  ram.setU16(a4, 0);                                    // $2934A2
  ram.setU8(a4 + 2, ram.u8(a6 + BS.speed));             // $2934A6
}
export function main3Step2934AC(ram, rom, ctx, a4, a5, a6) {
  const face = aim64(aimTables(rom), ram.u16(a6 + BS.posY), ram.u16(a6 + BS.posX),
    0x6a00, 0x1c00);                                    // $2934AC..$2934C0
  ram.setU8(a6 + BS.facing, face & 0xff);               // $2934C0 RAW, no slew
  const d0 = dist242494(ram.u16(a6 + BS.posY), ram.u16(a6 + BS.posX),
    0x6a00, 0x1c00);                                    // $2934C4..$2934CC
  ram.setU8(a4 + 2, (d0 >>> 7) & 0xff);                 // $2934D2..$2934D6
  if (i16(d0) <= 0x100) seqStart2598D0(ram, 4);         // $2934DA..$2934E4
  rampSpeed293400(ram, a4, a6);                         // $2934EA
  applyVelocity(ram, ctx.tables, a5);                   // $2934EE
  bodyTail29314C(ram, ctx, a6);                         // $2934F4
}

// ===========================================================================
// MAIN 4 -- $2934F8 / $293506.  MAIN 7 with waypoint table $293558.
// ===========================================================================
function main4Waypoint(rom, ram, a4) {
  const at = W103.main4Waypoints + u16(ram.u16(a4));
  return { y: rom.u16(at), x: rom.u16(at + 2) };
}
export function main4Init2934F8(ram, rom, a4, a6) {
  ram.setU16(a4, 0);                                    // $2934F8
  ram.setU8(a4 + 2, ram.u8(a6 + BS.speed));             // $2934FC
  pickWaypoint2933DE(ram, rom, a4);                     // $293502
}
export function main4Step293506(ram, rom, ctx, a4, a5, a6) {
  let t = main4Waypoint(rom, ram, a4);                  // $293506..$29350E
  const want = aim64(aimTables(rom), ram.u16(a6 + BS.posY), ram.u16(a6 + BS.posX),
    t.y, t.x);                                          // $293512..$293518
  ram.setU8(a6 + BS.facing, slew64(ram.u8(a6 + BS.facing), want) & 0xff);  // $293528
  rampSpeed293400(ram, a4, a6);                         // $29352C
  applyVelocity(ram, ctx.tables, a5);                   // $293530
  t = main4Waypoint(rom, ram, a4);                      // $293536 re-read (no-op, W94)
  const d0 = dist242494(ram.u16(a6 + BS.posY), ram.u16(a6 + BS.posX), t.y, t.x);
  if (i16(d0) <= 0x100) pickWaypoint2933DE(ram, rom, a4);   // $293550
  bodyTail29314C(ram, ctx, a6);                         // $293554
}

// ===========================================================================
// MAIN 8 -- $2936B4 / $2936BE.  MAIN 6 with MAIN.start 4 (not 7).
// ===========================================================================
export function main8Init2936B4(ram, a4, a6) {
  ram.setU16(a4, 0);                                    // $2936B4
  ram.setU8(a4 + 2, ram.u8(a6 + BS.speed));             // $2936B8
}
export function main8Step2936BE(ram, rom, ctx, a4, a5, a6) {
  const face = aim64(aimTables(rom), ram.u16(a6 + BS.posY), ram.u16(a6 + BS.posX),
    0x7400, 0x1c00);                                    // $2936BE..$2936D2
  ram.setU8(a6 + BS.facing, face & 0xff);               // $2936D2
  const d0 = dist242494(ram.u16(a6 + BS.posY), ram.u16(a6 + BS.posX),
    0x7400, 0x1c00);                                    // $2936D6..$2936DE
  ram.setU8(a4 + 2, (d0 >>> 7) & 0xff);                 // $2936E4..$2936E8
  if (i16(d0) <= 0x100) seqStart2598D0(ram, 4);         // $2936EC..$2936F6
  rampSpeed293400(ram, a4, a6);                         // $2936FC
  applyVelocity(ram, ctx.tables, a5);                   // $293700
  bodyTail29314C(ram, ctx, a6);                         // $293706
}

// ===========================================================================
// THE "BOTH PARTS DEAD" TEST -- the first instruction of F 2 and F 3.
// ===========================================================================
/** @returns {boolean} true when both side parts are destroyed. */
function bothPartsDead(ram, a6) {
  return u8(ram.u8(a6 + 0x3f) + ram.u8(a6 + 0x7f)) === 2;
}

// ===========================================================================
// F 2 -- $2952D8 / $295304.  MAIN 8 conductor.
// ===========================================================================
export function f2Init2952D8(ram, a4, a6) {
  if (bothPartsDead(ram, a6)) return;                   // $2952E0 beq -> F.start 1
  ram.setU8(a4 + 0x02, 0);                              // $2952E8
  ram.setU8(a4 + 0x03, 0);                              // $2952EC
  ram.setU16(a4 + 0x06, 0x2020);                        // $2952F0
  ram.setU16(a4 + 0x04, 0x0010);                        // $2952F6
  seqStart2598D0(ram, 8);                               // $2952FC/$2952FE
}
export function f2Step295304(ram, rom, ctx, a4) {
  const a6 = bossA6(ctx, 0x295304);
  if (bothPartsDead(ram, a6)) { a4Start25980C(ram, 1); ram.setU16(a4, 0); return; }
  if (ram.u8(a4 + 0x02) === 0                           // $295314
    && seqCurrent2598C8(ram) === 4) {                   // $29531E/$295324
    a3Start259962(ram, 8);                              // $29532C
    a3Start259962(ram, 9);                              // $295334
    ram.setU8(a4 + 0x02, 1);                            // $29533C
  }
  if (ram.u8(a4 + 0x02) === 1                           // $295342
    && !a3Running2599B4(ram, 9)                         // $29534C/$295354
    && !a3Running2599B4(ram, 8)) {                      // $295358/$295360
    ram.setU8(a4 + 0x03, 1);                            // $295364
    ram.setU8(a4 + 0x02, 2);                            // $29536A
  }
  if (ram.u8(a4 + 0x02) === 2) {                        // $295370
    const n = u16(ram.u16(a4 + 0x04) - 1);              // $29537A
    ram.setU16(a4 + 0x04, n);
    if (n === 0) {                                      // $29537E
      a3Start259962(ram, 0x0e);                         // $295384 D.start 14
      ram.setU8(a4 + 0x02, 3);                          // $29538A
    }
  }
  if (ram.u8(a4 + 0x02) === 3                           // $295390
    && !a3Running2599B4(ram, 0x0e)) {                   // $29539A/$2953A2
    a3Start259962(ram, 0x0c);                           // $2953A6 D.start 12
    a3Start259962(ram, 0x0d);                           // $2953AE D.start 13
    ram.setU8(a4 + 0x03, 0);                            // $2953B6
    seqStart2598D0(ram, 5);                             // $2953BE MAIN.start 5
    ram.setU8(a4 + 0x02, 4);                            // $2953C4
  }
  if (ram.u8(a4 + 0x02) === 4                           // $2953CA
    && !a1Running259A4A(ram, 2)                          // $2953D4 E 2 dead
    && !a3Running2599B4(ram, 0x0c)                      // $2953E0
    && !a3Running2599B4(ram, 0x0d)) {                   // $2953EC
    a3Start259962(ram, 0x0f);                           // $2953F8 D.start 15
    a4Start25980C(ram, 1);                              // $295402 F.start 1
    ram.setU16(a4, 0);                                  // $295408
  }
  void rom;
}

// ===========================================================================
// F 3 -- $29540C / $295432.  MAIN 3 conductor.
// ===========================================================================
// **THE 9-OR-10 DRAW AT `$2954EC` IS DISCARDED** by `$295508 moveq #5,D0`.
// Transcribed as the dead computation it is; the RNG draw still steps
// `$803917` for the whole game, so it must run.
export function f3Init29540C(ram, a4, a6) {
  if (bothPartsDead(ram, a6)) return;                   // $295414 beq -> F.start 6
  ram.setU8(a4 + 0x02, 0);                              // $29541C
  ram.setU8(a4 + 0x03, 0);                              // $295420
  ram.setU16(a4 + 0x06, 0x2020);                        // $295424
  seqStart2598D0(ram, 3);                               // $29542A/$29542C
}
export function f3Step295432(ram, rom, ctx, a4) {
  const a6 = bossA6(ctx, 0x295432);
  if (bothPartsDead(ram, a6)) { a4Start25980C(ram, 6); ram.setU16(a4, 0); return; }
  if (ram.u8(a4 + 0x02) === 0                           // $295442
    && seqCurrent2598C8(ram) === 4) {                   // $29544C/$295452
    a3Start259962(ram, 0x10);                           // $29545A D.start 16
    a3Start259962(ram, 0x11);                           // $295462 D.start 17
    ram.setU8(a4 + 0x02, 1);                            // $29546A
  }
  if (ram.u8(a4 + 0x02) === 1                           // $295470
    && !a3Running2599B4(ram, 9)                         // $29547A/$295482
    && !a3Running2599B4(ram, 8)) {                      // $295486/$29548E
    ram.setU8(a4 + 0x03, 1);                            // $295492
    ram.setU8(a4 + 0x02, 2);                            // $295498
    ram.setU16(a4 + 0x04, 0x0040);                      // $29549E
  }
  if (ram.u8(a4 + 0x02) === 2) {                        // $2954A4
    const n = u16(ram.u16(a4 + 0x04) - 1);              // $2954AE
    ram.setU16(a4 + 0x04, n);
    if (n === 0) {                                      // $2954B2
      a1Start259A18(ram, 8);                            // $2954B8 E.start 8
      ram.setU8(a4 + 0x02, 3);                          // $2954BE
      ram.setU16(a4 + 0x04, 0x0040);                    // $2954C4
      a3Start259962(ram, 0x12);                         // $2954CC D.start 18
      a3Start259962(ram, 0x13);                         // $2954D4 D.start 19
    }
  }
  if (ram.u8(a4 + 0x02) === 3) {                        // $2954DA
    const n = u16(ram.u16(a4 + 0x04) - 1);              // $2954E4
    ram.setU16(a4 + 0x04, n);
    if (n === 0) {                                      // $2954E8
      // $2954EC..$2954FA: vestigial 9-or-10 draw, discarded by moveq #5.
      let d7 = 9;                                       // $2954EC moveq #9,d7
      if (drawSigned242FDE(ram, rom) === 0) d7 = 0x0a;  // $2954EE/$2954F4/$2954F8
      void d7;                                          // $2954FA move.w d7,d0 -- DEAD
      ram.setU8(a4 + 0x02, 4);                          // $2954FC
      ram.setU8(a4 + 0x03, 0);                          // $295502
      seqStart2598D0(ram, 5);                           // $295508/$29550A MAIN.start 5
    }
  }
  if (ram.u8(a4 + 0x02) === 4                           // $295510
    && !a1Running259A4A(ram, 7)                          // $29551A E 7 dead
    && !a1Running259A4A(ram, 9)                          // $295526 E 9 dead
    && !a1Running259A4A(ram, 0x0a)) {                    // $295532 E 10 dead
    a4Start25980C(ram, 6);                              // $29553E F.start 6
    ram.setU16(a4, 0);                                  // $295546
  }
}

// ===========================================================================
// D 8 / D 9 -- $2943EE/$2943FC and $294466/$294474.  Hatch openers.
// D 10 / D 11 -- $2944DE/$2944E6 and $294512/$29451A.  Fast wobble.
// D 12 / D 13 -- $29475E/$294772 and $2947E8/$2947FC.  Hatch closers.
// D 16 / D 17 -- $2948B6/$2948C4 and $29492E/$29493C.  2nd hatch open.
// D 18 / D 19 -- $2949A6/$2949BA and $294A30/$294A44.  2nd hatch close.
// ===========================================================================
// All twelve are paired (part 1 / part 2) with identical structure and
// different offsets.  All twelve INITs end in `rts`.
function hatchInit(ram, a4) {
  ram.setU16(a4 + 0x02, 0);                             // $2943EE/$294466
  ram.setU8(a4 + 0x06, 0);                              // $2943F4/$29446C
}
function hatchStep(ram, a4, a6, o) {
  if (ram.u8(a6 + o.dead) !== 0) { retire(ram, a4); return; }
  if (ram.u8(a4 + 0x06) === 0                           // $294404/$29447C
    && ram.u16(a6 + o.anim) === 0) {                    // $29440E/$294486
    a3Stop2599EC(ram, o.stopId);                        // $294416/$29448E
    ram.setU16(a6 + o.anim, 0x0010);                    // $29441E/$294496
    ram.setU8(a4 + 0x06, 1);                            // $294424/$29449C
  }
  if (ram.u8(a4 + 0x06) !== 1) return;                  // $29442A/$2944A2
  if (subqByteBcc(ram, a4 + 0x02)) return;              // $294434/$2944AC
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));              // $29443C/$2944B4
  ram.setU16(a6 + o.trim, u16(ram.u16(a6 + o.trim) + o.trimStep));   // $294442/$2944BA
  ram.setU8(a6 + o.ang, u8(ram.u8(a6 + o.ang) + o.angStep));   // $294448/$2944C0
  ram.setU16(a6 + o.anim, u16(ram.u16(a6 + o.anim) + 4));      // $29444C/$2944C4
  if (ram.u16(a6 + o.anim) === 0x68) {                  // $294450/$2944C8
    a3Start259962(ram, o.nextId);                       // $29445A/$2944D2
    retire(ram, a4);                                    // $294462/$2944DA
  }
}
const HATCH8 = { dead: 0x3f, anim: 0x2a, trim: 0x4c, ang: 0x4a, trimStep: 0xc0, angStep: 2, stopId: 2, nextId: 0x0a };
const HATCH9 = { dead: 0x7f, anim: 0x6a, trim: 0x8c, ang: 0x8a, trimStep: 0xc0, angStep: 2, stopId: 3, nextId: 0x0b };
// D 16/D 17 are D 8/D 9 but the angle DECREMENTS.
const HATCH16 = { dead: 0x3f, anim: 0x2a, trim: 0x4c, ang: 0x4a, trimStep: 0xc0, angStep: -2, stopId: 2, nextId: 0x0a };
const HATCH17 = { dead: 0x7f, anim: 0x6a, trim: 0x8c, ang: 0x8a, trimStep: 0xc0, angStep: -2, stopId: 3, nextId: 0x0b };

function fastWobbleInit(ram, a4) { ram.setU16(a4 + 0x02, 0); }  // $2944DE/$294512
function fastWobbleStep(ram, a4, a6, o) {
  if (ram.u8(a6 + o.dead) !== 0) { retire(ram, a4); return; }
  if (subqByteBcc(ram, a4 + 0x02)) return;              // $2944EE/$294522
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));              // $2944F6/$29452A
  ram.setU16(a6 + o.anim, u16(ram.u16(a6 + o.anim) + 4));   // $2944FC/$294530
  if (i16(ram.u16(a6 + o.anim)) > 0x74)                 // $294500/$294534 cmpi.w/ble
    ram.setU16(a6 + o.anim, 0x68);                      // $29450A/$29453E
}
const W10 = { dead: 0x3f, anim: 0x2a };
const W11 = { dead: 0x7f, anim: 0x6a };

function closeHatchInit(ram, a4) {
  ram.setU16(a4 + 0x02, 0);                             // $29475E/$2947E8
  ram.setU16(a4 + 0x04, 0x0020);                        // $294764/$2947EE
  ram.setU8(a4 + 0x06, 0);                              // $29476A/$2947F4
}
function closeHatchStep(ram, a4, a6, o) {
  if (ram.u8(a6 + o.dead) !== 0) { retire(ram, a4); return; }
  if (ram.u8(a4 + 0x06) === 0) {                        // $29477A/$294804
    if (ram.u16(a4 + 0x04) !== 0) {                     // $294784 tst.w
      ram.setU16(a4 + 0x04, u16(ram.u16(a4 + 0x04) - 1));   // $29478C
    } else if (ram.u16(a6 + o.anim) === 0x68) {         // $294794
      a3Stop2599EC(ram, o.stopId);                      // $29479E
      ram.setU8(a4 + 0x06, 1);                          // $2947A6
    }
  }
  if (ram.u8(a4 + 0x06) !== 1) return;                  // $2947AC/$294836
  if (subqByteBcc(ram, a4 + 0x02)) return;              // $2947B6/$294840
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));              // $2947BE/$294848
  ram.setU16(a6 + o.trim, u16(ram.u16(a6 + o.trim) - 0xc0));   // $2947C4/$29484E
  ram.setU8(a6 + o.ang, u8(ram.u8(a6 + o.ang) + o.angStep));   // $2947CA/$294854
  ram.setU16(a6 + o.anim, u16(ram.u16(a6 + o.anim) - 4));      // $2947CE/$294858
  if (ram.u16(a6 + o.anim) === 0x10) {                  // $2947D2/$29485C
    a3Start259962(ram, o.nextId);                       // $2947DC/$294866
    retire(ram, a4);                                    // $2947E4/$29486E
  }
}
const CLOSE12 = { dead: 0x3f, anim: 0x2a, trim: 0x4c, ang: 0x4a, angStep: -2, stopId: 0x0a, nextId: 2 };
const CLOSE13 = { dead: 0x7f, anim: 0x6a, trim: 0x8c, ang: 0x8a, angStep: -2, stopId: 0x0b, nextId: 3 };
// D 18/D 19 are D 12/D 13 but the angle INCREMENTS.
const CLOSE18 = { dead: 0x3f, anim: 0x2a, trim: 0x4c, ang: 0x4a, angStep: 2, stopId: 0x0a, nextId: 2 };
const CLOSE19 = { dead: 0x7f, anim: 0x6a, trim: 0x8c, ang: 0x8a, angStep: 2, stopId: 0x0b, nextId: 3 };

// ===========================================================================
// D 14 -- $294566 / $294658.  The part rotation.
// ===========================================================================
// D 14 rotates both parts' facing bytes, starting E 5/E 6/E 14 and stopping
// them when the rotation completes.  See W99 and the header comments of the
// first draft for the full five-state machine.
export function d14Init294566(ram, rom, a4, a6) {
  ram.setU16(a6 + 0x114, 0);                            // $294566
  ram.setU8(a4 + 0x02, 1);                              // $29456A
  // $294570 jsr $242FDE -- draw -> bne keeps +1, else $FF (-1).
  let d2 = 1;
  if (drawSigned242FDE(ram, rom) === 0) d2 = 0xff;      // $295576 bne / $29557A
  ram.setU8(a4 + 0x02, u8(d2));                         // $294570 stores the draw
  ram.setU8(a4 + 0x03, ram.u8(a4 + 0x02));              // $294580
  ram.setU16(a4 + 0x04, 0x4040);                        // $294586
  ram.setU8(a4 + 0x06, 0);                              // $29458C
  ram.setU16(a4 + 0x08, 0x0060);                        // $294592
  ram.setU32(a4 + 0x0a, 0);                             // $294598
  ram.setU32(a4 + 0x0e, 0);                             // $2945A0
  ram.setU16(a4 + 0x12, 0);                             // $2945A8
  const d0 = spread2595F2();                            // $2945AE/$2945B2 -> 4
  // $2945B8: cadence byte from table, minus $112(a6), ceiling $4.
  let cad = u8(rom.u8(W103.d14CadTab + d0) - ram.u8(a6 + 0x112));   // $2945BE/$2945C2
  if (i8(cad) > 4) cad = 4;                             // $2945C6 cmpi/bgt
  ram.setU8(a6 + 0x112, u8(ram.u8(a6 + 0x112) + 1));    // $2945D2
  if (i8(ram.u8(a6 + 0x112)) > 4) ram.setU8(a6 + 0x112, 4);   // $2945D6/$2945DC
  // $2945E6: shot-count byte from table, minus $113(a6), ceiling $0F.
  let cnt = u8(rom.u8(W103.d14CountTab + d0) - ram.u8(a6 + 0x113));   // $2945EC/$2945F0
  if (i8(cnt) > 0x0f) cnt = 0x0f;                       // $2945F4 cmpi/bgt
  ram.setU8(a6 + 0x113, u8(ram.u8(a6 + 0x113) + 1));    // $294600
  if (i8(ram.u8(a6 + 0x113)) > 0x10) ram.setU8(a6 + 0x113, 0x10);   // $294604/$29460A
  // $294614: fan parameter, WORD table.
  const d4 = rom.u16(W103.d14FanTab + d0 * 2);          // $294616/$29461A
  // E.start 5, store slot at $A(A4).
  let a0 = a1Start259A18(ram, 5);                       // $29461E/$294620
  ram.setU16(a0 + 0x04, cad);                           // $294626
  ram.setU8(a0 + 0x0b, cnt);                            // $29462A
  ram.setU16(a0 + 0x0c, d4);                            // $29462E
  ram.setU32(a4 + 0x0a, a0);                            // $294632
  // E.start 6, store slot at $E(A4).
  a0 = a1Start259A18(ram, 6);                           // $294636
  ram.setU16(a0 + 0x04, cad);                           // $29463E
  ram.setU8(a0 + 0x0b, cnt);                            // $294642
  ram.setU16(a0 + 0x0c, d4);                            // $294646
  ram.setU32(a4 + 0x0e, a0);                            // $29464A
  a1Start259A18(ram, 0x0e);                             // $29464E E.start 14
}
export function d14Step294658(ram, a4, a6) {
  // state 0: wait $60 frames
  if (ram.u8(a4 + 0x06) === 0) {                        // $294658
    const n = u16(ram.u16(a4 + 0x08) - 1);              // $294662
    ram.setU16(a4 + 0x08, n);
    if (n === 0) {                                      // $294666
      ram.setU8(a4 + 0x06, 1);                          // $29466A
      ram.setU16(a6 + 0x114, 1);                        // $294670
    }
  }
  // always: rotate both parts' facing by direction $3(a4)
  const d0 = i8(ram.u8(a4 + 0x03));                     // $294676
  ram.setU8(a6 + 0x4b, u8(ram.u8(a6 + 0x4b) + d0));     // $29467A
  ram.setU8(a6 + 0x8b, u8(ram.u8(a6 + 0x8b) + d0));     // $29467E
  // state 1: cadence tick; advance rotation and check limit
  if (ram.u8(a4 + 0x06) === 1) {                        // $294682
    if (subqByteBcc(ram, a4 + 0x04)) return;            // $29468C
    ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));            // $294694
    const acc = i8(ram.u8(a4 + 0x02));                  // $29469A
    ram.setU8(a4 + 0x03, u8(ram.u8(a4 + 0x03) + acc));  // $29469E
    let abs3 = i8(ram.u8(a4 + 0x03));                   // $2946A2
    if (abs3 < 0) abs3 = -abs3;                         // $2946A6 bpl/$2946AA neg
    if (abs3 === 2) {                                   // $2946AC cmpi.b #$2
      ram.setU8(a4 + 0x06, 2);                          // $2946B4
      ram.setU16(a4 + 0x04, 0x6020);                    // $2946BA
      ram.setU16(a4 + 0x12, 0x0100);                    // $2946C0
    }
  }
  // state 2: wait timer; then check if rotation home
  if (ram.u8(a4 + 0x06) === 2) {                        // $2946C6
    if (ram.u16(a4 + 0x12) !== 0) {                     // $2946D0
      ram.setU16(a4 + 0x12, u16(ram.u16(a4 + 0x12) - 1));   // $2946D8
      return;
    }
    const target = u8(i8(ram.u8(a4 + 0x02)) * 2);       // $2946E0/$2946E4
    if (ram.u8(a4 + 0x03) === target) {                 // $2946EA beq
      // Home check: part 1 facing at $40 (bit 0 cleared)?
      if ((ram.u8(a6 + 0x4b) & 0xfe) === 0x40) {        // $294712/$294716/$29471A
        ram.setU8(a6 + 0x4b, 0x40);                     // $294722
        ram.setU8(a6 + 0x8b, 0xc0);                     // $294728
        ram.setU8(a4 + 0x06, 3);                        // $29472E
        a1Stop259B08(ram, 5);                           // $294734
        a1Stop259B08(ram, 6);                           // $29473C
        a1Stop259B08(ram, 0x0e);                        // $294744
      } else if (!subqByteBcc(ram, a4 + 0x04)) {        // $2946F0 (not home: tick)
        ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));        // $2946F8
        const dir = i8(ram.u8(a4 + 0x02));              // $294706
        ram.setU8(a4 + 0x03, u8(ram.u8(a4 + 0x03) - dir));   // $29470A
      }
    } else if (!subqByteBcc(ram, a4 + 0x04)) {          // $2946F0 (target not met)
      ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));          // $2946F8
      const dir = i8(ram.u8(a4 + 0x02));                // $294706
      ram.setU8(a4 + 0x03, u8(ram.u8(a4 + 0x03) - dir));   // $29470A
    }
  }
  // state 3: retire
  if (ram.u8(a4 + 0x06) === 3) {                        // $29474C
    retire(ram, a4);                                    // $294756
    ram.setU16(a6 + 0x114, 0);                          // $294758
  }
}

// ===========================================================================
// D 15 -- $294872 / $294878.  Body-row sweep.
// ===========================================================================
export function d15Init294872(ram, a4) {
  ram.setU16(a4 + 0x02, 0x0101);                        // $294872 -- WORD: $2=1,$3=1
}
export function d15Step294878(ram, rom, ctx, a4, a6) {
  if (subqByteBcc(ram, a4 + 0x02)) return;              // $294878/$29487C
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));              // $294880
  const cur = u16(ram.u16(a6 + 0xac) + 0x20);           // $29488E/$294892
  const slewed = slew64(cur & 0xff, 0x20);              // $294896
  ram.setU16(a6 + 0xac, u16((slewed & 0xff) - 0x20));   // $29489C/$2949A2/$2949A6
  if ((slewed & 0xff) === 0x20) retire(ram, a4);        // $2948AA
  void rom; void ctx;
}

// ===========================================================================
// E 5 / E 6 -- $296082/$2960F4 and $296188/$296200.  Rotation guns.
// ===========================================================================
// E 5/E 6 fire kind 19 (bank B) from the part position, the angle advancing by
// $0F (E 5) or -$0F (E 6) per tick.  Rank adds two kind-19 core shots.
function rotationGunInit(ram, rom, a4, a6, o) {
  ram.setU8(a4 + 0x02, o.tick);                         // $296082/$296188
  ram.setU16(a4 + 0x04, 0);                             // $296088/$29618E
  ram.setU16(a4 + 0x06, 0x0008);                        // $29608E/$296194
  ram.setU8(a4 + 0x0a, o.angle);                        // $296094/$2961A0
  ram.setU8(a4 + 0x0a, u8(ram.u8(a4 + 0x0a) + u8(drawByte242B3C(ram, rom) << 2)));  // $29609A/$2961A6
  ram.setU16(a4 + 0x0e, 0x0404);                        // $2960A6/$2961B2
  ram.setU16(a4 + 0x10, 0x0505);                        // $2960AC/$2961B8
  ram.setU8(a4 + 0x12, 1);                              // $2960B2/$2961BE
  ram.setU8(a4 + 0x13, 0);                              // $2960B8/$2961C4
  ram.setU8(a4 + 0x03, 8);                              // $2960BE/$2961CA
  ram.setU16(a4 + 0x14, 0xfffa);                        // $2960C4/$2961D0
  if (ram.u16(W103.rank) !== 0) {                       // $2960CA/$2961D6
    ram.setU8(a4 + 0x03, 5);                            // $2960D4/$2961E0
    ram.setU16(a4 + 0x14, 0xfff9);                      // $2960DA/$2961E6
  }
  ram.setU8(a4 + 0x11, rom.u8(W103.e5CadTab + spread2595F2()));   // $2960EA/$2961F6
}
function rotationGunStep(ram, rom, ctx, a4, a5, a6, o) {
  if (ram.u8(a6 + o.dead) !== 0) return;                // $2960F4/$296200
  const d2 = (ram.u32(a6 + o.pos) + o.bias) >>> 0;      // $2960FC/$296208
  if (subqByteBcc(ram, a4 + 0x02)) {                    // $29610A/$296216
    o.subTick(ram, a4);                                 // $296112..$29613C (when not firing)
    o.advance(ram, a4);                                 // $296180/$29628C
    return;
  }
  // Main cadence fired: reload, tick sub-cadences, fire volley.
  o.subTick(ram, a4);                                   // $296112..$29613C
  let d1 = ram.u8(a4 + 0x0a);                           // $296142/$296144/$296250
  const d0 = ((ram.u16(a4 + 0x14) << 16) | 0x0013) >>> 0;   // $296148/$296254
  const log = new WriteLog(ram);
  fireBulletFan({ ram, rom, log }, 0x281764,
    { d0, d1, d2, d3: 0, d4: 0, d5: 0, a5 });           // $296152
  d1 = u8(d1 + 0x80);                                   // $296158
  fireBulletFan({ ram, rom, log }, 0x281764,
    { d0, d1, d2, d3: 0, d4: 0, d5: 0, a5 });           // $29615C
  if (ram.u16(W103.rank) !== 0) {                       // $296162
    d1 = u8(d1 + 0x40);                                 // $29616C
    fireBulletFan({ ram, rom, log }, 0x2816f6,
      { d0, d1, d2, d3: 0, d4: 0, d5: 0, a5 });         // $296170
    d1 = u8(d1 + 0x80);                                 // $296176
    fireBulletFan({ ram, rom, log }, 0x2816f6,
      { d0, d1, d2, d3: 0, d4: 0, d5: 0, a5 });         // $29617A
  }
  o.advance(ram, a4);                                   // $296180/$29628C
  void ctx;
}
// The sub-cadence tick: dec $e, on wrap reload and dec $3, copy $3->$2, dec $10.
const subTickFn = (ram, a4) => {
  if (subqByteBcc(ram, a4 + 0x0e)) return;              // $296112/$29621E
  ram.setU8(a4 + 0x0e, ram.u8(a4 + 0x0f));              // $29611A/$296226
  if (ram.u8(a4 + 0x03) !== 3)                          // $296120/$29622C
    ram.setU8(a4 + 0x03, u8(ram.u8(a4 + 0x03) - 1));    // $29612A/$296236
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));              // $29612E/$29623A
  if (subqByteBcc(ram, a4 + 0x10)) return;              // $296134/$296240
  ram.setU8(a4 + 0x10, ram.u8(a4 + 0x11));              // $29613C/$296248
};
const ROT5 = {
  dead: 0x3f, pos: 0x22, bias: 0xf6c00140, tick: 0x38, angle: 0x40,
  subTick: subTickFn,
  advance: (ram, a4) => ram.setU8(a4 + 0x0a, u8(ram.u8(a4 + 0x0a) + 0x0f)),   // $296180
};
const ROT6 = {
  dead: 0x7f, pos: 0x62, bias: 0xf6bffec0, tick: 0x20, angle: 0xc0,
  subTick: subTickFn,
  advance: (ram, a4) => ram.setU8(a4 + 0x0a, u8(ram.u8(a4 + 0x0a) - 0x0f)),   // $29628C
};

// ===========================================================================
// E 8 -- $296362 / $2963A2.  Type-$1E carrier spawner.
// ===========================================================================
export function e8Init296362(ram, rom, a4) {
  const d0 = spread2595F2() * 2;                        // $296362/$296366/$29636C
  ram.setU16(a4 + 0x02, rom.u16(W103.e8CountTab + d0)); // $29636E/$296372
  ram.setU16(a4 + 0x04, rom.u16(W103.e8CadTab + d0));   // $296378/$29637C
  ram.setU16(a4 + 0x06, 0x0018);                        // $296382
  ram.setU16(a4 + 0x08, 0);                             // $296388
  ram.setU16(a4 + 0x0a, 0x0002);                        // $29638E
  ram.setU16(a4 + 0x08, drawWord242EC2(ram, rom) & 1);  // $296394/$29639A/$29639E
}
export function e8Step2963A2(ram, rom, ctx, a4, a5, a6) {
  if (subqByteBcc(ram, a4 + 0x06)) return;              // $2963A2/$2963A6
  ram.setU8(a4 + 0x06, ram.u8(a4 + 0x07));              // $2963AA
  // Part 1: alive and alternation bit == 0
  if (ram.u8(a6 + 0x3f) === 0 && ram.u16(a4 + 0x08) === 0) {   // $2963B0/$2963B8
    spawn1E(ram, a6 + 0x22, 0xf6c00140, 0x1c20, a4);    // $2963C0..$2963E2
    if (ram.u16(W103.rank) !== 0)                       // $2963E8
      spawn1E(ram, a6 + 0x22, 0xf6c00140, 0x1a28, a4);  // $2963F2..$296414
  }
  // Part 2: alive and alternation bit != 0
  if (ram.u8(a6 + 0x7f) === 0 && ram.u16(a4 + 0x08) !== 0) {   // $29641A/$296422
    spawn1E(ram, a6 + 0x62, 0xf6bffec0, 0x1c20, a4);    // $29642A..$29644C
    if (ram.u16(W103.rank) !== 0)                       // $296452
      spawn1E(ram, a6 + 0x62, 0xf6bffec0, 0x1a18, a4);  // $29645C..$29647E
  }
  ram.setU16(a4 + 0x04, u16(ram.u16(a4 + 0x04) + 1));   // $29484
  ram.setU16(a4 + 0x08, u16(ram.u16(a4 + 0x08) + 1) & 1);   // $29488/$2948C
  const n = u16(ram.u16(a4 + 0x0a) - 1);                // $29492
  ram.setU16(a4 + 0x0a, n);
  if (n === 0) ram.setU16(a4, 0);                       // $29496/$2949A
  void rom; void ctx; void a5;
}
function spawn1E(ram, posOff, bias, speedFace, a4) {
  const r = enqueueDeferred(ram, 0x1e, DEFQ_D1.FIXED00, 0);   // $2963C2
  ram.setU32(r.addr + 0x16, (ram.u32(posOff) + bias) >>> 0);   // $2963C8/$2963CC/$2963D2
  ram.setU16(r.addr + 0x1a, speedFace);                 // $2963D6
  ram.setU16(r.addr + 0x1c, ram.u16(a4 + 0x04));        // $2963DC
  ram.setU16(r.addr + 0x1e, ram.u16(a4 + 0x02));        // $2963E2
}

// ===========================================================================
// E 12 -- $29669C / $2966B8.  HP-gated 10-shot burst (kind 19).
// ===========================================================================
export function e12Init29669C(ram, rom, a4) {
  const d0 = spread2595F2() * 2;
  ram.setU16(a4 + 0x02, rom.u16(W103.e12CountTab + d0));  // $29669C..$2966AC
  ram.setU16(a4 + 0x04, 0x0002);                        // $2966B2
}
export function e12Step2966B8(ram, rom, ctx, a4, a5, a6) {
  if ((ram.u32(a5 + 0x16) >>> 0) >= W103.hpGate) return;   // $2966B8/$2966C0
  if (subqByteBcc(ram, a4 + 0x02)) return;              // $2966C4
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));              // $2966CC
  const d2 = ram.u32(a6 + 0x02);                        // $2966D2
  const d0 = 0x00000013;                                // $2966D6 moveq #$13
  const d3A = rom.u32(W103.e12MuzzleA);                 // $2966DE
  const d3B = rom.u32(W103.e12MuzzleB);                 // $296714
  const log = new WriteLog(ram);
  // Five from muzzle A: $84, +$12, +$12, -$36, -$12
  let d1 = 0x84;                                        // $2966DA
  for (let i = 0; i < 5; i++) {
    fireBulletFan({ ram, rom, log }, 0x281764, { d0, d1, d2, d3: d3A, d4: 0, d5: 0, a5 });
    d1 = u8(d1 + 0x12);                                 // $2966E8/$2966F2
  }
  d1 = u8(d1 - 0x36);                                   // $2966FC
  fireBulletFan({ ram, rom, log }, 0x281764, { d0, d1, d2, d3: d3A, d4: 0, d5: 0, a5 });
  d1 = u8(d1 - 0x12);                                   // $296706
  fireBulletFan({ ram, rom, log }, 0x281764, { d0, d1, d2, d3: d3A, d4: 0, d5: 0, a5 });
  // Five from muzzle B: $7C, +$12, +$12, -$36, -$12
  d1 = 0x7c;                                            // $296710
  for (let i = 0; i < 5; i++) {
    fireBulletFan({ ram, rom, log }, 0x281764, { d0, d1, d2, d3: d3B, d4: 0, d5: 0, a5 });
    d1 = u8(d1 + 0x12);                                 // $29671E/$296728
  }
  d1 = u8(d1 - 0x36);                                   // $296732
  fireBulletFan({ ram, rom, log }, 0x281764, { d0, d1, d2, d3: d3B, d4: 0, d5: 0, a5 });
  d1 = u8(d1 - 0x12);                                   // $29673C
  fireBulletFan({ ram, rom, log }, 0x281764, { d0, d1, d2, d3: d3B, d4: 0, d5: 0, a5 });
  const n = u16(ram.u16(a4 + 0x04) - 1);                // $296746
  ram.setU16(a4 + 0x04, n);
  if (n === 0) ram.setU16(a4, 0);                       // $29674A/$29674E
  void ctx;
}

// ===========================================================================
// E 14 -- $2968E6 / $2968FE.  Rotation's own gun (kind 4 fan).
// ===========================================================================
export function e14Init2968E6(ram, a4) {
  ram.setU16(a4 + 0x04, 0x9050);                        // $2968E6 -- $4=$90, $5=$50
  ram.setU16(a4 + 0x06, 0);                             // $2968EC
  ram.setU16(a4 + 0x08, 0x0001);                        // $2968F2 -- $8=1, $9=0
  ram.setU16(a4 + 0x0a, 0x000c);                        // $2968F8 -- $a=$0C, $b=$00
}
export function e14Step2968FE(ram, rom, ctx, a4, a5, a6) {
  // $2968FE: if $8 == 0, run the outer cadence; else skip it.
  if (ram.u8(a4 + 0x08) === 0) {                        // $2968FE/$296902
    if (!subqByteBcc(ram, a4 + 0x04)) {                 // $296906
      if (i8(ram.u8(a4 + 0x05)) > 0x10)                 // $29690E cmpi.b/bls
        ram.setU8(a4 + 0x05, u8(ram.u8(a4 + 0x05) - 4));   // $296916
      ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));          // $29691A
      ram.setU8(a4 + 0x08, ram.u8(a4 + 0x09));          // $296920
    }
  }
  // $296926: the fire cadence.  bcc taken (not yet) -> rts at $296A18.
  if (subqByteBcc(ram, a4 + 0x0a)) return;              // $296926/$29692A bcc $296A18
  ram.setU8(a4 + 0x0a, ram.u8(a4 + 0x0b));              // $29692E
  ram.setU8(a5 + 0x03, ram.u8(a5 + 0x03) ^ 1);          // $296934 bchg target
  // Part 1
  if (ram.u8(a6 + 0x3f) === 0) {                        // $29693A
    const y = u16(ram.u16(a6 + 0x22) + 0xf6c0);         // $296942/$296948
    const x = u16(ram.u16(a6 + 0x24) + 0x0140);         // $29694C
    const r = aim256FromCaller(aimTables(rom), ram, a5, y, x);   // $296950
    if (!r.carry) {                                     // $296956
      const d2 = (ram.u32(a6 + 0x22) + 0xf6c00140) >>> 0;   // $29695A
      fire14Fan(ram, rom, a5, r.dir & 0xff, d2);        // $296968..$29699C
    }
  }
  // Part 2
  if (ram.u8(a6 + 0x7f) === 0) {                        // $2969A0
    const y = u16(ram.u16(a6 + 0x62) + 0xf6c0);         // $2969A8/$2969AE
    const x = u16(ram.u16(a6 + 0x64) + 0xfec0);         // $2969B2
    const r = aim256FromCaller(aimTables(rom), ram, a5, y, x);   // $2969B6
    if (!r.carry) {                                     // $2969BC
      const d2 = (ram.u32(a6 + 0x62) + 0xf6bffec0) >>> 0;   // $2969C0
      fire14Fan(ram, rom, a5, r.dir & 0xff, d2);        // $2969CE..$296A02
    }
  }
  // $296A06: dec $8; if it reaches exactly 0, toggle $6.
  const v = ram.u8(a4 + 0x08);
  ram.setU8(a4 + 0x08, u8(v - 1));                      // $296A06
  if (u8(v - 1) !== 0) return;                          // $296A0A bne
  ram.setU16(a4 + 0x06, u16(ram.u16(a4 + 0x06) + 1) & 1);   // $296A0E/$296A12
  void ctx;
}
function fire14Fan(ram, rom, a5, d1, d2) {
  const log = new WriteLog(ram);
  const hard = ram.u16(W103.rank) !== 0;                // $296968/$2969CE
  let d0, d5, d7, ang;
  if (!hard) {
    d0 = 0xfffe0004;                                    // $296972
    ang = u8(d1 - 2);                                   // $296978
    d5 = 2; d7 = 2;                                     // $29697A/$29697E -> 3 shots
  } else {
    d0 = 0x00000004;                                    // $296986
    ang = u8(d1 - 9);                                   // $296988
    d5 = 3; d7 = 6;                                     // $29698C/$296990 -> 7 shots
  }
  for (let k = 0; k <= d7; k++) {                       // $296994
    fireBulletFan({ ram, rom, log }, 0x2816f6,
      { d0, d1: ang, d2, d3: 0, d4: 0, d5: 0, a5 });
    ang = u8(ang + d5);                                 // $29699A
  }
}

// ===========================================================================
// $23F7C6 -- BUCKET-22 register-convention enqueue (same as $23E020 bucket 2).
// ===========================================================================
function emit23F7C6(ram, d1, d2, d3, d4) {
  return enqueueRegisters(ram, 22, d1 >>> 0, d2 >>> 0, d3, d4);
}

// ===========================================================================
// $296DFA / $296E48 -- THE CARRIER'S DEATH EXPLOSION.
//
// The two arms are BYTE-IDENTICAL for 38 bytes, which is why one body serves
// both.  Neither `jsr` is gated: the CONDITION is the arm itself (boss dying at
// $296DDE, lifetime expired at $296E44), and both arms then run straight
// through.  [M] the bytes:
//     $296DFA  70 01                 moveq #$1,D0        <- the kind, from the
//     $296DFC  4e b9 00 28 90 04     jsr $289004            bytes, not guessed
//     $296E02  21 6e 00 02 00 02     move.l ($2,A6),($2,A0)
//     $296E08  11 6e 00 1a 00 1a     move.b ($1A,A6),($1A,A0)
//     $296E0E  10 2e 00 1b           move.b ($1B,A6),D0
//     $296E12  d0 00                 add.b D0,D0
//     $296E14  d0 00                 add.b D0,D0
//     $296E16  11 40 00 1b           move.b D0,($1B,A0)
//     $296E1A  31 7c 00 10 00 1e     move.w #$10,($1E,A0)
// and $296E48..$296E6E is the same nine instructions at a +$4E displacement.
//
// TWO BYTE-SIZED WRITES INTO WORD FIELDS.  `($1A,A0)` is the HIGH byte of the
// word `B.speed`, and `($1B,A0)` is `B.angle`, the low byte of the SAME word --
// so the pair is one word built from two records' bytes, and a port that wrote
// `setU16(e + B.speed, ...)` would destroy the angle it is about to store.
// The angle is `add.b` TWICE, i.e. x4 truncated to a byte, not x2 and not a
// 16-bit shift.
function carrierExplode(ram, ctx, a6, siteAddr) {
  const e = spawnEffect(ram, ctx, 0x01, siteAddr);        // moveq #$1,D0 / jsr $289004
  ram.setU32(e + B.pos, ram.u32(a6 + 0x02));              // move.l ($2,A6),($2,A0)
  ram.setU8(e + B.speed, ram.u8(a6 + B.speed));           // move.b ($1A,A6),($1A,A0)
  ram.setU8(e + B.angle, u8(ram.u8(a6 + B.angle) * 4));   // 2x add.b D0,D0
  ram.setU16(e + B.bucket, 0x10);                         // move.w #$10,($1E,A0)
}

// ===========================================================================
// TYPE-$1E HANDLER -- `$296DD6`.  The carrier object's per-frame routine.
// ===========================================================================
export function handler1E_296DD6(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);
  // $296DD6: boss death flag -> explode and free immediately.
  if ((ram.u8(W103.bossFlags) & 0x40) !== 0) {          // $296DD6/$296DDE
    carrierExplode(ram, ctx, a6, 0x296dfc);             // $296DFA/$296DFC
    freeEnemy(ram, a5);                                 // $296E20 jmp $263762
    return;
  }
  // $296DE2: hit test.  D1 = $5C & (a6); if non-zero, clear hit bits.
  const st = ram.u8(a6);
  if ((st & 0x5c) !== 0) {                              // $296DE2/$296DE4
    ram.setU8(a6, st & 0xa3);                           // $296DEA
    ram.setU16(a6 + 0x18, 0x7fff);                      // $296DF0
  }
  // $296E28: apply velocity, tick, lifetime check.
  applyVelocity(ram, ctx.tables, a5);                   // $296E28
  const tick = ram.u8(a5 + 0x26);
  ram.setU8(a5 + 0x26, u8(tick - 1));                   // $296E2E
  if (tick === 0) {                                     // bcc (old != 0)
    ram.setU8(a5 + 0x26, ram.u8(a5 + 0x27));            // $296E36
    const life = u8(ram.u8(a6 + 0x1a) - 1);             // $296E3C
    ram.setU8(a6 + 0x1a, life);
    if (life === 0) {                                   // $296E40 tst.b/bne
      carrierExplode(ram, ctx, a6, 0x296e4a);           // $296E48/$296E4A
      fire1EDeathFan(ram, rom, a5, a6);                 // $296E82..$296F20
      freeEnemy(ram, a5);                               // $296F24 jmp $263762
      return;
    }
  }
  // Still alive: animate and draw.
  const a = u8(ram.u8(a5 + 0x1e) - 1);                  // $296F2C
  ram.setU8(a5 + 0x1e, a);
  if (a === 0xff) {                                     // bcc (old != 0)
    ram.setU8(a5 + 0x1e, ram.u8(a5 + 0x1f));            // $296F34
    ram.setU16(a5 + 0x20, u16(ram.u16(a5 + 0x20) + 4) & 0x3f);   // $296F3A/$296F3E
  }
  const d2 = rom.u32(W103.obj1ESprites + ram.u16(a5 + 0x20));   // $296F44..$296F4E
  const d1 = (ram.u32(a6 + 0x02) + 0xfa00fd00) >>> 0;   // $296F50/$296F54
  emit23F7C6(ram, d1, d2, 0x0618, 0x11);                // $296F5A/$296F5E/$296F60
}
/** The three-volley kind 3/4/5 death fan, each 16 shots from a different
 *  fan table, counts N, N-4, N-7.  Skipped entirely when death-pause or
 *  freeze is active. */
function fire1EDeathFan(ram, rom, a5, a6) {
  if (ram.u16(W103.deathPause) !== 0) return;           // $296E92
  if (ram.u16(W103.freeze) !== 0) return;               // $296E9C
  const d2 = ram.u32(a6 + 0x02);                        // $296E7A
  let d1 = u8(drawWord242EC2(ram, rom));                // $296E6E
  let count = i16(ram.u16(a5 + 0x1c));                  // $296E82/$296E86/$296E88
  const log = new WriteLog(ram);
  const volley = (kind, tab, cnt) => {
    const d0 = ((u16(cnt) & 0xffff) << 16 | kind) >>> 0;
    for (let k = 0; k < 16; k++) {                      // $296EA6/$296ED4/$296F02
      const idx = (u8(d1) & 0x3f) * 4;                  // $296EAE..$296EB8
      const d3 = rom.u32(tab + idx);                    // $296EBC
      fireBulletFan({ ram, rom, log }, 0x2813f0,
        { d0, d1: u8(d1), d2, d3, d4: 0, d5: 0, a5 });
      d1 = u8(d1 + 4);                                  // $296EC2/$296EF0/$296F1E
    }
  };
  volley(3, W103.fanTableA, count);                     // $296E8E
  count = u16(count - 4);                               // $296EC8 subi.l #$40000
  d1 = u8(d1 + 2);                                      // $296ED2
  volley(4, W103.fanTableB, count);                     // $296ECE
  count = u16(count - 3);                               // $296EF6 subi.l #$30000
  d1 = u8(d1 + 2);                                      // $296F00
  volley(5, W103.fanTableC, count);                     // $296EFC
}

// ============================================================= REGISTRATION
const A6 = (ctx, at) => bossA6(ctx, at);
const A5 = (ctx, at) => bossA5(ctx, at);

// MAIN 3 / 4 / 8 -- all three INITs fall through.
registerScript(0x2934a2, (ram, rom, ctx, a4) => {
  const a6 = A6(ctx, 0x2934a2);
  main3Init2934A2(ram, a4, a6);
  main3Step2934AC(ram, rom, ctx, a4, A5(ctx, 0x2934a2), a6);
});
registerScript(0x2934ac, (ram, rom, ctx, a4) =>
  main3Step2934AC(ram, rom, ctx, a4, A5(ctx, 0x2934ac), A6(ctx, 0x2934ac)));

registerScript(0x2934f8, (ram, rom, ctx, a4) => {
  const a6 = A6(ctx, 0x2934f8);
  main4Init2934F8(ram, rom, a4, a6);
  main4Step293506(ram, rom, ctx, a4, A5(ctx, 0x2934f8), a6);
});
registerScript(0x293506, (ram, rom, ctx, a4) =>
  main4Step293506(ram, rom, ctx, a4, A5(ctx, 0x293506), A6(ctx, 0x293506)));

registerScript(0x2936b4, (ram, rom, ctx, a4) => {
  const a6 = A6(ctx, 0x2936b4);
  main8Init2936B4(ram, a4, a6);
  main8Step2936BE(ram, rom, ctx, a4, A5(ctx, 0x2936b4), a6);
});
registerScript(0x2936be, (ram, rom, ctx, a4) =>
  main8Step2936BE(ram, rom, ctx, a4, A5(ctx, 0x2936be), A6(ctx, 0x2936be)));

// F 2 / F 3 -- both INITs fall through.
registerScript(0x2952d8, (ram, rom, ctx, a4) => {
  f2Init2952D8(ram, a4, A6(ctx, 0x2952d8));
  f2Step295304(ram, rom, ctx, a4);
});
registerScript(0x295304, (ram, rom, ctx, a4) => f2Step295304(ram, rom, ctx, a4));

registerScript(0x29540c, (ram, rom, ctx, a4) => {
  f3Init29540C(ram, a4, A6(ctx, 0x29540c));
  f3Step295432(ram, rom, ctx, a4);
});
registerScript(0x295432, (ram, rom, ctx, a4) => f3Step295432(ram, rom, ctx, a4));

// D 8..19 -- all INITs end in `rts`.
registerScript(0x2943ee, (ram, rom, ctx, a4) => { void rom; hatchInit(ram, a4); });
registerScript(0x2943fc, (ram, rom, ctx, a4) => hatchStep(ram, a4, A6(ctx, 0x2943fc), HATCH8));
registerScript(0x294466, (ram, rom, ctx, a4) => { void rom; hatchInit(ram, a4); });
registerScript(0x294474, (ram, rom, ctx, a4) => hatchStep(ram, a4, A6(ctx, 0x294474), HATCH9));

registerScript(0x2944de, (ram, rom, ctx, a4) => { void rom; fastWobbleInit(ram, a4); });
registerScript(0x2944e6, (ram, rom, ctx, a4) => fastWobbleStep(ram, a4, A6(ctx, 0x2944e6), W10));
registerScript(0x294512, (ram, rom, ctx, a4) => { void rom; fastWobbleInit(ram, a4); });
registerScript(0x29451a, (ram, rom, ctx, a4) => fastWobbleStep(ram, a4, A6(ctx, 0x29451a), W11));

registerScript(0x29475e, (ram, rom, ctx, a4) => { void rom; closeHatchInit(ram, a4); });
registerScript(0x294772, (ram, rom, ctx, a4) => closeHatchStep(ram, a4, A6(ctx, 0x294772), CLOSE12));
registerScript(0x2947e8, (ram, rom, ctx, a4) => { void rom; closeHatchInit(ram, a4); });
registerScript(0x2947fc, (ram, rom, ctx, a4) => closeHatchStep(ram, a4, A6(ctx, 0x2947fc), CLOSE13));

registerScript(0x2948b6, (ram, rom, ctx, a4) => { void rom; hatchInit(ram, a4); });
registerScript(0x2948c4, (ram, rom, ctx, a4) => hatchStep(ram, a4, A6(ctx, 0x2948c4), HATCH16));
registerScript(0x29492e, (ram, rom, ctx, a4) => { void rom; hatchInit(ram, a4); });
registerScript(0x29493c, (ram, rom, ctx, a4) => hatchStep(ram, a4, A6(ctx, 0x29493c), HATCH17));

registerScript(0x2949a6, (ram, rom, ctx, a4) => { void rom; closeHatchInit(ram, a4); });
registerScript(0x2949ba, (ram, rom, ctx, a4) => closeHatchStep(ram, a4, A6(ctx, 0x2949ba), CLOSE18));
registerScript(0x294a30, (ram, rom, ctx, a4) => { void rom; closeHatchInit(ram, a4); });
registerScript(0x294a44, (ram, rom, ctx, a4) => closeHatchStep(ram, a4, A6(ctx, 0x294a44), CLOSE19));

// D 14 / D 15.
registerScript(0x294566, (ram, rom, ctx, a4) =>
  d14Init294566(ram, rom, a4, A6(ctx, 0x294566)));
registerScript(0x294658, (ram, rom, ctx, a4) =>
  d14Step294658(ram, a4, A6(ctx, 0x294658)));

registerScript(0x294872, (ram, rom, ctx, a4) => d15Init294872(ram, a4));
registerScript(0x294878, (ram, rom, ctx, a4) =>
  d15Step294878(ram, rom, ctx, a4, A6(ctx, 0x294878)));

// E 5 / E 6 -- INITs fall through when the part is alive.
registerScript(0x296082, (ram, rom, ctx, a4) => {
  const a5 = A5(ctx, 0x296082), a6 = A6(ctx, 0x296082);
  rotationGunInit(ram, rom, a4, a6, ROT5);
  rotationGunStep(ram, rom, ctx, a4, a5, a6, ROT5);
});
registerScript(0x2960f4, (ram, rom, ctx, a4) =>
  rotationGunStep(ram, rom, ctx, a4, A5(ctx, 0x2960f4), A6(ctx, 0x2960f4), ROT5));

registerScript(0x296188, (ram, rom, ctx, a4) => {
  const a5 = A5(ctx, 0x296188), a6 = A6(ctx, 0x296188);
  rotationGunInit(ram, rom, a4, a6, ROT6);
  rotationGunStep(ram, rom, ctx, a4, a5, a6, ROT6);
});
registerScript(0x296200, (ram, rom, ctx, a4) =>
  rotationGunStep(ram, rom, ctx, a4, A5(ctx, 0x296200), A6(ctx, 0x296200), ROT6));

// E 8 -- INIT falls through.
registerScript(0x296362, (ram, rom, ctx, a4) => {
  e8Init296362(ram, rom, a4);
  e8Step2963A2(ram, rom, ctx, a4, A5(ctx, 0x296362), A6(ctx, 0x296362));
});
registerScript(0x2963a2, (ram, rom, ctx, a4) =>
  e8Step2963A2(ram, rom, ctx, a4, A5(ctx, 0x2963a2), A6(ctx, 0x2963a2)));

// E 12 -- INIT falls through.
registerScript(0x29669c, (ram, rom, ctx, a4) => {
  e12Init29669C(ram, rom, a4);
  e12Step2966B8(ram, rom, ctx, a4, A5(ctx, 0x29669c), A6(ctx, 0x29669c));
});
registerScript(0x2966b8, (ram, rom, ctx, a4) =>
  e12Step2966B8(ram, rom, ctx, a4, A5(ctx, 0x2966b8), A6(ctx, 0x2966b8)));

// E 14 -- INIT falls through.
registerScript(0x2968e6, (ram, rom, ctx, a4) => {
  e14Init2968E6(ram, a4);
  e14Step2968FE(ram, rom, ctx, a4, A5(ctx, 0x2968e6), A6(ctx, 0x2968e6));
});
registerScript(0x2968fe, (ram, rom, ctx, a4) =>
  e14Step2968FE(ram, rom, ctx, a4, A5(ctx, 0x2968fe), A6(ctx, 0x2968fe)));
