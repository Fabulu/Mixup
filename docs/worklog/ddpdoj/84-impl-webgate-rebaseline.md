# 84 -- IMPL: the publish blocker -- one unharvested table, and nine numbers that each needed a reason

status: **DONE** -- §1 is the defect and it is ONE table, §2 is the commit-level
attribution of every moved number, §3 is the board proof for the two that FELL,
§5 is the table the brief asked for, §7 is the page in Chrome, §8 says which bar
conditions I met.

started / finished: 2026-08-06
role: IMPLEMENTER. Files written: `games/ddpdoj/tools/export-web.mjs`,
`games/ddpdoj/tools/webgate.mjs`, `games/ddpdoj/src/handlers.js`,
`games/ddpdoj/src/initbody.js`, `games/ddpdoj/tests/web-spr-shards.test.js`,
`games/ddpdoj/tests/w52weapons.test.js`, `.gitignore` (one line, §4.5) and this
worklog. `games/gradius/` not touched. **One web server was started and it was
killed by process and by port before finishing** (§9). Nothing ROM-derived is committed. **`PUBLISH_VERBATIM`
still has SIX entries; this wave did not need a seventh** (§6).

target: `ddpdojblk` VERSION-B. `[M]` = measured by me this session; anything
from another document is `[cited]` and named.

---

## 0. THE HEADLINE

`[M]` **`node tools/publish.mjs --only ddpdoj --dry` IS GREEN.** Every stage of
`webgate` passes, the bundle gate is 100.0000 %, the ROM-leak guard is clean
with its six standing exceptions, and `dist/` builds: 255 files, 6,413 KB.

`[M]` **The 186 art-less records were ONE TABLE, and it was a real defect.**
Every one of them -- and 12 of the 13 addresses the guard stage named -- carried
a descriptor out of `$269EC8`, the damage-first family's SECOND DRAW ARM. W80
wired the family's two machines, `$269B8C` started running, and the exporter had
never harvested that table because its own comment said the longs were bucket
values that only looked like stream starts. **They are art. The board draws
them** (§1.2). Harvested: 27 new streams, **947 bytes for the whole fix**, of
which 131 B is boot.

`[M]` **The two DECREASES are not a regression, and the proof is the board's own
RAM, not an argument.** Both fell at W80 (`e1276da`), and W80's emission is not
what moved them -- with the family's enqueue disabled every one of these numbers
is unchanged. What moved them is that the family now MOVES the way the cartridge
moves. Seeded from a `stage1-laser-hold` checkpoint and stepped 100 frames on
the board's own per-frame input:

```
[M]              ($1A,A6) SPEED        sub-record POSITION
    W79           0 of 12 pairs          0 of 12
    W80          12 of 12               12 of 12   EXACT
```

`[M]` **The item's four frames are one kill.** The first item in that window is
dropped by enemy slot 18, a type `$85`, and that object dies at frame 669 on W79
and **665** on HEAD. Same slot, same type, one volley fewer.

`[M]` **The page, in Chrome, all 17 sprite shards ready**: 975 helicopter body
records, **469 of the arm-B records that had no picture before this wave**, 506
arm-A, 1,049 fighter (`$1735FC`/`$173810`), 168 type `$88` -- and the status
line's `NO ART` never names one of them (§7).

**Re-pinned: 12 figures across 7 stages. Fixed rather than re-pinned: 2** (the
186 art-less records and the guard's 13 addresses, both back to their original
expectations of 0 and 1).

---

## 1. THE DEFECT -- `$269EC8` IS ART, AND THE FILE THAT SKIPPED IT SAID WHY

### 1.1 What the 186 records actually were

`[M]` The eight addresses `webgate` printed (`$17253C` `$172560` `$172584`
`$172344` `$1725CC` `$1726EC` `$17277C` `$172734`) and the twelve its guard
stage printed are **all entries of one 32-longword table at `$269EC8`**, read
out of `maincpu.bin`:

```
[M] $269EC8: $172344 $172368 $17238C $1723B0 ... $172758 $17277C $1727A0
             (32 longs, stride 4, ending exactly at $269F48 = FAM.muzzle)
```

