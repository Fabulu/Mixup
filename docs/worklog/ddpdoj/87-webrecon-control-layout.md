# 87: WEB RECON: THE CABINET, THE BUTTONS AND THE VERSIONS

status: **DONE**, see §7 for the one-screen answer and §8 for the glossary.

started / finished: 2026-08-06
role: WEB RECON 1 of 2 on the CONTROL LAYOUT of `ddpdojblk` (2002.10.07 BLACK
VER). Recon 2 covers how the hyper behaves in play; this file covers the
physical cabinet, the button naming, the operator options, the version
differences and the ports. **READ-ONLY on the repo. No ROM was read, no MAME
was run, nothing in this file is a measurement of our port.** This file is the
only thing I write. `games/ddpdoj/src/` belongs to another agent and was not
touched.

---

## 0. THE STANDING FACTS THIS FILE WAS TOLD, AND WHETHER THE WEB AGREES

The brief handed me four ROM facts and told me the ROM outranks the web. Here is
the verdict up front, because the useful thing to know is whether anything out
there contradicts the cartridge.

| ROM fact | Web verdict |
|---|---|
| Button 1 = shot on tap, laser on hold | **Unanimously confirmed.** Every source, English and Japanese, primary and secondary. |
| Button 2 = one button, bomb when hyper stock is zero, hyper when non zero | **Unanimously confirmed, and one source states the fork in almost the ROM's own words.** §2. |
| Button 3 = auto shot, gated by an operator dip, synthesises button 1 presses | **Confirmed as to function; confirmed as an operator option; the series precedent says default OFF.** §3. |
| Nothing contradicts any of the above | **Nothing does.** Not one source found in this recon says DaiOuJou has a separate hyper button, a fourth button, or a different button 1. |

**The one trap, and it is a big one: the NEXT GAME IN THE SERIES DOES HAVE A
SEPARATE HYPER BUTTON.** `DoDonPachi DaiFukkatsu` (2008) is a **four button**
game whose **D button is a dedicated Hyper Counter**, distinct from the bomb on
B. §5.4. If anyone on this project ever "remembers" a separate hyper button, or
finds a source describing one, that is DaiFukkatsu, not DaiOuJou. This is the
exact shape of the mistake the bees recon made, so it is stated in bold before
anything else.

---

## 1. THE CABINET AND THE HARDWARE

**Claim 1.1: DaiOuJou is a JAMMA game on IGS PolyGame Master hardware, 68000
based, vertical monitor, two players alternating on one control panel.**
CONFIDENCE: **HIGH.** Sources: MAME machine record via arcadeitalia
(`adb.arcadeitalia.net/dettaglio_mame.php?game_name=ddpdoj`) giving "IGS PGM
cartridge", Motorola 68000 @ 20 MHz, Z80 @ 8.468 MHz, ICS2115, 448x224 @
59.185606 Hz rotated 270 degrees, "Up to 2 players (solo, 2 concurrents)", 2
coin slots; the eBay listing for a used board describes it as "Cave A.M.I. 2002
JAMMA"; Wikipedia's PolyGame Master article. Cave shipped it as a PGM cartridge
with a Cave customised BIOS rather than on Cave's own 68000 board.

**Why this matters for the button question:** the 68000 and the `$80xxxx` /
`$81xxxx` RAM window in the ROM facts are consistent with a PGM 68000 program,
so the addresses in the brief and the hardware the web describes are the same
machine. Nothing here is in tension.

**Claim 1.2: The control panel is one 8 way joystick and THREE buttons per
player, and three buttons is exactly what the JAMMA edge connector provides.**
CONFIDENCE: **HIGH.** Sources: the MAME record above lists "8-way Joystick" and
"Buttons: 3"; Shmups Wiki says outright "DoDonPachi DaiOuJou is a 3 buttons
game"; the JAMMA standard itself carries three action buttons per player on the
edge connector, with buttons 4 to 6 requiring a kick harness or the extra pins
(Wikipedia "Kick harness", geekpcbs JAMMA pinout guide, PrimeTime Amusements
JAMMA tech tip).

**The consequence, and it is the answer to question 2 in the brief:** button 3
needs **no** extra harness, **no** modified panel, and **no** operator wiring.
It is a stock JAMMA button on every JAMMA cabinet and every Japanese candy cab
panel (which have six button positions anyway). Whatever the dip at `$80380F`
does, it is not compensating for a missing wire.

