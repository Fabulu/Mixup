# 91 -- IMPL: the sprite palette, and where the bomb's orange actually lives

status: **IN PROGRESS**

started: 2026-08-06. wave: 91. role: IMPLEMENTER.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B.

`[M]` = measured by me, this session, on this tree. Anything from another
document is `[cited]` and named.

inputs read in full: `90-impl-laser-impact-bomb-palette.md`,
`39-OWNER-visible-play-before-sound.md`, `games/ddpdoj/src/web/app.js`,
`games/ddpdoj/src/render/capture.js`, `games/ddpdoj/src/web/assets.js`,
`games/ddpdoj/src/background.js`, `games/ddpdoj/src/bomb.js`.

---

## 0. THE PREMISE, CHECKED FIRST -- and one of its two halves is WRONG

| the brief says | `[M]` verdict |
|---|---|
| the bomb's records carry colour bank 6; `$249A62 jsr $260852` and `$249A80 jsr $26085C` both fall into `$260862 move.w #$6,D0 / jmp $24150A` | **TRUE**, re-derived from the image, not inherited |
| `$24150A` is a COUNTED NOTE in seven files and has never been ported | **TRUE for the mechanism, and "seven files" is SIX.** `[M]` `src/initbody.js`, `src/hud.js`, `src/stageend.js`, `src/background.js`, `src/boss.js`, `src/bomb.js` carry it in code; the seventh and eighth occurrences are the two PROSE paragraphs in `src/web/app.js` and `src/web/assets.js` that W90 itself wrote |
| the palette block we ship covers `$400..$7FF`, the BACKGROUND third | **TRUE**, and `[M]` `$24133C` is where it is decided: `$80F086 -> $A00800` |
| **"the SPRITE palette has no cartridge source in this port at all"** | **TRUE OF THE BUNDLE AND MISLEADING ABOUT THE CARTRIDGE, AND THAT IS THIS WAVE.** `[M]` **31 of the 32 banks in the seed's own staging area match a 64-byte block in the cartridge EXACTLY**, and the eighteen the stage installs are named by a stream whose cursor is a longword in the seed. The colour was never missing; the code that copies it was |
| `$222A78`/`$222AB8` read white, through gold, to orange | **TRUE**, and `[M]` the two blocks are byte-identical for all 64 bytes, which W90 measured over eight words and stated over eight |
| bank 6 keeps whatever the 161-frame recording froze, a stage-title sepia | **TRUE.** `[M]` `$5EF3 $5EF3 $5EF3 $5EEF ...` = (189,189,156) with R = G |
| "this is not a bomb bug, every sprite on screen is currently coloured from a recording" | **TRUE, AND IT IS THE WHOLE SHAPE OF THE WAVE** |

### 0.1 AND A COMMENT THAT LIED, WHICH MAKES TEN

`docs/knowledge/02-traps.md`'s standing count is nine after W90 found two.
This wave found one more, in `src/background.js`, one line above the note the
brief sent me to replace:

> `src/background.js:723`: *"The 22-entry stage-1 stream ($26157A) holds 21
> `$22xxxx` data pointers and ONE code-segment address, `$246BB8` ... which
> disassembles as 64 zero bytes -- a zero prototype"*

