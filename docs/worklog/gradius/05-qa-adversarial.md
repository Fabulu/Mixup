# QA (adversarial) for gradius wave 5 — death, respawn, checkpoint; un-truncate the corpus
status: DONE
wave: 5   role: qa   started: 2026-07-29   commit under review: `0ac07d4`

## The task, as I understood it
Adversarial review of `0ac07d4`. READER — no `src/` edits in the working tree, no
commits. NARROWED remit: the fast gate, plus only the oracle scenarios wave 5
touches; read the diff against ROM bytes; break >= 2 of the wave's new checks and
watch them go red; and enumerate explicitly WHAT I DID NOT RE-RUN.

Verdict: **defects-found (moderate/minor only).** Nothing I could do made the port
diverge from the cartridge. The wave's code is, as far as I can drive it, faithful.
What I did find is four ported behaviours with **no check of any kind** and one
source/commit-message claim that is measurably false.

## What I MEASURED

### 1. The gate — I ran it, it is green, 0 stages skipped

```
$ node --test games/gradius/tests/
# tests 189 / # pass 189 / # fail 0 / # skipped 0 / # todo 0   (11.0 s)

$ node games/gradius/tools/test-all.mjs
  23 scenarios, 7047 of 7047 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 stale annotations,
  6 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins).
  [PASS] inputs / unit tests / assets == the cartridge / port trace shape /
         port vs cartridge / self-check (3 deliberate breaks all red)
  GREEN -- 6 passed, 0 failed, 0 SKIPPED

$ python games/gradius/tools/verify_assets.py --self-test
  31 of 31 mutations reddened their target; 12 of 12 families seen red

$ node tools/build-dist.mjs
  rom-leak guard: 121 files checked against 2 ROM(s) -- clean, 1 deliberate exception
```

The implementer's headline numbers reproduce exactly on my run. The "6 fields
SKIPPED" are the pre-existing emulator-only probe fields, not a wave-5 regression.

### 2. I re-recorded the oracle side for the four wave-5 scenarios — byte-identical

```
$ python games/gradius/tools/oracle/scen.py --only terrain-death terrain-death-miss right-wall intro-respawn
  terrain-death       640 frames  lag=2 [283, 622]
  terrain-death-miss  640 frames  lag=1 [283]
  right-wall          640 frames  lag=2 [283, 614]
  intro-respawn       700 frames  lag=2 [283, 614]
md5 before == md5 after for all four (94573286.., 7b9ad0e2.., 727f44b1.., 8e8d68ae..)
```
So the oracle artifacts in the tree are ones I have myself reproduced from the
cartridge; they are not something I am taking on trust.

### 3. The terrain cell, re-derived independently

```
$ python games/gradius/tools/oracle/kill.py --frames 640 --script "200:,10:S,190:,240:" --at 500
  mode=hit  poked=[0x5b3]  $C2C1 fired, $1B == $A0 first at frame 501
            at poke frame: playerX=80 playerY=96 page=5 idx=179 shift=4 mapByte=16
  mode=miss poked=[0x5b4]  $C2C1: 0,  $1B == $A0: None
  mode=none poked=[]       $C2C1: 0,  $1B == $A0: None
  [PASS] x3
```
`idx=179` = `$B3`, `shift=4` -> mask `$30`, `$10 & $30 != 0`. Confirmed.

### 4. ROM bytes vs the diff — `dis6502.py linear`, every routine the wave claims

`$BFDA-$BFE1 = 10 20 30 10 | 10 20 30 02` and `$C0FA-$C100 = 2D 2E 2F 30 30 00 00`
read straight off `Gradius (USA).nes`, and `games/gradius/assets/collision/tables.json`
carries exactly those 15 bytes (and is gitignored — `.gitignore:22 assets/`).

Checked instruction by instruction and found FAITHFUL: `$BFE2/$C047/$C049/$C04B/$C052`
(nine iterations, the `$5C >= 2` RTS, the JMP tail), `$C0C7/$C0CC` (the dying gate),
`$C0CE-$C0F4` (including the `$C0F1 STA $0140` falling through into `$C0F4 DEC`),
`$C101-$C13A`, the carry-clear borrow at `$C12E`, `$C16E-$C1B5` (dispatch order
`$27`, `$29`, `>= 3`, `!= 1`, status 0, status 6), `$C1B8`'s BPL, `$C1D6`'s six
stores and its `JMP $C2C4` (not RTS), `$C20A`, `$C2A5-$C2C1`, `$C2C4-$C2FE`'s two
tail arms, `$C2FF`, `$C3A3/$C3D3`, `$979D-$97EE`, `$9B3E-$9B76`, `$9C09`, `$96EF`,
`$9A5E-$9A70` (call ORDER: spawn, bullets, player, enemies, THEN `$BFE2`).

