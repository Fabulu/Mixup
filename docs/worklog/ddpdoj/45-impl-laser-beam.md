# 45 — IMPL: the BEAM (laser L1+L2) and the score arms it changes

status: **DONE**

started: 2026-08-04
role: implementer (SOLE writer to `games/ddpdoj/`; I do not touch
`games/gradius/`)
target: `ddpdojblk` VERSION-B. Every address is build B (`$23xxxx`–`$2Axxxx`)
unless the line says otherwise.

Brief: port **(B) THE BEAM** — the owner's blocker. Holding fire currently
throws `$24C180` on the first held frame, so the game cannot be shot at all.
Scope is W37's **L1 + L2 shipped together** plus the score/chain/rank
differences W37 §4.3–4.6 measured.

**METHOD.** Every figure marked **[M]** I measured this session: `unidasm`
through `games/ddpdoj/tools/oracle/xref.py dasm` over
`tools/oracle/out/maincpu.bin` (6,291,456 B, address == file offset), a
capstone 5.0.7 operand scan of `$230000..$2B0000`, and the PORT itself driven
headless from the shipped bundle seed. No MAME was run.

---

## 0. THE BRIEF AND W37 ARE RIGHT ABOUT THE BLOCKER, AND WRONG ABOUT THREE
## STRUCTURAL FACTS. Each correction changes the work.

### 0.1 **THERE IS NO 32-ENTRY DISPATCH. THERE ARE TWO 20-ENTRY DISPATCHES,
### ONE PER PLAYER, AND THEY ARE ADJACENT.** [M]

W37 §3.2 and §6 give "`$254712` … a **32-entry dispatch**" and "**17 distinct
handlers**", and prices L2 on that denominator. Read out of `$254680`:

```
2546ba: lea ($254712,PC),A0   ...   P1's loop  ($8112F2)
2546fa: lea ($254762,PC),A0   ...   P2's loop  ($8118F2)
```

`$254762 − $254712 = $50 = 20 longwords`. So **P1's table is `$254712`+20
entries and P2's is `$254762`+20 entries**, and `$2547B2` — W37's "first
handler" — is exactly `$254762 + 20*4`, i.e. the byte after P2's table. W37 read
32 longs from `$254712`, which is P1's 20 followed by P2's first 12, and its
"17 distinct handlers" is the union of P1's ten and seven of P2's ten.

**[M] The real denominator is 20 + 20 = 40 dispatch entries over 20 distinct
handler bodies, ten of which are P1's and ten P2's mirrors:**

```
P1 $254712  0:$2547B2  1:$2547E6  2:$2548C4  3:$254A60  4:$254ABE
            5:$2547B2  6:$2547E6  7:$2548DA  8:$254A60  9:$254ABE
           10:$254B68 11:$2547E6 12:$254986 13:$254A60 14:$254ABE
           15:$254B9E 16:$2547E6 17:$2549A8 18:$254A60 19:$254ABE
P2 $254762  0:$2547C0  1:$254800  2:$2548F0  3:$254A68  4:$254ACC
            5:$2547C0  6:$254800  7:$254904  8:$254A68  9:$254ACC
           10:$254B76 11:$254800 12:$2549BC 13:$254A68 14:$254ACC
           15:$254BAC 16:$254800 17:$2549DE 18:$254A68 19:$254ACC
```

**AND THE INDEX IS `type & $1F`, WHICH RUNS TO 31.** A P1 segment whose type
word has low bits 20..31 reads P2's table; a P2 segment with the same reads
**past** P2's table into the code at `$2547B2`. That is a real property of the
listing and the port transcribes it as written (`$254712 + 4*(type&31)` for P1,
`$254762 + 4*(type&31)` for P2) rather than "clamping to 20", which would be a
term the ROM has not got.

### 0.2 **`$255042` IS 278 BYTES, NOT ~444, AND ITS END IS `$255158`.** [M]

