# Wave 13 — Give the driver an audio output
status: DONE
wave: 13   role: impl   started: 2026-08-01 (date given in-session)

## The task, as I understood it

Wave 8 ported the `$ED02` sound driver STATE-EXACT: the port computes, per frame,
the exact sequence of `$4000-$400F` writes the cartridge makes, and that sequence
is a compared field (`apuWrites`, `apuDigest`) over the whole corpus. **Nothing
listened.** This wave builds the thing that listens — an NES APU synthesiser plus
a Web Audio path — so the owner can hear it.

Explicitly out of scope, per the brief and `games/ddpdoj/NOTES-sound.md`: a gate
comparing emitted PCM against an emulator recording. That claim inherits the
emulator's own reference-implementation guesses and is the weakest of the three
candidates despite being the easiest to build.

## Baseline, measured before I touched anything

```
node games/gradius/tools/test-all.mjs
  GREEN -- 8 passed, 0 failed, 0 SKIPPED
  42 scenarios, 14098 of 14098 frames compared (0 truncated), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  0 display-list / video-coverage / deep-reach failures, 6 fields SKIPPED
node --test games/gradius/tests/    318 pass, 0 fail, 0 skipped
```

## What I built

| file | what it is |
|---|---|
| `games/gradius/src/audio/apu.js` | **the chip.** Two pulses, triangle, noise, the 5-step frame sequencer, envelopes, sweep, the linear counter, length counters, the LFSR, the exact non-linear mixer and the console's 90 Hz / 440 Hz / 14 kHz output filters. Knows nothing about browsers. |
| `games/gradius/src/audio/output.js` | **the only file that touches Web Audio.** One batch of register writes per LOGIC frame goes into a queue; `pump()` turns queued batches into samples and schedules them contiguously on the AudioContext's clock. Autoplay handling, mute, the backlog valve. |
| `games/gradius/tools/audiohash.mjs` | boots the port headlessly, plays a fixed button script, hashes the samples. The cross-process determinism check, and it re-derives `work.apuDigest` from the write log on every frame. |
| `games/gradius/tests/audio.test.js` | 27 checks (see below). |
| `src/state.js` / `src/sound.js` / `src/nmi.js` | `state.apuLog` — the frame's writes kept in ORDER rather than only hashed. Three lines. |
| `src/main.js` | one batch per logic frame **inside** the catch-up loop; `pump()` once per animation frame, after the picture. |
| `index.html` | the mute button, the "sound starts on your first key or tap" note, audio numbers in the stats line. |
| `games/gradius/README.md`, `game.json` | stale text, fixed in the same commit (rule 5). |

### The DMC question, answered by measurement rather than assumed

The brief said "DMC if the game uses it (find out; do not assume)". A decode of
**every byte offset** in the whole 32 KB PRG for absolute / absolute,X /
absolute,Y operands naming `$4000-$401F` gives 44 hits and this set of bases:

```
$4000 $4001 $4002 $4003 $4007 $4008 $4009 $400C $400E $4014 $4015 $4016 $4017
```

No `$4010`, `$4011`, `$4012` or `$4013` anywhere — and several of those 44 are
data bytes inside sequence streams, not instructions. The only indexed writes
that could walk into the DMC's registers are the driver's `STA $4000,X` /
`STA $4003,X` family, and X there is `$F9`, the APU offset, which `$ED3E` only
ever advances 0, 4, 8, `$0C` — so `$400F` is the highest address reachable.

So **the DMC is not used**, and `write()` THROWS on `$4010-$4013` rather than
ignoring them. `$4015 = $1F` at `$81AD` does enable the channel; nothing ever
feeds it.

### The one cartridge fact that is the most audible thing in the file

```
81AB  A9 1F     LDA #$1F
81AD  8D 15 40  STA $4015     all five channels enabled
81B0  A9 C0     LDA #$C0
81B2  8D 17 40  STA $4017     FRAME COUNTER: 5-STEP MODE, IRQ inhibited
```

Both run once at power-on, upstream of every window the corpus compares, so the
port never writes them and `reset()` has to install them. **In 5-step mode the
length counters and sweeps clock at 96.0 Hz instead of 120.0 and the envelopes
at 192 instead of 240.** A synthesiser that took the 4-step power-on default
would play every note 25% short and every envelope 25% fast. `tests/audio.test.js`
counts both rates over exactly one second of CPU time.

### The bridge: what the synthesiser eats is what the corpus checked

