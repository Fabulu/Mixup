# 92 -- IMPL: the background palette, the four entries that started it, and the seam

status: **DONE** -- §0 checks the brief and refutes one of W91's claims, §0.1
is **comment eleven**, §2 is the finding a reviewer should read first (the whole
background third is ONE CALL), §4.1 is the palette ledger by third, §4.2 is the
board agreement and what it cannot prove, §4.4 is every check seen to fail
including the one that cannot, §5.1 is **three blocks W91's own table names
wrongly**, §6 is which bar condition I met per part.

started: 2026-08-06. wave: 92. role: IMPLEMENTER.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B.

`[M]` = measured by me, this session, on this tree. Anything from another
document is `[cited]` and named.

inputs read in full: `91-impl-sprite-palette.md`,
`90-impl-laser-impact-bomb-palette.md` §2, `39-OWNER-visible-play-before-sound.md`,
`games/ddpdoj/src/web/app.js`, `games/ddpdoj/src/palette.js`,
`games/ddpdoj/src/background.js`, `games/ddpdoj/src/initbody.js`,
`games/ddpdoj/src/spawn.js`, `games/ddpdoj/tools/export-tables.py`
`check_palette_upload_family`.

---

## 0. THE PREMISE, CHECKED FIRST -- one claim of W91's is WRONG and one number is off by 31

| the brief / W91 says | `[M]` verdict |
|---|---|
| `$24133C` is the ONLY writer of palette RAM; three thirds `$80E886`/`$80F086`/`$80F886` | **THE THREE THIRDS ARE TRUE. "THE ONLY WRITER" IS FALSE.** §0.1 |
| `$24150A` is one of nine consecutive uploads; 161 call sites, 152 of them `$24150A` | **THE FAMILY IS TRUE, THE CENSUS IS OFF BY 31.** `[M]` a scan of the whole 6 MiB decrypted image for absolute-long `jsr`/`jmp` finds **192 sites, 154 of them `$24150A`** -- `$24152E` 2, `$241556` **0**, `$24157A` 3, `$2415A2` 2, `$2415C4` 1, `$2415E8` 3, `$2414BE` 25, `$2414E2` 2. W91's own §5.3 says `$241556` is "documented and not implemented"; `[M]` it has no absolute-long call site at all. `.scratch/w92/sites.py` |
| 31 of the 32 sprite banks match a 64-byte block in the ROM exactly; the exception is bank 6 | **TRUE**, re-derived by searching all 32 of the seed's banks against the image. `[M]` bank 6 alone has no match; bank 24 matches four addresses because it is 32 x `$0000` |
| 576 of 2,560 words cartridge-sourced at boot, 18 banks, board agreement 576 of 576 on all 161 frames | **TRUE**, re-run and reproduced exactly |
| the seed's `$80E886` equals the capture's words `$000..$3FF` on 1,024 of 1,024 | **TRUE** `[M]` |
| the four animated entries are at `$241404`, `$80F086+$540` = bank 21 pens 0..3 | **TRUE, AND `[M]` INDEPENDENTLY CONFIRMED FROM THE OTHER END**: of all 2,560 palette words, exactly FOUR ever change across the 161 recorded frames, and they are words 1696..1699 = background bank 21 pens 0..3. `$540/2 = 672 = 21*32` |
| `$2415E8` is unported and is "the whole middle third" | **TRUE, and it is ONE CALL.** §2 |
| the 13 sprite banks need a `PaletteState` through six spawn signatures | **TRUE, and the six are exactly six.** §3 |

### 0.1 A COMMENT THAT LIED, WHICH MAKES ELEVEN

`src/palette.js`'s own header, written by W91 nine days ago:

> "Palette RAM is `$A00000..$A011DF` and **NOTHING writes it directly**.
> Everything writes a STAGING COPY in main RAM and sets a DIRTY FLAG"

`[M]` `python tools/oracle/w27disasm.py 241404 2414BE`:

```
[M] 24141C  lea.l    $a00800.l, a1
[M] 241422  adda.w   #$540, a1
[M] 241426  lea.l    $80f086.l, a0
[M] 24142C  adda.w   #$540, a0
[M] 241436  move.w   $6(a0), d0 / jsr $246292 / move.w d0, $6(a1)   x4
```

**`$241404` writes palette RAM directly, bypassing both the staging area and the
dirty flag**, and it is the routine W91 itself located. The mechanism was
described one word too strong, and that one word is the reason the four entries
looked like a separate mystery for 78 waves: they cannot be in the block,
because the routine that produces them never puts them there. Corrected in place
with the old text quoted, and pinned by
`tools/export-tables.py check_bg_palette_and_fade` so it cannot rot again.
`docs/knowledge/02-traps.md`'s standing count was ten.

### 0.2 AND ONE THING W91 DID NOT NAME, WHICH A PORT NEEDS