`[M]` The count is right and the classification is **half of a pair**:
`$246BB8` is 32 x `$0000` (**BLACK**) and its neighbour `$246BF8`, which seven
OTHER sites name (the boss's bank `$12` among them), is 32 x `$7FFF`
(**WHITE**). They are the two endpoints `$24636C` and `$2463A6` fade the entire
79-bank palette to, not a zero prototype. Corrected in place with the old text
quoted, and pinned by `tools/export-tables.py PALETTE_CONST_BANKS` so it cannot
rot again.

---

## 1. WHAT `$24150A` IS -- and it is one of NINE

`[M]` `$24150A` is ten instructions, and reading it alone gets the shape wrong,
because `$24152E` follows immediately and is the same routine with an outer
`dbra`. There are **nine consecutive uploads** and they differ only in
destination, length and dirty flag:

```
[M] addr      dest                    length            flag
[M] $24150A   $80E886 + D0*64         16 longs = 1 bank  $80FA66
[M] $24152E   $80E886 + D0*64         (D1+1) banks       $80FA66
[M] $241556   $80E886 + D0*64          8 longs = lo half $80FA66
[M] $24157A   $80E886 + D0*64 + $20    8 longs = hi half $80FA66
[M] $2415A2   $80E886 + D0*64         (D1+1) WORDS       $80FA66
[M] $2415C4   $80F086 + D0*64         16 longs = 1 bank  $80FA68
[M] $2415E8   $80F086 + D0*64         (D1+1) banks       $80FA68
[M] $2414BE   $80F886 + D0*32          8 longs = 1 bank  $80FA6A
[M] $2414E2   $80F886 + D0*32         (D1+1) banks       $80FA6A
```

**AND NOTHING WRITES PALETTE RAM DIRECTLY.** `[M]` `$24133C`, called once a
frame from `$23C454`, is the only writer:

```
[M] $80E886 -> $A00000   2048 B   flag $80FA66   THE SPRITES     words $000..$3FF
[M] $80F086 -> $A00800   2048 B   flag $80FA68   THE BACKGROUND  words $400..$7FF
[M] $80F886 -> $A01000    480 B   flag $80FA6A   THE TEXT/HUD    words $800..$8EF
```

So `D0` IS the bank number (`lsl.w #$6` is what makes 64 bytes = 32 xRGB555
entries = one 5-bit bank), and the TX pair shifts by 5, so a text bank is
SIXTEEN entries. `[M]` **161 absolute-long call sites across the nine, 152 of
them `jsr $24150A`**; the full census with each site's bank and source block is
`.scratch/w91/sites.txt`.

---

## 2. THE FINDING: THE COLOUR WAS NEVER MISSING

`[M]` Every one of the 32 sprite banks in the shipped seed's staging area,
searched byte-for-byte against the 6 MiB decrypted image:

```
[M] 31 of 32 banks match a 64-byte block in the cartridge EXACTLY
[M] the one that does not is BANK 6 -- the stage-title card's, which the
    game FADES, so no static block equals it
[M] and the seed's $80E886 equals the capture's palette words $000..$3FF
    on 1024 of 1024 -- which is $24133C, end to end, on the board
```

**So the sprite palette is cartridge data that this port had no route to.** The
route is the stage's own object stream.

`[M]` `$2620DE` (op $00 SPAWN, already ported in `src/background.js`) walks a
6-byte-entry stream and hands each (pointer, bank) pair to `$24150A`. Stage 1's
is 22 entries at `$26157A` -- **and its first eighteen ARE the seed's staging
area**:

```
[M] entry  0..5   $2238B8 $223878 $2237F8 $223838 $2239B8 $223938 -> banks 10..15
[M] entry  6      $246BB8 (the BLACK bank)                       -> bank  24
[M] entry  7..13  $2252B8 $2243F8 $2242F8 $224338 $224438 $224378 $225278
                                                                 -> banks 25..31
[M] entry 14..17  $2244B8 $224478 $2245F8 $2244F8                -> banks 19..22
[M] entry 18..21  $224538 $223938 $224578 $2245B8    (later in the stage)
```

`[M]` and the seed's script-0 object cursor `$813196` is `$2615E6` =
`$26157A + 18*6`. **The seed says, in its own RAM, exactly which eighteen had
already run.**

---

## 3. WHAT WAS PORTED

`src/palette.js` (new): the three staging areas, the three dirty flags,
`$24150A`, `$24133C`, per-word PROVENANCE, `mergePalette` and `agreeWithBoard`.
`src/main.js` runs the flush at `$23C454`'s place in the loop. `$24150A`
executes from two families:

1. **`$2620F2`, the scroll VM's object stream** -- live, and replayed at boot
   for the consumed prefix (`catchUpObjectStream`). `[M]` 18 banks, 576 entries.
2. **`$260852`/`$26085C`, THE BOMB** -- bank 6, from `$222A78`/`$222AB8`.

The catch-up takes ONE integer from the recording (the cursor) and every byte of
colour from the cartridge. `[M]` its result is byte-identical to the staging the
seed carries -- 576 of 576 -- which is the model's own proof.

**Provenance is per word.** `mergePalette` starts from the capture and
overwrites only what a ported install sourced, so the thirteen banks nothing has
sourced stay visibly on the recording. The page prints `pal N/2560 cart banks
...` every frame.

---

## 4. NUMBERS (in progress)

---

## 5. WHAT IS STILL ON THE CAPTURE (in progress)

---

## LOG (appended as findings arrived)

- opened. Read 90, 39, `src/web/app.js`, `src/render/capture.js`,
  `src/web/assets.js`. Disassembled `$2412FE..$2415F0` (the whole upload family
  and the flush), `$260852`, `$24A764`, `$2620DE`, `$261FF2` before writing a
  line.
- `[M]` §1: **`$24150A` is one of NINE**, and `$24133C` is the only writer of
  palette RAM. Three regions, three flags, and the sprite third is `$A00000`.
- `[M]` §0: **"seven files" is SIX** -- the other two are W90's own prose.
- `[M]` §0.1: **`src/background.js` called `$246BB8`/`$246BF8` "64 zero bytes"**
  and they are BLACK and WHITE, the fade's two endpoints. Comment ten.
- `[M]` §2: **31 of the 32 seed banks match a cartridge block exactly**, and the
  eighteen the stage installed are the object stream's own first eighteen
  entries, with the seed's cursor saying so.
- `[M]` §3: ported. Catch-up 576/576 identical to the seed's staging; **576 of
  576 sourced entries equal the BOARD's palette RAM on all 161 recorded
  frames**; the bomb's bank 6 is `$FFFF $FFB6 ...` = white/gold/ORANGE.
