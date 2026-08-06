# W31 - IMPL: the stage-1 MIDBOSS `$26B6FA`

status: **DONE** - `fly-around` is **UNBLOCKED and GREEN**: it now compares all
**2,200 frames** (W30: 1,097, then BLOCKED) with **0 of 88 columns divergent**,
and the whole midboss window is inside it. The DaiOuJou gate's fifth failure is
gone; the four pre-existing scroll-program failures are not this wave's.
wave: 31. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
date: 2026-08-04.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
unless noted.

## THE BRIEF

Port `$26B6FA`, the stage-1 midboss (type `$0D`) - the largest single body in
the stage and the SOLE remaining blocker of the `fly-around` gate scenario
(W30 §3: a 2,200-frame window from lf2000, and the port was BLOCKED at lf3098).

Before porting: ENUMERATE what `$26B6FA` pulls in. W30's blocker chain was a
QUEUE, not a single item.

OWNER CONSTRAINT (`20-OWNER-minibosses-stop-the-scroll.md`): stationary
minibosses stop the scroll until killed. Verify explicitly.

SECONDARY: W30's unattributed `rng` divergence, first at lf2955, port 63 board
64. Is the midboss the consumer?

---

## 1. THE ENUMERATION, READ OUT OF THE ROM BEFORE ANY PORTING

`python tools/oracle/w27disasm.py <lo> <hi>` from `games/ddpdoj/`, over
`tools/oracle/out/maincpu.bin` (the decrypted build-B image, address == offset).

### 1.1 THE SPAN, and it is FOUR routines, not one

`$26B6FA` is 576 instructions ONLY if you count the three bodies it reaches by
`bsr` and the five data tables inside its own extent. Read past the apparent end
in both directions:

| span | what | ends because |
|---|---|---|
| `$26B184..$26B213` | the DEATH-BURST spawner, `bsr` from `$26B7F8` | `$26B212 rts`; `$26B214` is its own data table |
| `$26B214..$26B285` | that spawner's 14-record list, terminated `$FFFF` | `$26B286` is the next routine's first instruction |
| `$26B286..$26B302` | the 8-arm INIT (`bsr` from the init body `$26B4B0`) | `$26B2AA rts`, then `$26B2AC` is its own `bsr` target |
| `$26B304..$26B47A` | the 8-arm KINEMATICS, `bsr` from `$26B906` | `$26B47A rts`; `$26B47C` is type `$0D`'s init STUB |
| `$26B484..$26B4F8` | the INIT BODY (W23 ports it) | `$26B4F8 rts`; `$26B4FA` is its prototype data |
| `$26B6FA..$26BE6E` | **THE HANDLER** | `$26BE6E rts`, reached only from `$26BE02 bsr $26BE0C` |
| `$26BE70..$26BF0F` | two sprite-pointer tables | `$26BF10` is code (`lea $26BF42(pc),A0`) |
| `$26BF10..$26BF41` | the handler's TAIL, `bra` from `$26BE06`, ends `jmp $23DF58` | `$26BF42` is its table |
| `$26BF42..$26BFC1` | 32 longwords | `$26BFC2` is code |
| `$26BFC2..$26BFE7` | the BODY sprite, `bsr` from `$26BDF8`, ends `jmp $23DF58` | `$26BFE8` is its table |
| `$26BFE8..$26BFFB` | 5 longwords | `$26BFFC` breaks the pattern |

**THE FALL-THROUGH THAT MATTERS.** The handler does not finish at an `rts`.
`$26BDF8 bsr $26BFC2` and `$26BE06 bra $26BF10` both end in `jmp $23DF58` -
TAIL CALLS into the sprite queue. A reader who stopped at the first `rts`
(`$26BE0A`) would lose the body sprite and the tail, and a linear sweep prints
all four tables above as bogus `ori.b` instructions.

### 1.2 EVERY `jsr`/`jmp`/`bsr` TARGET, AND ITS DISPOSITION

