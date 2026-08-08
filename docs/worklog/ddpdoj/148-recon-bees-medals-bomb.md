# 148 -- RECON: BEES, MEDALS and the BOMB'S TRANSLUCENCY

status: **IN PROGRESS.** opened 2026-08-08.

wave: 148. role: RECON (READ-ONLY). Nothing under `games/ddpdoj/src/` or
`games/ddpdoj/tools/` was modified. Throwaway harnesses live in
`.scratch/w-bees/` and are not committed. target: `ddpdojblk` VERSION-B
(2002.10.07 BLACK VER); every address is build B.

instruments:
* `games/ddpdoj/tools/oracle/out/maincpu.bin` (address == file offset,
  big-endian M68K), read by python, for every ROM citation below;
* a headless harness built on the page's own modules (`web/assets.js
  loadBundle` -> `src/main.js Game`), the same device `tools/playgate.mjs`
  uses, so "the page would do this" and "this measured this" are one
  statement.

`[M]` = measured by me this session.

---

## 0. PREMISE CHECK -- THE BRIEF IS WRONG ON ITS TWO LOAD-BEARING CLAIMS

The brief rests on two facts about the state of this tree. Both are false, and
this section beats the rest of the document.

| brief's claim | `[M]` | verdict |
|---|---|---|
| "**Nobody on this project has ever investigated medals.**" | `110-recon-medals-bee-port.md` is a 572-line DONE recon titled "the BEE PORT PLAN (**yellow 500-pt medals**)", closed 2026-08-06 | **FALSE** |
| "**pool A's driver `$27F95A` is UNPORTED**, so killing a carrier yields no bee" | `111-impl-bee-medal.md` (DONE, same day) ported it. `src/type5.js:236` lists `0x27f95a` in `TYPE5_PORTED`; `src/type5.js:369` calls `runPoolADriver`; `src/bee.js:433` is the driver | **FALSE** |

This is the sixth time a brief here has re-opened something already written
down, and the second time it has been the bee. `CATCHUP.md:383` records W111 as
live at `20260806222827`. The brief was written from the pre-W111 map.

**Two further claims in the brief are sound and are re-verified below**: the bee
body is `$27FACC` in pool `$8171BE`, and the carrier is enemy type `$8A` with
HP 10 and an every-other-frame emit.

**The bomb item is also already closed**, by `122-recon-boss-bomb-mame.md`
(2026-08-07), a worklog the brief does not cite. See section 3.

---

## 1. MEDALS -- THE MEDAL **IS** THE BEE. IT EXISTS, AND IT IS PORTED.

### 1.1 There is no separate medal object

`[M]` from the image. The 500-point pickup is **kind index 1 of pool A**
(`$8171BE`), whose body is `$27FACC`, whose award base comes from the ladder at
`$27FD22`:

```
[M] $27FD22 = 00000100 00000200 00000300 00000400 00000500
              00000600 00000700 00000800 00000900 00001000   (BCD longs)
```

Index 4 is `$0500`. That is the "500-point medal". It is the bee.

`[M]` `$27F99E`, the 20-entry kind dispatch, read as longwords:

```
[M] 27fa30 27facc 27fe0e 27fed2 27fa30 27ff9a 280082 28016a 280252 28036a
    280486 2805a2 2806be 2807d6 2808f2 280a0e 27facc 27ff9a 280082 28016a
