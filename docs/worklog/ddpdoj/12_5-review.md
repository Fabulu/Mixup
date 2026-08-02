# WAVE 12.5 REVIEW — the $24C476 fall-through

status: **DONE** — the port of `$24C476` is correct instruction for instruction
and its gate is real and can fail; but the commit ships a **JavaScript syntax
error in `tools/breakage.mjs`** that kills `portdiff.mjs`, and with it
`pgm.py flyaround`, `pgm.py shotgate`, `tools/determinism.mjs` and seven stages
of `pgm.py check`. The wave's own reported `flyaround` FRESH result cannot have
come from the committed tree.

wave: 12.5   role: reviewer   started/finished: 2026-08-02
commit under review: `3fc87ed`
target: `ddpdojblk`, VERSION-B (`maincpu_fnv64=D4C25CA9C91B9D47`, 6,291,456 B),
MAME 0.288, `-noreadconfig`, private cfg/nvram.

Every number below was produced on this machine in this session.

---

## 1. WHAT I RE-RAN

```
pgm.py verify
  MACHINE romname=ddpdojblk maincpu_size=6291456 maincpu_fnv64=D4C25CA9C91B9D47
  refresh_hz=59.185606061  cycles_per_frame=337920

pgm.py firegate                     (FRESH -- new MAME trace, 4,572 lf)
  CENSUS exec_fhb4x pc=$24C4BC total=2448 over 4572 logic frames
  CENSUS exec_fh35w=129 fh34w=387 fh34d=774 fh35d=258 fhb3c=129 fhb4c=129
         fhb4y=258   fh35z=0 fhb4s=0 fh34i=0
  BUILD required=B frames_on_required=3873 frames_on_other=699
  WINDOW lf2001..4572: 2572 frames, 2572 with the board IN $24C476, 0 without
  SEEN  fire edges on 128 frames; cadence pair non-zero on 2571; $24D480 on 386
  BOARD ($34,A4)/($35,A4) non-zero on 2572 of 2572; max ($35,A4) = 2
  ARMS  all eleven port==board
  RESULT free-running 2571 frames, 0 DIVERGENT
  RESULT re-seeded    2572 frames, 0 DIVERGENT              exit 0
  -- every headline number in the worklog reproduces EXACTLY, fresh.

pgm.py firegate --reuse --break {handshake-dropped,bclr3-inverted,
        bclr4-inverted,burst-no-bias,noedge-rts}                ALL FIVE RED
pgm.py firegate --reuse --break {edge-on-raw,burst-mask-6,delay-no-two}
                                                  ALL THREE EXPECTED-GREEN OK

pgm.py shipgate --reuse   0 DIVERGENT / 2200 lf   DIGEST b800b1edb6670f7b
                          (== 12-review's digest, unchanged)
pgm.py shipgate --reuse --break all   ten mutations, TEN RED, hitx-frozen green
node --test tests/        174 tests, 174 pass
pgm.py demogate           PASS 15955968/15955968 = 100.0000%
node tools/webgate.mjs    PASS 11 files, one frame 100352 px

pgm.py flyaround --reuse  *** DIED: SyntaxError in tools/breakage.mjs ***
pgm.py shotgate  --reuse  *** DIED: same ***
node tools/determinism.mjs ...  *** DIED: same ***
```

With a one-character-per-line local fix to `breakage.mjs` (reverted, hashed both
ways):

```
pgm.py flyaround --reuse  DIVERGE scroll first at lf=2321  RESULT 1 of 72   exit 1
pgm.py shotgate  --reuse  RESULT 0 of 72 diverged; BLOCKED at lf4461 by $24C180
```

## 2. THE BLOCKING DEFECT — `tools/breakage.mjs` does not parse

```
$ node --check games/ddpdoj/tools/breakage.mjs
games/ddpdoj/tools/breakage.mjs:197
    + '($20,A4) is 0), so `lsr.b #1` and the ship twin's `lsr.w #1 / andi.b '
                                                       ^
