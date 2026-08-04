// THE HIT AND KILL LEDGER -- `$286096`, `$28615E` and the chain machines.
// WAVE 34.
//
// `19-impl-score-chain-rank-ledger.md` ENUMERATED this subsystem and
// deliberately ported none of it.  This file ports the half a HIT reaches, and
// deliberately leaves the other half alone.  Both halves of that sentence are
// load-bearing, so the reason is here rather than only in the worklog:
//
// ====================== THE OWNER CONSTRAINT AND THE ORDER ==================
//
// `20-OWNER-scoring-must-be-exact.md`: "one wrong rank gain from using super
// and the entire route breaks".  Order WITHIN a frame is semantics, and W19
// §1.5 MEASURED the board's order on 40 frames of a playing run:
//
//     rankclk > rank= > [ CHAIN+ > score+ > meter+ > (meter=cap) > score+ ]*
//             > drain > drain0 > (brkT) > meter-
//
// The bracketed group is one HIT.  Everything in this file is inside that
// group, and its position in the frame is NOT CHOSEN HERE: `$286096` and
// `$28615E` are called from an enemy handler, at the instruction the handler
// reaches, and the handler's position in the frame is the enemy driver's
// dispatch order, which the port has reproduced since W29.  So no write below
// has an order this port invented.
//
// The three events OUTSIDE the group are `drain`, `drain0` and `meter-`, and
// all three live in ONE place, read out of the ROM:
//
//     $240F62[0] = $28D520            top-level object TYPE 0
//        $28D52E jsr $2842B0          the pending -> total DRAIN  (drain/drain0)
//        $28D534 jsr $28444E          ... and inside it, $284636 subq.w #1,
//                                     $81B5C0 -- THE CHAIN METER DECREMENT
//
// Object type 0 is one of the SIXTEEN top-level dispatch entries this port does
// not have, and the path from `$28444E` to `$284614` is gated three ways
// (`$28445C bne $284CF2`, `$2844AE`/`$2844BA bne $2847FE`, and `$2844C4 bmi
// $28465C`, which jumps PAST the decrement).  Reproducing it needs `$285A12`
// (the HYPER), `$285B3C`, `$285C5E`, `$285F8A`, `$285F52` and the TX printer
// `$240DC2`.
//
// **So the per-frame half is NOT ported, and the reason is W19 §1.6's own** --
// it declined to port the rank clock because "porting the arithmetic without
// the slot would bake in an order that later has to be unpicked".  Calling
// `$284636` from a place chosen by this wave would do exactly that.  The
// consequence is stated rather than hidden: with no decrement a chain the port
// starts never expires.  `$28D520` is NOTED, by address, on every frame the
// pass runs, so the gap is counted and not silent.
//
// ============================ WHAT IS AND IS NOT HERE =======================
//
//   PORTED   $286096  a HIT lands (85 call sites)
//            $28615E  a KILL (87 call sites, 87 of 87 score immediates
//                     recovered and 87 of 87 valid packed BCD -- W34 §1.1)
//            $2862C6 / $286476   the P1 and P2 chain machines
//            $286626  THE ONE BCD ADDER (28 pc-relative callers, 0 absolute)
//            $28663A / $2866DE   the meter refill, and $286664's cap clamp
//            $28614A / $286154 / $286128 / $286102   the four thin wrappers
//
//   NOTED    $286876  behind `btst #2,D1` -- the BOMB hit bit ($400), which is
//                     set only at $245242/$2452F2, both inside the A2/A3 weapon
//                     loops src/damage.js does not run
//            $286A82 / $286DA8   behind $8130F8 bit 2 AND $811F72's sign AND
//                     its bit 0 -- THE LASER, which has never executed
//            $286674  the cap clamp's TAIL: the hyper-stock bonus into $81B64A
//                     and `jmp $287682`, which is the routine that GRANTS a
//                     hyper stock ($81B65C, capped at 5) and therefore feeds
//                     $285A62's +16 rank.  That is the owner's own case and it
//                     needs $287682's machine, which is W28's wave 8.
//            $28D520  the per-frame half, above.
//
// ============================== THE BCD, AND THE TRAP ========================
//
// Every score in this game is PACKED BCD and there is exactly ONE adder:
// `$286626`, four `abcd -(A1),-(A0)` with `sub.w D2,D2` clearing X first.  The
// PREDECREMENT is the whole trap (W19 §1.0): A0 is the address ONE PAST the
// accumulator's last byte, so `lea $81B4C4,A0` addresses the four bytes
// `$81B4C0..$81B4C3`, and a reader who takes the `lea` for the accumulator's
// address is off by one slot on every player.

