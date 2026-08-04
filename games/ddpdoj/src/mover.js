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

// ================================================ SHARED HELPERS USED BY W27
//
// The 31 remaining bodies (W27) reuse four small patterns.  Each is factored
// here exactly once and the ROM address it stands in for is cited.  None of
// these touch a position field by themselves; the position-relevant logic is
// kept inline in each continuation so it is auditable line by line.

/** `subq.b #1,off(a6) / bcc skip` -- the BYTE countdown with reload.  The 68000
 *  `subq.b #1` sets C on borrow, and borrow happens iff the byte was 0; `bcc`
 *  branches when C is clear, i.e. when the byte was NON-zero.  So the reload +
 *  action run only when the byte UNDERFLOWS (was 0).  Returns true on underflow.
 *  Transcribes `$xxxA: subq.b #1,off / bcc $yyyA / move.b reloadOff,off`. */
function byteUnderflow(ram, base, off, reloadOff) {
  const old = ram.u8(base + off);
  ram.setU8(base + off, (old - 1) & 0xff);
  if (old === 0) {                                    // borrow -> bcc NOT taken
    ram.setU8(base + off, ram.u8(base + reloadOff));   // move.b reload,off
    return true;
  }
  return false;
}

/** `tst.b $19(a6) / bne <dec>` -- the per-bullet animation-delay tick.  When
 *  +$19 is non-zero the bullet is in its delay: decrement +$19 and return true
 *  (the caller advances without animating).  At 0 the caller animates. */
function tick19(ram, base) {
  if (ram.u8(base + 0x19) !== 0) {
    ram.setU8(base + 0x19, (ram.u8(base + 0x19) - 1) & 0xff);
    return true;
  }
  return false;
}

/** `$284190` recompute + `movem.w D2-D3,$1e(A6)` store, with an optional
 *  `asr.w #shift` (kinds 29's half-velocity wall bounce).  dA->+$1E, dB->+$20. */
function velRecomputeStore(ctx, base, shift = 0) {
  const { rom, ram } = ctx;
  const v = velocity(rom, ram.u8(base + REC.speed), ram.u8(base + REC.dir));
  let dA = v.dA, dB = v.dB;
  if (shift) { dA = i16(dA) >> shift; dB = i16(dB) >> shift; }   // asr.w #shift
  ram.setU16(base + REC.velA, u16(dA));
  ram.setU16(base + REC.velB, u16(dB));
}

/** `$2822AE` -- the dir-faced sprite epilogue.  Clears bit 8, sets renderOffs/
 *  graphic, then picks a sprite-frame pointer out of `tableA0` via the 32-word
 *  direction-offset table `$2822EC`, stores it at +$0A (descriptor) and its base
 *  at +$12.  Sprite-only (no position effect); the clearDispatch is flow-neutral. */
function epi2822AE(ctx, base, tableA0) {
  const { ram, rom } = ctx;
  clearDispatch(ram, base);                            // $2822AE andi.b #$fe,(A6)
  ram.setU32(base + 0x06, 0xfe00fe00);                 // $2822B2 renderOffs
  ram.setU16(base + 0x0e, 0x0210);                     // $2822BA graphic
  const dir = ram.u8(base + REC.dir);                  // $2822C0
  const d0 = (dir + 4) & 0xf8;                         // $2822C4 addq #4 ; $2822C6 andi #$f8
  const off = rom.u16(0x2822ec + d0);                  // $2822D0 move.w ($2822EC,A1,D0),D1
  const framePtr = rom.u32(tableA0 + off);             // $2822D4 movea.l (A0,D1),A0
  ram.setU32(base + 0x12, framePtr);                   // $2822D8 move.l A0,$12(A6)
  const idx = ram.u16(base + 0x16);                    // $2822DC move.w $16,D1
  ram.setU32(base + 0x0a, rom.u32(framePtr + idx));    // $2822E0 move.l (A0,D1),$a(A6)
  ram.setU16(base + 0x16, u16(ram.u16(base + 0x16) - 4)); // $2822E6 subq.w #4,$16
}

/** `$283C8C` -- kind 26's epilogue: clearDispatch + renderOffs $FE00FE00 +
 *  graphic $210, then the SAME dir-faced setup as `$283C0E` (`$283C20` block). */
function epi283C8C(ctx, base, tableA0) {
  const { ram, rom } = ctx;
  clearDispatch(ram, base);                            // $283C8C
  ram.setU32(base + 0x06, 0xfe00fe00);                 // $283C90
  ram.setU16(base + 0x0e, 0x0210);                     // $283C98
  // $283C20..$283C4A (== epilogueSprite283C0E's dir setup).
  const dir = ram.u8(base + REC.dir);
  const d1 = ((dir + 4) >> 2) & 0x3e;                  // $283C28/$283C2A/$283C2C
  const off = rom.u16(0x283c4c + d1);                  // $283C38
  const a0 = (tableA0 + off) >>> 0;                    // $283C3A adda.w D1,A0
  const spr = rom.u32(a0);                             // $283C3C
  ram.setU32(base + 0x0a, spr);                        // $283C3E descriptor
  ram.setU32(base + 0x10, (spr + ram.u32(base + 0x14)) >>> 0); // $283C42/$283C46
}

/** `$283CE4` -- the shared 4-frame sprite ring, gated on the `$80390C` logic-
 *  semaphore.  Cycles the anim index +$16 by -4 (wrap &$0C) and sets the
 *  descriptor from *(+$12 + index).  Sprite-only. */
function cont283CE4(ctx, base) {
  const { ram, rom } = ctx;
  if (ram.u16(0x80390c) === 0) return;                 // $283CE4 tst.w ; beq skip
  const framePtr = ram.u32(base + 0x12);               // $283CF0 movea.l (A0)+,A1
  const idx = ram.u16(base + 0x16);                    // $283CF2 move.w (A0),D0
  ram.setU32(base + 0x0a, rom.u32(framePtr + idx));    // $283CF4 move.l (A1,D0),$a
  ram.setU16(base + 0x16, u16(ram.u16(base + 0x16) - 4) & 0x000c); // $283CFA/$283CFC
}

/** the `lea -$c(A4)` TRAIL-EMIT block (kinds 27/36/37/38): copies the last
 *  12-byte sprite entry the plain path just emitted into the SECONDARY sprite
 *  list at `$81B41C`.  Sprite-only; the mover gate passes no sprite sink, so
 *  this is a counted note unless a sink is present. */
function trailEmit(ctx, base) {
  ctx.notes?.note(0x81b41c,
    `bullet trail emit (the lea -$c(A4) block): appends the last sprite entry `
    + `to the secondary list at $81B41C. Sprite-only side effect (rendering); `
    + `irrelevant to bullet state`);
}

// ================================================ THE BEHAVIOUR MAPS (W26 + W27)
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

// ============================================================ W27 FAMILY A
//
// The seven SPRITE-RING bodies: kinds 0, 1, 8, 9, 10 (aliased by 14 and 15),
// 11 and 20.  Every one is the same shape -- the initialiser calls $2820CC
// (muzzle offset + sprite), clears bit 8, writes the sprite fields, installs
// its continuation; the continuation steps the DESCRIPTOR at +$0A by a fixed
// amount and snaps back to a base when it reaches a limit.  No position,
// speed or direction effect: the plain path moves them in a straight line.
//
// Three things the family summary did not capture, all read out of the listing:
//
//   1. KIND 20 IS SEMAPHORE-GATED.  Its continuation opens `tst.w $80390C /
//      beq` ($282C30), so the ring only advances on frames the logic semaphore
//      is set -- the same gate `cont283CE4` honours.  The other six animate
//      unconditionally.  Treating 20 as a plain ring would step its descriptor
//      on every frame instead of roughly half of them.
//   2. KIND 11 ADVANCES VIA A1, NOT A6.  Its continuation is `addi.l #$24,
//      -(A1)` + `lea $40(A6),A6` ($2828EA/$2828FE), where the other six are
//      `adda.l #$a,A6` + `addi.l #n,(A6)` + `lea $36(A6),A6`.  Both land on
//      +$0A and both advance the record pointer by $40 net -- the same result
//      by two different routes, which is exactly the kind of difference that
//      looks like a transcription error later if it is not written down.
//   3. KINDS 8 AND 11 WRITE THEIR SPRITE FIELDS TWICE.  $282790 sets renderOffs
//      $FE00FE00 and graphic $210, then $2827A4/$2827AC immediately overwrite
//      them with $FC00FE00 and $410.  The first write is dead, and it is
//      transcribed anyway: the port's job is to be the same code, not the
//      tidier code.  (Kind 3 already carries an identical dead store.)
//
// Net A6 delta is +$40 for all seven, checked against each `lea` in the listing.

// ----- kind 0  ($282104 init / $28213E cont)
INIT_BODIES.set(0x282104, (ctx, base) => {
  const { ram } = ctx;
  muzzleAndSprite(ctx, base);                        // $282112 bsr $2820CC
  clearDispatch(ram, base);                          // $282114 andi.b #$fe,(A6)
  ram.setU32(base + 0x0a, 0x1bf58c);                 // $282118 descriptor
  ram.setU8(base + 0x1d, 0x1a);                      // $282120
  ram.setU32(base + 0x06, 0xfe00ff00);               // $282126 renderOffs
  ram.setU16(base + 0x0e, 0x0208);                   // $28212E graphic
  ram.setU32(base + REC.continuation, 0x28213e);     // $282134
});
CONTINUATIONS.set(0x28213e, (ctx, base) => {
  // $28213E adda.l #$a,A6 / $282144 addi.l #$c,(A6) / $28214A cmpi.l #$1bf5d4
  animateRenderOffsWrap(ctx, base, 0x1bf58c, 0x0c, 0x1bf5d4);
  advance40(ctx, base);                              // $282158 lea $36(A6) -> +$40
});

