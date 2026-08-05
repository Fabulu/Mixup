# W56 — DIAG: does the stage-1 midboss stop the scroll?

status: **DONE**

**HEADLINE, and the brief's framing is wrong in a way that matters.** The ROM
has **no midboss halt at all**, conditional or otherwise. What the midboss
window contains is a **scripted SLOWDOWN to 0.125 px/frame**, on a fixed
distance-clock schedule with no condition anywhere in it, and **the live
deployed page reproduces it exactly** — [M] 635 frames of crawl,
lf3628..lf4263, of which the 0.125 px/f half is 576 frames to the frame. So the
owner's "no stop at all" and W31's "179-frame halt" are two views of the same
correct behaviour, and neither is what W31's §3.1 said it measured.

**THE REAL DEFECT IS THE ONE THE BRIEF PUT LAST.** The release path W31 filed as
"transcribed and never exercised" now runs, and it **stops the live page dead**:
kill the midboss and the deployed build throws
`UNPORTED $26C1C4` — the init stub of enemy type `$1C`, the object the midboss's
own death enqueues at `$26B7E0`/`$26B7E2`. [M] Reproduced three times on
`https://gbtman.pages.dev/games/ddpdoj/`. **The owner cannot kill the first
midboss without the game stopping.**

wave: 56. role: DIAGNOSTIC (READ-ONLY on `games/ddpdoj/src/` and `tools/` —
E5b/W54 and W55 were writing there; this worklog is the only file I commit).
`games/gradius/` not touched.
date: 2026-08-05.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B.
instrument: `games/ddpdoj/tools/oracle/out/maincpu.bin` (decrypted, address ==
offset) via `tools/oracle/w27disasm.py` and `xref.py`; the live page via Chrome +
Python `playwright` (the W42 recipe). **No web server was started this session —
every browser number is off the DEPLOYED URL** — and [M] the post-run sweep
(`Get-CimInstance Win32_Process`) found zero `http.server`/`serve.py` processes.

`[M]` = measured by me this session. Anything else is cited by document.

---

## 0. THE BRIEF'S PREMISE, CHECKED — it offered three behaviours and the answer is a fourth

The brief framed this as halt-until-killed vs. halt-179-frames vs. no-halt.
**None of the three is the ROM.** The ROM does this:

| distance clock `$8130CE` | speed `($1C,A5)` | px/frame | frames in the band |
|---|---|---|---|
| `$0098`..`$00E4` | `$0020` | 0.500 | (long approach) |
| **`$00E5`**..`$00E6` | **`$0010`** | **0.250** | 2 ticks × 32 f = **64** |
| **`$00E7`**..`$00EF` | **`$0008`** | **0.125** | 9 ticks × 64 f = **576** |
| `$00F0`.. | `$0020` | 0.500 | — |

640 frames of crawl on a fixed schedule, released by a record with **no
condition**, and the midboss's death does not release it — it **multiplies the
speed by four** and therefore ends the crawl about four times sooner. §1 proves
each half out of the listing.

So "it's supposed to stop until he is dead" and "you kinda just scroll past" are
**both descriptions of the same 0.125 px/f band**, seen with and without a kill.
The owner is not wrong about what he saw; the model of a hard halt-until-dead is
what stage 1 does not have. `20-OWNER-minibosses-stop-the-scroll.md`'s constraint
survives in spirit — the scroll does effectively stop, and killing him does end
it early — but not as a gate.

And W31 §3.1's evidence is a **misread register** (§3). Both documents that
disagree were reading the same true thing through the wrong instrument.

---

## 1. WHAT THE ROM SAYS THE HALT IS

### 1.1 THE WHOLE STAGE-1 SCROLL PROGRAM, DECODED THIS SESSION

Pair table `$26153E` (read at `$261532` off `$813096`); stage 1 → pair
`($261610, $26179A)`. Record layout `time.w / cond.w / op.w / operands`, operand
widths taken from the seven op handlers (`$2620DE $262102 $26213A $26214C
$262160 $262180 $2621D6`, dispatched by BYTE offset through `$2620C2`). My own
decoder, not a citation:

```
$261618 t=$0000 op=$08 SPEED $0200 = 8.000 px/f
$261620 t=$0034 op=$04 REPEAT rewind=-28 len=28 loops=$0002     <- FINITE
$26162C t=$0034 op=$0C FREEZE
$261632 t=$0038 op=$00 OBJ  ... 26 more records ...
$26169A t=$0098 op=$08 SPEED $0020 = 0.500
$2616AE t=$00C0 op=$10 ELEM $0000
$2616BA t=$00E0 op=$00 OBJ  $0001                <- the object-stream step
$2616C2 t=$00E5 op=$08 SPEED $0010 = 0.250       <- ***THE SLOWDOWN BEGINS***
$2616CA t=$00E7 op=$08 SPEED $0008 = 0.125       <- ***THE CRAWL***
$2616D2 t=$00EE op=$10 ELEM $0003
$2616DE t=$00F0 op=$08 SPEED $0020 = 0.500       <- ***THE INSTRUCTION THAT ENDS IT***
... $2616E6 .. $26177E ramp back to $0100 = 4.000 by t=$0218 ...
$261786 t=$0344 op=$04 REPEAT rewind=-14 len=14 loops=$FFFF     <- the BOSS
$261792 t=$0344 op=$0C FREEZE
$261798 TERMINATOR
```

**Coverage, with denominators.** 41 of 41 script-0 records and 16 of 16
script-1 records decoded, `$FFFF` terminators found at both ends (`$261798`,
`$261822`) — the same 41 + 16 = 57 W49 §1 reports, re-decoded. **32 of the 57
are op-`$08` SPEED**, and 3 of the 32 are the slowdown band.

### 1.2 THE INSTRUCTION THAT ENDS THE CRAWL, AND ITS CONDITION — there is none

The record that restores the speed is `$2616DE`, and it is executed by

```
26213A: 45ed0022   lea $22(a5),a2        op $08's handler
26213E: 4a46       tst.w d6              d6 = 1 on script 0
262140: 67000006   beq.w $262148
262144: 45ed001c   lea $1c(a5),a2        <- the ALONG-axis speed
262148: 3499       move.w (a1)+,(a2)     <- ***THE WRITE***
```

reached from the walker's only test:

```
262072: 3219       move.w (a1)+,d1       the record's TIME
262074: 0c41ffff   cmpi.w #$ffff,d1      terminator?
26207C: be41       cmp.w d1,d7           d7 = $8130CE, THE DISTANCE CLOCK
26207E: 66000016   bne.w $262096         not this frame -> stop walking
262082: 5449       addq.w #$2,a1         <- ****THE COND WORD IS SKIPPED****
262084: 3419       move.w (a1)+,d2       the OP
```

> **`$262082 addq.w #$2,A1` never reads the record's second word.** The scroll
> VM has no conditional dispatch at all: the sole gate on every record in the
> stage is `time == $8130CE`. That is a listing-level ABSENCE claim and it is
> the strong kind — not "no record happens to be conditional" (all 57 do carry
> `cond = $FFFF`), but **the machine cannot express one.**

So the crawl **cannot** be conditional on the midboss being alive. It is a timed
band that releases regardless, and the releasing instruction is `$262148
move.w (a1)+,($1C,A5)` executing `$2616DE` when `$8130CE` reaches `$00F0`.

### 1.3 THE ONLY DOOR THAT CAN CHANGE THE SPEED FROM OUTSIDE — and the midboss's use of it is a SPEED-UP

`($1C,A5)` has exactly one non-script producer, and its enumeration is closed
[M] this session:

```
$813180  written at $261104 only (=1), cleared at $2612B4, read at $2612AA
$813182  written at $26110A only,      read at $2612BE -> ($1C,A5)
$813184  written at $261110 only,      read at $2612C6 -> ($22,A5)
```

`$261100` has **9 `jsr` call sites** (`xref.py callers 261100`, absolute-long
only, so a lower bound): `$26B73A $26D802 $26D864 $26E04C $26E152 $26F614
$26F6C6 $2A5D28 $2A61E0`. **`$26B73A` is the midboss's**, and it pushes

```
26B722: 0c2d00300017   cmpi.b #$30,$17(a5)   the death countdown passes $30
26B72C: 4279008130d8   clr.w $8130d8
26B732: 303c0020       move.w #$20,d0
26B736: 323c0020       move.w #$20,d1
26B73A: 4eb900261100   jsr $261100           ($1C,A5) := $0020 = 0.500 px/f
```

**`$0020` is FOUR TIMES the `$0008` the script is holding during the crawl.**
So killing the midboss does not unfreeze anything; it quadruples the distance
clock's rate, so the remaining ticks to `$00F0` pass in a quarter of the time.
Kill him at the first legal moment and the crawl is 9 ticks × 16 f = **144
frames** instead of 576. **That is the whole of "the scroll resumes when he
dies", and it is a rate change, not a gate.**

