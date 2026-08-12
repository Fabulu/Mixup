# W339: type `$48`, and the `$48`/`$49`/`$4A`/`$4B` band is CLOSED

Status: suite **2389/2389**, green, no skips. Sweep 0 missing. `dojcoverage.py` both OK lines. 429 ROM
windows, up 2.

Stage 5 goes from **SEVEN types with no handler over 23 records to SIX over 21**. All four members of the
band are now ported. `$48` is the five-way aimed fan turret: `$271284` init, `$27128C` initBody, `$27133A`
handler.

## THE BAND, COMPLETE

Two structural pairs, decided by `($4,A5)`:

    { $48, $4A }   ($4,A5) = 1 -> TWO sub records -> EIGHT-byte handler overlap; NINE-word record
                   prototype; ($20,A5)/($21,A5) RNG-seeded AIM STATE, no formation flag;
                   lifetime = MARK ($8000 + ($3F,A6)) and fall through, tested at THREE points
    { $49, $4B }   ($4,A5) = 0 -> ONE sub record  -> FOUR-byte handler overlap; SEVEN- and TEN-word
                   record prototypes; a POINTER to a formation flag in ($20,A5) / ($26,A5);
                   lifetime = score, walk the list, clear the flag, freeEnemy

And they agree on **no handler constant whatsoever**:

|                     | `$48`      | `$49`      | `$4A`      | `$4B`      |
|---------------------|-----------|-----------|-----------|-----------|
| spawn frame         | `$201`    | `$1F3`    | `$2B6`    | `$299`    |
| off-screen limit    | `$2C00`   | `$2000`   | `$1C00`   | `$400`    |
| kill score          | `$130`    | `$250`    | `$180`    | `$290`    |
| shots               | 5 @ 5     | 3         | 7 @ 3     | 4, asym   |
| spawner             | `$281744` | three     | `$281764` | two       |
| ring / sweep length | 8 (mask)  | 30 (cmp)  | 8 (mask)  | 30 (cmp)  |
| freeze gate         | **NONE**  | into ctr  | skips ctr | skips ctr |
| draw `D3`           | `$A50`    | `$1050`   | `$12A0`   | `$1EB0`   |
| death list entries  | 5         | 4         | 8         | 6         |
| draw                | `bsr`     | inline    | inline    | inline    |

Eleven axes. Two of them (`($17,A5)` polarity and ring length) happen to respect the pairing; nine do not.
**The pairing tells you which sibling to read alongside. It never licenses copying a field.**

## `$48`'s TWO STANDOUT DIVERGENCES

**1. IT HAS NO FREEZE GATE.** `$49`, `$4A` and `$4B` each test `$8130D2` or `$8130D4` before firing.
`$2713CE` falls straight into `$2713D4 jsr $24179E` and then the fire arm. Adding a freeze test "for
consistency" would silence a fan the board keeps firing -- and it is an ABSENCE, so nothing in the port
would have complained.

**2. ITS `$2800` TRIGGER HAS NO `($16,A5)` GUARD.** `$4A` writes
`cmpi.w #$2800 / bgt (skip) ; tst.b ($16,A5) / bne -> retire`, so it retires only after having been on
screen. `$48` writes `cmpi.w #$2800 / ble -> retire` and nothing else, so it retires on position alone --
potentially before it ever appears. Same constant, same purpose, one fewer instruction.

Both of these are missing instructions rather than changed constants, which is the harder class to notice:
a different literal catches the eye in a diff, an absent guard does not.

## FIVE SHOTS, AND FOUR OF FIVE LOOP PARAMETERS DIFFER FROM ITS TWIN

    271468  subi.w #$A,D1
    27146c  move.w #$4,D7
    271470  jsr $281744  /  addq.b #5,D1  /  dbra D7,$271470

`move.w #$4,D7` + `dbra` is **FIVE** passes, so the headings are centre-10, -5, 0, +5, +10: a symmetric
five-way fan at 5-unit spacing. `$4A`'s identically-shaped loop is SEVEN at 3 through a different spawner.
Pass count, initial offset, step and spawner all differ, plus D0 (`$FFFE000B` vs `$FFFF000B`). **Reading
`$4A`'s loop and adjusting one number would have been wrong four ways over**, with no crash and no failing
test.

## `$2714AE` IS NOW FULLY EXPLAINED

W336 found it was a bare `rts` whose body at `$2714B0` had no reachable entry point, and omitted both calls.
W339 places it: **it is the byte immediately after `$48`'s handler ends**, a stub `rts` between `$48`'s
handler and that body -- and the body tests `($3F,A6)`, `($3E,A6)` and `($3C,A6)`, all dying-state fields.
So the disabled feature is an extra effect for MARKED records, which is exactly the pair `{$48,$4A}` that
marks. Version-B turned it off by pointing both call sites at the stub. An oddity became a coherent story
across four waves, and it is written down as one.

## What `$48` inherits correctly

Three `($3F,A6)` tests (handler head `$27133A`, pre-fire `$2713DE`, pre-draw `$2714A0`), so a marked `$48`
is fully inert. The `$8000` mark. The eight-entry `andi.w #$1F` ring. `movem.w ($2,A6),D0-D1`
sign-extension. The muzzle longword read BOTH as a word pair (aim bias) and as a longword (position bias).
W323's carry trap at the aim store, transcribed and not guarded. Its windows: `$2712F0 + $52` (eight-byte
overlap) and `$271538 + $66` (all three tables, abutting).

## Order for the next wave

1. **`$47`** (`$E2` records) -- the biggest remaining unblocked type by far.
2. Then `$43`, `$4C`, `$B0`. `$46` is 13 records and wants `$55` first. `$1A` stays blocked until D2/D3 at
   `$268D8C` are measured.
3. Then stage 5's boss, the HIBACHI CLOSURE RULE, then the loops.

**W340 IS THE PUBLISH WAVE** (owner's five-wave cadence, 2026-08-12). W335 published as `20260812162556`;
run `export-web.mjs` then `publish.mjs --only ddpdoj` after the next wave lands.
