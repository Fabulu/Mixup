# W31 — IMPL: the stage-1 MIDBOSS `$26B6FA`

status: **IN PROGRESS**
wave: 31. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
date: 2026-08-04.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
unless noted.

## THE BRIEF

Port `$26B6FA`, the stage-1 midboss (type `$0D`) — the largest single body in
the stage and the SOLE remaining blocker of the `fly-around` gate scenario
(W30 §3: the window is 2,200 frames from lf2000 and the port is BLOCKED at
lf3098).

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

`$26B6FA` is the type-`$0D` handler and it is 576 instructions ONLY if you count
the three bodies it reaches by `bsr` and the four data tables inside its own
extent. Read past the apparent end in both directions:

| span | what | ends because |
|---|---|---|
| `$26B184..$26B213` | the DEATH-BURST spawner, `bsr` from `$26B7F8` | `$26B212 rts`; `$26B214` is its own data table |
| `$26B214..$26B285` | that spawner's 14-record list, terminated `$FFFF` | `$26B286` is the next routine's first instruction |
| `$26B286..$26B302` | the 8-arm INIT (`bsr` from the init body `$26B4B0`) | `$26B2AA rts`, then `$26B2AC` is its own `bsr` target |
| `$26B304..$26B47A` | the 8-arm KINEMATICS, `bsr` from `$26B906` | `$26B47A rts`; `$26B47C` is type `$0D`'s init STUB (`move.w #$10,($4,A5) / rts`) |
| `$26B484..$26B4F8` | the INIT BODY (already ported, W23) | `$26B4F8 rts`; `$26B4FA` is its prototype data |
| `$26B6FA..$26BE6E` | **THE HANDLER** | `$26BE6E rts`, reached only from `$26BE02 bsr $26BE0C` |
| `$26BE70..$26BF0F` | two sprite-pointer tables | `$26BF10` is code (`lea $26BF42(pc),A0`) |
| `$26BF10..$26BF41` | the handler's TAIL, `bra` from `$26BE06`, ends `jmp $23DF58` | `$26BF42` is its table |
| `$26BF42..$26BFC1` | 32 longwords | `$26BFC2` is code |
| `$26BFC2..$26BFE7` | the BODY sprite request, `bsr` from `$26BDF8`, ends `jmp $23DF58` | `$26BFE8` is its table |
| `$26BFE8..$26BFFB` | 5 longwords | `$26BFFC` breaks the pattern |

**THE FALL-THROUGH THAT MATTERS.** `$26BDF8 bsr $26BFC2` and `$26BE06 bra
$26BF10` are the two `jmp $23DF58` tails: the routine does not end at an `rts`,
it ends at a TAIL CALL into the sprite queue, twice, and a reader who stopped at
the first `rts` (`$26BE0A`) would miss both the body sprite and the shadow.

### 1.2 EVERY `jsr`/`jmp`/`bsr` TARGET, AND ITS DISPOSITION

| site(s) | target | what it is (from the listing) | disposition |
|---|---|---|---|
| `$26B702`, `$26B900` | `$24179E` | the scroll compensation | **PORTED** (W24 `scrollCompensate`) |
| `$26B70C`, `$26B80C` | `$243E7C` | **THE BULLET-TO-SCORE SCREEN CLEAR** — arms `$81B410`/`$81B412`, then walks the 210-slot bullet pool `$817F8C` awarding `$46` per live bullet through `$28614A`/`$286154` | **PORTED THIS WAVE** (the arm), the score walk noted |
| `$26B73A` | `$261100` | **THE EXTERNAL SCROLL SPEED PUSH** — `$813180:=1`, `$813182:=D0`, `$813184:=D1` | **PORTED THIS WAVE** (3 writes; the CONSUMER `$2612AA` is already ported, `src/background.js:1010`) |
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
| `$26B9CC` | `$24226E` | aim256, self from the caller | **PORTED** (W20 `aim256FromCaller`) |
| `$26BA04`… ×6 | `$2817B8` | bullet generator entry | **PORTED** (W21 `bullets.js`) |
| `$26BA6C`… ×5 | `$281764` | bullet generator entry | **PORTED** (W21) |
| `$26BCE4`, `$26BD76` | `$2817A8` | bullet generator entry | **PORTED** (W21) |
| `$26BE3A`, `$26BE60` | `$23E056` | the register enqueue — `lea $80688C / adda.w $80AFC6`, i.e. **BUCKET 3**, byte-identical to `$23DF58` but wrapped in `move.l A0,-(A7) / move.l D0,-(A7)` | **PORTED THIS WAVE** (a fourth stub SHAPE for `resolveEmitStub`) |
| `$26BF3A`, `$26BFE0` | `$23DF58` | the register enqueue, bucket 3 | **PORTED** (W11) |
| `$26B1CC` | `$28C310` | an effect burst (the `$28C02A` family) | note |
| `$26B2AC` ×3 | `$2431F4` | **an RNG SIBLING** — same `addq.b #1,$803917` counter, different 64-byte table `$24324E` | **PORTED THIS WAVE** |
| `$26B2AC`, `$26B35E` | `$242FDE` | **an RNG SIBLING** — same counter, 256-byte table `$24301A`, **NO MASK** | **PORTED THIS WAVE** |
| `$26B3BC`, `$26B406` | `$241D34` | the shot vector | **PORTED** (W8 `shotVector`) |

