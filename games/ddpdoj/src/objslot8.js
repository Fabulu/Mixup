// OBJECT DISPATCH [8], `$25A770` -- THE ATTRACT-MODE SEQUENCER AND THE BOOT-TO-PLAY GATE. W375.
//
// `$240F62[8] = $25A770`, priority `$000A`. This is the routine that turns a credit into a game:
// every other front-end slot is a screen, and this one is the machine that picks which screen runs
// and, on a START press with a credit behind it, stages slot [9] with the JOIN MASK and hands the
// cartridge over to gameplay.
//
// **`$812E56` IS THE STATE, NOT `($2,A5)`.** `($2,A5)` is a one-bit "constructed" flag -- the first
// frame finds it zero and runs arm 0, and it is never cleared again. `($3,A5)` is the per-arm
// "inited" flag, and `$25A764` clears it on EVERY transition, which is what makes each arm's
// `tst.b ($3,A5) / bne` an init-once gate rather than a state test. `$812E56` is a WORD in main RAM
// shared by every slot-8 instance, with exactly ONE writer (`$25A764`).
//
// THE JUMP TABLE AT `$25A872` HAS NO BOUND. There is no `cmpi`, no mask and no `andi` anywhere on
// the path from `$25A862` to `$25A86C`; fifteen entries is stated only by where arm 0's body begins
// at `$25A8AE`. Safety is a WRITER CENSUS, not a check: `$812E56`'s single writer is fed from
// `$1 $2 $5 $9 $C $E` and `($4,A5)`, and the five sites that stage a slot-8 record set `($4,A5)` to
// `$2`, `$3` or `$D`. So the reachable set is `{0,1,2,3,5,9,12,13,14}` plus whatever a caller puts
// in `($4,A5)`. This port models the table faithfully and NOTES an out-of-range state rather than
// clamping -- see `objSlot8`'s tail.
//
// SCOPE. W375 ported the SEQUENCER, not the screens. Arms 0, 5's teardown, 13 and 14, the
// `$25ACAC` join handler, the `$25A770` credit gate and the `$25A82C` dispatch tail are here in
// full. **W389 ported arm 12's `$25C2AE`/`$25C2EA`, W390 arm 9's `$25C3E8`/`$25C424`, W391
// arms 1 and 3's `$25BBB4 $25BD7C $25BDE0`, and W392 arm 5's `$25C592`/`$25C6D4` -- so NO screen
// sub-machine is NOTED any more.** Arm 5 was the last one. **ARM 2
// IS WHOLE**: its per-frame body `hiscoreScreen25B412` is ported in `hiscorescreen.js`, and W375b
// adds its init `$25B3DC` here as `hiscoreInit25B3DC`, so arm 2 initialises, runs and really does
// advance to state 12 when the screen finishes.
//
// **WHY `$25B3DC` WAS THE ONE THAT MATTERED.** `$25B412` reads `$812E60` as a chain handle and
// `$24681A` walks `($2C,handle)` with no null check, so on a cold boot -- `$812E60` zero -- the
// first frame after the `13 -> 2` transition threw `Unreached: $2C is outside main RAM`. `$25B3DC`
// is what fills that handle, and with it in place the reset path `($4,A5) = $D -> arm 13 -> the
// $12C timeout -> state 2 -> the high-score screen` runs without throwing.
//
// **THE ATTRACT LOOP CLOSES, AND IT CYCLES.** W392 ports arm 5's `$25C592`/`$25C6D4`, so the
// carry `$25A9AE bcs` reads really is computed: after `$10` + `$960` - 1 = 2,415 frames it comes
// out CLEAR, `teardown25A9B2` restages slot [8] at state 2, and the sequencer goes round again.
// Measured on a real cold boot, three laps of exactly 4,032 frames:
//
//     13 -> 2 -> 12 -> 9 -> 1 -> 5 -> 2 -> 12 -> 9 -> 1 -> 5 -> 2 -> ...
//     +1  +302 +574 +878 +1182 +1918 +4334 +4606 +4910 +5214 +5950 +8366
//
// Arms 0, 1, 2, 3, 5, 9, 12, 13 and 14 are complete and `3 -> 14 -> gameplay` is live too. What
// is left NOTED in this file is presentation and sound, not a screen: `$25AD02` (the blink
// message's ON half, a 1,754-byte dispatcher), the three `$28C0FC`/`$28C170` cue posts, arm 12's
// `$25BB6C` TX plane block and `$28CAE2`, and arm 5's `$26070C` demo handoff. NONE of them gates
// the state machine.
//
// **W377 CLOSED THE COIN CRASH AND HALF THE BLINK PAIR.** Arm 3's `$25A962 jsr $28C170` and the
// three `jsr $28C0FC` in the two teardowns were `ctx.soundPost` calls, and BOTH addresses go
// through the `$28BBAC`/`$28BB76` packers that `sound.js` has no posting path for -- so posting
// either THREW. On a cold boot the first one killed the run one frame after a coin credited.
// All four are counted deferrals now; see `arm3` and `cueStreamNote`. `$25AFD8`, the OFF half of
// the blink message, is ported in `fronttext.js` and called for real from the tail. `$25AD02`,
// the ON half, is NOT the mirror of it -- it is a 1,754-byte dispatcher through $25B3DB with two
// embedded data blocks and a second copy for separate credit pools -- and stays noted.
//
// **W376 CLOSED THE TWO THAT MADE THE LOOP SILENT AND BLANK.** `$259FF8` (arm 13's string
// emitter, the warning screen) and `$23CFDE` (the credit / FREE PLAY line) are ported in
// `fronttext.js` and called for real from `arm13` and `dispatchTail25A82C` below. Neither is
// noted any more, and that is the point: a `note()` is a COUNTED deferral, and one left standing
// beside a live call would make the unported report claim a gap this port no longer has.

import { u16 } from './ram.js';
import { clearTx23C622, clearSlotTable23C668, camReset } from './background.js';
import { install2414BE, install24150A, install2415E8 } from './palette.js';
import { stageCreate, objTableInit24107C } from './objalloc.js';
import { clear23C47A } from './stageend.js';
import { clear25C57E } from './objslot9.js';
import { menuDips23C932 } from './tallyscreen.js';
import { hiscoreScreen25B412 } from './hiscorescreen.js';
import { loadAnimObjects246410 } from './animobjects.js';
// W389 -- arm 12's screen is arm 2's twin and uses the same three chain primitives.
import { chainCheck24681A, chainFree246800, chainLoader246710 } from './stageend.js';
// W392 -- arm 5's banner ($28E7F8/$28E7A2/$28E7DC) and its one-shot handoff ($26070C).
import { SE, banner28E7F8 } from './stageend.js';
import { txPrint240DC2 } from './hud.js';
import {
  enqueueRegistersThroughStub, enqueueZoomedRegistersThroughStub,
} from './spritequeue.js';
import { txFontString259FF8, creditLine23CFDE, blinkOff25AFD8 } from './fronttext.js';

export const SCREEN8 = Object.freeze({
  entry: 0x25a770, setState: 0x25a764, tail: 0x25a82c, table: 0x25a872, dispatch: 0x240f62,
  join: 0x25acac, arm0: 0x25a8ae, teardown: 0x25a9b2, armsEnd: 0x25a8ae,

  // --- main RAM, shared by every slot-8 instance
  state: 0x812e56,        // $25A764 move.w D0 -- THE state. One writer, seven feeds.
  blink: 0x812e58,        // $25A838 addq.w #1 -- the free-running blink counter
  joinMask: 0x812e5a,     // $25ACAC clr.b / $25ACCA ori.b #$1 / $25ACE8 ori.b #$2

  // --- the object record, off A5
  constructed: 0x02,      // $25A770 tst.b ($2,A5) -- ONE BIT, set once by arm 0
  inited: 0x03,           // $25A8E6 etc; $25A764 clears it on every transition
  param: 0x04,            // ($4,A5): arm 0's INITIAL STATE, and arm 13's timeout
  cursor: 0x06,           // arm 13 only -- the byte offset into the string block
  y: 0x08,                // arm 13 only -- the sprite Y, stepping DOWN
  delay: 0x0a,            // arm 13 only -- frames until the next line

  // --- machine globals
  dip: 0x803808,          // $25A796 cmpi.b #$12 -- the config byte
  dipCredit: 0x80380b,    // $23CA06 -- 1 = SEPARATE credit pools, see creditTake23C9F0
  freePlay: 0x12, coinMode: 0x11,
  coinA: 0x803958, coinB: 0x80395e,       // $23C956's two counters
  creditA: 0x80395a, creditB: 0x803960,   // $23C932's two counters
  dualGate: 0x803926,     // $25A7D2 tst.w -- sound.js's SOUND.gateDual
  p1Raw: 0x803970, p2Raw: 0x803976,       // $23D16C / $23D17E
  startBit: 0x8000,       // btst #$F

  // --- constants the arms carry
  selfType: 0x08,         // $25A81A / $25A9CA move.w #$8,D0 -- it restages ITSELF
  restageState: 0x0003,   // $25A824 move.w #$3,($4,A0) -- a WORD over ($4,A0) and ($5,A0)
  teardownState: 0x0002,  // $25A9D4 move.w #$2,($4,A0)
  joinChildType: 0x09,    // $25AC98 move.w #$9,D0 -- slot [9], the gameplay seeder
  joinField: 0x04,        // $25ACA2 move.b $812E5A,($4,A0) -- a BYTE; SEED9.mask reads it
  txPalMain: 0x222638,    // $25A806 / $25A924 lea -- THIRTY-TWO bytes through $2414BE
  txPalWarn: 0x222618,    // $25A99A / $25AC08 lea -- likewise 32
  cueStream: 0x28c0fc, cueWrapper: 0x28c5b0, cueBgm: 0x28c170,

  // --- the blink (ON still NOTED; OFF is W377-LIVE) and the credit line (W376: LIVE) --
  //     both halves live in fronttext.js
  blinkMask: 0x10,        // $25A844 andi.w #$10 -- 16 frames on, 16 off
  blinkOn: 0x25ad02, blinkOff: 0x25afd8, creditLine: 0x23cfde,

  // --- arm 13's warning screen
  warnStrings: 0x25aa36,  // $25AC50 lea ($25AA36,PC),A0 -- EA = $25AC52 + $FDE4
  warnEnd: 0x01c0,        // $25AC36 cmpi.w #$1C0 -- 14 lines of $20
  warnStep: 0x20, warnYStep: 0x0c, warnY0: 0x00b8, warnDelay: 0x0001,
  warnTimeout: 0x012c,    // $25AC28 move.w #$12C,($4,A5) -- 300 frames
  warnEmit: 0x259ff8,     // $25AC64 jsr $259FF8 -- the sprite string emitter
});

/**
 * The fifteen `bra.w` targets at `$25A872`, in state order. Read out of ROM by
 * `w375slot8.test.js` rather than trusted: each entry is `60 00 <disp>` and the target is
 * `entry + 2 + disp`, the extension word's own address plus the displacement.
 *
 * States 4, 6, 7, 8, 10 and 11 are bare `rts`, and 7 and 8 SHARE `$25A9E4` -- two table
 * entries pointing at one instruction, which is why this is a list of addresses and not a
 * list of functions.
 */
export const ARM_TARGETS = Object.freeze([
  0x25a8ae, 0x25a8e6, 0x25a912, 0x25a94a, 0x25a974,
  0x25a97c, 0x25a9e2, 0x25a9e4, 0x25a9e4, 0x25a9e6,
  0x25aa0c, 0x25aa0e, 0x25aa10, 0x25abf6, 0x25ac92,
]);

// ---------------------------------------------------------------------------------------------
// The four leaves this file transcribes rather than notes.

/**
 * `$25A764` -- SET THE STATE. Twelve bytes, and it sits BELOW the dispatch entry:
 *
 *     clr.b ($3,A5) / move.w D0,($812E56).l / rts
 *
 * The `clr.b` is the half a summary loses. Every arm gates its own setup on `($3,A5)`, so
 * clearing it here is what re-arms the NEXT arm's init -- a port that only wrote `$812E56`
 * would leave every screen after the first one un-initialised.
 */
export function setState25A764(ram, a5, d0) {
  ram.setU8(a5 + SCREEN8.inited, 0);            // $25A764 clr.b ($3,A5)
  ram.setU16(SCREEN8.state, u16(d0));           // $25A766 move.w D0,$812E56
}

/** `$23D16C` (P1) / `$23D17E` (P2) -- the RAW input word. EIGHT BYTES each,
 *  `move.w ($803970/$803976).l,D0 / rts`, so they are transcribed here rather than noted:
 *  a `note()` for two instructions would make the join poll untestable and buy nothing.
 *  `objslot13.js` already documents the same pair as a descriptor field. */
export function startRaw23D16C(ram, side) {
  return ram.u16(side === 0 ? SCREEN8.p1Raw : SCREEN8.p2Raw);
}

/**
 * `$23C956` -- THE TWO COIN COUNTERS, or zeroes. Thirty-four bytes, `$23C956..$23C979`:
 *
 *   move.b $803808,D0 / cmpi.b #$12,D0 / bne $23C968
 *   moveq #0,D0 / moveq #0,D1 / rts             <- FREE PLAY answers (0, 0)
 *   $23C968: moveq #0,D0 / moveq #0,D1 / D0 = $803958.b / D1 = $80395E.b
 *
 * It is `$23C932`'s TWIN -- same prologue, same `$12` test, different pair of counters
 * ($803958/$80395E instead of $803958's neighbours $80395A/$803960). `menuDips23C932` is
 * already ported in `tallyscreen.js` and this is its four-line sibling, so transcribing it
 * costs less than a note and keeps the coin gate testable. The `moveq #$0,Dn` before each
 * `move.b` is what makes both bytes ZERO-EXTENDED.
 */
export function coinCount23C956(ram) {
  if (ram.u8(SCREEN8.dip) === SCREEN8.freePlay) return [0, 0];   // $23C95C cmpi.b / bne
  return [ram.u8(SCREEN8.coinA), ram.u8(SCREEN8.coinB)];         // $23C96C / $23C972
}

/** `$23D060` (P1, `$80395A`) / `$23D070` (P2, `$803960`) -- SPEND ONE CREDIT.
 *  `move.b <c>,D0 / beq / subq.b #1,<c> / rts` -- sixteen bytes, and the `beq` means a
 *  zero counter is left alone rather than wrapping to $FF. */
function creditSpend23D060(ram, addr) {
  const n = ram.u8(addr);                       // $23D060 move.b
  if (n === 0) return;                          // $23D066 beq
  ram.setU8(addr, n - 1);                       // $23D068 subq.b #1
}

/**
 * `$23C98E` -- TAKE A P1 CREDIT. **@returns `true` when the credit was REFUSED**, which is
 * the `bcs` at `$25ACC6`: the routine's whole product is the carry, and its two epilogues
 * are `$23CAAC moveq #0,D0 / rts` (carry CLEAR, accepted) and `$23CAB0 ori #$1,SR / rts`
 * (carry SET, refused).
 *
 * THIS FILE PORTS TWO OF ITS THREE ARMS AND NOTES THE THIRD, deliberately. The brief for
 * this wave listed `$23C98E`/`$23C9F0` as "note them", but a noted credit consumer makes
 * `$25ACAC` unable to ever return a set join mask, and `$25ACAC` is THE exit to gameplay --
 * noting it would mean porting the boot gate in a shape that cannot boot. The three arms:
 *
 *   dip $12 (FREE PLAY)  $23C9A0 beq $23CAAC          -> ACCEPT, always, spending nothing
 *   dip $11 (coin mode)  $23C9A8/$23C9AA jsr $23C956  -> NOTED. It compares the coin count
 *                        against $803959 and runs on into $23D080, the coin-to-credit
 *                        conversion; that is a wave with the coin hardware in it.
 *   otherwise            $23C9D6 jsr $23C932 / tst.w D0 / beq $23CAB0
 *                        -> D0 is $80395A. Zero refuses; non-zero spends through $23D060.
 *
 * `moveq #$1,D3` at `$23C98E` is what makes this the COMMITTING entry -- `$23C994` is a
 * second entry point two bytes in that sets D3 = 0 and only PEEKS. `$25ACAC` calls the
 * committing one, so `D3 != 0` is a constant here rather than a parameter.
 */
