# 117 -- RECON: the chain-BREAK popup, the item row, and the combo question

status: **DONE** (opened IN PROGRESS before digging, 2026-08-07; closed same day)

started: 2026-08-07. wave: 117. role: RECON (READ-ONLY; the only tree file I write
is this one; throwaway scripts live in `.scratch/w117/`, gitignored, NOT
committed). target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is
build B. instrument: `games/ddpdoj/tools/oracle/out/maincpu.bin` (address == file
offset, big-endian), capstone `CS_MODE_M68K_030`.

`[M]` = measured by me, this session, from the image or this tree.

The brief (from W113's deferral and the owner's "score, chain, combo" ask): map
`$24157A` and `$242AC6` (claimed as a new object-record installer and an unported
item-count helper), map the popup `$2855B6` and item row `$2857B4`, say what
"combo" rendering remains unported, and cut the smallest port. **CHECK THE
BRIEF'S PREMISE.** Done; both deferral reasons are wrong, and the wave is small.

---

## 0. PREMISE CHECK -- BOTH deferral reasons in W113 are WRONG

W113 section 2 deferred the popup and the item row on two claims, both measured
false this session:

| W113's claim | measured reality |
|---|---|
| `$24157A` is "an OBJECT-RECORD installer: copies 8 longwords from a ROM table to `$80E886+slot*64+$20`" | FALSE. `$24157A` is a **PALETTE hi-half installer**, the 4th entry of the nine-routine `$24150A` family (`palette.js:56-71`). Destination `$80E886 + bank*64 + $20` is the HIGH 16 entries of a SPRITE colour bank; the `$20` is the hi-half offset, not an object-record field. It sets the SPRITE dirty flag `$80FA66`. The object table is at `$80E240` (a different region entirely). |
| `$242AC6` is "an UNPORTED helper returning D2 from the item count" | FALSE. `$242AC6` is a **binary-word -> packed-BCD-longword converter** (double dabble), already ported as `bcd242AC6` in `src/items.js:1377`, already used by `src/bomb.js:1495-1497` and `src/items.js:1360-1366`. It returns its result in D2 (the register), not "from the item count"; the item count is an INPUT the caller passes in D0. |

So the keystone of W113's deferral -- "a mechanism NOT yet ported" -- dissolves.
`$242AC6` is ported; `$24157A` is a 4-line sibling of an already-ported family.
The popup and the item row are ordinary bucket-25 SPRITE draws (W113's own
substrate), each plus a digit walk and, for the popup only, a per-frame palette
install. **This is a small wave, not the new-mechanic wave W113's framing
implied.**

---

## 1. `$24157A` MAPPED -- palette hi-half installer, popup is its ONLY caller

`[M]` linear disassembly `$24157A..$2415A0`:

```
24157A  movem.l  d0/a0-a1, -(a7)
24157E  lea.l    $80e886.l, a1       ; sprite palette staging
241584  lsl.w    #$6, d0             ; D0 (bank) * 64
241586  addi.w   #$20, d0            ; + $20  -> the HIGH half of the bank
24158A  adda.w   d0, a1              ; A1 = $80E886 + bank*64 + $20
24158C  moveq    #$7, d0             ; 8 longwords = 16 entries
24158E  move.l   (a0)+, (a1)+        ; copy from A0 (caller-supplied ROM ptr)
241590  dbra     d0, $24158e
241594  move.w   #$1, $80fa66.l      ; set SPRITE dirty flag
24159C  movem.l  (a7)+, d0/a0-a1
2415A0  rts
```

This is `$24150A` (ported, `palette.js:213`) with two diffs and no third:
- `addi.w #$20,D0` before `adda.w D0,A1` (high half, not whole bank),
- 8 longwords (`moveq #$7`) instead of 16 (`moveq #$F`).

