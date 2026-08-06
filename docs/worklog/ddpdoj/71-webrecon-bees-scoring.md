# 71 - WEB RECON: BEE ITEMS - SCORING, CHAIN AND RANK

status: **IN PROGRESS**

started: 2026-08-05
role: WEB RECON 2 of 3 (read-only on the repo; this file is the only thing I
write or commit). I did not read, write or touch `src/`, `tools/`,
`games/gradius/`, or recon 1's (`70-*`) / recon 3's (`72-*`) worklogs.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). **Most web sources do not
say which label they are describing** - §5 is about exactly that.

**THE RULE FOR THIS DOCUMENT.** Everything below is a **LEAD TO CONFIRM AGAINST
THE ROM**, never a fact about our port, never a fact about the board.
`docs/knowledge/09`: the ROM is the inventory, the oracle is the verdict.
Every section is **WHAT THE WEB CLAIMS** → **WHAT WOULD CONFIRM IT IN THE ROM**
→ **WHERE SOURCES CONFLICT**.

**EVIDENCE GRADES USED BELOW.**
`[F]` = I fetched the page and read its text.
`[S]` = it reached me only as a **search-engine synthesis of a page I did not
fetch**. `[S]` is materially weaker than `[F]` here for a specific reason: half
my Japanese queries returned **怒首領蜂最大往生 (SaiDaiOuJou)** and **大復活
(DaiFukkatsu)** pages alongside 大往生 ones, and a synthesis across that result
set can silently merge three different games' bee rules. The brief's own warning
("DonPachi, DoDonPachi, DaiOuJou and DaiFukkatsu differ") is the live failure
mode of `[S]` lines, and I have marked every one.
`[CITED]` = from a repo worklog, named, not re-measured by me.
**I ran no ROM tooling, no MAME and no test. There is not one measurement in
this document.**

---

## 0. THE HEADLINE - three sentences, and the second one is the dangerous one

1. **A bee is worth a BASE × THE LIVE CHAIN HIT COUNT.** Every source that
   states a formula says base = 1,000 and the multiplier is the current HIT
   counter. So a bee's score is **not fixed and not progressive - it is
   state-dependent on the chain**, which puts it inside the owner's binding
   constraint rather than beside it.
2. **BEES REACH RANK, and by exactly the precedent route.** The web is
   consistent that **collecting a bee fills the HYPER GAUGE, by an amount that
   is a step function of the chain count** (3% per 20 hits, 20 → 200+, capped
   at 30%), **and gives nothing while a hyper is already active**. The hyper
   gauge is `38-recon`'s `$81B64A`, whose overflow makes a hyper item, whose
   collection is `$2530CA addq.w #1,$81B65C`, which the next super pays into
   `$81B646` **by accumulation** - `+16 rank, permanently, at the player's next
   super` [CITED `59-recon` §5.2, `38-recon` §3.2]. **One bee collected at the
   wrong chain count is therefore a deferred, permanent rank error of the same
   class the ROM recon already found for hyper items.** §4.
3. **THE BEE IS ALMOST CERTAINLY NOT ONE OF `59-recon`'s SIX ITEM KINDS**, and
   this recon's most useful structural output is the argument for that (§6). A
   bee must read the chain; `59-recon` §5.3 measured that **nothing** in
   `$27E812..$27F801` or `$252C96..$25313C` references `$81B5C0`, `$81B5DA`,
   `$81B5B2` or `$81B5E0` [CITED], and all six kinds score a flat `$10`/`$1000`
   through `$286128`. **If the ROM shows a bee among those six, the web's core
   claim is falsified; if it does not, the bee is an unenumerated subsystem and
   nobody has sized it.** Either answer is worth having before anyone ports.

---

## 1. WHAT A BEE IS WORTH

### 1.1 WHAT THE WEB CLAIMS

**The formula. STRONG AGREEMENT, English and Japanese, independently worded.**

| source | claim |
|---|---|
| Shmups Wiki, *DoDonPachi DaiOuJou* `[F]` | "Bees play an important role in DaiOuJou, and are worth **1,000 points multiplied by the number of hits in the current combo chain**." |
| Shmups Wiki, *DDP DaiOuJou Black Label* `[F]` | identical sentence, on the Black Label page |
| ja.wikipedia 怒首領蜂大往生 `[F]` | "取得すると、**取得時のコンボ数×1,000点**が加算される" - *on collection, points equal to the combo count AT THE MOMENT OF COLLECTION × 1,000 are added* |
| wikiwiki.jp/daioujo 基礎知識 `[F]` | 蜂 = "各面に10個隠されているボーナスアイテム"; states the ×2 rule (§2) but does **not** restate the base formula |
| iphoneac.com/daioujo `[F]` | "蜂アイテムを取ることで**スコアとハイパーゲージが増加します**" - no formula on the page I fetched; it defers to a locations page |

**So the value is STATE-DEPENDENT, on one specific piece of state: the live HIT
counter at the instant of collection** ("取得時の"). Not fixed. Not a function
of which bee it is. Not a function of rank - no source connects bee value to
rank in either direction.

**A second, weaker claim: the BASE grows across stages.** Shmups Wiki `[F]`,
and **only** Shmups Wiki: *"Collecting all the bee items in a stage will also
increase their default value by 1,000 for every subsequent stage. Collecting
every bee item in both loops without dying outside of boss fights will cause
the bee items to be worth 10,000 points each in the final stage!"* That is
arithmetically self-consistent - base(stage n) = 1,000 × n if every earlier
stage was perfect, and stage 10 of a two-loop run is 10,000 - which is a point
in its favour, but **it is one source** (§1.3).

