# MIXUP — complete handover

**Read this whole file before touching anything.** It is the only document that
covers all three games, the method, the tooling, the traps, and where every
artifact lives. Everything else is detail hanging off it.

---

## 1. WHAT THIS PROJECT IS

**Hand-translating console games from their disassembly into readable
JavaScript, verified frame-by-frame against the real ROM running in an
emulator.** It is *not* emulation. There is no CPU interpreter. Every routine is
read out of the original machine code and rewritten as JS that cites the ROM
address it came from.

**The long-term goal is multiple ported games that can be COMBINED** — Batman
playable inside Gradius, the Vic Viper playable in Batman. That is why each game
lives in its own directory behind a registry, and why the launcher picks a game
before it picks anything else.

**The port's value is not that it runs.** It is that a second person can check
any line against the original listing without re-deriving it. Comments carrying
ROM addresses and measured numbers are the primary asset, not decoration.

---

## 2. THE THREE GAMES, AND WHERE THEY STAND

| game | machine | state |
|---|---|---|
| **Batman: Return of the Joker** | Game Boy, Sunsoft 1992 | **COMPLETE** |
| **Gradius** | NES, Konami 1986 | stage 1, partial |
| **DoDonPachi DaiOuJou** | IGS PGM arcade, 2002 | early, moving fast |

### Batman — done
27/27 gate stages, 0 skipped · 50/50 oracle scenarios bit-exact over 14,519
frames · 96.023 % mean pixel match (66,894 wrong px over 73 frames) · 740 unit
tests. Deliberate non-fixes: the water dither (photosensitivity — a considered
deviation, documented) and a parallax feeder race (measured both ways; keeping
the lookahead costs 6,288 bad scanlines, dropping it 8,112).

### Gradius — the numbers that matter
*Re-measured 2026-08-04 (W38). The list below stood for roughly ten waves after
it stopped being true; every figure here was printed by the named tool on the
day it was written, and the ones this project has been wrong about are the ones
nobody re-ran.*
- **ALL SEVEN STAGES PLAY, AND THE GAME ENDS AND LOOPS.**
- `$AE1C` enemy dispatch: **41 of 42 entries**, 33 of 34 distinct routines
  (`tools/census.py`). The one left is entry 27 `$B4F2`, type `$1B`, which no
  wave record in any of the seven stages references
- wave records that spawn a ported handler: **598 of 598**, all seven stages
  ADMITTED (`tools/oracle/stageledger.py`), including all 49 five-byte inline
  records (`cmd >= $F0`, the stride-changing route)
- play sub-states (`$982F`): **16 of 16** — the boss, the end-of-stage machine
  and the end-of-game chain are all in
- `$C439` late spawner: **7 of 7**
- **`$1A` is no longer pinned**: `$9872`'s `INC $28,X` runs, the game wraps to
  loop 2, and all 9 `$1A` sites are ported. Measured: loops 2, 3 and 6 sweep
  frame-for-frame identically, because every gameplay reader of `$1A` has three
  tiers (0 / 1 / >= 2) — so difficulty tops out at loop 3, not at the ending
  table's 7
- game modes (`$80D4`): **1 of 7**, and the miss is LOUD as of W28b. This is
  now the largest single gap: no title, no attract, no game over, no continue,
  no high-score entry
- **`$9751` is the crash a real player reaches**: running out of lives restarts
  to mode 0, which is not ported. A passive loop-2 sweep hits it on 31 of 110
  chunk runs

Gate: `node games/gradius/tools/test-all.mjs` → GREEN, 12 stages, 0 skipped.
643 unit tests. 47 scenarios / 29,657 frames, 0 divergent — **and 6 FIELDS are
skipped inside that run** (pad2 oamBudget spriteOverflow scanline cpuCycle
splitSpins), which the gate's own summary line does not say.
**No cartridge comparison exists for stages 2-7 or for the ending chain**; every
number for those is port-vs-listing.

