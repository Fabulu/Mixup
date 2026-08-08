# W150: recon live Z80 sound parameters

**Status: DONE**

Fidelity-critical disassembly and data recon for the live sound record, SFX
descriptor resolution, cmd `$0F` behavior, and BGM event and parameter tables.
No runtime implementation is in scope.

## Premise audit

Verified against live HEAD `a34d22f` before task work:

- `Game` still constructs only `SoundState` and production stops at the
  four-byte `drainFrame` door.
- NMI `$07F6` still loads `DE = 6` before `$3BEA`, which W149 interpreted as a
  record length while the port records `[type][pan][id][chan]`.
- the default `SfxParamTable` remains empty and all external `SoundChain`
  constructors remain test-only;
- `BgmSequencer.tick()` still ends its track walk with `return 0`;
- `postStreamingRejoiner()` still has no production caller;
- the only unrelated untracked files are the three user-owned `c1_*.py`
  scripts, which this wave will not touch.

The missing live parameter path remains current. The claimed six-byte transport
does not, as the first disassembly result below establishes.

## Evidence hierarchy

- Transport, table inventory, byte grammar, and every producer/consumer claim
  come from the decrypted 68k ROM and live uploaded Z80 image/listing.
- ICS register names, widths, and address-bit labels come from the primary
  manufacturer document, *ICS2115 WaveFront Synthesizer, Rev B 07/26/94*,
  register map page 15:
  `https://audioschematics.dk/wp-content/uploads/media/schematics/soundcards/wavefront-ics2115.pdf`.
- The live track snapshot is used only as an independent grid/value check.
  Oracle temporal associations are not used to infer parameters.
- MAME PCM and the GPL MiSTer implementation are not evidence for any claim in
  this wave.

## 1. Load-bearing premise correction: the record is four bytes

W149 and the W150 assignment called `LD DE,$0006` at `$080B` a six-byte record
length. That interpretation is false.

The live `$6001` queue header in `z80ram.bin` is:

| offset | value | meaning |
|---:|---:|---|
| `+$00` | `$600F` | data start |
| `+$02` | `$604B` | cursor 1 |
| `+$04` | `$604B` | cursor 2 |
| `+$06` | `$614F` | data end |
| `+$08` | `$0004` | **element size: four bytes** |
| `+$0A` | `$0050` | capacity: 80 elements |
| `+$0C` | `$0000` | occupied count in this snapshot |

The data interval is exactly `$614F - $600F = $0140 = 80 * 4` bytes. `$3BEA`
loads the copy bound from queue `+$08` at `$3C11-$3C24`; it therefore copies
four bytes. The `DE = 6` supplied by `$07F6` is the banked source offset
`$C10006`, where BIOS `$18AD4C` writes the command longword. It is not a length.

The complete transport is:

```text
68k D7 longword
  -> BIOS $18AD4C move.l D7,$C10006
  -> NMI $07F6 selects bank $F0 and calls $3BEA(dst=$6001, srcOff=$0006)
  -> $3BEA copies queue.elementSize = 4 bytes
  -> main loop $3CDD dequeues the same four bytes
```

There are no dropped bytes to recover. The 10-bit selector is packed into the
four-byte command by `$28BB04`:

```text
byte 0 = command type
byte 1 = pan
byte 2 = selector bits 7..0
byte 3 bits 1..0 = selector bits 9..8
byte 3 bits 7..2 = channel
```

Thus `selector = byte2 | ((byte3 & 3) << 8)` and
`channel = byte3 >> 2`. Current `drainFrame()` names byte 2 `id` and byte 3
`chan` but never reconstructs either field. All captured stage-1 selectors are
below 256, so byte 3's low two selector bits happen to be zero in the corpus;
the bit packing remains required for the live contract.

W144 inferred two absent bytes because 368 identical captured doors were
associated through `after_door` with 10 parameter signatures. That association
is historical proximity, not causality: the sound engine and BGM sequencer emit
independently between doors. It cannot overturn the ROM's four-byte queue
layout. W149's six-byte conclusion is corrected by this section.

## 2. `$34FB` is an active-voice control walker

`$34FB-$35D0` does not allocate or arm a voice. It scans voice indices 0 through
31 and, for each nonzero `$62EC` slot, compares slot `+$02` with its 16-bit
selector argument. Only matching active slots are affected. Interrupts are
disabled around the mutation and restored afterward.

