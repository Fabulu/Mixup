# W234: the bee popup (docket D6)

Status: COMPLETE

## Scope

Docket D6: bees can be collected but nothing indicates it. The award was never the
problem -- the collect arm sets bit 0 at `$27FC72`. What was missing was everything
the player sees.

## Starting state

W233 is committed at `1e81007`, suite 1629/1629, streams 3979.

## Delivered

- Translated `$28112C`, the collected-animation arm, replacing the `note()` in
  `beeBody27FACC`. Its body from `$281140` is the SAME INSTRUCTIONS as `$2810CA`,
  which W111 already ported as `collectedImpact2810CA` -- the same fields, the same
  borrow semantics, the same `$23DBCA` zoomed draw -- so this routine is that one
  plus three things, and it calls it rather than repeating it.
- `$2811BE`, the digits: the two-axis bias across the swap, then the fixed
  `$20168C` tile. It RETURNS its D1, because `$2811A8 bra $28129E` runs on the D1
  this routine modified and the biases compound.
- `$28129E`, the x2 indicator, and its five-tile cursor at `($12,A6)` running `$10`
  down to 0 with the borrow reloading `$10`.
- `$27FC24`, the popup descriptor write. The ladder turns out to hold packed values
  (`$10004`, `$20004`, ... `$10008`) rather than descriptors, and nothing in the arm
  reads `($10,A6)` back, so the write is transcribed and NOTHING asserts a meaning
  for the field. W233's open question stays open and stays honest.
- `$23EC20` cost nothing, exactly as the spec predicted: it is
  `enqueueRegisters(ram, 8, ...)`, bucket 8, with `NO_ZOOM_OR` and `ENQUEUE_MASK`
  already the two constants it ors and masks with. That is the second time this
  session a "new emitter" was a family member, after `$23F82A` = `emitScaled` on
  bucket 22 in W232.

### A defect this uncovered

`$27FC08 bset #$5,(A6)` is BYTE-sized on a memory operand, so it sets bit 5 of the
byte at +0 -- `$2000` of the status WORD. The port set `$0020` and
`w111bee.test.js` asserted it. Three things say `$2000`: `$28112C` tests
`btst #$D,D1` with D1 = the status word, `$2811A2` tests `btst #$5,(A6)` on the same
byte, and the KIND index is `d1 & $7C` (bits 6..2), which bit 5 of the word sits
inside -- a flag there would corrupt the kind. So the x2 flag could never be read,
and the x2 popup and its flicker could never have appeared. Both the code and the
test are corrected, with the reasoning in both.

## The data

Two ROM windows, each bounded by its own cursor rather than by a run length:
`$27FD4A+$28` (ten longwords; the `$817F82` cursor steps by 4 and the bee count
caps at ten) and `$2812D4+$14` (five longwords; `($12,A6)` runs `$10` to 0).

Six sprite streams harvested -- the digits tile and the five x2 tiles -- because
none was in the bundle and the popup would have drawn nothing without them, which
is the trap the banner pictures set in W232. Stream total 3979 to 3985.

## Verification

`node --test games/ddpdoj/tests/w234beepopup.test.js` -> 5/5: the digits enqueued
into bucket 8 with their exact tile, D3 and D4; the timer floor suppressing them;
the lifetime byte clearing the slot and dropping the `$817F7E` census; the x2 flag
drawing the indicator AND toggling the attribute byte only on the `$80390C` phase,
which is what makes it flicker; the cursor cycling all five tiles and reloading;
and all six tiles shipped.

Full suite -> **1634/1634**. `w230descriptorsweep.mjs` -> zero unresolvable
descriptors.
