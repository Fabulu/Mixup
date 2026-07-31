# Wave 1 review: model corrections and queue plumbing (REVIEWER, reader)
status: DONE
wave: 1   role: review   started: 2026-07-29   finished: 2026-07-31

## The task, as I understood it
Review `15f88dc` as a READER (no `src/` commits). Lens: behaviour preservation +
fidelity to the cartridge. Verify by content, re-run the gate myself, break at
least two new checks and see them red, restore byte-identical.

## What I did
1. Re-dumped every ROM address the commit cites, straight out of
   `Gradius (USA).nes` (iNES, 16-byte header, 32 KB PRG at $8000: file offset =
   `16 + (addr - 0x8000)`), and re-derived every branch target arithmetically.
2. Read the whole diff and the four touched `src/` files.
3. Ran the whole gate, including `scen.py` (re-records the oracle side).
4. Mutation-tested: four mutants, two of them ones the implementer never tried.
5. Restored `src/` byte-identical after every mutant and checked `git status`.

## What I MEASURED

### ROM bytes -- the commit's disassembly is correct
```
$9A88  A5 1B 10 38 A5 1E F0 34 A5 1F F0 30 A5 0D D0 2C A5 15 D0 07
       A5 5B D0 03 20 EE 98 AD 02 20 29 40 F0 F9 ...
$8641  A9 00 F0 00 A6 0E 9D 00 07 E8 86 0E 60
$9D83  A5 3A D0 06 A5 0E C9 04 90 01 60 A9 00 85 57 A5 58 D0 1C
       A5 54 38 E5 3E 85 98 A5 55 E5 3F 30 0F C9 01 90 0B D0 06
       A5 98 C9 80 90 03 E6 57 60
$8B14  A9 00 A2 03 85 9D A4 1F F0 0D A2 07 88 D0 06 A0 02 84 1F
       D0 02 A9 01 85 1E A0 03 BD 08 8B 99 00 02 CA 88 10 F6
$80AD  20 AB 8B 20 41 86 A9 00 85 04 68 A8
$8A76  A9 00 8D 00 07 85 0E            ($8A7B STA $0E -- the drain clears it)
$8898  A5 0E C9 04 90 01 60 A5 02 4A 90 FA ...  (gate on $0E, then odd $02 only)
$9F4F  A4 19 C0 04 F0 3F                (stage-4 collision skip)
$98EE  A9 80 18 65 3D 85 3D ...         (camera += 0.5 px/frame)
```
Branch targets check out: `$9A8A+$38 -> $9AC4`, `$9A8E+$34 -> $9AC4`,
`$9A92+$30 -> $9AC4`, `$9A96+$2C -> $9AC4`, `$9A9A+$07 -> $9AA3`,
`$9A9E+$03 -> $9AA3`; `$9D85+6 -> $9D8D`, `$9D8B+1 -> $9D8E`,
`$9D94+$1C -> $9DB2`, `$9DA1+$0F -> $9DB2`, `$9DA5+$0B -> $9DB2`,
`$9DA7+6 -> $9DAF`, `$9DAD+3 -> $9DB2`; `$8B1C+$0D -> $8B2B`,
`$8B21+6 -> $8B29`, `$8B27+2 -> $8B2B`. The `$9DA1-$9DAD` ladder is translated
branch-for-branch and correctly (`BMI`, then `CMP #$01/BCC`, then `BNE`, then
the `$98 < $80` tail). The `$9ACA` gate is `A5 5B D0 03` at `$9ACA` ahead of
`20 83 9D` at `$9ACE` -- as claimed.