```

kind[1] == kind[16] == `$27FACC`. Confirms W110 and recon 73.

**It is NOT the item family.** The item pool is `$27E812` + its five sprite
tables (W61, `src/items.js`); item kinds award `$10` or `$1000` through
`$286128`, never `$0500`. `[M]` the string `medal` appears nowhere in
`games/ddpdoj/src/`, and that is correct rather than a gap: the ROM has no such
object. **So the brief's "is this the same family as `$27E812`/W61" question
answers NO, and it is still a small job, because it is already done.**

### 1.2 It is ported, and the constants are right

`[M]` I re-derived every constant `src/bee.js` hardcodes, straight from the
image, without reading the source first:

| constant | `[M]` from `maincpu.bin` | `src/bee.js` | verdict |
|---|---|---|---|
| `$280EB0` bee template, 22 bytes | `fa00 fd00 001bca34 0618 0980 0980 0780 0780 0000 001c` | `BEE_TEMPLATE` | MATCHES |
| `$280BB6` layer emitters, 6 longs | `23d762 23d762 23d79e 23d7da 23d816 23d852` | `LAYER_EMITTERS` | MATCHES |
| `$27F99E` dispatch, 20 longs | above | `DISPATCH` | MATCHES |
| `$27FD22` ladder, 10 BCD longs | above | `BASE_LADDER` | MATCHES |
| `$2766E6` carrier prototype, 28 bytes | `8100 fa00 fd00 001bca34 0618 0500 0700 0400 0400 000a 1000 001c 0000` | (HP `$000A` at byte `0x14`) | MATCHES |

`[M]` the death arm `$2767D0`, byte-verified:

```
$2767D0  7001              moveq #$1,D0
$2767D2  4eb9 0028615e     jsr $28615E      scoreKill, 1 pt
$2767D8  4eb9 0028c25a     jsr $28C25A      the death cue
$2767DE  302d 001a         move.w ($1A,A5),D0    = $0004, bee kind index 1
$2767E2  142e 001f         move.b ($1F,A6),D2    the display layer
$2767E6  4eb9 0027f92a     jsr $27F92A      THE BEE ALLOCATOR
$2767EC  700c              moveq #$C,D0
$2767EE  4eb9 00289004     jsr $289004      the pool-B explosion
```

`src/handlers.js:2096` calls `allocBee27F92A` at exactly `$2767E6`. The note the
brief believes is still there was replaced by W111.

### 1.3 `[M]` IT RUNS. END TO END. MEASURED THIS SESSION.

`.scratch/w-bees/run5.mjs`: headless from the page's own seed, a carrier's HP
poked negative so the death arm fires. The bee then does all of this without a
single throw:

```
[M] lf2715 slot70 st=$8004 pos=29952,15296 spr=$1bca80 blink=2 emit=$23d816 live=1
    lf2716 slot70 st=$8004 pos=29888,15296 spr=$1bca34 blink=1 emit=$23d816 live=1
    lf2717 slot70 st=$8004 pos=29888,15296 spr=$1bca34 blink=0 emit=$23d816 live=1
    lf2718 slot70 st=$8004 pos=29824,15296 spr=$1bca80 blink=2 emit=$23d816 live=1
```

allocated into the reserved ten (slot 70 == `$817DC6`), status `$8004` (kind 1),
scrolled `$40` per frame on the short axis, blinking A/A/B on the 20 Hz cadence
`$27FC8C` describes, emitting through layer stub `$23D816`.

`.scratch/w-bees/run10.mjs`: **the bee reaches the FINAL display list at
`$800000`**, through bucket 3:

```
[M] lf2715 bkt3recs=4 entries=74 beeInDL=1  @22 w0=$81bc w1=$80e3 long=444 short=227 sprHi=$1c1b sz=$618
    lf2716 bkt3recs=4 entries=76 beeInDL=2  @22 w0=$81bb w1=$80e3 long=443 short=227 ...
```

`sz=$618` and the low sprite word `$CA34`/`$CA80` are the bee's. So **the port
allocates, drives, blinks, scrolls, emits and LISTS the bee.** Nothing about the
bee itself is missing.

---

## 2. BEES -- WHY NONE APPEAR, AND WHAT THE "COVER" IS

### 2.1 `[M]` The carriers spawn. All ten. They are never killed.

`.scratch/w-bees/run3.mjs`, 8000 logic frames, laser held, ship parked:

```
[M] CARRIER $276702 events: 20   (ten spawns, ten disappearances)
    spawn slot12 lf2714 ... GONE slot12 lf3839 poolAlive=0
    spawn slot15 lf2778 ... GONE slot15 lf3899 poolAlive=0
    ... every GONE line reads poolAlive=0
    maxDistanceClock($8130CE)=836   (the ten $8A triggers are 173..452)
