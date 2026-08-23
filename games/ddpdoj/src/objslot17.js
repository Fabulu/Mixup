// OBJECT DISPATCH [17], `$25CEB8` -- the screen slot [7] hands to. W373.
//
// The W373 chain scan puts it downstream of slot [7]: `$29076A moveq #$11` stages type `$11`, which
// is this slot, when `$2911B0`'s menu answers 0. Slot [15] is the other arm of that fork.
//
// IT WALKS TWO `$70`-BYTE RECORDS at `$812EA0`. `moveq #$1,D7` with a `dbra` is TWO passes, and per
// record it runs a STATE MACHINE on the single byte `($1,A6)`:
//
//     3 -> $25D306      6 -> $25D4F0
//     5 -> $25D39C      7 -> $25D560
//
// `$0C2E 0003 0001` is `cmpi.b #$3,($1,A6)`, NOT `cmpi.b #$1,($3,A6)`: the immediate comes before
// the displacement. Reading it the other way turns one state byte into four independent flags, and
// every individual arm still looks plausible. It was caught by reading slot [9], which runs the
// same machine over the same records with SIX states instead of four.
//
// THE COMPARES ARE SEQUENTIAL, NOT AN ELSE-IF CHAIN. `$25D306` sets `($1,A6) = 5` and the very next
// compare then matches, so a record walks 3 -> 5 within ONE frame. A switch stops that.
//
// THE OBJECT'S OWN SIX BYTES ARE INTERLEAVED BY SIDE. State 0 fills `($4,A5)..($9,A5)` with `$FF`,
// then P1 writes the EVEN offsets `$4`/`$6`/`$8` and P2 the ODD `$5`/`$7`/`$9`. They are one array
// of pairs, not two arrays, and a port that gives each side its own three-byte block writes the
// right values to the wrong addresses.

import { u16, i16 } from './ram.js';
import { install24150A, install2414BE, paletteSet241688 } from './palette.js';
import { clearTx23C622, txBlock240CF0, txString25A14C } from './background.js';
import { txPrint240EBC } from './hud.js';
import { announcePost, stageStart260580, stagePair2603FE } from './rank.js';
import { cursorsFromPosted25D9E6 } from './tallyscreen.js';
import { stageCreate, queueKill } from './objalloc.js';
import {
  enqueueRegistersThroughStub, enqueueZoomedRegistersThroughStub,
} from './spritequeue.js';

/** The fifteen palette installs state 0 ends with, in cartridge order. Fourteen go through
 *  `$24150A` and the FIRST goes through `$2414BE`, which is a different routine and a different
 *  block size -- 32 bytes rather than 64. Folding them into one loop installs 64 bytes of the
 *  wrong thing into the TX bank. */
const SCREEN17_PAL = Object.freeze([
  Object.freeze({ src: 0x222618, bank: 0, via: 0x2414be }),
  Object.freeze({ src: 0x222838, bank: 2, via: 0x24150a }),
  Object.freeze({ src: 0x223c38, bank: 24, via: 0x24150a }),
  Object.freeze({ src: 0x223c78, bank: 25, via: 0x24150a }),
  Object.freeze({ src: 0x223cb8, bank: 27, via: 0x24150a }),
  Object.freeze({ src: 0x223d38, bank: 26, via: 0x24150a }),
  Object.freeze({ src: 0x223d78, bank: 28, via: 0x24150a }),
  Object.freeze({ src: 0x223ff8, bank: 18, via: 0x24150a }),
  Object.freeze({ src: 0x2240b8, bank: 19, via: 0x24150a }),
  Object.freeze({ src: 0x2241b8, bank: 20, via: 0x24150a }),
  Object.freeze({ src: 0x2240f8, bank: 16, via: 0x24150a }),
  Object.freeze({ src: 0x224038, bank: 21, via: 0x24150a }),
  Object.freeze({ src: 0x224178, bank: 22, via: 0x24150a }),
  Object.freeze({ src: 0x224138, bank: 23, via: 0x24150a }),
  Object.freeze({ src: 0x224078, bank: 17, via: 0x24150a }),
]);

export const SCREEN17 = Object.freeze({
  entry: 0x25ceb8, start: 0x25cc46, dispatch: 0x240f62,
  recs: 0x812ea0, recStride: 0x70, recCount: 2, recWords: 112,
  state: 0x02, busy: 0x03, slots: 0x04, slotCount: 6, extra: 0x0a,
  // $25CEA2's target: the NEW record's ($4), not this object's. See state 0's tail.
  newRecArm: 0x04,
  // ($1,A6) is a per-record STATE, seeded to 3 by state 0. These are its values, not offsets.
  phaseAt: 0x01, phaseSeed: 0x03,
  subStates: Object.freeze([0x03, 0x05, 0x06, 0x07]),
  subHandlers: Object.freeze([0x25d306, 0x25d39c, 0x25d4f0, 0x25d560]),
  firstSetsPhase: 0x05,
  p1: 0x8103e6, p2: 0x810448,
  p1SrcA: 0x81043e, p1SrcB: 0x810440, p1Gate: 0x813084,
  p2SrcA: 0x8104a0, p2SrcB: 0x8104a2, p2Gate: 0x813086,
  flagA: 0x812f82, flagB: 0x80392c, flagC: 0x812f80, killFlag: 0x80392c,
  opener: 0x25f442, announceSite: 0x260a9a,
  childType: 0x0a,
  // W390 -- `$241292 lea ($4C,A5),A0`. The object's ID LONG, and `queueKill`'s real argument.
  idAt: 0x4c,
  palettes: SCREEN17_PAL,
});

/** `$241688` needs a PaletteState. A chain without one keeps a counted note naming both arms, the
 *  same way `$2908E4` and this file's own fifteen installs do, so "those banks are still whatever
 *  they were" stays visible instead of silent. */
function palSet(ram, rom, ctx, d0, d1) {
  if (ctx.palette) { paletteSet241688(ram, ctx.palette, rom, d0, d1); return; }
  ctx.unported?.note(0x241688, `$241688 with D0=${d0} D1=${d1} -- slot [17]'s per-side palette set. `
    + `No PaletteState on this call chain`);
}

/** `$25F442` -- THE OPENER BOTH STATE 0s CALL, and it is twenty bytes with no gate of any kind.
 *
 *  `lea $813028,A0 / move.w #$23,D0 / moveq #$0,D1 / move.w D1,(A0)+ / dbra D0` -- `$23` is 35, so
 *  the `dbra` runs THIRTY-SIX times and clears 72 bytes, `$813028..$81306F`. It stops exactly one
 *  word below `$813070`, which is `$25FA78`'s block, so the two leaves TILE and neither overlaps
 *  the other. Reading `#$23` as a byte count would clear 36 bytes and leave half the block standing.
 *
 *  There is NO `movem` here, unlike `$25FA78`: D0, D1 and A0 are clobbered. Nothing is returned.
 *  Slot [9]'s seeder `$25C8A2` calls the same routine at `$25C8A8`, which is why it lives in the
 *  file both slots already share rather than in either one's. */
export const OPENER_25F442 = Object.freeze({ addr: 0x25f442, base: 0x813028, words: 36 });

export function clear25F442(ram) {
  for (let i = 0; i < OPENER_25F442.words; i++) {            // $25F448 move.w #$23,D0 + dbra = 36
    ram.setU16(OPENER_25F442.base + i * 2, 0);               // $25F44E move.w D1,(A0)+ with D1 = 0
  }
}

/** `$25CC46` -- STATE 0. Clears both records, seeds whichever sides are live, installs fifteen
 *  palettes and stages the next screen. */
function state0(ram, rom, a5, ctx) {
  ram.setU8(a5 + SCREEN17.state, 1);                         // $25CC46
  clear25F442(ram);                                          // $25CC4C jsr $25F442 -- now ported
  ram.setU16(SCREEN17.flagA, 0);                             // $25CC52
  ram.setU16(SCREEN17.flagB, 1);                             // $25CC5A

  // $25CC68 move.w #$6F,D0 + dbra is ONE HUNDRED AND TWELVE words = $E0 bytes = exactly two $70
  // records. The count is the cartridge's own, so no bounds check is needed.
  for (let i = 0; i < SCREEN17.recWords; i++) ram.setU16(SCREEN17.recs + i * 2, 0);

  for (let r = 0; r < SCREEN17.recCount; r++) {              // $25CC7A moveq #$1,D0 + dbra = TWO
    const a0 = SCREEN17.recs + r * SCREEN17.recStride;
    ram.setU8(a0, 0);                                        // $25CC7C
    ram.setU8(a0 + 0x01, 0);                                 // $25CC80
    ram.setU32(a0 + 0x56, 0xffffffff);                       // $25CC86
    ram.setU16(a0 + 0x60, 0);                                // $25CC8E
    ram.setU16(a0 + 0x62, 0);                                // $25CC94
    ram.setU16(a0 + 0x64, 1);                                // $25CC9A -- ONE, the only non-zero
    ram.setU16(a0 + 0x66, 0);                                // $25CCA0
    ram.setU16(a0 + 0x68, 0);                                // $25CCA6
    ram.setU16(a0 + 0x6a, 2);                                // $25CCAC
    ram.setU16(a0 + 0x6c, 0x140);                            // $25CCB2
  }

  ram.setU16(SCREEN17.flagC, 0);                             // $25CCC0
  ram.setU8(a5 + SCREEN17.busy, 0);                          // $25CCC6
  // $25CCCC..$25CCEA -- SIX bytes to $FF, and they are per-side PAIRS filled below.
  for (let i = 0; i < SCREEN17.slotCount; i++) ram.setU8(a5 + SCREEN17.slots + i, 0xff);
  ram.setU8(a5 + SCREEN17.extra, 0);                         // $25CCF0 clr.b ($A,A5)

  // $25CCFC -- P1 first: minus is active. Only ONE side is seeded, and P1 wins if both are live.
  let d0 = 0;
  if (ram.u16(SCREEN17.p1) & 0x8000) d0 = 1;                 // $25CCFC/$25CD06
  else if (ram.u16(SCREEN17.p2) & 0x8000) d0 = 2;            // $25CD0E/$25CD18

  let d1 = 0;
  if (d0 === 2) {                                            // $25CD22 cmpi.b #$2,D0 / bne
    ram.setU8(SCREEN17.recs + SCREEN17.recStride, 1);        // $25CD28 move.b #$1,($70,A0)
    ram.setU8(a5 + 0x09, ram.u16(SCREEN17.p2SrcA) & 0xff);   // $25CD2E/$25CD34 -- the ODD slots
    ram.setU8(a5 + 0x05, ram.u16(SCREEN17.p2SrcB) & 0xff);   // $25CD38/$25CD3E
    ram.setU8(a5 + 0x07, ram.u16(SCREEN17.p2SrcB) & 0xff);   // $25CD42 -- the SAME source, twice
    ram.setU8(SCREEN17.recs + SCREEN17.recStride + SCREEN17.phaseAt,
      SCREEN17.phaseSeed);                                   // $25CD46 -- state 3
    d1 = ram.u16(SCREEN17.p2Gate) === 0 ? 0 : 1;             // $25CD4E/$25CD5A
    ram.setU16(SCREEN17.recs + SCREEN17.recStride + 2, d1);  // $25CD5C
    palSet(ram, rom, ctx, 1, d1);                            // $25CD60 moveq #1 / $25CD62
    announcePost(ram, SCREEN17.announceSite, 1);             // $25CD68/$25CD6A jsr $260A9A
  } else if (d0 === 1) {                                     // $25CD74 cmpi.b #$1,D0 / bne
    ram.setU8(SCREEN17.recs, 1);                             // $25CD7A move.b #$1,(A0)
    ram.setU8(a5 + 0x08, ram.u16(SCREEN17.p1SrcA) & 0xff);   // $25CD7E/$25CD84 -- the EVEN slots
    ram.setU8(a5 + 0x04, ram.u16(SCREEN17.p1SrcB) & 0xff);   // $25CD88/$25CD8E
    ram.setU8(a5 + 0x06, ram.u16(SCREEN17.p1SrcB) & 0xff);   // $25CD92
    ram.setU8(SCREEN17.recs + SCREEN17.phaseAt, SCREEN17.phaseSeed);   // $25CD96
    d1 = ram.u16(SCREEN17.p1Gate) === 0 ? 0 : 1;             // $25CD9E/$25CDAA
    ram.setU16(SCREEN17.recs + 2, d1);                       // $25CDAC
    // $241688 takes D1 as its SECOND arm selector, and D1 here is the gate result computed two
    // instructions earlier -- a register carried across the call, not a fresh argument.
    palSet(ram, rom, ctx, 0, d1);                            // $25CDB0 moveq #0 / $25CDB2
    announcePost(ram, SCREEN17.announceSite, 0);             // $25CDB8/$25CDBA
  }

  clearTx23C622(ctx.tx);                                     // $25CDC0 jsr $23C622
  for (const p of SCREEN17.palettes) {                       // $25CDC6..$25CE92
    if (!ctx.palette) {
      ctx.unported?.note(p.via, `$25CDC6.. bank ${p.bank} <- $${p.src.toString(16).toUpperCase()
        } with no PaletteState on this chain`);
      continue;
    }
    if (p.via === 0x2414be) {
      // THIRTY-TWO bytes, not 64. $2414BE is the TX installer and reads half what $24150A does.
      install2414BE(ram, ctx.palette, p.bank, rom.bytes(p.src, 32), 0x25cdce, 'slot [17] TX palette');
    } else {
      install24150A(ram, ctx.palette, p.bank, rom.bytes(p.src, 64), 0x25cddc, 'slot [17] palette');
    }
  }

  // $25CE98 move.w #$A,D0 / $25CE9C jsr $241182 -- stages dispatch type $A, slot [10]. The W373
  // chain scan attributed this edge to slot [9] because $25CACA is the nearest preceding TABLE
  // entry; it is slot [17]'s, and dispatch entries are not routine starts.
  const made = stageCreate(ram, SCREEN17.childType,
    (t) => rom.u16(SCREEN17.dispatch + t * 8 + 4));
  // $25CEA2 move.w #$0,($4,A0) -- A0, NOT A5. `$241182` leaves the staging slot in A0 and does not
  // restore it, so this write lands on the RECORD JUST STAGED. tally.js documents the same trap at
  // $260024. Reading it as ($4,A5) writes over this object's own first per-side slot pair instead,
  // and the seeding two dozen lines above would silently come back as zero.
  if (made.ok) ram.setU16(made.addr + SCREEN17.newRecArm, 0);
}