import { u16 } from './ram.js';

export const SCORE = {
  hit: 0x286096,            // A HIT LANDS
  kill: 0x28615e,           // A KILL
  chainP1: 0x2862c6, chainP2: 0x286476,
  adder: 0x286626,
  refillP1: 0x28663a, refillP2: 0x2866de,
  capClamp: 0x286664,
  capTail: 0x286674,        // NOTED -- the hyper-stock bonus
  wrapP1: 0x28614a, wrapP2: 0x286154, wrapMask: 0x286128, wrapTail: 0x286102,
  altBomb: 0x286876,        // NOTED
  altLaserP1: 0x286a82, altLaserP2: 0x286da8,   // NOTED
  perFrame: 0x28d520,       // NOTED -- object type 0: the drain and the decrement
  drain: 0x2842b0, decrement: 0x284636,
  scratch: 0x81b5aa,        // $286626 lea $81B5AA,A1
  capWord: 0x81b5b2,        // $28616C move.w (A0,D2.w),$81B5B2
  refillAmt: 0x81b5e0,      // $2862D4 AND $286484 -- ONE word, both players
  loop: 0x813098,
  laserRec: 0x811f72,
  g30f8: 0x8130f8, g30f9: 0x8130f9,
  /** `$28616C lea $287DF0` -- the chain-meter CAP by loop word, `$813098 * 2`.
   *  MEASURED out of the image: `$0038 $005A` = 56 and 90, and W19 measured 56
   *  on the board for loop 1. */
  capTable: 0x287df0,
  /** `$2862CE lea $287DF4` -- the per-hit REFILL by the player's weapon
   *  selector, which is ALREADY a byte offset (`move.w $81043E,D2` then
   *  `(A0,D2.w)`, no scaling).  `$0014 $0012` = 20 and 18.  The window is FOUR
   *  BYTES on purpose: `$287DF8` onward does not read as refill amounts
   *  ($0118, $2223, ...) and no run has ever had `$81043E` non-zero, so a
   *  third entry would be a guess.  Indexing past it is a LOUD NAMED THROW out
   *  of `src/rom.js`, which is the correct answer to an unproven extent. */
  refillTable: 0x287df4,
};

/** The per-player address block.  P1's is `$2862C6`'s and P2's is `$286476`'s;
 *  the two routines are instruction-for-instruction identical and differ only
 *  in these words, which is why one function serves both.  Every address is
 *  the operand of a named instruction so the pairing can be checked. */
