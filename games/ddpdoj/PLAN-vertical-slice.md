# PLAN - the DaiOuJou vertical slice

status: ACTIVE - this is the spine of the loop, the way `docs/worklog/gradius/00-plan.md` is for Gradius
written: 2026-07-31, from the five wave-0 recons in `docs/worklog/ddpdoj/00-recon-*.md`
target: **`ddpdojblk`, VERSION-B (2002.10.07 BLACK VER), the `$2xxxxx` build** - owner's decision, with a plan-level correction below on what that actually means

The owner's goal, verbatim: *"a vertical slice of the very beginning. Doesn't
even have to be the full first stage. But would be lovely to fly around. Extra
bonus for some enemies. Extra bonus for being able to shoot them with all the
kinds of weapons. We don't want to go long, but deep."*

So the definition of done for the slice is: **the ship flies, enemies of stage
1's opening spawn and can be shot with shot, laser and bomb, and every one of
those behaviours is verified frame-exact against the board image - 0 divergent
frames on the compared fields, plus a pixel layer.** A whole stage that is
approximately right is explicitly NOT the goal.

---

## 1. What we KNOW - measured, with the worklog that holds the evidence

Nothing below is inherited. Every line was produced by running the real board
image under MAME 0.288 on this machine, or by reading the decrypted image that
machine executes, during wave 0. Citations: [O]=`00-recon-oracle.md`,
[M]=`00-recon-memmap.md`, [A]=`00-recon-assets.md`, [V]=`00-recon-versions.md`,
[H]=`00-recon-hard.md`.

**Machine and oracle**
- IGS PGM: 68000 @ 20 MHz, Z80 @ 8.4672 MHz (program uploaded by the 68k, no
  Z80 ROM), ICS2115 wavetable, IGS023 video, V3021 RTC. The ARM7 protection
  ASIC's ROM is undumped; on the Cave sets MAME `set_disable()`s the device and
  simulates it in ~40 lines of C++ (a 32-slot 24-bit adder). [O][M][H]
- Refresh is **exactly 15625/264 Hz = 59.185606060606…**, frame period exactly
  16.896 ms, **337,920 68000 cycles per frame** - a `set_raw` derivation, not a
  rounded literal, confirmed from `-listxml` and from the running machine to the
  attosecond. [O][H]
- **The oracle works.** Per-frame probe keyed on the game's own vblank
  semaphore `$803940` (0→non-zero transition = frame finished); write taps are
  the reliable 68000 execution hook; determinism is byte-identical across runs
  once MAME's `cfg`/`nvram` directories are isolated; **input lead is ZERO**
  (a button set at the sample point of logic frame N is consumed by frame N+1);
  savestates restore to within one live byte (`$80FA84`, an IRQ4 phase counter)
  plus dead stack. Probe cost: ~17–21 % of real time with full digests,
  106–136 % taps-only. [O]
- IRQ4 and IRQ6 each fire exactly once per video frame, through BIOS
  trampolines that jump through RAM vectors `$801470`/`$801478` - the real
  handlers are installed at runtime and are per-build. [O][H]

**The cartridge**
- **`ddpdojblk` is TWO complete games in one ROM.** Boot shows a chooser -
  `1: VERSION-A (OLD)` / `2: VERSION-B (NEW)` - with a 5-second countdown whose
  default is **VERSION-A = 2002.04.05 MASTER VER**, i.e. NOT Black Label.
  VERSION-B = 2002.10.07 BLACK VER lives at `$2xxxxx`; the two builds share the
  RAM layout but not one code address (no constant offset; the only control-flow
  crossing is `$13C0DE: jmp $23BEEA`). The choice persists in NVRAM, so a
  pre-seeded `sram` image makes VERSION-B the silent default. [V][H]
- All NINE MAME sets are on this machine and verify (`ddp3.zip` is a merged
  set); `ddpdojp` - the real location test, unprotected, no ARM at all -
  verifies **good** and is our cheapest protection-sim cross-check. [V]
- The NVRAM magic at `0x3800` is load-bearing: wrong magic = the machine sits
  on `ROM ERROR !` forever while MAME exits 0. The factory blobs contain 80–97
  non-zero bytes - a magic plus default settings; **"unlocked" does not live in
  the NVRAM.** [V][H]
- The first ~236 KiB of program (`0x100000..~0x139FB8`) is byte-identical
  across all seven 68k builds - the one region where a version difference is
  provably impossible. [V]

**Game structure (VERSION-B addresses from [H]; VERSION-A analogues in [O][M])**
- Main loop: seven top-level calls - counters (`$23BE8C`: `$80390A`++,
  `$80390D` bit 0, `$80390E` mod 3), four work calls (`$256D5A`, `$2410BC`,
  `$24683E`, `$23D2AE`), the frame sync (`$23C212`, spins at `$23C390` on
  `$803940`), one post-vblank call (`$23D12A`), `bra` back. [H]
