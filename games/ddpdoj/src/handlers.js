// THE PORTED ENEMY HANDLERS.  NINE addresses for TEN of stage 1's types.
//
//   W25:  `$2688CC` ($11), `$26A2E2` ($07/$27), `$2747C6` ($82),
//         `$269CEA` ($05), `$27687E` ($8B), `$268232` ($10)
//   W30:  `$275914` ($85 AND $86 -- one handler, two types, exactly as $07 and
//         $27 share `$26A2E2`), `$2739C0` ($80), `$276702` ($8A)
//
// The enemy driver `$263502` (src/enemies.js) dispatches each live enemy's
// handler from the function pointer the init stored at record `+$4C`.
//
// **W30's THREE WERE GATE BLOCKERS, in that order.**  W29 wired the enemy
// subsystem into the frame loop and `fly-around` stopped after 345 frames with
// `Unreached $275914`; porting each one moved the block point to the next.  The
// fourth is the MIDBOSS `$26B6FA` (576 instructions) and it is NOT ported --
// `fly-around` is still red because of it, and that is a scoped, named gap
// rather than a mystery.
//
// COVERAGE, as table entries rather than frames, MEASURED this wave by walking
// the stage-1 script `$230C6C..$231703` (339 records of 8 bytes, the type at
// record +$4) and resolving each type through `$267824`/`$27E412`:
//   **9 of the 19 distinct handlers, owning 288 of the 339 spawn records.**
// The other 10 handlers own 51 records and every one of them throws by address.
// W25's headline was 6 handlers / 270 records; W30 adds 3 and 18.
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
//   * the onscreen test `$242684` (ported, self-contained); the fire-gate
//     `$267FC6` is a DEFERRED counted note (W26/W27 firing wave -- the prior
//     "ported, self-contained" claim was false: it invented a $804000 RNG read)
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
import { fire as fireBulletFan, WriteLog } from './bullets.js';
import { AimTables, AIM, aim64, aim256, aim64FromCaller, slew64 } from './aim.js';
import { enqueueRequest, enqueueRegisters, enqueueThroughStub,
  enqueueRegistersThroughStub, EMIT_TABLE } from './spritequeue.js';

/** `addi.l` -- a 32-bit add, where the low half's carry REACHES the high half.
 *  Named because the port also has `addi.w` pairs around a `swap`, which do
 *  not, and confusing the two is a one-character bug in a coordinate. */
const u32 = (v) => (v >>> 0) % 0x100000000;

// ----------------------------------------------------------- record offsets
// A5 = enemy record, A6 = sub-record (= +$6,A5).  Named once so each handler
// reads as the listing does.
const R = {
  onScreen: 0x16, cooldown: 0x18, cooldownReload: 0x19, deathFlag: 0x20,
  sprite22: 0x22, hpReload: 0x26, fireCtr: 0x28,
  facing: 0x33, pal34: 0x34, palCycle: 0x35,
  handler: 0x4c, runLen: 0x04, movement: 0x12, flags: 0x02, classByte: 0x0d,
  // W30, for `$275914`.  The SAME BYTES the names above cover, named again for
  // the type that uses them differently -- `($20,A5)` is `deathFlag` in $10/$11
  // and a SALVO COUNTER in $85, `($22,A5)` is a sprite scratch in $82 and an
  // AIM CADENCE in $85.  One name per meaning, so a reader is never told a byte
  // is a death flag while it is being decremented as a counter.
  rec1C: 0x1c, rec1D: 0x1d, rec1E: 0x1e, rec21: 0x21, rec23: 0x23, rec24: 0x24,
  salvo: 0x20, cadence22: 0x22,
  // W30: the SPRITE-EMITTER pair the init copies out of `$267F70` -- a RECORD-
  // convention stub and a REGISTER-convention one.  They were called
  // `fireAct2A`/`fireAct2E` and labelled as bullet fire-actions; every longword
  // in that table is a member of the `$23D762` enqueue family (see
  // src/spritequeue.js §1c).  Renamed so the mislabel cannot come back.
  emitRec2A: 0x2a, emitReg2E: 0x2e,
};
// sub-record (A6)
const S = {
  flags: 0x00, posX: 0x02, posY: 0x04, hp: 0x18, speed: 0x1a, heading: 0x1b,
  palette: 0x1d, anim: 0x1e, f1f: 0x1f, sprite0a: 0x0a, f10: 0x10, f1c: 0x1c,
  f38: 0x38,   // W30: $275984/$275996 -- the HP FLOOR $275914 clamps against
};
// the globals the handlers read
const G = {
  freeze: 0x8130d2, scroll: 0x813172, rank98: 0x813098, stage: 0x813092,
  clock: 0x8130ce, midbossD8: 0x8130d8, aa: 0x8130aa, ba: 0x8130ba,
  stage96: 0x813096, scrollClockOdo: 0x8130d0,
  mirror: 0x80390b, mirror2: 0x80390c,
  ca: 0x8130ca,   // W30: $275954 -- the gate that picks $85's palette index
};
/** `$27327A` -- type $85/$86's 32-entry longword MUZZLE-VECTOR table, read at
 *  `$275ABC move.l (A4,D0.w),D3`.  Its window is declared by
 *  `tools/export-tables.py`; the extent ($80 bytes) is pinned from the data,
 *  not from the index expression alone -- see the W30 worklog §1.1. */
const MUZZLE_85 = 0x27327a;
/** `$268B1E` -- type $11's muzzle table, read at `$268AF2` with the index
 *  `((($33,A5)+2) & $3C) * 2`, so the ENTRIES ARE 8 BYTES APART and only the
 *  first longword of each is read.  Already inside W20's $268B10 window. */
const MUZZLE_11 = 0x268b1e;
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
// W30 REMOVED `noteFireAction` and `noteFan`.  The first named the RECORD- and
// REGISTER-convention SPRITE EMITTERS at ($2A,A5)/($2E,A5) "indirect
// fire-actions -> the $281xxx bullet fans", which is what they are not; the
// second stood in for a fan that is now called.  Both are wired -- see
// `enqueueThroughStub` (src/spritequeue.js §1c) and `fireFan11` below.

// ----------------------------------------------------------- the fire WIRING
//
// The bullet POOL and the 19 GENERATORS are ported (W21) and the MOVER that
// drives the pool is ported (W26, src/mover.js).  The missing connection is the
// call from a handler's fire point into `fire()`.  `fireBullet` IS that wire:
// it runs a generator with the handler's D0-D5 and spawns into the live pool the
// mover then drives.  It is exported so W27 (the fire-action bodies $23Dxxx) and
// W29 (the frame-loop integration that calls `runHandler` + `runMover` per frame)
// can close the loop without re-deriving the pool context.
//
// WHAT IS AND IS NOT WIRED THIS WAVE.  The six handlers' fire is reached two
// ways, and only ONE is wirable without W27:
//
//   * DIRECT generator calls (re-derived from maincpu.bin this wave):
//       $82 `$2747C6`:  jsr $281708 (x4), jsr $281764 (x2), jsr $281484
//       $05/$07 `$269B3E`: jsr $2814AC
//     These set D0-D5 IN-HANDLER and call the generator straight -- no indirect
//     fire-action.  But each sits inside a fire STATE MACHINE (the $82 machine
//     $2747FA..: HP gate, $8130CA gate, aim256 $2422A2 -> stores the aim byte at
//     +$30/+-$31, THEN the fan).  The fan reads D1 from that stored aim byte, so
//     wiring the fan alone (with a stale/unset aim) would fire every bullet the
//     WRONG WAY.  The aim+gate machine is the W27 FIRING wave, so the direct
//     fans are left as `noteFan` here and `fireBullet` is provided for W27.
//
//   * INDIRECT fire-action `jsr (A0)` through +$2A/+-$2E -> a $23Dxxx routine
//     that sets D0-D5 and calls the $281xxx fan.  The $23Dxxx BODIES are W27
//     (every one is a per-bucket fire-action, ~1.7 KB).  Noted via
//     a counted note; not wirable at that wave.
//
// So: the pool, the generators, the mover and the wire `fireBullet` are all in
// place; the per-handler fire BODIES (aim + gates + $23Dxxx) are the W27 firing
// wave, and the per-frame call of handler+mover together is W29.  Nothing here
// is silently faked: every fire site names its ROM address and its blocker.
/**
 * Wire a generator fire into the live bullet pool.  `regs` is the D0-D5/A5 the
 * handler's fire point set up; `ctx.ram`/`ctx.rom` carry the pool + cartridge.
 * @returns the array of per-core results (slot/declined/dropped), in spawn order.
 */
export function fireBullet(ctx, entry, regs) {
  return fireBulletFan(ctx, entry, regs);
}

