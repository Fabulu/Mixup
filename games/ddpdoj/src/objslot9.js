// OBJECT DISPATCH [9], `$25CACA` -- slot [17]'s TWIN, and the fuller version of it. W373.
//
// It walks the SAME two `$70` records at `$812EA0` with the same `moveq #$1,D7` `dbra`, and runs the
// same state machine on `($1,A6)`. The difference is coverage: slot [17] handles 3, 5, 6, 7 and slot
// [9] handles EIGHT states, adding 4, 0, 1 and 2.
//
//     3 -> $25D306      7 -> $25D560      1 -> $25D1DA
//     4 -> $25D402      0 -> $25D010      2 -> $25D164
//     5 -> $25D39C
//     6 -> $25D4F0
//
// FOUR OF THE EIGHT ARE ALREADY PORTED, in `objslot17.js`, because they are literally the same
// routines: `phase3_25D306`, `phase5_25D39C`, `phase6_25D4F0`. Reading this slot is also what
// exposed slot [17]'s inner dispatch as a state machine rather than four flags -- two callers
// disagreeing about one byte is what made the operand order visible.
//
// **AND IT IS WHY `$25D306` SETS STATE 4.** Slot [17] overwrites that with 5 the instant the handler
// returns, because it has no state-4 arm. Slot [9] has one and lets it stand. The same routine
// therefore advances the two screens to two different states, which is only sane once both callers
// are in front of you.

import { u16 } from './ram.js';
import { paletteSet241688, install24150A } from './palette.js';
import { txString25A14C } from './background.js';
import { readInput23D186 } from './tallyscreen.js';
import { queueKill } from './objalloc.js';
import {
  SCREEN17, phase3_25D306, phase5_25D39C, phase6_25D4F0, sideFromD7_25D4E4, DESC17,
} from './objslot17.js';

export const SCREEN9 = Object.freeze({
  entry: 0x25caca, start: 0x25c8a2, dispatch: 0x240f62,
  state: 0x02, busy: 0x03,
  // The state values in the order the cartridge compares them, which is NOT ascending.
  states: Object.freeze([0x03, 0x04, 0x05, 0x06, 0x07, 0x00, 0x01, 0x02]),
  handlers: Object.freeze([0x25d306, 0x25d402, 0x25d39c, 0x25d4f0, 0x25d560,
    0x25d010, 0x25d1da, 0x25d164]),
  // $25CB5E cmpi.b #$7,($1,A6) / bcc -- an UNSIGNED >= test, so states 7 and above skip the tail.
  tailLimit: 0x07, tailCount: 0x31, tailReload: 0x02, tailFlag: 0x2e, tailSet: 0x30,
  after: 0x25cb94,
});

