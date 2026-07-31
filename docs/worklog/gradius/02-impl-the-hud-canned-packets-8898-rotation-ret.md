# Wave 2 — The HUD: canned packets + the $8898 rotation. Retire the knownFail.
status: DONE
wave: 2   role: impl   started: 2026-07-31

WRITER. I am the only agent writing to `games/gradius/src/` this wave.

## The task, as I understood it

From `00-plan.md` §Wave 2:

1. `tools/export_assets.py` emits `assets/hud/packets.json` from the 39-entry
   `$864E` pointer table (ROM-derived → gitignored, `verify_assets.py` check).
2. New `src/hudpackets.js`: `$85E8` prologue (falls through into `$85F3`) +
   `$85F3` copier (`$FF`/`$FE`/`$FD`, index bit 7 blanker) + the `$863D`/
   `$8641`/`$8645`/`$8647`/`$864B` append primitives. Byte-for-byte unit tests
   against the measured queue images (f572=8, f574=14, f576=39, f578=14).
3. New `src/hud.js`: `$8898` — `$0E < 4` gate, `$02 & 1` odd parity,
   `$48 = ($48+1) & 3`, four producers `st_88B6`/`st_88F6`/`st_89E3`+`$8A30`/
   `st_892C`. Called at the `$9AC7` position, BEFORE the streamer.
4. Seed the producer inputs from the cartridge seed, with an honesty comment.
5. `$48` into `state.js`, `0048` into watch; re-record.
6. Remove the `terrain-streams-at-double-rate` knownFail in the SAME commit.
7. Re-enable nametable rows 28/29 in the renderer comparison.

## What I MEASURED (in the order I measured it)

### Baseline, before I touched anything

```
node --test games/gradius/tests/       59 pass, 0 fail, 0 skipped
node games/gradius/tools/test-all.mjs  GREEN -- 5 passed, 0 failed, 0 SKIPPED
  17 scenarios, 3580 of 4423 frames compared (6 truncated), 0 failures
  [STILL BROKEN] terrain-streams-at-double-rate: 51 field/scenario pairs
      long-idle:w_000E@402  w_0054@598  w_0055@854  w_0057@599  w_0058@572
python games/gradius/tools/verify_assets.py   OK, 8 check families
```

### The cartridge's own $8898, re-run by me (not quoted from the recon)

```
python games/gradius/tools/oracle/queue.py --frames 700 \
    --script "200:,10:S,490:" --from 566 --to 578 --packets

$8898 entered=390  passed both gates=195  (on $02 even=0, odd=195)
[PASS] $864E decode length == measured $0E delta (15 pairs, 0 wrong)
```

and the literal `$0700` images at the streamer's gate, which are what
`src/hud.js` had to reproduce byte for byte:

```
566 14 01 23 B4 64 65 00 30 30 35 30 30 30 30 FF          st_88F6
568 39 01 23 84 09 0A 0B 0C 0D 0E 0F 10 11 12 13 14 15 16 17 18 19 1A 1B 1C
       1D 62 63 1F FF 01 23 F8 00 00 00 00 00 00 00 FF    st_89E3 + $8A30
570 14 01 23 A8 31 66 00 30 30 30 30 30 30 30 FF          st_892C
572  8 01 23 A2 00 61 00 33 FF                            st_88B6
574/576/578 repeat; 567,569,571,573,575,577 = 0 bytes
```

### The seed, cross-checked BEFORE writing a line

From `out/scen/*.json` `seedRam` (identical in all 17 scenarios) at align 400:

```
$02=91 (ODD)  $0E=28  $18=00  $20/$21=3/3  $42=00  $46=00  $48=2E
$0100=01  $41/$44/$45=0  $07E0..EB = 00 50 00 00 | 00 00 00 00 | 00 00 00 00
```

`$48 = $2E`, and `$2E AND 3 = 2`, so the tick that ran on frame 400 was
st_89E3 -- 39 bytes -- and `$0E = $28 = 40` is exactly those 39 plus $8641's
one. The model predicted the seed before the code existed.

### Three captures, three DIFFERENT lives values

`tools/oracle/out/video/*/ram.bin` + `nt.bin`:

```
f400   $20 = 3  row29 = .. 61 00 33 ..
f1200  $20 = 1  row29 = .. 61 00 31 ..
f3500  $20 = 0  row29 = .. 61 00 00 ..   <- $88E1 CMP #$30 / BEQ $88F0
```

so st_88B6's zero-lives suppression is exercised by real cartridge data, not
by an invented case.

## What I did

### `$0700` is a real byte image now, and it had to be

`src/vram.js` used to carry the queue as a list of `{addr, inc, bytes}` objects
with `$0E` maintained beside it -- described in its own header as "the only
representational liberty in the port". It stopped being tenable at the first
producer:

* `st_88B6` patches bytes it has ALREADY appended, by absolute address
  (`$88E5 STA $06FE,Y` with Y = `$0E`);
* `st_89E3` builds ONE open run out of six separate `$85F3` copies plus a bare
  `$FF` from `$863D` -- six "packets" that are one packet on the wire;
* `$8A30` patches a single attribute byte at `$0700,X`, X = `$0E - (8 - $42)`.

So `state.vram.q` is a `Uint8Array(256)` and `$0E` is an 8-bit cursor into it.
`drainQueue` is now a transcription of `$8A51` including the `$FF` escape
(`$8A93 LDA $0700,Y / CMP #$03 / BCS $8A86`: the byte AFTER an `$FF` is peeked,
not consumed, and `>= 3` means the `$FF` was data).

Three things fell out that I did not plan for:

1. **The `$0E` wrap knownFail retired itself.** `tests/frame-gates.test.js`'s
   `[knownFail] $864A INX ... $0E is an 8-bit byte and wraps` went SURPRISE
   PASS on the first run. Unwrapped into an ordinary test, per helpers.js's
   own instructions, in this commit.
2. **`$8A76` clears only `$0700[0]`,** not the page. I clear only that byte,
   which is what the ROM does -- and it bit immediately: `tests/terrain.test.js`
   without `$80B0`'s `$8641` stop byte reported **37 wrong nametable bytes,
   including the playfield's own attribute table**, because a 14-byte frame
   after a 39-byte one leaves 25 stale bytes and the drain walks straight into
   them. The stop byte is the only thing that ends the queue. That is now its
   own test.
3. **The terrain streamer's packet shape was wrong** (below).

### `src/terrain.js`: the tile packets are ROWS, not columns

`emitBlock` queued four COLUMNS with PPU increment 32 and its comment said the
collision derivation forced that reading. The ROM says otherwise:

```
9E94  A9 01     LDA #$01     the ATTRIBUTE packet, queued FIRST
9EC2  A9 04 85 99 / A9 01 9D 00 07   each TILE packet, mode $01
9ED8  A9 20 18 65 AA 85 AA           and the address += $20 between them
```

Mode 1 is `$8A4B[1] = $00`, i.e. increment 1. So each packet is a row of four
tiles and the next packet is one tile row down. The collision walk at `$9F60`
then reads `$0703,Y` with `Y += 8` -- the first data byte of each of the four
packets, which with rows-on-the-wire is tile COLUMN 0 -- and `$9F88 INC $AF`
steps to the next column. The transpose is the ROM's, not the port's.

### `src/hudpackets.js` and `src/hud.js`

`$85E8` (prologue, appends mode byte `$01`, falls through), `$85F3` (the copier
with `$FF`/`$FE`/`$FD` and the index-bit-7 blanker), `$863D`/`$8641`/`$8645`/
`$8647`. Then `$8898` with the `$0E < 4` gate, the `$02 & 1` parity, the byte
`$48`, and `st_88B6` / `st_88F6` / `st_89E3`+`$8A30` / `st_892C`. Called at the
`$9AC7` position, before the `$5B` gate and the streamer.

Two fall-throughs are ported AS fall-throughs and labelled: `$85E8 -> $85F3`
and `$8A2D -> $8A30` (`$8A2D JSR $863D` is the last instruction of `$89E3`).
`$88B6`'s `LDA #$1E / STA $9A` is transcribed as a no-op with the reason
written down -- `$85E8`'s `PLA` and `$85F3`'s own `STA $9A` overwrite it two
instructions later, and "why is there a store here" is a question the next
reader will ask too. `jt_88AD`'s fifth entry `st_A960` is unreachable through
`AND #$03` and is named, not silently absent; so is the fact that `$88B5`'s
`60 A9` doubles as the `LDA #$1E` opcode at `$88B6`.