The brief's framing was that W80 "enabled emission for descriptors that have no
picture" and that the fix was per-address. `[M]` **It is not per-address and it
is not 186 separate decisions: it is one harvest row.** The port is right to
emit them; the bundle was wrong to lack them.

The path, from the cartridge:

```
[M] $269E32  lea $269EC8,A0 / move.l (A0,D1.w),($2C,A5)     the write
[M] $269DB6  the same table, the same index, in $05's slew block
[M] $269B3E  tst.w $80390C / beq.s $269B7A      <- ARM A / ARM B
[M] $269B9E  move.l ($2C,A5),D2                 <- ARM B reads it back
    $269BA2  move.w #$410,D3                       2x16, colour $18
    $269BAE  jmp $23DF58                        <- D2 IS THE DESCRIPTOR
```

`[M]` Inside the family's own code `($2C,A5)` has exactly one reader, `$269B9E`,
and it hands the long straight to the emitter as the DESCRIPTOR register. (I did
not xref `($2C,A5)` across the whole image; the claim is scoped to
`$269B3E..$269E46` and `$26A2E2..$26A4B0`, which I read end to end.) `src/handlers.js` called the table `FAM.bucket` and
`src/initbody.js` called it "the bucket table"; **the name is what kept the art
out of the sheet**, because `tools/export-web.mjs` cited that reading as its
reason for not harvesting it. The field is renamed `FAM.armBArt` rather than
re-commented, for that reason.

### 1.2 THE BOARD DRAWS THEM, which is what decides between the two fixes

The brief offered two: export the art, or stop emitting. `[M]` Over the 210
checkpoints of the `stage1-laser-hold` ladder, the **BOARD's own** display list
carries

```
[M]  54 entries whose descriptor is one of $269EC8's 32     (ARM B)
[M] 359 entries whose descriptor is one of $269BB6's  4     (ARM A, ships already)
[M]   0 on stage1-play / stage1-sweep / fly-around, and that is SAMPLING:
       $80390C alternates every frame and those three ladders' rungs land on
       $80390C == 1 on 71 of 72, 71 of 72 and 9 of 9 respectively. ARM B only
       runs when it is 0.
```

So the port must emit them and the art must ship. **Choosing "stop emitting"
would have removed a record the cartridge draws.**

### 1.3 AND THE FIRST CENSUS I RAN SAID ZERO -- note 83 happening to me

`[M]` My first board census went through `boarddl.mjs`'s per-type `kinds` table
and reported **0 arm-A and 0 arm-B entries**, which would have sent this wave
down the "stop emitting" road. `kinds` attributes entries to an OBJECT's own
sub-record, i.e. to the `$23D852` enqueue; arms A and B are
`enqueueRegisters`-convention draws built out of registers and tied to no slot,
so they are unattributable BY CONSTRUCTION and the census cannot see them. The
honest number came from walking the raw display list. `[cited: NOTE 83]` is
about a census that measured walk order instead of work; this is the same shape
one level along -- **a census measured what it could ATTRIBUTE, and I read it as
what exists.**

### 1.4 What it cost

```
[M] spr/mask.shard3.u16.gz   1,891 ->  2,674 B   (+783)
[M] spr/col.shard3.u16.gz    8,106 ->  8,165 B   (+59)
[M] spr/streams.u32.gz       1,219 ->  1,231 B   (+12)   BOOT
[M] manifest.json           12,582 -> 12,701 B   (+119)  BOOT, uncompressed
[M] TOTAL                                        +947 B, of which 131 B is boot
[M] shard 3: 27 streams -> 54; 5 of the 32 were already in the sheet
```

### 1.5 A deadline moved under a shard nobody edited

`[M]` `export-web.mjs` recorded shard 3 as `[M] first needed lf6426`, and that
was true while the port emitted nothing at all for this family. W80 changed it:
`[M]` the first shard-3 record now lands at **lf2106** from the shipped seed --
1.8 s after boot, against shard 1's `[cited: W47]` +7.7 s. Shard 3 therefore
moves ahead of shard 1 in `SPR_ORDER`, and **the assertion that caught this is
W81's own ORDER-IS-A-CLAIM loop in `tests/w52weapons.test.js`**, which is
tightened to cover it. The shard whose deadline moved is not the shard whose
code changed.