/** `$25CACA` -- THE DISPATCH ENTRY. State 1 is the fall-through and is the record walk. */
export function objSlot9(ram, rom, a5, ctx) {
  const st = ram.u8(a5 + SCREEN9.state);
  if (st === 0) {                                            // $25CACA tst.b / beq $25C8A2
    ctx.unported?.note(SCREEN9.start, '$25C8A2 -- slot [9] state 0, roughly 550 bytes and unread. '
      + 'It is the counterpart of slot [17] state 0, which seeds the same $812EA0 records');
    return;
  }
  if (st === 2) {                                            // $25CAD2 cmpi.b #$2 / beq $25CAC2
    queueKill(ram, ram.u16(a5 + 0x00));                      // $25CAC2 JMP $241292 -- one instruction
    return;
  }

  ram.setU8(a5 + SCREEN9.busy, 0);                           // $25CADA clr.b ($3,A5)
  for (let r = 0; r < SCREEN17.recCount; r++) {              // $25CAE4 moveq #$1,D7 + dbra = TWO
    const a6 = SCREEN17.recs + r * SCREEN17.recStride;
    if (ram.u8(a6) === 0) continue;                          // $25CAE6 tst.b (A6) / beq $25CB94
    const d7 = SCREEN17.recCount - 1 - r;                    // dbra counts DOWN
    // Eight compares against ONE byte, run in SEQUENCE. A handler that advances the state lets the
    // next arm fire in the same pass, exactly as in slot [17].
    for (const [i, phase] of SCREEN9.states.entries()) {
      if (ram.u8(a6 + SCREEN17.phaseAt) !== phase) continue;
      switch (phase) {
        case 0x03:
          phase3_25D306(ram, rom, ctx, a5, a6, d7);          // $25CAF4 -- leaves state 4 STANDING
          break;
        case 0x05:
          phase5_25D39C(ram, rom, ctx, a5, a6, d7, DESC17.base[sideFromD7_25D4E4(d7)]);
          break;
        case 0x06:
          phase6_25D4F0(ram, rom, ctx, a6, d7);              // $25CB1E
          break;
        case 0x04:
          phase4_25D402(ram, rom, ctx, a5, a6, d7);          // $25CB02
          break;
        case 0x00:
          phase0_25D010(ram, rom, ctx, a6, d7);              // $25CB3A
          break;
        case 0x01:
          phase1_25D1DA(ram, rom, ctx, a5, a6, d7);          // $25CB48
          break;
        case 0x02:
          phase2_25D164(ram, rom, ctx, a5, a6, d7,           // $25CB58
            DESC17.base[sideFromD7_25D4E4(d7)]);
          break;
        default:
          ctx.unported?.note(SCREEN9.handlers[i], `$${SCREEN9.handlers[i].toString(16).toUpperCase()
            } -- slot [9]'s handler for state ${phase} on ($1,A6). Unread`);
      }
    }

    // $25CB5E cmpi.b #$7,($1,A6) / bcc -- UNSIGNED, so 7 and anything above skip this entirely.
    if (ram.u8(a6 + SCREEN17.phaseAt) >= SCREEN9.tailLimit) continue;
    const left = (ram.u8(a6 + SCREEN9.tailCount) - 1) & 0xff;   // $25CB66 subq.b #1,($31,A6)
    ram.setU8(a6 + SCREEN9.tailCount, left);
    if (left !== 0) continue;                                // $25CB6A bne
    ram.setU8(a6 + SCREEN9.tailCount, SCREEN9.tailReload);   // $25CB6C -- reload TWO
    if (ram.u8(a6 + SCREEN9.tailFlag) === 0) {               // $25CB72 tst.b ($2E,A6) / bne
      ram.setU8(a6 + SCREEN9.tailSet, 1);                    // $25CB78 move.b #$1,($30,A6)
    } else {
      // $25CB80 -- the other arm counts ($2E,A6) DOWN and mirrors the byte into ($2F,A6).
      const d1 = ram.u8(a6 + 0x2f);                          // $25CB82 move.b ($2F,A6),D1
      if (d1 < 1) {                                          // $25CB86 cmp.b D0,D1 with D0 = 1 / bcc
        ram.setU8(a6 + SCREEN9.tailFlag,
          (ram.u8(a6 + SCREEN9.tailFlag) - 1) & 0xff);       // $25CB8A subq.b #1,($2E,A6)
      }
      ram.setU8(a6 + 0x2f, 1);                               // $25CB8E move.b D1,($2F,A6) with D1 = 1
    }
  }

  ctx.unported?.note(SCREEN9.after, '$25CB94 -- slot [9] continues past the record walk: it reads '
    + '$23D16C, tests bit $F, then checks record 1 and calls $23C98E. Unread');
}

export const HANDLER2 = Object.freeze({
  addr: 0x25d164, table: 0x25cf60, entries: 2,
  string: 0x25d1ca, nextPhase: 0x03, col: 0x08, shift: 9, bias: 8,
});

/** `$25D164` -- SLOT [9]'s STATE-2 HANDLER, and it CLOSES THE LOOP: it sets `($1,A6)` back to 3.
 *
 *  So a record cycles 3 -> 4 -> ... -> 2 -> 3 rather than running to an end. Slot [17], which has no
 *  state-2 arm, cannot cycle -- another way the two screens differ while sharing the machine.
 *
 *  It is `$25D39C`'s shape with three things moved: the index is `($3,A6)` not `($5,A6)`, the table
 *  is `$25CF60` (TWO entries, bounded by a descriptor at `$25CF64`), and it writes the THIRD slot
 *  byte `($8,A5)`/`($9,A5)` rather than the first. The side select is the same `tst.w D7`.
 *
 *  Because it lands on `($8,A5)`/`($9,A5)` it completes the picture of the six per-side bytes: `$4`
 *  and `$5` from `$25D39C`, `$6` and `$7` from `$25D306`, `$8` and `$9` from here. Three pairs, one
 *  handler each, and every one of them selects by D7.
 */
