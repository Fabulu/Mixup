// THE IRQ6 MODEL -- and the address list is BUILD A's on purpose.
//
// This is the wave-2 defect the review caught and it is worth restating in the
// code, because the wave-2 worklog's phase table names build-B addresses for
// every one of these rows and NONE OF THEM EXECUTES.  Measured three ways on a
// VERSION-B run whose main loop is unambiguously build B (`armpc 23C212:1901`):
//
//   VECTORS at lf=2600: IRQ4 $801470=$13BDAA   IRQ6 $801478=$13BDBA
//   P1 mirror store executions: buildA $13D488=2615   buildB $23D11C=0
//   ISR6 releases:              buildA $13C806=2599   buildB $23C46C=0
//   read census of $803940: build A's $13C7E6/$13D478/$13C806 fire; build B's
//   $23C44C/$23D10C/$23C46C: NOT ONE READ.
//
// The chain that runs:
//   $13BDBA movem.l D0-D7/A0-A6,-(A7) / jsr $13C7D4 / movem / rte
//   $13C7D4   jsr $13CFBA            coin/service            UNPORTED
//   $13C7DA   jsr $13D464            THE INPUT READ          ported (input.js)
//   $13C7E0   jsr $18ACC0                                    UNPORTED
//   $13C7E6   tst.b $803940 / beq $13C80C     <- THE (A) GATE
//   $13C7EE   jsr $141676 / $140FFE / $141258 / $185DC4       UNPORTED (gated)
//   $13C806   subq.b #1,$803940               <- THE RELEASE
//   $13C80C   jmp $13C4FC             ISR tail                UNPORTED
//
// A DROPPED FRAME IS NOT UNIFORM.  The input read is BEFORE the gate, so on an
// overrun frame the mirrors still advance while the four gated routines are
// skipped -- measured 614 gate firings in 696 forced-overrun frames, with the
// input read running on every one of them.  The port expresses that shape even
// though its budget never triggers, because the shape is the thing that cannot
// be added later.
//
// AND THE STATISTIC THAT WAS WRONG IN WAVE 1: the gate-firing count is
// `sum(irq6 - rel)`, NOT `count(rel == 0)`.  A dilated logic frame sees N
// vblanks and gets exactly ONE release; the other N-1 take the gate.  Read as
// `count(rel == 0)` the same run reported 0 firings where there were 614.

import { RAM, ROM } from './machine.js';
import { u16 } from './ram.js';
import { isr6InputRead } from './input.js';
import { uploadRegs } from './background.js';
import { flushScoreDigits185DC4, flushTextDefer141258 } from './hud.js';

/**
 * One IRQ6 dispatch.  Returns true if it RELEASED the semaphore (i.e. the main
 * loop was waiting), false if the (A) gate fired.
 */