`[M]` `$24146A subq.b #$1,$80FA70 / bcc $2414BC` and `$241474 move.b
$80FA71,$80FA70` are a **FRAME DIVIDER**: the level only moves on a frame where
the counter borrows. W91 named `$80FA6C` (level) and `$80FA6E` (step) and not
this pair. `[M]` the shipped seed carries `$80FA70` = `$80FA71` = `$01`, so on
THIS seed a port that drops the divider is right -- which is exactly why the
W92 test fixture uses a reload of 3.

---

## 1. WHAT I DID -- three parts, and I finished two and a half

| part | verdict |
|---|---|
| **1. the remaining 13 sprite banks** | **DONE for the eleven that a ported call site reaches.** `PaletteState` threaded through six signatures; the MIDBOSS, the BOSS and enemy types $24/$31 install their eleven banks live. `[M]` every one fires in a stage-1 flight and **zero `$24150A` notes remain in the port**. §3 |
| **2. the background third `$2415E8`** | **DONE, AND SO ARE THE FOUR ANIMATED ENTRIES.** One call site, 1,024 words, `[M]` 1,024 of 1,024 against the board once stepped. §2 |
| **3. the text strip** | **SCOPED, NOT TAKEN, AND MEASURED SO THE NEXT WAVE DOES NOT HAVE TO.** §5.2 |

---

## 2. THE BACKGROUND THIRD WAS ONE CALL

`[M]` the census in §0 finds `$2415E8` has **three** absolute-long call sites.
Two are the stage fade's endpoints (`$24639A`, `$2463D4`). The third is:

```
[M] 2611B2  lea.l    $261252(pc), a0
[M] 2611B8  adda.w   $813096.l, a0        <- the STAGE index
[M] 2611BE  movea.l  (a0), a0
[M] 2611C0  moveq    #$0, d0
[M] 2611C2  moveq    #$1f, d1             <- THIRTY-TWO BANKS
[M] 2611C4  jsr      $2415e8.l
```

-- inside `$261136`, the scroll VM's per-stage init, which **`src/background.js`
has ported since W15 and which had this line as a counted note.** `[M]`
`$261252[0]` is `$227E58`: the very block this bundle has shipped as an asset
since W14 and which nothing had ever uploaded.

`[M]` `$2415E8` itself, read off the listing: `lea $80F086,A1 / lsl.w #$6,D0 /
adda.w D0,A1 / [moveq #$F,D0 / 16 x move.l / dbra D0] / dbra D1 / move.w
#$1,$80FA68`. The outer `dbra D1` is the only thing that separates it from
`$24150A`, and `moveq #$1F,D1` is what makes one call the whole third.

**WHY REPLAYING IT AT BOOT IS SOUND.** It takes **nothing at all** from the
recording: D0 and D1 are immediates, the block is a cartridge pointer indexed by
a stage number the port already reads for the column stream, the element table
and the tile base. That is a strictly weaker bargain than `catchUpObjectStream`'s
(one integer) and far weaker than `bgSeed`'s (63 columns of board pixels). `[M]`
the 1,024 words it writes are **identical to the background staging area
`$80F086` the seed already carries -- 1,024 of 1,024** -- so the board reached
the same state by running this same routine over this same block and nothing
overwrote any of it between `$261136` and the seed instant.

### 2.1 AND THE FOUR ANIMATED ENTRIES, PORTED

`$241404..$2414BC` is the tail `$2413CC`'s `beq` and `$241400`'s `jsr` both fall
into, so it runs **every frame**, dirty flag or no. Two gates of its own
(`$813092 == 0`, `$8130CE < $130`), a level in `$80FA6C` that ping-pongs between
`$18` and `$3C` under a step in `$80FA6E` and the divider of §0.2, and four
entries through `$246292`.

`[M]` `$246292` transcribed: per channel, `asl.w #8` then `asr.w #5` (a net x8
through the word), `muls.w` the level, `asr.w #8`, `andi.w #$7FFF`, clamp at
`$1F`. **So level `$20` is exactly the identity** -- `[M]` checked on all 32,768
xRGB555 words, not on a sample -- and `$18`..`$3C` is 0.75x to 1.875x.

`[M]` **every one of the 26/26/23/20 distinct values the four words take across
the recording is reproducible from the block's own word by some level in that
range.** That is the check that the transform is right, done before a line of it
was wired in (`.scratch/w92/probe2.mjs`).

---

## 3. THE SEAM (part 1), AND IT WAS AS MECHANICAL AS W91 SAID

`palette` **APPENDED** -- never inserted -- to six signatures, so no existing
call site changed:

```
runEnemyFrame -> runSpawnWalker(ram, rom, unported, tables, spawnEvent, palette)
              -> dispatchScriptRecord(..., spawnEvent, palette)
              -> processDeferred(..., spawnEvent, palette)
              -> initDispatch(ram, rom, rec, unported, bodyFn, tables, palette)
              -> runInitBody(addr, ram, rom, rec, unported, tables, palette)
              -> runInitBodyAddr(addr, ram, rom, a5, unported, tables, palette)
              -> the body (ram, rom, a5, a6, unported, tables, palette)
```

Exactly the shape W31 used for `tables`. One helper, `installBank`, does the
`lea`/`moveq`/`jsr` triple; **a caller without a `PaletteState` gets back the
counted note it always had**, naming the bank and the block, so "this bank is
still the recording's" stays visible rather than becoming a silent hole.