| site(s) | target | what it is (from the listing) | disposition |
|---|---|---|---|
| `$26B702`, `$26B900` | `$24179E` | the scroll compensation | **PORTED** (W24 `scrollCompensate`) |
| `$26B70C`, `$26B80C` | `$243E7C` | **THE BULLET-CANCEL SCREEN CLEAR** - arms `$81B410`/`$81B412`, then walks the 210-slot bullet pool `$817F8C` awarding `$46` per live bullet through `$28614A`/`$286154` | **PORTED THIS WAVE** (the arming), the score walk noted |
| `$26B73A` | `$261100` | **THE EXTERNAL SCROLL SPEED PUSH** - `$813180:=1`, `$813182:=D0`, `$813184:=D1` | **PORTED THIS WAVE**; the CONSUMER `$2612AA` has been ported since W13 |
| `$26B742`, `$26B8E8` | `$263762` | free the enemy | **PORTED** (W23) |
| `$26B77C`, `$26B848` | `$286096` | DAMAGE | note (as every other handler) |
| `$26B7E2` | `$263684` | the deferred spawn queue, D1 fixed `$00` | **PORTED** (W22 `enqueueDeferred`) |
| `$26B7F2`, `$26B874` | `$28615E` | explosion/score | note |
| `$26B7F8` | `$26B184` | the death-burst spawner (internal) | **PORTED THIS WAVE** |
| `$26B802` | `$246410` | the ANIMATION-OBJECT installer (`$810346`/`$80FA86`, its own pool) with the 14-record list at `$26C0FC` | note |
| `$26B87A` | `$28C25A` | death burst | note |
| `$26B884`, `$26B19A`, `$26B1E4` | `$289004` | the sprite-EFFECT allocator | note |
| `$26B8F0` | `$28AC72` | the sub-record spawn engine | note |
| `$26B906` | `$26B304` | the 8-arm kinematics (internal) | **PORTED THIS WAVE** |
| `$26B9CC` | `$24226E` | aim256, self from the caller | **PORTED** (W20) |
| `$26BA04` ×7 | `$2817B8` | bullet generator entry | **PORTED** (W21) |
| `$26BA6C`… ×5 blocks | `$281764` | bullet generator entry | **PORTED** (W21) |
| `$26BCE4`, `$26BD76` | `$2817A8` | bullet generator entry | **PORTED** (W21) |
| `$26BE3A`, `$26BE60` | `$23E056` | the register enqueue - `lea $80688C / adda.w $80AFC6`, i.e. **BUCKET 3**, byte-identical to `$23DF58` but wrapped in `move.l A0,-(A7) / move.l D0,-(A7)` | **PORTED THIS WAVE** (a fourth stub SHAPE for `resolveEmitStub`) |
| `$26BF3A`, `$26BFE0` | `$23DF58` | the register enqueue, bucket 3 | **PORTED** (W11) |
| `$26B1CC` | `$28C310` | an effect burst (the `$28C02A` family) | note |
| `$26B2AC` ×3 | `$2431F4` | **an RNG SIBLING** - same `addq.b #1,$803917` counter, different 64-byte table `$24324E` | **PORTED THIS WAVE** |
| `$26B2AC`, `$26B35E` | `$242FDE` | **an RNG SIBLING** - same counter, 256-byte table `$24301A`, **NO MASK** | **PORTED THIS WAVE** |
| `$26B3BC`, `$26B406` | `$241D34` | the shot vector | **PORTED** (W8 `shotVector`) |

**16 distinct external targets. 9 already in the port, 5 ported this wave, 8
subsystems noted - and every noted one is a subsystem some other ported handler
already notes.** No new large subsystem is dragged in. **The queue W30 warned
about did not materialise**, and the one target that looked like it might be a
whole new machine (`$243E7C`, which at first read looked like a screen-clear
subsystem) is ten instructions of arming plus a walk over a pool the port
already owns.

### 1.3 THE RNG FAMILY - a correction to `src/rng.js`

`src/rng.js` documented `$2433AE` as "the board's random source" and said the
counter is shared, naming ONE other bumper. It is shared with a lot more: a scan
of the whole decrypted image for `52 39 00 80 39 17` (`addq.b #1,$803917`) finds
**32 sites in build B**:

```
$24276C $242B3C $242B58 $242B74 $242B90 $242CAC $242CCA $242CE8 $242D06
$242E24 $242EC2 $242FDE $242FFC $24311A $243138 $243156 $2431F4 $243212
$243230 $24328E $2433AE $2434D0 $2434F2 $243614 $243736 $243858 $24397A
$243A9C $243BBE $289F62 $28AB86 $28ABE0
```

They are a FAMILY of draws over different canned tables, all advancing one
8-bit counter. Two are the midboss's:

- **`$2431F4`** - `moveq #$3f,D0 / and.w $803916,D0 /
  move.b ($24324E,PC,D0.w),D0`. Table `$24324E..$24328D`, 64 bytes, **pinned
  from both ends** (`$24328E` is the next `addq.b`).
- **`$242FDE`** - `move.w $803916,D0` with **NO MASK**, then
  `move.b ($24301A,PC,D0.w),D0 / ext.w D0`. Table `$24301A..$243119`, **256
  bytes, pinned from both ends** (`$24311A` is code). The unmasked index is in
  range only because `$23BE36 clr.w $803916` zeroes the high byte and `addq.b`
  never carries into it. The port reads through a ROM window, so a non-zero
  high byte becomes a loud "outside every ROM window" throw, not a wrong byte.

**THE BUMP COMES BEFORE THE READ** in all of them (`addq.b`, then `and.w`), so
a draw at state `$0041` reads index `$42`, not `$41`. The first version of the
unit test got this backwards and went red for that reason before it could go red
for a real one.

### 1.4 THE NEW ROM TABLES, EXTENTS PINNED FROM BOTH ENDS

| table | read at | index | extent | how the far end is pinned |
|---|---|---|---|---|
| `$26B214` | `$26B1D2` | sequential, `$FFFF`-terminated | 14 × 8 B | the terminator, and `$26B286` is code |
| `$26BE70` | `$26BE40` | `($A,A0)`, steps 4, stops at `$1C` | 8 longs | abuts `$26BE90` |
| `$26BE90` | `$26BE1C` | `($30,A0)`, `andi.w #$7F` | 32 longs | `$26BF10` is `lea $26BF42(pc),A0` |
| `$26BF42` | `$26BF10` | `($8,A6)`, steps 4, `cmpi.w #$7C` | 32 longs | `$26BFC2` is `lea $26BFE8(pc),A0` |
| `$26BFE8` | `$26BFC2` | `($24,A5)`, steps 4, wraps at `$14` | 5 longs | the five are spaced `$EA4`; `$26BFFC` breaks the run |
| `$24324E` | `$24320A` | `$803916 & $3F` | 64 bytes | `$24328E` is code |
| `$24301A` | `$242FF2` | the WHOLE `$803916` word | 256 bytes | `$24311A` is code |

