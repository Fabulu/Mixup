// THE ENEMY BULLET MOVER -- `$281DDE`, exactly.  Wave 26.
//
// The spawn side (W21) puts a bullet INTO the pool with a type word whose bit 8
// is set, a speed byte at +$1A and a direction byte at +$1B.  Nothing moves.
// THIS routine is what makes it move.  Once a frame the per-frame bullet driver
// `$281D9A` calls the mover (`$281DBE bsr $281DDE`) with `A4 = $809C4C`, the
// bullet sprite accumulation buffer, and the mover walks the live pool and drives
// every bullet one frame: recompute velocity, dispatch the per-bullet behaviour,
// integrate, kill out-of-bounds, emit a sprite.
//
// ===================== THE FIVE PATHS (read past every terminator) ============
//
// For each live slot (`$281E54 move.w (A6),D2 / bpl skip`) the mover picks ONE
// path via the `$5180` mask (bits 14,12,8,7 of the type word) and a bit-12 kill
// test.  The fall-through trap lives here: four of the five paths are reached
// only by reading PAST an apparent terminator, and the continuation each path
// `jmp`s is the loop tail (it advances the slot and `dbra`s).
//
//   PLAIN  ($5180&type==0)        `$281E74`  integrate the STORED velocity at
//                                        +$1E (velA) / +$20 (velB); bounds; emit;
//                                        `jmp $22(A6)`.  EVERY stage-1 bullet.
//   bit12 (kill)                  `$281EC4`  free the slot.
//   bit7  (recompute)             `$281F3E`  bounds FIRST, then `bsr $284190` and
//                                        add the fresh dA/dB; emit; `jmp $22`.
//                                        (bit-8 sub-path `$281F84` runs the init.)
//   bit8  (dispatch / spawn frame)`$281EEE`  `bsr $284190` -> STORE velocity at
//                                        +$1E/+20; run `$282030[kind]` which
//                                        CLEARS bit 8 and installs the
//                                        continuation at +$22; advance inline
//                                        (no move, no jmp this frame).
//   bit14 (transform/death)       `$281FA2`  integrate stored velocity; emit; the
//                                        `$281FB4` bit-5 sprite-transform/death
//                                        counter.  Not in stage 1 -> UNVALIDATED.
//
// ====================== VELOCITY: STORED vs RECOMPUTED =======================
//
// Both are real and which one a bullet uses is the bit-7 path's job, NOT a
// global fact.  The DISPATCH path stores the freshly computed velocity at +$1E
// every spawn frame (`$281F02 movem.w D2-D3,$1e(A6)`).  The PLAIN path READS that
// stored velocity (`$281E74 move.l $1e(A6),D0`) -- so a plain bullet flies
// straight at the velocity fixed on its spawn frame; it is NOT recomputed.  Only
// bit-7 bullets (kinds 16/17/18/20/21/35 -- NONE in stage 1) recompute every
// frame, because their behaviour rewrites the direction BYTE and the velocity
// must follow.  "Velocity is never stored" describes the bit-7 family, not the
// whole pool; storing it for a plain bullet is exactly what the ROM does.
//
// ===================== THE CONTINUATION IS THE LOOP TAIL =====================
//
// The plain/bit-7/bit-14 paths end in `jmp $22(A6)` -- the per-bullet
// CONTINUATION the spawn-frame initialiser installed.  Every continuation does
// its per-frame work and then `lea $40(A6),A6 / dbra D7,$281E54`: it IS the loop
// tail, it advances the slot and loops.  Modelling the mover as a slot loop and
// the continuation as a per-slot function (whose net A6 move is +$40) is faithful
// to this -- verified: every stage-1 continuation's net A6 delta is +$40.

import { BUL, REC, TYPEBIT, behaviourFor } from './bullets.js';
import { velocity } from './bulletmath.js';
import { unreached } from './unported.js';
import { i16, u16 } from './ram.js';

// --------------------------------------------------------------- addresses
export const MOVER = {
  entry: 0x281DDE,
  driver: 0x281D9A,           // the bullet per-frame driver (caller)
  driverCallSite: 0x281DBE,   //   `bsr $281DDE`
  driverAfter: 0x281DC0,      //   the clean "after-mover" tap point
  scrollComp: 0x813176,       // $281DE4 move.w $813176,D6  (per-frame scroll delta)
  liveCount: 0x81b40c,        // $281E58 addq.w #1  (cleared by the driver first)
  cadence: 0x81b40e,          // $281F1C addi.w #$34 / cmpi.w #$9c -> clr
  window: [0x81b414, 0x81b416, 0x81b418, 0x81b41a],
  iterCounts: [0x45, 0x6d, 0x9f, 0xbd, 0xd1],   // 70/110/160/190/210 slots
  freezeC: 0x811f72,          // $281E20 global-kill gate
  stageKill: 0x8130f8,        // $281E34 bpl resume
  muzzleTable: 0x283D4C,      // $2820CC's 32-entry direction table (12 B each)
  deathEffect: 0x27F8F8,      // kill-side effect spawn (impact pool -- separate)
  spriteEmit: 0x284286,       // the factored sprite emit (= the inline $281E96)
  spriteBuf: 0x809C4C,        // A4 on entry, from the driver `$281D9E`
};

