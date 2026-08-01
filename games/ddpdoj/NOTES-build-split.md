# WHICH BUILD IS RUNNING — and the one place "build A is a defect" is WRONG

**Read this before acting on any rule that says a `$13xxxx`/`$14xxxx` address is
a defect.** That rule is right about the main loop and wrong about the
interrupt handlers, and the difference has already produced one blocking review
finding.

## The rule, corrected

`ddpdojblk` contains two complete games. The boot menu defaults to
**VERSION-A** (`2002.04.05 MASTER VER`) after ~5 s; **VERSION-B**
(`2002.10.07 BLACK VER`) is our target and needs P1 Down + P1 Button 1.

- **Main loop / game code:** build A `$13xxxx`–`$14xxxx`, build B
  `$23xxxx`–`$28xxxx`. On a VERSION-B run these MUST be build B.
- **INTERRUPT HANDLERS: NOT NECESSARILY.** Wave 2's reviewer measured that on a
  VERSION-B run **the ISR that actually executes is build A's**. The main loop
  is build B; the interrupt handlers are not.

This is not absurd. Wave 1 measured that both handlers are BIOS trampolines
through RAM vectors — `$0CA6` reads `$801470` (IRQ4), `$0CBE` reads `$801478`
(IRQ6) — so whichever handler address was installed in RAM is what runs,
regardless of which build's main loop is executing.

Confirmed on a default (VERSION-A) boot, 900 video frames:

```
PROBE irq4_vector=0013BDAA  irq6_vector=0013BDBA
```

**So: do NOT "fix" a build-A ISR address into a build-B one. Measure the vector
and port what actually runs.**

## What this invalidates

`docs/worklog/ddpdoj/02-impl-object-driver-and-overrun.md` §4's phase-order
table and §2's description of the (A) gate name build-B ISR addresses —
`$23CC4E`, `$23D0F8`, `$23D10C`, `$28C19A`, `$23C44C`, gated `$24133C`/
`$240CC0`/`$240F26`/`$287286`, release `$23C46C`, tail `$23C158`. Per the
reviewer, **none of them executes.**

`games/ddpdoj/tools/oracle/landmarks.json` carries the same addresses under
`builds.B` (`isr6Gate`, `isr6Release`, `isr6GateSkips`, `inputLea`,
`p1MirrorStore`). Treat them as UNVERIFIED until someone reads the live vectors
on a VERSION-B run and either confirms or replaces them.

**The consequence if this is not fixed:** an implementer following that table
ports four routines that never run and omits the four that do — and the port
would still look plausible, because the main loop it hangs off IS build B.

## Do not repeat the mistake I just made

Reading the interrupt vectors on a **default boot** does not test this claim —
a default boot IS build A, so build-A vectors are exactly what you would see
either way. The measurement has to be taken after the chooser has selected
VERSION-B.

Equally: `pgm.py trace 700` reports `frames_on_other=699` and that is NOT a
pinning failure. The chooser fires around logic frame 600, so a short trace is
almost entirely the pre-choice window. At 1,500 frames the split is

```
CENSUS armpc 13C5B6:699 23C212:801
BUILD required=B frames_on_required=801 frames_on_other=699
```

i.e. 699 frames of build A while booting, then 801 of build B. **Any
measurement of build B must ignore the first ~700 logic frames.** A census
taken over a short run will be dominated by the wrong build and will look like
a catastrophe.