/** `$25CEAA` -- STATE 2. Two instructions: drop the flag state 0 raised, then a tail kill. */
function state2(ram, a5) {
  ram.setU16(SCREEN17.killFlag, 0);                          // $25CEAA clr.w $80392C
  // W390 -- `$241292 41ed 004c` is `lea ($4C,A5),A0`, and `$241238`'s `$241252 22 90` is
  // `move.l (A0),(A1)`. The argument is the ID LONG at `($4C,A5)`, never the type word at (A5).
  // `$241238` is the QUEUE push, but `$2411F4`'s scan compares only `cmp.w` against the low half,
  // so a 16-bit argument read out of (A5) silently matched nothing and killed nothing (trap 18).
  queueKill(ram, ram.u32(a5 + SCREEN17.idAt));               // $25CEB0 JMP $241292
}

/** `$25CEB8` -- THE DISPATCH ENTRY. State 1 is the fall-through and is the record walk. */
export function objSlot17(ram, rom, a5, ctx) {
  const st = ram.u8(a5 + SCREEN17.state);
  if (st === 0) { state0(ram, rom, a5, ctx); return; }       // $25CEB8 tst.b / beq $25CC46
  if (st === 2) { state2(ram, a5); return; }                 // $25CEC0 cmpi.b #$2 / beq $25CEAA

  ram.setU8(a5 + SCREEN17.busy, 0);                          // $25CEC8 clr.b ($3,A5)
  for (let r = 0; r < SCREEN17.recCount; r++) {              // $25CED2 moveq #$1,D7 + dbra = TWO
    const a6 = SCREEN17.recs + r * SCREEN17.recStride;
    if (ram.u8(a6) === 0) continue;                          // $25CED4 tst.b (A6) / beq $25CF18
    for (const [i, phase] of SCREEN17.subStates.entries()) {
      if (ram.u8(a6 + SCREEN17.phaseAt) !== phase) continue; // $25CEDA.. cmpi.b #phase,($1,A6)
      if (phase === SCREEN17.phaseSeed) {
        phase3_25D306(ram, rom, ctx, a5, a6, SCREEN17.recCount - 1 - r);   // $25CEE2 jsr $25D306
        // $25CEE8 -- and slot [17] OVERWRITES the 4 the handler just wrote. It has no state-4 arm;
        // slot [9] does, and lets it stand. Same routine, two screens, two next states.
        ram.setU8(a6 + SCREEN17.phaseAt, SCREEN17.firstSetsPhase);
        continue;
      }
      if (phase === 0x06) {
        phase6_25D4F0(ram, rom, ctx, a6, SCREEN17.recCount - 1 - r);
        continue;
      }
      if (phase === 0x05) {
        // The dbra counter runs 1 then 0, so `r` maps to D7 as (recCount - 1 - r).
        const d7 = SCREEN17.recCount - 1 - r;
        phase5_25D39C(ram, rom, ctx, a5, a6, d7, DESC17.base[sideFromD7_25D4E4(d7)]);
        continue;
      }
      if (phase === 0x07) {
        // TRAP 10 AGAIN: $25D4F0 wrote 7 into ($1,A6) two compares ago, so on the frame state 6
        // runs this handler runs too. The draw registry is whatever the caller put on `ctx`; see
        // `phase7_25D560` for why it cannot simply be imported.
        phase7_25D560(ram, rom, ctx, a5, a6, SCREEN17.recCount - 1 - r);
        continue;
      }
      ctx.unported?.note(SCREEN17.subHandlers[i],
        `$${SCREEN17.subHandlers[i].toString(16).toUpperCase()} -- slot [17]'s handler for state `
        + `${phase} on ($1,A6). Unread`);
      // $25CEE8 -- state 3's handler ADVANCES the byte, and because the compares run in sequence
      // the state-5 arm then fires in this same pass.

    }
  }

  // $25CF20 -- D0 starts at 3 and each LIVE record clears one of its two low bits, so D0 ends as a
  // bitmap of which records are IDLE. Reaching 3 means neither ran, and only then does the screen
  // advance to state 2.
  let d0 = 3;                                                // $25CF20 moveq #3,D0
  if (ram.u8(SCREEN17.recs) !== 0) d0 = u16(d0 & 0xfffe);    // $25CF28/$25CF2C andi.w #$FFFE
  if (ram.u8(SCREEN17.recs + SCREEN17.recStride) !== 0) {    // $25CF3C tst.b ($70,A6)
    d0 = u16(d0 & 0xfffd);                                   // $25CF42 andi.w #$FFFD
  }
  if (ram.u8(SCREEN17.recs + 0x71) !== 0) d0 = u16(d0 | 0x02);   // $25CF46/$25CF4E ori.w #$2
  if (d0 === 3) ram.setU8(a5 + SCREEN17.state, 2);           // $25CF52 cmpi.w #$3 / $25CF58
}

/** `$25D39C` -- THE STATE-5 HANDLER, and it is SHARED: slot [17] runs it at state 5 and slot [9]
 *  runs the same routine at the same state over the same records.
 *
 *  When `$813098` is zero it picks a value from the table at `$25D294` using `($5,A6)` and writes it
 *  into THIS SIDE's byte of the object's pair array. A nonzero round word skips only that rewrite at
 *  `$25D3A6..$25D3C2`; both paths print one string and advance the record to state 6.
 *
 *  THE SIDE COMES FROM THE CALLER'S D7, THE `dbra` COUNTER. `tst.w D7 / beq` takes `($5,A5)` when it
 *  is zero and `($4,A5)` otherwise -- and `dbra` counts DOWN, so record 0 runs with D7 = 1 and takes
 *  the EVEN byte while record 1 runs with D7 = 0 and takes the ODD one. That is the same even/odd
 *  pairing state 0 seeds, arrived at from the other end.
 *
 *  The first three entries are `$2`, `$4`, `$6` -- the same values the tally posts and slot [7] maps
 *  three ways. **THE TABLE'S EXTENT IS NOT SETTLED**: this routine indexes from `$25D294`, but
 *  `$25D306` does `lea $25D29A,A4`, two bytes inside it. The two disagree about where the structure
 *  begins, so nothing here quotes a bound. What IS certain is the three values and the indexing.
 */
export const HANDLER5 = Object.freeze({
  addr: 0x25d39c, table: 0x25d294, entries: 4,
  string: 0x25d3f6, gate: 0x813098, nextPhase: 0x06, col: 0x08, shift: 9, bias: 8,
});

export function phase5_25D39C(ram, rom, ctx, a5, a6, d7, a4) {
  if (ram.u16(HANDLER5.gate) === 0) {                         // $25D39C tst.w / $25D3A2 bne $25D3C4
    const d0 = rom.u16(HANDLER5.table + u16(ram.u8(a6 + 0x05) << 1)); // $25D3A8..$25D3B2
    // $25D3B6 tst.w D7 / beq $25D3C0 -- the caller's dbra counter IS the side select.
    ram.setU8(a5 + (d7 !== 0 ? 0x04 : 0x05), d0 & 0xff);     // $25D3BA / $25D3C0
  }

  // $25D3C4 move.w ($A,A4),D1 -- A4 is set by NEITHER this routine nor either caller, so its value
  // is inherited from further up the frame. The string still prints; only its ROW is unresolved,
  // and it is left at the bias rather than invented.
  if (a4 === undefined) {
    ctx.unported?.note(HANDLER5.addr, '$25D3C4 move.w ($A,A4),D1 -- A4 is inherited, not set. The '
      + 'row this string prints at is the one value in the handler this port cannot resolve');
  }
  const src = a4 === undefined ? 0 : rom.u16(a4 + 0x0a);
  const row = u16((src >>> HANDLER5.shift) + HANDLER5.bias);  // $25D3C8 lsr #6 / $25D3CA lsr #3
  txString25A14C(ctx.tx, rom, HANDLER5.col, row, 0, HANDLER5.string);   // $25D3DC jsr $25A14C
  ram.setU8(a6 + SCREEN17.phaseAt, HANDLER5.nextPhase);      // $25D3E2 -- state 5 ADVANCES to 6
}

/** `$25D4E4` -- SIDE INDEX FROM D7, twelve bytes, and the third independent confirmation of the
 *  mapping: `tst.w D7 / bne` returns 0 when D7 is non-zero and 1 when it is zero. `dbra` counts
 *  DOWN, so record 0 (D7 = 1) is side 0. */
export function sideFromD7_25D4E4(d7) {
  return u16(d7) !== 0 ? 0 : 1;                              // $25D4E6 tst.w D7 / bne / $25D4EC
}

/** `$25F2D0..$25F30B` -- the two-line label printer. D0 selects `$25F43A` when its low word is zero
 *  and `$25F43E` otherwise. The descriptor's second word becomes D0, its first becomes D1, and the
 *  second string is `$10` bytes later at D1 - 1. Both `$25A14C` calls preserve their arguments. */
export const LABELS_25F2D0 = Object.freeze({
  addr: 0x25f2d0, bytes: 0x3c, strings: 0x25f1f0, stringStride: 0x10,
  descriptors: Object.freeze([0x25f43a, 0x25f43e]),
});

export function sideLabels25F2D0(tx, rom, d0) {
  const L = LABELS_25F2D0;
  const a4 = L.descriptors[u16(d0) === 0 ? 0 : 1];             // $25F2D4..$25F2E2
  const stringD0 = rom.u16(a4 + 2);                            // $25F2EA move.w ($2,A4),D0
  let stringD1 = rom.u16(a4);                                 // $25F2EE move.w (A4),D1
  txString25A14C(tx, rom, stringD0, stringD1, 0, L.strings);   // $25F2F4 jsr $25A14C
  stringD1 = u16(stringD1 - 1);                               // $25F2FE subq.w #1,D1
  txString25A14C(tx, rom, stringD0, stringD1, 0,
    L.strings + L.stringStride);                               // $25F300 jsr $25A14C
}

