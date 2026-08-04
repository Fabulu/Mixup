# W29 — INTEGRATION: wiring the type-5 subsystem call list (`$28B5E0`)

status: IN PROGRESS
wave: 29. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
date: 2026-08-04.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
unless noted.

## THE BRIEF

W21–W27 ported `spawn.js`, `handlers.js`, `mover.js`, `turret.js`,
`movement.js`, `initbody.js`, `enemyproto.js` and `aim.js`. W28's recon measured
that **none of them is imported by any module under `src/`** — only by their own
tests and gates. This wave makes the ported half of the type-5 subsystem call
list execute in the live path.

Order of work, as briefed:
1. enumerate all 23 `jsr` targets at `$28B5E0` statically, from the ROM;
2. wire what is already ported so it runs on page load;
3. measure before/after (boot, gate, divergence);
4. if too large, wire the smallest coherent subset that makes at least one W27
   body execute live, and say exactly what was deferred.

## 1. THE ENUMERATION — 23 `jsr` TARGETS, READ OUT OF THE ROM

`python tools/oracle/w27disasm.py 28B5A0 28B6E0` over
`tools/oracle/out/maincpu.bin`. `$28B5E0 tst.b $2(A5) / beq $28B5A8`, then
**23 consecutive `jsr <abs>.l` at `$28B5E6..$28B66A`**, then `$28B670 tst.w
$81308C` — the tail, which is not a `jsr` and is separately counted. The list in
`src/type5.js` `TYPE5.calls` matches the listing entry for entry; I re-derived it
rather than trusting it.

**READ PAST THE APPARENT END, both directions.** `$28B5A8` (the `beq` target,
the "not started" arm) is *eight more `jsr`s* and a `move.b #$1,$2(A5)` — a
one-shot init list, not a stub. It is a named throw in the port and stays one.

