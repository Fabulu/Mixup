# W152: implement live SFX Layer 3 driver

**Status: DONE**

The production Layer 3 path now preserves the real four-byte door, reconstructs
the ten-bit selector and six-bit channel, resolves all immediate SFX through the
69-entry `$7600` table, populates logical slots through the `$3245/$3150/$0B92`
contract, and implements selector-matched commands `$0D/$0E/$0F`. The old
`after_door` parameter history and fictional `ChannelManager` no longer exist in
production. The generated semantic driver-parameter asset is validated and
deferred. This wave does not claim audible sound.

## 1. Premise audit

I verified live HEAD `8830137` before implementation, then read past apparent
routine returns in the uploaded Z80 image and 68k listing. The W150 executable
recon gate was green before and after the work:

```text
node games/ddpdoj/tools/w150soundrecon.mjs
W150 sound recon: 200 checks green; cue8 events=141
```

The required premises held:

- `$6001` is an 80-record FIFO with a four-byte element size. `$07F6`'s `DE=6`
  is the banked source offset, not a six-byte length.
- the door is `[command][level][selectorLo][packedChannel]`, with
  `selector = selectorLo | ((packedChannel & 3) << 8)` and
  `channel = packedChannel >> 2`;
- `$0829` is unrelated setup code. It is not a channel manager;
- cmds `$00/$01/$02` reach `$3245 -> $3150`, and `$3150` bounds the selector
  before resolving `$7600 + selector * 12`;
- `$34FB` scans 32 active logical slots and matches their stored 16-bit
  selector. Modes 0, 1, and 2 write FC, write converted volume, and release;
- cmd `$0E` consumes one additional complete four-byte FIFO record and `$415E`
  interprets that record's first little-endian word as the FC value;
- `$7600` contains exactly 69 12-byte SFX descriptors, `$6840` contains exactly
  160 22-byte BGM descriptors, `$5203` is a 16 by 60 word pitch grid,
  `$5987` is the 16-byte pan table, and `$5997` is the 256-word volume table;
- the streaming leaves `$28CB38-$28CC28` select fixed score indices through
  `$28CAFC/$28CB1A`, then rejoin `$28C11C` or `$28C146`.

ROM and listing establish this inventory and behavior. The old oracle door
history is retained only by legacy tests as test-only validation data; it is not
a production parameter source or a causal account.

## 2. Implementation

### 2.1 Semantic parameter artifact

`src/driverparams.js` transforms the live 64 KiB Z80 image into decoded numeric
records. It exports:

- 69 frozen SFX records with `r11`, `raw01`, `initialFc`, `r0B`, `r0A`, `r05`,
  and `r04`;
- 160 frozen BGM descriptor records;
- 16 frozen pitch banks of exactly 60 words;
- the exact pan and volume conversion tables used by `$0B92/$0E81`.

The rehydrator rejects a wrong version, base, stride, count, byte or word range,
pitch bank, or pitch-row length. Indexed access is loud outside the live range.
No failure falls back to oracle history.

`tools/export-web.mjs` generates `snd/driver-params.json.gz` and names it in the
manifest's deferred sound section. The output is semantic JSON, not contiguous
ROM-derived bytes:

```text
raw JSON       37,208 B
gzip artifact   6,304 B
```

No `PUBLISH_VERBATIM` exception was added. The final dry publication retained
the existing six deliberate repository-wide exceptions, five of them DOJ
sprite-colour assets.

### 2.2 Live dispatch

`src/dispatch.js` now models the live `$0321` route and exact command table. It
contains the four-byte FIFO, complete door decoder, selector-indexed immediate
SFX populator, and the `$34FB` control walker.

The note-on path keeps logical `$62EC` slots separate from `$654E` ICS voice
allocations: `$3150` acquires and populates a logical slot, while `$37DB` binds
an ICS voice when the slot reaches keyon. Cmd `$01` releases matching voices
before note-on. Cmd `$02` selects the alternate OscConf family. Cmd `$0D`
writes the converted level, cmd `$0E` consumes its additional queue record and
writes FC, cmd `$0F` releases all and only selector matches, and cmd `$10`
releases all active slots.

The legacy `SfxParamTable.byDoor`, `after_door` production lookup, and
`ChannelManager` were removed rather than renamed. The legacy 613-door and
979-keyon oracle paths remain only in tests and are explicitly described there
as non-production validation.

### 2.3 Production door and streaming facts

`src/sound.js` now exposes `packedChannel`, `selector`, and decoded `channel` on
every drained production door. Fixed streaming leaves resolve their exact
index/type pair and enter the real tail. `$28CB60`, the stage-clear leaf already
called by `src/stageend.js`, is therefore a production-originating type `$11`
door with selector 9 rather than an unported-log note.

The first word selected by each streaming leaf is passed to `$28B884` on the
board. Its group-side effect is recorded in `SoundState.streamingResolvers` and
remains refused below; this wave does not invent an effect for it.

### 2.4 Shared logical-slot correction