`[M]` the eleven sites, and every one FIRES in 6,500 steps of stage-1 flight:

```
[M] $296FC6  bank $13  <- $222BF8   enemy type $24
[M] $269792  bank from $2697B0[$813094]  <- $2251B8   type $31    [M] fired as bank 11
[M] $2697A8  bank from $2697BA[$813094]  <- $2250B8   type $31    [M] fired as bank 13
[M] $26B4D2/E2/F2  banks $10/$11/$0F  <- $223338/$223378/$2233B8  THE MIDBOSS
[M] $29274E..$29278E  banks $15/$16/$17/$12/$11
                   <- $222B38/$222B78/$222BB8/$246BF8/$222C38     THE BOSS
```

`[M]` **`$269792`'s bank and the sub-record's palette byte are the SAME read**:
`$26978A move.w (A1,D6.w),D0 / $26978E move.b D0,($1D,A6)` and D0 is still that
word at the `jsr`. `src/initbody.js` had the byte and not the bank.

**AND THE MEASUREMENT THAT SAYS THREADING IT WAS RIGHT RATHER THAN JUST
POSSIBLE.** `[M]` the seed's bank 16 is `$2240F8` and its bank 17 is `$224078` --
**not** the midboss's `$223338`/`$223378`. Those come from `$25CA3A`/`$25CA72`,
a different family entirely. So the midboss recolouring bank 16 mid-flight is
the board's own behaviour and it is CORRECT for the port to disagree with the
recording there, exactly as the bomb's bank 6 is.

---

## 4. THE NUMBERS

### 4.1 THE PALETTE LEDGER, BY THIRD

```
[M] AT BOOT, shipped seed:   1,600 of 2,560 palette words CARTRIDGE-SOURCED
[M]                             sprites      576 of 1,024   (18 of 32 banks)
[M]                             background 1,024 of 1,024   (ALL 32 banks)
[M]                             text           0 of   240
[M]                             $8F0..$9FF     0 of   272  -- see below
[M] after 160 steps:         1,632   (+ sprite bank 18, the scroll VM's)
[M] after 6,500 steps:       1,760   (23 of 32 sprite banks: + 6,16,17,23)
[M] W91 left it at:            576 / 640
```

`[M]` **the last 272 words (`$8F0..$9FF`) can NEVER be sourced**: no region of
`$24133C` copies them on the board either, and they are 0 on 161 of 161 recorded
frames. They are counted separately rather than folded into a denominator that
would make the wave look worse than it is, and the page prints them as their own
row.

`[M]` **the page's own status line, read out of Chrome's DOM:**

```
pal 1600/2560 cart [spr 576/1024 bg 1024/1024 tx 0/240] banks 10,11,...,31 inst 19
```

### 4.2 THE BOARD AGREEMENT -- **1,024 OF 1,024, AND WHAT IT CANNOT PROVE**

Palette RAM is in the checkpoint capture, so this is one of the very few things
this port can compare against the board entry for entry without an emulator.

```
[M] SPRITE third, static, all 161 frames        576 of   576   (W91's, re-run)
[M] BACKGROUND third, static, all 161 frames  1,020 of 1,024   worst frame 3
[M] BACKGROUND third, STEPPED, at LAG 1       1,024 of 1,024   on all 160 frames
[M]   ...of which the four ANIMATED words        640 of   640
[M] BACKGROUND third, STEPPED, at LAG 0       1,020 of 1,024   (fade 445/644)
[M] BACKGROUND third, STEPPED, at LAG 2       1,020 of 1,024   (fade 440/636)
```

**LAG 0 AND LAG 2 ARE PRINTED BESIDE IT DELIBERATELY.** A fade that were really
a constant would score the same at every lag; that it does not is what says
`$241404` is a state machine the port is actually running.

**THE ONE-FRAME LAG IS REAL AND IT IS DECLARED RATHER THAN TUNED AWAY.**
`$241404` writes with the CURRENT level and only then advances. `[M]` the seed
carries `$80FA6C` = `$1E`, and the recording's frame 0 is `fade(base, $1F)` --
the level the board had already stepped past when the seed was taken. Recovering
`$1F` means inverting the divider, and `[M]` with `$80FA71` = 1 that inversion is
**ambiguous**: a counter that reads 1 after the frame may have borrowed and
reloaded, or may have been 2 and not borrowed. So the port is exactly one fade
step behind the seed instant, on four words of 2,560, and **making that number
prettier would have meant inventing state the seed does not carry.**

**WHAT 1,024 OF 1,024 DOES NOT PROVE**, stated because it is the weakness a
reader should find here rather than later, and it is W91's limitation with one
addition. It says the port's background palette equals the board's. It does NOT
by itself distinguish cartridge bytes from the seed's own staging bytes, because
those are equal too (1,024 of 1,024) -- that equality is the finding.
What makes the claim "cartridge" is structural and checkable elsewhere:
`install2415E8` is handed `rom.bytes(block, 2048)`, `src/rom.js` THROWS BY
ADDRESS outside the declared windows, `[M]` `$227E58` was outside every window
until this wave declared one, and `[M]` mutating the catch-up to ignore
`$813096` reddens W92/12. **The addition is that the four animated words are a
strictly stronger claim than the other 1,020**: they are the only palette words
in the whole recording that MOVE, so reproducing all 640 of them from a static
block plus a transcribed state machine cannot be an accident of two readings
agreeing.