W37 §7.4 leaves the extent open ("`$255042..~$2551FD`; I did not find its
`rts`"). It is `$255042..$255157`: P1's block `$255042..$2550CA`, P2's
`$2550CC..$255154`, and **two `rts` at `$255154` and `$255156`**. `$25515A`
begins a different routine (`tst.w (A0) / bpl $255158` — it borrows the previous
routine's `rts` as its own, the twelfth instance of that idiom in this module)
and is reached from neither.

### 0.3 **W37's "+17 latch" IS RIGHT AND ITS MECHANISM IS NOT WHAT §3.3 SAYS.**
### [M]

W37 §3.3 derives +17 as "9 delay frames + 8 pod-swing frames, and at +17
`($1b,A6)==0` so `$24C196` falls through and `$24C1A8` LATCHES". **There is a
`bcc $24C33A` between the two**:

```
24c196: tst.b ($1b,A6) / bne $24C1F6
24c19c: bsr $24C8BE
24c1a0: bsr $24C906
24c1a4: bcc $24C33A          <<-- W37's derivation skips this
24c1a8: bset #2,($1,A6)
```

So the latch also requires `$24C906` to return **carry SET**, which it does only
when the record it reads has a negative `($12,A6)` word. Read out of the data:
`($30,A6) = $0024BF4A` (formation 2's template `$24BF6E`, source `+$26`, through
`$24C0E8`'s copy **with its four-byte hole**), and the record at `$24BF4A` is

```
$24BF4A: anim $00065354  shadow $00065388  ($1e)=$0000  ($12)=$FFFF
```

**`$FFFF` is negative, so `$24C906` returns carry set on its very first call and
`($16,A6)` never advances.** The latch therefore fires on the first frame after
the arm-up completes — **+17, by a different route than W37's, and the number is
the same.** It also means the pod's sprite is re-forced to `$00065354` (the
muzzle image) and its shadow to `$00065388` on **every** lasering frame, and
`($1e,A6)` is 0 so `$24C36C add.w ($1e,A6),($2,A6)` is a no-op for formation 2.

The arm itself is +0..+8 (`($3f,A6)` `$0A`→0, nine frames) and +9..+16
(`($3b,A6)` `$30`→`$40` by `($3e,A6)`=2, eight frames, `($1b,A6)` `$10`→0). The
arm COMPLETES at **+16**, not +17: `$24C246 cmpi.b #$40,($3b,A6) / bcs` stops
being taken on the eighth swing frame. All five constants confirmed against the
port's own live record (`($1b,A6)=$10`, `($3b,A6)=$30`, `($3e,A6)=$02`,
`($3f,A6)=$0A`, `($4b,A6)=$04`).

### 0.4 THE THING NEITHER W37 NOR THE BRIEF NAMES: **`btst #5,(A6)` GATES BOTH
### BUILDERS, AND ONLY A SEGMENT HANDLER CAN SET IT.** [M]

`$24CB3A` and `$24CDC0` both open `btst #5,(A6) / beq <the pod tail>` — bit 5 of
the **high** byte of the option block's state word (`$8104AA`), measured `$80`,
i.e. **clear**. The only writer in build B is **`$254C1E bset #5,(A4)`** (and its
twin `$254D06`), reached from the segment handlers with `A4 = $8104AA`.

So the beam is a two-stage bootstrap and the order is forced. **MEASURED on the
port, from the shipped bundle seed, holding fire from logic frame 2000** [M]:

```
+16  $24C250 -- the arm completes.  option state $D003 (bit 4 of the high byte)
+17  $24C1A8 LATCHES ($8104AB bit 2) and $24C1C2 bsr $24CAAE SEEDS POOL SLOT 28
     ($811832) with family 1 entry 0 = $24A932, type word $8002
+18  #10 dispatches ($8002 & $1F) = 2 -> $2548C4, whose script word is still
+19  positive, so `$254922 bpl $254952` skips $254C1E
+20  the FOURTH script word is $FFFF -> $254C1E bset #5,($8104AA), and
     $811EF2 GOES LIVE ($8000)
+21  $24C368 -> $24CB3A takes its bit-5 arm, lays the HEAD in slot 27 and
     $811EF2 becomes $8001 at $24CD36 bset #$0,($1,A3)
+22.. one body segment per frame from slot 0 up
```

**THAT IS THE +17 -> +20 GAP W37 §3.3 LEFT UNRESOLVED, AND BOTH BOARD NUMBERS
REPRODUCE.** `10-recon-combat §2` measured on the cartridge: "`$8104AB` bit 2
latches at +17, the laser record `$811EF2` goes live at +20". W37 guessed the
three frames were `($42,A6)`/`($43,A6)` or `($4e,A6)`. They are not. They are
the muzzle's own SCRIPT, read out of the image at `$24A86A` [M]:

```
$24A86A:  0000 0001 1E8C   0000 0001 20C0   0000 0001 22F4   FFFF 0001 2528
          ^ positive       ^ positive       ^ positive       ^ THE COMMAND
```

three ordinary 6-byte entries and then the `$FFFF` that `$254924 not.w` turns
into a command, which is what runs `$254C1E`. **+17 seed, +18/+19/+20 the three
script reads, and the beam record is live on the third.**

One number does NOT reproduce and I am naming it rather than smoothing it: the
board's trace has `$811EF2` = **`$8200`** and this port gets **`$8000`**. The
word comes from `$254C5C move.w (A1)+,(A2)`, i.e. the first word of the
`($2c,A6)` sub-template, and family 1 entry 0's is `$24B6D2`, whose word IS
`$8000` [M, read out of the image]. `($22,A4)` selects which family-1 entry the
seed uses and it is 0 in this port's seed; the board's trace was taken at a
different power. **So `$0200` is a per-power bit of the sub-template, not a
divergence** — but I have not reproduced the board's state to prove it, and that
is a one-line check for whoever next has a board run.

### 0.5 WHAT THE PORT ACTUALLY REACHES — measured from the shipped seed [M]

```
($22,A4)=0   ($20,A4)=0   shipSel($58,A4)=0   ($5b,A4)=$02 (bit 2 CLEAR)
($1,A4)=$00 (the bomb-laser bit is clear)     ($10,A6)=2   $811F72=0
```

so every pointer table lands on entry 0 and the reachable template families are

| family | picked by | entry 0 | type word | `&$1F` | P1 handler |
|---|---|---|---|---|---|
| 1 `$24CFBA` | `$24CAAE`, the muzzle at slot 28 | `$24A932` | `$8002` | 2 | `$2548C4` |
| 2 `$24D026` | `$24CB3A`'s segment `dbra` | `$24AF68` | `$8000` | 0 | `$2547B2` |
| 3 `$24D07E` | `$24CCD0`, the beam HEAD at slot 28+27 | `$24B0A0` | `$8001` | 1 | `$2547E6` |

All 65 templates' type words were read: family 1 is `$8002/$8007/$800C/$8011`,
family 2 `$8000/$8005/$800A/$800F`, family 3 `$8001/$8006`, family 4 `$800B`,
family 5 `$8010`. **Every one of those eleven values indexes a distinct-body
entry of the 20**, so the port cannot silently fall on a handler that does not
exist.

---

---

## 1. **THE BRIEF'S CENTRAL PREMISE IS FALSE, AND IT COST THE WAVE A ROUTINE**

> "THIS UNBLOCKS PLAY. Right now any press of fire throws `$24C180` … The recon
> sizes this as 3 waves for the beam, with L1+L2 required to ship together —
> that is your scope."

**Porting L1+L2 does NOT unblock play, and I found that by running it.** [M]

`$24C164`'s gate is tested BEFORE the formation dispatch, so the instant
`$24C180` stopped throwing, the FIRST held frame reached `$24C476` — the pods'
cadence machine — whose edge arm falls through to `$24C4F2 bra $24D480`, **the
PODS' SHOT SPAWN, a loud named throw since W12.5.** The beam does not take over
until `($1b,A6)` reaches 0 at +16, so **sixteen of the seventeen arm-up frames
run the pod cadence machine**, and a single-frame tap runs it too. Porting the
beam alone moves the crash from `$24C180` to `$24D480` and the owner still
cannot shoot.

So `$24D480..$24D5D8` is ported in this wave as well. It is two near-identical
halves, one per pod, writing 44 bytes into the SAME 36-slot shot table
`$810572` the ship's own `$249BFC` writes — pod 0 scanning from slot 0 and pod 1
from slot 7 (`$24D4A0 move.w #$150,D0`, `$150 = 7 * $30`), which is where
`src/type5.js`'s eight-wave-old comment "the option pods' shots go into slots
7..12" comes from. **Both templates carry type word `$8002`** [M] = shot
dispatch entry [2] = `$253E34`, which `src/shots.js` has ported since wave 8, so
the records it writes are driven by code that already exists — and its two
template tables `$24D2FC`/`$24D35C` were already exported by wave 8's
`(0x24D2E0, 0x00E0)` window.

`$24D4A4 tst.w ($58,A4) / beq $24D4AE / move.w #$150,D0` — BOTH arms load `$150`
[M]. Translated with the branch, because a no-op arm is a property of the
cartridge.

## 2. **A SECOND THROW THAT WAS NEVER AN UNPORTED PATH: `$249B40`**

The next thing a hold reached, at +17, was
`UNPORTED $249B40: the ($3f,A6) dead flag is set`.

**`$249B40 tst.b ($3f,A6)` is `bne $249E4E` — a branch to the player's own
TAIL**, which is the very next thing `player.js`'s caller does. So the arm has
always meant "skip the shot cadence machine this frame", i.e. `return`. Calling
`($3f,A6)` "the dead flag" and throwing on it was a guess that stood since wave
4, and **the laser is what flushed it out**: `$24C282 move.b #$1,($3f,A4)` sets
that byte on the frame the arm-up completes and `$24C2D6` clears it on release,
precisely so the ship stops spawning ordinary shots while it is firing a beam.

**That completes `37-recon-laser` §3.4.** W37 is right that `$81295C` falling to
0 is the shot table DRAINING and not a laser write; what it does not say is why
nothing REFILLS the table after +16, and this is why — the cadence machine is
switched off at its head, by the laser, on purpose. The six shots at
lf2001..2007 are the pre-arm burst.

## 3. WHAT WAS PORTED

`src/laser.js`, 660 lines, and the pieces of `src/options.js` around it.

| ROM | what | where |
|---|---|---|
| `$24C164..$24C29C` | the gate, delay, latch, arm-up, pod swing-in | `laser.js runLaserGate` |
| `$2536FA` | `($60,A4) += 4`, capped at `$80` | `laserRamp60` |
| `$24C8BE` | the speed ramp DOWN | `rampDown` |
| `$24C906` | the template stepper, returns the CARRY | `stepTemplate` |
| `$2536B6`/`$2536D0` | 16 copies of the ship's position/anim | `seedPositionHistory` |
| `$24CAAE`/`$24CAFC` | the latch's seed into pool slot 28 | `seedSegmentFamily1/2` |
| `$24CB3A` | BEAM BUILDER 1, both arms + the head `$24CCD0` | `buildBeam` |
| `$254680` | the segment driver, type-5 call **#10** | `runSegmentDriver` |
| `$254712`+`$254762` | **two** 20-entry dispatches | `BEAM[].dispatch` |
| `$2547B2..$254E2A` | **all twenty** distinct handler bodies | `SEGMENT_HANDLERS` |
| `$254C1E` | the `bset #5` that starts the beam, and the two records | `startBeamRecords` |
| `$254E04`/`$254F48`/`$254FE6` | the kill, the beam tail, the draw request | `hKill`/`hBeamTail`/`beamRequest` |
| `$255042..$255156` | the beam DRAW, type-5 call **#11** | `runBeamDraw` |
| `$252714`/`$25275C` | the 32-slot pool wipe | `wipeSegmentPool` |
| `$24C2A4`, `$24C2C4..$24C338` | the knockback ramp and the RELEASE teardown | `options.js noLaser`/`podsSwingBack` |
| `$24C33A..$24C382` | the tail every arm converges on, incl. `$24C368` | `podsOnShip` |
| `$24CC68..$24CCCC` | the beam's pod tail (shadow `$210`/`$18` + bucket 15) | `beamPodTail` |
| `$24D480..$24D5D8` | THE PODS' SHOT SPAWN (§1) | `options.js podShotSpawn` |
| `$249B40` | `bne $249E4E` — a return, not a throw (§2) | `player.js` |

Six new export windows in `tools/export-tables.py` (107 -> 114 windows,
188,390 B): `$24A800+$1100` (the hitbox table, the type scripts, all five
template families and every anim table and sub-template they point at),
`$24BB00+$A0` (`$24BB0A`'s draw pairs), `$24CFB0+$180` (the five pointer
tables), `$254710+$C0` (both dispatches), `$255158+$1D8` (`$24D4B2`'s burst
table, reached through the RAM pointer `$8127E8` = **`$255278`** [M]) and
`$23F500+$20` (the emitter stub `$23F508`, whose CODE `resolveEmitStub` reads to
learn its bucket). `export-web.mjs` re-run; only `manifest.json` and
`player.tables.json` move.

### 3.1 What is a THROW, and what is a counted NOTE

Throws, at their own addresses: **`$24CDC0`** (beam builder 2 — its only caller
`$24C37A` has no inbound reference W37 §7.3 could find, and `$24C368`'s
`bra $24C37E` jumps it; it is NOT called dead code, because two comments on this
project have claimed unreachability and been artifacts), and the whole L3
damage family `$245314`/`$24536E`/`$2453AC` stays unported and unnamed by any
new code path.

Counted notes, because they fire on reachable frames: the **seven `$28C4xx`
SOUND requests** the script handlers `jsr (A3)` (all `movem.l / move.w #id,D0 /
move.w #pan,D1 / move.w #chan,D2 / jsr ($28C074,PC)` [M]), the pool wipe's own
`$252738 jsr (A0)` (a sound STOP through `$2527BE[$81043E]`), and `$289F96` /
`$289FC0` / `$289FDA`, the effect family. Sound is item 6 of
`39-OWNER-visible-play-before-sound.md`, i.e. LAST, and nothing in this port
reads what any of them writes. `src/unported.js`'s own distinction: a THROW is
for a branch whose absence invents every later value; a NOTE is for a subsystem
held out of scope on purpose.

## 4. **THE DRAWN BEAM COLUMN NEEDS L3, AND THAT IS A STRUCTURAL FACT**

`$254F48`'s tail — the only thing that ever calls `$254FE6`, which builds the
five-word request `$255042` walks — opens `btst #4,(A2)` with A2 = `$811EF2`,
and its `else` arm requires `($16,A0)` non-zero, which is itself written only
inside the bit-4 arm (`$254E68`/`$254ED4`/`$254F84`). **[M] The ONLY instructions
in build B that set bit 4 of `$811EF2` are `$2454AC` and `$2455AE
ori.w #$1001,(A1)`** (a whole-image scan for that encoding), and both are inside
`$2453AC`, the beam's damage pass — W37's L3.

So on this tree the beam's SEGMENTS are laid, driven and emitted, and the bright
column `$811F32` never lights up. `$9201 = $8201 | $1001` is W37 §3.3's own
reading of the board trace and it says the same thing from the other side: that
value **means the beam hit something**. A port that lit the column without the
damage pass would be inventing the hit.

## 5. THE MEASUREMENTS  [M] = mine, this tree, this session

Method: `loadBundle` over the real `games/ddpdoj/assets/`, `new Game(bundle.seed,
bundle.tables, {logicFrame: 2000})`, the page's own `$810424 = $FF` each frame,
input word with BIT.b1 held. No MAME.

```
[M] 600 LOGIC FRAMES WITH FIRE HELD: no throw, at any point.
[M] the timeline above, +16 arm / +17 latch+seed / +20 record live / +21 head
[M] the pool settles at 14 live segments and cycles slots
[M] RELEASE: $252714's wipe clears all 32 slots, $811EF2 and $811F32 go to 0,
    $24C2F4 andi.w #$DFDB clears the builders' gate AND the latch in one
    instruction, and the pods swing back to $10/$30 over 8 frames
[M] a SECOND hold pays the full 17 frames again
[M] $811F72 -- the BOMB-LASER's record -- was 0 on all 600 frames,
    and $8130F8 bit 2 was 0 on all 600 as well
```

Display-list effect, same seed, 80 frames, held vs not held [M]:

```
frame   released   held   delta
  14        24      36     +12     the pods' shots
  20        28      42     +14
  24        28      45     +17
  31        31      49     +18     the beam at full length
  40        32      41      +9
  70        42      51      +9
```

## 6. THE PAGE, IN A REAL BROWSER — WHAT I SAW

Chrome + Python `playwright` over `python -m http.server`, the recipe W42
established and W44 re-used. Nothing downloaded.

**THE OWNER CAN HOLD FIRE. The page does not die, the error panel stays EMPTY,
and the ship keeps flying while the button is down.**

```
BOOTED   lf 2670  69.9,83.0px  shards 8/8  [port] dl 46 drawn 31 b0 32   60.0Hz
+0.5s H  lf 2714  [port] dl 44 drawn 25 b0 30  NO ART 19: ... $065354x2
+3s   H  lf 2862  [port] dl 54 drawn 18 b0 26  NO ART 36: ... $065354x2 $013098x2
+7s   H  lf 3113  [port] dl 67 drawn 15 b0 18  NO ART 52: ...
FLY+FIRE lf 3231  162.0,12.0px   dl 68 drawn 18 b0 23
RELEASED lf 3366  195.5,12.0px   dl 50 drawn 17 b0 16
ERRPANEL (empty at every sample)      canvas 224x448, 63,892 px lit, 141 colours
PAGE ERRORS: none but a 404 on a favicon-class resource
```

The screenshot at +7 s shows the ship at the bottom of the road, about eight
ported vehicles on it, `PLAYER-1`, the score, `PRESS START`, the bomb count
`B B B` and the power bar all intact, and the ship flew 69.9,83.0 ->
162.0,12.0 -> 195.5,12.0 px on the arrow keys with fire held throughout.

**WHAT IS NOT ON THE SCREEN, AND WHY.** `$065354` and `$013098` in that `NO ART`
list are the LASER's own art: `$065354` is the pod's muzzle sprite (the long
`$24C906` forces onto `($a,A6)` every lasering frame) and `$013098` is one of
the ten segment images at `$24ACE8`. **[M] Not one of the beam's streams is in
the shipped 166-stream sheet** — checked against `manifest.spr.streams` for
`$01302C`, `$013098`, `$065354`, `$011E8C`, `$013B94`. So every beam record is a
NAMED SKIP with a live address on the page, exactly as W44's guard is built to
do for data with no art, and the beam is computed, driven, queued and invisible.
**That is the enemy-layer ART wave's row (E2), not this one's**, and this wave
added zero art bytes.

## 7. WHAT CHANGED IN `src/score.js` — AND WHY IT IS NOT BEHAVIOUR

The wave brief is binding on this and it is **wrong about which laser**, in
exactly the way `37-recon-laser` §0 warns:

> `$2860C8 bsr $286A82` runs BEFORE the ordinary add … `$2867B4` feeds RANK …
> `$2862EA` ZEROES THE CHAIN … If you port the beam without fixing score.js,
> you ship a silently wrong chain.

Every laser fork in that file — `$2860A8`, `$2862DC`, and `$286A82`, `$2867B4`,
`$286DA8` behind them — reads **`$811F72`**, and `$811F72` is the **BOMB-LASER's**
45 x `$30` record: driven by type-5 call #7 `$255DD8`, walked as 45 records of
`$30` by `$244D62`'s ninth block, and selected only by
`$24989E bset #$0,($1,A6)` INSIDE THE BOMB (W37 §4.2, §1.1). **The beam lives in
`$811EF2`/`$811F12`, `$811F32`/`$811F52` and the two 32 x `$30` pools.**

MEASURED, twice: `$811F72` was 0 on all 600 held frames of the running beam, and
`$8130F8` bit 2 — the OTHER gate on `$2860A8`'s arm — was 0 on all 600 as well.
**Two independent gates, both off.** A wave that "fixed" those arms now would be
adding a rank feed and a chain break the beam has not got.

So the changes are documentation and one new address, and each is a wrong fact
being retired rather than a preference:

1. A new header block naming WHICH laser those arms are, with the measurement.
2. **`SCORE.laserRankFeed = $2867B4`** and `laserRankDivider = $81B636` added,
   with W37 §9.8's sentence attached: any wave that ports `$286A82` without
   `$2867B4` ships a laser that scores and does not raise rank. The `$2860C8`
   note now says both, and says that `$2860CC bra.b $2860DE` means BOTH run.
3. `capClamp`'s note said "`$287682` … grants a hyper stock (`$81B65C`, capped
   at 5 at `$28768C`)" — **W38 §2.4 falsified both halves** and nobody had
   corrected the file. `$287682` never writes `$81B65C`; `$28768C` is a REFUSAL
   test; the only absolute writer of the stock is `$2530CA` and it is UNCAPPED;
   what `$287682` increments is `$81B6E0`.
