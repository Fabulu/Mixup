# Wave 27 REVIEW — the exits (stage-end + warp route)

status: DONE (APPROVE)
review, 2026-08-03   role: READ-ONLY (no src/ edits committed; one reversible RED mutation, restored + SHA-verified)

Scope (from the brief): independently verify the W27 implementer's two exits —
the SEAMLESS stage-end transition (`$9904` -> `$96CF`) and the `$39` warp route
(`$984F` + `$C686` + the double `INC $19`) — are byte-faithful to `rip/prg.asm`,
that the endchain scenario compares GREEN through the transition into stage 2 to
a loud named throw, that the warp is validated under an honest both-sides `$39`
poke, that the RED mutation diverges, and that the regression is clean.

Impl worklog: `27-impl-exits.md`. Recon: `26-recon-boss.md` (the death chain ->
`$1B $86` -> `$9904` handoff; the warp-arm caution), `25b-recon-reaching-script.md`
(the reaching method + `compareUntilThrow`).

**Verdict: APPROVE.** Both done-whens are met and independently reproduced; every
routine is byte-faithful to the listing; the RED mutation diverges exactly as
claimed; the regression is GREEN end to end. Two INFORMATIONAL findings below,
both honestly disclosed in the impl worklog already.

---

## 1. BYTE-FAITHFULNESS — re-derived from `rip/prg.asm` (all PASS)

Each routine was read out of the disassembly and compared line by line against
the committed source. Every non-obvious line carries its ROM address.

### `$9904` (sub-state `$86`, stage-end) — `src/nmi.js:st9904` — MATCH

`rip/prg.asm:2656-2706` decodes exactly as the impl transcribes it:
- `$9906 CMP #$06 / BNE / JMP $9872` and `$990D CMP #$05 / JSR $CDA5` -> the two
  out-of-scope throws (ending chain, stage-6 arm). Impl throws both, named. OK.
- `$9914 LDA $B2 / BNE $991D` — pulse1 OWNER gate. Impl: `if (state.snd[OFF.OWNER] === 0) setBgmCode(state, 0x93)`.
  `$B2` is `$B0 + OFF.OWNER`; `state.snd` is pulse1's struct, so `state.snd[OFF.OWNER]` IS `$B2`. OK.
- `$991D LDA $1C / CMP #$93 / BNE / JSR $994A` — the despawn sweep, gated on the
  current BGM code. Impl calls the already-ported `sub994A`. OK.
- `$992A CMP $98FD,Y / BCC $9947` — `stage.endPage[$19]`. Table at `rip/prg.asm:2653`
  is `.byte $0E $0E $0E $0E $0D $0C $0D`; stage 1 (`$19=0`) -> `$0E`. Impl uses
  `res.stage.endPage`. OK.
- `$9935 LDA #$90 / LDX $39 / BEQ $9945` — the fork. `$39==0` -> `$1B:=$90`
  (seamless); else `INC $19 / INC $3A / $3F:=0 / $1B:=$8E` (warp). Impl faithful,
  including the order (INC $19, INC $3A, $3F:=0, $1B:=$8E). OK.
- `$9947 JMP $9A5E` — `mode5Body`. No fall-through into the `$994A` body (it is a
  `JSR` at `$9923`; `$9904` ends `JMP $9A5E`). FALL-THROUGH TRAP cleared.

### `$96CF` (the `$1B&$10` next-stage arm) — `src/nmi.js:nextStage` — MATCH

`rip/prg.asm:2302-2320`:
- `$96CF LDX $1B` is DEAD — overwritten by `$96DB LDX #$20` before any X use (the
  four stores in between touch `$19/$39/$3A/$3F`, not X). The impl omits it. OK.
- `INC $19`, `STA $39/$3A/$3F = 0`, the `$50-$70` wipe (`LDX #$20 / STA $50,X /
  DEX / BPL` = 33 bytes `$50`-`$70` inclusive), `$55:=1`, `JSR $9BF0`, `JSR $9C3C`,
  `JMP $9A5E`. Impl order is identical.

**The `$50-$70` wipe is complete.** `clearStageAdvanceZp` clears every modelled
field in the range (`$54/$55/$57/$58/$5B/$5C/$5D/$5E/$5F/$60/$61/$62/$64-$67/$68/
$69/$6A-$6F`); the unmodelled addresses (`$50-$53/$56/$59/$5A/$63/$70`) were
confirmed to have NO ported field (grep over `src/`). `z68` (`$68`) is in both
this wipe and `clearZeroPage`. No modelled byte missed.

