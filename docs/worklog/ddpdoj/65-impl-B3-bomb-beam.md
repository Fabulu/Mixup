# W65 IMPL — B3: THE LASER BOMB `$249A80`

status: **IN PROGRESS**

wave: 65. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
date: 2026-08-05.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx..$2Axxxx`) unless a line says otherwise.
brief: **bombing while HOLDING THE BEAM throws at `$249A80`** (W64 §7). Port
`$249A80` and what it needs — `$255FE2` (the four-record bomb) and `$2456A6`
(the other 809 bytes of `$24560A`), sized by W64 at ~630 instructions.

`[M]` = measured by me this session.

## 0. THE PREMISE, CHECKED

**THE BRIEF HOLDS: `$249A5C tst.b ($3f,A6) / bne.b $249A80` is reached by
bombing while the beam is held, and `src/bomb.js` throws at `$249A80`.**
Four corrections to the documents that got me here:

| what a document says | `[M]` this session |
|---|---|
| W64 §7: "`src/laser.js` sets it at `$24C282`" | The instruction is `$24C282 move.b #$1,($3f,**A4**)` and `$24C2D6 move.b D0,($3f,**A4**)`. In `$24C164`'s frame **A4 is the PLAYER record and A6 is the OPTION POD** — `$24C2B6 move.b #$A,($3f,A6)` is the pod's own 9-frame counter and is a DIFFERENT byte. The substance survives (it is the player's `+$3f`); the register does not, and a port that copied the citation would have written the pod's byte |
| W64 §7 / HANDOVER: "~630 instructions" | **HOLDS. `[M]` 693**, closure over eleven entries: `$255FE2` 148, `$2456A6` **266**, `$2561AA` 107, `$2563B6` 56, `$289FF4` 34, `$28A1DA` 32, `$2562FC` 21, `$249A80`'s arm 17, `$256468` 16, `$24311A` 9, `$26085C` 3, `$256346` 1. (My own first count said 1,456 and was WRONG: the recursive-descent tracer follows a `bcc` displacement out of `$2561E6`'s neighbourhood into address `$000006` and disassembles 150 words of vector table as code. Recorded because a wave that reported "B2 under-sized this by 2x" would have been the twenty-seventh brief resting on something false, and it would have been mine.) |
| W64 §1.3 / `src/bomb.js:144` `poolWipe: 0x252714` | `$252714` **IS ALREADY PORTED** — `src/laser.js` `wipeSegmentPool`, W45. So is `$243DA0` (`armBombCancel243DA0`, W64) and `$23FF42` (W64). The arm's only unported callee is `$26085C` |
| recon 38 §1.3: "`($3F,A6)` — a DEATH bomb is a distinct path" | Stale by twenty waves. W45 settled that `($3f,A6)` is the LASER-HELD byte (`src/player.js:516`); "death" was the pre-W45 guess |

## LOG (appended as findings arrive)

- opened; read 64-impl-B2, 63-impl-B1, 38-recon, HANDOVER, knowledge 08.
- premise checked (§0). Four document corrections, none fatal.
- **THE SHAPE, and it explains a W64 mystery.** `$255FE2`'s A6 = `$811F72`;
  `$25600C lea ($7B0,A1),A1` puts the second record at A6+`$7E0` = record
  **42**, and `($7FE,A6)`/`($82E,A6)`/`($85E,A6)` are records 42/43/44's
  script pointers. `$2561AA` walks **41** records from `$811FA2` = record
  **1** (`moveq #$28,D7` + `dbra` = 41). **1 + 41 + 3 = 45.** So the LASER
  BOMB is what the 45-record table is SIZED FOR, and `$2564F0`'s
  `moveq #$2C,D7` is not the tidy-up W64 §10 could only call "the cartridge's
  own" — it is exactly this weapon's footprint.
