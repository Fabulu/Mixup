# 69 — TOOL: CHECKPOINTS THROUGH STAGE 1, AND SEEDING THE PORT FROM ANY OF THEM

status: **IN PROGRESS**

started: 2026-08-05
role: TOOLING (scope: `games/ddpdoj/tools/` and the oracle harness ONLY;
`games/ddpdoj/src/` belongs to T1 this wave and is NOT touched;
`games/gradius/` READ ONLY; `docs/worklog/ddpdoj/68-*` left alone)
target: `ddpdojblk` VERSION-B. Every address is build B (`$23xxxx`–`$2Axxxx`)
unless the line says otherwise.

**THE OWNER:** *"We need to oracle through the whole stages. Ideally with saved
states so we don't have to run everything fully all the time."*

`[M]` = measured by me this session.

---

## 0. THE BRIEF'S PREMISE, CHECKED

The brief says seed-anywhere is *"the capability Gradius has and this game does
not"*. **That is wrong, and it is worth being precise about why, because the
wrong half is the expensive half.**

Checked before writing any code:

- `games/ddpdoj/src/ram.js` — the port **keeps the board's own RAM layout**.
  Its header says so: *"here, seeding is a memcpy and 'player Y' is `$8103E8`
  on both sides"*. Gradius had to build an installer (`seedFromCartridge`);
  this port needs none.
- `frame.lua` has had `PROBE_RAMDUMP="lf:path"` since wave 4 — the whole
  128 KiB of main RAM at the sample point of one logic frame.
- `tools/portdiff.mjs` already takes `--seed-lf N` and starts the port there.
  **Every port gate in this game already begins mid-stage**: `fly-around` seeds
  at lf2000, `stage1-shot` at lf3716.
- `pgm.py seedstate` already takes a **MAME savestate** at the game's own sample
  point and resumes from it (wave 1).

So a port comparison starting at frame N is not missing. What is missing is
cheapness and reach, and those are the owner's actual complaint:

| the brief says | actually |
|---|---|
| the port cannot start at frame N | it has only ever started at frame N |
| we need savestates | we need **many seeds from ONE run**, which is not the same thing |
| — | `PROBE_RAMDUMP` takes **exactly one** logic frame per run, so a seed at frame N costs a full MAME run to N |
| — | no seed anywhere in this repo is later than **lf3716**; the stage is **19,217** frames long |

**Restating the task in the terms that make it cheap:** the expensive thing is
the MAME run, not the port. So take ONE long cartridge run over the whole stage
and harvest a checkpoint every K frames plus the per-frame reference trace; then
every later comparison is pure JavaScript over a file that already exists, and
no wave has to boot MAME again to look at frame 12,000.

---

## 1. WHAT WAS BUILT

| file | what |
|---|---|
| `games/ddpdoj/tools/oracle/frame.lua` | `PROBE_CKPT` + `PROBE_CKPT_AT` — **many** checkpoints per run, at the game's own sample point |
| `games/ddpdoj/tools/oracle/pgm.py` | `ckpt` command + `expand_repeat` (a stage-length input script that fits in an environment block) |
| `games/ddpdoj/tools/oracle/scenarios.json` | `stage1-sweep` and its control `stage1-sweep-natural` |
| `games/ddpdoj/tools/portdiff.mjs` | `untilLf` and `bgSeed` options, both undefined for every pre-existing caller |
| `games/ddpdoj/tools/seedcmp.mjs` | **THE SEGMENT SWEEP** — compares each segment independently, re-seeded from the board |

A checkpoint is main RAM (131,072 B) + `$900000` (4,096 B) + the six IGS023
registers. All of it lives under `tools/oracle/out/`, which is gitignored —
`git check-ignore` confirmed before the first run.

### The cost inversion, which is the whole design

```
[M] MAME, -video none -nothrottle, with PORTIN + WATCH + RAWDUMP + EXEC
    and a checkpoint every 250 frames:            15.3 logic frames / wall s
[M] the port, seeded, comparing 94 columns:      162.6 logic frames / wall s
```

So the emulator is **10.6x** the cost of the thing it is oracling, and it used
to be paid again for every question. One `pgm.py ckpt` run leaves a ladder; every
later comparison is `node seedcmp.mjs` over files that already exist.