// ----- kind 1  ($282162 init / $28219E cont)
INIT_BODIES.set(0x282162, (ctx, base) => {
  const { ram } = ctx;
  muzzleAndSprite(ctx, base);                        // $282170
  clearDispatch(ram, base);                          // $282174
  ram.setU32(base + 0x0a, 0x1bf5d4);                 // $282178
  ram.setU8(base + 0x1d, 0x1a);                      // $282180
  ram.setU32(base + 0x06, 0xfe00fe00);               // $282186
  ram.setU16(base + 0x0e, 0x0210);                   // $28218E
  ram.setU32(base + REC.continuation, 0x28219e);     // $282194
});
CONTINUATIONS.set(0x28219e, (ctx, base) => {
  animateRenderOffsWrap(ctx, base, 0x1bf5d4, 0x14, 0x1bf714);  // $2821A4/$2821AA
  advance40(ctx, base);                              // $2821B8
});

// ----- kind 8  ($282772 init / $2827BC cont) -- the DOUBLE sprite write
INIT_BODIES.set(0x282772, (ctx, base) => {
  const { ram } = ctx;
  muzzleAndSprite(ctx, base);                        // $282780
  clearDispatch(ram, base);                          // $282784
  ram.setU8(base + 0x1d, 0x1a);                      // $282788
  ram.setU32(base + 0x06, 0xfe00fe00);               // $28278E  (dead: overwritten)
  ram.setU16(base + 0x0e, 0x0210);                   // $282796  (dead: overwritten)
  ram.setU32(base + 0x0a, 0x1c0944);                 // $28279C descriptor
  ram.setU32(base + 0x06, 0xfc00fe00);               // $2827A4 renderOffs (final)
  ram.setU16(base + 0x0e, 0x0410);                   // $2827AC graphic (final)
  ram.setU32(base + REC.continuation, 0x2827bc);     // $2827B2
});
CONTINUATIONS.set(0x2827bc, (ctx, base) => {
  animateRenderOffsWrap(ctx, base, 0x1c0944, 0x24, 0x1c09d4);  // $2827C2/$2827C8
  advance40(ctx, base);                              // $2827D6
});

// ----- kind 9  ($2827E0 init / $28281C cont)
INIT_BODIES.set(0x2827e0, (ctx, base) => {
  const { ram } = ctx;
  muzzleAndSprite(ctx, base);                        // $2827EE
  clearDispatch(ram, base);                          // $2827F2
  ram.setU8(base + 0x1d, 0x1a);                      // $2827F6
  ram.setU32(base + 0x06, 0xfe00fe00);               // $2827FC
  ram.setU16(base + 0x0e, 0x0210);                   // $282804
  ram.setU32(base + 0x0a, 0x1c0260);                 // $28280A
  ram.setU32(base + REC.continuation, 0x28281c);     // $282812
});
CONTINUATIONS.set(0x28281c, (ctx, base) => {
  animateRenderOffsWrap(ctx, base, 0x1c0260, 0x14, 0x1c02b0);  // $282822/$282828
  advance40(ctx, base);                              // $282836
});

// ----- kind 10 ($282840 init / $28287C cont) -- kinds 14 and 15 alias here
INIT_BODIES.set(0x282840, (ctx, base) => {
  const { ram } = ctx;
  muzzleAndSprite(ctx, base);                        // $28284E
  clearDispatch(ram, base);                          // $282852
  ram.setU8(base + 0x1d, 0x1a);                      // $282856
  ram.setU32(base + 0x06, 0xfe00fe00);               // $28285C
  ram.setU16(base + 0x0e, 0x0210);                   // $282864
  ram.setU32(base + 0x0a, 0x1c02d8);                 // $28286A
  ram.setU32(base + REC.continuation, 0x28287c);     // $282872
});
CONTINUATIONS.set(0x28287c, (ctx, base) => {
  animateRenderOffsWrap(ctx, base, 0x1c02d8, 0x14, 0x1c0350);  // $282882/$282888
  advance40(ctx, base);                              // $282896
});

// ----- kind 11 ($2828A0 init / $2828EA cont) -- the A1-relative continuation
INIT_BODIES.set(0x2828a0, (ctx, base) => {
  const { ram } = ctx;
  muzzleAndSprite(ctx, base);                        // $2828AE
  clearDispatch(ram, base);                          // $2828B2
  ram.setU8(base + 0x1d, 0x1a);                      // $2828B6
  ram.setU32(base + 0x06, 0xfe00fe00);               // $2828BC  (dead: overwritten)
  ram.setU16(base + 0x0e, 0x0210);                   // $2828C4  (dead: overwritten)
  ram.setU32(base + 0x0a, 0x1c0e0c);                 // $2828CA descriptor
  ram.setU32(base + 0x06, 0xfc00fe00);               // $2828D2 renderOffs (final)
  ram.setU16(base + 0x0e, 0x0410);                   // $2828DA graphic (final)
  ram.setU32(base + REC.continuation, 0x2828ea);     // $2828E0
});
CONTINUATIONS.set(0x2828ea, (ctx, base) => {
  // $2828EA addi.l #$24,-(A1): A1 is at base+$E after the emit, so this lands on
  // +$0A -- the same field the A6 form reaches.  $2828FE lea $40(A6) directly.
  animateRenderOffsWrap(ctx, base, 0x1c0e0c, 0x24, 0x1c0e9c);
  advance40(ctx, base);
});

// ----- kind 20 ($282BEE init / $282C2A cont) -- SEMAPHORE-GATED ring
INIT_BODIES.set(0x282bee, (ctx, base) => {
  const { ram } = ctx;
  muzzleAndSprite(ctx, base);                        // $282BFC
  clearDispatch(ram, base);                          // $282C00
  ram.setU32(base + 0x0a, 0x1c0134);                 // $282C04 descriptor
  ram.setU8(base + 0x1d, 0x1a);                      // $282C0C
  ram.setU32(base + 0x06, 0xfe00fe00);               // $282C12
  ram.setU16(base + 0x0e, 0x0210);                   // $282C1A
  ram.setU32(base + REC.continuation, 0x282c2a);     // $282C20
});
CONTINUATIONS.set(0x282c2a, (ctx, base) => {
  const { ram } = ctx;
  // $282C30 tst.w $80390C / $282C36 beq -- skip the ring, but STILL advance.
  if (ram.u16(0x80390c) !== 0) {
    animateRenderOffsWrap(ctx, base, 0x1c0134, 0x14, 0x1c01ac);  // $282C38/$282C3E
  }
  advance40(ctx, base);                              // $282C4C lea $36(A6)
});

// ============================================================ W27 FAMILY B
//
// Kinds 2 ($2821C2, table $2821FA) and 21 ($282C56, table $282C8E).  The two
// bodies are instruction-for-instruction identical apart from that table
// pointer.  Both END in `bra.w $2822AE` -- a TAIL JUMP into the shared
// dir-faced epilogue, which is where bit 8 gets cleared and the sprite fields
// written.  The routine does not stop at its last `move.l`; reading it as if
// it did would drop the entire epilogue.  (`epi2822AE` is W26's, already
// transcribed and in use by other kinds.)
//
// Both install the SAME continuation, `$283CE4` -- the 4-frame ring gated on
// the `$80390C` semaphore, also already transcribed as `cont283CE4`.  It is
// registered here because W26 had no kind that reached it: the helper existed
// but nothing dispatched to it.
//
// `move.l #$C000C,$16(A6)` writes BOTH +$16 (the anim index, $000C) and +$18
// ($000C) as one longword -- the epilogue reads +$16 and steps it by -4.

// ----- kind 2  ($2821C2 init) -- table $2821FA
INIT_BODIES.set(0x2821c2, (ctx, base) => {
  const { ram } = ctx;
  muzzleAndSprite(ctx, base);                        // $2821D0 bsr $2820CC
  ram.setU8(base + 0x1d, 0x1a);                      // $2821D4
  ram.setU32(base + 0x16, 0x000c000c);               // $2821E0 anim index + $18
  ram.setU16(base + 0x26, 0x0101);                   // $2821E8
  ram.setU32(base + REC.continuation, 0x283ce4);     // $2821EE
  epi2822AE(ctx, base, 0x2821fa);                    // $2821F6 bra.w $2822AE
});

// ----- kind 21 ($282C56 init) -- table $282C8E, otherwise identical to kind 2
INIT_BODIES.set(0x282c56, (ctx, base) => {
  const { ram } = ctx;
  muzzleAndSprite(ctx, base);                        // $282C64
  ram.setU8(base + 0x1d, 0x1a);                      // $282C68
  ram.setU32(base + 0x16, 0x000c000c);               // $282C74
  ram.setU16(base + 0x26, 0x0101);                   // $282C7C
  ram.setU32(base + REC.continuation, 0x283ce4);     // $282C82
  epi2822AE(ctx, base, 0x282c8e);                    // $282C8A bra.w $2822AE
});

// the shared continuation both kinds install.  cont283CE4 is sprite-only and
// does NOT advance A6 itself -- the ring is the whole body.
CONTINUATIONS.set(0x283ce4, (ctx, base) => {
  cont283CE4(ctx, base);
  advance40(ctx, base);
});

// ============================================================ W27 FAMILY C
//
// Kinds 16 ($2829BC) and 18 ($282AAE): the "transform-once" flyers.  Both
// initialisers are family B's shape -- muzzle, +$1D, the $2821FA table, +$16 =
// $C000C, +$26 = $101, and a `bra.w $2822AE` TAIL JUMP into the same dir-faced
// epilogue -- plus a few extra counter fields.  Note they reuse KIND 2's table
// at $2821FA, so no new ROM window is needed.
//
// Their continuations are what makes them different: instead of stepping a
// ring, they OVERWRITE descriptor / renderOffs / graphic with the same fixed
// $410-family values on every single frame.  The sprite never animates; it is
// re-stamped.
//
// KIND 18 IS THE ENEMY SPAWNER, and it is the interesting one.  After the
// re-stamp it runs a WORD countdown at +$34 (`subq.w #1,$34(A6) / bcc`), and on
// underflow it calls `$263684` with D0 = $35 -- the enemy-spawn entry -- writes
// the bullet's position into the new enemy's +$16, and then `bra $281EC4`:
// the bullet KILLS ITSELF and the enemy takes its place.  `$263684` belongs to
// the enemy subsystem and is not ported, so that arm is a loud named throw.
//
// The countdown reads +$34, which NEITHER initialiser writes -- it arrives from
// the spawn record.  Worth knowing before trusting a seeded test: seed +$34 or
// the first frame underflows immediately.