`apu()` in `src/sound.js` already computed `apuDigest = h*31 + (off<<8) + v` over
its writes, in order, and that digest is a TIER 1 compared field on all 42
scenarios. `state.apuLog` keeps **the same pairs in the same order**, and
`audiohash.mjs` re-derives the digest from the log on every frame and aborts if
they ever disagree. That is the only honest way to connect wave 8's claim to this
wave's output: the samples are computed from bytes that were measured against the
cartridge, not from a second unverified copy of them.

(The register SHADOW could not have been used: it loses the order and it loses
repeated writes of the same value — and the whole point of `$EF85`'s retrigger
guard is that writing `$4003` *again* restarts the length counter.)

### Audio timing — the input-granularity problem, on the other side of the loop

`13-FINDING-input-granularity-under-load.md` recorded that the frame loop runs up
to 8 logic frames in one animation-frame callback. For the picture that is
invisible; for the sound driver it is 8 ticks of `$ED02` in a burst. So:

* `src/main.js` hands over **one batch per logic frame, inside the catch-up
  loop**. A burst of k frames becomes k queued batches.
* `src/audio/output.js` renders and schedules on the **AudioContext's** clock,
  contiguously. k frames of logic become k frames of audio played over k frames
  of time.
* **Nothing runs the other way.** No game-visible value depends on the audio
  clock or the sample rate — `games/ddpdoj/NOTES-replay.md` constraint 1.
* Past a 15-frame (250 ms) backlog the valve opens: batches are still APPLIED to
  the chip (so envelopes, length counters and the LFSR stay correct) and their
  samples are discarded. The music skips forward rather than drifting further
  behind for ever, and the dropped count is **on the page**.

**Note left for wave 14 at the same seam in `src/main.js`:** `currentButtons()`
is still read k times per callback and all k reads return the same word. The fix
has the same shape as the audio line — one input word per logic frame, from a
queue — and belongs on the adjacent line. Audio neither depends on it nor blocks
it.

### Autoplay: what the page actually does

The AudioContext is **not constructed at all** until the first `pointerdown` or
`keydown` (capture-phase listeners on `window`, so they run before the pad's own
handlers). Until then the HUD reads *"Sound starts on your first key or tap"* and
batches are dropped rather than queued, so nothing accumulates. If the browser
has no Web Audio the note says so. **The game runs at full speed regardless** —
audio never gates the simulation. A `♫ sound on` / `♫ muted` button sits beside
the stats; muting sets the gain to 0 and **keeps the synthesiser running**, so
unmuting resumes exactly where the music got to instead of restarting a note
whose envelope had stood still.

## What I MEASURED

### The register stream is UNCHANGED by this wave

```
node games/gradius/tools/oracle/compare.mjs
  42 scenarios, 14098 of 14098 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  0 display-list coverage failures, 0 video-coverage failures,
  0 deep-reach failures, 6 fields SKIPPED
```

Byte-for-byte the baseline. `apuWrites` and `apuDigest` are in that comparison,
so "the driver still writes what the cartridge writes" is checked, not asserted.

### Cost, because nobody in this project had ever measured a frame's cost

`13-FINDING-input-granularity-under-load.md` says in as many words: *"Nobody has
ever measured how long one logic frame takes in the browser. The gate measures
CORRECTNESS, never COST."* This wave had to, because it was about to add work to
the same loop. 600 frames of `tools/audiohash.mjs`'s scripted run, node 20 on the
owner's machine, three passes (the first is JIT warm-up):

```
pass 0  logic 0.108 ms/frame   synth 1.079 ms/frame
pass 1  logic 0.089 ms/frame   synth 0.772 ms/frame
pass 2  logic 0.027 ms/frame   synth 0.608 ms/frame
```

against a **16.64 ms** budget. So `nmi()` — every subsystem the port has, waves 1
to 12 — costs well under a millisecond a frame headlessly, and the synthesiser
costs about the same again. That does not settle the owner's report (the browser
also renders 61,440 pixels a frame and node is not Chrome), but it does say the
suspect is not `nmi()`.

The synthesiser's inner loop runs 1,789,773 times per second of audio, so the
mixed level is CACHED and only recomputed when a sequencer steps, an LFSR shifts
or the frame counter clocks. Measured both ways on the same run: **0.608 ms/frame
with the cache, 1.000 ms/frame without**, and the sample hash is IDENTICAL either
way (`68aa45aa23edb80e...`), which is how the cache was checked rather than
assumed.

### The gate, after

