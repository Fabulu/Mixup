# W178: Stage-2 type `$92`

Status: COMPLETE

## Scope

Port the dependency-complete type `$92` family at the first chronological
unsupported stage-2 record `$232D58`, clock `$0155`, init body `$279CD0`,
handler `$279D72`, and movement index `$038`. Verify the Version-B ROM closure
and advance the controlled boot to the next honest unsupported boundary.

## Starting state

- W177 is committed, pushed, and live as build `20260809095334`.
- Stage-2 coverage is 316/332 records with 16 unknown.
- The seeded boot completes 241 records and stops at `$279CD0`.
- The protected owner `c1_*.py` files and `NUL` remain out of scope.

## ROM closure

The exact `$279CC8..$279EC2` family closure is pinned from the Version-B
image. It contains the type `$92` run-length-zero stub, init body, five palette
pairs, two-word record prototype, one 28-byte long-form sub-record prototype,
death tail, handler, two pool-B effects, and the structurally bounded 24-byte
trailer through the next local stub. The trailer is duplicated exactly at
`$27A0C8`, so it is retained as ROM evidence even though no direct call inside
the family closure reaches it.

Type `$92` occurs twice in stage 2:

- record `$232D58`, trigger `$0155`, movement index `$038`
- record `$232E10`, trigger `$0177`, movement index `$03A`

The second stream uses escape `$88 01`. That escape writes the selector high
byte, while `$81 03` writes its low byte. Init consumes the high byte into
sub-record mirror bit 6 and preserves the low byte, leaving the authentic draw
selector word `$0003`.

## Translation

- Init `$279CD0` loads both prototypes, runs the movement-position reader,
  folds the mirror selector, and installs the adjacent palette bytes.
- Handler `$279D72` ports movement, wrapped lifetime bounds, damage flag
  acknowledgement, `$0380` palette threshold, hit score, lethal branch, and
  indirect `$27829C` emission. Selector 3 resolves through `$2782A8` to
  `$23D7DA` and sprite bucket 2.
- Death posts sound `$28C2DC`, awards packed BCD `$14`, and creates the exact
  kind-`$0D` and kind-`$05` pool-B effects. Their selector remaps through
  `$278326` to bucket 8.
- The terminal tail records the authentic `$27F8F0` register request, mirrors
  only D1's low word, and frees the enemy on byte-underflow.

## Asset integration finding

The web exporter did not harvest immediate prototype streams for W177 type
`$91` or W178 type `$92`. Both are now explicitly included in sprite shard 17:

- `$235470`: 578 mask words and 5,535 pixels
- `$23624C`: 482 mask words and 6,408 pixels

The regenerated `streams.u32.gz` contains both addresses and 2,690 streams.
This closes a real rendering dependency for both families; generated assets
remain gitignored.

## Verification

- Focused W178 plus affected registry/integration/coverage set: 46 passed,
  zero failed or skipped.
- The new W178 check was demonstrated red by moving the handler registration,
  then restored green.
- Controlled stage-2 boot: 4 passed, stopping at type `$97` body `$277DE8`,
  record `$232DA8`, clock `$0162`.
- Boot prefix: 251 records consumed, 247 allocations, four authentic declines.
- Enemy coverage: 38/256 ported, 88 unknown, 130 null.
- Stage-2 coverage: 318/332 ported, 14 unknown, dynamic-minus-static zero.
- `export-tables.py`: passed with 235 windows and 273,638 bytes.
- `dojcoverage.py`: passed; static-minus-dynamic remains 304.
- `export-web.mjs`: passed; both immediate art streams are present.

## Release

- Commit `8c47ce2` contains the W178 port and current-state docs.
- Release gate: 1,497 passed, zero failed/skipped; bundle/web and ROM-leak
  checks passed.
- Published and confirmed live as build `20260809102233` at
  `https://gbtman.pages.dev/games/ddpdoj/`.
