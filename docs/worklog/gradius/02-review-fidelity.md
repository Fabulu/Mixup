# Wave 2 review - the HUD: canned packets + $8898 rotation (fidelity lens)
status: DONE
wave: 2   role: review   started: 2026-07-29
verdict: defects-found (4: one moderate, three minor). NOTHING BLOCKING.
reviewed: commit 43bc718, tree clean, HEAD = 43bc718

## The task, as I understood it
Review `43bc718` as a READER. Lens: behaviour preservation + fidelity to the
cartridge. Verify by content, re-run every number, break at least two checks and
watch them go red. I edited nothing under `games/gradius/`.

## What I did
Disassembled every ROM address the commit cites, from the user's own
`Gradius (USA).nes` at the repo root, with a scratch linear disassembler built on
`games/gradius/tools/nesdis.py` (`decode()` only, not the tracer) and a second
reader (`packets.py`) that indexes the raw file at `16 + (addr - 0x8000)` so the
two routes are independent. Ran the whole gate. Ran 15 deliberate breaks on a
SCRATCH COPY of `games/gradius/{src,tests,assets}` + `tools/oracle/out` at
`%TEMP%\...\scratchpad\gx`, never on the real tree.

## What I MEASURED

### The gate, run by me, from a clean tree

```
node --test games/gradius/tests/
  # tests 80  # pass 80  # fail 0  # skipped 0

node games/gradius/tools/test-all.mjs
  PASS inputs / unit tests / assets == the cartridge / port trace shape /
       port vs cartridge / self-check
  GREEN -- 6 passed, 0 failed, 0 SKIPPED
  17 scenarios, 3580 of 4423 frames compared
  (6 truncated: right-wall@493, diag-rd-lu@533, diag-ru-ld@445, lr-both@482,
   speed6-right@515, speed3-diag@529)
  0 failures, 0 clamps uncovered, 0 stale annotations,
  9 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins
                    w_0019 w_0024 w_004C)
  === knownFail ANNOTATIONS ===        <- empty
  self-check: neuter lead1 -> RED 153, seed-x+1 -> RED 116,
              laginject=450 -> RED 163

python games/gradius/tools/verify_assets.py --self-test
  OK: 0 mismatch(es) across 9 check families, 17 tables, 22 constants,
      12 palettes, 2048 CHR tiles, 425 terrain blocks
  21 of 21 mutations reddened their target; 9 of 9 families seen red
  (incl. the two new ones: hud-shift -> hud, hud-byte -> hud)

node tools/build-dist.mjs
  substituted: games/batman/assets/player.tiles.bin (6974 B placeholder)
  rom-leak guard: 115 files checked against 2 ROM(s) -- clean, no allowlist
  dist/ built: 118 files, 1548 KB
```

The 9 SKIPs are field-level, each with a written reason; no STAGE skipped.
`python .../oracle/scen.py` NOT re-run - it re-records the oracle side and needs
Mesen; the recorded artifacts under `tools/oracle/out/scen/` are what compare.mjs
read, and I re-derived my own numbers straight out of them (below).

### ROM spot-checks - every address the commit cites

| claim | ROM | verdict |
|---|---|---|
| `$8898` gate/parity/rotation | `A5 0E C9 04 90 01 60 / A5 02 4A 90 FA / E6 48 A5 48 29 03 20 E4 83` | exact |
| jt_88AD = 5 entries | `$88AD B6 88 F6 88 E3 89 2C 89 60 A9` -> $88B6 $88F6 $89E3 $892C $A960; `$88B6 = A9 1E` IS the 5th entry's high byte | exact, and the overlap is real |
| `$8898` caller | scan for `20 98 88` over the whole PRG: **exactly one**, `$9AC7` | exact |
| `$85E8` -> `$85F3` fall-through | `$85EF 20 45 86` is ONE instruction; `$85F1` is its third byte; `$85F2 PLA / $85F3 STA $9A` | exact |
| `$85F3` copier, `$FF`/`$FE`/`$FD`, bit-7 blanker | `$8605-$863B` transcribed line for line, incl. store-then-blank order and the `$9B` countdown | exact |
| `$8A2D JSR $863D` then `$8A30` | `$8A2D 20 3D 86`, next byte `$8A30 A9 1A` -- genuine fall-through; `$8A30` also has 2 JMP callers ($8971, $89AC), both named in the code | exact |
| `$8641`/`$863D`/`$8645`/`$8647` | `A9 00 F0 00 / A9 FF D0 04 / A6 0E / 9D 00 07 E8 86 0E 60`; `$8641` has exactly one caller, `$80B0` | exact |
| `$8A51` drain + the `$8A93` escape | `LDX $0700,Y / BEQ $8A76 ... $8A93 LDA $0700,Y / CMP #$03 / BCS $8A86` | exact |
| `$8A4B` mode table | `60 00 04 00 04 00` -> QUEUE_INC `[null,1,32,1,32,1]` | exact |
| `$9E94`/`$9EC2` ROWS | `$9EC6 A9 01` (mode 1 = inc 1) and `$9ED8 A9 20 18 65 AA` between packets; attribute packet queued first at `$9E94` | exact - the rows reading is right |
| the collision transpose | `$9F5A LDY $AF / $9F66 LDA $0703,Y / $9F77 ADC #$08 / $9F88 INC $AF` - first data byte of each of the 4 packets, then step within them | exact - the transpose IS the ROM's |
| the canned-packet table | re-read at raw offset `16+$064E`, all ten stage-1 streams match `EXPECT_HUD_STREAMS` and `hud.test.js`'s IMAGES byte for byte; 39 entries is provable ($864E + 2*39 = $869C = entry 37's own target) | exact |