4. `scoreHit`'s "ONE POINT PLUS THE HYPER LEVEL" — **W38 §4.3**: `$81B63E` is
   the 0/1 ACTIVE flag, the level is `$81B654`, and the value is 1 or 2.

**ORDER WITHIN THE FRAME, and how I established every write this wave adds.**
Not one of them is inside `$286096`, `$2862C6` or `$28444E`, so W19's measured
order (`rankclk > rank= > [CHAIN+ > score+ > meter+ > score+]* > drain > drain0
> meter-`, chain timer LAST) is untouched. Their position is fixed statically by
the type-5 call list `$28B5E6..$28B66A`, which `src/type5.js` walks in ROM
order: `#9 $24C096` (the gate, the arm-up, the builder) then `#10 $254680`
(the segment driver, three calls later) then `#11 $255042` (the draw, one
later), all of them BEFORE `$28B670`'s tail where `$244D62` and the score arms
live. The order is a property of `$28B5E0`'s instruction stream, not of a
measurement, and `TYPE5.calls` is that stream.

## 8. EVERY CHECK SEEN TO FAIL — 15 mutants, 14 red, 1 named survivor

`node .scratch/mutate.mjs`: apply, run ONE test file, require a NAMED test red,
restore, **verify the file's sha256 is byte-identical**. Every restore matched.