```

Every carrier lives ~1000-2200 frames and scrolls away alive.
`.scratch/w-bees/run11.mjs`, same run with the ship sweeping left/right:

```
[M] slot10..slot20:  hp min=10 max=10 framesAlive=960..2274 framesHit=0
    frames with carrier hit-bits set: 0
```

The control says the damage machine works: `.scratch/w-bees/run12.mjs` measured
**1310 enemy HP drops (laser) / 2654 (auto-shot)** in the same 8000 frames, and
**0 of them on a carrier**, both modes.

### 2.2 `[M]` WHY: only ONE of the six damage blocks accepts a bee carrier

The carrier's sub-record status byte is `$81` (word `$8100`), from its own
prototype. `[M]` the three gates, byte-verified from the image:

```
[M] $244F8C  301d          move.w (A5)+,D0        block 6a, THE SHOT PASS
    $244F8E  6af8          bpl (scan dead)
    $244F90  0240 2000     andi.w #$2000,D0
    $244F94  67e6          beq  -> SKIP                <- carrier $8100: SKIPPED

[M] $245216  1815          move.b (A5),D4         block 7, THE A2 WEAPON
    $245218  0804 0005     btst #5,D4
    $24521C  6606          bne  -> accept
    $24521E  0804 0000     btst #0,D4
    $245222  6730          beq  -> SKIP                <- carrier $81: ACCEPTED (bit 0)

[M] $2452C4  0815 0005     btst #5,(A5)           block 8, THE BEAM'S OWN PASS
    $2452C8  673a          beq  -> SKIP                <- carrier $81: SKIPPED
```

Block 4 (ramming, `$244ED2`) is a declared NOTE and unported.

**So the ONLY thing in the whole game that can damage a bee carrier is block 7,
`$24518A`, whose A2 is `$811802` -- the BEAM'S HEAD.** That is recon 73's
"revealed by the laser tip", now pinned to the instruction that enforces it.

### 2.3 `[M]` PROOF: put a carrier in the head's box and three bees appear

`.scratch/w-bees/run15.mjs` moves the live carrier onto `$811802`'s position on
the frames the head exists:

```
[M] a2liveFrames=21 movedFrames=7 carrierHpChanges=3 poolAmaxLive=3
    lf4745 a6=$81459c hp 10->65394 b0=$95 word0=$9500
    lf4747 a6=$8145dc hp 10->65394 b0=$95 word0=$9540
    lf4749 a6=$81477c hp 10->65394 b0=$95 word0=$9540
```

`$81 | $14 = $95` -- the hit bits land inside handler `$8A`'s own `$5C` mask
(`$276744 moveq #$5C,D1 / c216 and.b (A6),D1`), HP goes negative, the death arm
runs, the allocator runs, **three bees exist**. The chain is whole.

### 2.4 `[M]` The head exists for 21 frames of a whole stage when the laser is HELD

```
[M] of 8000 frames, laser held from frame 0:
      P1 alive                       8000
      laser byte ($3f,A4)            7984
      beam record $811EF2 live       7976
      beam pair   $811892 live       7976
      BEAM HEAD   $811802 live         21     <- block 7's only weapon
```

and it travels: `pos 7178, 9226, 11274, 13322, ...`, exactly `+$800` per frame,
until it leaves the field and is freed.

**That is the ROM's own design, not a port defect.** `[M]`:

```
[M] $24CBAC  066b 0800 0006   addi.w #$800,($6,A3)
    $24CBB2  08ee 0007 0001   bset #7,($1,A6)
    $24CBB8  6700 0116        beq -> $24CCD0     THE HEAD IS LAID ONCE
```

One head per beam PRESS. Re-pressing re-lays it, and `.scratch/w-bees/run17.mjs`
measures the difference:

```
[M] period=30  laserHeldFrames=4010  A2liveFrames=858
    period=60  laserHeldFrames=4020  A2liveFrames=518
    period=120 laserHeldFrames=4040  A2liveFrames=275
    hold                             A2liveFrames= 21
```