Its third argument selects one of three operations:

| mode | callee | exact effect on every matching active slot |
|---:|---:|---|
| 0 | `$0E55` | select the slot's ICS voice and write the supplied 16-bit value to OscFC register `$01` |
| 1 | `$0E81` | select the slot's ICS voice and write the supplied level through `$5997[value]` to volume register `$09`; value zero uses word `$5999` |
| 2 | `$3F22` | if the ICS shadow voice is allocated, call `$0A0C` keyoff and clear the shadow allocation, then clear slot state |

The dispatcher call sites fix the command meanings:

- cmd `$0D`, handler `$0527`, calls mode 1;
- cmd `$0E`, handler `$0592`, calls mode 0 after obtaining the additional value;
- cmd `$0F`, handler `$04DD`, calls `HL=selector, DE=0, BC=2`, hence mode 2.

Therefore cmd `$0F` is **stop/release all active voices carrying a selector**.
It is not a note-on variant and cannot own 10 keyons. W144's label and W147's
remaining-keyon accounting confuse temporal association with causation. An L1
implementation should route cmd `$0F` to selector-matched release, not to a
populator.

## 3. The four BGM event families

The primary dispatch at `$28AC` masks the event byte with `$C0` and uses the
four-entry table at `$2BC6`:

```text
$00 -> $28D4    $40 -> $2908    $80 -> $293B    $C0 -> $29E2
```

The live byte grammar is:

| first byte | bytes | state transition |
|---|---:|---|
| `$00-$3F` | 1 | clear track `+$0F` and `+$10`; set wait `+$07 = event & $3F` |
| `$40-$7F` | 2 | set `+$0F = event & $0F`, `+$10 = byte1` |
| `$80-$BF` | 2 | set `+$0F = 8`; optionally select descriptor from byte1; optionally set note from `event & $3F` |
| `$C0-$FF` | 3 or 4 | subdispatch on `event & $30`, combining state/parameter with optional note and descriptor |

All advances are performed on the stream pointer at track `+$0D`. A note value
is encoded one-based: a nonzero six-bit value becomes track `+$11 = value - 1`
and immediately calls `$14AB`. A descriptor byte is also one-based: nonzero
byte `n` becomes index `n - 1`, track `+$08`; track `+$09` becomes
`[$62E6] + index * 22`. Descriptor byte `+$0C` seeds track `+$06` and `+$03`,
and selecting a descriptor clears track `+$26`.

The `$C0-$FF` subdispatch table at `$2BBA` has only two explicit entries:

```text
(event & $30) == $10 -> $29FE
(event & $30) == $20 -> $2A51
otherwise            -> $2AF5
```

That yields the exact secondary grammar:

| family | bytes | fields |
|---|---:|---|
| `$D0-$DF` | 3 | state low nibble, parameter byte1, optional note byte2 |
| `$E0-$EF` | 3 | state low nibble, parameter byte1, optional descriptor byte2 |
| `$C0-$CF`, `$F0-$FF` | 4 | state low nibble, parameter byte1, optional note byte2, optional descriptor byte3 |

For example, cue 8 begins `CF 78 2A 07 04 AA 07 04`. It parses as a four-byte
combined event `(state=$0F, parameter=$78, note=41, descriptor=6)`, a wait of
four ticks, a two-byte note event `(note=41, descriptor=6)`, then another wait.
W145/W147 grouped this as `CF 78 2A` followed by triples such as `07 04 AA`.
That is one byte out of phase. The current `parseEvent()` repeats the same
error and must be replaced, not extended.

After parsing, `$2BF0` indexes the handler table at `$4316` by track `+$0F`.
Only values 0 through 15 are produced by this grammar. Their handler addresses
are, in order:

```text
$1D2E $1DF6 $1E3B $1E7E $1E9B $1EE4 $1EEB $1EF2
$1F3B $1F3C $1F84 $1F88 $1FE5 $2037 $245A $247A
```

This post-parse state machine remains an explicit L2 dependency. Event framing
alone is enough to export and rehydrate streams without losing alignment, but
it is not enough to synthesize arbitrary live BGM faithfully.

## 4. Runtime tables and exact boundaries

All multibyte values below are little-endian Z80 words. These are score-bank
tables present in the live `z80ram.bin`, not fixed program-ROM constants.

### 4.1 Immediate SFX selector and the `$7600` table

