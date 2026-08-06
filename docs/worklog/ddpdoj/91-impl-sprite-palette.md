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
| `$24150A` is a COUNTED NOTE in seven files and has never been ported | **TRUE for the mechanism, and "seven files" is FOUR.** `[M]` at `HEAD~3`, exactly four files called `note(..., 0x24150a, ...)`: `src/initbody.js` (4 sites), `src/hud.js`, `src/stageend.js`, `src/background.js`. `src/bomb.js` counted the same upload under a DIFFERENT address (`$260852`/`$26085C`, its own call sites), `src/boss.js` names it in prose only, and the sixth and seventh occurrences are the two PROSE paragraphs `src/web/app.js` and `src/web/assets.js` that W90 itself wrote. The distinction matters to a reader grepping for it: **counting by note address finds four, and two of the misses are the bomb** |
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

## 4. THE NUMBERS

### 4.1 How much of the palette is the cartridge's

```
[M] AT BOOT, shipped seed:   576 of 2,560 palette words CARTRIDGE-SOURCED
[M]                          18 of 32 SPRITE banks (10..15, 19..22, 24..31)
[M] after a bomb:            608  (+ bank 6)                 -- 19 banks
[M] after 6,500 steps:       640  (+ bank 18, re-installed at scroll clock $E0)
[M] the OTHER 13 sprite banks and ALL of the background and text thirds
    are still the recording's, and the page prints which every frame:
      `pal 640/2560 cart banks 6,10,11,...,31 inst 25`
```

The background third is a separate story and unchanged by this wave: the
`$227E58` block has shipped since W14 as an ASSET and `[cited: W14, re-measured
by W90]` agrees with the board on 1020 of 1024 -- but `$2415E8` is still
unported, so the page draws it from the capture, not from the block.

### 4.2 THE BOARD AGREEMENT FOR THE SPRITE THIRD -- **576 of 576**

**This is the one thing on this page that can be compared against the board
directly**, and it is why this wave met condition 2 where W90 met it for
neither of its items. Palette RAM is in the checkpoint capture, so a colour the
port claims can be checked entry for entry without an emulator.

```
[M] sourced sprite entries at the seed instant             576
[M] ...equal to the BOARD's own $A00000 entry              576   (100.00 %)
[M] ...on how many of the 161 recorded frames             161 of 161
[M] worst frame                                             0 (all identical)
```