| # | addr | what it is (from the listing) | port |
|---|---|---|---|
| 1 | `$289B80` | pool driver, count `$81D38E`, callback `lea $289C26(pc),A4` | note |
| 2 | `$2634F4` | **THE ENEMY SUBSYSTEM**: `bsr $2633BE` (spawn walk + deferred drain) then `bsr $263502` (58-slot driver at `$81332C`) | **W29 RUNS** |
| 3 | `$28AD54` | sweeps the SUB-RECORD pool `$81459C` (`#$95` = 150 slots × $20), then a pool at `$81DB90` (count `$81DD0C`) | note |
| 4 | `$27F95A` | the IMPACT/effect pool `$8171BE`, stride $2C, count `$817F7E`. `$27F8F8` (the bullet death-effect spawn) writes into it | note |
| 5 | `$288E4E` | the EXPLOSION pool `$81B732`, `#$4F`+1 = 80 slots — L12's pool, `$289004`'s | note |
| 6 | `$2890F2` | pool count `$81CDEC`; reads rank `$813098`; `lea $200920,A5` | note |
| 7 | `$255DD8` | gated on `$811F72` (the mover's own freeze word); player records `$8103E6`/`$81050E` | note |
| 8 | `$253A70` | the player-shot driver, table `$810572` | RUNS (W8) |
| 9 | `$24C096` | the OPTION OBJECT (both pods, the laser ramp) | RUNS (W12) |
| 10 | `$254680` | pool `$8112F2`, `#$1F`+1 = 32 slots; counters `$81B6E6`/`$81295E` | note |
| 11 | `$255042` | option record `$811F32`; calls `$289FC0` behind three gates | note |
| 12 | `$28A098` | the BUCKET-20 bulk writer (`$28A198`), count `$81DB8C` | note |
| 13 | `$2527CE` | per-player, gated on `$81B65C`/`$81B65E`; `lea $81B6A0,A0` | note |
| 14 | `$24A458` | ship draw, alt entry, P1 | RUNS (W12) |
| 15 | `$24A46C` | ...P2 | RUNS (W12) |
| 16 | `$24A440` | ship draw, P1 | RUNS (W12) |
| 17 | `$24A44C` | ...P2 | RUNS (W12) |
| 18 | `$27E99E` | pool `$816B7A`, stride $40, count `$8171BA` | note |
| 19 | `$252BD0` | `$81B646`/`$81B648` — a min/compare over two counters | note |
| 20 | `$281D9A` | **THE BULLET SUBSYSTEM**: `bsr $281CD6` (screen clear) then the MOVER `$281DDE`, then the bucket-22/23 counter writes | **W29 RUNS** |
| 21 | `$25354C` | six instructions: count `$81B410` down, clear `$81B412` on expiry — the timer that ARMS #20's screen clear | **W29 RUNS** |
| 22 | `$25292A` | gated on `$80392C`; player `$8103E6`, `lea $810436,A1`, counters `$812910`/`$812914` | note |
| 23 | `$252A52` | gated on `$80392C`; `lea $812924,A0` / `$81291C,A1` | note |

**BEFORE: 6 of 23 RUN.** The recon's "the port has 1" is stale — it read the
file header comment ("THIS FILE PORTS EXACTLY ONE OF THE TWENTY-THREE"), which
W12 did not update when it added five. `TYPE5_PORTED` held six.
**AFTER: 9 of 23.** The denominator is 23 and it is the listing's.

## 2. WHAT WAS WIRED, AND WHERE

- `games/ddpdoj/src/enemyframe.js` (new) — `$2634F4`. `runSpawnWalker`
  (`$2633BE`, walk + the FALL-THROUGH deferred drain at `$263446`) then
  `runEnemyDriver` (`$263502`). Order is semantics: a record spawned this frame
  is in the table before the driver walks it, so it takes its first handler step
  on its spawn frame.
- `games/ddpdoj/src/bulletdriver.js` (new) — `$281D9A` + `$281CD6` + `$25354C`.
- `games/ddpdoj/src/type5.js` — three new `case`s; `TYPE5_PORTED` 6 → 9.
- `games/ddpdoj/src/mover.js` — `moverIterCount` exported (one line + comment):
  `$281CD6` contains the SAME slot-count cascade instruction for instruction
  (`$281CEE..$281D1E`, and again at `$281D50..$281D80`). Two copies in the port
  would be two things that agree with each other whatever they hold.

### A NAME COLLISION THAT HAD HIDDEN A MISLABEL

`src/spawn.js`'s `runSpawnWalker` docstring said it was `$2634F4`. It is not:
it is `$2633BE`, and `$2634F4` is its CALLER. Nothing had noticed because the
caller did not exist in the port. Corrected in place.

### THE CONTEXT SHIM, AND WHY IT WAS INVISIBLE UNTIL NOW

`Game`'s per-frame context calls the log `ctx.unportedLog`; every handler in
`src/handlers.js` reads `ctx.unported`; `src/mover.js` reads `ctx.notes`; and
`Game`'s ctx carries no `ram` at all. Three names for two objects, introduced by
three different waves, and **no gate could ever have caught it** — each gate
hand-builds the context its own subsystem expects. Shimmed at the two call
sites rather than renamed across files this wave is not the reviewer for.

## 3. MEASURED: BEFORE AND AFTER (updated as they arrive)

Harness: the PAGE's own step loop, headless — `Game` seeded from
`rip/web/seed.bin`, `bgSeed` from the capture's first frame, the fly-around
invulnerability poke at the same instant, `portWord = $FFFF` (no input).
This is `src/web/app.js`'s `step()` minus the renderer.

**THE SEED, measured (it decides everything below):** at logic frame 2000 the
board's RAM holds **7 live enemy records, all with handler `$2688CC`** (type
`$11`, which W25 ported), the spawn cursor already installed at `$230CA4` with
aux `$23170C` and distance clock `$0068`, **0 live bullets**, `$81B410` = 0
(the screen clear disarmed) and all four mover cascade windows 0.

| | frames before a throw | live enemies at end | live bullets |
|---|---|---|---|
| BEFORE (6 of 23) | 400 of 400, none | 0 (the table is never touched) | 0 |
| AFTER (9 of 23) | **345 of 400**, then `Unreached $275914` | 8 | 0 |

**THE ENEMY SUBSYSTEM NOW EXECUTES.** From the first frame the seed's seven
`$2688CC` records are driven by `runEnemyDriver` → `handler11` → `stepMovement`
→ the W24 movement interpreter, and `$24200A` (aim) and the two `$23Dxxx`
fire-actions are counted per record per frame — 345 notes each for records
`$81369C`, `$81378C`, `$81382C`. None of that had ever run in the product.