// ------------------------------------------ $267FC6: THE FIRE GATE (W30)
// PORTED THIS WAVE, and the deferral it replaces is worth stating: W25b
// demoted this to a counted note after finding the previous body had FABRICATED
// an RNG read at `$804000` that appears nowhere in the routine, and W26/W27
// left it deferred because "a faithful translation would have no faithful
// consumer".  W30 wires handler $11's fan, so it now has one -- and a gate that
// always says "fire" would invent every bullet it lets through.
//
// The whole routine, `$267FC6..$2680A0`, in order:
//   1. `$267FC6 move.w $813096,D0` -- used DIRECTLY AS A BYTE OFFSET into four
//      longword tables, so it steps by 4 and each table is 5 entries
//      ($242562..$2425B1, pinned from both ends: $242560 is the previous
//      routine's `rts`, $2425B2 is `48E7 C080`, code).  Rank ($813098) picks
//      $242576/$24259E for D2 and $242562/$24258A for D3.
//   2. `$268004`: a position-box test on ($2,A6).  `sub.w D2,D1 / swap D2 /
//      add.w D2,D1 / bcs` on the SHORT axis, then `swap D1` and the same with
//      D3 on the LONG axis.  Only the ADD's carry is tested.
//   3. `$268018`: the OCTAGONAL player distance, computed per player and only
//      for a player whose record word has bit 15 set, `$7FFF` otherwise; the
//      minimum of the two is compared against `$2680A2[$813092]`.
//   4. `$26809E cmp.w D4,D0 / rts` -- CARRY SET (do not fire) iff the nearest
//      live player is CLOSER than the stage's threshold.
const FG = {
  stageWord: 0x813096, boxD2: 0x242576, boxD2rank: 0x24259e,
  boxD3: 0x242562, boxD3rank: 0x24258a, thresh: 0x2680a2,
};

/** `$268018..$26804C` -- |dy|*3/4 and |dx|, then max + min/2. */
function octDistance(ram, a6, player) {
  const ty = ram.u16(player), tx = ram.u16(player + 2);   // $268024 movem.w
  let d0 = u16(ram.u16(a6 + 0x02) - ty);                  // $268032 sub.w D2,D0
  if ((d0 & 0x8000) !== 0) d0 = u16(-d0);                 // $268034 bpl / neg.w
  d0 = u16(d0 - (d0 >>> 2));                              // $26803A lsr.w #2 / sub.w
  let d1 = u16(ram.u16(a6 + 0x04) - tx);                  // $26803E sub.w D3,D1
  if ((d1 & 0x8000) !== 0) d1 = u16(-d1);                 // $268040 bpl / neg.w
  if (d0 < d1) { const t = d0; d0 = d1; d1 = t; }         // $268044 cmp/bcc/exg
  return u16(d0 + (d1 >>> 1));                            // $26804A lsr.w #1 / add.w
}

/** @returns {{carry:boolean}} carry SET = DO NOT FIRE. */
function fireGate267FC6(u, ram, rom, a5, a6) {
  void u; void a5;
  const off = ram.u16(FG.stageWord);                      // $267FC6
  const rank = ram.u16(G.rank98) !== 0;                   // $267FD2 / $267FEC
  const d2 = rom.u32((rank ? FG.boxD2rank : FG.boxD2) + off);  // $267FE2
  const d3 = rom.u32((rank ? FG.boxD3rank : FG.boxD3) + off);  // $267FFC
  const pos = ram.u32(a6 + 0x02);                         // $268004 move.l (A0),D1
  // $268006/$26800A -- only the ADD's carry is tested (`sub.w` first, `bcs` last).
  if (u16((pos & 0xffff) - (d2 & 0xffff)) + ((d2 >>> 16) & 0xffff) > 0xffff) {
    return { carry: true };                               // $26800C bcs $267FC4
  }
  if (u16((pos >>> 16) - (d3 & 0xffff)) + ((d3 >>> 16) & 0xffff) > 0xffff) {
    return { carry: true };                               // $268016 bcs $267FC4
  }
  // $268018 / $268050: $7FFF stands in for "that player is not alive", which is
  // why a one-player game does not make every enemy fire at the origin.
  let d4 = 0x7fff;                                        // $268018 move.w #$7fff
  if ((ram.u16(AIM.selP1) & 0x8000) !== 0)                // $26801C tst.w / bpl
    d4 = octDistance(ram, a6, AIM.selP1 + 2);             // $268024 $8103E8
  let d0 = 0x7fff;                                        // $268050
  if ((ram.u16(AIM.selP2) & 0x8000) !== 0)                // $268054 tst.w / bpl
    d0 = octDistance(ram, a6, AIM.selP2 + 2);             // $26805C $81044A
  if (d4 < d0) d0 = d4;                                   // $268086 cmp/bcc/move
  const th = rom.u16(FG.thresh + u16(ram.u16(G.stage) * 2)); // $26808C/$26809C
  return { carry: d0 < th };                              // $26809E cmp.w D4,D0
}

// ----------------------------------------------- $242684: the onscreen test
// `move.l $2(A6),D0 / addi.w #$1c00 / add.w $813172 / addi.w #$9000 / bcs /
//  swap / addi.w #$800 / addi.w #$8000 / rts` -- carry SET = OFF-screen.
function onScreen242684(ram, a6) {
  const pos = ram.u32(a6 + 0x02);                      // $242684 move.l $2(A6)
  let y = u16((pos & 0xffff) + 0x1c00);                // $242688 addi.w #$1c00
  y = u16(y + ram.u16(G.scroll));                      // $24268C add.w $813172
  if (u16(y) + 0x9000 > 0xffff) return true;           // $242696 bcs (Y off)
  let x = u16((pos >>> 16) + 0x800);                   // swap; $24269A addi.w #$800
  return u16(x) + 0x8000 > 0xffff;                     // carry = X off
}

// ---------------------------------------- $2426A4: the OTHER onscreen test
// The same eight instructions as `$242684` on a WIDER short axis, and it is a
// separate routine, not a parameter: `$2426A4` adds `#$1000`/`#$7000` where
// `$242684` adds `#$800`/`#$8000`.  READ PAST THE APPARENT START: its
// early-out `$2426B6 bcs.b $2426A2` branches BACKWARDS to `$242684`'s shared
// `rts`, so the two routines are physically interleaved and a reader who starts
// at `$2426A4` sees a branch to an address inside the routine before it.
//
//   2426A4: move.l $2(A6),D0 / addi.w #$1c00 / add.w $813172 / addi.w #$9000
//   2426B6: bcs $2426A2                       carry -> OFF-screen, return
//   2426B8: swap D0 / addi.w #$1000 / addi.w #$7000 / rts
//
// Returns true if OFF-screen (the 68000 returns that as CARRY SET).
function offScreen2426A4(ram, a6) {
  const pos = ram.u32(a6 + 0x02);                      // $2426A4 move.l $2(A6)
  let y = u16((pos & 0xffff) + 0x1c00);                // $2426A8 addi.w #$1c00
  y = u16(y + ram.u16(G.scroll));                      // $2426AC add.w $813172
  if (u16(y) + 0x9000 > 0xffff) return true;           // $2426B2/$2426B6 bcs
  const x = u16((pos >>> 16) + 0x1000);                // $2426B8 swap / $2426BA
  return u16(x) + 0x7000 > 0xffff;                     // $2426BE addi.w #$7000
}

// ------------------------------------------------- the aim tables, per ROM
// `$275914` calls the aim CORE `$24203E` directly (its target-select is inlined,
// not a `bsr $24270A`), and the core reads five ROM tables.  `AimTables` checks
// two of them against the instruction encodings in its constructor, so building
// it is a real read of the cartridge and must not happen 41 times a frame.  The
// cache is keyed on the ROM OBJECT, so it is a pure derivation of immutable
// input -- NOT per-Game mutable state, which `NOTES-replay.md` §2 forbids.
const AIM_TABLES = new WeakMap();
function aimTables(rom) {
  let t = AIM_TABLES.get(rom);
  if (!t) { t = new AimTables(rom); AIM_TABLES.set(rom, t); }
  return t;
}

