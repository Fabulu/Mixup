# 114 -- RECON: name the score-digit draw routine with a MAME write-tap

status: **DONE** (opened IN PROGRESS before digging, 2026-08-07; closed same day)

started: 2026-08-07. wave: 114. role: RECON (READ-ONLY; the only tree file I
write is this one; throwaway scripts live in `.scratch/w114/`, gitignored, NOT
committed). target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address
is build B unless tagged "(A)" (the build-A interrupt handlers that actually run
on a version-B run, per HANDOVER sec 7). instrument: MAME 0.288 driven through
the oracle's `pgm.run()` harness with custom Lua probes (`.scratch/w114/`);
static disassembly off `games/ddpdoj/tools/oracle/out/maincpu.bin` (address ==
file offset, big-endian) with capstone `CS_MODE_M68K_030`.

`[M]` = measured by me, this session, from MAME or the image.

## TL;DR -- the routine is `$185DC4`, and the brief's `$240DC2` premise is WRONG

The P1/P2 score-digit draw is **`$185DC4`** (build-A interrupt-handler code). It
is the **4th of four routines the IRQ6 handler runs after the `$803940` gate
passes** (`[M]` disassembly of the ISR6 body (A) `$13C7D4`):

```
13C7E6  tst.b    $803940.l      ; THE (A) GATE
13C7EC  beq.b    $13c80c        ; skip the four if the semaphore is clear
13C7EE  jsr      $141676.l      ; gated routine 1
13C7F4  jsr      $140ffe.l      ; gated routine 2 -- the scroll-reg upload (PORTED, W13)
13C7FA  jsr      $141258.l      ; gated routine 3 -- the DEFER-BUFFER flush ($80B058 -> $904000)
13C800  jsr      $185dc4.l      ; gated routine 4 -- THE SCORE-DIGIT DRAW  <<<
13C80C  jmp      $13c4fc.l      ; ISR6 tail
```

`$185DC4` does **NOT** call `$240DC2`, does **NOT** touch the defer buffer
`$80B058`, and does **NOT** read the BCD total `$81B440`. It reads the digit
machine's dirty records at `$81B4C8` and writes the text tilemap `$904000`
**directly**. The score digits have their OWN dedicated deferred-write buffer
(the dirty records) and their OWN flush (`$185DC4`), parallel to the general
text defer buffer (`$80B058` / `$240DC2` / flush `$141258`) which is what the
lives / bombs / credits / chain-high-water rows use.

**This is why W112's static closure of `$28444E` missed it.** `$28444E` is the
MAIN-LOOP HUD dispatch (build B). `$185DC4` lives in the IRQ6 HANDLER (build A),
a completely separate call tree that main-loop closure never traverses. The
"indirect `jsr (An)`" hypothesis in the brief / W112 sec 1.3 was a red herring:
`$185DC4` is reached by a plain **direct `jsr $185dc4.l`** at `$13C800`. The
port's own `src/machine.js:196` had `$185dc4` listed in `isr6Gated` the whole
time -- W112 just never connected it to the score digits.

## 0. PREMISE CHECK -- the brief's "$240DC2 produces the score digits" is FALSE

The brief and W112 sec 1.3 assume the score digits are produced by `$240DC2`
(deferred writes buffered at `$80B058`). Four independent MAME measurements
refute this:

1. `[M]` **A write-tap on the defer buffer `$80B058..$80C8D7`** (scoretap.lua,
   3200 logic frames of stage-1 gameplay with auto-shot, P1 score climbing BCD
   `0` -> `00016089`) caught every `$240DC2`-family writer. The 22 unique
   callers (return PCs at `[A7+36]`) are ALL non-score draws -- the hyper-stock
   icons, the bomb-stock row, the lives row, the chain high-water, the panel /
   hyper-gauge frame, the object-driver dispatch. **None of them reads
   `$81B440` or `$81B4C8`.** (Full census in section 4 below.)
2. `[M]` **A read-tap on the dirty-record range `$81B4C8..$81B525`** (readtap.lua)
   shows the ONLY non-`$2843xx` reader is `$185DD4/DD8/DDA/DDC` -- i.e. inside
   `$185DC4`. The BCD total `$81B440` is read ONLY by `$2843xx` (the drain /
   digit machine), never by a `$240DC2` caller.
3. `[M]` **A write-tap on the text tilemap `$904000..$904FFF`** (diag.lua) shows
   `$185DDC` writing `$904000` directly during gameplay -- the
   `move.l (a0)+,(a1)` inside `$185DC4`. (`$14126C` is the general defer flush
   writing the same range for the OTHER text.)