export const LEDGER = {
  p1: {
    who: 1,
    weaponSel: 0x81043e,    // $2862C8
    guard: 0x81b5ae,        // $2862EA tst.w
    w1e: 0x81b5de,          // $2862FC / $28630C
    hyper: 0x81b63e,        // $286304
    meter: 0x81b5c0,        // $286314
    chain: 0x81b5da,        // $286320 clr.w  /  $2863B2 the +1
    pendingEnd: 0x81b4c4,   // $286328 lea    (accumulator $81B4C0..$81B4C3)
    acc1: 0x81b5b8,         // $286332
    acc2: 0x81b5bc,         // $286338
    acc3: 0x81b5d6,         // $28633E / $2863DE
    popup: 0x81b5c2,        // $286346 / $28642C / $286456
    accA: 0x81b5ce,         // $286350 / $286374
    accB: 0x81b5d2,         // $286356 / $28637A / $2863CE
    t4: 0x81b5c4,           // $28635C / $286412 / $28643E
    hiwater: 0x81b632,      // $2863B4 / $2863C2
    t6: 0x81b5c6,           // $28641A
    tcc: 0x81b5cc,          // $286438
    tc8: 0x81b5c8,          // $286444
    tca: 0x81b5ca,          // $28644C
    tdc: 0x81b5dc,          // $28645E
    refill: 0x28663a,       // $28631C / $2863E8 bsr
    hyperLvl: 0x81b654,     // $28618A (in $28615E)
    wrap: 0x28614a,         // $2861E4 bsr  (the four repeats)
  },
  p2: {
    who: 2,
    weaponSel: 0x8104a0,    // $286478
    guard: 0x81b5b0,        // $28649A
    w1e: 0x81b608,          // $2864AC / $2864BC
    hyper: 0x81b640,        // $2864B4
    meter: 0x81b5ea,        // $2864C4
    chain: 0x81b604,        // $2864D0 / $286552
    pendingEnd: 0x81b4c8,   // $2864D8 lea   (accumulator $81B4C4..$81B4C7)
    acc1: 0x81b5e2,         // $2864E2
    acc2: 0x81b5e6,         // $2864E8
    acc3: 0x81b600,         // $2864EE / $28658E
    popup: 0x81b5ec,        // $2864F6 / $2865DC / $286606
    accA: 0x81b5f8,         // $286500 / $286524
    accB: 0x81b5fc,         // $286506 / $28652A / $28657E
    t4: 0x81b5ee,           // $28650C / $2865C2 / $2865EE
    hiwater: 0x81b634,      // $286564 / $286572
    t6: 0x81b5f0,           // $2865CA
    tcc: 0x81b5f6,          // $2865E8
    tc8: 0x81b5f2,          // $2865F4
    tca: 0x81b5f4,          // $2865FC
    tdc: 0x81b606,          // $28660E
    refill: 0x2866de,       // $2864CC / $286598 bsr
    hyperLvl: 0x81b656,     // $286232
    wrap: 0x286154,         // $28628C bsr
  },
};

function note(ctx, addr, what) { ctx?.unportedLog?.note(addr, what); }

// ---------------------------------------------------------------------------
// `abcd` -- the 68000's PACKED-BCD add with the X flag.  Not a helper anybody
// should have to re-derive: the DECIMAL carry is not the binary one, and a port
// that writes `(a+b) & 0xff` gets the right answer for every score below 10.
//
//   lo = (dst & $F) + (src & $F) + X ;  if lo > 9 : lo += 6
//   r  = lo + (dst & $F0) + (src & $F0)
//   if r > $99 : r += $60 ; X = C = 1  else X = C = 0
// ---------------------------------------------------------------------------
export function abcd(dst, src, x) {
  let lo = (dst & 0x0f) + (src & 0x0f) + x;
  let carry = 0;
  if (lo > 9) lo += 6;
  let r = lo + (dst & 0xf0) + (src & 0xf0);
  if (r > 0x99) { r += 0x60; carry = 1; }
  return { v: r & 0xff, x: carry };
}

/**
 * `$286626` -- THE ONE ADDER.  `A0` is the byte ONE PAST the accumulator.
 *
 *   $286626 lea $81B5AA,A1
 *   $28662C move.l D0,(A1)+      the addend, packed BCD, into the scratch
 *   $28662E sub.w D2,D2          clear X
 *   $286630 abcd -(A1),-(A0)  x4
 */
export function bcdAdd(ram, accEnd, d0) {
  ram.setU32(SCORE.scratch, d0 >>> 0);                // $28662C move.l D0,(A1)+
  let x = 0;                                          // $28662E sub.w D2,D2
  for (let i = 1; i <= 4; i++) {                      // $286630..$286636
    const a = accEnd - i, b = SCORE.scratch + 4 - i;
    const r = abcd(ram.u8(a), ram.u8(b), x);
    ram.setU8(a, r.v);
    x = r.x;
  }
}

/** `$28663A` (P1) / `$2866DE` (P2) -- the meter REFILL, and `$286664`'s clamp.
 *
 *  `$28666E tst.w D1 / bmi $286662` is the only exit from the clamp that this
 *  port takes: D1 is the hit mask, a value between `$04` and `$5C`, never
 *  negative.  So the board FALLS THROUGH into `$286674` -- the hyper-stock
 *  bonus and `jmp $287682` -- and that is NOTED, not run.  See this file's
 *  header for why: `$287682` grants the stock that `$285A62` turns into +16
 *  rank, and rank is the owner's named failure. */
