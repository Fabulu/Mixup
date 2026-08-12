# W338: type `$4B`, and the band's divergence axes do not line up

Status: suite **2389/2389**, green, no skips. Sweep 0 missing. `dojcoverage.py` both OK lines. 427 ROM
windows, up 2.

Stage 5 goes from **EIGHT types with no handler over 25 records to SEVEN over 23**. `$4B` is the
four-shot sweeping turret: `$271C92` init, `$271C9A` initBody, `$271D48` handler. The
`$48`/`$49`/`$4A`/`$4B` band is now closed except `$48`.

## THE FINDING THE THREE PORTED MEMBERS TOGETHER PRODUCE

W315 said this band is not one family. Three ported members later, the sharper statement is that **the
axes of divergence do not line up type by type** -- you cannot even say "`$4B` is like `$49`" and be
useful, because it takes `$49`'s side on some axes and `$4A`'s on others:

|                    | `$49`         | `$4A`            | `$4B`                    |
|--------------------|---------------|------------------|--------------------------|
| lifetime           | frees itself  | MARKS, continues | frees itself             |
| sweep length       | 30 (`cmpi.w`) | 8 (`andi.w #$1F`)| 30 (`cmpi.w`)            |
| freeze             | runs INTO the counter step | SKIPS it | **SKIPS it** |
| off-screen limit   | `$2000`       | `$1C00`          | `$400`                   |
| kill score         | `$250`        | `$180`           | `$290`                   |
| flag offset        | `($20,A5)`    | none (aim state) | `($26,A5)`               |
| flag words         | `E0`/`E4`     | none             | `E2`/`E6`                |
| `($17,A5)` polarity| SET = first table | n/a          | **SET = SECOND, mirrors**|
| shots              | 3             | 7 (`dbra` loop)  | 4, hand-written          |
| prototype overlap  | 4 bytes       | 8 bytes          | 4 bytes                  |
| `stepMovement`     | no            | no               | no                       |

Every row is identical instruction sequences carrying a different constant or a different branch sense.
**The only safe procedure for `$48` is to read it, not to diff it against any of these three.**

## THE POLARITY FLIP IS THE ONE THAT WOULD HAVE SHIPPED

`$271E22 tst.b ($17,A5) / beq` -- CLEAR keeps the first sweep table and does NOT negate; SET takes the
second table AND mirrors via `neg.w D3`. **`$49`'s test has the opposite sense.** Both are two-line
sequences that look the same at a glance, and getting it backwards mirrors the wrong half of the
formation: no crash, no failing test, just a wrong picture. It is the reason this file spends its length
on a table of constants rather than on prose about the handler.

`neg.w` on a `move.l`-loaded long is `$49`'s trap verbatim: the low half flips with no borrow, and the
following `add.l` does carry out of it.

## FOUR SHOTS, AND SHOT 3 INHERITS D0

    271e42  move.l #$10003,D0    / jsr $281744      base
    271e4e  move.l #$FFFD0004,D0 / addq.w #2,D1 / jsr $2816F6      base+2
    271e5c  subq.w #4,D1         / jsr $2816F6                     base-2, D0 INHERITED
    271e64  addq.w #3,D1 / move.l #$FFF90005,D0 / jsr $2816F6      base+1

Asymmetric, hand-written, and shot 3 sets no D0 of its own. That is only portable because **W336
measured that the `$2817C2` family never writes D1..D4**; the port names the inherited value rather than
guessing it. Third wave in a row that measurement has paid for itself.

`$271E7C subq.b #1,($22,A5)` sets flags nothing reads -- a `lea` follows. A plain decrement, not a gate.
Inventing a branch there would be the `$2716D8` mistake in reverse: that one was a live-looking
instruction that does nothing, this one is a dead-looking one that does something.

## THE INIT'S DOUBLE WRITE

`$271CE8` sets `$8130E2` to 1 **unconditionally**, and only then does the `$280` test possibly redirect
A0 to `$8130E6`. So an early `$4B` arms `$8130E2` alone and a late one arms **both**. Folding the
unconditional write into the branch would leave the late case with `$8130E2` clear, which is the harmful
direction.

`$271D08 move.w #$202,($1A,A5)` is ONE word literal and **TWO byte fields** by the standing rule: the
animation counter and its reload both become 2, on the late branch only.

## The windows, and why five tables are one declaration

    $271D18 + $34    record prototype (TEN words) + the ONE sub prototype, $271D18..$271D4B,
                     overlapping the handler at $271D48 by FOUR bytes -- ($4,A5) = 0, so the depth
                     matches $49 and not $4A. It follows from ($4,A5); it is not a sibling property.
    $271EA8 + $1B2   ALL FIVE tables as one window, because they abut end to end:
                       $271EA8 + $78  30 draw LONGS          -> $271F20
                       $271F20 + $4A  death list, SIX        -> $271F6A
                       $271F6A + $78  30 muzzle LONGS        -> $271FE2
                       $271FE2 + $3C  30 sweep WORDS (CLEAR) -> $27201E
                       $27201E + $3C  30 sweep WORDS (SET)   -> $27205A

Declared as one on purpose. Five windows would serve every read equally well, but they would hide the
contiguity -- and the contiguity is what pins all five far ends **by arithmetic** rather than by trusting
a `$FFFF` terminator or an eyeballed row count.

## A correction this wave made to its own predecessor

W337's handoff section claimed `$4B` "needs no `$24179E`". It does call it, at `$271DE4`. I wrote that
line before displaying `$271DDA..$271DF2` -- the same root cause as every other correction in this
session's run: inferring across a span instead of reading it. Fixed in the handoff with the reason
attached.

## Order for the next wave

1. **`$48`** -- the last member of the band. Read it; do not diff it against `$49`, `$4A` or `$4B`.
2. Then `$47` (`$E2` records) and `$43`/`$4C`/`$B0`. `$1A` stays blocked until D2/D3 at `$268D8C` are
   measured. `$46` is the biggest at 13 records and wants `$55` first.
3. Then stage 5's boss, the HIBACHI CLOSURE RULE, then the loops.

**Publish after W340** (owner's five-wave cadence, 2026-08-12). W335 published as `20260812162556`, so
W339 and W340 then publish.
