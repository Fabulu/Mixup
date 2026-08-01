# PLAN — the whole level, then the patterns

status: **ACTIVE** — successor to `games/ddpdoj/PLAN-no-recordings.md`. That
plan's goal, definition of done, and CAPTURE LEDGER are carried forward here,
updated; its wave definitions from W13 onward are **VOID** — the five wave-20
recons re-cut the units and this document reassigns the numbers. Anyone citing
a W-number from W13 up cites THIS file. W11 and W12 remain as shipped.
written: 2026-08-01, by the wave-20 architect, from the five wave-20 recons
(`docs/worklog/ddpdoj/20-recon-{scroll-engine,pattern-tables,aiming,enemy-census,level-data}.md`),
the wave-12 review, and two owner directives.
target: `ddpdojblk`, **VERSION-B** (2002.10.07 BLACK VER), addresses
`$23xxxx–$29xxxx` unless a line says otherwise (`NOTES-build-split.md`).

The owner's order for this round, verbatim: *"We need to play the whole level.
Let us do that first, get the whole scrolling level working, then get started
on the enemies and their shots."* And the method that binds every wave below:
**enumerate statically, then validate dynamically** (`docs/knowledge/09`) —
the ROM is the source of the INVENTORY, the oracle is the source of the
VERDICT, and a Cave bullet pattern is parameterised by the player position, so
comparison against any one run proves nothing about the generator. The five
recons did the enumeration; this plan schedules the ports against known
denominators. A second owner directive landed mid-recon and is binding:
**scoring, combo and chain must be frame-exact, possibly sub-frame**
(`20-OWNER-scoring-must-be-exact.md`) — it inserts one wave (W19) earlier than
the old plan had it and raises the verification bar on everything in Phase B.

Definition of done, unchanged: `assets/capture.bin` is deleted and the page
still shows the game. Milestone of THIS plan, per the owner's order: **the
whole of stage 1 scrolls live — 7,317 logic frames, 8,486 px — with the
capture supplying no background layer**, then the enemies and their shots on
top of it.

---

## 1. THE CAPTURE LEDGER, UPDATED — and the straight answer

**How much of stage 1 do we have?** Stage 1 is **7,317 logic frames (122.0 s)
and 8,486 px of scroll** from stage start to the boss lock — 836 distance-clock
ticks, 265 column writes, 57 scroll-script records, 22 object-stream entries,
13 background elements, 2 sound cues, 339 spawn records across 21 enemy types,
a midboss, a boss (20-recon-scroll-engine, validated at 0 divergent frames over
4,012 measured logic frames; 20-recon-enemy-census). The 161-frame capture
covers **160 px = 1.89 % of the distance, 2.20 % of the frames, and contains
NOT ONE scroll-program event** — it was taken from the quietest stretch of the
stage, constant 1.0 px/frame, between script records. What is real today: the
display-list transform (W11), the ship, its pods, aura, glow and three shadows,
produced and gated at 0 divergent frames (W12). What is missing: 97.8 % of the
stage's frames, all 57 scroll events, all 1,820 background tiles beyond the 415
the capture happens to show, all 339 spawns, every enemy, every bullet, every
death, and the score. The recording is not a small version of the level; it is
a still photograph of it.

