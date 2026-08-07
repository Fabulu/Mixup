# 127 -- IMPL: object type 10 (RANK) `$260794`, Wave A (Tier 1, CORPUS-SAFE)

status: **DONE**

started: 2026-08-07. wave: 127. role: IMPL (the only writer under
`games/ddpdoj/src/` this wave; plus one ROM window in `tools/export-tables.py`
and its regenerated, gitignored tables JSON). target: `ddpdojblk` VERSION-B
(2002.10.07 BLACK VER). Every address is build B. instrument:
`games/ddpdoj/tools/oracle/out/maincpu.bin` (address == file offset, big-endian),
capstone `CS_ARCH_M68K` / `CS_MODE_M68K_030`.

`[M]` = measured by me, this session, from the image, the seed, or this tree.

THE JOB (from the brief, W126 Wave A): port object type 10 (`$260794`, the RANK
object) so the rank output `$81309E` stops being frozen and advances as
`base[stage] + (clock>>8) + 0` on the corpus, matching the board (which has
power=0 on the no-hyper corpus). This is Tier 1: the clock/base term only. The
hyper subsystem (Tier 2, the `16*max(power)` term) is a separate 3-4 wave job.

## 0. PREMISE CHECKS (all closed `[M]`)

- [x] **Object type 10 is NOT in `main.js defaultHandlers`.** `[M]` the Map has
      entries 0, 1, 2, 3, 5, 6 only. No entry 10.
- [x] **`$81309E` has ZERO source writes (frozen).** `[M]` grep of
      `games/ddpdoj/src/` for `setU.*(0x81309e|...)` returns no matches; the
      only `81309e` hits are comments. The recompute `$2608D2` is the sole
      build-B writer (7 sites inside the recompute, W120 census).
- [x] **The recompute reads NO chain/score state.** `[M]` re-disassembled
      `$2608D2..$260A1E`: it reads `$81315C` (base ptr), `$813092` (stage),
      `$8130C6` (clock), `$81B63E`/`$81B640` (hyper active), `$81B646`/`$81B648`
      (power), `$813098` (loop). NONE is chain/score. Risk to the frame-exact
      chain decrement is ZERO (W120 sec 5 reproduced).
- [x] **The seed carries a type-10 object in state 1.** `[M]` slot 0 of
      `$80E240`: typeWord `$800A` (type 10, $8000 freshly-created bit),
      state byte `($2,A5)` = 1, priority `$001F` (highest of all 20). So a
      seeded run starts mid-state-1 and state-0 INIT `$2605C8` never runs
      (DEFER, per the brief).

## 1. THE RECOMPUTE FORMULA, VERIFIED AGAINST THE SEED `[M]`

`$2608D2..$260A1E`, re-disassembled and checked instruction for instruction
against W120. The formula:

```
D1 = base[stage]                   ; base table at (RAM ptr $81315C) + stage;
                                   ;   seed $81315C -> ROM $260874, a 6-byte table
D1 += (clock >> 8) & 0xFFFF        ; clock is the LONGWORD $8130C6 (24.8 fixed)
if ($81B63E | $81B640) != 0:       ; either player hyper-active
    D0 = max($81B646, $81B648) << 4
    D1 += D0
if loop ($813098) != 0:            ; loop 2+
    rank = ($81B63E | $81B640) != 0 ? $FF : $F8     ; PIN, no clamp
else:                              ; loop 1 (the corpus)
    rank = D1
    rank = min(rank, ($81B63E | $81B640) != 0 ? $FF : $F0)   ; clamp
$81309E := rank                    ; the OUTPUT word
fan the low byte ($81309F) out to 15 bullet-system bytes $8130A1..$8130BD
```

SEED VALIDATION `[M]`: base[0] (ROM $260874) = $34 = 52; seedClock $8130C6 =
$17F = 383, clock>>8 = 1; predicted rank = 52 + 1 = 53 = $35; actual seed
`$81309E` = $35. EXACT MATCH. The board's own recompute wrote that value the
frame before the seed was taken.