export function creditTake23C98E(ram, ctx) {
  const dip = ram.u8(SCREEN8.dip);                             // $23C996 move.b $803808,D0
  if (dip === SCREEN8.freePlay) return false;                  // $23C9A0 beq $23CAAC -- ACCEPT
  if (dip === SCREEN8.coinMode) {                              // $23C9A4 cmpi.b #$11
    ctx?.unported?.note(0x23c9aa,
      '$23C9AA -- $23C98E\'s COIN arm: jsr $23C956, cmp against $803959.b, then $23D080. The '
      + 'coin-to-credit conversion is not ported, so this port refuses the credit rather than '
      + 'inventing one');
    return true;
  }
  const [d0] = menuDips23C932(ram);                            // $23C9D6 jsr $23C932
  if (d0 === 0) return true;                                   // $23C9DA tst.w D0 / beq $23CAB0
  creditSpend23D060(ram, SCREEN8.creditA);                     // $23C9E6 jsr $23D060
  return false;                                                // $23C9EC bra $23CAAC
}

/**
 * `$23C9F0` -- TAKE A P2 CREDIT, and **it is NOT `$23C98E` with the other address in it.**
 *
 * It reads a SECOND dip byte, `$80380B`, that `$23C98E` never touches:
 *
 *     $23CA06  move.b $80380B,D1 / cmpi.b #$1,D1 / beq $23CA60
 *
 * `$80380B == 1` is SEPARATE credit pools: `$23CA92` reads D1 (`$803960`) and spends through
 * `$23D070`. Anything else is a SHARED pool, and `$23CA46` reads **D0 -- `$80395A`, P1's
 * counter** -- and spends through `$23D060`, P1's. So on a default machine two players join
 * out of one pile of credits, and a port that mirrored `$23C98E` onto `$803960` would let P2
 * join for free while P1's credits sat untouched.
 *
 * Same three-arm shape and same `true = refused` contract as `creditTake23C98E`; the `$11`
 * coin arm is noted for the same reason.
 */
export function creditTake23C9F0(ram, ctx) {
  const dip = ram.u8(SCREEN8.dip);                             // $23C9F8
  if (dip === SCREEN8.freePlay) return false;                  // $23CA02 beq $23CAAC
  // $23CA06/$23CA0C -- read BEFORE the $11 test, and it selects between two whole tails.
  const separate = ram.u8(SCREEN8.dipCredit) === 1;
  if (dip === SCREEN8.coinMode) {                              // $23CA14 or $23CA60
    ctx?.unported?.note(separate ? 0x23ca66 : 0x23ca1a,
      '$23C9F0\'s COIN arm: jsr $23C956, cmp against $80395F.b, then $23D080/$23D098. Not '
      + 'ported; the credit is refused rather than invented');
    return true;
  }
  const [d0, d1] = menuDips23C932(ram);                        // $23CA46 or $23CA92 jsr $23C932
  const credits = separate ? d1 : d0;                          // $23CA96 tst.w D1 / $23CA4A tst.w D0
  if (credits === 0) return true;                              // beq $23CAB0
  creditSpend23D060(ram, separate ? SCREEN8.creditB : SCREEN8.creditA);   // $23CAA2 / $23CA56
  return false;
}

// ---------------------------------------------------------------------------------------------
// The two ctx-shaped gaps this file has to route round, both pre-existing and both counted.

/** `$24631C` -- `stageend.js` HAS this routine (`clear24631C`, stageend.js:280) but does NOT
 *  export it, and `Game#ctx()` does not carry it either. `objslot13.js:210` and
 *  `objslot14.js:63` both reach for `ctx.clear24631C?.(ram)` and both SILENTLY skip it when it
 *  is absent; this file does the same reach but counts the miss, so the gap is visible in the
 *  unported report instead of being a quiet no-op. Registration is the coordinator's call. */
function clear24631C(ram, ctx, site) {
  if (ctx?.clear24631C) { ctx.clear24631C(ram); return; }
  ctx?.unported?.note(0x24631c, `$${site.toString(16).toUpperCase()} jsr $24631C -- stageend.js `
    + 'defines clear24631C but does not export it, and Game#ctx() does not supply it');
}

/** `$2414BE` -- install a TX palette bank. THIRTY-TWO bytes, not 64: `$2414C8 lsl.w #$5` is
 *  five, and a TX bank is 32 bytes. Guarded on `ctx.palette` the way `objslot9.js` guards its
 *  fifteen installs, because a chain without a `PaletteState` must count the miss rather than
 *  throw on `undefined`. */
function installTxBank(ram, rom, ctx, src, site, why) {
  if (!ctx?.palette) {
    ctx?.unported?.note(0x2414be, `$${site.toString(16).toUpperCase()} -- TX bank 0 <- $${
      src.toString(16).toUpperCase()} with no PaletteState on this chain`);
    return;
  }
  install2414BE(ram, ctx.palette, 0, rom.bytes(src, 32), site, why);
}

// ---------------------------------------------------------------------------------------------
// `$25B3DC` -- ARM 2'S INIT, and the one routine that stood between slot [8] and a cold boot.

/**
 * `$25B3DC` -- FIFTY-FOUR bytes, `$25B3DC..$25B411`, verified out of the raw image:
 *
 *     25B3DC  48e7fffe            movem.l  d0-d7/a0-a6,-(a7)
 *     25B3E0  41f900812e5c        lea      $812E5C,a0
 *     25B3E6  303c0004            move.w   #$4,d0
 *     25B3EA  7200                moveq    #$0,d1
 *     25B3EC  30c1                move.w   d1,(a0)+
 *     25B3EE  51c8fffc            dbra     d0,$25B3EC
 *     25B3F2  33fc00f000812e5e    move.w   #$F0,$812E5E
 *     25B3FA  41fa064a            lea      ($25BA46,pc),a0
 *     25B3FE  4e71                nop
 *     25B400  4eb90024641a        jsr      $24641A
 *     25B406  23c000812e60        move.l   d0,$812E60
 *     25B40C  4cdf7fff            movem.l  (a7)+,d0-d7/a0-a6
 *     25B410  4e75                rts
 *
 * FIVE THINGS THE BRIEF FOR THIS WAVE GOT WRONG, all settled by the opcodes above:
 *
 *   * It is 54 bytes, not 52, and the routine BEFORE it does not end in an `rts`: `$25B3D4`
 *     is `jmp $25A14C.l`, a tail jump, padded by a `nop` at `$25B3DA`.
 *   * It clears FIVE words, not six -- `$812E5C $5E $60 $62 $64`. `move.w #$4,D0` with `dbra`
 *     is five iterations, and `$812E5C` is the FIRST of them rather than a separate clear.
 *   * The clear is none of the three forms the brief listed. It is not `clr.w` (`4279`), not
 *     `clr.l` (`42B9`) and not `move.w #$0000` (`33FC`): it is `moveq #$0,D1` feeding
 *     `move.w D1,(A0)+` in a `dbra` loop, so the SIZE is a word and the COUNT is in D0.
 *   * `$812E5E := $F0` is a `move.w` IMMEDIATE (`33FC 00F0`), not a table read -- and being a
 *     word literal it covers two byte fields: `$812E5E` = `$00` and `$812E5F` = `$F0`.
 *   * There is a `nop` at `$25B3FE`, between the `lea` and the `jsr`, that no summary mentions.
 *
 * `$25B3FA lea ($25BA46,PC),A0` is the extension-word rule again: the extension word lives at
 * `$25B3FC` and the displacement is `$064A`, so the EA is `$25B3FC + $64A = $25BA46` -- NOT
 * `$25B3FA + $64A`.
 *
 * **`$24641A` IS `$246410` WITH D6 = 0**, and `animobjects.js` already says so and already
 * ports it: `$246410` is `movem.l D1-D7/A0-A4 / move.w #$1,D6 / bra $246422` and `$24641A` is
 * `movem.l D1-D7/A0-A4 / move.w #$0,D6` falling into the same `$246422` body. Its contract,
 * read off the body rather than assumed:
 *
 *   IN   A0 = the table. `$24643C move.w (A0)+,D0` is the entry count and every entry is
 *             fourteen bytes.
 *   OUT  **D0**, and D0 is the one register `movem.l D1-D7/A0-A4` does not save. `$246508
 *        move.l A1,D0` returns the ROOT ADDRESS -- a RAM POINTER into the three-slot pool at
 *        `$810346`, stride `$30` -- and `$246518 moveq #$FF,D0` is the failure.
 *
 * So the handle in `$812E60` is a **RAM POINTER, not an index**, and `($2C,handle)` in
 * `$24681A` is a plain read of the root's link word. `chainCheck24681A` in `stageend.js`
 * reads it exactly that way, which is why a zero `$812E60` throws at `$2C`.
 */
export const HISCORE_INIT = Object.freeze({
  site: 0x25b3dc, end: 0x25b412,   // $25B3DC..$25B411 inclusive -- 54 bytes
  clearBase: 0x812e5c,             // $25B3E0 lea $812E5C,A0
  clearWords: 5,                   // $25B3E6 move.w #$4,D0 -- dbra runs 4,3,2,1,0
  timer: 0x812e5e,                 // $25B3F2 move.w #$F0,$812E5E -- SCREEN_STATE.timer
  timer0: 0x00f0,                  // the immediate, not a table read
  handle: 0x812e60,                // $25B406 move.l D0 -- a LONG over $812E60 and $812E62
  script: 0x25ba46,                // $25B3FA -- EA = $25B3FC + $64A
  loader: 0x24641a,                // $25B400 -- $246410 with D6 = 0
  // The bound the CODE states, not adjacency: `$24643C move.w (A0)+,D0` reads the count and
  // the body consumes fourteen bytes per entry. `rom.u16($25BA46)` is 7, so the script is
  // `2 + 7*14 = $64` bytes, `$25BA46..$25BAA9` -- and it ends exactly where W303's already
  // declared `$25BAAA` window (`$25B412`'s own chain script) begins.
  scriptEntries: 7, entryStride: 14, scriptLen: 0x64,
});

/**
 * `$25B3DC` in full. The `movem.l D0-D7/A0-A6` pair at either end saves and restores every
 * register, so this routine's whole effect is the five words, the `$F0` and the handle.
 *
 * **THE ROM WINDOW THIS NEEDS.** `$25BA46 + $64` is not in `tools/export-tables.py`'s window
 * list -- the nearest declared window is W303's `$25BAAA + $42`, which starts one byte past
 * this script's end. Under `RomWindows` the `rom.u16($25BA46)` below therefore raises
 * `Unreached`. Widening a window is the coordinator's call, not this file's, so the need is
 * REPORTED here with its code-stated bound rather than taken.
 */
export function hiscoreInit25B3DC(ram, rom, ctx) {
  // $25B3EC/$25B3EE -- move.w D1,(A0)+ / dbra D0, with D1 = 0 from the moveq. FIVE words.
  for (let i = 0; i < HISCORE_INIT.clearWords; i++) {
    ram.setU16(HISCORE_INIT.clearBase + i * 2, 0);
  }
  // $25B3F2 -- a WORD immediate, written AFTER the loop already zeroed the same address.
  ram.setU16(HISCORE_INIT.timer, HISCORE_INIT.timer0);
  // $25B400 jsr $24641A -- the existing port, called with mode 0. It returns the root
  // address; `move.l D0,$812E60` stores it as a LONG over the two words the loop just cleared.
  const d0 = loadAnimObjects246410(ram, rom, HISCORE_INIT.script, 0);   // $24641A: D6 = 0
  ram.setU32(HISCORE_INIT.handle, d0 >>> 0);                            // $25B406
  if (d0 === 0) {
    // `$246518 moveq #$FF,D0` -- the cartridge's failure value is $FFFFFFFF, and
    // `loadAnimObjects246410` returns 0 for the same two failures (no free root, pool
    // exhausted). Both are outside main RAM at `($2C,handle)`, so the screen throws either
    // way and nothing here is invented; the DIVERGENCE is counted rather than papered over.
    ctx?.unported?.note(0x246518,
      '$25B400 jsr $24641A returned the port\'s failure marker 0, where the cartridge returns '
      + '$FFFFFFFF (moveq #$FF,D0 at $246518). The animation-object root pool at $810346 or the '
      + 'node pool at $80FA86 was full');
  }
}

// ---------------------------------------------------------------------------------------------
// `$25ACAC` -- THE JOIN HANDLER, and the only way out of the front end.

/**
 * `$25ACAC` -- POLL START AND BUILD THE JOIN MASK. Eighty-four bytes, `$25ACAC..$25AD01`.
 *
 * Called from exactly two places, and they are not the same kind of call:
 *   * `$25A7A2 bsr.w` -- EVERY FRAME, but only under FREE PLAY (`$25A796 cmpi.b #$12`), and
 *     from the entry, BEFORE the dispatch tail. See the same-frame trap in `objSlot8`.
 *   * `$25A96E bsr.w` -- arm 3, the CREDIT screen, unconditionally.
 *
 * THE MASK IS CLEARED FIRST, every call. It is not accumulated across frames: a player who
 * presses START and is refused leaves no trace, and a player still holding START from last
 * frame is polled again. `$812E5A` therefore means "who joined THIS frame", and arm 14 copies
 * it into the new slot-[9] record before anything can clear it again.
 *
 * `btst #$F` on the raw input word, so bit 15 SET is pressed. The `bcs` after each credit take
 * is the REFUSAL: a pressed START with no credit sets no bit, and if neither bit ends up set
 * the `tst.b / beq` at `$25ACF0` returns WITHOUT touching the state.
 */
export function joinPoll25ACAC(ram, a5, ctx) {
  ram.setU8(SCREEN8.joinMask, 0);                              // $25ACAC move.b #$0,$812E5A
  if ((startRaw23D16C(ram, 0) & SCREEN8.startBit) !== 0) {     // $25ACB4/$25ACBA btst #$F / beq
    if (!creditTake23C98E(ram, ctx)) {                         // $25ACC0 jsr / $25ACC6 bcs
      ram.setU8(SCREEN8.joinMask, ram.u8(SCREEN8.joinMask) | 0x01);   // $25ACCA ori.b #$1
    }
  }
  if ((startRaw23D16C(ram, 1) & SCREEN8.startBit) !== 0) {     // $25ACD2/$25ACD8
    if (!creditTake23C9F0(ram, ctx)) {                         // $25ACDE jsr / $25ACE4 bcs
      ram.setU8(SCREEN8.joinMask, ram.u8(SCREEN8.joinMask) | 0x02);   // $25ACE8 ori.b #$2
    }
  }
  if (ram.u8(SCREEN8.joinMask) === 0) return;                  // $25ACF0 tst.b / beq $25AD00
  setState25A764(ram, a5, 0x0e);                               // $25ACF8/$25ACFC -> STATE 14
}

// ---------------------------------------------------------------------------------------------
// The arms.

/**
 * ARM 0, `$25A8AE` -- INIT. Reached only from `$25A774`, on the first frame of the record's
 * life, and it is the one arm the jump table's entry 0 also points at.
 *
 * **`move.w ($4,A5),D0` is the CREATOR'S initial state.** Every site that stages a slot-8
 * record writes `($4,A0)` immediately after `$241182` returns -- `$25A824` writes `#$3`,
 * `$25A9D4` writes `#$2`, and reset stages it with `$D`. A word literal over two byte fields
 * (`($4,A0) = $00`, `($5,A0) = $03`), read straight back out here as a word.
 */
function arm0(ram, a5, ctx) {
  ram.setU8(a5 + SCREEN8.constructed, 1);                      // $25A8AE move.b #$1,($2,A5)
  const d0 = ram.u16(a5 + SCREEN8.param);                      // $25A8B4 move.w ($4,A5),D0
  setState25A764(ram, a5, d0);                                 // $25A8B8 bsr.w $25A764
  ram.setU8(SCREEN8.joinMask, 0);                              // $25A8BC clr.b $812E5A
  ram.setU16(SCREEN8.blink, 0);                                // $25A8C2 move.w #$0,$812E58
  // $25A8CA jsr $23C668 -- UNCONDITIONAL in the cartridge, but `Game#ctx()` does not supply
  // `slotTable`. `background.js:1612` and `tallyscreen.js:964` both guard the same call the
  // same way; this one counts the miss so it stays visible.
  if (ctx?.slotTable) clearSlotTable23C668(ctx.slotTable);
  else {
    ctx?.unported?.note(0x23c668,
      '$25A8CA jsr $23C668 -- 256 longwords at $907000, UNCONDITIONAL in the cartridge. '
      + 'Game#ctx() carries no slotTable, so the clear cannot run');
  }
  clear23C47A(ram);                                            // $25A8D0 jsr $23C47A
}

/** ARM 1, `$25A8E6` -- the DEMO, and W391 ports both halves; see `ARM1SCREEN` below. Init
 *  clears TX and runs `$25BBB4`; every frame runs `$25BD7C`, whose CARRY CLEAR means "finished"
 *  and advances to state 5. `$25A904 bcs -> $25A910 rts` is the hold; `$25A908 move.w #$5,D0 /
 *  $25A90C bsr.w $25A764` is the advance. */
