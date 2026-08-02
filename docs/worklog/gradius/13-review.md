# Wave 13 review — the audio output path
status: DONE
wave: 13   role: review   started: 2026-08-01

Reviewed commits `237250a` and `2b35269` on `main`. I am a reader: I edited
`src/` only to apply and revert deliberate breaks, and every file is
byte-identical to HEAD afterwards (`git hash-object` vs `git rev-parse HEAD:<f>`
for all ten wave-13 files — all SAME). Nothing committed.

## The two questions I was asked first

**Is there a gate comparing emitted PCM against an emulator?** No, and I looked
for one rather than taking the claim. `grep -rl "wav\|pcm"` over
`games/gradius/tests/` and `games/gradius/tools/` finds only `audiohash.mjs`
(which hashes its own output and holds no reference) plus unrelated oracle
probes and `node_modules/jsnes`. `jsnes` is imported by five `tools/probe*.mjs`
recon scripts and by nothing in `tests/`. The sha256 `c75b7ab4…` appears in
exactly two places — a comment in `src/audio/apu.js` and the impl worklog — and
in **no** test, so there is not even a self-golden hash to rot.

**Is the synthesiser deterministic across processes or only within one?**
Genuinely across. A fresh `node` process reproduces the recorded run exactly:

```
node games/gradius/tools/audiohash.mjs --frames 600
frames 600  rate 48000 Hz  writes 977  samples 479210
range -0.249782 .. 0.259569   nonFinite 0
sha256 c75b7ab4d853a454450b23782de94a2489307a80f4bee67db46d295fecc2022c
```

identical to the worklog's digits. Rate is a real input, not decoration:
240 frames at 48000 → `d6ab725af0664bfb…`, at 44100 → `a75d8009ef51618d…`.
The file uses only `+ - * / Math.PI Math.floor` and IEEE-754 doubles (no
`Math.exp`, no clock, no `Math.random`), so cross-engine determinism is
well-founded rather than lucky.

## Did the corpus regress? No — I re-ran the whole gate

```
node --test games/gradius/tests/        349 pass, 0 fail, 0 skipped
node games/gradius/tools/test-all.mjs   GREEN -- 8 passed, 0 failed, 0 SKIPPED
  42 scenarios, 14098 of 14098 frames compared (0 truncated), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  0 display-list coverage failures, 0 video-coverage failures,
  0 deep-reach failures, 6 fields SKIPPED
  VIDEO COVERAGE: 0 nametable (30 strictly graded scenarios), 0 palette,
                  0 hardware-OAM bytes differ
  neuter lead1 249 / seed-x+1 167 / laginject 983 / seed-nt+1 1 / seed-pal+1 6
       / seed-coll0 105 / bullet-nosub 71  -- all RED
```

The display list is watched and it is clean. `scen.py` was not re-run and does
not need to be — I checked the mtimes myself: `objloop.lua` 01:56,
`probe.lua` 06:33, `scenarios.json` 12:42, `out/scen/*.json` 12:56-12:57.

## FINDING 1 — B13's stated cartridge fact is FALSE, and the test window is 92 frames short

This is the wave's headline finding and the reason given for it does not hold.

The claim, in the commit message, the impl worklog and in a comment inside
`tests/audio.test.js` (lines 95-108): *"this cartridge sets `$4000` bit 4
(constant volume) on every write … so no envelope decays, no length expires and
no sweep runs in any window the corpus can reach."*

Measured, over 900 frames of `audiohash.mjs`'s own scripted run, every distinct
value the driver writes to each register:

```
$400C distinct=2   04 x1   30 x6
$400F distinct=1   08 x1
$4001 distinct=1   30 x7      $4005 distinct=1  30 x9
```

`$400C = $04` has **bit 4 CLEAR**: that is the noise channel in ENVELOPE mode
with divider period 4, and `$400F = $08` gives it length index 1 = 254 half
frames. So an envelope genuinely decays on cartridge data. Over the run the
noise channel spends 15 frames in envelope mode, all of them with `length > 0`.
(The `$4001`/`$4005` half of the claim — sweep always `$30`, disabled — holds.)

