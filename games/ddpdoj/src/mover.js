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

export { INIT_BODIES, CONTINUATIONS };
