# W219: Stage-4 Type `$40` boss arrival

Status: COMPLETE

## Scope

Translate the final Stage-4 spawn record and its dependency-complete arrival
bootstrap: Type `$40` init/wrapper, the linked damage controller through its
first phase handoff, A4/F0, MAIN0, initially visible A2 object 10, palettes,
placement, and arrival art. Keep the first later scheduler entry loud.

## Starting state

- W218 Type `$9F` and live `$A4` are committed at `1f832e8`.
- Stage 4 covers 381/382 spawn records and 28/29 script types.
- The final record is `$236498`, clock `$02E8`, Type `$40`.

## Delivered

- Registered Type `$40` body `$29EC82` and handler `$29EF0A`.
- Loaded all thirteen long-form subrecords, the `$00046000` boss HP, the five
  scheduler tables, three initial palette banks, HUD pointers, and boss flags.
- Translated A4/F0 `$2A017A/$2A019A`, including its same-call fall-through,
  MAIN0 `$29F5BC/$29F5FE`, the shared `$29F50E` linked-part placement, and A2
  object 10 `$29F3F0`.
- Preserved MAIN0's word-sized speed/heading initialization, descent vector,
  sixteen-frame body selector, palette transition, and scheduler handoff.
- Translated the linked-hit controller's maximum-delta damage rule, deferred
  half-damage from the two outer hitboxes, gated palette flashes, timeout, and
  first phase threshold. Low-HP and death conductors remain explicit loud
  frontiers rather than incomplete silent behavior.
- Exported the three ROM envelopes used by this slice and all sixteen distinct
  arrival streams from `$29F414`. The sprite bundle grows from 3,822 to 3,838
  streams.

## Focused verification

- `node --test games/ddpdoj/tests/w219stage4boss.test.js`: 3/3 green.
- The real clock `$02E8` spawn consumes the final record, allocates thirteen
  subrecords, installs all tables, runs F0 and MAIN0 in the same scheduler
  pass, and submits the authentic bucket-7 body sprite.
- The damage fixture proves largest linked damage, HP rearm, and the `$5F`
  palette-flash gate.
- Narrow Stage-4 integration W211 through W219: 20/20 green.
- No full suite was run.

## Result and next frontier

Stage 4 now has complete spawn coverage: 382/382 records and 29/29 script
types. The boss is visible and running its authentic arrival rather than
stopping at the final spawn record.

This is not yet the complete Stage-4 boss. MAIN0 eventually arms A3/D9 and
D10; scheduler order reaches D9 init `$2A1506` and step `$2A150C` in that same
walk. W220 owns that first live arrival scheduler closure and continues toward
the normal attack, low-HP, death, and Stage-5 transition graph.
