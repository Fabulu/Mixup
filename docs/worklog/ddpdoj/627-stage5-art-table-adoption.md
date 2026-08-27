# W627: visible late-game art and exact table adoption

Status: **green**. The unfiltered W576, W584, and W627 affected set passed 22/22 with zero failures. The route-identity reconstruction selection passed 14/14; fourteen unrelated cases were deliberately excluded by test-name filters.

## Visible art scope

W627 closes the requested late-game presentation scope with all 63 distinct newly required sprite streams available in both packaged and asset-free geometry. The draw-path gate separately covers all 68 type `$05` rotation streams at `$269E48`, `$269EC8`, and `$269BB6`, plus all 68 late Stage 5 helicopter angle and animation streams at `$272C7A`, `$272CFA`, and `$269246`. Every tile in all 252 Stage 5 columns resolves through packaged shard 11. Hibachi A2 object 18 now selects all sixteen legal art longwords from its exact data table and emits the cartridge register-request shape.

## Retained ending assets

The same full-bundle regeneration deliberately retains W626's complete horizontal and vertical ending fonts, six cartridge-derived name-grid streams, name-entry furniture, and `$C2C0..$C2C5` TX panel segment. These additive post-Stage-5 presentation assets rebase the generated boot stream map and TX slots atomically with W627. The separate bounded W626 lifecycle harness remains outside this commit and is not counted in W627's green result.

## Exact table adoption

The only new cartridge window is disjoint `$2A4E16 + $40`. The live table moves from 942 windows, 457,067 declared bytes, 77 overlaps, and SHA-256 `02c3aea71c84407cdb17bfa454ddc3abac4a62171ec59c627f4d99f3cb9f439e` to 943 windows, 457,131 bytes, 77 overlaps, and SHA-256 `2d6a42d04b0dbd40119cda75b775b53fd7518ac99223bab57305ec3623221c95`.

`tableBeforeW627()` removes only that exact additive shape before older reconstruction helpers run. W590, W595, and W619 reconstructed table identities therefore remain unchanged. W576 and W584 now distinguish the current W627 table, the prior W623 table, and stored checkpoint provenance. No checkpoint payload, route periodic identity, terminal RAM or Game hash, topology, cadence, seed identity, or historical worklog row changed.

## Focused verification

W576/W584 metadata and checkpoint migrations passed 4/4, W627 art and table checks passed 5/5, the W590 checkpoint continuation passed 1/1, W595 reconstruction passed 1/1, and W619 offline fixture, mutation, and static closure checks passed 3/3. `python games/ddpdoj/tools/export-tables.py --verify` reported 943 windows and 457,131 bytes with `VERIFY OK`.

The long W595 fresh route and four W619 fresh routes were intentionally deferred for independent verification. No directory-wide suite or six-route replay was run, and no checkpoint was rewritten.
