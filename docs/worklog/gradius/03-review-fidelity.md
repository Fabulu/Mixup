# Wave 3 review: enemies exist (pool substrate, spawn engine, update loop, the fan)
status: DONE
wave: 3   role: review   started: 2026-07-29   finished: 2026-07-31
subject: commit `e1d0772` "Enemies exist: the pool, the spawn engine, the update loop, and two wrong readings"

## The task, as I understood it
READER. Verify by content, not by the implementer's report. Lens: behaviour
preservation and fidelity to the cartridge. I did NOT edit `games/gradius/src/`
(verified byte-identical at the end); all mutation testing was done on a scratch
copy under the scratchpad, per docs/knowledge/03 ("do this on a scratch copy").

## What I MEASURED

### 1. The gate, run by me, twice (before and after re-recording the oracle)
```
node --test games/gradius/tests/
  # tests 110  # pass 110  # fail 0  # skipped 0  # todo 0

node games/gradius/tools/test-all.mjs
  18 scenarios, 5045 of 5888 frames compared (6 truncated), 0 failures,
  0 clamps uncovered, 0 stale annotations,
  9 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins
                    w_0019 w_0024 w_004C)
  PASS enemy-waves 1465 frames all TIER 1 fields exact   (TIER 1: 351 fields)
  GREEN -- 6 passed, 0 failed, 0 SKIPPED
```
Note for the record: the runner's "0 SKIPPED" counts STAGES. Nine FIELDS are
skipped, each with a printed reason, and `w_004C` is newly watched this wave.
That is the documented mechanism (compare.mjs puts the count on the verdict
line), not a hidden skip.

### 2. The oracle side reproduces from the ROM - this was the load-bearing check
I md5'd all 18 recordings, then re-recorded the whole corpus from
`Gradius (USA).nes` myself and diffed:
```
md5sum out/scen/*.json  > before
python games/gradius/tools/oracle/scen.py         # 18 scenarios, align 400, 324 watched
md5sum out/scen/*.json  > after
diff before after  -> IDENTICAL
```
All 18 artifacts are byte-for-byte reproducible. The comparison is not being
run against hand-tuned data.

### 3. Byte-level fidelity: I disassembled every address the port cites
`python games/gradius/tools/dis6502.py "Gradius (USA).nes" linear <lo> <hi>` over
`$A2C0-$A470`, `$A527-$A591`, `$8402`, `$83E4`, `$9650-$96BF`, `$9A50-$9AD0`,
`$ADAB-$AE20`, `$AE99-$AF10`, `$B0AF-$B198`, `$B198-$B26C`, `$B26C-$B311`,
`$BBB7-$BC60`, and a raw dump of the 42-entry table at `$AE1C`.

Every instruction in `src/enemies.js` matches. Spot-check highlights:
* `$A3A6 LDY #$03 / LDA ($9A),Y / STA $0064,Y / DEY / $A3AE BPL` really does exit
  with Y=$FF, N set, so `$A36B`/`$A378 BMI` ARE always taken. The port's
  unconditional calls are right.
* `$83E4` = `ASL A / ... / LDA ($98),Y` with Y = A+1 off the pulled return
  address `$AE1B` - i.e. `word($AE1C + (type<<1) & $FF)`. The 8-bit ASL claim
  (type $85 == type $05) is correct.
* `$9650: A9 0C 85 13 A9 00 85 5D 85 5B 85 5C` - `$5D` IS cleared every mode-5
  frame. The implementer's headline correction is right against the bytes.
* `$BC44: LDA $1A / BNE / LDA $19 / CMP #$02 / BCS / LDX $A8 / LDA $0360 /
  CMP $036C,X / BCC $BC59 / RTS` - fires only when playerX < enemyX. Correct.
* `$B2A5 DEC $046C,X / BEQ $B2AF / LDA #$00 / STA $046C,X` - the "stores zero
  when the DEC did NOT reach zero" reading is what the bytes say.
* Dispatch table dumped: 42 entries, entry 0 and 31 = `$AE70` (byte `60` = RTS),
  1/39/41 = `$AEDD`, 2 = `$AE99`, 3 = `$AEE1`, 4 = `$B205`, 5 = `$B0AF`,
  6 = `$B198`, 8 = `$B26C`. Matches the port's switch exactly.

### 4. The asset expectations, checked against the ROM independently
```
$A7D0 -> $A7DE; chunk0 ptr $A844, chunk1 ptr $A859
$A844: 10 80 30 81 50 80 70 81 90 80 A0 82 B0 82 C0 82 D0 82 E0 80 FF
$A859: 00 81 20 80
$A592: F4 2A     $A5BC: 0A 00 C8
$ADC5 (status1): 0C 0D 0E 0F      $ADD5 (status5): 20 21 22 23
$A5FE -> $A662   $A600 -> $A602
$AE71 -> $AE7D, script 0 = 26 27 28 00
tableB descriptors $80..$84: 01 05 00 00 / 01 05 01 00 / 00 08 02 04 /
                             05 04 03 02 / 05 04 04 03
```
Every `EXPECT_ENEMY_*` constant in verify_assets.py matches the cartridge.
`python games/gradius/tools/verify_assets.py --self-test` -> 25 of 25 mutations
reddened their target; 10 of 10 families seen red (I ran it).

