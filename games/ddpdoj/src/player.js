// THE PLAYER -- object dispatch types 2 ($2491C0, P1) and 3 ($249246, P2).
//
// The handler's entry does a one-time init (`bset #0,($3,A5)`) and then
// `bne $2494FA` every subsequent frame, so $2494FA IS the per-frame update and
// is what this file translates.  A6 = the player record: $8103E6 for P1,
// $810448 for P2 (stride $62).  A5 = the object slot; ($7,A5) = the player
// index.
//
// The ROM's own order, which a port MUST NOT rearrange:
//
//   1. read the input mirrors into ($18,A6) raw and ($19,A6) edge
//   2. CLEAR the velocity accumulators ($30/$32)
//   3. stick nibble -> angle byte through $2552DC
//   4. MOVE FIRST: $2417DE adds the vector straight into ($2,A6)/($4,A6)
//   5. re-read the moved position into D2/D3
//   6. CLAMP SECOND, per stick bit, and SUBTRACT THE OVERSHOOT FROM THE
//      ACCUMULATOR ($30/$32) so the recorded velocity is the applied one
//   7. store D2/D3 back
//   8. tail: the animation records, indexed by the tilt counter
//
// "Clamp then move" is the wrong port and it is only wrong AT THE WALL, which
// is why the fly-around scenario pins all four walls and why breaking this
// order is the wave's red validation.  The build-A memmap recon called out the
// same trap independently.

import { P, RAM, CLAMP, ROM } from './machine.js';
import { i16, u16 } from './ram.js';
import { unreached } from './unported.js';
import { spawnShot } from './shots.js';
import { drawShipShadow, SHIP_MUTATE } from './shipsprite.js';
import { fireBomb2498E2, BOMBRAM } from './bomb.js';

// Globals the player reads and the port does not write.  Seeded once and
// FROZEN for the run.  Listed by name so the runner can print them and a
// reviewer can see exactly which "constants" are really assumptions.
export const FROZEN_GLOBALS = [
  [0x812972, 'global freeze; non-zero jumps the whole update to $24A3A2'],
  [0x81296e, 'input mask; non-zero masks the stick to 4 bits at $249596'],
  [0x8130d2, 'movement disable; non-zero makes $2417FE return a zero vector'],
  [0x812954, 'the $2496CA -$48 nudge'],
  [0x81308c, 'gate on the post-store X adjust at $2496EE'],
  [0x80380f, 'operator setting gating the $2497AA bomb/hyper block'],
  // WAVE 13 REMOVED TWO FROM THIS LIST, because the port now writes both:
  //   $813176 -- "the amount that post-store X adjust subtracts".  It is
  //     $26151E, inside the background object's cross-axis routine $26146C,
  //     ported this wave (src/background.js).
  //   $8130CE -- was listed here as "bomb stock compared against 4 at
  //     $2497FE".  IT IS NOT BOMB STOCK.  It is THE DISTANCE CLOCK, the scroll
  //     odometer $26132C bumps once per $200 of scroll
  //     (20-recon-scroll-engine §3; 20-plan §2 W14 names this exact
  //     correction).  $2497FE really does compare it against 4, so the gate
  //     the port has been applying is accidentally right and stays as written
  //     -- but the NAME was wrong for eight waves and the real bomb stock is
  //     still unlocated (W28).
];

// THE RED-VALIDATION SEAM, and it is deliberately in the shipped file.
//
// `docs/knowledge/03`: a check that has never been seen red is not a check, and
// the wave brief names this exact one -- "red-validate by breaking the clamp
// order".  The wrong port is not "clamp the position on entry": the position is
// already inside the box every frame, so that mutation is a no-op and it PASSED
// the whole 2,200-frame comparison when it was tried.  MEASURED, and it is the
// reason this seam exists: the mutation has to be the one a person would
// actually write -- clamp BEFORE $2417DE adds the vector, and then store
// without clamping -- which cannot be produced from outside this function.
//
// 'rom' is the ROM's order and the only value the port ever ships with.
export const CLAMP_ORDER = { value: 'rom' };

/** $24A42A -- the tilt (bank) decay: ($4e,A6) moves 4 toward zero, or stays. */
function tiltDecay(ram, rec) {
  const t = i16(ram.u16(rec + P.tilt));       // $24A42E tst.w ($4e,A6)
  if (t === 0) return;                        // $24A432 beq
  const d = t < 0 ? 4 : -4;                   // $24A434 bmi -> +4 else -4
  ram.setU16(rec + P.tilt, u16(t + d));       // $24A43A add.w D0,($4e,A6)
}

/** $2495EE/$24962E -- one step of the bank ramp toward `limit` (-$20 or +$20).
 *  MEASURED shape: a 2-frame delay counter at ($4c,A6), step 4. */
