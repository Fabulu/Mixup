// THE `$81585C` EFFECT POOL -- object-dispatch slot [7]'s own sprite table. W372.
//
// A 200-entry table at a `$10` stride with THREE routines over it, and they are the whole of it:
//
//     $2908E4   CLEAR   every entry, plus five RAM slots and a palette install
//     $290984   ALLOC   the first free entry, filled from D0/D1/D2
//     $290946   DRAW    every live entry, through one of TWO emitters
//
// The entry is `long, long, word` in the first $A bytes of $10, and "free" is the FIRST LONG being
// zero -- which is why ALLOC tests `(A3)` and DRAW skips on the same test. The remaining $6 bytes of
// each entry are untouched by all three.
//
// 200 is `move.w #$C7,D7` with a `dbra` in all three, so the count is the cartridge's own and needs
// no bounds check anywhere.

import { u16 } from './ram.js';
import { install24150A } from './palette.js';
import { enqueueRegistersThroughStub } from './spritequeue.js';

export const POOL7 = Object.freeze({
  base: 0x81585c, entries: 200, stride: 0x10,
  // The three RAM words and two longs $2908E4 also clears.
  clearWords: Object.freeze([0x81e0f8, 0x81e0fa, 0x81e0fc]),
  clearLongs: Object.freeze([0x81e0fe, 0x81e102]),
  palBlock: 0x290706, palBank: 0,
  drawAttr: 0x0410,
  // ($8,A3) picks the emitter: NON-zero takes $23DFEA, zero takes $23E020.
  stubNonZero: 0x23dfea, stubZero: 0x23e020,
});

/** `$2908E4` -- CLEAR the pool and everything that indexes it, then install palette bank 0.
 *
 *  It clears `long, long, word` per entry and leaves the rest of each `$10` alone. Zeroing the whole
 *  stride would also be "clear", and would wipe fields the other two routines never write -- which is
 *  the kind of difference that shows up as a stale sprite three states later.
 */
export function poolClear2908E4(ram, rom, ctx) {
  let a3 = POOL7.base;                                       // $2908E4 lea $81585C,A3
  for (let i = 0; i < POOL7.entries; i++) {                  // $2908EA move.w #$C7,D7 / dbra
    ram.setU32(a3, 0);                                       // $2908EE move.l #$0,(A3)
    ram.setU32(a3 + 0x04, 0);                                // $2908F4
    ram.setU16(a3 + 0x08, 0);                                // $2908FC
    a3 += POOL7.stride;                                      // $290902 lea ($10,A3),A3
  }
  for (const w of POOL7.clearWords) ram.setU16(w, 0);        // $29090A/$290912/$29091A
  for (const l of POOL7.clearLongs) ram.setU32(l, 0);        // $290922/$29092C
  // $290936 lea $290706,A0 / $29093A move.w #$0,D0 / $29093E jsr $24150A. A caller WITHOUT a
  // PaletteState keeps a counted note naming the bank and the block, exactly as initbody.js's
  // installBank does -- so "that bank is still whatever it was" stays visible instead of silent.
  if (ctx.palette) {
    install24150A(ram, ctx.palette, POOL7.palBank,
      rom.bytes(POOL7.palBlock, 64), 0x29093e, "slot [7]'s pool palette");
  } else {
    ctx.unported?.note(0x24150a, `$29093E jsr $24150A -- slot [7]'s pool palette: bank `
      + `${POOL7.palBank} <- $${POOL7.palBlock.toString(16).toUpperCase()}. No PaletteState on `
      + `this call chain, so that bank stays whatever it was`);
  }
}

/** `$290984` -- ALLOCATE the first free entry. "Free" is the FIRST LONG being zero, the same test
 *  the drawer uses to decide whether to draw, so the two agree by construction.
 *
 *  It walks from the START every call rather than keeping a cursor, so allocation order follows
 *  freeing order. A port with a rolling cursor would place effects in a different order and diverge
 *  only once the pool has been recycled.
 */
export function poolAlloc290984(ram, d0, d1, d2) {
  let a3 = POOL7.base;                                       // $290984 lea $81585C,A3
  for (let i = 0; i < POOL7.entries; i++) {                  // $29098A move.w #$C7,D7 / dbra
    if (ram.u32(a3) === 0) {                                 // $29098E tst.l (A3) / bne
      ram.setU32(a3, d0 >>> 0);                              // $290994 move.l D0,(A3)
      ram.setU32(a3 + 0x04, d1 >>> 0);                       // $290996 move.l D1,($4,A3)
      ram.setU16(a3 + 0x08, u16(d2));                        // $29099A move.w D2,($8,A3)
      return a3;
    }
    a3 += POOL7.stride;
  }
  return 0;                                                  // the pool is full: the ROM just falls out
}

