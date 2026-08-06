# 100 -- IMPL: the owner's four -- the bomb, the flame, the thrusters, the HUD

status: **DONE.** Three DIAGNOSED (one is an OWNER DECISION and was not taken),
one LANDED.

2026-08-06. wave: 98's items 3 to 6. role: IMPLEMENTER.
target: `ddpdojblk` VERSION-B. `[M]` = measured by me, this session.

Four things the owner reported by name, in the order they were queued:

| | what they said | verdict |
|---|---|---|
| 3 | *"Laser bomb now has right color I think, but is translucent"* | **THREE of the four candidates ELIMINATED with measurements.** §1 |
| 4 | *"The flame on the ships is always on I guess because of invincible mode?"* | **THEIR GUESS IS RIGHT, VERIFIED. OWNER DECISION, NOT TAKEN.** §2 |
| 5 | *"I think we are missing some thrusters?"* | **NOTHING IS MISSING, and the report they were shown mislabels one record.** §3 |
| 6 | *"the HUD from the upper left is a recording and should go"* | **DONE. It is off, and photographed.** §4 |

---

## 1. THE LASER BOMB IS TRANSLUCENT -- three candidates killed

The brief named three candidates and flagged that W90 measured the *opposite* of
the obvious one, so alternate-frame drawing does not obviously explain it -- and
that if it turned out to, that would itself be a finding.

### 1.1 **ALTERNATE-FRAME DRAWING: RULED OUT. It draws on EVERY frame.**

`[M]` `node .scratch/w98/bomb.mjs` -- fire HELD (which is what makes it the
LASER bomb `$255FE2` rather than the ordinary `$255E3E`), Button 2 at step 200,
records identified by membership of sprite shard 13's own 218 streams:

```
[M] bomb records on 131 of 420 frames, steps 200..330
[M] inside the window (131 frames): 0 EMPTY frames
[M] records by phase: phase0 1758  phase1 1741
[M] class        frames  records  phase1  phase0
[M]   1x64 c6      131     2975     1481    1494
[M]   8x112 c6     131      131       65      66
[M]   7x96 c6      131      131       65      66
[M]   5x96 c6      131      131       65      66
[M]   4x48 c6      131      131       65      66
```

**Not one empty frame, and every class is present on all 131.** W90's
measurement reproduced exactly. **So the thing that explains half the
transparency on this hardware does not explain this one.** That is the finding
the brief asked for, in the direction it did not expect.

### 1.2 **A CAPTURE-SOURCED PALETTE: RULED OUT, and this is why the colour is now right**

`[M]` **every one of the laser bomb's five appearance classes is COLOUR 6** --
`1x64 c6`, `8x112 c6`, `7x96 c6`, `5x96 c6`, `4x48 c6`. There is no second bank
involved.

And bank 6 is the ONE sprite bank W91 sourced from the cartridge outside the
stage's object stream. `webgate`'s own W91 row, GREEN on this tree, says it:

> *"with a bomb dropped, `$260852`/`$26085C` install bank 6 from the cartridge
> and its first two entries are `$FFFF` (255,255,255) and `$FFB6` ... **BANK 6
> IS DELIBERATELY THE ONE SOURCED BANK THAT DISAGREES WITH THE BOARD**: no bomb
> was dropped in the 161 recorded frames"*

and W93's ledger names what is still the recording's: *"nine sprite banks
(0..5, 7, 8, 9)"*. **6 is not among them.** So the owner's *"has right color I
think"* is W91 landing, and the palette cannot be what makes it look thin.

### 1.3 **THE BIT-7 AURA W65 TURNED ON: RULED OUT as an overlay, and the measurement is a surprise**

`[M]` `node .scratch/w98/aura6.mjs`:

```
[M] 5x40 (the AURA class) records:
[M]   BEFORE the bomb (steps 0..199):   144 records on 144 frames, all phase1
[M]   DURING the bomb (200..330, 131):    0 records on   0 frames
[M]   frames in the window with ($1,A6) bit 7 set: 131 of 131
```