- **The frame counters advance per LOOP ITERATION, not per vblank**, and
  `$80390E` is read back by the frame sync itself. `$80390A` has 83 reference
  sites. This is the coupling that makes slowdown a state change, not a pace
  change. [H]
- **There is a deliberate software 2-vblank divider** (`move.b #$2,$803940`,
  gated on `$80390E` mod 3 and `$80392E`/`$803930`): a 29.6 Hz cadence path
  that is scheduling, not slowdown, and will masquerade as slowdown to anything
  that only counts frames. [H]
- The IRQ6 handler (build A, measured; build B to be re-derived) reads inputs,
  then **tests `$803940` and skips four subroutines if the main loop overran**
  while the input read still runs - a case-(A) gate inside the ISR, the same
  "a dropped frame is not uniform" shape as Batman's `$C757`. [O]
- The load meter exists and is calibrated: one fetch tap on the wait-loop spin
  counts idle iterations/frame - ~10,000–12,000 quiet, <1,000 on the 55
  heaviest stage-1 frames, 0 + interrupted-PC-elsewhere = overrun. Two
  identical 3,000-frame runs hash bit-identically including the meter. [H]
- Measured (B)-shaped dilation exists in real gameplay under the probe: 15 of
  1,200 logic frames spanned >1 video frame ([O], VERSION-A run). No overrun
  was ever produced in the VERSION-B runs ([H]) - the two statements are about
  different builds and different runs; neither run reached the cap.

**Player (VERSION-A / TYPE-A numbers - must be re-derived on B before porting)**
- Position `$8103E8` (vertical) / `$8103EA` (horizontal), u16, **1/64 px**
  fixed point; option pods at `$8104AC/AE`, `$8104CC/CE` (±32.53 px). Mover PC
  `$141B2E/$141B32` writes only when the stick is deflected; a separate
  store/clamp at `$148D9C` writes every frame AFTER it. Horizontal clamp
  **[12.0, 212.0] px**, implemented as move-past-then-clamp (porting
  "clamp then move" would be wrong). Speeds: 246 units/frame vertical, 163
  horizontal (the 2:3 tate pixel aspect makes those isotropic on the glass);
  **313 with Button 2 or 3 held** - speed is mode-dependent. Exactly two ship
  types (TYPE-A/TYPE-B). [M]
- The sprite display list: first `0xA00` bytes of main RAM, 10 bytes/entry,
  ≤256 entries, `word4 & 0x7fff == 0` terminator - **confirmed by execution**
  (builder loop writes each entry field exactly 1.00×/frame), rebuilt from
  scratch every frame, slots are NOT stable object identities. Peak observed
  live length: 95. The 256 cap was never reached. [M][O]

**Assets**
- The full IGS023 decode (TX 8×8×4, BG 32×32×5, compressed sprites incl. zoom,
  palette, priority) is transcribed and **bit-exact against MAME: 802,816 /
  802,816 pixels over 8 gameplay frame pairs**, red-validated by three
  mutations (drops to 91.6 / 74.5 / 37.7 %). [A]
- Two measurement offsets are load-bearing for every future comparison:
  **state dumped at emulator frame N is drawn in frame N+1, but the palette
  that applies is frame N+1's** (only a fade frame exposes the difference); and
  the `:igs023:spritebuffer` share lags main RAM by one frame. [A][M]
- Sprites are length-compressed streams addressed via a 2-word header in the
  mask ROM; they cannot be random-accessed or statically enumerated - "extract
  all sprites" only has a runtime-harvest answer or an unvalidated static walk.
  [A]
- Sound: all 1,490 captured keyons are 16-bit PCM inside `cave_m04401b032.u17`;
  BGM is streamed 12–22 s PCM, instruments are tiny looping wavetables; the
  68k→Z80 doorbell (`$C00003`, always `data=0001` from PC `$18AD7E`) carries no
  sound ID - the selector goes through the shared Z80 RAM mailbox
  (`0xC10000-0xC1FFFF`), which was not tapped. [A]
- MAME does **not** implement the IGS023 `bg_scale` register (reads 0x210 =
  100 % in every captured frame). If the game ever writes anything else, the
  reference emulator itself is wrong there. [A]

**Rank**
- The ROM's own operator setting has exactly FOUR values (EASY / NORMAL / HARD
  / VERY HARD; pointer tables at `$15B3B6` build A, `$25C042` build B, reached
  only PC-relative). **Nothing else about rank is measured**: no RAM byte, no
  reader set, no evidence for or against a dynamic rank. [H]

