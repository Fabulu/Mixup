# Final verification pass over the whole Gradius port

status: DONE
wave: 99   role: verify   started: 2026-07-29

## The task, as I understood it

From wave 5 onward the per-wave reviewers were deliberately NARROWED: they
re-ran only the scenarios their own wave touched. That was an explicit trade -
find bugs later and in a batch rather than spend five hours per wave. I am the
batch. Everything those waves did not re-measure is my remit.

I am a READER for `src/`. I may write tests, scenarios and oracle tooling, and
I commit. Every `src/` edit below is a DELIBERATE BREAK that was restored and
hash-verified in the same shell command.

---

## 1. The entire oracle corpus, re-recorded COLD

```
python games/gradius/tools/oracle/scen.py          # no --only
```

```
=== ORACLE CORPUS: 36 scenarios, align frame 400, 616 watched addresses ===
```

All 36 recorded from the cartridge under Mesen. **Then hashed against what was
in the tree:**

```
cd games/gradius/tools/oracle/out/scen && sha256sum *.json | diff before after
-> ALL 37 FILES BYTE-IDENTICAL
```

This is the single biggest thing waves 6, 7 and 8 each declared and none of
them did. w6: "the ORACLE SIDE WAS NOT RE-RECORDED ... a regression here looks
like compare.mjs reporting green against stale artifacts". w7: "the ORACLE side
of the other 29 is the implementer's recording, not mine". w8: "30 of the 35
oracle scenarios were NOT re-recorded ... what is unverified is that the other
30 artifacts came off the cartridge rather than being edited".

**Measured answer: they did.** Every one of the 36, byte for byte, off this
cartridge, today. Nothing was doctored, nothing was stale, no artifact
predates its watch list. That worry is closed.

### The full comparison

```
node games/gradius/tools/oracle/compare.mjs
```

```
36 scenarios, 12294 of 12294 frames compared (0 truncated: none), 0 failures,
0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
6 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins)
```

* **knownFail annotations: the list in `scenarios.json` is EMPTY**, and the
  block prints nothing. **0 stale.** There are three `knownFail()` UNIT tests
  (`weapons-unwitnessed.test.js` $8302, `vram.test.js` $8627 and $8A74);
  `helpers.js` turns a surprise pass into a failure, and the suite is green, so
  none of the three is stale either.
* Death coverage: **1350 dying frames across 12 scenarios**, 13 of 36 carry an
  `expectDying`, all matched.
* Clamp coverage: all four clamps reached.
* The 6 SKIPPED fields are the permanent "no port counterpart" set, unchanged.

---

## 2. The gate

```
node games/gradius/tools/test-all.mjs
  GREEN -- 7 passed, 0 failed, 0 SKIPPED

node --test games/gradius/tests/
  # tests 292   # pass 292   # fail 0   # skipped 0   # todo 0
```

**The skip count is 0 at both levels** - 0 skipped stages and 0 skipped tests.
Inside the gate: `verify_assets.py --self-test` reports **39 of 39 mutations
reddened their target; 14 of 14 families seen red**, and 0 mismatches across
14 families / 17 tables / 42 constants / 12 palettes / 2048 CHR tiles / 425
terrain blocks. `snddata.py --selfcheck` passed. The comparison's own
self-check injected 3 breaks and all 3 went red.

---

## 3. The renderer

```
python games/gradius/tools/oracle/rendergate.py
```

```
f400    [PASS] 0 of 61440 pixels differ      stage 1 opening, natural
f1200   [PASS] 0 of 61440 pixels differ      scroll near a nametable seam
f2600   [PASS] 0 of 61440 pixels differ      TITLE screen, no split
inj     [PASS] 0 of 61440 pixels differ      20 injected sprites
sb810   [PASS] 0 of 61440 pixels differ      sprites straddling the boundary
inj2    [FAIL] 6 of 61440 pixels differ      sprites + PAINTED boundary rows
gx802   [PASS] 0 of 61440 pixels differ      painted boundary, other jitter
  note: inj2 keeps 6 px on scanline [212] -- the boundary-jitter residual
        (bound: 6 px on [211,212])
[PASS] 5 natural frames rebuilt pixel-exactly
```

