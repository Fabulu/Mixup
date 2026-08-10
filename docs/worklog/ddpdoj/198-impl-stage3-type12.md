# W198: Stage-3 type $12

Status: COMPLETE

## Scope

Use W192's complete static Stage-3 census to translate the next chronological
unsupported family, type `$12` at record `$2348B2`, clock `$00E0`, together
with directly spawned child types `$13` and `$14` and all visible dependencies.
Run one focused behavior regression and one real Stage-3 spawn smoke.

## Starting state

- W197 is complete and live as build `20260810012425`.
- Stage 3 has 273/414 records and 21/28 enemy types translated.
- Types `$38`, `$39`, and `$3A` and all earlier records are live.
- The next unsupported record is `$2348B2`, type `$12`, body `$26C26E`, handler
  `$26C3E2`.

## Static boundary

Type `$12` directly spawns type `$14` during entry and type `$13` from its
central hatch, so a dependency-complete slice must include all three. Their
exact code/data union is `$265A54..$265BEC` plus `$26C266..$26D6EE`. The parent
has seven sub-records, six main states, linked root/side damage, staged death,
and five eight-frame draw tables. The two children add 16-frame and four-frame
art families. Exactly 60 new sprite streams are required.

## Delivered

- Translated the parent type `$12` at init `$26C26E`, handler `$26C3E2`, and
  its complete seven-part carrier state machine.
- Translated directly spawned child type `$13` at `$26D446/$26D4B4` and entry
  child type `$14` at `$265A5C/$265ADC`.
- Preserved linked root/side damage, phase transitions, deferred child spawns,
  ranked bullet patterns, freeze behavior, staged death, palette animation,
  screen clear, unfreeze, and all parent/child draw paths.
- Exported the exact runtime union `$265A54..$265BEC` and
  `$26C266..$26D6EE` and 60 distinct sprite streams. The browser bundle grew
  from 3,395 to 3,455 streams.
- Advanced Stage 3 from 273/414 to 274/414 records and 21/28 to 22/28 script
  types. Global enemy registry coverage advanced from 52/256 to 55/256.

## Verification and release

- Focused parent/child initialization, deferred-spawn, lifecycle, and real
  Stage-3 clock `$00E0` smokes pass.
- A reversible handler-address mutation made both focused smokes fail loudly,
  then the restored implementation passed.
- Production release gate: 1,556/1,556 tests, bundle gate, web fetch gate, and
  ROM leak guard all pass.
- Implementation commit: `6ff1a34df387c6fdc5769afe8179c2f9b36aae58`.
- Published and confirmed as build `20260810021530`.

## Next frontier

Stage-3 type `$3F` at record `$2348BA`, clock `$00EA`, body `$2657A0`, handler
`$265850`; movement `$2353AE..$2353B8` is
`748024008901c0102000`.
