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
//
// ------------------------------------------------------- WAVE 9: THE LASER
//
// A play report: "holding the fire button does nothing, does not throw, does
// not freeze."  It was diagnosed here, and this is where the fix goes.
//
// The held bit ARRIVES -- measured, 400 held frames give `$803970` bit 4 set on
// 400 of them.  The shot cadence machine reads the EDGE mirror `$803972`
// ($249B48 `btst #$4,($19,A6)`), which is the BOARD's own behaviour, so "one
// burst on press and then quiet" is faithful and not a bug.
//
// What the board ALSO does with a held fire button, and this port does not, is
// the LASER SPEED RAMP, measured in wave 4 §4 on scenario `speedmodes`:
//
//   Button 1 held -> ($1a,A4) 22 -> 21 -> ... -> 12, one step every 4 frames
//                    (applied dY 246 -> 134); released -> back up, one per frame
//   the writers:   $24C8CE `subq.b #1,($1a,A4)` and $24C900 `addq.b #1,($1a,A4)`
//   the routines:  $24C8BE (down) and $24C8E4 (up), A4 = the PLAYER record,
//                  A6 = the OPTION record
//
// and both live inside `$24C096` -- the option object, called from `$28B616`,
// which is ONE OF THE 22 THIS FILE COUNTS AND DOES NOT RUN.  `$24C8BE` has no
// absolute-long caller (checked: it is reached PC-relative from inside
// $24C096), so nothing in the port could ever have reached it.
//
// SO THE ANSWER WAS (b): the path is reached and quietly does nothing.  The
// silence had a second half, which is why the page's author expected a throw
// that never came: the spawn's laser selector is `btst #$0,($1,A6)` on the
// player record ($249C1C/$249C32), the flag is READ in four places in `src/`
// and WRITTEN IN NONE, so `laser` in `shots.js` is permanently whatever the
// seed says (0), and the `$254078` throw sitting behind it is unreachable.
//
// The 22 calls cannot ALL become throws -- they run every frame regardless of
// input, and a throw there is a page that never boots.  So the throw is put on
// exactly the condition under which the board's ramp WOULD MOVE SOMETHING, and
// it counts the hold first: `$24C8C8 subq.b #1,($4b,A6) / bne` reloads ($4b,A6)
// to ((($5a,A4)-2)>>1)+4 = 4 for the measured formation 2, so a tap of 1..3
// frames never moves ($1a,A4) and the port is not diverging yet.  On the FOURTH
// consecutive held frame it would, and that is where this throws.
//
// That threshold is also what keeps wave 8's work reachable from the page:
// `stage1-shot` fires SINGLE-FRAME taps every 20 logic frames, so the gate
// never trips it, and a player can still tap to run the ported spawn.

// ------------------------------------------------------- WAVE 12: THE ANSWER
//
// Wave 9's throw was on the SPEED RAMP and the combat recon measured two things
// wrong with it (10-recon-combat §2):
//
//   * it fired on the FOURTH held frame, whereas the board's laser gate
//     `$24C164 btst #4,($40,A6)` is entered on the FIRST; and
//   * `speedIdx !== laserFloor` meant A PLAYER ALREADY AT THE SPEED FLOOR COULD
//     HOLD FIRE AND STILL GET SILENCE -- the exact failure the throw existed to
//     prevent, narrowed instead of removed.
//
// The gate is now the board's own: the raw held bit, `RAM.p1raw & $10`, reaching
// `$24C164` through `$24C134`'s byte copy, with NO speed-index condition.  The
// throw lives in `src/options.js` where the instruction is, not here, because
// the option object is now RUN rather than counted -- and running it is what
// turns "the pods are spliced" into "the pods are computed".
//
// `laserRampWouldMove` survives as a PURE PREDICATE with no callers in the
// shipped path: the ramp is real, `rampUp` in options.js ports its other half,
// and tests still pin its shape.  It is no longer a gate on anything.

import { unreached } from './unported.js';
import { runShotDriver } from './weapons.js';
import { shotHandlers } from './shots.js';
import { runOptionObject } from './options.js';
import { drawShip, drawShipAlt, SHIP_MUTATE } from './shipsprite.js';
import { RAM, ROM } from './machine.js';

