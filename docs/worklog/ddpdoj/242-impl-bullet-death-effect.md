# W242: the screen clear's per-bullet effect, and why it is NOT a driver problem

Status: CORRECTION LANDED, implementation specified

## Scope

D3's remaining candidate from W230's sweep: `80 x $27F8F8`, the screen clear's
per-bullet effect, counted once per cleared bullet.

## Starting state

W241 is committed at `3eb85e9`, suite 1661/1661.

## The note was wrong, and it had been wrong since W111

`bulletdriver.js` justified allocating nothing like this:

> its only driver is `$27F95A`, type-5 call #4, UNPORTED. Allocating without a
> driver is W33's leak one level down, so this port allocates nothing.

Both halves stopped being true in W111. `runPoolADriver` IS `$27F95A`, and
`allocPoolA27F8F0` IS this allocator: `$27F8F0` computes D2 from the layer and falls
into exactly the `$8171BE` scan that `$27F8F8` enters with D1 = D2 = 0. Two entry
points, one routine -- the same shape as the three pool-C allocators in W235.

So a wave that trusted the note would have concluded a whole pool driver was missing.
That is the tenth stale premise this session and the third whose NAME or REASON was
wrong rather than merely its status.

## What actually blocks it

Narrow, and now named in the code:

- `$280B3E`, the fill, is TABLE-DRIVEN: `lea ($280E4A,PC),A3 / movea.l (A3,D0.w),A3`
  with D0 the kind as a byte offset.
- `$280E4A` is in **no exported window**, because W111 hand-transcribed the four
  kinds it measured into `IMPACT_KIND` rather than reading the cartridge's table.
- The screen clear's kind is `$81B412`, which is `$0` in the reached case, and kind
  `$0` is not one of those four.

So porting the visual pop needs a `$280E4A` window and a measured spec for kind `$0`
-- and possibly the honest alternative of making `fillGeneralImpact280B3E` read the
cartridge's table instead of a hand-written map, which would cover every kind at once
and delete four transcriptions. That is a refactor of W111's work and deserves its
own wave rather than being smuggled into this one.

## Delivered

The note, rewritten to say what is actually missing. Nothing else changed, and the
suite is unchanged at **1661/1661** -- which is the point: a note is documentation,
and documentation that names the wrong obstacle costs a future wave more than a
missing feature does.

## Why this is not "no progress"

Every one of the last eleven waves started by checking a note's premise, and nine of
them found the premise stale. The cost of that check is minutes; the cost of trusting
a wrong note is a wave spent porting something that already exists, or -- as here --
concluding that a subsystem is absent when only one table entry is.
