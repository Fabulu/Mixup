# W256: type $42's handler, and the Stage-4 boss's second phase closes

Status: DONE. Suite 1751/1751 (1738 + 13), run before the commit.

`$2A3AF6`, in the new module `src/stage4type42.js`, registered in `handlers.js` beside
type `$41`. **Every script F5 arms is now translated, and the phase runs as a phase**: F5
arm 6 starts A1 9, A1 9 draws a formation and spawns it, each child homes and counts
itself back on arrival, A1 9's rendezvous closes and it retires, and its retirement flips
every surviving child into its second mode. One test drives that whole chain.

## Starting state

W255 committed at `a78bc7e`, suite 1738/1738.

## IT CANNOT BE KILLED BY DAMAGE

The finding this wave turned on, and it is proof rather than inference:

    2a3b5e: jsr $286096                            the hit lands, HP drops
    2a3b64: move.w #$7fff,D0 / sub.w $18(a6),D0    the damage dealt
    2a3b6c: cmp.w $8130E8,D0 / ble                 record the biggest hit so far
    2a3b82: move.w #$7fff,$18(a6)                  UNCONDITIONAL, full HP back
    2a3b96: tst.w $18(a6) / bpl                    ...so this is ALWAYS positive

The kill arm at `$2A3B9E..$2A3BE4` is unreachable. It is left as a loud named throw
carrying that reasoning, because if it ever runs, either the reading is wrong or
something the port does not model wrote `$18(A6)` -- and both are defects.

So these children are invulnerable escorts. Shooting one scores and records the largest
single hit in `$8130E8`; the only way it leaves is by ARRIVING (`$2A3D3E`) or by leaving
the band in mode 1. The test drains the HP to zero with every hit flag set and asserts it
survives at full HP with the flags consumed.

## The loop that closes

`$2A3D5A movea.l $1c(a5),a0 / addq.w #$1,$19e(a0)` is the arrival counter, one-shot
behind `$1F(A6)`, writing through the parent pointer the spawner stored. Its only reader
is A1 9's rendezvous. The end-to-end test walks a whole formation to arrival, asserts
`$19E` equals the child count, then steps A1 9 until it retires and checks it raised
`$8130F4`.

And `$2A3DE6 cmpi.w #$1,$8130F4` is what flips a child into mode 1 -- which is A1 9's
retirement writing that 1. Parent and children advance each other through one word,
in both directions, and neither routine says so.

## What the two bounds bought

Both from worklog 255, and together they took the routine from `$75A` bytes to about
`$450` written:

- `$8130F4 == 2` gates `$2A3AF6`, `$2A3E16` and `$2A3E92`, and only A4 id6 writes 2.
  All three are transcribed as `unreached()` naming A4 id6, so the port stops loudly the
  day that lands rather than inventing `$2A3E1E..$2A4115`. The test asserts the throw and
  its address.
- roles `$70`/`$71` skip the draw entirely (`$2A4202`/`$2A420C`), which is asserted
  directly rather than reasoned about.

## The rest, briefly

- **the homing**: aim256 at a target computed from the parent's position, then the SPEED
  off `$2A4272`'s ladder -- `$40` written first as the default and only overridden when a
  rung matches, so a distant child closes fast and a near one crawls. `$241E34` (W255)
  applies it.
- **the heading slews twice**: `$26(a6)` per frame into `$28(a6)` masked to `$FFF`, and
  `$26` itself walks one step at a time towards `$38` on the `$3A`/`$3B` cadence.
- **mode 1** counts `$1A(A5)` down to a floor of 8, latches `$71(A6)`, and then ramps it
  back up by 2 -- and `$2A3DD4 bgt $2A3C1C` means the ramp running past `$FF` is a FREE,
  not a clamp. That one is easy to miss because the branch target is 470 bytes behind it.
- **the draw tail is chosen by `$71(A6)`**: bucket 2 through `$23DF2A` normally, bucket
  22 through `$23F7C6` once latched. Two different buckets, asserted separately, because
  using one for both would draw the whole second phase into the wrong list.
- **`$8130EA`** gets a counted `note()`: the ROM stores whatever D1 `$286096` left, and
  `src/score.js` does not model `scoreHit` as returning D1. The store uses the pre-call
  value, and the three readers (`$29FB78`/`$29FD40`/`$29FDA0`) are unported boss code, so
  the choice is currently unobservable and is counted rather than assumed.

## What the tests corrected

Two assertions of mine, both the same shape as earlier waves' geometry traps:

- the aim OVERWRITES `$1B(A6)` rather than slewing, and for some formations the correct
  answer IS zero -- so the test plants `$77` and watches it go instead of asserting
  non-zero.
- `$2A3DF8` saves `$26(A6)`, which the init left as the sign-extended direction (14 for a
  `$0E` list), not zero.

Three censuses moved with the new handler: `handlers.test.js`'s address list,
`integration.test.js`'s 64 -> 65, and `w167coverage.test.js`'s derived
`enemy_types: 76/256` -> `77/256`. Two of those files are CRLF; the edits preserved it and
the whole diff is eight lines.

## What is left of the Stage-4 boss

    A4 id6 $2A11D4 -- the THIRD phase, which F5's arm 5 hands to and which is what
    makes $8130F4 = 2, A1 11, and type $42's roles 0..7 and $70/$71 reachable

## Order for the next wave

1. A4 id6 `$2A11D4`. Its first two instructions are already known
   (`move.w #$2,$8130F4 / clr.w $8130F0`), and it starts A1 11 at `$2A128A`.
2. A1 11 `$2A317C`/`$2A31A0`, which is A1 9's sibling: same shape, one list, and a
   `$21(a0)` role taken per-child from `$2A31EC` rather than a constant.
3. Then the `$2A3E1E..$2A4115` half of this handler, which those two unlock, replacing
   the three `unreached()` gates with the real body.