export function refillMeter(ram, ctx, p, d1) {
  const d0 = ram.u16(SCORE.refillAmt);                // $28663A move.w $81B5E0,D0
  if ((d1 & 0x04) === 0                               // $286640 btst #2,D1 / bne
      && ram.u16(SCORE.loop) !== 0) {                 // $286646 tst.w $813098 / bne
    return capClamp(ram, ctx, p, d1);                 // -> $286664
  }
  ram.setU16(p.meter, u16(ram.u16(p.meter) + d0));    // $28664E add.w D0,$81B5C0
  const cap = ram.u16(SCORE.capWord);                 // $286654
  if (cap > ram.u16(p.meter)) return;                 // $28665A cmp / bls -> clamp
  return capClamp(ram, ctx, p, d1);                   // $286660 bls $286664
}

function capClamp(ram, ctx, p, d1) {
  ram.setU16(p.meter, ram.u16(SCORE.capWord));        // $286664
  if ((d1 & 0x8000) !== 0) return;                    // $28666E tst.w D1 / bmi -> rts
  note(ctx, SCORE.capTail, `$286674 onwards -- the chain meter reached its cap `
    + `and the board runs the HYPER-STOCK BONUS: the $813094-indexed tables at `
    + `$286EC2/$286ECC/$2866D2, then $2866C4 add.w D0,$81B64A and `
    + `$2866CA jmp $287682, which grants a hyper stock ($81B65C, capped at 5 `
    + `at $28768C) and therefore feeds $285A62's +16 RANK. Not ported: that is `
    + `the owner's own named failure case and it needs $287682's machine`);
}

/**
 * `$2862C6` (P1) / `$286476` (P2) -- the per-hit CHAIN machine.
 *
 * D0 is the score value, packed BCD; D3 preserves it and the routine returns it
 * (`$286472 move.l D3,D0 / rts`), which is why `$28615E` can call this and then
 * keep using D0.
 *
 * THE FORK IS `$286314 tst.w $81B5C0 / bne $286366`: **the chain continues if
 * and only if the meter is non-zero AT THE MOMENT THE HIT REGISTERS.**  W19
 * §1.5 item 2 is the consequence -- a hit on the frame the meter would have
 * reached 0 SAVES the chain, because the refill happens before the decrement.
 * This port never decrements (see the header), so it can only ever be on the
 * "chain continues" side of that fork once a chain has started.
 */
export function chainHit(ram, rom, ctx, p, d0, d1) {
  const d3 = d0 >>> 0;                                // $2862C6 move.l D0,D3
  const sel = ram.u16(p.weaponSel);                   // $2862C8
  // $2862CE lea $287DF4,A0 / $2862D4 move.w (A0,D2.w),$81B5E0.  D2 is the
  // selector UNSCALED -- it is already a byte offset.
  ram.setU16(SCORE.refillAmt, rom.u16(SCORE.refillTable + sel));
  const laser = ram.u16(SCORE.laserRec);              // $2862DC move.w $811F72,D2
  if ((laser & 0x8000) !== 0 && (laser & 0x80) === 0  // $2862E2 bpl / $2862E4 btst #7
      && ram.u16(p.guard) === 0) {                    // $2862EA tst.w / beq $286320
    ram.setU16(p.chain, 0);                           // $286320 clr.w
    scoreAdd(ram, p, d3);                             // fall through to $286326
    return d3;
  }
  if ((ram.u8(SCORE.g30f9) & 1) !== 0) {              // $2862F2 btst #0 / bne $286326
    scoreAdd(ram, p, d3);
    return d3;
  }
  ram.setU16(p.w1e, 0x1e);                            // $2862FC
  if (ram.u16(p.hyper) !== 0) ram.setU16(p.w1e, 1);   // $286304 / $28630C
  if (ram.u16(p.meter) !== 0) {                       // $286314 tst.w / bne $286366
    return chainContinue(ram, ctx, p, d3, d1);
  }
  refillMeter(ram, ctx, p, d1);                       // $28631C bsr $28663A
  ram.setU16(p.chain, 0);                             // $286320 clr.w
  scoreAdd(ram, p, d3);                               // $286326
  return d3;
}

/** `$286326..$286362` -- the UNCHAINED add, and the popup reset. */
function scoreAdd(ram, p, d3) {
  bcdAdd(ram, p.pendingEnd, d3);                      // $286328/$28632E
  ram.setU32(p.acc1, d3);                             // $286332
  ram.setU32(p.acc2, d3);                             // $286338
  if (ram.u32(p.acc3) === 0) ram.setU16(p.popup, 0x50);  // $28633E / $286346
  ram.setU32(p.accA, 0);                              // $286350
  ram.setU32(p.accB, 0);                              // $286356
  ram.setU16(p.t4, 0);                                // $28635C
}

