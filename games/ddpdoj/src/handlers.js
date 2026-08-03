// THE SIX ENEMY HANDLERS -- `$2688CC` ($11), `$26A2E2` ($07/$27), `$2747C6`
// ($82), `$269CEA` ($05), `$27687E` ($8B), `$268232` ($10) -- 79 % of stage-1
// spawns (267 of 339 records).  The enemy driver `$263502` (src/enemies.js)
// dispatches each live enemy's handler from the function pointer the init stored
// at record `+$4C`.
//
// ======================= WHAT A HANDLER IS, IN THIS PORT =====================
//
// A handler runs ONCE PER FRAME per live enemy.  Its first instruction is
// `jsr $2638A6` (stepMovement, W24) -- the per-frame movement interpreter that
// advances position from the movement-script stream.  The rest is bespoke
// per-type logic: an on-screen bounds test (free on exit), a damage/hit branch
// (palette flash + `$286096` DAMAGE), a freeze gate (`$8130d2`), a heading->
// sprite table lookup, a fire-cooldown counter, the aim (`$2420xx`, W20) +
// slew (`$242190`, W20), and the fire itself: an INDIRECT `jsr (A0)` through a
// function pointer the init stored (record `+$2A`/`+$2E`) at a `$23Dxxx`
// fire-action routine, which sets up D0-D5 and calls a `$281xxx` bullet FAN
// generator (W21).
//
// ===================== WHAT IS FAITHFULLY PORTED THIS WAVE ===================
//
// The structure of all six handlers, re-derived from maincpu.bin with capstone
// (NOT prior art -- the fall-through trap is live: two handlers start BEFORE
// their table address via a shared death-sequence prologue, and two share one
// prologue).  Cited by ROM address on every non-obvious line.  Working parts:
//   * `jsr $2638A6` stepMovement (W24) -- position, the done-when column
//   * the on-screen bounds test + `jmp $263762` free (self-contained)
//   * the freeze gate `$8130d2` (self-contained)
//   * the heading->sprite table lookups (ROM reads)
//   * the fire-cooldown counters (self-contained state on the record)
//   * the fire-gate `$267FC6` and the onscreen test `$242684` (ported here)
//
// ===================== WHAT NOTES (never a silent return) ===================
//
// These subsystems run every frame on every live enemy, so they NOTE (counted,
// never throw -- the unported.js convention) rather than halt the driver:
//   * `$286096` DAMAGE -- W28 (HP/hitbox; the hit-reaction displacement W24's
//     F6 isolated)
//   * the INDIRECT fire-action calls `jsr (A0)`/`jmp (A0)` through `+$2A`/`+$2E`
//     -> the `$23Dxxx` routines -> the `$281xxx` bullet fans -- need the W26
//     bullet POOL (`$817F8C`) + the W27 fire-action bodies
//   * `$28615E` (effect/score, 87 callers), `$289004` (sprite-EFFECT allocator,
//     294 callers), `$289AF4`, `$28C25A`/`$274`/`$2A8` (death effects) -- W26
//   * `$28AC72` (type `$82`), `$27F8EE` (type `$8B`) -- W27/W29
// The fields those routines would have written (HP after a hit, spawned
// effect/bullet records) are EXCLUDED from the compared set BY NAME.  The
// position column (`$2/$4,A6`) is untouched by any of them -- it is the
// verified done-when column (W24 proved it for one mover; this wave
// generalises the proof to all six types through the real per-frame dispatch).

import { unreached } from './unported.js';
import { u16, i16 } from './ram.js';
import { freeEnemy } from './initbody.js';
import { stepMovement, scrollCompensate, applyVelocity } from './movement.js';