Boot leaves `[$62EA] = $7600` and `[[$62E8]] = $0045`. `$3150` masks its
16-bit caller value with `$03FF`, multiplies that selector by 12, adds the base,
stores the resulting pointer in the active slot, and rejects selectors greater
than or equal to 69. The complete path is therefore:

```text
packed command bytes 2/3
  -> selector = byte2 | ((byte3 & 3) << 8)
  -> cmd $00/$01/$02 handler
  -> $3245
  -> $3150(selector)
  -> $7600 + selector * 12, bounded by 69
  -> $0B92 ICS register programmer
```

The 69 entries occupy `$7600-$793B`. `$0B92` establishes this 12-byte layout:

| offset | use |
|---:|---|
| `+$00` | OscSAddr, static address bits 27..20, written to ICS `$11` high byte |
| `+$01` | not read by `$0B92`; preserve raw |
| `+$02..03` | OscFC source word copied by `$3150`, later written to ICS `$01` |
| `+$04..05` | normal initial OscAccL, ICS `$0B`; also OscStrtL, ICS `$03` |
| `+$06..07` | normal initial OscAccH, ICS `$0A`; also OscStrtH, ICS `$02` |
| `+$08..09` | alternate initial OscAccL when slot flag `$40` is set, ICS `$0B`; always OscEndL, ICS `$05` |
| `+$0A..0B` | alternate initial OscAccH when slot flag `$40` is set, ICS `$0A`; always OscEndH, ICS `$04` |

The register meanings are from the primary ICS2115 Rev B datasheet's register
map, page 15; the byte/word sources are independently fixed by `$0B92`. The
datasheet declares `$03/$05` as 8-bit registers while the compiler passes a
word to its generic driver helper, so the transformed export preserves those
words and the existing register-file half semantics remain authoritative.
Offset `+$01` remains deliberately raw because this consumer does not read it.

### 4.2 BGM descriptors at `$6840`

`[$62E6] = $6840`. The table ends exactly where the SFX table begins:
`$7600 - $6840 = $0DC0 = 160 * 22`. Thus it contains 160 entries, indexed 0
through 159. Live track pointers, including `$73DA`, land on this grid
(`($73DA-$6840)/22 = 135`) and independently validate the stride and extent.

Known fields from `$14AB` and `$15B3` are:

| offset | exact consumer |
|---:|---|
| `+$00` | OscSAddr, static address bits 27..20, ICS `$11` high byte |
| `+$01` | OscConf, ICS `$00` high byte; zero also gates programming of `+$0E..11` |
| `+$02..03` | unresolved here; preserve raw and keep loud in L2 |
| `+$04..05` | initial OscAccL, ICS `$0B` |
| `+$06..07` | initial OscAccH, ICS `$0A` |
| `+$08..09` | OscEndL, ICS `$05` |
| `+$0A..0B` | OscEndH, ICS `$04` |
| `+$0C` | base level, copied to track `+$06` and `+$03` |
| `+$0D` low nibble | pitch-bank index, 0 through 15 |
| `+$0E..0F` | OscStrtL, ICS `$03`, when `+$01` is nonzero |
| `+$10..11` | OscStrtH, ICS `$02`, when `+$01` is nonzero |
| `+$12..15` | unresolved here; preserve all four raw bytes and keep loud in L2 |

No unknown field is assigned a musical name. That prevents an export schema
from turning an unproved label into a runtime assumption.

### 4.3 Pitch table at `$5203`

`$14AB` computes:

```text
bank = descriptor[$0D] & $0F
row  = $5203 + bank * $78
fc   = LE16(row + track.noteIndex * 2)
track[$16..17] = fc
```

Each bank is `$78 = 120` bytes, hence 60 pitch words. The four-bit bank index
gives 16 banks and 1,920 bytes total. The exact half-open interval is
`[$5203,$5983)`, with `$5983` beginning the next fixed table. For example,
bank 0 note 41 resolves to `$00A0`, the word observed in the corresponding live
track snapshot.

## 5. The streaming rejoiners have real tail callers

The two rejoiners are not called directly by the gameplay wrapper table. Their
real callers are the score-index resolvers:

- `$28CAFC` indexes the four-byte `$28BBD8` table, performs `$28B884`, loads
  the table's second word as the id, restores pan from `D7`, then tail-jumps at
  `$28CB14` to `$28C11C` (type `$12`);
