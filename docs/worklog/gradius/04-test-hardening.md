# Wave 4 test hardening: the $1B ladder, the stage intro, pause
status: DONE
wave: 4   role: test   started: 2026-07-29

## The task, as I understood it

Wave 4's implementer shipped `1c699fe` GREEN. The reviewer and QA between them
found a set of parameters that NOTHING in the repo interrogates -- checks that
are green over a value the corpus holds at zero, and one arithmetic term whose
own dedicated unit test does not hold it. I write tests only. Every test I add
must be SEEN RED against a named mutation of `games/gradius/src/`, and the file
restored byte-identical (sha256 before/after).

## What I did

1. Read `docs/worklog/README.md` in full, `docs/knowledge/02` and `03`.
2. Measured the baseline myself before touching anything:
   `node --test games/gradius/tests/` -> 168 pass, 0 fail, 0 skipped (157 was
   the implementer's number; a previous, killed run of this same agent had
   already left `tests/flow-unwitnessed.test.js` in the tree, untracked, with
   11 tests and an EMPTY worklog -- so none of them had been seen red. I
   re-derived every one of them from scratch rather than trusting them.)
3. Disassembled the cartridge myself at every address the new tests pin
   (`Gradius (USA).nes`, file offset `16 + addr - $8000`).
4. Built a mutation rig on a sandbox copy (`scratchpad/t4`) with `assets/` and
   `tools/oracle/out/` as NTFS junctions to the repo's, so no ROM-derived byte
   is duplicated and the repo's `src/` is never edited.
5. Ran **35 source-level mutations through the unit suite** and **8 through the
   whole 21-scenario comparison**. Table below.
6. Strengthened one of the 11 inherited tests (its stub byte could not tell
   `AND #$F0` from `AND #$E0`), and added two tests and one `knownFail`.
7. **Extended the corpus**: the $0700 queue is compared as an IMAGE now, not
   as a length. Re-recorded all 21 scenarios from the cartridge myself.
8. Fixed two measured numbers in `scenarios.json` that disagree with the
   cartridge recording (rule 6).
9. Ran the whole gate.

## What I MEASURED

### 0. The trap I fell into first, because it is the most useful thing here

My first battery run was killed by a 2-minute tool timeout **mid-mutation**,
leaving `+ 9` applied to the sandbox's `flow.js`. The next run then snapshotted
that as "pristine", so every row of the table carried one extra red test and
one anchor silently vanished (`ANCHOR COUNT 0`). The rig now **verifies the
sandbox against the repo before it snapshots** and aborts if they differ. If
your mutation table has a test that reddens on *every* mutation, that is what
it looks like.

It also produced an accidental positive control: the stray `+ 9` was caught, on
every one of the 25 runs it survived into, by exactly one test -- the one
written for it.

### 1. The mutation table -- 35 breaks, ALL RED

Rig: `scratchpad/t4rig.py` + `t4muts.json` / `t4muts2.json`, on
`scratchpad/t4` (a copy of `games/gradius`; `assets/` and `tools/oracle/out/`
junctioned). Every mutation asserts its anchor appears **exactly once** before
writing; every file is **sha256-verified restored** after. Sandbox baseline is
5 pre-existing failures (`page-wiring.test.js`'s DOM tests, which resolve a
dynamic import against the scratch path) and every row below is the set
DIFFERENCE against that baseline. `git status --porcelain games/gradius/src/`
is empty and `sha256 flow.js` is unchanged.

New tests are marked **bold**; the rest are wave 4's own, re-validated.

