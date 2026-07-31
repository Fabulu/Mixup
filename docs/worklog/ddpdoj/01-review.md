# Review of DaiOuJou wave 1 — ONE oracle, pinned to VERSION-B
status: DONE
wave: 1   role: review   started: 2026-07-31

## The task, as I understood it

Verify by content, not by report: `pgm.py gate` exists and prints IDENTICAL on
VERSION-B, has been seen RED, landmarks re-derived on build B, seeded-NVRAM
procedure committed, pixel layer looked at. Re-run the measurements. Check
hardest that it really is VERSION-B, that cited addresses match the ROM, that
the new checks can go red, and that nothing is silently unported.

I am a READER: I edited nothing under `games/ddpdoj/`, committed nothing, and
re-verified at the end that all ten wave-1 paths are byte-identical to HEAD.

## What I did

Read `PLAN-vertical-slice.md`, `docs/worklog/README.md`, `NOTES-oracle.md`,
`NOTES-versions.md`, `NOTES-slowdown-oracle.md`, the wave-1 worklog, and all of
`pgm.py` (702 lines), `frame.lua` (537), `derive.py` (337), `landmarks.json`,
`scenarios.json`. Then re-ran the wave's measurements and added five checks the
implementer did not run.

## What I MEASURED

### 0. The commits are what they say

`ac60c4e` (11 paths) → `3761405` (another workflow, reverted 10 of them from a
stale index) → `f552714` (restored, verbatim) → `d719fc0`/`977d005` (worklog).
HEAD has since moved twice more (gradius `4a7f76c`, `956968e`) and wave 1
SURVIVED both. All ten paths compare byte-identical (modulo CRLF) between
`git show HEAD:<f>` and the working tree, before and after my session.

### 1. It really is VERSION-B — verified with my own eyes, not the report's

```
$ python pgm.py snap 560,640,700,760,820,900
  CENSUS armpc 13C5B6:699 23C212:221
  BUILD required=B frames_on_required=221 frames_on_other=699
```
`snap_lf000560.png` — the chooser, cursor on `> 1: VERSION-A (OLD)`, countdown
"6", `SELECT = UP or DOWN / START = SHOT`.
`snap_lf000820.png` — the legal screen, **`2002.10.07.BLACK VER`**.
`chooser-a_lf001590.png` (the no-input control) — **`2002.04.05.MASTER VER`**.
`stage1-open.1_lf002400.png` from MY gate run — unmistakable stage-1 gameplay:
ship firing a shot stream, tanks, explosions, score 50810, `PRESS START!`.

I read all four as images.

### 2. Every cited address matches the decrypted ROM, byte for byte

`out/maincpu.bin` sha256 `4d3efd54ae0d…` (as recorded), 6,291,456 bytes,
machine pin `maincpu_fnv64=D4C25CA9C91B9D47` reproduced on every run.

```
$23BE8C  52 79 00 80 39 0A                addq.w #1,$80390A     counters
$23BFDC  4EB9 0023BE8C 4EB9 00256D5A 4EB9 00241 0BC 4EB9 0024683E
         4EB9 0023D2AE 4EB9 0023C212 4EB9 0023D12A 60 D4
         -> seven jsr abs.l then bra -44 = back to $23BFDC exactly
$23C212  13 FC 00 01 00 80 39 40   4A 79 00 80 39 0E   66 00 (disp 366 -> $23C390)
$23C248  13 FC 00 02 ...           $23C25C  13 FC 00 03 ...   (2- and 3-vblank arms)
$23C388  70 02  |  $23C38A  13 C0 00 80 39 40         moveq #2,D0 / move.b D0
$23C208 / $23C390 / $23C3BC   4A 39 00 80 39 40 66 F8  three self-branching waits
$23C44C  4A 39 00 80 39 40 67 1E   -> beq $23C472, release $23C46C lies inside
$23C46C  53 39 00 80 39 40         then 4E F9 0023C158 (jmp — NO fall-through)
$23C53A  41 F9 00 C0 00 06         lea $C00006,A0   (V3021 calendar)
$23D0F8  41 F9 00 C0 80 00         lea $C08000,A0   (inputs)
$13C398  4E 71 60 FC ... "ROM ERROR ! "   nop / bra -4, string at $13C39F
```

**The (A)-gate claim is confirmed at the byte level, which nobody had done:**
`$23C43C: jsr $23D0F8` (THE INPUT READ) `; jsr $28C19A ; $23C44C tst.b $803940 ;
beq $23C472` — the input read is genuinely *before* the gate, and the four
skipped `jsr`s (`$24133C $240CC0 $240F26 $287286`) plus the release are inside
it. "A dropped frame is not uniform" is a fact about this ROM, not an analogy.

**Fall-through trap:** no routine here claims an end it does not have. The main
loop tail is a real `bra` back to the head; the IRQ6 handler `jmp`s away after
the release. `jsr $23BE8C` has exactly one caller in the whole image (I re-ran
the search independently); `jsr $23BFDC` has **zero** — the loop head is entered
by something `derive.py`'s `4EB9`-only search cannot see, which is consistent
with its stated limits but not with the unqualified wording of its evidence
string (finding below).