/** `$290946` -- DRAW every live entry, through ONE OF TWO emitters chosen per entry by `($8,A3)`.
 *
 *  That word is the same one ALLOC writes from D2, so it is a per-effect KIND rather than a flag the
 *  drawer sets. Using one emitter for both draws every effect with the wrong convention for half of
 *  them, and each individual call still looks right.
 */
export function poolDraw290946(ram, rom, ctx) {
  let a3 = POOL7.base;                                       // $290946 lea $81585C,A3
  for (let i = 0; i < POOL7.entries; i++) {                  // $29094C move.w #$C7,D7 / dbra
    const d2 = ram.u32(a3);                                  // $290950 move.l (A3),D2
    if (d2 !== 0) {                                          // $290952 beq -- zero is a free slot
      const stub = ram.u16(a3 + 0x08) !== 0                  // $290962 tst.w ($8,A3) / beq
        ? POOL7.stubNonZero : POOL7.stubZero;                // $29096A jsr $23DFEA / $290974 $23E020
      enqueueRegistersThroughStub(ram, rom, stub,
        ram.u32(a3 + 0x04), d2, POOL7.drawAttr, 0);          // $290956 A1 / $29095A D3 / $29095E D4
    }
    a3 += POOL7.stride;                                      // $29097A lea ($10,A3),A3
  }
}

/** The interpreter's RAM, all of it in one place because five separate words is how it desynchronises. */
export const SCRIPT7 = Object.freeze({
  cursor: 0x81e0f8,        // a BYTE OFFSET into the script, not a pointer -- survives the call
  counter: 0x81e0fa,       // and $81E0FB is its RELOAD: one move.w arms both
  loopCount: 0x81e0fc,     // $8002's repeat counter
  resource: 0x81e0fe,      // $8003's cache -- non-zero means "already loaded"
  scriptPtr: 0x81e102,     // $8001's long
  spawnBias: 0x81e104,     // bumped by $400 per spawn
  resTable: 0x290e8a,      // $8003's five records, which sit BEFORE this table
  spawnTable: 0x2902c2,    // 64 pointers to $24-byte records
  END: 0xffff,
});

/** `$2909AA` -- THE SCRIPT INTERPRETER. Returns TRUE while the script is still running, which the ROM
 *  carries in the carry flag through `ori.w #$1,SR` / `andi.w #$FFFE,SR`.
 *
 *  THE CURSOR ADVANCE IS PER-OPCODE and that is the whole correctness of it:
 *
 *      $8000  word operand   cursor += 4    and LOOP internally
 *      $8001  LONG operand   cursor += 6    and LOOP internally
 *      $8002  wait           cursor += 4 ONLY when the count matches, else ZERO and return
 *      $8003  load+cache     cursor UNCHANGED, always returns
 *
 *  A fixed stride desynchronises the whole script, and silently: the first command still works.
 *  The two waiting opcodes returning WITHOUT advancing is how the script holds -- the next call
 *  re-reads the same command.
 */