### 1.4 THE MIDBOSS IS INVULNERABLE UNTIL THE CRAWL STARTS — same clock, same value

```
26B7BA: 4a6e0018   tst.w $18(a6)            part-0 HP
26B7BE: 6a00005c   bpl.w $26b81c            still alive
26B7C2: 0c7900e7008130ce  cmpi.w #$e7,$8130ce
26B7CA: 6400000c   bcc.w $26b7d8            clock >= $E7 -> ***DIE***
26B7CE: 3d7c02000018      move.w #$200,$18(a6)   <- HP RESTORED, cannot die
26B7D4: 60000046   bra.w $26b81c
```

`$00E7` is the **same constant** as the `$0008` SPEED record `$2616CA`. The
midboss becomes killable on the exact tick the crawl begins. Two more clock
constants in the same handler: `$26B74A cmpi.w #$D8` → `($21,A5) := 1`, and
`$26B75C cmpi.w #$F8` → `($21,A5) := $FF`.

### 1.5 IS IT THE SAME MECHANISM AS THE STAGE-1 BOSS? NO — three different things

| | midboss | stage-1 boss |
|---|---|---|
| mechanism | op-`$08` SPEED `$0008` for 9 ticks | op-`$04` REPEAT `loops=$FFFF` + op-`$0C` FREEZE at t=`$0344` |
| camera | **slows to 0.125 px/f** | **never slows** — W49 §0 measured 4.000 px/f forever |
| what stops | the picture, nearly | only the distance clock (`$26132C`, the one thing `($8,A5)` gates) |
| release | `$2616DE` at clock `$00F0`, unconditional | none — W49 §2: the background OBJECT is destroyed by `$25FCFA` |

W49's finding ("nothing freezes the camera — the CLOCK is parked, not the
camera") is about the BOSS and it is still right. The midboss is the opposite
shape: **its camera really does almost stop, and its clock keeps running.**
Anyone carrying "the freeze" as one concept across both is carrying two
mechanisms in one word.

---

## 2. WHAT THE LIVE PAGE DOES  [M]

`https://gbtman.pages.dev/games/ddpdoj/`, Chrome + playwright, `#stats` sampled
every ~150 ms. Boot lands at lf2014/clk106 in every run. Three runs.

### 2.1 RUN A — NO INPUT, 70 s. THE CRAWL IS THERE, TO THE FRAME

`bg` (the port's `bg_yscroll`) differenced against `lf`:

```
lf 2029..3613   clk 108..229    1.000 then 0.500 px/f     (the approach)
lf 3628         clk 229         0.267 px/f  <- SPEED $0010 lands
lf 3672         clk 230         0.267
lf 3687         clk 231         0.133 px/f  <- SPEED $0008 lands
lf 3746..4249   clk 232..239    0.125..0.143 px/f, 1-2 px per 15-frame sample
lf 4263         clk 240         0.500 px/f  <- ***RELEASED***
lf 4278..6143   clk 241..358    0.500 px/f
```

| | measured | ROM says |
|---|---|---|
| 0.125 px/f band | **lf3687 → lf4263 = 576 frames** | 9 ticks × 64 f/tick = **576** |
| whole slow band | **lf3628 → lf4263 = 635 frames ≈ 10.6 s** | 64 + 576 = 640 |
| release clock | **240** | `$00F0` = 240 |
| crawl rate | **0.125–0.14 px/f** | `$0008`/64 = 0.125 |

**The deployed port reproduces the ROM's slowdown schedule exactly.** The
0.125-px/f band is 576 frames against a predicted 576, and the release lands on
clock 240 against a predicted `$00F0`. Nothing about the halt is broken.

Run A never crashed: it ran to lf6158/clk359 with an empty `#err`.

### 2.2 RUN B and RUN C — FIRE HELD. THE PAGE STOPS, BOTH TIMES

| run | input | stopped at | error |
|---|---|---|---|
| B | `ArrowUp` + `z` held from lf2016 | **lf3674, clk 231** | `UNPORTED $26C1C4` |
| C | `z` held only, ship never moved | **lf3766, clk 232** | `UNPORTED $26C1C4` |

Both stops are within 2 clock ticks of `$00E7` = 231 — **the first tick on which
`$26B7C2` lets the midboss die.** The stack, off the deployed page's own
console:

```
UNPORTED $26C1C4: word at $26C1C4 is outside every ROM window exported by
tools/export-tables.py (...)
    at RomWindows.u16   src/rom.js:50
    at initDispatch     src/spawn.js:198
    at processDeferred  src/spawn.js:457
    at runSpawnWalker   src/spawn.js:483
    at runEnemyFrame    src/enemyframe.js:105
    at type5            src/type5.js:226
```

`src/spawn.js:198` is `const runLen = rom.u16(init + 2)`, so `init = $26C1C2`.
`$26C1C2` is entry **`$1C`** of the LO type table `$267824` (stride 8 —
`$267824 + 8×$1C = $267904`; the same arithmetic puts the midboss's own
`$26B47C`/`$26B6FA` pair at `$26788C`, which is what pinned the base). Its
handler is `$26C20C`.

**And the enqueuer of type `$1C` is the midboss's death, uniquely.** [M] I
scanned `$230000..$2B0000` for every absolute-long `jsr $263684` / `jsr $263690`
(44 sites) and looked 16 bytes back for `moveq #$1C,D0` (`70 1C`) or
`move.w #$1C,D0` (`30 3C 00 1C`): **exactly one hit, `$26B7E2`, whose `moveq` is
`$26B7E0`** — inside the midboss's own death block `$26B7D8..$26B812`. (Method
limit: `bsr` forms and register-indirect calls are invisible to this scan, so
"one site" is a lower bound; but the one it found is the one on the stack.)

