# Wave 25 REVIEW — the volcano finale ($C413 late spawner + type $0A)

status: DONE (verdict: APPROVE)
reviewer (read-only), 2026-08-02

Subject: independent verification of `25-impl-volcano.md` and the committed
src/ changes (commit 9719591 + the two worklog-only follow-ups 0041074 /
75adb2a). The brief's four review criteria, each re-derived from
`rip/prg.asm` and re-measured, not quoted back.

Verdict up front: **APPROVE.** The port is byte-faithful (every routine
re-derived from the ROM below), the verification is honest and RULE-2-clean,
and both gates are green with zero skips. The literal done-when ("field-exact
spawn-for-spawn") was not met, but the brief's *accepted alternative* (reaching
script infeasible -> hook-recording comparison + missing scen dump flagged per
RULE 2) was taken correctly and not silently asserted. Findings are all
MINOR/INFORMATIONAL — no correctness defect in the ported code.

## Baseline re-measured (independent of the worklog's numbers)

```
node --test games/gradius/tests/          -> 461 pass, 0 fail, 0 skipped
node games/gradius/tools/test-all.mjs     -> GREEN, 10 passed, 0 failed, 0 SKIPPED
                                             (self-check: 7 deliberate breaks all RED)
python games/gradius/tools/census.py dispatch
    -> entries ported 20 / 42 ; throwing 22
       distinct targets 34 ; distinct ported 17 ; distinct throwing 17
node games/gradius/tools/w25-eruption-probe.mjs
    -> 768 frames ; gate 192 ; spawns 168 ; handler execs 6,339
python games/gradius/tools/w25-breaks.py  -> 11 RED, 0 GREEN, 0 SKIP (SHA restored)
```

## Criterion 1 — $C413 renamed + 7 arms + stage-1 arm byte-faithful. PASS.

**The rename.** `src/enemies.js` header (lines 67-75) and the `lateSpawner`
block comment correctly retitle $C413 "the LATE SPAWNER". The $3A byte is
still called the "stage-advance latch" — accurate for $3A (its three writers
are $96D7/$97E1/$993D, the stage-advance path), and the misnomer was only in
applying that label to $C413's body. `tools/oracle/throwaudit.lua:76` carries
the corrected hook label ("C413 the LATE SPAWNER ..."). The historical
`throwaudit-endchain.json` still shows the old "stage advance" string — that
is a cartridge recording (not regeneratable without re-running Mesen) and is
correctly left alone. Both call sites (`spawnEngine` $A2C4 and `runEngine`
$A2FB) now call `lateSpawner` instead of throwing.

**The 7 arms, byte-proven.** `jt_$C439` at $C439-$C446 = 7 entries. The
disassembler's "11 entries" header is wrong because $C447-$C44E is POINTER
DATA that `sub_$C44F` reads via `LDA $C447,X`/`LDA $C448,X` (X = 0/2/4/6). I
confirmed the abutment from `rip/prg.asm:8241-8251`: $C447=$C526, $C449=$C58D,
$C44B=$C633, $C44D=$C752 — exactly the four streams the arms feed the stepper
(volcano X=0, stage-2 X=2, stage-4 X=4, stage-6 X=6). 7 not 11.

The port's dispatch reads `rom.word(0xC439 + 2*stageIndex)` and switches on
the target. I verified each case against the table bytes:

| stage | ROM target | port case | scope |
|---|---|---|---|
| 0 | $C486 (`86 C4`) | `st_C486` | ported (volcano) |
| 1 | $C546 (`46 C5`) | throw, names $C546 + producer | throw |
| 2 | $C686 (`86 C6`) | throw, names $C686 + $3A-warp note | throw |
| 3 | $C5AD (`AD C5`) | throw, names $C5AD + producer | throw |
| 4 | $C653 (`53 C6`) | throw | throw |
| 5 | $C6DE (`DE C6`) | throw | throw |
| 6 | $C429 (`29 C4`) | `return` (the bare RTS) | ported (no spawn) |

All seven named; `default` throws with the table bound. The $3A warp gate
inside the body ($C42D) throws loudly to W27. Stage index ↔ stage-1 mapping
is right: `res.stage.stage == 0` for Gradius stage 1 -> $C486 (test
`jt_$C439` confirms).

**st_C486 byte-faithful** (re-derived from `rip/prg.asm:8296-8354`):
- sfx $0F on $69==0 ($C486-C48C); port `if (sp.z69 === 0) soundRequest(0x0F)`.
- `sub_C44F(state, rom, 0x00)` ($C48F-C491).
- `y = (a9>>>1)+a9` = 1.5*a9 ($C494-C49A); xvel=$C4F6+Y ($C49D), yvel=$C4F7+Y
  ($C4A3). Y is held from $C49A through $C4C6 and re-derived only at $C4D2
  (`LDY $AA`) for the crater — port matches both.
- yvel ramp: post-INC $69 < $1E -> -2, < $0A -> -4 more ($C4A9-C4BC); port
  nested `if (cursor < 0x1E) {...; if (cursor < 0x0A) {...}}` exact.
