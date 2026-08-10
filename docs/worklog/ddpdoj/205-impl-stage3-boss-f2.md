# W205: Stage-3 boss A4/F2 arrival phase

Status: COMPLETE

## Scope

Translate the next live Stage-3 boss scheduler frontier, A4/F2 init `$29D010`
and its direct same-pass dependencies. Reuse W204's completed static boss map,
run one focused scheduler check and one product smoke, then continue through the
installed boss graph.

## Starting state

- W204 is complete and live as build `20260810042615`.
- Stage 3's spawn script is 414/414 records and 28/28 script types.
- Boss entry/controller plus F0, MAIN0, D7, and A2 object 9 are live.
- The browser bundle contains 3,597 sprite streams.
- Exact next scheduler entry: A4/F2 init `$29D010`, step `$29D028`.

## Delivered

- Translated F2 `$29D010/$29D028`, same-pass MAIN1 `$29C3A4/$29C3AC`, and
  the complete E6/E7 attack leaves `$29DCEE/$29DD3E` and
  `$29DECA/$29DF26`.
- Closed D7's concurrent arrival handoff through D0, D1, D6, and A2 objects
  0 through 8. D0 authentically reclaims D7's already-visited slot and begins
  on the next scheduler walk; D1 and D6 run in the current walk.
- Exported the 48 newly visible A2 streams. The web sprite bundle rises from
  3,597 to 3,645 streams; objects 6/7 reuse the existing `$272D7A` family.
- A direct ROM check corrected two implementation defects found by the new red
  regression: MAIN1 now preserves raw RNG below Y `$5C00`, and E7 alternates
  its even/odd 2-shot/1-shot loop for exactly 17 generator calls per side.
  E7's two counters intentionally share the reload byte at slot `+5`.

## Verification and publication

- Focused W204/W205 checks: 5/5 green.
- Natural Stage-3 boss-arrival smoke reaches D0/D1/D6, all nine A2 draws,
  F2, MAIN1, E6, and E7 without an unported dispatch.
- Release gate: 1,572/1,572 tests, bundle gate, web fetch gate, and ROM-leak
  guard green.
- Implementation commit: `83281f2` (`ddpdoj: translate stage 3 boss arrival phase`).
- Live build: `20260810045925`.
- Next live frontier: A4/F3 init `$29D03E`, step `$29D068`.