SyntaxError: Unexpected identifier 's'
```

Two unescaped apostrophes inside single-quoted strings, both added by this
commit, in `FIRE_EXPECTED_GREEN`: line 197 `the ship twin's` and line 203
`$24C4EC's`. `git show 3fc87ed^:...` parses; `git show 3fc87ed:...` does not, so
the commit introduced it.

`tools/portdiff.mjs:26` and `tools/determinism.mjs:22` import it, so:

| command | at HEAD |
|---|---|
| `pgm.py flyaround` (and every `--break`) | dies before comparing anything |
| `pgm.py shotgate` | dies |
| `node tools/determinism.mjs` | dies |
| `pgm.py check` stages: fly-around, 5x fly-around RED, replay determinism | 7 FAIL |

`pgm.py firegate` and `pgm.py shipgate` are unaffected — `firegate.mjs` does not
import it and `pgm.py` reads `FIRE_EXPECTED_GREEN` out of the file **as text**,
which is why the EXPECTED-GREEN declarations still work and why the wave never
noticed. The wave's §8 "no regression" section reports
`python pgm.py flyaround (FRESH) ... RESULT 1 of 72 columns diverged`; that run
predates the `breakage.mjs` edit and was not repeated.

## 3. THE ROM, READ OUT MYSELF

`xref.py dasm 24C476 132` and `xref.py dasm 24C3D0 176`, this session. The
transcription in `src/options.js` is **exact, instruction for instruction**,
including the branch senses:

| listing | port |
|---|---|
| `24c3e2/24c3ec/24c3f6 bne $24c476`, `24c402 beq $24c476`, `24c470 jsr $23efee` then `24c476` | five `return fireHandshake(...)` ✓ |
| `24c476 btst #4,($41,A6) / beq $24c4bc` | `btst8(opt+OPT.edge,4)` ✓ (`OPT.edge` = `$41`) |
| `24c482 btst #0,($1,A4) / beq` → `24c48a move.w #$8,D0` | `if (btst8(player+P.flags1,0)) d0 = 8` ✓ |
| `24c48e lsr.b #1` **no `andi.b #6`** | `(d0 & 0xff) >>> 1` ✓ |
| `24c498 bclr #3 / beq $24c4ac` (Z from the OLD bit) | `bclr8` returns the old bit; `if (b3)` falls into `$24C4A0` ✓ |
| `24c4ac bclr #4 / beq $24c4d8`; `24c4b4 move.b #1,($34,A4) / bra $24c4f6` | ✓ — the only path to the `rts` |
| `24c4bc bclr #4` (read-modify-write, runs every no-edge frame) | ✓ |
| `24c4c2 tst.b/beq`, `24c4c8 subq/bne`, `24c4ce subq`, `24c4d2 bset #4` | ✓ |
| `24c4dc btst #0,($1,A4) / bne`; `24c4e4 cmpi.w #$8,($20,A4)` **no `tst.w ($58,A4)`** | ✓ |
| `24c4f2 bra $24d480` | loud named throw ✓ |
| `24c4f6 rts`, and `24c4f8 btst #2,(A6)` is formation 4 | genuine end, not a fall-through ✓ |

Register convention verified from `$24C096`: `lea $8104AA,A6` / `lea $8103E6,A4`
(P1, D7=1) and `$24C0B0 lea $81050E,A6 / lea $810448,A4` (P2, D7=0). So A6 IS
the option block and A4 the player, as the wave says — the opposite of the ship
twin. Ship twin `$249B48` re-read: `lsr.w #1` + `andi.b #$6` at `$249B66/8`,
`bset #3,(A6)` at `$249B7C` (a *different byte*), and `tst.w ($58,A6)` at
`$249BCE`. All four claimed differences are real.

`$24D480` (`movem.l D6-D7/A3/A5-A6 / lea $810572,A0 / movea.l $8127E8,A1 /
tst.w D7 / lea $810C32,A0`) and `$2497AE..$2497F8` (`btst #6,($18,A6)`,
`lea $8104AA,A0`, `bclr #3,($1,A0)`, `bchg #4,($1,A6)`, `bset #3,($1,A0)`,
`bset #4,($19,A6)`) both match what is quoted. No build-A address appears
anywhere in the diff (grep for `0x1[34]xxxx` / `$1[34]xxxx` over the added
lines: none).