function tiltRamp(ram, rec, limit, step) {
  if (i16(ram.u16(rec + P.tilt)) === limit) return;      // cmpi.w #limit,($4e,A6)/beq
  const d = i16(ram.u16(rec + P.tiltDelay)) - 1;         // subq.w #1,($4c,A6)
  ram.setU16(rec + P.tiltDelay, u16(d));
  // `bcc` after subq.w tests CARRY, i.e. borrow: it branches unless the
  // subtraction went below zero.  So the step happens on the frame the counter
  // wraps past 0, not the frame it reaches 0.
  if (d >= 0) return;
  ram.setU16(rec + P.tiltDelay, 2);                      // move.w #$2,($4c,A6)
  ram.setU16(rec + P.tilt, u16(i16(ram.u16(rec + P.tilt)) + step));
}

/**
 * $2494FA -- one frame of the player.
 * @param ctx {{tables, unportedLog, wallHits}}
 */
export function updatePlayer(ram, slot, slotIndex, ctx) {
  const idx = ram.u8(slot + 0x07);                   // ($7,A5)
  const rec = idx === 0 ? RAM.player1 : RAM.player2;
  const { tables, unportedLog } = ctx;

  ram.setU8(rec + P.playerIdx, idx);                 // $2494FA

  // $249500 btst #0,(A6) / bne $24A130 -- the death/respawn arm.  (A6) is a
  // BYTE test here (`btst #n,<mem>` is always byte-sized), so this is bit 0 of
  // $8103E6, the HIGH byte of the state word.
  if (ram.btst8(rec + P.state, 0)) {
    unreached(ROM.playerDead, 'player death / respawn state ($24A130)');
  }
  // $249508 tst.w $812972 / bne $24A3A2 -- **THE STAGE-CLEAR ARM.**
  // W62 (S1) makes this real.  `$812972` has exactly two writers in build B:
  // `$242968 move.w #$1,$812972` -- the stage advance's fourth instruction --
  // and `$28D682 clr.w $812972`, object type 6's state 3.  So this path is
  // ALIVE for exactly the window between `$242952` and the rebuild, and until
  // this wave nothing in the port could set the word: `FROZEN_GLOBALS` still
  // lists it as "seeded and frozen", which was true and is not any more.
  if (ram.u16(0x812972) !== 0) {
    return stageClearPlayer24A3A2(ram, rec, slot, ctx);
  }
  // $249512 bclr #5,(A6) -- again a BYTE op on $8103E6, and note that it is a
  // DIFFERENT BIT from the `ori.w #$20,(A6)` at $2495EA/$24962A, which sets bit
  // 5 of the WORD, i.e. bit 5 of $8103E7.  Ported as written rather than as
  // intended; the two are not the same bit and the port must not "fix" that.
  if (ram.bclr8(rec + P.state, 5)) {                 // $249516 beq
    ram.bclr8(rec + P.flags1, 2);                    // $249518
    ram.setU8(rec + P.speedIdx, ram.u8(rec + P.baseSpeed));  // $24951E
  }
  if (ram.u8(rec + P.invuln) !== 0) {                // $249524 tst.b ($3e,A6)
    ram.bclr8(rec + P.state, 4);                     // $24952A
    if (ram.u8(rec + P.invuln) !== 0xff) {           // $24952E cmpi.b #$ff
      ram.setU8(rec + P.invuln, ram.u8(rec + P.invuln) - 1);   // $249536
    }
  } else {
    ram.setU8(rec + P.dirLatch, ram.u8(rec + 0x3b)); // $24953C
    if (ram.bclr8(rec + P.state, 4)) {               // $249542 bclr #4,(A6)/bne
      unreached(ROM.playerBit4, 'state bit 4 path ($249F8A)');
    }
  }
  // $24954A andi.w #$ffdf,(A6): clears bit 5 of the WORD (i.e. of $8103E7).
  ram.setU16(rec + P.state, ram.u16(rec + P.state) & 0xffdf);
  if (ram.u8(rec + P.hitTimer) !== 0) {              // $24954E
    ram.setU8(rec + P.hitTimer, ram.u8(rec + P.hitTimer) - 1);
  }

  // $249558..$249584 -- the input, through the accessors $23D16C/$23D186 (P1)
  // or $23D17E/$23D18E (P2).  RAW held into ($18,A6), EDGE into ($19,A6), both
  // truncated to a byte by the `move.b D0,...`.
  const raw = ram.u16(idx === 0 ? RAM.p1raw : RAM.p2raw);
  const edge = ram.u16(idx === 0 ? RAM.p1edge : RAM.p2edge);
  ram.setU8(rec + P.dirByte, raw & 0xff);
  ram.setU8(rec + P.btnByte, edge & 0xff);

  // $249588 moveq #0,D0 / move.l D0,($30,A6) -- ONE longword clears BOTH
  // accumulators.  This is why the clamps can subtract into them below and the
  // result is "the movement that actually happened this frame".
  ram.setU32(rec + P.velY, 0);

  if (ram.u16(0x81296e) !== 0) {                     // $24958E
    ram.setU8(rec + P.dirByte, ram.u8(rec + P.dirByte) & 0x0f);   // $249596
    ram.setU8(rec + P.btnByte, ram.u8(rec + P.btnByte) & 0x0f);   // $24959C
    ram.setU8(rec + P.invuln, 0xff);                              // $2495A2
  }

  // $2495A8 moveq #$f,D0 / and.b ($18,A6),D0 / lea $2552DC,A2
  const nibble = ram.u8(rec + P.dirByte) & 0x0f;
  const angle = tables.angleFor(nibble);
  ram.setU8(rec + P.angle, angle);                   // $2495B4

  let d2, d3;
  if (angle & 0x80) {
    // $2495BA bpl -> not taken: $FF, no direction held.
    tiltDecay(ram, rec);                             // $2495BC bsr $24A42A
    d2 = i16(ram.u16(rec + P.posY));                 // $2495C0 movem.w ($2,A6),D2-D3
    d3 = i16(ram.u16(rec + P.posX));
    // $2495C6 bra $24969C -- straight past the horizontal blocks AND the
    // vertical clamps.  That is not the same as "the clamps do nothing": the
    // stick nibble can be 3 (up+down) or 5..7, which the $2552DC table answers
    // with $FF while bit 0 or bit 1 of ($18,A6) is still SET.  A port that let
    // the vertical clamp run here would clamp on a frame the board does not.
    return finish(ram, rec, d2, d3, ctx, /* skipClamps */ true);
  }

  if (CLAMP_ORDER.value === 'clamp-first') {
    // THE WRONG PORT, on purpose.  Clamp, then move, then store unclamped.
    ram.setU16(rec + P.posY, u16(Math.min(Math.max(
      i16(ram.u16(rec + P.posY)), CLAMP.yMin), CLAMP.yMax)));
    ram.setU16(rec + P.posX, u16(Math.min(Math.max(
      i16(ram.u16(rec + P.posX)), CLAMP.xMin), CLAMP.xMax)));
    const w = tables.vector(ram.u8(rec + P.speedIdx), angle);
    ram.setU16(rec + P.posY, u16(i16(ram.u16(rec + P.posY)) + w.dy));
    ram.setU16(rec + P.posX, u16(i16(ram.u16(rec + P.posX)) + w.dx));
    ram.setU16(rec + P.velY, u16(w.dy));
    ram.setU16(rec + P.velX, u16(w.dx));
    ram.setU16(rec + P.lastVelX, u16(w.dx));
    return finish(ram, rec, i16(ram.u16(rec + P.posY)),
      i16(ram.u16(rec + P.posX)), ctx, true);
  }

  // $2495CA jsr $2417DE -- THE MOVE.  $2417EA tst.w $8130D2 / bne -> zero
  // vector; otherwise $2417F4/$2417F8 add straight into the record.
  let v;
  if (ram.u16(0x8130d2) !== 0) {
    v = { dy: 0, dx: 0 };                            // $2417FE moveq #0,D2/D3
  } else {
    v = tables.vector(ram.u8(rec + P.speedIdx), angle);
    ram.setU16(rec + P.posY, u16(i16(ram.u16(rec + P.posY)) + v.dy));  // $2417F4
    ram.setU16(rec + P.posX, u16(i16(ram.u16(rec + P.posX)) + v.dx));  // $2417F8
  }
  ram.setU16(rec + P.velY, u16(v.dy));               // $2495D0
  ram.setU16(rec + P.velX, u16(v.dx));               // $2495D4
  ram.setU16(rec + P.lastVelX, u16(v.dx));           // $2495D8
  d2 = i16(ram.u16(rec + P.posY));                   // $2495DC -- the MOVED position
  d3 = i16(ram.u16(rec + P.posX));
  return finish(ram, rec, d2, d3, ctx, false);
}

