# W157: complete static sound-sample coverage

**Status: RECON COMPLETE — IMPLEMENTATION PAUSED FOR OWNER BULK-ASSET DECISION**

Replace the stage-1 capture-bounded sample union with a descriptor- and
score-reachability-derived asset model, if its measured size and source-ROM
topology remain an acceptable deferred publishing decision.

## 1. Premise result

W156's premise break is real and substantially larger than cue 9. The current
stage-1 capture union is not a valid bound for the live drivers. Static coverage
derived from the uploaded Z80 image reaches 3,612,823 raw bytes and compresses
to 2,818,488 bytes. The complete 4 MiB `u17` compresses to 2,832,370 bytes, so
the tight static result saves only **13,882 gzip bytes (0.49%)** over publishing
that entire sample ROM.

That is the brief's explicit materially-different asset/publish boundary. This
wave therefore stops at a reproducible recon and architecture decision instead
of silently replacing a 1.16 MiB artifact with an effectively-full-ROM 2.82
MiB artifact or inventing a multi-shard runtime schema without approval.

No exporter, runtime, manifest, or asset was changed. The committed
`tools/w157samplecoverage.mjs` gate reproduces every count below directly from:

- `rip/sound/z80ram.bin` and the exact `$7600/$6840` parsers;
- all score row selectors and their exact event grammar;
- all 191,367 captured ICS register writes (validation only);
- the actual `cave_m04401b032.u17` bytes for raw/gzip measurements; and
- the current sidecar for the shipped-fragment witness check.

## 2. Static reachability inventory

### SFX

`$3150` accepts every selector 0 through 68 and rejects 69. Thus all **69**
records are driver-valid. The fixed 68k wrapper inventory names 54 selectors
and omits:

```text
8 9 10 11 17 21 35 38 39 61 62 65 66 67 68
```

That wrapper subset is not a safe asset bound. The captured register stream
contains exact descriptor-65 and descriptor-66 episodes; descriptor 65 follows
the full mailbox's selector-65 door (`type=$00 id=$41 packed=$50`). W152's live
Z80 bound, not the fixed-wrapper subset, is therefore the conservative command
reachability rule. All 69 raw descriptor mode bytes are zero; live cmd `$00/$01`
forms `$20` one-shots and cmd `$02` forms `$08` loops, both already supported.

### BGM

Walking every selector named by all eleven cue row streams selects 288 track
streams and parses 11,413 exact events. It reaches **159 of 160** descriptors.
Only index 45 is absent; it is the `$44/$00` placeholder whose accumulator/end
fields collapse to a tiny dummy range. No reachable stream contains a state-9
offset event, so the shipped score adds no modifier-derived sample interval.

Per-cue reachable descriptor counts, including descriptor zero's initialized
state, are:

```text
cue:    0  1  2  3  4  5  6  7  8  9 10
count: 31 15 32 32 18 32  5 13 11 11 14
```

All reachable BGM modes are `$00` one-shot or `$08` loop. Asset coverage is
therefore separate from W155's unsupported-format refusals; no new synth mode
is needed or implied.

### Source-ROM verdict

All 69 SFX descriptors use sample banks 4–5. All 160 BGM table records use
banks 4–7. The complete statically reachable set is therefore inside:

```text
cave_m04401b032.u17   ICS $400000-$7FFFFF   REQUIRED
pgm_m01s.rom          ICS $000000-$1FFFFF   0 reachable descriptors
```

No multi-ROM index generalization is justified by this inventory.

## 3. Exact interval semantics and union

For each one-shot, coverage starts at the initial 20.9 accumulator. For each
`$08` loop it starts at `min(initial accumulator, OscStrt)`, because the attack
may begin on either side of the loop-return point and later wraps to OscStrt.
The far edge is OscEnd plus two bytes: OscEnd itself and the adjacent byte that
nine-bit interpolation can read under strict crossing. SAddr's low nibble
provides the 1 MiB bank.

The 69 SFX plus 159 BGM intervals merge to these 20 non-touching fragments:

```text
$400000-$403557  $403558-$444913  $444918-$47A7C5
$47A7C8-$4C0CD5  $4C0CD8-$4C7AE5  $4C7AE8-$4CA093
$4CA098-$4CAB53  $4CAB58-$4CD4B3  $4CD4B8-$4DB837
$4DB938-$4DC257  $4E1858-$4EFD07  $4EFD08-$4F65C7
$4F65C8-$4FCF15  $4FCF18-$4FFFE1  $500000-$517155
$517158-$522587  $522588-$5259B5  $5259B8-$5FFFF6
$600000-$6FFBFA  $700000-$777BF2
```

Each fragment has at least one named descriptor witness; removing any fragment
uncovers at least one reachable descriptor. The current 28 shipped fragments
also each have a static descriptor witness, but together they do not cover the
static union.

## 4. Bidirectional dynamic join

