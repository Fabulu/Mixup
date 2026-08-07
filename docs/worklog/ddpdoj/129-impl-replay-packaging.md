# 129 -- IMPL: the .replay artifact + headless player (Phase 4a+4b)

status: **DONE** -- replay.mjs (play + mk) GREEN-prints a packaged fixture,
NOTES-replay.md carries the v1 spec + the RTC freeze decision, the gate stage
passes (6/6 incl. A/B/C red), and the leak guard is clean. Phase 4c (live
REC/PLAY) is OUT OF SCOPE and flagged for later. Results in section 8.

started: 2026-08-07
role: IMPLEMENTER. Files written: `games/ddpdoj/tools/replay.mjs` (new),
`games/ddpdoj/tests/w129replay.test.js` (new), `games/ddpdoj/NOTES-replay.md`
(appended), and this worklog. **No `src/` game-logic change: replay.mjs IMPORTS
`Game`, `stateVector`, `CLAIMED`, `readTrace`, `run` and the mutation switches
from existing modules.** `games/gradius/` not touched. Nothing ROM-derived is
committed: the one `.replay` fixture lives under `tools/oracle/out/` (already
gitignored) and the gate regenerates it.

target: `ddpdojblk` VERSION-B. `[M]` = measured by me this session.

---

## 0. THE HEADLINE

The replay PROPERTY already exists: `portdiff.mjs`'s step loop + sha256 digest
(line 276), `determinism.mjs` (in-process x2 + subprocess), `seedcmp.mjs`'s
seed-anywhere sweep, and the boot-from-rung construction (portdiff.mjs:128).
This wave packages that property into a single self-describing `.replay`
artifact plus a headless player that GREEN-prints it. A green `.replay` is
provably the same property the oracle checks, because the player reuses
portdiff's EXACT digest feed.

## 1. PREMISE CHECK (the W128 recon was text-only; this wave verifies it)

Every cited line exists and matches, measured before any code was written:

| citation | claimed | found | note |
|---|---|---|---|
| portdiff step loop | ~:269 | :269 | `game.step(Number(row.portin))` |
| portdiff digest feed | ~:163/:276/:352 | :276 | `cols.map((c)=>String(v[c])).join('\t')+'\n'` |
| determinism subprocess | ~:48 | :43-48 | spawnSync `--once` |
| seedcmp `--break` red | ~:318-376 | :318-376 | differential vs unmutated baseline |
| state.js CLAIMED | ~:388 | :388 | the compared set |
| state.js stateVector | ~:336 | :336 | |
| main.js Game | ~:139 | :139 (ctor :146) | |
| main.js step | ~:527 | :527 | |

**The brief's one wording drift:** it says the digest feed is
`CLAIMED.map(...)`. portdiff actually feeds `cols.map(...)`, where
`cols = CLAIMED.filter((c) => start[c] !== undefined)` -- the SUBSET the trace
carries. For a `.replay` frozen at record there is no live trace to filter
against, so the file stores `digest.columns = cols` (what was actually hashed)
and the player uses that set verbatim. On a trace that carries all of CLAIMED
(the normal case) the two are identical.

## 2. THE RTC DECISION -- FREEZE THE DATE IN THE SEED (zero code)

`[M]` `grep -iE '$80209B|$80209C|$8020AC|$80211C|$802204|$8022C8|$23C53A|C00006'`
over `games/ddpdoj/src/` returns **ZERO matches**. The port does not read the
RTC: the calendar bytes ($80209B/$80209C month/day, $8020AC/$80211C weekday/
year, $802204/$8022C8 the RTC mirrors, $23C53A the RTC read routine, C00006 the
RTC register) are never touched by any ported routine. They are frozen in the
seed and excluded from CLAIMED by name (state.js carves the RTC date words out
of `d_ram` -- wave 1 precedent, line 369). So a `.replay` is reproducible
without a wall clock by construction, not by discipline. Documented as a
FORWARD CONSTRAINT in NOTES-replay.md: if a later wave ports $23C53A, it must
take the date from the FROZEN SEED, never `new Date()`.

## 3. THE v1 .replay FORMAT (self-describing JSON; binary fields base64)

```
{
  "format": "ddpdoj.replay/v1",
  "build": "B",
  "version": { "git", "tablesSha256", "buildId" },
  "seed": { "lf", "vf", "ramB64", "bgB64", "tablesB64" },
  "scenario", "intervention", "poke",
  "portin": { "encoding": "u16be", "count", "b64" },
  "digest": {
    "algo": "sha256",
    "columns":   // the CLAIMED subset actually hashed, frozen at record
    "cumulative",
    "periodFrames": 250,           // the checkpoint cadence
    "periods": [{ "lf", "sha256" }] // one window-fresh hash per 250 frames
  }
}
```