```
node --test games/gradius/tests/      349 pass, 0 fail, 0 skipped   (was 318)
node games/gradius/tools/test-all.mjs
  GREEN -- 8 passed, 0 failed, 0 SKIPPED
  42 scenarios, 14098 of 14098 frames compared, 0 failures
  neuter lead1          -> RED, 249 TIER 1 failures
  neuter seed-x+1       -> RED, 167
  neuter laginject=450  -> RED, 983
  neuter seed-nt+1      -> RED, 1
  neuter seed-pal+1     -> RED, 6
  neuter seed-coll0     -> RED, 105
  neuter bullet-nosub   -> RED, 71
```

### TWENTY-ONE DELIBERATE BREAKS, and the one that survived

Each break was applied to `src/audio/apu.js`, `src/sound.js`,
`src/audio/output.js` or `index.html`, `node --test` re-run over
`tests/audio.test.js` + `tests/page-wiring.test.js`, then restored byte-identical.
Baseline: 0 failures.

| break | result |
|---|---|
| B1 noise mode-1 feedback taps bit 1, not bit 6 | RED (LFSR period 32767 instead of 93) |
| B2 `NOISE_PERIODS` read as APU cycles (halved) | RED (published frequency table) |
| B3 noise timer counts `period+1` (the pulse convention) | RED (measured shift rate) |
| B4 pulse ignores its length counter | RED |
| B5 pulse ignores the `period < 8` mute | RED |
| B6 triangle runs with a linear counter of 0 | RED |
| B7 triangle runs with a length counter of 0 | RED |
| B8 frame counter in 4-step mode | RED (96/192 Hz, **and** the backlog test) |
| B9 the folded `3*tri + 2*noise` mixer approximation | RED |
| B10 duty 0 is 25% instead of 12.5% | RED |
| B11 the envelope divider period is V-1 | RED |
| B11b the envelope start flag does not reload the decay to 15 | RED |
| B12 a DMC write is silently ignored | RED (2 tests) |
| B13 the frame counter's clocks do not dirty the mix cache | **SURVIVED — see below** |
| B14 a nanovolt of `Math.random()` in the output | RED (3 determinism tests) |
| B15 the write log misses one register (`$4002`) | RED (5 tests, incl. the digest bridge) |
| B16 the write log is never filled | RED (5 tests; "this is silence, not audio") |
| B17 the backlog valve renders everything | RED |
| B18 chunks all scheduled at the same instant | RED |
| B19 the AudioContext is built at load, before any gesture | RED |
| B20 the mute button does not blur itself | RED |

**B13, THE ONE THAT SURVIVED, AND WHY — this is the finding.** Deleting
`dirty = true` at the frame-counter clock leaves stale audio for up to one timer
period and the test comparing the cached mixer against the uncached one **stayed
green on the cartridge's own register stream**. The reason is a fact about this
cartridge, and it is worth writing down:

* `$EDD1` / `$EF2C` write `$4000` with bit 4 (constant volume) SET — **no
  envelope in this game ever decays**, so a quarter frame changes nothing;
* `$EF9B` writes `$4003` with the period's high bits ORed with `$08`
  (`$EF7B ORA #$08`), so the length index is always `1` = **254 half frames**
  ≈ 2.6 s, and no length counter expires inside a compared window;
* `$EDF9`'s only sweep operand in this data is `$30` — **sweep disabled**.

So on real cartridge data a half or quarter frame never alters a channel's level
between two timer steps, and the break was genuinely inert. **Closed** by
constructing the case the cartridge does not provide: `$4000 = $A5` — 50% duty,
bit 4 CLEAR, i.e. a real envelope decaying 192 times a second — rendered with the
cache and without it and required to be bit-identical. Seen red against B13
afterwards.

That is the same shape as wave 8's B3/B6: a behaviour whose only witness has to
be built, because the game never does it.

### The determinism claim, spelled out

```
node games/gradius/tools/audiohash.mjs --frames 600
frames    600
rate      48000 Hz
writes    977
samples   479210
range     -0.268672 .. 0.270326
nonFinite 0
sha256    68aa45aa23edb80efbd28c59282428d3210accdff6c0ff8ffb2dbadc36964b98
```

Two runs in one process agree; two separate `node` processes agree; and the
separate process agrees with the in-process computation (so "deterministic" does
not quietly mean "deterministic inside a test runner"). A different sample rate
is required to give a DIFFERENT hash — the rate is an input to the answer, not a
constant, and a hash that ignored it would be a hash of nothing.

No `Math.random`, no clock, no `Math.exp` (the filter coefficients use the RC
one-pole form, which is `+ * /` and `Math.PI` only — `Math.exp` is not required
by ECMA-262 to return the same bits on every engine, and this file's whole gate
is that it does).

