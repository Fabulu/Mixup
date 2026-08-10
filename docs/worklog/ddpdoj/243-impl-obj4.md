# W243: object dispatch [4], the per-side announcement

Status: TRANSLATED AND TESTED; registration held on an artifact rebuild

## Scope

`$240F62[4]` = `$260B30`, priority `$0009`. The descriptor sweep counted it 1800
times per 900 frames -- twice a frame, once per side -- and it had been "handler not
ported in wave 4" for the project's life.

## Starting state

W242 is committed at `fdb6242`, suite 1661/1661.

## What it is

The announcement text. A four-state machine that blanks its own 2x14 strip and then
prints a message one cell at a time. Its MAILBOX is what made it look opaque:
`$260A20` picks `$813162` for P1 and `$813166` for P2, and the `$26080A` family posts
a (flag, state) pair there. Each frame the object reads the flag, clears it, and when
the state word differs from the one it is running it drops the per-state latch and
switches.

Every dependency was already in the port: `$240DC2`/`$240EBC` are
`txPrint240DC2`/`txPrint240EBC` (W116), and the two `$2872xx` calls are nine words of
RAM each.

## The thing that would have shipped wrong

The three states that scroll have SEPARATE TAIL COPIES in the cartridge --
`$260BD6`, `$260CD2`, `$260DA4` -- and they are NOT identical. I implemented one
shared tail from state 2's copy, and the test's timer assertion is what led to
reading the other two:

- state 1: `cmpi.w #$40`, SIXTEEN entries, list PC-relative at `$260C28`, D2/D3 = 1/`$B`
- state 2: `cmpi.w #$20`, EIGHT, list from `($10,A5)`, D2/D3 = 0/6
- state 3: `cmpi.w #$40`, SIXTEEN, list PC-relative at `$260DF6`, D2/D3 = 1/9

So only state 2 uses the `$10(a5)` pointer, which is why only state 2 sets it. A
single shared tail was wrong in two states out of three, and wrong in a way that
reads a list half the right length.

Four ROM windows, all bounded by code or by their own cursor: `$260D22+$40` (state
2's two lists, ending at `$260D62`, state 3's code), `$260C28+$40` (ending at
`$260C68`, state 2's code), `$260DF6+$40`, and the jump table's four longwords are a
JS constant because the port does not read them through a window.

## Verification

`node --test games/ddpdoj/tests/w243announce.test.js` -> 6/6: the list extents and
their code boundaries; the first frame initialising and CLEARING its mailbox rather
than reading it; a posted state switching, dropping the latch and blanking the strip
(with the timer one tick down, because the state's one-time arm falls through into
its own tail on the same frame); state 2 arming the scroller and printing from its
list; the cursor visiting all eight and wrapping; and a state past the table being a
loud throw at `$260B5A` rather than a silent read.

Full suite -> **1667/1667**.

## Why it is not registered in main.js yet

Registering it turns FIVE replay gates red, and not for a reason in the code. The
`.replay` regression fixtures embed their own `player.tables.json` as
`seed.tablesB64` (`w132liveplay.test.js:137`), frozen when the oracle recorded them.
A subsystem that reads a window added after that recording throws `$260D2A` inside
them no matter what `rip/port/` or the web bundle now hold -- I regenerated both and
it changes nothing, because the fixture carries its own copy.

So the honest state is: translated, tested against the cartridge, and one line away
from live. To finish it, rebuild `tools/oracle/out/w69/fly-around` from the oracle and
add the entry back. `main.js` carries that instruction at the commented-out entry.

Reverting the registration rather than leaving five gates red is the same call this
project makes everywhere else: a red gate that everyone learns to ignore costs more
than a feature that waits one wave.
