# QA (adversarial) - wave 2: the HUD, canned packets, $8898 rotation
status: DONE
wave: 2   role: qa   started: 2026-07-31   commit under test: 43bc718

## The task, as I understood it
Break wave 2. I am a READER: no edits to `games/gradius/src/`, no commits. Re-measure
every number the implementer quoted. Hunt docs/knowledge/03's four green-but-broken
shapes in the new tests, and hunt for parameters the corpus never moves.

Working tree at start and at end: `git status --porcelain games/gradius` -> EMPTY.
Mutation testing was done on a COPY at
`<scratchpad>/mut/games/gradius`, never on the repo.

## What I MEASURED

### 1. The gate, run by me, from the clean tree
```
node --test games/gradius/tests/
  # tests 80  # pass 80  # fail 0  # skipped 0  # todo 0

node games/gradius/tools/test-all.mjs
  PASS inputs / unit tests / assets==cartridge / port trace shape /
       port vs cartridge (compare.mjs) / self-check
  17 scenarios, 3580 of 4423 frames compared
  (6 truncated: right-wall@493, diag-rd-lu@533, diag-ru-ld@445, lr-both@482,
   speed6-right@515, speed3-diag@529)
  0 failures, 0 clamps uncovered, 0 stale annotations,
  9 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins
                    w_0019 w_0024 w_004C)
  === knownFail ANNOTATIONS ===        <- empty
  GREEN -- 6 passed, 0 failed, 0 SKIPPED

python games/gradius/tools/verify_assets.py --self-test
  21 of 21 mutations reddened their target; 9 of 9 families seen red
```
Matches the implementer's report exactly. `node tools/build-dist.mjs` ->
`rom-leak guard: 115 files checked against 2 ROM(s) -- clean, no allowlist`,
`dist/ built: 118 files, 1548 KB`.

### 2. Independent re-derivation from the cartridge (Mesen + the PRG)
`python games/gradius/tools/oracle/queue.py --frames 700 --script "200:,10:S,490:"
 --from 566 --to 580 --packets`
```
gateCalls=390 buildCalls=283
$8898 entered=390  passed both gates=195  (on $02 even=0, odd=195)
builds per frame histogram (all 700):    {0: 483, 1: 195, 4: 22}
builds per frame histogram (mode-5):     {0: 196, 1: 195}
$0E at $9D83 on frames that BUILT     : {0: 7}
$0E at $9D83 on frames that did NOT   : {8: 2, 14: 4, 39: 2}
$864E decode length == measured $0E delta, 15/15 producer-index pairs, 0 wrong
f571 $0700@$80B5 n=38: 01 23 C0 4C FF | 01 20 00 .. | 01 20 20 .. |
                       01 20 40 .. | 01 20 60 .. | 00
```
So `hudCalls 390 / hudRan 195 / even 0 / odd 195`, the four $0700 images and the
f571 terrain block are all confirmed by my own run, not quoted.

Disassembly cross-check (`tools/dis6502.py linear`) of $8898, $88B6, $88F6,
$8906, $8915, $892C, $89E3, $8A30, $8A4B, $8A51, $85E8-$864D, $806A-$80BE,
$9AC4-$9ACE, $9D83-$9DA1: **the port's transcription is right everywhere I
checked**, including $88E1/$88E9's two suppression arms, $88D2/$88D6's cap,
$8A4B = `60 00 04 00 04 00`, `$89E3 LDA $0100` being ABSOLUTE (not $18-indexed),
`$8A45 TAX` being an 8-bit wrap, and both fall-throughs ($85E8->$85F3,
$8A2D->$8A30). Two 6502 details the port does NOT carry -- see finding 6.

### 3. Mutation battery on the copy (baseline 63 pass / 0 fail over
frame-gates, hud, terrain, nmi, ppu, oam, player)