**Harness traps, all paid for once already** (every wave inherits these)
1. MAME persists machine state in `cfg/<set>.cfg` (coin counters, DIPs) and
   reads stale `nvram/<set>/sram`; `-nonvram_save` covers neither. Every
   invocation passes private `-cfg_directory`/`-nvram_directory` (wiped
   between experiments) - `tools/oracle/pgm.py` bakes this in. [O][M][A][V]
2. On the 68000, `CURPC == tapped address` does NOT identify execution (that is
   a 6502 rule); read taps fire on the prefetch. Hook executions with WRITE
   taps, or count raw fetches of the instruction's first word. [O][H]
3. Every Lua tap handle AND notifier subscription must live in a global, or it
   is garbage-collected and silently stops firing. A `local` table no closure
   references is collected too. Never tap two aliases of the mirrored RAM
   block; word-align tap ranges on 16-bit spaces. [O][M][A][V]
4. **Always look at a framebuffer PNG before believing a run reached
   gameplay.** Runs have produced clean, stable, plausible numbers from a
   machine halted on `ROM ERROR !`, and from the INPUT TEST screen. Every
   probe must abort loudly if the interrupted PC sits in the halt loop. [H][M][V]
5. Forward slashes in `-rompath`; pass Windows paths into Lua env vars
   (MSYS mangles path-like values and `io.open` fails with no message). [V][O]

## 2. Inherited claims FALSIFIED by wave 0 - the most valuable output

Do not quote any of these from older documents. The recons measured them false.

| # | inherited claim (where it lived) | measured truth | evidence |
|---|---|---|---|
| 1 | "~54 fps" (early conversation) | 15625/264 = 59.1856… Hz, exact | [O][H], `NOTES-machine.md` §3 |
| 2 | "DaiOuJou is Cave hardware" (early README framing) | IGS PGM, `igs/pgm.cpp` | `NOTES-machine.md` §0 |
| 3 | "`CURPC == tapped addr` discriminates opcode fetch" (`NOTES-mame-oracle.md` §2, correct on 6502 only) | On the 68000: false; discriminator is `PC == offset`, and a read tap only proves prefetch. Two recons independently lost runs to it | [O] §2, [H] §3 |
| 4 | "A replay from a savestate did not reproduce the original trace" (`NOTES-slowdown-oracle.md` §8.4) | It reproduces; the whole difference is 27 bytes of dead stack + one IRQ4 phase byte `$80FA84` | [O] §6 |
| 5 | "`ddpdojblk` verifies BAD; it still boots, with a warning" (`NOTES-versions.md`, pre-correction) | Stale twice over: the `.7z` verifies best-available; and with the BAD `.nv` it does NOT boot - it halts on `ROM ERROR !` while MAME exits 0 | [M] §0, [V] §8, [H] §0 |
| 6 | "`ddp3` is the location test, unlocked, our atlas to cheat" (owner claim) | `ddp3` is the World release. The location test is `ddpdojp` (verifies good). No unlock mechanism found anywhere - a did-not-find, not a does-not-exist | [V] §2 |
| 7 | "`ddb_1dot.u45` = hitbox-display build" (suggestion in `NOTES-versions.md`) | No dot: pixel-identical to `ddb10.u45` over a 2,800-frame scripted session (evidence against, not proof of absence) | [V] §9 |
| 8 | "Sprite list walked backwards, so later entries are behind earlier ones" (`NOTES-machine.md`, now corrected) | Backwards walk + first-drawn-wins ⇒ **higher list index draws IN FRONT** | [A] §3 |
| 9 | "The ARM7 is a second live CPU whose workload a (B) model must account for" (`NOTES-slowdown-oracle.md` §8.1) | On the Cave sets it is `set_disable()`d and simulated; there is no second CPU workload - but note `:prot` still exposes a `program` space, and whether it ever steps was not measured | [O][M] |
| 10 | "ICS samples are 8-bit mono 11025 Hz" (MAME ROM comment) | All 1,490 captured keyons are 16-bit | [A] §7 |
| 11 | "We have four sets" (`NOTES-versions.md`, pre-correction) | Nine, via the merged `ddp3.zip` | [V] §1 |
| 12 | *(implicit in every harness)* "boot ddpdojblk and you are measuring Black Label" | The silent default is the 2002.04.05 MASTER build. Every VERSION-A number in [O]/[M] is NOT yet a Black Label fact | [V] §6, [H] §9 |

## 3. What we ASSUME - written down so it can be attacked

