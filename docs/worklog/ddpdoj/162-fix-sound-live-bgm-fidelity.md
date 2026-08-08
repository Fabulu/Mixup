# W162: Fix live BGM fidelity

Status: COMPLETE

Opened: 2026-08-08

Owner report: deployed build 20260808144941 has strong SFX after W160, but
stage music consists mostly of a few isolated beats and vocals. This wave
compares the complete cue-0 driver/register timeline from the proven lf1562
start against the board and repairs the first causal divergence.

## 1. First causal divergence: the wrong score bank

`$28CB9C` is streaming table entry 11, `{group:1,id:0,type:$12}`. Its caller
does more than post a four-byte door:

```text
$28CAFC -> $28B884 -> $28CF36   install the selected 68k score group at $A600
$28CB9C -> $28C11C             post 12 EB 00 00
```

W152 intentionally preserved only the door and deferred the synchronous score
upload. W153/W160 then resolved cue 0 against group 0, the boot snapshot in
`z80ram.bin`. Group-0 cue 0 is the sparse material that produced only 19
keyons by lf2000. Replaying that cue more often could not recover the stage
music because it was the wrong bank.

The complete `$28B814` inventory is now transformed from `maincpu.bin`:

```text
group          0   1   2   3   4   5   6
cue count     11   2   2   2   1   2   1
descriptor 2AE118 2B240A 2B58F6 2B974A 2BC366 2C0472 2C2F38
```

`parseScoreGroups()` ports `$28CF36`'s header, word-rounded row bytes,
track-major `8*df` pointer grid and concatenated note streams. The v2 score
artifact strictly rehydrates all seven groups. Group-1 cue 0 proves a former
schema assumption false: `rowlen=$2C`, `df=$1C`; they are not necessarily
equal. Its track-0 opening is `CF 03 2A 13 06 AA 13 36`, and flat stream 56
opens `CF 87 20 51`.

The Game boundary now applies `$28B884`'s score-group side effect before the
ordinary four-byte post. `AudioController` carries that semantic marker in the
same ordered state queue as logic frames, including asset-first, gesture-first
and locked catch-up. It remains one chip and no fifth door byte was invented.

## 2. Second divergence: Z80 timer IRQ cadence

The driver does not process one score tick per 59.18 Hz game logic frame.
Handler 15 writes `$616C`; `$13D4` maps it through the byte table at `$4376`
and programs timer 0 with scale `$94`. For stage cue 0:

```text
$616C request $87 -> preset $74, scale $94
period = ((scale & 31)+1) * (preset+1) << (4 + (scale >>> 5))
       = 628,992 ICS clocks
rate   = 33,868,800 / 628,992 = 53.846153... Hz
```

The runtime now advances an exact rational timer clock independently of the
`15625/264` Hz logic clock and runs sequencer/voice state only on timer IRQs.
Reprogramming timer 0 resets its fractional phase, matching `$0EE7`; carrying
the old phase made subsequent events systematically early. The lf1562 start
also preserves the measured NMI/timer ordering: upload during lf1563, first
group-1 event batch at lf1564.

The first fourteen production keyons are now:

```text
lf1564  voices 0 1 2 3 4 6 7
lf1568  voice 4
lf1571  voices 3 4
lf1574  voice 4
lf1578  voices 1 3 4
```

Through lf1999 production emits 186 keyons across at least 120 distinct event
frames and services 396 timer IRQs. The capture has 187 voice-0..7 keyons in
that window; all 186 production voice selections equal the first 186 capture
selections in exact order. The remaining row is an end-of-window logic-frame
attribution boundary. It is recorded as such, not silently promoted to an
exact timing claim.

## 3. Voice/register audit

The first group/timer corrections exposed one genuine core refusal. A BGM
logical voice may retrigger a non-looping descriptor after a looping one
without rewriting loop-start registers `$02/$03`. `Ics2115Core` was rejecting
the stale loop start even when OscConf bit 3 was clear. Bounds validation now
compares end against loop start only for a loop; accumulator-vs-end remains
loud for every mode. With that correction the live group-1 retrigger register
rows run through the complete pre-seed window.