export function phase2_25D164(ram, rom, ctx, a5, a6, d7, a4) {
  const d0 = rom.u16(HANDLER2.table + u16(ram.u8(a6 + 0x03) << 1));   // $25D166/$25D16A/$25D170
  ram.setU8(a5 + (u16(d7) !== 0 ? 0x08 : 0x09), d0 & 0xff);  // $25D174 tst.w D7 / $25D178 / $25D17E

  // $25D182 -- D0 is rebuilt as the SIDE INDEX here, the same 0/1 $25D4E4 produces, and handed to
  // $241688 together with ($2,A6) as D1.
  const side = sideFromD7_25D4E4(d7);                        // $25D184 tst.w D7 / bne / $25D188
  if (ctx.palette) {
    paletteSet241688(ram, ctx.palette, rom, side, ram.u16(a6 + 0x02));   // $25D18A / $25D18E
  } else {
    ctx.unported?.note(0x241688, `$25D18E jsr $241688 with D0=${side} -- no PaletteState here`);
  }

  const src = a4 === undefined ? 0 : rom.u16(a4 + 0x0a);     // $25D194 move.w ($A,A4),D1
  const row = u16((src >>> HANDLER2.shift) + HANDLER2.bias); // $25D198 lsr #6 / $25D19A lsr #3
  txString25A14C(ctx.tx, rom, HANDLER2.col, row, 0, HANDLER2.string);   // $25D1AC jsr $25A14C
  ram.setU8(a6 + SCREEN17.phaseAt, HANDLER2.nextPhase);      // $25D1B2 -- back to THREE
}

export const HANDLER4 = Object.freeze({
  addr: 0x25d402, options: 3, nextPhase: 0x05,
  bitPrev: 0x02, bitNext: 0x03, confirmMask: 0x70,
  moveSound: 0x28c6fa, confirmSound: 0x28c6e0,
  moved: 0x28, autoConfirm: 0x30, clearOnConfirm: 0x2e,
  sharedGuard: 0x03,                          // ($3,A5), bset here and cleared at the top of the walk
  drawsA: Object.freeze([0x25e220, 0x25e29e]),
  drawsB: Object.freeze([0x25e6ce]),
  drawsAlways: Object.freeze([0x25e824, 0x25edf8, 0x25ef30, 0x25f074]),
});

/** `$25D402` -- SLOT [9]'s STATE-4 HANDLER: THE CURSOR ITSELF, and the mutual exclusion in motion.
 *
 *  It reads input through the DESCRIPTOR's edge reader -- `movea.l ($6,A4),A0 / jsr (A0)` -- so the
 *  side's reader comes from the same `$25D29A`/`$25D2A8` records `$25D306` selects.
 *
 *  BIT 2 STEPS BACK AND BIT 3 STEPS FORWARD, each wrapping across THREE options, and each **loops
 *  again while the new value equals `(A3)`** -- the OTHER side's byte, which the head leas as
 *  `($7,A5)` for side 0 and `($6,A5)` for side 1. So the cursor SKIPS OVER whatever the other player
 *  is on rather than being blocked by it. Written as a plain `+1 mod 3` it would land on the other
 *  player's choice and stick there.
 *
 *  CONFIRM IS TWO CONDITIONS, NOT ONE. `($30,A6)` non-zero confirms outright; otherwise a button in
 *  the `$70` mask is required. `($30,A6)` is exactly what the dispatcher's `($31,A6)` countdown
 *  sets, so the record can also confirm ITSELF on a timer.
 *
 *  AND THE FIVE DRAW CALLS ARE GUARDED BY `bset` ON `($3,A5)`, the byte the walk clears each frame.
 *  The FIRST record to reach state 4 does the shared draws; the second sees the bit already set and
 *  skips them. Dropping the guard draws the shared parts twice per frame.
 */