### The frame model (I doubted it, then confirmed it)

`$8067 4C 67 80` - RESET ends in an empty spin, so the whole game runs inside the
NMI. `$80AA JSR $80BE`, and `$80BE E6 02 INC $02` precedes `$80D1`'s mode
dispatch, so `$8898` reads the ALREADY-incremented `$02`. `$8099` drains and
zeroes `$0E`; the producers run at `$9AC7`/`$9ACE`; `$80B0` appends the stop byte
last. `src/nmi.js` orders it drain -> `state.frame+1` -> `stagePlay` ->
`queueTerminator`, which is the cartridge's order.

### The oracle side, re-derived by me from tools/oracle/out/scen/long-idle.json

```
all 1000 recorded frames, $0E histogram:
  {1:339, 9:86, 13:79, 15:173, 37:1, 38:84, 40:87, 45:128, 49:1, 90:1, 149:21}
```
This reproduces the figure quoted in `tests/hud.test.js` EXACTLY.

Non-vacuity of the five retired knownFail fields, over the 600-frame compared
window (frames 400..999):

```
w_000E  5 distinct  {40,1,15,9,38}      <- 1=$8641 alone, 9/15/40=HUD, 38=block
w_0054  2 distinct  {0,128}
w_0055  2 distinct  {2,3}
w_0057  2 distinct  {1,0}
w_0058 28 distinct
w_0048 256 distinct                      <- real port state, and it moves
w_0020/0021/0042/0046/07E0/07E1/07E2/07E4  ALL 1 distinct  <- seeded constants
```
`seedFromRam` is called ONCE (`porttrace.mjs:425`, at align), so w_0048 agreeing
for 599 autonomous frames is a genuine test of the `$889F`/`$88A2` parity gate,
not a re-seed. The other new watches are constants and the commit says so.

### 15 deliberate breaks, on the SCRATCH COPY, each restored + sha1-verified

Test set = the whole `games/gradius/tests/` (baseline 80 pass / 0 fail / 0 skip).

```
terrain-columns        RED  1  ($9E94/$9EC2 block image)      <- headline claim HOLDS
double-laser-swap      RED  1  (owned-cell test only)
fe-like-ff             RED 18
lives-hash-conditional RED  2  (lives digits + nametable f3500)
attr-packet-last       RED  6
cursor-unmasked        RED  1  (the ex-knownFail wrap test)
meter-off-by-one       RED  1
inc-32-not-1           RED  3  (nametable f400/f1200/f3500)
drain-wipes-page       RED  1
blanker-count-1        RED  1
--------------------------------------------------------------------------
no-nt-mirror           *** GREEN, 80/80 -- THE BREAK SURVIVED ***
escape-threshold       *** GREEN, 80/80 -- THE BREAK SURVIVED ***
blanker-count-3        *** GREEN, 80/80 -- THE BREAK SURVIVED ***
blanker-count-4        *** GREEN, 80/80 -- THE BREAK SURVIVED ***
```

## Findings

### 1. MODERATE - "the whole 4 KB" is 2 KB, and the untested half hides a live line
`tests/terrain.test.js:83-84` - `diffByRow` iterates `nt < 2` over `0x400` each,
i.e. bytes `0..0x7FF`. The file header ("compare the whole 4 KB nametable image",
"the comparison below is over the FULL 4 KB, no rows held back") and the commit
message ("the whole 4 KB matches on all three captures") both overstate it.

Measured: the captures are 4096 B and their upper 2 KB is a byte-identical mirror
(`lo != hi` count = 0 on f400/f1200/f3500), so the claim is checkable and false.