---

## 2. THE ATTRIBUTION -- EVERY MOVED NUMBER TO A COMMIT, BEFORE ANY RE-PIN

`[M]` `git worktree` at five commits, **this gate unchanged, the same bundle**,
so the only variable is `src/`:

| stage | W78 `2ce7558` | W79 `cb4596f` | W80 `e1276da` | W81 `fa298a5` | W82 `94ec0eb` |
|---|---|---|---|---|---|
| the whole gate | **all green** | **all green** | 9 FAIL | 9 FAIL | 9 FAIL |
| W44 records | 18,893 | 18,893 | 19,868 | 20,794 | 20,794 |
| W44 max/frame | 82 | 82 | 89 | 99 | 99 |
| W44 b23 | 2,432 | 2,432 | 2,599 | 3,001 | 3,001 |
| W44 NO ART | 0 | 0 | **186** | 186 | 186 |
| guard addresses | 1 | 1 | **13** | 13 | 13 |
| W52 shots | 22,101 | 22,101 | **22,000** | 22,000 | 22,000 |
| W52 bullets | 4,387 | 4,387 | 4,401 | 7,070 | 7,070 |
| W52 bullet images | 32 | 32 | 32 | 36 | 36 |
| W53 spark | 8,817 | 8,817 | 9,271 | 9,271 | 9,271 |
| W54 explosion | 5,537 | 5,537 | 5,921 | 5,921 | 5,921 |
| W61 item | 626 @670 | 626 @670 | **506 @666** | 506 @666 | 506 @666 |
| W58 laser | 1,736 | 1,736 | 1,737 | 1,749 | 1,749 |
| W58 structures | 12,681 | 12,681 | 12,769 | 12,769 | 12,769 |

**Three things this table says that the brief's framing did not.**

1. `[M]` **W79 is completely green.** The gate was not "drifting"; it broke in
   one commit.
2. `[M]` **EVERY number moved at W80. W81 moved only three of them** (the W44
   totals, the enemy bullets and the laser). The brief's "six rises are the
   expected consequence of W80/W81" is right about the pair and wrong about the
   split: four of the six rises are W80's alone.
3. `[M]` **W82 moved nothing at all**, so nothing here is the boss wave's.

---

## 3. THE TWO THAT FELL, AND THE FOUR-FRAME SHIFT

### 3.1 It is not the emission, and that is measured, not reasoned

`[M]` W80's tree with `drawFamily269E16` short-circuited -- the family emits
nothing, everything else about W80 stands:

```
[M]                       shots  bullets  spark  explosion  item
    W79                  22,101    4,387  8,817     5,537    626
    W80 as shipped       22,000    4,401  9,271     5,921    506
    W80, enqueue OFF     22,000    4,401  9,271     5,921    506   <- identical
```

**Emission moves the family's own records and nothing else**, which is what
emission should do. So "we added emitters" does not explain one of these.

### 3.2 It fires -- and that is exactly +14, no more

`[M]` W80's tree with its two `fireFamily2814AC` calls disabled: bullets go back
to **4,387**. The `$269D84`/`$26A460` fans are the whole of shard 7's W80 delta.

### 3.3 It MOVES, and the board says the port is now right

`[M]` `$26A388..$26A3D8` counts `($1A,A6)` down -- the SPEED byte `$2417F2`'s
vector table is indexed by -- and the pre-W80 port never ran that block, so its
helicopters flew at their init speed for ever. Measured directly:

```
[M] type $27 in the W52 window, ($1A,A6) per frame
      W79   29 29 29 29 29 29 29 ...   (constant, for ever)
      W80   29 28 28 27 27 26 26 ...   (the ROM's own countdown)
[M] the BOARD's own histogram of ($1A,A6) over stage1-laser-hold's 325 live
    family sub-records: 1..29, spread, spiking at 20 and 28. It decays.
```

**And the falsifiable version, against the board's own RAM** -- seed the port
from a checkpoint, step 100 frames on the BOARD's own per-frame `portin`, and
compare with the board's next checkpoint, same slot, same type:

```
[M] stage1-laser-hold, 12 comparable pairs (69 rungs the port cannot step)
      W79   speed AGREE  0 / 12    position AGREE  0 / 12
      W80   speed AGREE 12 / 12    position AGREE 12 / 12   EXACT
      W81   12 / 12, 12 / 12       W82  12 / 12, 12 / 12
[M] stage1-sweep, the one pair it has:  W79 MISMATCH (board 3->26, port ->3),
    W80 OK (->26)
```

`[M]` The first divergence in the W52 window is at frame **107**, which is the
frame the family's first record appears, and the first count divergence is at
frame **154** (one fewer spark and one fewer explosion). The helicopters are
somewhere else, so the shots hit different things: more connections (+454
sparks), more kills (+384 explosions), and 101 fewer shot records because a shot
that connects is consumed.

### 3.4 Nothing is being silently truncated -- the obvious hidden regression, checked

`[M]` Over the W52 window, at W79 and at HEAD alike:

```
[M] frames that fired the 251-record queue cap                 0 and 0
[M] frames that fired the ROM's pre-emptive bucket-20 drop     0 and 0
[M] frames that fired the 6&9 drop                             0 and 0
[M] peak records in one frame                                100 and 116  (cap 251)
```

So the shot count did not fall because records were dropped off the end of a
list. Every record the port built is in the list.

### 3.5 The item: one kill, one span

```
[M] first type $85/$86 DEATH in the W61 window   W79 frame 669   HEAD frame 665
[M] the item's on-screen span                    W79 670..1296   HEAD 666..1172
[M] one item, one continuous span, one record per frame
```

The drop is four frames earlier and the pickup 124 frames earlier, because the
drop lands in a different phase of the ship's own 60-frame sweep. 626 - 506 =
120 is that span and nothing else. **This number is fragile and the gate now
says so in its own comment**: it is a LIFETIME. `first`, `distinct` and
`streams` are the three stable fields beside it and all three are still asserted
with `===`.

---

## 4. WHAT THE RE-BASELINE IS NOT

`[cited: docs/knowledge/03]` and `stageledger.py`'s RUNNABLE column are the
reason this section exists.

* **No assertion was widened.** Every field is still `===`. `pending`'s shard
  test was `size === 1 && has(7)`; it is now a SET EQUALITY over `[3, 7, 14]`,
  which is stricter, not looser -- a shard that stops being in flight moves it
  too.
* **`missing === 0` was NOT re-pinned.** It was the one honest red on the board
  and it is fixed rather than accommodated: 186 -> 0 by shipping the art.
* **The guard's `gMiss.size === 1` was NOT re-pinned.** 13 -> 1, back to
  `$000000` x5, the extent-rule over-read W58 left as the only live case.
* **Nothing was pinned to my own tree.** Every new number is W81's/W82's output,
  measured before I changed a line, and §6.1 shows each one red on the tree that
  produced the old one.

---

## 4.5 A LEAK HAZARD FOUND ON THE WAY, AND IT IS ONE LINE

`[M]` **`.scratch/` was never in `.gitignore`.** `[cited: W61 §7]` states
*"`games/ddpdoj/.scratch/` IS GITIGNORED, as it has been since wave 4"*, W60
relies on the same belief, and every wave since has put its src-mutating
harnesses there on that basis. `[M]` `git check-ignore` returns nothing for it,
and `git status` lists **591 untracked files across two `.scratch/` directories
-- PNG screenshots of the running game among them.** They are ROM-derived
imagery and they were one `git add -A` from a public repository. Nothing was
ever committed from them (`[M]` `git ls-files | grep .scratch/` is empty), so
this is a hazard and not an incident.

Fixed here, in the file that was supposed to say it, with the measurement in the
comment. It is not anchored, so it covers every game's. This is the sixth time
this project has found something "already written down" that was not true, and
the first where the thing written down was a SAFETY property.

---

## 5. THE TABLE THE BRIEF ASKED FOR