| # | mutation | the NAMED test that went red |
|---|---|---|
| M1 | `$24CB3A`'s `btst #5,(A6)` gate removed | the beam LAYS SEGMENTS… |
| M3 | `$24C906` never returns the carry | `$24C906` returns the CARRY… |
| M4 | `$24CB9A tst.w ($c,A3)`'s arm dropped | a segment that reaches `$7800`… |
| M5 | `$24CC4C lea ($a,A1)` becomes `+8` | the beam LAYS SEGMENTS… |
| M6 | the pool wipe skips slot 0 | RELEASING fire wipes the pool… |
| M7 | `$24C2F4 andi.w #$DFDB` keeps bit 13 | RELEASING fire wipes the pool… |
| M8 | `$24C314 bhi` becomes `bcc` | RELEASING fire wipes the pool… |
| M9 | `$24C282 move.b #$1,($3f,A4)` writes 0 | THE ARM-UP IS 9 + 8 = 17 FRAMES… |
| M10 | `$24C246 cmpi.b #$40` becomes `#$3E` | THE ARM-UP IS 9 + 8 = 17 FRAMES… |
| M11 | `$24C8CE subq.b #1` becomes `#2` | `$24C8BE` steps the speed index… |
| M12 | `$2536FA`'s cap becomes `>` | `$2536FA` adds 4 … stops dead at `$80` |
| M13 | `$24C2B6 move.b #$a` becomes `#9` | the gate is on the RAW byte… |
| M14 | `$24D56E jsr $23D88E` dropped | `$24D480` WRITES A SHOT RECORD… |
| M15 | `$24CC3A sub.w D4` becomes `add.w` | the beam LAYS SEGMENTS… |

