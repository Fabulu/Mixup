# 70 - WEB RECON: BEE ITEMS, HOW THEY ARE REVEALED AND COLLECTED

status: **DONE** - see §8, THE CONFIRMATION LIST.

started / finished: 2026-08-05
role: WEB RECON 1 of 3. **READ-ONLY on the repo.** This file is the only thing I
write or commit. `src/` and `tools/` belong to three other agents this round;
`games/gradius/` NOT TOUCHED. **No ROM was read. No MAME was run. Nothing in
this file is a measurement of our port, and nothing in it is a fact about the
board.**

subject of the round: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER) - the
`怒首領蜂大往生 ブラックレーベル`. Where a source is about the original
(`Master Ver` / "White Label") or about a *different game in the series*, the
line says so, because conflating them is the single most likely way to get this
wrong.

**THE OWNER, WATCHING THE PORT RUN:** *"I see bee pickups showing up and
flickering a little at times. wasn't there something destructible supposed to
cover these? Or you were supposed to shoot them? Not sure."*

---

## 0. THE RULE THIS FILE OBEYS, AND THE HEADLINE

`docs/knowledge/09` is explicit that **the ROM is the inventory.** Everything
below is a **LEAD TO CONFIRM AGAINST THE ROM**, never a fact about our port.
This project has already been burned once by plausible external knowledge - the
player-hitbox-marker question was answered correctly only by finding four
unreachable copies in the ROM and establishing that the board draws none. Had
anyone reasoned from *"shmups have hitbox markers"*, we would have added
something the cartridge never draws. **The same trap is wide open here**, and it
is wider than usual, because the owner's memory of destructible cover is
**correct about a different game in the same series** (§2.3).

Every section is split three ways: **WHAT THE WEB CLAIMS** (with sources and
their agreement), **WHAT WOULD CONFIRM IT IN THE ROM**, and **WHERE SOURCES
CONFLICT**.

### THE HEADLINE, in four lines

1. **Every source that addresses DaiOuJou says bees are revealed by the LASER**,
   specifically by putting the **tip** of the laser on a fixed map position.
   Agreement here is unanimous across English and Japanese sources. **Not one
   DaiOuJou source says a bee is inside a destructible object.**
2. **The owner's "something destructible" is a real mechanic - in `DonPachi`
   (1995), not in `DaiOuJou`.** §2.3. This is exactly the conflation the brief
   warned about, and it is the reason this file exists.
3. **There is a strong candidate for the bee already sitting in
   `59-recon-items`, under a name nobody recognised: KIND `$08`, "the
   `$81040A`/`$81040B` set item".** A counter counting toward a per-stage
   target, a completion arm gated on two player-state flags, a **double award**
   on that arm, and **three BCD conversions** - against a web-documented DaiOuJou
   bug that is *specifically* a BCD error in the bee's base value at the ×2 of
   the last bee in a stage. §6. **This is a lead, not an identification.**
4. **And it does not fully fit.** The web says a bee is worth `1,000 × hit
   count`; `59-recon-items` §5.3 measured that **nothing in the item code
   references any chain word at all** and that every item scores a flat `$10`.
   Either kind `$08` is not the bee, or the multiply lives somewhere no one has
   looked. §6.3. **Stated, not smoothed over.**

---

## 1. WHAT A BEE ITEM IS

### WHAT THE WEB CLAIMS

Unanimous, and every source agrees on the numbers:

* **Ten (10) hidden bee items per stage**, five stages, so 50 per loop.
  [Shmups Wiki DOJ], [Shmups Wiki DOJ Black Label], [HG101], [ja.wikipedia],
  [iphoneac], [1cclog].
* Japanese Wikipedia's phrasing is the tersest and the most useful:
  **「各ステージに10個隠れている蜂アイテムを取ると発生」** - *"ten bee items are
  hidden in each stage; taking them causes [the effect]"*. Note the verb:
  **隠れている**, "are hidden", i.e. they are already placed and concealed, not
  produced on demand.
* They are the **primary scoring item** of the game and, in the original, the
  **key to reaching the second loop** (iphoneac: 蜂パーフェクト on 3+ stages on
  HELL; ja.wikipedia gives it as one of three routes to the 2-player/2nd-loop
  unlock).

### WHAT WOULD CONFIRM IT IN THE ROM

* **A per-stage TARGET of ten.** `59-recon-items` §3 kind `$08` reads
  `$81040A` and compares it against **`$81040B`**, and §9.2 records that **no
  absolute writer of `$81040B` exists in build B** - it is written through a base
  register or at an init nobody found. **Predicted value: `$0A` = 10, written at
  stage init, and re-written every stage.** This is the single cheapest
  confirmation in this whole file: one MAME watchpoint on `$81040B`, one stage.
* **Fifty placements per loop.** If bees are fixed map positions, there is a
  **per-stage table of ten coordinates** (or ten scripted objects) somewhere in
  the stage data. Ten entries per stage × five stages is a distinctive shape;
  look for a 10-entry stride table referenced from stage init.

### WHERE SOURCES CONFLICT

Nowhere. Ten per stage is the one number every source gives identically.

---

## 2. **HOW THEY ARE REVEALED - THE OWNER'S ACTUAL QUESTION**

### 2.1 WHAT THE WEB CLAIMS - laser, and specifically the laser's TIP

This is the best-supported claim in the file. Four independent sources, two
languages:

* **Shmups Wiki (DaiOuJou):** *"Uncovering a bee item with the Laser will add a
  HIT to the current chain counter"*. The verb is **uncovering**, and the
  instrument is **the Laser**.
* **Shmups Wiki (DaiOuJou Black Label):** the same sentence. The BL page does
  **not** amend the reveal mechanic.
* **1cclog (PS2 DOJ):** *"Every stage has 10 hidden bees **unlocked with
  laser**"*.