**THE PIXEL NUMBERS DID NOT MOVE.** Every natural frame is still exactly 0, and
the synthetic residual is 6 px on scanline 212 - the number `NOTES-render.md`
§7 already states, at its stated bound. All 11 negative controls are still seen
by at least one frame. No wave moved anything here, which is expected:
`rendergate.py` validates the render MODEL against Mesen and imports no `src/`.

### What I changed: the render gate is now IN the gate

It was in the tree and in no runner from the day it was written.
`docs/knowledge/02` trap 5 says a check outside the gate rots, and this is not
hypothetical - **four consecutive waves recorded, in their own worklogs, that
they did not run it** (05, 06, 07 and 08 review-fidelity, quoted in the stage's
comment). It is now stage 2b of `test-all.mjs`, with an environmental SKIP when
the cartridge is absent, like the other ROM-driven stages. It costs ~4 min.
That is cheaper than four waves of not running it.

---

## 4. THE FINDING: the display list was never compared, and now it is

This is the one that mattered, and it is the hole every narrowed wave named.
w5: "$0200-$02FF (shadow OAM) is not in the 447-address watch list". w6: "page
$02 has zero watched addresses ... a shot, missile or explosion sprite drawn at
the wrong OAM slot, tile, attribute or Y while the counts all match - green
everywhere". w7: "compare.mjs reads sprite 0's four bytes plus four work
counters and nothing else ... this is the highest-value hole".

**The port modelled the page all along.** `src/state.js:564` has
`shadowOam: new Uint8Array(256)`, and `porttrace.mjs`'s `peek()` has mapped
`$0200-$02FF` to it since it was written. Nobody had ever asked the CARTRIDGE
for it - page $02 simply was not in the watch list.

### What I did

1. Added `$0200-$02FF` to `scenarios.json`'s `watch` (616 -> 872 addresses) and
   re-recorded all 36 scenarios from the cartridge.
2. Added a **DISPLAY LIST** block to `compare.mjs` rather than grading the page
   field by field, because a blanket comparison would be wrong AND a blanket
   `knownFail` would be dangerous. `src/oam.js:146` does `oam.fill(0xF4)` and
   says so; the cartridge's blank pass `$8BAB` writes `$F4` into the **Y byte
   only** of slots past the cursor and leaves their tile/attribute/X stale. So
   hidden slots differ in bytes 1-3 *by construction* - 36,244 slot-frames of
   it on `idle` alone. What is compared instead is exact and is not weaker:

   * **(A)** the Y byte of all 64 slots, every frame, always - the byte `$8BAB`
     actually writes, so nothing excuses it;
   * **(B)** all four bytes (tile, attribute, X, Y) of every slot the
     **CARTRIDGE** is showing. Liveness is read off the oracle side on purpose:
     a port drawing nothing would have zero live slots and could not satisfy
     (B) by agreeing with itself.

3. Added DISPLAY LIST COVERAGE, a corpus-level check in the same family as
   CLAMP and DEATH coverage, that fails when a scenario's artifact has no
   watched page $02 (a stale artifact would otherwise make the whole block stop
   running silently - the exact regression shape w5 wrote down about `$0A`), or
   when the corpus contains zero live slots.

### The measured result

```
=== DISPLAY LIST COVERAGE ($0200-$02FF) ===
  36/36 scenarios compared, 786816 slot-frames, 170765 live
    (every byte of these compared: Y, tile, attribute, X)
  [PASS] 0 Y mismatches, 0 live-slot content mismatches
```

**Zero.** Across all 36 scenarios and 12,294 frames, every sprite the cartridge
draws - slot, tile, palette, flips, priority, X and Y - is byte-exact in the
port. **There was no display-list regression hiding in the blind spot.**

### SEEN RED, and this is the proof the blind spot was real

`src/oam.js` `nextSlot`, the `$8AF2` slot stride, `+$C4` -> `+$C0`:

| scenario | TIER 1 (the old corpus) | DISPLAY LIST (new) |
|---|---|---|
| autofire-normal | **all TIER 1 fields exact** | FAIL: 9651 Y, 45 live-content |
| enemy-waves | **all TIER 1 fields exact** | FAIL: 27322 Y, 305 live-content |
| idle | **all TIER 1 fields exact** | FAIL: 3678 Y, 3 live-content |
| terrain-death | **all TIER 1 fields exact** | FAIL: 3158 Y, 62 live-content |