const BOUNDS = { posAkill: 0x9000, posBkill: 0xC800 };  // $281E88/$281E90 addi.w

/**
 * `$281DDE` -- drive the whole live bullet pool one frame.
 *
 * @param ctx {{ram, rom, notes?:UnportedLog, sprites?:Array, mut?:string}}
 *        `notes` counts the deliberately-out-of-scope effect spawn `$27F8F8`;
 *        `sprites` (optional) receives the packed sprite entries the mover emits.
 */
export function runMover(ctx) {
  const { ram } = ctx;
  const d6 = ram.u16(MOVER.scrollComp);             // $281DE4 (word; sub.w is bitwise)
  let slots = moverIterCount(ram);                   // $281DEA..$281E1E
  if (ctx.mut === 'window-constant') slots = MOVER.iterCounts[4] + 1;  // RED: cap=210

  for (let s = 0; s < slots; s++) {
    const base = BUL.pool + s * BUL.stride;
    driveSlot(ctx, base, d6);
  }
}

/** `$281DEA..$281E1E` -- the cascade.  D7+1 slots walked. */
function moverIterCount(ram) {
  // D7 starts $45; each NON-zero window word in order advances it one step.
  let step = 0;
  for (let i = 0; i < 4; i++) {
    if (ram.u16(MOVER.window[i]) === 0) break;       // beq -> use current D7
    step = i + 1;
  }
  return MOVER.iterCounts[step] + 1;                 // dbra: D7+1 iterations
}

// ----------------------------------------------------------- the per-slot dispatch
function driveSlot(ctx, base, d6) {
  const { ram } = ctx;
  const typeWord = ram.u16(base);                    // $281E54 move.w (A6),D2
  if ((typeWord & TYPEBIT.alive) === 0) return;      // $281E56 bpl -> dead, advance
  ram.setU16(MOVER.liveCount, u16(ram.u16(MOVER.liveCount) + 1));  // $281E58 addq

  // ---- the GLOBAL KILL gate ($281E5E..$281E6A bmi $281E20) -----------------
  const gate = u16(ram.u16(MOVER.freezeC) | ram.u16(MOVER.stageKill));
  if (gate & 0x8000) {                               // bmi -> $281E20
    // $281E20: survive only if $811F72 bit0 set AND $8130F8 bit15 clear.
    const fc = ram.u16(MOVER.freezeC);
    if (fc !== 0 && (fc & 1) !== 0
        && (ram.u16(MOVER.stageKill) & 0x8000) === 0) {
      // $281E34 bpl -> resume normal processing at $281E6C
    } else {
      freeSlot(ctx, base);                           // $281E36..$281E4E kill path
      return;
    }
  }

  // ---- the $5180 mask dispatch ($281E6C..$281E72) --------------------------
  const mask = typeWord & TYPEBIT.moverMask;
  if (mask === 0) { plainPath(ctx, base, d6); return; }   // $281E74

  // $281ED6: reached for any of bits 14/12/8/7.
  if (typeWord & TYPEBIT.kill) { freeSlot(ctx, base); return; }  // btst #$C; bne kill
  // $281EDC sub.w D6,$4(A6) -- scroll-comp on posB for bit7/8/14 (bit8 undoes it).
  ram.setU16(base + REC.posB, u16(ram.u16(base + REC.posB) - d6));

  if (typeWord & TYPEBIT.path281F3E) {               // tst.b D2; bmi -> bit7
    bit7Path(ctx, base, d6);
  } else if (typeWord & TYPEBIT.dispatch) {          // btst #$8; bne -> bit8
    dispatchPath(ctx, base, d6);
  } else {                                           // else -> bit14 ($281FA2)
    bit14Path(ctx, base, d6);
  }
}

// ------------------------------------------------- the PLAIN path ($281E74)
function plainPath(ctx, base, d6) {
  const { ram } = ctx;
  // $281E74 move.l $1e(A6),D0  -- STORED velocity (velA:velB longword)
  const velA = ram.u16(base + REC.velA);             // +$1E
  const velB = ram.u16(base + REC.velB);             // +$20
  // $281E78 sub.w D6,D0 ; $281E7A add.w D0,$4(A6)
  // MUTATION `velocity-stored-not-recomputed`: this is the path the spec's RED
  // names for plain bullets -- but plain bullets genuinely USE the stored value,
  // so the honest red for them is `break-kill` / `no-move`.  The recompute red
  // is the bit-7 path's (see bit7Path).
  if (ctx.mut === 'no-plain-move') {
    // skip the integrate (the red)
  } else {
    ram.setU16(base + REC.posB,
      u16(ram.u16(base + REC.posB) + u16(velB - d6)));
    // $281E7E swap D0 ; $281E80 add.w D0,$2(A6)
    ram.setU16(base + REC.posA,
      u16(ram.u16(base + REC.posA) + velA));
  }
  if (boundsKill(ctx, base)) return;                 // $281E84..$281E94
  spriteEmit(ctx, base);                             // $281E96..$281EB8 (= $284286)
  runContinuation(ctx, base);                        // $281EBC jmp $22(A6)
}