The exact production/capture voice-order agreement exercises the cue grammar,
all reached `$4316` handlers, descriptor/note progression, wait/tempo state,
state 2/3/4 voice updates, allocator reuse, loop/one-shot keyoff and native IRQ
feedback together. No new state-handler approximation or oracle parameter
injection was added. PCM assertions remain structural; there was no human
audition and this wave does not claim subjective fidelity from a hash.

All seven score groups together reach the same conservative 159/160 BGM
descriptor union already shipped by W158; only index 45 is absent. The sample
shard therefore remains unchanged and no new verbatim publication exception
was required.

## 4. Other streaming callers

The listing/static caller inventory remains:

```text
$28CB38 group0 cue7  type12  caller $25CA88
$28CB4C group0 cue8  type11  caller $288C8C
$28CB60 group0 cue9  type11  callers $242952/$2429CA (stage end)
$28CB74 group0 cue10 type12  caller $28F360
$28CB88 group1 cue1  type12  caller $2A4FBC
$28CB9C group1 cue0  type12  caller $25D5C2 (proven stage start)
```

Later group wrappers have no static caller in the current inventory. The human
title/menu meanings of `$25CA88`, `$288C8C` and `$28F360` are not yet proved;
they remain named candidates for the unported presentation/menu wave. That
does not qualify the stage result: `$25D5C2->$28CB9C` at lf1562 is directly
captured.

## 5. Deliberate red controls

Every new load-bearing family was mutated, observed red, and reverted:

1. Group-1 descriptor base `$2B240A -> $2B240B`: parser and artifact checks
   failed `group 1 cue 0 descriptor layout mismatch` / inventory drift.
2. Timer period `(preset+1) -> (preset+2)`: the sustained timeline fell below
   the 186-keyon regression floor (`stage music must not regress to W160's 19
   sparse keyons`).
3. Game streaming side effect `leaf.group -> 0`: the Game boundary expected
   `[1]` and received `[0]`.
4. Timer loader upper bound `$C8 -> $C9`: the malformed-loader test failed
   `Missing expected exception`.
5. Deferred controller replay forced `selectScoreGroup(0)`: ordered catch-up
   produced `frame:1, group:0, frame:2` instead of `group:1`.

## 6. Artifacts and gates

Generated sound assets:

```text
sample.shard.u8.gz       3,612,873 raw / 2,818,499 gzip (unchanged)
bgm-score.json.gz          220,675 raw /    22,438 gzip (seven groups)
driver-params.json.gz       45,370 raw /     7,905 gzip (v3 timer table)
```

Deterministic structural hashes after the timer-clock correction:

```text
SFX runtime PCM  2b98e2758ab15110d9d362b8c2096ba04cd265ca692f96555fc59e092903e1f0
BGM runtime PCM  1b03ea2580402ecb0f5e65d2b678ab26995e4a3bb3e47d5897c9ee8475281861
W158 policy PCM  c85b5731fa226236e9a3bbf196d52f06cea4846c7fa442248c654567fc046ec6
```

```text
W150 sound recon                              200/200
W151 ICS recon                                 21/21; 1,620 keyons
W157 static sample coverage                    11/11
W160 sound gate                                22/22
W162 ROM/artifact/timer/timeline gate           18/18
focused sound/shared tests                      62/62; 0 skip/todo
full DOJ suite                            1,405/1,405; 0 skip/todo
shared audio                                    18/18; 0 skip/todo
published framebuffer              15,955,968/15,955,968 (100%)
web HTTP/deferred sound gate                      PASS
ROM firewall                      281 files; 53 inflated; 12 ROMs;
                                      6 existing exceptions, no new one
dry dist                             285 files; 10,443 KB
dry publish                           PASS; build 20260808155910
```

No deployment was performed. The owner-approved W158 center-pan and endpoint
approximations and W156 after-native-frame IRQ service boundary are unchanged.
The build needs independent browser audition before deployment.