`$26C0FC` (the `$246410` argument list) is `$000E` = 14 records of `$E` bytes,
pinned at the far end by `$26C1C2` = the next type's init stub. **No window is
declared for it, because `$246410` is a note** - declaring one would claim a
read the port does not make.

`tools/export-tables.py` also gained speed level `$70`: `$26B3B2` and `$26B3F8`
both `move.w #$70,D0` into `$241D34`, and the exporter derives its level set
from templates, which cannot see an in-code constant. Listed with its two call
sites, exactly as W12 listed the pods' 224. **MEASURED**: the port threw
`speed index 112 was not exported` on the first midboss frame before that line
existed.

The W30 emitter window `$23D760` was WIDENED from `$840` to `$910`, because
`$23E056` sits `$B6` bytes past the old end and `resolveEmitStub` must read its
operands out of the cartridge rather than carry a typed map.

---

## 2. THE RESULT: `fly-around` IS UNBLOCKED

`python tools/oracle/pgm.py flyaround --reuse`:

```
RESULT 0 DIVERGENT FRAMES on 88 columns over 2200 logic frames
```

| after | frames compared | blocked at | by |
|---|---|---|---|
| W29 | 345 | lf2346 | `$275914` |
| W30 | 1,097 | lf3098 | `$26B6FA` |
| **W31** | **2,200 - the whole window** | **not blocked** | - |

**Zero of the 88 claimed columns diverged on any of the 2,200 frames**, over a
window that now includes 1,103 frames of a live midboss, its eight arms, two
bullet fans, three sprite requests per frame and a `$803917` draw family the
port had never touched.

### 2.1 THE REPORTED COLUMNS

| column | W30 (1,097 frames) | W31 (2,200 frames) |
|---|---|---|
| `nshot` | 0 divergent | 0 divergent |
| `rng` (`$803916`) | 143 divergent, first lf2955, port 63 board 64, gap ≤ 2 | 1,246 divergent, **first still lf2955, port 63 board 64**, gap ≤ 11 |
| `b000` | 1097/1097, port 62752 board 62800, gap ≤ 804 | 2200/2200, port 62752 board 62800, gap ≤ 1068 |
| `affe` | 1097/1097, port 65304 board 65308, gap ≤ 67 | 2200/2200, port 65304 board 65308, gap ≤ 89 |
| `affc` | 1097/1097, port 240 board 288, gap ≤ 804 | 2200/2200, port 240 board 288, gap ≤ 1068 |

The three display-list columns start at exactly the W30 values on frame one -
this wave changed nothing before the midboss - and drift further only because
the window is twice as long.

---

## 3. THE OWNER'S CONSTRAINT - HOW IT WAS VERIFIED

`20-OWNER-minibosses-stop-the-scroll.md` + W19 §2: a VM **FREEZE does not stop
the scroll**. The stage stops ADVANCING because stage 1's script parks a paired
op-`$04` with `loops = $FFFF`, repeating a column band forever, and **nothing
inside the VM can end it**. The RELEASE is the miniboss dying.

**BOTH HALVES ARE NOW IN THE PORT, AND THEY WERE VERIFIED DIFFERENTLY.**

### 3.1 THE HALT - verified against the board, frame for frame

`fly-around` never fires (its `tail` is pure stick), so the midboss is spawned
at lf3097 and is **never killed**. That makes this scenario the direct test of
the halt. Read off the board trace and matched by the port on every frame:

```
lf4019  $813172 = 1536   $813176 = 64
lf4020  $813172 = 1600   $813176 = 64
lf4021  $813172 = 1600   $813176 =  0      <- the scroll STOPS
...
lf4200  $813172 = 1600   $813176 =  0      <- and never moves again
```

while the distance clock `$8130CE` keeps ticking (236 -> 239) - the camera and
the column writer keep running, exactly as W19 said, and it is the *stage* that
stops advancing.

**Sixteen scroll columns are in the CLAIMED set and all sixteen matched on all
2,200 frames**: `d0ce` (`$8130CE`), `d18a`, `d18c`, `b012`, `b016`, `b034`,
`b038`, `b03c`, `d16e`, `d170`, `d172`, `d174`, `d0d2`, `d190`, `scr0`, `scr1`,
plus `scroll` (`$813176`). **That is how the halt was verified: not by reading
the port's own output, but by 0 divergent frames on the board's own scroll state
across the entire stop.**

### 3.2 THE RELEASE - ported, and TRANSCRIBED BUT UNEXERCISED. Said plainly.

`$26B72C clr.w $8130D8` + `$26B73A jsr $261100` with D0 = D1 = `$0020`, on the
single frame the death countdown `($17,A5)` passes `$30`. `$261100` is now
`src/background.js pushExternalSpeed`, and its consumer `$2612AA` - ported since
W13 - overwrites the parked background object's speed with `$0020`. Until this
wave **nothing in the port ever produced `$813180`**, so that arm was live code
with no reachable producer.

