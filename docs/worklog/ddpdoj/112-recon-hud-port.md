# 112 -- RECON: the real HUD draws (a PORT PLAN for the score/chain/combo)

status: **DONE** (opened IN PROGRESS before digging, 2026-08-07; closed same day)

started: 2026-08-07. wave: 112. role: RECON (READ-ONLY; the only tree file I
write is this one; throwaway scripts live in `.scratch/w112/`, gitignored, NOT
committed). target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address
is build B. instrument: `games/ddpdoj/tools/oracle/out/maincpu.bin` (address ==
file offset, big-endian), capstone `CS_MODE_M68K_030`. Reuses `bosscoverage.py`'s
`Rom` reader by import.

`[M]` = measured by me, this session, from the image or this tree.

The brief: map the 28 HUD draw routines called from `$28444E`, map the
text/sprite printer `$240DC2`, map the sprite emitters `$23FA96`/`$23FAC4` into
bucket 25, confirm the RAM sources the draws read, identify the BCD-digit
machines, confirm the two dead-code claims, and cut the smallest score-first
port. Verify W105's claims against the source and the ROM as I go.

---

## 0. PREMISE CHECK -- the brief's "$240DC2 is the keystone every draw reaches" is HALF right

`[M]` closure of `$28444E` (my `.scratch/w112/dasm.py calls 0x28444E`, capstone
walk): 41 distinct callees. All 28 addresses in `src/hud.js DRAWS` are present,
CONFIRMING W105 section 2.2.1's claim that every one is real code.

**But the 28 splits into TWO rendering substrates, and `$240DC2` is only on one:**

| substrate | emitter | bucket / target | what is here |
|---|---|---|---|
| **SPRITE** | `$23FA96` / `$23FAC4` | bucket 25 (`$80A6E4` / `$80AFE6`) of the 30-bucket sprite queue | the PANEL FRAMES, the chain-meter BAR, the chain-break POPUP, hyper-stock ICONS, the rank icon, the item row, the banner panels |
| **TEXT** | `$240DC2` / `$240E1E` / `$240E84` / `$240EBC` | a DEFERRED-WRITE buffer at `$80B058` (cursor `$80C8D8`), flushed into the text tilemap at `$904000` | the score DIGITS, lives, bombs, credits, the chain HIGH-WATER count, the hyper label, the banner labels |

So `$240DC2` is NOT reached by the score PANEL (`$285C62` calls `$23FA96`), NOR
by the chain bar (`$2859DC` -> `jmp $23FA96`), nor by the popup (`$2855B6`).
Those three are SPRITE draws into bucket 25, and bucket 25 is already drained by
`src/displaylist.js` and rendered by `src/render/igs023.js`. The brief's
"keystone every draw reaches" is true only for the NUMBERS and LABELS.

**The score NUMBER (the actual digits) is a TEXT-layer element.** `[M]`
`src/web/app.js:887-888`, the port's own comment on the `wantTx:false` override:
"41-recon section 3.1: the `tx` layer is 'the capture, whole -- HUD, score
digits, all on-screen text'". So the digits live at `$904000`, produced by
`$240DC2`-family writers. The PANEL BOX around them is a sprite.

This split is the single most load-bearing finding in this recon and it decides
the wave order (section 6).

---

## 1. THE 28 DRAWS, GROUPED (ported / unported / dead)

Method `[M]`: for each of the 21 draw BODIES (the 28 minus the 7 infrastructure
routines -- the printers and emitters themselves), I ran a capstone closure walk
(`.scratch/w112/classify.py`) and recorded which emitter it reaches and its
size. "Ported" means the routine's body is translated in `src/hud.js`; every one
of the 28 is currently a `ctx.unportedLog.note` (the `draw(ctx, addr)` helper at
`hud.js:595`), so NONE of the picture draws today.

### 1.1 SPRITE draws -- bucket 25 via `$23FA96` / `$23FAC4` (UNPORTED, easy)

These call ONLY the sprite emitters. Bucket 25 is drained and rendered today, so
porting each routine to call `enqueueRegisters(ram, 25, d1, d2, d3, d4)` (already
in `src/spritequeue.js`) makes its picture appear with no other plumbing.

