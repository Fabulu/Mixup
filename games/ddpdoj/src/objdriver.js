// THE TOP-LEVEL OBJECT DRIVER -- main-loop call #2, `$2410BC` (build B; build A
// has the identical shape at `$1413FE`).  Located by measurement in wave 2:
// `phase.lua` attributed every main-RAM write to the main-loop call it happened
// in, which put every object writer in call 2 and every sprite-list writer in
// call 4; `xref.py callers 2410BC` then found exactly one caller, `$23BFE8`.
//
//   $2410BC bsr $241262          drain the pending-KILL queue
//   $2410C0 bsr $24111E          drain the pending-CREATE queue (priority insert)
//   $2410C4 lea $80E240,A5       THE OBJECT TABLE
//   $2410CA moveq #$13,D0        20 SLOTS
//   $2410CC move.w (A5),D1       slot type word; 0 = empty
//   $2410CE beq  $2410E8
//   $2410D0 andi.w #$ff,D1
//   $2410D4 lsl.w #3,D1
//   $2410D6 move.l A5,-(A7)
//   $2410D8 move.w D0,-(A7)      <- the oracle's per-slot execution hook.  A
//   $2410DA lea ($240F62,PC),A0     WORD push: one bus cycle, one execution.
//   $2410DE movea.l (A0,D1.w),A0     Hooking the move.l at $2410D6 instead
//   $2410E2 jsr (A0)                 reports exactly DOUBLE and looks entirely
//   $2410E4 move.w (A7)+,D0          plausible -- the program space is 16 bits
//   $2410E6 movea.l (A7)+,A5         wide, so a longword write fires twice.
//   $2410E8 lea ($50,A5),A5      STRIDE $50
//   $2410EC dbra D0,$2410CC
//
// THE ORDER IS SEMANTICS, not an implementation detail.  The create queue
// inserts in descending priority (+$4A) and MEMMOVES THE TAIL DOWN, so a
// higher-priority spawn into a full table destroys slot 19 silently; deletion
// memmoves UP.  Slot indices are not stable identities.  That is why the
// oracle's `objord` hashes the SEQUENCE of slot indices dispatched and not a
// set, and why this walk is a plain forward walk with a budget rather than
// anything cleverer.

import { RAM } from './machine.js';

export const OBJ = {
  base: RAM.objTable,      // $80E240   ($2410C4 lea)
  slots: 20,               //           ($2410CA moveq #$13 then dbra)
  stride: 0x50,            //           ($2410E8 lea ($50,A5),A5)
  typeOff: 0x00,           // 0 = empty; | $8000 marks a freshly created record
  priOff: 0x4a,
  idOff: 0x4c,
};

/** FNV-1a-64 over the dispatched sequence, mixing `(slot << 16) | typeWord`
 *  exactly as `frame.lua`'s objslot tap does, so `objord` is directly
 *  comparable between the port and the board.  ORDER, never a set or a sum:
 *  under a hypothetical case (C) the order is what changes. */
export class ObjOrder {
  constructor() { this.reset(); }
  reset() { this.h = 0xcbf29ce484222325n; this.n = 0; }
  push(slot, typeWord) {
    const k = BigInt(((slot << 16) | typeWord) >>> 0);
    this.h = BigInt.asUintN(64, (this.h ^ k) * 0x100000001b3n);
    this.n++;
  }
  /** frame.lua prints `objord & 0x7fffffffffffffff`. */
  get value() { return this.h & 0x7fffffffffffffffn; }
}

/**
 * One pass of `$2410BC`.
 * @param handlers  Map from type byte to fn(ram, slotAddr, slotIndex).
 *                  A missing type is NOT an error here -- the object table
 *                  holds enemies and stage logic this wave does not implement.
 *                  Every dispatch of an unimplemented type is COUNTED so a
 *                  comparison can never silently be against a driver that did
 *                  nothing (see unported.js).
 */
export function runObjectDriver(ram, handlers, ctx) {
  const { budget, unportedLog, order } = ctx;
  order.reset();
  // $2410BC / $2410C0: the kill and create queues.  Wave 4 spawns and kills
  // nothing, and the scenario is scripted so that the game does not either --
  // MEASURED: `objlive` is constant across the whole fly-around window.  A
  // non-empty queue at entry means that assumption broke, and it must stop the
  // run rather than be drained by code nobody wrote.
  if (ram.u16(0x80dbac) !== 0) {
    ctx.queueNotEmpty(0x24111e, 'pending-CREATE queue non-empty');
  }
  if (ram.u16(0x80e23e) !== 0) {
    ctx.queueNotEmpty(0x241262, 'pending-KILL queue non-empty');
  }
  let processed = 0;
  for (let i = 0; i < OBJ.slots; i++) {                 // $2410CA .. $2410EC
    const slot = OBJ.base + i * OBJ.stride;             // $2410E8
    const type = ram.u16(slot + OBJ.typeOff);           // $2410CC move.w (A5),D1
    if (type === 0) continue;                           // $2410CE beq
    // THE BUDGET, checked in the ORIGINAL ORDER and before the dispatch, which
    // is the only place a case (C) could bite.  It never triggers today; see
    // budget.js for the measurement that says so and why it is here anyway.
    if (budget.exhausted) {
      budget.truncate(0x2410e2, `object slot ${i} (type $${(type & 0xff).toString(16)})`);
    }
    const t = type & 0xff;                              // $2410D0 andi.w #$ff
    order.push(i, type);                                // $2410D8, the hook
    processed++;
    const h = handlers.get(t);
    if (h) h(ram, slot, i, ctx);
    else unportedLog.note(0x240f62 + t * 8,
      `object dispatch entry [${t}] -- handler not ported in wave 4`);
    // The per-slot cost the budget accounts in.  ONE unit per dispatched slot,
    // deliberately crude: there is no calibration to be faithful to yet, and a
    // fabricated per-type cost would look like a measurement.
    budget.charge(1);
  }
  return processed;
}
