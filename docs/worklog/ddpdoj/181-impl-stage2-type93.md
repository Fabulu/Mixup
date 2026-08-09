# W181: Stage-2 type `$93`

Status: COMPLETE, RELEASE PENDING

## Scope

Port the dependency-complete type `$93` family at the first chronological
unsupported stage-2 record `$232EF0`, clock `$0197`, init body `$279EC2`,
handler `$279F4A`, and movement index `$03D`. Verify the Version-B ROM closure
and advance the controlled boot to the next honest unsupported boundary.

## Starting state

- W180 is committed, pushed, and live as build `20260809112012`.
- Stage-2 coverage is 329/332 records with 3 unknown.
- The seeded boot completes 292 records and stops at `$279EC2`.
- The protected owner `c1_*.py` files and `NUL` remain out of scope.

## ROM closure

The exact stub-inclusive family is `$279EBA..$27A0E0`, `$226` bytes, SHA-256
`29080903c8db1fc11ba47080a535f7ecb7c271c5ee8c2a8f3c3e223e67983603`.
It contains the init, five palette pairs, two-word record prototype, one
long-form sub-record prototype, death-linger tail, handler, three death effects,
and the unreferenced 24-byte structural trailer before the type `$94` stub.
There is no cue script and no firing, bullet, or aim path.

The sole type `$93` record is `$232EF0`, clock `$0197`, movement index `$03D`.
Its movement stream `$2336A2..$2336A8` is `840009004000`: position `$8400,$0900`
and terminal heading `$40`.

## Port

`initbody.js` translates `$279EC2`: both prototype loaders, movement init, and
the stage-indexed palette writes. The prototype supplies body stream `$237470`,
HP `$0E00`, speed `$10`, selector word zero, and linger counter `$12`.

`handlers.js` translates `$279F4A`: movement, wrapped horizontal bounds,
unsigned `$0380` damage threshold, hit acknowledgement, palette flash, draw
through selector zero and `$27829C`, score `$15`, sound `$28C2DC`, and the exact
kind `$85/$0D/$85` pool-B death effects. Bit 7 on kind `$85` is preserved
because it selects pool-B table B. The death frame draws, then 18 decrement
frames draw before the 19th reaches `$27F8F0` with D1 `$FAC0FA40` and frees.

## Art and coverage

The only new type-specific stream is `$237470`: 642 mask words, 644-word full
stride, 2,891 colour words, and 8,671 opaque pixels. `export-web.mjs` adds it to
shard 17. The regenerated packed atlas has 2,743 streams, and an explicit
decoded-map check finds `$237470`.

Static coverage advances to 41/256 enemy types and 330/332 stage-2 records,
with two unknown records. The controlled boot completes 329 records with 324
allocations and five authentic declines, then stops honestly at record
`$233018`, clock `$01D5`, type `$86`, body `$275BB6`, shared handler `$275914`.

## Verification

- `python games/ddpdoj/tools/export-tables.py`: passed with exact closure,
  loader, call, effect-count, occurrence, movement, and frontier assertions.
- `node games/ddpdoj/tools/export-web.mjs`: passed; 2,743 streams.
- Focused W181 behavior: 4 passed, zero failed/skipped.
- Registry, coverage, integration, and both controlled-boot frontier checks
  pass after the measured five-decline expectation was recorded.
- Release gate, deployment, and live confirmation are pending.
