# W264: DOCKET D3, the missing explosion

Status: DONE. Suite 1814/1814 (1807 + 7), sweep 0 missing, both run before the commit.

The owner reported "Level 1 and 2 have some missing explosion." The screen clear cleared
bullets and drew nothing. It draws now.

## Starting state

W263 committed at `3f07c2c`, suite 1806/1806. The first item in the handoff's work order
was D11's remaining presentation; see the end of this file for why that moved.

## The blocker was a hand-transcribed table, exactly as the note said

`bulletdriver.js` carried a precise note: the allocator (`allocPoolA27F8F0`) and the pool
driver (`runPoolADriver`) were both ported, and the only thing missing was kind `$0`'s
TEMPLATE, which `$280B3E` reads out of `$280E4A` and no window exported. W29 had
hand-transcribed the two kinds it measured into `IMPACT_KIND` and thrown on the rest.

    280b44: lea ($280E4A,PC),A3
    280b4a: movea.l (a3,d0.w),a3       D0 is a BYTE OFFSET, not a kind number

The screen clear's D0 is `$0`, which was not one of the two.

## What the recon actually found, and one correction I had to make mid-wave

`$280BCE` is a parallel dispatch of per-kind FINISH routines and it has **twenty**
entries (D0 = 0, 4, ... `$4C`). I first read the template table as eight longwords and
had to correct it: with twenty dispatch entries the template table is twenty too, and
`$280E4A + $50` is `$280E9A` -- **the first template**. The table pins itself, and the
twenty pointers resolve to SEVEN distinct 22-byte templates.

And THREE of the twenty finish routines are one routine with two parameters:

    D0     routine    hook table   status
    $00    $280C5E    $280C4E      none
    $48    $280DEA    $280C2E      $18
    $4C    $280E1A    $280C3E      $1C

Same instructions in the same order -- the `$420` speed floor, a `$242EC2 & $E` index into
an eight-word hook table added to the sprite, a `$2431F4 >> 1` speed jitter, a
`$242FDE + 1` angle spread, `$241812`, the cached velocity -- differing only in that table
and in the status they normalise to. `$280C5E` INLINES the shared tail (`$280C84`) instead
of `bsr`-ing it and therefore does NOT normalise, which is why the port needs a null
status for D0 = 0 rather than a default.

## What changed

- **Both windows**: `$280E4A + $EA` (twenty pointers plus all seven templates) and
  `$280C2E + $30` (the three hook tables, ending exactly at `$280C5E`).
- **The template and the hooks now come from the cartridge for every kind.** Fourteen
  literals and sixteen array entries stopped being a source of truth.
- **`$27F8F8` IS WIRED.** `bulletdriver.js`'s note is gone, replaced by the call it
  described. `$27F8F8` is the sibling entry that enters the same scan with D1 = D2 = 0, so
  it is `allocPoolA27F8F0(mode, 0, 0, bulletRecord)`.
- **A better throw.** An unread D0 now names its own `$280BCE` dispatch entry -- "port
  THAT address" -- rather than "unported kind". Seventeen of the twenty are still unread
  and each says which routine it wants.

The two hand-measured sets are kept in the test as the REGRESSION WITNESS: the test
asserts the ROM read reproduces them byte for byte, which is what makes this a refactor
rather than a re-measurement.

## Two things the tests caught

- **An error message must never read the ROM.** My first `unreached` built its diagnosis
  out of `rom.u32($280BCE + d0)`, and `$280BCE` is code in no window -- so a bad D0
  reported a window error about `$280BCF` instead of the dispatch gap it meant. The
  message now names the address to look up rather than looking it up.
- **`integration.test.js` was driving `$81B412 = $0001`**, an arbitrary positive value
  chosen to reach the branch. `$81B412` is a D0 BYTE OFFSET, so an odd value was never a
  reachable kind. It now drives `$0`, the real one, and asserts the pool count goes up
  instead of asserting the note.

## Why D11 moved down the order

The handoff's item 1 named `$28C186` and `$28D6FC`. Reading both:

- **`$28C186` is a BGM command** (`-> $28BBAC D0=$16 D1=xxxx`, as `background.js` already
  records at its own call site). It is the SOUND subsystem, not presentation logic, so it
  is correctly a counted gap and there is nothing to translate. The handoff called it "the
  exit handshake", which is where it is called from, not what it is.
- **`$28D6FC`'s real gap is the animation-object EXECUTION engine** -- the per-frame
  machine that walks the `$810346` chain and decrements each node's `$18`. I scanned every
  reference to `$810346` (six sites) and every one is a LOADER or the clear: `$24632E`
  clears the three heads and twenty nodes, and `$246410`/`$24652A`/`$246610`/`$246704` are
  four sibling loaders differing in a `d6` flag. W125's note holds -- the engine is reached
  register-indirect and is not findable this way. It needs its own hunt.

So D3 was the actionable item, and it was player-visible.

## Order for the next wave

1. D4: the stage-2 mid boss. Run `w230descriptorsweep.mjs` DURING stage 2 rather than
   assuming it shares D3's cause -- the sweep is already the instrument for it.
2. Then the remaining `$240DC2` sites and D7's gauges.
3. The animation-object execution engine is its own wave, and the way in is the node code
   pointers at `$24627A` rather than the chain root.