function arm1(ram, rom, a5, ctx) {
  if (ram.u8(a5 + SCREEN8.inited) === 0) {                     // $25A8E6 tst.b / $25A8EA bne
    ram.setU8(a5 + SCREEN8.inited, 1);                         // $25A8EC move.b #$1,($3,A5)
    clearTx23C622(ctx.tx);                                     // $25A8F2 jsr $23C622
    screen1Init25BBB4(ram, rom, ctx);                          // $25A8F8 jsr $25BBB4
  }
  if (!screen1Body25BD7C(ram, rom, ctx)) {                     // $25A8FE jsr / $25A904 bcs
    setState25A764(ram, a5, 0x05);                             // $25A908 move.w #$5 / $25A90C
  }
}

/**
 * ARM 2, `$25A912` -- THE HIGH-SCORE SCREEN, and the only arm whose body is already ported.
 *
 * `hiscoreScreen25B412` returns the carry as a boolean: `true` = still running, `false` =
 * finished. So the `bcs $25A948` at `$25A93E` is `if (!running) setState(12)`, and this arm
 * genuinely advances.
 *
 * **AND ITS INIT IS NOW REAL, which is what makes a cold boot survive.** `$25B412` opens with
 * `cmpi.w #$0,$812E5C / bne` and then `move.l $812E60,D0 / jsr $24681A`, and `$24681A` walks
 * `($2C,handle)` with no null check. On a freshly zeroed RAM `$812E5C` is 0, so the compare
 * FALLS THROUGH, `$812E60` is 0, and the walk reads `$2C` -- `Unreached: $2C is outside main
 * RAM`, on the first frame after `13 -> 2`. `hiscoreInit25B3DC` is the routine that puts a
 * real root address in `$812E60`, and it runs here exactly once, gated by `($3,A5)`.
 */
function arm2(ram, rom, a5, ctx) {
  if (ram.u8(a5 + SCREEN8.inited) === 0) {                     // $25A912/$25A916
    ram.setU8(a5 + SCREEN8.inited, 1);                         // $25A918
    clearTx23C622(ctx.tx);                                     // $25A91E jsr $23C622
    // $25A924 lea $222638,A0 / $25A92A moveq #0,D0 / $25A92C jsr $2414BE
    installTxBank(ram, rom, ctx, SCREEN8.txPalMain, 0x25a92c, 'slot [8] arm 2 TX palette');
    hiscoreInit25B3DC(ram, rom, ctx);                          // $25A932 jsr $25B3DC
  }
  if (!hiscoreScreen25B412(ram, rom, ctx)) {                   // $25A938 jsr / $25A93E bcs
    setState25A764(ram, a5, 0x0c);                             // $25A940/$25A944 -> state 12
  }
}

/**
 * ARM 3, `$25A94A` -- THE CREDIT SCREEN. One of the three states the entry's coin check skips
 * (`$25A786 cmpi.w #$3`), because it IS the screen a coin drops you on.
 *
 * It polls `$25ACAC` unconditionally and every frame, which is the other half of the free-play
 * poll at `$25A7A2`: free play joins from any state, coin play joins only from here.
 *
 * `$25A962 jsr $28C170` -- a BGM cue in the init that the brief for this wave did not list.
 * Verified at `$25A962: 4E B9 00 28 C1 70`, and `$28C170` is an already-known cue.
 *
 * **W377: THAT CUE IS A COUNTED NOTE, NOT A `soundPost`, AND THAT IS WHAT KILLED THE COIN.**
 * `$28C170` has no row in `sound.js`'s `WRAPPERS` and must not be given one -- see that file's
 * header: it loads D0/D1 and calls `$28BBAC`, a DIFFERENT packer from the `$28BB04` every
 * `WRAPPERS` row describes, with no id, no pan and no channel nibble. `postWrapper` therefore
 * THROWS `no wrapper at $28C170`. Five other files still post it (`boss.js:1210` and `:1284`,
 * `objslot13.js:208`, `objslot7pool.js:556`, `tally.js:400`) and every one of them will throw the
 * same way when reached -- but arm 3 was the only one ON THE COLD-BOOT COIN PATH, and the others
 * are not this file's to change.
 *
 * On a cold boot that throw is reached by the shortest path a player has: insert a coin ->
 * `$80395A` 0 -> 1 -> the entry's coin gate tears down and restages at state 3 -> the very next
 * frame arm 3's init runs this line and the run dies. `background.js:1047` and
 * `hiscorescreen.js:544` already note this same address at their own call sites for this same
 * reason; arm 3 was the outlier that posted it. It is now the third counted deferral.
 */
function arm3(ram, rom, a5, ctx) {
  if (ram.u8(a5 + SCREEN8.inited) === 0) {                     // $25A94A/$25A94E
    ram.setU8(a5 + SCREEN8.inited, 1);                         // $25A950
    clear24631C(ram, ctx, 0x25a956);                           // $25A956 jsr $24631C
    screen1Init25BBB4(ram, rom, ctx);                          // $25A95C jsr $25BBB4
    // $25A962 jsr $28C170 -- verified `4E B9 00 28 C1 70`. $28C170 -> $28BBAC D0=$15 (BGM
    // command), the tier sound.js has no posting path for.
    ctx?.unported?.note(SCREEN8.cueBgm,
      '$25A962 jsr $28C170 -- the credit screen\'s BGM cue. $28C170 -> $28BBAC D0=$15 (BGM '
      + 'command), NOT the $28BB04 packer every sound.js WRAPPERS row describes, so posting it '
      + 'throws. Counted here exactly as background.js:1047 and hiscorescreen.js:544 count it');
  }
  screen3Body25BDE0(ram, rom, ctx);                            // $25A968 jsr $25BDE0 -- no `bcs`
  joinPoll25ACAC(ram, a5, ctx);                                // $25A96E bsr.w $25ACAC
}

/** States 4, 6, 7, 8, 10 and 11 -- `$25A974`, `$25A9E2`, `$25A9E4` (twice), `$25AA0C`,
 *  `$25AA0E`. Each is a bare `rts` and nothing else; 7 and 8 share ONE of them. */
function armRts() { /* $25A974 / $25A9E2 / $25A9E4 / $25AA0C / $25AA0E -- rts */ }

/**
 * `$28C0FC` -- THE SECOND CUE IN THIS FILE THAT `soundPost` CANNOT POST, COUNTED AT ITS THREE
 * CALL SITES. W377.
 *
 * Exactly the same defect as arm 3's `$28C170`, found while fixing it, in the same file, and one
 * of the three sites is on the coin path itself. Decoded off the image:
 *
 *     28C0FC  48E7 FFFE       movem.l D0-D7/A0-A6,-(A7)
 *     28C100  4EB9 0028BB76   jsr     $28BB76
 *     28C106  4CDF 7FFF       movem.l (A7)+,D0-D7/A0-A6
 *     28C10A  4E75            rts
 *
 *     28BB76  48E7 F000       movem.l D0-D3,-(A7)
 *     28BB7A  7010            moveq   #$10,D0
 *     28BB7C  E148            lsl.w   #8,D0        -> D0.w = $1000
 *     28BB7E  4840            swap    D0           -> D0   = $10000000
 *     28BB80  6100 FF1E       bsr     $28BAA0
 *     28BB84  4CDF 000F       movem.l (A7)+,D0-D3
 *     28BB88  4E75            rts
 *
 * So `$28C0FC` posts the bare longword `$10000000`: type $10, no id, no pan, no channel nibble,
 * no gate and no pan tail -- the `$28BBxx` family again, not the `$28BB04` packer that every
 * `sound.js` `WRAPPERS` row describes. `sound.js` carries `$28C0FC` in its `ENTRY` table (as
 * `type $10, gate none, tail false`) but `postWrapper` looks in `WRAPPERS` and `STREAMING_LEAVES`
 * only, so `ctx.soundPost(0x28C0FC)` throws `no wrapper at $28C0FC`. Verified: neither table has
 * it (`w377coin.test.js`).
 *
 * **THE THREE SITES, AND WHICH OF THEM A PLAYER CAN REACH.**
 *   `$25A7E2` -- coin teardown, behind `tst.w $803926` (the dual-play gate). Reachable.
 *   `$25A7FA` -- coin teardown, behind `cmpi.w #$C,$812E56`. Reachable: attract reaches state 12
 *                from arm 2, and a coin inserted there took this branch and threw.
 *   `$25A9DA` -- arm 5's teardown, which today needs the unported `$25C6D4` to hand it a clear
 *                carry, so it is a time bomb rather than a live crash.
 * Both coin sites were proved to throw before this change; see `w377coin.test.js`.
 *
 * A `$28BBxx`-tier posting path in `sound.js` would close all of these AND `$28C170` at once, and
 * that is a sound wave, not this file's to write. Until then: counted, never invented.
 */
function cueStreamNote(ctx, site) {
  ctx?.unported?.note(SCREEN8.cueStream,
    `$${site.toString(16).toUpperCase()} jsr $28C0FC -- $28C0FC -> $28BB76 posts the bare `
    + 'longword $10000000 (type $10), NOT the $28BB04 packer every sound.js WRAPPERS row '
    + 'describes, so posting it throws. Counted, as arm 3 counts $28C170');
}

/**
 * `$25A9B2` -- ARM 5's TEARDOWN, exported because the carry that reaches it comes from the
 * unported `$25C6D4` and so the arm itself can never run it yet.
 *
 * **It restages slot [8] -- ITSELF -- at state 2.** `move.w #$8,D0` is this very dispatch
 * type, and `move.w #$2,($4,A0)` is the `($4,A5)` arm 0 will read on the new record's first
 * frame. So the front end's "screen finished" is a suicide-and-respawn, not a state write.
 *
 * A0 IS THE STAGED RECORD. `$241182` leaves it there and does not restore the caller's, which
 * is what makes `$25A9D4` land on the new record rather than on this one's `($4,A5)`.
 * `$241182` also takes the priority from the DISPATCH TABLE (`$240F62 + t*8 + 4`), never from
 * the caller -- hence the callback.
 *
 * **W377: `$25A9DA jsr $28C0FC` IS A COUNTED NOTE FOR THE SAME REASON ARM 3'S `$28C170` IS.**
 * See `cueStreamNote` below.
 */
export function teardown25A9B2(ram, rom, ctx) {
  objTableInit24107C(ram);                                     // $25A9B2 jsr $24107C
  clear24631C(ram, ctx, 0x25a9b8);                             // $25A9B8 jsr $24631C
  clear25C57E(ram);                                            // $25A9BE jsr $25C57E
  clearTx23C622(ctx.tx);                                       // $25A9C4 jsr $23C622
  const made = stageCreate(ram, SCREEN8.selfType,              // $25A9CA move.w #$8,D0 / $25A9CE
    (t) => rom.u16(SCREEN8.dispatch + t * 8 + 4));
  // $25A9D4 move.w #$2,($4,A0) -- A0, NOT A5, and a WORD over ($4,A0) and ($5,A0). Written
  // unconditionally: on a full queue $241182 hands back the DUMMY at $80D51C and the cartridge
  // writes through it just the same.
  ram.setU16(made.addr + SCREEN8.joinField, SCREEN8.teardownState);
  cueStreamNote(ctx, 0x25a9da);                                // $25A9DA jsr $28C0FC
  return made;
}

/** ARM 5, `$25A97C` -- the screen whose carry chooses the teardown above. `$25A994 move.w
 *  #$0,($4,A5)` clears its OWN parameter word during init, which is why the teardown's `#$2`
 *  has to go through A0.
 *
 *  W392: both halves are real calls now. The carry is `screen5Body25C6D4`'s return, and `false`
 *  -- carry CLEAR -- is what `$25A9AE bcs` lets fall into the teardown. */
function arm5(ram, rom, a5, ctx) {
  if (ram.u8(a5 + SCREEN8.inited) === 0) {                     // $25A97C/$25A980
    ram.setU8(a5 + SCREEN8.inited, 1);                         // $25A982
    screen5Init25C592(ram, rom, ctx);                          // $25A988 jsr $25C592
    clearTx23C622(ctx.tx);                                     // $25A98E jsr $23C622
    ram.setU16(a5 + SCREEN8.param, 0);                         // $25A994 move.w #$0,($4,A5)
    // $25A99A lea $222618,A0 / $25A9A0 moveq #0,D0 / $25A9A2 jsr $2414BE
    installTxBank(ram, rom, ctx, SCREEN8.txPalWarn, 0x25a9a2, 'slot [8] arm 5 TX palette');
  }
  if (!screen5Body25C6D4(ram, rom, ctx)) {                     // $25A9A8 jsr / $25A9AE bcs
    teardown25A9B2(ram, rom, ctx);                             // $25A9B2 -- CARRY CLEAR only
  }
}

