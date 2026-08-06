# 88 - WEB RECON: what the HYPER actually is, and how it behaves in play

status: IN PROGRESS

RECON 2 of 2 on the hyper. Recon 1 has the cabinet and the button layout; this
file has the mechanic. **Web recon. No code was modified. Nothing ROM derived is
committed.**

Governing note: `20-OWNER-scoring-must-be-exact.md`. The hyper is the rank
input, so every number below is either tagged with a confidence and a source, or
handed to §8 as something the implementer must measure rather than trust.

---

## 0. THE ONE PAGE

| question | answer | confidence |
|---|---|---|
| what it does | replaces the shot routine with a stronger one, cancels every bullet on screen at 46 pts each on the button press, gives brief invulnerability, doubles the per hit score, repeats the kill chain machine once per level, refills a *running* chain meter to the cap, and raises rank for its whole duration | **HIGH**, ROM and web agree line for line |
| how it is obtained | one 2,400 unit meter fed by kills, by holding the laser on durable targets, by bee pickups at 20+ HIT, and by dying; at full it drops an item; collecting the item raises stock by 1, cap 5 | **HIGH** |
| laser interaction | **NOT** the bomb's fork. One hyper shot routine replaces the whole weapon table. The real interaction is that holding the laser accrues hyper gauge **12x faster while a hyper is up** | **HIGH** on the shape, **MEDIUM** on what is inside the substitute routine |
| rank cost | activation does `$81B646 += stock`, capped at 35, and rank adds `16 x $81B646` **only while a hyper is active**. So one level costs +16 rank for the hyper's duration, and the accumulator persists so the *next* hyper is worse | **HIGH**, ROM measured, and the Japanese wiki says the same thing in words |
| hyper vs super | the game, the community and every source say **hyper**. "Super" is this project's own word, inherited from one owner quote | **HIGH** |
| Black Label | gauge fills much faster, overflow now carries, hyper damage multiplier roughly doubled to tripled, base rank ceiling and floor both lowered, button became edge triggered | **MEDIUM to HIGH**, see §6 |

**And the version guarantee, which makes this recon usable at all.** `00-recon-hard`
§ and `00-recon-memmap` established that VERSION-A lives at `$1xxxxx` and
VERSION-B at `$2xxxxx` as **two separate code images in one program ROM**, not
one image behind a flag. Every hyper address this project has measured
(`$249868`, `$2530CA`, `$285A12`, `$287682`, `$2608D2`, `$243D14`, `$2867B4`) is
`$2xxxxx`. **They are Black Label code by construction.** A web claim about the
original can therefore be checked against the `$1xxxxx` mirror of the same
routine, which is a cheap and decisive test nobody has run yet.

---

## 1. WHAT ACTIVATING A HYPER ACTUALLY DOES

Confirmed mechanics first, folklore at the end of the section.

### 1.1 It cancels every bullet on screen, and the mode depends on the level

**[CONFIRMED, HIGH]** [Black, `$2xxxxx`] The button arm at `$2498BC` calls
`$243D14` (P1) / `$243D5A` (P2), which are **walk** entries of the 14 entry
screen clear table, so they branch to `$244074` and sweep 210 bullet slots,
scoring `$46`, which is **46** in packed BCD, per erased bullet, straight into
pending score with no chain machine involved (`38-recon` §1.4 [CITED]). The bomb's own
entry `$243DA0` arms and returns without walking. **The hyper is the weapon that
actually erases the screen; the bomb only arms a flag.**

**[CONFIRMED, HIGH] The cancel MODE is indexed by the hyper level.**
`$249890 move.w (A3,D1.w),$81B412` with A3 = `$255326`/`$255330` indexed by
**(stock − 1) x 2** (`38-recon` §1.4 [CITED]).

The Japanese DaiOuJou wiki says exactly this in play terms:

