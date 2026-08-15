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
  read: 0x13cfba, pending: 0x13cf86, debounce: 0x13cec8,
  port: 0xc08004,
  // $13CEC8's two 6-byte records, and `recA + 4` IS `pendA` -- the debounce's result word and the
  // pending flag $13CF86 consumes are the same word. `recStride` is the `lea ($6,A0),A0` at $13CF78.
  recA: 0x803964, recB: 0x80396a, recStride: 0x6,
  // $13CF4A cmpi.w #$3 / blt and $13CF52 cmpi.w #$26 / bgt -- INCLUSIVE both ends.
  tapMin: 0x3, tapMax: 0x26,
  // $1453B6 addq.w #$1 / $1453BC andi.w #$1 -- the IRQ4 phase toggle that halves the call rate.
  irq4Phase: 0x80fa84, irq4Guard: 0x80fa82,
  raw: 0x803950, prev: 0x803952, edges: 0x803954,
  mask: 0x00e0,                        // $13CFD8 andi.w #$E0 -- bits 5, 6 and 7
  // $13CF86's two pending flags. Each is a WORD compared against $0080 exactly, not a bit test, and
  // reading one CONSUMES it.
  pendA: 0x803968, pendB: 0x80396e, pendValue: 0x0080,
  // W375 -- THE THREE BIT NAMES WERE WRONG, and the code that used them was right. The arms are
  // unchanged; only the labels moved.
  //
  //   bit 5 comes from the EDGE word, and `$13CFD8 andi.w #$E0` leaves ONLY bits 5, 6 and 7 in it.
  //   The cartridge's own I/O TEST screen names bit 5: `$156BF2 btst #$5,D0` on `$C08004` prints
  //   the SERVICE label. So the `btst #$5` arm is SERVICE, not Coin 1 -- and it is the arm that
  //   credits without bumping a mechanical counter, which is exactly what a service switch does.
  //
  //   bits 0 and 1 are NOT port bits. `$13CFE2 bsr $13CF86` runs FIRST and ORs the two PENDING
  //   FLAGS into D1 as bits 0 and 1; `$13CFE4 or.w $803954,D1` can then only add bits 5/6/7. So
  //   `$13D002 btst #$0` means `$803968 == $0080` and `$13D02C btst #$1` means `$80396E == $0080`,
  //   i.e. the debounce below finalised a tap on record 0 or record 1.
  //
  //   Record 0 watches coin-port bit 0 and record 1 bit 1 (the `ror.w #1,D0` at `$13CF76`), and
  //   the I/O TEST screen names those too: `$156C2E btst #$0` = COIN 1, `$156C4C btst #$1` =
  //   COIN 2. So pendBitCoin1/pendBitCoin2 do end up meaning Coin 1 and Coin 2 -- one debounce
  //   away from the port, never directly from it.
  bitService: 5, pendBitCoin1: 0, pendBitCoin2: 1,
  creditA: 0x803958, creditB: 0x80395e,
  // The operator DIPs and the two adjacent coinage bytes.
  dipCoinage: 0x803808, dipSlot2: 0x80380b,
  coinsPerCredit: 0x803956, creditsPerCoin: 0x803957,
  // $80394C and $80394D are ADJACENT per-slot coin counters, bumped with addq.b (opcode $5239,
  // whose size field is 00 = BYTE -- $5279 would be the word form).
  // ...and they are the FIRST TWO of four adjacent pending-tick bytes $80394C..$80394F that
  // $13CC50 drains one at a time into the solenoid pulse.
  counterA: 0x80394c, counterB: 0x80394d, ticks: 0x80394c, tickCount: 4,
  service: 0x13d068, servicePort: 0xc08006, trigger: 0x13cc50,
  // $80394A is the pulse STATE and $80394B its duration -- adjacent bytes, and both are byte ops
  // ($0C39/$13FC/$5339 all carry size 00; $0C79 would be the word compare).
  pulseState: 0x80394a, pulseCount: 0x80394b, pulseFrames: 0x06,
  // ACTIVE LOW, so all ones is nothing pressed. A harness with no coin port sees no coins.
  idle: 0xffff,
  arms: Object.freeze({ credit: 0x13ce22, hook: 0x18b0d6, tail: 0x13d002 }),
});

