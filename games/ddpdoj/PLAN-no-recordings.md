# PLAN — no recordings

status: ACTIVE — successor to `PLAN-vertical-slice.md` (which is DONE in the
only sense that matters: it produced a ship that flies, verified to 0 divergent
frames, over a picture that is a recording)
written: 2026-08-01, by the wave-10 architect, from the five wave-10 recons:
`docs/worklog/ddpdoj/10-recon-{display-list,background,enemies,combat,flow}.md`
target: **`ddpdojblk`, VERSION-B (2002.10.07 BLACK VER)**, addresses
`$23xxxx–$29xxxx` unless a line says otherwise. Read
`games/ddpdoj/NOTES-build-split.md` before citing any address from here.

The owner's goal: **a playable, finished game with NO RECORDINGS NECESSARY.**
Every pixel the 161-frame capture currently supplies must eventually come from
simulation. The page today is honest about being a splice; the goal is a page
with nothing to be honest *about*.

Definition of done for this plan: **`assets/capture.bin` is deleted from the
bundle and the page still shows the game** — because every layer it used to
supply is computed, gated at 0 divergent frames against the board, and the
CAPTURE LEDGER below is empty. Recordings survive only in the role they were
always legitimate in: as the oracle's scenario corpus (a replay IS a scenario —
`NOTES-replay.md`), never as a runtime asset.

Nothing in this plan was measured by the architect. Every number carries the
recon that measured it; where a recon says "candidate" or "listing-only", this
plan says it too. Waves 5, 6 and 8 all came back BLOCKED rather than lying,
and that discipline is the project's asset — this plan is built to make BLOCKED
a cheap, early outcome rather than a late one.

---

## 1. THE CAPTURE LEDGER

`capture.bin` packs, per captured frame: the palette, the hardware display
list, both tilemaps, the rowscroll array, the zoom table and the video
registers (`tools/pixpack.mjs` §header), for 161 consecutive frames of
`fly-around`, looped. Plus, derived from it: the harvested sprite/tile pixel
streams in the bundle. That is the complete inventory of what must become
simulation. **The plan is finished when the STATUS column below reads REPLACED
on every row.** Partial progress is legible here, not vague: each wave names
the rows it removes.

