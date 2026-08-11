# W314: what stage 5 actually needs -- sixteen types, 66 records, ranked

Status: DONE. Suite 2287/2287 (2280 + 7), no skips. Sweep 0 missing on both.

W313 ended by saying stage 5's spawn layer "needs nothing new". That was true and it was not the
same thing as stage 5 working. This wave finds out what it does need, and corrects W313's framing.

## Starting state

W313 committed and pushed at `fda6f37`, suite 2280/2280.

## THE CORRECTION: THE WALKER AND THE DRIVER ARE DIFFERENT TABLES

W313 walked all 770 script records with no `Unreached` and I reported that as the spawn layer being
complete. It is -- but a type-table entry is TWO longwords:

    $263614  movea.l (A0,D7.w),A1        the INIT, whose 8-byte stub the walker runs
    $263628  movea.l ($4,A0,D7.w),A0     the per-frame HANDLER, which it does not

So a type can spawn perfectly and have nothing to run afterwards. Sixteen of stage 5's thirty-five
types are in exactly that state. W313's measurement was of the wrong half, and the clean result made
it look like more than it was.

## A CONTROL THAT SAVED THE WAVE FROM A WORSE CONCLUSION

The first live attempt drove `runEnemyFrame` over a bare `new Ram()` with stage 5 installed, and it
threw at frame 104 on a garbage address (`$80D10016` -- RAM contents used as a ROM pointer). Before
reading anything into that I ran the same harness on every stage:

    stage 1 -> Unreached at frame 182  $805D0016      <- and stage 1 PLAYS end to end
    stage 2 -> Unreached at frame 126  $283996
    stage 3 -> Unreached at frame 234  $1248BA
    stage 4 -> Unreached at frame   8  $2783F0
    stage 5 -> Unreached at frame 104  $80D10016

Every stage throws, including the four that work. **A bare `Ram` is not a valid way to drive any
stage**, so a throw under that harness says nothing about the stage. Seeding it and re-installing
stage 5 the way a transition does still throws for stage 1, because `runEnemyFrame` is one of the
seven calls a frame makes and the others are what keep the state coherent.

That control is asserted in the test file, because the wrong conclusion was one step away and it
would have been reported as a stage-5 defect.

## THE MEASUREMENT THAT IS ACTUALLY THE ANSWER

`enemyHandlerMap(rom)` is built from the cartridge and `runEnemyDriver`'s `handlers.get(h)` miss is
the only place a missing handler is reported -- so absence from that map IS the definition, not a
list anybody typed. Censusing every stage's script against it:

    stage 1 : 21 types, 339 records | missing 0 / 0
    stage 2 : 31 types, 332 records | missing 0 / 0
    stage 3 : 28 types, 414 records | missing 0 / 0
    stage 4 : 29 types, 382 records | missing 0 / 0
    stage 5 : 35 types, 770 records | missing 16 types / 66 records

**Stages 1..4 are complete and stage 5 is short sixteen types over 66 of its 770 records** -- 8.6%
of the stage. The zero-versus-sixteen contrast is what makes it a gap rather than a property of the
measurement.

Ranked by how much of the stage each buys, which is the order to port them in:

    $45  x21  init $270DD0  handler $270E36
    $46  x13  init $27102C  handler $2710E2
    $8E  x6   init $276404  handler $2764D2
    $1B  x5   init $269256  handler $269350
    $1A  x4   init $268D1E  handler $268E6C
    $81  x3   init $273F06  handler $274076
    $48  x2   init $271284  handler $27133A
    $49  x2   init $27159E  handler $271640
    $4A  x2   init $2719AE  handler $271A64
    $4B  x2   init $271C92  handler $271D48
    $00  x1   init $267814  handler $26781C
    $43  x1   init $26DDA4  handler $26DE32
    $47  x1   init $26D6EE  handler $26D7D0
    $4C  x1   init $26F4DA  handler $26F5F2
    $59  x1   init $2659DC  handler $265A14
    $B0  x1   init $2A42D4  handler $2A4606

`$45`, `$46` and `$8E` are 40 of the 66 between them. `$48`/`$49`/`$4A`/`$4B` are consecutive types
with consecutive inits (`$271284`, `$27159E`, `$2719AE`, `$271C92`) at two records each, which is
the signature of a family -- worth checking for a shared body before porting four routines.

Every init and handler address is pinned in the test, so a wave that ports one of the sixteen makes
the file fail and updating the count is how the list comes down.

## AND THE FIRST LIVE SYMPTOM EXPLAINED

Driving over the seed with stage 5 installed stops in `initDispatch` at `rom.u16(init + 2)` for
type `$81` -- a **window** error, because an unported type has no ROM window either. That is why the
throw's address (`$273F08`) looks like data rather than like a missing handler. `handlers.js`
already names `$273F06` as "type $81's init stub", recorded as the far boundary of type `$80`'s span
in W30 -- so the port knew the address for a long time without ever porting the type.

## Changes

* `tests/w314stage5scope.test.js`, 7 assertions.

No source change. This wave is a measurement, and its product is the ordered list above plus the
control that stops the next reader repeating my first mistake.

## Order for the next wave

1. **TYPE `$45`, then `$46`, then `$8E`** -- 40 of stage 5's 66 missing records. Before writing
   four routines for `$48`/`$49`/`$4A`/`$4B`, check whether they share a body: consecutive types
   with consecutive inits at two records each is what W286, W287, W298 and W312 all turned out to be.
2. Then the rest of the sixteen, then stage 5's boss and end sequence, then **the loops** -- seven
   loop-2 rules are translated and all read `$813098`.
3. **`$280252`** still blocked on measuring A0 at `$28029A` (W288).
4. `$23E45A`, the sixth zooming-family member (`movem.l D4/D7/A0`, table at `$23E78C`, extent from
   D3, needs the emit-stub window widened past `$23E0C2`). It gates `$28F7F4` and `$28FAF4`.
5. `$280BCE` is DONE at eighteen of twenty; indices 1 and 16 belong to `allocBee27F92A`.
6. The four other announcement-poster caller regions, then D11's anim tier.
