// OBJECT DISPATCH ENTRY [5] -- `$28B5E0`, priority $18, one of the eight live
// slots in the top-level table.  Wave 5 called it "the one that owns the
// weapons" and counted "15 subsystem calls"; `05-review.md` re-counted and got
// 23, and 23 is right:
//
//   28b5e0: tst.b ($2,A5) / beq $28b5a8
//   28b5e6: jsr $289b80   $2634f4   $28ad54   $27f95a   $288e4e   $2890f2
//           $255dd8   >>> $253A70 <<<   $24c096   $254680   $255042   $28a098
//           $2527ce   $24a458   $24a46c   $24a440   $24a44c   $27e99e
//           $252bd0   $281d9a   $25354c   $25292a   $252a52
//   28b670: tst.w $81308c / beq $28b730 ...
//
// THIS FILE PORTS EXACTLY ONE OF THE TWENTY-THREE -- `$253A70`, the player-shot
// driver -- AND COUNTS THE OTHER TWENTY-TWO.  That is a deliberate choice with
// a cost, and the cost is stated here rather than discovered by a reader:
//
//  * A partial handler is not a handler.  Anything the other twenty-two write
//    is missing from the port, so any compared column that depends on them
//    diverges.  The gate's answer to that is to compare the SHOT TABLE SLOTS
//    THE PLAYER'S OWN SPAWN CAN REACH (slots 14..17 and 21..24) and nothing
//    else in that table -- the option pods' shots go into slots 7..12 through
//    $24C096, which is one of the twenty-two.
//  * `$28B5E0`'s own entry test `tst.b ($2,A5) / beq $28B5A8` is translated,
//    because a handler that ran when the board's did not would be worse than
//    one that does less.
//  * The twenty-two are counted through `UnportedLog`, so a run always prints
//    what it did NOT do next to what it did.  Wave 4 set that precedent for
//    whole dispatch entries; this is the first time it is used INSIDE one, and
//    it is louder because of it: the log line says "22 of 23".
//
// $28B5A8 (the `beq` target) is not translated either -- it is the not-yet-
// started branch and it is a named throw if ($2,A5) is ever 0.

import { unreached } from './unported.js';
import { runShotDriver } from './weapons.js';
import { shotHandlers } from './shots.js';

export const TYPE5 = {
  handler: 0x28b5e0,
  entryTest: 0x28b5e0,      // tst.b ($2,A5)
  notStarted: 0x28b5a8,
  shotDriver: 0x253a70,     // $28B610 -- the ONE call this port makes
  /** The 23 `jsr` targets in ROM order, read from `xref.py dasm 28B5E0 180`. */
  calls: [
    0x289b80, 0x2634f4, 0x28ad54, 0x27f95a, 0x288e4e, 0x2890f2, 0x255dd8,
    0x253a70, 0x24c096, 0x254680, 0x255042, 0x28a098, 0x2527ce, 0x24a458,
    0x24a46c, 0x24a440, 0x24a44c, 0x27e99e, 0x252bd0, 0x281d9a, 0x25354c,
    0x25292a, 0x252a52,
  ],
};

/** Handlers this module dispatches to, built once per Game. */
export function makeType5(rom) {
  const handlers = shotHandlers();
  return function type5(ram, slot, index, ctx) {
    if (ram.u8(slot + 2) === 0) {                       // $28B5E0 tst.b ($2,A5)
      unreached(TYPE5.notStarted, `object type 5's "not started" branch `
        + `($28B5E0 tst.b ($2,A5) / beq $28B5A8) -- ($2,A5) is 0. MEASURED `
        + `non-zero on every frame of the compared window`);
    }
    for (const c of TYPE5.calls) {
      if (c === TYPE5.shotDriver) {
        ctx.shotsProcessed = runShotDriver(ram, rom, handlers, ctx);  // $28B610
      } else {
        ctx.unportedLog.note(c, `object type 5 ($28B5E0) subsystem call -- `
          + `22 of its 23 jsr targets are unported; only $253A70, the `
          + `player-shot driver, is`);
      }
    }
    // $28B670 `tst.w $81308c / beq $28B730` and everything after it -- the
    // two-player shot/laser interaction block at $28B67A.  Counted, not run.
    ctx.unportedLog.note(0x28b670, `object type 5's tail ($28B670 onwards, `
      + `gated on $81308C)`);
  };
}
