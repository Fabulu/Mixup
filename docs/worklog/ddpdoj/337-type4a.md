# W337: type `$4A`, the sibling that looks like `$49` in five places where it is not

Status: suite **2389/2389**, green, no skips. Sweep 0 missing. `dojcoverage.py` both OK lines. 425 ROM
windows, up 3.

Stage 5 goes from **NINE types with no handler over 27 records to EIGHT over 25**. `$4A` is the
seven-way aimed fan turret: `$2719AE` init, `$2719B6` initBody, `$271A64` handler.

## THE WHOLE POINT OF THIS WAVE

`$4A` sits next to `$49` in the ROM, shares its band, shares `$270D92`, shares the `$5C` damage mask,
shares the scroll-clock equality idiom and shares the `$81B414`/`$81B416` bullet-budget opt-in. It is
also different from `$49` in **five** places, every one of which would have produced a plausible wrong
picture rather than a crash:

| | `$49` | `$4A` |
|---|---|---|
| `($20,A5)` | POINTER to a formation flag | RNG-seeded AIM state |
| off-screen limit | `$2000` | `$1C00` |
| freeze | branches INTO the counter step, sweep continues | SKIPS it, ring frozen |
| index wrap | `cmpi.w #$78 / blt`, thirty entries | `andi.w #$1F`, EIGHT entries |
| prototype overlap | four bytes | **eight** bytes |

Plus: `$4A` never calls `stepMovement`, and its death does not free the record.

**This is W315's finding for the fourth time and it should now be treated as the band's defining
property**: `$48`/`$49`/`$4A`/`$4B` are consecutive types with consecutive inits that are NOT one
family. They share idioms and diverge in fields. Reading `$4A` by diffing it against `$49` would have
been faster and wrong in five ways.

## THE DEATH IS A MARK, AND `($3F,A6)` IS TESTED THREE TIMES

    271ab4  move.w #$8000,(A6)                  the record marks itself
    271ab8  D2 = ($2,A6) ; lea ($271C30,PC),A1 ; jsr $270D92     EIGHT spawns
    271ac6  jsr $28C2DC
    271acc  move.b #$1,($3F,A6)
    271ad2  move.b ($18,A5),($1D,A6)            <-- FALLS THROUGH, no freeEnemy anywhere

The mark is then read at `$271A64` (the handler's FIRST instruction), at `$271B1A` (before the fire arm)
and at `$271BD8` (before the draw). So from its next frame the record is **unhittable, silent and
invisible**, running only the movement path until the off-screen free at `$271AF8` collects it. That is
a full retirement in everything but slot ownership.

`death37` is the same shape and the port has carried it since W36, which is what made this cheap. **I
first recorded `$4A` as blocked on a measurement naming whoever reads `$8000`, and that was wrong** --
the family check answers it, and skipping the family check is the mistake this project has a standing
rule about. Second time this session (see W334 on `init + 8`).

`$271AB4` is also reached from the `$2800` despawn trigger at `$271A7A`, so reaching that position runs
the identical spawn walk, sound and marking that being shot does.

## SEVEN SHOTS, AND `dbra` IS WHY

    271ba0  subi.w #$9,D1
    271ba4  move.w #$6,D7
    271ba8  jsr $281764  /  addq.b #3,D1  /  dbra D7,$271BA8

**`move.w #$6,D7` plus `dbra` is SEVEN passes**, not six: `dbra` branches while the counter is not `-1`,
so it runs at 6,5,4,3,2,1,0. With `subi.w #$9` first and `addq.b #3` after each, the headings are
centre-9, -6, -3, 0, +3, +6, +9 -- a symmetric seven-way fan at 3-unit spacing. Six or eight would both
look plausible on screen, which is exactly why the standing DBcc rule exists.

The loop mutates D1 alone between calls and leaves D2/D3/D4 standing, **which is only legitimate because
W336 measured that `$281764` preserves them.** That measurement was made for `$49`'s second shot and paid
off here unprompted.

## `$4A` WALKS INTO W323's TRAP AND THE PORT HAS TO LET IT

`$271B5E jsr $24226E` is `aim256FromCaller`. On no live target it returns through `$242264`, **a bare
`rts` that leaves D1 unchanged** -- and D1 still holds the biased X from `$271B5A`. There is no `bcs`
here, so `$271B64 move.b D1,($20,A5)` stores THAT as the aim. Transcribed as the ROM behaves, because
W323's whole lesson was that inventing an `if (aimed.carry) return` guard where the ROM has no branch is
a defect. The port stores the biased X on the carry path and says so in a comment.

## THE MUZZLE LONGWORD IS READ TWO WAYS

`$271C28` (or `$271C2C` when `($17,A5)` is clear) is four bytes used as:

    271b58  add.w (A1),D0 / add.w ($2,A1),D1     a pair of WORDS, biasing the aim inputs
    271b9a  add.l (A1),D2                        one LONGWORD, biasing the bullet position

Same address, two conventions -- `$49`'s "one counter, two index conventions" compressed into four
bytes. `$271B52 movem.w ($2,A6),D0-D1` also **sign-extends** each word to 32 bits, which is not what a
pair of `move.w`s would do.

## The windows, and why the overlap depth is not inheritable

    $271A1A + $52   record prototype (9 words) AND BOTH $20-byte sub prototypes, $271A1A..$271A6B,
                    overlapping the handler at $271A64 by EIGHT bytes because ($4,A5) = 1 means TWO
                    sub records. $49's was four with ONE record. The depth follows from ($4,A5).
    $271C08 + $28   the EIGHT-entry draw ring (five distinct frames ping-ponging) plus the two muzzle
                    longwords that abut it.
    $271C30 + $62   the death list: EIGHT 12-byte entries then $FFFF, ending exactly at $271C92 --
                    which is $4B's init, so the far end is pinned by CODE.

The ring needs **no `unreached` guard**, unlike `$49`'s draw: `andi.w #$1F` makes an out-of-range index
impossible by construction, so the ROM's own mask is the bound.

## Order for the next wave

1. **`$4B`** (`$271C92` init, `$271C9A` initBody, `$271D48` handler) -- the last of the band. Expect the
   overlap trap, expect mark-and-fall-through, and **expect it to differ from `$4A` in fields**. Do not
   diff it against `$4A`; read it.
2. Then `$47` (`$E2` records). `$1A` stays blocked until D2/D3 at `$268D8C` are measured.
3. Then stage 5's boss, the HIBACHI CLOSURE RULE, then the loops.

**Publish cadence is every FIVE waves** (owner, 2026-08-12). W335 published as `20260812162556`; next
publish due after W340, so W338/W339/W340 then publish.