`games/ddpdoj/src/midboss.js:730` does `enqueueDeferred(ram, 0x1c, DEFQ_D1.FIXED00)`
— **the port is faithful here.** What is missing is the destination.

### 2.3 THE ORDER MATTERS: THE `$261100` PUSH IS STILL UNEXERCISED

`$26B7D8`'s block (which enqueues type `$1C`) runs on the **alive** path
(`$26B6FE beq $26B74A`, i.e. `($17,A5) == 0`). The `$261100` push at `$26B73A`
needs `($17,A5) == $30`, which is strictly later. So the port throws **on an
earlier frame than the one that would push the scroll speed**.

> **W31 §3.2 said the release is "transcribed and unexercised". It still is —
> and now provably UNREACHABLE in the shipped build**, because the type-`$1C`
> throw fires first, every time. The brief's point 5 is correct and stronger
> than it was put: the release has not merely gone unmeasured, it cannot run.

### 2.4 THE `$26C20C` SIDE, from the listing — what type `$1C` actually is

```
26C20C: cmpi.w #$105,$8130ce / bne $26c220 / jmp $263762   free itself at clock $0105
26C220: lea $227af8,a1 / lea $9000bc,a0 (or $9000a4 if $803926)
26C23C: 23 rows x 9 longwords: (a1)+ + $32A90000 -> (a2), a2 += $100
```

A **palette/gradient write into PGM register space `$9000xx`**, held from the
midboss's death until distance clock `$0105` = 261 — i.e. through the rest of the
crawl and past its release. It is the midboss-cleared screen effect. Its ROM
source `$227AF8..$227E34` (207 longwords) is **already inside the exported window
`$225B78+$22E0`**; only the `$26C1Cx` end is missing.

---

## 3. RECONCILING W31 — nothing regressed, and §3.1 cited the wrong register

**`$813172` is not the stage scroll.** Traced this session:

```
2613BA: move.w $81316a,d0        the PLAYER-follow delta ...
2613CA: add.w  $2a(a5),d0        ... accumulated
2613D6: cmpi.w #$800,d1 / bls    clamped to +-$800  (= +-32 px at 1/64 px)
2613EA: andi.w #$ffc0,d0
2613F2: move.w d0,$28(a5)
...
2614FE: move.w $813172,$813170   previous
261508: move.w d1,$813172        <- ($28,A5), i.e. THE LATERAL CAMERA
26151E: move.w d2,$813176        <- its per-frame CHANGE
```

and `$81316A`'s only producers are `$261464` (both players' `$5C(a1)` deltas) and
`$2614E4` (`(($4,A6) − $1C00)/$C8 << 6 − ($28,A5)`, a player coordinate). Its
consumer `$24268C` adds it to the LOW word of an object's `$2(a6)` — the same
axis. **`$813172` is a ±32-pixel camera that follows the ship sideways, and
nothing else writes it.** The along-axis camera is `$80B012`/`$80B016` via
`$240B94`, off `($1C,A5)`; `$813172` is not in that chain at any instruction.