// ---------------------------------------------------------------------------------------------
// `$13CEC8` -- THE COIN DEBOUNCE, and the reason a coin key cannot do anything without it. W375.
//
// NOTHING in the port reached this before: the whole coin chain the port models hangs off IRQ6
// (`$13CFBA`), and `$13CFBA` only ever sees bits 5/6/7 of the port because `$13CFD8 andi.w #$E0`
// throws the rest away. Coin-port bits 0 and 1 enter the game ONLY here, through the two pending
// words this routine writes.
//
// WHERE IT RUNS -- and it is NOT IRQ6. `$1453D0 jsr $13CEC8` sits inside the IRQ4 body `$13BDAA`,
// behind a phase toggle:
//
//   $1453A6  jsr $13C51A / tst.w $80FA82 / bne $1453DE     reentrancy guard
//   $1453B6  addq.w #$1,$80FA84 / andi.w #$1,$80FA84
//   $1453C4  bne.w $1453DE                                 <- runs on every OTHER IRQ4
//   $1453C8  move.w #$1,$80FA82 / jsr $13CEC8 / move.w #$0,$80FA82
//
// IRQ4 FIRES ONCE PER VIDEO FRAME. Measured in this repo: `MARK IRQ4 n=2617` against `MARK IRQ6
// n=2617` over 1,901 logic frames
// (docs/worklog/ddpdoj/02-impl-object-driver-and-overrun.md:47). A separate RTL note
// (76-recon-mister-timing.md:262) claims ~252 Hz, i.e. ~4.26 IRQ4 per frame, AND FLAGS ITSELF
// UNCALIBRATED. The two disagree; the measurement is the one taken on this build and it is what
// the numbers below use. If the RTL figure is ever confirmed, every frame count here divides by
// about 4 and the tap window becomes much shorter in wall-clock time.
//
// So `$13CEC8` runs ONCE EVERY TWO VIDEO FRAMES.
//
// THE UX FACT, and it is the whole point of porting this:
//   a credit needs the coin key HELD for 3..$26 (3..38) calls of this routine,
//   i.e. 6 TO 76 VIDEO FRAMES, ROUGHLY 0.1 s TO 1.27 s at 60 Hz.
//   Hold it LONGER and `$13CF64` writes `$0001` instead of `$0080` -- which `$13CF86` compares
//   against `$0080` and rejects -- so the coin CREDITS NOTHING, SILENTLY. No sound, no counter,
//   no message. A player leaning on the key gets nothing and has no way to tell why.
//
// `$80FA82`, the reentrancy guard at `$1453AC`, has NO MEANING in a single-threaded port: there is
// no second context that could re-enter. It is transcribed as a constant (`COIN.irq4Guard`) and
// gates NOTHING here. Same for `$80FA84`: the caller owns the phase, not this routine.
//
// THE SHAPE: two 6-byte records, `moveq #$1,D7` + `dbra`, so exactly two passes.
//
//     ($0,A0) state    ($2,A0) hold count    ($4,A0) result word
//
// and the `ror.w #1,D0` at `$13CF76` rotates the port word right by one between passes, so pass N
// tests port bit N through the SAME `btst #$0,D0`. Record 0 -> bit 0 (COIN 1), record 1 -> bit 1
// (COIN 2). `not.w D0` at `$13CED4` first: the port is ACTIVE LOW, so 1 means PRESSED.

/** `$13CEC8` -- the coin debounce. Call once per TWO video frames (see the header). Writes
 *  `$803968`/`$80396E`, which `$13CF86` then consumes on the next IRQ6.
 *
 *  Nothing drives this yet -- the main-loop wiring is a separate unit. Exported only.
 *
 *  @param ram
 *  @param {number} coinPortWord  the RAW `$C08004` word, ACTIVE LOW ($FFFF = nothing pressed)
 */