/** `$286366..$286472` -- the CHAINED path. */
function chainContinue(ram, ctx, p, d3, d1) {
  if (ram.u32(p.acc1) !== 0) {                        // $286366 tst.l / beq $286390
    const d0 = ram.u32(p.acc1);
    ram.setU32(p.accA, d0);                           // $286374
    ram.setU32(p.accB, d0);                           // $28637A
    ram.setU16(p.chain, 1);                           // $286380
    ram.setU32(p.acc1, 0);                            // $28638A
  }
  // ---- $286390..$2863B2: a hand-rolled two-byte packed-BCD `+1`.
  //      D2's HIGH half takes byte 0 and its LOW half byte 1, so the two
  //      `abcd`s run LOW BYTE FIRST with the carry crossing the `swap`.
  const hi = ram.u8(p.chain), lo = ram.u8(p.chain + 1);
  const r0 = abcd(lo, 1, 0);                          // $2863A0/$2863A2 abcd D0,D2
  const r1 = abcd(hi, 0, r0.x);                       // $2863A6/$2863A8 swap / abcd
  ram.setU8(p.chain, r1.v);                           // $2863B2 move.w D2,(A0)
  ram.setU8(p.chain + 1, r0.v);
  if (ram.u16(p.hiwater) < ram.u16(p.chain)) {        // $2863B4/$2863BA cmp / bcc
    ram.setU16(p.hiwater, ram.u16(p.chain));          // $2863C2
  }
  bcdAdd(ram, p.accB, d3);                            // $2863CE/$2863D4
  bcdAdd(ram, p.acc3, ram.u32(p.accA));               // $2863D8/$2863DE/$2863E4
  refillMeter(ram, ctx, p, d1);                       // $2863E8 bsr $28663A
  bcdAdd(ram, p.pendingEnd, ram.u32(p.accA));         // $2863EC/$2863F2/$2863F8
  const chain = ram.u16(p.chain);
  if (chain < 0x10) {                                 // $2863FE cmpi.w #$10 / bcc
    if (chain > 1) ram.setU16(p.t4, 0x78);            // $286408 cmpi.w #$1 / bls
    ram.setU16(p.t6, ram.u16(p.meter));               // $28641A
    if (ram.u32(p.acc3) === 0) ram.setU16(p.popup, 0xb4);  // $286424 / $28642C
    return d3;
  }
  if (chain === 0x10) {                               // $286436 bne $286444
    ram.setU16(p.tcc, 0);                             // $286438
    ram.setU16(p.t4, 0);                              // $28643E
  }
  ram.setU16(p.tc8, 0xf0);                            // $286444
  ram.setU16(p.tca, ram.u16(p.meter));                // $28644C
  ram.setU16(p.popup, 0xf0);                          // $286456
  ram.setU16(p.tdc, ram.u16(p.chain));                // $28645E
  ram.setU32(p.acc3, ram.u32(p.accB));                // $286468
  return d3;
}

/**
 * `$286096` -- A HIT LANDS.
 *
 * D1 is the HIT MASK the caller built with `moveq #$5C,D1 / and.b (A6),D1`, so
 * bit 4 is "P1 hit this" and bit 3 is "P2 hit this" -- the same `$1000`/`$800`
 * `src/damage.js` ORs into the enemy's type word.  **The routine computes its
 * own value: `moveq #1,D0 / add.w $81B63E,D0` -- ONE POINT PLUS THE HYPER
 * LEVEL** (W19 §1.2), so all 85 call sites score the same thing and none of
 * them carries an amount.
 *
 * `$286096 btst #1,(A6) / beq` -- an enemy whose sub-record byte 0 has bit 1
 * set scores NOTHING and the routine returns immediately.  A6 is the enemy's
 * sub-record, so this is per-enemy and must be transcribed even though no
 * stage-1 handler is known to set it.
 */