// ----------------------------------------------------------- record offsets
// A5 = enemy record, A6 = sub-record (= +$6,A5).  Named once so each handler
// reads as the listing does.
const R = {
  onScreen: 0x16, cooldown: 0x18, cooldownReload: 0x19, deathFlag: 0x20,
  sprite22: 0x22, hpReload: 0x26, fireCtr: 0x28, fireAct2A: 0x2a,
  fireAct2E: 0x2e, facing: 0x33, pal34: 0x34, palCycle: 0x35,
  handler: 0x4c, runLen: 0x04, movement: 0x12, flags: 0x02, classByte: 0x0d,
};
// sub-record (A6)
const S = {
  flags: 0x00, posX: 0x02, posY: 0x04, hp: 0x18, speed: 0x1a, heading: 0x1b,
  palette: 0x1d, anim: 0x1e, f1f: 0x1f, sprite0a: 0x0a, f10: 0x10, f1c: 0x1c,
};
// the globals the handlers read
const G = {
  freeze: 0x8130d2, scroll: 0x813172, rank98: 0x813098, stage: 0x813092,
  clock: 0x8130ce, midbossD8: 0x8130d8, aa: 0x8130aa, ba: 0x8130ba,
  stage96: 0x813096, scrollClockOdo: 0x8130d0,
  mirror: 0x80390b, mirror2: 0x80390c,
};
// 16-direction sprite-pointer tables, by handler (ROM addresses, build B)
const SPRITE_TAB = {
  h11_main: 0x268b9e,   // $2689B6 lea (heading -> sub +$0A sprite)
  h11_fire: 0x268c9e,   // $268A4E lea (facing -> record +$22 sprite, post-slew)
};

// ---------------------------------------------------- the loud-counted notes
function noteDamage(u, a5, from) {
  u?.note(0x286096, `DAMAGE $286096 (W28) ${from} rec $${a5.toString(16)} `
    + `-- HP/sub-hitbox columns excluded`);
}
function noteEffect(u, addr, a5, what) {
  u?.note(addr, `effect $${addr.toString(16).toUpperCase()} (${what}) (W26) rec $${a5.toString(16)}`);
}
function noteFireAction(u, a5, ptrVal) {
  u?.note(ptrVal, `indirect fire-action jsr (A0)= $${ptrVal.toString(16).toUpperCase()} `
    + `(W27 $23Dxxx + W21/W26 bullet fan) rec $${a5.toString(16)} -- bullet cols excluded`);
}
function noteFan(u, addr, a5, kind) {
  u?.note(addr, `bullet fan $${addr.toString(16).toUpperCase()} ${kind} (W21 log/W26 pool) rec $${a5.toString(16)}`);
}

// ------------------------------------------- $267FC6: the fire gate (ported)
// Reads $813096 (stage*4) + $813098 (rank) + four ROM tables ($242576/$24259E/
// $242562/$24258A) and draws the RNG at $804000 to decide whether the enemy may
// fire this frame.  Returns `{ carry }`; carry === true means "do not fire"
// (the ROM's `bcs` arm).  Self-contained.
function fireGate267FC6(ram, rom) {
  const d0 = ram.u16(G.stage96);                       // $267FC6 move.w $813096
  const ranked = ram.u16(G.rank98) !== 0;
  const a0 = ranked ? 0x24259e : 0x242576;             // $267FCC/$267FD2/$267FDC
  const d2 = rom.u32(a0 + d0);                         // $267FE2 move.l (A0,D0)
  // (the second table read at $267FE6 feeds a field the fire-action consumes;
  // for the gate verdict only D2 + the RNG draw matter.)
  const rng = ram.u16(0x804000);                       // the RNG word
  return { carry: i16(rng) >= i16(d2 & 0xffff), d2 };
}

// ----------------------------------------------- $242684: the onscreen test
// `move.l $2(A6),D0 / addi.w #$1c00 / add.w $813172 / addi.w #$9000 / bcs /
//  swap / addi.w #$800 / addi.w #$8000 / rts` -- carry SET = OFF-screen.
function onScreen242684(ram, a6) {
  const pos = ram.u32(a6 + 0x02);                      // $242684 move.l $2(A6)
  let y = u16((pos & 0xffff) + 0x1c00);                // $242688 addi.w #$1c00
  y = u16(y + ram.u16(G.scroll));                      // $24268C add.w $813172
  if (i16(y) + 0x9000 > 0xffff) return true;           // $242696 bcs (Y off)
  let x = u16((pos >>> 16) + 0x800);                   // swap; $24269A addi.w #$800
  return i16(x) + 0x8000 > 0xffff;                     // carry = X off
}

// helper: $11-style on-screen bounds test (Y first, then X; the inlined variant
// at $2688D2).  Returns true if OFF-screen.
function bounds11(ram, a6) {
  const pos = ram.u32(a6 + 0x02);                      // $2688D2 move.l $2(A6)
  let y = u16(u16((pos & 0xffff) + 0xe00) + ram.u16(G.scroll)); // +$e00 + scroll
  if (i16(y) + 0xac00 > 0xffff) return true;           // $2688E0 addi.w #$ac00
  const x = u16((pos >>> 16) + 0x600);                 // $2688E8 addi.w #$600
  return i16(x) + 0x8400 > 0xffff;                     // $2688EC addi.w #$8400
}