| # | the capture currently supplies | replaced by | status |
|---|---|---|---|
| L1 | ~~**The hardware display list itself** — the port does not build one~~ → **the CONTENTS of the thirty sprite buckets.** W11 ported main-loop call #4 whole and gated it at **0 divergent frames over the 1,901 build-B frames of `stage1-open`**, byte-for-byte against the board from the board's own staged bucket bytes (plus two forced-cap scenarios). The transform is done; the producers are not — one of thirty buckets (14, the shots) has a ported feeder | W12–W26 (the producers) | **converted by W11** |
| L2 | ~~The ship's display-list record + banking image~~ | W12 | **REPLACED** — `$24A482` ported whole: the ship's own record (`$24A538`), the invulnerability aura (`$24A532`, 5x40 c2 — wave 9's "exhaust plume") and the glow (`$24A632`, 1x32 c26, through the `$500000` latch). Gated at **0 divergent frames over 2,200 lf of `fly-around`**, staged bucket-19 bytes AND the emitted list entries (`pgm.py shipgate`), ten red mutations. **The ship banks**: the 17 rebased animation pairs are in `manifest.ship`, 16 of them harvested from the sprite ROMs by address because the recording contains only the tilt-0 image. What the capture still supplies is WHICH LIST SLOT the records occupy — that is L1's remaining half (26 buckets with no producer), not the ship's |
| L3 | ~~The two option pods + two exhaust records~~ | W12 | **REPLACED** — `$24C096` ported as far as the laser gate: the pod records `$8104AA`/`$8104CA`, `$24D12E`'s move, bucket 15, and the three ground shadows in bucket 5 (`$249EE2`, `$24C438`, `$24C470`). Same gate, same 0 divergent frames. `OPTION_COLUMNS` joined `CLAIMED`. **The wave-11 ablation's label for bucket 5 ("the ship's exhaust") is corrected: its only two writers are `$23EFC0`/`$23EFEE` and every caller reached is a SHADOW.** The "two exhaust records" of this row are the aura and the glow, and they are in bucket 19, not 5. **CORRECTED BY W12.5:** "as far as the laser gate" overstated the coverage in one place -- formation 2 (`$24C390`) FELL THROUGH into `$24C476`, ~30 instructions of fire handshake and pod shot cadence, and W12 returned there silently (12-review F2). Ported in W12.5 with `$24D480` (the pods' shot spawn) as a named throw; gated by `pgm.py firegate` at 0 divergent over 2,571 board frames. **No display-list record is involved, so this row's status does not change** -- it is the note that was wrong, not the replacement |
| L4 | Player shot sprites (worse than replayed: NOT in the capture at all — the port computes shots and they are INVISIBLE) | W13 | open |
| L5 | The video registers: bg x/y scroll, tx scroll, ctrl, bg_scale — and the rowscroll array (measured all-zero over 13,600 lf) | W14 | open |
| L6 | The BG tilemap (the 64-column ring, one 9-tile column per 32 px of scroll) and its motion program (speeds, freeze, repeat) | W16, data from W15 | open |
| L7 | BG tile pixels + BG palette blocks (bundle holds 415 harvested tiles; stage 1 references **1,820** — 10-recon-background §6b) | W15 | open |
| L8 | The TX tilemap: HUD, score digits, all on-screen text | W17 | open |
| L9 | The score/chain VALUES behind those digits (recorded pixels that do not respond to play) | W17 + W21 | open |
| L10 | The enemies: existence, position, motion, FACING and AIM (aim reads the live player 3.5×/frame — 10-recon-enemies §5 — a recording cannot supply it, ever) | W18–W20, W22, W26 | open |
| L11 | Enemy bullets (buckets 22/23, the front of the picture) | W23 | open |
| L12 | Explosions, death effects, items (bucket 20 bulk writer, `$289004` pool) | W21 + W11's ablation naming | open |
| L13 | The laser beam, bomb flash, hyper (NOT in the capture at any price — the recorded player never held fire or bombed) | W24, W25 | open |
| L14 | The palette DURING gameplay: per-stage loads are located (`$2415E8`, W16); per-frame writers/fades were not reconned | **not yet answered** — needs a palette-writer census before W17 closes | open |
| L15 | The 161-frame LOOP BOUND — the game simply ends where the recording does | W16 + W18 (background + spawns run to the stage-1 terminator), W28 (past stage 1) | open |
| L16 | "The ship is never hit": death, lives, respawn, continue, game over exist nowhere on the page | W23 + W27 + W28 | open |
| L17 | The zoom table blob + the entry-`$F`=1 quirk | W11 | **REPLACED** — baked as the `$23C588` constant (`src/zoomtable.js`), asserted against `:igs023:zoomram` on every `dlgate` run, named `zoomcov` cases `eff-index-0F`/`eff-index-10`, mutation `zoom-f-literal`. Still classified HARDWARE FACT **BY INFERENCE**, never a silicon measurement |
| L18 | The identity of 25 of the 30 sprite buckets (what pixels each buys) | W11 (the ablation) | **REPLACED** — the bucket→pixels table in `docs/worklog/ddpdoj/11-impl-display-list-keystone.md` §6, plus the `bsr`/counter-writer census §7 (which corrects "fed entirely by `bsr`" to "no static caller of any kind; bucket 20 is fed by the bulk writer `$28A098`") |

NOT on the ledger, deliberately: **sound**. The page is silent and the capture
never supplied audio, so sound is not a recording being replaced — it is a
separate unstarted subsystem (§5).

## 2. THE ORDERING ARGUMENT

**The display list is the keystone, and the recons agree** — three of them
independently: wave 5's blocked chain terminates at the sprite enqueue
(`$253B1E: jmp $23F3AE`), 10-recon-combat's shot chain stops at the same
instruction, and 10-recon-display-list showed that every producer in the game
ends in one of exactly three enqueue conventions feeding call #4
(`$23D2AE`). Until the port can BUILD a display list, every simulated object is
invisible and every later unit's output has nowhere to go. Two properties make
it first rather than merely early:

1. **It is verifiable to the byte TODAY with zero new gameplay simulation**:
   dump the board's staged bucket bytes (`$80397C..$80AFFB` at the `$23D382`
   sample point), feed them to the port's call #4, byte-compare
   `$800000..$8009FF`. The transform is pure; the capture becomes the *input*
   instead of the *output*.
2. **It converts the capture boundary into a per-producer boundary.** After
   W11, each producer (ship, pods, shots, enemies, bullets) is verified in
   isolation against its own bucket's staged bytes, instead of against a moving
   whole-frame target. That is what makes waves 12–26 one-implementer-sized.

**But it is not a global bottleneck, and here the recons partially disagree —
or rather, are orthogonal.** 10-recon-background found the playfield does not
pass through the display list at all: the BG/TX tilemaps and the six video
registers go straight to the renderer, the background is one top-level object
plus a 7-opcode script VM, and attract and play share every line. So the
playfield track (W14–W17) proceeds in parallel with the sprite track, second
implementer, no ordering constraint between them except one:

- **`$813176` (the camera's cross-axis delta, W14) is an INPUT to the enemy
  driver, the shot driver and the background-element driver** (`sub.w
  $813176,($4,A6)` in all three — 10-recon-background §5e). W14 lands before
  any of W13/W18/W20 can be compared at 0 divergent frames. It is small and
  low-risk; schedule it accordingly.

The flow track (W27–W29) is independent of both until collision exists: death
requires the ship to be hittable (W23). The aim (W19) is a pure function of
two positions and is unit-testable before any handler exists.

Measured pixel priorities, for when choices must be made (10-recon-display-list
§3): bucket 0 (enemies, direct-to-queue) is the largest sprite source at mean
27.4 / max 100 records per frame; the BG tilemap is the largest layer of all.
The W11 ablation replaces this paragraph with a full table.

**Measure-before-port items are embedded in their waves, not deferred**: the
bucket ablation (W11), the `$81B4C0` score-writer tap (W17), the `$8130D2` and
`$813186` writer hunts (W14), the `$2453C2` laser mystery (W24), driving the
debug warp (W28). Each recon flagged its own "do not port over this hole";
those flags are load-bearing in the wave definitions below.

## 3. THE WAVES

Numbering continues from wave 10. One implementer per wave; every wave writes
`docs/worklog/ddpdoj/NN-impl-<slug>.md` as it goes; every wave's done-when is a
scenario comparing **0 divergent frames** on named columns plus at least one
red-validated mutation (`docs/knowledge/03`) — never a feeling. Every wave
that ports a write adds the written address to `WATCH_SPEC`/`CLAIMED` **in the
same commit** (wave 5's rule 7: a compared column is the only thing that is
checked; `d_ram` is in every TSV and compared by nothing).

### Phase I — the pipeline and the picture (W11–W17)

**W11 — the display-list keystone. DONE**
(`docs/worklog/ddpdoj/11-impl-display-list-keystone.md`, 2026-08-01). Delivered:
the whole of `$23D2AE..$23D724`, the parameterised enqueue API, the zoom table
as a baked constant with a boot assertion and two named `zoomcov` cases, the
30-bucket ablation and the `bsr`-target scan. Gated at **0 divergent frames on
all 1,901 build-B frames of `stage1-open`** plus two forced-cap scenarios;
twelve mutations, ten RED over the union of the three, two DECLARED
EXPECTED-GREEN with measured reasons. **Three of this section's own
instructions turned out to encode recon errors and were corrected in the same
commit** — the terminator is NEVER skipped (`$23D6E8` compares D1, which
`$23D6DA` loaded with `$12`); 251 records carry FOUR fillers, not five, and the
cadence is 51-then-50, not "every 52"; and the short-axis assertion has to be on
the DELTA across the `$80B054` add, not on the value (a zoomed record legitimately
has bits 13..11 set). The original text follows, unedited, so the corrections
have something to be corrections OF.

Port main-loop call #4 whole, with NO
producers: the 30 counters, the sum in counter-address order, the pre-emptive
drop policy (`$80AFDE` first, then `$80AFD2`+`$80AFD4`, telemetry flags
`$80B002/$80B004`), the 29-bucket drain in the ROM's hand-written order with
the EQUALITY cap and the abandon-the-tail carry path, the emit (32-bit
`asr.l #6` and `add.l $80B054`, the OR-ed flip/colour byte patched over word
2's high byte, a filler every 52 records, the terminator SKIPPED at exactly
251), the counter clear. Plus: the enqueue API — ONE parameterised function
for the ~130 stubs, plus the zooming variant `$23D9E2` and the bulk-writer
convention — with unit tests pinning the 7-field object-record spec
(`+$2/+$4/+$6/+$8/+$A/+$E/+$1C`); a standing assertion that the short axis
never exceeds 10 bits after the `$80B054` add and a loud watch if `$80B054` is
ever non-zero; the zoom table baked as the `$23C588` constant with a boot
assertion against `:igs023:zoomram`, `zoomcov` cases `eff-index-0F` (both
encodings, both axes) and `eff-index-10`. And run **the bucket ablation**:
zero one bucket counter at `$23D382` per run, diff the framebuffer, produce
the bucket→pixels table + PNGs; close the ten `bsr`-only buckets with the
per-stub `bsr`-target scan.
*Done when:* the staged-bytes replay gate compares `$800000..$8009FF`
byte-for-byte on **every one of the 1,901 build-B frames of `stage1-open`, 0
divergent**; mutations `cap-as-ge`, `always-terminate`, `no-preemptive-drop`,
`drain-order-reversed` and `zoom-f-literal` all go red; the ablation table is
committed in the worklog.
*Removes:* L17, L18; converts L1 from "the only source of pixels" to "the
source of bucket contents" — the boundary every later wave moves.

**W12 — the ship becomes fully real.** Port the OPTION object `$24C096` as far
as the laser gate: pod records `$8104AA/$81050E`, the `$24BBAA`-indexed
template copy, the raw/edge byte copies `$24C134/$24C13A`, the branch to
`$24C29E` (no laser) vs `$24C180` (laser — a named throw for W24). Wire
bucket 19 from the player block's four feeders and bucket 15 from the option
handler's seven; carry the exhaust records; ship the 17 rebased
animation-pair map in the manifest so the ship BANKS (the one-field exporter
change `render/capture.js` documents). Housekeeping that is really combat
truth: rename `P.animB` to the ship's X half-extents (it is hitbox table
`$2553F2`, not animation — 10-recon-combat §3) and add
`$8103F6/$8103F8/$8103FA/$8103FC` as compared columns; move the held-fire
throw from the speed ramp to the board's actual gate (`RAM.p1raw & $10`,
cited `$24C134`/`$24C164`, no speed-index condition).
*Done when:* `fly-around` compares the port's bucket-19 and bucket-15 staged
bytes AND their emitted list entries byte-for-byte, 0 divergent over 2,200 lf;
`OPTION_COLUMNS` joins `CLAIMED`; a new test proves a hold at the speed floor
still throws; a tilt scenario (stick L/R) shows the ship banking and the
hitbox columns moving per the ROM table.
*Removes:* L2, L3. The page header's SPLICED state dies.