Every sprite in the game moved to the wrong OAM slot and the 616-address corpus
reported **`all TIER 1 fields exact` on all four scenarios**. 43,809 wrong
bytes, invisible. That is the blind spot, measured rather than asserted.

Second break - drop the attribute OR mask at `$8AE3` (`attr | orMask` ->
`attr`), which is a CONTENT error, not a placement error:

```
enemy-waves   [PASS] TIER 1: 650 fields, 0 divergent
              [FAIL] DISPLAY LIST: 0 Y mismatches, 310 live-slot content
              ATTR  f1787 slot 13: rom 35 port 34
```

Third - the coverage arm. Restoring a pre-wave-99 artifact for one scenario:

```
[DISPLAY LIST] page $02 is NOT in the watch list -- not compared
... 1 display-list coverage failures
```

and green again the moment the current artifact is put back.

**A COVERAGE LIMIT I FOUND WHILE DOING THIS, and it is worth writing down.**
The attribute-mask break above is **GREEN on `autofire-normal`** and red only on
`enemy-waves`. Measured why: `$0180-$0195` (the metasprite attribute OR mask)
is non-zero on **157 of 135,234 recorded samples, and only in `enemy-waves`**.
So `$8AE3`'s `ORA` is exercised by exactly one scenario in the corpus. If
`enemy-waves` is ever deleted or shortened, nothing tests it at all.

---

## 5. Cross-wave regression hunt

The specific risk the narrowing created: a wave that only re-ran its own
scenarios cannot have seen a break it caused in someone else's. I attacked it
three ways.

1. **The whole corpus, re-recorded and re-compared** (§1). 36/36 scenarios,
   12,294/12,294 frames, 0 failures. Every wave's scenarios were run against
   every other wave's code. **No cross-wave regression exists in any watched
   address.**
2. **The interaction points named in the brief**, all of which are watched and
   all of which are exact across the full corpus: `$0100` status /`$0120` anim /
   `$0140` timer / `$0160` ring (105 addresses), the parallel enemy arrays at
   `$0300`/`$0320`/`$0340`/`$0360`/`$0380`/`$03A0`/`$03E0` (133 addresses), the
   `$0400`-page arrays including `$0460`-`$0469` and `$046C`-`$0475` (100
   addresses), and the `$0700` HUD/VRAM queue image `$0700-$074F` plus the two
   rings and the score (137 addresses).
3. **The one interaction point that was NOT watched - enemies vs the display
   list and the OAM rotation - is exactly where I found the hole**, and having
   closed it, it is clean too (§4). The OAM rotation `$2F` itself was already
   compared as `oamBase`; what was not was where each sprite LANDED.

**No cross-wave regression was found.** See §7 for the honest verdict on what
that means.

---

## 6. Deliberate breaks: does a suite grown over eight waves still bite?

Nine breaks, from six different waves, each applied to `src/`, graded, and
restored. `sha256sum -c` over all 21 `src/*.js` files after every batch:
**SRC RESTORED byte-identical**, every time.

| # | wave | break | result |
|---|---|---|---|
| 1 | 5 | `$97B3` checkpoint mask `AND #$0E` -> `#$0F` (flow.js) | **RED** 2 tests |
| 2 | 5 | `$97B5` checkpoint cap `>= 8` removed (flow.js) | **RED** 1 test |
| 3 | 6 | `$BFF0` shot hit-point X `$BFCE+sub` -> `+sub+1` | **RED** 4 tests |
| 4 | 6 | `$C002` shot hit-point Y `$BFD6+sub` -> `+sub+1` | **RED** 1 test |
| 5 | 6 | `$A1C7` missile X step `$A1A6` -> `$A1A8` | **RED** 2 tests |
| 6 | 7 | `$C1CA` armoured accumulator `s0460[j+12]` -> `[j]` | **RED** 1 test |
| 7 | 8 | `$EF57` octave wrap `=== 4` -> `>= 4` | **RED** 1 test |
| 8 | 2 | `$88A8` HUD phase `AND #$03` -> `#$01` | **RED** 13 tests |
| 9 | 3 | `$A2DF` spawn mask `AND #$0E` -> `#$0F` | **RED** 1 test |
| 10 | 1 | `$8AF2` OAM slot stride `+$C4` -> `+$C0` | **RED** 3 tests |
| 11 | 1 | `$8B39` OAM rotation `+$44` -> `+$40` | **RED** 1 test |