| # | mutation | site | test(s) that went RED |
|---|---|---|---|
| M31 | `($3F >> 1)` -> `$3F` | flow.js introReset | **$9B8E: the checkpoint enters the index SHIFTED** |
| M31b | `>> 1` -> `>> 2` | introReset | **$9B8E** + $9B3E puts the ship where the cartridge put it |
| M31c | `$9BCC,Y` base dropped | introReset | **$9B8E** + $9B3E puts the ship... |
| M31d | the `+ ($3F>>1)` term dropped | introReset | **$9B8E** + $9B3E puts the ship... |
| M33 | `AND #$F0` -> `#$F8` | introReset | **$9B95 AND #$F0: four bits** |
| M33b | `AND #$F0` -> `#$E0` | introReset | **$9B95** + **$9B8E** |
| M33c | the `AND #$F0` / `ASL x4` pair swapped | introReset | **$9B95** + **$9B8E** + 2 more |
| M14 | `$9B66 STA $42` dropped | introReset | **$9B62-$9B74: four restores** |
| M15 | `$9B74 STA $1A` dropped | introReset | **$9B62-$9B74** |
| M15b | `$9B70 STA $19` dropped | introReset | **$9B62-$9B74** + 3 more |
| M15c | `$9B6C STA $55` dropped | introReset | **$9B62-$9B74** + 2 more |
| M16 | all four restores read index 0, ignoring $18 | introReset | **$9B62-$9B74** |
| M17 | the $3D-$97 clear moved AFTER the restores | introReset | **$9B62-$9B74** + 2 more |
| M48 | `state.ring.cursor = 0` dropped | introReset | **$9B47: the ring cursor at $0160** |
| M48b | `animFrame.fill(0)` dropped | introReset | **$9B47** + $9B3E wipes the power-ups |
| M52 | `$883B STA $0E` dropped | fullScreenLoad | **$883B STA $0E: $882C zeroes the cursor** |
| M52b | `$883F STA $1F` dropped | fullScreenLoad | **$883B** + $882C leaves $0E/$1F/$12/$13 zeroed |
| M52c | `$8841 STA $13` dropped | fullScreenLoad | **$883B** + $882C leaves... |
| M42 | `$11 = $1E` -> `$18` | introReset | **$9B7B/$9B7F: the ROM's own literals** + bootState cross-check |
| M42b | `$10 = $A8` -> `$A9` | introReset | **$9B7B/$9B7F** + bootState cross-check |
| M42c | $9B7B/$9B7F moved BEFORE `$882C` | introReset | **$9B7B/$9B7F** + bootState cross-check |
| M37 | `$3B,X & $80` -> `$3B,X === 0` | resumeCheck | **$9B01 BMI: $3B,X is a COUNT** |
| M1 | $9C12's three producers reordered | introHud | **$9C12: the queue IMAGE, in the ROM's order** |
| M1b | `$9C15` (TOP score) dropped | introHud | **$9C12** + the intro queues 1,49,37,40,149 |
| M2 | $9BFD/$9C02 canned packets swapped | introPackets | **$9BF0: packet $10, then $19+8, then 7, then 5** |
| M23 | `$19 + 8` -> `$19 + 9` | introPackets | **$9BF0** |
| M23b | `$19 + 8` -> `8` (the stage byte dropped) | introPackets | **$9BF0** |
| M24 | canned packet `$10` -> `$11` | introPackets | **$9BF0** + **introPackets() is $9BF0 alone** + $0E |
| M25 | $9BED given a packet of its own | introPackets | **$9BF0** + **introPackets() is $9BF0 alone** + $0E |
| M26 | `$9C07 INC $1B` -> `+ 2` | introPackets | 6 tests incl. **$9C12** and **introPackets() is $9BF0 alone** |
| M57 | the $57 test -> a FAITHFUL 23-frame counter | introTerrain | **$9C28: the length is a STAIRCASE** + the intro is $9C24 looping on $57 |
| M57b | three `$9D8E` a frame instead of four | introTerrain | **$9C28 STAIRCASE** + 2 more |
| M57c | $57 tested at the BOTTOM (exit on the throttled frame) | introTerrain | **$9C28 STAIRCASE** + the intro is $9C24 looping |
| FIX-9C09 | `state.build.ahead = 0` ADDED at $9C07 | introPackets | **[knownFail] $9BF0 falls through into sub_9C09** (SURPRISE PASS) |
| FIX-bandB | `state.bandB.ran = false` ADDED to introStep | introStep | [knownFail] an intro frame does not inherit the split (SURPRISE PASS) |

The last two are the reverse direction: they FIX the port, and a `knownFail`
whose assertions start passing FAILS with `SURPRISE PASS`. That is how a
`knownFail` is red-validated, and both of this file's are.

### 2. The corpus extension: the $0700 queue as an IMAGE