// ============================================================ TYPE $11 (104)
// `$2688CC`.  The commonest stage-1 enemy: a script-mover that aims, turns and
// fires a kind-$D fan.  Its death sequence is the SHARED PROLOGUE at `$268844`
// (reached via `bmi $268844` from `$26892A`).  flow.py TRUE span
// `$268844..$268B1E` (730 B, 177 insns) -- reading only from the table addr
// `$2688CC` misses the entire death path.
function handler11(ram, rom, a5, ctx) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, tables, u)) return;   // $2688CC jsr $2638A6 (freed)
  // $2688D2..$268900: bounds test.  off + has-been-on-screen -> free.
  if (bounds11(ram, a6)) {                             // $2688F0 bcc $268900
    if (ram.u16(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; } // $2688F8
  } else {
    ram.setU16(a5 + R.onScreen, 1);                    // $268900
  }
  // $268906: damage/hit branch.  sub flags byte & $5C.
  if ((ram.u8(a6) & 0x5c) !== 0) {                     // $268908
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // $26890E andi.b #$a3
    const pc = ram.u8(a5 + R.palCycle);                // $268912
    ram.setU8(a6 + S.palette, ram.u8(a6 + S.palette) ^ pc); // $268916 eor.b
    noteDamage(u, a5, '$11');                           // $26891A jsr $286096 (W28)
    if ((ram.u16(a6 + S.hp) & 0x8000) !== 0) {         // $268920 tst.w $18 / $268924 bpl
      deathSeq11(ram, rom, a5, a6, ctx);               // $26892A bmi $268844
      return;
    }
  } else {
    ram.setU8(a6 + S.palette, ram.u8(a5 + R.pal34));   // $26898A
  }
  fire11(ram, rom, a5, a6, ctx);                       // $268990 (fall-through)
}

// ---- $268844: SHARED DEATH SEQUENCE (the prologue) ------------------------
function deathSeq11(ram, rom, a5, a6, ctx) {
  const u = ctx.unported;
  noteEffect(u, 0x28615e, a5, 'D0=$10 explosion');     // $268846
  noteEffect(u, 0x289004, a5, 'D0=$7 death effect');   // $268852
  // $268858..$268898: pos/anim copy into the (not-spawned) effect record + the
  // $815EA2 cap bookkeeping -- part of the noted $289004 effect gap.
  // $26889E btst #0,$815EA5 -> $289AF4 (the secondary death effect, if the cap
  // bit is clear).  Both the cap test and the spawn are W26-owned; noted.
  noteEffect(u, 0x289af4, a5, 'D0=$4 secondary');      // $2688BA (ea5 bit 0)
  noteEffect(u, 0x28c25a, a5, 'death burst');          // $2688C0
  freeEnemy(ram, a5);                                  // $2688C6 jmp $263762
}