**W13 — shots you can see.** The four reached shot handlers (`$253B1E $253E34
$253BDA $253EC6` — low nibbles 0,2,8,A, wave 5's census), each ending in the
bucket-14 enqueue `$23F3AE`; `$81295C` (live shots — the frame-sync governor
reads it) as a compared column; the shot-table-full feedback into `($2b,A6)`
and `(A6)` bit 3 that wave 5 proved is why the player block can't be compared
in a firing scenario without this. Depends on W14's `$813176`.
*Done when:* `stage1-shot` (≥1,800 lf, firing) compares bucket-14 staged bytes,
emitted entries, `$81295C` and the full player block at 0 divergent frames —
with the window chosen to contain no CONNECTS until W21 lands, and that
restriction written on the scenario, not hidden in it.
*Removes:* L4 — the first thing on screen that responds to the player.

**W14 — the playfield registers and the camera.** `$240B0E` (reset),
`$240B94`/`$240C22` (the two camera accumulators with the `&~$3F`/`&$3F`
fractional split), `$240CC0` (the upload, INSIDE the IRQ6 gate — an overrun
frame does not move the scroll registers), ctrl at the loop head, `bg_scale`
= `$0210` once, TX scroll (0,1) once, a rowscroll[0..223] digest column
(expected all-zero; its job is to PROVE it stays zero). The camera follow:
`$26146C`, `$2614C0` (the `divs.w #$C8` chain), `$2613B4` (±`$800` clamp),
`$813170..$813178` as columns — **`$813176` unblocks W13/W18/W20**. Plus the
two writer hunts the background recon left open: write-tap `$8130D2` (the
flag that freezes the whole background handler, 1 on 814/7,000 frames, writer
unknown) and `$813186/$813188` (the shake, never fired); both become columns
and the shake stays a loud throw until a scenario reaches it.
*Done when:* a ≥7,000-lf scenario compares all register/camera columns at 0
divergent (the expected values already exist in `out/bg*.tsv` — the gate is
written before the code); mutations `commit-the-fraction` and
`upload-outside-gate` go red; the `$8130D2` writer is named in the worklog or
BLOCKED with the tap output.
*Removes:* L5.

**W15 — the background asset, with teeth.** Export stage 1's 248-column stream
(`$225B78`, 8,928 B), the `$800`-byte palette block (`$227E58` → palette word
`$400`), the tile base `$0AA90000`, and the 1,820 BG tiles `$AA9..$11C6`
through the proven decoder; extend the manifest with `bg.stage`; integrity
checker re-reads ROMs at raw file offsets (two-sides rule,
`docs/knowledge/03`); assert the structural invariants (every stage's stream
≡ 0 mod 36, every palette block exactly `$800`). **Measure the gzipped
size** — 1.16–1.86 MB decoded is arithmetic, not a bundle number, and nobody
promises a size before measuring one.
*Done when:* fresh extraction passes the integrity checker; the invariants
hold for all five stages; the measured bundle delta is in the worklog.
*Removes:* L7 for stage 1 (and the harvest-from-capture as the only tile
source).

**W16 — the background lives.** The ring writer `$240D76` (index
`(row*64+col)*4` + per-stage base), the init fill `$2611FC`, the per-column
write at `$26134E` off the `($20,A5)` accumulator, the mod-64 cursor →
`$81318A`; then the stage-script VM `$262062` — ops `$08` (speed), `$0C`
(freeze + stash `$8130CE+4`), `$04` (rewind/repeat) and the `$261F76`
unfreeze partner, the `$26200E` fast-forward path, the `$8130D2` gate
honoured; ops `$00/$10/$14/$18` are LOUD NAMED THROWS carrying their ROM
address and record time; the background object type 1 (`$26127A`/`$26114C`)
drives it all. The distance clock is the SCROLL ODOMETER (`$26132C`, one tick
per `$200` of scroll, pause-gated) — never a frame counter.
*Done when:* the BG-videoram digest plus `$8130CE`, `$81318A`, `$81318C`
compare at 0 divergent over ≥3,000 lf **including the measured freeze/repeat
window (clock parked at `$0034`, lf1700–1899, resuming at `$0038`)**; the red
mutation `clock-per-frame` diverges at the first repeat, as the recon says it
must.
*Removes:* L6, and L15's background half — the stage scrolls, accelerates,
freezes and loops as the board does, for as long as the stage-1 script runs.

**W17 — TX and the score.** The block printer `$240CF0`/`$240D2C` (the
`-$40000000`/`lsl.w #1` attribute mangle translated as written) and its 11
call sites; then the score pipeline — but MEASURE FIRST: a write tap on
`$81B4C0..$81B4C3` naming the per-event contributors (they reach it through
registers; one absolute-long reference exists — 10-recon-combat §9), then
port `$242AC6` (bin→BCD), `$2842B0`/`$2842FE` (pending → `$81B440`, the 9th
digit `$81B44C` saturating at `$999999999`, the extend at `$28433C` with the
20-lives cap, the dead-player pending discard), and the player tail
`$249F0E..$249F88` including the `$249F3C` loop-2 double-add quirk as
written. Chain words (`$8128F4/$8128F6/$8128FE/$812900`, timer `$812914`)
become columns. **Also: the palette-writer census that L14 needs** — who
writes the palette shadow during gameplay, fades included; it is one tap run
while the tooling is warm, and L14 stays open until it has an owner.
*Done when:* the TX-videoram digest compares at 0 divergent over `fly-around`
plus a firing window; `$81B440/$81B44C` and the chain words are compared
columns and match the board in the same windows (values stay small until W21
gives enemies HP — labelled on the scenario, not hidden).
*Removes:* L8; L9 partially (digits real and live; full values when W21
lands). L14 gets a measurement or an honest owner.

### Phase II — the fight (W18–W26)

**W18 — the spawn side + the gate scenario.** `stage1-spawn` joins
`scenarios.json`: ≥9,000 lf from the seeded boot, Button 3 (auto-shot) from
lf1800, the `fly-around` invulnerability intervention from lf1990, both
labelled on every number. Port: the stage table `$263336` (the `$813096` =
stage×4 quirk AS WRITTEN), the walker `$2633BE` and the 8-byte record, the
type dispatch `$2635F6` **including the init+8 second entry point**, the
sub-record allocator `$2635B2` with the 101st-slot overrun into `$81521C`
translated as written, the deferred queue `$815EAA` (LIFO drain, `$C80` cap,
dummy `$816B2A`) — enemies spawning enemies is normal, 33+ of stage 1's 372
spawns arrive this way. Every handler stays a loud named throw. Close the
recon's open item: a write tap proving `$26132C` is the only `$8130CE`
writer.
*Done when:* `$8132CC` (cursor), `$8130CE` (clock), `$815E9C/9E/A0` (live
counts) and a spawn counter compare at 0 divergent all the way to the script
terminator `$231704`; red: `clock-per-frame`.
*Removes:* nothing visible; the recording stops being the authority on when
and where enemies exist — the precondition for everything below.

**W19 — the shared machinery and THE AIM.** The movement byte-code interpreter
`$2638A6` (13 opcodes; `$263948`'s table with its 8 unread entries as named
throws), the velocity tables `$241812/$2417DE` reading `$200920`, `$2418B4`
and the quadrant jump table `$241850` **as ROM data, not transcription**, the
scroll compensation, both free paths + `$28AD54`'s deferred reclaim (the
two-phase free — free immediately and slot assignment diverges on the first
death). THE AIM: `$24202C` → `$24270A` target select **with the live
fallback at `$242722`** (exercised 2,500–3,600 times per run in a 1P game —
hardcoding "aim at P1" is right by accident), the octant construction, the
`asl.l #6 / divu.w` ratio with its rounding, the arctan LUT `$2420F6`, the
variants `$242730/$242748/$242760`, `$242190`'s turn-toward stepper,
`$268018`'s nearest-player metric.
*Done when:* the aim is unit-tested byte-exact against the MAME census tables
(the still/moving A/B distributions from 10-recon-enemies §5 reproduced
exactly: 6 octants still, 8 moving, the same counts); the interpreter and
velocity path pass listing-derived unit tests. No board scenario yet — W20
makes it comparable, and this wave says so instead of pretending.
*Removes:* nothing yet; it is the API all 19–20 handlers plug into, and it
kills the aim half of L10 the moment any handler exists.

