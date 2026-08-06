# W24 RECON - the movement interpreter: streams dumped, 13 opcodes decoded, loop-back found

status: **DONE (recon).** The movement bytecode streams are dumped and
inventoried, the interpreter `$2638A6` and its init-reader partner `$263808` are
decoded opcode-for-opcode, the loop-back is located, and the velocity-cache
path is traced end to end. The W23 deferred fields (the 511 speed/heading/
anim/flags overrides) are confirmed as exactly this interpreter's output.
The implementer has the denominator (163 streams / 3454 B; 13 opcodes; the
dispatch table; the resource-resolution chain) and the gitignored stream dump
(`assets/w24-movement/`).
wave: 24 (plan W24)   role: RECON (READ-ONLY - no `src/` edits, no commit)
date: 2026-08-03
target: `ddpdojblk` VERSION-B (`$23xxxx`–`$29xxxx`). Every address is build B
unless the line says why. Static decode from `tools/oracle/out/maincpu.bin`
(capstone/unidasm 5.0.7); the resource is read directly at its ROM offset
(see §2 - the protection is one layer of indirection that stores a ROM address).

## THE SPEC (plan §3, verbatim)

> **W24 - the movement interpreter.** `$2638A6`, the 13 opcodes (12 escapes +
> `>= $C0` set-speed; 8 of 12 escapes are UNREAD - read them first, and one is a
> loop-back, so a partial interpreter runs off the end of a stream), the
> velocity cache invalidation, `$241812` direction+speed → `$200920`. FIRST dump
> the byte-code streams: each record's 12-bit index through aux `$23170C` into
> resource `#$1F` - the streams are NOT yet dumped and W24 cannot be tested
> without them. *Done when:* the streams are dumped and inventoried (count,
> sizes); interpreter passes listing-derived unit tests; one scripted mover's
> position track compares at 0 divergent over its whole life.

The recon delivers the first two done-when preconditions (the dump+inventory
and the decoded opcodes) and names the unit-test substrate for the implementer.

## THE DENOMINATOR (measured, not promised)

### Resource `#$1F`, stage 1 - `$231852..$2325D0`, 3454 B (`$0D7E`)

```
163 streams (idx $000..$0A2); total 3454 bytes; size min 6 / max 56 / mean 21.2
160 of 163 are referenced by >=1 stage-1 spawn; unused: $000, $042, $05E
opcode census (after the 4-byte X,Y position prefix): HEAD 845  SPEED 469  ESC 89
```

### The streams are decoded and on disk (gitignored)

```
games/ddpdoj/assets/w24-movement/stage1-streams.json   # per-stream: rom, off, size, pos, hex, uses, types
games/ddpdoj/assets/w24-movement/stage1-resource-1F.bin # raw $231852..$2325D0
python games/ddpdoj/tools/oracle/w24streams.py          # regenerates both (the recon script)
```

### Which enemy types use which streams (the inventory the plan names)

```
$11 (105 spawns) -> 104 streams     $10 (17) -> 16    $05 (123) -> 3    $07/$27 (224) -> 3
$08/$09/$0B (108 each, shared) -> 1 stream each ($023, the damage-first common stream)
$82 (33) -> 2   $8B (25) -> 4   $8A (10) -> 9   $89 (7) -> 6   $80 (6) -> 3   $85 (2) -> 1
$88 (3) -> 3   $20 carrier (5) -> 5   $21 (1) -> 1   $24 prop (1) -> 1   $31 prop (1) -> 1
$0D midboss (1) -> 1 (idx $040)   $0E boss (1) -> 1 (idx $092)
```

## §1 - THE 13 OPCODES (decoded, every one, with its ROM address)

There are TWO consumers of the SAME opcode set and the SAME dispatch table
(`$263948`, 12 longword function pointers): the **init-reader `$263808`** (runs
once at spawn, out of every init body - 65 jsr sites incl. `$26877E` type `$11`,
`$26B4A4` midboss) and the **per-frame interpreter `$2638A6`** (runs each frame
from the handler - 41 jsr sites incl. `$2688CC` type `$11`, `$2747C6` type
`$82`). Both share `$263948`. The decode below cites the per-frame arm
(`$2638A6`) and notes the init arm where it differs.

A byte b in the stream is classified by its high bits:

| b range | opcode | per-frame site | init site | semantics |
|---|---|---|---|---|
| `b < $80` | **HEAD** | `$2638C0` | `$263848` | `b & $7F` -> record `+$1B` HEADING. The byte after b is a frame-count PARAM. PARAM `$00` = hold this heading forever (cursor not advanced - see §3). PARAM `n!=0` = hold for `n` frames (counter `($10,A5)`), then advance. If `(b&$7F) >= $40` the velocity step zeroes DX/DY (a "stop / non-moving" heading, `$263910`). |
| `$80 <= b < $C0` | **ESCAPE** | `$263926` -> dispatch | `$26384E` -> dispatch | `(b & $0F)` indexes the 12-entry table at `$263948`. The high nibble (8/9/A/B) is IGNORED - `0x80`/`0x90`/`0xA0`/`0xB0` are the same opcode. See the 12-escape table below. |
| `b >= $C0` | **SPEED** | `$26392C` | `$263854` | `move.b (A0)+,($1A,A6)` - next byte -> record `+$1A` SPEED (the field `$284190`/`$241812` index). |

### The 12 escapes - table at `$263948`, all 12 read

| # | routine | opcode byte(s) | what it writes | USED in stage 1? |
|---|---|---|---|---|
| 0 | **LOOP-BACK** `$263978` | `0x80/90/A0/B0` | `moveq #0,D0; move.b (A0)+,D0; add.w D0,D0; suba.w D0,A0` - **A0 -= 2*offset** (relative back-jump within the stream). | **NO** (see §3) |
| 1 | SET_SUBANIM `$263982` | +1 byte | `move.b (A0)+,($1F,A6)` -> record `+$1F` sub-anim/sprite-idx | yes (47) |
| 2 | TOG_FLAG_bit5 `$263988` | +1 byte `n` | `n==1` -> `bclr #5,(A6)`; `n>1` -> `bset #5,(A6)` (record `+$00` bit 5) | yes (26) |
| 3 | TOG_FLAG_bits0_13 `$26399A` | +1 byte `n` | `n==1` -> `andi #$DFFE,(A6)`; `n>1` -> `ori #$2001,(A6)` (record `+$00` bits 0+13) | no |
| 4 | SET_A5+22 `$2639AC` | +1 byte | `move.b (A0)+,($22,A5)` (controller, not record) | no |
| 5 | SET_A5_word `$2639B2` | +1B off +2 words | packs `((w1&$FF0)<<4)+((w2&$FF0)>>4)` -> `(A5,off.w)` (controller word, var offset) | no |
| 6 | SET_REC_word `$2639CE` | +1B off +2 words | same pack -> `(A6,off.w)` (RECORD word, var offset) | no |
| 7 | SET_A5+24 `$2639EA` | +1 byte | `move.b (A0)+,($24,A5)` (controller) | no |
| 8 | **SET_ANIM** `$2639F0` | +1 byte | `move.b (A0)+,($1E,A6)` -> record `+$1E` ANIM | yes (3: `$05D,$067,$068`) |
| 9 | Y_MINUS_SCROLL `$2639F6` | +1 byte (skipped) | `sub.w $813172,($4,A6)` then `addq #1,A0` (Y -= global scroll-X; skip 1 stream byte) | yes (11) |
| 10 | **EXIT** `$263A04` | none | `addq #8,A7; jmp $263762` - pops the `jsr(A1)` frame and ABORTS the interpreter. `$263762` writes flag byte `$01` to every sub-record `+$00` and clears the controller `($A5)` (terminate / recycle). | yes (2: `$071,$072`) |
| 11 | NOP `$263A0C` | none | `rts` (genuine no-op; padding/sync) | no |

**5 of 12 escapes are exercised by stage 1** (kinds 1, 2, 8, 9, 10). **7 are
listing-only** (0, 3, 4, 5, 6, 7, 11) - they MUST still be ported (a later
stage or a reached-path rewrite may use them); the dispatch table reaches all
12 and an unported one is a quiet fall-through into the next routine's bytes.

## §2 - RESOURCE RESOLUTION (how `#$1F` becomes a stream pointer)

The protection is ONE level of indirection that stores a ROM address; the data
is readable directly from `maincpu.bin`. The chain (all build B):