The small necessary change in `src/voice.js` separates logical slots from ICS
voice numbers, adds the exact immediate FC/volume register helpers used by
`$34FB`, and finds an ICS voice's logical owner on release/IRQ. It does not
extend or claim the existing frame-level oscillator approximation.

## 3. Focused proof

The W152 focused tests prove:

- exhaustive round-trip reconstruction of all 1,024 selectors across all 64
  packed channels;
- exact SFX/BGM/pitch/control boundaries and frozen accessors;
- artifact freshness against a new transform of `z80ram.bin` and manifest
  discovery;
- loader rejection for version, layout, count, byte/word, and pitch errors;
- arbitrary SFX selectors 0, 13, 36, and 68 resolve to the expected descriptor
  and `$0B92` register inputs, while selector 69 refuses loudly;
- cmd `$0F` releases two selector matches while preserving a nonmatch, and a
  completely unmatched selector is a no-op;
- cmds `$0D/$0E`, including the additional complete record consumed by `$0E`;
- a real shot wrapper door reaches selector `$24` without injected history;
- the real stage-clear leaf `$28CB60` resolves index 9 and type `$11`;
- exact FIFO capacity and the absence of forbidden production history/model
  names.

Focused result:

```text
node --test games/ddpdoj/tests/dispatch.test.js \
  games/ddpdoj/tests/sequencer.test.js \
  games/ddpdoj/tests/sound.test.js games/ddpdoj/tests/voice.test.js
33 passed, 0 failed, 0 skipped, 0 todo
```

## 4. Deliberate red mutations

Each new load-bearing check was demonstrated red and the source was immediately
restored with `apply_patch` before the final suite:

1. In `decodeDoor`, changed the selector high-bit mask from
   `(packedChannel & 3)` to `(packedChannel & 1)`. The gate failed for selector
   `$334`: expected 820, got 308.
2. In `$34FB` matching, changed `slot.selector !== selector` to equality. The
   cmd `$0F` test reported affected 1 instead of 2, and the cmd `$0D` register
   assertion also failed.
3. In the SFX transform, changed `r11: bytes[p]` to `bytes[p] ^ 1`. Artifact
   freshness failed its deep equality against the regenerated gzip asset.

The normal commands were rerun after every restoration. None of the mutations
is present in the final tree.

## 5. Final gates

```text
node games/ddpdoj/tools/w150soundrecon.mjs
  200 checks green; cue8 events=141

node games/ddpdoj/tools/export-web.mjs
  snd/driver-params.json.gz 6304 B (from 37208 B), deferred
  total 3739.7 KiB; boot 554.2 KiB; deferred 3185.5 KiB

node --test games/ddpdoj/tests/
  1359 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo

node games/ddpdoj/tools/bundlegate.mjs --assets games/ddpdoj/assets \
  --dump games/ddpdoj/rip/pix-demo \
  --tsv games/ddpdoj/tools/oracle/out/w6/demo.tsv
  15955968/15955968 = 100.0000% identical over 159 frames

node games/ddpdoj/tools/webgate.mjs --assets games/ddpdoj/assets
  PASS: 15 files fetched over HTTP; all downstream web checks green

node tools/publish.mjs --only ddpdoj --dry
  1359/0/0/0/0 unit tests; bundle and web gates green
  ROM-leak guard clean: 277 files, 53 decompressed, 12 ROMs,
  exactly 6 existing deliberate exceptions
  dist built: 281 files, 8744 KB
  --dry: built and gated, not deployed
```

`git diff --check` is clean. Assets were regenerated before the publication
claim. Nothing was deployed.

## 6. Explicit refusals and next layers

This is Layer 3 only. The following facts remain deliberately unresolved or
owned by later waves:

- **Layer 2 BGM:** rehydrating the parsed score, implementing the live byte
  grammar and all 16 `$4316` state handlers, descriptor/note progression, and
  replacing the current test-only sequencer shortcuts;
- **ICS synthesis:** W151 established that all 1,620 live keyons are linear8,
  OscConf bit 3 is loop, `$20` is one-shot with oscillator IRQ, `$08` is loop,
  `$00` is one-shot without IRQ, and FC advances 20.9 phase by `fc >>> 1`.
  `src/voice.js` still contains an older bit-1/frame-lifetime approximation.
  W152 neither depends on it for its assertions nor claims it is correct;
- **runtime/chip timing:** exact ICS clock, sample stepping, IRQ scheduling,
  mixer scaling, and the board's static volume/pan behavior;
- **68k bridge:** automatic routing of every drained `Game` door into a loaded
  `SoundChain`. This wave proves one real Game-originating wrapper as far as
  Layer 3 permits, but production still stops at the four-byte door;
- **browser audio:** loading deferred driver/sample assets, AudioContext worklet
  ownership, buffering, resampling, and user-gesture policy;
- **streaming group side effect:** the exact `$28B884` effect for the first
  score-table word;
- **cmd `$0E` timing:** exact blocking/interrupt behavior beyond the faithfully
  framed second FIFO record.

Until those layers land, register-write fidelity is proved but sound remains
inaudible. That limitation is explicit and is why this wave was dry-published
only.