4. `[M]` **A dump of the 18 dirty records** (recdump.lua, at lf=2020, P1 score
   BCD `00000086`) shows each record is `{dirty word, dest-addr long, tile
   longword}`, the dest addrs all land in `$904xxx`, and records 7/8 carry
   `$C0380000` / `$C0360000` = char codes `$C030+8` / `$C030+6` = the score
   digits "8" and "6" (matching `hud.js`'s `$C030+digit` encoding). Records 0-6
   are `$00000000` = suppressed leading zeros. (Full table in section 3.)

So: the score digits never go near `$240DC2`. They go
digit-machine `$2843A8` -> dirty records `$81B4C8` -> flush `$185DC4` ->
`$904000`, all their own.

## 1. THE ROUTINE -- `$185DC4`, verbatim (build A, runs in IRQ6)

`[M]` capstone disassembly `$185DC4..$185E14`:

```
185DC4  tst.w    $81b6f0.l        ; gate: anything pending to draw?
185DCA  beq.b    $185dc2          ; -> rts (nothing dirty this frame)
185DCC  lea.l    $81b4c8.l, a0    ; A0 = P1 dirty-records base ($81B4C8)
185DD2  moveq    #$11, d0         ; D0 = $11 -> dbra runs 18 times (P1's 9 + P2's 9)
185DD4  tst.w    (a0)             ; --LOOP HEAD-- record dirty? (the +$0 word)
185DD6  beq.b    $185de4          ; not dirty -> skip record
185DD8  clr.w    (a0)+            ; clear dirty flag, A0 -> +$2
185DDA  movea.l  (a0)+, a1        ; A1 = destination address (the +$2 long), A0 -> +$6
185DDC  move.l   (a0)+, (a1)      ; *(dest) = tile longword (the +$6 long), A0 -> +$A
185DDE  dbra     d0, $185dd4      ; 18 records
185DE2  rts
185DE4  lea.l    $a(a0), a0       ; SKIP: advance one record (stride $A)
185DE8  dbra     d0, $185dd4      ; ...and continue
185DEC  tst.w    $81b57c.l        ; after the 18: two extra single records
185DF2  beq.b    $185e00         ;   ($81B57C / $81B586 -- the hi-score / extend digit)
185DF4  lea.l    $81b57c.l, a0
185DFA  clr.w    (a0)+
185DFC  movea.l  (a0)+, a1
185DFE  move.l   (a0)+, (a1)
185E00  tst.w    $81b586.l
185E06  beq.b    $185e14
185E08  lea.l    $81b586.l, a0
185E0E  clr.w    (a0)+
185E10  movea.l  (a0)+, a1
185E12  move.l   (a0)+, (a1)
185E14  rts
```

**What it does.** It is a DEFERRED-WRITE FLUSH, the exact analogue of the
general flush `$141258`, but for a SEPARATE buffer (the dirty records at
`$81B4C8`) writing a SEPARATE set of tilemap cells (the score-digit columns).
Each dirty record is 10 bytes (`+$0` dirty word, `+$2` dest-address longword,
`+$6` tile longword); the flush walks 18 of them (P1 then P2, 9 each) plus two
standalone records, and for each dirty one writes the tile longword to the dest
address (in the `$904000` text tilemap) and clears the dirty flag.

Two helper routines sit right above it (same IRQ6 context):
- `[M]` `$185E16` (P1) / `$185E3C` (P2): a "mark all 9 records dirty" loop
  (`lea $81B4C8,A0 / moveq #8,D0 / move.w #1,(A0) / lea $A(A0),A0 / dbra`),
  also marking `$81B57C` / `$81B586`. This is the full-redraw arm (called on
  init / player-change / the redraw W112's `deferReset` analogue would trigger).

## 2. HOW IT IS REACHED -- IRQ6 dispatch, NOT main loop, NOT indirect

`[M]` the ISR6 body (A) `$13C7D4` is the routine whose address the IRQ6 vector
(`$801478` = `$13BDBA` (A), per `src/machine.js:188`) dispatches. After the
`$803940` gate at `$13C7E6` (the same gate frame.lua samples), it runs four
`jsr`s in sequence (section TL;DR). `$185DC4` is the 4th, via a **direct
absolute-long `jsr $185dc4.l` at `$13C800`**. There is nothing indirect about
this specific hop.

`[M]` xref: the 4-byte literal `$00185DC4` appears in the ROM only at file
offset `$13C802` (the operand of that `jsr`). There is exactly one call site.
So static call-graph closure DOES find it -- but only if you start from the ISR6
body (A) `$13C7D4`, not from the main-loop HUD dispatch `$28444E` (B). W112
closed over `$28444E` and the main loop; the IRQ6 handler is a separate tree,
and `src/machine.js:196`'s `isr6Gated` list is where the port already records
that tree. The brief's "indirect `jsr (An)`" hypothesis is not how this routine
is reached; the real reason is "it is an interrupt handler".

## 3. THE RECORD LAYOUT, measured (recdump.lua, lf=2020, P1 BCD `00000086`)

`[M]` the 18 records at `$81B4C8` (P1) continuing into `$81B522` (P2), plus the
two standalone records, dumped at the sample point:

```
 idx  base      dirty destAddr  tileLong    decoding
   0  $81B4C8   0000  $9040D8  $00000000    P1 digit 0 (MSB), blank (leading-zero suppress)
   1  $81B4D2   0000  $9041D8  $00000000    P1 digit 1, blank
   2  $81B4DC   0000  $9042D8  $00000000    P1 digit 2, blank
   3  $81B4E6   0000  $9043D8  $00000000    P1 digit 3, blank
   4  $81B4F0   0000  $9044D8  $00000000    P1 digit 4, blank
   5  $81B4FA   0000  $9045D8  $00000000    P1 digit 5, blank
   6  $81B504   0000  $9046D8  $00000000    P1 digit 6, blank
   7  $81B50E   0000  $9047D8  $C0380000    P1 digit 7 = "8"  ($C030+8)
   8  $81B518   0000  $9048D8  $C0360000    P1 digit 8 (LSB) = "6"  ($C030+6)
   9  $81B522   0000  $9051D8  $00000000    P2 digit 0 (MSB), blank (P2 score 0)
  10  $81B52C   0000  $9052D8  $00000000    P2 digit 1, blank
  ..(11-17 all $00000000 -- P2 idle)..
  17  $81B572   0000  $9059D8  $00000000    P2 digit 8 (LSB)
  18  $81B57C   0000  $9049D8  $C0300000    extra = "0" ($C030+0)  [hi-score?]
  19  $81B586   0000  $905AD8  $C0300000    extra = "0"            [hi-score P2?]
```

**Decoding the tilemap positions.** `pos = (dest - $904000)/4`, tilemap is 64
wide. `$9040D8` -> entry 54 = row 0 col 54; `$9041D8` -> row 1 col 54; ... so
P1's 8 BCD digits are **column 54, rows 0..8** (a vertical column, as expected
for a TATE game); P2's are **column 54, rows 9..17**. Records 18/19 land at
row 9 / row 26 col 54. (These positions are the FIXED score layout; the `+$2`
dest field is set once at HUD init and never changes -- see OPEN DETAILS.)

**The record contract:**
- `+$0` (word): dirty flag. Written `1` by the digit machine `$2843A8` (ported
  as `digits2843A8`), cleared by this flush.
- `+$2` (long): destination address in the `$904000` text tilemap. Set at init
  (fixed). NOT touched by the digit machine.
- `+$6` (long): tile attribute longword. The HIGH word is the digit char code
  `$C030 + digit` (written by the digit machine as a WORD at `+$6`, with `+$8`
  staying `$0000`); the flush writes the whole longword to the tilemap. The
  `$C0` byte is the palette/flag half; the low byte is the tile index
  (`$30 + digit` -> digit tiles `$30..$39`).

**`hud.js`'s `digits2843A8` already writes `+$0` and `+$6` correctly.** What is
missing is the FLUSH `$185DC4` and a TxVram model for `$904000` to write into.

## 4. BONUS: the `$240DC2` callers ARE the OTHER text (confirms the split)

`[M]` the 22 unique `$240DC2`-family callers captured during gameplay, labelled
against W112 sec 1.1/1.2 and confirmed by disassembly this session. **None is
the score-digit routine**; these are the lives / bombs / credits / chain /
hyper-stock / panel draws:

| caller (ret PC) | firstlf | what it draws `[M]` | reads |
|---|---|---|---|
| `$2410E4` | ~700 | the OBJECT DRIVER dispatch return (`$2410E2 jsr (A0)`) -- this IS the indirect `jsr (A0)` for the HUD slot handlers | (A5 slot) |
| `$284EC0` | 2048 | P1 panel hyper-gauge tile loop (`$284EBA jsr $240DC2`, reads `$81043E`, table `$2881E2`) | `$81043E` |
| `$284ED0` | 2048 | P1 hyper-stock icons -- tail-jmp into `$240DC2` from `$286ED6` (`$284ECA jsr $286ED6`; `$286F28 jmp $240DC2`) | `$81B63E`,`$81B65C` |
| `$284ED6` | 2048 | P1 bomb-stock row -- tail-jmp from `$287ABE` (`$284ED0 jsr $287ABE`; `$287AD4 jmp $240DC2`) | (cmp `$81B65C`) |
| `$284EF2` | 2048 | the panel-row fixed label (`$284EEC jsr $240DC2`, tile `$54F000A`) | -- |
| `$286050`,`$286082` | 2049 | chain HIGH-WATER / hyper-label rows (`$286xxx`) | -- |
| `$285B2A` | 2217 | chain-related row (`$285Bxx`) | -- |
| `$28793C`,`$28794E` | 2288 | P1/P2 LIVES rows (`$2878CC`/`$28795C` family, W112 1.2) | `$8130BE`/`$8130C0` |
| `$25346C`,`$253480`,`$253494`,`$253322`,`$25334A`,`$25337E`,`$253390` | 1966-68 | ship/option spawn-time text (the `$253xxx` shot driver family) | -- |
| `$25A034`,`$25FBEC`,`$260B92`,`$260BAC`,`$260C98` | 701-1560 | title/attract text (pre-gameplay) | -- |
| `$000000`,`$000013` | 699/1014 | (bogus `[A7+36]` reads during attract -- ignore) | -- |

The two notable structural facts for the implementer:
- **`$286ED6` and `$287ABE` (and the other W112 sec 1.2 text draws) reach
  `$240DC2` via a tail `jmp $240DC2`**, not a `jsr`. So at the `$240DC2` write,
  `[A7+36]` is the return PC of the `jsr` that called THEM (e.g. `$284ED0`),
  not a return into themselves. A port that walks the stack to name them must
  account for the tail-call.
- **The HUD text draws are dispatched by the object driver** (`$2410E2 jsr
  (A0)`, handler table `$240F62`): the `$284Exx` row routine is reached as an
  object slot handler, which is the genuine `jsr (A0)` indirect dispatch in this
  subsystem. That is why W112's static closure of `$28444E` found the bodies but
  not the dynamic entry -- the entry is the object table.

## 5. WHAT THE PORT NEEDS (for the wave-C implementer)

1. **Port the flush `$185DC4`** as a JS function that walks the 18+2 dirty
   records at `$81B4C8` and, for each dirty one, writes the `+$6` tile longword
   to a TxVram model at the `+$2` dest address, then clears `+$0`. This is ~15
   lines and the producer (`digits2843A8`) is already ported and already writes
   `+$0`/`+$6` correctly.
2. **A `TxVram` model for `$904000`** (W112 sec 2.2 item 1 -- still missing).
   The dest addresses are real `$904xxx` offsets; `TxVram` is a 64x32 (or 64x64)
   longword array analogous to `BgVram`.
3. **`st.tx` sourced from TxVram** and `wantTx:false` flipped (W112 sec 2.2
   item 4).
4. The general text flush `$141258` and the `$240DC2` printer are STILL needed
   for the OTHER text (lives, bombs, credits, chain high-water) -- that is W112
   wave B / D. The score digits are independent of those and can ship first.

## 6. OPEN DETAILS (flagged, not blocking)

- **Who initialises the records' `+$2` dest addresses?** They are fixed
  (`$9040D8`, `$9041D8`, ... for P1; the full measured set is in section 3) and
  do not change frame to frame, so they are set once at HUD init. Not pinned
  this wave (it is a one-time write, easy to catch with a write-tap on
  `$81B4CA` from boot if the implementer wants the init routine's address). The
  VALUES are all measured and in section 3, so a port can hardcode them.
- **`$81B6F0`** (the gate at `$185DC4`) is the "is any score record dirty
  pending" master flag. Not yet named in `HUDRAM`; the implementer should add it
  (the digit machine / its arm presumably sets it).
- **Records 18/19 (`$81B57C`/`$81B586`)** at row 9 / row 26 col 54 carry digit
  "0" here; they are probably the hi-score or an extend counter drawn the same
  way. Confirm against the hi-score plumbing (`$81B448`/`$81B49C`) when porting.

## MAME EVIDENCE (the measurements, by probe)

- `.scratch/w114/diag.lua` -> `diag.log`: write-tap census of `$904000..$904FFF`
  and the defer buffer. Shows `$185DDC` writing `$904000` directly AND `$240DE0`
  (`$240DC2`) writing `$80B058`; the two are separate producers. (RUN=2400 lf.)
- `.scratch/w114/scoretap.lua` -> `scoretap.log`: write-tap on the defer buffer,
  captures `[A7+36]` (caller ret PC) + saved D0-D4 + stack scan for every
  `$240DC2`-family write. 22 unique callers, NONE the score routine. (RUN=3200
  lf; errs=0; 1351 frames with defer writes; 142 P1 score-change frames.)
- `.scratch/w114/readtap.lua` -> `readtap.log`: read-tap on `$81B4C8..$81B525`
  (dirty records) and `$81B440`/`$81B444` (BCD totals). The only non-`$2843xx`
  reader of the records is `$185DD4..$185DDC` (= `$185DC4`); the BCD totals are
  read only by `$2843xx`. (RUN=2600 lf.)
- `.scratch/w114/recdump.lua` -> `recdump.log`: full dump of the 22 records at
  lf=2020 (P1 BCD `00000086`), giving the layout and the dest/tile table in
  section 3. (DUMP_AT=2020.)
- `.scratch/w114/disasm.py`: capstone disassembler used for `$185DC4`,
  `$286ED6`, `$287ABE`, `$284E80`, the ISR6 body `$13C7D4`.

## RULED OUT

- **`$240DC2` as the score-digit producer.** `[M]` four independent measurements
  (sections 0 and 4): the score digits never go through `$240DC2` or `$80B058`.
- **An indirect `jsr (An)` as the reason static scan missed the routine.**
  `[M]` `$185DC4` is reached by a direct `jsr $185dc4.l` at `$13C800`. The real
  reason is that it is an IRQ6 handler (separate call tree from the main-loop
  `$28444E` closure W112 walked).
- **The BCD total `$81B440` being read by the draw.** `[M]` read-tap: `$81B440`
  is read only by `$2843xx` (drain / digit machine). The draw `$185DC4` reads the
  dirty records, not the total.

## COULD NOT REACH (measured reasons)

- **The `+$2` dest-address init routine.** One-time write at HUD init; not
  pinned (values measured, section 3). Cheap to catch later with a write-tap on
  `$81B4CA` from boot.
- **Whether the digit machine writes `+$8` (the low word of the tile longword)
  or leaves it `$0000`.** The dump shows the longword is `$C0300000`-shaped (low
  word `$0000`), consistent with `hud.js` writing only the `+$6` word; not
  re-verified against the ROM byte-for-byte this wave.

## LOG

- opened IN PROGRESS before digging.
- read W112 (full), frame.lua (full), pgm.py `run()`/`trace()`/scenarios.json,
  `src/hud.js` `digits2843A8`/`drainOne2842FE`, `src/machine.js` `isr6Gated`.
- confirmed ROM verifies "best available"; maincpu.bin + capstone 5.0.7 ready.
- `[M]` scoretap.lua v1 silently counted `defw=0` for 3200 frames: traced to
  (a) the defer-tap end address needing the ODD 16-bit-space convention
  ("did you mean 80c8d7"), and (b) `CPU.state["A7"]` RAISING inside the callback
  (MAME exposes the 68k SP as `"SP"`, documented at `w21bullets.lua:140`).
  Switched to `CPU.state[SPNAME]` and `RAM:read_u32` for stack reads (reading
  `PROG` inside a `PROG` write-tap re-enters the space). v2 then ran clean
  (errs=0).
- `[M]` diag.lua: found `$185DDC` writes `$904000` and `$240DE0` writes `$80B058`
  -- two separate producers. Premise break.
- `[M]` readtap.lua: the dirty-record reader outside `$2843xx` is `$185DD4-DDC`.
- `[M]` disasm `$185DC4`: the flush, 18 records + 2 extra, direct `move.l
  (a0)+,(a1)` to the tilemap.
- `[M]` recdump.lua at lf=2020: record layout + the score "86" tiles at records
  7/8.
- `[M]` disasm ISR6 body `$13C7D4`: `$185DC4` is the 4th gated `jsr` at
  `$13C800`, after the flush `$141258`. Direct, not indirect.
- `[M]` xref: `$00185DC4` literal appears once, at `$13C802`.

status: **DONE**