Consequence, measured: deleting `nt[((a - 0x2000) & 0x7FF) + 0x800] = b` from
`drainQueue` (`src/vram.js:210`) leaves ALL 80 unit tests green. That line is the
only writer of `nt[0x800..0xFFF]`, and `src/render/ppu.js:156`
`base = (((nty << 1) | ntxE) & 3) * 0x400` READS those pages whenever `nty = 1`,
which the port's own `$13 = 12` makes routine for screen scanlines 228-239 (the
renderer's own comment says so). `ppu.test.js`'s pixel-exact test cannot see it
because `frameFromCapture(cap)` feeds it the CARTRIDGE's nametable, so the
queue -> nametable -> renderer chain is never joined end to end.

The line is pre-existing; the CLAIM to cover it is new. Fix is one character:
`for (let nt = 0; nt < 4; nt++)`.

### 2. MINOR - a documented RED-WHEN that is measurably false
`tests/hud.test.js:401-416` says "RED WHEN: the $9B countdown starts at 1 or 3".
Measured: `zp9B = 1` -> RED; `zp9B = 3` -> GREEN 80/80; `zp9B = 4` -> GREEN 80/80.
The test blanks packet `$11 = 23 A2 00 00 00 00 FE`, whose data bytes 2..5 are
ALREADY `$00`, so every countdown >= 2 yields the same image. Packet `$12`
(`23 B4 64 65 00 FF`) or `$1C` would separate them. The blanker is declared
unported/unexercised so no shipped behaviour is at risk - but the stated red arm
was never seen red, which is what this repo says not to ship.

### 3. MINOR - the `$8A93` escape threshold is unpinned
`src/vram.js:170` `if (q[y & 0xFF] >= 3)` transcribes `$8A96 CMP #$03`. Changing
it to `>= 2` leaves all 80 tests green. Nothing in stage 1 emits a mode-2 packet
any more (terrain moved to mode 1 in this very commit) and no stage-1 packet
contains a data byte `$FF`, so the arm is modelled and never executed. This is
NEW code in 43bc718 and it deserves the same explicit "unexercised" note the
`$FD` arm and the bit-7 blanker were honestly given, or a unit test.

### 4. MINOR - a fall-through cited as a branch, in the file about fall-throughs
`src/hud.js:204` annotates `scoreTail(state)` inside `stTopScore` as
`// $8949 BMI $8906`. `$8949` is st_892C's branch. st_88F6 reaches `$8906` by
FALL-THROUGH: `$8904 10 F7 BPL $88FD` fails when Y = $FF and `$8906` is the next
byte. The identical citation on line 224 (stScore) IS correct. docs/knowledge/02
trap 1; behaviourally harmless, but a wrong note in this repo has misled somebody
every time.

### INFORMATIONAL
- `assets/hud/packets.json` is gitignored (`.gitignore:22`) and NOT committed.
  It ships to `dist/` at 3806 B, so it IS scanned by the guard (over the 1 KB
  floor) and passes because JSON is not a verbatim byte match. That is the
  documented policy for decoded caches (`tools/build-dist.mjs:145-151` blesses
  "a decoded level table, a re-indexed tile sheet"), so it is consistent with
  the rules, not a new hole. The implementer's item 4 is accurate but reads more
  alarming than it is.
- The corpus-invisibility warning is real and if anything understated: long-idle
  reports `115/132 compared fields never changed value`.
- `src/terrain.js` collision write uses `& 0x1FF`; the ROM's `$9F81 ADC $A8 /
  STA $A8` has no carry into `$A9`, so it wraps within ONE page. Pre-existing and
  UNREACHABLE on stage 1 (max `u8($54+$58) = 0xE6`, `+24 = 0xFE`), so not raised
  as a defect - recorded so nobody re-derives it.
- `knownFail: []` is retained as an empty list with the closed diagnosis kept in
  the notes. Rule 6 satisfied for `export_assets.py` (the NOT_EXPORTED entry is
  deleted in the same commit).

## What I could not do, and why
- `scen.py` not re-run (re-records the oracle from the ROM through Mesen; the
  gate consumed the existing recordings and I re-derived my figures from them).
- The 5 touch-pad tests failed in my first scratch copy for want of `index.html`;
  after copying it the scratch baseline matched the real tree exactly (80/0/0),
  so all mutation results are against a faithful baseline.

## If someone picks this up cold
The port is faithful at every ROM address I checked and the gate is green from a
clean tree with 0 skipped stages. Do these four, smallest first:
`hud.js:204`'s citation; a red-validated countdown case using packet `$12`; a
note or test on the `>= 3` escape; and `tests/terrain.test.js:83` `nt < 4`, which
is the only one with a live line behind it.