### DaiOuJou — the numbers that matter
- **The whole stage-1 background scrolls live** from the game's own scroll
  program (7-opcode VM, 57 stage-1 records of 186 across ten scripts)
- stage 1 is **7,317 logic frames / 8,486 px** to the boss lock
- the ship, its two option pods, two exhaust records and three ground shadows
  are simulated; **everything else in the picture is still a 161-frame capture**
  that loops (the CAPTURE LEDGER in `games/ddpdoj/PLAN-no-recordings.md` tracks
  what remains)
- aim pair validated on **turret angle, 0 divergent** over 6,000 playing frames
- bullet patterns: **39/39 kinds** compared against an independent ROM parse,
  **9/39** against the live board, 0 divergent over 10,499 spawns
- 307 unit tests

---

## 3. WHERE EVERYTHING IS

### Paths
```
C:\programmieren\batman            THE REPO (this)
C:\programmieren\mixbackup         a full copy, worst-case backup
C:\oldpcsx2                        THE ROMS  (a PCSX2 folder used as a ROM stash)
C:\Users\<you>\AppData\Local\Mixup\mame\mame.exe    MAME 0.288
C:\Users\<you>\AppData\Local\Mixup\mesen\           Mesen 2.1.1
C:\Users\<you>\AppData\Local\Mixup\mame-play\       isolated cfg for HUMAN play
```

### The ROMs — supplied by the owner, NEVER committed
```
C:\programmieren\batman\Batman - Return of the Joker (USA, Europe).gb
C:\programmieren\batman\Gradius (USA).nes
C:\oldpcsx2\ddpdojblk.7z      <-- USE THIS ONE for DaiOuJou
C:\oldpcsx2\ddp3.zip          merged set, all nine clones incl. ddpdojp
C:\oldpcsx2\ddpdoj.zip  ddpdojb.zip
C:\oldpcsx2\ddpdojblk.zip.SHADOWED-bad-nv    renamed aside ON PURPOSE
```
**MAME resolves a set by NAME, not by quality, and does not warn that it ignored
a better archive.** With both `ddpdojblk.zip` and `ddpdojblk.7z` present it takes
the zip and reports `is bad`. That is why the zip is renamed. If Black Label ever
verifies bad again, look for a `.zip` that has crept back beside the `.7z`.

### Generated data — all gitignored, ~1.5 GB, all regenerable
```
games/*/assets/                    extracted art, tables, manifests
rip/                               Batman's dumps + oracle traces (142 MB)
games/ddpdoj/rip/                  decrypted images, dumps, PNGs (415 MB)
games/gradius/tools/oracle/out/    scenario artifacts (749 MB)
games/ddpdoj/tools/oracle/out/     traces (158 MB)
dist/                              the built site
```
**NOTHING ROM-DERIVED IS EVER COMMITTED.** `tools/build-dist.mjs` has a guard
that reads every ROM and refuses to publish any file appearing verbatim inside
one. It inflates `.gz` bodies and checks those too — a 64 KiB slice of mask ROM
gzipped to 96 B once slipped under an earlier threshold.

### Regenerating from scratch
```
python tools/export_assets.py                      Batman
python games/gradius/tools/export_assets.py        Gradius
node  games/ddpdoj/tools/export-web.mjs            DaiOuJou web bundle
python games/gradius/tools/oracle/scen.py          re-record Gradius oracle
```

---

## 4. THE METHOD — read `docs/knowledge/` in full, it is short

| file | what it settles |
|---|---|
| `01-the-oracle-method.md` | run the real ROM, diff per frame, report FIRST divergence |
| `02-traps.md` | the fall-through trap and seven others |
| `03-checks-that-can-fail.md` | how a check passes while the game is broken |
| `04-platform-gameboy.md` | DMG facts, each paired with its NES question |
| `05-process.md` | repo, gate, and multi-agent working rules |
| `06-lag-and-slowdown.md` | THE THREE mechanisms; read before designing a harness |
| `07-clocks-and-framerates.md` | no console runs at 60 Hz |
| `08-rank-and-dynamic-difficulty.md` | when the game watches the player back |
| `09-enumerate-then-validate.md` | **the ROM is the inventory; the oracle is the verdict** |
| `10-coverage-is-branches-not-frames.md` | **the ROM is the source of truth; tests are VERIFICATION** |