### The gate, run by me
```
node --test games/gradius/tests/
  # tests 54 / # pass 54 / # fail 0 / # skipped 0

python games/gradius/tools/oracle/scen.py       exit 0
  === ORACLE CORPUS: 16 scenarios, align frame 400, 92 watched addresses ===
  all 16 re-recorded, written to out/scen (gitignored)

node games/gradius/tools/test-all.mjs           (AFTER the fresh re-record)
  16 scenarios, 3341 of 4184 frames compared (6 truncated: right-wall@493,
  diag-rd-lu@533, diag-ru-ld@445, lr-both@482, speed6-right@515,
  speed3-diag@529), 0 failures, 0 clamps uncovered, 0 stale annotations.
  [STILL BROKEN] terrain-streams-at-double-rate: 47 field/scenario pairs
      long-idle:w_000E@402  w_0054@598  w_0055@854  w_0057@599  w_0058@572
  self-check: 3 deliberate breaks all RED (lead1 153, seed-x+1 116,
      laginject=450 146 TIER 1 failures)
  GREEN -- 5 passed, 0 failed, 0 SKIPPED

node tools/build-dist.mjs
  rom-leak guard: 112 files checked against 2 ROM(s) -- clean, no allowlist
```
`w_000E` first diverges at 402, an ODD frame -- so frame 401 now MATCHES. That
is the $8641 fix confirmed from the oracle side, not from the report.

### The $8641 byte and the 4+n wire length, confirmed from CARTRIDGE data alone
`out/scen/long-idle.json`, 1000 recorded frames, `$0E` histogram:
```
{1:339, 9:86, 13:79, 15:173, 37:1, 38:84, 40:87, 45:128, 49:1, 90:1, 149:21}
lagDrops [283];  $0E == 37 occurs exactly once, at frame 285
```
`$0E == 1` on 339 frames is $8641 alone. `$0E == 38` on 84 frames is one terrain
block (4 tile packets of `4+4` + 1 attribute packet of `4+1` = 37) plus the one
$8641 byte. This is independent of the port and it confirms both the `4 + n`
packet cost and the `+1` terminator.

### Mutants I ran (src restored byte-identical after each; sha1 checked)
| mutant | result |
|---|---|
| drop `state.zp5B === 0` around `streamBlock` (`no-9aca`) | frame-gates **test 7 RED**, 8/9 pass |
| delete the `if (hi & 0x80) build = true` arm (`lead-unsigned`) | **tests 1 and 4 RED**, 52/54 |
| replace `state.zp1E !== 0` in the split with `true` | **54/54 GREEN**, and `compare.mjs` 3341/4184, **0 failures** |
| replace `state.zp1F !== 0` in the split with `true` | **54/54 GREEN** |

sha1 after restore: `nmi.js 916967b26c15bfc21a96788df1087db7a774d2e7`,
`terrain.js c1ef70784b7dc243050c5f594802f859be423d82`,
`vram.js ebd6ffc887d63d7133da19e43337ec8ee0ef5905`,
`oam.js 758e636860bd486b0ceade905a746a1a6b8ce4b4`;
`git status --short games/gradius/` empty.

### The pause defect, measured in the port
`$965C A5 15 / $965E F0 03 / $9660 4C 8C 9A` -- `LDA $15 / BEQ $9663 /
JMP $9A8C`. When `$15 != 0` the cartridge jumps the WHOLE of mode 5 to `$9A8C`,
skipping `$9A5E`'s `$5C` test, `$9A64 JSR $A2C0`, `$9A67 JSR $BBB7`,
**`$9A6A JSR $9FFC` (the player)**, `$9A6D JSR $ADAB`, `$9A70 JSR $BFE2`,
`$9A73 JSR $8974`, `$9A76 JSR $C772` and **`$9A79` (the scroll latch)**.
The port's `stagePlay()` gates only `advanceCamera()`. Driven directly:
```
s.zp15 = 1;  then 10x nmi(s, RIGHT, res)
BEFORE {"px":80,"py":96,"scrollX":1,"cam":[0,2,0],"prog":4}
AFTER  {"px":90,"py":96,"scrollX":2,"cam":[0,2,0],"prog":64}
```
The camera is correctly frozen, but the ship moved 10 px and `$12` advanced.
`src/state.js`'s NEW comment states the correct rule ("$9650's first branch then
jumps the whole update to $9A8C") while the code implements a narrower one, and
`frame-gates.test.js` test 6 stays green because it holds no buttons.