FAN-OUT VALIDATION `[M]`: the 15-byte fan-out is a pure function of the rank
low byte r: with s1=r>>1, s2=r>>2, s3=r>>3, d7=r>>4, the bytes are
`$A1=s1+s2+s3+d7`, `$A3=s1+s2+s3`, `$A5=s1+s2+d7`, `$A7=s1+s2`,
`$A9=s1+s2-s3+d7`, `$AB=s1+s2-s3`, `$AD=s1+d7`, `$AF=s1`, `$B1=s2+s3+d7`,
`$B3=s2+s3`, `$B5=s2+d7`, `$B7=s2`, `$B9=s2-s3+d7`, `$BB=s2-s3`, `$BD=d7`
(byte arithmetic). For seed r=$35 all 15 predicted values match the seed bytes
EXACTLY (e.g. `$A1`=$30, `$A7`=$27, `$BD`=$03). The fan-out transcription is
proven, not assumed.

## 2. THE TWO COMPUTED-CALL DISPATCHERS, BOTH CORPUS NO-OPS `[M]`

The state-1 body calls two computed-call dispatchers (`jsr (A0)` after a
jump-table lookup). Both walk a 2-entry RAM table, read an index word, SKIP the
entry when the index is 0, and otherwise index a ROM jump table. `[M]` ALL FOUR
index words are 0 in the seed:

| callee | RAM table | stride | ROM jump table | seed idx 0 | seed idx 1 |
|---|---|---|---|---|---|
| `$25FF7A` (state-1 first call) | `$8130FA` | `$24` | `$25FF52` | 0 | 0 |
| `$288610` (state-1 second call) | `$81B706` | `$16` | `$288638` | 0 | 0 |

`[M]` the ONLY build-B writers of `$81B706`/`$81B71C` are in the `$2885xx`
cluster (the hyper-state setup, reached from hyper activation) and the `$187xxx`
ISR region (build A); the port writes NEITHER (grep: zero `setU` to these
words). On the no-hyper corpus both stay 0 and both dispatchers return without
calling any target. The jump-table targets (e.g. `$28864C` for `$288610`[1]) are
per-player hyper/palette/sound servicers that belong to Tier 2; they are NOT
reached on the corpus.

PORT POLICY for both: walk the 2 entries, read the index word, skip on 0
(matching the board exactly), and `unreached()` by address if a nonzero index
ever appears (a state the corpus never produces, and a loud signal to a future
hyper wave that the targets need porting). Broken and declared beats fabricated.

## 3. SCOPE

PORTED this wave:
- the dispatch entry: type 10 wired into `main.js defaultHandlers` via a new
  `src/rank.js` `makeRankObject(rom)` factory.
- the state machine `$260794`: state 0 INIT (DEFERRED, declared deviation),
  state 1 per-frame body, state 2 teardown (self-kill).
- the state-1 per-frame body `$2607A8..$260808`: the `$813082` gate, the
  `$8130D2` freeze gate (shared with `stageend.js SE.pauseFlag`), the `$8130D4`
  decrement, the `$8130CA` frameCounter-and-$0E copy, the clock advance
  `$2607E4 addq.l #1,$8130C6`, the recompute `$2607EA jsr $2608D2`, the
  `$288610` callee, and the loop-2+ `$81B414` write.
- the recompute `$2608D2` (formula + clamp + 15-byte fan-out).
- the two computed-call dispatchers `$25FF7A` and `$288610` (corpus no-ops,
  loud-throw on nonzero index).
- one ROM window for the base table at `$260874` (6 bytes) in
  `tools/export-tables.py`, regenerated into the gitignored tables JSON.

DEFERRED (per the brief):
- state-0 INIT `$2605C8` (cold-boot only; seeded runs start in state 1; the
  palette half is already replayed by `palette.js catchUpTextPalette`). Declared
  as `RANK_DEVIATION[0x2605c8]`; if ever hit, noted and state advanced to 1.
- the hyper subsystem (Wave B: activation `$285A24`, grantor `$287682`, collect
  `$2530CA`, hyper button, death/bomb sinks). The hyper term is 0 on the corpus.

## 4. MUST-FAIL CHECK (SEEDED, corpus = no hyper)

Before this wave: `$81309E` frozen at the seed $35 forever (0 source writes).
After: `$81309E = base[stage] + (clock>>8) + 0`, advancing by 1 every 256 frames
(clock = $17F at seed; at frame 129 clock = $200, clock>>8 = 2, rank = $36).

Test (`tests/w127rank.test.js`) asserts the advance, and a break variant skips
the clock advance to show red (frozen). The gameplay-affecting reader
`$2650BC`/`$2650CC` (the enemy bullet-tier selector) is NOT in the port's source
(port enemies fire the lowest tier regardless, W120 sec 1.4), so the advancing
`$81309E` flows into RAM but no ported reader consumes it yet; the gate still
sees the board-matching value via seedcmp.