| # | the capture currently supplies | replaced by | status |
|---|---|---|---|
| L1 | the CONTENTS of the thirty sprite buckets (transform ported by W11; 2 of 30 buckets have producers) | W13–W30 producers | converted by W11 |
| L2 | ~~ship record + banking~~ | W12 | **REPLACED** (12-review F3: the page's claim overstates — words 4–7 of eight records still come from capture; fix wording in W13) |
| L3 | ~~pods + exhaust + shadows~~ | W12 | **REPLACED** (same F3 caveat) |
| L4 | player shots (not in capture at all — computed and INVISIBLE) | W20, unblocked by W13 | open |
| L5 | video registers: bg x/y, tx scroll, ctrl, bg_scale, rowscroll array (all-zero, proven: 8 writers in 6 MB, zero gameplay) | W14 | open |
| L6 | BG tilemap ring + its motion program — now fully decoded: 57 records stage 1, 186 whole game, 7-opcode VM | W16 (data W15) | open |
| L7 | BG tile pixels + palette: bundle holds 415 harvested tiles, stage 1 references **1,820**; export = **666 KB gz, measured** | W15 | open |
| L8 | TX tilemap: HUD, score digits, text | W19 | open |
| L9 | score/chain VALUES — now an owner REQUIREMENT (frame-exact, order-within-frame is semantics) | W19 ledger + W28 | open, promoted |
| L10 | enemies: existence, position, motion, facing, AIM — denominator corrected: **126 live types, 111 real handlers, 115 init bodies at init+8**; stage 1 needs 21 types / 19 handlers; aim = pure fn, transcription validated 6,139/6,139 | W21–W25, W29–W30 | open |
| L11 | enemy bullets — pool corrected to **$817F8C, 210×$40** ($8171BE is the impact pool); 39 kinds, 2 emitters, 20 generator entries, 911 fire sites | W26–W27, W31 | open |
| L12 | explosions, death effects, items ($8171BE/80-slot pool now correctly identified as impact/effects) | W28 + | open |
| L13 | laser, bomb flash, hyper (never in the capture) | post-W28 (old W24/W25 scope) | open |
| L14 | palette during gameplay (fades) — still needs the writer census | W19 rider | open |
| L15 | the 161-frame LOOP BOUND | background half: W16+W17 (stage scrolls 7,317 frames); foreground half: W29–W30 | open |
| L16 | ship never hit: death, lives, continue | W28 + flow waves | open |
| L17 | ~~zoom table~~ | W11 | REPLACED |
| L18 | ~~bucket identity~~ | W11 | REPLACED |

Corrections to prior documents, so nobody inherits stale text: 10-recon-enemies'
aim counts are **2× too high** (the tap fired twice per `move.l` on the 16-bit
bus; real rate 1.70 aims/lf); its "$817F8E is the player-shot list" is wrong
(player shots are `$810572`, 36 entries, `$253A70`); `$27F99E` is a 20-entry
dispatch, not 32; types `$20-$23` are scripted carriers, not the boss (the
stage-1 boss is type `$0E`, handler `$292902`); the `$30`-vs-`$3E` stride
puzzle is resolved (stride `$40`, `$817F8C`). The wave-10 plan's constraint 4
called `$813098` "loop"; 20-recon-pattern-tables and -enemy-census call it
"rank". **This plan calls it `$813098` and nothing else** until W31 measures it
— the disagreement changes no code (the port translates `tst.w $813098` as
written) but it decides which scenario validates the fans (§7, §8).

## 2. PHASE A — THE WHOLE SCROLLING LEVEL (W13–W18)

One implementer per wave; every wave writes `NN-impl-<slug>.md`; every
done-when is 0 divergent frames on named columns plus at least one red
mutation; every ported write joins `WATCH_SPEC`/`CLAIMED` in the same commit.

**W13 — PREREQUISITE: the $24C476 fall-through, plus the review's inverted
branch.** The option handler `$24C390` FALLS THROUGH into `$24C476` — ~30
instructions: `btst #4,($41,A6)`, writes to `($1,A6)` bits 3/4, the fire
handshake, and the PLAYER cadence bytes `($34,A4)/($35,A4)`, one arm ending in
`bra $24D480`. The port silently returns (12-review F2 — the eleventh
fall-through incident). W20 (shots) reads those cadence bytes; nothing
shot-shaped can be gated until they are written. Same wave: fix 12-review F1
(`$24A460`'s `bmi` is inverted in `drawShipAlt` AND its test locks the
inversion in), F3 (the page/ledger overstatement), F4/F5 (stale mutation
declarations; `pgm.py check` never runs shipgate), F7 (backwards comment).
*Done when:* `shipgate`/`flyaround` still 0 divergent; a firing-window scenario
compares `($34,A4)/($35,A4)` and the `($1,A6)` bits against the board at 0
divergent — the bytes must be seen NON-ZERO in-window, stated on the scenario;
F1's corrected test seeds both live states; `pgm.py check` runs shipgate.

**W14 — the camera and the scroll spine.** Port object type 1 (`$26114C` init,
`$26127A`/`$2612A0` per-frame), the four camera routines
(`$240B0E/$240B94/$240C22/$240CC0`, the `&~$3F`/`&$3F` fractional split, upload
inside the IRQ6 gate), the ring writer `$240D76` with the per-stage tile base,
the 15-column pre-fill `$2611FC`, the ENTRY CLOCK `($6,A5)` with `$26200E`'s
fast-forward (replay of clocks 0..N−1, the A3/A4 pointer save/restore that
undoes the replayed rewind, the `$81319E/$8131B6` clear), the `$8130D2` gate
(now IDENTIFIED: "every player is dead", writers `$25FD82/$25FD8C` from the
alive-counter `$25FD94`), ctrl/bg_scale/tx-scroll once, rowscroll digest
column (job: prove it stays zero — 8 writers in 6 MB, none gameplay). The
distance clock `$8130CE` is the SCROLL ODOMETER (`$26132C`, +1 per `$200` of
scroll, pause-gated) — never a frame counter; W16's red mutation depends on
this being right here. NOTE: once `$8130CE` is real, `player.js`'s bomb gate
(`>= 4`, mislabelled "bomb stock" — census finding) becomes accidentally
correct; fix the comment, and locating actual bomb stock moves to W28.
*Done when:* `scrollgate.py`'s four columns (`$8130CE`, `$81318A`, `$81318C`,
`$80B012`) compare at 0 divergent over the existing 4,012 measured frames,
three scenarios, two entry clocks — **the gate exists before the code**;
mutations `commit-the-fraction`, `upload-outside-gate`, `skip-entry-fastforward`
red. *Removes:* L5.