**SEAMLESS confirmed.** `nextStage` calls `sub9BF0` + `startPlay` (`$60:=1,
$1B:=$80`) + `mode5Body`. There is NO call to `fullScreenLoad` (`$882C`, the
2304-write screen reload): the ROM path is `$96E6 JSR $9BF0 / $96E9 JSR $9C3C /
$96EC JMP $9A5E` — no `$882C`. `startPlay` (`flow.js:558`) is two stores. The
transition is genuinely seamless; play continues into stage 2 the same frame.

`sub9BF0`'s `INC $1B` (transient `$90 -> $91`) is overwritten by `startPlay`'s
`$1B := $80` before the frame snapshot; `$91` is not in `MODELLED_1B` and is
never observed at a frame boundary. OK.

### `$984F` (the warp route, sub-states `$8E/$8F`) — `src/nmi.js:st984F` — MATCH

`rip/prg.asm:2551-2570`: `$2D:=1`, `LDX #$3E / LDA #$04 / JSR $8402` (4 px/frame),
`LDA $3F / CMP #$11 / BCC $986F`, `LDA $1B / AND #$70 / BNE $986F`, then
`LDA #$50 / JSR $8455` (+$5000) and `$1B:=$90`. Impl: `chrSel:=1`,
`addCamera16(state, 4)`, then `if (cam.hi >= 0x11 && !(substate & 0x70))` does
`addScore(state, 0x00, 0x50, 0x00)` and `$1B:=$90`. Order matches (scroll BEFORE
the threshold check on both sides). 

`addScore(state, 0x00, 0x50, 0x00)` verified against `$8455`'s signature
(`score.js`): `lo,mid,hi` -> `$99,$9A,$9B`; `$8455` stores A into `$9A` (mid),
so A=`$50` -> `$9A:=$50` = +$5000 (mid BCD byte). Same shape as the boss death's
`addScore(state, 0x00, 0x10, 0x00)` (`$B97A`), already green. OK.

`addCamera16` (`camera.js`) = `$8402` (`rip/prg.asm:723-732`): `CLC / ADC $00,X /
STA $00,X / BCC / INC $01,X` with X=`$3E` -> adds to `$3E:$3F` (lo:hi), one carry.
Impl: `lo = cam.lo + a; cam.lo = u8(lo); if (lo > 0xFF) cam.hi++`. Exact.

### `$C686` (the warp rain) — `src/enemies.js:st_C686` — MATCH

`rip/prg.asm:8498-8535` decoded line by line. Two subtleties both correct:
- **Count gate polarity.** `$C68F BCS $C692` (branch if `$68 >= $C684[Y]`); the
  fall-through `RTS` is the `$68 < threshold` case. Impl: `if (z68 < rom.read(0xC684+gate)) return`. OK.
- **The `$69` increment order.** ROM loads A=`$69` (old), THEN `INC $69`, THEN
  `AND #$0F` the OLD value. Impl computes `y = z69 & 0x0F` (old) BEFORE
  `z69 = u8(z69+1)`. Order correct.

Tables verified from the ROM bytes: `$C684[1]=$0A` (threshold), `$C6CA[1]=$00`
(anim), `$C6CC[1]=$A6` (type), `$C6CE[0..15]` (16 Y positions). `$C684` lives at
the tail of the `.byte` at `$C67A`; `$C6CA/$C6CC/$C6CE` are the one run at
`rip/prg.asm:8536-8537`. All read at the right offsets.

### The `$0460` alias trap — CORRECT (and consistent with the green boss)

`$C6AC STA $0460,X` uses the RAW enemy index (`X=$A8=0..9`) -> ROM `$0460[0..9]`,
while the rain's other fields (`$032C/$012C/$030C/$010C/$036C,X`) use the same
`X` but land in ROM-array slots `12..21` (because those arrays' enemies begin at
`$030C`, i.e. slot 12 — the origin of `ENEMY_BASE=$0C`). The impl mirrors this
exactly: `o.s0460[sp.zA8]` (raw) for `$0460,X`; `o.<field>[sp.zA8 + ENEMY_BASE]`
for the rest. This is the SAME resolution the already-green boss uses:
`bossSet(state, 0x0460 + x, ...)` maps `$0460+X -> s0460[X]` (raw) while
`$030C+X -> type[X+12]` (`BOSS_OBJ_RANGES` in `enemies.js`). So the rain and the
boss agree, and the both-sides poke (0 divergent) confirms it. The recon's
`$030B`-style warning was rightly heeded.

### `$B61E` / `$B628` (the rain handler + animator) — MATCH