### The five rules that matter most

1. **A NUMBER IS NOT A FACT UNTIL IT IS MEASURED.** Never quote a doc as though
   you measured it. A dozen inherited "facts" here have been falsified, several
   by the wave immediately after they were written.

2. **MEASUREMENT PROVES PRESENCE; ONLY THE LISTING PROVES ABSENCE.** Write "I
   could not reach it, here is what I tried" — never "the game does not do
   this". That single slip has produced five separate shipped bugs.

3. **ENUMERATE STATICALLY, THEN VALIDATE DYNAMICALLY.** Read every table and
   dispatch entry out of the ROM and write down the COMPLETE list *before*
   porting. Discovery-by-measurement finds content one crash at a time, and the
   owner found three real bugs by playing that no harness ever saw.

4. **EVERY CHECK MUST BE SEEN TO FAIL.** Break what it guards, watch red,
   restore, verify byte-identical (hash both ways), watch green. **Eight checks
   in this project have been found incapable of failing.** Two of them seeded
   through the very constant they were testing — a test that writes `base+CONST`
   and asserts on something read via the same `CONST` agrees with itself
   whatever `CONST` holds, and has quietly made the PORT its source of truth.

5. **COVERAGE IS BRANCHES AND TABLE ENTRIES, NOT FRAMES.** "14,098 frames, 0
   divergent" says nothing about which branches ran. Report:
   *N of M branches executed and matched; M−N transcribed but unexercised; K
   paths unported and throwing.* Never invent a denominator — one wave reported
   "7 of 8" against a 13-entry map.

### The trap that keeps winning
**THE FALL-THROUGH TRAP — ten incidents.** The label you land on is not where the
routine ends; a `JMP`/`JSR` target with nothing returning to it is a
continuation. Read PAST the apparent end of every routine you port. The most
recent case was found by a reviewer *after* the implementer had written "none is
a quiet return" in its own worklog.

### Unported paths are LOUD NAMED THROWS
Every gap throws with its ROM address. That is why a player's crash report is a
one-line diagnosis instead of a mystery. **A quiet return is a defect in its own
right** — exactly one has been found in each port, both by reviewers, both after
shipping.

---

## 5. HOW TO RUN THINGS

```
# gates
node --test games/batman/tests/                    740 pass
node tools/test-all.mjs                            Batman: ALL GREEN 27/27, 0 skipped
node --test games/gradius/tests/
node games/gradius/tools/test-all.mjs              GREEN, 12 stages, 0 SKIPPED
node --test games/ddpdoj/tests/
python games/ddpdoj/tools/oracle/pgm.py check

# the DaiOuJou oracle — ONE entry point, many commands
python games/ddpdoj/tools/oracle/pgm.py {trace|snap|scen|gate|overrun|objdriver|
        gfx|zoomcov|sprites|sound|flyaround|spritecap|pixslice|demogate|...}

# cross-build alignment (the "Rosetta stone" — see §7)
python games/ddpdoj/tools/rosetta.py

# publish (gates, builds, deploys, CONFIRMS)
node tools/publish.mjs                 all three
node tools/publish.mjs --only gradius
node tools/publish.mjs --dry

# serve locally
python -m http.server 8000     then /  or /games/gradius/  or /games/ddpdoj/
```

**A SKIP IS NOT A PASS.** Read the skip count. "ALL GREEN" with skips is a red
run wearing a green hat, and this project has shipped that mistake.

---

## 6. HOSTING AND THE STACK