// ---- $268990..$268B1A: fire / state machine -------------------------------
function fire11(ram, rom, a5, a6, ctx) {
  const u = ctx.unported;
  if (ram.u16(G.freeze) === 0) {                       // $268990 tst.w $8130D2
    const d7 = ram.u16(a6 + S.speed);                  // $268998 move.w $1a(A6)
    let d1 = (d7 & 0x3e) << 2;                         // $26899C/A0/A2 (x4)
    if ((d7 & 0x40) === 0 && (ram.u8(G.mirror) & 0x04) !== 0) // $2689A4/$2689AA
      d1 = u16(d1 + 4);                                // $2689B4 (mirror)
    ram.setU32(a6 + S.sprite0a, rom.u32(SPRITE_TAB.h11_main + d1)); // $2689BC
  }
  // $2689C2: indirect fire-action via +$2A (the per-bucket $23Dxxx routine).
  noteFireAction(u, a5, ram.u32(a5 + R.fireAct2A));    // $2689C6 jsr (A0)
  if ((ram.u8(a5 + R.deathFlag) & 0x80) !== 0) {       // $2689C8 tst.b $20 / bmi
    if (ram.u16(G.mirror2) !== 0)                      // $2689CE
      noteFireAction(u, a5, ram.u32(a5 + R.fireAct2E)); // $268A08 jmp (A0)
    return;                                           // $268A0C rts
  }
  if (ram.u16(G.freeze) !== 0) {                       // $268A0E
    noteFireAction(u, a5, ram.u32(a5 + R.fireAct2E)); return;
  }
  // $268A1A: the fire-cooldown counter.  Self-contained state on the record.
  ram.setU8(a5 + R.cooldown, (ram.u8(a5 + R.cooldown) - 1) & 0xff); // subq.b #1
  if ((ram.u8(a5 + R.cooldown) & 0x80) === 0) {        // $268A1E bcc $268A5A
    ram.setU8(a5 + R.cooldown, ram.u8(a5 + R.cooldownReload)); // $268A20 reload
    // $268A30 jsr $24200A (aim, W20) + $268A3C jsr $242190 (slew, W20).  These
    // write record +$33 (facing) and +$22 (sprite); not the position column.
    u?.note(0x24200a, `aim $24200A + slew $242190 (W20) in $11 fire rec $${a5.toString(16)} `
      + `-- writes +$33/+22, not position`);
  }
  // $268A5A: the secondary fire counter (+$28) when sub flags bit 5 set.
  if ((ram.u8(a6) & 0x20) !== 0) {                     // btst #5
    const c = (ram.u8(a5 + R.fireCtr) - 1) & 0xff;     // $268A62 subq.b #1,$28
    ram.setU8(a5 + R.fireCtr, c);
    if (c === 0) { fireFan11(ram, rom, a5, a6, ctx); return; } // $268A66 beq
  }
  noteFireAction(u, a5, ram.u32(a5 + R.fireAct2E));    // $268A82 jmp (A0) (common fire)
}

// $268A86..$268B1A: counter-elapsed kind-$D fan.
function fireFan11(ram, rom, a5, a6, ctx) {
  const u = ctx.unported;
  let d0 = u16(0xa0 - ram.u16(G.aa) + 4);             // $268A86/A8/A90
  if (ram.u16(G.rank98) === 0 && ram.u16(G.stage) === 1 // $268A92/$268A9C
      && i16(ram.u16(G.clock)) >= 0x159) {             // $268AA6
    d0 = u16(0x30 - ram.u16(G.ba) - 6);               // $268AB0/B2/B8
  }
  ram.setU8(a5 + R.fireCtr, d0 & 0xff);               // $268ABA
  if (fireGate267FC6(ram, rom).carry) {                // $268ABE jsr / $268AC2 bcs
    noteFireAction(u, a5, ram.u32(a5 + R.fireAct2E)); return;
  }
  if (ram.u16(G.stage) === 1 && ram.u16(G.midbossD8) !== 0) { // $268AC4/AD0/AD6
    noteFireAction(u, a5, ram.u32(a5 + R.fireAct2E)); return;
  }
  if ((ram.u8(a6) & 0x20) !== 0)                        // $268AD8 btst #5
    noteFan(u, 0x281402, a5, 'kind $D');               // $268B14 jsr $281402
  noteFireAction(u, a5, ram.u32(a5 + R.fireAct2E));    // $268B1A bra $268A68
}