**THE FIRST DIVERGENT THING IS A THROW, AND IT IS THE RIGHT ONE.** At logic
frame 2346 the live spawn walker dispatched a record whose init installed
handler `$275914` (type `$85`), which W25 did not port. `runEnemyDriver` threw
`Unreached` with `romAddress = $275914` and a message naming the record
(`$81364C`, slot 10 of 58) and the dispatch site (`$263538`). That is the
mechanism working: 345 frames of real enemy simulation, then a one-line
diagnosis instead of a plausible wrong answer.

**THE BULLET SUBSYSTEM RUNS AND HAS NOTHING TO DO.** `$281D9A` executes every
frame: the screen clear returns immediately (`$81B410` = 0), `$81B40C` is
cleared, the mover walks its cascade (70 slots, all four windows 0) and finds
**zero live bullets**, so **no W27 behaviour body executes in the live path.**
Said plainly because it is the wave's main shortfall — see §5.

### 3.1 THE SURVEY — what the live path REACHES over the whole stage

A scratch harness (not committed) runs the same loop, and on an `Unreached`
records the address, frees the record the throw names, and carries on.
**Everything after the first throw is an off-distribution state by
construction** (`docs/knowledge/09`), so this is an INVENTORY and nothing else.
It may not be quoted as "the port survives N frames".

7,400 logic frames, lf 2000 → 9400 (the boss lock), 7 interventions:

- **peak 41 of 58 enemy slots live**; peak 0 of 210 bullet slots.
- **5 of the 6 ported handlers dispatch**, 48,925 record-frames:
  `$2688CC` ×24,379 · `$27687E` ×18,603 · `$268232` ×2,891 · `$26A2E2` ×2,121 ·
  `$269CEA` ×931. `$2747C6` (type `$82`) is never reached by this seeded,
  input-less, invulnerable run.
- **ZERO init-body throws and ZERO movement-interpreter throws.** W23's 21 init
  bodies and W24's interpreter cover everything stage 1 spawns on this path.
  That is a real result about their completeness and it could not be had before
  this wave, because neither had ever been called from a frame loop.
- **6 distinct unported handlers reached**, each by address:

  | first lf | address | what |
  |---|---|---|
  | 2345 | `$275914` | type `$85` |
  | 2632 | `$2739C0` | type `$80` |
  | 2711 | `$276702` | type `$8A` (×2) |
  | 3093 | `$26B6FA` | **the MIDBOSS** — 576 instructions, the largest body in the stage |
  | 8100 | `$2697F6` | type `$31` |
  | 8179 | `$292902` | **the BOSS** |

  Six of the thirteen unported stage-1 handlers W28 enumerated. The other seven
  are not reached by this path; that is a statement about the path, not about
  the cartridge.

## 4. EVERY CHECK WAS SEEN TO FAIL

`games/ddpdoj/tests/integration.test.js`, 14 tests. Every throw assertion pins
`e.romAddress`; every note assertion is anchored on the KEY's address field
(`k.startsWith('$2634F4 ')`), because `27-review.md` §1A found four assertions
in this suite matching an `Unreached` by message text — and the message quotes
other ROM addresses in its own prose.

Mutations applied byte-exactly in Python with a single-occurrence anchor
assertion, suite run, file restored, sha256 verified identical both ways
(`src/bulletdriver.js` `c32707b6a00161da`, `src/enemyframe.js`
`2647e955c22f5768`, `src/type5.js` `ec75b76540433506`).

