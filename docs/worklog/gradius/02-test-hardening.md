# Wave 2 test hardening — the HUD, the packets, the queue

status: DONE
wave: 2   role: test   started: 2026-07-31   base: HEAD = 43bc718

## The task, as I understood it

Harden the checks around commit `43bc718` (wave 2: `$8898`'s rotation, the canned
packets, the `$0700` queue rewrite). I write **tests only** — files under
`games/gradius/tests/`. I did not touch `games/gradius/src/` (see "What I could
not do"). Every test added is **seen red**: mutate the source in place, run the
whole unit suite, restore, sha256-verify byte-identical.

Inputs: the reviewer's 4 defects (`02-review-fidelity.md`) and QA's 9
(`02-qa-adversarial.md`). Their overlap was the target list. Everything they
reported as a break-that-passes, I reproduced myself before fixing it.

## What I did

### The mutation harness

`<scratchpad>/mut.py` — takes a label, a file, an exact old string and a new
string; asserts the anchor appears **exactly once** (docs/knowledge/03: never
regex a structured file); writes the mutation; runs `node --test
games/gradius/tests/`; restores the original bytes in a `finally`; and asserts
the sha256 before and after are equal. Every line of the table below was
produced by it, and every line printed `sha256 before==after: True`.

Mutations ran **in the working tree**, not on a copy, so that the test files
under test were the committed ones. `git status --porcelain games/gradius/src`
is empty at the end.

### 1. The bit-7 blanker: a test that could not see its own subject

`tests/hud.test.js`'s `$8617-$8624` test drove index `$80|$11`, and packet `$11`
is `23 A2 00 00 00 00 FE` — every byte after the address is already `$00`, so
the blanked and un-blanked images are identical. Census I ran over every packet
the port can emit:

```
$0F $12 $13 $14 $15 $16 $17 $18 $19 $1B   blanked != plain   (10)
$11 $1A                                   blanked == plain   ( 2)
```

The test had picked one of the two blind ones. Rewritten to drive `$0F`, `$12`,
`$13`, `$15` and the 25-byte `$1C`, with `assert.notStrictEqual(blanked, plain)`
FIRST so it cannot become vacuous again. The old comment's "RED WHEN: the $9B
countdown starts at 1 or 3" was measurably false for 3; it is true now.

### 2. `$0E` histogram: a measured-looking comment that was wrong

The comment above the `$0E` per-frame test quoted the cartridge's whole-run
histogram and glossed `45 = a block plus the 8-byte lives packet` and `13` as if
both were mode-5 numbers. Re-measured from
`tools/oracle/out/scen/long-idle.json`, split by the recorded `mode` field, all
1000 rows — see "What I MEASURED". 45 never occurs in mode 5; 13 occurs only in
mode 3. Comment replaced with the per-mode table and an explicit statement that
the fixture produces a SUBSET of the mode-5 buckets.

### 3. New: the 600-frame census (the frame as the scarce resource)

`600 frames: the HUD takes exactly half of them, 75 per phase`. The cartridge's
own compared window (long-idle f400-f999, 600 rows, all mode 5) has
`$0E {1:244, 9:75, 15:150, 38:56, 40:75}`; the port reproduces `9:75, 15:150,
40:75` exactly on its own 600 frames. The test asserts those three counts, that
all 300 HUD frames are odd, and that no frame produces a size outside
`{1, 9, 15, 38, 40}`. It deliberately does NOT assert `38` — the port builds a
block on 168 even frames against the cartridge's 56, because the 384 px lead
throttle is not reproduced by a bare `bootState`. That difference is written
into the test comment rather than hidden inside a green assertion.

### 4. New: the two producers that patch bytes they have already written

`$88E5/$88ED/$88F2` and `$8A46` index off `$0E`. Every existing test started the
tick on an EMPTY queue, where `$0E - 2` is the constant 6 — so all four "write
it at a constant instead" mutations were green. `$8898`'s own gate
(`CMP #$04 / BCC`) admits leads of 1, 2 and 3 bytes, so the new tests run inside
what the ROM permits. The first draft of the lives one used only `$20 = 3`,
whose tens digit is suppressed, and `q[y-3] -> q[5]` stayed GREEN; adding
`$20 = 12` closed it. That is in the test comment too.

### 5. New file `tests/vram.test.js` — the decoder's five unpinned parameters

Reviewer F3 and QA F5 listed five parameters of the rewritten `src/vram.js` that
could be changed with all 80 tests green. All five now have a test named for the
ROM bytes it pins: the `$8A96 CMP #$03` escape (both sides of the threshold),
`$8A4B`'s increment-32 entries (derived independently from the raw six bytes
`60 00 04 00 04 00`, not copied from `QUEUE_INC`), the `$2800` nametable fold,
the `$3F10` palette mirror, and the 14-bit address wrap. A sixth turned up while
probing: `hi & $3F` -> `hi & $FF` was green too (no canned packet has a high
byte >= `$40`).