So W31 §3.1's "`$813172` pins at 1600 from lf4021 to lf4200 with `$813176` = 0 ←
the scroll STOPS" measured **the ship standing still sideways**, over exactly the
window in which the real thing — the 0.125 px/f along-axis crawl — was happening
next to it. W31's other observation in the same paragraph, that `$8130CE` ticked
236 → 239 across 181 frames, is **the correct evidence and it was labelled as a
caveat**: 181/3 ≈ 60 frames per tick is `$0008`, the crawl, to within sampling.
The 16-column zero-divergence result is untouched by any of this — it says the
port matched the board, which it did and still does.

**WHICH WAVE BROKE IT: NONE.** [M] Run A shows the slowdown intact on the
deployed build, 576 frames against a predicted 576. I looked for a regression
among E1/E2/E4/E5a/W45/L3 and there is nothing to attribute — the behaviour W31
described never existed, and the behaviour that does exist still works.

**WHAT DID CHANGE IS THAT THE MIDBOSS CAN NOW BE KILLED.** W31 §3.2 said no run
in the corpus killed it. `fly-around`'s tail is pure stick, so it never could.
W34 landed damage and **L3/W51 made the beam kill** (`a3df8ab`, `07c2b15`), and
the owner plays with fire held. That is what walked the port into `$26B7D8` for
the first time in 25 waves. It is exactly the shelf-life failure the brief named
with W45's score forks: **"never exercised" stops being a description of the code
and becomes a description of the player, and the player changed.**

---

## 4. DOES THE MIDBOSS SPAWN IN THE LIVE BUILD? YES  [M]

The midboss's own sprite-pointer tables, dumped from the ROM:

* `$26BE70` — 8 longs: `$12D430 $12D474 $12D4B8 $12D4FC $12D540 $12D584 $12D5C8 $12D60C`
* `$26BE90` — 32 longs: `$12C7B0 … $12D3CC`, stride `$64`

Every one of the addresses the live page prints in its `NO ART` field through
the midboss window is from those two tables:

```
lf3109 clk197   NO ART 30: $12CA08x8 $12D430x8 ...   <- FIRST midboss records
lf3687 clk231   NO ART 24: $12CA6Cx8 $12D430x8 ...
lf4945 clk283   NO ART   : $12D2A0x8 $12D430x8 ...   <- still emitting, run A
```

**The object is created, its handler runs, and it emits 16 records per frame
(8 arms + 8 body) from lf3109 (clk 197) onward** — 90 clock ticks before the
crawl starts, and still going 43 ticks after it ends. Not one of those 16 is
drawn: their streams are absent from the shipped sheet, which is W55's subject,
not this one.

> So the defect is **not** a missing object. The midboss spawns, animates,
> holds the camera in a crawl on schedule, and is invisible. Three separate
> facts, and only the third is the art wave's.

---

## 5. WHAT I COULD NOT DETERMINE

* **Whether the board's crawl is 576 frames too.** No MAME was run. The 576 is
  the ROM's arithmetic (9 ticks × `$200`/`$0008`) and the deployed port's
  measurement agreeing with it. Two readings of the same model, not a board
  comparison.
* **Where `($17,A5)` is set.** The midboss handler only tests and decrements it
  (`$26B6FA`, `$26B712`, `$26B718`, `$26B722`, `$26BDFC`); nothing in
  `$26B6FA..$26BE70` writes it. It must come from `$286096`/the damage side,
  which I did not walk. So I cannot say how many frames elapse between the death
  block `$26B7D8` and the `$26B73A` push — only that the push is later, which is
  enough for §2.3.
* **Whether the midboss stays on screen as long on the board.** It self-frees at
  `$26B8D8 cmpi.w #$DC00,$2(a6)`, i.e. when it has drifted past a position. [M]
  the port still had it at clk 283; the board's exit tick is unmeasured.
* **Whether `$26C20C`'s `$9000xx` writes have a visible consequence in this
  port.** It writes PGM palette registers; the port's renderer's relationship to
  `$9000A4`/`$9000BC` I did not read.
* **The other eight `$261100` call sites.** I confirmed 9 sites and identified
  one. The other eight are in `$26Dxxx/$26Exxx/$26Fxxx/$2A5xxx` handlers I did
  not attribute to a stage.
* **Anything about the local tree's behaviour.** Every browser number is the
  DEPLOYED build. [M] `src/spawn.js` is byte-identical between the deployed page
  and `HEAD`, and neither `HEAD` nor the working tree's `export-tables.py`
  contains a `$26C1xx` window — so the defect is in the current tree too — but I
  did not run the port locally and did not start a server.