// helper: $11-style on-screen bounds test (Y first, then X; the inlined variant
// at $2688D2).  Returns true if OFF-screen.
function bounds11(ram, a6) {
  const pos = ram.u32(a6 + 0x02);                      // $2688D2 move.l $2(A6)
  let y = u16(u16((pos & 0xffff) + 0xe00) + ram.u16(G.scroll)); // +$e00 + scroll
  if (u16(y) + 0xac00 > 0xffff) return true;           // $2688E0 addi.w #$ac00
  const x = u16((pos >>> 16) + 0x600);                 // $2688E8 addi.w #$600
  return u16(x) + 0x8400 > 0xffff;                     // $2688EC addi.w #$8400
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
  // $26889E btst #0,$815EA5 -> beq skips $289AF4 when bit 0 is CLEAR, so $289AF4
  // is called only when the cap bit is SET (W25b F6 -- the note was unconditional
  // before; the cap test + spawn are W26-owned, the gating is faithful now).
  if ((ram.u8(0x815ea5) & 1) !== 0)                    // $26889E btst #0,$815EA5 (set -> call)
    noteEffect(u, 0x289af4, a5, 'D0=$4 secondary');    // $2688BA (ea5 bit 0 SET)
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
  // ------------------------------------------------------------- W30.
  // $2689C2 `movea.l ($2A,A5),A0 / jsr (A0)` -- THE RECORD-CONVENTION SPRITE
  // EMITTER, not a fire-action.  ($2A,A5) and ($2E,A5) are the pair the init
  // copied out of `$267F70` (src/initbody.js `$268796`), and every longword in
  // that table is a member of the `$23D762` enqueue family.  Calling them
  // "indirect fire-actions -> the $281xxx bullet fans" -- as this file did
  // until W30 -- counted the enemies' DRAW as their FIRE.
  enqueueThroughStub(ram, rom, ram.u32(a5 + R.emitRec2A), a6);   // $2689C6
  if ((ram.u8(a5 + R.deathFlag) & 0x80) !== 0) {       // $2689C8 tst.b $20 / bmi
    if (ram.u16(G.mirror2) === 0) return;              // $2689CE tst.w / beq $268A0C
    // $2689D6..$268A08: the DEATH-ANIMATION emitter.  D1 = the position plus a
    // LONG bias ($2689DA `addi.l #$100fe00,D1` -- one 32-bit add, so the low
    // half's carry reaches the high half), and D2 walks a frame counter kept in
    // ($1E,A5) that steps by $24 and WRAPS AT $90 -- a write the port did not
    // make before this wave.
    const d1 = u32(ram.u32(a6 + 0x02) + 0x0100fe00);   // $2689D6/$2689DA
    let d2 = ram.u16(a5 + R.rec1E);                    // $2689E2 move.w ($1E,A5),D2
    d2 = u16(d2 + 0x24);                               // $2689E6 addi.w #$24
    if (d2 === 0x90) d2 = 0;                           // $2689EA cmpi.w #$90 / bne
    ram.setU16(a5 + R.rec1E, d2);                      // $2689F2 move.w D2,($1E,A5)
    enqueueRegistersThroughStub(ram, rom, ram.u32(a5 + R.emitReg2E),
      d1, u32(d2 + 0x22c59c), 0x410, 0x1e);            // $2689F6/$2689FC/$268A00/$268A08
    return;                                            // $268A08 jmp (A0)
  }
  if (ram.u16(G.freeze) !== 0) { draw11(ram, rom, a5, a6); return; } // $268A0E
  // $268A16 `move.b ($33,A5),D1` -- loaded, then overwritten by the aim below
  // and never read on the no-aim path.  Transcribed as a comment, not as code.
  // $268A1A: the aim CADENCE.  `bcc` is "no borrow", so the aim runs only on
  // the frame the byte was already 0.
  const cad = ram.u8(a5 + R.cooldown);                 // $268A1A subq.b #1,($18,A5)
  ram.setU8(a5 + R.cooldown, (cad - 1) & 0xff);
  if (cad === 0) {                                     // $268A1E bcc $268A5A
    ram.setU8(a5 + R.cooldown, ram.u8(a5 + R.cooldownReload)); // $268A20 reload
    const selfY = ram.u16(a6 + 0x02), selfX = ram.u16(a6 + 0x04); // $268A26 movem.w
    // $268A2C addi.w #$200,D0 -- THE MUZZLE OFFSET, long axis only.
    const r = aim64FromCaller(aimTables(rom), ram, a5, u16(selfY + 0x200), selfX);
    if (r.carry) { draw11(ram, rom, a5, a6); return; } // $268A36 bcs $268A68
    const nf = slew64(ram.u8(a5 + R.facing), r.dir);   // $268A38/$268A3C jsr $242190
    ram.setU8(a5 + R.facing, nf);                      // $268A42 move.b D1,($33,A5)
    // $268A46 addq.b #1,D1 / andi.w #$3E,D1 / add.w D1,D1 -- 32 entries, stride 4.
    ram.setU32(a5 + R.sprite22,                        // $268A54 move.l (A0,D1.w)
      rom.u32(SPRITE_TAB.h11_fire + (((nf + 1) & 0x3e) * 2)));
  }
  // $268A5A: the FAN counter (+$28), behind the sub-record's bit-5 flag.
  if ((ram.u8(a6) & 0x20) === 0) { draw11(ram, rom, a5, a6); return; } // btst #5 / beq
  const c = (ram.u8(a5 + R.fireCtr) - 1) & 0xff;       // $268A62 subq.b #1,($28,A5)
  ram.setU8(a5 + R.fireCtr, c);
  if (c !== 0) { draw11(ram, rom, a5, a6); return; }    // $268A66 beq $268A86
  fireFan11(ram, rom, a5, a6, ctx);                    // $268A86
}

// $268A68: THE COMMON DRAW.  Every arm of $11's fire machine falls into it, and
// it is the REGISTER-convention emitter through ($2E,A5).  `addi.l #$fc00fc00`
// is ONE 32-bit add -- the two halves are not independent.
function draw11(ram, rom, a5, a6) {
  const d1 = u32(ram.u32(a6 + 0x02) + 0xfc00fc00);     // $268A68/$268A6C
  enqueueRegistersThroughStub(ram, rom, ram.u32(a5 + R.emitReg2E), d1,
    ram.u32(a5 + R.sprite22),                          // $268A72 move.l ($22,A5),D2
    0x620,                                             // $268A76 move.w #$620,D3
    ram.u16(a6 + S.f1c));                              // $268A7A move.w ($1C,A6),D4
}