- `$28CB1A` performs the same work and tail-jumps at `$28CB32` to `$28C146`
  (type `$11`).

Leaf wrappers call those resolvers with a fixed score index and `D7=$00FF`.
For example `$28CB38` selects index 7 through `$28CAFC`; `$28CB4C` and
`$28CB60` select indices 8 and 9 through `$28CB1A`. The service-input poller
at `$28BEE4` is an additional direct call to `$28C11C`, not the production
source of all streaming posts. A port must wire the leaf wrapper/resolver path,
not invent a call from `Game` to a disconnected `postStreamingRejoiner()`.

The complete static 68k gameplay caller inventory for these leaf wrappers is:

| wrapper | resolver/type | callers |
|---:|---|---|
| `$28CB38` | `$28CAFC`, type `$12` | `$25CA88` |
| `$28CB4C` | `$28CB1A`, type `$11` | `$288C8C` |
| `$28CB60` | `$28CB1A`, type `$11` | `$242952`, `$2429CA` |
| `$28CB74` | `$28CAFC`, type `$12` | `$28F360` |
| `$28CB88` | `$28CAFC`, type `$12` | `$2A4FBC` |
| `$28CB9C` | `$28CAFC`, type `$12` | `$25D5C2` |
| `$28CBB0-$28CC00` | `$28CAFC`, type `$12` | no static caller |
| `$28CC14` | `$28CAFC`, type `$12` | `$2A63FA` |
| `$28CC28` | `$28CAFC`, type `$12` | `$290EBE` |

The port currently reaches none of them as a sound producer. In particular,
`stageend.js` records `$242952 -> $28CB60` only in `UnportedLog`, while
`sound.js` exposes `postStreamingRejoiner()` without a caller.

## 6. Complete live producer/consumer inventory

There is one record shape and no hidden side channel:

1. Gameplay calls a constant wrapper. The normal wrappers enter `$28C02A`,
   `$28C074`, or `$28C0AE`; streaming wrappers use the resolver paths above.
2. `$28BB04` or its shape-identical packer writes the four-byte longword and
   `$28BAA0` enqueues it in the 68k ring.
3. BIOS `$18AD4C` writes that longword at `$C10006`; it is the only live writer
   in the capture. `$18AD78` rings the NMI doorbell.
4. NMI `$07F6` passes source offset 6 to `$3BEA`; `$3BEA` reads element size 4
   from `$6001+$08` and enqueues exactly those bytes.
5. Main loop `$0321` polls `$3BB5`, dequeues through `$3CDD`, and dispatches the
   command byte through `$41D0` and table `$078E`.
6. Cmds `$00/$01/$02` reconstruct the selector and call `$3245->$3150`; cmd
   `$0F` calls the selector-matched `$34FB`; cue commands call `$2E38` or
   `$2D9B`. `$3150` is the only `$7600` resolver and `$14AB` is the BGM
   descriptor/pitch resolver.
7. `$376C` and `$25F2` consume the resulting active-slot/track state and feed
   the register programmer and keyoff routines.

In the port, all current `ctx.soundPost` sites feed `postWrapper()`, then
`packLongword()`, and `Game.step()` drains one record through `drainFrame()`.
That drain preserves all four raw bytes but exposes byte 2 as `id` and all of
byte 3 as `chan`. The correction is semantic, not two missing bytes: it must
also expose `selector` and decoded six-bit `channel`. Production constructs no
`SoundChain`; its only consumers are tests. The streaming stage-clear producer
is still only logged. No `after_door` lookup is part of the live chain.

## 7. Transformed export and JSON rehydration contract

The next export must extend the existing deferred sound JSON rather than ship a
raw Z80 slice or add a `PUBLISH_VERBATIM` exception. A single deferred
`snd/driver-params.json.gz` is sufficient:

```text
{
  version: 1,
  sfx: { base: 0x7600, stride: 12, entries: [69 semantic records] },
  bgm: { base: 0x6840, stride: 22, entries: [160 semantic records] },
  pitch: { base: 0x5203, stride: 0x78, banks: [16 arrays of 60 words] }
}
```

