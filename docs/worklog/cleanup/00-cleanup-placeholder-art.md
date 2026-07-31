# Get verbatim cartridge graphics out of the published build
status: DONE
wave: 00   role: cleanup   started: 2026-07-29

## The task, as I understood it

`games/batman/assets/player.tiles.bin` (6974 B, the player's animation tile pool
from bank 2) was the one file allowlisted through the `dist/` ROM-leak guard via
`SHIPPED_ANYWAY`. `src/assets.js:82` fetches it, so it has been served publicly
since the first deploy. Build ORIGINAL placeholder art of the same length, tile
count and indexing; ship that; delete the allowlist entry; leave the LOCAL tree
on the real cartridge tiles so the oracle and pixeldiff still measure something.

## Format facts I MEASURED

Off `games/batman/assets/manifest.json` and `manifest.player.anims`, not quoted
from a doc:

```
poolBytes 6974   manifest tilePoolBytes 6974
anims 31   distinct tile offsets 275   (31 x 3 x 4 = 372 slots)
min offset 0   max 4384   max+16 4400   all offsets % 16 == 0
=> 275 tiles, contiguous 0..4384. Bytes 4400..6974 (2574 B) are referenced
   by NOTHING the port reads. The exporter's end pointer covers more than the
   animation table uses, and we were publishing that dead tail too.
distinct columns 93 of 93   (every 3x4 column of the table is unique)
offsets used at more than one (col,row) position: 23 of 275
offset 4384 alone is used at SIX positions: 0:3 2:0 0:0 2:3 1:0 2:1
```

On-screen layout, read off `metasprites.table1[1]` and
`src/render/metasprite.js:196` (`objTiles[col*4 + t]`): column 0 at dx -12,
column 1 at -4, column 2 at +4; within a column t = 0..3 top to bottom (dy -16,
-8, 0, +8). So one anim's 12 tiles are a 24x32 image, 3 wide and 4 tall. DMG
2bpp, 16 B/tile, low-plane byte then high-plane byte per row, bit 7 leftmost.

## What I built

`tools/make-placeholder-tiles.mjs` — draws a blocky robot placeholder: head with
a right-offset visor, shoulders, torso with a right-pointing chevron, belt,
hips, two arms and two legs, plus the **anim id in binary along the very top
pixel row** so you can tell which pose the game is showing once the cartridge
art is gone. Six leg poses x six arm poses = 36 combinations for 31 anims, so
every pose is distinguishable. Exports `makePlaceholderPool(manifest)` and
`drawFigure(anim)`; CLI writes the .bin and, with `--png`, a contact sheet
decoded back OUT of the pool through the manifest's own offsets.

It never opens `player.tiles.bin` and never opens a ROM. It reads only
`manifest.player.tilePoolBytes` and `manifest.player.anims` — the INDEX, i.e.
the machine's addressing scheme. Every pixel comes from the constants in the
file.

Two things fall out of the shared-slot structure and are handled explicitly:

* An offset used at >= 3 different (col,row) positions can only be the blank
  tile — nothing sits at a head position and a foot position at once. Exactly
  one offset qualifies (4384). It is emitted empty. **Inferred from the index,
  not from pixels.**