// ----- kind 16 ($2829BC init / $2829FE cont)
INIT_BODIES.set(0x2829bc, (ctx, base) => {
  const { ram } = ctx;
  muzzleAndSprite(ctx, base);                        // $2829CA
  ram.setU8(base + 0x1d, 0x1a);                      // $2829CE
  ram.setU32(base + 0x16, 0x000c000c);               // $2829D8
  ram.setU16(base + 0x26, 0x0101);                   // $2829E0
  ram.setU32(base + REC.continuation, 0x2829fe);     // $2829E6
  ram.setU8(base + 0x28, 0x00);                      // $2829EE
  ram.setU16(base + 0x2a, 0x0001);                   // $2829F4
  epi2822AE(ctx, base, 0x2821fa);                    // $2829FA bra.w $2822AE
});
CONTINUATIONS.set(0x2829fe, (ctx, base) => {
  const { ram } = ctx;
  ram.setU32(base + 0x0a, 0x1c0014);                 // $2829FE descriptor
  ram.setU32(base + 0x06, 0xfc00fe00);               // $282A06 renderOffs
  ram.setU16(base + 0x0e, 0x0410);                   // $282A0E graphic
  advance40(ctx, base);                              // $282A14 lea $40(A6)
});

// ----- kind 18 ($282AAE init / $282AF6 cont) -- THE ENEMY SPAWNER
INIT_BODIES.set(0x282aae, (ctx, base) => {
  const { ram } = ctx;
  muzzleAndSprite(ctx, base);                        // $282ABC
  ram.setU8(base + 0x1d, 0x1a);                      // $282AC0
  ram.setU32(base + 0x16, 0x000c000c);               // $282ACA
  ram.setU16(base + 0x26, 0x0101);                   // $282AD2
  ram.setU32(base + REC.continuation, 0x282af6);     // $282AD8
  ram.setU8(base + 0x28, 0x00);                      // $282AE0
  ram.setU16(base + 0x2a, 0x0001);                   // $282AE6
  ram.setU16(base + 0x2c, 0x0004);                   // $282AEC  (kind 16 lacks this)
  epi2822AE(ctx, base, 0x2821fa);                    // $282AF2 bra.w $2822AE
});
CONTINUATIONS.set(0x282af6, (ctx, base) => {
  const { ram } = ctx;
  ram.setU32(base + 0x0a, 0x1c0014);                 // $282AF6 descriptor
  ram.setU32(base + 0x06, 0xfc00fe00);               // $282AFE renderOffs
  ram.setU16(base + 0x0e, 0x0410);                   // $282B06 graphic
  // $282B0C subq.w #1,$34(A6) / $282B10 bcc -- WORD countdown; the 68000 sets C
  // on borrow, and borrow happens iff the word was 0.  bcc is taken while it is
  // non-zero, so the spawn fires on UNDERFLOW, not on reaching zero.
  const old = ram.u16(base + 0x34);
  ram.setU16(base + 0x34, u16(old - 1));
  if (old !== 0) { advance40(ctx, base); return; }   // $282B26 lea $40(A6)
  unreached(0x263684,
    `kind 18's spawn arm: the +$34 countdown underflowed, so $282B16 calls `
    + `$263684 (D0 = $35, the enemy-spawn entry), copies the bullet's position `
    + `($2(A6)) into the new enemy's +$16, and kills the bullet via $281EC4. `
    + `The enemy subsystem is not ported, so every value after this frame `
    + `would be invented`);
});

// ============================================================ W27 FAMILY D
//
// Kind 17 ($282A1E) -- THE CURVER, and the first W27 body the mover gate can
// actually see.  Families A-C write only descriptor/renderOffs/graphic, all of
// which the gate ignores; this one writes DIR (+$1B) and SPEED (+$1A), both
// compared fields.
//
// Its initialiser is byte-identical to kind 18's, and the continuation opens
// with the same $410 re-stamp, then runs TWO independent byte countdowns:
//
//   $282A7C  subq.b #1,$2A / bcc  -> on underflow: reload from +$2B,
//                                     then dir += +$34        (the turn)
//   $282A92  subq.b #1,$2C / bcc  -> on underflow: reload from +$2D,
//                                     then speed += 1         (the accel)
//
// So the bullet turns by a per-record rate every +$2B frames and accelerates by
// 1 every +$2D frames.  Both counters are the reload flavour that `byteUnderflow`
// already models.
//
// THE COUNTER/RELOAD PAIRS COME FROM WORD WRITES, AND THE HALVES ARE NOT WHAT
// THEY LOOK LIKE.  `move.w #$1,$2a(A6)` ($282A56) is big-endian, so it sets
// +$2A = $00 and +$2B = $01 -- the COUNTER to zero and the RELOAD to one.  Same
// for `move.w #$4,$2c(A6)`: +$2C = $00, +$2D = $04.  A counter seeded to 0
// underflows on its FIRST continuation frame, so a fresh kind-17 bullet turns
// and accelerates immediately rather than after a delay.  Reading those as
// counter=1 and counter=4 would delay the first turn by a frame and the first
// acceleration by four.
//
// +$34 (the turn rate) is NOT written by the initialiser -- it arrives from the
// spawn record, exactly as kind 18's +$34 countdown does.

INIT_BODIES.set(0x282a1e, (ctx, base) => {
  const { ram } = ctx;
  muzzleAndSprite(ctx, base);                        // $282A2C
  ram.setU8(base + 0x1d, 0x1a);                      // $282A30
  ram.setU32(base + 0x16, 0x000c000c);               // $282A3A
  ram.setU16(base + 0x26, 0x0101);                   // $282A42
  ram.setU32(base + REC.continuation, 0x282a66);     // $282A48
  ram.setU8(base + 0x28, 0x00);                      // $282A50
  ram.setU16(base + 0x2a, 0x0001);                   // $282A56 -> +$2A=0, +$2B=1
  ram.setU16(base + 0x2c, 0x0004);                   // $282A5C -> +$2C=0, +$2D=4
  epi2822AE(ctx, base, 0x2821fa);                    // $282A62 bra.w $2822AE
});
CONTINUATIONS.set(0x282a66, (ctx, base) => {
  const { ram } = ctx;
  ram.setU32(base + 0x0a, 0x1c0014);                 // $282A66 descriptor
  ram.setU32(base + 0x06, 0xfc00fe00);               // $282A6E renderOffs
  ram.setU16(base + 0x0e, 0x0410);                   // $282A76 graphic
  // $282A7C the TURN: counter +$2A, reload +$2B, then dir += the +$34 rate.
  if (byteUnderflow(ram, base, 0x2a, 0x2b)) {
    const rate = ram.u8(base + 0x34);                // $282A8A move.b $34,D0
    ram.setU8(base + REC.dir, (ram.u8(base + REC.dir) + rate) & 0xff);  // $282A8E
  }
  // $282A92 the ACCEL: counter +$2C, reload +$2D, then speed += 1.
  if (byteUnderflow(ram, base, 0x2c, 0x2d)) {
    ram.setU8(base + REC.speed, (ram.u8(base + REC.speed) + 1) & 0xff); // $282AA0
  }
  advance40(ctx, base);                              // $282AA4 lea $40(A6)
});

// ============================================================ W27 FAMILY E
//
// Kind 22 ($282D42) -- the ATTACHED tracker.  The recon called this family "the
// homing tracker", which undersells it: the bullet does not steer toward a
// target, it is PINNED TO one and later RELEASED.
//
//   init  ($282D62/$282D68): saves the whole velocity longword +$1E to +$30 and
//         CLEARS +$1E.  A zero velocity means the plain path moves it nowhere,
//         so while attached the bullet's position comes entirely from its
//         target.  (Kind 19 uses the same save/clear trick for its launch delay.)
//   track ($282DA4): position (+$2, the posA:posB longword) = the target's own
//         position (+$2 of the target record) PLUS the fixed offset at +$28.
//         The target pointer lives at +$2C.
//   release ($282DD8): `bset #3,$34` latches the mode, and +$1E is restored from
//         +$30 -- the bullet keeps the velocity it was born with and flies off.
//   animate ($282D7E): once the latch is set, it is an ordinary descriptor ring.
//
// RELEASE HAPPENS TWO WAYS, and only one is obvious: the target pointer at +$2C
// being NULL ($282DA8 beq), or the descriptor animation reaching $1C1EEC
// ($282DCE).  The second is a fall-through -- `bne $282DE4` skips the release,
// so reaching the limit DROPS INTO $282DD8.  Read as "the ring wraps here" it
// would be missed entirely.
//
// THE TWO KILL TESTS ARE ON THE TARGET, NOT THE BULLET.  $282DAC `tst.w (A0) /
// bpl` kills when the TARGET's type word has bit 15 clear (target dead), and
// $282DB0 `tst.b $1(A0) / bmi` kills on a flag in the target's second byte.  So
// a bullet attached to something that dies dies with it.
//
// The kill at $282DEE is a bare `clr.w (A6)` + `move.w #$ffff,$2(A6)` with NO
// jsr to the death-effect spawner -- so it is freeSlotNoEffect, NOT freeSlot.
// Using freeSlot here would emit a death-effect the cartridge never spawns.
//
// Note the animate ring's base is $1C1EC8, which is NOT the descriptor the
// initialiser writes ($1C1E38).  The first wrap moves it into a different ring.