**W15 — the stage-1 background asset, with the measured budget.** Export the
248-column stream (`$225B78`, 8,928 B — ALL 248 columns; the 24-column tail is
unreachable by the script as decoded but the boss-lock exit is unresolved, do
not trim), the `$800` palette block (`$227E58`), tile base `$0AA90000`, the
1,820 BG tiles `$0AA9..$11C6` through the proven 5 bpp decoder. Structural
asserts: every stage's stream ≡ 0 mod 36, every palette exactly `$800`
(`w20level.py` already checks). Ship as a per-stage lazy shard (§5).
*Done when:* fresh extraction passes the integrity checker (raw-file-offset
re-read, two-sides rule); the measured shard size is in the worklog and within
15 % of the recon's 666 KB gz; the renderer draws a column it has never seen in
the capture, verified against a board framebuffer dump at one scroll position
past px 160. *Removes:* L7.

**W16 — the scroll VM.** Port `$262062` with ops `$08` SPEED / `$0C` FREEZE /
`$04` REPEAT and the `$261F76` unfreeze partner, translated AS WRITTEN: record
= time + SKIPPED word + op (the second word is padding — `addq.w #2,A1` at
`$262082` is unconditional); countdown armed at len+1 then reloaded at len (the
loop word is the PASS COUNT; both misreadings are a 4- or 112-frame error at
the first repeat); loop word `$FFFF` = forever; the clock is written BACKWARDS
on repeat completion and the interpreter matches on EXACT equality. Ops
`$00/$10/$14/$18` stay LOUD NAMED THROWS carrying ROM address + record time.
These three ops are 57 % of the whole cartridge's scroll program (94+6+6 of
186 records) and 100 % of what makes stage 1 move, brake, and stop for the
boss. *Done when:* the four columns compare at 0 divergent over ≥3,000 lf
including the measured freeze/repeat window (clock parked `$0034`,
lf1700–1899, resuming `$0038`) and the attract entry at clock `$0038`; red:
`clock-per-frame` (diverges at the first repeat), `loop-word-as-iterations`,
`cond-word-honoured`. *Removes:* L6 and the background half of L15 — the stage
scrolls 7,317 frames and 8,486 px instead of looping 161.

**W17 — the whole-stage corpus, and the boss-lock exit hunt.** Measurement
wave, cheap, and it is what lets W14–W16 claim the STAGE rather than its first
fifth: every TSV on disk dies or resets by clock `$00D0` — the 0-divergent
claims cover frames 1..1,668 of 7,317 (22.8 %). Produce the invulnerable
≥9,500-lf stage-1 scenario (interventions labelled), re-run `scrollgate.py`
over all 7,317 frames including both cues, the nine later background elements,
and the boss lock at `$0344`. Then the hunt: the stage-1 script's last records
loop columns 210..223 FOREVER and nothing inside the VM can end it — write-tap
`$813180/$813182/$813184` (external speed override) and `$81317E` (external
freeze) across a boss kill and name the exit mechanism, or BLOCK with the tap
output. Also tap `$80B03C` (read by `$24179E` to scroll-compensate every
background element; NO writer found) and `$8130DA` (gates every BG-element
updater; unidentified). *Done when:* 0 divergent over the full stage, or the
divergence named; each of the four taps yields a writer or a BLOCKED entry.
*Removes:* nothing directly; converts every Phase A claim from "the opening"
to "the stage".