**M2 IS A SURVIVOR AND IT IS PROVABLY UNCATCHABLE.** The mutant clamps
`type & $1F` to 19, i.e. removes the two tables' overrun. No template in the
five families produces an index ≥ 20 — the reachable set is
`{0,1,2,5,6,7,10,11,12,15,16,17}` — so on this cartridge the clamp is a no-op
and no dynamic check can see it. The test that proves it is present and named:
`every template family's type word lands INSIDE its own 20-entry table`.
Category (c) of the brief's three, and the port keeps the ROM's arithmetic
anyway, because a clamp is a term the listing has not got.

**THREE OF MY OWN CHECKS COULD NOT FAIL WHEN FIRST WRITTEN**, and all three were
caught by this cycle rather than by review:
- the segment test asserted only the TYPE word, so M5 (a field-offset error) and
  M15 (the beam growing DOWNWARD) both survived. It now asserts `($6,$8)`, the
  size, the player word, the power byte, the anim's membership of `$24ACE8`'s
  ten, and the position relation `podY - segY == ($30,A4) + $300`;
- the `($c,A3)` test asserted `$812964 == ($12,A3)`, which is `0 == 0` when the
  arm never runs at all. It now asserts `($6,A3) == 0`, the CLAMPED value, which
  the unclamped arm's `+= $800` per frame cannot produce;
