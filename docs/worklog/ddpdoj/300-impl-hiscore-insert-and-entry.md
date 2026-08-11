# W300: the high-score INSERT and the entry, and the subsystem closes

Status: DONE. Suite 2079/2079 (2051 + 28), no skips. Sweep 0 missing on both.

W299 unblocked the subsystem by measuring the ordering. This wave finishes it: the insert, the
two heads, the shared body, and bonus line 2's counted gap turned into a call.

## Starting state

W299 committed at `610ac3a`, suite 2051/2051.

## `$287CEE`: NINE PARALLEL ARRAYS, NOT THREE

W299 predicted "a THIRD parallel array at `$803874`" from the one `lea` it had seen. There are
nine. Laid out in address order they tile `$803824..$8038B9` with no gap:

    $803824..$803837   the SCORE longs        5 x 4       -(A2) from $803838
    $803838..$803873   a 12-BYTE-entry array  5 x 12      -(A1) from $803874
    $803874..$8038AF   SIX word arrays        6 x 5 x 2   -(A1,A2,A3,A0,A5,A6)
    $8038B0..$8038B9   the OVERFLOW words     5 x 2       -(A5) from $8038BA

Every `lea` in the family names an END, which is what makes each walk a `-(An)` climb, and the
only proof that the ends are right is that they meet. That is asserted rather than commented.

Two things this shape invites getting wrong:

**The 12-byte array is shifted by three consecutive `move.l (-$10,A1),-(A1)`.** Each reads 16
bytes back and writes 4 back, so the three together move `[X-24,X-12)` to `[X-12,X)` -- one
12-byte entry down one place. Reading the `-$10` as the stride gives a 16-byte array, and the
resulting shift would still leave the inserted score exactly where you asked about it.

**The six word arrays are loaded in the register order A1, A2, A3, A0, A5, A6.** A0 is FOURTH.
A port that assumed address order for the registers would pair array 3 with the wrong source
word, and only a per-column assertion catches that.

The bail is the search's borrow: `$287CF6 bcs $287D90` jumps straight to the `movem` and `rts`,
so a losing score changes nothing at all. The test asserts main RAM is byte-identical after
one, which is stronger than checking the scores and is the check that would catch a port that
shifted first and bailed afterwards.

## `$287BD2`/`$287C08`/`$287C3E`: THE FAMILY CHECK PAID FOR THE WHOLE WAVE

Two heads, one body, and **every one of the eight registers the heads load was already a named
field in `hud.js`, `player.js` or `handlers.js`.** This wave identified exactly one new
address in the entire entry path. The six words the body posts are the six the insert then
distributes, and together they are what a high-score line displays: loop, stage, ship, style,
chain high-water, digit state.

### the `addq.w #4,D0` is a table rebase, not a bias

The only arithmetic in either head. `hud.js` had already recorded that the lives icon comes
from `$2881E2[$813084*2]` for P1 and `$2881EA[$813086*2]` for P2, and those bases are 8 bytes
apart -- **four entries of a word-indexed table.** So the `+4` converts P2's per-side selection
into an index into the same table P1 uses, and the stored word is side-independent: the entry
records which ship was flown without recording which side flew it.

That is the second time this session that a fact an earlier wave wrote down without being able
to use it turned out to be the explanation for a constant.

### `$81309A`, the all-clear override

`$287C4C tst.w $81309A / beq` forces `(loop, stage)` to `(1, 5)`. Stage is zero-based and there
are five stages, so **5 is one past the last index and cannot arise from play** -- it is a
deliberate "ALL" marker rather than a stage number.

`$81309A` has exactly TWO references in the whole build. Scanned the image for the long rather
than guessing: this read, and `$291F5C move.w #$1,$81309A`, which sits on the loop-nonzero arm
of an untranslated `$291Fxx` state machine:

    291f4a  tst.w $813098          the loop word
    291f50  bne $291F5C
    291f54  move.b #$2,($2,A5)     loop 0: advance the sequence
    291f5a  rts
    291f5c  move.w #$1,$81309A     loop reached: raise the flag

So the flag means "this credit got into the loop", and any entry made afterwards is filed under
the single marker `(1, 5)`. That is why it overwrites a loop word that is ALREADY non-zero: a
loop-2 death would otherwise be recorded at a low stage index and read as worse than a loop-1
clear. The port has never touched `$291xxx`, so the routine is characterised by what it does to
this flag and nothing more is claimed about it.

## THE RUNNING-BEST QUIRK, TRANSCRIBED RATHER THAN TIDIED

`$287C88..$287CB0` updates the side's running best in two independent steps: store the overflow
if it is `>=`, then compare the long and store it if it is `>=`. The second test can bail after
the first store has happened, so **a score with a higher overflow but a lower long leaves the
best as `(new overflow, old long)` -- a pair that never occurred.**

This is reachable in real play, not a theoretical corner: the overflow counts 100,000,000s and
DOJ scores get there. A port that tidied it into one lexicographic max would diverge, so it is
written as the ROM writes it, with a test that fails if anyone tidies it later.

It also confirms an inference. `hud.js` named `$81B4A0`/`$81B4A8` from the pairing alone and
said so in the source: "the names are INFERRED from the pairing". They are a running best, and
this is the code that makes them one.

## BONUS LINE 2'S GAP CLOSES, AND THE CARRY SENSE IS THE THING TO PIN

`$287C3E` really does set the carry explicitly, unlike `$287D96`: `$287CDA andi #$FFFE,SR` on
success and `$287CE8 ori #$1,SR` on failure. Bonus line 2 reads it with `bcs`, which SKIPS the
`ori.b`, so **the `$8130CC` bit is set when the side MADE the table.** Both readings compile;
one flags the losing side. Its own test, not a rider on another.

The two bits are 0 for P1 and 1 for P2 from two separate `ori.b` instructions, so a boolean
would have lost one. And `$260078 bcs` lands on the object creation rather than the tail, so a
losing score must still bring the tally screen into existence -- also asserted, because that is
the failure a naive early-return would produce.

## What this closes

The high-score subsystem is complete from the tally line down: `$287BD2`, `$287C08`, `$287C3E`,
`$287CEE`, `$287D96`. No counted gap remains inside any of them. `tally.js` no longer notes
`$287BD2`/`$287C08` and the W290 test that asserted the note now asserts the behaviour.

Still open: the name entry that writes through `($C,A4)` -- this wave only makes room for the
12-byte slot and stamps the `$FF`/`$FE` tag into its first long, leaving eight bytes holding
whatever the shift dragged down.

## Order for the next wave

1. **The name entry.** The 12-byte slot is now allocated and pointed at, and the tag is a
   "not named yet" sentinel. Whatever writes through `($C,A4)` is the next thing in this
   subsystem, and it is reachable from `$8130CC`'s bits.
2. **`$280252`** still blocked on measuring A0 at `$28029A` (W288) -- a register feeding
   arithmetic, per W294's rule, so it really does need the capture.
3. `$280BCE`'s last five: indices 2 (`$280CF8`), 3 (`$280D10`), 17 (`$280DBA`), and 1 and 16
   which belong to `allocBee27F92A`.
4. The four other announcement-poster caller regions, then D11's remainder.
5. Stage 5 and both loops.