It is the routine `palette.js:66` already DOCUMENTS in the nine-entry table but
does NOT implement ("W92: this module implements `$24150A`, `$2415E8`, `$24133C`
... and NOTHING ELSE of the nine"). The port has the table, the assertion, the
dirty-flag plumbing, and the sibling; it is missing only this one variant.

`[M]` call-site census (`jsr $24157A.l`, abs.long, whole 6 MiB image): **exactly
3 sites, all inside the popup `$2855B6`**:

```
$2855E4 jsr $24157A.l   ; the D2 != 0 (active) palette arm
$2855F8 jsr $24157A.l   ; the D2 == 0 (default) primary arm
$285610 jsr $24157A.l   ; the D2 == 0 secondary arm (D0 >= $100)
```

So **`$24157A` has no consumer outside the popup.** Porting it serves the popup
alone; nothing else in the ROM reaches it.

---

## 2. `$242AC6` MAPPED -- already ported, item row is its only HUD caller

`[M]` linear disassembly `$242AC6..$242AEE`:

```
242AC6  movem.l  d0-d1/d3-d4/a0, -(a7)
242ACA  moveq    #$0, d1 / d2 / d3
242AD0  moveq    #$f, d4             ; 16 rounds
242AD2  add.w    d0, d0              ; shift (carry -> X)
242AD4  abcd.b   d1, d1              ; b1 = b1 + b1 + X
242AD6  abcd.b   d2, d2              ; b2 = b2 + b2 + X
242AD8  abcd.b   d3, d3              ; b3 = b3 + b3 + X
242ADA  dbra     d4, $242ad2
242ADE  subq.w   #$4, a7             ; reserve 4 bytes on the stack
242AE0  movea.l  a7, a0 / addq.w #$4, a0
242AE4  move.b   d1, -(a0) / d2 / d3 ; stack the BCD bytes hi->lo
242AEA  clr.b    -(a0)               ; high byte 0
242AEC  move.l   (a0), d2            ; D2 = packed BCD longword (00 D3 D2 D1)
242AEE  addq.w   #$4, a7
```

This is the double-dabble binary-to-BCD the port already has
(`src/items.js:1371-1387`, `bcd242AC6`). The result lands in **D2** (the
register), confirming W113's "returns D2" detail but refuting "from the item
count": D0 is the input, the caller supplies it.

`[M]` call-site census (`jsr $242AC6.l`, abs.long, whole image): **28 sites**,
of which **1 is in the HUD** (`$2857BE`, inside the item row `$2857B4`). The
item row is the only HUD consumer. The other 27 are the item/bonus scoring paths
(`$249Axx` in the bomb, `$252Exx` in the item award, etc.) already ported.

---

## 3. `$2855B6` MAPPED -- the chain-BREAK popup (4-digit BCD walk + palette)

`[M]` linear disassembly `$2855B6..$28567A` (body) + tail `$285690..$2856D2`.

### 3.1 entry registers (confirmed by the P1 caller `$2845C4..$284612`)

```
2845C4  tst.w    $81b5c8.l           ; popup countdown (P.popup)
2845CC  subq.w   #$1, $81b5c8.l
2845D2  move.w   $81b5dc.l, d0       ; D0 = popupVal  (the VALUE to display)
2845D8  moveq    #$0, d6
2845DA  move.w   $81b5cc.l, d6       ; D6 = popupIdx  (the zoom/animation counter)
2845E0  addq.w   #$1, $81b5cc.l
2845E6  move.w   #$40, d1            ; D1 base position (low word)
2845EA  move.w   $81b5c8.l, d3       ; D3 = popup countdown (for position wobble)
2845F0  cmpi.w   #$2a, d3 / bcc / subi / lsl.w #$7, d3 / add.w d3, d1
2845FE  move.w   $81b5ca.l, d2       ; D2 = popupSpeed  (the palette-scheme gate)
284604  beq.b    $28460c / subq.w    ; (decrement popupSpeed)
28460C  move.w   #$7, d4             ; D4 = 7  (the SPRITE PALETTE BANK to install)
284610  bsr.w    $2855b6
```

So at entry: **D0 = popupVal** (`$81B5DC` P1 / `$81B606` P2, a BCD word, 4
nibbles), **D1 = position** (`$40` base + countdown wobble, hi-word set inside
the body to `$4FC0`), **D2 = popupSpeed** (`$81B5CA` / `$81B5F4`, selects the
palette scheme), **D4 = 7** (sprite palette bank), **D6 = popupIdx** (`$81B5CC` /
`$81B5F6`, the zoom counter). The P2 mirror caller is `$284762..$2847AE`.

### 3.2 the body (3 phases)

**Phase A -- the palette install (`$2855B6..$28561E`).** Two arms on `tst D2`:

- **D2 != 0 (active popup):** `lea $2250D8,A0 / move.w D4,D0 / jsr $24157A` --
  install bank 7's hi-half (16 entries) from ROM table `$2250D8`.
- **D2 == 0 (default):** install from `$225118` first; then `cmpi.w #$100,D0 /
  bcs -> skip`; if D0 >= $100 install a SECOND hi-half from `$225158`; then
  `cmpi.w #$1000,D0 / bcs -> skip`; if D0 >= $1000 a `nop` (a fourth install
  that is a deliberate no-op in build B).

So the palette scales with the magnitude of D0 (1-2 digits: one source; 3
digits: two; 4 digits: two plus the nop). Three ROM source tables, 32 bytes each
(16 xRGB555 entries):

```
[M] $2250D8: 82 7F 81 97 80 AF FF DA E6 F3 CA 0C B1 46 FF 25 FE 84 FD C2 E9 21 D0 80 B8 80 A8 81 84 21 00 00  (D2 != 0)
[M] $225118: 82 7F 81 97 80 AF FF DA E6 F3 CA 0C B1 46 97 FA 8A FA 86 7A 81 FA 81 54 80 F1 80 8E 84 21 00 00  (D2 == 0, primary)
[M] $225158: 82 7F 81 97 80 AF FF DA E6 F3 CA 0C B1 46 FF FA FF A8 FF A0 CE C0 B2 40 99 C0 81 60 84 21 00 00  (D2 == 0, D0 >= $100)
```

(The first 14 bytes of all three are identical; they diverge at the digit colour
entries, which is the point -- the digit colour tracks the chain magnitude.)

**Phase B -- the 4-digit BCD walk (`$285620..$28567A`).** `moveq #$3,D7` (4
iterations, one per nibble). Each iteration:

```
285622  rol.w    #$4, d0             ; next BCD nibble into D0 low
285624  moveq    #$f, d2 / and.w d0,d2  ; D2 = the nibble
285626  bne.b    $285636             ; digit != 0 -> draw
285628  tst.l    d6 / bmi $285636    ; D6 negative -> draw anyway (sign marker)
28562E  cmpi.w   #$1c00, d1 / bgt $285672  ; off-screen right -> skip
285634  bra      $285676             ; else skip (leading-zero suppression)
285636  ori.l    #$80000000, d6      ; set "have drawn" bit in D6
28563C  cmpi.w   #$c, d6 / bcc $285664   ; D6 >= $C -> late path
        ; early path (D6 < $C): count how many times D6-=3 succeeds -> D5 in {0,4,8,...}
285646  subi.w   #$3, d6 / bcs / addq.w #$4, d5  ; D5 = zoom level * 4
285652  lea      $2856d4(pc), a0 / movea.l (a0,d5.w), a0  ; jump table -> per-zoom digit table
28565A  add.w    d2,d2 / add.w d2,d2 ; D2 = digit * 4 (longword index)
28565E  move.l   (a0,d2.w), d2       ; D2 = the digit's tile longword
285662  bra      $28566c
285664  add.w    d2,d2               ; late path: D2 = digit * 2 (word index)
285666  move.w   $28567c(pc,d2.w), d2 ; D2 = word offset from $28567C
28566A  add.l    d5, d2              ; + scale
28566C  jsr      $23fac4.l           ; EMIT (register-saving bucket-25)
285672  addi.w   #$480, d1           ; advance position (inter-digit step)
285676  dbra     d7, $285622
28567A  bra      $285690             ; over the inline tables to the suffix
```

**Phase C -- the suffix sprite (`$285690..$2856D2`).** Emits ONE trailing
sprite (the unit/"HIT" graphic). `subi.w #$17,D6 / bcc -> default tile`; else
`neg.w D6 / andi.w #$FFFE / add.w D6,D6` indexes `$285784` for a zoom variant.
Default tile is `$1CC34C` (both `$80390C` arms load the same tile, suggesting
build B kept the placeholder). `move.w #$420,D3 / jmp $23FA96` -- the final
emit (non-saving bucket-25).

### 3.3 the three nested tables (all `[M]`)

| addr | shape | what | extent |
|---|---|---|---|
| `$28567C` | 10 WORDS | late-path per-digit offset (digits 0-9, stride $34): `$0000,$0034,$0068,$009C,$00D0,$0104,$0138,$016C,$01A0,$01D4` | `$28567C..$28568F` (20 bytes) -- the words at `$285690+` are the suffix CODE, not table |
| `$2856D4` | 4 LONGS (jump table) | per-zoom digit-table pointers: `$2856E4,$28570C,$285734,$28575C` (each `$28` = 10 longs apart) | `$2856D4..$2856E3` (16 bytes) |
| `$2856E4` | 40 LONGS | per-zoom x per-digit tile codes (4 zoom levels x 10 digits), e.g. `$1C8F58,$1C8F8C,...` stride $34 | `$2856E4..$285783` (160 bytes) |
| `$285784` | 12 LONGS | suffix zoom variants: `$1CC34C,$1CC308,...$1CC060` (stride -$44) | `$285784..$2857B3` (48 bytes; `$2857B4` is the item row) |

---

## 4. `$2857B4` MAPPED -- the item row (8-digit BCD walk, NO palette install)

`[M]` linear disassembly `$2857B4..$285874` + tail `$28587A` (nop padding).

### 4.1 the body

```
2857B4  move.w   $81b610.l, d0       ; D0 = itemCount (BINARY)
2857BA  bpl.b    $2857be / moveq #$0,d0  ; clamp negative to 0
2857BE  jsr      $242ac6.l           ; D0 (binary) -> D2 (packed BCD)
2857C4  move.l   d2, d0              ; D0 = BCD longword (8 nibbles)
2857C6  move.l   #$5bbffe00, d1 / addi.w #$440, d1  ; D1 = position $5BBF0240
2857D0  move.w   $81b612.l, d4       ; D4 = itemKind (colour/flip for the sprite)
2857D6  moveq    #$0, d6 / move.w $81b60e.l, d6  ; D6 = itemDir (zoom)
2857DE  moveq    #$7, d7             ; EIGHT iterations (8 BCD digits)
2857E0  rol.l    #$4, d0             ; note: rol.L (32-bit), not rol.w like the popup
2857E2  moveq    #$f, d2 / and.w d0,d2
2857E6  bne.b    $2857ec / tst.l d6 / bpl $285842  ; leading-zero suppress (D6 >= 0)
2857EC  ori.l    #$80000000, d6 / cmpi.w #$c, d6 / bcc $28581a   ; same D6 gate as popup
        ; early path: same D5-zoom loop, jump table $28587C, per-zoom digit table
285808  lea      $28587c(pc), a0 / movea.l (a0,d5.w), a0
285810  add.w    d2,d2 / add.w d2,d2 / move.l (a0,d2.w), d2 / bra $285838
28581A  move.w   d2, d5              ; LATE path (D6 >= $C): different from popup
28581C  moveq    #$6, d2 / and.w $80390a.l, d2   ; D2 = $80390A & 6 (1P/2P mode)
285824  lea      $285954(pc), a0 / move.w (a0,d2.w), d2  ; base tile (1P or 2P)
28582C  add.w    d5,d5 / add.w d5,d5 ; D5 = digit * 4
285830  lea      $28592c(pc), a0 / add.l (a0,d5.w), d2   ; + per-digit longword
285838  move.w   #$610, d3 / jsr $23fac4.l        ; EMIT
285842  addi.w   #$440, d1 / dbra d7, $2857e0      ; inter-digit step $440
        ; suffix (one sprite, tile $1CE8E8 or a $28595C zoom variant)
28584A  addi.w   #$fe00, d1 / subi.l #$2000000, d1
285854  move.l   #$1ce8e8, d2 / subi.w #$1b, d6 / bcc $285870
285860  neg.w    d6 / andi.w #$fffe / add.w d6,d6 / lea $28595c(pc),a0 / move.l (a0,d6.w),d2
285870  move.w   #$420, d3 / jmp $23fa96.l
```

### 4.2 differences from the popup

- **No palette install.** The item row never calls `$24157A`. D4 (`$81B612`,
  `itemKind`) is the sprite's colour/flip word, passed straight through to
  `$23FAC4`/`$23FA96` as the 4th register (the standard bucket-25 enqueue),
  NOT a palette bank.
- **8 digits, not 4.** `moveq #$7,D7` and `rol.l #$4,D0` (longword rotate)
  because `$242AC6` produces a packed-BCD LONGWORD (up to 8 digits for a
  16-bit input; practical max is 5 digits for `$FFFF` = 65535).
- **A different late-path table set.** The popup's late path reads
  `$28567C[digit*2] + D5`; the item row's reads `$285954[$80390A & 6] +
  $28592C[digit*4]`. (The `$80390A & 6` selects a 1P/2P base tile.)
- **A different suffix table.** `$28595C` (item) vs `$285784` (popup).

### 4.3 the item tables (all `[M]`)

| addr | shape | what | extent |
|---|---|---|---|
| `$28587C` | 4 LONGS (jump table) | per-zoom digit-table pointers: `$28588C,$2858B4,$2858DC,$285904` | `$28587C..$28588B` (16 bytes) |
| `$28588C` | 40 LONGS | per-zoom x per-digit tile codes (4 x 10): `$1CCD64,$1CCD98,...` stride $34 | `$28588C..$28592B` (160 bytes) |
| `$28592C` | 10 LONGS | late-path per-digit tile offset (digits 0-9, stride $34): `$1CDB24,...$1CDCF8` | `$28592C..$285953` (40 bytes) |
| `$285954` | 4 WORDS | late-path 1P/2P base tile (`$80390A & 6` index): `$0000,$0410,$0208,$0410` | `$285954..$28595B` (8 bytes) |
| `$28595C` | 14 LONGS | suffix zoom variants: `$1CE8E8,...$1CE574` (stride -$44) | `$28595C..$285993` (56 bytes; `$285994` is the hi-score walk) |

### 4.4 the item-row caller (`$284B30..$284B5E`) -- already ported context

`[M]` the caller is the per-frame item-row dispatch, already ported in
`src/hud.js:1641-1656`. It sets `itemKind = 7` (`$284B3E`) and calls the body
when `itemDir >= 0` (`$284B36 tst.w $81B60E / bmi -> skip`); else clears
`itemCount`/`itemTimer`. The port already writes every word the body reads
(`itemCount $81B610`, `itemKind $81B612`, `itemDir $81B60E` -- all in `HUDRAM`,
lines 272-275). **Inputs ready; only the picture is absent.**

---

## 5. THE COMBO / LIVE CHAIN-COUNT QUESTION -- RESOLVED

The owner asked for "score, chain, combo". Status:

- **score:** DONE (W115, the digits).
- **chain (the high-water mark):** DONE (W116, `$286040` text row).
- **chain (the meter bar):** DONE (W113, `$2859DC` sprite).
- **combo / live chain count:** **THIS IS THE POPUP.** `[M]` the popup's D0
  is `popupVal` (`$81B5DC` P1 / `$81B606` P2), and `popupVal` is COPIED from
  `$81B5DA` (P1) / `$81B604` (P2) -- the live chain count BCD -- at four sites:

  ```
  [M] $18500C  move.w $81b5da.l, $81b5dc.l   ; (and $1851BC / $185600 / $1851A2 for P2)
  [M] $185612  move.w $81b5da.l, $81b5dc.l
  [M] $28645E  move.w $81b5da.l, $81b5dc.l   ; (and $28660E / $286A64 / $286D8A)
  [M] $286A64  move.w $81b5da.l, $81b5dc.l
  ```

  These are the chain-event arms of the chain machines `$2862C6` / `$286476` /
  `$286876` (ported in `src/score.js` per W112 sec 4). The popup countdown
  `P.popup` (`$81B5C8`) is armed to `$F0` (240 frames) at `$286444` / `$286A52`
  / `$184FF2` / `$185600`.

So **the popup `$2855B6` IS the live chain-count display**: a chain event
snapshots the current chain count into `popupVal`, arms a 240-frame countdown,
and the popup renders that count as 4 BCD sprite digits that wobble up the
screen. **There is NO separate combo/hit-count display.** W112 sec 6.3 Wave E
already said this ("the combo/hit count is the popup value"); this recon
confirms it at the ROM. Once `$2855B6` ports, the "combo" is visible.

---

## 6. THE SMALLEST PORT -- and the wave breakdown

This is a SMALL wave. Both deferral reasons dissolve: `$242AC6` is ported,
`$24157A` is a trivial sibling. The two bodies are ordinary bucket-25 sprite
draws (the W113 substrate) plus a BCD digit walk, and the popup adds a
per-frame palette install. Nothing else in the ROM calls `$24157A`; nothing
else in the HUD calls `$242AC6`.

### 6.1 the port, in three pieces

**Piece 1 -- `install24157A` in `src/palette.js`** (~25 lines). A thin variant
of `install24150A`: same `(ram, pal, d0, src, site, why)` signature, same
`lea $80E886 / lsl #6` arithmetic, but `addi.w #$20` before the offset, and the
copy is 16 entries (8 longwords) not 32, writing `pal.stageSourced.spr[bank*32
+ 16..31]`. Sets dirty flag `$80FA66`. (The port's existing
`catchUpObjectStream` may already source bank 7's hi-half from the scroll
stream; the per-frame install OVERRIDES it for the popup's duration, exactly as
the board does. No restore needed -- the next scroll-stream install refreshes
it after the popup ends.)

**Piece 2 -- `itemRow2857B4` in `src/hud.js`** (~50 lines). The simpler body.
Reads `itemCount $81B610`, converts via the already-ported `bcd242AC6`, walks 8
nibbles (`rol.l #4`), emits each digit through `enqueueRegisters(ram, 25, d1,
d2, d3, d4)` (already ported, `src/spritequeue.js:243`), with the early/late
table pick on the D6 gate. Emits the suffix sprite. Replaces the
`draw(ctx, 0x2857b4)` note (hud.js:1423 region; the body is reached from the
already-ported dispatch at hud.js:1641-1656). **Depends on NO new
infrastructure -- only already-shipped functions.**

**Piece 3 -- `chainPopup2855B6` in `src/hud.js`** (~80 lines). Calls
`install24157A` (piece 1) 1-3 times based on D2 and D0 magnitude (sources
`$2250D8` / `$225118` / `$225158`), then the 4-nibble BCD walk (`rol.w #4`),
then the suffix. Same `enqueueRegisters(ram, 25, ...)` for each digit. Replaces
the `draw(ctx, 0x2855b6)` note. The caller (`$2845C4..$284612` P1 / `$284762..`
P2) is already ported (hud.js:1416-1423). **Depends only on piece 1.**

### 6.2 the ROM windows (one block in `tools/export-tables.py`)

None of these tables is covered by an existing window (`[M]` W91/W92/W93 palette
windows are `$222A78`/`$227E58`/`$222638`/`$222778`; W113 HUD windows are
`$28809E`/`$2881F2`/`$288326`; W116 are `$2881E2`/`$2883E6`. None overlap).
One contiguous block per region:

| base | len | what |
|---|---|---|
| `$2250D8` | `$068` (104) | the popup's 3 palette source tables, 32 bytes each, abutting (`$2250D8`/`$225118`/`$225158`); far end `$22513F` |
| `$28567C` | `$014` (20) | popup late-path word table (10 entries) |
| `$2856D4` | `$140` (320) | popup jump table (4 longs) + the 40-long per-zoom digit block `$2856E4..$285783` + suffix table `$285784..$2857B3` (12 longs). One window `$2856D4..$285813` |
| `$28587C` | `$118` (280) | item jump table (4 longs) + 40-long per-zoom digit block `$28588C..$28592B` + late-path long table `$28592C..$285953` + late-path word table `$285954..$28595B` + suffix table `$28595C..$285993` (14 longs). One window `$28587C..$285993` |

(The popup body `$2855B6..$2856D2` and item body `$2857B4..$285874` are CODE,
already in the image; they do not need windows -- only their DATA tables do.)

A `check_hud_popup_item_extents` assertion (analogous to W113's
`check_hud_sprite_extents`) pins the jump-table pointers and the table extents
out of the image on every export.

### 6.3 the must-fail check (SEEDED)

- **Item row SEEDED:** with `itemCount $81B610 = $10` (BCD 16 after convert) and
  `itemDir $81B60E >= 0`, `itemRow2857B4` emits N digit sprites into bucket 25
  (counter `$80AFE6` advances by 12 per digit + 12 for the suffix) and installs
  NO palette (dirty flag `$80FA66` unchanged). With `itemDir < 0`, the caller
  returns before the body and the counter does not move (already asserted by
  the W113 chain-bar pattern; mirror it).
- **Popup SEEDED:** with `popup $81B5C8 != 0` and `popupVal $81B5DC = $0123`,
  `chainPopup2855B6` (a) calls `install24157A` once or twice (dirty flag
  `$80FA66` becomes 1) and (b) emits 4 digit sprites + 1 suffix into bucket 25.
  Break: a popup that skips `install24157A` leaves the dirty flag at 0 -> RED.
  Restore -> GREEN.
- **Combo identity:** assert the popup's emitted digit tiles correspond
  byte-for-byte to the BCD of `popupVal` (so "the popup value IS the chain
  count" is a tested invariant, not a comment).

### 6.4 wave shape

One wave (call it W117-IMPL or W118 depending on the next IMPL slot). Pieces 1
and 2 can land together (piece 2 needs nothing new); piece 3 follows piece 1.
The owner-visible result: the chain-count popup pops on chain events (the
"combo"), and the item-row running tally renders alongside the rest of the HUD.

---

## 7. ROM WINDOWS CHECK -- nothing existing covers these tables

`[M]` census of every window base in `tools/export-tables.py` against the four
data regions above: zero overlap. The closest are the W91/W92/W93 PALETTE
windows (`$222A78`, `$222778`, `$222638`, `$227E58`) which sit in `$222xxx` /
`$227xxx`, below the popup's `$2250D8`-$225158 palette sources (the WAVE-13 BG
column stream at `$225B78` starts ABOVE them, so they fall in a `$2250D8..`
gap). The W113/W116 HUD windows are all in `$288xxx`, above the popup/item
`$285xxx` tables.

---

## RULED OUT

- **`$24157A` as an object-record installer.** `[M]` it writes to `$80E886` (the
  sprite palette staging area), sets dirty flag `$80FA66`, and copies from a
  caller-supplied ROM pointer. The object table is `$80E240`; these are
  different regions. The "slot" in W113's deferral was a palette BANK.
- **`$242AC6` as an unported helper.** `[M]` it is the double-dabble BCD
  converter, ported as `bcd242AC6` (`src/items.js:1377`), used by `bomb.js` and
  `items.js`. 28 ROM call sites, 1 in the HUD (the item row).
- **A separate combo/hit-count display.** `[M]` the popup value IS the chain
  count (`$81B5DA`/`$81B604` snapshot into `popupVal`). No other RAM word holds
  a "combo" that a separate draw reads.
- **The popup's 4th palette install.** `[M]` `$28561E` is a `nop` in build B
  (a `cmpi.w #$1000,D0 / bcs -> skip` guards a `nop`). The 4-digit arm installs
  the SAME two sources as the 3-digit arm; no third source table exists.

## COULD NOT REACH (measured reasons)

- **Whether sprite palette bank 7 is already sourced by `catchUpObjectStream`
  before the popup's first frame.** Not measured; the popup installs it every
  frame it draws regardless, so the port is correct either way, but the
  implementer may note the sourced-count delta for the ledger.
- **The exact tile-art presence** for tiles `$1C8F58..$1C9xxx` (popup digits),
  `$1CCD64..$1CCExx` (item digits), `$1CC34C`/`1CC060` (popup suffix),
  `$1CE8E8`/`1CE574` (item suffix) in the exported sprite sheets. Same question
  W113 sec 6.4 left open for the panel/icon tiles; the same check applies.
- **Dynamic confirmation of the popup's on-screen position/wobble.** The
  position math (`$40` base + `lsl.w #7` of the countdown) is transcribed
  faithfully; a MAME frame-capture would confirm the wobble matches, but the
  port is byte-faithful either way.

## LOG

- opened IN PROGRESS before digging.
- read W112 (full), W113 (full), W116 (full); `src/hud.js` (the DRAWS table,
  the playerBlock dispatch 1416-1656, the W113 sprite bodies), `src/palette.js`
  (the `$24150A` family + `install24150A` + `install2415E8` + the nine-entry
  table at lines 56-71), `src/items.js` (`bcd242AC6` 1371-1387 + the
  `bcdTriple` callers), `src/objalloc.js` (the object table at `$80E240`, to
  confirm `$24157A`'s `$80E886` is a DIFFERENT region), `src/bomb.js`
  (`bcd242AC6` consumers 1495-1497).
- `[M]` disassembled `$24157A` (the palette hi-half installer), `$242AC6` (the
  BCD converter), the popup `$2855B6..$2856D2`, the item row `$2857B4..$285874`,
  the P1 popup caller `$2845C0..$284614`, the item-row caller `$284B30..$284B70`.
- `[M]` dumped the 7 nested data tables (`$28567C`, `$2856D4`, `$2856E4` block,
  `$285784`, `$28587C`, `$28588C` block, `$28592C`, `$285954`, `$28595C`) and
  the 3 popup palette source tables (`$2250D8`/`$225118`/`$225158`).
- `[M]` call-site census: `$24157A` has 3 sites (all in the popup); `$242AC6`
  has 28 sites (1 in the HUD, the item row).
- `[M]` writer census of `popupVal` (`$81B5DC`/`$81B606`): 4 sites, all
  `move.w $81B5DA/$81B604, $81B5DC/$81B606` -- the chain-count snapshot. This
  resolves the combo question.
- `[M]` window-overlap check: none of W91/W92/W93/W113/W116 windows cover the
  `$225xxx` palette sources or the `$285xxx` digit/suffix tables.

status: **DONE**