| # | mutation | result |
|---|---|---|
| M1 | `$2634F4`'s two `bsr`s swapped (driver before walker) | RED — 183, alone |
| M2 | `$25354C` fires on UNDERFLOW (`bcc`) instead of at zero (`bne`) | RED — 172, alone |
| M3 | the screen clear ignores the `$81B410` gate | RED — 174 + 178 |
| M4 | the transform arm ORs `$20` instead of `$40` | RED — 175 + 177 + 180 |
| M5 | the transform arm writes +`$3A` instead of +`$3C` | RED — 175, alone |
| M6 | the clear's throw carries `$27F95A` instead of `$27F8F8` | RED — 176, alone |
| M7 | the screen clear is not called at all | RED — 178 + 179 + 180 |
| M7b | the screen clear moved BELOW the mover | RED — 180, alone |
| M8 | the clear sweeps all 210 slots instead of the mover's cascade | RED — 177, alone |
| M9 | type 5 stops running `$25354C` (falls back to the note) | RED — 185, alone |
| M10 | the driver does not `clr.w $81B40C` | RED — 178 + 185 |
| M11 | the handler adapter files `$2688CC` under `$268232` | RED — 181 + 183 + 185 |
| M12 | bucket 22's cursor starts at the BASE, not base + `$80AFE0` | RED — 179, alone |
| M13 | type 5 stops running `$2634F4` (falls back to the note) | RED — 185, alone |

**Fourteen mutations, fourteen reds, no survivors.** Eight of the fourteen
reddened exactly one test — a mutation that reddens the suite proves nothing
about the constant it changed.

**M6 is the one that had to be run.** The pre-fix shape of that assertion in
this codebase was a regex over `e.message`, and `27-review.md` proved such a
regex passes for a throw carrying the wrong address. Pinning `romAddress` is
what makes M6 red.

**M7b is the one that had to be written.** M7 (delete the call) reddens three
tests, which is weak evidence about ORDER — deleting anything reddens things.
M7b keeps the call and moves it below the mover, and it reddens exactly the
order test. Those are different experiments and only the second one tests the
claim.

**The order test also drives the mover's bit-14 path for the first time.**
W26 transcribed `$281FA2` → `$281FB4` and W27 recorded that no kind in the
`$282030` table reaches it, so it had never executed from any caller. The
screen clear's transform arm is what reaches it, and `$281FB4 bset #$5,(A6)` is
a BYTE operand — the type word's HIGH byte, i.e. word bit 13, not bit 5. The
first version of this test asserted `& 0x0020` and went red for that reason
before it could go red for a real one.

## 5. WHAT WAS DEFERRED, AND EXACTLY WHY

### 5.1 NO W27 BEHAVIOUR BODY EXECUTES IN THE LIVE PATH. This is the shortfall.

The mover runs every frame over an empty pool. A bullet only enters the pool
through `spawnCore`, and every caller of it is a handler FIRE point that is
still a counted note. So `runMover`'s 37 bodies remain exercised only by
`tests/mover.test.js` and `tools/w26movergate.mjs` — `27-review.md` F1 stands
unchanged, and this wave did not close it.

**It is closable, and here is the listing, so the next wave does not re-derive
it.** Handler `$11`'s counter-elapsed fan (`$268AD8..$268B1A`) is the shortest
route:

```
268AD8  btst #$5,(A6) / beq            the sub-record flag gate
268ADE  move.b $33(A5),D1              <-- THE FACING BYTE
268AE2  addq.b #$2,D1 / andi.w #$3C,D1
268AE8  move.w D1,D2 / add.w D2,D2
268AEC  lea $268B1E(pc),A0             <-- a MUZZLE TABLE inside the handler
268AF2  move.l (A0,D2.w),D2 / add.l $2(A6),D2
268AFA  moveq #$D,D0
268AFC  cmpi.w #$3,$813092 / bcs       rank/stage gate
268B08  move.l #$FFFC000D,D0
268B0E  move.l #$2000000,D3
268B14  jsr $281402                    <-- A PORTED GENERATOR ENTRY
```

Three of the four inputs are computed in the handler. The fourth, **D1, is
`+$33` — the facing byte written by `$268A30 jsr $24200A` and `$268A3C jsr
$242190`, which `src/handlers.js` still `note()`s.** Both routines ARE ported
(`src/aim.js`: `$24200A` = `aim64FromCaller`, 61 call sites; `$242190` =
`slew64`, 84 call sites). And `$281402` IS one of `src/bullets.js`'s 19
`ENTRIES`.

So the missing pieces are: (a) call the two aim routines instead of noting them,
(b) a ROM window at `$268B1E` (the muzzle table, which the linear sweep prints
as `bclr.b d2,d0` — it is DATA), (c) the D0/D2/D3 setup above.