// ---------------------------------------------------------------------------------------------
// W392 -- ARM 5'S SCREEN, `$25C592` (init) AND `$25C6D4` (body): **THE DEMO-PLAY SCREEN**.
// ---------------------------------------------------------------------------------------------
//
// **THE BRIEF ASKED "WHICH CHAIN DOES THE EXIT WAIT ON?" AND THE ANSWER IS: NEITHER. THERE IS
// NO CHAIN.** `$25C592` contains no `jsr $24641A`, no `jsr $246710`, no `$812E76`-style handle
// and no `$24681A` poll anywhere in `$25C6D4`. Arms 12, 9 and 1 are chain screens; arm 5 is a
// pair of DOWN-COUNTERS, and the whole exit is:
//
//   $25C726  subq.w #1,$812E84   /  bne  ->  state 0 lasts $10 = 16 frames
//   $25C7AC  subq.w #1,$812E86   /  bne  ->  state 1 lasts $960 = 2,400 frames
//
// The two states FALL THROUGH ($25C79A jsr $26070C runs and then drops into `$25C7A0 cmpi.w
// #$1`), so the frame that arms state 1 also takes the first tick off `$812E86` -- 16 + 2,400
// frames of arm 5 with the exit ON the 2,415th, not the 2,416th.
//
// **AND IT IS NOT A "SCREEN" AT ALL. IT IS THE DEMO.** `$25C596 move.w #$1,$803926` raises the
// same word the coin gate reads at `$25A7D2` and the handoff reads at `$26075E`; `$25C7FC`
// drops it again on the way out. `$803928` is the demo INDEX and `$25C7DE`/`$25C7E4` rotate it
// 0 -> 1 -> 2 -> 0, so three consecutive attract cycles play three different demos.
//
// THE CLEAR IS FIFTEEN WORDS AND ITS LAST FOUR ARE TWO POINTER LONGS -- question 2's shape a
// third time, and wider than any arm so far. `$25C59E bsr.s $25C57E` is `clear25C57E`, which
// `objslot9.js` already exports and this file already imported for the teardown:
//
//   25C57E  41f9 00812e82   lea $812E82,A0
//   25C584  303c 000e       move.w #$E,D0     <- TRAP 2: dbra runs N+1 = FIFTEEN
//   25C588  7200 / 30c1 / 51c8 fffc
//
// so `$812E82..$812E9F`, and `$812E98`/`$812E9C` are the demo replay stream and the record
// buffer. **Order matters**: the clear runs AFTER `$803926` is raised and BEFORE the two
// timers are written, so a port that hoisted it would zero `$812E84` and `$812E86` again.
//
// THE DRAW EMITS NO SPRITES. `$25C6F8 jsr $240DC2` is `txPrint240DC2` -- the TX printer W116
// ported -- with D0=$88, D1=0, D2=5, D3=$1B, so `$240DDC`'s outer `dbra` runs SIX times and
// `$240DF8`'s inner one TWENTY-EIGHT: **168 TX cells a frame and zero sprite-queue records**.
// Arm 1 emitted seven sprites through two emitters; arm 5 emits none through either.
//
// FOUR CALLEES, AND WHAT EACH ONE IS:
//   `$28E7A2` -- the banner buffer clear, `$81DFAC` + $28 words. Already transcribed in
//                `stageend.js` as the PRIVATE `clear28E7A2`; the two lines below run over that
//                file's own exported `SE.banner`/`SE.bannerWords` so the width cannot drift.
//   `$28E7F8` -- `banner28E7F8`, exported by `stageend.js` and called for real. Both of its
//                entry guards (`$81DFF8`, `$81DFF6`) are inside the block `$28E7A2` just
//                cleared, so it is a genuine no-op until `$25C77A` arms it.
//   `$28E7DC` -- one word, `$81DFF6 := 1`. That is what switches the banner on.
//   `$23BDDA` -- `lea $80390A,A0 / move.w #$6,D0 / dbra`: SEVEN words (trap 2 again),
//                `$80390A..$803916`. It resets the very counter the draw's parity reads.
//   `$26070C` -- the one-shot handoff, and the ONE counted deferral in the pair. It is ported
//                (`objslot17.js`'s `handoff26070C`) and its `$813082` gate really is armed by
//                the type-$A record this arm stages, so calling it boots a stage for real --
//                and the SECOND demo's ship then reaches an unported option formation 31 frames
//                later. Measured both ways; see `handoffNote`.
//
// TWO DEAD STORES, both transcribed rather than tidied away, because a port that dropped them
// would not be reading the same instructions the cartridge does:
//   `$25C740 move.w #$2,$812E90` is overwritten by `$25C748 move.w #$1,$812E90` with nothing
//   in between, and `$25C738 move.b #$1,$812E94` is overwritten by `$25C760 move.w D0,$812E94`
//   -- a BYTE store into the high half of a word the next store replaces whole (trap 3).
//
// THE CODEC `$25C60C` IS **NOT** CALLED FROM HERE. Its single caller in the image is
// `$23D116`, inside the raw input read `$23D0F8`, behind `tst.b $803940` -- and `input.js`'s
// own header records that `$23D0F8` never executes in this port. So the demo streams are
// primed by `$25C750..$25C76E` and then never advanced here; that is the cartridge's structure,
// not an omission of this file's.
export const ARM5SCREEN = Object.freeze({
  init: 0x25c592, initEnd: 0x25c60c,     // $25C592..$25C60B -- `4E75` AT $25C60A (trap 5)
  body: 0x25c6d4, bodyEnd: 0x25c808,     // $25C6D4..$25C807 -- `4E75` AT $25C806
  initBytes: 0x7a, bodyBytes: 0x134,

  demoFlag: 0x803926,                    // $25C596 move.w #$1 / $25C7FC move.w #$0
  demoIndex: 0x803928,                   // $25C5B4 read / $25C7DE addq.w #1 / $25C7E4 cmpi #$3
  demoCount: 3,

  clear: 0x25c57e, clearBase: 0x812e82, clearWords: 15,   // $25C584 #$E + dbra (trap 2)
  state: 0x812e82,                       // and the clear's FIRST word is the state
  timerA: 0x812e84, timerAInit: 0x0010,  // $25C5A0 / $25C726
  timerB: 0x812e86, timerBInit: 0x0960,  // $25C5A8 / $25C7AC
  anim: 0x812e88,                        // $25C6E4 adda.w / $25C70C addq.w #4 / $25C712 andi #$F
  animStep: 4, animMask: 0x000f,
  x: 0x812e8a, y: 0x812e8c, w8e: 0x812e8e,   // $25C5C4/$25C5CA/$25C5D0, and $25C784/$25C78A
  codecMode: 0x812e90,                   // $25C740 #$2 then $25C748 #$1 -- the first is DEAD
  codecVal: 0x812e92, codecRun: 0x812e94,    // $25C738 a BYTE, $25C760 the WORD over it
  codecOff: 0x812e96,                    // $25C756 / $25C76E addq.w #2
  script: 0x812e98, recBuf: 0x812e9c,    // $25C5D6 / $25C5DC -- the clear's last four words

  ptrTable: 0x25c542, ptrEntries: 3, tableBytes: 0x3c,
  blocks: Object.freeze([0x25c54e, 0x25c55e, 0x25c56e]), blockBytes: 0x10,
  animTable: 0x25c808, animEntries: 4, animTableBytes: 0x10,
  demoScripts: Object.freeze([0x239fb8, 0x23a7b8, 0x23afb8]), scriptSpan: 0x800,

  rankType: 0x0a,                        // $25C5E2 move.w #$A,D0 -- dispatch [10], $260794
  palSrc: 0x2227f8, palBank: 0x0c,       // $25C5F6 lea / $25C5FC move.w #$C,D0
  txPrint: 0x240dc2,                     // $25C6F8 jsr
  drawD0: 0x0088, drawD1: 0x0000, drawD2: 0x0005, drawD3: 0x001b,   // $25C6EC..$25C6F6
  drawRows: 6, drawCols: 28, drawCells: 168,   // both `dbra`s run N+1 (trap 2)
  frameCounter: 0x80390a,                // $25C6FE move.w / $25C704 andi.w #$1
  counterBase: 0x80390a, counterWords: 7,      // $23BDDA -- `move.w #$6,D0` + dbra
  bannerClear: 0x28e7a2, banner: 0x28e7f8, bannerArm: 0x28e7dc,
  counterClear: 0x23bdda, handoff: 0x26070c, codec: 0x25c60c,
  handoffD2: 0x00ff, handoffD3: 0x00ff, handoffD4: 0x0001,   // $25C790/$25C794/$25C798
});

/** `$23BDDA` -- `lea $80390A,A0 / move.w #$6,D0 / moveq #0,D1 / move.w D1,(A0)+ / dbra`.
 *  SEVEN words, `$80390A..$803916`, and the first of them is the free-running frame counter
 *  `main.js`'s `#counters()` bumps -- so arm 5 restarts the demo's clock, it does not stop it. */
function counterClear23BDDA(ram) {
  for (let i = 0; i < ARM5SCREEN.counterWords; i++) {          // $23BDE0 #$6 + dbra = SEVEN
    ram.setU16(ARM5SCREEN.counterBase + i * 2, 0);             // $23BDE6 move.w D1,(A0)+
  }
}

/** `$28E7A2` -- `lea $81DFAC,A0 / move.w #$27,D0 / dbra`: FORTY words over the banner buffer.
 *  `stageend.js` transcribed this in W124 as the private `clear28E7A2`; this runs over that
 *  file's own exported `SE.banner` and `SE.bannerWords`, so the address and the width are one
 *  definition even though the loop is written twice. Exporting the function instead is a
 *  one-line change in a file W392 does not own. */
function bannerClear28E7A2(ram) {
  for (let i = 0; i <= SE.bannerWords - 1; i++) ram.setU16(SE.banner + i * 2, 0);
}

/**
 * `$25C592..$25C60B`, 122 bytes -- ARM 5'S INIT. `movem.l D0-D7/A0-A6` at both ends (trap 9),
 * so it is register-transparent and returns nothing; everything it does is in RAM.
 *
 *     25C592  48e7 fffe                 movem.l D0-D7/A0-A6,-(A7)
 *     25C596  33fc 0001 00803926        move.w #$1,$803926        <- the DEMO flag, up
 *     25C59E  61de                      bsr.s $25C57E             <- FIFTEEN words, $812E82..9F
 *     25C5A0  33fc 0010 00812e84        move.w #$10,$812E84
 *     25C5A8  33fc 0960 00812e86        move.w #$960,$812E86
 *     25C5B0  41fa ff90                 lea ($25C542,PC),A0       <- trap 4: $25C5B2 - $70
 *     25C5B4  3439 00803928             move.w $803928,D2
 *     25C5BA  d442 / 25C5BC d442        add.w D2,D2 twice         <- index * 4, a WORD
 *     25C5BE  2070 2000                 movea.l (A0,D2.w),A0      <- and D2.w SIGN-EXTENDS
 *     25C5C2  3e18                      move.w (A0)+,D7
 *     25C5C4  33d8 00812e8a             move.w (A0)+,$812E8A
 *     25C5CA  33d8 00812e8c             move.w (A0)+,$812E8C
 *     25C5D0  33d8 00812e8e             move.w (A0)+,$812E8E
 *     25C5D6  23d8 00812e98             move.l (A0)+,$812E98      <- the replay stream
 *     25C5DC  23d8 00812e9c             move.l (A0)+,$812E9C      <- the record buffer
 *     25C5E2  303c 000a                 move.w #$A,D0
 *     25C5E6  4eb9 00241182             jsr $241182               <- stage dispatch type $A
 *     25C5EC  3147 0004                 move.w D7,($4,A0)         <- A0 is the STAGED record
 *     25C5F0  4eb9 0028e7a2             jsr $28E7A2
 *     25C5F6  41f9 002227f8             lea $2227F8,A0
 *     25C5FC  303c 000c                 move.w #$C,D0             <- TX bank TWELVE, not 0
 *     25C600  4eb9 002414be             jsr $2414BE
 *     25C606  4cdf 7fff / 25C60A 4e75
 *
 * **TRAP 11 AGAIN, AND IT IS THE POINT OF THE ROUTINE.** `$241182` leaves the STAGED record in
 * A0, so `$25C5EC move.w D7,($4,A0)` writes the demo INDEX into the new type-$A record's
 * parameter word -- exactly the shape `teardown25A9B2`'s `#$2` has. Dispatch type $A is
 * `$260794`, the rank object, and its state-0 init `$2605C8` is what sets `$813082` -- the
 * one-shot gate the body's `$26070C` consumes sixteen frames later.
 */
export function screen5Init25C592(ram, rom, ctx) {
  const A = ARM5SCREEN;
  ram.setU16(A.demoFlag, 1);                                   // $25C596
  clear25C57E(ram);                                            // $25C59E bsr.s -- FIFTEEN words
  ram.setU16(A.timerA, A.timerAInit);                          // $25C5A0 -- AFTER the clear
  ram.setU16(A.timerB, A.timerBInit);                          // $25C5A8
  // $25C5B4/$25C5BA/$25C5BC/$25C5BE. The index is NOT bounded anywhere on this path; a value
  // past 2 walks off the table and the ROM window throws by address, which is the honest
  // outcome. `$25C7E4`'s `cmpi.w #$3` is the only thing keeping it in range.
  const d2 = u16(ram.u16(A.demoIndex) * 4);                    // add.w D2,D2 twice, a WORD
  let a0 = rom.u32(A.ptrTable + ((d2 << 16) >> 16));           // movea.l (A0,D2.w),A0
  const d7 = rom.u16(a0); a0 += 2;                             // $25C5C2 move.w (A0)+,D7
  ram.setU16(A.x, rom.u16(a0)); a0 += 2;                       // $25C5C4
  ram.setU16(A.y, rom.u16(a0)); a0 += 2;                       // $25C5CA
  ram.setU16(A.w8e, rom.u16(a0)); a0 += 2;                     // $25C5D0
  ram.setU32(A.script, rom.u32(a0)); a0 += 4;                  // $25C5D6 -- a LONG
  ram.setU32(A.recBuf, rom.u32(a0)); a0 += 4;                  // $25C5DC -- a LONG
  const made = stageCreate(ram, A.rankType,                    // $25C5E2 #$A / $25C5E6 jsr
    (t) => rom.u16(SCREEN8.dispatch + t * 8 + 4));
  ram.setU16(made.addr + SCREEN8.param, d7);                   // $25C5EC move.w D7,($4,A0)
  bannerClear28E7A2(ram);                                      // $25C5F0 jsr $28E7A2
  // $25C5F6/$25C5FC/$25C600 -- bank $C, NOT the bank 0 `installTxBank` hard-codes.
  if (ctx?.palette) {
    install2414BE(ram, ctx.palette, A.palBank, rom.bytes(A.palSrc, 32), 0x25c600,
      'slot [8] arm 5 demo-play TX palette');
  } else {
    ctx?.unported?.note(0x2414be, `$25C600 -- TX bank ${A.palBank} <- $${
      A.palSrc.toString(16).toUpperCase()} with no PaletteState on this chain`);
  }
  return made;
}

/**
 * `$25C79A jsr $26070C` -- **COUNTED, AND THE ONLY DEFERRAL IN THE PAIR THAT COSTS ANYTHING.**
 *
 * `handoff26070C` is exported by `objslot17.js` and it is fully live: `$813082` is set for real
 * by the type-$A record `$25C592` stages (`rank.js`'s `rankInit2605C8`, `$260666`), so the call
 * fires and `stageStart260580` boots a stage. W392 MEASURED it both ways on a real cold boot:
 *
 *   WITH the call   13 -> 2 -> 12 -> 9 -> 1 -> 5 -> 2 -> 12 -> 9 -> 1 -> 5
 *                   +1, +302, +574, +878, +1182, +1918, +4334, +4606, +4910, +5214, +5950
 *                   ...then THREW at +5,996:
 *                   `UNPORTED $24C4F8: option formation 4` -- 31 frames into the SECOND demo.
 *   WITHOUT it      the same eleven transitions, and 12,000 frames without a throw.
 *
 * The three demo blocks hand `$26070C` (style, ship) = (2,2), (0,4) and (2,6). Demo 0's pair is
 * inside what `handlers.js` translated; demo 1's ship 4 lands on `$24C356`'s jump-table arm
 * `$24C4F8`, which wave 4 did not port and which no file W392 owns can supply. So driving the
 * handoff from here does not make the attract loop cycle -- it makes it die on the second lap,
 * on a gap in the OPTION subsystem that has nothing to do with slot [8]. Counted, with the
 * frame number, exactly as arm 3 counts `$28C170`.
 *
 * Nothing else in arm 5 reads what the handoff writes: `$813080`..`$81308A` and `$81315C` are
 * never touched by `$25C592` or `$25C6D4`, and the exit is the `$812E86` counter alone.
 */
function handoffNote(ctx, d0, d1) {
  ctx?.unported?.note(ARM5SCREEN.handoff,
    `$25C79A jsr $26070C -- arm 5's demo handoff with D0=$${d0.toString(16).toUpperCase()}, `
    + `D1=$${d1.toString(16).toUpperCase()}, D2=D3=$FF, D4=1. handoff26070C is ported and the `
    + '$813082 gate really is set by the type-$A record this arm stages, so the call fires and '
    + 'boots a stage -- and 31 frames into the SECOND demo it reaches $24C4F8, option formation '
    + '4, which wave 4 did not port. Measured: +5,996 on a cold boot. Counted so the loop laps');
}

/**
 * `$25C6D4..$25C807`, 308 bytes -- ONE FRAME OF THE DEMO SCREEN.
 *
 * @returns {boolean} the CARRY. `true` (`$25C7D0 ori #$1,SR`) means still running and
 *   `$25A9AE bcs` skips the teardown; `false` (`$25C804 move.w D0,D0`, which the 68000 defines
 *   as clearing C) means finished and the teardown runs. Same convention arms 9, 12 and 1 use,
 *   reached by the same two instructions.
 *
 * THE TWO STATES ARE FALL-THROUGH, NOT ELSE-IF (trap 7). `$25C722 bne $25C7A0` and `$25C72C
 * bne $25C7A0` both jump to the state-1 compare, and the state-0 body's last instruction is
 * `$25C79A jsr $26070C`, which drops straight into it. So the arming frame is also the first
 * counted frame of `$812E86`.
 */
export function screen5Body25C6D4(ram, rom, ctx) {
  const A = ARM5SCREEN;
  banner28E7F8(ram, ctx, rom);                                 // $25C6D8 jsr $28E7F8
  // $25C6DE lea ($25C808,PC),A0 / $25C6E2 nop / $25C6E4 adda.w $812E88,A0 / $25C6EA move.l (A0),D4
  const d4 = rom.u32(A.animTable + ram.u16(A.anim));
  // $25C6EC #$88 / $25C6F0 #$0 / $25C6F4 moveq #$5 / $25C6F6 moveq #$1B / $25C6F8 jsr $240DC2.
  // SIX rows of TWENTY-EIGHT cells, and not one sprite-queue record.
  txPrint240DC2(ram, A.drawD0, A.drawD1, A.drawD2, A.drawD3, d4);
  if ((ram.u16(A.frameCounter) & 1) === 0) {                   // $25C6FE/$25C704/$25C708 bne
    // $25C70C addq.w #4 / $25C712 andi.w #$F -- four entries, two frames each.
    ram.setU16(A.anim, (ram.u16(A.anim) + A.animStep) & A.animMask);
  }
  if (ram.u16(A.state) === 0) {                                // $25C71A cmpi.w #$0 / $25C722 bne
    const t = u16(ram.u16(A.timerA) - 1);                      // $25C726 subq.w #1
    ram.setU16(A.timerA, t);
    if (t === 0) {                                             // $25C72C bne
      ram.setU16(A.state, 1);                                  // $25C730
      ram.setU8(A.codecRun, 1);                                // $25C738 a BYTE -- DEAD, see below
      ram.setU16(A.codecMode, 2);                              // $25C740 -- DEAD, see below
      ram.setU16(A.codecMode, 1);                              // $25C748 -- and this one wins
      // $25C750 movea.l $812E98,A0 / $25C756 adda.w $812E96,A0: prime the replay stream from
      // its first PAIR -- a run length and a value, the two fields `$25C60C` walks.
      const p = (ram.u32(A.script) + ((ram.u16(A.codecOff) << 16) >> 16)) >>> 0;
      ram.setU16(A.codecRun, rom.u8(p));                       // $25C75C moveq #0 / $25C75E/$25C760
      ram.setU8(A.codecVal, rom.u8(p + 1));                    // $25C766 move.b ($1,A0),$812E92
      ram.setU16(A.codecOff, u16(ram.u16(A.codecOff) + 2));    // $25C76E addq.w #2
      counterClear23BDDA(ram);                                 // $25C774 jsr $23BDDA -- SEVEN words
      ram.setU16(SE.dff6, 1);                                  // $25C77A jsr $28E7DC
      // $25C780..$25C79A -- the ONE-SHOT HANDOFF, the same `$26070C` the ship-select screen
      // fires. D0/D1 are the block's two words; D2/D3 are `#$FF` (both sides "not joined",
      // which is what `$25F460`'s `bmi` skips) and D4 is 1, where a human's is 0.
      handoffNote(ctx, ram.u16(A.x), ram.u16(A.y));            // $25C79A jsr $26070C
    }
  }
  if (ram.u16(A.state) === 1) {                                // $25C7A0 cmpi.w #$1 -- FALL-THROUGH
    const t = u16(ram.u16(A.timerB) - 1);                      // $25C7AC subq.w #1
    ram.setU16(A.timerB, t);
    if (t === 0) {                                             // $25C7B2 bne
      // $25C7B6 jsr $23C608 -- `lea $B02000 / move.w #$0` then `lea $B03000 / move.w #$0`.
      // NOT `$23C61E`: that one runs `$23C5F2` first and sets tx_xscroll to ONE. Arm 5 enters
      // at $23C608 and touches the BACKGROUND pair only.
      if (ctx?.videoRegs) { ctx.videoRegs.bg_yscroll = 0; ctx.videoRegs.bg_xscroll = 0; }
      ctx?.bgVram?.clear23C638?.();                            // $25C7BC jsr $23C638
      camReset(ram);                                           // $25C7C2 jsr $240B0E
      // $25C7C8 bra $25C7D6 -- THE EXIT.
      ram.setU16(A.codecMode, 0);                              // $25C7D6
      const n = u16(ram.u16(A.demoIndex) + 1);                 // $25C7DE addq.w #1
      // $25C7E4 cmpi.w #$3 / $25C7EC blt -- a SIGNED compare, and the reset writes zero.
      ram.setU16(A.demoIndex, ((n << 16) >> 16) < A.demoCount ? n : 0);
      ram.setU16(A.demoFlag, 0);                               // $25C7FC -- the demo flag, down
      return false;                                            // $25C804 move.w D0,D0 -- C CLEAR
    }
  }
  return true;                                                 // $25C7D0 ori #$1,SR -- C SET
}