// ------------------------------------------------- the DISPATCH path ($281EEE)
function dispatchPath(ctx, base, d6) {
  const { ram, rom } = ctx;
  // $281EEE add.w D6,$4(A6) -- UNDO the scroll-comp from $281EDC (net 0).
  ram.setU16(base + REC.posB, u16(ram.u16(base + REC.posB) + d6));
  // $281EF2..$281F02 recompute velocity and STORE it.
  const speed = ram.u8(base + REC.speed);            // $281EF6 move.b $1a(A6),D0
  const dir = ram.u8(base + REC.dir);                // $281EFA move.b $1b(A6),D1
  const v = ctx.mut === 'velocity-stored-not-recomputed'
    ? { dA: ram.u16(base + REC.velA), dB: ram.u16(base + REC.velB) }  // RED: don't recompute
    : velocity(rom, speed, dir);                     // $281EFE bsr $284190
  ram.setU16(base + REC.velA, u16(v.dA));            // $281F02 movem.w D2-D3,$1e(A6)
  ram.setU16(base + REC.velB, u16(v.dB));
  // $281F08..$281F1A run the behaviour INITIALISER (clears bit8, installs +$22).
  runInitialiser(ctx, base);
  // $281F1C addi.w #$34,$81B40E / cmpi.w #$9c / bne / clr -- the sprite cadence.
  let cad = u16(ram.u16(MOVER.cadence) + 0x34);
  if (cad === 0x9c) cad = 0;
  ram.setU16(MOVER.cadence, cad);
  // $281F34 lea $40(A6),A6 / dbra -- advance inline (no move, no jmp this frame).
}

// ------------------------------------------------- the bit-7 RECOMPUTE path ($281F3E)
function bit7Path(ctx, base, d6) {
  const { ram, rom } = ctx;
  const typeWord = ram.u16(base);
  // $281F3E..$281F50 bounds FIRST (on the post-scroll-comp position).
  if (boundsKill(ctx, base)) return;
  if (typeWord & TYPEBIT.dispatch) {                 // $281F54 btst #$8; bne $281F84
    bit7InitSubPath(ctx, base);                      // run the initialiser instead
    return;
  }
  // $281F5A..$281F66 recompute velocity EVERY frame.
  const speed = ram.u8(base + REC.speed);
  const dir = ram.u8(base + REC.dir);
  const v = ctx.mut === 'velocity-stored-not-recomputed'
    ? { dA: ram.u16(base + REC.velA), dB: ram.u16(base + REC.velB) }  // RED
    : velocity(rom, speed, dir);
  // NOTE: bit-7 does NOT store to +$1E ($281F6A add.w D2,$2 / add.w D3,$4 only).
  ram.setU16(base + REC.posA, u16(ram.u16(base + REC.posA) + u16(v.dA)));
  ram.setU16(base + REC.posB, u16(ram.u16(base + REC.posB) + u16(v.dB)));
  spriteEmit(ctx, base);                             // $281F72 bsr $284286
  if ((ram.u16(base) & 0x0040) === 0) {              // $281F76 btst #$6,(A6); bne $281FB4
    runContinuation(ctx, base);                      // $281F7C jmp $22(A6)
  } else {
    bit5Transform(ctx, base);                        // $281FB4 (bit-6 set shares the transform)
  }
}

/** `$281F84` -- the bit-7 + bit-8 sub-path: run the initialiser, advance. */
function bit7InitSubPath(ctx, base) {
  runInitialiser(ctx, base);
  // $281F98 lea $40(A6),A6 / dbra -- advance inline.
}

// ------------------------------------------------- the bit-14 path ($281FA2) + bit-5 transform
function bit14Path(ctx, base, d6) {
  const { ram } = ctx;
  // $281FA2 move.l $1e(A6),D0 ; add.w D0,$4 ; swap ; add.w D0,$2 -- stored vel,
  // NO scroll subtraction here (the sub at $281EDC already applied it).
  const velA = ram.u16(base + REC.velA);
  const velB = ram.u16(base + REC.velB);
  ram.setU16(base + REC.posB, u16(ram.u16(base + REC.posB) + velB));
  ram.setU16(base + REC.posA, u16(ram.u16(base + REC.posA) + velA));
  // $281FB0 bsr $284286
  spriteEmit(ctx, base);
  bit5Transform(ctx, base);                          // $281FB4 bset #$5,(A6) ...
}

/**
 * `$281FB4..$28202E` -- the bit-5 sprite-transform/death sequence.
 * NOT exercised by the stage-1 corpus (no bit-14 kind appears) -> UNVALIDATED,
 * transcribed verbatim from the listing.
 */