## LOG

- opened IN PROGRESS. Read MEMORY (no em dashes), W126 (the plan), W120 (the
  verdict), `main.js`, `objdriver.js`, `machine.js`, `stageend.js` (the handler
  factory idiom), `ram.js`, `rom.js`.
- `[M]` premise checks: type 10 absent from defaultHandlers; `$81309E` has 0
  source writes; recompute reads no chain/score; seed slot 0 is the type-10
  object in state 1, priority $1F.
- `[M]` disassembled `$260794` (state machine), `$2608D2..$260A1E` (recompute +
  fan-out), `$288610` (computed-call dispatcher), `$25FF7A` (state-1 first
  callee, also a computed-call dispatcher), `$260788` (state-2 teardown).
- `[M]` traced `$288610`'s jump table at `$288638`: [0]=NULL, [1]=`$28864C`,
  [2]=`$28871C`, [3]=`$28875E`, [4]=`$288952`. The index words at `$81B706`/
  `$81B71C` are BOTH 0 in the seed; the only writers are the unported hyper
  setup. So `$288610` is a corpus no-op (the one unmeasured piece W126 flagged,
  now measured).
- `[M]` seed validation: base[0]=$34, seedClock>>8=1, predicted rank=$35=actual.
  All 15 fan-out bytes match. Formula proven.
- `[M]` `$81315C` -> ROM `$260874`, a 6-byte base table NOT in any exported ROM
  window. Adding one.
- added the W127 ROM window (`$260874`, 6 bytes) to `export-tables.py`, regen'd
  the tables JSON (210 windows), verified `rom.u8(0x260874)=$34` and that reads
  past the end throw by address.
- wrote `src/rank.js`: `RANK` constants, `RANK_DEVIATION` (state-0 INIT deferred),
  `recompute2608D2` (formula + clamp + 15-byte fan-out), `fanOut260984`,
  `computedDispatch` (the shared `$25FF7A`/`$288610` walk, corpus no-op, loud
  throw on nonzero index), `perFrame2607A8` (the state-1 body), `makeRankObject`
  (the handler factory: state 0 note+advance, state 1 per-frame, state 2
  self-kill).
- wired `[10, makeRankObject(rom)]` into `main.js defaultHandlers`.
- wrote `tests/w127rank.test.js` (12 tests): base-table deref, seed-rank
  prediction, GREEN (140 frames -> $36), RED (no handler -> frozen $35), BREAK
  (freeze gate -> frozen), recompute purity + clamp, 15-byte fan-out exact,
  dispatchers corpus-no-op + nonzero-throws, defaultHandlers wiring, the
  declared deviation. All 12 pass.
- `[M]` MUST-FAIL red -> green: before the wave `$81309E` frozen at $35; after,
  `$81309E = base + (clock>>8)` advances to $36 at frame 129 (clock $17F -> $200,
  >>8 = 2). The break (freeze gate `$8130D2`) skips the clock advance and `$81309E`
  stays $35. SEEDED, no-hyper.
- `[M]` GATES: `node --test games/ddpdoj/tests/` = 1284 tests, 1284 pass, 0 fail,
  0 skipped (tables + seed present). `bosscoverage.py` = 103 ported / 0
  live-unported / 8 dead (unchanged). `publish.mjs --only ddpdoj --dry` = exit 0,
  build id 20260807112023 (the ROM-leak guard; the orchestrator publishes).
- `[M]` DECLARED SIDE-EFFECT: the recompute writes `$81309E` + the 15-byte
  fan-out `$8130A1..$8130BD` + `$8130CA` every frame, exactly as the board does,
  and enemy fire cadence reads those bytes.  So two `webgate.mjs` baselines
  (calibrated against the FROZEN-rank port) moved to the LIVE-rank values and
  were updated with a W127 comment each: W44 `records 20842 -> 20847` and
  `b23 3001 -> 3006` (both +5 enemy bullets, nothing else moved); W52 shard 7
  `records 7070 -> 6853` (a cadence shift over 1200 fire-tapped frames; streams
  298 / distinct 36 / first 98 unchanged).  These are the port now matching the
  board's live rank rather than the frozen seed, not a regression.
- closed DONE.