export const HANDLER6 = Object.freeze({
  addr: 0x25d4f0, gate: 0x813098, sound: 0x28caae, announce: 0x260a9a,
  labels: 0x25f2d0, nextPhase: 0x07,
  clears: Object.freeze([0x32, 0x5a, 0x5e, 0x60]),
});

/** `$25D4F0` -- THE STATE-6 HANDLER, shared by slots [17] and [9].
 *
 *  It prints BOTH sides' labels unconditionally (`$25F2D0` with D0 = 0 then D0 = 1), then -- only
 *  when `$813098` is clear -- posts a sound. The four clears and the state advance happen either
 *  way, so the gate does NOT stop the progression, only the sound.
 *
 *  THE TAIL RE-ANNOUNCES FOR THE OTHER SIDE. `$25D550 addq.w #1,D0 / andi.w #$1,D0` flips the index
 *  `$25D4E4` just derived, so the second `$260A9A` is deliberately the opposite side. And it is
 *  reached when `$813098` is SET *or* `(A0)` is zero -- two unrelated conditions, one arm.
 */
export function phase6_25D4F0(ram, rom, ctx, a6, d7) {
  sideLabels25F2D0(ctx.tx, rom, 0);                            // $25D4F2 moveq #0 / $25D4F4 jsr
  sideLabels25F2D0(ctx.tx, rom, 1);                            // $25D4FA moveq #1 / $25D4FC jsr

  if (ram.u16(HANDLER6.gate) === 0) {                        // $25D500 tst.w $813098 / bne $25D510
    ctx.soundPost?.(HANDLER6.sound);                         // $25D50A jsr $28CAAE
  }
  for (const off of HANDLER6.clears) ram.setU16(a6 + off, 0);   // $25D510..$25D51C
  ram.setU8(a6 + SCREEN17.phaseAt, HANDLER6.nextPhase);      // $25D522 -- 6 ADVANCES to 7
  announcePost(ram, HANDLER6.announce, sideFromD7_25D4E4(d7));   // $25D528 bsr / $25D52A jsr

  // $25D530/$25D53A -- A6 walks to the other record and straight back, so the pair is a no-op; it
  // exists only so the two arms share one tail.
  if (ram.u16(HANDLER6.gate) !== 0) {                        // $25D53E tst.w / bne $25D54E
    announcePost(ram, HANDLER6.announce, u16(sideFromD7_25D4E4(d7) + 1) & 1);   // $25D550/$25D552
  } else {
    ctx.unported?.note(0x25d548, '$25D548 tst.b (A0) -- with $813098 clear, a ZERO byte at (A0) '
      + 'ALSO takes the second announce. A0 is inherited, not set by this routine or either caller');
  }
}

/** The two per-side descriptors `$25D306` selects, at a stride of `$E` -- fourteen, not sixteen.
 *  `$25D39C`'s `($A,A4)` is the fourth field, which is why that handler's row was unresolved until
 *  this routine pinned where A4 comes from. */
export const DESC17 = Object.freeze({
  base: Object.freeze([0x25d29a, 0x25d2a8]), stride: 0x0e,
  raw: 0x02, edge: 0x06, rowSrc: 0x0a, tail: 0x0c,
  // $25D2EA's two order tables. They are MIRRORED: side 0 walks 0,1,2 and side 1 walks 2,1,0.
  order: Object.freeze([0x25d2de, 0x25d2e4]), orderLen: 3,
});

/** `$25D2EA` -- PICK THE FIRST OPTION THE OTHER SIDE IS NOT ON.
 *
 *  `cmp.w (A0),D0 / bne` exits on the first entry that DIFFERS from D0, which reads backwards until
 *  you see what D0 is: the caller loads it from the OTHER side's byte. So this returns the first
 *  choice the other player has not taken, and the two order tables run in opposite directions so
 *  the two players scan from opposite ends.
 */
export function pickFree25D2EA(rom, d7, d0) {
  const table = DESC17.order[sideFromD7_25D4E4(d7)];         // $25D2EA / $25D2F2, chosen by D7
  for (let i = 0; i < DESC17.orderLen; i++) {                // $25D2F6 moveq #2,D1 + dbra = THREE
    const v = rom.u16(table + i * 2);
    if (v !== u16(d0)) return v;                             // $25D2F8 cmp.w (A0),D0 / bne $25D302
  }
  return rom.u16(table + DESC17.orderLen * 2);               // fell through: A0 walked past the end
}

export const HANDLER3 = Object.freeze({
  addr: 0x25d306, nextPhase: 0x04,
  // $25D35A's block, verbatim. Three ($60,$C00) pairs then two singles.
  tailWords: Object.freeze([[0x16, 0x0060], [0x18, 0x0c00], [0x1c, 0x0060], [0x1e, 0x0c00],
    [0x22, 0x0060], [0x24, 0x0c00], [0x2a, 0x00b4], [0x2e, 0x0599]]),
  tailCount: 0x31, tailCountValue: 0x02, tailClear: 0x30,
});

/** `$25D306` -- THE STATE-3 HANDLER, shared by slots [17] and [9].
 *
 *  EACH SIDE READS THE OTHER SIDE'S BYTE. The D7 != 0 arm loads `($7,A5)` -- side 1's -- and writes
 *  `($6,A5)`, its own; the other arm does the mirror. Together with `$25D2EA` returning the first
 *  entry that DIFFERS, that is a mutual exclusion: neither side can sit on the other's choice.
 *
 *  A NEGATIVE byte means "the other side has not chosen", and then the default is the FIRST entry of
 *  this side's own order table -- 0 for side 0, 2 for side 1, which are opposite ends.
 *
 *  IT SETS `($1,A6) = 4`, NOT 5. Slot [17] overwrites that with 5 at `$25CEE8` the instant this
 *  returns, because slot [17] has no state-4 handler; slot [9] does (`$25D402`) and lets it stand.
 *  So the same routine advances two different screens to two different states.
 */
export function phase3_25D306(ram, rom, ctx, a5, a6, d7) {
  const side = sideFromD7_25D4E4(d7);
  const otherByte = side === 0 ? 0x07 : 0x06;                // $25D310 / $25D33A -- the OTHER side's
  const ownByte = side === 0 ? 0x06 : 0x07;                  // $25D31E / $25D346 -- its own
  const d0 = ram.u8(a5 + otherByte);

  if ((d0 & 0x80) !== 0) {                                   // $25D314 tst.b / bge -- SIGNED
    ram.setU16(a6 + 0x04, side === 0 ? 0 : 2);               // $25D318 / $25D340 -- opposite ends
  } else {
    ram.setU16(a6 + 0x04, pickFree25D2EA(rom, d7, d0));      // $25D326 bsr / $25D328
  }
  // $25D31E / $25D346 -- and this reads ($5,A6), which the move.w two lines up JUST OVERWROTE with
  // the low byte of the choice. So the side's own slot byte receives THE CHOSEN OPTION, not
  // whatever ($5,A6) held before. The word write and the byte read deliberately overlap.
  ram.setU8(a5 + ownByte, ram.u8(a6 + 0x05));

  for (const [off, v] of HANDLER3.tailWords) ram.setU16(a6 + off, v);   // $25D35A..$25D388
  ram.setU8(a6 + HANDLER3.tailCount, HANDLER3.tailCountValue);          // $25D38A
  ram.setU8(a6 + HANDLER3.tailClear, 0);                                // $25D390 clr.b
  ram.setU8(a6 + SCREEN17.phaseAt, HANDLER3.nextPhase);                 // $25D394 -- FOUR
}

// -------------------------------------------------------------------------------------------
// `$25D560` -- THE STATE-7 HANDLER. 732 bytes, `$25D560..$25D83B`, ONE routine with ONE `rts`.
// -------------------------------------------------------------------------------------------

/** The `$25D800` draw tail, in ROM order. `gate` is the bit of `($3,A5)` that must be CLEAR for the
 *  call to happen and `null` for the ungated ones; `d7` says whether the callee takes the side.
 *
 *  **IT IS SEVEN CALLS, NOT EIGHT.** Eight `draw25*` routines are ported in `objslot9.js`; this tail
 *  calls `$25E4D0` and does NOT call `$25EDF8`, which is the exact opposite of `confirmAndDraw`'s
 *  two tails. The brief this port was written from said "all eight draws still run" -- the ROM says
 *  seven, and `$25D800..$25D839` holds exactly seven `4EB9` jsrs. Counted from the dump, not
 *  assumed. */
export const TAIL_25D560 = Object.freeze([
  Object.freeze({ at: 0x25d808, addr: 0x25e220, fn: 'draw25E220', gate: 0, d7: false }),
  Object.freeze({ at: 0x25d80e, addr: 0x25e29e, fn: 'draw25E29E', gate: 0, d7: false }),
  Object.freeze({ at: 0x25d814, addr: 0x25e4d0, fn: 'draw25E4D0', gate: null, d7: true }),
  Object.freeze({ at: 0x25d822, addr: 0x25e6ce, fn: 'draw25E6CE', gate: 1, d7: false }),
  Object.freeze({ at: 0x25d828, addr: 0x25e824, fn: 'draw25E824', gate: null, d7: true }),
  Object.freeze({ at: 0x25d82e, addr: 0x25ef30, fn: 'draw25EF30', gate: null, d7: true }),
  Object.freeze({ at: 0x25d834, addr: 0x25f074, fn: 'draw25F074', gate: null, d7: true }),
]);

export const STATE7_HEAD_25F530 = Object.freeze({
  addr: 0x25f530, bytes: 80, inner: 0x25f592, innerBytes: 560,
  records: Object.freeze([0x813028, 0x81304c]),
  delayAt: 0x02, positionAt: 0x04,
  sequenceTickAt: 0x08, sequenceReloadAt: 0x09, sequenceAt: 0x0a, pauseAt: 0x0c,
  palettePtrAt: 0x0e, paletteBankAt: 0x12,
  spriteTickAt: 0x14, spriteReloadAt: 0x15, spriteAt: 0x16, spritePtrAt: 0x18,
  satellites: Object.freeze([0x1c, 0x1e, 0x20, 0x22]),
  frameTable: 0x25f7c8, frameTableBytes: 0x00a0,
  spriteTables: 0x25f880, spriteTableBytes: 0x0078,
  palettes: 0x2241f8, paletteBytes: 0x0100,
  commonPalette: 0x2242b8, commonBank: 0x0016, selectedPaletteSite: 0x25f5ba,
  mainEmitter: 0x23df86, detailEmitter: 0x23e4d2,
  detailDuplicateAt: 0x803912, satelliteGateAt: 0x80390c,
  satelliteFlagsAt: 0x80390a, satelliteEmitterAt: 0x80390b,
  satelliteFlagTable: 0x25f8f8, satelliteFlagTableBytes: 0x0040,
  requestedAt: 0x813006,
});

