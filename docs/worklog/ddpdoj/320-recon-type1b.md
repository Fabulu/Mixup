# W320: type $1B read, and `$8130D8` is neither of the two things the port calls it

Status: RECON, no source change. Suite 2315/2315 unchanged, green, no skips. Sweep 0 missing.

Type `$1B`'s init body is read completely and its handler as far as `$2694AA`. The wave's real
product is a **naming conflict two source files hold about one address**, found by reading `$1B`'s
first and last instructions.

## Starting state

W319 and the HIBACHI CLOSURE RULE committed and pushed at `cd499de`, suite 2315/2315.

## `$8130D8` IS A LIVE-ENEMY COUNTER, AND TWO FILES DISAGREE ABOUT IT

Type `$1B` brackets its own lifetime around it:

    2692c4  addq.w #1,$8130D8      the last thing its INIT BODY does before the movement read
    26936a  subq.w #1,$8130D8      on the off-screen FREE path, before `jmp $263762`

That is a refcount. And it has **32 references in the build**, including the init bodies of five
stage-1 types the port already has (`$269BD8`, `$26A1F4`, `$26A4C6`, `$26A79E`, `$26ABAA` sit inside
`$269BCE`, `$26A1EA`, `$26A4BC`, `$26A794`, `$26ABA0`), which `tst.w` it rather than write it.

The port currently believes two different things about it, in two files:

    src/handlers.js:195   midbossD8: 0x8130d8      -- and it is not a midboss flag
    src/bullets.js:91     initX:     0x8130d8      -- "$28190C reads these two into the record"

`$28190C` is `move.w $8130D8,($18,A0)`: it copies the counter's CURRENT VALUE into a bullet field.
The comment describes that correctly; the NAME `initX` asserts the address is an X coordinate, which
it is not. `initY: 0x8130da` next to it is the same claim about the neighbouring word.

**Neither name is right and both are load-bearing if anything ever reads them for meaning.** This is
recorded rather than fixed because renaming across two subsystems at the end of a long session is how
a wrong rename ships: the correct fix is one wave that reads `$28190C`'s caller to see what
`($18,A0)` is used FOR, and reads at least two of the five stage-1 `tst.w` sites to see what they
gate. Then rename once, in both files, with the evidence in the comment.

It also sharpens W317: type `$59` gates its deferred spawn on `tst.w $8130D8 / bne`, and W317
recorded that as "the midboss gate" on the strength of `handlers.js`'s name. What it actually means
is **"do not spawn while counted enemies are alive"**, which is a different and more sensible rule.
W317's port is unaffected -- it tests non-zero either way -- but its comment is now known to be
describing the wrong mechanism.

## AND `$1B` SHARES `$8E`'S DAMAGE ARM

    26937e  moveq #$5C,D1 / and.b (A6),D1 / bne          the hit mask, same constant
    269384  move.b ($1C,A5),D0                           the base palette
    269388  cmpi.w #$380,($18,A6) / bcc                  HP full -> keep it
    269390  tst.w $8130CA / bne
    269398  moveq #$19,D0                                low HP + gate clear -> palette $19
    26939c  andi.b #$A3,(A6) / jsr $286096               clear, then scoreHit
    2693b0  ($1C,A5) and ($1D,A5) -> the XOR flash
    2693ba  tst.w ($18,A6) / bmi                         the death arm

W319's type `$8E` is the same nine steps with `$140` instead of `$380` and `($18,A5)`/`($19,A5)`
instead of `($1C,A5)`/`($1D,A5)`. **Two types, one damage arm, two parameter sets** -- the same
finding shape as W287, W298 and W312, and it means `$1B`'s 1020 bytes are cheaper than they look.

Worth noting for the port's structure: this is now a candidate for a shared helper rather than a
third transcription, and the third one will say whether it is a family of two or of many.

## WHAT IS READ, FOR THE WAVE THAT WRITES IT

Init body `$26925E..$2692D0`:

    26925e  loadSubProto($2692FA), and the RETURN goes to ($44,A5) -- the table advance, as W218's
            type $9F does
    26926e  loadRecordProto($2692DC, $E) -- 15 words
    26927c  D0 = D1 = 4; if $813092 > 1 then D0 = 3, D1 = 0   (`bls`, so stages 0..1 keep 4/4)
    269296  ($2F,A5) = D0 ; ($2E,A5) = D1
    26929e  ($28,A6) indexes $26971C -> ($2A,A6)              the sprite
    2692ae  $813094 (stage*2) indexes $2692D2 -> ($1C,A5), ($1D,A5)
    2692c4  addq.w #1,$8130D8
    2692ca  jmp $263808                                       a TAIL jump, not a jsr

`$2692D2` is five two-byte rows and **all five are `0A 15`** -- the stage index changes nothing here,
which is worth an assertion so a later reader does not hunt for a per-stage difference that is not
there.

Handler, to `$2694AA`:

    269350  stepMovement; then an INLINE bounds test (`($2,A6) + $C00 + $7800`, carry = off) rather
            than a call, and the free path decrements $8130D8 first
    26937e  the damage arm above
    2693c6  jsr $28AC72                the sub-record spawn engine -- already COUNTED by the port
    2693cc  tst.w $8130D2 / bne        the freeze
    2693d4  ($6,A6) = $F400, then ($1B,A6) < $40 gates a ($2E,A6) += $20 sweep whose bit 6 is
            subtracted from ($6,A6)
    2693f4  cadence ($26,A6)/($27,A6); ($1B,A6) decides whether ($28,A6) ramps UP 0->$C wrapping
            to 0, or DOWN with a borrow reload to $C -- a FOUR-entry ring
    269424  ($28,A6) indexes $26971C -> ($2A,A6)
    269434  tst.L $8130D2 twice in a row, at $269434 and $26943E, both `bne $269582`
    269448  X >= $1000, then a two-state machine on ($18,A5): state 0 arms ($1E,A5) = $10 and
            goes to state 1; state 1 runs a ($22,A5)/($23,A5) cadence, requires X < $6C00, and
            ramps ($24,A5) by 4 through the EIGHT longs at $26972C into ($26,A5), setting
            ($34,A5) = $FFFE at index $1C

Tables and their extents: `$2692D2 + $0A` (five rows), `$2692DC + $1E` (15 words), `$2692FA + ?`
(the sub prototype, and `loadSubProto`'s return goes to `($44,A5)` so its end is what that call
computes), `$26971C + $10` (FOUR longs, descending by `$34`; `$26972C` breaks the pattern), and
`$26972C + $20` (eight longs).

Still to read: `$269582` onward and the death arm at `$26962E`.

## Order for the next wave

1. **Finish `$1B`** from the plan above -- read `$269582` and `$26962E`, then write it, and consider
   sharing the damage arm with `$8E` rather than transcribing it a second time.
2. **Then `$8130D8`, as its own small wave**: read `$28190C`'s caller and two of the five stage-1
   `tst.w` sites, then rename in `handlers.js` AND `bullets.js` together with the evidence. Do not
   rename from this worklog alone.
3. Then `$81` (3 records), `$1A`, `$49`/`$4A`/`$4B`, `$47`, then the dependency bundles.
4. **`$B0` is boss reconnaissance, not an enemy.** HIBACHI CLOSURE RULE in the handoff.