| mutation | result |
|---|---|
| `scanQueue` escape `>= 3` -> `>= 4` | **63/0 GREEN** |
| `QUEUE_INC` `[null,1,32,1,32,1]` -> all 1 | **63/0 GREEN** |
| drop `nt[...+0x800]` mirror write | **63/0 GREEN** |
| drop palette mirror `(a & 0x13) === 0x10` | **63/0 GREEN** |
| `a = (a+inc) & 0x3FFF` -> `& 0xFFFF` | **63/0 GREEN** |
| `copyPacket` `let zp9B = 2` -> `3` | **63/0 GREEN** |
| `copyPacket` `let zp9B = 2` -> `9` | **63/0 GREEN** |
| **`copyPacket` blanker `if (zp9A & 0x80)` -> `if (false)`** | **63/0 GREEN** |
| `$FD` arm `zp9B = 2` -> `0` | **63/0 GREEN** |
| drop the `$0E < 4` throw in `stLives` | **63/0 GREEN** |
| `let zp9B = 2` -> `1` | 62/1 red (blanker test) |
| blank ALL bytes | 62/1 red |
| `packets[idx & 0x7F]` -> `& 0xFF` | 62/1 red |
| drop `state.vram.q[0] = 0` in drain | 62/1 red |
| gate `>= 4` -> `> 4` | 62/1 red |
| `scanQueue` guard 64 -> 4 | 50/13 red |
| `q[y-4] = 0x61` -> `q[y-5]` | 57/6 red |
| INC $48 after the dispatch | 54/9 red |
| scoreTail order swapped | red (throws) |
| TOP score reads $07E4 | 58/5 red |
| queuePacket addr hi/lo swapped | 59/4 red |
| `$FF` treated like `$FE` | 52/11 red |
| cursor `& 0xFF` removed | 62/1 red |
| parity `frame & 1` -> `frame & 2` | 44/19 red |
| `$8641` emits `$01` | red (throws) |
| `queueTerminator` moved before stagePlay | 61/2 red |
| `INC $02` moved after stagePlay | 60/3 red |
| `hudTick` call deleted from nmi.js | 61/2 red |

### 4. The cartridge's own $0E histogram, per game mode
From `tools/oracle/out/scen/long-idle.json`, all 1000 recorded rows:
```
0E=1   {mode1:71, mode3:2, mode4:1, mode5:265}
0E=9   {mode5:86}
0E=13  {mode3:79}
0E=15  {mode5:173}
0E=37  {mode5:1}
0E=38  {mode5:84}
0E=40  {mode5:87}
0E=45  {mode0:127, mode1:1}
0E=49  {mode5:1}
0E=90  {mode0:1}
0E=149 {mode5:21}   frames 287..307
compared window (frame >= 400, 599 rows): {1:244, 9:75, 15:150, 38:56, 40:75}
```

### 5. Non-vacuity of the retired knownFail fields (long-idle, compared window)
`w_000E` 5 distinct values, `w_0054` 2, `w_0055` 2, `w_0057` 2, `w_0058` 28,
`w_0048` 256. The HUD's six inputs: `w_0020` 1, `w_0042` 1, `w_0046` 1,
`w_0018` 1, `w_0100` 1, `w_07E0/E1/E2/E4` 1 each. The implementer's claim that
every producer input is constant across the corpus is CONFIRMED.

## FINDINGS

**F1 (moderate) - a deliberate break that PASSES. The bit-7 blanker is not tested.**
`tests/hud.test.js:401` "$8617-$8624: index bit 7 blanks everything after the
first TWO bytes" drives index `$80|$11`. Packet `$11` is
`23 A2 00 00 00 00 FE`: everything after the address is ALREADY zero, so the
blanked and unblanked images are byte-identical. Measured on the copy:
```
$0F  plain=01 23 84 09 0A 0B 0C   blanked=01 23 84 00 00 00 00   distinguishes
$11  plain=01 23 A2 00 00 00 00 FF blanked=IDENTICAL              blind
$12  plain=01 23 B4 64 65 00      blanked=01 23 B4 00 00 00      distinguishes
$13  plain=01 23 A8 31 66 00      blanked=01 23 A8 00 00 00      distinguishes
$1A  plain=01 23 F8 00 x7 FF      blanked=IDENTICAL              blind
```
The test picked one of the only two blind packets. Deleting the blanker entirely
(`if (zp9A & 0x80)` -> `if (false)`) leaves the suite at 63 pass / 0 fail, and so
does `zp9B = 3` and `zp9B = 9` -- while the test's own comment says
"RED WHEN: the $9B countdown starts at 1 or 3". Only `1` and "blank everything"
are red, i.e. the check pins the countdown from below and nothing else.
Fix: use `$80|$0F` (or `$12`/`$13`). One line.