/**
 * `$24A3A2..$24A428` -- THE PLAYER WHILE THE STAGE IS CLEARING.
 *
 * `$24A3A2 bset.b #$2,$1(a6)` is both the action and the once-only latch: the
 * 45-slot wipe below it runs on the FIRST frame of the stage clear and never
 * again, because `bne $24A3D4` sees the bit it just set.
 *
 * **THE WIPE IS THE BEAM.**  `moveq #$2C,D7` + `lea $811F72,A0` + `lea $30(A0)`
 * is 45 records of `$30` bytes -- `src/laser.js`'s own segment table, the one
 * `37-recon-laser` named and W45 ported.  So clearing a stage destroys the beam
 * the player is firing, exactly as `$25270C` does when a power-up is collected
 * (W61 5, where it moved `$81B64A` by 24).
 *
 * `$24A3F0 moveq #$4,D0 / cmp.w $813092,D0 / bne $24A412` is a STAGE-5-ONLY arm
 * ($813092 == 4 is the fifth stage), so on stage 1 control always takes
 * `$24A412`: if `$812970` is set -- and `$28D5DC` sets it in type 6's init --
 * the ship is given the constant velocity pair (`$C00`, D7) and flies off.
 * D7 is `$E00` or `$2A00` depending on `($7,A5)`, i.e. on WHICH PLAYER.
 */