QA finding 3, measured again by me and then closed. Before this commit the
watch list had 57 addresses in page 7 and **not one below $07A0** -- the queue's
149 bytes were compared by `$0E`, their LENGTH, and nothing else. Now
`$0700-$074F` (80 bytes) is watched, `porttrace.mjs` `peek()` resolves it to
`state.vram.q` and `seedFromRam()` seeds the same range from the cartridge's
own RAM at the align frame (the page is not rebuilt each frame -- a frame whose
$0E is 1 leaves the last frame's bytes sitting behind the cursor).

Re-recorded all 21 scenarios from `Gradius (USA).nes` myself:

```
$ python games/gradius/tools/oracle/scen.py
=== ORACLE CORPUS: 21 scenarios, align frame 400, 446 watched addresses ===
  intro-boot     640 frames  lag=1 [283] ...   (21 scenarios, all recorded)
```

366 -> **446 watched addresses**; every scenario's TIER 1 field count went
**396 -> 476**, i.e. 80 x 5726 = **458,080 new byte comparisons, all exact**.
The port's queue image agrees with the cartridge on every compared frame of
every scenario. That is a result, not a formality: it is the first time
anything in this project has compared what the port WRITES to VRAM rather than
how much of it there is.

And it has teeth. The three mutations QA measured green on all 21 scenarios,
re-run by me through `compare.mjs` on the sandbox:

| mutation | before (QA, wave 4) | after (me, this commit) |
|---|---|---|
| M1  $9C12's producers reordered | 0 failures | **36 TIER 1 fields, intro-boot + intro-respawn** |
| M2  $9BFD/$9C02 swapped | 0 failures | **40 fields, both intros** |
| M23 `$19 + 8` -> `+ 9` | 0 failures | **12 fields, both intros** |
| M24 canned $10 -> $11 | (not run) | **91 fields, both intros** |
| M25 $9BED emits a packet | (not run) | **100 fields, both intros** |

### 3. Breaks that STILL pass the corpus, and why -- the honest half

The same runner, same 21 scenarios, on mutations the new watch list does NOT
help:

```
M31-lsr-dropped      failures=0
M33-mask-F8          failures=0
M14-drop-42-restore  failures=0
```

Diagnosed rather than guessed: `$24` (the checkpoint) reads **0 on 100% of the
5726 compared frames**, so `$3F >> 1` and `$3F` are the same number; `$9BD4`
has no byte with bit 3 set, so `AND #$F0` and `AND #$F8` are the same function
on every input the cartridge can supply; and `$22` reads 0 everywhere, so the
restore puts back the zero the clear just wrote. **These are not fixable by
watching more addresses.** They need a scenario that enters an intro with a
non-zero `$24`, and the only thing that writes `$24,X` is `$97A5`, inside wave
5's `$979D`. Until then they are held by unit tests over values the ROM's own
code produces, and that is stated at each test rather than left implied.

### 4. Two measured numbers that were wrong, both fixed here

`scenarios.json` said the intro's `$0E` reads "149 for twenty-two frames".
MEASURED by me straight out of the cartridge recordings:

```
intro-boot:     $0E = 149 on frames 287..307   -> 21 frames  (308 = 1, 309 = 1)
intro-respawn:  $0E = 149 on frames 618..638   -> 21 frames  (639 = 1, 640 = 1)
```

Frame 308/639 is the frame all four `$9D8E` calls are throttled (`$57` 0 -> 1)
and 309/640 is the exit. Both `why` strings are corrected in this commit.

**The same off-by-one is still in `src/flow.js`** (`MEASURED $0E = 149 on
frames 287-308 and 618-639`, twice) and in the implementer's worklog. I am the
test writer and do not edit `src/`; it is one comment and it belongs to
whoever next writes that file. Wave 5: please fix it in your first commit.

### 5. The gate

Run by me, after every mutation was restored:

```
$ node --test games/gradius/tests/
# tests 170
# pass 170
# fail 0
# cancelled 0
# skipped 0
# todo 0

$ node games/gradius/tools/test-all.mjs
  21 scenarios, 5726 of 6569 frames compared (6 truncated: right-wall@493,
  diag-rd-lu@533, diag-ru-ld@445, lr-both@482, speed6-right@515,
  speed3-diag@529), 0 failures, 0 clamps uncovered, 0 stale annotations,
  6 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins).
  [PASS] port vs cartridge (compare.mjs)

  neuter lead1          -> RED, 179 TIER 1 failures (good)
  neuter seed-x+1       -> RED, 116 TIER 1 failures (good)
  neuter laginject=450  -> RED, 589 TIER 1 failures (good)
  [PASS] self-check: the comparison goes red when the port is broken

  PASS  inputs
  PASS  unit tests (node --test games/gradius/tests/)
  PASS  assets == the cartridge (verify_assets.py --self-test)
  PASS  port trace shape == probe.lua state vector
  PASS  port vs cartridge (compare.mjs)
  PASS  self-check: the comparison goes red when the port is broken

  GREEN -- 6 passed, 0 failed, 0 SKIPPED
```

The 6 SKIPPED are FIELDS, each printed with its reason ("no port counterpart");
**0 STAGES skipped**, and the field set is unchanged from wave 4's. Note
`laginject=450` moved 467 -> **589** TIER 1 failures: the self-check that
proves the comparison can go red got 26% more teeth from the same extension.

`git diff --cached --name-only` before committing, read (rule 2):

```
docs/worklog/gradius/03-qa-adversarial.md
docs/worklog/gradius/03-review-fidelity.md
docs/worklog/gradius/04-qa-adversarial.md
docs/worklog/gradius/04-review-fidelity.md
docs/worklog/gradius/04-test-hardening.md
games/gradius/tests/flow-unwitnessed.test.js
games/gradius/tools/oracle/porttrace.mjs
games/gradius/tools/oracle/scenarios.json
```

Four of those are not mine: the wave-3 and wave-4 reviewer and QA worklogs,
`status: DONE`, orphaned in the tree since wave 3 because each of those runs
ended without committing. They are plain markdown, I read them, they contain
the evidence this commit acts on, and losing them is exactly what
`docs/worklog/README.md` exists to prevent. `09-DECIDED-seed-anywhere.md`
appeared in the tree WHILE I was working -- another agent is live in it -- and
is deliberately NOT staged.

## What I could not do, and why

* **The three inert parameters above.** No watch list reaches them. Named, with
  the measurement, at the test and here.
* **`$8871`'s 2304 nametable writes are still not drawn** and the corpus still
  cannot see it -- the rows carry no nametable. The $0700 extension compares
  what the port PUTS IN THE QUEUE, which is the closest thing to a picture
  check this port has ever had, but it is not one. docs/knowledge/02 trap 2.
* **The 4th terrain block of an intro frame** is past the watched 80-byte
  prefix. Stated in `scenarios.json` rather than left to be discovered.
* **`$5E`** cannot be pinned: the port has no field for it, and the ROM has two
  writers and zero readers. The `knownFail` pins its sibling store (`$57`) and
  names `$5E` in the diagnosis.

## What I RULED OUT

* **That the 11 inherited tests were decoration.** All 11 appear in the table,
  each against at least one mutation of the exact line its `RED WHEN` names.
  One of them was HALF decoration -- `$9B95 AND #$F0`'s stub byte was `$6D`,
  and `$6D & $E0 == $6D & $F0`, so the test could not see the other wrong mask
  its own comment claimed. Changed to `$7D`; M33b now reddens it.
* **That the $0700 extension breaks anything.** 21/21 PASS, 5726 frames, the
  same 6 truncations and the same 6 field-level skips as before.
* **That the port's queue diverges anywhere.** 458,080 new byte comparisons,
  zero divergent.
* **That I touched `src/`.** The rig hashes every file before and after each of
  the 43 mutations and aborts on a mismatch; `git status --porcelain
  games/gradius/src/` is empty.

## If someone picks this up cold

* The new tests are in `games/gradius/tests/flow-unwitnessed.test.js` (13:
  eleven inherited-and-revalidated, two new, of which one `knownFail`).
  Every test carries a `RED WHEN:` line naming the mutation. If you change one
  of those lines and the test still passes, the test has rotted.
* The rig is `scratchpad/t4rig.py` (units) and `t4cmp.py` (the 21-scenario
  comparison), driven by `t4muts.json` / `t4muts2.json`. It asserts anchors,
  subtracts the sandbox baseline, verifies the sandbox against the repo BEFORE
  snapshotting, and hashes after restoring. Reuse it; do not mutate the repo.
* **Two `knownFail`s are waiting for wave 5**, both with the cartridge frames
  in their diagnosis: `$9BF0`'s fall-through into `sub_9C09` (`$57 := 0`,
  live via `$97EB JSR $9C09` and `$980B JMP $9C09`) and the intro inheriting
  the previous play frame's raster split (`bandB.ran`). Both retire themselves
  with a `SURPRISE PASS` the moment the port is fixed.
* The next thing worth doing here, in value order: (a) a scenario that enters
  an intro with a non-zero `$24` -- it needs `$979D`, and it closes M31/M33/M14
  at a stroke; (b) a pixel layer.