**F2 (moderate) - a measured-looking claim in a load-bearing test that is false.**
`tests/hud.test.js:88-94` quotes the cartridge histogram
`{1:339, 9:86, 13:79, 15:173, 38:84, 40:87, 45:128, ...}` and glosses
"45 = a block plus the 8-byte lives packet". Re-measured (section 4): **45 occurs
only in modes 0 and 1, and 13 only in mode 3.** Neither `$9D8E` (mode-5 paths)
nor `$8898` (`$9AC7`, mode 5) can run on those frames, so a block plus a lives
packet is not what 45 is; and the mode-5 histogram never contains 45 or 13 at
all. The quote also silently drops the 37/49/90/149 buckets. The test's own
fixture (`s.build.gate = 1`, mode 5, 8 frames) can only produce {1,9,15,40}, so
the numbers cited are not the numbers the assertion checks
(docs/knowledge/03 "report what was skipped", and rule 6 on stale notes).

**F3 (moderate) - the wave adds a ROM-derived asset that the rom-leak guard
cannot see, and it ships.** `games/gradius/assets/hud/packets.json` stores the
literal PRG bytes of all 39 canned streams together with their ROM file offsets:
`{"index":0,"rom":"$871B","fileOffset":1835,"bytes":[34,45,49,0,52,8,2,9,4,7,254]}`.
I ran `node tools/build-dist.mjs`: the guard says "115 files checked ... clean,
no allowlist" and `dist/games/gradius/assets/hud/packets.json` (3806 B) exists.
Decimal-JSON-encoded ROM bytes are not a verbatim byte run, so the guard passes
them. The implementer disclosed the mechanism as pre-existing (`chr/tiles.u8`
has the same shape) and that is fair -- but `tiles.u8` is a decoded bitplane
expansion, whereas this is a 1:1 transcript of ~300 PRG bytes plus the offsets
to find them. Flagging, not fixing: this is a repo-policy call, not a port bug.

**F4 (minor) - "the whole 4 KB matches" is 2 KB.** `tests/terrain.test.js`
`diffByRow()` walks `nt < 2` x `i < 0x400`, i.e. offsets 0..0x7FF of a 4096-byte
`nt.bin`. The header comment and the commit message both say "full 4 KB". I
checked the captures: `cap.nt[0..0x7FF] == cap.nt[0x800..0xFFF]` on f400/f1200/
f3500 (0 differing bytes), so the uncompared half is genuinely redundant under
vertical mirroring -- but the port's own mirror write is therefore unchecked
(see F5).

**F5 (minor) - four parameters in the rewritten `src/vram.js` that no check
moves** (each mutation alone: 63 pass / 0 fail):
 - `scanQueue`'s escape threshold (`$8A96 CMP #$03`) -- no packet the port emits
   contains a data byte `$FF`, so the escape never fires;
 - `QUEUE_INC[2]`/`[4]` = 32 -- only mode `$01` is ever emitted (HUD and terrain
   both write `#$01`), so the increment-32 entries are dead;
 - the vertical-mirror second nametable write;
 - the palette mirror `(a & 0x13) === 0x10`;
 - and `& 0x3FFF` on the address advance.
That is not "the wave is wrong"; it is where the wave's coverage stops. The
escape in particular is the one the file's own comment calls "precisely why the
ROM has an escape at all".

**F6 (minor) - two 8-bit wrap exits in the ROM that the port does not model.**
Disassembled from the cartridge:
```
8626  E8        INX
8627  D0 DC     BNE $8605     <- $85F3's copy loop EXITS on a cursor wrap and
8629  A9 FF     LDA #$FF         falls into $8629, terminating the packet
862B  D0 1A     BNE $8647

8A73  C8        INY
8A74  D0 15     BNE $8A8B     <- $8A51 falls into $8A76 (terminate) on a Y wrap
```
`copyPacket()` loops until a control code and never looks at the cursor;
`scanQueue()` masks `y & 0xFF` and keeps walking behind a `guard > 64` throw.
Unreachable today (largest port frame = 40 bytes, and `$8A7B` zeroes `$0E` every
frame) but the cartridge's `$0E` reaches **149 in MODE 5**, frames 287-307 --
`$9C2C-$9C35` calls `$9D8E` four times with no `$0E` gate at all (4x37+1 = 149),
which also explains the `builds per frame {4: 22}` bucket in section 2.
`tests/frame-gates.test.js:157` already cites the 149, so this is a note for
wave 4, not a defect now.