- and one assertion in it was simply wrong about the ROM (`$24AF68 + $0C` is the
  wrap LIMIT, not the size — the size is at `+$0A`), which the run caught.

## 9. COVERAGE — branches and table entries, never frames

- **type-5 calls: 12 of 23 RUN**, 11 counted (was 10/13).
- **segment dispatch: 40 entries over 20 distinct bodies, all 20 implemented.**
  12 of the 40 entries are reachable from the five template families' type
  words; the other 28 are transcribed and unexercised. The `type & $1F`
  overrun into the neighbouring table is transcribed and provably unreachable
  from these templates.
- **template families: 5 of 5 exported**, 65 templates read; entry 0 of families
  1, 2 and 3 is what this seed reaches (`($22,A4)` = 0, `($58,A4)` = 0,
  `($5b,A4)` bit 2 clear, `($1,A4)` bit 0 clear).
- **pointer tables: 5 of 5 exported** (`$24CFBA` 25, `$24CFE2` 10, `$24D00A` 5,
  and the `$24D01E`/`$24D076`/`$24D0A6`/`$24D0D6` two-level families).
- **unported and throwing, by address: `$24CDC0`; `$245314`, `$24536E`,
  `$2453AC` (L3); `$24560A` (the bomb-laser's ninth block, still unnamed in
  `src/`); `$254078` and `$255DD8` (weapon A).**