**Not done here on purpose.** That is a port of a fire state machine, not a
wire: it changes `+$33` and `+$22` on a handler that has a gate
(`w25handlergate.mjs`), and `src/handlers.js` says in its own header that firing
the fan with an unset aim "would fire every bullet the WRONG WAY". Doing it
unreviewed at the tail of an integration wave is how a port ships invented
bullets. It is one small, well-specified wave.

### 5.2 NO SPRITE IS EMITTED. Buckets 22 and 23 stay empty.

`$281DCE`/`$281DD6` are written from cursors that did not move, because
`spriteEmit` writes to a JS array sink and this driver passes none. Counted
every frame at `$281DCE`. **Deferring is a decision with a measured reason:**
`26-review.md` F1 and F2 are OPEN defects inside the emit — `spriteEmit` swaps
the renderOffs half-words relative to `$284286`, and kind 19's continuation
omits its renderOffs wrap — and both are latent only *because* no sink exists.
Turning the sink on this wave would ship two known-wrong fields into the picture
on the same day.

### 5.3 THE OTHER FOURTEEN CALLS ARE COUNTED NOTES, NOT THROWS.

The brief asks for every unported target to be a loud named throw. Fourteen of
these run every frame regardless of input, so fourteen throws is a page that
never boots — `type5.js` has said so since wave 8 and it is still true. They are
`UnportedLog` notes keyed by address, printed next to what did run. **This is
the one place this wave knowingly departs from "unported = throw", and it is
recorded here rather than left to be discovered.** Inside the two calls that
were wired, the rule is applied without exception: an unported enemy handler
throws (`$275914`, `$2739C0`, `$276702`, `$26B6FA`, `$2697F6`, `$292902` all
observed), and the screen clear's `$27F8F8` throws.

### 5.3b A CORRECTION TO THE BRIEF'S PREMISE, AND WHERE IT CAME FROM

The brief (and W28's recon §0.2) says the port implements 1 of 23. It
implemented **6**. The source of the error is a comment: `src/type5.js`'s header
has said "THIS FILE PORTS EXACTLY ONE OF THE TWENTY-THREE" since wave 8, and
wave 12 added five calls without touching it. The recon read the comment and
reported it as measured. **A stale header comment in this project is a wrong
number with a citation attached** — corrected this wave, and the paragraph now
says outright that `TYPE5_PORTED` is the authority and the prose is not.

### 5.4 THE PAGE NOW DIES AT LOGIC FRAME 2346.

Before this wave the page ran indefinitely, drawing a recording with a ported
ship over it. It now simulates the enemies for 345 frames and then throws by
address. **That is a product regression and an information gain, and it is not
hidden behind a flag.** A flag defaulting to off would be exactly the failure
mode the brief names: a green achieved by not running code. The fix is to port
`$275914`, not to stop calling it.

## 6. WHAT I COULD NOT DETERMINE

- **Whether stage 1 NEEDS any of the fourteen unported calls.** W28 could not
  say either. What is now known is narrower and useful: with #2, #8, #9, #14-17,
  #20 and #21 running and the other fourteen counted, the enemy simulation is
  self-consistent for 7,400 logic frames — no init body, no movement script and
  no allocator path fell over. That is evidence the fourteen are not *feeding*
  the enemy subsystem; it is not evidence they do nothing.
- **What `$289B80`, `$28AD54`, `$2890F2`, `$252BD0`, `$2527CE`, `$25292A` and
  `$252A52` are.** Each was identified only by the RAM it touches (the table
  above). Naming them needs a read, not a guess, and this wave did not do it.
- **Whether the `$268B1E` muzzle table in handler `$11` is 16 or 64 longwords.**
  The index expression is `(($33(A5)+2) & $3C) * 2` → byte offsets 0..$78,
  longword read, so the extent is at least `$7C`. I did not find its abutting
  bound.
- **Anything about the board.** No MAME was run this wave. Every dynamic number
  above is the PORT running against a seeded RAM dump, and the seed is a
  fly-around capture with the invulnerability poke — `docs/knowledge/09` says
  that is valid for coverage and invalid for characterising play.
