// THE ROTATING TURRET -- `$268A0E..$268A5A` (type $11) and `$268376..$2683C2`
// (type $10), one shared production block with a different sprite table.
//
// THE OWNER NAMED THIS TEST (`20-OWNER-scenarios-must-play.md` §3): *"The first
// enemies in the game ... have rotating turrets that point at you the whole
// time."*  A turret is a CONTINUOUS per-frame consumer of the aim function
// where a bullet samples it once, so watching one while the ship moves sweeps a
// large slice of the aim's input space cheaply -- and a wrong angle table, a
// wrong quantisation or a wrong fixed-point convention shows up as a visibly
// mis-pointed gun on frame three rather than as a byte difference on frame
// 4,012.  `tools/w20turretgate.mjs` is that test.
//
// THE TWO TYPES, and why one function serves both:
//
//   type $11  init $268714 (+8 = $26871C)  handler $2688CC   104 of stage 1's
//             339 spawns -- the commonest enemy in the level
//   type $10  init $2680B0 (+8 = $2680B8)  handler $268232    16 spawns
//
//   $268A0E / $268376   tst.w $8130D2 / bne -> skip the whole block
//   $268A1A / $268382   subq.b #1,($18,A5) / bcc -> skip to the fire block
//   $268A20 / $268388   move.b ($19,A5),($18,A5)          reload the cadence
//   $268A26 / $26838E   movem.w ($2,A6),D0-D1             self = the SUB-record
//   $268A2C / $268394   addi.w #$200,D0                   THE MUZZLE OFFSET
//   $268A30 / $268398   jsr $24200A                       aim64
//   $268A36 / $26839E   bcs -> skip                       both players dead
//   $268A3C / $2683A4   jsr $242190                       ONE-STEP SLEW
//   $268A42 / $2683AA   move.b D1,($33,A5)                THE FACING
//   $268A46 / $2683AE   addq.b #1,D1 / andi.w #$3E,D1 / add.w D1,D1
//   $268A54 / $2683BC   move.l (A0,D1.w),($22,A5)   gfx $268C9E / $268694
//
// The two differ ONLY in the sprite table address, which is why this file takes
// it as a parameter instead of duplicating 20 lines twice -- and the difference
// is asserted in `TURRET_HANDLERS` rather than assumed by a `switch` on a type
// code the driver never reads (the driver dispatches on `($4C,A5)`, $263532).
//
// ===================== THE CADENCE IS THE THING TO GET RIGHT =================
// `subq.b #1,($18,A5) / bcc` re-aims ONLY on the frame the byte BORROWS, i.e.
// once every `($19,A5) + 1` frames.  Both types' record prototypes hold
// `($18,A5) = $0101` ($268808 / $268192, word 1 of the 16 copied by $26377A),
// so both re-aim EVERY SECOND FRAME and turn at most one 5.625-degree step when
// they do.  A port that re-aims every frame rotates its turrets twice as fast
// as the cartridge and is wrong in a way a screenshot cannot see.
//
// What lives outside this leaf: the type-specific fire block at `$268A5A` or
// `$2683C2`, movement, bounds, damage, death animation and display emitters.
// `handlers.js` owns those arms and calls `turretStep` from both complete live
// handlers. The result says whether the cartridge branches to the common draw
// or falls through into that type's fire logic.

import { aim64FromCaller, slew64 } from './aim.js';

/** The two turret handlers, keyed the way the driver keys them: on the handler
 *  longword in the record (`$263532 movea.l ($4C,A5),A1`). */
export const TURRET_HANDLERS = new Map([
  [0x2688cc, { type: 0x11, gfx: 0x268c9e, block: 0x268a0e, aimSite: 0x268a30,
               muzzleY: 0x200, init: 0x26871c, recProto: 0x268808,
               subProto: 0x268828 }],
  [0x268232, { type: 0x10, gfx: 0x268694, block: 0x268376, aimSite: 0x268398,
               muzzleY: 0x200, init: 0x2680b8, recProto: 0x268192,
               subProto: 0x2681b2 }],
]);