export function phase4_25D402(ram, rom, ctx, a5, a6, d7) {
  const side = sideFromD7_25D4E4(d7);
  const a4 = DESC17.base[side];                              // $25D406 / $25D410
  const a3 = a5 + (side === 0 ? 0x07 : 0x06);                // $25D40A / $25D414 -- the OTHER side
  const d0 = readInput23D186(ram, side);                     // $25D418 movea.l ($6,A4),A0 / jsr (A0)

  const step = (dir) => {
    ctx.soundPost?.(HANDLER4.moveSound);                     // $25D426 / $25D450
    ram.setU16(a6 + HANDLER4.moved, 1);                      // $25D42C / $25D456
    let d1 = ram.u16(a6 + 0x04);                             // $25D432 / $25D45C
    for (let guard = 0; guard <= HANDLER4.options; guard++) {
      d1 = u16(d1 + dir);
      if (dir < 0 && (d1 & 0x8000) !== 0) d1 = HANDLER4.options - 1;   // $25D438 bpl / $25D43C
      if (dir > 0 && d1 > HANDLER4.options - 1) d1 = 0;                // $25D462 cmpi #$2 / ble
      // $25D440 / $25D46C cmp.b (A3),D1 / beq -- go round AGAIN on the other side's choice.
      if ((d1 & 0xff) !== ram.u8(a3)) break;
    }
    ram.setU16(a6 + 0x04, d1);                               // $25D444 / $25D470
  };

  if ((d0 & (1 << HANDLER4.bitPrev)) !== 0) step(-1);        // $25D41E btst #$2,D0
  if ((d0 & (1 << HANDLER4.bitNext)) !== 0) step(+1);        // $25D448 btst #$3,D0

  ram.setU8(a5 + (side === 0 ? 0x06 : 0x07),                 // $25D474 tst.w D7 / $25D478 / $25D480
    ram.u8(a6 + 0x05));

  confirmAndDraw(ram, ctx, a5, a6, d0, HANDLER4.nextPhase);   // $25D486..$25D4E2
}

/** `$25D486..$25D4E2` and `$25D23A..$25D292` -- THE SHARED CONFIRM-AND-DRAW TAIL. The two blocks are
 *  byte for byte the same apart from the state they write, so this is one routine assembled twice
 *  rather than two: state 1's tail advances to 2 and state 4's to 5.
 *
 *  CONFIRM IS TWO CONDITIONS. `($30,A6)` non-zero confirms outright; otherwise a button in the `$70`
 *  mask is needed. `($30,A6)` is what the dispatcher's `($31,A6)` countdown sets, so a record can
 *  confirm itself on a timer with no input at all.
 *
 *  THE DRAWS ARE GUARDED BY `bset` ON `($3,A5)`, the byte the walk clears every frame. `bset` returns
 *  the OLD bit, so the FIRST record to reach here does the gated draws and the second skips them.
 *  Drop the guard and the shared parts draw twice per frame.
 */
function confirmAndDraw(ram, ctx, a5, a6, d0, nextPhase) {
  if (ram.u8(a6 + HANDLER4.autoConfirm) === 0                // $25D23A / $25D486 tst.b ($30,A6)
      && (d0 & HANDLER4.confirmMask) === 0) return;          // $25D240 / $25D48C andi.w #$70
  ctx.soundPost?.(HANDLER4.confirmSound);                    // $25D248 / $25D494 jsr $28C6E0
  ram.setU8(a6 + SCREEN17.phaseAt, nextPhase);               // $25D24E / $25D49A
  if (nextPhase === HANDLER4.nextPhase) {
    ram.setU8(a6 + HANDLER4.clearOnConfirm, 0);              // $25D4A0 -- state 4's tail ONLY
  }

  const guard = ram.u8(a5 + HANDLER4.sharedGuard);           // $25D256 / $25D4A6 bset #$0,($3,A5)
  ram.setU8(a5 + HANDLER4.sharedGuard, guard | 0x03);
  if ((guard & 0x01) === 0) {
    for (const r of HANDLER4.drawsA) ctx.unported?.note(r, `$${r.toString(16).toUpperCase()} -- a `
      + `shared draw gated by bit 0 of ($3,A5). Unread`);
  }
  if ((guard & 0x02) === 0) {                                // $25D26A / $25D4BA bset #$1
    for (const r of HANDLER4.drawsB) ctx.unported?.note(r, `$${r.toString(16).toUpperCase()} -- `
      + `gated by bit 1 of ($3,A5). Unread`);
  }
  for (const r of HANDLER4.drawsAlways) {
    ctx.unported?.note(r, `$${r.toString(16).toUpperCase()} -- ungated draw. Unread`);
  }
}