**AND WHAT IS STILL NOT COMPARED**, unchanged from W91: bank 6 (the bomb) is
deliberately the one sourced bank that disagrees with the capture, because no
bomb was dropped in the 161 recorded frames. So is every bank the midboss and
the boss install, for the same reason -- the recording ends long before either
spawns. Those are confirmed against the CARTRIDGE at export and not against the
board, and that is a weaker claim, stated as one.

### 4.3 WHAT VISIBLY CHANGED, AND THE ANSWER IS AGAIN "ALMOST NOTHING"

`[M]` merged palette vs the recording's, word for word (`.scratch/w92/changed.mjs`):

```
[M] AT BOOT                    1,600 sourced   words DIFFERING from the capture   2
[M]                                            (both background bank 21 -- the fade)
[M] AFTER 160 steps            1,632 sourced                                     32
[M]                                            (sprite bank 6, background bank 21)
[M] AFTER 6,500 steps + bombs  1,760 sourced                                    338
[M]                                            (sprite banks 6,11,13,16..23; bg 21)
```

**AND THE PICTURE AT BOOT IS PIXEL-IDENTICAL.** `[M]` one frame rendered through
the real `Renderer` with this wave's palette and with the recording's:
**0 of 100,352 pixels differ** (99,105 lit). The 1,024 background entries that
changed hands changed **provenance, not appearance**, and `capture.bin` -- whose
removal is the formal definition of stage 1 being done -- is 1,024 more entries
closer to being unnecessary.

### 4.4 EVERY CHECK, SEEN TO FAIL

**In `tests/w92palette.test.js`** (14 tests), seventeen mutations of `src/` and
`tools/`, every one reddening a DISTINCT set. Full log:
`.scratch/w92/red.py`.

```
[M] the BG upload stages into the SPRITE area       W92/1 /12
[M] $2415E8 uploads D1 banks instead of D1+1        W92/1 /2 /3 /12
[M] $2415E8 sets the SPRITE dirty flag              W92/1 /12
[M] the bank bound is not checked (clamp not throw) W92/2 alone
[M] $246292 shifts asr #4 instead of asr #5         W92/4 /5
[M] $246292 does not clamp the channel at $1F       W92/5 alone
[M] $241404 ADVANCES BEFORE IT WRITES               W92/8 /9      <- the phase
[M] $241404 drops the frame divider                 W92/8 alone
[M] $241404 writes the STAGING instead of pal RAM   W92/6 /8 /11
[M] $241404 lands at bank 21 pen 4 ($548, not $540) W92/6 alone
[M] $241404 ignores the $8130CE window              W92/7 alone
[M] $241404 claims every faded word sourced         W92/10, W91/5 /6  <- provenance
[M] the fade runs only when a region was dirty      W92/11 alone
[M] catchUpBgPalette ignores the stage index        W92/12 alone
[M] catchUpBgPalette sets the flag on a bad block   W92/13 alone
[M] the exporter check is taken out of build()      W92/14 alone
[M] the W92 ROM window is short by one bank         W92/14 alone
```

**In the exporter** (`check_bg_palette_and_fade`, new, runs on EVERY export),
twelve mutations, each stopping the build with a named message:

```
[M] the per-stage BG table moved      "$2611B2 is not `lea ($261256,PC),A0` ..."
[M] stage 1's block is not $227E58    "...declared [] and must be ($227E98,$800)"
[M] D1 is $1E, not $1F                "**D1 IS HOW MANY BANKS MINUS ONE**: $1F
                                       is all 32 = the whole 1,024-word third"
[M] the fade offset is $500           "**THAT OFFSET IS WHICH FOUR ENTRIES
                                       ANIMATE**: $500/2 = 640 ... = bank 20"
[M] the fade bounds are $10/$40       "...the two arms are NOT symmetric"
[M] the fade writes the STAGING area  "**THIS ROUTINE WRITES PALETTE RAM
                                       DIRECTLY**, which is the one exception
                                       to the staging-area rule W91's header
                                       stated without one"
[M] the fade gate is $8130CC          "$241410 is not `cmpi.w #$130,$8130CE.l`"
[M] the level is read from $80FA6E    "...the LEVEL src/palette.js reads BEFORE
                                       writing, not after"
[M] the divider is $80FA72            "...W91 named the level and the step and
                                       not this pair"
[M] $246292 muls D6 instead of D7     "**THAT SEQUENCE IS WHY LEVEL $20 IS THE
                                       IDENTITY**"
[M] the W92 window declared TWICE     "...is declared [(2260568, 2048),
                                       (2260568, 2048)] and must be ($227E58,
                                       $800)"
