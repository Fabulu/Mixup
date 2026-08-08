# W153: implement live BGM Layer 3 driver

**Status: COMPLETE**

Translate the live Z80 BGM byte grammar, 16-state handler table, validated score
rehydration, descriptor/pitch resolution, and proven streaming cue controls.
ICS synthesis, runtime browser audio, and unproved hardware semantics remain
outside this wave.

## 1. Premise audit and correction

Work began from live HEAD `76b2475`, with W150/W151/W152, `z80ram.bin`, the
Z80 listing produced by `tools/z80dis.py`, the real deferred score artifact,
and every live caller read again. W150's byte grammar and handler inventory are
correct. Two older score/export premises were not:

- `$2E9F-$2ED1` aligns the pointer grid only when `rowlen` is odd. The former
  parser always consumed an extra byte.
- the pointer grid contains `tracks * df` words in track-major order, not eight
  shared pointers. The eleven live grid lengths are
  `16,8,16,16,16,16,8,64,8,24,96`; `df == rowlen` in all eleven cues.

The complete `$4439-$5203` period-to-OscFC map was also absent from W152's
runtime artifact. It is 1,765 little-endian words indexed by the clamped period
range `$0032..$0716`. It is now a validated semantic table, not a ROM slice.

No premise was forced. The score topology was reclassified and corrected in
the parser, exporter, loader, tests, and prose before the driver was built.

## 2. Implemented live path

`src/bgmscore.js` now exports the corrected topology and a strict
`scoreFromJson()` rehydrator. It validates version 1, table `$0070`, all eleven
exact cue block addresses, eight tracks, `df=rowlen>0`, derived row/pointer
addresses, row selectors, exact track-major pointer counts, strictly ascending
and gap-free stream topology, even hexadecimal bodies, and exact stream
extents. The reconstructed `CueBlock` graph and every nested array are frozen.

`src/driverparams.js` now transforms and validates the `$4439` 1,765-word FC
map alongside W152's 160 descriptors and 16 by 60 pitch banks. Access is loud
outside period `$32..$716`.

`src/sequencer.js` replaces the oracle-fed partial sequencer with the live
driver:

- `$00-$3F` consumes one byte, `$40-$7F` and `$80-$BF` consume two,
  `$D0-$EF` consume three, and `$C0-$CF`/`$F0-$FF` consume four. `$CF` is the
  four-byte combined family; cue 8 starts `CF 78 2A 07`.
- `$2E38` initializes all eight 41-byte `$6184` records and their fixed ICS
  voices; cmd `$11` installs one-shot mode and cmd `$12` looping mode.
- `$25F2` runs the state/register walk on every IRQ, consumes events only when
  the tempo count reaches its divider, preserves per-track waits, advances the
  selector row only after step `$3F`, and performs the live group/repeat jumps.
- all sixteen `$4316` handlers and all sixteen `$4336` state-14 arms mutate the
  proven offsets. The former fictional compatibility offset names were removed.
- descriptor and note bytes remain one-based at the door, then resolve through
  `$6840 + index*22`, the descriptor's raw pitch-bank nibble, `$5203`, and the
  `$4439` FC map through the exact `$14AB/$1569` bounds.
- `$15B3` writes descriptor raw fields to registers `$11/$0B/$0A/$03/$02/$05/
  $04/$00`, volume to `$09`, and the state-9 32-bit modifier through its exact
  split-word arithmetic: `(offset << 12) & $FFFF` and
  `(offset & $FFFFF000) >>> 4`.
- `$0268` level scaling is the exact `(level * cueFlag) >>> 7`, including the
  zero-to-one table rule. The loader's initial level is the same helper applied
  to `$40`.

`src/dispatch.js` passes the complete W152 parameter object into the sequencer
and preserves cmd `$11/$12`'s second-byte flag. `src/voice.js` adds only the
proven fixed-BGM-voice initialization writes: pan index 7 and register
`$06=$003F`. W151's oscillator format/loop/phase semantics were not changed.

The production BGM path no longer reads `parseScore(z80ram)`, `after_door`,
`ics.tsv`, `keyon.tsv`, or injected keyon parameter histories. The historical
979 BGM keyons remain secondary validation of the register emitter only.

## 3. Coverage

