# W223: Stage-4 boss F4 conductor

Status: COMPLETE

## Scope

Translate the next live Stage-4 boss scheduler closure beginning at A4/F4 init
`$2A0BCC` and step `$2A0BDE`. Follow its same-pass scheduler descendants until
the next genuine live frontier, using the existing ROM and one focused smoke.

## Starting state

- W222 is committed at `fc549fe`.
- The complete F3 and mirrored E1/E2 attack cycle retires naturally.
- F3 starts A4/F4, whose init is the next registered-table entry not yet
  translated.

## Delivered

- Translated F4 `$2A0BCC/$2A0BDE`, including its same-call state fallthroughs,
  five exact E5 parameter rows, E3 retirement, D2 close, and return to F3.
- Translated A3/D1 `$2A1462/$2A1468` and D2 `$2A1486/$2A148C`.
- Translated A1/E3 `$2A280C/$2A282E`, preserving the 19-call bullet order and
  signed-byte heading lookup.
- Translated A1/E5 `$2A2CC2/$2A2CC8`, including both mirrored type-$41 spawn
  arms, byte RNG construction, deferred-queue overflow behavior, and duration.
- Added the type-$41 body `$2A37E4` and handler `$2A3840`. Its 28-byte prototype
  legally overlaps the first handler word. The handler decelerates, aims,
  accelerates, animates, and renders through the extent-scaled bucket-22 path.
- Preserved `$29EC22` screen-clear removal behavior. Its `$27F8F8` impact
  picture remains a counted presentation dependency only when that global
  clear path is active; normal boss play is complete.
- Exported the exact new code/data windows plus `$283D0C..$283D4C`. Type $41
  selects the existing shipped bullet sprite family, so the web sprite bundle
  requires no new streams.

## Focused verification

`node --test games/ddpdoj/tests/w223stage4boss.test.js games/ddpdoj/tests/w222stage4boss.test.js`

Result: 6/6 pass. The smoke proves natural F3-to-F4 handoff, all five E5 rows,
F4-to-F3 return, the E3 19-shot call sequence, deferred type-$41 construction,
and one real bucket-22 scaled draw.

## Next live frontier

The normal first-phase attack loop is closed. The next live Stage-4 boss path
is the low-HP transition at `$29FE52`; fatal damage remains the separate death
conductor at `$29FE8A`.