// $268A86..$268B1A: THE KIND-$D FAN -- W30 WIRES IT.  This is the fire W29 §5.1
// specified and did not do, and it is the highest-volume one in the stage: type
// $11 is 104 of stage 1's 339 spawn records.
function fireFan11(ram, rom, a5, a6, ctx) {
  const u = ctx.unported;
  let d0 = u16(u16(0xa0 - ram.u16(G.aa)) + 4);         // $268A86/$268A8A/$268A90
  // $268A92/$268A9C/$268AA6 -- `bcs` on `cmpi.w #$159,$8130CE` is UNSIGNED.
  if (ram.u16(G.rank98) === 0 && ram.u16(G.stage) === 1
      && ram.u16(G.clock) >= 0x159) {
    d0 = u16(u16(0x30 - ram.u16(G.ba)) - 6);           // $268AB0/$268AB2/$268AB8
  }
  ram.setU8(a5 + R.fireCtr, d0 & 0xff);                // $268ABA move.b D0,($28,A5)
  if (fireGate267FC6(u, ram, rom, a5, a6).carry) {     // $268ABE jsr / $268AC2 bcs
    draw11(ram, rom, a5, a6); return;
  }
  if (ram.u16(G.stage) === 1 && ram.u16(G.midbossD8) !== 0) { // $268AC4/$268AD0/$268AD6
    draw11(ram, rom, a5, a6); return;
  }
  if ((ram.u8(a6) & 0x20) === 0) { draw11(ram, rom, a5, a6); return; } // $268AD8 btst #5
  // $268ADE..$268B14 -- the four registers, all computed here.
  // D1: `move.b ($33,A5),D1 / addq.b #$2,D1 / andi.w #$3C,D1`.  The `addq` is
  // BYTE-wide and the mask WORD-wide, so it is (facing + 2) & $FF & $3C.
  const d1 = ((ram.u8(a5 + R.facing) + 2) & 0xff) & 0x3c;   // $268ADE/$268AE2/$268AE4
  // D2: the $268B1E muzzle table.  `move.w D1,D2 / add.w D2,D2` is a *2 on an
  // index that is already a multiple of 4, so the ENTRIES ARE 8 BYTES APART and
  // only the first longword of each is read -- byte offsets 0,8,..,$78.
  const d2 = u32(rom.u32(MUZZLE_11 + u16(d1 * 2)) + ram.u32(a6 + 0x02)); // $268AF2/$268AF6
  // D0: kind $D.  `cmpi.w #$3,$813092 / bcs` is UNSIGNED, so stages 0..2 keep
  // the bare `moveq #$D` (speed bias 0) and 3+ take the $FFFC bias.
  const d0f = ram.u16(G.stage) < 3 ? 0x0000000d : 0xfffc000d;  // $268AFA/$268AFC/$268B08
  const regs = { d0: d0f, d1, d2, d3: 0x02000000, d4: 0, d5: 0, a5 }; // $268B0E
  const res = fireBullet({ ram, rom, log: new WriteLog(ram) }, 0x281402, regs); // $268B14
  ctx.bulletSpawn?.(0x268b14, res);
  draw11(ram, rom, a5, a6);                            // $268B1A bra $268A68
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
  let off = u16(y) + 0xa400 > 0xffff;                  // $268246 addi.w #$a400
  if (!off) {                                          // $26824A bcs $268268
    let x = u16((pos >>> 16));                         // $26824C swap
    if (ram.u8(a5 + 0x32) !== 0 && i16(x) < 0x7600) {  // $26824E/$268254
      ram.setU8(a5 + 0x32, 0);                         // $26825A clr.b $32(A5)
    }
    x = u16(x + 0xa00);                                // $26825E addi.w #$a00
    off = u16(x) + 0x7c00 > 0xffff;                    // $268262 addi.w #$7c00
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
// Unlike $11's death seq, the $289AF4 here ($26821E) is UNCONDITIONAL in the ROM
// (no preceding btst in $2681CE..$26822A), so the note is not gated (W25b F6).
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
  // $2747E8: copy position to the SUB-RECORD's +$22.
  // W30 FIX.  This line read `a5 + R.sprite22` while its own comment said
  // `$22(A6)`.  `$2747E8` is `2D6E 0002 0022`: bits 11..9 = `110` and the
  // destination mode is `101`, so BOTH operands are `(d16,A6)`.  The port was
  // writing the position into the wrong record and never into the right one.
  // Found by reading `$275936`, the identical instruction in `$275914` (W30).
  ram.setU32(a6 + R.sprite22, ram.u32(a6 + 0x02));     // move.l $2(A6),$22(A6)
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
  let off = u16(x) + 0x8c00 > 0xffff;                  // $276894 addi.w #$8c00
  if (!off) {                                          // $276898 bcs $2768B4
    let sc = u16(ram.u16(G.scroll) - 0xf800);          // $27689A/$2768A0 subi.w
    let y = u16(u16((pos & 0xffff) + 0x400) + sc);     // $2768A4/$2768A8/$2768AC
    off = u16(y) + 0xc000 > 0xffff;                    // $2768AE addi.w #$c000
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

// ================================================= TYPES $85 AND $86 (W30)
// `$275914`.  THE HANDLER THAT BLOCKED THE GATE: W29 wired the enemy subsystem
// into the frame loop and `fly-around` stopped at logic frame 2346 with
// `Unreached $275914`, which is why this wave exists.
//
// **TWO TYPES SHARE IT**, read out of the type table (`$27E412 + (t-$80)*8`):
// `$85` (init `$275812`, body `$27581A`, W23) and `$86` (init `$275BAE`, body
// `$275BB6`, NOT in W23's 21 because stage 1's script has no `$86` record).
// The handler branches on which at `$275AFC cmpi.b #$86,($C,A5)` in its death
// arm, so the distinction is transcribed rather than folded away.
//
// **THE SPAN IS `$275914..$275BAA` AND CONTROL FLOW DECIDES IT.**  `$275BA6 jmp
// $263762` ends the death arm, `$275BAC` is a `nop` pad, and `$275BAE` is type
// `$86`'s init stub falling through into its init body -- a different routine
// that a linear sweep prints as though it belonged to this one.
//
// WHAT MAKES THIS HANDLER DIFFERENT FROM THE OTHER SIX: it is the first ported
// handler that **emits sprites** (`$23D852`/`$23DF86` into bucket 7 and
// `$23DF58` into bucket 3, all three through W11's enqueue API) and the first
// that **fires a bullet in the live path** (`$275AD0 jsr $2813F0`), because all
// four of that generator's register arguments are computed inside the handler
// -- no `$23Dxxx` fire-action, no separate aim state machine.
function handler85(ram, rom, a5, ctx) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, tables, u)) return;   // $275914 jsr $2638A6
  // $27591A jsr $2426A4 / $275920 bcc $275930 -- carry SET is off-screen.
  if (offScreen2426A4(ram, a6)) {
    // $275922 tst.b ($16,A5) / beq $275936.  A BYTE test, unlike $11's word.
    if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; } // $275928 jmp $263762
  } else {
    ram.setU8(a5 + R.onScreen, 1);                     // $275930 move.b #$1,($16,A5)
  }
  // $275936 move.l ($2,A6),($22,A6) -- BOTH operands are A6 (see handler82's
  // fix above: this is the instruction that exposed it).
  ram.setU32(a6 + R.sprite22, ram.u32(a6 + 0x02));
  // $27593C: the damage test combines (A6) and ($20,A6), like type $82's.
  const dmg = (ram.u8(a6) | ram.u8(a6 + 0x20)) & 0x5c; // move.b (A6)/or.b $20/andi.w #$5c
  let d0;
  if (dmg === 0) {                                     // $275946 bne $275960
    d0 = ram.u8(a5 + R.rec1C);                         // $275948 move.b ($1C,A5),D0
    // $27594C cmpi.w #$1c0,($18,A6) / bcc $2759A2 -- an UNSIGNED HP compare, so
    // a "negative" (dead) HP is >= $1C0 and takes this arm too.
    if (ram.u16(a6 + S.hp) < 0x1c0                     // $275952 bcc
        && ram.u16(G.ca) === 0) {                      // $275954 tst.w $8130CA / bne
      d0 = 0x19;                                       // $27595C moveq #$19,D0
    }
  } else {
    // ---- $275960: the damage arm.
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // $275964 and.b D0,(A6)  (D0=$A3)
    ram.setU8(a6 + 0x20, ram.u8(a6 + 0x20) & 0xa3);    // $275966 and.b D0,($20,A6)
    noteDamage(u, a5, '$85');                           // $27596A jsr $286096 (W28)
    d0 = ram.u8(a6 + S.palette);                       // $275970 move.b ($1D,A6),D0
    if (d0 === 0x19) d0 = ram.u8(a5 + R.rec1C);        // $275974 cmpi.b #$19 / $27597A
    d0 = (d0 ^ ram.u8(a5 + R.rec1D)) & 0xff;           // $27597E/$275982 eor.b D2,D0
    // $275984..$275996: D4 = min(($18,A6), ($38,A6)) SIGNED, written to both.
    let d4 = ram.u16(a6 + S.hp);                       // $275984 move.w ($18,A6),D4
    if (i16(d4) > i16(ram.u16(a6 + S.f38)))            // $275988 cmp.w ($38,A6),D4 / ble
      d4 = ram.u16(a6 + S.f38);                        // $27598E
    ram.setU16(a6 + S.hp, d4);                         // $275992
    ram.setU16(a6 + S.f38, d4);                        // $275996
    if ((ram.u16(a6 + S.hp) & 0x8000) !== 0) {         // $27599A tst.w / $27599E bmi
      deathSeq85(ram, rom, a5, a6, ctx);               // $275AF2
      return;
    }
  }
  // ---- $2759A2: the common tail.
  ram.setU8(a6 + S.palette, d0);                       // $2759A2 move.b D0,($1D,A6)
  // $2759A6 jsr $28AC72 -- the SUB-RECORD SPAWN ENGINE.  It walks a script
  // pointer at ($44,A5) and, each time HP ($18,A6) drops past the next
  // threshold word, allocates out of the ten-slot pool at $81DB90 (stride $26,
  // counted at $81DD0C) and installs a part.  That pool's driver is type-5
  // call #3 ($28AD54), also unported.  Its return value is DEAD here -- the
  // next instruction is `tst.l $8130D2` -- so skipping it costs the sub-record
  // spawns and the advance of ($44,A5), and NOTHING in this handler's own
  // control flow.  Counted, never silent.
  u?.note(0x28ac72, `$28AC72 sub-record spawn engine ($81DB90 pool, cue script `
    + `at ($44,A5), driver $28AD54) in $85 rec $${a5.toString(16)} -- its result `
    + `is unused by $2759AC; the spawns and the ($44,A5) advance are the gap`);
  // $2759AC tst.l $8130D2 -- a LONG test, so it covers $8130D2 AND $8130D4.
  if (ram.u32(G.freeze) === 0) {                       // $2759B2 bne $275A24
    // $2759B6 subq.b #1,($22,A5) / bcc $275A24 -- the aim CADENCE.  `bcc` is
    // "no borrow", so the aim runs only on the frame the byte was already 0.
    const cad = ram.u8(a5 + R.cadence22);
    ram.setU8(a5 + R.cadence22, (cad - 1) & 0xff);
    if (cad === 0) {                                   // $2759BA bcc $275A24
      ram.setU8(a5 + R.cadence22, ram.u8(a5 + R.rec23)); // $2759BE reload from +$23
      // $2759C4 move.b ($20,A5),D0 / cmp.b ($21,A5),D0 / bne $275A24
      if (ram.u8(a5 + R.salvo) === ram.u8(a5 + R.rec21)) {
        aim85(ram, rom, a5, a6);                       // $2759D0..$275A1E
      }
    }
  }
  // ---- $275A24: THE DRAW.  Three sprite requests, all through W11's API.
  // $275A24 jsr $23D852 -- the per-record stub on BUCKET 7 ($807450/$80AFC8),
  // reading the sub-record's own seven fields.
  enqueueRequest(ram, 7, a6);
  // $275A2A..$275A46: the second request, REGISTER convention, also bucket 7.
  // D1 = the position with a muzzle bias on each axis; the low word is the
  // SHORT axis and the high word the LONG one (src/spritequeue.js §the spec),
  // and the two `addi.w`s straddle a `swap`, so neither may carry into the
  // other half.
  const pos = ram.u32(a6 + 0x02);                      // $275A2A move.l ($2,A6),D1
  const d1a = ((u16((pos >>> 16) + 0xf300) << 16)      // $275A34 addi.w #$f300 (long)
    | u16((pos & 0xffff) + 0xfc00)) >>> 0;             // $275A2E addi.w #$fc00 (short)
  enqueueRegisters(ram, 7, d1a,
    ram.u32(a5 + R.rec24),                             // $275A3A move.l ($24,A5),D2
    0x620,                                             // $275A3E move.w #$620,D3
    ram.u16(a6 + S.f1c));                              // $275A42 move.w ($1C,A6),D4
  // $275A4C..$275A64: three gates before the THIRD request.  All three are
  // "skip it": rank non-zero, the $80390C alternation word zero, or stage 2.
  if (ram.u16(G.rank98) === 0                          // $275A4C tst.w $813098 / bne
      && ram.u16(G.mirror2) !== 0                      // $275A54 tst.w $80390C / beq
      && ram.u16(G.stage) !== 2) {                     // $275A5C cmpi.w #$2,$813092 / beq
    const d1b = ((u16((pos >>> 16) + 0xe400) << 16)    // $275A70 addi.w #$e400
      | u16((pos & 0xffff) + 0x400)) >>> 0;            // $275A6A addi.w #$400
    // $275A84 jsr $23DF58 -- BUCKET 3 ($80688C/$80AFC6).  D2 is the LITERAL
    // sprite-descriptor address $192A48 ($275A76 move.l #$192a48,D2), not a
    // table read, so nothing is fetched from a window here.
    enqueueRegisters(ram, 3, d1b, 0x192a48, 0x820, 0x18);
  }
  // ---- $275A8A: the FIRE cadence.
  if (ram.u32(G.freeze) !== 0) return;                 // $275A8A tst.l / $275A90 bne
  if (i16(ram.u16(a6 + 0x02)) < 0x1000) return;        // $275A92 cmpi.w #$1000 / blt
  const fc = ram.u8(a5 + R.rec1E);                     // $275A9A subq.b #1,($1E,A5)
  ram.setU8(a5 + R.rec1E, (fc - 1) & 0xff);
  if (fc !== 0) return;                                // $275A9E bcs $275AA2 (borrow only)
  fire85(ram, rom, a5, a6, ctx);                       // $275AA2
}