| addr | what it draws `[M]` | size | notes |
|---|---|---|---|
| `$285C5E` | P1 HUD panel entry (`moveq #$0,d6/d7` then falls into `$285C62`) | 106 | `playerBlock` calls this (`$2844C8 bsr`) |
| `$285C62` | P1 score ROW: the hyper-coloured panel frame + hyper-stock icons + rank icon. Tile from `$2881F2[hyperlevel]`, icon tile `$1CA008`, rank tile `$2882A6[rank]` | 104 | `$285C6E move.w $81B642 / mulu #$16 / divu #$4B0` picks one of 8 panel tiles. Draws the BOX, not the digits (see 1.3) |
| `$285DD8` | P2 HUD panel | 106 | mirror of `$285C5E` |
| `$285DDC` | P2 score row | 104 | mirror of `$285C62` |
| `$2855B6` | chain-BREAK popup | 90 | reads `$81B5C8`/`$81B5CC`/`$81B5DC` (popup timer/idx/val) |
| `$2859DC` | chain-meter BAR (a single sprite whose tile is `$28809E[stage][meter]` + `$1CC4A0`) | 67 | `jmp $23FA96` tail. D6 = the meter word |
| `$285FA6` | hyper-label flash | 77 | BOTH substrates: `$23FA96` + `$240DC2` |
| `$2857B4` | item row | 114 | reads `$81B610`/`$81B612` |
| `$284F72` | banner P1 panel -> `$285C62` | 13 | thin wrapper |
| `$284FA2` | banner P2 panel -> `$285DDC` | 13 | thin wrapper |

### 1.2 TEXT draws -- via `$240DC2` / `$240EBC` -> `$80B058` -> `$904000` (UNPORTED, the keystone)

These call ONLY the text printer. NONE of their output is visible today: the
defer buffer is reset (`background.js deferReset`) but never flushed, there is no
TxVram model, and `wantTx:false` suppresses the layer.

| addr | what it draws `[M]` | size |
|---|---|---|
| `$285FB6` | CREDIT row | 73 |
| `$286040` | chain HIGH-WATER row | 28 |
| `$286ED6` | HYPER STOCK icons P1 | 63 |
| `$286F3E` | HYPER STOCK icons P2 | 38 |
| `$2878CC` | P1 LIVES row | 37 |
| `$28795C` | P2 LIVES row | 37 |
| `$287ABE` | P1 bomb-stock row | 58 |
| `$287AF0` | P2 bomb-stock row | 46 |
| `$287A7A` | banner P1 label -> `$240EBC` | 75 |
| `$287A92` | banner P2 label -> `$240EBC` | 69 |

### 1.3 the score DIGITS -- TEXT substrate, exact routine UNRESOLVED (open question)

I could NOT pin a single "P1 score digit walk" routine inside the `$28444E`
closure by static analysis. Evidence and what I tried:

* `[M]` the digit machine `$2843A8` (ported as `digits2843A8`) writes dirty
  records at `$81B4C8` (9 records stride `$A`: dirty word at `+$0`, character
  `+$C030+digit` at `+$6`) and returns `D4`/`D6` for the hi-score compare. Its
  own `lea $A(A0),A0` stride walk is at `$284440`.
* `[M]` a census of EVERY absolute-long reference to `$81B4C8`/`$81B522` in
  build B (`.scratch/w112/digit2.py`): the 19 hits are all EITHER the digit
  machine itself OR score ADDERS (`lea $81B4C8,A0 / bsr $286626` -- `$81B4C8` is
  also one-past the P2 pending accumulator `$81B4C4`). NONE reads the dirty flag
  or the `+$6` character as a digit record.
* `[M]` the score row `$285C62` does NOT read `$81B440` (P1 total): it reads
  `$81B642` (hyper gauge), `$81B6E0` (pending-item count) and `$81B64A` (rank),
  and emits the panel + icons. No BCD digit walk.
* `[M]` `rol.l #4` (the BCD digit-extract used by the hi-score walk `$285994`)
  and `lea $A(A0),A0` searches in `$284000..$288000` found only the digit
  machine's own sites -- no second consumer.