export const HANDLER7 = Object.freeze({
  addr: 0x25d560, rts: 0x25d83a, bytes: 732, drawTail: 0x25d800,
  otherRec: 0x70,                            // $25D56A lea ($70,A6) / $25D570 lea (-$70,A6)
  loopCounter: 0x813098,                     // $25D574 tst.w -- the second-loop word
  liveAt: 0x00, rendezvousAt: 0x01, rendezvous: 0x07,        // $25D584 / $25D588, on the OTHER rec
  announceLatch: 0x5e, announce: 0x260a9a,   // $25D592 / $25D59A / $25D5AA
  soundLatch: 0x812f82, sound: 0x28cb9c,     // $25D5B0 / $25D5BA / $25D5C2
  frameAt: 0x32,                             // $25D5C8 addq.w #1 -- THE frame counter
  // The two ACCELERATING ramps: a ceiling on the value, a per-frame bump on its own delta word.
  rampA: Object.freeze({ at: 0x36, ceil: 0x3800, deltaAt: 0x3a, deltaStep: 0x0009 }),   // $25D5CC
  rampB: Object.freeze({ at: 0x38, ceil: 0x1c00, deltaAt: 0x3c, deltaStep: 0x0004 }),   // $25D5E2
  rampC: Object.freeze({ at: 0x3e, ceil: 0x7000, step: 0x0200 }),                       // $25D5F6
  // ...and the two CROSS-GATED ones. Each is opened by a different field's threshold.
  rampD: Object.freeze({ at: 0x48, ceil: 0x3800, step: 0x0033, openAt: 0x40, openBelow: 0x14c0 }),
  rampE: Object.freeze({ at: 0x46, ceil: 0x7000, step: 0x0033, openAt: 0x48, openFrom: 0x0300 }),
  palOnceAt: 0x0a, palSrc: 0x2243f8, palBank: 0x1a, palBytes: 0x40,   // $25D630/$25D63A/$25D640
  // W375 PORTED BOTH OF THESE -- `handoff26070C` and `playerRecords25F456`. The addresses stay
  // because $25D662/$25D668 are still the sites; the byte counts are the extents they cover.
  handoff: 0x26070c, handoffBytes: 124, tailCall: 0x25f456, tailCallBytes: 218,
  flashAt: 0x42, flashHoldAt: 0x44, flashHold: 0x0040, flashReload: 0x0003,   // $25D670..$25D69C
  fuseAt: 0x40, fuseStep: 0x0026,
  gateSlide: 0x00f0, gateRamp: 0x00aa, gateZoom: 0x0001,     // $25D6A0 / $25D754 / $25D784
  slideFlagAt: 0x35, slideFlag: 0x01,        // $25D6AA move.b #$1,($35,A6) -- a BYTE, not a word
  speedAt: 0x4c, speedCap: 0x0080, speedDecel: 2,            // $25D6B0 / $25D706 subq.w #2
  travelAt: 0x4a, travelCap: 0x1800,                         // $25D6B8 / $25D6D0
  doneAt: 0x5a, emitGateAt: 0x54,            // $25D6E6 / $25D716, and $25D6EE gates $25E4D0's emit 2
  anchorAt: 0x56, pairLatch: 0x812f80, pairSite: 0x2603fe, pairBytes: 172,
  nextPhase: 0x08,                           // $25D748 AND $25D74E -- BOTH records
  tiltAt: 0x62, tiltStep: 0x0080, tiltCap: 0x2600, tiltClearAt: 0x64,        // $25D754..$25D782
  delayAt: 0x6c, tickAt: 0x6a, reloadAt: 0x6b,               // $25D78E / $25D79E / $25D7A6
  cursorAt: 0x60, cursorStep: 4, cursorCap: 0x003c,          // $25D7AC / $25D7B6
  // THE $25D85C WALK. 122 word entries plus the $FFFF sentinel at $25D950 = 246 bytes, and the
  // sentinel is INSIDE the window because $25D7DC reads it before $25D7E0 recognises it.
  stepTable: 0x25d85c, stepEntries: 122, stepBytes: 0x00f6, stepSentinel: 0xffff,
  stepCursorAt: 0x52, stepIntoAt: 0x4e, stepCeil: 0x3800,    // $25D7D4 / $25D7EE / $25D7C4
  halfIntoAt: 0x50, halfCeil: 0x1c00,                        // $25D7F2 / $25D7FC
  head: STATE7_HEAD_25F530.addr, headBytes: STATE7_HEAD_25F530.bytes,
  headInner: STATE7_HEAD_25F530.inner, headInnerBytes: STATE7_HEAD_25F530.innerBytes,   // $25D560
  perFrame: 0x25faa4, perFrameBytes: 334,                    // $25D57E
});

const hex7 = (v) => `$${v.toString(16).toUpperCase()}`;

/** `$25D800..$25D83A` -- THE DRAW TAIL, and it is a real label with TWO ways in: the fall-through
 *  from `$25D7FC` and `$25D58E bne.w $25D800`, the rendezvous bail. That second edge is why the
 *  screen keeps drawing off the previous frame's field values while the other side catches up.
 *
 *  THE ORDER IS LOAD-BEARING. All seven emit into bucket 0, so reordering them reorders sprites.
 *
 *  `draws` is the caller's registry. `objslot9.js` already imports `objslot17.js`, so importing the
 *  draws back would close a cycle; they arrive as an argument or as `ctx.selectDraws` instead. An
 *  absent one is a COUNTED NOTE per call site, never a silent skip. */
function drawTail25D800(ram, rom, ctx, a5, a6, d7, draws) {
  const fire = (e) => {
    const fn = draws?.[e.fn];
    if (typeof fn !== 'function') {
      ctx.unported?.note(e.addr, `${hex7(e.addr)} -- the ${hex7(0x25d800)} tail's ${e.fn}, called `
        + `from ${hex7(e.at)}. objslot9.js exports it and importing objslot9.js from objslot17.js `
        + 'would close a cycle, so the tail takes its draws as an argument or as ctx.selectDraws. '
        + 'Neither was supplied, so this sprite is NOT on screen');
      return;
    }
    if (e.d7) fn(ram, rom, ctx, a6, d7); else fn(ram, rom, ctx, a6);
  };

  // $25D800 bset #$0,($3,A5) / bne.s $25D814. ($3,A5) is cleared ONCE PER FRAME by the dispatcher
  // at $25CEC8, so the FIRST record through does the gated pairs and the second skips them, while
  // the ungated ones run twice. Two separate bsets, each reading its own old bit -- not one write.
  if (ram.bset8(a5 + SCREEN17.busy, 0) === 0) {
    fire(TAIL_25D560[0]);                                    // $25D808 jsr $25E220
    fire(TAIL_25D560[1]);                                    // $25D80E jsr $25E29E
  }
  fire(TAIL_25D560[2]);                                      // $25D814 jsr $25E4D0 -- UNGATED
  if (ram.bset8(a5 + SCREEN17.busy, 1) === 0) {              // $25D81A bset #$1,($3,A5)
    fire(TAIL_25D560[3]);                                    // $25D822 jsr $25E6CE
  }
  fire(TAIL_25D560[4]);                                      // $25D828 jsr $25E824
  fire(TAIL_25D560[5]);                                      // $25D82E jsr $25EF30
  fire(TAIL_25D560[6]);                                      // $25D834 jsr $25F074 -- $25D83A rts
}

// =================================================================================================
// W375 -- THE THREE CALLEES `$25D630`'s ONCE-ONLY BLOCK MAKES. `$25D662 jsr $26070C` and
// `$25D668 jsr $25F456` fire back to back, both inside the `bset #$0,($A,A5)` gate, so the whole
// of what follows happens exactly ONCE per screen and on whichever record gets there first.
//
// **BOTH CALLEES OPEN WITH `movem.l d0-d7/a0-a6,-(A7)` AND CLOSE WITH THE MATCHING RESTORE**
// (`$25F456`/`$25F52A` and `$26070C`/`$260782`), so neither one clobbers a single register the
// caller was holding. That is why `d0Site` survives the pair below rather than being reset.
// =================================================================================================

/**
 * `$25F456..$25F52F`, 218 bytes, no calls -- **THE TWO PLAYER RECORDS**.
 *
 * Two mirrored blocks, one per side, over records that are `$24` bytes apart (`$813028` and
 * `$81304C`) -- the same `$24` stride `$25FF7A`'s `lea ($24,A6),A6` walks. It does NOT read A0, A6
 * or D0..D4 as the caller left them: it re-reads `($4,A5)` and `($5,A5)` itself, which is why the
 * four `moveq #0` and four `move.b` at `$25D648..$25D65E` belong to `$26070C` and not to this.
 *
 * **THE SELECTION BYTE IS `$810440`'s / `$8104A2`'s LOW BYTE AND ITS DOMAIN IS `{2, 4, 6}`.**
 * `$25CD88`/`$25CD38` seed `($4,A5)`/`($5,A5)` from those two words, and object [11]'s y table at
 * `$25D98A` holds exactly `$0002 $0004 $0006` -- three entries, which `$25DB98`'s `dbra` count of
 * `moveq #$2` confirms. So `subq.w #2 / add.w D0,D0 / add.w D0,D0` -- a stride of FOUR, not eight
 * -- lands on offsets 0, 8 and $10, and the table at `$25F868` is THREE eight-byte entries. Read
 * with a stride of eight the code looks wrong; read with the real domain it is exact.
 *
 * **AND THE TABLE'S FAR END IS ITS OWN FIRST PAYLOAD.** Entry 0's first longword is `$0025F880`,
 * and `$25F880` is where the pointed-to `$28`-byte blocks start (`$25F880`, `$25F8A8`, `$25F8D0`,
 * one per entry, at exactly that stride). So `$25F868 + $18` is pinned by the data itself.
 *
 * `$25F460 bmi.b` is a BYTE test of bit 7 and it is the only bound the routine states. State 0
 * fills all six of `($4,A5)..($9,A5)` with `$FF` at `$25CCCC`, so an unseeded side is negative and
 * is skipped -- the `bmi` IS the "this side did not join" guard, not a range check.
 *
 * `$25F46C`, `$25F4A6`, `$25F4D4` and `$25F50E` are `nop`s sitting between the `lea` and the
 * `adda`/first read. Transcribed as nothing, and noted only because they are there.
 */
export const PLAYERREC_25F456 = Object.freeze({
  addr: 0x25f456, bytes: 218,
  // $25F468/$25F4D0 `lea ($25F868,PC),A0`: EA is the EXTENSION WORD's address plus the
  // displacement -- $25F46A + $3FE and $25F4D2 + $396, which are the same address.
  ptrTable: 0x25f868, ptrEntries: 3, ptrStride: 4, ptrBytes: 0x18,
  wordTable: 0x25f7c2, wordBytes: 6,        // $25F4A2/$25F50A, and exactly three `(A0)+` word reads
  // Field offsets off each record's base, shared by both mirrors.
  fPtrA: 0x18, fPtrB: 0x0e, fCountA: 0x12, fCountB: 0x04, fCountC: 0x06,
  fW0: 0x02, fW1: 0x14, fW2: Object.freeze([0x1c, 0x1e, 0x20, 0x22]),
  // The mirrors differ in TWO constants and nothing else: $17 vs $18 and $5E00 vs $1200.
  sides: Object.freeze([
    Object.freeze({ srcAt: 0x04, base: 0x813028, cA: 0x0017, cB: 0x5e00, cC: 0x1c00 }),
    Object.freeze({ srcAt: 0x05, base: 0x81304c, cA: 0x0018, cB: 0x1200, cC: 0x1c00 }),
  ]),
});

/** `$25F456` -- see `PLAYERREC_25F456`. Takes only A5; every other register is ignored. */
export function playerRecords25F456(ram, rom, a5) {
  const P = PLAYERREC_25F456;
  for (const s of P.sides) {
    const sel = ram.u8(a5 + s.srcAt);          // $25F45A moveq #0,D0 / $25F45C move.b ($4,A5),D0
    if ((sel & 0x80) !== 0) continue;          // $25F460 bmi.b $25F4C2 -- BYTE bit 7, not a range
    // $25F462 subq.w #2 / $25F464 add.w D0,D0 / $25F466 add.w D0,D0, and $25F46E `adda.w D0,A0`
    // SIGN-EXTENDS the word, so a selection under 2 indexes BACKWARDS off the table rather than
    // wrapping. Kept, because the ROM window is what draws the line and it draws it loudly.
    let a0 = P.ptrTable + i16(u16(u16(sel - 2) * 4));
    ram.setU32(s.base + P.fPtrA, rom.u32(a0)); a0 += 4;     // $25F470 move.l (A0)+,$813040
    ram.setU32(s.base + P.fPtrB, rom.u32(a0)); a0 += 4;     // $25F476 move.l (A0)+,$813036
    ram.bset8(s.base, 0);                                   // $25F47C bset.b #$0,$813028 -- a BYTE
    ram.setU16(s.base + P.fCountA, s.cA);                   // $25F484 move.w #$17,$81303A
    ram.setU16(s.base + P.fCountB, s.cB);                   // $25F48C move.w #$5E00,$81302C
    ram.setU16(s.base + P.fCountC, s.cC);                   // $25F494 move.w #$1C00,$81302E
    // $25F49C lea $813028,A1 -- the SAME base, taken again; the writes below are (d16,A1).
    let w = P.wordTable;                                    // $25F4A2 lea ($25F7C2,PC),A0
    ram.setU16(s.base + P.fW0, rom.u16(w)); w += 2;         // $25F4A8 move.w (A0)+,($2,A1)
    ram.setU16(s.base + P.fW1, rom.u16(w)); w += 2;         // $25F4AC move.w (A0)+,($14,A1)
    const d0 = rom.u16(w);                                  // $25F4B0 move.w (A0)+,D0 -- the THIRD
    for (const off of P.fW2) ram.setU16(s.base + off, d0);  // $25F4B2/$25F4B6/$25F4BA/$25F4BE
  }
}