### 5. Corpus facts I re-derived from all 23 artifacts (not quoted)

```
$0460-$0469 over every compared frame of every scenario : {0}      (box class 0 only)
$19, $1A, $42, $46, $5C, $18, $22, $24, $26, $28        : {0}
$3F over the corpus {0,1,2,3};  $3F on every $1B==$A0 frame: {0}
$0A in the seed of all 23 = 1; = 1 on every compared frame (it is 0 only on frames 0-280, pre-align)
seed $0123-$012B (shots) and $0136-$013F (bullets)      : {0}
seed $0500-$06FF nonzero byte count, every scenario      : 0
dying frames ($1B == $A0) inside compared windows        : 823
  right-wall 121, terrain-death 121, diag-ru-ld 121, lr-both 121, speed6-right 121,
  diag-rd-lu 107, speed3-diag 111, terrain-death-miss 0
post-death intro frames ($1B in 1..4 after f500)         : 100 + 25 (intro-respawn)
```
823 matches the commit message exactly. So does the "$3F is 0 at every death" claim.

### 6. Deliberate breaks — 22 of them, run on a scratch copy of the port

Method: `games/gradius` copied to the scratchpad (src/tests/assets/tools + the
`out/scen` artifacts), one anchored single-occurrence edit at a time, then
`compare.mjs --only right-wall,terrain-death,terrain-death-miss,intro-respawn,idle,lr-both,speed6-right,diag-ru-ld,enemy-waves`
(9 scenarios, **3223 frames, baseline 0 failures**) plus the whole unit suite, then
restore. **The tracked working tree was never edited** — `git diff --stat -- games/gradius`
is empty and was checked after every batch.

| break | corpus | units |
|---|---|---|
| `die()` clears `$60` unconditionally (`>= $80`) | **RED** 292 fails, `w_0060` first at **f493** | RED (1) |
| explosion returns instead of falling into `$C0F4 DEC` | **RED** 5 fails, `w_0140` first at **f544/552/533/566/496** | RED (1) |
| `$4C = $77` instead of `$78` | **RED** 867 fails, first at f613 | RED (3) |
| `dy` without the SBC borrow | **RED** 197 fails, playerX first at **f446** | RED (2) |
| `$C2B5` dying gate dropped | **RED** 161 fails, first at f622 | RED (1) |
| `$24,X` forced to 8 (the clamp) | **RED** 159 fails, `w_0024`/`w_0055`/`scrollHi` at f614 | RED (1) |
| `$979F DEC $20,X` dropped | **RED** 10 fails, `w_0020`@614/622/603/636, `w_0706` 2 frames later | RED (2) |
| `state.bandB.ran = false` dropped (nmi.js) | **RED** 10 fails, `chrOffset`@614/622/603/636 | RED (1) |
| `$BFE2` loop made 10 iterations | **THROW** `$BFE2 ran 10 slots, not 9` | RED (28) |
| `$C1EB STA $0160` dropped | **THROW** `collision tables: $C110 is not in any exported range` | RED (1) |
| `$BFDA + cls` -> `$BFDA` (ignore class) | green | RED (1) |
| `a1 = playerY + 7` | green | RED (2) |
| `$22,X` store dropped | green | RED (2) |
| `$33` store dropped / `$3A` store dropped | green | RED (1 each) |
| `probeCollision` mask `$F8` -> `$F0` | green | RED (3) |
| `$9C09` fall-through out of `introPackets()` dropped | green | RED (1) |
| **`$26,X = $19` swapped with `$28,X = $1A`** | **green** | **green** |
| **`$26,X`/`$28,X` stores deleted** | **green** | **green** |
| **`$97DB STX $18` / the whole `$97C5` switch deleted** | **green** | **green** |
| **`clearAhead()` deleted from `respawn()` (`$97EB`)** | **green** | **green** |
| **`$C125 BCC $C136` deleted** | **green** | **green** |

### 7. Why `$97EB JSR $9C09` is dead, and why the source says otherwise

`src/flow.js` (clearAhead docstring) and the commit message both say:

> "`$97EB JSR $9C09` inside the respawn and `$980B JMP $9C09` on the game-over arm
> both enter sub_9C09 on their own, and **on those paths this store is the only
> thing that clears `$57`**."