## 4. RED VALIDATION I DID MYSELF (undeclared, in the shipped file)

Three mutations nobody declared, each written into `src/options.js`, run, and
reverted; `src/options.js` hashed `65b95816…48eb3f` before and after **each**.

```
A  fireSpawn: ram.u8(player + 0x36)  ->  ram.u8(player + 0x37)   ($24C4D8)
   firegate --reuse
     ARMS ... fh34d=517/774 ...
     free DIVERGE p34 lf=2004 port=2 board=3 (+7 more)           RED, BOTH instruments

B  no-edge arm: count fh34d on the ($35,A4)==0 early return
   (right VALUES down a wrong arm -- aimed at the SECOND instrument alone)
   firegate --reuse
     ARMS ... fh34d=2443/774 ...
     free DIVERGE arm fh34d lf=2008 port=1 board=0 (+7)          RED, arms only,
                                                                 values GREEN
C  formation2: `return fireHandshake(...)` on the $813098 gate -> bare `return;`
   firegate --reuse        0 DIVERGENT both modes                GREEN (as declared)
   node --test tests/      not ok 32 - formation 2 routes every one of its
                                       five exits into fireHandshake
                           173 pass / 1 fail
```

B is the useful one: it proves the eleven-arm instrument is genuinely
independent of the value instrument, which is the wave's best idea.
C confirms the implementer's own §9.1 warning — **and refutes one of the
tests**, see §5.