export const TYPE5 = {
  handler: 0x28b5e0,
  entryTest: 0x28b5e0,      // tst.b ($2,A5)
  notStarted: 0x28b5a8,
  shotDriver: 0x253a70,     // $28B610 -- the ONE call this port makes
  optionObject: 0x24c096,   // $28B616 -- where the LASER RAMP lives
  laserRampDown: 0x24c8be,  // inside it; $24C8CE is the write
  /** ($4b,A6)'s reload with the measured formation ($5a,A4) = 2: (2-2>>1)+4. */
  laserRampFrames: 4,
  /** The 23 `jsr` targets in ROM order, read from `xref.py dasm 28B5E0 180`. */
  calls: [
    0x289b80, 0x2634f4, 0x28ad54, 0x27f95a, 0x288e4e, 0x2890f2, 0x255dd8,
    0x253a70, 0x24c096, 0x254680, 0x255042, 0x28a098, 0x2527ce, 0x24a458,
    0x24a46c, 0x24a440, 0x24a44c, 0x27e99e, 0x252bd0, 0x281d9a, 0x25354c,
    0x25292a, 0x252a52,
  ],
};

/**
 * Is the board's laser speed ramp about to move ($1a,A4)?
 *
 * PURE and exported so `tests/type5.test.js` can drive it without a Game.
 * `held` is how many consecutive logic frames P1 has held Button 1.
 *
 * The DOWN ramp is a no-op while ($1a,A4) is already at the ($38,A4) floor
 * ($24C8C2 `cmp.b ($38,A4),D0 / beq`), so a port that has somehow reached the
 * floor is not diverging by standing still.  The port never moves the index, so
 * in practice this is "held for four frames".
 */
export function laserRampWouldMove(held, speedIdx, laserFloor) {
  return held >= TYPE5.laserRampFrames && speedIdx !== laserFloor;
}

/** The five of the 23 `jsr` targets wave 12 RUNS, by their position in the
 *  ROM's own call order.  Everything else is still counted.  The four ship-draw
 *  entries come BEFORE the option object in that order and that matters: the
 *  ship's records reach bucket 19 while the pods' reach bucket 15, and the two
 *  buckets drain at different depths, so the ORDER WITHIN a bucket is what a
 *  byte-for-byte gate can see. */
export const TYPE5_PORTED = new Set([
  0x253a70,   // #8  the player-shot driver (wave 8)
  0x24c096,   // #9  THE OPTION OBJECT (wave 12)
  0x24a458,   // #14 the ship's alt entry, P1 (wave 12)
  0x24a46c,   // #15 ...P2
  0x24a440,   // #16 the ship's draw, P1 (wave 12)
  0x24a44c,   // #17 ...P2
]);

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
      switch (c) {
        case TYPE5.shotDriver:                          // $28B610
          ctx.shotsProcessed = runShotDriver(ram, rom, handlers, ctx);
          break;
        case TYPE5.optionObject:                        // $28B616 -> $24C096
          // The `no-option-object` mutation is wave 11's behaviour restored:
          // count the call and do not run it.  It must move the four option
          // columns and both bucket-15 records.
          if (SHIP_MUTATE.value === 'no-option-object') {
            ctx.unportedLog.note(c, 'MUTATION no-option-object');
          } else {
            runOptionObject(ram, ctx);
          }
          break;
        case ROM.shipDrawAltP1:                         // $24A458
          drawShipAlt(ram, RAM.player1);
          break;
        case ROM.shipDrawAltP2:                         // $24A46C
          drawShipAlt(ram, RAM.player2);
          break;
        case ROM.shipDrawP1:                            // $24A440
          drawShip(ram, RAM.player1, ctx);
          break;
        case ROM.shipDrawP2:                            // $24A44C
          drawShip(ram, RAM.player2, ctx);
          break;
        default:
          ctx.unportedLog.note(c, `object type 5 ($28B5E0) subsystem call -- `
            + `${TYPE5.calls.length - TYPE5_PORTED.size} of its `
            + `${TYPE5.calls.length} jsr targets are still unported`);
      }
    }
    // $28B670 `tst.w $81308c / beq $28B730` and everything after it -- the
    // two-player shot/laser interaction block at $28B67A, and the ONLY caller
    // of $244D62, the player-vs-bullet collision.  Counted, not run; W23's.
    ctx.unportedLog.note(0x28b670, `object type 5's tail ($28B670 onwards, `
      + `gated on $81308C) -- and with it $244D62, the player's own collision, `
      + `which has no other caller`);
    void index;
  };
}