Each SFX record contains `r11`, `raw01`, `initialFc`, `r0B`, `r0A`, `r05`,
and `r04`. Each BGM record contains `r11`, `r00`, `raw02`, `r0B`, `r0A`,
`r05`, `r04`, `baseLevel`, `pitchBank`, `r03`, `r02`, `raw18`, and `raw20`.
The `raw` names are intentional unresolved fields, not invitations to guess.
All words are decoded numbers and all records are objects, so the artifact is a
semantic transformation, not contiguous ROM bytes.

The JSON loader must reject an unknown version, wrong entry/bank count, wrong
stride/base, noninteger byte/word, pitch bank outside 0..15, or pitch row not
exactly 60 words. It should freeze the decoded records and expose indexed
`sfx(selector)`, `bgm(index)`, and `pitch(bank,note)` accessors. No caller may
fall back to an oracle history table when validation fails.

`bgm-score.json` separately needs an explicit `scoreFromJson()` rehydrator:
validate 11 cues and eight tracks, decode every even-length note-stream hex
string to bytes, and reconstruct the `CueBlock`-compatible shape consumed by
`BgmSequencer`. The exporter note and comments must use the W150 event grammar.
The current artifact stores valid raw stream bytes, but its prose and runtime
parser assign them the wrong event boundaries.

## 8. Implementation-ready L1/L2 split

### L1: live selector, SFX table, and control commands

- decode `selector` and six-bit `channel` at the existing four-byte door;
- export and rehydrate the semantic driver tables above;
- replace `SfxParamTable.byDoor` with the selector-indexed `$3150` path;
- transcribe `$3245/$3150` slot population and `$0B92` inputs from the decoded
  command and descriptor, with the 69-entry bounds check loud;
- implement cmd `$0D/$0E/$0F` through `$34FB`, including selector-matched
  release for `$0F`;
- connect the real streaming leaf wrappers through `$28CAFC/$28CB1A` rather
  than calling a rejoiner out of context.

This wave removes the production need for every `after_door` SFX fixture.

### L2: live BGM grammar and parameter state

- replace `parseEvent()` with the four primary families and four `$C0`
  subfamilies from section 3;
- correct track offset labels, including note at `+$11`, resolved FC at
  `+$16`, descriptor index/pointer at `+$08/+$09`, and wait at `+$07`;
- resolve descriptor and pitch through `$6840/$5203` exactly as section 4;
- port state handlers 0..15 from the `$4316` table before claiming arbitrary
  cue fidelity, then feed their resulting track state into `$14AB/$15B3`;
- rehydrate the score JSON rather than depending on a test-only in-memory
  `parseScore(z80ram)` object.

Only after both layers are live may the browser adapter be called audible for
arbitrary gameplay cues.

## 9. Executable recon gate and mutation

`tools/w150soundrecon.mjs` checks the queue header and copy opcodes, exhaustive
selector/channel packing, table bases/counts/extents, live descriptor-pointer
grid, primary and secondary event switches, all 16 state-handler pointers,
complete framing of cue 8, the three `$34FB` modes, and the real streaming tail
jumps. It uses only ROM/listing facts for claims; it does not read
`after_door`, mailbox history, or injected parameter fixtures.

Green:

```text
node tools/w150soundrecon.mjs
W150 sound recon: 200 checks green; cue8 events=141
```

Deliberately mutating the queue element size from 4 to 6 in memory makes the
gate red without changing the evidence file:

```text
node tools/w150soundrecon.mjs --mutate-queue-size
Error: queue element size: got 6, want 4
```

Running the normal command immediately afterward restores green. All claims in
sections 1, 3, and the table-boundary portion of section 4 are executable. The
musical meaning of raw descriptor fields and the human meaning of state-handler
effects are not made red because this wave does not claim either.

## 10. Final gates

- `node tools/w150soundrecon.mjs`: 200 checks green, 141 cue-8 events framed.
- deliberate `--mutate-queue-size`: red with `got 6, want 4`; normal rerun
  restored 200 green.
- `node --test games/ddpdoj/tests/`: 1,351 passed, 0 failed, 0 cancelled,
  0 skipped, 0 todo.
- `node tools/publish.mjs --only ddpdoj --dry`: 1,351 passed, 0 failed,
  0 skipped; bundle gate green; web fetch gate green; ROM-leak guard checked
  275 files against 12 ROMs and retained exactly 6 deliberate exceptions;
  279-file dist built; dry only, not deployed.

No asset export input changed, so asset regeneration was not applicable. The
three user-owned untracked `c1_*.py` files were neither read for evidence nor
modified or staged.