| # | check / field | was | is | cause | verdict |
|---|---|---|---|---|---|
| 1 | W44 `records` | 18,893 | 20,794 | W80 +975 ($05/$07/$27 emit), W81 +926 ($10/$82/$88 emit) | **re-pinned** |
| 2 | W44 `max` per frame | 82 | 99 | same two waves, same records | **re-pinned** |
| 3 | W44 `b23` bucket 23 | 2,432 | 3,001 | W80 +167, W81 +402 -- the new handlers' FIRE machines | **re-pinned** |
| 4 | W44 `pending` | 14 | 1,214 | shards 3 and 14 now have records in a window that fetches nothing; +186 of it is W84's own art arriving | **re-pinned** |
| 5 | W44 `pendingShard` | {7} | {3,7,14} | as above; tightened from a size-1 test to a set equality | **re-pinned (tightened)** |
| 6 | W44 `missing` | 186 | **0** | `$269EC8` unharvested; art exported | **FIXED** |
| 7 | guard `gMiss.size` | 13 | **1** | the same 12 addresses; art exported | **FIXED** |
| 8 | W52 shard 6 shots | 22,101 | 22,000 | **W80. The family moves as the board does (§3.3); a connecting shot is consumed.** Not emission (§3.1), not the cap (§3.4) | **re-pinned** |
| 9 | W52 shard 7 bullets | 4,387 | 7,070 | W80 +14 (measured exactly: the family's own fans, §3.2), W81 +2,669 ($10/$82) | **re-pinned** |
| 10 | W52 shard 7 `distinct` | 32 | 36 | W81's fans reach four bullet images this window never produced | **re-pinned** |
| 11 | W53 shard 8 spark | 8,817 | 9,271 | W80. More shots connect (§3.3). `distinct`/`first` unmoved | **re-pinned** |
| 12 | W54 shard 9 explosion | 5,537 | 5,921 | W80. The spark's own consequence: more kills | **re-pinned** |
| 13 | W61 shard 12 item `records` | 626 | 506 | **W80.** One item, one span, collected 124 frames sooner (§3.5) | **re-pinned** |
| 14 | W61 shard 12 item `first` | 670 | 666 | **W80.** Slot 18, type `$85`, dies at f665 instead of f669 | **re-pinned** |
| 15 | W58 shard 10 laser | 1,736 | 1,749 | W80 +1, W81 +12. The beam stops where it hits; both waves put enemies in front of it | **re-pinned** |
| 16 | W58 shard 11 structures | 12,681 | 12,769 | W80 only. Same cause as the spark | **re-pinned** |

**14 re-pinned, 2 fixed.** (Counting fields, not stages: 12 figures across 7
stages if `pendingShard` and `distinct` are folded into their stages.)

---

## 6. EVERY CHECK SEEN TO FAIL

### 6.1 The new numbers, red on the trees that produced the old ones

`[M]` W84's `webgate.mjs` copied into the W79/W80/W81 worktrees, run over the
same bundle:

```
[M] against W79  8 stages RED -- records 18893 (expect 20794), pending 14 on
                 shard 7 (expect 1214 on 3+7+14), shots 22101 (expect 22000),
                 bullets 4387/32 images (expect 7070/36), spark 8817 (9271),
                 explosion 5537 (5921), item 626 @670 (506 @666),
                 laser 1736 (1749), structures 12681 (12769)
[M] against W80  3 stages RED -- and EXACTLY the three W81 moved:
                 records 19868, bullets 4401/32, laser 1737
[M] against W81  GREEN -- which is what says these numbers are W81's output and
                 not mine, and that W82 moved none of them
```

### 6.2 The art fix, seen to fail

`[M]` `export-web.mjs` with the `$269EC8` harvest row deleted, re-exported to a
scratch bundle:

```
[M] webgate --assets <that bundle>
      FAIL W44 ... 186 with NO ART ANYWHERE (expect 0)
        NO ART: $17253Cx95 $172560x43 $172584x21 $172344x10 $1725CCx6 ...
      FAIL W44 the guard FIRES ... 13 distinct addresses (expect 1)
        NO ART: $1725CCx249 $172584x173 $17253Cx170 $172344x140 $1725A8x108 ...
```

byte for byte the failure the brief opened with, and `tests/web-spr-shards.test.js`'s
new test goes RED alone on the same edit.

### 6.3 The mutations that were already there

`[M]` `webgate --break` is unchanged and still red-validates: `missing-file`,
`truncated`, `not-gzip`, `no-remap`, `drop-one-stream`, `lag-0`,
`terminate-instead-of-zero-width`, `no-extent-check`, `spr-shard-404`,
`draw-pending-shard`. `[M]` `--break draw-pending-shard` is asserted as a VALUE
inside the run and passed.

### 6.4 What could NOT be made to fail, and it is worth saying

`[M]` **The `distinct` and `first` fields of shards 8, 9, 10 and 11 do not move
under any of these waves.** I could not construct a version of W80 or W81 that
moved a `records` count and left `distinct`/`first` alone by accident -- they
moved together or not at all, which is what makes "the same animation more
often" a claim and not a hope. That is a limit of the evidence, not a mutation I
skipped.

---

## 7. **THE PAGE, OPENED, AND WHAT I SAW**

`[M]` `python -m http.server 8784` over the working tree, real Chrome
(`C:\Program Files\Google\Chrome\Application\chrome.exe`) driven by the
`playwright` package that was already installed -- nothing was downloaded --
`http://127.0.0.1:8784/games/ddpdoj/index.html`, Down held and the shot held
(`KeyY`+`KeyZ`, both, as the standing Swiss-QWERTZ rule requires).

```
[M] 337 samples, lf2030 .. lf6457, 60.0 Hz
[M] shards 8/8 (BG) and spr 17/17 on the last sample; 2,125 streams
[M] display-list records carrying, over those samples:
      the family's BODY     ($269E48's 32)     975   first lf2110
      the family's ARM B    ($269EC8's 32)     469   first lf2187   <- W84's art
      the family's ARM A    ($269BB6's 4)      506   first lf2110
      the FIGHTER  $1735FC / $173810         1,049   first lf3849
      type $88's three families                168   first lf5247
[M] the status line's NO ART names ONLY $231520 $232578 $232EAC -- the
    bucket-2/3 background terrain W81 §9.1 left open. It never names a $172xxx,
    a $1735FC or a $17D480.
[M] page errors: one 404, and it is the favicon.
```

**What I actually looked at.** The stage-1 city street, the ship at the bottom
firing, tank hulls and turrets rolling up the road, pink enemy bullets, and at
lf~4,100 a formation of **blue-and-white forward-swept-wing fighters** across
the upper half of the screen -- W81's `$82`, plural, in colour. The screen is a
game, not a debug view.

`[M]` **AND I CROPPED AT THE RECORD'S OWN COORDINATES, not by eye** (W81 §5's
rule). At lf2129 the port's own list holds `$172560`, `long 292 short 40 size
$0410 pal 24`; the crop at canvas (40, 155) is **a dark grey-and-olive armoured
gunship on the road, in colour, with its rotor housing and side pods legible**.
That descriptor drew nothing at all before this wave.

`[M]` And the headless A/B, because a crop can be argued with: the same logic
frame (lf2195) rendered twice through the page's own `renderIndexed` with
`spriteStride: RAM_STRIDE`, once over the shipped bundle and once over the
bundle with the harvest row removed -- **1,536 pixels appear, in one region,
x 77..172 / y 121..166**, and `missing` goes 2 -> 0.

**What is still wrong on that screen, and it is not this wave's:** black
silhouettes where the bucket-2/3 background elements should be
(`$231520`/`$232578`/`$232EAC`), which is `[cited: W68 §5.2, W75 §3.4, W81 §9.1]`
and still open. The HUD is still the recording's and `capture.bin` still ships.

---

## 8. **THE BAR -- WHICH CONDITIONS I MET**

**Condition 1, FEATURE COMPLETE: MET.** `[M]` `publish.mjs --only ddpdoj --dry`
is green; the helicopters (both their sprites), the fighter and the mech are on
the live page in Chrome and I looked at them (§7). It is **not** the whole of
`[cited: 39-OWNER]` condition 1 and must not be read as such: the capture ledger
is not empty, the black terrain is untouched, and there is no sound.

**Condition 2, ORACLES PERFECTLY: MET, with one stated limit.** `[M]` Every
re-pinned number is justified against something that is not my own output: a
commit-level attribution over five worktrees with the bundle held constant
(§2), a mutation that isolates emission from behaviour (§3.1), a mutation that
isolates the fire fans exactly (§3.2), and the board's own RAM for the motion
that moved everything else (§3.3, 12 of 12 exact where W79 was 0 of 12). The
art fix is decided by the board's own display list (§1.2).

**THE LIMIT, STATED:** `webgate`'s W52/W53/W54/W58/W61 windows are PORT-SIDE
SCENARIOS -- the shipped seed with a synthetic input script -- and **no board
recording of those scenarios exists**. So "22,000 shot records is the right
number" is not directly checkable against the board and I do not claim it is.
What is checkable, and is checked, is the CAUSE: the object whose behaviour
changed now matches the board exactly where it did not before. A future wave
that wants these counts board-anchored needs a MAME run of these exact input
scripts, which is a `pgm.py ckpt`-shaped job and nobody has one.

---

## 9. THE MEASUREMENTS, ALL OF THEM

```
[M] node --test games/ddpdoj/tests/        1004 pass, 0 fail, 0 skipped
                                           (1003 before + 1 mine)
