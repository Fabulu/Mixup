# 93 -- IMPL: the text strip, its witness, and the painter that was already ported

status: **DONE** -- §0 checks the brief and **three of its statements are
wrong, one of them mine**; §1 is the finding a reviewer should read first
(`$26C20C` has been ported since W57 and the manifest said otherwise); §2 is
the text strip and the WITNESS that justifies it; §3 is **the nine sprite banks,
refused, with the proof**; §4.1 is the palette ledger by third; §4.2 is the
board agreement and what it cannot prove; §4.4 is every check seen to fail;
§6 is which bar condition I met per part.

started: 2026-08-06. wave: 93. role: IMPLEMENTER.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B.

`[M]` = measured by me, this session, on this tree. Anything from another
document is `[cited]` and named.

inputs read in full: `92-impl-palette-finish.md`, `91-impl-sprite-palette.md`,
`39-OWNER-visible-play-before-sound.md`, `games/ddpdoj/src/palette.js`,
`games/ddpdoj/src/handlers.js` (the W57 and W36 blocks),
`games/ddpdoj/src/main.js`, `games/ddpdoj/tools/export-web.mjs` `secondMap`,
`games/ddpdoj/tools/midbossgate.mjs`, `docs/knowledge/02-traps.md`.

---

## 0. THE PREMISE, CHECKED FIRST -- and one of the wrong statements is MINE

| the brief / a document says | `[M]` verdict |
|---|---|
| **`$26C20C` "THE PAINTER IS UNPORTED: nothing in this bundle draws these yet ... what spawns type `$1C` is named-not-found"** | **BOTH HALVES FALSE, AND HAVE BEEN SINCE W57.** §1 |
| ...and it paints "into ring columns 47 onward (or 41 when `$803926` is 0)" | **INVERTED.** `[M]` `$26C226 lea $9000BC,A0` runs FIRST and `$26C232 beq` SKIPS the `$9000A4` load, so `$803926` = 0 gives column **47** and NON-zero gives 41. `$803926` is 0 through all of stage-1 play, so the arm the note called the exception is the only one that ever runs |
| `$2605C8` cannot be wired because its entry cannot be named | **TRUE WHEN W92 WROTE IT, AND I REPRODUCED THE WRONG ANSWER BEFORE FINDING THE RIGHT ONE.** §0.1 |
| W92's ledger: 1,600 of 2,560, sprites 576, background 1,024, text 0, plus 272 never-sourceable | **TRUE**, re-run and reproduced exactly on this tree |
| board agreement 1,024 of 1,024 across 160 stepped frames | **TRUE**, re-run: LAG 1 1024/1024 (fade 640/640), LAG 0 1020/1024, LAG 2 1020/1024 |
| `pgm.py check` means `games/ddpdoj/tools/oracle/pgm.py`; the other one exits 0 silently | **TRUE AND WORTH REPEATING.** `[M]` `python tools/pgm.py check` prints NOTHING and exits 0 |
| `.scratch/w69/stage1-sweep` does not exist | **TRUE.** `[M]` the ladder in this tree is `games/ddpdoj/.scratch/w85-ladder-backup/stage1-sweep` |
| **`.scratch/w86/noart.mjs` "is not in this tree"** (W91 §4.5 and W92 §4.5 both) | **FALSE, AND IT HAS BEEN THERE ALL ALONG.** `[M]` it is at `games/ddpdoj/.scratch/w86/noart.mjs`. Both waves looked in the REPO-ROOT `.scratch/` and this project has two |
| "comments in this codebase have lied ELEVEN times" | **NOT A COUNT THAT CAN BE MAINTAINED, and `docs/knowledge/02-traps.md` says so in as many words**: "Do not increment this by claiming 'the Nth incident' ... An ordinal maintained in two places is not a count. Either build one canonical list, or say 'again' and describe the shape." So this wave says AGAIN and describes the shape (§1) |

### 0.1 THE MEASUREMENT I GOT WRONG, AND IT WOULD HAVE COST TEN BANKS

W92 §5.2 refused ten text banks because `$2605C8`'s caller "is a `bsr` I did not
chase". `[M]` I chased it and reported, in the first version of this file, that
**`$2605C8` has ZERO references in the entire 6 MiB image** -- no `jsr.l`, no
`jmp.l`, no `bsr.w`, no `bra.w`, no `jsr (d16,PC)`, no longword `$002605C8` at
any byte offset even or odd, and none with low 20 bits `$605C8`. That scan was
real and it was **WRONG BY ONE OPCODE FAMILY: it did not include the CONDITIONAL
BRANCHES.** There is exactly one reference and it is a `beq.w`:

```
[M] 260794  tst.b    $2(a5)
[M] 260798  beq.w    $2605C8        <- the ONLY reference, and 6700 is not 6100
[M] 26079C  cmpi.b   #$2,$2(a5)
[M] 2607A2  beq.b    $260788        <- state 2, the teardown
[M] 2607A4  jsr      $25FF7A(pc)    <- state 1, the per-frame body
```

