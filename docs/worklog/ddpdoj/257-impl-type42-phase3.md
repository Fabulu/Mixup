# W257: type $42's second half, the one A4 id6 unlocks

Status: DONE. Suite 1762/1762 (1751 + 11), sweep 0 missing, both run before the commit.

`$2A3E16` and `$2A3E92`, the two `$8130F4 == 2` halves W256 left as loud throws. Done
BEFORE A4 id6 on purpose: A4 id6's first instruction writes that 2, so landing it first
would have made every live type-`$42` child throw on the next frame. This wave removes
that regression before it can exist.

## Starting state

W256 committed at `635dbee`, suite 1751/1751.

## `$6C(A6)` picks the half, and it is a SIGN

The init sets `$6C(A6)` from the sign of the spawn list's direction byte -- A1 9 and
A1 11 both carry `$0E` and `$F2`, +14 and -14. So a formation splits in two and the two
halves do different things:

    $2A3E16   negative: two cadences, `$74`/`$75` and `$5E`/`$5F`
    $2A3E92   positive: an oscillator, a sweep, the aimers and THE FAN

## THREE OF THE FOUR EMITTERS HAVE NO CALL SITE

`$2A3E40`, `$2A3E76` and `$2A40FE` each assemble a complete shot -- the angle out of
`$28(A6)`, the position out of `$2(A6)`, its own speed/kind longword (`$00020003`,
`$FFFA0023`, `$FFFE000B`) -- and then fall straight into the next cadence. Checked over
the BYTES: no `4EB9` and no `4EF9` between the last `moveq` and the following
instruction. This build has them disabled.

So the negative half fires nothing at all today, and the positive half fires only its
role fan. The port runs every cadence, because those are observable in RAM, and COUNTS
each dead setup by address through `note()`. A shot that stops being mentioned is how a
missing emitter survives a green suite.

## THE ROLES ARE AN AIMER-AND-FAN DESIGN

This is what the eight-role list in A1 11 is for, and it only becomes visible here:

    $2A3FC2   roles $70 and $71 publish `($28(A6) >> 4) + $5A(A6)` into `$8130E5`
              and `$8130E4`. They are the two children that skip the draw entirely
              ($2A4202), so they are INVISIBLE.
    $2A402E   roles 0..3 read `$8130E4` and 4..7 read `$8130E5`, then `+$80`
    spread    0/4 -> -$10   1/5 -> -$4   2/6 -> +$4   3/7 -> +$10
    $2A40D2   D6 is set for the four `$10` roles, and D6 PICKS THE GENERATOR:
              `$2816F6` when zero, `$281764` when not

Two invisible siblings aim; eight visible ones fire a wide fan along a heading none of
them computed, with the outer pairs firing a different bullet class from the inner pairs.
Publishing through a global is the mechanism, and it is why the roles exist as a list
rather than as a count.

The test walks all eight roles and asserts each one's base, spread and call site
individually, because a single shared value would look plausible and be wrong for six of
them.

## The two machines in the positive half

- **the oscillator** (`$2A3EA6`): `$8C(A6)` is a signed step added to the record's speed
  byte and NEGATED at either end of a `$20..$60` band, so the child breathes rather than
  settling. Both ends are separate arms with different thresholds, and both are asserted.
- **the sweep** (`$2A3F20`): three states over the turn rate `$38(A6)`. State 0 waits for
  `$8130F2`, which A4 id6 raises at `$2A12B2`; state 1 pulls `$38` down to 4; state 2
  keeps pulling until `|$38|` reaches `$78(A6)`, then negates the step and widens `$78`
  by 2, capped at `$10`. So the turn sweeps out and back, wider each lap, and `$78` is
  the only thing that grows.

## A REAL BUG THE TEST CAUGHT

`$2A4116 cmpi.w #$2,$8130F4 / beq $2A41E2` -- the mode-0/1 shot section is SKIPPED
entirely while A4 id6 runs, and I had called it unconditionally after the new halves. So
a child in A4 id6's phase fired both its own fan AND F5's shot. Caught by an assertion
that the negative half fires nothing, which is the whole reason to assert absence and not
only presence.

Two of my expectations were also wrong, both familiar shapes:

- the sweep's state 2 runs on the SAME frame state 1 promotes into it (`$2A3F76` re-reads
  the state word), so its fresh `$60` tick arrives already spent at `$5F`. The same
  sequential-state cascade F5's arms have.
- an unarrived child can ARRIVE mid-frame: `$2A3D2E`'s latch fires on a zeroed `$28(A6)`,
  so the fixture had to put the heading away from both extremes to test the unarrived
  path at all.

## What is left of the Stage-4 boss

    A4 id6 $2A11D4 / $2A1274 -- read this wave and ready to write. It falls through,
      it raises $8130F4 = 2 and $8130EC/$8130EE, starts MAIN8, A3 3 and A1 11, stops
      A3 4 and A1 6..10, and has THREE states on $2(A4)/$6(A4). It carries the THIRD
      loop-2 rule this port has found ($2A1250 and $2A1346 both branch on $813098).
    A1 11 $2A317C / $2A31A0 -- A1 9's sibling: one list, and a per-child role byte.
    A1 13 $2A34CA and A1 14 $2A36EA -- the two A4 id6's states 0 and 1 alternate.
    MAIN8 $29FA8A -- A0 entry 8.

The one `$8130F4 == 2` arm still unread is `$2A3AFE`, and it is now narrowed to a
role-`$FF` child only: A1 9 is the sole writer of that role and A4 id6 stops A1 9 before
raising the flag, so no translated path reaches it. It stays a throw naming exactly that.

## Order for the next wave

1. A4 id6 `$2A11D4`, then A1 11, then A1 13/14 and MAIN8.
2. At that point the Stage-4 boss has three phases running and the fan above has real
   aimers feeding it, which is the first time the role design does anything on screen.