function bit5Transform(ctx, base) {
  const { ram } = ctx;
  // $281FB4 bset #$5,(A6); bne $282000 -- first time bit5 set, do the sprite swap.
  if (ram.bset8(base, 5) === 0) {                    // old bit5 clear
    // $281FBA move.l #$1C1658,$a(A6)
    ram.setU32(base + 0x0a, 0x1c1658);
    const k = ram.u16(base) & TYPEBIT.kindMask;      // $281FC2 (A6) & $3F
    const tpl = ctx.rom.u32(BUL.templatePtrs + 4 * k);
    if (ctx.rom.u16(tpl + TPL_OFF.runInit) === 1) {  // $281FD4 cmpi.w #$1,-$2(A1)
      ram.setU32(base + 0x0a, 0x1c1418);             // $281FDC
    }
    ram.setU16(base + 0x0e, 0x0410);                 // $281FE4 graphic
    ram.setU32(base + 0x06, 0xfc00fe00);             // $281FEA descriptor
    ram.setU16(base + 0x16, 0x0010);                 // $281FF2
    ram.setU16(base + REC.velA, i16(ram.u16(base + REC.velA)) >> 1);  // $281FF8 asr.w $1e
    ram.setU16(base + REC.velB, i16(ram.u16(base + REC.velB)) >> 1);  // $281FFC asr.w $20
  }
  // $282000 addi.l #$24,$a(A6) -- render offset advance
  ram.setU32(base + 0x0a, (ram.u32(base + 0x0a) + 0x24) >>> 0);
  // $282008 subq.w #$1,$16(A6); bne $282026 -- counter; at 0, die or effect.
  let n = u16(ram.u16(base + 0x16) - 1);
  ram.setU16(base + 0x16, n);
  if (n === 0) {
    const tail = ram.u16(base + 0x3c);               // $28200E move.w $3c(A6),D0
    if ((tail & 0x8000) === 0) {                     // bmi -> die without effect
      ctx.notes?.note(MOVER.deathEffect,
        'bit-14 death effect spawn (impact pool, separate)');
    }
    freeSlotNoEffect(ctx, base);                     // $28201E clr/move
  }
  // $282026 lea $40(A6),A6 / dbra -- advance.
}

// ------------------------------------------------- shared: bounds kill + free
/**
 * `$281E84..$281E94` -- the bounds carry test (used by PLAIN after the move and
 * by bit-7 BEFORE it).  Returns true if the slot was freed.
 */
function boundsKill(ctx, base) {
  const { ram } = ctx;
  if (ctx.mut === 'break-kill') return false;       // RED: never free OOB
  const posB = ram.u16(base + REC.posB);
  if (posB + BOUNDS.posBkill > 0xffff) { freeSlot(ctx, base); return true; }  // $281E8C bcs
  const posA = ram.u16(base + REC.posA);
  if (posA + BOUNDS.posAkill > 0xffff) { freeSlot(ctx, base); return true; }  // $281E94 bcs
  return false;
}

/** Free a slot, noting the death-effect spawn `$27F8F8` (separate impact pool). */
function freeSlot(ctx, base) {
  const { ram } = ctx;
  // $281E36 moveq #$0,D0 ; $281E38 move.w D7,-(A7) ; $281E3A jsr $27F8F8
  ctx.notes?.note(MOVER.deathEffect,
    `bullet death effect spawn (D0=${
      0 /* moveq #0 */}): walks the impact pool $8171BE, NOT the bullet pool -- `
    + `a W27/W28 effect-spawn side effect, irrelevant to bullet state`);
  // $281E40 move.w (A7)+,D7 ; $281E42 clr.w (A6) ; $281E44 move.w #$ffff,$2(A6)
  freeSlotNoEffect(ctx, base);
}

/** `clr.w (A6); move.w #$ffff,$2(A6)` -- the slot free itself, no effect call. */
function freeSlotNoEffect(ctx, base) {
  const { ram } = ctx;
  ram.setU16(base, 0);                               // $281E42 / $281EC4 clr.w (A6)
  ram.setU16(base + REC.posA, 0xffff);               // $281E44 / $281EC6 move.w #$ffff,$2
}

// ------------------------------------------------- shared: the sprite emit ($284286)
/**
 * `$284286` (and the byte-identical inline `$281E96..$281EB8`) -- pack one
 * sprite list entry to (A4)+.  No bullet-pool side effect; emitted to the
 * caller's `ctx.sprites` sink when present (rendering is downstream).
 */