### 1.2 WHAT WOULD CONFIRM IT IN THE ROM

* **A multiply, or a chain-machine entry, on the bee's award path.** This ROM's
  score adders are `$286128` (items, `$10` / `$1000`), `$28614A`/`$286154`
  (bullet cancel, `moveq #$46`) and `$28615E` (the kill) [CITED `59-recon` §4.3,
  `38-recon` §1.4]. All four take a **constant** D0 at the sites so far read.
  A bee needs `base × hits`, so it is one of:
  - **(a)** a *fifth* entry, or one of those four with a **computed** D0 -
    look for `mulu`/`muls` anywhere near the score module. **This game barely
    multiplies; a `mulu` in `$286000..$287800` would be a near-unique
    fingerprint and is a cheap image-wide scan.**
  - **(b)** the bee simply calls the **kill/chain machine** `$28615E`/`$2862C6`
    with a large base and lets the *shared* machine apply the chain multiplier -
    which is how enemy kills are already chain-multiplied. **If (b) is true then
    collecting a bee also TICKS THE CHAIN**, which no web source claims, and
    that would be a first-order finding. Distinguishing (a) from (b) is one
    disassembly of the bee's collect tail.
* **Score units.** `$27F582`'s at-max item award is `move.l #$1000,D0 /
  jsr $286128` [CITED `59-recon` §4.3]. Score in this game is **packed BCD**
  (`moveq #$46` = 46 points [CITED `38-recon` §1.4]), so `$1000` **is BCD
  1,000** - the exact number the web gives as the bee base. **TRAP, NAMED: an
  implementer who greps for `$1000` will find the at-max item award and
  mistake it for the bee base.** They are different code paths; `$27F582` is
  reached only when the thing an item grants is already at maximum.
* **The per-stage base.** If §1.1's second claim is real there is a **live word
  or long holding the current base**, initialised to BCD `$1000` and raised by
  `$1000` at a stage boundary. Search the image for `#$1000` as an `addi.l`/
  `add.l` immediate and for a longword `$00001000` in a stage table.

### 1.3 WHERE SOURCES CONFLICT - and they do, on the base

* **1,000 vs 100.** TASVideos forum topic 17578 (*DoDonPachi Daioujou Black
  Label*, TAS discussion) `[F]` says golden bees "award points calculated as:
  **hit counter × 100 points**". Every wiki says ×1,000. **I am not
  reconciling this.** Possibilities, none of which I can decide from the web:
  the TAS poster is describing a different label; is describing an
  as-yet-unperfect base rather than the perfect-run base; or has an order of
  magnitude wrong. **The ROM decides; a factor of ten is the easiest thing in
  this entire document to settle with one read.**
* **"worth 10,000 points each in the final stage"** (Shmups Wiki `[F]`) is
  ambiguous in its own sentence: 10,000 could be the **base** (then multiplied
  by hits) or the **whole award**. Given the same page's ×hits formula, base is
  the only reading that is not self-contradictory - **but I am recording that I
  chose the consistent reading, not that the source stated it.**
* **The +1,000-per-stage escalation is single-source.** ja.wikipedia `[F]` and
  wikiwiki `[F]` both describe the bee award in full and **neither mentions any
  per-stage base growth**. Two thorough Japanese sources omitting a scoring rule
  is not proof it is absent, but it is not corroboration either.

---

## 2. SEQUENCE, STREAK, AND THE ALL-BEES BONUS

### 2.1 WHAT THE WEB CLAIMS

**There is NO ordering rule. There IS a completeness rule. UNANIMOUS on both.**

* **Count: exactly 10 bees per stage.** ja.wikipedia `[F]`, wikiwiki `[F]`
  ("各面に10個隠されている"), iphoneac `[F]` ("1つのステージで出現する10個の蜂"),
  Shmups Wiki `[F]`. **No source disagrees.**
* **The bonus is on the 10th, and it is ×2.** wikiwiki `[F]`: "1ステージ毎に全て
  取ると**10個目で×2される**". ja.wikipedia `[F]`: "10個すべてをノーミスで取得
  した場合、**最後の1個は得点がさらに2倍**される". Shmups Wiki `[F]`: "the last
  item will have an additional x2 multiplier". **The multiplier lands on ONE
  item - the tenth - not on the stage total.**
* **The condition includes NO-MISS.** ja.wikipedia `[F]` "ノーミスで取得した
  場合"; wikiwiki `[F]` adds "道中ノーミスも条件" (*a no-miss run through the
  stage is also a condition*). This is called **蜂パーフェクト / "bee perfect"**.
* **NOTHING about collection ORDER.** I looked for it specifically (queries on
  蜂 + 順番). **No source in either language says bees must be collected in a
  particular order, or that an out-of-order pickup reduces anything.** This is
  a **difference from DoDonPachi (1997)**, where sequence value is a well-known
  rule - and the brief's "do not assert from other games in the series" cuts
  exactly here: **the absence of an ordering rule in DOJ is what the sources
  show, and DDP's rule must not be imported.**
* **Bee perfect also feeds LOOP ACCESS.** ja.wikipedia `[F]` and iphoneac `[F]`:
  one of the three second-loop conditions is **bee perfect on 3 or more
  stages**; the others are ≤2 misses or ≤3 bombs. So there is a **persistent
  count of perfect stages**, not just a per-stage flag.

