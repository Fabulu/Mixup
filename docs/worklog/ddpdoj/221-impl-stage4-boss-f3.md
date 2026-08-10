# W221: Stage-4 boss F3 first attack conductor

Status: COMPLETE

## Scope

Translate the next live Type `$40` scheduler pass beginning at A4/F3 init
`$2A092C` and step `$2A0984`, including its direct position helpers and the
concurrent MAIN1 restart exposed by a real next-pass smoke. Preserve the exact
A1 starts and stop at their first unported attack body.

## Starting state

- W220 is committed at `a9ad082`.
- MAIN0's handoff, D9/D10, and A2 objects 0 through 5 are live.
- F3 is armed after the A4 walk and begins on the following scheduler pass.

## Delivered

- Translated the complete six-state A4/F3 conductor through its alternating
  E1/E2 selection, paired attack phases, final dual attack, self-retirement,
  and A4/F4 handoff.
- Preserved the old-zero byte timers, result-zero repetition counters, dynamic
  cadence reduction, state fall-through, returned-slot parameter writes, and
  silent A1 overflow behavior.
- Translated the directly used 24-position helpers: C6 advances with wrap at
  24 while E6 retreats with wrap to 23.
- The focused natural-pass smoke exposed MAIN1 `$29F790/$29F7A2`, which the
  preceding handoff restarts concurrently with F3. Added its four-waypoint
  aim, one-step slew, distance gate, and shared linked-part placement tail.
- Exported the exact F3 closure and two-entry selector table, the complete A1
  pointer table, the position-helper block, and MAIN1 with its waypoint data.
  F3 itself adds no sprite, palette, sound, effect, or bullet assets.

## Focused verification

- `node --test games/ddpdoj/tests/w221stage4boss.test.js`: 2/2 green.
- The real post-MAIN0 scheduler pass initializes F3, consumes exactly two RNG
  words, moves both boss selectors in their authentic directions, initializes
  MAIN1 in the same pass, and continues rendering without an unknown script.
- The direct conductor fixture proves the alternating zero-parameter E1 start
  and the parameter-2 E2 handoff with returned-slot writes.
- No full suite was run.

## Result and next frontier

The Stage-4 boss now enters and runs its complete first attack conductor. The
next genuine live dependency is A1/E1 init `$2A17E6`, step `$2A17F8`; E2 init
`$2A20A8`, step `$2A20BA` is the paired dependency selected by the same F3.