Numbers 1, 2, 6 and 7 are the four the reviewers specifically flagged as
corpus-GREEN and held by a single unit test each - w5's breaks D and S, w7's
armoured accumulator, w8's octave wrap. **All four still bite.** The unit
suite is load-bearing, not decorative.

**Nothing I broke passed.** Every one of the eleven went red. Combined with the
three neuters the gate injects (`lead1`, `seed-x+1`, `laginject=450`, all red)
and the 39 asset mutations, that is 53 breaks scored this session with 0
survivors.

---

## 7. Did the narrowing cost us?

**No - and I can put a number on it rather than an opinion.**

The narrowing's stated risk was that a wave would break someone else's
subsystem and nobody would look until the batch. I re-recorded the whole corpus
cold, re-compared all 36 scenarios and 12,294 frames, ran the full gate, ran
the render gate, and fired eleven deliberate breaks across six waves. **I found
zero regressions.** Not one field, in any scenario, in any wave's code, has
drifted. The oracle artifacts every wave from 6 on declined to re-record turn
out to be byte-identical to a cold re-recording from the cartridge.

So the trade paid. The five hours per wave the narrowing saved bought a real
saving and cost, as far as 12,294 frames can tell, nothing.

**But the experiment does not deserve full credit, and here is the honest
qualification.** The corpus that all those narrowed waves were re-running was
itself blind in exactly the place they all knew it was blind. Page `$02` had
zero watched addresses; a wrong OAM slot stride left `all TIER 1 fields exact`
on every scenario I tried it on. So "no regression found by the corpus" was a
weaker statement than it sounded for waves 5-8, and *nobody would have found a
display-list regression whether they re-ran 8 scenarios or 36.* The narrowing
was not what put that hole there, and re-running the full corpus every wave
would not have closed it - only watching the page does, which is what this pass
did. The four waves that skipped `rendergate.py` are a closer call: that IS a
check going unrun, and it IS the shape trap 5 warns about, though it happens to
be a check the port's own code cannot regress.

**The real lesson is not about narrowing at all.** It is that every wave from 5
to 8 wrote down the same blind spot, in almost the same words, and correctly
identified it as the highest-value hole - and it stayed open for four waves
because writing a blind spot down is not the same as closing it. The worklog
discipline worked perfectly: I found this in fifteen minutes because four
agents had told me exactly where to look. What was missing was anyone whose job
was to act on it. That is an argument for having this pass, not against the
narrowing.

---

## 8. What is STILL not covered by anything

Honest list, measured where I could measure it.

1. **`$0500-$06FF`, the terrain collision map.** Still unwatched. MEASURED this
   pass: it is **0/512 non-zero in the cartridge's own seed RAM at the align
   frame of `idle`, `terrain-death`, `enemy-waves` and `long-idle`** - stage 1's
   camera pages 0-3 contain no solid tile bits, as `00-recon-terrain.md` says.
   Adding the 512 addresses would be a constant-zero watch. It is not
   worthless - it would catch a streamer writing a block at the wrong index,
   which is precisely the regression w5 named - but it costs 512 addresses and
   ~60% artifact growth to check a constant. `peek()` does not map the range;
   the one-line change is
   `if (addr >= 0x0500 && addr < 0x0700) return state.terrain.coll[addr - 0x0500];`.
   **Left open deliberately, with the measurement, rather than half-done.**
2. **`$8AE3`'s attribute OR mask is exercised by ONE scenario.** 157 non-zero
   samples of 135,234, all in `enemy-waves` (§4). One scenario deep.