### The cadence is 250 logic frames, and here is why

Space does not decide it (79 rungs = 10.2 MB against the 158 MB already in
`out/`). **Bisection and attribution** decide it. Segments are compared
INDEPENDENTLY, each re-seeded from the board at its lower rung, so a divergence
in segment 7 does not paint segments 8..79 red — the report is *which parts of
the stage diverge* rather than *everything after the first bug*. 250 frames is
~4.2 s of game time and takes the port ~1.5 s. Coarser blurs attribution; finer
re-seeds away the very drift being hunted.

---

## 2. THE CORRECTNESS CHECK, BEFORE ANY NEW CLAIM

The brief asks for a known result reproduced through the new mechanism first.
Two independent reproductions, both on `fly-around` (9 rungs, lf2000..4000):

**(a) The dumpers agree byte for byte.** `pgm.py ckpt fly-around --verify` asks
the SAME run for a wave-4 `PROBE_RAMDUMP` at lf2000 and for a wave-69 ladder
rung there:

```
[M] VERIFY wave-4 PROBE_RAMDUMP  lf2000  sha256=f5fb3cfd87483da2...701f3256
[M] VERIFY wave-69 ladder rung   lf2000  sha256=f5fb3cfd87483da2...701f3256
    IDENTICAL
```

**(b) The comparison agrees to the digest.** `portdiff.mjs` on the same trace,
once from the wave-4 seed and once from the ladder rung:

```
[M] RESULT 0 DIVERGENT FRAMES on 94 columns over 2200 logic frames
[M] DIGEST 021f24feace38e3f7bfad42223784deca81b457f6263204a057288338c4f8aef
    -- both times
```

That is wave 4's own result (`04-impl-skeleton-and-player.md`: fly-around, seed
lf2000, 2,200 compared). The brief remembered it as *"0 of 88 columns"*; the
corpus has grown to **94** since, and the number is re-measured here rather than
quoted.

**(c) And then the thing wave 4 could not do.** The same ladder swept as eight
independent 250-frame segments:

```
[M] SEGMENTS 8: 8 green, 0 red, 0 blocked, 0 SEEDBAD, 0 error
    2,000 logic frames compared, 12.3 s
```

`0 SEEDBAD` is the load-bearing number. `portdiff.mjs` refuses to proceed if the
port's state at the seed frame already disagrees with the board on any compared
column. Seven of those eight rungs (lf2250, 2500, 2750, 3000, 3250, 3500, 3750,
4000) are frames **nothing in this repo had ever seeded at**, and the port's
seeded state agrees with the board on all 94 columns at every one of them.

---

## 3. EVERY CHECK SEEN TO FAIL

```
[M] node seedcmp.mjs --break clamp-first
    RED OK: mutation 'clamp-first' turned 8 of 8 segments non-green, as it must
    first fields: b5@lf2089, then ptc/ptilt/pst/pf1/anima1/animb0@lf2321,
    px/paccx/o0x/o1x@lf2348, scroll/b016/b038/d16e/d172/d174@lf2441
[M] removing the mutation restores all 8 segment digests IDENTICALLY
```

The mutation is applied from OUTSIDE the port through `breakage.mjs`'s named
switch — no source file is edited, so "restore and verify byte-identical" is
proved by the digests rather than by a hash of a file I put back. This also
respects the wave's split: `games/ddpdoj/src/` belongs to T1 and I did not
write to it.

### THE SEED'S BG RING IS CAPTURED AND IS **NOT** LOAD-BEARING — measured, not assumed

`seedcmp --no-bg` drops `$900000` from the seed entirely:

```
[M] SEGMENTS 8: 8 green, 0 red, 0 blocked, 0 seedbad, 0 error
```

So the 4 KiB tilemap ring makes **no difference to any of the 94 compared
columns**. It is the exact structural analogue of the PPU nametable that
Gradius's wave 10 found missing from ITS seed, and it is now captured — but on
THIS column set it is dead weight, and saying so is the point. It matters to the
PICTURE, and the picture is not in this comparison. `--no-bg` exists so that
claim stays falsifiable when the compared set grows.

(Findings below are appended as they arrive.)