1. **MAME is authoritative for WHAT the game computes, and NOT for real-board
   timing magnitude.** (Owner statement + the Mesen/MAME lag-frame
   disagreement, `docs/knowledge/06`.) Every slowdown figure is labelled
   "MAME-timed, uncalibrated" until the scroll-clock method or hardware capture
   calibrates it.
2. **The protection simulation is faithful enough.** Unproven. Cheapest check
   is the `ddpdojp` cross-run (wave 2); until then a port verified against
   `ddpdojblk` is verified against MAME's simulation of the ASIC.
3. **VERSION-B is "Black Label" as the community means it.** The banner says
   2002.10.07 BLACK VER; the game's own version screen after choosing item 2
   should be captured once more for the record (wave 1).
4. **The RAM layout being shared between builds A and B** is measured for the
   frame/sync/counter block and the player block's general region - not for
   every subsystem.
5. **Determinism holds across a host date change** (V3021 RTC). Agreed over
   minutes; unproven across days. Wave 1 closes it.

## 4. The waves

Ordering argument: nothing can be verified without the oracle, so consolidating
it is wave 1 - **the oracle recon came back DONE, not BLOCKED, so the project
is not blocked**; wave 1 is consolidation and pinning, not bring-up. The
architecture-deciding measurements (object driver, (C), phase order, hitbox,
rank byte) must precede any port code that would bake in their answers, so they
are wave 2. Asset export (wave 3) is independent of wave 2 and can run in
parallel with it - but both waves 2 and 3 depend on wave 1's pinned harness.
Port code starts at wave 4 (player - the owner's "fly around"), then wave 5
(enemies + weapons - the two "extra bonus" items), then wave 6 (the pixel
gate over the whole slice). One implementer per wave; every wave writes
`docs/worklog/ddpdoj/NN-<role>-<slug>.md` as it goes.

### Wave 1 - ONE oracle, pinned to VERSION-B  (role: impl/tooling)

Wave 0 left three parallel harnesses (`tools/oracle/pgm.py` + `frame.lua`;
`tools/pgm.py` + `probes/pgm_*.lua`; `tools/hard/hardrun.py` + luas) and a
fourth ad-hoc one (`tools/drive.lua`). Consolidate on **`tools/oracle/pgm.py`**
as the single entry point (keep the others as libraries it may call; delete
nothing yet), and make it VERSION-B-native:

1. **Pin the machine.** Bake in: private cfg/nvram dirs, forward-slash rompath,
   `-noreadconfig -nowriteconfig`, the boot assertion (abort loudly if the
   interrupted PC is in a halt loop or the sprite list stays empty), and a hash
   of the decrypted `:maincpu` region printed on every run.
2. **Pin VERSION-B.** Produce, by procedure (documented, image gitignored,
   sha256 recorded in `NOTES-versions.md`): a seeded `sram` with VERSION-B
   pre-selected and known GAME/SYSTEM settings. Verify by framebuffer snapshot
   that a silent boot lands in BLACK VER. Confirm (or refute) the `0x03810`
   flag-byte lead while at it.
3. **Re-derive every landmark on build B** and record them in a landmarks
   table in the harness (arm site, wait loop, IRQ6/IRQ4 RAM-vector values, the
   ISR gate, input read site, counter routine): the semaphore keying means the
   probe already survives the move; the landmark table is for attribution.
4. **Scenario runner + `scenarios.json`**, copying the shape of
   `games/gradius/tools/oracle/scen.py`: name, frame count, button script,
   compared columns, first-divergence-per-column report, and the **lag census
   (irq6>1 count, gated==0 count, spin-iteration histogram) in the standard
   output of every scenario** - not optional.
5. **Close the wave-0 open items:** (a) RTC - find every 68k read of
   `$C00000-$C0000D` during a scenario, and either prove none happens or pin
   the device; re-run the determinism gate across a system-clock date change.
   (b) Savestate seed at the game's own sample point so `$80FA84` agrees, or
   tag it as a known artifact in the state vector. (c) Pixel layer - dump one
   gameplay frame to PNG, look at it, then make `PROBE_PIXELS` dense enough to
   catch a missing sprite layer. (d) Optimise the digest loop toward a
   10,000-frame scenario in ≤5 minutes. (e) `-drc` vs `-nodrc`: run once,
   diff, record.
6. **Make determinism a GATE, red-validated:** the standard boot→stage-1
   VERSION-B scenario runs twice and fails on any digest difference; deliberately
   pointing it at MAME's default cfg directory must make it fail (record both
   outcomes in the commit message, per `docs/knowledge/03`).

**Done when:** `pgm.py gate` exists, runs boot→stage-1 on VERSION-B twice,
prints IDENTICAL, has been seen RED under the deliberate cfg breakage, the
pixel snapshot of stage 1 has been looked at by a human or read as an image,
and the landmark table + seeded-NVRAM procedure are committed.