### 6. `tests/terrain.test.js`: "the whole 4 KB" is now the whole 4 KB

`diffByRow` walked `nt < 2` × `0x400` = bytes 0..0x7FF of a 4096-byte image while
the header and commit 43bc718's message both claimed 4 KB. `nt < 4`. The upper
2 KB is a real mirror in the capture (0 differing bytes on all three), so this
costs nothing and now guards `src/vram.js:210`, the only writer of
`nt[0x800..0xFFF]` and the page `src/render/ppu.js` reads whenever `nty = 1`.

### 7. Two knownFails: the 6502 wraps the port does not model

Both were QA F6; I re-disassembled both from the user's own cartridge before
writing them (output below). Written as `knownFail()` in `tests/vram.test.js`
with the ROM bytes, the smallest witnessing page, the fix, and the measured
statement that neither is reached by the recorded corpus (max `$0E` = 149 of
256, 21 frames, all mode 5). They retire themselves on a SURPRISE PASS.

## What I MEASURED

### The gate, run by me, on the committed tree

```
$ node --test games/gradius/tests/
  # tests 95   # pass 95   # fail 0   # cancelled 0   # skipped 0   # todo 0
  (was 80 at 43bc718: +15)

$ node games/gradius/tools/test-all.mjs
  PASS  inputs
  PASS  unit tests (node --test games/gradius/tests/)
  PASS  assets == the cartridge (verify_assets.py --self-test)
  PASS  port trace shape == probe.lua state vector
  PASS  port vs cartridge (compare.mjs)
  PASS  self-check: the comparison goes red when the port is broken
  GREEN -- 6 passed, 0 failed, 0 SKIPPED
  17 scenarios, 3580 of 4423 frames compared (6 truncated: right-wall@493,
  diag-rd-lu@533, diag-ru-ld@445, lr-both@482, speed6-right@515,
  speed3-diag@529), 0 failures, 0 clamps uncovered, 0 stale annotations,
  9 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins
  w_0019 w_0024 w_004C -- per-FIELD, each with a written reason; NO stage
  skipped)
  === knownFail ANNOTATIONS ===   <- empty (scenarios.json; the unit-suite
                                   knownFails are a different mechanism and
                                   print "[knownFail] ..." on stderr)
  self-check: lead1 -> RED 153, seed-x+1 -> RED 116, laginject=450 -> RED 163
```

`python .../oracle/scen.py` NOT re-run — it re-records the oracle side through
Mesen and I changed nothing on that side. Figures below come from the recorded
`out/scen/long-idle.json` and from my own disassembly of the cartridge.

### The cartridge's `$0E`, per game mode (long-idle, all 1000 recorded rows)

```
0E=1   {mode1:71, mode3:2, mode4:1, mode5:265}
0E=9   {mode5:86}          0E=15  {mode5:173}      0E=40 {mode5:87}
0E=13  {mode3:79}     <- MODE 3 ONLY
0E=37  {mode5:1}      0E=38 {mode5:84}      0E=49 {mode5:1}
0E=45  {mode0:127, mode1:1}  <- NEVER mode 5
0E=90  {mode0:1}      0E=149 {mode5:21}   (frames 287-307)
compared window (frame>=400, 600 rows, all mode 5): {1:244, 9:75, 15:150,
                                                     38:56, 40:75}
```

The port, 600 NMIs from `bootState`: `{1:132, 9:75, 15:150, 38:168, 40:75}`.
The three HUD buckets agree exactly; `1` and `38` do not, for the reason in the
test comment.

### The blanker census (node, against the port's own asset)