// ---------------------------------------------------------------------------------------------
// W389 -- ARM 12'S SCREEN, `$25C2AE` (init) AND `$25C2EA` (body). ARM 2'S TWIN, EXACTLY.
// ---------------------------------------------------------------------------------------------
//
// **AND THE BRIEF FOR THIS WAVE HAD IT BACKWARDS ABOUT WHICH LOADER MATTERS.** It said the arm
// waits on the chain its init builds through `$24641A` -- the loader that already seeds content --
// and so might drain the moment it was transcribed. The sweep says otherwise:
//
//   25C2CC  41fa 00ea       lea ($EA,PC),A0          -> $25C2CE+$EA = $25C3B8   THE INIT SCRIPT
//   25C2D2  4eb9 0024641a   jsr $24641A              <- 14-byte entries, seeds content
//   25C2D8  23c0 00812e76   move.l D0,$812E76
//   ...
//   25C334  41fa 00a0       lea ($A0,PC),A0          -> $25C336+$A0 = $25C3D6   A SECOND SCRIPT
//   25C33A  4eb9 00246710   jsr $246710              <- 8-byte entries, and THIS is the one
//   25C340  23c0 00812e76   move.l D0,$812E76        <- OVERWRITING the init's handle
//
// State 0 waits on the init's chain and FREES it (`$25C30A jsr $246800`); state 1 counts `$812E74`
// down from `$F0` and loads the SECOND chain through `$246710`; state 2 waits on THAT. So arm 12's
// exit depended on exactly the defect W388 found and W389 folded, in exactly the same place arm 2
// did. The two screens are the same machine with different scripts and one extra cue.
//
// THE BOUNDS ARE IN THE DATA, not in an absence: `$25C3B8` is `count 2` and `2 + 2*14 = $1E` lands
// on `$25C3D6`; `$25C3D6` is `count 2` and `2 + 2*8 = $12` lands on `$25C3E8`, which is `48E7`,
// the `movem.l` opening ARM 9's init -- a routine this file already names.
//
// TWO CALLEES STAY COUNTED, and neither can hold the machine:
//   `$25BB6C` -- 19 instructions writing `$900000`, the TX tile plane. Presentation, unclaimed by
//                any file in the port, and the same tier as arm 1/3's `$25BBB4` next door.
//   `$28CAE2` -- `move.w #$44,D0 / #$FF,D1 / #$14,D2 / bsr $28C02A`, a sound post through a
//                different packer than `sound.js`'s `WRAPPERS` describes. Counted for the same
//                reason arm 3's `$28C170` is: posting it would THROW.
export const SCREEN12 = Object.freeze({
  init: 0x25c2ae, initEnd: 0x25c2ea,   // $25C2AE..$25C2E9 -- 60 bytes, `rts` AT $25C2E8
  body: 0x25c2ea,
  state: 0x812e72,                     // $25C2B2 lea $812E72,A0 -- and the $25C2EE cmpi base
  clearWords: 4,                       // $25C2B8 move.w #$3,D0 -- dbra runs FOUR times
  timer: 0x812e74,                     // $25C2C4 move.w #$F0,$812E74
  timerInit: 0xf0,
  handle: 0x812e76,                    // $25C2D8 / $25C340 move.l D0,$812E76
  initScript: 0x25c3b8,                // $25C2CC lea ($EA,PC),A0 -- $24641A's, 14 bytes/entry
  loadScript: 0x25c3d6,                // $25C334 lea ($A0,PC),A0 -- $246710's, 8 bytes/entry
  scriptNodes: 2,                      // both count words
  txBlock: 0x25bb6c,                   // $25C2DE jsr $25BB6C -- counted
  cue: 0x28cae2,                       // $25C318 jsr $28CAE2 -- counted
  draw: 0x25c39c,                      // $25C374 bsr.w -> $25C376 + $26
  emit: 0x23dece,                      // $25C3B0 jmp $23DECE -- a TAIL jump out of the draw
  drawD1: 0x20000e00, drawD2: 0x00336164, drawD3: 0x1870,
});

/** `$25C2AE` -- arm 12's screen INIT. Four words cleared, the `$F0` timer armed, the first chain
 *  loaded through `$24641A` and its handle stored. */
export function screen12Init25C2AE(ram, rom, ctx) {
  for (let i = 0; i < SCREEN12.clearWords; i++) {              // $25C2B8 #$3 + dbra = FOUR
    ram.setU16(SCREEN12.state + i * 2, 0);                     // $25C2BE move.w D1,(A0)+
  }
  ram.setU16(SCREEN12.timer, SCREEN12.timerInit);              // $25C2C4
  // $25C2D2 jsr $24641A -- `$246410` with D6 = 0, which `animobjects.js` already ports.
  ram.setU32(SCREEN12.handle, loadAnimObjects246410(ram, rom, SCREEN12.initScript, 0) >>> 0);
  ctx?.unported?.note(SCREEN12.txBlock, '$25C2DE jsr $25BB6C -- arm 12\'s TX plane block, 19 '
    + 'instructions writing $900000 through a $2302E0 table. Presentation; it cannot gate the '
    + 'screen, whose only exit is the $246710 chain state 2 waits on');
}

/**
 * `$25C2EA` -- one frame of arm 12's screen. Three states that FALL THROUGH into each other,
 * exactly as `hiscoreScreen25B412` does.
 *
 * @returns {boolean} the CARRY: `true` ($25C37C `ori.w #$1,SR`) means still running, `false`
 *   ($25C386 `move.w D0,D0`) means finished. `$25AA28 bcs` skips the advance on `true`.
 */
export function screen12Body25C2EA(ram, rom, ctx) {
  if (ram.u16(SCREEN12.state) === 0) {                         // $25C2EE cmpi.w #$0
    if (chainCheck24681A(ram, ram.u32(SCREEN12.handle)) === 0) {   // $25C300 jsr / $25C306 bne
      chainFree246800(ram, ram.u32(SCREEN12.handle));          // $25C30A jsr $246800
      ram.setU16(SCREEN12.state, 1);                           // $25C310
      ctx?.unported?.note(SCREEN12.cue, '$25C318 jsr $28CAE2 -- D0=$44, D1=$FF, D2=$14 into '
        + '$28C02A. Counted for the same reason arm 3\'s $28C170 is: it is not a $28BB04 '
        + 'wrapper, so postWrapper throws on it');
    }
  }
  if (ram.u16(SCREEN12.state) === 1) {                         // $25C31E -- FALLS THROUGH
    const t = u16(ram.u16(SCREEN12.timer) - 1);                // $25C32A subq.w #1
    ram.setU16(SCREEN12.timer, t);
    if (t === 0) {                                             // $25C330 bne
      // $25C334/$25C33A -- the SECOND script, through the SECOND loader. W389's fold is what
      // makes the nodes this builds visible to `$24683E`.
      ram.setU32(SCREEN12.handle,                              // $25C340
        chainLoader246710(ram, rom, SCREEN12.loadScript, ctx) >>> 0);
      ram.setU16(SCREEN12.state, 2);                           // $25C346
    }
  }
  if (ram.u16(SCREEN12.state) === 2) {                         // $25C34E
    if (chainCheck24681A(ram, ram.u32(SCREEN12.handle)) === 0) {   // $25C360 / $25C366 bne
      chainFree246800(ram, ram.u32(SCREEN12.handle));          // $25C36A jsr $246800
      return false;                                            // $25C370 bra $25C382 -- carry CLEAR
    }
  }
  // $25C374 bsr $25C39C -- ONE register-convention enqueue of four immediates, tail-jumping to
  // $23DECE. Every state that is still running reaches it; the finished frame skips it, which is
  // the same one-frame gap arm 2 has.
  enqueueRegistersThroughStub(ram, rom, SCREEN12.emit,
    SCREEN12.drawD1, SCREEN12.drawD2, SCREEN12.drawD3, 0);     // $25C39C..$25C3B4
  return true;                                                 // $25C37C ori.w #$1,SR
}

/** ARM 12, `$25AA10` -> state 9. W389 ports both halves; see `SCREEN12` above. */
function arm12(ram, rom, a5, ctx) {
  if (ram.u8(a5 + SCREEN8.inited) === 0) {                     // $25AA10/$25AA14
    ram.setU8(a5 + SCREEN8.inited, 1);                         // $25AA16
    screen12Init25C2AE(ram, rom, ctx);                         // $25AA1C jsr $25C2AE
  }
  if (!screen12Body25C2EA(ram, rom, ctx)) {                    // $25AA22 jsr / $25AA28 bcs
    setState25A764(ram, a5, 0x09);                             // $25AA2C moveq #$9 / $25AA30
  }
}

// ---------------------------------------------------------------------------------------------
// W390 -- ARM 9'S SCREEN, `$25C3E8` (init) AND `$25C424` (body).
// ---------------------------------------------------------------------------------------------
//
// The brief called this "structurally arm 12 on a different triple of words", and the sweep says
// that is TRUE OF THE STATE MACHINE and FALSE OF THE DRAW. Both halves are given below with the
// bytes that decide them, because the last two times "structurally the same" was asserted here it
// was right in shape and wrong in a detail that changed behaviour.
//
// THE INIT, `$25C3E8..$25C422` -- `4E75` sits AT `$25C422` (trap 5), so the routine is 60 bytes:
//
//   25C3E8  48e7 fffe                 movem.l D0-D7/A0-A6,-(A7)
//   25C3EC  41f9 00812e7a             lea $812E7A,A0            <- the triple, NOT $812E72
//   25C3F2  303c 0003 / 7200 / 30c1 / 51c8 fffc
//                                     move.w #$3,D0 / moveq #0,D1 / move.w D1,(A0)+ / dbra
//                                     -- FOUR words (trap 2): $812E7A/$7C/$7E/$80, and the last
//                                     two ARE the handle long at $812E7E
//   25C3FE  33fc 00f0 00812e7c        move.w #$F0,$812E7C
//   25C406  41fa 010a                 lea ($10A,PC),A0 -> $25C408 + $10A = $25C512   (trap 4)
//   25C40A  4e71                      nop                       <- arm 12 has this too, at $25C2D0
//   25C40C  4eb9 0024641a             jsr $24641A               <- $246410 with D6 = 0
//   25C412  23c0 00812e7e             move.l D0,$812E7E
//   25C418  4eb9 0025bb6c             jsr $25BB6C               <- the TX plane block, counted
//
// THE BODY, `$25C424..$25C4BC` -- the three fall-through states, and WHICH CHAIN THE EXIT WAITS
// ON, which the brief asked to be checked rather than assumed:
//
//   25C428  cmpi.w #$0,$812E7A / bne.w -> $25C452
//   25C434  move.l $812E7E,D0 / jsr $24681A / bne.w -> $25C452
//   25C444  jsr $246800                       <- state 0 FREES the INIT chain
//   25C44A  move.w #$1,$812E7A
//   25C452  cmpi.w #$1,$812E7A / bne.w -> $25C482
//   25C45E  subq.w #1,$812E7C / bne.w -> $25C482
//   25C468  lea ($C6,PC),A0 -> $25C46A + $C6 = $25C530   <- a SECOND script
//   25C46E  jsr $246710                       <- a SECOND loader, EIGHT bytes per entry
//   25C474  move.l D0,$812E7E                 <- OVERWRITING the init's handle
//   25C47A  move.w #$2,$812E7A
//   25C482  cmpi.w #$2,$812E7A / bne.w -> $25C4A8
//   25C48E  move.l $812E7E,D0 / jsr $24681A / bne.w -> $25C4A8
//   25C49E  jsr $246800 / bra.w -> $25C4B6    <- THE EXIT
//
// So the answer is the same as arm 12's: **the exit waits on the SECOND chain, the `$246710` one
// that state 1 loads.** State 0's wait is on the `$24641A` chain and it frees it before state 1
// ever runs. `$25C482`'s `cmpi.w #$2` cannot be satisfied by the init handle, because `$25C474`
// has already replaced it.
//
// **THE BRIEF IS WRONG ABOUT ONE THING, AND IT IS THE DRAW.** "Same four-word clear, same `#$F0`
// timer, same `$24641A` init chain, same `$25BB6C`, same `$246710` state-1 chain, same two exits"
// is all confirmed. But `$25C4A8 bsr.w` (displacement word at `$25C4AA`, `+$26`) lands on
// `$25C4D0`, and that stub is NOT `$25C39C`'s shape:
//
//   25C4D0  223c 3c001c00             move.l #$3C001C00,D1
//   25C4D6  0681 f800f000             addi.l #$F800F000,D1      <- arm 12 has NO addi at all
//   25C4DC  243c 003366a8 / 363c 0880 / 383c 0000
//   25C4EA  4eb9 0023dece             jsr $23DECE               <- jsr, not arm 12's `4EF9` jmp
//   25C4F0  223c 30001e00 / 0681 fc00f200 / 243c 003368ac / 363c 0470 / 383c 0000
//   25C50A  4eb9 0023dece             jsr $23DECE               <- a SECOND enqueue
//   25C510  4e75
//
// TWO sprites per frame, not one, and each D1 is a 32-BIT ADD whose carry crosses bit 15:
// `$3C001C00 + $F800F000 = $34010C00` -- the low half wraps and adds 1 to the high half. Folding
// those as two independent word adds would put `$33FF0C00` in the queue. The port keeps both
// literals and does the add, so the arithmetic is visible rather than precomputed.
//
// THE BOUNDS ARE IN THE DATA, exactly as arm 12's are: `$25C512` is `count 2` and
// `2 + 2*14 = $1E` lands on `$25C530`; `$25C530` is `count 2` and `2 + 2*8 = $12` lands on
// `$25C542`, which is a block of three longword pointers (`$25C54E $25C55E $25C56E`) and not more
// script. Entry [0] of the init script fades to `$225A78` -- arm 12's is `$225A38`, and
// `$225A38 + $40` is `$225A78` exactly, so the two windows ABUT and do not overlap. Entry [1] is
// `$246BF8`, already inside W91's `$246BB8+$80`, and is not re-declared.
//
// ONE CALLEE STAYS COUNTED, and it cannot hold the machine:
//   `$25BB6C` -- the same 19-instruction TX plane block arm 12 counts, called from the same place.
// **THERE IS NO `$28CAE2` HERE.** Arm 12 posts a cue at `$25C318` on the 0 -> 1 edge; arm 9's
// `$25C44A` writes the state and falls straight through. Confirmed from the bytes: `$25C44A
// 33fc 0001 00812e7a` is immediately followed by `$25C452 0c79`, with no `4EB9` between them.
export const ARM9SCREEN = Object.freeze({
  init: 0x25c3e8, initEnd: 0x25c424,   // $25C3E8..$25C423 -- 60 bytes, `rts` AT $25C422
  body: 0x25c424, bodyEnd: 0x25c4be,   // `rts` AT $25C4BC and AT $25C4B4, two exits
  state: 0x812e7a,                     // $25C3EC lea $812E7A,A0 -- and the $25C428 cmpi base
  clearWords: 4,                       // $25C3F2 move.w #$3,D0 -- dbra runs FOUR times
  timer: 0x812e7c,                     // $25C3FE move.w #$F0,$812E7C
  timerInit: 0xf0,
  handle: 0x812e7e,                    // $25C412 / $25C474 move.l D0,$812E7E
  initScript: 0x25c512,                // $25C406 lea ($10A,PC),A0 -- $24641A's, 14 bytes/entry
  loadScript: 0x25c530,                // $25C468 lea ($C6,PC),A0 -- $246710's, 8 bytes/entry
  scriptNodes: 2,                      // both count words
  fadeTarget: 0x225a78,                // $25C512 entry [0]'s longword
  txBlock: 0x25bb6c,                   // $25C418 jsr $25BB6C -- counted
  draw: 0x25c4d0,                      // $25C4A8 bsr.w -> $25C4AA + $26
  emit: 0x23dece,                      // $25C4EA / $25C50A jsr $23DECE -- TWICE, and jsr not jmp
  // The two enqueues, each `move.l #base,D1` then `addi.l #add,D1`. Kept unfolded on purpose.
  draws: Object.freeze([
    Object.freeze({ d1: 0x3c001c00, d1Add: 0xf800f000, d2: 0x003366a8, d3: 0x0880, d4: 0x0000 }),
    Object.freeze({ d1: 0x30001e00, d1Add: 0xfc00f200, d2: 0x003368ac, d3: 0x0470, d4: 0x0000 }),
  ]),
});