**W18 — the background elements.** Op `$10` + the 13 stage-1 handlers
(`$26224A` — stage 1 uses each exactly once), the 8-slot driver `$26233A` /
spawner `$262366`, the `$813176` cross-axis subtraction, the `$24179E` scroll
compensation via `$80B03C` (writer named by W17 or this wave blocks), the
`$8130DA` kill gate. Op `$00` SPAWN's 22 object-stream entries feed `$24150A`
— entry 7 is `$246BB8`, a build-B CODE address among 21 `$22xxxx` data
pointers: disassemble `$24150A` far enough to classify it before porting the
stream, and flag, never smooth. Op `$14` CUE stays a named no-op that LOGS its
two events (frames 6,374 and 6,606 — sound is excluded, §7, but the timing is
free evidence). *Done when:* a W17-corpus window containing the first three
elements compares element-slot columns and their bucket's staged bytes at 0
divergent; red: delete one handler's constructor field. *Removes:* the
background-element sprites from L1's bucket half.

**MILESTONE after W18: the whole stage-1 background — camera, tilemap, tiles,
palette, motion program, scenery objects — is produced. `capture.bin` supplies
no background layer. The page scrolls for 122 seconds over live data with the
W12 ship on top.** The capture still supplies: nothing for the background; the
loop bound dies with it (the page runs to the boss lock and holds, honestly
labelled, until W30 gives the boss).

## 3. PHASE B — ENEMIES AND THEIR SHOTS (W19–W31), BUILT ON ENUMERATION

The recons replaced "trace what fires" with closed inventories, and the
leverage is now a number, not a hope:

- **One aim routine lights up 260 call sites.** `$24203E`/`$2422A2` are pure
  functions of two deltas; the transcription already exists and matched the
  board on 6,139 live calls with ZERO mismatches. 149 + 111 static call sites
  consume it; the corpus reached 16 of them (6 %) — which is exactly why
  porting call-site-by-call-site from observation could never finish.
- **Two prototype loaders light up 124 of 126 enemy types.** `$2637A2`/
  `$26377A` + 208 resolved (loader, table) pairs give every enemy its hitbox,
  HP, speed, heading, palette, animation and draw bucket as DATA. Port two
  routines, export the tables, and per-type stats stop being work.
- **Two bullet emitters + three 39-entry tables + 20 generator entries stand
  behind 911 fire call sites.** The fan vocabulary of the whole game is ~200
  instructions plus data. A pattern is a CALL — entry point (fan shape) +
  D0 (kind|speed bias) + D1 (angle) + D2 (position) + extras — not a data
  record; larger fans are dbra loops with immediates at the site.
- **Six handlers buy 79 % of stage-1 spawns** (267 of 339 records); 21 init
  bodies at init+8 buy all of stage 1's initialisation (the +8 rule is
  absolute: 256 of 256 table inits are 8-byte stubs).
- The contrast, measured: 9,500 frames of running reached 9 of 39 bullet
  kinds, 26 type/kind pairs, and a fire-site attribution that was WRONG at
  measured rate 1-in-91. The corpus is a verdict machine, not a census.

**W19 — the score/chain/rank ledger (static), and TX.** The owner's
requirement makes this early: enumerate from the ROM every site that adds
score, touches the chain counter/timer (`$8128F4/F6/FE`, `$812900`, `$812914`),
or moves rank (`$81309E` computed by `$2608D2`; operator `$80380C`; the
`$81B414..$81B41A` power ladder that scales collision-list lengths; the two
global bullet-speed biases `$813160/$812950` whose writers are UNLOCATED — the
port would hardcode 0 and be wrong wherever the game sets them). A COMPLETE
list with a denominator, plus the `$81B4C0` contributor tap and the palette
writer census (L14 rider). Port the TX block printer `$240CF0/$240D2C` and its
11 call sites so digits have somewhere to live. ORDER WITHIN A FRAME is
semantics here (owner note §2): record, for each ledger site, where in the
frame it runs relative to the chain-timer decrement. *Done when:* the ledger
is committed with counts; TX digest compares at 0 divergent over `fly-around`;
every unlocated writer is a named blocker, not a silence. *Removes:* L8; L14
gets its census; L9 gets its denominator.

**W20 — shots you can see.** Old W13 scope, now unblocked by W13's cadence
bytes: the four reached shot handlers (`$253B1E $253E34 $253BDA $253EC6`),
bucket-14 enqueue, `$81295C` as a compared column, the shot-table-full
feedback. The player shot list is `$810572`, 36 entries (census correction —
not `$817F8E`). *Done when:* `stage1-shot` (≥1,800 lf firing, no connects
in-window, restriction written on the scenario) compares bucket-14 staged
bytes, emitted entries, `$81295C` and the full player block at 0 divergent.
*Removes:* L4.

