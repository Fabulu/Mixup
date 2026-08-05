# Legal notice

**Short version: this repository contains no material owned by Sunsoft, Konami
or Cave, and you need your own copy of each game to build or run anything.**

## Three games, three rights holders

| game | machine | rights holder |
|---|---|---|
| *Batman: Return of the Joker* (1992) | Game Boy | Sunsoft |
| *Gradius* (1986) | NES | Konami |
| *DoDonPachi DaiOuJou (Black Label)* (2002) | IGS PGM arcade | Cave / AMI |

Everything below applies to all three unless it names one.

## What is here

The JavaScript ports, the extraction and verification tooling, the tests and the
documentation. All of it is original work, MIT licensed - see `LICENSE`.

## What is deliberately not here

No ROM image, for any of the three. No disassembly listing. No extracted
graphics, level maps, metasprites, sprite tables, sound data or manifests. No
built `dist/`. `.gitignore` enforces this per game - `games/<id>/assets/`,
`games/<id>/rip/` and the ROM files themselves - and it is checked rather than
assumed: `tools/verify_assets.py`, `games/gradius/tools/verify_assets.py` and
the gates that consume them all operate on files that only exist after *you*
run an exporter against *your* own copy.

## The publish guard

The same rule is enforced on anything we *publish*, not only on what we commit.
`tools/build-dist.mjs` reads every ROM in the repo root **and** every ROM a game
has extracted into `games/<id>/rip/rom/` - 42 MiB of arcade mask ROM, once
DaiOuJou joined - and refuses to build a site containing a file that appears
byte-for-byte inside one. It looks *inside* compressed files: a `.gz` is
inflated and the decompressed body is checked too, because gzip bytes never
appear in a ROM whatever they hold, and a planted leak once passed as "clean"
through exactly that hole.

Three files are dropped outright and never reach `dist/` at all: `prg.bin`,
`chr.bin` and `prg.asm`, which the Gradius exporter leaves behind and which
together are the whole cartridge. The site never fetches them.

**There is no blanket allowlist, and this is the part to read carefully.** The
old one (`SHIPPED_ANYWAY`, a mechanism anyone could widen with one line) is
gone. What exists instead is `PUBLISH_VERBATIM`: an enumerated list, five
entries at the time of writing, each carrying its own written reason, each
printed on every single build rather than folded into a count. Those five files
**are** verbatim cartridge data and **are** served by the project's own
deployment, by an explicit decision of the repository's owner about their own
site:

- `games/batman/assets/player.tiles.bin` - 6,974 B of Batman's animation tile
  pool, without which the port cannot draw its protagonist;
- four DaiOuJou sprite colour shards (enemy body art and the death explosion),
  verbatim only because those particular tables' streams happen to be
  *consecutive* in the colour ROM. The guard is testing packing order, not
  provenance; the shard that has shipped since wave 7 is the same ROM's bytes
  and is not flagged because its streams are scattered. The fix that would
  retire all four lines is decoding the colour half rather than copying it, and
  it is written up as a wave of work, not a line.

So: **a published build carries derived tables and, for those five files, real
cartridge bytes.** The repository does not, and that is the distinction the
owner drew - the live site is their own deployment of games they own; the repo
is public source anyone clones. `tools/make-placeholder-tiles.mjs` and the
`SUBSTITUTE` mechanism it feeds are still there, working, and deliberately
empty: they are the worked example for the next asset where drawing an original
replacement *is* the right answer.

None of that changes what is committed here. Nothing ROM-derived is in this
repository, on any path, for any of the three games.

## Regenerating everything derived

From ROMs **you** legally own, at the repo root:

```sh
# Batman - your own copy, named exactly:
#   Batman - Return of the Joker (USA, Europe).gb
python tools/export_assets.py     # -> games/batman/assets/
python tools/gen_tunables.py      # -> games/batman/src/tunables.js

# Gradius - "Gradius (USA).nes"
python games/gradius/tools/export_assets.py

# DoDonPachi DaiOuJou - the ddpdojblk MAME set
python games/ddpdoj/tools/export-tables.py
node   games/ddpdoj/tools/export-web.mjs
```

## What this project is, legally speaking

It is a hand translation of copyrighted games into a different language, in the
same tradition as the various console decompilation projects. That places it in
the same grey area they occupy: the *ports* are our own writing, but they were
written by reading Sunsoft's, Konami's and Cave's programs and they reproduce
those programs' behaviour.

We are not lawyers and this is not legal advice. What we can state plainly is
what we have actually done:

- nothing owned by Sunsoft, Konami or Cave is committed to this repository or
  distributed by it;
- the code cannot run without ROM images the user supplies;
- no attempt is made to substitute for buying the games, and no ROM source is
  linked.

If you represent a rights holder and want something changed, open an issue or
email the address in the commit history and we will engage in good faith.

## The copies this was built against

- **Batman** - the No-Intro copy, CRC `5124bbec`, SHA-1
  `345a332175f58304f91111a13b770662e5ea92c3`.
- **Gradius** - SHA-1 `92645fe142861c3d3fda209bb906ad2b0e353988`.
- **DoDonPachi DaiOuJou** - the `ddpdojblk` MAME set; the `maincpu` region is
  6 MiB and its FNV-64 is recorded in `games/ddpdoj/game.json`.

Other dumps of the same releases should work. Each game's `game.json` carries a
full identity block, and the exporters - plus `tools/gen_tunables.py --check`
for Batman - will tell you loudly if the bytes are not where they are expected,
so a differently-dumped copy announces itself instead of silently diverging.
