// OBJECT DISPATCH [14], `$288C6C` -- W372, identified as the Game Over transition in W386.
//
// The cartridge draws ONE rank-selected sprite through $23DECE per frame. Slot 14 owns the screen
// reset, the 300-frame lifetime, and the handoff to dispatch type $C; its two descriptor tables and
// existing sprite enqueue path are the authoritative Game Over presentation.
//
// TWO THINGS ABOUT ITS SHAPE, both of which cost measurements before they were noticed:
//
//   1. THE DISPATCH ADDRESS IS NOT THE ROUTINE'S START. The table entry is $288C6C, and the state-0
//      and state-2 arms branch BACKWARD from it to $288BCE and $288C3E. The routine runs
//      $288BCE..$288D62, and every size taken forward from $288C6C measured the wrong span.
//   2. ITS CALLEES ARE ALL PORTED -- eleven of them -- but only once `4EF9` (JMP abs.l) and `4EBA`
//      (jsr PC-relative) are counted. Scanning `4EB9`/`61xx` alone reports three unported routines
//      that this slot never calls, because a fixed forward window runs past its end.
//
// The state byte is ($2,A5) and the arms are 0, 1, 2 -- the same shape tallyscreen.js documents for
// slot [11], and the same shape all eleven untouched slots share.

import { u16 } from './ram.js';
import { clearTx23C622, resetScrolls23C61E } from './background.js';
import { enqueueRegistersThroughStub } from './spritequeue.js';
import { loadAnimObjects246410 } from './animobjects.js';
import { clear24631C } from './stageend.js';
import { armRequest25FF38 } from './player.js';
import { stageCreate, queueKill } from './objalloc.js';

export const SLOT14 = Object.freeze({
  entry: 0x288c6c, start: 0x288bce, end: 0x288d62,
  stateAt: 0x02,
  // The two eight-long tables, chosen by ($16,A5). W372's window is $288D62+$40 covering both.
  tableA: 0x288d62, tableB: 0x288d82, tableEntries: 8,
  drawStub: 0x23dece, drawBias: 0xe600e400, drawAttr: 0x1ae0, drawPal: 0x0002,
  childType: 0x0c, dispatch: 0x240f62,
  idAt: 0x4c,                 // $241292 does `lea ($4C,A5),A0` -- the same field objslot12.js names
});

/** State 0 -- reset the screen and arm every counter. Reached by the entry's BACKWARD `beq`. */
function state0(ram, rom, a5, ctx) {
  resetScrolls23C61E(ctx.videoRegs);                         // $288BCE jsr $23C61E
  clearTx23C622(ctx.tx);                                     // $288BD4 jsr $23C622
  ctx.bgVram?.clear23C638?.();                               // $288BDA jsr $23C638
  ram.setU8(a5 + SLOT14.stateAt, 1);                         // $288BE0
  ram.setU16(a5 + 0x08, 0x4400);                             // $288BE6 -- the draw position pair
  ram.setU16(a5 + 0x0a, 0x1c00);                             // $288BEC
  ram.setU16(a5 + 0x14, 0x0000);                             // $288BF2
  ram.setU16(a5 + 0x12, 0);                                  // $288BF8 clr.w
  ram.setU16(a5 + 0x10, 0);                                  // $288BFC clr.w
  ram.setU8(a5 + 0x16, 1);                                   // $288C00 -- the TABLE selector, 1 not 0
  ram.setU8(a5 + 0x17, 0);                                   // $288C06 clr.b
  ram.setU16(a5 + 0x18, 0);                                  // $288C0A clr.w
  ram.setU16(a5 + 0x04, 0x012c);                             // $288C0E -- 300 frames
  loadAnimObjects246410(ram, rom, 0x288c2e);                 // $288C14 lea / $288C1A jsr $246410
  ram.setU16(a5 + 0x1a, 0x20);                               // $288C20
  ram.setU16(a5 + 0x1c, 0x20);                               // $288C26
}

