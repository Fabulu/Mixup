# W158: complete sound asset and browser audio

**Status: READY FOR INDEPENDENT GREEN REVIEW AND DEPLOYMENT**

Implement the owner-approved global deferred ICS sample shard, the explicitly
approximate AMD US 5,659,466 center-pan policy, strict-crossing endpoint policy,
and the singleton browser audio bridge. Owner approval date: 2026-08-08.

## 1. Premise correction before implementation

W157's descriptor count and source-ROM verdict were right: all 69 driver-valid
SFX records plus 159/160 score-reachable BGM records produce 228 conservative
intervals, all in `cave_m04401b032.u17`; `pgm_m01s.rom` has zero witnesses.
Its exact 20-fragment/3,612,823-byte union was not command-complete.

The 12-byte SFX record has no independent r02/r03 pair. Live cmd `$02` writes
its r0A/r0B pair as accumulator and, through the boundary-width encoding, as
OscStart. W157 had treated every SFX loop return as the accumulator. Selector
36 proved the break immediately: it wrapped to `$4DB936` and interpolation
read `$4DB937`, two bytes below W157's `$4DB938` fragment. Correcting all 69
SFX command forms merges the same 228 intervals to six fragments:

```text
$400000-$4DB837  $4DB935-$4DC257  $4E1853-$4FFFE1
$500000-$5FFFF6  $600000-$6FFBFA  $700000-$777BF2
```

These are half-open ranges. The corrected total is 3,612,873 raw / 2,818,499
gzip: only +50 raw and +11 gzip versus the approved estimate, but load-bearing.
Dynamic-minus-static remains zero. Static intervals absent from the stage-1
capture are now 182/228; all six merged fragments have a dynamic witness.

## 2. Final static asset

`export-tables.py` freezes the corrected semantic union and no longer treats
`keyon.tsv` as inventory. `w157samplecoverage.mjs` derives it from the live
descriptor/score grammar and joins the 1,620 captured episodes only as
validation. `export-web.mjs` emits one stitched deferred shard and a strict v1
sidecar:

```text
snd/sample.shard.u8.gz    2,818,499 B gzip / 3,612,873 B raw
snd/sample.index.json.gz        653 B gzip /     1,186 B raw
version 1; ics2115-static-fragment-stitch-v1
coverage all-live-descriptors; 228 intervals; 6 fragments
```

`IcsSampleMap` now validates version/layout plus metadata-declared fragment
count while retaining sorted, disjoint, non-touching, packed-offset, ROM/base,
24-bit and exact-length checks. `soundRuntimeFromAssets` additionally demands
the exact W158 228/6/3,612,873 topology. Full-ROM fallback remains forbidden.
The stitched artifact passed the firewall without a seventh exception.

The complete regenerated bundle is 5,358.8 KiB: 553.5 KiB before first paint
and 4,805.3 KiB deferred. The sound expansion therefore changes no first-paint
fetch: the real HTTP gate still reports exactly 15 boot files, then fetches the
four sound bodies independently.

## 3. Permanent approximation policy

Owner approval is explicit on 2026-08-08. Neither substitution is described as
authentic ICS2115 hardware behavior in source, tests or site copy.

### Center pan

`amd-us5659466-center-approximation` uses AMD US Patent 5,659,466's InterWave/
GF1-descendant position-7 offsets, 116 left and 141 right. They are subtracted
from the 12-bit volume index **before** W151's exact logarithmic conversion;
applying a floating ratio after mono volume cannot reproduce the approved
integer behavior. Frozen rows:

```text
VolAcc $7FF0 ->    99 /    93
VolAcc $E600 ->  7872 /  7472
VolAcc $FD60 -> 22656 / 21056
VolAcc $FFFF -> 25280 / 23680
```

### Endpoint and IRQ timing

The approved endpoint policy is `strict-crossing`: OscEnd is rendered and the
one-shot ends only when the next phase is greater. It remains cross-chip
evidence, not a physical ICS2115 observation. IRQ feedback uses W156's named
`after-native-frame` deterministic service point. The Z80 cycle latency is
still unmeasured and is not presented as authentic.