function addWordToLong(v, add) {
  return (((v >>> 0) & 0xffff0000) | u16((v & 0xffff) + add)) >>> 0;
}

function swapWords(v) {
  return (((v << 16) | (v >>> 16)) >>> 0);
}

function installState7Palette(ram, rom, ctx, source, bank, site, why) {
  if (ctx.palette) {
    install24150A(ram, ctx.palette, bank, rom.bytes(source, 0x40), site, why);
    return;
  }
  ctx.unported?.note(0x24150a, `$24150A bank ${bank} <- ${hex7(source)} from ${hex7(site)} `
    + 'with no PaletteState on this chain');
}

/** `$25F592..$25F7C1` -- animate and draw one joined selection record. */
export function state7Player25F592(ram, rom, ctx, a6) {
  const K = STATE7_HEAD_25F530;
  if (ram.u16(a6 + K.delayAt) !== 0) {                         // $25F592 tst.w ($2,A6)
    ram.setU16(a6 + K.delayAt, u16(ram.u16(a6 + K.delayAt) - 1));
    return;
  }

  if (ram.bset8(a6, 1) === 0) {                               // $25F59E bset #1,(A6)
    installState7Palette(ram, rom, ctx, K.commonPalette, K.commonBank, 0x25f5ac,
      `${hex7(K.addr)} common selection palette`);
    installState7Palette(ram, rom, ctx, ram.u32(a6 + K.palettePtrAt),
      ram.u16(a6 + K.paletteBankAt), K.selectedPaletteSite,
      `${hex7(K.addr)} selected pilot palette`);
  }

  let d1 = (ram.u32(a6 + K.positionAt) + 0xf400e400) >>> 0;   // $25F5C0/$25F5C4
  let d2 = rom.u32(K.frameTable + ram.u16(a6 + K.sequenceAt));
  enqueueRegistersThroughStub(ram, rom, K.mainEmitter, d1, d2, 0x0ce0, K.commonBank);

  if (ram.u16(a6 + K.pauseAt) === 0) {                         // $25F5E6 beq $25F78C
    const tick = ram.u8(a6 + K.sequenceTickAt);
    ram.setU8(a6 + K.sequenceTickAt, u16(tick - 1) & 0xff);   // $25F78C subq.b #1
    if (tick !== 0) return;
    ram.setU8(a6 + K.sequenceTickAt, ram.u8(a6 + K.sequenceReloadAt));
    const sequence = u16(ram.u16(a6 + K.sequenceAt) + 4);     // $25F798 addq.w #4
    ram.setU16(a6 + K.sequenceAt, sequence);
    if (sequence === 0x005c) {
      ram.setU16(a6 + K.pauseAt, 0x0090);                      // $25F7A4
      return;
    }
    if (sequence === 0x009c) {
      ram.bset8(a6, 2);                                       // $25F7B4
      ram.setU16(K.requestedAt, 1);                            // $25F7B8
    }
    return;
  }

  ram.setU16(a6 + K.pauseAt, u16(ram.u16(a6 + K.pauseAt) - 1)); // $25F5EE
  let a0 = ram.u32(a6 + K.spritePtrAt) + ram.u16(a6 + K.spriteAt);
  d2 = rom.u32(a0); a0 += 4;
  d1 = (ram.u32(a6 + K.positionAt) + 0xf600f800) >>> 0;
  d1 = addWordToLong(d1, 0xee00);                              // $25F608 addi.w #-$1200
  const detailBank = ram.u16(a6 + K.paletteBankAt);
  enqueueZoomedRegistersThroughStub(
    ram, rom, K.detailEmitter, d1, d2, 0x0a40, detailBank, 0x80008000,
  );
  // `$25F62A` performs a dead lookup before `$25F640` replaces D6 with the
  // second detail sprite's visible zoom flags.
  if (ram.u16(K.detailDuplicateAt) !== 0) {
    enqueueZoomedRegistersThroughStub(
      ram, rom, K.detailEmitter, d1, d2, 0x0a40, detailBank, 0x80005000,
    );
  }
  d2 = rom.u32(a0);

  for (const off of K.satellites) {                            // $25F64E..$25F680
    if (ram.u16(a6 + off) === 0x0280) continue;
    ram.setU16(a6 + off, u16(ram.u16(a6 + off) + 8));
    break;
  }

  if (ram.u16(K.satelliteGateAt) !== 0) {                     // $25F684 tst.w $80390C
    d1 = (ram.u32(a6 + K.positionAt) + 0xfe00f000) >>> 0;
    d1 = addWordToLong(d1, 0x0900);
    d1 = swapWords(addWordToLong(swapWords(d1), 0x0600));
    const flagOffset = (ram.u16(K.satelliteFlagsAt) & 0x001e) * 2;
    const flags = rom.u32(K.satelliteFlagTable + flagOffset);
    const regular = (ram.u8(K.satelliteEmitterAt) & 0x02) !== 0;
    const emit = (coords, art, size) => {
      if (regular) {
        enqueueRegistersThroughStub(ram, rom, K.mainEmitter, coords, art, size, detailBank);
      } else {
        enqueueZoomedRegistersThroughStub(
          ram, rom, K.detailEmitter, coords, art, size, detailBank, flags,
        );
      }
    };
    emit(d1, d2, ram.u16(a6 + K.satellites[0]));
    for (let i = 1; i < K.satellites.length; i++) {
      const d3 = ram.u16(a6 + K.satellites[i]);
      if (d3 === 0x0200) continue;
      d1 = (d1 + 0xfc000000) >>> 0;
      d2 = (d2 + 0x84) >>> 0;
      emit(d1, d2, d3);
    }
  }

  const spriteTick = ram.u8(a6 + K.spriteTickAt);             // $25F76C subq.b #1
  ram.setU8(a6 + K.spriteTickAt, u16(spriteTick - 1) & 0xff);
  if (spriteTick === 0) {
    ram.setU8(a6 + K.spriteTickAt, ram.u8(a6 + K.spriteReloadAt));
    const sprite = u16(ram.u16(a6 + K.spriteAt) + 8);
    ram.setU16(a6 + K.spriteAt, sprite === 0x0028 ? 0 : sprite);
  }
}

/** `$25F530..$25F57F` -- choose the eligible joined record and run `$25F592`. */
export function state7Head25F530(ram, rom, ctx, d7) {
  const K = STATE7_HEAD_25F530;
  const eligible = (base) => (ram.u8(base) & 0x01) !== 0 && (ram.u8(base) & 0x04) === 0;
  let base = null;
  if (u16(d7) !== 0 && eligible(K.records[0])) base = K.records[0];
  if (base === null && eligible(K.records[1])) base = K.records[1];
  if (base !== null) state7Player25F592(ram, rom, ctx, base);
}

/** `$25D990..$25D9E5`, 84 bytes -- **SAVE BOTH SIDES' SELECTIONS**, and the reason `$26070C`
 *  swaps D1 and D2.
 *
 *  It pairs its arguments ACROSS the register file, not adjacently:
 *
 *      $813008 <- ($25D9E6 of D0, D2)   with D5 = 0
 *      $813018 <- ($25D9E6 of D1, D3)   with D5 = 1
 *
 *  so side 0 is (D0,D2) and side 1 is (D1,D3). `$26070C` hands it (P1 style, P2 style, P1 ship,
 *  P2 ship) precisely so that those two strided pairs come out per-player.
 *
 *  Each arm writes the `$FF` "nothing saved" sentinel FIRST and only overwrites it when `$25D9E6`
 *  returns CARRY CLEAR, so a defaulted lookup leaves the sentinel standing -- which is exactly the
 *  `$FF` `otherSideHolds25DAEA` tests for. `move.b D6`/`move.b D7` store the LOW BYTE of a word
 *  `$25D9E6` may have left as a raw posted value.
 *
 *  **THE BRIEF FOR THIS WAVE SAID `$25D990` WAS ALREADY PORTED. IT WAS NOT** -- only its callee
 *  `$25D9E6` was (`tallyscreen.js`'s `cursorsFromPosted25D9E6`). It is eighty-four bytes with one
 *  call and that call resolved, so it is transcribed here rather than noted.
 */
export const SAVEDSEL_25D990 = Object.freeze({
  addr: 0x25d990, bytes: 84,
  recs: Object.freeze([0x813008, 0x813018]),                // $25D990/$25D998 and $25D9BA/$25D9C2
  sentinel: 0xff,
});

/** `$25D990` -- see `SAVEDSEL_25D990`. */
export function savedSelections25D990(ram, rom, d0, d1, d2, d3) {
  const S = SAVEDSEL_25D990;
  const arms = [
    { rec: S.recs[0], d6: d0, d7: d2, d5: 0 },              // $25D9A0/$25D9A2/$25D9A4
    { rec: S.recs[1], d6: d1, d7: d3, d5: 1 },              // $25D9CA/$25D9CC/$25D9CE
  ];
  for (const a of arms) {
    ram.setU8(a.rec, S.sentinel);                           // $25D990/$25D9BA move.b #$FF
    ram.setU8(a.rec + 1, S.sentinel);                       // $25D998/$25D9C2 move.b #$FF
    const c = cursorsFromPosted25D9E6(rom, a.d5, a.d6, a.d7);   // $25D9A6/$25D9D0 bsr $25D9E6
    if (c.defaulted) continue;                              // $25D9AA/$25D9D4 bcs -- sentinel stays
    ram.setU8(a.rec, c.x & 0xff);                           // $25D9AE/$25D9D8 move.b D6
    ram.setU8(a.rec + 1, c.y & 0xff);                       // $25D9B4/$25D9DE move.b D7
  }
}

/**
 * `$26070C..$260786`, 124 bytes -- **THE ONE-SHOT HANDOFF**.
 *
 * `$260710 tst.w $813082 / beq.w $260782` and `$26071A clr.w $813082`: the flag is a REQUEST and
 * the routine consumes it, so a non-zero word runs the body once and every later call falls
 * straight through to the `movem` restore. It touches A0, A5 and A6 not at all.
 *
 * **IT STORES ITS FIVE ARGUMENTS AND THEN READS FOUR OF THEM BACK IN A DIFFERENT ORDER.**
 *
 *     D0 -> $813084      $813084 -> D0        D0 stays  (P1 style)
 *     D1 -> $813088      $813086 -> D1        D1 <- D2  (P2 style)
 *     D2 -> $813086      $813088 -> D2        D2 <- D1  (P1 ship)
 *     D3 -> $81308A      $81308A -> D3        D3 stays  (P2 ship)
 *     D4 -> $813080
 *
 * The caller supplies `($8,A5)`, `($4,A5)`, `($9,A5)`, `($5,A5)` -- P1's pair then P2's pair. The
 * swap regroups them BY FIELD, and `$25D990` then re-pairs (D0,D2) and (D1,D3) back into per-player
 * (style, ship). A port that passes D1 and D2 straight through saves P1's style against P1's ship
 * for side 0 -- which happens to look right for one side and is silently wrong for the other.
 *
 * `$813084` and `$813086` are `SCREEN17.p1Gate`/`p2Gate`, the two words state 0 read at `$25CD4E`
 * and `$25CD9E`, and `$813084`/`$813088` are `tally.js`'s `postD0`/`postD1` for side 0. This is the
 * same four-word mailbox from the other end.
 *
 * D7 is `$38` only when `$803926` is non-zero AND `$813092` is zero -- two independent gates, one
 * arm (`$260764 beq.w $260778` and `$260770 bne.w $260778` both land on the same instruction).
 * `$260778` then re-reads D6 from `$813080` AFTER `$25D990` has run, not from the D4 it stored, so
 * anything `$25D990` did to that word is picked up. Transcribed that way.
 */
export const HANDOFF_26070C = Object.freeze({
  addr: 0x26070c, bytes: 124,
  once: 0x813082,                                           // $260710 tst.w / $26071A clr.w -- WORD
  slotD0: 0x813084, slotD1: 0x813088, slotD2: 0x813086, slotD3: 0x81308a, slotD4: 0x813080,
  callee: 0x25d990,                                         // $260756 jsr
  d7Gate: 0x803926, d7Block: 0x813092, d7Set: 0x0038,       // $26075E / $260768 / $260774
  tail: 0x260580, tailBytes: 36,                            // $26077E bsr.w $260580
});