```
$263386  the stage installer. lea $263336,A0; adda.w 4*$813096,A0  -> stage entry.
         For stage 1 (index 0) the entry at $263336 is:
           script $230C6C | aux $23170C | res $231852 | pad $00000000
$26339C  move.l (A0)+,(A4)            -> $8132CC = script_ptr  ($230C6C)
$26339E  move.l (A0)+,($4,A4)         -> $8132D0 = aux_ptr     ($23170C)
$2633A2  move.l (A0)+,D0; move.l D0,-(A7); move.l #$1F,-(A7); jsr $246D04
         => ProtLatch.setSlot($1F, $231852)   <-- the resource BASE goes into slot $1F
$2633BE  the spawn walker. Per 8-byte record [trig:W][param:W][type:B][flags:B][idx:W&$FFF]:
$2633F2    D7 = idx & $FFF  (the 12-bit stream index)
$2633FA    A1 = aux_ptr ($23170C);  D7 = aux[idx]   (a WORD offset into resource #$1F)
$263408    move.l #$1F,-(A7); jsr $246CAC  => ProtLatch.readSlot($1F) = $231852
$263418    adda.w D7,A1   => A1 = $231852 + aux[idx]  = the stream pointer
$263420    bsr $2636D6     (spawn ctor; the init body later calls $263808 with this cursor)
```

So for stage 1: **stream_ptr = `$231852` + `aux[idx]`**, both readable from the
decrypted image. The port already has `protsim.js` (`setSlot`/`readSlot`); it
resolves identically. The W23 note "NOT portable without the resource base" is
met by reading the base from the stage table at install - no new protection
work. **Each stage re-installs slot `$1F`** with its own `res_ptr` (stage table
entries: S1 `$231852`, S2 `$233194`, S3 `$2350A8`, S4 `$2365E2`, S5 `$239396`);
stages 2-5 are deliberately NOT dumped (out of scope, same rule as the spawn
script - a read of another stage's stream stays a LOUD THROW BY ADDRESS).

The aux table `$23170C` is **exactly 163 words** (idx `0..$A2`, 326 B); it ends
at `$231850` and the resource begins at `$231852` (2 B align gap). Every stream
is position-prefixed: the first 4 bytes are the spawn **X** (word) then **Y**
(word), consumed by `$263808` (`$263830 move.w (A0)+,($2,A6); move.w (A0)+,($4,A6)`)
unless bit 6 of `($2,A5)` is set (then X,Y come from `($48,A5)` and `$813172`
is added to Y - `$26381C`). No stage-1 stream sets that bit; the 4-byte prefix
holds for all 160 referenced streams (verified: every first-4 bytes decodes to a
sensible spawn coordinate, e.g. midboss `$040` = `$8000,$2400`, damage-first
`$023` = `$7780,$0400`).

## §3 - THE LOOP-BACK, AND HOW THE LOOP TERMINATES (the plan's specific ask)

**The loop-back is escape #0 at `$263978`** (`A0 -= 2*read_byte`). It is
**UNUSED by any stage-1 stream** - confirmed two ways: a prefix-correct opcode
walk finds zero kind-0 escapes across all 163 streams, and the 5 streams a naive
scan flags (`$002,$00A,$040,$093,$094`) are all FALSE POSITIVES where the X or Y
position word's high byte is `$80/$90/$A0/$B0` (e.g. midboss X = `$8000`,
carrier X = `$8A80`). A loop-back offset of `0` would hang the interpreter
in one frame (`A0 -= 0`, re-read the same escape); stage 1 never emits one.

**The "partial interpreter runs off the end" does not happen in stage 1.** The
per-frame `$2638A6` is partial: it processes any run of SPEED/ESCAPE opcodes,
then returns after applying the velocity of the FIRST heading it hits
(`$2638F8`/`$26390E`). The cursor `($12,A5)` is only re-stored when an opcode
ADVANCES it - on a counter-done heading (`$26391A`) or a SPEED/ESCAPE
(`$26391A`). So:

- **A HEAD with PARAM `$00` holds the cursor frozen** (`$2638C6 beq $2638D2`
  skips the counter, applies velocity, returns WITHOUT storing the cursor).
  The enemy re-reads that heading every frame and moves in it FOREVER until
  destroyed. This is the implicit loop - no loop-back opcode needed.