**I had written the refusal paragraph before I found this.** Had I stopped at my
own scan, this wave would have shipped 80 text words instead of 160 and would
have recorded a routine as unreachable that runs every stage. The lesson is the
one `docs/knowledge/09` already states and it is worth stating from the other
side: an enumeration is only as good as its alphabet, and "I searched the whole
image" is a claim about the SEARCH, not about the image.

---

## 1. `$26C20C` WAS PORTED FIVE WAVES BEFORE THE NOTE THAT SAID IT WAS NOT

The brief's Part 2 is "port the painter, and find what spawns type `$1C`", and
it quotes the manifest:

> "THE PAINTER IS UNPORTED: nothing in this bundle draws these yet, and shard 7
> therefore ships pixels no frame currently asks for. What spawns type `$1C` is
> named-not-found (recon §8.5)."

`[M]` **Every clause of that is false, and was false when it was written:**

* `[M]` `src/handlers.js handler1C` is a full transcription of `$26C20C`, in the
  `HANDLERS` map at key `0x26c20c`, with a 40-line header. `src/main.js #ctx`
  threads `vram` to it specifically, saying so.
* `[M]` what spawns type `$1C` **is named**: `$26B7E0`/`$26B7E2`, the MIDBOSS
  DEATH, and `src/midboss.js:730` executes that enqueue
  (`enqueueDeferred(ram, 0x1c, ...)`).
* `[M]` `tools/midbossgate.mjs` has asserted the whole thing since W57 and it
  passes on this tree, unmodified:

```
[M] ok  type $1C ($26C1C2/$26C1CA) is LIVE from lf3775 (expect 3775)
[M] ok  and frees itself at lf4277 (expect 4277) -- $26C20C cmpi.w #$105,$8130CE
[M] ok  $26C20C painted 207 map longwords (expect 207 == 23 x 9)
[M] ok  into ring columns [0,1,2,3,4,5,47,...,63] -- the $26C25A andi.w #$FF WRAP
```

So the answer to "what spawns type `$1C`" was in `src/handlers.js`'s own W36
header, in `src/midboss.js`, and in a gate, and the note that said it was
not-found was written after all three. **Grepping our own source before
disassembling, which the brief asks for, is what found this in four minutes.**

### 1.1 AND IT DRAWS -- MEASURED ON THE PORT, NOT INFERRED FROM THE GATE

`[M]` `.scratch/w93/smap.mjs` runs the port 5,000 steps with fire held and
`$810424` poked (the same intervention `midbossgate` uses), captures every
`BgVram.setLong`, and attributes the bursts:

```
[M] the midboss dies at lf3834
[M] 503 CONSECUTIVE FRAMES write >= 100 map longwords -- lf3770 to lf4272
[M] and every one of them writes exactly 207
[M] distinct ring columns touched in that window: 0..7 and 47..63
[M] distinct TILE numbers the second map names: 257
[M] tiles SHIPPED in this bundle (shardOfTile >= 0, complete at boot): 257 of 257
[M] the shards they live in: 1, 2 and 7
```

**So the frames after the midboss dies ask for shard 7's pixels on 503
consecutive frames**, and the manifest said no frame ever would. The note is
corrected in place in `tools/export-web.mjs` with the old text quoted, for the
reason `docs/knowledge/02-traps.md` gives: a stale comment is worse than no
comment, because it is believed. This is the shape AGAIN, not an ordinal.

**WHAT PART 2 THEREFORE COST, AND WHAT IT DID NOT.** No port code was written.
The painter did not need porting and the spawn did not need finding; a note
needed correcting and a claim needed measuring. That is a smaller result than
the brief expected and it is the true one.

---

## 2. THE TEXT STRIP -- 160 OF 240 WORDS, ON TWO WARRANTS AND NOT ON A BYTE MATCH

`[M]` all 27 absolute-long `$2414BE`/`$2414E2` sites in the image
(`.scratch/w93/txsites.py`), grouped by the bank they install:

```
[M] bank 0   $23BF8E($222638) $25A80E($222638) $25A92C($222638) $25A9A2($222618)
[M]          $25AC10($222618) $25C9AE($222618) $25CDCE($222618) $26056C($222618)
[M]          $2605DC($222638) $28F394($222638)
[M] bank 1   $23BF9C($222658)  $2605EA($222658)
[M] bank 2   $23BFAA($222678)  $2605F8($222678)
[M] bank 3   $23BFB8($222698)  $260606($222698)
[M] bank 4   $23BFC6($2226B8)  $260614($2226B8)
[M] bank 5   $260622($2226D8)      bank 6  $260630($222778)
[M] bank 7   $26063E($222798)      bank 8  $26064C($2227B8)
[M] bank 11  $26065A($2227D8)      bank 12 $25C600($2227F8)  -- does NOT match
[M] bank 13  $288590($222818)
[M] bank 9   NO SITE ANYWHERE.  banks 10, 14 NO SITE ANYWHERE.
```

### 2.1 WARRANT ONE: THE RESET PATH, and the answer does not depend on it