export const HANDLER1 = Object.freeze({
  addr: 0x25d1da, options: 2, nextPhase: 0x02,
  desc: Object.freeze([0x25cf64, 0x25cf72]),   // the SECOND descriptor pair, not $25D29A's
  at: 0x02,
});

/** `$25D1DA` -- SLOT [9]'s STATE-1 HANDLER: A SECOND CURSOR, on `($2,A6)` and over TWO options.
 *
 *  Three things separate it from state 4's cursor, and none is cosmetic:
 *
 *   1. **IT USES THE OTHER DESCRIPTOR PAIR**, `$25CF64`/`$25CF72`, not `$25D29A`/`$25D2A8`. Same
 *      14-byte layout, different records, and its edge reader comes from `($6,A4)` of those.
 *   2. **IT HAS NO MUTUAL EXCLUSION.** There is no `(A3)` compare at all -- the two options are not
 *      contended, so the cursor just wraps.
 *   3. **THE SOUND IS CONDITIONAL.** It saves `($2,A6)` into D6 first and only posts `$28C6FA` when
 *      the value actually CHANGED. State 4 posts unconditionally. At the ends of a two-option wrap
 *      that difference is audible, which is presumably the point.
 */
export function phase1_25D1DA(ram, rom, ctx, a5, a6, d7) {
  const side = sideFromD7_25D4E4(d7);
  const a4 = HANDLER1.desc[side];                            // $25D1DA / $25D1E2 -- the SECOND pair
  void a4;
  const d0 = readInput23D186(ram, side);                     // $25D1E6 movea.l ($6,A4),A0 / jsr (A0)

  const step = (dir, wrapTo, limit) => {
    const before = ram.u16(a6 + HANDLER1.at);                // $25D1EC / $25D210 move.w ($2,A6),D6
    let v = u16(ram.u16(a6 + HANDLER1.at) + dir);
    if (dir < 0 && (v & 0x8000) !== 0) v = wrapTo;           // $25D1F6 subq / bge / $25D1FC
    if (dir > 0 && v > limit) v = wrapTo;                    // $25D21A addq / cmpi #$1 / ble / $25D226
    ram.setU16(a6 + HANDLER1.at, v);
    // $25D202 / $25D22C cmp.w ($2,A6),D6 / beq -- the sound is CONDITIONAL on a real change.
    if (v !== before) ctx.soundPost?.(HANDLER4.moveSound);
  };

  if ((d0 & (1 << HANDLER4.bitPrev)) !== 0) step(-1, HANDLER1.options - 1, HANDLER1.options - 1);
  if ((d0 & (1 << HANDLER4.bitNext)) !== 0) step(+1, 0, HANDLER1.options - 1);

  confirmAndDraw(ram, ctx, a5, a6, d0, HANDLER1.nextPhase);  // $25D23A..$25D292
}