## What I could not do, and why

* **I HAVE NO EARS AND NO BROWSER.** Nothing in this wave is evidence that it
  sounds right. It is evidence that the register stream is the cartridge's, that
  the synthesiser is a function of it, and that a list of structural properties
  holds. **A human has to listen**, and the things a human should listen for are:
  the balance between the pulses and the triangle/noise group (a wrong mixer is
  audible as balance, not as a wrong note); whether notes are the right LENGTH
  (that is the 5-step frame counter); and whether the music stutters when the
  page is under load (that is the backlog valve and the queue).
* **The intra-frame position of the writes is not modelled.** All of a frame's
  writes are applied at the frame boundary. The justification is measured rather
  than assumed — this cartridge has no main loop, `$806A`'s NMI handler is the
  whole game, so every APU write in a frame happens inside one handler within a
  few thousand CPU cycles of the frame's start, which is well under one output
  sample at 48 kHz. The ORDER is preserved exactly; only the spacing is not.
* **The triangle's `period < 2` silence is an emulation convention, not a
  translation.** Real hardware emits an inaudible ultrasonic tone; a
  point-sampled model turns it into broadband alias noise. Flagged at the line.
* **No AudioWorklet.** The output path schedules `AudioBufferSourceNode`s from
  the main thread. An AudioWorklet would survive a main-thread stall better, but
  it would still be fed by the main thread, so the failure mode is the same one;
  and ES-module imports inside `AudioWorkletGlobalScope` are not uniformly
  supported. Recorded as the obvious next step if the owner hears stutter that
  the backlog counters do not explain.
* **`scen.py` was not re-run**, and here is the freshness check instead of the
  assertion. `scen.py`'s output depends on three things and nothing else: the
  cartridge, `scenarios.json`, and the two Lua scripts. I changed none of them,
  and the recordings are NEWER than all three:

  ```
  objloop.lua      2026-08-01_01:56
  probe.lua        2026-08-01_06:33
  scenarios.json   2026-08-01_12:42
  out/scen/*.json  2026-08-01_12:56-12:57   (recorded by wave 12, after its
                                             scenario changes)
  ```

  So a re-record would reproduce the same artifacts at the cost of an hour of
  emulator time on a machine several agents are sharing. `compare.mjs` consumed
  that recording and was green. Say so rather than imply a re-record.
* **`$4015` and `$4017` are seeded, not ported.** They are written once at
  `$81AB-$81B2`, which is upstream of every window this corpus compares, and the
  port has no code path that can produce either. A 4-step `$4017` write is a
  throw for exactly that reason.

## If someone picks this up cold

```
node games/gradius/tools/audiohash.mjs                 # the determinism hash
node --test games/gradius/tests/audio.test.js          # 27 checks
node --test games/gradius/tests/page-wiring.test.js    # the page's audio wiring
node games/gradius/tools/test-all.mjs                  # the gate
python -m http.server 8000                             # then /games/gradius/
```

`src/audio/apu.js` is the chip and carries almost no ROM addresses on purpose —
there is no cartridge code in it. The four cartridge facts it does depend on
(`$4015 = $1F`, `$4017 = $C0`, no DMC anywhere, the driver's APU offset never
exceeding `$0C`) are cited at the lines that use them.

**The three things a reviewer should look at hardest:**

1. **The bridge, and whether it can rot.** `state.apuLog` and `work.apuDigest`
   are computed in the same function two lines apart, and `audiohash.mjs` checks
   they agree per frame. If a future wave adds an APU write that bypasses
   `apu()`, the digest and the log go wrong TOGETHER and the bridge would not
   notice — the corpus would, because `apuDigest` is compared against the
   cartridge, but say out loud that the bridge alone is not enough.
2. **B13, and what it says about the corpus.** The cartridge's own register
   stream cannot exercise an envelope, an expiring length counter or a sweep.
   That is not a gap in the synthesiser; it is a gap in what any test driven by
   THIS GAME'S data can ever reach, and it is why the constructed case exists.
   Anything else in `apu.js` that only real data would exercise is in the same
   position — the sweep unit's negate arms are the obvious next candidate and
   they are currently covered only by the mute test.
3. **The backlog valve's numbers.** `MAX_BACKLOG_FRAMES = 15`, `LOOKAHEAD_S =
   0.12`, `CHUNK = 1024`, `START_LATENCY_S = 0.05`. Those are reasoned, not
   measured against a real browser under real load, because I have no browser.
   The counters that would show them to be wrong (`drop`, `under`) are on the
   page for exactly that reason.