`dis6502.py linear 9B3E`:
```
9B3E  A2 5A     LDX #$5A
9B40  A9 00     LDA #$00
9B42  95 3D     STA $3D,X      -> $3D .. $97 inclusive
```
`$57` is inside `$3D-$97`, and `$97EE JMP $9B3E` runs **four instructions after
`$97EB`**. That is the *identical* situation to `$97E3 STA $5D`, which the
implementer correctly documented as dead-and-unfalsifiable. Measured: deleting
`clearAhead(state)` from `respawn()` is green on 3223 corpus frames and green on
the whole unit suite. The `$9C09` fall-through from `introPackets()` IS live and IS
tested (`flow-unwitnessed.test.js` #75 goes red) — that half of the claim holds.

### 8. Coverage, proportional to the content

Counting what the wave ported: ~39 distinct ROM behaviours in `src/collision.js` +
`respawn()`/`clearAhead()`. **Corpus-exercised: 12.** Unit-only: 19.
**No check of any kind: 6** — `$97AF STA $26,X`, `$97BF STA $28,X`, `$97C5-$97DB`
(the two-player switch), `$97EB JSR $9C09`, `$C125 BCC $C136`, and the
`$C2A5/$C2B0/$C2F8` per-stage arms (`$19 == 2` odd-frame gate, `$19 == 4` RTS,
`$19 == 2` tail RTS — `$19` is 0 on every frame of every scenario and no unit test
sets it).

Of those six, `$C125` and the player switch are **provably no-ops** on this port
(`$C125`: `u8(a0 - x) < width` with `a0 in [20,244]` and `x <= 255` requires
`x > a0 + 240 >= 260`, impossible; the switch: `$0A == 1` and `$18 == 0` make every
arm write 0 back). `$26,X`, `$28,X` and `$97EB` are the ones that could hide a real
error the day a wave moves `$19`, `$1A` or `$57`.

### 9. The terrain-death scenario can silently stop testing anything, and nothing notices

The implementer flagged the hard-coded `$05B3` as camera-dependent. I can state the
consequence precisely, because `terrain-death-miss` already **is** the experiment:
a poke that lands on a non-ship cell produces a scenario that dies on neither side
and passes green. So if the script, the align frame or the camera ever move,
`terrain-death` degrades into a second `terrain-death-miss` and the gate stays green
at 23/7047/0. `compare.mjs` has a CLAMP COVERAGE block for exactly this failure mode
on `src/player.js`'s four constants; there is no equivalent assertion that
`terrain-death` reached `$1B == $A0` (or that `right-wall` did). `kill.py` re-derives
the cell but is not part of the gate.

### 10. Smaller things

* `src/collision.js:348` — `*   C20A  A2 09 / 86 A8` and `:367 // $C20C STX $A8`.
  ROM is `C20A A9 09 LDA #$09 / C20C 85 A8 STA $A8`. Same at `:194` for `$C101`
  (`A9 09 / 85 A8`, the comment says "X ="). Comment-only.
* `scenarios.json` `intro-respawn.why`: "Aligned at 614 because `$979D` is wave 5 —
  seeding one frame earlier would put the port on the arm that throws." `$979D` is
  ported now and that arm no longer throws; the sentence is stale (rule 6). Not
  load-bearing: `right-wall`, `terrain-death` and four others compare f614/f622 in
  their own windows, so the respawn frame IS compared.
* `probeCollision()` returns the mask *normalised* (`(byte >> shift) & 3`) where
  `$C40B AND $C40F,Y` returns the byte *masked in place* (`$10`, not `1`). Equivalent
  for `$C2BF BEQ` (the only caller) and for `$C2CF`'s own shift loop, so this is a
  modelling choice, not a defect — but it is undocumented at the function.
* `$C3D3`'s `CLC / ADC #$08 / ADC $3E` is a two-add chain; `probeCollision()` computes
  `u8(screenX + 8)` first and drops the carry out of the first add. Unreachable
  (player X clamp is [16,240], so `screenX + 8 <= 248`), so not a defect — but it is
  a boundary the port cannot be driven to and nothing says so.
* `$A0-$A8` are written on every frame by `$C105`, `$C20E`, `$C3D3` and by every
  loop in the wave, and **none of them is in `scenarios.json`'s watch list** — so
  every `state.spawn.zA8 = ...` in `src/collision.js` is unfalsifiable by the corpus.
  The iteration counts themselves were measured by exec hook, which is the right
  evidence; the stores are not.
* `$0500-$06FF` is not watched and is all-zero in all 23 seeds, so the port's
  512-byte collision map is compared against the cartridge's at exactly one cell
  (`$05B3`, one frame, one scenario).

## What I could not do, and why

* I did not make the port diverge from the cartridge on any frame. Every source
  mutation that could produce a wrong game either went red or was provably a no-op
  under this corpus' invariants. That is a real result, not a shrug.
* The `$C1C1` shield arm, `$C1AF` capsule, types `$27`/`$29`, `$C24B`, `$C290` and
  the game-over arm are throws; I confirmed the throws fire and carry ROM addresses,
  but I cannot judge unwritten code.
* Concurrency note: another agent's worklog (`05-review-fidelity.md`) appeared in the
  tree during my run. All my breaks were done on a scratchpad copy for that reason.

## WHAT I DID NOT RE-RUN  (hand this to the final full-corpus pass)

1. **`scen.py` for 19 of the 23 scenarios.** I re-recorded only `terrain-death`,
   `terrain-death-miss`, `right-wall`, `intro-respawn` (byte-identical). The other
   19 artifacts are the implementer's 19:04-19:11 recordings. A regression there
   would look like: a stale artifact recorded before `$0A` joined the watch list
   (would surface as a missing-field crash, not silence), or a Mesen/ROM mismatch —
   both loud. Low risk, but unmeasured by me.
2. **`compare.mjs` on 14 of the 23 scenarios for the BREAK runs.** My break subset was
   9 scenarios / 3223 frames: right-wall, terrain-death, terrain-death-miss,
   intro-respawn, idle, lr-both, speed6-right, diag-ru-ld, enemy-waves. NOT in the
   break subset: intro-boot, pause, long-idle, s0-handover, left-wall, up-wall,
   down-wall, diag-rd-lu, corner-br, corner-tl, ud-both, speed3-diag, opt2-wiggle,
   wiggle. A regression there would look like a break of mine that I scored "green"
   actually being red on `diag-rd-lu`/`speed3-diag` (the other two scenarios that
   die) or on `pause`/`intro-boot`. The **baseline** run of all 23 was green (§1).
3. **Pixels.** `test-all.mjs` has no framebuffer stage for Gradius. The death
   explosion draws metasprites `$2D-$30` from `$C0FA` and nothing compares the OAM
   bytes: only `s0y/s0t/s0a/s0x` (sprite 0 only) and the three sprite-work counters
   are TIER 1. A regression would look like the explosion drawing the wrong tiles,
   the wrong palette or in the wrong slot order, with `spritesStored` still exact.
   Frames to look at: right-wall/terrain-death 494-613.
4. **The `$19 != 0` arms of `$C2A5`.** `$19 == 2` (stage 3: probe only on odd `$02`,
   and RTS at `$C2FE` while alive) and `$19 == 4` (stage 5: RTS, no terrain at all).
   Nothing in the corpus and no unit test sets `$19`. A regression would look like
   stage 3 probing terrain on every frame instead of every other one.
5. **Box classes 1, 2 and 3.** `$0460` is 0 on every frame ever recorded. The
   class-3 test is labelled LISTING-DERIVED by its author and I agree with the label.
   A regression: a real class-1/2/3 enemy in wave 6+ using the wrong half of
   `$BFDA/$BFDE`.
6. **The checkpoint formula's mask.** `$3F` is 0 at every death; only the CLAMP is
   corpus-visible (0 vs 8). `min($3F AND $0E, 8)` itself rests on
   `tests/collision.test.js` replaying the recon's three intervention rows. Nobody
   has re-run `flowprobe.py --poke 003F=N` this wave, including me.
7. **`$C0EB`'s Option clears (`$0121`/`$0122`).** `$45 == 0` corpus-wide, so both
   bytes are 0 before and after. Unit-test only.
8. **The spawn-frame invulnerability `$C1B8 BPL`.** Unit-test only; every enemy the
   corpus' one contact touches has had bit 7 set for many frames.
9. **A second death, a death with a shield, a death at `$1B >= $81`, and game over.**
   None reachable; `$97F1`, `$C1C1`, `$C1AF` are throws.
10. **`$0500-$06FF` as a whole**, and `$A0-$A8`. Unwatched (§10).

## If someone picks this up cold
The scratch harness is `<scratchpad>/brk.py` + `<scratchpad>/g5` (a copy of
`games/gradius` with a `package.json` carrying `"type": "module"`, which the real
tree inherits from the repo root). `python brk.py <break-name>` applies one anchored
edit, runs the 9-scenario compare and the unit suite, and restores. Baseline in that
copy: corpus 9/3223/0 failures; units 179 pass / 5 fail (the 5 are touch-pad tests
that need files outside `games/gradius` — ignore them, read the DELTA).
