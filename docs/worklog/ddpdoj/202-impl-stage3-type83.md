# W202: Stage-3 type `$83`

Status: COMPLETE

## Scope

Translate the next chronological Stage-3 family, type `$83` at record
`$234C1A`, clock `$011D`, from one targeted static map. Include directly
reachable child families and visible assets. Run one focused behavior check
and one real Stage-3 spawn smoke.

## Starting state

- W201 is complete and live as build `20260810031033`.
- Stage 3 has 366/414 records and 25/28 script types translated.
- Global enemy registry coverage is 60/256.
- The browser bundle contains 3,491 sprite streams.
- Known entry: stub/body `$274B6C/$274B74`, handler `$274C90`, movement
  `$2356EA..$235720`.

## Delivered

- Registered init `$274B74` and handler `$274C90` for all nine Stage-3 type
  `$83` records.
- Translated the two linked hitboxes, signed-min HP synchronization, palette
  flash, three threshold cues, aimed five-shot volley, animated offset state,
  and both randomized 6/5/4 bullet rings.
- Translated the three-effect death sequence, score, sound, and free path.
- Added the two Stage-3-visible streams `$17388C/$173C80`; the unreachable
  Stage-3-only `$173F24` branch remains intentionally unharvested.
- Advanced Stage 3 from 366/414 to 375/414 records and 25/28 to 26/28 script
  types. Global enemy registry coverage is 61/256.
- Advanced the browser sprite bundle from 3,491 to 3,493 streams.

## Verification and release

- Focused linked-damage, draw, five-shot, and 30-shot regression passed.
- Real Stage-3 clock-`$011D` spawn smoke passed and advances the cursor to
  `$234C22`.
- Production release gate passed: 1,565/1,565 tests, bundle/fetch checks, and
  ROM-leak guard.
- Implementation commit: `e4d7759`.
- Live build: `20260810033630`.

## Next frontier

Type `$16` at record `$234C92`, clock `$013D`; stub/body
`$266D2E/$266D36`, handler `$266E34`, movement `$23553A..$235554`.
