# W201: Stage-3 type `$19`

Status: COMPLETE

## Scope

Translate the next chronological Stage-3 family, type `$19` at record
`$234B32`, clock `$0110`, from one targeted static map. Include directly
reachable child families and visible assets. Run one focused behavior check
and one real Stage-3 spawn smoke.

## Starting state

- W200 is complete and live as build `20260810025504`.
- Stage 3 has 365/414 records and 24/28 script types translated.
- Global enemy registry coverage is 59/256.
- The browser bundle contains 3,491 sprite streams.
- Known entry: stub/body `$2671E0/$2671E8`, handler `$267226`, movement
  `$235656..$23565C` raw `3e4023404000`.

## Static boundary

Type `$19` occurs once and has no child graph. Its exact local closure is
`$2671E0..$26725A`, 122 bytes, SHA-256
`cce454ced9cbd0480cd1d86803d9b8fbaabb75e05c1565d15d6df6f00bb4d91d`.
The script-owned movement stream is intentionally unread. The object is an
invisible global pulse controller with no art, palette, audio, bullet, effect,
or death dependency.

## Delivered

- Registered init `$2671E8` and handler `$267226`.
- Preserved the fixed `$38001C00` position and the two byte-borrow timers that
  pulse `$8130E8` on call intervals `5,5,5,17`, repeating.
- Advanced Stage 3 from 365/414 to 366/414 records and from 24/28 to 25/28
  script types. Global enemy registry coverage advanced from 59/256 to 60/256.
- The browser bundle remains 3,491 sprite streams.

## Verification and release

- Focused init, 48-call cadence, and real clock-`$0110` spawn checks pass.
- Production release gate: 1,563/1,563 tests, bundle gate, web fetch gate, and
  ROM leak guard all pass.
- Implementation commit: `276bb1e`.
- Published and confirmed as build `20260810031033`.

## Next frontier

Stage-3 type `$83` at record `$234C1A`, clock `$011D`, body `$274B74`, handler
`$274C90`; movement `$2356EA..$235720`.