// ============================================================ TYPE $10 (16)
// `$268232`.  Same shape as $11 (script-mover + aim + fire) with a bespoke
// bounds test (a draw-flag gate on +$32 and a $7600 compare).  Its death
// sequence is the SHARED PROLOGUE at `$2681CE` (reached via `bmi $2681CE` from
// `$26829E`).  flow.py TRUE span `$2681CE..$268490` (710 B, 183 insns).
function handler10(ram, rom, a5, ctx) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, tables, u)) return;   // $268232 jsr $2638A6
  // $268238..$268276: bounds.  Y += $1200 + scroll + $a400; X (after swap) has
  // a +$32 draw-flag gate ($7600 compare) then += $a00 + $7c00.
  const pos = ram.u32(a6 + 0x02);                      // $268238 move.l $2(A6)
  let y = u16(u16((pos & 0xffff) + 0x1200) + ram.u16(G.scroll)); // $26823C/$268240
  let off = i16(y) + 0xa400 > 0xffff;                  // $268246 addi.w #$a400
  if (!off) {                                          // $26824A bcs $268268
    let x = u16((pos >>> 16));                         // $26824C swap
    if (ram.u8(a5 + 0x32) !== 0 && i16(x) < 0x7600) {  // $26824E/$268254
      ram.setU8(a5 + 0x32, 0);                         // $26825A clr.b $32(A5)
    }
    x = u16(x + 0xa00);                                // $26825E addi.w #$a00
    off = i16(x) + 0x7c00 > 0xffff;                    // $268262 addi.w #$7c00
  }
  if (off) {                                           // $268266 bcc $268276
    if (ram.u16(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; } // $26826E
  } else {
    ram.setU16(a5 + R.onScreen, 1);                    // $268276
  }
  // $26827C: damage/hit branch (same shape as $11).
  if ((ram.u8(a6) & 0x5c) !== 0) {                     // $26827E
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // $268282
    const pc = ram.u8(a5 + R.palCycle);                // $268286
    ram.setU8(a6 + S.palette, ram.u8(a6 + S.palette) ^ pc); // $26828A
    noteDamage(u, a5, '$10');                           // $26828E jsr $286096 (W28)
    if ((ram.u16(a6 + S.hp) & 0x8000) !== 0) {         // $268294 tst.w $18 / bpl
      if ((ram.u8(a5 + R.deathFlag) & 0x80) !== 0) { deathSeq10(ram, rom, a5, a6, ctx); return; } // $26829E bmi $2681CE
      ram.bclr8(a6, 1);                                // $2682A2 bclr #1,(A6)
      ram.setU16(a6 + S.hp, ram.u16(a5 + R.hpReload)); // $2682A6 reload HP
      noteEffect(u, 0x28615e, a5, 'D0=$8 explosion');  // $2682AE
      ram.bset8(a5 + R.deathFlag, 7);                  // $2682B4 bset #7,$20
      noteEffect(u, 0x289004, a5, 'D0=$3 death effect'); // $2682C0
      return;                                          // (death effect setup -> noted)
    }
  }
  // $2682F8.. : the fire/state machine (same shape as $11: freeze, heading->sprite
  // table, indirect fire-action via +$2A/+2E, cooldown, aim, fan).  All fire paths
  // note (W26/W27).  The position column is untouched past this point.
  u?.note(0x268232, `$10 fire/state machine $2682F8..$268490 (W26/W27 effects+fans) rec $${a5.toString(16)}`);
}
// $2681CE: SHARED DEATH SEQUENCE for $10 (the prologue).  Effects noted, then free.
function deathSeq10(ram, rom, a5, a6, ctx) {
  const u = ctx.unported;
  noteEffect(u, 0x28615e, a5, 'D0=$10 explosion');
  noteEffect(u, 0x289004, a5, 'D0=$7 death effect');
  noteEffect(u, 0x289af4, a5, 'D0=$4 secondary');
  noteEffect(u, 0x28c25a, a5, 'death burst');
  freeEnemy(ram, a5);                                  // jmp $263762
}