export function spriteEmit(ctx, base) {
  if (!ctx.sprites) return;                          // the gate passes no sink
  const { ram } = ctx;
  // $284286 lea $2(A6),A1 ; move.l (A1)+,D0 -> D0 = posA:posB ; A1=+$6
  let d0 = ram.u32(base + REC.posA);                 // {posA,posB}
  // swap ; add.w (A1)+,D0 -> posA += renderOffs.hi ; swap ; add.w (A1)+,D0 -> posB += renderOffs.lo
  const ro = ram.u32(base + REC.renderOffs);         // +$6
  let lo = d0 & 0xffff, hi = (d0 >>> 16) & 0xffff;   // lo=posB, hi=posA
  lo = u16(lo + ((ro >>> 16) & 0xffff));             // posB += renderOffs hi word
  hi = u16(hi + (ro & 0xffff));                      // posA += renderOffs lo word
  d0 = (hi << 16) | lo;
  d0 = (d0 >> 6) & 0x07ff03ff;                       // $284294 asr.l #6 ; $284296 andi.l
  d0 = (d0 | 0x80008000) >>> 0;                      // $28429C ori.l
  ctx.sprites.push(d0);                              // (A4)+ : packed pos
  ctx.sprites.push(ram.u32(base + REC.descriptor));  // (A1)+ : descriptor (+$A)
  ctx.sprites.push(ram.u16(base + REC.graphic));     // (A1)  : graphic (+$E)
  ctx.sprites.push(ram.u16(base + REC.attribute));   // $1c(A6): attribute
}

// ===================================================== THE BEHAVIOUR DISPATCH
//
// `$281F08..$281F1A` resolves `$282030[kind]` (kind = live type & $3F, so the
// 14/15->10 alias is honoured) and `jsr`s it.  `jmp $22(A6)` then runs the
// continuation the initialiser installed.  Both are hand-translated for the seven
// kinds stage 1 spawns (3/4/5/7/12/13/19); every other kind is a LOUD NAMED
// THROW carrying the address (the 39 behaviour bodies are W27).

const TPL_OFF = { runInit: 0x10 };   // bullets.js TPL.runInit -- duplicated to dodge a cycle

function runInitialiser(ctx, base) {
  const typeWord = ctx.ram.u16(base);
  const addr = behaviourFor(ctx.rom, typeWord);      // $282030[kind] (kind = type&$3f)
  const fn = INIT_BODIES.get(addr);
  if (!fn) {
    unreached(addr, `the behaviour INITIALISER $282030[${typeWord & 0x3f}] = `
      + `$${addr.toString(16).toUpperCase()} is NOT PORTED. Wave 26 hand-translated `
      + `the seven stage-1 kinds (3/4/5/7/12/13/19); the other 32 (the full 39-`
      + `behaviour family, $282104..$283BAF) are W27. Every initialiser clears `
      + `type-word bit 8 and installs a continuation at record +$22`);
  }
  fn(ctx, base);
}

function runContinuation(ctx, base) {
  const addr = ctx.ram.u32(base + REC.continuation);  // $281EBC movea.l $22(A6),A0
  const fn = CONTINUATIONS.get(addr);
  if (!fn) {
    unreached(addr, `the per-bullet CONTINUATION at record +$22 = `
      + `$${addr.toString(16).toUpperCase()} is NOT PORTED. Wave 26 hand-translated `
      + `the seven stage-1 kinds' continuations; the rest are W27`);
  }
  fn(ctx, base);
}

// ------------------------------------------------- shared helpers the bodies use

/** `$2820CC` -- muzzle-offset + sprite-setup, called by kinds 0/1/7/8/12/13/...
 *  The position-relevant part (posA/posB += the table's signed halves) is what
 *  the gate verifies; the renderOffs/descriptor/graphic/attribute writes are
 *  sprite-only but transcribed verbatim. */
function muzzleAndSprite(ctx, base) {
  const { ram, rom } = ctx;
  const d1 = ram.u16(MOVER.cadence);                 // caller's D1 = $81B40E
  // $2820CC index = (dir+4)&$F8; A1 += d0 + d0/2 = d0*3/2 into the 32-entry table.
  const dir = ram.u8(base + REC.dir);                // $2820CC move.b $1b(A6),D0
  const d0 = (dir + 4) & 0xf8;                        // $2820D0 addq.b #4 ; andi.w #$f8
  const idx = d0 + (d0 >> 1);                         // $2820D6-D0E lsr ; add
  const entry = MOVER.muzzleTable + idx;
  // $2820E2 move.l (A1)+,D0 -> T = the position-offset longword {hi, lo}.
  const T = rom.u32(entry);
  // $2820E4 asr.w #1,D0 -> the LOW word, ARITHMETIC (signed). Then it is added to
  // posA ($2) and to renderOffs.hi ($6). After swap + asr.w #1 the HIGH word
  // (also signed) is added to posB ($4) and renderOffs.lo ($8).
  const tLo = i16(T & 0xffff) >> 1;
  const tHi = i16((T >>> 16) & 0xffff) >> 1;
  ram.setU16(base + 0x06, u16(ram.u16(base + 0x06) + tLo));   // renderOffs hi
  ram.setU16(base + REC.posA, u16(ram.u16(base + REC.posA) + tLo));
  ram.setU16(base + 0x08, u16(ram.u16(base + 0x08) + tHi));   // renderOffs lo
  ram.setU16(base + REC.posB, u16(ram.u16(base + REC.posB) + tHi));
  // $2820F6 move.l (A1)+,(A0) -> descriptor (+$A) = table longword.
  ram.setU32(base + REC.descriptor, rom.u32(entry + 4));
  // $2820F8 add.l D1,(A0) -> +$E (graphic, as a longword) += cadence.
  ram.setU32(base + 0x0e, (ram.u32(base + 0x0e) + d1) >>> 0);
  // $2820FA move.w (A1)+,D0 ; or.w D0,$1c(A6) -> attribute |= table word.
  ram.setU16(base + REC.attribute,
    u16(ram.u16(base + REC.attribute) | rom.u16(entry + 8)));
  // $282100 bra $284286 -> the factored sprite emit.
  spriteEmit(ctx, base);
}