`[M]` The comparison is run on ALL 161 frames rather than on frame 0 because a
single-frame check would sit where two readings agree: the sprite third is
CONSTANT across the recording (`[M]` 0 of its 1,024 words ever change, against
the background's four in bank 21). Asserted by `tools/webgate.mjs`.

**AND WHAT THAT FIGURE DOES NOT PROVE, stated because it is the weakness a
reader should find here rather than later.** 576/576 says the port's palette
equals the board's. It does NOT by itself distinguish cartridge bytes from the
seed's own staging bytes, because those are equal too -- that equality is the
whole finding. What makes the claim "cartridge" rather than "recording" is
structural and checkable elsewhere: `install24150A` is handed
`rom.bytes(ptr, 64)`, `src/rom.js` THROWS BY ADDRESS outside the declared
windows, and `[M]` mutating the source pointer by one block drops the same
figure to 41 of 544 (§4.4).

### 4.3 WHAT VISIBLY CHANGED, AND THE ANSWER IS "ONLY THE BOMB"

`[M]` merged palette vs the recording's, word for word:

```
[M] AT BOOT                     576 sourced, words DIFFERING from the capture   0
[M] AFTER ONE BOMB              608 sourced,                                   31
[M] AFTER 6,500 steps, 7 bombs  640 sourced,                                  121
                                (banks 6, 18, 19, 20)
```

**So nothing else on screen changed colour, and that is the result rather than a
disappointment.** The eighteen banks the catch-up sources are byte-identical to
what the recording supplied, so the ship, the tanks, the terrain and the bullets
look exactly as they did. What changed is PROVENANCE: 576 entries that used to
have no source now have one, and `capture.bin` -- whose removal is the formal
definition of done -- is 576 entries closer to being unnecessary.

The 121 that differ after 6,500 steps are bank 6 (the bomb) plus banks 18/19/20,
which the scroll VM re-installs at clocks `$00E0` and `$0140`, well past
anything the 161-frame recording reached. Those are the port being RIGHT where
the recording has nothing to say.

### 4.4 EVERY CHECK, SEEN TO FAIL

**The exporter** (`check_palette_upload_family`, new, runs on EVERY export),
nine mutations, each stopping the build with a named message:

```
[M] the shift claim lsl#6 -> lsl#5   "$241514 is $ED48, not $EB48. That shift
                                      IS the bank size..."
[M] BG flushes to $A00000            "...**THIS IS THE ADDRESS THAT SAYS WHICH
                                      THIRD OF PALETTE RAM A REGION IS**, and
                                      getting it wrong is exactly the defect
                                      W90 found in src/web/app.js"
[M] SPRITE dirty flag is the BG's    "$24133C is not `tst.w $80FA68` -- ..."
[M] midboss bank $10 -> $11          "$26B4D2 passes D0 = 16, not $11 ..."
[M] bomb block $222A78 -> $222AB8    "$260852 is not `lea $222AB8.l,A0` ..."
[M] $246BF8 claimed BLACK            "...should be 32 x $0000 and it is
                                      ['$7FFF']"  <- the OLD comment's claim
[M] stream length 22 -> 21           "...has 22 entries, not 21"
[M] the per-stage pair table moved   "...$261824 has 26 entries, not 22"
[M] the colour window short by $880  "type $31's first install ... reads the 64
                                      bytes at $2251B8, which do not fit inside
                                      the DECLARED window [$222A78, $224A78)"
```

**THE NINTH ONE WAS GREEN THE FIRST TIME AND THAT IS WHY IT IS LISTED NINTH.**
Shortening the window left the check passing, because the bound `$2252F8` was
typed in the check AS WELL AS in `SHOT_WINDOWS` -- a constant written twice is a
check that cannot fail on one of them. The check now DERIVES its bound from the
declaration, and only then did the mutation redden. Red-validation found a
defective check, which is the entire argument for doing it.

**In `tests/w91palette.test.js`**, twelve tests, nine mutations of
`src/palette.js`, every one reddening a DISTINCT set:

```
[M] src/palette.js at HEAD~1                       (the file does not exist)
[M] the BACKGROUND flushes over the SPRITES        W91/3 alone
[M] $24150A shifts by 5 instead of 6               W91/1 /5 /6 /7 /8
[M] the install does not set the dirty flag        W91/1 /5 /6
[M] the flush does not clear the dirty flag        W91/4 alone
[M] the flush claims EVERYTHING it copied sourced  W91/5 /6   <- the provenance
[M] the bank index is not checked                  W91/2 alone
[M] the catch-up runs ONE PAST the cursor          W91/7 /8
[M] a malformed cursor is replayed, not thrown     W91/9 alone
[M] mergePalette overwrites the WHOLE palette      W91/6 alone
```

**In `webgate`**, three new stages and their mutations:

```
[M] PASS: W91 THE SPRITE PALETTE -- 18 entries consumed (expect 18), 576 of 576
    identical to the seed's staging, 576 of 576 equal to the BOARD on all 161
    recorded frames
[M] PASS: W91 THE BOMB'S COLOUR -- bank 6 is $FFFF (255,255,255) and $FFB6
    (255,239,181) against the recording's $5EF3 (189,189,156)
[M] PASS: W91 --break palCatchUp:false -- 0 sourced words at boot from 0
    installs, which IS the page before this wave
[M] SEEN TO FAIL: the catch-up reading the NEXT block for every entry ->
    "wrote 41 of 544 ... equal the BOARD'S OWN PALETTE RAM on 41 of 544"
[M] SEEN TO FAIL: every entry one bank too high -> "165 of 576 ... 41 of 576"
[M] SEEN TO FAIL: the LASER bomb installing type $24's block -> "its first two
    entries are $E7FF (206,255,255) and $CFFF (156,255,255)"
```

`[M]` A fourth webgate mutation -- deleting the `catchUpObjectStream` call
outright -- could not be made to produce a clean red because it broke the module
and the gate never reached the stage. **The `palCatchUp:false` break is the same
condition expressed as a supported option and it PASSES showing 0 sourced
words**, which is the pre-wave state made visible rather than inferred.

### 4.5 The gates

```
[M] node --test games/ddpdoj/tests/     1,047 pass, 0 fail, 0 skipped
                                        (1,035 before; +12 w91palette)
[M] node tools/seedcmp.mjs --quiet      9 green / 19 red / 43 blocked,
      --manifest .../w69/stage1-sweep   6,750 logic frames, 0 seedbad, 0 error
                                        -- IDENTICAL to W90's
      BUCKET 2: 20,785 records, 0 MISSING, ordered subsequence 6,750/6,750
[M] node tools/webgate.mjs              GREEN, exit 0, 24 stages (21 before)
[M] python tools/oracle/pgm.py check    VERDICT: FAILURES -- 72 passed,
                                        2 failed, 0 SKIPPED  (SEE 4.6)
[M] node tools/build-dist.mjs           GREEN, 6 deliberate exceptions,
                                        NO SEVENTH `PUBLISH_VERBATIM` ENTRY
[M] node tools/publish.mjs --only ddpdoj --dry
      GREEN. build 20260806063618, dist/ 256 files 6,523 KB, rom-leak guard
      252 files checked against 12 ROMs -- clean, six deliberate exceptions
```

**NO GATE MOVED, and there is a reason it could not.** This wave writes exactly
three things: staging bytes in `$80E886..`, the three dirty flags, and a JS-side
array nothing in the simulation reads. `[M]` the staging bytes the catch-up
writes are IDENTICAL to the ones the seed already carries (576/576), and `[M]`
the seed's three dirty flags are already 0. And four independent record censuses
in `webgate` are byte-identical to their pre-wave baselines -- **W44 20,794,
W58 12,805, W66 5,948, W86 17,047, W90 17,286** -- so this wave emitted no
display-list record and lost none.

**RECORDS LACKING ART: I COULD NOT RUN W90's INSTRUMENT AND I SAY SO RATHER
THAN SUBSTITUTING MINE.** `.scratch/w86/noart.mjs`, which W90 §1.6 reports
4,017 from, is not in this tree. `[M]` my own census over 6,500 steps with fire
tapped every four frames reports **records 503,866, drawn 503,279, NO ART 587,
distinct missing 17** -- and that is NOT the same number as 4,017 because it is
not the same route, which is precisely the mistake W90 §1.6 warns about. The
comparable claim is the one above: no record moved on any of five gated windows.

### 4.6 `pgm.py check`: 72 / 2 / 0, AND THE TWO ARE THE OLD TWO

`[M]` The verdict is **72 passed, 2 failed, 0 SKIPPED** -- the baseline W90 left.
`[M]` One of the two is `segment sweep` (43 blocked + 19 red rungs), reported
verbatim as `fly-around:PASS stage1-laser-hold:FAIL stage1-play:FAIL
stage1-sweep:FAIL`; the other is `THE LASER BOMB: $249A80, $255FE2 and $2456A6`,
which `[cited: W79 §6.5]` filed as a concurrent wave's and W84, W85, W86 and W90
each re-established. **NO THIRD RED, AND NO GATE WAS RE-BASELINED BY THIS WAVE.**
W90 had to re-baseline two and wrote §1.7 about it; this wave changed no number
in any gate file, which is the consequence of §4.5's argument.

---

## 5. WHAT IS STILL ON THE CAPTURE, AND EXACTLY WHAT EACH NEEDS

**1,920 of the 2,560 palette words are still the recording's**, and they are:

| region | words | why |
|---|---:|---|
| **13 SPRITE banks: 0..9, 16, 17, 23** | 416 | their installers are ported nowhere. §5.1 |
| **the BACKGROUND third** | 1,024 | `$2415E8` is unported. The BLOCK is shipped and checked at 1020/1024; nothing uploads it |
| **the TEXT/HUD strip** | 240 | `$2414BE`/`$2414E2` are unported; the HUD is the recording's anyway |
| **words $8F0..$9FF** | 256 | never written by any of the three flush copies on the board either |

### 5.1 The thirteen sprite banks, and the call site each one needs

`[M]` from the census in `.scratch/w91/sites.txt`, the sites that would source
them, all of which the port REACHES as counted notes today:

```
[M] banks 0, 1     $24A764/$24A772  <- $222878 / $2228F8   THE PLAYER's own
[M] bank 19        $296FC6          <- $222BF8   enemy type $24's init body
[M] two banks      $269792/$2697A8  <- $2251B8 / $2250B8   type $31, bank from
                                                  $2697B0[$813094]
[M] banks 16,17,15 $26B4D2/E2/F2    <- $223338 / $223378 / $2233B8  the MIDBOSS
[M] banks 21,22,23,18,17
                   $29274E..$29278E <- $222B38 / $222B78 / $222BB8 /
                                       $246BF8 / $222C38   THE BOSS
[M] banks 7, 8     $284878/$284888  <- $2250B8 / $2250F8   the stage BANNER
[M] bank 23        $28D7D6          <- $81DF6C   A FADE: $246292 transforms 32
                                       words into RAM and then installs them
[M] bank 11        $25C896          <- $812FC4   the other RAM-sourced install
```

**WHY THEY ARE NOT IN THIS WAVE, and it is plumbing rather than analysis.** The
four enemy/boss bodies sit at the end of a positional call chain
(`enemies.js` -> `runSpawnWalker` -> `dispatchScriptRecord`/`processDeferred` ->
`spawnEnemy` -> `runInitBody` -> `runInitBodyAddr` -> the body), and the
`PaletteState` would have to be appended to six signatures the way W31 appended
`tables`. That is a mechanical change across four files with no measurement in
it, and doing it in the same wave as the mechanism would have made a red
impossible to attribute. Every one of those sites is CHECKED against the
cartridge already (`PALETTE_SITES`), so the next wave has the bank, the source
block and the address for each, and its only work is the seam.

### 5.2 AND THE BRIEF'S THIRD QUESTION, ANSWERED: **THE SPRITE SIDE HAS AN ANIMATED-ENTRY EQUIVALENT, AND IT IS NOT WHERE THE BACKGROUND'S IS**

The brief asked whether the sprite third has an equivalent of the background's
four animated entries before this could be called done. `[M]` It does, and there
are TWO of them, and neither is what the background's is:

* `[M]` **`$241404..$2414BC` -- the BACKGROUND fade -- is inside `$24133C`
  itself**, after the third region copy: `cmpi.w #$0,$813092` and
  `cmpi.w #$130,$8130CE` gate it, and it transforms `$80F086+$540` into
  `$A00800+$540` through `$246292` with a level in `$80FA6C` that ping-pongs
  between `$18` and `$3C` under `$80FA6E`. `$540/2 = 672 = 21*32` --
  **that IS bank 21 pens 0..3**, the four entries W14 and W90 both measured and
  neither located. It is now located, to the instruction, and it is **still
  unported**: `src/palette.js`'s `flush24133C` stops at the third region copy
  and says so.
* `[M]` **The sprite side's equivalent is `$28D7D6` and `$25C896`**, which
  install a bank from RAM (`$81DF6C`, `$812FC4`) that `$246292` has just written
  -- the same transform, driven from a different place. `[M]` neither fires in
  6,500 steps of stage-1 flight.

**So: the sprite third has no ANIMATED entry in stage-1 flight, and the two
routines that would animate one are named.** That is the check the brief asked
for, done rather than assumed, and it is the reason 576/576 holds on all 161
frames instead of on one.

### 5.3 The rest

1. **`$2415E8` is unported**, so the background palette is still drawn from the
   capture even though its block has shipped since W14. Two lines and a window
   that already exists; not done here because it is the background third and
   this wave's subject was the sprite third.
2. **`$24152E`, `$241556`, `$24157A`, `$2415A2`, `$2415C4`, `$2414BE`,
   `$2414E2` are documented and NOT implemented.** Nothing the port reaches
   calls them; a routine ported on the strength of a table is dead code, and the
   table is checked instead.
3. **One input, and a poked one.** Every census here is one route with
   `$810424` held; `docs/knowledge/09` governs. Every count is a floor.
4. **The ordinary bomb's fade still draws on alternate frames** `[cited: W90
   §2.5]`. Measured there, unchanged here, still an owner decision.

---

## 6. **THE BAR -- WHICH CONDITIONS I DELIVERED**

### 6.1 **FEATURE COMPLETE: MET.**

`[M]` `python .scratch/w91/browser.py 8891 40` -- a `http.server` over the
working tree, the real Chromium `playwright` installed, fire HELD for the whole
run so the LASER bomb arm is taken, three bombs dropped. Every sample reads the
port's own palette state through `window.__mixup` AND measures the canvas.

**WHAT COLOUR IS THE BOMB.** `.scratch/w91/w91-bomb1-1.png`: **a column of fire
from the ship to the top of the playfield -- deep orange-red at the edges, a
yellow-white core, and a burst of orange at the muzzle.** The same statistic
W90 reported, the brightest decile of the lit pixels:

```
                            R    G    B    chroma
