# 72 - WEB RECON: BEES, STAGE 1 SPECIFICS / VISUAL BEHAVIOUR / SOURCE QUALITY

status: **DONE** - see the CONFIRMATION LIST (§8) and the SOURCE-QUALITY
RATING (§7).

started / finished: 2026-08-05
role: WEB RECON 3 of 3 (read-only on the repo). This file is the only thing I
write or commit. Recon 1 (`70-*`) covers HOW BEES ARE REVEALED; recon 2
(`71-*`) covers SCORING/CHAIN/RANK. I stayed out of both.
`games/gradius/` NOT TOUCHED. `src/` and `tools/` NOT EDITED. **No MAME was
run. No ROM was read. Nothing here is measured.**

target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER).

**THE RULE THIS ROUND OPERATES UNDER, and it governs every line below:**
nothing here is a fact about the cartridge or about our port. Every section is
**WHAT THE WEB CLAIMS** (with its sources and their agreement) / **WHAT WOULD
CONFIRM IT IN THE ROM** / **WHERE SOURCES CONFLICT**. Web findings are LEADS.

**THE OWNER'S OBSERVATION, the starting point:**
> "I see bee pickups showing up and flickering a little at times. wasn't there
> something destructible supposed to cover these? Or you were supposed to shoot
> them?"

**Why the flicker half matters more than it sounds:** this project has already
established, by measuring 189 of 189 records across 161 board frames, that
**enemy shadow flicker is AUTHENTIC** - the cartridge draws shadows on even
frames only, a hardware trick for faking translucency - and that "fixing" it
would have been a regression. If bees flicker on the real board, the same
applies.

**And the precedent that governs the whole file:** an owner question about a
player hitbox marker was settled by finding four unreachable copies in the ROM
and confirming the board draws none across 161 frames. The correct answer was
"it does not exist here - do not add one." **Bees may behave differently in
this game than the series' reputation suggests - and §3 is exactly that case.**

---

## 0. THE HEADLINE, in four lines

1. **Stage 1 has TEN bees, at FIXED positions pinned to background scenery, and
   NONE of them is in the opening stretch of the stage.** Two independent
   sources agree on all ten, including which side of the screen each is on
   (§1). This is the best-documented thing in the whole file.
2. **NOT ONE SOURCE, in any language, documents a bee in *DaiOuJou* blinking,
   flickering, pulsing or changing colour.** The flicker documentation that
   the search engines keep surfacing is **DaiFukkatsu's and SaiDaiOuJou's, two
   later games**, and I traced each claim back to the page that actually makes
   it (§3). **This is the series-reputation trap the brief warned about, and I
   walked into it once before catching it.**
3. **No source describes a destructible object covering a bee, or any shimmer,
   marker or differently-coloured tile marking the spot.** Every guide's method
   is *memorise the location*. The owner's "something destructible supposed to
   cover these" is **not supported for this game** (§4) - though it is a fair
   description of a *later* game in the series.
4. **The bee is probably NOT one of `59-recon-items`' six pool kinds.** Five of
   the six map cleanly onto named items in the published item roster - and one
   of those mappings independently corroborates a ROM measurement recon 59
   already made - which leaves exactly one unattributed kind against **six**
   roster items still unaccounted for (§6). **That is a structural lead worth
   more than anything else here, and it is cheap to falsify.**

---

## 1. WHERE STAGE 1'S BEES ARE - ten, fixed, and the back two-thirds only

### WHAT THE WEB CLAIMS

