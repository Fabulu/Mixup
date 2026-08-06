# Wave 3 - Enemies exist: pool substrate, spawn engine, update loop, the fan
status: DONE
wave: 3   role: impl   started: 2026-07-31

## The task, as I understood it

Make the first ~1400 frames of stage-1 enemy waves bit-exact: the 32-slot pool
substrate ($A527), the spawn engine ($A2C0), the formation machine
($A3E4/$A411 + $A592/$A5BC), the update loop ($ADAB/$ADE5) with the
status-gated animator and the 42-entry dispatch, handlers 1/2/3 (with the
2->1->3 fall-through AS a fall-through) and 5 ($B0AF, the fan), the shared
16-bit movers, $B251's off-screen box, and the bit-7 initialised flag.
Everything else = loud named throws. Plus a new oracle comparison of the
enemy slots over >= 1400 frames including the chunk-0->1 switch.

## What I did

New file `games/gradius/src/enemies.js` (the whole engine). Substrate in
`src/state.js`. Wiring in `src/nmi.js` ($9A64 / $9A67 / $9A6D, plus the
$9650 mode-5 entry). Tables through `tools/export_assets.py` into
`assets/enemies/tables.json` with a new `enemies` check family in
`verify_assets.py`. New scenario `enemy-waves` + 218 new watched addresses.
New `tests/enemies.test.js` (14 tests). $ADE5 added to `objloop.lua` as a
compared work counter.

## What I MEASURED

### 0. Baseline, before I touched anything

```
node --test games/gradius/tests/     95 pass, 0 fail, 0 skipped
node games/gradius/tools/test-all.mjs
  GREEN -- 6 passed, 0 failed, 0 SKIPPED
  17 scenarios, 3580 of 4423 frames compared (6 truncated), 0 failures
```

NOTE FOR THE PLAN: the brief says "the 16 existing scenarios (3341/3341)".
That number is stale - waves 1-2 added `long-idle` and `s0-handover`, so the
baseline is **17 scenarios, 3580 of 4423**. That is the number I held myself to.

### 1. The plan's ">= 1400 compared frames" needed three facts nobody had

**(a) The player dies in every long hold.** compare.mjs truncates at
`$0100 != 1`, so the scenario has to keep the ship alive. Measured, first
death frame over a 1460-frame hold (`probe.py --frames 1460 --script
"200:,10:S,190:,1060:<hold>" --watch 0100`):

| hold | first frame with `$0100 != 1` |
|---|---|
| idle | 1051 |
| R    | 493 |
| RU   | 445 |
| U    | 1076 |
| L    | ~1180 (deduced: the L run respawned before frame 1299) |
| **RD** | **SURVIVED all 1460** - and, extended, dies at **1866** |

`RD` (bottom-right corner, X=240 Y=192) is the only hold that survives, and it
is not luck: `$BC44`'s stage-0/1 gate and the fan's return leg both depend on
the player's position (see 5 below). So the scenario is `1466:RD`, giving
**1465 compared frames, 401..1865**.

**(b) A death also destroys the chunk switch.** In the L run the camera was
reset by the respawn and the spawn engine re-fired chunk 0's FIRST record at
scroll `$0020`, game frame 1299 (`enemyprobe.py --timeline`), with
`total.waveInit = 2`. So a truncated-at-death scenario cannot reach the
chunk-0 -> 1 switch at all.

**(c) 1400 frames needs FIVE handlers, not four.** `enemyprobe.py --frames
1900 --script "200:,10:S,190:,1500:RD"`:

```
typeHist = 4=10 5=32 8=20 132=560 133=4808 136=3934
total.hdlr04_B205 = 570   total.hdlr05_B0AF = 4840   total.hdlr08_B26C = 3954
total.enemyUpdate = 1590  total.perSlot = 15900      (exactly 10.00 per frame)
total.allocQ_ok = 58  total.allocQ_fail = 1  (a NATURAL failure at frame 1152)
total.waveFire = 22   total.waveInit = 1     total.waveEnd = 4
ev  378/506/634/762/890  cmd $80/$81/$80/$81/$80  scroll $0020..$0120
ev  954/1018/1082/1146   cmd $82                  scroll $0140..$01A0
ev 1210 cmd $80 $01C0     ev 1339 cmd $81 $0200 ptr $A85B   <- the chunk switch
ev 1466 cmd $80 $0240     ev 1530/1594/1658 cmd $82
ev 1722 cmd $83 rec=$05$04$03$02   <- TYPE $04 FIRST APPEARS HERE
ev 1786 cmd $84    ev 1850 cmd $83
```