`rip/prg.asm:6108-6141`. `$B61E`: `LDY #$00 / JSR $B628 / LDA #$FE / JMP $B103`.
`$B103` = `JSR $B164 / JMP $B251` (`rip/prg.asm:5272-5274`). Impl: `sub_B628(...,0)`,
`addAX(state, j, 0xFE)`, `offScreenCheck(state)`. `addAX`=`$B164` (CLC/ADC
`$036C,X`/STA, verified), `offScreenCheck`=`$B251` (the `[$04,$F3]`x`[$08,$C3]`
keep-box, verified) — both pre-existing shared helpers, green across the corpus.

`sub_B628` frame wrap verified: ROM does `(oldFrame+1)`, compares to count, wraps
to 0 if `>= count`; impl matches. Tables `$B650[0]=$06`, `$B651[0]=$8E`,
`$B652[0]=$08` (threshold/base/count) confirmed at `rip/prg.asm:6142` -> 8 frames
at metasprites `$8E..$95`, step 6. Dispatch entry 38 -> `$B61E`
(`rip/prg.asm:4835`, type `$A6`: `($A6&$7F)<<1 = 76 = word 38`). Wired.

FALL-THROUGH: all three of `$9904`/`$96CF`/`$984F` end `JMP $9A5E`; no accidental
drop into the next routine. `$B61E` ends `JMP $B103`. Cleared.

---

## 2. DONE-WHEN 1 — the seamless transition (endchain): MET

Re-ran `compare.mjs --only endchain` myself:

```
PASS  endchain   5366 frames  all TIER 1 fields exact  threw A2F0@f11527
```

- **GREEN through the transition.** 5366 of 5366 frames compared, 800 TIER-1
  fields, **0 divergent**, 0 display-list mismatches (132753 live slot-frames).
- **`$19` flips on the cartridge's frame.** `$19` (address `$0019`) IS in the
  watch list, so the port's `$19` is compared against the cartridge's every
  frame. 0 divergent over f11525 (`$9904` frame: `$1B $86->$90`, `$19=0`) and
  f11526 (`$96CF` frame: `$19 0->1`, `$1B->$80`) proves the flip lands on the same
  frame both sides. (Impl's `$1B` timeline `$86->$90@f11525->$80@f11526` is
  internally consistent with the throw at f11527.)
- **Loud named throw at the first stage-2 content.** `THREW at A2F0: frame 11527`
  — `$A2F0 runEngine: $19 = $1 (stage 2)`. This is the frame AFTER the `$96CF`
  frame: `$96CF` sets `$60:=1`, `mode5Body`->`spawnEngine` does `INC $60`->2 +
  `loadChunk(stage 2 chunk 0)` at f11526; f11527 `spawnEngine` hits `runEngine`
  with `$19=1` and the stage-2 guard fires. The boundary moved from `$9904@f11013`
  (W26) to `$A2F0@f11527` (W27), as claimed.
- The throw is genuinely the first stage-2 WAVE record: 0 divergent before it, and
  the run reaches it with `expectDying 0` satisfied (0 deaths through the boss
  kill and transition).

`spawnEngine`/`runEngine`/`loadChunk` now index the wave tables on the LIVE `$19`
(`state.zp19`, matching `$A2D1 LDA $19`) rather than `res.stage.stage`, so the
transition frame's wave cursor is the cartridge's. The stage-2 guard is a loud
named throw, not a quiet return. OK.

## 3. DONE-WHEN 2 — the `$39` warp route: MET (honest both-sides poke)

Re-ran `compare.mjs --only warp`:

```
PASS  warp   5839 frames  all TIER 1 fields exact
```

- **GREEN, 5839 of 5839 frames, 0 divergent**, AND the screen is compared this
  time (no truncation): `45/47`-style VIDEO block PASS — 0 nametable, 0 palette,
  0 hardware-OAM bytes differ over 490 rewritable nametable bytes. The CHR-bank
  switch (`$2D:=1`) and the type-`$A6` rain sprites are pixel/byte-exact.
- **Honest, labelled both-sides poke.** The endchain is a TIMEOUT kill, so `$39`
  stays 0 and the warp arm (`$B978`) never fires naturally. The `warp` scenario
  pokes `0039=1@11013-11999` on BOTH sides (`porttrace.mjs POKEABLE` += `$39`;
  `scen.py` applies the same poke to the cartridge dump). This is the explicitly
  sanctioned fallback (`20-plan` §3 / `knowledge/09`), and the impl worklog labels
  it: "validates the warp CODE, not the route's reachability." The poke is benign:
  `$39`'s only reader is `$9904`'s fork; the fork fires at f11525 (when `cam.hi`
  reaches `$0E`) on both sides identically, and `$96CF` does not run within the
  dump, so the held `$39=1` never gets cleared+re-poked into a contradiction.
- The warp CODE (`$984F` scroll + CHR switch, `$C686` rain cadence/position,
  `$B61E` animator + 2px drift) is field-exact. See F1 for the one arm not
  field-exercised.