- **unit tests 568 -> 585, 0 skipped.** New file `tests/laser.test.js`, 17 tests.

### 9.1 THE GATE

```
python games/ddpdoj/tools/oracle/pgm.py check
VERDICT: ALL GREEN -- 49 passed, 0 failed, 0 SKIPPED
```

Unchanged from W32..W44's 49/0/0. **Nothing was disabled, skipped, narrowed or
loosened.** Every stage read individually, not just the verdict line. The ones
this wave could plausibly have broken, all green: `fly-around: port vs board, 0
divergent frames` and its five REDs (the option object is on that path);
`display list: the staged-bytes replay gate (1,901 frames)`, its FORCED cap and
FORCED drop cases and its 12 RED mutations over 3 scenarios — **the port's own
`$800000` build is still byte-exact against the board**, which is what makes a
new sprite producer safe; `demo gate: the port drives the ship, pixel-exact` and
its four REDs; `pixel gate` and its nine; `assets/integrity` (the ROM-leak
guard) and `background shard gate`, because `player.tables.json` grew by six
windows; and `bullet mover`, `spawn walker`, `enemy stats`, `turret angle`.

Also green on the final tree, and not part of `pgm.py check`:

```
node --test games/ddpdoj/tests/         585 pass, 0 fail, 0 SKIPPED   (was 568)
node games/ddpdoj/tools/webgate.mjs     5 of 5 PASS
```