INIT_BODIES.set(0x282d42, (ctx, base) => {
  const { ram } = ctx;
  clearDispatch(ram, base);                          // $282D42 andi.b #$fe,(A6)
  ram.setU32(base + 0x0a, 0x1c1e38);                 // $282D46 descriptor
  ram.setU32(base + 0x06, 0xfc00fe00);               // $282D4E renderOffs
  ram.setU16(base + 0x0e, 0x0410);                   // $282D56 graphic
  ram.setU8(base + 0x1d, 0x1a);                      // $282D5C
  ram.setU32(base + 0x30, ram.u32(base + REC.velA)); // $282D62 save velocity
  ram.setU32(base + REC.velA, 0);                    // $282D68 clr.l $1e(A6)
  ram.setU32(base + REC.continuation, 0x282d76);     // $282D6C
});
CONTINUATIONS.set(0x282d76, (ctx, base) => {
  const { ram } = ctx;
  // $282D78 btst #3,$34(A6) / beq -> bit CLEAR means still attached.
  const attached = (ram.u8(base + 0x34) & 0x08) === 0;

  if (!attached) {                                   // $282D7E the ANIMATE arm
    if (ram.bchg8(base, 3) !== 0) { advance40(ctx, base); return; }  // $282D80 bne
    animateRenderOffsWrap(ctx, base, 0x1c1ec8, 0x24, 0x1c2108);      // $282D86/$282D8C
    advance40(ctx, base);                            // $282D9A lea $36(A6)
    return;
  }

  // ---- $282DA4 the TRACK arm
  const target = ram.u32(base + 0x2c);               // $282DA4 move.l $2c(A6),D1
  let release = (target === 0);                      // $282DA8 beq -> release

  if (!release) {
    // $282DAC tst.w (A0) / bpl -- the TARGET's type word, bit 15 clear = dead.
    // $282DB0 tst.b $1(A0) / bmi -- a flag in the target's second byte.
    if ((ram.u16(target) & 0x8000) === 0 || (ram.u8(target + 1) & 0x80) !== 0) {
      freeSlotNoEffect(ctx, base);                   // $282DEE clr.w + $ffff
      advance40(ctx, base);
      return;
    }
    // $282DB6 the whole posA:posB longword = target position + our +$28 offset
    ram.setU32(base + REC.posA,
      (ram.u32(target + 0x02) + ram.u32(base + 0x28)) >>> 0);        // $282DBA/$282DBE
    if (ram.bchg8(base, 3) !== 0) { advance40(ctx, base); return; }  // $282DC2/$282DC4
    // $282DC6 step the descriptor; reaching $1C1EEC FALLS THROUGH to the release.
    ram.setU32(base + 0x0a, (ram.u32(base + 0x0a) + 0x24) >>> 0);
    if (ram.u32(base + 0x0a) !== 0x1c1eec) { advance40(ctx, base); return; }
  }

  // ---- $282DD8 RELEASE: latch the mode and give the bullet its velocity back
  ram.setU8(base + 0x34, ram.u8(base + 0x34) | 0x08);   // $282DD8 bset #3,$34
  ram.setU32(base + REC.velA, ram.u32(base + 0x30));    // $282DDE restore velocity
  advance40(ctx, base);                                 // $282DE4 lea $40(A6)
});

// ================================================ W27 FAMILY E (finished) + F
//
// Kind 24 ($282EBC) and kind 23 ($282E00) are two halves of one template, and
// the recon's family split ("E = homing tracker", "F = the decelerator") cuts
// through the middle of it.  What the listing shows:
//
//   * kind 24's INITIALISER is byte-identical to kind 22's ($282D42) apart from
//     the continuation address -- same descriptor $1C1E38, same $FC00FE00 /
//     $410, same save-velocity-to-+$30 / `clr.l $1E`.
//   * kind 24's CONTINUATION has NO TRACK ARM.  Kind 22's `beq` goes to the
//     track code at $282DA4; kind 24's `beq $282F46` goes STRAIGHT to the
//     release.  So the attach is one frame long: the spawn frame stores a zero
//     velocity, the next plain frame moves the bullet nowhere, and the
//     continuation immediately latches +$34 bit 3 and restores +$1E.  It is a
//     ONE-FRAME LAUNCH DELAY built out of the tracker's machinery, not a
//     tracker.  There is no target pointer read anywhere in the body.
//   * kinds 23 and 24 then share a DECELERATION block, instruction for
//     instruction ($282E64 == $282F16), which is family F's whole content.
//
// THE DEAD TAILS.  Both bodies carry template vestiges nothing branches to:
// kind 23 has a release stub at $282E94 and a free-slot stub at $282EAA; kind
// 24 has a free-slot stub at $282F5C.  Every branch in the reachable code was
// checked ($282E4A: bne $282E64, beq/bmi/bcc; $282EF0: beq $282F46, bne
// $282F16, bcc $282F3C) and none of them lands there.  They are transcribed as
// comments only -- porting an unreachable arm would invent behaviour.
//
// Kind 23's initialiser is kind 11's shape, dead sprite write and all, and it
// writes the SAME descriptor $1C0E0C over the SAME $24-step ring to $1C0E9C.
// The difference between kinds 11 and 23 is entirely the decel block.

/** `$282E64` / `$282F16` -- the shared DECELERATION block of kinds 23 and 24.
 *
 *  +$36 is a DURATION word and it has three states, which is easy to miss:
 *    `tst.w $36 / beq  -> skip the WHOLE block` (zero: never decelerate)
 *    `           bmi   -> skip only the decrement` (negative: decelerate forever)
 *    else `subq.w #1,$36`                          (positive: count it down)
 *  Then a byte countdown at +$2C with reload +$2D, and on UNDERFLOW
 *  `move.w $2e(A6),D0 / sub.w D0,$1e(A6)` -- velA (+$1E) loses the +$2E word.
 *  Position-relevant: the plain path integrates +$1E. */
function decelBlock(ctx, base) {
  const { ram } = ctx;
  const dur = ram.u16(base + 0x36);                    // $282E64 tst.w $36(A6)
  if (dur === 0) return;                               // $282E68 beq -> skip all
  if ((dur & 0x8000) === 0) {                          // $282E6C bmi -> skip the dec
    ram.setU16(base + 0x36, u16(dur - 1));             // $282E70 subq.w #1,$36
  }
  if (!byteUnderflow(ram, base, 0x2c, 0x2d)) return;   // $282E74/$282E78 bcc
  const d0 = ram.u16(base + 0x2e);                     // $282E82 move.w $2e(A6),D0
  ram.setU16(base + REC.velA, u16(ram.u16(base + REC.velA) - d0));  // $282E86 sub.w
}

// ----- kind 23 ($282E00 init / $282E4A cont) -- the DECELERATOR
INIT_BODIES.set(0x282e00, (ctx, base) => {
  const { ram } = ctx;
  muzzleAndSprite(ctx, base);                          // $282E0E bsr $2820CC
  clearDispatch(ram, base);                            // $282E12 andi.b #$fe,(A6)
  ram.setU8(base + 0x1d, 0x1a);                        // $282E16
  ram.setU32(base + 0x06, 0xfe00fe00);                 // $282E1C  (dead: overwritten)
  ram.setU16(base + 0x0e, 0x0210);                     // $282E24  (dead: overwritten)
  ram.setU32(base + 0x0a, 0x1c0e0c);                   // $282E2A descriptor
  ram.setU32(base + 0x06, 0xfc00fe00);                 // $282E32 renderOffs (final)
  ram.setU16(base + 0x0e, 0x0410);                     // $282E3A graphic (final)
  ram.setU32(base + REC.continuation, 0x282e4a);       // $282E40
});
CONTINUATIONS.set(0x282e4a, (ctx, base) => {
  // $282E4A the ring steps UNCONDITIONALLY -- no bit-11 flip-flop gate here.
  animateRenderOffsWrap(ctx, base, 0x1c0e0c, 0x24, 0x1c0e9c);   // $282E4A/$282E52
  decelBlock(ctx, base);                               // $282E64..$282E88
  advance40(ctx, base);                                // $282E8A lea $40(A6)
  // ($282E94 release stub and $282EAA free-slot stub are UNREACHABLE from here.)
});

// ----- kind 24 ($282EBC init / $282EF0 cont) -- one-frame launch delay + decel
INIT_BODIES.set(0x282ebc, (ctx, base) => {
  const { ram } = ctx;
  clearDispatch(ram, base);                            // $282EBC andi.b #$fe,(A6)
  ram.setU32(base + 0x0a, 0x1c1e38);                   // $282EC0 descriptor
  ram.setU32(base + 0x06, 0xfc00fe00);                 // $282EC8 renderOffs
  ram.setU16(base + 0x0e, 0x0410);                     // $282ED0 graphic
  ram.setU8(base + 0x1d, 0x1a);                        // $282ED6
  ram.setU32(base + 0x30, ram.u32(base + REC.velA));   // $282EDC save velocity
  ram.setU32(base + REC.velA, 0);                      // $282EE2 clr.l $1e(A6)
  ram.setU32(base + REC.continuation, 0x282ef0);       // $282EE6
});
CONTINUATIONS.set(0x282ef0, (ctx, base) => {
  const { ram } = ctx;
  // $282EF2 btst #3,$34(A6) / $282EF6 beq $282F46 -- CLEAR means "not launched
  // yet", and unlike kind 22 that arm is the RELEASE, not a track.
  if ((ram.u8(base + 0x34) & 0x08) === 0) {
    ram.setU8(base + 0x34, ram.u8(base + 0x34) | 0x08);   // $282F46 bset #3,$34
    ram.setU32(base + REC.velA, ram.u32(base + 0x30));    // $282F4C restore velocity
    advance40(ctx, base);                                 // $282F52 lea $40(A6)
    return;                                               // NOTE: no decel this frame
  }
  // $282EF8 bchg #3,(A6) / bne $282F16 -- the bit-11 flip-flop halves the ring rate.
  if (ram.bchg8(base, 3) === 0) {
    animateRenderOffsWrap(ctx, base, 0x1c1ec8, 0x24, 0x1c2108);   // $282EFC/$282F04
  }
  decelBlock(ctx, base);                               // $282F16..$282F3A
  advance40(ctx, base);                                // $282F3C lea $40(A6)
  // ($282F5C free-slot stub is UNREACHABLE from here -- no branch targets it.)
});