// ---- $2759D0..$275A1E: the INLINED target select + aim + slew ------------
// The ROM does NOT `bsr $24270A` here; it writes the two player-record
// addresses out longhand.  It is the same routine (`src/aim.js`
// `targetSelectBy`), and it is transcribed inline rather than delegated so that
// a reader checking `$2759D0` against this file sees the same four tests.
function aim85(ram, rom, a5, a6) {
  let p0 = AIM.selP1, p1 = AIM.selP2;                  // $2759D0 lea / $2759D6 lea
  if (ram.u8(a5 + 0x03) !== 0) { p0 = AIM.selP2; p1 = AIM.selP1; } // $2759DC/$2759E2 exg
  if ((ram.u16(p0) & 0x8000) === 0) {                  // $2759E4 tst.w (A0) / bmi
    if ((ram.u16(p1) & 0x8000) === 0) return;          // $2759E8 tst.w (A1) / bpl $275A24
    const t = p0; p0 = p1; p1 = t;                     // $2759EC exg A0,A1
  }
  const tgtY = ram.u16(p0 + 2);                        // $2759EE movem.w ($2,A0),D2-D3
  const tgtX = ram.u16(p0 + 4);
  const selfY = ram.u16(a6 + 0x02);                    // $2759F4 movem.w ($2,A6),D0-D1
  const selfX = ram.u16(a6 + 0x04);
  // $2759FA addi.w #$f900,D0 -- THE MUZZLE OFFSET, on the long axis only.
  const dir = aim64(aimTables(rom), u16(selfY + 0xf900), selfX, tgtY, tgtX); // $2759FE
  const nf = slew64(ram.u16(a5 + R.fireCtr), dir);     // $275A04/$275A08 jsr $242190
  ram.setU16(a5 + R.fireCtr, nf);                      // $275A0E move.w D1,($28,A5)
  // $275A12 andi.w #$3E,D1 / add.w D1,D1 -- 32 entries at a 4-byte stride.
  ram.setU32(a5 + R.rec24, rom.u32(0x272DFA + ((nf & 0x3e) * 2))); // $275A18/$275A1E
}

// ---- $275AA2..$275AF0: THE FIRE ------------------------------------------
// The first handler fire wired into the live path.  Every register the
// generator reads is computed here; there is no `$23Dxxx` fire-action and no
// stored aim byte, which is exactly why this one is wirable and $11's is a
// separate piece of work.
function fire85(ram, rom, a5, a6, ctx) {
  ram.setU8(a5 + R.rec1E, 6);                          // $275AA2 move.w #$6,D0 / $275AA6
  const facing = ram.u16(a5 + R.fireCtr);              // $275AB0 move.w ($28,A5),D1
  // $275AB4 move.w D1,D0 / andi.w #$3E,D0 / add.w D0,D0 -- 32 longwords.
  const idx = u16((facing & 0x3e) * 2);
  // $275ABC move.l (A4,D0.w),D3 / $275AC0 addi.l #$f9000000,D3.  The `addi.l`
  // is on the WHOLE longword, so the carry out of the low half reaches the
  // high half -- write it as a 32-bit add, not two 16-bit ones.
  const d3 = ((rom.u32(MUZZLE_85 + idx) + 0xf9000000) >>> 0);
  const regs = {
    d0: 0xffff000d,                                    // $275AC6 move.l #$ffff000d,D0
    d1: facing, d2: ram.u32(a6 + 0x02) >>> 0,          // $275ACC move.l ($2,A6),D2
    d3, d4: 0, d5: 0, a5,
  };
  // $275AD0 jsr $2813F0.  Kind $D; `$2815C6[13]` is `$2818AC` (the do-nothing
  // epilogue) and template `$281AF8`'s +$10 run-init word is $0000, so D4/D5
  // are never read and passing 0 is not a guess.
  const res = fireBullet({ ram, rom, log: new WriteLog(ram) }, 0x2813f0, regs);
  ctx.bulletSpawn?.(0x275ad0, res);
  // $275AD6 subq.b #1,($20,A5) / bcc $275AF0 -- the SALVO counter.  On the
  // frame it borrows, ($1E,A5) is reloaded with $50 - $8130BA instead of the
  // 6 written at $275AA6, i.e. a long gap between salvos and a short one
  // inside them.
  const salvo = ram.u8(a5 + R.salvo);                  // ($20,A5)
  ram.setU8(a5 + R.salvo, (salvo - 1) & 0xff);
  if (salvo !== 0) return;                             // $275ADA bcc $275AF0
  ram.setU8(a5 + R.salvo, ram.u8(a5 + R.rec21));       // $275ADC move.b ($21,A5),($20,A5)
  ram.setU8(a5 + R.rec1E, u16(0x50 - ram.u16(G.ba)) & 0xff); // $275AE2/$275AE6/$275AEC
}

// ---- $275AF2..$275BA6: the DEATH sequence --------------------------------
// Six unported subsystem calls and a free.  The `$27E812` D0 arithmetic IS
// transcribed even though `$27E812` itself is a note, because it decides
// whether the routine is called ONCE or TWICE -- that is this handler's own
// control flow, not the callee's.
function deathSeq85(ram, rom, a5, a6, ctx) {
  const u = ctx.unported;
  noteEffect(u, 0x28615e, a5, 'D0=$25 explosion');     // $275AF2/$275AF4
  // $275AFA moveq #$0,D0 / $275AFC cmpi.b #$86,($C,A5) / $275B04 moveq #$8,D0
  let d0 = ram.u8(a5 + 0x0c) === 0x86 ? 8 : 0;
  u?.note(0x27e812, `$27E812 pool spawn (D0=$${d0.toString(16)}) in $85/$86 death `
    + `rec $${a5.toString(16)} -- the $816B7A pool, driven by type-5 call #18 `
    + `$27E99E, also unported`);                       // $275B06 jsr $27E812
  // $275B0C tst.w $81308C / bne $275B20 ; $275B14 cmpi.w #$8,D0 / beq $275B20
  if (ram.u16(0x81308c) === 0 && d0 !== 8) {
    u?.note(0x27e812, `$27E812 SECOND pool spawn (D0=$${d0.toString(16)}) in `
      + `$85 death rec $${a5.toString(16)} -- two-player path ($81308C == 0)`);
  }                                                    // $275B1A jsr $27E812
  // $275B20/$275B4C/$275B72: three effect allocations, each followed by field
  // writes into the record `$289004` would have returned in A0.  The writes are
  // part of the noted gap, not a separate one.
  noteEffect(u, 0x289004, a5, 'D0=$5 death effect');   // $275B22
  noteEffect(u, 0x289004, a5, 'D0=$C death effect');   // $275B4E
  noteEffect(u, 0x289004, a5, 'D0=$84 death effect');  // $275B76
  noteEffect(u, 0x28c274, a5, 'death burst');          // $275BA0 jsr $28C274
  freeEnemy(ram, a5);                                  // $275BA6 jmp $263762
}