### 5. MUTATION TESTING - 20 deliberate breaks on a scratch copy
Method: copy of `games/gradius` under the scratchpad with its own `package.json`
(`type: module`) and a copy of `out/scen`, so the repo's `src/` was never
touched. `corpus` = `compare.mjs --only enemy-waves` failure count;
`unitFails` = `not ok` count from `tests/enemies.test.js`.

RED (the check works):
| break | corpus | unit |
|---|---|---|
| `$B0B4` ADD -> OR (`setInitialised`) | **39 failures**, first at f1790 | 0 |
| `$B2A5`/`$B2CB` literal-oddity stores removed | **107 failures**, first at f955 | 0 |
| `$B1B9` seedArc xvelf 0 -> $40 | **49** | 0 |
| `$ADF1` animator reload 6 -> 7 | **27** | 0 |
| `$B0D6` curve timer $40 -> $30 | **92** | 0 |
| `$B0DB` direction pick forced never / forced always | **75 / 147** | 0 |
| `$AF06` freeSlot drops animFrame | **9** | 0 |
| `$A58C` carrier attrMask 3 -> 99 | **2** | 0 |
| `$A450` squadron `>= 4` -> `>= 9` | **9** | 0 |
| `$ADB7` loop given an `if (type===0) continue` fast path (+throw disabled) | **1** (`enemySlots@401`, 1379/1465 frames) | 0 |
| `$9656 STA $5D` deleted (nmi.js) | **11** | 1 |
| `$9658 STA $5B` deleted (nmi.js) | 0 | 1 |
| `$9A9C` camera `$5B` gate deleted (nmi.js) | 0 | 1 |
| `$A572`/`$A52B`/`$A52E`/`$A566` clearSlot stores dropped | 0 | 1 each |
| `$AEE3 SBC #$80` -> `#$40` | 0 | 1 |

**PASSED - i.e. no check anywhere caught them:**
| break | corpus | unit |
|---|---|---|
| handler 2 `$AE99` corrupted three ways (timer 5->99, gold threshold `AND $0F`->`AND $03`, script cursor frozen at 0) | 0 | 0 |
| `h_AEDD` fall-through into `$AEE1` REMOVED | 0 | 0 |
| `tail()` fall-through into `$AEDD` removed | 0 | 0 |
| `addX16` (`$B154`/`$B165`) fraction-carry propagation removed | 0 | 0 |
| `homeDown` `>=` -> `>` (`$B10C CMP $0320` boundary) | 0 | 0 |
| `$A44A` type-$0B gate `!== 0x0B` -> `!== 0x77` | 0 | 0 |
| `$BC19` bullet-slot tripwire made `if (false)` | 0 | 0 |

### 6. WHICH HANDLERS THE CORPUS ACTUALLY DISPATCHES (instrumented `dispatch()`)
```
enemy-waves only : {"$B0AF":4804, "$B26C":3924, "$B205":434}
ALL 18 scenarios : {"$B0AF":23840,"$B26C":4053, "$B205":434}
```
**Three** handler targets, not eight. `$AE70`, `$AEDD` (h1), `$AE99` (h2),
`$AEE1` (h3) and `$B198` (h6) are dispatched ZERO times anywhere in the corpus.

### 7. Did existing behaviour change?
No. 5045 - 1465 = 3580 frames over the 17 pre-existing scenarios, all TIER 1
exact, now judged against a watch list that grew 105 -> 324 addresses (strictly
more interrogation than before). Scenario counts per commit:
```
25f78f6 16 scenarios watch=87    (the plan's baseline: 16 / 3341 frames)
eb901b0 17 scenarios watch=92    (wave 1 added s0-handover, 239 frames)
6b5bb34 17 scenarios watch=105
e1d0772 18 scenarios watch=324
```
3341 + 239 (s0-handover) = 3580. Truncation is driven purely by the ORACLE rows
(`compare.mjs` stops at `w_0100 != 1` or `$1B` bit 7 clear), never by the port
throwing, so wave 3 structurally cannot have silently shortened a window - and
the totals confirm it did not.

### 8. Rule 1
`git ls-files games/gradius/assets` -> empty. `git check-ignore -v
games/gradius/assets/enemies/tables.json` -> `.gitignore:22:assets/`. The
commit's `--stat` contains no `assets/`, `rip/`, `dist/` or ROM file.

## What I RULED OUT
* **Fabricated / hand-tuned oracle data.** Re-recorded all 18 from the ROM;
  byte-identical.
* **The harness setting up state the app never has** (trap 4.2). `seedFromRam`
  seeds every new field from the cartridge's own `$0000-$07FF` at align frame
  400; nothing is invented. `POKEABLE` still gates the poke channel.