export function scoreHit(ram, ctx, a6, d1) {
  if ((ram.u8(a6) & 0x02) !== 0) return;              // $286096 btst #1,(A6)
  let skipP1 = false;
  if ((ram.u8(SCORE.g30f8) & 0x04) !== 0) {           // $28609E btst #2,$8130F8
    const d2 = ram.u16(SCORE.laserRec);               // $2860A8 move.w $811F72,D2
    if ((d2 & 0x8000) !== 0 && (d2 & 0x01) !== 0      // $2860AE bpl / $2860B0 btst #0
        && (d2 & 0x0080) === 0) {                     // $2860B8 tst.b D2 / bmi
      if ((d1 & 0x10) !== 0) {                        // $2860BC btst #4,D1
        note(ctx, SCORE.altLaserP1, `$2860C8 bsr $286A82 -- $286096's LASER `
          + `arm ($8130F8 bit 2 + $811F72 negative + its bit 0 + its bit 7 `
          + `clear). No laser has ever executed in this port; $2453C2 ran ZERO `
          + `times in 580 live-beam frames (10-recon-combat §8.7). $2860CC `
          + `bra.b $2860DE, so the plain P1 add below still runs`);
      } else {
        // ---------------------------------------------------------------
        // $2860C0 `beq.b $286102`, and it goes to **$286102**, not to the P2
        // laser arm eight bytes later.  So `$2860CE..$2860DC` -- `btst #3,D1 /
        // add.w $81B640,D0 / bsr $286DA8`, an entire P2 mirror of the arm
        // above -- IS UNREACHABLE.  Nothing in $286096 branches to $2860CE and
        // $2860CC `bra.b $2860DE` steps over it.
        //
        // It is transcribed as this comment and not as code, because writing
        // it as code would give the port a path the cartridge does not have.
        // `$286DA8` is in SCORE.altLaserP2 for the record.
        // ---------------------------------------------------------------
        skipP1 = true;                                // -> $286102
      }
    }
  }
  if (!skipP1 && (d1 & 0x10) !== 0) {                 // $2860DE btst #4,D1
    const d0 = u16(1 + ram.u16(LEDGER.p1.hyper));     // $2860E4/$2860E6
    if ((d1 & 0x04) !== 0) {                          // $2860EC btst #2,D1
      note(ctx, SCORE.altBomb, `$2860F2 bsr $286876 -- $286096's BOMB arm `
        + `(D1 bit 2 = the $400 hit bit, set only at $245242/$2452F2 inside the `
        + `A2/A3 weapon loops src/damage.js does not run)`);
    } else {
      bcdAdd(ram, LEDGER.p1.pendingEnd, d0);          // $2860F8/$2860FE
    }
  }
  if ((d1 & 0x08) !== 0) {                            // $286102 btst #3,D1
    const d0 = u16(1 + ram.u16(LEDGER.p2.hyper));     // $28610A/$28610C
    if ((d1 & 0x04) !== 0) {                          // $286112 btst #2,D1
      note(ctx, 0x286b9c, `$286118 bra.w $286B9C -- $286096's P2 BOMB arm`);
    } else {
      bcdAdd(ram, LEDGER.p2.pendingEnd, d0);          // $28611C/$286122
    }
  }
}

/**
 * `$28615E` -- A KILL.  D0 is the enemy's score value, packed BCD, from the
 * CALL SITE; D1 is the same hit mask `$286096` took.
 *
 * `$28615E` FIRST rewrites the meter cap from `$287DF0[$813098 * 2]` -- so the
 * cap is refreshed on every kill and W19 measured `$28616C` writing `$81B5B2`
 * 232 times in a 4,600-frame run.  Then it runs the chain machine, and if a
 * HYPER is up it re-enters that machine `$81B654` more times.
 */
export function scoreKill(ram, rom, ctx, d0, d1) {
  // The one hook this file offers a runner: every `$28615E` with its D0 (the
  // enemy's score value, from the call site) and its D1 (which player).  A
  // KILL is the thing a damage wave has to be able to count, and counting
  // `freeEnemy` would count off-screen exits too.
  ctx?.killEvent?.(d0, d1);
  const loop = ram.u16(SCORE.loop);                   // $28615E
  ram.setU16(SCORE.capWord, rom.u16(SCORE.capTable + u16(loop + loop)));  // $28616C
  if ((d1 & 0x10) !== 0) {                            // $286174 btst #4,D1
    killFor(ram, rom, ctx, LEDGER.p1, d0, d1);
  }
  if ((d1 & 0x08) !== 0) {                            // $28621C btst #3,D1
    killFor(ram, rom, ctx, LEDGER.p2, d0, d1);
  }
}

