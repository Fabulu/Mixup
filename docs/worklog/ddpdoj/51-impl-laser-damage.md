# 51 — IMPL: the beam DAMAGES (L3, `$2453AC`) and what it does to the score

status: **IN PROGRESS**

started: 2026-08-05
role: implementer (SOLE writer to `games/ddpdoj/`; I do not touch
`games/gradius/`)
target: `ddpdojblk` VERSION-B. Every address is build B (`$23xxxx`–`$2Axxxx`)
unless the line says otherwise.

Brief: the owner is playing the live build and reports "Laser no longer crashes
the game, your little options come to front, but no laser graphics happen and
**the enemies don't die**." The graphics half is E2/E3. Mine is the enemies not
dying: port `$2453AC` (W45 named it L3 and left it deliberately) and the
scoring differences W37 §4.3–4.6 measured, IF measurement shows they went live.

**[M]** = measured by me this session: `unidasm` through
`games/ddpdoj/tools/oracle/xref.py dasm` over `tools/oracle/out/maincpu.bin`
(6,291,456 B, address == file offset), a whole-build-B branch-target sweep I
wrote this session, and the PORT itself driven from the shipped bundle seed
(`games/ddpdoj/assets/`, `loadBundle`, `new Game(...)`) with the fire bit held
or suppressed. No MAME was run.

---

## 0. THE BRIEF IS RIGHT ABOUT THE GOAL AND WRONG ABOUT TWO STRUCTURAL FACTS

### 0.1 **`$2453AC` IS NOT REACHED FROM `laser.js`. IT IS REACHED FROM
### `damage.js`, AND SO ARE TWO MORE BLOCKS NOBODY HAD PORTED.** [M]