`derive.py` re-derives `landmarks.json` **exactly**: I re-ran `derive()` for both
builds in-process and compared every field against the committed file — all
equal.

### 3. THE GATE reproduces, digit for digit

```
$ python pgm.py gate
  run 1: 13f8ef743e0b3a53dbcf0ae36278dbe2defc4b514e0219fe1d8f834481841382 (2600 rows)
  run 2: 13f8ef743e0b3a53dbcf0ae36278dbe2defc4b514e0219fe1d8f834481841382
IDENTICAL
  CENSUS irq6_per_logicframe 1:2584 2:15 3:1
  CENSUS releases_per_logicframe 0:1 1:2599
  CENSUS armed_vblanks 1:2600
  CENSUS work_cycles min=38070 max=402178 budget=337920 over_budget=2
  CENSUS max_sprite_entries=122
  CENSUS armpc 13C5B6:699 23C212:1901
```
Same sha256 as the commit message. Every census line matches `NOTES-oracle.md`
§4. Note this also proves the RTC's TIME-of-day does not reach compared RAM:
the two runs started ~90 s apart and are byte-identical.

### 4. RED VALIDATION — four guards broken, all went red

**(a) the build assertion, both halves, isolated.** No tools edited; I broke the
INPUT instead.

```
required B, chooser input REMOVED (versionA prefix):
  BUILD required=B frames_on_required=0 frames_on_other=1600
  FAIL NOT ONE logic frame ran in the required build B
  FAIL the LAST logic frame armed from build 1, not the required B

required A, full VERSION-B script  <- isolates the LAST-FRAME guard:
  BUILD required=A frames_on_required=699 frames_on_other=1901
  FAIL the LAST logic frame armed from build 2, not the required A
```
The second run is the important one: 699 frames genuinely ran in build A (the
chooser is build-A code), so the "not one frame" guard cannot fire and the
last-frame guard fires **alone**. That is exactly the fall-through case the
implementer says it exists for, and it works.

**(b) the pixel column.** `python pgm.py pixred` → `['d_spb', 'pix']`,
`PIXEL LAYER RED-VALIDATED`. Reproduced.

**(c) the machine pin.** `PGM_PIN=DEADBEEFDEADBEEF python pgm.py trace 20` →
`MACHINE PIN CHANGED: D4C25CA9C91B9D47 != DEADBEEFDEADBEEF`, exit 1. The
mechanism works — but it is OFF by default (finding 3).

**(d) the gate's one tolerated path, and its negative control.** Fed the two
real TZ traces through `pgm.first_divergence` + `_cmd_gate`'s predicate:
```
msgs = ['col d_date: first differs at row 1 …']  -> IDENTICAL-EXCEPT-DATE (exit 0)
vs the sprite-DMA-off trace                      -> refused; cols d_date,d_spb,pix
```
So the tolerance is reachable AND it refuses a real divergence.

### 5. THE RAM HOLES — the thing I was told to look hardest at. They are safe.

Five 8-byte words are excluded from `d_ram` and reported as `d_date`, justified
by one RAM diff. I attacked it two ways.

*Coverage arithmetic:* d_ram 130,776 + d_date 40 + d_top 256 = 131,072 =
the whole 128 KiB. **No byte of main RAM is unhashed.** Every segment length is
a multiple of 8, so nothing falls off the end of the `for a = off, off+len-8, 8`
loop.

*Live state inside the holes?* Two full 128 KiB RAM dumps from the SAME run
(same date, same everything) at lf1800 and lf2600 of `stage1-open`:
```
bytes differing between lf1800 and lf2600: 9170
  of those, INSIDE the five 8-byte holes: 0
```
9,170 bytes of gameplay state moved over 800 logic frames and **not one of them
was inside the 40 excluded bytes.** The holes hold only the calendar:
```
$802098  07 EA 00 07 00 1F 00 00        07EA = 2026, 07 = month, 1F = day
$8020A8  00 00 07 EA 07 1F 00 00
$802118  00 00 07 EA 07 1F 00 00
$802200  00 00 07 EA 07 1F 00 00
$8022C8  07 1F 00 00 00 00 00 00
```
The hole list is correct as measured, and the carve-out does not hide game state.

**But the geometry is asymmetric** (finding 2): the year word appears five times,
at `$802098 $8020AA $80211A $802202 $8022C6`. Four are inside a hole; the fifth,
`$8022C6`, is two bytes BEFORE its hole and is therefore in `d_ram`. Across a
year rollover the gate would report `DIVERGED` on `d_ram` — it fails safe, but
"differs in `d_date` and nothing else" is only true within a calendar year.

### 6. The RTC negative result reproduces exactly