> 「ハイパー使用直後、画面上の弾が消え」 and
> 「ハイパーアイテムが２個以上で画面上の弾が星アイテムに変わる。」
> ("immediately after using a hyper, the bullets on screen vanish"; "with 2 or
> more hyper items, the bullets on screen turn into star items")

That is a level indexed table in the ROM and a level threshold in the wiki, and
they are the same fact seen from two sides. **This is the strongest ROM to web
convergence in this recon.** Source: wikiwiki.jp DaiOuJou 基礎知識. Confidence
**HIGH** for "activation cancels", **HIGH** for "the mode is level indexed",
**MEDIUM** for "the level 2 threshold is exactly where erase becomes stars"
(the ROM table `$255326` has not been read; §8 item 1).

**The Shmups Wiki contradicts this and is probably describing the other cancel.**
It says bullets vanish "at the very moment the hyper gauge is filled", which is a
different event: `$2876BE`, where the item meter completes **while a hyper is
already up**, banks the grant into `$81B6E0` and arms a cancel through
`$2876E4 move.w ($25531C,D0),$81B410`. **Both cancels are real and they are
different events.** Do not implement only one.

### 1.2 It substitutes a different shot builder, it does not buff the existing one

**[CONFIRMED, HIGH]** [Black] `$25272A tst.w $81B63E / beq $252738` then
`$252732 lea $28C4FC,A0` overwrites the weapon table entry that
`$81043E` selected (`38-recon` §2.3 [CITED]). Web agrees at the play level:
Shmups Wiki, "amplifies the powers of both normal fire and the laser"; HG101,
"very wide and powerful Shot and Laser weapons".

**The multiplier, and it is version tagged and level tagged.** From the Japanese
comparison article 「黒往生と白往生の違いについて」:

| | White, loop 1 / loop 2 | **Black, loop 1 / loop 2** |
|---|---|---|
| 1 hyper | x1.1 / x1.1 | **x1.5 / x2.0** |
| 5 hypers | x1.5 / x1.5 | **x3.5 / x6.0** |

> 「1周目では0.5倍ずつ、2周目では1倍ずつ上がっていきます」
> (loop 1 rises by 0.5x per level, loop 2 by 1.0x per level)

Confidence **MEDIUM to HIGH**: single source, but it is a dedicated version
comparison article by a scoring player, it is internally consistent, and the
linear per level shape matches the ROM's "effect proportional to the level".
**Not verified against the ROM.** §8 item 2.

### 1.3 Invulnerability, and it is short

**[CONFIRMED, HIGH]** [version not distinguished by the sources, both wikis
state it flatly] 80 frames during stages, 120 frames during bosses. Shmups
Wiki and the Japanese wiki agree verbatim:
「道中80F、ボス120F(バグにより2P側はボスでも80F)無敵」. **The 2P side is stuck at
80 frames even on bosses, and both sources call it a bug.** A port that gives
2P 120 frames is more correct than the ROM and therefore wrong.

Confidence on the numbers **HIGH**; confidence that they are unchanged in Black
**MEDIUM**, nobody says either way. §8 item 3.

### 1.4 Duration: the web and our ROM listing disagree, and it is UNRESOLVED

**[UNRESOLVED, and it matters]**

* HG101: duration "depends on the number of Hyper Medals the player held before
  entering".
* Our own listing read (`38-recon` §2.2 [CITED]): the gauge `$81B642` is set to
  `$95F` (2,399) at the **grant** (`$2530D0`), not at activation, and drains
  `subq.w #$2` per frame at `$285AEA`, which is 1,200 frames, about 20.3 s.
  Nothing in the transcribed block re arms it on activation, and nothing scales
  it by level.

Those cannot both be right. Two things keep it open: `38-recon` §"gaps" states
the operand census found **5 absolute sites for `$81B642` and only 4 were read**,
and the drain is gated by `$285AD4 btst #6,$8130F8`, whose duty cycle is unknown.
**The unread site is the obvious place for a level scaled duration to live.**

**Do not encode a duration from this file.** §8 item 4. If the ROM really does
give a flat 20 s hyper regardless of level, that is a surprising and publishable
finding and the web is simply wrong; if the unread site scales it, HG101 is
right. One write tap on `$81B642` in a run that hypers settles it.

### 1.5 Score and chain effects

**[CONFIRMED, HIGH]** [Black] Three separate mechanisms, all already read out of
build B in `38-recon` §4.3 [CITED]:

1. **Per hit:** `$2860E4 moveq #1,D0 / add.w $81B63E,D0`. One point normally,
   **two while hypering**. Note `$81B63E` is the 0/1 active flag, not the level,
   so this does not scale with level.
2. **Per kill:** `$28615E`'s repeat loop re enters the chain machine `$81B654`
   times, that is **once per hyper level**.
3. **The chain window:** `$285A4C` refills the chain meter to the cap
   `$81B5B2` on activation, **but only if the meter was already non zero**.
   Using a hyper rescues a running chain; it does not start one.

Web corroboration, HG101: "the player's hit count will increase very rapidly (as
does a player's score)". Superplay commentary corroborates the *use* of this:
players point blank the hyper laser into the stage 2 hidden midboss's laser pods
and sit between the stage 3 laser cannons with a hyper up specifically to farm
hit count. **The hyper is a scoring tool first and a defensive tool second.**

**And one anti mechanic that a port will otherwise invent.** `38-recon` §4.4
[CITED] establishes that the "hyper throttles the chain drain" reading is wrong:
every absolute write to the sub tick reload `$81B64F` writes zero, so
`$284636 subq.w #1,$81B5C0` runs every frame regardless. **No web source claims
a slower drain either.** Web and ROM agree by silence and by census. Do not
implement "the hyper halves the drain".

### 1.6 Rank goes UP for the duration, and that is a visible in play effect

**[CONFIRMED, HIGH]** See §4. In play terms, HG101: "the speed and quantity of
enemy bullets will increase dramatically while Hyper Mode is active". The
Japanese wiki: 「ハイパー中はランクが上昇する。」 This is not a side effect, it is
the trade the whole system is built on.

### 1.7 How it ends

**[CONFIRMED, HIGH]** [Black] Four callers of `$285AF2` plus the gauge borrow
(`38-recon` §2.3 [CITED]): a bomb pressed during it (`$249970`), the player dying
(`$24A000`), a boss/flow event (`$29020A`), the internal player state exit
(`$285AA6`), and the timer expiring. HG101 lists three of the five in play terms:
"a player gets hit, uses a bomb, or lets the Hyper Mode timer run out". **The
rank consequences of the five endings are NOT the same; see §4.3.**

### 1.8 Folklore, separated out

| claim | verdict |
|---|---|
| "activating a hyper cancels bullets" | **TRUE** (§1.1). Shmups Wiki's phrasing makes it sound like only the gauge fill cancels; both do |
| "Shotia cancels bullets with her hyper shot, Leinyan with her hyper laser, Exy with both but needs two hyper items" (Fandom) | **ALMOST CERTAINLY WRONG FOR DaiOuJou.** That is the **DaiFukkatsu** doll/hyper system, imported by a wiki that conflated the two games. Shmups Wiki explicitly does not differentiate hyper behaviour by doll, and our ROM substitutes ONE shot routine regardless. Treat as refuted unless `$28C4FC` says otherwise |
| "the hyper meter fills to level 10" | **WRONG GAME.** That is SaiDaiOuJou's hyper. DaiOuJou caps at 5 |
| "hypers make you invincible for their whole duration" | **WRONG.** Invulnerability is 80/120 frames at activation only. The bomb is the weapon with full duration invulnerability |
| "dying reduces rank twice as much as a bomb" (forum) | **APPROXIMATELY, AND BY A DIFFERENT LAW.** ROM: bomb is a subtract of 3, death is a shift right by 2. Equal at accumulator 8, wildly different elsewhere. §4.3 |

---

## 2. HOW A HYPER IS OBTAINED

**Our chain (gauge to item to stock) is CORRECT and slightly incomplete.**
The full chain, with web and ROM agreeing at every link:

```
kills / laser hold / bee pickup / death
      -> the ITEM METER $81B64A, 2,400 units = 100%
      -> exceeds $95F (2,399)  ->  $287682
      -> a kind $C ITEM falls from the top of the screen ($27E912)
      -> the player collects it  ->  $2530CA addq.w #1,$81B65C   (STOCK +1)
      -> button 2 with stock > 0 -> $249868 -> the hyper
```

**The 2,400 unit reading is arithmetically confirmed and is worth stating.**
`73-recon-bees-rom` [CITED] measured `$27FBD8 addi.w #$48,D0` as one 3 % bee
step. `$48` = 72, and 72 x 100/3 = 2,400. The threshold is `$95F` = 2,399, that
is "must exceed 2,399". **So 1 % of the hyper gauge is exactly 24 units.** Every
web percentage in this file can be converted to a ROM constant with that factor,
which is how §8 asks the implementer to check them.

### 2.1 Every source of gauge

| source | web claim | version | ROM cross check | confidence |
|---|---|---|---|---|
| killing enemies | shot kills give more than laser kills (Shmups Wiki) | both | `$2866C4`, `$28679E`, `$2867C8`, `$2867DE` all `add` into `$81B64A` (`73-recon` [CITED]) | HIGH |
| **chain meter reaching MAX** | "completing the combo timer to its maximum will increase the Hyper Gauge, with higher chains awarding more meter" (HG101); 「コンボゲージがMAX」(JP wiki) | both | `$2866CA`, the chain meter **cap clamp tail**, is one of `$287682`'s six callers (`37-recon` §4.4 [CITED]) | HIGH |
| **holding the laser on durable targets** | "using the laser on big enemies and bosses gives even more hyper by pointblanking" (Shmups Wiki) | both | `$2867B4`: 4 units per 8 frames, **48 per 8 frames while a hyper is up** (`37-recon` §4.4 [CITED]) | HIGH |
| bee at 20+ HIT | 3 % at 20 to 39 HIT, 6 % at 40 to 59, up to 30 % at 200+ | **Black** (the JP and Shmups Wiki tables are both given under Black) | EXACT: `$48` per step, clamp at BCD 200, floor at 20 (`73-recon` [CITED]) | **HIGHEST in this file** |
| **dying** | 25 % (Shmups Wiki) vs **30 %** (HG101) | unclear | **not read.** 25 % = `$258`, 30 % = `$2D0` | **LOW, conflicting.** §8 item 5 |

**No other source exists in any consulted material.** Specifically: there is **no**
chain milestone hyper, **no** score threshold hyper, and **no** extend linked
hyper. The bee is not a separate source, it is one of the meter's feeds.

### 2.2 Stock, and where the cap of 5 lives

**[CONFIRMED, HIGH]** Web: "A player can hold up to 5 hyper items at any one
time" (Shmups Wiki). ROM: the counter `$2530CA` is **uncapped**; the cap is a
**refusal** in the grantor, `$28768C cmpi.w #$5,$81B65C / beq $287678`, which
pins the meter rather than clamping the stock, plus a second refusal at 4 pending
grants (`38-recon` §2.4 [CITED]). **A port that writes `min(stock+1,5)` at the
allocator implements a different game.** Note this squarely, because
`src/items.js` is where the port currently refuses the hyper item kinds outright.

**Items that would drop during a hyper are banked, not lost.** `$2876BE` routes
the grant to `$81B6E0` (cap 4) while `$81B63E` is up, and `$2875B4` flushes them
by spawning that many items at the end of every hyper (`$285B2A jmp`). The
Japanese wiki states the play side: the item cannot drop during an active hyper.

The Shmups Wiki adds one thing our ROM read has not covered: **"Using a hyper
while there is an uncollected hyper item will transform it into a large star
(which gives 10,000 points)."** [tagged Black on that page] Confidence **MEDIUM**,
single source, not cross checked. §8 item 6. Note that this is a *third* distinct
"things turn into stars" mechanic, separate from §1.1's bullet cancel modes.

### 2.3 Two Black Label acquisition rules a port will otherwise get wrong

Both from 「黒往生と白往生の違いについて」, confidence **MEDIUM**, single source,
not ROM verified, and both are exactly the kind of thing that produces a silent
one frame divergence:

* 「黒版ではボム発動条件が「ボムボタンがOFF→ONになったか」で判別されるようになり」
  **Black makes button 2 EDGE triggered.** White was level triggered, so in White
  you could hold the button and have a hyper fire the instant you touched the
  item. §8 item 7.
* 「面開始時即ハイパー発動が出来なくなった」 **Black removes the stage start instant
  hyper.** White let you hold the button through the stage transition and fire
  immediately.

---

## 3. THE HYPER AND THE LASER

**This was the sharpest question in the brief, and the answer is: NO, the hyper
does not fork on the laser the way the bomb does, and yes, there is a real laser
interaction, but it is somewhere else entirely.**

### 3.1 No fork at the dispatch, unlike the bomb

**[CONFIRMED, HIGH]** [Black] The bomb genuinely forks: `$249A98` routes to
`$255FE2` for the laser bomb, and Shmups Wiki names the two weapons, "Spread
Bomb: Activated when not using laser" and "Laser Bomb: Activated when using
laser". **The hyper has no such pair.** `$252714` selects a weapon routine from
the `$2527BE` table by `$81043E`, and then, if `$81B63E` is set, **discards that
selection unconditionally** and uses `$28C4FC`. One routine, whatever you were
holding.

**Web agrees by construction:** no source in any language names a "hyper laser"
and a "hyper shot" as two selectable weapons in DaiOuJou. Every source describes
one hyper state that amplifies both. The only source that says otherwise is the
Fandom page, and that page is describing DaiFukkatsu (§1.8).

**The caveat, stated plainly.** `$28C4FC` has never been read. It is one routine,
but nothing stops it branching internally on the laser held bit and building a
different projectile set. That is almost certainly what it does, because both
weapons demonstrably still exist during a hyper. **The fork, if there is one,
moved inside; it is not at the dispatch.** §8 item 8.

### 3.2 The real interaction: the laser charges the hyper gauge 12x faster while hypering

**[CONFIRMED, HIGH]** [Black] `37-recon` §4.4 [CITED], verbatim:

```
2867b4: subq.w #1,$81B636 / bcc -> rts       its own 8 frame divider
2867bc: moveq #$4,D2
2867be: tst.w $81B63E / beq                  hyper up?
2867c6:   moveq #$30,D2                      ...then 48 instead of 4
2867c8: add.w D2,$81B64A
2867ce: jsr $287682                          grants a hyper stock
```

4 units per 8 frames normally, **48 per 8 frames while a hyper is up**. At 24
units per 1 % (§2), that is 0.167 %/8f becoming **2 %/8f**, so about 15 % of a
full gauge per second of held laser during a hyper. **A hyper held on the laser
substantially refills itself.** This is the mechanical basis of the entire
"point blank the boss with the hyper laser" school of DaiOuJou play, and of the
Shmups Wiki line about pointblanking giving "even more hyper".

**The shot path does not have this.** The shot reaches `$287682` only through
`$2866CA`, the chain meter cap clamp, on a completely different cadence.

**So the implementer's rule is:** hyper while tapping shot and hyper while
holding the beam are not different weapons, they are the same weapon with wildly
different feedback into the gauge, and therefore into the *next* hyper, and
therefore into rank. **That is a scoring difference, not a weapon difference,
and it is exactly the distinction a port would otherwise miss.**

---

## 4. RANK. THE PART THAT MUST BE EXACT

### 4.1 Our measurement is CORROBORATED and needs one refinement

The brief's statement, "`$81B646` accumulates and permanently adds 16 to rank at
the next super", is right in substance and needs one word changed.

**[CONFIRMED, HIGH]** [Black] From `19-impl` §1.4 and `38-recon` §3 [CITED]:

```
285A56: D0 = $81B65C          the STOCK, that is the LEVEL
285A5C: $81B654 = D0          the active level
285A62: $81B646 += D0         <<< THE RANK GAIN, one per level
285A68: cap $81B646 at $23    35
285A8A: clr.w $81B65C         the stock is consumed ENTIRELY
```

and the rank function, recomputed from scratch every single frame at `$2608D2`:

```
rank = base[stage] + ($8130C6 >> 8) + ( 16 * max($81B646,$81B648)  IF a hyper is active )
       clamped to $F0 with no hyper up, $FF with one; PINNED to $FF on loop 2+
```

**The refinement: the 16x term is GATED on `$2608F4 D0 = $81B63E | $81B640`.**
The accumulator is permanent, but its *contribution* is not. Rank spikes by
`16 x level_total` for the duration of the hyper and falls back when the hyper
ends. "Permanently adds 16 to rank at the next super" should read **"permanently
adds 1 to the accumulator, which is worth +16 rank during every future hyper"**.

**The Japanese wiki says precisely this, in one sentence, and it is the single
best corroboration in this recon:**

> 「ハイパー中はランクが上昇する。ハイパー終了時にランクは戻るが、弾速ランクは戻りきらない。」
> ("Rank rises during a hyper. When the hyper ends rank returns, but the
> **bullet speed rank** does not fully return.")

The first two clauses are the `$2608F4` gate described by a player who had never
seen the code. **The third clause is a lead we should chase**: `$2608D2` fans
D1's low byte out into **eleven bytes at `$8130A1..$8130BD`** (`19-impl` §1.4
[CITED]). If one of those eleven is a high water latch rather than a plain copy,
that is the bullet speed rank that does not come back down, and it explains
HG101's "when the mode ends, the bullet density and speed will slow down, but
still be at a value higher than it was before" and the forum's "when the hyper is
over it doesn't come back down to the same level as before". **Three independent
sources describe a latch; the ROM has eleven candidate bytes for it.** §8 item 9.
Confidence that a latch exists: **MEDIUM to HIGH**. Confidence about which byte:
**NONE**.

**Web corroboration of the proportionality**, which is the load bearing half:
Shmups Wiki, "Rank is increased by using Hypers, and the amount it increases is
proportional to the level of the hyper used." HG101 says the same. Both match
`add.w D0,$81B646` with D0 = level, exactly.

**Web corroboration of the all at once consumption:** Shmups Wiki, "When a hyper
is activated, all hyper items are used at once with an effect proportional to the
amount of hypers consumed." That is `$285A8A clr.w $81B65C` in English. And the
Japanese source for the button fork: 「ハイパーシステムがLv1以上になっていればハイパー
システムを優先して発動する」 ("if the hyper system is at Lv1 or above, the hyper
takes priority"), which is `$249866 beq $2498E2` in English.

### 4.2 The saturation, which is a real ceiling on scoring routes

The accumulator caps at `$23` = 35, but the rank byte clamps at `$FF` while
hypering, so `16 x power` saturates rank at power around 13 (`38-recon` §3.2
[CITED]). **Roughly three level 5 hypers, or thirteen level 1 hypers, and rank is
pinned at maximum for every hyper thereafter.** This is why the community advice
below exists, and it is why the advice takes the shape it takes.

### 4.3 The debits, and they are three DIFFERENT laws

**[CONFIRMED, HIGH]** [Black] `38-recon` §3.4 [CITED]:

| how the hyper ends | effect on `$81B646` |
|---|---|
| the gauge runs out | **untouched** |
| **a bomb is pressed during it** (`$249976`) | **subtract 3**, floored at 0 |
| **the player dies during it** (`$24A00C`) | **shift right by 2**, that is divide by 4 |

**And the debits are at the CALL SITES, never inside `$285AF2`.** A port that
puts the debit inside the hyper end routine gets the timer expiry case wrong and
nothing shows it until a route depends on it.

**Web corroboration:** Shmups Wiki, "Rank can only be decreased by bombing during
hyper mode or losing a life." **The words "during hyper mode" are load bearing
and correct**: `$249968 tst.w $81B63E / beq $2499D4` means a bomb with no hyper
up costs nothing and refunds nothing. A forum poster's "drop extra bombs to keep
rank low" is **wrong as stated** unless the bombs are dropped during hypers.

**And the forum's "dying reduces twice as a bomb" is an approximation of a
shift.** At accumulator 8 a bomb takes it to 5 and a death takes it to 2, so the
reductions are 3 and 6 and the folklore holds. At accumulator 20 a bomb takes it
to 17 and a death to 5, so the reductions are 3 and 15, which is five times, not
twice. **The ROM law is the shift. Do not implement a doubling.**

### 4.4 One thing our own recon says is UNRESOLVED and the web cannot settle

`38-recon` §3.3 [CITED] could not determine whether the bomb's `-3` and its
`jsr $285AF2` land **before or after the same frame's rank recompute**. No web
source operates at that resolution. **It stays open and a port must not choose.**
One tap on `$2607E4` and `$249976` in one playing frame settles it.

### 4.5 How experienced players manage hypers BECAUSE of the rank cost

This is the part only the web can supply, and the sources are consistent.

* **Save nothing, spend small.** Shmups Wiki: "it is advised to never use a Hyper
  higher than level 2 on bosses, as the difficulty increase far outweighs the
  reward. Therefore, it is better to just use multiple level one Hypers, rather
  than one large level 5 Hyper." Note this is a *rank* argument, not a damage
  argument: five level 1 hypers cost the same five accumulator points as one
  level 5 hyper, but each individual hyper's rank spike is one fifth as large,
  and the spikes are short.
* **Let them float away.** Survival players deliberately **do not collect** hyper
  items, because collecting raises stock and stock is rank. The forum phrasing:
  "To keep rank low, drop extra bombs, use low level hypers whenever you can (you
  can actually let hypers float away)."
* **The scoring route inverts this.** The scoring pattern reported for DaiOuJou is
  to spend hypers on hit count for the first part of a stage and then **fill the
  gauge and never use it again**, so that the stock sits full and rank stays flat
  while the chain runs.
* **Bomb out of a hyper on purpose.** Because the only rank *refund* in the game
  requires an active hyper, a deliberate bomb during a hyper is the rank
  management tool. It costs 3 accumulator points, which is three levels of
  future hypers, permanently.
* **Black Label softened all of this.** Forum: "You can safely spam high level
  hypers in Black Label with much less danger of suddenly being under a super
  fast barrage, not to mention get hypers more easily, which makes Black Label
  easier to 1-All."

Confidence on the strategy section: **MEDIUM to HIGH** as a description of what
players do; it is not a mechanic and should never be encoded.

---

## 5. IS "HYPER" THE SAME AS "THE SUPER"?

**SETTLED, HIGH CONFIDENCE. They are one thing, and only one of the two words is
real.**

* Every consulted source in English and Japanese uses **hyper** exclusively:
  Shmups Wiki, HG101, the Japanese DaiOuJou wiki (ハイパー), the version
  comparison article, the shmups.system11 threads. The gauge is the hyper gauge,
  the item is the hyper item, the state is hyper mode.
* **"Super" is not a DaiOuJou term.** It appears nowhere on the web in this
  sense.
* **It entered this project through one owner quote.** `grep` over the worklogs
  shows "super" occurs only in and around the owner's sentence "one wrong rank
  gain from using super and the entire route breaks"
  (`20-OWNER-scoring-must-be-exact.md` line 13), and then propagates into
  `19-impl` §1.4's headings and `38-recon` §"using a super".
* The ROM does not disagree with itself either: there is exactly one activation
  routine per player, `$285A12` / `$285B3C`, one stock word, one active flag.
  There is no second mechanic that "super" could be naming.

**Recommendation for the port: standardise on "hyper" in code and comments, and
keep "super" only inside verbatim owner quotes.** The ambiguity is ours, not the
community's.

---

## 6. BLACK LABEL SPECIFICS

Our target is **VERSION-B, 2002.10.07.BLACK VER**, chosen at boot on
`ddpdojblk`, whose code image is `$2xxxxx` (`00-recon-versions` [CITED]). MAME
confirms the set name and the date string. Note also that `ddpdojblka`
(`ddb_1dot.u45`) and `ddpdojblkb` are further Black revisions and `00-recon-versions`
§9 [CITED] measured them pixel identical to each other and 1.888 % different
from `ddpdojblk` after 2,800 frames; **no source, ours or the web's, has ever
attributed a hyper difference to a revision within Black Label.**

### 6.1 Differences that touch the hyper

| difference | version | source | confidence | ROM verified? |
|---|---|---|---|---|
| **the hyper gauge fills much faster during stages** 「道中時のハイパーゲージの増加率が上昇」, called "arguably the single largest change in this version" | Black > White | JP comparison article, Shmups Wiki, HG101 all say it | **HIGH** | no |
| **overflow now carries over.** In White, gauge above 100 % was discarded; in Black the excess carries into the next bar | Black | HG101, Shmups Wiki | **HIGH** | no |
| **the bee to gauge table (3 % per 20 HIT up to 30 %)** is quoted specifically under Black | Black | Shmups Wiki | **HIGH**, and `73-recon` proved it against build B | **YES** |
| **hyper damage multipliers roughly doubled to tripled** (§1.2 table) | both, tabulated | JP comparison article | MEDIUM to HIGH | no |
| **the rank increase from hypering was reduced and the cap raised** | Black | HG101 | **MEDIUM**, single source | **partially, and it needs care.** Our Black numbers are +1 per level with cap `$23`. HG101 implies White's per level increment is larger and White's cap smaller. **The `$1xxxxx` mirror of `$285A62` would settle this in one read** |
| **base rank ceiling and floor both lowered** 「基本ランクの低下」, and loop 1 bullet speed gentler even at max rank | Black | JP comparison article | MEDIUM to HIGH | no, but it would show in `$81315C`'s per stage base table |
| **button 2 became edge triggered** (OFF to ON) | Black | JP comparison article | MEDIUM | no |
| **no instant hyper at stage start** | Black | JP comparison article | MEDIUM | no |
| **loop 2 carryover**: full bars discarded, partial charge preserved (White reset to 0) | Black | Shmups Wiki | MEDIUM | no |
| **a rare bug where collecting a bee sets the gauge to 100 % unconditionally** | Black only, new in Black | JP comparison article | LOW to MEDIUM | no. Interesting because `73-recon` read the bee path and saw no such case |
| collecting bees gives no gauge while a hyper is up | Black (stated on the BL section) | Shmups Wiki | MEDIUM to HIGH | **consistent with ROM**: `$27FBA2 tst.w $81B63E / bne $27FBEE`, which **skips** (`73-recon` [CITED]) |

### 6.2 The methodological point

**Most of what is written about DaiOuJou's hyper describes the original.** HG101,
the Fandom page and most forum recollection do not distinguish. The two sources
that reliably do are the Shmups Wiki (which has an explicit Black Label section)
and the Japanese comparison article (which is entirely about the difference).
**Any hyper number found elsewhere and not tagged should be assumed to be White
until it survives a ROM check against `$2xxxxx`.**

---

## 7. WHERE THE WEB IS WRONG, AND WHERE IT BEAT US

**A web recon on this project has already been wrong where the ROM was right.**
Keeping score honestly:

**The web was right and matched the ROM, sometimes eerily:**
* the stock cap of 5, and consumption of the whole stock at once
* rank proportional to level, and rank refunded only by bombing during a hyper or
  dying
* rank rising during the hyper and falling back at its end, with a bullet speed
  residue
* bullets cancelled on activation, with a level threshold that turns out to be a
  level indexed table in the ROM
* the bee to gauge table, which `73-recon` proved constant for constant
* the button priority, hyper over bomb
* the laser as the pointblank gauge engine

**The web was wrong or muddled:**
* Fandom's doll dependent hyper cancel is DaiFukkatsu, imported wholesale
* "hyper meter fills to level 10" is SaiDaiOuJou
* the death refill percentage is 25 % in one source and 30 % in another
* "bombing lowers rank" without the "during a hyper" qualifier
* "dying lowers rank twice as much as a bomb" is a shift described as a doubling
* HG101's level scaled duration contradicts our listing read and is unresolved

**Where the web is ahead of us and we should take it seriously:** the bullet
speed rank latch (§4.1), the level 2 star conversion threshold (§1.1), and the
Black Label damage multiplier table (§1.2). All three are things our ROM work has
not reached, and all three are named in §8.

---

## 8. WHAT A FUTURE IMPLEMENTER MUST VERIFY AGAINST THE ROM RATHER THAN TRUST FROM ME

Ordered by how badly a wrong answer would corrupt scoring.

1. **The cancel mode table `$255326` / `$255330`, indexed by (stock − 1) x 2, and
   `$25531C`.** Read the entries. Confirm whether level 1 and level 2+ select
   different `$81B412` mode groups, which is the ROM form of "2 or more items
   turns bullets into stars". Also confirm which of the two arms
   (`$244074` erase and score 46, or `$2440AE` count into `$81B5B4` and drain
   into items at 4 per frame) each mode reaches, and what `btst #1,$8130F8`
   actually is.
2. **`$28C4FC`, the hyper's substitute shot builder.** Never read. Determine
   whether it branches on the laser held bit and on the element doll, and where
   the x1.5 to x3.5 damage multiplier lives. **The entire answer to "does the
   hyper interact with the laser" ultimately lives in this routine.**
3. **The 80 / 120 frame invulnerability, and the 2P 80 frame bug.** Find the
   constant. Confirm it is unchanged in build B and reproduce the 2P bug rather
   than fixing it.
4. **The duration.** Find the **fifth absolute site for `$81B642`**, the one
   `38-recon` did not read. Then put a write tap on `$81B642` in a run that
   actually hypers and settle whether the duration is a flat 1,200 frames or
   scales with level. **Do not ship a duration until this is measured.** Also
   determine the duty cycle of `$285AD4 btst #6,$8130F8`, which gates the drain.
5. **The death refill of the hyper gauge.** Look for `$258` (25 %) or `$2D0`
   (30 %) written to or added to `$81B64A` on the death path. Two sources
   disagree; the ROM has one answer.
6. **The uncollected hyper item turning into a 10,000 point large star** when a
   hyper is activated. Single web source. Look on the activation path, near
   `$285A90 jsr $25325E`, and in the item pool `$816E7A`.
7. **Whether button 2 is edge triggered in build B.** Single Japanese source
   claims Black changed this. Check the input read feeding `$249830`.
8. **What `$81043E` actually indexes** in `$252718`, and therefore exactly what
   the hyper's `lea $28C4FC,A0` is overriding: the weapon (shot vs laser), the
   ship type, the doll, or a product of them.
9. **The bullet speed rank latch.** `$260984..$260A18` fans the rank byte into
   eleven bytes `$8130A1..$8130BD`. Determine whether any of them is monotone or
   otherwise fails to fall when the 16x term drops at hyper end. Three
   independent web sources say something does not come back down.
10. **Whether the bomb's `-3` lands before or after the same frame's
    `$2608D2`.** Named unresolved by `38-recon` §3.3, and the web cannot help.
11. **The White Label comparison, which is nearly free.** Every routine in this
    file has a `$1xxxxx` twin. Reading `$185A62`'s neighbourhood (or wherever the
    White mirror of `$285A62` lands) would settle HG101's "the rank increase from
    hypering has been reduced and the cap raised" in a single pass, and would tell
    us which web claims are White Label contamination.