### Assets

`tools/export_assets.py` emits `assets/hud/packets.json` -- the 39 RAW streams,
control codes included, because `src/hudpackets.js` is the thing that
interprets them. `tools/verify_assets.py` gains a ninth check family, `hud`,
which re-reads each pointer at the FILE OFFSET the JSON recorded, re-decodes
the stream with the terminator rule written out again, and holds the ten
stage-1 packets against `EXPECT_HUD_STREAMS` -- transcribed by hand from the
cartridge's own `$0700` images, not from the listing. Two new mutations. The
`NOT_EXPORTED` note claiming the packet format "has not been transcribed" is
deleted in the same commit (rule 6).

**`verify_assets.py` is now a gate stage.** It had been outside the gate since
it was written, which is docs/knowledge/02 trap 5, and wave 2 added a family to
it.

## What I MEASURED (after)

```
node --test games/gradius/tests/            80 pass, 0 fail, 0 skipped  (was 59)
python games/gradius/tools/verify_assets.py --self-test
    9 families green; 21 of 21 mutations reddened their target;
    9 of 9 families seen red
python games/gradius/tools/oracle/scen.py   17 scenarios, 105 watched addresses
node games/gradius/tools/test-all.mjs
    GREEN -- 6 passed, 0 failed, 0 SKIPPED
    17 scenarios, 3580 of 4423 frames compared (6 truncated: right-wall@493,
    diag-rd-lu@533, diag-ru-ld@445, lr-both@482, speed6-right@515,
    speed3-diag@529), 0 failures, 0 clamps uncovered, 0 stale annotations,
    9 fields SKIPPED (was 10)
    === knownFail ANNOTATIONS ===          <- EMPTY. no [STILL BROKEN] line.
node tools/build-dist.mjs
    rom-leak guard: 115 files checked against 2 ROM(s) -- clean, no allowlist
```

The five formerly-annotated fields, on long-idle's 599 compared frames:

```
w_000E  TIER1  first=null  0/599      w_0057  TIER1  first=null  0/599
w_0054  TIER1  first=null  0/599      w_0058  TIER1  first=null  0/599
w_0055  TIER1  first=null  0/599
```

and all five CHANGE VALUE inside the window, so this is not vacuous green:
the fields that move on long-idle are `w_000E w_0036 w_0048 w_0054 w_0055
w_0057 w_0058 w_0140`.

Same 3580 of 4423 frames and the same six truncations as the baseline: no
scenario got shorter, none got longer (death is wave 5).

### The port's own queue, against the cartridge's four images

```
f 0 $02=92 $48=2e $0E= 1  00
f 1 $02=93 $48=2f $0E=15  01 23 a8 31 66 00 30 30 30 30 30 30 30 ff 00
f 2 $02=94 $48=2f $0E= 1  00
f 3 $02=95 $48=30 $0E= 9  01 23 a2 00 61 00 33 ff 00
f 4 $02=96 $48=30 $0E= 1  00
f 5 $02=97 $48=31 $0E=15  01 23 b4 64 65 00 30 30 35 30 30 30 30 ff 00
f 6 $02=98 $48=31 $0E= 1  00
f 7 $02=99 $48=32 $0E=40  01 23 84 09 .. 1f ff 01 23 f8 00 x7 ff 00
```

byte-identical to the cartridge's f572/f574/f576/f578 dumps, and `$0E` cycling
1 / 15 / 1 / 9 / 1 / 15 / 1 / 40 -- the four values wave 1 measured in the
cartridge's own `$0E` histogram (`{1:339, 9:86, 15:173, 40:87, ...}`).

### Rows 28-29 are back in the comparison, and the whole 4 KB matches

`tests/terrain.test.js` no longer exempts any row:

```
f400:  $20 = 3, differing rows []
f1200: $20 = 1, differing rows []
f3500: $20 = 0, differing rows []
```

Three captures, three different lives values -- so `st_88B6`'s zero-lives
suppression (`$88E1 CMP #$30 / BEQ $88F0`) is exercised by cartridge data.