```
$ python pgm.py rtc
  CENSUS rtc_reads=896
  CENSUS rtc_site off=C00006 pc=23C544 n=8      build B reads the calendar
  CENSUS rtc_site off=C00006 pc=00B79A n=200    the BIOS
  CENSUS rtc_site off=C00006 pc=13C8B0 n=8      build A
  CENSUS rtc_site off=C00004 pc=18AD10 n=680    soundlatch2, not the RTC
  TZ=XXX-14  48c6a8fb61092823df32e0ca4c56a62fc7532e6b0b40502266e11a7ee2a28aaf
  TZ=XXX+12  13f8ef743e0b3a53dbcf0ae36278dbe2defc4b514e0219fe1d8f834481841382
DIVERGED across the date change
  col d_date: first differs at row 1  <- and nothing else
```
Both hashes match the worklog's. The two runs demonstrably read different
calendar bytes, so the experiment is evidence and not a coincidence.

### 7. Other wave-1 numbers, re-measured

| claim | re-measured | verdict |
|---|---|---|
| machine pin `D4C25CA9C91B9D47` | same, every run | ✔ |
| `refresh 59.185606061`, `337920 cyc/frame` | same | ✔ |
| input lead 0 | `Button 1 at lf2000 → $803970 bit 4 at lf2001; lead = 0` | ✔ |
| peak sprite entries 133 | `stage1-deep → max_sprite_entries=133` | ✔ |
| seeded sram sha `3c4d8ef5…`, `$03810=01` | reproduced | ✔ but date-dependent (finding 1) |
| `landmarks.json` re-derives | field-for-field equal | ✔ |
| `-drc ≡ -nodrc` | existing traces hash `13f8ef74…` both | ✔ (hashed, not re-run) |
| savestate resume 1/120 `d_ram`, 20/120 `d_top`, 1/120 `irq4ph` | `python pgm.py seedstate` → `SAVED_AT_SAMPLEPOINT lf=2000 vf=2036`; `d_ram 1/120`, `d_top 20/120`, `irq4ph 1/120`, all first at `$80390A=1302` | ✔ |
| **~107 % of real time; 10 k frames ≈ 2.6 min** | 5,000 frames in **1m58s** and **2m13s** on two clean runs = 64–72 % of real time; 10 k ≈ **4.0–4.4 min** | ✘ (finding 5) |

(`pgm.py seedstate` returns **exit 1** on that, its own documented best outcome —
harmless today, but it must not be wired into a check runner as-is.)

### 8. Two checks the implementer's own doctrine says should exist and do not

`python pgm.py verify` runs a 20-frame probe and **never calls `check()`**. That
probe FAILS its own boot assertions on every single invocation:
```
FAIL lines from the run `pgm.py verify` performs:
  ['FAIL NOT ONE logic frame ran in the required build B',
   'FAIL the LAST logic frame armed from build 1, not the required B']
```
and `verify` printed a clean MACHINE/refresh pair and returned 0. See finding 4.

`armed_vblanks` was `1:` on 100 % of frames in every scenario I ran (2,600 and
5,000 frames). The 29.6 Hz and 19.7 Hz divider paths are established from the
LISTING (correctly — the listing is what proves presence of code) but have
**never been observed to execute**. Finding 6.

## What I could not do, and why

* No real system-clock change; I inherited the `TZ` proxy. A month/year rollover
  is still unexercised — and finding 2 says a year rollover is exactly where the
  carve-out's geometry breaks.
* I did not force an overrun, locate the object driver, or touch case (C).
  Correctly out of scope for wave 1; they are wave 2's blockers and the
  implementer names them.
* I did not re-run `pgm.py seed` end-to-end into `out/seed-nvram` (I ran the
  same procedure into a scratch directory instead, twice, under two TZs) and I
  did not re-run `pgm.py drc` — I hashed its existing traces.
* `PAL/SPB/BG/TX` share sizes: I verified main RAM's digest partition is
  complete but did not check those four shares are multiples of 8 bytes; if one
  is not, its last <8 bytes are unhashed.

## If someone picks this up cold

The oracle is sound and VERSION-B is genuinely pinned — that is the headline and
it survived four independent attacks. The six findings are in the structured
verdict; the two that will bite someone are:

1. **`pgm.py verify` cannot go red.** It is the first command in the cold-start
   list and it discards the probe's assertions. Add `check(r, "verify")` — and
   give it a boot script long enough to reach build B, or ask for build A.
2. **The seeded-NVRAM sha256 in `NOTES-versions.md` changes every day.**
   Measured: same procedure, TZ +14 → `c2bfcd4a9a17a064…`, TZ −12 →
   `3c4d8ef58818…`. Do not read a mismatch as environment drift.

**And the shared `.git/index` STILL holds staged deletions of ten wave-1 paths**
(`git status --porcelain games/ddpdoj` → `D games/ddpdoj/tools/oracle/derive.py`
et al.). Two gradius commits have landed since and did not trip it, so whoever
is committing there is doing it right — but the mine is still armed.
`git read-tree HEAD` immediately before `git add`, every time.