12. **The Black only bee bug** (rarely fills the gauge to 100 % unconditionally).
    Low priority, but if it exists it is in the path `73-recon` already walked,
    and its absence there is mild evidence against it.

**And one structural item that is not a ROM question but will block all of the
above:** `src/items.js` refuses the two hyper stock item kinds at the allocator,
so `$2530CA` is unreachable and every measurement in this list needs that gate
opened first, or a seeded stock. `69-tool-seed-anywhere` exists.

---

## 9. SOURCES

Rated by how much weight this recon put on them.

**Primary, high trust:**
* Shmups Wiki, *DoDonPachi DaiOuJou*, https://shmups.wiki/library/DoDonPachi_DaiOuJou
  (includes the Black Label section; the Black Label page is a redirect to it).
  The only English source that consistently version tags.
* 怒首領蜂大往生まとめ Wiki, 基礎知識,
  https://wikiwiki.jp/daioujo/%E5%9F%BA%E7%A4%8E%E7%9F%A5%E8%AD%98
  Source of the bullet cancel wording, the 2+ item star threshold, and the
  bullet speed rank sentence.
* レベルを下げて理論で殴る, 「黒往生と白往生の違いについて」,
  http://rokulpg.blogspot.com/2016/09/blog-post_83.html
  The only source with a numeric White vs Black hyper multiplier table.