The brief (and W45 §10, and `damage.js`'s own deferral text) treat `$2453AC` as
the laser's routine. Its only reachable caller is **`$24530C bsr.w`, inside
`$244D62`** — the collision pass — after two further blocks:

```
245188  movea.l (A7)+,A1        A1 = $811EF2, the BEAM record (the tail's lea)
24518a  move.w #$2800,D6
24518e  move.w (A4),D0 / bpl.w $2459CE       the player must be LIVE
245194  tst.b D0       / bmi.w $24560A
24519a  tst.b ($3f,A4) / beq.w $24560A       <<-- THE LASER BYTE
2451a2  BLOCK 7: A2 = $811802 (pool slot 27) vs 150 enemy slots
24525c  BLOCK 8: A3 = $811892 (pool slot 30) vs 150 enemy slots
24530c  bsr.w $2453AC                        THE BEAM'S OWN PASS
245310  bra.w $24560A                        the NINTH block (bomb-laser)
```

So the work is **three routines, not one**, and it lives in `src/damage.js`.

**`($3f,A4)` IS THE GATE ON ALL OF IT** [M] — the byte `$24C282
move.b #$1,($3f,A4)` sets when the arm-up completes and `$24C2D6` clears on
release. W45 §2 found that byte from the other end (`$249B40` is
`bne $249E4E`, a return, not "the dead flag"); this is the other thing it
gates. It is why W34 could defer the whole tail without losing one hit — until
W45 nothing in this port could hold fire — and it is why porting it **cannot
change a single frame of any no-input gate**.

**The 150 is not a third pool** [M]: `$81459C + 100*$20 = $81521C`, pool B's
base, so `moveq #$95,D7` walks pool A's hundred and pool B's fifty
contiguously, **as capacity**, where blocks 6a/6b walk the live counters.

### 0.2 **THE `bset` THAT ARMS THE PASS IS A BYTE OP, AND IT EXPLAINS W45's ONE
### UNRECONCILED NUMBER.** [M]

```
2453b4  tst.w (A1) / bpl $245608          the beam record must be live
2453ba  bset #$1,(A1) / beq $245608       <<-- BYTE op: bit 9 of the word = $0200
```

`bset` on memory is a BYTE operation and sets Z from the bit's **old** value.
So the pass **arms itself on its first run and damages from its second**, and
the bit it leaves behind is **`$0200`**.

W45 §0.4 measured the port's `$811EF2` as `$8000` where `10-recon-combat §2`'s
board trace has **`$8200`**, and wrote: "So `$0200` is a per-power bit of the
sub-template, not a divergence — but I have not reproduced the board's state to
prove it, and that is a one-line check for whoever next has a board run."
**The guess was wrong and it needed no board run.** `$0200` is `$2453BA`, and
the board's trace has it because the board's beam had run its damage pass.
[M] With this wave the port's record goes `$8000` (+21) → **`$8201`** (+22) →
**`$9201`** on a hit — all three of the board's traced values, for the ROM's
own reasons.

**AND IT MEANS `$245314`/`$24536E` ARE NOT NEEDED.** W37 §4.1 calls those two
"the laser's damage entries"; their only callers are `$254DA2` (inside
`$254D06`) and `$24CE46` (inside `$24CDC0`). [M] A sweep of every even offset
of `$230000..$2B0000` for any `bra`/`bsr`/`Bcc`/`jsr`/`jmp` whose target is
`$254D06` returns **0 sites** — the same shape as W37 §7.3's result for
`$24C37A`. Both stay unported, and neither is called dead code; the pass arms
itself without either.

### 0.3 **THE SCORE FORK THAT GOES LIVE IS `$286876`, NOT THE `$811F72` FORKS.**

The brief names three: `$2860C8 bsr $286A82`, `$2867B4`'s rank divider and
`$2862EA`'s chain zero. All three are behind **`$811F72`**, the BOMB-laser's
record. W45 measured it 0 on 600 held frames and predicted that "once the beam
actually damages things, that may no longer hold."

[M] **It still holds, and a different fork opened instead.** `$811F72` is 0 and
`$8130F8` is 0 on all 601 steps of this wave's run with the beam killing 57
enemies. What went live is `$2860F2 bsr $286876`:

* `$2454E0`/`$2455F2 ori.w #$400,D4 / or.w D4,(A5)` and block 8's
  `$2452F2 ori.w #$4400,D4` put bits into the **enemy's** type word;
* the handlers' `moveq #$5C,D1 / and.b (A6),D1` keeps `$400` (bit 2) and
  `$4000` (bit 6);
* `$286096`'s `$2860EC btst #$2,D1 / beq $2860F8` therefore takes
  **`bsr $286876`** instead of the plain BCD add.

`src/score.js` has called that "the BOMB hit bit ($400), which is set only at
`$245242`/`$2452F2`, both inside the A2/A3 weapon loops `src/damage.js` does not
run" since W34. **Both halves of that sentence are now false**: `$2453AC` sets
it too, and this wave runs those loops. [M] It fired **2 times in 601 steps**
of the held run and 0 times in the control, and `$286674` — the cap-clamp tail —
went from 2 to 55.

So the brief's scoring premise is about the wrong laser, exactly as W45 said,
and W45's own conclusion ("no behaviour change is needed") has a shelf life of
one wave: `$286876` is ported here.

---

## 1. WHAT WAS PORTED

| ROM | what | where |
|---|---|---|
| `$245188..$2451A0` | the weapon tail's three gates, incl. `($3f,A4)` | `damage.js weaponTail` |
| `$2451A2..$24525A` | BLOCK 7 — slot 27 vs 150 enemy slots | `weaponObjectPass(7)` |
| `$24525C..$24530A` | BLOCK 8 — slot 30 vs 150 enemy slots | `weaponObjectPass(8)` |
| `$2453AC..$2453C0` | the pass's entry and its self-arming `bset` | `laserDamagePass` |
| `$2453C2..$245608` | THE BODY: both hyper recomputes, pool A (100), pool B (50) | `laserDamageBody`/`laserPool` |
| `$24560A..$245620` | the NINTH block's two guards | `bombLaserBlock` |
| `$286876..$286A80` | `$286096`'s `$400` arm — see §3 | `score.js bombHitChain` |
| `$286774..$2867B2` | its rank feeder, the twin of `$2867B4` | `score.js bombRankFeed` |

### 1.1 FOUR DIFFERENT DAMAGE REDUCTIONS IN ONE ROUTINE, none the same [M]

A "tidy" port makes these consistent and is wrong four times:

| site | reduction | gate |
|---|---|---|
| blocks 6a/6b (W34) | `lsr.w #2` — a QUARTER | `$81308C == 0` |
| block 7 `$245236` | `lsr.w #1` — a HALF | `$81308C == 0` |
| block 8 `$2452E6` | `lsr.w #1` — a HALF, after a `add.w D5,D5` DOUBLE on `$81B6E6` | `$81308C == 0` |
| `$2453AC` `$2454D4` | `lsr.w #2` — a QUARTER | `$81308C == 0` |

and the two hyper recomputes of `($e,A1)` use **different shift ladders**:
`$2453FA` is `lsr #2` then a conditional `lsr #1` on `$81309C`'s sign;
`$245522` is `lsr #1` then a conditional `lsr #1` on `$8130F8` bit 0.

### 1.2 THE ONE THING THAT LOOKS LIKE A BUG AND IS THE LISTING [M]

`$2455CE move.w D5,D4 / bpl $2455D6` → `lsr.w #3,D4 / neg.w D4 /
move.w D4,($e,A1)`. After the first **pool B** hit the beam's damage word is
stored **negated and an eighth of its size**; the next pool-B hit re-negates it
(`$2455D2 neg.w D5`) without rewriting it. Pool A reads the same word with no
`neg`, so a beam that has hit anything in pool B then **subtracts a negative in
pool A — it heals**. Nothing resets `($e,A1)` between frames except `$254C1E`
(a new beam) or the hyper arms. Read four times; transcribed, **not** guarded,
and written down here so the next person to see an enemy gain HP knows which
instruction did it. Stage 1 has `$815EA0` (pool B's count) at 0 throughout, so
no run in this repo reaches it yet.

### 1.3 D0 IS CARRIED FROM POOL A INTO POOL B [M]

`$2454C2 move.w D4,D0` overwrites the box's upper Y bound with the reach of the
last enemy pool A hit, and nothing between `$2454FA` and `$245580 cmp.w D4,D0`
reloads it. A JS transcription that passed the box by value would lose it, so
`laserPool` returns `d0`.

---

## 2. THE MEASUREMENTS — the W34 control method [M]

Same tree, same shipped bundle seed, same 600 steps, `$810424 = $FF` each step
(the page's own intervention); the only difference is the input word.

```
                              KILLS  score(BCD)  chain  hiwater  $811EF2  $286876
W45 tree, fire HELD               4       $86       4       4     $8001      0
W51 tree, fire HELD              57    $14694      87      87     $9201      2
W51 tree, fire SUPPRESSED         0        $0       0       0     $0000      0
```

* `$811F72` = 0 and `$8130F8` = 0 on **all 601 steps** of the held run, so the
  three forks the brief named are still two gates from reachable.
* the beam record's timeline reproduces: live `$8000` at +21, `$8201` at +22
  (the `bset` arms), first `$1000` (a hit) at +32.
* `poolA` live count on the held run drifts DOWN against the control
  (24 vs 38 at step 600) — the enemies are being removed.

---

## LOG (appended as findings arrive)

- opened; read 37, 34, 38, 39, 45, HANDOVER, `docs/knowledge/09` and `10`,
  `src/{damage,score,laser,handlers,type5,machine,ram,unported}.js`.
- §0.1 **[M] the brief's premise is wrong about WHERE the work is.** `$2453AC`
  is reached from `$24530C` inside `$244D62`, behind blocks 7 and 8 and behind
  `$24519A tst.b ($3f,A4)`. Three routines in `damage.js`, not one in
  `laser.js`.
- §0.2 **[M] `$2453BA bset #$1,(A1)` is a BYTE op = `$0200`, and it retires
  W45 §0.4's guess.** The board's `$8200` is the damage pass, not a per-power
  bit. The port now produces `$8000`/`$8201`/`$9201`, all three board values.
- §0.2 **[M] `$254D06` has 0 inbound branch/call sites in build B**, so
  `$245314` is unreachable and the pass arms itself. Same shape as W37 §7.3's
  `$24C37A`; not called dead code.
- §0.3 **[M] the score fork that goes live is `$286876`, not the `$811F72`
  forks.** `$811F72` and `$8130F8` were 0 on all 601 steps with 57 kills.
- §2 **[M] ENEMIES DIE: 57 kills / 600 frames held, vs 4 on the W45 tree and 0
  on the no-fire control.** Score $86 -> $14694, chain 4 -> 87.

status: **IN PROGRESS**