/** `andi.b #$fe,(A6)` -- clear type-word bit 8 (the dispatch bit). bit8 is bit0
 *  of the HIGH byte (the word is big-endian), so this is on `base`, not base+1. */
const clearDispatch = (ram, base) =>
  ram.setU8(base, ram.u8(base) & 0xfe);

// ================================================ THE SEVEN STAGE-1 BEHAVIOURS
//
// Each INITIALISER clears bit 8, sets the sprite fields, installs the
// continuation at +$22, and applies any position/speed/dir effect.  Each
// CONTINUATION does the per-frame work then advances one slot (net +$40); for
// stage 1 only kind 19's continuation touches a compared field (velocity).

const INIT_BODIES = new Map();
const CONTINUATIONS = new Map();

// ----- kind 3  ($2823EC init / $282420 cont) -- target-tracker, D4=0 in stage 1
INIT_BODIES.set(0x2823EC, (ctx, base) => {
  const { ram } = ctx;
  clearDispatch(ram, base);                          // $2823EC
  ram.setU32(base + 0x0a, 0x1c01ac);                 // $2823F0 renderOffs
  ram.setU8(base + 0x1d, 0x1a);                      // $2823F8
  // $2823FE..$282408 save/clear/restore $1e -> no-op on velocity (a placeholder
  // for the tracker; the ROM literally move.l/clr.l/move.l back).
  ram.setU32(base + 0x30, ram.u32(base + REC.velA));
  ram.setU32(base + REC.velA, 0);
  ram.setU32(base + REC.velA, ram.u32(base + 0x30));
  ram.setU32(base + 0x0a, 0x1bfef4);                 // $28240E renderOffs (overwrites)
  ram.setU32(base + REC.continuation, 0x282420);     // $282416
});
CONTINUATIONS.set(0x282420, (ctx, base) => {
  const { ram } = ctx;
  // $282420 bchg #$3,(A6) -- toggle bit 11 (flipFlop); Z reflects the OLD bit.
  const old = ram.bchg8(base, 3);
  if (old !== 0) { advance40(ctx, base); return; }   // $282424 bne $28248C -> advance
  // $282426..$28243A animate renderOffs (-(A1) from +$E -> +$A) + advance.
  animateRenderOffsWrap(ctx, base, 0x1bfef4, 0x24, 0x1bff84);
  advance40(ctx, base);
  // (the $282444 target-track branch is dead in stage 1 -- $2C==0 for every spawn)
});

// ----- kind 4  ($2824A8 init / $2824DC cont) -- structurally identical to kind 3
INIT_BODIES.set(0x2824A8, (ctx, base) => {
  const { ram } = ctx;
  clearDispatch(ram, base);
  ram.setU32(base + 0x0a, 0x1c01ac);
  ram.setU8(base + 0x1d, 0x1a);
  ram.setU32(base + 0x30, ram.u32(base + REC.velA));
  ram.setU32(base + REC.velA, 0);
  ram.setU32(base + REC.velA, ram.u32(base + 0x30));
  ram.setU32(base + 0x0a, 0x1bff84);
  ram.setU32(base + REC.continuation, 0x2824dc);
});
CONTINUATIONS.set(0x2824dc, (ctx, base) => {
  const { ram } = ctx;
  const old = ram.bchg8(base, 3);
  if (old !== 0) { advance40(ctx, base); return; }
  animateRenderOffsWrap(ctx, base, 0x1bff84, 0x24, 0x1c0014);
  advance40(ctx, base);
});

// ----- kind 5  ($282564 init / $282598 cont) -- same family again
INIT_BODIES.set(0x282564, (ctx, base) => {
  const { ram } = ctx;
  clearDispatch(ram, base);
  ram.setU32(base + 0x0a, 0x1c01ac);
  ram.setU8(base + 0x1d, 0x1a);
  ram.setU32(base + 0x30, ram.u32(base + REC.velA));
  ram.setU32(base + REC.velA, 0);
  ram.setU32(base + REC.velA, ram.u32(base + 0x30));
  ram.setU32(base + 0x0a, 0x1c0014);
  ram.setU32(base + REC.continuation, 0x282598);
});
CONTINUATIONS.set(0x282598, (ctx, base) => {
  const { ram } = ctx;
  const old = ram.bchg8(base, 3);
  if (old !== 0) { advance40(ctx, base); return; }
  animateRenderOffsWrap(ctx, base, 0x1c0014, 0x24, 0x1c00a4);
  advance40(ctx, base);
});