// ================================================ W27 FAMILIES G + L
//
// The WALL BOUNCERS: kinds 25 ($282F6E), 29 ($28330C) and 34 ($28371C).  The
// recon split these across two families ("G. the wall-bouncer" and "L. the
// bouncer variant ... 29 uses `addi.b #$80`; 34 uses neg+80").  The listing says
// that is backwards and incomplete, so here is the measured table:
//
//   kind | left ($200)  | right ($3600) | top ($600)  | bottom ($6E00) | velocity
//   -----+--------------+---------------+-------------+----------------+---------
//    25  | dir = -dir   | dir = -dir    | UNREACHABLE | dir = $80-dir  | full
//    29  | dir = $40    | dir = $C0     | dir = $00   | dir = $80      | asr.w #1
//    34  | dir = dir+$80| dir = dir+$80 | dir = dir+$80| dir = dir+$80 | full
//
// So kind 29 does not `addi.b #$80` at all -- it SETS an absolute direction per
// wall, i.e. it does not reflect, it snaps to the axis.  Kind 34 is the one that
// adds $80 (a flat 180 degree flip on every wall).  Kind 25 reflects with
// `neg.b` on the vertical walls and `neg.b`+`addi.b #$80` on the bottom.  Only
// kind 29 halves the recomputed velocity on impact.
//
// KIND 25 HAS NO TOP WALL, AND ITS TOP-BOUNCE CODE IS STILL THERE.  At $282FEC
// `bcc.w $28302A` sends posA >= $600 to the bottom test and $282FF0 `bra.w
// $283064` sends posA < $600 straight to the animation -- so the block at
// $282FF4 (a top bounce that scales velocity to 3/4 via `asr.w #2` + `sub.w`)
// is never entered.  Kinds 29 and 34 fall THROUGH into their equivalent block;
// kind 25 has an extra `bra` in the way.  This is the mirror image of the
// fall-through trap and it needs the same discipline: `tools/oracle/
// w27targets.py` finds 0 instructions in $281000..$285000 that reference
// $282FF4, and a raw search finds it nowhere in the image as a longword
// pointer, so it is not a jump-table entry either.  It is NOT ported.
//
// The three initialisers are identical apart from the continuation address, and
// none of them calls $2820CC -- no muzzle offset for a bouncer.
//
// THE DESCRIPTOR ARITHMETIC CHECKS OUT AGAINST ITSELF, which is worth writing
// down because it is independent evidence the constants were read correctly:
// the initialiser sets +$0A = $1C1B68 and the pre-bounce ring runs $1C1B68 ->
// limit $1C1E38 (wrap to $1C1BF8); a bounce adds exactly $2D0, and
// $1C1B68 + $2D0 = $1C1E38 -- the bounce lands the descriptor on the boundary
// between the two rings, and the post-bounce ring ($2C now 0) is limit $1C2108
// / wrap $1C1EC8.  Two independently-read constants meeting exactly.

/** `$283064` / `$2833E2` / `$283802` -- the bouncers' shared animation tail.
 *  The delay byte +$19 gates it, and the ring's limit/wrap PAIR depends on
 *  whether any bounce budget is left at +$2C. */
function bouncerTail(ctx, base) {
  const { ram } = ctx;
  if (tick19(ram, base)) { advance40(ctx, base); return; }  // $283064/$2830A4
  let limit = 0x1c1e38, wrap = 0x1c1bf8;               // $28306A/$283070
  if (ram.u16(base + 0x2c) === 0) {                    // $283076 tst.w $2c / bne
    limit = 0x1c2108; wrap = 0x1c1ec8;                 // $28307E/$283084
  }
  animateRenderOffsWrap(ctx, base, wrap, 0x24, limit);  // $28308A..$283098
  advance40(ctx, base);                                // $28309A lea $36(A6)
}

/** the shared bouncer continuation.  `spec.left/right/top/bottom` are the four
 *  wall arms; a null arm is code the body cannot reach (kind 25's top).  Each
 *  arm is `{dir, attr}`: the direction transform and the `eori.b` on +$1C.
 *  `spec.shift` is the `asr.w #n` applied to the recomputed velocity. */
function wallBounce(ctx, base, spec) {
  const { ram } = ctx;
  if (ram.u16(base + 0x2c) === 0) { bouncerTail(ctx, base); return; }  // $282F9E beq
  const d0 = ram.u32(base + REC.posA);                 // $282FA6 move.l $2(A6),D0
  const posB = d0 & 0xffff;                            // the LOW word of the pair
  const posA = (d0 >>> 16) & 0xffff;                   // the HIGH word ($282FE6 swap)
  let arm = null;
  if (posB < 0x0200) arm = spec.left;                  // $282FAA cmpi.w #$200 / bcc
  else if (posB > 0x3600) arm = spec.right;            // $282FC8 cmpi.w #$3600 / bls
  else if (posA < 0x0600) arm = spec.top;              // $282FE8 cmpi.w #$600 / bcc
  else if (posA > 0x6e00) arm = spec.bottom;           // $28302A cmpi.w #$6E00 / bls
  if (!arm) { bouncerTail(ctx, base); return; }        // no wall -> straight to the tail
  ram.setU8(base + REC.dir, arm.dir(ram.u8(base + REC.dir)) & 0xff);   // $282FBA
  ram.setU8(base + 0x1c, ram.u8(base + 0x1c) ^ arm.attr);   // $282FBE eori.b on +$1C
  velRecomputeStore(ctx, base, spec.shift);            // $283048..$283052
  ram.setU32(base + 0x0a, (ram.u32(base + 0x0a) + 0x2d0) >>> 0);   // $283058
  ram.setU16(base + 0x2c, u16(ram.u16(base + 0x2c) - 1));          // $283060 subq.w
  bouncerTail(ctx, base);                              // falls through to $283064
}

/** the three bouncers' shared initialiser ($282F6E == $28330C == $28371C apart
 *  from the continuation address).  Note the continuation is installed BEFORE
 *  bit 8 is cleared, and there is no `bsr $2820CC`. */
function bouncerInit(ctx, base, cont) {
  const { ram } = ctx;
  ram.setU16(base + 0x2c, 0x0001);                     // $282F6E move.w #$1,$2c
  ram.setU32(base + REC.continuation, cont);           // $282F74
  clearDispatch(ram, base);                            // $282F7C andi.b #$fe,(A6)
  ram.setU32(base + 0x0a, 0x1c1b68);                   // $282F80 descriptor
  ram.setU32(base + 0x06, 0xfc00fe00);                 // $282F88 renderOffs
  ram.setU16(base + 0x0e, 0x0410);                     // $282F90 graphic
  ram.setU8(base + 0x1d, 0x1a);                        // $282F96
}

// ----- kind 25 ($282F6E init / $282F9E cont) -- reflecting, no top wall
const NEG = (d) => -d;                                 // $282FB8 neg.b d1
const NEG80 = (d) => 0x80 - d;                         // $283032 neg.b + addi.b #$80
INIT_BODIES.set(0x282f6e, (ctx, base) => bouncerInit(ctx, base, 0x282f9e));
CONTINUATIONS.set(0x282f9e, (ctx, base) => wallBounce(ctx, base, {
  left:   { dir: NEG,    attr: 0x40 },                 // $282FB2..$282FBE
  right:  { dir: NEG,    attr: 0x40 },                 // $282FD0..$282FDC
  top:    null,                                        // $282FF4 UNREACHABLE
  bottom: { dir: NEG80,  attr: 0x20 },                 // $283032..$283042
  shift: 0,                                            // $283048 no asr
}));

// ----- kind 29 ($28330C init / $28333C cont) -- snaps to an axis, half speed
INIT_BODIES.set(0x28330c, (ctx, base) => bouncerInit(ctx, base, 0x28333c));
CONTINUATIONS.set(0x28333c, (ctx, base) => wallBounce(ctx, base, {
  left:   { dir: () => 0x40, attr: 0x40 },             // $283350 move.w #$40,D1
  right:  { dir: () => 0xc0, attr: 0x40 },             // $28336A move.w #$C0,D1
  top:    { dir: () => 0x00, attr: 0x20 },             // $283386 move.w #$0,D1
  bottom: { dir: () => 0x80, attr: 0x20 },             // $2833B4 move.w #$80,D1
  shift: 1,                                            // $2833CC/$2833CE asr.w #1
}));

// ----- kind 34 ($28371C init / $28374C cont) -- a flat 180 flip on every wall
const FLIP180 = (d) => d + 0x80;                       // $283766 addi.b #$80,d1
INIT_BODIES.set(0x28371c, (ctx, base) => bouncerInit(ctx, base, 0x28374c));
CONTINUATIONS.set(0x28374c, (ctx, base) => wallBounce(ctx, base, {
  left:   { dir: FLIP180, attr: 0x40 },                // $283760..$28376E
  right:  { dir: FLIP180, attr: 0x40 },                // $283780..$28378E
  top:    { dir: FLIP180, attr: 0x20 },                // $2837A2..$2837B0
  bottom: { dir: FLIP180, attr: 0x20 },                // $2837D2..$2837E0
  shift: 0,                                            // $2837EC no asr
}));

