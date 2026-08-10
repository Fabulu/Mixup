# W206: Stage-3 boss A4/F3 phase

Status: COMPLETE

## Scope

Statically map and translate the next live Stage-3 boss scheduler frontier,
A4/F3 init `$29D03E` and step `$29D068`, grouping its direct same-pass
dependencies into one playable delivery slice.

## Starting state

- W205 is complete and live as build `20260810045925`.
- Stage 3's 414-record spawn script and normal boss arrival through
  F2/MAIN1/E6/E7 are live.
- The browser bundle contains 3,645 sprite streams.
- Exact next scheduler entry: A4/F3 init `$29D03E`, step `$29D068`.

## Delivered

- Translated F3 `$29D03E/$29D068`, same-pass MAIN2
  `$29C412/$29C41A`, D4 `$29C766`, E5 `$29E100/$29E14C`, D5
  `$29C782/$29C788`, and the F6 rendezvous `$29D086`.
- Added the exact A3 start return-value path. A fresh `$259962` claim returns
  its real slot so F3 can seed D4's timer bytes; a duplicate or full table
  returns the ROM's `$812BB4` overflow block. Existing boolean callers retain
  their previous interface.
- Extended the runtime ROM export through E5's parameter rows and code at
  `$29E016..$29E356`. The first green attempt reached `$29E0FC` and failed
  loudly before this missing ownership window was added.
- MAIN2 now performs the narrower horizontal steering pass, D4 opens the
  centre assembly from `$00` to `$18`, E5 emits all six ROM muzzle vectors,
  and D5 closes the assembly back to zero before F6 hands off.
- No new sprite, palette, effect, or audio asset family is needed.

## Verification and publication

- The red natural boss smoke originally stopped at F3 `$29D03E`.
- After translation it observes MAIN2, D4, E5, D5, and all six E5 bullet
  generator sites, then stops honestly at the next A4/F4 init `$29D0A6`.
- Focused W204-W206 plus scheduler regressions: 50/50 green.
- Release gate: 1,573/1,573 tests, bundle gate, web fetch gate, and ROM-leak
  guard green.
- Implementation commit: `d81a3e5` (`ddpdoj: translate stage 3 boss F3 phase`).
- Live build: `20260810051650`.
- Next live frontier: A4/F4 init `$29D0A6`, step `$29D0BE`.
