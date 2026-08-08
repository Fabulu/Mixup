# W156: implement the sound/Game runtime bridge

**Status: DONE**

The owner clarified on 2026-08-08 that sound remains first. The live chain
counter, decay, gauge fill, and hyper-feed defect is the next mandatory gameplay
wave after sound and is not reduced to an art-only issue.

Bridge real `Game.step()` four-byte sound doors through the live Layer 3
drivers, Layer 2 register emitter and W155 ICS2115 core without choosing W154's
unresolved pan or endpoint policies. Browser audio wiring remains deferred.

## 1. Premise and ownership verdict

The premise held at live HEAD `41638d9`, with two bounded corrections found by
exercising the complete route.

`Game.step()` already drained exactly one real four-byte 68k/Z80 door after its
producers and before `logicFrame++`, but stopped at `SoundState`. `SoundChain`
already owned the live SFX/BGM grammar and `VoiceEngine`; `Ics2115Core` already
owned the 33,075 Hz clock and stereo FIFO. The missing piece was one owner that
joined them and fed hardware IRQV back into the exact driver release path.

The ownership contract is now:

```text
Game.step
  -> Uint8Array(0) or Uint8Array([type, pan, id, packedChannel]) exactly once
  -> injected soundSink.frame(input)

SoundRuntime (the chip object)
  -> SoundChain dispatch/scheduler/VoiceEngine
  -> Ics2115Core.frame(registerLog, emit, nativeBoundaryCallback)
  -> drain(n, [left, right])
```

`Game` does not construct assets, a synthesizer, or a second clock. With no
`soundSink`, existing unit/non-web callers behave as before and merely expose
the compact `soundInput`. The future `AudioController` must be the injected
sink and must construct `SoundRuntime` inside its `AudioOut` chip factory. Its
existing queue then calls `SoundRuntime.frame()` once. Injecting the same
runtime both directly into `Game` and into `AudioOut` is forbidden because it
would double-advance the native clock.

Sound runtime state is deliberately external to gameplay save/reset/digest
state: no sound result feeds game simulation, and no new save-state claim is
made.

## 2. Live runtime and IRQ bridge

`src/soundruntime.js` adds the policy-neutral shared-audio chip contract:

- strict `driverParamsFromJson`, `scoreFromJson`, `IcsSampleMap` rehydration;
- loud missing/malformed asset rejection and no full-ROM fallback;
- strict zero-or-four-byte per-frame input validation;
- exact four-byte selector/channel decoding through `SoundChain.enqueueDoor`;
- one Layer 3 scheduler tick and one Layer 2 `VoiceEngine` tick per logic frame;
- one 558/559-carrying ICS native-frame batch per logic frame;
- stereo FIFO delegation through `{frame, drain, outLen, sourceRate, channels}`;
- cmd `$0E` retention at the FIFO head until the next complete four-byte record
  arrives on a later Game frame.

The core now offers a callback after each completed native stereo frame. At
that boundary the runtime drains every asserted IRQV in the chip's round-robin
order, calls the listing-derived `VoiceEngine.releaseVoiceIfBusy(voice)`, sends
the resulting exact `$0A0C` keyoff rows back into the core immediately, and
continues native service. This clears oscillator IRQ state, frees `$654E`'s
allocator shadow, and permits later reuse. An asserted IRQ with no live driver
binding or an IRQ that fails to clear throws loudly.

The listing proves IRQV -> `$1000` -> `$3F22` -> `$0A0C/$3F11`, but does not
measure exact Z80-cycle latency. Therefore this boundary has no default and is
named explicitly:

```text
irqTimingPolicy: "after-native-frame"
```

Construction also still requires W154's explicit `panPolicy` and
`endpointPolicy`. No center-pan number or endpoint authenticity choice entered
production. Both endpoint mechanics are tested only with a clearly synthetic
unit pan policy.

## 3. Two corrections discovered by integration

### OscStrt is not an initial-phase lower clamp

The real stage-clear cue 9 emits initial accumulator `$13FBE000` below its
forward-loop return boundary `$142B2800`, while remaining below OscEnd
`$14371000`. Thus `OscStrt` is a loop return point, not a lower bound on the
attack. `Ics2115Core` now accepts that live arrangement while still refusing
reversed start/end and initial phase beyond end.

### The captured shard needed interpolation neighbours

A long real looping SFX reached `$4DC254` with a fractional phase and correctly
read `$4DC255` as the second byte of nine-bit interpolation. W140's captured
windows ended before that byte. Strict crossing may render OscEnd itself and
then read OscEnd+1, so each of the 28 measured fragments now includes exactly
two bytes beyond the captured OscEnd. They remain sorted, disjoint and far from
a full-ROM fallback.

