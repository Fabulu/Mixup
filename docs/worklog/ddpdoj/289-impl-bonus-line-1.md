# W289: `$25FFA8`, the first of the tally's bonus lines

Status: DONE. Suite 2000/2000 (1993 + 7), sweep 0 missing on both, run before the commit.

The score tally's arithmetic starts here. `$25FF52`'s ten longwords are the bonus lines,
entry 0 is null and guarded by `$25FF84 cmpi.w #$0,D0 / beq`, and this is entry 1 -- the
routine the tally actually spends its frames in.

## Starting state

W288 committed and pushed at `b2694c1`, suite 1993/1993. `$280252` remains blocked on a
register measurement, so this wave took the other open thread.

## THE LINE

    25ffa8  jsr $23C668                    256 longwords of a staging area -- COUNTED
    25ffae  move.l #$0,($18,A6)            drop the previous object
    25ffb6  move.w #$78,$8130D4            FREEZE THE GAME, 120 frames
    25ffbe  jsr $261116                    $81316C = 1, $81316A = 0
    25ffc4  movea.l ($8,A6),A0 / subq.w #1,(A0) / tst.w (A0) / bpl $26000C
      finished:
    25ffd0    ($17,A6) picks the side; three words per side
    260004    (A6) = 2                     -> the next state
      still running:
    26000c    ($17,A6) ? $28795C : $2878CC THE LIVES ROW, ported W116
    260024    the allocator-fill
    26004a    (A6) = 0                     re-post, so the driver comes back
    26004e  ($2,A6) = 0 / rts

Every dependency was already in the tree: `$261116` is two writes `player.js` already makes,
`$2878CC`/`$28795C` are W116's lives rows (called since W271), `$241182` is `stageCreate`, and
`$23C668` is the note `player.js` and `tally.js` both already carry.

## THREE THINGS A PARAPHRASE LOSES, ALL ASSERTED

**The counter is a POINTER.** `movea.l ($8,A6),A0 / subq.w #1,(A0)` decrements a word the
record POINTS AT, so two records can share one counter. A port that decremented `($8,A6)`
itself would count down the pointer -- and would keep working for a while, because a
pointer's low word is a perfectly plausible counter. The test asserts the pointed-at word
moved and the pointer did not.

**The borrow test is `bpl`, not `beq`.** `subq.w #1 / tst.w / bpl` continues while the result
is zero OR POSITIVE, so a counter of 1 runs one more frame at 0 and the line only finishes at
`$FFFF`. That is the old-zero borrow this project has been caught by six times, in its other
form -- and it is one frame of the tally either way. Driven at 1 and at 0.

**The fill takes `($C,A6)`/`($E,A6)`, not `($10,A6)`/`($12,A6)`.** `$2600D8` uses the latter
pair and this line the former, which is exactly why the two are not one shared helper however
similar the eight instructions look. The test plants `$AAAA`/`$BBBB` in the pair that must NOT
be read.

## AND IT FREEZES THE GAME, EVERY FRAME

`$25FFB6 move.w #$78,$8130D4` -- the freeze word `boss2attacks.js`, `bossf23.js` and
`bossguns.js` all name. Set unconditionally, before the counter is even read, so it holds on
the finishing frame too. That is what a tally screen does: the game stops while the bonus
counts. Asserted on both arms, because a port that set it only while running would let one
frame of play through at every line boundary.

## The re-post is the loop

`$26004A move.w #$0,(A6)` puts the request back so `$25FF7A` returns next frame. A port that
left the request set would run the line twice a frame; one that cleared it to something else
would run it once ever. Both are silent, so it is asserted.

## Order for the next wave

1. **`$260056`, bonus line 2** -- `$25FF52[2]`, and the state `$260004` advances into. The
   same shape is likely: a counter, a row, a re-post. Eight lines remain.
2. **`$280252`** stays blocked on measuring A0 at `$28029A` (W288). That measurement also
   unlocks indices 9, 10 and 11.
3. `$280BCE`'s 5/6/7 (one body, `$280D34`) need `fillGeneralImpact280B3E` parameterised on
   which RNG draw sets the speed -- `abs($242B3C)>>1` there against `$2431F4>>1` in the
   ported path. **That is surgery on the routine every impact kind flows through, so it
   wants a fresh start rather than the end of a long session.**
4. Then `$25DEAE`/`$25E0EA`, and the publish, which is still the cheapest move for the DOCKET
   and still wants the owner's go-ahead.