**W20 — the popcorn: the script-mover family.** `$2688CC $268232 $2739C0
$2747C6 $27733E $275F30 $275914` — seven handlers sharing one shape, 60 % of
all measured dispatches (115,623/190,952), `$2688CC` alone 74,564. Includes
the three per-record function pointers (`+$4C/+$2A/+$2E`) and the `$268A0E`
fire/facing block (the aim used as sprite ORIENTATION — pixels the capture
fakes). Sprite side: bucket 0 (`$23D762`) and bucket 7 (`$23D852/$23DF86`).
Do the driver + ONE handler and gate it before adding six more.
*Done when:* a `stage1-spawn` window compares enemy-record columns AND
buckets 0/7 staged bytes at 0 divergent; red: delete one handler's update.
*Removes:* the majority of L10's pixels — enemies that move and FACE THE
LIVE SHIP.

**W21 — hit, death, damage, and the score's sources.** `$2459D0` (the
four-half-extent enemy hitbox, the `$817F8E` shot list with its 6/10/15/18/20
power-gated length — a rank-shaped amplifier, into the state vector),
`$286096` damage (1 + `$81B63E`), the two-way shot exchange
`$244FEC/$2450B4` (`$24504E`/`$24505E`, the sticky `bset #7`, the `$81308C`
75 %-vs-100 % branch translated as written even though no frame has ever run
the 75 % path), HP/reload/dying-bit, the death spawn through `$289004`.
Confirm-or-refute by tap: `$81B64A`/`$81B65C` (chain/score candidates,
listing-only) and the `$81B4C0` contributors from W17's census.
*Done when:* `stage1-shot` is RE-RUN with connects in-window: 0 divergent
including `hitex` (compared, not masked — wave 4's mask retires), the enemy
HP columns, and the score pending words. Red: `damage-applied-twice`.
*Removes:* **"nothing can be shot" — the headline complaint of the round.**
L12 (explosions/items begin here), L9 completed.

**W22 — the rest of the regulars.** The damage-first family (`$26A2E2 $269CEA
$26A5E4 $26AD28 $26A860`) and the scroll-locked pair (`$27687E $276702`) —
36 % of dispatches, dependent on W21's damage path.
*Done when:* full `stage1-spawn` compares at 0 divergent with 97 % of
measured dispatches simulated; the remaining handlers throw loudly with
address + type byte; the audit asserts no type outside the measured 22 ever
dispatches without throwing.
*Removes:* L10's ground/turret and scroll-locked enemies.

**W23 — enemy bullets, and the ship can die.** The bulk writer `$281D9A`
(clears `$81B40C` — the governor's third term — then walks `$817F8C` with
the `$81B414..$81B41A` count ladder; counters set from the pointer
difference, NOT by counting), the 32-entry dispatch `$27F99E` + the second
dispatch behind `$2810CA` — port what the scenario reaches, throw on the
rest; FIRST resolve the `$30`-vs-`$3E` stride disagreement on `$817F8E` by
tap (10-recon-enemies §6 — do not guess). Then the player's side: `$244D62`
+ `$2459D0` reached only from the type-5 tail `$28B670` — the ship's own
hitbox (`$0080/$0100/$0080/$0080`, 4×6 px, the Black Label 2/3 number) and
its three bullet passes with the `+$2800` bias.
*Done when:* buckets 22/23 staged bytes, `$81B40C`, `$817F7E` and the clip
box `$80FA74..$80FA7B` compare at 0 divergent; AND a **no-invulnerability**
scenario reproduces the board's death frame exactly (the intervention that
made every long scenario possible is finally retired in at least one).
*Removes:* L11; the "never hit" half of L16 becomes false.