**In the browser:** plain ES modules, no framework, no bundler, no build step,
zero runtime dependencies. One `<canvas>`, 2D context, `putImageData` — we
compute every pixel. Assets are binary + JSON via `fetch`, larger ones gzipped
and inflated with `DecompressionStream`. Web Audio for Gradius sound. Pointer
events for touch.

**Dev only:** Node (scripts + its built-in `node --test`), Python (extraction,
driving emulators), Lua (probes *inside* the emulators). TypeScript appears only
as a checker via `// @ts-check` + JSDoc — we never write TypeScript.

**Hosting:** Cloudflare Pages, project `gbtman`, at `https://gbtman.pages.dev`.
Purely static. `tools/build-dist.mjs` assembles `dist/`, `wrangler` uploads it.
`_headers` sets assets to revalidate and the HTML to `no-store` (a phone's
back-forward cache served a stale page three times before that).

**`--branch=main` IS NOT OPTIONAL** in the deploy. `wrangler` infers the branch
from git and decides production vs preview from it, so publishing from a
detached worktree silently ships a PREVIEW while printing "Deployment
complete!". It cost three deploys before the confirmation loop caught it.

**Cloudflare deploys are NOT atomic.** `publish.mjs` polls until it sees the new
build id on three consecutive polls; a single check has twice confirmed a stale
edge.

---

## 7. PER-GAME NOTES YOU CANNOT GUESS

### Game Boy / Batman
Sample state in the game's own loop (`$0A4F` VBlank wait), never at the emulator
tick. **Input lead: ONE tick.** 10 sprites/line, priority by smallest X then OAM
index, OAM coordinates are bytes and WRAP. 59.727501 Hz.

### NES / Gradius
Sample at `$80B5`. **Input lead: ZERO** — measured, not assumed. 60.098814 Hz
(PPU 5,369,318.18 / 89,341.5 — frames alternate 89342/89341). 8 sprites/line,
priority by OAM index only. Seed-anywhere exists (wave 10): a scenario can start
at ANY cartridge frame — use it rather than driving from boot.
**Power-ups are how the game gets deep**: every unpowered run stalled at scroll
~`$04BD`; the powered run reached `$0A64` and four otherwise-unreached handlers.

### IGS PGM / DaiOuJou
- **`ddpdojblk` CONTAINS TWO COMPLETE GAMES.** The boot menu defaults to
  **VERSION-A** after ~5 s; our target is **VERSION-B** (2002.10.07 Black Ver).
  Build A = `$13xxxx`/`$14xxxx`, build B = `$23xxxx`–`$28xxxx`. **A build-A
  address is a defect unless the line says why — EXCEPT the interrupt handlers,
  which genuinely ARE build A's** (BIOS trampolines through RAM vectors
  `$801470`/`$801478`). See `games/ddpdoj/NOTES-build-split.md`.
- **Discard the first ~700 logic frames** of any build-B measurement; the
  chooser fires near logic frame 600.
- 15625/264 = **59.185606060606 Hz**, 337,920 cycles/frame. **Input lead ZERO.**
- **On the 68000, `CURPC` does NOT identify an opcode fetch** (that is the 6502
  rule). The discriminator is `PC == offset`, and a read tap only proves
  PREFETCH. **WRITE taps are the reliable execution hook.**
- **Keep Lua notifier/tap handles in globals** or they are GC'd and silently
  stop firing. Three agents lost runs to this.
- **Determinism requires** private `-cfg_directory`/`-nvram_directory` plus
  `-noreadconfig -nowriteconfig`. MAME persists a coin counter in `cfg/` and two
  "identical" runs otherwise differ on every row.
- **A stray `ddpdojblk.ini` in MAME's own directory** silently reconfigures every
  run of that set and appears in no command line. Always pass `-noreadconfig`.
- **LOOK AT THE FRAMEBUFFER.** A halted machine sitting on `ROM ERROR !` still
  exits 0 and prints an average speed.