export const TURRET = {
  freezeGate: 0x8130d2,     // $268A0E / $268376 tst.w $8130D2
  cadenceOff: 0x18,         // ($18,A5) the aim countdown
  reloadOff: 0x19,          // ($19,A5) the reload value
  facingOff: 0x33,          // ($33,A5) THE FACING, 0..63
  gfxOff: 0x22,             // ($22,A5) the 32-direction sprite longword
  stateOff: 0x20,           // ($20,A5) bit 7 = the death path is running
  subOff: 0x06,             // ($6,A5)  the sub-record pointer ($263524)
};

/**
 * One frame of the turret block, for one enemy record.
 *
 * This is a STATE TRANSITION on `($18,A5)` and `($33,A5)` and it is written to
 * be runnable in isolation, because that is what makes it testable against the
 * board: the caller supplies the sub-record position after the movement
 * interpreter `$2638A6` has advanced it, and the port evolves the facing from
 * its own previous value. A gate that fed the facing back in every frame would
 * be measuring the aim and nothing else.
 *
 * @param t     AimTables, or a lazy getter for production branch exits
 * @param ram   the board's RAM image (the player records are read from it)
 * @param rom   RomWindows -- the 32-direction sprite table
 * @param a5    the enemy record
 * @param a6    the sub-record pointer already held by the production handler
 * @param spec  one value of TURRET_HANDLERS
 * @returns {{aimed:boolean, dir:number, carry:boolean, frozen:boolean, next:string}}
 *          -- `next` preserves the cartridge branch into draw or fire logic.
 */
export function turretStep(t, ram, rom, a5, a6, spec, mut = null) {
  // $268A0E tst.w $8130D2 / bne $268A68 -- the background freeze / all-players-
  // dead gate (W17 named its writers: $25FD82 set, $25FD8C clear).  Note what
  // it skips: the CADENCE IS NOT DECREMENTED on a frozen frame, so a freeze
  // does not merely pause the rotation, it preserves the phase.
  // MUTATION `no-freeze-gate`: aim through the freeze.
  if (mut !== 'no-freeze-gate' && ram.u16(TURRET.freezeGate) !== 0) {
    return { aimed: false, dir: -1, carry: false, frozen: true, next: 'draw' };
  }
  const cad = ram.u8(a5 + TURRET.cadenceOff);        // $268A1A subq.b #1,($18,A5)
  ram.setU8(a5 + TURRET.cadenceOff, (cad - 1) & 0xff);
  // MUTATION `aim-every-frame`: ignore the cadence and re-aim every frame --
  // the natural mistake, and it doubles every turret's rotation rate.
  if (cad !== 0 && mut !== 'aim-every-frame') {      // bcc -- no borrow, no aim
    return { aimed: false, dir: -1, carry: false, frozen: false, next: 'fire' };
  }
  if (cad === 0) {
    ram.setU8(a5 + TURRET.cadenceOff,                // $268A20 reload
      ram.u8(a5 + TURRET.reloadOff));
  }
  const selfY = ram.u16(a6 + 2);                     // $268A26 movem.w ($2,A6)
  const selfX = ram.u16(a6 + 4);
  // MUTATION `no-muzzle`: aim from the enemy's origin instead of $200 above it.
  const muzzle = mut === 'no-muzzle' ? 0 : spec.muzzleY;
  const r = aim64FromCaller(t, ram, a5,
    (selfY + muzzle) & 0xffff, selfX, mut);          // $268A2C / $268A30
  if (r.carry) {                                     // $268A36 bcs $268A68
    return { aimed: false, dir: -1, carry: true, frozen: false, next: 'draw' };
  }
  // MUTATION `no-slew`: snap straight to the aim. Every turret in the game then
  // points exactly at the ship on the frame it re-aims.
  const nf = mut === 'no-slew'
    ? (r.dir & 0x3f)
    : slew64(ram.u8(a5 + TURRET.facingOff), r.dir);  // $268A38/$268A3C
  ram.setU8(a5 + TURRET.facingOff, nf);              // $268A42 move.b D1,($33,A5)
  // $268A46 addq.b #1,D1 / andi.w #$3E,D1 / add.w D1,D1 -- the facing rounded
  // to 32 directions, as a BYTE OFFSET into a longword table (so the offset
  // steps by 4 and the table has 32 entries, not 64).
  const off = ((nf + 1) & 0x3e) * 2;
  ram.setU32(a5 + TURRET.gfxOff, rom.u32(spec.gfx + off));   // $268A54
  return { aimed: true, dir: r.dir, carry: false, frozen: false, next: 'fire' };
}
