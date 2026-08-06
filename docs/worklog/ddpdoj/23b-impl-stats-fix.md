# W23b IMPL - STATS-FIX: the W23 review's three findings (F3 / F1 / F2)

status: **DONE.** A surgical fix-pass on the W23 enemy-stats
port addressing the three findings the W23 review (`23-review.md`) raised.
READ-ONLY on everything except the three named files (`src/initbody.js`,
`tools/w23statsgate.mjs`, and the W23 + this worklog).
wave: 23b (review fix-pass)   role: implementer (sole writer this wave)
date: 2026-08-03
target: `ddpdojblk` VERSION-B (`$23xxxx`-`$29xxxx`).  Every address is build B.

## THE THREE FINDINGS (from 23-review.md)

- **F3 (MINOR, dormant today):** `src/initbody.js:152` -- the `damageFirstFamily`
  `$242A80` gate tested `R.classByte` (record **+$0D**); the ROM at `$269C32` is
  `btst.b #$5, $c(a5)` = record **+$0C** (the TYPE byte).  Off-by-one.  Bit 5 of
  the type byte is 0 for every damage-first family type (`$05/$07/$08/$09/$0B`),
  so it is dormant, but it is a real faithfulness bug.  Fix: `R.classByte` ->
  `R.typeByte` (the constant already exists).
- **F1 (MODERATE, green-hat):** `tools/w23statsgate.mjs` `main()` returned
  `divergent === 0 ? 0 : 1`, so the 2 known `$88` hb14/hb16 anim-driven hitbox
  residuals -- a measured, W24-owned accepted residual -- made `pgm.py check`
  report `[FAIL]` exit 1.  Fix: treat the `$88` hb14/hb16 residuals as a named
  accepted residual (pass when they are the ONLY strict divergences) and KEEP
  the gate able to FAIL on real mutants (RED sweep re-proven, RULE 4).
- **F2 (MODERATE, worklog honesty):** `23-impl-enemy-stats.md` claimed
  `pgm.py check   # enemy-stats gate PASS` -- it FAILed pre-F1.  Correct that
  line to the truth and tighten the status from a blanket "DONE / 0 divergent"
  to the honest "306/308 on the strict subset {hitbox,HP,palette,HP-reload};
  speed/heading/anim/flags overridden per-spawn by `$263808` -> W24 (511
  fields); 2 `$88` anim-hitbox residuals accepted."

## RULE 4 (every changed check SEEN RED then restored, SHA-verified)

Baseline captured before any edit (the gate RED on its known residual, the sweep
RED on every mutant):

```
initbody.js        dac8e800f6e8db966e34e563fc3ce666de6c9bbeca311c84a05ec90cdc0af823
w23statsgate.mjs   2f13cd0a09531186f159809f2614a5037146b40d74945406978e82a0f969a3e9
player.tables.json 237c42939e4f640c3cd685a65c760bbf2934fcf3733e5ef9342503df0f340082
node w23statsgate.mjs              -> 2 divergent ($88 hb14/hb16), exit 1
node w23statsgate.mjs --break all  -> 3 RED (822 / 113 / 16), exit 0
```

Post-edit (the gate GREEN on the accepted residual, the sweep still RED on every
mutant -- the F1 change silenced NOTHING; the F3 edit is the only `src/` delta):

```
initbody.js        83bde1a01d7e75665f47ef735577fd0101e37dafd33b98fead90f66cca215f5f   (F3 edit)
player.tables.json 237c42939e4f640c3cd685a65c760bbf2934fcf3733e5ef9342503df0f340082   (unchanged)
```

The SHAs of `src/initbody.js` and `rip/port/player.tables.json` are byte-identical
before and after the `--break` run -- the mutations are in-memory
(`makeSwappedRom` / `makeCorruptRom` build a modified `RomWindows`, never touch
disk), so the seen-red step leaves no trace.

## THE RESULT