export function irq6(ram, portWord, ctx) {
  const { unportedLog } = ctx;
  // $13C7D4 jsr $13CFBA. IRQ6's portWord is $C08000, the PLAYER port; $13CFBA does its own
  // `lea $C08004,A0` and reads a DIFFERENT one. Handing it portWord credits a coin whenever a
  // player holds a button whose bit falls in the $E0 mask, which is how this was caught.
  coinRead13CFBA(ram, ctx.coinPort ?? COIN.idle, ctx);
  isr6InputRead(ram, portWord, unportedLog);          // $13C7DA
  unportedLog.note(ROM.isr6Third, 'ISR6 jsr #3 ($18ACC0)');
  const sem = ram.u8(RAM.semaphore);                  // $13C7E6 tst.b $803940
  if (sem === 0) return false;                        // $13C7EC beq $13C80C -- GATED
  for (const a of ROM.isr6Gated) {                    // $13C7EE..$13C800
    // WAVE 13.  THE SECOND OF THE FOUR IS THE SCROLL REGISTER UPLOAD, and it
    // is BUILD A's -- $140FFE, not build B's $240CC0.  That is not a typo and
    // it is not `NOTES-build-split.md`'s exception being stretched: it is the
    // rule.  On a VERSION-B run the interrupt handlers are build A's (measured
    // three ways, the header above), so the routine behind this gate is the
    // one in build A's address range, and the two builds' copies DIFFER --
    // $240CC0 subtracts the screen-shake offsets $80B054/$80B056 and $140FFE
    // does not.  Measured over the wave-17 corpus, 10,738 consecutive frame
    // pairs of stage 1: the no-shake form predicts $B03000 on 10,738 of
    // 10,738, the shake form on 10,696 -- it is wrong on exactly the 42 frames
    // the boss shakes the screen.  Porting $240CC0 here would have been
    // invisible for 10,696 frames and wrong for 42.
    if (a === ROM.isr6RegUpload) {
      uploadRegs(ram, ctx.video, { subtractShake: ctx.bgMutate === 'upload-subtracts-shake' });
      continue;
    }
    // W116.  THE THIRD OF THE FOUR is THE GENERAL TEXT FLUSH.  It drains the
    // `$80B058` defer buffer (populated by the `$240DC2`-family printers the
    // HUD text bodies now call -- lives, bombs, credits, chain high-water,
    // hyper-stock, the labels) into `ctx.txvram`, then re-arms the buffer (its
    // tail `$14123A` IS `deferReset`).  Build A, like every routine behind this
    // gate.  Has no inner gate of its own -- the outer `$803940` semaphore
    // (enforced just above) governs it, and when no body queued anything the
    // buffer holds only the terminator and the flush is a no-op + reset.
    if (a === ROM.isr6TextFlush) {
      if (ctx.txvram) flushTextDefer141258(ram, ctx.txvram, ctx);
      continue;
    }
    // W114/W115.  THE FOURTH OF THE FOUR is THE SCORE-DIGIT FLUSH.  It drains
    // the dirty records at $81B4C8 (populated by `digits2843A8` on the main
    // loop) straight into the TX tilemap `$904000` via `ctx.txvram`, and is
    // the route the P1/P2 score numbers ship -- INDEPENDENTLY of the general
    // text flush `$141258` (the THIRD of the four, ported just above in W116).
    // Reached by a direct `jsr $185dc4.l` at `$13C800`, NOT the indirect
    // `jsr (An)` W112 hypothesised.
    if (a === ROM.isr6ScoreFlush) {
      if (ctx.txvram) flushScoreDigits185DC4(ram, ctx.txvram);
      continue;
    }
    unportedLog.note(a, 'ISR6 gated routine');
  }
  ram.setU8(RAM.semaphore, (sem - 1) & 0xff);         // $13C806 subq.b #1
  unportedLog.note(ROM.isr6Tail, 'ISR6 tail ($13C4FC)');
  return true;
}

// ---------------------------------------------------------------------------------------------
// `$13CFBA` -- THE COIN AND SERVICE READ. IRQ6's FIRST call, so it runs before anything else in the
// frame. W373, D35.
//
// THREE WORDS, AND THEY ARE NOT THREE COPIES OF THE SAME THING:
//
//     $803950   this frame's switches, RAW LEVEL, already inverted so 1 = pressed
//     $803952   LAST frame's switches, still ACTIVE LOW -- taken into D1 BEFORE being overwritten
//     $803954   the EDGES: newly pressed this frame, masked to bits 5, 6 and 7
//
// The order is the whole of it. `$13CFC2` reads `$803952` into D1 and only then does `$13CFC8`
// overwrite it, so D1 holds the previous frame while `$803952` moves on. Then `not.w D0` inverts
// only THIS frame, and `and.w D0,D1` is `prev_raw & ~now_raw` -- set where the switch was released
// last frame and pressed this one.
//
// **`$803954` HOLDS NEWLY-PRESSED BITS, NOT HELD ONES.** Storing the level there coins up once per
// FRAME HELD instead of once per press, and it does not look like an edge bug from the outside: it
// looks like the credit counter running away.

export const COIN = Object.freeze({
  read: 0x13cfba, pending: 0x13cf86,
  port: 0xc08004,
  raw: 0x803950, prev: 0x803952, edges: 0x803954,
  mask: 0x00e0,                        // $13CFD8 andi.w #$E0 -- bits 5, 6 and 7
  // $13CF86's two pending flags. Each is a WORD compared against $0080 exactly, not a bit test, and
  // reading one CONSUMES it.
  pendA: 0x803968, pendB: 0x80396e, pendValue: 0x0080,
  bitCoin1: 5, bitCoin2: 0, bitService: 1,
  creditA: 0x803958, creditB: 0x80395e,
  // The operator DIPs and the two adjacent coinage bytes.
  dipCoinage: 0x803808, dipSlot2: 0x80380b,
  coinsPerCredit: 0x803956, creditsPerCoin: 0x803957,
  // $80394C and $80394D are ADJACENT per-slot coin counters, bumped with addq.b (opcode $5239,
  // whose size field is 00 = BYTE -- $5279 would be the word form).
  counterA: 0x80394c, counterB: 0x80394d,
  service: 0x13d068, servicePort: 0xc08006,
  // ACTIVE LOW, so all ones is nothing pressed. A harness with no coin port sees no coins.
  idle: 0xffff,
  arms: Object.freeze({ credit: 0x13ce22, hook: 0x18b0d6, tail: 0x13d002 }),
});