---

## 4. RED MUTATION (RULE 4) — SEEN TO FAIL, restored, SHA-verified

Reversible mutation of `INC $19` in `nextStage` (`+1 -> +0`), run, restored.

- **Baseline recorded:** `nmi.js` git blob `e20d2dc03cda038ea7cb536e3f918e43bb617f8c`,
  sha256 `1359588e...f283`, working tree clean.
- **Mutated -> RED.** `compare.mjs --only endchain`:
  `[FAIL] TIER 1: 800 fields, 190 divergent`; `w_0019` first diverges at **f11526**
  (the `$96CF` frame where `INC $19` should fire); `[FAIL] THREW at A2F0: did NOT
  throw over 5839 compared frames` — `$19` stays 0, the stage-2 guard never fires,
  the port replays stage-1 wave data for "stage 2". The headline **190 divergent
  TIER-1** matches the impl worklog exactly.
- **Restored -> byte-exact.** Reversed the edit; git blob and sha256 both match
  baseline; `git diff HEAD` empty; porcelain clean. SHA-verified both ways.

(The worklog's §4 cites the RED first divergence at "f11528"; the measured
first-divergence frame is f11526 for `$19` itself — f11528 is the display-list
fields. The 190-divergent headline is exact; the frame citation is loose by the
`$19`-vs-display-list distinction. No code impact. Not filed separately.)

---

## 5. REGRESSION — clean

- `node --test games/gradius/tests/`: **475 tests, 0 fail, 0 skipped** (468 + 7
  new `w27-exits.test.js`). The 7 new tests pin `$9904` seamless+warp forks,
  `$96CF` swap (incl. `$5F` cleared by the `$50-$70` wipe), `$984F` scroll +
  +$5000 + `$11` threshold, `$C686` rain (type/anim/position/count gate/`$0E`
  stop), and `$B61E` animator. Each names its RED mutation.
- `test-all.mjs`: **GREEN — 10 passed, 0 failed, 0 SKIPPED** (inputs, unit,
  assets==cart, tablecoverage, snddata, framecost, shape, rendergate, compare,
  self-check). The self-check's 7 deliberate breaks all RED.
- Corpus: **47 scenarios, 29184 frames, 0 failures**. The corpus grew 46 -> 47
  (the new `warp`); all 46 pre-existing scenarios remain GREEN and unaffected.
  The `[STILL BROKEN] knownFail $8871` is the pre-existing fullScreenLoad
  screen-load gap (mode 0-4), NOT the seamless transition (which deliberately
  does not call fullScreenLoad) — unrelated to W27.
- The 6 `SKIPPED` fields in compare.mjs (pad2/oamBudget/spriteOverflow/scanline/
  cpuCycle/splitSpins) are the standing environmental emulator-internal fields
  with no port counterpart; they are not the "skip is not a pass" concern (the
  unit-test `# skipped 0` is the meaningful zero).

---

## FINDINGS

### F1 — INFORMATIONAL: the warp's TAIL (`$984F` cam.hi >= `$11`) is unit-validated, not field-validated

`$984F`'s second arm — at `cam.hi >= $11`: `LDA #$50 / JSR $8455` (+$5000) and
`$1B := $90` (-> `$96CF`, whose `INC $19` is the SECOND increment, skipping
stage 2 into stage 3) — is byte-faithful and pinned by `w27-exits.test.js:89-111`
(the test pushes `cam.hi` to `$11` and asserts `score[5] += $50` and `$1B := $90`).
But NO scenario field-validates it: the `warp` both-sides poke dump ends at
f12000 with `cam.hi` only ~`$07` of the `$11` the 4 px/frame scroll needs, so the
dump never reaches the score add or the stage-3 handoff. The impl worklog
discloses this ("the warp does not complete inside the dump"). The done-when 2
(both-sides poke) is met regardless — it does not require the warp to complete —
so this is a coverage note, not a defect. If the owner wants the +$5000
field-validated, extend the `warp` dump past the ~`$0A` more pages of 4 px/frame
scroll (roughly f14000+); the stage-3 entry itself would then throw at the first
stage-3 wave record (out of scope, one stage loaded), which is the expected
boundary, not a regression.

### F2 — INFORMATIONAL: the corpus is now 47, not 46

The brief's "46-scenario corpus" is now 47 (`warp` added). All 46 pre-existing
scenarios are GREEN and unaffected; `warp` is GREEN. Stated only so the next
reader of the brief is not surprised by the count. No action.

---

## MUST-FIX

None. The wave is an APPROVE. F1 is an optional coverage extension (extend the
warp dump if the +$5000 tail is wanted field-exact); F2 is a count note.
