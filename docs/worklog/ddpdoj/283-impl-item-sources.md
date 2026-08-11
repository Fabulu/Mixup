# W283: DOCKET D16 CLOSED -- stage 1 cannot produce hyper, and that is correct

Status: DONE. Suite 1977/1977 (1970 + 7), sweep 0 missing on both, run before the commit.

Three waves went into "the hyper bar is empty". The answer is a count, and it is two.

## Starting state

W282 committed and pushed at `14d4108`, suite 1970/1977.

## THE ANSWER

**Stage 1's spawn script holds TWO type-`$85` records out of 339**, and `deathSeq85` -- the
only popcorn drop site -- drops kind `$0` or kind `$8`, **never kind `$C`**. So stage 1's
popcorn cannot put one unit of hyper on the bar no matter how long the run.

Kind `$C` comes from `$294C40 partDeathDrop`: a BOSS PART's HP going negative drops P1's
hyper (`$C`) or P2's (`$14`) depending on whose hit killed it. **The hyper row being empty
through stage 1's popcorn phase is CORRECT, not a missing draw.**

Walked out of the cartridge rather than reasoned about, and the walk agrees with the number
the coverage tool and the handoff already carry:

    stage 1 script  $230C6C   339 records, then $FFFF
    type $85        2         <- the only drop source in the stage
    type $86        0
    type $11        104       <- the commonest, and it drops nothing

That also retires W282's open lead. "ONE item in ninety seconds is low" was the wrong reading:
one item is what two `$85` records produce when a run reaches one of them. It is not a low
drop rate, it is the correct one.

## THE FOUR-WAVE ELIMINATION, IN ORDER, BECAUSE THE ORDER IS THE LESSON

    W281  the DISPLAY     complete. `$285D74` draws one icon per unit of `$81B6E0`.
    W282  the ALLOCATOR   complete. All six kinds, zero counted notes, `$C` included.
    W282  the WINDOW      900 frames is too short to see ANY item. First drop: 2576.
    W283  the SOURCES     stage 1 has two, and neither can be hyper.

Every one of those steps was a measurement, and three of the four contradicted what reading
the code had suggested. The first two waves both looked for a missing draw because the
docket said "the bar is missing" and the symptom was an empty bar -- which is the D7/D8
pattern for the third and fourth time this session.

## A STALE COMMENT AT THE ONE SITE THAT ANSWERS THE QUESTION

`partDeathDrop`'s comment said both hyper kinds are "REFUSED AT THE ALLOCATOR ... so
`spawnItem` returns null and counts the refusal". True when W61 wrote it; **false since W163
emptied `REFUSED_KINDS`** when the hyper machine landed. So the one site that produces the
item D16 is about carried a sentence saying it produces nothing.

Corrected in place, with the D16 answer written beside it, and both halves asserted --
because the thing that would have prevented the second wasted wave is a sentence at that
site, so trusting it to survive would be the same mistake again.

## WHAT A LONG RUN ACTUALLY HITS

From the laser-hold rung the census reaches **frame 6482 and throws `Unreached $280BCE`** --
the impact-finish dispatch, seventeen of whose twenty routines are unported and which the
docket already records in D3's neighbourhood. So a run cannot currently be driven as far as a
boss part death from that rung, which is why kind `$C` has never been observed spawning even
though its producer is ported and reachable.

**That is now the binding constraint on exercising the item chain end to end**, and it is a
translation gap rather than an unknown.

One nuance the census gained for it: it tracks the MAX each hyper word reaches, not the final
value, because the icon count is consumed as it is spent and a run can raise it and hand back
zero. The gate `$81B6E4` does reach 1 before the throw; the count `$81B6E0` crosses during the
throwing frame itself, which is how the earlier 14,000-frame probe reported 1 and the
6,481-frame one reported 0. Reading a post-throw partial frame as a result is a trap worth
naming.

## Docket status

    D13 W279   D14 W280   D15 W279
    D16 CLOSED (W283) -- display, allocator and producer all complete; stage 1 has no
        hyper source, which is correct. Verifying it ON SCREEN needs $280BCE.
    D17 open -- the medals, same family, and the same question now has a method
    D18 standing rule -- commit AND push every wave

## Order for the next wave

1. **D17, with W283's method.** The medals are pool A's reserved ten (`bee.js`: "the medal IS
   the bee"), so the question is the same shape and now has a tool and a technique: count
   what the SCRIPT contains, then count what a run PRODUCES, then look at a draw only if both
   disagree. Do not assume D16's answer transfers -- the bee pool is a different producer.
2. **`$280BCE`'s finish routines**, or enough of them to drive a run past frame 6482. That is
   what stands between the port and observing the whole item chain, and it is already
   docketed.
3. Then `$25DEAE`/`$25E0EA` and the nine bonus lines at `$25FF52`.