/** `$13CF86` -- THE PENDING FLAGS, and reading them CLEARS them.
 *
 *  Two words tested against `$0080` with `cmpi.w`, not bit-tested, so any other value reads as
 *  "nothing pending". Each match ORs a bit into D1 and zeroes its word, which is why this cannot be
 *  called twice per frame and why the port returns the bits rather than exposing the words.
 */
export function coinPending13CF86(ram) {
  let d1 = 0;                                                // $13CF86 moveq #$0,D1
  if (ram.u16(COIN.pendA) === COIN.pendValue) {              // $13CF88 cmpi.w #$0080 / bne
    d1 |= 0x01;                                              // $13CF94 ori.w #$1,D1
    ram.setU16(COIN.pendA, 0);                               // $13CF98 -- CONSUMED
  }
  if (ram.u16(COIN.pendB) === COIN.pendValue) {              // $13CFA0 / bne
    d1 |= 0x02;                                              // $13CFAC ori.w #$2,D1
    ram.setU16(COIN.pendB, 0);                               // $13CFB0 -- CONSUMED
  }
  return d1;
}

/** `$13CFBA` -- the read and its three stores. Returns D1 as the cartridge leaves it: the pending
 *  bits ORed with the edge word, which is what the three arms below are tested against.
 *
 *  `$13CF86` runs AFTER the edges are stored and it starts `moveq #$0,D1`, so it DESTROYS the edge
 *  value in D1 and `$13CFE4 or.w $803954,D1` reads it back out of memory. Keeping the edges in a
 *  local across the call would be the same answer by accident; it is written the way the cartridge
 *  writes it because the store is what the rest of the frame reads.
 */
export function coinRead13CFBA(ram, coinPortWord, ctx) {
  const prev = ram.u16(COIN.prev);                           // $13CFC2 -- taken FIRST
  ram.setU16(COIN.prev, u16(coinPortWord));                  // $13CFC8 -- and only then overwritten
  const now = u16(~coinPortWord);                            // $13CFCE not.w D0 -- ACTIVE LOW
  ram.setU16(COIN.raw, now);                                 // $13CFD0
  ram.setU16(COIN.edges, (prev & now & COIN.mask) >>> 0);    // $13CFD6 and.w / $13CFD8 andi.w #$E0

  let d1 = coinPending13CF86(ram);                           // $13CFE2 bsr $13CF86 -- CLOBBERS D1
  d1 |= ram.u16(COIN.edges);                                 // $13CFE4 or.w $803954,D1 -- read back

  // $13CFEA btst #$5 / $13CFEE beq $13D002 -- AND THE THREE ARMS ARE NOT INDEPENDENT. Bit 5 set
  // falls through to $13CFF0 and RETURNS at $13D000, so bits 0 and 1 are tested ONLY when bit 5 is
  // clear. Written as three separate ifs it credits two slots on a frame where the cartridge
  // credits one, and only when two switches happen to edge together.
  if ((d1 & (1 << COIN.bitCoin1)) !== 0) {                   // $13CFEA btst #$5,D1
    ctx?.soundPost?.(COIN.arms.hook);                        // $13CFF0 jsr $18B0D6
    coinage13CE22(ram, COIN.creditA);                        // $13CFF6 lea $803958 / $13CFFC bsr
    return d1;                                               // $13D000 rts -- the rest is SKIPPED
  }

  if ((d1 & (1 << COIN.bitCoin2)) !== 0) {                   // $13D002 btst #$0,D1
    ctx?.soundPost?.(COIN.arms.hook);                        // $13D008 jsr $18B0D6
    coinage13CE22(ram, COIN.creditA);                        // $13D00E lea $803958 / $13D014 bsr
    // $13D018 -- the mechanical counter is NOT bumped on free play, so the DIP is read twice per
    // coin: once inside the converter and once here.
    if (ram.u8(COIN.dipCoinage) !== 0x12) {                  // $13D01E cmpi.b #$12 / beq
      ram.setU8(COIN.counterA, (ram.u8(COIN.counterA) + 1) & 0xff);   // $13D026 addq.b #1
    }
  }

  if ((d1 & (1 << COIN.bitService)) !== 0) {                 // $13D02C btst #$1,D1
    ctx?.soundPost?.(COIN.arms.hook);                        // $13D032 jsr $18B0D6
    // $13D03E -- slot 2 gets its OWN credit block only when $80380B is EXACTLY 1; otherwise both
    // slots share slot 1's. The lea at $13D038 is done first and then undone at $13D04A.
    const block = ram.u8(COIN.dipSlot2) === 0x01 ? COIN.creditB : COIN.creditA;
    coinage13CE22(ram, block);                               // $13D050 bsr $13CE22
    if (ram.u8(COIN.dipCoinage) !== 0x12) {                  // $13D05A cmpi.b #$12 / beq
      ram.setU8(COIN.counterB, (ram.u8(COIN.counterB) + 1) & 0xff);   // $13D062 addq.b #1
    }
  }

  // $13D068 -- then the SERVICE half, on a SECOND hardware port $C08006, gated on $80394A being
  // zero. It calls $13CC50 and branches on the $80380B DIP. Swept only to $13D08E; the coin and
  // credit path above is complete without it.
  ctx?.unportedLog?.note(COIN.service, `$13D068 lea $C08006,A0 -- the service/test half of the `
    + `coin handler, on a second hardware port, gated on $80394A. Calls $13CC50, branches on `
    + `$80380B. Not read past $13D08E`);

  return d1;
}