**Claim 1.3: There is a later arcade rerelease, `DaiOuJou Tamashii` (2010),
on PGM2 hardware, released in China and Taiwan.** CONFIDENCE: **MEDIUM HIGH.**
Sources: HFS DB, LaunchBox games database, an Arcade Projects thread titled "PGM2
Dodonpachi DaiOuJou Tamashii Instruction Strip", cave-stg.com forum thread. The
documented changes are an added Easy mode with slower bullets, separate
leaderboards, changed background palette and swapped logos. **No source
describes a control change**, and the instruction strip thread itself is
evidence that Tamashii shipped with a normal arcade instruction strip.
CONFIDENCE that Tamashii's controls are unchanged: **MEDIUM** (argument from
silence, and the thread that would settle it returned HTTP 403).

**Claim 1.4: There is a third arcade variant, `DoDonPachi III` (World,
2002.05.15 Master Ver), an export prototype that sits between the original and
Black Label.** CONFIDENCE: **MEDIUM HIGH.** Sources: MAME set `ddp3`, Internet
Archive item `arcade_ddp3`, HFS DB. MAME treats `ddp3` as the parent set and
`ddpdoj` / `ddpdojblk` as clones, which is why our set names sort oddly. **No
source describes any control difference in `ddp3`.** Relevant to us only as a
warning: **if a source says "DoDonPachi III" it is talking about our game's
export sibling, not a third numbered sequel.**

---

## 2. THE OFFICIAL BUTTON LAYOUT AND NAMING

**Claim 2.1: The buttons are named A, B and C, and the canonical English
description is: A = Shot (hold for Laser), B = Bomb (or Hyper), C = Auto shot.**
CONFIDENCE: **HIGH.**

Shmups Wiki, quoted verbatim from the DaiOuJou page and repeated identically on
the Black Label page:

> **A button (Press):** Fires the player's Shot.
> **A button (Hold):** Fires the player's Laser.
> **B button (Press):** Activates a hyper or bomb.
> **C button (Press/Hold):** Autofire for the player's Shot. Due to the C button
> firing bullets for as long as it's held, lightly tapping it fires smaller
> bursts than the ones from a single tap of the A button, which can be helpful
> for chaining.

The MAME machine record gives the same thing in operator shorthand:

> `[A] Shoot, [B] Bomb, [C] Full Auto`

**Note the naming asymmetry, because it is the whole point of this recon:
the cabinet-facing name of button 2 is BOMB. "Hyper" is not a button name. It
is a state that changes what the bomb button does.** The MAME record does not
even mention the hyper; it just calls B "Bomb".

**Claim 2.2: In Japanese the official vocabulary is レバー (lever), Aボタン /
Bボタン / Cボタン, ショット (shot), レーザー (laser), ボム (bomb), スプレッドボム
(spread bomb), レーザーボム (laser bomb), ハイパー (hyper), 連射 (rensha, rapid
fire).** CONFIDENCE: **HIGH on the vocabulary, MEDIUM on the exact per button
wording.** Source: **Cave's own site**, `cave.co.jp/gameonline/daioujo/play.html`
(the プレイ方法 page reached from `cave.co.jp/gameonline/daioujo/`). This is the
publisher's own how to play page and is the closest thing to a primary source I
reached. **Caveat, stated plainly:** the page is Shift JIS from 2002 and came
back partly mojibake through the fetcher. Every term above was legible; the
sentence level mapping of term to button was not fully legible. I am not going
to pretend I read a clean copy.

**Claim 2.3: Japanese player sources call button 2 "ボムボタン" (the bomb
button) even when describing hyper activation.** CONFIDENCE: **HIGH.** The
DaiOuJou strategy wiki (`wikiwiki.jp/daioujo/`) states:

> ハイパーアイテム所持時にボムボタンを押すとハイパーモードが発動する
> ("when you are holding a hyper item, pressing the **bomb button** activates
> hyper mode")

Same phrasing appears on `iphoneac.com/daioujo.html` for the iOS version. **The
Japanese scene has no word for a "hyper button" in this game.** They say "press
the bomb button".

**Claim 2.4: An official Cave instruction card exists and is still sold as an
official reproduction, but I could not read its text.** CONFIDENCE: **HIGH that
it exists, ZERO on its contents.** Source: nin-nin-game.com item 1915,
"Reproduction plastifiée A4 de l'instruction card du jeu JAMMA 'Dodonpachi
Daiôjô'", described as "Article officiel Cave". The listing shows no legible
scan. **UNRESOLVED: nobody in this recon has read the printed instruction card.**
If someone later finds a scan and it disagrees with §2.1, the scan wins over
Shmups Wiki, but neither wins over the ROM.

---

## 3. IS BUTTON 3 STOCK, OPERATOR SELECTABLE, OR AN ADDITION?

This is the question the brief cared most about, so here it is in three separate
claims with three separate confidences, because they are genuinely different
questions and the sources support them unevenly.

**Claim 3.1: Button 3 is PHYSICALLY STOCK. It is a normal JAMMA button 3, on
every cabinet, requiring nothing special from the operator.** CONFIDENCE:
**HIGH.** See §1.2. Everyone who lists the game lists it as a 3 button game.
There is no cabinet variant, no special panel, no bootleg add on button.

**Claim 3.2: The FUNCTION is an operator option, not something the player or
the game turns on.** CONFIDENCE: **HIGH**, and this is the claim that directly
corroborates the ROM's dip at `$80380F`. The Wikipedia text that circulated for
years and is preserved on mirrors (en-academic.com entry 2422745, and quoted by
BoardGameGeek's DaiOuJou entry) reads:

> "There is also an option to enable button 3, which automatically fires only
> the standard shots, otherwise known as 'auto(matic) fire'."

Note the wording: **an option to ENABLE it.** That is an operator setting being
described, and it matches a dip byte gating a held bit exactly.

**Claim 3.3: On the series precedent, auto shot is OFF by default and the
operator switches it on in service mode.** CONFIDENCE: **MEDIUM HIGH for the
series, MEDIUM for DaiOuJou specifically.** Shmups Wiki's `DoDonPachi` (1997)
page describes the same C button and adds explicitly that it is

> "turned off by default, and can be enabled in the dipswitches in service mode."

Shmups Wiki does **not** repeat that sentence on the DaiOuJou page or on the
Ketsui page; both just describe the C button as autofire with no note about
defaults. So the "default off" part is **inferred from the sibling game plus the
"option to enable" wording**, not directly attested for DaiOuJou. **UNRESOLVED
and worth a ROM answer:** what value does `$80380F` hold after a settings reset,
and what does the DaiOuJou test menu call this option. **The ROM can settle this
in ten minutes and the web cannot settle it at all.** I am flagging it rather
than guessing.

**Claim 3.4: Regional or operator variation in whether button 3 is present.**
CONFIDENCE: **LOW, and I am reporting an absence.** I found no source describing
any region shipping DaiOuJou with a different button count, and no source
describing an operator adding or removing button 3 physically. The variation is
in the dip, not in the hardware. Two search passes specifically for this turned
up nothing, which for a game this heavily documented is weak evidence that there
is nothing to find.

**Claim 3.5: Emulator front ends have historically got button 3 wrong, which
is where some of the confusion in the wild comes from.** CONFIDENCE: **HIGH.**
Source: FinalBurn Neo issue #32, "Dodonpachi Daioujou (ddpdoj) and Ketsui (ket)
Missing Rapid Shot Button", reporting that MAME exposes the third rapid shot
button for these games and FBNeo at the time did not. **If a player's only
exposure to DaiOuJou was an emulator build with the button missing, they would
correctly report a two button game.** That is a real source of contradictory
recollection and it does not mean the cabinet had two buttons.

---

## 4. BLACK LABEL VERSUS THE 2002.04.05 MASTER VER

**Claim 4.1: Black Label changes a great deal, and controls are NOT among the
changes. Button assignment is identical.** CONFIDENCE: **HIGH.** This is the
single most important negative result in this file for our port, because we
target Version B.

Evidence, strongest first:

1. **Cave's own Black Label page** (`cave.co.jp/gameonline/daioujo/dai_black.html`)
   lists the differences: version selectable at power on
   ("1ゲームの最初に、通常バージョンとブラックレーベルバージョンの選択が可能"),
   loop selection at game start, revised second loop enemy placement and
   extend/no bomb conditions. **It says nothing about controls, buttons, ボム or
   ハイパー activation.** A publisher listing its own changes and not listing a
   control change is meaningful.
2. **Shmups Wiki maintains SEPARATE pages** for DaiOuJou and DaiOuJou Black
   Label, and the controls section on the Black Label page is **word for word
   identical** to the one on the base page, including the C button paragraph.
   Two independently maintained pages, one control table.
3. **Hardcore Gaming 101's DaiOuJou article** lists the Black Label changes
   (loop selection up front, lives and bombs retained into loop two, continues
   in loop two, hyper gauge fill rate corrected, loop one easier and loop two
   harder, hit counter beyond 9999, chain slightly less strict) and **lists no
   control change.**

**Claim 4.2: Black Label changes how FAST the hyper gauge fills, not how the
hyper is TRIGGERED.** CONFIDENCE: **MEDIUM HIGH**, and this belongs to Recon 2,
so I state it once and stop. Shmups Wiki Black Label: "The Hyper Meter fills
faster than in the original." HG101: the fill rate was "corrected", the original
having wasted overflow percentage. **Nobody says the trigger moved.** The
bomb/hyper fork on button 2 is the same in both labels.

**Claim 4.3: The Black Label cabinet lets the operator or player pick the
version at power on, so one physical cabinet runs both.** CONFIDENCE: **HIGH.**
Cave's page (quoted above) and Wikipedia both say so. **Implication for us:** a
source describing "the DaiOuJou cabinet" could be describing either label
running on the same board, which is another reason no control difference ever
shows up. The panel cannot change between labels.

---

## 5. THE CONSOLE AND LATER PORTS

**The headline: I found NO version of DaiOuJou, arcade or home, that splits the
bomb and the hyper onto separate buttons.** Every port keeps the fork. The
owner's memory that "the bomb button was the hyper" is **correct for every
version I could document**, which is a pleasant change from the bees.

**Claim 5.1: PlayStation 2 (Arika, 2003-04-10): three inputs, fully
remappable, hyper still on the bomb button.** CONFIDENCE: **MEDIUM HIGH.**
Source: the 1cclog playthrough log for the PS2 version, which is a player
account but a specific and recent one:

> "there's a button for shot, another for auto shot and a third one for bomb,
> all fully configurable"

and on the fork:

> "pressing the bomb button activates your hyper stock instead of triggering a
> bomb"

Note that "fully configurable" here means **which pad button carries which of
the three functions**, not that a fourth function exists. That distinction is
the one that would mislead a careless reader. The PS2 release also adds
Simulation Mode and the Death Label boss rush (HG101), neither of which is a
control change.

**Claim 5.2: Xbox 360 `DoDonPachi DaiOuJou Black Label EXTRA` (2009-02-19):
three inputs, hyper still on the bomb button.** CONFIDENCE: **MEDIUM HIGH.**
Source: 1cclog's 360 log, "three inputs: shot, rapid shot and bomb", and on the
hyper, once you have collected up to five hyper medals you "press bomb to enter
hyper mode". The 360 release adds White Label, Black Label and an X Mode arrange
with a new Element Doll (HG101), plus unlockable configuration switches for
things like bullet cancelling and continues. **None of the added switches is a
button split.**

**Claim 5.3: iOS `DoDonPachi Blissful Death` (2012-02-09): THIS ONE DOES
CHANGE THE CONTROLS, but not in the bomb/hyper direction.** CONFIDENCE:
**MEDIUM HIGH.** Sources: 148Apps and Destructoid reviews, plus
`iphoneac.com/daioujo.html`. The ship is dragged with a finger, and the panel
becomes: a rapid fire button, a plain shot button that lasers when held, and a
bomb button, with an options page (BUTTON LAYOUT, page 2) toggling whether shots
auto fire, whether the shot button is shown at all, and an **auto bomb** option.
`iphoneac` additionally describes a shot/laser **switching** button and a double
tap to switch weapons without interrupting movement.

**So the iOS port is the one version that genuinely re-specifies the tap/hold
relationship of button 1** (a toggle instead of, or alongside, a hold), and it
adds an auto bomb assist that the cabinet does not have. **It still keeps the
hyper on the bomb button**: "ハイパーゲージが溜まったらボムボタンでハイパー発動".
If the owner played the iOS version, this is the one whose feel differs, and the
difference is in button 1, not button 2.

**Claim 5.4: THE CONFLATION WARNING: `DoDonPachi DaiFukkatsu` (2008) IS a four
button game with a dedicated hyper button.** CONFIDENCE: **HIGH.** Shmups Wiki's
DaiFukkatsu page:

> "With the exception of Ver 1.51 and Arrange B, DoDonPachi DaiFukkatsu is a
> four-button shooting game."
> **A (Press):** standard shots. **A (Hold):** the traditional DonPachi laser.
> **B:** Bomb (or shot mode switch depending on style). **C:** Auto-Fire for the
> standard A shot. **D:** "Activates the ship's Hyper Counter"

This is a **different game**, two titles later, on different hardware (SH-3, not
PGM). **It is the only DoDonPachi where "the hyper button" is a real object.**
Any source, memory or LLM answer that gives DaiOuJou a separate hyper button has
almost certainly imported it from here. I found one Japanese search snippet
during this recon that did exactly that: it described "8方向レバーと4つのボタン
… ショット、ボム、ショット連射、ハイパーカウンター" while apparently answering
about 大往生. That text is the Japanese Wikipedia description of **大復活**, and
the word ハイパーカウンター is the giveaway, because that term is DaiFukkatsu's,
not DaiOuJou's. **Flagged loudly because it is the exact failure mode this
project has already paid for once.**

**Claim 5.5: Switch / PS4 `DoDonPachi DaiOuJou Re:Incarnation` (M2
ShotTriggers, 2023-12-07) keeps the arcade layout, offers button remapping, and
adds arrange modes that REMOVE controls rather than add them.** CONFIDENCE:
**MEDIUM.** Sources: m2stg.com/daioujou feature page, 4Gamer's mode reveal
article, Japanese search summaries mentioning ボタン割り当ての変更 (button
assignment change). The arrange modes are the interesting part and none of them
splits bomb and hyper:
- **Arrange S** is effectively a **one button** mode. Bee items do not appear,
  so laser and bomb are unavailable and the permanently powered normal shot is
  all you have. 4Gamer quotes the designer on the "プリミティブなゲームデザイン".
- **Arrange L** is laser centric with a 転生ゲージ, faster hyper gain and auto
  recovery (automatic bomb or hyper on being hit).
- **Arrange EX** starts at loop two difficulty with triple hyper gain and
  automatic hyper item collection.
- **SUPER EASY** auto fires the hyper or bomb when you would be hit
  ("被弾時にミスせずハイパーやボムを自動で発動する").
- The original White, Black Label and DoDonPachi III arcade versions are all
  included.

**Note that SUPER EASY and Arrange L both describe the assist as "ハイパーやボム"
(hyper OR bomb), phrased as one action with two outcomes.** Even M2's marketing
copy, twenty one years later, treats it as one thing with a fork. That is the
same shape as `$249866 beq`.

---

## 6. WHAT WOULD CONTRADICT THE ROM, AND WHETHER ANYTHING DOES

**Nothing found in this recon contradicts the four ROM facts in the brief.**
Stated explicitly because the brief asked for it:

- **No source** says button 2 is bomb only, with the hyper elsewhere. The
  closest is the MAME record's terse `[B] Bomb`, which is an omission, not a
  contradiction.
- **No source** says DaiOuJou has four buttons. The four button claim exists in
  the wild but belongs to DaiFukkatsu. §5.4.
- **No source** says button 3 is a weapon, a bomb, or anything other than auto
  shot for the normal shot. Shmups Wiki's remark that tapping C gives **smaller
  bursts than one tap of A** is an independent behavioural fingerprint of the
  ROM's `bchg` divider synthesising edges, and it is a nicer corroboration than
  I expected to find.
- **The strongest single corroboration of the fork** is the long lived Wikipedia
  sentence: "Pressing button 2 activates a hyper if one is available, or uses a
  bomb if no hypers are in stock." That is `$249864` read, `$249866 beq`,
  `$2498E2` bomb arm, `$249868` hyper arm, written in English by someone who had
  never seen the code.

**One process note, recorded because it affected the recon.** The fetch of
`tcrf.net/DoDonPachi_DaiOuJou_(Arcade)` returned what the fetcher identified as
a prompt injection payload rather than page content, and it was discarded
unread and unused. **No content from TCRF appears anywhere in this file**, and
no instruction from any fetched page was followed. If someone wants TCRF's
version differences page, it needs a different retrieval route and a human
looking at it.

---

## 7. THE ANSWER, ON ONE SCREEN

1. **Official layout: 8 way joystick and three buttons, named A, B, C.**
   A = Shot, held = Laser. B = Bomb, which becomes Hyper when hyper stock is
   non zero. C = auto shot for the normal shot only. Cabinet-facing naming calls
   button 2 the **BOMB** button in both English and Japanese; **"hyper" is never
   a button name in DaiOuJou.** HIGH confidence.
2. **Button 3 is physically stock** (plain JAMMA button 3, no harness, every
   cabinet has it) **but its FUNCTION is an operator dip**, which is exactly
   what `$80380F` is. Series precedent (DoDonPachi 1997, Shmups Wiki) says the
   default is OFF and the operator enables it in service mode; that default is
   **inferred, not attested for DaiOuJou**, and the ROM should settle it.
3. **Black Label does NOT differ in controls.** Cave's own change list, Shmups
   Wiki's separately maintained Black Label page and HG101's difference list all
   describe mechanical and difficulty changes with **no control change**. The
   hyper meter fills faster; the trigger did not move. HIGH confidence.
4. **No port splits bomb and hyper.** PS2, Xbox 360, iOS and the 2023 M2 release
   all keep one button with the fork; "fully configurable" in the PS2 and 360
   ports means remapping three functions onto pad buttons, not gaining a fourth.
   The **iOS** port is the only one that changes anything structural, and it
   changes **button 1** (a shot/laser switch and a double tap, plus auto shot
   and auto bomb assists), not button 2. **The four button game with a dedicated
   hyper button is DaiFukkatsu, a different title.**
5. **Glossary: §8.**

---

## 8. THE GLOSSARY, BECAUSE LOOSE NAMING HAS ALREADY COST THIS PROJECT A WAVE

Terms are grouped by how safe they are to use in our worklogs.

### 8.1 Safe and precise, use these

- **SHOT** (ショット). The tapped normal weapon on button 1. Wide, weak. In our
  port this is what button 3 synthesises edges for.
- **LASER** (レーザー). The held weapon on the same button 1. Narrow, strong,
  slows the ship. **Shot and laser are one button in DaiOuJou.** Never say
  "the laser button".
- **BOMB** (ボム). The consumable on button 2, taken when hyper stock is zero.
  It has **two forms**: **SPREAD BOMB** (スプレッドボム) when shooting, and
  **LASER BOMB** (レーザーボム) when the laser is held, that is A+B. Both names
  are Cave's own, from `play.html`. Say which one you mean.
- **HYPER** (ハイパー). The timed power state on button 2, taken when hyper
  stock is non zero. **In DaiOuJou "hyper" is a STATE, not a button and not an
  item.** Sub terms that are worth keeping distinct, because three of them get
  called "the hyper" in casual writing:
  - **HYPER GAUGE / HYPER METER** (ハイパーゲージ): the bar that fills from
    damage dealt. Fills **faster in Black Label**.
  - **HYPER ITEM** (ハイパーアイテム), also called a **hyper medal** in English
    player writing: the pickup that spawns when the gauge fills.
  - **HYPER STOCK**: how many hyper items you are carrying. This is the counter
    the ROM reads at `$81B65C` / `$81B65E`, and **it is the thing that decides
    the fork.** When we mean the counter, say "hyper stock", not "hyper".
  - **HYPER MODE**: the active state after pressing B with stock in hand.
- **AUTO SHOT** / **AUTOFIRE** / **連射 (rensha)**. Button 3. All three names
  are attested: MAME says "Full Auto", Shmups Wiki says "Autofire", Cave's page
  and Japanese players say 連射. Any of these is fine and they all mean the same
  thing. **They never mean a bomb, a hyper, or the laser.**

### 8.2 Ambiguous, define it at first use or do not use it

- **"SUPER".** **This is not a DaiOuJou term.** No primary source, no Shmups
  Wiki page, no Cave page and no Japanese source found in this recon calls
  anything in DaiOuJou a "super". Our own worklogs invented it, most likely by
  analogy with fighting games. **Recommendation: retire "the super" from this
  project's vocabulary entirely and write "hyper" (state) or "hyper stock"
  (counter).** CONFIDENCE that "super" has no official meaning here: **HIGH**,
  and it is an absence across every source consulted, which for a term this
  common would be very hard to miss.
- **"TURBO".** Console pad and controller hardware terminology (turbo buttons on
  third party pads). It is not arcade DaiOuJou terminology. If someone means the
  C button, say auto shot.
- **"RAPID" / "RAPID SHOT".** Used by MAME people and by FBNeo issue #32 to mean
  the C button. Acceptable, means auto shot, but "auto shot" is clearer against
  the ROM's `$2497AA`.
- **"BOMB BUTTON".** Correct and official as the **name of the physical
  button**, and it is what Japanese players say even when they mean hyper
  activation. **Ambiguous when used to mean the ACTION**, because pressing it
  with stock in hand does not bomb. **Recommendation: "button 2" or "the
  bomb/hyper button" for the input; "bomb" or "hyper" for the outcome.**

### 8.3 Belongs to another game, never use for DaiOuJou

- **"HYPER COUNTER"** (ハイパーカウンター) and **"HYPER CANCEL"**: DaiFukkatsu
  (2008). DaiFukkatsu's hyper is on its own **D button**.
- **"KAKUSEI"** (覚醒): Espgaluda. A different mechanic in a different game that
  gets loosely called a hyper by English players.
- **Destructible cover concealing bees**: DonPachi (1995). Already established
  in worklog 70 and repeated here only so the list of known conflations lives in
  one place.

---

## 9. SOURCES

**Primary or publisher.**
- Cave official site, DaiOuJou index, プレイ方法 (`play.html`) and Black Label
  page (`dai_black.html`), `cave.co.jp/gameonline/daioujo/`. Shift JIS, partly
  mojibake through the fetcher; used for vocabulary and for Cave's own Black
  Label change list.
- M2 ShotTriggers `Re:Incarnation` feature page, `m2stg.com/daioujou/feature.php`.
- Nin-Nin-Game official Cave instruction card reproduction listing (existence
  only, no legible scan).

**Reference and database.**
- Shmups Wiki: `DoDonPachi_DaiOuJou`, `DoDonPachi_DaiOuJou_Black_Label`,
  `DoDonPachi`, `Ketsui:_Kizuna_Jigoku_Tachi`, `DoDonPachi_DaiFukkatsu`.
- MAME machine record via arcadeitalia, `ddpdoj`, and MAME set names `ddp3`,
  `ddpdoja`, `ddpdojblk`.
- Wikipedia `DoDonPachi_DaiOuJou`, `Kick harness`, `PolyGame Master`; and the
  older Wikipedia text preserved at en-academic.com entry 2422745 and quoted by
  BoardGameGeek, which carries the button 2 fork sentence and the button 3
  "option to enable" sentence.
- Hardcore Gaming 101, `dodonpachi-daioujou`.
- JAMMA pinout references: geekpcbs.au JAMMA guide, PrimeTime Amusements.

**Player accounts and press, treated as memory tier.**
- 1cclog.blogspot.com logs for the PS2 (2022-03) and Xbox 360 Black Label Extra
  (2022-10) versions.
- wikiwiki.jp/daioujo strategy wiki, 初心者向け攻略.
- iphoneac.com/daioujo.html (iOS version controls).
- 4Gamer 2023-11-22 Re:Incarnation mode reveal.
- 148Apps and Destructoid reviews of Blissful Death (iOS).
- FinalBurn Neo issue #32 (emulator button 3 omission).

**Retrieved and discarded.**
- `tcrf.net/DoDonPachi_DaiOuJou_(Arcade)`: fetch returned a prompt injection
  payload instead of article content. **Discarded, unused, no instruction from
  it followed.** Its version difference data remains unread by this recon.
- `arcade-projects.com` Tamashii instruction strip thread and the GameFAQs PS2
  FAQ: both HTTP 403. Unread.

---

## 10. WHAT IS STILL OPEN

1. **The default state of the `$80380F` auto shot dip in DaiOuJou specifically,
   and what the test menu calls it.** The web cannot answer this. The ROM and a
   MAME service menu can. §3.3.
2. **The printed instruction card text.** No scan located. §2.4.
3. **Whether Tamashii (PGM2, 2010) changed anything about controls.** Argument
   from silence only. §1.3.
4. **Whether the C button suppression term in `$2497AA` corresponds to any
   documented player-visible behaviour.** Shmups Wiki's "tapping C gives smaller
   bursts than one tap of A" is suggestive but is not a description of a
   suppression. Recon 2 or a ROM pass owns this.