function killFor(ram, rom, ctx, p, d0, d1) {
  chainHit(ram, rom, ctx, p, d0, d1);                 // $28617C / $286224 bsr
  if (ram.u16(p.hyper) === 0) return;                 // $286180 / $286228 tst.w / beq
  // ---- $28618A..$286218: the HYPER repeat.  D2 = the hyper LEVEL - 1 and the
  // block below runs D2+1 times through a `dbra`.  With a level of 0 the `dbra`
  // runs 65,536 times; that is the board's arithmetic and it is transcribed as
  // such rather than guarded, because a guard would be a rule the ROM has not
  // got.  No run has ever had `$81B63E` non-zero (W19 §1.4), so this whole
  // block is transcribed-and-unexercised and says so.
  let d2 = u16(ram.u16(p.hyperLvl) - 1);              // $28618A/$286190
  if (ram.u32(p.acc1) !== 0) {                        // $286192 tst.l / beq $2861BC
    const v = ram.u32(p.acc1);
    ram.setU32(p.accA, v);                            // $2861A0
    ram.setU32(p.accB, v);                            // $2861A6
    ram.setU16(p.chain, 1);                           // $2861AC
    ram.setU32(p.acc1, 0);                            // $2861B6
  }
  for (;;) {                                          // $2861BC .. $286218 dbra
    const saved = ram.u32(p.accA);                    // $2861BE move.l $81B5CE,D0 / -(A7)
    if (ram.u16(SCORE.loop) !== 0) {                  // $2861C6 tst.w / bne $28620A
      chainHit(ram, rom, ctx, p, 0, d1);              // $28620A moveq #0,D0 / bsr
    } else {
      ram.setU32(p.accA, saved >>> 4);                // $2861D0 lsr.l #4 / $2861D2
      chainHit(ram, rom, ctx, p, 0, d1);              // $2861D8/$2861DA
      for (let k = 0; k < 4; k++) {                   // $2861DE..$286202, four times
        bcdAdd(ram, p.pendingEnd, ram.u32(p.accA));   // the $28614A/$286154 wrapper
      }
    }
    ram.setU32(p.accA, saved);                        // $286210 move.l (A7)+,$81B5CE
    if (d2 === 0) break;                              // $286218 dbra D2
    d2 = u16(d2 - 1);
  }
}

/** `$28614A` (P1) / `$286154` (P2) -- `lea <pendingEnd>,A0 / bra $286626`. */
export function scorePending(ram, who, d0) {
  bcdAdd(ram, who === 2 ? LEDGER.p2.pendingEnd : LEDGER.p1.pendingEnd, d0);
}

/** `$286128` -- the by-D1 wrapper: bit 4 credits P1, bit 3 credits P2, and it
 *  can credit BOTH in one call (`$286134 bsr` then `$286138 btst #3`). */
export function scoreByMask(ram, d0, d1) {
  if ((d1 & 0x10) !== 0) bcdAdd(ram, LEDGER.p1.pendingEnd, d0);   // $28612E/$286134
  if ((d1 & 0x08) !== 0) bcdAdd(ram, LEDGER.p2.pendingEnd, d0);   // $28613E/$286144
}

/** Counted once per collision pass: the half of the ledger that is NOT here. */
export function notePerFrameLedger(ctx) {
  note(ctx, SCORE.perFrame, `top-level object TYPE 0 $28D520 -- $28D52E `
    + `jsr $2842B0 (the pending -> total DRAIN) and $28D534 jsr $28444E, `
    + `inside which $284636 subq.w #1,$81B5C0 is THE CHAIN METER DECREMENT. `
    + `W19 §1.5 measured both as the LAST ledger events of the frame. Not `
    + `ported: object type 0 is one of the sixteen top-level entries this port `
    + `does not have, and calling $284636 from a slot chosen by W34 would bake `
    + `in an order that later has to be unpicked (W19 §1.6's own reason for `
    + `declining the rank clock). CONSEQUENCE: a chain this port starts never `
    + `expires`);
}