* An offset shared by several anims at the same position takes the art of the
  first anim that claims it. Measured foreign-tile counts per anim under that
  rule: most anims 0-3 of 12; anims 13/14/25/26 nine; anims 16 and 24 all
  twelve (they are pure duplicates of earlier poses in the cartridge's table).

## The design decision

**Substitute at the copy, in `build-dist.mjs`; do not touch `assets/` or
`src/`.**

```js
const SUBSTITUTE = new Map([
  ['games/batman/assets/player.tiles.bin', () => makePlaceholderPool(manifest)],
]);
```

Rejected alternatives and why:

* *Write the placeholder into `assets/` and let everything read it.* This kills
  the project. `regress.mjs`, `pixeldiff.mjs` and ~40 oracle harnesses read
  `games/batman/assets/` directly and diff against the cartridge frame by frame;
  a placeholder there makes every pixel comparison meaningless while still
  reporting a number.
* *A build flag in `src/assets.js` choosing a file by hostname.* Puts a
  publish-time concern in game code and gives the browser two code paths to be
  wrong about.
* *Keep the allowlist and add the placeholder next to it.* An allowlist is a
  hole anyone can widen with one line and a plausible reason. It had exactly one
  entry and that entry is the whole problem this task exists for.

So `SHIPPED_ANYWAY` and its `.has()` check are **deleted outright**, not
emptied — the identifier survives only inside the comment that explains its
removal (`grep -n SHIPPED_ANYWAY tools/build-dist.mjs` -> line 56, a comment).
The guard now has no bypass at all, and the refusal message tells the next
person the three real answers (drop an intermediate / fix the exporter / draw a
substitute) instead of offering them a list to add to.

`build-dist` also asserts the substitute's length equals the source's, because a
pool of the wrong length does not throw anywhere: it draws a wrong picture in a
browser and nothing else notices.

## What I MEASURED

### The guard, seen RED and GREEN on this exact file

With the substitution key disabled (i.e. the old behaviour minus the allowlist):

```
REFUSING TO BUILD: dist/ contains verbatim cartridge data.
  games\batman\assets\player.tiles.bin  (6974 B, verbatim inside Batman - Return of the Joker (USA, Europe).gb)
exit=1
```

Restored:

```
substituted: games/batman/assets/player.tiles.bin  (6974 B of original placeholder art)
rom-leak guard: 112 files checked against 2 ROM(s) [Batman - Return of the Joker (USA, Europe).gb, Gradius (USA).nes] -- clean, no allowlist
dist/ built: 115 files, 1485 KB
exit=0
```

### The shipped file is not a slice of anything

```
shipped bytes      : 6974   local bytes: 6974
shipped == local   : false
shipped in .gb     : false
shipped in .nes    : false
local   in .gb     : true          <- what we used to publish
bytes differing    : 6261 / 6974  89.78%
longest shipped run found in .gb : 50 B   (coincidental zero/repeat runs)
```

### Nothing local moved

```
node tools/oracle/pixeldiff.mjs
  before: 73 frames, 66894 wrong pixels, 96.023% mean match
  after : 73 frames, 66894 wrong pixels, 96.023% mean match

node tools/test-all.mjs
  before: ALL GREEN - 27/27 stage(s) passed, 0 skipped
  after : ALL GREEN - 27/27 stage(s) passed, 0 skipped

node --test games/batman/tests/   ->  # tests 739  # pass 739  # fail 0  # skipped 0
```

SAVEPOINT.md said "728 unit tests" in five places. I added 10, so the old
number was already stale by one. It now says 739 and "33 test files", both
measured.

### I looked at the art

`node tools/make-placeholder-tiles.mjs --png rip/placeholder/sheet.png` and a
10x zoom of anims 0,1,4,6,12,18,24,30 decoded back out of the pool. Read both
images. A blocky green robot: head + visor, chest chevron, belt, separated legs,
light hands and feet; arms out / up / reaching, legs standing / striding /
crouching / crossed; the anim-id ticks visible above the head. Legible, clearly
a placeholder, and nothing like Sunsoft's Batman. First pass had both legs
merged into one dark column when standing — hips moved to x10/x13 so the 2px
brush leaves a 1px gap. Some poses show a borrowed leg or a missing head; that
is the cartridge's own tile sharing, documented above, not a rendering fault.

### THE MOST VALUABLE FINDING: three deliberate breaks PASSED

`games/batman/tests/placeholder-tiles.test.js`, 10 checks. I broke each thing
they guard and watched. First round:

```
# pass 8  # fail 2   <- pool one byte long
# pass 9  # fail 1   <- bounds check removed
# pass 7  # fail 3   <- art perturbed after drawing (t[0] ^= 0x5A)
# pass 10 # fail 0   <- blank-slot rule loosened from >=3 to >=4      *** GREEN
# pass 9  # fail 1   <- last anim wins instead of first
# pass 7  # fail 3   <- drawFigure() returns an empty grid
# pass 10 # fail 0   <- legs pinned to one pose for every anim        *** GREEN
# pass 10 # fail 0   <- arms pinned to one pose for every anim        *** GREEN
# pass 9  # fail 1   <- badge bit order reversed
# pass 9  # fail 1   <- tail left zero-filled
```

Both green-through-a-break cases were the same shape — *the check reached the
code and interrogated none of its parameters*:

1. **"a shared slot is emitted blank"** asserted blankness at anim 0's
   (col 0, row 0) — the top-left corner, which the figure never covers. That
   slot is blank whether the rule fires or not. Fixed to use anim 0's HEAD, and
   the test now first asserts the slot it is about to check is non-empty art, so
   it cannot go vacuous again.
2. **"poses differ from one another"** hashed all 12 tiles including the
   anim-id badge. The badge is unique per anim by construction, so 31 identical
   figures wearing 31 different numbers passed. Fixed to mask out pixel row 0 of
   the head tile before hashing. The neighbouring "first anim claims a shared
   slot" test got the same treatment: it now asserts the borrowed column is not
   all-empty.

Second round, after the fixes:

```
# pass 10 # fail 0   <- no break (baseline)
# pass 9  # fail 1   <- blank-slot rule loosened      (now RED)
# pass 9  # fail 1   <- legs pinned                   (now RED)
# pass 9  # fail 1   <- arms pinned                   (now RED)
# pass 9  # fail 1   <- badge removed entirely        (now RED)
# pass 10 # fail 0   <- restored
```

Generator and `build-dist` were restored from byte-identical backups after each
break (`diff` clean, verified — not `git checkout`, the tree was dirty).

The test file is deliberately ROM-FREE, matching `tests/helpers.js`'s contract
that the whole suite runs without `assets/`: it drives the generator with a
synthetic manifest of the same shape. The "is it a ROM slice" question is
answered by `build-dist`'s guard, which is where the ROMs are.

## The sweep: what else is shippable-but-verbatim

Every file >= 1 KB in the tree (2160 of them, excluding `node_modules`, `.git`,
`dist`) tested for being a byte-identical contiguous slice of either ROM:

| file | size | in INCLUDE? | reaches dist? |
|---|---|---|---|
| `games/batman/assets/player.tiles.bin` | 6974 | yes | **no — substituted** |
| `games/gradius/assets/chr/bank0..3.bin` | 8192 x4 | yes | no — `/^bank\d+\.bin$/` filter in `copy()` |
| `games/gradius/assets/chr.bin` | 32768 | yes | no — `NEVER_SHIP` |
| `games/gradius/assets/prg.bin` | 32768 | yes | no — `NEVER_SHIP` |
| `games/gradius/tools/oracle/out/video/*/chr.bin` | 8192 x16 | no | no — `tools/` is never copied |
| the two ROMs themselves | — | no | no |

Nothing else in the repo is a verbatim slice. I also checked the 9 `dist` files
under 1 KB (below the guard's size floor) against both ROMs by hand: none
matches.

So the four Gradius `bank*.bin` are the remaining "shippable but for a basename
filter" case: they live inside `games/gradius/assets/`, which IS in `INCLUDE`,
and only a regex on the basename keeps them out. That is acceptable **because
the guard is downstream of the filter** — delete the regex and the build refuses
rather than leaking. Verified by reading `build-dist.mjs`: the walk over `dist/`
happens after every `copy()`.

`games/ddpdoj` is not in `GAMES` and is not published at all.

## What I could not do, and why

* **`levels/NN.vram.bin`** (8192 B x 14) is a BUILT image — the result of
  replaying each level's resource loads — so it is not verbatim (measured: not
  found in either ROM) and nothing here removes it. It is nevertheless the
  cartridge's entire background tileset, rearranged. **This is the biggest
  remaining pile of cartridge pixels in a published build and I did not touch
  it.** Replacing it needs real level art, not a robot; whoever continues this
  line should start there and should expect a much larger job than this one.
* **`assets/manifest.json` still carries ROM-derived tables and is still
  published** — level metatiles, metasprite records, the sine table, base64
  enemy/object spawn blobs. None is a verbatim slice (the guard clears it), so
  it is outside "verbatim cartridge graphics". It is *derived data*, a different
  and larger question whose answer the SAVEPOINT already names: browser-side
  extraction from a user-supplied ROM.
* The placeholder inherits the cartridge's tile *sharing*, so a handful of poses
  borrow a tile from a neighbouring pose. Cosmetic, documented in the
  generator's header, not worth redesigning the pool layout for.

## If someone picks this up cold

* `node tools/make-placeholder-tiles.mjs --png rip/placeholder/sheet.png` draws
  the 31 poses. Look at it before changing `LEGS`, `ARMS` or `drawFigure`.
* The local tree is **unchanged**: `games/batman/assets/player.tiles.bin` is
  still the cartridge's bytes and must stay that way, or every pixel-level
  oracle stops measuring anything. The swap happens only inside
  `tools/build-dist.mjs`.
* If `pixeldiff.mjs` ever reports something other than 73 frames / 66894 wrong
  px / 96.023%, the substitution has leaked into the dev tree. That is a bug in
  the change, not a new baseline.
* If `export_assets.py` ever changes the pool's length or the offsets in
  `manifest.player.anims`, `build-dist` fails loudly on the length assertion —
  regenerate the contact sheet and look at it.
* Do not add an allowlist back.
