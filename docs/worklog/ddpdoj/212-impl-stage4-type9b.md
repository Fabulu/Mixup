# W212: Stage-4 type $9B

Status: COMPLETE

## Scope

Statically bind and translate all five Stage-4 type `$9B` records beginning at
`$2358E0`, including their exact movement streams, init/prototypes, handler,
direct child graph, visible assets, and chronological next live frontier.

## Starting state

- W211 is complete and live as build `20260810072640`.
- Stage 4 covers 346/382 spawn records and 21/29 script types.
- First type `$9B` record: clock `$0019`, init/body `$27AC42/$27AC4A`, handler
  `$27ACE4`, movement `$2367A6..$2367B2`.

## Delivered

- Bound all five Stage-4 type `$9B` records and their four movement streams.
- Translated the two-subrecord init and handler, including the movement and
  scroll path, X-region leave/re-entry latch, linked hit rearm, expanding
  vertical separation, second-body visibility threshold, and lifetime free.
- Installed the clock-dependent palette bank and exported the two direct
  sprite streams `$2AF6CC` and `$2AECC8`.
- Confirmed that the family has no child enemy, bullet, effect, or audio
  dependency.

## Verification

- Focused and affected checks: 40/40 passed.
- Release boundary: 1,582/1,582 tests passed.
- Bundle gate, web-fetch gate, ROM-leak guard, deployment, and three live
  confirmations passed.
- Implementation commit: `1820dd3`; cumulative sprite-count correction:
  `48d556a`.
- Live build: `20260810074943`.

## Result and next frontier

Stage 4 now covers 351/382 records and 22/29 script types. The next unsupported
record is type `$A2` at `$235930`, clock `$0036`, body `$27CFAC`, handler
`$27D072`, and movement `$236B66..$236B6E`.
