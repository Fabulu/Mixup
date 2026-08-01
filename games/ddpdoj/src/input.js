// The input mirrors -- ported from the code that ACTUALLY RUNS.
//
// The input read is build A's `$13D464`, reached from `$13BDBA -> $13C7D4 ->
// jsr $13D464`, because on a VERSION-B run the interrupt vectors hold build A's
// handlers (02-review.md, re-measured this wave).  Build B has a byte-identical
// routine at `$23D0F8` that never executes; the two agree instruction for
// instruction, so the arithmetic below is right either way -- but the ADDRESS
// in the comment has to be the one that runs, or the next reader ports the
// wrong four routines the way wave 2's phase table did.
//
//   $13D464 lea $C08000,A0
//   $13D46A move.w (A0),D0        <- ONE read of the port per IRQ6. MEASURED:
//   $13D46C move.w D0,D1             `input_port_reads_per_logicframe 1:2584
//   $13D46E lsr.w #8,D1               2:15 3:1` over the gate scenario -- the
//   $13D470 ror.w #1,D0               2s and 3s are dilated logic frames with
//   $13D472 ror.w #1,D1               more than one IRQ6, and the LAST read is
//   $13D474 not.w D0                  the one whose mirrors the frame sees.
//   $13D476 not.w D1
//   $13D478 tst.b $803940 / beq $13D488   <- A SECOND (A) GATE, INSIDE the
//   $13D482 jsr $15B980                      input read: on an overrun frame
//   $13D488 move.w D0,$803970                $15B980 is skipped and the
//   $13D48E move.w D1,$803976                MIRRORS ARE STILL STORED.
//
// So input lead survives an overrun.  Measured lead is ZERO on this machine
// (a button set at the sample point of logic frame N is consumed by N+1).
//
// The bit shuffle is why the port takes the RAW PORT WORD as its replay input
// and derives the mirrors itself: it makes $803970/72/74 a genuinely compared
// field rather than one fed in from the answer.  Verified against the board:
// 1P Start alone -> portin $FFFE -> p1raw $8000; P1 Button 3 held -> portin
// $FF7F -> p1raw $0040; P2 pressing nothing -> p2raw $7F80 (the high byte is
// the `not` of a zero-extended byte, i.e. garbage the game never reads).

import { RAM } from './machine.js';

/** `ror.w #1` -- bit 0 rotates into bit 15. */
export const ror16 = (v) => (((v & 1) << 15) | (v >>> 1)) & 0xffff;

/**
 * THE INVERSE, for a live keyboard (wave 6's demo page).  A replay feeds the
 * RECORDED port word and never comes near this function; an interactive player
 * has to synthesise one.
 *
 * `p1raw` bit b = NOT (port bit (b+1)&15), from `mirrorsFromPort` below, so a
 * pressed button b CLEARS port bit (b+1)&15 of an all-ones word.  Checked
 * against the board's own measurements (`machine.js` BIT, measured by driving
 * each bit and watching which clamp answered): 1P Start alone -> $FFFE ->
 * p1raw $8000; P1 Button 3 held -> $FF7F -> p1raw $0040.
 *
 * @param {Iterable<number>} bits  BIT.up / BIT.b1 / ... values that are held
 */
export function portWordFromBits(bits) {
  let w = 0xffff;
  for (const b of bits) w = (w & ~(1 << ((b + 1) & 15))) & 0xffff;
  return w;
}

/** $13D46C..$13D476 exactly: the P1 and P2 mirrors from one port word. */
export function mirrorsFromPort(portWord) {
  const w = portWord & 0xffff;
  return {
    p1: (~ror16(w) & 0xffff) >>> 0,
    p2: (~ror16((w >>> 8) & 0xff) & 0xffff) >>> 0,   // lsr.w #8 zero-extends
  };
}

/** $13D464 -- the IRQ6 input read.  `gated` is the state of the (A) gate at
 *  $13D478: false means the frame overran and $15B980 was skipped. */
export function isr6InputRead(ram, portWord, unportedLog) {
  const m = mirrorsFromPort(portWord);
  if (ram.u8(RAM.semaphore) !== 0) {
    unportedLog.note(0x15b980, 'ISR6 input-read inner gate subroutine');
  }
  ram.setU16(RAM.p1raw, m.p1);      // $13D488
  ram.setU16(RAM.p2raw, m.p2);      // $13D48E
}

/** $23D12A -- main-loop call #6, the POST-VBLANK edge derivation.  This one IS
 *  build B's: it is a main-loop call, not ISR code.  Build A's identical
 *  routine at $13D496 does not run.
 *
 *  edge = raw AND NOT prev, with `prev` updated to this frame's raw.  Note the
 *  ORDER, which is the part a port gets wrong: prev is read, inverted, THEN
 *  overwritten, THEN ANDed -- so `edge` uses the PREVIOUS frame's raw even
 *  though $803974 already holds this frame's by the time the AND happens. */
export function postVblankEdges(ram) {
  const d0 = ram.u16(RAM.p1raw);      // $23D12E
  const d1 = ram.u16(RAM.p2raw);      // $23D134
  let d2 = ram.u16(RAM.p1prev);       // $23D13A
  let d3 = ram.u16(RAM.p2prev);       // $23D140
  d2 = ~d2 & 0xffff;                  // $23D146 not.w D2
  d3 = ~d3 & 0xffff;                  // $23D148
  ram.setU16(RAM.p1prev, d0);         // $23D14A
  ram.setU16(RAM.p2prev, d1);         // $23D150
  ram.setU16(RAM.p1edge, d2 & d0);    // $23D156/$23D158
  ram.setU16(RAM.p2edge, d3 & d1);    // $23D15E/$23D160
}
