# Wave 20 — The completeness plan: finish stage 1

status: DONE (plan; supersedes all prior per-wave "next steps" lists for Gradius)
architect, 2026-08-02

Inputs: the five wave-20 recon worklogs (`20-recon-enemy-census.md`,
`20-recon-wave-script.md`, `20-recon-unported-census.md`,
`20-recon-sweep-harness.md`, `20-recon-late-systems.md`), all read in full, and
`docs/knowledge/09-enumerate-then-validate.md`, which this plan exists to obey.

The owner's goal is exact: **finish stage 1, boss included, with the crashes
gone because every path is ported — not because no test happens to reach
them.** Everything below is scoped and ordered against that goal.

---

## 1. The completeness ledger

This is the document the owner asked for and did not have. Every set is
enumerated **from the ROM** (`assets/prg.bin`, byte-verified against the
cartridge); "ported" is read out of `games/gradius/src/` by tooling, not
asserted by hand. Counting conventions are stated where two recons differed.

### 1a. Global (whole game)

| set | total | ported | remains | source |
|---|---|---|---|---|
| `$AE1C` enemy dispatch entries | **42** | **19** (W22: was 13) | 23 throw | census.py; table is $AE1C-$AE6F, proven by $AE70 being the shared RTS |
| distinct handler routines behind them | **34** | **16** (W22: was 10) | 18 | census.py / handlerflow.py |
| spawner sites (`JSR $A527`) in the whole PRG | **9** | **3** (W22 added `$AFD9`, the hatch's child spawner) | 6 | grep over rip/prg.asm — complete because every spawn allocates through $A527 |
| enemy types with any producer in the ROM | **38** | **19** (W22: was 13) | 19 | all 34 absolute stores into $0300-$031F enumerated; $00/$03/$1B/$1F have no found writer |
| wave records, all 7 stages (distinct ROM addresses) | **598** | **454** spawn a ported handler (W22: was 370) | 144 | wavecensus.py / wavedump.py — the two tools decode byte-identically; 718 record *reads*, 682 *live*, 598 *distinct*. This ledger uses distinct. **W22 also fixed wavecensus.py's `PORTED_TARGETS`, which said "read from the source" and was a hand-kept literal frozen at wave 12** — it is parsed out of `src/enemies.js` now, the way census.py always did it |
| 5-byte inline records (cmd >= $F0) | **73** | 0 | 73 — the whole route ($A37A/$A466/$A46F/$A4A6) is unported and changes the record STRIDE | wavecensus.py |
| table A single-spawn descriptors ($A662) | **121** exact | data, exported | 119 referenced; $32/$52 never | bounded by $A7D0 abutting |
| table B formation descriptors ($A602) | **24** exact | data, exported | all 24 referenced | bounded by $A662 abutting |
| formation geometry ($A592) | **21** (corrects 00-recon's 20 — the missing entry is index **19**, `F4 2A`; 00-recon-enemies.md fixed in W21) | data | max index used 20, no overrun | census.py; pinned by tests/tables.test.js |
| spawn patterns ($A5BC) | **22** | data | max used 21, exactly full | census.py |
| play sub-states, jt `$982F` (index = $1B low nibble) | **16** | **7** (W24: was 1; `$80` body+exit, `$81`, `$82`, `$83`, `$84`+despawn, `$85`) | 9 — `$86`/W27, `$87`-`$8D` (0 hits), `$8E`/`$8F`/W27 warp | late-systems; layout-proven |
| `$96A5` $1B ladder arms | **5** | **3** (W24: was 2; intro, dying, + `$96FB` game-over) | 2: next-stage $96CF/W27, + the `$96FB` continue (`$970D`/mode 4) & timeout-restart (`$9751`/mode 0) sub-paths | late-systems |
| game modes (`$80D4`) | **7** | 1 (mode 5) | 6 — and the miss is SILENT: src/nmi.js has no else | sweep: 76/76 non-mode-5 windows diverge |
| inline `JSR $83E4` jump tables | **7** | 3 fully | $80D4, $982F, $AE1C, $C439 partial/none | structure.txt + byte proof |
| `$C439` late-spawner dispatch | **7** (structure.txt's 11 is wrong; $C447 is the next table, byte-proven) | 0 | 7 — incl. stage 1's volcano $C486 | enemy-census + late-systems agree |
| ROM tables the 42 handlers index | **66 distinct PRG bases** (measured by tablecoverage.py, supersedes the census's 45 rows) | **64 exported** as of W21 — enemies/tables.json is 34 blocks / 3,060 bytes | **2**: $CF2D/$CF2E, the ending chain, excluded by §5 and named in tablecoverage.py KNOWN_GAPS | W21: tools/tablecoverage.py |
| metasprite records | **157**, $A2 included | — | 0 | W21: the high table is $8E9E-$8EE5, ids $80-$A3, proven by $8EE0 holding $8EE6 ($A1's record sits in what would be slots $A4-$A8). Neither 162 nor 170: 170 counts every slot in $00-$FF with a non-zero count, 157 counts every slot in $00-$A3 with one. The `n > 16` guard dropped 9 ids and wrongly KEPT 5 more |
| sound records | **63** | 63 | 0 | prior waves |
| terrain stages | **7** | 7 exported | RLE control codes $07-$0A live in tools/, not src/ | unported-census |
| `$1A` loop counter | 1 increment site ($9889), 8 read sites | 3 reads ported | structurally pinned at 0 in the port; loop 2+ difficulty cannot exist | zpuse.py |
| port's own throw gates | 69 sites, 57 with ROM addresses (134 distinct) | — | the other 12 are assertions | throwinventory.py |
| mode-5 reachable instruction addresses (proxy) | **5,708** | 3,231 mentioned in src/ (56.6%) | upper bound on implementation, not correctness; only 17.4% of the PRG is mode-5 reachable at all | callcensus.py |
| zero-mention mode-5 basic blocks | 98 | 94 triaged/cleared | **3-4 genuine silent gaps**: $8BD9/$8C06 terrain-object sprite pass, $8BC3, $8A9E | silentgaps.py + hand triage |

### 1b. Stage 1 specifically (the owner goal)

| set | total | ported | remains |
|---|---|---|---|
| wave records before the boss page (chunks 0-5) | **92** | **92** — `wavecensus.py` prints `stage 0: 92 distinct, 92 ported, 0 unported, 100.0%` (W22) | **0** (post-boss chunk-6 replay would add 10 more; unresolved, see §5) |
| enemy types the script names | **12** | **12** (W22 added $07, $0F, $10, $13) | 0 |
| dispatch entries needed, **transitive closure** incl. handler-spawns-handler | **16** | **16** (W22) | 0 — $B6E1, $B747, $AF2E, $AF88 and their children $B311 (type $09) / $B3CB (type $0C) all landed; the children appear in NO wave list, only via $AF98 |
| play sub-states a clear traverses ($80 $81 $82 $83 $84 $85 $86) | **7** | **6** (W24: was 1; `$80`-`$85` ported, `$86`/W27 throws) | 1 |
| late-spawner arms live in stage 1 | **1** ($C486 volcano, only producer of type $0A in the ROM) | 0 | 1, plus its payload handler entry 10 ($B36F) |
| boss objects | head $B914 + body $B913 (3 slots) | 0 | both, plus 4 rank tables $B8EF/$B8F8/$B901/$B90A |
| stage exit | seamless $9904 → $96CF, plus the **$39 warp route** that skips stage 2 ($984F + $C686, double INC $19) | 0 | all of it — the warp route is earned by ordinary stage-1 play and nothing in the port knows it exists |

**The fraction the owner asked for:** by scroll distance the port stopped at
$0427 of $0D00 — it ran **~32% of stage 1**, exactly, and then refused. By
frames of a full clear, ~2,490 of ~9,350. By flow states, 1 of 16. The boss,
the volcano finale, the transition and the warp route are at 0. The green gate
(42 scenarios, 378 tests) was true and described the first third of one stage.

> **W22 MOVED THE FIRST NUMBER AND ONLY THE FIRST.** The `deep-powered`
> scenario compares 3,099 consecutive frames from game frame 2300 to 5399 with
> **zero divergent fields**, which is camera `$03E1` to roughly `$0620` — every
> wave record of chunks 2, 3 and 4, and the last enemy handler stage 1's script
> names. By scroll distance the enemy engine now runs to the boss page. What has
> NOT moved: play sub-states are still 1 of 16, the boss is still 0, the volcano
> is still 0, both exits are still 0, and the longest window recorded here still
> ends 3,950 frames short of a clear. W24-W27 own all of that.

---

## Wave-by-wave completion log

**W22 — DONE** (`22-impl-six-routines.md`). Entries 7, 19, 15, 16, 9, 12 plus
`$AF98` (the child spawner), `$C05F-$C08D` (the ARMOURED damage accumulator,
which was a throw and without which a hatch is invulnerable) and `$A19E` (the
missile crawl). Ledger above updated; 13/42 → 19/42 entries, 10/34 → 16/34
routines, stage 0's wave script 74/92 → 92/92. Note that the plan split this
across W22 and W23 and the brief merged them; **W23 is therefore also done**
except for its `$39` measurement, which landed as a unit test rather than a
four-hatch-kill run (nothing in the corpus can kill four hatches yet — the
shield poke that makes the run survivable also makes it never take damage).

**W24 — DONE** (`24-impl-substate-machine.md`). The play sub-state machine
jt_$982F as a real 16-entry dispatch: `$80`'s `$9A56` exit, the timer states
`$9A0E`/`$99E9`/`$99C0`, the boss-page scroll `$9982` (+ despawn sweep `$994A`),
`$997E` (`INC $5B` only; the fall-through is dead), and the game-over arm
`$96FB` (`$B0`-gated hold + `$4C` timeout), plus the `$97F1` game-over entry.
Ledger above updated: jt_$982F 1 → 7 of 16; `$96A5` ladder 2 → 3 of 5; stage-1
traverse 1 → 6 of 7 (`$86`/W27 remains). 445 unit tests (0 skipped),
test-all.mjs GREEN (regression clean), census unchanged at 19/42 (W24 ports the
state machine, not the `$AE1C` enemy dispatch). 17/18 mutations seen RED. The
endchain `scen/` field dump (the in-situ `$1B`-timeline done-when) was NOT
recorded -- the boss-killing script is not a named scenario and the boss handler
is W26; documented per rule 2 in the worklog.

---

## 2. Where the port actually stops (the sweep map)

From `20-recon-sweep-harness.md` — three full-stage cartridge runs, 143 seeds
each, port started at every seed, graded on 1,022 RAM addresses per frame plus
end-of-window nametable/palette/OAM/collision:

- **$002B → $0427: CLEAN.** 34 consecutive windows, byte-exact.
- **$0427/$0440: the first wall.** Chunk 2's first record, cmd $03 → type $07 →
  $B6E1, frame 2490. Predicted from the ROM to the exact frame before any run.
- **$0440 → $0B6B: throw country.** Five addresses account for every stop:
  $B747 (46 powered windows — the biggest wall, not $B6E1), $B6E1 (25-34),
  $AF2E (7-18), $B311 (3-7), $A19E (missile crawl, 9).
- **$0B6B → $0BE3: CLEAN again.** The boss approach runs exactly.
- **$0BE3 → end: refused wholesale.** $9A56 (boss-page transition), then 42
  consecutive windows at $982A ($1B = $82/$84/$85) — **~29% of a full
  playthrough is behind one unported jump table.**
- **The boss is reachable** by a fixed RUA hold from frame 5000, zero deaths —
  the standing assumption that it was out of reach was false.
- **The crucial positive:** inside mode 5 the port NEVER diverges — 0 fields
  over 20,642 graded frames across all runs. It is exact or it stops. The one
  silent drift is outside mode 5 (title/attract after game over): wrong in all
  76 windows because nmi.js's mode dispatch has no else.

So the crashes the owner hit are these five enemy-handler throws plus the
$982A/$9A56 wall, in that order, and nothing else.

---

## 3. The waves

Each sized for one implementer. Ordered by what the owner hits first and by
what unblocks what. Every done-when is a measurement, not a review.

**W21 — Exports and loudness (risk: low; unblocks everything).** — **PARTLY
DONE**, see `21-impl-tables-and-metasprite.md`. The 25 data runs covering all
49 census addresses, the `$A2` fix, the `$A592` correction and the
cross-reference gate landed. The THREE LOUDNESS FIXES (nmi.js's mode dispatch
`else throw`, the `$8BD9`/`$8C06` terrain-object pass, camera.js:26's comment)
and worklog 12's wrong "power-up dependent" claim did **not** — they are
`src/` edits and were left for the wave that owns those files, so the
unpowered sweep's 76 silent windows are still silent.
Export the 28+ enumerated missing ROM ranges into assets/enemies/tables.json
(full list in 20-recon-enemy-census.md §tables), plus $9A3D/$9A45/$9A35/$98FD,
$C439/$C447/$C4F4/$C4F6/$C526, $B8EF/$B8F8/$B901/$B90A. Delete
export_metasprites.py's invented `n > 16` guard so $A2 (18 records) exports;
reconcile the 162-vs-170 metasprite denominator while in there. Add the three
loudness fixes: an `else throw` on nmi.js's mode dispatch (modes 0-4,6 with
their $80D4 targets), a throw for the $8BD9/$8C06 terrain-object pass, and fix
camera.js:26's false "stage 1 never uses it" comment. Correct worklog 12's
wrong "power-up dependent" claim about $B311/$AF2E/$AF88. *Done when:* a unit
test pins every table count from the ledger (42/121/24/21/22/9/6/7/4/16);
metasprites.json contains $A2; the unpowered sweep's 76 silent windows become
loud throws.

**W22 — The terrain walkers $B6E1 (entry 7) + $B747 (entry 19)** (risk:
medium). One routine written twice with the Y sign flipped, plus the shared
tail $B65C/$B676/$B690/$B6B8/$B723; they index $B6D2/$B6D9/$B6DD and call the
already-ported terrain probe $C3D3. This is the first wall AND the biggest.
Beware: 33 cross-handler interior links exist in this region — port shared
bodies, not one-function-per-entry, and note $B098 ends in a BCS/BCC pair, not
a fall-through. *Done when:* sweep.mjs powered first-non-CLEAN moves from
$0427 past $04D0 and no $B6E1/$B747 throw appears in any of the three runs'
verdicts; all 20 stage-1 records of types $07/$13 field-exact.

**W23 — The hatches and their children** (risk: medium). $AF2E (15) + $AF88
(16) + the parameterised spawner $AF98/$AFD7 as a first-class spawn site +
children $B311 (9) and $B3CB (12). MUST land as pairs: the hatch writes the
child's type the frame after spawning, so a hatch without its child moves the
throw one frame. Includes the $5F kill counter and the $39-set logic with its
$07E5 score-parity gate (gate is inferred — measure it here at two parities).
Also take $A19E (missile crawl) — 9 sweep windows, small. *Done when:* powered
sweep CLEAN contiguously $002B → $0B6B; child spawn histogram matches the
cartridge ($09:30, $0C:12 on the 16k reference run); $39 measured reaching 1
on a four-hatch-kill run on BOTH sides.

**W24 — The play sub-state machine** (risk: medium; parallel-safe with
W22/W23, different files). Port jt_$982F as a real 16-entry dispatch with
per-arm throws; implement the timer states $9A0E/$99E9/$99C0, the boss-page
transition $9A56, $9982/$997E with the despawn sweep $994A (keep the $3E >=
$D0 guard and the immediate $5E=$3F; do NOT implement the $997E fall-through —
measured firing 0 times in 1101 opportunities), and the game-over arm $96FB
(the highest-traffic unported arm, 794 executions in ordinary play). *Done
when:* the endchain scenario reproduces the measured $1B timeline to the frame
($81, 768-frame $82 countdown = $9A35[rank]x256, $83, 512-frame $84 at the
measured 0.5 px/frame, $85 entry); game over field-exact.

**W25 — The volcano finale** (risk: medium; needs W24's $82 arm). Port $C413
as what it is — the per-stage LATE SPAWNER, not "stage advance"; rename it
everywhere. Stage-1 arm $C486 + pattern stepper $C44F + handler entry 10
($B36F → $B0B4) for type $0A, which has zero wave-script records anywhere and
$C486 as its only producer. *Done when:* the $82 countdown's eruption is
field-exact against the endchain run (~192 spawns, 6,365 handler executions).

**W26 — The boss** (risk: high; needs W24 + W25). $B914 head + $B913 inert
body, the three-slot layout ($030B,X = $99), rank tables, the damage ladder
$B8EF, and the death chain: score, INC $3B,X, explosion script 4 (metasprite
$A2 goes live here — W21's export is a prerequisite), INC $1B. *Done when:*
the full 1,280-frame fight is field-exact on the endchain run and boss death
advances $1B $85 → $86 on the same frame as the cartridge.

**W27 — The exit, both of them** (risk: high; needs W26). $9904 + $96CF as a
SEAMLESS transition — no screen reload; measured: one execution, play
continues immediately in stage 2 — plus the $39 warp route: $984F's 4px/frame
forced scroll, $C686's type-$A6 rain, and the double INC $19 that skips stage
2. *Done when:* a full clear runs start → stage-2 entry with zero throws and
$19 flips on the cartridge's frame; the warp route validated either by a real
four-hatch-kill clear or, failing that, under an identical $39 poke on both
sides (labelled as such per knowledge/09).

**W28 — The verdict machine becomes a ledger** (risk: low; start anytime,
finish last). Wire wavecensus/stagewaves into test-all as a coverage report
that FAILS if any stage's first-unported scroll moves backward; add the
sweep-derived scenarios (pre-boss band seed ~6160, post-respawn seed ~4540, a
>= 9,400-frame full clear); dynamically validate the last 6 of stage 1's 92
records the 16k run didn't reach; settle the chunk-6 post-boss question with
an $A2D1+$61 hook on a run past the boss (moves the denominator 92 vs 102);
pick ONE record-counting convention (this ledger's: distinct addresses) and
document it. *Done when:* CI prints "stage N: X/Y records, first unported at
$ZZZZ" and stage 1 prints 92/92 (or 102/102).

After W27 the owner-visible state is: stage 1 plays start to finish, boss and
volcano included, dying and game over included, and the two ways out of the
stage both work. W28 makes it stay true.

---

## 4. An honest accounting: why this was not known

The owner asked "how can this even happen" and the answer is arithmetic, not
bad luck.

- **The inventory was never taken.** $AE1C is 84 bytes. It was readable in
  full on day one; instead, 15 waves discovered its entries one crash at a
  time — enemy bullets when the owner saw one, $A3B1 when a run scrolled past
  $0380, fifteen more when throwaudit ran — each a thing the ROM had listed
  all along. The five recons enumerated in days what the method had been
  sampling for weeks, using nothing that didn't exist in wave 1.
- **The corpus ceiling was arithmetically guaranteed, and nobody did the
  arithmetic.** A stage-1 clear needs ~9,350 frames ($9A3D[0]=$0C at 0.5
  px/frame plus the measured sub-state durations). No scenario exceeded
  6,000. So every zero ever measured for $9A0E..$9904 — 15 of 16 play
  sub-states — was forced by the frame budget and read as absence. The $0A64
  "ceiling" that three waves treated as a fact about the game was a fact
  about scenario length.
- **Tools were built and not aimed.** SEED-ANYWHERE (wave 10) could sweep the
  stage; it was used for two scenarios. The sweep recon ran it at 143 seeds
  and produced the complete stop map in one pass.
- **Corpus facts were promoted to cartridge claims.** "$B311 only on power-up
  runs" (wave 12) was false — it is a hatch child in plain wave data. "$984F
  is never used by stage 1" was false — it's the warp route. This is the
  fifth and sixth instance of that exact sentence shape.

What changes in practice, and is enforced rather than aspirational:

1. **No work unit starts without its denominator.** Every wave above cites a
   set with a total read from the ROM. A finding without a denominator is
   returned to sender.
2. **The ledger is in CI** (W28): the first-unported scroll per stage is a
   tracked number that cannot silently regress, and "how finished" is printed
   as fractions every run.
3. **Provenance labels on every number.** "9,000 frames, shield poked" is a
   different claim from "9,000 frames"; the recons already comply.
4. **"Not used" must cite the ROM guard, not corpus absence.** Any claim of
   the form "the game never does X" is rewritten as "unreachable because
   <instruction>" or as "not observed; here is what was tried".
5. **Scenario budgets are derived, not habitual:** stage length / scroll rate
   plus sub-state durations, from the ROM, before recording.

To be fair to the record: the discipline that DID hold is why this is
recoverable. Inside mode 5 the port has never once diverged — 0 fields over
20,642 graded frames. Everything it does is exact; it just does a third of the
stage. The failure was coverage accounting, not correctness.

---

## 5. Deliberately excluded, with reasons

- **Stages 2-7 enemy handlers and both inline-record spawners** ($C906, $CA5E,
  $A46F/$A4A6, $B480, $AF10, $B37F, the $0600 page). Not on the stage-1
  critical path (exception: $C413's dispatcher lands in W25 because stage 1's
  volcano needs it; the other six arms stay stubs with throws). Missing
  measurement: stages 2-7's wave decode is read-from-ROM only — zero dynamic
  validation, including all 73 five-byte records.
- **Game modes 0-3, 6** (boot/title/attract/high-score). Scoped out by
  00-plan.md; W21 makes their absence loud instead of silently wrong. Missing
  measurement: none needed until scope changes.
- **The $1A loop system and the ending chain** ($9889, $988C/$98DD/$98E5,
  $BB0F, $CE94, the flat $CF3B script). Beyond stage 1; note $1A=0 is exact
  for loop 1, so nothing stage-1 is wrong because of it. Missing measurement:
  no loop-2 run has ever existed; 5 of $1A's 8 read sites are in the
  enemy-bullet engine and have never executed.
- **Entry 27 ($B4F2)** — no producer found anywhere in the ROM. Port never.
  Missing measurement: the no-producer claim rests on the absolute-store scan;
  an indirect-pointer write would evade it (documented in the recon).
- **The chunk-6 post-boss question** (92 vs 102 stage-1 records) — not
  excluded but deferred to W28; the static argument is strong, the run that
  settles it needs a beaten boss, which needs W26.
- **Pixel-level rendering checks beyond rendergate** — the sweep grades RAM +
  nametable/palette/OAM/collision, not rendered frames. Accepted for this
  plan; the boss fight in W26 should get one rendergate pass as a spot check.

## 6. Risks

- **The fall-through trap, squared.** 33 cross-handler interior links in the
  enemy region; TEN prior incidents project-wide. W22/W23/W26 must port shared
  bodies. Two known traps are pre-charted: $B098's BCS/BCC pair (not a
  fall-through) and $997E (fall-through is real in the listing, dead in fact —
  implementing it respawns the boss every 256 frames).
- **Rank coverage.** Every deep measurement so far pinned rank $17 at 1 (held
  shield). The $82 countdown, boss damage ladder and fire intervals are
  rank-indexed; W24/W26's done-whens are exact only at the measured rank rows.
  Other rows ship read-from-ROM until a higher-rank run is recorded.
- **The boss's call closure** ($B0B4, $ADAB, $9A8C, $CB26, $839F, $A527,
  $8455) was named but not fully enumerated by the recons; W26 may uncover a
  sub-table. Mitigation: the throw discipline plus W21's exports make any miss
  loud and cheap.
- **The warp route may resist honest reproduction** (four kills, one life,
  score-parity gate). Fallback is a both-sides poke, labelled per
  knowledge/09 — validates the code, not the route's reachability.
- **Two record-counting conventions exist in the tree** (wavecensus vs
  wavedump). The records agree byte-for-byte; only counts differ. Until W28
  picks one, any quoted denominator must name its tool.
- **Concurrent workflows share .git.** The ddpdoj workflow holds staged
  deletions in the shared index; this plan and the recons commit through a
  private index only. Tool overlap (stagewaves vs wavecensus vs wavedump) is
  acknowledged duplication — reconcile in W28, do not delete on sight.
