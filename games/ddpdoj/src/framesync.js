// $23C212 -- main-loop call #5, THE FRAME SYNC.  Arms `$803940` and spins.
//
// It is not one arm.  It is a five-way decision with a DYNAMIC GOVERNOR at the
// end of it, and the governor is why this file exists rather than a two-line
// method: the tail at `$23C272` computes a load number out of the game's own
// state, compares it against a threshold built from four tables, and either
// arms TWO vblanks (a deliberate 29.6 Hz mode) or nudges a hysteresis counter
// at `$803932`.
//
// THE MEASUREMENT THAT MATTERS, AND THE CORRECTION IT FORCES.  Waves 1-3 report
// `armed_vblanks 1:2600` in every run and conclude the 2- and 3-vblank divider
// paths "have never been observed to execute".  That census counts the value of
// the write that takes `$803940` from 0 to non-zero -- and `$23C212` ALWAYS
// writes 1 first, so a later `move.b #$2,$803940` at `$23C248`/`$23C38A` is a
// non-zero-to-non-zero write the census never sees.  What actually bounds the
// divider is a different column: `irq6_per_logicframe`, which is 1 on 4,183 of
// the fly-around scenario's 4,200 frames.  The conclusion survives; the
// statistic that supported it did not.  (Same shape as wave 2's correction to
// `gated_zero_release`.)
//
// MEASURED over the fly-around window: `$80392E`, `$803930` and `$803932` are 0
// on all 4,200 frames and `$80390E` cycles 0/1/2, so the governor tail runs on
// exactly one frame in three and takes the "load below threshold, counter
// already 0" path every time.  It is ported in full anyway: a port that only
// implements the branch its corpus took is a port that breaks silently the
// first time the corpus grows.

import { RAM, ROM } from './machine.js';
import { u16 } from './ram.js';
import { unreached } from './unported.js';

/** Returns the number of vblanks the following spin waits for. */
export function frameSync(ram, gov) {
  ram.setU8(RAM.semaphore, 1);                                   // $23C212
  if (ram.u16(RAM.mod3Phase) !== 0) return 1;                    // $23C21A/$23C220
  if (ram.u16(RAM.divCount1) !== 0) {                            // $23C224
    ram.setU16(RAM.divCount1, u16(ram.u16(RAM.divCount1) - 1));  // $23C22E
    return armTwo(ram);                                          // $23C234 bra $23C388
  }
  if (ram.u16(RAM.divCount2) !== 0) {                            // $23C238
    ram.setU16(RAM.divCount2, u16(ram.u16(RAM.divCount2) - 1));  // $23C242
    ram.setU8(RAM.semaphore, 2);                                 // $23C248
    if (ram.u16(RAM.divCount2) <= 0x0f) return 2;                // $23C250 bls
    ram.setU8(RAM.semaphore, 3);                                 // $23C25C
    return 3;
  }
  if (ram.u16(RAM.divGate3) !== 0) return 1;                     // $23C268 bne
  return governor(ram, gov);                                     // $23C272
}

/** $23C388: `moveq #$2,D0 / move.b D0,$803940`. */
function armTwo(ram) { ram.setU8(RAM.semaphore, 2); return 2; }

/** $23C272 .. $23C388 -- the governor. */
function governor(ram, gov) {
  let d0 = ram.u16(0x81b40c);                                    // $23C272
  if (ram.u16(0x815ea0) !== 0) {                                 // $23C278
    const c = ram.u16(0x803934);
    if (c === 0) return 1;                                       // $23C288 -> spin
    if (c >= 5) {                                                // $23C28C bcs
      ram.setU8(RAM.semaphore, c & 0xff);                        // $23C296 -> $23C38A
      return c;
    }
  }
  // $23C2A0: load = $81B40C + $81295C + 2 * $81295E
  d0 = u16(d0 + ram.u16(0x81295c));                              // $23C2A0
  d0 = u16(d0 + ram.u16(0x81295e));                              // $23C2A6
  d0 = u16(d0 + ram.u16(0x81295e));                              // $23C2AC
  let d1 = 0;                                                    // $23C2B2
  let tbl = gov.t23C3EE;                                         // $23C2B4
  if (ram.u16(0x813098) !== 0                                    // $23C2BA
    || (ram.u16(0x80393a) !== 0                                  // $23C2C4
      && ram.u16(0x81309c) !== 0                                 // $23C2CE
      && ram.u16(0x81309c) !== 1)) {                             // $23C2D8
    tbl = gov.t23C402;                                           // $23C2E4
    d1 = u16(d1 + 0x28);                                         // $23C2EA
  }
  const d2 = ram.u16(0x813096);                                  // $23C2EE
  if (d2 & 1 || d2 + 2 > tbl.length * 2) {
    unreached(0x23c2f4, `$813096 = $${d2.toString(16)} indexes past the `
      + `${tbl.length}-word table the governor reads`);
  }
  let k = d2 >> 1;
  d1 = u16(d1 + tbl[k++]);                                       // $23C2F6 add.w (A0)+
  if (ram.u16(0x81b416) !== 0) d1 = u16(d1 + tbl[k++]);          // $23C2FE/$23C302
  if ((ram.u16(0x81b63e) | ram.u16(0x81b640)) !== 0) {           // $23C304/$23C30A
    d1 = u16(d1 + 0x1e);                                         // $23C314
  }
  // $23C318 cmp.w D1,D0 / bcc $23C332 -- `bcc` is CARRY CLEAR, i.e. the
  // UNSIGNED comparison D0 >= D1.  Both are u16 here, so this is that compare
  // and not a signed one.
  if (d0 >= d1) return governorOver(ram, gov);
  // $23C31E tst.w $803932 / beq $23C390 -- spin with the 1 armed at $23C212
  if (ram.u16(0x803932) === 0) return 1;
  ram.setU16(0x803932, u16(ram.u16(0x803932) - 1));              // $23C328
  return armTwo(ram);                                            // $23C32E -> $23C388
}

/** $23C332 .. $23C388 -- the "load is at or over the threshold" half. */
function governorOver(ram, gov) {
  let tbl = gov.t23C420;                                         // $23C332
  if (ram.u16(0x813098) === 0) {                                 // $23C338 bne
    tbl = gov.t23C416;                                           // $23C342
    if (ram.u16(0x80393a) !== 0                                  // $23C348
      && ram.u16(0x81309c) !== 0                                 // $23C352
      && ram.u16(0x81309c) !== 1) {                              // $23C35C
      tbl = gov.t23C420;                                         // $23C368
    }
  }
  const d2i = ram.u16(0x813094);                                 // $23C36E
  if (d2i & 1 || d2i >= tbl.length * 2) {
    unreached(0x23c374, `$813094 = $${d2i.toString(16)} indexes past the `
      + `${tbl.length}-word table at the governor's ceiling`);
  }
  const limit = tbl[d2i >> 1];                                   // $23C374
  if (limit > ram.u16(0x803932)) {                               // $23C378 cmp/bls
    ram.setU16(0x803932, u16(ram.u16(0x803932) + 2));            // $23C382 addq.w #2
  }
  return armTwo(ram);                                            // $23C388
}

export { ROM };
