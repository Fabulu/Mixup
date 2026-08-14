// OBJECT DISPATCH [15], `$291F66` -- slot [7]'s OTHER fork arm. W373.
//
// Slot [7] stages type `$11` (slot [17]) when `$2911B0`'s menu answers 0 and type `$F` -- this slot --
// otherwise. State 2 stages type `$E`, so the chain is `[7] -> [15] -> [14] -> [12]`.
//
// IT IS A TIMED TEXT SEQUENCE. A 10-byte table at `$291FE2` schedules strings against a frame
// counter; each match takes a pool entry, and every live entry drifts down by `$81E120` per frame
// until it passes `$7800` and dies.
//
// IT SHARES `$81585C` WITH SLOT [7]'S POOL, AT A DIFFERENT SHAPE. `objslot7pool.js` walks it as 200
// entries of `$10`; this walks 50 entries of `$20`, which is the first half of the same region.
// Both are the cartridge's own counts (`moveq #$C7` there, `moveq #$31` here, each with a `dbra`),
// so neither is a guess -- but the two views alias, and nothing may assume the other's layout.
//
// `($6,A6)` PICKS THE WHOLE TEXT MODE, not just a font:
//
//     zero      font $2923DA, attr $210, and X advances $400 per character   -- HORIZONTAL
//     non-zero  font $29255A, attr $208, and the X advance is SKIPPED        -- VERTICAL
//
// The skip is a `bne` past the `addi.w #$400,D1` at the bottom of the loop. A port that always
// advances X draws the vertical strings as one horizontal line, in the wrong font, and every
// individual character still looks right.

import { u16, u32 } from './ram.js';
import { install24150A } from './palette.js';
import { chainLoader246710, chainCheck24681A, chainFree246800 } from './stageend.js';
import { enqueueRegistersThroughStub } from './spritequeue.js';
import { stageCreate, queueKill } from './objalloc.js';

export const SLOT15 = Object.freeze({
  entry: 0x291f66, start: 0x291f24, dispatch: 0x240f62,
  // The SAME base as POOL7, viewed as 50 x $20 rather than 200 x $10.
  pool: 0x81585c, stride: 0x20, entries: 50,
  seqTable: 0x291fe2, seqStride: 10, seqEnd: 0xffff,
  cursor: 0x81e11c, frames: 0x81e11e, drift: 0x81e120, driftInit: 0x20,
  deadAt: 0x7800, spawnX: 0x8000, spawnY: 0xf800,
  fontH: 0x2923da, fontV: 0x29255a, attrH: 0x0210, attrV: 0x0208,
  pal: 0x02, stub: 0x23dfb4, advance: 0x0400, firstGlyph: 0x20,
  resource: 0x291fd8, palBlock: 0x222838, palBank: 2,
  state: 0x02, phase: 0x04, timer: 0x06, handle: 0x08,
  timerInit: 0x80, gate: 0x813098, doneFlag: 0x81309a, clearFlag: 0x81e0da,
  childType: 0x0e,
});

/** `$291DC6` -- ARM. Clears the 50 entries and zeroes the two cursors, then sets the drift to `$20`.
 *  `moveq #$31,D7` with a `dbra` is FIFTY passes, not 49. */
export function armSequence291DC6(ram) {
  for (let i = 0; i < SLOT15.entries; i++) {                  // $291DCC moveq #$31,D7 / dbra
    ram.setU16(SLOT15.pool + i * SLOT15.stride, 0);           // $291DCE move.w #$0,(A6)
  }
  ram.setU16(SLOT15.cursor, 0);                              // $291DDA
  ram.setU16(SLOT15.frames, 0);                              // $291DE2
  ram.setU16(SLOT15.drift, SLOT15.driftInit);                // $291DEA
}

