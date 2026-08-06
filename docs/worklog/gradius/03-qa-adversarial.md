# QA, adversarial lens - wave 3 (enemies: pool substrate, spawn engine, update loop, the fan)
status: DONE
wave: 3   role: qa   started: 2026-07-31

## The task, as I understood it
Read-only adversarial QA of commit `e1d0772`. Try to make wave 3 fail. Re-measure
the gate myself. Hunt for docs/knowledge/03's four shapes, for parameters never
varied, and for coverage that is not proportional to the content. I did not edit
`games/gradius/src/`, did not commit, and did not touch the index.

## What I did

1. Re-ran the whole gate from a clean tree.
2. Disassembled every ROM routine wave 3 claims to port and diffed it
   instruction-by-instruction against `src/enemies.js` / `src/nmi.js`.
3. Built a **scratch copy** of the port (src, tests, assets, oracle artifacts) at
   `…/scratchpad/g` and ran 90 deliberate source-level breaks against it -
   `node tools/oracle/compare.mjs` (all 18 scenarios) plus the enemy / frame-gate
   / nmi / page-wiring / player unit files - recording for each break whether the
   comparison went red, whether the unit suite went red, or neither.
   Runner: `…/scratchpad/w3mut.py` + `w3muts{,2,3}.json`.

## What I MEASURED

### 0. The gate, re-run by me (not quoted from the impl)

```
node --test games/gradius/tests/
  # tests 110  # pass 110  # fail 0  # skipped 0

node games/gradius/tools/test-all.mjs
  18 scenarios, 5045 of 5888 frames compared (6 truncated: right-wall@493,
  diag-rd-lu@533, diag-ru-ld@445, lr-both@482, speed6-right@515,
  speed3-diag@529), 0 failures, 0 clamps uncovered, 0 stale annotations,
  9 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins
  w_0019 w_0024 w_004C).
  === enemy-waves === 1465 of 1465 compared frames (align 400)
      [PASS] TIER 1: 351 fields, 0 divergent
  GREEN -- 6 passed, 0 failed, 0 SKIPPED

python games/gradius/tools/verify_assets.py --self-test
  25 of 25 mutations reddened their target; 10 of 10 families seen red
```

Every headline number in the impl worklog reproduces. `enemy-waves`'s oracle
artifact is real cartridge data (1866 rows, `enemySlots` histogram
`{10: 1556, 0: 310}` - 0 on the pre-mode-5 frames, 10 thereafter).

### 1. The transcription itself: NO functional divergence found

Disassembled and diffed line by line (`python games/gradius/tools/dis6502.py
"Gradius (USA).nes" linear …`):

`$A2C0-$A465`, `$A466-$A526` (unported spawners, confirmed the throws are on the
right arms), `$A527-$A591`, `$ADAB-$AF09`, `$B0AF-$B310`, `$BBB7-$BC63`,
`$9650-$96C0`, `$9A5E-$9AD5`.

Ruled out, each checked against the bytes:

* `$A36B`/`$A378` really are always-taken (`$A3AE 10 F8 BPL` ends with Y = $FF).
* `$A3F5-$A3FD` really does `STA $49` - the port's store-back of the masked
  `{2,3}` group id is right, not an invention. (Removing it → RED, `w_0049@506`.)
* the 42-entry table at `$AE1C` decodes exactly as the port switches on:
  entry 7 = `$B6E1`, entries 32-36 = `$AF10`, 37 = `$B61E`, 38/39/41 = `$AEDD`,
  40 = `$BB0F`, 0/31 = `$AE70`; `a >= 84` is the right bound (max entry 41).
* `$AE99`'s fall-through into `$AEDA`/`$AEDD`/`$AEE1`, and `$AED6` really is the
  RTS that ends the capsule-promotion arm.
* `$B205` ↔ `$B1B1`/`$B1DF`/`$B1F1`/`$B22E` interleave, including `$B23C BCC
  $B20A` re-entering the init block (and so wrapping bit 7 back off).
* `$B2A5`/`$B2C8`'s inverted-branch zeroing - the "provably useless" reading is
  what the bytes say.
* `$BC00 SBC $98` is a plain subtract (the `$BBF9 CMP #$03` above it leaves C set).
* `$BC44`'s stage-0/1 gate is `BCC` on `playerX < enemyX`, as ported.
* `$9650-$965A` and `$9A5E-$9A6D` wiring order.

### 2. Ninety deliberate breaks. The corpus caught most of them.

RED (comparison) - a representative list, all with the first divergent frame:

```
style-nocarrier   w_03B0@1789   style-noattr      w_0190@1789
style-nomaskE0    w_04F0@1789   style-nomask0C    w_0410@1789
emit-6f-ge3       w_03AC@1024   form-cnt-ge3      w_0049@954
fan-curve-41      w_010D@1398   fan-x60-to-61     w_010E@661
fan-sub3-speed4   w_010D@1391   fan-sub0-speed-FD w_010D@1374
anim-reload-7     w_012D@1238   anim-frame-mask-7 w_012D@1250
anim-base-shift1  w_012D@1232   anim-drop-zero-arm w_012C@401
b26c-real-count-dn w_0132@989   b26c-real-count-up w_006C@1152
b26c-drop-eq      w_0069@1150   b26c-anim-3A-3B   w_012C@1081
b26c-init-0480-81 w_012D@1181   b205-init-0480-21 w_030F@1791
b205-yv-FE-to-FD  w_0110@1836   b205-yv2-FE-to-FD w_030F@1793
seedarc-xvel-FD   w_010F@1807   init-or-not-add   w_010F@1847
velsub-no-borrow  w_010F@1778   veladd-no-carry   w_0069@1150
suby16-no-borrow  w_0110@1833   addy16-no-carry   w_032F@1762
stash-swap        w_006C@1152   clear-drop-yvelf  w_03EE@1372
free-clears-xy    w_032C@1171   free-is-full-clear w_032C@1171
offbox-xmin-05    w_010F@1847   offbox-xmax-F5    w_0114@524 (wiggle)
offbox-xmax-to-clear w_032D@1398 homedown-gt      w_0110@809
homeup-le         w_0330@625    curve-x-plus2     w_010D@1377
emit-y-no-accum   w_006E@411    emit-xy-swap      w_0110@643
emit-status-type-swap w_0069@774 desc-swap-64-67  w_0064@506
firewave-no-inc-5d w_005D@506   trigger-lo-strict w_005D@506
runengine-6c-order w_0069@401   chunk-reload-plus4 w_0049@1339
bullets-no-leave  w_040C@1158   bullets-5d-arm-invert w_040C@1024
terminator-FE     (throws)      firewave-cmd-nowrap (throws)
nmi-drop-5d-clear w_005D@507    nmi-bullets-after-update w_040C@1024
nmi-enemies-before-player msExpanded@537 (opt2-wiggle/wiggle)
```

That is a strong corpus. The findings below are what SURVIVED it.

### 3. What survived BOTH the comparison and the unit suite

(Scratch baseline is 5 unit failures - the touch-pad tests, which need assets I
did not copy. `unit=5` below therefore means "the unit suite did not react".)

| break | ROM instruction | compare | unit |
|---|---|---|---|
| `ae99-timer-4` | `$AE9E LDA #$05` | GREEN | 5 |
| `ae99-gold-5` | `$AEC6 LDY #$07` | GREEN | 5 |
| `ae99-47-mask` | `$AECC AND #$0F` | GREEN | 5 |
| `ae99-cursor-noinc` | `$AEB5 INC $042C,X` | GREEN | 5 |
| `ae99-carrier-invert` | `$AEBF BEQ $AEF8` | GREEN | 5 |
| `x16-nofrac` | `$B154 LDA $044C,X / ADC $038C,X` | GREEN | 5 |
| `x16-nocarry` | `$B161 JMP $B165` (carry propagation) | GREEN | 5 |
| `bullets-type-lt2` | `$BBF9 CMP #$03` | GREEN | 5 |
| `bullets-no-reload-gate` | `$BC07 BEQ $BC15` | GREEN | 5 |
| `firebullet-gt` | `$BC56 BCC $BC59` boundary | GREEN | 5 |
| `anim-drop-bmi-arm` | `$ADE8 BMI $AE14` | GREEN | 5 |
| `fan-y80-to-90` / `-to-40` | `$B0DE CMP #$80` | GREEN | 5 |
| `loadchunk-mask-0F` | `$A2E1 AND #$0E` | GREEN | 5 |
| `spawn-6d-mask-F8` | `$A408 AND #$F0` | GREEN | 5 |
| `emit-drop-0B` | `$A44C CMP #$0B` | GREEN | 5 |
| `substate-81-arm` | `$A2F2 CMP #$81` | GREEN | 5 |
| `emit-y-times3-nowrap` | `$A427-$A42E` 8-bit wrap | GREEN | 5 |
| `form-x-nowrap` | `$A3E6 ASL A` 8-bit wrap | GREEN | 5 |
| `addcursor-no-carry` | `$8409 INC $01,X` | GREEN | 5 |
| `loop-upward` | `$ADB3-$ADBE` loop direction | GREEN | 5 |
| `fan-default-rts-to-sub0` | `$B0CC RTS` (sub-state ≥ 4) | GREEN | 5 |
| `b26c-seed-1E-1F`, `-seedup-` | `$B298`/`$B2BB LDA #$1E` | GREEN | 5 |
| `offbox-free-to-clear` (y<8 exit) | `$B263 BCC $B269` | GREEN | 5 |
| `zAF-zero` | `$ADAB LDA #$80 / STA $AF` | GREEN | 5 |
| `clear-drop-0496` / `-0460j` | `$A52B` / `$A52E` | GREEN | **6** |
| `clear-drop-xvelf` / `-s04C0` / `-attr` / `-s04A0` | `$A566`/`$A572`/`$A545`/`$A56F` | GREEN | **6** |
| `aedd-drop-5b` | `$AEDD LDA $5B` | GREEN | **6** |
| `aee1-sub-40`, `aee1-free-09` | `$AEE7 SBC #$80`, `$AEF4 CMP #$08` | GREEN | **6** |
| `offbox-ymax-C5`, `offbox-ymin-09` | `$B265`, `$B261` | GREEN | **6** |
| `alloc-bne-to-bpl` | `$A4AE BNE` | GREEN | **6** |
| `terminator-FE`, `chunk-reload-plus4`, `nmi-drop-5d-clear` | | RED | **6** |