`tools/breakage.mjs` was patched locally to run `flyaround`/`shotgate` and
restored from the HEAD blob: `ba0dd8e7caa4251992c920c87cbf23629aafbb94e746192c…`
before and after, identical. (Note for later readers: `git checkout -- <path>`
in this repo restores from a **stale main index**, not from HEAD — it silently
handed me the parent's `breakage.mjs`. Use `git show HEAD:<path>`.)

## 5. `tests/fire.test.js` TEST 31 IS A CHECK THAT CANNOT FAIL

"all four early gates of formation 2 still reach `$24C476`" never calls
`formation2()`. It writes `$812970`/`$80390C`/`$813098`/`$813092` — four words
that **nothing in `fireHandshake()` reads** — and then calls `fireHandshake()`
directly. All four loop iterations are literally the same assertion. Mutation C
above proves it: with the `$813098` gate's call site replaced by a bare
`return;`, test 31 passed.

The property IS covered, by the *other* test (the source-shape assertion, five
textual `fireHandshake(ram, ctx, b)` call sites and zero bare `return;` in
`formation2`'s body) — which is exactly the test the implementer flagged as
load-bearing, and which went red under C. So the coverage is real; the *named*
test is theatre and its name and comment claim coverage it does not have.

## 6. TWO STATEMENTS THE TREE CONTRADICTS

**(a) `shotgate` does not block at `$24D480`.** The commit message,
`tools/firegate.mjs`'s header, `pgm.py _cmd_firegate`'s docstring and worklog §3
all say *"before this wave `shotgate` blocked on the first tap at `$24C180`,
after it the same tap blocks at `$24D480`"*. Measured at HEAD:

```
pgm.py shotgate --reuse
  BLOCKED at lf4461 by the named throw $24C180 -- THE LASER
  RESULT 0 of 72 columns diverged; and the run was BLOCKED at lf4461 by $24C180
```

`$24C164 btst #4,($40,A6)` fires on the tap frame, before `noLaser`/`formation2`
runs at all, so the port never reaches `$24C476` on a firing frame. The
conclusion — no live gate can exercise this block — is still right, and in fact
more strongly right; the sentence given as its evidence is wrong.

**(b) `firegate speedmodes` has an undisclosed divergence.** §4 quotes the
`BLOCKED at lf2869` line and `RESULT free-running: 618 frames compared, 0
DIVERGENT` and stops. The tool also prints:

```
  reseed DIVERGE oflg1 lf=2481 port=7 board=3
RESULT re-seeded:    619 frames compared, 1 DIVERGENCES (first 8 shown)
```

From the wave's own TSV (`out/w12_5/speedmodes.fire.tsv`):

```
lf    oflg1 ohold oedge fhb4x
2475  7     17    0     0     <- the board is on the LASER path, not in $24C476
...   7     17    0     0
2480  7     17    0     0
2481  3     0     0     1     <- hold ends, the block runs again
```

Bit 2 of `$8104AB` is the LASER LATCH (`$24C1A8`), set while the board is on a
path the port does not have. Re-seed mode takes its entry state from
`win[i-1]` — the previous **window** row, which here is a frame the board spent
in another routine — so it seeds a bit the port can never clear. Two things
follow: the instrument should seed from the previous **in-block** frame (or
refuse), and the output was quoted selectively. Harmless on the headline
scenario (`stage1-shot` has 2,572 of 2,572 frames in-block, so `win[i-1]` is
always in-block) but it is a latent hole in the second mode.

## 7. THE AUDIT — real, and narrower than it reads

Reproduced independently:

```
grep -rn "return;" src --include=*.js | wc -l          40    (claimed 40)
range citations $AAAAAA..$BBBBBB, parent tree          80    (claimed 79)
```

Spot-checks against the listing, all four correct:

```
249e84/249e8c/249e94/249e9e -> $249EE8, and 249ee2 jsr $23efc0 falls into it
  (the $249F16 -> $249EE8 note correction is RIGHT; control does reach the
   note, so it was never a quiet return)
24c8f4/24c8fe -> 24c904: 4e75 rts                      (rampUp)
253b90: 4256 clr.w (A6) / 253b92: 4e75 rts             (shots.js)
24a460: 6b08 bmi $24a46a / 24a46a: 4e75 rts            (12-review F1)
range ends: 249f88 rts, 241180 rts, 253bd2 jmp $23f3ae, 24a632 jmp $23f1fa
```

Two caveats on the method. (i) The enumeration is `return;` only. Value returns
that are equally ROM branch exits are outside it — `drawShipShadow`'s five exits
are `return false;`, not `return;`, and are in the table only because they were
already known; `isr.js:49`, `objalloc.js:172/187` and `framesync.js`'s
`return 1/2/3` were never enumerated. (ii) Two of the 40 are `FIRE_MUTATE`
hooks, not translations, and have no row. Neither turns up a second
fall-through, and I did not find one either — but "the only fall-through into
live code" rests on a sweep that did not cover every shape of ROM exit.

12-review **F1** re-confirmed OPEN at HEAD: `shipsprite.js:201` returns when bit
15 is CLEAR, the board `bmi`s to the `rts` when it is SET, and the transcription
comment still says `// $24A45E bmi -> rts` / "not live -> rts". W13's.
`pgm.py check` still runs neither `shipgate` nor `firegate` (read `_cmd_check`).

## 8. NO REGRESSION WHERE I COULD MEASURE IT

```
demogate      100.0000% (15,955,968 / 15,955,968 px)
webgate       PASS, 11 files, 100,352 px
shipgate      0 divergent, DIGEST b800b1edb6670f7b -- byte-identical to 12-review
shipgate --break all   10/10 red, hitx-frozen green (no-shadow still 1100/2035
              after formation2's `no-shadow` arm was narrowed to the two enqueues)
tests         174/174
flyaround     1 of 72 (the pre-existing `scroll`, W14's) -- ONLY with breakage.mjs
              locally repaired
fly-around.tsv, the six new CLAIMED columns: p20=0, p34=0, p35=0 constant;
              p36=3, p37=2, oflg1=$03 from lf1968 on (the 27 frames at oflg1=$01
              are all below the lf2001 window)
```

## 9. VERDICT

The port is right, the instrument is real and I broke it twice and watched it go
red. Ship the fix for `breakage.mjs` before anything else touches this tree, fix
or rename test 31, correct the `$24D480`/`$24C180` sentence in four places, and
print `firegate`'s re-seeded RESULT line whenever the free-running one is
quoted.
