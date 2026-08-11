# W278: the two-player selection lockout, and where the screen enters the tally

Status: DONE. Suite 1930/1930 (1925 + 5), sweep 0 missing on both the shipped seed and the
stage-2 rung, both run before the commit.

Three more of object `[11]`'s pieces, and reading `$25DEAE` on the way found the link that
nobody had located: **what puts the screen into state 2.**

## Starting state

W277 committed at `d609665`, suite 1925/1925.

## `$25DAEA` IS A TWO-PLAYER LOCKOUT, AND ITS SIDE TEST IS INVERTED ON PURPOSE

    lea $813008,A0 / tst.b ($7,A5) / bne $25DB00 / lea $813018,A0
    move.b ($1,A0),D1
    tst.w $81308C / bne $25DB12 / move.w #$FFFF,D1
    cmpi.b #$FF,D1 / beq -> CARRY CLEAR
    cmp.b D7,D1   / bne -> CARRY CLEAR
    otherwise           -> CARRY SET

**`bne` jumps PAST the second `lea`, so side NON-ZERO keeps `$813008` and side ZERO takes
`$813018`.** That is the opposite sense to every other side test in this file, and it is
correct: a side has to read the OTHER side's saved selection for a lockout to mean anything.
A copied line would make each side lock itself out of its own choice, and nothing would
throw. Asserted from both sides.

Three things fell into place at once:

* `$813008`/`$813018` are the two SAVED-SELECTION records, and **`$25D990
  move.b #$FF,$813008` -- the instruction that pins W276's data window -- is what writes
  the "nothing saved" sentinel this routine tests for.** The window's far end and the
  sentinel are the same fact seen twice.
* that `$FF` is the same `$FF` `cursorsFromPosted25D9E6` treats as "use the defaults", so
  W277's routine and this one agree on what an unset selection looks like.
* `tst.w $81308C` is the LIVE-SIDE count (`liveSides25FD94`, `HUDRAM.attract` in this port).
  Zero means one live side, and D1 is then FORCED to `$FF`: **a one-player game has no
  lockout at all.** Asserted, because a port that skipped that test would lock a solo player
  out of whatever the absent second player's record happened to contain.

## `$25DFF6` and the input read

`$25DFF6` is three instructions: `jsr $28D53C / bcs -> rts / bra $25E0F2`. The tail is
counted by address, and the note says what is on the other side of it -- `$25E0EA` is
`lea ($25E006,PC),A0 / bra $25E200`, and `$25E006` is a run of `$20` bytes, **ASCII spaces**,
so the pair is a text blit and `$25E200` is the printer.

`$23D186`/`$23D18E` are two instructions each -- `move.w $803972,D0` and `move.w $803978,D0`
-- and they are the descriptor's `($8,A4)`, the second of its three code pointers. They read
`RAM.p1edge`/`p2edge`, the EDGE words, so a held direction moves the cursor once rather than
every frame. The bits the screen tests are 2 and 3, which `BIT` names LEFT and RIGHT.

## THE FIND: `$25DF48 bra $25DB7C` IS HOW THE TALLY IS ENTERED

`$25DEAE` is the selection screen's main body and it is not ported here, but reading it
answered a question W276 left open. Its tail:

    $25DF18  cmp.b D6,D7 / beq          -- did the cursor actually move?
    $25DF1E  jsr $28C6FA                -- the MOVE sound, only if it did
    $25DF24  move.b D7,($f,A5)
    $25DF28  movea.l ($10,A4),A0 / move.b ($f,A5),($1,A0)    -- SAVE the selection
    $25DF32  subq.w #1,($12,A5) / beq $25DF42                -- the $4B0 TIMEOUT
    $25DF3A  andi.w #$70,D0 / beq $25DF4C                    -- buttons 1/2/3
    $25DF42  jsr $28C6E0 / **bra $25DB7C**                   -- CONFIRM, then STATE 2

So the screen leaves state 1 on a button press OR when state 0's `$4B0` counter runs out,
and `bra $25DB7C` is a direct branch into state 2 -- **it does not go through the dispatcher
and it never writes `($2,A5) = 2`.** W276 wondered what set the state byte to 2; nothing
does. That is why `screenState2_25DB7C` is exported separately from the dispatcher, which
turns out to have been the right shape for a reason W276 did not know.

And `($10,A4)` -- the descriptor's FOURTH long -- is `$00813008` for descriptor A and
`$00813018` for descriptor B: exactly the two records `$25DAEA` reads. The save and the
lockout are the same pair of bytes, so the whole design closes.

The cursor itself wraps 0..2 with a retry loop: `subq.b #1,D7 / bge / move.b #$2,D7` then
`bsr $25DAEA / bcs` back to the decrement, so it keeps stepping until it finds an entry the
other player is not on. Three entries -- the y table again, a fourth independent confirmation
of that size.

## Order for the next wave

1. **`$25DEAE` and `$25E0EA`**, the last of state 1. `$25DEAE` is now fully read except its
   draw tail from `$25DF4C` (which loads `D1 = $5BC00000` for side 0 and `$5BC02600` for
   side 1); `$28C6FA` and `$28C6E0` are sounds and stay counted. `$25E0EA` needs the extent
   of the text at `$25E006` measured and `$25E200` read. State 1 also installs a palette from
   `$225978` -- run `node tools/export-web.mjs --extent 0x225978` first.
2. **THE EIGHT BONUS LINES AT `$25FF52`** -- the score tally's actual arithmetic and the
   largest thing left in the subsystem. `$25FF92` is the only reader of the table and comes
   first. Until these land the tally RUNS and its rows PAINT but the figures are not the
   cartridge's, which is worth saying out loud.
3. The menu cursor `$25DD0C`, then the four other announcement-poster caller regions, then
   D11's remainder and stage 5.