`[M]` `$23BF86..$23BFCC` is five `lea/moveq/jsr $2414BE` with **no branch
between them**, inside `$23BEEA` -- the routine both `$23B7D8` (cold boot,
`$803908 := 0`) and `$23B7F2` (warm, `:= 1`) `jmp` to, each having just set
`A7 = $820000`. The machine cannot be mid-stage-1 without having run it.

**AND THE STRONGER PROPERTY, which is the one that makes this not a byte
match.** Banks 1..4 have exactly TWO installers in the whole image and **both
name the same block**, so no ordering of them produces a different answer. Bank
0 has ten installers naming two different blocks -- and `[M]` **`$222618` and
`$222638` are byte-identical for all 32 bytes**, so that ambiguity is not
observable either. The claim is not "the seed's bytes match this block" but
"every code path in the cartridge that can write this bank writes these bytes",
which no later overwrite can falsify.

### 2.2 WARRANT TWO: `$2605C8`, AND THE SEED'S OWN RAM WITNESSES IT

The chain, every link with its disassembly:

```
[M] 23BFDC  the main loop; its third call is `jsr $2410BC.l`
[M] 2410C4  lea $80E240,A5 / moveq #$13,D0        <- 20 slots of $50 bytes
[M] 2410CC  move.w (A5),D1 / beq / andi.w #$FF,D1 / lsl.w #$3,D1
[M] 2410DA  lea ($240F62,PC),A0 / movea.l (A0,D1.w),A0 / jsr (A0)
[M] $240F62 is 20 entries of 8 bytes {handler.l, priority.w, $0000}
[M]   ...and entry $0A ($240FB2) is $260794, priority $001F
[M] 260798  beq.w $2605C8                          <- §0.1
[M] 2411AE  clr.w $2(A0)  in the allocator $241182  <- STATE := 0
[M] 2605C8  move.b #$1,$2(a5)                       <- and only THIS makes it 1
```

`[M]` **the shipped seed's `$80E240` slot array, slot 0:**

```
[M] word $800A    ACTIVE ($8000) and TYPE $0A
[M] $2(a5) $01    THE STATE BYTE -- and $01 is not $00
[M] $4A(a5) $001F the priority, EQUAL to $240F62[$0A]'s own word
```

**So the seed records, in its own RAM, that `$2605C8` executed** -- exactly the
way `$813196` records how far the object stream's cursor had advanced (W91 §2).
That is a STRONGER warrant than `catchUpBgPalette`'s, which has no seed witness
at all and rests on a stage index.

`[M]` and the result agrees: all ten banks are byte-identical to the seed's
staging, **160 of 160 words**.

### 2.3 THE DISCRIMINATOR, stated as a number so it can be argued with

W92's rule was right and this wave keeps it. What separates `$2605C8` from the
routines W92 refused is not that its bytes match -- theirs did too -- but **how
many of the routine's OWN installs the seed agrees with**, plus a witness:

```
[M] $2605C8   10 of 10 installs agree with the seed    + a seed WITNESS
[M] $23BF86    5 of  5                                 + the RESET PATH
[M] $24A764    1 of  2   (sprite banks 0 and 1)        no witness
[M] $25BE72    2 of  5   (sprite banks 0..4)           no witness
```

A routine that ran and was not overwritten agrees on all of its installs. One
that agrees on some is either a coincidence or was partly overwritten, and in
neither case may it be replayed at boot.

### 2.4 WHAT IS **NOT** TAKEN, and it is 80 words

```
[M] bank 9  ($2226F8)  NO installer anywhere in the image at all
[M] bank 13 ($222818)  one, $288590, whose reachability I did not establish
[M] banks 10, 12, 14   ZERO in the seed. Bank 12's only site ($25C600 <-
                       $2227F8) does NOT match, so that install never ran.
                       They are zero because $2412FE zeroed them and nothing
                       wrote them since -- a CODE-sourced zero, not a cartridge
                       block, counted as UNSOURCED rather than claimed
```

### 2.5 AND `$2412FE`, WHICH IS DELIBERATELY NOT REPLAYED

`[M]` `$2412FE` is `lea $80E886,A0 / move.w #$8F5,D0 / move.w #$0,(A0)+ / dbra`
-- 2,294 words = `$80E886..$80FA71`, **all three staging areas and the fade
state**. Boot calls it at `$23BF38`, before the text installs. The port must NOT
run it: the port arrives after every install the board made, so clearing here
would erase the five text banks and nine sprite banks still taken from the
recording and replace visible colour with black.

`[M]` and its tail is worth recording because it confirms W92 §0.2 from the
other end: `$241310 move.w #$101,$80FA70` (**the frame divider, reload 1**),
`$241318 move.w #$1,$80FA6E` (the step) and `$241320 move.w #$20,$80FA6C` (the
level -- **exactly the identity** W92 measured).

---

## 3. THE NINE SPRITE BANKS -- REFUSED, AND THE REFUSAL IS A PROOF