The RESOLUTION is `src/web/app.js:887`: the port's own comment says the `tx`
layer is "the capture, whole -- HUD, score digits, all on-screen text". So the
digits ARE `$240DC2`-produced text tiles; the per-digit draw is reached by a path
my closure walker missed (most likely an indirect `jsr (An)` or a register-loaded
record pointer, both of which `bosscoverage.routine` explicitly flags as
invisible to static scanners). **This is the one open question an implementer
must close with a MAME write-tap on `$904000` (or `$80B058`)**: capture the
call stack on the first frame a score digit changes, and the routine's address
falls out. I name this rather than guess it.

### 1.4 the hi-score / stage-clear digit walk -- DEAD (part of the tally)

`$285994` walks 8 BCD digits of `$81B616` through the `$2883A6` digit->tile table
(16 entries: digits 0-9 at `$00326D44..$00326E88`, A-F at `$001CA634..`) and
emits each via `$23DFEA`. `[M]` `$81B616`'s only writers are `$2854AC` and
`$285562`, BOTH inside the stage-clear tally `$2853DC..$285568` (section 5.1,
DEAD). And `$285994` has no live caller in the `$28444E` closure. So this is the
tally's bonus-number walk, not the live hi-score, and it is dead for the same
reason the tally is.

### 1.5 infrastructure (the printers/emitters themselves)

| addr | what | ported? |
|---|---|---|
| `$240DC2` / `$240E1E` / `$240E84` | TX printer (text defer writer, D4 += `$C0000000`) | NO |
| `$240EBC` | TX printer variant (D4 := `$C0000000`) | NO |
| `$23FA96` | bucket-25 register-convention sprite enqueue | equivalent YES (`enqueueRegisters(ram, 25, ...)`) |
| `$23FAC4` | bucket-25 register-convention, A0/D0 saved | equivalent YES (same, wrapped) |
| `$23DFEA` | bucket-1 register-convention enqueue (`$805104`/`$80AFC2`) | equivalent YES (`enqueueRegisters(ram, 1, ...)`) |
| `$24150A` | resource install (data) | n/a |
| `$28CA7A` | boss-warning sound cue (`$28Cxxx` family) | NO (sound, deferred) |

---

## 2. THE TEXT PRINTER `$240DC2` MAPPED

`[M]` linear disassembly `$240DC2..$240E12`:

```
240DC2  movem.l  d0-d7/a0, -(a7)
240DC6  movea.l  $80c8d8.l, a0      ; A0 = the cursor
240DCC  cmpa.l   #$80c8d8, a0       ; cursor == its own address -> null/unset
240DD2  beq.b    $240dbc            ; -> just return (NULL REFUSED)
240DD4  addi.l   #$c0000000, d4     ; D4 (tile long) |= $C0000000 (variant $240EBC uses move.l #$c0000000,d4)
240DDA  moveq    #$0, d5
240DDC  move.w   d1, d6             ; D6 = D1 (base column)
240DDE  move.w   d3, d7             ; D7 = D3 (inner count)
240DE0  move.l   #$904000, (a0)     ; write the destination-base tag
240DE6  move.w   d6, d5
240DE8  add.w    d0, d5             ; D5 = base + outer offset
240DEA  add.l    d5, (a0)+          ; (A0) := $904000 + position; A0 += 4
240DEC  move.l   d4, (a0)+          ; (A0) := tile-long; A0 += 4
240DEE  addi.l   #$10000, d4        ; next tile (tile ROM is $10000-strided)
240DF4  addi.w   #$100, d6          ; next column
240DF8  dbra     d7, $240de0        ; inner loop D3+1 times
240DFC  subq.w   #$4, d0            ; outer step
240DFE  dbra     d2, $240ddc        ; outer loop D2+1 times
240E02  move.l   #$ffffffff, (a0)   ; terminator
240E08  move.l   a0, $80c8d8.l      ; store advanced cursor
240E0E  movem.l  (a7)+, d0-d7/a0
240E12  rts
```