**W21 — the spawn side.** Stage table `$263336`, walker `$2633BE`, the 8-byte
record, dispatch **including the init+8 second entry point**, the sub-record
allocator, the deferred queue `$815EAA` (LIFO, `$C80` cap — the only door for
the 47 script-less types; 33+ of stage 1's spawns arrive through it), the
odometer already real from W14. *Done when:* cursor/clock/live-count columns
and a spawn counter compare at 0 divergent to the script terminator over the
W17 corpus; red: `clock-per-frame` again (it must stay red here too).

**W22 — the aim, the velocity field, the slew, the selector.** Port aim64
`$24203E` VERBATIM from the validated transcription (`recon20/aimmodel.py`) —
including `atan2(dY, 1.5·dX)`: the axis scale and the `$200920` table carry a
MATCHING 1.5 and cancel; a textbook atan2 plus a textbook table is
self-consistent and wrong, so both port in the same wave. Ship the three aim
tables as bytes (the LUT deviates from real atan by +1.65 units at index 10 —
NOT formula-reconstructible), the `$1800` bias (load-bearing: unsigned
borrows), aim256, the `$200920` field as ROM data (134,144 B raw, 72,482 gz),
the triangle fold + 4-quadrant mirror, `$24270A` target select WITH the
alive-fallback (48 % of measured aims are P2-nominal rescued onto P1), the
one-step slew `$242190` (84 sites — without it every turret snaps), and the
per-site muzzle offsets (11 of 16 reached sites bias by −$700..+$2700; two
alternate ±$500 as left/right turrets — omitting them cost the model 5,051 of
6,139 rows). *Done when:* unit tests reproduce the 6,139-row corpus at 0
mismatches through the PORT's own code; the debugger-backed exhaustive
evaluator (breakpoint `$24203E`, set D0–D3, read D1 at `$2420AC`) covers the
294 internal states the corpus never reached, or that evaluator's absence is a
named blocker; one later-stage/boss run exercises aim256 beyond its current 12
measured executions. *Leverage: 260 sites, one wave.*

**W23 — enemy stats become data.** The two loaders + the 208 exported pairs +
the 21 stage-1 init BODIES at init+8. *Done when:* every stage-1 type's
hitbox/HP/speed/heading/palette/bucket words match the board's records at
spawn, compared over the W17 corpus at 0 divergent; red: swap two types'
tables. *Leverage: 124 of 126 types, two routines.*

**W24 — the movement interpreter.** `$2638A6`, the 13 opcodes (12 escapes +
`>= $C0` set-speed; 8 of 12 escapes are UNREAD — read them first, and one is a
loop-back, so a partial interpreter runs off the end of a stream), the
velocity cache invalidation, `$241812` direction+speed → `$200920`. FIRST dump
the byte-code streams: each record's 12-bit index through aux `$23170C` into
resource `#$1F` — the streams are NOT yet dumped and W24 cannot be tested
without them. *Done when:* the streams are dumped and inventoried (count,
sizes); interpreter passes listing-derived unit tests; one scripted mover's
position track compares at 0 divergent over its whole life.

**W25 — the six handlers = 79 % of the stage.** `$2688CC` ($11, 104 records),
`$26A2E2` ($07/$27, 64), `$2747C6` ($82, 33), `$269CEA` ($05, 28), `$27687E`
($8B, 25), `$268232` ($10, 16) — using flow.py's TRUE spans (105 of 111
handlers extend past their first terminator, up to 76×; nine start BEFORE
their table address via a shared prologue). Do ONE handler, gate it, then the
other five. *Done when:* a W17-corpus window compares enemy-record columns and
buckets 0/7 staged bytes at 0 divergent; red: delete one handler's update.

**W26 — bullet core + math.** The pool `$817F8C` (210 × `$40`, allocator in
the game's search order — slot order is observable in bomb-cancel and draw
order), the `$81B414..$81B41A` active-window ladder (70/110/160/190/210 —
measured moving 70→160 within stage 1), the 20-byte template table
`$281956[39]`, the 9 spawn-inits, the silent full-pool drop, `$284190` with
the fold table and quadrant negation, the per-frame velocity RECOMPUTE at
`$281EFA` (velocity is never stored), and the 1.5:1 ellipse (a circular model
aims off-axis bullets wrong by up to 33 %). *Done when:* a spawn-for-spawn
comparison over the W17 corpus matches slot index, kind, speed, direction at 0
divergent; red: `window-ladder-constant`, `velocity-stored-not-recomputed`.

