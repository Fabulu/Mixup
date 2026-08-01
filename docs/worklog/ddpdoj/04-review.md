# Wave 4 review — skeleton + the player: fly around

status: DONE — verdict DEFECTS-FOUND (the headline reproduces; two defects and a
list of unexercised paths behind it)
wave: 4   role: review   started: 2026-08-01

I am a READER. I edited two files under `games/ddpdoj/src/` **only** to red-
validate two checks, as the brief instructs, and restored both; every file is
byte-identical to its pre-review hash and to HEAD's blob (§"Restored"). I did
not commit and I did not touch `games/gradius/` or `games/batman/`.

## The task, as I understood it

Verify by content, not by report. Check hardest: VERSION-B vs build A
addresses; do the cited ROM addresses match the bytes; the fall-through trap;
are the new checks capable of failing (break >=2, watch red, restore, hash);
anything silently unported that reads as finished; every slowdown figure
labelled "MAME-timed, uncalibrated".

## What I MEASURED

### 0. Machine pin, re-derived on every run I made

```
MACHINE romname=ddpdojblk maincpu_size=6291456 maincpu_fnv64=D4C25CA9C91B9D47
image sha256 4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c
```

Same as the implementer's. Framebuffer looked at (project trap 4):
`out/snap/fly-around_lf004190.png` is real stage-1 gameplay — ship pinned at
the bottom wall, ~20 enemy bullets, options drawn. Not `ROM ERROR !`, not the
input test.

### 1. IS IT VERSION-B? — the build-A ISR addresses are CORRECT, measured by me

`src/isr.js` and `src/input.js` are written against `$13BDBA / $13C7D4 /
$13D464 / $13C7E6 / $13C806` — build A. I did not take the implementer's word
for it. I wrote my own Lua probe (scratchpad `revvec.lua`: a write tap on
`$803970` with `CURPC` attribution plus periodic reads of the RAM vectors,
handles in globals) and ran it through `pgm.py`'s pinned launcher with the
VERSION-B boot script:

```
vf=400..2600 IRQ4 $801470=$13BDAA   IRQ6 $801478=$13BDBA   (all 7 samples)
P1 MIRROR STORE executions by PC:
   $13D43E : 1        $13D488 : 2578        $23D0D2 : 1
TOTAL buildA(13xxxx)=2579  buildB(2xxxxx)=1
```

So on a VERSION-B run the interrupt handlers really are build A's, and build
B's per-frame mirror store `$23D11C` never executes. **The `$13xxxx` addresses
in this wave are justified and the code says why, in three places.**
The main loop, frame sync, object driver and player are all `$23xxxx/$24xxxx`.
`CENSUS armpc` on the compared window is `23C212:2200` — 100 % build B.

### 2. The cited ROM addresses match the bytes — spot-checked with `xref.py dasm`

Checked against the decrypted image, instruction for instruction: `$2494FA`
(the whole player update), `$2417DE`, `$241812`, `$241850/$241870/$241890/
$2418B0`, `$249574..$24967C` (input, accumulator clear, the four clamps and
their overshoot give-back), `$24A42A`, `$261126`, `$23BFDC`, `$23BE8C`,
`$23C212..$23C398` (the whole governor), `$13BDBA`, `$13C7D4`, `$13D464`,
`$249E4E`. Every operand, branch sense and constant in the comments is what
the listing says — including the two that are easy to get backwards:
`$24960C bhi` (unsigned, skips the clamp) and `$2495FA bcc` after `subq.w`
(borrow, so the step happens on the frame the counter wraps past 0).

### 3. THE HEADLINE REPRODUCES — fresh MAME run, not `--reuse`

```
$ python games/ddpdoj/tools/oracle/pgm.py flyaround
SEED   lf=2000  2200 logic frames compared (lf 2001..4200)
COLS   31 compared: lf vf irq6 rel c390a c390d c390e p1raw p1edge p1prev p2raw
       p2edge objn objord objlive py px paccy paccx ptc ptilt pspd pang pst pf1
       pdir pbtn anima0 anima1 animb0 animb1
WALLHITS 284 ($261126) [x min, x max]
MASKED pst bit $1000: differed on 109 of 2200 frames, first at lf2571
DIGEST cdb190c5d71443997136054d8c4b4c7b605bf01e2ad249a4be552272e5ba776c
RESULT 0 DIVERGENT FRAMES on 31 columns over 2200 logic frames
BUILD required=B frames_on_required=3501 frames_on_other=699
```

Byte-identical digest to the committed one. Coverage recomputed by me straight
off my own TSV, and every number the worklog claims is exact:

```
py==$6500: 44   py==$0800: 992   px==$3500: 162   px==$0300: 202
angles: 0 8 16 24 32 40 48 56 255      tilt: -32..+32 step 4, both signs
objlive: {8}   irq6: {1}   armpc: {23C212: 2200}
nonzero paccy 1004   paccx 639
```

Also reproduced: `node --test games/ddpdoj/tests/` → 18 pass / 0 fail /
**0 skipped**; `pgm.py check --quick` → **ALL GREEN, 10 passed, 0 failed, 0
SKIPPED**; `export-tables.py --verify` → `VERIFY OK`; `determinism.mjs` → three
runs one digest `cdb190c5…`; `pgm.py gate` → `635bb92f1a9dc81e968bab5e755f807e
78c0c18538af5cfc8c29974520d84884` twice, IDENTICAL — wave 2's recorded hash, to
the character, so the `frame.lua` edits really are inert by default.

The four mutations all go red, and I looked at the per-column detail rather than
the exit code:

```
clamp-first       py/paccy   lf2087 (port=25875 board=25856)  then 9 more cols
edge-after-store  p1edge     lf2001
no-tilt-decay     ptilt      lf2321
lsr-not-asr       py/paccy   lf2001 (port=4720 board=4719)
```

### 4. DEFECT — `$23BE8C` is ported only as far as `$23BEB2`

The routine does not end where `src/main.js` `#counters()` stops. The listing:

```
23beb2: move.w  $80390a.l, $803910.l
23bebc: andi.w  #$3, $803910.l          <- NOT PORTED
23bec4: move.w  $80390a.l, $803912.l    <- NOT PORTED
23bece: andi.w  #$7, $803912.l          <- NOT PORTED
23bed6: move.w  $80390a.l, $803914.l    <- NOT PORTED
23bee0: andi.w  #$f, $803914.l          <- NOT PORTED
23bee8: rts
```

Measured, after the 2,200-frame fly-around (scratchpad `probe910.mjs`, driving
`portdiff.run()` in-process, digest `cdb190c5…` so it is the shipped run):

```
$80390A = 3501
$803910: port=3501   ROM writes $80390A & 3  = 1     <-- MISMATCH
$803912: port=5      ROM writes $80390A & 7  = 5     OK (coincidence at this frame)
$803914: port=5      ROM writes $80390A & 15 = 13    <-- MISMATCH
```

`$803912`/`$803914` are never written by the port at all; the 5s are the lf2000
seed values. Two things make this worse than an omission:

* **It carries no `unportedLog.note`.** Every other unported thing in `main.js`
  does. `src/unported.js`'s own header says "a silent no-op is what this file
  exists to prevent"; this is one, in the file that imports it.
* **`tests/player.test.js:271` asserts the wrong value**, citing the very
  instruction whose next line masks it:
  `assert.equal(g.ram.u16(RAM.frameCounterCopy), c0 + 7);   // $23BEB2`.
  After 7 iterations the board leaves `7 & 3 = 3`. A test that would block the
  fix.

Why the gate cannot see it: `CLAIMED` is 31 named columns. `d_ram` — the full
main-RAM digest — is in the TSV and is **not** compared. Any unported write to
unwatched RAM is invisible by construction.

Why it matters beyond wave 4: build-B absolute-long readers, a LOWER BOUND
(reg-relative and PC-relative are invisible to `xref.py`, and it says so):

```
$803910: 13 sites   $803912: 20 sites   $803914: 4 sites
```

e.g. `$252A7C`, `$25E54C`, `$26A3DE`, `$27EE68`, `$28000C`, `$26FAC2` — mod-4 /
mod-8 / mod-16 phase counters, exactly what stage and enemy scripts key off.
Wave 5 inherits it.

### 5. DEFECT — `lsr-not-asr` cannot be the mutation it is named for

`tools/breakage.mjs:46-53` implements `dy += Math.sign(dy)`, not a logical
shift, and its comment says the difference is "invisible until a component is
negative — i.e. on three quadrants out of four". Both halves are wrong, and
`src/vectors.js`'s own header already contains the argument:

* the `$200D20` quadrant tables hold **0 negative values in 64 levels x 65
  entries** (measured, straight out of `rip/port/player.tables.json`), and
* `$24183A asr.l #4` runs **before** the quadrant negation at `$241870 /
  $241890 / $2418B0` (confirmed in the listing),