I then re-ran B13 itself, without touching `src/`: I copied `apu.js` to a
sibling module, deleted the `dirty = true` at the frame-counter clock in the
copy, and rendered the same log through both.

```
400 frames: good 404eb429ade8aca2  B13 404eb429ade8aca2  DIFFER? false
900 frames: good 076c8f43411d13ac  B13 58e6b2210dbaedc0  DIFFER? true
frame 492  $400C = 04
frame 492  $400F = 08
FIRST SAMPLE DIFF at frame 492, sample 195
```

So B13 is **not** inert on the cartridge's own stream. It is inert only inside
the 400-frame window `test('the mixer cache is an optimisation and nothing
else')` uses, which stops 92 frames before the driver reaches the case. Raising
that `frames: 400` to ≥ 520 makes the cartridge-stream half catch B13 on its
own, with no constructed case needed.

The constructed case is still worth keeping. What must change is the three
places that record a cartridge fact that is not one — a wrong note in this repo
has misled somebody every time one was left behind (README rule 5).

## FINDING 2 — the backlog valve cannot open, and the thing that does grow has no ceiling

`src/main.js` clamps `acc = Math.min(acc + dt, period * 8)`, so at most **8**
logic frames are handed over per animation-frame callback, and `pump()` runs
unconditionally on every callback and drains the queue **completely**. Therefore
`queue.length` at pump entry is ≤ 8, always < `MAX_BACKLOG_FRAMES = 15`:
`emit` is always true, `dropped` can never increment, and `stats().backlog` is
read from `setInterval` outside a tick, when the queue is always empty. The page
shows `q0` for ever and `drop` never appears.

Simulated 10 minutes of the page's real loop shape against a fake context:
`maxQueue=1  dropped=0  underruns=0`, in every run.

The quantity that actually grows is `apu.out` — rendered samples not yet
scheduled — and it has no ceiling at all (`push()` just doubles the array).
Production is paced by `performance.now()`, consumption by the AudioContext's
own clock, and those are two different clocks in a browser:

```
30 simulated minutes, audio clock vs system clock:
  -100 ppm  lag 0.112 s   buffer   8192 samples  dropped 0  underruns 0
  -1000 ppm lag 1.734 s   buffer 131072 samples  dropped 0  underruns 0
  +1000 ppm lag 0.006 s   buffer   4096 samples  dropped 0  underruns 36
10 minutes at -5000 ppm: lag 2.94 s, buffer 262144 samples (1 MB), dropped 0
```

One direction self-corrects and is counted (`underruns`, and the resync is
audible as a gap). The other grows linearly and for ever, is A/V desync the
player will hear, and **not one of the three numbers on the page moves**.
`drain()` also `copyWithin`s the whole remaining buffer per 1024-sample chunk,
so the cost grows with the backlog.

The test that covers the valve queues 40 frames with no pump in between — state
`main.js` cannot produce. That is the "harness sets up state the app never has"
shape this project has been bitten by before. The valve belongs on
`apu.outLen`, not on `queue.length`, or `queue.length`'s ceiling belongs below
8 where it can be reached.

## FINDING 3 — the whole output filter stage is uncovered (2 breaks, both GREEN)

| break | result |
|---|---|
| N1 `hpCoef(90/440)`, `lpCoef(14000)` → `300/1200/3000` Hz | **GREEN, 36/36** |
| N2 `this.useFilters = false` unconditionally (filters deleted) | **GREEN, 36/36** |

A 3 kHz low-pass instead of 14 kHz, or no filter stage at all, passes every
check in the repo. These are exactly the "audible as balance and tone, not as a
wrong note" class the file's own header says only a human can catch — and there
is nothing at all constraining them, not even a coefficient assertion.

## FINDING 4 — the sweep unit's negate arms are uncovered (2 breaks, both GREEN)

| break | result |
|---|---|
| N3 drop the pulse-1 one's-complement `- 1` in `target()` | **GREEN, 36/36** |
| N4 `target()` ignores `swNegate` entirely (always adds) | **GREEN, 36/36** |