Equivalent mutants (my error, not a gap): `dispatch-mask-7f`, `trigger-hi-ge`,
`emit-bmi-to-eqFF`, `animguard-8`, `dispatch-bound-86`.

### 4. The watch list has a hole, and the code cites it as evidence

`scenarios.json` watches 324 addresses. Twenty of the twenty-one X-indexed arrays
`$A527` clears are in it. **`$044C-$0455` (`xvelf`, the X-velocity fraction) is
not.** Nor are the two Y-indexed writes' targets, `$0460-$0469` and
`$0496-$049F`:

```
$040C watched   $042C watched   $044C MISSING
$046C watched   $0460+j MISSING $0496+j MISSING   $04CC watched
```

`src/enemies.js:76-79` and `src/state.js:175` justify the modelling of the two
Y-indexed writes with "…would put them at addresses the cartridge does not use,
**and the watch list compares addresses**". For those two addresses it does not.
Only `tests/enemies.test.js` test 1 catches them.

### 5. Coverage proportional to the content

Eight handler bodies are ported. Against the cartridge the corpus exercises
**three**:

* `$B0AF` (fan), `$B26C` (wavy), `$B205` (arc) - exercised, and their constants
  are mostly pinned (see the RED list).
* `$AEDD` (capsule `$5B` freeze) and `$AEE1` (generic drift) - **unit tests
  only**; `aedd-drop-5b`, `aee1-sub-40` and `aee1-free-09` are all GREEN on all
  18 scenarios.
* `$AE99` (explosion script + capsule promotion, ~25 lines) - **nothing**.
* `$AE70` is an RTS; `$B198`'s entry is a throw.

`$B0AF`'s `default:` arm (sub-state ≥ 4) is unreachable in the corpus.

### 6. `$A8` / `$A9` / `$AE` / `$AF` - unmodelled and uncomparable

`$BC19` is `LDX #$13 / STX $A9 / LDX #$09 / STX $A8 / … / DEC $A9 / DEC $A8 /
BPL`. `bulletUpdate()` reproduces neither `$A9` nor the `$A8` walk, so after
`enemyBullets()` the ROM has `$A8 = $FF` and `$A9 = $09` while the port has
`state.spawn.zA8 = 0` (or the firing slot) and no `$A9` at all. **Benign today**:
`$ADAB` rewrites `$A8` seven instructions later, and the first `$A8` reader in
the player is `$A171`, inside the unported death path (checked with
`dis6502.py trace 9FFC`). But `peek()` has no case for `$A8`/`$A9`/`$AE`/`$AF`,
so none of them can ever be compared, and the comment "`$BC19`'s loop over them
is ported (it is what runs every frame)" covers two of its four instructions.

## What I could not do, and why

* I could not run `tools/test-all.mjs` against the mutated scratch tree - it
  hardcodes `games/gradius` paths relative to the repo root. The two stages that
  can see a change to `src/enemies.js` (`unit tests`, `port vs cartridge`) were
  both run for every mutation; the other four (inputs, assets, port-trace shape,
  self-check) do not read enemy semantics.
* I did not re-record the oracle (`scen.py`) - the recordings on disk are the
  ones the gate uses and I verified they are cartridge data, not port data.
* I did not find a functional divergence between `src/enemies.js` and the
  cartridge. If one exists it is outside the 1865-frame window and outside every
  instruction I disassembled.

## If someone picks this up cold

* The mutation rig is `…/scratchpad/w3mut.py` with `w3muts{,2,3}.json`; it
  operates on `…/scratchpad/g`, a copy of the port, and never touches the repo.
  `node tools/oracle/compare.mjs` on all 18 scenarios takes 5 seconds.
* The cheapest three fixes, in order of value: (a) add `044C-0455`, `0460-0469`
  and `0496-049F` to `scenarios.json`'s watch list and re-record; (b) either turn
  `$AE99` into a throw like `$B198`'s entry, or give it unit tests driven from
  the measured explosion scripts already in `EXPECT_ENEMY_EXPL`; (c) add unit
  tests for `enemyBullets()` - there are none, and three of its constants are
  free.