### Wave 2 - the measurements that decide the architecture  (role: recon, oracle-assisted)

All on VERSION-B, all through the wave-1 harness. This wave writes no port
code; it exists so waves 4–5 cannot bake in a wrong answer.

1. **Locate the top-level object driver** (walk back from the sprite emitters
   `$23D6B4`/`$23D680` and the write map's hot pages `$803900-$803EFF`,
   `$80AF00-$80B1FF`); recover stride, slot count, allocator; put a fetch tap
   on the per-slot instruction and add **object-slots-processed (count AND
   order)** to the state vector. This is `docs/knowledge/06`'s (C) detector and
   the field it says cannot be retrofitted.
2. **Force an overrun and characterise it.** Script into stage 2 / a boss, or
   inject artificial load; record loop-iters/video-frame, the interrupted-PC
   set on the overrun frame, whether `$80390A/$80390E` fall behind, whether the
   ISR gate fires, and the slots-processed field. This is the ground truth the
   slowdown model fits.
3. **Sprite-list cap:** drive (or poke) the list toward 256 live entries and
   record what the game does - drop newest, drop oldest, stop spawning. The
   corpus peak is 95/256; the brief says allocation-failure behaviour is
   gameplay. (This is exactly the shape of the enemy-bullets error: our never
   reaching the cap says nothing.)
4. **Phase order within one frame:** hook IRQ6/IRQ4 dispatch plus the seven
   main-loop calls and emit the order input/player/objects/sprite-build/DMA -
   this fixes THE sample point semantics for all port comparisons.
5. **Player facts on VERSION-B, both ship types:** re-run `pgm_track`/
   `pgm_writers` for position, mover PCs, speeds per held button, clamps; name
   the button map (which of B1/B2/B3 is shot/laser/bomb - cheap: hold each,
   snapshot, read the sprite list).
6. **The hitbox, by intervention:** write-tap the lives/death state to find the
   player-hit routine, read the collision constants from the listing around it,
   then confirm by stepping a bullet across a pinned ship in 1/64-px steps.
   Measure the SAME constants in VERSION-A for the pair - the two-build
   cartridge is a controlled experiment for the owner's smaller-hitbox claim.
7. **The rank byte:** read tap on the build-B rank string pointer table
   (`$25C042`) with CURPC attribution → the indexing site → the RAM home →
   xref its readers. Then one long play through `ramsnap`/`ranklook` for a
   dynamic-rank candidate; if found, poke it and watch fire density.
8. **Protection cross-check:** same scripted attract/demo on `ddpdojp` vs
   `ddpdojblk` VERSION-A, per-frame RAM digests, report first divergence and
   classify (build difference vs protection-sim artifact).

**Done when:** each of the eight questions has a worklog entry that is either a
measured answer (command + output) or an explicit BLOCKED with what was tried;
`object slots processed` is a compared column in `scenarios.json`; and the
overrun run exists as a permanent scenario. Items 1, 2 and 4 are hard
prerequisites for wave 5; the wave is not done while any of those three is
open. If the object driver cannot be located, wave 5 does NOT start - say so
rather than guessing.

### Wave 3 - asset export with teeth  (role: impl/tooling; parallel with wave 2)

The decoder is proven bit-exact; wave 3 turns it into an exporter and a gate.

1. **`gfxgate.py` becomes a gate stage:** one command runs MAME with a scripted
   input, dumps ≥12 frame pairs spread over boot + stage 1 (VERSION-B), runs
   the decode diff, FAILS (not skips) if any pair is not 100.0000 % or fewer
   than N pairs were produced. Red-validate with one of the known mutations.
