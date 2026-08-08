# W161 chain presentation closure

Status: DONE

Scope: Wave 160A presentation closure, covering transparent TX fallback,
complete table-derived TX glyph exports, chain-bar bucket streams, combo popup
digit and suffix streams, and positive rendered coverage evidence.

## Premise check and exact inventory

The W159 premise was confirmed against `maincpu.bin` and the sprite mask ROM:

- The chain bar reads the two pointers at `$28809E`, then the 56 and 90 word
  tables at `$2880A6` and `$28811A`, with caps from `$287DF0` and tile base
  `$1CC4A0`. Their union is 32 unique streams, exactly
  `$1CC4A0 + n*$44` for n 0 through 31, ending at `$1CCD1C`.
- Popup early digits read four pointers from `$2856D4`, then ten longwords
  from each pointed block `$2856E4`, `$28570C`, `$285734`, `$28575C`. This is
  40 unique streams, `$1C8F58` through `$1C9744`, stride `$34`.
- Popup late digits read ten words from `$28567C` as offsets from both
  `$1C9778` and `$1C9980`. This is 20 unique streams, ten per base, stride
  `$34`.
- Popup suffixes read all 12 longwords at `$285784`, the descending stream
  family `$1CC34C` through `$1CC060`, stride `-$44`.
- Each of those 104 addresses was accepted by `streamExtent` as a valid
  cartridge stream. They are exported into deferred sprite shard 17 (the
  existing boss tail) so the historical 0..17 fetch-order contract remains
  intact.

The complete table-derived TX inventory was also pinned before the pause:

- Chain high-water uses all 40 longwords at `$287FFE`, four ten-digit
  sub-tables selected by `$286040`.
- Credit suffix and digit families are `$287F7A` (3), `$287F86` (10),
  `$287FAE` (10), and `$287FD6` (10).
- Lives uses four longwords at `$2881E2`; hyper stock uses six reachable
  longwords at `$2883E6`.
- Score digits are the complete `$C030..$C03F` family written by `$2843A8`.
- Fixed live text values included the panel, chain label, bomb, and active
  hyper values from the existing HUD immediates.

## Work performed

The attempted implementation changed only these two tracked files, and they
must remain at HEAD while sound is reopened:

- `src/web/assets.js`: change missing TX fallback from pen 0 to authentic
  transparent pen 15.
- `tools/export-web.mjs`: derive and harvest into deferred shard 17
  the 32 bar, 40 early popup digit, 20 late popup digit, and 12 popup suffix
  streams from the ROM tables; add complete table-derived TX families and
  score glyphs; publish TX source metadata in the ignored manifest.

`export-tables.py` and the modified exporter both ran successfully. The output
asset bundle was regenerated in ignored `games/ddpdoj/assets/`; the bundle
reported 104 new HUD stream entries in shard 17 and the pre-existing source
coverage remained intact. No gameplay, grantor, hyper lifecycle, bee, bomb,
replay, or tooltip logic was changed.

The TX exporter now adds the complete ROM families: `$287F7A` (3), `$287F86`
(10), `$287FAE` (10), `$287FD6` (10), `$287FFE` (40 high-water glyph
longwords), `$2881E2` (4 lives), `$2883E6` (6 hyper-stock), `$C030..$C03F`
(score), and the five fixed live HUD words. The resulting static inventory is
103 unique TX tile numbers; the manifest records each table source.

The positive asset fixture loads all 18 sprite shards, asserts missing==0 for
the complete TX inventory, 32 bar streams, 60 popup digit streams, 12 suffix
streams, and renders every static family. It records 32 distinct bar hashes,
6,304 bar pixels, and 17,474 popup/suffix pixels. `--break-audit` is a
deliberate RED control.

## Verification completed

The following were not completed before the sound preemption:

- W159 static and capture contracts: PASS.
- Positive asset fixture: PASS; RED `--break-audit`: FAIL as required.
- Focused W161 suite: 2/2 PASS, 0 skipped; pen-0 mutation: FAIL as required.
- Full DOJ suite: 1,407/1,407 PASS, 0 skipped.
- Web gate: PASS; bundle gate: 15,955,968/15,955,968 pixels identical.
- Publish dry gate: PASS (`node tools/publish.mjs --only ddpdoj --dry`, built and
  gated, not deployed).

## Handoff

The source/exporter diff is complete at HEAD 6101b97 plus W161. Ignored assets
were regenerated from the ROM, including `manifest.gfx.tx.sources` and the
104 static HUD stream entries. Only the exact W161 files are to be committed;
the three user c1 scripts remain untracked and must not be staged. Run the
required publish dry command, then private-index commit and push `origin/main`.
