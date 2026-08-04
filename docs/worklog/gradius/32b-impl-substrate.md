# Wave 32b IMPLEMENTER -- the `$0600` arm substrate and the `$5C` half-rate frame fork

status: IN PROGRESS
implementer, 2026-08-04

Scope, from the brief and `32-recon-destructible-terrain.md` §8 + `32a-impl-b559.md` §4:
**W32b only.** The `$0600` 4-group x `$30`-byte articulated ARM pool and the
`$9663` half-rate frame fork. NOT W32c (`$CBD1` arms fire, `$BEF3`/`$BF0B` shot
destroys an arm, `$C263` arm kills the player).

---

## BASELINE, MEASURED BEFORE ANY EDIT

`python games/gradius/tools/oracle/stageledger.py` (note: the brief's path
`games/gradius/tools/stageledger.py` does not exist; the tool lives under
`tools/oracle/` -- the same correction W30, W31 and W32a all had to make):

```
stage  distinct  ported   unported  inline5  ported %     first unported
4      28        24       4         4        85.7         scroll $0480  (@$ABE8)   <-- MY STAGE
```

PER-STAGE RUNNABILITY: `4  THROWS (scope guard)  $C653 THROWS  blocked`

`node games/gradius/tools/test-all.mjs`: **GREEN -- 11 passed, 0 failed, 0 SKIPPED.**

---

## §1. THE FIRST QUESTION, ANSWERED FIRST -- CAN THE PORT EXPRESS A FORKED FRAME?

**YES. The mechanism already exists, it is already used by shipped code, and the
recon's framing of the risk was wrong in a way worth writing down.**

The recon (§8, "the single biggest unknown left") asked whether `src/nmi.js` and
the oracle's frame alignment can express "this frame skips the `$1B` dispatch and
half the engine". Answered by reading both sides this session, before any pool
code was written:

### 1a. The fork does not span two HARDWARE frames. It never did.

The recon's own words -- "one logical frame is split across TWO hardware frames"
-- describe the GAME's experience, not the harness's. Read as a harness claim it
implies the port would need a frame that is half a `nmi()` call, and that is what
made it look like an architecture risk. The listing says otherwise:

```
9689: A5 02      LDA $02
968B: 4A         LSR A
968C: 90 17      BCC $96A5        even frame -> the normal $96A5 ladder
968E: 20 C0 A2   JSR $A2C0        spawn
9691: 20 91 CB   JSR $CB91        THE ARM DRIVER
9694: 20 AB AD   JSR $ADAB        enemies
9697: 20 B7 BB   JSR $BBB7        enemy bullets
969A: 20 FC 9F   JSR $9FFC        THE PLAYER
969D: 20 C7 C0   JSR $C0C7        player-vs-enemy collision
96A0: E6 5B      INC $5B
96A2: 4C 8C 9A   JMP $9A8C
```

`$9650` is entered once per NMI from `$80D1`, and `$96A2 JMP $9A8C` lands inside
the same NMI. **Every hardware frame still runs exactly one `nmi()`, still
samples input once at `$80B5`, still emits one display list.** There is no
sub-frame, no re-entry, no skipped tick. The oracle's frame alignment is
untouched, because nothing about the frame's OUTER shape changes -- only which
subset of subroutines runs inside it.

### 1b. The port's shape for it is the one the pause path already ships

`$96A0 INC $5B / JMP $9A8C` is structurally identical to `$9660 JMP $9A8C`, the
PAUSE jump, which `stagePlay()` has expressed since wave 1:

```js
if (state.zp15 !== 0) {          // $965C/$965E
  mode5Tail(state, res);         // $9660 JMP $9A8C
  return;
}
```

`mode5Tail(state, res)` with `test1B` defaulting to `false` IS the `$9A8C` entry,
and its docstring already names `$96A2` as one of the three ROM arms that use it:
*"`$9A8C` is a real jump target, reached from `$9660` (pause), `$96A2` (the
stage-5 half-rate arm, right after `INC $5B`) and `$98E2`."* The half-rate arm was
written into the port's structure as a known caller before this wave existed.

### 1c. Every callee the fork needs is already a separate function

| ROM | port | already exported? |
|---|---|---|
| `$968E JSR $A2C0` | `spawnEngine` | yes (`enemies.js`) |
| `$9691 JSR $CB91` | `armDriver` | **NEW -- the only new one** |
| `$9694 JSR $ADAB` | `updateEnemies` | yes |
| `$9697 JSR $BBB7` | `enemyBullets` | yes |
| `$969A JSR $9FFC` | `updatePlayer` | yes |
| `$969D JSR $C0C7` | `collision` | yes -- **exported SEPARATELY from `shotSweep`** |

That last row is the one that could have blocked the wave. `$C0C7` has exactly
two callers (`$969D` and `$C052`), and `src/collision.js` already splits
`collision()` out of `shotSweep()` as its own export -- wave 5 did that for
transcription reasons, and it happens to be exactly what `$969D` needs.

### 1d. The two half-rate SKIPS were already transcribed as tripwires

`$9A5E`'s `LDA $5C / CMP #$02 / BCS $9A70` is `nmi.js:924` (a throw) and
`$C04B`'s `LDA $5C / CMP #$02 / BCC $C052` is `collision.js:122` (the real
branch, correct). Only the first has to change from throw to branch.

**VERDICT: the fork is ~12 lines against structure that already exists. It is
NOT the risk in this wave.** The recon's MEDIUM confidence on the fork should be
read up, and its "down to LOW if the harness cannot express it" contingency does
not fire.

---

## §2. THE ORDER TRAP INSIDE THE FORK

The two paths run the same four engine routines **in different orders**, and the
difference is not cosmetic:

```
$9A5E normal:   $A2C0 spawn -> $BBB7 bullets -> $9FFC player -> $ADAB enemies
$968E fork:     $A2C0 spawn -> $CB91 arms -> $ADAB enemies -> $BBB7 bullets -> $9FFC player
```

The normal path updates the PLAYER BEFORE the enemies; the fork updates the
enemies BEFORE the player. `nmi.js`'s own header records why that matters -- the
fan (`$B0AF` sub-states 1 and 2) compares its Y against `$0320`, the player's, so
it sees THIS frame's player position on one path and LAST frame's on the other.
A port that reused `mode5Body`'s order for the fork would be wrong on every
stage-5 odd frame and no timing check would see it.

(in progress -- porting the pool next)