* **iphoneac (Japanese, the stage-by-stage bee-location guide) - the most
  specific source I found:**
  > **「蜂アイテムは特定の場所にレーザーの先端を当てると出現します」**
  > *"Bee items appear when you put **the tip of the laser** on a specific
  > place."*
  and
  > 「レーザーを撃っていれば勝手に出ることも多いのですが、もしすぐに出ない場合は
  > 一旦ショットに切り替えて、撃ち直す必要があります」
  > *"They often come out on their own while you are firing the laser, but if one
  > does not come out right away you have to switch back to shot once and re-fire
  > [the laser]."*
* A second Japanese aggregator states the negative explicitly:
  **「ショット（通常の射撃）では出現しない隠し仕様」** - *"a hidden spec: they do
  not appear from the shot (ordinary fire)."*

Two mechanically load-bearing details fall out of the Japanese wording and they
matter more than the headline:

1. **It is the laser's TIP (先端), not the beam.** The beam is a long persistent
   object; the sources say the *tip* is what triggers. So the trigger is
   plausibly a **point test against the laser's leading end**, not an overlap
   test against the whole beam.
2. **Re-firing matters.** "If it doesn't come out, switch to shot and fire the
   laser again" only makes sense if the tip's trigger is evaluated **as the tip
   advances/first arrives**, not continuously while the beam is parked. A
   continuously-evaluated overlap test would make re-firing pointless.

### 2.2 **IS THERE DESTRUCTIBLE COVER? - NO DAIOUJOU SOURCE SAYS SO**

**Not one source about DaiOuJou describes a bee as being inside, under, or
released by a destructible object.** I looked specifically: Shmups Wiki (DOJ and
BL), HG101, ja.wikipedia, iphoneac (both the strategy page and the dedicated
bee-location page), 1cclog. Every one of them describes a **position** that the
laser reveals. **The absence is consistent across all six.**

**I am not concluding the board has no such path** - the web's silence is
evidence about the web, not about the cartridge, and §6.2 records a ROM fact
that points the other way and must be resolved.

### 2.3 **WHERE THE OWNER'S MEMORY COMES FROM, AND IT IS NOT WRONG**

The owner's "wasn't there something destructible supposed to cover these?" is a
**correct memory of `DonPachi` (1995)**, the first game in the series. A
search-result summary of the DonPachi material states:

> *"For the bee items hidden within the stage, their specific location can be
> found by hovering over them, and can be revealed for pickup by either hitting
> the item's location with the tip of the Laser, or by launching a Spread Bomb
> while that area is on screen. **The other place bee items can be hiding is
> within destructible sections of large ships and bosses, and will appear
> regardless of how the section was destroyed.**"*

**FLAGGED AS UNVERIFIED, deliberately:** I could not reproduce that sentence by
fetching `shmups.wiki/library/DonPachi` directly - that page's bee section, as
fetched, gives only the count (13) and the 100 → 100,000 scoring ladder, and its
"hidden" discussion is about **hidden BOMB items**, not bees. So the
destructible-sections claim reached me only through a search engine's summary of
DonPachi-family pages and **I could not confirm its exact source.** Treat it as
"the mechanic the owner is remembering exists somewhere in the series", not as a
citation.

**The series ladder, as the sources give it - and these are FOUR DIFFERENT
GAMES:**

| game | bees/stage | how revealed, per sources |
|---|---:|---|
| **DonPachi** (1995) | 13 | laser tip **or spread bomb**; *and* (unverified) **some inside destructible sections of large ships and bosses**, appearing however the section died |
| **DoDonPachi** (1997) | 13 | *"uncovered by **lasering the spot** that the bees are hidden"* - Shmups Wiki. Laser only; bombs and destructible parts **not** mentioned |
| **DaiOuJou** (2002) / **Black Label** | **10** | **laser tip on a fixed map position.** No destructible cover in any source |
| **DaiFukkatsu** (2008) | - | *"still revealed with the laser like in previous games"*, but **two kinds** (yellow = score, green = hyper gauge) and, once revealed, **they alternate between yellow and green until collected** |

**DaiFukkatsu's alternating yellow/green is the most dangerous single fact in
this file for our purposes.** It is a real, well-documented "revealed bee changes
state over time" behaviour - and it is **the wrong game**. If anyone reads
"flickering bee" and reaches for it, that is the hitbox-marker mistake repeated.

### 2.4 WHAT WOULD CONFIRM THE REVEAL PATH IN THE ROM

Ranked by how decisive each is:

1. **Find the trigger test for the laser TIP.** The port already knows where the
   laser lives (`59-recon-items` §4.4: laser art via `$24D2FC`/`$24D35C`,
   indexed by `($58,A4)` the SHIP). Look for a **point-in-region or
   coordinate-equality test** that reads a laser-tip coordinate and compares it
   against a table of stage positions. A whole-beam AABB would falsify 先端.
2. **Look for a per-stage 10-entry position table** referenced from stage init,
   and for the code that walks it. If it exists, bees are placed data, and
   "destructible cover" is dead for DaiOuJou.
3. **Resolve `59-recon-items` §9.1's two unattributed spawn sites** - this is
   already on that recon's own open list and it is now the highest-value item on
   it:
   * **`$267CAC`** - spawns with `D0` = `$0`/`$4`/`$8`/`$C`/`$10`, behind
     `$23D18E` bit 6 and `$259C42`. **It can pass `$8`.** A single site that can
     emit five different kinds is the shape of a **stage-scripted / table-driven
     spawner**, which is exactly what a fixed-position bee needs.
   * **`$27B4A0`** - a `$27Bxxx` body, `D0 = $10`, behind `($2E,A5)` borrowing.
     recon 59 found its only inbound longwords are `$267830` (index 3 of a
     state-pointer table at `$267824`) and `$262932` (a
     `move.l #$27B49C,($10,A6)` state install).
