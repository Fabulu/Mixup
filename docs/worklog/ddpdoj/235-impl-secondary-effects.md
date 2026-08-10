# W235: the secondary explosion

Status: COMPLETE

## Scope

Docket D3, the missing explosions. W230's sweep had already proved this is not a
bundle problem -- every descriptor the port draws resolves -- so the producer had
to be missing. The sweep's own counted-gap list named the candidate: `$289AF4`,
"D0=$4 secondary", at four call sites.

## Starting state

W234 is committed at `6bd3784`, suite 1634/1634, streams 3985.

## What it turned out to be

Pool C was already modeled. `effects.js` has `POOL_C`, the `C` record map, the
allocator `$289B50` as `spawnPoolC289B50`, the driver `$289B80` as
`runPoolCDriver`, and even the collision pass `$289C54` as
`poolCCollision289C54`, all from W194.

There are THREE allocators into pool C -- `$289AF4`, `$289B22`, `$289B50` -- and
their scans are the same fourteen instructions: `moveq #$1D,D3`, the
`$813098`/`$81308C` narrow test dropping D3 to `$E`, then the `$81CDEE` walk by
`$30`. They differ only in which fill they branch to (`$289C3A`, `$289DA0`,
`$289DC8`). And the fill `$289C3A` differs from the ported `$289DC8` in exactly
one thing: the position comes from the CALLER's record, `$289C50 move.l
$2(a6),$2(a0)`, instead of from a register the caller loaded.

So this slice is a thin sibling, not a subsystem. That is the third time this
session: `$23F82A` was `emitScaled` on bucket 22 (W232), `$23EC20` was
`enqueueRegisters` on bucket 8 (W234), and now this.

## Delivered

- `spawnPoolC289AF4` in `effects.js`: reads the bucket out of the caller's own
  `$267FB8` row as a WORD at `($1f,A6)*2` (`REMAP.secondary267FB8` already named
  that table), takes the position from the caller's `($2,A6)`, and delegates to
  `spawnPoolC289B50` with its own site address so a dropped spawn is counted
  against `$289AF4` and not against `$289B50`.
- Both kind-4 call sites now spawn instead of noting: `$2688BA` in the type-`$11`
  death (behind its `$26889E btst #0,$815EA5` cap gate) and `$26821E`. Their
  setups are the same six instructions twice.
- The two kind-`$8` sites stay counted. Their template's two lists resolve to zero
  entries, so nothing about them is measured yet and porting them would be
  invention.

## Verification

`node --test games/ddpdoj/tests/w235secondary.test.js` -> 4/4: the sibling
delegating rather than copying the fill (a second copy of `$289C3A`/`$289DC8`
would drift), the position coming from the caller and the bucket from the row, the
explosion actually reaching its bucket with the template's own list entry, and a
full pool dropping the spawn with the drop counted against this allocator's
address.

Full suite -> **1634/1634**. And the evidence that matters for D3:
`w230descriptorsweep.mjs` now draws **718** distinct descriptors over the same 900
frames, up from 713, still with zero unresolvable. Five more pictures on screen.

## Two knock-ons, both honest

- `w34damage.test.js`'s type-`$11` death test swallows `Unreached` so it can run
  against a stub ROM. With the secondary ported, the death sequence gets further
  and reads the cartridge on the way, so the stub aborted before `freeEnemy`. The
  fixture now carries the five windows the spawn actually touches -- measured
  first, then pasted -- exactly as its existing comment did for the remap rows.
- The pool-C spawn draws RNG (`drawByte24311A`, `drawSigned242FDE`), so the
  headless death scenario shifted: the player now dies on 426 rather than 424, the
  first respawn resets on 497, the init runs on 498, the pods finish on 525
  (`$E0 / 8` = 28 passes), and the second and third deaths move to 767 and 1207.
  W227's, W228's and W231's live pins are re-measured, not loosened.

## Next

D3 is not finished: this is one producer of several. Re-run the sweep's
counted-gap list for the rest (`$27F8F8`'s bullet death effect is the next
candidate), and D4's stage-2 mid boss still needs its own look.