**W24 — the laser.** BLOCKED-FIRST: `$2453C2` (the laser collision block)
executed ZERO times across 580 frames of a live beam on the board and nobody
knows why (10-recon-combat §8.7) — settle that by measurement before porting
`$24536E`. Then: the beam records `$811EF2/$811F12`, the 45×`$30` segment
table `$811F72`, the three target passes, damage constants `$1E0`/`$208`,
the option-object laser path from W12's named throw (`$24C180`, the latch
`bset #2,($1,A6)`, the measured 17–20-frame bring-up), and whichever bucket
the W11 ablation names for the beam's pixels.
*Done when:* `stage1-laser` (≥1,800 lf, holding fire) compares the beam
records, segment-table digest and laser damage at 0 divergent, reproducing
the measured board timeline (shots stop, latch at +17, beam at +20).
*Removes:* L13's laser — the weapon the capture cannot supply at any price.
Also the precondition for the bee hunt (W30).

**W25 — bomb and hyper.** The bomb block `$249814` (stock gate `$2497FE`, the
`$284/$285xxx` callees feeding bucket 25) and the hyper (`$24989E`'s bit-0
set, `$2554EA[1]/[3]` templates, handlers `$254078/$2541BC` — the HYPER, not
the laser; wave 8's mislabel is corrected in the same commit as the port).
*Done when:* `stage1-bomb` compares at 0 divergent. With W13/W24 this closes
the vertical slice's original "all three weapons" done-when — several waves
later than that plan hoped, and this plan says so.
*Removes:* L13 completed.

**W26 — the bespoke handlers.** `$272AAC` (types `$20/$21`, the 8-slot boss
band), `$26B6FA`, `$29700C`, `$2697F6`, `$292902`, `$296DD6` (the
deferred-queue-only type). The stage-1 midboss and boss.
*Done when:* the full 9,500-lf `stage1-spawn` including the boss (clock
frozen at 836) compares at 0 divergent on all enemy columns and the sprite
digest.
*Removes:* L10 completed for stage 1. **At this point the stage-1 foreground
needs no recording at all.**

### Phase III — the game (W27–W30)

**W27 — the flow spine.** The stride-8 dispatch table (the stride-4 reading
doubles every type index — fix it everywhere it leaked), the life machine
`$25FF7A` (states 1–4: the miss with `subq.w #1` through the +$08 POINTER —
never hard-code `$8130BE` — the 120-frame death pause, the DIP lives table
`2,3,4,0,1`, `$FFFF`=exhausted/0=still-alive), directors 8/9/10 as named
throws where unported, and `pgm.py flow` as a standing scenario.
*Done when:* the measured 7,000-lf no-input scenario (three misses,
stock-out, 812-frame continue window, return to title) compares at 0
divergent on mode/join/select/stage/loop/lives/life-state/alive/alldead/
continued; red: `no-miss-decrement`.
*Removes:* L16 completed — the ship dies, respawns, runs out, and the game
ends, live.

**W28 — the stage boundary, the warp, and a measured continue.** The stage
script object type 6 (`$28D63C`, the `($6,A5)` ladder, `$25FD0C`'s two
callers, the `$81DF20` interlock); DRIVE the debug stage warp (measure
`$C08006` bit 7, the 40-frame P2 combo, `pgm.py warp <0..11>` — everything
about it is listing-only until this run); script ONE continue inside the
measured window and watch `$8130CC` and life state 4 actually happen, then
port the continue path and banner driver `$288610`.
*Done when:* the warp verifiably lands in stages 2–5 and the R-stages
(framebuffer + `$813092/$813098` readback); a continue scenario compares at
0 divergent across the accept transition.
*Removes:* L15 completed (the game continues past stage 1). Unblocks
Phase IV entirely — the warp is the cheapest route to the other five sixths
of the game that any recon has found.

**W29 — boot, title, select.** The mode machine type 8 (dead during gameplay
— `$24107C` destroys it; a port driving gameplay off `$812E56` drives a
corpse), the select director type 9 (the `$0599` BCD countdown, the
sub-frame states 2/5/6 that never appear at the sample point — a named test,
not a hope), credits (`$23C98E/$23C9F0`).
*Done when:* a power-on→coin→start scenario compares the flow columns at 0
divergent with no savestate seed; the page boots the game the way the
cabinet does. (A seeded start remains legitimate for scenarios — it is an
"initial state" in the replay format's sense — but the SHIPPED page should
not need one.)
*Removes:* the last non-gameplay screens from any conceivable recording.

**W30 — the two hunts (recon; BLOCKED is an acceptable result).** (a) THE
BEES: with W24's laser and W28's warp, fire the laser across a stage pass,
tap the object allocators and score staging for laser-only allocations —
no static trace of bees exists (10-recon-flow §11.1) and only a laser
corpus can show the reveal. (b) THE LOOP-2 GATE: warp to stage 5/E, tap
`$81308C..$813158` + `$81B440/$81B44C` across the boundary, find what the
decision reads; then poke-both-sides per `NOTES-progression.md` §2b's
discipline (a poked run proves the DECISION, not the journey — keep the
claims separate). Known negative going in: no plain compare against
350,000,000 exists in the image; `$813098`'s only writers are inside the
debug warp; the natural transition is genuinely unfound.
*Done when:* each hunt ends in measured addresses or a BLOCKED entry listing
what was tried. Nothing in the port may guess either mechanism meanwhile —
the loop boundary carries a loud throw until this wave closes.

### Phase IV — the rest of the cartridge (W31+)

Not scheduled wave-by-wave here, because its cost is UNMEASURED until the
warp-driven censuses run — and that is the honest state. What is known:

- The game is **six stages per loop, two loops** (`STAGE 1..5, E, R1..RE` —
  the game's own selector table), not five.
- The enemy type table is static: **113 handlers over 256 types** for the
  whole game; stage 1 needed 20. The remaining ~93, the 32+ bullet handlers,
  five more bosses, the unopened top-level types (`$256E7A $25CEB8 $24902A
  $28EE88 $26127A`-adjacent), and four more stage scripts (already located,
  `$263336`) are the bulk.
- Each content wave is the same shape, now cheap to size: `pgm.py warp N` →
  run the census (handlers dispatched, buckets fed, ops fired) → the wave is
  the measured set, gated by a per-stage scenario at 0 divergent. Asset
  export per stage is data-driven off the W15 exporter (stream lengths and
  palettes for all five stages already verified structurally).
- Rowscroll and `bg_scale` — quiet in every stage-1 frame — are exactly the
  systems most likely to wake in later stages/bosses; their standing watches
  escalate loudly, and MAME not implementing `bg_scale` means a non-`$0210`
  write is an ORACLE gap, not a port bug (`PLAN-vertical-slice` §6.8).

A realistic extrapolation from measured stage-1 costs: **each remaining stage
is 3–6 waves** (census, handlers+boss, assets+script+gate), plus loop-2
verification once W30 lands. Call it **20–35 waves beyond W30**. Nobody
should read Phase I–III as the bulk of the job; it is roughly the first
third, and it is the third with the best tooling already built.

## 4. CROSS-CUTTING CONSTRAINTS — binding on every wave, from the notes

1. **The work budget is COUNTED, NOT TIMED, and the object driver carries it
   from day one.** Two independent reasons, one design: `docs/knowledge/06`
   — mechanism (C), a truncated per-object loop, changes WHICH things happen
   and cannot be retrofitted; and `NOTES-replay.md` §5 — a timed budget makes
   every replay machine-dependent and the port irreproducible against
   itself. This now extends beyond the top-level driver: **every sub-driver
   this plan ports (the 58-slot enemy walk, the 36×2 shot walk, the bullet
   walk, the 29-bucket drain) walks in the ROM's order with the budget hook
   in place**, because under (C) the order is semantics. If the host
   struggles, presentation drops; the simulation never changes.
2. **Replay determinism** (`NOTES-replay.md`, all five): no host clock and no
   `Math.random()` reaching logic; input sampled once per LOGIC frame at the
   board's sample point (lead ZERO, measured); `logicFrame` and `videoFrame`
   named and compared separately everywhere; state derives from (initial
   state, input words) and nothing else. Every scenario in the corpus is
   already a replay; every wave keeps it that way, and the same-inputs →
   byte-identical-digests check from wave 4 stays a standing gate.
3. **MAME is authoritative for WHAT the game computes, never for WHEN.**
   Every slowdown figure in every worklog and every wave stays labelled
   "MAME-timed, uncalibrated". Magnitude calibration is out of scope (§5);
   mechanism (the gates, the divider, the counters-per-iteration coupling)
   is in scope and already ported.
4. **Rank and loop are global difficulty parameters the corpus holds constant
   unless forced** (`docs/knowledge/08`). Now with addresses: `$81309E` (the
   live rank, computed per frame by `$2608D2`), `$80380C` (operator rank),
   `$813098` (loop), `$813092/94/96` (stage ×1/×2/×4), plus the power ladder
   `$81B414..$81B41A` which scales the COLLISION LIST LENGTH — a
   rank-shaped amplifier inside the hit test. All go in the state vector as
   compared columns; every coverage claim names which values were exercised;
   scenarios that vary them do so by poking BOTH sides at the sample point.
5. **The standing method rules, restated because every recon needed them:**
   a compared column is the only thing that is checked — new writes enter
   `WATCH_SPEC` in the committing wave; TRANSLATE AS WRITTEN, never as
   intended (the named quirks: the equality cap, the terminator skipped at
   exactly 251, the 101-slot allocator overrun, the word-width ID compare,
   the `$50`-stride LIFO kill queue, the `$249F3C` double add, stage-index
   ×4, `$FFFF`-lives/0-alive, the byte-wide join mask); MEASUREMENT PROVES
   PRESENCE, ONLY THE LISTING PROVES ABSENCE — write "I could not reach it",
   never "the game does not do this"; every intervention (invuln, autofire,
   pokes) is labelled on every number derived under it; every address cited
   is build-B or says why not (`NOTES-build-split.md`); nothing ROM-derived
   is committed.

## 5. DELIBERATELY EXCLUDED — so silence is never read as coverage

1. **Audio playback.** The capture never supplied sound, so it is not on the
   ledger; the page ships silent until a dedicated sound plan exists. What is
   missing: the Z80 mailbox map is secured (wave 3) but the uploaded Z80
   program has never been disassembled and no keyon→event table has been
   verified. Excluded for scope, not because it is done.
2. **Slowdown MAGNITUDE calibration.** Needs real-hardware capture with
   provenance (the scroll-clock method). The budget constant ships
   uncalibrated by design, labelled.
3. **VERSION-A as a port, and the TYPE-B ship beyond the tables.** VERSION-A
   stays a free second reading for cross-checks (the hitbox 2/3 comparison
   came from it). The ship-type jump table has two arms; the corpus has only
   ever run selector 0. TYPE-B (`$249D2C` arm) is ported only when a
   scenario exercises it; until then the select screen offers what is
   verified and says so. Missing measurement: any TYPE-B run at all.
4. **A live second player.** The code is ported P2-shaped (pointer-indirect
   lives, paired blocks, the target-select fallback) because the board is —
   but no P2 scenario exists and none is planned inside this arc. Missing:
   a two-player scenario and the mid-game join path under comparison.
5. **Loop-2 CONTENT verification before W30 finds the gate.** The warp can
   reach R-stages for content comparison (poked, labelled), but the natural
   loop-1→loop-2 transition is unfound; the port throws loudly at the loop
   boundary rather than guessing. Missing: the decision routine.
6. **Bee behaviour before a laser corpus reveals a bee.** Nothing static was
   found; `NOTES-progression.md`'s bee claims remain third-party hypotheses.
   Missing: one laser-on pass with allocator taps (W30a).
7. **Rowscroll ≠ 0 and `bg_scale` ≠ `$0210` rendering.** Both all-quiet over
   13,600 measured frames; both watched with loud escalation. `bg_scale` is
   additionally an ORACLE gap: MAME does not implement it, so nothing can be
   verified against it if it ever moves. Missing: any frame where either is
   live (most plausibly a later boss).
8. **The protection-simulation cross-check** (`ddpdojp` run — wave 2 item 8,
   still BLOCKED) and **`ddpdojblkbl`**. Unchanged from the previous plan.
9. **Instruction-level timing fidelity** of translated routines
   (`docs/knowledge/02` trap 6). The budget model is the substitute; the
   tension is named and parked in the calibration constant.
10. **The five unopened/unidentified top-level dispatch entries** (`$256E7A
    $25CEB8 $24902A $28EE88`, and `$26127A` was identified only as far as
    "the background object"). Outside wave 5's live set for stage 1's
    opening — a statement about one window of one scenario, nothing more.

## 6. RISKS — including what could make no-recordings infeasible

1. **SCALE, the headline.** The vertical slice took 8 waves to produce a
   verified ship over a recording. This plan is ~20 waves to a stage-1 game
   with no recordings (Phase I–III) and a measured-but-unscheduled 20–35
   more for the other five stages and loop 2 — call the whole arc **40–55
   waves, i.e. roughly five to seven times the slice**. That estimate's soft
   spot is Phase IV, which is deliberately unpriced until the warp censuses
   run (each census is one run; do them early in Phase IV and re-price).
   Under-selling this is the one failure this plan refuses: the project's
   credibility is measured claims, and "a few more waves" would be a lie.
2. **Asset weight.** Stage 1 alone: 1,820 BG tiles (1.16–1.86 MB before
   compression); all five stages: 7,634 distinct BG tiles plus sprites —
   and sprites CANNOT be statically enumerated (harvest-only, wave 3), so
   the sprite atlas grows with the corpus and late content is absent until
   scenarios reach it. Bundle size is unmeasured; W15 measures before
   anyone promises. Mitigation if it is bad: per-stage lazy chunks; the
   manifest already records provenance either way.
3. **The unresolved mysteries that could invalidate ports if guessed over:**
   `$2453C2` (laser collision never executed in 580 live-beam frames),
   `$8130D2`'s writer (freezes the whole background — a port ignoring it
   scrolls through a boss), `$80B054`'s six unread writers (if ever
   non-zero, the emit's 32-bit add and the zoom-field pollution hazard go
   live), the `$817F8E` stride disagreement, `$81459C`'s three lengths.
   Each is pinned to a wave with a measure-first instruction; the risk is
   an implementer porting past one anyway.
