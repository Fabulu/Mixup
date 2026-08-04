# Wave 40 TOOLING — one poke harness, and the stages it can and cannot reach

status: IN PROGRESS
tooling, 2026-08-04

Scope: `games/gradius/tools/` ONLY. `src/` and `tests/` belong to a concurrent
agent; I do not write there.

The owner's question that opened this wave:

> "can't you cartridge verify just by warping yourself to all the positions you
> need? Didn't we spend like 5 waves just getting that to work?"

Yes, and yes. The capability was built twice — `stage4poke.py`+`stage4cmp.mjs`
(W31, 271 spawns, 0 divergent) and `b559poke.py`+`b559cmp.mjs` (W32a, 2,371
handler frames x 10 fields, 0 divergent) — and both were hardcoded to one
stage, so W35 (stage 6), W36 (stage 7) and W38 (ending/loops) each shipped
reporting "could not reach: any cartridge comparison".

EVERY RUN IN THIS FILE IS AN INTERVENTION RUN (`docs/knowledge/09`). It
validates the CODE under a forced state. It is not evidence about any stage's
pacing, spawn density, difficulty or appearance.

---

## 0. PLAN

1. generalise the two scripts into one parameterised poke + one parameterised
   comparator; reproduce W31's and W32a's numbers through it.
2. apply it to stage 6 (`$19 = 5`) and stage 7 (`$19 = 6`) — never compared.
3. assess the ending + loops.
4. state what is still unvalidated, per stage.

(notes below are appended as findings arrive, not batched at the end)