### 2.2 WHAT WOULD CONFIRM IT IN THE ROM

* **A per-stage bee counter compared against 10** (`cmpi #$A` / `cmpi.b #$A`)
  at the collect site, with the ×2 arm behind `count == 10 AND <no-miss flag>`.
  A doubling in BCD is `D0 + D0` through the same adder, or a second
  `jsr` to the adder with the same D0 - **two different implementations with
  the same visible result and different carry behaviour; transcribe, do not
  choose.**
* **A per-stage no-miss flag distinct from the run-wide one.** The condition is
  "no miss *during the stage / during the collection*", so there must be a flag
  cleared at stage start and set by death.
* **A counter of perfect stages compared against 3** in whatever code decides
  loop 2. That counter's cap is a candidate for §6.
* **A reset at stage boundary.** Any bee counter must be zeroed per stage. A
  counter that is *not* reset per stage is not the bee counter - this is the
  cleanest discriminator available and it costs one write census.

### 2.3 WHERE SOURCES CONFLICT

* **Only on what "without dying" scopes.** English says "in a stage without
  dying"; wikiwiki adds 道中 (*the stage route*, i.e. excluding the boss);
  Shmups Wiki's loop-condition sentence says "without dying **before bosses**".
  **So at least one source thinks a death at the boss does not spoil bee
  perfect.** That is a real semantic difference and the ROM must settle it.
* **No source states whether the ×2 applies to the 10th bee's *own* value
  including the current base growth, or to a fixed 1,000.** Unstated everywhere.

---

## 3. BEES AND THE CHAIN / COMBO METER

### 3.1 WHAT THE WEB CLAIMS

**Bees touch the chain in TWO places, and only one of them is the collection.**

1. **REVEALING a bee with the laser ADDS A HIT and refills the chain gauge to
   50%.** Shmups Wiki, both pages `[F]`: *"Uncovering a bee item with the Laser
   will add a HIT to the current chain counter, and it will refill the chain
   gauge by 50%."* This sits on the boundary with recon 1 (reveal) but the
   **effect** is chain state, so it is mine. Corroborating context, same page
   `[F]`: laser **kills** also fill the gauge only to 50%, and holding laser on
   a large enemy pins it at 25% - so "50% on a laser event" is a **general law
   of this game**, which makes the bee case more plausible, not less.
2. **COLLECTING a bee: no source says it changes the chain at all.** Not the
   counter, not the gauge, not the break timer. The chain is an **input** to the
   bee's value, not an output of it.
3. **No source says a bee BREAKS a chain.**

### 3.2 WHAT WOULD CONFIRM IT IN THE ROM

* **The reveal path must write `$81B5C0` (the meter) and the hit counter.**
  `$81B5B2` is the meter CAP (56) [CITED `38-recon` §4.1], so "50%" predicts
  a write of `$81B5B2 >> 1` = 28 = `$1C`, or a literal `#$1C`. **`lsr #1` on
  `$81B5B2` into `$81B5C0` is a very specific instruction pair to search for**,
  and `$285A4C move.w $81B5B2,$81B5C0` [CITED `38-recon` §2.3] already proves
  the "meter := cap" idiom exists in this ROM - the half-cap variant is its
  sibling.
* **The +1 HIT must go through whatever `$2862C6` uses**, so the reveal either
  calls the chain machine or writes the counter directly. If it calls the chain
  machine, **revealing a bee also scores**, which nobody claims.
* **The negative confirmation is already banked and it is strong.**
  `59-recon` §5.3 [CITED]: nothing in the item subsystem or the ten collect
  routines references `$81B5C0`, `$81B5DA`, `$81B5B2` or `$81B5E0`. **So
  whatever the bee is, its chain coupling is NOT in the code recon 59 read** -
  which is consistent with claim 2 (collect does nothing to the chain) and
  makes claim 1 a property of the reveal code, wherever that lives.

### 3.3 WHERE SOURCES CONFLICT

* **Japanese sources do not state the "+1 HIT / 50% gauge on reveal" rule.**
  The two Japanese pages I fetched describe the reveal only as "レーザーの先端を
  当てると出現" (*appears when the laser tip touches the spot*). Neither
  confirms nor denies the chain effect. **This is a one-language claim.**
* TASVideos `[F]` describes laser's gauge behaviour on large ships ("hooking",
  "the counter will be frozen until the enemy is killed") in terms that are
  compatible but not identical. Not a conflict; a different vocabulary.

---

## 4. RANK - THE HIGHEST-VALUE QUESTION, AND THE ANSWER IS "YES, INDIRECTLY, WITH A DELAY"

### 4.1 WHAT THE WEB CLAIMS

**No source claims a bee changes rank directly. Every source that discusses
bees and the hyper gauge together describes the mechanism by which it changes
rank indirectly.**

**(A) The bee → hyper gauge law, with an exact table.** wikiwiki.jp/daioujo
基礎知識 `[F]` lists four ways the hyper gauge fills, and bee collection is
one of them, **with a step table**:

```
[F] wikiwiki 基礎知識, 蜂アイテム取得 (20HIT以上):
      20-39 Hit ......  3%
      40-59 Hit ......  6%
      ... (in 20-hit steps)
    180-199 Hit ...... 27%
      200+ Hit ....... 30%
    "ハイパー中はゲージが増えない"  -- NO GAUGE GAIN WHILE HYPERING
```