4. **The loop-2 gate and the bees may stay unfound.** Both hunts can return
   BLOCKED (W30). Consequence: the game is playable and stage-complete but
   its progression crown — a legitimate second loop — is unverifiable.
   Fallback: warp-reached loop-2 CONTENT verified and shipped behind a
   labelled entry ("loop 2 as reached by the board's own debug warp"), with
   the natural transition a loud throw. Never a guessed threshold.
5. **Rank/power feedback as a divergence amplifier.** `$81309E` is computed
   from the stage base + game clock + play terms; the power ladder scales
   collision-list lengths; `$81B63E` scales damage. One wrong value makes
   every downstream column diverge at once. Mitigation: all are compared
   columns from the wave that first touches them (W18/W21), and mass
   divergences check rank/power/lag columns FIRST, per `docs/knowledge/08`.
6. **The corpus's interventions.** Every long scenario currently holds
   invulnerability + auto-shot; the ship never moves in the 9,500-lf run.
   Death (W23/W27) retires the invuln crutch in at least one scenario, and
   the aim A/B showed a moving-stick run reaches states a still run cannot
   — moving-input variants of the standing scenarios must exist by the end
   of Phase II or coverage claims overstate.
7. **Environment and repo state.** Another agent is restructuring
   `games/ddpdoj/src/web/` NOW; the shared git index has held staged
   deletions of files this plan depends on. Mitigations: private index
   commits, the machine pin printed on every run, and re-verification of
   any cross-session number before trusting it. The two-builds trap
   (`NOTES-build-split.md`) stands: every wave prints the build it measured.