// ================================================= TYPE $80 (W30) =========
// `$2739C0`, span `$2739C0..$273F02` -- `$273EFE jmp $263762` ends the death
// arm, `$273F04` is a `nop` pad and `$273F06` is type $81's init stub.  310
// instructions, the second-largest stage-1 body after the midboss, and the
// second gate blocker: with `$275914` ported, `fly-around` stopped here at
// logic frame 2634.
//
// It is the type $85 skeleton with four things bolted on, and every one of them
// resolves to code this project already has:
//   * a SHIELD timer on `($36,A5)` that pins HP at `$7FFF` until it expires;
//   * a big aim256 fan -- `$2422A2` then EIGHT `$2817B8` spawns off `$2735FA`,
//     or SEVEN `$2817A8` off `$2736FA`, chosen by stage and `($20,A5)`;
//   * TWO independent turrets, alternated frame by frame by
//     `$273C3A bchg #$6,($1,A6)`, each with its own facing word
//     (`($2C,A5)` / `($32,A5)`) and its own sprite pointer;
//   * two more `$281484` fires off the 32-entry muzzle table `$27347A`.
// Four sprite requests, all through W11's enqueue API.
function handler80(ram, rom, a5, ctx) {
  const { tables, unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  if (stepMovement(ram, rom, a5, tables, u)) return;   // $2739C0 jsr $2638A6
  // $2739C6..$2739E4: bounds.  Y += $1800 + scroll + $9800; X += $1400 + $7400.
  const p0 = ram.u32(a6 + 0x02);
  let off = u16(u16((p0 & 0xffff) + 0x1800) + ram.u16(G.scroll)) + 0x9800 > 0xffff;
  if (!off) off = u16((p0 >>> 16) + 0x1400) + 0x7400 > 0xffff;   // $2739DC/$2739E0
  if (off) {                                           // $2739E4 bcc $2739F4
    if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; } // $2739EC
  } else {
    ram.setU8(a5 + R.onScreen, 1);                     // $2739F4
  }
  ram.setU32(a6 + R.sprite22, ram.u32(a6 + 0x02));     // $2739FA (BOTH A6)
  // $273A00: THE SHIELD.  While `($36,A5)` is non-negative the HP pair is held
  // at $7FFF -- invulnerable -- and the counter is decremented by 1, or by 2
  // while `$811F72` is set.  On the BORROW the HP pair drops to $1400 and the
  // enemy becomes killable.  `sub.w` then `bcc`, so the borrow is the event.
  if ((ram.u16(a5 + 0x36) & 0x8000) === 0) {           // $273A00 tst.w / bmi
    ram.setU16(a6 + S.hp, 0x7fff);                     // $273A08/$273A0C
    ram.setU16(a6 + S.f38, 0x7fff);                    // $273A10
    const step = ram.u16(0x811f72) !== 0 ? 2 : 1;      // $273A14/$273A18/$273A22
    const cur = ram.u16(a5 + 0x36);
    ram.setU16(a5 + 0x36, u16(cur - step));            // $273A26 sub.w D0,($36,A5)
    if (cur < step) {                                  // $273A2A bcc $273A3A
      ram.setU16(a6 + S.hp, 0x1400);                   // $273A2E/$273A32
      ram.setU16(a6 + S.f38, 0x1400);                  // $273A36
    }
  }
  // $273A3A: the damage branch -- $275914's, with $255 where $85 has $1C0.
  const dmg = (ram.u8(a6) | ram.u8(a6 + 0x20)) & 0x5c; // $273A3A/$273A3C/$273A40
  let d0;
  if (dmg === 0) {                                     // $273A44 bne $273A5E
    d0 = ram.u8(a5 + R.rec1C);                         // $273A46
    if (ram.u16(a6 + S.hp) < 0x255                     // $273A4A cmpi.w / bcc
        && ram.u16(G.ca) === 0) d0 = 0x19;             // $273A52 tst.w / $273A5A
  } else {
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // $273A62
    ram.setU8(a6 + 0x20, ram.u8(a6 + 0x20) & 0xa3);    // $273A64
    noteDamage(u, a5, '$80');                           // $273A68 jsr $286096
    d0 = ram.u8(a6 + S.palette);                       // $273A6E
    if (d0 === 0x19) d0 = ram.u8(a5 + R.rec1C);        // $273A72/$273A78
    d0 = (d0 ^ ram.u8(a5 + R.rec1D)) & 0xff;           // $273A7C/$273A80
    let d4 = ram.u16(a6 + S.hp);                       // $273A82
    if (i16(d4) > i16(ram.u16(a6 + S.f38))) d4 = ram.u16(a6 + S.f38); // $273A86/$273A8C
    ram.setU16(a6 + S.hp, d4);                         // $273A90
    ram.setU16(a6 + S.f38, d4);                        // $273A94
    if ((ram.u16(a6 + S.hp) & 0x8000) !== 0) {         // $273A98 tst.w / $273A9C bmi
      deathSeq80(ram, a5, ctx); return;                // $273DAE
    }
  }
  ram.setU8(a6 + S.palette, d0);                       // $273AA0
  u?.note(0x28ac72, '$28AC72 sub-record spawn engine in $80 rec $'
    + a5.toString(16) + ' -- see the $85 note; its result is unused by $273AAA');
  // $273AAA tst.l $8130D2 / bne $273C94 -- a freeze skips the fire AND both
  // turret aims and goes straight to the draw.
  if (ram.u32(G.freeze) === 0) {
    // $273AB4/$273ABC/$273AC6: three gates in front of the big fan.  ($18,A5)
    // is a WORD here (it is a BYTE cadence in type $11) -- non-zero means the
    // salvo has already been fired and the LASER tail owns the record.
    if (ram.u16(a5 + 0x18) === 0                       // $273AB4 tst.w / bne
        && i16(ram.u16(a6 + 0x02)) >= 0x1000) {        // $273ABC cmpi.w / blt
      const c = ram.u8(a5 + R.rec1E);                  // $273AC6 subq.b #1,($1E,A5)
      ram.setU8(a5 + R.rec1E, (c - 1) & 0xff);
      if (c === 0) {                                   // $273ACA bcc $273BEE
        ram.setU8(a5 + R.rec1E, ram.u8(a5 + 0x34));    // $273ACE reload from +$34
        fan80(ram, rom, a5, a6, ctx);                  // $273AD4..$273BCA
        // $273BCE: the SALVO counter, reachable only after the fan block.
        const sal = ram.u8(a5 + R.salvo);              // $273BCE subq.b #1,($20,A5)
        ram.setU8(a5 + R.salvo, (sal - 1) & 0xff);
        if (sal === 0) {                               // $273BD2 bcc $273BEE
          ram.setU8(a5 + R.salvo, ram.u8(a5 + R.rec21)); // $273BD4
          ram.setU8(a5 + R.rec1E, u16(0x50 - ram.u16(G.b8)) & 0xff); // $273BDA/$273BE4
          ram.setU16(a5 + 0x18, 1);                    // $273BE8 move.w #$1,($18,A5)
        }
      }
    }
    // $273BEE: the TURRET cadence, on ($26,A5) with reload ($27,A5).
    const t = ram.u8(a5 + 0x26);                       // $273BEE subq.b #1
    ram.setU8(a5 + 0x26, (t - 1) & 0xff);
    if (t === 0) {                                     // $273BF2 bcc $273C94
      ram.setU8(a5 + 0x26, ram.u8(a5 + 0x27));         // $273BF6
      if (ram.u8(a5 + 0x24) === ram.u8(a5 + 0x25))     // $273BFC/$273C00 bne
        turrets80(ram, rom, a5, a6);                   // $273C08..$273C8E
    }
  }
  // $273C94: FOUR sprite requests.
  enqueueRequest(ram, 7, a6);                          // $273C94 jsr $23D852
  const pos = ram.u32(a6 + 0x02);                      // $273C9A move.l ($2,A6),D1
  // $273C9E addi.w #$0 (the short axis is unbiased) / swap / $273CA4 addi.w #$80.
  const longA = u16((pos >>> 16) + 0x80);
  enqueueRegisters(ram, 7, ((longA << 16) | (pos & 0xffff)) >>> 0,
    ram.u32(a5 + 0x28), 0x628, ram.u16(a6 + S.f1c));   // $273CAA/$273CAE/$273CB2/$273CB6
  // $273CBC `move.w ($4,A6),D1` REPLACES ONLY D1's LOW WORD -- the high word is
  // still the $80-biased long axis from the request above.  A port that rebuilt
  // D1 from the record here would drop that bias.
  enqueueRegisters(ram, 7, ((longA << 16) | u16((pos & 0xffff) + 0xf600)) >>> 0,
    ram.u32(a5 + 0x2e), 0x628, ram.u16(a6 + S.f1c));   // $273CC0/$273CC4/$273CC8
  if (ram.u16(G.rank98) === 0 && ram.u16(G.mirror2) !== 0) { // $273CCE/$273CD6
    enqueueRegisters(ram, 3,
      ((u16((pos >>> 16) + 0xd600) << 16) | (pos & 0xffff)) >>> 0, // $273CE2/$273CE8
      0x172d18, 0xa40, 0x18);                          // $273CEE/$273CF4/$273CF8/$273CFC
  }
  // $273D02: the LASER tail, armed by ($18,A5) and cadenced on ($22,A5).
  if (ram.u16(a5 + 0x18) === 0) return;                // $273D02 tst.w / beq $273D1E
  if (ram.u32(G.freeze) !== 0) return;                 // $273D08 tst.l / bne
  if (i16(ram.u16(a6 + 0x02)) < 0x1000) return;        // $273D10 cmpi.w / blt
  const lc = ram.u8(a5 + 0x22);                        // $273D18 subq.b #1,($22,A5)
  ram.setU8(a5 + 0x22, (lc - 1) & 0xff);
  if (lc !== 0) return;                                // $273D1C bcs $273D20 only
  laser80(ram, rom, a5, a6, ctx);                      // $273D20
}