**Secondary:**
* Hardcore Gaming 101, *Dodonpachi Daioujou*,
  https://www.hardcoregaming101.net/dodonpachi-daioujou/
  Good on play feel and on the Black Label overflow fix; the source of the
  contested level scaled duration claim.
* shmups.system11.org threads on DaiOuJou survival and Black Label,
  e.g. https://shmups.system11.org/viewtopic.php?t=64976
  Player strategy only, used for §4.5 and nothing mechanical.
* MAME machine data for `ddpdojblk`,
  http://adb.arcadeitalia.net/?mame=ddpdojblk
  Used only to confirm 2002.10.07.Black Ver is the Black Label set.

**Consulted and DOWNGRADED:**
* James-Software-Co Fandom wiki, *DoDonPachi DaiOuJou*. Contains a doll dependent
  hyper bullet cancel description that belongs to DaiFukkatsu. **Do not use.**
* Assorted search summaries that conflated SaiDaiOuJou's hyper (level 10 gauge,
  GP meter, HIT boost) with DaiOuJou's. **Do not use.**
* tcrf.net's DaiOuJou page could not be retrieved in a usable form this session
  and contributed nothing.

**Project files cross referenced (read only):**
`19-impl-score-chain-rank-ledger.md`, `37-recon-laser.md`,
`38-recon-bomb-hyper.md`, `73-recon-bees-rom.md`, `00-recon-versions.md`,
`20-OWNER-scoring-must-be-exact.md`.

---

status: DONE