- jitter `($02<<3)&7` always 0 ($C4BF-C4CA); port `u8(state.frame<<3)&0x07`,
  faithfully transcribed and pinned dead (test "jitter term is always 0").
- HP `$04AC,X=1`, crater x `$C4F4[$AA]` ($38/$B8), type `$0A`, y `$90`,
  xvelf/yvelf `$02&$3F`, anim `$58` ($C4CD-C4F3). All present, in order.
- **The loc_C4E4 fall-through** ($C4E4-C4F3, shared with stage 4's $C5FE) is
  the apparent-end-of-routine trap: $C486 has NO rts between $C4DF (y=$90) and
  $C4E4; it falls through into the xvelf/yvelf/anim tail and rts's at $C4F3.
  The port INCLUDES loc_C4E4's body in `st_C486` and returns after — handled.

Data tables verified verbatim: `$C4F4 = 38 B8`; `$C4F6` 16 triples;
`$C526` 32-byte stream.

**sub_C44F byte-faithful** (`rip/prg.asm:8254-8293`): the load-bearing
pre-INC/post-INC split is preserved exactly — the PRE-INC $69 (cursor) indexes
the stream (`(cursor & $3F)>>1`), the POST-INC $69 picks the nibble (`& 1`),
the $FF->$7F reset precedes the INC, and `a9 = nibble<<1`. The stream pointer
is read little-endian from `$C447+X`. Returning `{a9,aa}` instead of modelling
$9A/$9B/$A9/$AA is sound: $A9/$AA are scratch consumed only by the calling arm
(no other reader in the ROM).

**The $83E4 dispatch mechanism** (checked for the RTS-trick trap):
`rip/prg.asm:702-720` — `JSR $83E4` at $C436 pushes return addr $C438 (PC-1);
$83E4 pulls it into `$98:$99`, uses it as table base (so effectively $C439),
reads `jt_C439[stage]`, and `JMP ($98)` to the arm. The arm rts's back up the
call chain. The port's `switch { return st_C486(...) }` is a faithful
behavioural equivalent (run-the-arm-once-then-return).

## Criterion 2 — eruption spawn count measured + endchain comparison. PASS
(via the brief's accepted alternative).

Port side, MEASURED by the probe (I ran it): 768 frames, **192** gate-passes,
**168** spawns, **6,339** handler executions.

Cartridge side, MEASURED from `tools/oracle/out/throwaudit-endchain.json`
(I read it): `$C413` executes **768** times (first@1339); `$B36F` executes
**6,365** times (first@1339); `$3A` is 0 on all 6000 frames; the `$1B` gate is
`{128:2676, 129:1, 130:768, 131:1, 132:512, 133:1101, 134:513, 144:1}` and
`$17` `{0:310, 1:3925, 2:1765}`, `$19` `{0:4235, 1:1765}`, maxScroll 3584
($0E00) — all matching the W24 timeline and the late-systems recon.

- `$C413` 768 == 768: exact.
- `$B36F` 6,339 (port) vs 6,365 (cart) = **0.4%** gap.
- The cartridge's actual SPAWN count is NOT measured by the existing hook (it
  counts $C413 entries, which only bounds spawns <= 192). The port's 168 is the
  measured spawn count; the cartridge's is bounded, not measured. The worklog
  states this and built `w25-spawn-ledger.lua` to close it, but reaching $82
  from a button script is the open item.

The **spawn-for-spawn field comparison** (the literal done-when) is UNMEASURED.
The brief permits, when the reaching script is infeasible, comparison against
the hook recording + the missing scen dump flagged per RULE 2. The worklog does
exactly this: (a) the fresh reaching attempt is documented with its poke and
its failure (`maxScroll=2661, $C413 n=0`); (b) the invuln-poke caveat is
stated (coverage-valid, timing-not); (c) the endchain hook recording is the
accepted fallback; and the missing `scen/endchain.json` per-frame dump is
named as a follow-up. Nothing is silently asserted. **RULE 2 compliant.**

## Criterion 3 — reaching-script disposition honest. PASS.

The worklog's (a)/(b)/(c) is exactly the brief's order, and each is labelled:
(a) the ad-hoc endchain script that DID reach $82 is not in the tree (stated);
the in-tree scripts all stop at $0A64-$0AD0; the fresh powered-poke attempt
(`0044=2,0045=2,0046=5,0041=1`, 10000 frames) reached only `maxScroll=2661`
and is reported with `$C413 n=0, $B36F n=0`. (b) the invuln-poke validity
caveat (knowledge/09) is stated. (c) the hook-recording fallback is the
accepted comparison. No absence claims of the form "the game does not do X".

## Criterion 4 — no regression. PASS.

`node --test` 461/0/0 skip; `test-all.mjs` GREEN / 0 SKIPPED (44 scenarios,
17416/17416 frames); census 20/42 (entry 10 added). No corpus scenario reaches
`$82` (the corpus ceiling is ~6000 frames; `$82` lives at the boss page), so
the late-spawner code is not exercised by the field gate — regression-clean by
construction, exactly as the worklog states. The unit suite + mutation harness
carry the W25 coverage.

## RULE 4 — every check seen RED. PASS.

`w25-breaks.py`: **11/11 RED**, every mutation SHA-256-restored (final SHA ==
baseline `2eb083397a75` both as the harness reports and as I re-read it
externally). The done-when proxy reproduces exactly: applying ONLY the
gate-drop mutation (in a scratch copy, restored from an external backup) and
re-running the probe yields **205 spawns / 7,615 handler execs**, diverging
loudly from both the baseline (168 / 6,339) and the cartridge (6,365). The
mutation genuinely diverges in the direction that proves the port produces the
eruption and not nothing.

The 11 mutations cover: the $02&3 gate, the nibble polarity, the $69 $FF-wrap,
type $0A, y $90, the sfx gate, the crater table base, the stage-0 target, the
handler gravity, the handler init, and the yvel-ramp bound — i.e. every
load-bearing constant and branch in the new code.

## Findings

### F1 — MINOR: "first 10 spawns lose 4" is off-by-one (code correct; comment wrong)

`src/enemies.js:533`, `tests/w25-volcano.test.js:156`, and the worklog (line
69) all say the yvel ramp applies -4 to "the first 10 spawns". It is the first
**9**. The ramp reads the POST-INC $69 (`$C4A9 LDA $69`, taken after sub_C44F's
INC at $C463); spawn N has post-INC = N (until the $FF->$7F wrap, which never
returns to 0). `cursor < 0x0A` is therefore satisfied by post-INC {1..9} = 9
spawns, and spawn #10 (post-INC $0A) already takes the -2 ramp. The CODE is
faithful (`cursor < 0x0A` == `CMP #$0A`), and the test's own data point
`z69=9 -> post-INC 10 -> ramp -2` contradicts the "10" in its own title.

Failure scenario: a future reader trusts the comment and "fixes" the code to
match (e.g. `< 0x0A` -> `<= 0x0A`), introducing a one-spawn divergence.
Mitigation: the test's `z69=9` data point goes RED under exactly that change
(the test computes `want` from the original `< $0A` formula), so the comment
cannot cause a silent regression — but the prose should still read "9".

### F2 — INFORMATIONAL: the probe prints "gate passed: 192" as a hardcoded constant

`w25-eruption-probe.mjs:72` logs `Math.floor(DURATION/4)` unconditionally. It
is a labelled denominator, not a measured count: when I ran the gate-drop
mutant the line still printed "192" while the measured spawn/handler counts
correctly exploded to 205 / 7,615. The numbers that matter (spawns, handler
execs) ARE measured from the simulation; only this one line is a constant.
Mildly misleading under mutation; harmless to the verdict.

### F3 — INFORMATIONAL: the 26-execution gap explanation is inferred, not isolated

The worklog attributes the 6,339-vs-6,365 handler-exec gap solely to the
missing player/shot interaction. The story is self-consistent (no shots -> no
mid-flight frees -> fewer spawns land -> fewer live enemies -> fewer handler
execs), but no run exists that isolates the variable (a port sim WITH vs
WITHOUT shots). Over 768 frames the gate-pass count is phase-independent
(768/4=192 exactly), so the probe's $02 phase starting at 0 vs the
cartridge's 0x5B does not explain it. Plausible and honestly hedged; not
overclaimed as proven.

### F4 — INFORMATIONAL (supervisor acknowledgement): the literal done-when is deferred

The plan's W25 done-when is "field-exact ... spawn-for-spawn". That is NOT
what was demonstrated: the per-spawn trajectory was never field-compared, and
the cartridge's actual spawn count is bounded (<=192) not measured. The
brief's accepted alternative was taken correctly and is RULE-2-flagged, so
this is not a defect — but it is the one place confidence is lower than the
rest of the wave (unit + mutation + handler-exec-count), and the supervisor
should explicitly sign off on substituting "coverage-level + 0.4% handler-exec
agreement" for "spawn-for-spawn field-exact". Flagged for W28 (the verdict
machine) to close once a reaching script or a both-sides poke lands the
`scen/endchain.json` dump.

## Ruled out (checked, no finding)

- **11-entry table misread**: the port reads exactly 7; the disassembler's 11
  is the $C447 pointer-data abutment, byte-proven above.
- **loc_C4E4 fall-through mishandled**: included in st_C486.
- **$83E4 RTS-trick dispatch modelled wrong**: faithful behavioural equivalent.
- **$02 / state.frame mapping**: `state.frame & 0x03`/`&0x3F`/`<<3` only read
  the low byte; consistent with the established $02 mapping and pre-existing.
- **slot scan order**: `allocEnemySlot(state, true)` is the 9..0 BPL scan
  (`x<0` return -1 tests slot 0); test confirms slot 9 fills first.
- **stages 2-7 silent**: all six throw loudly with ROM target + producer.