### A NEW MEASUREMENT: the terrain block on the wire

`tools/oracle/queue.lua` only ever dumped `$0700` at the streamer's gate, which
is BEFORE `$9ACE` -- so no terrain packet had ever been seen. I added a second
dump at `$80B5`:

```
python games/gradius/tools/oracle/queue.py --frames 700 \
    --script "200:,10:S,490:" --from 560 --to 600 --tag blocks

f571  $54=00 $55=02 $58=01  n=38
  01 23 C0 4C FF | 01 20 00 00 00 00 00 FF | 01 20 20 00 3C 00 00 FF
  | 01 20 40 00 00 3F 00 FF | 01 20 60 3B 00 00 00 FF | 00
```

Attribute packet first; four tile packets at `$2000 $2020 $2040 $2060` -- 32
apart -- every mode byte `$01`. The port, driven to the same `$54/$55/$58`,
emits that string byte for byte.

## SEEN RED -- 17 deliberate breaks, each restored and sha1-checked

`<scratch>/break.py`. "corpus" = TIER 1 failures from a full `compare.mjs`.

| break | corpus | unit tests that went red |
|---|---|---|
| `no-hudtick` (delete the `$9AC7` call) | **68** | $0E histogram; THE THROTTLE |
| `parity-inverted` (`$88A2` even not odd) | **68** | $8641; the four images; $0E; throttle |
| `48-masked` (`$48 = ($48+1) & 3`) | **17** | $48-is-a-byte |
| `no-863d` (drop `$8A2D`'s `$FF`) | **17** | four images; $0E; one-open-run; owned cells |
| `no-8a30-fallthru` | **17** | four images; $0E; one-open-run; owned cells |
| `st88f6-index` (packet $12 -> $11) | **17** | four images; $0E; BCD; nametable f400 |
| `packet-shift` (table off by one) | crash | 4+ tests; `$8A51: $0700 has no mode-0 terminator` |
| `no-0e-gate` (`$889A` dropped) | 0 | the `CMP #$04` test |
| `double-laser-swap` (`$44` 1 vs 2) | 0 | the owned-cell test |
| `lives-0-draws-0` (`$88E1` dropped) | 0 | lives digits; **nametable f3500** |
| `lives-leading-0` (`$88E9` dropped) | 0 | four images; lives; $20,X; **nametable f400** |
| `meter-off-by-one` (`7 - $42`) | 0 | the `$8A30` cursor test |
| `drain-wipes-page` | 0 | the `$8A76` stale-bytes test |
| `cursor-unmasked` (no `& 0xFF`) | 0 | the `$0E` wrap test (the ex-knownFail) |
| `score-loop-up` (`$88FB` counts up) | 0 | BCD digits; `$892C` player split |
| `seed-48-zero` (`bootState`) | 0 | the $0E histogram test |
| `terrain-columns` (the OLD packet shape) | 0 | **the new f571 block-image test** |

Restored: 80/80 unit tests green, corpus back to 0 failures, sha1 of all six
touched `src/` files identical to the pre-break copies.

## THE FINDINGS

### 1. Eleven of the seventeen breaks are INVISIBLE to the oracle corpus

Same shape as wave 1's finding and for the same reason, one level up. The HUD's
inputs -- `$20,X`, `$07E0-$07EA`, `$42`, `$46`, `$41`, `$44`, `$45`, `$0100` --
are CONSTANT on all 3580 compared frames (3 lives, TOP 50000, score 0, no
capsule, no shield, alive), so every producer runs the same branch of every one
of its conditionals for the entire corpus. The oracle can see the queue's
LENGTH (`w_000E`) and therefore catches a missing packet or a missing
terminator; it cannot see a wrong DIGIT, a wrong cell, a wrong cursor position
or a swapped LASER/DOUBLE test.

`tests/hud.test.js` is the only thing that can, and it is deliberately built
from values the cartridge itself produced somewhere -- the three video captures
disagree about `$20` (3 / 1 / 0), which is what makes the lives producer's two
suppression arms real rather than invented.

**`no-0e-gate` deserves a line of its own:** the HUD's own `CMP #$04` gate can
never fire in this corpus, because `$8A7B` zeroes `$0E` at `$8099` and `$8898`
is the FIRST producer of the frame. Deleting it changes nothing anywhere except
one unit test. It will start mattering in wave 4, when the intro queues its
four canned packets before the tick.

### 2. A deliberate break that PASSED, and how I closed it

`terrain-columns` -- putting `src/terrain.js` back to four columns with
increment 32 -- turned **nothing** red on the first pass: not the 80 unit
tests, not the full-4 KB nametable comparison on three captures, not one of
3580 compared frames. Rows and columns fill the same 4x4 square, cost the same
37 bytes of `$0E`, and leave the same collision map, so a correction that is
unambiguously right about the ROM was unfalsifiable by the entire gate.

Closed by measuring something nobody had measured: `queue.lua` now dumps
`$0700` at `$80B5` as well as at `$9D83`, which is the only sample point at
which a terrain packet exists. `tests/terrain.test.js` compares one block's
wire image against the cartridge's f571 dump, and `terrain-columns` is red.

### 3. The corpus does NOT guard `bootState()`'s seeds

`seed-48-zero` (setting `$48` to 0 instead of the measured `$2E` in
`src/main.js`) left the corpus at 0 failures, because `porttrace.mjs`
`seedFromRam` overwrites `$48` from cartridge RAM. Everything `bootState`
seeds is untested by the oracle by construction -- `scenarios.json` has said so
since wave 0 ("everything BEFORE frame 400 is untested by this corpus,
including src/main.js's bootState()") and it now covers eight more bytes. The
unit test that drives whole NMIs from `bootState` is the only guard.

## What I could not do, and why

* **The `$FD` control code and the bit-7 blanker are still listing-only on the
  cartridge.** No stage-1 packet uses either. Both are transcribed and both have
  unit tests (index `$1F` = `27 D6 AF FD 27 DE AA FD 27 E6 FA FE` decodes to
  three packets; `$80|$11` keeps `23 A2` and zeroes the rest), but the tests
  check the port against my reading of `$8605-$863B`, not against the machine.
  `src/hudpackets.js` says so where the code is.
* **`st_A960`, `jt_88AD` entry 4.** Unreachable through `AND #$03`. I did not
  look for a second dispatcher with a wider mask; 00-recon-terrain.md left the
  same question open.
* **The seeded inputs are still seeded.** Nothing in the port writes lives, the
  score, `$42` or `$46`. The HUD's output is real; its input is borrowed. The
  honesty note lives in `src/state.js` under `SEEDED INPUTS`, next to the
  fields, and names the waves that close it (5, 6, 7).
* **`$8898`'s `$0E` gate, and `$89E3`'s `$0100 >= 2` early exit, are both
  unreachable from this corpus.** Unit-tested only.
* **`assets/hud/packets.json` reaches `dist/`** like every other cache under
  `assets/`. It is gitignored, nothing is committed, and the rom-leak guard
  clears it (115 files, no allowlist) -- but the guard only catches VERBATIM
  ROM byte sequences, and a decoded cache is not verbatim. That is a
  pre-existing property of the guard (it does not catch `chr/tiles.u8` either),
  not something this wave changed. Flagged, not fixed.
* **Wave 1's open `$5B` item is untouched.** `$9658 STA $5B` is still not
  ported and `tests/frame-gates.test.js` still carries it as a knownFail with
  the fix named. Not this wave's scope; the `$9ACA` gate around `streamBlock`
  is unchanged.

## If someone picks this up cold

```
node --test games/gradius/tests/hud.test.js          # 20 tests, the producers
python games/gradius/tools/verify_assets.py --self-test
python games/gradius/tools/oracle/queue.py --frames 700 \
    --script "200:,10:S,490:" --from 560 --to 600 --packets   # both dumps
node games/gradius/tools/test-all.mjs
```

The number that proves wave 2 landed: `compare.mjs` prints an EMPTY
`=== knownFail ANNOTATIONS ===` section. If a `[STILL BROKEN]` line comes back,
`hudTick(state, res.hudPackets)` at the `$9AC7` position in `src/nmi.js` is
gone, or its parity gate is inverted -- those are the only two breaks that put
the corpus back over 60 failures.
