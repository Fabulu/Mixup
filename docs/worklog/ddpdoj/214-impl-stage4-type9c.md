# W214: Stage-4 type $9C

Status: COMPLETE

## Scope

Statically bind and translate all eleven Stage-4 type `$9C` records beginning
at `$235B48`, including their exact movement streams, init/prototypes, handler,
direct child graph, visible assets, and chronological next live frontier.

## Starting state

- W213 is complete and live as build `20260810082124`.
- Stage 4 covers 359/382 spawn records and 23/29 script types.
- First type `$9C` record: clock `$00E5`, body `$27AD96`, handler `$27AEE0`,
  movement `$236804..$23680E`.

## Delivered

- Translated all eleven Stage-4 type `$9C` records, their eleven movement
  streams, root controller, normal and mirrored paired satellites, collision,
  fire, damage, death, effects, audio, and four newly reachable sprite streams.
- Extended `$2637A2` prototype loading for the ROM's caller-supplied run-length
  entry at `$2637A6` without changing existing callers.
- Added one focused static/runtime regression and a real clock `$00E5` spawn
  smoke. The focused and affected checks passed before publication.
- Stage 4 now covers 370/382 records and 24/29 script types. Enemy registry
  coverage is 68/256.

## Verification and publication

- Implementation commit: `c88b435`.
- Release gate: 1,586/1,586 tests, bundle gate, web fetch gate, ROM-leak guard,
  deployment, and three live confirmations all passed.
- Live build: `20260810085716`.

## Next frontier

The next unsupported Stage-4 record is type `$9D` at `$235FF0`, clock `$01D8`,
raw `01d800009d81100f`. Registry row `$27E4FA` points to stub/body
`$27B2F6/$27B2FE` and handler `$27B78A`. Movement index `$00F` resolves to
`$2367CE..$2367D4`, raw `aa0024004000`.