[M] node tools/publish.mjs --only ddpdoj --dry   GREEN, dist 255 files 6,413 KB
[M]   ddpdoj bundle gate                   PASS 15955968/15955968 = 100.0000%
[M]   ddpdoj web fetch gate                every stage PASS
[M]   rom-leak guard                       251 files, 12 ROMs, clean,
                                           SIX deliberate exceptions (unchanged)
[M] python pgm.py check --reuse            72 passed, 2 failed, 0 SKIPPED --
                                           the SAME two, NOT this wave's, and
                                           §9.1 names both and dates them
[M] node games/ddpdoj/tools/webgate.mjs against W79 / W80 / W81 worktrees
                                           8 RED / 3 RED / GREEN  (§6.1)
[M] the harvest row deleted + re-exported  186 NO ART and 13 addresses, back
                                           (§6.2)
[M] browser, Chrome, 337 samples           §7
```

`[M]` `pixgate`, `gfxgate` and `dlgate` are inside `pgm.py check` above and are
green there. `bundlegate` is inside `publish.mjs` and is 100.0000 %. `[M]`
`w80emitgate` over `stage1-laser-hold` is **RESULT GREEN**, 22 types, `$05` 2/2
`$07` 24/24 `$27` 3/3 `$82` 57/57 `$10` 27/27 `$88` 3/3 with art for every one,
and `seedcmp fly-around` is 8 of 8 green -- both re-run after the `FAM.armBArt`
rename, which is how I know a rename is all it was.

### 9.1 THE TWO RED STAGES, NAMED AND DATED -- AND THE SECOND ONE IS NEW
### INFORMATION

```
[M] [FAIL] segment sweep: the port re-seeded from the board at every rung
[M] [FAIL] THE LASER BOMB: $249A80, $255FE2 and $2456A6   -- 14 passed, 8 failed
```

`[M]` Neither is this wave's, and I checked rather than assumed -- the beam
gate, run against worktrees over the same bundle:

```
[M] W79   22 passed, 0 failed
[M] W80   14 passed, 8 failed     <- it broke HERE
[M] W81   14 passed, 8 failed
[M] W82   14 passed, 8 failed
[M] HEAD  14 passed, 8 failed     <- byte for byte W82's, so W84 moved nothing
```

**That is a finding and it is not in any document.** The laser-bomb gate went
red at W80, the same commit as all nine `webgate` numbers, and no worklog has
attributed it. Its eight failures are the bomb never firing in that scenario
(`BUTTON 2 FIRES A BOMB: fired 0 + 0`, `THE RECORD GOES LIVE: 0 frames live`),
which is the same shape as everything else W80 moved: **the helicopters are
somewhere else, so the scripted press lands in a different state.** Whether the
right answer is to re-derive that gate's script or to fix a real defect it has
caught, I do not know, and I did not touch it -- the brief is explicit that the
two standing reds are not mine. **It is the next wave's, and it should be
briefed as "W80 broke it", not as a mystery.**

**THE SERVER.** `[M]` `python -m http.server 8784` was started for §7 and
killed: `taskkill /PID 19308 /F` returned ERFOLGREICH, and
`curl http://127.0.0.1:8784/` then returned 000 (connection refused). The only
`python.exe` left on the machine is another agent's `fb_mutcov.py`.