**NO RUN IN THIS CORPUS KILLS THE MIDBOSS**, so the release path has never been
compared against the board. It is checked by three unit tests (§5, M1/M2/M3) and
by the listing, and by nothing else. Closing that needs a scenario that shoots
the midboss dead, which this wave did not record.

---

## 4. WHAT THE MIDBOSS ACTUALLY DOES, AND THE BULLET KINDS

### 4.1 THE BODY

Eight ARMS at `($20,A6) + n*$40`, each with its own four-state machine, plus a
four-state machine on the body itself. The body's state 2 owns **THE BIG FAN**:
eleven `dbra` blocks off ONE `aim256`, alternating `$2817B8` and `$281764` and
selected by **bit 0 of `($D,A6)`**, which the state machine steps down from 2 -
so the fan has an ODD frame and an EVEN frame and they fire different
generators AND different kinds:

- `($D,A6)` **EVEN**: six `$2817B8` blocks of 4 = **24 bullets of kind 3**
  (`$26BA1C move.l #$50003,D0` - the kind is D0's low word).
- `($D,A6)` **ODD**: a 7-shot `$2817B8` pre-fan (`$26B9E6 move.l #$30003,D0`,
  kind 3) plus five `$281764` blocks of 4 = **20 bullets of kind 4**.

**THE PRE-FAN READS THE PLAYER RECORD AS A TABLE, and it is transcribed as
such.** `$26B9F4 move.l (A0,D3.w),D3` runs BEFORE `$26BA16 lea $2736FA,A0`, so
A0 is whatever `$24226E` left - and `$2422A2` saves and restores A0 across its
own table reads, so what it left is `$24270A`'s selection: `$8103E6` or
`$810448`. That is a RAM read of the player-record region, not a ROM table. A
port that "fixed" it to `$2736FA` would invent a different bullet every odd
frame; mutation M16 does exactly that and reddens the test that pins it.

The arms fire `$2817A8` twice (`$26BCE4` kind 7, `$26BD76` kind 7), gated by a
rotor: `($20,A5)` steps 0..7 every frame and an arm may fire only when its
`dbra` counter D7 matches `($20,A5) & 3`, so at most two of the eight fire per
frame, and only with a facing strictly inside (`$20`, `$E0`).

### 4.2 THE KINDS - reported explicitly, because the brief asked

A survey of the page's own loop over `fly-around`'s window (scratch, not
committed; **no throw occurred anywhere in the 2,200 frames**, so this is NOT an
off-distribution run in the sense `docs/knowledge/09` warns about - it is the
same path the gate compared):

| | W30 | W31 |
|---|---|---|
| peak live bullets | 27 of 210 | **70 of 210** |
| first live bullet | lf2040 | lf2041 |
| bullet KINDS ever live | {4, 5, 13, 19} | **{3, 4, 5, 7, 13, 19}** |
| distinct fire sites | 5 | **19** |
| spawns | 102, 0 dropped | **721, 44 DROPPED** |

**KINDS 3 AND 7 EXECUTE FOR THE FIRST TIME - AND THAT DOES NOT CLOSE W27's F1.**
Both are inside the set `{3,4,5,6,7,12,13,19}` that `27-review.md` F1 measured
as the only kinds any board recording has ever contained, i.e. both are **W26**
bodies. **Zero of W27's 29 bodies have executed anywhere but their own unit
test, still.** The denominator is 37 and the numerator is now **6 of the 8 W26
bodies executing in the product** (3, 4, 5, 7, 13, 19 - 6 and 12 have not), with
the other 29 unexercised. If a later wave wants F1 closed it needs the kinds,
not more fire sites; nothing the midboss fires is one of W27's.

**44 BULLETS WERE DROPPED, AND THAT IS THE FIRST TIME THIS PORT HAS EVER HIT THE
POOL CAP.** Peak live is exactly 70, which is the FIRST rung of the
`$81B414..$81B41A` window ladder - the seed has all four window words 0 (W29
measured that), so the free-slot search only examines 70 of the 210 slots. The
drops are therefore what the board's own window state implies, not a defect in
the search; but the pool is not a compared column, so **I did not verify the
board dropped the same 44.** Stated as a limit, not as a result.

**EVERY FIRE, BY THE ROM ADDRESS OF THE `jsr` THAT MADE IT** (fired / spawned /
dropped; declined was 0 everywhere):

```
$268B14   51/51/0      type $11's kind-$D fan            (W30)
$275AD0   15/15/0      type $85's kind-$D fan            (W30)
$281484   20/20/0      type $80's laser pair             (W30, site = the entry)
$2817A8   14/14/0      type $80's NARROW loop            (W30, ditto)
$2817B8   16/16/0      type $80's WIDE loop              (W30, ditto)
$26BA04   28/28/0      THE MIDBOSS pre-fan (kind 3)
$26BA3E   16/16/0   \
$26BA9A   16/16/0    |  the six $2817B8 blocks, kind 3
$26BAF6   16/16/0    |
$26BB52   16/16/0    |
$26BBAE   16/16/0    |
$26BC0A   16/16/0   /
$26BA6C   16/16/0   \
$26BAC8   16/11/5    |  the five $281764 blocks, kind 4
$26BB24   16/8/8     |
$26BB80   16/6/10    |
$26BBDC   16/4/12   /
$26BCE4  335/326/9      the arms' idle fire (kind 7)
$26BD76   56/56/0       the arms' burst fire (kind 7)
```

---

## 5. THE SECONDARY QUESTION: IS THE MIDBOSS THE `rng` CONSUMER? NO.

**Measured, on the same trace, split at the midboss's first frame:**

```
lf2001..3097  (BEFORE the midboss runs):  143 of 1097 divergent,
              first lf2955 port=63 board=64, largest gap 2
lf3098..4200  (the midboss is live):     1103 of 1103 divergent,
              first lf3098 port=67 board=69, largest gap 11
```

The pre-midboss half is **identical to W30's numbers, to the frame and to the
value.** So this wave changed nothing before lf3098, and **the midboss is not the
consumer of the lf2955 divergence.** Saying so plainly, as the brief asked.

The gap at lf3098 (the midboss's first frame, including its init) is 2 - the
same as the drift it inherited - so the port took exactly the number of draws
the board did on the spawn frame: **the four `$26B2AC` draws are right in count**.
It first exceeds 2 at lf3114.

**WHAT I COULD ATTRIBUTE, from the listing.** The counter is bumped by 32
routines, and three of them are reached only through code the port NOTES:

- **`$28AC72`** - the sub-record spawn engine, which this port notes 1,103
  times for the midboss alone - calls `$242FDE` **TWICE**, at `$28AD0A` and
  `$28AD1C`. It is noted from lf2346 onward, i.e. before lf2955.
- The `$289xxx` effect family behind the noted `$289004`/`$28615E` reaches
  `$242FDE` at `$2896A6`/`$289D22`/`$289D5E` and `$2431F4` at
  `$28979E`/`$2897B4`/`$2897E0`/`$289D70`.
- The noted type-5 calls `$289B80`, `$288E4E`, `$2890F2` and `$28A098` all live
  in those two ranges.

So the CLASS is attributable and the individual frame is not: the drift steps
down one at a time (lf2955, 3061, 3114, 3167, 3220, 3418, 3450, 3498, 3530,
3546, 3578) with **no note first appearing on any of those frames** - every
candidate was already running. **I could not identify which routine takes each
extra draw, and I did not run MAME to tap it.** What I did was: enumerate all 32
bump sites, resolve every absolute caller of each, and check which of those
callers the port notes.

One transition points the other way and is worth recording: at **lf3624 the gap
jumps from −11 to −6, i.e. the port gains exactly 5 draws in one frame** - which
is precisely `$26B35E` (1 × `$242FDE`) plus `$26B380 bsr $26B2AC` (4 more), the
midboss's arm-launch frame. The port's own draws show up in the column at
exactly the count the listing says.

---

## 6. WHAT THIS WAVE WROTE

- **`src/midboss.js`** (NEW) - the handler `$26B6FA`, the arm kinematics
  `$26B304`, the arm init `$26B286`/`$26B2AC`, the death burst `$26B184`, the
  three draws (`$26BFC2`, `$26BE0C`, `$26BF10`) and the screen-clear arming
  `$243E7C`.
- **`src/rng.js`** - `$2431F4` and `$242FDE`, plus the corrected note about the
  32-site family.
- **`src/background.js`** - `$261100 pushExternalSpeed`.
- **`src/spritequeue.js`** - a fourth stub prologue shape (`2F08 2F00`) for
  `resolveEmitStub`, so `$23E056`'s bucket comes from the cartridge.
- **`src/handlers.js`** - `$26B6FA` in the dispatch map (10 addresses now).
- **`src/initbody.js`** - the midboss init body now RUNS both `bsr`s instead of
  noting them (§6.1).
- **`src/spawn.js` / `src/enemyframe.js`** - `tables` threaded to the init body,
  APPENDED to five signatures so no existing call site changed.
- **`tools/export-tables.py`** - 4 new windows, 1 widened, speed level `$70`.

### 6.1 A NOTE THAT WAS NOT COSMETIC

W23's midboss init body carried:

```js
unported?.note(0x26b286, `midboss bespoke $26B286 (part setup) -- not a stat`);
unported?.note(0x26b304, `midboss bespoke $26B304 (part setup) -- not a stat`);
```

Both are now real calls, and "not a stat" was wrong about both:

- `$26B4B0 bsr $26B286` ends `bsr $26B2AC`, which takes **four draws off the
  shared `$803917` counter**. Noting it left the port four draws behind the
  board from the midboss's spawn frame onwards - the `rng` column, not a
  cosmetic.
- `$26B4B4 bsr $26B304` does one step of the swing machine and the initial
  PLACEMENT of all eight arms. **The board runs it TWICE on the spawn frame** -
  once here, once from the handler, which the driver reaches on the same frame
  (W29's order result). Running it once would leave `($1C,A5)` one step behind
  for the whole life of the boss.

That is why `tables` had to be threaded: `$26B304` reads `$241D34`. A caller
that omits it now reaches a **loud named throw at `$26B4B4`** rather than a
silent skip, and there is a test for that throw pinned on `romAddress`.

---

## 7. EVERY CHECK WAS SEEN TO FAIL - AND SIX OF THEM COULD NOT

`games/ddpdoj/tests/w31midboss.test.js`, 21 tests, plus the existing suite.
Mutations applied byte-exactly in Python with a single-occurrence anchor
assertion, the whole suite run, the file restored, sha256 verified identical both
ways after every one (`src/midboss.js` `1ef5ed51dee68a8e`, `src/rng.js`
`af2cab9f57b3486e`, `src/spritequeue.js` `de2d9cc38c98a91a`).

| # | mutation | result |
|---|---|---|
| M1 | `$26B736` pushes D1 = `$21` | GREEN, then **RED - 1** |
| M2 | `$26B722` compares `#$31` | RED - 2 |
| M3 | `$26B72C` sets `$8130D8` instead of clearing it | RED - 1, alone |
| M4 | `$2431FA` masks `$FF` instead of `$3F` | RED - 1, alone |
| M5 | `$242FE4` gains a `$3F` mask it does not have | GREEN, then **RED - 1** |
| M6 | `$2431F4` does not bump the shared counter | RED - 3 |
| M7 | `$26B2F6`/`$26B2F8` doubles once instead of twice | RED - 1, alone |
| M8 | `$26B298` steps the arm facing by `$10` | RED - 1, alone |
| M9 | the fourth stub shape skips 2 bytes instead of 4 | RED - 3 |
| M10 | `$243E8E` compares `#$4C` | RED - 1, alone |
| **M11** | **`$26BFD2` read as two `addi.w` instead of one `addi.l`** | **GREEN - AND IT CANNOT BE CAUGHT (see below)** |
| **M12** | **`$26BF22`'s carry let into the high half** | **GREEN - same reason** |
| M13 | `$26BE1C` reads `$26BE70` instead of `$26BE90` | RED - 1, alone |
| M14 | `$26BE46` indexes by `($30,A0)` instead of `($A,A0)` | RED - 1, alone |
| M15 | `$26B9DE` tests bit 1 instead of bit 0 | RED - 1, alone |
| M16 | `$26B9F4` reads `$2736FA` instead of A0 (the player record) | RED - 1, alone |
| M17 | `$26BCC0`'s `bcc` read as `bhi` | RED - 1, alone |
| M18 | `$26BCCA`'s `bls` read as `bcs` | RED - 1, alone |
| M19 | `$26BCA6` uses the ARM INDEX instead of D7 | GREEN, then **RED - 1** |
| M20 | `$26B8D8`'s `bgt` read as UNSIGNED | RED - 5 |
| M21 | `$26B43C` always exits - the `$10`-step walk never runs | RED - 1, alone |
| M22 | `$26BDFC`'s guard dropped | GREEN, then **RED - 2** |
| M23 | `$26B214` walked to a counted 13 instead of the `$FFFF` | RED - 1, alone |
| M24 | `$26B184` writes `$60` instead of `$70` | RED - 1, alone |

**SIX SURVIVED THE FIRST PASS. FOUR WERE DEFECTIVE CHECKS AND ARE FIXED; TWO ARE
UNCATCHABLE AND THAT IS A MEASURED FACT, NOT AN EXCUSE.**

- **M1 - a check that read one of two words.** The call-site test collected only
  `$813182` (D0's) and not `$813184` (D1's), so the second `move.w` was never
  examined at the site that produces it. The DIRECT test of `$261100` does check
  both, but it supplies its own two constants, so it is a round-trip. Fixed by
  collecting both words at the call site; RED, one test.
- **M5 - a fixture value at which two operations agree**, the exact shape W30's
  M15 had. `$24301A` is almost all `0`s and `1`s, so at most indices a masked
  read returns the same byte as an unmasked one and the check agrees with itself
  whichever way it is written. Fixed by choosing index `$40`, the first index at
  which `$24301A[i]` and `$24301A[i & $3F]` differ, and the test now asserts
  **out loud** that its own fixture can distinguish them. RED, one test.
- **M19 - a check that counted instead of naming.** `$26BCA6` uses the `dbra`
  counter D7 = 7−n; the mutation used the arm index n. **Both make exactly two
  of eight arms match any phase**, so the count could never tell them apart.
  Fixed by leaving only arms 0 and 4 alive: their D7 values are 7 and 3 (both
  ≡ 3 mod 4) and their indices are 0 and 4 (both ≡ 0 mod 4), so the two readings
  fire at **disjoint** phases. RED, one test.
- **M22 - a guard the port had made unreachable.** My first structure inlined
  the death arm's body draw instead of entering `$26BDF8`, so `$26BDFC`'s
  `bne $26BE0A` was dead code in the port and no mutation of it could matter.
  That is a defect in its own right (`docs/knowledge/03`: a check that cannot
  fail, here because the code cannot run). Restructured so the death arm reaches
  the SAME entry the live path uses, which is the only way `$26BDFC` is ever
  entered with `($17,A5)` non-zero. RED, two tests.

### 7.1 M11 AND M12 CANNOT BE CAUGHT, AND HERE IS THE MEASUREMENT

`$26BFD2 addi.l #$DC00E600` is ONE 32-bit add; `$26BF22`/`$26BF28`/`$26BF2C`
straddle a `swap` and are two 16-bit adds that must NOT carry. That distinction
is real in the listing and **has no observable consequence at either call site**:

```
one addi.l : $40002000 + $DC00E600 = $1C010600
two addi.w :                         $1C000600
after $23DF66 asr.l #6 and $23DF68 andi.l #$07FF03FF, both are $00700018
```

The only difference is a carry that adds 1 to the HIGH word; `asr.l #6` moves
that bit to position 10, and `andi.l #$07FF03FF` clears bits 10..15 of the low
half. **The emitted sprite record is identical either way, for every input.** So
no check reachable through the queue can distinguish them, and the transcription
of those two instructions rests on the listing alone. The two tests' titles and
comments were rewritten to claim only what they can prove, with the reason
asserted in the test body (`assert.equal(enq(packed), enq(packedW))`) so the
next reader does not re-derive it.

**24 mutations, 22 RED (20 of them narrow - one or two named tests), 2 provably
uncatchable, and every source file byte-identical after every one.**

---

## 8. THE FULL GATE

`python tools/oracle/pgm.py check`, run to completion on the final tree:

```
VERDICT: FAILURES -- 45 passed, 4 failed, 0 SKIPPED
  [FAIL] scroll program: the port vs the whole of stage 1 (10,431 frames)
  [FAIL] scroll program RED (9 mutations)
  [FAIL] scroll program: the ATTRACT entry clock $0038 (1,364 frames)
  [FAIL] scroll program RED [no-fast-forward] on the attract entry
```

**44/5 -> 45/4, 0 SKIPPED, and the one that changed is `fly-around`.** The four
that remain are the pre-existing scroll-program red that has been failing since
W22 and that nobody owns; W29 and W30 both confirmed them unchanged and so does
this run. **This is the first time the DaiOuJou gate's failure count has gone
down.**

**Unit tests: 475 pass, 0 fail, 0 SKIPPED** (was 452 before this wave; 21 new
tests here, plus 2 added to `initbody.test.js`).

Three existing tests were UPDATED rather than left to rot, and each for a reason
this wave created:
- `handlers.test.js`'s registration test now expects ten addresses.
- `integration.test.js`'s `m.size` is 10, and its "an unported handler throws BY
  THAT ADDRESS" test now names **`$2697F6`** (type `$31`, which W29's survey
  reaches at lf8100) instead of `$26B6FA`, which is no longer a gap. A test that
  keeps naming a ported routine as unported is a test that has stopped meaning
  anything.
- `initbody.test.js`'s midboss test now passes `tables`, and two tests were
  added: the four `$803917` draws, and the `$26B4B4` throw when `tables` is
  absent.

### 8.1 A REGRESSION THIS WAVE CAUSED, AND THE GATE FOUND IT

The FIRST full run came back **44 passed / 5 failed** with a different fifth:

```
[FAIL] enemy stats: hitbox/HP/palette/HP-reload at spawn (W23) -- exit 1
  lf=3097 clk=c5 type=$d UNPORTED $26B4B4: the MIDBOSS init body reached
  $26B4B4 bsr $26B304 without a MoveTables
```

`tools/w23statsgate.mjs` calls `runInitBodyAddr` itself and did not pass
`tables`, so the throw §6.1 added fired inside the gate. **That is the throw
doing its job**: the gate named the routine and the frame instead of quietly
producing a wrong record. Fixed by constructing a `MoveTables` in the gate and
threading it through `runPort`.

**AND THE FIX IMPROVED THE GATE'S OWN RESULT**, which is a board-level number
and the only one in this wave that is not `fly-around`:

| | before W31 | after |
|---|---|---|
| stage-1 spawns matched | 307 of 308 | **308 of 308 (100.0000 %)** |
| scripted spawns with STRICT movement fields | 269 | **270** |

The one that was missing was type `$0D` at lf3097 - the midboss. Its spawn
stats are now bit-exact against the W23 board corpus (10,740 frames), and the
gate's three RED mutations still go red (820 / 111 / 14 divergent).

---

## 9. WHAT I COULD NOT DETERMINE

- **Which routine takes each extra `$803917` draw.** §5: the class is
  attributable to the noted subsystems (`$28AC72` calls `$242FDE` twice; the
  `$289xxx` family reaches four more draw entries), the individual frames are
  not. **I could not reach it; here is what I tried:** a scan of the whole 6 MB
  image for the bump instruction (32 build-B sites), an absolute-caller scan for
  every one of those sites, a per-frame diff of the port's `$803916` against the
  board's `rng` column with the note ledger snapshotted every frame, and a check
  of which note address first appears on each of the eleven frames the gap steps.
  None of the eleven has a new note. I did not run MAME and did not tap the
  board.
- **Whether the board dropped the same 44 bullets** (§4.2). The pool is not a
  compared column and I did not record one.
- **Whether the scroll RELEASE is right** (§3.2). It is transcribed and unit
  tested; no run in the corpus kills the midboss, so it has never been compared.
- **Whether `$286096` preserves D1.** `$26B7E8 move.w D1,($28,A5)` stores the
  hit mask after `$26B77C jsr $286096`, and the port assumes D1 survives.
  `$286096` itself only `btst`s D1, and `$286626` (its shortest callee) does not
  touch it - but it also `bsr`s `$286876`, `$286A82` and `$286DA8`, and I read
  only their entry paths. The ROM's own use of D1 two instructions later implies
  it survives; that is an inference, not a measurement, and `($28,A5)` is only
  ever consumed on a death frame that no corpus run reaches.
- **The extent of `$26C0FC`'s records beyond their stride.** 14 records of `$E`
  bytes, pinned from both ends, but the FIELD layout inside a record is
  `$246410`'s and `$246410` is a note.
- **Anything about the board that this wave measured itself.** No MAME was run.
  Every dynamic number above is either the PORT against the seeded RAM dump, or
  `portdiff.mjs` against the trace W29 recorded.

---

## 10. WHERE THE WAVE ENDED

**A. IS `fly-around` UNBLOCKED? YES.** 2,200 of 2,200 frames compared, **0 of 88
columns divergent**, no throw anywhere in the window. The gate's fifth failure
is gone and the remaining four are the scroll-program red that has been failing
since W22 and that nobody owns.

**B. DOES THE SCROLL HALT? YES, AND IT WAS VERIFIED AGAINST THE BOARD.**
`$813172` pins at 1600 from lf4021 to lf4200 with `$813176` = 0, while the
distance clock keeps ticking - and all sixteen claimed scroll columns matched on
every frame of the stop. The RELEASE (`$261100`, the midboss's own three writes)
is ported and its consumer has existed since W13, but nothing in the corpus kills
the midboss, so that half is transcribed and unexercised.

**C. DID ANY KIND OUTSIDE THE W26 EIGHT EXECUTE? NO.** Kinds **3 and 7** ran for
the first time anywhere, taking the live set from {4,5,13,19} to {3,4,5,7,13,19},
but both are W26 bodies and both were already inside `27-review.md` F1's
`{3,4,5,6,7,12,13,19}`. **Zero of W27's 29 bodies have executed. F1 is not
closed and this wave did not close it.**

**D. IS THE MIDBOSS THE `rng` CONSUMER? NO** - measured: lf2001..3097 is
identical to W30, first divergence still lf2955, and the midboss's first frame is
lf3098.

### RANKED, FOR THE REVIEWER

1. **§7's M11/M12** - two mutations that provably cannot be caught, because the
   enqueue's `$07FF03FF` mask discards exactly the bit an `addi.l` carry sets.
   If that reasoning is wrong, two instructions are unchecked.
2. **§7's M1/M5/M19/M22** - four of my own checks could not fail on the first
   pass. M22 is the worst of the four: the guard it tested was unreachable
   *because of how I had structured the port*.
3. **§6.1** - the two W23 notes that were not cosmetic. The `$26B304` one means
   the port ran the arm placement once per spawn frame where the board runs it
   twice, for eight waves.
4. **§4.1's pre-fan** - `$26B9F4` reads the PLAYER RECORD as a pointer table.
   Re-derive it; it is the single most surprising line in the port.
5. **§5** - the `rng` drift is now 1,246 of 2,200 frames and still unattributed
   to a routine.
6. **§4.2** - 44 dropped bullets, the first time this port has hit the pool cap,
   and the board's side of it is unmeasured.
7. **§3.2** - the scroll release has no board comparison.

## LOG (appended as findings arrive)

- opened.
- `$26B6FA` read in full out of the ROM; §1. It is FOUR routines and five data
  tables, not one body; the queue it pulls in is 5 new small routines and 8
  already-noted subsystems, and **no new large subsystem**.
- found the RNG FAMILY (§1.3): 32 build-B sites share `$803917`. Two are the
  midboss's; `src/rng.js` named one other bumper and there are thirty.
- ported; **`fly-around` went 1,097 -> 2,200 frames, 0 of 88 columns divergent,
  not blocked.**
- the scroll halt verified against the board (§3.1): `$813172` pins at 1600 from
  lf4021, sixteen claimed scroll columns 0 divergent across the stop.
- the `rng` question answered: the midboss is NOT the lf2955 consumer (§5).
- kinds 3 and 7 execute for the first time; both are W26 bodies, F1 stands (§4.2).
- 24 mutations; six survived the first pass, four were defective checks (fixed
  and re-run RED) and two are provably uncatchable (§7.1).
- the first full gate run came back 44/5 with a NEW fifth -- the W23 stats gate,
  which this wave's `tables` thread broke and which the throw named exactly
  (§8.1). Fixed; the gate then improved from 307/308 to 308/308.
- the final gate: **45 passed / 4 failed / 0 SKIPPED**, the four being the
  pre-existing scroll-program red.
- **A SKIP APPEARED AND WAS CHASED, NOT TOLERATED** -- the same one W29 hit:
  `movement.test.js`'s W24 stream inventory started skipping because its
  gitignored input `assets/w24-movement/stage1-streams.json` had been deleted by
  a concurrent `pgm.py check`. Regenerated with
  `python games/ddpdoj/tools/oracle/w24streams.py` (note: it must be run from the
  REPO ROOT, not from `games/ddpdoj/` -- its IMG path is repo-relative). Final:
  **475 pass, 0 fail, 0 SKIPPED**.

status: DONE