W140's `keyon.tsv.start` is the OscStrt shadow, not the initial accumulator.
Using it as the start of a non-looping episode produced 119 `end<=start` rows
and the over-wide 1,538,920-byte capture union. Replaying `ics.tsv` recovers
registers `$0A/$0B` at each keyon and gives **1,620 of 1,620 valid** playback
intervals. Their dynamic union is 35 fragments / 809,631 raw bytes.

Against the static set:

```text
dynamic intervals outside static set       0
static descriptor intervals absent dynamic 175 of 228
static fragments with no dynamic request   7 of 20
```

Thus capture is a clean validator and a poor inventory bound. Every dynamic
request belongs to the static set, while most static descriptors were not
exercised in stage 1.

## 5. Measured asset choices

### A. One global static shard

```text
current shard       1,538,976 raw   1,162,927 gz
static global       3,612,823 raw   2,818,488 gz
full u17            4,194,304 raw   2,832,370 gz

growth vs current  +2,073,847 raw  +1,655,561 gz
saving vs full ROM   -581,481 raw     -13,882 gz
```

This keeps the version-1 single-shard loader simple and remains deferred, so
first-paint bytes stay unchanged. It is nevertheless functionally a compressed
full-ROM publish decision.

### B. Evidence-driven demand shards

An exact SFX shard is 1,392,445 raw / 1,051,868 gz. Eleven exact cue shards are:

```text
cue  raw bytes  gzip bytes
 0     305,917     213,449
 1     179,081     124,838
 2     461,951     355,816
 3     500,875     413,897
 4     395,395     325,721
 5     350,141     307,173
 6      31,795      29,231
 7     147,837     115,207
 8     121,749     100,347
 9     192,149     153,903
10     141,659     119,807
```

SFX plus all eleven cue files total 3,311,257 gz because overlapping source
bytes are duplicated. The benefit is demand: SFX plus one active cue costs
about 1.08–1.47 MiB instead of 2.82 MiB, with zero first-paint bytes because
all files remain deferred. This option requires an approved version-2 index:

- named shard/demand metadata (`sfx`, `cue0`…`cue10`);
- cross-shard identical-overlap validation;
- exact source-ROM/ICS address identity per fragment;
- a runtime loading/swap contract for concurrent SFX plus one BGM cue; and
- browser fetch ownership in the later adapter wave.

Four non-overlapping bank shards avoid duplication but make several cues load
most or all 2.82 MiB, so they do not solve the demand problem.

Recommendation: approve demand shards if network latency matters more than an
extra 492,769 gz bytes of stored duplication; approve the global shard if
schema simplicity matters more. Neither choice affects first paint. Both must
be regenerated and run through the ROM firewall before a publish claim.

## 6. Deliberate red mutations

The checker has reproducible `W157_MUTATION` modes. Each was observed red and
then the normal run was restored:

1. `include-unreachable`: BGM descriptor count became 160 instead of 159;
2. `wrong-rom`: source-bank inventory became `[0,4,5,6,7]` instead of u17-only;
3. `merge-gap`: joining a one-byte hole collapsed 20 fragments to 16;
4. `drop-fragment`: coverage inventory fell to 19 fragments and lost witnesses;
5. `legacy-dynamic-start`: OscStrt-as-attack recreated invalid dynamic ranges;
6. `endpoint-one`: omitting the interpolation neighbour left 550 captured
   episodes outside the static artifact.

The final normal run is 11/11 green.

## 7. Decision required before implementation

Choose one:

1. **Global static shard:** +1.66 MiB gz, version-1 runtime remains simple,
   essentially the compressed full sample ROM.
2. **SFX + per-cue demand shards:** +2.15 MiB gz versus today's artifact,
   lower per-cue transfer, but requires the new multi-shard/index/runtime
   ownership contract above.

Until that owner decision, cue 9 correctly remains a loud outside-shard refusal
at `$69FDF0`; W154 pan/endpoint policies and browser audibility remain equally
unresolved. No deployment or asset mutation is authorized by this recon.

## 8. Final gates

The decision stop leaves production source and the capture-bounded assets
unchanged. The existing tree remains green:

```text
W150 sound recon                      200/200
W151 ICS recon                         21/21, 1,620 keyons
W157 static coverage                   11/11
DOJ node tests                      1,389/1,389, 0 skip, 0 todo
published-bundle framebuffer      15,955,968/15,955,968 (100.0000%)
web fetch gate                          PASS (15 boot files)
ROM firewall                             279 files, 53 inflated,
                                         12 ROMs, 6 existing exceptions
dry distribution                         283 files, 8,775 KB
dry publish                              PASS; no deployment
```

The first dry-publish invocation was terminated after its caller timeout left
the exact publish/build child processes alive; those two task-owned processes
were identified and stopped. A single clean rerun then completed in 420.2 s
with build id `20260808111716`. No seventh firewall exception was introduced.
Because implementation is intentionally paused at the measured bulk-asset
decision, no sound asset was regenerated and the current manifest remains the
W156 capture-bounded artifact.