The comment at that line calls it *"the only behavioural difference between the
two channels and it is why they are one class with a flag"*, and it has no
witness. Measured above: the driver writes only `$30` to `$4001`/`$4005`, so no
cartridge-driven test can ever reach it — it needs a constructed case exactly
like B13's. The implementer named this as the next candidate; it is as bad as
suspected, and both arms are dead, not just the `-1`.

## The breaks that DID go red — the suite is live

| break | result |
|---|---|
| R1 `FC_HALF` step 4 → 0 (one half frame per sequence) | **RED, 2 tests** (`96/192 Hz`, backlog) |
| R2 `apu()` skips logging `$400B` | **RED, 5 tests** + `audiohash.mjs` aborts with the named bridge error |
| R3 B13 re-applied (`dirty = true` deleted at the FC clock) | **RED, 1 test** — and the cartridge-stream halves were byte-identical, exactly as reported |

R2 is the one the brief asked about: the bridge is not decorative. R3 reproduces
the implementer's account precisely — the constructed-envelope assertion is what
makes it red at 400 frames.

After each break the file was restored and verified:
`sha256 ca23ed0c…` for `apu.js`, `3ec3a895…` for `output.js`, and every wave-13
`src/` blob equal to its HEAD blob.

## FINDING 5 (informational) — the "stable ratio" is not that stable

Re-measured, best of 5 warm passes, 600 frames, same script:

```
BEST  logic 0.059  cache-on 1.208  cache-off 1.745 ms/frame  ratio 1.45
worklog: logic 0.031  cache-on 1.075  cache-off 1.807        ratio ~1.7
```

The absolute numbers sit inside the recorded 2x host-load spread, but the RATIO
the worklog nominates as *the* stable measurement moved 15%. The conclusion is
unaffected — the synthesiser costs 1-2 ms against a 16.64 ms budget and `nmi()`
well under 0.1 ms — but "the stable measurement is the ratio" should be softened
to "the ratio is stable to about 20%".

## What I verified as claimed, and did not find fault with

* **No PCM-vs-emulator gate**, and no golden hash asserted anywhere.
* **Cross-process determinism** reproduces the exact recorded digits.
* **The register stream is unchanged**: full gate green, `apuWrites`/`apuDigest`
  are TIER 1 compared fields, 14098/14098 frames, 0 failures.
* **The DMC claim is consistent with the port**: every `apu(state, …)` call site
  in `src/sound.js` (18 of them) passes an offset ≤ `$0F`, so `state.apuLog`
  can never carry `$4014`-`$4017` either; `$4010-$4013` and a 4-step `$4017`
  are named throws with tests behind them.
* **The 5-step frame sequencer is right**: `FC_STEPS`/`FC_QUARTER`/`FC_HALF`
  match the published mode-1 table doubled to CPU cycles, period 37282 → 48.0 Hz
  sequence, 96.0 Hz half, 192 Hz quarter.
* **`nmi()` clears `apuLog` above the `$8073` lock**, so a lag frame hands over
  an empty batch and still costs audio time — which is what the cartridge does.
* **The stale shared `.git/index` hazard is real.** `git status` reports the
  wave-13 files as `D`/`??`. I confirmed by blob hash that the working tree
  equals HEAD for all of them, and I did not touch the shared index.

## What I could not do

**I have no ears and no browser either.** Findings 3 and 4 make the human listen
more important, not less: the filter stage and the sweep are precisely the parts
where a wrong answer is audible and nothing in the repo would say so.

## If someone picks this up cold

The four things to do, in order of value:

1. `frames: 400` → `520` in `tests/audio.test.js`'s mix-cache test, and correct
   the "no envelope ever decays" sentence in that file, in
   `13-impl-audio-output.md` and in `237250a`'s message (a follow-up note, not a
   rewrite of history). Frame 492 writes `$400C = $04`.
2. Move the valve to `apu.outLen` (or cap it) and put that number on the page;
   `dropped` and `backlog` as they stand cannot move.
3. A constructed case for the sweep: both negate conventions, pulse 1 and
   pulse 2, same shape as the B13 envelope case.
4. Anything at all pinning the three filter cutoffs.