**What it takes:** D0 (outer position step), D1 (base column), D2 (outer count),
D3 (inner count), D4 (starting tile code). It writes a GRID of `(address,
value)` longword pairs, each address `= $904000 + (row,col)`, into a
deferred-write buffer at `$80B058`, terminator `$FFFFFFFF`.

**What it writes:** a DEFERRED-WRITE LIST, NOT the sprite queue. Each entry is 8
bytes: `(destination-in-text-tilemap, tile-attribute-longword)`. The four
variants (`$240DC2`/`$240E1E`/`$240E84`/`$240EBC`) are identical except for how
D4 is seeded (`addi.l #$c0000000` vs `move.l #$c0000000`) and one inner-loop
difference at `$240E84`.

**Is it like the ported `enqueueThroughStub` family? NO -- it is a NEW mechanism.**
The sprite emitters append 12-byte requests to one of 30 sprite buckets, drained
by `src/displaylist.js` and drawn by `src/render/igs023.js`'s sprite pass. The
TX printer appends 8-byte deferred writes to a SEPARATE buffer (`$80B058`),
consumed by a SEPARATE flush (section 2.1) that writes the text tilemap
(`$904000`), drawn by the TX pass (`render/igs023.js` line 129, `buildTxMap`).

### 2.1 the flush `$141258` -- IRQ6-gated, UNPORTED

`[M]` `src/machine.js:196` lists `isr6Gated: [0x141676, 0x140ffe, 0x141258,
0x185dc4]` and the comment at line 197-201 says only the SECOND (`$140ffe`, the
scroll register upload) is ported; "The other three stay UNPORTED". The flush is
the THIRD. `[M]` build-A disassembly at `$141258` (`.scratch/w112/flush.py`):

```
141258  lea.l    $80b058.l, a0      ; the buffer head
14125E  move.w   #$30f, d0          ; (vestigial; unused by the loop)
141262  movea.l  (a0)+, a1          ; A1 = destination address
141264  cmpa.l   #$ffffffff, a1     ; terminator?
14126A  beq.b    $141270
14126C  move.l   (a0)+, (a1)        ; value -> destination
14126E  bra.b    $141262
141270  bra.b    $14123a
```

So the flush reads `(address, value)` pairs from `$80B058` and writes each value
to its address, until `$FFFFFFFF`. The addresses point into the text tilemap
`$904000` (and the BG defer writes from `background.js` point into `$900000`).
**There is NO build-B copy of this loop** (`[M]` `.scratch/w112/flush2.py` and
`flush3.py`: zero `cmpa.l #$ffffffff,a1` and zero `move.l (a0)+,(a1)` sites in
`$230000..$2B0000`); build B shares it via the IRQ6 RAM vector, exactly as
HANDOVER section 7 says the interrupt handlers are build A's.

`[M]` `src/background.js:263` ports `deferReset` (`$240F08`): it writes the
`$FFFFFFFF` terminator at `$80B058` and resets the cursor to `$80B058` each
frame. So the BUFFER is set up; only the writers and the flush are missing.

### 2.2 what the port needs to make text draw

`[M]` `src/render/igs023.js:127-145` already has a TX pass: it reads `st.tx`,
calls `buildTxMap` (`src/render/tiles.js:147`), and composites 64x32 8x8 tiles
over everything. The decoder exists. What is missing:

1. a **TxVram model** for `$904000` (64x32 longwords, the text tilemap ring),
   analogous to `BgVram` at `$900000` (`src/background.js:189`). There is NONE
   today (`[M]` grep for `904000`/`TxVram`/`txRam` in `src/` finds only the
   palette and the decoder). `st.tx` is sourced from `capture.bin` only.
2. a port of **`$240DC2` (and its 3 variants)** as JS functions that append
   `(address, value)` longword pairs to a JS defer list (or directly to TxVram).
3. a port of the **flush `$141258`** as a per-frame call that drains the defer
   list into TxVram (and the BG defer writes into `BgVram`). The port already
   separates the defer RESET from the flush; wire the flush where `deferReset`
   runs (`background.js:259`).
4. **`st.tx` sourced from the port's TxVram** instead of `capture.bin`, and the
   `wantTx:false` override (`app.js:919`) flipped to `true` for port mode.

---