`NOTES-sound.md` permanently records provenance, affected behavior, owner date
and W154's physical Packet P/E replacement procedure. Only a retained physical
PGM serial-DAC/IRQ/address capture can replace these approximations.

## 4. Browser ownership and user contract

The live ownership chain is singular:

```text
Game.step -> compact 0/4-byte door -> AudioController queue (once)
          -> exactly one SoundRuntime inside AudioOut's factory
          -> one pump after each rAF catch-up batch
```

The controller exists before Game. Frames while autoplay is locked or assets
are loading are counted and dropped; they never build a stale backlog. The
four sound assets begin after the first picture is scheduled and are not
awaited by boot. A SOUND click synchronously creates/resumes AudioContext. If
assets are still loading it remains visibly `SOUND…`; asset completion attaches
the singleton runtime to that already-armed context. A failure is specific and
visible as `SOUND FAILED` but does not stop gameplay.

Mute sets host gain to zero while the driver/core continue to advance. The
shared 15-frame backlog valve also applies every skipped frame with `emit=false`.
The inline SOUND/SOUND ON/SOUND MUTED control uses accessible text/ARIA, no
native `title`, and a `pointer-events:none` status span inside the bar rather
than another overlay.

Installed headless Chrome was exercised without an autoplay override. Before
the real click it reported `locked`; after the click it reported `on`, 48,000
Hz, backlog/dropped/underruns all zero, and no page errors. A second run muted
the control and the sole runtime advanced from frame 69 to 137 while muted.

## 5. Deterministic PCM and audition artifact

The approved-policy one-frame SFX stereo Float32 hash is:

```text
6beac719cbf3a743d55e6fb6c96116090ea97fec83a4d4f62a24ad747a2b902f
```

`tools/w158audition.mjs` generates a production cue-0 stereo 16-bit WAV for
human audition. The generated scratch file (not committed) contained 99,472
frames / 397,932 bytes and hashed:

```text
e6b9fb9412d3d15ff9ca466fe8e78f04eaaf7d8878aefb4f0bb21486079a1656
```

The artifact is structurally suitable for listening, but no human audition was
performed in this agent run. Browser scheduling and nonzero PCM are proven;
subjective listening remains an independent review step.

## 6. Deliberate red mutations

Every mutation was reverted and the final focused gate returned 49/49 green:

1. omitted the SFX cmd-$02 loop-start rule: W157 returned 20 fragments instead
   of six; the original runtime failure was exact `$4DB937` outside-shard;
2. changed patent left offset 116 -> 115: `$E600` became 7,888 instead of 7,872;
3. selected equality instead of strict crossing: policy fixture read
   `equality` instead of `strict-crossing`;
4. froze a placeholder PCM digest: the gate reported the exact final
   `6beac719...b902f` value before it was accepted;
5. prevented deferred `setFactory` from attaching: the gesture-first test saw
   zero singleton constructions instead of one;
6. added a native `title` to SOUND: the page test rejected the exact element;
7. malformed manifest path/topology, dropped fragment and erased-gap variants
   were rejected by the loader/topology fixtures.

## 7. Final gates

```text
W150 sound recon                         200/200
W151 ICS recon                            21/21; 1,620 keyons
W157 corrected static coverage            11/11
focused sound/shared audio                 49/49
DOJ tests                            1,395/1,395; 0 skip/todo
published framebuffer              15,955,968/15,955,968 (100.0000%)
web HTTP gate                       PASS; 15 boot + 4 deferred sound files
installed Chrome gesture/mute gate  PASS; no page errors
ROM firewall                         280 files; 53 inflated; 12 ROMs;
                                     6 existing exceptions, no new exception
dry dist                             284 files; 10,401 KB
dry publish                          PASS; build id 20260808134847
```

No deployment has occurred. Commit/push and independent green review are the
remaining prerequisites; after that this wave is ready for the requested real
DOJ deployment.