/** `$26070C` -- see `HANDOFF_26070C`. `save` exists so a test can watch what reaches `$25D990`.
 *
 *  `a5` is APPENDED AFTER `save` deliberately: `save` was already the ninth parameter and four
 *  test call sites pass a spy there positionally, so inserting ahead of it would silently hand
 *  those spies to the new argument. It is the caller's OBJECT RECORD -- `$26070C` never touches
 *  A5 (`$26070C movem.l d0-d7/a0-a6` / `$260782` restores it), so the A5 that reaches
 *  `$26059E bsr.w $25FF7A` two frames down the chain is still `$25D630`'s. W385 threads it
 *  because bonus line 6 writes `($2,A5)`. */
export function handoff26070C(ram, rom, ctx, d0, d1, d2, d3, d4, save = savedSelections25D990,
  a5 = undefined) {
  const K = HANDOFF_26070C;
  if (ram.u16(K.once) === 0) return false;                  // $260710 tst.w / beq.w $260782
  ram.setU16(K.once, 0);                                    // $26071A clr.w -- consumed, ONE-SHOT
  ram.setU16(K.slotD0, d0);                                 // $260720 move.w D0,$813084
  ram.setU16(K.slotD1, d1);                                 // $260726 move.w D1,$813088
  ram.setU16(K.slotD2, d2);                                 // $26072C move.w D2,$813086
  ram.setU16(K.slotD3, d3);                                 // $260732 move.w D3,$81308A
  ram.setU16(K.slotD4, d4);                                 // $260738 move.w D4,$813080
  // ...and back out THROUGH RAM, D1 and D2 crossed. Read before the call, so `$25D990` writing any
  // of these four cannot disturb the arguments it is being given.
  const r0 = ram.u16(K.slotD0);                             // $26073E move.w $813084,D0
  const r1 = ram.u16(K.slotD2);                             // $260744 move.w $813086,D1
  const r2 = ram.u16(K.slotD1);                             // $26074A move.w $813088,D2
  const r3 = ram.u16(K.slotD3);                             // $260750 move.w $81308A,D3
  save(ram, rom, r0, r1, r2, r3);                           // $260756 jsr $25D990

  let d7 = 0;                                               // $26075C moveq #$0,D7
  if (ram.u16(K.d7Gate) !== 0                               // $26075E tst.w $803926 / beq $260778
    && ram.u16(K.d7Block) === 0) {                          // $260768 cmpi.w #$0,$813092 / bne
    d7 = K.d7Set;                                           // $260774 move.w #$38,D7
  }
  const d6 = ram.u16(K.slotD4);                             // $260778 move.w $813080,D6 -- RE-READ

  // $26077E bsr.w $260580 -- **AND THIS IS A CALL NOW, NOT A NOTE.**
  //
  // The note that stood here described $260580 as "the mouth of a subtree" and listed the four
  // `bsr`s below it as unread. THAT WAS TRUE WHEN IT WAS WRITTEN AND IT STOPPED BEING TRUE IN
  // W378, which ported the whole of $260580..$2605A3 into `rank.js` as `stageStart260580`
  // (`$2604F4` -> `stageClear2604F4`, `$25FD24` -> `wipeStageBlock25FD24`, `$26051A` ->
  // `stageInstall26051A`, `$25FF7A` -> `computedDispatch`). Nobody removed the note, so the port
  // held the routine back from the ONE caller the cartridge gives it and the whole chain below
  // $26077E was dead.
  //
  // **IT IS ALSO THE ONLY WRITER OF `$81315C`.** `$26051A` ends in `$260578 jsr $26089E`, and
  // `$2608CA move.l (A0),$81315C` is the single store to that longword in the 6 MiB image. So
  // this line and `$26071A clr.w $813082` are two halves of one transaction: the `clr` above
  // switches the rank body ON and this call gives it the pointer it is now allowed to read. With
  // the note in place, W378's gate came down and the pointer stayed null, and `$2608D2`'s
  // `rom.u8(ram.u32($81315C) + stage)` threw `UNPORTED $0` on the frame after the handoff -- 2058
  // frames past START on a cold boot. Splitting the pair is what makes a null pointer reachable;
  // trap 14 in reverse.
  stageStart260580(ram, rom, ctx, d6, d7, a5);
  return true;
}

/** `$25FAA4..$25FBF1` -- the ordinary-loop selection-mode body. Its entry saves D0-D7/A0-A6
 *  and restores every register at `$25FBEC`, so the caller's live D0 survives this whole routine.
 *
 *  `$25FBF2` and `$25FC14` are the routine's two local leaves. Both reduce to `$256F14` or
 *  `$256F78`, and those reduce to the already-ported `$240CF0` TX blitter. The two label streams
 *  remain cartridge data at `$25FC68/$25FC78`; no source string stands in for them. */
export const PERFRAME_25FAA4 = Object.freeze({
  addr: 0x25faa4, bytes: 334,
  doneAt: 0x813078, delayAt: 0x813070, inputAt: 0x813072,
  modeAt: 0x813074, confirmAt: 0x813076, confirmByteAt: 0x813077,
  requestedAt: 0x813006, modeOut: 0x80393a,
  selectors: Object.freeze([0x813084, 0x813086]),
  rawInputs: Object.freeze([0x803970, 0x803976]),
  labelDraw: 0x25fbf2, labelDrawBytes: 34,
  modeDraw: 0x25fc14, modeDrawBytes: 84,
  labels: Object.freeze([0x25fc68, 0x25fc78]), labelBytes: 0x10,
  cursor: Object.freeze([
    Object.freeze({ d0: 0x0007, d1: 0x001d }),
    Object.freeze({ d0: 0x0007, d1: 0x0019 }),
  ]),
  moveSound: 0x28c6fa, confirmSound: 0x28c6e0, confirmFrames: 0x0020,
  clear: Object.freeze({ d0: 0x0074, d1: 0x0800, d2: 0x0004, d3: 0x000b }),
});

/** `$256F14..$256F4B` -- consume a cartridge TX control stream and draw each glyph through
 *  `$240CF0`. `$7F` begins another positioned run and `$FF` ends the stream. */
function txControl256F14(tx, rom, d5, start) {
  let a0 = start;
  for (;;) {
    let d0 = rom.u8(a0++);                                    // $256F20 move.b (A0)+,D0
    const d1 = rom.u8(a0++);                                  // $256F22 move.b (A0)+,D1
    a0 += 1;                                                   // $256F24 addq.w #1,A0
    for (;;) {
      const glyph = rom.u8(a0++);                             // $256F28 move.b (A0)+,D4
      if (glyph === 0x7f) break;                              // $256F2A/$256F2E: another run
      if (glyph === 0xff) return;                             // $256F30/$256F34: stream end
      const d4 = (((glyph & 0xff) << 16) | (d5 & 0xffff)) >>> 0;
      txBlock240CF0(tx, d0, d1, 0, 0, d4);                   // $256F3E jsr $240CF0
      d0 = u16(d0 + 1);                                      // $256F44 addq.w #1,D0
    }
  }
}

/** `$256F78..$256F93` -- one TX cell, tail-called into `$240CF0`. */
function txCell256F78(tx, d0, d1, d2) {
  const d4 = i16(d2) < 0 ? 0x00200002 : 0x003e0002;          // $256F78..$256F8A
  txBlock240CF0(tx, d0, d1, 0, 0, d4);                      // $256F8E jmp $240CF0
}

/** `$25FBF2..$25FC13` -- draw both cartridge labels with attribute zero. */
function selectionLabels25FBF2(tx, rom) {
  const P = PERFRAME_25FAA4;
  txControl256F14(tx, rom, 0, P.labels[0]);                  // $25FBFC jsr $256F14
  txControl256F14(tx, rom, 0, P.labels[1]);                  // $25FC0C jsr $256F14
}

/** `$25FC14..$25FC67` -- highlight the current mode's cursor and cartridge label. */
function selectedMode25FC14(ram, rom, tx) {
  const P = PERFRAME_25FAA4;
  const display = ram.u16(P.modeAt) === 0 ? 1 : 0;           // $25FC14 beq: zero takes second stream
  txCell256F78(tx, P.cursor[display].d0, P.cursor[display].d1, 1); // $25FC2A/$25FC50
  txControl256F14(tx, rom, 2, P.labels[display]);             // $25FC3A/$25FC60 jsr $256F14
}

/** `$25FAA4` -- draw and operate the cartridge's ordinary-loop one/two-round selector.
 *
 * The directional test deliberately uses D0 from the LAST joined side whose raw accessor ran,
 * while `$813072` receives the OR of every joined side. That is what the instruction sequence says:
 * it never reloads the aggregate before `btst #0/#1,D0`. Confirmation accepts any of bits 4-6,
 * latches the selected mode to `$80393A`, blinks for 32 ticks, then queues `$240EBC`'s exact clear. */
export function perFrame25FAA4(ram, rom, ctx) {
  const P = PERFRAME_25FAA4;
  if (ram.u16(P.doneAt) !== 0) return;                        // $25FAA8 bne $25FBEC

  txCell256F78(ctx.tx, P.cursor[0].d0, P.cursor[0].d1, -1);  // $25FABE jsr $256F78
  txCell256F78(ctx.tx, P.cursor[1].d0, P.cursor[1].d1, -1);  // $25FAD0 jsr $256F78
  selectionLabels25FBF2(ctx.tx, rom);                         // $25FAD6 bsr $25FBF2

  if (ram.u16(P.delayAt) !== 0) {                             // $25FADA tst.w $813070
    ram.setU16(P.delayAt, u16(ram.u16(P.delayAt) - 1));      // $25FAE4 subq.w #1
    return;
  }

  if (ram.u16(P.requestedAt) === 0) {                         // $25FAEE tst.w $813006
    ram.setU16(P.inputAt, 0);                                 // $25FAF8 move.w #0,$813072
    let d0 = 0;                                               // `$25FB30` sees the last live reader
    for (let side = 0; side < P.selectors.length; side++) {
      if (ram.u16(P.selectors[side]) === 0x00ff) continue;    // $25FB00/$25FB18 sentinel guards
      d0 = ram.u16(P.rawInputs[side]);                         // $23D16C / $23D17E exact two-op bodies
      ram.setU16(P.inputAt, u16(ram.u16(P.inputAt) | d0));    // $25FB12/$25FB2A or.w D0
    }

    if ((d0 & 0x0001) !== 0) {                               // $25FB30 btst #0,D0
      if (ram.u16(P.modeAt) === 0) {
        ram.setU16(P.modeAt, 1);                              // $25FB42 move.w #1,$813074
        ctx.soundPost?.(P.moveSound);                         // $25FB4A jsr $28C6FA
      }
    } else if ((d0 & 0x0002) !== 0 && ram.u16(P.modeAt) !== 0) { // $25FB54 btst #1,D0
      ram.setU16(P.modeAt, 0);                                // $25FB66 move.w #0,$813074
      ctx.soundPost?.(P.moveSound);                           // $25FB6E jsr $28C6FA
    }

    selectedMode25FC14(ram, rom, ctx.tx);                     // $25FB74 bsr $25FC14
    if ((ram.u16(P.inputAt) & 0x0070) === 0) return;          // $25FB78..$25FB82
    ram.setU16(P.requestedAt, 1);                             // $25FB86 move.w #1,$813006
  }

  if (ram.u16(P.confirmAt) === 0) {                           // $25FB8E tst.w $813076
    ram.setU16(P.modeOut, ram.u16(P.modeAt));                 // $25FB98 move.w -> $80393A
    ctx.soundPost?.(P.confirmSound);                          // $25FBA2 jsr $28C6E0
    ram.setU16(P.confirmAt, P.confirmFrames);                 // $25FBA8 move.w #$20
  }

  const left = u16(ram.u16(P.confirmAt) - 1);                 // $25FBB0 subq.w #1,$813076
  ram.setU16(P.confirmAt, left);
  if (left === 0) {
    ram.setU16(P.doneAt, 1);                                  // $25FBD2 move.w #1,$813078
    const c = P.clear;
    txPrint240EBC(ram, c.d0, c.d1, c.d2, c.d3);              // $25FBE6 jsr $240EBC
    return;
  }

  selectionLabels25FBF2(ctx.tx, rom);                         // $25FBBA bsr $25FBF2
  if ((ram.u8(P.confirmByteAt) & 0x02) === 0) {               // $25FBBE btst #1,$813077
    selectedMode25FC14(ram, rom, ctx.tx);                     // $25FBCA bsr $25FC14
  }
}

