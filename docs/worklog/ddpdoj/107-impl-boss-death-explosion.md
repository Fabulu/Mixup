# 107 -- IMPL: the boss's OWN death explosion (D-script 6's emitters)

status: DONE

started: 2026-08-06. wave: 107. role: IMPLEMENTER (the only tree writer this
wave). target: `ddpdojblk` VERSION-B. `[M]` = measured by me this session.
instrument: `games/ddpdoj/tools/oracle/out/maincpu.bin` (address == file
offset), capstone `CS_MODE_M68K_030`.

The plan is recon 106. This file does not repeat its reasoning; it records what
I did and what I measured.

## 0. PREMISE CHECK -- the brief was RIGHT

`[M]` against the code and ROM, both halves of recon 106's headline hold:

* `spawnEffect` IS ported in `src/effects.js:295` (signature
  `spawnEffect(ram, ctx, d0, siteAddr=0x289004)`), and `runEffectDriver` IS
  ported at `src/effects.js:422` and runs every frame via `src/type5.js`.
* `src/boss.js` `d6Step293E04` (line 410) calls `note(ctx, 0x289004)` /
  `note(ctx, 0x2938ae)` (counted placeholders) at every emitter site, not
  `spawnEffect`. `[M]` boss.js does not import effects.js.
* `BOSS_NOTED[0x289004]` (line 105) reads "deferred whole since W53" -- STALE:
  W54 shipped it. Another comment-that-lied.

So the gap is exactly the emitters. Item 1 alone makes the boss explode.

## 1. WHAT THE ROM ACTUALLY DOES (disassembled $2938AE..$294132, $28B4BE)

`[M]` TWO table-driven burst helpers sit back-to-back:

* `$2938AE` -- bucket `$0C`, 12-byte entries `[delay:2][kind:2][f1c:2][nudge:4]
  [loopctl:2]`, `$FFFF`-terminated. Per entry: spawn, `+$1C=f1c(byte)`,
  `+$18=delay`, `+$26=nudge(long)`, `+$02=d2(caller pos)`, `+$1E=$0C`,
  `+$12=0`, `+$14=0`; then if `loopctl!=0`, `bset (loopctl-1),$3(a4)`.
* `$2938F2` -- bucket `$04`, 12-byte entries `[delay:2][kind:2][f1c:2][nudge:4]
  [speedangle:2]` (NO loopctl; the 12th word is speed/angle). Same writes plus
  `+$1A=speedangle(word)`, `+$14=$0400`, then `jsr $242B3C` (rng angle) and
  `add.b d0,$1b(a0)`.

D-script 6's call sites (`[M]`):
* state 0 `$29412E bsr $2938AE` (table `$294154`, d2=`$2(a6)`).
* state-1 end `$2940F0 bsr $2938AE` (table `$2941B6`).
* timer B `$293E3A jsr $289004`: kind `$05`, bucket `$0C`, speed `$1A:$14`,
  angle=rng`$242B3C`, pos=boss, nudge `$F8000000`.
* timer A `$293E7E`/`$293EAA`: TWO kind-`$10` spawns, speed `$18`/`$14`,
  nudge `$E8000400`/`$F3FFF800`, angle=rng.
* timer C `$293F8C`/`$29403C`: kind from table `$2941E8` (16-byte entries
  `[kind:2][f1c:2][nudge:4][speedangle:2][pad:6]`), cursor `+$0E(a4)+=$10`,
  bucket `$0C`, `+$12=0`, `+$14=$0800`, pos=boss.
