# W294: bonus line 6 -- four instructions, and one of them uses A5

Status: DONE. Suite 2023/2023 (2019 + 4), sweep 0 missing on both, run before the commit.

Six of the nine bonus lines are in. W293's handoff said to check A5 FIRST rather than last,
because checking it last had already cost a reverted transcription. Doing that is the wave.

## Starting state

W293 committed and pushed at `b0c3e8e`, suite 2019/2019.

## THE LINE

    260348  move.b #$2,($2,A5)      <- the CALLER's object, not the tally record
    26034e  move.w #$0,(A6)
    260352  move.w #$0,($2,A6)
    260358  rts

`$25FF7A lea $8130FA,A6 / moveq #$1,D7` sets A6 and D7 and **nothing else**, so A5 at entry is
whatever the call chain left. Its three callers -- `$26059E`, `$2605C2`, `$2607A4` -- reach it
by `bsr` from inside routines that have one, and for an object handler that is the object's own
record.

So **`($2,A5)` is the caller's object state byte**, `$2` is exactly the offset `SCREEN11.state`
uses, and value 2 is `screenState2_25DB7C` -- the tally call. Line 6's whole job is: *tell the
object that posted this request to advance to its tally state.* The test asserts the two
offsets are the same number, because if they ever diverge line 6 would advance something else
and the tally would stall with no error at all.

## WHY THIS A5 WAS PORTED AND `$280252`'s A0 WAS NOT

Both waves hit "a register the driver does not set", and they went opposite ways. That is the
judgement, so it is written at the line and asserted:

    $280252   A0 fed `movem.w ($2,A0),D2-D3` -- a TARGET POSITION read through it. A wrong
              A0 yields plausible coordinates and plausible motion, SILENTLY.
    $260348   A5 feeds one unconditional `move.b #$2` into a known state offset. A wrong A5
              puts a 2 somewhere it does not belong, which is LOUD, and nothing is derived
              from it.

The rule this suggests: **a register feeding ARITHMETIC needs measuring; a register feeding one
unconditional store into a known field can be a parameter.** The first invents values, the
second at worst misplaces one.

So A5 is an explicit parameter with no default, and passing nothing **throws by address**
rather than writing a 2 into `$0002` -- which is neither a record nor anything the kill drain
or any gate would ever catch.

## Order for the next wave

1. **`$26035A`, bonus line 7.** Three remain. Its head is `addq.w #1,$813142` -- the same
   counter `$2600D8` DECREMENTS at `$260112`, going the other way. So line 7 gives back what
   the poster spends, and the pair is worth reading together.
2. **The HIGH-SCORE INSERT** (`$287BD2`/`$287C08`/`$287C3E`/`$287CEE`), W290's deferred gap
   and now the largest single thing left in this subsystem.
3. **`$280252`** stays blocked on measuring A0 at `$28029A` (W288). Note that W294's rule
   says why: its A0 feeds arithmetic.
4. `$280BCE`'s 5/6/7 need `fillGeneralImpact280B3E` parameterised on the speed draw.
