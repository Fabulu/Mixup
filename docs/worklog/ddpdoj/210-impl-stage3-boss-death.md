# W210: Stage-3 boss death and stage advance

Status: COMPLETE

## Scope

Statically bind and translate the final live Stage-3 boss scheduler entry,
A4/F1 init `$29CC34` and step `$29CC64`, including its direct death,
presentation, suspension, and stage-advance dependencies.

## Starting state

- W209 is complete and live as build `20260810063544`.
- Stage 3's 414-record spawn script, normal boss cycle, and low-HP loop are live.
- Exact next branch: A4/F1 init `$29CC34`, step `$29CC64`.

## Delivered

- Translated A4/F1 init `$29CC34` and step `$29CC64` through the complete
  five-state death presentation.
- Preserved the three-node no-fill palette chain, 16-row debris sequence,
  randomized eight-particle bursts, fade wait, 16-node filled palette chain,
  39-effect final blast, mode-1 shake, scheduler suspension, and next-frame
  stage advance.
- Reused the shared `$2440E0` final blast through the exported
  `finalBlast2440E0` helper instead of duplicating its 39-row behavior.
- Added the exact `$29CC34..$29D010` runtime window and ROM closure assertion.
- Updated the Stage-3 coverage frontier to the Stage-4 install triple at
  `$263366`.

## Verification

- Independent static audit found no mismatch against the exact ROM closure
  `$29CC34..$29D010`, SHA-256
  `4c29a54ba9bc6b0107809cf08a87a21dd93550c1b9e297e0c796711fe45b9116`.
- Focused W210 and coverage checks: 5/5 passed.
- Release boundary: 1,578/1,578 tests passed.
- Bundle gate, web fetch gate, ROM-leak guard, deployment, and three
  consecutive live confirmations passed.
- Implementation commit: `c42540f`.
- Live build: `20260810065432`.

## Result and next frontier

Stage 3 is complete end to end: 414/414 spawn records, 28/28 script types,
and 70/70 live boss scheduler entries. The boss death sequence now suspends
the scheduler, advances internal stage index 2 to 3, and installs Stage 4.

The next honest delivery is the Stage-4 static install/census slice:

- install row `$263366`
- script `$2358B0`
- aux `$2364A8`
- resource `$2365E2`
- first record type `$A6` at `$2358B0`, init/body `$278962/$27896A`, handler
  `$278994`