[M] the W92 window declared ZERO times (the $227E98 mutation above, other arm)
```

**THE BOUND IS DERIVED, NOT TYPED TWICE.** W91 found one of its own checks
DEFECTIVE because a window extent was written both in `SHOT_WINDOWS` and in the
check. `check_bg_palette_and_fade` derives `$800` from the `SHOT_WINDOWS`
declaration and refuses to run on none or two of them -- and **both arms of that
refusal are seen to fire above**, which is the mistake W91 paid for not being
repeated.

**In `webgate`**, three new stages and their mutation:

```
[M] PASS: W92 THE BACKGROUND THIRD -- $2611C4 replayed $227E58, 32 banks,
    1024 of 1024 identical to the seed's staging, 1020 of 1024 equal to the
    BOARD on all 161 recorded frames (worst frame 3)
[M] PASS: W92 THE FOUR ANIMATED ENTRIES -- LAG 0 1020/1024 (fade 445/644),
    LAG 1 1024/1024 (fade 640/640), LAG 2 1020/1024 (fade 440/636)
[M] PASS: W92 --break palCatchUp:false -- 0 of 1024 background words, which IS
    the page before this wave
```

`[M]` **the LAG 1 stage asserts that LAG 0 and LAG 2 are NOT perfect.** A stage
that only checked its own lag would pass on a fade that had been replaced by a
constant, which is precisely the "sitting where two readings agree" failure
`docs/knowledge/03` is about.

**ONE CHECK COULD NOT BE MADE TO FAIL AND I SAY SO.** There is no mutation of
`src/` that reddens `seedcmp`, because this wave writes only staging bytes that
are already there, palette words nothing in the simulation reads, and a
provenance array. §4.5 argues why, and the argument is confirmed rather than
asserted: `[M]` the ENTIRE `seedcmp` output is byte-identical run at `HEAD` and
run on this tree, diffed.

### 4.5 THE GATES

```
[M] node --test games/ddpdoj/tests/     1,061 pass, 0 fail, 0 SKIPPED
                                        (1,047 before; +14 w92palette)
[M] python tools/oracle/pgm.py check    VERDICT: FAILURES -- 72 passed,
                                        2 failed, 0 SKIPPED  (SEE 4.6)
[M] node tools/webgate.mjs              GREEN, exit 0, 27 stages (24 before)
[M] node tools/build-dist.mjs           GREEN, 6 deliberate exceptions,
                                        NO SEVENTH `PUBLISH_VERBATIM` ENTRY
[M] node tools/publish.mjs --only ddpdoj --dry
                                        GREEN. build 20260806081557,
                                        dist/ 256 files 6,547 KB (6,523 before
                                        -- the new 2 KiB ROM window and its
                                        neighbours), rom-leak guard 252 files
                                        against 12 ROMs, clean, six exceptions
[M] node tools/seedcmp.mjs --quiet      9 green / 19 red / 43 blocked,
                                        0 seedbad, 0 error, 6,750 logic frames
                                        -- **and BYTE-IDENTICAL to the same
                                        command run with every file of this
                                        wave reverted to HEAD** (SEE 4.7 for
                                        the manifest, and for the one figure
                                        the brief asks for that this ladder
                                        cannot produce)
```

**NO GATE MOVED, AND THE REASON IS STRUCTURAL.** This wave writes three things:
staging bytes in `$80F086..` and `$80E886..`, three dirty flags, and JS-side
arrays nothing in the simulation reads. `[M]` the background staging bytes the
catch-up writes are IDENTICAL to the ones the seed already carries (1,024 of
1,024) and `[M]` the seed's three dirty flags are already 0, so the boot path is
a value-preserving write. The init-body installs write staging bytes at the
moment the board writes them.

`[M]` **and the five display-list record censuses in `webgate` are
byte-identical to their pre-wave baselines** -- W44 20,794, W58 12,805,
W66 5,948, W86 17,047, W90 17,286 -- so this wave emitted no record and lost
none, even though it made eleven new calls inside four enemy init bodies.

**RECORDS LACKING ART, and I report the same limitation W91 did rather than
substituting a number.** `.scratch/w86/noart.mjs`, which W90 §1.6's 4,017 comes
from, is still not in this tree. The comparable claim is the one above: no
record moved on any of five gated windows, and `webgate` reports 0 with NO ART
on every one of them.

### 4.6 `pgm.py check`: 72 / 2 / 0, AND THE TWO ARE THE SAME TWO

`[M]` `python tools/oracle/pgm.py check` -- **`VERDICT: FAILURES -- 72 passed,
2 failed, 0 SKIPPED`**, the baseline W90 left and W91 held. `[M]` the two, read
off the top-level gate list rather than inferred from the count:

```
[M] [FAIL] THE LASER BOMB: $249A80, $255FE2 and $2456A6 -- exit 1
[M] [FAIL] segment sweep: the port re-seeded from the board at every rung
           -- fly-around:PASS stage1-laser-hold:FAIL stage1-play:FAIL
              stage1-sweep:FAIL