/** `$25C3E8` -- arm 9's screen INIT. Four words cleared, the `$F0` timer armed, the first chain
 *  loaded through `$24641A` and its handle stored. Arm 12's `$25C2AE` on the other triple. */
export function screen9Init25C3E8(ram, rom, ctx) {
  for (let i = 0; i < ARM9SCREEN.clearWords; i++) {            // $25C3F2 #$3 + dbra = FOUR
    ram.setU16(ARM9SCREEN.state + i * 2, 0);                   // $25C3F8 move.w D1,(A0)+
  }
  ram.setU16(ARM9SCREEN.timer, ARM9SCREEN.timerInit);          // $25C3FE
  // $25C40C jsr $24641A -- `$246410` with D6 = 0, which `animobjects.js` already ports.
  ram.setU32(ARM9SCREEN.handle,
    loadAnimObjects246410(ram, rom, ARM9SCREEN.initScript, 0) >>> 0);   // $25C412
  ctx?.unported?.note(ARM9SCREEN.txBlock, '$25C418 jsr $25BB6C -- arm 9\'s TX plane block, the '
    + 'same 19 instructions writing $900000 that arm 12 calls from $25C2DE. Presentation; it '
    + 'cannot gate the screen, whose only exit is the $246710 chain state 2 waits on');
}

/**
 * `$25C424` -- one frame of arm 9's screen. Three states that FALL THROUGH into each other.
 *
 * @returns {boolean} the CARRY: `true` ($25C4B0 `ori.w #$1,SR`) means still running, `false`
 *   ($25C4BA `move.w D0,D0`) means finished. `$25A9FE bcs` skips the advance on `true`.
 */
export function screen9Body25C424(ram, rom, ctx) {
  if (ram.u16(ARM9SCREEN.state) === 0) {                       // $25C428 cmpi.w #$0
    if (chainCheck24681A(ram, ram.u32(ARM9SCREEN.handle)) === 0) {   // $25C43A jsr / $25C440 bne
      chainFree246800(ram, ram.u32(ARM9SCREEN.handle));        // $25C444 jsr $246800
      ram.setU16(ARM9SCREEN.state, 1);                         // $25C44A
      // NO `$28CAE2` HERE. Arm 12's $25C318 cue has no counterpart on this edge.
    }
  }
  if (ram.u16(ARM9SCREEN.state) === 1) {                       // $25C452 -- FALLS THROUGH
    const t = u16(ram.u16(ARM9SCREEN.timer) - 1);              // $25C45E subq.w #1
    ram.setU16(ARM9SCREEN.timer, t);
    if (t === 0) {                                             // $25C464 bne
      ram.setU32(ARM9SCREEN.handle,                            // $25C474
        chainLoader246710(ram, rom, ARM9SCREEN.loadScript, ctx) >>> 0);
      ram.setU16(ARM9SCREEN.state, 2);                         // $25C47A
    }
  }
  if (ram.u16(ARM9SCREEN.state) === 2) {                       // $25C482
    if (chainCheck24681A(ram, ram.u32(ARM9SCREEN.handle)) === 0) {   // $25C494 / $25C49A bne
      chainFree246800(ram, ram.u32(ARM9SCREEN.handle));        // $25C49E jsr $246800
      return false;                                            // $25C4A4 bra $25C4B6 -- carry CLEAR
    }
  }
  // $25C4A8 bsr $25C4D0 -- TWO register-convention enqueues, each `jsr $23DECE` and each with an
  // `addi.l` the 68000 carries across bit 15. Arm 12's stub has one enqueue and no addi.
  for (const d of ARM9SCREEN.draws) {                          // $25C4D0..$25C510
    const d1 = (d.d1 + d.d1Add) >>> 0;                         // $25C4D6 / $25C4F6 addi.l
    enqueueRegistersThroughStub(ram, rom, ARM9SCREEN.emit, d1, d.d2, d.d3, d.d4);
  }
  return true;                                                 // $25C4B0 ori.w #$1,SR
}

/** ARM 9, `$25A9E6` -> state 1. W390 ports both halves; see `ARM9SCREEN` above. */
function arm9(ram, rom, a5, ctx) {
  if (ram.u8(a5 + SCREEN8.inited) === 0) {                     // $25A9E6/$25A9EA
    ram.setU8(a5 + SCREEN8.inited, 1);                         // $25A9EC
    screen9Init25C3E8(ram, rom, ctx);                          // $25A9F2 jsr $25C3E8
  }
  if (!screen9Body25C424(ram, rom, ctx)) {                     // $25A9F8 jsr / $25A9FE bcs
    setState25A764(ram, a5, 0x01);                             // $25AA02 move.w #$1 / $25AA06
  }
}

// ---------------------------------------------------------------------------------------------
// W391 -- ARMS 1 AND 3'S SCREENS: `$25BBB4` (the SHARED init), `$25BD7C` (arm 1's body),
// `$25BDE0` (arm 3's body) and `$25BE48` (the SHARED draw).
// ---------------------------------------------------------------------------------------------
//
// **THE BRIEF CALLED THESE "arms 1 and 3" AS THOUGH ONE PORT SERVED BOTH BODIES. IT DOES NOT.**
// What the two arms share is the INIT `$25BBB4` and the DRAW `$25BE48`. The bodies are two
// different routines with nothing in common but the tail they branch to, and arm 3's is
// twenty-four instructions where arm 1's is a state machine.
//
// THE INIT, `$25BBB4..$25BBE5` -- `4E75` sits AT `$25BBE4` (trap 5), so the routine is 50 bytes:
//
//   25BBB4  48e7 fffe                 movem.l D0-D7/A0-A6,-(A7)
//   25BBB8  41f9 00812e66             lea $812E66,A0
//   25BBBE  303c 0005 / 7200 / 30c1 / 51c8 fffc
//                                     move.w #$5,D0 / moveq #0,D1 / move.w D1,(A0)+ / dbra
//                                     -- **SIX words** (trap 2), not arm 9's four: $812E66,
//                                     $68, $6A, $6C, $6E, $70. The last two ARE the handle
//                                     long at $812E6E (trap 3, a third time).
//   25BBCA  33fc 01e0 00812e6c        move.w #$1E0,$812E6C     <- 480, not arm 9/12's $F0
//   25BBD2  6198                      bsr.s $25BB6C            <- the TX plane block, counted
//   25BBD4  6100 0654                 bsr.w $25C22A            <- ext at $25BBD6 + $654
//   25BBD8  6100 0678                 bsr.w $25C252            <- ext at $25BBDA + $678
//   25BBDC  6100 06a8                 bsr.w $25C286            <- ext at $25BBDE + $6A8
//   25BBE0  4cdf 7fff / 25BBE4 4e75
//
// **THE SIX-WORD BLOCK IS NOT ARM 9'S TRIPLE-PLUS-HANDLE.** `$812E66` is a BYTE OF BIT FLAGS,
// `$812E68` is a phase word, `$812E6A` is ARM 3's one-shot latch, `$812E6C` is the timer and
// `$812E6E` is the handle. A port that copied `ARM9SCREEN`'s four-word clear would leave
// `$812E6E`/`$812E70` -- the handle -- uncleared, and arm 3's latch with it.
//
// THE BODY, `$25BD7C..$25BE71` -- **AND IT IS NOT A `cmpi.w` FALL-THROUGH CHAIN.** Arms 9 and 12
// compare a state word against 0, 1, 2. Arm 1 uses `bset`/`btst` on a BYTE and one `tst.w`:
//
//   25BD7C  48e7 fffe                 movem.l D0-D7/A0-A6,-(A7)
//   25BD80  08f9 0000 00812e66        bset #0,$812E66          <- a BYTE bset; Z = the OLD bit
//   25BD88  6612                      bne.s $25BD9C            <- already latched, skip
//   25BD8A  41fa 022e                 lea ($22E,PC),A0 -> $25BD8C + $22E = $25BFBA  (trap 4)
//   25BD8E  4e71                      nop
//   25BD90  4eb9 0024641a             jsr $24641A              <- THE INIT CHAIN
//   25BD96  23c0 00812e6e             move.l D0,$812E6E
//   25BD9C  0839 0001 00812e66        btst #1,$812E66
//   25BDA4  662c                      bne.s $25BDD2
//   25BDA6  2039 00812e6e / 4eb9 0024681a / 661e   the init chain's wait
//   25BDB4  4eb9 00246800             jsr $246800              <- frees it
//   25BDBA  7000 / 23c0 00812e6e      move.l #0,$812E6E
//   25BDC2  08f9 0001 00812e66        bset #1,$812E66
//   25BDCA  33fc 0001 00812e68        move.w #$1,$812E68
//   25BDD2  4a79 00812e68 / 6700 006e tst.w $812E68 / beq.w -> $25BDDA + $6E = $25BE48 (DRAW)
//   25BDDC  6000 002c                 bra.w -> $25BDDE + $2C = $25BE0A
//
//   25BE0A  4a79 00812e6c / 671c      tst.w $812E6C / beq.s $25BE2E
//   25BE12  5379 00812e6c / 662e      subq.w #1,$812E6C / bne.s $25BE48   <- still counting
//   25BE1A  41fa 01f4                 lea ($1F4,PC),A0 -> $25BE1C + $1F4 = $25C010  A SECOND SCRIPT
//   25BE1E  4e71 / 4eb9 00246710      jsr $246710              <- A SECOND LOADER
//   25BE26  23c0 00812e6e             move.l D0,$812E6E        <- **OVERWRITING** the init handle
//   25BE2C  601a                      bra.s $25BE48
//
//   25BE2E  2039 00812e6e / 4eb9 0024681a / 6600 000c   the SECOND chain's wait
//   25BE3E  4eb9 00246800             jsr $246800
//   25BE44  6000 0024                 bra.w -> $25BE46 + $24 = $25BE6A  <- **THE FINISH EXIT**
//
// **WHICH CHAIN THE EXIT WAITS ON, ASKED FOR THE THIRD TIME AND ANSWERED FROM THE BYTES: THE
// SECOND ONE.** `$25BE26 move.l D0,$812E6E` replaces the `$24641A` handle before `$25BE2E` ever
// reads `$812E6E` again, exactly as `$25C474` does for arm 9. The `bset #1` latch makes it
// stronger than arm 9's compare: once bit 1 is set, `$25BD9C`'s `btst` skips the init wait
// forever, so nothing can re-enter it even if a later handle happened to look drained.
//
// **AND A MEASUREMENT THAT SURPRISED THIS WAVE, RECORDED BECAUSE THE NEXT READER WILL HIT IT.**
// The two loaders allocate from the SAME three-slot player list at `$810346`, and by the time
// `$25BE20` runs the init chain has been freed -- so `$246710` hands back the SAME ROOT ADDRESS
// `$24641A` did. **`$25BE26` is therefore a value-identical store on every real frame.** The
// distinction between "waits on the init chain" and "waits on the second chain" is NOT in the
// handle's value; it is in the CONTENT that root heads, and it shows up only in the timing.
// This is exactly the shape of trap 18 -- a comparison that silently accepts -- and it means an
// ablation that deletes only the store proves nothing. The ablation in `w391arm1.test.js`
// SECTION 4 deletes the WAIT instead, and it moves the exit by 607 frames.
//
// **THE TWO EXITS, AND THE CARRY IS NOT AN `andi`.**
//
//   25BE60  4cdf 7fff / 25BE64 007c 0001 / 25BE68 4e75   movem / **ori.w #$1,SR** / rts
//   25BE6A  4cdf 7fff / 25BE6E 3000     / 25BE70 4e75   movem / **move.w D0,D0** / rts
//
// `$25BE64` is `007C`, `ORI #imm,SR`, not `003C` `ORI #imm,CCR` -- privileged, and bit 0 of SR
// is the carry, so it SETS it. `$25BE6E 3000` is `move.w D0,D0`, which the 68000 defines as
// clearing C and V. That is the finish. `$25A904 bcs -> $25A910 rts` skips the advance while
// the carry is set, and `$25A908 move.w #$5,D0 / $25A90C bsr.w $25A764` is the advance.
// **ARM 1 REALLY DOES GO TO STATE 5.**
//
// **THE DRAW IS NEITHER TEMPLATE'S, AND ONE OF ITS SIX CALLS IS A DELIBERATE NO-OP.**
//
//   25BE48  6100 00fe   -> $25BE4A + $FE  = $25BF48
//   25BE4C  6100 00de   -> $25BE4E + $DE  = $25BF2C
//   25BE50  6100 0112   -> $25BE52 + $112 = $25BF64
//   25BE54  6100 012a   -> $25BE56 + $12A = **$25BF80**
//   25BE58  6100 0144   -> $25BE5A + $144 = $25BF9E
//   25BE5C  6100 fec8   -> $25BE5E - $138 = $25BD26
//
// Five are `move.l`/`move.w` register loads tail-jumping into `$23DECE` -- **except the fourth.**
// `$25BF80` is `4E75`, a bare `rts`, and the fully-formed enqueue that follows it at `$25BF82`
// (`D1 = $64003000`, `D2 = $334470`, `D3 = $410`) **is never called by anything**: a scan of
// `$250000..$270000` for every `6000`/`6100` displacement and every `4EB9`/`4EF9` operand
// landing on `$25BF82` returns ZERO references. It is a shipping-disabled draw of the same
// family as `$25E29E`'s three dead arms, done by branching one instruction short. A port that
// "helpfully" called `$25BF82` would put a sixth sprite on the screen that the board never
// draws; a port that treated the `rts` as an error would refuse a correct branch.
//
// The sixth call is a TABLE WALK and it uses the ZOOMING enqueue, which neither template does:
//
//   25BD26  49fa fefe                 lea ($FEFE,PC),A4 -> $25BD28 - $102 = $25BC26  (trap 4)
//   25BD2A  0c94 ffffffff / 6700 0020 cmpi.l #$FFFFFFFF,(A4) / beq.w -> $25BD32 + $20 = $25BD52
//   25BD34  2214 / 242c 0008          move.l (A4),D1 / move.l ($8,A4),D2
//   25BD3A  363c 0210 / 383c 0002     move.w #$210,D3 / move.w #$2,D4
//   25BD42  2c2c 000c                 move.l ($C,A4),D6        <- the ZOOM longword
//   25BD46  4eb9 0023e2f2             jsr $23E2F2              <- the ZOOM register enqueue
//   25BD4C  49ec 0010 / 60d8          lea ($10,A4),A4 / bra.s -> $25BD52 - $28 = $25BD2A
//
// **SO ARM 1 EMITS SEVEN SPRITES A FRAME: FOUR through `$23DECE` and THREE through `$23E2F2`.**
// Not one (arm 12) and not two (arm 9). Counted, and the test counts them too.
//
// THE BOUNDS ARE IN THE CODE, never in an absence (trap 8):
//   * `$25BFBA` is `count 6` and `2 + 6*14 = $56` lands on `$25C010`, which is the address
//     `$25BE1A`'s own `lea` names as the second script. The init script's end is the second
//     script's start.
//   * `$25C010` is `count 6` and `2 + 6*8 = $32` lands on `$25C042`, which is the address
//     `$25C22A`'s `lea` names as the rank-string pointer table.
//   * `$25BC26`'s walk is terminated by the `cmpi.l #$FFFFFFFF` at `$25BD2A`, and the
//     `$FFFFFFFF` sits at `$25BC56` -- three `$10`-byte entries, $34 bytes with the terminator.
//   * The five fade targets: `$2259B8 + $80` runs up to `$225A38`, which is W389's arm-12
//     target, so the two ABUT. `$25BAEC + $80` runs up to `$25BB6C`, the `jsr $23C608` opening
//     the TX plane block -- pinned by the CODE that follows it.
//
// FOUR CALLEES STAY COUNTED, and not one of them can gate the machine, whose only exit is the
// `$246710` chain `$25BE2E` waits on:
//   `$25BB6C` -- the same 19-instruction TX plane block arms 9 and 12 count.
//   `$25C22A` / `$25C252` / `$25C286` -- three TX STRING draws in the init, each
//     `lea (table,PC),A0 / moveq #0,D0 / move.b $80380x,D0 / add.w D0,D0 / add.w D0,D0 /
//     movea.l (0,A0,D0.w),A0 / move.w #$0,D0 / move.w #$D-$10-$B,D1 / move.w #$0,D2` into
//     `$25A14C` (`txString25A14C`, which IS ported). They are the operator-settings lines
//     ("RANK: ..." at `$25C052`), indexed by the DIP bytes `$80380C`/`$80380D`/`$80380F`, and
//     they run ONCE in the init. Counted rather than ported because each needs its own pointer
//     table plus four 32-byte strings exported, and `$80380D`/`$80380F` have no model in this
//     port at all -- `machine.js` names only `$80380C`. A DECLARED HOLD, not an oversight.
export const ARM1SCREEN = Object.freeze({
  init: 0x25bbb4, initEnd: 0x25bbe6,   // $25BBB4..$25BBE5 -- 50 bytes, `rts` AT $25BBE4
  body: 0x25bd7c, bodyEnd: 0x25be72,   // $25BD7C..$25BE71 -- two exits, `rts` AT $25BE68/$25BE70
  arm3Body: 0x25bde0, arm3BodyEnd: 0x25be0a,
  flags: 0x812e66,                     // $25BD80/$25BDC2 bset -- a BYTE of bit flags
  phase: 0x812e68,                     // $25BDCA move.w #$1 / $25BDD2 tst.w
  arm3Latch: 0x812e6a,                 // $25BDE4 tst.w / $25BDEC move.w #$1 -- ARM 3's, not arm 1's
  timer: 0x812e6c,                     // $25BBCA move.w #$1E0,$812E6C
  timerInit: 0x1e0,                    // 480 frames, not arm 9/12's $F0
  handle: 0x812e6e,                    // $25BD96 / $25BE26 move.l D0,$812E6E
  clearWords: 6,                       // $25BBBE move.w #$5,D0 -- dbra runs SIX times
  initScript: 0x25bfba,                // $25BD8A lea ($22E,PC) -- $24641A's, 14 bytes/entry
  loadScript: 0x25c010,                // $25BE1A lea ($1F4,PC) -- $246710's, 8 bytes/entry
  scriptNodes: 6,                      // both count words -- SIX, where arms 9/12 have two
  initScriptBytes: 0x56, loadScriptBytes: 0x32,
  txBlock: 0x25bb6c,                   // $25BBD2 bsr.s $25BB6C -- counted
  txLines: Object.freeze([0x25c22a, 0x25c252, 0x25c286]),   // $25BBD4/$25BBD8/$25BBDC -- counted
  dipBytes: Object.freeze([0x80380c, 0x80380d, 0x80380f]),  // what each of the three indexes on
  draw: 0x25be48,                      // the tail BOTH arms branch to
  emit: 0x23dece,                      // $25BF48 etc -- the plain register enqueue
  zoomEmit: 0x23e2f2,                  // $25BD46 jsr $23E2F2 -- the ZOOMING register enqueue
  zoomTable: 0x25bc26, zoomStride: 0x10, zoomEntries: 3, zoomTableBytes: 0x34,
  zoomD3: 0x0210, zoomD4: 0x0002,      // $25BD3A / $25BD3E -- rebuilt per entry, not inherited
  deadStub: 0x25bf80,                  // $25BE54's target: a BARE `rts`
  deadDraw: 0x25bf82,                  // the enqueue it skips. ZERO references in the image
  // The five `bsr`s of the draw tail IN ROM ORDER. `null` is `$25BF80`, and it is not an
  // omission -- see the header. Keeping the slot makes the count five-with-one-dead rather
  // than four, which is the difference between a transcription and a guess.
  draws: Object.freeze([
    Object.freeze({ at: 0x25bf48, d1: 0x1a000800, d2: 0x003344f8, d3: 0x20a0, d4: 0x0001 }),
    Object.freeze({ at: 0x25bf2c, d1: 0x0e000200, d2: 0x00334f60, d3: 0x30c0, d4: 0x0000 }),
    Object.freeze({ at: 0x25bf64, d1: 0x4a001c00, d2: 0x00334494, d3: 0x0260, d4: 0x0000 }),
    null,                              // $25BE54 bsr $25BF80 -- `4E75`, and $25BF82 is dead
    Object.freeze({ at: 0x25bf9e, d1: 0x04000400, d2: 0x00334efc, d3: 0x0620, d4: 0x0000 }),
  ]),
  emitsPerFrame: 7,                    // 4 through $23DECE + 3 through $23E2F2
  // Arm 3's `$25BE72`: SIX palette installs of the same six blocks the init script FADES to.
  // The credit screen shows them instantly; arm 1's demo fades into them over the chain.
  arm3Palettes: 0x25be72,
  arm3Bg: Object.freeze({ src: 0x23046c, bank: 0 }),         // $25BDF4/$25BDFE jsr $2415C4
  arm3Spr: Object.freeze([                                   // $25BE72..$25BEBE, jsr $24150A x5
    Object.freeze({ at: 0x25be7c, bank: 0, src: 0x2259f8 }),
    Object.freeze({ at: 0x25be8c, bank: 1, src: 0x2259b8 }),
    Object.freeze({ at: 0x25be9c, bank: 2, src: 0x222838 }),
    Object.freeze({ at: 0x25beaa, bank: 3, src: 0x25baec }),
    Object.freeze({ at: 0x25beb8, bank: 4, src: 0x25bb2c }),
  ]),
});

