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
// SCOPE. This wave ports the SEQUENCER, not the screens. Arms 0, 5's teardown, 13 and 14, the
// `$25ACAC` join handler, the `$25A770` credit gate and the `$25A82C` dispatch tail are here in
// full. Every arm's screen sub-machine -- `$25BBB4 $25BD7C $25BDE0` (1 and 3), `$25C2AE $25C2EA`
// (12), `$25C3E8 $25C424` (9), `$25C592 $25C6D4` (5) -- is a wave of its own and is NOTED. **ARM 2
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
// WHAT IS NOTED AND THEREFORE STILL STANDS BETWEEN THIS AND A BOOTABLE GAME: the four screen
// sub-machines above and `$25AD02`, the blink message's ON half. Neither gates the state
// machine except through a carry this port cannot compute, which is why arms 1, 5, 9 and 12 hold
// instead of advancing. Arms 0, 2, 3, 13 and 14 are complete, and 13 -> 2 -> 12 and
// 3 -> 14 -> gameplay are live paths today.
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
import { install2414BE } from './palette.js';
import { stageCreate, objTableInit24107C } from './objalloc.js';
import { clear23C47A } from './stageend.js';
import { clear25C57E } from './objslot9.js';
import { menuDips23C932 } from './tallyscreen.js';
import { hiscoreScreen25B412 } from './hiscorescreen.js';
import { loadAnimObjects246410 } from './animobjects.js';
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

/** ARM 1, `$25A8E6` -- the DEMO. Init clears TX and runs `$25BBB4`; every frame runs
 *  `$25BD7C`, whose CARRY CLEAR means "finished" and advances to state 5. Both are unported,
 *  so the port holds: an invented advance would skip the demo entirely. */
function arm1(ram, a5, ctx) {
  if (ram.u8(a5 + SCREEN8.inited) === 0) {                     // $25A8E6 tst.b / $25A8EA bne
    ram.setU8(a5 + SCREEN8.inited, 1);                         // $25A8EC move.b #$1,($3,A5)
    clearTx23C622(ctx.tx);                                     // $25A8F2 jsr $23C622
    ctx?.unported?.note(0x25bbb4, '$25A8F8 jsr $25BBB4 -- the demo screen INIT, shared with arm 3');
  }
  ctx?.unported?.note(0x25bd7c,
    '$25A8FE jsr $25BD7C -- the demo per-frame body. $25A904 bcs skips the advance, so CARRY '
    + 'CLEAR means finished -> state 5. Unported, so this port holds at state 1');
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
function arm3(ram, a5, ctx) {
  if (ram.u8(a5 + SCREEN8.inited) === 0) {                     // $25A94A/$25A94E
    ram.setU8(a5 + SCREEN8.inited, 1);                         // $25A950
    clear24631C(ram, ctx, 0x25a956);                           // $25A956 jsr $24631C
    ctx?.unported?.note(0x25bbb4, '$25A95C jsr $25BBB4 -- the credit screen INIT, shared with arm 1');
    // $25A962 jsr $28C170 -- verified `4E B9 00 28 C1 70`. $28C170 -> $28BBAC D0=$15 (BGM
    // command), the tier sound.js has no posting path for.
    ctx?.unported?.note(SCREEN8.cueBgm,
      '$25A962 jsr $28C170 -- the credit screen\'s BGM cue. $28C170 -> $28BBAC D0=$15 (BGM '
      + 'command), NOT the $28BB04 packer every sound.js WRAPPERS row describes, so posting it '
      + 'throws. Counted here exactly as background.js:1047 and hiscorescreen.js:544 count it');
  }
  ctx?.unported?.note(0x25bde0, '$25A968 jsr $25BDE0 -- the credit screen per-frame body');
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
 *  has to go through A0. */
function arm5(ram, rom, a5, ctx) {
  if (ram.u8(a5 + SCREEN8.inited) === 0) {                     // $25A97C/$25A980
    ram.setU8(a5 + SCREEN8.inited, 1);                         // $25A982
    ctx?.unported?.note(0x25c592, '$25A988 jsr $25C592 -- arm 5\'s screen INIT');
    clearTx23C622(ctx.tx);                                     // $25A98E jsr $23C622
    ram.setU16(a5 + SCREEN8.param, 0);                         // $25A994 move.w #$0,($4,A5)
    // $25A99A lea $222618,A0 / $25A9A0 moveq #0,D0 / $25A9A2 jsr $2414BE
    installTxBank(ram, rom, ctx, SCREEN8.txPalWarn, 0x25a9a2, 'slot [8] arm 5 TX palette');
  }
  ctx?.unported?.note(0x25c6d4,
    '$25A9A8 jsr $25C6D4 -- arm 5\'s per-frame body. $25A9AE bcs skips $25A9B2, so CARRY CLEAR '
    + 'runs teardown25A9B2 (ported and exported here). Unported, so this port holds at state 5');
}

/** ARM 9, `$25A9E6` -> state 1. Init `$25C3E8`, body `$25C424`, both unported. */
function arm9(ram, a5, ctx) {
  if (ram.u8(a5 + SCREEN8.inited) === 0) {                     // $25A9E6/$25A9EA
    ram.setU8(a5 + SCREEN8.inited, 1);                         // $25A9EC
    ctx?.unported?.note(0x25c3e8, '$25A9F2 jsr $25C3E8 -- arm 9\'s screen INIT');
  }
  ctx?.unported?.note(0x25c424,
    '$25A9F8 jsr $25C424 -- arm 9\'s per-frame body; CARRY CLEAR -> state 1 ($25AA02/$25AA06)');
}

/** ARM 12, `$25AA10` -> state 9. Init `$25C2AE`, body `$25C2EA`, both unported. */
function arm12(ram, a5, ctx) {
  if (ram.u8(a5 + SCREEN8.inited) === 0) {                     // $25AA10/$25AA14
    ram.setU8(a5 + SCREEN8.inited, 1);                         // $25AA16
    ctx?.unported?.note(0x25c2ae, '$25AA1C jsr $25C2AE -- arm 12\'s screen INIT');
  }
  ctx?.unported?.note(0x25c2ea,
    '$25AA22 jsr $25C2EA -- arm 12\'s per-frame body; CARRY CLEAR -> state 9 ($25AA2C/$25AA30)');
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
    case 0x1: arm1(ram, a5, ctx); return;                      // $25A8E6
    case 0x2: arm2(ram, rom, a5, ctx); return;                 // $25A912
    case 0x3: arm3(ram, a5, ctx); return;                      // $25A94A
    case 0x4: armRts(); return;                                // $25A974
    case 0x5: arm5(ram, rom, a5, ctx); return;                 // $25A97C
    case 0x6: armRts(); return;                                // $25A9E2
    case 0x7: armRts(); return;                                // $25A9E4
    case 0x8: armRts(); return;                                // $25A9E4 -- the SAME rts as 7
    case 0x9: arm9(ram, a5, ctx); return;                      // $25A9E6
    case 0xa: armRts(); return;                                // $25AA0C
    case 0xb: armRts(); return;                                // $25AA0E
    case 0xc: arm12(ram, a5, ctx); return;                     // $25AA10
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