Shmups Wiki `[F]` states the same table in prose ("3% … 6% … and so on until
… 200+ HIT chain, which fills 30%") **and the same exception** ("collecting a
bee item while in Hyper Mode won't give any hyper gauge"). Two independent
sources, two languages, identical numbers. **This is the best-attested
quantitative claim in this document.**

The step function is exactly `3% × min(floor(hits / 20), 10)`, zero below 20
hits - ten steps, and 10 × 3% = 30%. **It is a clean integer law, which is
what a ROM table looks like.**

**(B) The gauge is the rank pipeline.** Shmups Wiki `[F]`: *"The hyper meter …
is filled by chaining, collecting bees, and dying"*; *"All bullets move faster
when hyper activates, increasing game rank."* wikiwiki `[F]`: "ハイパー中は
ランクが上昇する" and, critically, **"ハイパー終了時にランクは戻るが、弾速ランクは
戻りきらない"** - *rank returns when the hyper ends, but the bullet-speed rank
does not fully return*. TASVideos `[F]` says the same thing in numbers:
activating a hyper "increases bullet speed by 10%, but only decreases by 5%
afterward… **Effect persists until death**".

**That is a web-side description of an ACCUMULATOR that only death reduces -
and the ROM already has one: `$81B646`, raised by `$285A62 add.w $81B65C,D0`
on every super, capped at `$23`, quartered on death (`$24A00C lsr.w #2`)
[CITED `38-recon` §3.2]. Two independent descriptions of the same object.**

**(C) Rank sources and sinks, generally.** `[S]` (Japanese search synthesis,
pages not fetched, and 最大往生 pages were in the result set - treat as weak):
rank rises with hyper use and falls with bombs and misses. **That matches the
ROM ledger exactly** - `$285A64` +stock, `$249978` −3 on a bomb during hyper,
`$24A00C` >>2 on death [CITED `38-recon` §3.2] - which is corroboration of the
*shape*, not new information.

### 4.2 THE CHAIN OF CUSTODY, END TO END - the sentence this recon exists to write

Web (A) + ROM [CITED] compose into one path:

```
  collect a bee at H hits, no hyper active
    -> hyper gauge += 3% x min(H/20, 10)          [WEB, §4.1(A)]
    -> $81B64A crosses $95F                       [CITED 38-recon 2.2/2.4]
    -> $287682 grants: spawns a KIND $C item      [CITED 59-recon 2.2]
    -> collected: $2530CA addq.w #1,$81B65C       [CITED 38-recon 2.2] UNCAPPED
    ...minutes later, the player supers...
    -> $285A62 add.w $81B65C,$81B646              ACCUMULATES [CITED 38-recon 3.2]
    -> $2608D2 rank += 16 x max(power1,power2)    [CITED 38-recon 3.1]
```

> **ONE BEE COLLECTED AT THE WRONG CHAIN COUNT CAN BE ONE EXTRA HYPER ITEM, AND
> ONE EXTRA HYPER ITEM IS +16 RANK PERMANENTLY, PAID AT THE PLAYER'S NEXT
> SUPER.** Same class, same accumulator and the same cause/symptom separation as
> the hyper-item precedent in the brief - but with **one more layer of
> indirection**, because the bee does not grant the stock, it grants a fraction
> of a gauge that later becomes the stock. **The error can be planted by a bee
> in stage 1 and paid by a super in stage 3.**

Three amplifiers, all of them web claims that need ROM confirmation:

1. **It is a THRESHOLD system, so the error is not proportional.** A 3%-per-step
   miscalculation is invisible until it moves the gauge across `$95F`, at which
   point it is a whole extra hyper item. **Being 1% wrong for 33 bees and being
   100% wrong for one bee produce the same corrupted rank.**
2. **The "no gauge while hypering" gate is a single test with a whole hyper item
   riding on it.** Get `if (hyperActive) skip` wrong and every bee collected
   during a hyper manufactures gauge that the board never grants.
3. **The 20-hit floor and the 200-hit ceiling are both hard edges.** A bee at
   19 hits gives nothing; at 20 it gives 3%. An off-by-one in the chain counter
   at that boundary is a rank error, not a score error.

### 4.3 WHAT WOULD CONFIRM IT IN THE ROM - the highest-value read in this document

* **CENSUS `$81B64A` AND `$81B64C` (the hyper-item meter).** `38-recon` §2.2
  [CITED] names them and gives the threshold `$95F` and the clear at `$2876A0`,
  but **no document in this repo enumerates their WRITERS.** The bee's gauge
  contribution must be among them. **This single census is the whole answer.**
* **Predicted magnitudes, so the census can be checked rather than believed.**
  If `$95F` (2,399) is 100%, then
  - 3% ≈ 71.97 → **`$48` (72)** per step;
  - 30% ≈ 719.7 → **`$2D0` (720)**;
  - a 10-entry word table `$48 $90 $D8 $120 $168 $1B0 $1F8 $240 $288 $2D0`.
  **If a table of ten words in that arithmetic progression exists anywhere near
  the hyper module, the web's percentage table is confirmed exactly.** If
  instead the increment is `mulu #$48` on `hits/20` clamped to 10, same law,
  different code. **Either shape confirms; neither is assumed.**
* **The index.** `floor(hits/20)` off a **BCD** hit counter is awkward -
  `$81B5DA` is compared as BCD (`cmpi.w #$10,$81B5DA` = "chain ≥ 10")
  [CITED `38-recon` §2.3]. So either a **binary** hit count exists somewhere
  (and the port must know which one the bee reads), or the step boundaries are
  BCD compares (`#$20`, `#$40`, … `#$200`) - **which would make the table an
  11-entry compare chain, and `#$200` (BCD 200) an unmistakable literal.**
  **Which representation the bee reads is a sub-frame-exactness question, and
  the two disagree in the 100–199 region if either is implemented wrong.**
* **The hyper gate.** Expect `tst.w $81B63E / bne <skip>` on the gauge-add path,
  mirroring `$2876BE` [CITED `38-recon` §2.4]. **Whether the gate skips the
  gauge add or banks it as pending (`$81B6E0`) is the difference between "no
  gain" and "delayed gain" and the web only says "no gain".**

### 4.4 WHERE SOURCES CONFLICT

* **Which label the 3%/30% table belongs to.** Shmups Wiki `[F]` presents it
  **inside a Black Label context** ("In Black Label, collecting a bee item with
  a 20 to 39 hit chain will fill 3%…"). wikiwiki `[F]` presents the identical
  table as **general 大往生 hyper-gauge mechanics with no version qualifier**,
  on a page that covers both labels. **So it is unresolved whether the original
  has the same table, a different one, or none.** Our target is Black Label, so
  the practical risk is low - but a port that ships the table as "the DOJ rule"
  is asserting something no source supports.
* **Nothing anywhere says a bee moves rank directly.** That is an absence, not
  a denial. **The ROM census in §4.3 is what turns it into a fact**, and
  `59-recon`'s 13-site `$81B646` census [CITED] is the template.

---

## 5. VERSION, SHIP AND STYLE DIFFERENCES

### 5.1 WHAT THE WEB CLAIMS

* **Black Label vs original, on BEES specifically: no source lists a single bee
  difference.** Not the count (10 both), not the ×2, not the formula. The one
  bee-adjacent BL attribution is §4.4's hyper-gauge table, and that is a
  presentation difference between two sources rather than a stated change.
* **BL differences that are stated, and that touch this subject indirectly:**
  - Shmups Wiki `[F]`: **Black Label carries lives and bombs into loop 2**;
    White Label resets lives to 1. Both carry hyper stock, and **White Label
    has a bug requiring a new hyper to be earned first**. Hyper stock is the
    rank accumulator's input, so a **loop-boundary carry rule is a rank rule.**
  - `[S]` (mowamowa blog, not fetched): BL lowers baseline difficulty **but the
    rank gain on a no-miss no-bomb run EXCEEDS the original's**. If true this is
    a rank-formula difference between labels and it matters more than any bee
    detail - **but it is `[S]` and I could not fetch the page.**
  - TYPE-B is slightly faster in BL (Shmups Wiki `[F]`) - movement, not scoring.
* **Ships and Element Dolls: no bee differences reported.** Shmups Wiki `[F]`
  explicitly makes no bee distinction between TYPE-A/TYPE-B or between SHOTIA /
  LEINYAN / EXY; the dolls differ in **bomb capacity** (3/6, 2/4, 1/2) and in
  which weapon they enhance. **Bomb capacity is a rank input** (`$249976` −3
  per bomb during hyper [CITED]) but not a bee input.

### 5.2 WHAT WOULD CONFIRM IT IN THE ROM

* Our image is build B and, per `59-recon`'s header [CITED], the **A and B
  builds coexist in the same ROM** (`$1xxxxx` = build A's copy). **So the
  label question is answerable by diffing the two copies of the bee code**,
  which is a uniquely cheap experiment this project can run and the web cannot:
  **if build A's and build B's bee/gauge code are byte-identical, every
  "Black Label changed the bees" question is closed at once.**
* Ship/doll independence predicts the bee's award path reads **neither**
  `$810440` (ship) nor `$81043E` (weapon) [addresses CITED `59-recon` §4.4].

### 5.3 WHERE SOURCES CONFLICT

* Only §4.4's table attribution, and `[S]`'s claim that BL's no-miss rank gain
  is *higher*, which sits oddly beside "BL is easier". **Not reconciled.**

---

## 6. IS THERE A MAXIMUM, A PER-STAGE COUNT, AN ALL-BEES BONUS - AND IS `$8130BE` THE BEE COUNTER?

### 6.1 WHAT THE WEB CLAIMS

* **Per-stage count: 10. Unanimous, four sources, both languages `[F]`.**
* **All-bees bonus: yes - ×2 on the 10th, plus (single-source) a +1,000 base
  bump for later stages, plus a contribution to the loop-2 condition.** §2.
* **No source describes a lifetime cap, a bee inventory, or a HUD bee counter.**
  wikiwiki's screen description `[S]/[F]` lists the hyper gauge, lives and bombs
  as displayed elements; **no source I read says the number of bees collected is
  drawn on screen.**
* Related maxima that ARE stated: **hyper stock max 5** (Shmups Wiki `[F]`,
  matching `$28768C cmpi.w #$5` [CITED]), bombs 2/4/6 by doll.

### 6.2 THE `$8130BE` CAP OF 20 - I WAS ASKED TO CHECK CONSISTENCY, AND IT IS NOT CONSISTENT

`59-recon` §3 [CITED] measured kind `$10`'s collect routine `$25310E`:
`cmpi.w #$14,$8130BE / beq rts` then `addq.w #1,$8130BE`, then a HUD draw
`$2878CC` that "lays out up to 5 icons a row"; `$253126` is the P2 mirror on
`$8130C0`.

**Flagged as a CANDIDATE and argued AGAINST, not as a conclusion:**

| test | cap-20 counter | what the web says about bees |
|---|---|---|
| count per stage | cap **20** | **10**, unanimous |
| any compare against 10 | none reported | the ×2 needs one |
| score on collect | **flat `$10`**, and it is collected normally past the cap with **no grant at all** [CITED `59-recon` §3] | **base × hits**, never flat |
| chain read | **none** - measured zero references to `$81B5C0`/`$81B5DA`/`$81B5B2`/`$81B5E0` in the entire item subsystem [CITED §5.3] | value **is** the chain |
| hyper gauge write | none in the write census [CITED §4.3] | **3%–30% of it** |
| HUD | draws up to 5 icons a row (a 4×5 grid at cap) | no source describes a bee counter on screen |
| spawn | dropped by `$27B4A0` with `D0=$10` from an enemy-ish body [CITED §2] | bees are **revealed from the background by the laser**, not dropped |

**Every one of the seven points goes the same way. On the web's account, kind
`$10` is not the bee, and neither is any other of the six kinds** - none reads
the chain, none writes the hyper gauge, all six score `$10` or `$1000` flat.

**⇒ THE STRUCTURAL LEAD THIS RECON HANDS TO THE ROM RECON: the bee is a
SEVENTH thing, outside `$27E812..$27F7E7` and outside `$252C96..$25313D`, and
it is unenumerated and unsized in this repo.** Stated with its limit:
`59-recon`'s censuses covered exactly those two ranges [CITED], so "not there"
is solid and "therefore elsewhere" is inference.

*(A smaller lead, offered and not pursued: kind `$08`'s `+$4D` (77) to
`$8128F4` with a `−$9A` (154) at bomb use [CITED `59-recon` §3, `38-recon` §1.3]
makes kind `$08` look like a two-halves **bomb** item, not a bee. Recon 3's
business if anyone's.)*

### 6.3 THE ONE THING IN THE OVERLAP THAT NOBODY HAS EXPLAINED, AND IT IS MINE

`38-recon` §2.1 [CITED] transcribes, inside `$28444E`, immediately above the
chain-meter decrement:

```
$2844BE  tst.w $8130BE / bmi $28465C     <- jumps PAST the decrement
$284636  subq.w #1,$81B5C0               <- THE CHAIN METER DECREMENT
```

**So the word that the cap-20 item increments is TESTED IN THE CHAIN-METER
DECREMENT PATH, and a NEGATIVE value FREEZES THE CHAIN.** A counter that
`$25310E` only ever raises from 0 to 20 can never be negative, so **either some
other site writes `$8130BE` negative, or `$8130BE` is not primarily an item
counter at all.** No document in this repo names a second writer. This is an
**item↔chain coupling in a game where the web says items and the chain are
coupled**, and it is exactly the class of fact the owner's constraint is about.
**Census `$8130BE`. It is cheap and nobody has done it.**

### 6.4 WHERE SOURCES CONFLICT

* Nowhere - the web is unanimous on 10, and the tension is between the web and
  the ROM cap of 20, which is the point of §6.2.

---

## 7. WHAT THE WEB DOES NOT SAY - thin coverage, recorded as a finding

The brief asked for thin or contradictory sourcing to be reported rather than
filled. **These are unanswered after this recon:**

1. **No ROM-level source exists.** I searched for MAME cheat files, RAM maps and
   reverse-engineering notes for `ddpdoj`/`ddpdojblk` and found **nothing** -
   no address list, no lua script, no memory map. Every number in this document
   is behavioural. **There is no external oracle for bee internals; ours will be
   the first.**
2. **Nobody states the bee's award in frames.** Whether the score lands on the
   collect frame or a later one, whether the gauge add and the score add are the
   same frame, whether the ×2 is applied before or after the chain multiply -
   **not one source addresses ordering.** For a project whose bar is
   sub-frame, the web contributes **nothing** here and the ROM must supply all
   of it.
3. **Nobody states what happens at the boundary cases**: a bee collected on the
   frame a chain breaks; a bee collected while a hyper is *ending*; a bee
   collected at exactly 20 hits vs 19; the 10th bee collected after a death
   earlier in the stage. **All are route-relevant and all are unsourced.**
4. **Two-player is entirely unsourced.** `$8130BE`/`$8130C0` and `$81B64A`/
   `$81B64C` are per-player pairs; no source discusses bees in 2P.
5. **The nicovideo 大百科 article returned HTTP 403** and could not be fetched;
   HardcoreGaming101's DOJ article was in results but I did not fetch it. Both
   are plausible corroboration for §1 and §5 and neither was consulted.
6. **Series conflation is the standing hazard.** Several searches returned
   最大往生 and 大復活 pages. Every `[S]` line in this document may have been
   synthesised across them. **No `[S]` line should be ported from.**

---

## 8. CONFIRMATION LIST FOR A ROM RECON - ordered by value, not by effort

**Tier 1 - these decide whether rank is safe.**

1. **CENSUS `$81B64A` / `$81B64C` WRITERS.** Every site, absolute and
   PC-relative, with a denominator. **This is the single most important read in
   this document.** It answers: does anything other than kills fill the hyper
   gauge; is there a step table; is it gated on `$81B63E`; is the index the
   chain count. *(Predicted: a 10-step law worth `$48` per step, ceiling
   `$2D0`, floor at 20 hits, gated on hyper-inactive.)*
2. **FIND THE BEE OBJECT.** Confirm or refute §6.2: is any of `59-recon`'s six
   kinds a bee, or is the bee a seventh subsystem? **Test: which code reads
   `$81B5DA`/`$81B5C0` on an item-collection path.** If none of the six does -
   already measured [CITED] - then locate the bee's own collect routine and
   size it. **Nobody has sized this and a wave plan that assumes `59-recon`'s
   4,054 bytes covers items is short by an unknown amount.**
3. **CENSUS `$8130BE` / `$8130C0`.** §6.3: who, if anyone, writes it negative,
   and is `$2844BE`'s `bmi` reachable? An item counter that can freeze the
   chain-meter decrement is a scoring-exactness fact regardless of whether it is
   the bee counter.
4. **DIFF BUILD A AGAINST BUILD B over the bee/gauge code.** Settles every
   §5 label question in one operation, using an advantage the web does not have.

**Tier 2 - these decide whether the score is right.**

5. **The bee's value formula: `mulu`/`muls` census over the score module**, and
   whether the award enters `$286128` (flat, like the six kinds) or the chain
   machine `$28615E`/`$2862C6` (chain-multiplied - and therefore possibly
   chain-*advancing*). Settles the ×1,000-vs-×100 conflict (§1.3) at the same
   time.
6. **The per-stage base:** is there a live base word, initialised to BCD
   `$1000`, raised by `$1000` at a stage boundary behind a perfect flag? This
   is the single-sourced claim in §1.1 and it is either real or it is not.
7. **The ×2:** locate the `count == 10 && no-miss` arm and transcribe *how* the
   doubling is done (self-add vs second adder call).
8. **The per-stage reset and the per-stage no-miss flag.** Both must exist if
   §2 is right; their absence would falsify §2.
9. **The perfect-stage counter compared against 3** in the loop-2 decision.
10. **Whether the bee's reveal writes `$81B5C0` with `$81B5B2 >> 1` (= `$1C`)
    and ticks the hit counter** (§3.2). *Coordinate with recon 1 - the site is
    theirs, the semantics are this document's.*

**Tier 3 - needed before implementation, not before planning.**

11. Frame position of the bee's score add, its gauge add and its ×2 relative to
    `$2608D2` (rank), `$2842B0` (drain) and `$284636` (meter decrement).
    **`38-recon` §7.1 and `59-recon` §9.4's unresolved slot-order question
    bounds this too** [CITED] - the same one write tap settles all three.
12. Whether the gauge add is refused or **banked as pending (`$81B6E0`)** while
    hypering (§4.3).
13. 2P: are `$8130BE`/`$8130C0` and `$81B64A`/`$81B64C` truly symmetric on the
    bee path.

---

## 9. RISK NOTE - everything here that can move RANK

**Read this before anyone writes a line of bee code.**

1. **THE PRIMARY RISK, and it is the brief's own precedent one layer deeper.**
   Web sources agree a bee fills the hyper gauge as a step function of the
   chain. The gauge becomes a hyper item; the hyper item becomes `$81B65C`; the
   next super pays `$81B65C` into `$81B646` **by accumulation**; rank gains
   **+16 per unit, permanently**, and only death (`>>2`) and two bare resets
   reduce it [CITED `38-recon` §3.2]. **A bee therefore plants a rank error that
   is paid two subsystems and possibly minutes later.** Cause and symptom are
   separated *twice*: once by the gauge threshold, once by the super.
2. **THE ERROR IS QUANTISED, SO SMALL ERRORS ARE EITHER FREE OR CATASTROPHIC.**
   The gauge is a threshold (`$95F`). Any per-bee arithmetic error is invisible
   until it changes the number of times the threshold is crossed, at which point
   it is a whole extra or missing hyper item - **+16 rank or −16 rank, forever.**
   **There is no "approximately right" here**, which is the owner's exact point.
3. **THREE HARD EDGES, each of which is one comparison in the ROM and one bug in
   a port:** the 20-hit floor (19 → nothing, 20 → 3%); the 200-hit ceiling
   (clamped at 30%); and the hyper-active gate (0% while hypering). **Getting
   the gate backwards manufactures gauge on exactly the frames a scoring route
   spends hypering - i.e. constantly.**
4. **BCD vs BINARY on the chain count.** If the step index is computed from a
   BCD hit counter, a port that divides a binary count by 20 gets different
   step boundaries above 99 hits. **Scoring routes live above 99 hits.**
5. **THE DOUBLE JEOPARDY OF THE SEQUENCE RULES.** If §1.1's per-stage base
   growth is real, a bee's score depends on **history** (which earlier stages
   were perfect), and if §2's ×2 is real it depends on **a per-stage counter and
   a per-stage no-miss flag**. Three pieces of persistent state, none of them
   located in the ROM, all of them read on one frame. **State that persists
   across stages is the state most likely to be initialised wrongly and least
   likely to be caught by a stage-1 oracle run.**
6. **THE `$8130BE` `bmi`.** §6.3. If any path makes that word negative the chain
   meter stops decrementing. **A chain that never expires is not a small
   divergence.** Unexplained, uncensused, and it sits at the junction of the
   item counter and the chain machine.
7. **A NAMED TRAP FOR THE IMPLEMENTER.** `$27F582`'s at-max item award is
   `move.l #$1000,D0` = **BCD 1,000**, the same number the web gives as the bee
   base. **They are unrelated.** Anyone searching the port or the ROM for the
   bee base will find this first.
8. **AND THE STANDING ONE:** nothing in this document is measured. Every number
   is a behavioural report by a player, and several of the strongest-sounding
   ones (§1.3's ×100, §1.1's +1,000/stage, §4.4's label attribution) are
   already known to be contested or single-sourced. **Web findings are leads.
   The ROM is the inventory; the oracle is the verdict.**

---

## SOURCES

**Fetched and read `[F]`:**

- Shmups Wiki - *DoDonPachi DaiOuJou* - https://shmups.wiki/library/DoDonPachi_DaiOuJou
- Shmups Wiki - *DoDonPachi DaiOuJou Black Label* - https://shmups.wiki/library/DoDonPachi_DaiOuJou_Black_Label
- ja.wikipedia - 怒首領蜂大往生 - https://ja.wikipedia.org/wiki/怒首領蜂大往生
- 怒首領蜂大往生まとめ Wiki* - 基礎知識 - https://wikiwiki.jp/daioujo/基礎知識
- iPhone AC - 怒首領蜂 大往生 攻略 - https://iphoneac.com/daioujo.html
- TASVideos forum topic 17578 - *Dodonpachi Daioujou Black Label* - https://tasvideos.org/Forum/Topics/17578

**Seen only as search-engine synthesis, NOT fetched `[S]` - weaker, and possibly
conflated with 最大往生 / 大復活:**

- iPhone AC - 蜂アイテム出現場所一覧 - https://iphoneac.com/daioujo8.html
- 真 もわ爛漫 - 大往生(白)と(黒)の違い - https://mowamowa.hatenadiary.org/entry/20070123/1169519844
- en.wikipedia - *DoDonPachi DaiOuJou* - https://en.wikipedia.org/wiki/DoDonPachi_DaiOuJou

**Attempted and unavailable:**

- ニコニコ大百科 - 怒首領蜂大往生 - **HTTP 403**
- Shmups Wiki `action=raw` - **HTTP 404** (no wikitext access; prose only)

**Searched for and NOT FOUND (a finding, §7.1):** any RAM map, MAME cheat file,
lua script or reverse-engineering note for `ddpdoj` / `ddpdojblk` bee, score,
chain or rank addresses.

---

## LOG (appended as findings arrived)

- opened. Read `20-OWNER-scoring-must-be-exact`, `59-recon-items` (all 937
  lines), `38-recon-bomb-hyper`. Stayed out of `70-*` and `72-*`.
- **THE VALUE IS STATE-DEPENDENT ON THE CHAIN**: base × live HIT count, base
  1,000. Four sources, two languages, one dissent (TASVideos: ×100).
- **NO ORDERING RULE IN DOJ.** Searched for one specifically. The DoDonPachi
  (1997) sequence rule must not be imported - the brief's series warning cuts
  here.
- **THE COMPLETENESS RULE IS REAL AND UNANIMOUS**: 10 per stage, ×2 on the
  10th, no-miss required, and it feeds the loop-2 condition (3+ perfect stages).
- **THE PER-STAGE BASE GROWTH (+1,000) IS SINGLE-SOURCE.** Two thorough
  Japanese sources describe the bee award fully and omit it.
- **THE RANK ANSWER: YES, INDIRECTLY, WITH TWO LAYERS OF DELAY.** Bee → hyper
  gauge (3% per 20 hits, ceiling 30%, nothing while hypering) → `$81B64A`
  threshold → hyper item → `$81B65C` → next super → `$81B646` **accumulates**
  → +16 rank permanently. Two independent sources, two languages, identical
  percentages. **Same class as the hyper-item precedent, one indirection worse.**
- **THE WEB INDEPENDENTLY DESCRIBES `$81B646`**: "rank returns when the hyper
  ends but the bullet-speed rank does not fully return" (wikiwiki) and "+10% on
  activation, only −5% after, persists until death" (TASVideos). That is an
  accumulator only death reduces - which is what `38-recon` measured.
- **THE CAP OF 20 IS NOT CONSISTENT WITH ANY BEE CLAIM.** Seven independent
  tests, all pointing the same way (§6.2) - count, chain read, score shape,
  gauge write, HUD, spawn route, and the compare against 10 that is missing.
- **⇒ THE BEE IS PROBABLY A SEVENTH SUBSYSTEM**, outside both ranges
  `59-recon` censused, and it is unenumerated and **unsized** in this repo.
  Offered as inference with its limit stated, not as a conclusion.
- **AN ITEM COUNTER GATES THE CHAIN DECREMENT.** `$2844BE tst.w $8130BE / bmi`
  jumps past `$284636 subq.w #1,$81B5C0`. A counter capped at 20 cannot be
  negative, so something else writes it - or it is not an item counter.
  Uncensused by anyone.
- **PREDICTED THE GAUGE ARITHMETIC SO THE ROM CAN CHECK RATHER THAN BELIEVE**:
  `$95F` = 100% ⇒ 3% = `$48`, 30% = `$2D0`, ten steps.
- **NAMED A TRAP**: `$27F582`'s `move.l #$1000` is BCD 1,000 - the bee's base
  number, on unrelated code, and it is what a grep will find first.
- **NO ROM-LEVEL WEB SOURCE EXISTS** for this game. No RAM map, no cheat file,
  no lua. Our recon will be the first.
- **NOTHING ON FRAME ORDER ANYWHERE.** For a sub-frame-exact bar the web
  contributes zero; the ROM must supply all of it.
- 13 confirmation items in three tiers (§8); 8 rank risks (§9).

status: **DONE**