### The fall-through
`$9ACE` is a `JSR`. The cartridge falls straight on:
```
9AD1 A5 1B / 9AD3 10 04 / 9AD5 29 70 / 9AD7 F0 01 / 9AD9 60
9ADA A5 09 / 05 16 / 05 0D / D0 5B ... 9AEC A9 01 / 9AEE 85 15
```
`$9AEE STA $15` is the ONLY writer of `$15` in this path. `stagePlay`'s docblock
says the routine is "`$9A5E-$9ACE`" and the "WHAT IS NOT PORTED" list in
`nmi.js` does not name `$9AD1`. So the port cannot reach pause at all, which is
why the pause defect above is latent.

## What I RULED OUT
* **Stale `bandB.ctrl` / `bandB.chrBank` when the split is suppressed.** Not a
  problem: `src/render/ppu.js:85` computes `const split = f.bandB.ran && ...`
  and lines 90/95 fall back to band A's `ctrl`/`chrBank` whenever `ran` is
  false, so the unwritten fields are never read.
* **`buildDisplayList` now mutating `$1F` out of band.** It has exactly one
  production call site (`nmi.js:122`); the only other callers are tests. The
  1 -> 2 promotion is idempotent.
* **`$0E` gate ordering.** `$80B0` runs after `$9ACE` and `$8A7B` zeroes `$0E`
  at the top of the next frame, so the terminator can never reach the streamer's
  own gate. `src/vram.js` says so and `frame-gates` test 2 asserts it.
* **`$57` arithmetic.** `$9D90 STA $57` before the `$58` test and `$9DAF INC`
  after -- the port's `b.ahead = 0` / `u8(b.ahead + 1)` placement matches, and
  neither the `$3A` nor the `$0E` gate touches it. Test 5 covers both.
* **`$3A`, `$5C`, `$5B` claims.** `$9F4F A4 19 C0 04 F0 3F` confirms the stage-4
  collision skip; `$965C` region confirms `$5C` is only computed on `$19 == 4`.
* **The `$1E == 0` handover behaviour itself.** The port is CORRECT: entering a
  frame with `zp1F = 1` gives `zp1E 0 / zp1F 2 / bandB.ran false`, camera frozen.
  What is missing is a check, not the behaviour.
* **A silent restructure hiding in the "pure" parts.** The `$1E`/`$1F` bytes,
  the `$0E` cursor and the `QUEUE_LIMIT -> QUEUE_GATE_BYTES` rename are all
  additive; `drawMetasprite`, `nextSlot`, `rotateBase`, `emitBlock` and
  `advanceProgress` are untouched by this commit.

## What I could not do, and why
* I could not measure the cartridge's own pause frame directly (no hook script
  in `tools/oracle/` drives START and samples the player). The claim rests on
  the `$965C` bytes, which are unambiguous, plus the recon's reported `$3E`
  freeze. Anyone porting wave 4 should hook `$9FFC` with `$15 = 1` and confirm
  the entry count drops to 0 before writing code.

## If someone picks this up cold
The commit is sound on everything it claims about the ROM -- I re-derived all of
it. Two things to carry into wave 2/4:
1. `$15` does not only freeze the camera; it short-circuits `$9650` to `$9A8C`.
   The port still runs the player on a paused frame. `state.js` already says the
   right thing; the code does not.
2. `state.zp1E !== 0` and `state.zp1F !== 0` in `src/nmi.js`'s `split` are BOTH
   deletable with the entire gate staying green. The state that separates them
   is `zp1F = 1` entering `nmi()` -- the handover -- and no test drives it
   through the frame. Add one assertion (`s.zp1F = 1; nmi(...);
   assert bandB.ran === false`) and both become guarded.