export function coinDebounce13CEC8(ram, coinPortWord) {
  // $13CECC lea $C08004,A0 / $13CED2 move.w (A0),D0 / $13CED4 not.w D0 -- ACTIVE LOW inverted
  // once, up front, for BOTH records. After this a set bit means PRESSED.
  let d0 = u16(~coinPortWord);
  let a0 = COIN.recA;                                        // $13CED6 lea $803964,A0
  for (let d7 = 1; d7 >= 0; d7--) {                          // $13CEDC moveq #$1,D7 / $13CF7C dbra
    const state = ram.u8(a0);                                // ($0,A0) -- byte, cmpi.b throughout
    const pressed = (d0 & 1) !== 0;                          // $13CEE6/$13CF0A/$13CF34 btst #$0,D0

    if (state === 0) {                                       // $13CEDE cmpi.b #$0,(A0)
      if (pressed) {                                         // $13CEEA beq $13CF76 -- idle, nothing
        ram.setU8(a0, 1);                                    // $13CEEE move.b #$1,(A0)
        ram.setU16(a0 + 4, 0);                               // $13CEF2 move.w #$0,($4,A0) -- ARMED
        ram.setU16(a0 + 2, 1);                               // $13CEF8 move.w #$1,($2,A0) -- count 1
      }
    } else if (state === 1) {                                // $13CF02 cmpi.b #$1,(A0)
      if (pressed) {
        // $13CF12 cmpi.w #$FFFF,($2,A0) / beq -- SATURATES, it does not wrap. A key held forever
        // parks the count at $FFFF, far past tapMax, and the release credits nothing.
        if (ram.u16(a0 + 2) !== 0xffff) {
          ram.setU16(a0 + 2, ram.u16(a0 + 2) + 1);           // $13CF1C addq.w #$1,($2,A0)
        }
      } else {
        ram.setU8(a0, 2);                                    // $13CF24 move.b #$2,(A0) -- NO finalise
      }
    } else if (state === 2) {                                // $13CF2C cmpi.b #$2,(A0)
      if (pressed) {
        // $13CF38 bne $13CF6E -- THE RESUME. Back to state 1 with the count UNTOUCHED, so a switch
        // that chatters open for one call keeps accumulating rather than restarting. This is the
        // debounce; state 2 is "released, but not believed yet".
        ram.setU8(a0, 1);                                    // $13CF6E move.b #$1,(A0)
      } else {
        ram.setU8(a0, 0);                                    // $13CF3C move.b #$0,(A0) -- FIRST
        const d1 = ram.u16(a0 + 2);                          // $13CF40 move.w ($2,A0),D1
        ram.setU16(a0 + 2, 0);                               // $13CF44 move.w #$0,($2,A0)
        // $13CF4A cmpi.w #$3,D1 / blt $13CF64 and $13CF52 cmpi.w #$26,D1 / bgt $13CF64.
        // INCLUSIVE at both ends: 3 and $26 are taps, 2 and $27 are not.
        const tap = d1 >= COIN.tapMin && d1 <= COIN.tapMax;
        // $13CF5A move.w #$80,($4,A0) -- THE TAP, and $0080 is what $13CF88/$13CFA0 compare for.
        // $13CF64 move.w #$1,($4,A0) -- anything else. NOT zero: it is a distinct "seen and
        // rejected" value that $13CF86's cmpi.w reads as nothing pending, so it credits NOTHING
        // and leaves no trace.
        ram.setU16(a0 + 4, tap ? COIN.pendValue : 0x0001);
      }
    }
    // else: a record whose state byte is not 0/1/2 falls straight through ($13CF30 bne $13CF76).

    d0 = u16((d0 >>> 1) | ((d0 & 1) << 15));                 // $13CF76 ror.w #$1,D0 -- next port bit
    a0 += COIN.recStride;                                    // $13CF78 lea ($6,A0),A0
  }
  // $13CF80 movem.l (A7)+ / $13CF84 rts -- no return value; the result is the two words.
}

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

/** `$18B0D6` -- THE COIN/SERVICE SOUND HOOK, and it is COUNTED AS UNPORTED, not posted.
 *
 *  THE SAME TREATMENT `irq6` GIVES `$18ACC0` at the top of this file, and for the same reason.
 *  Both live in build A's BIOS-side range; `sound.js` maps only the `$28Cxxx` `WRAPPERS` (plus
 *  `STREAMING_LEAVES`), and `postWrapper` THROWS on anything else BY DESIGN -- "an unmapped
 *  wrapper is a loud gap, not a silent drop" (sound.js:366). All three arms below call this
 *  BEFORE `coinage13CE22`, so routing it through `ctx.soundPost` means the FIRST CREDITED COIN
 *  kills the frame instead of crediting. Adding a `WRAPPERS` row to make the post succeed would
 *  be inventing an id/pan/channel the cartridge does not define here, so the call is counted.
 *
 *  WHAT IT IS, read out of `rip/sound/maincpu.bin` at RAW OFFSET $18B0D6 -- 26 bytes,
 *  $18B0D6..$18B0EF:
 *
 *      48E7 FFFE     movem.l D0-D7/A0-A6,-(A7)
 *      303C 0017     move.w  #$17,D0
 *      323C 00FF     move.w  #$FF,D1
 *      343C 0000     move.w  #$0,D2
 *      4EBA FA68     jsr     $18AB50(pc)          ; $18B0E8 - $598
 *      4CDF 7FFF     movem.l (A7)+,D0-D7/A0-A6
 *      4E75          rts
 *
 *  i.e. a three-argument wrapper around `$18AB50` with D0=$17, D1=$FF, D2=0 -- the shape of a
 *  sound post, and `$18B0F0` right behind it is the same seven instructions with D0=$1D, D1=$E4,
 *  D2=1 into the same callee. THAT CALLEE IS UNREAD: `$18AB50` opens `tst.b $80380A / bne`,
 *  `tst.w $80392A / bne`, `cmpi.w #$44,D0 / beq`, `tst.w $803926 / beq`, `cmpi.w #$17,D0 / bne`
 *  and nobody in this port has followed those branches. So what it IS believed to be is written
 *  down here and the call is COUNTED, never simulated from a guess.
 *
 *  Read under `unported` OR `unportedLog`: `Game#ctx()` carries the one log under both names
 *  (main.js:485/495) and the older unit fixtures supply only the latter, so a count is never
 *  dropped on account of which name the caller used.
 */