---

## 6. THE CAUSE, AND THE WAVE THAT FIXES IT

**CAUSE.** Not the halt. The halt is correct and measured correct on the live
build. The cause of everything the owner can actually complain about here is:

1. **The midboss's death spawns enemy type `$1C` (`$26B7E0`/`$26B7E2`) and type
   `$1C` is not ported.** Its init stub `$26C1C2`, init body `$26C1CA` and
   handler `$26C20C` are outside every window `tools/export-tables.py` exports,
   so the first read throws and the page stops. Reproduced [M] three times on the
   deployed URL, at clk 231 and clk 232.
2. **Because of (1), `$26B73A jsr $261100` — the scroll's 4× speed-up on the
   midboss's death — has still never run.** It is on a later frame than the
   throw.
3. **The midboss is invisible** (W55's subject), so the 10.6-second crawl reads
   as a pointless pause rather than as a fight, which is what "you kinda just
   scroll past" describes.

**THE FIX — one small wave, call it W57 / M1.**

| item | size | what |
|---|---|---|
| a ROM window over `$26C1C0 + $50` | 1 line in `export-tables.py` | covers the stub `$26C1C2`, the body `$26C1CA`, the proto word `$26C1EE` and the 12-byte stats record `$26C1F0`. `$227AF8`'s 207 longwords are already inside `$225B78+$22E0`. |
| port `$26C1CA` | **5 instructions** | `$2637A2` (stats, already ported), `$26377A` (`loadRecordProto`, already ported, D0=0), `move.l #$38001C00,$2(a6)` |
| port `$26C20C` | **23 instructions** | the clock-`$0105` self-free (`$263762`, ported) plus the 23×9-longword `$9000xx` gradient blit; the blit may be a loud `note` in this wave if the renderer has no home for it, but the `cmpi.w #$105` arm must be real or the object never leaves |
| a scenario that KILLS the midboss | — | this is the load-bearing part. `fly-around` cannot; W31 said so and it is why 25 waves shipped with this path unexecuted. Until one exists, `$26B73A` and `$261100` stay unexercised **and the gate cannot tell.** |

**And one thing to fix in the record, because it will mislead the next reader.**
`31-impl-midboss.md` §3.1, its LOG line and its §10-B all say the scroll halt was
verified by `$813172` pinning at 1600. That register is the ship-follow lateral
camera (§3). The halt those numbers were pointing at is real and is §1's
0.125 px/f band; the citation is wrong. **W31's zero-divergence result is not
affected** — it compared the port against the board and they agreed.

---

## LOG (appended as findings arrive)

- opened.
- decoded stage 1's whole scroll program out of the ROM (41 + 16 records, both
  terminators found). **There is no `loops=$FFFF` repeat and no FREEZE anywhere
  near the midboss** — the only ones are the boss's, at t=`$0344`.
- found the real mechanism: SPEED `$0010` at t=`$00E5` and **`$0008` at
  t=`$00E7`**, released by `$2616DE` at t=`$00F0`. **`$262082 addq.w #$2,A1`
  skips the record's cond word, so the VM cannot express a condition at all.**
- `$26B7C2 cmpi.w #$E7,$8130CE` — the midboss is **invulnerable until the crawl
  begins**, on the same constant.
- `$26B73A`'s push is `$0020`, **four times** the crawl's `$0008`: killing him is
  a speed-up, not an unfreeze.
- **LIVE, no input: the crawl is there and it is exact** — 576 frames of
  0.125 px/f (lf3687→lf4263), released on clk 240. 635 frames of slow band.
- **LIVE, fire held: the page STOPS at clk 231/232 with `UNPORTED $26C1C4`,
  twice, from two different flight paths.** `$26C1C2` is type `$1C`'s init stub;
  type `$1C`'s only enqueuer in build B is the midboss's own death `$26B7E0`.
- the `$261100` release is on a LATER frame than the throw, so it is now
  **unreachable**, not merely unexercised.
- the midboss **does** spawn live: 16 records/frame from lf3109 (clk 197), all
  from `$26BE70`/`$26BE90`, none with art.
- W31 §3.1's `$813172` is the **lateral ship-follow camera** (`$2613B4` →
  `$2614F4`), not the stage scroll. Nothing regressed; the halt never had the
  shape W31 gave it.
- no server started; [M] zero `http.server`/`serve.py` processes on the machine
  afterwards.

status: DONE