3. **The sprite budget `$9F` and `$36`.** Still the only INFO field, still
   diverging on every frame of every scenario, still for the stated reason.
   `w_0036` is not a regression; it is the unmodelled budget. Nobody has
   measured how close the force field's second `$8AAC` drives `$9F` to its `$3E`
   seed (w7's open item) - I did not either.
4. **Everything behind a loud throw.** Unchanged and unchangeable from a button
   script: game over `$97F1`/`$96FB`, two-player `$18 == 1` anywhere, stage-5
   `$C03D`/`$C290`, armoured `$C05F-$C08D`, wall-break `$C2DC`/`$C32F`, enemy
   bullets `$C24B`, types `$27`/`$29`, `$C18C`'s destroy-everything arm, the
   attract demo `$846F`. I confirmed nothing reaches them; I cannot judge
   unwritten code.
5. **Box classes 1, 2 and 3.** `$0460-$0469` is still 0 on every recorded frame.
   Unchanged since w5 flagged it.
6. **`$19 != 0`.** Every stage table (`$833F`/`$8346`/`$834F`/`$9A3D`,
   `$C2A5`'s stage-3 and stage-5 arms) is indexed only at stage 0 by every
   scenario. Unchanged.
7. **`$00FC-$00FF`.** Still outside the watch list (`$00B0-$00FB` only).
8. **Audio is still not synthesised.** `state.apu` is a shadow nothing turns
   into samples; only the write sequence and digest are compared.
9. **The long-window behaviours.** Longest compared window is `enemy-waves` at
   1465 frames. The BCD overflow arm `$849A` and the extra life `$84D3` remain
   unreachable at these scores.
10. **The browser path.** `loadResources()` over HTTP, the launcher, and
    `games/gradius/index.html` booting in a real browser are still untested by
    anything; everything goes through `tests/helpers.js`.
11. **`tools/build-dist.mjs` and its ROM-leak guard - I DID NOT RUN THEM.**
    Wave 99 added no assets and touched no asset tooling, but I am recording the
    omission rather than implying coverage. `assets/` remains gitignored and
    `git status` confirms nothing under it is tracked.
12. **The Batman/Mixup tree at the repo root and `games/ddpdoj/`.** Out of
    scope, untouched, unmeasured by me. See the warning in §9.

---

## 9. A WARNING FOR THE NEXT AGENT: the index was poisoned when I arrived

`git status` at the start of this session showed **staged deletions of files
that still exist on disk**, from a concurrent ddpdoj agent:

```
D  docs/worklog/ddpdoj/01-review.md      (exists on disk)
D  docs/worklog/ddpdoj/02-impl-object-driver-and-overrun.md   (exists)
D  games/ddpdoj/src/*.js                 (12 files, all exist)
D  games/ddpdoj/tools/*                  (7 files, all exist)
M  games/ddpdoj/tools/oracle/*           (6 files)
```

This is the same incident w7 flagged, still live. `git commit` commits the
INDEX: a plain `git commit -m ...` from this state would have **deleted the
whole ddpdoj port** as a side effect of committing a gradius worklog. That is
the broken HEAD `docs/worklog/README.md` rule 2 exists to prevent, and it was
one command away.

**I did not clear it and I did not commit it.** Clearing another agent's index
is as destructive as committing it - it may be mid-operation. I committed with
an explicit pathspec (`git commit -- <files>`), which commits only the named
paths and leaves the rest of the index untouched, and I verified the resulting
commit's file list afterwards. **Whoever owns ddpdoj: your index is still
staged with those deletions. Deal with it before you commit anything.**

---

## If someone picks this up cold

* The corpus is now **872 watched addresses**, not 616. Any artifact in
  `tools/oracle/out/scen/` recorded before this commit is stale, and
  compare.mjs will now TELL you so (DISPLAY LIST COVERAGE goes red) instead of
  silently comparing fewer fields. Re-record with
  `python games/gradius/tools/oracle/scen.py`.
* The gate is now **8 stages**, not 7. The new one is `rendergate.py` and it is
  the slow one (~4 min).
* The full sequence I ran, end to end:
  ```
  python games/gradius/tools/oracle/scen.py
  node   games/gradius/tools/oracle/compare.mjs
  node   games/gradius/tools/test-all.mjs
  python games/gradius/tools/oracle/rendergate.py
  node   --test games/gradius/tests/
  ```
* If you want to see the display-list check bite in ten seconds: change
  `0xC4` to `0xC0` in `src/oam.js`'s `nextSlot` and run
  `node games/gradius/tools/oracle/compare.mjs --only idle`.