/** `$25BBB4` -- the init BOTH arm 1 and arm 3 run. SIX words cleared (not four), the `$1E0`
 *  timer armed, and four counted presentation calls. It loads NO chain: arm 1's body does that
 *  itself on its first frame, behind the `bset #0` latch. */
export function screen1Init25BBB4(ram, rom, ctx) {
  void rom;
  for (let i = 0; i < ARM1SCREEN.clearWords; i++) {            // $25BBBE #$5 + dbra = SIX
    ram.setU16(ARM1SCREEN.flags + i * 2, 0);                   // $25BBC4 move.w D1,(A0)+
  }
  ram.setU16(ARM1SCREEN.timer, ARM1SCREEN.timerInit);          // $25BBCA move.w #$1E0
  ctx?.unported?.note(ARM1SCREEN.txBlock, '$25BBD2 bsr.s $25BB6C -- the same 19-instruction TX '
    + 'plane block arms 9 and 12 count from $25C418 and $25C2DE. Presentation; it cannot gate '
    + 'the screen, whose only exit is the $246710 chain $25BE2E waits on');
  for (let i = 0; i < ARM1SCREEN.txLines.length; i++) {
    const site = 0x25bbd4 + i * 4;                             // $25BBD4 / $25BBD8 / $25BBDC
    ctx?.unported?.note(ARM1SCREEN.txLines[i], `$${site.toString(16).toUpperCase()} bsr.w $${
      ARM1SCREEN.txLines[i].toString(16).toUpperCase()} -- an operator-settings TX line, a `
      + `longword pointer table indexed by the DIP byte $${
        ARM1SCREEN.dipBytes[i].toString(16).toUpperCase()} and drawn through $25A14C. Runs `
      + 'ONCE in the init and writes only the TX plane. Counted: the strings need their own '
      + 'export and this port models no DIP byte but $80380C');
  }
}

/**
 * `$25BD7C` -- one frame of arm 1's DEMO screen. A `bset`/`btst` latch machine, NOT arms 9 and
 * 12's `cmpi.w` fall-through.
 *
 * @returns {boolean} the CARRY: `true` ($25BE64 `ori.w #$1,SR`) means still running, `false`
 *   ($25BE6E `move.w D0,D0`) means finished. `$25A904 bcs` skips the advance on `true`.
 */
export function screen1Body25BD7C(ram, rom, ctx) {
  const before = ram.u8(ARM1SCREEN.flags);
  ram.setU8(ARM1SCREEN.flags, before | 0x01);                  // $25BD80 bset #0 -- ALWAYS writes
  if ((before & 0x01) === 0) {                                 // $25BD88 bne -- Z is the OLD bit
    // $25BD8A lea ($22E,PC),A0 / $25BD90 jsr $24641A -- `$246410` with D6 = 0.
    ram.setU32(ARM1SCREEN.handle,                              // $25BD96
      loadAnimObjects246410(ram, rom, ARM1SCREEN.initScript, 0) >>> 0);
  }
  if ((ram.u8(ARM1SCREEN.flags) & 0x02) === 0) {               // $25BD9C btst #1 / $25BDA4 bne
    if (chainCheck24681A(ram, ram.u32(ARM1SCREEN.handle)) === 0) {   // $25BDAC / $25BDB2 bne
      chainFree246800(ram, ram.u32(ARM1SCREEN.handle));        // $25BDB4 jsr $246800
      ram.setU32(ARM1SCREEN.handle, 0);                        // $25BDBA moveq #0 / $25BDBC
      ram.setU8(ARM1SCREEN.flags, ram.u8(ARM1SCREEN.flags) | 0x02);   // $25BDC2 bset #1
      ram.setU16(ARM1SCREEN.phase, 1);                         // $25BDCA move.w #$1,$812E68
    }
  }
  if (ram.u16(ARM1SCREEN.phase) !== 0) {                       // $25BDD2 tst.w / $25BDD8 beq DRAW
    if (ram.u16(ARM1SCREEN.timer) !== 0) {                     // $25BE0A tst.w / $25BE10 beq
      const t = u16(ram.u16(ARM1SCREEN.timer) - 1);            // $25BE12 subq.w #1,$812E6C
      ram.setU16(ARM1SCREEN.timer, t);
      if (t === 0) {                                           // $25BE18 bne -> the draw
        // $25BE1A/$25BE20 -- the SECOND script through the SECOND loader, and $25BE26
        // OVERWRITES the init handle. This is the chain the exit below waits on. See the
        // header: the store is value-identical on every real frame, because both loaders hand
        // back the same freed root. The CONTENT is what differs, and the timing is what shows it.
        ram.setU32(ARM1SCREEN.handle,                          // $25BE26
          chainLoader246710(ram, rom, ARM1SCREEN.loadScript, ctx) >>> 0);
      }
    } else if (chainCheck24681A(ram, ram.u32(ARM1SCREEN.handle)) === 0) {  // $25BE2E/$25BE3A
      chainFree246800(ram, ram.u32(ARM1SCREEN.handle));        // $25BE3E jsr $246800
      return false;                                            // $25BE44 bra $25BE6A -- carry CLEAR
    }
  }
  screen1Draw25BE48(ram, rom, ctx);                            // $25BE48..$25BE5F
  return true;                                                 // $25BE64 ori.w #$1,SR
}

/** `$25BE48` -- the draw BOTH arms branch to. SEVEN sprites: four register enqueues through
 *  `$23DECE`, a fifth `bsr` that lands on a bare `rts`, and a three-entry ZOOM table walk
 *  through `$23E2F2`. */
export function screen1Draw25BE48(ram, rom, ctx) {
  void ctx;
  for (const d of ARM1SCREEN.draws) {
    if (d === null) continue;                                  // $25BE54 bsr $25BF80 -- `4E75`
    enqueueRegistersThroughStub(ram, rom, ARM1SCREEN.emit, d.d1, d.d2, d.d3, d.d4);
  }
  // $25BE5C bsr $25BD26 -- `lea ($25BC26,PC),A4` and walk $10-byte entries until the
  // `cmpi.l #$FFFFFFFF,(A4)` at $25BD2A hits. D3 and D4 are rebuilt inside the loop, so
  // nothing is inherited across the `jsr` the way $25E29E's four emits inherit theirs.
  let at = ARM1SCREEN.zoomTable;
  while ((rom.u32(at) >>> 0) !== 0xffffffff) {                  // $25BD2A cmpi.l / $25BD30 beq
    enqueueZoomedRegistersThroughStub(ram, rom, ARM1SCREEN.zoomEmit,
      rom.u32(at), rom.u32(at + 8), ARM1SCREEN.zoomD3, ARM1SCREEN.zoomD4, rom.u32(at + 12));
    at += ARM1SCREEN.zoomStride;                               // $25BD4C lea ($10,A4),A4
  }
}

/**
 * `$25BDE0` -- one frame of ARM 3's CREDIT screen, and it is NOT arm 1's body.
 *
 * Twenty-four instructions: a one-shot latch on `$812E6A` that installs the six palette blocks
 * INSTANTLY -- the same six the init script fades toward -- and then an unconditional branch
 * into the shared draw. There is no timer, no chain and no state.
 *
 *   25BDE0  48e7 fffe / 4a79 00812e6a / 665c    movem / tst.w $812E6A / bne.s $25BE48
 *   25BDEC  33fc 0001 00812e6a                  move.w #$1,$812E6A
 *   25BDF4  41f9 0023046c / 303c 0000 / 4eb9 002415c4    the BACKGROUND bank
 *   25BE04  6100 006c                           bsr.w -> $25BE06 + $6C = $25BE72
 *   25BE08  603e                                bra.s -> $25BE0A + $3E = $25BE48
 *
 * **IT ALWAYS RETURNS CARRY SET, AND NOTHING READS IT.** Every path reaches `$25BE48`, whose
 * tail is `$25BE64 ori.w #$1,SR`. And `$25A96E` is `bsr.w $25ACAC` with no `bcs` in front of
 * it, so arm 3 never advances on this body's account -- the credit screen leaves only through
 * the join poll. That is the answer to "does porting arm 1 pay twice": it pays for the INIT
 * and the DRAW, and arm 3's body is its own small routine.
 */
export function screen3Body25BDE0(ram, rom, ctx) {
  if (ram.u16(ARM1SCREEN.arm3Latch) === 0) {                   // $25BDE4 tst.w / $25BDEA bne
    ram.setU16(ARM1SCREEN.arm3Latch, 1);                       // $25BDEC move.w #$1,$812E6A
    // $25BDF4 lea $23046C,A0 / $25BDFA move.w #$0,D0 / $25BDFE jsr $2415C4.
    // `$2415C4` is the SIXTH entry of `palette.js`'s nine-routine family table: destination
    // $80F086 + D0*64, sixteen longwords, dirty flag $80FA68. `install2415E8` is the SEVENTH,
    // the (D1+1)-bank form of the SAME destination, so `d1 = 0` IS `$2415C4` -- one bank.
    installBgBank(ram, rom, ctx, ARM1SCREEN.arm3Bg.src, ARM1SCREEN.arm3Bg.bank, 0x25bdfe);
    screen3Palettes25BE72(ram, rom, ctx);                      // $25BE04 bsr.w $25BE72
  }
  screen1Draw25BE48(ram, rom, ctx);                            // $25BE08 bra.s $25BE48
  return true;                                                 // $25BE64 ori.w #$1,SR
}

/** `$25BE72..$25BEBF` -- five `lea / move.w #bank,D0 / jsr $24150A`, banks 0..4, then `rts` AT
 *  `$25BEBE`. The five sources are entries [0]..[4] of the init script's fade targets, which is
 *  why the credit screen and the demo screen end up the same colour by different routes. */
export function screen3Palettes25BE72(ram, rom, ctx) {
  for (const p of ARM1SCREEN.arm3Spr) {
    if (!ctx?.palette) {
      ctx?.unported?.note(0x24150a, `$${p.at.toString(16).toUpperCase()} jsr $24150A -- sprite `
        + `bank ${p.bank} <- $${p.src.toString(16).toUpperCase()} with no PaletteState on this `
        + 'chain');
      continue;
    }
    install24150A(ram, ctx.palette, p.bank, rom.bytes(p.src, 64), p.at,
      `slot [8] arm 3's credit-screen palette`);
  }
}