/** `$291E20` -- take the first free entry for the scheduled string. */
function spawn291E20(ram, rom, a4) {
  ram.setU16(SLOT15.frames, 0);                              // $291E20 -- the counter RESTARTS
  for (let i = 0; i < SLOT15.entries; i++) {                  // $291E2E moveq #$31,D7 / dbra
    const a6 = SLOT15.pool + i * SLOT15.stride;
    if (ram.u16(a6) !== 0) continue;                          // $291E30 tst.w (A6) / bne
    ram.setU16(a6, SLOT15.spawnX);                            // $291E36 move.w #$8000,(A6)
    ram.setU16(a6 + 0x02, SLOT15.spawnY);                     // $291E3A move.w #$F800,($2,A6)
    ram.setU16(a6 + 0x04, rom.u16(a4 + 0x02));                // $291E40
    ram.setU16(a6 + 0x06, rom.u16(a4 + 0x04));                // $291E46 -- the MODE word
    ram.setU32(a6 + 0x10, rom.u32(a4 + 0x06));                // $291E4C -- the string pointer
    // $291E52 addi.w #$A,$81E11C -- TEN, the table's stride, not the entry's $20.
    ram.setU16(SLOT15.cursor, u16(ram.u16(SLOT15.cursor) + SLOT15.seqStride));
    return;
  }
}

/** `$291DF4` -- the per-frame step: schedule, then drift and draw. */
export function stepSequence291DF4(ram, rom, ctx) {
  const a4 = SLOT15.seqTable + u16(ram.u16(SLOT15.cursor));  // $291DFA adda.w $81E11C,A4
  const due = rom.u16(a4);                                   // $291E00 move.w (A4),D0
  if (due !== SLOT15.seqEnd) {                               // $291E02 cmpi.w #$FFFF -- the END
    if (due === ram.u16(SLOT15.frames)) {                    // $291E0A/$291E10 cmp.w D1,D0
      spawn291E20(ram, rom, a4);
    } else {
      // $291E16 addq.w #1,$81E11E -- the counter only advances while WAITING. A spawn resets it to
      // zero, so each table entry's word is a DELAY since the previous one, not an absolute time.
      ram.setU16(SLOT15.frames, u16(ram.u16(SLOT15.frames) + 1));
    }
  }

  for (let i = 0; i < SLOT15.entries; i++) {                  // $291E66 lea $81585C,A6 / moveq #$31
    const a6 = SLOT15.pool + i * SLOT15.stride;
    if (ram.u16(a6) === 0) continue;                          // $291E6E tst.w (A6) / beq
    ram.setU16(a6 + 0x02, u16(ram.u16(a6 + 0x02) + ram.u16(SLOT15.drift)));   // $291E7A add.w
    // $291E7E cmpi.w #$7800,($2,A6) / blt -- a SIGNED compare, and $F800 is negative, so a fresh
    // entry starts far below the limit and climbs to it.
    if ((u16(ram.u16(a6 + 0x02)) << 16) >> 16 >= (SLOT15.deadAt << 16) >> 16) {
      ram.setU16(a6, 0);                                      // $291E88 move.w #$0,(A6) -- retired
      continue;
    }
    const str = ram.u32(a6 + 0x10);                           // $291E90 move.l ($10,A6),D0
    if (str === 0xffffffff) {                                 // $291E94 cmpi.l #$FFFFFFFF
      // $291E9E -- a $FFFFFFFF payload does not draw: it STOPS THE DRIFT for every entry at once.
      ram.setU16(SLOT15.drift, 0);
      continue;
    }
    drawString291EAA(ram, rom, ctx, a6, str);
  }
}

/** `$291EAA` -- draw one entry's NUL-terminated string, in whichever of the two modes it carries. */
function drawString291EAA(ram, rom, ctx, a6, str) {
  const vertical = ram.u16(a6 + 0x06) !== 0;                  // $291EBE tst.w ($6,A6)
  const font = vertical ? SLOT15.fontV : SLOT15.fontH;        // $291EB8 / $291EC6
  const attr = vertical ? SLOT15.attrV : SLOT15.attrH;        // $291EB0 / $291ECC
  let d1 = ram.u32(a6 + 0x02);                                // $291EAC move.l ($2,A6),D1
  for (let a = str; ; a++) {
    const ch = rom.u8(a);                                     // $291ED0 move.b (A3)+,D6
    if (ch === 0) return;                                     // $291ED2 beq -- NUL ends it
    // $291ED6 andi.w #$FF / $291EDA subi.w #$20 / two add.w -- the glyph index is (ch - ' ') * 4,
    // so the font table starts at SPACE and a bare `ch * 4` reads $80 bytes past every glyph.
    const idx = u16((ch & 0xff) - SLOT15.firstGlyph);
    enqueueRegistersThroughStub(ram, rom, SLOT15.stub,
      d1, rom.u32(font + u16(idx << 2)), attr, SLOT15.pal);   // $291EE2/$291EE6 jsr $23DFB4
    // $291EEC tst.w ($6,A6) / bne -- VERTICAL mode SKIPS this, so every character lands on the same
    // X and the string reads downward.
    if (!vertical) d1 = u32(d1 + SLOT15.advance);             // $291EF4 addi.w #$400,D1
  }
}

