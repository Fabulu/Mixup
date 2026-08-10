# W213: Stage-4 type $A2

Status: COMPLETE

## Scope

Statically bind and translate all eight Stage-4 type `$A2` records beginning at
`$235930`, including their exact movement streams, init/prototypes, handler,
direct child graph, visible assets, and chronological next live frontier.

## Starting state

- W212 is complete and live as build `20260810074943`.
- Stage 4 covers 351/382 spawn records and 22/29 script types.
- First type `$A2` record: clock `$0036`, body `$27CFAC`, handler `$27D072`,
  movement `$236B66..$236B6E`.

## Delivered

- Bound all eight Stage-4 type `$A2` records and their two movement variants.
- Translated the one-subrecord init and handler, including the movement variant
  normalization, palette selection, horizontal sway, leave/re-entry lifetime
  latch, damage and low-HP palettes, opening/fire/closing state machine, mirrored
  bullet program, death effects, and exact lingering cleanup.
- Exported the 23 live art-table streams while excluding the adjacent
  unreachable twenty-fourth pointer and dead local allocation island.
- Confirmed that the family has no child enemy or deferred-enemy dependency.

## Verification

- Focused Stage-4 and affected integration checks: 20/20 passed.
- Reusable coverage: 67/256 enemy families; Stages 1, 2, and 3 remain fully
  covered.
- Release boundary: 1,584/1,584 tests passed.
- Bundle gate, web-fetch gate, ROM-leak guard, deployment, and three live
  confirmations passed.
- Implementation commit: `6281465`.
- Live build: `20260810082124`.

## Result and next frontier

Stage 4 now covers 359/382 records and 23/29 script types. The next unsupported
record is type `$9C` at `$235B48`, clock `$00E5`, body `$27AD96`, handler
`$27AEE0`, and movement `$236804..$23680E`.