function stageClearPlayer24A3A2(ram, rec, slot, ctx) {
  if (!ram.bset8(rec + 0x01, 2)) {                   // $24A3A2 bset.b #$2,$1(A6)
    for (let i = 0; i <= 0x2c; i++) {                // $24A3AC moveq #$2C
      ram.setU16(0x811f72 + i * 0x30, 0);            // $24A3B6 / $24A3B8 lea $30
    }
    // The latch is the whole point of `bne $24A3D4`, so the ONCE is what a
    // gate has to be able to see.  Without this hook a mutation that drops the
    // `bset` wipes the beam every frame of the stage clear and nothing notices.
    ctx.stageEndEvent?.('player-beam-wipe', ram.u8(rec + P.playerIdx));
    ram.setU16(rec, ram.u16(rec) & 0xff3f);          // $24A3C0 andi.w #$FF3F
    ram.setU8(rec + P.invuln, 1);                    // $24A3C4 move.b #$1,$3E
    ram.setU16(rec + 0x2a, 0);                       // $24A3CC
    ram.setU16(rec + 0x34, 0);                       // $24A3D0
  }
  ram.bclr8(rec, 4);                                 // $24A3D4 bclr.b #$4,(A6)
  // $24A3D8/$24A3DC/$24A3E2 -- D7 is the ship's EXIT VELOCITY and it differs
  // per player: `tst.b $7(a5)` is the object record's player index.
  const d7 = ram.u8(slot + 0x07) === 0 ? 0x0e00 : 0x2a00;
  tiltDecay(ram, rec);                               // $24A3E6 bsr $24A42A
  ram.setU8(rec + 0x1a, 0x10);                       // $24A3EA move.b #$10,$1A
  if (ram.u16(0x813092) === 4) {                     // $24A3F0/$24A3F2 cmp.w
    if (u16(ram.u16(rec + P.posY)) < 0x8000) {       // $24A3FA cmpi.w #$8000/bcc
      ram.setU16(rec + 0x1a, 0x3000);                // $24A404 -- a WORD over the
      applyPlayerVector2417DE(ram, rec, ctx);        //   byte $24A3EA wrote
      return;                                        // $24A40A jmp $2417DE
    }
  } else if (ram.u16(0x812970) !== 0) {              // $24A412 tst.w $812970/beq
    // $24A420 `movem.w D2/D7,$2(A6)` -- D2 = $C00 into ($2,A6) and D7 into
    // ($4,A6).  A `movem.w` to memory, so the register ORDER is D2 then D7,
    // low-numbered first, and that is what puts $C00 on the Y word.
    ram.setU16(rec + P.posY, 0x0c00);                // $24A41C/$24A420
    ram.setU16(rec + P.posX, d7);
  }
  tail249E4E(ram, rec, ctx);                         // $24A426 bra $249E4E
}

/** `$2417DE` as the stage-clear arm reaches it: the same movement vector
 *  `updatePlayer` applies, including the `$8130D2` zero-vector gate. */
function applyPlayerVector2417DE(ram, rec, ctx) {
  if (ram.u16(0x8130d2) !== 0) return;               // $2417EA tst.w/bne
  const v = ctx.tables.vector(ram.u8(rec + P.speedIdx), ram.u8(rec + P.angle));
  ram.setU16(rec + P.posY, u16(i16(ram.u16(rec + P.posY)) + v.dy));   // $2417F4
  ram.setU16(rec + P.posX, u16(i16(ram.u16(rec + P.posX)) + v.dx));   // $2417F8
}

/** $2495E2 .. $249E7C: the clamps, the store and the animation tail.
 *  `skipClamps` is the `bra $24969C` from the no-direction path. */
