# W160: Fix live sound routing and BGM startup

Status: COMPLETE

Opened: 2026-08-08

Owner report: deployed build 20260808141049 produced effects at approximately
the right times, but explosions often collapsed to small pops, and music was
absent. The initial "wrong sounds" report was later narrowed to likely
distortion. This closeout treats timing and deterministic hashes as
insufficient evidence of audible identity.

## 1. Two separate causal defects

### SFX duration and pitch

W150/W152 assigned a false meaning to bytes `+$02..03` of each 12-byte `$7600`
descriptor. They are a sample-rate word in Hz, not the final ICS OscFC word.
`$3150` copies the word into the logical slot, but `$0B92` converts it through
the live word `[$6168] = $8133` (33,075 Hz):

```text
OscFC = floor(sampleRateHz * $400 / [$6168])
```

Selector 0 proves the distinction without an audible judgement:

```text
$7602 raw word                 $5622 = 22,050 Hz
$0B92 converted OscFC          $02AA
ics.tsv rows 51581..51583      register $01 <- AA 02
sample interval                $400000 -> $403555
strict-crossing lifetime       20,500 native samples = 619.80 ms
old raw-word lifetime          about 634 samples = 19.17 ms
```

The old `keyon.tsv` display of `$0200` retained only the high OscFC byte and is
not adequate evidence for this field. The exact register stream is. Selector
36 independently converts `$7D00` to `$03DE`, also matching the raw ICS rows.

`driver-params` is now semantic schema v2. It preserves `sampleRateHz`, exports
the derived `oscFc`, records the `$6168/$8133` clock provenance, and rejects a
loader record whose two values do not satisfy the exact conversion. Production
dispatch consumes only `oscFc`.

### Stage-one music never started

The published page boots at logic frame 2000, after the board's authentic start:

```text
$25D5C2                 JSR $28CB9C
mailbox door 6, lf1562  12 EB 00 00
$28CB9C                 streaming type $12, cue 0
```

The page constructed an empty SoundRuntime only after a user gesture and asset
load. It neither restored the lf1562 cue nor preserved driver state while
locked. Separately, the live background interpreter reached `$2620B4 JSR (A0)`
for its later `$28CB88` stage-script callback but only wrote an `UnportedLog`
entry.

The fix pre-rolls the authentic `$28CB9C` door and empty frames through the
frame before the selected seed with `emit=false`. Boundary checks freeze:

```text
seed 1562  0 runtime frames, cue inactive
seed 1563  1 runtime frame, cue 0 active
seed 2000  438 runtime frames, cue 0 active, 19 keyons, outLen 0
```

`$2620B4` now calls `ctx.soundPost(call)`, so the later `$28CB88` callback also
crosses the real Game door.

## 2. Browser ownership and autoplay

`AudioController` has a stateful `setChip` route in addition to its legacy
factory route. Before deferred assets arrive it copies the compact per-frame
inputs. Asset completion constructs and pre-rolls one SoundRuntime, then
applies those pending inputs exactly once with `emit=false`. While still
locked, later frames advance the same chip silently. A gesture attaches that
exact instance to AudioOut; it does not reconstruct or replay it.

Tests cover asset-first, gesture-first, the seed/pending seam, delayed arm,
mute-compatible state advancement, zero pre-gesture PCM, and no double clock.
This retains state but never schedules a stale audible backlog.

Replay replacing the Game while retaining an already-live controller still
needs a separately owned reset/restore contract. It is not required by the
ordinary deployed boot and was not guessed here.

## 3. Evidence and deliberate red mutations

`tools/w160soundgate.mjs` binds the implementation to the Z80 RAM, decrypted
68000 image, exact raw ICS writes, mailbox trace, generated semantic artifact,
and production route. It passes 22/22.

The following mutations were applied, observed red, and reverted:

1. `$0B92` scale `$400 -> $200`: the checker rejected selector 0 as not `$02AA`.
2. Production dispatch `descriptor.oscFc -> descriptor.sampleRateHz`: the
   runtime observed 22,050 where exact OscFC 682 was required.
3. `$2620B4` callback replaced with a log note: the background test received no
   `$28CB88` sound post.
4. Seed pre-roll `< seedFrame -> <= seedFrame`: seed 1563 advanced two frames
   instead of one and seed 2000 advanced 439 instead of 438.
5. Pending catch-up `emit=false -> true`: asset-first and gesture-first tests
   saw an audible pending frame, and the real runtime retained 559 stale PCM
   samples instead of zero.

## 4. Generated artifacts and gates

The sound assets were regenerated before the gates. The global sample shard is
unchanged at 3,612,873 raw / 2,818,499 gzip bytes. The v2 semantic
`driver-params` is 44,781 raw / 7,713 gzip bytes. No publish exception was
added.

```text
W150 sound recon                         200/200
W151 ICS recon                            21/21; 1,620 keyons
W157 static sample coverage               11/11
W160 ROM/capture/route checker             22/22
focused sound and shared audio             86/86
full DOJ suite                         1,401/1,401; 0 skip/todo
published framebuffer             15,955,968/15,955,968
web HTTP/deferred sound gate                 PASS
ROM firewall                    280 files; 53 inflated; 12 ROMs;
                                  6 existing exceptions, no new one
dry dist                          284 files; 10,405 KB
dry publish                        PASS; build 20260808144309
```

The regenerated three-second cue-0 diagnostic remains 99,472 stereo frames /
397,932 bytes with SHA-256
`e6b9fb9412d3d15ff9ca466fe8e78f04eaaf7d8878aefb4f0bb21486079a1656`.
It was deleted after measurement and was not committed. No human audition was
performed in this wave, so this does not claim subjective correctness. The
owner-approved pan and endpoint approximations and the named after-native-frame
IRQ timing boundary remain exactly as W158 documented. Independent browser
audition is required before deployment.

No deployment was performed.