// ================================================ TYPE $05 (28) + $07/$27 (64)
// The DAMAGE-FIRST FAMILY: `$269CEA` ($05) and `$26A2E2` ($07/$27, an alias
// pair).  flow.py TRUE spans SHARE a prologue at `$269B3E` (a fire block both
// branch into): `$269CEA` -> `$269B3E..$269E1C`, `$26A2E2` -> `$269B3E..$26A4B0`.
// These handlers drive position via `$2417DE` applyVelocity (CONSTANT init
// velocity -- they do NOT call `$2638A6` stepMovement), then run the onscreen
// test, the damage branch, and the fire machine.
function damageFirstHandler(ram, rom, a5, ctx, label) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  // $269CEA/$26A2E2 entry: the damage/hit branch FIRST (before movement).
  if ((ram.u8(a6) & 0x5c) !== 0) {                     // moveq #$5c / and.b (A6)
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // move.b #$a3 / and.b
    noteDamage(u, a5, label);                           // jsr $286096 (W28)
    // palette flash from +$2A/+2B (the bucket emitter pair XOR).
    const d0 = ram.u8(a5 + 0x2a) ^ ram.u8(a5 + 0x2b);  // eor.b
    ram.setU8(a6 + S.palette, d0);                      // move.b D0,$1d(A6)
    if ((ram.u16(a6 + S.hp) & 0x8000) !== 0) {         // tst.w $18 / bpl
      noteEffect(u, 0x28615e, a5, 'D0=$8 explosion');  // jsr $28615E
      noteEffect(u, 0x289004, a5, 'D0=$2 death effect'); // jsr $289004
      noteEffect(u, 0x28c2a8, a5, 'death burst');      // jsr $28C2A8
      freeEnemy(ram, a5);                              // jmp $263762
      return;
    }
  } else {
    ram.setU8(a6 + S.palette, ram.u8(a5 + 0x2a));      // move.b $2a(A5),$1d(A6)
  }
  // $269D5A: the onscreen test $242684 -> free if off-screen-after-on-screen.
  if (onScreen242684(ram, a6)) {                       // jsr $242684 / bcc
    if (ram.u16(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; } // jmp $263762
  } else {
    ram.setU16(a5 + R.onScreen, 1);                    // move.b #$1,$16(A5)
  }
  // $269D74: freeze gate, then APPLY VELOCITY (the position driver for this family).
  if (ram.u16(G.freeze) === 0) {                       // tst.w $8130D2 / bne
    applyVelocityBody(ram, tables, a5);                // jsr $2417DE (W24)
  }
  // $269D84.. : the fire/state machine (cooldown +$28, aim $242178, sprite tables,
  // bullet fan $2814AC).  All fire paths note (W26/W27).
  u?.note(0x2417de, `${label} fire/state machine $269D84.. (W26/W27 effects+fans) rec $${a5.toString(16)}`);
}
// applyVelocity is exported by movement.js; re-export through the body for the
// damage-first family (so the call site reads as the listing's `jsr $2417DE`).
function applyVelocityBody(ram, tables, a5) {
  applyVelocity(ram, tables, a5);
}
function handler05(ram, rom, a5, ctx) { damageFirstHandler(ram, rom, a5, ctx, '$05'); }
function handler07(ram, rom, a5, ctx) { damageFirstHandler(ram, rom, a5, ctx, '$07/$27'); }

// ============================================================ TYPE $82 (33)
// `$2747C6`.  A script-mover (stepMovement) that aims with aim256 (`$2422A2`)
// and fires multiple bullet fans (`$281708` x4, `$281764` x2, `$281484`).  flow.py
// TRUE span `$2747C6..$274B64` (932 B, 222 insns -- the largest after $07).
function handler82(ram, rom, a5, ctx) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, tables, u)) return;   // $2747C6 jsr $2638A6
  // $2747CC: onscreen test $242684 -> free if off-screen-after-on-screen.
  if (onScreen242684(ram, a6)) {                       // jsr $242684 / bcc $2747E2
    if (ram.u16(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; } // jmp $263762
  } else {
    ram.setU16(a5 + R.onScreen, 1);                    // move.b #$1,$16(A5)
  }
  // $2747E8: copy position to +$22 (a record scratch for the aim/fire setup).
  ram.setU32(a5 + R.sprite22, ram.u32(a6 + 0x02));     // move.l $2(A6),$22(A6)
  // $2747EE: the damage branch combines (A6) and $20(A6): `(flags | $20(A6)) & $5c`.
  let dmg = (ram.u8(a6) | ram.u8(a6 + 0x20)) & 0x5c;   // move.b (A6)/or.b $20/andi
  if (dmg !== 0) {                                     // bne $274812
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // and.b #$a3,(A6)
    ram.setU8(a6 + 0x20, ram.u8(a6 + 0x20) & 0xa3);    // and.b #$a3,$20(A6)
    noteDamage(u, a5, '$82');                           // jsr $286096 (W28)
    // $274822.. : palette/HP gate -> branches into the fire machine or death.
    // (The HP-reload + death-effect paths note; the position column is settled.)
    u?.note(0x286096, `$82 post-damage HP/palette gate $274822.. (W28) rec $${a5.toString(16)}`);
    return;                                            // (the death arms note + free)
  }
  // $2747FA..$274854: the no-damage fire/state machine.  An HP gate ($18 >= $80)
  // and $8130CA gate select a fire pattern; aim256 + the multiple bullet fans are
  // all noted (W21 log / W26 pool / W27 fire-actions).
  u?.note(0x2747c6, `$82 fire/state machine $2747FA..$274B64 (aim256 $2422A2 + fans `
    + `$281708/$281764/$281484 -- W21/W26/W27) rec $${a5.toString(16)}`);
}

