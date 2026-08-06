# NOTE 83 - two things worth keeping, neither of them a wave

status: DONE. Written by the orchestrator 2026-08-06. No code changed. Both
items came out of W82 and out of checking a claim the owner forwarded.

---

## 1. A BLOCKING CENSUS IS A CENSORED MEASUREMENT

This is the important one, and it is a new failure shape for
`docs/knowledge/02-traps.md`.

Diagnostic 78 counted which address each blocked segment threw on and produced
a clean table: 43 of the 45 remaining blocks were the `$294xxx`/`$295xxx`
family, headed by `$2956F6` x21 and `$295120` x14. W82's brief was written
straight off that table, and its implied promise was "port these six addresses,
clear 43 rungs".

**That promise was false, and the census could not have shown it.**

W82 measured the real shape from the ladder's own RAM dumps: the 45 blocked
rungs need **41 entry points on their first frame, 39 of them unported** - 80
routines, 2,173 instructions. The reason the census looked small is
`$2596C6`'s **walk order**: it walks A4 first, so the F-list throw fires before
MAIN, E, D and the OBJECT list are ever reached. Every one of those is equally
unported and equally blocking. Porting the six named addresses would have
**moved the throw, not cleared a rung.**

**The general rule: a census of first-throw addresses measures the WALK ORDER,
not the work.** It tells you truthfully what threw first and tells you nothing
about what is behind it. Counting how many segments name an address feels like
sizing a job and is not.

**What to do instead**, and W82 did it: take the seeded state at the rung and
enumerate the entry points the frame actually needs, then subtract the ones
already ported. That is a real size. The census is still useful for ORDERING
(it says what to look at next) and useless for SIZING.

Same family as `docs/knowledge/10` - coverage is branches, not frames - and of
`stageledger.py`'s RUNNABLE column meaning "statically guarded" rather than
"plays". Each time, a number that was honest about what it measured got read as
answering a question it never addressed.

**Where this leaves the boss.** `$295xxx` IS the stage-1 boss: the STEP halves
of table-F script ids 0,1,2,3,6, with `$2943B0` as D-script 7. Recon 48
tabulated all six in W48; wave A (the scheduler) shipped in W62; W82 is recon
48's **wave B** and shipped the unmasked piece, the stage ending. The remaining
43 rungs are all F STEPs and the honest size is the 39 unported entry points
above, not six addresses. **W82's own next step stands: trace bucket 2 before
any further boss wave**, because `seedcmp` traces bucket `$808854` while the
boss emits into `$805CC8`, which is why W82 could claim feature-complete but
not oracle-clean for its OBJECT routines.

**A latent defect fell out of it**, worth recording separately: two ROM windows
were already wrong in the tree. `$29370A` was declared `$50` for what is a
`$A8` table, and `$295856` was undeclared. Neither was found by a test. They
were found by someone reading the listing next to the window list.

---

## 2. THE MiSTer PGM CORE SHIPS AN ORACLE SERVER, AND WE MAY USE IT FREELY

The owner forwarded an analysis claiming the core at
`C:\programmieren\pgm-mister` includes a Verilator simulator with a persistent
JSON control server. **Checked against the clone: it is true.**

`docs/sim-server.md` plus a full `sim/` tree. The protocol is one JSON object
per line on stdin, one response per line on stdout, with logs pushed to stderr
so **stdout stays safe for machine parsing**. Requests carry `id` / `method` /
`params`; responses carry `id` / `ok` / `result` or a stable `error.code`.

**Both recons missed it.** 76 and 77 were briefed at timing and at the video
pipeline and read the RTL; neither was asked what tooling shipped alongside it.
That is a briefing gap, not an agent failure, and it is the second time this
week a capability was sitting in a directory nobody had been pointed at.

### THE LICENCE POSITION, CORRECTED

Earlier framing in this project treated the core's GPL as a general hazard. For
**use** that is wrong and the correction matters:

- **GPL restricts DISTRIBUTING derived code. It does not restrict USING a
  program.** Running their simulator, sending it JSON and comparing its answers
  against our port carries **no licence obligation whatsoever** - the same way
  compiling with GCC does not make the compiled program GPL.
- **Copying their RTL into our MIT tree is still forbidden**, and that is what
  the original caution was about. 76 and 77 were checked before commit: zero
  Verilog constructs, zero code blocks.
- Modifying the core (adding instrumentation counters, say) and **distributing**
  those modifications would carry GPL terms. Using them locally does not.

**So an oracle harness that drives `sim --server` over stdio is unblocked and
always was.** Nothing needs deciding before building it.

### WHAT IT WOULD ACTUALLY BUY, AND WHAT IT WOULD NOT

Recorded now so a future wave does not re-derive it or overclaim.

**Genuinely new:** the machinery BETWEEN the software-visible state and the
pixels. MAME exposes what the program can see and the frame it produced; the
RTL exposes sprite DMA, IGS023 internal state, the A/B ROM reads, priority
composition and per-scanline behaviour. When our pixels differ, that is the
difference between "wrong record" and "right record, wrong DMA interpretation".
Same for the 32 ICS2115 voices when sound eventually starts.

**Two caveats that must travel with any three-way comparison:**

1. **The core used MAME as one of its references.** MAME and RTL are therefore
   NOT independent witnesses, and agreement between them is not proof either
   matches the PCB.
2. **Sharper, and ours:** recon 76 found the IGS027A ARM7's internal ROM is
   **recreated** in both MAME and this core. For anything touching protection
   they may share one reconstruction, so agreement there proves nothing at all.

**Already answered, so do not spend a wave re-asking it:** recon 76 established
the board cannot dilate, drop or truncate - the raster is rigid and only sets
the cycle budget. So "is a logic update skipped / does the main loop finish
partially" is settled: neither. Slowdown lives in the ROM. What the RTL would
add is **where the cycles go** - specifically IGS023 tilemap VRAM arbitration,
the one real stall source, measured by their own board data at 0.493-0.629x for
fully VRAM-bound loops. That is the right magnitude for the owner's "MAME at
50%" datum and is a **ceiling for fully-bound code, not a proof**. `74-REF`
still governs: a target to explain, never a constant to apply.

The owner's FPGA hardware arrives in a few months. **None of the above needs
it** - the Verilated simulator runs on this machine today.
