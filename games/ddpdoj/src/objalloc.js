// THE OBJECT TABLE'S ALLOCATOR, COMMIT AND KILL -- `$241182`, `$24111E`,
// `$2411E2`, `$241238`, `$241262`, and the two memmoves `$2410F2` / `$24110A`.
//
// Wave 4 left all of this as a LOUD NAMED THROW (`ctx.queueNotEmpty`), which was
// the right call then: the fly-around scenario is scripted so that nothing
// spawns or dies, and `objlive` is constant at 8 across its whole compared
// window.  The moment a weapon fires or an enemy dies that stops being true, so
// wave 5 translates it.
//
// THE BRIEF IS EXPLICIT ABOUT WHY: "Preserve what the board does when object
// allocation FAILS -- that is gameplay, not an edge case."  There are FOUR
// distinct failure paths in this file and no two of them behave the same:
//
//   1. $2411D4  the pending-CREATE queue is full (20 records staged this
//               frame).  Returns a DUMMY RECORD at $80D51C and D0 = 0.  The
//               caller fills the dummy in; the object never enters the table;
//               the spawn is SILENTLY DROPPED.  Nothing is evicted, nothing is
//               signalled beyond D0.
//   2. $24116E  the priority walk ran off the end of all 20 slots without
//               finding one whose priority is <= the new object's.  Control
//               falls through to $241172 and the staged record is DISCARDED.
//               Second silent drop, and a different one.
//   3. $241158  the table was FULL but the new object DID out-rank a slot.
//               The insert memmoves the tail DOWN one slot, so SLOT 19'S
//               CONTENTS ARE OVERWRITTEN AND LOST.  A higher-priority spawn
//               destroys the lowest-priority object with no notification.
//   4. $241246  the pending-KILL queue is full (20 requests).  The kill request
//               is SILENTLY DROPPED -- the object stays alive.
//
// Two quirks that a port would "fix" if it were not translating:
//
//   * $2411FC `cmp.w D0,D1` compares the object's unique ID as a WORD, although
//     $2411CA stores it as a LONGWORD from the 32-bit counter $80E882.  So IDs
//     ALIAS EVERY 65,536 SPAWNS and a delete can match the wrong object.  The
//     port does the same word compare, deliberately.
//   * $241254 steps the kill queue's write pointer by $50 per entry although
//     each entry is only a LONGWORD.  The queue therefore occupies
//     $80DBFE + k*$50 and its cap of $640 is 20 entries, not 320.  And
//     $24126C decrements BEFORE reading, so kills drain LIFO -- the LAST
//     request queued is the FIRST one applied.
//
// Everything above was read from `xref.py dasm` on the decrypted image in this
// wave, not inherited: $2410F2, $24110A, $24111E..$241180, $241182..$2411E0,
// $2411E2..$241236, $241238..$241260, $241262..$241290.

import { RAM } from './machine.js';
import { u16 } from './ram.js';

export const ALLOC = {
  table: 0x80e240,          // $241138 lea $80E240,A1
  tableEnd: 0x80e880,       // $241150 move.l #$80E880,D3 -- the literal end
  slots: 20,                // $24113E moveq #$13,D6
  stride: 0x50,             // $24116A lea ($50,A1),A1
  dispatch: 0x240f62,       // $241198 lea ($240F62,PC),A0
  createStage: 0x80d56c,    // $2411A0 lea $80D56C,A0
  createSp: 0x80dbac,       // $241186 move.w $80DBAC,D2 -- a BYTE offset
  createCap: 0x640,         // $24118C cmpi.w #$640,D2 = 20 records of $50
  createDummy: 0x80d51c,    // $2411D4 lea $80D51C,A0 -- the FULL-queue dummy
  idCounter: 0x80e882,      // $2411BE addq.l #1,$80E882
  killQueue: 0x80dbfe,      // $24124A lea $80DBFE,A1
  killSp: 0x80e23e,         // $24123C move.w $80E23E,D2
  killCap: 0x640,           // $241242 cmpi.w #$640,D2
  // record fields
  typeOff: 0x00,            // $2411AC move.w D0,(A0), with #$8000 or'd in
  priOff: 0x4a,             // $2411B2 move.w D1,($4A,A0)
  idOff: 0x4c,              // $2411CA move.l D0,($4C,A0)
};

/** Every outcome this file can produce, by name, so a caller (and a test) can
 *  assert WHICH failure happened rather than "it did not work". */
export const ALLOC_RESULT = {
  OK: 'ok',
  QUEUE_FULL: 'create-queue-full',        // $2411D4
  DROPPED_NO_SLOT: 'dropped-no-slot',     // $24116E fall-through
  EVICTED_SLOT19: 'evicted-slot-19',      // $241158 memmove down
  KILL_QUEUE_FULL: 'kill-queue-full',     // $241246
};