2. **Zoom coverage:** poke the sprite buffer to force all 16 zoom-table entries
   × grow/shrink × both axes × flips; red-validate by breaking the zoom loop.
   (Today's corpus covers entries 1 and 0xa - presence, not coverage.)
3. **Export + manifest:** TX tiles, BG tiles, palettes, and the sprite policy
   decided consciously: **harvest every `offs` the game uses across the
   scenario corpus** (measurement) rather than statically walking the mask ROM
   (a guess); the manifest records which. Integrity checker re-reads the ROMs
   at raw file offsets, deliberately NOT through `pgmgfx.py`'s helpers
   (`docs/knowledge/03`, two-sides rule). All output under gitignored
   `games/ddpdoj/rip/assets/`.
4. **Sound map to the point of identification** (needed before any audio is in
   scope, and cheap now): tap `0xC10000-0xC1FFFF` writes, correlate with the
   doorbell at `$18AD7E`, produce the mailbox→keyon table; locate the uploaded
   Z80 program blob inside the 68k ROM; log ICS register writes in order to
   resolve the 17 end≤start samples. Audio PLAYBACK stays out of the slice
   (§6) - this unit only secures the map while the tooling is warm.
5. **`bg_scale` watch:** a standing tap on `0xB04000` in every scenario; if the
   game ever writes ≠0x210, escalate loudly (MAME does not implement the
   feature - the oracle would be wrong, not the port).

**Done when:** the gfx gate is wired into the ddpdoj check runner and has been
seen red; the manifest + integrity checker pass on a fresh extraction from the
ROMs; zoom coverage table complete; the sprite-harvest corpus policy is
written in the manifest.

### Wave 4 - skeleton + the player: "fly around"  (role: impl)

First port code. JS architecture mirrors the measured frame structure of build
B - and carries the slowdown scaffolding from commit one (§5):

- the seven-call main loop shape; frame counters advanced per loop iteration;
  the 2-vblank divider expressed; the ISR model with its overrun gate; input
  mirrors (`$803970+`) with edge/previous derivation; the state vector emitting
  the same columns the oracle traces.
- the object driver EXISTS as a table walked in original order with a work
  budget hook (one constant, may be set to "never triggers" until calibrated),
  even if the only object in it is the player. `docs/knowledge/06` rule 3.
- the player: position/mover/clamp/speeds ported from wave 2's VERSION-B
  numbers, including move-past-then-clamp order and per-button speed modes;
  options following.

**REPLAY DETERMINISM IS AN ARCHITECTURAL REQUIREMENT OF THIS WAVE.** Added by
the owner after this plan was written: the finished port must replay a recorded
game with 100% accuracy. **Read `games/ddpdoj/NOTES-replay.md` before writing the
skeleton.** Nothing has to be *built* here - a replay is just (initial state +
one input word per logic frame), which is what the oracle scenarios already are
- but four things must not be destroyed, and retrofitting any of them means
rewriting the driver:

1. No host clock, `Date.now()`, `performance.now()` or host frame rate reaches
   game logic. The host decides WHEN a frame is shown, never WHAT is in it.
2. No `Math.random()`. Port the board's RNG with its state in the state vector.
3. Input is sampled once per **logic** frame at the board's own sample point
   (lead ZERO, measured). Replays are indexed by logic frames, not video frames.
4. **The work budget is COUNTED, NOT TIMED.** This is the one that will actually
   bite. Deriving slowdown from how long the host took makes every replay
   machine-dependent and the simulation irreproducible against itself. The
   budget must be a deterministic function of the game's own state, with the
   calibration constant fixed in the build and never sampled from the host.
   `NOTES-slowdown-oracle.md` already argues for that shape for a different
   reason; two independent reasons for one design is usually a sign it is right.

Consequence to accept: if the port ever slows because the HOST is struggling,
that shows up as dropped presentation, never as a change to the simulation.

**Done when:** a `fly-around` scenario (≥2,000 logic frames from the seeded
VERSION-B boot, scripted stick in all four directions + wall pins + each speed
mode, both ship types if wave 2 measured both) compares **0 divergent frames**
between port and oracle on: player position words, option positions, input
mirrors, `$80390A`, videoFrame/logicFrame, and the player's sprite-list
entries. Red-validate by breaking the clamp order and watching the scenario
fail. Misses (wall pins) are as load-bearing as moves.

**AND** the same scenario, run twice from the same inputs in the same process
and in two separate processes, produces byte-identical state digests. That is
the replay property, tested at the point it is cheapest to keep.

### Wave 5 - enemies and the three weapons  (role: impl; hard-gated on wave 2 items 1/2/4)

The opening of stage 1 only - the scripted spawn table as far as the slice's
frame horizon (pick the horizon from the corpus, cover it proportionally, per
`docs/knowledge/03`). Enemy movement + spawn timing; shot, laser and bomb (the
owner's "all the kinds of weapons"), the kill chain for the enemies in the
window; the object table driven through the budget-carrying driver from wave 4;
allocation behaviour implemented from wave 2 item 3's measurement (or a loud
named throw carrying the ROM address if the cap case was BLOCKED -
`docs/knowledge/08`'s rule, never a plausible guess).

**Done when:** scenarios `stage1-open-shot`, `stage1-open-laser`,
`stage1-open-bomb` (each ≥1,800 logic frames, each actually firing, connecting
AND missing) compare **0 divergent frames** on: full sprite-list digest, object
slots processed, player block, score/chain words identified in wave 2, lag
census columns. Any knownLag-style annotation is tagged and visible, never a
trimmed scenario. Red-validate one scenario by deleting an enemy's update and
watching it go red.

### Wave 6 - the pixel slice  (role: impl)

Wire the wave-3 decoder into the port's renderer (it is already bit-exact
against MAME's framebuffer from dumped state, so this is integration, not
research): tilemaps, rowscroll, sprites with zoom, palette, priority, the
two sample-point offsets honoured.

**Done when:** for the wave-4 and wave-5 scenarios, sampled framebuffers
(every N frames, N chosen to cover transitions, plus every frame of one dense
stretch) are **pixel-identical** to MAME's, including at least one
palette-fade frame and one ≥90-sprite frame; and the whole slice - seeded
boot → flying → shooting all three weapons - runs interactively in the
browser at 59.185606 Hz cadence. That last item is the owner demo; the pixel
comparisons are what make it true rather than truthy.

## 5. What slowdown and rank do to the ARCHITECTURE - read before writing port code

**Slowdown.** The measured architecture is (B)-shaped - the main loop runs its
work unconditionally and starts late if it overran - **with an (A)-style gate
inside the IRQ6 handler** (four ISR subroutines skipped on overrun while the
input read still runs), and **(C) is UNMEASURED because no overrun was ever
forced**. `docs/knowledge/06` is explicit that (C) - a truncated per-object
loop - changes WHICH things happen, not just when, and **cannot be
retrofitted**. Therefore, loudly:

> **The object driver carries a work budget from day one - wave 4, first
> commit - whether or not wave 2 finds (C).** The budget lives in ONE
> calibration constant. The table is walked in the original order, because
> under (C) the order becomes semantics. If wave 2 proves the game never
> truncates, the budget simply never triggers and cost us nothing; if it does
> truncate and the driver was built flat, the driver gets rewritten.

The rest of the slowdown contract, all measured facts with architectural
consequences:

- The game's counters advance per loop iteration and feed back into the frame
  sync - so the port's dilation must delay the whole iteration (counters
  included), never skip-and-catch-up, and never a `gameSpeed` multiplier.
