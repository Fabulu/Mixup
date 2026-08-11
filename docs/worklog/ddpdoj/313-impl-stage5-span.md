# W313: stage 5 starts, and its spawn layer needs nothing new

Status: DONE. Suite 2280/2280 (2271 + 9), no skips. Sweep 0 missing on both.

The handoff has said "Stage 5 has not started" for many waves and "nothing blocks this any more"
for almost as many. It is started, and the measurement is better than expected.

## Starting state

W312 committed and pushed at `b25d57e`, suite 2271/2271.

## A NOTE ON WHAT I STOPPED DOING, AGAIN

I opened this wave on `$23E45A`, the third emitter convention that gates the name-entry panel. It
is the register-convention sibling of the zooming family `spritequeue.js` already documents in
detail -- same `$80 - (D6>>8)` scale arithmetic -- but with its own table at `$23E78C` and the
extent taken from D3 instead of `($E,A6)`, so it is a sixth family member, not one of the five
`resolveZoomStub` accepts. It also needs the emit-stub window widened past `$23E0C2`.

That is a real wave, and it gates **presentation**. The goal names stage 5 and the loops. Thirteen
waves had gone into the high-score subsystem. So the effort went to the thing the goal names.

## THE SPAN, MEASURED THE WAY W192 AND W211 MEASURED THEIRS

The cartridge's stage table already carried stage 5's row and the export guard already asserted
it: script `$237978`, aux `$239190`, resource `$239396`. What was missing was the ROM window --
and stage 4's window ends at exactly `$237978`, so not one byte of stage 5 was readable.

    script  $237978  770 records x 8 bytes, $FFFF terminator at $239188, then SIX bytes of pad
    aux     $239190  259 words (max index 258, 256 distinct), and $239190 + $206 == $239396
    res     $239396  the movement streams, offsets sorted and distinct, last at res+$0BF6

**Stage 5 is the one stage whose span is not closed by the next stage's script.** Stages 1..4 each
end where the following stage begins, and the guard asserts exactly that for 2, 3 and 4. There is
no stage 6. So the far end had to come from the data: the last stream starts at `$239F8C`, runs 42
bytes, and closes `20 00 00 00` -- the same close stage 4's last stream has, which is what makes it
a family rule rather than a guess. `$239FB8` begins unrelated data (`4C 00 18 01`).

Span: `$237978 + $2640`. The guard asserts the record count, the terminator address, the aux
abutment, the offset ordering, the stream terminator, the computed far end, AND the four bytes
after it -- because a mis-sized window here would feed `4C 00 18 01` to the movement reader as if
it were a stream.

## THE MEASUREMENT: ALL 770 RECORDS SPAWN, WITH ONE KNOWN GAP

Installed stage 5 the way `$26331E` does -- from the table, nothing typed in -- and walked the
whole clock range:

    installed cursor = $237978, aux = $239190
    OK: walked 1024 clocks, spawned 770 records
    counted gaps: 1
      1 x $24200A  the type-$80 init's aim

**No `Unreached` anywhere.** Every one of stage 5's 770 records resolves to an enemy type the port
already has, and the single counted gap is one stage 1's own sweep also produces. So stage 5 adds
no new gap at all, which is a stronger statement than "it does not throw".

35 distinct types across the 770. Four dominate -- `$05` (280), `$0B` (148), `$11` (88) and `$82`
(66) -- and the high types appear in ones and twos the way a final stage's do: `$8A` (10), `$95`
(8), `$8E` (6), `$B0` (1). The census is pinned so a wave that changes a type's reachability can
see at once whether stage 5 is affected.

It is also the biggest stage by some margin: 770 records against stage 4's 382, stage 3's 414 and
stage 2's 332, which is why its window is the largest of the five.

## What this means for the goal

The goal is "one credit from stage 1 to stage 5 with no Unreached". At the spawn layer stage 5 is
already there. What remains is what a live run does with those enemies -- the handlers are all
present by type, but no scenario has driven them in stage 5's combinations -- and the stage's own
boss, script VM arms and end sequence.

## Changes

* `tools/export-tables.py`: the `$237978 + $2640` window and a W313 guard block. 405 windows.
* `tests/w313stage5.test.js`, 9 assertions.

No source change: the spawn layer needed none, which is the finding.

## Order for the next wave

1. **DRIVE STAGE 5 LIVE.** The spawn layer is clean, so the next measurement is a running
   scenario: install stage 5, advance the distance clock as a real credit would, and run the
   object driver rather than only the walker. That is what found stage 4's gaps and it is now the
   cheapest way to scope stage 5's.
2. Stage 5's boss and end sequence, then **the loops** -- seven loop-2 rules are translated and
   all read `$813098`.
3. **`$280252`** still blocked on measuring A0 at `$28029A` (W288).
4. `$23E45A`, the sixth zooming-family member: `movem.l D4/D7/A0`, its own table at `$23E78C`,
   extent from D3, and it needs the emit-stub window widened past `$23E0C2`. It gates `$28F7F4`
   and `$28FAF4`, both presentation.
5. `$280BCE` is DONE at eighteen of twenty; indices 1 and 16 belong to `allocBee27F92A`.
6. The four other announcement-poster caller regions, then D11's anim tier.
