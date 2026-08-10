# W211: Stage-4 install and static census

Status: COMPLETE

## Scope

Statically own the complete Stage-4 spawn script, auxiliary movement index,
movement resource, terrain dependencies, type census, and chronological first
unsupported dependency-complete implementation frontier. Install the Stage-4
resources and deliver its opening playable slice without replaying completed
Stage-3 reconnaissance.

## Starting state

- W210 is complete and live as build `20260810065432`.
- Stage 3 is complete at 414/414 records, 28/28 script types, and 70/70 live
  boss scheduler entries.
- Stage-4 install row: `$263366`.
- Script `$2358B0`, aux `$2364A8`, resource `$2365E2`.
- First record: type `$A6` at clock 1, init/body `$278962/$27896A`, handler
  `$278994`.

## Static inventory

- The Stage-4 script contains 382 records across 29 types at
  `$2358B0..$2364A0`, followed by the all-`$FF` terminator.
- The auxiliary table contains 157 word offsets at `$2364A8..$2365E2` and the
  movement resource occupies `$2365E2..$237978`.
- Before this delivery, shared handlers already covered 345/382 records and
  20/29 types. The remaining 37 records belong to `$A6`, `$9B`, `$A2`, `$9C`,
  `$9D`, `$A3`, `$A1`, `$9F`, and `$40`.
- Stage 4 owns 210 background columns, 1,890 distinct tiles, and 32 palette
  banks in `$22B1E8..$22D770`.
- Clock-zero scroll setup installs object-palette bank `$16` and creates BGELEM
  id 5 before the first enemy record.

## Delivered

- Exported and installed the complete Stage-4 background, spawn script,
  auxiliary table, and movement resource.
- Added the deferred 1,890-tile Stage-4 background shard.
- Translated BGELEM id 5 constructor `$263180` and updater `$26319E`, including
  its `$2CCC74` sprite stream and bucket-2 render path.
- Translated type `$A6` body `$27896A` and handler `$278994` as the invisible
  alternating `$8130DA` pulse controller.
- Preserved the word-timer old-zero borrow, pause behavior, bullet-bias reload,
  alternating `+1/-1` pulse, and clock `$02E0` retirement.

## Verification

- Focused static and real Stage-4 opening regression: 2/2 passed.
- Reusable coverage and affected registry checks: 38/38 passed.
- Release boundary: 1,580/1,580 tests passed.
- Bundle gate, web-fetch gate, ROM-leak guard, deployment, and three
  consecutive live confirmations passed.
- Implementation commit: `88b0420`; registry/gate corrections: `4a4e9a4`,
  `0e09ff7`.
- Live build: `20260810072640`.

## Result and next frontier

Stage 4 now boots from the real Stage-3 transition, installs its terrain and
clock-zero structure, and consumes the clock-one `$A6` record. Coverage is
346/382 records and 21/29 types.

The next unsupported record is type `$9B` at `$2358E0`, clock `$0019`, body
`$27AC4A`, handler `$27ACE4`, and movement `$2367A6..$2367B2`.