so a genuine `lsr.l #4` swap is a provable no-op on every value the table can
supply. And the mutation as written fires at **lf2001 on quadrant 0** — the one
quadrant its comment says it is invisible on. The check has teeth (it does pin
`dy` to the unit) but it does not validate what it says it validates, and a
reader will believe ASR-vs-LSR is load-bearing at `$24183A` when it is not.

### 6. RED-VALIDATING THE NEW CHECKS — two broken, both red, both restored

**Break 1 — `src/player.js`, `$24A42A` tilt step 4 -> 3.**

```
node --test games/ddpdoj/tests/   -> 18 pass, 0 fail    <-- did NOT catch it
pgm.py flyaround --reuse          -> EXIT 1
  Unreached: UNPORTED $249E62: tilt -29 is outside the [-$20,+$20] step-4 range
```

Red, loudly, with the ROM address — but through the scenario, not the unit
suite. Worth knowing which check is actually the check.

**Break 2 — `src/machine.js`, `P.posX` `0x04` -> `0x06`** (the "both sides of
the comparison depend on `w4_watch()`" worry the implementer raised).

```
pgm.py flyaround            -> EXIT 1, before MAME even starts:
   P.posX: src/machine.js says $6, pgm.py's copy says $4
pgm.py flyaround --reuse    -> EXIT 1, DIVERGE px first at lf=2001
                               port=64000 board=5312
```

Both guards work. Note `_w4_assert_syms()` only runs on the **fresh-trace**
path (`w4_watch()` is not called under `--reuse`), and `check`'s four RED stages
all use `--reuse` — so the assert is not on the path the runner exercises. The
comparison caught it anyway.

**Restored.** `sha256sum -c` against the pre-review manifest: all 19 files OK.
`git hash-object` vs `git rev-parse HEAD:<path>`: identical for every one
(the raw-hash differences are the CRLF checkout filter, not content).

### 7. What the gate does NOT exercise — counted, not asserted

Measured off my own TSV over the 2,200 compared frames:

| path | evidence it never runs |
|---|---|
| every speed mode | `pspd` is **22 on all 2200 frames**. The writers `$24C8CE`/`$24C900` live in the UNPORTED option object, so the port cannot produce another index. The wave's "done when" names "each speed mode". |
| dilation / the (B) path | `irq6` is **1 on all 2200 frames**; `armed_vblanks 1:4200`. So `main.js:133`'s multi-vblank loop and `isr.js:49`'s `return false` (the (A) gate) never execute. |
| the frame-sync divider and most of the governor | `$80392E/$803930/$803932` all 0. Only "mod3 != 0 -> 1" and "load below threshold, counter 0 -> 1" run. `governorOver()`, `armTwo()`, the `$803934 >= 5` path and both index guards: never. |
| `$249518` (`bclr #2,($1,A6)` / `speedIdx = baseSpeed`) | word bit 13 of `pst` is never set: `pst` takes only `$8000 $8020 $9000 $9020`. |
| the `invuln == 0` else-branch (`$24953C`) | the `$810424=$FF` poke holds it non-zero for the whole window. |
| P2, TYPE-B | `p2raw` constant `$7F80`, `p2edge` constant; `($58,A6)` 0 throughout. `p1edge` is non-zero on only **28** of 2200 frames. |

The `$810424` poke and the `pst $1000` mask are both legitimate as used —
verified: the port never sets bit 12 anywhere, and `$24952A bclr #4,(A6)` is
reached unconditionally whenever `($3e,A6) != 0`, which the poke guarantees.
But the poke's price is the `$24953C` branch, and that is not stated.

### 8. Smaller things

* `clamp-first` and `no-tilt-decay` are broader than their names: `clamp-first`
  routes through `finish(..., skipClamps=true)` and therefore also removes the
  tilt ramp/decay; `no-tilt-decay` pins tilt to 0 rather than removing the
  decay. The clamp evidence survives — `py`/`paccy` diverge at lf2087, 234
  frames before the tilt columns at lf2321 — but the mutation is not minimal.
* `src/main.js:14/16` quote per-call cycle costs (`77,725 cyc`, `15,594 cyc`)
  with **no** "MAME-timed, uncalibrated" label. `budget.js` and
  `portdiff.mjs`'s `DILATED` line both carry it. `NOTES-oracle.md:136` still
  reads "`armed_vblanks` — 2 or 3 is the deliberate divider" in the §4 legend
  with no pointer to the §"CANNOT SEE THE DIVIDER" correction 280 lines below.
* "Button 3 does NOT change speed — **corrects** the build-A recon" overstates
  it. `00-recon-memmap.md:248` measured B3 held = 313 on **build A** and nobody
  re-measured build A this wave, so what is established is a build DIFFERENCE,
  not an error in the recon.
* `CLAMP_ORDER` (`player.js:56`) is a mutable module-level export in shipped
  code. `breakage()` resets it; `portdiff.run()` does not, so an in-process
  caller that runs `--break clamp-first` and then a clean run would carry the
  mutation. Not reachable today (the RED stages are separate processes), but
  wave 6 ships this switch to the browser.
* ROM-derived output is gitignored twice over: `games/ddpdoj/rip/.gitignore`
  is `*` and the root `.gitignore:29` has `rip/`; `git check-ignore -v` on
  `rip/port/player.tables.json` confirms.

### 9. THE SHARED INDEX — still armed, and worse than "deletions"

`git diff --cached --name-status HEAD`: **27 staged deletions** of ddpdoj files
— all 12 `src/` modules, `tests/player.test.js`, `portdiff.mjs`,
`breakage.mjs`, `determinism.mjs`, `export-tables.py`, `assets.py`,
`zoomcov.py`, `xref.py`, `phase.lua`, `objhunt.lua`, four worklogs and
`NOTES-assets.md`. AND stale pre-wave-4 blobs staged for the files it does not
delete:

```
tools/oracle/pgm.py         index=59669cd1  HEAD=300e945e  disk=300e945e
tools/oracle/frame.lua      index=7f223839  HEAD=11ccf264  disk=11ccf264
tools/oracle/scenarios.json index=220597e8  HEAD=2f5356c0  disk=2f5356c0
```

So a `git commit` without a private `GIT_INDEX_FILE` would not only delete wave
4's port; it would also **revert the oracle's wave-4 additions** — `flyaround`,
`PROBE_WATCH`/`PROBE_PORTIN`/`PROBE_POKE`, and the `fly-around` and
`speedmodes` scenarios. I did not touch the shared index.

## What I could not do, and why

Listed so a final pass can schedule them; an unmeasured area I name is a check,
one I imply I covered is a hole.

1. **`speedmodes` was not re-run.** Base idx 22, Button 2 = idx 28 = 313,
   Button 1 = ramp 22->12 one step per 4 frames / one per frame up, Button 3 no
   change: I confirmed 22 -> (246,163) and 28 -> 313 out of the exported ROM
   table and that `$24C8BE/$24C8E4` disassemble as described, but I did not run
   the scenario. A regression looks like wave 5 building the laser ramp on the
   wrong cadence — invisible until buttons enter a compared scenario.
2. **The hitbox lead `$2458C0`, half-extents `($14,A6)`/`($16,A6)`, flag
   `bset #4,(A6)` at `$2458D8`** — not disassembled by me. The `pst` mask's
   justification rests on `$2458D8` being the only setter of that bit; I
   verified the port never sets it, not that nothing else on the board does.
3. **The option-object addresses** `$24D130`, `$24C33E/$24C342`, `$24C310`,
   `$24C384` — not checked against the ROM.
4. **Wave 2's forced-overrun result** (slots processed == slots live on all 696
   frames) — not re-run. It is the entire basis for `NEVER_TRIGGERS`.
