# W234: the bee popup (docket D6)

Status: SPEC COMPLETE, implementation not started

Everything needed is measured. This is a shovel-ready slice; nothing below is a
guess about what the routines do.

## Starting state

HEAD `1e81007`, suite 1629/1629, streams 3979. W233 established that `$240DC2` is
NOT the blocker (W116 ported the TX defer path) and that D6 is two gaps in
`bee.js`.

## What to write

### 1. `$27FC24`, two instructions

Replace the `note()` in the collect arm with the write it describes:

    $27FC24  lea ($27FD4A,PC),A0
    $27FC2A  move.l (A0,D1),($10,A6)      D1 is the SAME $817F82 cursor the base
                                          ladder used at $27FC18

### 2. `$28112C`, the collected-animation arm

Replace the `note()` in `beeBody27FACC`. Measured, instruction by instruction:

- `$28112C` when D1 bit 13 is set AND `$80390C` is non-zero: `eori.b #$10,$1d(a6)`
  -- the popup FLICKERS on the phase word, one frame on, one off.
- `$281140` `$4(a6) += $1a(a6)` -- the short-axis drift.
- `$281148` `subq.b #1,$14(a6)`; when it hits zero, reload from `$15(a6)`, take
  `d0 = $16(a6)`, then:
  - `$28115A` `subq.b #1,$19(a6)`; ZERO means the LIFETIME is over, jump to
    `$2811AE`: clear `(a6)` and `$2(a6)` and `subq.w #1,$817F7E`, the pool census.
  - `$281160` `subq.b #1,$18(a6)`: MINUS subtracts `d0` from the long at `$a(a6)`,
    ZERO also writes `$14(a6) = $28` first, otherwise ADDS `d0`. That is the
    popup's rise and then fall.
- `$281178` push D6, `d6 = $40004000`, `jsr $23DBCA`, pop -- which the port already
  makes as `enqueueZoomedThroughStub(ram, rom, 0x23dbca, a6, 0x40004000)` at
  `bee.js:717`.
- `$281188` the DIGITS only when `$14(a6) >= 3` (`cmpi.b #$3 / bcs`), then
  `$281190` builds D1 from `$2(a6)` with `- $8(a6)` on the long axis and
  `+ $6(a6)` on the short, and calls `$2811BE`.
- `$2811A2` if bit 5 of `(a6)` is set (the x2 flag the collect arm sets at
  `$27FC08`), fall on to `$28129E`.

### 3. `$2811BE`, the digits

`d1 += $FDC0` on the low word and `+$200` on the high after the swap, `d2 =
$20168C`, `d3 = $210`, `d4 = $1D`, then `$23EC20`.

### 4. `$28129E`, the x2 indicator

`d1 += $400`/`+$40` across the swap, `d2 = [$2812D4 + $12(a6)]`, `d3 = $420`,
`d4 = $1D`, `$23EC20`, then `subq.w #4,$12(a6)` reloading `$10` on the borrow.

### 5. `$23EC20` is FREE

It is `lea $808014 / adda.w $80AFCA / addi.w #$C`, then `asr.l #6`, `andi.l
#$7FF03FF`, `ori.l #$80008000`, then D0/D2/D3/D4 -- which is exactly
`enqueueRegisters(ram, 8, d1, d2, d3, d4)`, on BUCKET 8. `NO_ZOOM_OR` and
`ENQUEUE_MASK` in `spritequeue.js` are already those two constants. No new
emitter, the same way `$23F82A` turned out to be `emitScaled` on bucket 22 in
W232. Check the family FIRST.

## The data it needs

Two ROM windows, both bounded by their own cursors rather than by a run length:

- `$27FD4A + $28` -- ten longwords, the popup ladder. The cursor `$817F82` steps
  by 4 and the bee count caps at ten (`$27FBFA cmpi.w #$A`).
- `$2812D4 + $14` -- five longwords, the x2 tiles. `$12(a6)` runs `$10` down to 0
  in steps of 4 and reloads `$10` on the borrow.

And SIX sprite streams, none of which is in the bundle today (checked against
`assets/spr/streams.u32.gz`): the digits tile `$20168C` and the five x2 tiles
`$201648`, `$201604`, `$2015C0` and the remaining two of `$2812D4`. Without them
the popup will draw nothing even once the code runs -- exactly the trap W232 hit
with the banner pictures, so harvest them in the same commit and re-run
`tools/w230descriptorsweep.mjs` to confirm zero.

## One thing to resolve while writing it

`$27FC24` writes the popup descriptor to `($10,A6)`, which the bee record map in
`bee.js` calls `hitLongA`. Nothing in `$28112C` reads `+$10` directly, so it is
either consumed by `$23DBCA`'s record convention or the field is reused for the
collected state. Settle that from the emitter's own reads before pinning a test on
it, and correct the field's name or document the reuse.
