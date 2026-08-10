# W230: the descriptor sweep, and the rank icons it found

Status: COMPLETE

## Scope

Docket D5 asked for one sweep instead of four guesses: something that answers
"which sprites cannot draw" mechanically. Build it, then act on what it says.

## Starting state

- W229 is committed at `8af0ac5` and the suite is green.
- Four docket items (D3, D4, D7, D8) were all "a sprite is missing" with no
  instrument behind any of them.

## Delivered

`games/ddpdoj/tools/w230descriptorsweep.mjs`. It runs the port headlessly from
`rip/web/seed.bin`, and for every frame takes the display list the port actually
builds and checks each descriptor against the bundle's own stream table. Then it
prints the display-list drop counters and the counted gaps, because a sprite can
also be absent because its PRODUCER never ran.

The oracle matters and it took two attempts. `manifest.spr.harvest` is the wrong
one: it lists the tables the exporter walked, which is a subset (boot, laser and
the shot/bullet families arrive by other paths), and it reports 393 false
positives. The right oracle is `assets/spr/streams.u32.gz` column 0, decoded the
way `src/web/assets.js` decodes it: planar, first-differenced, three columns.

### What it found

Over 900 frames of stage-1 play, exactly FIVE descriptors were drawn that the
bundle could not resolve, all consecutive entries of one table:

    $1CA36C $1CA350 $1CA334 $1CA318 $1CA2FC   <- $2882A6[0..4], descending

`$2882A6` is `hud.js`'s `rankIconP1`, eight longwords, read at `$285D64` and
`$285DC4`; `$288326` is the P2 twin. Neither had ever been harvested, so the port
enqueued a rank icon every frame and the page had nothing to draw.

Fixed in `tools/export-web.mjs`: both tables, eight entries each, into the
existing `HUD_CHAIN_SHARD`, with the same distinctness assertion the other HUD
groups carry. Sprite stream total 3958 -> 3974, exactly the sixteen. The
historical count pins in W211 through W220 and W224 move with it.

After the fix the sweep reports **zero** unresolvable descriptors bundle-wide, and
zero display-list drops.

## What this settles about the docket

D3 and D4 are NOT missing streams and NOT dropped records: every descriptor the
port draws is now in the bundle. A missing explosion means its producer is not
running. The same run's counted gaps name the real candidates, and two of them are
whole object types the port does not implement at all: dispatch entry `[11]`
`$25DBB4` (a stage-level state machine reading the stage number and the loop flag,
900 calls) and entry `[4]` `$260B30` (per side, 1800 calls). Those went into the
docket under D11, which the owner has since clarified is the stage TRANSITION
being abrupt rather than a respawn defect.

## Verification

`node games/ddpdoj/tools/w230descriptorsweep.mjs` -> 3974 of 3974 streams, 713
distinct descriptors drawn, 0 not in the bundle.

`node --test games/ddpdoj/tests/` -> 1620/1620, still green with the updated
count pins.