- **The IGS027A protection ROM is `NO_DUMP`** and MAME simulates it, decrypting
  the 68k program in place. So "the original binary" is *a decrypted image plus
  a simulated device*. Any hash pinned must say which. The protection does no
  game logic.
- **THE ROSETTA STONE IS BUILD A, INSIDE OUR OWN CARTRIDGE** — not `ddpdojp`.
  `ddpdojp` is the same build as `ddpdojb` (99.9 %) and its program is still
  encrypted. Only `ddpdojblk`'s A↔B pair shares our RAM map.
  `tools/rosetta.py` aligns routines across builds by their RAM-address
  reference streams (code relocates, RAM does not): HIGH pairings 99.5 %
  accurate against a 0.16 % chance baseline. **A HIGH pairing is a lead to
  confirm by reading, not a fact** — and a naive cross-check would have invented
  a phantom object type (20 dispatch entries in B, 21 in A).

---

## 8. WHAT THE OWNER HAS DECIDED

These are settled. Do not re-litigate them.

1. **The live site may serve real cartridge art; the repo may not.** Those are
   different questions. `PUBLISH_VERBATIM` in `build-dist.mjs` holds exactly one
   entry, with its reason, printed on every build.
2. **Poked validation is approved** for `$813098`'s fan arms — force the byte on
   BOTH sides at the same instant and compare. Label it. Note the Rosetta recon
   found the debug stage select is **DIP-gated and MAME has the DIP**
   (`$C08006` bit 7, default off) — a configuration, not a poke.
3. **Scoring, combo and chain must be frame-exact, possibly sub-frame.** "One
   wrong rank gain from using super and the entire route breaks." Order WITHIN a
   frame is semantics: W19 measured that **the chain timer decrements LAST**.
4. **Scenarios must PLAY** — fire, kill, occasionally bomb. A passive run is
   pinned at minimum rank with nothing dying: a *different game*. Prefer a
   playing run to an invulnerable one; invulnerable is valid for COVERAGE ONLY
   and produces impossible game states.
5. **Swiss QWERTZ keyboard.** Bind by `e.code` (physical position) and bind BOTH
   `KeyY` and `KeyZ` to the same action, in every game, without being asked.
6. **The standing loop:** when a workflow finishes, start the next
   recon → architect → implement round without waiting to be prompted.
7. **DaiOuJou order of work:** the whole scrolling level first, then enemies and
   their shots.
8. **Sharding approved** for the DaiOuJou background; boot must not get slower
   than it is today.

---

## 9. THE PLANS

| document | scope |
|---|---|
| `docs/worklog/gradius/20-plan-completeness.md` | Gradius: the ledger, the sweep map, the waves to finish stage 1 |
| `games/ddpdoj/PLAN-no-recordings.md` | DaiOuJou: the CAPTURE LEDGER — the project is done when it is empty and `capture.bin` is deleted |
| `docs/worklog/ddpdoj/20-plan-level-and-patterns.md` | supersedes the above from W13 on; Phase A (level) then Phase B (enemies/patterns) |
| `docs/worklog/gradius/09-DECIDED-seed-anywhere.md` | why seeding works and what it cost |
| `SAVEPOINT.md` | the running narrative |

### Next up, in priority order

**Gradius** (rewritten W38 — every item on the old list has shipped):
**a cartridge comparison for stages 2-7 and for the ending chain**, which is the
largest unclaimed work in the port and has been the standing item since W32c;
the **six missing `$80D4` game modes** (`$9751`, the restart-to-title, is now
the most reachable throw in the game and a loop-2 clear walks straight into it);
dispatch entry 27 `$B4F2`; the `$1B = $83` null wave cursor; and `$B7B5`/`$B797`,
W34's open table-extent finding.

**DaiOuJou:** the 39 bullet behaviour bodies (`$282104..$283BAF`, ~6.7 KB, all
throwing); the enemy loaders (2 routines + 208 table pairs behind 124 of 126
types); the score/chain/rank ledger's missing score path; and the two open
review findings from W21 — a hardcoded coverage denominator, and an absence
proof built on a partial opcode scan.