```
$0F plain 01 23 84 09 0A 0B 0C        blanked 01 23 84 00 00 00 00     differ
$11 plain 01 23 A2 00 00 00 00 FF     blanked IDENTICAL                BLIND
$12 plain 01 23 B4 64 65 00           blanked 01 23 B4 00 00 00        differ
$13 plain 01 23 A8 31 66 00           blanked 01 23 A8 00 00 00        differ
$14 plain 01 23 A8 32 66 00           blanked 01 23 A8 00 00 00        differ
$15 plain 01 0D 0E 0F 10              blanked 01 0D 0E 00 00           differ
$16 $17 $18 $19 $1B   ditto, all differ
$1A plain 01 23 F8 00 x7 FF           blanked IDENTICAL                BLIND
```

### A length check is not a byte check — measured, not quoted

The file header claims the recon's length-only check caught a one-entry table
shift on only 4 of 10 packets. Re-derived for the 12 packets the port can emit,
from `assets/hud/packets.json`:

```
one-entry shift: LENGTH differs on  6 of 12
one-entry shift: BYTES  differ on  12 of 12
```

and the shift mutation itself (M21) reddens 23 tests.

### The two wraps, disassembled from "Gradius (USA).nes" by me

```
8614  9D 00 07  STA $0700,X       8A6C  C8        INY
8626  E8        INX               8A6D  B9 00 07  LDA $0700,Y
8627  D0 DC     BNE $8605   <-    8A70  8D 06 20  STA $2006
8629  A9 FF     LDA #$FF          8A73  C8        INY
862B  D0 1A     BNE $8647         8A74  D0 15     BNE $8A8B   <-
                                  8A76  A9 00     LDA #$00 -> STA $0700/$0E
```

and, for the reviewer's finding 4 (see below):

```
88FB  A0 02  LDY #$02
88FD  B9 E0 07  LDA $07E0,Y
8903  88     DEY
8904  10 F7  BPL $88FD      <- fails, and $8906 is simply the next byte
8906  A9 30  LDA #$30
...
8947  10 ED  BPL $8936      (st_892C)
8949  30 BB  BMI $8906      <- THIS is the branch to $8906, and it is st_892C's
```

### The wave's own two mandated breaks

```
packet-table pointer shifted one entry  (src/hudpackets.js, packets[(idx&$7F)+1])
  -> 72 pass, 23 FAIL, including "the four $8898 phases ... byte for byte"

parity flipped to EVEN frames           (src/hud.js, (frame & 1) === 1)
  -> unit suite 73 pass, 22 FAIL
  -> node games/gradius/tools/oracle/compare.mjs --only long-idle
     FAIL long-idle 599 frames
       w_000E@401 w_0048@401 w_0054@625 w_0055@881 w_0057@571 w_0058@571
     w_0058: FIRST divergence at frame 571 (56/599 frames differ)
         f 570  rom 0  port 0
      >> f 571  rom 1  port 0
         f 572  rom 1  port 1
```

exactly the divergence at f571/572 the plan predicted.

### THE MUTATION TABLE

Every row: applied in place, whole unit suite run, restored, sha256 verified
byte-identical. "before" = the suite as it stood at 43bc718 (80 tests);
"after" = with this commit's tests (95). `-` means not run before.