### 2.5 `[M]` THE COVER: THERE IS NO COVER SPRITE. THE CARRIER **IS** THE BEE.

This is a **NEGATIVE RESULT** and the brief asked for it to be reported as one.
Do not send a wave after art.

`[M]` the carrier's prototype `$2766E6` and the bee's template `$280EB0` carry
**the same sprite descriptor and the same size word**:

```
[M] $2766E6  8100 fa00 fd00 001bca34 0618 0500 0700 0400 0400 000a 1000 001c 0000
[M] $280EB0       fa00 fd00 001bca34 0618 0980 0980 0780 0780 0000      001c
                            ^^^^^^^^ ^^^^ identical
```

and the carrier's own animation instruction toggles it to the bee's other frame:

```
[M] $2767AA  086e 0006 0001   bchg #6,($1,A6)
    $2767B0  661c             bne  -> NO EMIT THIS FRAME
    $2767B2  0aae 000000b4 000a  eori.l #$B4,($A,A6)
```

`$1BCA34 ^ $B4 = $1BCA80` -- the two frames the revealed bee blinks between.

**So the hidden bee and the revealed bee are drawn with the same two sprites.**
What distinguishes them is the DUTY CYCLE: `bchg #6 / bne` emits the hidden bee
on **alternate frames only**, which on this board is exactly how translucency was
faked (recon 77: there is no blender anywhere). The revealed bee draws on every
frame, blinking A/A/B.

The "thing covering the bee" the owner remembers is the hidden bee itself, drawn
at 50% duty so it reads as a ghost. `[M]` both frames are exported
(`tools/export-web.mjs:1748`, shard 13) and the port draws them today.

### 2.6 `[M]` And it is only drawn AT ALL when you are within `$240` of it

```
[M] $276768  0800 0000     btst #0,D0            P1 alive?
    $27676E  3439 008103ea move.w $8103EA,D2     the ship's short axis
    $276774  322e 0004     move.w ($4,A6),D1
    $276778  9242          sub.w D2,D1
    $27677A  6a02 4441     bpl / neg.w D1        absolute
    $27677E  0c41 0240     cmpi.w #$240,D1
    $276782  651c          bcs -> NEAR
    $276784  0800 0001     btst #1,D0
    $276788  6744          beq -> RETURN (no emit)
    ... P2's arm, same $240 ...
    $2767A0  3b7c 000f 0018  move.w #$F,($18,A5)   the 15-frame linger
```

Every far path RETURNS before the emit. So the hidden bee is **invisible until
the player comes within `$240` (576 units) on the short axis**, then lingers 15
frames.

`[M]` this is measurable in the port. With the ship parked (short axis 5312) the
carriers sit at 16448 / 63552 / 64832 / 13632 and **not one carrier sprite is
emitted in 8000 frames** (`run19.mjs`: zero display-list entries with the
carrier's `sz=$618`). With the ship sweeping (`$8103EA` range `768..13568`,
`run18.mjs`) the carrier at 1024 -> 704 comes inside `$240` and **is drawn**:

```
[M] lf2778 long=442 short=4     (screen is 448 x 224)
```

### 2.7 THEREFORE

The owner did not see bees because **all three authentic gates have to be
satisfied at once**, and none of them is signposted:

1. be within `$240` of the spot, or the hidden bee is not even drawn;
2. have the laser's HEAD -- not the beam, the head -- pass over it, which
   exists ~21 frames per PRESS and travels at `+$800`/frame;
3. do it in the window lf~2700..lf~8000, since the ten `$8A` triggers are
   173..452 of a 488-span stage and none is in the opening third.

Nothing is unported. `[M]` no throw was reached in any run in this document.

### 2.8 RANK -- what is still refused, and it is NOT approximated