`[M]` every `$24150A`/`$24152E`/`$241556`/`$24157A`/`$2415A2` site in the image
with its source, **PC-relative `lea` included** (`$41FA`, which my first scan
also missed and W92's `back()` did not read either), against the seed's own
`$80E886`:

```
[M] bank 0  seed == $222878.  $24A76C leas it -- MATCH
[M] bank 1  seed == $2259B8.  $25BE8C leas it -- MATCH
[M] bank 3  seed == $246C38/$25BAEC.  $25BEAA leas $25BAEC -- MATCH
[M] bank 2  seed == $222978.  NO site anywhere leas it
[M] bank 4  seed == $2229F8/$222A38.  NO site
[M] bank 5  seed == $2243B8.  NO site
[M] bank 7  seed == $225138.  NO site  (sites lea $2254B8 / $2250B8)
[M] bank 8  seed == $225138.  NO site  (sites lea $225878 / $2250F8)
[M] bank 9  seed == $225078.  NO SITE PASSES BANK 9 AT ALL
```

**SIX OF THE NINE HAVE NO CODE PATH TO NAME.** The bytes are in the cartridge
and nothing in the cartridge ever puts them in that bank.

**AND THE THREE THAT DO CANNOT BE REPLAYED EITHER**, because the routines they
sit in are straight-line and contradict the seed on their other installs:

```
[M] 24A764  lea $222878,A0 / moveq #$0,D0 / jsr $24150A   <- seed AGREES
[M] 24A772  lea $2228F8,A0 / moveq #$1,D0 / jsr $24150A   <- seed has $2259B8
[M] 24A78C  rts

[M] 25BE72  lea $2259F8,A0 / #$0 / jsr $24150A            <- seed has $222878
[M] 25BE82  lea $2259B8,A0 / #$1 / jsr $24150A            <- seed AGREES
[M] 25BE92  lea $222838,A0 / #$2 / jsr $24150A            <- seed has $222978
[M] 25BEA2  lea ($25BAEC,PC),A0 / #$3 / jsr $24150A       <- seed AGREES
[M] 25BEB0  lea ($25BB2C,PC),A0 / #$4 / jsr $24150A       <- seed has $2229F8
[M] 25BEBE  rts
```

**NO ORDERING OF THESE TWO PRODUCES THE SEED**, and that is the proof rather
than an impression:

* if `$25BE72` ran last, bank 0 would be `$2259F8`. It is `$222878`.
* if `$24A764` ran last, bank 1 would be `$2228F8`. It is `$2259B8`.
* restoring bank 1 afterwards means running `$25BE72` again, which puts bank 0
  back to `$2259F8`. It is not.

So the seed's nine sprite banks are the sediment of installs whose source
address is not a static `lea` anywhere in the image. **They stay on the
recording, they are named per bank on the page and here, and this wave refuses
them.** Broken and declared beats fabricated, and this is exactly the spot the
brief said fabricating would be invisible: the bytes match, the picture would
have looked identical, and the provenance claim would have been false.

---

## 4. THE NUMBERS

### 4.1 THE PALETTE LEDGER, BY THIRD

```
[M] AT BOOT, shipped seed:   1,760 of 2,560 palette words CARTRIDGE-SOURCED
[M]                             sprites      576 of 1,024   (18 of 32 banks)
[M]                             background 1,024 of 1,024   (ALL 32 banks)
[M]                             text         160 of   240   (10 of 15 banks)
[M]                             $8F0..$9FF     0 of   272  -- NEVER sourceable
[M] after 160 steps:         1,792   (+ sprite bank 18, the scroll VM's)
[M] after a stage-1 flight:  1,888   (the page's own status line, §6.1)
[M] W92 left it at:          1,600 / 1,760
```

`[M]` **the page's own status line, read out of Chrome's DOM at lf8913:**

```
pal 1888/2560 cart [spr 704/1024 bg 1024/1024 tx 160/240] banks 10,...,31 inst 49
```

### 4.2 THE BOARD AGREEMENT -- **160 OF 160, AND WHAT IT CANNOT PROVE**

```
[M] TEXT third, static, all 161 frames         160 of   160   worst frame 0
[M]   ...per bank, each 2,576 = 161 x 16:      banks 0..8 and 11, all 2576/2576
[M] SPRITE third, static, all 161 frames       576 of   576   (W91's, re-run)
[M] BACKGROUND third, STEPPED, at LAG 1      1,024 of 1,024   (W92's, re-run)
[M] BACKGROUND third, STEPPED, at LAG 0/2    1,020 of 1,024
```

**WHAT 160 OF 160 DOES NOT PROVE, and it is WEAKER than W92's 1,024 of 1,024.**
It says the port's text palette equals the board's. It does NOT distinguish
cartridge bytes from the seed's own staging bytes, because `[M]` those are equal
too (240 of 240) -- that equality is the finding. **And unlike the background
third, the text third has NO ANIMATED ENTRY**: `[M]` 0 of its 240 words change
across the whole recording, so this comparison sits exactly where two readings
agree, which is the failure `docs/knowledge/03` is about. That is why the
witness mutation in §4.4 matters more here than any of W92's did: it is the only
check on this subject that can distinguish a replay from a coincidence.

What makes the claim "cartridge" is structural and checkable elsewhere:
`install2414BE` is handed `rom.bytes(block, 32)`, `src/rom.js` THROWS BY ADDRESS
outside the declared windows, `[M]` `$222638` and `$222778` were outside every
window until this wave declared two, and `[M]` removing the witness drops the
figure to 80 with the bytes still matching.

### 4.3 WHAT VISIBLY CHANGED, AND THE ANSWER IS AGAIN "NOTHING"

`[M]` 240 of 240 text staging words the port writes are identical to the ones
the seed already carries, and `[M]` the seed's TX staging equals the board's
`$A01000` on 240 of 240. So **160 entries changed provenance, not appearance**,
and `capture.bin` is 160 entries closer to being unnecessary.

### 4.4 EVERY CHECK, SEEN TO FAIL

**In `tests/w93palette.test.js`** (14 tests). The fixture puts its witness in
slot **3**, not slot 0, so a walker that only ever read the first slot would
fail; every one of the 15 text banks holds 16 distinct words and no two banks
share one.

```
[M] W93/2   bank 15 lands ON the sprite dirty flag $80FA66 -- THROWS, no clamp
[M] W93/3   a short read THROWS rather than copying garbage
[M] W93/5   state 0 is REFUSED: "allocated" is not "has run"
[M] W93/6   an INACTIVE slot and a WRONG TYPE are both refused
[M] W93/7   the walk is 20 slots at a $50 stride and NOT one past the end
[M] W93/8   NO witness -> the RESET five alone, and the refusal is NOTED
[M] W93/9   with a witness -> ten more, and BANK 11 not bank 9
[M] W93/10  the two routines overlap on 0..4 and are idempotent (80 words twice)
[M] W93/11  both tables name the SAME block for banks 0..4, derived not typed
[M] W93/12  one bad block is NAMED and does not take the other nine with it
[M] W93/13  provenance survives the flush into words $800..$8EF and NOWHERE else
[M] W93/14  mergePalette keeps the recording for banks 9, 10, 12, 13, 14
```

**In `webgate`, three new stages, and the second mutation is the one that
matters:**

```
[M] PASS: W93 THE TEXT STRIP -- the RESET path installed 5 banks and $2605C8
    installed 10 more, WITNESSED by $80E240 slot 0 holding an ACTIVE type $0A
    at state $1 priority $1F; 240 of 240 identical to the seed's staging, of
    which 80 written TWICE from the same block; 160 of 240 text words sourced
    and they equal the BOARD'S OWN $A01000 on 160 of 160 on all 161 frames
[M] PASS: W93 --break palCatchUp:false -- 0 of 240 text words, which IS the
    page before this wave
[M] PASS: W93 --break the WITNESS -- with the seed's type $0A object put back
    into state 0, the port sources 80 of 240 (the RESET five alone) and
    $2605C8's ten are REFUSED. **THE BYTES STILL MATCH THE CARTRIDGE EXACTLY**
    -- only the evidence that the routine ran is gone -- so a port that trusted
    the byte match would read 160 here
```

**That third stage is this wave's answer to W92 §5.1.** It is a check that can
fail for the exact reason W92 refused to wire these banks, and it fires.

**In the exporter** (`check_text_palette_boot` + `check_text_palette_obj0A`,
new, run on EVERY export), each mutation stopping the build with a named
message. The bound is DERIVED from `SHOT_WINDOWS` and refuses to run on none or
two declarations, which is the defect W91 paid for not being repeated.

### 4.5 THE GATES

```
[M] node --test games/ddpdoj/tests/     1,075 pass, 0 fail, 0 SKIPPED
                                        (1,061 before; +14 w93palette)
[M] node tools/webgate.mjs              GREEN, exit 0, 30 stages (27 before)
[M] node tools/seedcmp.mjs --quiet      9 green / 19 red / 43 blocked,
      --manifest .../w85-ladder-backup    0 seedbad, 0 error, 6,750 logic
      /stage1-sweep/manifest.json         frames -- and BYTE-IDENTICAL to
                                        W92's recorded output apart from the
                                        LADDER path line (diffed)
[M] python tools/oracle/pgm.py pixslice PASS 13,647,872/13,647,872 = 100.0000%
                                        over 136 frame pairs, exit 0
```

`[M]` **BUCKET 2 cannot be run on this ladder and I say so rather than
substituting a number**, exactly as W92 did: `seedcmp` reports *"BUCKET 2
($805CC8 ...): NOT CHECKED -- this ladder's trace has no `sprq2` column."* The
stronger claim is available and is made instead: the whole `seedcmp` output is
byte-identical to W92's.

**NO GATE MOVED, AND THE REASON IS STRUCTURAL** -- the same argument W91 and W92
made. `[M]` this wave writes 240 text staging bytes that are IDENTICAL to the
ones the seed already carries, one dirty flag the seed already has at 0 and the
flush immediately clears, and JS-side provenance arrays nothing in the
simulation reads.

### 4.6 `pgm.py check`: 72 / 2 / 0, AND A WARNING ABOUT HOW TO RUN IT

`[M]` `python tools/oracle/pgm.py check` -- **`VERDICT: FAILURES -- 72 passed,
2 failed, 0 SKIPPED`**, the baseline W90 left and W91 and W92 held. `[M]` the
two, read off the top-level gate list rather than inferred from the count:

```
[M] [FAIL] THE LASER BOMB: $249A80, $255FE2 and $2456A6 -- exit 1
[M] [FAIL] segment sweep: the port re-seeded from the board at every rung
           -- fly-around:PASS stage1-laser-hold:FAIL stage1-play:FAIL
              stage1-sweep:FAIL
```

**NO THIRD RED, AND NO GATE WAS RE-BASELINED BY THIS WAVE.**

**AND A FINDING ABOUT THE GATE ITSELF, because it nearly cost me a false
divergence report.** `[M]` the FIRST run of this gate returned **70 passed, 4
failed**, the two extra reds being *"pixel gate: the port's JS renderer vs
MAME"* and *"pixel gate RED (9 mutations)"*. That gate carries a BOARD column,
so under the brief's rule I stopped and investigated rather than reporting a
number. `[M]` it is not a divergence: **that run was launched in the background
while `node --test`, `seedcmp` and a Chrome instance were also running**, and
`pixslice` drives MAME. Run alone, `[M]` `python tools/oracle/pgm.py pixslice`
is **`PASS: 13,647,872/13,647,872 = 100.0000% over 136 frame pairs`, exit 0**,
and the full `check` is 72/2/0.

**So: `pgm.py check` is not safe to run concurrently with other heavy work, and
a red from it under load is not evidence.** That is worth a line in the next
brief, next to the `tools/pgm.py`-versus-`tools/oracle/pgm.py` warning W92 had
to write.

### 4.7 RECORDS LACKING ART: **4,017, AND THE INSTRUMENT WAS THERE ALL ALONG**

`[cited: W90 §1.6]` reports 4,017. W91 §4.5 and W92 §4.5 both declined to
reproduce it, each saying `.scratch/w86/noart.mjs` "is not in this tree".
`[M]` **it is**, at `games/ddpdoj/.scratch/w86/noart.mjs` -- this project has a
repo-root `.scratch/` and a per-game one, and both waves looked in the first.

`[M]` `node .scratch/w86/noart.mjs`, run on this tree:

```
[M] steps 6500  lf 2000..8500  records 534575  drawn 530558  NO ART 4017
[M] DISTINCT MISSING STREAMS: 46
```

**4,017, unmoved**, which is the figure the brief asks for and the answer to
"porting `$26C20C` may move it": it did not, because `$26C20C` did not need
porting (§1). It also confirms this wave emitted no display-list record and lost
none, which is the same conclusion W91 and W92 reached by a weaker route.

---

## 5. WHAT IS STILL ON THE CAPTURE

**800 of the 2,560 palette words at boot**, and they are:

| region | words at boot | why |
|---|---:|---|
| **9 SPRITE banks: 0..5, 7, 8, 9** | 288 | **§3: no routine in the cartridge reproduces them.** Six have no site at all; three sit in routines that contradict the seed |
| **4 more until they spawn: 6, 16, 17, 23** | 128 | the bomb, the midboss, the boss. Sourced the moment they fire |
| **5 TEXT banks: 9, 10, 12, 13, 14** | 80 | §2.4. Bank 9 has no installer anywhere; 10/12/14 are code-sourced zeroes; 13's site was not chased |
| **words `$8F0..$9FF`** | 272 | **NEVER sourceable.** No region of `$24133C` copies them on the board either |

---

## 6. THE BAR -- WHICH CONDITIONS I DELIVERED, PER PART

### 6.1 FEATURE COMPLETE

`[M]` `python .scratch/w93/browser.py 8893 90` -- a `http.server` over the
working tree, real Chrome through `playwright`, fire HELD for the whole run so
the laser arm is taken **and the midboss actually dies**, sampling the port's
own state through `window.__mixup` every two seconds and screenshotting.

**PART 1 (the text strip): WHAT CHANGED IS PROVENANCE, NOT APPEARANCE, AND THAT
IS THE MEASURED RESULT.** `[M]` the 240 text staging words the port writes are
identical to the ones the seed already carries, and the seed's TX staging equals
the board's `$A01000` on 240 of 240. Nothing on screen changed colour. What
changed is the page's own status line, which is the thing a person can check:

```
[M] AT BOOT   pal 1760/2560 cart [spr 576/1024 bg 1024/1024 tx 160/240] inst 34
[M] AT lf8913 pal 1888/2560 cart [spr 704/1024 bg 1024/1024 tx 160/240]
[M]           banks 10,11,...,31 inst 49
[M] PAGE ERRORS: one 404, and it is /favicon.ico -- the page declares none
```

**PART 2 (the second background map): IT DRAWS, AND I PHOTOGRAPHED THE FRAME.**
`[M]` the run flew to the midboss and killed it (`$8130D8` went 0 -> 1 -> 0
between lf2923 and lf3914) and the distance clock walked through `$26C20C`'s
window (`[M]` 232 at lf3794, 258 at lf4272, 271 at lf4477 -- the routine frees
itself at exactly `$0105` = 261). `.scratch/w93/w93-fly10.png` is the frame at
lf4272, **the last frame the painter runs**: the golden building terrain down
the left of the playfield is the 23 columns `$227AF8` supplies, and the manifest
said nothing drew them.

`[M]` and the headless attribution, which is the number rather than the picture
(§1.1): **503 consecutive frames each write exactly 207 map longwords**, and
**257 of 257 of the tiles they name are shipped** (shards 1, 2 and 7).

**WHAT DID NOT CHANGE, AND IT IS NAMED.** `[M]` records lacking art is still
**4,017 over 46 distinct streams** (§4.7) -- the black shapes at the right edge
of `w93-fly10.png` are those, they pre-date this wave and this wave did not
touch them. `[M]` the nine sprite banks and five text banks in §5 are still the
recording's and the page prints so every frame.

**MET for part 1** (as a provenance change with the picture measured unchanged)
**and for part 2** (as a photograph of content the manifest claimed nothing
drew, plus the attribution behind it).

### 6.2 ORACLES PERFECTLY

`[M]` **160 of 160 cartridge-sourced TEXT palette entries equal the board's own
`$A01000`, on all 161 recorded frames**, per bank 2,576 of 2,576.

**AND I STATE PLAINLY THAT THIS IS A WEAKER ORACLE THAN W92's.** §4.2: the text
third has NO animated entry -- `[M]` 0 of its 240 words change across the whole
recording -- so unlike W92's four fade words, this comparison sits exactly where
two readings agree. It cannot distinguish cartridge bytes from the seed's own
staging, because those are equal too. **The check that carries the weight here
is not the 160 of 160; it is the WITNESS MUTATION** (§4.4), which removes the
seed's state byte, leaves every one of the ten banks' bytes matching the
cartridge exactly, and watches the port refuse them. That is a check that can
fail for precisely the reason W92 refused to wire these banks.

`[M]` W91's 576 of 576 and W92's 1,024 of 1,024 (LAG 1) both re-run and
reproduced. `[M]` `seedcmp` byte-identical to W92's recorded output.
`[M]` `pgm.py check` 72/2/0 with the same two, read off the gate list.

**MET for part 1, with its limitation stated. NOT APPLICABLE to part 2**, and
that is worth being exact about: `$26C20C` writes background VIDEORAM, which is
not in the checkpoint capture, so there is no board column to compare it
against. What exists is `midbossgate.mjs`'s assertion of 207 longwords into a
named set of ring columns -- derived from the ROM's own arithmetic, not from the
board -- and that is strictly weaker than a board comparison, stated as such.

### 6.3 AND WHAT I REFUSED

**The nine sprite banks (288 words), and §3 is a proof rather than a
preference.** Six of them have no call site in the whole image naming the block
the seed carries; the three that do sit in straight-line routines that
contradict the seed on their other installs, and no ordering of those two
routines produces this seed. Replaying either would have changed banks away from
the board's while leaving the picture looking identical -- exactly the invisible
fabrication the brief warned about.

**Text bank 13** (`$222818` via `$288590`), whose reachability I did not
establish, and **bank 9**, which has no installer anywhere. 80 words, named.

---

## 7. WHAT I TOUCHED, AND WHAT I DID NOT

* `games/ddpdoj/src/palette.js` -- `install2414BE`, `TX_BOOT_INSTALLS`,
  `TX_OBJ0A_INSTALLS`, `obj0AWitness`, `catchUpTextPalette`, and the headers
  that carry §2's and §3's measurements.
* `games/ddpdoj/src/main.js` -- the text catch-up at boot.
* `games/ddpdoj/src/web/app.js` -- the page's prose brought up to date.
* `games/ddpdoj/tools/export-tables.py` -- two ROM windows,
  `check_text_palette_boot` and `check_text_palette_obj0A`.
* `games/ddpdoj/tools/export-web.mjs` -- **the `secondMap` note corrected**,
  with the old text quoted.
* `games/ddpdoj/tools/webgate.mjs` -- three W93 stages.
* `games/ddpdoj/tests/w93palette.test.js` -- new, 14 tests.

Not touched: `publish.mjs`, `bundlegate`, `build-dist.mjs`, the ROM leak guard,
`PUBLISH_VERBATIM`, `boarddl.mjs`, `seedcmp.mjs`, `portdiff.mjs`,
`midbossgate.mjs`, `w62stageendgate.mjs`, **any other gate's expected numbers**,
`src/handlers.js` (the painter needed nothing), `src/` (the Game Boy tree),
`games/gradius/`. **No frame cadence and no drawing order was changed anywhere,
and no colour was typed in.**

**THE WEB SERVER.** `.scratch/w93/browser.py` starts a `socketserver` on
127.0.0.1:8893 and calls `httpd.shutdown()` / `httpd.server_close()` in a
`finally`; the run log prints "server closed" and `[M]` `netstat` shows no
LISTENING socket on 8893 afterwards.

**ONE SELF-INFLICTED DEFECT, FOUND BY A TEST AND RECORDED.** `[M]` an in-place
Python patch of `export-tables.py` written with `pathlib.write_text` converted
the whole file to CRLF on Windows, which reddened FOUR tests in three other
waves' files (they assert on the exporter's SOURCE TEXT with `\n` in the
regex). Converted back to LF; `[M]` `git diff --stat` is 284 insertions and 0
deletions, i.e. additions only.