/** `$2415C4` through its `(D1+1)`-bank sibling `$2415E8`, guarded the way `installTxBank` is. */
function installBgBank(ram, rom, ctx, src, bank, site) {
  if (!ctx?.palette) {
    ctx?.unported?.note(0x2415c4, `$${site.toString(16).toUpperCase()} jsr $2415C4 -- BG bank ${
      bank} <- $${src.toString(16).toUpperCase()} with no PaletteState on this chain`);
    return;
  }
  install2415E8(ram, ctx.palette, bank, 0, rom.bytes(src, 64), site,
    `slot [8] arm 3's credit-screen background bank`);
}

/**
 * ARM 13, `$25ABF6` -- THE WARNING SCREEN, and the state reset stages the machine into.
 *
 * **THE INIT FRAME ENDS AT `$25AC34 rts`.** It does NOT fall into the line walk. A port that
 * ran both halves on frame one would draw the first line a frame early and, worse, would start
 * the `$12C` timeout one frame short.
 *
 * The line walk is a two-counter machine over `($6,A5)` (a BYTE offset into the string block
 * at `$25AA36`) and `($8,A5)` (the sprite Y). `$1C0 / $20` is FOURTEEN lines, and Y steps
 * DOWN by `$C` -- `subi.w #$C`, not `addi`. `($A,A5)` starts at 1 and is never reloaded, so
 * after the one frame it takes to reach zero the screen draws one line per frame.
 *
 * `($4,A5)` is reused here as the `$12C` = 300-frame timeout. The same word arm 0 reads as the
 * initial state; nothing reads it as a state again once arm 13 owns the record.
 */
function arm13(ram, rom, a5, ctx) {
  if (ram.u8(a5 + SCREEN8.inited) === 0) {                     // $25ABF6/$25ABFA
    ram.setU8(a5 + SCREEN8.inited, 1);                         // $25ABFC
    clearTx23C622(ctx.tx);                                     // $25AC02 jsr $23C622
    // $25AC08 lea $222618,A0 / $25AC0E moveq #0,D0 / $25AC10 jsr $2414BE
    installTxBank(ram, rom, ctx, SCREEN8.txPalWarn, 0x25ac10, 'slot [8] arm 13 TX palette');
    ram.setU16(a5 + SCREEN8.cursor, 0);                        // $25AC16 move.w #$0,($6,A5)
    ram.setU16(a5 + SCREEN8.y, SCREEN8.warnY0);                // $25AC1C move.w #$B8,($8,A5)
    ram.setU16(a5 + SCREEN8.delay, SCREEN8.warnDelay);         // $25AC22 move.w #$1,($A,A5)
    ram.setU16(a5 + SCREEN8.param, SCREEN8.warnTimeout);       // $25AC28 move.w #$12C,($4,A5)
    camReset(ram);                                             // $25AC2E jsr $240B0E
    return;                                                    // $25AC34 rts -- THE FRAME ENDS
  }

  // $25AC36 -- three ways to reach $25AC76 without drawing, written as the cartridge tests them.
  let draw = true;
  if (ram.u16(a5 + SCREEN8.cursor) === SCREEN8.warnEnd) {      // $25AC36 cmpi.w #$1C0 / beq
    draw = false;
  } else if (ram.u16(a5 + SCREEN8.delay) !== 0) {              // $25AC40 tst.w / beq $25AC50
    const d = u16(ram.u16(a5 + SCREEN8.delay) - 1);            // $25AC48 subq.w #1
    ram.setU16(a5 + SCREEN8.delay, d);
    if (d !== 0) draw = false;                                 // $25AC4C bne $25AC76
  }
  if (draw) {
    // $25AC50 lea ($25AA36,PC),A0 -- EA = $25AC52 + $FDE4, the EXTENSION WORD's address.
    const a0 = SCREEN8.warnStrings + ram.u16(a5 + SCREEN8.cursor);   // $25AC54 adda.w ($6,A5),A0
    // $25AC58 move.w ($8,A5),D0 (the Y) / $25AC5C move.w #$0,D1 / $25AC60 move.w #$0,D2, and D2
    // is dead: $259FFC overwrites it before $25A000 reads it. See fronttext.js.
    txFontString259FF8(ram, rom, ram.u16(a5 + SCREEN8.y), 0x0000, a0);   // $25AC64 jsr $259FF8
    ram.setU16(a5 + SCREEN8.y,                                 // $25AC6A subi.w #$C,($8,A5)
      u16(ram.u16(a5 + SCREEN8.y) - SCREEN8.warnYStep));
    ram.setU16(a5 + SCREEN8.cursor,                            // $25AC70 addi.w #$20,($6,A5)
      u16(ram.u16(a5 + SCREEN8.cursor) + SCREEN8.warnStep));
  }

  // $25AC76 -- the timeout, counted whether or not a line was drawn.
  if (ram.u16(a5 + SCREEN8.param) === 0) return;               // $25AC76 tst.w / beq $25AC90
  const t = u16(ram.u16(a5 + SCREEN8.param) - 1);              // $25AC7C subq.w #1
  ram.setU16(a5 + SCREEN8.param, t);
  if (t !== 0) return;                                         // $25AC80 bne $25AC90
  setState25A764(ram, a5, 0x02);                               // $25AC82/$25AC86 -> state 2
  clearTx23C622(ctx.tx);                                       // $25AC8A jsr $23C622
}

/**
 * ARM 14, `$25AC92` -- **JOINED. The exit to gameplay**, and the shortest arm in the table:
 * five instructions and no init gate at all.
 *
 * `$24107C` destroys every live object -- 20 slots of stride `$50` from `$80E240`, plus the ID
 * counter and both queue cursors -- and only THEN stages slot [9]. So the whole front end is
 * gone before the gameplay seeder exists; nothing overlaps.
 *
 * `move.b $812E5A,($4,A0)` is a BYTE onto the record `$241182` left in A0, and `SEED9.mask`
 * (`objslot9.js`) reads exactly that field: 1 = P1 alone, 2 = P2 alone, 3 = both. The priority
 * is the DISPATCH TABLE's `$000A`, taken through the callback, never a constant.
 */
function arm14(ram, rom, ctx) {
  objTableInit24107C(ram);                                     // $25AC92 jsr $24107C
  const made = stageCreate(ram, SCREEN8.joinChildType,         // $25AC98 move.w #$9,D0 / $25AC9C
    (t) => rom.u16(SCREEN8.dispatch + t * 8 + 4));
  ram.setU8(made.addr + SCREEN8.joinField, ram.u8(SCREEN8.joinMask));   // $25ACA2 -- a BYTE
  return made;
}

// ---------------------------------------------------------------------------------------------

/**
 * `$25A7C0` -- A COIN IS IN. Tear the screen down and restart at state 3.
 *
 * Two `$28C0FC`/`$28C5B0` pairs (the `$28C0FC` half of each is a counted note -- see
 * `cueStreamNote`), and they are NOT one pair with two conditions: `$25A7D2`
 * fires them when `$803926` (the dual-play gate) is set, clearing it on the way, and `$25A7EE`
 * fires them again when the state is 12. Both true means both pairs post.
 *
 * Ends by restaging slot [8] -- itself -- at state 3, the same suicide-and-respawn shape as
 * `teardown25A9B2`, and the `move.w #$3,($4,A0)` again goes through the A0 `$241182` left.
 */
export function coinTeardown25A7C0(ram, rom, ctx) {
  objTableInit24107C(ram);                                     // $25A7C0 jsr $24107C
  clear24631C(ram, ctx, 0x25a7c6);                             // $25A7C6 jsr $24631C
  clear25C57E(ram);                                            // $25A7CC jsr $25C57E
  if (ram.u16(SCREEN8.dualGate) !== 0) {                       // $25A7D2 tst.w / beq $25A7EE
    ram.setU16(SCREEN8.dualGate, 0);                           // $25A7DC clr.w $803926
    cueStreamNote(ctx, 0x25a7e2);                              // $25A7E2 jsr $28C0FC
    ctx?.soundPost?.(SCREEN8.cueWrapper);                      // $25A7E8 jsr $28C5B0
  }
  if (ram.u16(SCREEN8.state) === 0x0c) {                       // $25A7EE cmpi.w #$C / bne $25A806
    cueStreamNote(ctx, 0x25a7fa);                              // $25A7FA jsr $28C0FC
    ctx?.soundPost?.(SCREEN8.cueWrapper);                      // $25A800 jsr $28C5B0
  }
  // $25A806 lea $222638,A0 / $25A80C moveq #0,D0 / $25A80E jsr $2414BE -- THIRTY-TWO bytes.
  installTxBank(ram, rom, ctx, SCREEN8.txPalMain, 0x25a80e, 'slot [8] coin-teardown TX palette');
  clearTx23C622(ctx.tx);                                       // $25A814 jsr $23C622
  const made = stageCreate(ram, SCREEN8.selfType,              // $25A81A move.w #$8,D0 / $25A81E
    (t) => rom.u16(SCREEN8.dispatch + t * 8 + 4));
  ram.setU16(made.addr + SCREEN8.joinField, SCREEN8.restageState);   // $25A824 move.w #$3,($4,A0)
  return made;
}

/**
 * `$25A82C` -- THE DISPATCH TAIL. Draws the blinking message and the credit line, then jumps
 * through the fifteen-entry table.
 *
 * **IT RE-READS `$812E56`.** `$25A862` loads the state again, after the entry's three compares
 * and after any `bsr $25ACAC` those compares let through. That re-read is the same-frame trap:
 * see `objSlot8`.
 *
 * State 13 skips the whole drawing half (`$25A82C cmpi.w #$D / beq $25A862`) -- the warning
 * screen shows no credit line and no blinking message.
 *
 * `andi.w #$10` after `addq.w #1` is 16 frames on and 16 off, and the increment happens BEFORE
 * the test, so the counter's first visible value is 1.
 */
function dispatchTail25A82C(ram, rom, a5, ctx) {
  if (ram.u16(SCREEN8.state) !== 0x0d) {                       // $25A82C cmpi.w #$D / beq $25A862
    const n = u16(ram.u16(SCREEN8.blink) + 1);                 // $25A838 addq.w #1
    ram.setU16(SCREEN8.blink, n);                              // ...to $812E58
    if ((n & SCREEN8.blinkMask) !== 0) {                       // $25A844 andi.w #$10 / beq
      // $25A84C jsr ($25AD02,PC) -- EA = $25A84E + $4B4, the extension word plus the disp.
      ctx?.unported?.note(SCREEN8.blinkOn, '$25A84C jsr $25AD02 -- the blink message, ON');
    } else {
      // $25A856 jsr ($25AFD8,PC) -- EA = $25A858 + $780. W377: PORTED, in fronttext.js. Like
      // `$23CFDE` below it this is a DIRECT blit through $25A14C, so its blanks land on this
      // frame's tilemap, not the next one's. The note is gone because the call is real.
      blinkOff25AFD8(ctx.tx, rom);                             // $25A856 jsr $25AFD8
    }
    // $25A85C jsr $23CFDE -- the credit / FREE PLAY line. W376: ported in fronttext.js, and it
    // writes TxVram DIRECTLY (through $25A14C/$240CF0) rather than through the defer buffer, so
    // it lands on this frame's tilemap and not the next one's.
    creditLine23CFDE(ram, rom, ctx.tx);
  }

  const st = ram.u16(SCREEN8.state);                           // $25A862 -- THE RE-READ
  // $25A868/$25A86A add.w D0,D0 twice, then $25A86C jmp ($4,PC,D0.w): EA = $25A86E + $4 + D0,
  // which is $25A872 + state*4. There is NO bound anywhere on this path.
  switch (st) {
    case 0x0: arm0(ram, a5, ctx); return;                      // $25A8AE
    case 0x1: arm1(ram, rom, a5, ctx); return;                 // $25A8E6
    case 0x2: arm2(ram, rom, a5, ctx); return;                 // $25A912
    case 0x3: arm3(ram, rom, a5, ctx); return;                 // $25A94A
    case 0x4: armRts(); return;                                // $25A974
    case 0x5: arm5(ram, rom, a5, ctx); return;                 // $25A97C
    case 0x6: armRts(); return;                                // $25A9E2
    case 0x7: armRts(); return;                                // $25A9E4
    case 0x8: armRts(); return;                                // $25A9E4 -- the SAME rts as 7
    case 0x9: arm9(ram, rom, a5, ctx); return;                 // $25A9E6
    case 0xa: armRts(); return;                                // $25AA0C
    case 0xb: armRts(); return;                                // $25AA0E
    case 0xc: arm12(ram, rom, a5, ctx); return;                // $25AA10
    case 0xd: arm13(ram, rom, a5, ctx); return;                // $25ABF6
    case 0xe: arm14(ram, rom, ctx); return;                    // $25AC92
    default:
      // NOT A CLAMP, and deliberately not one. The cartridge would compute $25A872 + state*4
      // and jump there: state 15 lands exactly on $25A8AE, ARM 0'S FIRST INSTRUCTION, and
      // anything above that lands inside arm 0's body, mid-instruction from state 16 up. The
      // writer census says it cannot happen; if it does, the census is wrong and that is the
      // fact worth surfacing, not a silently corrected state.
      ctx?.unported?.note(0x25a86c,
        `$25A86C jmp ($4,PC,D0.w) with $812E56 = $${st.toString(16).toUpperCase()}. The jump `
        + 'table at $25A872 has FIFTEEN entries and NO bound check; the cartridge would jump to '
        + `$${(SCREEN8.table + st * 4).toString(16).toUpperCase()}, which is at or past arm 0's `
        + 'body at $25A8AE. A writer other than $25A764\'s seven feeds has reached $812E56');
  }
}

/**
 * `$25A770` -- OBJECT DISPATCH [8]. The entry, the credit gate, and the tail.
 *
 * **THE SAME-FRAME TRAP.** The three `cmpi.w` at `$25A77E`, `$25A786` and `$25A78E` test the
 * value read ONCE at `$25A778`. Under free play the `bsr $25ACAC` at `$25A7A2` can set
 * `$812E56 := $E`, and `$25A862` re-reads it -- so arm 14 runs in the SAME frame the button was
 * pressed, having been let past compares that saw the OLD state. Collapsing the compares and
 * the tail into one `else if` chain, or hoisting the state into a single local, loses a whole
 * frame of latency on the one transition that matters most.
 *
 * THE CREDIT GATE, in the cartridge's order:
 *   1. states $E, $3 and $D skip it entirely and go straight to the tail;
 *   2. under FREE PLAY only, poll `$25ACAC` first;
 *   3. `$23C956` -- coin1 + coin2. Non-zero -> tear down;
 *   4. `$23C932` -- credit1 + credit2. Non-zero -> tear down;
 *   5. both zero -> fall to the tail and just draw.
 *
 * The two counter pairs are ADDED, not compared: one coin in either slot, or one credit in
 * either counter, is enough. And the teardown `rts`es at `$25A82A` -- it does not fall into
 * the tail, so the frame a coin drops draws nothing.
 */
export function objSlot8(ram, rom, a5, ctx) {
  if (ram.u8(a5 + SCREEN8.constructed) === 0) {                // $25A770 tst.b ($2,A5) / beq
    arm0(ram, a5, ctx);                                        // $25A774 beq.w $25A8AE
    return;
  }
  const d0 = ram.u16(SCREEN8.state);                           // $25A778 -- read ONCE, and stale
                                                               //           by the tail's re-read
  // $25A77E / $25A786 / $25A78E -- three SEQUENTIAL compares to $25A82C, not an else-if chain
  // with what follows.
  if (d0 !== 0x0e && d0 !== 0x03 && d0 !== 0x0d) {
    if (ram.u8(SCREEN8.dip) === SCREEN8.freePlay) {            // $25A796 cmpi.b #$12 / bne
      joinPoll25ACAC(ram, a5, ctx);                            // $25A7A2 bsr.w $25ACAC
    }
    const [c0, c1] = coinCount23C956(ram);                     // $25A7A6 jsr $23C956
    let hit = u16(c0 + c1) !== 0;                              // $25A7AC add.w D1,D0 / tst.w / bne
    if (!hit) {
      const [k0, k1] = menuDips23C932(ram);                    // $25A7B2 jsr $23C932
      hit = u16(k0 + k1) !== 0;                                // $25A7B8 add.w D1,D0 / tst.w / beq
    }
    if (hit) {
      coinTeardown25A7C0(ram, rom, ctx);                       // $25A7C0..$25A824
      return;                                                  // $25A82A rts -- NO tail this frame
    }
  }
  dispatchTail25A82C(ram, rom, a5, ctx);                       // $25A82C
}
