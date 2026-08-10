# W220: Stage-4 boss first live scheduler closure

Status: COMPLETE

## Scope

Continue the Type `$40` boss from W219's arrival handoff. Translate the exact
same-walk A3/D9 and D10 entries and the six A2 objects armed after them, with
their visible assets, then stop at the next scheduler-pass frontier. Use the
existing bounded ROM inventory and one focused runtime smoke.

## Starting state

- W219 is committed at `66a063a`.
- Stage 4 has 382/382 spawn records and 29/29 script types.
- The visible boss arrival is live through MAIN0 and A2 object 10.
- MAIN0's terminal handoff starts A4 id3 and A3 ids9 and10. Scheduler order
  reaches D9 `$2A15BE`, then D10 `$2A15DE`, before A2 objects 0 through 5 in
  the same walk. A4/F3 `$2A092C` begins on the next scheduler pass.

## Delivered

- Corrected the stale D9 address from table id 5 `$2A1506` to the actual id 9
  row `$2A15BE`; D10 is `$2A15DE`.
- Translated D9's target aim and one-step 64-way slew from the root turret
  position.
- Translated D10's four synchronized modulo-$20 animation cursors.
- Translated A2 objects 0 through 5 with their exact linked positions, table
  selectors, dimensions, attributes, palette bytes, and bucket-3 emitter.
- Exported the complete A3 pointer table and the two live routines.
- Shipped 64 new distinct boss-part streams from five tables. The physical
  mirrored-pod table repeats the same eight pointers three times; the exporter
  ships that unique block once. The bundle grows from 3,838 to 3,902 streams.

## Focused verification

- `node --test games/ddpdoj/tests/w220stage4boss.test.js`: 2/2 green.
- The forced authentic MAIN0 terminal pass runs D9 and D10 in the same A3
  walk, advances all four cursors, slews the aimed heading, arms objects 0
  through 5, and submits six exact bucket-3 records.
- Narrow Stage-4 integration W211 through W220: 22/22 green.
- No full suite was run.

## Result and next frontier

The Stage-4 boss arrival handoff no longer stops in the middle of its first
scheduler pass. The complete visible body is present immediately when MAIN0
hands control to the attack conductor.

The next honest live frontier is A4/F3 init `$2A092C`, step `$2A0984`, and its
direct position helpers `$2A1720/$2A174C`. It begins on the next scheduler
pass and owns the first A1 attack selections.
