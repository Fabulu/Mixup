# W208: Stage-3 boss A4/F5 phase

Status: COMPLETE

## Scope

Statically bound and translate the next live Stage-3 boss scheduler frontier,
A4/F5 init `$29D0D4` and step `$29D0E2`, including direct same-pass
dependencies required to keep the natural boss path playable.

## Starting state

- W207 is complete and live as build `20260810053647`.
- Stage 3's 414-record spawn script and boss path through F4 are live.
- Exact next scheduler entry: A4/F5 init `$29D0D4`, step `$29D0E2`.

## Delivered

- Translated F5 `$29D0D4/$29D0E2`, E8 `$29E356/$29E3BA`, and F7
  `$29D100/$29D104`.
- F5 now arms the existing D4 through the exact returned A3 slot, waits for the
  centre assembly to open, then starts E8 and F7 in the cartridge's scheduler
  order.
- E8 runs the fixed row-4 first-loop pattern, including its immediate init
  volley, signed vector-table choice, target reuse, five-shot first-loop and
  seven-shot second-loop variants, difficulty ramps, self-retirement, and
  same-walk D5 start.
- F7 waits for both E8 and D5, observes the one-walk latch delay, and restarts
  the already-live F2 phase. This closes the normal attack cycle.
- Exported only `$29E356..$29E578`. There are no new sprite, palette, sound,
  effect, movement, or child-enemy assets.

## Verification

- Focused W207/W208 natural-path checks: 2/2 green.
- The product smoke reaches F5, D4, E8, D5, and F7, observes the exact five
  first-loop E8 call sites, and returns to F2 without an unported call.
- Release boundary: 1,575/1,575 unit tests plus bundle, web-fetch, and ROM-leak
  gates green.
- Published and confirmed as build `20260810055153`.

## Delivery

- Implementation: `d5929ef`
- Public build: `20260810055153`
- Next live frontier: low-HP A4/F9 init `$29D16E`, step `$29D180`.