`tests/sequencer.test.js` proves:

- artifact regeneration and strict rejection for version, exact layout,
  topology, ranges, bad counts, bad hexadecimal, and FC-map drift;
- all four primary event families, every `$C0` subfamily, and cue 8 framing;
- exact inventory and target mutations for all sixteen `$4316` handlers and
  all sixteen `$4336` arms;
- inter-event handler/register updates across the tempo gate;
- all eleven cues, eight tracks each, execute live score bytes;
- arbitrary descriptor/note bytes and a state-9 modifier reach exact ICS
  register values without oracle injection;
- real `$28CB60` cmd `$11` and `$28CB38` cmd `$12` streaming leaves reach cue
  load/keyon behavior, with cmd `$15` reaching stop;
- the 979 historical BGM episodes still reproduce row-for-row as explicitly
  test-only validation.

The final focused W153 file has 17 passing tests with zero failed/skipped/todo;
the adjacent dispatch, ICS, sound, sound-D, and voice gates are also green.

## 4. Deliberate red mutations

Every mutation was made and restored with `apply_patch`; none remains:

1. Reintroduced the old unconditional pointer padding (`+1`). Rehydration
   failed at import: `cue 0 derived address mismatch`.
2. Shortened combined `$C0/$F0` events from four bytes to three. The arity gate
   produced `...,3,1,3,1` instead of `...,4,4`, and cue 8 lost byte `$07`.
3. Changed primary handler 12 to store `parameter + 1`. Its offset test got
   level 38 instead of 37.
4. Returned early on tempo-gated IRQs. The inter-event state-1 target remained
   `$0200` instead of advancing to `$01FE`.
5. Changed level scaling from `>>> 7` to `>>> 6`. The live `$09` write became
   61184 instead of 57088.
6. Shifted the FC-map base from `$4439` to `$443B`. Strict artifact load failed
   immediately on the base/stride contract.
7. Changed the state-9 high split from `>>> 4` to `>>> 3`. The `$0A` register
   became 26280 instead of 26024.

The focused 17-test W153 gate was rerun after final restoration and is green.

## 5. Assets and final gates

Assets were regenerated after implementation:

```text
snd/bgm-score.json.gz       4093 B (from 51510 B), deferred
snd/driver-params.json.gz   7617 B (from 43689 B), deferred
bundle total                3743.0 KiB
boot                         554.2 KiB
deferred                    3188.7 KiB
```

Final commands/results:

```text
node games/ddpdoj/tools/w150soundrecon.mjs
  200 checks green; cue8 events=141

node games/ddpdoj/tools/w151icsrecon.mjs
  21 checks green; 1,620 keyons; 1,501 sample windows

node --test games/ddpdoj/tests/
  1369 passed; 0 failed/cancelled/skipped/todo

node games/ddpdoj/tools/bundlegate.mjs ...
  15955968/15955968 pixels identical over 159 frames

node games/ddpdoj/tools/webgate.mjs --assets games/ddpdoj/assets
  15 files fetched; all downstream web checks green

node tools/publish.mjs --only ddpdoj --dry
  1369/0/0/0/0 tests; bundle/web green
  ROM-leak guard clean: 277 files, 53 decompressed, 12 ROMs
  exactly 6 pre-existing deliberate exceptions; no new exception
  dist: 281 files, 8756 KB; dry only, not deployed
```

`git diff --check` is clean. No deployment was attempted.

## 6. Explicit remaining refusals

This wave ends at authentic Layer 3 register production. It does not claim:

- W151/W154's unresolved exact center-pan integer gain or equality-versus-
  crossing endpoint edge;
- browser loading of the deferred score/parameter/sample assets, AudioContext
  or worklet ownership, buffering/resampling, or user-gesture policy;
- automatic routing of every drained production `Game` door into a loaded
  `SoundChain`; the two real streaming leaves are proved only as far as the
  current Layer 3 hub;
- audible ICS synthesis in the game runtime, or frame/audio-clock scheduling
  between the 68k, Z80 timer IRQ, oscillator IRQ, and browser callback;
- oracle timeline identity for every live cue. The oracle remains validation,
  never a production parameter source.

Those are the next sound/runtime waves. W153 deliberately does not guess them
and does not deploy an inaudible driver.