**W27 — generators, kinds, and the 91 stage-1 fire sites.** The 20 entry
points as one table-driven function (bank A scales angle ×4, bank B does not —
confusing the units puts every bullet at 4× its angle), the `$813098` gate
TRANSLATED AS WRITTEN (every zero path emits ONE bullet — correct for
everything ever measured), the 39 behaviour initialisers + continuations at
rec+$22 (in-flight type rewrites produce the ~20 kinds no fire site can
reach; kind 28 tracks the player via `$242748`; kind 18 spawns an ENEMY), and
the 91 stage-1 fire sites AS DATA (entry, kind, speed bias, angle source,
muzzle table, count, step) audited against `firemap.py` — with the 1-in-91
back-decode failure mode named and each site verified against the listing,
not the heuristic. *Done when:* the W17 corpus compares the full bullet pool
state (kind/speed/direction/position per slot) at 0 divergent through the
midboss; every unreached kind and every `$813098≠0` arm is present in code
and marked UNVALIDATED, loudly, in the worklog table. *Leverage: 911 sites
stand behind ~200 instructions + three tables.*

**W28 — hit, death, damage, bomb, and the score's sources.** The bullet-vs-
player test (the hitbox fields in the `$40`-byte record are UNFOUND — locate
by tapping the `$245Axx` writers the recon named, and settle `$2459D0`'s A4
identity with the one `$80FA7E` write tap), `$286096` damage, the bomb cancel
loops `$244074/$2440B6` ($46/bullet scoring — the first W19-ledger entries go
live), `$803910` (gates re-aim in five damage handlers — one write tap names
it), death/respawn enough for a no-invulnerability scenario. *Done when:* a
no-invuln scenario reproduces the board's death frame exactly — the
intervention that labels every number in this plan is retired in at least one
scenario; score pending words compare at 0 divergent in a connects window.

**W29 — the rest of stage 1's regulars + the midboss.** The remaining 12
stage-1 types (aliases collapse them; census table), the midboss `$26B6FA`
(437 insns, fires through the shared library). *Done when:* the W17 corpus
compares all enemy columns + sprite digest at 0 divergent to the boss lock.

**W30 — the boss.** READ-FIRST: the boss script format is the largest unread
block in the subsystem — `$259554`'s five installed tables, brain `$294AD8`,
stepper `$25962E`, parts list, HP at `$81B626/$81B62A`. Decode, THEN port type
`$0E`. The boss's patterns do NOT come from the shared library (its call
closure contains no `$281xxx` wrapper). This wave also closes W17's boss-lock
exit into the port: the background resumes (or doesn't) per the measured
mechanism. *Done when:* a full-stage scenario runs through the boss kill and
the stage END, 0 divergent on enemy + background columns; L15 closes for
stage 1.

**W31 — `$813098` and the fans.** Hunt how `$813098` rises (candidates: the
debug warp writers, `$259DC6`, loop entry; the naming dispute in §1 dissolves
here). Then the ranked/looped validation: force `$813098` non-zero by poking
BOTH SIDES at the sample point (`docs/knowledge/08` discipline — a poked run
proves the GENERATOR, not the journey) and compare every multi-shot arm
spawn-for-spawn. Also exercise the `$813092`-branching speed biases and hunt
the `$813160/$812950` writers. *Done when:* every generator arm has either a
0-divergent poked comparison or a named BLOCKED entry; no arm ships silently
unvalidated. Until W31, the port's fans exist in code, are correct at
`$813098=0` by measurement, and are LABELLED unvalidated above it.

## 4. WHAT THE GENERATOR METHOD CHANGES, AS NUMBERS

Old shape: ~150 fire sites traced one at a time, each validated against a
player path that never recurs — unfinishable, and provably lossy (20 of 39
bullet kinds are unreachable from ANY fire site; only in-flight rewrites
produce them; no trace can enumerate those). New shape: **5 routines + 6
tables (2 emitters, 20 entries, 39+39+39 kind tables, 1 velocity field)
stand behind 911 fire call sites and all 39 kinds; 2 loaders + 208 table
pairs stand behind 124 of 126 enemy types; 1 aim pair + 5 tables stands
behind 260 sites; 1 seven-opcode VM stands behind all 186 scroll records of
all ten scripts.** The per-stage marginal cost after stage 1 collapses to:
export the stage's data (already priced, §5), port its handful of bespoke
handlers, decode its boss. That is why Phase B is thirteen waves and not
thirty.

## 5. THE ASSET / SHARDING DECISION — real figures, measured this session

From `20-recon-level-data.md` (the recon agent left tools and no findings;
the architect ran the tools — `w20level.py budget`, zlib-9, over the pinned
image): stage-1 background complete = **661,802 B tiles + 3,764 map + 903
palette ≈ 666 KB gzipped** against a current whole-bundle weight of ~418 KB.
All five stages: **2,864,447 B ≈ 2.86 MB gz**, and the pairwise tile-set
intersection matrix is ZERO in every off-diagonal cell — **no stage shares a
single tile with any other**, so per-stage shards have no common chunk and
sum-of-parts equals the union to within 373 B. Supporting data: velocity
field 134,144 B raw → 72,482 gz (core bundle — both enemy motion and bullets
need it); scripts, maps, palettes, aim tables all < 15 KB gz combined.

**Decision:** the core bundle carries code, the ship/sprite atlas, the
velocity field and all control tables; each stage's background ships as one
lazy-loaded shard `bg-stage<N>.bin.gz` fetched at stage entry (stage 0 =
666 KB, worst stage = 864 KB, total 2.86 MB across five). First paint pays
core + stage-0 ≈ 1.1 MB — acceptable for a web page, and the number is
measured, not promised. Export ALL 248 stage-0 columns including the
24-column unreachable tail (864 B — the boss-lock exit is unresolved and the
saving is noise). Sprites remain harvest-only and grow with the corpus; they
are NOT in these figures and remain the one asset class without a static
denominator. 5 bpp is real (74 % of pixels use indices ≥ 16) — no cheaper
repack exists.

## 6. CROSS-CUTTING CONSTRAINTS — binding on every wave

1. **Counted, not timed.** The work budget is counted in every driver and
   sub-driver (enemy walk, shot walk, bullet walk, bucket drain) in the ROM's
   order — three independent reasons now: slowdown mechanism (C), replay
   determinism, and the owner's chain-timer requirement (a timed budget makes
   a chain die on a slow machine).