/** State 2 -- run out the second counter, then hand over to dispatch type $C and kill self. */
function state2(ram, rom, a5) {
  const left = u16(ram.u16(a5 + 0x1c) - 1);                  // $288C3E subq.w #1
  ram.setU16(a5 + 0x1c, left);
  if (left !== 0) return;                                    // $288C42 bne
  armRequest25FF38(ram, 0, 6);                               // $288C46 moveq #$0,D0 (side)
                                                             // $288C48 move.w #$6,D1 (request)
  clear24631C(ram);                                          // $288C52 jsr $24631C
  // $241182 takes the priority from the DISPATCH TABLE, not from the caller: `($4,A0,D1)` with A0
  // at $240F62. Passing a bare 0 here type-errors the moment this arm runs.
  stageCreate(ram, SLOT14.childType,                         // $288C58/$288C5C -- type $C
    (t) => rom.u16(SLOT14.dispatch + t * 8 + 4));
  // $288C62 JMP $241292 -- a TAIL kill, and the ARGUMENT IS THE ID, not the type word.
  // Verified from the bytes this wave (W388), because passing the wrong one is silent:
  //   $241292  41 ed 00 4c   lea ($4C,A5),A0       <- the ID field, NOT ($0,A5)
  //   $241296  60 a0         bra $241238
  //   $241252  22 90         move.l (A0),(A1)      <- the queue takes the LONG THROUGH A0
  // `killById` then compares `u16(id)` against `u16(($4C,slot))`. With the type word $800E
  // queued it compared $800E against the id $0001, never matched, and the type-$E object
  // NEVER DIED -- it stayed live in the table for the whole run after staging its successor.
  queueKill(ram, ram.u32(a5 + SLOT14.idAt));                 // $288C62 JMP $241292
}

/** `$288C6C` -- the dispatch entry. Note it is the MIDDLE of the routine: both other arms are below.
 *  State 1 is the fall-through, and it is the only one that draws. */
export function objSlot14(ram, rom, a5, ctx) {
  const st = ram.u8(a5 + SLOT14.stateAt);
  if (st === 0) { state0(ram, rom, a5, ctx); return; }        // $288C6C tst.b / beq $288BCE
  if (st === 2) { state2(ram, rom, a5); return; }             // $288C74 cmpi.b #$2 / beq $288C3E

  // $288C7C -- the first counter fires a cue ONCE when it reaches zero, not every frame after.
  if (ram.u16(a5 + 0x1a) !== 0) {                            // $288C7C tst.w / beq
    const t = u16(ram.u16(a5 + 0x1a) - 1);                   // $288C84 subq.w #1
    ram.setU16(a5 + 0x1a, t);
    if (t === 0) ctx.soundPost?.(0x28cb4c);                  // $288C88 bne / $288C8C jsr $28CB4C
  }
  // $288C92 -- and the second counter goes NEGATIVE before state 2 is entered: `bpl` skips the
  // store, so the state advances on the frame the count passes zero, not on the frame it reaches it.
  const life = u16(ram.u16(a5 + 0x04) - 1);
  ram.setU16(a5 + 0x04, life);
  if ((life & 0x8000) !== 0) ram.setU8(a5 + SLOT14.stateAt, 2);   // $288C96 bpl / $288C9A

  if (ram.u16(a5 + 0x10) !== 0) return;                      // $288CA0 cmpi.w #$0 / bne -- no draw

  // $288CD4 -- the RANK-selected table. The $242E24 byte shifted right by 3 goes to ($16,A5); if that is zero the
  // ($17,A5) counter bumps and, below 3, forces the selector back to 1. So the table only switches
  // after three consecutive zero rank bytes.
  const rank = (ctx.rankByte?.(ram, rom) ?? 0) >>> 3;        // $288CD4 jsr $242E24 / $288CDA lsr.w #3
  ram.setU8(a5 + 0x16, rank & 0xff);
  if ((rank & 0xff) === 0) {
    const n = (ram.u8(a5 + 0x17) + 1) & 0xff;                // $288CE2 addq.b #1
    ram.setU8(a5 + 0x17, n);
    if (n < 3) ram.setU8(a5 + 0x16, 1);                      // $288CE6 cmpi.b #$3 / bcs / $288CEE
  }
  const table = ram.u8(a5 + 0x16) !== 0 ? SLOT14.tableA : SLOT14.tableB;   // $288CF4/$288CFE
  ram.setU32(a5 + 0x0c, rom.u32(table + u16(ram.u16(a5 + 0x12))));        // $288D02

  // $288D44 -- ONE sprite, tail-jumped into the emitter the port already has.
  enqueueRegistersThroughStub(ram, rom, SLOT14.drawStub,
    (ram.u32(a5 + 0x08) + SLOT14.drawBias) >>> 0,            // $288D48 addi.l #$E600E400
    ram.u32(a5 + 0x0c), SLOT14.drawAttr, SLOT14.drawPal);    // $288D4E/$288D52/$288D56
}
