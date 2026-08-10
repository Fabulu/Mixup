# W204: Final Stage-3 type `$A0`

Status: COMPLETE

## Scope

Translate the final unsupported Stage-3 spawn family, type `$A0` at record
`$234FA2`, clock `$01A7`, using one targeted static map. Deliver its exact
entry/controller and first live arrival scheduler closure; retain a loud next
frontier for the later boss phases and child family.

## Starting state

- W203 is complete and live as build `20260810035612`.
- Stage 3 has 413/414 records and 27/28 script types translated.
- Global enemy registry coverage is 62/256.
- The browser bundle contains 3,557 sprite streams.
- Known entry: stub/body `$29BBF4/$29BBFC`, handler `$29BE28`, movement
  `$2356B0..$2356B6`.

## Delivery

- Added the ten-subrecord boss init, five scheduler-table installation, six
  palette installs, linked damage/timeout/death controller, and stage-advance
  wrapper.
- Added the exact F0 bootstrap, MAIN0 arrival movement/part placement, D7
  arrival driver, and pre-activated A2 object-9 draw path.
- Exported all 40 live object-9 arrival streams; the bundle now contains 3,597
  sprite streams.
- Stage 3's spawn script is closed at 414/414 records and 28/28 script types.
  Global enemy registry coverage is 63/256.
- The complete boss graph was mapped statically. Later A4/A1/A2 phases and the
  live type-`$99` child remain explicit delivery work; requested type `$9A`
  immediately frees itself at init and is not a live child dependency.
- 1,570 tests and the focused real clock-`$01A7` spawn/first-frame smoke pass.

## Publication

- Implementation commit: `eb781eb` (`ddpdoj: translate stage 3 boss entry`)
- Live build: `20260810042615`
- Next live frontier: Stage-3 boss A4/F2 init `$29D010`, followed by its
  remaining installed scheduler graph and type `$99` child.