// ----- kind 6  ($282620 init / $282654 cont) -- the midboss's bullet; same
// target-tracker template as kinds 3/4/5 (D4=$2C dead when the spawn's D4 is 0).
INIT_BODIES.set(0x282620, (ctx, base) => {
  const { ram } = ctx;
  clearDispatch(ram, base);                          // $282620
  ram.setU32(base + 0x0a, 0x1c01ac);                 // renderOffs
  ram.setU8(base + 0x1d, 0x1a);
  ram.setU32(base + 0x30, ram.u32(base + REC.velA));  // save/clear/restore (no-op)
  ram.setU32(base + REC.velA, 0);
  ram.setU32(base + REC.velA, ram.u32(base + 0x30));
  ram.setU32(base + 0x0a, 0x1c00a4);                 // renderOffs (final)
  ram.setU32(base + REC.continuation, 0x282654);
});
CONTINUATIONS.set(0x282654, (ctx, base) => {
  const { ram } = ctx;
  const old = ram.bchg8(base, 3);                    // $282654 toggle bit 11
  if (old !== 0) { advance40(ctx, base); return; }   // $282658 bne -> advance
  animateRenderOffsWrap(ctx, base, 0x1c00a4, 0x24, 0x1c0134);
  advance40(ctx, base);
  // ($282678 target-track branch is dead in the corpus: every kind-6 spawn has
  //  D4=0 -> +$2C=0 -> the `move.l $2c,D1; beq skip` skips it, so the bne arm is
  //  just the advance above. Port the track faithfully if a stage uses it.)
});

// ----- kind 7  ($2826DC init / $282738 cont) -- muzzle offset + 8-frame anim
INIT_BODIES.set(0x2826DC, (ctx, base) => {
  const { ram } = ctx;
  muzzleAndSprite(ctx, base);                        // $2826EA bsr $2820CC (table $283D4C)
  ram.setU8(base + 0x1d, 0x1a);                      // $2826EE
  ram.setU32(base + 0x14, 0x6c);                     // $2826F4
  ram.setU16(base + 0x18, 0x0101);                   // $2826FC  (so +$19 = $01)
  ram.setU32(base + REC.continuation, 0x282738);     // $282702
  // $28270A lea $282714(PC),A0 ; $282710 bra $283C0E.  The epilogue clears bit 8
  // (flow-relevant) THEN does direction-sprite setup (sprite-only).  The sprite
  // setup reads per-kind sprite tables and is run only when a sprite sink is
  // present, so the position gate is not gated on sprite data windows.
  clearDispatch(ram, base);                          // $283C0E andi.b #$fe,(A6)
  if (ctx.sprites) epilogueSprite283C0E(ctx, base, 0x282714);
});
CONTINUATIONS.set(0x282738, (ctx, base) => {
  const { ram } = ctx;
  if (ram.u8(base + 0x19) !== 0) {                   // $282738 tst.b $19(A6); bne
    ram.setU8(base + 0x19, u16(ram.u8(base + 0x19) - 1));  // $282764 subq.b #1
    advance40(ctx, base);
    return;
  }
  // $28273E..$28275A animate renderOffs through the 8-frame ring; no pos/spd/dir.
  ram.setU32(base + 0x0a, (ram.u32(base + 0x0a) + 0x24) >>> 0);
  advance40(ctx, base);
});

// ----- kind 12 ($282908 init / $282944 cont) -- muzzle offset, simple anim
INIT_BODIES.set(0x282908, (ctx, base) => {
  const { ram } = ctx;
  muzzleAndSprite(ctx, base);                        // $282916
  clearDispatch(ram, base);                          // $28291A
  ram.setU8(base + 0x1d, 0x1a);
  ram.setU32(base + 0x06, 0xfe00fe00);               // descriptor
  ram.setU16(base + 0x0e, 0x0210);                   // graphic
  ram.setU32(base + 0x0a, 0x1c0ca4);                 // renderOffs
  ram.setU32(base + REC.continuation, 0x282944);
});
CONTINUATIONS.set(0x282944, (ctx, base) => {
  // $282944 addi.l #$14,-(A1) ; wrap at $1C0CF4 -> $1C0CA4 ; advance. No pos effect.
  animateRenderOffsWrap(ctx, base, 0x1c0ca4, +0x14, 0x1c0cf4);
  advance40(ctx, base);
});

// ----- kind 13 ($282962 init / $28299E cont) -- muzzle offset, simple anim
INIT_BODIES.set(0x282962, (ctx, base) => {
  const { ram } = ctx;
  muzzleAndSprite(ctx, base);                        // $282970
  clearDispatch(ram, base);                          // $282974
  ram.setU8(base + 0x1d, 0x1a);
  ram.setU32(base + 0x06, 0xfe00fe00);
  ram.setU16(base + 0x0e, 0x0210);
  ram.setU32(base + 0x0a, 0x1c0d1c);
  ram.setU32(base + REC.continuation, 0x28299e);
});
CONTINUATIONS.set(0x28299e, (ctx, base) => {
  animateRenderOffsWrap(ctx, base, 0x1c0d1c, +0x14, 0x1c0d94);
  advance40(ctx, base);
});

