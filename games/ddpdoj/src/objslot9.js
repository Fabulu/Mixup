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
