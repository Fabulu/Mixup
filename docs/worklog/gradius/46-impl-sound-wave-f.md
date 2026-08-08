# 46 -- IMPL SOUND WAVE F (the shared Web Audio shim, proven on Gradius)

Status: DONE

Wave F of the DOJ sound port (per docs/worklog/ddpdoj/135-sound-architect-plan.md
section 2). This wave is INDEPENDENT of the DOJ chip: it lifts Gradius's proven
audio output path into a NEW `shared/audio.js`, adds the two things Gradius does
not need but DOJ will (a boundary resampler and stereo), and moves Gradius onto
the shared shim. The proof that the shim works is that the Gradius gate stays
green.

## PREMISE CHECK (the brief said to verify before refactoring)

- `games/gradius/src/audio/output.js` (234 lines) holds the chip-agnostic core
  (queue, pump, backlog valve, underrun resync, autoplay/unlock, mute-keeps-
  running, try/catch firewall, stats) AND the chip-specific bit (`new NesApu`).
  Confirmed: the split point is exactly where the architect drew it.
- `games/gradius/src/audio/apu.js` NesApu exposes `frame(log, emit)`,
  `drain(n, dest, destOffset)`, `outLen`. Its `drain` is mono-single-dest and is
  called directly by `tools/audiohash.mjs` and `tools/framecost.mjs`, so the chip
  itself stays UNCHANGED (those callers and the deterministic sample hash must
  not move). The shared shim adapts it through a factory, not by editing NesApu.
- `tests/audio.test.js` reaches into `a.out.apu.{outLen,p1.length}` and
  `a.out.{ctx,dropped}`. After the lift, `a.out` is the shared `AudioOut` whose
  chip is a small adapter around NesApu, so those three test lines move from
  `a.out.apu.X` to `a.out.chip.apu.X` / `a.out.chip.outLen`. That is the only
  test-side change; the page-facing `GradiusAudio` API (`arm/frame/pump/setMuted/
  stats/status/muted/onError`) is unchanged, so index.html and main.js do not
  move.
- The Gradius FakeCtx (audio.test.js) and FakeAudioContext (page-wiring.test.js)
  do NOT implement `createDynamicsCompressor`. The new final limiter is therefore
  created ONLY when the host supports it; under the fakes the graph is
  gain -> destination, exactly as it was before. No test fake needs editing.

## SCOPE (what this wave ships)

1. `shared/audio.js` (NEW): the chip-agnostic `AudioOut` (queue, pump, backlog
   valve, underrun resync, mute-keeps-running, try/catch firewall, stats), the
   page-facing `AudioController` (autoplay/unlock, firewall, stats), a streaming
   cubic `Resampler` (the ONE new primitive), and a transparent final limiter.
   Chip injected via `makeChip(rate) -> { frame(log, emit), drain(n, dests),
   outLen, sourceRate, channels }`.
2. `shared/audio.test.js` (NEW): tests for the resampler (same-rate passthrough,
   up/down ratios, sine frequency, streaming chunk seams, multi-channel sync) and
   for the engine (fake chip + fake ctx: contiguous scheduling, backlog valve,
   underrun resync, firewall).
3. `games/gradius/src/audio/output.js` (REWRITE to a thin wrapper): `GradiusAudio
   extends AudioController`, `makeChip` wraps `new NesApu(rate)` with
   `sourceRate = rate` (so the resampler is a no-op for Gradius) and
   `channels = 1` (mono drain). The Gradius audio path is functionally unchanged;
   it just goes through shared/audio.js instead of its own copy.
4. `tests/audio.test.js`: three accessor lines renamed (see premise check).

## NOT IN SCOPE (deferred)

- The DOJ ICS2115 chip (Wave E). The resampler + stereo + limiter are wired but
  DORMANT for Gradius; DOJ adopts the shim when its synth lands.
- AudioWorklet. AudioBufferSourceNode scheduling (Gradius's proven pattern) is
  used now; the synth is behind an interface so a Worklet migration is a
  scheduler swap later.

## DESIGN DECISIONS

- Resampler is CUBIC Hermite, streaming, multi-channel. It owns a per-channel
  input window + a per-channel output accumulator, so AudioBuffers of fixed
  CHUNK size are scheduled from its output without per-chunk exact-count games.
  Linear was acceptable per the plan; cubic is the recommendation, and the
  structure allows a swap.
- Limiter is a `DynamicsCompressorNode` at 0 dBFS / hard knee / ratio 20:
  transparent below 1.0 (Gradius peaks at 0.5, bit-identical through it),
  protection for a 32-voice sum. Created only when the host supports it.
- The chip adapter carries the raw `apu` (for tests and debug) alongside the
  shared-method surface.

## GATES

- `node games/gradius/tools/test-all.mjs` -- GREEN, 13 passed, 0 failed, 0 SKIPPED
  (THE proof; the corpus comparison is 47 scenarios / 29693 frames, 0 failures).
- `node --test games/gradius/tests/` -- 745/745 pass.
- `node tools/test-all.mjs` -- Batman ALL GREEN, 27/27, 0 skipped (no cross-game
  breakage from the shared/ dir).
- `node --test shared/` -- 30/30 pass (13 input + 17 audio).

## RESULT

Shipped: `shared/audio.js` (the chip-agnostic engine + controller + cubic
streaming resampler + transparent limiter), `shared/audio.test.js` (17 tests),
the Gradius `output.js` rewrite to a thin wrapper, and 3 accessor-line renames
in `tests/audio.test.js`. Nothing deferred: the Gradius migration went in and its
gate is the proof. The resampler + stereo + limiter are wired but dormant for
Gradius (sourceRate === ctx.sampleRate, mono); DOJ adopts them in Wave E.

NesApu (`games/gradius/src/audio/apu.js`) is UNCHANGED, so the deterministic
sample hash and the direct callers (audiohash.mjs, framecost.mjs) do not move.
