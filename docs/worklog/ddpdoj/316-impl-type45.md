# W316: stage-5 type $45 -- fifteen missing types becomes fourteen

Status: DONE. Suite 2304/2304 (2288 + 16), no skips. Sweep 0 missing on both.
`dojcoverage.py` reports **78/256 enemy types ported, 48 unknown** (was 77/49) with both OK lines.

The first of stage 5's missing types, and the biggest by record count: 21 of its 770.

## Starting state

W315 committed and pushed at `21d3374`, suite 2288/2288.

## NOT ONE NEW PRIMITIVE, WHICH IS WHY IT COULD BE FIRST

Every routine type `$45` calls, the port already had:

    $2637A2 / $26377A   loadSubProto / loadRecordProto
    $263808             readMovementInit (readInitPosition locally)
    $24179E             scrollCompensate
    $286096 / $28615E   scoreHit / scoreKill
    $289004             spawnEffect
    $24202C             aim64AtTarget
    $281402             the bullet fan, through fireBullet
    $28C25A             a cue sound.js already knows
    $263762             freeEnemy

And `$270EB4 jsr $27F8F0` with `D0 = 8` is **`allocPoolA27F8F0` at kind `$08`** -- one of the two
hooks W312 added four waves ago. Without W312 this handler's death arm would have thrown, so the
order those two waves happened in was load-bearing rather than incidental. That is the argument for
having spent W312 on the finish hooks instead of a presentation panel.

## THE SHAPE, AND WHAT A NAIVE TRANSCRIPTION GETS WRONG

A four-state machine on `($17,A5)` with a ramped sprite:

    state 0  a delay on ($1A)/($1B)                                        -> 1
    state 1  a delay on ($1C)/($1D), RAMP ($1E) up by 4, clamp at $1C; at the clamp aim once,
             store (dir + 2) & $3C in ($26), load the burst counters       -> 2
    state 2  below X $1400 -> 3.  Otherwise a two-level burst on ($20)/($22) firing at the
             STORED angle, re-aiming only when ($24) runs out
    state 3  a delay, RAMP ($1E) back down by 4 to zero                    -> 4

**The four state tests are independent ascending `cmpi.b`s, not a switch.** A state set inside one
arm falls into the next arm's test on the SAME frame. Two of my own test expectations were the naive
ones and the port corrected them:

* State 1's clamp sets state 2 and loads `move.w #$808,($20,A5)` -- and state 2's arm then runs
  immediately, so the observed value is `$0708`. I expected `$0808`.
* State 2 dropping to state 3 also lets state 3 run, and with the ramp already at zero it reaches
  state 4. **Three states in one frame.** I expected it to stop at 3.

Both are asserted now, with a control for the second so "three states in one frame" cannot be
confused with "the state field is not written".

And the W273 lesson again: `move.w #$3,($24,A5)` puts **zero** in the byte at `$24` and the 3 in its
reload at `$25`, so `tst.b ($24,A5)` is false on the very next instruction and the `($20,A5)` arm is
the one that runs. That is why the `$0708` above is `($20)` and not `($22)`.

## `($1E,A5)` IS BOTH THE RAMP AND THE SPRITE INDEX

`$270FEA adda.w ($1E,A5),A0` indexes `$27100C` by it directly, and the ramp moves 0..$1C in steps of
4 -- so the eight longwords are an open-and-close animation and the ramp IS its frame counter. Two
of the four states exist only to drive it, which is why the state machine looks larger than the
behaviour.

Nothing in the ROM bounds that index; the two ramp arms are what keep it on the grid. The port
throws on an off-grid or out-of-range value rather than reading past the eight entries, and the test
drives `2`, `$1E` and `$20` to prove it.

## THE BOUNDS TEST AND THE FLASH

`cmpi.w #-$800,($2,A6) / bgt` is SIGNED and on the SUB-record's X, not the record's. An unsigned
reading frees nothing, because `$F800` is large unsigned; three off-screen values and one just
inside are asserted.

The hit arm XORs the palette byte (`$270E6A eor.b D2,D0` on `($1D,A6)` against `($19,A5)`) rather
than assigning it, and the no-hit arm restores it from `($18,A5)`. An assignment would make the
flash permanent; the XOR is what makes it alternate while the hit bit keeps being set.

## Changes

* `src/handlers.js`: `handler45`, `draw45`, `T45`, a local `due8` (the same three lines `bee.js`,
  `boss2attacks.js` and `stage4type41.js` each carry), and the registration.
* `src/initbody.js`: the `$270DD8` body, in that file's own `BODY.set` idiom rather than in
  `handlers.js` where I first wrote it.
* `tools/export-tables.py`: two windows, both bounded on BOTH sides by code -- `$270E08 + $2E` ends
  at the handler and `$27100C + $20` ends at type `$46`'s init. 407 windows.
* `tests/w316type45.test.js`, 16 assertions.
* Five count pins moved: the handler address list and adapter count (65 -> 66), the init-body count
  (70 -> 71), `enemy_types` (77/49 -> 78/48), and **W314's work list from fifteen/65 to
  fourteen/44** -- which is the mechanism that file was built for.

## A DEFECT IN THIS WAVE'S OWN DIFF, stated because the commit is misleading

`8760577` shows 571, 676 and 926 changed lines in `handlers.test.js`, `initbody.test.js` and
`integration.test.js`. **Those are line-ending conversions, not content.** Three files were CRLF and
I edited them with `python ... open(p,'w',newline='\n')`, which rewrote each one whole. The actual
content change in the three is six lines, verifiable with
`git diff --ignore-cr-at-eol 8760577~1 8760577`:

    handlers.test.js     + 0x270e36 and its two comment lines
    initbody.test.js     + the $270DD8 assertion, and 70 -> 71
    integration.test.js    65 -> 66, and one narrative string

LF is what the project wants, so the files are more compliant than they were -- but burying a
three-line change in a two-thousand-line diff makes the commit unreviewable, and I had already told
myself this session to preserve a file's existing convention. It is recorded here rather than
rewritten, because the commit is pushed and rewriting shared history to tidy a diff is worse than a
noisy diff with a note against it.

**The rule for next time is narrower than "write LF":** use `Edit` on files you have not read the
line endings of. Four separate heredoc accidents this session -- three lost `\'` escapes and this
conversion -- all of them avoidable the same way.

## Order for the next wave

1. **TYPE `$46` (13 records), then `$8E` (6)** -- the two biggest left, 19 of the 44 remaining. Then
   `$1B` (5), `$1A` (4), `$81` (3), the four at two each and the five at one. The list, ranked, with
   every init and handler address, is in `tests/w314stage5scope.test.js`.
2. Stage 5's boss and end sequence, then **the loops** -- seven loop-2 rules are translated and all
   read `$813098`.
3. **`$280252`** still blocked on measuring A0 at `$28029A` (W288).
4. `$23E45A`, the sixth zooming-family member. Gates `$28F7F4` and `$28FAF4`, both presentation.
5. The four other announcement-poster caller regions, then D11's anim tier.

**Run `python games/ddpdoj/tools/dojcoverage.py` as well as the suite.** Its inventory check is what
caught W315's wrong registration, and it is what confirmed this one: a handler needs its init body
registered too, or the record the ROM never filled goes live.