`20-OWNER-scoring-must-be-exact.md` governs and nothing here bends it. W111
shipped the award (`$27FBEE`, both the flat and the chain digit-multiply through
`$286128`) and the x2 + cursor ratchet with the `$27FC22 add.l D0,D0` BCD
overflow bug transcribed. It **REFUSED** the two rank accumulators
(`$27FBA2..$27FBDE` P1 -> `$81B64A`, `$27FB1C..$27FB68` P2 -> `$81B64C`, both
calling the undecided `$287682`) as loud named notes. That refusal is still in
place at `src/bee.js:592`/`:602`. **So collecting a bee today scores correctly
and feeds rank NOT AT ALL.** That is a declared deviation, not silent
corruption, and it is the one thing in the bee subsystem still genuinely open.

I did NOT settle `$287682`. Do not guess it.

---

## 3. THE BOMB -- AUTHENTIC. CANDIDATE 4. CHANGE NOTHING.

The brief says "W100 killed three candidates and said the fourth needs MAME".
Correct, and **the MAME run was done**: `122-recon-boss-bomb-mame.md` sec Q2,
2026-08-07, which the brief does not cite.

### 3.1 The four candidates (enumerated in `106-recon-boss-death-and-bomb.md` sec Q2, killed in `100-impl-owner-four.md` sec 1)

| # | candidate | status | why |
|---|---|---|---|
| 1 | alternate-frame drawing | **KILLED** | `100-impl:26-47` `[M]` 131 bomb frames, **0 empty**, every one of the five appearance classes present on all 131. W90 sec 2.5 measured the same: laser bomb 131 of 132, no parity gate in `$256120`/`$2561AA` |
| 2 | a capture-sourced palette | **KILLED** | `100-impl:49-65` every laser-bomb class is colour 6; bank 6 is cartridge-sourced from `$222AB8` the moment `$249A80` fires, and `92-impl:458-463` lists the permanently-recorded sprite banks as **0..5, 7, 8, 9 -- 6 is not among them**. `webgate.mjs:1570` asserts it every run |
| 3 | W65's bit-7 aura overlaid on the beam | **KILLED** | `100-impl:67-83` `[M]` the aura class emits **0 records on 0 frames** during the bomb while bit 7 is set on all 131; `$24A48C bmi $24A4E2` makes W65's arm **replace** the aura, not overlay it |
| 4 | **the artwork is genuinely sparse** | **SURVIVES, and is now PIXEL-VERIFIED** | see below |

### 3.2 What W122 measured

`boarddl.mjs` on the board's own display list at `$800000`, bomb held
lf3000..3132:

```
lf3000:  0 beam segments (pressed, not yet up)
lf3010: 14 (10 of width 1)
lf3020: 30 (27 of width 1)   FULL STRENGTH
lf3030..3120: 30 sustained
lf3140:  0
```

> "The beam itself (pal6) is **vertical SLICES, each 1 tile (16px) wide and ~64
> rows tall, placed on contiguous 16px x-steps** ... Every entry is a
> full-opacity palette index; the decode carries **no alpha/translucency bit**,
> because the PGM sprite hardware has no blender."

Recon 77 sec 5 independently: *"There is no blending, alpha, shadow,
colour-arithmetic or translucency anywhere in the video path ... the layer mux
is a five-way selector, not a blender."*

And the port has none either: the only five hits for
`globalAlpha|opacity|translucen|blend|alpha` in `games/ddpdoj/src/` are four
comments and `src/web/app.js:763 getContext('2d', { alpha: false })`.

### 3.3 VERDICT: AUTHENTIC. RECOMMEND CHANGING NOTHING.

The owner's "translucent" is the correct perception of genuinely sparse opaque
art -- thin 16px slices with air between them. `src/render/capture.js:72-84` is
explicit that nobody may "fix" authentic alternation by drawing at half alpha,
and W100 sec 1.4 extends that rule to a sprite that is simply drawn thin. **The
call belongs to the owner and the honest answer is that the port is right.**

Two caveats I am recording rather than hiding:

* **W122 could not run a seeded pixel diff.** `[M]` its own note: every bomb
  segment lf2980..3220 is BLOCKED at lf+N+1 on `$27FE0E`. `[M]` I confirm
  `$27FE0E` is `DISPATCH[2]` of pool A (`src/bee.js:189`) -- an unported non-bee
  pool-A kind, which `runBody` turns into a named throw. It is a **coverage**
  gap in the seeded oracle, not a bomb defect, and `CATCHUP.md:459` already
  files it. The verdict rests on three indirect sides, not on a pixel diff.
