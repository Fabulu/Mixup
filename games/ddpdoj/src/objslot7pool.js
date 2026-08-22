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

import { u16, u32 } from './ram.js';
import { unreached } from './unported.js';
import { endHyper285AF2 } from './hyper.js';
import { hyperStock286ED6 } from './hud.js';
import { screenWipe23C6C6 } from './background.js';
import { stageCreate, queueKill } from './objalloc.js';
import { readInput23D186 } from './tallyscreen.js';
import { chainLoader246710, chainCheck24681A } from './stageend.js';
// W449: `$246800` merged into `animobjects.js`; `stageend.js chainFree246800` is gone.
import { freeAnimObjects246800 } from './animobjects.js';
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
  spawnBias: 0x81e104,     // its LOW WORD, bumped by $400 after each spawn
  resTable: 0x290e8a,      // $8003's five records, which sit BEFORE this table
  spawnTable: 0x2902c2,    // pointer table indexed directly by each plain script word
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
 *      $8003  resource       load and hold; once ready, free, cursor += 4, and LOOP internally
 *
 *  A fixed stride desynchronises the whole script, and silently: the first command still works.
 *  The two waiting opcodes returning WITHOUT advancing is how the script holds -- the next call
 *  re-reads the same command. `$8003` is the exception only after `$24681A` reports zero: the
 *  cartridge frees the cached `$246710` chain, clears its handle, advances, and keeps interpreting.
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
    if (word === 0x8003) {                                   // $290A56 -- LOAD, WAIT, FREE
      const handle = ram.u32(SCRIPT7.resource) >>> 0;        // $290A5E move.l $81E0FE,D0
      if (handle === 0) {                                    // $290A64 bne $290A88
        const idx = rom.u16(at + 2);                         // $290A68 move.w (A2),D0
        const rec = rom.u32(SCRIPT7.resTable + (idx << 2));  // $290A6A..$290A74
        ram.setU32(SCRIPT7.resource,
          chainLoader246710(ram, rom, rec, ctx) >>> 0);      // $290A78/$290A7E
        return true;                                         // $290A84 bra $2909F0
      }
      if (chainCheck24681A(ram, handle) !== 0) return true;  // $290A88/$290A8E bne $2909F0
      freeAnimObjects246800(ram, handle);                    // $290A92 jsr $246800
      ram.setU32(SCRIPT7.resource, 0);                       // $290A98 move.l #0,$81E0FE
      ram.setU16(SCRIPT7.cursor,
        u16(ram.u16(SCRIPT7.cursor) + 4));                   // $290AA2 addq.w #4,$81E0F8
      continue;                                              // $290AA8 bra $2909AA
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
  // W449 REPORTS, DOES NOT FIX: `$290846` and `$2908C2` are two of `$246800`'s twenty-one ROM
  // callers, and in this port they reach it only through the OPTIONAL `ctx.commit246800` hook.
  // NO production ctx supplies that key -- only `tests/w372pool7.test.js` does -- so these two
  // frees never happen and the chains they own leak out of the twenty-slot `$80FA86` pool.
  // `$2912D8` in this same file calls the ported routine directly. `w375ctxkeys.test.js` still
  // describes the key as "$246800. Not ported.", which has been untrue since W341. Wiring these
  // two is a behaviour change (two pool slots that currently leak would start being released),
  // so it wants its own state trace and its own wave, not a merge wave's spare line.
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

/** The `$2911B0` menu's four tables and its two RAM words. Every bound here is something the code
 *  states rather than something a scan guessed -- see the W373 window notes. */
export const MENU2911B0 = Object.freeze({
  start: 0x2911b0, end: 0x291352,
  list: 0x291396,            // state 1's script list, one entry then $FFFFFFFF
  confirmRes: 0x291354,      // handed to $246710 when the choice is taken
  cursorTable: 0x291366,     // TWO entries, bounded by the #$1 mask on $81E112
  digitTable: 0x29136e,      // TEN entries, bounded by the 600-frame counter
  sel: 0x81e112,             // the selection, 0 or 1
  timer: 0x81e114,           // the countdown, $258 = 600 frames = 10 seconds
  flag: 0x81e116,
  palBlock: 0x222838, palBank: 3,   // $2911E2 lea / $2911E8 moveq #$3 / $2911EC jsr $24150A
  cursorArt: 0x0b20, cursorAttr: 0x0210, cursorPal: 0x0003,
  digitPos: 0x5e001c00, digitAttr: 0x0210, digitPal: 0x0003,
  mirrorBias: 0x1000, mirrorPal: 0x40,
  timeout: 0x258, seconds: 0x3c,
});

/** `$2911B0` -- A TWO-OPTION MENU WITH A TEN-SECOND COUNTDOWN, and the last unwritten routine of
 *  slot [7]'s subsystem. Four states on `($6,A6)`:
 *
 *      0  clear the pool, arm the counters, install the palette      -> 1
 *      1  run the script list; when it ends, PICK THE INPUT READER   -> 2
 *      2  read input, move the cursor, wait for a button OR the timeout -> 3
 *      3  wait on the loaded resource, commit, set the OUTER dispatch state to 2
 *
 *  THREE THINGS THE CARTRIDGE DOES THAT A TIDIED PORT WOULD GET WRONG:
 *
 *   1. LEFT AND RIGHT BOTH DO `addq.w #1` AND THE RESULT IS MASKED WITH `#$1`. Bits 2 and 3 are the
 *      pad's LEFT and RIGHT, and neither one "selects 0" or "selects 1" -- each TOGGLES. Pressing
 *      both on the same frame moves the cursor by two, which is back where it started. Writing it
 *      as an if/else changes what the pad does.
 *   2. THE INPUT IS READ THREE SEPARATE TIMES, once per test. `$23D186` is edge-detected, so three
 *      reads is not the same as one read used three times.
 *   3. THE TIMEOUT AND THE BUTTON SHARE ONE EXIT. `$2912BE beq` jumps BACKWARD to `$291298`, the
 *      confirm path. Running out of time confirms whatever is currently selected, and state 0
 *      selects 1 -- so the default choice is option 1 and it is what the clock picks.
 */
export function menu2911B0(ram, rom, a5, a6, ctx) {
  if (ram.u16(a6 + 0x06) === 0) {                            // $2911B0 cmpi.w #$0,($6,A6)
    ram.setU16(a6 + 0x06, 1);                                // $2911BA
    poolClear2908E4(ram, rom, ctx);                          // $2911C0 jsr $2908E4 (PC-relative)
    // $2911C4 -- move.w, not move.l. ($C,A6) is read back as a LONG by the adda.l below, so state 0
    // clears only its HIGH half and trusts the low half to be zero already. Transcribed as written.
    ram.setU16(a6 + 0x0c, 0);
    ram.setU16(MENU2911B0.flag, 1);                          // $2911CA
    ram.setU16(MENU2911B0.sel, 1);                           // $2911D2 -- the DEFAULT choice
    ram.setU16(MENU2911B0.timer, MENU2911B0.timeout);        // $2911DA -- 600 frames
    // Guarded the same way $2908E4 guards its own install: a chain with no PaletteState keeps a
    // counted note naming the bank, rather than silently leaving bank 3 as whatever it was.
    if (ctx.palette) {                                       // $2911E2 lea $222838,A0
      install24150A(ram, ctx.palette, MENU2911B0.palBank,    // $2911E8 moveq #$3,D0
        rom.bytes(MENU2911B0.palBlock, 64), 0x2911ec, "the $2911B0 menu's palette");
    } else {
      ctx.unported?.note(0x24150a, `$2911EC jsr $24150A -- the $2911B0 menu's palette: bank `
        + `${MENU2911B0.palBank} <- $${MENU2911B0.palBlock.toString(16).toUpperCase()}`);
    }
  }

  if (ram.u16(a6 + 0x06) === 1) {                            // $2911F2
    const entry = rom.u32(MENU2911B0.list + ram.u32(a6 + 0x0c));   // $291202 adda.l / $291206
    if (entry === 0xffffffff) {                              // $291208 cmpi.l #$FFFFFFFF
      ram.setU16(a6 + 0x06, 2);                              // $291212 -- the list is spent
      // $291218/$291220 -- and NOW the reader is chosen, once, from P1's record. Same sign test on
      // $8103E6 that background.js and boss.js use to pick the active side.
      ram.setU32(a6 + 0x18, (ram.u32(0x8103e6) & 0x80000000) ? 0x23d186 : 0x23d18e);
    } else {
      // $291238 bsr $2909AA / $29123C bcs -- carry SET means "stay on this entry", so the cursor
      // advances only when the step reports itself finished.
      if (!scriptStep2909AA(ram, rom, ctx, entry)) {
        ram.setU32(a6 + 0x0c, u32(ram.u32(a6 + 0x0c) + 4));  // $291240 addq.l #4,($C,A6)
      }
    }
  }

  if (ram.u16(a6 + 0x06) === 2) {                            // $291244
    const side = ram.u32(a6 + 0x18) === 0x23d186 ? 0 : 1;
    let confirmed = false;
    if ((readInput23D186(ram, side) & 0x04) !== 0) {          // $291252 jsr (A0) / $291254 btst #$2
      ram.setU16(MENU2911B0.sel, u16(ram.u16(MENU2911B0.sel) + 1));   // $29125C addq.w #1
      ctx.soundPost?.(0x28c6fa);                             // $291262 -- the cursor-move sound
    }
    if ((readInput23D186(ram, side) & 0x08) !== 0) {          // $29126C SECOND read / btst #$3
      ram.setU16(MENU2911B0.sel, u16(ram.u16(MENU2911B0.sel) + 1));   // $291276 -- ALSO addq #1
      ctx.soundPost?.(0x28c6fa);
    }
    ram.setU16(MENU2911B0.sel, ram.u16(MENU2911B0.sel) & 1); // $291282 andi.w #$1 -- the mask
    if ((readInput23D186(ram, side) & 0x70) !== 0) {          // $29128E THIRD read / $291290 #$70
      confirmed = true;
    } else {
      const left = u16(ram.u16(MENU2911B0.timer) - 1);       // $2912B8 subq.w #1
      ram.setU16(MENU2911B0.timer, left);
      if (left === 0) confirmed = true;                      // $2912BE beq BACKWARD to $291298
    }
    if (confirmed) {
      ctx.soundPost?.(0x28c6e0);                             // $291298 -- the confirm sound
      ram.setU32(a6 + 0x14,                                  // $2912A4 jsr $246710 / $2912AA
        chainLoader246710(ram, rom, MENU2911B0.confirmRes, ctx) >>> 0);
      ram.setU16(a6 + 0x06, 3);                              // $2912AE
    }
  }

  if (ram.u16(a6 + 0x06) === 3) {                            // $2912C0
    if (chainCheck24681A(ram, ram.u32(a6 + 0x14)) === 0) {   // $2912CE jsr $24681A / $2912D4 bne
      freeAnimObjects246800(ram, ram.u32(a6 + 0x14));        // $2912D8 jsr $246800
      ram.setU8(a5 + 0x02, 2);                               // $2912DE move.b #$2,($2,A5) -- A5, the
                                                             //   OUTER dispatch slot, not A6
    }
  }

  // $2912E4 cmpi.w #$2 / blt $291352 -- states 0 and 1 draw NOTHING. The menu appears only once its
  // script list has run out, which is what makes state 1 an intro rather than a frame of the menu.
  if (u16(ram.u16(a6 + 0x06)) < 2) return;

  // $2912F4 -- the cursor, drawn TWICE: the second copy is shifted $1000 in X and takes palette bit
  // $40. One sprite mirrored into a pair, not two different sprites.
  const pos = rom.u32(MENU2911B0.cursorTable + ram.u16(MENU2911B0.sel) * 4);   // $2912FE
  enqueueRegistersThroughStub(ram, rom, 0x23e08c, pos, MENU2911B0.cursorArt,
    MENU2911B0.cursorAttr, MENU2911B0.cursorPal);            // $291310
  enqueueRegistersThroughStub(ram, rom, 0x23e08c,
    u32(pos + MENU2911B0.mirrorBias), MENU2911B0.cursorArt,  // $291316 addi.w #$1000,D1
    MENU2911B0.cursorAttr, MENU2911B0.cursorPal | MENU2911B0.mirrorPal);   // $29131A ori #$40,D4

  // $291326 -- and the countdown digit, art picked by whole SECONDS. divs.w #$3C then TWO add.w, so
  // the index is (frames / 60) * 4 and the table is longs.
  const secs = Math.floor(ram.u16(MENU2911B0.timer) / MENU2911B0.seconds);     // $29132C divs.w #$3C
  enqueueRegistersThroughStub(ram, rom, 0x23e08c, MENU2911B0.digitPos,
    rom.u32(MENU2911B0.digitTable + secs * 4),               // $29133A move.l (A0,D0.w),D2
    MENU2911B0.digitAttr, MENU2911B0.digitPal);              // $29134C
}

// ---------------------------------------------------------------------------------------------
// OBJECT DISPATCH [7], `$290BE8` -- the dispatcher that owns everything above. W373.
//
// The table entry at $240F9A is `$290BE8, $001E, $0000`: the routine, then a 30-byte record. Its
// work block is NOT the object record though -- `lea $81E0DC,A6` is an absolute address, so slot [7]
// keeps one fixed 64-byte block and the whole subsystem ($81E0F8 the pool cursor, $81E106 the
// banner, $81E108 the loader, $81E112 the menu, $81E118 the flash) lives inside it.
//
// THE SHAPE, once all of it is read, is a PER-PLAYER LOOP:
//
//   state 0   clear the block, COUNT THE PLAYERS into ($10,A6), then restart
//   state 1   inner-dispatch through $290C8E, draw the pool, run the loader, draw the banner
//   state 2   bump the pass counter; if it has not reached the player count, restart for the
//             next player, otherwise stage a create and kill this object
//
// and `$290B4C` is the restart both ends use -- called with `bsr` from state 0 and reached by a
// `bne` from state 2, which is why it is a function here and not inlined into either.
//
// THE INNER TABLE HAS FIVE ENTRIES AND THREE OF THEM ARE THE SAME FUNCTION. $291470, $2917BE and
// $291B3A differ in exactly SIX BYTES -- three `jsr (d16,PC)` displacement words, verified against
// the cartridge -- so they are one driver over three different sequence lists. Which one runs comes
// from $813088/$81308A, the per-player value the tally screen posts: $2 -> 0, $4 -> 1, $6 -> 2, and
// the inner state is that plus one.

export const SLOT7 = Object.freeze({
  entry: 0x290be8, table: 0x240f9a, recSize: 0x1e, dispatch: 0x240f62,
  work: 0x81e0dc, blockWords: 32,        // move.w #$1F,D0 + dbra = 32 passes, so 64 bytes
  stateAt: 0x02,
  innerTable: 0x290c8e, innerEntries: 5,
  bannerTable: 0x290c72, bannerSel: 0x81e106,
  bannerPos: 0x38000000, bannerAttr: 0x1ce0, bannerPal: 0x0001,
  // The counter and its reload on ADJACENT BYTES, armed by ONE word literal -- $290B10 writes
  // move.w #$101, which is count 1 AND reload 1. The port's fourth sighting of this idiom.
  flash: 0x81e118, flashReload: 0x81e119, palShift: 0x81e11a,
  armed: 0x81e0da,
  seqSel: 0x0e, innerAt: 0x08, players: 0x10, pass: 0x12,
  p1: 0x8103e6, p2: 0x810448,
  postD1: Object.freeze([0x813088, 0x81308a]),
  gate: 0x813098,
  seqLists: Object.freeze([0x2914c8, 0x291816, 0x291b92]),
  // NOT kill codes -- these are the DISPATCH TYPES of the screen that runs next. $11 is slot [17]
  // and $0F is slot [15], so slot [7] forks to a different screen depending on the menu's answer.
  nextNormal: 0x0f, nextChosen: 0x11,
  // W389 -- `$241292 lea ($4C,A5),A0`. The object's ID LONG, and `queueKill`'s real argument.
  idAt: 0x4c,
});

/** `$29079E` -- reset the resource loader. Four clears and an rts, and the only thing that puts
 *  `$2907E2` back to state 0 from outside. */
export function resetLoader29079E(ram) {
  ram.setU16(0x81e108, 0);                                   // $29079E
  ram.setU16(0x81e10a, 0);                                   // $2907A6
  ram.setU16(0x81e10c, 0);                                   // $2907AE
  ram.setU32(0x81e10e, 0);                                   // $2907B6 -- a LONG, the handle
}

/** `$290B4C` -- THE RESTART, shared by state 0 (`bsr`) and state 2 (`bne`). It picks which of the
 *  three sequences this player gets and sets the inner state to run it.
 *
 *  The selector is a THREE-WAY MAP, not an index: $813088/$81308A hold $2, $4 or $6 and those map to
 *  0, 1, 2 in `($E,A6)`. Dividing by two would give the same answer for these three inputs and a
 *  different one for everything else, so the compares are transcribed as compares.
 */
export function restart290B4C(ram, rom, a5, ctx) {
  const a6 = SLOT7.work;
  ram.setU8(a5 + SLOT7.stateAt, 1);                          // $290B4C
  poolClear2908E4(ram, rom, ctx);                            // $290B52 jsr $2908E4
  resetLoader29079E(ram);                                    // $290B56 jsr $29079E
  setInnerState2908D2(ram, 0);                               // $290B5A moveq #0 / $290B5C jsr $2908D2
  ram.setU16(SLOT7.bannerSel, 0);                            // $290B60

  // $290B6E -- ONE player reads the two posts by P1's active byte; TWO players read them by the pass
  // counter. Same two addresses, different chooser, which is why both arms are written out.
  let d0;
  if (ram.u16(a6 + SLOT7.players) === 1) {                   // $290B6E cmpi.w #$1,($10,A6)
    d0 = (ram.u8(SLOT7.p1) & 0x80)                           // $290B7E tst.b $8103E6 / bmi
      ? ram.u16(SLOT7.postD1[0]) : ram.u16(SLOT7.postD1[1]); // $290B78 / $290B88
  } else {
    d0 = ram.u16(a6 + SLOT7.pass) === 0                      // $290B98 cmpi.w #$0,($12,A6)
      ? ram.u16(SLOT7.postD1[0]) : ram.u16(SLOT7.postD1[1]); // $290B92 / $290BA2
  }

  if (d0 === 2) ram.setU16(a6 + SLOT7.seqSel, 0);            // $290BA8/$290BB0
  if (d0 === 4) ram.setU16(a6 + SLOT7.seqSel, 1);            // $290BB6/$290BBE
  if (d0 === 6) ram.setU16(a6 + SLOT7.seqSel, 2);            // $290BC4/$290BCC

  // $290BD2 -- and on the FIRST pass it stays in inner state 0. Only the second player onward is
  // dropped straight into a sequence, because the first one has just been set up by state 0.
  if (ram.u16(a6 + SLOT7.pass) === 0) return;                // $290BD2 tst.w / beq
  setInnerState2908D2(ram, u16(ram.u16(a6 + SLOT7.seqSel) + 1));   // $290BDC/$290BE0 addq.w #1
}

/** `$290ACC` -- STATE 0. Clears the block, counts the players, and asks `$2901E0` whether to open
 *  the menu instead of a sequence. */
function state0_290ACC(ram, rom, a5, ctx) {
  const a6 = SLOT7.work;
  ram.setU8(a5 + SLOT7.stateAt, 1);                          // $290ACC
  ram.setU16(SLOT7.armed, 1);                                // $290AD2
  // $290AE0 move.w #$1F,D0 + dbra -- THIRTY-TWO passes, not 31. 64 bytes, which is exactly the
  // block: $81E0DC..$81E11B, so the flash bytes and the palette shift at the far end are included.
  for (let i = 0; i < SLOT7.blockWords; i++) ram.setU16(a6 + i * 2, 0);

  let n = 0;                                                 // $290AF2 moveq #$0,D0
  if (ram.u16(SLOT7.p1) & 0x8000) n++;                       // $290AF4 tst.w / bpl / $290AFE addq
  if (ram.u16(SLOT7.p2) & 0x8000) n++;                       // $290B00 / $290B0A
  ram.setU16(a6 + SLOT7.players, n);                         // $290B0C

  // $290B10 move.w #$101 -- ONE word literal writing TWO byte fields: count $01 at $81E118 and
  // reload $01 at $81E119. Written as the two bytes it is.
  ram.setU8(SLOT7.flash, 0x01);
  ram.setU8(SLOT7.flashReload, 0x01);
  ram.setU16(SLOT7.palShift, 0);                             // $290B18

  screenWipe23C6C6(ram, ctx);                                // $290B20 jsr $23C6C6
  ctx.soundPost?.(0x28c170);                                 // $290B26
  ctx.soundPost?.(0x28c0fc);                                 // $290B2C
  ctx.soundPost?.(0x28c10c);                                 // $290B32
  restart290B4C(ram, rom, a5, ctx);                          // $290B38 bsr $290B4C

  // $290B3C jsr $2901E0 / $290B40 bcc -- carry SET opens the MENU instead of the sequence the
  // restart just chose. ctx.menuGate2901E0 stays as an override so a test can force either arm.
  const open = (ctx.menuGate2901E0 ?? menuGate2901E0)(ram, rom, ctx);
  if (open) setInnerState2908D2(ram, 4);                     // $290B44 moveq #4 / $290B46 jsr $2908D2
}

/** `$290746` -- STATE 2. Either the menu's answer or the end of a player's turn. */
function state2_290746(ram, rom, a5, ctx) {
  const a6 = SLOT7.work;
  if (ram.u16(0x81e116) !== 0) {                             // $290746 tst.w $81E116
    ram.setU16(0x81e116, 0);                                 // $290750
    // $290758 -- THE MENU'S ANSWER. Non-zero restarts this player; zero sets the global gate and
    // kills the object with a different code. $81E112 is the menu's selection word and state 0 of
    // the menu defaults it to 1, so doing nothing takes the restart arm.
    if (ram.u16(0x81e112) !== 0) { restart290B4C(ram, rom, a5, ctx); return; }   // $29075E
    ram.setU16(SLOT7.gate, 1);                               // $290762
    stageCreate(ram, SLOT7.nextChosen,                       // $29076A moveq #$11 -> slot [17]
      (t) => rom.u16(SLOT7.dispatch + t * 8 + 4));           // $29076E jsr $241182
    // W389 -- `$241292` is `lea ($4C,A5),A0` and `$241252 move.l (A0),(A1)` queues the LONG
    // through it, so the argument is the ID. This passed the TYPE WORD, `killById` compared it
    // 16 bits wide against a 32-bit id, never matched, and slot [7] never died.
    queueKill(ram, ram.u32(a5 + SLOT7.idAt));                // $290774 JMP $241292
    return;
  }
  // $29077C -- the pass counter against the PLAYER COUNT. Not a fixed 2: a one-player game runs
  // this once and a two-player game twice.
  const pass = u16(ram.u16(a6 + SLOT7.pass) + 1);            // $29077C addq.w #1,($12,A6)
  ram.setU16(a6 + SLOT7.pass, pass);
  if (pass !== ram.u16(a6 + SLOT7.players)) {                // $290784 cmp.w ($10,A6),D0 / bne
    restart290B4C(ram, rom, a5, ctx);                        // $290788 -> $290B4C
    return;
  }
  stageCreate(ram, SLOT7.nextNormal,                          // $29078C moveq #$F -> slot [15]
    (t) => rom.u16(SLOT7.dispatch + t * 8 + 4));             // $290790 jsr $241182
  queueKill(ram, ram.u32(a5 + SLOT7.idAt));                   // $290796 JMP $241292 -- same fix
}

/** `$290BE8` -- THE DISPATCH ENTRY, and state 1 is its fall-through. */
export function objSlot7(ram, rom, a5, ctx) {
  const st = ram.u8(a5 + SLOT7.stateAt);
  if (st === 0) { state0_290ACC(ram, rom, a5, ctx); return; }      // $290BE8 tst.b / beq $290ACC
  if (st === 2) { state2_290746(ram, rom, a5, ctx); return; }      // $290BF0 cmpi.b #$2 / beq

  const a6 = SLOT7.work;                                     // $290BFA lea $81E0DC,A6
  const inner = ram.u16(a6 + SLOT7.innerAt);                 // $290C06 move.w ($8,A6),D0
  switch (inner) {                                           // $290C12 jsr (A4)
    case 0: innerState0_290E9E(ram, rom, ctx, a5, a6); break;             // $290E9E
    case 1: case 2: case 3:                                              // the triplicate driver
      sequenceDriver291470(ram, rom, ctx, a5, a6, SLOT7.seqLists[inner - 1]); break;
    case 4: menu2911B0(ram, rom, a5, a6, ctx); break;                    // $2911B0
    default:
      unreached(SLOT7.innerTable, `slot [7] inner state ${inner}, but $290C8E has FIVE entries `
        + `and entry [5] is $00030000, which is data. The state word was written by something `
        + `other than $2908D2`);
  }
  poolDraw290946(ram, rom, ctx);                             // $290C14 jsr $290946
  resourceLoader2907E2(ram, rom, ctx);                       // $290C18 jsr $2907E2

  // $290C1C -- the banner, and index 0 is NOT an entry: the beq returns before the lea is indexed,
  // which is why $290C72[0] is $00000000 and never read.
  const sel = ram.u16(SLOT7.bannerSel);
  if (sel === 0) return;                                     // $290C22 beq
  enqueueRegistersThroughStub(ram, rom, POOL7.stubZero, SLOT7.bannerPos,
    rom.u32(SLOT7.bannerTable + sel * 4), SLOT7.bannerAttr,  // $290C32 / $290C3A
    u16(SLOT7.bannerPal + ram.u16(SLOT7.palShift)));         // $290C42 add.w $81E11A,D4

  // $290C4E subq.b #1 / bcc -- the reload fires on the BORROW, so it happens on the frame the byte
  // was already 0, one frame later than "when it reaches 0" would give.
  const before = ram.u8(SLOT7.flash);
  ram.setU8(SLOT7.flash, (before - 1) & 0xff);
  if (before !== 0) return;                                  // $290C54 bcc -- no borrow
  ram.setU8(SLOT7.flash, ram.u8(SLOT7.flashReload));         // $290C58 -- the adjacent reload byte
  ram.setU16(SLOT7.palShift, u16(ram.u16(SLOT7.palShift) + 1) & 1);   // $290C62/$290C68 andi.w #$1
}

/** `$2539A2` / `$2539D6` -- the P1 and P2 halves of one clear. Eight `move.w D0,<abs>` each after a
 *  `moveq #$0,D0`, and the two lists interleave: $81B63E/$81B640, $81B646/$81B648, and so on. One
 *  routine per side rather than one routine with a side argument, because the addresses are absolute.
 *  `$253A0A` and `$253A14` clear the THIRD word of each list on its own. */
export const GATE_CLEARS = Object.freeze({
  p1: Object.freeze([0x81b63e, 0x81b646, 0x81b64a, 0x81b64e, 0x81b654, 0x81b658, 0x81b660, 0x81b6e0]),
  p2: Object.freeze([0x81b640, 0x81b648, 0x81b64c, 0x81b650, 0x81b656, 0x81b65a, 0x81b6a0, 0x81b6e2]),
  oneP1: 0x81b646, oneP2: 0x81b648,
});

export function clear2539A2(ram) { for (const a of GATE_CLEARS.p1) ram.setU16(a, 0); }   // $2539A2
export function clear2539D6(ram) { for (const a of GATE_CLEARS.p2) ram.setU16(a, 0); }   // $2539D6
export function clear253A0A(ram) { ram.setU16(GATE_CLEARS.oneP1, 0); }                   // $253A0A
export function clear253A14(ram) { ram.setU16(GATE_CLEARS.oneP2, 0); }                   // $253A14

/** The six values `$2901E0` weighs, and the two globals that veto it outright. */
export const GATE2901E0 = Object.freeze({
  addr: 0x2901e0,
  vetoA: 0x813098, vetoB: 0x80393a, liveMask: 0x813090, liveBoth: 0x03,
  beeCursor: 0x817f82, beeLimit: 0x0c,
  bombP1: 0x812940, bombP2: 0x812942, bombLimit: 0x03,
  digitP1: 0x81b49a, digitP2: 0x81b49e,
  dropP1: 0x812938, dropP2: 0x81293a, dropLimit: 0x02,
  markP1: 0x812948, markP2: 0x81294a,
  livesSign: 0x8130be,
  hyperEndP1: 0x285af2, hyperEndP2: 0x285c1c,
  scratch: 0x81b6e4,
});

/** `$2901E0` -- WHETHER SLOT [7] OPENS ITS MENU. Returns the routine's CARRY: true is `ori.w #$1,SR`
 *  at `$2902BC`, false is `andi.w #$FFFE,SR` at `$2902B6`.
 *
 *  It is a predicate with SIDE EFFECTS, and the two do not overlap: the six calls and the eight-word
 *  clears touch the hyper and bomb blocks, while the answer comes only from `$813098`, `$80393A`,
 *  `$813090` and four counters. That is why the two unported calls below cannot change what this
 *  returns. Both of them are real calls now: $285AF2 and its P2 mirror $285C1C are hyper.js's
 *  endHyper285AF2, which already covered every instruction the sweep found.
 *
 *  THE SIDE IS CHOSEN BY A SIGN TEST ON `$8130BE`, and PLUS keeps P1. Every other side-select in
 *  this port reads `$8103E6`'s sign, so reaching for that here picks the wrong player whenever P1 is
 *  still alive but not the one being asked about.
 *
 *  THE THREE FINAL COMPARES ARE AN `OR`, NOT AN `AND`. `bcc`/`bcs` each jump straight to the
 *  carry-SET exit, so ANY ONE of them opening is enough; only falling past all three clears carry.
 */
export function menuGate2901E0(ram, rom, ctx) {
  if (ram.u16(GATE2901E0.vetoA) !== 0) return false;         // $2901E0 tst.w $813098 / bne $2902B6
  if (ram.u16(GATE2901E0.vetoB) !== 0) return false;         // $2901EA tst.w $80393A / bne $2902B6

  clear253A0A(ram);                                          // $2901F4 jsr $253A0A
  clear253A14(ram);                                          // $2901FA jsr $253A14
  // $285AF2 was ALREADY PORTED, as hyper.js's endHyper285AF2 -- the fourth routine this port
  // "needed" that turned out to exist under its own name, after $243DD0, $24652A and $24641A. It
  // already covers the $81B6FA store, $25329A's bclr and beam reset, the four clears, $286ED6
  // through its redrawStock hook and the $2875B4 tail: every instruction the sweep found.
  const stock = (n) => hyperStock286ED6(ram, rom, ctx, n);
  if (ram.u16(0x81b63e) !== 0) {                             // $290200 tst.w $81B63E / beq
    endHyper285AF2(ram, rom, ctx, false, stock);             // $29020A jsr $285AF2
  }
  clear2539A2(ram);                                          // $290210 jsr $2539A2
  if (ram.u16(0x81b640) !== 0) {                             // $290216 tst.w $81B640 / beq
    endHyper285AF2(ram, rom, ctx, true, stock);              // $290220 jsr $285C1C -- the P2 mirror
  }
  clear2539D6(ram);                                          // $290226 jsr $2539D6
  ram.setU16(GATE2901E0.scratch, 0);                         // $29022C clr.w $81B6E4

  // $290232 -- both sides live vetoes the menu.
  if (ram.u16(GATE2901E0.liveMask) === GATE2901E0.liveBoth) return false;

  const d0 = ram.u16(GATE2901E0.beeCursor);                  // $29023E -- NOT per side
  let d1 = ram.u16(GATE2901E0.bombP1);                       // $290244
  let d2 = ram.u16(GATE2901E0.digitP1);                      // $29024A
  let d3 = ram.u16(GATE2901E0.dropP1);                       // $290250
  let mark = GATE2901E0.markP1;                              // $290256 lea $812948,A0
  if ((ram.u16(GATE2901E0.livesSign) & 0x8000) !== 0) {      // $290262 tst.w $8130BE / bpl $29028A
    d1 = ram.u16(GATE2901E0.bombP2);                         // $29026C
    d2 = ram.u16(GATE2901E0.digitP2);                        // $290272
    d3 = ram.u16(GATE2901E0.dropP2);                         // $290278
    mark = GATE2901E0.markP2;                                // $29027E
  }

  if (d2 !== 0) return false;                                // $29028A tst.w D2 / bne $2902B6

  // $290290 -- the mark is written when D3 is zero, OR when D3 is set but D1 is zero. It is a
  // `move.w #$1,(A0)`, a store THROUGH the pointer, not a register load.
  if (d3 === 0 || d1 === 0) ram.setU16(mark, 1);             // $29029C move.w #$1,(A0)

  if (d0 >= GATE2901E0.beeLimit) return true;                // $2902A0 cmpi.w #$C,D0 / bcc $2902BC
  if (d3 < 2) return true;                                   // $2902A8 cmpi.w #$2,D3 / bcs $2902BC
  if (d1 < 3) return true;                                   // $2902B0 cmpi.w #$3,D1 / bcs $2902BC
  return false;                                              // $2902B6 andi.w #$FFFE,SR
}
