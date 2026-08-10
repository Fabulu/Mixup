# W237: the SET-item icon row and its progress cue

Status: COMPLETE

## Scope

The `items.js` `$240DC2` call sites, first on W236's list. Five notes there said
"that text/sprite subsystem is unported", which W233 had already established was
false: `txPrint240DC2` in `hud.js` IS `$240DC2`, and W116 ported it.

## Starting state

W236 is committed at `ec6d1bf`, suite 1642/1642.

## Delivered

Three of the five sites, which are the two routines behind them:

- `$25349A` (P1) / `$2534AC` (P2), the SET-item ICON ROW. The two differ only in
  their base column (`$100` against `$F00`) and which player's TARGET byte they
  read (`$81040B` / `$81046D`). The shared tail makes the index `(target - 1) * 4`
  with a `subq.w` and two doublings, picks one of six longwords at `$2534E0`, and
  prints a three-by-twelve grid (D2 = 2, D3 = `$B`).
- `$2533C8` (P1) / `$2533D4` (P2), the PROGRESS cue: one two-cell column that
  slides as the set fills. D6 is the caller's own current set byte, and the shared
  tail `$2533E0` shifts it left NINE before adding it to the base column. P2 negates
  D6 first, which is the only other difference.

One ROM window, pinned by code rather than by a run length: `$2534E0+$18` is six
longwords and `$2534F8` is `tst.w $81B65C`, the head of the routine after it. [M]
the first words ramp `$02DE`, `$0302`, `$0326` and then saturate at `$034A`.

## Verification

`node --test games/ddpdoj/tests/w237itemhud.test.js` -> 4/4: the table's six
longwords with its window stopping at code; a completed set printing 36 cells whose
destinations all land inside the `$904000` tilemap, with the first two tiles showing
`$240DC2`'s own `$C0000000` or and `$10000` per-cell step; the cue moving by exactly
`(D6 delta) << 9`; and P2 drawing in a different column.

Full suite -> **1646/1646**.

## What the sixty calls per transition actually were

Not these. Forcing `$242952` still counts sixty `$240DC2`, and they come from
`panel2851D2` in `hud.js` -- the STAGE-CLEAR banner's PANEL, whose body the port
does not translate at all; it notes three draws (`$23FAC4`, `$240DC2`, `$286F3E`)
and steps two counters. Its twin `panel284FD2` is the BOSS banner's panel and does
the same.

So the banner TEXT is a routine of its own, `$2851D2..$2853C0`, roughly `$1EE`
bytes, and it is the next slice on D11. Its sibling `$284FD2..$2851C2` will very
likely fall out with it -- the two are deliberately kept apart in `hud.js` because
reading them as one routine with a parameter would be wrong, so expect two
transcriptions that share a shape rather than one function.

## Two sites deliberately left

The other two `$240DC2` mentions in `items.js` are inside `bcdTriple`'s neighbours
and are about the same rows from a different arm; they will fall out of the panel
slice. Nothing about them is guessed here.