- The ISR gate means the port's "frame overran" path must still read input and
  still run the ungated ISR work - a dropped frame is not uniform.
- The 2-vblank divider is a scheduled 29.6 Hz mode, not slowdown; the port
  expresses it as scheduling, and the oracle's lag census columns distinguish
  the two so a divider frame is never diagnosed as an overrun.
- `videoFrame` and `logicFrame` are separate compared fields everywhere; the
  spin-iteration meter's analogue in the port is the modelled per-frame work
  sum against the 337,920-cycle budget.
- **Every slowdown magnitude number is labelled "MAME-timed, uncalibrated."**
  MAME is not authoritative for this board's timing (owner statement +
  `docs/knowledge/06`). Mechanism is measurable now; magnitude waits for the
  scroll-clock calibration against real-board video with verified provenance -
  deliberately out of the slice.

**Rank.** Rank is a feedback loop and an amplifier: one wrong value can make
the first divergence in every field simultaneous (`docs/knowledge/08`). We know
the operator setting has four values and nothing else. Consequences:

- Wave 2 must find the rank RAM home and its reader set BEFORE wave 5 ports
  any enemy behaviour that could read it; readers are enumerated from the
  listing (absence claims), confirmed by measurement (presence claims).
- If a dynamic rank exists, it goes into the state vector as a compared field
  immediately, and the corpus must VARY it deliberately (poke on both sides at
  the same instant) - a corpus that never leaves boot-rank tests one value
  while appearing to cover the code. Coverage reports must say which rank
  values were exercised.
- The loop counter is the same trap wearing a different hat: the slice is
  stage 1, loop 1, and the plan says so out loud rather than implying more.

## 6. Deliberately EXCLUDED from the slice - so silence is never read as coverage

Each exclusion names what is missing and why. None of these is "covered".

1. **Stages beyond the opening of stage 1; bosses; loop 2; second player.**
   Depth over length, per the owner. The loop-2 entry conditions and the loop
   counter are untested by every scenario in the corpus (§5).
2. **Audio playback.** The sound MAP is wave 3 (mailbox, Z80 blob, sample
   manifest) because it is cheap while the tooling is warm, but the slice ships
   silent: the Z80 driver is an uploaded program with no static disassembly
   target yet, and music/SFX cannot even be IDENTIFIED until the mailbox is
   tapped. Excluded for scope, not because it is done.
3. **Slowdown MAGNITUDE calibration.** Requires real-hardware provenance
   (scroll-clock method); every slice number is MAME-timed, uncalibrated, and
   the budget constant ships uncalibrated by design. Mechanism is IN scope
   (waves 2/4/5).