The digest feed is portdiff's exact line (`columns.map(c=>String(v[c])).join('\t')+'\n'`),
so `digest.cumulative` equals `run.digest` byte-for-byte. The per-period windows
are FRESH hashes (the hash resets at the start of each 250-frame window); a bad
window is detectable even if an earlier one was also bad, and the FIRST bad
window is the first-divergence location at 250-frame resolution. Frame-level
localisation WITHIN a window needs the live trace (which the builder has); the
packaged player gives window-level, and says so rather than implying finer.

## 4. replay.mjs -- TWO MODES (imports only)

* **verify:** `replay.mjs <file.replay>` -- parse, base64-decode
  ram/bg/tables/portin, boot `Game` (portdiff.mjs:128 construction), reset the
  eight module mutation switches (portdiff.mjs:137-144), apply the poke every
  frame (portdiff.mjs:261), step with portin[lf], feed the cumulative hash AND
  a per-period rolling hash, compare period-by-period then cumulative. Prints
  GREEN or the first divergent window; exit 0 green / 1 red.
* **record:** `replay.mjs --mk <trace.tsv> <seed.bin> <bg.bin> [--seed-lf N]
  [--to N] [--poke ...] [--scenario S] [--intervention T] -o <file.replay>` --
  `readTrace` + `run` for the authoritative cumulative, then one own walk for
  the per-period window hashes (asserted to concatenate to `run.digest`),
  extract portin from the TSV's `portin` column (decimal -> u16be). Thin
  wrapper over `run`.

## 5. RED VALIDATION (A/B/C, the seedcmp --break precedent)

Each mutation: baseline green, mutation red, restore green. Differential.
* **A portin sensitivity:** flip one bit in one portin word at a KNOWN-ACTIVE
  frame (the fly-around script holds a diagonal at lf2130; centered-stick
  no-op frames are a finding but not the red signal).
* **B seed sensitivity:** flip one byte in seed.ram at a CLAIMED column
  address (p1raw, $803970).
* **C corruption detection:** flip one bit in digest.cumulative in the file.
  The player must report MISMATCH, not GREEN.

## 6. GATE

`games/ddpdoj/tests/w129replay.test.js` builds the fixture from the fly-around
ladder (one segment, lf2000->2250, exactly one 250-frame period), GREEN-prints
it, then runs A/B/C. It SKIPS when the ladder is absent (CI) the same way
w85bucket2 skips when the tables are absent.

## 7. OUT OF SCOPE

Phase 4c (live REC/PLAY in the running page) depends on 4a and is flagged for a
later wave.

## 8. RESULTS (measured)

`[M]` Gates:
* **`node --test games/ddpdoj/tests/`** -> **1290 pass / 0 fail / 0 skip**
  (baseline was 1284/0/0; +6 from `w129replay.test.js`). No `src/` change, so
  nothing that skipped before skips now.
* **`w129replay.test.js`** -> 6/6: format self-describing, baseline GREEN,
  builder own-walk == run.digest, and A/B/C red each followed by a green restore.
* **`node tools/publish.mjs --only ddpdoj --dry`** -> exit 0; rom-leak guard
  **262 files checked, clean** (6 pre-existing deliberate exceptions, none new).
  The `.replay` fixture never enters `dist/`: it lives under
  `tools/oracle/out/` which is gitignored (`git check-ignore` confirms the `out/`
  rule covers it).

`[M]` Red validation (differential, each baseline-green -> mutation-red ->
restore-green):
* **A** flip bit 0 of the portin word at lf2130 (script `2130=D`, down held):
  cumulative `5e115d2b...` -> `2aa39ad1...`, period 0 diverges.
* **B** flip one byte at offset $103E8 (`py`, player Y at $8103E8, a CLAIMED
  WATCH column): cumulative -> `cd9c1138...`, period 0 diverges. The brief's
  example `p1raw` ($803970) does NOT work and that is recorded as a finding:
  `p1raw` is the raw input word, rewritten by `step()` every frame from the
  portin, so a seed flip is clobbered before the first digest feed. Input
  registers are not seed-sensitive in the cumulative; player position is.
* **C** flip one hex char of `digest.cumulative` in the file: player reports
  MISMATCH (cumulativeMatch false), not GREEN.

`[M]` Fixture: `tools/oracle/out/w69/fly-around/fly-around.lf2000-2250.replay`,
1017 KB, one 250-frame segment, 94 digest columns, single period. Regenerated by
the gate from the fly-around ladder (seed `c002000.ram.bin` + `c002000.bg.bin` +
`trace.tsv`, poke `810424=FF`).

`[M]` The RTC grep (`$80209B`/`$80209C`/`$8020AC`/`$80211C`/`$802204`/`$8022C8`
+ `$23C53A` + `C00006` over `src/`) returns ZERO matches.