/** `$291F24` -- STATE 0. */
function state0(ram, rom, a5, ctx) {
  ram.setU8(a5 + SLOT15.state, 1);                           // $291F24
  armSequence291DC6(ram);                                    // $291F2A jsr $291DC6
  if (ctx.palette) {                                         // $291F2E lea $222838 / $291F34 moveq #2
    install24150A(ram, ctx.palette, SLOT15.palBank,
      rom.bytes(SLOT15.palBlock, 64), 0x291f38, "slot [15]'s palette");
  } else {
    ctx.unported?.note(0x24150a, `$291F38 jsr $24150A -- slot [15] bank ${SLOT15.palBank}`);
  }
  ram.setU16(a5 + SLOT15.phase, 0);                          // $291F3E
  ram.setU16(a5 + SLOT15.timer, SLOT15.timerInit);           // $291F44 -- $80 frames
  // $291F4A -- and a ZERO gate skips the whole sequence: straight to state 2, which stages the next
  // screen and dies. Non-zero raises $81309A instead and stays.
  if (ram.u16(SLOT15.gate) === 0) {                          // $291F4A tst.w $813098 / bne
    ram.setU8(a5 + SLOT15.state, 2);                         // $291F54
    return;
  }
  ram.setU16(SLOT15.doneFlag, 1);                            // $291F5C
}

/** `$291F0A` -- STATE 2: stage slot [14] and die. */
function state2(ram, rom, a5) {
  stageCreate(ram, SLOT15.childType,                         // $291F0A moveq #$E / $291F0E $241182
    (t) => rom.u16(SLOT15.dispatch + t * 8 + 4));
  ram.setU16(SLOT15.clearFlag, 0);                           // $291F14
  queueKill(ram, ram.u16(a5 + 0x00));                        // $291F1C JMP $241292
}

/** `$291F66` -- THE DISPATCH ENTRY. State 1 is the fall-through. */
export function objSlot15(ram, rom, a5, ctx) {
  const st = ram.u8(a5 + SLOT15.state);
  if (st === 0) { state0(ram, rom, a5, ctx); return; }       // $291F66 tst.b / beq $291F24
  if (st === 2) { state2(ram, rom, a5); return; }            // $291F6C cmpi.b #$2 / beq $291F0A

  stepSequence291DF4(ram, rom, ctx);                         // $291F74 jsr $291DF4 -- EVERY frame

  // $291F78 -- the load is armed once, and only after the timer runs out AND the drift has stopped.
  // All three conditions guard the same `bne`, so any one of them holds the load off.
  if (ram.u16(a5 + SLOT15.phase) === 0                       // $291F78 cmpi.w #$0,($4,A5)
      && ram.u16(SLOT15.drift) === 0) {                      // $291F82 tst.w $81E120 / bne
    const left = u16(ram.u16(a5 + SLOT15.timer) - 1);        // $291F8C subq.w #1,($6,A5)
    ram.setU16(a5 + SLOT15.timer, left);
    if (left === 0) {                                        // $291F90 bne
      ram.setU16(a5 + SLOT15.phase, 1);                      // $291F94
      ram.setU32(a5 + SLOT15.handle,                         // $291FA0 jsr $246710 / $291FA6
        chainLoader246710(ram, rom, SLOT15.resource, ctx) >>> 0);
      ctx.soundPost?.(0x28c186);                             // $291FAA moveq #0,D1 / $291FAC
    }
  }

  if (ram.u16(a5 + SLOT15.phase) !== 1) return;              // $291FB2 cmpi.w #$1,($4,A5) / bne
  if (chainCheck24681A(ram, ram.u32(a5 + SLOT15.handle)) !== 0) return;   // $291FC0 / $291FC6 bne
  chainFree246800(ram, ram.u32(a5 + SLOT15.handle));         // $291FCA jsr $246800
  ram.setU8(a5 + SLOT15.state, 2);                           // $291FD0
}