**16 distinct external targets. 9 already in the port, 5 ported this wave, 8
subsystems noted — and every noted one is a subsystem some other ported handler
already notes.** No new large subsystem is dragged in. The one that could have
been — `$243E7C`, which looked at first like a whole screen-clear machine — is
in fact ten instructions of arming plus a walk over a pool the port already
owns; its score half is noted with the same `$28614A`/`$286154` family as
`$28615E`.

### 1.3 THE TWO RNG SIBLINGS, AND WHY THEY ARE A FINDING

`src/rng.js` documents `$2433AE` as "the board's random source" with the state
word `$803916` and the caveat that **the counter is shared**. It is shared with
more than the port knew: a scan of the whole decrypted image for
`523900803917` (`addq.b #1,$803917`) finds **32 sites in build B alone**
(`$24276C`, `$242B3C`, `$242B58`, `$242B74`, `$242B90`, `$242CAC`, `$242CCA`,
`$242CE8`, `$242D06`, `$242E24`, `$242EC2`, `$242FDE`, `$242FFC`, `$24311A`,
`$243138`, `$243156`, `$2431F4`, `$243212`, `$243230`, `$24328E`, `$2433AE`,
`$2434D0`, `$2434F2`, `$243614`, `$243736`, `$243858`, `$24397A`, `$243A9C`,
`$243BBE`, `$289F62`, `$28AB86`, `$28ABE0`). They are a FAMILY of draws over
different canned tables, all bumping one 8-bit counter.

Two of them are the midboss's:

- `$2431F4` — `moveq #$3f,D0 / and.w $803916,D0 / move.b ($24324E,PC,D0.w),D0`.
  Table `$24324E..$24328D`, 64 bytes, **pinned from both ends**: `$24328E` is
  the next `addq.b #1,$803917`.
- `$242FDE` — `move.w $803916,D0` with **NO MASK**, then
  `move.b ($24301A,PC,D0.w),D0 / ext.w D0`. Table `$24301A..$243119`, **256
  bytes, pinned from both ends** (`$24311A` is code). The unmasked index is safe
  only because `$23BE36 clr.w $803916` zeroes the high byte and `addq.b` never
  carries into it — which is exactly the property `src/rng.js` already records.
  The port reads through the ROM window, so a non-zero high byte becomes a loud
  "outside every ROM window" throw instead of a wrong byte.

### 1.4 THE FOUR NEW ROM TABLES, EXTENTS PINNED FROM BOTH ENDS

| table | read at | index | extent | how the far end is pinned |
|---|---|---|---|---|
| `$26B214` | `$26B1D2` | sequential, `$FFFF`-terminated | `$26B214..$26B285`, 14 × 8 B | the terminator, and `$26B286` is code |
| `$26BE70` | `$26BE40` | `($A,A0)`, steps 4, `cmpi.w #$1C` | `$26BE70..$26BE8F`, 8 longs | abuts `$26BE90` |
| `$26BE90` | `$26BE1C` | `($30,A0)`, `andi.w #$7F` after `addq.w #4` | `$26BE90..$26BF0F`, 32 longs | `$26BF10` is `lea $26BF42(pc),A0` |
| `$26BF42` | `$26BF10` | `($8,A6)`, steps 4, `cmpi.w #$7C` | `$26BF42..$26BFC1`, 32 longs | `$26BFC2` is `lea $26BFE8(pc),A0` |
| `$26BFE8` | `$26BFC2` | `($24,A5)`, steps 4, `cmpi.w #$14` | `$26BFE8..$26BFFB`, 5 longs | the five are spaced `$EA4`; `$26BFFC` = `$01660000` breaks it |

`$26C0FC` (the `$246410` argument list) is `$000E` = 14 records of `$E` bytes,
`$26C0FC..$26C1C1`, pinned at the far end by `$26C1C2` = type `$0F`'s init stub.
**No window is declared for it, because `$246410` is a note** — declaring one
would claim a read the port does not make.

### 1.5 SPEED LEVEL `$70`

`$26B3B2` and `$26B3F8` both `move.w #$70,D0` into `$241D34`, so the port needs
quadrant table 112 of `$200920`. `tools/export-tables.py` derives its exported
level set from templates, and 112 is an in-code CONSTANT, not a template byte.
Added as a derived-from-the-listing entry with its two ROM addresses, exactly as
W12 did for the pods' 224.

## LOG (appended as findings arrive)

- opened.
- `$26B6FA` read in full out of the ROM; the enumeration above is §1. It is
  FOUR routines and five data tables, not one body; the queue it pulls in is 5
  new small routines and 8 already-noted subsystems, and **no new large
  subsystem**.
- found the RNG FAMILY (§1.3): 32 build-B sites share `$803917`. Two are the
  midboss's.