4. **VERSION-A and TYPE-B beyond what wave 2 measures.** VERSION-A is kept as
   a free second implementation for cross-checking readings, not ported. If
   wave 2 only characterises TYPE-A fully, the ship-select offers what is
   verified and says so.
5. **Dynamic-rank behavioural coverage.** Wave 2 locates the byte and readers;
   scenarios forcing all four operator ranks plus any dynamic values across
   every rank-dependent branch are post-slice. Until then, rank-dependent
   branches that were never reached get loud named throws, not guesses.
6. **The sprite-cap and allocation-failure paths, IF wave 2 cannot reach
   them.** Then the port throws loudly at the cap with the ROM address in the
   message. Never silently "handled".
7. **`ddpdojblkbl`** (2012 KOVSH bootleg conversion): least interesting
   reference, never booted, stays that way.
8. **`bg_scale ≠ 100 %` rendering.** MAME itself does not implement it; we
   watch for writes (wave 3.5) and escalate if one ever appears. Nothing can
   be verified against an oracle that lacks the feature.
9. **Instruction-level timing fidelity of translated routines.** As on every
   port in this repo (`docs/knowledge/02` trap 6) - the budget model is the
   substitute, and the tension between "JS functions per routine" and "faithful
   (B) requires knowing the cost of code we replaced" is real, named, and
   parked in the budget constant.

## 7. Risks - including what could make this infeasible

1. **Scale.** 2.5 MiB of 68000-addressable code+data is 20× Batman's whole
   cartridge; a naive extrapolation says a few hundred thousand JS lines for a
   full port. The slice is designed to be immune to this (it needs the frame
   loop, player, one spawn window, three weapons), but nobody should read the
   slice as proof the FULL game is tractable. This is the honest headline risk
   for anything beyond the slice.
2. **The object/entity model is still unknown** (wave 2 item 1). If the object
   driver resists location or turns out to be diffuse (many co-routines rather
   than one table walk), wave 5's cost estimate is wrong and the plan says
   wave 5 does not start until it is settled. This is the likeliest schedule
   risk inside the slice itself.
3. **MAME's timing is not the board's.** Slowdown is a gameplay mechanic here;
   the port can be state-exact and still feel wrong. Mitigated (not solved) by
   the one-constant budget and the scroll-clock calibration path; a port whose
   slowdown is uncalibrated must say so on the tin.
4. **The protection simulation.** Five simulated ASIC commands stand in for
   undumped silicon. If the `ddpdojp` cross-check (wave 2 item 8) surfaces
   divergence that is not a build difference, every verification inherits an
   asterisk; worst case, some behaviour of the real ASIC is unknowable without
   a dump. Low likelihood (the sim is "confirmed on ddpdoj" per MAME), high
   consequence, and the check is cheap.
5. **Two builds in one cartridge** double every landmark and make "measured on
   the wrong build" a standing failure mode - it already happened in wave 0
   ([O]/[M] are VERSION-A). Mitigation: the wave-1 landmark table is per-build,
   the harness prints which build is live (interrupted-PC range), and every
   worklog number names its build.
6. **Environment drift.** The ROM directory and the tools tree were edited by
   other agents DURING wave 0; archives were renamed mid-session. Mitigation:
   the wave-1 machine pin (region hash printed every run) and re-verification
   before trusting any cross-session number.
7. **RTC / long-horizon determinism** (wave 1 item 5a). If runs drift across
   days, every scenario becomes flaky in a way that looks like port bugs.
   Currently the single unresolved threat to the corpus's foundation.
8. **Rank/chain as divergence amplifiers.** A one-byte error can make every
   field diverge at once and point the first-divergence report at a symptom.
   Mitigation: find the byte early (wave 2), compare it directly, and never
   diagnose a mass divergence before checking rank and the lag census.
9. **Sprite assets cannot be enumerated statically.** The harvest policy means
   the atlas only provably contains what the corpus displayed; late-content
   sprites are absent until scenarios reach them. Stated in the manifest;
   the integrity checker bounds what IS there.

## 8. Verdict

**The vertical slice is reachable.** The oracle is running, deterministic, and
sample-point-correct today; the graphics decode is already bit-exact with a
red-validated gate; the player's arithmetic is measured to the 1/64-pixel on
build A and the method to re-derive it on build B is proven and cheap; input
lead is zero; savestate seeding works to within one understood byte. The two
genuinely open structural questions - the object driver's shape and the
overload mechanism - are exactly what wave 2 exists to answer BEFORE they can
poison port code, and the architecture carries the one piece
(`docs/knowledge/06` says) that could not be added later: the work budget.
What the slice will NOT prove is that the full game is tractable (risk 1) or
that the slowdown FEELS right on real-board terms (risk 3) - both are named,
bounded, and deliberately outside.
