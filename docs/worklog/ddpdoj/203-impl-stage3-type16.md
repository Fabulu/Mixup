# W203: Stage-3 type `$16`

Status: COMPLETE

## Scope

Translate the next chronological Stage-3 family, type `$16` at record
`$234C92`, clock `$013D`, from one targeted static map. Include directly
reachable child families and visible assets. Run one focused behavior check
and one real Stage-3 spawn smoke.

## Starting state

- W202 is complete and live as build `20260810033630`.
- Stage 3 has 375/414 records and 26/28 script types translated.
- Global enemy registry coverage is 61/256.
- The browser bundle contains 3,493 sprite streams.
- Known entry: stub/body `$266D2E/$266D36`, handler `$266E34`, movement
  `$23553A..$235554`.

## Delivery

- Added the one-subrecord type-`$16` init and handler translation, including
  movement, horizontal wobble, damage/death, retargeting, ranked paired fire,
  animation, and the Stage-3/Stage-4 draw variants.
- Registered all 38 Stage-3 occurrences and exported the exact local ROM
  closure plus both 32-entry art tables.
- Added 64 sprite streams; the browser bundle now contains 3,557 streams.
- Stage-3 coverage is 413/414 records and 27/28 script types. Global enemy
  registry coverage is 62/256.
- The focused regression and real clock-`$013D` spawn smoke pass. The release
  gate completed and the production build is live.

## Publication

- Implementation commit: `7240c09` (`ddpdoj: translate stage 3 type 16`)
- Live build: `20260810035612`
- Next frontier: final Stage-3 type `$A0` at record `$234FA2`, clock `$01A7`,
  body `$29BBFC`, handler `$29BE28`.