// $273AD4..$273BCA -- the aim256 fan.  TWO shapes, and which one runs is decided
// by the stage and by ($20,A5); both are `dbra` loops that step D1 by a fixed
// amount and read a 64-entry longword table with `((D1+2) & $FC)`.
function fan80(ram, rom, a5, a6, ctx) {
  // $273AD4..$273AF2: the inlined target select (see aim85).
  let p0 = AIM.selP1, p1 = AIM.selP2;
  if (ram.u8(a5 + 0x03) !== 0) { p0 = AIM.selP2; p1 = AIM.selP1; } // $273AE0/$273AE6
  if ((ram.u16(p0) & 0x8000) === 0) {                  // $273AE8 tst.w / bmi
    if ((ram.u16(p1) & 0x8000) === 0) return;          // $273AEC / $273AEE bpl $273BCE
    const t = p0; p0 = p1; p1 = t;                     // $273AF2 exg
  }
  const tgtY = ram.u16(p0 + 2), tgtX = ram.u16(p0 + 4);   // $273AF4 movem.w
  const selfY = ram.u16(a6 + 0x02), selfX = ram.u16(a6 + 0x04); // $273AFA
  // $273B00 addi.w #$fe00,D0 / $273B04 addi.w #$0,D1 (the short axis is unbiased).
  let d1 = aim256(aimTables(rom), u16(selfY + 0xfe00), selfX, tgtY, tgtX); // $273B08
  const d2 = ram.u32(a6 + 0x02);                       // $273B0E move.l ($2,A6),D2
  const d5 = 0xfe000000;                               // $273B12 move.l #$fe000000,D5
  const stage4 = ram.u16(G.stage) === 4;               // $273B1A cmpi.w #$4
  const s20 = ram.u8(a5 + R.salvo);
  // $273B1A..$273B5C: which loop, and D0.  Written as the listing branches.
  let wide;                                            // true = the $2735FA loop
  let d0;
  if (stage4) {                                        // $273B22 bne $273B44
    if (s20 === 5) { d0 = 0x00000004; wide = true; }   // $273B26/$273B30 bra $273B62
    else if (s20 === 4) { d0 = 0xffff0004; wide = true; } // $273B36 beq $273B4E, $273B5C
    else { wide = false; d0 = 0xfffe0004; }            // $273B40 bra $273B8E, $273BA0
  } else if (s20 === 1) {                              // $273B44 cmpi.b #$1 / bne
    d0 = 0x00000004; wide = true;                      // $273B4E, stage != 4 -> $273B62
  } else { wide = false; d0 = 0xffff0005; }            // $273B8E
  const entry = wide ? 0x2817b8 : 0x2817a8;
  const table = wide ? 0x2735fa : 0x2736fa;
  const step = wide ? 8 : 0xc;                         // $273B66 / $273BAA moveq
  const iters = wide ? 8 : 7;                          // $273B68 moveq #$7 / #$6, dbra
  d1 = (d1 - (wide ? 0x1c : 0x24)) & 0xff;             // $273B62 / $273BA6 subi.b
  for (let n = 0; n < iters; n++) {                    // $273B86 / $273BCA dbra
    const idx = u16((d1 + 2) & 0xfc);                  // $273B70/$273B72/$273B74
    const d3 = u32(rom.u32(table + idx) + d5);         // $273B78 / $273B7C add.l D5,D3
    const res = fireBullet({ ram, rom, log: new WriteLog(ram) }, entry,
      { d0, d1, d2, d3, d4: 0, d5, a5 });              // $273B7E / $273BC2
    ctx.bulletSpawn?.(entry, res);
    d1 = u16(d1 + step);                               // $273B84 / $273BC8 add.w D6,D1
  }
}

// $273C08..$273C8E -- the TWO turrets.  `bchg #$6,($1,A6)` both TESTS the old
// bit and FLIPS it, so the two arms alternate on consecutive aims and each
// turret re-aims at half the cadence.
function turrets80(ram, rom, a5, a6) {
  let p0 = AIM.selP1, p1 = AIM.selP2;
  if (ram.u8(a5 + 0x03) !== 0) { p0 = AIM.selP2; p1 = AIM.selP1; } // $273C14/$273C1A
  if ((ram.u16(p0) & 0x8000) === 0) {                  // $273C1C tst.w / bmi
    if ((ram.u16(p1) & 0x8000) === 0) return;          // $273C20 / $273C22 bpl $273C94
    const t = p0; p0 = p1; p1 = t;                     // $273C26 exg
  }
  const tgtY = ram.u16(p0 + 2), tgtX = ram.u16(p0 + 4);   // $273C28 movem.w
  const selfY = ram.u16(a6 + 0x02), selfX = ram.u16(a6 + 0x04); // $273C2E
  const was = (ram.u8(a6 + 0x01) & 0x40) !== 0;        // $273C3A bchg #$6,($1,A6)
  ram.setU8(a6 + 0x01, ram.u8(a6 + 0x01) ^ 0x40);
  // The two arms differ ONLY in the short-axis muzzle bias and in which pair of
  // record fields they own.  facing: ($2C,A5) / ($32,A5); sprite: ($28,A5) /
  // ($2E,A5), both out of $272F7A.
  const shortBias = was ? 0xfb00 : 0x0500;             // $273C70 / $273C46
  const facingOff = was ? 0x32 : 0x2c;                 // $273C7A / $273C50
  const gfxOff = was ? 0x2e : 0x28;                    // $273C8E / $273C64
  const dir = aim64(aimTables(rom), u16(selfY + 0x680), u16(selfX + shortBias),
    tgtY, tgtX);                                       // $273C42/$273C4A (or $273C6C/$273C74)
  const nf = slew64(ram.u16(a5 + facingOff), dir);     // $273C54 / $273C7E
  ram.setU16(a5 + facingOff, nf);                      // $273C5A / $273C84
  ram.setU32(a5 + gfxOff, rom.u32(0x272f7a + ((nf & 0x3e) * 2))); // $273C64 / $273C8E
}

// $273D20..$273DAC -- the laser pair.  Both fires go through `$281484` with a
// muzzle vector out of `$27347A` biased per turret, and the SECOND salvo
// counter ($24,A5) disarms the tail by clearing ($18,A5).
function laser80(ram, rom, a5, a6, ctx) {
  ram.setU8(a5 + 0x22, ram.u8(a5 + 0x35));             // $273D20 reload from +$35
  const d0 = ram.u16(G.stage) === 4 ? 0x00070013 : 0x00020013; // $273D2C/$273D32/$273D3E
  const d2 = ram.u32(a6 + 0x02);                       // $273D62 move.l ($2,A6),D2
  for (const [facingOff, shortBias] of [[0x2c, 0x0500], [0x32, 0xfb00]]) {
    const d1 = ram.u16(a5 + facingOff);                // $273D44 / $273D6C
    const t = rom.u32(0x27347a + u16((d1 & 0x3e) * 2)); // $273D50 / $273D78
    // $273D54/$273D58/$273D5A -- addi.w around a `swap`, so the two halves do
    // NOT carry into each other (unlike $273B7C's `add.l`).
    const d3 = ((u16((t >>> 16) + 0x680) << 16) | u16((t & 0xffff) + shortBias)) >>> 0;
    const res = fireBullet({ ram, rom, log: new WriteLog(ram) }, 0x281484,
      { d0, d1, d2, d3, d4: 0, d5: 0, a5 });            // $273D66 / $273D88
    ctx.bulletSpawn?.(0x281484, res);
  }
  const c = ram.u8(a5 + 0x24);                         // $273D8E subq.b #1,($24,A5)
  ram.setU8(a5 + 0x24, (c - 1) & 0xff);
  if (c !== 0) return;                                 // $273D92 bcc $273DAC
  ram.setU8(a5 + 0x24, ram.u8(a5 + 0x25));             // $273D94
  ram.setU8(a5 + 0x22, u16(0x30 - ram.u16(G.b8)) & 0xff); // $273D9A/$273D9E/$273DA4
  ram.setU16(a5 + 0x18, 0);                            // $273DA8 clr.w ($18,A5)
}

// $273DAE..$273EFE -- the death arm.  SIX `$289004` allocations, each followed
// by field writes into the record it would have returned in A0; all six are part
// of the one noted gap, not six separate ones.
function deathSeq80(ram, a5, ctx) {
  const u = ctx.unported;
  noteEffect(u, 0x28615e, a5, 'D0=$83 explosion');     // $273DAE/$273DB4
  noteEffect(u, 0x28c2dc, a5, 'death burst');          // $273DBA jsr $28C2DC
  for (const d0 of ['$D', '$84', '$84', '$D', '$D', '$85']) {
    noteEffect(u, 0x289004, a5, 'D0=' + d0 + ' death effect'); // $273DC2..$273EC8
  }
  freeEnemy(ram, a5);                                  // $273EFE jmp $263762
}