[M] W90, BEFORE the wave   199  198  164     49     R = G
[M]                        219  204  148     74
[M]                        228  221  185     60
[M] W91, before the bomb   208  200  178     30     R = G, the same picture
[M] W91, BOMB 1            245  219  138    107     R > G > B
[M]                        245  226  152     93
[M]            BOMB 2      236  227  162     74
[M]                        242  229  159     83
[M]            BOMB 3      245  214  120    125
[M]                        244  205  115    129
```

**R was equal to G and is now 40 to 130 above B with G between them. That is
"bright orange with yellowish highlights", and it is the cartridge's own eight
words read through the cartridge's own routine.**

```
[M] the port's bank 6 during a bomb   FFFF FFB6 FF91 FF6C FF48 FEE7 FE87 FE04
[M] the recording's                   5EF3 5EF3 5EF3 5EEF 5EEE 5EAE 5E6E 5E6E
[M] the page's own status line        pal 640/2560 cart banks 6,10,...,31 inst 25
[M] PAGE ERRORS: one 404, and it is the favicon
```

**WHAT ELSE CHANGED COLOUR: NOTHING, AND IT IS MEASURED (§4.3).** Zero words
differ from the recording before a bomb. The 576 entries that changed hands
changed provenance, not appearance.

### 6.2 **ORACLES PERFECTLY: MET, for the first time on this subject.**

`[M]` **576 of 576 cartridge-sourced sprite palette entries equal the board's
own palette RAM, on all 161 recorded frames.** §4.2, with the limitation of that
figure stated there and the mutations that collapse it to 41 in §4.4.
`[M]` `seedcmp` -- the wider board comparison -- is byte-identical before and
after: 9 green / 19 red / 43 blocked, 6,750 frames, bucket 2 20,785 records 0
missing.

**AND WHAT IS STILL NOT COMPARED.** Bank 6, the bomb's, is DELIBERATELY the one
sourced bank that disagrees with the capture, because no bomb was dropped in the
161 recorded frames -- so the colour the owner asked about is the one colour on
this page that a board comparison cannot confirm. It is confirmed against the
CARTRIDGE (`$222A78`/`$222AB8`, checked at export) and photographed in a
browser, and that is a weaker claim than 576/576, stated as one.

---

## 7. WHAT I TOUCHED, AND WHAT I DID NOT

* `games/ddpdoj/src/palette.js` -- NEW. The whole subsystem.
* `games/ddpdoj/src/main.js` -- `this.palette`, the catch-up, `$23C454`'s flush.
* `games/ddpdoj/src/background.js` -- op $00's install, and comment ten.
* `games/ddpdoj/src/bomb.js` -- `installBombPalette`, both heads.
* `games/ddpdoj/src/web/app.js`, `src/web/assets.js` -- the merge, the status
  fields, and W90's two paragraphs brought up to date.
* `games/ddpdoj/index.html` -- `pal N/2560 cart banks ...` on the status line.
* `games/ddpdoj/tools/export-tables.py` -- two windows and
  `check_palette_upload_family`.
* `games/ddpdoj/tools/webgate.mjs` -- three W91 stages.
* `games/ddpdoj/tests/w91palette.test.js` -- new, 12 tests.

Not touched: `publish.mjs`, `bundlegate`, `build-dist.mjs`, the ROM leak guard,
`PUBLISH_VERBATIM`, `boarddl.mjs`, `seedcmp.mjs`, `portdiff.mjs`,
`midbossgate.mjs`, `w62stageendgate.mjs`, any other gate's expected numbers,
`src/` (the Game Boy tree), `games/gradius/`. **No frame cadence and no drawing
order was changed anywhere, and no colour was typed in.**

**THE WEB SERVER.** `.scratch/w91/browser.py` starts a `socketserver` on
127.0.0.1:8891 and calls `httpd.shutdown()` and `httpd.server_close()` in a
`finally`; the run log prints "server closed" and `netstat` shows no listener on
8891.

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