function finish(ram, rec, d2, d3, ctx, skipClamps) {
  const { unportedLog } = ctx;
  const dir = ram.u8(rec + P.dirByte);

  if (!skipClamps) {
    if (dir & (1 << 2)) {                            // $2495E2 btst #2 -- -X
      ram.setU16(rec + P.state, ram.u16(rec + P.state) | 0x20);   // $2495EA ori.w
      tiltRamp(ram, rec, -0x20, -4);                 // $2495EE..$249606
      if (d3 <= CLAMP.xMin) {                        // $249608 cmpi/bhi (unsigned)
        // MOVE PAST, THEN CLAMP, AND GIVE THE OVERSHOOT BACK TO THE ACCUMULATOR.
        d3 -= CLAMP.xMin;                            // $24960E
        ram.setU16(rec + P.velX, u16(i16(ram.u16(rec + P.velX)) - d3));  // $249612
        d3 = CLAMP.xMin;                             // $249616
        ctx.wallHit(ROM.wallHit, 'x min');           // $24961A jsr $261126
      }
    } else if (dir & (1 << 3)) {                     // $249622 btst #3 -- +X
      ram.setU16(rec + P.state, ram.u16(rec + P.state) | 0x20);   // $24962A
      tiltRamp(ram, rec, 0x20, 4);                   // $24962E..$249646
      if (d3 >= CLAMP.xMax) {                        // $249648 cmpi/bcs (unsigned)
        d3 -= CLAMP.xMax;                            // $24964E
        ram.setU16(rec + P.velX, u16(i16(ram.u16(rec + P.velX)) - d3));  // $249652
        d3 = CLAMP.xMax;                             // $249656
        ctx.wallHit(ROM.wallHit, 'x max');           // $24965A
      }
    } else {
      tiltDecay(ram, rec);                           // $249662 bsr $24A42A
    }
  }

  if (skipClamps) { /* $2495C6 bra $24969C */ }
  else if (dir & (1 << 0)) {                         // $249666 btst #0 -- +Y
    if (d2 > CLAMP.yMax) {                           // $24966E cmpi/bls
      d2 -= CLAMP.yMax;                              // $249674
      ram.setU16(rec + P.velY, u16(i16(ram.u16(rec + P.velY)) - d2));   // $249678
      d2 = CLAMP.yMax;                               // $24967C
    }
  } else if (dir & (1 << 1)) {                       // $249682 btst #1 -- -Y
    if (d2 < CLAMP.yMin) {                           // $24968A cmpi/bcc
      d2 -= CLAMP.yMin;                              // $249690
      ram.setU16(rec + P.velY, u16(i16(ram.u16(rec + P.velY)) - d2));   // $249694
      d2 = CLAMP.yMin;                               // $249698
    }
  }

  // $24969C tst.b ($1,A6) / bpl $2496E8 -- bit 7 of $8103E7 gates the knockback
  // block.  MEASURED 0 across the whole corpus; the block reads the $2552EC
  // ramp and is not ported.
  if (ram.i8(rec + P.flags1) < 0) {
    unreached(0x2496a2, 'the knockback / $2552EC ramp block (bit 7 of ($1,A6))');
  }

  ram.setU16(rec + P.posY, u16(d2));                 // $2496E8 movem.w D2-D3,($2,A6)
  ram.setU16(rec + P.posX, u16(d3));

  // $2496EE..$24970A -- a SECOND write to the X word, after the store.  Never
  // observed to fire (wave 2's write map has no $24970A writer over 2,600
  // frames), so one of the two guards always held; ported as written.
  if (ram.u16(0x81308c) === 0 && !ram.btst8(rec + P.flags1, 5)) {
    ram.setU16(rec + P.posX,
      u16(i16(ram.u16(rec + P.posX)) - i16(ram.u16(0x813176))));
  }

  // $2497AA .. $249E4C -- bomb, hyper, shot and laser.
  // Wave 4 stopped at the FIRST instruction of the shot branch; wave 5 carries
  // the shot CADENCE MACHINE ($249B2C..$249BE2) and stops at the spawn.
  // ($57,A6) is written by $2494FA from ($7,A5); re-read here because
  // `finish` is a separate function and the ROM's A5 is long gone.
  bombAndShotGuards(ram, rec, ctx, ram.u8(rec + P.playerIdx) & 1);

  // $249E4E -- the tail.  TWO tilt-indexed longs, and WAVE 4 NAMED BOTH OF THEM
  // WRONG.  Only the first is animation.
  //
  //   $249E62 move.l (A0,D0.w),($a,A6)   A0 = $25533A[shipType] = $255362
  //                                      -> hardware words 2 and 3: THE IMAGE.
  //                                      MEASURED $1200..$1840 in steps of $64.
  //   $249E78 move.l (A0,D0.w),($14,A6)  A0 = $2553CA[0] = $2553F2
  //                                      -> ($14,A6)/($16,A6), which $2459D0
  //                                      reads as the X HALF-EXTENTS OF THE
  //                                      SHIP'S HITBOX.  It is not an animation
  //                                      at all; it is the number the whole game
  //                                      is about, and the port has been writing
  //                                      it under an animation's name since
  //                                      wave 4 (10-recon-combat §3).
  //
  // MEASURED, $2553F2, all 17 entries (+X / -X): (0000,0080) at tilt -$20,
  // (0080,0080) at 0, (0080,0000) at +$20 -- so banking left narrows the box on
  // the right and vice versa.  Build A's twin table $1549AE holds $00C0 where
  // this holds $0080: Black Label's horizontal hitbox is exactly 2/3 of the
  // original's, 4 px against 6.
  tail249E4E(ram, rec, ctx);
}