* **If the owner is reporting the ORDINARY bomb rather than the laser bomb, the
  answer is different and still authentic.** `[M]` W90 sec 2.5: `$255E3E`'s fade
  phase draws on **46 of 93** frames, gated `$255F1C tst.w $80390C / bne rts`,
  and phase 2 inverts the parity at `$255F7E bchg #$1,(A6)`. That IS
  alternate-frame transparency, it is the board's, and W90 deliberately did not
  change it. **Worth asking the owner which bomb they pressed.**

---

## 4. WHAT I COULD NOT SETTLE

* **`$287682`, the bee's rank-gauge callee.** Still undecided, still refused. A
  bee scores correctly and feeds rank not at all. This is the only real hole in
  the subsystem and it is the one place a plausible guess corrupts scoring
  silently.
* **Whether a real player can practically reach a bee.** I proved the mechanism
  works by placing a carrier inside the head's box. I never produced a bee from
  input alone in ~50,000 measured frames. Whether the arcade is equally
  demanding, or whether the port's head lifetime / travel speed differs from the
  board's, needs `boarddl.mjs` on a MAME capture that actually reveals one --
  which nothing in `scenarios.json` does.
* **The kind-16 flying bee `$27FCEA`** remains a named refusal; no stage-1
  allocation site passes `D0=$40`, so it is believed dead, and "believed" is the
  right word.

---

## 5. WHAT THE FIX WAVE SHOULD DO, IN ORDER

1. **Do not port a cover sprite. Do not touch the bomb.** Both are closed
   above; the first does not exist and the second is faithful.
2. **Capture a bee on MAME.** One scenario: fly to a `$8A` trigger, get inside
   `$240`, tap the laser across it. That single capture settles the head-lifetime
   question, gives `boarddl.mjs` a bee to diff, and unblocks a real oracle
   comparison for the whole subsystem.
3. **Port `$287682`** and close the rank gauge, under `20-OWNER-scoring-must-be-exact.md`.
4. **Port `$27FE0E`** (pool-A kind 2) to unblock the seeded oracle past lf2700
   in the bomb/boss scenario -- a coverage win, not a defect fix.
5. **Tell the owner the mechanic.** Near the spot, laser tip across it, second
   half of the stage. Most of this report is that sentence with citations.

---

## LOG

- opened IN PROGRESS. Read the brief, `CATCHUP.md`, `HANDOVER.md`, W110, W111,
  W89, W90, W100, W106, W122, recon 77.
- **PREMISE BREAK on two of the brief's claims** (sec 0): medals were recon'd
  (W110) and the bee driver was ported (W111), both on 2026-08-06.
- `[M]` re-derived `$280EB0`, `$280BB6`, `$27F99E`, `$27FD22`, `$2766E6` from
  `maincpu.bin` independently of `src/bee.js`; all five match.
- `[M]` byte-verified `$276744` (the `$5C` damage gate), `$276756..$2767A0` (the
  `$240` proximity gate), `$2767AA..$2767CC` (the `bchg #6` duty cycle, the
  `eori.l #$B4`, the `$27829C` emit dispatch), `$2767D0..$2767EE` (the death
  arm), `$244F90` / `$245218` / `$2452C4` (the three damage-block target gates),
  `$24CBB2` (the head-laid-once bset).
- `[M]` headless: ten carriers spawn and all ten expire unharmed; 1310/2654
  enemy HP drops in the same runs with zero on a carrier; beam head live 21 of
  8000 frames held, 858 pulsed at 30.
- `[M]` headless: forcing a carrier into the head's box produced **three bees**,
  which allocated, blinked, scrolled, emitted through `$23D816` into bucket 3 and
  reached the final display list at `$800000`. No throw in any run.
- Bomb: candidate 4 confirmed by W122's `boarddl.mjs` run; recommend no change,
  with the ordinary-bomb caveat recorded.

status: **DONE**