## 3. THE SPRITE EMITTERS `$23FA96` / `$23FAC4` -- bucket 25, ALREADY ported-equivalent

`[M]` disassembly:

```
23FA96  lea.l    $80a6e4.l, a0       ; BUCKETS[25].buffer
23FA9C  adda.w   $80afe6.l, a0       ; + BUCKETS[25].counter
23FAAA  move.l   d1, d0              ; from here IDENTICAL to $23EFC0 (the
23FAAC  asr.l    #$6, d0             ;  register-convention enqueue that
23FAAE  andi.l   #$7ff03ff, d0       ;  src/spritequeue.js already ports)
23FAB4  ori.l    #$80008000, d0
23FABA  move.l   d0, (a0)+
23FABC  move.l   d2, (a0)+
23FABE  move.w   d3, (a0)+
23FAC0  move.w   d4, (a0)+
23FAC2  rts
```

`$23FAC4` is the same wrapped in `move.l A0,-(A7) / move.l D0,-(A7)` ...
`move.l (A7)+,D0 / movea.l (A7)+,A0` (saves A0 and D0; nothing a port observes).

These are the REGISTER-convention enqueue for bucket 25, byte-for-byte the same
shape as `$23EFC0` (bucket 5), `$23F1FA` (bucket 19), `$23F34A` (bucket 15),
already covered by `enqueueRegisters(ram, bucket, d1, d2, d3, d4)` in
`src/spritequeue.js`. `BUCKETS[25] = { i:25, buffer:0x80a6e4, counter:0x80afe6 }`
is in the table. **A port that calls `enqueueRegisters(ram, 25, d1, d2, d3, d4)`
has ported both `$23FA96` and (with a wrapper that no-ops the saves) `$23FAC4`.**
`resolveEmitStub` in `spritequeue.js` would read the (buffer, counter) pair out
of the ROM for these two if a caller goes through `enqueueRegistersThroughStub`;
the resolver already handles this family.

`$23DFEA` (section 1.4) is the same routine on bucket 1 (`$805104` / `$80AFC2`),
also already ported-equivalent.

---

## 4. RAM SOURCES the draws read -- confirmed, all ported

`[M]` cross-check of the draw routines' absolute RAM reads (from the classify
scan) against `HUDRAM` (`src/hud.js`) and `LEDGER` (`src/score.js`):

| quantity | address | ported in | drawn by |
|---|---|---|---|
| P1/P2 total score (BCD) | `$81B440` / `$81B444` | `HUDRAM.totalP1/P2` | the (unresolved) score-digit text draw + the hi-score compare `$28437C` |
| P1/P2 pending score (BCD) | `$81B4C0` / `$81B4C4` | `HUDRAM.pendingP1/P2` | drained each frame by `$2842B0` (ported) |
| P1/P2 overflow digit | `$81B44C` / `$81B44E` | `HUDRAM.ovfP1/P2` | the digit machine |
| chain meter | `$81B5C0` / `$81B5EA` | `HUDRAM.p1.meter / p2.meter` | `$2859DC` (the bar) |
| chain count (BCD) | `$81B5DA` / `$81B604` | `LEDGER.p1.chain / p2.chain` | the chain-popup / high-water |
| chain high-water | `$81B632` / `$81B634` | `LEDGER.p1.hiwater / p2.hiwater` | `$286040` (text) |
| lives | `$8130BE` / `$8130C0` | `HUDRAM.aliveP1/P2` | `$2878CC` / `$28795C` |
| bomb stock | `$81B65C` (cmp only; stock lives in the player block) | `SCORE.bombStock` | `$287ABE` / `$287AF0` |
| hyper gauge | `$81B642` | (not in HUDRAM; read by `$285C6E`) | the panel colour pick |
| hyper active | `$81B63E` / `$81B640` | `HUDRAM.hyperActiveP1/P2` | guards (ported) |
| rank accumulator | `$81B64A` | `SCORE.rankAccum` | `$285C62` rank icon |
| pending-item count | `$81B6E0` | (not in HUDRAM; read by `$285D92`) | the hyper-stock icon loop |
| banner sub-counters | `$81B622` / `$81B624` | `HUDRAM.bannerSubA/B` | scroll-compensation in `$285C62` |
| popup timer/idx/val | `$81B5C8` / `$81B5CC` / `$81B5DC` | `HUDRAM.p1.popup/popupIdx/popupVal` | `$2855B6` |