```

`[cited: W79 §6.5]` filed the first as a concurrent wave's and W84, W85, W86,
W90 and W91 each re-established it; the second is the 43 blocked + 19 red rungs.
**NO THIRD RED, AND NO GATE WAS RE-BASELINED BY THIS WAVE** -- this wave changed
no number in any gate file, which is the consequence of §4.5's argument.

**A CORRECTION FOR THE NEXT BRIEF, because I lost twenty minutes to it.** The
brief and W91 both write this gate as `pgm.py check`. `[M]`
`games/ddpdoj/tools/pgm.py` is the **MAME DRIVER**; it has no `check`
subcommand and **exits 0 printing nothing at all**, which looks exactly like a
gate that passed. The gate is `games/ddpdoj/tools/oracle/pgm.py`.

### 4.7 A NOTE ON THE `seedcmp` MANIFEST

`[M]` `.scratch/w69/stage1-sweep`, the path W91 and the brief both name, **is
not in this tree**. The ladder that is here is
`games/ddpdoj/.scratch/w85-ladder-backup/stage1-sweep/manifest.json`, and it
reproduces the required figures exactly: **9 green / 19 red / 43 blocked,
6,750 logic frames, 0 seedbad, 0 error.**

`[M]` **the BUCKET 2 census the brief asks for (20,785 records, 0 missing)
CANNOT BE RUN ON THIS LADDER** and I say so rather than substituting a number:
`seedcmp` reports *"BUCKET 2 ($805CC8, the layer the stage-1 boss draws into):
NOT CHECKED -- this ladder's trace has no `sprq2` column. Re-run `pgm.py ckpt`."*
That is a property of the ladder present in this tree, not of this wave. **The
stronger claim is available and is made instead: the entire `seedcmp` output is
byte-identical run at `HEAD` and run on this tree** (§4.5), so no column of it
moved, checked or unchecked.

---

## 5. WHAT IS STILL ON THE CAPTURE, AND EXACTLY WHAT EACH NEEDS

**800 of the 2,560 palette words are still the recording's after boot**, 528
after a full stage-1 flight, and they are:

| region | words at boot | why |
|---|---:|---|
| **9 SPRITE banks: 0..5, 7, 8, 9** | 288 | §5.1 |
| **4 more until they spawn: 6, 16, 17, 23** | 128 | the bomb, the midboss, the boss. Sourced the moment they fire |
| **the TEXT/HUD strip** | 240 | `$2414BE`/`$2414E2` unported. §5.2 |
| **words `$8F0..$9FF`** | 272 | **NEVER sourceable.** No region of `$24133C` copies them on the board either |

### 5.1 The nine sprite banks, MEASURED rather than inherited

**W91 §5.1's table names call sites, and `[M]` for four of these banks the site
it names is NOT what put the seed's bytes there.** Checked by searching each
bank against the whole image:

```
[M] bank 0  == $222878, and $24A76C IS its site         <- REPLAYABLE
[M] bank 1  == $2259B8, but $24A77A leas $2228F8        <- W91 named $2228F8
[M] bank 7  == $225138, but $284878 leas $2250B8        <- W91 named $2250B8
[M] bank 8  == $225138, but $284888 leas $2250F8        <- W91 named $2250F8
[M] bank 2  == $222978   no absolute-long site leas it
[M] bank 3  == $246C38   (a constant bank; also at $25BAEC)
[M] bank 4  == $2229F8
[M] bank 5  == $2243B8
[M] bank 9  == $225078
```

**SO REPLAYING W91's TABLE AT BOOT WOULD HAVE CHANGED FOUR BANKS AWAY FROM WHAT
THE BOARD HAS**, and the board comparison would have caught it -- which is why
this wave measured before it wired anything, and why it wired **only the eleven
sites a ported routine actually executes**. The remaining nine need a source
whose bank a `lea` names, and eight of the nine do not have one: their `A0` is
computed. Naming them is `93`'s work and the bank/block pairs above are the
measurement it starts from.

### 5.2 THE TEXT STRIP -- SCOPED, WITH THE WORK MEASURED

`[M]` all 15 text banks (16 words each) against the image and against the 25
absolute-long `$2414BE` sites:

```
[M] banks 0..8, 11, 13   MATCH a named site's block exactly    11 banks, 176 words
[M]   0 <- $222638  1 <- $222658  2 <- $222678  3 <- $222698  4 <- $2226B8
[M]   5 <- $2226D8  6 <- $222778  7 <- $222798  8 <- $2227B8  11 <- $2227D8
[M]   13 <- $222818 ($288590)
[M] bank 9               == $2226F8, which NO absolute-long site leas
[M] banks 10, 12, 14     ALL ZERO (bank 12's named site $25C600 <- $2227F8 does
                         NOT match, so that install never ran on this seed)
