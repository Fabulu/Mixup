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

import { u16 } from './ram.js';
import { install24150A, install2414BE, paletteSet241688 } from './palette.js';
import { clearTx23C622, txString25A14C } from './background.js';
import { announcePost } from './rank.js';
import { stageCreate, queueKill } from './objalloc.js';

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

/** `$25CC46` -- STATE 0. Clears both records, seeds whichever sides are live, installs fifteen
 *  palettes and stages the next screen. */
function state0(ram, rom, a5, ctx) {
  ram.setU8(a5 + SCREEN17.state, 1);                         // $25CC46
  ctx.unported?.note(SCREEN17.opener, '$25CC4C jsr $25F442 -- slot [17] state 0 opener, unread');
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
  queueKill(ram, ram.u16(a5 + 0x00));                        // $25CEB0 JMP $241292
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
      if (phase === 0x06) {
        phase6_25D4F0(ram, rom, ctx, a6, SCREEN17.recCount - 1 - r);
        continue;
      }
      if (phase === 0x05) {
        // The dbra counter runs 1 then 0, so `r` maps to D7 as (recCount - 1 - r).
        phase5_25D39C(ram, rom, ctx, a5, a6, SCREEN17.recCount - 1 - r, undefined);
        continue;
      }
      ctx.unported?.note(SCREEN17.subHandlers[i],
        `$${SCREEN17.subHandlers[i].toString(16).toUpperCase()} -- slot [17]'s handler for state `
        + `${phase} on ($1,A6). Unread`);
      // $25CEE8 -- state 3's handler ADVANCES the byte, and because the compares run in sequence
      // the state-5 arm then fires in this same pass.
      if (phase === SCREEN17.phaseSeed) {
        ram.setU8(a6 + SCREEN17.phaseAt, SCREEN17.firstSetsPhase);
      }
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
 *  It picks a value from the four-word table at `$25D294` using `($5,A6)`, writes it into THIS
 *  SIDE's byte of the object's pair array, prints one string, and advances the record to state 6.
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
  if (ram.u16(HANDLER5.gate) !== 0) return;                  // $25D39C tst.w $813098 / bne $25D3C4
  const d0 = rom.u16(HANDLER5.table + u16(ram.u8(a6 + 0x05) << 1));   // $25D3A8/$25D3AC/$25D3B2
  // $25D3B6 tst.w D7 / beq $25D3C0 -- the caller's dbra counter IS the side select.
  ram.setU8(a5 + (d7 !== 0 ? 0x04 : 0x05), d0 & 0xff);       // $25D3BA / $25D3C0

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
  ctx.unported?.note(HANDLER6.labels, '$25D4F2/$25D4FA jsr $25F2D0 with D0 = 0 then 1 -- the '
    + 'two-line per-side label printer. It prints through $25A14C twice, advancing A0 by $10 and '
    + 'D1 by -1 between them, from a descriptor at $25F43E. Head unread, so it is noted');

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
