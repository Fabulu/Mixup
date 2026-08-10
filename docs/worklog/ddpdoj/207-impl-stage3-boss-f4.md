# W207: Stage-3 boss A4/F4 phase

Status: COMPLETE

## Scope

Statically map and translate the next live Stage-3 boss scheduler frontier,
A4/F4 init `$29D0A6` and step `$29D0BE`, grouping its direct same-pass
dependencies into one playable delivery slice.

## Starting state

- W206 is complete and live as build `20260810051650`.
- Stage 3's complete spawn script and boss path through F3/MAIN2/E5 are live.
- The browser bundle contains 3,645 sprite streams.
- Exact next scheduler entry: A4/F4 init `$29D0A6`, step `$29D0BE`.

## Delivered

- Translated F4 `$29D0A6/$29D0BE`, same-pass MAIN3
  `$29C480/$29C488`, E3 `$29D80A/$29D852`, and E4
  `$29D9E4/$29DA52`.
- E4 now runs both aimed `$281726` shots, eight mirrored `$281764` shots, and
  six `$2817A8` fan shots with the ROM's byte-angle arithmetic, bounce limits,
  target-priority toggle, and terminal tuning writes.
- E3 now runs both independent timers and enqueues the ROM's type `$9A`
  requests with their biased positions and rotating pattern cursor.
- Added the exact type `$9A` init+8 body `$29EAE2`: it immediately jumps to
  `freeEnemy`. The adjacent handler is a dead alternate entry and remains
  unavailable.
- Exported only the 16-byte `$29EADA..$29EAEA` self-free proof. No new sprite,
  palette, effect, bullet, or audio asset family is needed.

## Verification

- The red natural boss smoke originally stopped at F4 `$29D0A6`.
- After translation it observes MAIN3, E3, E4, drains multiple self-freeing
  `$9A` requests, sees all sixteen E4 bullet sites, and stops honestly at the
  next A4/F5 init `$29D0D4`.
- Focused W206/W207 plus scheduler regressions: 46/46 green.
- The release boundary passed 1,574/1,574 unit tests plus the bundle, web-fetch,
  and ROM-leak gates.
- Published and confirmed as build `20260810053647`.

## Delivery

- Implementation: `90dd1b4`
- Registry-count follow-up: `1485aea`
- Public build: `20260810053647`
- Next live frontier: A4/F5 init `$29D0D4`, step `$29D0E2`.