/** `$13CE22` -- THE COINAGE CONVERTER. It saves D0/D1 itself (`move.l D0,-(A7)` twice) and takes the
 *  slot's two-byte block in A0: `(A0)` is that slot's COIN count and `($2,A0)` its CREDIT count.
 *
 *  FOUR BANDS OVER THE DIP AT `$803808`, and they are ranges, not an index:
 *
 *      $00..$08   one coin gives `$803957` credits          (a multiplier)
 *      $09..$10   `$803956` coins are needed per credit     (a divisor, with a carry counter)
 *      $11        bumps the COIN count only
 *      $12        returns immediately -- free play
 *
 *  `$803956` and `$803957` are ADJACENT BYTES holding the two halves of the coinage, the same
 *  arrangement as every counter/reload pair in this port.
 *
 *  THE `$11` BAND BUMPS `(A0)` AND NOT `($2,A0)`. It looks like the one-coin-one-credit case and it
 *  is written like one, but the credit byte it touches is the COIN counter: `$13CE52`'s two compares
 *  then send `$11` past both remaining bands to the exit. Transcribed as written.
 *
 *  EVERY WRITE TO EITHER COUNT IS CLAMPED AT NINE, and the entry test is `($2,A0) == 9` exactly, so
 *  a block already at nine credits does nothing at all.
 */
export function coinage13CE22(ram, a0) {
  if (ram.u8(a0 + 2) === 0x09) return;                       // $13CE26/$13CE2A -- already full
  const dip = ram.u8(COIN.dipCoinage);                       // $13CE32 move.b $803808,D0
  if (dip === 0x12) return;                                  // $13CE38 cmpi.b #$12 -- FREE PLAY

  if (dip === 0x11) {                                        // $13CE40 cmpi.b #$11 / bne
    ram.setU8(a0, Math.min(ram.u8(a0) + 1, 0x09));           // $13CE46 addq.b / $13CE48 ble / $13CE4E
  }

  if (dip >= 0x09 && dip <= 0x10) {                          // $13CE52 blt / $13CE58 bgt
    ram.setU8(a0, (ram.u8(a0) + 1) & 0xff);                  // $13CE5E addq.b #1,(A0)
    if (ram.u8(COIN.coinsPerCredit) === ram.u8(a0)) {        // $13CE60/$13CE66 cmp.b (A0),D1
      ram.setU8(a0, 0);                                      // $13CE6A clr.b (A0)
      ram.setU8(a0 + 2, Math.min(ram.u8(a0 + 2) + 1, 0x09)); // $13CE6C/$13CE70/$13CE78
    }
    return;                                                  // $13CE7E's blt/bgt both exit for $9..$10
  }

  if (dip <= 0x08) {                                         // $13CE7E blt / $13CE84 bgt
    ram.setU8(a0 + 2,                                        // $13CE8A move.b $803957,D1
      Math.min(ram.u8(a0 + 2) + ram.u8(COIN.creditsPerCoin), 0x09));   // $13CE90 add.b / $13CE94
  }
}