5. **`pgm.py check` in full** — I ran `--quick` (10 stages) plus `flyaround`,
   the 4 mutations, `determinism`, `export-tables --verify` and `gate`
   separately. Not re-run: `zoomcov`, `sprites`, `sound`, `rtc`, `drc`,
   `inputlead`, `seedstate`, `objdriver`, `overrun`, `pixred`, and the
   `stage1-deep` / `overrun` / `chooser` scenarios.
6. **Pixel comparison of the fly-around scenario** — the gfx gate ran inside
   `check --quick` on its own corpus; I looked at one fly-around framebuffer by
   eye, not by diff. Wave 6's job.
7. **`ddpdojp` protection cross-check and RTC-across-days determinism** —
   untouched, as in every wave so far.

## If someone picks this up cold

The two things to fix before wave 5 touches the object table:

```
src/main.js  #counters()   port $23BEBC..$23BEE8: the &3/&7/&15 derived counters
tests/player.test.js:271   currently asserts the unmasked value
tools/breakage.mjs:46      rename/re-aim 'lsr-not-asr' -- a faithful lsr swap is
                           a NO-OP at $24183A (0 negative table entries, and the
                           negation is after the shift)
```

And the standing repo hazard: `export GIT_INDEX_FILE=.git/ddpdoj.index;
git read-tree HEAD; git add <paths>; git diff --cached --name-only` — read it —
`git commit; unset GIT_INDEX_FILE`. The shared index is still carrying 27
deletions and three stale oracle blobs.