**Both:** replay support. `games/ddpdoj/NOTES-replay.md` explains why the work
budget must be **counted, not timed** — three independent reasons converge on
it (mechanism (C), replay determinism, and the frame-exact chain requirement).

---

## 10. WORKING PRACTICE

### The worklog is not optional
Every agent writes `docs/worklog/<game>/<NN>-<role>-<slug>.md`, opened with
`status: IN PROGRESS` **before** work starts, and **updated as findings arrive,
not at the end**. An agent killed mid-task having written only a header lost
twenty minutes of real work. What is on disk is what survives.

Record what you **RULED OUT**. `status: BLOCKED` with a measured reason beats a
confident guess — three waves came back BLOCKED and all three were right to.

### Committing, with concurrent agents
- **NEVER `git add -A`.** Stage by name, then **run `git diff --cached
  --name-only` and read it.**
- **`git commit` commits the INDEX, not your files.**
- Use a private index, and **set `GIT_INDEX_FILE` BEFORE `read-tree`**:
  ```
  export GIT_INDEX_FILE=.git/mine.index
  git read-tree HEAD          # IMMEDIATELY before the commit, not before the work
  git add <paths BY NAME>
  git diff --cached --name-only
  git commit -m "..."
  ```
  A stale `read-tree` silently reverts whatever landed in between — it has
  happened twice. And **the SHARED index has repeatedly been left holding staged
  deletions of files that exist on disk** (four occurrences); `git reset` clears
  it without touching the worktree. If `git status` reports something deleted or
  untracked that you know is present, suspect the index before the disk.
- **`git checkout -- <file>` on a dirty tree destroys uncommitted work.** 53
  files of real work were nearly discarded on a wrong assumption that they were
  only line-ending noise — `git diff --ignore-cr-at-eol` settles it in one
  command.
- **Commit and push BEFORE publishing.**
- **Reviewer worklogs have no committer by design** — adopt them, or the
  findings that caught the last four defects are lost.

### Multi-agent hazards, all encountered
- Shared output paths: two agents running the oracle at once read each other's
  data and draw confident wrong conclusions.
- **Exactly one agent writes to `src/` at a time. Reviewers read.**
- A confident wrong answer is worse than "unresolved" — ask explicitly for the
  second.
- **Watch for stalled agents.** A workflow only notifies on completion, and an
  agent that dies inside a `parallel()` batch returns null and is silently
  filtered out. Check worklog mtimes.

### On Windows specifically
- Git Bash **rewrites `/E`, `/MT:16`, `/J` into Windows paths** before the
  program sees them. Use `MSYS2_ARG_CONV_EXCL='*'` for `robocopy`, `mklink`,
  etc. This cost two separate failures.
- `.ps1` is read as ANSI without a BOM, so **a single non-ASCII character can
  terminate a string and throw a parse error twenty lines away.** Keep scripts
  ASCII.
- PowerShell `Start-Job` dies when the tool call returns. Use the harness's own
  background mechanism.
- `node --check` treats `.js` as CommonJS; an ES module needs `.mjs`.

---

## 11. THE ONE-PARAGRAPH VERSION

Three hand-written ports verified against real hardware. Batman is finished.
Gradius plays all seven stages, ends, and wraps to loop 2 — but has no title
screen, no attract mode and no game over, and nothing past stage 1 has ever been
compared against the board.
DaiOuJou scrolls its whole first stage from the game's own data, aims its
turrets correctly, and generates its bullet patterns from the nineteen unrolled
generators the developers actually wrote — but its enemies are still a
161-frame recording. The method is: **read the ROM to learn what exists, port it
citing addresses, and use the emulator only to prove the transcription right.**
Every number in this file was measured. When a document and the listing
disagree, the listing wins.