// ================================================= TYPE $8A (W30) =========
// `$276702`, span `$276702..$276818` -- `$276814 jmp $263762` ends the death
// arm, `$27681A` is a `nop` pad, and `$27681C` is type $8B's init stub (whose
// body at `$276824` W23 already ports).  75 instructions, and the THIRD gate
// blocker: with `$275914` and `$2739C0` ported, `fly-around` stopped here at
// logic frame 2713.
//
// A scroll-locked prop like type `$8B`: no `stepMovement`, just
// `$24179E scrollCompensate`.  What is new is the tail -- it reaches an enqueue
// through the 24-entry DISPATCH TABLE `$27829C`, indexed by the sub-record's
// `($1E,A6)` word, which is why `resolveEmitStub` exists (src/spritequeue.js
// 1c).  For this type the prototype leaves that word 0, i.e. `$23D762`, i.e.
// BUCKET 0 -- the bucket W28 measured at 87,545 sprite pixels (72.1 % of the
// whole picture) with NO PRODUCER.  This is its first one.
function handler8A(ram, rom, a5, ctx) {
  const { unported: u } = ctx;
  const a6 = ram.u32(a5 + 0x06);
  // $276702 tst.b $8130F8 / bmi -- the same stage-kill gate type $8B has.
  if ((ram.u8(0x8130f8) & 0x80) !== 0) { freeEnemy(ram, a5); return; } // $276736
  scrollCompensate(ram, a5);                           // $27670A jsr $24179E
  // $276710..$27672E: bounds.  Y += $C00 + scroll + $B000; X += $400 + $8C00.
  const pos = ram.u32(a6 + 0x02);
  let off = u16(u16((pos & 0xffff) + 0xc00) + ram.u16(G.scroll)) + 0xb000 > 0xffff;
  if (!off) off = u16((pos >>> 16) + 0x400) + 0x8c00 > 0xffff;   // $276726/$27672A
  if (off) {                                           // $27672E bcc $27673E
    if (ram.u8(a5 + R.onScreen) !== 0) { freeEnemy(ram, a5); return; } // $276736
  } else {
    ram.setU8(a5 + R.onScreen, 1);                     // $27673E
  }
  // $276744: the damage branch.  No `$286096` call at all in this one -- the
  // hit bits are cleared and only the HP SIGN is consulted.
  if ((ram.u8(a6) & 0x5c) !== 0) {                     // $276744 moveq #$5c / and.b
    ram.setU8(a6, ram.u8(a6) & 0xa3);                  // $27674A andi.b #$a3,(A6)
    if ((ram.u16(a6 + S.hp) & 0x8000) !== 0) {         // $27674E tst.w / $276752 bmi
      deathSeq8A(ram, a5, ctx); return;                // $2767D0
    }
  }
  // $276756 tst.w $811F72 / bne $2767A6 -- while the mover's freeze word is set
  // the PROXIMITY test is skipped and the counter runs down anyway.
  if (ram.u16(0x811f72) === 0) {
    const live = playersAlive242884(ram);              // $27675E jsr $242884
    if (live === 0) return;                            // $276764 tst.w / beq $2767CE
    // $276768..$27679E: is either LIVE player within $240 on the SHORT axis?
    // The two arms are not symmetric: P1's is `bcs -> reload` (near) and P2's is
    // `bcc -> rts` (far), because P1 falls THROUGH into P2's test when it is far
    // and bit 1 is set.
    let near = false;
    if ((live & 1) !== 0) {                            // $276768 btst #$0 / beq $27678A
      const d = u16(ram.u16(a6 + 0x04) - ram.u16(0x8103ea)); // $27676E/$276774/$276778
      const m = (d & 0x8000) !== 0 ? u16(-d) : d;      // $27677A bpl / neg.w
      if (m < 0x240) near = true;                      // $27677E cmpi.w / $276782 bcs
      else if ((live & 2) === 0) return;               // $276784 btst #$1 / beq $2767CE
    }
    if (!near) {                                       // reached $27678A
      const d = u16(ram.u16(a6 + 0x04) - ram.u16(0x81044c)); // $27678A/$276790/$276794
      const m = (d & 0x8000) !== 0 ? u16(-d) : d;      // $276796 bpl / neg.w
      if (m >= 0x240) return;                          // $27679A cmpi.w / $27679E bcc
    }
    ram.setU16(a5 + 0x18, 0x000f);                     // $2767A0 move.w #$f,($18,A5)
  }
  ram.setU16(a5 + 0x18, u16(ram.u16(a5 + 0x18) - 1));  // $2767A6 subq.w #$1,($18,A5)
  // $2767AA bchg #$6,($1,A6) / bne -- `bchg` TESTS the old bit and FLIPS it, so
  // the blink+emit below runs on every OTHER frame.
  const was = (ram.u8(a6 + 0x01) & 0x40) !== 0;
  ram.setU8(a6 + 0x01, ram.u8(a6 + 0x01) ^ 0x40);
  if (was) return;                                     // $2767B0 bne $2767CE
  // $2767B2 eori.l #$B4,($A,A6) -- the sprite pointer TOGGLES between two
  // frames $B4 apart.  A longword EOR, not an add.
  ram.setU32(a6 + S.sprite0a, (ram.u32(a6 + S.sprite0a) ^ 0xb4) >>> 0);
  // $2767BA..$2767CC: `move.w ($1E,A6),D0 / add.w D0,D0 / add.w D0,D0 /
  // lea $27829C(pc),A0 / movea.l (A0,D0.w),A0 / jsr (A0)`.
  const idx = u16(ram.u16(a6 + S.anim) * 4);           // $2767BA/$2767BE/$2767C0
  if (idx >= EMIT_TABLE.entries27829C * 4) {
    unreached(EMIT_TABLE.dispatch27829C + idx, `type $8A's emitter dispatch `
      + `$2767C8 indexed $27829C with ($1E,A6) = $${ram.u16(a6 + S.anim)
        .toString(16).toUpperCase()}, i.e. byte offset $${idx.toString(16)
        .toUpperCase()}. The table has ${EMIT_TABLE.entries27829C} longwords `
      + `($27829C..$2782FB); past it is $278300, which is not a pointer table`);
  }
  enqueueThroughStub(ram, rom, rom.u32(EMIT_TABLE.dispatch27829C + idx), a6);
  void u;
}

// `$242884` -- WHICH PLAYERS ARE ALIVE, as a two-bit mask.  Ten instructions,
// and the test is TWO conditions per player: the record's first BYTE must be
// negative (bit 15 of the alive word) AND its bit 0 must be CLEAR.
//   242884: moveq #$0,D0 / move.b $8103E6,D1 / bpl / btst D0,D1 / bne / moveq #$1,D0
//   242894: move.b $810448,D1 / bpl / btst #$0,D1 / bne / addq.w #$2,D0
// The first `btst` uses D0 as the bit number and D0 is 0 there, so both are
// bit 0 -- a detail that reads like a bug and is not one.
function playersAlive242884(ram) {
  let d0 = 0;                                          // $242884 moveq #$0,D0
  const p1 = ram.u8(AIM.selP1);                        // $242886 move.b $8103E6,D1
  if ((p1 & 0x80) !== 0 && (p1 & 1) === 0) d0 = 1;     // $24288C bpl / $24288E btst
  const p2 = ram.u8(AIM.selP2);                        // $242894 move.b $810448,D1
  if ((p2 & 0x80) !== 0 && (p2 & 1) === 0) d0 += 2;    // $24289A bpl / $24289C btst
  return d0;                                           // $2428A4 rts
}

// $2767D0..$276814 -- the death arm.  Two effect spawns and `$27F92A`, then the
// field writes into the record `$289004` would have returned; all noted.
function deathSeq8A(ram, a5, ctx) {
  const u = ctx.unported;
  noteEffect(u, 0x28615e, a5, 'D0=$1 explosion');      // $2767D0/$2767D2
  noteEffect(u, 0x28c25a, a5, 'death burst');          // $2767D8
  u?.note(0x27f92a, `$27F92A in $8A death (D0 = ($1A,A5), D2 = ($1F,A6)) rec $`
    + a5.toString(16) + ' -- the $816B7A pool family, unported');  // $2767E6
  noteEffect(u, 0x289004, a5, 'D0=$C death effect');   // $2767EE
  // $2767FA..$276810: `move.w ($1E,A6),D0 / add.w D0,D0 / lea $278320(pc),A1 /
  // move.w (A1,D0.w),($1E,A0)` and `move.w #$1,($10,A0)` -- writes into the
  // record the allocation did not make, so they are inside the same gap.
  freeEnemy(ram, a5);                                  // $276814 jmp $263762
}

// ============================================================ THE DISPATCH
const HANDLERS = new Map([
  [0x2688cc, handler11],
  [0x268232, handler10],
  [0x269cea, handler05],
  [0x26a2e2, handler07],
  [0x2747c6, handler82],
  [0x27687e, handler8B],
  [0x275914, handler85],   // W30: types $85 AND $86 share this one
  [0x2739c0, handler80],   // W30: type $80
  [0x276702, handler8A],   // W30: type $8A
]);

/** Run the handler at `addr` for the enemy record `a5`.  An unknown address is a
 *  LOUD NAMED THROW (never a silence).  `ctx = { tables, unported }`. */
export function runHandler(addr, ram, rom, a5, ctx) {
  const fn = HANDLERS.get(addr & 0xffffff);
  if (!fn) {
    unreached(addr, `enemy handler at $${(addr & 0xffffff).toString(16).toUpperCase()} `
      + `is not in the ported handler table {`
      + [...HANDLERS.keys()].map((a) => `$${a.toString(16).toUpperCase()}`).join(' ')
      + `}. Either a non-stage-1 type was dispatched, or a handler was missed`);
  }
  fn(ram, rom, a5, ctx);
}

/** The map of ported handler addresses -> functions, for the enemy driver. */
export function handlerMap() { return HANDLERS; }
export const HANDLER_ADDRESSES = [...HANDLERS.keys()];