export const HANDLER0 = Object.freeze({
  addr: 0x25d010, nextPhase: 0x01,
  desc: Object.freeze([0x25cf64, 0x25cf72]),
  // Per-side coordinates: side 0 gets $1A00/$E600 and side 1 $1E40/$5200.
  coord: Object.freeze([Object.freeze([0x1a00, 0xe600]), Object.freeze([0x1e40, 0x5200])]),
  d0At: 0x0e, d1At: Object.freeze([0x14, 0x1a, 0x20, 0x26]),
  pairs: Object.freeze([[0x0a, 0x0060], [0x0c, 0x0c00], [0x10, 0x0060], [0x12, 0x0c00],
    [0x2e, 0x0599], [0x40, 0x1ac0]]),
  countAt: 0x31, countValue: 0x02,
  clearBytes: Object.freeze([0x30, 0x34, 0x35]),
  clearWords: Object.freeze([0x36, 0x38, 0x3a, 0x3c, 0x3e,
    0x42, 0x44, 0x46, 0x48, 0x4a, 0x4c, 0x4e, 0x50, 0x52, 0x54]),
  palettes: Object.freeze([
    Object.freeze({ src: 0x223fb8, bank: 24 }), Object.freeze({ src: 0x223f78, bank: 25 }),
    Object.freeze({ src: 0x223f38, bank: 27 }), Object.freeze({ src: 0x223d38, bank: 26 }),
    Object.freeze({ src: 0x223d78, bank: 28 }), Object.freeze({ src: 0x223db8, bank: 29 }),
    Object.freeze({ src: 0x223df8, bank: 30 }), Object.freeze({ src: 0x223e38, bank: 12 }),
    Object.freeze({ src: 0x223e78, bank: 13 }), Object.freeze({ src: 0x223eb8, bank: 14 }),
    Object.freeze({ src: 0x223ef8, bank: 15 }),
  ]),
});

/** `$25D010` -- SLOT [9]'s RECORD STATE 0: arm a record and hand it to state 1.
 *
 *  THE ONLY PER-SIDE VALUE IS THE COORDINATE PAIR. Side 0 gets `$1A00`/`$E600` and side 1
 *  `$1E40`/`$5200`; everything else it writes is identical for both. D1 goes into FOUR fields at
 *  `$14`/`$1A`/`$20`/`$26`, a `$6` stride, so those are one array rather than four names.
 *
 *  It clears three BYTES and fifteen WORDS, and `($40,A6)` alone is set to `$1AC0` in the MIDDLE of
 *  that run. Transcribed as the list it is: folding the clears into a range would take `$40` with
 *  them and lose the only non-zero field in the block.
 *
 *  ELEVEN PALETTE INSTALLS, all through `$24150A`. They overlap slot [17] state 0's set in FIVE banks
 *  -- 24, 25, 26, 27, 28 -- and differ in the other six, which is what you would expect of two
 *  screens that share their character art and not their furniture.
 */
export function phase0_25D010(ram, rom, ctx, a6, d7) {
  const side = sideFromD7_25D4E4(d7);
  ram.setU16(a6 + 0x02, 0);                                  // $25D010 (and again at $25D022)
  const [d0, d1] = HANDLER0.coord[side];                     // $25D028/$25D034 -- the ONLY per-side part
  ram.setU16(a6 + HANDLER0.d0At, d0);                        // $25D03C
  for (const off of HANDLER0.d1At) ram.setU16(a6 + off, d1); // $25D040..$25D04C, a $6 stride
  for (const [off, v] of HANDLER0.pairs) ram.setU16(a6 + off, v);   // $25D050..$25D068, $25D094
  ram.setU8(a6 + HANDLER0.countAt, HANDLER0.countValue);     // $25D06E
  for (const off of HANDLER0.clearBytes) ram.setU8(a6 + off, 0);    // $25D074..$25D07C
  for (const off of HANDLER0.clearWords) ram.setU16(a6 + off, 0);   // $25D080..$25D0BE

  for (const p of HANDLER0.palettes) {                       // $25D0C2..$25D156
    if (ctx.palette) {
      install24150A(ram, ctx.palette, p.bank, rom.bytes(p.src, 64), 0x25d0c8, 'slot [9] palette');
    } else {
      ctx.unported?.note(0x24150a, `$25D0C8.. bank ${p.bank} <- $${p.src.toString(16).toUpperCase()}`);
    }
  }
  ram.setU8(a6 + SCREEN17.phaseAt, HANDLER0.nextPhase);      // $25D15C -- 0 ADVANCES to 1
}
