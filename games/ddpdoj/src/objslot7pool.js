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

/** `$2908D2` -- the INNER-STATE SETTER. Eighteen bytes: point A6 at the fixed block, store D0 into
 *  `($8,A6)`, and clear the sub-state `($6,A6)`.
 *
 *  **It has NO change-detection guard**, unlike `$4C`'s `$26F858`, which returns early when the state
 *  is unchanged. Here every call resets the sub-state, so calling it with the current state is a
 *  RESTART rather than a no-op. Copying `$26F858`'s guard across would silently prevent that.
 */
export function setInnerState2908D2(ram, d0) {
  ram.setU16(0x81e0dc + 0x08, u16(d0));                      // $2908D8 move.w D0,($8,A6)
  ram.setU16(0x81e0dc + 0x06, 0);                            // $2908DC move.w #$0,($6,A6)
}

/** `$290E9E` -- INNER STATE 0. The same sequence-driving shape as `$291470`, with one difference that
 *  matters: on the terminator it does NOT finish the object -- it BUMPS the variant `($E,A6)` and
 *  re-enters through the setter, so it cycles through the three sequence lists at `$290F12`.
 *
 *  `$291470` sets the object's state to 2 and stops. This one loops. Same five instructions either
 *  side of the terminator test, opposite meanings.
 */
export function innerState0_290E9E(ram, rom, ctx, a5, a6) {
  if (ram.u16(a6 + 0x06) === 0) {                            // $290EA4 cmpi.w #$0,($6,A6)
    ram.setU16(a6 + 0x06, 1);                                // $290EAE
    poolClear2908E4(ram, rom, ctx);                          // $290EB4 jsr $2908E4
    ram.setU16(a6 + 0x0c, 0);                                // $290EB8
    ctx.cue28CC28?.(ram, ctx);                               // $290EBE jsr $28CC28 (ported elsewhere)
  }
  if (ram.u16(a6 + 0x06) !== 1) return;                      // $290EC4 cmpi.w #$1 / bne

  // $290ECE -- pick the sequence LIST by the variant, then index it by the sequence cursor.
  const list = rom.u32(0x290f12 + (u16(ram.u16(a6 + 0x0e)) << 2));   // $290ED4..$290EDC
  const entry = rom.u32(list + u16(ram.u16(a6 + 0x0c)));     // $290EE0/$290EE4

  if (entry === 0xffffffff) {                                // $290EE6
    // $290EF0 reads ($E,A6) -- the VARIANT -- adds one, and hands it to the setter, which stores it
    // as the INNER STATE in ($8,A6). So the variant selector and the state index are the SAME
    // number one apart, and finishing variant N moves to inner state N+1. It does not "cycle the
    // variant": it leaves inner state 0 entirely.
    setInnerState2908D2(ram, u16(ram.u16(a6 + 0x0e) + 1));   // $290EF0/$290EF4/$290EF6
    return;                                                  // $290EFA
  }
  if (scriptStep2909AA(ram, rom, ctx, entry)) return;        // $290F00 jsr $2909AA / $290F04 bcs
  ram.setU16(a6 + 0x0c, u16(ram.u16(a6 + 0x0c) + 4));        // $290F08 addq.w #4
  poolClear2908E4(ram, rom, ctx);                            // $290F0C jsr $2908E4
}

/** `$2907E2` -- THE RESOURCE LOADER. A five-state machine on `$81E108` that is really TWO load/wait
 *  pairs and an idle:
 *
 *      0  idle
 *      1  load through $246710 from the $290CE8 table   -> 2
 *      2  WAIT on $24681A, COMMIT with $246800          -> 3
 *      3  load through $24641A from the $290DAE table   -> 4
 *      4  WAIT on $24681A, COMMIT with $246800          -> 0
 *
 *  Both loads cache their handle in the SAME word, `$81E10E`, and both waits consume it -- so the
 *  pairs must not be collapsed or interleaved: state 3 overwrites what state 2 committed, and doing
 *  the two loads together would lose the first handle entirely.
 *
 *  `$24641A` is `$246410` with mode 0, which is why the two loads use different entries of one
 *  routine rather than two routines.
 */
export function resourceLoader2907E2(ram, rom, ctx) {
  const st = ram.u16(0x81e108);
  if (st === 0) return;                                      // $2907E2 tst.w / beq $2908D0

  if (st === 1) {                                            // $2907EC
    if (ram.u16(0x81e106) === 0) return;                     // $2907F8 tst.w / beq -- not armed yet
    const rec = rom.u32(0x290ce8 + (u16(ram.u16(0x81e10c)) << 2));   // $290802..$290812
    ram.setU32(0x81e10e, ctx.load246710?.(rom, rec) ?? 0);   // $290816 jsr $246710 / $29081C
    return;
  }
  if (st === 2) {                                            // $290828
    if (!ctx.ready24681A?.(ram, ram.u32(0x81e10e))) return;  // $290836/$29083C jsr $24681A / bne
    ctx.commit246800?.(ram, ram.u32(0x81e10e));              // $290846 jsr $246800
    ram.setU16(0x81e106, ram.u16(0x81e10a));                 // $29084C move.w $81E10A,$81E106
    ram.setU16(0x81e108, 3);                                 // $290856
    return;
  }
  if (st === 3) {                                            // $29085E
    // The SECOND table and the mode-0 entry. Same shape as state 1, different table and mode, and it
    // overwrites $81E10E -- which is why state 2 must have committed before this runs.
    const rec = rom.u32(0x290dae + (u16(ram.u16(0x81e10c)) << 2));   // $29087E..$29088E
    ram.setU32(0x81e10e, ctx.loadAnim0?.(rom, rec) ?? 0);    // $290892 jsr $24641A -- MODE 0
    ram.setU16(0x81e108, 4);                                 // $29089E
    return;
  }
  if (st === 4) {                                            // $2908A6
    if (!ctx.ready24681A?.(ram, ram.u32(0x81e10e))) return;  // $2908B2/$2908B8
    ctx.commit246800?.(ram, ram.u32(0x81e10e));              // $2908C2
    ram.setU16(0x81e108, 0);                                 // $2908C8 -- back to IDLE, not onward
  }
}