```

`[M]` and ten of the eleven come from ONE contiguous run, `$2605D4..$26065A`
inside `$2605C8`, which is a game-start routine rather than a per-stage one.

**WHY I STOPPED HERE AND DID NOT TAKE IT.** The background catch-up is justified
by a per-stage table the seed indexes and by 1,024 of 1,024 agreement with the
staging. `$2605C8` has neither: nothing in the seed says it ran, only that its
result is present, and **"the bytes match, therefore replay it" is the exact
reasoning that would have installed the wrong bank 1, bank 7 and bank 8 in
§5.1.** The honest form of this is a routine whose ENTRY the port reaches, and
`$2605C8`'s caller is a `bsr` I did not chase. `[M]` the seed's TX staging equals
the board's `$A01000` on 240 of 240, so nothing is broken; 240 words are simply
still the recording's and the page says so.

### 5.3 The rest

1. **`$24152E`, `$241556`, `$24157A`, `$2415A2`, `$2415C4`, `$2414BE`,
   `$2414E2` are documented and NOT implemented.** `[M]` `$241556` has ZERO
   absolute-long call sites in the whole image. A routine ported on the strength
   of a table is dead code; the table is checked instead.
2. **The other named dependency of `capture.bin` is unchanged**: the second
   background map's painter `$26C20C`.
3. **One input, and a poked one.** Every census here is one route with
   `$810424` held; `docs/knowledge/09` governs. Every count is a floor.
4. **The one-frame fade lag** (§4.2) is a declared deviation, not a defect, and
   it is four words of 2,560 on the boot frame only.

---

## 6. THE BAR -- WHICH CONDITIONS I DELIVERED, PER PART

### 6.1 FEATURE COMPLETE

`[M]` `python .scratch/w92/browser.py 8894 15` -- a `http.server` over the
working tree, real Chrome through `playwright`, fire HELD so the LASER arm is
taken, three bombs dropped, every sample reading the port's own palette state
through `window.__mixup.demo.game.palette` AND measuring the canvas.

**WHAT CHANGED COLOUR: NOTHING VISIBLE, AND THAT IS THE MEASURED RESULT.** §4.3:
0 of 100,352 pixels differ at boot. The background third was already correct on
the page because the recording supplied it; what changed is that 1,024 words now
come from the cartridge instead.

**WHAT THE PAGE NOW SAYS, and it is the thing a person can check:**

```
[M] pal 1600/2560 cart [spr 576/1024 bg 1024/1024 tx 0/240] banks 10,...,31 inst 19
[M] ...and after three bombs and a flight:
[M] pal 1728/2560 cart [spr 704/1024 bg 1024/1024 tx 0/240]
[M]     banks 6,10,11,12,13,14,15,16,17,18,19,20,21,22,24,...,31 inst 27
```

**THE BOMB IS STILL ORANGE**, which is what W91 delivered and what this wave had
to not break. The brightest decile of the lit pixels:

```
                             R    G    B    chroma