So the window needs handlers **1, 2, 3, 5, 8 AND 4**, and handler 4 ($B205) is
interleaved with handler 6 ($B198) - $B205 jumps into $B1B1, $B1DF and $B1F1.
I ported 4's entry and the shared body; **6's ENTRY is a loud throw** because
no run has ever dispatched it. The plan's "handlers 1/2/3/5, everything else a
throw" is not compatible with its own ">= 1400 frames"; I chose the frames and
wrote down which handlers that forced.

### 2. THE THING I GOT WRONG FIRST, and it is the most valuable finding

`$BBB7` (called from `$9A67`, between the spawn engine and the player) opens
`LDA $5D / BNE $BC19`. I read `$5D` as the free-running wave counter it looks
like ($A335 INC $5D) and concluded the `$BBE5` arm was unreachable after frame
378. **It is the other way round.** `$9656 STA $5D` clears it at the top of
EVERY mode-5 frame, so `$5D` is non-zero at `$BBB7` only on a frame a wave has
just fired on - i.e. the "unreachable" arm runs on ~99% of frames.

The wave-1 knownFail in `tests/frame-gates.test.js` had this written down
already ("$9656-$965A: mode 5 clears $5D/$5B/$5C at entry") and it is why I
found it before the comparison did. Consequence: I ported the $9650 entry
block, the knownFail retired itself with a SURPRISE PASS, and **wave 1's one
BLOCKING defect ($5B freezes the camera and the streamer FOREVER instead of for
one frame) is closed in this commit.**

What `$BBE5`'s arm actually does, ported: for every enemy of `type AND $7F >= 3`
it subtracts `$98` (1 on stage 1) from `$040C,X`; on borrow it reloads from
`$04EC,X`, calls `$BC44` and LEAVES the loop. It is the enemy's shot countdown.

### 3. AND THE SECOND THING I GOT WRONG, caught by the comparison itself

I wrote, in a comment, "`$04EC` is $C8 = 200 for every stage-1 squadron and no
stage-1 enemy lives 200 frames, which is why slots 22-31 were never populated".
The very first 1465-frame comparison threw:

```
Error: enemy slot 17's $040C countdown reached 0: $BC0C JSR $BC44 ... is not ported
```

Type `$88` marches left 1 px/frame from X = `$F0` and is only freed below X = 4,
so it lives **236** frames and does reach the shot. What actually keeps the
bullet slots empty is `$BC44`'s own gate, which I then read properly:

```
BC44  LDA $1A / BNE $BC59
BC48  LDA $19 / CMP #$02 / BCS $BC59
BC4E  LDX $A8
BC50  LDA $0360 / CMP $036C,X / BCC $BC59    <- playerX < enemyX -> FIRE
BC58  RTS                                    <- otherwise, no shot at all
```

On stages 0 and 1 an enemy only shoots when **the player is to its left**. The
`enemy-waves` scenario parks the ship at X = 240 and every enemy spawns at
`$F0` = 240 and marches left, so `playerX >= enemyX` on every call and the
allocator at `$BC59` is never reached. That is also the real explanation for
00-recon-enemies.md's "slots 22-31 stayed empty", which the recon left open.

Both wrong readings are kept in the code as comments, because the correction is
the useful part.

### 4. A correction to 00-recon-enemies.md 8 (the "j-indexed arrays")

The recon says `$0460+j` and `$0496+j` are arrays DISTINCT from `$046C+j`, and
that a port merging them is wrong. The bytes are indeed distinct; the framing
is not. Doing the arithmetic:

```
$A52B  STA $0496,Y   Y = j (0..9)  ->  $0496..$049F  ==  s0480[22 + j]
$A52E  STA $0460,Y   Y = j (0..9)  ->  $0460..$0469  ==  s0460[j]
$A569  STA $0460,X   X = j + 12    ->  $046C..$0475  ==  s0460[j + 12]
```

`$0496 = $0480 + 22`. So they are the **enemy-bullet** and **shot** slots'
entries in two arrays that already exist, not two new arrays. Modelling them as
separate arrays puts them at addresses the cartridge does not use - and the
watch list compares addresses. `state.js` says this at the code.

Also measured while writing the substrate: page $0300 is **not** eight arrays of
32. `$03A0` and `$03B0` are only `$10` apart, so `carrier[16..21]` and
`yvel[0..5]` are the same RAM. Harmless (every writer of the $03B0 array folds
in the +$0C), but `peek()` resolves the watched addresses explicitly rather than
letting a range catch-all decide.

### 5. The port, measured against the cartridge

`python games/gradius/tools/oracle/scen.py` (18 scenarios, align 400,
**324 watched addresses**) then `node games/gradius/tools/test-all.mjs`:

```
=== enemy-waves === 1465 of 1465 compared frames (align 400)
    [PASS] TIER 1: 351 fields, 0 divergent
    [INFO] 1 fields downstream of unported subsystems:
      w_0036: 1465/1465 frames differ, first at 401
    lag: cartridge 1 total, 0 inside the compared window; port 0  [PASS]
...
  18 scenarios, 5045 of 5888 frames compared (6 truncated: right-wall@493,
  diag-rd-lu@533, diag-ru-ld@445, lr-both@482, speed6-right@515,
  speed3-diag@529), 0 failures, 0 clamps uncovered, 0 stale annotations,
  9 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins
  w_0019 w_0024 w_004C)

  GREEN -- 6 passed, 0 failed, 0 SKIPPED
node --test games/gradius/tests/   110 pass, 0 fail, 0 skipped  (was 95)
```

The watch list went 106 -> 324 addresses: sixteen arrays x the ten enemy slots
(status, metasprite, anim timer, anim frame, palette OR, type, Y, Y-sub, X,
X-sub, carrier, Y-vel, Y-vel-frac, X-vel, handler state, sub-state) plus the
shot countdown `$040C` and its reload `$04EC`, the second phase counter
`$04AC`, the unidentified `$04CC`, and the engine's zero page
($47 $49 $4A $4B $5D $60 $61 $64-$67 $69 $6A $6B $6C $6D $6E $6F, and $1A).
The first recording only had 284 of them; `$040C` was written every frame by
ported code and NOT compared, which is docs/knowledge/03's first shape, so the
corpus was re-recorded with the extra four ranges before the gate was called.

5045 - 1465 = **3580**, i.e. the 17 pre-existing scenarios are unchanged to the
frame. The `enemy-waves` window covers all ten chunk-0 records, the `$FF`
terminator, the chunk switch at scroll `$0200` / frame 1339 (cursor `$A858` ->
`$A85B`), chunk 1's first four records, one natural allocation failure at frame
1152, and the first type-$04 dispatch at 1722.

### 6. THREE INFO ANNOTATIONS RETIRED, and one CORRECTED

`msExpanded`, `spriteRecords` and `spritesStored` had been INFO (measured,
printed, not failed) since the corpus existed, because "the cartridge expands
the ENEMIES' metasprites too and the port has no enemies". With enemies they
match **0 divergent frames on all 18 scenarios, 5045 of 5045**, so they are
TIER 1 from this commit. That is a real check on the display list: the port now
has to pick the same metasprite ids, at the same positions, in the same order.

`w_0036` stays INFO but its stated reason was WRONG and having enemies is what
proved it. The three counters match exactly and `$36` still differs on every
frame. Measured on `idle`, the cartridge's `$36` at the sample point reads
240, 52, 120, 188, 4, 72, 140, 208 - exactly `$2F`'s own `+$44` rotation, not
the display list's end cursor. What moves it is `$80AD JSR $8BAB`, the BLANK
PASS, which walks `$36` across the slots it fills with `$F4` and stores the
walked cursor back at `$8BC0`; how far comes from `$37`, i.e. from `$9F`, the
sprite budget `src/oam.js` does not model. Fixed in `compare.mjs` and in
`src/oam.js` in this commit.

(`$9F` is nowhere near biting: measured 48 of 62 at the end of the busiest
frame of the 1900-frame enemy run.)

### 7. Work budget - docs/knowledge/06 mechanism (C), answered NO

`$ADE5` is now a hooked counter in `objloop.lua` and a compared field
(`enemySlots`), and `scen.py` asserts it is 0 or 10 on every frame of every
scenario. Measured on the cartridge: **15900 entries over 1590 `$ADAB` calls =
exactly 10.00** (1900-frame RD run), and 26630/2663 on the recon's 3000-frame
run. `updateEnemies()` throws if its own count is not 10.

### 8. Every check seen red

Unit tests (`node --test games/gradius/tests/enemies.test.js`, 14 tests):

| break | red |
|---|---|
| (a) `$A378 BMI` made conditional on the descriptor byte `$64` | tests 5, 6 |
| (b) allocate UPWARD from slot 12 | tests 2, 5 |
| (c) reload `$6C` on allocation failure | test 6 |

(a) is the plan's own "must diverge on the FIRST wave": with `$64 = $01` the
conditional branch is not taken and nothing spawns. Note it did NOT redden the
trigger test - that test is about the cursor walk, which still happens; worth
knowing which check owns which fact.

The SAME three breaks, run against the 1465-frame comparison
(`compare.mjs --only enemy-waves`), which is where the plan wanted them:

```
(a) $A378 BMI conditional  -> FAIL 157/351 fields; first w_0049@506, w_004A@506,
                              w_0069@506, msExpanded@507 -- the first wave
                              INSIDE the window (frame 378's is in the seed)
(b) allocate UPWARD        -> FAIL 154/351 fields; first w_010C@411, w_0112@411,
                              w_012C@411 -- i.e. the SECOND squadron member.
                              Positions are the same set of values; only the
                              per-slot comparison sees it, which is the point.
(c) reload $6C on failure  -> FAIL 1/351 fields; w_006C@1152, 58 frames differ
    (no poke needed -- the RD run contains a NATURAL allocation failure at
     frame 1152, `total.allocQ_fail = 1`. The plan budgeted a poke channel for
     this; the scenario already reaches it.)
restored                   -> PASS 351 fields, 0 divergent
```

Frame gates (`node --test games/gradius/tests/`, 96 tests):

| break | red |
|---|---|
| delete `$9656 STA $5D` | test 9 |
| delete the `$9ACA` `$5B` gate | test 10 |
| delete the `$5B` term from the `$9A9C` camera gate | test 10 |

Assets (`verify_assets.py --self-test`): four new mutations, all seen red on
the new `enemies` family - `enemy-shift` (re-cite the whole spawn-data block
one byte along, consistently, so only the cartridge's measured wave records and
descriptors can tell), `enemy-byte`, `enemy-dispatch`, `enemy-anim`.
**25 of 25 mutations reddened their target; 10 of 10 families seen red.**

## What I could not do, and why

* **Handler 6 (`$B198`) has a throw for an entry and a ported body.** Its body
  is shared with handler 4 and is therefore exercised and compared; its entry
  has never been dispatched by any run made here, so I did not invent the
  conditions under which it is.
* **34 of the 42 dispatch entries are loud throws**, naming the type, the entry
  number and the ROM address. Same for `$A3B1` (single spawn - stage 1's first
  `cmd < $80` record is chunk 1's `C0 00` at scroll `$0380`, past this corpus),
  the `cmd >= $F0` spawners, `$C413`, `$BC59` (enemy bullets) and `$BBC3-$BBEB`
  (the `$17`/`$46` arms of the shot-countdown rate).
* **`$AE`/`$AF` are still a mystery.** `$ADAB` writes `$0080` there every frame
  and I did not find the reader either. Reproduced, not explained.
* **`$04CC` is still unidentified.** Cleared by `$A527`, no reader found.
* **`$B26C`'s `$046C`/`$04AC` phase counters are provably useless** and I ported
  them literally anyway: `$B2A5 DEC $046C,X / BEQ $B2AF / LDA #$00 / STA
  $046C,X` stores ZERO whenever the decrement did NOT reach zero, so the
  counters are seeded to 30 and immediately zeroed and the `BNE`s at
  `$B27F`/`$B284` never fire. It looks like an inverted branch in the original.
  The evidence that the literal reading is right: all three metasprites the
  routine can write appear in the measured per-slot histograms (56 closing
  down, 57 closing up, 58 Y-aligned), which only happens if the Y comparison is
  re-run every frame.
* **Two wave-1/2 tests had to change their lever.** `frame-gates` test 1 and
  `hud` test 16 used `s.build.gate = 1` ($3A) to hold the streamer off inside a
  whole NMI. `$A2C0`'s FIRST instruction is `LDA $3A / BEQ / JMP $C413`, so on
  the cartridge that also diverts the entire enemy spawn path into the
  stage-end spawner - a much broader intervention than those tests intended.
  They now use the streamer's other measured refusal (the 384-px lead at
  `$9D96-$9DAD`). `$3A`'s effect on the streamer is still covered directly, by
  the `$3A` / `$57` test that calls `streamBlock()` without an NMI.
* **Wave 1's written-down coverage debt is closed**, by its own option 2:
  `src/nmi.js` now exports `mode5Tail()` (the `$9A88-$9ACE` block). `$9A8C` is a
  real jump target - `$96A2`, `$98E2` and `$9660` all land there - so calling
  it with `$5B` raised is the state three ROM arms create, not invented state.

## If someone picks this up cold

* `python games/gradius/tools/oracle/enemyprobe.py --frames 1900 --script
  "200:,10:S,190:,1500:RD" --timeline` reproduces every cartridge number above.
* The single most dangerous thing to get wrong is still `$A36B`/`$A378` (the
  always-taken BMIs), and the second is now `$5D`: it is CLEARED at `$9656` on
  every mode-5 frame, so it is a within-frame flag and not a counter.
* `enemy-waves` is the only scenario in the corpus whose ship survives past
  frame 640, and it survives because of where it parks, not by accident. If a
  future change moves the ship, re-measure the death frame before assuming the
  window is still 1465.
* The next enemy work that needs a cartridge measurement rather than a port:
  slots 22-31 (drive a run with the ship LEFT of an enemy that has counted its
  `$040C` down - that is now a known-reachable state, not a mystery), and
  handler 6's entry.