- **An EXIT (escape #10) aborts** via `jmp $263762` (the only opcode that does
  not return to the `$26391A`->`$2638C0` loop).

**Every stage-1 stream terminates one of these two ways** (measured):
`161/163` end on a PARAM-`$00` heading (forever-move tail); `2/163` end on EXIT
(the carriers `$071`/`$072`, types `$20`/`$21` - spawn their payload then
despawn). No stream runs off its aux-bounded extent. (Stages 2-5 are not
dumped; if a later stage uses escape #0, the implementer ports it from
`$263978` verbatim - its semantics are fully read here.)

## §4 - THE VELOCITY CACHE, AND `$241812` -> `$200920`

The plan's "velocity cache invalidation; `$241812` direction+speed ->
`$200920`":

```
($2,A5) bit 5  == "velocity DIRTY"   (set => recompute before re-use)
  set by:  $263808 init tail ($263898)          -- first frame must recompute
           $26391E (after every SPEED / ESCAPE / counter-done) -- inputs changed
  cleared: $2638FA (the recompute path)

per-frame HEAD apply ($2638E0 btst #5,($2,A5)):
  dirty  -> $2638FA: bclr #5; jsr $2417DE (recompute+apply); movem D2-D3,($40,A5) (cache)
  clean  -> $2638E8: movem ($40,A5),D2-D3 (reuse cache); add D2->X, D3->Y
```

`$2417DE` (the entry; 63 jsr sites) reads **speed `($1A,A6)`** and
**heading `($1B,A6)&$3F`**, calls `$241812`, then `add.w D2,($2,A6); add.w D3,($4,A6)`
(apply DX,DY) unless `$8130D2` (the freeze) is set (then D2=D3=0). `$241812`:

```
$241812  D1=heading*4; D0=speed*4; lea $200920,A3; movea.l (A3,D0),A3  <- speed-level table
         D3=heading*8; adda.w (A0,D3),A3  where A0=$2418B4 (the FOLD table, 256 words)
         move.l (A3)+,D2; move.l (A3)+,D3; asr.l #4,D2; asr.l #4,D3   <- DX,DY (one quadrant)
         andi.w #$C0,D1; lsr #1,D1; lea $241850,A3; jmp (A3,D1)       <- quadrant mirror
            Q0 $241850: rts                  (DX+, DY+)
            Q1 $241870: neg.w D2             (DX-, DY+)
            Q2 $241890: neg.w D2; neg.w D3   (DX-, DY-)
            Q3 $2418B0: neg.w D3             (DX+, DY-)
```

`$200920` (256 longword ptrs -> 256 x 65-entry quadrant tables, `$200D20..$22151F`,
134 144 B) and `$2418B4` (the fold table) are **already exported by W21/W22**
(`export-tables.py` `VELOCITY_FIELD` + `FOLD_TABLE`); the four quadrant arms
`$241850/$241870/$241890/$2418B0` ship with them. **W24 adds no new velocity
data** - it wires the record's speed+heading into the existing W22 model and
adds the `($40,A5)` cache + the bit-5 dirty discipline.

## §5 - CROSS-REF WITH W23: the 511 deferred fields ARE this interpreter's output

W23 (`23-impl-enemy-stats.md`, `23-review.md` F1) deferred 511 speed/heading/
anim/flags fields as "overridden per-spawn by `$263808` (resource `#$1F`)".
This recon confirms the mechanism field-for-field - the interpreter writes
EXACTLY the record words W23 could not match:

| W23 deferred field | record ofs | opcode that writes it | site |
|---|---|---|---|
| SPEED | `+$1A` | SPEED (`b>=$C0`) | `$263854` (init) / `$26392C` (frame) |
| HEADING | `+$1B` | HEAD (`b&$7F`); init terminator stores it at `$263874` | `$2638D6` / `$263874` |
| ANIM | `+$1E` | ESCAPE #8 SET_ANIM | `$2639F0` |
| FLAGS | `+$00` | ESCAPE #2 (bit 5) / #3 (bits 0,13) | `$263988` / `$26399A` |
| (sub-anim) | `+$1F` | ESCAPE #1 SET_SUBANIM | `$263982` |
| POSITION X/Y | `+$02`/`+$04` | init reader `$263808`; ESC #9 Y-=scroll; the scroll-odometer Y offset `$26387C` (`($A,A5)-$8130D0`) | `$263830`/`$26381C`/`$26387C` |