* state-2 toggle `$29409C jsr $28B4BE`: 5 spawns (kinds 4,7,4,5,5), each
  speed=`const>>d6`, angle=rng-byte d1 + (`$242B3C` asr.b #2), delays 0..6.

The part scripts (`[M]`): script 4/5 state 0 use `$2938AE` (pos `$22`/`$62(a6)`,
tables `$293AEE`/`$293D32`); state 2 use `$2938F2` (tables `$293B50`/`$293D94`).

`$242B3C` is an rng family member NOT yet in `src/rng.js` (table `$242BAC`,
256 bytes, no mask, far end pinned by `$242CAC`). Adding it.

## 2. THE STATE-0 BURST'S loopctl ARMS TIMER A

`[M]` table `$294154` entry 7 carries `loopctl=$0001`, so the state-0 burst
does `bset 0,$3(a4)` -- that is the timer-A gate. Porting the burst WITHOUT
loopctl would leave timer A permanently off and silence the state-1/2 kind-$10
spawns. loopctl is essential and is ported.

(see UPDATES below for the outcome)

## 3. WHAT I PORTED (all three items + part-scripts + the comment fix)

* **Item 1 (the two `$2938AE` table bursts).**  `burst2938AE` in `src/boss.js`
  transcribes `$2938AE` line for line (bucket `$0C`, 12-byte entries, loopctl
  `bset`).  Wired at state 0 (`$29412E`, table `$294154`) and state-1 end
  (`$2940F0`, table `$2941B6`).  ITEM 1 ALONE MAKES THE BOSS EXPLODE.
* **Item 2 (timer-C + the timer-A/B direct spawns).**  `timerCSpawn293F8C`
  transcribes the `$293F8C`/`$29403C` direct spawn (table `$2941E8`, 16-byte
  entries, `+$14=$0800`).  The timer-B (`$293E3A`, kind `$05`) and timer-A
  (`$293E7E`/`$293EAA`, two kind-`$10`) spawns are inlined in `d6Step293E04`
  with their exact field writes (speed byte, rng angle via `$242B3C`, nudge).
* **Item 3 (the `$28B4BE` big burst).**  `bigBurst28B4BE` transcribes all five
  particles (kinds 4,7,4,5,5; speed `const>>d6`; angle = rng-byte + `$242B3C`
  `asr.b #2`; delays 0..6).  Wired at the state-2 toggle (`$29409C`), gated on
  the existing every-second-tick toggle, with `$242EC2` drawn for the base
  angle byte.
* **Part-scripts.**  `burst2938F2` transcribes the OTHER helper (bucket `$04`,
  12-byte entries with a speed/angle word + `$242B3C` angle add).  The part
  state-0 detach burst (`$2938AE`, tables `$293AEE`/`$293D32`) and state-2
  retire burst (`$2938F2`, tables `$293B50`/`$293D94`) are wired in
  `partScriptStep`; positions come from `$22(a6)`/`$62(a6)`.
* **`$242B3C` added to `src/rng.js`** (`drawByte242B3C`, table `$242BAC`,
  256 bytes, no mask, far end pinned by `$242CAC`).
* **Comment fixes.**  `BOSS_NOTED[0x289004]` "deferred whole since W53" REMOVED
  (stale; W54 shipped it) -- the four death emitters are no longer notes.
  `BOSS_NOTED` dropped 14 -> 11 entries (the test floor followed).  The
  part-script header's "NOTHING sets a bit of `$3(a4)`" was WRONG (the state-0
  burst tables set bits via loopctl) -- corrected: the bits have no reader in
  the port because the emitter blocks they gate are not translated.
* **ROM windows.**  Seven windows added to `tools/export-tables.py` for the
  death tables (`$294154`, `$2941B6`, `$2941E8`, `$293AEE`, `$293B50`,
  `$293D32`, `$293D94`), each sized to include the `$FFFF` terminator and
  pinned at the far end by the next table or by code.

## 4. THE MUST-FAIL CHECK (seen RED, then GREEN)

`[M]` `.scratch/w107/check-burst.mjs` boots D-script 6 the way
`tests/w62stageend.test.js` section 3 does (`installScripts` + `a3Start259962`
+ `runScheduler25962E`), with the boss sub-record published and an on-screen
position, and counts pool-B live records (status word != 0):

| moment | pool-B live | kinds |
|---|---|---|
| BEFORE the fix, after state-0 step | **0** | -- (RED) |
| AFTER the fix, after INIT | 0 | (correct; init spawns nothing) |
| AFTER the fix, after state-0 step | **8** | `$85 $87 $0D $87 $87 $07 $05 $0D` |
| AFTER the fix, max over +40 frames | 22 | (timers A/B/C accumulating; no driver cull in this check) |

The 8 kinds on the state-0 frame are EXACTLY table `$294154`'s eight entries.
SEEDED (constructed D6 slot + sub-record), not reached through the page; the
boss death is at ~lf19533, past the capture ladder, and the rung boot hits the
known-unported `$29540C` (recon 99) before the death frame -- so a full
snapshot was impractical and this direct instrumentation is the next-best
check that demonstrably flips with the fix.

## 5. GATES

* `node --test games/ddpdoj/tests/`: **1211 pass, 0 fail, 0 skip, 0 todo.**
  (One W62 test's `BOSS_NOTED.length >= 14` floor was tightened to `=== 11`
  with a comment naming W107; the list-shape assertion it carries still holds.)
* `python tools/bosscoverage.py`: **103/0/8** (103 ported, 0 live-unported,
  8 dead -- no coverage regression).
* `python tools/oracle/pgm.py check`: **SEGMENTS 8 green, 0 red, 0 blocked**
  over 2000 logic frames; all five mutation stages RED OK (clamp-first,
  edge-after-store, no-tilt-decay, dy-off-by-one, no-phase-mask each diverged
  as they must).  The fly-around ladder tops out at lf4200, short of the boss
  death (~lf19533), so this confirms NO REGRESSION in the paths my changes
  touch -- the death emitters are only reached at the kill, which the ladder
  does not exercise.

## 6. ART FOR THE BOSS KINDS

`[M]` the eight kinds the death uses (`$03 $04 $05 $07 $0D $10 $85 $87`) all
have valid script-table entries in the `$221520`/`$221630` banks (descriptor +
duration list pointers in `$221..$222`), the same banks the already-shipped
enemy/midboss deaths draw from.  `$05`, `$0D` (handlers) and `$84`/`$85`
(midboss) are CONFIRMED to draw by other death arms.  `$03 $04 $07 $10 $87`
are boss-specific and not independently confirmed at the death frame (which is
past the capture ladder); they ride the same driver path and the same bank, so
if a stream the cartridge points to is missing from the atlas the record still
spawns but draws blank -- broken-and-declared, not faked, and not crashed.