**Verdict: the state machine writes every word a draw reads.** The BCD drain
(`$2842B0`), the digit machine (`$2843A8`), both chain machines (`$2862C6` /
`$286476` / the `$286876` arm), the two chain-meter decrements (`$284636` /
`$2847D4`) and both banner arms are ported and frame-exact in `hud.js` /
`score.js`. The draws have correct inputs; only the picture is absent.

**Two words the draws read that are NOT in HUDRAM/LEDGER yet** (a port will need
to name them): `$81B642` (the hyper GAUGE; read at `$285C6E`, distinct from
`$81B654` the hyper LEVEL) and `$81B6E0` (the pending-item count that selects how
many hyper-stock icons to draw). Neither is a state-machine word; both are
written by the unported hyper/tally tails.

---

## 5. DEAD CODE -- both claims CONFIRMED

### 5.1 stage-clear tally `$2853DC..$285568` -- UNREACHABLE BY CONSTRUCTION

`[M]` the gate is `$2853D2 btst #$3,$8130F9 / beq.b $2853D0` (a bare `rts`). A
census of every build-B writer of `$8130F9` (`.scratch/w112/callers.py`):

```
$2853DC  bset.b #$4, $8130f9.l   ; the tally itself sets bit 4, NOT bit 3
$285496  bset.b #$1, $8130f9.l
$28DB52  bset.b #$3, $8130f9.l   ; THE ONLY bit-3 writer
$28DE16  bset.b #$2, $8130f9.l
$2927A4  bset.b #$0, $8130f9.l   ; BOSS_TAIL
$297A60 / $29BCC4 / $29ED42 / $2A599C / $2A63BA  bset.b #$0 (stage 2-5 boss inits)
```

**Only `$28DB52` sets bit 3**, and `[M]` `$28DB52` is inside `$28D9AA` (the
result screen, 819 instructions, declared unported by W62). The port reaches
the gate, reads bit 3 as 0, takes the same `beq` to the bare `rts`. The tally
cannot arm itself (it sets bit 4). **DEAD, CONFIRMED.** (`$285994`'s caller is
inside this dead range, section 1.4.)

### 5.2 boss HP bar `$284A3E` -- null-pointer-refused FOR STAGE 1

`[M]` writers of the pointer `$81B62A`:

```
$2927BA  move.l a0, $81b62a.l   ; the stage-1 boss, inside BOSS_TAIL ($292794..$2927F4)
$297206  move.l a0, $81b62a.l   ; a stage-2-5 boss init (sets $81B414/$81B416 after)
$29BCDA  move.l a0, $81b62a.l   ; (likewise)
$29ED7C  move.l a0, $81b62a.l   ; (likewise)
$2A59BA  move.l a0, $81b62a.l   ; (likewise)
$2A63A4  move.l a0, $81b62a.l   ; (likewise)
```

`[M]` each of `$297206`/`$29BCDA`/`$29ED7C`/`$2A59BA`/`$2A63A4` is followed by
`jsr <boss-specific>` then `move.w #$1,$81B414 / move.w #$1,$81B416` (the
per-stage marker writes) -- they are the OTHER stage bosses' init tails. **None
of them runs in a stage-1 play.** The stage-1 writer is `$2927BA`, inside
`BOSS_TAIL`, which `src/initbody.js` stops short of (it ends after `$29272E`).
So `$81B62A` stays 0 and `bossBar284A3E` (`hud.js:759`) refuses by address.
**DEAD for stage 1, CONFIRMED** (with the nuance: this is stage-1-specific; a
later stage would need the equivalent tail ported with its boss).

---

## 6. THE SMALLEST SCORE-FIRST PORT -- and the wave breakdown

### 6.1 the keystone call