---

## 10. WHAT I COULD NOT DETERMINE

1. **Whether 22,000 / 9,271 / 5,921 / 506 are the BOARD's numbers.** §8's limit.
   They are the port's, they moved for a cause that is board-verified, and
   nothing in this repo can compare a synthetic input script against the
   cartridge.
2. **Whether arm B is drawn in the right PLACE and at the right DEPTH.** This
   wave gives it a picture and shows the picture arriving at the record's own
   coordinates. `[cited: W81 §1.5]` -- no gate in this repo compares an enemy
   record's BUCKET, and a record at the wrong depth is green everywhere.
3. **The other 32 entries of `$269E48`'s run.** The run is 64 and both halves
   now ship, so nothing is left there; but I did not re-examine the other five
   families whose "bucket" longs may be the same shape. `[M]` A grep for the
   pattern (`lea <table> / move.l (A0,D1.w),($2C,A5)`) is the next reader's
   cheapest hour, and I did not spend it.
4. **The black terrain.** Untouched, still half the owner's original complaint.
5. **Why `$1725CC` dominated the guard window's misses (249, against `$172734`'s
   14).** It is one heading of the table and its share is a function of where
   the helicopters point; I did not chase it, because the whole table ships now
   and the distribution stopped being observable.

---

## LOG (appended as findings arrived)