**F7 (informational) - second call sites, correctly out of scope, worth naming.**
ROM xrefs: `$88B6/$88F6/$892C` are also called from `$9C12/$9C15/$9C18`,
`$89E3` from `$9C1E`, `$8A30` is jumped to from `$8971/$89AC`, and `$8A51` has a
second caller at `$85B1`. `src/hud.js` names only the `jt_88AD` entry. `$9C24`'s
four unguarded `$9D8E` calls are the one place where "the HUD throttles the
streamer" does not hold, and they are inside mode 5.

**F8 (informational) - `copyPacket` re-establishes `$9B = 2` on direct `$85F3`
entry; the ROM does not** (`$85EB STA $9B` is prologue-only). Documented in
`src/hudpackets.js` as deliberate and safe today. Mutating the `$FD` arm's
`zp9B = 2` -> `0` is also green, for the same reason.

**F9 (informational) - three of the strongest HUD checks skip silently on a tree
without captures.** `tests/terrain.test.js`'s three nametable comparisons call
`t.skip()` when `tools/oracle/out/video/<f>/dump.json` is missing, and they are
the only checks that hold the lives suppression arms against cartridge data. On
this machine they run (the gate reported 0 skipped, and I read the diagnostics:
`f3500: $20 = 0, differing rows []`). On a fresh clone the gate would print
"ALL GREEN" with 3 skipped. Pre-existing `helpers.js` policy, not this wave's.

## What I RULED OUT
- The transcription of every routine the wave ports. Disassembled and compared
  instruction by instruction (section 2). No divergence found.
- `$9B` clobbering the player's tilt. `$A043`/`$A07B` write it and `$A0BE` reads
  it inside `updatePlayer` at `$9A6A`, which runs BEFORE `$9AC7`; the display
  list at `$80A7` reads `$0120`, not `$9B`. Keeping `$9B` as a local is safe.
- The parity model. `state.frame` is `INC $02` at `$80BE`, before the mode
  dispatch, exactly as `$80BE`/`$80D1` order it; `frame & 2` and a late
  increment are both loudly red.
- The `$0E < 4` gate being vacuous. It IS always 0 at `$9AC7` on both sides
  (the drain zeroes it at `$8099`), which is why the implementer's own
  `no-0e-gate` mutation was corpus-0 -- but the unit test does pin it and an
  off-by-one is red.
- The seeded HUD inputs. Confirmed constant across the compared window
  (section 5), so `tests/hud.test.js` really is the only guard; the implementer
  said so and it is true.
- Ordering: terminator before/after `stagePlay`, HUD after the streamer, INC
  `$02` late -- all red.
- The claimed oracle numbers, the self-test numbers, the four `$0700` images,
  the f571 block image, `hudCalls/hudRan`. All re-measured and all correct.

## What I could not do
- I did not re-run `python games/gradius/tools/oracle/scen.py` (a full re-record
  of 17 scenarios). The comparison was run against the recorded side as it
  stands, plus one fresh 700-frame Mesen run of my own (`queue.py`) that
  reproduced the wave's headline numbers from the cartridge.
- `tests/page-wiring.test.js` cannot run from a path containing a space
  (`ERR_INVALID_URL_SCHEME` out of `fileURLToPath`), so my mutation baseline is
  the other seven files (63 tests). It is green in the repo.

## If someone picks this up cold
The port is sound as far as I can drive it: no reproducible port-vs-cartridge
divergence, no frame number to point at. What is NOT sound is one of the wave's
own checks (F1) and one of its comments (F2). Fix F1 by changing the blanker
test's index from `$80|$11` to `$80|$0F`; fix F2 by splitting the histogram by
game mode. F3 is a policy question for whoever owns rule 1.