**The score NUMBER (digits) cannot render until the TEXT substrate ships.** The
digits are `$904000` text tiles (app.js says so); their producer is `$240DC2`;
the flush `$141258` is IRQ6-gated and UNPORTED; there is no TxVram model and
`wantTx:false` suppresses the layer. So the text keystone is a PREREQUISITE for
the score number, the chain count, the lives, the bombs and the credits.

The score PANEL BOX (the frame, the "1UP" tile, the hyper-coloured backplate) is
a SEPARATE, lighter job: it is sprites into bucket 25, and bucket 25 already
drains and renders. Porting `$285C5E`/`$285C62` to call
`enqueueRegisters(ram, 25, ...)` makes the box appear with no other plumbing.

So "score-first" has TWO fronts that can run in parallel or in sequence:
- **the digits** (text keystone) -- heavy, prerequisite-gated.
- **the box** (sprite panel) -- light, immediate.

### 6.2 the unresolved digit routine (resolve BEFORE the text wave)

Section 1.3: the exact per-digit draw routine that reads the BCD total and calls
`$240DC2` could not be pinned by static closure. **An implementer must close
this with a MAME write-tap on `$904000`** (or `$80B058`) on the first frame a
score digit changes, capturing the PC. Without it the text wave cannot target
the score-number routine specifically. This is one `xref.py`/Lua probe session,
not a wave of porting.

### 6.3 wave breakdown

**Wave A -- the SPRITE frames (bucket 25).** Smallest, uses ported
infrastructure only. Port `$285C5E`/`$285C62` (P1 panel+row), `$285DD8`/`$285DDC`
(P2), `$2859DC` (chain bar), `$2855B6` (chain popup), `$2857B4` (item row),
`$284F72`/`$284FA2` (banner wrappers), `$285FA6` (hyper flash, sprite half).
Each becomes a few `enqueueRegisters(ram, 25, ...)` calls with positions
scroll-compensated by `$81B622`/`$81B624` exactly as the ROM does. Name the two
extra RAM words (`$81B642`, `$81B6E0`). Visible result: the HUD frame, the chain
bar, the popup, the item row -- everything EXCEPT the numbers. This wave proves
the bucket-25 path end to end without touching text.

**Wave B -- the TEXT keystone.** The prerequisite for every number and label.
(1) Add a `TxVram` model for `$904000` (64x32 longwords) alongside `BgVram`.
(2) Port `$240DC2` + the 3 variants as JS that appends `(address, value)` pairs
to a defer list. (3) Port the flush `$141258` as a per-frame drain of the defer
list into TxVram (and the BG defer writes into BgVram); wire it next to
`background.js deferReset`. (4) Source `st.tx` from TxVram and flip
`wantTx:false` to `true` in port mode (`app.js:919`). Visible result: nothing
new yet (no producers call `$240DC2`), but the pipeline carries text.

**Wave C -- the score NUMBER (text).** Depends on (section 6.2) the MAME tap
that names the per-digit routine. Once named, port it and the digits appear.
This is the wave that delivers the actual score.

**Wave D -- the remaining text.** Port the 9 text bodies of section 1.2
(lives P1/P2, bombs P1/P2, credits, chain high-water, hyper stock P1/P2, banner
labels) and the text half of `$285FA6`. These are now mechanical: each reads a
port-known word and calls the wave-B printer.

**Wave E -- chain count + combo.** The chain count (BCD at `$81B5DA`/`$81B604`)
draws as part of the chain-popup (`$2855B6`, sprite) and the high-water row
(`$286040`, text). The combo/hit count is the popup value. Both fall out of
waves A+D.

### 6.4 digit-tile art

`[M]` the hi-score walk's `$2883A6` table holds the digit tile codes: digits 0-9
at `$00326D44, $00326D68, ...` (stride `$24`), each a sprite/text tile pointer
into the `igs023` char ROM (8x8 4bpp, `render/tiles.js txTile`). The TEXT-layer
digits use the SAME tile set (gfx0, palette base `$800`, 32 palettes). Whether
all 10 digit tiles are in the exported `sheets.tx` is a question for the
implementer (the sheet is built in `src/web/assets.js:519`); the panel/icon
tiles (`$001CBFxx`, `$001CA0xx`, `$1CC4A0`, `$1CA008`) are the same format and
must be checked the same way. The digit machine's character code `+$C030`
suggests tile index `$C030>>? ` -- the implementer should confirm the tile-index
encoding against a known digit before assuming the art is present.