---

## LOG (appended as findings arrived)

- opened. Read 92 in full, 91 in full, 39, `src/palette.js`, `src/main.js`,
  `src/handlers.js`'s W57 and W36 blocks, before writing a line.
- `[M]` §1: **`$26C20C` HAS BEEN PORTED SINCE W57** and `midbossgate.mjs` has
  asserted its 207 longwords all along. The manifest said "UNPORTED" and
  "named-not-found"; both false, and the `$803926` column claim was INVERTED.
  Found by grepping our own source first, which is what the brief asked for.
- `[M]` §0.1: **my own reference scan was wrong.** It looked for
  `jsr/jmp/bsr/bra` and not for CONDITIONAL branches; `$2605C8` is reached by
  `$260798 beq.w` and I had already written the refusal paragraph.
- `[M]` §2.2: **THE SEED WITNESSES THE EXECUTION** -- `$80E240` slot 0 is an
  ACTIVE type `$0A` at state `$01`, priority `$1F`, and `$2411AE clr.w $2(A0)`
  starts it at 0 while `$2605C8`'s own first instruction is the only thing in
  the cartridge that makes it 1.
- `[M]` §2.1: banks 1..4 have exactly two installers each and BOTH NAME THE
  SAME BLOCK; bank 0's two candidate blocks `$222618`/`$222638` are
  BYTE-IDENTICAL. The answer does not depend on which site ran.
