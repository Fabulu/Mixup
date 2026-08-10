# W241: the loop's zero-lives extend

Status: COMPLETE

## Scope

`$253794`, the last real routine on D11's leftover list. It was noted as "the
option-pod teardown, counted".

## Starting state

W240 is committed at `86c54a0`, suite 1658/1658.

## It is not a teardown, it is a LOOP RULE

    253798: tst.w $813098  / beq exit      <- only on the LOOP
    2537A2: tst.w $812934  / bne exit
    2537AC: tst.w $81293C  / bne exit
    2537B6: tst.w $8130BE  / bne exit      <- only at ZERO lives
    2537C0: cmpi.w #$14,$8130BE / beq exit
    2537CC: addq.w #$1,$8130BE             <- one free life
    2537D2: jsr $2878CC                    <- that side's LIVES row
    2537D8: jsr $28C678                    <- the extend jingle

On the second loop, a player who reaches a stage clear with zero lives is given one.
`$2537E4` is the P2 twin, address for address. That is a gameplay rule, not
presentation, and it had been sitting behind a note with the wrong name -- which
matters more than usual here, because the owner's goal includes the loops and this is
the first loop-specific rule the port has translated.

The `cmpi.w #$14` is DEAD as written: `$8130BE` is proved zero two instructions
earlier, so it can never equal `$14`. Transcribed anyway. This port records the
cartridge's redundancies rather than tidying them, and the test states the fact
instead of asserting a behaviour that cannot be produced.

## Verification

`node --test games/ddpdoj/tests/w241loop-extend.test.js` -> 3/3: the grant and its
jingle on both sides with the LIVES row as the only thing deferred; each of the four
gates refusing on its own; and the dead `$14` check recorded as dead.

Full suite -> **1661/1661**.

## D11's leftovers, now

- `$28C186` -- the exit handshake, whose body `$28BBAC` is the sound tier.
- `$28D6FC` -- DEV-2, the anim chain that `chainLoader24652A` builds and
  `chainFree246800` frees.
- `$28D77C` -- sixteen longwords into `$A00000+$5C0`, PALETTE RAM, which this port
  does not model at all. Not translation work until it does, and saying so is more
  honest than a partial write.
- The four `$25FD38` subsystem resets -- W62's deliberate scope line, not a gap.

So the transition is done apart from one sound handshake, one anim chain, and two
things that are out of scope by design.