/** $2410F2 -- memmove DOWN by one slot, longwords, backwards.
 *  A2 = dst end, A3 = src end, D3 = byte count; `lsr.l #2` makes it a longword
 *  count and `move.l -(A3),-(A2)` walks backwards, which is what makes an
 *  overlapping downward move safe. */
function memmoveDown(ram, dst, src, bytes) {
  for (let o = bytes - 4; o >= 0; o -= 4) ram.setU32(dst + o, ram.u32(src + o));
}

/** $24110A -- memmove UP, longwords, forwards (`move.l (A3)+,(A2)+`). */
function memmoveUp(ram, dst, src, bytes) {
  for (let o = 0; o < bytes; o += 4) ram.setU32(dst + o, ram.u32(src + o));
}

/**
 * $241182 -- stage a CREATE.  `type` is the dispatch index; the priority is
 * read out of the dispatch table's `+$4` word, never passed in.
 * @returns {{addr:number, ok:boolean, result:string}} `addr` is the record the
 *   caller is expected to fill in -- the staging slot on success, the DUMMY at
 *   $80D51C on failure, exactly as the ROM returns it in A0.
 */
export function stageCreate(ram, type, dispatchPri) {
  const sp = ram.u16(ALLOC.createSp);                       // $241186
  if (sp >= ALLOC.createCap) {                              // $24118C bge
    return { addr: ALLOC.createDummy, ok: false,            // $2411D4
      result: ALLOC_RESULT.QUEUE_FULL };
  }
  const pri = dispatchPri(type);                            // $24119C ($4,A0,D1)
  const a = ALLOC.createStage + sp;                         // $2411A6 adda.w D2,A0
  ram.setU16(a + ALLOC.typeOff, u16(type | 0x8000));        // $2411A8/$2411AC
  ram.setU16(a + 0x02, 0);                                  // $2411AE clr.w ($2,A0)
  ram.setU16(a + ALLOC.priOff, u16(pri));                   // $2411B2
  ram.setU16(ALLOC.createSp, u16(sp + ALLOC.stride));       // $2411B6
  // $2411BE: the ID counter is a LONGWORD and is incremented BEFORE the store,
  // so the first object of a run gets ID 1, not 0.
  const id = (ram.u32(ALLOC.idCounter) + 1) >>> 0;
  ram.setU32(ALLOC.idCounter, id);
  ram.setU32(a + ALLOC.idOff, id);                          // $2411CA
  return { addr: a, ok: true, result: ALLOC_RESULT.OK };
}

/**
 * $24111E -- drain the pending-CREATE queue into the table, in DESCENDING
 * priority order.  Called FIRST thing in the object driver, before the walk.
 * @returns {string[]} one ALLOC_RESULT per staged record, in queue order.
 */
export function commitCreates(ram) {
  const out = [];
  if (ram.u16(ALLOC.createSp) === 0) return out;            // $24111E tst/beq
  let a0 = ALLOC.createStage;                               // $241128
  for (;;) {
    if (ram.u16(a0) !== 0) {                                // $24112E tst.w (A0)
      const d5 = ram.i16(a0 + ALLOC.priOff);                // $241134
      let a1 = ALLOC.table;                                 // $241138
      let placed = false;
      for (let i = 0; i < ALLOC.slots; i++) {               // $24113E moveq #$13
        // $241140 cmp.w ($4A,A1),D5 / $241144 blt -> keep looking.  `blt` is
        // SIGNED, so the priority word is signed here even though every value
        // in the dispatch table is $09..$1F.
        if (d5 < ram.i16(a1 + ALLOC.priOff)) {
          a1 += ALLOC.stride;                               // $24116A
          continue;
        }
        // $241148..$241158 -- SHIFT THE TAIL DOWN ONE SLOT.  D3 = $80E880 -
        // (slot + $50) bytes, moved from slot to slot+1.  The record that was
        // in the LAST slot is overwritten and lost.
        const bytes = ALLOC.tableEnd - (a1 + ALLOC.stride);
        const lastWasLive = ram.u16(ALLOC.tableEnd - ALLOC.stride) !== 0;
        memmoveDown(ram, a1 + ALLOC.stride, a1, bytes);
        // $24115A..$241164 -- 40 words = the whole $50-byte record.
        for (let w = 0; w < 40; w++) ram.setU16(a1 + w * 2, ram.u16(a0 + w * 2));
        out.push(lastWasLive ? ALLOC_RESULT.EVICTED_SLOT19 : ALLOC_RESULT.OK);
        placed = true;
        break;
      }
      // $24116E dbra runs out -> $241172: the staged record is DISCARDED and
      // nothing anywhere is told.
      if (!placed) out.push(ALLOC_RESULT.DROPPED_NO_SLOT);
    }
    a0 += ALLOC.stride;                                     // $241172
    const sp = u16(ram.u16(ALLOC.createSp) - ALLOC.stride);  // $241176 subi.w
    ram.setU16(ALLOC.createSp, sp);
    if (sp === 0) break;                                    // $24117E bne
  }
  return out;
}