// ================================================ W27 FAMILY I
//
// The LAUNCHERS: kinds 30 ($283430) and 31 ($2834FE).  A byte-for-byte
// comparison of the two 206-byte bodies finds **12 differing bytes, and all 12
// are PC-relative displacements or the continuation address**.  The two kinds
// are the same behaviour compiled twice at two addresses; there is no
// behavioural difference to find, and knowing that is what stops the next
// reader hunting for one.
//
// The initialiser is kind 23's shape (muzzle, dead sprite write, descriptor
// $1C0E0C, $FC00FE00/$410) plus a PRECOMPUTED ACCELERATION VECTOR:
//
//   $283478  D0 = speed (+$1A)
//   $283480  D1 = dir (+$1B) ... $283484 `sub.b $37(A6),D1`
//   $283488  bsr $284190      -- velocity(speed, dir - +$37)
//   $28348C  asr.w #3 on both -- one eighth
//   $283490  +$30 = dA, +$32 = dB
//
// THE ACCELERATION IS NOT ALONG THE BULLET'S HEADING.  `sub.b $37(A6),D1`
// offsets the direction by the +$37 byte from the spawn record before the
// velocity is computed, so the bullet accelerates along one angle while flying
// along another -- a curve, not a speed-up.  The recon recorded this as
// "precomputes a slowed (>>3) velocity", which is the magnitude and not the
// direction; ported that way with +$37 ignored, every kind-30/31 bullet would
// accelerate straight ahead.
//
// The continuation is the DECEL BLOCK'S MIRROR and it is worth naming the
// differences, because the two look identical at a glance:
//
//   family F (kinds 23/24)  duration at +$36   velA -= +$2E        (one axis)
//   family I (kinds 30/31)  duration at +$34   velA += +$30,
//                                              velB += +$32        (both axes)
//
// Same three-state `tst.w / beq / bmi` gate, same +$2C/+$2D byte countdown.
// $2834EC and $2835BA are dead free-slot stubs (0 references, checked).

/** `$2834B4` / `$283582` -- family I's acceleration block.  See `decelBlock`
 *  for the identical three-state duration gate; the fields are NOT the same. */
function accelBlock(ctx, base) {
  const { ram } = ctx;
  const dur = ram.u16(base + 0x34);                    // $2834B4 tst.w $34(A6)
  if (dur === 0) return;                               // $2834B8 beq -> skip all
  if ((dur & 0x8000) === 0) {                          // $2834BC bmi -> skip the dec
    ram.setU16(base + 0x34, u16(dur - 1));             // $2834C0 subq.w #1,$34
  }
  if (!byteUnderflow(ram, base, 0x2c, 0x2d)) return;   // $2834C4/$2834C8 bcc
  ram.setU16(base + REC.velA,
    u16(ram.u16(base + REC.velA) + ram.u16(base + 0x30)));   // $2834D2/$2834D6
  ram.setU16(base + REC.velB,
    u16(ram.u16(base + REC.velB) + ram.u16(base + 0x32)));   // $2834DA/$2834DE
}

/** the launchers' shared initialiser ($283430 == $2834FE apart from the
 *  continuation address and four PC-relative displacements). */
function launcherInit(ctx, base, cont) {
  const { ram, rom } = ctx;
  muzzleAndSprite(ctx, base);                          // $28343E bsr $2820CC
  clearDispatch(ram, base);                            // $283442 andi.b #$fe,(A6)
  ram.setU8(base + 0x1d, 0x1a);                        // $283446
  ram.setU32(base + 0x06, 0xfe00fe00);                 // $28344C  (dead: overwritten)
  ram.setU16(base + 0x0e, 0x0210);                     // $283454  (dead: overwritten)
  ram.setU32(base + 0x0a, 0x1c0e0c);                   // $28345A descriptor
  ram.setU32(base + 0x06, 0xfc00fe00);                 // $283462 renderOffs (final)
  ram.setU16(base + 0x0e, 0x0410);                     // $28346A graphic (final)
  ram.setU32(base + REC.continuation, cont);           // $283470
  // $283478..$283494 the acceleration vector, at ONE EIGHTH and along the
  // OFFSET direction `dir - +$37`, not along the bullet's own heading.
  const speed = ram.u8(base + REC.speed);              // $28347A move.b $1a(A6),D0
  const dir = (ram.u8(base + REC.dir) - ram.u8(base + 0x37)) & 0xff;  // $283484 sub.b
  const v = velocity(rom, speed, dir);                 // $283488 bsr $284190
  ram.setU16(base + 0x30, u16(i16(v.dA) >> 3));        // $28348C asr.w #3 ; $283490
  ram.setU16(base + 0x32, u16(i16(v.dB) >> 3));        // $28348E asr.w #3 ; $283494
}

/** the launchers' shared continuation ($28349A == $283568). */
function launcherCont(ctx, base) {
  animateRenderOffsWrap(ctx, base, 0x1c0e0c, 0x24, 0x1c0e9c);  // $28349A/$2834A2
  accelBlock(ctx, base);                               // $2834B4..$2834E0
  advance40(ctx, base);                                // $2834E2 lea $40(A6)
}

// ----- kind 30 ($283430 init / $28349A cont)
INIT_BODIES.set(0x283430, (ctx, base) => launcherInit(ctx, base, 0x28349a));
CONTINUATIONS.set(0x28349a, launcherCont);

// ----- kind 31 ($2834FE init / $283568 cont) -- the same body, compiled twice
INIT_BODIES.set(0x2834fe, (ctx, base) => launcherInit(ctx, base, 0x283568));
CONTINUATIONS.set(0x283568, launcherCont);

// ================================================ W27 FAMILY K
//
// Kind 33 ($2836A8) -- the SLOW-CLOCK sprite ring.  The only body in the wave
// that indexes a ROM table with a value it keeps in the record, so it is the
// only one that needed a new window.
//
// init: no muzzle call, no renderOffs/graphic write at all -- just bit 8,
// descriptor $1C01AC, +$1D, and two counters.  `move.w #$14,$2c` and
// `move.w #$101,$2e`:
//
//   +$2C is read back as a WORD (`move.w $2c(A6),D0`, `subq.w #$4,$2c`), so it
//        genuinely holds $0014 -- this is NOT the big-endian counter/reload
//        half-swap that families C and D have.  Check how the field is READ
//        before assuming which trap applies.
//   +$2E/+$2F IS the byte pair (counter $01, reload $01), read by
//        `subq.b #1,$2e` with reload from +$2F.  Both halves are 1, so the
//        swap would have been invisible here; it is written down because the
//        next body with `move.w #$0104` will not be so forgiving.
//
// cont ($2836D0): every other frame (the +$2E underflow), take the longword at
// `$283704 + (+$2C)` as the descriptor, then `subq.w #$4,$2c / bcc`, and on
// BORROW reset +$2C to $C -- not to $14.
//
// SO THE RING IS NOT THE TABLE.  Starting at $14 the indices run
// $14, $10, $C, $8, $4, $0 and then wrap to **$C**, so the first pass uses all
// six entries and every pass afterwards uses only four ($C, $8, $4, $0).  The
// two entries at $14 and $10 are a LEAD-IN that plays exactly once per bullet.
// Reading `subq.w #$4 / bcc / move.w #$C` as "wrap the ring" gives a six-entry
// loop and a permanently wrong animation phase.
//
// The table's extent is settled by an abutting bound: the highest index the
// body can produce is $14, the read is a longword, and $283704 + $18 = $28371C
// -- exactly where kind 34's body begins.  Six entries, and the ring's own
// wrap constant ($C) is inside it.

INIT_BODIES.set(0x2836a8, (ctx, base) => {
  const { ram } = ctx;
  clearDispatch(ram, base);                            // $2836A8 andi.b #$fe,(A6)
  ram.setU32(base + 0x0a, 0x1c01ac);                   // $2836AC descriptor
  ram.setU8(base + 0x1d, 0x1a);                        // $2836B4
  ram.setU16(base + 0x2c, 0x0014);                     // $2836BA the table INDEX (word)
  ram.setU16(base + 0x2e, 0x0101);                     // $2836C0 counter $01 / reload $01
  ram.setU32(base + REC.continuation, 0x2836d0);       // $2836C6
});
CONTINUATIONS.set(0x2836d0, (ctx, base) => {
  const { ram, rom } = ctx;
  // $2836D0 subq.b #1,$2e / bcc $2836FA -- fires on UNDERFLOW, reload from +$2F.
  if (!byteUnderflow(ram, base, 0x2e, 0x2f)) { advance40(ctx, base); return; }
  const idx = ram.u16(base + 0x2c);                    // $2836DE move.w $2c(A6),D0
  ram.setU32(base + 0x0a, rom.u32(0x283704 + idx));    // $2836E2/$2836EA move.l (A0),$a
  // $2836EE subq.w #$4,$2c / bcc -- on BORROW (index was 0) reset to $C, NOT $14.
  const next = ram.u16(base + 0x2c) - 4;
  ram.setU16(base + 0x2c, u16(next));
  if (next < 0) ram.setU16(base + 0x2c, 0x000c);       // $2836F4 move.w #$c,$2c
  advance40(ctx, base);                                // $2836FA lea $40(A6)
});