---

## RULED OUT

* **`$240DC2` as a sprite-queue emitter.** `[M]` it writes to the defer buffer
  at `$80B058`, not any of the 30 sprite buckets. It is a text-tilemap deferred
  writer.
* **`$23FA96`/`$23FAC4` as a new mechanism.** `[M]` byte-for-byte the
  register-convention enqueue already ported, just on bucket 25.
* **The digit records at `$81B4C8` having a second consumer.** `[M]` every
  absolute-long reference is the digit machine itself or a score ADDER (using
  `$81B4C8` as one-past the P2 pending accumulator). The dirty records' consumer
  is reached indirectly; section 6.2 names how to find it.
* **`$285994` (the `$2883A6` digit walk) as the live hi-score.** `[M]` it reads
  `$81B616`, whose only writers are inside the dead tally (section 5.1).

## COULD NOT REACH (measured reasons)

* **The exact P1/P2 score-digit draw routine.** Static closure of `$28444E` does
  not surface a reader of `$81B440` that calls `$240DC2`. Indirect `jsr (An)`
  and register-loaded pointers are invisible to every static scanner (the same
  limit `bosscoverage.py`'s header warns about). Section 6.2's MAME tap resolves
  it in one session.
* **Whether all 10 digit tiles and the panel/icon tiles are in the exported
  `sheets.tx`.** Not measured; flagged for the implementer.
* **Dynamic confirmation of the defer-flush path.** No MAME this wave; the
  `$904000` write side and the `$141258` flush are read out of the image and the
  port's `machine.js`/`background.js`, not re-measured at runtime.

---

## LOG

- opened IN PROGRESS before digging.
- read CATCHUP (sec 7a/7b/8), HANDOVER, recon 105 (full), `src/hud.js` (full),
  `src/score.js` (full), `src/spritequeue.js` (full), `src/displaylist.js`
  (full), `src/render/{index,tiles,igs023}.js`, `src/web/app.js` (the
  `portSpriteList`/HUD/wantTx sections), `src/background.js` (BgVram, deferReset,
  CAM), `src/machine.js` (isr6Gated, ROM address table).
- `[M]` closure of `$28444E` (`dasm.py calls`): 41 callees; all 28 DRAWS present.
- `[M]` disassembled `$240DC2`/`$240E1E`/`$240E84`/`$240EBC` (the TX printer
  family), `$240DBC`, `$240F08` (deferReset), `$141258` (the flush), `$23FA96`/
  `$23FAC4`/`$23DFEA` (the emitters), `$285C62`/`$285D74` (score row + its beq
  tail), `$2859DC` (chain bar), `$285994` (digit walk), `$2843A8` (digit
  machine), `$287BD2` (a `$81B440` reader -- a stage-clear scoring routine, not
  a draw).
- `[M]` classified the 21 draw bodies by emitter (`classify.py`): 10 sprite, 10
  text, 1 dead-digit-walk.
- `[M]` xref'd `$80C8D8` (26 sites) and `$80B058` (8 sites): the defer buffer is
  shared, reset by `$240F08` (ported), flushed by `$141258` (IRQ6-gated,
  UNPORTED).
- `[M]` census of `$81B4C8`/`$81B522` refs: 19 sites, all digit-machine or score
  adders. No second consumer of the dirty records.
- `[M]` census of `$8130F9` writers (10 sites): only `$28DB52` sets bit 3, in
  the unported result screen. Tally DEAD confirmed.
- `[M]` census of `$81B62A` writers (6 sites): stage-1 writer is `$2927BA` in
  BOSS_TAIL; the other 5 are stage 2-5 boss inits. Boss HP bar DEAD for stage 1
  confirmed.
- `[M]` confirmed bucket 25 is in `BUCKETS` (`spritequeue.js:93`) and drained by
  `displaylist.js`; confirmed `st.tx` rendering exists (`igs023.js:127`,
  `buildTxMap` at `tiles.js:147`) and that no TxVram model exists in the port.

status: **DONE**
