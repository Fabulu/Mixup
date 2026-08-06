# Wave 13 review - the scroll program, ported

status: **DEFECTS FOUND (none blocking the port's arithmetic).** The scroll
subsystem itself is correct: every ROM address it cites checks out byte for byte
against the decrypted image, all four scenarios and all nine mutations reproduce
exactly, and I broke the code three times and watched two independent
instruments go red. The findings are in the *page* half - the published-bundle
gate was left behind by this wave and the deliberately weakened missing-tile
check has no coverage at all.

date: 2026-08-02
role: reviewer (READER - nothing under `games/ddpdoj/src/` was changed and
nothing was committed; the three temporary breaks below are restored and
verified byte-identical by SHA-256 against `acd39f0` in both directions)
target: `ddpdojblk`, VERSION-B. No emulator was launched: every measurement
below replays TSVs and dumps already on disk.

---

## 1. WHAT I RE-RAN, WITH ACTUAL OUTPUT

```
$ node tools/scrollportgate.mjs
FRAMES 10431 compared (lf1621..12051), window ended at lf12052: $8130D2 rose ...
COLS   12: d0ce d18a d18c b012 b016 b034 b038 b03c scr0 scr1 bgx bgy
EXTSPEED $813180 consumed on 1 frame(s) (lf 4379)
SCROLL EVENTS the port's VM executed: spawn=22 bgelem=13 cue=1 defer=1
MAP COLUMNS written into $900000 by $240D76: 669
RESULT 0 DIVERGENT FRAMES on 12 columns over 10431 logic frames

$ node tools/scrollportgate.mjs tools/oracle/out/bg-attract.tsv --entry 0x38 --k 2636
RESULT 0 DIVERGENT FRAMES on 9 columns over 1364 logic frames
$ node tools/scrollportgate.mjs tools/oracle/out/bg-deep.tsv      -> 1668, 0 divergent
$ node tools/scrollportgate.mjs tools/oracle/out/bgrecon.tsv      ->  980, 0 divergent
```

14,443 frames, reproduced to the frame. Nine mutations, all red, with the
per-column counts the worklog claims (`commit-the-fraction` 3 columns,
`upload-subtracts-shake` `bgx=42 bgy=35`, `prefill-14-columns` `d18a=55`), and
`no-fast-forward` red on the attract entry (**6 of 9 columns**, not 9 - §3.3).

**The port did NOT re-derive and drift.** `scrollgate.py`, re-run this review:

```
$ python scrollgate.py out/w17-stage1-invuln-p2.tsv 0 1620 0
  frames compared: 10431   handler-skipped ($8130D2=1): 308
  DIVERGENT: clock=0  cursor=0  acc=0  b012=0
$ python scrollgate.py out/bg-deep.tsv    0 1620 0     -> 1668, all 0
$ python scrollgate.py out/bgrecon.tsv    0 1620 0     ->  980, all 0
$ python scrollgate.py out/bg-attract.tsv 0 2636 0x38  -> 1364, all 0
```

The two instruments cover the **same** frames: the Python model skips
lf12052..12359 as flagged, the JS gate stops at lf12052, and 12359−1620−308 =
12051−1620 = 10431. Independent translations, same board, same answer.

```
$ python tools/oracle/pgm.py flyaround --reuse   RESULT 0 DIVERGENT FRAMES on 88 columns over 2200 logic frames
                                                 WALLHITS 284 ($261126)
$ node tools/determinism.mjs ... --poke 810424=FF IDENTICAL -- 2200 lf, 88 columns, three runs
                                                 digest 97ba8550...  (= flyaround's)
$ python tools/oracle/pgm.py demogate            PASS 15955968/15955968 = 100.0000%
$ python tools/oracle/pgm.py demogate --break bg-frozen-camera
                                                 EXPECTED-RED 3773953/15955968 = 23.6523%
$ node --test tests/                             200 pass, 0 fail
$ node --check tools/breakage.mjs                (the W12.5 blocker) OK
$ python tools/oracle/pgm.py check               VERDICT: ALL GREEN -- 35 passed, 0 failed, 0 SKIPPED
```

## 2. THE LISTING, SPOT-CHECKED - no build-A address is a defect

Disassembled and compared instruction by instruction against `background.js`:
`$26127A`, `$26114C..$26123C`, `$261116`, `$26152C`, `$2612A0..$2613AA`,
`$2613AC`, `$2613B4..$2613FA`, `$2613FC..$26141E`, `$261420..$26146A`,
`$26146C..$261524`, `$261F76..$261FD8`, `$261FDA..$262060`, `$262062..$2620C0`,
the seven-longword table `$2620C2`, `$2620DE`, `$262102`, `$26213A`, `$26214C`,
`$262160`, `$262180`, the three-entry table `$2621AA`, `$2621D6`'s four arms,
`$262316`, `$240B0E..$240B92`, `$240B94..$240C20`, `$240C22..$240CBE`,
`$240CC0`, `$140FFE`, `$240D62..$240DA0`.

Everything matches. The five things a reader gets wrong are all right in the
port, and I checked each against the bytes:

* `$262082 addq.w #2,A1` - the record's second word is **SKIPPED**, no test.
* `$262130 addq.w #1,D0` before `($14,A6)`, and `$261FD0` reloads from `($12,A0)`.
* `$26207C cmp.w D1,D7 / bne $262096` - exact equality, and `bne` leaves the
  **whole script**, which the port models by `break`ing the inner loop.
* `$240BA4 andi.l #$FFFFFFC0` / `$240BB0 andi.l #$3F` on both axes and both
  builds' word twins.
* `$2620EC beq $262100` skips `$2620FC`, so the SPAWN terminator arm does not
  write the cursor back; `$26218C beq $2621A8` does the same for CUE.

**THE FALL-THROUGH, verified:** `$26200A dbra D1,$261FFA` is followed
immediately by `$26200E tst.w $8130CE` with no branch between them, so
`$261FDA` really does fall into `$26200E`. The port's `installScripts` calls
`fastForward` unconditionally at its end. Correct.

**The one build-A address is justified and the justification is measurable.**
`$140FFE` and `$240CC0` are byte-identical apart from `$240CDE sub.w
$80B054,D0` / `$240CE4 sub.w $80B056,D1` - I read both. The wave decides between
them from data, and the gate's `upload-subtracts-shake` switch reddens `bgx` on
exactly 42 frames and `bgy` on 35 and nothing else. That is the right shape of
argument. `NOTES-build-split.md`'s own vector probe was taken on a default
(VERSION-A) boot and the file says so itself, so the note alone would **not**
have carried this; the 10,738-frame measurement is what does.

## 3. FINDINGS

### 3.1 MODERATE - `bundlegate.mjs` was not updated, so the weakened missing-tile check has ZERO coverage

`tools/demogate.mjs` was taught to draw the port's `$900000` and the port's
scroll registers. `tools/bundlegate.mjs` was **not**:

```
tools/bundlegate.mjs:196   const game = new Game(seed, tables, {
                             logicFrame: seedLf, videoFrame: cap.frames[0].vf,
                           });                       <- no bgSeed
                           ...and no `st.bg = game.vram.w`, no `st.regs` splice
```

So the gate whose stated job is "does the SAME path, fed the exported bundle,
produce the SAME pixels?" now renders the **capture's** background while the
page renders the **port's**. Consequence, and it is the part that matters:

```
$ grep -rn "missingBgTiles|BG_TRANSPARENT_PEN" src/ tools/ tests/   (excluding assets.js)
src/web/app.js:42, :273, :340        <- three comments and one status-line read
```

Nothing tests it. `demogate` constructs `new Renderer(roms)` off the real
IGS023 regions and never calls `tileFn` at all, so it cannot reach the branch
either. A deliberately weakened load-time check - an unconditional `AssetError`
turned into a silently-counted transparent tile - shipped with no gate.

I exercised it by hand and it does behave as documented, but that is my probe,
not a shipped check:

```
TX missing -> AssetError | BG missing -> counted 1, pen 31, all 1024 bytes pen 31
9,000 frames of the page's own loop: lf 11000  clock 836 ($0344, the boss lock)
  cols 441  bgx 16734  scroll events 19  err none
  distinct missing BG tiles in the ring: 126
```

**`verifyCoverage` IS genuinely untouched** (reviewer item 5): the diff does not
touch it, and it indexes `sheet.slot[no]` directly rather than going through
`tileFn`, so the capture's own coverage failure still throws by name at load.
That half of the split is sound.

### 3.2 MODERATE - the wave's own re-run list never touches the published bundle, and the bundle in the tree is stale

`tools/export-tables.py` gained four ROM windows; `rip/port/player.tables.json`
has 20, `assets/player.tables.json` still has 16. Running the page's bundle
path today:

```
$ node tools/bundlegate.mjs --assets assets --dump rip/pix-demo --tsv .../demo.tsv
Unreached: UNPORTED $261682: word at $261682 is outside every ROM window
  at interpret (src/background.js:641)   at backgroundFrame (:826)
```

With `player.tables.json` refreshed from `rip/port/`:

```
PASS: the PUBLISHED BUNDLE renders 15955968/15955968 = 100.0000% identical to MAME over 159 frames
$ node tools/webgate.mjs --assets <fresh>     PASS (11 files, one frame, 98.8% non-black)
```

`assets/` is gitignored and `tools/publish.mjs` runs `bundlegate.mjs` and prints
`Rebuild the bundle: node games/ddpdoj/tools/export-web.mjs` on failure, so the
deploy is protected and this is not a committed defect. It is still a finding:
§10 "RUN IT AGAIN" lists ten commands and none of them is `export-web.mjs`,
`bundlegate.mjs` or `webgate.mjs`, `pgm.py check` does not run them either, and
§8's claims about what the page shows were therefore never executed against a
bundle. A reader following the worklog gets ALL GREEN and a page that throws in
its first frames.

### 3.3 MINOR - a shipped comment overstates a measured red

`scrollportgate.mjs:152` (`EXPECTED_GREEN`) says `no-fast-forward` is "MEASURED
red on all 9 of that trace columns". Measured:

```
RED on 6 column(s): d0ce=1364 d18a=1361 d18c=1357 b012=1364 b034=1364 bgx=1363
```

`b016`, `b038` and `bgy` stay green (the entry clock only moves the along axis).
The worklog §4 says "6 of 9" correctly; the code comment does not, and the code
comment is the one a future wave reads.

### 3.4 MINOR - a mutation that BLOCKS does not say so

`main()` prints `BLOCKED` only for the clean run. On the mutation path it prints
the RED line and drops `r.blocked` on the floor. Confirmed:

```
prefill-14-columns: compared 55  blocked {"lf":1676,"name":"Unreached",
  "message":"UNPORTED $225B54: longword at $225B54 is outside every ROM window"}
  diverged d18a=55, everything else 0
```

The worklog §4 says "The gate reports the divergences it had gathered AND the
block" - it reports the divergences only. A mutation that blocked with *zero*
divergences would print `RED on 0 column(s): first undefined@lfundefined`:
non-green, but it would point a reader at nothing.

### 3.5 MINOR - one of the plan's three named reds was replaced without saying so, and the IRQ6 gating is unproven

`20-plan` W14's done-when names `commit-the-fraction`, **`upload-outside-gate`**
and `skip-entry-fastforward`. Shipped: the first (✓) and `no-fast-forward` (=
the third, ✓). `upload-outside-gate` is silently replaced by
`upload-subtracts-shake`. The substitute is a better mutation, but nothing in
the tree now proves the register upload is **gated** by `$13C7E6`'s semaphore
rather than run unconditionally: `scrollportgate.mjs:236` calls `uploadRegs`
directly, once per logic frame, so it structurally cannot test the gating, and
`bgx`/`bgy` are not RAM and so are not in `WATCH_SPEC`. The only evidence is
demogate's 159 frames. Also unaddressed from the same done-when: the rowscroll
digest column ("job: prove it stays zero") was not added; rowscroll is still the
capture's, argued from the recon's static + 13,600-frame dynamic absence.

### 3.6 INFORMATIONAL - `commit-the-fraction` does not reach the init

`backgroundInit` calls `camTxAccumulate(ram, d0, 0x800)` and
`camBgAccumulate(ram, d0, 0x800)` with three arguments; `mut` is `undefined`
there. Harmless - `d0` is 0 at both measured entry clocks and `$800` is already
`& ~$3F`-aligned, so the mutation would change nothing anyway - but the switch
is narrower than its description.

### 3.7 INFORMATIONAL - `$26C24A`, and what the 0-divergent claim does not cover

Read this wave, and the implementer's description is exact:

```
26c220: lea $227AF8,A1 ; lea $9000BC,A0 ; tst.w $803926 / beq -> A0 = $9000A4
26c23c: moveq #$16,D6            <- 23 columns
26c240: moveq #$8,D7             <-  9 rows
26c242: move.l (A1)+,D4 ; addi.l #$32A90000,D4 ; move.l D4,(A2) ; adda.w #$100,A2
```

A tile base that is none of the five per-stage bases, into `$900000` directly,
for 271 frames (W17: lf4315..4585, 64 % of the stage's BG-map traffic). No
compared column in this wave can see it, and the worklog says so in §7 and §12.
Not a wave-13 defect - the plan assigns it to W15/W16/W18 - but it is the
largest open risk to W15's picture and it is still unread.

### 3.8 INFORMATIONAL - the live `$8130CE` arms a page-killing throw

Making the odometer real turns `player.js`'s
`unreached(0x249814, 'THE BOMB ($249814)')` live for the first time: on the
published page, pressing Button 2 more than four frames into a run now throws a
named `Unreached` instead of doing nothing. Loud-and-named is this project's
policy for an unported path, so this is correct behaviour, but §11/§the player.js
comment say "this branch is live for the first time" without saying that the
consequence is the page stopping on an ordinary button press.

### 3.9 INFORMATIONAL - `crossFromBoard` and the two-player arms

Confirmed exactly as declared. I read all seven branches of
`$261420..$261464` and both `$2613FC` call sites against the bytes and the
translation is right, including the inverted `bcc`/`bls` senses at
`$261450`/`$26145A` and the `moveq #0,D1` fall-in at `$261460`. It is
unvalidated dynamically: `$810448`'s bit 15 is clear in every scenario on disk,
so `$261420`'s second call returns at its first instruction always. The
implementer flags this himself; I found nothing wrong with it, and nothing that
would let a reader believe it is covered.

## 4. THE TWO CLAIMS I CHECKED HARDEST

**§5, `$8130D2`'s intra-frame order - CONFIRMED from the raw rows, and the
decision to end the window is right.**

```
w17-stage1-invuln-p2      lf12051  d0d2=0000  b012=00147380  d18c=0380
                          lf12052  d0d2=0001  b012=00147480  d18c=0480   <- ADVANCED
bg-deep                   lf3288   d0d2=0000  b012=000361C0  d18c=01C0
                          lf3289   d0d2=0001  b012=000361C0  d18c=01C0   <- DID NOT
```

Same flag, opposite answer, 8,763 frames apart. There is no rule available from
the sample point, and both readings are measurably wrong on the other run.
Ending the window is the only honest option and the gate says so out loud.

**`EXT_SPEED_PUSH` - better than the worklog gives it credit for.** The worklog
calls it "one hardcoded measured pair in a gate ... a number from a worklog
rather than from the TSV". It is a number from a worklog, but it is
**constrained by the gate**: I changed `[0x0020, 0x0020]` to `[0x0040, 0x0040]`
and got

```
RESULT 9 of 12 columns diverged   first d18c@lf4379 port=40 board=20
```

and I emptied the map entirely and watched the guarded throw fire at lf4378. So
the value is not a free parameter and the missing-measurement guard is real.
`$813180` is non-zero on exactly one frame of one TSV in the corpus (lf4378 of
`w17-stage1-invuln-p2`; the other three traces do not carry the column), so the
throw never fires in normal use - which is what it is for.

## 5. RED VALIDATION OF MY OWN REVIEW - three breaks, watched, restored

Every check I leaned on, I broke first.

| break | what | result |
|---|---|---|
| 1 | `crossAxis`: `$813176` written as `step + 1` | `pgm.py flyaround` **RED**: `DIVERGE scroll first at lf=2001: port=1 board=0`, `1 of 88 columns diverged` |
| 2 | `backgroundInit`: the two `D1 = $800` init steps changed to 0 | `scrollportgate` **RED**: `b016`/`b038`/`bgy`, 10,431 frames each, first at lf1621. `flyaround` stayed GREEN - correctly: it seeds from board RAM with the warm-up bits already set, so the init never runs there. Two instruments, disjoint coverage, each honest about it |
| 3 | `writeMapLong`: `+1` on the map longword | `demogate` **GREEN** - and that is right: `buildBgMap` reads `colour = (attr & $3E) >> 1` and `flip = (attr & $C0) >> 6`, so bit 0 is unused. Re-broken as `+$10000` (the tile number): `FAIL ... 15179775/15955968 = 95.1354%`, first divergent lf2028. So demogate does see `$240D76`'s output |

Restored and verified in both directions:

```
games/ddpdoj/src/background.js        committed=1d5c7e85... working=1d5c7e85... SAME
games/ddpdoj/tools/scrollportgate.mjs committed=02832bfc... working=02832bfc... SAME
```

and the gates are green again (`0 DIVERGENT ... 12 columns`, `0 ... 88 columns`,
`100.0000%`, `200 pass 0 fail`).

## 6. WHAT I DID NOT RE-MEASURE

* **`pgm.py shipgate` and `pgm.py firegate`.** Both re-trace under MAME and are
  not in `pgm.py check`; shipgate ran past my time budget mid-output and
  firegate timed out. A regression there would look like a non-zero `RESULT`
  line from `shipgate.mjs`/`firegate.mjs` - the risk this wave creates for them
  is the same one it creates for every gate: object type 1 now joins the
  driver's slot walk and clears each player's `($5c,A1)` every frame, and
  `$8130CE`/`$813176` now move. `flyaround` (88 columns, same driver, same
  scenario) and `dlgate` both stayed green inside the full `check`, which is
  indirect but real cover.
* **A fresh `w17run.py` corpus.** Everything above replays TSVs produced by
  wave 17. If those were wrong, this wave and the recon are wrong together and
  neither instrument would say so.
* **The tile PICTURE past the capture window.** No gate renders a frame the
  recording never flew over; W15's job, and §3.1 is the check that is missing
  for it today.
* **`$26C24A`'s 271 frames.** Nothing compares BG-map bytes; `w20mapgate.py`
  exists but was not run against the port.
* **The real browser.** `webgate.mjs` renders one frame over HTTP and passes on
  both a stale and a fresh bundle, so it is not sensitive to §3.2.