// ================================================ W27 FAMILY H (core)
//
// Kinds 26 ($2830B2), 27 ($283148) and 32 ($2835CC).  The recon described this
// family as one shape -- "optional trail emit, +$30 countdown gate, then pos +=
// +$28/+2A pair, counter +$2C -> dir += +$2E, counter +$36 -> speed += +$38,
// recompute+store velocity".  That is kind 27 exactly, kind 32 with two pieces
// removed, and **kind 26 not at all**: kind 26 has no drift, no steering and no
// velocity recompute.  It is a sprite ring whose limit lives in the record.
//
// THE STEER DELTAS ARE BYTES READ OUT OF WORDS.  `move.w $2e(A6),D0` then
// `add.b D0,$1b(A6)`: the ADD IS A BYTE add, so what reaches the direction is
// D0's low byte -- the byte at +$2F, not the word at +$2E.  Same for speed and
// +$38/+$39.
//
// AND IT MAKES NO DIFFERENCE, which is worth saying rather than implying
// otherwise: the destination is a BYTE, so `(dir + D0.w) & $FF` and
// `(dir + D0.b) & $FF` are the same value.  A mutation replacing the low-byte
// mask with the whole word was run and stayed GREEN, correctly -- it is an
// equivalent rewrite, not a missed check.  The transcription keeps the `& 0xff`
// because that is the instruction; nobody should read a behavioural claim into
// it.
//
// KIND 26 tail-jumps `bra.w $283C8C`, which is the FIRST dispatch ever to reach
// that epilogue (`w27targets.py` finds exactly one reference to it in the whole
// range, and it is kind 26's).  W26 transcribed it as `epi283C8C`; it has sat
// unexercised ever since, exactly as `epi2822AE` had before family B reached it.
// Re-read against the listing this session: `$283C8C` clears bit 8, writes
// renderOffs $FE00FE00 and graphic $210, then `bra.b $283C20` into the MIDDLE of
// the `$283C0E` epilogue -- so it skips $283C0E's own $FC00FE00/$410 and runs
// only the direction lookup. The transcription was right. Its window was not:
// the `$2830EA` table it reads had never been exported.
//
// KIND 26'S RING LIMIT COMES OUT OF THE EPILOGUE.  `$283C42/$283C46` set
// +$10 = descriptor + (+$14), and kind 26's initialiser sets +$14 = $3C. The
// continuation steps the descriptor by $14 and subtracts +$14 ($3C) when it
// reaches +$10 -- a THREE-frame ring ($3C / $14) whose bounds are carried in the
// record rather than written as constants. Two fields set in two different
// routines, and neither makes sense without the other.
//
// AND `move.b (A0)+,(A0)+` AT $28312E IS +$19 = +$18.  Source read with
// post-increment, then destination written with post-increment, so with A0 at
// +$18 it copies +$18 into +$19: the animation delay reloads itself from its own
// reload byte every time it animates. Read as a no-op (it looks like one), kind
// 26 animates every frame instead of every other frame.
//
// KIND 27 STARTS AT A GLOBAL-DEPENDENT ANIMATION FRAME.  `$28316C move.w
// $80390A,D0 / lsr.w #2 / andi.w #3` then a `dbra` loop adding $24 -- so the
// descriptor starts at $1BFED0 + $24*(D0+1), one of four phases chosen by a
// global counter. Two kind-27 bullets spawned on different frames are not in
// the same animation phase, and nothing in the record records which.
//
// KIND 27 ALSO DESTROYS ITS OWN SAVED VELOCITY.  `$28315A move.l $1e,$30` saves
// velA:velB, `$283160 clr.l $1e` clears it -- and then `$28318C move.w #$20,$30`
// OVERWRITES the saved velA half with a $20 countdown. Nothing ever restores
// +$1E from +$30. So unlike kinds 19/22/24, this is not a launch delay: the
// bullet has NO stored velocity until its first steer fires and recomputes one.

/** `$2831CC..$283250` / `$283630..$283686` -- family H's drift-and-steer core.
 *  Position drifts by the +$28/+$2A word pair; two byte countdowns bend the
 *  direction and the speed; and the velocity is recomputed and stored only if
 *  one of them fired (the D1 "dirty" flag). */
function driftAndSteer(ctx, base) {
  const { ram } = ctx;
  // $2831CC movem.w $28(A6),D0-D1 -> D0 = +$28 word, D1 = +$2A word
  ram.setU16(base + REC.posA,
    u16(ram.u16(base + REC.posA) + ram.u16(base + 0x28)));     // $2831D2 add.w D0,$2
  ram.setU16(base + REC.posB,
    u16(ram.u16(base + REC.posB) + ram.u16(base + 0x2a)));     // $2831D6 add.w D1,$4
  let dirty = false;                                           // $2831DA moveq #0,D1
  // $2831DC the TURN: byte countdown +$2C, reload +$2D, dir += the LOW BYTE of
  // the +$2E word (`move.w $2e,D0` then `add.b D0,$1b` -- a BYTE add).
  if (byteUnderflow(ram, base, 0x2c, 0x2d)) {
    const d0 = ram.u16(base + 0x2e);                           // $2831EA
    ram.setU8(base + REC.dir, (ram.u8(base + REC.dir) + (d0 & 0xff)) & 0xff);  // $2831EE
    dirty = true;                                              // $2831F2 moveq #1,D1
  }
  // $2831F4 the ACCEL: byte countdown +$36, reload +$37, speed += the LOW BYTE
  // of the +$38 word.
  if (byteUnderflow(ram, base, 0x36, 0x37)) {
    const d0 = ram.u16(base + 0x38);                           // $283202
    ram.setU8(base + REC.speed, (ram.u8(base + REC.speed) + (d0 & 0xff)) & 0xff);  // $283206
    dirty = true;                                              // $28320A
  }
  // $28320C tst.w D1 / beq -- recompute ONLY when something changed.  $283212..
  // $28324E is `$284190`'s body INLINED (same $200920 / $283F50 / $2841C2
  // triple); `velocity()` is that function.
  if (dirty) velRecomputeStore(ctx, base);                     // $283250 movem.w
}

// ----- kind 26 ($2830B2 init / $28310E cont) -- a ring whose limit is in the record
INIT_BODIES.set(0x2830b2, (ctx, base) => {
  const { ram } = ctx;
  muzzleAndSprite(ctx, base);                          // $2830C0 bsr $2820CC
  ram.setU8(base + 0x1d, 0x1a);                        // $2830C4
  ram.setU32(base + 0x14, 0x0000003c);                 // $2830CA the ring SPAN
  ram.setU16(base + 0x18, 0x0101);                     // $2830D2 delay $01 / reload $01
  ram.setU32(base + REC.continuation, 0x28310e);       // $2830D8
  epi283C8C(ctx, base, 0x2830ea);                      // $2830E6 bra.w $283C8C
});
CONTINUATIONS.set(0x28310e, (ctx, base) => {
  const { ram } = ctx;
  if (tick19(ram, base)) { advance40(ctx, base); return; }   // $28310E/$28313A
  // $283118 D0 = descriptor ; $28311E += $14 ; $283124 cmp against +$10 (the
  // limit the epilogue computed) ; on equality subtract +$14 (the span).
  let d0 = (ram.u32(base + 0x0a) + 0x14) >>> 0;
  if (d0 === ram.u32(base + 0x10)) d0 = (d0 - ram.u32(base + 0x14)) >>> 0;  // $283128
  ram.setU32(base + 0x0a, d0);                         // $28312C move.l D0,(A6)
  // $28312E move.b (A0)+,(A0)+ with A0 at +$18 -- this is +$19 = +$18.
  ram.setU8(base + 0x19, ram.u8(base + 0x18));
  advance40(ctx, base);                                // $283130 lea $36(A6)
});

// ----- kinds 27, 36, 37 and 38 -- ONE body, four times, four rings
//
// A byte-for-byte compare of the four $118-byte bodies against kind 27's finds
// 15, 16 and 17 differing bytes, and every one of them is either a PC-relative
// displacement or one of exactly FOUR constants: the descriptor BASE, the
// continuation address, the ring LIMIT and the ring WRAP.  So they are one
// behaviour with four animation ranges:
//
//   kind | init base | wrap    | limit   | the ring
//   -----+-----------+---------+---------+------------------------
//    27  | $1BFED0   | $1BFEF4 | $1BFF84 | [$1BFEF4, $1BFF84)
//    36  | $1BFF60   | $1BFF84 | $1C0014 | [$1BFF84, $1C0014)
//    37  | $1BFFF0   | $1C0014 | $1C00A4 | [$1C0014, $1C00A4)
//    38  | $1C0080   | $1C00A4 | $1C0134 | [$1C00A4, $1C0134)
//
// FOUR CONSECUTIVE $90-BYTE RINGS, and in every row `init base + $24 == wrap`
// and `wrap + $90 == limit` -- four frames each.  That is twelve constants read
// separately out of four listings agreeing on one pattern, which is the kind of
// evidence a single transcription cannot give you.  Note the initialiser's base
// is one step BELOW the ring, because the phase loop always runs at least once.
function driftBodyInit(ctx, base, { animBase, cont }) {
  const { ram } = ctx;
  clearDispatch(ram, base);                            // $283148 andi.b #$fe,(A6)
  ram.setU32(base + 0x0a, 0x1c01ac);                   // $28314C  (dead: overwritten)
  ram.setU8(base + 0x1d, 0x1a);                        // $283154
  ram.setU32(base + 0x30, ram.u32(base + REC.velA));   // $28315A save velocity...
  ram.setU32(base + REC.velA, 0);                      // $283160 ...and clear it
  ram.setU32(base + 0x0a, animBase);                   // $283164 descriptor base
  // $28316C..$283180: the starting animation phase comes from a GLOBAL.
  const phase = (ram.u16(0x80390a) >>> 2) & 0x3;       // $283172 lsr.w #2 / andi.w #3
  for (let i = 0; i <= phase; i++) {                   // $283178 dbra: D0+1 times
    ram.setU32(base + 0x0a, (ram.u32(base + 0x0a) + 0x24) >>> 0);
  }
  ram.setU32(base + REC.continuation, cont);           // $283184
  ram.setU16(base + 0x30, 0x0020);                     // $28318C OVERWRITES saved velA
}
function driftBodyCont(ctx, base, { wrap, limit }) {
  const { ram } = ctx;
  trailEmit(ctx, base);                                // $283194..$2831A6
  animateRenderOffsWrap(ctx, base, wrap, 0x24, limit); // $2831AC/$2831B2
  // $2831C0 tst.w $30 / beq -- the drift/steer block is gated AND time-limited.
  const n = ram.u16(base + 0x30);
  if (n === 0) { advance40(ctx, base); return; }       // $2831C4 beq $283256
  ram.setU16(base + 0x30, u16(n - 1));                 // $2831C8 subq.w #1,$30
  driftAndSteer(ctx, base);                            // $2831CC..$283250
  advance40(ctx, base);                                // $283256 lea $40(A6)
}
const DRIFT_BODIES = [
  // kind, init,      cont,      animBase, wrap,     limit
  [27, 0x283148, 0x283194, 0x1bfed0, 0x1bfef4, 0x1bff84],
  [36, 0x2838c6, 0x283912, 0x1bff60, 0x1bff84, 0x1c0014],
  [37, 0x2839de, 0x283a2a, 0x1bfff0, 0x1c0014, 0x1c00a4],
  [38, 0x283af6, 0x283b42, 0x1c0080, 0x1c00a4, 0x1c0134],
];
for (const [, init, cont, animBase, wrap, limit] of DRIFT_BODIES) {
  INIT_BODIES.set(init, (ctx, base) => driftBodyInit(ctx, base, { animBase, cont }));
  CONTINUATIONS.set(cont, (ctx, base) => driftBodyCont(ctx, base, { wrap, limit }));
}

