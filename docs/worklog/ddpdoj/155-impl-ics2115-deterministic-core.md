# W155: implement deterministic ICS2115 core

**Status: COMPLETE**

Implemented the authentic exercised ICS2115 subset established by W151, while
keeping W154's center-pan gain and endpoint edge as explicit required policies.
Game/browser wiring and any claim of audible completion remain outside W155.

## 1. Premise audit

Work began on live HEAD `d36aa4d` (W154). W151's executable checker, the
191,367-row register capture, the current register/voice layers and the
deferred shard/index agreed on the binding subset:

- `ActiveOsc=$1F`, hence `33,868,800 / (32*32) = 33,075 Hz`;
- 1,620 keyons, all signed linear-8; audible `OscConf` is exactly `$00/$08/$20`;
- `$08` is bit-3 forward loop, `$20` is bit-5 oscillator IRQ one-shot, `$00`
  is the silent-completion one-shot, and `$A0` occurs only in three reset writes;
- the accumulator is 29-bit 20.9 and advances by `OscFC >>> 1`;
- every keyon has `VCtl=$03`, `VMode=$00`, pan `$7F`, and static `VolAcc`;
- the index is 28 disjoint 24-bit fragments packing 1,538,920 raw bytes.

W154 remained binding. Neither physical center-pan gain nor equality versus
strict-crossing has new primary evidence. No default was selected.

## 2. Implementation

`src/ics2115.js` adds the deterministic, adapter-ready core:

- `{ frame(log, emit), drain(n, dests), outLen, sourceRate, channels }`, with
  `sourceRate=33075` and stereo `channels=2`;
- exact rational scheduling against DOJ's `15625/264` logic rate, producing
  558/559 native frames while retaining the fractional remainder;
- signed-byte expansion, exact nine-bit interpolation, static logarithmic
  pre-pan gain, 29-bit phase, forward loop overshoot and forward one-shot state;
- both named endpoint mechanics (`equality`, `strict-crossing`) with no default;
- a mandatory named pan policy with no production/default implementation;
- packed `IcsRegisterFile.regLog` replay in row order;
- oscillator IRQ status, round-robin IRQV selection, consume/reassert behavior,
  and keyoff removal of the source;
- `emit=false` runs identical services and state transitions but buffers no PCM;
- strict sample-index validation and 24-bit fragment lookup. Missing bytes and
  gaps throw; there is no full-ROM fallback.

Unsupported mu-law, 16-bit, reverse, bidirectional, non-center pan, live volume
ramps, other active-oscillator counts, and unknown OscCtl/OscConf values throw.
`$A0` is accepted only as the reset-only configuration and cannot be keyed on.

`src/ics.js` now names the settled `$06-$0B` fields and corrects the old format
bit comment. `src/voice.js` no longer maintains the fictional logic-frame
`oscCountdown`, bit-1 loop state, or a parallel IRQ walker. It remains the exact
Z80 register emitter; native oscillator/IRQ state belongs only to the chip core.

## 3. Focused coverage and deterministic hashes

`tests/ics2115.test.js` has 12 focused checks covering:

1. every W151 arithmetic/rate vector;
2. every edge of the real 28-fragment shard and loud gap refusal;
3. malformed index/topology/bounds/body rejection;
4. mandatory pan/endpoint policies and both endpoint mechanics;
5. all live `$00/$08/$20/$A0` configurations and loop overshoot;
6. all named unsupported-mode refusals;
7. IRQ ordering, consume/reassert and a real `VoiceEngine` keyoff handshake;
8. `emit=false` state identity;
9. exact 558/559 multi-frame scheduling;
10. a real `VoiceEngine` register log reaching samples and the drain contract.

The test-only unit-center policy is explicitly non-authoritative and is defined
only in the test file. It supplies no hardware gain number. Its stable hashes:

```text
pre-pan SHA-256  a3622101a8d107a750351f62a91388bc6008d6cce10922fb7b3abf7803629dfd
stereo PCM SHA-256 564b35650cc7faa4114eda8b0cd78fd28d9edcfef89f973ea75acc664a0c7e8e
```

## 4. Deliberate red mutations

Each mutation was applied with `apply_patch`, observed red, then reverted before
the focused gate was rerun 12/12 green:

1. `OscFC >>> 1` -> `>>> 2`: endpoint test stayed running, loop overshoot was
   384 instead of 256, and both hashes changed.
2. shard lookup offset `+1`: the first real fragment edge returned `$FF`
   instead of `$00`.
3. injected an implicit unit pan default: the required-policy test reported
   `Missing expected exception`.
4. suppressed IRQ end-condition reassertion: the third IRQV read was `null`
   instead of `$63`.
5. skipped native service when `emit=false`: phase remained 0 instead of 256
   and the state-identity comparison failed.
6. logic denominator 264 -> 263: scheduled counts became 556/557 instead of
   558/559; the register-log integration produced 556 instead of 558 frames.
7. disabled the dedicated 16-bit refusal: the exact refusal test received the
   generic `unsupported OscConf $02` rather than the required 16-bit boundary.
8. disabled the ROM-name loader check: malformed-index coverage reported
   `Missing expected exception`.

## 5. Assets and gates

No exporter input changed, so assets were deliberately not regenerated. The
existing deferred artifacts were validated directly:

```text
snd/sample.shard.u8.gz   1,162,891 B compressed; 1,538,920 B raw
snd/sample.index.json.gz       864 B compressed; 2,475 B raw
28 fragments; base $400000; every fragment edge checked
```

Final results:

```text
node games/ddpdoj/tools/w150soundrecon.mjs
  200 checks green; cue8 events=141

node games/ddpdoj/tools/w151icsrecon.mjs
  21 checks green; 1,620 keyons; 1,501 sharded windows

node --test games/ddpdoj/tests/ics2115.test.js
  12 passed; 0 failed/skipped/todo

node --test games/ddpdoj/tests/
  1,380 passed; 0 failed/cancelled/skipped/todo

node games/ddpdoj/tools/bundlegate.mjs ...
  15,955,968/15,955,968 pixels identical over 159 frames

node games/ddpdoj/tools/webgate.mjs --assets games/ddpdoj/assets
  15 files fetched; all downstream web checks green

node tools/publish.mjs --only ddpdoj --dry
  1,380/0/0/0/0 tests; bundle/web green
  ROM-leak guard clean: 278 files, 53 decompressed, 12 ROMs
  exactly 6 pre-existing deliberate exceptions; no new exception
  dist: 282 files, 8,767 KB; dry only, not deployed
```

`git diff --check` is clean. No deployment was attempted.

## 6. Remaining explicit refusals

- An owner/physical-board result must select a center-pan policy and an endpoint
  policy. Until both are explicitly supplied, audible construction throws.
- `Game`, the Z80 interrupt path, deferred-asset loading and the browser/shared
  audio controller are not wired to this core in W155.
- The current shard is strict. If future end-point/interpolation service asks
  for a byte in a declared gap, it throws and the exporter coverage must be
  extended from ROM evidence; the core will not substitute a full ROM.
- Generic ICS2115 formats, directions, envelopes, non-center pan and variable
  active-oscillator rates remain unimplemented and loud.
- W154's physical center-pan and endpoint experiments remain the only route to
  an authenticity claim for those two decisions.