`webgate`'s W44 stage still reports **16,457 records / 0 MISSED over 300 steps
with nothing pressed**, digit for digit — which is the evidence that this wave
changed nothing on the no-input path.

**A SKIP IS NOT A PASS.** 0 skipped, read rather than assumed.

## 10. WHAT THIS WAVE DID NOT DO

- **No damage.** The beam melts nothing: `$2453AC` is L3 and stays a loud named
  throw, which is why the drawn column never lights (§4). A beam that draws and
  does not damage is what W37 §6 says L1+L2 must ship as.
- **No art.** Zero new bytes; the beam's five streams are named skips (§6).
- **`$24CDC0` is not ported** and is not called dead code.
- **`score.js`'s behaviour is unchanged**, on purpose, with the measurement (§7).
- **Nothing is compared against MAME.** No gate in this repo compares a beam
  frame against a board frame, and this wave did not build one.
- **`games/gradius/` was not touched.**

## LOG (appended as findings arrive)

- opened; read 37, 38, 39, 44, HANDOVER, `docs/knowledge/09` and `10`,
  `src/{options,type5,machine,score,damage,shots,spritequeue}.js`.
- §0.1 **[M] W37's "32-entry dispatch / 17 distinct handlers" is wrong**: it is
  TWO 20-entry tables, `$254712` (P1) and `$254762` (P2), 40 entries over 20
  bodies, indexed by `type & $1F` which overruns both.
- §0.2 **[M] `$255042` ends at `$255158`** — 278 bytes, W37's open item 4 closed.
- §0.3 **[M] the +17 latch needs `$24C906` to return CARRY SET**, which it does
  because `($30,A6)`'s first record is the `$FFFF` terminator. Same number, a
  mechanism W37's derivation skipped.
- §0.4 **[M] `btst #5,(A6)` gates BOTH builders and only `$254C1E` sets it** —
  which is W37 §3.3's UNRESOLVED "+17 -> +20 three-frame gap", resolved.
- §0.5 [M] the port reaches exactly three of the twenty handlers from the
  shipped seed, through template families 1, 2 and 3 entry 0.
- §1 **[M] THE BRIEF'S CENTRAL PREMISE IS FALSE.** Porting the beam alone does
  not unblock play: `$24C164` is tested BEFORE the formation dispatch, so the
  first held frame then died on **`$24D480`, the pods' shot spawn**, and 16 of
  the 17 arm-up frames run it. Ported here too, with its `$8002` records going
  into the shot table wave 8 already drives.
- §2 **[M] `$249B40` was never an unported path.** It is `bne $249E4E`, a branch
  to the player's own tail; `($3f,A6)` is not "the dead flag" and the LASER is
  what writes it (`$24C282`) so the ship stops spawning shots. That completes
  W37 §3.4's `$81295C` correction from the other end.
- §4 **[M] the drawn beam COLUMN needs L3.** The only setters of bit 4 of
  `$811EF2` in build B are `$2454AC`/`$2455AE ori.w #$1001,(A1)`, both inside
  `$2453AC`. So the segments draw and the bright column does not, and `$9201 =
  $8201 | $1001` means "the beam hit something", exactly as W37 read it.
- §5 [M] **600 logic frames with fire held, no throw**, the whole timeline, the
  release teardown, and a second hold paying the full 17 frames again.
- §6 [M] **DRIVEN IN CHROME. The owner can hold fire.** Error panel empty at
  every sample, ship flew 69.9,83.0 -> 195.5,12.0 px with the button down. The
  beam's five art streams are NOT in the shipped 166-stream sheet, so every beam
  record is a named skip -- checked against `manifest.spr.streams`.
- §7 **[M] the brief's SCORING premise is about the OTHER laser.** Every laser
  fork in `score.js` reads `$811F72`, weapon (A)'s record. `$811F72` was 0 on
  all 600 held frames and `$8130F8` bit 2 was 0 on all 600. `score.js` gains
  `$2867B4`'s address and four documentation corrections; no behaviour changed.
- §8 [M] 15 mutants, **14 turned a NAMED test red**, every restore
  byte-identical by sha256. The one survivor is provably uncatchable and the
  test that proves it is named. **THREE of my own checks could not fail when
  first written** and are documented rather than quietly repaired.
- §9.1 [M] **`pgm.py check` ALL GREEN 49/0/0, 0 SKIPPED**, unchanged from
  W32..W44. Unit tests 568 -> 585. `webgate` 5 of 5, with W44's 16,457/0 MISSED
  reproducing digit for digit on the no-input path.

status: **DONE**