**F3 -- the displacement byte (confirmed vs maincpu.bin).**  Capstone (5.0.7) at
file offset `$269C32`:
```
00269c32: 082d 0005 000c   btst.b #$5, $c(a5)
00269c38: 6706             beq.b $269c40
00269c3a: 4eb9 00242a80    jsr $242a80.l
```
The `(d16,A5)` displacement is `0x000C` = record **+$0C** (the TYPE byte), not
+$0D.  `src/initbody.js` line 152 now reads `ram.u8(a5 + R.typeByte)` (was
`R.classByte`); the comment + the `unported.note` text were corrected in lockstep
(class-bit-5 -> type-bit-5).  Dormant today (bit 5 of the type byte is 0 for every
damage-first family type), but faithful now.

**F1 -- the gate behaviour.**  `tools/w23statsgate.mjs`:
- `compare` now also returns `accepted88` -- the count of `$88` hb14/hb16 strict
  divergences (the anim-driven `$F400` hitbox whose target word is picked by anim
  at `$275E86`; anim is the movement-script field `$263808`, W24).
- `main` passes (`exit 0`) iff `divergent - accepted88 === 0` -- i.e. the ONLY
  strict divergences are the accepted `$88` hb14/hb16 residuals.  The `divergent`
  total still prints (transparency); a new RESULT line names the accepted count
  and the unexpected count.
- the RED sweep condition became `(divergent - accepted88) > 0` (was a hardcoded
  `> 2`), so it is robust to the residual count.

Measured (the corpus on disk):
```
$ node games/ddpdoj/tools/w23statsgate.mjs
RESULT stats divergent: 2 across 308 ... (99.3506 % match) -- 2 accepted $88
       anim-hitbox residuals (hb14/hb16, W24); 0 unexpected           exit 0
$ node games/ddpdoj/tools/w23statsgate.mjs --break all
RED [swap-tables]       divergent=822 RED
RED [corrupt-hp]        divergent=113 RED
RED [seed-wrong-stage]  divergent=16  RED                                       exit 0
```
So the gate is GREEN on the accepted `$88` residual and RED on every real mutant
(swap-tables adds 820 non-`$88` strict divergences; corrupt-hp adds a `$11` HP
divergence; seed-wrong-stage adds missing-in-port divergences -- none silenced).

**F2 -- the worklog correction.**  `23-impl-enemy-stats.md`:
- the status lead was rewritten from "DONE (measured; ...)" to the honest
  "306/308 on the strict subset {hitbox,HP,palette,HP-reload}; speed/heading/
  anim/flags overridden per-spawn by `$263808` -> W24 (511 fields); 2 `$88`
  hb14/hb16 anim-hitbox residuals ACCEPTED; 3 RED mutants all seen red."
- the command-summary line `pgm.py check   # enemy-stats gate PASS` was corrected
  to "exit 0 (W23b F1; pre-F1 was [FAIL] exit 1 on the 2 `$88` hb14/hb16
  anim-hitbox residuals -- a measured W24 gap, now accepted)".

## POST-WORK CHECKS

```
node --test games/ddpdoj/tests/                # 343 pass, 0 fail, 0 skip
node games/ddpdoj/tools/w23statsgate.mjs       # exit 0 (2 accepted, 0 unexpected)
node games/ddpdoj/tools/w23statsgate.mjs --break all   # 3 RED, exit 0
python games/ddpdoj/tools/oracle/pgm.py check --quick
#   [PASS] enemy stats: hitbox/HP/palette/HP-reload at spawn (W23) -- exit 0   (was [FAIL] exit 1)
#   [PASS] enemy stats RED (swap-tables + corrupt-hp + seed-wrong-stage) -- exit 0
```
(The overall `pgm.py check --quick` VERDICT is still FAILURES due to pre-existing,
W23-unrelated stages -- the asset-integrity TX/BG tile-decode + ROM-shadow checks
and the scroll-program ATTRACT-entry + its RED -- same as the W23 review's note.
Every W23 enemy-stats stage is green; the RED stage still passes.)