// ----- kind 19 ($282B30 init / $282B64 cont) -- 2-frame launch-delay
INIT_BODIES.set(0x282B30, (ctx, base) => {
  const { ram } = ctx;
  clearDispatch(ram, base);                          // $282B30
  ram.setU32(base + 0x0a, 0x1c1b68);                 // renderOffs
  ram.setU32(base + 0x06, 0xfc00fe00);               // descriptor
  ram.setU16(base + 0x0e, 0x0410);                   // graphic
  ram.setU8(base + 0x1d, 0x1a);
  // $282B50 move.l $1e,$30 ; $282B56 clr.l $1e -- SAVE velocity, then CLEAR it.
  ram.setU32(base + 0x30, ram.u32(base + REC.velA));
  ram.setU32(base + REC.velA, 0);
  ram.setU32(base + REC.continuation, 0x282b64);
});
CONTINUATIONS.set(0x282b64, (ctx, base) => {
  const { ram } = ctx;
  // $282B64 moveq #$3,D0 ; btst D0,$34(A6) ; beq $282B92
  if (ram.btst8(base + 0x34, 3) === 0) {
    // bit3 of +$34 clear: the track branch. $2C==0 in stage 1 -> $282BC6.
    if (ram.u32(base + 0x2c) !== 0) {
      unreached(0x282b64, 'kind 19 target-track branch ($2C != 0) -- not in the '
        + 'stage-1 corpus (D4=0 for every spawn). Port faithfully when a stage '
        + 'that uses it is reached');
    }
    ram.bset8(base + 0x34, 3);                       // $282BC6 bset #$3,$34
    ram.setU32(base + REC.velA, ram.u32(base + 0x30));  // $282BCC move.l $30,$1e -- RESTORE vel
    advance40(ctx, base);
    return;
  }
  // bit3 of +$34 set: toggle bit 11 (flipFlop); bne -> advance, else animate.
  const old = ram.bchg8(base, 3);                    // $282B6C bchg D0,(A6)
  if (old === 0) {
    ram.setU32(base + 0x0a, (ram.u32(base + 0x0a) + 0x24) >>> 0);  // animate
  }
  advance40(ctx, base);
});

// ------------------------------------------------- continuation helpers
//
// The slot-advance + dbra loop tail.  In this slot-loop model the advance is
// implicit (the for-loop moves to the next slot); this is a no-op marker that
// documents the `lea $40(A6),A6 / dbra D7,$281E54` every continuation ends in.
function advance40(/* ctx, base */) {}

/**
 * The `$282426`/`$282944`/`$28299E` render-offset animation.  When a
 * continuation runs, A1 = base+$E (left there by the sprite emit the plain path
 * just did), so `addi.l #n,-(A1)` predecrements to base+$A -- the renderOffs
 * longword -- advances it by `step` and wraps to `base0` when it equals `limit`.
 * Sprite-only; no position/speed/dir effect.
 */
function animateRenderOffsWrap(ctx, base, base0, step, limit) {
  const { ram } = ctx;
  const tgt = base + 0x0a;                           // -(A1) from base+$E
  let v = (ram.u32(tgt) + step) >>> 0;
  if (v === limit) v = base0;
  ram.setU32(tgt, v);
}

/** `$283C12..$283C4A` -- the sprite-setup body of the `$283C0E` epilogue (the
 *  `andi.b #$fe,(A6)` clear bit 8 is done by the caller).  Sprite-only; run only
 *  when a sprite sink is present so the position gate does not depend on the
 *  per-kind sprite-frame tables ($282714 etc.). */
function epilogueSprite283C0E(ctx, base, tableA0) {
  const { ram, rom } = ctx;
  ram.setU32(base + 0x06, 0xfc00fe00);               // $283C12 descriptor
  ram.setU16(base + 0x0e, 0x0410);                   // $283C1A graphic
  // $283C20 dir ; $283C28 (dir+4)>>2 ; andi #$3e -> index into $283C4C offsets
  const dir = ram.u8(base + REC.dir);
  const d1 = ((dir + 4) >> 2) & 0x3e;
  const off = rom.u16(0x283c4c + d1);                // $283C38 move.w (A1),D1
  const a0 = (tableA0 + off) >>> 0;                  // $283C3A adda.w D1,A0
  const spr = rom.u32(a0);                           // $283C3C move.l (A0),D0
  ram.setU32(base + 0x0a, spr);                      // $283C3E renderOffs
  ram.setU32(base + 0x10, (spr + ram.u32(base + 0x14)) >>> 0);  // $283C42 +$14
}

export { INIT_BODIES, CONTINUATIONS };