4. **The destructible-cover question, answered directly:** `59-recon-items` §2.1
   measured that **enemy type `$86`'s death drops kind `$8` exactly once,
   always, with no RNG**. A one-to-one "this object dies → exactly one of this
   item" mapping is *precisely* the shape a hidden-bee carrier would have. **So
   the ROM currently contains a path where an item of the bee-candidate kind
   comes out of a destroyed object, and the web says DaiOuJou has no such
   thing.** Resolving this is §8's item C1 and it is the owner's question in one
   line: **is enemy type `$86` the destructible cover?**

### 2.5 WHERE SOURCES CONFLICT

* **Shot vs laser:** one Japanese source says flatly that shot does not reveal
  bees; iphoneac says to *switch to shot and back* when one won't come out. These
  are not actually contradictory - the second is about restarting the laser - but
  a careless reading of iphoneac would produce "shot reveals bees", which is
  wrong. Recorded because it is an easy misread.
* **"laser" vs "laser tip":** English sources say "with the Laser"; Japanese
  sources say **レーザーの先端**, the tip. The Japanese is more specific and no
  source contradicts it. **If the ROM shows a whole-beam test, the Japanese
  community wording is folklore and the English is closer.** Do not assume.
* **DonPachi's destructible sections:** unverified at source (§2.3).

---

## 3. UNREVEALED vs REVEALED - IS THERE A DISTINCTION?

### WHAT THE WEB CLAIMS

**Thin, and I am reporting that as the finding rather than filling it.**

* **Before the reveal, sources say only 隠れている / "hidden".** No source I found
  describes an unrevealed-bee sprite, a marker, a shimmer, or a silhouette in
  DaiOuJou. ja.wikipedia, iphoneac and Shmups Wiki all treat the pre-reveal state
  as *invisible*, and all three publish **maps/screenshots of the locations**
  precisely because the player cannot see them.
* **The reveal itself has a mechanical effect distinct from collection.**
  Shmups Wiki (both DOJ and BL): *"**Uncovering** a bee item with the Laser will
  **add a HIT to the current chain counter**"*. That is a chain effect **at
  reveal time**, before anything is picked up. **This is the clearest evidence
  in any source that unrevealed and revealed are two distinct states with two
  distinct events.**
* **No source describes a timer, a blink, or a despawn** on a revealed DaiOuJou
  bee. I searched for it in Japanese specifically (出現後/消える/取り逃し) and
  found nothing. **The owner's observed "flickering" is not a documented
  DaiOuJou bee behaviour in any source I could find.** It is documented for
  **DaiFukkatsu** (yellow↔green alternation) - a different game (§2.3).
* **DonPachi** (again, a different game) is the only place a "you can locate it
  before revealing it" claim appears - *"their specific location can be found by
  **hovering over them**"* - and that claim is unverified (§2.3).

### WHAT WOULD CONFIRM IT IN THE ROM

* **Two objects or one?** If reveal-and-collect are two states of one record,
  there is a **state bit** in the bee's status word. If they are two objects,
  the reveal **destroys a carrier and allocates an item record**. `59-recon-items`
  §1.2 gives the item status word's known bits: bit15 allocated, bits 2..5 the
  KIND, **bit 13 = "the body has initialised" (`bset #5,(A6)`)**, bit 12/11 =
  P1/P2 touching, bit 0 = collected-normally, bit 7 = collected-at-max.
  **There is no known "not yet revealed" bit** - which is mild evidence that the
  reveal happens *outside* the item pool, i.e. the carrier is a separate object.
* **The +1 HIT at reveal.** If reveal adds a chain hit, there must be a write to
  the chain/hit counter at the reveal site. `59-recon-items` §5.3 names the chain
  words as **`$81B5C0`, `$81B5DA`, `$81B5B2`, `$81B5E0`** and measured that
  **none of them is touched anywhere in `$27E812..$27F801` or
  `$252C96..$25313C`**. **So if the +1 HIT is real, its writer is OUTSIDE the
  item subsystem entirely - which is consistent with the reveal being a separate
  object's death, and inconsistent with it being part of item collection.**
  A census of writers of those four words is the direct test.
