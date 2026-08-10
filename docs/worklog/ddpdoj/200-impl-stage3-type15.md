# W200: Stage-3 type `$15`

Status: COMPLETE

## Scope

Translate the next chronological Stage-3 family, type `$15` at record
`$234AF2`, clock `$010D`, from one targeted static map. Include direct child
types and visible dependencies if the live handler reaches them. Run one
focused behavior regression and one real Stage-3 spawn smoke.

## Starting state

- W199 is complete and live as build `20260810022824`.
- Stage 3 has 358/414 records and 23/28 script types translated.
- The browser bundle contains 3,455 sprite streams.
- Known entry: stub/body `$265BEC/$265BF4`, handler `$265CA0`, movement
  `$235386..$235390` raw `bf40f5008901c0041a00`.

## Static boundary

Type `$15` directly creates type `$17` on six of its seven occurrences and
type `$18` at clock `$0168`, so the dependency-complete slice includes all
three families. Their exact contiguous ROM closure is `$265BEC..$266960`,
3,444 bytes, SHA-256
`713f2ba066e0eacb0f28c98d51f616e9d4ea082ed06585bc7919d22d9395e13b`.
The seven parent records use four movement streams. Types `$17` and `$18` have
no direct Stage-3 script records.

## Delivered

- Registered init and handler pairs `$265BF4/$265CA0`, `$265DF0/$265E84`,
  and `$266324/$2663E0`.
- Preserved the parent carrier's four-piece bounded draw, exact deferred child
  class selection, both child damage and acceleration phases, their alternating
  attack conductors, seven-row death sequence, screen clear, and linger.
- Exported 32 table-driven and four immediate sprite streams. All 36 were new,
  advancing the browser bundle from 3,455 to 3,491 streams.
- Advanced Stage 3 from 358/414 to 365/414 records and from 23/28 to 24/28
  script types. Global enemy registry coverage advanced from 56/256 to 59/256.

## Verification and release

- Focused init/deferred-child, four-piece draw, type `$17`/`$18` first-volley,
  and real clock-`$010D` spawn checks pass.
- Production release gate: 1,561/1,561 tests, bundle gate, web fetch gate, and
  ROM leak guard all pass.
- Implementation commit: `f8063ba`.
- Published and confirmed as build `20260810025504`.

## Next frontier

Stage-3 type `$19` at record `$234B32`, clock `$0110`, body `$2671E8`, handler
`$267226`; movement `$235656..$23565C` is `3e4023404000`.