// ============================================================ TYPE $8B (25)
// `$27687E`.  A SCROLL-LOCKED GROUND GUN: it does NOT call stepMovement.  It
// calls `$24179E` scrollCompensate directly (position tracks the cross-axis
// scroll only), then a bounds test, a stage/clock gate, the damage branch, and
// on death spawns effects + `$27F8EE` (W29) + free.  flow.py TRUE span
// `$27687E..$276936` (190 B, 47 insns -- the smallest of the six).
function handler8B(ram, rom, a5, ctx) {
  const { unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  // $27687E: a stage-kill gate.  $8130F8 bit 7 set -> free immediately.
  if ((ram.u8(0x8130f8) & 0x80) !== 0) { freeEnemy(ram, a5); return; } // tst.b $8130F8 / bmi
  // $276886: scroll compensation (the position driver -- NOT stepMovement).
  scrollCompensate(ram, a5);                            // jsr $24179E (W24)
  // $27688C..$2768C2: bounds test.  X += $400 + $8c00; Y += $400 + (scroll-$f800)
  //  + $c000.  Off-screen-after-on-screen -> free.
  const pos = ram.u32(a6 + 0x02);
  let x = u16((pos >>> 16) + 0x400);                   // $27688C/$276890
  let off = i16(x) + 0x8c00 > 0xffff;                  // $276894 addi.w #$8c00
  if (!off) {                                          // $276898 bcs $2768B4
    let sc = u16(ram.u16(G.scroll) - 0xf800);          // $27689A/$2768A0 subi.w
    let y = u16(u16((pos & 0xffff) + 0x400) + sc);     // $2768A4/$2768A8/$2768AC
    off = i16(y) + 0xc000 > 0xffff;                    // $2768AE addi.w #$c000
  }
  if (off) {                                           // $2768B2 bcc $2768C2
    if (ram.u16(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; } // jmp $263762
  } else {
    ram.setU16(a5 + R.onScreen, 1);                    // move.b #$1,$16(A5)
  }
  // $2768C8: stage-1 && clock >= 4 -> set sub-flags bit 5 (a fire-enable).
  if (ram.u16(G.stage) === 1 && i16(ram.u16(G.clock)) >= 4) { // cmpi #$1,$813092
    ram.bset8(a6, 5);                                  // $2768DC bset #5,(A6)
  }
  // $2768E0: the damage/hit branch.  flags & $5c -> clear, HP check -> death.
  if ((ram.u8(a6) & 0x5c) !== 0) {                     // moveq #$5c / and.b (A6)
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // andi.b #$a3,(A6)
    if ((ram.u16(a6 + S.hp) & 0x8000) !== 0) {         // tst.w $18 / bmi $2768F2
      noteEffect(u, 0x28615e, a5, 'D0=$1 explosion');  // jsr $28615E
      noteEffect(u, 0x28c25a, a5, 'death burst');      // jsr $28C25A
      u?.note(0x27f8ee, `$27F8EE $8B death routine (W29) rec $${a5.toString(16)}`);
      noteEffect(u, 0x289004, a5, 'D0=$1 death effect'); // jsr $289004
      freeEnemy(ram, a5);                              // jmp $263762
      return;
    }
    return;                                           // $2768F0 rts (alive after hit)
  }
  // (no damage: the handler rts -- $8B has no per-frame fire in THIS arm; its
  //  fire is gated by the stage/clock bit-5 set above and run elsewhere.)
}

// ============================================================ THE DISPATCH
const HANDLERS = new Map([
  [0x2688cc, handler11],
  [0x268232, handler10],
  [0x269cea, handler05],
  [0x26a2e2, handler07],
  [0x2747c6, handler82],
  [0x27687e, handler8B],
]);

/** Run the handler at `addr` for the enemy record `a5`.  An unknown address is a
 *  LOUD NAMED THROW (never a silence).  `ctx = { tables, unported }`. */
export function runHandler(addr, ram, rom, a5, ctx) {
  const fn = HANDLERS.get(addr & 0xffffff);
  if (!fn) {
    unreached(addr, `enemy handler at $${(addr & 0xffffff).toString(16).toUpperCase()} `
      + `is not in the W25 six-handler table {`
      + [...HANDLERS.keys()].map((a) => `$${a.toString(16).toUpperCase()}`).join(' ')
      + `}. Either a non-stage-1 type was dispatched, or a handler was missed`);
  }
  fn(ram, rom, a5, ctx);
}

/** The map of ported handler addresses -> functions, for the enemy driver. */
export function handlerMap() { return HANDLERS; }
export const HANDLER_ADDRESSES = [...HANDLERS.keys()];