| # | site | mutation | before | after | tests that went red |
|---|------|----------|--------|-------|---------------------|
| M1 | hudpackets.js:112 | `if (zp9A & 0x80)` -> `if (false)` (blanker deleted) | **GREEN** | RED 1 | `$8617-$8624 index bit 7 blanks...` |
| M2 | hudpackets.js:92 | `zp9B = 2` -> `3` | **GREEN** | RED 1 | same |
| M3 | hudpackets.js:92 | `zp9B = 2` -> `1` | RED 1 | RED 1 | same |
| M4 | hudpackets.js:92 | `zp9B = 2` -> `9` | **GREEN** | RED 1 | same |
| M5 | hudpackets.js:91 | `zp9A = idx & 0xFF` -> `& 0x7F` | **GREEN** | RED 1 | same |
| M6 | vram.js:170 | escape `>= 3` -> `>= 2` | **GREEN** | RED 2 | `$8A96 CMP #$03...`, `$8A98 BCS $8A86...` |
| M7 | vram.js:170 | escape `>= 3` -> `>= 4` | **GREEN** | RED 2 | same two |
| M8 | vram.js:43 | `QUEUE_INC` 32s -> 1s | **GREEN** | RED 4 | `$8A4B 60 00 04...`, `mode 2 strides...`, `$8A96...`, `14 bits...` |
| M9 | vram.js:210 | drop the `+ 0x800` mirror store | **GREEN** | RED 4 | `$2800/$2C00 are ALIASES...` + the three cartridge nametable tests |
| M10 | vram.js:209 | fold mask `& 0x7FF` -> `& 0xFFF` | - | RED 1 | `$2800/$2C00 are ALIASES...` |
| M11 | vram.js:207 | drop the `$3F10` palette mirror | **GREEN** | RED 1 | `$3F10/$3F14/... mirror ...` |
| M12 | vram.js:207 | `(a & 0x13) === 0x10` -> `(a & 0x10) === 0x10` | - | RED 1 | same |
| M13 | vram.js:212 | `& 0x3FFF` -> `& 0xFFFF` | **GREEN** | RED 1 | `the PPU address bus is 14 bits...` |
| M14 | vram.js:157 | no-terminator guard `throw` -> `return out` | - | RED 1 | `$8A51 refuses a page with no mode-0 stop byte` |
| M15 | vram.js:81 | cursor `+ 1) & 0xFF` -> `+ 1` | - | RED 2 | `$864A INX...` (pre-existing), `$8647 STA $0700,X...` |
| M16 | hud.js:156 | `q[y - 2]` -> `q[6]` | **GREEN** | RED 1 | `$88D9 LDY $0E: the digit patch is CURSOR-RELATIVE` |
| M17 | hud.js:157 | `q[y - 3]` -> `q[5]` | **GREEN** | **GREEN**, then RED 1 after adding `$20 = 12` | same |
| M18 | hud.js:159 | `q[y - 4]` -> `q[4]` | **GREEN** | RED 1 | same |
| M19 | hud.js:290 | `u8(cursor - back)` -> `u8(39 - back)` | **GREEN** | RED 1 | `$8A40 LDA $0E / SBC $98...` |
| M20 | hud.js:289 | `u8(8 - meter)` -> `u8(7 - meter)` | RED 1 | RED 2 | `$8A30: the meter cursor...`, `$8A40 ...` |
| M21 | hudpackets.js:86 | packet table shifted one entry | - | RED 23 | incl. `the four $8898 phases ... byte for byte` |
| M22 | hud.js:77 | parity flipped to EVEN frames | - | RED 22 | incl. the three cartridge nametable tests |
| M23 | hud.js:82 | phase 1 dispatches `st_892C` | - | RED 5 | `the four $8898 phases...`, `$8915 BCD...`, 3 nametable |
| M24 | terrain.js:148 | tile packets back to COLUMNS (mode 2, stride 1) | - | RED 4 | `$9E94/$9EC2 one block on the wire` + 3 nametable |
| M25 | hud.js:140 | lives producer appends packet `$12` not `$11` | - | RED 10 | 7 hud + 3 nametable |
| P1 | nmi.js:238 | `hudTick` removed from the frame | - | RED 3 | `$0E after a whole frame...`, `600 frames...`, `$8898 is the STREAMER'S THROTTLE` |
| P2 | hudpackets.js:101 | `$FF` treated like `$FE` | - | RED 14 | |
| P3 | hud.js:256 | `$0100 >= 2` -> `> 2` | - | RED 1 | `$89E3 $0100 >= 2 ...` |
| P4 | hud.js:187 | `scoreTail` trailing `'0'` -> `'1'` | - | RED 6 | |
| P5 | hud.js:147 | drop the `break` from the >= 100 cap | - | **GREEN — EQUIVALENT MUTANT**, see below | |
| P5b | hud.js:147 | cap `x >= 0x0A` -> `x >= 0x0B` | - | RED 1 | `$88C9-$88F2 the lives digits...` |
| P6 | hud.js:288 | `$42 == 0` early return dropped | - | RED 6 | |
| P7 | hud.js:175 | BCD nibbles swapped | - | RED 5 | |
| P8 | hud.js:264 | the `$8A30` fall-through dropped | - | RED 7 | |
| P9 | vram.js:215 | `$8A78 STA $0700` dropped | - | RED 1 | `$8A76 clears only $0700[0]...` |
| P10 | vram.js:215 | drain wipes the WHOLE page | - | RED 1 | same |
| P13 | vram.js:205 | palette index `& 0x1F` -> `& 0x0F` | - | RED 1 | `$3F10/$3F14/... mirror ...` |
| P14 | vram.js:173 | address high `hi & 0x3F` -> `hi & 0xFF` | - | **GREEN**, then RED 1 after the extra assertion | `the PPU address bus is 14 bits...` |
| P15 | vram.js:128 | `$8641` appends `$FF` not `$00` | - | RED 13 | |
| P16 | vram.js:102 | `queuePacket` always writes mode 1 | - | RED 2 | `mode 2 strides...`, `14 bits...` |