/** `$25D560` -- THE STATE-7 HANDLER, shared by object-dispatch slots [17] and [9]. Seven hundred
 *  and thirty-two bytes, one `rts`, and the routine that finally gives the already-ported
 *  `draw25E4D0` a caller.
 *
 *  **THE RENDEZVOUS.** `$25D588 cmpi.b #$7,($1,A0)` reads the OTHER RECORD's state byte -- immediate
 *  `$0007` before displacement `$0001`, the same operand order that turned this slot's four "flags"
 *  into one state machine -- and `$25D58E bne.w $25D800` jumps STRAIGHT INTO THE DRAW TAIL. So on
 *  every frame where the other side has not reached 7 the entire body is skipped: the frame counter
 *  does not advance, no ramp moves, no latch is set, and the screen still draws off the values the
 *  last frame left behind. That is the two-player wait, and modelling it as a bare `return` puts
 *  the whole screen on black until both sides arrive.
 *
 *  **`$25D748` FALLS THROUGH.** `move.b #$8,($1,A6)` and `move.b #$8,($1,A0)` are followed by
 *  `$25D754`, not by an `rts`, so state 8 is VISIBLE TO THE DRAWS ON THAT SAME FRAME. `draw25E824`
 *  gates its blocks E/D/C on `cmpi.b #$4`/`#$7`, so those three go dark on the final frame -- which
 *  is the observable difference between this and "advance the state and return".
 *
 *  **AND IT WRITES THE OTHER RECORD'S STATE TOO**, at `$25D74E`, before the dispatcher's walk has
 *  reached that record. The partner therefore never runs state 7 again.
 *
 *  **D0 IS LIVE ACROSS THE WHOLE ROUTINE.** `$25D7FA asr.w #1,D0` reads whatever the last write to
 *  D0 left there, and on two paths -- the `beq` at `$25D6FC` and the finished-already jump at
 *  `$25D6EC` -- that write is not in this routine at all. It is tracked here rather than assumed,
 *  and a use of a value some unported callee last touched files a note instead of inventing one.
 *
 *  @param draws the seven `draw25*` functions, by name. See `drawTail25D800`.
 */
