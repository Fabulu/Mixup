# Wave 34 IMPLEMENTER — the six shipped crashes, and the detector in the gate

status: IN PROGRESS
implementer, 2026-08-04

Brief: W33's QA sweep (`33-qa-shipped-throws.md`) found six crashes live on the
public site (build 20260804095843). This wave fixes them and puts the check that
found them into `games/gradius/tools/test-all.mjs` as a named gate stage.

Ranked, from the brief:

1. `$B415 LDA $B42F,Y` — 5-entry table overrun, stages 3 and 4, frame 314, PASSIVE
2. `$C2DC` — breakable wall, stage 2, 227 field-2 cells
3. `$C13D`/`$C159` — types `$27`/`$29` touching the ship, stages 1–4
4. `$CC23`/`$CC2B` — 8-entry overrun, stage 5
5. `$BC44` — ALREADY FIXED by W32c, reference only
6. the instruments: `stageledger.py`'s RUNNABLE column; `tablecoverage.py`'s extents

---

## BASELINE — measured before any edit

(pending)

---

status: IN PROGRESS
