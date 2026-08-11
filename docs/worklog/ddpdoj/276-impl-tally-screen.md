# W276: object dispatch `[11]` -- the stage-clear screen, and the tally now RUNS

Status: DONE. Suite 1917/1917 (1901 + 16), sweep 0 missing on both the shipped seed and the
stage-2 rung, both run before the commit. `top_objects` coverage 8/20 -> **9/20**.

`$2600D8` landed in W273 with nothing to drive it. This wave gives it its driver, and the
owner's "maybe even score totalling, which I see none of" now has a code path from the object
table to the digit records.

## Starting state

W275 committed at `5925dd4`, suite 1901/1901. The handoff already carried W276's corrected
scope, committed at `563a264` -- this wave implements the first cut that note proposed.

## WHAT LANDED, AND WHAT DID NOT

    $25DBB4  the dispatcher, on ($2,A5)                        PORTED
      state 0  $25DB30  descriptor, header, post, arm          PORTED
      state 1  $25DBC4..$25DD0A  the gates and the cursor      ONE COUNTED NOTE
      state 2  $25DB7C  the two cursors, $2600D8, self-kill    PORTED
    $28D53C  the carry from $81DF20                            PORTED
    $23C932  the two menu DIP bytes                            PORTED
    $2533F6 / $253448  the screen's header, eight prints each  PORTED

State 1 stays counted on purpose. Its six unported dependencies are named IN THE NOTE --
`$25DA60`, `$25DA94`, `$25DFF6`, `$25DEAE`, `$25E0EA` and `$25FF38` -- and the test asserts
all six appear in it, so the next wave reads the list instead of re-deriving it. `$25FF38`
is the one that makes guessing unacceptable: it does `lea $8130FA,A0`, i.e. it writes the
tally records this file exists to drive.

## THE TWO CURSORS ARE INDICES, AND THAT IS THE TRAP

    $25DB88  add.w D0,D0 / lea ($25D986,PC),A0 / move.w (A0,D0.w),D0
    $25DB98  add.w D1,D1 / lea ($25D98A,PC),A0 / move.w (A0,D1.w),D1

The x table is `(0, 2)` and the y table is `(2, 4, 6)`, so **cursor 1 posts 2 and 4, not 1
and 1.** `$813084` is the LIVES-ICON index `livesRow2878CC` reads through `$2881E2`, so a
port that handed `($e,A5)` straight to `$2600D8` would draw the wrong icon and nothing would
throw. Asserted against the tables read out of the cartridge.

D2 is the RAW side byte and `$2600D8` tests it as a word, so a side byte of 2 or more still
selects side 1. Handed over raw for that reason, and state 0's three `tst.b / bne` reads have
the same sense -- also asserted, with `$7F`.

## ONE WINDOW COVERS ALL FOUR TABLES AND CODE PINS IT

    $25D952  descriptor A, 26 bytes
    $25D96C  descriptor B, 26 bytes        ($25D952 + $1A -- they abut)
    $25D986  the ($e,A5) table, TWO words
    $25D98A  the ($f,A5) table, THREE words

`$25D952 + $3E` is `$25D990`, and `13 FC 00 FF 00 81 30 08` there is
`move.b #$FF,$813008` -- **CODE**. So the extent is measured, not guessed, and the test
asserts both halves: `$25D98E` resolves and `$25D990` throws.

That adjacency is also why a cursor past its table is COUNTED rather than clamped: an x
cursor of 2 reads the y table's first word, and a y cursor of 3 reads the instruction. A
clamp would post a plausible wrong icon; a read would report a window error about
`$25D990` instead of naming the cursor, which is W264's trap.

## THE DESCRIPTOR'S THREE LONGS ARE CODE POINTERS

Reading BOTH records gives the shape -- `w, w, l, l, l, l, w, w, w` -- and the longs are:

    $25D952 -> $23D16C  $23D186  $23C98E
    $25D96C -> $23D17E  $23D18E  $23C9F0

State 1 calls through `($4,A4)`, `($8,A4)` and `($c,A4)`. **State 2 uses none of them**,
which is exactly why the tally path could land without any of the six.

## THE HEADER IS NOT A MIRROR

    $2533F6  D1 = $0000   first step +$100   loop step +$200   top tile $02D8000A
    $253448  D1 = $1B00   first step -$200   loop step -$200   top tile $02D8008A

Side 1 walks UPWARD from `$1B00`, and its first step is `-$200` where side 0's is `+$100`.
A port that shared the body with a single sign flag would get the loop right and the first
step wrong.

**`move.w #$100,D7` / `move.w #$FE00,D7` before the `jsr $240E1A` IS DEAD.** `$240E44
move.w D3,D7` overwrites it at entry; both routines then load `moveq #$5,D7` for the `dbra`
that follows. The port does not model the dead write and says so at the line, because a
reader who saw `$FE00` and no consumer would otherwise go looking for one.

## Two more things worth recording

`$23C932` puts `moveq #$0,Dn` before each `move.b`, so both results are ZERO-extended. This
is NOT W270's signed-byte trap, and the test drives `$F0` to prove it. The `cmpi.b #$12` is
an equality, so its own sign never comes up either -- and `$13` falling through is asserted.

`$28D53C`'s entire product is the C flag. In JS that is a boolean and the caller's `bcs` is
an `if`; it is exported rather than inlined because state 1 reads it twice and `$25DFF6`
reads it again.

## Registering it, and the number that moved

`main.js` gains `[11, tallyScreen25DBB4]` with a comment that says it is PARTIAL. That is
right for the reason entry `[5]` gives in its own comment: this entry was 900 unattributed
notes a run, and now the notes name the state they came from and the object's two working
states actually run.

`w167coverage.test.js` pinned `top_objects: 8/20 ported` and now pins **9/20**. That is the
number that moves when an OBJECT lands rather than a routine, so it is the one worth pinning.

## Order for the next wave

1. **State 1's six**, in this order, because it is dependency-first:
   `$28D53C` and `$23C932` are done; take `$25FF38` FIRST (it is the one that writes
   `$8130FA`, so everything else in state 1 is safer once it is known), then `$25DA60` and
   `$25DA94`, then `$25DFF6` and `$25DEAE`, then `$25E0EA`'s table-driven jump
   (`lea ($25E006,PC),A0 / bra $25E200`). State 1 also installs a palette from `$225978`,
   which will need a window -- `--extent 0x225978` first.
2. **The menu cursor, `$25DD0C`.** `btst #$2,D0` decrements `($e,A5)` and `btst #$3,D0`
   increments it, each with `move.b #$1,($d,A5)` and a `$28C6FA` sound, and
   `andi.b #$1,($e,A5)` keeps it to two. D0 comes from `($8,A4)` -- one of the descriptor's
   code pointers -- so that routine is the input read and has to come first.
3. **The four other announcement-poster caller regions** -- `$25CDxx`, `$25D5xx`, `$2601xx`,
   `$288A02` -- which share W270's protocol.
4. Then D11's remainder and stage 5.