```text
sample.shard.u8.gz    1,162,927 B compressed; 1,538,976 B raw
sample.index.json.gz       906 B compressed;     2,538 B raw
28 fragments; exactly +56 raw bytes over W155
```

`export-tables.py`, `export-web.mjs`, and `soundd.test.js` all derive/check the
same extent. The regenerated artifacts and manifest passed the publish
firewall with the existing six exceptions and no new `PUBLISH_VERBATIM` entry.

## 4. Focused proof and deterministic results

`tests/sound-runtime.test.js` has nine focused checks, all green with no skip or
todo:

1. exact empty/four-byte Game boundary and no-sound compatibility;
2. asset/input/pan/endpoint/IRQ-policy refusals;
3. real `$28C714` Game wrapper -> selector 36 -> keyon -> PCM -> IRQV -> exact
   keyoff, followed through voices 8..31 and reuse of voice 8;
4. real `$28CB9C` streaming leaf -> type `$12` cue 0 -> scheduler -> registers
   -> nonzero stereo samples -> runtime drain;
5. the real cue-9 attack-before-loop register episode;
6. exact 264-frame fractional clock and `emit=false` state identity;
7. strict-crossing shard-edge interpolation under the synthetic policy;
8. two same-native-boundary IRQs serviced in IRQV order 8,9;
9. cmd `$0E` waiting for its next complete Game record.

Stable hashes under `synthetic-unity-structural-test` (not hardware amplitude):

```text
25 real Game SFX frames  f6bcccff9cd6239471fa01909def56a89600b48fee1fd5886b0c3ab2ac0dad11
real BGM cue-0 frame     77c2814d45b59d0db354dc61de885117049852585ee6b7bf4385c87a76b501ae
```

## 5. Deliberate red mutations

Every mutation was applied with `apply_patch`, observed red, and reverted:

1. disabled the `Game -> soundSink.frame` call: the real SFX check saw a null
   runtime door (`Cannot read properties of null (reading 'selector')`);
2. allowed an omitted IRQ timing policy: refusal coverage reported `Missing
   expected exception`;
3. removed the native-boundary IRQ callback: multi-IRQ coverage failed at the
   callback contract instead of producing voices 8,9;
4. passed the score root instead of its cue array: the real BGM leaf failed on
   undefined `cue.tracks`;
5. changed the native numerator from `*264` to `*265`: the 264-frame total
   became 148,091 instead of 147,532;
6. dispatched a lone cmd `$0E`: it threw `cmd $0E needs its next queue record`;
7. shortened every sample fragment from OscEnd+1 to OscEnd: the exporter gate
   rejected the declared/measured unions;
8. restored the old `phase < OscStrt` refusal: cue 9 failed with exact range
   `start=338372608 phase=335273984 end=339152896`;
9. placeholder PCM hashes were deliberately observed red before freezing the
   two hashes above.

## 6. Final gates

```text
node games/ddpdoj/tools/w150soundrecon.mjs
  200 checks green; cue8 events=141

node games/ddpdoj/tools/w151icsrecon.mjs
  21 checks green; 1,620 keyons; 1,501 sharded windows

focused sound tests
  55/55 green before the final W156 drain/phase checks; zero skip/todo

node --test games/ddpdoj/tests/
  1,389 passed; 0 failed/cancelled/skipped/todo

node games/ddpdoj/tools/bundlegate.mjs ...
  15,955,968/15,955,968 pixels identical over 159 frames

node games/ddpdoj/tools/webgate.mjs --assets games/ddpdoj/assets
  15 files fetched; all downstream web checks green

node tools/publish.mjs --only ddpdoj --dry
  1,389/0/0/0/0 tests; bundle/web green
  ROM-leak guard clean: 279 files, 53 decompressed, 12 ROMs
  exactly 6 pre-existing deliberate exceptions; no new exception
  dist: 283 files, 8,775 KB; dry only, not deployed
```

`git diff --check` is clean. No deployment was attempted.

## 7. Remaining explicit boundaries

- Browser asset loading and `AudioController` construction are still unwired.
- No authentic audible runtime can be constructed until an owner/physical-board
  result supplies both center-pan and endpoint policies.
- The `after-native-frame` IRQ service point is a named deterministic mechanic,
  not a measured Z80-cycle latency claim.
- The deferred sample shard remains the captured stage-1 union. Some valid
  later cues (for example cue 9's `$69FDF0` attack) correctly reach register
  writes but then refuse outside-shard sample reads. A later evidence-driven
  asset expansion is required; the runtime will not substitute the full ROM.
- Unsupported ICS formats, directions, non-center pan and live ramps remain
  loud W155 refusals.
- Sound remains non-audible in the browser in this wave, so nothing was
  deployed and no audible-completion claim is made.
