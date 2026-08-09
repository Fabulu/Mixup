# W189: Stage-2 boss F1, F2, and F8 phases

Status: READY TO PUBLISH

## Scope

Statically map and translate the three remaining directly reachable stage-2
boss phase conductors: A4/F1 at `$298CE2/$298D24`, A4/F2 at
`$298DC2/$298E02`, and A4/F8 at `$299882/$2998AA`. Include compact same-frame
scheduler dependencies, reuse existing helpers, and advance the playable boss
through damage phases and death without repeating the completed W183-W187
controller and attack-cycle analysis.

## Starting state

- W188 is committed, pushed, and live as build `20260809204248`.
- Stage-2 spawn coverage is 332/332 with zero unsupported spawn records.
- The complete F3/E6-E11 attack cycle and all initially armed boss scripts run.
- The next honest gameplay phase entries are F1, F2, and F8.
- Static ROM analysis precedes implementation; verification is limited to one
  focused regression and one seeded product smoke unless a concrete defect
  requires more.

## Static findings

### F1 and MAIN3

F1 is `$298CE2..$298DC2`. Its init falls into state 0, emits four pool-B
effects, enters state 1 in the same call, and immediately posts the first
alternating death sound. It arms MAIN3 `$297BE8/$297BFC`, which executes later
in the same scheduler pass and approaches the phase assembly point. F1
preserves the cartridge's literal cursor bug: the sound cursor at `+$14`
advances without masking because the `andi.w #$1F` accidentally targets
`+$08`. On expiry it stops A2 object 2 and schedules F4.

### F2 death presentation

F2's complete local closure is `$298DC2..$299194`. It arms the persistent
MAIN1 death drift, loads a no-fill palette-animation chain through `$246520`,
cycles 16 ten-byte effect rows, runs a separate eight-particle burst, fades the
boss palette, retires every A2 object, and enters the final blast.

The final blast at `$2440E0` clears pool B, installs 39 effect records, adds a
kind `$1E` foreground effect, and arms screen-shake mode 1. The shake's exact
42 nonzero pairs at `$260F4C` now run and terminate by clearing the camera
offsets. F2 then waits `$80` calls, suspends the scheduler, and lets the wrapper
advance the stage.

Pool D remains an explicit fidelity frontier. The pool-B effects request their
secondary debris through `$289098`, but the existing safe refusal still counts
and suppresses those allocations because the pool-D driver and art are not yet
ported. The primary death presentation, palette change, blast, sound, and shake
are complete.

### F8, D10, and E15

F8 is `$299882..$2998AC`. It persists after arming D10 and E15. D10 retracts
the central draw offset every other scheduler call and retires at zero. E15
aims at the live player, uses the existing 256-heading and bullet generators,
and alternates `$281744/$281776`. At low HP it adds the ROM speed boost and,
when the mirror gate permits, performs two full aim and RNG iterations.

Static analysis also corrected the Stage-2 A1 table extent: it contains 16
pairs through `$29992C`, not the 14 pairs previously exported. Entries 14 and
15 are now present, and E15 is registered.

## Implementation

- Added F1, F2, and F8 plus same-frame MAIN1, MAIN3, D10, and E15 scripts.
- Added the `$246520` no-fill palette animation loader.
- Added the `$259924` stop-all A2 scheduler primitive.
- Added the exact `$28B34A` eight-particle burst and `$2440E0` 39-row blast.
- Replaced the counted screen-shake note with the complete mode-1 sequence.
- Extended the runtime ROM export with all phase closures, data tables, and
  their SHA-256 pins.
- Extended the A1 pointer table export from 14 to 16 entries.

## Verification

- Focused phase gate: 10/10 green across W186, W187, and W189.
- F1 regression proves four effects, the first sound, both init fall-throughs,
  and same-pass MAIN3 dispatch.
- F8 regression proves same-pass E15 and D10 dispatch plus live bullet output.
- F2 regression proves same-pass MAIN1, 40 final effects, and all 42 shake
  frames through the terminator.
- Existing seeded Stage-2 product smoke: 4/4 green, including the 9,000-frame
  boss attack-cycle run.
- Release unit gate: 1,537/1,537 green. The initial run exposed the stale
  14-entry A1 membership census; extending it to the ROM's 16 entries restored
  the single failure without rerunning the other 1,536 unchanged tests.
- Published-bundle gate: 15,955,968/15,955,968 pixels identical to MAME.
- Real HTTP asset gate: green with 2,978 sprite streams and no new art harvest.

## Result and next frontier

The remaining directly reachable Stage-2 boss phase conductors are translated.
Damage thresholds can now enter the part-loss and low-HP phases, and boss death
can run through the final blast, screen shake, scheduler suspension, and stage
advance. The next normal-play frontiers are F4 init `$2993B4` and conditional
MAIN5 init `$297CC2`, both scheduled for a later pass by F1/MAIN3. Pool-D
secondary debris remains a separate visible fidelity closure.