export function phase7_25D560(ram, rom, ctx, a5, a6, d7, draws = ctx?.selectDraws) {
  const H = HANDLER7;
  state7Head25F530(ram, rom, ctx, d7);                          // $25D560 jsr $25F530

  // D0, all thirty-two bits of it: $25D71C writes a LONG into it and `move.w` leaves the high half
  // standing. `d0Site` is where the value came from, or 0 for a value inherited from outside this
  // translated routine. `$25F530` preserves D0-D7/A0-A6 through matching full-register movems.
  let d0 = 0;
  let d0Site = 0;
  const setD0W = (v, site) => { d0 = (((d0 & 0xffff0000) | (v & 0xffff)) >>> 0); d0Site = site; };
  const setD0L = (v, site) => { d0 = v >>> 0; d0Site = site; };

  // $25D566 tst.w D7 / beq.s $25D570. `tst.w` reads the LOW WORD only, the same as $25D4E4's.
  // D7 != 0 is record 0, whose partner is at +$70; D7 == 0 is record 1, whose partner is at -$70.
  const a0 = u16(d7) !== 0 ? a6 + H.otherRec : a6 - H.otherRec;

  // $25D574 tst.w $813098 / bne.w $25D5A0. A non-zero loop counter skips $25FAA4 and BOTH pair
  // gates and lands ON the announce, which is therefore UNLATCHED on that path.
  let announce = false;
  if (ram.u16(H.loopCounter) !== 0) {
    announce = true;
  } else {
    perFrame25FAA4(ram, rom, ctx);                            // $25D57E jsr $25FAA4
    // `$25FAA4` opens/closes with matching full-register movems, so D0 and its provenance survive.
    if (ram.u8(a0 + H.liveAt) !== 0) {                       // $25D584 tst.b (A0) / beq.s $25D5B0
      // $25D588 cmpi.b #$7,($1,A0) / $25D58E bne.w $25D800 -- THE RENDEZVOUS.
      if (ram.u8(a0 + H.rendezvousAt) !== H.rendezvous) {
        drawTail25D800(ram, rom, ctx, a5, a6, d7, draws);
        return;
      }
      if (ram.u16(a6 + H.announceLatch) === 0) {             // $25D592 tst.w ($5E,A6)
        ram.setU16(a6 + H.announceLatch, 1);                 // $25D59A -- once only, per record
        announce = true;
      }
    }
  }

  if (announce) {
    // $25D5A0 bsr.w $25D4E4 -> D0 = this record's side, then $25D5A4 addq.w #1 / $25D5A6 andi.w #$1
    // INVERT it. The announcement is deliberately posted for the OPPOSITE side, exactly as
    // $25D550 does in state 6's tail.
    setD0W(sideFromD7_25D4E4(d7), 0x25d4e4);
    setD0W(u16(d0 + 1) & 1, 0x25d5a6);
    // $25D5AA jsr $260A9A. rank.js's announcePost owns this site as { state: $4, guard: true }, and
    // $25D528's identical `bsr $25D4E4 / jsr $260A9A` pair is already routed through it by
    // phase6_25D4F0 above. Same site, same D0 convention, so it is called rather than noted.
    announcePost(ram, H.announce, u16(d0));
    d0Site = 0;                                              // ...and $260A9A is free to clobber D0
  }

  if (ram.u16(H.soundLatch) === 0) {                         // $25D5B0 tst.w $812F82
    ram.setU16(H.soundLatch, 1);                             // $25D5BA -- once per SCREEN, not rec
    ctx.soundPost?.(H.sound);                                // $25D5C2 jsr $28CB9C (index 11, gp 1)
    d0Site = 0;
  }

  // $25D5C8 addq.w #1,($32,A6) -- THE FRAME COUNTER. Every gate below reads it.
  const frame = u16(ram.u16(a6 + H.frameAt) + 1);
  ram.setU16(a6 + H.frameAt, frame);

  // $25D5CC / $25D5E2 -- two ACCELERATING ramps: the delta word grows every frame and is then
  // added. `bcc` is an UNSIGNED >=, so the ceiling stops them dead rather than clamping.
  for (const r of [H.rampA, H.rampB]) {
    if (ram.u16(a6 + r.at) >= r.ceil) continue;              // $25D5CC / $25D5E2 cmpi.w / bcc.s
    ram.setU16(a6 + r.deltaAt, u16(ram.u16(a6 + r.deltaAt) + r.deltaStep));   // $25D5D4 / $25D5EC
    setD0W(ram.u16(a6 + r.deltaAt), 0x25d5da);               // $25D5DA / $25D5F0 move.w (dn,A6),D0
    ram.setU16(a6 + r.at, u16(ram.u16(a6 + r.at) + u16(d0)));                // $25D5DE / $25D5F4
  }
  if (ram.u16(a6 + H.rampC.at) < H.rampC.ceil) {             // $25D5F6 cmpi.w #$7000,($3E,A6)
    ram.setU16(a6 + H.rampC.at, u16(ram.u16(a6 + H.rampC.at) + H.rampC.step));    // $25D5FE
  }
  // $25D604 / $25D60C -- TWO compares, one arm: ($48,A6) grows only while ($40,A6) is still under
  // $14C0 and ($48,A6) itself is still under $3800. Either failing skips to $25D61A.
  if (ram.u16(a6 + H.rampD.openAt) < H.rampD.openBelow && ram.u16(a6 + H.rampD.at) < H.rampD.ceil) {
    ram.setU16(a6 + H.rampD.at, u16(ram.u16(a6 + H.rampD.at) + H.rampD.step));    // $25D614
  }
  // $25D61A cmpi.w #$300,($48,A6) / bcs.s $25D670 -- an UNSIGNED <, so this one opens FROM $300 up,
  // the mirror of every other gate here. $25D622 then caps ($46,A6) at $7000.
  if (ram.u16(a6 + H.rampE.openAt) >= H.rampE.openFrom && ram.u16(a6 + H.rampE.at) < H.rampE.ceil) {
    ram.setU16(a6 + H.rampE.at, u16(ram.u16(a6 + H.rampE.at) + H.rampE.step));    // $25D62A

    // $25D630 bset #$0,($A,A5) / bne.s $25D670 -- ONCE ONLY, and on the OBJECT record rather than
    // the per-player one, so the two records share the single firing. State 0 clears ($A,A5).
    if (ram.bset8(a5 + H.palOnceAt, 0) === 0) {
      // $25D638 move.l A0,-(A7) exists ONLY because $25D63A's lea clobbers A0; $24150A itself
      // restores it. $25D66E movea.l (A7)+,A0 puts the other record's pointer back.
      if (ctx.palette) {
        install24150A(ram, ctx.palette, H.palBank, rom.bytes(H.palSrc, H.palBytes),
          0x25d642, `${hex7(H.addr)} state-7 palette, slot ${hex7(H.palBank)}`);
      } else {
        ctx.unported?.note(0x24150a, `$24150A bank ${H.palBank} <- ${hex7(H.palSrc)} from `
          + `${hex7(0x25d642)} with no PaletteState on this chain`);
      }
      // $25D648 moveq #0,D0/D1/D2/D3/D4 then FOUR byte loads off A5 -- the per-side pair array
      // state 0 seeds, read as ($8,A5)/($4,A5) for one side and ($9,A5)/($5,A5) for the other.
      setD0L(ram.u8(a5 + 0x08), 0x25d652);                   // $25D648 moveq / $25D652 move.b
      const d1 = ram.u8(a5 + 0x04);                          // $25D656
      const d2 = ram.u8(a5 + 0x09);                          // $25D65A
      const d3 = ram.u8(a5 + 0x05);                          // $25D65E -- and D4 stays 0
      // $25D662 jsr $26070C -- D0..D3 are ($8,A5)/($4,A5)/($9,A5)/($5,A5), i.e. P1's (style, ship)
      // then P2's, and D4 is still the moveq #0 from $25D650. $26070C crosses D1 and D2 on the way
      // to $25D990; see HANDOFF_26070C.
      // ...and A5 goes with them: `$26059E bsr.w $25FF7A`, four frames further down this chain,
      // runs bonus lines through whatever A5 the 68000 still holds, and that is THIS record.
      handoff26070C(ram, rom, ctx, u16(d0), d1, d2, d3, 0, undefined, a5);
      // $25D668 jsr $25F456 -- takes NOTHING from here. It re-reads ($4,A5)/($5,A5) itself.
      playerRecords25F456(ram, rom, a5);
      // ...and `d0Site` is deliberately NOT cleared: BOTH callees are `movem.l d0-d7/a0-a6` at
      // entry and the matching restore at exit ($25F456/$25F52A and $26070C/$260782), so D0 comes
      // back out of them holding the ($8,A5) that $25D652 put there.
    }
  }

  // $25D670 -- the FLASH. While ($42,A6) is counting it holds ($44,A6) at $40, and the frame the
  // count reaches zero it clears the hold. `subq / bne` skips the clear on every frame but the last.
  if (ram.u16(a6 + H.flashAt) !== 0) {                       // $25D670 tst.w ($42,A6)
    ram.setU16(a6 + H.flashHoldAt, H.flashHold);             // $25D676 move.w #$40,($44,A6)
    const left = u16(ram.u16(a6 + H.flashAt) - 1);           // $25D67C subq.w #1,($42,A6)
    ram.setU16(a6 + H.flashAt, left);
    if (left === 0) ram.setU16(a6 + H.flashHoldAt, 0);       // $25D680 bne.s / $25D682 clr.w
  }
  // $25D686 -- the FUSE. `subi.w #$26` then `beq` OR a BORROW both land on $25D696, so hitting zero
  // and undershooting zero are one arm: reload the flash with 3 and clear the fuse.
  if (ram.u16(a6 + H.fuseAt) !== 0) {                        // $25D686 tst.w ($40,A6)
    const res = ram.u16(a6 + H.fuseAt) - H.fuseStep;         // $25D68C subi.w #$26,($40,A6)
    ram.setU16(a6 + H.fuseAt, u16(res));
    if (res <= 0) {                                          // $25D692 beq.s / $25D694 bcc.s
      ram.setU16(a6 + H.flashAt, H.flashReload);             // $25D696 move.w #$3,($42,A6)
      ram.setU16(a6 + H.fuseAt, 0);                          // $25D69C clr.w ($40,A6)
    }
  }

  // -----------------------------------------------------------------------------------------
  // $25D6A0 -- THE SLIDE BLOCK, frame >= $F0 ONLY. `bcs.w $25D754` is an unsigned <.
  // -----------------------------------------------------------------------------------------
  if (frame >= H.gateSlide) {
    ram.setU8(a6 + H.slideFlagAt, H.slideFlag);              // $25D6AA move.b #$1,($35,A6) -- BYTE

    let toStateEight = false;
    let finished = false;
    if (ram.u16(a6 + H.speedAt) < H.speedCap) {              // $25D6B0 cmpi.w #$80,($4C,A6)
      if (ram.u16(a6 + H.travelAt) >= H.travelCap) {         // $25D6B8 cmpi.w #$1800,($4A,A6)
        finished = true;                                     //   ...-> $25D6E6
      } else {
        // ACCELERATE: the speed word grows by one a frame and is then added to the travel.
        ram.setU16(a6 + H.speedAt, u16(ram.u16(a6 + H.speedAt) + 1));            // $25D6C0 addq.w
        setD0W(ram.u16(a6 + H.speedAt), 0x25d6c4);                               // $25D6C4
        ram.setU16(a6 + H.travelAt, u16(ram.u16(a6 + H.travelAt) + u16(d0)));    // $25D6C8
      }                                                      // $25D6CC bra.w $25D754
    } else if (ram.u16(a6 + H.travelAt) >= H.travelCap) {    // $25D6D0 cmpi.w #$1800,($4A,A6)
      finished = true;                                       //   ...-> $25D6E6
    } else {
      // CRUISE: the speed word is capped at $80, so the travel grows by a constant.
      setD0W(ram.u16(a6 + H.speedAt), 0x25d6da);             // $25D6DA
      ram.setU16(a6 + H.travelAt, u16(ram.u16(a6 + H.travelAt) + u16(d0)));      // $25D6DE
    }                                                        // $25D6E2 bra.w $25D754

    if (finished) {
      if (ram.u16(a6 + H.doneAt) !== 0) {                    // $25D6E6 tst.w ($5A,A6)
        toStateEight = true;                                 // $25D6EC bne.w $25D748
      } else {
        ram.setU16(a6 + H.emitGateAt, 1);                    // $25D6EE -- gates draw25E4D0's emit 2
        if (ram.u16(a6 + H.speedAt) !== 0) {                 // $25D6F4 cmpi.w #$0,($4C,A6)
          setD0W(ram.u16(a6 + H.speedAt), 0x25d6fe);         // $25D6FE
          ram.setU16(a6 + H.travelAt, u16(ram.u16(a6 + H.travelAt) + u16(d0)));  // $25D702
          // $25D706 subq.w #2,($4C,A6): DECELERATE by two. `beq` and a BORROW are again one arm --
          // a speed of 1 wraps to $FFFF and is caught by the fall-through, not by the bcc.
          const left = ram.u16(a6 + H.speedAt) - H.speedDecel;
          ram.setU16(a6 + H.speedAt, u16(left));
          if (left <= 0) {                                   // $25D70A beq.w / $25D70E bcc.w
            ram.setU16(a6 + H.speedAt, 0);                   // $25D712 clr.w ($4C,A6)
            ram.setU16(a6 + H.doneAt, 1);                    // $25D716 -- the done latch
            setD0L(ram.u32(a6 + H.anchorAt), 0x25d71c);      // $25D71C move.l ($56,A6),D0
            let d1 = ram.u32(a0 + H.anchorAt);               // $25D720 move.l ($56,A0),D1
            // $25D724 tst.w D7 / bne.w $25D72C -- the exg happens ONLY for record 1, so after it
            // D0 is ALWAYS record 0's anchor and D1 ALWAYS record 1's, whichever record is running.
            if (u16(d7) === 0) { const t = d0; setD0L(d1, 0x25d72a); d1 = t; }   // $25D72A exg
            if (ram.u16(H.pairLatch) === 0) {                // $25D72C tst.w $812F80
              ram.setU16(H.pairLatch, 1);                    // $25D736 -- cleared per screen
              // W385: A CALL NOW, NOT A NOTE. `$25D73E jsr $2603FE` is THE site that fires on a
              // cold boot -- `rank.js`'s other caller `$260558` is gated on `$813080` and stays
              // shut -- and it is what arms bonus-line request 4 for the joined side, which is
              // what finally creates the player object. See `rank.js stagePair2603FE`.
              //
              // D0 and D1 are the two records' `($56)` anchors, already crossed by `$25D72A` so
              // that D0 is ALWAYS record 0's whichever record is running. `$2603FE`'s two
              // `tst.l`/`bmi.w` pairs are what make an absent side's `$FFFFFFFF` a skip, so the
              // sentinel is handed over rather than filtered out here.
              stagePair2603FE(ram, rom, ctx, d0, d1);        // $25D73E jsr $2603FE
              // `$2603FE` is `movem.l d0-d7/a0-a6` at entry and `$2604A4` at exit, so D0 comes
              // back exactly as it went in; `d0Site` is cleared for the reason it always was --
              // the value `$25D7FA` may read was last written at `$25D71C`, in this routine.
              d0Site = 0;
            }
          }
        }
      }
    }

    if (toStateEight) {
      // $25D748 / $25D74E -- BOTH records to state 8, and then it FALLS THROUGH to $25D754 and on
      // into the draws. State 8 is on the bytes while this frame's sprites are built.
      ram.setU8(a6 + SCREEN17.phaseAt, H.nextPhase);         // $25D748 move.b #$8,($1,A6)
      ram.setU8(a0 + SCREEN17.phaseAt, H.nextPhase);         // $25D74E move.b #$8,($1,A0)
    }
  }

  // $25D754 -- the TILT, frame >= $AA. It clears ($64,A6) every frame it runs, then walks ($62,A6)
  // up to $2600 in steps of $80 and CLAMPS. $25D774's blt is SIGNED where $25D754's bcs is not.
  if (frame >= H.gateRamp) {
    ram.setU16(a6 + H.tiltClearAt, 0);                       // $25D75E move.w #$0,($64,A6)
    if (ram.u16(a6 + H.tiltAt) !== H.tiltCap) {              // $25D764 cmpi.w #$2600 / beq.w
      ram.setU16(a6 + H.tiltAt, u16(ram.u16(a6 + H.tiltAt) + H.tiltStep));       // $25D76E addi.w
      if (i16(ram.u16(a6 + H.tiltAt)) >= i16(H.tiltCap)) {   // $25D774 cmpi.w / $25D77C blt.w
        ram.setU16(a6 + H.tiltAt, H.tiltCap);                // $25D77E -- the clamp
      }
    }
  }

  // $25D784 -- THE ZOOM CURSOR, frame >= 1, i.e. every frame the body runs at all.
  if (frame >= H.gateZoom) {
    let step = true;
    if (ram.u16(a6 + H.delayAt) !== 0) {                     // $25D78E tst.w ($6C,A6)
      const left = u16(ram.u16(a6 + H.delayAt) - 1);         // $25D796 subq.w #1,($6C,A6)
      ram.setU16(a6 + H.delayAt, left);
      if (left !== 0) step = false;                          // $25D79A bne.w $25D7BA
    }
    if (step) {
      // $25D79E subq.b #1,($6A,A6) -- a BYTE, and $25D7A2 bcc.w gates on the BORROW, so the step
      // fires when the tick goes BELOW zero and not when it reaches it. $25C922's `move.w #$2` is
      // one word over TWO byte fields, leaving ($6A) = 0 and ($6B) = 2: the first step is therefore
      // immediate, and the reload of 2 gives 2 -> 1 -> 0 -> borrow, a THREE-frame period.
      const tick = ram.u8(a6 + H.tickAt) - 1;
      ram.setU8(a6 + H.tickAt, tick & 0xff);
      if (tick < 0) {
        ram.setU8(a6 + H.tickAt, ram.u8(a6 + H.reloadAt));   // $25D7A6 move.b ($6B,A6),($6A,A6)
        if (ram.u16(a6 + H.cursorAt) !== H.cursorCap) {      // $25D7AC cmpi.w #$3C,($60,A6)
          ram.setU16(a6 + H.cursorAt, u16(ram.u16(a6 + H.cursorAt) + H.cursorStep));   // $25D7B6
        }
      }
    }
  }

  // $25D7BA -- THE $25D85C WALK, frame >= $F0 again. Same threshold as the slide block, tested a
  // second time because the slide block's three arms all branch here rather than falling through.
  if (frame >= H.gateSlide) {
    if (ram.u16(a6 + H.stepIntoAt) < H.stepCeil) {           // $25D7C4 cmpi.w #$3800,($4E,A6)
      // $25D7CE lea ($25D85C,PC),A1 -- extension word at $25D7D0 plus $8C. $25D7D2 is a nop.
      const d1 = ram.u16(a6 + H.stepCursorAt);               // $25D7D4 move.w ($52,A6),D1
      ram.setU16(a6 + H.stepCursorAt, u16(d1 + 2));          // $25D7D8 addq.w #2,($52,A6)
      if (i16(d1) < 0 || d1 > H.stepBytes - 2) {
        // The bound is stated by CODE: $25D7E0's sentinel test parks the cursor, so nothing in the
        // cartridge can walk past $25D950. A cursor outside the declared window reads no ROM.
        ctx.unported?.note(0x25d7dc, `${hex7(0x25d7dc)} -- ($52,A6) = ${hex7(d1)} indexes the step `
          + `table ${hex7(H.stepTable)}..${hex7(H.stepTable + H.stepBytes - 1)} outside the `
          + `${H.stepEntries} entries and the ${hex7(H.stepSentinel)} sentinel $25D7E0 bounds it `
          + 'to. No ROM is read for that cursor');
      } else {
        setD0W(rom.u16(H.stepTable + d1), 0x25d7dc);         // $25D7DC move.w (0,A1,D1.w),D0
        if (u16(d0) === H.stepSentinel) {                    // $25D7E0 cmpi.w #$FFFF,D0
          // IT SATURATES. The cursor is put back where it was, so every later frame re-reads the
          // last real entry at D1 - 2 and the accumulator keeps climbing at a constant rate.
          ram.setU16(a6 + H.stepCursorAt, d1);               // $25D7E6 subq.w #2,($52,A6)
          setD0W(rom.u16(H.stepTable + d1 - 2), 0x25d7ea);   // $25D7EA move.w (-2,A1,D1.w),D0
        }
        ram.setU16(a6 + H.stepIntoAt, u16(ram.u16(a6 + H.stepIntoAt) + u16(d0)));     // $25D7EE
      }
    }
    if (ram.u16(a6 + H.halfIntoAt) < H.halfCeil) {           // $25D7F2 cmpi.w #$1C00,($50,A6)
      if (d0Site === 0) {
        // $25D7FA reads D0 with NO write of its own. Reached through $25D7CC's bcc -- i.e. once
        // ($4E,A6) has topped out -- the value is whatever the last write anywhere above left, and
        // on the $25D6FC and $25D6EC paths that is an unported callee's leavings.
        ctx.unported?.note(0x25d7fa, `${hex7(0x25d7fa)} asr.w #1,D0 -- D0 is INHERITED here, not `
          + 'set: this path skipped $25D7DC and the last writer was a callee this port has not '
          + `read. ($50,A6) is advanced by the tracked value ${hex7(u16(d0))} rather than by an `
          + 'invented one');
      }
      setD0W(i16(u16(d0)) >> 1, 0x25d7fa);                   // $25D7FA asr.w #1,D0 -- ARITHMETIC
      ram.setU16(a6 + H.halfIntoAt, u16(ram.u16(a6 + H.halfIntoAt) + u16(d0)));       // $25D7FC
    }
  }

  drawTail25D800(ram, rom, ctx, a5, a6, d7, draws);          // $25D800..$25D83A rts
}
