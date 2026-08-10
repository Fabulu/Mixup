# W209: Stage-3 boss low-HP phase

Status: COMPLETE

## Scope

Statically bound and translate the Stage-3 boss low-HP A4/F9 init `$29D16E`
and step `$29D180`, including direct same-pass dependencies required for a
playable transition out of the normal attack cycle.

## Starting state

- W208 is complete and live as build `20260810055153`.
- Stage 3's complete spawn script and normal boss attack cycle are live.
- Exact next branch: A4/F9 init `$29D16E`, step `$29D180`.

## Delivered

- Translated F9 `$29D16E/$29D180` and its exact 24-record randomized debris
  sequence, A2-object-8 stop, sounds, and packed-long RNG offsets.
- Translated F8 `$29D138/$29D146`, including its same-walk MAIN1, D2, E1, and
  E2 starts and the low-HP invulnerability release.
- Translated D2/D3 `$29C5F6/$29C606` and `$29C660/$29C672`, preserving the
  full 36-point opening and closing geometry loop and A2-object reactivation.
- Translated persistent E1/E2 `$29D400/$29D460` and `$29D556/$29D5C6` bullet
  patterns, plus E0 `$29D296/$29D29A` and its one mirrored type-`$99` pair.
- Added live type `$99` init `$29E580` and handler `$29E6B0`, including linked
  damage, opening/active animation, aimed fire, death effects, and the ROM's
  asymmetric second-aim carry behavior.
- Exported the eight reachable active type-`$99` animation streams. The browser
  bundle now contains 3,653 sprite streams.
- Enemy-family coverage is now 64/256. Stage 3 remains 414/414 spawn records
  and 28/28 script types.

## Verification

- Focused W209 low-HP regression and natural branch smoke: green.
- Handler/init registries and reusable coverage checks: green.
- Release boundary: 1,576/1,576 unit tests plus bundle, web-fetch, and ROM-leak
  gates green.
- Published and confirmed as build `20260810063544`.

## Delivery

- Implementation: `beeabf9`
- Registry-test follow-up: `b1eeb40`
- Public build: `20260810063544`
- Next live frontier: Stage-3 boss death A4/F1 init `$29CC34`, step `$29CC64`.
