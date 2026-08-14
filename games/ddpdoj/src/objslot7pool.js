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