**Count: TEN per stage, and the sources are unanimous.** Shmups Wiki's
DaiOuJou page, its separate Black Label page, Hardcore Gaming 101, Japanese
Wikipedia (*"各ステージに10個隠れている蜂アイテム"* - "10 bee items hidden in
each stage") and iPhone AC all say ten. **I found no source claiming any other
number for DaiOuJou.**

**Positions: FIXED, and tied to background scenery, not to enemies.** I have
two independent descriptions and they agree item-for-item and side-for-side.

*Source A - the map image.* Shmups Wiki hosts `DojStage1map.png` (201 × 1,625
px, uploaded by user `Ggmaximo`, 31 May 2024), cited on-wiki as *"Ripped from
DoDonPachi DaiOuJou Re:Incarnation Strategy Guide"*. **The wiki page's text
says nothing at all - the page is an image carrier.** I downloaded the image
and read it. It is a vertical strip of the stage, `START` at the bottom,
`BOSS` at the top, with `AREA-1/2/3` boundary markers and yellow bee icons
placed on the map. **I counted the icons: exactly TEN.** In stage order
(start → boss), with the screen side each sits on:

| # | side | landmark on the map |
|---:|---|---|
| 1 | right | at the AREA-1/AREA-2 band, by the walled structure |
| 2 | left | same band, opposite side |
| 3 | right | after the AREA-1 marker / post-midboss band |
| 4 | left | a stacked pair on the same rooftop |
| 5 | left | " |
| 6 | left | next rooftop |
| 7 | left | " |
| 8 | right | at the pale-blue wall |
| 9 | left | just before/at the wall |
| 10 | left | top of the pale-blue wall, immediately before the boss band |

*Source B - iPhone AC, `iphoneac.com/daioujo8.html`, "怒首領蜂 大往生 蜂アイテム
出現場所一覧" (a screenshot-by-screenshot Japanese location list).* Its ten
entries, translated: **1–2** on the highway stretch just before the midboss -
right end of the stair-walled structure, left end behind it; **3** after the
midboss is destroyed, right end; **4–5** immediately after, two in a row on the
left building rooftop; **6–9** two on the next left rooftop, one at the right
end of the pale-blue wall, one at the left end before the wall; **10** top of
the pale-blue wall, far left, by the `WARNING` display before the boss.

**Source A and Source B agree on all ten, including the left/right sequence
`R,L,R,L,L,L,L,R,L,L`.** They are independent artefacts (a ripped guide scan
vs. a fan's own screenshots), so this is genuine corroboration, not one source
echoed twice.

**THE FINDING THE OWNER'S REPORT MAKES LOAD-BEARING:** on the map, **the
entire bottom fifth of stage 1 - the opening highway/cityscape run from `START`
up to the first `AREA-1` marker - carries NO bee icon at all.** The first bee
is not near the start. Both sources put the earliest pair "just before the
midboss".

### WHAT WOULD CONFIRM IT IN THE ROM

* Ten fixed positions implies **ten static placements in a stage-1 data
  structure**, not ten runtime drops. The natural home is the stage script the
  project has already located (`$263336`, walker `$2633BE`, 8-byte records -
  `PLAN` W18). **Look for ten records in stage 1's script that share a type
  byte no other record uses**, and check whether their spawn clock values sort
  into the map's start→boss order with the first one well after the stage
  opening.
* The left/right sequence above is a **falsifiable prediction on X
  coordinates**: whatever ten objects are found, their X values must read
  `R,L,R,L,L,L,L,R,L,L`. If they do, the identification is settled without any
  laser being fired. **This is the cheapest confirmation in the file.**
* If instead the ten come from an allocator call, that contradicts the fixed-
  position model and the map is wrong about *how*, not *where*.

### WHERE SOURCES CONFLICT

* **Nowhere on the count, and nowhere on stage 1's positions.** This is the
  only part of the subject with clean agreement.
* One search summary returned *"eight hidden bees per stage"*. **I traced it:
  it is SaiDaiOuJou's number, from that game's page, not DaiOuJou's.** Do not
  let "8" enter any document about this target.

---

## 2. WHAT REVEALS A BEE - "the tip of the laser", with a real dispute

*(Recon 1 owns this. Recorded here only because it bounds §3 and §4, and
because one source disagrees with the consensus in a way recon 1 should see.)*

### WHAT THE WEB CLAIMS

**Consensus: the LASER, and specifically its TIP.** iPhone AC: *"レーザーの先端
を当てると出現"* - "they appear when you hit [the spot] with the **tip** of the
laser". Hardcore Gaming 101: bees are *"uncovered by hitting them with the
Laser weapon"*. Shmups Wiki (Black Label page, verbatim): *"Uncovering a bee
item with the Laser will add a HIT to the current chain counter, and it will
refill the chain gauge by 50%."*

**Japanese Wikipedia documents the bees, the count, the scoring and Bee
Perfect - and says NOTHING about how they are revealed.** Worth stating: the
single most encyclopaedic Japanese source omits the mechanic entirely.

### WHERE SOURCES CONFLICT - and this one is substantive

* iPhone AC adds a hedge: *if a bee does not appear promptly under the laser,
  **switch to shot and attack the spot again***.
* The TASVideos DaiOuJou Black Label TAS thread (author `xy2_`) states it as a
  **required two-step**: *"Golden bees … **require a fast shot followed by a
  laser shot to reveal**."*

**So three positions exist: laser-only, laser-with-a-shot-fallback, and
shot-then-laser-mandatory.** They are not reconcilable from text. Note that
`xy2_` was working frame-by-frame in a re-recording emulator, which normally
makes them the more careful observer - but the thread contains **no RAM
addresses and no disassembly**, so it is still gameplay observation.

**A ROM answer settles this and nothing else will.** Flagged for recon 1.

---

## 3. THE FLICKER - the headline negative, and how the trap was sprung

### WHAT THE WEB CLAIMS: **for DaiOuJou, nothing at all.**

I looked specifically for a bee blinking, flashing, pulsing, oscillating,
changing colour, or animating in *DaiOuJou*, in both languages. **Every
DaiOuJou source I found is silent on bee appearance beyond a static icon.**

* Shmups Wiki, DaiOuJou page - item roster with an icon, no visual description.
* Shmups Wiki, **DaiOuJou Black Label** page - detailed on bee scoring, chain
  and hyper-gauge percentages, **no colour states, no flashing, no oscillation**.
* Hardcore Gaming 101 - *"no description of bee item appearance, colors,
  flashing behavior, or other visual characteristics."*
* Japanese Wikipedia - count, scoring, Bee Perfect. No visual description.
* iPhone AC's location list - screenshots only; **no mention of 点滅
  (blinking), no animation states, no pre-appearance marker.**

### **THE TRAP, AND I WALKED INTO IT BEFORE CATCHING IT**

Searching for bee flicker returns confident, well-written prose about bees that
flash. **It is about other games.** I traced each claim to the page that
actually makes it:

| the claim as it surfaces | the page that ACTUALLY makes it | the game it is about |
|---|---|---|
| *"the bee item … will flash slowly between green and yellow states. Collecting it while it is yellow will cancel all on-screen bullets into score stars. Collecting it while it is green will fill the Hyper gauge slightly…"* | Shmups Wiki, **DoDonPachi DaiFukkatsu Black Label** | **DaiFukkatsu**, not DaiOuJou |
| *"Bees do not oscillate between being yellow and green **in this version**. They will still periodically flash, but they will always be yellow."* | Shmups Wiki, **DaiFukkatsu Arrange A** | **DaiFukkatsu**, not DaiOuJou |
| *"freshly revealed bees will also flash white"* | surfaced only via search summary over the DaiFukkatsu pages | **DaiFukkatsu**, not DaiOuJou |
| *"once revealed by the laser, they become a solid color"* | SaiDaiOuJou guide material | **SaiDaiOuJou**, not DaiOuJou |

**A search engine asked about "DaiOuJou bee flashing" will hand back the
DaiFukkatsu Black Label sentence with DaiOuJou's name attached to it.** It did
so to me. The tell is the payload: *"cancel all on-screen bullets into score
stars"* is a DaiFukkatsu mechanic, and that is what exposed the substitution.

> **THEREFORE, stated as plainly as the brief demands: I could not establish
> that bees flicker in DoDonPachi DaiOuJou. I also could not establish that
> they do not. The documentation is ABSENT, not negative - and absent
> documentation of a visual detail is exactly what one expects for a detail
> nobody writing a scoring guide would ever mention.** The shadow-flicker
> precedent cannot be extended to bees on this evidence, in either direction.

### WHAT WOULD CONFIRM IT IN THE ROM - and this is where the answer actually is

The web cannot settle this; the ROM can, and `59-recon-items` has already
measured the machinery that would produce a flicker. **All three of these are
already-measured facts in that recon - I am pointing at them, not adding to
them:**

1. **Every item record carries a two-byte animation countdown/reload at
   `+$0C`/`+$0D`, measured `#$202` = 2/2**, and an animation cursor at `+$0E`
   advancing `addq.w #4` masked `$F` - i.e. **a 4-frame animation stepping
   every 2 frames**. Kinds `$00`, `$04`, `$08` and `$10` each have a **4-entry**
   sprite table; kinds `$0C`/`$14` have **16**. **A 4-frame cycle at 2 frames
   per step is an 8-frame loop, and if two of those four images differ in
   brightness it will read as a pulse to a player.** *Check whether the four
   streams in each animation table are actually different images, and how
   different.* That is the single most likely authentic source of a "flicker a
   little at times" and it is measurable without a board.
2. **The even-frame shadow trick is already proven to exist in this
   cartridge.** Whether any item record is drawn through the same
   even-frames-only path is a direct check, not a guess: take the item bodies'
   emit (`jmp $23EB06`, per recon 59 §3) and see whether anything gates it on
   the frame counter (`$80390A` and its three masked copies, `$803914`, which
   the project has already ported).
3. **The collected animations are 30 frames (`$27F308`/`$380`/`$400`/`$480`)
   and the at-max one is 17 (`$27F508`)**, both pinned by the stepper's own
   bounds. A collect flash is a *different* thing from an idle flicker, and an
   observer would not distinguish them. Rule it in or out before touching
   anything.

**And the negative check that matters most, in the hitbox-marker spirit: if the
board draws an item as one unchanging image, then any flicker anywhere is ours,
and the fix is to stop doing it.** Nothing in this file licenses adding a
flicker.

### WHERE SOURCES CONFLICT

Only through the mislabelling above. **No source contradicts another about
DaiOuJou's bee appearance, because no source describes it.**

---

## 4. IS THERE A VISUAL INDICATOR, OR A DESTRUCTIBLE COVER?

### WHAT THE WEB CLAIMS: **no, and the guides' whole form is the evidence**

**No source describes a shimmer, sparkle, glint, outline, ghost image,
differently-coloured tile, or destructible object marking a bee in DaiOuJou.**

The strongest evidence here is *structural, not textual*: **the existence of the
guides.** iPhone AC's page is a screenshot-per-bee location list keyed to
scenery landmarks; the Re:Incarnation guide contributed a full-stage map with
icons drawn on. SaiDaiOuJou guidance is explicit that the player *"should
memorize each bee's location"*. **Ten memorised map coordinates and a ripped
strategy-guide map are not what a game needs if the bee's spot is visibly
marked.** That is an inference, and it is labelled as one - but it is the
consistent shape of every source I found.

**On "something destructible supposed to cover these" specifically:** the map
places the bees on a stair-walled structure, two building rooftops, and a
pale-blue wall - **background scenery, and none of it is described anywhere as
destructible.** No source mentions a breakable object, a lid, a panel or a
container over a bee in this game.

**The owner's instinct is not baseless, though - it is one game off.** Marker
panels and visible bee indicators are a *DaiFukkatsu*-era feature, which is
precisely the corpus that dominates the search results (§3).

### WHAT WOULD CONFIRM IT IN THE ROM

* **If a hidden bee had a cover, the cover would be an object with HP**, and
  destroying it would be a normal death. Check whether the ten stage-1
  candidates from §1 have a hit-point field and route through the damage path
  (`$286096`, the two-way exchange `$244FEC`/`$2450B4`), or whether they are
  inert until a laser-specific test fires.
* **The `$2453C2` mystery is directly relevant and is already on the books:**
  the laser collision block **executed ZERO times across 580 frames of a live
  beam on the board and nobody knows why** (`PLAN` §6.3, W24). If bees are
  laser-revealed, a laser-only collision path that never fires is a strong
  candidate for *where the reveal lives* - and it means a laser corpus alone
  may not reveal a bee even when it should. **Recon 1 and W24 should be told
  these two facts are probably the same fact.**
* **If a hidden bee is drawn at all before reveal, it is a display-list record
  like any other.** The 30-bucket ablation table already exists
  (`11-impl-display-list-keystone` §6); a pre-reveal marker would have to live
  in one of those buckets. **If no bucket carries anything at the ten map
  positions, there is no indicator, and that is a measurement, not an opinion.**

### WHERE SOURCES CONFLICT

None. **The absence is uniform**, which is weak evidence of absence and strong
evidence that no guide author thought a marker was worth mentioning.

---

## 5. BLACK LABEL (our target) vs. the original

### WHAT THE WEB CLAIMS

Shmups Wiki maintains a **separate Black Label page**, and its bee content is
where the version-specific material lives.

* **The hyper-gauge ladder is Black Label's, keyed to the chain:** *"collecting
  a bee item with a 20 to 39 hit chain will fill 3% of the Hyper Gauge, having a
  40 to 59 HIT chain will give 6%"* … up to *"200+ HIT chain, which fills
  30%."* Plus: *"Collecting a bee item while in Hyper Mode won't give any hyper
  gauge."*
* **The reveal itself feeds the chain:** *"Uncovering a bee item with the Laser
  will add a HIT to the current chain counter, and it will refill the chain
  gauge by 50%."*
* **Unchanged across versions, as far as any source says:** ten per stage; the
  positions; 1,000 × current HIT; the ×2 on the last bee of a no-death stage;
  +1,000 base value per subsequent stage; Bee Perfect as a loop-2 condition.
* **No source states any Black Label change to bee APPEARANCE, count, or
  position.** Version differences in the sources are entirely about the hyper
  gauge and scoring.

**One genuinely technical Black-Label-relevant find, and it is the best
technical source in the file:** a Japanese blog post (`rokulpg.blogspot.com`,
Nov 2022) documents a **bee-item scoring OVERFLOW BUG**, attributing the
analysis to **trap15** (a known Cave ROM reverse-engineer). The claim: the ×2
Bee Perfect multiplier is applied to a **BCD** value as if it were binary, so a
bee worth `8,000` is held as `$8000`, doubled to `$10000`, and reads out as
`10,000` instead of `16,000`. Stated to affect **AC, PS2 and Xbox 360
identically**, biting at base values of 6,000–9,000 (stages 2-1 … 2-4), with a
measured-loss example of ~44 % in a named hit range on stage 2-2. **Scoring is
recon 2's lane and I am not developing it - but this is the one web source that
reasons about the machine rather than the screen, and it predicts a specific,
checkable ROM behaviour.** Note it aligns with recon 59's measurement that kind
`$08`'s collect performs **three `$242AC6` BCD conversions**.

### WHAT WOULD CONFIRM IT IN THE ROM

* The chain-gauge 50 % refill on *reveal* (not on collect) is a distinct write
  from the collect path. If found, it is strong evidence that **reveal and
  collect are two separate events**, which shapes the whole subsystem.
* The 3 %→30 % ladder implies a **table or a shift keyed to the chain count** on
  the collect path. Recon 59 measured that kinds `$0C`/`$14` set the hyper
  gauge outright (`$81B642 := $95F`) - **a bee's fractional fill is a different
  arithmetic and would be a different writer.** If nothing in the six kinds'
  collect routines does fractional gauge arithmetic, that is another point
  against the bee being one of the six (§6).
* The BCD ×2 bug: look for a doubling applied to a BCD accumulator without a
  BCD-correct add.

### WHERE SOURCES CONFLICT

* `NOTES-progression.md` §3 already records the loop-2 350,000,000-point
  condition as *"reported as White Label only - so possibly NOT applicable to
  our Black Label target; verify"*. **Nothing I found this session resolves
  that**, and nothing I found contradicts the rest of that file's bee section.
* Shmups Wiki's own citation list for these pages is *"Twitter posts, blogs,
  Discord channels, and forum discussions"* - see §7.

---

## 6. AGAINST `59-recon-items`: **is any of the six ROM kinds the bee?**

The brief asks me to say whether any of recon 59's six ROM-enumerated item
kinds could be the bee. **This is the most useful thing in the file after §1,
and it is a lead, not a finding.**

Shmups Wiki's DaiOuJou item roster lists these collectables, verbatim on
effect: **Power-up** (*"Increases the player's shot and laser power"*); **Bomb**
(*"Bombs are always dropped by bomb carriers. Once a bomb item appears it will
move around the screen for a while following a predictable rectangular movement
before leaving."*); **Small Star** (500 pts); **Large Star** (5,000, from
railguns in 1-4/2-4); **Ground Star** (500); **Large Ground Star** (10,000, in
1-2/2-2); **Bee**; **Hyper** (*"When the meter is filled, a hyper item falls
from the top of the screen"*); **Max Power** (*"only appears after the player
loses their last life"*); **1UP** (hidden extend in stage 4).

Laid against recon 59 §1's six kinds - **their ROM facts are recon 59's
measurements, cited, not mine:**

| kind | recon 59 measured | roster item it matches | strength |
|---|---|---|---|
| `$00` | +1 shot level, +1 laser level | **Power-up** | exact |
| `$04` | both to max; **its caller is `$24A10E`, the PLAYER'S OWN DEATH** | **Max Power** - *"only appears after the player loses their last life"* | **exact, and this one is a real cross-check** |
| `$0C` | P1 hyper stock, `$2530BE`, cap 5 | **Hyper** | exact |
| `$14` | P2 hyper stock | **Hyper** (P2) | exact |
| `$10` | `$8130BE` += 1, **refuses at 20**, HUD draw laying out up to 5 icons a row | **1UP** - and `PLAN` W27 treats `$8130BE` as the lives word, with a 20-lives extend cap at `$28433C` | strong |
| `$08` | counts `$81040A` toward target `$81040B`; completion sets player-state bits and does three BCD conversions; **homing motion**; dropped by enemy type `$86` exactly once | **unattributed** | - |

> **THE `$04` ↔ Max Power MATCH IS THE INTERESTING PART.** Recon 59 measured,
> from the listing alone, that kind `$04`'s spawn site is the player's own death
> routine. The published roster says, from play alone, that Max Power *"only
> appears after the player loses their last life"*. **Two completely independent
> methods landed on the same fact.** That materially raises my confidence in the
> other five rows of that table - and therefore in the arithmetic below.

**THE ARITHMETIC: five of six kinds are spoken for, and SIX roster items are
not - Bomb, four kinds of Star, and the Bee.** One free slot, six claimants.

> **THEREFORE, AS A LEAD: the bee is most likely NOT a member of the
> `$816B7A..$8171B9` six-kind pool at all**, and stars almost certainly are not
> either. A hidden, statically-placed, laser-revealed, scenery-anchored object
> is a poor fit for a pool whose fill copies its position **from a dying
> object's `($2,A6)`** (recon 59 §1.2) - bees do not come from dying objects,
> they come from fixed map coordinates.

**The one candidate worth testing before discarding, and the test that kills
it:** kind `$08` is a *count toward a target with a completion bonus*, which is
the shape of "ten per stage, Bee Perfect on the last one". **But recon 59
measured its drop site as enemy type `$86`'s death, exactly once per kill** -
and *"Bombs are always dropped by bomb carriers"* plus *"predictable rectangular
movement before leaving"* fits kind `$08`'s homing/drift motion and its lifetime
timer (`$27EACE`, `move.l #$7000B00,($18,A6)`) at least as well.

**The discriminating test, and it is one read:** `$81040B` is the TARGET kind
`$08` counts toward, and **recon 59 §9.2 records that it could not find its
writer** - its only absolute sites are two reads and a HUD read. **Find
`$81040B`'s writer and read its value. If it is 10 and it is reloaded per
stage, kind `$08` is the bee. If it is a bomb-stock or set-piece number, it is
not, and the bee lives outside the pool entirely.** Recon 59 already flagged
this address as blocking; **§6 gives it a second reason to be resolved and a
concrete expected value to test against.**

**Also worth putting in front of the ROM recon:** recon 59 §2 lists **two drop
sites it could not attribute to any enemy type - `$267CAC` (passing
`$0`/`$4`/`$8`/`$C`/`$10`, behind `$23D18E` bit 6 and `$259C42`) and `$27B4A0`
(passing `$10`)** - and §9.1 estimates about an hour of listing work to close
them. If a bee is *not* in the pool, neither of these is it; if it somehow is,
`$267CAC` is where it would come from.

---

## 7. SOURCE-QUALITY RATING - explicit, because the project asked

**Overall: THIN-TO-MODERATE on mechanics, GOOD on stage-1 positions, ABSENT on
visual behaviour, and NON-EXISTENT on anything ROM-level.**

| source | what it gave | rating | why |
|---|---|---|---|
| **`DojStage1map.png`** (Shmups Wiki, from the *Re:Incarnation Strategy Guide*) | all ten stage-1 positions | **A− for positions** | a scan of a **published commercial strategy guide**; primary-ish, and the wiki page hosting it is otherwise empty |
| **iPhone AC, `daioujo8.html`** | all ten positions, in prose + screenshots; the "laser tip" mechanic | **B+** | careful fan documentation from own screenshots; **independently corroborates the map** - that agreement is what earns the grade |
| **Shmups Wiki, DaiOuJou Black Label page** | the Black Label hyper-gauge ladder, chain-on-reveal, bee scoring | **B** | version-aware and specific; but its own reference list is *"Twitter posts, blogs, Discord channels, and forum discussions"* |
| **Shmups Wiki, DaiOuJou page** | count, scoring, Bee Perfect, the item roster used in §6 | **B−** | same citation weakness; the item roster proved unexpectedly useful |
| **`rokulpg.blogspot.com` bee-overflow post, crediting trap15** | the BCD ×2 overflow bug, per-stage | **B+, and the only mechanically-reasoned source found** | attributes to a known Cave RE; makes a **falsifiable ROM claim**. Second-hand attribution - I did not find trap15's own writing |
| **Japanese Wikipedia** | count, scoring, Bee Perfect | **C+** | encyclopaedic but shallow; **says nothing about reveal or appearance** |
| **Hardcore Gaming 101** | count, laser reveal, scoring | **C+** | editorial retrospective, explicitly no external citations |
| **TASVideos thread 17578 (`xy2_`)** | the dissenting "shot-then-laser" reveal claim | **C+ / high-value dissent** | a frame-by-frame worker, so worth listening to - but **the TAS was abandoned in stage 1-1**, and the thread has **no RAM addresses and no disassembly** |

**Things that DO NOT EXIST, as far as I could find, and this is a finding:**

* **No completed TAS of DoDonPachi DaiOuJou Black Label.** The only project I
  found (TASVideos 17578, `xy2_`, FBA-RR) **stalled inside stage 1-1** and was
  abandoned over emulator limits - the author's own stated blocker was that
  *FBA lacks RAM search*, with BizHawk-plus-a-MAME-core named as the hoped-for
  successor. **There is no frame-accurate artefact to compare against.**
* **No public disassembly, RAM map, symbol list or memory-watch file for this
  game.** Not on Shmups Wiki, not on TASVideos, not on any of the Japanese
  sites. The nearest thing is the second-hand trap15 attribution above.
* **No frame-level superplay annotation** of bee reveals - replays and superplay
  videos exist in quantity, but written frame-accurate notes do not.
* **The two shmups.system11 forum threads most likely to help - "Dodonpachi
  Daioujou & Black Label No Laser Challenge" (t=41258) and "Dodonpachi
  dai-ou-jou from zero to best ending" (t=59983) - returned HTTP 403 to
  automated fetching.** The first in particular would directly bear on §2's
  laser-only question (*can a no-laser run get bees at all?*). **This is a real
  gap in my coverage and a human with a browser could close it in minutes.**
* Japanese Wikipedia (`nicovideo`大百科) returned **403** as well.

**Title forms searched**, since Japanese sources cover this game far better:
`怒首領蜂大往生`, `怒首領蜂 大往生`, `DoDonPachi DaiOuJou`, `Dodonpachi
Daioujou`, `DDPDOJ`, `ブラックレーベル` / `Black Label`, `黒版` / `白版`; and for
the subject: `蜂アイテム`, `隠し蜂`, `蜂パーフェクト`, `レーザー先端`, `出現場所`,
`点滅`, `取り逃し`. **The Japanese material is decisively better on positions;
it is exactly as silent as the English on appearance.**

---

## 8. CONFIRMATION LIST for a ROM recon

Ordered by (value ÷ cost). **Every one of these is a check on the cartridge;
not one of them is a licence to change anything.**

1. **Find ten fixed stage-1 placements and test the side sequence.** Search
   stage 1's script (`$263336` / `$2633BE`, 8-byte records) for ten entries
   sharing a type byte, and check their X coordinates read
   **`R,L,R,L,L,L,L,R,L,L`** in spawn order, with the first well after the
   stage opening. **Cheapest decisive confirmation of §1. A pass identifies the
   bee object without firing a laser.**
2. **Read `$81040B`'s writer and its value** (recon 59 §9.2's open item). **If
   it is 10 and reloaded per stage, kind `$08` is the bee; otherwise the bee is
   outside the six-kind pool.** Settles §6 in one read.
3. **THE FLICKER, part 1: are the four streams in each item animation table
   actually different images?** Tables `$27EA1A` / `$27EBCC` / `$27ED7C` /
   `$27F196`, stepping every 2 frames off `+$0C`/`+$0D` = `#$202`. **If two of
   the four differ in brightness, an authentic pulse exists and must NOT be
   removed.** Recon 59 already measured the tables; this is a pixel decode, not
   a new hunt.
4. **THE FLICKER, part 2: is any item record drawn on even frames only?** Trace
   the bodies' emit (`jmp $23EB06`) for any gate on `$80390A` / `$803914`.
   **This is the exact shape of the already-proven authentic shadow flicker**,
   and it is the one mechanism that would make the owner's report a
   non-regression.
5. **THE FLICKER, part 3: rule the collected animations in or out.** 30 frames
   (`$27F308`/`$380`/`$400`/`$480`) vs 17 at-max (`$27F508`). A collect flash
   and an idle flicker look identical to a player and are different code.
6. **Is a hidden bee DRAWN before reveal?** Check every one of the 30 display
   buckets for any record at the ten map positions before a laser touches them.
   **A clean negative is the §4 answer, in the hitbox-marker spirit: no
   indicator exists - do not add one.**
7. **Do the ten candidates have HP and route through the damage path**
   (`$286096`, `$244FEC`/`$2450B4`), or are they inert until a laser-specific
   test? **This is the direct answer to "wasn't something destructible supposed
   to cover these?"**
8. **Connect the reveal to `$2453C2`.** The laser collision block that fired
   **zero times in 580 frames of live beam** is the prime suspect for where a
   laser-only reveal lives (`PLAN` §6.3 / W24). **Recon 1 and W24 are probably
   chasing the same routine - tell them.**
9. **Look for a chain-gauge 50 % refill on REVEAL**, separate from the collect
   path (§5). Its existence proves reveal and collect are two events.
10. **Look for fractional hyper-gauge arithmetic keyed to the chain** (3 %→30 %).
    Recon 59 measured kinds `$0C`/`$14` writing `$81B642 := $95F` outright; a
    bee's fractional fill is a different writer. **Its absence from all six
    kinds' collect routines is further evidence for §6.**
11. **Close recon 59 §9.1's two unattributed drop sites** (`$267CAC`,
    `$27B4A0`) - about an hour of listing work, and it bounds what can drop in
    stage 1 at all.
12. **The trap15 BCD ×2 overflow** (§5): look for a doubling applied to a BCD
    accumulator without a BCD-correct add. Recon 2's lane; listed so it is not
    lost.

**AND THE LEDGER FACT THAT FRAMES ALL OF THE ABOVE:** `PLAN-no-recordings.md`'s
capture ledger has **no row for bees** - L12 covers *"Explosions, death
effects, items"* as a bucket-20 bulk-writer row and nothing names a bee. **Bees
have never been captured, never been tracked, and appear in no measured run
this project has made.** `PLAN` §5.6 says so outright: *"Bee behaviour before a
laser corpus reveals a bee. Nothing static was found; `NOTES-progression.md`'s
bee claims remain third-party hypotheses."* **Everything above is a lead
against a subsystem with zero measurements behind it. Weight it accordingly.**

---

## 9. WHAT I COULD NOT DETERMINE - stated the way `docs/knowledge` requires

1. **Whether bees flicker, blink, pulse or change colour in DaiOuJou.**
   *What I tried:* both languages; `点滅`, flashing, blinking, flickering,
   oscillating, colour states; the Shmups Wiki DaiOuJou and DaiOuJou Black
   Label pages, HG101, Japanese Wikipedia, iPhone AC's screenshot list, the
   TASVideos thread. **Every flicker claim I found traced back to DaiFukkatsu
   or SaiDaiOuJou (§3).** No DaiOuJou source describes bee appearance beyond a
   static icon. **ABSENT, not negative.**
2. **Whether the laser is strictly required to reveal a bee** - three
   incompatible positions in §2, and the one thread that would settle it
   ("No Laser Challenge", shmups.system11 t=41258) **returned 403**.
3. **Whether a revealed bee has a lifetime, drifts, or flashes before
   vanishing.** Japanese sources establish that a revealed bee **can be lost**
   (取り逃し is a named failure), but **none describes the visual behaviour of
   losing one.** *What I tried:* `出現後`, `消える`, `取り逃し`, `点滅`, plus
   English equivalents.
4. **Any per-bee frame timing, coordinate or ROM address, from any source.**
   No public disassembly or RAM map exists for this game (§7).
5. **Whether Black Label changed bee appearance or positions.** No source
   addresses it either way; all documented version differences are hyper-gauge
   and scoring (§5).
6. **`NOTES-progression.md` §3's open question** - whether the 350,000,000-point
   loop-2 condition is White Label only - **is exactly as open as it was.**
   Nothing this session touched it.

---

## 10. THE ONE-PARAGRAPH ANSWER TO THE OWNER'S QUESTION

Stage 1 has **ten bees, at fixed positions, and none in the opening stretch** -
so bees appearing early, or in numbers other than ten, is worth a hard look.
**"You were supposed to shoot them" is essentially right**: every source says
the laser (its tip) uncovers them, though one frame-by-frame worker insists a
shot must land first. **"Something destructible supposed to cover these" is not
supported for this game** - no source describes a breakable cover, a marker or
a shimmer; the guides all work by memorised map coordinates, and visible bee
markers are a *later* game's feature. **On the flicker I must decline to
answer from the web: no DaiOuJou source documents bee appearance at all, and
every flashing-bee description the search engines return is DaiFukkatsu's or
SaiDaiOuJou's wearing DaiOuJou's name.** The flicker question is answerable -
just not here: **every item record in this cartridge already carries a 4-frame
animation stepping every 2 frames, and this board is already proven to draw
some things on even frames only.** Check those two before concluding the
flicker is either a bug or a feature.