Closing the W23 gate therefore = port `$263808` + `$2638A6` + the 12 escapes +
`$2417DE`, then re-run `w23statsgate.mjs` over the W17 corpus: the speed/
heading/anim/flags columns should drop from 511 deferred to 0 divergent (the
prototype DEFAULT becomes the movement-script value). The `$88` hb14/hb16
anim-driven hitbox residuals (W23b's accepted 2) collapse at the same moment
- the hitbox target word is picked by anim (`$275E86`), and anim is now
computed.

## §6 - UNIT-TEST SUBSTRATE FOR THE IMPLEMENTER (the second done-when)

The dump gives the implementer listing-derived unit tests for free: every one
of the 163 streams is a (bytes -> expected opcode trace) pair. The smallest
exemplars (from `stage1-streams.json`):

```
idx $001 ($11): pos $7A80,$1800 | SPEED 03 | HEAD h=2D p=00          -- straight mover, forever
idx $040 ($0D midboss): pos $8000,$2400 | HEAD h=40 p=00             -- stationary (h>=$40 -> DX=DY=0)
idx $023 ($05/$07/$08/$09/$0B/$27, 108 spawns): pos $7780,$0400 | ESC9(scroll) | HEAD h=20 p=00
idx $071 ($20 carrier, EXIT): ESC1,ESC1,ESC1,ESC2,SPEED,HEAD,...,ESC10  -- spawns payload, despawns
idx $092 ($0E boss): SPEED 4..22阶梯 HEAD h=54 -- decelerating approach (bespoke state machine is W30)
```

A scripted mover's whole-life position track (the third done-when) is best a
type `$11` single-stream mover (e.g. idx `$001`) replayed against the board
under the W17 corpus: gate its `($2,A6)`/`($4,A6)` record position at 0
divergent from spawn to death. The velocity cache means the port MUST recompute
on the dirty bit exactly as `$2638E0`/`$2638FA` do, or it drifts on the first
heading change.

## WHAT I RULED OUT / DID NOT DO (named, not silent)

- **No `src/` edits, no commit** (recon role). The implementer ports `$263808`/
  `$2638A6`/`$2417DE` + the 12 escapes into a new `src/movement.js` (or
  extends `spawn.js`), wires the stream cursor the walker already resolves, and
  re-exports the resource as a gitignored shard.
- **Stages 2-5 streams NOT dumped** (deliberate - same rule as the spawn
  script). Escape #0 (loop-back) is unused in stage 1 but is fully decoded at
  `$263978`; if a later stage uses it the port is verbatim.
- **The 7 unused stage-1 escapes (0,3,4,5,6,7,11) are decoded but not
  validated by any stage-1 stream.** They port from the listing; coverage of
  them is listing-only until a stage that uses them is dumped.
- **The boss bespoke state machine `$259554` (W30) is NOT this interpreter.**
  The boss's movement stream `$092` exists and decodes (a speed 4->22 approach),
  but the boss's real behaviour is the W30 state machine; the stream is the
  approach only.
- **No dynamic validation run** (recon). The decode is static, cross-checked
  against the listing (capstone) and the resource bytes; the implementer's gate
  is the dynamic verdict.

## THE FILES / COMMANDS

```
python games/ddpdoj/tools/oracle/w24streams.py        # dump+decode -> assets/w24-movement/
#   stage1-streams.json (39 KB) : per-stream rom/off/size/pos/hex/uses/types
#   stage1-resource-1F.bin (3454 B) : raw $231852..$2325D0
python games/ddpdoj/tools/oracle/xref.py dasm 263808 768   # the init reader + interpreter + dispatch table
python games/ddpdoj/tools/oracle/xref.py dasm 241790 220   # $2417DE / $241812 velocity
python games/ddpdoj/tools/oracle/xref.py dasm 263336 240   # stage installer + spawn walker (resource resolution)
python games/ddpdoj/tools/oracle/xref.py callers 263808    # 65 init-body jsr sites
python games/ddpdoj/tools/oracle/xref.py callers 2638A6    # 41 handler jsr sites
```