- `[M]` §3: **the nine sprite banks are refused, and it is a proof**: six have
  no site naming their block anywhere, and no ordering of `$24A764` and
  `$25BE72` produces the seed.
- `[M]` §2.5: `$2412FE` is the palette staging CLEAR and must NOT be replayed;
  its tail confirms W92's divider, step and identity level from the other end.
- `[M]` §4.1: **1,600 -> 1,760 of 2,560 at boot**, text 0 -> 160 of 240.
- `[M]` §4.2: **160 of 160 against the board on all 161 recorded frames** -- and
  it is a WEAKER claim than W92's, because the text third never moves.
- `[M]` §4.4: **the WITNESS mutation is the check that can fail** where a byte
  match cannot: remove the witness and the ten banks go back to the recording
  with their bytes still matching the cartridge exactly.
- `[M]` §0: **`.scratch/w86/noart.mjs` IS in this tree** at
  `games/ddpdoj/.scratch/`; W91 and W92 both looked in the repo-root `.scratch/`
  and reported it missing.
- `[M]` §4.5: 1,075 tests 0 fail; webgate GREEN 30 stages; seedcmp
  byte-identical to W92's; pixslice 100.0000% exit 0.

- `[M]` §4.6: **`pgm.py check` 72 / 2 / 0, the same two**, read off the gate
  list. AND: the first run said 70/4 with the PIXEL GATE red, because it was
  launched alongside `node --test`, `seedcmp` and Chrome; run alone,
  `pixslice` is 100.0000% over 136 frame pairs, exit 0. **A red from that gate
  under load is not evidence**, and the brief's "stop and report a divergence"
  rule is what made me check instead of report.
- `[M]` §4.7: **RECORDS LACKING ART 4,017, unmoved**, 46 distinct streams --
  reproduced with the instrument W91 and W92 both said was not in the tree.
- `[M]` §6.1: **THE PAGE, IN CHROME.** `pal 1760/2560 cart [spr 576/1024
  bg 1024/1024 tx 160/240]` at boot and 1888 in flight; the midboss killed and
  `.scratch/w93/w93-fly10.png` is the last frame `$26C20C` paints.
- `[M]` §6.2: 160 of 160 against the board, **and it is a weaker oracle than
  W92's and I say so**: the text third never moves, so the witness mutation and
  not the agreement figure is what carries the weight.
- `[M]` §7: an in-place Python patch turned `export-tables.py` CRLF and
  reddened four tests in three other waves' files. Converted back; the diff is
  additions only.
- closed. **Part 1 taken to 160 of 240 with 80 words refused and named; part 2
  turned out to need a corrected note and a measurement rather than a port.**
  1,600 -> **1,760 of 2,560** palette words cartridge-sourced at boot.

status: **DONE**