8. **Could no-recordings be outright infeasible?** No evidence says so. The
   nearest thing to a structural threat is `bg_scale` (a hardware feature
   the oracle itself lacks) and the undumped ARM7 (simulated, cross-check
   still pending) — both could cap fidelity, neither blocks removal of the
   capture. The honest worst case is COST, not possibility: if Phase IV
   re-pricing comes back much bigger than estimated, the fallback is a
   smaller finished game, stated as such — stage 1 (or 1–2) complete,
   playable, recording-free, with the remaining stages behind the same loud
   named throws the project already uses. What is NOT a fallback, ever, is
   a recording spliced back in: the splice is the specific dishonesty the
   owner caught by playing, and this plan exists to end it.

## 7. Verdict

No-recordings is reachable, and the road is long and mostly measured. The
keystone (W11) is verifiable to the byte today with zero new gameplay
simulation, which is rare luck; the playfield is smaller than anyone feared
(one object, four camera routines, a 7-opcode VM, and an asset job); the
enemies are bounded by a static 113-entry table and a 339-record script
instead of the open-ended hunt wave 5 predicted; the aim — the visible lie in
today's page — is a pure function with a census to test against. The genuinely
unknown parts are named and small in number: two hunts that may block (bees,
loop-2 gate), four listing-only mysteries with measure-first orders attached,
and Phase IV's price tag, which is one warp plus one census away from being a
number instead of a range. The plan's spine is the ledger; when it is empty,
`capture.bin` is deleted, and the page's header section — SIMULATED, REPLAYED,
SPLICED — collapses to one word.