**Bit 7 is set on every frame of the bomb -- W65's arm really is on -- and the
aura class emits NOTHING while it is.** `$24A48C bmi $24A4E2` sends the bit-7
frames down a different arm with a different, INDIRECT sprite table
(`$2556BA[($58,A6)*2]`, W65's own note item 3) and a different size, so W65's
aura **replaces** the invulnerability aura rather than laying a haze over the
beam. It cannot be what the owner is seeing on top of the bomb.

### 1.4 WHAT IS LEFT, AND I DID NOT GUESS AT IT

**The fourth answer is AUTHENTIC ARTWORK, and this repo cannot yet tell.**
`docs/render/capture.js` is explicit that nobody may "fix" authentic alternation
by drawing at half alpha, and the same rule has to apply to a sprite that is
simply drawn thin. `[M]` nothing in this repo compares the bomb's PIXELS against
the board's, and it cannot: `webgate`'s W91 row records that **no bomb was
dropped in the 161 recorded frames** and no MAME scenario in `scenarios.json`
drops one either.

**WHAT WOULD SETTLE IT, and it is one run:** a MAME checkpoint with Button 2
pressed while the beam is up, then `tools/boarddl.mjs` on it. The board's own
display list would say how many records the cartridge emits per frame in that
window and in which buckets, and the framebuffer would say what it looks like.
Until that exists, changing anything here would be inventing.

**NOTHING WAS CHANGED FOR THIS ITEM.**

---

## 2. THE FLAME IS ALWAYS ON -- **the owner is right. OWNER DECISION. NOT TAKEN.**

### 2.1 It is not a flame. It is the INVULNERABILITY AURA, and this repo says so

`src/shipsprite.js:39`, written long before the owner asked:

> ***"AND THE AURA IS THE INVULNERABILITY BLINK, not an exhaust.** `$24A48E
> tst.b ($3e,A6)` is the invulnerability timer; the 5x40 colour-2 record wave
> 9's matcher labelled "exhaust plume" is only drawn while it is non-zero."*

`[M]` the cartridge, disassembled here rather than taken from the comment:

```
[M] 24A48E  tst.b   $3E(A6)       <- the invulnerability timer
[M] 24A492  beq.w   $24A538       <- zero: NO AURA
[M] 24A496  tst.w   $80390C       <- the phase
[M] 24A49C  beq.w   $24A538
```

**Two gates and no third.** While `($3e,A6)` is non-zero the aura draws on every
frame of one phase.

### 2.2 And `src/web/app.js` pins that byte at `$FF` every frame

`app.js:231` `const INVULN = 0x810424;` -- the same labelled intervention
`fly-around` and `stage1-sweep` carry. `[M]` with it, over 1,200 steps:

```
[M] 3x32 c0  THE SHIP                     1200 records  phase1 600  phase0 600
[M] 5x40 c2  the AURA (the "flame")        468 records  phase1 468  phase0 0
[M] 1x32 c26 the exhaust GLOW              600 records  phase1 600  phase0 0
[M] 1x16 c24 the ship's ground shadow     1192 records  phase1 0    phase0 1192
```

**THE OWNER'S GUESS IS CORRECT.** The aura is on because the invulnerability
timer never expires, and the timer never expires because the page holds it at
`$FF`.

### 2.3 THE CONSEQUENCE, MEASURED -- and it is why this is not mine to take

`[M]` the identical run with the poke removed:

```
[M] steps 426  frames with $810424 != 0: 416
[M] throw: UNPORTED $249F8A: the player was HIT
[M] final $810424 = $0
```

`src/unported.js`'s own message is the whole argument:

> *"`$249F8A` -- the hit/death path, **212 instructions**, which QUARTERS
> `$81B646` at `$24A00C`, clears the hyper stock at `$24A01C` and calls the item
> machine `$287682`. W64 (B2) is what made this reachable: **`$2564BA`, the
> BOMB's cooldown expiry, is the only thing in this port that clears the seed's
> `($3e,A6) = $FF`** ... Bomb, then get hit, and you are here."*

**AND THERE IS A SECOND HALF THE BRIEF DID NOT ANTICIPATE.** `[M]` **the SEED
ITSELF carries `$810424 = $FF`**, and only `$2564BA` clears it. So removing the
poke does **not** turn the flame off in ordinary play -- `[M]` the byte stayed
`$FF` for 416 of the 426 steps of a run with no poke at all. It turns the flame
off only **after a bomb**, and from that instant the player is mortal and
`$249F8A` -- 212 unported instructions -- is one hit away.

> **SO THE DECISION IS BIGGER THAN THE ONE LINE.** Removing the poke changes how
> the page PLAYS (the player can die) and makes an unported 212-instruction path
> reachable in normal play, and it does not even fix the symptom until a bomb is
> dropped. **The honest fix for the owner's complaint is to port `$249F8A` and
> then remove the poke, in that order.** That is an OWNER DECISION and I did not
> take it. `src/web/app.js` is unchanged in this respect.

---

## 3. THE MISSING THRUSTERS -- **nothing is missing, and the report mislabels one**

The brief said: *"`src/render/capture.js`'s attach report names an 'exhaust
plume' (5x40 c2, ODD) and an 'exhaust glow' (1x32 c26, ODD) ... So the cartridge
HAS thrusters."*

**THE CARTRIDGE HAS ONE, NOT TWO, AND THE OTHER IS §2's AURA.** The attach
report is wave 9's, its labels were guesses from a matcher that had no listing,
and `src/shipsprite.js` corrected one of them in W10 and the report was never
re-labelled. §2.1 is the correction, out of the cartridge.

`[M]` both records emit, and on the right phase:

| the report's name | what it is | port, 900 frames | of the 450 odd frames |
|---|---|---:|---|
| "exhaust glow" 1x32 c26 | **the exhaust glow** (`$24A54E..$24A632`) | 450 records | **450 of 450 -- 100 %** |
| "exhaust plume" 5x40 c2 | **the invulnerability aura** (§2) | 318 records | 318 of 450 |
| ship shadow 1x16 c24 | the ground shadow | 892 records | **0 -- all 450 EVEN frames** |
| THE SHIP 3x32 c0 | the ship | 900 records | every frame |

**`[M]` AND THE ODD/EVEN INTERLEAVE IS REPRODUCED EXACTLY**: the glow and the
aura on phase 1, the shadows on phase 0, **and no frame carries both** -- which
is the property `capture.js`'s own header calls *"a finding in itself"*.

**SO: the exhaust glow is not missing, it is not intermittent, and it is on the
correct phase.** `[M]` the live page confirms it visually -- the ship in
`.scratch/w98/w98-hud-port.png` has a full orange plume behind it.

### 3.1 ONE THING I FOUND THAT IS THIN, AND IT IS NOT A THRUSTER

`[M]` the OPTION PODS (`2x16 c0`) emit **32 records over 1,200 frames**, where
the attach report has them present on **161 of 161** recorded frames. `[M]` they
are not in the port's top 22 appearance classes at all. **That is a real gap and
it is not this item's**: the pods exist only while the player has options, and
whether the seeded run should have them is a question about `src/options.js` and
the item machine, not about exhausts. **Named here so it is not lost.**

**NOTHING WAS CHANGED FOR THIS ITEM.**

---

## 4. THE REPLAYED HUD IS OFF -- **LANDED, and photographed**

### 4.1 The owner is right, and this repo already said so twice

* `src/hud.js`: *"the HUD's STATE is this port's and the HUD's PICTURE is not. A
  player sees no score row, no chain meter and no bomb icons ... and every
  address above is counted in `unportedLog` on the frames it would have drawn."*
* `41-recon` §3.1: the `tx` layer is *"the capture, whole -- HUD, score digits,
  all on-screen text"*.

So the upper left is a 161-frame recording of somebody else's score looping
against a 7,317-frame stage -- `39-OWNER`'s *"the recorded enemies became off and
wrong at some point"* is the same sentence about the same mechanism, and W37's
answer applies unchanged.

### 4.2 What shipped -- four lines and forty of comment

`src/web/app.js Demo.draw()`, one argument:

```js
usedPort ? { spriteStride: RAM_STRIDE, wantTx: false } : undefined
```

**WHY `wantTx: false` AND NOT A ZEROED `st.tx`.** Tile 0 is a tile, not an
absence: zeroing the map would draw whatever tile 0 holds, 64 x 32 times.
`wantTx` is a STRUCTURAL parameter of `renderIndexed`'s own options bag -- the
same class as the `spriteStride` immediately beside it, and NOT one of the four
decoder mutations whose comment forbids the port a non-default value; that
comment is on the CONSTRUCTOR's bag (`render/igs023.js:36-41` vs `:74-78`), a
distinction `app.js` already relies on for `spriteStride`.

**ONLY IN THE `port` SOURCE.** In `capture` the page is deliberately showing the
recording, and `app.js:855` records that this is *"the only correctness check
this wave has that does not need MAME"*. Taking the HUD out of that source would
break the thing the source exists for.

**IN THE PAGE, NOT THE EXPORTER**, for `41-recon` §5.3's reason: `bundlegate`
renders the PUBLISHED bundle's own capture and requires 100.0000 % pixel
identity to MAME. A strip in `export-web.mjs` would take that gate from
100.0000 % to about 91 % with no honest way to keep it green. `[M]`
`tests/w98hud.test.js W98/H1` asserts the string `wantTx` appears nowhere in
`tools/export-web.mjs`.

### 4.3 **THE PAGE, OPENED, WITH BOTH SOURCES**

`[M]` `python .scratch/w98/hudshot.py 8993` -- real Chrome, fire held, the same
page, toggled between the two sources four seconds apart:

```
[M] PORT     rec-20 keep 5 hud-rec  [port]    dl 90 drawn 90  pal 1760/2560
[M] CAPTURE  rec-48 keep 5          [capture] dl 88 drawn 88  pal 1760/2560
```

`.scratch/w98/w98-hud-port.png`: **the upper left is EMPTY.** No `PLAYER-1`, no
score, no `PRESS START`, no MAX box, no life icons, and no `B.B.B` bomb bar
across the bottom. What is on screen is the playfield, the port's own enemies --
the windmill emplacements, the gold mech, the tank column -- and the player's
laser.

`.scratch/w98/w98-hud-capture.png`, the same page one keypress later: **all of
it back.** The two pictures together are what says the removal removed the HUD
and nothing else.

`[M]` **and `pal 1760/2560 cart [spr 576/1024 bg 1024/1024 tx 160/240]` is
IDENTICAL in both.** §4.5.

### 4.4 **WHAT `capture.bin` STILL SUPPLIES -- and the HUD was NOT the last**

`39-OWNER` makes `capture.bin` going away the formal definition of stage 1 being
feature complete, so this is reported the way W93 reported its 800 palette
words. `[M]` `Capture.state(i)` returns seven parts; in the `port` source, after
this wave:

| part | still the recording's? |
|---|---|
| `palette` | **YES** -- 800 of 2,560 words. §4.5 |
| `tx` | **NO. Retired by this wave.** Still assembled, no longer read by the renderer |
| `spritebuffer` | assembled, spliced and stripped every frame, then **REPLACED** by the port's own list. Kept alive because the `capture` source is one keypress away |
| `bg` | **NO** -- `st.bg = this.game.vram.w` (W13). Only the ring's first 63 columns, `bgSeed`, are the recording's, once, at construction |
| `rowscroll` | **YES** -- measured all-zero over 13,600 lf, and still the recording's |
| `zoomram` | **YES** -- although `src/zoomtable.js` bakes the constant and asserts it at boot, the RENDERER still reads the capture's copy |
| `regs.ctrl`, `regs.bg_scale` | **YES** -- constants on every measured frame (`$001F`, `$0210`) |
| `frames[i].lf/vf`, `cap.length` | **YES** -- and this is the 161-frame modulo that makes everything above loop |

> **SO: NO. THE HUD TEXT WAS NOT THE LAST NON-PALETTE CONSUMER, and saying so
> would have been the milestone this project most wants to claim and least
> deserves yet.** Four non-palette things remain: `rowscroll`, `zoomram`,
> `regs.ctrl`/`bg_scale`, and the frame list itself. Three of the four are
> CONSTANTS that a later wave can retire almost for free; the fourth,
> `frames[].lf/vf`, is the loop, and it is the one that actually matters.

### 4.5 **THE PALETTE: I TOUCHED NOTHING, AND HERE IS WHY IT CANNOT HAVE MOVED**

The brief was explicit: do not remove palette words that still have no cartridge
source, and do not let removing the HUD text break the palette path.

`[M]` `mergePalette(this.game.palette, capPal, this.palMerged)` takes the PORT's
palette and the CAPTURE's palette and nothing else. `st.tx` is not an input to
it, is not read by it, and the call sits after `renderIndexed` returns. The TX
LAYER and the TEXT PALETTE THIRD are two different things that happen to share a
word. `tests/w98hud.test.js W98/H4` asserts the merge call takes no TX input, so
a later wave that routed one through the other would be told.

`[M]` measured on the live page, both sources, identical:
`pal 1760/2560 cart [spr 576/1024 bg 1024/1024 **tx 160/240**]`. **The 160
cartridge-sourced text words are still sourced and the 80 that have no cartridge
source are still there.** Not one palette word was removed.

### 4.6 The page keeps SAYING what it is

`rec-20 keep 5 **hud-rec**` -- W37's contract one layer up. An empty upper left
with no explanation is the same defect class as an empty enemy layer with no
explanation, and `W98/H3` asserts the page prints it.

---

## 5. THE BAR, PER ITEM

| item | FEATURE COMPLETE | ORACLES PERFECTLY |
|---|---|---|
| 3 bomb | **n/a -- nothing shipped.** Three candidates eliminated, the fourth needs a MAME run this repo does not have (§1.4) | **NO, and it is stated**: nothing here compares the bomb's pixels against the board's and no scenario drops a bomb |
| 4 flame | **n/a -- diagnosis only, by instruction.** The cause is verified and the fix is an OWNER DECISION with a 212-instruction unported path behind it | the diagnosis rests on the CARTRIDGE (`$24A48E`/`$24A492`) and on a reproduced throw, not on a gate |
| 5 thrusters | **MET** -- the glow draws on 450 of 450 odd frames and the interleave is exact | the phase claim is checked against `capture.js`'s own attach report of the BOARD's 161 frames; the RECORD COUNTS are the port's own |
| 6 HUD | **MET, and I opened the page in a real browser and photographed both sources** (§4.3) | **partially**: `W98/H1` drives the renderer and watches the layer go; `H2` was SEEN RED two ways (§5.1). **No board comparison exists for "the HUD should be absent" and none can -- the board draws one** |

### 5.1 EVERY CHECK SEEN TO FAIL

```
[M] W98/H1  passes wantTx:false and asserts the pixel becomes the FILL PEN --
[M]         and it asserts the WITH-TX case is NOT the fill pen first, so it
[M]         cannot pass vacuously
[M] W98/H2  RED with wantTx:false passed UNCONDITIONALLY (capture too)
[M] W98/H2  RED with wantTx not passed at all
[M] W98/H3, H4  source assertions; H4 is the palette guard
```

### 5.2 THE GATES

```
[M] node --test games/ddpdoj/tests/     1,211 pass, 0 fail  (+4)
[M] node games/ddpdoj/tools/webgate.mjs 30 PASS, 0 FAIL, exit 0
[M] node games/ddpdoj/tools/playgate.mjs --frames 600 --all
[M]                                     PLAYABLE, 6 holds, no unported path
[M] node tools/publish.mjs --only ddpdoj --dry
[M]                                     GREEN, 262 files / 7,111 KB, leak guard
[M]                                     clean with the SAME SIX exceptions
```

**`pgm.py check` was NOT re-run for this wave, and I CHECKED the reason rather
than cited it.** `41-recon` §5.3 says *"`app.js` is on no gate's path"*, and a
citation has a shelf life here. `[M]` the five files that import
`src/web/app.js` are `demogate.mjs`, `export-web.mjs`, `w61itemgate.mjs`,
`w80emitgate.mjs` and `webgate.mjs`; `[M]` **not one of them imports `Demo`** --
they take `romToPackedMap` and `portSpriteList`, neither of which this change
touches -- and `[M]` `demogate.mjs:163` builds its own `st` and calls
`renderer.renderIndexed(st)` **with no options bag at all**, so `wantTx`
defaults to `true` there exactly as before. `[M]` `pgm.py`'s only mention of
`app.js` is a docstring. The change is reachable from the PAGE and from nothing
else. `pgm.py check` was **71/3** earlier this session on this tree
(`98-impl-boss-art` §6.3). **No fourth red was added.**

---

## 6. NOT TOUCHED

`src/hud.js`, `src/shipsprite.js`, `src/player.js`, `src/bomb.js`, the
invulnerability poke's VALUE, `publish.mjs`, `bundlegate`, `webgate`,
`build-dist.mjs`, the ROM leak guard, `PUBLISH_VERBATIM`, `tools/export-web.mjs`
(the HUD removal is deliberately NOT in it, §4.2), `assets/`, `games/gradius/`,
`games/batman/`. Scratch is in `.scratch/w98/`, gitignored. `[M]` every web
server started was shut down in a `finally` and nothing is listening on 8988,
8989, 8990, 8991, 8992 or 8993; `[M]` every `chrome.exe` alive afterwards
descends from the owner's own browser, not from playwright.
