# W296: bonus line 8 and the driver -- ALL NINE LINES ARE NOW REACHABLE

Status: DONE. Suite 2034/2034 (2028 + 6), sweep 0 missing on both, run before the commit.

The score tally's spine is complete. `$25FF7A` walks both records, every one of `$25FF52`'s
nine real entries has a body, and the owner's *"maybe even score totalling, which I see none
of"* now has a path from the object table to the digits with one counted note left in it.

## Starting state

W295 committed and pushed at `ca89f6f`, suite 2028/2028.

## LINE 8, `$26037C`

    26037c  lea $8130FA,A2 / lea $81311E,A3
    260388  D0 = ($20,A2) / jsr $241298 / clr.b ($5,A0)
    260396  D0 = ($20,A3) / jsr $241298 / clr.b ($5,A0)
    2603a4  (A6) = 0 / ($2,A6) = 0 / rts

Four instructions on W295's resolver. **The FOURTH wave to use line 2's `($20,A6)`**: W290
stored the handle, W293 killed it, W295 read it, W296 clears a byte through it.

## THE NINE, AND WHERE EACH ONE LIVES

    1  $25FFA8  bonusLine125FFA8   W289  the lease, the freeze, the lives row
    2  $260056  bonusLine2260056   W290  CREATES the type-$D and type-$B objects
    3  $26010E  bonusLine326010E   W291  $2600D8's SECOND ENTRY POINT
    4  $2601F4  bonusLine42601F4   W292  two loop-2 rules
    5  $2602B6  bonusLine52602B6   W293  the teardown -- nine kills
    6  $260348  bonusLine6260348   W294  advances the CALLER through A5
    7  $26035A  bonusLine726035A   W295  returns the lease, advances type-$D
    8  $26037C  bonusLine826037C   W296  clears a byte on both type-$D objects
    9  $2603B0  setPanel2603B0     ALREADY PORTED -- player.js

**Line 9 was done and nobody had noticed it was a bonus line.** `player.js` describes
`setPanel2603B0` as *"jump-table entry 9 of `$25FF7A`"* in its own words -- the connection was
recorded, and the table that needed it did not exist yet. That is the same shape as W291's
find, where W273 had noted an entry point nobody used. **Two of the nine cost nothing because
an earlier wave wrote down something it could not yet use.**

## THE DRIVER, AND WHAT IT CANNOT RECONSTRUCT

    25ff7a  lea $8130FA,A6 / moveq #$1,D7
    25ff82  move.w (A6),D0 / cmpi.w #$0,D0 / beq $25FF9E
    25ff8c  add.w D0,D0 / add.w D0,D0
    25ff92  lea ($25FF52,PC),A0 / adda.w D0,A0 / movea.l (A0),A0 / jsr (A0)
    25ff9e  lea ($24,A6),A6 / dbra D7,$25FF82

**Entry 0 is null and the guard is the CODE, not the table.** `$25FF52[0]` really is
`$00000000` -- asserted against the cartridge -- and `$25FF84 cmpi.w #$0,D0 / beq` is what
stops a request of 0 jumping to address 0. So W279's window covering the null entry was right,
and the port must test the REQUEST.

A request past 9 would read `$25FF7A`'s own `lea` as a pointer and jump into it, so the port
throws by address instead. Asserted.

**Lines 6 and 9 need things the driver does not have** -- line 6 needs A5, the caller's object
record, which `$25FF7A` never sets (W294), and line 9 needs a ctx for its note. So the driver
takes both and threads them, rather than pretending the ROM's register state is
reconstructible from the record alone. That is the W294 rule applied one level up.

## What is left in the subsystem

One counted note inside line 9 (`$2532B6`, the deferred text path player.js already names),
and W290's high-score insert -- `$287BD2`/`$287C08`/`$287C3E`/`$287CEE`. **That insert is now
the largest single thing left here**, and every RAM address it reads is already named in
`hud.js`, so the work is the comparison logic and the slot walk rather than the addressing.

## Order for the next wave

1. **THE HIGH-SCORE INSERT.** `$287C3E` writes the loop and stage into `$81B420`/`$81B430`,
   calls `$287CEE` for a slot, and compares overflow words; `$287BD2`/`$287C08` are the P1/P2
   heads that load the state. BCD comparison, so it wants care rather than speed.
2. **`$2532B6`**, line 9's deferred text path: one `$240E1A` plus four `$240DC2` calls, both
   printers ported since W116.
3. **`$280252`** stays blocked on measuring A0 at `$28029A` (W288); W294's rule says why.
4. `$280BCE`'s 5/6/7 need `fillGeneralImpact280B3E` parameterised on the speed draw.