function coinHook18B0D6(ctx) {
  (ctx?.unported ?? ctx?.unportedLog)?.note(COIN.arms.hook,
    'coin/service sound hook $18B0D6..$18B0EF, from $13CFF0/$13D008/$13D032 -- movem, D0=$17, '
    + 'D1=$FF, D2=0, jsr $18AB50; believed a sound post, callee UNREAD, so counted not invented');
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
  if ((d1 & (1 << COIN.bitService)) !== 0) {                 // $13CFEA btst #$5,D1 -- SERVICE
    coinHook18B0D6(ctx);                                     // $13CFF0 jsr $18B0D6 -- UNPORTED
    coinage13CE22(ram, COIN.creditA);                        // $13CFF6 lea $803958 / $13CFFC bsr
    return d1;                                               // $13D000 rts -- the rest is SKIPPED
  }

  if ((d1 & (1 << COIN.pendBitCoin1)) !== 0) {               // $13D002 btst #$0,D1 -- $803968 tapped
    coinHook18B0D6(ctx);                                     // $13D008 jsr $18B0D6 -- UNPORTED
    coinage13CE22(ram, COIN.creditA);                        // $13D00E lea $803958 / $13D014 bsr
    // $13D018 -- the mechanical counter is NOT bumped on free play, so the DIP is read twice per
    // coin: once inside the converter and once here.
    if (ram.u8(COIN.dipCoinage) !== 0x12) {                  // $13D01E cmpi.b #$12 / beq
      ram.setU8(COIN.counterA, (ram.u8(COIN.counterA) + 1) & 0xff);   // $13D026 addq.b #1
    }
  }

  if ((d1 & (1 << COIN.pendBitCoin2)) !== 0) {               // $13D02C btst #$1,D1 -- $80396E tapped
    coinHook18B0D6(ctx);                                     // $13D032 jsr $18B0D6 -- UNPORTED
    // $13D03E -- slot 2 gets its OWN credit block only when $80380B is EXACTLY 1; otherwise both
    // slots share slot 1's. The lea at $13D038 is done first and then undone at $13D04A.
    const block = ram.u8(COIN.dipSlot2) === 0x01 ? COIN.creditB : COIN.creditA;
    coinage13CE22(ram, block);                               // $13D050 bsr $13CE22
    if (ram.u8(COIN.dipCoinage) !== 0x12) {                  // $13D05A cmpi.b #$12 / beq
      ram.setU8(COIN.counterB, (ram.u8(COIN.counterB) + 1) & 0xff);   // $13D062 addq.b #1
    }
  }

  counterPulse13D068(ram, ctx);                               // $13D068 -- and always, every frame

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

/** `$13D068` -- THE COIN-COUNTER PULSE, on the SECOND hardware port `$C08006`.
 *
 *  A THREE-STATE MACHINE on `$80394A` with `$80394B` as its duration, and the two are ADJACENT
 *  BYTES -- the same arrangement as `$803956`/`$803957` two routines earlier and as every other
 *  counter pair in this port:
 *
 *      0   idle. Ask `$13CC50`; if it answers, drive the port and arm 6 frames   -> 1
 *      1   count 6 frames down, then drive the port with ZERO and arm 6 more     -> 2
 *      2   count 6 frames down, then go back to idle                             -> 0
 *
 *  So one coin energises the mechanical counter for six frames and de-energises it for six. It is a
 *  SOLENOID PULSE, not a value being written once: collapsing it to a single store would leave the
 *  counter permanently energised, and nothing on screen would show it.
 *
 *  BOTH counters reload from the LITERAL `$6` written at `$13D096` and `$13D0BE`, not from a reload
 *  byte, so this pair is the one place in the family where the duration is not data.
 *
 *  `$13D084` picks WHAT is driven: `$80380B` being zero writes `#$F`, anything else writes whatever
 *  `$13CC50` returned. The shared/separate coinage DIP therefore also selects the pulse pattern.
 */
export function counterPulse13D068(ram, ctx) {
  const st = ram.u8(COIN.pulseState);

  if (st === 0) {                                            // $13D06E cmpi.b #$00 / bne
    const d0 = (ctx?.counterTrigger13CC50 ?? drainTicks13CC50)(ram);   // $13D078 bsr $13CC50
    if (d0 === 0) return;                                    // $13D07C beq $13D0EA -- nothing pending
    // $13D084 -- the DIP picks the pattern, and $F is a literal, not d0 masked.
    ctx?.coinCounterPort?.(ram.u8(COIN.dipSlot2) === 0 ? 0x000f : u16(d0));   // $13D08C/$13D092
    ram.setU8(COIN.pulseCount, COIN.pulseFrames);            // $13D096
    ram.setU8(COIN.pulseState, 1);                          // $13D09E move.b -- BYTE, like its cmpi.b
    return;
  }

  if (st === 1) {                                            // $13D0A8 cmpi.b #$01 / bne
    const left = (ram.u8(COIN.pulseCount) - 1) & 0xff;       // $13D0B2 subq.b #1
    ram.setU8(COIN.pulseCount, left);
    if (left !== 0) return;                                  // $13D0B8 bne
    ctx?.coinCounterPort?.(0x0000);                          // $13D0BA move.w #$0,(A0)
    ram.setU8(COIN.pulseCount, COIN.pulseFrames);            // $13D0BE -- the SAME literal
    ram.setU8(COIN.pulseState, 2);                          // $13D0C6
    return;
  }

  if (st === 2) {                                            // $13D0D0 cmpi.b #$02 / bne
    const left = (ram.u8(COIN.pulseCount) - 1) & 0xff;       // $13D0DA subq.b #1
    ram.setU8(COIN.pulseCount, left);
    if (left !== 0) return;                                  // $13D0E0 bne
    ram.setU8(COIN.pulseState, 0);                          // $13D0E2 -- back to idle
  }
}

/** `$13CC50` -- THE PENDING-TICK DRAIN, and the thing that closes D35's coin loop.
 *
 *  FOUR ADJACENT BYTES at `$80394C..$80394F`, one per mechanical counter, and four identical blocks
 *  over them. Each non-zero byte is decremented by ONE and contributes ONE BIT to D0:
 *
 *      $80394C -> bit 0     $80394E -> bit 2
 *      $80394D -> bit 1     $80394F -> bit 3
 *
 *  It DRAINS, it does not read: `subq.b #1` per call, so a counter standing at 3 produces three
 *  separate pulses on three separate passes. That is what makes the whole thing a queue -- the coin
 *  arms bump `$80394C`/`$80394D` when a credit is taken, and this hands the ticks out one at a time
 *  to `$13D068`'s six-frame solenoid pulse. Draining the whole byte at once would fire one pulse for
 *  three coins and the operator's counter would under-read.
 *
 *  The `tst.w D0` at `$13CC9A` is the routine's answer: `$13D07C beq` exits when nothing was
 *  pending, and otherwise D0 IS the bit pattern driven to `$C08006`.
 */
export function drainTicks13CC50(ram) {
  let d0 = 0;                                                // $13CC50 moveq #$0,D0
  for (let i = 0; i < 4; i++) {                              // $13CC52/$13CC64/$13CC76/$13CC88
    const at = COIN.ticks + i;
    if (ram.u8(at) === 0) continue;                          // tst.b / beq
    ram.setU8(at, (ram.u8(at) - 1) & 0xff);                  // subq.b #1 -- ONE tick, not the lot
    d0 |= (1 << i);                                          // ori.w #$1 / #$2 / #$4 / #$8
  }
  return d0;                                                 // $13CC9A tst.w D0 -- Z is the answer
}