2. **Replay determinism.** No host clock, no `Math.random()` in logic; input
   sampled once per logic frame at the board's sample point; state derives
   from (initial state, input words) only. The replay is the ONLY test that
   can prove the scoring requirement (owner note §"verification bar").
3. **MAME is authoritative for WHAT, never WHEN.** Slowdown figures stay
   "MAME-timed, uncalibrated".
4. **Rank, loop, stage, power are globals the corpus holds constant unless
   forced.** `$81309E`, `$80380C`, `$813098`, `$813092/94/96`,
   `$81B414..$81B41A` are compared columns; every coverage claim names the
   values exercised; forcing means poking BOTH sides at the sample point. The
   standing fact: `$813098` and `$813094` have read 0 on EVERY measured frame
   this project has ever taken; anything gated on them is listing-only until
   W31.
5. **Enumerate statically, validate dynamically** (`docs/knowledge/09`).
   Every wave states its denominator from the ROM before porting ("6 of 111
   handlers", "3 of 7 opcodes") and its coverage as a fraction of it after.
   MEASUREMENT PROVES PRESENCE; ONLY THE LISTING PROVES ABSENCE.
6. **Translate as written.** The named quirks now include: the skipped
   record word, len+1-then-len, the backwards clock write, exact-equality
   time match, init+8, the 1.5 axis scale and its cancelling table, the
   `$1800` bias, bank A's ×4 angle scale, the window ladders, the
   fall-through rule (READ PAST the end of every routine — eleven incidents).
7. **Order within a frame is semantics** (owner scoring note). Ledger sites,
   hit-vs-timer, drain order: enumerate the order, never assume a frame is
   atomic.
8. **Interventions are labelled.** Invulnerability + auto-shot underlie every
   long scenario until W28 retires them in at least one; every number derived
   under a poke says so.
9. **Nothing ROM-derived is committed**; private-index commits only (the
   shared index has carried staged deletions all round); every run prints the
   machine pin and the build (`NOTES-build-split.md`).

## 7. DELIBERATELY EXCLUDED — with the missing measurement named

1. **Sound.** Still not on the ledger. NEW since wave 10: the stage script's
   op-`$14` cue stream is decoded (2 stage-1 cues, `$28BBAC` commands, frames
   6,374/6,606) — the hook exists; the Z80 program is still undisassembled.
   Missing: any keyon→event table.
2. **Multi-shot patterns above `$813098=0` as a VALIDATED claim.** Ported in
   W27, validated only in W31. Missing: any frame anywhere with
   `$813098 ≠ 0`.
3. **Stages 2–5 dynamically.** All static: 906 columns, 2,237 spawn records,
   145 scroll records, counts per stage. Missing: any run with
   `$813096 ≠ 0`. Rowscroll and bg_scale — quiet on all 13,600 measured
   frames — are exactly what may wake there; bg_scale is additionally an
   ORACLE gap (MAME does not implement it).
4. **The 256-direction aim at strength.** 12 executions at 2 sites is not
   validation. Missing: one later-stage/boss aim256 corpus (W22 carries it).
5. **Loop 2, the bees, TYPE-B ship, live P2, protection cross-check,
   slowdown magnitude, instruction-level timing** — unchanged from the old
   plan §5, still excluded, still named there.
6. **The boss-lock exit until W17 measures it**; the 24-column tail rides on
   it. Missing: the `$813180/$81317E` writer tap across a boss kill.
7. **Bullet-vs-player hitbox fields** until W28's taps. Missing: `$80FA7E`
   write tap; the `$245Axx` writer identification.
8. **`$813160/$812950` (global speed biases), `$803910`, `$8130DA`,
   `$80B03C` writers** — each is one tap, each is assigned to a wave (W31,
   W28, W17, W17), none may be guessed over.

## 8. RISKS, AND HOW BIG THIS IS

The honest size: **Phase A is 6 waves (W13–W18) to the owner's milestone — the
whole stage scrolling live with no background from the recording.** Its risk
is LOW: the scroll model is already validated at 0 divergent frames over 4,012
measured logic frames on the gate that will judge the port, the asset budget
is measured, and the only unknowns (boss-lock exit, `$80B03C`, `$8130DA`) are
single taps with waves assigned. **Phase B is 13 waves (W19–W31) to stage-1
combat complete**, and its three real risks are: (1) **no `$813098≠0`
measurement exists anywhere**, so the fan arms are unvalidatable until W31
finds the writer or the poke discipline is accepted — this is the single
largest gap in the plan and more running at current settings cannot close it;
(2) **the boss script format is unread** — W30 is a read-first wave and its
cost is unknown until the read; (3) **the corpus stops at 22.8 % of the
stage** until W17, so every 0-divergent claim before it is about the opening.
Secondary: the score/chain/rank requirement raises the bar on W28 to
replay-grade exactness, and the two unlocated global biases would silently
skew every bullet if the game ever writes them. Against the old plan's 40–55
wave whole-cartridge estimate, nothing here changed the total — this round
re-cut the stage-1 half into fewer, better-bounded units (19 waves vs the old
~20 with far less unknown inside them). The per-stage marginal cost after
stage 1 is now mostly data export plus bespoke handlers plus a boss decode,
which is what makes the back half plausible.

---

## 9. TO THE OWNER — three decisions and a first move

**1. Bundle weight.** Stage 1's background is 666 KB gzipped, measured, on
top of a 418 KB bundle; all five stages total 2.86 MB, shardable per stage
with zero overlap (also measured — no stage shares a tile with any other). I
plan per-stage lazy shards and a ~1.1 MB first paint. If you want a smaller
first paint there is no cheaper honest repack (5 bpp is real data); the only
lever is loading the shard after the page is interactive. Say if 1.1 MB is
acceptable and I will stop thinking about it.

**2. The fans.** Every multi-bullet spread in this game is gated on `$813098`,
which has read 0 on every frame ever measured — at that value every generator
provably emits ONE bullet, so the spreads exist only in the listing. I will
port them as written, but VALIDATING them needs a run with `$813098` forced
non-zero by poking both the board and the port (the same discipline we used
for rank in Gradius). Decide: accept poked-scenario validation as the shipping
gate for the fans (my recommendation — it is the game's own variable, set by
the game's own debug path), or hold the fans as labelled-unvalidated until the
natural trigger is found, which W31 may not find.

**3. Scoring's place in the order.** Your frame-exact scoring requirement puts
a static score/chain/rank ledger wave (W19) BEFORE the first enemy is ported,
because the systems being built now feed it and retrofitting order-within-
frame semantics is exactly how chains drop by one frame. Cost: the first
visible enemy arrives one wave later than it otherwise would. Confirm the
trade, or tell me visible progress outranks it and I will swap W19 behind W21
and accept the retrofit risk with my eyes open.

**If it were my call, the first move is W17's measurement run today, out of
order:** one invulnerable 9,500-frame stage-1 run. It costs one MAME session,
it turns every level-track gate from "the first 22.8 % of the stage" into the
whole stage before the porting starts, and it carries the boss-lock tap that
decides whether the stage even CAN end. Everything else in Phase A is already
proven against data we have; this is the one number the whole round is
currently standing on without holding.
