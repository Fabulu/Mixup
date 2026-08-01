// THE IRQ6 MODEL -- and the address list is BUILD A's on purpose.
//
// This is the wave-2 defect the review caught and it is worth restating in the
// code, because the wave-2 worklog's phase table names build-B addresses for
// every one of these rows and NONE OF THEM EXECUTES.  Measured three ways on a
// VERSION-B run whose main loop is unambiguously build B (`armpc 23C212:1901`):
//
//   VECTORS at lf=2600: IRQ4 $801470=$13BDAA   IRQ6 $801478=$13BDBA
//   P1 mirror store executions: buildA $13D488=2615   buildB $23D11C=0
//   ISR6 releases:              buildA $13C806=2599   buildB $23C46C=0
//   read census of $803940: build A's $13C7E6/$13D478/$13C806 fire; build B's
//   $23C44C/$23D10C/$23C46C: NOT ONE READ.
//
// The chain that runs:
//   $13BDBA movem.l D0-D7/A0-A6,-(A7) / jsr $13C7D4 / movem / rte
//   $13C7D4   jsr $13CFBA            coin/service            UNPORTED
//   $13C7DA   jsr $13D464            THE INPUT READ          ported (input.js)
//   $13C7E0   jsr $18ACC0                                    UNPORTED
//   $13C7E6   tst.b $803940 / beq $13C80C     <- THE (A) GATE
//   $13C7EE   jsr $141676 / $140FFE / $141258 / $185DC4       UNPORTED (gated)
//   $13C806   subq.b #1,$803940               <- THE RELEASE
//   $13C80C   jmp $13C4FC             ISR tail                UNPORTED
//
// A DROPPED FRAME IS NOT UNIFORM.  The input read is BEFORE the gate, so on an
// overrun frame the mirrors still advance while the four gated routines are
// skipped -- measured 614 gate firings in 696 forced-overrun frames, with the
// input read running on every one of them.  The port expresses that shape even
// though its budget never triggers, because the shape is the thing that cannot
// be added later.
//
// AND THE STATISTIC THAT WAS WRONG IN WAVE 1: the gate-firing count is
// `sum(irq6 - rel)`, NOT `count(rel == 0)`.  A dilated logic frame sees N
// vblanks and gets exactly ONE release; the other N-1 take the gate.  Read as
// `count(rel == 0)` the same run reported 0 firings where there were 614.

import { RAM, ROM } from './machine.js';
import { isr6InputRead } from './input.js';

/**
 * One IRQ6 dispatch.  Returns true if it RELEASED the semaphore (i.e. the main
 * loop was waiting), false if the (A) gate fired.
 */
export function irq6(ram, portWord, ctx) {
  const { unportedLog } = ctx;
  unportedLog.note(ROM.isr6Coin, 'ISR6 jsr #1: coin/service ($13CFBA)');
  isr6InputRead(ram, portWord, unportedLog);          // $13C7DA
  unportedLog.note(ROM.isr6Third, 'ISR6 jsr #3 ($18ACC0)');
  const sem = ram.u8(RAM.semaphore);                  // $13C7E6 tst.b $803940
  if (sem === 0) return false;                        // $13C7EC beq $13C80C -- GATED
  for (const a of ROM.isr6Gated) {
    unportedLog.note(a, 'ISR6 gated routine');        // $13C7EE..$13C800
  }
  ram.setU8(RAM.semaphore, (sem - 1) & 0xff);         // $13C806 subq.b #1
  unportedLog.note(ROM.isr6Tail, 'ISR6 tail ($13C4FC)');
  return true;
}