* **A fall-through the cartridge takes and the port does not.** I walked every
  ported routine's exit against the disassembly: `$A3E4->$A411`,
  `$AE99->$AEDA->$AEDD->$AEE1`, `$A32F`, `$B109->$B111`, `$B0F7->$B111`,
  `$B298->$B29D`, `$B2BB->$B2C0`, `$B23C->$B20A`, `$BC15->$BC19`,
  `$B267->$B250`, `$B1E2->$B1E8`, `$B1F7->$B1EB`, `$B2D8->$B2B5`. All present
  and correct. `$B184` is correctly ABSENT (only reachable from `$B1E5`/`$B1FA`,
  inside handler 6's unported entry path).
* **A restructured "pure port".** `src/enemies.js` is new; nothing was moved.
  The two touched pre-existing tests changed their LEVER for a stated
  cartridge-fidelity reason (`$A2C0`'s first instruction is `LDA $3A`), and the
  `$3A`-on-streamer behaviour is still covered by a direct `streamBlock()` test.
* **The retired wave-1 knownFail being quietly deleted.** It was unwrapped into
  a live `test(...)` with its assertions kept verbatim AND strengthened
  (`s.spawn.z5D = 7` / `assert $5D === 0` added). All three of its stores are
  red-validated above.
* **`enemySlots` being a decorative counter.** The fast-path mutation reddens it
  at frame 401 for 1379 of 1465 frames.
* **`$04CC`, `$0496,Y`, `$0460,Y`, `$044C` being unchecked.** The corpus is
  blind to all four (they are not in the watch list), but the unit test
  `$A527 clears 21 arrays at slot j+12 AND two bytes at index j` catches each
  one. That is the layering working as designed.

## What I FOUND (see the structured verdict for the ranked list)
1. Handler 2 (`$AE99`, ~20 lines) has ZERO coverage in either layer.
2. Handler 1's fall-through into `$AEE1` - the file's own headline "TWO HANDLERS
   FALL THROUGH INTO EACH OTHER", docs/knowledge/02 trap 1 - is guarded by
   nothing. The test named for it only exercises the `$5B != 0` arm.
3. `$B154`'s fraction-carry (the "that is what makes this a real 16-bit add"
   comment) is never exercised: `xvelf` is 0 on every call in the corpus.
4. The commit message's "the eight that ARE ported ... are the ones stage 1
   reaches in the first 1865 frames" is false as measured: three are reached.
   Also "34 of the 42 dispatch entries" unported is really 31 of 42 entries
   (42 targets minus the 8 named handlers is an entry/target mix-up), and
   "waves 1-2 added long-idle and s0-handover" is wrong about long-idle
   (it predates the plan at 25f78f6; only s0-handover was added).
5. `state.work.enemySlots` is reset only INSIDE `updateEnemies()`, so on a frame
   where the mode-5 body does not run the port reports the previous frame's 10
   while the cartridge's hook reports 0. Not observable today (I checked every
   recording: the only `enemySlots == 0` rows are frames 0-309, plus post-death
   rows at 566-639, all outside every compared window), but latent.

## What I could not do, and why
* I could not exercise `$BC44`'s fire path or slots 22-31. That is by
  construction - `enemy-waves` parks the ship at X=240 so `playerX >= enemyX`
  on every call. It is disclosed in the code and the commit message, and the
  unported side is a loud throw, so it fails loudly rather than silently. It
  does mean a REACHABLE cartridge state has no scenario. Owner: whoever ports
  `$BC59`.
* No pixel layer for Gradius exists yet (`games/gradius/tests/` has no visual
  test; `tests/visual/renderer.test.js` is the Batman port). The enemies now
  reach OAM via `msExpanded`/`spriteRecords`/`spritesStored`, which were
  promoted INFO -> TIER 1 this wave and are exact on 5045 of 5045 frames - that
  is a display-LIST check, not a picture check (docs/knowledge/01's table:
  the state-trace layer is blind to drawing). Not a wave-3 regression; noting it
  because trap 2 is exactly this.

## If someone picks this up cold
The port matches the cartridge everywhere I could check it byte for byte, and
the corpus has real teeth on the three handlers stage 1 actually runs. The gap
is entirely in what the corpus can REACH: handlers 1, 2 and 3 are capsule /
explosion code that only `$BE93` (the kill routine, wave 6) can produce, so they
are ported-but-unwitnessed. Do not "clean up" `h_AEDD`'s fall-through or
`addX16`'s carry - I verified both against the disassembly and both are right;
they are simply unguarded. Add unit tests for them (cheap: type $81 with
`$5B = 0` must drift; `xvelf = $80` twice must carry into X) before wave 6
touches that code.

Mutation scratch tree: `<scratchpad>/mut` (throwaway). Backups of the oracle
recordings and the two source files: `<scratchpad>/scen-backup`,
`<scratchpad>/enemies.js.orig`, `<scratchpad>/nmi.js.orig`.
