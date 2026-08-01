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

// Globals the player reads and the port does not write.  Seeded once and
// FROZEN for the run.  Listed by name so the runner can print them and a
// reviewer can see exactly which "constants" are really assumptions.
export const FROZEN_GLOBALS = [
  [0x812972, 'global freeze; non-zero jumps the whole update to $24A3A2'],
  [0x81296e, 'input mask; non-zero masks the stick to 4 bits at $249596'],
  [0x8130d2, 'movement disable; non-zero makes $2417FE return a zero vector'],
  [0x812954, 'the $2496CA -$48 nudge'],
  [0x81308c, 'gate on the post-store X adjust at $2496EE'],
  [0x813176, 'the amount that post-store X adjust subtracts'],
  [0x80380f, 'operator setting gating the $2497AA bomb/hyper block'],
  [0x8130ce, 'bomb stock compared against 4 at $2497FE'],
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
  // $249508 tst.w $812972 / bne $24A3A2
  if (ram.u16(0x812972) !== 0) {
    unreached(ROM.playerFrozen, 'global freeze path ($24A3A2); $812972 is non-zero');
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
  bombAndShotGuards(ram, rec, unportedLog);

  // $249E4E -- the tail.  Two animation records, indexed by the bank counter.
  const anim = ctx.tables.anim(ram.u16(rec + P.tilt));
  ram.setU16(rec + P.animA, anim.a[0]);              // $249E62 move.l (A0,D0.w),($a,A6)
  ram.setU16(rec + P.animA + 2, anim.a[1]);
  ram.setU16(rec + P.animB, anim.b[0]);              // $249E78 ... ($14,A6)
  ram.setU16(rec + P.animB + 2, anim.b[1]);
  // $249E7E onward: the shadow-sprite emit ($23EFC0) and a BCD block.  Both
  // write outside the compared set; counted, never silent.
  unportedLog.note(0x249e7e, 'player tail: shadow emit $23EFC0 + the BCD block');
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
function bombAndShotGuards(ram, rec, unportedLog) {
  const dir = ram.u8(rec + P.dirByte);
  const btn = ram.u8(rec + P.btnByte);
  // $2497AA tst.b $80380F / beq $2497FE ; $2497B2 btst #6,($18,A6)
  if (ram.u8(0x80380f) !== 0 && (dir & (1 << 6)) && ram.u8(rec + 0x3c) === 0) {
    unreached(ROM.playerBomb, 'the $2497BA hyper/auto block (setting $80380F is on '
      + 'AND mirror bit 6 is held)');
  }
  // $2497FE cmpi.w #$4,$8130CE / bcs $249B2C ; $24980A btst #5,($19,A6)
  if (ram.u16(0x8130ce) >= 4 && (btn & (1 << 5))) {
    unreached(0x249814, 'THE BOMB ($249814); mirror bit 5 went down with stock >= 4');
  }
  // $249B2C..$249B3C -- the "power" byte the tail draws from: ($54,A6), or
  // ($55,A6) when bit 0 of ($1,A6) is set, copied into ($56,A6).
  ram.setU8(rec + 0x56, ram.btst8(rec + P.flags1, 0)     // $249B30 btst #0
    ? ram.u8(rec + 0x55) : ram.u8(rec + 0x54));          // $249B38 / $249B2C
  // $249B40 tst.b ($3f,A6) / bne $249E4E
  if (ram.u8(rec + P.dead) !== 0) {
    unreached(0x249b40, 'the ($3f,A6) dead flag is set');
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
  // Both are the SPAWN: they scan the 36-slot player-shot table at $810572 for
  // a free record (`tst.w (A0) / bpl` -- a NEGATIVE type word means occupied),
  // and on failure clear ($2b,A6) and bit 3 of (A6) so the shot is dropped and
  // the cadence resets.  NOT PORTED: the spawn fills a record through $24A222 /
  // $24A2D6 out of PC-relative pattern tables ($2554EA, $255502, $25551A,
  // $255332...) indexed by ship, power ($20,A6) and formation ($5A,A6), and
  // every record it creates is then driven by src/weapons.js's UNPORTED
  // handlers.  A guess here would look finished and be wrong from the first
  // shot.
  const ship = ram.u16(rec + P.shipSel);
  unreached(ship === 0 ? 0x249bfc : 0x249d2c,
    `THE SHOT SPAWN for ship type ${ship} (dispatched by $249BE2's two-entry `
    + `jump table at $249BF4). It scans the 36-slot shot table at `
    + `$810572 (P1) / $810C32 (P2) for a free record and, when there is none, `
    + `clears ($2b,A6) and bit 3 of (A6) at $249CA8/$249CEA -- so the table's `
    + `occupancy feeds straight back into the player record. Wave 5 ports the `
    + `shot DRIVER shell (src/weapons.js) and none of the four handlers`);
}