- opened. Read W80, W81, NOTE 83, 39-OWNER. Reproduced: 9 FAIL, 186 NO ART.
- `[M]` §2: **W79 IS COMPLETELY GREEN and W80 broke all nine at once.** Five
  worktrees, same gate, same bundle. W82 moved nothing.
- `[M]` §1.1: **the 186 are ONE TABLE**, `$269EC8`, read straight out of the
  cartridge; 12 of the guard's 13 addresses are the same table.
- `[M]` §1.3: **my first board census said 0 and it was censored** -- `kinds`
  can only attribute slot-record draws, and both draw arms are register-built.
  Note 83's shape, one level along.
- `[M]` §1.2: the board's own display list carries 54 arm-B and 359 arm-A
  entries. So the port is right to emit and the exporter was wrong to skip.
- `[M]` §3.1: **the decreases are not emission** -- W80 with the enqueue off
  gives the identical 22,000 / 4,401 / 9,271 / 5,921 / 506.
- `[M]` §3.2: the fire fans are exactly +14 bullets, no more.
- `[M]` §3.3: **($1A,A6) decays on the board and did not in the port.** 12 of 12
  speed AND position exact after W80, 0 of 12 before, on the board's own input.
- `[M]` §3.5: the item's four frames are slot 18's death moving 669 -> 665, and
  the 120 records are one pickup arriving a sweep earlier.
- `[M]` §3.4: no cap, no pre-emptive drop, peak 116 of 251 -- nothing truncated.
- `[M]` §1.5: shard 3's deadline moved from lf6426 to lf2106 and W81's own
  ordering assertion is what caught it.
- `[M]` §6.1: the new numbers are RED on W79 (8 stages) and on W80 (exactly the
  three W81 moved) and GREEN on W81.
- `[M]` §7: **the page in Chrome** -- 469 arm-B records drawn, `NO ART` naming
  only the known terrain, and the crop at the record's own coordinates is an
  armoured gunship in colour.
- `[M]` §4.5: **`.scratch/` was never in `.gitignore`** though three worklogs
  say it is. 591 untracked files, screenshots of the running game among them.
  Nothing was ever committed from it; one line fixes it.
- `[M]` §9.1: **the second standing red, the LASER BOMB gate, also broke at
  W80** -- 22/0 at W79, 14/8 from W80 onward and byte-identical at HEAD. Nobody
  had dated it. Not mine, not touched, and the next brief should say so.
- `[M]` §9: 1004 tests, 0 fail. publish --dry GREEN. `pgm.py check` 72/2/0, the
  same two, and I added no third.

status: **DONE**