export function scriptStep2909AA(ram, rom, ctx, scriptBase) {
  for (;;) {                                                 // $290A10/$290A26/$290A4A bra back
    const at = scriptBase + u16(ram.u16(SCRIPT7.cursor));    // $2909AC adda.w $81E0F8,A2
    // The SCRIPT is in ROM -- A0 is a ROM base and only the CURSOR lives in RAM. Reading the word from
    // RAM throws "outside main RAM" the moment it runs, which is how this was caught.
    const word = rom.u16(at);                                // $2909B2 move.w (A2)+,D0

    if ((word & 0x8000) === 0) {                             // $2909B4 bmi -- plain data
      // $2909B8 -- the counter ticks on DATA words only, and a borrow reloads it from $81E0FB.
      const c = (ram.u8(SCRIPT7.counter) - 1) & 0xff;
      ram.setU8(SCRIPT7.counter, c);
      if (c !== 0xff) return true;                           // $2909BE bcc -- not expired, hold
      ram.setU8(SCRIPT7.counter, ram.u8(SCRIPT7.counter + 1));   // $2909C2 reload from the pair
      // $2909CC -- index the spawn table by the data word and allocate into the pool.
      const rec = rom.u32(SCRIPT7.spawnTable + ((word & 0xffff) << 2));   // $2909D0..$2909D6
      poolAlloc290984(ram, rec, ram.u32(SCRIPT7.scriptPtr), 0);           // $2909D8/$2909DE/$2909E0
      ram.setU16(SCRIPT7.spawnBias,
        u16(ram.u16(SCRIPT7.spawnBias) + 0x400));            // $2909E2 addi.w #$400
      ram.setU16(SCRIPT7.cursor, u16(ram.u16(SCRIPT7.cursor) + 2));       // $2909EA addq.w #2
      return true;                                           // $2909F0 ori.w #$1,SR
    }

    if (word === 0x8000) {                                   // $2909FC
      ram.setU16(SCRIPT7.counter, rom.u16(at + 2));          // $290A04 move.w (A2)+,$81E0FA
      ram.setU16(SCRIPT7.cursor, u16(ram.u16(SCRIPT7.cursor) + 4));       // $290A0A addq.w #4
      continue;                                              // $290A10 -- LOOP
    }
    if (word === 0x8001) {                                   // $290A12
      ram.setU32(SCRIPT7.scriptPtr, rom.u32(at + 2));        // $290A1A move.l (A2)+,$81E102
      ram.setU16(SCRIPT7.cursor, u16(ram.u16(SCRIPT7.cursor) + 6));       // $290A20 addq.w #6
      continue;                                              // $290A26 -- LOOP
    }
    if (word === 0x8002) {                                   // $290A28 -- WAIT
      if (ram.u16(SCRIPT7.loopCount) === rom.u16(at + 2)) {  // $290A30/$290A36 cmp.w (A2),D1
        ram.setU16(SCRIPT7.loopCount, 0);                    // $290A3C
        ram.setU16(SCRIPT7.cursor, u16(ram.u16(SCRIPT7.cursor) + 4));     // $290A44
        continue;                                            // $290A4A -- LOOP
      }
      ram.setU16(SCRIPT7.loopCount, u16(ram.u16(SCRIPT7.loopCount) + 1)); // $290A4E addq.w #1
      return true;                                           // $290A54 -- HOLD, cursor UNCHANGED
    }
    if (word === 0x8003) {                                   // $290A56 -- LOAD, cached
      if (ram.u32(SCRIPT7.resource) === 0) {                 // $290A5E/$290A64 bne -- already loaded
        const idx = rom.u16(at + 2);                         // $290A68
        const res = ctx.load246710?.(rom, rom.u32(SCRIPT7.resTable + (idx << 2))) ?? 0;  // $290A78
        ram.setU32(SCRIPT7.resource, res >>> 0);             // $290A7E
      }
      return true;                                           // $290A84 -- HOLD, cursor UNCHANGED
    }
    if (word === SCRIPT7.END) return false;                  // $FFFF -- the carry-CLEAR exit
    return false;                                            // any other $80xx: unread, stop cleanly
  }
}

/** `$291470` / `$2917BE` / `$291B3A` -- THE SEQUENCE DRIVER, assembled three times.
 *
 *  The 88 bytes of CODE are identical in all three; only three `jsr (d16,PC)` displacements differ,
 *  and only because the copies sit at different addresses. What makes them three is the DATA: each
 *  copy is followed at +88 by ITS OWN `$FFFFFFFF`-terminated sequence list. So the port needs ONE
 *  function taking the list base, registered three times.
 *
 *  It drives the whole subsystem: walk the sequence, hand each entry to the script interpreter, and
 *  when a script REPORTS DONE (carry clear) advance to the next entry AND CLEAR THE POOL. The clear
 *  between entries is the part a port would drop -- without it the previous script's effects survive
 *  into the next one, and only on a sequence that spawns.
 */
export function sequenceDriver291470(ram, rom, ctx, a5, a6, listBase) {
  if (ram.u16(a6 + 0x06) === 0) {                            // $291470 cmpi.w #$0,($6,A6)
    ram.setU16(a6 + 0x06, 1);                                // $29147A
    poolClear2908E4(ram, rom, ctx);                          // $291480 jsr $2908E4
    ram.setU16(a6 + 0x0c, 0);                                // $291484 -- the sequence CURSOR
  }
  if (ram.u16(a6 + 0x06) !== 1) return;                      // $29148A cmpi.w #$1 / bne

  const entry = rom.u32(listBase + u16(ram.u16(a6 + 0x0c))); // $291494/$29149A/$29149E
  if (entry === 0xffffffff) {                                // $2914A0 cmpi.l #$FFFFFFFF
    ram.setU8(a5 + 0x02, 2);                                 // $2914AA -- the OBJECT's state, not A6's
    return;                                                  // $2914B0
  }
  if (scriptStep2909AA(ram, rom, ctx, entry)) return;        // $2914B6 jsr $2909AA / $2914BA bcs
  // Carry CLEAR means that script ENDED: step the sequence and wipe what it left behind.
  ram.setU16(a6 + 0x0c, u16(ram.u16(a6 + 0x0c) + 4));        // $2914BE addq.w #4,($C,A6)
  poolClear2908E4(ram, rom, ctx);                            // $2914C2 jsr $2908E4
}