* **The "flicker":** `59-recon-items` §1.2 gives every item record a
  `+$0C`/`+$0D` **animation frame countdown and reload (`#$202` = 2/2)** and a
  `+$0E` cursor masked `$F` (4 frames) or `$3F` (16). A **2-frame-per-cell,
  4-cell** animation is a fast cycle and is a candidate explanation for anything
  that looks like flicker - **but I did not look at our port and I am not
  claiming it is the cause.** A code recon can settle it by reading the four
  cells at `$27ED7C` → `$1B8448..$1B852C` (kind `$08`'s table) and seeing whether
  the four frames differ in brightness.
* **Search the ROM for a "hidden bee" carrier sprite.** If the unrevealed bee is
  invisible, its object has **no** sprite emit. An object that is placed, tested
  against the laser tip, and draws nothing is a very distinctive shape: a body
  with a collision extent and **no `jmp $23EB06` emit** (recon 59 §3 records that
  every item body ends in exactly that emit).

### WHERE SOURCES CONFLICT

* **Reveal-adds-a-HIT vs. collect-refills-the-gauge.** Shmups Wiki's sentence
  bundles two effects - *"add a HIT to the current chain counter, **and it will
  refill the chain gauge by 50%**"*. A separate, independent statement of DOJ's
  rules says **the 50% figure is the general laser rule** - *"if an enemy is
  killed with the laser, the chain gauge will only be filled up to 50%"* - i.e.
  50% is what **laser kills** do, not what bees do. **These may be the same
  sentence mis-split.** I could not resolve it. **Do not port a "bee refills the
  chain gauge to 50%" rule on this evidence.**
* Another rendering of the same wiki text says the refill happens **"when an
  item is collected"** rather than at reveal. So: **+1 HIT at reveal is
  well-attested; the gauge refill is attested three different ways and I cannot
  tell which is right.**

---

## 4. WHAT COLLECTION DOES - IMMEDIATELY, AND IN SEQUENCE

### 4.1 IMMEDIATE - WHAT THE WEB CLAIMS

Unanimous on the formula:

* **Score: `1,000 × the current HIT/chain count`.** [Shmups Wiki DOJ]
  (*"worth 1,000 points multiplied by the number of hits in the current combo
  chain"*), [HG101], [ja.wikipedia] (**「取得時のコンボ数×1,000点が加算される」**),
  [iphoneac] (**「1000×コンボ数」**).
* **Hyper gauge fill, scaled by chain.** ja.wikipedia:
  **「取ると同時にコンボ数に応じてハイパーゲージが上昇」**. Shmups Wiki gives the
  ladder for **Black Label**: a 20–39 HIT chain fills **3%**, 40–59 fills **6%**,
  … **200+ fills 30%**. **Below 20 HITs a bee gives no hyper gauge at all.**
  Shmups Wiki BL adds: *"collecting a bee item while in Hyper Mode won't give any
  hyper gauge."*
* **Combo timer refill** on collection (see the §3 conflict - this is the
  claim I could not pin down).

### 4.2 IN SEQUENCE - WHAT THE WEB CLAIMS

Three stacked effects, all well-attested:

1. **The ×2 on the last bee.** *"If a player can collect all ten bee items in a
   stage **without dying**, the last item will have an additional **x2**
   multiplier."* [Shmups Wiki DOJ + BL], [HG101], [ja.wikipedia], [iphoneac].
   This is 蜂パーフェクト, "bee perfect".
2. **The base value ratchets up per stage.** *"Collecting all the bee items in a
   stage will also **increase their default value by 1,000 for every subsequent
   stage**."* [Shmups Wiki], [HG101]. The technical Japanese source
   (rokulpg) gives the actual ladder it observed: **2-1 = 6,000, 2-2 = 7,000,
   2-3 = 8,000, 2-4 = 9,000** base points - i.e. **+1,000 per perfected stage,
   carried across the loop boundary.**
3. **The end state:** *"Collecting every bee item in both loops without dying
   outside of boss fights will cause the bee items to be worth **10,000 points
   each** in the final stage."* [Shmups Wiki], [HG101].
4. **Progression gate (original DOJ):** 蜂パーフェクト on **three or more stages**,
   no continues, is one of the routes to the second loop / the 2-player unlock.
   [ja.wikipedia], [iphoneac]. iphoneac adds that on **HARD** the bees are
   **「２週目とは無関係」** - irrelevant to reaching loop 2 - and that the bee
   requirement is a **HELL** rule. Black Label replaces this with an explicit
   1-loop/2-loop choice at the start [Shmups Wiki BL], so **the gate is a
   version difference** (§5).

### 4.3 **THE DOCUMENTED BUG, AND WHY IT IS THE BEST ROM LEAD IN THIS FILE**

A dedicated Japanese technical post (rokulpg, 2022) documents a **bee-item
overflow bug** in DaiOuJou, present **identically on arcade, PS2 and Xbox 360**:

> **「蜂アイテムの素点はBCD(ニ進化十進表記)で表現されているが、BCDの値を10進想定で
> 計算してしまっていることにより結果がおかしくなっている」**
> *"The bee item's base score is expressed in **BCD** (binary-coded decimal), but
> the calculation treats the BCD value as if it were decimal, which makes the
> result wrong."*

Concretely: with a base of 8,000, the correct ×2 is 16,000, but the game
computes `0x8000 × 2` and lands on 10,000. It bites **on the last bee of a
stage under bee-perfect conditions**, at bases of 6,000–9,000, i.e. **2-1
through 2-4**; 2-2 is described as a ~44% loss in the 2,615–2,799 HIT band, and
2-3/2-4 as unavoidable.

**Why this matters here:** it pins three structural facts about the bee that a
ROM recon can look for directly - **(a)** the bee has a stored **base value**,
**(b)** it is held in **BCD**, and **(c)** the **×2** is a separate arithmetic
step applied to that base on the last bee of a perfected stage. §6 is about a
kind in `59-recon-items` that has all three.

### 4.4 WHAT WOULD CONFIRM COLLECTION IN THE ROM

* **`1,000 × hits` needs a MULTIPLY against a chain word.** `59-recon-items`
  §5.3 measured **zero references to `$81B5C0`/`$81B5DA`/`$81B5B2`/`$81B5E0`**
  anywhere in the item code. **Find the multiply.** Either it is in a routine the
  item code calls out to (`$25349A`, `$2533C8`, `$242AC6`, `$286128`), or the
  bee is not an item-pool kind at all. This is the sharpest open question in the
  file.
* **BCD:** `59-recon-items` §3 kind `$08` performs **three `$242AC6` BCD
  conversions** into `$8128F6`, `$8128FA`, `$812900`. **`$242AC6` is the BCD
  routine to disassemble**, and the bug above predicts the failure mode: a value
  that is BCD being fed to a binary `add`/`asl` rather than an `abcd`.
* **The base value and its +1,000:** recon 59 read `$8128F4 += $4D` on the
  completion arm, gated on `$8128FE != $63` (= 99), with `$8128FE += 1`.
  **`$4D` is 77 decimal and the web says the increment is 1,000 - that does not
  match and must be explained.** Candidates a recon should test: `$8128F4` is not
  the base value but a *digit/tile cursor* (`$4D` = 77 as a display stride is
  plausible next to three BCD conversions and a HUD call), or recon 59's `$4D`
  is an operand of a different instruction in that arm. **Re-read
  `$252E9A..$252F60` byte by byte before anyone builds on `$4D`.**
* **The ×2:** recon 59 says the `$252F34` arm *"awards `$4D` again, and a SECOND
  `$4D` if BOTH `$8103E6` bit 6 was clear AND `$8103E7` bit 1 was clear"*. **A
  conditional double award gated on two flags is exactly the shape of the
  bee-perfect ×2**, and `$8103E6` bit 6 / `$8103E7` bit 1 are then the
  **"has not died this stage"** state. Test: **kill the player mid-stage and
  watch those two bits.**
* **The hyper-gauge ladder** (3%…30% by chain band) needs a **band table or a
  divide by 20** somewhere near the collect routine. recon 59 §4.3 records that
  kinds `$C`/`$14` write `$81B642 := $95F` (the hyper gauge) outright - **so
  `$81B642`/`$81B644` is the gauge word to watch**, and a bee should add a
  *fraction* of `$95F` rather than assign it. `$95F` = 2,399; 3% of 2,400 = 72,
  30% = 720. **If a bee's hyper contribution exists, look for `$95F`, 2,400, or
  a /20-and-multiply near the bee's collect arm.**

### 4.5 WHERE SOURCES CONFLICT

* The **hyper-gauge percentage ladder** is stated on the **Black Label** page.
  Whether the **original** uses the same ladder is not stated anywhere I found -
  and the BL-vs-WL comparison says the original's hyper gauge *"wasn't working
  properly"* (§5), so **assuming the ladder is shared is unsafe.**
* The **chain-gauge refill on collection** - 50%? on collect? on reveal? - is
  three-way ambiguous (§3).

---

## 5. SHIP / STYLE / VERSION DIFFERENCES

### WHAT THE WEB CLAIMS

* **No source describes any bee difference between the two ship types.**
  iphoneac states TYPE-A and TYPE-B differ in shot pattern (**TYPE-B fires
  diagonally**) but **「レーザーは同じ」** - *"the laser is the same"*. Since the
  reveal is a **laser** mechanic and the laser is identical across ships, the
  sources' silence is at least coherent.
* **No source describes any bee difference between the three Element Dolls.**
  The dolls change **bomb stock (Shotia 6 / Leinyan 4 / EXY 2)** and attack
  strength [GameFAQs-derived summary], not bees.
* **Black Label vs original - bees themselves: no documented change.** The BL
  page repeats the reveal sentence and the ×2 rule verbatim. What BL *does*
  change around them:
  * **an explicit 1-loop / 2-loop choice**, so **the bee-perfect progression
    gate of the original is gone as a requirement**;
  * **the hyper gauge**: *"the common perception is that the Hyper Meter fills
    faster in Black Label, but actually there are small nuances in the original
    that result in the Hyper Meter not always filling as it should, which have
    been addressed in Black Label."* **Since bees feed the hyper gauge, this is a
    bee-adjacent behavioural difference between the two versions even though the
    bee rule text is identical.**
  * extends at 20M/50M (BL) vs 10M/30M (WL); TYPE-B shot slightly faster in BL.
* **The BCD overflow bug is NOT version-specific** - rokulpg reports it
  identically on arcade, PS2 and Xbox 360.

### WHAT WOULD CONFIRM IT IN THE ROM

* **Ship independence:** if the reveal test reads `($58,A4)` / `$810440` (the
  SHIP, per recon 59 §4.4) anywhere in its path, the web is wrong. Expect it
  **not** to.
* **Version:** we only have build B (`ddpdojblk`). Any WL-vs-BL claim in this
  file is **unfalsifiable from our inventory** and must not be ported as a
  branch. Only what build B does is portable.

### WHERE SOURCES CONFLICT

None on ships or dolls - but that is **silence**, not agreement. Not one source
I read set out to test whether bees differ by ship, so "no difference" is
uncorroborated absence.

---

## 6. **IS THE BEE ALREADY IN `59-recon-items`'s SIX KINDS?**

The brief asked this explicitly. **Answer: probably yes - KIND `$08` - and the
case is strong but not closed.**

`59-recon-items` §1 enumerates six kinds: `$00` power-up, `$04` full power,
**`$08` "the `$81040A`/`$81040B` counter item"**, `$0C` P1 hyper stock, `$10`
"the `$8130BE` counter, cap 20", `$14` P2 hyper stock.

### 6.1 THE CASE FOR KIND `$08`

Every item is from `59-recon-items` §3 [CITED], matched against the web above:

| what recon 59 measured about kind `$08` | what the web says about bees |
|---|---|
| a counter `$81040A` counting up toward a **target `$81040B`** | **ten per stage**, counted, with a per-stage completion condition |
| **`$81040B` has no writer anywhere in build B** (§9.2) - written at an init nobody found | a **per-stage** target would be written at **stage init** |
| on completion: `bclr #6,$8103E6` / `bset #1,$8103E7` - **PLAYER STATE flags** | 蜂パーフェクト requires **not having died**; a per-stage no-miss flag is exactly this |
| the `$252F34` arm **awards the value AGAIN, and a SECOND time if two flags are clear** | **the ×2 on the last bee of a perfected stage** |
| **three `$242AC6` BCD conversions** | the documented bug is **specifically a BCD-vs-decimal error in the bee's base value at the ×2** (§4.3) |
| a value that **accumulates** (`$8128F4 +=`) with a **counter capped at `$63` = 99** | the base value **ratchets +1,000 per perfected stage**, 6,000→9,000 by 2-4 |
| `jsr ($25349A,PC)` - the HUD - on completion; `jsr ($2533C8,PC)` - a cue - otherwise | a visible/audible bee-perfect event |
| four animation cells at `$27ED7C` → `$1B8448..$1B852C` | a small animated pickup |

**Six independent structural matches, one of them (BCD at the ×2) very
specific.** If kind `$08` is not the bee, something else in this ROM counts to a
per-stage target, tracks a no-miss flag, doubles an award, and stores the result
in BCD.

### 6.2 THE CASE AGAINST, STATED PROPERLY

1. **Its only attributed spawn is an enemy death.** recon 59 §2.1: **type `$86`'s
   death arm drops kind `$8`, always, exactly once, with no RNG.** The web says
   DaiOuJou bees come from lasering a map position. **These are reconcilable in
   exactly one way - if type `$86` IS the hidden-bee carrier**, i.e. an object
   placed at the bee's map coordinate that dies when the laser tip reaches it and
   spawns the bee. **That would mean the owner's "something destructible" is
   literally right for DaiOuJou too, and every web source is describing the
   player-facing surface of a carrier-object implementation.** This is the single
   most important thing for a ROM recon to settle. **I cannot settle it from the
   web and I will not guess.**
2. **`$267CAC` can also pass `D0 = $8`** and is unattributed (recon 59 §9.1). If
   *that* is the bee's spawner, type `$86`'s kind-`$8` drop is a different item
   sharing the kind, and everything above shifts.
3. **The `1,000 × hits` multiply is missing.** recon 59 §5.3: **zero chain-word
   references in the entire item subsystem.** §4.4 says where to look.
4. **`$4D` ≠ 1,000.** §4.4. Unexplained; must be re-read before use.
5. **Kind `$08`'s motion is described as HOMING** (recon 59 §1.2: `+$1E`/`+$1F`
   *"a sub-tick and its reload (kind `$08`'s homing)"*). **No DaiOuJou source
   describes bees homing toward the player.** Either the description is of
   something else, or bees do drift toward the player and no guide bothered to
   say so, or kind `$08` is not the bee. **Checkable in thirty seconds of
   superplay video** and I did not do it - I had no video source I could cite.

### 6.3 THE OTHER FIVE, briefly

* **`$00` / `$04`** - power-up and full power. Not the bee; recon 59 read their
  collect routines and they write the shot/laser power words only.
* **`$0C` / `$14`** - P1/P2 hyper **stock**. Not the bee: bees *fill the hyper
  gauge by a percentage*; these **assign `$81B642 := $95F`** and bump a stock
  counter capped at 5, which matches the game's separate **hyper item**.
* **`$10` - `$8130BE`, capped at 20, HUD icons "up to 5 a row" - UNIDENTIFIED,
  and I could not match it to anything the web describes.** It is **not** bees
  (10/stage, and its collect does no chain or BCD arithmetic) and it is **not**
  bombs (max bomb stock is **6/4/2 by Element Doll**, per the GameFAQs-derived
  summary - none of them 20). **Recording "unidentified" rather than inventing a
  name for it.** Its spawner `$27B4A0` is also unattributed. A second web recon
  or a code recon should take it.

---

## 7. WHAT I COULD NOT FIND, AND WHERE THE WEB IS THIN

Stated the way `docs/knowledge` requires - what I looked for, and where.

1. **Any DaiOuJou-specific statement about destructible cover, either way.**
   Six sources, all silent. Silence is not a denial.
2. **What an unrevealed DaiOuJou bee looks like** - sprite, marker, or nothing.
   No source addresses it. Searched EN + JP.
3. **Whether a revealed DaiOuJou bee can be lost** (scrolls away, times out,
   blinks). Searched 出現後/消える/取り逃し. **Nothing.** The community treats a
   revealed bee as reliably collectable, which is weak evidence of "no timer" and
   nothing more.
4. **Whether the 50% chain-gauge refill belongs to bees or to laser kills.**
   Three mutually inconsistent renderings of what looks like one wiki sentence
   (§3). Unresolved.
5. **Whether the hyper-gauge percentage ladder applies to the original as well as
   Black Label.** Only ever stated on the BL page.
6. **A RAM map, cheat file, or TAS/technical document naming DaiOuJou bee
   addresses.** I searched for MAME cheat data for `ddpdoj`/`ddpdojblk` and found
   only ROM-set listings. **The rokulpg post is the only technical source I found
   and it names no addresses.** So there is **no external address to check ours
   against** - which is exactly why §8 is written as behaviours, not addresses.
7. **`shmups.system11.org` returned HTTP 403** to fetches, and so did
   `gamefaqs.gamespot.com` and `grokipedia.com`. Their content reached me only
   through search-engine summaries, which is a weaker citation and is marked as
   such wherever I used it (§2.3, §5).
8. **Video confirmation of anything** - homing, flicker, sprite. I ran no video
   and cite none.

---

## 8. **THE CONFIRMATION LIST - for the follow-up ROM recon**

Nothing above is a fact about the board until one of these comes back. Ordered
by decisiveness per hour spent.

| # | check | what it settles | how |
|---|---|---|---|
| **C1** | **Is enemy type `$86` the hidden-bee carrier?** Read `$275914` (the shared `$85`/`$86` step handler) and `$275C32` (type `$86`'s init, per recon 59's `$27E016 + 8*$86 == $27E446`). **Does `$86` draw a sprite? Does it have HP? Is it damageable only by the laser?** | **THE OWNER'S QUESTION.** An invisible, laser-only, 1-HP object placed at a map coordinate = the reveal mechanic, and the web's "no destructible cover" is a surface description of one | listing read + one MAME run |
| **C2** | **`$81040B` == `$0A` (10) at stage start?** recon 59 §9.2 found **no writer**; find it. | Confirms/kills kind `$08` = bee in one number | one write watchpoint, one stage |
| **C3** | **`$81040A` reaches 10 exactly once per stage**, and resets at stage boundaries | the per-stage bee count | one watchpoint |
| **C4** | **`$8103E6` bit 6 and `$8103E7` bit 1 - do they track "has not died this stage"?** Kill the player mid-stage and watch. | confirms the ×2 gate is 蜂パーフェクト | one run |
| **C5** | **Re-read `$252E9A..$252F60` byte by byte.** recon 59's `$8128F4 += $4D` must be reconciled with the web's **+1,000 per stage**, and the double-award arm with the **×2** | the base-value ratchet and the ×2 | listing read |
| **C6** | **Disassemble `$242AC6`** (the BCD routine) and check whether the ×2 path uses a **binary** `add`/`asl` on a **BCD** value | reproduces or refutes the **documented overflow bug**. **If the ROM has the bug, transcribe the bug** - `docs/knowledge` rules, and a "fixed" port would diverge from every real board | listing read |
| **C7** | **Census the writers of `$81B5C0`, `$81B5DA`, `$81B5B2`, `$81B5E0`** (recon 59's chain words). Is there a **+1 HIT** write from outside the item subsystem, at a laser-tip site? | the **reveal-adds-a-HIT** claim, and whether reveal is a separate object's event | `xref.py` |
| **C8** | **Find the `1,000 × hits` multiply.** recon 59 measured zero chain references in `$27E812..$27F801` and `$252C96..$25313C`, yet every source gives that formula. Look inside `$25349A`, `$2533C8`, `$242AC6`, `$286128` | either finds the bee's real score path or **falsifies kind `$08` = bee** | listing read |
| **C9** | **Attribute `$267CAC`** (recon 59 §9.1 - spawns `D0` = `$0`/`$4`/`$8`/`$C`/`$10`, behind `$23D18E` bit 6 and `$259C42`). A five-kind spawner is the shape of a stage-scripted spawner | whether bees are **placed data** rather than enemy drops | listing read, ~1h (already on recon 59's own open list) |
| **C10** | **Look for a per-stage 10-entry position table** referenced from stage init | fixed bee placements | pattern search |
| **C11** | **Find the laser-TIP trigger.** A point test against a laser leading-edge coordinate, vs. a whole-beam AABB | confirms or kills the Japanese sources' **レーザーの先端** | listing read |
| **C12** | **Does anything on the bee path read the SHIP (`$810440`, `($58,A4)`) or the doll?** | the web's claim of **no ship/doll difference** | `xref.py` |
| **C13** | **Hyper-gauge contribution:** does a bee-path write add a *fraction* of `$95F` to `$81B642`/`$81B644`, banded by chain (3%…30%)? recon 59 shows kinds `$C`/`$14` **assign** `$95F` | the hyper ladder, and the BL-vs-WL nuance | listing read + watchpoint |
| **C14** | **Kind `$08`'s four animation cells** at `$27ED7C` → `$1B8448..$1B852C`: do the four frames differ in brightness/alternate? And does the `+$0C`/`+$0D` **2-frames-per-cell** reload make a fast cycle? | a **board-side** candidate for anything that looks like flicker - **before** anyone assumes the port introduced it | decode 4 streams |
| **C15** | **Does kind `$08` home toward the player?** recon 59 §1.2 calls `+$1E`/`+$1F` *"kind `$08`'s homing"*. **No source says DaiOuJou bees home.** | a straight contradiction between recon 59's reading and the web | read `$27ED8C`'s motion `bsr` |
| **C16** | **Identify kind `$10`** (`$8130BE`, cap 20, ≤5 HUD icons a row, spawner `$27B4A0` unattributed). **Not bees, not bombs** (§6.3). | closes the last unnamed kind | listing read |

**AND THE STANDING RULE FOR WHOEVER PICKS THIS UP:** if a check comes back
against the web, **the ROM wins and this file is wrong.** Nothing in §1–§7 is
evidence about the cartridge.

---

## 9. SOURCES

Primary/technical first. `[403]` = the site refused a direct fetch and the
content reached me only through a search-engine summary, which is a weaker
citation and is marked at every point of use.

1. **rokulpg**, 「大往生の蜂アイテムオーバーフローバグについて」 (2022-11) -
   the only technical source found; BCD base value, the ×2 bug, the 6,000–9,000
   per-stage base ladder, arcade/PS2/X360 parity.
   <https://rokulpg.blogspot.com/2022/11/blog-post.html>
2. **iPhone AC**, 怒首領蜂 大往生 蜂アイテム出現場所一覧 - stage-by-stage bee
   locations; **レーザーの先端** wording; 蜂パーフェクト; 1000×コンボ数.
   <https://iphoneac.com/daioujo8.html>
3. **iPhone AC**, 怒首領蜂 大往生 攻略 - items overview, TYPE-A/B
   (**「レーザーは同じ」**), HARD vs HELL loop-2 conditions.
   <https://iphoneac.com/daioujo.html>
4. **Shmups Wiki**, DoDonPachi DaiOuJou - *"Uncovering a bee item with the Laser
   will add a HIT…"*, 1,000 × hits, ten per stage, ×2, +1,000/stage, 10,000 in
   the final stage. <https://shmups.wiki/library/DoDonPachi_DaiOuJou>
5. **Shmups Wiki**, DoDonPachi DaiOuJou **Black Label** - the same reveal
   sentence, the **3%–30% hyper ladder**, "no hyper gauge while in Hyper Mode",
   BL's 1-loop/2-loop choice, extends, TYPE-B speed.
   <https://shmups.wiki/library/DoDonPachi_DaiOuJou_Black_Label>
6. **Shmups Wiki**, DoDonPachi (1997) - *"uncovered by lasering the spot that the
   bees are hidden"*, **13** per stage. <https://shmups.wiki/library/DoDonPachi>
7. **Shmups Wiki**, DonPachi (1995) - **13** per stage, the 100→100,000 ladder,
   266,500/stage. Fetched directly; **its bee section did not contain the
   destructible-sections sentence** (§2.3).
   <https://www.shmups.wiki/library/DonPachi>
8. **Japanese Wikipedia**, 怒首領蜂大往生 -
   **「各ステージに10個隠れている蜂アイテムを取ると発生」**,
   **「取得時のコンボ数×1,000点」**,
   **「取ると同時にコンボ数に応じてハイパーゲージが上昇」**, the 蜂パーフェクト ×3
   unlock. <https://ja.wikipedia.org/wiki/怒首領蜂大往生>
9. **Hardcore Gaming 101**, Dodonpachi Daioujou - corroborates 4, adds the
   "both loops → 10,000 each" line.
   <https://www.hardcoregaming101.net/dodonpachi-daioujou/>
10. **1CC Log**, Dodonpachi Daioujou (PS2) - *"Every stage has 10 hidden bees
    unlocked with laser"*.
    <http://1cclog.blogspot.com/2022/03/dodonpachi-daioujou-playstation-2.html>
11. **Shmups Wiki**, DoDonPachi DaiFukkatsu - the **two-colour, alternating**
    bee medals. **A DIFFERENT GAME.** Cited only as the thing not to import.
    <https://shmups.wiki/library/DoDonPachi_DaiFukkatsu>
12. `[403]` **shmups.system11.org** thread 30940 (BL EXTRA bee guide) -
    <https://shmups.system11.org/viewtopic.php?t=30940>
13. `[403]` **GameFAQs**, slateman's DOJ FAQ - source of the **bomb stock 6/4/2
    by Element Doll** figure used in §6.3.
    <https://gamefaqs.gamespot.com/ps2/582447-dodonpachi-dai-ou-jou/faqs/25685>
14. `[403]` **Grokipedia**, DoDonPachi DaiOuJou - source of the *"Bee Medal
    Overflow Bug … due to a BCD problem"* summary that led me to source 1.
    <https://grokipedia.com/page/DoDonPachi_DaiOuJou>

---

## LOG (appended as findings arrived)

- opened. Read `59-recon-items` in full first, so the web reading would be
  measured against what the ROM already said rather than the other way round.
- **UNANIMOUS ACROSS SIX SOURCES, TWO LANGUAGES: DaiOuJou bees are revealed by
  the LASER**, and the Japanese sources specify **the laser's TIP**
  (**レーザーの先端**) on a fixed map position. Ten per stage.
- **NOT ONE DAIOUJOU SOURCE MENTIONS DESTRUCTIBLE COVER.** Six sources checked
  specifically for it.
- **THE OWNER'S MEMORY IS A DIFFERENT GAME - and he is right about it.**
  `DonPachi` (1995) reportedly hides some bees **inside destructible sections of
  large ships and bosses**, released however the section died, and also allows a
  **spread bomb** to reveal them. **Marked UNVERIFIED**: I could not reproduce
  that sentence by fetching the DonPachi wiki page directly.
- **THE SERIES DIVERGES AT EVERY GAME:** DonPachi 13/stage + bombs + (unverified)
  destructible parts; DoDonPachi 13/stage laser-only; **DaiOuJou 10/stage laser
  tip**; DaiFukkatsu two-colour medals that **alternate yellow↔green after being
  revealed**. The DaiFukkatsu behaviour is the trap: it is a real documented
  "revealed bee changes over time" and it is **the wrong game**.
- **THE BEE IS PLAUSIBLY ALREADY ENUMERATED IN `59-recon-items` AS KIND `$08`,
  "the `$81040A`/`$81040B` set item"** - six structural matches (§6.1), the
  sharpest being that the web documents a **BCD bug in the bee's base value at
  the ×2 of the last bee of a perfected stage**, and recon 59 measured kind
  `$08`'s completion arm doing **three BCD conversions and a conditional double
  award gated on two player-state flags**.
- **AND IT DOES NOT FULLY FIT, THREE WAYS:** kind `$08`'s only attributed spawn
  is **enemy type `$86`'s death** (recon 59 §2.1) - which either kills the
  identification **or means type `$86` IS the destructible carrier the owner
  remembers**; recon 59 measured **zero chain-word references anywhere in the
  item subsystem**, yet every source says a bee is worth **1,000 × hits**; and
  recon 59's `$8128F4 += $4D` is 77, not the 1,000 the web requires.
- **NO EXTERNAL ADDRESS EXISTS TO CHECK OURS AGAINST.** No RAM map, no cheat
  file, no TAS document for `ddpdoj`/`ddpdojblk` names a bee address. The one
  technical source (rokulpg) names none. **§8 is therefore written as
  behaviours, not addresses.**
- **THE WEB IS GENUINELY THIN ON THREE THINGS AND I AM NOT FILLING THEM:** what
  an unrevealed DaiOuJou bee looks like; whether a revealed one can be lost;
  and whether the 50% chain-gauge refill belongs to bees or to laser kills
  (three inconsistent renderings of what looks like one wiki sentence).
- **NO DOCUMENTED FLICKER.** No source describes a DaiOuJou bee blinking,
  flashing or alternating. Recon 59's `+$0C`/`+$0D` **2-frames-per-cell** reload
  over a **4-cell** table is a board-side candidate worth checking (**C14**)
  before anyone assumes the flicker is ours - **and I did not look at our port.**
- **KIND `$10` (`$8130BE`, cap 20) IS UNIDENTIFIED** and is neither bees (10 per
  stage) nor bombs (max 6/4/2 by Element Doll). Recorded as unidentified rather
  than named (**C16**).
- **BL vs WL:** the bee *rules* are stated identically on both wiki pages, but
  BL removes the bee-perfect loop-2 gate (explicit 1/2-loop choice) and BL
  **fixed** hyper-gauge fill that *"wasn't working properly"* in the original -
  and bees feed that gauge. **Only build B is in our inventory, so no WL branch
  is portable.**
- **16 CONFIRMATION ITEMS (§8), C1 first: is enemy type `$86` the hidden-bee
  carrier?** That single listing read answers the owner's question in one line.

status: **DONE**