[M] W90, BEFORE W91         199  198  164     49     R = G
[M] W92, boot               217  202  183     34     R = G, the same picture
[M] W92, fire held          232  211  152     80
[M] W92, BOMB 1             250  219  125    125     R > G > B
[M] W92, BOMB 2             248  230  159     89
[M] W92, BOMB 3             250  237  191     59 / 247 223 139 = 108
[M] the port's bank 6       FFFF FFB6 FF91 FF6C FF48 FEE7 FE87 FE04
[M] the port's bg bank 21   4982 4122 34E2 2882  (mid-fade, level $1C)
[M] PAGE ERRORS: one 404, and it is /favicon.ico -- the page declares none
```

**MET, for all three parts** (part 3 as a measurement rather than a change).

### 6.2 ORACLES PERFECTLY

`[M]` **1,024 of 1,024 cartridge-sourced BACKGROUND palette entries equal the
board's own palette RAM, on all 160 comparable recorded frames, including all
four animated ones.** §4.2, with its limitation stated there, the lag explained
rather than tuned away, and LAG 0/LAG 2 printed beside it so the number cannot
be mistaken for a comparison of two constants.

`[M]` W91's 576 of 576 re-run and reproduced. `[M]` `seedcmp` byte-identical to
HEAD. **MET for parts 1 and 2**; part 3 has no port-side claim to oracle.

**AND WHAT PART 1 CANNOT ORACLE.** The eleven init-body banks are confirmed
against the CARTRIDGE at export and photographed in a browser; the recording
ends thousands of frames before the midboss or the boss spawns, so there is no
board comparison available for any of them. That is strictly weaker than
1,024 of 1,024 and is stated as such.

---

## 7. WHAT I TOUCHED, AND WHAT I DID NOT

* `games/ddpdoj/src/palette.js` -- `install2415E8`, `fade246292`,
  `bgFade241404`, `catchUpBgPalette`, `ledger()`, and comment eleven.
* `games/ddpdoj/src/main.js` -- the background catch-up at boot.
* `games/ddpdoj/src/background.js` -- `$2611C4` made a live install.
* `games/ddpdoj/src/spawn.js`, `src/initbody.js`, `src/enemyframe.js` -- the
  six-signature seam and the eleven init-body installs.
* `games/ddpdoj/src/web/app.js`, `index.html` -- the by-third ledger on the
  status line, and W91's prose brought up to date.
* `games/ddpdoj/tools/export-tables.py` -- the `$227E58` window and
  `check_bg_palette_and_fade`.
* `games/ddpdoj/tools/webgate.mjs` -- three W92 stages.
* `games/ddpdoj/tests/w92palette.test.js` -- new, 14 tests.

Not touched: `publish.mjs`, `bundlegate`, `build-dist.mjs`, the ROM leak guard,
`PUBLISH_VERBATIM`, `boarddl.mjs`, `seedcmp.mjs`, `portdiff.mjs`,
`midbossgate.mjs`, `w62stageendgate.mjs`, **any other gate's expected numbers**,
`src/` (the Game Boy tree), `games/gradius/`. **No frame cadence and no drawing
order was changed anywhere, and no colour was typed in.**

**THE WEB SERVER.** `.scratch/w92/browser.py` starts a `socketserver` on
127.0.0.1 and calls `httpd.shutdown()` / `httpd.server_close()` in a `finally`;
the run log prints "server closed" and `[M]` `netstat` shows no LISTENING socket
on 8890..8899 afterwards.

---

## LOG (appended as findings arrived)

- opened. `git status` quiet, no `publish.mjs` alive. Read 91 in full, 90 §2,
  39, `src/palette.js`, `src/web/app.js`, `src/background.js`, `src/spawn.js`,
  `src/initbody.js`, and the exporter's W91 block, before writing a line.
- `[M]` §0: **the upload-family census is 192 sites, not 161**, and `$241556`
  has none at all.
- `[M]` §0.1: **`$241404` WRITES PALETTE RAM DIRECTLY.** `src/palette.js`'s own
  header said nothing does. Comment eleven, in a file nine days old.
- `[M]` §0.2: **there is a FRAME DIVIDER (`$80FA70`/`$80FA71`) W91 did not
  name**, and the shipped seed's reload of 1 is exactly the value that hides it.
- `[M]` §0: **the four animated words confirmed from the other end** -- of all
  2,560 palette words, exactly four ever move across the recording, and they are
  background bank 21 pens 0..3.
- `[M]` §2: **the whole background third is ONE CALL**, `$2611C4`, in a routine
  `src/background.js` has ported since W15. `$227E58` was outside every ROM
  window; one `SHOT_WINDOWS` line fixed that.
- `[M]` §2.1: `$246292` transcribed; **level `$20` is the identity on all 32,768
  words**, and every distinct value the four animated words take in the
  recording is reproducible from the block by some level in `$18..$3C`.
- `[M]` §4.2: **1,024 of 1,024 against the board on all 160 stepped frames**,
  fade included -- and 1,020 at LAG 0 and LAG 2, which is what makes it a
  measurement of a state machine rather than of two constants.
- `[M]` §4.2: **the one-frame lag cannot be removed without inventing state**,
  because the divider's inversion is ambiguous at reload 1. Declared.
- `[M]` §3: the seam, six signatures, all APPENDED. **Eleven init-body sites,
  every one fires in 6,500 steps, zero `$24150A` notes left.**
- `[M]` §5.1: **W91's §5.1 table names the wrong block for banks 1, 7 and 8** --
  the seed's bytes are `$2259B8` and `$225138`, not `$2228F8`/`$2250B8`/
  `$2250F8`. Replaying that table at boot would have installed four wrong banks.
- `[M]` §4.3: **0 of 100,352 pixels differ at boot.** 1,024 entries changed
  provenance, not appearance.
- `[M]` §4.4: 17 source mutations, 12 exporter mutations, 1 webgate mutation,
  every one seen to fail; **both arms of the derive-the-bound guard fired**.
  One check (`seedcmp`) could not be made to fail and the reason is structural.
- `[M]` §4.5: 1,061 tests 0 fail; webgate GREEN 27 stages; **seedcmp
  byte-identical to a HEAD run, diffed**; `publish --dry` GREEN; no seventh
  `PUBLISH_VERBATIM` entry; no gate re-baselined.
- `[M]` §6.1: **THE PAGE, IN CHROME.** `pal 1600/2560 cart [spr 576/1024
  bg 1024/1024 tx 0/240]` on its own status line; the bomb still a column of
  orange fire at chroma 89 to 125.
- `[M]` §4.6: **`pgm.py check` 72 / 2 / 0, the same two, read off the gate
  list.** No third red, no re-baseline. And the gate is
  `tools/oracle/pgm.py`, not `tools/pgm.py` -- the latter is the MAME driver
  and **exits 0 printing nothing**, which is indistinguishable from green.
- `[M]` §4.7: the `.scratch/w69/stage1-sweep` manifest the brief names is not
  in this tree; the w85 backup ladder reproduces 9/19/43/6,750 exactly, and its
  trace has no `sprq2` column so the bucket-2 census cannot be run. Said rather
  than substituted.
- closed. **Parts 1 and 2 finished, part 3 scoped with its work measured.**
  576 -> **1,600 of 2,560** palette words cartridge-sourced at boot, 1,760 in
  flight; the background third **1,024 of 1,024 against the board**; **0 of
  100,352 pixels changed.**

status: **DONE**