Eleven deliberate breaks were GREEN when I started (M1 M2 M4 M5 M6 M7 M8 M9 M11
M13 M16 M17 M18 M19 — fourteen counting the three cursor-relative ones and P14).
All are red now. **P5 is the one green I did NOT close, because it is an
equivalent mutant, not a hole**: removing the `break` after `{ x = 9; a = 9; }`
changes nothing, since `a = 9` already fails the `while (a >= 0x0A)` condition
on the next test. P5b is the real break at that site and it is red.

## What I could not do, and why

**I did not touch `games/gradius/src/`, including one comment I believe is
wrong.** `src/hud.js:204` annotates `scoreTail(state)` at the end of `stTopScore`
($88F6) as `// $8949 BMI $8906`. `$8949 BMI $8906` is **st_892C's** branch;
st_88F6 reaches `$8906` by FALL-THROUGH from `$8904 10 F7 BPL $88FD` (my
disassembly is above). The identical citation on line 224, inside `stScore`, is
correct. Behaviourally harmless; rule 6 wants it fixed, and rule 3 says exactly
one agent writes `src/`. It is a one-line change for whoever holds that lock:

```
-  scoreTail(state);                              // $8949 BMI $8906
+  scoreTail(state);                              // $8904 BPL $88FD fails -> FALL-THROUGH to $8906
```

**I did not re-run `scen.py`.** It re-records the oracle side through Mesen and
nothing I changed touches it. I re-derived every figure I quote either from the
recorded `out/scen/long-idle.json` or from my own disassembly of the cartridge.

**`tests/page-wiring.test.js` cannot run standalone from a path containing a
space** (`ERR_INVALID_URL_SCHEME` out of `fileURLToPath`) — QA hit this too. It
runs fine under `node --test games/gradius/tests/`, which is how the gate runs
it, so this only affected how I scoped ad-hoc runs.

**Left open, deliberately, and reported rather than fixed:**

1. The two 6502 wraps are annotated as knownFails, not ported. They need a
   `src/` writer.
2. The queue -> nametable -> renderer chain is still not joined end to end.
   `tests/ppu.test.js` feeds the renderer the CARTRIDGE's nametable through
   `frameFromCapture()`, so the `$2800` mirror is now pinned structurally (the
   two halves must be byte-identical, and `$2800` must fold) but not through a
   rendered pixel. Closing that properly means rendering from a port-built
   nametable, which is a wave-4 shape of job.
3. The three cartridge nametable comparisons still SKIP on a tree with no
   `tools/oracle/out/video/` captures (pre-existing `helpers.js` policy). That
   is why the `$2800` fold and the `$8A4B` increments are pinned in
   `tests/vram.test.js` as well — those tests need no captures and cannot skip.
4. `assets/hud/packets.json` reaching `dist/` is unchanged and is a policy
   question for whoever owns rule 1, not a port bug.

## If someone picks this up cold

- `<scratchpad>/mut.py` is 40 lines and is the whole method: one anchor, one
  mutation, whole suite, restore, hash. Copy it.
- The two knownFails in `tests/vram.test.js` will FAIL LOUDLY ("SURPRISE PASS")
  the moment somebody ports the wraps. That is the signal to delete the
  `knownFail()` wrapper and keep the assertions.
- If you add a test that drives a canned packet, check first that the packet can
  DISTINGUISH what you are testing. Two of the twelve stage-1 packets are blind
  to the blanker and the old test had picked one of them.
- The `$0E` histogram in `tests/hud.test.js` is per-GAME-MODE. Do not quote the
  whole-run numbers again; 45 and 13 are not mode-5 values.