// ----- kind 35 ($283850 init / $28388A cont) -- the SPEED RAMP, a bit-7 body
//
// Kind 35 is one of the six kinds whose template sets type-word bit 7, so the
// mover RECOMPUTES its velocity from speed/dir every single frame and never
// reads +$1E.  That is what makes this body work: the initialiser sets
// `move.b #$0,$1a(A6)` -- SPEED ZERO -- and the continuation adds 1 to it every
// fifth animating frame.  The bullet is motionless when it appears and winds up.
//
// It carries the same `move.l $1e,$30` / `clr.l $1e` as kinds 19/22/24/27, and
// here the save is doubly vestigial: nothing restores +$30, AND a bit-7 bullet
// never consults +$1E in the first place.  Four bodies now share that idiom and
// only two of them (19, 22) actually use it as a launch delay.
//
// The +$28/+$29 pair is `move.w #$404` -- counter $04, reload $04 -- and it is
// the byte-underflow flavour, so the first speed step lands on the FIFTH
// animating frame, not the fourth.  Animating frames are every other frame (the
// bit-11 flip-flop at $28388C) and bit 11 is CLEAR after the initialiser, so the
// FIRST continuation frame animates: frames 1,3,5,7,9 -- the first acceleration
// is NINE frames in, not ten.  (Ten was the number written down before it was
// run; the flip-flop's starting phase is the difference.)
INIT_BODIES.set(0x283850, (ctx, base) => {
  const { ram } = ctx;
  clearDispatch(ram, base);                            // $283850 andi.b #$fe,(A6)
  ram.setU32(base + 0x0a, 0x1c01ac);                   // $283854  (dead: overwritten)
  ram.setU8(base + 0x1d, 0x1a);                        // $28385C
  ram.setU32(base + 0x30, ram.u32(base + REC.velA));   // $283862 save (vestigial)
  ram.setU32(base + REC.velA, 0);                      // $283868 clr.l $1e
  ram.setU32(base + REC.continuation, 0x28388a);       // $28386C
  ram.setU32(base + 0x0a, 0x1c0014);                   // $283874 descriptor (final)
  ram.setU16(base + 0x28, 0x0404);                     // $28387C counter $04 / reload $04
  ram.setU8(base + REC.speed, 0x00);                   // $283882 SPEED = 0
});
CONTINUATIONS.set(0x28388a, (ctx, base) => {
  const { ram } = ctx;
  if (ram.bchg8(base, 3) !== 0) { advance40(ctx, base); return; }   // $28388C/$28388E
  if (byteUnderflow(ram, base, 0x28, 0x29)) {          // $283890/$283894/$283898
    ram.setU8(base + REC.speed, (ram.u8(base + REC.speed) + 1) & 0xff);  // $28389E
  }
  animateRenderOffsWrap(ctx, base, 0x1c0014, 0x24, 0x1c00a4);  // $2838A2/$2838AA
  advance40(ctx, base);                                // $2838BC lea $40(A6)
});

// ----- kind 32 ($2835CC init / $283616 cont) -- the same core, ungated
INIT_BODIES.set(0x2835cc, (ctx, base) => {
  const { ram } = ctx;
  muzzleAndSprite(ctx, base);                          // $2835DA bsr $2820CC
  clearDispatch(ram, base);                            // $2835DE
  ram.setU8(base + 0x1d, 0x1a);                        // $2835E2
  ram.setU32(base + 0x06, 0xfe00fe00);                 // $2835E8  (dead: overwritten)
  ram.setU16(base + 0x0e, 0x0210);                     // $2835F0  (dead: overwritten)
  ram.setU32(base + 0x0a, 0x1c0944);                   // $2835F6 descriptor
  ram.setU32(base + 0x06, 0xfc00fe00);                 // $2835FE renderOffs (final)
  ram.setU16(base + 0x0e, 0x0410);                     // $283606 graphic (final)
  ram.setU32(base + REC.continuation, 0x283616);       // $28360C
});
CONTINUATIONS.set(0x283616, (ctx, base) => {
  animateRenderOffsWrap(ctx, base, 0x1c0944, 0x24, 0x1c09d4);  // $283616/$28361E
  driftAndSteer(ctx, base);                            // $283630..$283686
  advance40(ctx, base);                                // $28368C lea $40(A6)
  // ($283696 free-slot stub is UNREACHABLE -- 0 references.)
});

// ================================================ W27 FAMILY J
//
// Kind 28 ($283260) -- the SPLITTER, and the last body in the $282030 table.
//
// **ITS COUNTDOWN IS THE OPPOSITE OF EVERY OTHER ONE IN THIS WAVE.**  Families
// C, D, F, H, I and K all use `subq.b #1,off / bcc`, which fires on UNDERFLOW --
// the borrow only happens when the byte was ALREADY 0.  Kind 28 uses
//
//     $283290  tst.b $28(A6) / beq   -- already spent?  skip forever
//     $283298  subq.b #1,$28(A6)
//     $28329C  bne                   -- FIRE when the byte REACHES ZERO
//
// `bne`, not `bcc`.  So +$28 = $14 counts 20 frames and fires on the 20th, and
// the `tst.b / beq` in front makes it a ONE-SHOT: once the byte is 0 the arm is
// never entered again.  Applying this wave's own rule ("countdowns fire on
// underflow") here would fire a frame late and then fire again every 256 frames
// forever.  The RULE IS THE INSTRUCTION, not the family.
//
// `move.w #$1410,$28` seeds +$28 = $14 (the counter) and +$29 = $10.  Nothing in
// this body reads +$29; it is left for whatever consumes the record downstream.
//
// The animation tail is the WALL BOUNCERS' tail ($2832D2 == $283064) with the
// budget-dependent pair removed: kind 28 always uses limit $1C1E38 / wrap
// $1C1BF8, and its descriptor base $1C1B68 is the bouncers' too.  Three families
// sharing one sprite ring.
//
// THE FIRE ARM IS A LOUD NAMED THROW, and this is the transcription of what it
// would do, so the next wave does not have to re-read it:
//
//     $2832A0  jsr $242748       re-aim at the player; returns CARRY on failure
//     $2832A6  bcs               carry -> no spawn, fall to the animation
//     $2832AA  jsr $242296
//     $2832B0  tst.w $8130DC / bne $2832C2   -- when that global is ZERO:
//     $2832BA    D1 = dir (+$1B) + $B0
//     $2832C2  D0 = the longword at +$2C, D2 = position (+$2), D3 = D4 = 0
//     $2832CE  jsr $2817C2       the bank-B spawn core
//
// `$242748`/`$242296` are the player-track subsystem and are not ported.  The
// spawn itself is wirable through `spawnCore`, but its direction argument comes
// out of `$242748`, so wiring it without the aim would invent every bullet it
// produces.  Throwing by address is the correct answer until the aim lands.

INIT_BODIES.set(0x283260, (ctx, base) => {
  const { ram } = ctx;
  ram.setU16(base + 0x28, 0x1410);                     // $283260 counter $14 / +$29 $10
  ram.setU32(base + REC.continuation, 0x283290);       // $283266
  clearDispatch(ram, base);                            // $28326E andi.b #$fe,(A6)
  ram.setU32(base + 0x0a, 0x1c1b68);                   // $283272 descriptor
  ram.setU32(base + 0x06, 0xfc00fe00);                 // $28327A renderOffs
  ram.setU16(base + 0x0e, 0x0410);                     // $283282 graphic
  ram.setU8(base + 0x1d, 0x1a);                        // $283288
});
CONTINUATIONS.set(0x283290, (ctx, base) => {
  const { ram } = ctx;
  // $283290 tst.b $28 / beq -- spent: this arm is a ONE-SHOT.
  const n = ram.u8(base + 0x28);
  if (n !== 0) {
    ram.setU8(base + 0x28, (n - 1) & 0xff);            // $283298 subq.b #1,$28
    if (((n - 1) & 0xff) === 0) {                      // $28329C bne -- fire at ZERO
      unreached(0x242748,
        `kind 28's SPLIT arm: the +$28 byte reached 0, so $2832A0 calls $242748 `
        + `(re-aim at the player; carry means "no target, skip the spawn"), then `
        + `$242296, then spawns through $2817C2 with D1 = the re-aimed direction `
        + `(+$B0 when $8130DC is zero), D0 = the longword at +$2C and D2 = this `
        + `bullet's position. The player-track subsystem is not ported, and the `
        + `spawn's direction comes out of it, so every bullet it produced would `
        + `be invented`);
    }
  }
  // $2832D2 the animation tail -- the wall bouncers' ($283064) with a fixed pair.
  if (tick19(ram, base)) { advance40(ctx, base); return; }   // $2832D2/$2832FE
  animateRenderOffsWrap(ctx, base, 0x1c1bf8, 0x24, 0x1c1e38);  // $2832D8..$2832F2
  advance40(ctx, base);                                // $2832F4 lea $36(A6)
});

export { INIT_BODIES, CONTINUATIONS };