/** `$249E4E..$249E7C` and the shadow -- THE PLAYER'S TAIL, and it is a real
 *  branch target and not just the end of `finish`: `$24A400 bcc $249E4E`,
 *  `$24A418 beq $249E4E` and `$24A426 bra $249E4E` all enter HERE, skipping
 *  every clamp above.  W62 lifted it out of `finish` unchanged so the
 *  stage-clear path can reach it without re-running the clamps. */
function tail249E4E(ram, rec, ctx) {
  const { unportedLog } = ctx;
  const t = ctx.tables.anim(ram.u16(rec + P.tilt));
  ram.setU16(rec + P.animA, t.a[0]);                 // $249E62
  ram.setU16(rec + P.animA + 2, t.a[1]);
  // THE WRONG PORT, and it is deliberately separable from the image above: a
  // port that banks the SPRITE and freezes the HITBOX looks completely right on
  // screen and is wrong about every collision.  `hitx-frozen` is red on the
  // hitbox columns and GREEN on bucket 19, which is exactly why the hitbox
  // needed columns of its own rather than being trusted to the picture.
  const h = SHIP_MUTATE.value === 'hitx-frozen' ? ctx.tables.anim(0) : t;
  ram.setU16(rec + P.hitXPlus, h.hitX[0]);           // $249E78, the LONG at +$14
  ram.setU16(rec + P.hitXMinus, h.hitX[1]);          // ...i.e. +$14 and +$16
  // $249E7E onward: the ground-plane shadow emit ($249EA0 -> $23EFC0, bucket 5)
  // and the score BCD block.  WAVE 12 ports the shadow; the rest is W17's and
  // is counted rather than silent.
  //
  // WAVE 12.5's AUDIT CORRECTED THIS NOTE'S ADDRESS.  `drawShipShadow` has FIVE
  // exits -- four gates that are `bne/beq $249EE8` and the fall-through past
  // `$249EE2 jsr $23EFC0` -- and all five land on `$249EE8`, not on `$249F16`.
  // `$249EE8..$249F14` is a chain of five more gates ($80392C, $8130F8 bit 0,
  // $81309C, (A6) bit 6, ($7,A5), $812914) that decide whether the BCD block
  // runs at all, and `$249F4C..$249F88` is P2's copy of it.  The note named
  // only the middle of the region.  Control DOES reach this line on every path
  // -- it was never a quiet return -- but an unported region whose census line
  // understates its own extent is how one becomes invisible.
  drawShipShadow(ram, rec, ctx);
  unportedLog.note(0x249ee8, 'player tail: the five gates $249EE8..$249F14 and '
    + 'the score BCD block behind them ($249F16..$249F88, P1 and P2)');
}

/**
 * $2497AA .. $249BE2 -- the weapon block, as far as wave 5 translates it.
 *
 * THE BUTTON MAP, measured in wave 4 and re-stated because wave 2 item 5 left
 * it open and it is the whole basis of "all the kinds of weapons":
 *   mirror bit 4 (P1 Button 1) = the SHOT/LASER edge, tested at $249B48
 *   mirror bit 5 (P1 Button 2) = the BOMB, tested at $24980A
 *   mirror bit 6 (P1 Button 3) = AUTO-SHOT: $2497B2 finds the operator byte
 *     $80380F set to $01 and SYNTHESISES a shot edge into ($19,A6) on alternate
 *     frames (`bchg #4,($1,A6)` then `bset #4,($19,A6)`).  So Button 3 is not a
 *     third weapon; it is Button 1 on a 2-frame cadence.
 */