/**
 * $2411E2 -- delete the object whose ID matches, memmoving the tail UP and
 * clearing the now-vacant LAST slot.
 * NOTE THE WORD COMPARE at $2411FC (see the header): a longword ID compared 16
 * bits wide.  Translated as written.
 */
export function killById(ram, id) {
  if ((id >>> 0) === 0) return false;                       // $2411E6 tst.l/beq
  let a0 = ALLOC.table;                                     // $2411EC
  for (let i = 0; i < ALLOC.slots; i++) {                   // $2411F2 moveq #$13
    if (ram.u16(a0) !== 0                                   // $2411F4 tst.w (A0)
      && u16(ram.u32(a0 + ALLOC.idOff)) === u16(id)) {      // $2411FC cmp.w
      const bytes = ALLOC.tableEnd - (a0 + ALLOC.stride);   // $241204..$241210
      memmoveUp(ram, a0, a0 + ALLOC.stride, bytes);         // $241212
      const lastSlot = ALLOC.tableEnd - ALLOC.stride;       // $241216 adda.w D3,A2
      ram.setU16(lastSlot, 0);                              // $241218
      ram.setU16(lastSlot + ALLOC.priOff, 0);               // $24121A
      ram.setU32(lastSlot + ALLOC.idOff, 0);                // $24121E
      return true;
    }
    a0 += ALLOC.stride;                                     // $24122A
  }
  return false;
}

/** $241238 -- push a kill request.  The queue's write pointer steps by $50 per
 *  LONGWORD entry (see the header), and a full queue drops the request. */
export function queueKill(ram, id) {
  const sp = ram.u16(ALLOC.killSp);                         // $24123C
  if (sp >= ALLOC.killCap) return ALLOC_RESULT.KILL_QUEUE_FULL;  // $241242 bge
  ram.setU32(ALLOC.killQueue + sp, id >>> 0);               // $241250/$241252
  ram.setU16(ALLOC.killSp, u16(sp + ALLOC.stride));         // $241254
  return ALLOC_RESULT.OK;
}

/**
 * `$241298` -- RESOLVE A HANDLE TO ITS RECORD, or the dummy.  W295.
 *
 *   24129c: lea $80E240,A0 / moveq #$13,D1
 *   2412a4: move.l ($4C,A0),D2 / beq $2412BC     <- id 0 is a FREE slot, skipped
 *   2412ac: cmp.l D2,D0 / bne $2412BC
 *   2412b2: pop / andi #$FFFE,SR / rts            FOUND -- carry CLEAR, A0 = the record
 *   2412bc: lea ($50,A0),A0 / dbra D1
 *   2412c4: lea $80D51C,A0 / pop / ori #$1,SR     MISSED -- carry SET, A0 = the DUMMY
 *
 * **A MISS IS NOT AN ERROR AND MUST NOT THROW.** It hands back `ALLOC.createDummy` --
 * the same `$80D51C` `stageCreate` returns on a full queue -- so a caller that writes
 * through the result scribbles on the dummy and the game carries on. That is the
 * cartridge's own behaviour for "the object I was holding has already died", which is a
 * normal thing to happen between one frame and the next, so the port returns the dummy
 * rather than inventing an error the ROM does not have.
 *
 * `beq` on the id means **slot 0 is skipped as free**, so a handle of 0 never matches a
 * live object -- which is why a dropped handle reads as "gone" rather than as slot one.
 *
 * @returns {{rec:number, found:boolean}} `found` is the inverse of the C flag.
 */
export function resolveHandle241298(ram, id) {
  for (let i = 0; i < ALLOC.slots; i++) {
    const a = ALLOC.table + i * ALLOC.stride;             // $2412BC lea ($50,A0),A0
    const d2 = ram.u32(a + ALLOC.idOff);                     // $2412A4 move.l ($4C,A0),D2
    if (d2 === 0) continue;                                  // $2412A8 beq -- a free slot
    if (d2 === (id >>> 0)) return { rec: a, found: true };   // $2412AC cmp.l / $2412B2
  }
  return { rec: ALLOC.createDummy, found: false };           // $2412C4 lea $80D51C,A0
}

/** $241262 -- drain the kill queue.  LIFO: $24126C subtracts $50 FIRST and then
 *  reads, so the last request queued is the first applied. */
export function commitKills(ram) {
  let n = 0;
  while (ram.u16(ALLOC.killSp) !== 0) {                     // $241262 / $241288
    const sp = u16(ram.u16(ALLOC.killSp) - ALLOC.stride);   // $24126C
    ram.setU16(ALLOC.killSp, sp);
    killById(ram, ram.u32(ALLOC.killQueue + sp));           // $241280/$241284
    n++;
  }
  return n;
}