function bombAndShotGuards(ram, rec, ctx, playerIdx) {
  const { unportedLog } = ctx;
  const dir = ram.u8(rec + P.dirByte);
  const btn = ram.u8(rec + P.btnByte);
  // $2497AA tst.b $80380F / beq $2497FE ; $2497B2 btst #6,($18,A6)
  if (ram.u8(0x80380f) !== 0 && (dir & (1 << 6)) && ram.u8(rec + 0x3c) === 0) {
    unreached(ROM.playerBomb, 'the $2497BA hyper/auto block (setting $80380F is on '
      + 'AND mirror bit 6 is held)');
  }
  // $2497FE cmpi.w #$4,$8130CE / bcs $249B2C ; $24980A btst #5,($19,A6)
  //
  // WAVE 13, AND THE NAME WAS WRONG SINCE WAVE 4.  $8130CE is not bomb stock:
  // it is THE DISTANCE CLOCK, the scroll odometer $26132C bumps once per $200
  // of scroll (20-recon-scroll-engine §3).  The instruction is exactly as
  // written and stays -- the board really does gate the bomb on the odometer
  // being >= 4, which is true four frames into any stage -- but until this
  // wave the port FROZE the word at its seeded value (`FROZEN_GLOBALS`), and it
  // now moves every frame because the background object is ported.  So this
  // branch is live for the first time.  The REAL bomb stock is still unlocated
  // (20-plan W28).
  // **WAVE 64 SPLITS ONE NAME INTO TWO WEAPONS.**  From wave 4 to wave 63 the
  // line below threw `THE BOMB ($249814)` for BOTH arms of `$249814`, and
  // `38-recon-bomb-hyper.md` §0.2 is right that a wave which "implements the
  // bomb at $249814" implements the hyper by accident.  `$249814` is Button 2
  // and the weapon is decided EIGHT INSTRUCTIONS LATER, by the hyper stock:
  //
  //   $249864 move.w (A1),D1   A1 = $81B65C (P1) / $81B65E (P2)
  //   $249866 beq.b $2498E2    ZERO  -> THE BOMB   (src/bomb.js, W64)
  //           $249868          NON-0 -> THE HYPER  (a throw, and it says so)
  //
  // The `lea` block above the fork is transcribed because the fork READS from
  // it: the two arms load different stock words, different request words and
  // different `$255326`/`$255330` tables.
  if (ram.u16(0x8130ce) >= 4 && (btn & (1 << 5))) {
    const stock = ram.u16(playerIdx === 0                 // $249820 / $249846
      ? BOMBRAM.hyperStockP1 : BOMBRAM.hyperStockP2);
    if (stock !== 0) {                                    // $249866 beq $2498E2
      unreached(0x249868, `**THE HYPER** ($249868), NOT the bomb -- `
        + `$249864's fork found $${(playerIdx === 0 ? 0x81b65c : 0x81b65e)
          .toString(16).toUpperCase()} = ${stock}. The arm is $249882's `
        + `$252B44/$252B8A power lookup, $24988A addq.w #$8,$81B410, `
        + `$249890's $255326[stock-1] into $81B412, jsr $25270C, the REQUEST `
        + `$24989A move.w #$1,$81B658 that $285A12 consumes, and the bullet `
        + `cancel $243D14/$243D5A. W63 (B1) throws on $285A12's two arms and `
        + `recon 38 §6 wave 2 owns this. The only absolute writer of the `
        + `stock is $2530CA, whose item kinds src/items.js REFUSES at the `
        + `allocator, so this cannot be reached in this port at all`);
    }
    const what = fireBomb2498E2(ram, ctx, rec, playerIdx);     // $2498E2
    ctx.bombEvent?.('press', what);
    // **THE TWO EXITS ARE DIFFERENT AND A PORT MUST NOT MERGE THEM.**  A bomb
    // that FIRES ends at `$249B28 bra.w $249E4E`, the player's tail, so the
    // shot cadence machine does not run on that frame.  All THREE refusals
    // (`$2498E6`, `$2498FE`, `$24990A`) branch to `$249B2C`, which IS the
    // cadence machine -- so a press that is refused still shoots.
    if (what.startsWith('fired')) return;                 // $249B28 bra $249E4E
  }                                                       // ...else fall to $249B2C
  // $249B2C..$249B3C -- the "power" byte the tail draws from: ($54,A6), or
  // ($55,A6) when bit 0 of ($1,A6) is set, copied into ($56,A6).
  ram.setU8(rec + 0x56, ram.btst8(rec + P.flags1, 0)     // $249B30 btst #0
    ? ram.u8(rec + 0x55) : ram.u8(rec + 0x54));          // $249B38 / $249B2C
  // $249B40 tst.b ($3f,A6) / bne $249E4E
  //
  // **THIS WAS A THROW UNTIL WAVE 45 AND IT IS NOT AN UNPORTED PATH AT ALL.**
  // The instruction is `bne $249E4E` -- a branch to the player's own TAIL,
  // which is the very next thing this function's caller does -- so the arm has
  // always been "skip the shot cadence machine this frame", i.e. a `return`.
  // Calling `($3f,A6)` "the dead flag" and throwing on it was a guess, and the
  // thing that flushed it out is the LASER: `$24C282 move.b #$1,($3f,A4)` sets
  // this byte on the frame the beam's arm-up completes (+16) and
  // `$24C2D6 move.b D0,($3f,A4)` clears it on release, precisely so that the
  // ship stops spawning ordinary shots while it is firing a beam.
  //
  // That also completes `37-recon-laser.md` §3.4's correction. W37 is right
  // that `$81295C` falling to 0 is the shot table DRAINING and not a laser
  // write; what it does not say is WHY nothing refills the table after +16, and
  // this is why -- the cadence machine is switched off at its head, by the
  // laser, on purpose.  The six shots at lf2001..2007 are the pre-arm burst.
  if (ram.u8(rec + P.dead) !== 0) {
    unportedLog.note(0x249b40, 'shot: ($3f,A6) is set -- the cadence machine is '
      + 'skipped ($249B44 bne $249E4E). The LASER sets this byte at $24C282 '
      + 'when its arm-up completes and clears it at $24C2D6 on release');
    return;                                              // $249B44 bne $249E4E
  }

  // THE SHOT CADENCE MACHINE, $249B48..$249BE2.  Ported in wave 5.  This is the
  // part that runs EVERY frame the button is held or released and that decides,
  // per frame, whether a shot is emitted; the emission itself ($249BFC /
  // $249D2C) is not ported and throws below.
  if (btn & (1 << 4)) {                                  // $249B48 btst #4,($19,A6)
    ram.setU8(rec + 0x3c, 1);                            // $249B50
    // $249B56..$249B70: the RELOAD value for the shot counter ($2b,A6).
    //   D0 = ($21,A6), or 8 if bit 0 of ($1,A6) is set;
    //   D0 = ((D0 >> 1) & 6) + ($2d,A6).
    // `lsr.w #1` then `andi.b #6` -- a WORD shift and a BYTE mask, in that
    // order, so bit 0 of the shifted value is discarded and only bits 1-2
    // survive.  Translated as written.
    let d0 = ram.btst8(rec + P.flags1, 0) ? 8 : ram.u8(rec + 0x21);
    d0 = ((u16(d0) >> 1) & 6) + ram.u8(rec + 0x2d);      // $249B66/$249B68/$249B6C
    ram.setU8(rec + 0x2b, d0 & 0xff);                    // $249B70
    if (ram.bclr8(rec + P.flags1, 3)) {                  // $249B74 bclr #3 / beq
      ram.bset8(rec + P.state, 3);                       // $249B7C
      ram.setU8(rec + 0x2b, 0);                          // $249B80 clr.b ($2b,A6)
      // falls through to $249BC2
    } else if (ram.bclr8(rec + P.state, 3)) {            // $249B86 bclr #3,(A6)/beq
      ram.setU8(rec + 0x2a, 1);                          // $249B8C
      unportedLog.note(0x249b8c, 'shot: the $249B92 bra to the tail');
      return;                                            // $249B92 bra $249E4E
    }
  } else {
    // $249B96 -- the no-shot path.
    ram.setU8(rec + 0x3c, 0);                            // $249B96
    ram.bclr8(rec + P.state, 3);                         // $249B9A
    ram.bclr8(rec + P.flags1, 4);                        // $249B9E
    if (ram.u8(rec + 0x2b) === 0) {                      // $249BA4 tst.b/beq
      unportedLog.note(0x249ba4, 'shot: idle, no cadence counter running');
      return;                                            // -> $249E4E
    }
    ram.setU8(rec + 0x2a, (ram.u8(rec + 0x2a) - 1) & 0xff);   // $249BAC subq.b
    if (ram.u8(rec + 0x2a) !== 0) return;                // $249BB0 bne $249E4E
    ram.setU8(rec + 0x2b, (ram.u8(rec + 0x2b) - 1) & 0xff);   // $249BB4
    ram.bset8(rec + P.state, 3);                         // $249BB8
    ram.bset8(rec + P.flags1, 4);                        // $249BBC
  }

  // $249BC2..$249BDE -- the DELAY reload for ($2a,A6).
  let d = ram.u8(rec + 0x2c);                            // $249BC2
  if (ram.btst8(rec + P.flags1, 0)                       // $249BC6 btst #0 / bne
    || (ram.u16(rec + P.shipSel) === 0                   // $249BCE tst.w ($58,A6)
      && ram.u16(rec + 0x20) === 8)) {                   // $249BD4 cmpi.w #$8
    d = 2;                                               // $249BDC moveq #$2,D0
  }
  ram.setU8(rec + 0x2a, d & 0xff);                       // $249BDE

  // $249BE2..$249BF8 -- a two-entry jump table on the SHIP TYPE ($58,A6):
  //   ship 0 -> $249BFC   ship 2 -> $249D2C
  // Both are THE SPAWN.  Wave 8 translates ship 0 (src/shots.js); ship 2 is a
  // named throw, because ($58,A6) was MEASURED 0 on every frame of every run
  // and the exporter only exports selector 0's tables.
  const ship = ram.u16(rec + P.shipSel);                 // $249BE2
  if (ship !== 0) {
    unreached(0x249d2c, `THE SHOT SPAWN for ship type ${ship} ($249BF8 bra `
      + `$249D2C, the second entry of the $249BF4 jump table). TYPE-B was `
      + `never exercised: ($58,A6) is 0 on every frame of every run in this `
      + `corpus, and tools/export-tables.py exports selector 0 only`);
  }
  spawnShot(ram, ctx.rom, rec, ctx, { player: playerIdx });
}
